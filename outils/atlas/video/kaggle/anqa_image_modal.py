# -*- coding: utf-8 -*-
"""Anqā — images de référence du personnage (style dessin animé riche), générées sur Modal.

Modèle : Animagine XL 4.0 (licence OpenRAIL++). Deux usages : un personnage de face (texte seul) et la même
pose que notre mannequin 3D (image de départ redessinée).   modal run anqa_image_modal.py --sortie resultats/perso
"""
import io
import os
import pathlib

import modal

ICI = pathlib.Path(__file__).parent
image = modal.Image.debian_slim(python_version="3.12").pip_install("torch", "diffusers", "transformers", "accelerate", "safetensors", "pillow").env({"HF_HOME": "/cache"})
app = modal.App("anqa-image", image=image)
cache = modal.Volume.from_name("anqa-cache-hf", create_if_missing=True)

QUALITE = "masterpiece, high score, great score, absurdres, detailed illustration, detailed shading, glossy skin, warm lighting, vibrant colors"
NEGATIF = "lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry, child, multiple boys, cowboy shot, upper body, portrait, close-up, sitting, squatting, dutch angle, from below, from side, bulge, food, bag, logo, english text, hyper muscles, barefoot, pants, leggings, bike shorts, boots, sandals, belt, loincloth, armor"


@app.function(gpu="A10G", volumes={"/cache": cache}, timeout=900)
def dessiner(demandes: list, depart: bytes | None):
    import torch
    from diffusers import StableDiffusionXLImg2ImgPipeline, StableDiffusionXLInpaintPipeline, StableDiffusionXLPipeline
    from PIL import Image
    tuyau = StableDiffusionXLPipeline.from_pretrained("cagliostrolab/animagine-xl-4.0", torch_dtype=torch.float16, use_safetensors=True).to("cuda")
    tuyau2 = StableDiffusionXLImg2ImgPipeline(**tuyau.components)
    tuyau3 = StableDiffusionXLInpaintPipeline(**tuyau.components)
    cache.commit()
    sorties = {}
    for d in demandes:
        g = torch.Generator("cuda").manual_seed(d["graine"])
        commun = dict(prompt=d["texte"] + ", " + QUALITE, negative_prompt=NEGATIF, guidance_scale=d.get("cfg", 5.0), num_inference_steps=28, generator=g)
        if d.get("masque"):
            src = Image.open(io.BytesIO(d["image"])).convert("RGB")
            masque = Image.open(io.BytesIO(d["masque"])).convert("L")
            im = tuyau3(image=src, mask_image=masque, width=src.width, height=src.height, strength=d.get("force", 0.99), **commun).images[0]
        elif d.get("force"):
            src = Image.open(io.BytesIO(depart)).convert("RGB").resize((d["largeur"], d["hauteur"]), Image.LANCZOS)
            im = tuyau2(image=src, strength=d["force"], **commun).images[0]
        else:
            im = tuyau(width=d["largeur"], height=d["hauteur"], **commun).images[0]
        tampon = io.BytesIO(); im.save(tampon, "PNG"); sorties[d["nom"] + ".png"] = tampon.getvalue()
    return sorties


@app.local_entrypoint()
def retoucher(image: str, masque: str, texte: str, sortie: str, graines: str = "1,2,3,4", force: float = 0.99):
    """Redessine seulement la zone blanche du masque (haltères dans les mains, logos effacés), le reste ne bouge pas."""
    im, ma = open(image, "rb").read(), open(masque, "rb").read()
    demandes = [{"nom": f"retouche-{g}", "texte": texte, "graine": int(g), "image": im, "masque": ma, "force": force} for g in graines.split(",")]
    r = dessiner.remote(demandes, None)
    os.makedirs(sortie, exist_ok=True)
    for nom, contenu in r.items():
        open(os.path.join(sortie, nom), "wb").write(contenu)
    print("images :", sorted(r))


@app.local_entrypoint()
def main(sortie: str = "resultats/perso", depart: str = "entrees/curl-depart-clair.png"):
    base = "1boy, solo, full body, standing, straight-on, facing viewer, male focus, adult man, short spiky black hair, tan skin, confident look, topless male, bare chest, black gym shorts, short shorts, white sneakers, white socks, orange wristbands, {corps}, holding dumbbell, dumbbell in each hand, arms at sides, looking at viewer, simple background, grey background, floor shadow"
    athlete = "athletic, lean muscular, ripped, defined pectorals, defined abs, six pack, defined deltoids, defined biceps, visible veins, muscle definition, v-taper"
    muscle = "athletic, muscular, ripped, broad shoulders, large defined pectorals, defined abs, six pack, round deltoids, big biceps, visible veins, muscle definition, muscle striations, defined quadriceps, v-taper"
    corps = [(athlete, 71), (athlete, 72), (athlete, 73), (athlete, 74), (athlete, 75), (athlete, 76), (muscle, 81), (muscle, 82), (muscle, 83), (muscle, 84), (muscle, 85), (muscle, 86)]
    demandes = [{"nom": f"perso-{i + 1:02d}", "texte": base.format(corps=c), "graine": g, "largeur": 768, "hauteur": 1344} for i, (c, g) in enumerate(corps)]
    r = dessiner.remote(demandes, open(ICI / depart, "rb").read())
    os.makedirs(ICI / sortie, exist_ok=True)
    for nom, contenu in r.items():
        open(ICI / sortie / nom, "wb").write(contenu)
    print("images :", sorted(r))
