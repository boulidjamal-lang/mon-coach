// Aperçu d'un exercice tel que l'appli le montre (peau sur la tête, les mains et les pieds), à un instant de la répétition.
// Usage : node outils/apercu-exercice.cjs <sortie.jpg> <identifiant d'exercice> [instant 0..1] [az,el]
// Variables : L, H (taille d'une vue), NIVEAUX (peaux à montrer côte à côte, ex. "1,0" ; par défaut 1), CLAIR=1, DEPOT.
const { ouvrir } = require('./photo.cjs');
const { bibliotheque, couleursExercices } = require('./exercices-appli.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [sortie, id, uTxt = '0.5', vueTxt] = process.argv.slice(2);
  const DEPOT = process.env.DEPOT || path.join(__dirname, '..', '..', '..'), L = +(process.env.L || 520), H = +(process.env.H || 900), clair = !!process.env.CLAIR;
  const niveaux = (process.env.NIVEAUX || '1').split(',').map(Number), vue = vueTxt ? { az: +vueTxt.split(',')[0], el: +(vueTxt.split(',')[1] || 8) } : null;
  const B = bibliotheque(DEPOT), spec = B.specDe[id]; if (!spec) throw new Error('exercice inconnu : ' + id);
  const { couleurs, neutres } = await couleursExercices(DEPOT, [id], clair);
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(), fichiers = [];
  for (const n of niveaux) {
    await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1${n ? '&peau=' + n : ''}${clair ? '&clair=1' : ''}`);
    await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
    await p.evaluate(([spec, c, n, u, vue]) => { window.changer(spec, '', vue); window.atlas.theme(AnqaAtlas.themeDeCarte(Object.assign({}, n, { estompe: 0.5 }))); window.atlas.colorer(c, { tendons: 0.3 }); window.anim.rendre(0, u); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, [spec, couleurs[id] || {}, neutres, +uTxt, vue]);
    const f = sortie.replace(/\.(jpg|png)$/, `-${n}.png`); await p.screenshot({ path: f }); fichiers.push(f);
  }
  await nav.close();
  if (fichiers.length > 1) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...fichiers.flatMap(f => ['-i', f]), '-filter_complex', `hstack=inputs=${fichiers.length}`, '-q:v', '3', sortie]);
  else execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', fichiers[0], '-q:v', '3', sortie]);
  fichiers.forEach(f => fs.rmSync(f));
  console.log('écrit', sortie);
})().catch(e => { console.error(e); process.exit(1); });
