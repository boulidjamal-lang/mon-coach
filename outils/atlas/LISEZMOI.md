# Chaîne de fabrication de l'atlas 3D

Ces outils ne sont pas chargés par l'appli : ils servent à refaire `assets/atlas/atlas.bin` à partir de Z-Anatomy.

1. Récupérer Z-Anatomy (<https://github.com/Z-Anatomy/Models-of-human-anatomy>), décompresser `Z-Anatomy.zip`.
2. Extraire les maillages avec Blender (module Python `bpy`), modificateurs appliqués, un fichier par collection :
   `python outils/extraire_blend.py <Startup.blend> muscles.bin "4: Muscular system"`
   puis de même `squelette.bin` avec `"1: Skeletal system"`.
3. `npm install` (three, three-mesh-bvh, meshoptimizer : pour le calcul seulement).
4. `node outils/construire-registre.mjs <muscles.bin>` : écrit `donnees/registre.json` — le registre central
   (identifiant stable, nom français, latin, anglais, région, groupes et faisceaux d'Anqā, rôle).
   La table d'appartenance se modifie dans `outils/registre-source.mjs` ; `donnees/identifiants.json` fige les
   identifiants une fois attribués.
5. `node outils/preparer.mjs <dossier des .bin> donnees/atlas.bin 0.5` : allège (erreur en mm), ouvre la gaine des
   droits, range en couches (épluchage par lancers de rayons ; retouches dans `donnees/couches-forcees.json`),
   calcule l'ombrage de relief, articule le corps et écrit le fichier compact. Copier ensuite le résultat dans
   `assets/atlas/`.

Le mouvement : `outils/articuler.mjs` construit le squelette de mouvement (59 articulations) à partir des centres
d'articulation de Z-Biomechanics (`donnees/rig-biomeca.json`, tiré de `Z-Biomechanics.7z` du même dépôt par
`outils/extraire_rig.py`), fait suivre chaque pièce d'os par son articulation et attache chaque sommet de muscle aux
os les plus proches (diffusion le long du muscle ; `rapport/attaches.txt` liste les articulations de chaque muscle).
`assets/atlas/atlas-mouvements.js` contient le solveur de pose, les mouvements et le matériel.

Contrôles : `appli/essai.html`, `appli/essai-ui.html` et `appli/essai-mouvement.html` (pages d'essai),
`outils/video-mouvement.cjs` (vidéo d'un mouvement), `outils/planche.cjs` (planches de vues),
`outils/essais-fonctionnels.cjs` (gestes, sélection, couches, index, reprise du contexte graphique).

`rapport/sources.json` : comparaison des sources anatomiques étudiées (liens, licences, ce qui a été réellement
inspecté). `rapport/couches.txt` : couche de chaque structure et part visible mesurée à chaque passe.
