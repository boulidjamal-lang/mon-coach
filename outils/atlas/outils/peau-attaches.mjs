// Sonde : attaches de la peau en quelques points (les plus proches sommets d'un point donné). Usage : node outils/peau-attaches.mjs x,y,z [x,y,z…]
import fs from 'fs';
const f = process.env.PEAU || 'peau/atlas-peau.bin', d = fs.readFileSync(f), lg = d.readUInt32LE(8), H = JSON.parse(d.subarray(12, 12 + lg).toString('utf8'));
const a = fs.readFileSync('donnees/atlas.bin'), E = JSON.parse(a.subarray(12, 12 + a.readUInt32LE(8)).toString('utf8'));
const NJ = H.articulations, NX = H.intermediaires.length;
const nom = j => j < NJ ? E.squelette[j].nom : (() => { const k = (j - NJ) % NX, c = j - NJ >= NX ? 'D' : 'G', x = H.intermediaires[k]; const jn = n => c === 'D' ? E.squelette[E.squelette[n].jumeau].nom : E.squelette[n].nom; return `${jn(x.de)}→${jn(x.vers)}@${x.part}`; })();
const base = 12 + lg, ns = H.sommets, O = H.octetsParSommet;
const pos = i => [0, 1, 2].map(k => H.boite.min[k] + d.readUInt16LE(base + i * O + k * 2) / 65535 * H.boite.etendue[k]);
for (const txt of process.argv.slice(2)) {
  const c = txt.split(',').map(Number); let best = [];
  for (let i = 0; i < ns; i++) { if (d[base + i * O + 10] > 3) continue; const p = pos(i); best.push([Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]), i]); }
  best.sort((p, q) => p[0] - q[0]);
  for (const [dist, i] of best.slice(0, 2)) { const p = pos(i); console.log(txt, '→', p.map(v => v.toFixed(3)).join(' '), `(${(dist * 1000).toFixed(0)} mm)`, 'zone', H.zones[d[base + i * O + 10]], '|', [0, 1, 2, 3].map(k => [d[base + i * O + 12 + k], d[base + i * O + 16 + k]]).filter(x => x[1]).map(([j, w]) => `${nom(j)} ${(w / 255).toFixed(2)}`).join(', ')); }
}
