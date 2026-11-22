// Vidéo d'un exercice, étape 1 : le corps de l'atlas en pleine résolution (Z-Anatomy), avec les attaches, la carrure et
// la part « par la corde » du moteur, et les poses d'un mouvement image par image. Sortie lue par scene.py (Blender).
// SOURCES=<dossier de muscles.bin, squelette.bin et regions.bin> node --max-old-space-size=8000 exporter.mjs <mouvement> <images> <sortie.bin>
// <mouvement> : une ligne de mouvements/table.txt (ex. « curl hal »).
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from '../mouvements/silhouettes.mjs';
import { lireBin } from '../outils/commun.mjs';

const [spec = 'curl hal', nbImages = '70', sortie = 'proto.bin'] = process.argv.slice(2);
const N = +nbImages;
const SOURCES = process.env.SOURCES || '';
for (const f of ['muscles.bin', 'squelette.bin', 'regions.bin'])
  if (!fs.existsSync(path.join(SOURCES, f))) throw new Error(`SOURCES : ${f} introuvable dans « ${SOURCES} » (voir LISEZMOI, extraire_blend.py et extraire_peau.py)`);
const t0 = Date.now(), log = m => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + ' s  ' + m);

// Le modèle allégé, tel que l'appli le pose : carrure 1 (étoffé), et d'origine (carrure 0), même ordre de sommets.
process.env.CARRURE = '1'; const A1 = chargerAtlas(FICHIER_ATLAS);
process.env.CARRURE = '0'; const A0 = chargerAtlas(FICHIER_ATLAS);
const E = A1.E, Q1 = A1.points(1), Q0 = A0.points(1);
if (Q1.n !== Q0.n) throw new Error('ordre des sommets différent');
log(`atlas : ${Q1.n} sommets`);

// Recherche du plus proche : une grille de 6 mm par ensemble de sommets.
function grille(idx, P) {
  const g = new Map(), c = 0.006;
  for (const i of idx) { const k = Math.floor(P[i * 3] / c) + ',' + Math.floor(P[i * 3 + 1] / c) + ',' + Math.floor(P[i * 3 + 2] / c); let l = g.get(k); if (!l) g.set(k, l = []); l.push(i); }
  return (x, y, z, kmax = 4) => {
    const cx = Math.floor(x / c), cy = Math.floor(y / c), cz = Math.floor(z / c);
    for (let r = 1; r < 40; r++) {
      const res = [];
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let d = -r; d <= r; d++) {
        const l = g.get((cx + a) + ',' + (cy + b) + ',' + (cz + d)); if (!l) continue;
        for (const i of l) { const dx = P[i * 3] - x, dy = P[i * 3 + 1] - y, dz = P[i * 3 + 2] - z; res.push([dx * dx + dy * dy + dz * dz, i]); }
      }
      if (res.length >= kmax) { res.sort((u, v) => u[0] - v[0]); return res.slice(0, kmax); }
    }
    return null;
  };
}

const REG = JSON.parse(fs.readFileSync(new URL('../donnees/registre.json', import.meta.url), 'utf8'));
const parSource = new Map(REG.muscles.map(r => [r.source, r]));
const parId = new Map(E.structures.map((s, i) => [s.id, [s, i]]));
const base = n => n.replace(/\.(l|r)$/, '');
const pieces = [];

// Transfert : attaches et poids du plus proche sommet allégé ; déplacement de la carrure, moyenne pondérée des quatre
// plus proches (le champ est doux).
function transferer(e, idx, rigide) {
  const cherche = grille(idx, Q0.P), nv = e.nv;
  const P = new Float32Array(nv * 3), J = new Uint8Array(nv * 4), W = new Float32Array(nv * 4), Cd = new Float32Array(nv);
  let dmax = 0;
  for (let v = 0; v < nv; v++) {
    const x = e.P[v * 3], y = e.P[v * 3 + 1], z = e.P[v * 3 + 2], pr = cherche(x, y, z);
    const i0 = pr[0][1]; dmax = Math.max(dmax, Math.sqrt(pr[0][0]));
    for (let k = 0; k < 4; k++) { J[v * 4 + k] = Q1.J[i0 * 4 + k]; W[v * 4 + k] = Q1.W[i0 * 4 + k]; }
    Cd[v] = Q1.C[i0];
    let sx = 0, sy = 0, sz = 0, sw = 0;
    if (!rigide) for (const [d2, i] of pr) { const w = 1 / (Math.sqrt(d2) + 0.0005) ** 2; sx += w * (Q1.P[i * 3] - Q0.P[i * 3]); sy += w * (Q1.P[i * 3 + 1] - Q0.P[i * 3 + 1]); sz += w * (Q1.P[i * 3 + 2] - Q0.P[i * 3 + 2]); sw += w; }
    P[v * 3] = x + (sw ? sx / sw : 0); P[v * 3 + 1] = y + (sw ? sy / sw : 0); P[v * 3 + 2] = z + (sw ? sz / sw : 0);
  }
  return { P, J, W, Cd, dmax };
}

for (const e of lireBin(path.join(SOURCES, 'muscles.bin'))) {
  if (e.nom.endsWith('.r')) continue;
  const r = parSource.get(base(e.nom)); if (!r) continue;
  const [s] = parId.get(r.id) || []; if (!s) continue;
  const idx = []; for (let i = s.sommets; i < s.sommets + s.nbSommets; i++) idx.push(i);
  const t = transferer(e, idx, false);
  const iT = e.mats.indexOf('Tendon'), tendon = new Uint8Array(e.nt); for (let k = 0; k < e.nt; k++) tendon[k] = e.M[k] === iT ? 1 : 0;
  if (t.dmax > 0.004) console.log("  écart", r.id, e.nom, (t.dmax * 1000).toFixed(1), "mm");
  pieces.push({ nom: r.id, source: e.nom, type: r.type, region: r.region, pair: r.pair, app: r.app, nv: e.nv, nt: e.nt, T: e.T, tendon, ...t });
}
log(`muscles : ${pieces.length} pièces, ${pieces.reduce((a, p) => a + p.nv, 0)} sommets, écart max au modèle allégé ${(Math.max(...pieces.map(p => p.dmax)) * 1000).toFixed(1)} mm`);

// Les os : pairs (dessinés des deux côtés) et du milieu ; attaches du plus proche sommet d'os allégé du même ensemble.
const osIdx = { pair: [], impair: [] };
for (let i = 0; i < Q1.n; i++) { if (Q1.structure[i] === E.os.pair) osIdx.pair.push(i); else if (Q1.structure[i] === E.os.impair) osIdx.impair.push(i); }
let nbOs = 0;
for (const e of lireBin(path.join(SOURCES, 'squelette.bin'))) {
  if (e.nom.endsWith('.r') || /\.(j|g)$/.test(e.nom) || e.nt < 20) continue;
  let xmin = 1e9, xmax = -1e9; for (let i = 0; i < e.P.length; i += 3) { xmin = Math.min(xmin, e.P[i]); xmax = Math.max(xmax, e.P[i]); }
  if (Math.max(-xmin, xmax) > 0.45) continue;
  const pair = e.nom.endsWith('.l') || xmin > 0.005;
  const t = transferer(e, pair ? osIdx.pair : osIdx.impair, true);
  if (t.dmax > 0.004) console.log("  écart os", e.nom, (t.dmax * 1000).toFixed(1), "mm");
  pieces.push({ nom: e.nom, source: e.nom, type: 'os', region: '', pair, app: [], nv: e.nv, nt: e.nt, T: e.T, tendon: new Uint8Array(e.nt), ...t });
  nbOs++;
}
log(`os : ${nbOs} pièces`);

// La peau des mains (comme dans l'appli : la chair des doigts reste dessous) : les régions de Z-Anatomy, soudées en une
// surface ; attaches mélangées des six sommets allégés les plus proches (muscles et os), sans carrure.
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
  const nv = Pw.length / 3, tous = []; for (let i = 0; i < Q0.n; i++) tous.push(i);
  const cherche = grille(tous, Q0.P), J = new Uint8Array(nv * 4), W = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const pr = cherche(Pw[v * 3], Pw[v * 3 + 1], Pw[v * 3 + 2], 6), acc = new Map();
    for (const [d2, i] of pr) { const w = 1 / (Math.sqrt(d2) + 0.001) ** 2; for (let k = 0; k < 4; k++) { const j = Q1.J[i * 4 + k], ww = Q1.W[i * 4 + k] * w; if (ww > 0) acc.set(j, (acc.get(j) || 0) + ww); } }
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((a, b) => a + b[1], 0);
    top.forEach(([j, w], k) => { J[v * 4 + k] = j; W[v * 4 + k] = w / s; });
  }
  pieces.push({ nom: 'peau_main', source: 'regions', type: 'peau', region: 'main', pair: true, app: [], nv, nt: Tw.length / 3, T: Uint32Array.from(Tw), tendon: Uint8Array.from(ongle),
    P: Float32Array.from(Pw), J, W, Cd: new Float32Array(nv), dmax: 0 });
  log(`peau des mains : ${nv} sommets, ${Tw.length / 3} triangles (${regs.length} régions)`);
}

// Les poses, image par image : le tempo d'une vraie répétition (pause en bas, montée, contraction en haut, descente
// freinée), en profil de secousse minimale ; la boucle se referme sur la première image.
const MV = chargerMouvements(FICHIER_MOUVEMENTS);
const corps = new MV.Corps(E.squelette, A1.peau), TE = MV.TEINTES.clair;
const d = MV.definir(spec, corps, TE);
const lisse = x => x * x * x * (10 - 15 * x + 6 * x * x);
const PHASES = [[0.07, 0, 0], [0.36, 0, 1], [0.11, 1, 1], [0.40, 1, 0], [0.06, 0, 0]];
function uDe(t) { let a = 0; for (const [dur, u0, u1] of PHASES) { if (t < a + dur) return u0 + (u1 - u0) * lisse((t - a) / dur); a += dur; } return 0; }
const nb = E.squelette.length, DQ = new Float32Array(N * nb * 8), U = new Float32Array(N), materiel = [];
for (let f = 0; f < N; f++) {
  const u = uDe(f / N); U[f] = u;
  const info = corps.poser(MV.poseA(d, 0, u));
  DQ.set(corps.quaternionsDuaux(), f * nb * 8);
  materiel.push(MV.materielDe(d, info, u, TE, {}).map(m => ({ forme: m.forme, s: Array.from(m.s), p: Array.from(m.p), q: Array.from(m.q) })));
}
log(`poses : ${N} images`);

// Écriture : en-tête JSON, puis les tableaux de chaque pièce et les poses (coordonnées de l'appli : y en haut).
const blocs = [], entete = { spec, images: N, fps: 25, U: Array.from(U), squelette: E.squelette.map(a => ({ nom: a.nom, parent: a.parent, centre: a.centre, jumeau: a.jumeau })), materiel, pieces: [] };
let dec = 0;
const ajouter = (ta) => { const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength); const pad = (4 - b.length % 4) % 4; blocs.push(b, Buffer.alloc(pad)); const o = dec; dec += b.length + pad; return o; };
for (const p of pieces) entete.pieces.push({ nom: p.nom, source: p.source, type: p.type, region: p.region, pair: p.pair, app: p.app, nv: p.nv, nt: p.nt,
  P: ajouter(p.P), T: ajouter(p.T), tendon: ajouter(p.tendon), J: ajouter(p.J), W: ajouter(p.W), C: ajouter(p.Cd) });
entete.DQ = ajouter(DQ);
const h = Buffer.from(JSON.stringify(entete)); const hp = Buffer.concat([h, Buffer.alloc((4 - h.length % 4) % 4, 32)]);
const tete = Buffer.alloc(4); tete.writeUInt32LE(hp.length);
fs.writeFileSync(sortie, Buffer.concat([tete, hp, ...blocs]));
log(`écrit ${sortie} : ${(fs.statSync(sortie).size / 1e6).toFixed(1)} Mo`);
