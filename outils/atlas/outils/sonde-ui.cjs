// Sonde : exécute un script dans la page d'essai de l'interface et affiche ce qu'il renvoie.
const { ouvrir } = require('./photo.cjs');
(async () => {
  const [params, code, l = '390', h = '760'] = process.argv.slice(2);
  const { nav, ctx } = await ouvrir({ viewport: { width: +l, height: +h }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', c => { if (c.type() === 'error') erreurs.push(c.text()); });
  await p.goto('http://atlas.local/appli/essai-ui.html?' + params);
  await p.waitForFunction(() => window.pret, null, { timeout: 120000 });
  const r = await p.evaluate(code);
  console.log(JSON.stringify(r)); if (erreurs.length) console.log('erreurs', erreurs);
  await nav.close();
})();
