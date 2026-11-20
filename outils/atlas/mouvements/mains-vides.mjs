// Une main refermée tient-elle quelque chose ? Pour chaque mouvement qui a du matériel, à cinq instants : la distance
// entre le creux de chaque main fermée (doigts « barre ») et la forme de matériel la plus proche. Une main fermée sur
// rien, loin de tout (plus de SEUIL), est signalée : le matériel n'est pas là où la main le tient, ou le geste n'est
// pas celui de l'exercice (un développé landmine décrit comme un développé couché : les mains écartées, la barre au
// milieu). Ne juge pas les mouvements sans matériel (poing fermé au poids du corps).
// Usage : node mains-vides.mjs "<spec>" …   |   --table [motif]   ;   SEUIL=0.06 (m)
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const ici = path.dirname(new URL(import.meta.url).pathname), SEUIL = +(process.env.SEUIL || 0.06);
// Poings fermés sur rien, mais voulus : les bras rythment un saut, les mains se joignent devant la poitrine (rotation
// assise, squat zercher : la barre est au creux des coudes), ou le geste se fait à vide sur un banc.
export const ADMIS = /^(saut boite\b|squat (barre|smith) zercher$|rotation assis$|elevation arriere t .*\bpc$)/;
/* Distance d'un point à une forme (0 dedans). */
function distance(f, x, y, z) {
  const vx = x - f.p[0], vy = y - f.p[1], vz = z - f.p[2], qx = -f.q[0], qy = -f.q[1], qz = -f.q[2], qw = f.q[3], s = f.s;
  const tx = qy * vz - qz * vy + qw * vx, ty = qz * vx - qx * vz + qw * vy, tz = qx * vy - qy * vx + qw * vz;
  const lx = vx + 2 * (qy * tz - qz * ty), ly = vy + 2 * (qz * tx - qx * tz), lz = vz + 2 * (qx * ty - qy * tx);
  let d;
  if (f.forme === 'boite') { const ax = Math.abs(lx) - s[0] / 2, ay = Math.abs(ly) - s[1] / 2, az = Math.abs(lz) - s[2] / 2; d = Math.hypot(Math.max(ax, 0), Math.max(ay, 0), Math.max(az, 0)) + Math.min(Math.max(ax, ay, az), 0); }
  else if (f.forme === 'cylindre' || f.forme === 'hexa') { const dr = Math.hypot(lx, lz) - s[0], dy = Math.abs(ly) - s[1] / 2; d = Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) + Math.min(Math.max(dr, dy), 0); }
  else if (f.forme === 'sphere') d = Math.hypot(lx, ly, lz) - s[0];
  else if (f.forme === 'tore' || ly >= 0) d = Math.hypot(Math.hypot(lx, ly) - s[0], lz) - (f.r || 0);
  else d = Math.min(Math.hypot(lx - s[0], ly, lz), Math.hypot(lx + s[0], ly, lz)) - (f.r || 0);
  return Math.max(0, d);
}
export function mainsVides(M, corps, C, spec) {
  let d;
  try { d = M.definir(spec, corps, C); } catch (e) { return { erreur: String(e.message).slice(0, 160) }; }
  const continu = d.rythme === 'continu' || d.rythme === 'boucle', fautes = [];
  let materiel = false;
  for (const u of continu ? [0.02, 0.26, 0.5, 0.74, 0.96] : [0, 0.25, 0.5, 0.75, 1]) {
    const pose = M.poseA(d, 0, u), info = corps.poser(pose), formes = M.materielDe(d, info, u, C, {});
    if (formes.length) materiel = true; else continue;
    for (const k of ['G', 'D']) {
      if (pose.bras[k].doigts !== 'barre') continue;
      const p = info.prises[k]; let m = Infinity;
      for (const f of formes) { const x = distance(f, p.x, p.y, p.z); if (x < m) m = x; }
      if (m > SEUIL) fautes.push({ u, k, d: m });
    }
  }
  return { materiel, fautes };
}
function principal() {
  const args = process.argv.slice(2);
  let specs = [], titres = {};
  if (args[0] === '--table') {
    const motif = args[1] ? new RegExp(args[1], 'i') : null;
    for (const l of fs.readFileSync(path.join(ici, 'table.txt'), 'utf8').split('\n')) {
      if (!l.trim() || l.startsWith('#')) continue;
      const [id, spec, nom] = l.split('|').map(x => x.trim());
      if (!spec || spec === '?' || (motif && !motif.test(l))) continue;
      if (!titres[spec]) { titres[spec] = id + ' ' + nom; specs.push(spec); }
    }
  } else specs = args;
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS);
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair;
  let n = 0, juges = 0;
  for (const spec of specs) {
    const r = mainsVides(M, corps, C, spec);
    if (r.erreur) { console.log(spec.padEnd(44), '→ erreur :', r.erreur); continue; }
    if (!r.materiel || ADMIS.test(spec)) continue;
    juges++;
    if (!r.fautes.length) continue;
    n++;
    const pire = {}; for (const f of r.fautes) if (!pire[f.k] || f.d > pire[f.k].d) pire[f.k] = f;
    console.log(spec.padEnd(44), (titres[spec] || '').slice(0, 44).padEnd(44), Object.values(pire).map(f => `main ${f.k} à ${(f.d * 100).toFixed(0)} cm de tout (u=${f.u})`).join(', '));
  }
  console.log(`${juges} mouvements avec matériel jugés, ${n} où une main fermée ne tient rien`);
}
if (process.argv[1] && path.basename(process.argv[1]) === 'mains-vides.mjs') principal();
