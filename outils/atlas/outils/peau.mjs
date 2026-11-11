// Fabrique la peau de l'atlas à partir de la surface du corps de Z-Anatomy (collection « 9: Regions of human body », extraite
// par extraire_peau.py) : régions du côté gauche (le droit est son miroir), oreilles, ongles, sourcils, cils, cheveux.
//   1. assemble les régions en une seule surface (sommets soudés aux frontières), rangée en zones : corps, tête, main, pied ;
//   2. adoucit la région uro-génitale (le corps porte un short) ;
//   3. garde la peau au-dessus des muscles et des os de l'atlas (elle est repoussée là où ils affleurent) ;
//   4. l'attache au squelette de mouvement : chaque sommet reprend les attaches des muscles et des os qu'il recouvre ;
//   5. calcule l'ombrage de relief, segment par segment (dessous du menton, oreilles, entre les doigts ; pas l'ombre
//      d'un bras sur le flanc, qui ne vaut que bras baissés) ;
//   6. écrit atlas-peau.bin (même rangement des sommets que atlas.bin : 20 octets).
// Usage : node outils/peau.mjs <regions.bin> <atlas.bin> <sortie.bin>
import fs from 'fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { lireBin, normales } from './commun.mjs';

const [fRegions = 'peau/regions.bin', fAtlas = 'donnees/atlas.bin', sortie = 'peau/atlas-peau.bin'] = process.argv.slice(2);
const t0 = Date.now(), chrono = m => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + ' s  ' + m);
const ZONES = ['corps', 'tete', 'main', 'pied', 'ongle', 'poil', 'cheveux', 'oeil'];
const Z = Object.fromEntries(ZONES.map((z, i) => [z, i]));
const TETE = new Set(['Frontal region', 'Parietal region', 'Occipital region', 'Temporal region', 'Orbital region', 'Nasal region', 'Oral region', 'Mental region', 'Buccal region', 'Zygomatic region',
  'Infra-orbital region', 'Parotideomasseteric region', 'Mastoid region', 'Angle of mouth', 'Labial commissure', 'Philtrum', 'Tubercle of upper lip', 'Mentolabial sulcus', 'Nasolabial sulcus', 'Eyebrow',
  'Submental triangle', 'Submandibular triangle',
  'Anterior notch of auricle', 'Antihelix', 'Antitragus', 'Apex of auricle', 'Auricular region', 'Auricular tubercle', 'Cavity of concha', 'Concha of auricle', 'Crura of antihelix', 'Cymba conchae', 'Eminentia conchae',
  'Eminentia fossae triangularis', 'Eminentia scaphae', 'Fossa antihelica', 'Helix', 'Intertragic incisure', 'Lobule of auricle', 'Posterior auricular groove', 'Scapha', 'Tragus', 'Triangular fossa']);
const MAIN = new Set(['Palm', 'Dorsum of hand', 'Dorsal surfaces of digits of hand', 'Palmar surfaces of digits of hand', 'Anterior region of wrist', 'Posterior region of wrist', 'Radial foveola', 'Perionyx']);
const PIED = new Set(['Sole', 'Heel region', 'Dorsum of foot', 'Metatarsal region', 'Dorsal surfaces of digits of foot', 'Plantar surfaces of digits of foot', 'Distal transverse arch of foot', 'Proximal transverse arch of foot',
  'Lateral border of foot', 'Medial border of foot', 'Lateral part of longitudinal arch of foot', 'Medial part of longitudinal arch of foot', 'Hallucial eminence', 'Lateral malleolus', 'Medial malleolus',
  'Lateral retromalleolar region', 'Medial retromalleolar region', 'Anterior region of ankle', 'Perionyx (foot)']);
// Régions du bras : jamais sous le short, même à la hauteur des hanches.
const BRAS = /(arm|elbow|forearm|Cubital fossa|bicipital groove|Deltoid|Deltopectoral)/;
function zoneDe(nom) {
  if (nom === 'Hairs of head') return Z.cheveux;
  if (!/\.l$/.test(nom)) return -1;
  const n = nom.replace(/\.l$/, '');
  if (n === 'Hairs of eyebrow' || n === 'Eyelashes') return Z.poil;
  if (n === 'Nail plate' || n === 'Nail plate (foot)') return Z.ongle;
  if (TETE.has(n)) return Z.tete;
  if (MAIN.has(n)) return Z.main;
  if (PIED.has(n)) return Z.pied;
  return Z.corps;
}

/* ---------- 1 : assemblage ---------- */
const ENT = lireBin(fRegions);
const PAS = 5e-5, cle = (x, y, z) => Math.round(x / PAS) + ',' + Math.round(y / PAS) + ',' + Math.round(z / PAS);
// La peau proprement dite : une seule surface, sommets soudés entre régions voisines.
const peauP = [], peauT = [], peauZone = [], peauRegion = [], index = new Map(), regions = [];
// Les pièces à part (ongles, sourcils, cils, cheveux) : chacune garde son maillage.
const pieces = [];
for (const e of ENT) {
  const z = zoneDe(e.nom);
  if (z < 0) continue;
  if (z === Z.ongle || z === Z.poil || z === Z.cheveux) { pieces.push({ nom: e.nom, zone: z, P: Float32Array.from(e.P), T: Uint32Array.from(e.T), pair: z !== Z.cheveux }); continue; }
  const r = regions.length; regions.push(e.nom.replace(/\.l$/, ''));
  const local = new Uint32Array(e.nv);
  for (let i = 0; i < e.nv; i++) {
    let x = e.P[i * 3]; const y = e.P[i * 3 + 1], zz = e.P[i * 3 + 2];
    if (Math.abs(x) < 2e-4) x = 0;                       // la couture du milieu, exactement sur le plan de symétrie
    const k = cle(x, y, zz); let j = index.get(k);
    if (j === undefined) { j = peauP.length / 3; index.set(k, j); peauP.push(x, y, zz); }
    local[i] = j;
  }
  for (let t = 0; t < e.nt; t++) {
    const a = local[e.T[t * 3]], b = local[e.T[t * 3 + 1]], c = local[e.T[t * 3 + 2]];
    if (a === b || b === c || a === c) continue;
    if (e.mats[e.M[t]] === 'Skin-in') continue;          // l'envers de la peau (bords repliés vers l'intérieur) : inutile
    peauT.push(a, b, c); peauZone.push(z); peauRegion.push(r);
  }
}
// Quelques frontières de régions ne tombent pas exactement sommet sur sommet : on soude les bords libres qui se font
// face à moins d'un millimètre (sinon une fente laisse voir le muscle).
{
  const Tp = peauT, libres = () => {
    const ar = new Map();
    for (let i = 0; i < Tp.length; i += 3) for (let j = 0; j < 3; j++) { const a = Tp[i + j], b = Tp[i + (j + 1) % 3], k = a < b ? a + '_' + b : b + '_' + a; ar.set(k, (ar.get(k) || 0) + 1); }
    const b = new Set(); for (const [k, n] of ar) if (n === 1) { const [x, y] = k.split('_').map(Number); if (peauP[x * 3] === 0 && peauP[y * 3] === 0) continue; b.add(x); b.add(y); }
    return [...b];
  };
  const regDe = new Map(); for (let t = 0; t < Tp.length / 3; t++) for (let j = 0; j < 3; j++) { const v = Tp[t * 3 + j]; (regDe.get(v) || regDe.set(v, new Set()).get(v)).add(peauRegion[t]); }
  const L = libres(), vers = new Map(); let soudes = 0;
  for (const a of L) {
    if (vers.has(a)) continue;
    let dm = 0.001, bm = -1;
    for (const b of L) { if (a === b || vers.has(b)) continue; const ra = regDe.get(a), rb = regDe.get(b); if ([...rb].some(r => ra.has(r))) continue; const d = Math.hypot(peauP[a * 3] - peauP[b * 3], peauP[a * 3 + 1] - peauP[b * 3 + 1], peauP[a * 3 + 2] - peauP[b * 3 + 2]); if (d < dm) { dm = d; bm = b; } }
    if (bm >= 0) { vers.set(a, bm); soudes++; }
  }
  if (soudes) {
    for (let i = 0; i < Tp.length; i++) if (vers.has(Tp[i])) Tp[i] = vers.get(Tp[i]);
    // Les triangles devenus plats disparaissent.
    let k = 0; for (let t = 0; t < Tp.length / 3; t++) { const a = Tp[t * 3], b = Tp[t * 3 + 1], c = Tp[t * 3 + 2]; if (a === b || b === c || a === c) continue; Tp[k * 3] = a; Tp[k * 3 + 1] = b; Tp[k * 3 + 2] = c; peauZone[k] = peauZone[t]; peauRegion[k] = peauRegion[t]; k++; }
    Tp.length = k * 3; peauZone.length = k; peauRegion.length = k;
  }
  console.log(`        fentes soudées : ${soudes} sommets`);
}
// Frontières en T : un bord a un sommet là où le bord d'en face n'en a pas. Le triangle d'en face est coupé en deux à cet
// endroit, et la fente se referme.
{
  const Tp = peauT; let coupes = 0;
  for (let tour = 0; tour < 6; tour++) {
    const ar = new Map();
    for (let i = 0; i < Tp.length; i += 3) for (let j = 0; j < 3; j++) { const a = Tp[i + j], b = Tp[i + (j + 1) % 3], k = a < b ? a + '_' + b : b + '_' + a; (ar.get(k) || ar.set(k, []).get(k)).push(i / 3); }
    const bords = [], sb = new Set();
    for (const [k, ts] of ar) if (ts.length === 1) { const [a, b] = k.split('_').map(Number); if (peauP[a * 3] === 0 && peauP[b * 3] === 0) continue; bords.push([a, b, ts[0]]); sb.add(a); sb.add(b); }
    const sommetsBord = [...sb]; let fait = 0; const touches = new Set();
    for (const [a, b, t] of bords) {
      if (touches.has(t)) continue;
      const ax = peauP[a * 3], ay = peauP[a * 3 + 1], az = peauP[a * 3 + 2], dx = peauP[b * 3] - ax, dy = peauP[b * 3 + 1] - ay, dz = peauP[b * 3 + 2] - az, l2 = dx * dx + dy * dy + dz * dz;
      let mv = -1, md = 0.0006;
      for (const v of sommetsBord) {
        if (v === a || v === b) continue;
        const px = peauP[v * 3] - ax, py = peauP[v * 3 + 1] - ay, pz = peauP[v * 3 + 2] - az, u = (px * dx + py * dy + pz * dz) / l2;
        if (u < 0.04 || u > 0.96) continue;
        const d = Math.hypot(px - u * dx, py - u * dy, pz - u * dz);
        if (d < md) { md = d; mv = v; }
      }
      if (mv < 0) continue;
      // Le triangle (a, b, c) devient (a, v, c) et (v, b, c), dans le même sens.
      const i = t * 3, tri = [Tp[i], Tp[i + 1], Tp[i + 2]], ia = tri.indexOf(a), ib = tri.indexOf(b), c = tri[3 - ia - ib];
      const sens = (ia + 1) % 3 === ib;      // a puis b dans l'ordre du triangle
      const t1 = sens ? [a, mv, c] : [mv, a, c], t2 = sens ? [mv, b, c] : [b, mv, c];
      Tp[i] = t1[0]; Tp[i + 1] = t1[1]; Tp[i + 2] = t1[2];
      Tp.push(t2[0], t2[1], t2[2]); peauZone.push(peauZone[t]); peauRegion.push(peauRegion[t]);
      touches.add(t); fait++;
    }
    coupes += fait; if (!fait) break;
  }
  // Les petits trous qui restent (aisselle, pli de l'aine…) sont bouchés en éventail ; les ouvertures naturelles (œil,
  // narine, oreille) et les bords des cuticules restent ouverts.
  const ar = new Map();
  for (let i = 0; i < Tp.length; i += 3) for (let j = 0; j < 3; j++) { const a = Tp[i + j], b = Tp[i + (j + 1) % 3]; ar.set(a + '_' + b, i / 3); }
  const suivant = new Map();   // bord libre orienté : a -> b (le triangle voisin manque de l'autre côté de l'arête b -> a)
  for (const k of ar.keys()) { const [a, b] = k.split('_').map(Number); if (!ar.has(b + '_' + a) && !(peauP[a * 3] === 0 && peauP[b * 3] === 0)) suivant.set(b, a); }
  const vus = new Set(); let bouches = 0; const laisses = [];
  for (const d of suivant.keys()) {
    if (vus.has(d)) continue;
    const boucle = []; let v = d, ok = true;
    while (!vus.has(v)) { vus.add(v); boucle.push(v); v = suivant.get(v); if (v === undefined) { ok = false; break; } }
    if (!ok || v !== d || boucle.length < 3) continue;
    const regs = new Set(); for (const [k, t] of ar) { const a = +k.split('_')[0]; if (boucle.includes(a)) regs.add(regions[peauRegion[t]]); }
    const naturel = [...regs].some(r => /Orbital|Nasal|auric|Auric|Helix|Eminentia|Concha|Tragus|Scapha|Perionyx|Antihelix|fossa antihelica|Triangular fossa/i.test(r));
    let per = 0; for (let k = 0; k < boucle.length; k++) { const a = boucle[k], b = boucle[(k + 1) % boucle.length]; per += Math.hypot(peauP[a * 3] - peauP[b * 3], peauP[a * 3 + 1] - peauP[b * 3 + 1], peauP[a * 3 + 2] - peauP[b * 3 + 2]); }
    if (naturel || boucle.length > 24 || per > 0.22) { laisses.push(`${(per * 1000).toFixed(0)} mm (${[...regs].slice(0, 2).join(', ')})`); continue; }
    const c = [0, 0, 0]; for (const a of boucle) for (let k = 0; k < 3; k++) c[k] += peauP[a * 3 + k] / boucle.length;
    const ic = peauP.length / 3; peauP.push(c[0], c[1], c[2]);
    const t0 = ar.get(boucle[1] + '_' + boucle[0]) ?? ar.get(boucle[0] + '_' + boucle[1]) ?? 0;
    for (let k = 0; k < boucle.length; k++) { Tp.push(boucle[k], boucle[(k + 1) % boucle.length], ic); peauZone.push(peauZone[t0]); peauRegion.push(peauRegion[t0]); }
    bouches++;
  }
  console.log(`        frontières en T réparées : ${coupes} triangles coupés ; trous bouchés : ${bouches} ; laissés ouverts : ${laisses.join(' · ')}`);
}
let P = Float32Array.from(peauP); const T = Uint32Array.from(peauT), nv = P.length / 3, nt = T.length / 3;
chrono(`peau assemblée : ${regions.length} régions, ${nv} sommets, ${nt} triangles (un côté) ; pièces à part : ${pieces.map(p => p.nom + ' ' + p.T.length / 3).join(', ')}`);
// Voisinage et bords libres (un bord libre hors du plan de symétrie est un trou : yeux, narines, bouche, ou un défaut de soudure).
const voisins = (() => { const V = Array.from({ length: nv }, () => new Set()); for (let i = 0; i < T.length; i += 3) { const a = T[i], b = T[i + 1], c = T[i + 2]; V[a].add(b).add(c); V[b].add(a).add(c); V[c].add(a).add(b); } return V.map(s => Uint32Array.from(s)); })();
{
  const aretes = new Map();
  for (let i = 0; i < T.length; i += 3) for (let j = 0; j < 3; j++) { const a = T[i + j], b = T[i + (j + 1) % 3], k = a < b ? a + '_' + b : b + '_' + a; aretes.set(k, (aretes.get(k) || 0) + 1); }
  let libres = 0, couture = 0; const ouverts = new Map();
  for (const [k, n] of aretes) if (n === 1) { const [a, b] = k.split('_').map(Number); if (P[a * 3] === 0 && P[b * 3] === 0) couture++; else { libres++; const y = P[a * 3 + 1]; const zone = y > 1.5 ? 'tête' : y > 1.0 ? 'tronc haut' : y > 0.6 ? 'bassin, mains' : 'jambes, pieds'; ouverts.set(zone, (ouverts.get(zone) || 0) + 1); } }
  chrono(`arêtes : ${aretes.size}, sur la couture du milieu ${couture}, bords libres ailleurs ${libres} ${JSON.stringify([...ouverts])}`);
}

/* ---------- 2 : la région uro-génitale, adoucie ---------- */
{
  const rU = regions.indexOf('Urogenital region'), dans = new Uint8Array(nv), autre = new Uint8Array(nv);
  for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) (peauRegion[t] === rU ? dans : autre)[T[t * 3 + j]] = 1;
  const libres = []; for (let i = 0; i < nv; i++) if (dans[i] && !autre[i]) libres.push(i);
  for (let tour = 0; tour < Number(process.env.ADOUCIR || 60); tour++) for (const i of libres) {
    const v = voisins[i]; let x = 0, y = 0, z = 0;
    for (let q = 0; q < v.length; q++) { x += P[v[q] * 3]; y += P[v[q] * 3 + 1]; z += P[v[q] * 3 + 2]; }
    const surPlan = P[i * 3] === 0;
    P[i * 3] = surPlan ? 0 : Math.max(0, x / v.length); P[i * 3 + 1] = y / v.length; P[i * 3 + 2] = z / v.length;
  }
  chrono(`région uro-génitale adoucie (${libres.length} sommets)`);
}

/* ---------- 3 : la peau reste au-dessus des muscles et des os ---------- */
const A = (() => {
  const d = fs.readFileSync(fAtlas), lg = d.readUInt32LE(8), E = JSON.parse(d.subarray(12, 12 + lg).toString('utf8'));
  const debut = 12 + lg, pas = E.octetsParSommet, n = E.sommets, Pa = new Float32Array(n * 3), os = new Uint8Array(n * 4), poids = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = debut + i * pas;
    for (let k = 0; k < 3; k++) Pa[i * 3 + k] = E.boite.min[k] + d.readUInt16LE(o + k * 2) / 65535 * E.boite.etendue[k];
    for (let k = 0; k < 4; k++) { os[i * 4 + k] = d[o + 12 + k]; poids[i * 4 + k] = d[o + 16 + k]; }
  }
  const src = new Uint16Array(d.buffer.slice(d.byteOffset + debut + n * pas, d.byteOffset + debut + n * pas + E.triangles * 6)), Ta = new Uint32Array(E.triangles * 3);
  let k = 0; for (let i = 0; i < E.pieces.length; i += 2) { const v0 = E.pieces[i], m = E.pieces[i + 1]; for (let j = 0; j < m; j++, k++) Ta[k] = v0 + src[k]; }
  return { E, P: Pa, T: Ta, os, poids, n };
})();
const jumeau = A.E.squelette.map(a => a.jumeau), J = name => A.E.squelette.findIndex(a => a.nom === name);
// Les deux côtés de l'atlas (le droit est le miroir du gauche), pour ce qui longe le plan de symétrie.
const bvhAtlas = (() => {
  const n = A.n, Pm = new Float32Array(n * 6), Tm = new Uint32Array(A.T.length * 2);
  Pm.set(A.P); for (let i = 0; i < n; i++) { Pm[(n + i) * 3] = -A.P[i * 3]; Pm[(n + i) * 3 + 1] = A.P[i * 3 + 1]; Pm[(n + i) * 3 + 2] = A.P[i * 3 + 2]; }
  Tm.set(A.T); for (let i = 0; i < A.T.length; i += 3) { Tm[A.T.length + i] = n + A.T[i]; Tm[A.T.length + i + 1] = n + A.T[i + 2]; Tm[A.T.length + i + 2] = n + A.T[i + 1]; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Pm, 3)); g.setIndex(new THREE.BufferAttribute(Tm, 1));
  return new MeshBVH(g);
})();
chrono(`atlas lu : ${A.n} sommets, ${A.T.length / 3} triangles par côté`);
const lisseN = P => { const N = normales(P, T); for (let i = 0; i < nv; i++) if (P[i * 3] === 0) { N[i * 3] = 0; const l = Math.hypot(N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; } return N; };
let N = lisseN(P);
const MARGE = Number(process.env.MARGE || 0.0012);
{
  // Un sommet de l'atlas est-il dehors ? On compte les traversées de la peau le long de trois rayons (majorité) :
  // un nombre pair, c'est dehors. Les rares ouvertures de la peau (yeux, narines) ne faussent pas trois rayons à la fois.
  const dirs = [new THREE.Vector3(0.36, 0.48, 0.80).normalize(), new THREE.Vector3(-0.62, 0.71, -0.33).normalize(), new THREE.Vector3(0.21, -0.86, 0.47).normalize()];
  const pt = new THREE.Vector3(), cible = {}, rayon = new THREE.Ray(), D = new THREE.Vector3();
  for (let tour = 0; tour < 5; tour++) {
    const Pm = new Float32Array(nv * 6), Tm = new Uint32Array(T.length * 2);
    Pm.set(P); for (let i = 0; i < nv; i++) { Pm[(nv + i) * 3] = -P[i * 3]; Pm[(nv + i) * 3 + 1] = P[i * 3 + 1]; Pm[(nv + i) * 3 + 2] = P[i * 3 + 2]; }
    Tm.set(T); for (let i = 0; i < T.length; i += 3) { Tm[T.length + i] = nv + T[i]; Tm[T.length + i + 1] = nv + T[i + 2]; Tm[T.length + i + 2] = nv + T[i + 1]; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Pm, 3)); g.setIndex(new THREE.BufferAttribute(Tm, 1));
    const bvh = new MeshBVH(g);
    const pousse = new Float32Array(nv * 3), force = new Float32Array(nv); let dehors = 0, pres = 0, maxi = 0;
    for (let i = 0; i < A.n; i++) {
      pt.set(A.P[i * 3], A.P[i * 3 + 1], A.P[i * 3 + 2]);
      const r = bvh.closestPointToPoint(pt, cible, 0, 0.03); if (!r) continue;
      let vote = 0;
      for (const d of dirs) { rayon.origin.copy(pt); rayon.direction.copy(d); if (bvh.raycast(rayon, THREE.DoubleSide).length % 2 === 0) vote++; }
      const estDehors = vote >= 2;
      if (!estDehors && r.distance >= MARGE) continue;
      // Déplacement qui amène la peau à MARGE au-dessus de ce sommet.
      const f = cible.faceIndex * 3;
      if (estDehors) { D.copy(pt).sub(cible.point); const l = D.length(); if (l > 1e-6) D.multiplyScalar((l + MARGE) / l); else D.set(0, 0, 0); dehors++; if (l > maxi) maxi = l; }
      else {
        // Dedans, mais trop près : la peau s'écarte le long de sa normale.
        const ia = Tm[f] % nv; D.set(N[ia * 3], N[ia * 3 + 1], N[ia * 3 + 2]); if (Tm[f] >= nv) D.x = -D.x; D.multiplyScalar(MARGE - r.distance); pres++;
      }
      const l2 = D.lengthSq();
      for (let k = 0; k < 3; k++) { let v = Tm[f + k], sx = 1; if (v >= nv) { v -= nv; sx = -1; } if (l2 > force[v]) { force[v] = l2; pousse[v * 3] = sx * D.x; pousse[v * 3 + 1] = D.y; pousse[v * 3 + 2] = D.z; } }
    }
    chrono(`peau contre muscles (tour ${tour + 1}) : ${dehors} sommets de l'atlas dehors (jusqu'à ${(maxi * 1000).toFixed(1)} mm), ${pres} trop près`);
    if (!dehors && !pres) break;
    // La poussée s'étale aux voisins (deux anneaux), pour une bosse douce plutôt qu'une pointe.
    let q = pousse;
    for (let k = 0; k < 2; k++) {
      const q2 = Float32Array.from(q);
      for (let i = 0; i < nv; i++) { const v = voisins[i]; let x = 0, y = 0, z = 0; for (let j = 0; j < v.length; j++) { x += q[v[j] * 3]; y += q[v[j] * 3 + 1]; z += q[v[j] * 3 + 2]; } const n = Math.max(1, v.length); x *= 0.7 / n; y *= 0.7 / n; z *= 0.7 / n; if (x * x + y * y + z * z > q[i * 3] ** 2 + q[i * 3 + 1] ** 2 + q[i * 3 + 2] ** 2) { q2[i * 3] = x; q2[i * 3 + 1] = y; q2[i * 3 + 2] = z; } }
      q = q2;
    }
    for (let i = 0; i < nv; i++) { const surPlan = P[i * 3] === 0; P[i * 3] += q[i * 3]; P[i * 3 + 1] += q[i * 3 + 1]; P[i * 3 + 2] += q[i * 3 + 2]; if (surPlan || P[i * 3] < 0) P[i * 3] = 0; }
    N = lisseN(P);
  }
}

/* ---------- 4 : attaches au squelette ---------- */
// Les sommets de l'atlas (gauche, et droite en miroir avec les articulations jumelles), rangés dans une grille.
const CASE = 0.012, grille = new Map(), gk = (x, y, z) => Math.floor(x / CASE) + ',' + Math.floor(y / CASE) + ',' + Math.floor(z / CASE);
const nA = A.n * 2, xA = i => (i < A.n ? A.P[i * 3] : -A.P[(i - A.n) * 3]), yA = i => A.P[(i % A.n) * 3 + 1], zA = i => A.P[(i % A.n) * 3 + 2];
for (let i = 0; i < nA; i++) { const k = gk(xA(i), yA(i), zA(i)); let c = grille.get(k); if (!c) grille.set(k, c = []); c.push(i); }
const NJ = A.E.squelette.length;
function attachesDe(x, y, z, K = 4) {
  // Les K sommets de l'atlas les plus proches (recherche par anneaux de cases).
  const cx = Math.floor(x / CASE), cy = Math.floor(y / CASE), cz = Math.floor(z / CASE), best = [];
  for (let r = 0; r < 12; r++) {
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
      if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== r) continue;
      const cell = grille.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)); if (!cell) continue;
      for (const i of cell) { const d = (xA(i) - x) ** 2 + (yA(i) - y) ** 2 + (zA(i) - z) ** 2; best.push([d, i]); }
    }
    if (best.length >= K) { best.sort((p, q) => p[0] - q[0]); if (best[K - 1][0] <= (r * CASE) ** 2) break; }
  }
  best.sort((p, q) => p[0] - q[0]);
  const w = new Float32Array(NJ);
  for (const [d, i] of best.slice(0, K)) {
    const f = 1 / (d + 1e-7), g = i % A.n, miroir = i >= A.n;
    for (let k = 0; k < 4; k++) { const p = A.poids[g * 4 + k]; if (p) w[miroir ? jumeau[A.os[g * 4 + k]] : A.os[g * 4 + k]] += f * p; }
  }
  let s = 0; for (let j = 0; j < NJ; j++) s += w[j]; for (let j = 0; j < NJ; j++) w[j] /= s || 1;
  return w;
}
let W = new Float32Array(nv * NJ);
for (let i = 0; i < nv; i++) W.set(attachesDe(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), i * NJ);
// Lissage le long de la peau : pas de cassure entre deux sommets voisins qui recouvrent des muscles différents.
const TOURS = Number(process.env.TOURS || 4);
for (let tour = 0; tour < TOURS; tour++) {
  const Q = new Float32Array(W.length);
  for (let i = 0; i < nv; i++) { const v = voisins[i]; for (let j = 0; j < NJ; j++) { let s = 0; for (let q = 0; q < v.length; q++) s += W[v[q] * NJ + j]; Q[i * NJ + j] = 0.5 * W[i * NJ + j] + 0.5 * s / Math.max(1, v.length); } }
  W = Q;
}
/* L'épaule. Au repos, le bras pend contre le flanc : la peau du flanc reprenait les attaches du bras tout proche (ou du
   grand dorsal près de son tendon), et partait avec lui quand il se lève. La peau du tronc ne suit donc le bras que près
   de l'articulation ; plus loin, le tronc la garde. De même, la peau du bras ne suit le tronc que près de l'épaule. */
{
  const R0 = Number(process.env.EPAULE_R0 || 0.05), R1 = Number(process.env.EPAULE_R1 || 0.13);
  const lisse = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  // Part « bras » de chaque sommet, d'après sa région (deltoïde, bras, avant-bras, main), adoucie le long de la peau.
  let bras = new Float32Array(nv), compte = new Float32Array(nv);
  for (let t = 0; t < nt; t++) { const b = BRAS.test(regions[peauRegion[t]]) || MAIN.has(regions[peauRegion[t]]) ? 1 : 0; for (let j = 0; j < 3; j++) { bras[T[t * 3 + j]] += b; compte[T[t * 3 + j]]++; } }
  for (let i = 0; i < nv; i++) bras[i] /= compte[i] || 1;
  for (let k = 0; k < 3; k++) { const b = new Float32Array(nv); for (let i = 0; i < nv; i++) { const vs = voisins[i]; let s = 0; for (let q = 0; q < vs.length; q++) s += bras[vs[q]]; b[i] = 0.5 * bras[i] + 0.5 * s / Math.max(1, vs.length); } bras = b; }
  const membre = nom => /^(humerus|ulna|radius|main|doigt)/.test(nom), jambe = nom => /^(femur|tibia|pied|orteils)/.test(nom);
  const TRONC = A.E.squelette.map((a, j) => (!membre(a.nom) && !jambe(a.nom) ? j : -1)).filter(j => j >= 0), THORAX = J('thorax');
  let retenus = 0, rendus = 0;
  for (const c of ['G', 'D']) {
    const BR = A.E.squelette.map((a, j) => (membre(a.nom) && a.nom.endsWith('.' + c) ? j : -1)).filter(j => j >= 0), HUM = J('humerus.' + c), C = A.E.squelette[HUM].centre;
    for (let i = 0; i < nv; i++) {
      const w = W.subarray(i * NJ, (i + 1) * NJ), d = Math.hypot(P[i * 3] - C[0], P[i * 3 + 1] - C[1], P[i * 3 + 2] - C[2]), loin = lisse(R0, R1, d);
      let sB = 0, sT = 0; for (const j of BR) sB += w[j]; for (const j of TRONC) sT += w[j];
      // Peau du tronc : sa part de bras est plafonnée, d'autant plus bas qu'elle est loin de l'épaule.
      const plafB = 1 - loin * (1 - bras[i]);
      if (sB > plafB + 1e-6) { const k = plafB / sB, rendu = sB - plafB; for (const j of BR) w[j] *= k; if (sT > 1e-6) for (const j of TRONC) w[j] += rendu * w[j] / sT; else w[THORAX] += rendu; retenus++; sT += rendu; sB = plafB; }
      // Peau du bras : sa part de tronc est plafonnée de même.
      const plafT = 1 - loin * bras[i];
      if (sB > 1e-6 && sT > plafT + 1e-6) { const k = plafT / sT, rendu = sT - plafT; for (const j of TRONC) w[j] *= k; for (const j of BR) w[j] += rendu * w[j] / sB; rendus++; }
    }
  }
  chrono(`épaule : ${retenus} sommets du tronc retenus (part de bras plafonnée), ${rendus} sommets du bras rendus au bras`);
}
// Sur la couture du milieu, les attaches sont symétriques (sinon les deux moitiés se décollent en mouvement).
for (let i = 0; i < nv; i++) if (P[i * 3] === 0) { const w = W.subarray(i * NJ, (i + 1) * NJ), s = Float32Array.from(w); for (let j = 0; j < NJ; j++) w[j] = (s[j] + s[jumeau[j]]) / 2; }
/* Articulations intermédiaires, pour la peau seulement. Entre deux os qui tournent beaucoup l'un par rapport à l'autre,
   une peau attachée « moitié-moitié » se pince (elle perd son épaisseur au milieu du pli) ou se vrille (avant-bras en
   pronation). On intercale donc des articulations fictives qui font une fraction de la rotation : chaque sommet n'est
   plus partagé qu'entre deux voisines, qui diffèrent de peu. Le moteur calcule leur pose à partir des deux vraies. */
const DEFS = [], PAIRES = [];
function declarer(nom, de, vers, parts, retrait = 0) { const k0 = DEFS.length; parts.forEach(f => DEFS.push(Object.assign({ de: J(de), vers: J(vers), part: +f.toFixed(4) }, retrait ? { retrait } : {}))); PAIRES.push({ nom, de: J(de), vers: J(vers), parts, k0 }); }
declarer('torsion', 'ulna.G', 'radius.G', [0.25, 0.5, 0.75]);      // l'avant-bras : la peau se vrille du coude au poignet
declarer('coude', 'humerus.G', 'ulna.G', [0.5]);
declarer('poignet', 'radius.G', 'main.G', [0.5]);
declarer('epaule', 'clavicule.G', 'humerus.G', [1 / 3, 2 / 3]);
// L'aisselle : bras levé, elle se creuse. Ses articulations se rapprochent du centre de l'épaule à mesure qu'elle tourne
// (« retrait »), au lieu de tourner à distance constante, ce qui gonflerait le flanc comme une aile.
declarer('aisselle', 'thorax', 'humerus.G', [1 / 3, 2 / 3], Number(process.env.RETRAIT_AISSELLE || 0.5));   // pectoral, grand dorsal : du thorax au bras
declarer('hanche', 'bassin', 'femur.G', [1 / 3, 2 / 3]);
declarer('genou', 'femur.G', 'tibia.G', [0.5]);
declarer('cheville', 'tibia.G', 'pied.G', [0.5]);
const NX = DEFS.length, NT = NJ + 2 * NX;
// Numéros : NJ + k pour la gauche, NJ + NX + k pour la droite ; les jumelles se répondent.
const jumeauE = Array.from({ length: NT }, (_, j) => (j < NJ ? jumeau[j] : j < NJ + NX ? j + NX : j - NX));
const cotes = PAIRES.map(p => ({ G: { de: p.de, vers: p.vers, noeuds: p.parts.map((_, i) => NJ + p.k0 + i) }, D: { de: jumeau[p.de], vers: jumeau[p.vers], noeuds: p.parts.map((_, i) => NJ + NX + p.k0 + i) } }));
const centreJ = j => A.E.squelette[j].centre;
function poserSur(o, noeuds, fracs, x, m) {
  let i = 0; while (i < fracs.length - 2 && x > fracs[i + 1]) i++;
  const u = Math.min(1, Math.max(0, (x - fracs[i]) / (fracs[i + 1] - fracs[i])));
  o[noeuds[i]] += m * (1 - u); o[noeuds[i + 1]] += m * u;
}
function repartir(w, x, y, z) {
  const o = new Float32Array(NT); o.set(w);
  // L'avant-bras : la part de torsion suit la position du sommet entre le coude et le poignet.
  for (const c of ['G', 'D']) {
    const T = cotes[0][c], m = o[T.de] + o[T.vers]; if (m < 1e-4) continue;
    const a = centreJ(T.de), b = centreJ(c === 'G' ? J('main.G') : J('main.D')), dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const t = ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (dx * dx + dy * dy + dz * dz), f = Math.min(1, Math.max(0, (t - 0.06) / 0.88));
    o[T.de] = 0; o[T.vers] = 0; poserSur(o, [T.de, ...T.noeuds, T.vers], [0, ...PAIRES[0].parts, 1], f, m);
  }
  // Les autres paires : chacune reprend, des deux articulations qu'elle relie, la part qui lui revient.
  const base = Float32Array.from(o), res = Float32Array.from(o), partenaires = new Float32Array(NT);
  const actives = [];
  for (let k = 1; k < PAIRES.length; k++) for (const c of ['G', 'D']) { const q = cotes[k][c]; if (base[q.de] > 1e-5 && base[q.vers] > 1e-5) { actives.push([k, q]); partenaires[q.de] += base[q.vers]; partenaires[q.vers] += base[q.de]; } }
  for (const [k, q] of actives) {
    const sa = base[q.de] * base[q.vers] / partenaires[q.de], sb = base[q.vers] * base[q.de] / partenaires[q.vers];
    res[q.de] -= sa; res[q.vers] -= sb;
    poserSur(res, [q.de, ...q.noeuds, q.vers], [0, ...PAIRES[k].parts, 1], sb / (sa + sb), sa + sb);
  }
  for (let j = 0; j < NT; j++) if (res[j] < 0) res[j] = 0;
  return res;
}
function quatre(w) {
  const ordre = Array.from({ length: w.length }, (_, j) => j).sort((a, b) => w[b] - w[a]).slice(0, 4);
  const somme = ordre.reduce((s, j) => s + w[j], 0) || 1, os = [0, 0, 0, 0], poids = [0, 0, 0, 0]; let reste = 255;
  for (let k = 3; k >= 0; k--) { const p = k === 0 ? reste : Math.min(reste, Math.round(255 * w[ordre[k]] / somme)); os[k] = ordre[k]; poids[k] = p; reste -= p; }
  return { os, poids };
}
chrono('peau attachée au squelette');

/* ---------- 5 : ombrage de relief ---------- */
/* Part du ciel cachée par le corps lui-même (les deux côtés de la peau), comme pour les muscles — mais segment par
   segment. Le corps est mesuré au repos, bras le long du corps : l'ombre que le bras fait au flanc, ou une cuisse à
   l'autre, n'existe plus dès que le bras se lève ou que les jambes s'écartent, et resterait peinte sur la peau comme
   une tache. Une surface ne fait donc de l'ombre qu'à ce qui bouge avec elle : tronc et tête, chaque bras, chaque main,
   chaque jambe, chaque pied. Aux jonctions, la part d'ombre suit le partage des attaches (pas de cassure). */
const ombre = (() => {
  const SEG = ['axe', 'bras.G', 'main.G', 'jambe.G', 'pied.G', 'bras.D', 'main.D', 'jambe.D', 'pied.D'], NS = SEG.length;
  const segDe = nom => { const c = /\.D$/.test(nom) ? '.D' : '.G', n = nom.replace(/\.[GD]$/, ''); return SEG.indexOf(/^(humerus|ulna|radius)$/.test(n) ? 'bras' + c : /^(main|doigt)/.test(n) ? 'main' + c : /^(femur|tibia)$/.test(n) ? 'jambe' + c : /^(pied|orteils)$/.test(n) ? 'pied' + c : 'axe'); };
  const segJ = A.E.squelette.map(a => segDe(a.nom)), miroirS = SEG.map((s, k) => (k === 0 ? 0 : SEG.indexOf(s.replace(/\.[GD]$/, m => (m === '.G' ? '.D' : '.G')))));
  if (segJ.some(s => s < 0) || miroirS.some(s => s < 0)) throw new Error('segments du corps : articulation non rangée');
  // Part de chaque segment en chaque sommet (côté rangé ; pour le miroir, les segments gauches et droits s'échangent).
  const S = new Float32Array(nv * NS);
  for (let i = 0; i < nv; i++) for (let j = 0; j < NJ; j++) { const w = W[i * NJ + j]; if (w) S[i * NS + segJ[j]] += w; }
  const Pm = new Float32Array(nv * 6), Tm = new Uint32Array(T.length * 2);
  Pm.set(P); for (let i = 0; i < nv; i++) { Pm[(nv + i) * 3] = -P[i * 3]; Pm[(nv + i) * 3 + 1] = P[i * 3 + 1]; Pm[(nv + i) * 3 + 2] = P[i * 3 + 2]; }
  Tm.set(T); for (let i = 0; i < T.length; i += 3) { Tm[T.length + i] = nv + T[i]; Tm[T.length + i + 1] = nv + T[i + 2]; Tm[T.length + i + 2] = nv + T[i + 1]; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Pm, 3)); g.setIndex(new THREE.BufferAttribute(Tm, 1));
  // (La construction range les triangles de Tm à sa façon : un numéro de face touchée se lit dans Tm après coup.)
  const bvh = new MeshBVH(g), rayon = new THREE.Ray(), R = 24, PORTEE = 0.25, o = new Float32Array(nv);
  const n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  // Parenté entre le sommet i et la face f : produit de leurs parts de segments (1 : même segment ; 0 : segments distincts).
  const parente = (i, f) => {
    let s = 0;
    for (let k = 0; k < 3; k++) { let q = Tm[f * 3 + k]; const mir = q >= nv; if (mir) q -= nv; for (let a = 0; a < NS; a++) { const x = S[i * NS + a]; if (x) s += x * S[q * NS + (mir ? miroirS[a] : a)]; } }
    return s / 3;
  };
  for (let i = 0; i < nv; i++) {
    n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); u.set(Math.abs(n.x) > 0.8 ? 0 : 1, Math.abs(n.x) > 0.8 ? 1 : 0, 0).cross(n).normalize(); v.crossVectors(n, u);
    let libre = 0, tot = 0;
    for (let k = 0; k < R; k++) {
      // Directions réparties sur la demi-sphère, pondérées par le cosinus.
      const a = 2 * Math.PI * ((k * 0.618034 + i * 0.37) % 1), r = Math.sqrt((k + 0.5) / R), h = Math.sqrt(1 - r * r);
      rayon.direction.set(0, 0, 0).addScaledVector(u, r * Math.cos(a)).addScaledVector(v, r * Math.sin(a)).addScaledVector(n, h).normalize();
      rayon.origin.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).addScaledVector(n, 0.0015);
      // Chaque surface rencontrée retire sa part de ciel, selon sa parenté avec le sommet et sa distance.
      const touches = bvh.raycast(rayon, THREE.DoubleSide, 0, PORTEE).sort((p, q) => p.distance - q.distance);
      let passe = 1;
      for (const hit of touches) { passe *= 1 - parente(i, hit.faceIndex) * (1 - Math.min(1, hit.distance / PORTEE) ** 0.6); if (passe < 0.02) break; }
      libre += passe; tot++;
    }
    o[i] = libre / tot;
  }
  // Aux jonctions (épaule, hanche, poignet, cheville), la peau est partagée entre deux segments : le pli qu'elle forme au
  // repos s'ouvre avec le mouvement (l'aisselle, bras levé). L'ombre s'y efface, d'autant plus que le partage est égal.
  const ETALE = Number(process.env.ETALE_JONCTION || 3);
  let jonction = new Float32Array(nv);
  for (let i = 0; i < nv; i++) { let c = 0; for (let a = 0; a < NS; a++) c += S[i * NS + a] ** 2; jonction[i] = Math.min(1, 2 * (1 - c)); }
  for (let k = 0; k < ETALE; k++) { const b = new Float32Array(nv); for (let i = 0; i < nv; i++) { const vs = voisins[i]; let m = jonction[i]; for (let q = 0; q < vs.length; q++) m = Math.max(m, jonction[vs[q]] * 0.85); b[i] = m; } jonction = b; }
  for (let i = 0; i < nv; i++) o[i] = 1 - (1 - o[i]) * (1 - jonction[i]);
  let a = o; for (let k = 0; k < 2; k++) { const b = new Float32Array(nv); for (let i = 0; i < nv; i++) { const vs = voisins[i]; let s = 0; for (let q = 0; q < vs.length; q++) s += a[vs[q]]; b[i] = 0.5 * a[i] + 0.5 * s / Math.max(1, vs.length); } a = b; }
  return a;
})();
chrono('ombrage de relief calculé');

/* ---------- 5 bis : épaisseur sous la peau ---------- */
// De combien faut-il reculer la peau pour qu'elle passe derrière le muscle qu'elle recouvre ? La distance, en chaque
// sommet, au premier muscle (ou os) rencontré vers l'intérieur : quelques millimètres sur l'avant-bras, plusieurs
// centimètres sur la fesse ou le ventre.
const epais = (() => {
  const rayon = new THREE.Ray(), e = new Float32Array(nv).fill(-1);
  for (let i = 0; i < nv; i++) {
    rayon.origin.set(P[i * 3] + N[i * 3] * 0.001, P[i * 3 + 1] + N[i * 3 + 1] * 0.001, P[i * 3 + 2] + N[i * 3 + 2] * 0.001); rayon.direction.set(-N[i * 3], -N[i * 3 + 1], -N[i * 3 + 2]);
    const h = bvhAtlas.raycastFirst(rayon, THREE.DoubleSide, 0, 0.09);
    if (h) e[i] = Math.max(0, h.distance - 0.001);
  }
  // Là où le rayon n'a rien trouvé (bord d'une ouverture), on prend la valeur des voisins ; puis on garde, en chaque
  // sommet, la plus grande épaisseur du voisinage (la fenêtre s'ouvre franchement), un peu lissée.
  for (let tour = 0; tour < 6; tour++) for (let i = 0; i < nv; i++) if (e[i] < 0) { const v = voisins[i]; let s = 0, n = 0; for (let q = 0; q < v.length; q++) if (e[v[q]] >= 0) { s += e[v[q]]; n++; } if (n) e[i] = s / n; }
  for (let i = 0; i < nv; i++) if (e[i] < 0) e[i] = 0.02;
  let a = e;
  for (let k = 0; k < 2; k++) { const b = new Float32Array(nv); for (let i = 0; i < nv; i++) { const v = voisins[i]; let m = a[i]; for (let q = 0; q < v.length; q++) m = Math.max(m, a[v[q]]); b[i] = m; } a = b; }
  for (let k = 0; k < 2; k++) { const b = new Float32Array(nv); for (let i = 0; i < nv; i++) { const v = voisins[i]; let s2 = 0; for (let q = 0; q < v.length; q++) s2 += a[v[q]]; b[i] = 0.5 * a[i] + 0.5 * s2 / Math.max(1, v.length); } a = b; }
  return a;
})();
{ const tri = Array.from(epais).sort((x, y) => x - y); chrono(`épaisseur sous la peau : médiane ${(tri[nv >> 1] * 1000).toFixed(1)} mm, 9 sommets sur 10 sous ${(tri[Math.floor(nv * 0.9)] * 1000).toFixed(1)} mm, maximum ${(tri[nv - 1] * 1000).toFixed(1)} mm`); }

/* ---------- 6 : écriture ---------- */
// Le short : les sommets du tronc et des jambes peuvent le porter (jamais le bras ni la main, qui pendent à sa hauteur).
const eligible = new Uint8Array(nv);
for (let t = 0; t < nt; t++) if (peauZone[t] === Z.corps && !BRAS.test(regions[peauRegion[t]])) for (let j = 0; j < 3; j++) eligible[T[t * 3 + j]] = 1;
// Sommets finaux : un sommet soudé est dédoublé là où deux zones se touchent (poignet, cheville, bord du visage).
const OCTETS = 20, sommets = [], indPairs = [], indImpairs = [];
const octa = (x, y, z) => { const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; let u = x / s, v = y / s; if (z < 0) { const u2 = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1), v2 = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1); u = u2; v = v2; } return [Math.max(-127, Math.min(127, Math.round(u * 127))), Math.max(-127, Math.min(127, Math.round(v * 127)))]; };
const ajouter = (p, n, o, short, zone, att, ep) => { sommets.push({ p, n, o, short, zone, att, ep: ep || 0 }); return sommets.length - 1; };
{
  const fait = new Map();
  for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) {
    const i = T[t * 3 + j], z = peauZone[t], k = i * 8 + z; let s = fait.get(k);
    if (s === undefined) {
      const w = repartir(W.subarray(i * NJ, (i + 1) * NJ), P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (P[i * 3] === 0) { const sym = Float32Array.from(w); for (let j = 0; j < NT; j++) w[j] = (sym[j] + sym[jumeauE[j]]) / 2; }
      s = ajouter([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], ombre[i], eligible[i], z, quatre(w), epais[i]); fait.set(k, s);
    }
    indPairs.push(s);
  }
}
const TETE_J = J('tete');
// Les yeux : un globe par côté, au centre et au diamètre de la sclère de Z-Anatomy ; l'iris et la pupille sont dessinés
// par le moteur, d'après la direction du regard.
const OEIL = { centre: [0.030, 1.591, 0.064], rayon: 0.0122 };
{
  const SEG = 20, ANN = 12, Pe = [], Te = [];
  for (let a = 0; a <= ANN; a++) for (let b = 0; b < SEG; b++) { const t = Math.PI * a / ANN, f = 2 * Math.PI * b / SEG; Pe.push(OEIL.centre[0] + OEIL.rayon * Math.sin(t) * Math.cos(f), OEIL.centre[1] + OEIL.rayon * Math.cos(t), OEIL.centre[2] + OEIL.rayon * Math.sin(t) * Math.sin(f)); }
  for (let a = 0; a < ANN; a++) for (let b = 0; b < SEG; b++) { const i0 = a * SEG + b, i1 = a * SEG + (b + 1) % SEG, i2 = i0 + SEG, i3 = i1 + SEG; Te.push(i0, i1, i2, i1, i3, i2); }
  pieces.push({ nom: 'yeux', zone: Z.oeil, P: Float32Array.from(Pe), T: Uint32Array.from(Te), pair: true });
}
for (const pc of pieces) {
  const Np = normales(pc.P, pc.T), n = pc.P.length / 3, base = sommets.length;
  // Les ongles sont posés un rien au-dessus du doigt (sinon ils se confondent avec la peau).
  if (pc.zone === Z.ongle) for (let i = 0; i < n * 3; i++) pc.P[i] += Np[i] * 0.0005;
  for (let i = 0; i < n; i++) {
    // Cheveux, sourcils, cils : avec la tête. Ongles : avec la phalange qu'ils recouvrent.
    const att = pc.zone === Z.ongle ? quatre(repartir(attachesDe(pc.P[i * 3], pc.P[i * 3 + 1], pc.P[i * 3 + 2], 3), pc.P[i * 3], pc.P[i * 3 + 1], pc.P[i * 3 + 2])) : { os: [TETE_J, 0, 0, 0], poids: [255, 0, 0, 0] };
    ajouter([pc.P[i * 3], pc.P[i * 3 + 1], pc.P[i * 3 + 2]], [Np[i * 3], Np[i * 3 + 1], Np[i * 3 + 2]], 1, 0, pc.zone, att);
  }
  for (let k = 0; k < pc.T.length; k++) (pc.pair ? indPairs : indImpairs).push(base + pc.T[k]);
}
const ns = sommets.length, mini = [1e9, 1e9, 1e9], maxi = [-1e9, -1e9, -1e9];
for (const s of sommets) for (let k = 0; k < 3; k++) { mini[k] = Math.min(mini[k], s.p[k]); maxi[k] = Math.max(maxi[k], s.p[k]); }
const etendue = maxi.map((m, k) => m - mini[k]);
const B = Buffer.alloc(ns * OCTETS);
sommets.forEach((s, i) => {
  const o = i * OCTETS;
  for (let k = 0; k < 3; k++) B.writeUInt16LE(Math.round((s.p[k] - mini[k]) / etendue[k] * 65535), o + k * 2);
  B.writeUInt8(Math.round(255 * Math.min(1, Math.max(0, s.o))), o + 6);
  B.writeUInt8(s.short ? 255 : 0, o + 7);
  const [a, b] = octa(...s.n); B.writeInt8(a, o + 8); B.writeInt8(b, o + 9);
  B.writeUInt8(s.zone, o + 10);
  B.writeUInt8(Math.min(255, Math.round(s.ep / 0.0005)), o + 11);          // épaisseur sous la peau, par pas d'un demi-millimètre
  for (let k = 0; k < 4; k++) { B.writeUInt8(s.att.os[k], o + 12 + k); B.writeUInt8(s.att.poids[k], o + 16 + k); }
});
const large = ns > 65535, ind = [...indPairs, ...indImpairs];
const I = Buffer.alloc(ind.length * (large ? 4 : 2));
ind.forEach((v, k) => (large ? I.writeUInt32LE(v, k * 4) : I.writeUInt16LE(v, k * 2)));
const entete = {
  format: 'anqa-peau', version: 1,
  source: 'Z-Anatomy (z-anatomy.com), dérivé de BodyParts3D © The Database Center for Life Science — CC BY-SA 4.0 ; surface du corps assemblée et articulée pour Anqā, diffusée sous la même licence.',
  boite: { min: mini.map(x => +x.toFixed(5)), etendue: etendue.map(x => +x.toFixed(5)) },
  sommets: ns, octetsParSommet: OCTETS, indicesSur: large ? 32 : 16, trianglesPairs: indPairs.length / 3, trianglesImpairs: indImpairs.length / 3,
  zones: ZONES, short: { bas: 0.68, haut: 0.985 }, oeil: OEIL,
  // Articulations intermédiaires (côté gauche ; la droite s'en déduit par les jumelles) : numéro = nombre d'articulations du squelette + rang.
  articulations: NJ, intermediaires: DEFS
};
let h = Buffer.from(JSON.stringify(entete), 'utf8'); if (h.length % 4) h = Buffer.concat([h, Buffer.alloc(4 - h.length % 4, 32)]);
const tete = Buffer.alloc(12); tete.write('ANQP', 0, 'latin1'); tete.writeUInt32LE(1, 4); tete.writeUInt32LE(h.length, 8);
fs.writeFileSync(sortie, Buffer.concat([tete, h, B, I]));
chrono(`écrit ${sortie} : ${ns} sommets, ${indPairs.length / 3} triangles pairs + ${indImpairs.length / 3} du milieu, ${(fs.statSync(sortie).size / 1e6).toFixed(2)} Mo`);
