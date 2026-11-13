// Les miniatures des exercices (listes de l'appli : bibliothèque, séance, programmes) : le corps de l'atlas exécutant
// son mouvement, rendu par l'appli elle-même — mêmes couleurs, même peau, même matériel que la fiche.
// Pour chaque exercice de la bibliothèque, dans assets/atlas/vignettes/ :
//   <identifiant>.webp        l'image fixe, fond transparent (la case de la liste donne le fond de la fiche) : le corps à
//                             l'instant le plus parlant du mouvement ;
//   <identifiant>.clair.mp4   une répétition entière en boucle, qui part de ce même instant, cadrée comme l'image fixe,
//   <identifiant>.sombre.mp4  sur le fond de la fiche en thème clair, et en thème sombre (H.264 : la vidéo n'a pas de
//                             transparence, elle porte le fond de la case).
// Le relevé (outils/atlas/mouvements/vignettes.json) garde, pour chacune, le mouvement montré, l'instant choisi et une
// clé : à la fois suivante, seules les miniatures dont le mouvement, les couleurs ou le moteur ont changé sont refaites.
// Usage (depuis le dépôt) : node outils/atlas/outils/vignettes.cjs [identifiants séparés par des virgules]
// Variables : COTE (taille finale, en points d'image ; 176 = la case de 58 pt de la bibliothèque sur un écran ×3),
//             SUR (suréchantillonnage du rendu), Q (qualité WebP, 0 à 1), CRF (qualité H.264 : plus bas, plus fin),
//             IPS (images par seconde de la boucle), PAGES (rendus menés de front), TOUT=1 (tout refaire),
//             SORTIE (un autre dossier que assets/atlas/vignettes, pour un essai ; le relevé n'est alors pas écrit).
const path = require('path'), fs = require('fs'), crypto = require('crypto'), os = require('os');
const { execFile } = require('child_process');
const executer = (cmd, args) => new Promise((ok, ko) => execFile(cmd, args, e => (e ? ko(e) : ok())));
const DEPOT = path.join(__dirname, '..', '..', '..');
const { lancerNavigateur, ouvrirAppli } = require(path.join(DEPOT, 'tests', 'outils.js'));
const ESSAI = !!process.env.SORTIE;
const SORTIE = process.env.SORTIE || path.join(DEPOT, 'assets', 'atlas', 'vignettes');
const RELEVE = path.join(DEPOT, 'outils', 'atlas', 'mouvements', 'vignettes.json');
const COTE = +(process.env.COTE || 176), SUR = +(process.env.SUR || 2), Q = +(process.env.Q || 0.86), CRF = +(process.env.CRF || 31);
const IPS = +(process.env.IPS || 15), PAGES = +(process.env.PAGES || 2);
// Le fond de la fiche du mouvement (assets/styles.css, .fiche-exo-3d et img.vignette-3d), dans chaque thème.
const FONDS = {
  clair: 'radial-gradient(ellipse 75% 60% at 50% 42%, #ffffff 0%, #eef1f6 60%, #e2e6ee 100%)',
  sombre: 'radial-gradient(ellipse 75% 60% at 50% 42%, #1b1e27 0%, #0d0f15 55%, #07080b 100%)'
};
// La règle du choix de l'instant et du cadrage (à changer si elle change : tout est alors refait).
const REGLE = 'boucle-3-arrivee-sauf-depart-1.2-milieu-1.25-pont-arrivee-cadrage-repetition-seiziemes-fond-rgb';
const sha = (...x) => { const h = crypto.createHash('sha1'); for (const v of x) h.update(v); return h.digest('hex'); };
// Le moteur, les mouvements et le modèle : une miniature rendue avec d'autres n'est plus à jour.
const MOTEUR = sha(...['atlas3d.js', 'atlas-mouvements.js', 'atlas.bin', 'atlas-peau.bin'].map(f => fs.readFileSync(path.join(DEPOT, 'assets', 'atlas', f))),
  REGLE, String(COTE), String(SUR), String(Q), String(CRF), String(IPS), JSON.stringify(FONDS));

/* Une page de l'appli prête à rendre : le corps monté dans un cadre carré, fond transparent, tout le reste caché. */
async function ouvrirRendu(nav) {
  const R = COTE * SUR;
  const { page } = await ouvrirAppli(nav, { https: true, theme: 'light' });
  await page.setViewportSize({ width: R + 16, height: R + 16 });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.evaluate(async ([R, COTE, QUALITE, IPS]) => {
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
    // L'image du moteur, lue dans la même image que son dessin (le tampon de dessin n'est pas gardé d'une image à l'autre).
    async function lire() {
      await image();
      const t = a.toile, c = document.createElement('canvas'); c.width = t.width; c.height = t.height;
      c.getContext('2d', { willReadFrequently: true }).drawImage(t, 0, 0);
      return c;
    }
    function reduire(src, sx, sy, cote) {
      let cur = document.createElement('canvas'); cur.width = cur.height = cote;
      cur.getContext('2d').drawImage(src, sx, sy, cote, cote, 0, 0, cote, cote);
      // Réduction par moitiés, puis à la taille finale : un trait net, sans crénelage.
      while (cur.width / 2 > COTE) { const n = document.createElement('canvas'); n.width = n.height = Math.round(cur.width / 2); const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, n.width, n.height); cur = n; }
      const fin = document.createElement('canvas'); fin.width = fin.height = COTE;
      const g = fin.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, COTE, COTE);
      return fin;
    }
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
        const d = anim.definition, continu = d.rythme === 'continu' || d.rythme === 'boucle', spec = AnqaMouvements.specDe(mvt), periode = d.periode || 1.2;
        const poser = u => (continu ? anim.rendre((0.12 + 0.6 * u) * periode) : anim.rendre(0, u));
        // L'instant montré : l'arrivée du mouvement (bras montés, barre tirée, buste enroulé, bas du squat…), sauf si le
        // départ est nettement plus fléchi (soulevé de terre pris au sol) ; un instant du milieu s'il l'est encore plus.
        const essais = [1, 0, 0.5, 0.25, 0.75].map(u => { poser(u); return { u, f: Math.round(flexion(anim.corps) * 100) / 100 }; });
        let choix = essais[0];
        if (!ARRIVEE.test(spec)) {
          if (essais[1].f > essais[0].f * 1.2) choix = essais[1];
          for (const e of essais.slice(2)) if (e.f > Math.max(essais[0].f, essais[1].f) * 1.25) choix = e;
        }
        // Le moment de la répétition où le corps a cette pose : la boucle part de là (son image fixe est sa première image).
        poser(choix.u);
        const cible = anim.corps.pw.map(p => [p.x, p.y, p.z]);
        let t0 = continu ? (0.12 + 0.6 * choix.u) * periode : 0, ecart = Infinity;
        if (!continu) for (let m = 0; m < 96; m++) {
          const t = m / 96 * periode; anim.rendre(t);
          let e = 0; anim.corps.pw.forEach((p, k) => { const q = cible[k]; e += (p.x - q[0]) ** 2 + (p.y - q[1]) ** 2 + (p.z - q[2]) ** 2; });
          if (e < ecart) { ecart = e; t0 = t; }
        }
        // Toute la répétition, cadrée une fois pour toutes (articulations avec la chair, matériel) : le corps ne saute
        // pas d'une image à l'autre, et l'image fixe a le même cadrage que la boucle qui la remplace.
        anim.rendre(t0); anim.cadrer(0);
        for (let k = 0; k < 4; k++) await image();
        await new Promise(ok => setTimeout(ok, 220));
        // 15 images par seconde (10 pour les gestes continus, dont chaque image est une pose nouvelle).
        const n = continu ? Math.max(16, Math.min(28, Math.round(periode * 10))) : Math.max(16, Math.min(48, Math.round(periode * IPS)));
        // Une pose déjà dessinée n'est pas redessinée : en aller-retour, la descente repasse par les poses de la montée,
        // et les temps d'arrêt répètent la même. (Dessiner le corps coûte une demi-seconde par image en rendu logiciel.)
        const brutes = [], vues = new Map(), tImages = performance.now();
        let dessinees = 0;
        // Hors gestes continus, l'avancée du mouvement est arrondie au seizième : dix-sept poses au plus (deux fois
        // plus pour un geste alterné), chacune dessinée exactement à son avancée.
        for (let k = 0; k < n; k++) {
          const t = (t0 + k / n * periode) % periode, av = AnqaMouvements.avancee(d, t);
          const q = x => (x == null ? '' : Math.round(x * 16));
          const cle = continu ? 't' + k : [av.u, av.uG, av.uD].map(q).join('|');
          if (!vues.has(cle)) {
            if (continu || d.rythme === 'alt') anim.rendre(t); else anim.rendre(0, Math.round(av.u * 16) / 16);
            vues.set(cle, await lire()); dessinees++;
          }
          brutes.push(vues.get(cle));
        }
        const dureeImages = performance.now() - tImages;
        // Le carré qui contient tout ce qui est dessiné franchement pendant la répétition (l'ombre au sol, très
        // transparente, ne compte pas), avec une marge.
        const L = brutes[0].width, H = brutes[0].height;
        let x0 = L, y0 = H, x1 = -1, y1 = -1;
        for (const b of new Set(brutes)) {
          const px = b.getContext('2d').getImageData(0, 0, L, H).data;
          for (let j = 0; j < H; j++) for (let i = 0; i < L; i++) if (px[(j * L + i) * 4 + 3] > 150) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
        }
        if (x1 < 0) return { err: 'image vide' };
        const cote = Math.ceil(Math.max(x1 - x0 + 1, y1 - y0 + 1) * 1.06), sx = Math.round((x0 + x1) / 2 - cote / 2), sy = Math.round((y0 + y1) / 2 - cote / 2 + cote * 0.012);
        const reduites = new Map([...new Set(brutes)].map(b => [b, reduire(b, sx, sy, cote)]));
        const images = brutes.map(b => reduites.get(b));
        return { webp: images[0].toDataURL('image/webp', QUALITE), images: images.map(i => i.toDataURL('image/png')), instant: choix.u, t0: Math.round(t0 * 1000) / 1000, periode, mouvement: spec,
          temps: { images: Math.round(dureeImages), dessinees, parImage: Math.round(dureeImages / Math.max(1, dessinees)), toile: [a.toile.width, a.toile.height] } };
      }
    };
  }, [R, COTE, Q, IPS]);
  return { page, erreurs };
}

/* Les fonds de la case, à la taille des miniatures, dessinés par le navigateur à partir du CSS même de l'appli. */
async function dessinerFonds(nav, dossier) {
  const ctx = await nav.newContext({ viewport: { width: COTE, height: COTE }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(), fichiers = {};
  for (const [nom, fond] of Object.entries(FONDS)) {
    await p.setContent(`<body style="margin:0"><div style="width:${COTE}px;height:${COTE}px;background:${fond}"></div>`);
    fichiers[nom] = path.join(dossier, 'fond-' + nom + '.png');
    await p.screenshot({ path: fichiers[nom] });
  }
  await ctx.close();
  return fichiers;
}

/* La boucle d'un thème : les images posées sur le fond, en H.264 (lu partout sur iPhone), sans son, prête à lire dès
   le début du fichier. */
function encoder(images, fps, fond, sortie) {
  return executer('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-loop', '1', '-i', fond, '-framerate', String(fps), '-i', path.join(images, 'f%03d.png'),
    '-filter_complex', '[0][1]overlay=shortest=1:format=rgb,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-g', '999', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-color_range', 'tv', '-movflags', '+faststart', '-an', sortie]);
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SORTIE, { recursive: true });
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'vignettes-'));
  const ancien = fs.existsSync(RELEVE) ? JSON.parse(fs.readFileSync(RELEVE, 'utf8')) : { exercices: {} };
  const nav = await lancerNavigateur(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']);
  const fonds = await dessinerFonds(nav, travail);
  const pages = await Promise.all(Array.from({ length: PAGES }, () => ouvrirRendu(nav)));
  const p0 = pages[0].page;
  const tous = await p0.evaluate(() => EXERCICES_BASE.map(e => e.id).filter(id => mouvementExercice(id) === id));
  const demandes = process.argv[2] ? process.argv[2].split(',') : null;
  const releve = { version: 2, cote: COTE, regle: REGLE, fonds: FONDS, exercices: {} };
  const fichiersDe = id => ({ image: path.join(SORTIE, id + '.webp'), clair: path.join(SORTIE, id + '.clair.mp4'), sombre: path.join(SORTIE, id + '.sombre.mp4') });
  // Le relevé est écrit en chemin : une reprise après interruption ne refait que ce qui n'est pas encore à jour.
  const ecrireReleve = () => {
    if (ESSAI) return;
    const tout = Object.assign({}, ancien.exercices, releve.exercices);
    const r = Object.assign({}, releve, { exercices: Object.fromEntries(Object.entries(tout).filter(([id]) => tous.includes(id)).sort(([a], [b]) => a.localeCompare(b))) });
    fs.writeFileSync(RELEVE, JSON.stringify(r, null, 1) + '\n');
  };
  const aRendre = [];
  for (const id of tous) {
    if (demandes && !demandes.includes(id)) { if (ancien.exercices[id]) releve.exercices[id] = ancien.exercices[id]; continue; }
    const k = await p0.evaluate(id => window.__vignette.cle(id), id);
    if (!k) continue;
    const cle = sha(MOTEUR, k.mouvement, k.couleurs).slice(0, 16), avant = ancien.exercices[id];
    if (!ESSAI && !process.env.TOUT && !demandes && avant && avant.cle === cle && Object.values(fichiersDe(id)).every(f => fs.existsSync(f))) { releve.exercices[id] = avant; continue; }
    aRendre.push({ id, cle });
  }
  console.log(`${tous.length} exercices, ${aRendre.length} miniatures à rendre (${PAGES} pages)`);
  const erreurs = [];
  let suivant = 0, faits = 0;
  await Promise.all(pages.map(async ({ page }, np) => {
    for (;;) {
      const i = suivant++; if (i >= aRendre.length) break;
      const { id, cle } = aRendre[i];
      const r = await page.evaluate(id => window.__vignette.rendre(id), id);
      if (r.err) { erreurs.push(id + ' : ' + r.err); continue; }
      if (process.env.TEMPS) console.log(id, JSON.stringify(r.temps), r.images.length, 'images');
      const f = fichiersDe(id), dossier = path.join(travail, 'p' + np);
      fs.rmSync(dossier, { recursive: true, force: true }); fs.mkdirSync(dossier);
      r.images.forEach((u, k) => fs.writeFileSync(path.join(dossier, `f${String(k).padStart(3, '0')}.png`), Buffer.from(u.split(',')[1], 'base64')));
      const fps = Math.round(r.images.length / r.periode * 1000) / 1000;
      await Promise.all(['clair', 'sombre'].map(th => encoder(dossier, fps, fonds[th], f[th])));
      fs.writeFileSync(f.image, Buffer.from(r.webp.split(',')[1], 'base64'));
      releve.exercices[id] = { mouvement: r.mouvement, instant: r.instant, depart: r.t0, periode: r.periode, images: r.images.length,
        octets: { image: fs.statSync(f.image).size, clair: fs.statSync(f.clair).size, sombre: fs.statSync(f.sombre).size }, cle };
      if (++faits % 10 === 0) { ecrireReleve(); if (faits % 50 === 0) console.log(faits, '/', aRendre.length, Math.round((Date.now() - t0) / 1000), 's'); }
    }
  }));
  fs.rmSync(travail, { recursive: true, force: true });
  if (!ESSAI) {
    // Les miniatures d'exercices sortis de la bibliothèque s'en vont avec eux.
    for (const f of fs.readdirSync(SORTIE)) { const id = f.replace(/\.(webp|clair\.mp4|sombre\.mp4)$/, ''); if (!releve.exercices[id]) fs.rmSync(path.join(SORTIE, f)); }
    releve.exercices = Object.fromEntries(Object.entries(releve.exercices).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(RELEVE, JSON.stringify(releve, null, 1) + '\n');
  }
  const liste = Object.values(releve.exercices), somme = k => liste.reduce((s, x) => s + (x.octets && x.octets[k] || 0), 0);
  console.log(`${liste.length} miniatures (${faits} rendues) : images ${(somme('image') / 1e6).toFixed(2)} Mo, boucles ${((somme('clair') + somme('sombre')) / 1e6).toFixed(2)} Mo, ${Math.round((Date.now() - t0) / 1000)} s`);
  const erreursPages = pages.flatMap(p => p.erreurs);
  if (erreurs.length || erreursPages.length) { console.log('erreurs', JSON.stringify([...erreurs, ...new Set(erreursPages)])); process.exitCode = 1; }
  await nav.close();
})().catch(e => { console.error(e); process.exit(1); });
