# Edge Function Withings

La connexion à ta balance Withings est **désactivée par défaut** dans
l'application (`WITHINGS_PROXY = null` dans `index.html`) : pas par bug,
mais parce que le maillon manquant — cette Edge Function — n'est pas encore
déployé sur ton projet Supabase. Ce document explique pourquoi, et comment
la déployer toi-même (ça prend 5 minutes).

## Pourquoi c'est nécessaire

Withings utilise le protocole OAuth2. Pour échanger le code d'autorisation
contre un jeton d'accès, il faut un `client_secret` — contrairement à la
clé publique Supabase, ce secret **authentifie l'application elle-même** :
publié en clair dans `index.html` sur GitHub Pages, n'importe qui pourrait
se faire passer pour Mon Coach auprès de Withings, qui pourrait alors
révoquer l'accès de l'appli pour tout le monde.

La solution : ce secret reste **côté serveur**, dans une Edge Function
Supabase qui fait l'échange à la place du navigateur. Le navigateur ne
voit jamais que le résultat (le jeton d'accès personnel de ton compte
Withings, qui lui n'a rien de sensible pour l'appli elle-même).

## 1. Créer une application Withings (si ce n'est pas déjà fait)

Sur [developer.withings.com](https://developer.withings.com), crée une
application. Tu y trouveras un **Client ID** (déjà dans `index.html`,
constante `WITHINGS_CLIENT_ID`) et un **Client Secret** (à garder pour
l'étape 3 — ne le colle jamais dans le code de l'appli ni dans une
conversation, seulement dans la commande `supabase secrets set` ci-dessous).

Renseigne comme URL de redirection exactement la valeur de
`WITHINGS_REDIRECT_URI` dans `index.html` (l'URL où l'appli est hébergée).

## 2. Créer la fonction

Depuis un terminal, à la racine de ton projet Supabase local (ou n'importe
où si tu utilises seulement la CLI pour ce projet) :

```bash
supabase functions new withings
```

Remplace le contenu du fichier généré
(`supabase/functions/withings/index.ts`) par celui-ci :

```typescript
// Edge Function Withings : échange le code d'autorisation OAuth (et
// rafraîchit le jeton) sans jamais exposer le client_secret au navigateur.
// Le client_secret vit uniquement dans les secrets Supabase (étape 3),
// jamais dans ce fichier ni dans index.html.

const WITHINGS_CLIENT_ID = '3341d599f2c93e3b754d28ae6fbd69af0e259f1127d2c12c738991dccb012924';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reponseJson(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reponseJson({ status: 1, error: 'Méthode non autorisée' }, 405);

  const clientSecret = Deno.env.get('WITHINGS_CLIENT_SECRET');
  if (!clientSecret) return reponseJson({ status: 1, error: 'WITHINGS_CLIENT_SECRET non configuré côté serveur' }, 500);

  try {
    const payload = await req.json();
    const params = new URLSearchParams({
      action: 'requesttoken',
      client_id: WITHINGS_CLIENT_ID,
      client_secret: clientSecret,
    });

    if (payload.action === 'authorization_code') {
      if (!payload.code || !payload.redirect_uri) return reponseJson({ status: 1, error: 'code et redirect_uri requis' }, 400);
      params.set('grant_type', 'authorization_code');
      params.set('code', payload.code);
      params.set('redirect_uri', payload.redirect_uri);
    } else if (payload.action === 'refresh_token') {
      if (!payload.refresh_token) return reponseJson({ status: 1, error: 'refresh_token requis' }, 400);
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', payload.refresh_token);
    } else {
      return reponseJson({ status: 1, error: 'action inconnue' }, 400);
    }

    const withingsResp = await fetch('https://wbsapi.withings.net/v2/oauth2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await withingsResp.json();

    // Transmis tel quel : index.html attend exactement le format de
    // réponse Withings ({status, body: {access_token, refresh_token,
    // expires_in, userid}}), aucune transformation ici.
    return reponseJson(data);
  } catch (e) {
    return reponseJson({ status: 1, error: String(e) }, 500);
  }
});
```

## 3. Enregistrer le secret et déployer

```bash
# Le client_secret Withings (étape 1) — jamais dans le code, uniquement ici.
supabase secrets set WITHINGS_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx

# --no-verify-jwt : index.html appelle cette fonction sans jeton Supabase
# (l'échange OAuth arrive parfois avant que la session Supabase ne soit
# établie) — sans cette option, Supabase refuserait l'appel avec 401.
supabase functions deploy withings --no-verify-jwt
```

La commande de déploiement affiche l'URL de la fonction, de la forme :

```
https://<ton-projet>.supabase.co/functions/v1/withings
```

## 4. Activer la connexion dans l'appli

Dans `index.html`, remplace :

```js
const WITHINGS_PROXY = null;   // ex : 'https://xxxx.supabase.co/functions/v1/withings'
```

par l'URL obtenue à l'étape 3, commite et pousse le changement. Le bouton
« Connecter ma balance Withings » (Réglages → Profil) devient alors actif.

## Pour vérifier que ça fonctionne

1. Réglages → Connecter ma balance Withings.
2. Se connecter sur la page Withings qui s'ouvre, autoriser l'accès.
3. De retour sur l'appli, un message « Balance Withings connectée ! »
   doit apparaître.
4. Depuis la modale Mesures, « ⚖️ Importer ma dernière pesée Withings »
   doit pré-remplir le poids avec la dernière pesée enregistrée.

Si une erreur apparaît, le lien « 🔍 Voir la réponse brute de l'API
(diagnostic) » (Réglages) affiche la réponse exacte renvoyée — utile pour
comprendre ce qui bloque côté Withings.
