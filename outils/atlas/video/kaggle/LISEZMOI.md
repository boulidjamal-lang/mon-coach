# Vidéos d'exercice par un modèle libre, sur Kaggle

Essai en cours (rien n'a encore tourné sur Kaggle) : faire rejouer nos mouvements 3D par un personnage
dessiné par un modèle vidéo libre, gratuitement, sur la carte graphique offerte par Kaggle (T4 ×2).

- Modèle : Wan 2.2 Animate 14B (Apache 2.0), version compressée GGUF, exécuté par ComfyUI. Versions figées
  dans `noyau/anqa_video.py` (ComfyUI, ComfyUI-GGUF, ComfyUI-WanAnimatePreprocess).
- Guide : une vidéo de notre moteur (`entrees/curl-guide.mp4`, 70 images, 25 i/s). Le détecteur de pose du
  modèle reconnaît notre mannequin (confiance 0,92 sur le corps) : vérifié en local par `essai_pose.py`.
- Personnage : une image de référence (`entrees/ref-*.png`, générées par des modèles libres, originales).

## Lancer

La clé Kaggle n'est jamais dans le dépôt : c'est un secret réseau de l'environnement (hôte `api.kaggle.com`,
en-tête `Authorization`, préfixe `Bearer`). `lancer.py` donne à l'outil Kaggle une valeur factice et le nom
du compte.

    pip install kaggle
    export KAGGLE_UTILISATEUR=<nom du compte>
    python lancer.py quota                    # quota de carte graphique de la semaine
    python lancer.py jeu entrees/             # jeu de données privé « anqa-entrees »
    python lancer.py envoi configs/sec.json   # à sec : sans carte graphique, valide le montage
    python lancer.py etat ; python lancer.py sorties resultats/
    python lancer.py envoi configs/gen-1.json # génère (consomme le quota)

Le mode « sec » installe tout, lance le prétraitement pour de vrai et fait seulement valider le montage
complet par ComfyUI (modèles factices). Le mode « gen » télécharge environ 19 Go de modèles puis génère.
Les sorties (clip, vidéo des poses, planche guide | pose | résultat, journal, `bilan.json`) sont dans
`/kaggle/working/sorties`.

## À mesurer avant toute production

Temps par clip et mémoire sur T4 (16 Go), qualité en 480 × 832, tenue du matériel (le mode « animation »
tire le décor de l'image de référence ; le mode « remplacement », qui garderait notre décor 3D, reste à monter).
