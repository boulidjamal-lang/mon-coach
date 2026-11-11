// Ce que l'appli sait des exercices, pour les outils de contrôle : la bibliothèque visible, le mouvement de chacun, et les
// couleurs que l'appli donne à ses muscles (calculées par l'appli elle-même, ouverte dans le navigateur de test).
const fs = require('fs'), path = require('path'), vm = require('vm');
/* La bibliothèque telle que l'appli la montre (exercices livrés moins les doublons fusionnés), le mouvement de chacun, les groupes. */
function bibliotheque(DEPOT) {
  const html = fs.readFileSync(path.join(DEPOT, 'index.html'), 'utf8');
  const litteral = (debut, fin) => { const i = html.indexOf(debut); if (i < 0) throw new Error('introuvable : ' + debut); const j = html.indexOf(fin, i); return vm.runInNewContext('(' + html.slice(i + debut.length - 1, j + 2) + ')'); };
  const BASE = litteral('const EXERCICES_BASE = [', '\n];'), GROUPES = litteral('const GROUPES_MUSCULAIRES = {', '\n};'), FUSIONS = litteral('const FUSIONS_BIBLIOTHEQUE = {', '\n};');
  const specDe = Object.fromEntries(fs.readFileSync(path.join(DEPOT, 'outils', 'atlas', 'mouvements', 'table.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|').map(x => x.trim())).map(([id, spec]) => [id, spec]));
  const visibles = BASE.filter(e => !FUSIONS[e.id]);
  const sans = visibles.filter(e => !specDe[e.id]);
  if (sans.length) throw new Error('exercices sans mouvement : ' + sans.map(e => e.id).join(', '));
  return { tous: BASE, visibles, GROUPES, specDe, specs: [...new Set(visibles.map(e => specDe[e.id]))] };
}
/* Les couleurs des muscles de chaque exercice, telles que l'appli les calcule (carteAtlas, mode « exercice »), et les teintes
   neutres du reste du corps. clair : thème clair. */
async function couleursExercices(DEPOT, ids, clair) {
  const { chromium } = require(path.join(DEPOT, 'node_modules', 'playwright-core'));
  const { ouvrirAppli } = require(path.join(DEPOT, 'tests', 'outils'));
  const b = fs.readFileSync(path.join(DEPOT, 'assets', 'atlas', 'atlas.bin')), S = JSON.parse(b.subarray(12, 12 + b.readUInt32LE(8)).toString('utf8')).structures.map(s => ({ id: s.id, app: s.app }));
  const exe = fs.readdirSync('/opt/pw-browsers').filter(d => /^chromium-\d+$/.test(d)).sort().reverse().map(d => ['chrome-linux', 'chrome-linux64'].map(s => path.join('/opt/pw-browsers', d, s, 'chrome')).find(fs.existsSync)).find(Boolean);
  const nav = await chromium.launch({ executablePath: exe });
  try {
    const { page } = await ouvrirAppli(nav, { https: true, theme: clair ? 'light' : 'dark' });
    return await page.evaluate(([ids, S]) => {
      const couleurs = {};
      musculationSessionActive = null; musculationHistorique = [];
      atlasDonnees = donneesAtlas();
      for (const id of ids) { const exo = trouverExercice(id); if (!exo) continue; atlasExercice = { exo, mouvement: mouvementExercice(exo.id) }; couleurs[id] = carteAtlas('exercice', S).couleurs; }
      atlasExercice = null; atlasDonnees = null;
      return { couleurs, neutres: neutresAtlas(), accent: couleurCssAtlas('--corps-cible', '#f472b6') };
    }, [ids, S]);
  } finally { await nav.close(); }
}
module.exports = { bibliotheque, couleursExercices };
