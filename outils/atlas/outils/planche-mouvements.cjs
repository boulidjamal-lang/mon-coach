// Planche de contrôle des mouvements, dans le vrai rendu de l'atlas : pour chaque exercice, quelques instants de la répétition.
// Usage : node outils/planche-mouvements.cjs <sortie.png> "<spec>[ | titre[ | az,el]]" …   (ou --fichier liste.txt, une ligne par exercice)
// Variables : L, H (taille d'une vignette), COLS (exercices par rangée), PAR (exercices par page), INSTANTS (ex. "0,0.5,1"),
//             CLAIR=1, PP (densité de pixels), PEAU (1 : tête, mains et pieds ; 2 : entière ; sans : écorché).
const { ouvrir } = require('./photo.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ff = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
(async () => {
  let [sortie, ...specs] = process.argv.slice(2);
  if (specs[0] === '--fichier') specs = fs.readFileSync(specs[1], 'utf8').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  const L = +(process.env.L || 300), H = +(process.env.H || 380), PP = +(process.env.PP || 1);
  const instants = (process.env.INSTANTS || '0,0.5,1').split(',').map(Number);
  const COLS = +(process.env.COLS || (instants.length > 2 ? 1 : instants.length > 1 ? 2 : 4)), PAR = +(process.env.PAR || COLS * 6);
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: H }, deviceScaleFactor: PP });
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', c => { if (c.type() === 'error') erreurs.push(c.text()); });
  await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=${PP}${process.env.CLAIR ? '&clair=1' : ''}${process.env.PEAU ? '&peau=' + process.env.PEAU : ''}`);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  const tmp = sortie.replace(/\.png$/, '-tmp'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const cellules = [];
  for (let i = 0; i < specs.length; i++) {
    const [spec, titre, vueTxt] = specs[i].split('|').map(x => x.trim());
    const vue = vueTxt ? { az: +vueTxt.split(',')[0], el: +(vueTxt.split(',')[1] || 10) } : null;
    const fichiers = [];
    for (let k = 0; k < instants.length; k++) {
      const r = await p.evaluate(([spec, titre, u, premier, vue]) => {
        try {
          if (premier) window.changer(spec, titre, vue); else document.getElementById('titre').textContent = '';
          const d = window.anim.definition;
          if (d.rythme === 'continu' || d.rythme === 'boucle') window.anim.rendre((0.12 + 0.6 * u) * (d.periode || 1.2)); else window.anim.rendre(0, u);
          return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
        } catch (e) { document.getElementById('titre').textContent = '✗ ' + spec; return String(e && e.message || e); }
      }, [spec, titre || spec, instants[k], k === 0, vue]);
      if (r) erreurs.push(spec + ' : ' + r);
      const f = path.join(tmp, `e${i}-${k}.png`); await p.screenshot({ path: f }); fichiers.push(f);
    }
    const cellule = path.join(tmp, `c${i}.png`);
    if (fichiers.length === 1) fs.renameSync(fichiers[0], cellule);
    else ff([...fichiers.flatMap(f => ['-i', f]), '-filter_complex', `hstack=inputs=${fichiers.length}`, cellule]);
    cellules.push(cellule);
  }
  await nav.close();
  // Assemblage : COLS exercices par rangée, PAR exercices par page.
  const nPages = Math.ceil(cellules.length / PAR);
  for (let n = 0; n < nPages; n++) {
    const page = cellules.slice(n * PAR, (n + 1) * PAR), d = path.join(tmp, 'p' + n); fs.mkdirSync(d);
    page.forEach((c, k) => fs.renameSync(c, path.join(d, `c${String(k).padStart(3, '0')}.png`)));
    const f = nPages > 1 ? sortie.replace(/\.png$/, `-${n + 1}.png`) : sortie, cols = Math.min(COLS, page.length), rangs = Math.ceil(page.length / cols);
    if (page.length === 1) fs.copyFileSync(path.join(d, 'c000.png'), f);
    else ff(['-framerate', '1', '-i', path.join(d, 'c%03d.png'), '-vf', `tile=${cols}x${rangs}`, '-frames:v', '1', f]);
    console.log('écrit', f, page.length, 'exercices');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('erreurs', JSON.stringify([...new Set(erreurs)]));
})();
