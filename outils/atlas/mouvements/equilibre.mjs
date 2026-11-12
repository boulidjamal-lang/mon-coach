// Contrôle d'équilibre des mouvements debout, sans moteur 3D : à chaque instant, le centre de gravité du corps (masses des
// segments d'après les tables de Dempster et Winter) est comparé à l'appui des pieds, et les jambes sont relues (genou
// verrouillé alors que la jambe bascule en arrière). Ne juge que les poses où les deux pieds sont à plat au sol et où rien
// d'autre ne porte le corps (ni banc, ni machine, ni barre fixe : mains libres ou tenant une charge).
// Usage : node equilibre.mjs --table [motif]   |   node equilibre.mjs "<spec>" …      (--tout : affiche aussi ce qui va bien)
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const ici = path.dirname(new URL(import.meta.url).pathname);
/* Part de la masse du corps portée par chaque segment, et place de son centre le long du segment (depuis le haut). */
const MASSES = { tete: 0.081, tronc: 0.497, bras: 0.028, avantBras: 0.016, main: 0.006, cuisse: 0.1, jambe: 0.0465, pied: 0.0145 };
export function centreDeGravite(info) {
  let m = 0, x = 0, y = 0, z = 0;
  const ajouter = (p, masse) => { m += masse; x += p.x * masse; y += p.y * masse; z += p.z * masse; };
  const entre = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  const milieu = (a, b) => entre(a, b, 0.5);
  const hanches = milieu(info.hanches.G, info.hanches.D), epaules = milieu(info.epaules.G, info.epaules.D);
  ajouter(entre(hanches, epaules, 0.5), MASSES.tronc);
  // La tête et le cou : du haut du cou vers le sommet du crâne (l'articulation de la tête est à sa base).
  ajouter(entre(info.cou, info.tete, 1.45), MASSES.tete);
  for (const k of ['G', 'D']) {
    ajouter(entre(info.epaules[k], info.coudes[k], 0.436), MASSES.bras);
    ajouter(entre(info.coudes[k], info.poignets[k], 0.43), MASSES.avantBras);
    ajouter(info.prises[k], MASSES.main);
    ajouter(entre(info.hanches[k], info.genoux[k], 0.433), MASSES.cuisse);
    ajouter(entre(info.genoux[k], info.chevilles[k], 0.433), MASSES.jambe);
    ajouter(milieu(info.chevilles[k], info.orteils[k]), MASSES.pied);
  }
  return { x: x / m, y: y / m, z: z / m };
}
/* Ce qu'on lit d'une pose debout : où tombe le centre de gravité par rapport à l'appui (0 = talon, 1 = bout des orteils),
   le genou, l'inclinaison du tibia. charge : masse tenue dans les mains, en part de la masse du corps. */
export function lireAppui(c, info, charge) {
  const L = c.L, k = 'G';
  const pose = ['G', 'D'].every(s => Math.abs(info.chevilles[s].y - L.chevilleH) < 0.025 && info.orteils[s].y < L.orteilsH + 0.03);
  const g = centreDeGravite(info);
  const mains = { z: (info.prises.G.z + info.prises.D.z) / 2 };
  const zG = (g.z + charge * mains.z) / (1 + charge);
  // L'appui, dans l'axe avant-arrière : du talon (6 cm derrière la cheville) au bout des orteils (6 cm devant leur articulation).
  const talon = Math.min(info.chevilles.G.z, info.chevilles.D.z) - 0.06, pointe = Math.max(info.orteils.G.z, info.orteils.D.z) + 0.06;
  const h = info.hanches[k], ge = info.genoux[k], ch = info.chevilles[k];
  const a = { x: h.x - ge.x, y: h.y - ge.y, z: h.z - ge.z }, b = { x: ch.x - ge.x, y: ch.y - ge.y, z: ch.z - ge.z };
  const genou = Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / Math.hypot(a.x, a.y, a.z) / Math.hypot(b.x, b.y, b.z)))) * 180 / Math.PI;
  const tibia = Math.atan2(ge.z - ch.z, ge.y - ch.y) * 180 / Math.PI;
  return { pose, place: (zG - talon) / (pointe - talon), placeSansCharge: (g.z - talon) / (pointe - talon), genou, tibia, zG, talon, pointe };
}
/* Le corps est-il porté par du matériel ? Une forme posée dont le dessus arrive juste sous les hanches (assise, banc) ou
   sous le dos (dossier, banc couché), à leur aplomb. Les marches et plateaux bas ne comptent pas : on s'y tient debout. */
export function porte(formes, info) {
  const sous = pt => formes.some(f => {
    if (f.hors || !f.s) return false;
    const [qx, qy, qz, qw] = f.q, d = f.forme === 'boite' ? [f.s[0] / 2, f.s[1] / 2, f.s[2] / 2] : f.forme === 'cylindre' || f.forme === 'hexa' ? [f.s[0], f.s[1] / 2, f.s[2]] : [f.s[0], f.s[1], f.s[2]];
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 8; k++) {
      const vx = k & 1 ? d[0] : -d[0], vy = k & 2 ? d[1] : -d[1], vz = k & 4 ? d[2] : -d[2];
      // v tourné par le quaternion q
      const ix = qw * vx + qy * vz - qz * vy, iy = qw * vy + qz * vx - qx * vz, iz = qw * vz + qx * vy - qy * vx, iw = -qx * vx - qy * vy - qz * vz;
      const X = ix * qw + iw * -qx + iy * -qz - iz * -qy + f.p[0], Y = iy * qw + iw * -qy + iz * -qx - ix * -qz + f.p[1], Z = iz * qw + iw * -qz + ix * -qy - iy * -qx + f.p[2];
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
    }
    return y1 > 0.2 && y1 > pt.y - 0.3 && y1 < pt.y + 0.06 && pt.x > x0 - 0.12 && pt.x < x1 + 0.12 && pt.z > z0 - 0.12 && pt.z < z1 + 0.12 && (x1 - x0) > 0.12 && (z1 - z0) > 0.12;
  });
  const m = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  return sous(m(info.hanches.G, info.hanches.D)) || sous(m(info.epaules.G, info.epaules.D));
}
// Appuis que la pose seule ne montre pas : dos ou mains contre un mur, un cadre de porte, un coussin de machine, pieds tenus.
export const APPUYES = [/^squat mur/, /^mollets tibial/, /^etire (pectoraux porte|chienbas debout)/, /^souleve extension/, /^planche crabe/, /^jambes curl nordique/];
/* Juge un mouvement : rend { juge : nombre d'instants jugés debout, notes : ce qui ne va pas (ou tout, si `tout`) }.
   Hors d'appui : le centre de gravité tombe en dehors des pieds quelle que soit la charge tenue. */
export function jugerSpec(M, corps, C, spec, tout) {
  const d = M.definir(spec, corps, C);
  // Charge tenue : on ne sait pas ce qu'elle pèse. Une pose n'est jugée hors d'appui que si elle l'est quelle que soit
  // la charge, de rien à une fois le poids du corps (une barre lourde ramène le centre de gravité vers les mains).
  const tenu = (d.tenu || []).map(e => e.t), libre = tenu.some(t => ['barre', 'haltere', 'kb', 'disque', 'balle'].includes(t)) || !!d.objets;
  const charges = libre ? [0, 0.25, 0.5, 1] : [0];
  // Un câble, un élastique, une sangle ou un levier tirent autrement que vers le bas : l'équilibre ne se lit pas ainsi.
  const tire = tenu.some(t => ['cable', 'elastique', 'sangle', 'levier', 'poignee'].includes(t));
  const instants = d.rythme === 'continu' || d.rythme === 'boucle' ? [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95] : [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const notes = []; let juge = 0;
  for (const u of instants) {
    let info; try { info = corps.poser(M.poseA(d, 0, u)); } catch (e) { continue; }
    const lus = charges.map(ch => lireAppui(corps, info, ch)), a = lus[0];
    // Debout pour de bon : les deux pieds à plat, côte à côte (pas en fente), ni à genoux ni les épaules au sol, les
    // mains ne portant pas le corps, rien sous le bassin ni le dos.
    const fendu = Math.abs(info.chevilles.G.z - info.chevilles.D.z) > 0.2, auSol = Math.min(info.genoux.G.y, info.genoux.D.y) < 0.2 || info.epaules.G.y < 0.5 || (!libre && Math.min(info.prises.G.y, info.prises.D.y) < 0.12);
    if (!a.pose || fendu || auSol || info.hanches.G.y < 0.42 || porte(M.materielDe(d, info, u, C, {}), info)) continue;
    juge++;
    // La charge qui équilibre le mieux ; hors d'appui seulement si aucune ne ramène le centre de gravité sur les pieds.
    const mieux = lus.reduce((m, x) => (Math.abs(x.place - 0.5) < Math.abs(m.place - 0.5) ? x : m));
    const dehors = tire ? null : mieux.place < -0.05 ? `centre de gravité ${Math.round((mieux.talon - mieux.zG) * 100)} cm derrière les talons` : mieux.place > 1.05 ? `centre de gravité ${Math.round((mieux.zG - mieux.pointe) * 100)} cm devant les orteils` : null;
    // Jambes tendues qui partent en arrière : au-delà de 16°, ou dès 12° si la pose n'est pas tenue par l'équilibre.
    const bascule = a.genou > 172 && (a.tibia < -16 || (a.tibia < -12 && (mieux.place < 0.15 || mieux.place > 0.9))) ? `jambes verrouillées basculées de ${Math.round(-a.tibia)}° en arrière` : null;
    if (dehors || bascule || tout) notes.push(`u=${u} : ${[dehors, bascule].filter(Boolean).join(' ; ') || 'bien'} (appui ${lus.map(x => x.place.toFixed(2)).join(' / ')}, genou ${Math.round(a.genou)}°, tibia ${Math.round(a.tibia)}°)`);
  }
  return { juge, notes, libre, tire };
}
const estLance = !!process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (estLance) {
  const args = process.argv.slice(2), tout = args.includes('--tout'), table = args.includes('--table');
  const reste = args.filter(a => !a.startsWith('--'));
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS);
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair;
  let specs;
  if (table) {
    const lignes = fs.readFileSync(path.join(ici, 'table.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|').map(x => x.trim()));
    const motif = reste[0] ? new RegExp(reste[0]) : null;
    specs = [...new Set(lignes.map(l => l[1]).filter(spec => spec && spec !== '?' && (!motif || motif.test(spec))))];
  } else specs = reste;
  let nb = 0, pb = 0;
  for (const spec of specs) {
    if (table && APPUYES.some(r => r.test(spec))) continue;
    let r; try { r = jugerSpec(M, corps, C, spec, tout); } catch (e) { console.log(spec, '→ erreur', e.message); continue; }
    if (!r.juge) continue;
    nb++;
    if (r.notes.length) { if (!tout) pb++; console.log(spec + (r.libre ? '  [charge 0 / 0,25 / 0,5 / 1]' : '') + (r.tire ? '  [tiré : équilibre non jugé]' : '')); for (const n of r.notes) console.log('    ' + n); }
  }
  console.log(`${nb} mouvements debout jugés${tout ? '' : `, ${pb} à revoir`}`);
}
