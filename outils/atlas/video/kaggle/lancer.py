#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lanceur local du notebook Kaggle « anqa-video ».

La clé Kaggle n'est jamais dans ce fichier ni dans l'environnement : elle est enregistrée par le formulaire
sécurisé de la session et ajoutée aux requêtes vers api.kaggle.com par le mandataire réseau. L'outil Kaggle
exige malgré tout une valeur locale : on lui donne une valeur factice, et on lui indique le nom du compte
(public) au lieu de le laisser interroger le service avec cette valeur factice.

Usage :
  KAGGLE_UTILISATEUR=<nom> python lancer.py quota
  KAGGLE_UTILISATEUR=<nom> python lancer.py jeu entrees/            # crée ou met à jour le jeu de données privé
  KAGGLE_UTILISATEUR=<nom> python lancer.py envoi configs/sec.json  # envoie et lance le notebook
  KAGGLE_UTILISATEUR=<nom> python lancer.py etat
  KAGGLE_UTILISATEUR=<nom> python lancer.py sorties resultats/
  python lancer.py construire configs/sec.json                      # fabrique seulement les dossiers (hors ligne)
"""
import json
import os
import shutil
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
UTILISATEUR = os.environ.get("KAGGLE_UTILISATEUR", "").strip()
JEU, NOYAU = "anqa-entrees", "anqa-video"


def api():
    if not UTILISATEUR:
        sys.exit("KAGGLE_UTILISATEUR manquant (nom du compte Kaggle, public)")
    os.environ.setdefault("KAGGLE_API_TOKEN", "KGAT_valeur_factice_remplacee_par_le_mandataire")
    from kaggle.api.kaggle_api_extended import KaggleApi
    KaggleApi._introspect_token = lambda self, jeton: UTILISATEUR
    a = KaggleApi()
    a.authenticate()
    return a


def construire(config_json, utilisateur):
    """Fabrique le dossier du notebook : programme avec ses réglages + métadonnées."""
    config = json.load(open(config_json, encoding="utf-8"))
    dossier = os.path.join(ICI, "_envoi")
    shutil.rmtree(dossier, ignore_errors=True)
    os.makedirs(dossier)
    source = open(os.path.join(ICI, "noyau", "anqa_video.py"), encoding="utf-8").read()
    repere = 'CONFIG = {"mode": "sec", "taches": []}'
    assert source.count(repere) == 1, "ligne CONFIG introuvable dans le programme"
    source = source.replace(repere, "CONFIG = json.loads(" + repr(json.dumps(config, ensure_ascii=False)) + ")")
    open(os.path.join(dossier, "anqa_video.py"), "w", encoding="utf-8").write(source)
    compile(source, "anqa_video.py", "exec")
    gpu = config["mode"] == "gen"
    meta = {
        "id": f"{utilisateur}/{NOYAU}", "title": "Anqa video", "code_file": "anqa_video.py", "language": "python", "kernel_type": "script",
        "is_private": "true", "enable_gpu": "true" if gpu else "false", "enable_tpu": "false", "enable_internet": "true",
        "dataset_sources": [f"{utilisateur}/{JEU}"], "competition_sources": [], "kernel_sources": [], "model_sources": [],
    }
    if gpu:
        meta["machine_shape"] = "NvidiaTeslaT4"
    json.dump(meta, open(os.path.join(dossier, "kernel-metadata.json"), "w"), indent=1)
    return dossier, config, gpu


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ordre = sys.argv[1]
    if ordre == "construire":
        d, c, g = construire(sys.argv[2], UTILISATEUR or "compte")
        print("dossier :", d, "| mode", c["mode"], "| carte graphique", g, "|", [t["nom"] for t in c["taches"]])
        return
    a = api()
    if ordre == "quota":
        print(a.quota_view())
    elif ordre == "jeu":
        dossier = os.path.abspath(sys.argv[2])
        json.dump({"title": "Anqa entrees video", "id": f"{UTILISATEUR}/{JEU}", "licenses": [{"name": "CC0-1.0"}]},
                  open(os.path.join(dossier, "dataset-metadata.json"), "w"), indent=1)
        try:
            etat = a.dataset_status(f"{UTILISATEUR}/{JEU}")
        except Exception:
            etat = None
        if etat:
            print("nouvelle version :", a.dataset_create_version(dossier, "mise à jour des entrées", quiet=True, dir_mode="zip"))
        else:
            print("création :", a.dataset_create_new(dossier, public=False, quiet=True, dir_mode="zip"))
    elif ordre == "etat-jeu":
        print(a.dataset_status(f"{UTILISATEUR}/{JEU}"))
    elif ordre == "envoi":
        d, c, g = construire(sys.argv[2], UTILISATEUR)
        r = a.kernels_push(d, acc="NvidiaTeslaT4" if g else None)
        print("envoyé :", r)
    elif ordre == "etat":
        print(a.kernels_status(f"{UTILISATEUR}/{NOYAU}"))
    elif ordre == "sorties":
        cible = os.path.abspath(sys.argv[2])
        os.makedirs(cible, exist_ok=True)
        print(a.kernels_output(f"{UTILISATEUR}/{NOYAU}", cible, force=True, quiet=False))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
