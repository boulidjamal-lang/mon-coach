// Mannequin Blender, étape 1 : ce que l'appli sait du corps, écrit pour Blender.
//   - le modèle préparé (muscles et os étoffés, comme le moteur les montre), avec la structure de chaque sommet ;
//   - la peau de l'appli (film du corps, tête, mains, pieds, ongles, cheveux, yeux) ;
//   - le squelette.
// node exporter-source.mjs <dépôt, ou - pour celui-ci> <sortie.bin>
import fs from 'fs';
import path from 'path';
import vm from 'vm';
const ICI = path.dirname(new URL(import.meta.url).pathname);
const [depot = '-', sortie = 'source.bin'] = process.argv.slice(2);
const DEPOT = depot === '-' ? path.join(ICI, '..', '..', '..', '..') : depot;
const fAtlas = path.join(DEPOT, 'assets', 'atlas', 'atlas.bin'), fPeau = path.join(DEPOT, 'assets', 'atlas', 'atlas-peau.bin');
const ctx = { window: {}, Math, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, DataView, JSON, Object, Array, Infinity, console, Map, WeakMap };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(DEPOT, 'assets', 'atlas', 'atlas3d.js'), 'utf8'), ctx);
const A = ctx.window.AnqaAtlas;

// Le modèle préparé (même suite que outils/peau-fine.mjs : étoffé, contacts éclaircis, poids repris).
const brut = fs.readFileSync(fAtlas);
const lgA = brut.readUInt32LE(8), enteteA = JSON.parse(brut.subarray(12, 12 + lgA).toString('utf8'));
delete enteteA.preparation;
const pasA = enteteA.octetsParSommet, debutA = 12 + lgA, NA = enteteA.sommets, octI = enteteA.triangles * 6;
const E = JSON.parse(JSON.stringify(enteteA));
let bA = new Uint8Array(brut.subarray(debutA, debutA + NA * pasA));
const indA = new Uint16Array(brut.buffer.slice(brut.byteOffset + debutA + NA * pasA, brut.byteOffset + debutA + NA * pasA + octI));
const estOs = (v, o) => bA[o + 10] === E.os.pair || bA[o + 10] === E.os.impair;
{ const r = A.etoffer(bA, pasA, E.boite, E.squelette, 1, estOs); bA = r.sommets; E.boite = r.boite; }
A.eclaircirContacts(bA, pasA, E, estOs);
A.reponderer(bA, pasA, E, indA, estOs);
const Pm = new Float32Array(NA * 3), Sm = new Uint8Array(NA), Jm = new Uint8Array(NA * 4), Wm = new Uint8Array(NA * 4);
{ const v = new DataView(bA.buffer, bA.byteOffset, bA.byteLength);
  for (let i = 0; i < NA; i++) { const o = i * pasA; for (let k = 0; k < 3; k++) Pm[i * 3 + k] = E.boite.min[k] + v.getUint16(o + k * 2, true) / 65535 * E.boite.etendue[k]; Sm[i] = bA[o + 10]; for (let k = 0; k < 4; k++) { Jm[i * 4 + k] = bA[o + 12 + k]; Wm[i * 4 + k] = bA[o + 16 + k]; } } }
const Tm = new Uint32Array(enteteA.triangles * 3);
{ let k = 0; for (let i = 0; i < E.pieces.length; i += 2) { const v0 = E.pieces[i], m = E.pieces[i + 1]; for (let j = 0; j < m; j++, k++) Tm[k] = v0 + indA[k]; } }
console.log(`modèle préparé : ${NA} sommets, ${Tm.length / 3} triangles, ${E.structures.length} structures, os ${JSON.stringify(E.os)}`);

// La peau (version 2).
const bp = fs.readFileSync(fPeau);
if (bp.toString('latin1', 0, 4) !== 'ANQP' || bp.readUInt32LE(4) !== 2) throw new Error('peau : version 2 attendue');
const lgP = bp.readUInt32LE(8), HP = JSON.parse(bp.subarray(12, 12 + lgP).toString('utf8')), d0 = 12 + lgP;
const desocta = (a, b) => { const x = a / 127, y = b / 127, z = 1 - Math.abs(x) - Math.abs(y), t = Math.max(-z, 0); const vx = x + (x >= 0 ? -t : t), vy = y + (y >= 0 ? -t : t), l = Math.hypot(vx, vy, z) || 1; return [vx / l, vy / l, z / l]; };
function lire(def, pas, n) {
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), zone = new Uint8Array(n), ombre = new Uint8Array(n), bord = new Uint8Array(n), J = new Uint8Array(n * 4), W = new Uint8Array(n * 4), J2 = new Uint8Array(n * 4), W2 = new Uint8Array(n * 4);
  const v = new DataView(bp.buffer, bp.byteOffset + d0 + def, n * pas);
  for (let i = 0; i < n; i++) {
    const o = i * pas;
    for (let k = 0; k < 3; k++) P[i * 3 + k] = HP.boite.min[k] + v.getUint16(o + k * 2, true) / 65535 * HP.boite.etendue[k];
    ombre[i] = v.getUint8(o + 6); bord[i] = v.getUint8(o + 7);
    const nn = desocta(v.getInt8(o + 8), v.getInt8(o + 9)); N[i * 3] = nn[0]; N[i * 3 + 1] = nn[1]; N[i * 3 + 2] = nn[2];
    zone[i] = v.getUint8(o + 10);
    for (let k = 0; k < 4; k++) { J[i * 4 + k] = v.getUint8(o + 12 + k); W[i * 4 + k] = v.getUint8(o + 16 + k); if (pas >= 28) { J2[i * 4 + k] = v.getUint8(o + 20 + k); W2[i * 4 + k] = v.getUint8(o + 24 + k); } }
  }
  return { P, N, zone, ombre, bord, J, W, J2, W2 };
}
const R = lire(HP.reste.debut, 20, HP.reste.sommets), C = lire(HP.corps.debut, 28, HP.corps.sommets);
const u16 = (def, n) => Uint32Array.from(new Uint16Array(bp.buffer.slice(bp.byteOffset + d0 + def, bp.byteOffset + d0 + def + n * 2)));
const TR = u16(HP.reste.indices, (HP.reste.trianglesPairs + HP.reste.trianglesImpairs) * 3), TC = u16(HP.corps.indices, HP.corps.triangles * 3);
console.log(`peau : corps ${HP.corps.sommets} sommets ${HP.corps.triangles} triangles ; reste ${HP.reste.sommets} sommets, ${HP.reste.trianglesPairs} triangles pairs, ${HP.reste.trianglesImpairs} du milieu`);

const blocs = []; let dec = 0;
const aj = ta => { const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength), pad = (4 - b.length % 4) % 4; blocs.push(b, Buffer.alloc(pad)); const o = dec; dec += b.length + pad; return o; };
const entete = {
  squelette: E.squelette.map(a => ({ nom: a.nom, parent: a.parent, centre: a.centre, jumeau: a.jumeau, virtuel: !!a.virtuel })),
  structures: E.structures.map((s, i) => ({ i, id: s.id, nom: s.nom, region: s.region, type: s.type, couche: s.couche, pair: s.pair, app: s.app, sommets: s.sommets, nbSommets: s.nbSommets })),
  os: E.os, zones: HP.zones, oeil: HP.oeil, intermediaires: HP.intermediaires, articulationsPeau: HP.articulations,
  atlas: { n: NA, nt: Tm.length / 3, P: aj(Pm), S: aj(Sm), J: aj(Jm), W: aj(Wm), T: aj(Tm) },
  reste: { n: HP.reste.sommets, pairs: HP.reste.trianglesPairs, impairs: HP.reste.trianglesImpairs, P: aj(R.P), N: aj(R.N), zone: aj(R.zone), J: aj(R.J), W: aj(R.W), T: aj(TR) },
  corps: { n: HP.corps.sommets, nt: HP.corps.triangles, P: aj(C.P), N: aj(C.N), bord: aj(C.bord), pasBord: HP.corps.pasBord, J: aj(C.J), W: aj(C.W), J2: aj(C.J2), W2: aj(C.W2), T: aj(TC) }
};
const h = Buffer.from(JSON.stringify(entete)), hp = Buffer.concat([h, Buffer.alloc((4 - h.length % 4) % 4, 32)]), tete = Buffer.alloc(4); tete.writeUInt32LE(hp.length);
fs.writeFileSync(sortie, Buffer.concat([tete, hp, ...blocs]));
console.log(`écrit ${sortie} : ${(fs.statSync(sortie).size / 1e6).toFixed(1)} Mo`);
console.log('régions :', [...new Set(E.structures.map(s => s.region))].join(', '));
console.log('types :', [...new Set(E.structures.map(s => s.type))].join(', '), '| couches :', [...new Set(E.structures.map(s => s.couche))].join(', '));
