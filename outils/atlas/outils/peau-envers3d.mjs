// Sonde : triangles de la peau dont l'envers est visible du dehors (un rayon parti de leur envers s'échappe sans rien toucher).
// Usage : node outils/peau-envers3d.mjs [atlas-peau.bin]
import fs from 'fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
const f = process.argv[2] || 'peau/atlas-peau.bin';
const d = fs.readFileSync(f), lg = d.readUInt32LE(8), H = JSON.parse(d.subarray(12, 12 + lg).toString('utf8'));
const base = 12 + lg, ns = H.sommets, O = H.octetsParSommet, iBase = base + ns * O;
const P = new Float32Array(ns * 6), zone = new Uint8Array(ns);
for (let i = 0; i < ns; i++) { for (let k = 0; k < 3; k++) P[i * 3 + k] = H.boite.min[k] + d.readUInt16LE(base + i * O + k * 2) / 65535 * H.boite.etendue[k]; zone[i] = d[base + i * O + 10]; P[(ns + i) * 3] = -P[i * 3]; P[(ns + i) * 3 + 1] = P[i * 3 + 1]; P[(ns + i) * 3 + 2] = P[i * 3 + 2]; }
const nt = H.trianglesPairs, T0 = [];
for (let t = 0; t < nt; t++) { const a = d.readUInt16LE(iBase + t * 6), b = d.readUInt16LE(iBase + t * 6 + 2), c = d.readUInt16LE(iBase + t * 6 + 4); if (zone[a] <= 3) T0.push(a, b, c); }
const n0 = T0.length / 3; for (let t = 0; t < n0; t++) T0.push(ns + T0[t * 3], ns + T0[t * 3 + 2], ns + T0[t * 3 + 1]);
const T = Uint32Array.from(T0), Tref = Uint32Array.from(T0);
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(new THREE.BufferAttribute(T, 1));
const bvh = new MeshBVH(g), ray = new THREE.Ray(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), G = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
const R = 48, exposes = [];
for (let t = 0; t < n0; t++) {
  A.fromArray(P, Tref[t * 3] * 3); B.fromArray(P, Tref[t * 3 + 1] * 3); C.fromArray(P, Tref[t * 3 + 2] * 3);
  N.subVectors(B, A).cross(u.subVectors(C, A)); const aire = N.length() / 2; if (aire < 1e-10) continue; N.normalize();
  G.copy(A).add(B).add(C).multiplyScalar(1 / 3);
  u.set(Math.abs(N.x) > 0.8 ? 0 : 1, Math.abs(N.x) > 0.8 ? 1 : 0, 0).cross(N).normalize(); v.crossVectors(N, u);
  let libres = 0;
  for (let k = 0; k < R; k++) {
    const a = 2 * Math.PI * ((k * 0.618034) % 1), r = Math.sqrt((k + 0.5) / R), h = Math.sqrt(1 - r * r);
    ray.direction.set(0, 0, 0).addScaledVector(u, r * Math.cos(a)).addScaledVector(v, r * Math.sin(a)).addScaledVector(N, -h).normalize();
    ray.origin.copy(G).addScaledVector(N, -0.0002);
    if (!bvh.raycastFirst(ray, THREE.DoubleSide)) libres++;
  }
  if (libres) exposes.push({ t, libres, y: G.y, x: G.x, z: G.z, zone: zone[Tref[t * 3]], aire });
}
console.log(f, ':', n0, 'triangles de peau ;', exposes.length, 'montrent leur envers au dehors');
const ou = new Map();
for (const e of exposes) { const k = H.zones[e.zone] + ' y≈' + (Math.round(e.y * 10) / 10).toFixed(1) + ' x≈' + (Math.round(e.x * 10) / 10).toFixed(1) + ' z' + (e.z > 0 ? '+' : '-'); const o = ou.get(k) || ou.set(k, { n: 0, libres: 0 }).get(k); o.n++; o.libres += e.libres; }
console.log([...ou].sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([k, o]) => o.n + ' × ' + k + ' (rayons libres ' + o.libres + ')').join('\n'));
if (process.env.DETAIL) for (const e of exposes.filter(e => e.zone === 0).slice(0, 40)) console.log(e.t, e.libres, e.x.toFixed(4), e.y.toFixed(4), e.z.toFixed(4), 'aire mm²', (e.aire * 1e6).toFixed(2));
