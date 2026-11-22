// Lecture d'un .glb (KHR_mesh_quantization) : chaque maillage en coordonnées du monde (transformations des nœuds appliquées).
import fs from 'fs';
const TYPES = { 5120: [Int8Array, 127], 5121: [Uint8Array, 255], 5122: [Int16Array, 32767], 5123: [Uint16Array, 65535], 5125: [Uint32Array, 0], 5126: [Float32Array, 0] };
const NB = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function lireGlb(chemin) {
  const b = fs.readFileSync(chemin);
  const jl = b.readUInt32LE(12), J = JSON.parse(b.toString('utf8', 20, 20 + jl));
  const binOff = 20 + jl + 8, bin = b.subarray(binOff, binOff + b.readUInt32LE(20 + jl));
  function acc(i) {
    const a = J.accessors[i], bv = J.bufferViews[a.bufferView], [T, max] = TYPES[a.componentType], n = NB[a.type];
    const pas = bv.byteStride || T.BYTES_PER_ELEMENT * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset);
    const get = { 5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true) }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      let v = get(base + k * pas + c * T.BYTES_PER_ELEMENT);
      if (a.normalized) v = Math.max(v / max, -1);
      out[k * n + c] = v;
    }
    return { v: out, n, entier: !a.normalized && a.componentType !== 5126 };
  }
  // matrices du monde
  const mat = (n) => {
    if (n.matrix) return n.matrix.slice();
    const [tx, ty, tz] = n.translation || [0, 0, 0], [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
    const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
    return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1];
  };
  const mul = (a, c) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * c[j * 4 + k]; return r; };
  const monde = new Array(J.nodes.length);
  const visiter = (i, M) => { const W = mul(M, mat(J.nodes[i])); monde[i] = W; for (const c of J.nodes[i].children || []) visiter(c, W); };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of J.scenes[J.scene || 0].nodes) visiter(r, I);
  const pieces = [];
  J.nodes.forEach((nd, i) => {
    if (nd.mesh == null || !monde[i]) return;
    const W = monde[i];
    for (const p of J.meshes[nd.mesh].primitives) {
      const P = acc(p.attributes.POSITION).v, nv = P.length / 3, Pw = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; for (let c = 0; c < 3; c++) Pw[v * 3 + c] = W[c] * x + W[4 + c] * y + W[8 + c] * z + W[12 + c]; }
      const T = p.indices != null ? Uint32Array.from(acc(p.indices).v) : Uint32Array.from({ length: nv }, (_, k) => k);
      const C = p.attributes.COLOR_0 != null ? acc(p.attributes.COLOR_0) : null;
      pieces.push({ nom: nd.name, extras: nd.extras || {}, materiau: J.materials?.[p.material]?.name, nv, nt: T.length / 3, P: Pw, T, couleur: C ? C.v : null, nc: C ? C.n : 0 });
    }
  });
  return { J, pieces };
}
