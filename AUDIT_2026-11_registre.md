# Registre des corrections — audit du 9 novembre 2026

Suivi des 34 anomalies de l'audit, lot par lot. Statuts : À analyser · À corriger · En cours · Corrigée · Tests réussis · Tests échoués · En attente de validation · Non reproductible · Non corrigible dans l'environnement actuel.

Branche de travail : `corrections-audit` (dépôt mon-coach). Rien n'est mis en ligne sur `main` ni envoyé sur TestFlight sans l'accord explicite « Pousse ». Aucun SQL n'est exécuté sur la production par l'assistant : les scripts sont remis avec leur requête de contrôle (section « Actions côté production »).

## État par anomalie

| Id | Gravité | Lot | Anomalie | Statut | Notes |
|----|---------|-----|----------|--------|-------|
| SEC-01 | P0 | 1 | Script 1 recrée des règles ouvertes | Tests réussis (code) · SQL prod à passer | Sonde réelle `admin_regles_ouvertes()` ; script 1 sans règle ; textes corrigés |
| SEC-02 | P1 | 7 | Ni CSP ni intégrité CDN (web) | À corriger | |
| SEC-03 | P1 | 6 | Jetons Withings et clé IA dans le profil synchronisé | À corriger | |
| SEC-04 | P1 | 2 | Clé Gemini utilisée depuis le téléphone ; porte d'entrée photo liée à l'ancien chemin | Tests réussis | Plus de clé distribuée par l'administration ; porte d'entrée sur `iaDisponible()`. Clé personnelle conservée (décision 1 en attente) |
| LEG-01 | P1 | 3 | Médias tiers sans licence sur le site | Tests réussis | Site aligné sur l'app : aucun média SmartWorkout, ExerciseDB ni wger ; tables vidées, 1 622 mini-vidéos retirées des deux dépôts. Purge de l'historique Git : décision 3 en attente |
| TECH-02 | P1 | 5 | SQL sans migrations ni suivi | À corriger | Schéma réel de production à fournir (décision 4) |
| QA-01 | P1 | 5 | Règles d'accès jamais testées | À corriger | Docker indisponible ici : tests écrits pour le CI |
| OPS-01 | P1 | 4 | Aucun build TestFlight depuis le 6 novembre | Tests réussis | Build #33 envoyé le 9 nov. à 15 h 05 UTC ; durcissement (certificat persistant) restant |
| SEC-05 | P2 | 8 | Administrateur reconnu par e-mail | À corriger | Phase 1 sans risque ; phase 2 après l'UUID (décision 5) |
| SEC-06 | P2 | 8 | Accès administrateur total | À corriger | |
| SEC-07 | P2 | 2 | Proxy IA générique | Tests réussis · à déployer | Tâches typées, consigne de rôle imposée, chaque réponse comptée, erreurs génériques ; fonction `ia` à redéployer par le propriétaire |
| SEC-08 | P2 | 6 | Fonction Withings hors dépôt, sans authentification | À corriger | Code présent dans WITHINGS_edge_function.md |
| TECH-01 | P2 | 14 | Monolithe d'un seul fichier | À corriger | Par étapes |
| PERF-01 | P2 | 11 | Premier chargement lourd | À corriger | |
| DATA-01 | P2 | 12 | Tout dans localStorage | À corriger | IndexedDB retenu par défaut (décision 6) |
| A11Y-01 | P2 | 13 | Zoom bloqué, taille de texte iOS ignorée | À corriger | |
| A11Y-02 | P2 | 10 | 18 champs sans libellé, textes < 12 px | À corriger | |
| MET-01 | P2 | 9 | Protéines surestimées (IMC élevé) | À corriger | |
| MET-02 | P2 | 15 | Ni fibres, sucres, sel, AGS | À corriger | |
| MET-03 | P2 | 9 | Âge et taille par défaut silencieux | À corriger | |
| MET-04 | P2 | 15 | Pas d'aide cru/cuit | À corriger | |
| UX-01 | P2 | 10 | Héros « 0 série » en début de semaine | À corriger | |
| UX-02 | P3 | 9 | Formats de nombres incohérents | À corriger | |
| UX-03 | P3 | 9 | Deux projections de poids | À corriger | |
| UX-04 | P3 | 10 | « + » grisé sur Progrès (barre HTML) | À corriger | |
| DA-01 | P3 | 10/14 | Accent multi-rôles | À corriger | |
| MET-05 | P3 | 9 | ml comptés comme g | À corriger | |
| MET-06 | P3 | 9 | Plancher = métabolisme de base | À corriger | |
| TECH-04 | P3 | 3 | Copie obsolète dans le dépôt Anqa | Corrigée | Racine du dépôt Anqa réduite à ios-app/, .github/ et un LISEZMOI ; la doc Withings déplacée dans mon-coach |
| QA-02 | P3 | 4 | Captures du simulateur blanches | Corrigée · CI en cours | Annonce après peinture, image presque vide reprise une fois |
| PERF-02 | P3 | 11 | Rendu complet à chaque action | À analyser | Mesure sur appareil d'abord |
| SEC-09 | P3 | 5 | `est_bloque()` exécutable par tous | À corriger | |
| DATA-02 | P3 | 12 | Profil : le dernier qui écrit gagne | À corriger | |
| RESP-01 | P3 | 10 | Animation d'entrée non réduite | À corriger | Rétrogradé après re-mesure (faux positif initial) |

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
