// Les miniatures des exercices (listes de l'appli : bibliothèque, séance, programmes) : le corps de l'atlas, posé à
// l'instant le plus parlant de son mouvement, rendu par l'appli elle-même — mêmes couleurs, même peau, même matériel
// que le mouvement de la fiche — sur fond transparent (la case de la liste donne le fond de la fiche, clair ou sombre).
// Une image WebP par exercice de la bibliothèque : assets/atlas/vignettes/<identifiant>.webp. Le relevé
// (outils/atlas/mouvements/vignettes.json) garde, pour chacune, le mouvement montré, l'instant choisi et une clé : à la
// fois suivante, seules les miniatures dont le mouvement, les couleurs ou le moteur ont changé sont rendues de nouveau.
// Usage (depuis le dépôt) : node outils/atlas/outils/vignettes.cjs [identifiants séparés par des virgules]
// Variables : COTE (taille finale, en points d'image ; 176 = la case de 58 pt de la bibliothèque sur un écran ×3),
//             SUR (suréchantillonnage du rendu), Q (qualité WebP, 0 à 1), PAGES (rendus menés de front),
//             TOUT=1 (tout refaire, même ce qui est à jour).
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const DEPOT = path.join(__dirname, '..', '..', '..');
const { lancerNavigateur, ouvrirAppli } = require(path.join(DEPOT, 'tests', 'outils.js'));
const SORTIE = path.join(DEPOT, 'assets', 'atlas', 'vignettes');
const RELEVE = path.join(DEPOT, 'outils', 'atlas', 'mouvements', 'vignettes.json');
const COTE = +(process.env.COTE || 176), SUR = +(process.env.SUR || 3), Q = +(process.env.Q || 0.86), PAGES = +(process.env.PAGES || 3);
// La règle du choix de l'instant (à changer si la règle change : tout est alors refait).
const REGLE = 'arrivee-sauf-depart-1.2-milieu-1.25-pont-arrivee';
const sha = (...x) => { const h = crypto.createHash('sha1'); for (const v of x) h.update(v); return h.digest('hex'); };
// Le moteur, les mouvements et le modèle : une miniature rendue avec d'autres n'est plus à jour.
const MOTEUR = sha(...['atlas3d.js', 'atlas-mouvements.js', 'atlas.bin', 'atlas-peau.bin'].map(f => fs.readFileSync(path.join(DEPOT, 'assets', 'atlas', f))), REGLE, String(COTE), String(SUR), String(Q));

/* Une page de l'appli prête à rendre : le corps monté dans un cadre carré, fond transparent, tout le reste caché. */
async function ouvrirRendu(nav) {
  const R = COTE * SUR;
  const { page } = await ouvrirAppli(nav, { https: true, theme: 'light' });
  await page.setViewportSize({ width: R + 16, height: R + 16 });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.evaluate(async ([R, COTE, QUALITE]) => {
    appliquerTheme('light');
    const st = document.createElement('style');
    st.textContent = 'html,body{background:transparent!important} body>*:not(#vignette){visibility:hidden!important} #vignette,#vignette *{visibility:visible!important}';
    document.head.appendChild(st);
    const hote = document.createElement('div'); hote.id = 'vignette';
    hote.style.cssText = `position:fixed;left:0;top:0;width:${R}px;height:${R}px;z-index:2147483647;background:transparent;`;
    document.body.appendChild(hote);
    const [[tampon, peau]] = await Promise.all([chargerModeleAtlas(), chargerScriptAtlas(ATLAS_FICHIERS.moteur), chargerScriptAtlas(ATLAS_FICHIERS.mouvements)]);
    const clair = themeClairActif(), accent = couleurCssAtlas('--corps-cible', '#f472b6');
    // Comme la fiche de l'exercice (voir monterMouvementFiche).
    const a = AnqaAtlas.creer(hote, tampon, { clair, accent, peau, niveauPeau: peau ? 1 : 0 });
    let formes = [];
    const objets = a.objets.bind(a); a.objets = f => { formes = f || []; return objets(f); };
    const I = Object.fromEntries(a.squelette.map((j, k) => [j.nom, k]));
    const angle = (u, v) => { const l = Math.hypot(...u) * Math.hypot(...v); return l ? Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / l))) : 0; };
    const sub = (p, q) => [p.x - q.x, p.y - q.y, p.z - q.z];
    // Combien la pose s'écarte de la station debout, bras le long du corps : coudes, genoux, bras (contre le buste),
    // hanches, et l'enroulement de la colonne (bas du dos contre haut du dos).
    function flexion(c) {
      const P = n => c.pw[I[n]];
      let s = angle(sub(P('L1'), P('bassin')), sub(P('cou2'), P('thorax')));
      for (const x of ['G', 'D']) {
        s += angle(sub(P('ulna.' + x), P('humerus.' + x)), sub(P('main.' + x), P('ulna.' + x)));
        s += angle(sub(P('tibia.' + x), P('femur.' + x)), sub(P('pied.' + x), P('tibia.' + x)));
        s += 0.8 * angle(sub(P('femur.' + x), P('thorax')), sub(P('ulna.' + x), P('humerus.' + x)));
        s += 0.8 * (Math.PI - angle(sub(P('thorax'), P('femur.' + x)), sub(P('tibia.' + x), P('femur.' + x))));
      }
      return s;
    }
    // Familles dont l'arrivée est toujours l'image parlante, même moins fléchie (le pont : hanches hautes).
    const ARRIVEE = /^pont\b/;
    const image = () => new Promise(ok => requestAnimationFrame(() => ok()));
    let anim = null;
    window.__vignette = {
      // Ce qui décide de l'image : le mouvement et les couleurs de l'exercice.
      cle(id) {
        const exo = trouverExercice(id), mvt = exo && mouvementExercice(exo.id);
        if (!mvt) return null;
        const c = carteExerciceAtlas(exo, a.structures);
        return { mouvement: AnqaMouvements.specDe(mvt), couleurs: JSON.stringify(Object.entries(c.couleurs || {}).sort()) + '|' + c.muscle + c.tendon + c.os + c.peau + accent };
      },
      async rendre(id) {
        const exo = trouverExercice(id), mvt = exo && mouvementExercice(exo.id);
        if (!mvt) return { err: 'sans mouvement' };
        if (anim) anim.quitter();
        const c = carteExerciceAtlas(exo, a.structures);
        a.theme(AnqaAtlas.themeDeCarte(c)); a.colorer(c.couleurs || null, { tendons: c.tendons || 0 });
        anim = AnqaMouvements.creerAnimation(a, { exercice: mvt }, { clair });
        const d = anim.definition, continu = d.rythme === 'continu' || d.rythme === 'boucle', spec = AnqaMouvements.specDe(mvt);
        const poser = u => (continu ? anim.rendre((0.12 + 0.6 * u) * (d.periode || 1.2)) : anim.rendre(0, u));
        // L'instant montré : l'arrivée du mouvement (bras montés, barre tirée, buste enroulé, bas du squat…), sauf si
        // le départ est nettement plus fléchi (soulevé de terre pris au sol) ; un instant du milieu s'il l'est encore plus.
        const essais = [1, 0, 0.5, 0.25, 0.75].map(u => { poser(u); return { u, f: Math.round(flexion(anim.corps) * 100) / 100 }; });
        let choix = essais[0];
        if (!ARRIVEE.test(spec)) {
          if (essais[1].f > essais[0].f * 1.2) choix = essais[1];
          for (const e of essais.slice(2)) if (e.f > Math.max(essais[0].f, essais[1].f) * 1.25) choix = e;
        }
        poser(choix.u);
        // Cadrage serré sur cette pose : articulations (avec la chair) et matériel posé (sauf murs et colonnes).
        const mini = [1e9, 1e9, 1e9], maxi = [-1e9, -1e9, -1e9];
        const etendre = (x, y, z, r) => { mini[0] = Math.min(mini[0], x - r); mini[1] = Math.min(mini[1], y - r); mini[2] = Math.min(mini[2], z - r); maxi[0] = Math.max(maxi[0], x + r); maxi[1] = Math.max(maxi[1], y + r); maxi[2] = Math.max(maxi[2], z + r); };
        for (const pt of anim.corps.pw) etendre(pt.x, pt.y, pt.z, 0.09);
        for (const f of formes) {
          if (f.hors || Math.max(f.s[0], f.s[1], f.s[2]) > 1.9) continue;
          const tb = f.forme === 'tore' || f.forme === 'arc' ? (f.r || 0) : 0;
          const q = new AnqaMouvements.Quat(f.q[0], f.q[1], f.q[2], f.q[3]), dd = f.forme === 'boite' ? [f.s[0] / 2, f.s[1] / 2, f.s[2] / 2] : f.forme === 'cylindre' || f.forme === 'hexa' ? [f.s[0], f.s[1] / 2, f.s[2]] : [f.s[0] + tb, f.s[1] + tb, f.s[2] + tb];
          for (let k = 0; k < 8; k++) { const cc = new AnqaMouvements.V3(k & 1 ? dd[0] : -dd[0], k & 2 ? dd[1] : -dd[1], k & 4 ? dd[2] : -dd[2]).applyQuaternion(q); etendre(f.p[0] + cc.x, f.p[1] + cc.y, f.p[2] + cc.z, 0); }
        }
        mini[1] = Math.max(0, mini[1]);
        a.cadrerBoite(mini, maxi, anim.vue, 0);
        // Les fondus du moteur s'achèvent, l'image revient à sa pleine définition ; puis une image de plus, lue dans
        // la même image que le dessin du moteur (le tampon de dessin n'est pas gardé d'une image à l'autre).
        for (let k = 0; k < 4; k++) await image();
        await new Promise(ok => setTimeout(ok, 220));
        poser(choix.u);
        await image();
        const toile = a.toile, L = toile.width, H = toile.height;
        const c2 = document.createElement('canvas'); c2.width = L; c2.height = H;
        const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.drawImage(toile, 0, 0);
        const px = x2.getImageData(0, 0, L, H).data;
        // Ce qui est dessiné franchement (l'ombre au sol, très transparente, ne compte pas) : le carré qui l'entoure.
        let x0 = L, y0 = H, x1 = -1, y1 = -1;
        for (let j = 0; j < H; j++) for (let i = 0; i < L; i++) if (px[(j * L + i) * 4 + 3] > 150) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
        if (x1 < 0) return { err: 'image vide' };
        const cote = Math.ceil(Math.max(x1 - x0 + 1, y1 - y0 + 1) * 1.1), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        let cur = document.createElement('canvas'); cur.width = cur.height = cote;
        cur.getContext('2d').drawImage(c2, Math.round(cx - cote / 2), Math.round(cy - cote / 2 + cote * 0.015), cote, cote, 0, 0, cote, cote);
        // Réduction par moitiés, puis à la taille finale : un trait net, sans crénelage.
        while (cur.width / 2 > COTE) { const n = document.createElement('canvas'); n.width = n.height = Math.round(cur.width / 2); const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, n.width, n.height); cur = n; }
        const fin = document.createElement('canvas'); fin.width = fin.height = COTE;
        const g = fin.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, COTE, COTE);
        return { webp: fin.toDataURL('image/webp', QUALITE), instant: choix.u, mouvement: spec };
      }
    };
  }, [R, COTE, Q]);
  return { page, erreurs };
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SORTIE, { recursive: true });
  const ancien = fs.existsSync(RELEVE) ? JSON.parse(fs.readFileSync(RELEVE, 'utf8')) : { exercices: {} };
  const nav = await lancerNavigateur(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']);
  const pages = await Promise.all(Array.from({ length: PAGES }, () => ouvrirRendu(nav)));
  const p0 = pages[0].page;
  const tous = await p0.evaluate(() => EXERCICES_BASE.map(e => e.id).filter(id => mouvementExercice(id) === id));
  const demandes = process.argv[2] ? process.argv[2].split(',') : null;
  const releve = { version: 1, cote: COTE, regle: REGLE, exercices: {} };
  const aRendre = [];
  for (const id of tous) {
    const k = await p0.evaluate(id => window.__vignette.cle(id), id);
    if (!k) continue;
    const cle = sha(MOTEUR, k.mouvement, k.couleurs).slice(0, 16), avant = ancien.exercices[id];
    const fichier = path.join(SORTIE, id + '.webp');
    if (!process.env.TOUT && avant && avant.cle === cle && fs.existsSync(fichier) && (!demandes || !demandes.includes(id))) { releve.exercices[id] = avant; continue; }
    if (demandes && !demandes.includes(id)) { if (avant) releve.exercices[id] = avant; continue; }
    aRendre.push({ id, cle });
  }
  console.log(`${tous.length} exercices, ${aRendre.length} miniatures à rendre (${PAGES} pages)`);
  const erreurs = [];
  let suivant = 0, faits = 0;
  await Promise.all(pages.map(async ({ page }) => {
    for (;;) {
      const i = suivant++; if (i >= aRendre.length) break;
      const { id, cle } = aRendre[i];
      const r = await page.evaluate(id => window.__vignette.rendre(id), id);
      if (r.err) { erreurs.push(id + ' : ' + r.err); continue; }
      const octets = Buffer.from(r.webp.split(',')[1], 'base64');
      fs.writeFileSync(path.join(SORTIE, id + '.webp'), octets);
      releve.exercices[id] = { mouvement: r.mouvement, instant: r.instant, octets: octets.length, cle };
      if (++faits % 50 === 0) console.log(faits, '/', aRendre.length, Math.round((Date.now() - t0) / 1000), 's');
    }
  }));
  // Les miniatures d'exercices sortis de la bibliothèque s'en vont avec eux.
  for (const f of fs.readdirSync(SORTIE)) if (f.endsWith('.webp') && !releve.exercices[f.slice(0, -5)]) fs.rmSync(path.join(SORTIE, f));
  releve.exercices = Object.fromEntries(Object.entries(releve.exercices).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(RELEVE, JSON.stringify(releve, null, 1) + '\n');
  const n = Object.keys(releve.exercices).length, poids = Object.values(releve.exercices).reduce((s, x) => s + x.octets, 0);
  console.log(`${n} miniatures (${faits} rendues), ${(poids / 1e6).toFixed(2)} Mo, ${Math.round((Date.now() - t0) / 1000)} s`);
  const erreursPages = pages.flatMap(p => p.erreurs);
  if (erreurs.length || erreursPages.length) { console.log('erreurs', JSON.stringify([...erreurs, ...new Set(erreursPages)])); process.exitCode = 1; }
  await nav.close();
})().catch(e => { console.error(e); process.exit(1); });
