// Les poignets tiennent-ils dans leurs limites ? À neuf instants de chaque mouvement, pour chaque main : la flexion ou
// l'extension du poignet (la main qui casse vers la paume ou vers le dos), son inclinaison (vers le pouce ou le petit
// doigt) et sa torsion — ce que le poignet tourne à la place de l'avant-bras quand la pronation est en butée. Les
// angles se mesurent entre l'os de l'avant-bras, tel qu'il est posé, et la main.
// Le solveur du bras (Corps.bras) place le coude pour que le poignet reste dans ses limites ; ce contrôle dit où il n'y
// parvient pas : la pose décrite est alors à revoir (coude du mauvais côté, main trop près de l'épaule, prise mal
// tournée). Quelques gestes dépassent pour de bon ces limites — ADMIS les nomme, avec ce qu'on leur accorde.
// Usage : node poignets.mjs "<spec>" …   |   --table [motif]   ;   DETAIL=1 (chaque instant)   ;   JSON=fichier
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const ici = path.dirname(new URL(import.meta.url).pathname), DEG = 180 / Math.PI;
/* Au-delà, le poignet est hors limites (degrés). */
export const LIMITES = { flex: 85, ext: 95, incl: 45, tors: 20 };
/* Les gestes qui dépassent ces limites dans la réalité aussi, et jusqu'où on l'admet. */
export const ADMIS = [
  // Mains à plat sous le corps, épaules en avant des mains ou coudes loin derrière : le poignet casse au-delà de l'équerre.
  [/^(pompe (planche|equilibre|pseudo|inverse|cobra|pike banc|pike entre)|gym planche penchee|etire (chatvache|rouleau fessiers)|abdos genoux)$/, { ext: 112 }],
  // Pompes mains jointes sous le sternum, ou sur un bras : en bas, l'avant-bras ne peut plus tourner assez.
  [/^pompe ((decline |genoux )?diamant|unbras)$/, { tors: 43 }],
  // Mains derrière la tête : la main épouse le crâne, le poignet cassé et incliné.
  [/^(abdos (situp( decline torsion)?|ballon)|etire rotationdos)$/, { ext: 108, incl: 70 }],
  // Deux mains l'une au-dessus de l'autre sur le bout d'une barre inclinée : les poignets s'inclinent.
  [/^(developpe epaules landmine debout|rotation landmine)$/, { incl: 62 }],
  // Traction mains serrées, menton au-dessus de la barre : l'avant-bras est au bout de sa pronation.
  [/^traction serre$/, { tors: 30 }]
];
/* Les angles d'un poignet posé : fe (flexion > 0, extension < 0), incl, tors, et la pronation, le coude, le tour. */
export function mesurerPoignet(corps, info, k) {
  const d2 = corps.R[k].bras.d2.clone().applyQuaternion(corps.qMonde('ulna.' + k)).normalize(), dm = info.dirMains[k], pa = info.paumes[k], ax = info.axes[k];
  const fe = Math.atan2(-d2.dot(pa), d2.dot(dm)) * DEG, incl = Math.asin(Math.max(-1, Math.min(1, d2.dot(ax)))) * DEG;
  const qr = corps.qMonde('main.' + k).multiply(corps.qMonde('radius.' + k).invert());
  let t = 2 * Math.atan2(qr.x * d2.x + qr.y * d2.y + qr.z * d2.z, qr.w) * DEG; if (t > 180) t -= 360; if (t < -180) t += 360;
  return { fe, incl, tors: t, pron: info.angles[k].pronation, coude: info.angles[k].coude, tour: info.angles[k].tour || 0 };
}
/* Le pire de chaque angle sur le mouvement : { pire: { flex, ext, incl, tors }, ou: { … } }. */
export function poignets(M, corps, C, spec, detail) {
  let d;
  try { d = M.definir(spec, corps, C); } catch (e) { return { erreur: String(e.message).slice(0, 160) }; }
  const continu = d.rythme === 'continu' || d.rythme === 'boucle', pire = { flex: 0, ext: 0, incl: 0, tors: 0 }, ou = {};
  for (let n = 0; n <= 8; n++) {
    const u = continu ? n / 9 : n / 8, pose = M.poseA(d, 0, u), info = corps.poser(pose);
    for (const k of ['G', 'D']) {
      const r = mesurerPoignet(corps, info, k), b = pose.bras[k];
      const sorte = (b.parAngles ? 'angles' : b.prise ? 'cible' : b.dirBras ? 'directions' : 'angles') + (b.dg ? ', dégagé' : '') + ', ' + (b.doigts || 'detendu');
      if (detail) detail(`${spec} u=${u.toFixed(2)} ${k} flexion ${r.fe.toFixed(0)} inclinaison ${r.incl.toFixed(0)} torsion ${r.tors.toFixed(0)} pronation ${r.pron.toFixed(0)} coude ${r.coude.toFixed(0)} tour ${r.tour.toFixed(0)} (${sorte})`);
      const m = { flex: Math.max(0, r.fe), ext: Math.max(0, -r.fe), incl: Math.abs(r.incl), tors: Math.abs(r.tors) };
      for (const c in m) if (m[c] > pire[c]) { pire[c] = m[c]; ou[c] = `main ${k}, u=${u.toFixed(2)}, pronation ${r.pron.toFixed(0)}°, coude ${r.coude.toFixed(0)}° (${sorte})`; }
    }
  }
  return { pire, ou };
}
/* Ce qui dépasse, pour ce mouvement : [[angle, valeur, limite], …]. */
export function depassements(spec, pire, limites = LIMITES) {
  const admis = {};
  for (const [motif, a] of ADMIS) if (motif.test(spec)) Object.assign(admis, a);
  return Object.keys(limites).filter(c => pire[c] > Math.max(limites[c], admis[c] || 0)).map(c => [c, pire[c], Math.max(limites[c], admis[c] || 0)]);
}
const NOMS = { flex: 'flexion', ext: 'extension', incl: 'inclinaison', tors: 'torsion' };
function principal() {
  const args = process.argv.slice(2);
  let specs = [];
  if (args[0] === '--table') {
    const motif = args[1] ? new RegExp(args[1], 'i') : null, vus = new Set();
    for (const l of fs.readFileSync(path.join(ici, 'table.txt'), 'utf8').split('\n')) {
      if (!l.trim() || l.startsWith('#')) continue;
      const spec = (l.split('|')[1] || '').trim();
      if (!spec || spec === '?' || (motif && !motif.test(l)) || vus.has(spec)) continue;
      vus.add(spec); specs.push(spec);
    }
  } else specs = args;
  const limites = Object.assign({}, LIMITES);
  for (const c in limites) if (process.env[c.toUpperCase()]) limites[c] = +process.env[c.toUpperCase()];
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS);
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair, releve = {};
  let n = 0, admis = 0, juges = 0;
  for (const spec of specs) {
    const r = poignets(M, corps, C, spec, process.env.DETAIL ? t => console.log(t) : null);
    if (r.erreur) { console.log(spec.padEnd(46), '→ erreur :', r.erreur); continue; }
    juges++; releve[spec] = r;
    const hors = depassements(spec, r.pire, limites);
    if (!hors.length) { if (Object.keys(limites).some(c => r.pire[c] > limites[c])) admis++; continue; }
    n++;
    console.log(spec.padEnd(46), hors.map(([c, v, l]) => `${NOMS[c]} ${v.toFixed(0)}° (limite ${l}°) — ${r.ou[c]}`).join(' ; '));
  }
  console.log(`${juges} mouvements jugés, ${n} à poignet hors limites (${admis} admis au-delà : voir ADMIS)`);
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(releve));
}
if (process.argv[1] && path.basename(process.argv[1]) === 'poignets.mjs') principal();
