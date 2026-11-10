// Vidéo d'un mouvement : une répétition entière rendue image par image dans la page d'essai, puis mise en boucle.
// Usage : node outils/video-mouvement.cjs <sortie.mp4> <mouvement> [largeur] [hauteur] [paramètres en plus]
const { ouvrir } = require('./photo.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [sortie, mouvement, l = '720', h = '900', plus = ''] = process.argv.slice(2);
  const IPS = 25, PERIODE = 2.8, N = Math.round(IPS * PERIODE), dossier = sortie.replace(/\.mp4$/, '-images');
  fs.rmSync(dossier, { recursive: true, force: true }); fs.mkdirSync(dossier, { recursive: true });
  const { nav, ctx } = await ouvrir({ viewport: { width: +l, height: +h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`http://atlas.local/appli/essai-mouvement.html?m=${mouvement}&pp=1${plus ? '&' + plus : ''}`);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => { anim.rendre(t); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, i / IPS);
    await p.screenshot({ path: path.join(dossier, `i${String(i).padStart(3, '0')}.png`) });
  }
  await nav.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-stream_loop', '2', '-framerate', String(IPS), '-i', path.join(dossier, 'i%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', sortie]);
  fs.rmSync(dossier, { recursive: true, force: true });
  console.log(sortie, (fs.statSync(sortie).size / 1e6).toFixed(2), 'Mo', erreurs.length ? 'erreurs ' + JSON.stringify(erreurs) : '');
})();
