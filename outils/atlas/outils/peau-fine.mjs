// La peau fine : le corps de la peau refait en un film mince posé sur les muscles, qui prend exactement leur forme et
// bouge avec eux. Part de la peau de Z-Anatomy (sortie de peau.mjs, gardée dans donnees/peau-source.bin) et du modèle
// tel que le moteur le prépare (carrure 1, poids repris) ; écrit assets/atlas/atlas-peau.bin (version 2).
//   1. étoffe la peau comme le moteur le faisait au chargement (le fichier écrit porte la carrure : le moteur ne la
//      refait plus) ;
//   2. affine le maillage du corps (chaque triangle en quatre : un sommet tous les 6 mm) — la tête, les mains et les
//      pieds ne changent pas, ni les arêtes qui les touchent ;
//   3. pose chaque sommet du corps à EPAISSEUR du muscle (ou de l'os) qu'il recouvre : le point le plus proche de la
//      surface des muscles, cherché sous la peau (pas en face : la peau du flanc ne saute pas sur le bras) ;
//   4. lui donne les attaches du muscle qu'il recouvre (poids repris par le moteur, attaches du grand dorsal
//      comprises), un peu lissées de proche en proche : la peau suit le muscle par le même calcul que lui
//      (quaternions duaux, corde, attaches) au lieu de son ancien réglage ;
//   5. près de la tête, des mains et des pieds (BANDE), revient en douceur à la peau d'origine : place, attaches et
//      opacité — la distance à ce bord est écrite dans chaque sommet, le moteur en tire le raccord.
// Usage : node outils/peau-fine.mjs [peau source] [atlas.bin] [sortie]
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const ici = path.dirname(new URL(import.meta.url).pathname), racine = path.join(ici, '..', '..', '..');
const [fPeau = path.join(ici, '..', 'donnees', 'peau-source.bin'), fAtlas = path.join(racine, 'assets', 'atlas', 'atlas.bin'), sortie = path.join(racine, 'assets', 'atlas', 'atlas-peau.bin')] = process.argv.slice(2);
const t0 = Date.now(), chrono = m => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + ' s  ' + m);
const EPAISSEUR = Number(process.env.EPAISSEUR || 0.0015);   // le film : un millimètre et demi au-dessus du muscle
const BANDE = Number(process.env.BANDE || 0.03);            // raccord avec la peau de la tête, des mains et des pieds
const CONE = Math.cos(85 * Math.PI / 180);                  // « sous la peau » : du côté où elle rentre (pas en face : la peau du flanc ne saute pas sur le bras)
const LISSAGE = Number(process.env.LISSAGE == null ? 2 : process.env.LISSAGE);   // tours de lissage des attaches
const PAS_BORD = 0.00025;                                   // la distance au bord s'écrit par quarts de millimètre

/* ---------- Le moteur, et le modèle tel qu'il le prépare ---------- */
const ctx = { window: {}, Math, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, DataView, JSON, Object, Array, Infinity, console, Map, WeakMap };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(racine, 'assets', 'atlas', 'atlas3d.js'), 'utf8'), ctx);
const A = ctx.window.AnqaAtlas, CARRURE = 1;
const brut = fs.readFileSync(fAtlas);
if (brut.readUInt32LE(0) !== 0x41514e41) throw new Error("ce fichier n'est pas un modèle Anqā");
const lgA = brut.readUInt32LE(8), enteteA = JSON.parse(brut.subarray(12, 12 + lgA).toString('utf8'));
delete enteteA.preparation;
const pasA = enteteA.octetsParSommet, debutA = 12 + lgA, NA = enteteA.sommets, octI = enteteA.triangles * 6;
const E = JSON.parse(JSON.stringify(enteteA)), NJ = E.squelette.length;
let bA = new Uint8Array(brut.subarray(debutA, debutA + NA * pasA));
const indA = new Uint16Array(brut.buffer.slice(brut.byteOffset + debutA + NA * pasA, brut.byteOffset + debutA + NA * pasA + octI));
const estOs = (v, o) => bA[o + 10] === E.os.pair || bA[o + 10] === E.os.impair;
{ const r = A.etoffer(bA, pasA, E.boite, E.squelette, CARRURE, estOs); bA = r.sommets; E.boite = r.boite; }
A.eclaircirContacts(bA, pasA, E, estOs);
A.reponderer(bA, pasA, E, indA, estOs);
const SQ = E.squelette, jumeau = SQ.map(a => a.jumeau);
const Pm = new Float32Array(NA * 3);
{ const v = new DataView(bA.buffer, bA.byteOffset, bA.byteLength); for (let i = 0; i < NA; i++) for (let k = 0; k < 3; k++) Pm[i * 3 + k] = E.boite.min[k] + v.getUint16(i * pasA + k * 2, true) / 65535 * E.boite.etendue[k]; }
const Tm = new Uint32Array(enteteA.triangles * 3);
{ let k = 0; for (let i = 0; i < E.pieces.length; i += 2) { const v0 = E.pieces[i], m = E.pieces[i + 1]; for (let j = 0; j < m; j++, k++) Tm[k] = v0 + indA[k]; } }
const NTm = Tm.length / 3;
// Le côté gauche, et du côté droit (son miroir) ce qui longe le plan de symétrie : les muscles du tronc. Pas ceux des
// membres — les cuisses étoffées se touchent et débordent l'une sur l'autre : la peau de la cuisse gauche ne doit
// jamais se poser sur la droite (elle partirait avec l'autre jambe). Un triangle de numéro f >= NTm est un miroir :
// celui du triangle miroirDe[f - NTm].
const bvh = (() => {
  const membre = SQ.map(a => /^(femur|tibia|pied|orteils|humerus|ulna|radius|main|doigt)/.test(a.nom || ''));
  const duMembre = v => { let w = 0; for (let k = 0; k < 4; k++) if (membre[bA[v * pasA + 12 + k]]) w += bA[v * pasA + 16 + k]; return w > 50; };
  const miroirDe = []; for (let t = 0; t < NTm; t++) if (!duMembre(Tm[t * 3]) && !duMembre(Tm[t * 3 + 1]) && !duMembre(Tm[t * 3 + 2])) miroirDe.push(t);
  const P2 = new Float32Array(NA * 6), T2 = new Uint32Array(Tm.length + miroirDe.length * 3);
  P2.set(Pm); for (let i = 0; i < NA; i++) { P2[(NA + i) * 3] = -Pm[i * 3]; P2[(NA + i) * 3 + 1] = Pm[i * 3 + 1]; P2[(NA + i) * 3 + 2] = Pm[i * 3 + 2]; }
  T2.set(Tm); miroirDe.forEach((t, k) => { T2[Tm.length + k * 3] = NA + Tm[t * 3]; T2[Tm.length + k * 3 + 1] = NA + Tm[t * 3 + 2]; T2[Tm.length + k * 3 + 2] = NA + Tm[t * 3 + 1]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P2, 3)); g.setIndex(new THREE.BufferAttribute(T2, 1));
  // (indirect : l'ordre des triangles est gardé, leur numéro dit de quel sommet du modèle ils viennent)
  return { b: new MeshBVH(g, { indirect: true }), P: P2, T: T2, miroirDe };
})();
chrono(`modèle préparé : ${NA} sommets, ${NTm} triangles par côté, ${SQ.length} articulations (${SQ.length - NJ} attaches)`);
const tmp = new THREE.Vector3(), pt = new THREE.Vector3();
// Le point de la surface des muscles le plus proche de s, parmi ceux qui sont « sous » lui : dans le cône d'axe
// `dedans` (unitaire ; sans lui, le plus proche tout court). Rend { q, d, f } ou rien.
function sous(s, dedans, cosMin, dMax) {
  let mieux = dMax, f = -1; const q = new THREE.Vector3();
  pt.set(s[0], s[1], s[2]);
  bvh.b.shapecast({
    boundsTraverseOrder: b => b.distanceToPoint(pt),
    intersectsBounds: (b, feuille, score) => score < mieux,
    intersectsTriangle: (tri, i) => {
      tri.closestPointToPoint(pt, tmp);
      const d = tmp.distanceTo(pt);
      if (!(d < mieux)) return false;   // (un triangle dégénéré donne une distance indéfinie)
      if (d > 1e-5 && dedans && ((tmp.x - s[0]) * dedans[0] + (tmp.y - s[1]) * dedans[1] + (tmp.z - s[2]) * dedans[2]) / d < cosMin) return false;
      mieux = d; f = i; q.copy(tmp);
      return false;
    }
  });
  return f < 0 ? null : { q: [q.x, q.y, q.z], d: mieux, f };
}
const normaleTri = f => { const a = bvh.T[f * 3], b = bvh.T[f * 3 + 1], c = bvh.T[f * 3 + 2], P = bvh.P; const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2]; const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(...n) || 1; return n.map(x => x / l); };

/* ---------- La peau d'origine, étoffée comme le moteur le faisait ---------- */
const bp = fs.readFileSync(fPeau);
if (bp.readUInt32LE(0) !== 0x50514e41) throw new Error("ce fichier n'est pas une peau Anqā");
if (bp.readUInt32LE(4) !== 1) throw new Error('la peau source doit être celle de peau.mjs (version 1)');
const lgP = bp.readUInt32LE(8), H = JSON.parse(bp.subarray(12, 12 + lgP).toString('utf8'));
if (H.articulations !== NJ) throw new Error('la peau et le modèle n\'ont pas le même squelette');
const PAS1 = H.octetsParSommet, debutP = 12 + lgP, NS = H.sommets, X = H.intermediaires || [];
let S1 = new Uint8Array(bp.subarray(debutP, debutP + NS * PAS1));
const I1 = new Uint16Array(bp.buffer.slice(bp.byteOffset + debutP + NS * PAS1, bp.byteOffset + debutP + NS * PAS1 + (H.trianglesPairs + H.trianglesImpairs) * 6));
let boite;
{ const r = A.etoffer(S1, PAS1, H.boite, SQ, CARRURE, null, j => (j < NJ ? j : j < NJ + X.length ? X[j - NJ].vers : jumeau[X[j - NJ - X.length].vers])); S1 = r.sommets; boite = r.boite; }
const vS = new DataView(S1.buffer, S1.byteOffset, S1.byteLength);
const posDe = (i, k) => boite.min[k] + vS.getUint16(i * PAS1 + k * 2, true) / 65535 * boite.etendue[k];
const desocta = (a, b) => { const x = a / 127, y = b / 127, z = 1 - Math.abs(x) - Math.abs(y), t = Math.max(-z, 0); const vx = x + (x >= 0 ? -t : t), vy = y + (y >= 0 ? -t : t), l = Math.hypot(vx, vy, z) || 1; return [vx / l, vy / l, z / l]; };
const octa = (x, y, z) => { const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; let u = x / s, v = y / s; if (z < 0) { const u2 = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1), v2 = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1); u = u2; v = v2; } return [Math.max(-127, Math.min(127, Math.round(u * 127))), Math.max(-127, Math.min(127, Math.round(v * 127)))]; };
const zone1 = i => S1[i * PAS1 + 10];

/* ---------- Le corps : ses sommets, ses triangles, son bord ---------- */
// Un sommet du corps posé exactement sur un sommet d'une autre zone (poignet, cheville, cou) est sur le bord : il ne
// bouge pas, et l'arête qui joint deux sommets du bord le long du bord ne se coupe pas.
const cle1 = i => vS.getUint16(i * PAS1, true) + ',' + vS.getUint16(i * PAS1 + 2, true) + ',' + vS.getUint16(i * PAS1 + 4, true);
const autres = new Set(); for (let i = 0; i < NS; i++) if (zone1(i) !== 0) autres.add(cle1(i));
const corps = { P: [], N: [], ombre: [], os: [], poids: [], bord: [], plan: [], T: [] };
const rang = new Int32Array(NS).fill(-1);
const ajouterSommet = (p, n, ombre, os, poids, bord, plan) => { corps.P.push(p[0], p[1], p[2]); corps.N.push(n[0], n[1], n[2]); corps.ombre.push(ombre); corps.os.push(os); corps.poids.push(poids); corps.bord.push(bord ? 1 : 0); corps.plan.push(plan ? 1 : 0); return corps.bord.length - 1; };
// L'entrejambe. La peau de Z-Anatomy y porte les organes génitaux (adoucis par peau.mjs, cachés jusqu'ici par le
// short) : un relief loin de tout muscle, que le film ne peut pas épouser — rétracté tel quel, il se retournait comme
// un gant ou se plissait en accordéon contre le pubis. Il est retiré : entre les cuisses, les sommets à plus de 3 cm
// de tout muscle, et de proche en proche leurs voisins à plus de 1,5 cm ; tout triangle qui en touche un disparaît.
// L'ouverture est refermée plus bas par une pièce lisse, dont le bord tient à la peau restée près des muscles.
const organe = new Uint8Array(NS);
{
  const ecart = new Float32Array(NS).fill(-1), dansLaZone = i => zone1(i) === 0 && Math.abs(posDe(i, 0)) < 0.075 && posDe(i, 1) > 0.68 && posDe(i, 1) < 0.87 && posDe(i, 2) > -0.045;
  const ecartDe = i => { if (ecart[i] < 0) { const h = sous([posDe(i, 0), posDe(i, 1), posDe(i, 2)], null, -1, 0.2); ecart[i] = h ? h.d : 1; } return ecart[i]; };
  const voisinsS = new Map(), lier = (a, b) => { if (!voisinsS.has(a)) voisinsS.set(a, new Set()); voisinsS.get(a).add(b); };
  for (let t = 0; t < H.trianglesPairs; t++) { const a = I1[t * 3], b = I1[t * 3 + 1], c = I1[t * 3 + 2]; if (zone1(a) !== 0) continue; lier(a, b); lier(b, a); lier(b, c); lier(c, b); lier(c, a); lier(a, c); }
  const file = [];
  for (let i = 0; i < NS; i++) if (dansLaZone(i) && ecartDe(i) > 0.03) { organe[i] = 1; file.push(i); }
  while (file.length) { const i = file.pop(); for (const j of voisinsS.get(i) || []) if (!organe[j] && dansLaZone(j) && ecartDe(j) > 0.015) { organe[j] = 1; file.push(j); } }
}
let retires = 0;
const triCorps = [], triReste = [];
for (let t = 0; t < H.trianglesPairs; t++) {
  const a = I1[t * 3], b = I1[t * 3 + 1], c = I1[t * 3 + 2];
  if (zone1(a) !== 0) { triReste.push(a, b, c); continue; }
  if (organe[a] || organe[b] || organe[c]) { retires++; continue; }
  for (const i of [a, b, c]) if (rang[i] < 0) {
    const o = i * PAS1;
    rang[i] = ajouterSommet([posDe(i, 0), posDe(i, 1), posDe(i, 2)], desocta(vS.getInt8(o + 8), vS.getInt8(o + 9)), S1[o + 6] / 255, Array.from(S1.subarray(o + 12, o + 16)), Array.from(S1.subarray(o + 16, o + 20)), autres.has(cle1(i)));
  }
  triCorps.push(rang[a], rang[b], rang[c]);
}
const nCorps0 = corps.bord.length, nTri0 = triCorps.length / 3;
// L'ouverture laissée à l'entrejambe (une chaîne d'arêtes libres qui part du plan de symétrie et y revient) est
// refermée : les sommets passés de l'autre côté du plan y sont ramenés, puis chaque chaîne reçoit un éventail de
// triangles autour d'un sommet posé en son milieu, sur le plan. Ces sommets-là forment la pièce de l'entrejambe.
const piece = [];
function refermer(quatre, jum) {
  const nb = new Map(), cleA = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  for (let t = 0; t < triCorps.length; t += 3) for (let k = 0; k < 3; k++) { const c = cleA(triCorps[t + k], triCorps[t + (k + 1) % 3]); nb.set(c, (nb.get(c) || 0) + 1); }
  // La couture du milieu : les sommets d'une arête libre qui sont sur le plan de symétrie (à un pas d'écriture près).
  // Un sommet de l'intérieur de la cuisse peut passer par x = 0 sans en être : la cuisse étoffée déborde sur l'autre.
  let passes = 0;
  for (const [c, k] of nb) {
    if (k !== 1) continue;
    for (const i of [Math.floor(c / 1048576), c % 1048576]) {
      if (Math.abs(corps.P[i * 3]) < 1e-4) corps.plan[i] = 1;
      // Sur une chaîne libre, un sommet passé de l'autre côté du plan y est ramené : il devient un bout de chaîne.
      else if (corps.P[i * 3] < 0 && !corps.bord[i]) { corps.P[i * 3] = 0; corps.plan[i] = 1; passes++; }
    }
  }
  const auPlan = i => corps.plan[i] === 1;
  // Les arêtes libres hors du plan et hors du bord des zones, dans le sens où leur triangle les parcourt.
  const suite = new Map();
  for (let t = 0; t < triCorps.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = triCorps[t + k], b = triCorps[t + (k + 1) % 3];
    if (nb.get(cleA(a, b)) !== 1 || (auPlan(a) && auPlan(b)) || (corps.bord[a] && corps.bord[b])) continue;
    suite.set(a, b);
  }
  let chaines = 0, ajoutes = 0;
  while (suite.size) {
    // Une chaîne : depuis un sommet où aucune arête libre n'arrive (sur le plan), ou n'importe lequel (une boucle).
    const arrivees = new Set(suite.values());
    let depart = [...suite.keys()].find(a => !arrivees.has(a)); if (depart === undefined) depart = suite.keys().next().value;
    const ch = [depart]; while (suite.has(ch[ch.length - 1])) { const a = ch[ch.length - 1], b = suite.get(a); suite.delete(a); ch.push(b); if (b === depart) break; }
    const ferme = ch[ch.length - 1] === depart, pts = ferme ? ch.slice(0, -1) : ch, surLePlan = !ferme;
    const p = [0, 0, 0]; for (const i of pts) for (let k = 0; k < 3; k++) p[k] += corps.P[i * 3 + k] / pts.length;
    if (surLePlan) p[0] = 0;
    // Un sommet de la pièce : entre le sommet i de la chaîne et le milieu p, avec les attaches et la normale de i.
    const vers = (i, part) => { const q = [0, 1, 2].map(k => p[k] + (corps.P[i * 3 + k] - p[k]) * part); if (auPlan(i)) q[0] = 0; const c = ajouterSommet(q, [corps.N[i * 3], corps.N[i * 3 + 1], corps.N[i * 3 + 2]], corps.ombre[i], corps.os[i].slice(), corps.poids[i].slice(), false, auPlan(i)); piece.push(c); return c; };
    // Des couronnes de plus en plus petites (une chaîne ouverte, d'un point du plan à l'autre : chacune a moitié moins
    // de sommets que la précédente et ses bouts restent sur le plan), puis un éventail au milieu : des triangles de
    // forme régulière, au lieu de longues lames autour d'un seul sommet.
    let cour = ch, part = 1;
    while (!ferme && cour.length > 6) {
      const nv = cour.length, m = Math.floor((nv - 1) / 2) + 1, rang = j => Math.round(j * (nv - 1) / (m - 1));
      part *= 0.66;
      const dedans = []; for (let j = 0; j < m; j++) dedans.push(vers(ch[Math.round(j * (ch.length - 1) / (m - 1))], part));
      for (let j = 0; j + 1 < m; j++) {
        const a = rang(j), b = rang(j + 1), mi = Math.floor((a + b + 1) / 2);
        for (let k = a; k < mi; k++) { triCorps.push(cour[k + 1], cour[k], dedans[j]); ajoutes++; }
        triCorps.push(cour[mi], dedans[j], dedans[j + 1]); ajoutes++;
        for (let k = mi; k < b; k++) { triCorps.push(cour[k + 1], cour[k], dedans[j + 1]); ajoutes++; }
      }
      cour = dedans;
    }
    const n = [0, 0, 0], mel = {}; let ombre = 0;
    for (const i of pts) { for (let k = 0; k < 3; k++) n[k] += corps.N[i * 3 + k]; ombre += corps.ombre[i] / pts.length; for (let k = 0; k < 4; k++) if (corps.poids[i][k]) mel[corps.os[i][k]] = (mel[corps.os[i][k]] || 0) + corps.poids[i][k] / 255 / pts.length; }
    if (surLePlan) n[0] = 0;
    const l = Math.hypot(...n) || 1, q = quatre(mel, surLePlan, jum);
    const c = ajouterSommet(p, n.map(x => x / l), ombre, q.os, q.poids, false, surLePlan); piece.push(c);
    // (l'arête a -> b de la peau est parcourue b -> a par le triangle qui la referme)
    for (let k = 0; k + 1 < cour.length; k++) { triCorps.push(cour[k + 1], cour[k], c); ajoutes++; }
    chaines++;
  }
  chrono(`entrejambe : ${retires} triangles retirés (les organes), ${chaines} ouverture(s) refermée(s) par ${ajoutes} triangles, ${passes} sommets ramenés sur le plan de symétrie`);
}
// Les quatre attaches les plus fortes d'un mélange { articulation: poids }, en octets de somme 255. Sur le plan de
// symétrie, une articulation et sa jumelle restent ensemble (sinon la couture du milieu s'ouvrirait).
function quatre(m, symetrique, jum) {
  let l = Object.entries(m).map(([j, w]) => [+j, w]).filter(x => x[1] > 1e-6).sort((a, b) => b[1] - a[1]);
  if (symetrique) {
    const garde = [], vu = new Set();
    for (const [j] of l) {
      if (vu.has(j)) continue;
      const g = jum(j), paire = g !== j && m[g] > 1e-6 ? [j, g] : [j];
      if (garde.length + paire.length > 4) continue;
      for (const q of paire) { vu.add(q); garde.push([q, paire.length === 2 ? (m[j] + m[g]) / 2 : m[j]]); }
    }
    l = garde;
  } else l = l.slice(0, 4);
  const s = l.reduce((t, x) => t + x[1], 0) || 1;
  const os = [0, 0, 0, 0], poids = [0, 0, 0, 0], exact = l.map(x => x[1] / s * 255);
  let reste = 255; l.forEach((x, k) => { os[k] = x[0]; poids[k] = Math.floor(exact[k]); reste -= poids[k]; });
  // (le reste va aux plus grandes parties décimales ; sur le plan de symétrie, une paire en reçoit autant de chaque côté)
  const ordre = l.map((x, k) => k).sort((a, b) => (exact[b] - poids[b]) - (exact[a] - poids[a]));
  for (let k = 0; reste > 0 && l.length; k = (k + 1) % l.length) { poids[ordre[k]]++; reste--; }
  if (!l.length) poids[0] = 255;
  return { os, poids };
}
// Articulation jumelle, intermédiaires de la peau comprises (côté gauche, puis côté droit, à la suite du squelette).
const jumPeau = j => (j < NJ ? jumeau[j] : j < NJ + X.length ? j + X.length : j - X.length);
refermer(quatre, jumPeau);
// Affinage : chaque arête se coupe en son milieu, sauf le long du bord.
const surPlan = i => corps.plan[i] === 1;
{
  const aretes = new Map(), cleA = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  for (let t = 0; t < triCorps.length; t += 3) for (let k = 0; k < 3; k++) { const c = cleA(triCorps[t + k], triCorps[t + (k + 1) % 3]); aretes.set(c, (aretes.get(c) || 0) + 1); }
  const milieux = new Map();
  const milieu = (a, b) => {
    const c = cleA(a, b);
    // Le long du bord : deux sommets du bord, une arête qui n'a qu'un triangle du corps, hors du plan de symétrie.
    if (corps.bord[a] && corps.bord[b] && aretes.get(c) === 1 && !(surPlan(a) && surPlan(b))) return -1;
    let m = milieux.get(c);
    if (m === undefined) {
      const p = [0, 1, 2].map(k => (corps.P[a * 3 + k] + corps.P[b * 3 + k]) / 2), n = [0, 1, 2].map(k => corps.N[a * 3 + k] + corps.N[b * 3 + k]), l = Math.hypot(...n) || 1;
      const mel = {}; for (const i of [a, b]) for (let k = 0; k < 4; k++) if (corps.poids[i][k]) mel[corps.os[i][k]] = (mel[corps.os[i][k]] || 0) + corps.poids[i][k] / 510;
      // (sur la couture : l'arête libre qui joint deux de ses sommets)
      const sym = surPlan(a) && surPlan(b) && aretes.get(c) === 1, q = quatre(mel, sym, jumPeau);
      m = ajouterSommet(p, n.map(x => x / l), (corps.ombre[a] + corps.ombre[b]) / 2, q.os, q.poids, false, sym);
      milieux.set(c, m);
    }
    return m;
  };
  for (let t = 0; t < triCorps.length; t += 3) {
    const a = triCorps[t], b = triCorps[t + 1], c = triCorps[t + 2], ab = milieu(a, b), bc = milieu(b, c), ca = milieu(c, a);
    const coupes = (ab >= 0) + (bc >= 0) + (ca >= 0);
    if (coupes === 3) corps.T.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    else if (coupes === 2) {
      // Tourner le triangle pour que l'arête entière soit la dernière nommée (b-c).
      const [p, q, r, pq, rp] = bc < 0 ? [a, b, c, ab, ca] : ca < 0 ? [b, c, a, bc, ab] : [c, a, b, ca, bc];
      corps.T.push(p, pq, rp, pq, q, r, pq, r, rp);
    } else if (coupes === 1) {
      const [p, q, r, pq] = ab >= 0 ? [a, b, c, ab] : bc >= 0 ? [b, c, a, bc] : [c, a, b, ca];
      corps.T.push(p, pq, r, pq, q, r);
    } else corps.T.push(a, b, c);
  }
}
const NC = corps.bord.length, NTc = corps.T.length / 3;
chrono(`corps de la peau : ${nCorps0} sommets et ${nTri0} triangles, affinés en ${NC} sommets et ${NTc} triangles (${corps.bord.reduce((t, x) => t + x, 0)} sommets sur le bord)`);
const voisins = Array.from({ length: NC }, () => new Set());
for (let t = 0; t < corps.T.length; t += 3) for (let k = 0; k < 3; k++) { const a = corps.T[t + k], b = corps.T[t + (k + 1) % 3]; voisins[a].add(b); voisins[b].add(a); }
const P0 = Float64Array.from(corps.P), N0 = Float64Array.from(corps.N);
// La couture du milieu (voir refermer) : ces sommets restent sur le plan de symétrie, leurs attaches sont symétriques.
const plan = Uint8Array.from(corps.plan);
// Distance au bord, le long de la peau (de proche en proche sur les arêtes).
const dBord = new Float64Array(NC).fill(Infinity);
{
  const tas = []; const pousser = (d, i) => { tas.push([d, i]); let k = tas.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (tas[p][0] <= tas[k][0]) break; [tas[p], tas[k]] = [tas[k], tas[p]]; k = p; } };
  const tirer = () => { const r = tas[0], d = tas.pop(); if (tas.length) { tas[0] = d; let k = 0; for (;;) { let m = k; const g = 2 * k + 1, dr = g + 1; if (g < tas.length && tas[g][0] < tas[m][0]) m = g; if (dr < tas.length && tas[dr][0] < tas[m][0]) m = dr; if (m === k) break; [tas[m], tas[k]] = [tas[k], tas[m]]; k = m; } } return r; };
  for (let i = 0; i < NC; i++) if (corps.bord[i]) { dBord[i] = 0; pousser(0, i); }
  while (tas.length) {
    const [d, i] = tirer(); if (d > dBord[i]) continue;
    for (const j of voisins[i]) { const nd = d + Math.hypot(P0[i * 3] - P0[j * 3], P0[i * 3 + 1] - P0[j * 3 + 1], P0[i * 3 + 2] - P0[j * 3 + 2]); if (nd < dBord[j]) { dBord[j] = nd; pousser(nd, j); } }
  }
}

/* ---------- Le film : chaque sommet à EPAISSEUR du muscle qu'il recouvre ---------- */
// La peau d'origine se rétracte sur les muscles comme un film qu'on chauffe : à chaque tour, chaque sommet avance de
// PAS_FILM au plus vers le muscle qu'il a sous lui, puis le maillage se détend (chaque sommet vers le milieu de ses
// voisins). Posée d'un coup sur le point le plus proche, la peau se repliait là où elle était loin de tout muscle
// (l'entrejambe, l'aisselle) ; pas à pas, elle reste une surface régulière, tendue au-dessus des fentes étroites et
// collée partout ailleurs.
const PAS_FILM = 0.0025, TOURS = Number(process.env.TOURS || 60), DETENTE = 0.3;
// La tension du film : un sommet ne descend pas à plus de TENSION sous le milieu de ses voisins — avec un sommet tous
// les 6 mm, le film ne se creuse pas plus serré qu'un rayon de 7 mm environ. Il suit les grands creux (entre deux
// muscles, sous le pectoral) et passe au-dessus des trous étroits et profonds (l'aine, le bord du sacrum), où une
// vraie peau ne rentre pas.
const TENSION = Number(process.env.TENSION || 0.0012);
// Normales lisses du maillage du corps dans son état du moment (sur le plan de symétrie : dans le plan).
function normalesDe(P) {
  const N = new Float64Array(NC * 3);
  for (let t = 0; t < corps.T.length; t += 3) {
    const a = corps.T[t], b = corps.T[t + 1], c = corps.T[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const i of [a, b, c]) { N[i * 3] += n[0]; N[i * 3 + 1] += n[1]; N[i * 3 + 2] += n[2]; }
  }
  for (let i = 0; i < NC; i++) { if (plan[i]) N[i * 3] = 0; const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; for (let k = 0; k < 3; k++) N[i * 3 + k] /= l; }
  return N;
}
const Pf = Float64Array.from(P0), Qf = new Float64Array(NC * 3), Ff = new Int32Array(NC).fill(-1), pose = new Uint8Array(NC);
// La pièce de l'entrejambe reste une membrane tendue : ses sommets (le milieu de chaque éventail, les milieux de ses
// arêtes, et trois rangs autour) ne sont pas attirés par les muscles — ils vont au milieu de leurs voisins et ne font
// que s'appuyer sur ce qu'ils touchent. Elle est tendue une première fois avant de poser le film.
const tendus = new Uint8Array(NC);
{
  for (const c of piece) { tendus[c] = 1; for (const j of voisins[c]) if (!corps.bord[j]) tendus[j] = 1; }
  // … et le périnée, derrière elle, là où la peau d'origine n'a aucun muscle à moins de 1,5 cm (le détroit du bassin est vide).
  for (let i = 0; i < NC; i++) {
    if (tendus[i] || corps.bord[i] || Math.abs(P0[i * 3]) > 0.05 || P0[i * 3 + 1] < 0.68 || P0[i * 3 + 1] > 0.80 || P0[i * 3 + 2] > 0 || P0[i * 3 + 2] < -0.10) continue;
    const h = sous([P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]], null, -1, 0.2);
    if (!h || h.d > 0.015) tendus[i] = 1;
  }
  for (let rang = 0; rang < 3; rang++) { const a = tendus.slice(); for (let i = 0; i < NC; i++) if (a[i]) for (const j of voisins[i]) if (!corps.bord[j]) tendus[j] = 1; }
  const liste = []; for (let i = 0; i < NC; i++) if (tendus[i]) liste.push(i);
  for (let tour = 0; tour < 200; tour++) {
    const suivant = new Float64Array(liste.length * 3);
    liste.forEach((i, k) => { const v = voisins[i]; let x = 0, y = 0, z = 0; for (const j of v) { x += Pf[j * 3]; y += Pf[j * 3 + 1]; z += Pf[j * 3 + 2]; } suivant[k * 3] = plan[i] ? P0[i * 3] : Math.max(0, x / v.size); suivant[k * 3 + 1] = y / v.size; suivant[k * 3 + 2] = z / v.size; });
    liste.forEach((i, k) => { for (let c = 0; c < 3; c++) Pf[i * 3 + c] += 0.6 * (suivant[k * 3 + c] - Pf[i * 3 + c]); });
  }
  chrono(`pièce de l'entrejambe tendue : ${liste.length} sommets`);
}
// Ce qu'un sommet a sous lui : le muscle le plus proche s'il est bien dessous (ou si le sommet est entré dans la chair),
// sinon le plus proche dans le cône. { q, d, f, dehors, n } ou rien (le sommet flotte : rien sous lui à portée).
function dessous(i, N, portee) {
  const s = [Pf[i * 3], Pf[i * 3 + 1], Pf[i * 3 + 2]], dedans = [-N[i * 3], -N[i * 3 + 1], -N[i * 3 + 2]];
  let h = sous(s, null, -1, portee);
  if (h) {
    const n = normaleTri(h.f), v = [s[0] - h.q[0], s[1] - h.q[1], s[2] - h.q[2]];
    // Dans la chair : derrière le triangle le plus proche.
    if (h.d > 1e-6 && (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) < -0.2 * h.d) return Object.assign(h, { dehors: false, n });
    if (h.d < 2 * EPAISSEUR || -(v[0] * dedans[0] + v[1] * dedans[1] + v[2] * dedans[2]) / h.d >= CONE) return Object.assign(h, { dehors: true, n });
  }
  h = sous(s, dedans, CONE, portee);
  return h ? Object.assign(h, { dehors: true, n: normaleTri(h.f) }) : null;
}
let ecartsDepart = null;
for (let tour = 0; tour < TOURS + 3; tour++) {
  const N = normalesDe(Pf), finition = tour >= TOURS, ecarts = [];
  let flottants = 0, dedansN = 0, enRoute = 0;
  for (let i = 0; i < NC; i++) {
    if (corps.bord[i]) continue;
    if (tendus[i]) {
      // La membrane de l'entrejambe : elle ne fait que s'écarter de ce qu'elle touche.
      const t = sous([Pf[i * 3], Pf[i * 3 + 1], Pf[i * 3 + 2]], null, -1, 0.02);
      if (t) {
        const n = normaleTri(t.f), v = [Pf[i * 3] - t.q[0], Pf[i * 3 + 1] - t.q[1], Pf[i * 3 + 2] - t.q[2]], dedans = t.d > 1e-6 && (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) < -0.2 * t.d;
        if (dedans) for (let k = 0; k < 3; k++) Pf[i * 3 + k] = t.q[k] + EPAISSEUR * n[k];
        else if (t.d < EPAISSEUR) for (let k = 0; k < 3; k++) Pf[i * 3 + k] = t.q[k] + EPAISSEUR * (t.d > 1e-6 ? v[k] / t.d : n[k]);
        if (plan[i]) Pf[i * 3] = P0[i * 3]; else if (Pf[i * 3] < 0) Pf[i * 3] = 0;
      }
      continue;
    }
    const h = dessous(i, N, 0.15);
    if (!h) { flottants++; pose[i] = 0; continue; }
    if (tour === 0) ecarts.push(h.d);
    Ff[i] = h.f; for (let k = 0; k < 3; k++) Qf[i * 3 + k] = h.q[k];
    if (!h.dehors) { dedansN++; for (let k = 0; k < 3; k++) Pf[i * 3 + k] = h.q[k] + EPAISSEUR * h.n[k]; pose[i] = 1; }
    else {
      // Vers le muscle, d'un pas au plus, et pas plus creux que la tension ne le permet ; trop près, il s'en écarte.
      let creux = 0; { const v = voisins[i]; let x = 0, y = 0, z = 0; for (const j of v) { x += Pf[j * 3]; y += Pf[j * 3 + 1]; z += Pf[j * 3 + 2]; } creux = (Pf[i * 3] - x / v.size) * N[i * 3] + (Pf[i * 3 + 1] - y / v.size) * N[i * 3 + 1] + (Pf[i * 3 + 2] - z / v.size) * N[i * 3 + 2]; }
      const pas = Math.max(-EPAISSEUR, Math.min(PAS_FILM, h.d - EPAISSEUR, Math.max(0, creux + TENSION))), l = h.d > 1e-6 ? h.d : 1;
      const dir = h.d > 1e-6 ? [(h.q[0] - Pf[i * 3]) / l, (h.q[1] - Pf[i * 3 + 1]) / l, (h.q[2] - Pf[i * 3 + 2]) / l] : [-h.n[0], -h.n[1], -h.n[2]];
      for (let k = 0; k < 3; k++) Pf[i * 3 + k] += pas * dir[k];
      pose[i] = h.d - EPAISSEUR <= PAS_FILM ? 1 : 0; if (!pose[i]) enRoute++;
    }
    if (plan[i]) Pf[i * 3] = P0[i * 3]; else if (Pf[i * 3] < 0) Pf[i * 3] = 0;   // (le film gauche reste à gauche du plan : le miroir fait l'autre côté)
  }
  if (tour === 0) ecartsDepart = ecarts;
  if (tour === TOURS + 2) { chrono(`film posé sur les muscles : ${TOURS} tours, ${enRoute} sommets encore en route, ${flottants} sans muscle dessous, ${dedansN} ressortis de la chair au dernier tour`); break; }
  // Détente : vers le milieu des voisins (le long de la surface seulement pendant la finition, pour ne plus quitter le muscle).
  const suivant = new Float64Array(Pf);
  for (let i = 0; i < NC; i++) {
    if (corps.bord[i]) continue;
    const v = voisins[i]; let x = 0, y = 0, z = 0; for (const j of v) { x += Pf[j * 3]; y += Pf[j * 3 + 1]; z += Pf[j * 3 + 2]; }
    let dx = x / v.size - Pf[i * 3], dy = y / v.size - Pf[i * 3 + 1], dz = z / v.size - Pf[i * 3 + 2];
    if (finition && !tendus[i]) { const h = dx * N[i * 3] + dy * N[i * 3 + 1] + dz * N[i * 3 + 2]; dx -= h * N[i * 3]; dy -= h * N[i * 3 + 1]; dz -= h * N[i * 3 + 2]; }
    suivant[i * 3] = plan[i] ? P0[i * 3] : Math.max(0, Pf[i * 3] + DETENTE * dx); suivant[i * 3 + 1] = Pf[i * 3 + 1] + DETENTE * dy; suivant[i * 3 + 2] = Pf[i * 3 + 2] + DETENTE * dz;
  }
  Pf.set(suivant);
}
{ const tri = ecartsDepart.slice().sort((a, b) => a - b), q = p => (tri[Math.floor(p * (tri.length - 1))] * 1000).toFixed(1); chrono(`écart de la peau d'origine au muscle : médiane ${q(0.5)} mm, 9 sur 10 sous ${q(0.9)} mm, maximum ${q(1)} mm`); }
// L'écart final, mesuré : du film au muscle le plus proche.
{
  const e = []; let loin = 0;
  for (let i = 0; i < NC; i++) { if (corps.bord[i]) continue; const h = sous([Pf[i * 3], Pf[i * 3 + 1], Pf[i * 3 + 2]], null, -1, 0.2); if (h) { e.push(h.d); if (h.d > 0.006) loin++; if (Ff[i] < 0) { Ff[i] = h.f; for (let k = 0; k < 3; k++) Qf[i * 3 + k] = h.q[k]; } } }
  const tri = e.slice().sort((a, b) => a - b), q = p => (tri[Math.floor(p * (tri.length - 1))] * 1000).toFixed(1);
  chrono(`écart du film au muscle : médiane ${q(0.5)} mm, 9 sur 10 sous ${q(0.9)} mm, 99 sur 100 sous ${q(0.99)} mm, maximum ${q(1)} mm (${loin} sommets à plus de 6 mm : le film tendu au-dessus d'un creux)`);
}
// La peau d'origine près du bord : au-dessus des muscles, ou dessous ? (contrôle)
if (process.env.DETAIL) {
  const parZone = {};
  for (let i = 0; i < NC; i++) {
    if (dBord[i] > 0.012) continue;
    const s = [P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]], h = sous(s, null, -1, 0.2); if (!h) continue;
    const n = normaleTri(h.f), sg = ((s[0] - h.q[0]) * n[0] + (s[1] - h.q[1]) * n[1] + (s[2] - h.q[2]) * n[2]) < 0 ? -1 : 1;
    const lieu = P0[i * 3 + 1] > 1.3 ? 'cou' : P0[i * 3 + 1] > 0.5 ? 'poignet' : 'cheville';
    (parZone[lieu] = parZone[lieu] || []).push(sg * h.d * 1000);
  }
  for (const z in parZone) { const l = parZone[z].sort((a, b) => a - b), q = p => l[Math.floor(p * (l.length - 1))].toFixed(1); console.log(`   peau d'origine à moins de 12 mm du bord, ${z} : ${l.length} sommets, écart au muscle de ${q(0)} à ${q(1)} mm (médiane ${q(0.5)}, 1 sur 10 sous ${q(0.1)})`); }
}
// Le bord : ses sommets ne bougent pas ; leurs attaches de muscle sont celles du muscle le plus proche.
for (let i = 0; i < NC; i++) if (Ff[i] < 0) { const h = sous([Pf[i * 3], Pf[i * 3 + 1], Pf[i * 3 + 2]], null, -1, Infinity); Ff[i] = h.f; for (let k = 0; k < 3; k++) Qf[i * 3 + k] = h.q[k]; }

/* ---------- Les attaches du muscle recouvert ---------- */
const poidsM = Array.from({ length: NC }, () => ({})), ombreM = new Float64Array(NC);
{
  const tri = new THREE.Triangle(), bary = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < NC; i++) {
    const f = Ff[i], miroir = f >= NTm, g = miroir ? bvh.miroirDe[f - NTm] : f;
    // (le triangle miroir a ses deux derniers sommets échangés)
    const s = miroir ? [Tm[g * 3], Tm[g * 3 + 2], Tm[g * 3 + 1]] : [Tm[g * 3], Tm[g * 3 + 1], Tm[g * 3 + 2]];
    const sg = miroir ? -1 : 1;
    a.set(sg * Pm[s[0] * 3], Pm[s[0] * 3 + 1], Pm[s[0] * 3 + 2]); b.set(sg * Pm[s[1] * 3], Pm[s[1] * 3 + 1], Pm[s[1] * 3 + 2]); c.set(sg * Pm[s[2] * 3], Pm[s[2] * 3 + 1], Pm[s[2] * 3 + 2]);
    tri.set(a, b, c); tri.getBarycoord(pt.set(Qf[i * 3], Qf[i * 3 + 1], Qf[i * 3 + 2]), bary);
    const w = [Math.max(0, bary.x), Math.max(0, bary.y), Math.max(0, bary.z)], sw = w[0] + w[1] + w[2] || 1;
    let ombre = 0;
    for (let k = 0; k < 3; k++) {
      const o = s[k] * pasA, part = w[k] / sw;
      ombre += part * bA[o + 6] / 255;
      for (let q = 0; q < 4; q++) { const p = bA[o + 16 + q]; if (!p) continue; const j = miroir ? jumeau[bA[o + 12 + q]] : bA[o + 12 + q]; poidsM[i][j] = (poidsM[i][j] || 0) + part * p / 255; }
    }
    ombreM[i] = 0.5 + 0.5 * ombre;   // (le film passe au-dessus des sillons : il en garde l'ombre, adoucie)
  }
}
// L'avant-bras : comme pour ses muscles (voir reponderer dans atlas3d.js), la part de l'ulna et du radius se partage
// d'après la place le long de l'avant-bras — tout suit l'ulna au coude, le radius au poignet. Le film posé sur un os
// (le bord de l'ulna, le bas du radius) tournait sinon avec lui seul, pas avec les muscles voisins.
{
  const num = nom => SQ.findIndex(a => a.nom === nom), jUl = num('ulna.G'), jRa = num('radius.G'), jMa = num('main.G');
  const cU = SQ[jUl].centre, cR = SQ[jRa].centre, cM = SQ[jMa].centre, coude = [0, 1, 2].map(k => (cU[k] + cR[k]) / 2), axe = [0, 1, 2].map(k => cM[k] - coude[k]), L2 = axe[0] * axe[0] + axe[1] * axe[1] + axe[2] * axe[2];
  for (let i = 0; i < NC; i++) {
    const m = poidsM[i], w = (m[jUl] || 0) + (m[jRa] || 0); if (!(w > 0)) continue;
    const t = Math.max(0, Math.min(1, (((Pf[i * 3] - coude[0]) * axe[0] + (Pf[i * 3 + 1] - coude[1]) * axe[1] + (Pf[i * 3 + 2] - coude[2]) * axe[2]) / L2 - 0.08) / 0.84));
    m[jUl] = w * (1 - t); m[jRa] = w * t;
  }
}
const lisser = (champs, tours, melanger) => { for (let t = 0; t < tours; t++) { const avant = champs.slice(); for (let i = 0; i < NC; i++) champs[i] = melanger(avant[i], [...voisins[i]].map(j => avant[j]), i); } };
lisser(poidsM, LISSAGE, (moi, autour, i) => {
  const r = {}; for (const j in moi) r[j] = 0.5 * moi[j];
  for (const v of autour) for (const j in v) r[j] = (r[j] || 0) + 0.5 * v[j] / autour.length;
  // Sur le plan de symétrie, les voisins du côté droit sont les miroirs de ceux du côté gauche.
  if (plan[i]) { const s = {}; for (const j in r) { s[j] = (s[j] || 0) + r[j] / 2; const g = jumeau[j]; s[g] = (s[g] || 0) + r[j] / 2; } return s; }
  return r;
});
{ const o = Array.from(ombreM); lisser(o, 2, (moi, autour) => 0.5 * moi + 0.5 * autour.reduce((t, x) => t + x, 0) / autour.length); for (let i = 0; i < NC; i++) ombreM[i] = o[i]; }

/* ---------- Le raccord avec la peau d'origine, les normales ---------- */
const lisse = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const Pc = new Float64Array(NC * 3);
for (let i = 0; i < NC; i++) { const r = lisse(dBord[i] / BANDE); for (let k = 0; k < 3; k++) Pc[i * 3 + k] = P0[i * 3 + k] + (Pf[i * 3 + k] - P0[i * 3 + k]) * r; }
const Nc = new Float64Array(NC * 3);
for (let t = 0; t < corps.T.length; t += 3) {
  const a = corps.T[t], b = corps.T[t + 1], c = corps.T[t + 2];
  const ux = Pc[b * 3] - Pc[a * 3], uy = Pc[b * 3 + 1] - Pc[a * 3 + 1], uz = Pc[b * 3 + 2] - Pc[a * 3 + 2], vx = Pc[c * 3] - Pc[a * 3], vy = Pc[c * 3 + 1] - Pc[a * 3 + 1], vz = Pc[c * 3 + 2] - Pc[a * 3 + 2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  for (const i of [a, b, c]) { Nc[i * 3] += n[0]; Nc[i * 3 + 1] += n[1]; Nc[i * 3 + 2] += n[2]; }
}
let retournes = 0;
for (let i = 0; i < NC; i++) {
  if (plan[i]) Nc[i * 3] = 0;
  let l = Math.hypot(Nc[i * 3], Nc[i * 3 + 1], Nc[i * 3 + 2]) || 1; for (let k = 0; k < 3; k++) Nc[i * 3 + k] /= l;
  if (Nc[i * 3] * N0[i * 3] + Nc[i * 3 + 1] * N0[i * 3 + 1] + Nc[i * 3 + 2] * N0[i * 3 + 2] < 0) retournes++;
  // Au bord, la normale de la peau d'origine (celle du sommet d'en face) ; elle cède la place sur la bande.
  const r = lisse(dBord[i] / BANDE);
  for (let k = 0; k < 3; k++) Nc[i * 3 + k] = N0[i * 3 + k] + (Nc[i * 3 + k] - N0[i * 3 + k]) * r;
  l = Math.hypot(Nc[i * 3], Nc[i * 3 + 1], Nc[i * 3 + 2]) || 1; for (let k = 0; k < 3; k++) Nc[i * 3 + k] /= l;
}
// Triangles retournés ou très étirés par la pose (contrôle).
{
  let pires = 0, tordus = 0; const lieux = [];
  for (let t = 0; t < corps.T.length; t += 3) {
    const n = (P) => { const a = corps.T[t], b = corps.T[t + 1], c = corps.T[t + 2]; const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
    const n0 = n(P0), n1 = n(Pc), a0 = Math.hypot(...n0), a1 = Math.hypot(...n1);
    if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0) { tordus++; if (process.env.DETAIL) lieux.push(corps.T[t]); }
    if (a1 > 6 * a0) pires++;
  }
  if (process.env.DETAIL) {
    // Où sont les triangles retournés : par tranche de hauteur, avec le milieu de leurs places d'origine.
    const tr = {}; for (const i of lieux) { const k = (Math.floor(P0[i * 3 + 1] * 20) / 20).toFixed(2); (tr[k] = tr[k] || []).push(i); }
    for (const k of Object.keys(tr).sort((a, b) => b - a)) { const l = tr[k], m = c => (l.reduce((t, i) => t + P0[i * 3 + c], 0) / l.length).toFixed(3), e = (l.reduce((t, i) => t + Math.hypot(Pf[i * 3] - P0[i * 3], Pf[i * 3 + 1] - P0[i * 3 + 1], Pf[i * 3 + 2] - P0[i * 3 + 2]), 0) / l.length * 1000).toFixed(0); console.log(`   y ${k} : ${String(l.length).padStart(4)} retournés, autour de x ${m(0)} z ${m(2)}, déplacés de ${e} mm en moyenne`); }
  }
  chrono(`contrôle du film : ${retournes} normales retournées, ${tordus} triangles retournés, ${pires} triangles étirés plus de 6 fois`);
}

/* ---------- Écriture (version 2) ---------- */
// Le reste (tête, mains, pieds, ongles, poils, cheveux, yeux) : les sommets d'origine, 20 octets, renumérotés.
const numReste = new Int32Array(NS).fill(-1); let nReste = 0;
for (let i = 0; i < NS; i++) if (zone1(i) !== 0) numReste[i] = nReste++;
const BR = Buffer.alloc(nReste * 20);
for (let i = 0; i < NS; i++) if (numReste[i] >= 0) { const o = numReste[i] * 20; S1.subarray(i * PAS1, i * PAS1 + 20).forEach((x, k) => { BR[o + k] = x; }); BR[o + 7] = 0; BR[o + 11] = 0; }
const indReste = [];
for (let k = 0; k < triReste.length; k++) indReste.push(numReste[triReste[k]]);
const nPairsReste = indReste.length / 3;
for (let k = H.trianglesPairs * 3; k < (H.trianglesPairs + H.trianglesImpairs) * 3; k++) { if (numReste[I1[k]] < 0) throw new Error('un triangle du milieu touche le corps'); indReste.push(numReste[I1[k]]); }
if (nReste > 65535 || NC > 65535) throw new Error('trop de sommets pour des indices sur 16 bits');
const IR = Buffer.alloc(indReste.length * 2); indReste.forEach((v, k) => IR.writeUInt16LE(v, k * 2));
// Le corps : 28 octets — place, ombrage, distance au bord, normale, zone, (libre : la part « par la corde », écrite
// par le moteur), attaches de la peau d'origine (matrices), attaches du muscle recouvert (quaternions duaux).
const PAS2 = 28, BC = Buffer.alloc(NC * PAS2);
let horsBoite = 0;
for (let i = 0; i < NC; i++) {
  const o = i * PAS2, r = lisse(dBord[i] / BANDE);
  for (let k = 0; k < 3; k++) { const q = (Pc[i * 3 + k] - boite.min[k]) / boite.etendue[k] * 65535; if (q < -0.5 || q > 65535.5) horsBoite++; BC.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(q))), o + k * 2); }
  // Au bord, la place exacte du sommet d'en face (au pas près de l'écriture).
  BC.writeUInt8(Math.round(255 * Math.max(0, Math.min(1, corps.ombre[i] + (ombreM[i] - corps.ombre[i]) * r))), o + 6);
  BC.writeUInt8(Math.min(255, Math.round(dBord[i] / PAS_BORD)), o + 7);
  const [u, v] = octa(Nc[i * 3], Nc[i * 3 + 1], Nc[i * 3 + 2]); BC.writeInt8(u, o + 8); BC.writeInt8(v, o + 9);
  BC.writeUInt8(0, o + 10); BC.writeUInt8(0, o + 11);
  for (let k = 0; k < 4; k++) { BC.writeUInt8(corps.os[i][k], o + 12 + k); BC.writeUInt8(corps.poids[i][k], o + 16 + k); }
  const q = quatre(poidsM[i], !!plan[i], j => jumeau[j]);
  for (let k = 0; k < 4; k++) { BC.writeUInt8(q.os[k], o + 20 + k); BC.writeUInt8(q.poids[k], o + 24 + k); }
}
if (horsBoite) throw new Error(`${horsBoite} coordonnées du film sortent de la boîte de la peau`);
const IC = Buffer.alloc(corps.T.length * 2); corps.T.forEach((v, k) => IC.writeUInt16LE(v, k * 2));
const aligner = b => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - b.length % 4)]) : b);
const blocs = [BR, aligner(IR), BC, aligner(IC)], adresses = []; { let a = 0; for (const b of blocs) { adresses.push(a); a += b.length; } }
const empreinte = crypto.createHash('sha256').update(bA).update(JSON.stringify(SQ)).digest('hex').slice(0, 16);
const entete = {
  format: 'anqa-peau', version: 2,
  source: H.source,
  boite: { min: Array.from(boite.min), etendue: Array.from(boite.etendue) },
  zones: H.zones, oeil: H.oeil,
  // La carrure est dans les sommets ; le film a été posé sur ce modèle-là, préparé ainsi (voir modele.empreinte).
  carrure: CARRURE, modele: { preparation: A.PREPARATION_VERSION, empreinte },
  articulations: NJ, intermediaires: X,
  // Adresses comptées depuis la fin de l'en-tête.
  reste: { sommets: nReste, octetsParSommet: 20, debut: adresses[0], trianglesPairs: nPairsReste, trianglesImpairs: H.trianglesImpairs, indices: adresses[1] },
  corps: { sommets: NC, octetsParSommet: PAS2, debut: adresses[2], triangles: NTc, indices: adresses[3], epaisseur: EPAISSEUR, bande: BANDE, pasBord: PAS_BORD }
};
let h = Buffer.from(JSON.stringify(entete), 'utf8'); if (h.length % 4) h = Buffer.concat([h, Buffer.alloc(4 - h.length % 4, 32)]);
const tete = Buffer.alloc(12); tete.write('ANQP', 0, 'latin1'); tete.writeUInt32LE(2, 4); tete.writeUInt32LE(h.length, 8);
fs.writeFileSync(sortie, Buffer.concat([tete, h, ...blocs]));
chrono(`écrit ${path.relative(racine, sortie)} : ${nReste} sommets hors du corps (${nPairsReste} triangles pairs, ${H.trianglesImpairs} du milieu), ${NC} sommets et ${NTc} triangles pour le corps, ${(fs.statSync(sortie).size / 1e6).toFixed(2)} Mo`);
