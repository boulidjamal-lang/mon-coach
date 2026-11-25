// Les fonds de la fiche d'exercice de l'appli (dégradés du CSS), peints par le navigateur : fond-sombre.png, fond-clair.png.
// node fonds.cjs <dossier> <côté en pixels>
const { chromium } = require('playwright');
const [dossier = '.', cote = '800'] = process.argv.slice(2);
(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: +cote, height: +cote }, deviceScaleFactor: 1 });
  const fonds = { sombre: 'radial-gradient(ellipse 75% 60% at 50% 42%, #1b1e27 0%, #0d0f15 55%, #07080b 100%)', clair: 'radial-gradient(ellipse 75% 60% at 50% 42%, #ffffff 0%, #eef1f6 60%, #e2e6ee 100%)' };
  for (const [nom, f] of Object.entries(fonds)) {
    await page.setContent(`<body style="margin:0"><div style="width:${cote}px;height:${cote}px;background:${f}"></div></body>`);
    await page.screenshot({ path: `${dossier}/fond-${nom}.png` });
  }
  await nav.close();
})();
