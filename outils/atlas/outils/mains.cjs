// Gros plans de la main sur ce qu'elle tient : seul reste le matériel fin (barre, poignée), le reste du matériel est
// ôté pour voir la main sous tous les angles ; la vue vise le centre de la prise.
// Usage : node outils/mains.cjs <sortie.jpg> <liste.txt>
//   une ligne : « identifiant ou spec | G|D | az,el | u1,u2,… [| champ en m] »
// Variables : L (côté d'une vignette, 420), CLAIR=1, COULEURS=1 (les couleurs de l'appli), DEPOT.
const { ouvrir } = require('./photo.cjs');
const { bibliotheque, couleursExercices } = require('./exercices-appli.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [sortie, liste] = process.argv.slice(2);
  const DEPOT = process.env.DEPOT || path.join(__dirname, '..', '..', '..'), L = +(process.env.L || 420), clair = !!process.env.CLAIR;
  const lignes = fs.readFileSync(liste, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split('|').map(x => x.trim()));
  const B = bibliotheque(DEPOT), ids = lignes.map(l => l[0]).filter(x => B.specDe[x]);
  const teintes = process.env.COULEURS && ids.length ? await couleursExercices(DEPOT, ids, clair) : null;
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: L }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1&peau=1${clair ? '&clair=1' : ''}`);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  const ff = a => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
  const dossier = path.dirname(sortie), rangs = [];
  for (let k = 0; k < lignes.length; k++) {
    const [qui, cote, vueTxt, usTxt, champTxt] = lignes[k], spec = B.specDe[qui] || qui;
    const [az, el = 8] = vueTxt.split(',').map(Number), us = usTxt.split(',').map(Number), champ = +(champTxt || 0.2);
    const f = [];
    for (const u of us) {
      await p.evaluate(([spec, titre, u, cote, az, el, champ, c, n, clair]) => {
        window.changer(spec, titre, { az, el });
        if (n) { window.atlas.theme(AnqaAtlas.themeDeCarte(Object.assign({}, n, { estompe: 0.5 }))); window.atlas.colorer(c || {}, { tendons: 0.3 }); }
        const info = window.anim.rendre(0, u), M = window.AnqaMouvements;
        const formes = M.materielDe(window.anim.definition, info, u, M.TEINTES[clair ? 'clair' : 'sombre'], {});
        window.atlas.objets(formes.filter(f => f.forme === 'cylindre' && f.s[0] < 0.018));
        const pt = info.prises[cote];
        window.atlas.placer({ az, el, cible: [pt.x, pt.y, pt.z], dist: champ * 1.08 / 2 / Math.tan(12 * Math.PI / 180) });
        return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, [spec, u === us[0] ? `${qui} · main ${cote} · ${az}°` : 'u = ' + u, u, cote, az, el, champ, teintes ? teintes.couleurs[qui] : null, teintes ? teintes.neutres : null, clair]);
      const g = path.join(dossier, `mn-${k}-${f.length}.png`); await p.screenshot({ path: g }); f.push(g);
    }
    const rang = path.join(dossier, `mn-rang-${k}.png`);
    ff([...f.flatMap(x => ['-i', x]), '-filter_complex', f.length > 1 ? `hstack=inputs=${f.length}` : 'null', rang]); rangs.push(rang);
    for (const x of f) fs.unlinkSync(x);
  }
  ff([...rangs.flatMap(x => ['-i', x]), '-filter_complex', rangs.length > 1 ? `vstack=inputs=${rangs.length}` : 'null', '-q:v', '3', sortie]);
  for (const x of rangs) fs.unlinkSync(x);
  await nav.close();
  if (erreurs.length) console.log('erreurs :', erreurs.slice(0, 3).join(' | '));
  console.log('écrit', sortie);
})();
