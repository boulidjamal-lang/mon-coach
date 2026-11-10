// Sonde dans la vraie appli : ouvre l'appli (historique vide), exécute un script et affiche ce qu'il renvoie.
const path = require('path'), fs = require('fs');
const DEPOT = process.env.DEPOT || '/home/user/mon-coach';
const { chromium } = require(path.join(DEPOT, 'node_modules', 'playwright-core'));
const { ouvrirAppli } = require(path.join(DEPOT, 'tests', 'outils'));
(async () => {
  const exe = fs.readdirSync('/opt/pw-browsers').filter(d => /^chromium-\d+$/.test(d)).sort().reverse().map(d => ['chrome-linux', 'chrome-linux64'].map(s => path.join('/opt/pw-browsers', d, s, 'chrome')).find(fs.existsSync)).find(Boolean);
  const nav = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const { page, erreurs } = await ouvrirAppli(nav, { https: true, theme: process.env.THEME || 'dark', animations: !!process.env.ANIMATIONS });
  const r = await page.evaluate(process.argv[2]);
  console.log(JSON.stringify(r)); if (erreurs.length) console.log('erreurs', erreurs);
  if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
  await nav.close();
})().catch(e => { console.error(e); process.exit(1); });
