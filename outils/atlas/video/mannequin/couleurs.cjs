// Les muscles que l'appli met en couleur pour chaque exercice (calculés par l'appli elle-même).
// node couleurs.cjs <dépôt> <sortie.json> <id> [<id> …]
const path = require('path'), fs = require('fs');
const [DEPOT, sortie, ...ids] = process.argv.slice(2);
const { couleursExercices } = require(path.join(DEPOT, 'outils', 'atlas', 'outils', 'exercices-appli.cjs'));
(async () => {
  const r = await couleursExercices(DEPOT, ids, false);
  fs.writeFileSync(sortie, JSON.stringify(r));
  for (const id of ids) { const c = r.couleurs[id] || {}; const k = Object.keys(c); console.log(id, k.length, 'structures colorées ; exemples :', JSON.stringify(Object.fromEntries(k.slice(0, 4).map(x => [x, c[x]])))); }
  console.log('neutres', JSON.stringify(r.neutres).slice(0, 300), 'accent', r.accent);
})().catch(e => { console.error(e); process.exit(1); });
