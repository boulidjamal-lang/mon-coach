// Sonde de la peau fabriquée : sens des triangles (un triangle retourné montre son envers), arêtes portées par plus de deux
// triangles, triangles plats. Usage : node outils/peau-orientation.mjs [atlas-peau.bin]
import fs from 'fs';
const f = process.argv[2] || 'peau/atlas-peau.bin', d = fs.readFileSync(f), lg = d.readUInt32LE(8), H = JSON.parse(d.subarray(12, 12 + lg).toString('utf8'));
const base = 12 + lg, ns = H.sommets, O = H.octetsParSommet, iBase = base + ns * O;
const P = new Float32Array(ns * 3), zone = new Uint8Array(ns);
for (let i = 0; i < ns; i++) { for (let k = 0; k < 3; k++) P[i * 3 + k] = H.boite.min[k] + d.readUInt16LE(base + i * O + k * 2) / 65535 * H.boite.etendue[k]; zone[i] = d[base + i * O + 10]; }
const nt = H.trianglesPairs, T = new Uint32Array(nt * 3);
for (let k = 0; k < nt * 3; k++) T[k] = H.indicesSur === 32 ? d.readUInt32LE(iBase + k * 4) : d.readUInt16LE(iBase + k * 2);
// Sommets soudés par position (les zones dédoublent leurs frontières).
const cle = i => P[i * 3].toFixed(5) + ',' + P[i * 3 + 1].toFixed(5) + ',' + P[i * 3 + 2].toFixed(5), idx = new Map(), S = new Uint32Array(ns);
for (let i = 0; i < ns; i++) { const k = cle(i); let j = idx.get(k); if (j === undefined) { j = idx.size; idx.set(k, j); } S[i] = j; }
const peau = t => zone[T[t * 3]] <= 3;
const aretes = new Map(); let plats = 0;
for (let t = 0; t < nt; t++) {
  if (!peau(t)) continue;
  const a = S[T[t * 3]], b = S[T[t * 3 + 1]], c = S[T[t * 3 + 2]];
  if (a === b || b === c || a === c) { plats++; continue; }
  for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = u < v ? u + '_' + v : v + '_' + u; (aretes.get(k) || aretes.set(k, []).get(k)).push([t, u < v ? 1 : -1]); }
}
let libres = 0, multiples = 0, inverses = 0; const mauvais = new Map();
for (const [k, l] of aretes) {
  if (l.length === 1) libres++;
  else if (l.length > 2) { multiples++; for (const [t] of l) mauvais.set(t, 'multiple'); }
  else if (l[0][1] === l[1][1]) { inverses++; for (const [t] of l) if (!mauvais.has(t)) mauvais.set(t, 'sens'); }
}
console.log(f, ':', nt, 'triangles pairs ;', [...Array(nt).keys()].filter(peau).length, 'de peau ; plats', plats, '; arêtes', aretes.size, '; libres', libres, '; portées par plus de deux triangles', multiples, '; voisins de sens contraire', inverses);
const ou = new Map();
for (const [t, quoi] of mauvais) { const y = (P[T[t * 3] * 3 + 1] + P[T[t * 3 + 1] * 3 + 1] + P[T[t * 3 + 2] * 3 + 1]) / 3, x = (P[T[t * 3] * 3] + P[T[t * 3 + 1] * 3] + P[T[t * 3 + 2] * 3]) / 3; const k = quoi + ' zone ' + H.zones[zone[T[t * 3]]] + ' y≈' + (Math.round(y * 20) / 20).toFixed(2) + ' x≈' + (Math.round(x * 20) / 20).toFixed(2); ou.set(k, (ou.get(k) || 0) + 1); }
console.log([...ou].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => n + ' × ' + k).join('\n'));
