# Refonte iOS d'Askēsis / Anqā — journal (novembre 2026)

Mission 17 : repenser l'expérience iPhone sans toucher au site ni dupliquer la
logique métier. Tout ce qui est propre à l'app vit sous `html.app-ios` (styles)
ou derrière `NATIF` (code) ; le web garde exactement son comportement, et la
suite de tests le vérifie à chaque étape.

Analyse, direction artistique et plan : artefact « Refonte iOS Anqā » de la
session (verdict : hybride assumé — système natif, contenu web redessiné).

## Direction artistique en six lignes

- Surfaces : les groupées d'iOS (`#000 / #1c1c1e / #2c2c2e`, `#f2f2f7 / #fff`),
  séparateurs système, plus de quadrillage ni d'ambiance floutée.
- Une seule couleur vivante : le rose Anqā (`--ios-accent`), pour l'action
  principale, l'état actif, ce qui est en cours ; un seul objet rose plein par écran.
- SF Pro partout, en points réels suivant la taille de texte du système
  (`--t-grand-titre` 34, `--t-titre2` 22, `--t-corps` 17, `--t-note` 15,
  `--t-legende` 13, `--t-mini` 12, plancher de lisibilité de l'audit) ; chiffres héros en SF Pro Rounded (`--chiffres`).
- Rayons continus (`--r-bloc` 24, `--r-cellule` 12, pilules), pas d'ombres.
- Ressorts courts (`--ressort`, `--duree-courte` 260 ms, `--duree` 380 ms),
  « Réduire les animations » respecté.
- Un héros par écran, puis des listes groupées à la Réglages ; les cartes
  restent aux objets qu'on manipule.

## Étapes

### B — Design system et navigation (fait)

- `assets/styles.css`, section « REFONTE iOS — B » : jetons, typographie,
  boutons (principal en accent, secondaire teinté, retrait au toucher),
  surfaces, titre compact, menu contextuel, mouvement.
- `index.html` : `#titre-compact` et `majTitreReplie()` (grand titre replié
  au-delà de 72 px, sauf Repas et sous une fenêtre) ; `menuContextuel()`,
  `surAppuiLong()`, clic avalé une fois après un appui long ou la fermeture
  par le voile ; `dupliquerAliment()` ; haptique déléguée (cran sur les
  sélecteurs et interrupteurs, impact léger sur l'action principale).
- Menu contextuel câblé sur les aliments d'un repas : modifier la quantité,
  dupliquer, supprimer.
- Outil : `scripts/captures-ios.js` (captures Chromium en mode app iOS, clair
  et sombre, 390 et 430 pt, écrans et états) ; `tests/outils.js` accepte
  `viewport` et `echelle`.
- Tests : « app iOS (refonte B) », « sur le web, la refonte iOS ne change rien ».

### C — Repas (fait)

- `assets/styles.css`, section « REFONTE iOS — C » : l'écran passe en colonne
  ordonnée (héros, coach, journal, tuiles) ; héros sans carte avec un seul
  chiffre héros (le reste, 34 pt arrondi), le centre des anneaux en 20 pt ;
  coach en bandeau teinté avec la seule action rose de l'écran ; journal des
  repas en listes groupées (en-tête, barre d'équilibre, macros, rangées de
  48 pt avec séparateurs, repas vide en une rangée) ; pas, eau et poids en
  trois tuiles fixes de même gabarit (icône, titre, valeur en bas), l'eau
  avec un seul « + » (250 ml).
- `index.html` : dans l'app, la roulette ne s'applique plus (clic direct,
  pas d'inclinaison) ; appui long sur la tuile de l'eau → +250, +500, +1 L,
  autre quantité, retirer.
- Tests : « app iOS (refonte C) », « sur le web, Repas garde sa roulette ».

### D — Activité (fait)

- `assets/styles.css`, section « REFONTE iOS — D » : héros de la semaine sur
  le fond système (plus de dégradé ni de quadrillage, le corps qui s'allume à
  droite, grand chiffre 56 pt arrondi, puces en surfaces) ; la prochaine
  séance est le seul bloc rose plein de l'écran (`--ios-accent-plein`, texte
  blanc dans les deux thèmes, bouton lecture blanc) ; programmes en cartes
  sans ombre ; « Créer et explorer » en liste groupée (icône, titre,
  sous-titre, chevron, rangées de 58 pt) ; séance en cours en héros nu (état
  en accent, chrono 44 pt arrondi, avancée), blocs d'exercices en surfaces
  système, séries de 46 pt, coche faite en accent ; cardio : liste des
  séances en surfaces, action principale en accent.
- `index.html` : appui long sur une carte de programme → ses options
  (modifier, dupliquer, supprimer), sans clic synthétique (le clic qui suit
  l'appui long est avalé) ; `data-id` sur les cartes.
- Note : le site applique déjà la charte « sobre » (héros sans halo) à tous ;
  les règles iOS s'y superposent avec `!important` là où la charte l'impose.
- Tests : « app iOS (refonte D) », « sur le web, Activité garde ses tuiles ».

### E — Progrès et Profil, F — Intégrations Apple, G — Validation

À venir ; voir les tâches iOS E à G.

## Vérifier

- `npm test` : le site inchangé, l'app testée en faux natif (`natif: true`).
- `node scripts/captures-ios.js <dossier>` : captures de contrôle.
- Workflow « App iOS » d'Anqa lancé avec `web: refonte-ios` : captures du
  vrai simulateur (branche `captures-ios`).
