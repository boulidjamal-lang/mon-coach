// Vidéo d'un exercice avec l'écorché de Charleeh (github.com/Charleeh/ecorche : BodyParts3D + Z-Anatomy, CC BY-SA 4.0).
// Le modèle n'a ni squelette ni poses : on le cale sur le squelette de l'atlas (Z-Anatomy), os par os, puis chaque sommet
// reprend les attaches de l'atlas ; le mouvement est celui du moteur de l'appli. Même format de sortie qu'exporter.mjs,
// lu par scene.py.
// SOURCES=<dossier de squelette.bin et regions.bin> node --max-old-space-size=8000 exporter-ecorche.mjs <ecorche.glb> <mouvement> <images> <sortie.bin>
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from '../mouvements/silhouettes.mjs';
import { lireBin } from '../outils/commun.mjs';
import { lireGlb } from './glb.mjs';

const [GLB, spec = 'curl hal', nbImages = '70', sortie = 'ecorche.bin'] = process.argv.slice(2);
const N = +nbImages, SOURCES = process.env.SOURCES || '';
for (const f of ['squelette.bin', 'regions.bin'])
  if (!fs.existsSync(path.join(SOURCES, f))) throw new Error(`SOURCES : ${f} introuvable dans « ${SOURCES} »`);
const t0 = Date.now(), log = m => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + ' s  ' + m);

// ---------- L'atlas (carrure d'origine : l'écorché n'est pas étoffé) ----------
process.env.CARRURE = '1'; const A1 = chargerAtlas(FICHIER_ATLAS);
process.env.CARRURE = '0'; const A0 = chargerAtlas(FICHIER_ATLAS);
const E = A0.E, Q = A0.points(1), SQ = E.squelette, NJ = SQ.length;
const JUMEAU = SQ.map(a => a.jumeau);
log(`atlas : ${Q.n} sommets, ${NJ} articulations`);

// ---------- Recherche des plus proches : grille de cellules cubiques ----------
function grille(P, idx, c = 0.005) {
  const g = new Map(), cle = (x, y, z) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
  for (const i of idx) { const k = cle(Math.floor(P[i * 3] / c), Math.floor(P[i * 3 + 1] / c), Math.floor(P[i * 3 + 2] / c)); let l = g.get(k); if (!l) g.set(k, l = []); l.push(i); }
  return (x, y, z, k = 1, rmax = 60) => {
    const cx = Math.floor(x / c), cy = Math.floor(y / c), cz = Math.floor(z / c), res = [];
    for (let r = 0; r < rmax; r++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let d = -r; d <= r; d++) {
        if (Math.max(Math.abs(a), Math.abs(b), Math.abs(d)) !== r) continue;
        const l = g.get(cle(cx + a, cy + b, cz + d)); if (!l) continue;
        for (const i of l) { const dx = P[i * 3] - x, dy = P[i * 3 + 1] - y, dz = P[i * 3 + 2] - z; res.push([dx * dx + dy * dy + dz * dz, i]); }
      }
      // tout point hors des cellules déjà vues est à plus de r·c : on s'arrête quand les k meilleurs sont plus près
      if (res.length >= k) { res.sort((u, v) => u[0] - v[0]); if (Math.sqrt(res[k - 1][0]) <= r * c) return res.slice(0, k); }
    }
    res.sort((u, v) => u[0] - v[0]); return res.slice(0, k);
  };
}
const tous = (n) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; };

// ---------- Similitude et déplacement rigide (Umeyama) ----------
function umeyama(A, B, echelle = true) {
  const n = A.length / 3, ma = [0, 0, 0], mb = [0, 0, 0];
  for (let k = 0; k < n; k++) for (let i = 0; i < 3; i++) { ma[i] += A[k * 3 + i] / n; mb[i] += B[k * 3 + i] / n; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let va = 0;
  for (let k = 0; k < n; k++) {
    const a = [0, 1, 2].map(i => A[k * 3 + i] - ma[i]), b = [0, 1, 2].map(i => B[k * 3 + i] - mb[i]);
    va += (a[0] ** 2 + a[1] ** 2 + a[2] ** 2) / n;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += b[i] * a[j] / n;
  }
  // SVD 3×3 : Jacobi sur SᵀS
  const A2 = [0, 1, 2].map(i => [0, 1, 2].map(j => S[0][i] * S[0][j] + S[1][i] * S[1][j] + S[2][i] * S[2][j]));
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 80; it++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(A2[p][q]) < 1e-20) continue;
    const th = 0.5 * Math.atan2(2 * A2[p][q], A2[q][q] - A2[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const x = A2[k][p], y = A2[k][q]; A2[k][p] = c * x - s * y; A2[k][q] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = A2[p][k], y = A2[q][k]; A2[p][k] = c * x - s * y; A2[q][k] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
  }
  const sig = [0, 1, 2].map(i => Math.sqrt(Math.max(A2[i][i], 0)));
  const U = [0, 1, 2].map(i => [0, 1, 2].map(j => (S[i][0] * V[0][j] + S[i][1] * V[1][j] + S[i][2] * V[2][j]) / Math.max(sig[j], 1e-20)));
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  // U peut perdre une colonne si une valeur singulière est nulle : on la refait par produit vectoriel
  const col = (m, j) => [m[0][j], m[1][j], m[2][j]];
  const ord = [0, 1, 2].sort((a, b) => sig[b] - sig[a]);
  const u0 = col(U, ord[0]), u1 = col(U, ord[1]); const u2 = [u0[1] * u1[2] - u0[2] * u1[1], u0[2] * u1[0] - u0[0] * u1[2], u0[0] * u1[1] - u0[1] * u1[0]];
  const Uo = [0, 1, 2].map(i => [u0[i], u1[i], u2[i]]), Vo = [0, 1, 2].map(i => [V[i][ord[0]], V[i][ord[1]], V[i][ord[2]]]);
  const sg = [sig[ord[0]], sig[ord[1]], sig[ord[2]]];
  // u2 est déjà orienté pour que det(Uo) = 1 ; le signe de la dernière valeur suit det(Vo)
  const D3 = det(Vo) < 0 ? -1 : 1;
  const R = [0, 1, 2].map(i => [0, 1, 2].map(j => Uo[i][0] * Vo[j][0] + Uo[i][1] * Vo[j][1] + D3 * Uo[i][2] * Vo[j][2]));
  // la troisième valeur singulière garde son signe réel (u2·S·v2)
  const v2 = col(Vo, 2), Sv2 = [0, 1, 2].map(i => S[i][0] * v2[0] + S[i][1] * v2[1] + S[i][2] * v2[2]);
  const s3 = (u2[0] * Sv2[0] + u2[1] * Sv2[1] + u2[2] * Sv2[2]) * D3;
  const s = echelle ? (sg[0] + sg[1] + s3) / va : 1;
  const t = [0, 1, 2].map(i => mb[i] - s * (R[i][0] * ma[0] + R[i][1] * ma[1] + R[i][2] * ma[2]));
  return { s, R, t };
}
const appliquer = (T, x, y, z) => [0, 1, 2].map(i => T.s * (T.R[i][0] * x + T.R[i][1] * y + T.R[i][2] * z) + T.t[i]);
const composer = (B, A) => { // B∘A
  const R = [0, 1, 2].map(i => [0, 1, 2].map(j => B.R[i][0] * A.R[0][j] + B.R[i][1] * A.R[1][j] + B.R[i][2] * A.R[2][j]));
  const t = [0, 1, 2].map(i => B.s * (B.R[i][0] * A.t[0] + B.R[i][1] * A.t[1] + B.R[i][2] * A.t[2]) + B.t[i]);
  return { s: B.s * A.s, R, t };
};

// ICP : les points P (Float32Array, coordonnées déjà transformées par T0) vers la cible ; renvoie la transformation finale.
function icp(P, cherche, Pc, T0, { echelle = false, passes = 14, seuil = 0.03, symetrique = false } = {}) {
  let T = T0;
  for (let it = 0; it < passes; it++) {
    const A = [], B = []; let somme = 0, nb = 0;
    const lim = Math.max(seuil * Math.pow(0.82, it), 0.006);
    for (let v = 0; v < P.length / 3; v++) {
      const [x, y, z] = appliquer(T, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      const r = cherche(x, y, z, 1, 12)[0]; if (!r) continue;
      const d = Math.sqrt(r[0]); if (d > lim) continue;
      A.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); B.push(Pc[r[1] * 3], Pc[r[1] * 3 + 1], Pc[r[1] * 3 + 2]); somme += d; nb++;
      if (symetrique) { A.push(-P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); B.push(-Pc[r[1] * 3], Pc[r[1] * 3 + 1], Pc[r[1] * 3 + 2]); }
    }
    if (nb < 20) break;
    T = umeyama(A, B, echelle);
    if (symetrique) { T.t[0] = 0; }
    if (it === passes - 1) T.ecart = somme / nb;
  }
  return T;
}

// ---------- L'écorché ----------
const EC = lireGlb(GLB).pieces;
const gauche = EC.filter(p => p.extras.side !== 'right');
log(`écorché : ${EC.length} pièces, ${gauche.length} gardées (gauche et milieu ; la droite en est le miroir exact)`);

// Os de l'atlas (allégé), un ensemble par côté : chaque sommet d'os suit une seule articulation.
const osAtlas = { pair: [], impair: [] };
for (let i = 0; i < Q.n; i++) { if (Q.structure[i] === E.os.pair) osAtlas.pair.push(i); else if (Q.structure[i] === E.os.impair) osAtlas.impair.push(i); }
const chercheOs = { pair: grille(Q.P, osAtlas.pair), impair: grille(Q.P, osAtlas.impair) };
const artDe = (i) => { let b = 0; for (let k = 1; k < 4; k++) if (Q.W[i * 4 + k] > Q.W[i * 4 + b]) b = k; return Q.J[i * 4 + b]; };

// Os de Z-Anatomy en pleine résolution (ceux qui ont fait l'atlas), rangés par articulation.
const zaOs = lireBin(path.join(SOURCES, 'squelette.bin')).filter(e => {
  if (e.nom.endsWith('.r') || /\.(j|g)$/.test(e.nom) || e.nt < 20) return false;
  let xmin = 1e9, xmax = -1e9; for (let i = 0; i < e.P.length; i += 3) { xmin = Math.min(xmin, e.P[i]); xmax = Math.max(xmax, e.P[i]); }
  e.pair = e.nom.endsWith('.l') || xmin > 0.005; return Math.max(-xmin, xmax) <= 0.45;
});
const mode = (arr) => { const h = new Map(); for (const a of arr) h.set(a, (h.get(a) || 0) + 1); let b = -1, n = -1; for (const [k, v] of h) if (v > n) { b = k; n = v; } return b; };
const zaParArt = new Map();
for (const e of zaOs) {
  const ch = chercheOs[e.pair ? 'pair' : 'impair'], js = [];
  for (let v = 0; v < e.nv; v += 3) { const r = ch(e.P[v * 3], e.P[v * 3 + 1], e.P[v * 3 + 2])[0]; if (r) js.push(artDe(r[1])); }
  const j = mode(js); if (!zaParArt.has(j)) zaParArt.set(j, []); zaParArt.get(j).push(e);
}

// 1. Similitude d'ensemble : tous les os de l'écorché sur tous les os de Z-Anatomy.
const ecOs = gauche.filter(p => p.extras.layer === 'skeleton');
const concat = (L) => { const n = L.reduce((a, p) => a + p.length, 0), o = new Float32Array(n); let k = 0; for (const p of L) { o.set(p, k); k += p.length; } return o; };
const souspas = (P, pas) => { const o = []; for (let v = 0; v < P.length / 3; v += pas) o.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); return Float32Array.from(o); };
const zaTout = concat(zaOs.map(e => e.P)), chercheZa = grille(zaTout, tous(zaTout.length / 3));
const ID = { s: 1, R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
const G = icp(souspas(concat(ecOs.map(p => p.P)), 3), chercheZa, zaTout, ID, { echelle: true, passes: 16, seuil: 0.04, symetrique: true });
log(`similitude d'ensemble : échelle ${G.s.toFixed(4)}, translation ${G.t.map(v => (v * 1000).toFixed(1)).join(' ')} mm, écart moyen ${(G.ecart * 1000).toFixed(1)} mm`);

// 2. Articulation de chaque os de l'écorché (l'os de l'atlas le plus proche), puis un déplacement rigide par articulation
//    qui pose ses os sur ceux de Z-Anatomy.
const ecParArt = new Map();
for (const p of ecOs) {
  const mil = p.extras.side === 'midline', ch = chercheOs[mil ? 'impair' : 'pair'], js = [];
  for (let v = 0; v < p.nv; v += 2) { const [x, y, z] = appliquer(G, p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2]); const r = ch(x, y, z)[0]; if (r) js.push(artDe(r[1])); }
  p.art = mode(js); if (!ecParArt.has(p.art)) ecParArt.set(p.art, []); ecParArt.get(p.art).push(p);
}
const TJ = new Array(NJ).fill(null), ecartJ = new Array(NJ).fill(null);
const MILIEU = new Set(SQ.map((a, j) => /\.(G|D)$/.test(a.nom) ? -1 : j).filter(j => j >= 0));
for (const [j, L] of ecParArt) {
  const cible = zaParArt.get(j); if (!cible) continue;
  const Pc = concat(cible.map(e => e.P)), ch = grille(Pc, tous(Pc.length / 3), 0.004);
  const src = concat(L.map(p => p.P));
  const T = icp(src.length / 3 > 6000 ? souspas(src, 2) : src, ch, Pc, G, { echelle: false, passes: 18, seuil: 0.025, symetrique: MILIEU.has(j) });
  TJ[j] = T; ecartJ[j] = T.ecart; // déplacement rigide (l'échelle d'ensemble est à 0,2 % de 1)
}
// Une articulation sans os (attaches, retraits) prend le déplacement de son parent.
for (let j = 0; j < NJ; j++) if (!TJ[j]) { let k = SQ[j].parent; while (k >= 0 && !TJ[k]) k = SQ[k].parent; TJ[j] = k >= 0 ? TJ[k] : G; }
log('calage par articulation (écart moyen, mm) : ' + SQ.map((a, j) => ecartJ[j] != null ? `${a.nom} ${(ecartJ[j] * 1000).toFixed(1)}` : null).filter(Boolean).join(' · '));

// Pour l'écart des os, une fois calés.
function ecartOs(p) { const ch = chercheZa; let s = 0, n = 0, mx = 0; const T = TJ[p.art]; for (let v = 0; v < p.nv; v++) { const [x, y, z] = appliquer(T, p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2]); const r = ch(x, y, z)[0]; const d = Math.sqrt(r[0]); s += d; n++; mx = Math.max(mx, d); } return [s / n, mx]; }
{
  const L = ecOs.map(p => [p.nom, ...ecartOs(p)]).sort((a, b) => b[1] - a[1]);
  log('os calés : écart médian ' + (L[L.length >> 1][1] * 1000).toFixed(1) + ' mm ; les plus éloignés : ' + L.slice(0, 6).map(r => `${r[0]} ${(r[1] * 1000).toFixed(1)}/${(r[2] * 1000).toFixed(0)}`).join(' | '));
}

// 3. Les muscles : attaches de l'atlas (muscles qui le recouvrent), position finale = mélange des déplacements des
//    articulations selon ces attaches (comme la peau suit les os), puis attaches reprises à la position finale.
const muscAtlas = []; for (let i = 0; i < Q.n; i++) if (Q.structure[i] < E.os.pair) muscAtlas.push(i);
const chercheMusc = grille(Q.P, muscAtlas, 0.006);
function attaches(x, y, z, cherche, k = 4, filtre = null) {
  const miroir = x < 0; if (miroir) x = -x;
  let pr = cherche(x, y, z, filtre ? 24 : k); if (filtre) pr = pr.filter(([, i]) => filtre.has(Q.structure[i])).slice(0, k);
  if (!pr.length) pr = cherche(x, y, z, k);
  const acc = new Map(); let cs = 0, ws = 0;
  for (const [d2, i] of pr) { const w = 1 / (Math.sqrt(d2) + 0.0015) ** 2; ws += w; cs += w * Q.C[i]; for (let m = 0; m < 4; m++) { const W = Q.W[i * 4 + m]; if (W > 0) { const j = miroir ? JUMEAU[Q.J[i * 4 + m]] : Q.J[i * 4 + m]; acc.set(j, (acc.get(j) || 0) + W * w); } } }
  const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((a, b) => a + b[1], 0);
  return { J: top.map(t => t[0]), W: top.map(t => t[1] / s), C: cs / ws, structure: Q.structure[pr[0][1]] };
}
function placer(p, filtre) {
  const nv = p.nv, Pf = new Float32Array(nv * 3), J = new Uint8Array(nv * 4), W = new Float32Array(nv * 4), C = new Float32Array(nv), S = new Int32Array(nv);
  for (let v = 0; v < nv; v++) {
    const x = p.P[v * 3], y = p.P[v * 3 + 1], z = p.P[v * 3 + 2];
    const g = appliquer(G, x, y, z), a1 = attaches(g[0], g[1], g[2], chercheMusc, 4, filtre);
    const f = [0, 0, 0]; a1.J.forEach((j, k) => { const q = appliquer(TJ[j], x, y, z); for (let c = 0; c < 3; c++) f[c] += a1.W[k] * q[c]; });
    const a2 = attaches(f[0], f[1], f[2], chercheMusc, 4, filtre);
    Pf.set(f, v * 3); a2.J.forEach((j, k) => { J[v * 4 + k] = j; W[v * 4 + k] = a2.W[k]; }); C[v] = a2.C; S[v] = a2.structure;
  }
  return { P: Pf, J, W, C, S };
}

const pieces = [];
const ids = E.structures.map(s => s.id);
// Les muscles du curl, par leur nom dans l'écorché, sous l'identifiant de l'atlas que scene.py colore.
const ROLES = [[/^long head of left biceps brachii$/i, 'biceps_long'], [/^short head of left biceps brachii$/i, 'biceps_court'], [/^left brachialis$/i, 'brachial'],
  [/^left brachioradialis$/i, 'brachio_radial'], [/^humeral head of left pronator teres$/i, 'rond_pronateur_humeral'], [/^ulnar head of left pronator teres$/i, 'rond_pronateur_ulnaire'],
  [/^left flexor carpi radialis$/i, 'flechisseur_radial_carpe'], [/^left palmaris longus$/i, 'long_palmaire'],
  [/^left flexor digitorum superficialis$/i, 'flechisseur_superficiel_doigts_humero_ulnaire'], [/^left flexor digitorum superficialis \(2\)$/i, 'flechisseur_superficiel_doigts_radial'],
  [/^humeral head of left flexor carpi ulnaris$/i, 'flechisseur_ulnaire_carpe_humeral'], [/^ulnar head of left flexor carpi ulnaris$/i, 'flechisseur_ulnaire_carpe_ulnaire']];
const role = (n) => (ROLES.find(([r]) => r.test(n)) || [])[1];
// Os : rigides, sur leur articulation.
for (const p of ecOs) {
  const T = TJ[p.art], P = new Float32Array(p.nv * 3);
  for (let v = 0; v < p.nv; v++) P.set(appliquer(T, p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2]), v * 3);
  const J = new Uint8Array(p.nv * 4), W = new Float32Array(p.nv * 4); for (let v = 0; v < p.nv; v++) { J[v * 4] = p.art; W[v * 4] = 1; }
  pieces.push({ nom: p.nom, source: p.nom, type: 'os', region: '', pair: p.extras.side !== 'midline', app: [], nv: p.nv, nt: p.nt, T: p.T, tendon: new Uint8Array(p.nt), P, J, W, Cd: new Float32Array(p.nv) });
}
log(`os : ${ecOs.length} pièces`);

// Muscles : d'abord sans filtre pour trouver les muscles de l'atlas qu'ils recouvrent, puis attaches prises sur ceux-là.
const chroma = (p, v) => { const c = p.couleur, n = p.nc, r = c[v * n], g = c[v * n + 1], b = c[v * n + 2]; return (r - (g + b) / 2) / Math.max(r, 1e-3); };
let nbM = 0, nbV = 0;
const bilan = [];
// L'oblique interne et le droit de l'abdomen (Z-Anatomy dans l'écorché) passent par endroits au travers de la gaine de
// l'oblique externe qui les recouvre entièrement : des taches sombres sur le ventre. Ils restent dessous, invisibles :
// on ne les dessine pas.
const CACHES = /^left (internal oblique|rectus abdominis)$/i;
for (const p of gauche.filter(q => q.extras.layer !== 'skeleton' && !CACHES.test(q.nom))) {
  const essai = placer(p, null), h = new Map();
  for (let v = 0; v < p.nv; v++) h.set(essai.S[v], (h.get(essai.S[v]) || 0) + 1);
  const rang = [...h].sort((a, b) => b[1] - a[1]), garde = new Set(rang.filter(([, n]) => n >= 0.12 * p.nv).map(([s]) => s));
  const r = garde.size > 1 ? placer(p, garde) : essai;
  const dom = rang[0][0];
  const tendon = new Uint8Array(p.nt);
  for (let t = 0; t < p.nt; t++) { let k = 0; for (let c = 0; c < 3; c++) if (chroma(p, p.T[t * 3 + c]) < 0.65) k++; tendon[t] = k >= 2 || /linea alba|fascia/i.test(p.nom) ? 1 : 0; }
  const mil = p.extras.side === 'midline';
  pieces.push({ nom: role(p.nom) || 'ec:' + p.nom, source: p.nom, type: 'muscle', region: '', pair: !mil, app: [], nv: p.nv, nt: p.nt, T: p.T, tendon, P: r.P, J: r.J, W: r.W, Cd: r.C });
  bilan.push(`${p.nom} → ${rang.slice(0, 2).map(([s, n]) => `${ids[s]} ${Math.round(100 * n / p.nv)} %`).join(', ')}`);
  nbM++; nbV += p.nv;
}
fs.writeFileSync(sortie.replace(/\.bin$/, '') + '-muscles.txt', bilan.join('\n') + '\n');
log(`muscles : ${nbM} pièces, ${nbV} sommets (correspondance dans ${sortie.replace(/\.bin$/, '')}-muscles.txt)`);

// ---------- La peau des mains (Z-Anatomy, comme dans exporter.mjs) : elle couvre la main de l'écorché ----------
{
  const NOMS = ['Anterior region of wrist.l', 'Posterior region of wrist.l', 'Dorsal surfaces of digits of hand.l', 'Dorsum of hand.l', 'Nail plate.l', 'Palmar surfaces of digits of hand.l', 'Palm.l'];
  const regs = lireBin(path.join(SOURCES, 'regions.bin')).filter(e => NOMS.includes(e.nom));
  const cle = new Map(), Pw = [], Tw = [], ongle = [];
  for (const e of regs) {
    const loc = new Int32Array(e.nv);
    for (let v = 0; v < e.nv; v++) {
      const x = e.P[v * 3], y = e.P[v * 3 + 1], z = e.P[v * 3 + 2], k = Math.round(x * 1e5) + ',' + Math.round(y * 1e5) + ',' + Math.round(z * 1e5);
      let i = cle.get(k); if (i == null) { i = Pw.length / 3; cle.set(k, i); Pw.push(x, y, z); } loc[v] = i;
    }
    for (let t = 0; t < e.nt; t++) { Tw.push(loc[e.T[t * 3]], loc[e.T[t * 3 + 1]], loc[e.T[t * 3 + 2]]); ongle.push(e.nom.startsWith('Nail') ? 1 : 0); }
  }
  const nv = Pw.length / 3, cherche = grille(Q.P, tous(Q.n), 0.006), J = new Uint8Array(nv * 4), W = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const pr = cherche(Pw[v * 3], Pw[v * 3 + 1], Pw[v * 3 + 2], 6), acc = new Map();
    for (const [d2, i] of pr) { const w = 1 / (Math.sqrt(d2) + 0.001) ** 2; for (let k = 0; k < 4; k++) { const j = Q.J[i * 4 + k], ww = Q.W[i * 4 + k] * w; if (ww > 0) acc.set(j, (acc.get(j) || 0) + ww); } }
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((a, b) => a + b[1], 0);
    top.forEach(([j, w], k) => { J[v * 4 + k] = j; W[v * 4 + k] = w / s; });
  }
  pieces.push({ nom: 'peau_main', source: 'regions', type: 'peau', region: 'main', pair: true, app: [], nv, nt: Tw.length / 3, T: Uint32Array.from(Tw), tendon: Uint8Array.from(ongle),
    P: Float32Array.from(Pw), J, W, Cd: new Float32Array(nv) });
  log(`peau des mains : ${nv} sommets`);
}

// Sous la peau des mains, l'écorché ne se voit pas : on retire ce qui suit surtout la main et les doigts (sinon les
// muscles de la paume, plus épais que ceux de Z-Anatomy, la traverseraient).
{
  const MAIN = SQ.map(a => /^(main|doigt)/.test(a.nom));
  let retires = 0;
  for (const p of pieces) {
    if (p.type === 'peau') continue;
    const wm = new Float32Array(p.nv); for (let v = 0; v < p.nv; v++) for (let k = 0; k < 4; k++) if (MAIN[p.J[v * 4 + k]]) wm[v] += p.W[v * 4 + k];
    const T = [], ten = [];
    for (let t = 0; t < p.nt; t++) { const a = p.T[t * 3], b = p.T[t * 3 + 1], c = p.T[t * 3 + 2]; if (wm[a] > 0.6 && wm[b] > 0.6 && wm[c] > 0.6) { retires++; continue; } T.push(a, b, c); ten.push(p.tendon[t]); }
    p.T = Uint32Array.from(T); p.tendon = Uint8Array.from(ten); p.nt = ten.length;
  }
  log(`sous la peau des mains : ${retires} triangles retirés`);
}

// ---------- Les poses, comme exporter.mjs (même tempo, même moteur) ----------
const MV = chargerMouvements(FICHIER_MOUVEMENTS);
const corps = new MV.Corps(A1.E.squelette, A1.peau), TE = MV.TEINTES.clair;
const d = MV.definir(spec, corps, TE);
const lisse = x => x * x * x * (10 - 15 * x + 6 * x * x);
const PHASES = [[0.07, 0, 0], [0.36, 0, 1], [0.11, 1, 1], [0.40, 1, 0], [0.06, 0, 0]];
function uDe(t) { let a = 0; for (const [dur, u0, u1] of PHASES) { if (t < a + dur) return u0 + (u1 - u0) * lisse((t - a) / dur); a += dur; } return 0; }
const DQ = new Float32Array(N * NJ * 8), U = new Float32Array(N), materiel = [];
for (let f = 0; f < N; f++) {
  const u = uDe(f / N); U[f] = u;
  const info = corps.poser(MV.poseA(d, 0, u));
  DQ.set(corps.quaternionsDuaux(), f * NJ * 8);
  materiel.push(MV.materielDe(d, info, u, TE, {}).map(m => ({ forme: m.forme, s: Array.from(m.s), p: Array.from(m.p), q: Array.from(m.q) })));
}
log(`poses : ${N} images`);

const blocs = [], entete = { spec, images: N, fps: 25, U: Array.from(U), modele: 'ecorche', squelette: SQ.map(a => ({ nom: a.nom, parent: a.parent, centre: a.centre, jumeau: a.jumeau })), materiel, pieces: [] };
let dec = 0;
const ajouter = (ta) => { const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength); const pad = (4 - b.length % 4) % 4; blocs.push(b, Buffer.alloc(pad)); const o = dec; dec += b.length + pad; return o; };
for (const p of pieces) entete.pieces.push({ nom: p.nom, source: p.source, type: p.type, region: p.region, pair: p.pair, app: p.app, nv: p.nv, nt: p.nt,
  P: ajouter(p.P), T: ajouter(Uint32Array.from(p.T)), tendon: ajouter(p.tendon), J: ajouter(p.J), W: ajouter(p.W), C: ajouter(p.Cd) });
entete.DQ = ajouter(DQ);
const h = Buffer.from(JSON.stringify(entete)); const hp = Buffer.concat([h, Buffer.alloc((4 - h.length % 4) % 4, 32)]);
const tete = Buffer.alloc(4); tete.writeUInt32LE(hp.length);
fs.writeFileSync(sortie, Buffer.concat([tete, hp, ...blocs]));
log(`écrit ${sortie} : ${(fs.statSync(sortie).size / 1e6).toFixed(1)} Mo`);
