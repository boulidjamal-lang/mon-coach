// Planche de contrôle : plusieurs vues de la page d'essai, assemblées côte à côte en une image.
// Usage : node outils/planche.cjs <sortie.png> <largeur> <hauteur> "<paramètres 1>" "<paramètres 2>" …
const { ouvrir } = require('./photo.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [sortie, l, h, ...vues] = process.argv.slice(2);
  const page0 = process.env.PAGE || 'appli/essai.html';
  const { nav, ctx } = await ouvrir({ viewport: { width: Number(l), height: Number(h) }, deviceScaleFactor: Number(process.env.PP || 1) });
  const fichiers = [], erreurs = [];
  for (let i = 0; i < vues.length; i++) {
    const p = await ctx.newPage();
    p.on('pageerror', e => erreurs.push(e.message)); p.on('console', c => { if (c.type() === 'error') erreurs.push(c.text()); });
    await p.goto('http://atlas.local/' + page0 + '?' + vues[i]);
    await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
    const f = sortie.replace(/\.png$/, `-${i}.png`);
    await p.screenshot({ path: f }); fichiers.push(f);
    if (i === 0) console.log('mesures', JSON.stringify(await p.evaluate(() => window.atlas && window.atlas.mesures ? window.atlas.mesures() : window.erreur)));
    await p.close();
  }
  await nav.close();
  if (fichiers.length > 1) {
    const args = ['-y', '-loglevel', 'error']; fichiers.forEach(f => args.push('-i', f));
    args.push('-filter_complex', `hstack=inputs=${fichiers.length}`, sortie);
    execFileSync('ffmpeg', args); fichiers.forEach(f => fs.unlinkSync(f));
  } else fs.renameSync(fichiers[0], sortie);
  console.log('erreurs', JSON.stringify([...new Set(erreurs)]));
})();
