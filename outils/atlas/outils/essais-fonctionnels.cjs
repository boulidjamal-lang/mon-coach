// Essais fonctionnels de l'atlas (page d'essai, taille d'un iPhone, écran tactile) : gestes, sélection, couches,
// vues, index, perte et reprise du contexte graphique. Chaque essai dit ce qu'il a réellement observé.
const { ouvrir } = require('./photo.cjs');
const fs = require('fs');
const R = []; let p, client;
const noter = (nom, ok, detail) => { R.push({ nom, ok: !!ok, detail }); console.log((ok ? '  OK   ' : '  ÉCHEC') + ' ' + nom + (detail ? ' — ' + detail : '')); };
const attendre = ms => new Promise(r => setTimeout(r, ms));
const ev = (f, ...a) => p.evaluate(f, ...a);
const cam = () => ev(() => monte.atlas.camera());
// Repos : plus aucune image demandée ni transition en cours, deux contrôles de suite (ne dépend pas du temps de calcul d'une image).
const repos = async () => { let calme = 0; for (let i = 0; i < 300 && calme < 2; i++) { calme = (await ev(() => monte.atlas.mesures().enCours)) ? 0 : calme + 1; await attendre(60); } };
// Carte des structures visibles : pour chaque structure et chaque côté, nombre de points et un point sûr de l'écran.
const carte = pas => ev(pas => monte.atlas.carteReperage(pas || 3), pas);
// Les gestes partent avec l'heure propre de chaque événement, comme ceux d'un vrai doigt : ce que le moteur mesure
// (durée d'une touche, délai d'une double touche, élan au lâcher) ne dépend pas du temps que ce navigateur sans carte
// graphique met à calculer une image. Deux gestes distincts sont séparés d'au moins une seconde.
let heure = 0;
const geste = () => { heure = Math.max(heure + 1, Date.now() / 1000); };
const doigt = (type, pts, dt) => { heure += dt == null ? 0.016 : dt; return client.send('Input.dispatchTouchEvent', { type, touchPoints: pts, timestamp: heure }); };
const toucher = async (x, y) => { geste(); await doigt('touchStart', [{ x, y, id: 1 }], 0); await doigt('touchEnd', [], 0.05); await attendre(80); };
// Le navigateur livre les déplacements du doigt au rythme des images : avant de lire la caméra en plein geste, on laisse
// passer deux images, pour que le dernier déplacement envoyé soit bien arrivé à la page.
const livre = () => ev(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const doubleToucher = async (x, y) => { geste(); await doigt('touchStart', [{ x, y, id: 1 }], 0); await doigt('touchEnd', [], 0.04); await doigt('touchStart', [{ x, y, id: 1 }], 0.08); await doigt('touchEnd', [], 0.04); };
// Un point de l'écran qui appartient sûrement à la structure (pris sur la carte de repérage).
const pointDe = async (id, cote) => { const c = await carte(3), r = await ev(() => { const r = monte.atlas.toile.getBoundingClientRect(); return [r.left, r.top]; }); const cles = (cote ? [id + '|' + cote] : [id + '|gauche', id + '|droit']).filter(k => c[k]).sort((u, v) => c[v].n - c[u].n); return cles.length ? { x: c[cles[0]].x + r[0], y: c[cles[0]].y + r[1], n: c[cles[0]].n, marge: c[cles[0]].marge } : null; };

async function page(reduit) {
  const { nav, ctx } = await ouvrir({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, reducedMotion: reduit ? 'reduce' : 'no-preference' });
  p = await ctx.newPage();
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', c => { if (c.type() === 'error') erreurs.push(c.text()); });
  const t0 = Date.now();
  await p.goto('http://atlas.local/appli/essai-ui.html?mode=anatomie&attente=300');
  await p.waitForFunction(() => window.pret, null, { timeout: 120000 });
  client = await ctx.newCDPSession(p);
  return { nav, duree: Date.now() - t0 };
}
const erreurs = [];
// Dans les comptes rendus, les muscles portent leur nom d'usage (et leur côté), pas leur identifiant.
let NOMS = {};
const nom = id => { if (id == null) return 'aucun'; const [i, cote] = String(id).split('|'); return (NOMS[i] || i) + (cote ? ' ' + cote : ''); };
const MVT = { squat: 'squat', developpeCouche: 'développé couché', curl: 'curl', traction: 'traction', pompe: 'pompe', elevationsLaterales: 'élévations latérales', souleveDeTerre: 'soulevé de terre', rowing: 'rowing' };
(async () => {
  let { nav, duree } = await page(true);

  NOMS = await ev(() => Object.fromEntries(monte.atlas.structures.map(s => [s.id, s.nom])));
  const m0 = await ev(() => monte.atlas.mesures());
  noter('chargement et premier affichage', m0.images > 0, `${duree} ms jusqu'à la page prête (navigateur de test, rendu logiciel), ${m0.triangles} triangles par côté, ${m0.appelsDeDessin} appels de dessin, image ${m0.largeur}×${m0.hauteur}`);
  await repos();

  // 1. Repos : rien ne se redessine quand on ne touche à rien.
  const i0 = await ev(() => monte.atlas.mesures().images); await attendre(1200); const i1 = await ev(() => monte.atlas.mesures().images);
  noter('au repos, aucune image recalculée', i1 === i0, `${i1 - i0} image en 1,2 s`);

  // 2. Sélection au toucher, de face puis de dos.
  const essaisTouche = [['face', ['pectoral_sternal', 'pectoral_claviculaire', 'grand_droit_abdomen', 'oblique_externe', 'deltoide_anterieur', 'biceps_long', 'biceps_court', 'droit_femoral', 'vaste_medial', 'vaste_lateral', 'tibial_anterieur', 'sartorius', 'dentele_anterieur', 'brachio_radial', 'long_adducteur']],
    ['dos', ['grand_dorsal', 'trapeze_superieur', 'trapeze_moyen', 'trapeze_inferieur', 'deltoide_posterieur', 'infra_epineux', 'grand_rond', 'triceps_long', 'triceps_lateral', 'grand_fessier', 'moyen_fessier', 'biceps_femoral_long', 'semi_tendineux', 'semi_membraneux', 'gastrocnemien_medial', 'gastrocnemien_lateral', 'soleaire']]];
  for (const [vue, ids] of essaisTouche) {
    await ev(v => monte.atlas.vue(v, 0), vue); await repos();
    const ok = [], ko = [], rapproches = [];
    for (const id of ids) {
      let pt = await pointDe(id); if (!pt) { ko.push(nom(id) + ' (invisible)'); continue; }
      // Corps entier, un muscle mince n'offre que quelques pixels : on s'en approche d'abord, comme on le ferait au doigt.
      if (pt.marge < 3) { await ev(id => monte.atlas.cadrer(id, 0), id); await repos(); pt = await pointDe(id); rapproches.push(id); }
      await toucher(pt.x, pt.y);
      const e = await ev(() => ({ c: monte.etat().choisi, titre: (document.querySelector('.atlas-fiche[data-ouverte] h3') || {}).textContent || null }));
      const titre = NOMS[id];
      (e.c === id && e.titre === titre ? ok : ko).push(nom(id) + (e.c === id ? '' : ' → ' + nom(e.c)));
      await ev(v => { monte.choisir(null); monte.atlas.reinitialiser(0); monte.atlas.vue(v, 0); }, vue); await repos();
    }
    noter(`toucher un muscle le choisit et affiche sa fiche (vue de ${vue})`, !ko.length, `${ok.length}/${ids.length}` + (rapproches.length ? ` (après s'être rapproché, trop minces corps entier : ${rapproches.map(nom).join(', ')})` : '') + (ko.length ? ' ; manqués : ' + ko.join(', ') : ''));
  }

  // 3. Désélection : toucher le même muscle, toucher le vide, bouton de fermeture.
  await ev(() => monte.atlas.vue('face', 0)); await repos();
  let pt = await pointDe('pectoral_sternal');
  await toucher(pt.x, pt.y); const s1 = await ev(() => monte.etat().choisi); await attendre(450);
  pt = await pointDe('pectoral_sternal'); await toucher(pt.x, pt.y); const s2 = await ev(() => monte.etat().choisi);
  noter('toucher de nouveau le muscle choisi le désélectionne', s1 === 'pectoral_sternal' && s2 === null, `${nom(s1)} choisi, puis ${s2 === null ? 'plus rien' : nom(s2)}`);
  await repos(); await attendre(400);
  pt = await pointDe('pectoral_sternal'); await toucher(pt.x, pt.y); await attendre(450); await toucher(22, 300); const s3 = await ev(() => monte.etat().choisi);
  noter('toucher le vide désélectionne', s3 === null, s3 === null ? 'plus rien de choisi' : nom(s3));
  await repos(); await attendre(400);
  pt = await pointDe('pectoral_sternal'); await toucher(pt.x, pt.y); await attendre(500); await p.click('.atlas-fiche [data-action="fermer"]'); const s4 = await ev(() => monte.etat().choisi);
  noter('la croix de la fiche désélectionne', s4 === null, s4 === null ? 'plus rien de choisi' : nom(s4));
  await repos();

  // 4. Gauche et droite distingués ; les deux côtés du muscle s'éclairent ensemble.
  const cg = await carte(3), g = Object.keys(cg).filter(k => k.endsWith('|gauche')).length, d = Object.keys(cg).filter(k => k.endsWith('|droit')).length;
  const xg = cg['pectoral_sternal|gauche'], xd = cg['pectoral_sternal|droit'];
  noter('le repérage distingue le côté gauche du côté droit', g > 30 && d > 30 && xg && xd && xg.x > xd.x, `${g} structures côté gauche, ${d} côté droit ; pectoral gauche du sujet à droite de l'écran (x = ${xg.x.toFixed(0)} contre ${xd.x.toFixed(0)})`);

  // 10. Couches : la couche 2 retire les muscles de surface ; le repérage passe à travers les fantômes.
  const avantC = await carte(3);
  await p.click('.atlas-pile [data-couche="2"]'); await repos();
  const c2c = await carte(3), couchesVues = await ev(ids => ids.map(k => monte.atlas.structures[monte.atlas.indice(k.split('|')[0])].couche), Object.keys(c2c));
  noter('couche 2 : seuls les muscles de couche 2 et plus se touchent (à travers les fantômes)', couchesVues.length > 20 && couchesVues.every(c => c >= 2), `${Object.keys(avantC).length} structures touchables en surface, ${couchesVues.length} en couche 2, couche minimale ${Math.min(...couchesVues)}`);
  await p.click('.atlas-fantomes'); await repos();
  noter('le bouton de transparence retire les fantômes', (await ev(() => monte.atlas.fantomes())) === false && (await ev(() => monte.atlas.mesures().appelsDeDessin)) === 3, `fantômes ${(await ev(() => monte.atlas.fantomes())) ? 'encore là' : 'retirés'}, ${await ev(() => monte.atlas.mesures().appelsDeDessin)} appels de dessin (5 avec eux)`);
  await p.click('.atlas-fantomes');
  await p.click(`.atlas-pile [data-couche="${await ev(() => monte.atlas.entete.couches + 1)}"]`); await repos();
  const cOs = await carte(3);
  noter('dernier cran : squelette seul', Object.keys(cOs).length === 0, `${Object.keys(cOs).length} muscle touchable`);
  await p.click('.atlas-pile [data-couche="1"]'); await repos();

  // 11. Masquer puis réafficher ; isoler.
  pt = await pointDe('pectoral_sternal', 'gauche'); await toucher(pt.x, pt.y); await attendre(500);
  await p.click('.atlas-fiche [data-action="masquer"]'); await repos();
  const apresMasque = await carte(3);
  const bouton = await ev(() => { const b = document.querySelector('.atlas-retablir'); return b.hidden ? null : b.textContent; });
  noter('« Masquer » retire le muscle (des deux côtés) et découvre celui du dessous', !apresMasque['pectoral_sternal|gauche'] && !apresMasque['pectoral_sternal|droit'] && !!apresMasque['petit_pectoral|gauche'] && !!bouton, `grand pectoral sternal ${apresMasque['pectoral_sternal|gauche'] ? 'encore touchable' : 'retiré'} ; petit pectoral ${apresMasque['petit_pectoral|gauche'] ? 'découvert' : 'toujours caché'} ; bouton « ${bouton} »`);
  await p.click('.atlas-retablir'); await repos();
  noter('« Réafficher » remet le muscle', (await ev(() => monte.atlas.masques().length)) === 0, 'plus aucun muscle masqué');
  pt = await pointDe('grand_droit_abdomen'); await toucher(pt.x, pt.y); await attendre(500);
  await p.click('.atlas-fiche [data-action="isoler"]'); await attendre(900); await repos();
  const iso = await ev(() => monte.atlas.isoles()), cIso = await carte(3);
  noter('« Isoler » ne laisse que le muscle choisi (les autres en fantômes)', iso && iso.length === 1 && Object.keys(cIso).every(k => k.startsWith('grand_droit_abdomen|')), `isolé : ${(iso || []).map(nom).join(', ')} ; seuls touchables : ${Object.keys(cIso).map(nom).join(', ')}`);
  await p.click('.atlas-fiche [data-action="groupe"]'); await repos();
  const isoG = await ev(() => monte.atlas.isoles());
  noter('isoler le groupe du muscle', isoG && isoG.length > 1 && isoG.includes('oblique_externe'), `${isoG ? isoG.length : 0} muscles : ${(isoG || []).map(nom).join(', ')}`);
  await ev(() => { monte.choisir(null); monte.atlas.toutAfficher(); monte.atlas.reinitialiser(0); }); await repos();

  // 12. Index : chercher un muscle profond, le choisir, il revient à l'écran.
  await p.click('.atlas-barre .atlas-rond:first-child'); await attendre(450);
  await p.fill('.atlas-index input', 'subscap'); await attendre(100);
  const nbRes = await ev(() => document.querySelectorAll('.atlas-index-liste button').length);
  await p.click('.atlas-index-liste button'); await attendre(1100); await repos();
  const ei = await ev(() => ({ c: monte.etat().choisi, couche: monte.atlas.couche(), ouvert: document.querySelector('.atlas-index').hasAttribute('data-ouvert') }));
  noter("l'index trouve un muscle profond et l'amène à l'écran", nbRes === 1 && ei.c === 'subscapulaire' && ei.couche === 4 && !ei.ouvert, `${nbRes} résultat pour « subscap », choisi : ${nom(ei.c)}, couche affichée : ${ei.couche}`);
  await ev(() => { monte.choisir(null); monte.atlas.toutAfficher(); monte.couche(1); monte.atlas.reinitialiser(0); }); await repos();

  // 13. Modes de carte : couleurs et légende.
  await p.click('.atlas-modes [data-mode="semaine"]'); await repos();
  const leg = await ev(() => [...document.querySelectorAll('.atlas-legende span')].map(x => x.textContent));
  noter('changer de mode recolore le corps et affiche la légende', leg.length === 5, leg.join(' · '));
  await p.click('.atlas-modes [data-mode="anatomie"]'); await repos();

  // 14. Perte puis reprise du contexte graphique (mise en veille, mémoire reprise par le système).
  const perte = await ev(async () => { const a = monte.atlas, gl = a.toile.getContext('webgl2'), ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return null; ext.loseContext(); await new Promise(r => setTimeout(r, 200)); const perdu = gl.isContextLost(); ext.restoreContext(); await new Promise(r => setTimeout(r, 500)); const r = a.toile.getBoundingClientRect(), t = a.reperer(r.width / 2, r.height * 0.36); return { perdu, repris: !gl.isContextLost(), touche: t && t.structure ? t.structure.id : null }; });
  noter('le contexte graphique perdu est repris sans recharger', perte && perte.perdu && perte.repris && !!perte.touche, perte ? `contexte ${perte.perdu ? 'perdu' : 'non perdu'}, puis ${perte.repris ? 'repris' : 'non repris'} ; le corps se touche de nouveau (${nom(perte.touche)})` : 'perte du contexte impossible à provoquer');

  // 15. Changement de taille (rotation de l'écran) : le corps entier reste cadré.
  await p.setViewportSize({ width: 760, height: 390 }); await attendre(700); await repos();
  const pay = await ev(() => { const a = monte.atlas, r = a.toile.getBoundingClientRect(), tete = a.projeter([0, 1.70, 0]), pieds = a.projeter([0, 0.0, 0]); return { h: r.height, tete: tete.y, pieds: pieds.y }; });
  noter('en paysage, le corps entier reste dans la zone libre', pay.tete > 30 && pay.pieds < pay.h - 30, `tête à ${pay.tete.toFixed(0)} px, pieds à ${pay.pieds.toFixed(0)} px sur ${pay.h} px`);
  await p.setViewportSize({ width: 390, height: 760 }); await attendre(500); await repos();

  // 16. Clavier.
  await p.focus('.atlas-toile'); const k0 = await cam(); await p.keyboard.press('ArrowRight'); await repos(); const k1 = await cam();
  noter('les flèches du clavier font tourner', Math.abs(k1.az - k0.az - 10) < 0.5, `${k0.az.toFixed(0)}° → ${k1.az.toFixed(0)}°`);

  await nav.close();
  ({ nav } = await page(false));
  const dE = await ev(() => monte.atlas._.distanceEntiere());
  await repos();
  // 5. Rotation au doigt, élan, butée d'élévation.
  await ev(() => monte.atlas.reinitialiser(0)); await repos();
  const c0 = await cam();
  geste(); await doigt('touchStart', [{ x: 120, y: 420, id: 1 }], 0);
  for (let i = 1; i <= 12; i++) await doigt('touchMove', [{ x: 120 + i * 12, y: 420, id: 1 }]);
  await livre(); const c1 = await cam();
  await doigt('touchEnd', []);
  await repos(); const c2 = await cam();
  noter('glisser un doigt fait tourner le corps', Math.abs(c1.az - c0.az) > 40 && Math.abs(c1.el - c0.el) < 1, `azimut ${c0.az.toFixed(0)}° → ${c1.az.toFixed(0)}° pour 144 px`);
  noter("l'élan prolonge le geste puis s'arrête", Math.abs(c2.az - c1.az) > 3 && Math.abs(c2.az - c1.az) < 120, `${(c2.az - c1.az).toFixed(1)}° de plus après le lâcher, puis repos`);
  // Le doigt s'arrête un quart de seconde avant de se lever : le corps doit rester où il est.
  geste(); await doigt('touchStart', [{ x: 120, y: 420, id: 1 }], 0);
  for (let i = 1; i <= 8; i++) await doigt('touchMove', [{ x: 120 + i * 12, y: 420, id: 1 }]);
  await livre(); const c2a = await cam(); await doigt('touchEnd', [], 0.25); await repos(); const c2b = await cam();
  noter("aucun élan si le doigt s'arrête avant de se lever", Math.abs(c2b.az - c2a.az) < 0.01, `${(c2b.az - c2a.az).toFixed(2)}° après le lâcher`);
  geste(); await doigt('touchStart', [{ x: 200, y: 300, id: 1 }], 0);
  for (let i = 1; i <= 30; i++) await doigt('touchMove', [{ x: 200, y: 300 + i * 14, id: 1 }]);
  await doigt('touchEnd', []); await repos();
  const c3 = await cam();
  noter("l'élévation reste bornée (on ne passe pas par-dessus la tête)", c3.el <= 80.01 && c3.el > 60, `élévation ${c3.el.toFixed(1)}° après un grand geste vertical`);
  // Tour complet
  await ev(() => monte.atlas.reinitialiser(0)); await repos();
  let tour = 0, prec = (await cam()).az;
  const cumuler = async () => { const az = (await cam()).az; let dd = az - prec; while (dd > 180) dd -= 360; while (dd < -180) dd += 360; tour += dd; prec = az; };
  for (let k = 0; k < 7; k++) {
    geste(); await doigt('touchStart', [{ x: 40, y: 420, id: 1 }], 0);
    for (let i = 1; i <= 20; i++) { await doigt('touchMove', [{ x: 40 + i * 13, y: 420, id: 1 }]); if (i % 5 === 0) { await livre(); await cumuler(); } }
    await doigt('touchEnd', [], 0.25); await repos(); await cumuler();
  }
  noter('rotation complète sur 360°, sans butée', Math.abs(tour) > 360, `${Math.abs(tour).toFixed(0)}° cumulés en sept gestes`);

  // 6. Zoom par pincement, limites, puis déplacement à deux doigts.
  await ev(() => monte.atlas.reinitialiser(0)); await repos();
  const z0 = await cam();
  const pince = async (e0, e1, cx, cy, dx = 0, dy = 0) => { const n = 14; await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - e0, y: cy, id: 1 }, { x: cx + e0, y: cy, id: 2 }] }); for (let i = 1; i <= n; i++) { const e = e0 + (e1 - e0) * i / n; await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - e + dx * i / n, y: cy + dy * i / n, id: 1 }, { x: cx + e + dx * i / n, y: cy + dy * i / n, id: 2 }] }); await attendre(10); } await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await repos(); };
  await pince(40, 130, 180, 300);
  const z1 = await cam();
  noter('écarter deux doigts rapproche', z1.dist < z0.dist * 0.5, `distance ${z0.dist.toFixed(2)} m → ${z1.dist.toFixed(2)} m`);
  for (let k = 0; k < 6; k++) await pince(30, 135, 180, 300);
  const z2 = await cam();
  noter('le zoom avant est borné', z2.dist >= 0.299, `distance minimale ${z2.dist.toFixed(2)} m`);
  const avant = await cam(); await pince(70, 70, 170, 380, 50, -40); const apres = await cam();
  noter('deux doigts déplacent la vue', Math.hypot(apres.cible[0] - avant.cible[0], apres.cible[1] - avant.cible[1], apres.cible[2] - avant.cible[2]) > 0.005 && Math.abs(apres.dist - avant.dist) < 0.02, `cible déplacée de ${(1000 * Math.hypot(apres.cible[0] - avant.cible[0], apres.cible[1] - avant.cible[1], apres.cible[2] - avant.cible[2])).toFixed(0)} mm`);
  for (let k = 0; k < 10; k++) await pince(60, 60, 110, 380, 150, 0);
  const loin = await cam();
  noter('le déplacement reste contrôlé (le corps ne sort pas de la vue)', Math.abs(loin.cible[0]) <= 0.34 + 1e-6 && loin.cible[1] >= 0 && loin.cible[1] <= 1.71, `cible bornée à x = ${loin.cible[0].toFixed(2)} m`);
  for (let k = 0; k < 8; k++) await pince(135, 30, 180, 300);
  const z3 = await cam();
  noter('le zoom arrière est borné et recentre le corps', z3.dist <= dE * 1.121 && Math.abs(z3.cible[0]) < 0.05, `distance ${z3.dist.toFixed(2)} m (corps entier : ${dE.toFixed(2)} m), cible x = ${z3.cible[0].toFixed(3)}`);

  // 7. Molette (ordinateur).
  await ev(() => monte.atlas.reinitialiser(0)); await repos();
  const w0 = await cam(); await p.mouse.move(195, 300); await p.mouse.wheel(0, -600); await repos(); const w1 = await cam();
  noter('la molette zoome', w1.dist < w0.dist * 0.9, `${w0.dist.toFixed(2)} m → ${w1.dist.toFixed(2)} m`);

  // 8. Boutons de vue et retour à la vue de départ.
  const vues = {};
  for (const v of ['dos', 'gauche', 'droite', 'face']) { await p.click(`.atlas-vues [data-vue="${v}"]`); await attendre(900); await repos(); const c = await cam(); vues[v] = [Math.round(c.az), await ev(v => document.querySelector(`.atlas-vues [data-vue="${v}"]`).getAttribute('aria-pressed'), v)]; }
  noter('les quatre vues se placent et le bouton actif suit', vues.dos[0] === 180 || vues.dos[0] === -180 ? vues.gauche[0] === 90 && vues.droite[0] === -90 && vues.face[0] === 0 && Object.values(vues).every(x => x[1] === 'true') : false, Object.entries(vues).map(([v, x]) => `${v} : ${x[0]}°${x[1] === 'true' ? '' : ' (bouton inactif)'}`).join(', '));
  await ev(() => monte.atlas.vue('gauche', 0)); await repos();
  const cgauche = await carte(3), kg = Object.keys(cgauche);
  noter('la vue « Gauche » montre le côté gauche du sujet', kg.filter(k => k.endsWith('|gauche')).length > kg.filter(k => k.endsWith('|droit')).length * 2, `${kg.filter(k => k.endsWith('|gauche')).length} structures gauches visibles, ${kg.filter(k => k.endsWith('|droit')).length} droites`);
  await p.mouse.wheel(0, -500); await repos(); await p.click('.atlas-barre .atlas-rond:last-child'); await attendre(900); await repos();
  const r0 = await cam();
  noter('le bouton de retour remet la vue de départ', Math.abs(r0.az) < 0.5 && Math.abs(r0.dist - dE) < 0.01, `azimut ${r0.az.toFixed(1)}°, distance ${r0.dist.toFixed(2)} m`);

  // 9. Double touche : cadre le muscle.
  const doubles = [];
  for (const [id, cote] of [['droit_femoral', 'droit'], ['biceps_long', 'gauche'], ['deltoide_anterieur', 'droit']]) {
    await ev(() => { monte.choisir(null); monte.atlas.reinitialiser(0); }); await repos();
    pt = await pointDe(id, cote);
    await doubleToucher(pt.x, pt.y); await attendre(300); await repos();
    // Le muscle est choisi, la caméra s'est rapprochée du côté touché, et son centre est au milieu de la zone restée libre au-dessus de la fiche.
    doubles.push(await ev(([id, cote]) => { const a = monte.atlas, st = a.structures[a.indice(id)], c = a.camera(), pr = a.projeter(c.cible), r = a.toile.getBoundingClientRect(), f = document.querySelector('.atlas-fiche').getBoundingClientRect(), haut = document.querySelector('.atlas-modes').getBoundingClientRect().bottom - r.top;
      return { id, cote, choisi: monte.etat().choisi, dist: c.dist, y: pr.y, milieu: (haut + (f.top - r.top)) / 2, bonCote: Math.abs(c.cible[0] - st.centre[0] * (cote === 'droit' ? -1 : 1)) < 0.002 && Math.abs(c.cible[1] - st.centre[1]) < 0.002 }; }, [id, cote]));
  }
  noter('une double touche choisit le muscle et le cadre, du côté touché', doubles.every(x => x.choisi === x.id && x.bonCote && x.dist < dE * 0.75 && Math.abs(x.y - x.milieu) < 40), doubles.map(x => `${nom(x.choisi)} ${x.cote}${x.bonCote ? '' : ' (mauvais côté)'} à ${x.dist.toFixed(2)} m, centre à ${Math.round(x.y - x.milieu)} px du milieu de la zone libre`).join(' ; '));
  await ev(() => { monte.choisir(null); monte.atlas.reinitialiser(0); }); await repos();

  // La peau : une seule apparence (tête, mains et pieds), sans bouton ; on touche un muscle du corps comme avant ; en
  // profondeur (couches retirées, muscle du visage choisi), elle s'efface.
  if (await ev(() => monte.atlas.aPeau)) {
    const bilan = await ev(() => {
      const r = { depart: monte.etat().peau, boutons: document.querySelectorAll('.atlas-peau').length, appels: monte.atlas.mesures().appelsDeDessin };
      monte.couche(3); r.profond = monte.etat().peau; monte.couche(1); r.retour = monte.etat().peau;
      return r;
    });
    await ev(() => monte.atlas.vue('face', 0)); await repos();
    const pt = await pointDe('pectoral_sternal'); await toucher(pt.x, pt.y); await repos();
    const touche = await ev(() => [monte.etat().choisi, monte.etat().peau]);
    await ev(() => monte.choisir('masseter_partie_superficielle')); await repos();
    const visage = await ev(() => [monte.etat().choisi, monte.etat().peau]);
    await ev(() => monte.choisir(null)); await repos();
    noter('la peau : une seule apparence (tête, mains, pieds), sans bouton, effacée en profondeur',
      bilan.depart === 1 && bilan.boutons === 0 && bilan.profond === 0 && bilan.retour === 1 && touche[0] === 'pectoral_sternal' && touche[1] === 1 && visage[1] === 0,
      `au départ ${bilan.depart}, ${bilan.boutons} bouton, ${bilan.appels} appels de dessin ; couche 3 : peau ${bilan.profond} ; ${nom(touche[0])} touché, peau ${touche[1]} ; muscle du visage choisi (${visage[0]}) : peau ${visage[1]}`);
  }

  await nav.close();
  // Mouvements : la pose reste saine du début à la fin, les mains tiennent le matériel, le corps se touche encore.
  {
    const { nav: nav3, ctx } = await ouvrir({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    p = await ctx.newPage(); p.on('pageerror', e => erreurs.push(e.message));
    const bilan = [];
    for (const m of ['squat', 'developpeCouche', 'curl', 'traction', 'pompe', 'elevationsLaterales', 'souleveDeTerre', 'rowing']) {
      await p.goto('http://atlas.local/appli/essai-mouvement.html?m=' + m + '&pp=1');
      await p.waitForFunction(() => window.pret, null, { timeout: 120000 });
      const r = await ev(() => { const res = { fini: true, mains: 0, touchables: 0 }; for (const u of [0, 0.5, 1]) { const info = anim.rendre(0, u), mats = anim.corps.matrices(); for (let i = 0; i < mats.length; i++) if (!Number.isFinite(mats[i])) res.fini = false; res.mains = Math.max(res.mains, Math.abs(info.prises.G.y - info.prises.D.y)); } res.touchables = Object.keys(atlas.carteReperage(3) || {}).length; return res; });
      bilan.push([m, r.fini, +r.mains.toFixed(3), r.touchables]);
    }
    noter('les huit mouvements : poses saines, mains à la même hauteur, corps toujours touchable muscle par muscle', bilan.every(b => b[1] && b[2] < 0.01 && b[3] > 60), bilan.map(b => `${MVT[b[0]] || b[0]} (${b[3]} structures touchables)`).join(', '));
    // D'autres familles de mouvements : un exercice de chacune, ouvert par son identifiant dans la bibliothèque.
    const autres = [];
    for (const [id, nom] of [['e1136', 'dips aux anneaux'], ['e77', 'pompes diamant'], ['e120', 'grimpeur'], ['sw-rotation-russe-avec-medecine-ball', 'rotation russe'], ['e131', 'rameur'], ['sw-posture-du-pigeon', 'posture du pigeon'], ['sw-muscle-up', 'muscle-up'], ['e136', 'balancement de kettlebell']]) {
      await p.goto('http://atlas.local/appli/essai-mouvement.html?ex=' + id + '&pp=1');
      await p.waitForFunction(() => window.pret, null, { timeout: 120000 });
      const r = await ev(() => { const res = { fini: true, touchables: 0 }, d = anim.definition, libre = d.rythme === 'continu' || d.rythme === 'boucle'; for (const u of [0, 0.5, 1]) { if (libre) anim.rendre(u * (d.periode || 1.2)); else anim.rendre(0, u); const mats = anim.corps.matrices(); for (let i = 0; i < mats.length; i++) if (!Number.isFinite(mats[i])) res.fini = false; } res.touchables = Object.keys(atlas.carteReperage(3) || {}).length; return res; });
      autres.push([nom, r.fini, r.touchables]);
    }
    noter("huit exercices d'autres familles, ouverts par leur identifiant : poses saines, corps toujours touchable muscle par muscle", autres.every(b => b[1] && b[2] > 50), autres.map(b => `${b[0]} (${b[2]} structures touchables)`).join(', '));
    nav = nav3;
  }
  noter('aucune erreur dans la console', !erreurs.length, erreurs.length ? erreurs.join(' | ') : 'aucune, sur les trois passes');
  const mem = await ev(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
  console.log(`\n${R.filter(r => r.ok).length} essais réussis sur ${R.length} — mémoire JavaScript de la page : ${mem} Mo`);
  fs.writeFileSync('rapport/essais-fonctionnels.json', JSON.stringify({ date: new Date().toISOString(), navigateur: 'Chromium sans écran (rendu logiciel SwiftShader), 390×760, tactile ; une passe sans animations, une passe avec', memoireJsMo: mem, essais: R }, null, 1));
  await nav.close();
  process.exit(R.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
