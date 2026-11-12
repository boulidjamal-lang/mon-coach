// Le corps traverse-t-il le matériel ? Chaque mouvement est posé à sept instants ; les points du corps (muscles, tendons,
// os : un sommet sur PAS, des deux côtés, posés comme le moteur les pose) sont cherchés à l'intérieur de chaque forme du
// matériel. Pour chaque forme touchée : la profondeur atteinte, le nombre de points, ceux qui appartiennent à des
// structures profondes (couches 3 et 4, os : la forme est entrée loin dans le corps), et les parties du corps concernées.
// Les contacts voulus ne sont pas des fautes : main sur sa poignée, pied sur son appui, chair qui s'enfonce dans un
// coussin, sangle ou élastique posés sur la peau — voir `juger`.
// Usage : node traversees.mjs "<spec>" …   |   --table [motif]   ;   --json fichier : tout le relevé ; --tout : même les contacts admis
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const ici = path.dirname(new URL(import.meta.url).pathname);
const PAS = +(process.env.PAS || 3);

const partie = nom => {
  const b = nom.replace(/\.[GD]$/, '');
  if (/^doigt/.test(b) || b === 'main') return 'main';
  if (b === 'pied' || b === 'orteils') return 'pied';
  if (b === 'ulna' || b === 'radius') return 'avant-bras';
  if (b === 'humerus') return 'bras';
  if (b === 'clavicule') return 'épaule';
  if (b === 'femur') return 'cuisse';
  if (b === 'tibia') return 'jambe';
  if (b === 'tete' || /^cou/.test(b)) return 'tête';
  if (/^L\d/.test(b)) return 'ventre';
  return b;   // bassin, thorax
};
/* Les points du corps suivis par le crible, avec pour chacun sa partie du corps et la profondeur de sa structure. */
export function preparerCrible(atlas, corps) {
  const E = atlas.E, ech = atlas.points(PAS), n = ech.n;
  const parties = [], rang = {}, part = new Uint8Array(n), couche = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let jm = 0, wm = -1;
    for (let k = 0; k < 4; k++) if (ech.W[i * 4 + k] > wm) { wm = ech.W[i * 4 + k]; jm = ech.J[i * 4 + k]; }
    const nom = partie(E.squelette[jm].nom);
    if (rang[nom] == null) { rang[nom] = parties.length; parties.push(nom); }
    part[i] = rang[nom];
    const st = ech.structure[i];
    couche[i] = st < E.structures.length ? E.structures[st].couche : 9;
  }
  corps.peaux.crible = ech;
  return { n, part, couche, parties, X: new Float32Array(2 * n * 3) };
}
const classeDe = (couleur, C) => { for (const k in C) if (C[k][0] === couleur[0] && C[k][1] === couleur[1] && C[k][2] === couleur[2]) return k; return 'autre'; };
function preparerForme(f, C) {
  const s = f.s, r = f.r || 0;
  let epais, englobe;
  if (f.forme === 'boite') { epais = Math.min(s[0], s[1], s[2]) / 2; englobe = Math.hypot(s[0], s[1], s[2]) / 2; }
  else if (f.forme === 'cylindre' || f.forme === 'hexa') { epais = Math.min(s[0], s[1] / 2); englobe = Math.hypot(s[0], s[1] / 2); }
  else if (f.forme === 'sphere') { epais = s[0]; englobe = s[0]; }
  else { epais = r; englobe = s[0] + r; }
  return { forme: f.forme, qx: -f.q[0], qy: -f.q[1], qz: -f.q[2], qw: f.q[3], px: f.p[0], py: f.p[1], pz: f.p[2], s, r, epais, englobe, classe: classeDe(f.couleur, C) };
}
/* Distance signée d'un point à une forme (négative : dedans), dans le repère de la forme. */
function distance(F, x, y, z) {
  const vx = x - F.px, vy = y - F.py, vz = z - F.pz, { qx, qy, qz, qw, s } = F;
  const tx = qy * vz - qz * vy + qw * vx, ty = qz * vx - qx * vz + qw * vy, tz = qx * vy - qy * vx + qw * vz;
  const lx = vx + 2 * (qy * tz - qz * ty), ly = vy + 2 * (qz * tx - qx * tz), lz = vz + 2 * (qx * ty - qy * tx);
  if (F.forme === 'boite') {
    const r = Math.min(F.r, F.epais), ax = Math.abs(lx) - s[0] / 2 + r, ay = Math.abs(ly) - s[1] / 2 + r, az = Math.abs(lz) - s[2] / 2 + r;
    return Math.hypot(Math.max(ax, 0), Math.max(ay, 0), Math.max(az, 0)) + Math.min(Math.max(ax, ay, az), 0) - r;
  }
  if (F.forme === 'cylindre' || F.forme === 'hexa') {
    const dr = Math.hypot(lx, lz) - s[0] * (F.forme === 'hexa' ? 0.93 : 1), dy = Math.abs(ly) - s[1] / 2;
    return Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) + Math.min(Math.max(dr, dy), 0);
  }
  if (F.forme === 'sphere') return Math.hypot(lx, ly, lz) - s[0];
  if (F.forme === 'tore' || ly >= 0) return Math.hypot(Math.hypot(lx, ly) - s[0], lz) - F.r;
  return Math.min(Math.hypot(lx - s[0], ly, lz), Math.hypot(lx + s[0], ly, lz)) - F.r;   // demi-anneau : ses deux bouts
}
/* Relevé brut d'un mouvement : pour chaque forme et chaque instant où des points du corps sont dedans (de plus de 3 mm). */
export function releverSpec(M, corps, C, K, spec) {
  let d;
  try { d = M.definir(spec, corps, C); } catch (e) { return { erreur: String(e.message).slice(0, 160) }; }
  const continu = d.rythme === 'continu' || d.rythme === 'boucle';
  const instants = continu ? [0.02, 0.18, 0.34, 0.5, 0.66, 0.82, 0.96] : [0, 1 / 6, 2 / 6, 0.5, 4 / 6, 5 / 6, 1];
  const { n, X } = K, releve = [], modeles = {};
  corps.appuis = d.appuis || null;   // la chair écrasée contre les coussins, comme le moteur la dessine
  for (const u of instants) {
    let formes;
    try { const info = corps.poser(M.poseA(d, 0, u)); formes = M.materielDe(d, info, u, C, modeles); } catch (e) { return { erreur: 'u=' + u + ' : ' + String(e.message).slice(0, 160) }; }
    let i = 0; corps.peauPosee(['crible'], (x, y, z) => { X[i++] = x; X[i++] = y; X[i++] = z; });
    for (let k = 0; k < formes.length; k++) {
      const F = preparerForme(formes[k], C), R = F.englobe;
      const x0 = F.px - R, x1 = F.px + R, y0 = F.py - R, y1 = F.py + R, z0 = F.pz - R, z1 = F.pz + R;
      let prof = 0, nb = 0, profonds = 0, parts = null;
      for (let j = 0, o = 0; j < 2 * n; j++, o += 3) {
        const x = X[o]; if (x < x0 || x > x1) continue;
        const y = X[o + 1]; if (y < y0 || y > y1) continue;
        const z = X[o + 2]; if (z < z0 || z > z1) continue;
        const dist = distance(F, x, y, z); if (dist > -0.003) continue;
        const v = j < n ? j : j - n, nom = K.parties[K.part[v]] + (j < n ? ' G' : ' D');
        nb++; if (K.couche[v] >= 3) profonds++;
        parts = parts || {}; const e = parts[nom] || (parts[nom] = { n: 0, prof: 0 }); e.n++; if (-dist > e.prof) e.prof = -dist;
        if (-dist > prof) prof = -dist;
      }
      if (nb) releve.push({ u: +u.toFixed(3), k, tenu: k >= d.fixe.length ? 1 : 0, forme: F.forme, classe: F.classe, s: F.s.map(x => +x.toFixed(3)), p: [F.px, F.py, F.pz].map(x => +x.toFixed(3)), epais: +F.epais.toFixed(4), prof: +prof.toFixed(4), nb, profonds, parts });
    }
  }
  return { releve, formes: null };
}
/* Ce qui est une faute dans un relevé. Renvoie { exces (m, au-delà de l'admis), fautes } ou null.
   – main : elle entoure ce qu'elle tient ; faute seulement si elle traverse un objet épais (3 cm dedans). Les tendons
     des fléchisseurs des doigts, qui courent de l'avant-bras jusque dans la paume, comptent avec la main qui serre.
   – pied : posé sur son appui ; faute au-delà de 2,5 cm.
   – coussin, tapis, ballon : la chair s'y enfonce (les postures l'y posent, les appuis l'y écrasent) ; faute au-delà
     de 2,2 cm.
   – câble, élastique, sangle (fins, souples) : posés sur la peau ; jamais une faute ici.
   – le reste (acier, fonte, bois) : faute au-delà de 1,2 cm ; une forme fine (barre, tube) ne peut pas montrer cette
     profondeur : faute si elle est noyée aux trois quarts dans la chair, sur quatre points au moins.
   (Le nombre de points de structures profondes est gardé dans le relevé, pour information : sous la main, sur les
   côtes ou le tibia, l'os affleure, et sa présence dans une forme ne dit rien.) */
export function juger(e) {
  const fautes = [];
  for (const nom in e.parts) {
    const p = e.parts[nom], [quoi, cote] = nom.split(' ');
    let admis = 0.012;
    if (quoi === 'main' || (quoi === 'avant-bras' && e.parts['main ' + cote])) admis = 0.03; else if (quoi === 'pied') admis = 0.025;
    else if (e.classe === 'banc' || e.classe === 'tapis' || e.classe === 'ballon') admis = 0.022;
    else if (e.classe === 'cable' || e.classe === 'elastique' || e.classe === 'sangle') admis = Infinity;
    if (p.prof > admis) fautes.push({ nom, exces: p.prof - admis, prof: p.prof, n: p.n });
    else if (admis === 0.012 && e.epais < 0.02 && p.prof > 0.75 * e.epais && p.n >= 4) fautes.push({ nom, exces: 0.004, prof: p.prof, n: p.n, fin: true });
  }
  if (!fautes.length) return null;
  fautes.sort((a, b) => b.exces - a.exces);
  return { exces: fautes[0].exces, fautes };
}
const dire = e => `${e.forme} ${e.classe}${e.tenu ? ' (tenu)' : ''} ${e.s.map(x => Math.round(x * 100)).join('×')} cm en (${e.p.map(x => Math.round(x * 100)).join(', ')})`;
/* Le bilan d'un mouvement : ses fautes, la pire d'abord (une ligne par forme : son pire instant). */
export function bilanSpec(releve) {
  const parForme = {};
  for (const e of releve) {
    const j = juger(e); if (!j) continue;
    const cle = e.k + '|' + e.forme + '|' + e.s.join(',');
    if (!parForme[cle] || j.exces > parForme[cle].j.exces) parForme[cle] = { e, j, instants: (parForme[cle] ? parForme[cle].instants : 0) + 1 }; else parForme[cle].instants++;
  }
  return Object.values(parForme).sort((a, b) => b.j.exces - a.j.exces);
}
function principal() {
  const args = process.argv.slice(2);
  const iJson = args.indexOf('--json'), json = iJson >= 0 ? args.splice(iJson, 2)[1] : null;
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
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair, K = preparerCrible(atlas, corps);
  const tout = {}, lignes = [];
  let fautifs = 0;
  for (const spec of specs) {
    const r = releverSpec(M, corps, C, K, spec);
    if (r.erreur) { console.log(spec.padEnd(44), '→ erreur :', r.erreur); continue; }
    tout[spec] = r.releve;
    const b = bilanSpec(r.releve);
    if (b.length) { fautifs++; lignes.push({ spec, pire: b[0].j.exces, b }); }
  }
  lignes.sort((a, b) => b.pire - a.pire);
  for (const l of lignes) {
    console.log(`${l.spec.padEnd(44)} ${(titres[l.spec] || '').slice(0, 40)}`);
    for (const x of l.b.slice(0, 4)) console.log(`     ${x.j.fautes.slice(0, 3).map(f => `${f.nom} ${(f.prof * 100).toFixed(1)} cm${f.profond ? ' (structures profondes)' : f.fin ? ' (forme fine noyée)' : ''} ×${f.n}`).join(', ')}  dans  ${dire(x.e)}  u=${x.e.u}  (${x.instants} instant${x.instants > 1 ? 's' : ''})`);
  }
  console.log(`${specs.length} mouvements passés au crible, ${fautifs} où le corps traverse le matériel`);
  if (json) fs.writeFileSync(json, JSON.stringify({ pas: PAS, releve: tout, titres }));
}
if (process.argv[1] && path.basename(process.argv[1]) === 'traversees.mjs') principal();
