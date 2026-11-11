// Catalogue visuel des mouvements : pour chaque exercice de la bibliothèque, le départ et l'arrivée de son mouvement dans le
// vrai rendu de l'atlas, rangés par groupe musculaire. Écrit des planches (cat-<groupe>-<n>.jpg) et catalogue.json, qui dit
// où trouver chaque exercice (planche, colonne, rang).
// Usage : node outils/catalogue-mouvements.cjs <dossier de sortie>
// Variables : DEPOT (le dépôt de l'appli), L, H (taille d'une vue), COLS (exercices par rangée), PAR (exercices par planche),
//             PAGES (rendus menés de front), CLAIR=1.
const { ouvrir } = require('./photo.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), vm = require('vm');
(async () => {
  const sortie = process.argv[2] || 'essai/catalogue';
  const DEPOT = process.env.DEPOT || path.join(__dirname, '..', '..', '..');
  const L = +(process.env.L || 220), H = +(process.env.H || 250), COLS = +(process.env.COLS || 5), PAR = +(process.env.PAR || 60), PAGES = +(process.env.PAGES || 3);
  // La bibliothèque telle que l'appli la montre : les exercices livrés, moins les doublons fusionnés dans le code.
  const html = fs.readFileSync(path.join(DEPOT, 'index.html'), 'utf8');
  const litteral = (debut, fin) => { const i = html.indexOf(debut); if (i < 0) throw new Error('introuvable : ' + debut); const j = html.indexOf(fin, i); return vm.runInNewContext('(' + html.slice(i + debut.length - 1, j + 2) + ')'); };
  const BASE = litteral('const EXERCICES_BASE = [', '\n];'), GROUPES = litteral('const GROUPES_MUSCULAIRES = {', '\n};'), FUSIONS = litteral('const FUSIONS_BIBLIOTHEQUE = {', '\n};');
  const specDe = Object.fromEntries(fs.readFileSync(path.join(DEPOT, 'outils', 'atlas', 'mouvements', 'table.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|').map(x => x.trim())).map(([id, spec]) => [id, spec]));
  const visibles = BASE.filter(e => !FUSIONS[e.id]);
  const sans = visibles.filter(e => !specDe[e.id]);
  if (sans.length) throw new Error('exercices sans mouvement : ' + sans.map(e => e.id).join(', '));
  const specs = [...new Set(visibles.map(e => specDe[e.id]))];
  fs.mkdirSync(sortie, { recursive: true });
  const tmp = path.join(sortie, 'tmp'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  // Rendu : deux vues par mouvement (départ, arrivée), cadrées sur le mouvement entier.
  const { nav, ctx } = await ouvrir({ viewport: { width: L, height: H }, deviceScaleFactor: 1 });
  const erreurs = []; let suivant = 0, faits = 0; const t0 = Date.now();
  const ouvrier = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => erreurs.push(e.message));
    await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1${process.env.CLAIR ? '&clair=1' : ''}`);
    await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
    for (;;) {
      const i = suivant++; if (i >= specs.length) break;
      for (const k of [0, 1]) {
        const r = await p.evaluate(([spec, u, premier]) => {
          try {
            if (premier) window.changer(spec, '', null);
            const d = window.anim.definition;
            if (d.rythme === 'continu' || d.rythme === 'boucle') window.anim.rendre((0.12 + 0.6 * u) * (d.periode || 1.2)); else window.anim.rendre(0, u);
            return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
          } catch (e) { return String(e && e.message || e); }
        }, [specs[i], k, k === 0]);
        if (r) erreurs.push(specs[i] + ' : ' + r);
        await p.screenshot({ path: path.join(tmp, `s${i}-${k}.png`) });
      }
      if (++faits % 100 === 0) console.log(faits, '/', specs.length, 'mouvements,', Math.round((Date.now() - t0) / 1000), 's');
    }
    await p.close();
  };
  await Promise.all(Array.from({ length: PAGES }, ouvrier));
  await nav.close();
  // Planches : par groupe, PAR exercices au plus, COLS par rangée ; chaque exercice occupe deux vues côte à côte.
  const indice = new Map(specs.map((s, i) => [s, i])), catalogue = { vue: [L, H], cols: COLS, groupes: [] };
  for (const g of Object.keys(GROUPES)) {
    const liste = visibles.filter(e => e.groupe === g).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    if (!liste.length) continue;
    const G = { id: g, nom: GROUPES[g], planches: [], exercices: [] };
    for (let n = 0; n * PAR < liste.length; n++) {
      const bloc = liste.slice(n * PAR, (n + 1) * PAR), rangs = Math.ceil(bloc.length / COLS), d = path.join(tmp, `p-${g}-${n}`), fichier = `cat-${g}-${n + 1}.jpg`;
      fs.mkdirSync(d);
      // Les rangées incomplètes sont complétées par la première vue (jamais montrée : aucune vignette ne pointe dessus).
      for (let k = 0; k < rangs * COLS; k++) { const e = bloc[k] || bloc[0], i = indice.get(specDe[e.id]); for (const v of [0, 1]) fs.symlinkSync(path.resolve(tmp, `s${i}-${v}.png`), path.join(d, `c${String(k * 2 + v).padStart(4, '0')}.png`)); }
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(d, 'c%04d.png'), '-vf', `tile=${COLS * 2}x${rangs}`, '-frames:v', '1', '-q:v', process.env.Q || '4', path.join(sortie, fichier)]);
      G.planches.push({ fichier, rangs });
      bloc.forEach((e, k) => G.exercices.push({ id: e.id, nom: e.nom, mouvement: specDe[e.id], planche: n, col: k % COLS, rang: Math.floor(k / COLS) }));
    }
    catalogue.groupes.push(G);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(sortie, 'catalogue.json'), JSON.stringify(catalogue));
  const poids = fs.readdirSync(sortie).filter(f => f.endsWith('.jpg')).reduce((s, f) => s + fs.statSync(path.join(sortie, f)).size, 0);
  console.log(`${visibles.length} exercices, ${specs.length} mouvements, ${catalogue.groupes.length} groupes, ${catalogue.groupes.reduce((s, g) => s + g.planches.length, 0)} planches, ${(poids / 1e6).toFixed(1)} Mo, ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log('erreurs', JSON.stringify([...new Set(erreurs)]));
})().catch(e => { console.error(e); process.exit(1); });
