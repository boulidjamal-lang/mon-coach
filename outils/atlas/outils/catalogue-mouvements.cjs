// Catalogue visuel des mouvements : pour chaque exercice de la bibliothèque, le départ et l'arrivée de son mouvement dans le
// vrai rendu de l'atlas, tel que l'appli le montre (peau, muscles de l'exercice en couleur), rangés par groupe musculaire.
// Écrit des planches (cat-<groupe>-<n>.jpg) et catalogue.json, qui dit où trouver chaque exercice (planche, colonne, rang).
// Les vues sont gardées d'une fois sur l'autre (dossier vues/) : seuls les mouvements nouveaux ou modifiés sont rendus.
// Usage : node outils/catalogue-mouvements.cjs <dossier de sortie>
// Variables : DEPOT (le dépôt de l'appli), L, H (taille d'une vue), COLS (exercices par rangée), PAR (exercices par planche),
//             PAGES (rendus menés de front), PEAU (0 écorché ; 1 tête, mains et pieds : par défaut, comme l'appli ; 2 entière),
//             CLAIR=1, REFAIRE=<expression> (rend de nouveau les mouvements qui la contiennent, par exemple après avoir
//             retouché une famille : REFAIRE="^squat"), Q (qualité des planches, 2 à 8).
const { ouvrir } = require('./photo.cjs');
const { bibliotheque, couleursExercices } = require('./exercices-appli.cjs');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const cleDe = texte => crypto.createHash('sha1').update(texte).digest('hex').slice(0, 16);
(async () => {
  const sortie = process.argv[2] || 'essai/catalogue';
  const DEPOT = process.env.DEPOT || path.join(__dirname, '..', '..', '..');
  const L = +(process.env.L || 220), H = +(process.env.H || 250), COLS = +(process.env.COLS || 5), PAR = +(process.env.PAR || 60), PAGES = +(process.env.PAGES || 3);
  const PEAU = process.env.PEAU == null ? 1 : +process.env.PEAU, clair = !!process.env.CLAIR;
  const { visibles, GROUPES, specDe } = bibliotheque(DEPOT);
  const t0 = Date.now();
  // Les couleurs de chaque exercice, demandées à l'appli.
  const { couleurs, neutres } = await couleursExercices(DEPOT, visibles.map(e => e.id), clair);
  // Une vue par couple (mouvement, couleurs) : deux exercices qui partagent l'un et l'autre partagent leurs images.
  const rendu = e => ({ spec: specDe[e.id], couleurs: couleurs[e.id] || {} });
  const cle = e => { const r = rendu(e); return cleDe(r.spec + '|' + JSON.stringify(Object.entries(r.couleurs).sort())); };
  const vues = path.join(sortie, 'vues', `${L}x${H}-peau${PEAU}${clair ? '-clair' : ''}`);
  fs.mkdirSync(vues, { recursive: true });
  const vue = (k, i) => path.join(vues, `${k}-${i}.png`);
  const refaire = process.env.REFAIRE ? new RegExp(process.env.REFAIRE) : null;
  const aRendre = new Map();
  for (const e of visibles) { const k = cle(e); if ((refaire && refaire.test(specDe[e.id])) || !fs.existsSync(vue(k, 0)) || !fs.existsSync(vue(k, 1))) aRendre.set(k, rendu(e)); }
  const liste = [...aRendre], erreurs = [];
  console.log(`${visibles.length} exercices, ${new Set(visibles.map(cle)).size} vues différentes, ${liste.length} à rendre`);
  if (liste.length) {
    // Rendu : deux vues par mouvement (départ, arrivée), cadrées sur le mouvement entier.
    const { nav, ctx } = await ouvrir({ viewport: { width: L, height: H }, deviceScaleFactor: 1 });
    let suivant = 0, faits = 0;
    const ouvrier = async () => {
      const p = await ctx.newPage();
      p.on('pageerror', e => erreurs.push(e.message));
      await p.goto(`http://atlas.local/appli/essai-mouvement.html?spec=repos&pp=1${PEAU ? '&peau=' + PEAU : ''}${clair ? '&clair=1' : ''}`);
      await p.waitForFunction(() => window.pret, null, { timeout: 180000 });
      await p.evaluate(n => { window.atlas.theme(AnqaAtlas.themeDeCarte(Object.assign({}, n, { estompe: 0.5 }))); }, neutres);
      for (;;) {
        const i = suivant++; if (i >= liste.length) break;
        const [k, r] = liste[i];
        for (const u of [0, 1]) {
          const err = await p.evaluate(([spec, couleurs, u, premier]) => {
            try {
              if (premier) { window.changer(spec, '', null); window.atlas.colorer(couleurs, { tendons: 0.3 }); }
              const d = window.anim.definition;
              if (d.rythme === 'continu' || d.rythme === 'boucle') window.anim.rendre((0.12 + 0.6 * u) * (d.periode || 1.2)); else window.anim.rendre(0, u);
              return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
            } catch (e) { return String(e && e.message || e); }
          }, [r.spec, r.couleurs, u, u === 0]);
          if (err) erreurs.push(r.spec + ' : ' + err);
          await p.screenshot({ path: vue(k, u) });
        }
        if (++faits % 100 === 0) console.log(faits, '/', liste.length, 'vues,', Math.round((Date.now() - t0) / 1000), 's');
      }
      await p.close();
    };
    await Promise.all(Array.from({ length: Math.min(PAGES, liste.length) }, ouvrier));
    await nav.close();
  }
  // Planches : par groupe, PAR exercices au plus, COLS par rangée ; chaque exercice occupe deux vues côte à côte.
  for (const f of fs.readdirSync(sortie)) if (/^cat-.*\.jpg$/.test(f)) fs.rmSync(path.join(sortie, f));
  const tmp = path.join(sortie, 'tmp'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  const catalogue = { vue: [L, H], cols: COLS, peau: PEAU, groupes: [] };
  for (const g of Object.keys(GROUPES)) {
    const exos = visibles.filter(e => e.groupe === g).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    if (!exos.length) continue;
    const G = { id: g, nom: GROUPES[g], planches: [], exercices: [] };
    for (let n = 0; n * PAR < exos.length; n++) {
      const bloc = exos.slice(n * PAR, (n + 1) * PAR), rangs = Math.ceil(bloc.length / COLS), d = path.join(tmp, `p-${g}-${n}`), fichier = `cat-${g}-${n + 1}.jpg`;
      fs.mkdirSync(d);
      // Une rangée incomplète est complétée par la première vue (jamais montrée : aucune vignette ne pointe dessus).
      for (let k = 0; k < rangs * COLS; k++) { const e = bloc[k] || bloc[0]; for (const v of [0, 1]) fs.symlinkSync(path.resolve(vue(cle(e), v)), path.join(d, `c${String(k * 2 + v).padStart(4, '0')}.png`)); }
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(d, 'c%04d.png'), '-vf', `tile=${COLS * 2}x${rangs}`, '-frames:v', '1', '-q:v', process.env.Q || '4', path.join(sortie, fichier)]);
      G.planches.push({ fichier, rangs });
      bloc.forEach((e, k) => G.exercices.push({ id: e.id, nom: e.nom, mouvement: specDe[e.id], planche: n, col: k % COLS, rang: Math.floor(k / COLS) }));
    }
    catalogue.groupes.push(G);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(sortie, 'catalogue.json'), JSON.stringify(catalogue));
  const poids = fs.readdirSync(sortie).filter(f => f.endsWith('.jpg')).reduce((s, f) => s + fs.statSync(path.join(sortie, f)).size, 0);
  console.log(`${catalogue.groupes.length} groupes, ${catalogue.groupes.reduce((s, g) => s + g.planches.length, 0)} planches, ${(poids / 1e6).toFixed(1)} Mo, ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log('erreurs', JSON.stringify([...new Set(erreurs)]));
})().catch(e => { console.error(e); process.exit(1); });
