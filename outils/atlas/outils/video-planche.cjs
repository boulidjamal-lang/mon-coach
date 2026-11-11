// Vidéo de plusieurs mouvements côte à côte, dans le vrai rendu de l'atlas : chaque case joue une répétition entière, en boucle.
// Usage : node outils/video-planche.cjs <sortie.mp4> "<exercice>" …
//   un exercice s'écrit « ex=<identifiant>[ | titre[ | az,el]] » (un exercice de la bibliothèque : son mouvement et les
//   couleurs de ses muscles, comme dans l'appli) ou « <mouvement>[ | titre[ | az,el]] » (un mouvement seul, sans couleurs).
// Variables : L, H (taille d'une case), COLS, IPS (images par seconde), DUREE (secondes d'une boucle), BOUCLES, CLAIR=1,
//             PEAU (0 écorché ; 1 tête, mains et pieds : par défaut, comme l'appli ; 2 entière), DEPOT (le dépôt de l'appli).
const { ouvrir } = require('./photo.cjs');
const { bibliotheque, couleursExercices } = require('./exercices-appli.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [sortie, ...textes] = process.argv.slice(2);
  const L = +(process.env.L || 360), H = +(process.env.H || 440), COLS = +(process.env.COLS || 2), IPS = +(process.env.IPS || 25);
  const DUREE = +(process.env.DUREE || 2.8), N = Math.round(IPS * DUREE), BOUCLES = +(process.env.BOUCLES || 3);
  const PEAU = process.env.PEAU == null ? 1 : +process.env.PEAU, clair = !!process.env.CLAIR, DEPOT = process.env.DEPOT || path.join(__dirname, '..', '..', '..');
  const items = textes.map(t => { const [quoi, titre, vueTxt] = t.split('|').map(x => x.trim()); return { ex: /^ex=/.test(quoi) ? quoi.slice(3) : null, spec: /^ex=/.test(quoi) ? null : quoi, titre: titre || '', vue: vueTxt ? { az: +vueTxt.split(',')[0], el: +(vueTxt.split(',')[1] || 10) } : null }; });
  let neutres = null;
  if (items.some(i => i.ex)) {
    const B = bibliotheque(DEPOT), ids = items.filter(i => i.ex).map(i => i.ex), r = await couleursExercices(DEPOT, ids, clair);
    neutres = r.neutres;
    for (const i of items) if (i.ex) { i.spec = B.specDe[i.ex]; if (!i.spec) throw new Error('exercice inconnu : ' + i.ex); i.couleurs = r.couleurs[i.ex] || {}; if (!i.titre) i.titre = (B.tous.find(e => e.id === i.ex) || {}).nom || ''; }
  }
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1${PEAU ? '&peau=' + PEAU : ''}${clair ? '&clair=1' : ''}`);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  const tmp = sortie.replace(/\.mp4$/, '-images'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await p.evaluate(([spec, titre, vue, couleurs, neutres]) => {
      window.changer(spec, titre, vue);
      if (couleurs) { window.atlas.theme(AnqaAtlas.themeDeCarte(Object.assign({}, neutres, { estompe: 0.5 }))); window.atlas.colorer(couleurs, { tendons: 0.3 }); }
      else window.atlas.colorer(null);
    }, [it.spec, it.titre, it.vue, it.couleurs || null, neutres]);
    for (let k = 0; k < N; k++) {
      // Une boucle entière de l'exercice sur la durée de la vidéo, quelle que soit sa période.
      await p.evaluate(f => { window.anim.rendre(f * window.anim.definition.periode); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, k / N);
      await p.screenshot({ path: path.join(tmp, `c${i}-${String(k).padStart(3, '0')}.png`) });
    }
    console.log('rendu', i + 1, '/', items.length, it.ex || it.spec);
  }
  await nav.close();
  const cols = Math.min(COLS, items.length);
  const entrees = items.flatMap((_, i) => ['-framerate', String(IPS), '-i', path.join(tmp, `c${i}-%03d.png`)]);
  const disposition = items.map((_, i) => `${(i % cols) * L}_${Math.floor(i / cols) * H}`).join('|');
  const filtre = items.length > 1 ? `xstack=inputs=${items.length}:layout=${disposition}:fill=black,loop=loop=${BOUCLES - 1}:size=${N}:start=0` : `loop=loop=${BOUCLES - 1}:size=${N}:start=0`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...entrees, '-filter_complex', filtre, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-movflags', '+faststart', sortie]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(sortie, (fs.statSync(sortie).size / 1e6).toFixed(2), 'Mo', erreurs.length ? 'erreurs ' + JSON.stringify(erreurs) : 'sans erreur');
})();
