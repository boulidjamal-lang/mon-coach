// Outils communs à la chaîne de préparation de l'atlas : lecture des maillages extraits de Blender,
// classement des structures, repère de l'appli (Y vers le haut, corps face à +Z, côté gauche en +X).
import fs from 'fs';

export function lireBin(chemin) {
  const d = fs.readFileSync(chemin);
  const n = d.readUInt32LE(0);
  const entete = JSON.parse(d.subarray(4, 4 + n).toString('utf8'));
  const base = 4 + n;
  const ab = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
  for (const e of entete) {
    const P = new Float32Array(ab, base + e.pos, e.nv * 3);
    // Blender (x, y, z ; z en haut, face vers -y) -> appli (x, z, -y).
    e.P = new Float32Array(e.nv * 3);
    for (let i = 0; i < e.nv; i++) { e.P[i * 3] = P[i * 3]; e.P[i * 3 + 1] = P[i * 3 + 2]; e.P[i * 3 + 2] = -P[i * 3 + 1]; }
    e.T = new Uint32Array(ab.slice(base + e.tri, base + e.tri + e.nt * 12));
    e.M = new Uint8Array(ab, base + e.mat, e.nt);
  }
  return entete;
}
/* Muscle, fascia, bourse, gaine ou ligament : d'après le nom et les matériaux de Z-Anatomy. */
export function genre(e) {
  const m = new Set(e.mats.filter(Boolean)), n = e.nom.toLowerCase();
  if (/\.(j|g)$/.test(e.nom)) return 'repere';
  if (n.includes('bursa') || m.has('Bursa')) return 'bourse';
  // Un muscle a toujours un matériau de tendon et un matériau d'action (le tenseur du fascia lata est un muscle).
  const action = [...m].some(x => !['Tendon', 'Fascia', 'Ligament', 'Articular capsule', 'Cartilage', 'Text'].includes(x));
  if (m.has('Tendon') && action && !m.has('Fascia')) return 'muscle';
  if (/fascia|septum|retinaculum|aponeurosis|tract\b/.test(n) || m.has('Fascia')) return 'fascia';
  if (/sheath|ligament|capsule/.test(n) || m.has('Ligament')) return 'gaine';
  if (m.has('Tendon')) return 'tendon';
  return 'autre';
}
/* Part de tendon en chaque sommet (0 = corps du muscle, 1 = tendon), d'après le matériau des triangles voisins. */
export function tendonParSommet(e) {
  const iT = e.mats.indexOf('Tendon');
  const tot = new Float64Array(e.nv), ten = new Float64Array(e.nv);
  for (let t = 0; t < e.nt; t++) {
    const a = e.T[t * 3], b = e.T[t * 3 + 1], c = e.T[t * 3 + 2];
    const ux = e.P[b * 3] - e.P[a * 3], uy = e.P[b * 3 + 1] - e.P[a * 3 + 1], uz = e.P[b * 3 + 2] - e.P[a * 3 + 2];
    const vx = e.P[c * 3] - e.P[a * 3], vy = e.P[c * 3 + 1] - e.P[a * 3 + 1], vz = e.P[c * 3 + 2] - e.P[a * 3 + 2];
    const aire = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2 + 1e-12;
    for (const i of [a, b, c]) { tot[i] += aire; if (e.M[t] === iT) ten[i] += aire; }
  }
  return Float32Array.from(tot, (v, i) => (v ? ten[i] / v : 0));
}
/* Normales lisses (pondérées par l'aire). */
export function normales(P, T) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { N[i * 3] += nx; N[i * 3 + 1] += ny; N[i * 3 + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
