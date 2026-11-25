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
NEGATIF = "lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry, child, multiple boys"


@app.function(gpu="A10G", volumes={"/cache": cache}, timeout=900)
def dessiner(demandes: list, depart: bytes | None):
    import torch
    from diffusers import StableDiffusionXLImg2ImgPipeline, StableDiffusionXLPipeline
    from PIL import Image
    tuyau = StableDiffusionXLPipeline.from_pretrained("cagliostrolab/animagine-xl-4.0", torch_dtype=torch.float16, use_safetensors=True).to("cuda")
    tuyau2 = StableDiffusionXLImg2ImgPipeline(**tuyau.components)
    cache.commit()
    sorties = {}
    for d in demandes:
        g = torch.Generator("cuda").manual_seed(d["graine"])
        commun = dict(prompt=d["texte"] + ", " + QUALITE, negative_prompt=NEGATIF, guidance_scale=d.get("cfg", 5.0), num_inference_steps=28, generator=g)
        if d.get("force"):
            src = Image.open(io.BytesIO(depart)).convert("RGB").resize((d["largeur"], d["hauteur"]), Image.LANCZOS)
            im = tuyau2(image=src, strength=d["force"], **commun).images[0]
        else:
            im = tuyau(width=d["largeur"], height=d["hauteur"], **commun).images[0]
        tampon = io.BytesIO(); im.save(tampon, "PNG"); sorties[d["nom"] + ".png"] = tampon.getvalue()
    return sorties


@app.local_entrypoint()
def main(sortie: str = "resultats/perso", depart: str = "entrees/curl-depart-clair.png"):
    perso = "1boy, solo, male focus, adult man, short spiky black hair, tan skin, confident smile, very muscular, broad shoulders, big arms, teal tank top, black shorts, orange wristbands, white sneakers"
    curl = perso + ", holding dumbbell, dumbbell in each hand, arms at sides, standing, full body, three-quarter view, simple background, white background, floor shadow"
    face = perso + ", standing, arms at sides, full body, front view, looking at viewer, simple background, white background, floor shadow"
    halteres = perso + ", holding dumbbell, dumbbell in each hand, arms at sides, standing straight, feet apart, full body, from side, three-quarter view, simple background, white background, floor shadow"
    demandes = [{"nom": f"halteres-{g}", "texte": halteres, "graine": g, "largeur": 704, "hauteur": 1216} for g in (31, 32, 33, 34, 35, 36)]
    r = dessiner.remote(demandes, open(ICI / depart, "rb").read())
    os.makedirs(ICI / sortie, exist_ok=True)
    for nom, contenu in r.items():
        open(ICI / sortie / nom, "wb").write(contenu)
    print("images :", sorted(r))
