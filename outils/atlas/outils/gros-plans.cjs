// Gros plans d'une articulation pendant un mouvement (contrôle des déformations), peau partielle par défaut.
// Usage : node outils/gros-plans.cjs <sortie.jpg> <liste.txt>
//   une ligne : « identifiant ou spec | epaule|coude|hanche|genou|poignet|cheville [G|D] | az,el | u1,u2,… [| champ en m] »
// Variables : L (côté d'une vignette), PEAU (1), DEPOT.
const { ouvrir } = require('./photo.cjs');
const { bibliotheque } = require('./exercices-appli.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [sortie, liste] = process.argv.slice(2);
  const DEPOT = process.env.DEPOT || path.join(__dirname, '..', '..', '..'), L = +(process.env.L || 380), PEAU = process.env.PEAU == null ? 1 : +process.env.PEAU;
  const lignes = fs.readFileSync(liste, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split('|').map(x => x.trim()));
  const B = bibliotheque(DEPOT);
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: L }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1${PEAU ? '&peau=' + PEAU : ''}`);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  const ff = a => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
  const dossier = path.dirname(sortie), rangs = [];
  for (let k = 0; k < lignes.length; k++) {
    const [qui, ou, vueTxt, usTxt, champTxt] = lignes[k], spec = B.specDe[qui] || qui;
    const [art, cote = 'G'] = ou.split(/\s+/), [az, el = 8] = vueTxt.split(',').map(Number), us = usTxt.split(',').map(Number), champ = +(champTxt || 0.62);
    const f = [];
    for (const u of us) {
      await p.evaluate(([spec, titre, u, art, cote, az, el, champ]) => {
        window.changer(spec, titre, { az, el });
        const info = window.anim.rendre(0, u);
        const pt = { epaule: info.epaules, coude: info.coudes, hanche: info.hanches, genou: info.genoux, poignet: info.poignets, cheville: info.chevilles }[art][cote];
        window.atlas.placer({ az, el, cible: [pt.x, pt.y, pt.z], dist: champ * 1.08 / 2 / Math.tan(12 * Math.PI / 180) });
        return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, [spec, u === us[0] ? `${qui} · ${art} ${cote}` : 'u = ' + u, u, art, cote, az, el, champ]);
      const g = path.join(dossier, `gp-${k}-${f.length}.png`); await p.screenshot({ path: g }); f.push(g);
    }
    const rang = path.join(dossier, `gp-rang-${k}.png`);
    ff([...f.flatMap(x => ['-i', x]), '-filter_complex', f.length > 1 ? `hstack=inputs=${f.length}` : 'null', rang]); rangs.push(rang);
    f.forEach(x => fs.rmSync(x));
  }
  await nav.close();
  ff([...rangs.flatMap(x => ['-i', x]), '-filter_complex', rangs.length > 1 ? `vstack=inputs=${rangs.length}` : 'null', '-q:v', '3', sortie]);
  rangs.forEach(x => fs.rmSync(x));
  console.log('écrit', sortie, erreurs.length ? 'erreurs : ' + erreurs.join(' | ') : '');
})().catch(e => { console.error(e); process.exit(1); });
