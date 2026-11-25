# -*- coding: utf-8 -*-
"""Anqā — le même programme vidéo (noyau/anqa_video.py), lancé sur Modal.

    modal run anqa_modal.py::preparer --quant Q8_0          # processeur seul : télécharge les modèles dans un volume
    modal run anqa_modal.py --config configs/modal-1.json    # carte graphique : génère, écrit resultats/<nom>/

La clé Modal n'est jamais dans le dépôt (variables MODAL_TOKEN_ID / MODAL_TOKEN_SECRET ou ~/.modal.toml).
"""
import json
import os
import pathlib

import modal

ICI = pathlib.Path(__file__).parent
ENV = {"ANQA_BASE": "/racine/anqa", "ANQA_TRAVAIL": "/tmp/travail", "ANQA_MODELES": "/modeles", "ANQA_ENTREES": "/tmp/entrees"}

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install("torch", "torchvision", "torchaudio")
    .env(ENV)
    .add_local_file(ICI / "noyau" / "anqa_video.py", "/racine/anqa_video.py", copy=True)
    .run_commands("ANQA_CONFIG='{\"mode\": \"install\", \"taches\": []}' python /racine/anqa_video.py && test -f /racine/anqa/installe")
)
app = modal.App("anqa-video", image=image)
volume = modal.Volume.from_name("anqa-modeles", create_if_missing=True)


def _lancer(config, fichiers):
    import subprocess
    os.makedirs("/tmp/entrees", exist_ok=True)
    for nom, contenu in (fichiers or {}).items():
        open(os.path.join("/tmp/entrees", nom), "wb").write(contenu)
    env = dict(os.environ, ANQA_CONFIG=json.dumps(config))
    subprocess.run(["python", "/racine/anqa_video.py"], env=env, check=False)
    volume.commit()
    sorties = {}
    racine = "/tmp/travail/sorties"
    for nom in sorted(os.listdir(racine)) if os.path.isdir(racine) else []:
        sorties[nom] = open(os.path.join(racine, nom), "rb").read()
    return sorties


@app.function(volumes={"/modeles": volume}, timeout=3600, cpu=4, memory=8192)
def preparer_modeles(config: dict):
    return _lancer(dict(config, mode="gen", arret_apres_modeles=True, taches=[]), {})


@app.function(gpu=(os.environ.get("ANQA_CARTE", "L40S") or None), volumes={"/modeles": volume}, timeout=1500, cpu=8, memory=32768)
def generer(config: dict, fichiers: dict):
    return _lancer(config, fichiers)


def _ecrire(sorties, dossier):
    os.makedirs(dossier, exist_ok=True)
    for nom, contenu in sorties.items():
        open(os.path.join(dossier, nom), "wb").write(contenu)
    print("sorties :", dossier, sorted(sorties))


@app.local_entrypoint()
def preparer(quant: str = "Q8_0"):
    _ecrire(preparer_modeles.remote({"quant": quant}), str(ICI / "resultats" / "modal-preparation"))


@app.local_entrypoint()
def main(config: str = "configs/modal-1.json", sortie: str = ""):
    c = json.load(open(ICI / config, encoding="utf-8"))
    noms = {t[k] for t in c["taches"] for k in ("guide", "image")}
    fichiers = {n: open(ICI / "entrees" / n, "rb").read() for n in noms}
    _ecrire(generer.remote(c, fichiers), sortie or str(ICI / "resultats" / pathlib.Path(config).stem))
