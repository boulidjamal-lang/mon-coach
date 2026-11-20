// Un coude saute-t-il, une main pivote-t-elle d'un coup ? Chaque mouvement est joué à sa vraie cadence (30 images par
// seconde, sur une période) et l'on mesure, d'une image à la suivante :
//   — ce que le coude fait de lui-même : son déplacement, moins celui de l'épaule ou du poignet (le plus grand des deux) ;
//   — ce que le poignet fait de lui-même : son déplacement, moins celui de l'épaule ;
//   — de combien la main tourne (ses doigts, sa paume).
// L'image la plus vive est ensuite découpée en huit. Un mouvement continu s'y partage ; un SAUT tient dans un seul
// huitième : le coude ou la main se téléportent — deux poses clés qui ne décrivent pas le bras de la même façon, un
// pôle qui se confond avec la ligne de l'épaule à la main, le solveur du bras qui change de côté. Sont aussi signalés
// les coudes qui FILENT plus vite qu'aucun bras (plus de VITE mètres par seconde), même sans à-coup.
// Les contrôles à quelques instants ne voient rien de tout cela : le défaut est entre deux instants.
// Usage : node sauts.mjs "<spec>" …   |   --table [motif]   ;   SAUT=0.03 POIGNET=0.04 (m)  MAIN=20 (°)  VITE=4 (m/s)  ;  JSON=fichier
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const ici = path.dirname(new URL(import.meta.url).pathname), DEG = 180 / Math.PI;
export const IPS = 30;
/* Un saut : plus de 3 cm (coude), de 4 cm (poignet) ou de 20° (main) d'une image à la suivante, dont plus de la
   moitié en un huitième d'image. Trop vite : le coude à plus de 4 m/s. */
export const SEUILS = { saut: 0.03, poignet: 0.04, main: 20, vite: 4, part: 0.5 };
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * DEG;
function etat(M, corps, d, t) {
  const info = corps.poser(M.poseA(d, t)), e = {};
  for (const k of ['G', 'D']) e[k] = { c: info.coudes[k].clone(), s: info.epaules[k].clone(), w: info.poignets[k].clone(), m: info.dirMains[k].clone(), p: info.paumes[k].clone() };
  return e;
}
const propre = (a, b, k) => b[k].c.distanceTo(a[k].c) - Math.max(b[k].s.distanceTo(a[k].s), b[k].w.distanceTo(a[k].w));
const tourne = (a, b, k) => Math.max(angle(a[k].m, b[k].m), angle(a[k].p, b[k].p));
const porte = (a, b, k) => b[k].w.distanceTo(a[k].w) - b[k].s.distanceTo(a[k].s);
/* Le relevé d'un mouvement : { coude: { d (m), v (m/s), cote, t (fraction de la période), part, saut, vite },
   poignet: { d (m), cote, t, part, saut }, main: { a (°), cote, t, part, saut } }. */
export function sauts(M, corps, C, spec, seuils = SEUILS) {
  let d;
  try { d = M.definir(spec, corps, C); } catch (e) { return { erreur: String(e.message).slice(0, 160) }; }
  const T = d.periode, n = Math.ceil(T * IPS), pas = T / n;
  let avant = etat(M, corps, d, 0), coude = { d: 0 }, poignet = { d: 0 }, main = { a: 0 };
  for (let i = 1; i <= n; i++) {
    const e = etat(M, corps, d, i * pas);
    for (const k of ['G', 'D']) {
      const dc = propre(avant, e, k); if (dc > coude.d) coude = { d: dc, cote: k, t: i * pas };
      const dp = porte(avant, e, k); if (dp > poignet.d) poignet = { d: dp, cote: k, t: i * pas };
      const da = tourne(avant, e, k); if (da > main.a) main = { a: da, cote: k, t: i * pas };
    }
    avant = e;
  }
  // La part du plus grand huitième de l'image la plus vive.
  const part = (pire, mesure, total) => {
    let a = etat(M, corps, d, pire.t - pas), max = 0;
    for (let j = 1; j <= 8; j++) { const e = etat(M, corps, d, pire.t - pas + pas * j / 8); max = Math.max(max, mesure(a, e, pire.cote)); a = e; }
    return max / total;
  };
  coude.part = coude.d > seuils.saut ? part(coude, propre, coude.d) : 0;
  poignet.part = poignet.d > seuils.poignet ? part(poignet, porte, poignet.d) : 0;
  poignet.saut = poignet.d > seuils.poignet && poignet.part > seuils.part;
  main.part = main.a > seuils.main ? part(main, tourne, main.a) : 0;
  coude.v = coude.d / pas; coude.saut = coude.d > seuils.saut && coude.part > seuils.part; coude.vite = coude.v > seuils.vite;
  main.saut = main.a > seuils.main && main.part > seuils.part;
  for (const r of [coude, poignet, main]) if (r.t != null) r.t /= T;
  return { coude, poignet, main };
}
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
  const seuils = Object.assign({}, SEUILS);
  for (const c of ['saut', 'poignet', 'main', 'vite']) if (process.env[c.toUpperCase()]) seuils[c] = +process.env[c.toUpperCase()];
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS);
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair, releve = {}, lignes = [];
  let juges = 0;
  for (const spec of specs) {
    const r = sauts(M, corps, C, spec, seuils);
    if (r.erreur) { console.log(spec.padEnd(46), '→ erreur :', r.erreur); continue; }
    juges++; releve[spec] = r;
    const { coude: c, poignet: p, main: m } = r;
    if (c.saut || c.vite) lignes.push([c.saut ? 2 : 1, c.d, `${spec.padEnd(46)} ${c.saut ? 'le coude SAUTE' : 'le coude file '} de ${(c.d * 100).toFixed(1)} cm en 1/${IPS} s (${c.v.toFixed(1)} m/s), côté ${c.cote} à ${(c.t * 100).toFixed(0)} % de la période${c.saut ? ` — ${(c.part * 100).toFixed(0)} % en un huitième d'image` : ''}`]);
    if (p.saut) lignes.push([4, p.d, `${spec.padEnd(46)} le poignet SAUTE de ${(p.d * 100).toFixed(1)} cm, côté ${p.cote} à ${(p.t * 100).toFixed(0)} % de la période — ${(p.part * 100).toFixed(0)} % en un huitième d'image`]);
    if (m.saut) lignes.push([3, m.a / 100, `${spec.padEnd(46)} la main PIVOTE de ${m.a.toFixed(0)}° d'un coup, côté ${m.cote} à ${(m.t * 100).toFixed(0)} % de la période`]);
  }
  for (const l of lignes.sort((a, b) => b[0] - a[0] || b[1] - a[1])) console.log(l[2]);
  const nb = k => lignes.filter(l => l[0] === k).length;
  console.log(`${juges} mouvements jugés : ${nb(2)} où un coude saute, ${nb(4)} où un poignet saute, ${nb(3)} où une main pivote d'un coup, ${nb(1)} où un coude file à plus de ${seuils.vite} m/s`);
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(releve));
}
if (process.argv[1] && path.basename(process.argv[1]) === 'sauts.mjs') principal();
