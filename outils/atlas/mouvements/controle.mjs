// Contrôle automatique des mouvements, sans moteur 3D : chaque mouvement est défini, posé à plusieurs instants, et vérifié
// (valeurs finies, rien sous le sol, mains et pieds à la portée de leur cible). N'affiche que les problèmes.
// Usage : node controle.mjs "<spec>" …   |   --fichier liste.txt (« spec | titre »)   |   --table (tous les exercices de table.txt)
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const ici = path.dirname(new URL(import.meta.url).pathname);
/* Les options que chaque famille sait lire, relevées dans son code (o.nom) ; plus celles des outils communs. */
let OPTIONS = null;
function optionsConnues() {
  if (OPTIONS) return OPTIONS;
  OPTIONS = {};
  const dossier = path.join(ici, 'src'), communes = new Set(['_', 'amp']);
  const lire = txt => new Set([...txt.matchAll(/\bo\.([A-Za-z0-9_]+)/g)].map(m => m[1]).concat([...txt.matchAll(/\bo\['([A-Za-z0-9_]+)'\]/g)].map(m => m[1])));
  for (const f of fs.readdirSync(dossier).sort()) {
    const txt = fs.readFileSync(path.join(dossier, f), 'utf8'), bouts = txt.split(/\n  FAM\.(\w+) = /);
    // Avant la première famille du fichier : des outils communs (postureDe, porter, tenuDe…).
    for (const k of lire(bouts[0])) communes.add(k);
    for (let i = 1; i < bouts.length; i += 2) OPTIONS[bouts[i]] = lire(bouts[i + 1]);
  }
  for (const k in OPTIONS) for (const x of communes) OPTIONS[k].add(x);
  return OPTIONS;
}
export function controlerSpec(M, corps, C, spec) {
  const pb = [];
  const mots = String(spec).trim().split(/\s+/), connues = optionsConnues()[mots[0]];
  if (connues) for (const m of mots.slice(1)) { const k = m.split('=')[0]; if (!connues.has(k)) pb.push('option inconnue : ' + k); }
  let d;
  try { d = M.definir(spec, corps, C); } catch (e) { return ['erreur : ' + String(e.message).slice(0, 120)]; }
  const instants = d.rythme === 'continu' || d.rythme === 'boucle' ? [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95] : [0, 0.25, 0.5, 0.75, 1];
  const vu = new Set(), noter = (cle, texte) => { if (!vu.has(cle)) { vu.add(cle); pb.push(texte); } };
  for (const u of instants) {
    let pose, info;
    let formes;
    try { pose = M.poseA(d, 0, u); info = corps.poser(pose); formes = M.materielDe(d, info, u, C, {}); } catch (e) { noter('err', 'erreur à u=' + u + ' : ' + String(e.message).slice(0, 120)); continue; }
    // Le matériel : des formes connues du moteur, à des endroits bien définis.
    for (const f of formes) {
      if (!['cylindre', 'boite', 'sphere', 'tore', 'arc', 'hexa'].includes(f.forme)) noter('forme', 'forme inconnue : ' + f.forme);
      if (![...f.p, ...f.q, ...f.s, f.r || 0].every(Number.isFinite)) { noter('mat', 'matériel mal placé (valeur non finie, u=' + u + ')'); break; }
    }
    const m = corps.matrices(); let fini = true;
    for (let i = 0; i < m.length; i++) if (!Number.isFinite(m[i])) { fini = false; break; }
    if (!fini) { noter('nan', 'valeur non finie (u=' + u + ')'); continue; }
    let yMin = Infinity; corps.peauPosee(null, (x, y) => { if (y < yMin) yMin = y; });
    if (yMin < -0.045) noter('sol', `sous le sol de ${Math.round(-yMin * 100)} cm (u=${u})`);
    for (const k of ['G', 'D']) {
      const b = pose.bras && pose.bras[k], j = pose.jambes && pose.jambes[k];
      if (b && b.prise && info.prises && info.prises[k]) { const e = info.prises[k].distanceTo(b.prise); if (e > 0.09) noter('main' + k, `main ${k} à ${Math.round(e * 100)} cm de sa prise (u=${u})`); }
      if (j && j.cheville && info.chevilles && info.chevilles[k]) { const e = info.chevilles[k].distanceTo(j.cheville); if (e > 0.035) noter('pied' + k, `cheville ${k} à ${Math.round(e * 100)} cm de sa cible (u=${u})`); }
    }
  }
  return pb;
}
function principal() {
  const args = process.argv.slice(2);
  let specs = [];
  if (args[0] === '--fichier') specs = fs.readFileSync(args[1], 'utf8').split('\n').filter(x => x.trim() && !x.startsWith('#')).map(x => x.split('|')[0].trim());
  else if (args[0] === '--table') specs = [...new Set(fs.readFileSync(path.join(ici, 'table.txt'), 'utf8').split('\n').filter(x => x.trim() && !x.startsWith('#')).map(x => x.split('|')[1].trim()).filter(x => x && x !== '?'))];
  else specs = args;
  const atlas = chargerAtlas(FICHIER_ATLAS);
  const M = chargerMouvements(FICHIER_MOUVEMENTS);
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair;
  let nb = 0;
  for (const spec of specs) { const pb = controlerSpec(M, corps, C, spec); if (pb.length) { nb++; console.log(spec.padEnd(42), '→', pb.join(' ; ')); } }
  console.log(`${specs.length} mouvements contrôlés, ${nb} à revoir`);
}
if (process.argv[1] && process.argv[1].endsWith('controle.mjs')) principal();
