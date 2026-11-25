#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Anqā — vidéo d'exercice par un modèle libre sur Kaggle.

Modèle : Wan 2.2 Animate 14B (licence Apache 2.0), version compressée GGUF, exécuté par ComfyUI.
Entrées (jeu de données joint) : une vidéo guide tirée de notre moteur 3D et une image du personnage.
Sorties (/kaggle/working/sorties) : le clip, la vidéo des poses détectées, une planche de contrôle,
le journal et un bilan chiffré (temps par étape, mémoire de la carte graphique).

Deux modes (variable CONFIG['mode']) :
  « sec » : sans carte graphique. Installe, lance le prétraitement pour de vrai, et fait seulement
            valider le montage complet par ComfyUI (fichiers de modèles factices). Ne consomme pas de quota.
  « gen » : avec carte graphique. Télécharge les modèles et génère les clips demandés.
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

# --------------------------------------------------------------------------------------------------
# Réglages (remplacés à l'envoi par le lanceur : ne pas modifier la ligne « CONFIG = »)
# --------------------------------------------------------------------------------------------------
CONFIG = {"mode": "sec", "taches": []}

VERSIONS = {
    "ComfyUI": ("https://github.com/comfyanonymous/ComfyUI.git", "a2103ae69d98d8ef94c150f5a472b89775eed929"),
    "ComfyUI-GGUF": ("https://github.com/city96/ComfyUI-GGUF.git", "6ea2651e7df66d7585f6ffee804b20e92fb38b8a"),
    "ComfyUI-WanAnimatePreprocess": ("https://github.com/kijai/ComfyUI-WanAnimatePreprocess.git", "0e0b6a2a555625acf4d4aefb780e27d06937132f"),
}

# (jeu, dépôt Hugging Face, chemin dans le dépôt, dossier ComfyUI, nom local, lourd ?)
# « gguf » : modèle compressé (11,5 Go, tient dans une T4). « natif » : format compressé de ComfyUI (18,4 Go),
# pris en secours si le chargeur GGUF ne s'entend pas avec cette version de ComfyUI.
MODELES = [
    ("gguf", "QuantStack/Wan2.2-Animate-14B-GGUF", "Wan2.2-Animate-14B-{quant}.gguf", "unet", "Wan2.2-Animate-14B-{quant}.gguf", True),
    ("gguf", "city96/umt5-xxl-encoder-gguf", "umt5-xxl-encoder-Q5_K_M.gguf", "text_encoders", "umt5-xxl-encoder-Q5_K_M.gguf", True),
    ("natif", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/diffusion_models/wan2.2_animate_14B_int8_convrot.safetensors", "diffusion_models", "wan2.2_animate_14B_int8_convrot.safetensors", True),
    ("natif", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors", "text_encoders", "umt5_xxl_fp8_e4m3fn_scaled.safetensors", True),
    ("base", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/vae/wan_2.1_vae.safetensors", "vae", "wan_2.1_vae.safetensors", True),
    ("base", "Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/clip_vision/clip_vision_h.safetensors", "clip_vision", "clip_vision_h.safetensors", True),
    ("base", "Kijai/WanVideo_comfy", "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors", "loras", "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors", True),
    ("relumiere", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/loras/wan2.2_animate_14B_relight_lora_bf16.safetensors", "loras", "wan2.2_animate_14B_relight_lora_bf16.safetensors", True),
    ("base", "Wan-AI/Wan2.2-Animate-14B", "process_checkpoint/det/yolov10m.onnx", "detection", "yolov10m.onnx", False),
    ("base", "JunkyByte/easy_ViTPose", "onnx/wholebody/vitpose-l-wholebody.onnx", "detection", "vitpose-l-wholebody.onnx", False),
]

NEGATIF = ("色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，"
           "多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走")

TRAVAIL = "/kaggle/working" if os.path.isdir("/kaggle/working") else os.path.abspath("travail")
SORTIES = os.path.join(TRAVAIL, "sorties")
os.makedirs(SORTIES, exist_ok=True)
JOURNAL = open(os.path.join(SORTIES, "journal.txt"), "a", encoding="utf-8")
T0 = time.time()
BILAN = {"mode": CONFIG["mode"], "etapes": [], "taches": []}
PORT = 8188
URL = f"http://127.0.0.1:{PORT}"


def dire(*a):
    ligne = f"[{time.time() - T0:7.1f} s] " + " ".join(str(x) for x in a)
    print(ligne, flush=True)
    JOURNAL.write(ligne + "\n")
    JOURNAL.flush()


def sauver_bilan():
    BILAN["duree_totale_s"] = round(time.time() - T0, 1)
    with open(os.path.join(SORTIES, "bilan.json"), "w", encoding="utf-8") as f:
        json.dump(BILAN, f, ensure_ascii=False, indent=1)


def cmd(c, verifier=True, silencieux=False, **kw):
    """Lance une commande, renvoie (code, sortie). Les sorties longues sont résumées dans le journal."""
    r = subprocess.run(c, shell=isinstance(c, str), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, **kw)
    s = (r.stdout or "").strip()
    if not silencieux or r.returncode != 0:
        dire("$", c if isinstance(c, str) else " ".join(c), "->", r.returncode)
        if s:
            lignes = s.splitlines()
            for l in (lignes if len(lignes) <= 40 else lignes[:8] + ["   […]"] + lignes[-25:]):
                dire("   ", l[:400])
    if verifier and r.returncode != 0:
        raise RuntimeError(f"échec de la commande : {c}")
    return r.returncode, s


class Etape:
    def __init__(self, nom):
        self.nom = nom

    def __enter__(self):
        self.t = time.time()
        dire("=== début :", self.nom)
        return self

    def __exit__(self, typ, val, tb):
        d = round(time.time() - self.t, 1)
        BILAN["etapes"].append({"nom": self.nom, "duree_s": d, "ok": typ is None})
        dire("=== fin :", self.nom, f"({d} s)", "" if typ is None else f"ERREUR {typ.__name__}: {val}")
        sauver_bilan()
        return False


# --------------------------------------------------------------------------------------------------
# 1. Diagnostic de la machine
# --------------------------------------------------------------------------------------------------
def diagnostic():
    cmd("nvidia-smi --query-gpu=index,name,memory.total,memory.used --format=csv", verifier=False)
    cmd("df -h / /kaggle/working /kaggle/temp /tmp 2>/dev/null", verifier=False)
    cmd("free -g | head -2; nproc", verifier=False)
    cmd([sys.executable, "-c", "import sys, torch; print(sys.version.split()[0], 'torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.device_count())"], verifier=False)
    cmd("ls /kaggle/input 2>/dev/null; find /kaggle/input -maxdepth 3 -type f 2>/dev/null | head -40", verifier=False)
    code, s = cmd("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", verifier=False, silencieux=True)
    BILAN["cartes"] = s.splitlines() if code == 0 else []


def base():
    for d in ("/kaggle/temp", "/tmp"):
        try:
            os.makedirs(os.path.join(d, "anqa"), exist_ok=True)
            return os.path.join(d, "anqa")
        except OSError:
            continue
    return os.path.abspath("anqa")


# --------------------------------------------------------------------------------------------------
# 2. Installation (versions figées)
# --------------------------------------------------------------------------------------------------
def cloner(nom, cible):
    url, sha = VERSIONS[nom]
    if os.path.isdir(os.path.join(cible, ".git")):
        return
    os.makedirs(cible, exist_ok=True)
    cmd(f"git -C {cible} init -q && git -C {cible} remote add origin {url} && git -C {cible} fetch -q --depth 1 origin {sha} && git -C {cible} checkout -q FETCH_HEAD", silencieux=True)
    dire("cloné", nom, sha[:10])


def installer(racine):
    comfy = os.path.join(racine, "ComfyUI")
    cloner("ComfyUI", comfy)
    for ext in ("ComfyUI-GGUF", "ComfyUI-WanAnimatePreprocess"):
        cloner(ext, os.path.join(comfy, "custom_nodes", ext))
    # torch est déjà dans l'image Kaggle (version CUDA) : on ne le réinstalle pas.
    req = [l.strip() for l in open(os.path.join(comfy, "requirements.txt")) if l.strip() and not l.startswith("#")]
    req = [l for l in req if l.split("=")[0].split(">")[0].split("<")[0].strip().lower() not in ("torch", "torchvision", "torchaudio")]
    plus = ["gguf", "onnx", "opencv-python-headless", "matplotlib", "huggingface_hub"]
    if subprocess.run([sys.executable, "-c", "import onnxruntime"], capture_output=True).returncode != 0:
        plus.append("onnxruntime")
    open(os.path.join(racine, "req.txt"), "w").write("\n".join(req + plus) + "\n")
    cmd([sys.executable, "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", os.path.join(racine, "req.txt")])
    cmd([sys.executable, "-c", "import torch, onnxruntime, gguf, cv2, av; print('torch', torch.__version__, '| onnxruntime', onnxruntime.__version__, onnxruntime.get_available_providers())"], verifier=False)
    return comfy


# --------------------------------------------------------------------------------------------------
# 3. Modèles
# --------------------------------------------------------------------------------------------------
def telecharger(comfy, quant, reel, jeux=("base", "gguf")):
    """Télécharge les jeux demandés. reel=False : les fichiers lourds sont remplacés par des fichiers vides,
    qui suffisent à ComfyUI pour valider un montage (un fichier vide est remplacé au prochain appel réel)."""
    os.environ.setdefault("HF_XET_HIGH_PERFORMANCE", "1")
    from huggingface_hub import hf_hub_download
    total = 0
    for jeu, depot, chemin, dossier, nom, lourd in MODELES:
        if jeu not in jeux:
            continue
        chemin, nom = chemin.format(quant=quant), nom.format(quant=quant)
        cible_dir = os.path.join(comfy, "models", dossier)
        os.makedirs(cible_dir, exist_ok=True)
        cible = os.path.join(cible_dir, nom)
        if os.path.exists(cible) and os.path.getsize(cible) > 0:
            continue
        if lourd and not reel:
            if not os.path.lexists(cible):
                open(cible, "wb").close()      # fichier factice : sert seulement à la validation du montage
                dire("factice :", dossier + "/" + nom)
            continue
        t = time.time()
        for essai in range(4):
            try:
                p = hf_hub_download(depot, chemin, local_dir=os.path.join(comfy, "models", "_hf", depot.replace("/", "__")))
                break
            except Exception as e:      # coupure réseau : on réessaie
                dire("téléchargement à refaire :", depot, chemin, type(e).__name__, str(e)[:200])
                time.sleep(10 * (essai + 1))
        else:
            raise RuntimeError("téléchargement impossible : " + depot + "/" + chemin)
        if os.path.lexists(cible):
            os.remove(cible)
        os.symlink(os.path.realpath(p), cible)
        taille = os.path.getsize(cible) / 1e9
        total += taille
        dire(f"modèle {dossier}/{nom} : {taille:.2f} Go en {time.time() - t:.0f} s")
    # le chargeur GGUF lit « unet » ; ComfyUI récent lit aussi « diffusion_models » et « clip »
    for src, dst in (("unet", "diffusion_models"), ("text_encoders", "clip")):
        for f in glob.glob(os.path.join(comfy, "models", src, "*")):
            d = os.path.join(comfy, "models", dst, os.path.basename(f))
            os.makedirs(os.path.dirname(d), exist_ok=True)
            if os.path.islink(d) and os.path.realpath(d) != os.path.realpath(f):
                os.remove(d)
            if not os.path.lexists(d) and os.path.isfile(f):
                os.symlink(os.path.realpath(f), d)
    BILAN["modeles_go"] = round(BILAN.get("modeles_go", 0) + total, 2)
    cmd("df -h / /kaggle/temp /tmp 2>/dev/null | sort -u", verifier=False)


# --------------------------------------------------------------------------------------------------
# 4. Serveur ComfyUI
# --------------------------------------------------------------------------------------------------
SERVEUR = None
ETAT = {}


def http(chemin, corps=None, delai=30):
    req = urllib.request.Request(URL + chemin, data=None if corps is None else json.dumps(corps).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=delai) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        brut = e.read()
        try:
            return e.code, json.loads(brut)
        except Exception:
            return e.code, {"brut": brut[:2000].decode("utf-8", "replace")}


def demarrer(comfy, gpu):
    global SERVEUR
    args = [sys.executable, "main.py", "--listen", "127.0.0.1", "--port", str(PORT), "--disable-auto-launch"]
    args += ["--cuda-device", "0"] if gpu else ["--cpu"]
    args += CONFIG.get("options_comfy", [])
    journal = open(os.path.join(SORTIES, "comfyui.log"), "w")
    SERVEUR = subprocess.Popen(args, cwd=comfy, stdout=journal, stderr=subprocess.STDOUT)
    for _ in range(150):
        time.sleep(2)
        if SERVEUR.poll() is not None:
            break
        try:
            code, s = http("/system_stats", delai=3)
            if code == 200:
                dire("ComfyUI prêt :", json.dumps(s.get("system", {}))[:300], "|", json.dumps(s.get("devices", []))[:400])
                return
        except Exception:
            pass
    cmd(f"tail -60 {os.path.join(SORTIES, 'comfyui.log')}", verifier=False)
    raise RuntimeError("ComfyUI n'a pas démarré")


def decrire_noeuds(noms):
    """Écrit dans le journal les entrées réelles de chaque nœud utilisé (utile si une validation échoue)."""
    for n in noms:
        code, s = http("/object_info/" + n)
        if code != 200 or n not in s:
            dire("NŒUD ABSENT :", n, code)
            BILAN.setdefault("noeuds_absents", []).append(n)
            continue
        ent = s[n].get("input", {})
        def court(v):
            return str(v[0])[:60] if not isinstance(v[0], list) else f"choix({len(v[0])}) {str(v[0][:4])[:90]}"
        dire("nœud", n, "| requis :", {k: court(v) for k, v in ent.get("required", {}).items()}, "| optionnel :", {k: court(v) for k, v in ent.get("optional", {}).items()}, "| sorties :", s[n].get("output"))


class Memoire(threading.Thread):
    """Relève la mémoire utilisée de la carte graphique toutes les 3 secondes."""
    def __init__(self):
        super().__init__(daemon=True)
        self.maxi, self.actif = 0, True

    def run(self):
        while self.actif:
            try:
                s = subprocess.run("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits", shell=True, capture_output=True, text=True, timeout=10).stdout
                self.maxi = max([self.maxi] + [int(x) for x in s.split() if x.strip().isdigit()])
            except Exception:
                pass
            time.sleep(3)


def lancer(graphe, nom, attendre=True, delai_max=6 * 3600):
    """Soumet un montage. Renvoie (ok, détail)."""
    code, rep = http("/prompt", {"prompt": graphe, "client_id": uuid.uuid4().hex})
    if code != 200:
        dire("MONTAGE REFUSÉ", nom, code, json.dumps(rep, ensure_ascii=False)[:6000])
        return False, {"validation": rep}
    pid = rep.get("prompt_id")
    dire("montage accepté", nom, pid, "| erreurs de nœuds :", json.dumps(rep.get("node_errors", {}))[:800])
    if not attendre:
        return True, {"prompt_id": pid}
    t = time.time()
    dernier = 0
    while time.time() - t < delai_max:
        time.sleep(4)
        if SERVEUR.poll() is not None:
            cmd(f"tail -80 {os.path.join(SORTIES, 'comfyui.log')}", verifier=False)
            return False, {"erreur": "ComfyUI s'est arrêté (mémoire insuffisante ?)", "code": SERVEUR.returncode}
        code, h = http("/history/" + pid)
        if code == 200 and pid in h:
            st = h[pid].get("status", {})
            if st.get("completed") or st.get("status_str") in ("success", "error"):
                ok = st.get("status_str") == "success"
                if not ok:
                    dire("EXÉCUTION EN ERREUR", nom, json.dumps(st, ensure_ascii=False)[:5000])
                return ok, {"duree_s": round(time.time() - t, 1), "sorties": h[pid].get("outputs", {}), "etat": st.get("status_str")}
        if time.time() - dernier > 120:
            dernier = time.time()
            cmd(f"tail -c 400 {os.path.join(SORTIES, 'comfyui.log')} | tr '\\r' '\\n' | tail -2", verifier=False, silencieux=False)
    return False, {"erreur": "délai dépassé"}


# --------------------------------------------------------------------------------------------------
# 5. Montages
# --------------------------------------------------------------------------------------------------
FOURNISSEUR_ONNX = "CPUExecutionProvider"


def choisir_fournisseur(gpu):
    """Détection de pose sur la carte graphique quand onnxruntime le permet (sinon processeur, plus lent)."""
    global FOURNISSEUR_ONNX
    code, s = cmd([sys.executable, "-c", "import onnxruntime; print(','.join(onnxruntime.get_available_providers()))"], verifier=False, silencieux=True)
    if gpu and code == 0 and "CUDAExecutionProvider" in s:
        FOURNISSEUR_ONNX = "CUDAExecutionProvider"
    dire("détection de pose :", FOURNISSEUR_ONNX)


def montage_pretraitement(larg, haut, prefixe):
    """Vidéo guide -> poses détectées (images) + visages."""
    return {
        "12": {"class_type": "LoadVideo", "inputs": {"file": "guide.mp4"}},
        "13": {"class_type": "GetVideoComponents", "inputs": {"video": ["12", 0]}},
        "14": {"class_type": "ImageScale", "inputs": {"image": ["13", 0], "upscale_method": "lanczos", "width": larg, "height": haut, "crop": "center"}},
        "15": {"class_type": "OnnxDetectionModelLoader", "inputs": {"vitpose_model": "vitpose-l-wholebody.onnx", "yolo_model": "yolov10m.onnx", "onnx_device": FOURNISSEUR_ONNX}},
        "16": {"class_type": "PoseAndFaceDetection", "inputs": {"model": ["15", 0], "images": ["14", 0], "width": larg, "height": haut, "face_padding": 0}},
        "17": {"class_type": "DrawViTPose", "inputs": {"pose_data": ["16", 0], "width": larg, "height": haut, "retarget_padding": 16, "body_stick_width": -1, "hand_stick_width": -1, "draw_head": True}},
        "90": {"class_type": "SaveImage", "inputs": {"images": ["17", 0], "filename_prefix": prefixe + "-pose"}},
        "91": {"class_type": "SaveImage", "inputs": {"images": ["16", 1], "filename_prefix": prefixe + "-visage"}},
    }


def montage_generation(t, quant, prefixe, natif=False):
    """Montage complet « animation » : le personnage de l'image exécute le mouvement de la vidéo guide.
    natif=True : modèle et encodeur de texte au format compressé de ComfyUI au lieu de GGUF (secours)."""
    larg, haut, longueur = t["largeur"], t["hauteur"], t["longueur"]
    g = montage_pretraitement(larg, haut, prefixe)
    del g["91"]
    g.update({
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": f"Wan2.2-Animate-14B-{quant}.gguf"}},
        "2": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors", "strength_model": t.get("force_lora", 1.0)}},
        "3": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["2", 0], "shift": t.get("decalage", 8.0)}},
        "4": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": "umt5-xxl-encoder-Q5_K_M.gguf", "type": "wan"}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": t["texte"]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": NEGATIF}},
        "7": {"class_type": "VAELoader", "inputs": {"vae_name": "wan_2.1_vae.safetensors"}},
        "8": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": "clip_vision_h.safetensors"}},
        "9": {"class_type": "LoadImage", "inputs": {"image": "ref.png"}},
        "11": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["8", 0], "image": ["9", 0], "crop": "none"}},
        "18": {"class_type": "WanAnimateToVideo", "inputs": {
            "positive": ["5", 0], "negative": ["6", 0], "vae": ["7", 0], "width": larg, "height": haut, "length": longueur, "batch_size": 1,
            "continue_motion_max_frames": 5, "video_frame_offset": 0,
            "clip_vision_output": ["11", 0], "reference_image": ["9", 0], "pose_video": ["17", 0]}},
        "19": {"class_type": "KSampler", "inputs": {"model": ["3", 0], "seed": t.get("graine", 1), "steps": t.get("etapes", 6), "cfg": 1.0, "sampler_name": t.get("echantillonneur", "euler"), "scheduler": "simple",
                                                    "positive": ["18", 0], "negative": ["18", 1], "latent_image": ["18", 2], "denoise": 1.0}},
        "20": {"class_type": "TrimVideoLatent", "inputs": {"samples": ["19", 0], "trim_amount": ["18", 3]}},
        "21": {"class_type": "VAEDecode", "inputs": {"samples": ["20", 0], "vae": ["7", 0]}},
        "22": {"class_type": "ImageFromBatch", "inputs": {"image": ["21", 0], "batch_index": ["18", 4], "length": 4096}},
        "92": {"class_type": "SaveImage", "inputs": {"images": ["22", 0], "filename_prefix": prefixe + "-clip"}},
    })
    if natif:
        g["1"] = {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_animate_14B_int8_convrot.safetensors", "weight_dtype": "default"}}
        g["4"] = {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}}
    if t.get("visage", True):
        g["18"]["inputs"]["face_video"] = ["16", 1]
    if t.get("relumiere"):
        g["2b"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["2", 0], "lora_name": "wan2.2_animate_14B_relight_lora_bf16.safetensors", "strength_model": 1.0}}
        g["3"]["inputs"]["model"] = ["2b", 0]
    return g


NOEUDS = ["LoadVideo", "GetVideoComponents", "ImageScale", "OnnxDetectionModelLoader", "PoseAndFaceDetection", "DrawViTPose", "SaveImage", "UnetLoaderGGUF",
          "LoraLoaderModelOnly", "ModelSamplingSD3", "CLIPLoaderGGUF", "CLIPTextEncode", "VAELoader", "CLIPVisionLoader", "LoadImage", "CLIPVisionEncode",
          "WanAnimateToVideo", "KSampler", "TrimVideoLatent", "VAEDecode", "ImageFromBatch", "UNETLoader", "CLIPLoader"]


# --------------------------------------------------------------------------------------------------
# 6. Entrées, sorties
# --------------------------------------------------------------------------------------------------
def trouver(nom):
    for racine in ("/kaggle/input", os.path.join(os.path.dirname(os.path.abspath(__file__)), "entrees") if "__file__" in globals() else "entrees", "entrees"):
        r = glob.glob(os.path.join(racine, "**", nom), recursive=True)
        if r:
            return r[0]
    raise FileNotFoundError(nom)


def images_vers_video(motif, sortie, ips):
    fichiers = sorted(glob.glob(motif))
    if not fichiers:
        dire("aucune image pour", motif)
        return 0
    liste = sortie + ".txt"
    with open(liste, "w") as f:
        for x in fichiers:
            f.write(f"file '{x}'\nduration {1 / ips:.6f}\n")
    cmd(f"ffmpeg -v error -y -f concat -safe 0 -i {liste} -vf fps={ips} -c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p -movflags +faststart {sortie}", verifier=False, silencieux=True)
    os.remove(liste)
    return len(fichiers)


def planche(guide, pose, clip, sortie, larg, haut, ips):
    """Guide | pose | résultat côte à côte, pour contrôler que le geste est respecté."""
    f = (f"[0:v]scale={larg}:{haut}:force_original_aspect_ratio=increase,crop={larg}:{haut},fps={ips}[a];"
         f"[1:v]scale={larg}:{haut},fps={ips}[b];[2:v]scale={larg}:{haut},fps={ips}[c];[a][b][c]hstack=inputs=3:shortest=1")
    cmd(f"ffmpeg -v error -y -i {guide} -i {pose} -i {clip} -filter_complex \"{f}\" -c:v libx264 -crf 18 -pix_fmt yuv420p {sortie}", verifier=False, silencieux=True)


def executer(comfy, gpu):
    quant = CONFIG.get("quant", "Q4_K_M")
    sortie_comfy = os.path.join(comfy, "output")
    entree_comfy = os.path.join(comfy, "input")
    for i, t in enumerate(CONFIG["taches"]):
        nom = t["nom"]
        res = {"nom": nom, "reglages": {k: v for k, v in t.items() if k not in ("texte",)}}
        BILAN["taches"].append(res)
        with Etape("tâche " + nom):
            shutil.copy(trouver(t["guide"]), os.path.join(entree_comfy, "guide.mp4"))
            shutil.copy(trouver(t["image"]), os.path.join(entree_comfy, "ref.png"))
            prefixe = f"anqa/{nom}"
            larg, haut, ips = t["largeur"], t["hauteur"], t.get("ips", 25)
            for vieux in glob.glob(os.path.join(sortie_comfy, "anqa", nom + "-*")):
                os.remove(vieux)
            if not gpu:
                ok, d = lancer(montage_pretraitement(larg, haut, prefixe), nom + " (prétraitement)")
                res["pretraitement"] = {"ok": ok, **{k: v for k, v in d.items() if k != "sorties"}}
                n = images_vers_video(os.path.join(sortie_comfy, "anqa", nom + "-pose_*.png"), os.path.join(SORTIES, nom + "-pose.mp4"), ips)
                res["images_pose"] = n
                ok2, d2 = lancer(montage_generation(t, quant, prefixe), nom + " (validation seule)", attendre=False)
                res["validation_montage_complet"] = {"ok": ok2, **({} if ok2 else d2)}
                http("/interrupt", {})
                http("/queue", {"clear": True})
                ok3, d3 = lancer(montage_generation(t, quant, prefixe, natif=True), nom + " (validation du secours natif)", attendre=False)
                res["validation_montage_natif"] = {"ok": ok3, **({} if ok3 else d3)}
                http("/interrupt", {})
                http("/queue", {"clear": True})
                continue
            mem = Memoire()
            mem.start()
            delai = CONFIG.get("delai_tache_s", 3600)
            natif = ETAT.get("natif", False)
            ok, d = lancer(montage_generation(t, quant, prefixe, natif=natif), nom + (" (natif)" if natif else ""), delai_max=delai)
            if not ok and not natif and CONFIG.get("secours_natif", True) and "validation" not in d:
                dire("échec avec le modèle GGUF : nouvel essai avec le format compressé de ComfyUI")
                res["echec_gguf"] = {k: v for k, v in d.items() if k != "sorties"}
                http("/interrupt", {})
                http("/queue", {"clear": True})
                http("/free", {"unload_models": True, "free_memory": True})
                with Etape("modèles (secours natif)"):
                    telecharger(comfy, quant, reel=True, jeux=("natif",))
                ETAT["natif"] = natif = True
                for vieux in glob.glob(os.path.join(sortie_comfy, "anqa", nom + "-*")):
                    os.remove(vieux)
                ok, d = lancer(montage_generation(t, quant, prefixe, natif=True), nom + " (natif)", delai_max=delai)
            mem.actif = False
            res.update({"ok": ok, "natif": natif, "memoire_carte_max_mo": mem.maxi, **{k: v for k, v in d.items() if k != "sorties"}})
            n_pose = images_vers_video(os.path.join(sortie_comfy, "anqa", nom + "-pose_*.png"), os.path.join(SORTIES, nom + "-pose.mp4"), ips)
            n_clip = images_vers_video(os.path.join(sortie_comfy, "anqa", nom + "-clip_*.png"), os.path.join(SORTIES, nom + ".mp4"), ips)
            res.update({"images_pose": n_pose, "images_clip": n_clip})
            if n_clip:
                planche(os.path.join(entree_comfy, "guide.mp4"), os.path.join(SORTIES, nom + "-pose.mp4"), os.path.join(SORTIES, nom + ".mp4"), os.path.join(SORTIES, nom + "-controle.mp4"), larg, haut, ips)
                premiere = sorted(glob.glob(os.path.join(sortie_comfy, "anqa", nom + "-clip_*.png")))
                for j, x in enumerate((premiere[0], premiere[len(premiere) // 2])):
                    shutil.copy(x, os.path.join(SORTIES, f"{nom}-image{j}.png"))
            cmd(f"grep -a -o -E '[0-9.]+(s/it|it/s)' {os.path.join(SORTIES, 'comfyui.log')} | tail -3", verifier=False)
            cmd(f"grep -a -i -E 'loaded (partially|completely)|lowvram|out of memory|OOM|Requested to load|model weight dtype' {os.path.join(SORTIES, 'comfyui.log')} | tail -12", verifier=False)
        sauver_bilan()


def main():
    dire("Anqā vidéo — mode", CONFIG["mode"], "—", len(CONFIG["taches"]), "tâche(s)")
    gpu = CONFIG["mode"] == "gen"
    try:
        with Etape("diagnostic"):
            diagnostic()
        racine = base()
        with Etape("installation"):
            comfy = installer(racine)
        jeux = ["base", "gguf"] + (["relumiere"] if any(t.get("relumiere") for t in CONFIG["taches"]) else [])
        with Etape("modèles"):
            telecharger(comfy, CONFIG.get("quant", "Q4_K_M"), reel=gpu, jeux=jeux)
            telecharger(comfy, CONFIG.get("quant", "Q4_K_M"), reel=False, jeux=("natif",))   # factices, pour valider le secours
        choisir_fournisseur(gpu)
        with Etape("démarrage de ComfyUI"):
            demarrer(comfy, gpu)
            decrire_noeuds(NOEUDS)
        executer(comfy, gpu)
    except Exception as e:
        import traceback
        dire("ARRÊT SUR ERREUR :", type(e).__name__, e)
        dire(traceback.format_exc())
        BILAN["erreur"] = f"{type(e).__name__}: {e}"
    finally:
        if SERVEUR is not None and SERVEUR.poll() is None:
            SERVEUR.terminate()
        cmd(f"tail -c 6000 {os.path.join(SORTIES, 'comfyui.log')} 2>/dev/null | tr '\\r' '\\n' | tail -40", verifier=False)
        sauver_bilan()
        dire("terminé — sorties :", sorted(os.listdir(SORTIES)))


if __name__ == "__main__":
    main()
