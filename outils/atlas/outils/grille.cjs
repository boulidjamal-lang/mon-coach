// Grille de contrôle : des mouvements (spec ou identifiant d'exercice) à un instant et sous une vue donnés.
// Usage : node outils/grille.cjs <sortie.jpg> <liste.txt>     une ligne : « spec ou identifiant | u | az,el | zoom (champ en m, facultatif) | x,y,z du centre (facultatif) »
// Variables : L, H (vignette), COLS, PEAU (1), DEPOT, CLAIR=1, COULEURS=1 (couleurs de l'appli pour les identifiants).
const { ouvrir } = require('./photo.cjs');
const { bibliotheque, couleursExercices } = require('./exercices-appli.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [sortie, liste] = process.argv.slice(2);
  const DEPOT = process.env.DEPOT || path.join(__dirname, '..', '..', '..'), L = +(process.env.L || 420), H = +(process.env.H || 420), COLS = +(process.env.COLS || 4), PEAU = process.env.PEAU == null ? 1 : +process.env.PEAU, clair = !!process.env.CLAIR;
  const lignes = fs.readFileSync(liste, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split('|').map(x => x.trim()));
  const B = bibliotheque(DEPOT);
  const ids = lignes.map(l => l[0]).filter(x => B.specDe[x]);
  const teintes = process.env.COULEURS && ids.length ? await couleursExercices(DEPOT, ids, clair) : null;
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1${PEAU ? '&peau=' + PEAU : ''}${clair ? '&clair=1' : ''}`);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  const ff = a => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
  const dossier = path.dirname(sortie), f = [];
  for (let k = 0; k < lignes.length; k++) {
    const [qui, uTxt = '0', vueTxt, champTxt, centreTxt] = lignes[k], spec = B.specDe[qui] || qui;
    const vue = vueTxt ? { az: +vueTxt.split(',')[0], el: +(vueTxt.split(',')[1] || 8) } : null, centre = centreTxt ? centreTxt.split(',').map(Number) : null;
    const r = await p.evaluate(([spec, titre, u, vue, champ, centre, c, n]) => {
      try {
        window.changer(spec, titre, vue);
        if (n) window.atlas.theme(AnqaAtlas.themeDeCarte(Object.assign({}, n, { estompe: 0.5 })));
        window.atlas.colorer(c || {}, { tendons: 0.3 });
        window.anim.rendre(0, u);
        if (champ) { const b = window.anim.boite, ce = centre || [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; window.atlas.placer({ cible: ce, dist: champ * 1.08 / 2 / Math.tan(12 * Math.PI / 180) }); }
      } catch (e) { document.getElementById('titre').textContent = 'ERREUR ' + e.message; return String(e.stack || e); }
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    }, [spec, `${qui}${qui !== spec ? ' — ' + spec : ''} · u=${uTxt}`, +uTxt, vue, champTxt ? +champTxt : 0, centre, teintes ? teintes.couleurs[qui] : null, teintes ? teintes.neutres : null]);
    if (r) console.log('erreur', qui, r.split('\n')[0]);
    const g = path.join(dossier, `gr-${k}.png`); await p.screenshot({ path: g }); f.push(g);
  }
  await nav.close();
  const rangs = [];
  for (let i = 0; i < f.length; i += COLS) {
    const part = f.slice(i, i + COLS), rang = path.join(dossier, `gr-rang-${i}.png`);
    while (part.length < COLS && f.length > COLS) part.push(part[part.length - 1]);
    ff([...part.flatMap(x => ['-i', x]), '-filter_complex', part.length > 1 ? `hstack=inputs=${part.length}` : 'null', rang]); rangs.push(rang);
  }
  ff([...rangs.flatMap(x => ['-i', x]), '-filter_complex', rangs.length > 1 ? `vstack=inputs=${rangs.length}` : 'null', '-q:v', '3', sortie]);
  [...f, ...rangs].forEach(x => fs.rmSync(x));
  console.log('écrit', sortie, erreurs.length ? 'erreurs : ' + erreurs.join(' | ') : '');
})().catch(e => { console.error(e); process.exit(1); });
