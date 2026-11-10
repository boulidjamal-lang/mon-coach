# Registre des corrections — audit du 9 novembre 2026

Suivi des 34 anomalies de l'audit, lot par lot. Statuts : À analyser · À corriger · En cours · Corrigée · Tests réussis · Tests échoués · En attente de validation · Non reproductible · Non corrigible dans l'environnement actuel.

Branche de travail : `corrections-audit` (dépôt mon-coach). Rien n'est mis en ligne sur `main` ni envoyé sur TestFlight sans l'accord explicite « Pousse ». Aucun SQL n'est exécuté sur la production par l'assistant : les scripts sont remis avec leur requête de contrôle (section « Actions côté production »).

## État par anomalie

| Id | Gravité | Lot | Anomalie | Statut | Notes |
|----|---------|-----|----------|--------|-------|
| SEC-01 | P0 | 1 | Script 1 recrée des règles ouvertes | Tests réussis (code) · SQL prod à passer | Sonde réelle `admin_regles_ouvertes()` ; script 1 sans règle ; textes corrigés |
| SEC-02 | P1 | 7 | Ni CSP ni intégrité CDN (web) | Tests réussis (phase 1) | `integrity` + `crossorigin` sur les 3 bibliothèques (hachages vérifiés contre les CDN et les paquets), URL explicite de supabase-js, méta CSP (scripts : page + 2 CDN ; connexions : services connus ; ni cadre ni plugin) ; toute violation fait échouer un test ; retirée dans l'app iPhone. Phase 2 (sans 'unsafe-inline') au lot 14 |
| SEC-03 | P1 | 6 | Jetons Withings et clé IA dans le profil synchronisé | Tests réussis | Clé IA : lot 2. Jetons Withings : table `withings_jetons` fermée à l'appli, déclencheur `profil_sans_jetons`, client sans jeton (`appelWithings`, `state` OAuth) ; suite complète 160/160 |
| SEC-04 | P1 | 2 | Clé Gemini utilisée depuis le téléphone ; porte d'entrée photo liée à l'ancien chemin | Tests réussis | Plus de clé distribuée par l'administration ; porte d'entrée sur `iaDisponible()`. Clé personnelle conservée (décision 1 en attente) |
| LEG-01 | P1 | 3 | Médias tiers sans licence sur le site | Tests réussis | Site aligné sur l'app : aucun média SmartWorkout, ExerciseDB ni wger ; tables vidées, 1 622 mini-vidéos retirées des deux dépôts. Purge de l'historique Git : décision 3 en attente |
| TECH-02 | P1 | 5 | SQL sans migrations ni suivi | Tests réussis | `supabase/migrations/` (9 fichiers générés depuis index.html par `scripts/exporter-sql.mjs`, rejouables sur une base vide), test anti-dérive en CI, job `supabase db push` sur main si les secrets existent (décision 4 : baseline à confronter à la production) ; script 3 trouve seul la colonne du nom ; création de `aliments_partages` ajoutée (elle n'existait qu'en production) |
| QA-01 | P1 | 5 | Règles d'accès jamais testées | Tests réussis | `tests/sql.test.js` : Postgres local éphémère (initdb) + double de Supabase ; 5 scénarios (isolation des 5 tables, anonyme, admin, fonctions réservées, rejeu du script 1, gymbros et défis) ; inclus dans `npm test` et le CI |
| OPS-01 | P1 | 4 | Aucun build TestFlight depuis le 6 novembre | Tests réussis | Build #33 envoyé le 9 nov. à 15 h 05 UTC ; durcissement (certificat persistant) restant |
| SEC-05 | P2 | 8 | Administrateur reconnu par e-mail | Tests réussis (phase 1) | Table `admins` (identifiant du compte) + `est_admin()` dans le script 2, amorcée par l'e-mail depuis `auth.users` (plus besoin de l'UUID : décision 5 levée) ; les 38 comparaisons d'e-mail des scripts 2, 3, 4, 5, 6, 8 remplacées par `est_admin()` ; `je_suis_admin()` devient un alias ; client : `verifierAdminServeur()` (rpc `est_admin`), e-mail en repli. Phase 2 (retirer l'e-mail) : SQL prêt, après contrôle en production |
| SEC-06 | P2 | 8 | Accès administrateur total | Tests réussis (phase 1) | Chaque consultation d'un compte, de ses statistiques et chaque export sont consignés dans `journal_admin` (`consultation`, `consultation_stats`, `donnees_exportees` ; import et effacement l'étaient déjà). Phase 2 (lecture par fonctions dédiées à la place de l'accès RLS direct) : décision 6, non engagée |
| SEC-07 | P2 | 2 | Proxy IA générique | Tests réussis · à déployer | Tâches typées, consigne de rôle imposée, chaque réponse comptée, erreurs génériques ; plafond de texte propre au programme sur mesure et aux demandes sans tâche (correctif du 10 novembre : 20 000 caractères refusaient la bibliothèque d'exercices, environ 67 000) ; fonction `ia` à redéployer par le propriétaire |
| SEC-08 | P2 | 6 | Fonction Withings hors dépôt, sans authentification | Tests réussis | `supabase/functions/withings/index.ts` versionnée : session exigée, origines de l'appli, URL de retour imposée, Pro exigé ; 2 tests de fonction, 1 test SQL, 1 test d'appli ; à déployer (actions côté production) |
| TECH-01 | P2 | 14 | Monolithe d'un seul fichier | Tests réussis (étape 1) | Les 4 920 lignes de CSS sortent dans `assets/styles.css` (en-tête : où vivent les jetons de dessin et comment la feuille est organisée) ; la page n'en garde que la règle du dégradé SVG ; préchargée hors ligne et embarquée dans l'app. Index.html : 36 100 → 31 150 lignes. Étapes suivantes (non engagées) : scripts SQL servis depuis `supabase/migrations`, découpage du JavaScript par écran, CSP sans `'unsafe-inline'` |
| PERF-01 | P2 | 11 | Premier chargement lourd | Tests réussis | `assets/recettes.js` (424 Ko gzip) chargé après le premier affichage ou à la demande, plus en bloquant la page ; toujours préchargé hors ligne par le service worker |
| DATA-01 | P2 | 12 | Tout dans localStorage | Tests réussis | Couche de stockage : les 5 gros blocs (journées, profil, programmes, historique, exercices perso) dans IndexedDB (`askesis/blocs`), localStorage en simple copie ; un stockage plein n'empêche plus d'enregistrer ; reprise automatique des données d'une ancienne version ; `viderDonneesLocales` vide aussi IndexedDB |
| A11Y-01 | P2 | 13 | Zoom bloqué, taille de texte iOS ignorée | Tests réussis | Le pincement était déjà permis (balise viewport sans `user-scalable=no`, `touch-action: manipulation` ne retire que le double appui) : commentaire périmé retiré. Taille de texte : la racine (tout le dessin est en rem) suit `--echelle-texte`, mesurée sur `-apple-system-body` (Dynamic Type, iPhone/iPad), bornée 0,85–1,35, remesurée à chaque retour dans l'appli ; sans effet où le mot-clé n'existe pas |
| A11Y-02 | P2 | 10 | 18 champs sans libellé, textes < 12 px | Tests réussis | `aria-label` sur les 18 champs ; plus aucun texte sous 12 px (règles 11 px et < 0,76 rem relevées) ; `--text-muted` clair #5f5f67 (contraste ≥ 5:1) |
| MET-01 | P2 | 9 | Protéines surestimées (IMC élevé) | Tests réussis | Masse maigre estimée (Deurenberg) au-delà d'un IMC de 30 : 120 kg → ~170 g au lieu de 264 g |
| MET-02 | P2 | 15 | Ni fibres, sucres, sel, AGS | Tests réussis | Les aliments portent `fib`/`suc`/`sel`/`ags` (g) quand la source les donne : étiquette OpenFoodFacts (`fiber_100g`, `sugars_100g`, `salt_100g` ou sodium × 2,5, `saturated-fat_100g`), colonnes de la table d'aliments détectées (fibres, sucres, sel ou sodium mg, AG saturés), saisie détaillée facultative ; le total du jour les affiche avec les repères ANSES/OMS (fibres ≥ 30 g, sucres ≤ 10 % kcal, sel ≤ 5 g, AGS ≤ 10 % kcal) et dit sur combien d'aliments il repose, jamais un faux 0 |
| MET-03 | P2 | 9 | Âge et taille par défaut silencieux | Tests réussis | `computeTargets().estime` ; ligne « Objectif estimé · indique ton âge et ta taille » sous l'anneau, qui ouvre Mon corps |
| MET-04 | P2 | 15 | Pas d'aide cru/cuit | Tests réussis | Aide dans la saisie : pour un féculent, une légumineuse, une viande ou un poisson pesés cuits alors que les valeurs valent pour le cru, l'équivalent cru est proposé (facteurs CIQUAL indicatifs : riz 2,8, pâtes 2,3, légumineuses 2,4-2,5, viande 0,75, poisson 0,8) ; conversion sur demande seulement, annulable ; rien pour un aliment déjà cuit |
| UX-01 | P2 | 10 | Héros « 0 série » en début de semaine | Tests réussis | Semaine vide : la séance à faire passe en tête, le bilan de la semaine passée remplace le « 0 » |
| UX-02 | P3 | 9 | Formats de nombres incohérents | Tests réussis | `nombreFr` groupe avec une espace insécable visible ; « % » insécable sur la carte Calories |
| UX-03 | P3 | 9 | Deux projections de poids | Corrigée | La courbe dit « dans N j » quand elle ne projette pas jusqu'au poids visé ; aria-label explicite |
| UX-04 | P3 | 10 | « + » grisé sur Progrès (barre HTML) | Tests réussis | Masqué (à sa place) sur Progrès, Profil et Administration, comme la barre native |
| DA-01 | P3 | 10/14 | Accent multi-rôles | Corrigée (partie 1) | « Annuler » des feuilles en couleur de texte ; jetons sémantiques complets au lot 14 |
| MET-05 | P3 | 9 | ml comptés comme g | Tests réussis (saisie manuelle) | `densiteLiquide()` appliquée à la saisie manuelle en ml (valeurs pour 100 g) ; OpenFoodFacts inchangé (valeurs souvent déjà pour 100 ml) |
| MET-06 | P3 | 9 | Plancher = métabolisme de base | Tests réussis | Plancher jamais sous 1 200 kcal (femme) / 1 500 kcal (homme) ; `plancherRaison` |
| TECH-04 | P3 | 3 | Copie obsolète dans le dépôt Anqa | Corrigée | Racine du dépôt Anqa réduite à ios-app/, .github/ et un LISEZMOI ; la doc Withings déplacée dans mon-coach |
| QA-02 | P3 | 4 | Captures du simulateur blanches | Tests réussis | Annonce après peinture, image presque vide reprise une fois ; CI #34 : 14 captures, aucune vide |
| PERF-02 | P3 | 11 | Rendu complet à chaque action | Non reproductible dans l'environnement actuel | 19-30 ms par écran mesurés sur poste (Chromium) : aucun blocage mesurable ; la mesure sur iPhone réel n'est pas possible ici. À refaire sur appareil (Safari › Développement › Chronologie) avant toute optimisation |
| SEC-09 | P3 | 5 | `est_bloque()` exécutable par tous | Non corrigible tel que proposé (faux positif de l'audit) | Le test SQL a montré que les règles l'évaluent avec les droits du compte : la révoquer coupe l'accès de chacun à ses propres lignes. Elle reste exécutable, commentée ; portée limitée (entrée UUID) |
| DATA-02 | P3 | 12 | Profil : le dernier qui écrit gagne | Tests réussis | `fusionnerProfil` à trois versions (base `bases.profil`, appareil, serveur) : champ changé d'un seul côté → passe ; des deux → le plus récent ; dictionnaires (pesées par date…) fusionnés clé par clé ; suppressions respectées ; la fusion repart au serveur si elle diffère |
| RESP-01 | P3 | 10 | Animation d'entrée non réduite | Tests réussis | `.ecran` dans le bloc animations réduites ; `html { overflow-x: clip }` |

## Lots

### Lot 1 — SEC-01 (P0)

- Fichiers : `index.html` (`SQL_SUPABASE`, `SQL_RLS`, `SONDES_SQL_ADMIN.rls`, `LIBELLES_ETAT_SQL`, `verifierServeurAdmin`, textes de l'écran Serveur et SQL), `tests/appli.test.js`.
- Changements : le script 1 ne crée plus aucune règle (les `drop policy` restent et retirent une ancienne règle ouverte) ; le script 2 crée `admin_regles_ouvertes()` qui compte les règles `using (true)` / `with check (true)` sur les cinq tables de données ; la sonde « Sécurité des données » l'appelle et affiche « Accès ouvert à tous » en rouge si le compte n'est pas 0 ; textes de l'écran corrigés.
- Tests : « Serveur et SQL » adapté ; nouveau test « règle d'accès ouverte signalée en rouge, script 1 sans règle ouverte » ; suite complète : 7 + 155 tests réussis.
- Risque résiduel : l'état réel de la production n'est pas connu (voir actions ci-dessous).

### Lot 2 — SEC-04, SEC-07 (P1, P2)

- Fichiers : `index.html` (`iaDisponible()`, `iaIndisponible()`, `analyserRepasGemini`, `appliquerGeminiKeyEffective`, `majNoteCleIA`, `geminiParServeur`, appels typés `journee` / `recettes` / `periode` / `programme`, fiche admin sans clé, `SQL_RLS` : `admin_liste_comptes` sans `gemini_key`, `drop function admin_definir_cle_gemini`), `supabase/functions/ia/index.ts`, `tests/appli.test.js`, `tests/fonctions.test.js`.
- Changements : l'IA est « disponible » par le serveur ou par une clé personnelle, et toutes les portes d'entrée (photo comprise) utilisent la même notion ; l'administration ne lit ni ne distribue plus de clé Gemini ; la fonction serveur impose une consigne de rôle par tâche, refuse une tâche inconnue, n'accepte que du texte borné et une image, compte chaque réponse demandée et ne renvoie plus les messages bruts de Google ni de Postgres (le refus de plusieurs réponses reste reconnaissable).
- Tests : nouveau test « IA par le serveur » ; tests de la fonction réécrits (comptage par réponse, tâches, contenus, échecs) ; suite complète : 8 + 156 réussis.
- Reste à faire par le propriétaire : déployer la fonction `ia` (`supabase functions deploy ia`), relancer le script 2 (« Sécurité des données ») qui supprime `admin_definir_cle_gemini` et recrée `admin_liste_comptes` ; décisions 1 et 2.
- Risque résiduel : une ancienne version de l'appli envoie ses demandes sans tâche ; le serveur leur applique la consigne générale.

### Lot 3 — LEG-01, TECH-04 (P1, P3)

- Fichiers : `index.html` (`mediaTiersInterdit`, `videoSmartWorkout`), `assets/donnees.js` (tables vidées), `assets/miniatures/` retiré, `tests/appli.test.js` ; dépôt Anqa : racine nettoyée, `LISEZMOI.md`.
- Changements : le site applique la règle de l'app (schéma des muscles à la place des médias tiers) ; les branches d'affichage restent pour les vidéos ajoutées dans Administration.
- Tests : 3 tests adaptés (lien SmartWorkout collé, vidéos HD avec une vidéo ajoutée, fiche du site) ; test iOS inchangé ; suite complète verte.
- Reste : décision 3 (purge de l'historique Git, qui demande un force push).

### Lot 4 — QA-02 (P3) ; OPS-01 déjà corrigé

- Fichiers (Anqa) : `ios-app/scripts/capture-demo.js`, `ios-app/scripts/captures-simulateur.sh`.
- Validation : prochain passage du workflow iOS (captures non blanches sur la branche `captures-ios`).

### Lot 9 — MET-01, MET-03, MET-05, MET-06, UX-02, UX-03

- Fichiers : `index.html` (`poidsReferenceProteines`, `densiteLiquide`, `ouvrirMonCorps`, `computeTargets`, `nombreFr`, `updateSummary`, `courbePoidsHeros`, `validerAjoutManuel`, carte Calories, HTML de l'anneau, CSS `.objectif-estime`), `tests/appli.test.js`.
- Tests : nouveau test « calculs (lot 9) » (6 profils, badge, densités, formats, saisie manuelle en ml) ; suite complète verte.
- Risque résiduel : les cibles de protéines des comptes à IMC > 30 sans mesure de masse grasse baissent ; le plancher relève la cible des petits gabarits en sèche (annoncé par `plancherRaison`, pas encore affiché en toutes lettres).

### Lot 10 — UX-01, UX-04, A11Y-02, DA-01 (partie 1), RESP-01

- Fichiers : `index.html` (`majBoutonPlus`, `renderVitrineMuscu`, 18 champs, règles CSS de tailles, `--text-muted`, bouton Annuler des feuilles, bloc animations réduites, `html`), `tests/appli.test.js`.
- Tests : nouveau test « interface (lot 10) » (noms accessibles, tailles, « + », héros, contraste, animation, overflow) ; test de navigation adapté (Profil sans « + ») ; suite complète en cours.
- Captures : Repas, Activité en semaine vide, feuille d'ajout, objectif estimé (envoyées pour accord avant mise en ligne).

### Lot 5 — TECH-02, QA-01, SEC-09

- Fichiers : `scripts/exporter-sql.mjs`, `supabase/migrations/0001…0009.sql`, `tests/sql/stub-supabase.sql`, `tests/sql/postgres-local.js`, `tests/sql.test.js`, `.github/workflows/tests.yml`, `package.json` (`test:sql`, `exporter-sql`), `index.html` (script 3 : détection de la colonne du nom en SQL ; script 4 : création de `aliments_partages` ; commentaire sur `est_bloque`).
- Résultat : les 9 scripts se rejouent sur une base vide ; 5 scénarios d'isolation passent ; le test a invalidé la recommandation SEC-09 avant toute mise en production.

### Lot 7 — SEC-02 (phase 1)

- Fichiers : `index.html` (3 balises `<script>`, méta CSP), `tests/outils.js` (écoute des violations), `tests/appli.test.js` (chaque test échoue sur une violation ; test des hachages), `ios-app/scripts/preparer-www.mjs` (Anqa : CSP retirée dans l'app).

### Lot 11 — PERF-01 (PERF-02 à l'analyse)

- Fichiers : `index.html` (`chargerRecettesAskesis`, `recettesAskesis`, `renderBibliothequeRecettes`), `tests/appli.test.js` (test hors ligne adapté, test « recettes à la demande »).

### Lot 6 — SEC-03, SEC-08

- Fichiers : `supabase/functions/withings/index.ts` (nouvelle fonction versionnée : session exigée, origines de l'appli seulement, URL de retour imposée, Pro exigé, actions `etat`/`connecter`/`mesures`/`deconnecter`/`importer`, messages rédigés), `supabase/functions/withings/LISEZMOI.md` (déploiement), `index.html` (SQL n° 10 « Balance Withings » : table `withings_jetons` sans règle ni droit pour l'appli, déclencheur `profil_sans_jetons` qui sort tout jeton du profil, nettoyage à l'effacement du compte ; client sans jeton : `appelWithings`, `rafraichirEtatWithings`, `reprendreJetonWithingsLocal`, `state` OAuth par appareil, pesées lues par le serveur ; sonde n° 10 qui signale une table lisible ; CSP sans `wbsapi.withings.net`), `supabase/migrations/0010_balance_withings.sql`, `scripts/exporter-sql.mjs`, `tests/fonctions.test.js` (2 tests, 10/10), `tests/sql.test.js` (1 test, 6/6), `tests/appli.test.js` (test « balance Withings (lot 6) », écran Serveur et SQL à 10 lignes).
- Décisions prises sans l'utilisateur : la balance exige Pro côté serveur (règle déjà appliquée par l'appli) ; les jetons laissés dans le profil par les anciennes versions sont déplacés par le serveur (jamais effacés sans avoir été repris) ; un jeton local n'est effacé de l'appareil qu'après réception par le serveur (ou refus définitif).
- Risque résiduel : une ancienne version de l'app iPhone encore installée peut ré-envoyer un profil contenant `withings` — le déclencheur SQL le sort du profil à chaque écriture ; l'ancienne fonction `dynamic-responder` reste ouverte tant qu'elle n'est pas supprimée (action côté production).

### Lot 8 — SEC-05, SEC-06 (phase 1)

- Fichiers : `index.html` (script 2 : table `admins`, amorce depuis `auth.users`, `est_admin()` ; scripts 2, 3, 4, 5, 6, 8 : `public.est_admin()` à la place de toute comparaison d'e-mail ; script 4 : règles d'`exercices_base_overrides` recréées à chaque passage au lieu d'une garde « si aucune règle » qui figeait l'ancienne ; script 8 : `je_suis_admin()` alias ; client : `estCompteAdmin()` reconnaît `sessionUtilisateur.admin` posé par `verifierAdminServeur()`, l'e-mail en repli ; `consignerAction` sur `ouvrirCompteAdmin`, `voirStatsCompte`, `exporterDonneesUtilisateurAdmin`), `supabase/migrations/0002…0008` régénérées, `tests/sql.test.js` (test 2 réécrit : repli, amorce rejouée, second administrateur par identifiant, table fermée à l'appli, phase 2 simulée), `tests/appli.test.js` (test « administration par identifiant (lot 8) », assertion Serveur et SQL).
- Ce qui reste de l'e-mail dans le SQL : l'amorce de la table (`insert into admins … from auth.users where email = …`), le repli dans `est_admin()` (phase 2 le retire), et l'auteur noté dans les journaux (`admin_consigner`, `journaliser_utilisateur`).
- Décision levée : plus besoin que l'utilisateur fournisse son identifiant (décision 5) : l'éditeur SQL le retrouve lui-même dans `auth.users`.
- Tests : SQL 6/6, fonctions 10/10, appli 161/161 (suite complète après le lot).
- Risque résiduel : tant que les scripts 2 à 8 ne sont pas rejoués en production, les règles existantes comparent encore l'e-mail (elles continuent de fonctionner) ; l'accès administrateur direct aux tables de données (RLS) reste total, seulement tracé (phase 2 = décision 6).

### Lot 12 — DATA-01, DATA-02

- Fichiers : `index.html` (couche `ouvrirStockage`/`chargerStockage`/`lireBloc`/`ecrireBloc`/`effacerBloc` ; `loadData`, `chargerMuscu`, `saveData`, `sauvegarder*`, les écritures de la synchro et du reset, `viderDonneesLocales` passent par elle ; démarrage `async` qui attend IndexedDB ; `choisirVersion`/`fusionnerProfil`/`memeProfil` et l'étape 3 de `synchroniser` réécrite ; `enregistrerBasesSync` ne purge que les clés-dates), `tests/appli.test.js` (tests « stockage local (lot 12) » et « profil fusionné (lot 12) » ; test « téléphone vidé » adapté).
- Décisions prises : IndexedDB par blocs (mêmes cinq blocs qu'avant, aucune migration de format) plutôt qu'un magasin par journée — pas de changement d'architecture, les lectures restent synchrones après l'ouverture ; localStorage reste écrit tant qu'il a la place pour qu'une ancienne version de l'appli retrouve ses données.
- Tests : « stockage local (lot 12) », « profil fusionné (lot 12) » ; suite complète 163/163.
- Risque résiduel : la copie localStorage peut devenir ancienne une fois saturée (une version antérieure de l'appli la lirait telle quelle) ; la fusion du profil sans base (première synchro après la mise à jour) garde tout mais ne peut pas distinguer une suppression d'un ajout.

### Lot 13 — A11Y-01

- Fichiers : `index.html` (règle racine `font-size: calc(clamp(…) * var(--echelle-texte, 1))`, `mesurerTailleTexteSysteme`/`appliquerTailleTexteSysteme` appelées au démarrage, au retour au premier plan et à `pageshow` ; commentaire périmé sur un « filet anti-pincement » retiré), `tests/appli.test.js` (test « taille de texte du système (lot 13) »).
- Constat corrigé dans le registre : le zoom par pincement n'était pas bloqué (seul le double appui l'est, volontairement) ; l'anomalie réelle était la taille de texte du système ignorée dans l'app iPhone.
- Limite : l'échelle est bornée à 1,35 (au-delà, les tailles d'accessibilité d'iOS casseraient la mise en page ; le pincement reste là) ; Chromium ne connaît pas `-apple-system-body`, le test vérifie donc la mécanique (variable, bornes, absence d'effet ailleurs), pas la mesure elle-même.
- Tests : test ciblé ; suite complète passée avec le lot 15.

### Lot 15 — MET-02, MET-04

- Fichiers : `index.html` (`sumMeals` étendu + `renseignes`/`aliments`, `reperesDetailsNutri`, `afficherDetailNutri` et la ligne `#detail-nutri` sous les macros ; formulaire manuel : `<details>` « Plus de détails » avec 4 champs facultatifs, `valeurFacultative`, `validerAjoutManuel` garde les détails à la quantité près, `fillFromOFF` les remplit ; `detecterSchemaAliments` détecte fibres/sucres/sel/sodium/AG saturés, `detailsNutriDeLigne` les convertit (sodium mg → sel g) ; `AIDE_CRU_CUIT`, `aideCruCuit`, `majAideCruCuit`, `convertirCuitEnCru`, `annulerConversionCuit` ; styles), `tests/appli.test.js` (tests « fibres, sucres, sel et AGS (lot 15) » et « aide cru/cuit (lot 15) »).
- Non fait, à dessein : pas d'objectif chiffré par personne ni de colonnes supplémentaires dans `aliments_partages` (les détails voyagent dans les journées) ; les recettes Askēsis ne portent pas ces détails (affichés comme « non renseignés »).
- Tests : deux tests d'appli ; suite complète 166/166 (lots 13 et 15).
- Risque résiduel : les facteurs cru/cuit sont des moyennes indicatives (le riz varie de 2,5 à 3) ; la conversion n'est jamais automatique.

### Lot 14 — TECH-01 (étape 1)

- Fichiers : `assets/styles.css` (nouveau, 4 920 lignes, en-tête de repères), `index.html` (`<link rel="stylesheet" href="assets/styles.css">`, un `<style>` d'une règle), `sw.js` (feuille préchargée), `tests/appli.test.js` (test « feuille de style externe (lot 14) », hors-ligne adapté), Anqa `ios-app/scripts/preparer-www.mjs` (feuille copiée dans l'app si présente).
- Choix : extraction mécanique, sans réécriture (aucune règle modifiée, dé-indentation seulement) ; la règle `stroke: url(#grad-onglet)` reste dans la page (référence à un élément SVG de la page). La détection de nouvelle version (`empreinteDocument`) ne hache que le code resté dans la page : chaque livraison change `VERSION_APPLI`, donc la page, et reste détectée.
- Tests : test « feuille de style externe (lot 14) » ; suite complète 167/167 (la forme initiale du test lisait les règles CSSOM, refusées sous file:// : corrigée, l'appli n'a pas bougé).
- Non engagé (décision) : CSP phase 2 (1 000+ gestionnaires `onclick=` à déplacer), découpage du JavaScript, scripts SQL servis depuis les migrations. Un « design system » formel reste à écrire ; les jetons existent déjà dans `:root` et sont documentés en tête de la feuille.

## Bilan final (9 novembre 2026)

- 34 anomalies : 32 corrigées (29 avec un test dédié, 3 validées par la suite complète : UX-03, DA-01 partie 1, TECH-04), 1 écartée comme faux positif par le test SQL (SEC-09), 1 non reproductible dans l'environnement (PERF-02, mesure sur iPhone à faire).
- Phases 2 prêtes mais non engagées : SEC-05 (retrait de l'e-mail), SEC-06 (lecture par fonctions dédiées), SEC-02 (CSP sans `'unsafe-inline'`), TECH-01 (découpage du JavaScript, SQL servi depuis les migrations), DATA-01 (SQLite natif).
- Tests au dernier commit : 10 fonctions serveur, 6 SQL (Postgres local), 167 appli (Playwright) — tous verts ; aucun test désactivé.
- Branche `corrections-audit` de mon-coach (13 commits) et branche de l'app iPhone d'Anqa (3 commits) poussées ; `main` et TestFlight attendent le « Pousse » de l'utilisateur, avec le numéro de version à poser (`VERSION_APPLI`).
- Rapport final : artefact « Bilan des corrections Anqā » de la session.

## Actions côté production (à faire par le propriétaire, dans l'éditeur SQL de Supabase)

### Lot 0 — contrôles en lecture seule

```sql
-- 1) Règles ouvertes sur les tables de données (attendu : 0 ligne)
select tablename, policyname, cmd, roles from pg_policies
where schemaname = 'public' and (qual = 'true' or with_check = 'true')
  and tablename in ('journees','profil','programmes_musculation','seances_musculation','exercices_perso_musculation');

-- 2) Le script de sécurité est bien passé (attendu : 5 lignes)
select tablename, policyname from pg_policies
where schemaname = 'public' and policyname like '% par compte';

-- 3) Clés Gemini posées dans les profils (nombre de comptes)
select count(*) from profil where donnees ? 'geminiKey' and donnees->>'geminiKey' <> '';
```

### Lot 1 — si le contrôle 1 renvoie des lignes ET que le contrôle 2 renvoie 5 lignes

```sql
drop policy if exists "acces journees" on journees;
drop policy if exists "acces profil" on profil;
drop policy if exists "acces programmes_musculation" on programmes_musculation;
drop policy if exists "acces seances_musculation" on seances_musculation;
drop policy if exists "acces exercices_perso_musculation" on exercices_perso_musculation;
```

Puis relancer le script 2 (« Sécurité des données », copié depuis l'appli à jour) pour créer `admin_regles_ouvertes()`. Contrôle : la ligne « Sécurité des données » de l'écran Administration passe à OK.

Si le contrôle 2 ne renvoie pas 5 lignes : ne rien supprimer ; passer d'abord le script 2 complet, puis revenir au contrôle 1.

### Lot 2 et Lot 6 — fonctions serveur (CLI Supabase, depuis la racine du dépôt)

```bash
# Lot 2 : la fonction « ia » (consigne de rôle par tâche, essais comptés par réponse)
supabase functions deploy ia

# Lot 6 : la balance Withings côté serveur (le secret vient du tableau de bord développeur Withings)
supabase secrets set WITHINGS_CLIENT_SECRET=<client_secret Withings>
supabase functions deploy withings
```

Puis exécuter le SQL n° 10 « Balance Withings » (Administration › Serveur et SQL). Contrôles :

```sql
-- la table existe et aucun droit n'est laissé à l'appli (attendu : 0 ligne)
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'withings_jetons' and grantee in ('anon', 'authenticated');
-- plus aucun jeton dans les profils (attendu : 0)
select count(*) from profil where donnees ? 'withings';
```

Une fois l'appli à jour sur le web et dans TestFlight : `supabase functions delete dynamic-responder` (l'ancienne fonction, ouverte à tous).

### Lot 8 — administrateur par identifiant

Rejouer, depuis l'appli à jour (Administration › Serveur et SQL › Copier le SQL), les scripts **2, 3, 4, 5, 6 puis 8** (idempotents ; les règles existantes continuent de fonctionner entre-temps). Contrôles :

```sql
-- 1) l'administrateur est dans la table (attendu : 1 ligne, ton identifiant)
select utilisateur, ajoute_le, note from public.admins;
-- 2) plus aucune règle ni fonction ne compare l'e-mail (attendu : 0 ligne)
select tablename, policyname from pg_policies
where schemaname = 'public' and (qual ilike '%jambou592%' or with_check ilike '%jambou592%');
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname <> 'est_admin' and pg_get_functiondef(p.oid) ilike '%jambou592%';
```

Phase 2, seulement si le contrôle 1 renvoie bien ta ligne : l'e-mail cesse d'être un passe-droit.

```sql
create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where utilisateur = auth.uid());
$$;
```

(Côté appli, retirer alors le repli `ADMIN_EMAIL` d'`estCompteAdmin()` ; `verifierAdminServeur()` fait déjà le travail.)
