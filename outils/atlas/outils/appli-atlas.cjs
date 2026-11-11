// L'atlas dans la vraie appli (mon-coach servie comme sur le site) : historique d'essai, ouverture, captures.
// Usage : node outils/appli-atlas.cjs <dossier de sortie> [clair]
const path = require('path'), fs = require('fs');
const DEPOT = process.env.DEPOT || '/home/user/mon-coach';
const { chromium } = require(path.join(DEPOT, 'node_modules', 'playwright-core'));
const { ouvrirAppli } = require(path.join(DEPOT, 'tests', 'outils'));
(async () => {
  const [sortie = 'essai/appli', theme] = process.argv.slice(2);
  fs.mkdirSync(sortie, { recursive: true });
  const exe = fs.readdirSync('/opt/pw-browsers').filter(d => /^chromium-\d+$/.test(d)).sort().reverse().map(d => ['chrome-linux', 'chrome-linux64'].map(s => path.join('/opt/pw-browsers', d, s, 'chrome')).find(fs.existsSync)).find(Boolean);
  const nav = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const { page, erreurs } = await ouvrirAppli(nav, { https: true, theme: theme === 'clair' ? 'light' : 'dark' });
  // Un historique d'essai : quatre semaines de séances (pectoraux, dos, jambes), charges qui montent un peu.
  await page.evaluate(() => {
    const jour = n => decalerJours(todayStr(), -n);
    const serie = (poids, reps, n = 4) => Array.from({ length: n }, () => ({ fait: true, poids, reps }));
    const seance = (n, exos) => ({ id: 'h' + n, date: jour(n), exercices: exos.map(([exerciceId, p, r, k]) => ({ exerciceId, series: serie(p, r, k) })) });
    musculationHistorique = [];
    for (let sem = 0; sem < 8; sem++) {
      const m = 1 - sem * 0.02;
      musculationHistorique.push(seance(sem * 7 + 0, [['e1', Math.round(80 * m), 8, 4], ['e42', Math.round(10 * m), 12, 3], ['e13', 0, 15, 3]]));
      musculationHistorique.push(seance(sem * 7 + 2, [['e20', 0, 8, 4], ['e24', Math.round(60 * m), 10, 4], ['e338', Math.round(14 * m), 10, 3]]));
      musculationHistorique.push(seance(sem * 7 + 4, [['e265', Math.round(100 * m), 6, 5], ['e29', Math.round(120 * m), 5, 3]]));
    }
    musculationHistorique = musculationHistorique.filter(h => h.date <= todayStr());
    allerA('activite'); if (typeof renderVitrineMuscu === 'function') renderVitrineMuscu();
  });
  await page.waitForTimeout(500);
  const photo = async nom => { await page.screenshot({ path: path.join(sortie, nom + '.png') }); };
  const attendreAtlas = async () => { await page.waitForFunction(() => atlasMonte && atlasMonte.atlas.mesures().images > 1, null, { timeout: 120000 }); await page.waitForTimeout(1500); };
  await photo('0-activite');
  await page.evaluate(() => ouvrirAtlas('semaine')); await attendreAtlas(); await photo('1-semaine');
  const infos = await page.evaluate(() => ({ modes: [...document.querySelectorAll('.atlas-modes button')].map(b => b.textContent), legende: [...document.querySelectorAll('.atlas-legende span')].map(b => b.textContent), couleurs: Object.keys(carteAtlas('semaine', atlasMonte.atlas.structures).couleurs).length, semaine: atlasDonnees.semaine, progression: Object.fromEntries(Object.entries(atlasDonnees.progression).map(([g, p]) => [g, +(p.evolution * 100).toFixed(1)])), retards: Object.keys(atlasDonnees.retards), jours: Object.fromEntries(Object.entries(atlasDonnees.jours).map(([g, s]) => [g, s.size])) }));
  console.log(JSON.stringify(infos));
  await page.evaluate(() => atlasMonte.choisir('pectoral_sternal')); await page.waitForTimeout(1200); await photo('2-fiche-semaine');
  for (const m of ['seance', 'frequence', 'progression', 'equilibre', 'anatomie']) { await page.evaluate(m => { atlasMonte.choisir(null); atlasMonte.choisirMode(m); }, m); await page.waitForTimeout(900); await photo('3-' + m); }
  await page.evaluate(() => { atlasMonte.choisirMode('progression'); atlasMonte.choisir('grand_dorsal'); atlasMonte.atlas.vue('dos', 0); }); await page.waitForTimeout(1200); await photo('4-fiche-progression');
  await page.evaluate(() => fermerAtlas()); await page.waitForTimeout(300);
  const libere = await page.evaluate(() => ({ monte: atlasMonte === null, toile: document.querySelectorAll('#atlas-scene canvas').length }));
  await page.evaluate(() => ouvrirAtlas('exercice', { exercice: 'e265' })); await attendreAtlas(); await page.waitForTimeout(1200); await photo('5-exercice-squat');
  const ex = await page.evaluate(() => ({ titre: document.getElementById('titre-atlas').textContent, anim: !!atlasMonte.animation(), mode: atlasMonte.etat().mode, lecture: !document.querySelector('.atlas-barre .atlas-rond[hidden]') }));
  await page.evaluate(() => fermerAtlas());
  // D'autres exercices de la bibliothèque, d'autres familles de mouvements (EXOS=id,id… pour en choisir d'autres).
  const autres = (process.env.EXOS || 'e39,e119,e1136').split(',').filter(Boolean), animes = [];
  for (const id of autres) {
    await page.evaluate(id => ouvrirAtlas('exercice', { exercice: id }), id); await attendreAtlas(); await page.waitForTimeout(1200); await photo('6-exercice-' + id);
    animes.push(await page.evaluate(() => [document.getElementById('titre-atlas').textContent, !!atlasMonte.animation(), document.querySelector('.atlas-note').textContent]));
    await page.evaluate(() => fermerAtlas());
  }
  // Un exercice créé par l'utilisateur : ses muscles, corps au repos, et la fenêtre le dit.
  await page.evaluate(() => { musculationExosPerso.push({ id: 'exercice-maison', nom: 'Exercice maison', groupe: 'biceps', secondaires: [], materiel: 'haltere' }); ouvrirAtlas('exercice', { exercice: 'exercice-maison' }); });
  await attendreAtlas(); await photo('7-exercice-maison');
  const maison = await page.evaluate(() => [!!atlasMonte.animation(), document.querySelector('.atlas-note').textContent]);
  await page.evaluate(() => fermerAtlas());
  console.log('autres exercices', JSON.stringify(animes), '| exercice maison', JSON.stringify(maison));
  console.log('libéré à la fermeture', JSON.stringify(libere), '| exercice', JSON.stringify(ex), '| erreurs', JSON.stringify(erreurs));
  await nav.close();
})().catch(e => { console.error(e); process.exit(1); });
