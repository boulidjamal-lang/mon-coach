# Atlas musculaire 3D d'Anqā

- `atlas3d.js` : le moteur d'affichage et son interface (WebGL 2, aucune bibliothèque).
- `atlas.bin` : le modèle — 178 structures (175 muscles, tendon calcanéen, ligne blanche, tractus ilio-tibial),
  chacune avec son maillage propre, et le squelette. Seul le côté gauche est stocké : le droit en est le miroir.

## Origine et licence du modèle

Le modèle vient de **Z-Anatomy** (<https://github.com/Z-Anatomy/Models-of-human-anatomy>, version 1905c88),
lui-même dérivé de **BodyParts3D**. Mentions demandées par leurs auteurs :

- « BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan »
  (<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>)
- « Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0 » (<https://www.z-anatomy.com>)

Ce que nous avons changé : choix des structures utiles à un atlas d'entraînement, allègement des maillages (erreur
bornée à 0,5 mm), ouverture de la gaine du grand droit de l'abdomen, classement en couches de profondeur, ombrage de
relief calculé par sommet, noms français d'usage.

**`atlas.bin` est une œuvre dérivée : il est diffusé sous la même licence, Creative Commons Attribution - Partage dans
les mêmes conditions 4.0 International** (<https://creativecommons.org/licenses/by-sa/4.0/deed.fr>). Chacun peut le
reprendre et le modifier aux mêmes conditions. Le code de l'appli (dont `atlas3d.js`) n'est pas concerné par cette
licence : il ne fait qu'afficher le modèle.

Point à faire confirmer par un juriste avant une diffusion payante : la licence interdit d'ajouter des verrous
techniques qui empêcheraient d'exercer ces droits. Le fichier reste librement téléchargeable à cette adresse du site,
hors de toute protection de l'App Store ; c'est la parade habituelle, pas un avis juridique.

## Refaire le modèle

Voir `outils/atlas/LISEZMOI.md`.
