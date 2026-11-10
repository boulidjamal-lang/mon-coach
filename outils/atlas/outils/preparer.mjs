// Chaîne de préparation de l'atlas : part des maillages extraits de Z-Anatomy et produit le modèle de l'appli.
//   1. garde les structures du registre (côté gauche : le droit est son miroir exact) et le squelette ;
//   2. allège chaque maillage à erreur géométrique bornée (en millimètres), en gardant la limite muscle / tendon ;
//   3. range les muscles en couches de profondeur, par épluchage : est « en surface » ce qu'on voit de l'extérieur ;
//   4. calcule pour chaque sommet l'ombrage de relief (part du ciel cachée par les muscles voisins et les os) ;
//   5. écrit le tout dans un fichier compact (positions sur 16 bits, normales sur 2 octets).
// Usage : node outils/preparer.mjs <dossier des .bin extraits> <sortie.bin> [erreur en mm]
import fs from 'fs';
import v8 from 'v8';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { lireBin, genre, tendonParSommet, normales } from './commun.mjs';
import { reduire } from './simplifier.mjs';

const [dossier, sortie, erreurMm = '0.5'] = process.argv.slice(2);
const ERR = Number(erreurMm) / 1000;
const REG = JSON.parse(fs.readFileSync('donnees/registre.json', 'utf8'));
const base = n => n.replace(/\.(l|r)$/, '');
const t0 = Date.now(), chrono = m => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + ' s  ' + m);

/* ---------- 1 et 2 : choix et allègement ---------- */
function voisins(nv, T) { const V = Array.from({ length: nv }, () => new Set()); for (let i = 0; i < T.length; i += 3) { const a = T[i], b = T[i + 1], c = T[i + 2]; V[a].add(b).add(c); V[b].add(a).add(c); V[c].add(a).add(b); } return V.map(s => Uint32Array.from(s)); }
function lisser(val, V, tours, part = 0.5) { let a = Float32Array.from(val); for (let k = 0; k < tours; k++) { const b = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { const v = V[i]; if (!v.length) { b[i] = a[i]; continue; } let s = 0; for (let j = 0; j < v.length; j++) s += a[v[j]]; b[i] = a[i] * (1 - part) + part * s / v.length; } a = b; } return a; }

/* Ouverture de la gaine des droits. Dans Z-Anatomy, les aponévroses des obliques et du transverse passent devant le
   grand droit de l'abdomen, comme dans un corps réel : il reste invisible sous elles. On les ouvre en fenêtre, comme
   sur les planches d'anatomie : chaque triangle de ces lames qui a le grand droit (ou le pyramidal) juste derrière lui,
   en direction de l'axe du tronc, est retiré. Le grand droit apparaît alors dans son relief propre. */
function ouvrirGaine(bruts) {
  const cibles = ['grand_droit_abdomen', 'pyramidal'].map(id => bruts.get(id)).filter(Boolean);
  if (!cibles.length) return;
  let nv = 0, nt = 0; for (const { e } of cibles) { nv += e.P.length / 3 * 2; nt += e.T.length * 2; }
  const P = new Float32Array(nv * 3), T = new Uint32Array(nt); let v = 0, t = 0;
  for (const { e } of cibles) for (const s of [1, -1]) {
    const n = e.P.length / 3;
    for (let k = 0; k < n; k++) { P[(v + k) * 3] = s * e.P[k * 3]; P[(v + k) * 3 + 1] = e.P[k * 3 + 1]; P[(v + k) * 3 + 2] = e.P[k * 3 + 2]; }
    for (let k = 0; k < e.T.length; k++) T[t++] = v + e.T[k];
    v += n;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(new THREE.BufferAttribute(T, 1));
  const bvh = new MeshBVH(g), rayon = new THREE.Ray();
  // Le bord de la fenêtre est régularisé (vote des sommets voisins) pour suivre le contour du muscle sans dentelures ;
  // les lames profondes sont ouvertes un peu plus large, pour que leur bord reste caché sous celui de l'oblique externe.
  const marges = { oblique_externe: 0, oblique_interne: 3, transverse_abdomen: 5 };
  for (const id of Object.keys(marges)) {
    const b = bruts.get(id); if (!b) continue;
    const e = b.e, nv = e.P.length / 3, V = voisins(nv, e.T);
    let f = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) {
      const x = e.P[i * 3], y = e.P[i * 3 + 1], z = e.P[i * 3 + 2], l = Math.hypot(x, z) || 1;
      rayon.direction.set(-x / l, 0, -z / l);
      rayon.origin.set(x, y, z).addScaledVector(rayon.direction, -0.004);
      f[i] = bvh.raycastFirst(rayon, THREE.DoubleSide, 0, 0.03) ? 1 : 0;
    }
    const dilater = (f, sens) => { const g2 = Uint8Array.from(f); for (let i = 0; i < nv; i++) if (f[i] !== sens) { const v = V[i]; for (let j = 0; j < v.length; j++) if (f[v[j]] === sens) { g2[i] = sens; break; } } return g2; };
    // Fermeture (les languettes étroites laissées entre les digitations du muscle disparaissent), puis vote des voisins.
    for (let k = 0; k < 4; k++) f = dilater(f, 1);
    for (let k = 0; k < 4; k++) f = dilater(f, 0);
    for (let k = 0; k < 3; k++) { const g2 = Uint8Array.from(f); for (let i = 0; i < nv; i++) { const v = V[i]; if (!v.length) continue; let n = f[i]; for (let j = 0; j < v.length; j++) n += f[v[j]]; g2[i] = n * 2 > v.length + 1 ? 1 : 0; } f = g2; }
    for (let k = 0; k < marges[id]; k++) f = dilater(f, 1);
    let T2 = [], M2 = [], retires = 0;
    for (let k = 0; k < e.T.length; k += 3) {
      if (f[e.T[k]] && f[e.T[k + 1]] && f[e.T[k + 2]]) { retires++; continue; }
      T2.push(e.T[k], e.T[k + 1], e.T[k + 2]); M2.push(e.M[k / 3]);
    }
    // Les petits lambeaux isolés par la découpe sont retirés (on ne garde que les grands morceaux).
    { const nt = M2.length, parent = new Int32Array(nv).map((_, i) => i), racine = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      for (let k = 0; k < T2.length; k += 3) { const a = racine(T2[k]), b2 = racine(T2[k + 1]), c = racine(T2[k + 2]); parent[b2] = a; parent[racine(c)] = a; }
      const taille = new Map(); for (let k = 0; k < T2.length; k += 3) { const r = racine(T2[k]); taille.set(r, (taille.get(r) || 0) + 1); }
      const T3 = [], M3 = []; for (let k = 0; k < T2.length; k += 3) if (taille.get(racine(T2[k])) >= 0.02 * nt) { T3.push(T2[k], T2[k + 1], T2[k + 2]); M3.push(M2[k / 3]); } else retires++;
      T2 = T3; M2 = M3; }
    // Le bord de la découpe : chaque arête qui n'appartient plus qu'à un triangle. On le lisse le long de lui-même,
    // puis on referme la lame (elle a deux feuillets) en ramenant le bord du feuillet interne sur celui du feuillet externe.
    const arete = new Map();
    for (let k = 0; k < T2.length; k += 3) for (let j = 0; j < 3; j++) { const a = T2[k + j], b2 = T2[k + (j + 1) % 3], cle = a < b2 ? a * nv + b2 : b2 * nv + a; arete.set(cle, (arete.get(cle) || 0) + 1); }
    const vb = new Map();
    for (const [cle, n] of arete) if (n === 1) { const a = Math.floor(cle / nv), b2 = cle % nv; if (!vb.has(a)) vb.set(a, []); if (!vb.has(b2)) vb.set(b2, []); vb.get(a).push(b2); vb.get(b2).push(a); }
    for (let tour = 0; tour < 12; tour++) {
      const np = new Map();
      for (const [i, vs] of vb) if (vs.length === 2) np.set(i, [0, 1, 2].map(k => 0.5 * e.P[i * 3 + k] + 0.25 * (e.P[vs[0] * 3 + k] + e.P[vs[1] * 3 + k])));
      for (const [i, q] of np) { e.P[i * 3] = q[0]; e.P[i * 3 + 1] = q[1]; e.P[i * 3 + 2] = q[2]; }
    }
    const N0 = normales(e.P, Uint32Array.from(T2)), dehors = [], dedans = [];
    for (const i of vb.keys()) { const x = e.P[i * 3], z = e.P[i * 3 + 2], l = Math.hypot(x, z) || 1; ((N0[i * 3] * x + N0[i * 3 + 2] * z) / l > 0 ? dehors : dedans).push(i); }
    let refermes = 0;
    for (const i of dedans) {
      let mieux = -1, dm = 0.008 * 0.008;
      for (const j of dehors) { const dx = e.P[i * 3] - e.P[j * 3], dy = e.P[i * 3 + 1] - e.P[j * 3 + 1], dz = e.P[i * 3 + 2] - e.P[j * 3 + 2], d = dx * dx + dy * dy + dz * dz; if (d < dm) { dm = d; mieux = j; } }
      if (mieux >= 0) { e.P[i * 3] = e.P[mieux * 3]; e.P[i * 3 + 1] = e.P[mieux * 3 + 1]; e.P[i * 3 + 2] = e.P[mieux * 3 + 2]; refermes++; }
    }
    e.T = Uint32Array.from(T2); e.M = Uint8Array.from(M2); e.nt = M2.length; b.bordFixe = true;
    chrono(`gaine des droits : ${retires} triangles retirés de ${id} (sur ${retires + M2.length}), bord de ${vb.size} sommets dont ${refermes} refermés`);
  }
}

const cache = `donnees/allege-${erreurMm}.v8`;
let ENT, OS;
if (fs.existsSync(cache) && !process.env.REFAIRE) ({ ENT, OS } = v8.deserialize(fs.readFileSync(cache)));
else {
  const parSource = new Map(REG.muscles.map(r => [r.source, r]));
  const bruts = new Map();
  for (const e of lireBin(dossier + '/muscles.bin')) {
    if (e.nom.endsWith('.r')) continue;
    const r = parSource.get(base(e.nom)); if (!r) continue;
    if (bruts.has(r.id)) throw new Error('deux maillages pour ' + r.id);
    bruts.set(r.id, { e, r });
  }
  ouvrirGaine(bruts);
  ENT = []; let avant = 0, apres = 0;
  for (const { e, r, bordFixe } of bruts.values()) {
    // Part de tendon par sommet, adoucie sur quelques millimètres : la jonction muscle-tendon est progressive.
    const tendon = r.type !== 'muscle' ? new Float32Array(e.P.length / 3).fill(1) : lisser(tendonParSommet(e), voisins(e.P.length / 3, e.T), 3);
    const m = reduire(e.P, e.T, tendon, ERR, 0.02, !!bordFixe);
    avant += e.T.length / 3; apres += m.T.length / 3;
    ENT.push({ id: r.id, P: m.P, T: m.T, tendon: m.attr });
  }
  const manquants = REG.muscles.filter(r => !ENT.some(x => x.id === r.id)); if (manquants.length) throw new Error('sans maillage : ' + manquants.map(r => r.id));
  chrono(`muscles allégés : ${ENT.length} structures, ${avant} -> ${apres} triangles (un côté)`);
  OS = []; let osAvant = 0, osApres = 0;
  for (const e of lireBin(dossier + '/squelette.bin')) {
    if (e.nom.endsWith('.r') || /\.(j|g)$/.test(e.nom) || e.nt < 20) continue;
    let xmin = 1e9, xmax = -1e9; for (let i = 0; i < e.P.length; i += 3) { xmin = Math.min(xmin, e.P[i]); xmax = Math.max(xmax, e.P[i]); }
    if (Math.max(-xmin, xmax) > 0.45) continue;
    const m = reduire(e.P, e.T, null, ERR * 1.6);
    osAvant += e.T.length / 3; osApres += m.T.length / 3;
    OS.push({ nom: e.nom, pair: e.nom.endsWith('.l') || xmin > 0.005, P: m.P, T: m.T });
  }
  chrono(`os allégés : ${OS.length} pièces, ${osAvant} -> ${osApres} triangles`);
  fs.writeFileSync(cache, v8.serialize({ ENT, OS }));
}
const parId = new Map(REG.muscles.map(r => [r.id, r]));
ENT.sort((a, b) => REG.muscles.indexOf(parId.get(a.id)) - REG.muscles.indexOf(parId.get(b.id)));
for (const e of ENT) { e.N = normales(e.P, e.T); e.reg = parId.get(e.id); }
for (const o of OS) o.N = normales(o.P, o.T);

/* ---------- Le monde entier (les deux côtés) pour les lancers de rayons ---------- */
// Chaque structure est posée à gauche puis en miroir ; les os de même. sommetEnt donne la structure d'un sommet (-1 : os).
function monde(garder) {
  let nv = 0, nt = 0; const liste = [];
  ENT.forEach((e, i) => { if (garder(i) && e.reg.type !== 'aponevrose') { const k = e.reg.pair ? 2 : 1; liste.push([e, i, e.reg.pair]); nv += e.P.length / 3 * k; nt += e.T.length / 3 * k; } });
  for (const o of OS) { liste.push([o, -1, o.pair]); nv += o.P.length / 3 * (o.pair ? 2 : 1); nt += o.T.length / 3 * (o.pair ? 2 : 1); }
  const P = new Float32Array(nv * 3), T = new Uint32Array(nt * 3), sommetEnt = new Int16Array(nv); let v = 0, t = 0;
  for (const [m, i, pair] of liste) for (let cote = 0; cote < (pair ? 2 : 1); cote++) {
    const n = m.P.length / 3, s = cote ? -1 : 1;
    for (let k = 0; k < n; k++) { P[(v + k) * 3] = s * m.P[k * 3]; P[(v + k) * 3 + 1] = m.P[k * 3 + 1]; P[(v + k) * 3 + 2] = m.P[k * 3 + 2]; sommetEnt[v + k] = i; }
    for (let k = 0; k < m.T.length; k += 3) { T[t++] = v + m.T[k]; T[t++] = v + m.T[k + (cote ? 2 : 1)]; T[t++] = v + m.T[k + (cote ? 1 : 2)]; }
    v += n;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(new THREE.BufferAttribute(T, 1));
  const bvh = new MeshBVH(g, { maxLeafTris: 6 });
  return { P, T: g.index.array, sommetEnt, bvh, nt };
}

/* ---------- 3 : couches de profondeur, par épluchage ---------- */
// On regarde le corps depuis 26 directions, avec une grille de rayons parallèles : la part de la surface d'un muscle
// qu'on atteint en premier dit s'il est en surface. On retire alors la couche trouvée et on recommence.
const DIRS = []; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) DIRS.push(new THREE.Vector3(x, y, z).normalize());
const PAS = 0.003, SEUIL = Number(process.env.SEUIL || 0.14);
function partsVisibles(M) {
  const vus = new Float64Array(ENT.length), surf = new Float64Array(ENT.length);
  const boite = new THREE.Box3().setFromArray(M.P), centre = boite.getCenter(new THREE.Vector3()), R = boite.getSize(new THREE.Vector3()).length() / 2 + 0.05;
  const coins = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(i & 1 ? boite.max.x : boite.min.x, i & 2 ? boite.max.y : boite.min.y, i & 4 ? boite.max.z : boite.min.z));
  const rayon = new THREE.Ray(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  // Surface tournée vers l'observateur, par structure et par direction (ce qu'on verrait si rien ne la cachait).
  for (const d of DIRS) {
    for (let t = 0; t < M.T.length; t += 3) {
      const e = M.sommetEnt[M.T[t]]; if (e < 0) continue;
      a.fromArray(M.P, M.T[t] * 3); b.fromArray(M.P, M.T[t + 1] * 3); c.fromArray(M.P, M.T[t + 2] * 3);
      n.crossVectors(b.sub(a), c.sub(a)); const f = -0.5 * n.dot(d); if (f > 0) surf[e] += f;
    }
    const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize(), w = new THREE.Vector3().crossVectors(d, u);
    let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9; for (const k of coins) { const q = k.clone().sub(centre); u0 = Math.min(u0, q.dot(u)); u1 = Math.max(u1, q.dot(u)); w0 = Math.min(w0, q.dot(w)); w1 = Math.max(w1, q.dot(w)); }
    rayon.direction.copy(d);
    for (let i = u0; i <= u1; i += PAS) for (let j = w0; j <= w1; j += PAS) {
      rayon.origin.copy(centre).addScaledVector(d, -R).addScaledVector(u, i).addScaledVector(w, j);
      const h = M.bvh.raycastFirst(rayon, THREE.DoubleSide); if (!h) continue;
      const e = M.sommetEnt[M.T[h.faceIndex * 3]]; if (e >= 0) vus[e] += PAS * PAS;
    }
  }
  return Array.from(vus, (v, i) => surf[i] > 0 ? v / surf[i] : 0);
}
const cacheCouches = `donnees/couches-${erreurMm}.json`;
let couche;
if (fs.existsSync(cacheCouches) && !process.env.REFAIRE && !process.env.RECOUCHES) couche = JSON.parse(fs.readFileSync(cacheCouches, 'utf8'));
else {
  // Retouches à la main (donnees/couches-forcees.json), posées d'avance pour les rares cas où la part visible contredit
  // l'usage anatomique (un grand muscle dont une petite part seulement affleure reste un muscle de surface).
  const forcees = fs.existsSync('donnees/couches-forcees.json') ? JSON.parse(fs.readFileSync('donnees/couches-forcees.json', 'utf8')) : {};
  couche = ENT.map(e => e.reg.type === 'aponevrose' ? 1 : (forcees[e.id] || 0)); const trace = ENT.map(() => []);
  const fige = couche.map(c => c > 0);
  for (let k = 1; k <= 5; k++) {
    const reste = couche.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0); if (!reste.length) break;
    const parts = partsVisibles(monde(i => couche[i] === 0 || couche[i] >= k));
    for (const i of reste) { trace[i].push(parts[i].toFixed(2)); if (parts[i] >= SEUIL || k === 5) couche[i] = k; }
    chrono(`couche ${k} : ${couche.filter(c => c === k).length} structures`);
  }
  fs.writeFileSync(cacheCouches, JSON.stringify(couche));
  fs.writeFileSync('rapport/couches.txt', ENT.map((e, i) => `${couche[i]}  ${e.id.padEnd(46)} ${fige[i] ? 'posée à la main' : trace[i].join(' ')}`).sort().join('\n') + '\n');
}
ENT.forEach((e, i) => { e.couche = couche[i]; });
const NB_COUCHES = Math.max(...couche);

/* ---------- 4 : ombrage de relief par sommet ---------- */
// Pour un sommet de la couche k, seuls comptent les muscles de même couche ou plus profonds, et les os : ainsi
// l'ombrage reste juste quand on retire les couches du dessus. Les rayons partent dans la demi-sphère de la normale,
// pondérés en cosinus ; un obstacle proche assombrit plus qu'un obstacle lointain.
const RAYONS = Number(process.env.RAYONS || 64), PORTEE = 0.09;
const ECH = []; for (let i = 0; i < RAYONS; i++) { const u = (i + 0.5) / RAYONS, v = (i * 0.61803398875) % 1, r = Math.sqrt(u), ph = 2 * Math.PI * v; ECH.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u)]); }
function ombrage(M, P, N, graine) {
  const nv = P.length / 3, ao = new Float32Array(nv), rayon = new THREE.Ray(), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < nv; i++) {
    n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
    t.set(Math.abs(n.x) < 0.8 ? 1 : 0, Math.abs(n.x) < 0.8 ? 0 : 1, 0).cross(n).normalize(); b.crossVectors(n, t);
    const tourne = ((i * 2654435761 + graine) >>> 0) / 4294967296 * 2 * Math.PI, ct = Math.cos(tourne), st = Math.sin(tourne);
    rayon.origin.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).addScaledVector(n, 0.0004);
    let cache = 0;
    for (let k = 0; k < RAYONS; k++) {
      const e = ECH[k], x = e[0] * ct - e[1] * st, y = e[0] * st + e[1] * ct;
      rayon.direction.set(t.x * x + b.x * y + n.x * e[2], t.y * x + b.y * y + n.y * e[2], t.z * x + b.z * y + n.z * e[2]);
      const h = M.bvh.raycastFirst(rayon, THREE.DoubleSide, 0, PORTEE);
      if (h) { const q = 1 - h.distance / PORTEE; cache += q * (2 - q); }
    }
    ao[i] = 1 - cache / RAYONS;
  }
  return ao;
}
const cacheOmbre = `donnees/ombrage-${erreurMm}.v8`;
let OMB;
if (fs.existsSync(cacheOmbre) && !process.env.REFAIRE && !process.env.RECOUCHES && !process.env.REOMBRE) OMB = v8.deserialize(fs.readFileSync(cacheOmbre));
else {
  OMB = { ent: [], os: [] };
  for (let k = 1; k <= NB_COUCHES; k++) {
    const M = monde(i => couche[i] >= k);
    ENT.forEach((e, i) => { if (couche[i] === k) OMB.ent[i] = lisser(ombrage(M, e.P, e.N, i), voisins(e.P.length / 3, e.T), 1, 0.35); });
    chrono(`ombrage de la couche ${k}`);
  }
  const M = monde(() => false);
  OS.forEach((o, i) => { OMB.os[i] = lisser(ombrage(M, o.P, o.N, 7 * i), voisins(o.P.length / 3, o.T), 1, 0.35); });
  chrono('ombrage du squelette');
  fs.writeFileSync(cacheOmbre, v8.serialize(OMB));
}

/* ---------- 5 : écriture ---------- */
// Un seul tampon de sommets pour tout le modèle (12 octets par sommet) :
//   position x, y, z sur 16 bits (dans la boîte du modèle) · ombrage · part de tendon · normale (2 octets, octaèdre) · numéro de structure · libre.
// Les triangles sont rangés par structure, en indices locaux sur 16 bits quand la structure le permet.
const pieces = ENT.map((e, i) => ({ P: e.P, T: e.T, N: e.N, tendon: e.tendon, ombre: OMB.ent[i], num: i }));
const NUM_OS_PAIR = ENT.length, NUM_OS_IMPAIR = ENT.length + 1;
if (NUM_OS_IMPAIR > 255) throw new Error('trop de structures pour un numéro sur un octet');
OS.forEach((o, i) => pieces.push({ P: o.P, T: o.T, N: o.N, tendon: null, ombre: OMB.os[i], num: o.pair ? NUM_OS_PAIR : NUM_OS_IMPAIR }));
const mini = [1e9, 1e9, 1e9], maxi = [-1e9, -1e9, -1e9];
for (const p of pieces) for (let i = 0; i < p.P.length; i++) { mini[i % 3] = Math.min(mini[i % 3], p.P[i]); maxi[i % 3] = Math.max(maxi[i % 3], p.P[i]); }
const etendue = maxi.map((m, k) => m - mini[k]);
const nvTotal = pieces.reduce((s, p) => s + p.P.length / 3, 0), ntTotal = pieces.reduce((s, p) => s + p.T.length / 3, 0);
const sommets = Buffer.alloc(nvTotal * 12), indices = Buffer.alloc(ntTotal * 3 * 2), listePieces = [];
const octa = (x, y, z) => { const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; let u = x / s, v = y / s; if (z < 0) { const u2 = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1), v2 = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1); u = u2; v = v2; } return [Math.max(-127, Math.min(127, Math.round(u * 127))), Math.max(-127, Math.min(127, Math.round(v * 127)))]; };
let v = 0, t = 0; const plages = [];
for (const p of pieces) {
  const n = p.P.length / 3;
  for (let i = 0; i < n; i++) {
    const o = (v + i) * 12;
    for (let k = 0; k < 3; k++) sommets.writeUInt16LE(Math.round((p.P[i * 3 + k] - mini[k]) / etendue[k] * 65535), o + k * 2);
    sommets.writeUInt8(Math.round(255 * Math.min(1, Math.max(0, p.ombre[i]))), o + 6);
    sommets.writeUInt8(p.tendon ? Math.round(255 * Math.min(1, Math.max(0, p.tendon[i]))) : 0, o + 7);
    const [a, b] = octa(p.N[i * 3], p.N[i * 3 + 1], p.N[i * 3 + 2]); sommets.writeInt8(a, o + 8); sommets.writeInt8(b, o + 9);
    sommets.writeUInt8(p.num, o + 10);
  }
  if (n > 65536) throw new Error('pièce trop grande pour des indices sur 16 bits');
  for (let i = 0; i < p.T.length; i++) indices.writeUInt16LE(p.T[i], (t + i) * 2);
  listePieces.push(v, p.T.length);
  plages.push([v, n, t, p.T.length]);
  v += n; t += p.T.length;
}
const structures = ENT.map((e, i) => {
  const b = new THREE.Box3().setFromArray(e.P), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
  return { ...e.reg, couche: e.couche, centre: c.toArray().map(x => +x.toFixed(4)), rayon: +r.toFixed(4), sommets: plages[i][0], nbSommets: plages[i][1], indices: plages[i][2], nbIndices: plages[i][3] };
});
const entete = {
  format: 'anqa-atlas', version: 1,
  source: 'Z-Anatomy (z-anatomy.com), dérivé de BodyParts3D © The Database Center for Life Science — CC BY-SA 4.0 ; modèle allégé et mis en couches pour Anqā, diffusé sous la même licence.',
  erreurMm: Number(erreurMm), couches: NB_COUCHES, regions: REG.regions,
  boite: { min: mini.map(x => +x.toFixed(5)), etendue: etendue.map(x => +x.toFixed(5)) },
  sommets: nvTotal, triangles: ntTotal, octetsParSommet: 12, pieces: listePieces,
  os: { pair: NUM_OS_PAIR, impair: NUM_OS_IMPAIR, indices: plages[ENT.length] ? plages[ENT.length][2] : t, nbIndices: t - (plages[ENT.length] ? plages[ENT.length][2] : t) },
  structures
};
let h = Buffer.from(JSON.stringify(entete), 'utf8'); if (h.length % 4) h = Buffer.concat([h, Buffer.alloc(4 - h.length % 4, 32)]);
const tete = Buffer.alloc(12); tete.write('ANQA', 0, 'latin1'); tete.writeUInt32LE(1, 4); tete.writeUInt32LE(h.length, 8);
fs.writeFileSync(sortie, Buffer.concat([tete, h, sommets, indices]));
chrono(`écrit ${sortie} : ${structures.length} structures, ${nvTotal} sommets, ${ntTotal} triangles (un côté), ${(fs.statSync(sortie).size / 1e6).toFixed(2)} Mo — couches : ${[1, 2, 3, 4, 5].map(k => couche.filter(c => c === k).length).join(' / ')}`);
