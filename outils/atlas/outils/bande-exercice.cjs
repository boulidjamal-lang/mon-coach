// Bande d'un exercice tel que l'appli le montre : plusieurs instants de la répétition côte à côte, sous un angle donné
// (de profil par défaut : c'est là que se juge un geste). Usage :
//   node outils/bande-exercice.cjs <dossier de sortie> <az,el | appli> <identifiant> [<identifiant> …]
// Variables : L, H (taille d'une vue), INSTANTS (ex. "0,0.25,0.5,0.75,1"), CLAIR=1, DEPOT.
const { ouvrir } = require('./photo.cjs');
const { bibliotheque, couleursExercices } = require('./exercices-appli.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [dossier, vueTxt, ...ids] = process.argv.slice(2);
  const DEPOT = process.env.DEPOT || path.join(__dirname, '..', '..', '..'), L = +(process.env.L || 380), H = +(process.env.H || 520), clair = !!process.env.CLAIR;
  const instants = (process.env.INSTANTS || '0,0.25,0.5,0.75,1').split(',').map(Number);
  const vue = vueTxt && vueTxt !== 'appli' ? { az: +vueTxt.split(',')[0], el: +(vueTxt.split(',')[1] || 6) } : null;
  const B = bibliotheque(DEPOT);
  for (const id of ids) if (!B.specDe[id]) throw new Error('exercice inconnu : ' + id);
  const { couleurs, neutres } = await couleursExercices(DEPOT, ids, clair);
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1&peau=1${clair ? '&clair=1' : ''}`);
  await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
  fs.mkdirSync(dossier, { recursive: true });
  for (const id of ids) {
    const fichiers = [];
    await p.evaluate(([spec, c, n, vue]) => { window.changer(spec, '', vue); window.atlas.theme(AnqaAtlas.themeDeCarte(Object.assign({}, n, { estompe: 0.5 }))); window.atlas.colorer(c, { tendons: 0.3 }); }, [B.specDe[id], couleurs[id] || {}, neutres, vue]);
    for (const u of instants) {
      await p.evaluate(u => { window.anim.rendre(0, u); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, u);
      const f = path.join(dossier, `${id}-${u}.png`); await p.screenshot({ path: f }); fichiers.push(f);
    }
    const sortie = path.join(dossier, id + '.jpg');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...fichiers.flatMap(f => ['-i', f]), '-filter_complex', `hstack=inputs=${fichiers.length}`, '-q:v', '3', sortie]);
    fichiers.forEach(f => fs.rmSync(f));
    console.log('écrit', sortie, '—', B.specDe[id]);
  }
  await nav.close();
})().catch(e => { console.error(e); process.exit(1); });
