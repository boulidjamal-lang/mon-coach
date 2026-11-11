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

## La peau

`assets/atlas/atlas-peau.bin` se refait en deux temps, une fois `atlas.bin` prêt (elle s'y attache) :

1. `python outils/extraire_peau.py <Startup.blend> peau/regions.bin` : extrait de Z-Anatomy la surface du corps
   (collection « 9: Regions of human body » : la peau découpée en régions, les oreilles, les ongles, les poils),
   sans les épaisseurs (modificateur SOLIDIFY).
2. `node outils/peau.mjs peau/regions.bin donnees/atlas.bin peau/atlas-peau.bin` : assemble le côté gauche en une
   seule surface (sommets soudés, frontières en T réparées, petits trous bouchés), la range en zones (corps, tête,
   main, pied, ongle, poil, cheveux, œil), adoucit la région uro-génitale, la tient au-dessus des muscles et des os,
   l'attache au squelette (chaque sommet reprend les attaches des muscles qu'il recouvre), calcule l'ombrage de
   relief et l'épaisseur sous la peau (ce dont elle doit reculer pour laisser voir un muscle), et écrit le fichier.
   Copier ensuite le résultat dans `assets/atlas/`.

Trois règles propres à la peau, trouvées en la regardant bouger :

- **L'épaule.** Au repos, le bras pend contre le flanc : la peau du flanc reprenait les attaches du bras tout proche
  et partait avec lui quand il se lève (le torse s'élargissait comme une cape). La peau du tronc ne suit donc le bras
  que près de l'articulation (pleinement à moins de 5 cm du centre de l'épaule, plus du tout au-delà de 13 cm), et la
  peau du bras ne suit le tronc que près de l'épaule. La région de chaque sommet (bras ou tronc) vient des régions de
  Z-Anatomy.
- **L'ombrage de relief se calcule segment par segment** (tronc et tête, chaque bras, chaque main, chaque jambe,
  chaque pied). L'ombre qu'un bras baissé fait au flanc, ou une cuisse à l'autre, n'existe plus dès qu'ils
  s'écartent : calculée sur le corps entier, elle resterait peinte sur la peau comme une tache. Aux jonctions
  (épaule, hanche, poignet, cheville), où le pli s'ouvre avec le mouvement, elle s'efface.
- **L'aisselle se creuse.** Ses articulations intermédiaires ont un « retrait » : elles se rapprochent du centre de
  l'épaule à mesure que le bras tourne, au lieu de tourner à distance constante (ce qui gonflerait le flanc).

Articulations intermédiaires : entre deux os qui tournent beaucoup l'un par rapport à l'autre, une peau attachée
moitié-moitié se pince ou se vrille (l'avant-bras en pronation). La peau s'attache donc aussi à des articulations
fictives, qui font une fraction de la rotation (avant-bras, coude, poignet, épaule, aisselle, hanche, genou,
cheville) ; leur liste est dans l'en-tête du fichier, et le moteur calcule leur pose à chaque image. Les muscles,
eux, ne s'en servent pas.

Sondes de contrôle (`outils/`) : `peau-orientation.mjs` (sens des triangles, arêtes portées par plus de deux
triangles), `peau-envers3d.mjs` (triangles dont l'envers se voit du dehors), `peau-attaches.mjs x,y,z …` (attaches de
la peau en un point : utile pour comprendre pourquoi elle suit tel os).

Dans le moteur (`atlas3d.js`) : la peau a son propre programme de dessin. L'envers de la peau (vu par une ouverture :
narine, poignet de la peau partielle) est assombri ; il se reconnaît au triangle qui tourne le dos ET à la normale
de la surface, car un triangle vu par la tranche, au bord d'un pli, est parfois pris à tort pour un envers.

Sur iPhone : les valeurs « flat » des programmes de dessin (la structure d'un sommet, sa zone de peau) coûtent très
cher avec la convention par défaut de WebGL, où le dernier sommet du triangle fait foi — Metal ne connaît que le
premier. Le moteur demande donc la convention du premier sommet (`WEBGL_provoking_vertex`) là où elle existe.
L'image n'en dépend pas : aucun triangle n'est à cheval sur deux structures ni sur deux zones de peau (un test le
vérifie sur les deux fichiers). `mesures().premierSommet` dit si elle est en place. Peau partielle : la tête, les mains et
les pieds, dessinés un rien en avant. Peau entière : seuls les muscles colorés (ou choisi) sont dessinés, ils
marquent le pochoir, et la peau du corps recule derrière eux à cet endroit — une fenêtre, qui ne s'ouvre pas si un
autre membre passe devant.

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
  contrôle dans le vrai rendu (début, milieu, fin de la répétition). `appli/essai-mouvement.html?spec=…` ou
  `?ex=<identifiant>` montre un mouvement seul (`&peau=1` ou `&peau=2` pour la peau).
- `node outils/video-planche.cjs sortie.mp4 "ex=e338" "ex=e20 | Traction"` : plusieurs exercices côte à côte, en
  vidéo, tels que l'appli les montre (peau, muscles de l'exercice en couleur) ; `node outils/apercu-exercice.cjs
  sortie.jpg e338` : un exercice sous ses trois peaux. Les couleurs sont calculées par l'appli elle-même
  (`outils/exercices-appli.cjs` l'ouvre dans le navigateur de test).
- `node mouvements/sonde.mjs "<mouvement>" [instant]` : hauteur du point le plus bas de chaque région du corps,
  pour régler une pose au sol.
- `node outils/catalogue-mouvements.cjs <dossier>` : le catalogue de toute la bibliothèque, groupe par groupe —
  pour chaque exercice, le départ et l'arrivée de son mouvement, tel que l'appli le montre (planches
  `cat-<groupe>-<n>.jpg` et `catalogue.json`, qui dit où trouver chaque exercice). Les vues sont gardées d'une fois
  sur l'autre : seuls les mouvements nouveaux ou modifiés sont rendus (un quart d'heure pour tout refaire, en rendu
  logiciel).

Ajouter ou corriger le mouvement d'un exercice : modifier sa ligne dans `table.txt` (ou la famille dans `src/`),
relancer `construire.mjs`, puis `controle.mjs --table`, et regarder le résultat sur une planche. Un exercice ajouté
à la bibliothèque sans ligne dans la table fait échouer les tests de l'appli.

Ce que le mouvement ne montre pas : les machines sont dessinées en formes simples (leviers, coussins, sièges) ; les
déplacements (fentes marchées, marches latérales) se font sur place ; les mouvements à plusieurs temps (relevé
turc, haltérophilie) passent par quelques poses clés ; les muscles s'étirent et se raccourcissent avec les os mais
ne gonflent pas à la contraction.

`rapport/sources.json` : comparaison des sources anatomiques étudiées (liens, licences, ce qui a été réellement
inspecté). `rapport/couches.txt` : couche de chaque structure et part visible mesurée à chaque passe.
