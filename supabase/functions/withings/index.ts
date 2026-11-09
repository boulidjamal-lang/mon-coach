// Askēsis — balance Withings côté serveur (Edge Function Supabase « withings »).
//
// Le client_secret Withings ET les jetons d'accès de chaque compte restent
// ici : l'appli ne voit jamais un jeton, elle ne connaît qu'un état (balance
// reliée ou non) et reçoit les pesées déjà lues. La fonction :
//   - exige la session Supabase du compte (JWT vérifié par Supabase, puis
//     relu ici) : chaque jeton Withings est rangé au nom de ce compte-là ;
//   - ne répond qu'aux origines de l'appli (CORS), jamais à un site tiers ;
//   - impose elle-même l'URL de retour enregistrée chez Withings : un appel
//     ne peut pas en choisir une autre ;
//   - réserve la balance aux comptes Pro, comme l'appli.
//
// Actions (POST JSON { action, ... }) :
//   etat        → { connecte }         la balance est-elle reliée à ce compte ?
//   connecter   → { connecte: true }   échange le code OAuth du retour de Withings et garde les jetons
//   mesures     → { status, body }     les dernières pesées (format Withings « getmeas »), jeton rafraîchi au besoin
//   deconnecter → { connecte: false }  oublie les jetons
//   importer    → { connecte: true }   reprend un jeton qu'une ancienne version de l'appli gardait sur l'appareil
//
// Déploiement : voir LISEZMOI.md (secret WITHINGS_CLIENT_SECRET, vérification du JWT activée).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const WITHINGS_CLIENT_ID = '3341d599f2c93e3b754d28ae6fbd69af0e259f1127d2c12c738991dccb012924';
// Les mêmes valeurs que dans index.html (WITHINGS_REDIRECT_URI) et dans le
// tableau de bord développeur Withings. Modifiables par secret si l'appli déménage.
const REDIRECT_URI = Deno.env.get('WITHINGS_REDIRECT_URI') || 'https://boulidjamal-lang.github.io/mon-coach/';
const ORIGINES = ['https://boulidjamal-lang.github.io', 'capacitor://localhost', 'ionic://localhost']
  .concat((Deno.env.get('WITHINGS_ORIGINES') || '').split(',').map(o => o.trim()).filter(Boolean));
// Poids, masse grasse, muscle, os, eau (WITHINGS_MEASTYPES dans index.html).
const MEASTYPES = '1,6,76,88,77';
const PESEES_MAX = 10;
const TAILLE_MAX = 10_000;

function cors(req: Request) {
  const origine = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINES.includes(origine) ? origine : ORIGINES[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Abonnement = { statut: string; fin: string | null } | null;
function estPro(a: Abonnement) {
  return !!a && ['actif', 'essai', 'annule', 'impaye'].includes(a.statut) && (!a.fin || new Date(a.fin) > new Date());
}

type Jetons = { access_token: string; refresh_token: string; expire_le: string; userid: string | null };

// Échange un code d'autorisation ou un refresh_token contre de nouveaux
// jetons. null si Withings refuse : le détail reste dans les journaux.
async function demanderJetons(secret: string, params: Record<string, string>): Promise<Jetons | null> {
  const corps = new URLSearchParams({ action: 'requesttoken', client_id: WITHINGS_CLIENT_ID, client_secret: secret, ...params });
  const r = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corps.toString(),
  });
  // deno-lint-ignore no-explicit-any
  const data: any = await r.json().catch(() => ({}));
  const b = data && data.body;
  if (data.status !== 0 || !b || typeof b.access_token !== 'string' || typeof b.refresh_token !== 'string') {
    console.error('withings requesttoken', params.grant_type, r.status, data && data.status, data && data.error);
    return null;
  }
  const duree = Math.max(60, Number(b.expires_in) || 10_800);
  return {
    access_token: b.access_token, refresh_token: b.refresh_token,
    expire_le: new Date(Date.now() + (duree - 60) * 1000).toISOString(),
    userid: b.userid == null ? null : String(b.userid),
  };
}

async function jetonsDe(moi: string): Promise<Jetons | null> {
  const { data } = await admin.from('withings_jetons').select('access_token, refresh_token, expire_le, userid').eq('utilisateur', moi).maybeSingle();
  return (data as Jetons | null) || null;
}
async function garder(moi: string, j: Jetons) {
  const { error } = await admin.from('withings_jetons').upsert({ utilisateur: moi, ...j, maj: new Date().toISOString() });
  if (error) console.error('withings_jetons upsert', error.message);
  return !error;
}
async function oublier(moi: string) {
  const { error } = await admin.from('withings_jetons').delete().eq('utilisateur', moi);
  if (error) console.error('withings_jetons delete', error.message);
}

Deno.serve(async (req: Request) => {
  const entetes = cors(req);
  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });
  // Un navigateur sur un autre site n'obtient rien, même avec un jeton volé.
  const origine = req.headers.get('Origin');
  if (origine && !ORIGINES.includes(origine)) return json({ erreur: 'Origine non autorisée.' }, 403);
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const jeton = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jeton);
  const moi = auth && auth.user ? auth.user.id : null;
  if (!moi) return json({ erreur: 'Connecte-toi pour relier ta balance.' }, 401);

  const brut = await req.text();
  if (brut.length > TAILLE_MAX) return json({ erreur: 'Demande trop lourde.' }, 413);
  // deno-lint-ignore no-explicit-any
  let demande: any;
  try { demande = JSON.parse(brut || '{}'); } catch { return json({ erreur: 'Demande illisible.' }, 400); }
  const action = demande && typeof demande.action === 'string' ? demande.action : '';

  if (action === 'etat') return json({ connecte: !!(await jetonsDe(moi)) });
  if (action === 'deconnecter') { await oublier(moi); return json({ connecte: false }); }
  if (!['connecter', 'mesures', 'importer'].includes(action)) return json({ erreur: 'Action inconnue.' }, 400);

  const { data: abonnement } = await admin.from('abonnements').select('statut, fin').eq('utilisateur', moi).maybeSingle();
  if (!estPro(abonnement as Abonnement)) return json({ erreur: 'La balance Withings fait partie de Pro.', code: 'pro_requis' }, 402);

  const secret = Deno.env.get('WITHINGS_CLIENT_SECRET');
  if (!secret) return json({ erreur: "La connexion Withings n'est pas encore configurée sur le serveur." }, 503);

  if (action === 'connecter') {
    if (typeof demande.code !== 'string' || !demande.code) return json({ erreur: 'Code manquant.' }, 400);
    const j = await demanderJetons(secret, { grant_type: 'authorization_code', code: demande.code, redirect_uri: REDIRECT_URI });
    if (!j) return json({ erreur: 'Withings a refusé la connexion. Relance « Connecter ».' }, 502);
    if (!(await garder(moi, j))) return json({ erreur: 'Impossible de garder la connexion. Réessaie dans un instant.' }, 500);
    return json({ connecte: true });
  }

  if (action === 'importer') {
    // Jeton d'une ancienne version (gardé sur l'appareil) : rangé ici une
    // fois, sauf si le compte en a déjà un ; l'appli l'efface ensuite chez elle.
    const t = demande;
    const expire = Number(t.expire_le);
    if (typeof t.access_token !== 'string' || !t.access_token || typeof t.refresh_token !== 'string' || !t.refresh_token || !Number.isFinite(expire)) {
      return json({ erreur: 'Jeton illisible.' }, 400);
    }
    if (await jetonsDe(moi)) return json({ connecte: true });
    const j: Jetons = { access_token: t.access_token, refresh_token: t.refresh_token, expire_le: new Date(expire).toISOString(), userid: t.userid == null ? null : String(t.userid) };
    if (!(await garder(moi, j))) return json({ erreur: 'Impossible de garder la connexion. Réessaie dans un instant.' }, 500);
    return json({ connecte: true });
  }

  // mesures
  let j = await jetonsDe(moi);
  if (!j) return json({ erreur: "Ta balance n'est pas reliée : relie-la dans Réglages.", connecte: false }, 409);
  if (new Date(j.expire_le).getTime() <= Date.now()) {
    const neuf = await demanderJetons(secret, { grant_type: 'refresh_token', refresh_token: j.refresh_token });
    if (!neuf) {
      // Le refresh_token expire aussi (longue inactivité) : il faut relier la balance à nouveau.
      await oublier(moi);
      return json({ erreur: 'La connexion à Withings a expiré : relie à nouveau ta balance dans Réglages.', connecte: false }, 409);
    }
    await garder(moi, neuf);
    j = neuf;
  }
  const r = await fetch('https://wbsapi.withings.net/measure?' + new URLSearchParams({ action: 'getmeas', meastypes: MEASTYPES, category: '1' }), {
    headers: { Authorization: 'Bearer ' + j.access_token },
  });
  // deno-lint-ignore no-explicit-any
  const data: any = await r.json().catch(() => ({}));
  if (data.status === 401) {
    await oublier(moi);
    return json({ erreur: 'Withings ne reconnaît plus la connexion : relie à nouveau ta balance dans Réglages.', connecte: false }, 409);
  }
  if (data.status !== 0 || !data.body || !Array.isArray(data.body.measuregrps)) {
    console.error('withings getmeas', r.status, data && data.status, data && data.error);
    return json({ erreur: 'Withings ne répond pas pour le moment. Réessaie dans un instant.' }, 502);
  }
  // deno-lint-ignore no-explicit-any
  const groupes = (data.body.measuregrps as any[]).slice().sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0)).slice(0, PESEES_MAX);
  return json({ status: 0, body: { measuregrps: groupes } });
});
