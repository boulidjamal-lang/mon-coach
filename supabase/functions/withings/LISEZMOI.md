# Fonction serveur « withings » (balance Withings)

La connexion à une balance Withings passe par cette Edge Function Supabase,
versionnée ici (`index.ts`). Elle remplace la fonction `dynamic-responder`
déployée à la main en 2025, qui n'exigeait aucune connexion, répondait à
n'importe quel site et renvoyait les jetons au navigateur.

## Ce qu'elle garantit

- **Le `client_secret` Withings ne quitte pas le serveur** : il vit dans le
  secret `WITHINGS_CLIENT_SECRET`, jamais dans `index.html` ni dans ce dépôt.
- **Les jetons d'accès de chaque compte restent sur le serveur**, dans la
  table `withings_jetons` (SQL n° 10 « Balance Withings » de l'écran
  Administration › Serveur et SQL). Cette table n'a aucune règle d'accès et
  aucun droit pour l'appli : seule la fonction (clé de service) la lit et
  l'écrit. L'appli ne connaît qu'un état — balance reliée ou non — et
  reçoit les pesées déjà lues.
- **Chaque appel porte la session Supabase du compte** (vérification du JWT
  activée au déploiement, puis relue dans la fonction) : un jeton Withings
  est rangé au nom de ce compte-là, et personne d'autre ne peut le lire ni
  s'en servir.
- **Seules les origines de l'appli sont servies** (`https://boulidjamal-lang.github.io`,
  `capacitor://localhost`, `ionic://localhost` ; d'autres via le secret
  `WITHINGS_ORIGINES`, séparées par des virgules). Un site tiers reçoit 403.
- **L'URL de retour est celle du serveur** (`WITHINGS_REDIRECT_URI`, par
  défaut `https://boulidjamal-lang.github.io/mon-coach/`) : une demande ne
  peut pas en imposer une autre. Côté appli, chaque demande de connexion
  part avec un `state` aléatoire gardé sur l'appareil, exigé au retour.
- **La balance fait partie de Pro**, comme dans l'appli : relier, importer
  ou lire les pesées exige un abonnement valable (402 sinon).

## Actions

| Action (POST JSON `{ action, … }`) | Réponse | Rôle |
|---|---|---|
| `etat` | `{ connecte }` | La balance est-elle reliée à ce compte ? |
| `connecter` `{ code }` | `{ connecte: true }` | Échange le code OAuth du retour de Withings et garde les jetons |
| `mesures` | `{ status: 0, body: { measuregrps } }` | Les 10 dernières pesées (format Withings `getmeas`), jeton rafraîchi au besoin ; `409 { connecte: false }` si la connexion a expiré |
| `deconnecter` | `{ connecte: false }` | Oublie les jetons |
| `importer` `{ access_token, refresh_token, expire_le, userid }` | `{ connecte: true }` | Reprend le jeton qu'une ancienne version de l'appli gardait sur l'appareil (une fois ; l'appli l'efface ensuite chez elle) |

Les messages d'erreur renvoyés à l'appli sont rédigés ; la réponse brute de
Withings reste dans les journaux de la fonction.

## Déployer

Depuis la racine du dépôt, avec la CLI Supabase reliée au projet :

```bash
# Le client_secret de l'application Withings (developer.withings.com) —
# uniquement ici, jamais dans le code ni dans une conversation.
supabase secrets set WITHINGS_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx

# Vérification du JWT activée (pas de --no-verify-jwt) : l'appli appelle la
# fonction avec la session du compte (supa.functions.invoke).
supabase functions deploy withings
```

Puis, dans l'éditeur SQL de Supabase, exécuter le SQL n° 10 « Balance
Withings » (Administration › Serveur et SQL › Copier le SQL). Il crée la
table, reprend les jetons que les anciennes versions avaient laissés dans le
profil, et les retire du profil. Une fois l'appli à jour partout :

```bash
# L'ancienne fonction, ouverte à tous, n'a plus de raison d'exister.
supabase functions delete dynamic-responder
```

Dans le tableau de bord développeur Withings, l'URL de redirection reste
`https://boulidjamal-lang.github.io/mon-coach/` (la même que
`WITHINGS_REDIRECT_URI` dans `index.html` et dans la fonction).

## Vérifier

1. Réglages › Balance Withings › **Connecter** : la page Withings s'ouvre,
   puis l'appli affiche « Balance Withings connectée ! ».
2. Administration › Serveur et SQL : la ligne n° 10 est **OK** (la table
   existe et refuse même l'administrateur ; « Accès ouvert à tous » signale
   une table lisible, « Manquant » un SQL pas encore passé).
3. Mesures › **Importer ma dernière pesée** pré-remplit le poids (et la
   composition si la balance la donne).

Les tests (`npm run test:fonctions`, `npm run test:sql`, `npm test`)
couvrent la fonction, la table et l'appli sans rien déployer.
