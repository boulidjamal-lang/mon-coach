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
`assets/atlas/atlas-mouvements.js` contient le solveur de pose, les mouvements et le matériel : il est assemblé à
partir du dossier `mouvements/` (voir plus bas), on ne le modifie pas à la main.

Contrôles : `appli/essai.html`, `appli/essai-ui.html` et `appli/essai-mouvement.html` (pages d'essai),
`outils/video-mouvement.cjs` (vidéo d'un mouvement), `outils/planche.cjs` (planches de vues),
`outils/essais-fonctionnels.cjs` (gestes, sélection, couches, index, reprise du contexte graphique),
`outils/appli-atlas.cjs` (captures de l'atlas dans la vraie appli).

## Les mouvements des exercices

Chaque exercice de la bibliothèque (`EXERCICES_BASE` dans `index.html`) a son mouvement. Tout est dans `mouvements/` :

- `table.txt` : une ligne par exercice, `identifiant | mouvement | nom`. Le mouvement s'écrit en quelques mots :
  une famille, puis ses options — `curl hal assis alt`, `developpe barre incline`, `traction large`,
  `pompe diamant`, `etire pigeon`, `cardio rameur`… `amp=0.5` (valable partout) réduit l'amplitude de moitié.
- `src/*.js` : les sources, assemblées dans l'ordre des numéros. `00-maths` et `10-corps` (le solveur : bassin,
  colonne, bras et jambes par cibles ou par angles), `20-materiel` (barres, haltères, bancs, poulies, machines
  simplifiées), `30-postures` (debout, assis, couché, planche…), `35-definition` (lecture du mouvement, poses
  clés, appuis des pieds), puis une famille de mouvements par fichier (`42-curl` … `58-etirements`) et
  `90-animation` (la lecture en boucle, le cadrage, le filet qui garde le corps au-dessus du sol).
  Les options qu'une famille comprend sont celles que son code lit (`o.nom`).
- `node mouvements/construire.mjs` : assemble `assets/atlas/atlas-mouvements.js` (sources + table).
- `node mouvements/controle.mjs --table` : contrôle tous les exercices sans moteur 3D (mouvement défini, valeurs
  finies, rien sous le sol, mains et pieds à portée de leurs cibles, options et matériel connus) et n'affiche que
  les problèmes ; `node mouvements/controle.mjs "curl hal assis"` pour un seul mouvement. Le même contrôle tourne
  dans la suite de tests de l'appli.
- `node outils/planche-mouvements.cjs sortie.png "pompe diamant" "dips anneaux | Dips aux anneaux"` : planche de
  contrôle dans le vrai rendu (début, milieu, fin de la répétition) ; `node outils/video-planche.cjs sortie.mp4 …` :
  la même chose en vidéo. `appli/essai-mouvement.html?spec=…` ou `?ex=<identifiant>` montre un mouvement seul.
- `node mouvements/sonde.mjs "<mouvement>" [instant]` : hauteur du point le plus bas de chaque région du corps,
  pour régler une pose au sol.
- `node outils/catalogue-mouvements.cjs <dossier>` : le catalogue de toute la bibliothèque, groupe par groupe —
  pour chaque exercice, le départ et l'arrivée de son mouvement dans le vrai rendu (planches `cat-<groupe>-<n>.jpg`
  et `catalogue.json`, qui dit où trouver chaque exercice). Long : plusieurs dizaines de minutes en rendu logiciel.

Ajouter ou corriger le mouvement d'un exercice : modifier sa ligne dans `table.txt` (ou la famille dans `src/`),
relancer `construire.mjs`, puis `controle.mjs --table`, et regarder le résultat sur une planche. Un exercice ajouté
à la bibliothèque sans ligne dans la table fait échouer les tests de l'appli.

Ce que le mouvement ne montre pas : les machines sont dessinées en formes simples (leviers, coussins, sièges) ; les
déplacements (fentes marchées, marches latérales) se font sur place ; les mouvements à plusieurs temps (relevé
turc, haltérophilie) passent par quelques poses clés ; les muscles s'étirent et se raccourcissent avec les os mais
ne gonflent pas à la contraction.

`rapport/sources.json` : comparaison des sources anatomiques étudiées (liens, licences, ce qui a été réellement
inspecté). `rapport/couches.txt` : couche de chaque structure et part visible mesurée à chaque passe.
