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

`assets/atlas/atlas-peau.bin` se refait en trois temps, une fois `atlas.bin` prêt (elle s'y attache) :

1. `python outils/extraire_peau.py <Startup.blend> peau/regions.bin` : extrait de Z-Anatomy la surface du corps
   (collection « 9: Regions of human body » : la peau découpée en régions, les oreilles, les ongles, les poils),
   sans les épaisseurs (modificateur SOLIDIFY).
2. `node outils/peau.mjs peau/regions.bin donnees/atlas.bin peau/atlas-peau.bin` : assemble le côté gauche en une
   seule surface (sommets soudés, frontières en T réparées, petits trous bouchés), la range en zones (corps, tête,
   main, pied, ongle, poil, cheveux, œil), adoucit la région uro-génitale, la tient au-dessus des muscles et des os,
   l'attache au squelette (chaque sommet reprend les attaches des muscles qu'il recouvre), calcule l'ombrage de
   relief et l'épaisseur sous la peau (ce dont elle doit reculer pour laisser voir un muscle), et écrit le fichier.
   Ce fichier-là est la source de l'étape suivante : `donnees/peau-source.bin`.
3. `node outils/peau-fine.mjs [donnees/peau-source.bin] [atlas.bin] [sortie]` : refait la peau du corps en un film
   de 1,5 mm posé sur les muscles (voir « Le film » ci-dessous) et écrit `assets/atlas/atlas-peau.bin` (version 2).
   À relancer dès que `atlas.bin` ou la carrure changent : le fichier porte l'empreinte du modèle préparé, et le
   moteur refuse une peau faite pour un autre corps.

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
vérifie sur les deux fichiers). `mesures().premierSommet` dit si elle est en place.

### Le film : une peau très fine qui prend la forme des muscles

La peau de Z-Anatomy est celle d'un corps mince, lisse, à 5 ou 10 mm des muscles : posée sur le corps étoffé, elle
gommait tout le relief. Sur le corps, elle est donc remplacée par un film, fabriqué par `outils/peau-fine.mjs` :

- **Le maillage** part de la peau d'origine (zone « corps »), sans les organes de l'aine (retirés, l'ouverture
  refermée par une membrane tendue), subdivisé une fois (38 600 triangles par côté) ;
- **il est rétréci sur les muscles préparés** (étoffés, contacts éclaircis, attaches refaites : exactement ce que le
  moteur fait au chargement) : soixante tours où chaque sommet avance d'au plus 2,5 mm vers le point de muscle le
  plus proche, dans un cône de 85° autour de sa normale, s'arrête à 1,5 mm de lui, ressort s'il est entré dans la
  chair, et se lisse avec ses voisins. Il ne plonge pas dans les fentes étroites (sillon des fesses, aine) : un sommet
  ne descend pas à plus de 1,2 mm sous la moyenne de ses voisins ;
- **il suit le muscle qu'il recouvre** : chaque sommet reprend les attaches du point de muscle sous lui (mêmes os,
  mêmes poids, quaternions duaux, corde et appuis compris), au lieu des attaches de la peau d'origine. Le film bouge
  donc comme les muscles, sans glisser sur eux ;
- **il se raccorde** à la tête, aux mains et aux pieds, qui gardent la peau d'origine : sur 3 cm depuis leur bord, la
  position, les attaches et l'opacité passent du film à la peau d'origine (les sommets du bord sont les mêmes des
  deux côtés) ;
- **la couture du milieu du corps** est trouvée par la topologie (arêtes libres sur le plan de symétrie), pas par
  la position : l'intérieur des cuisses, tout proche du plan, n'en fait pas partie et ne se lie pas à l'autre jambe.

Dans le moteur : les muscles sont dessinés à part, dans une image hors écran (couleur et profondeur) ; la peau est
dessinée ensuite, opaque, et laisse voir cette image là où le muscle est juste sous elle (à moins de 1 à 3 cm le long
du regard). Le relief des muscles se lit sous la peau, les muscles colorés d'une carte ou d'un exercice ressortent
(`film: [0.2, 0.8]` : part visible d'un muscle neutre, d'un muscle coloré), et un membre qui passe devant un autre le
cache normalement, puisque la peau est opaque. Le film ne montre que son endroit (faces arrière écartées : aux plis
du coude et de l'aisselle, son envers se voyait en taches sombres). `&ecarts=1` sur la page d'essai colore l'écart
entre la peau et le muscle.

## Ce que le corps devient au chargement, et comment il se déforme

- **Le mélange des articulations.** Un sommet de muscle suit jusqu'à quatre os. Leurs déplacements se mélangent en
  quaternions duaux (une rotation et un glissement), pas en matrices : entre deux os qui tournent beaucoup l'un par
  rapport à l'autre — l'épaule bras levé, la hanche en squat, le coude plié — la chair tourne d'une part de l'angle
  autour de l'articulation, à distance constante, au lieu de couper par la corde et de s'écraser. Chaque rotation est
  prise du même côté que celle de son os parent : le mélange suit le chemin que l'articulation a vraiment pris, sans
  saut quand un os dépasse le demi-tour par rapport à un os éloigné. Le moteur écrit ces quaternions dans la texture
  de pose (rangées 2 et 3) ; le solveur de pose fait le même calcul quand il mesure le corps (`Corps.peauPosee`) : ce
  qu'il mesure est ce qui se dessine. La peau, elle, garde ses matrices et ses articulations intermédiaires.
- **L'épaule fait exception : par la corde.** Un muscle tendu entre le tronc et le bras (deltoïde, grand pectoral,
  grand dorsal, grand rond) ne tourne pas à distance constante autour de l'articulation : bras levé, il formait une
  poche à côté du bras — des « ailes » de 15 cm sous un bras tendu au-dessus de la tête. En vrai il va au plus court
  entre ses attaches. Pour les sommets partagés entre le bras (de l'humérus au bout des doigts) et le tronc, le
  moteur mélange donc la place « quaternions duaux » avec la place « par la corde » (la moyenne des places que chaque
  os donnerait au sommet) : 85 % de corde au plus (`CORDE_EPAULE`), amenés en douceur avec le partage des poids pour
  ne pas faire de marche dans le maillage ; rien au coude, ni entre la clavicule et le thorax, ni pour un sommet tenu
  par un seul os. Bras le long du corps ou à l'horizontale, les deux places se confondent presque : l'épaule reste
  ronde. Bras tendus au-dessus de la tête, la chair qui débordait de l'axe du bras passe de 15 à 9 cm (17 à 12 cm
  pendu à la barre), et l'épaule garde son volume (2 % des points proches de l'articulation s'en rapprochent de plus
  de moitié : les attaches du grand dorsal et du grand pectoral). La hanche a la même règle, derrière le centre de
  l'articulation surtout (fesse, ischio-jambiers : 80 %), peu devant (le pli de l'aine : 30 %). La part de chaque
  sommet est calculée une fois au chargement (`corde`, `marquerCorde`) et rangée dans son octet libre : le programme
  des sommets la lit (`a_corde`, multipliée par `u_corde`) ; pour la mesure, `peau()` rend la même part (`C`) et
  `Corps.peauPosee` l'applique ; `AnqaAtlas.corde(squelette)` donne la formule aux outils. Option `corde` du moteur :
  0 pour revenir au mélange d'avant.
- **Les poids repris au chargement (`reponderer`, option `poids`).** Les poids du fichier viennent de la proximité des
  os au repos, bras le long du corps : bras levé, le grand dorsal, le dentelé et le bas du trapèze tournaient sur de
  grands arcs autour de l'épaule et se déchiraient en éclats sous l'aisselle et dans le dos (au build 63, des
  triangles étirés 40 fois). Le moteur les reprend une fois au chargement : (1) l'avant-bras se tord en douceur du
  coude (tout suit l'ulna) au poignet (tout suit le radius) au lieu de dépendre de l'os le plus proche ; (2) le grand
  dorsal suit une **attache** — deux articulations ajoutées au squelette (`attache.dorsal.G`, `.D`, après celles du
  fichier ; `E.articulationsFichier` dit combien il y en a) dont le moteur calcule lui-même la pose : l'orientation du
  thorax, tournée autour d'un axe vertical — celui de l'arrondi du flanc, mesuré sur le muscle — jusqu'à suivre le
  point d'insertion du tendon sur l'humérus ; le muscle monte et tourne avec lui, et s'écarte de l'axe d'autant que le
  tronc s'élargit vers l'aisselle (l'évasement, aussi mesuré sur le muscle, rangé dans un troisième texel de la pose).
  La part de chaque sommet qui suit l'attache dépend de sa place le long de ses fibres (distances de proche en proche
  sur le muscle, dont les faisceaux séparés sont reliés à moins de 12 mm) : entière au bout du tendon, nulle à son
  origine le long de la colonne ; là où le trapèze le recouvre, il reste tenu (sinon il sortait à travers) ; (3) les
  autres muscles du tronc ne gardent le poids du bras qu'à moins de 8,5 cm de l'épaule, et celui de l'omoplate s'ils
  s'y attachent (trapèzes, rhomboïdes, dentelé antérieur…) ; (4) les poids sont lissés sur chaque muscle concerné ;
  (5) la cuisse : le bassin ne tient ses muscles que près de la hanche — entier jusqu'à 22 % de la longueur du fémur
  (≈ 9 cm sous la hanche), éteint à 50 % (≈ 20 cm), le reste revient au fémur. Les poids du fichier lui laissaient un
  quart à un tiers du milieu des ischio-jambiers, du gracile et du grand adducteur, jusqu'au-dessus du genou : au fond
  d'un squat, la règle de la hanche (par la corde) faisait pendre cette chair de 5 à 6,5 cm sous la cuisse, juste
  au-dessus du genou (vu sur iPhone, build 69). La fesse et le haut des ischio-jambiers ne changent pas.
  Résultat bras levés : le dentelé et le bas du trapèze ne s'étirent plus que 3 à 5 fois au pire (15 à 22 avant), le
  grand dorsal 8 à 13 fois (au lieu de 22 à 44) — il s'étire vers son attache, voulu. Le grand pectoral garde les
  poids du fichier (essayé avec une attache : il remontait par-dessus la clavicule, bras au-dessus de la tête). Coût :
  0,3 s au chargement (mesuré dans node).
- **Une préparation par session.** La carrure, les ombres de contact, les poids repris et la part « par la corde »
  ne dépendent que des fichiers et des options : `creer` les fait à la première ouverture et les garde pour les
  suivantes (registre `PREPARES`, par fichier chargé ; l'appli garde les fichiers en mémoire). Mesuré dans Chromium :
  0,4 s la première fois, 20 ms ensuite. `mesures()` dit si la préparation a été reprise (`preparationReprise`) et
  son temps (`preparationMs`).
- **La préparation écrite d'avance.** Les ombres de contact et les poids repris sont en plus écrits dans `atlas.bin`
  (`node outils/atlas/preparer-modele.mjs`, à relancer après toute retouche de `eclaircirContacts`, `reponderer` ou
  `etoffer`) : un bloc ajouté après les triangles (341 ko : un bit par sommet et les octets de ceux qui changent, plus
  les attaches), que l'en-tête décrit (`preparation`). Le moteur l'applique au lieu de calculer quand la carrure est
  celle prévue (1) ; les sommets et triangles du fichier restent ceux d'origine (`POIDS=0` les donne aux outils). Un
  test vérifie que le bloc redonne octet pour octet le calcul du moteur. Première ouverture dans Chromium : 62 ms au
  lieu de 0,4 s ; l'image est identique au pixel près.
- **Les ombres de contact (`eclaircirContacts`, option `ombres`).** L'ombrage de relief du fichier (octet 6) a été
  calculé au repos : le flanc sous le bras, l'intérieur du bras, la main contre la cuisse, l'intérieur des cuisses, et
  les surfaces qu'un autre muscle recouvre restaient presque noirs dès qu'ils se découvraient (bras levé, jambes
  écartées). Au chargement, ce qui regarde un autre membre tout proche (à moins de 12 cm, face à lui) et ce qu'un
  muscle recouvre de près est ramené vers l'éclairement d'une surface dégagée ; les creux entre les muscles et les os
  ne changent pas.
- **La carrure.** Le corps de Z-Anatomy est celui d'un homme mince. Au chargement, le moteur étoffe les chairs autour
  des os (`etoffer`, option `carrure` : 1 par défaut, 0 pour le corps d'origine) : chaque sommet s'écarte de l'axe des
  os qu'il suit — l'axe du membre, ou la verticale du milieu du corps pour le tronc — d'un pourcentage qui dépend de
  l'endroit (jusqu'à 30 % au milieu du bras, 18 % à la cuisse et au mollet, 11 à 13 % au thorax et aux épaules, moins
  à la taille, rien aux poignets, aux chevilles, à la tête, aux mains et aux pieds). Toutes les couches s'écartent
  ensemble : les muscles gardent leur forme, leurs voisins et leurs tendons ; le squelette ne bouge pas. La peau
  reçoit la même transformation. Les outils de contrôle (`mouvements/silhouettes.mjs`) chargent le modèle par la même
  fonction : `CARRURE=0` pour s'en passer. Les fichiers `atlas.bin` et `atlas-peau.bin` ne sont pas modifiés.
- **Une seule apparence.** L'appli montre toujours le corps sous sa peau fine : le film sur le corps, la peau
  d'origine sur la tête, les mains et les pieds (`niveauPeau: 1` ; pas de bouton « Peau »). `niveauPeau: 0` montre
  l'écorché, pour les contrôles. L'ancienne peau entière, épaisse, avec ses fenêtres au pochoir, n'existe plus.
- **La teinte de la peau.** Sur une carte comme pendant un exercice, le corps est gris et les muscles en couleur : la
  peau gardée prend la teinte du corps (un gris entre celui des muscles au repos et celui des tendons, voir
  `avecPeauAtlas` dans `index.html`), cheveux et sourcils dans la même teinte, plus sombre. La carte la donne au moteur
  par son champ `peau` (`AnqaAtlas.themeDeCarte`) : la peau n'est alors plus qu'une matière de cette couleur (`chair`
  à 0 : ni sang sous la surface, ni ongles rosés, ni iris bruns). Sans ce champ — le mode « Anatomie », aux couleurs
  naturelles — la peau reste naturelle. `apparence()` rend les couleurs en vigueur, pour les contrôles.
- **Ce que chaque image soumet.** Le mouvement tourne dans la fiche de chaque exercice : le dessin de cette apparence
  ne soumet à la carte graphique que ce qui se voit. Le modèle une fois par côté ; la passe des structures translucides
  (fantômes, voiles) ne soumet que leurs plages d'indices — à la couche 1, un seul voile sur 178 structures — et retombe
  sur le modèle entier au-delà de 24 plages ; la peau ne soumet que ses triangles (tête, mains, pieds et film du
  corps : 128 000), triés au chargement, sans rejet point par point dans le nuanceur (qui empêcherait les puces des
  téléphones d'écarter d'avance les points cachés). Soit environ 570 000 triangles par image
  (`mesures().trianglesSoumis`, vérifié par un test), en dix appels de dessin au plus.
  Les structures se dessinent de la surface vers la profondeur (couche 1, puis 2, 3, 4, et le squelette) : un muscle
  de surface dessiné d'abord masque d'avance ceux qu'il recouvre, que la carte graphique n'a plus à colorer pour
  rien ; les fantômes, eux, se posent du fond vers la surface. Même image (au plus 2/255 d'écart sur les fantômes).
- **Le mouvement dans la fiche ne tourne que s'il se voit.** `monterMouvementFiche` (dans `index.html`) regarde quatre
  fois par seconde si le cadre est à l'écran (`cadreFicheVisible`) et met le mouvement en pause sinon. Pas
  d'`IntersectionObserver` : dans le moteur web d'iOS, son premier verdict pouvait tomber pendant que la fiche glissait
  en place (« pas visible »), puis plus rien tant que rien ne se redessinait — le mouvement restait figé. Le simulateur
  iPhone l'a montré ; un test rejoue la panne.

## Le matériel

`mouvements/src/20-materiel.js` dessine le matériel avec les formes du moteur (`formesDeBase` dans `atlas3d.js`) :
cylindre, boîte, sphère, anneau, demi-anneau, prisme à six pans. Un cylindre et une boîte peuvent avoir les bords
arrondis (`r`, en mètres) : c'est ce qui fait un coussin, un disque, un profilé d'acier. Mesures d'une salle : barre
de 28 mm, disque de 45 cm, banc à 44 cm.

- Poids libres : barre olympique (manchons, butées, deux disques et un collier par côté), barre EZ ondulée, haltères
  à têtes à six pans, kettlebell, disque, ballon.
- Bancs : plat, réglable (crémaillère), décliné (boudins) ; supports de barre du développé couché ; siège ; pupitre ;
  portique de traction ; barres parallèles.
- Poulies : tour de poulie (`MAT.colonne` : bâti, chariot sur son rail, câble jusqu'à la pile), poste de tirage
  vertical (`MAT.tirageHaut`), rowing assis (repose-pieds). Presse à cuisses et hack squat : rails en profilés,
  chariot, disques. Smith machine : glissières, butées de sécurité roses, la barre portée par deux chariots.
- Machines à charge guidée (`mouvements/src/21-machines.js`) : les types d'appareils qu'on trouve en salle
  (Basic-Fit, Fitness Park, On Air), avec leurs dimensions et leurs axes de rotation, sans reprendre le dessin d'une
  marque. Un bras rigide tourne autour de son palier (`brasMobile` : moyeu à pastilles roses, profilés ovales) ; à
  chaque image, il prend l'angle qui amène sa poignée ou son boudin sur la main ou la jambe. Les mains sont posées
  sur l'arc de la poignée (`surMachine` : le palier se cherche sur la médiatrice de la course, ou dans l'axe de
  l'articulation ; `pivotEgal` et `pivotCercle` gardent le rayon constant ; poignées pivotantes quand le bras tourne
  de plus de 45°, et aux développés en prise neutre). La machine ne décide que de la main : ce que le mouvement écrit
  de l'épaule et du poignet (`hausse`, `avance`, `ceinture`, `casse`) passe tel quel. Chaque machine note ses
  paliers (`d.paliers` : point et axe de chaque bras, que les tests confrontent à l'articulation qui travaille).
  Chaque machine a son poste (`posteAssis` : assise, dossier, colonne et goupille de réglage ;
  boudins de poitrine ou de cuisses), son bâti en profilés (`batiBras`, `batiCoudes`, `batiPoteaux`) et sa pile de
  poids sous capot (`tourCharge`), posée hors du corps. Développés, écartés et pec deck, oiseau, élévations
  latérales (`machineDeltoides`), pull-over, rowing, tirage, shrug, tractions et dips assistés (`machineAssistance` :
  la plateforme des genoux reste à plat sur son levier), curl, triceps et avant-bras (`machineCoudes` : le bras
  tourne dans l'axe de flexion du coude), crunch, rotation du buste, leg extension et leg curl assis, couché ou
  debout (`posteJambes` : bras dans l'axe des genoux), abducteurs, adducteurs, kickback, lombaires, hip thrust,
  mollets assis et debout, dips assis.
- La pile de poids monte avec le mouvement : les plaques marquées `leve` suivent la longueur du câble (son minimum
  est relevé à la définition du mouvement), ou ce que dit `d.levee(info, u)` pour une machine sans câble apparent.
- Pupitre (curl, extension des triceps à la machine) : `pupitreSous` le pose sous le haut des bras (leur dessous
  mesuré de 3 à 14 cm au-dessus du coude), son bord bas à 5 cm au-delà du coude, son bord haut aussi près de
  l'aisselle que possible sans que son coin arrière entre dans la poitrine. À la machine, le bras tourne dans l'axe
  de flexion du coude (palier 12 cm en dehors) et le bâti se tient devant le pupitre, au-delà des mains.
- Les appuis : là où le corps repose sur un coussin (assise, dossier, banc, pupitre), `appuisDe` relève de quel côté
  la chair porte (des points juste devant la face, à trois instants) et le programme des sommets l'y écrase au lieu de
  la laisser traverser (au plus 1 cm d'enfoncement visible) ; `Corps.peauPosee` fait le même calcul.
- Le matériel tenu ne traverse pas le corps (`src/36-degager.js`) : haltères, kettlebells, disques, barres et ballons
  sont écartés, instant par instant, des os et des coussins qu'ils touchent (le long de la direction qui va de l'os à
  la main), 16 cm au plus ; la main suit. Une kettlebell pend sous sa poignée sans entrer dans l'avant-bras ; un disque
  se tient par le bord.
- Le haut d'un grand bâti est marqué `hors` : il ne compte pas pour le cadrage, qui se règle sur le corps et sur ce
  qu'il touche.

Les appareils de cardio (`mouvements/src/56-cardio.js`) sont dessinés avec les mêmes pièces : tapis roulant (plateau
entre deux longerons, bande, capot du moteur, montants, console, mains courantes), vélo et air bike (poutre sur deux
pieds, cadre en profilés, tige et selle, potence, console, roue carénée ou ventilateur dans sa cage, pédalier),
rameur (rail, pieds, roue à air, écran, cale-pieds, siège), elliptique, simulateur d'escalier, ergomètre de ski,
traîneau. Ils restent plus simples que les machines de musculation : pas de carénages moulés.

## Positions

Corrigées d'après une comparaison planche à planche avec une référence d'exécution (étude seulement : aucune image
de la référence n'entre dans l'appli) : couché sur un banc, les genoux sont à l'équerre et les pieds à plat ; la barre
du développé couché descend au bas des pectoraux (en haut de la poitrine sur un banc incliné) et les bras tendus sont
à la verticale ; au rowing barre, le buste est près de l'horizontale ; au squat, les appuis sont plus larges que les
épaules, pointes ouvertes, hanches sous les genoux ; debout, les pieds sont à la largeur du bassin ; au rowing assis,
les pieds sont posés sur les repose-pieds. `outils/gros-plans.cjs` montre une articulation
pendant un mouvement ; `mouvements/controle.mjs --table` reste le garde-fou.

### Debout : la posture part des jambes et tient en équilibre

Une charnière de hanche ne se règle pas en reculant le bassin « à l'œil ». C'était le cas des soulevés de terre : le
bassin reculait d'une valeur fixe pendant que sa hauteur suivait la barre ; à mi-course les jambes se verrouillaient
et basculaient de 24° en arrière alors que le buste restait couché, la barre était tenue 5 cm devant les tibias, et les
variantes aux haltères, au kettlebell et à la barre hexagonale ne pliaient pas les genoux. Vu de trois quarts à deux
instants (le catalogue), le défaut ne se voyait pas ; de profil, à cinq instants, il saute aux yeux.

Dans `src/48-hanches.js`, la posture part maintenant des jambes — l'inclinaison du tibia et la flexion du genou sont
voulues, le reste en découle — de deux façons selon ce qui fait le geste :

- **depuis le sol** (classique, sumo, sur blocs, pieds surélevés, haltères, kettlebell, barre hexagonale) : les épaules
  restent à l'aplomb de la charge, bras tendus (un peu en avant au départ, au-dessus quand elle passe les genoux, en
  arrière seulement debout) ; le tibia est avancé au départ et droit au passage des genoux ; le penché du buste qui
  satisfait les deux se trouve par dichotomie, et les genoux plient d'autant. Les jambes poussent et le buste se
  redresse ensemble. La barre suit un chemin presque droit au-dessus du milieu du pied (4,5 à 6,5 cm devant l'origine),
  qui rejoint en douceur, dans la moitié haute, l'endroit où elle pend debout ; là où les jambes avancent davantage
  (tibias au départ, genoux), elle les longe ; au-dessus des genoux, les épaules avancent ce qu'il faut pour que les
  cuisses la rejoignent (jour de 2,5 cm au plus), et les genoux reviennent un peu sous elle ;
- **en charnière** (roumain, jambes tendues, à la poulie, sur une jambe, au poids du corps, good morning,
  balancement du kettlebell) : genoux souples, les hanches reculent, le buste bascule jusqu'à ce que les mains soient
  à la hauteur voulue. La charge reste contre les jambes tant que les bras ne partent pas trop en arrière ; au-delà
  (jambes tendues, sur une jambe) elle s'en écarte et pend sous les épaules.

Les postures sont réglées une fois, à onze hauteurs de la charge (poses clés), et le geste passe de l'une à l'autre :
le soulevé de terre ne recalcule plus rien à chaque image (3,8 ms par image auparavant, 0,08 ms maintenant, mesurés
hors navigateur ; 13 ms une fois, à l'ouverture de l'exercice). Le devant des jambes ne se relit que sur la peau qui
peut se trouver à la hauteur de la charge (jambe sous le genou, cuisse et bassin au-dessus) et, pour un geste
symétrique, sur un seul côté. `node` n'est pas l'iPhone : dans le simulateur (moteur web d'iOS), ce réglage a pris de
50 à 200 ms selon que le moteur était chaud ou non.

`src/30-postures.js` donne deux outils aux autres familles : `equilibrer` avance ou recule le bassin, pieds posés,
jusqu'à ce que le centre de gravité (masses des segments d'après les tables de Dempster et Winter, charge tenue
comprise si on la donne) tombe où on veut ; `tenirDebout` règle en plus la flexion des genoux. Le squat s'en sert : en
descendant, le centre de gravité vient au milieu du pied, les genoux avancent au-dessus des orteils (tibia limité à
36°) au lieu que le bassin s'asseye derrière les talons. Le rowing penché aussi (genoux souples, la barre pend sous
les épaules), et les flexions avant des étirements. Avec un haltère dans chaque main (`porter`), les bras pendent à
la verticale et passent en dehors des genoux, au lieu de pencher avec le buste.

### Au-dessus de la tête : la charge contourne la tête, les bras se tendent

Les développés au-dessus de la tête (`src/45-developpes.js`) reliaient en ligne droite deux poses écrites à la main.
Mesuré sur le développé militaire : la barre traversait le visage (1 cm dans la tête), partait 8 cm sous les épaules
avec les avant-bras couchés, et finissait bras pliés à 64° — l'épaule monte avec le bras (ceinture scapulaire), de
9 cm ici, et la hauteur écrite n'en tenait pas compte. Aux haltères : mains collées aux épaules en bas, avant-bras à
l'horizontale, bras pliés à 75° en haut.

Le geste est maintenant réglé une fois, en poses clés du bas vers le haut, sur le corps posé :

- **à la barre** (libre, assise, derrière la nuque, guidée, développé poussé) : en bas elle repose à hauteur des
  clavicules — sa place se lit sur la surface du corps, bras en place (`Corps.barreContre` : l'axe d'une barre amenée
  contre le corps à une hauteur donnée) —, les mains juste en dehors des épaules, poignets cassés dessous, avant-bras
  verticaux. Elle monte en passant à 2,5 cm du visage (ou du crâne, derrière la nuque) : le menton se rentre, le buste
  s'efface de quelques degrés debout, puis le corps revient dessous et la barre finit à l'aplomb des épaules, la tête
  entre les bras. Guidée, elle monte droit sur un rail placé là où elle passe partout. Les mains ne glissent pas sur la
  barre ;
- **mains libres** (haltères, kettlebell, machine, élastique ; neutre, arnold, un bras, alterné, à genoux) : en bas
  les mains à hauteur d'oreille, coudes dessous ; elles montent en se rapprochant jusqu'à la verticale des épaules,
  même adossé à un dossier incliné ;
- **dans tous les cas** : le coude reste le plus bas possible sous la charge puis s'ouvre ; la hauteur du haut est
  celle où le coude garde 10° (dichotomie sur le bras posé) ; la ceinture scapulaire suit moins le bras à mesure qu'il
  passe au-dessus de la tête (option de bras `ceinture` : la part reprise, 0,24 d'ordinaire, 0,15 en haut) : l'épaule
  monte de 7 cm, pas de 11.

La ceinture scapulaire ne bascule plus (`Corps.sansRoulis`). Elle prenait une part de la rotation du bras autour de
la clavicule : bras levé par l'avant, c'était un roulis autour de l'axe gauche-droite du thorax, et l'omoplate, le
trapèze et les muscles du dos rentraient de 4 à 6 cm dans les côtes (les fentes sombres du haut du dos, au tirage
vertical). L'épaule reste exactement là où ce calcul la met — tout le geste du bras est inchangé — mais la ceinture
y arrive par une montée (autour de l'axe avant-arrière) puis une avancée (autour de la verticale) : l'omoplate glisse
sur le dos vers le haut et vers le flanc, comme elle le fait. Un test vérifie que ce roulis reste sous 5°.

Une main posée par cible n'arrive pas exactement sur sa prise : le radius tourne autour de l'ulna et le poignet se
décale de 2 à 3 cm selon la pronation. C'est sans importance pour un haltère ; pour une barre qui frôle le cou et le
visage, non. `viser` (`src/30-postures.js`) corrige la cible de l'écart constaté jusqu'à ce que la prise tombe juste.

Coût : 17 ms une fois pour la barre (22 ms guidée), 5 ms aux haltères, puis 0,07 ms par image (hors navigateur).
Le test « au-dessus de la tête… » rejoue le geste instant par instant, y compris entre les poses clés.

### Bras tendus : pendu à une barre, en haut d'un tirage, en appui renversé

Même cause, autres familles. `node mouvements/bras-leves.mjs` relève les 144 mouvements où un bras passe au-dessus de
la tête et donne, à l'instant où il est le plus levé, la flexion du coude et la montée de l'épaule. Il montrait des
bras pliés là où ils doivent être tendus : pendu à la barre fixe (tractions, relevés de jambes : 63 à 77°), en haut du
tirage vertical (69°), à la réception de l'arraché et du jeté, en haut du thruster (64 à 68°), en appui renversé
(70°), corps allongé à la roulette abdominale (61°), en haut du SkiErg (80°) — partout où la distance était comptée
depuis l'épaule au repos.

`src/30-postures.js` donne deux outils : `coudeTendu` cherche, sur le corps posé, la valeur (hauteur des mains, place
de la roue…) pour laquelle le coude le plus tendu est à 10° ; `tendre` fait de même en déplaçant le bassin (vers le bas
pendu, vers le haut en appui renversé). Avec les cibles des mains, `tendre` les pose en même temps au juste sur la
barre (`viser`) : sur une barre fixe, une main en pronation tombait de 2 à 3 cm à côté — au-dessus de la barre en haut
d'une traction. Les tractions ont cinq poses clés : entre deux, les mains restent sur la barre à 3 mm près.

Pendu, les mains ne bougent pas : quand le bassin bascule (relevés de jambes) les épaules restent sous la barre ; en
vrille (genoux obliques, essuie-glaces), ce sont le bassin et les jambes qui tournent sous des épaules qui restent
face à la barre — la vrille tournait les épaules et pliait un bras à 50°. En appui renversé, hausser les épaules
repousse le sol : le corps monte, bras tendus (il descendait, coudes pliés à 40°).

Le test « pendu ou bras levés… » vérifie les coudes et la place des mains sur la barre, instant par instant.

### La prise : la main se referme sur la barre

Mesurée sur la vraie peau des mains (`atlas-peau.bin`, posée comme le moteur la pose), l'ancienne prise faisait passer
la barre 11 mm dans la paume et 6 à 13 mm dans les premières phalanges : les doigts avaient des angles fixes et la
barre était à 24 mm du plan de la main, sous la peau de la paume (18 mm).

`Corps.prise` (`src/10-corps.js`) calcule la main sur une barre, une fois par côté et par rayon, dans le repère de la
main au repos — la prise ne dépend pas du reste de la pose :
- la barre est posée sur la paume : son axe à `PEAU_PAUME + rayon` du plan de la main (17,5 + 14,5 mm par défaut ;
  `b.rayon` pour un autre diamètre) ;
- chaque phalange des quatre doigts, de la première à la dernière, s'enroule jusqu'à être tangente à la barre (sa
  pulpe s'écrase de 5 mm au plus) ; une phalange qui entrerait dans la barre dès le départ se redresse, et le bout
  du doigt ne rentre pas dans la paume ;
- le pouce fait le tour par l'autre côté, à côté de l'index : levé devant la paume, tourné pour présenter sa pulpe à
  la barre, il s'abaisse puis s'enroule jusqu'à la barre, ou jusqu'au dos de l'index et du majeur.
Les phalanges y sont des capsules (`PHALANGES` : épaisseur côté pulpe et côté dos, longueur et angle de la dernière
phalange), mesurées sur la peau de la main gauche au repos (85e centile, de 15 à 85 % de la longueur de l'os).

La peau qui entre encore dans la barre (pulpe écrasée, peau entre le pouce et l'index, à moitié portée par le pouce)
est posée à sa surface par le moteur, comme la chair d'une vraie main : `atlas.tenus([{ c, a, r, h }])` reçoit à chaque
image ce que serrent les mains (`info.tenus`, rempli par `bras` pour les doigts `'barre'`), et le programme de la peau
y repousse les sommets des mains et des ongles.

Les autres mains, par le même calcul de contact :
- à plat (`Corps.aPlat`, doigts `'plat'` : sol, banc, mur) : la surface est sous la paume, à `L.creux` + 6 mm du plan
  de la main ; chaque phalange s'y pose (les doigts du modèle, un peu pliés au repos, entraient de 16 à 25 mm dans le
  sol aux pompes), le pouce aussi, en tournant autour de sa base ;
- poing (`'poing'`) : les doigts se referment comme sur une barre de 4 mm, jusqu'à la paume, le pouce par-dessus ;
- détendue : les doigts se plient un peu plus de l'index vers le petit doigt.
Sous la peau des mains, la chair portée par les os des doigts (tendons des fléchisseurs et des extenseurs, petits
muscles de la main) n'est pas dessinée (`u_doigts`, `v_doigt` dans le programme des muscles) : doigts très pliés, elle
perçait la peau en lames blanches aux jointures. Sans peau (`niveauPeau` 0), elle reste.

`node outils/mains.cjs sortie.jpg liste.txt` montre la main de près sous tous les angles, sans le reste du matériel
(une ligne : `exercice | G|D | az,el | u1,u2,… [| champ]`). Le test « la main se referme sur la barre… » mesure chaque
phalange et le pouce contre la barre, sur la peau réelle, des deux côtés (développé, soulevé de terre, curl, traction).

### Le poignet : le coude se place pour lui

Une main posée par une cible (prise, sens du coude, paume) arrivait sur sa prise sous l'angle où le bras la menait :
134 mouvements tenaient leur barre ou leur poignée le poignet plié de plus de 30°, 44 le poignet tordu de plus de 20°.
`Corps.bras` (`src/10-corps.js`) règle maintenant le bras sur le poignet :
- **la main fermée suit l'avant-bras** : refermée sur une barre ou une poignée (doigts `'barre'`), elle tourne autour
  de ce qu'elle tient pour rester dans l'axe de l'avant-bras — ce qui est tenu ne bouge pas, le poignet ne casse plus ;
- **le coude tourne autour de la ligne épaule–poignet** (`tour`, 85° au plus) quand la main demande plus de pronation
  que l'avant-bras n'en a (de −15° à 175°, 15° de torsion tolérés au poignet), quand l'avant-bras arrive en biais sur
  la barre ou sur la main à plat (20° d'inclinaison tolérés), ou quand il se couche vers les doigts d'une main à plat
  (le poignet ne casse pas au-delà de 95°). Le tour cherché est le plus proche de la pose décrite ; quand les deux
  côtés se valent, il se réduit à rien plutôt que de sauter de l'un à l'autre (c'est alors la pose qu'il faut revoir) ;
  le coude ne descend pas sous le sol.
Ce que la description d'un bras peut préciser (en plus de `prise`, `pole`, `paume`, `dirMain`, `doigts`, `rayon`,
`hausse`, `avance`, `ceinture`) :
- `autour` : l'axe d'une barre fixe (un vecteur) ; `'libre'` : la poignée tourne librement avec la main (câble,
  élastique), la main reste droite ; `false` : la main garde l'orientation décrite ;
- `cote` (avec `autour`, un vecteur) : 1 prise par-dessus, −1 par-dessous — la main n'a alors pas à être décrite, et
  elle tourne d'un seul tenant autour de la barre, même d'un demi-tour (l'épaulé : de la barre qui pend à la barre
  sur les épaules) ; `libre: true` : ce qui est tenu d'une seule main s'incline avec elle (haltère, kettlebell) ;
- `casse` : l'extension gardée au poignet, en degrés (la barre d'un développé, posée sur le talon de la main) ;
- `aplomb` : `false` pour ne pas régler l'inclinaison, ou un nombre de degrés tolérés au lieu de 20 (barre sur la nuque
  et prise large de l'arraché : l'avant-bras monte en biais, 40 à 45°) ;
- `pivot` : la main à plat pivote sur sa paume pour suivre l'avant-bras (ballon tenu entre les mains).
`info.angles[c]` donne, par bras posé, la pronation, la flexion du coude, la torsion laissée au poignet et le tour ;
`info.flexions[c]` le sens où plie le coude (défini même bras tendu).

### D'une pose clé à la suivante : tout se mélange

`mel` (`src/00-maths.js`) mélange deux poses valeur par valeur. Ce qu'une seule des deux décrivait était gardé tel
quel jusqu'à la pose suivante, puis tombait d'un coup — ou ne bougeait pas du tout : les neuf haussements d'épaules
ne donnaient leur `hausse` que dans la pose du haut et restaient figés, épaules levées. Désormais :
- un réglage de bras absent d'une pose y vaut sa valeur ordinaire (`casse`, `hausse`, `avance` : 0 ; `ceinture`), de
  même les angles du tronc et du cou (`torsion`, `inclinaison`, `couRot`…) : on y va, ou on en revient, peu à peu ;
- une main dont le sens (`dirMain`) n'est donné que dans une pose : ce sens pèse de plus en plus, ou de moins en
  moins (`kMain`), mêlé à celui de l'avant-bras ;
- un bras écrit en angles ou en directions, converti en cible parce qu'une autre pose du mouvement en est une
  (`unifier`, `src/35-definition.js`), garde sa description (`parAngles`) : entre deux poses qui l'ont toutes deux, il
  va de l'une à l'autre par ses angles — la main décrit un arc autour de l'épaule au lieu d'une ligne droite qui la
  ferait passer contre l'épaule, bras replié (du saut bras en l'air à la station debout d'un burpee) ;
- le pôle relevé sur un bras posé (`poleDe`) est de longueur 1, comme ceux qu'on écrit : celui d'un bras tendu, long
  de 2 cm, ne pesait rien dans le mélange, et le coude basculait au dernier instant ;
- un bras dégagé (voir `degagerTenu`) atteint sa portée en douceur sur ses deux derniers centimètres : tendu sur une
  cible hors de portée, il se repliait d'un coup dès qu'elle y revenait.
Écrire un mouvement : deux poses voisines décrivent le bras de la même façon autant que possible ; un pôle ne doit pas
se confondre avec la ligne de l'épaule à la main (le coude y bascule) ; une main qui passerait contre l'épaule en
ligne droite reçoit une pose de passage, ou s'écrit en angles.

## Les mouvements des exercices

Chaque exercice de la bibliothèque (`EXERCICES_BASE` dans `index.html`) a son mouvement. Tout est dans `mouvements/` :

- `table.txt` : une ligne par exercice, `identifiant | mouvement | nom`. Le mouvement s'écrit en quelques mots :
  une famille, puis ses options — `curl hal assis alt`, `developpe barre incline`, `traction large`,
  `pompe diamant`, `etire pigeon`, `cardio rameur`… `amp=0.5` (valable partout) réduit l'amplitude de moitié.
- `src/*.js` : les sources, assemblées dans l'ordre des numéros. `00-maths` et `10-corps` (le solveur : bassin,
  colonne, bras et jambes par cibles ou par angles), `20-materiel` (barres, haltères, bancs, poulies : voir
  « Le matériel »), `21-machines` (machines à charge guidée), `30-postures` (debout, assis, couché, planche…),
  `35-definition` (lecture du mouvement, poses clés, appuis des pieds), puis une famille de mouvements par fichier
  (`42-curl` … `58-etirements`) et `90-animation` (la lecture en boucle, le cadrage, le filet qui garde le corps
  au-dessus du sol).
  Les options qu'une famille comprend sont celles que son code lit (`o.nom`).
- `node mouvements/construire.mjs` : assemble `assets/atlas/atlas-mouvements.js` (sources + table).
- `node mouvements/controle.mjs --table` : contrôle tous les exercices sans moteur 3D (mouvement défini, valeurs
  finies, rien sous le sol, mains et pieds à portée de leurs cibles, options et matériel connus) et n'affiche que
  les problèmes ; `node mouvements/controle.mjs "curl hal assis"` pour un seul mouvement. Le même contrôle tourne
  dans la suite de tests de l'appli.
- `node mouvements/equilibre.mjs --table` : contrôle d'équilibre des gestes debout. À neuf instants de chaque mouvement
  où les deux pieds sont à plat et où rien d'autre ne porte le corps, le centre de gravité est comparé à l'appui des
  pieds (hors d'appui seulement s'il l'est quelle que soit la charge tenue, de rien à une fois le poids du corps), et
  les jambes verrouillées qui basculent en arrière sont relevées. `--tout` affiche aussi ce qui va bien ; un motif
  après `--table` limite à une famille. 263 mouvements jugés ; le même contrôle tourne dans les tests de l'appli.
- `node mouvements/mains-vides.mjs --table` : une main refermée tient-elle quelque chose ? À cinq instants de chaque
  mouvement qui a du matériel, la distance du creux de chaque main fermée à la forme la plus proche (au-delà de 6 cm,
  elle serre le vide). 623 mouvements jugés ; dans les tests de l'appli.
- `node mouvements/poignets.mjs --table` : flexion, extension, inclinaison et torsion de chaque poignet, à neuf
  instants (limites : 85°, 95°, 45°, 20°). Les gestes qui les dépassent pour de bon sont nommés dans `ADMIS`, avec ce
  qu'on leur accorde (pompes mains sous le corps, mains derrière la tête : 22 mouvements). `DETAIL=1` donne chaque
  instant. Dans les tests de l'appli.
- `node mouvements/sauts.mjs --table` : les à-coups. Chaque mouvement est joué à sa vraie cadence (30 images par
  seconde) ; sont relevés un coude ou un poignet qui se déplacent d'un coup (plus de 3 et 4 cm d'une image à la
  suivante, dont plus de la moitié en un huitième d'image), une main qui pivote d'un coup (20°), un coude qui file à
  plus de 4 m/s. C'est le seul contrôle qui voit ce qui se passe entre deux instants. Dans les tests de l'appli.
- `node mouvements/traversees.mjs --table [--json f]` : le corps traverse-t-il le matériel ? Chaque mouvement posé à
  sept instants, les points du corps cherchés dans chaque forme ; les contacts voulus ne sont pas des fautes (main
  sur sa poignée, pied sur son appui, chair enfoncée dans un coussin de moins de 2,2 cm, ou tirée dedans par
  l'écrasement : elle y est cachée). Sur les 762 mouvements : 274 fautifs au départ, 37 aujourd'hui, de 3,5 cm au
  plus et de moins de 2 cm pour la plupart (contacts de barre contre le buste, coussins de machines).
- `node mouvements/deformations.mjs --table [--json f]` : l'épaisseur de chair au-dessus de l'os, comparée au repos
  (gonflements, creux), par partie du corps. À lire avec les images : le grand dorsal s'étire voulu vers son attache,
  l'avant-bras se tord voulu en pronation.
- `node mouvements/bras-leves.mjs [motif]` : relevé des mouvements où un bras passe au-dessus de la tête — flexion du
  coude et montée de l'épaule à l'instant où le bras est le plus levé, du plus plié au plus tendu. Il ne juge pas (un
  triceps derrière la nuque a le coude plié) : il se lit après toute retouche des postures bras levés.
- `node outils/bande-exercice.cjs <dossier> 90,5 e29 e30` : un exercice à cinq instants côte à côte, de profil (ou
  `appli` pour la vue de l'appli) — c'est là que se juge un geste.
- `node outils/planche-mouvements.cjs sortie.png "pompe diamant" "dips anneaux | Dips aux anneaux"` : planche de
  contrôle dans le vrai rendu (début, milieu, fin de la répétition). `appli/essai-mouvement.html?spec=…` ou
  `?ex=<identifiant>` montre un mouvement seul (`&peau=1` pour la peau de l'appli, `&carrure=0` pour le corps
  d'origine). `node outils/grille.cjs sortie.jpg liste.txt` : une grille de mouvements, chacun à un instant et sous
  une vue donnés (`MOUVEMENTS=fichier` la rend avec un autre `atlas-mouvements.js` : la même planche avant et après
  une retouche ; les contrôles de `mouvements/` lisent la même variable) ; `node outils/gros-plans.cjs sortie.jpg liste.txt` : une articulation en gros plan pendant un
  mouvement (contrôle des déformations).
- `node outils/video-planche.cjs sortie.mp4 "ex=e338" "ex=e20 | Traction"` : plusieurs exercices côte à côte, en
  vidéo, tels que l'appli les montre (peau fine, muscles de l'exercice en couleur) ; `node
  outils/apercu-exercice.cjs sortie.jpg e338` : un exercice à un instant donné. Les couleurs sont calculées par l'appli elle-même
  (`outils/exercices-appli.cjs` l'ouvre dans le navigateur de test).
- `node mouvements/sonde.mjs "<mouvement>" [instant]` : hauteur du point le plus bas de chaque région du corps,
  pour régler une pose au sol.
- `node outils/catalogue-mouvements.cjs <dossier>` : le catalogue de toute la bibliothèque, groupe par groupe —
  pour chaque exercice, le départ et l'arrivée de son mouvement, tel que l'appli le montre (planches
  `cat-<groupe>-<n>.jpg` et `catalogue.json`, qui dit où trouver chaque exercice). Les vues sont gardées d'une fois
  sur l'autre : seuls les mouvements nouveaux ou modifiés sont rendus (un quart d'heure pour tout refaire, en rendu
  logiciel).

Ajouter ou corriger le mouvement d'un exercice : modifier sa ligne dans `table.txt` (ou la famille dans `src/`),
relancer `construire.mjs`, puis `controle.mjs --table` (et `mains-vides`, `poignets`, `sauts` pour ce qui touche
aux bras), regarder le résultat sur une planche, et refaire les miniatures (ci-dessous). Un exercice ajouté à la bibliothèque sans ligne dans la table fait échouer les tests de
l'appli.

## Les miniatures des exercices

Dans les listes de l'appli (bibliothèque, choix d'un exercice, séance, programmes), chaque exercice a sa miniature
animée : le corps de l'atlas qui exécute son mouvement, rendu par l'appli elle-même (mêmes couleurs que la fiche,
muscles qui travaillent en rose, même peau, même matériel). Trois fichiers par exercice, dans `assets/atlas/vignettes/` :

- `<identifiant>.webp` : l'image fixe, 176 points (la case de 58 pt de la bibliothèque sur un écran ×3), fond
  transparent — la case donne le fond de la fiche, sombre ou clair. Elle s'affiche tout de suite, chargée près de
  l'écran seulement.
- `<identifiant>.clair.mp4` et `<identifiant>.sombre.mp4` : une répétition entière en boucle (10 images par seconde,
  16 à 40 images), qui part de l'image fixe et garde son cadrage, sur le fond de la case de chaque thème (H.264 :
  la vidéo n'a pas de transparence, elle porte ce fond, peint par le navigateur à partir du CSS même de l'appli).
  Autour de 8 ko. La boucle se pose sur l'image quand la case reste à l'écran un instant, quatre au plus à la fois
  (le mécanisme des anciennes mini-vidéos, `vignetteEnVideo`), passe à l'autre fond quand le thème change, et ne se
  lance jamais quand l'appareil demande des animations réduites.

- `node outils/atlas/outils/vignettes.cjs` (depuis le dépôt) : rend les miniatures qui ne sont plus à jour — mouvement,
  couleurs, moteur ou modèle changés — et retire celles des exercices sortis de la bibliothèque. Le relevé
  `mouvements/vignettes.json` garde, pour chacune, le mouvement montré, l'instant choisi, le départ de la boucle, sa
  période, son nombre d'images, les poids et sa clé. Tout refaire (`TOUT=1`) prend plus d'une heure en rendu logiciel
  (une demi-seconde par image du corps) ; des identifiants séparés par des virgules pour quelques-unes ; `SORTIE=<dossier>`
  pour un essai hors du dépôt.
- L'instant de l'image fixe, et donc le départ de la boucle : l'arrivée du mouvement (bras montés, barre tirée, buste
  enroulé, bas du squat…), sauf si le départ est nettement plus fléchi (soulevé de terre pris au sol), mesuré aux
  coudes, genoux, épaules, hanches et à l'enroulement de la colonne ; le pont fessier montre toujours ses hanches
  hautes. Le cadrage tient toute la répétition et son matériel : le corps ne saute pas quand la boucle remplace l'image.
- Les tests de l'appli vérifient que chaque exercice de la bibliothèque a ses trois fichiers, rendus sur le mouvement
  de la table (une ligne de `table.txt` changée sans refaire les miniatures les fait échouer), et que le fond peint
  dans les boucles est celui que la feuille de style donne à la case.
- Un exercice créé par l'utilisateur, ou dont une vidéo ou des photos ont été posées dans Administration, garde ce
  qu'il avait (sa photo, ou la silhouette de son groupe). En séance, toucher la miniature ouvre l'atlas sur le
  mouvement de l'exercice.

## Les vidéos d'exercice rendues dans Blender (prototype : curl aux haltères)

Le même corps et le même moteur de mouvement que l'atlas, mais en pleine résolution (les 178 muscles de Z-Anatomy
sans allègement, 394 177 sommets) et rendus par Cycles : écorché monochrome, muscles qui travaillent en rouge (les
principaux plus soutenus), relief des fibres, éclairage de studio, ombres au sol, fond sombre, haltères modélisés.
Trois étapes, dans `video/` :

1. `SOURCES=<dossier de muscles.bin, squelette.bin, regions.bin> node --max-old-space-size=8000 video/exporter.mjs
   "curl hal" 70 curl.bin` : reprend chaque sommet du modèle complet sur l'atlas préparé (attaches, part « par la
   corde », carrure), soude la peau des mains, et pose le mouvement image par image au tempo d'une vraie répétition
   (pause en bas, montée 1 s, contraction en haut, descente freinée 1,1 s ; 70 images à 25 par seconde, la boucle se
   referme sur la première).
2. `python video/scene.py curl.bin images 0-69 1080 48` (Python avec le module `bpy` de Blender 5) : construit la
   scène, déforme chaque pièce comme le moteur de l'appli (quaternions duaux), gonfle le biceps et le brachial à la
   contraction, place les haltères sur la poignée du moteur et rend chaque image sur fond transparent.
3. `bash video/assembler.sh images curl-halteres` : pose les images sur le fond et écrit la boucle en H.264 et en HEVC.

Mesuré ici (4 cœurs, sans carte graphique) : 85 s par image en 1080 × 1080, soit 1 h 40 pour la boucle ; la boucle
pèse 324 ko en H.264 et 178 ko en HEVC. Les scripts ne savent rendre que des haltères pour l'instant : le reste du
matériel et le choix des muscles en rouge par exercice viendront si cette qualité est retenue.

Licence : Z-Anatomy est sous CC BY-SA 4.0. Les vidéos qui en sont tirées sont des adaptations : elles portent la
mention « Z-Anatomy, CC BY-SA 4.0 » et restent sous cette licence.

Ce que le mouvement ne montre pas : les
déplacements (fentes marchées, marches latérales) se font sur place ; les mouvements à plusieurs temps (relevé
turc, haltérophilie) passent par quelques poses clés ; les muscles s'étirent et se raccourcissent avec les os mais
ne gonflent pas à la contraction.

`rapport/sources.json` : comparaison des sources anatomiques étudiées (liens, licences, ce qui a été réellement
inspecté). `rapport/couches.txt` : couche de chaque structure et part visible mesurée à chaque passe.
