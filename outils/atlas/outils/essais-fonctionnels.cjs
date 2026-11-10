// Essais fonctionnels de l'atlas (page d'essai, taille d'un iPhone, écran tactile) : gestes, sélection, couches,
// vues, index, perte et reprise du contexte graphique. Chaque essai dit ce qu'il a réellement observé.
const { ouvrir } = require('./photo.cjs');
const fs = require('fs');
const R = []; let p, client;
const noter = (nom, ok, detail) => { R.push({ nom, ok: !!ok, detail }); console.log((ok ? '  OK   ' : '  ÉCHEC') + ' ' + nom + (detail ? ' — ' + detail : '')); };
const attendre = ms => new Promise(r => setTimeout(r, ms));
const ev = (f, ...a) => p.evaluate(f, ...a);
const cam = () => ev(() => monte.atlas.camera());
const repos = async () => { for (let i = 0; i < 40; i++) { const a = await ev(() => monte.atlas.mesures().images); await attendre(120); if (a === await ev(() => monte.atlas.mesures().images)) return; } };
// Carte des structures visibles : pour chaque structure et chaque côté, nombre de points et un point sûr de l'écran.
const carte = pas => ev(pas => monte.atlas.carteReperage(pas || 3), pas);
const toucher = async (x, y) => { await p.touchscreen.tap(x, y); await attendre(80); };
// Un point de l'écran qui appartient sûrement à la structure (pris sur la carte de repérage).
const pointDe = async (id, cote) => { const c = await carte(3), r = await ev(() => { const r = monte.atlas.toile.getBoundingClientRect(); return [r.left, r.top]; }); const cles = (cote ? [id + '|' + cote] : [id + '|gauche', id + '|droit']).filter(k => c[k]).sort((u, v) => c[v].n - c[u].n); return cles.length ? { x: c[cles[0]].x + r[0], y: c[cles[0]].y + r[1], n: c[cles[0]].n } : null; };

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
(async () => {
  let { nav, duree } = await page(true);

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
    const ok = [], ko = [];
    for (const id of ids) {
      const pt = await pointDe(id); if (!pt) { ko.push(id + ' (invisible)'); continue; }
      await toucher(pt.x, pt.y);
      const e = await ev(() => ({ c: monte.etat().choisi, titre: (document.querySelector('.atlas-fiche[data-ouverte] h3') || {}).textContent || null }));
      const nom = await ev(id => monte.atlas.structures[monte.atlas.indice(id)].nom, id);
      (e.c === id && e.titre === nom ? ok : ko).push(id + (e.c === id ? '' : ' → ' + e.c));
      await ev(() => monte.choisir(null)); await repos();
    }
    noter(`toucher un muscle le choisit et affiche sa fiche (vue de ${vue})`, !ko.length, `${ok.length}/${ids.length}` + (ko.length ? ' ; manqués : ' + ko.join(', ') : ''));
  }

  // 3. Désélection : toucher le même muscle, toucher le vide, bouton de fermeture.
  await ev(() => monte.atlas.vue('face', 0)); await repos();
  let pt = await pointDe('pectoral_sternal');
  await toucher(pt.x, pt.y); const s1 = await ev(() => monte.etat().choisi); await attendre(450);
  pt = await pointDe('pectoral_sternal'); await toucher(pt.x, pt.y); const s2 = await ev(() => monte.etat().choisi);
  noter('toucher de nouveau le muscle choisi le désélectionne', s1 === 'pectoral_sternal' && s2 === null, `${s1} → ${s2}`);
  await repos(); await attendre(400);
  pt = await pointDe('pectoral_sternal'); await toucher(pt.x, pt.y); await attendre(450); await toucher(22, 300); const s3 = await ev(() => monte.etat().choisi);
  noter('toucher le vide désélectionne', s3 === null, String(s3));
  await repos(); await attendre(400);
  pt = await pointDe('pectoral_sternal'); await toucher(pt.x, pt.y); await attendre(500); await p.click('.atlas-fiche [data-action="fermer"]'); const s4 = await ev(() => monte.etat().choisi);
  noter('la croix de la fiche désélectionne', s4 === null, String(s4));
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
  await p.click('.atlas-couches > .atlas-rond'); await repos();
  noter('le bouton de transparence retire les fantômes', (await ev(() => monte.atlas.fantomes())) === false && (await ev(() => monte.atlas.mesures().appelsDeDessin)) === 3, `fantômes : ${await ev(() => monte.atlas.fantomes())}, appels de dessin : ${await ev(() => monte.atlas.mesures().appelsDeDessin)}`);
  await p.click('.atlas-couches > .atlas-rond');
  await p.click(`.atlas-pile [data-couche="${await ev(() => monte.atlas.entete.couches + 1)}"]`); await repos();
  const cOs = await carte(3);
  noter('dernier cran : squelette seul', Object.keys(cOs).length === 0, `${Object.keys(cOs).length} muscle touchable`);
  await p.click('.atlas-pile [data-couche="1"]'); await repos();

  // 11. Masquer puis réafficher ; isoler.
  pt = await pointDe('pectoral_sternal', 'gauche'); await toucher(pt.x, pt.y); await attendre(500);
  await p.click('.atlas-fiche [data-action="masquer"]'); await repos();
  const dessous = await ev(([x, y]) => { const r = monte.atlas.toile.getBoundingClientRect(), t = monte.atlas.reperer(x - r.left, y - r.top); return t && t.structure ? t.structure.id : null; }, [pt.x, pt.y]);
  const bouton = await ev(() => { const b = document.querySelector('.atlas-retablir'); return b.hidden ? null : b.textContent; });
  noter('« Masquer » retire le muscle et laisse toucher celui du dessous', dessous && dessous !== 'pectoral_sternal' && !!bouton, `sous le grand pectoral : ${dessous} ; bouton « ${bouton} »`);
  await p.click('.atlas-retablir'); await repos();
  noter('« Réafficher » remet le muscle', (await ev(() => monte.atlas.masques().length)) === 0, '');
  pt = await pointDe('grand_droit_abdomen'); await toucher(pt.x, pt.y); await attendre(500);
  await p.click('.atlas-fiche [data-action="isoler"]'); await attendre(900); await repos();
  const iso = await ev(() => monte.atlas.isoles()), cIso = await carte(3);
  noter('« Isoler » ne laisse que le muscle choisi (les autres en fantômes)', iso && iso.length === 1 && Object.keys(cIso).every(k => k.startsWith('grand_droit_abdomen|')), `isolé : ${iso}, touchables : ${Object.keys(cIso).join(', ')}`);
  await p.click('.atlas-fiche [data-action="groupe"]'); await repos();
  const isoG = await ev(() => monte.atlas.isoles());
  noter('isoler le groupe du muscle', isoG && isoG.length > 1 && isoG.includes('oblique_externe'), `${isoG ? isoG.length : 0} muscles : ${(isoG || []).join(', ')}`);
  await ev(() => { monte.choisir(null); monte.atlas.toutAfficher(); monte.atlas.reinitialiser(0); }); await repos();

  // 12. Index : chercher un muscle profond, le choisir, il revient à l'écran.
  await p.click('.atlas-barre .atlas-rond:first-child'); await attendre(450);
  await p.fill('.atlas-index input', 'subscap'); await attendre(100);
  const nbRes = await ev(() => document.querySelectorAll('.atlas-index-liste button').length);
  await p.click('.atlas-index-liste button'); await attendre(1100); await repos();
  const ei = await ev(() => ({ c: monte.etat().choisi, couche: monte.atlas.couche(), ouvert: document.querySelector('.atlas-index').hasAttribute('data-ouvert') }));
  noter("l'index trouve un muscle profond et l'amène à l'écran", nbRes === 1 && ei.c === 'subscapulaire' && ei.couche === 4 && !ei.ouvert, `${nbRes} résultat pour « subscap », choisi : ${ei.c}, couche affichée : ${ei.couche}`);
  await ev(() => { monte.choisir(null); monte.atlas.toutAfficher(); monte.couche(1); monte.atlas.reinitialiser(0); }); await repos();

  // 13. Modes de carte : couleurs et légende.
  await p.click('.atlas-modes [data-mode="semaine"]'); await repos();
  const leg = await ev(() => [...document.querySelectorAll('.atlas-legende span')].map(x => x.textContent));
  noter('changer de mode recolore le corps et affiche la légende', leg.length === 5, leg.join(' · '));
  await p.click('.atlas-modes [data-mode="anatomie"]'); await repos();

  // 14. Perte puis reprise du contexte graphique (mise en veille, mémoire reprise par le système).
  const perte = await ev(async () => { const a = monte.atlas, gl = a.toile.getContext('webgl2'), ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return null; ext.loseContext(); await new Promise(r => setTimeout(r, 200)); const perdu = gl.isContextLost(); ext.restoreContext(); await new Promise(r => setTimeout(r, 500)); const r = a.toile.getBoundingClientRect(), t = a.reperer(r.width / 2, r.height * 0.36); return { perdu, repris: !gl.isContextLost(), touche: t && t.structure ? t.structure.id : null }; });
  noter('le contexte graphique perdu est repris sans recharger', perte && perte.perdu && perte.repris && !!perte.touche, JSON.stringify(perte));

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
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 420, id: 1 }] });
  for (let i = 1; i <= 12; i++) { await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120 + i * 12, y: 420, id: 1 }] }); await attendre(16); }
  const c1 = await cam();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await attendre(60); const c1b = await cam(); await repos(); const c2 = await cam();
  noter('glisser un doigt fait tourner le corps', Math.abs(c1.az - c0.az) > 40 && Math.abs(c1.el - c0.el) < 1, `azimut ${c0.az.toFixed(0)}° → ${c1.az.toFixed(0)}° pour 144 px`);
  noter("l'élan prolonge le geste puis s'arrête", Math.abs(c2.az - c1.az) > 3 && Math.abs(c2.az - c1.az) < 120, `${(c2.az - c1.az).toFixed(1)}° de plus après le lâcher, puis repos`);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300, id: 1 }] });
  for (let i = 1; i <= 30; i++) { await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 300 + i * 14, id: 1 }] }); }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await repos();
  const c3 = await cam();
  noter("l'élévation reste bornée (on ne passe pas par-dessus la tête)", c3.el <= 80.01 && c3.el > 60, `élévation ${c3.el.toFixed(1)}° après un grand geste vertical`);
  // Tour complet
  await ev(() => monte.atlas.reinitialiser(0)); await repos();
  let tour = 0, prec = (await cam()).az;
  for (let k = 0; k < 4; k++) { await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: 420, id: 1 }] }); for (let i = 1; i <= 20; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60 + i * 13, y: 420, id: 1 }] }); await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await repos(); const az = (await cam()).az; let dd = az - prec; while (dd > 180) dd -= 360; while (dd < -180) dd += 360; tour += dd; prec = az; }
  noter('rotation complète sur 360°, sans butée', Math.abs(tour) > 360, `${Math.abs(tour).toFixed(0)}° cumulés en quatre gestes`);

  // 6. Zoom par pincement, limites, puis déplacement à deux doigts.
  await ev(() => monte.atlas.reinitialiser(0)); await repos();
  const z0 = await cam();
  const pince = async (e0, e1, cx, cy, dx = 0, dy = 0) => { const n = 14; await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - e0, y: cy, id: 1 }, { x: cx + e0, y: cy, id: 2 }] }); for (let i = 1; i <= n; i++) { const e = e0 + (e1 - e0) * i / n; await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - e + dx * i / n, y: cy + dy * i / n, id: 1 }, { x: cx + e + dx * i / n, y: cy + dy * i / n, id: 2 }] }); await attendre(10); } await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await repos(); };
  await pince(40, 150, 195, 300);
  const z1 = await cam();
  noter('écarter deux doigts rapproche', z1.dist < z0.dist * 0.5, `distance ${z0.dist.toFixed(2)} m → ${z1.dist.toFixed(2)} m`);
  for (let k = 0; k < 6; k++) await pince(30, 170, 195, 300);
  const z2 = await cam();
  noter('le zoom avant est borné', z2.dist >= 0.299, `distance minimale ${z2.dist.toFixed(2)} m`);
  const avant = await cam(); await pince(80, 80, 195, 380, 60, -40); const apres = await cam();
  noter('deux doigts déplacent la vue', Math.hypot(apres.cible[0] - avant.cible[0], apres.cible[1] - avant.cible[1], apres.cible[2] - avant.cible[2]) > 0.005 && Math.abs(apres.dist - avant.dist) < 0.02, `cible déplacée de ${(1000 * Math.hypot(apres.cible[0] - avant.cible[0], apres.cible[1] - avant.cible[1], apres.cible[2] - avant.cible[2])).toFixed(0)} mm`);
  for (let k = 0; k < 10; k++) await pince(80, 80, 195, 380, 160, 0);
  const loin = await cam();
  noter('le déplacement reste contrôlé (le corps ne sort pas de la vue)', Math.abs(loin.cible[0]) <= 0.34 + 1e-6 && loin.cible[1] >= 0 && loin.cible[1] <= 1.71, `cible bornée à x = ${loin.cible[0].toFixed(2)} m`);
  for (let k = 0; k < 8; k++) await pince(170, 30, 195, 300);
  const z3 = await cam();
  noter('le zoom arrière est borné et recentre le corps', z3.dist <= dE * 1.121 && Math.abs(z3.cible[0]) < 0.05, `distance ${z3.dist.toFixed(2)} m (corps entier : ${dE.toFixed(2)} m), cible x = ${z3.cible[0].toFixed(3)}`);

  // 7. Molette (ordinateur).
  await ev(() => monte.atlas.reinitialiser(0)); await repos();
  const w0 = await cam(); await p.mouse.move(195, 300); await p.mouse.wheel(0, -600); await repos(); const w1 = await cam();
  noter('la molette zoome', w1.dist < w0.dist * 0.9, `${w0.dist.toFixed(2)} m → ${w1.dist.toFixed(2)} m`);

  // 8. Boutons de vue et retour à la vue de départ.
  const vues = {};
  for (const v of ['dos', 'gauche', 'droite', 'face']) { await p.click(`.atlas-vues [data-vue="${v}"]`); await attendre(900); await repos(); const c = await cam(); vues[v] = [Math.round(c.az), await ev(v => document.querySelector(`.atlas-vues [data-vue="${v}"]`).getAttribute('aria-pressed'), v)]; }
  noter('les quatre vues se placent et le bouton actif suit', vues.dos[0] === 180 || vues.dos[0] === -180 ? vues.gauche[0] === 90 && vues.droite[0] === -90 && vues.face[0] === 0 && Object.values(vues).every(x => x[1] === 'true') : false, JSON.stringify(vues));
  await ev(() => monte.atlas.vue('gauche', 0)); await repos();
  const cgauche = await carte(3), kg = Object.keys(cgauche);
  noter('la vue « Gauche » montre le côté gauche du sujet', kg.filter(k => k.endsWith('|gauche')).length > kg.filter(k => k.endsWith('|droit')).length * 2, `${kg.filter(k => k.endsWith('|gauche')).length} structures gauches visibles, ${kg.filter(k => k.endsWith('|droit')).length} droites`);
  await p.mouse.wheel(0, -500); await repos(); await p.click('.atlas-barre .atlas-rond:last-child'); await attendre(900); await repos();
  const r0 = await cam();
  noter('le bouton de retour remet la vue de départ', Math.abs(r0.az) < 0.5 && Math.abs(r0.dist - dE) < 0.01, `azimut ${r0.az.toFixed(1)}°, distance ${r0.dist.toFixed(2)} m`);

  // 9. Double touche : cadre le muscle.
  pt = await pointDe('droit_femoral');
  await p.touchscreen.tap(pt.x, pt.y); await attendre(90); await p.touchscreen.tap(pt.x, pt.y); await attendre(900); await repos();
  const dc = await cam(), ds = await ev(() => monte.etat().choisi);
  noter('une double touche choisit et cadre le muscle', ds === 'droit_femoral' && dc.dist < dE * 0.75, `choisi : ${ds}, distance ${dc.dist.toFixed(2)} m`);
  await ev(() => { monte.choisir(null); monte.atlas.reinitialiser(0); }); await repos();

  noter('aucune erreur dans la console', !erreurs.length, erreurs.join(' | '));
  const mem = await ev(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
  console.log(`\n${R.filter(r => r.ok).length} essais réussis sur ${R.length} — mémoire JavaScript de la page : ${mem} Mo`);
  fs.writeFileSync('rapport/essais-fonctionnels.json', JSON.stringify({ date: new Date().toISOString(), navigateur: 'Chromium sans écran (rendu logiciel SwiftShader), 390×760, tactile ; une passe sans animations, une passe avec', memoireJsMo: mem, essais: R }, null, 1));
  await nav.close();
  process.exit(R.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
