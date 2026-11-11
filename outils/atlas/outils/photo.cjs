// Photo d'une page de l'atlas (fichiers servis directement, sans serveur).
// Usage : node photo.cjs <sortie.png> <page et paramètres> [largeur] [hauteur]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm' };
async function ouvrir(options = {}) {
  const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await nav.newContext(options);
  await ctx.route('http://atlas.local/**', route => {
    let f = path.join(RACINE, decodeURIComponent(new URL(route.request().url()).pathname));
    // Dans le dépôt, le moteur, les mouvements et le modèle sont ceux que sert l'appli (assets/atlas).
    if (!fs.existsSync(f) && ['atlas3d.js', 'atlas-mouvements.js', 'atlas.bin'].includes(path.basename(f))) f = path.join(RACINE, '..', '..', 'assets', 'atlas', path.basename(f));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'introuvable' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  return { nav, ctx };
}
module.exports = { ouvrir };
if (require.main === module) (async () => {
  const [sortie, page, l = '900', h = '1200'] = process.argv.slice(2);
  const { nav, ctx } = await ouvrir({ viewport: { width: Number(l), height: Number(h) }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('console', c => { if (c.type() === 'error') erreurs.push(c.text()); });
  const t0 = Date.now();
  await p.goto('http://atlas.local/' + page);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  await p.screenshot({ path: sortie });
  console.log('erreurs', JSON.stringify(erreurs), '| infos', JSON.stringify(await p.evaluate(() => window.infos || null)), '|', Date.now() - t0, 'ms');
  await nav.close();
})();
