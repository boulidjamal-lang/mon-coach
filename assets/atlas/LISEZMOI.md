# Atlas musculaire 3D d'Anqā

- `atlas3d.js` : le moteur d'affichage et son interface (WebGL 2, aucune bibliothèque).
- `atlas-mouvements.js` : le corps exécute les exercices (solveur de pose, familles de mouvements, matériel, et la
  table qui relie chaque exercice de la bibliothèque à son mouvement) ; chargé seulement pour montrer un exercice.
  Fichier assemblé : ses sources sont dans `outils/atlas/mouvements/`.
- `atlas.bin` : le modèle — 178 structures (175 muscles, tendon calcanéen, ligne blanche, tractus ilio-tibial),
  chacune avec son maillage propre, et le squelette. Seul le côté gauche est stocké : le droit en est le miroir.
- `atlas-peau.bin` : la peau — la surface du corps (visage, oreilles, mains, pieds, ongles, sourcils, cils, cheveux),
  attachée au même squelette de mouvement que les muscles qu'elle recouvre. Facultative : sans elle, l'atlas reste
  l'écorché. L'appli la montre sur la tête, les mains et les pieds ; le reste du corps est l'écorché.

Le moteur donne au corps une carrure d'athlète au chargement : les chairs sont étoffées autour des os, le squelette
ne change pas, et les fichiers du modèle restent ceux décrits ici (option `carrure`, voir `outils/atlas/LISEZMOI.md`).
Dès qu'on ouvre un exercice, sa fiche montre le mouvement (`AnqaAtlas.apercu`) ; l'atlas complet s'ouvre de là en grand.

## Origine et licence du modèle

Le modèle vient de **Z-Anatomy** (<https://github.com/Z-Anatomy/Models-of-human-anatomy>, version 1905c88),
lui-même dérivé de **BodyParts3D**. Mentions demandées par leurs auteurs :

- « BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan »
  (<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>)
- « Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0 » (<https://www.z-anatomy.com>)

Ce que nous avons changé : choix des structures utiles à un atlas d'entraînement, allègement des maillages (erreur
bornée à 0,5 mm), ouverture de la gaine du grand droit de l'abdomen, classement en couches de profondeur, ombrage de
relief calculé par sommet, noms français d'usage, articulation du corps (chaque sommet attaché à ses os ; centres
d'articulation repris de Z-Biomechanics, même auteur, même licence). Pour la peau : régions de la surface du corps
(collection « Regions of human body ») assemblées en une seule surface, fentes refermées, région uro-génitale adoucie
(le corps porte un short), peau tenue au-dessus des muscles, attaches au squelette reprises des muscles recouverts,
ombrage de relief ; les yeux sont deux globes placés au centre des sclères du modèle.

**`atlas.bin` et `atlas-peau.bin` sont des œuvres dérivées : ils sont diffusés sous la même licence, Creative Commons
Attribution - Partage dans les mêmes conditions 4.0 International** (<https://creativecommons.org/licenses/by-sa/4.0/deed.fr>). Chacun peut les
reprendre et les modifier aux mêmes conditions. Le code de l'appli (dont `atlas3d.js`) n'est pas concerné par cette
licence : il ne fait qu'afficher le modèle.

Point à faire confirmer par un juriste avant une diffusion payante : la licence interdit d'ajouter des verrous
techniques qui empêcheraient d'exercer ces droits. Les fichiers restent librement téléchargeables à cette adresse du site,
hors de toute protection de l'App Store ; c'est la parade habituelle, pas un avis juridique.

## Refaire le modèle

Voir `outils/atlas/LISEZMOI.md`.
