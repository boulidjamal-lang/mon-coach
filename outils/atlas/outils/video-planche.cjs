// Vidéo de plusieurs mouvements côte à côte, dans le vrai rendu de l'atlas : chaque case joue une répétition entière, en boucle.
// Usage : node outils/video-planche.cjs <sortie.mp4> "<spec>[ | titre[ | az,el]]" …
// Variables : L, H (taille d'une case), COLS, IPS (images par seconde), DUREE (secondes d'une boucle), BOUCLES, CLAIR=1.
const { ouvrir } = require('./photo.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [sortie, ...specs] = process.argv.slice(2);
  const L = +(process.env.L || 360), H = +(process.env.H || 440), COLS = +(process.env.COLS || 2), IPS = +(process.env.IPS || 25);
  const DUREE = +(process.env.DUREE || 2.8), N = Math.round(IPS * DUREE), BOUCLES = +(process.env.BOUCLES || 3);
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1${process.env.CLAIR ? '&clair=1' : ''}`);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  const tmp = sortie.replace(/\.mp4$/, '-images'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  for (let i = 0; i < specs.length; i++) {
    const [spec, titre, vueTxt] = specs[i].split('|').map(x => x.trim());
    const vue = vueTxt ? { az: +vueTxt.split(',')[0], el: +(vueTxt.split(',')[1] || 10) } : null;
    await p.evaluate(([spec, titre, vue]) => { window.changer(spec, titre, vue); }, [spec, titre || '', vue]);
    for (let k = 0; k < N; k++) {
      // Une boucle entière de l'exercice sur la durée de la vidéo, quelle que soit sa période.
      await p.evaluate(f => { window.anim.rendre(f * window.anim.definition.periode); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, k / N);
      await p.screenshot({ path: path.join(tmp, `c${i}-${String(k).padStart(3, '0')}.png`) });
    }
    console.log('rendu', i + 1, '/', specs.length, spec);
  }
  await nav.close();
  const cols = Math.min(COLS, specs.length), rangs = Math.ceil(specs.length / cols);
  const entrees = specs.flatMap((_, i) => ['-framerate', String(IPS), '-i', path.join(tmp, `c${i}-%03d.png`)]);
  const disposition = specs.map((_, i) => `${(i % cols) * L}_${Math.floor(i / cols) * H}`).join('|');
  const filtre = specs.length > 1 ? `xstack=inputs=${specs.length}:layout=${disposition}:fill=black,loop=loop=${BOUCLES - 1}:size=${N}:start=0` : `loop=loop=${BOUCLES - 1}:size=${N}:start=0`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...entrees, '-filter_complex', filtre, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-movflags', '+faststart', sortie]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(sortie, (fs.statSync(sortie).size / 1e6).toFixed(2), 'Mo', erreurs.length ? 'erreurs ' + JSON.stringify(erreurs) : 'sans erreur');
})();
