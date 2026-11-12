/* Tests de bout en bout d'Askēsis : l'appli réelle (index.html) dans Chromium,
   pilotée comme un utilisateur ou par ses propres fonctions quand l'écran
   n'apporte rien (ex. : choisir un exercice dans la liste). Chaque test part
   d'une appli vierge (stockage local vide) et échoue si la page lève la
   moindre erreur JavaScript.
   Lancer : npm install, puis npm test. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lancerNavigateur, ouvrirAppli, RACINE } = require('./outils');
const { P, installerFauxSupabase, injectionsTrouvees } = require('./injection');
const { creerServeur, brancherServeur } = require('./serveur');

let navigateur;
before(async () => { navigateur = await lancerNavigateur(); });
after(async () => { if (navigateur) await navigateur.close(); });

/* Faux Supabase de l'Administration : tables et fonctions répondent selon
   window.__rep (« table:nom » ou « rpc:nom », valeur ou fonction de la
   requête) ; chaque appel est noté dans window.__appels. { __404vide: true }
   imite supabase-js face à une table absente comptée en « head » : ni
   erreur, ni compte. */
function installerFauxAdmin(page, fabrique) {
  return page.evaluate(code => {
    window.__appels = [];
    window.__rep = Object.assign({}, (0, eval)('(' + code + ')')());
    const repondre = (cle, q) => {
      const r = window.__rep[cle];
      const v = typeof r === 'function' ? r(q) : r;
      if (v && v.__erreur) return { data: null, error: v.__erreur, count: null };
      if (v && v.__404vide) return { data: null, error: null, count: null, status: 204, statusText: 'No Content' };
      return { data: v === undefined ? (q.un ? null : []) : v, error: null, count: q.compte != null ? q.compte : Array.isArray(v) ? v.length : 0 };
    };
    const requete = table => {
      const q = { table, op: 'select', filtres: [] };
      const b = {
        select: (c, o) => { if (q.op === 'select') q.cols = c; if (o && o.head) q.tete = true; return b; },
        insert: v => { q.op = 'insert'; q.valeur = v; return b; },
        update: v => { q.op = 'update'; q.valeur = v; return b; },
        upsert: v => { q.op = 'upsert'; q.valeur = v; return b; },
        delete: () => { q.op = 'delete'; return b; },
        maybeSingle: () => { q.un = true; return b; }, single: () => { q.un = true; return b; },
        then: (ok, ko) => {
          window.__appels.push(['from', table, q.op, q.filtres, q.valeur === undefined ? null : JSON.parse(JSON.stringify(q.valeur))]);
          const cle = 'table:' + table + (q.op === 'select' ? (q.tete ? ':compte' : '') : ':' + q.op);
          const r = repondre(cle, q);
          if (q.tete && !r.error) { r.count = typeof r.data === 'number' ? r.data : r.count; r.data = null; }
          return Promise.resolve(r).then(ok, ko);
        },
      };
      ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'is', 'in', 'or', 'ilike', 'order', 'limit', 'range'].forEach(m => {
        b[m] = (...a) => { if (!['order', 'limit', 'range'].includes(m)) q.filtres.push([m, ...a]); return b; };
      });
      return b;
    };
    supa = {
      from: requete,
      rpc: (nom, args) => { window.__appels.push(['rpc', nom, args === undefined ? null : JSON.parse(JSON.stringify(args))]); return Promise.resolve(repondre('rpc:' + nom, { args })); },
      functions: { invoke: async () => ({ data: { pret: true }, error: null }) },
      storage: { from: () => requete('stockage') },
      auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
    };
    sessionUtilisateur = { id: 'admin', email: ADMIN_EMAIL };
  }, (fabrique || (() => ({}))).toString());
}

async function avecAppli(options, corps) {
  const appli = await ouvrirAppli(navigateur, options);
  try {
    await corps(appli);
    assert.deepEqual(appli.erreurs, [], 'erreurs JavaScript dans la page');
    const csp = await appli.page.evaluate(() => window.__csp || []).catch(() => []);
    assert.deepEqual(csp, [], 'violations de la politique de sécurité du contenu');
  } finally {
    await appli.ctx.close();
  }
}

test('les versions des bibliothèques sont figées', () => {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  // Seuls les scripts venus d'un CDN ont une version à figer (assets/donnees.js est à nous).
  const scripts = [...html.matchAll(/<script[^>]*src="(https?:[^"]+)"/g)].map(m => m[1]);
  for (const src of scripts) assert.match(src, /@\d+\.\d+\.\d+/, `version exacte manquante : ${src}`);
  // Chaque bibliothèque externe porte le hachage de son contenu, calculé sur le fichier du paquet installé.
  const crypto = require('crypto');
  const hache = f => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(f)).digest('base64');
  const balises = [...html.matchAll(/<script[^>]*src="(https?:[^"]+)"[^>]*>/g)].map(m => m[0]);
  assert.equal(balises.length, 3);
  for (const b of balises) assert.match(b, /integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous"/, b);
  const attendu = { 'chart.js': hache(path.join(RACINE, 'node_modules/chart.js/dist/chart.umd.min.js')) };
  const chart = balises.find(b => b.includes('chart.js'));
  assert.ok(chart.includes(attendu['chart.js']), 'le hachage de Chart.js correspond au paquet installé');
  assert.ok(html.includes('<meta http-equiv="Content-Security-Policy"'), 'politique de sécurité du contenu présente');
  const versionChart = JSON.parse(fs.readFileSync(path.join(RACINE, 'node_modules/chart.js/package.json'), 'utf8')).version;
  assert.ok(html.includes(`chart.js@${versionChart}/`), `les tests utilisent Chart.js ${versionChart}, l'appli une autre version`);
});

test('hors ligne : le service worker garde la page, ses données et ses recettes', () => {
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  const liste = sw.match(/const A_PRECHARGER = \[([^\]]*)\]/)[1];
  for (const f of ["'index.html'", "'assets/styles.css'", "'assets/donnees.js'", "'assets/recettes.js'"]) assert.ok(liste.includes(f), f);
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="assets/donnees.js"></script>'));
  // Les recettes ne bloquent plus la page : chargées à part, mais toujours préchargées hors ligne.
  assert.ok(!html.includes('<script src="assets/recettes.js"></script>'), 'plus de balise bloquante pour les recettes');
  assert.ok(html.includes("s.src = 'assets/recettes.js'"), 'chargeur à la demande');
  for (const f of ['assets/styles.css', 'assets/donnees.js', 'assets/recettes.js']) assert.ok(fs.existsSync(path.join(RACINE, f)), f);
});

test('recettes à la demande (lot 11) : la liste se remplit à leur arrivée et une recette se retrouve par son identifiant', () => avecAppli({ recettes: false }, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const res = { avant: recettesAskesis().length };
    await chargerRecettesAskesis();
    const toutes = recettesAskesis();
    res.apres = toutes.length;
    res.trouvee = !!(toutes[0] && trouverRecette(toutes[0].id));
    allerA('repas'); renderApp(); ouvrirFeuilleRepas('lunch'); depuisFeuille('recette');
    await new Promise(ok => setTimeout(ok, 50));
    res.lignes = document.querySelectorAll('#choix-recette-askesis .recette-ligne, #choix-recette-askesis [onclick*="choisirRecette"], #choix-recette-askesis button').length;
    return res;
  });
  assert.ok(r.apres > 400, 'plus de 400 recettes : ' + r.apres);
  assert.equal(r.trouvee, true);
  assert.ok(r.lignes > 0, 'la bibliothèque affiche les recettes');
}));

test('chaque script de la page se compile', () => {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const blocs = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(blocs.length > 0);
  for (const b of blocs) new Function(b[1]);
});

test("l'appli se charge et chaque écran s'ouvre", () => avecAppli({}, async ({ page }) => {
  for (const ecran of ['repas', 'seance', 'stats', 'reglages', 'repas']) {
    await page.evaluate(e => allerA(e), ecran);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => ecranActif), ecran);
    assert.ok(await page.isVisible('#ecran-' + ecran));
  }
}));

test('ajouter un aliment met à jour le résumé du jour', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    activeMealId = 'lunch';
    document.getElementById('man-name').value = 'Riz test';
    document.getElementById('man-grams').value = '200';
    document.getElementById('man-kcal100').value = '130';
    document.getElementById('man-p100').value = '2.7';
    document.getElementById('man-c100').value = '28';
    document.getElementById('man-f100').value = '0.3';
    validerAjoutManuel();
  });
  const r = await page.evaluate(() => ({ items: getDay(todayStr()).meals.lunch.length, total: document.getElementById('total-kcals').textContent }));
  assert.equal(r.items, 1);
  assert.match(r.total, /260/);
}));

test('les pas se notent depuis Repas du jour et comptent dans la dépense', () => avecAppli({}, async ({ page }) => {
  // Plus de carte des pas dans Activité : la carte « Pas du jour » de Repas du jour suffit
  // (au centre de la roulette, elle ouvre la saisie).
  await page.evaluate(() => allerA('seance'));
  assert.equal(await page.isVisible('#carte-pas-seances'), false);
  await page.evaluate(() => allerA('repas'));
  const avant = await page.evaluate(() => computeTargets(getDay(todayStr()), todayStr()).tdee);
  await page.evaluate(() => centrerCarteRoulette('carte-stats-pas', false));
  await page.click('#carte-stats-pas');
  await page.fill('#saisie-rapide-champ', '8500');
  await page.evaluate(() => validerSaisieRapide());
  const r = await page.evaluate(() => ({ pas: getDay(todayStr()).steps, tdee: computeTargets(getDay(todayStr()), todayStr()).tdee }));
  assert.equal(r.pas, 8500);
  assert.ok(r.tdee > avant, 'les pas en plus doivent augmenter la dépense');
}));

test('une séance de musculation se fait et se termine', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    allerA('seance'); choisirModeSeance('muscu');
    demarrerSeanceLibre();
    ajouterExerciceASession(toutesLesExercices().find(e => e.groupe === 'pectoraux').id);
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    modifierSerieSession(0, 0, 'poids', '60');
    modifierSerieSession(0, 0, 'reps', '10');
    basculerSerieSession(0, 0);
  });
  assert.ok(await page.evaluate(() => musculationSessionActive.exercices[0].series[0].fait));
  await page.evaluate(() => terminerSeance());
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({
    enCours: !!musculationSessionActive,
    historique: musculationHistorique.length,
    seanceDuJour: getDay(todayStr()).workouts.filter(w => w.source === 'seance').length
  }));
  assert.deepEqual(r, { enCours: false, historique: 1, seanceDuJour: 1 });
}));

test('musculation : une séance suivie compte toute sa durée, repos compris (3,5 MET), entre 2 et 4 min par série', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const poids = 80, bmr = 1800;
    const k = (min, series) => kcalSeance('musculation', min, poids, series, null, { bmr });
    return {
      parMin: 3.5 * 3.5 * poids / 200 - bmr / 1440,
      normale: k(70, 18), ouverte: k(180, 18), dense: k(20, 18), sansDuree: k(0, 18),
      aLaMain: kcalSeance('musculation', 60, poids, 0, null, { bmr })
    };
  });
  // 18 séries en 70 min : toute la durée, soit 200 à 300 kcal comme les séances mesurées (l'ancien calcul : 88).
  assert.equal(Math.round(r.normale), Math.round(r.parMin * 70));
  assert.ok(r.normale > 200 && r.normale < 300, `séance complète : ${Math.round(r.normale)} kcal`);
  assert.equal(Math.round(r.ouverte), Math.round(r.parMin * 18 * 4), 'restée ouverte : 4 min par série au plus');
  assert.equal(Math.round(r.dense), Math.round(r.parMin * 18 * 2), 'en supersets : 2 min par série au moins');
  assert.equal(Math.round(r.sansDuree), Math.round(r.parMin * 18 * 3), 'sans durée : 3 min par série');
  assert.equal(Math.round(r.aLaMain), Math.round(r.parMin * 60), 'ajoutée à la main : sa durée déclarée, au même MET qu\'une séance suivie');
}));

async function glisser(page, selecteur, dx) {
  // Au milieu de l'écran, comme un utilisateur qui fait défiler : pas sous la barre d'onglets.
  await page.locator(selecteur).first().evaluate(el => el.scrollIntoView({ block: 'center' }));
  const b = await page.locator(selecteur).first().boundingBox();
  const x = b.x + b.width / 2, y = b.y + Math.min(20, b.height / 2);
  await page.mouse.move(x, y); await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(x + dx * k / 10, y);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test("éditeur de programme : glisser pour retirer ou remplacer, toucher le nom pour l'historique", () => avecAppli({}, async ({ page, dialogues }) => {
  await page.evaluate(() => {
    allerA('seance'); choisirModeSeance('muscu'); ouvrirCreationProgramme();
    const ids = toutesLesExercices().slice(0, 3).map(e => e.id);
    programmeEnEdition.exercices = ids.slice(0, 2).map(id => ({ exerciceId: id, series: [{ poids: 40, reps: 10 }, { poids: 40, reps: 10 }], tempo: '3010', plage: '8-12' }));
    window.__ids = ids;
    renderProgrammeExercicesEnEdition();
  });
  assert.equal(await page.locator('#programme-exercices-container .btn-delete').count(), 0, 'plus de bouton ✕');
  // Glisser à droite : remplacer
  await glisser(page, '#programme-exercices-container .exo-swipe:nth-child(1) .exo-en-programme-entete', 160);
  await page.waitForSelector('#picker-exercices-modal.show');
  await page.evaluate(() => choisirExercicePicker(window.__ids[2]));
  let r = await page.evaluate(() => programmeEnEdition.exercices.map(e => [e.exerciceId, e.series.length, e.tempo, e.plage]));
  assert.deepEqual(r[0], [await page.evaluate(() => window.__ids[2]), 2, '3010', '8-12']);
  // Glisser à gauche : retirer tout de suite, avec « Annuler » pendant quelques secondes
  await glisser(page, '#programme-exercices-container .exo-swipe:nth-child(2) .exo-en-programme-entete', -160);
  r = await page.evaluate(() => programmeEnEdition.exercices.length);
  assert.equal(r, 1);
  assert.equal(dialogues.length, 0, 'plus de confirmation');
  assert.match(await page.textContent('#toast-annuler'), /retiré/);
  await page.click('#toast-annuler button');
  assert.equal(await page.evaluate(() => programmeEnEdition.exercices.length), 2, 'Annuler le remet');
  await glisser(page, '#programme-exercices-container .exo-swipe:nth-child(2) .exo-en-programme-entete', -160);
  await page.evaluate(() => document.getElementById('toast-annuler').classList.remove('visible'));
  // Toucher le nom : fiche sur le résumé
  await page.click('#programme-exercices-container .exo-en-programme-nom');
  await page.waitForSelector('#fiche-exercice-modal.show');
  assert.equal(await page.evaluate(() => document.querySelector('#fiche-exercice-modal [aria-pressed="true"]')?.textContent.trim()), 'Résumé');
}));

test('éditeur de programme : appui long pour déplacer un exercice', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    allerA('seance'); choisirModeSeance('muscu'); ouvrirCreationProgramme();
    programmeEnEdition.exercices = toutesLesExercices().slice(0, 4).map(e => ({ exerciceId: e.id, series: [{ poids: 40, reps: 10 }] }));
    renderProgrammeExercicesEnEdition();
  });
  const avant = await page.evaluate(() => programmeEnEdition.exercices.map(e => e.exerciceId));
  await page.locator('#programme-exercices-container .exo-en-programme-entete').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -120));
  const b = await page.locator('#programme-exercices-container .exo-en-programme-entete').first().boundingBox();
  const x = b.x + 60, y = b.y + 15;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(() => document.getElementById('programme-exercices-container').classList.contains('reordre')), 'les exercices se replient');
  // Deux cartes repliées plus bas : la hauteur d'une carte repliée, mesurée.
  const pas = await page.evaluate(() => { const z = document.querySelectorAll('#programme-exercices-container .exo-swipe'); return z[1].getBoundingClientRect().top - z[0].getBoundingClientRect().top; });
  for (let k = 1; k <= 10; k++) await page.mouse.move(x, y + k * pas * 0.25);
  await page.mouse.up(); await page.waitForTimeout(300);
  const apres = await page.evaluate(() => programmeEnEdition.exercices.map(e => e.exerciceId));
  assert.deepEqual(apres, [avant[1], avant[2], avant[0], avant[3]]);
  assert.equal(await page.evaluate(() => !!document.querySelector('#fiche-exercice-modal.show')), false, "l'appui long n'ouvre pas la fiche");
  assert.equal(await page.locator('#programme-exercices-container .exo-en-programme-reordre').count(), 0, 'plus de flèches');
}));

test("séries par muscle : une série « Échec » ou « Dégressif » compte toujours ; une série trop légère le dit en séance, et le RIR noté la fait compter", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    const avant = decalerJours(todayStr(), -3);
    musculationHistorique = [{ id: 'h1', date: avant, exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 22, reps: 10, fait: true }] }] }];
    allerA('seance'); choisirModeSeance('muscu');
    musculationSessionActive = { programmeId: null, programmeNom: null, debut: Date.now(), notes: '',
      exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [
        { poids: 22, reps: 10, fait: true },
        { poids: 13, reps: 10, fait: true },
        { poids: 13, reps: 8, fait: true, technique: 'echec' },
        { poids: 13, reps: 10, fait: true, technique: 'degressif' },
        { poids: 13, reps: 10 }] }] };
    sauvegarderSessionActive(); renderSeance(); renderSessionModal();
    const compter = () => ajouterSeriesParGroupe({}, musculationSessionActive.exercices, { historique: musculationHistorique })[exo.groupe];
    const res = { avant: compter(), legeres: [...document.querySelectorAll('#session-exercices-container .serie-legere span')].map(x => x.textContent) };
    document.querySelector('#session-exercices-container .serie-legere button').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.bandeOuverte = !!document.querySelector('#session-exercices-container .rir-bande');
    res.legeresPendantBande = document.querySelectorAll('#session-exercices-container .serie-legere').length;
    [...document.querySelectorAll('#session-exercices-container .rir-choix')].find(b => b.textContent === '2').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.apres = compter();
    res.legeresApres = document.querySelectorAll('#session-exercices-container .serie-legere').length;
    res.unitaires = [
      estSerieDeTravail({ fait: true, poids: 13, reps: 10 }, 29.3),
      estSerieDeTravail({ fait: true, poids: 13, reps: 10, technique: 'echec' }, 29.3),
      estSerieDeTravail({ fait: true, poids: 13, reps: 10, technique: 'degressif' }, 29.3),
      estSerieDeTravail({ fait: true, poids: 13, reps: 10, technique: 'echauffement' }, 29.3),
      estSerieDeTravail({ fait: false, poids: 13, reps: 10, technique: 'echec' }, 29.3)];
    musculationSessionActive = null; musculationHistorique = [];
    return res;
  });
  assert.deepEqual(r.unitaires, [false, true, true, false, false]);
  assert.equal(r.avant, 3, '22 kg, échec et dégressif comptent ; 13 kg sans rien, non');
  assert.deepEqual(r.legeres, ['Trop légère pour compter par muscle.']);
  assert.deepEqual([r.bandeOuverte, r.legeresPendantBande], [true, 0]);
  assert.deepEqual([r.apres, r.legeresApres], [4, 0]);
}));

test('séance en cours : appui long sur un exercice pour le déplacer', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    allerA('seance'); choisirModeSeance('muscu');
    musculationSessionActive = { programmeId: null, programmeNom: null, debut: Date.now(), notes: '',
      exercices: toutesLesExercices().slice(0, 4).map(e => ({ exerciceId: e.id, nom: e.nom, series: [{ poids: 40, reps: 10, fait: true }, { poids: 40, reps: 10 }] })) };
    // Les deux derniers en superset ; un repos en cours sur le premier.
    musculationSessionActive.exercices[2].supersetSuivant = true;
    reposActifs = { '0_0': Date.now() };
    sauvegarderSessionActive(); renderSeance();
  });
  const avant = await page.evaluate(() => musculationSessionActive.exercices.map(e => e.exerciceId));
  const entete = page.locator('#session-exercices-container .session-exo-entete').first();
  await entete.evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -120));
  const b = await page.locator('#session-exercices-container .session-exo-nom').first().boundingBox();
  const x = b.x + 20, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(() => document.getElementById('session-exercices-container').classList.contains('reordre')), 'les exercices se replient');
  const pas = await page.evaluate(() => { const z = document.querySelectorAll('#session-exercices-container .exo-swipe'); return z[1].getBoundingClientRect().top - z[0].getBoundingClientRect().top; });
  for (let k = 1; k <= 10; k++) await page.mouse.move(x, y + k * pas * 0.25);
  await page.mouse.up(); await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({
    ordre: musculationSessionActive.exercices.map(e => e.exerciceId),
    supersets: musculationSessionActive.exercices.map(e => !!e.supersetSuivant),
    repos: Object.keys(reposActifs),
    replie: document.getElementById('session-exercices-container').classList.contains('reordre'),
    fiche: !!document.querySelector('#fiche-exercice-modal.show'),
    garde: JSON.parse(localStorage.getItem(MUSCU_SESSION_KEY)).exercices.map(e => e.exerciceId)
  }));
  // Posé au milieu du superset, il le rejoint ; son repos le suit.
  assert.deepEqual(r.ordre, [avant[1], avant[2], avant[0], avant[3]]);
  assert.deepEqual(r.supersets, [false, true, true, false]);
  assert.deepEqual(r.repos, ['2_0']);
  assert.equal(r.replie, false);
  assert.equal(r.fiche, false, "l'appui long n'ouvre pas la fiche");
  assert.deepEqual(r.garde, r.ordre, 'la séance enregistrée suit');
  // Un simple toucher sur le nom ouvre toujours la fiche.
  await page.locator('#session-exercices-container .session-exo-nom').first().click();
  assert.equal(await page.evaluate(() => !!document.querySelector('#fiche-exercice-modal.show')), true);
}));

test('remplacer un exercice propose des exercices similaires', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const squat = toutesLesExercices().find(e => /^squat avec barre$/i.test(e.nom)) || toutesLesExercices().find(e => /squat/i.test(e.nom));
    allerA('seance'); choisirModeSeance('muscu'); demarrerSeanceLibre(); ajouterExerciceASession(squat.id);
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    remplacerExerciceSession(0);
    const titres = [...document.querySelectorAll('#picker-liste-exercices .picker-titre-bloc')].map(x => x.textContent);
    const lignes = [...document.querySelectorAll('#picker-liste-exercices .exo-ligne')].slice(0, 6).map(x => x.querySelector('.exo-ligne-nom').textContent);
    return { squat: squat.nom, titres, lignes };
  });
  assert.deepEqual(r.titres, ['Exercices similaires', 'Toute la bibliothèque']);
  assert.ok(r.lignes.filter(n => /squat/i.test(n)).length >= 4, 'des squats sont proposés pour remplacer un squat : ' + r.lignes.join(', '));
  assert.ok(!r.lignes.includes(r.squat), "l'exercice remplacé n'est pas proposé");
}));

test('un programme se crée puis se supprime sans revenir', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    allerA('seance'); choisirModeSeance('muscu');
    ouvrirCreationProgramme();
    document.getElementById('programme-nom-input').value = 'Push test';
    ouvrirPickerExercices('programme');
    choisirExercicePicker(toutesLesExercices()[0].id);
    document.querySelectorAll('.modal.show, .feuille.show').forEach(m => m.classList.remove('show'));
    validerProgramme();
  });
  const id = await page.evaluate(() => (musculationProgrammes.find(p => p.nom === 'Push test') || {}).id);
  assert.ok(id, 'le programme doit être enregistré');
  assert.match(await page.textContent('#programmes-liste-container'), /Push test/);
  await page.evaluate(id => supprimerProgramme(id), id);
  const r = await page.evaluate(id => ({
    reste: musculationProgrammes.some(p => p.id === id),
    marque: !!(JSON.parse(localStorage.getItem(MUSCU_TOMBES_LS) || '{}').programmes_musculation || {})[id]
  }), id);
  assert.deepEqual(r, { reste: false, marque: true });
}));

test('le cardio : ajouter, modifier, supprimer une séance', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('cardio'); });
  const avant = await page.evaluate(() => computeTargets(getDay(todayStr()), todayStr()).tdee);
  await page.click('.cardio-ajouter');
  // ouvrirModal place le curseur dans le premier champ 60 ms après
  // l'ouverture : on l'attend, sinon la saisie suivante y atterrirait.
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cardio-duree');
  await page.fill('#cardio-duree', '30');
  await page.fill('#cardio-distance', '5');
  assert.match(await page.textContent('#cardio-allure'), /6:00 \/km/);
  await page.click('#modal-cardio .btn-primary');
  let r = await page.evaluate(() => ({ nb: seancesCardio().length, w: seancesCardio()[0].w, tdee: computeTargets(getDay(todayStr()), todayStr()).tdee }));
  assert.equal(r.nb, 1);
  assert.deepEqual([r.w.type, r.w.time, r.w.distance, r.w.intensite], ['course', 30, 5, 2]);
  assert.ok(r.tdee > avant, 'la séance doit augmenter la dépense du jour');
  assert.match(await page.textContent('#seance-cardio .cardio-gros'), /^30/);
  // Modifier : passer en intense (compte double dans la jauge)
  await page.click('#seance-cardio .cardio-seance');
  await page.click('#cardio-intensites button:nth-child(3)');
  await page.click('#modal-cardio .btn-primary');
  assert.match(await page.textContent('#seance-cardio .cardio-gros'), /^60/);
  // Supprimer
  await page.click('#seance-cardio .cardio-seance');
  await page.click('#btn-suppr-cardio');
  r = await page.evaluate(() => seancesCardio().length);
  assert.equal(r, 0);
}));

test("historique d'un programme : toucher un exercice ouvre sa courbe", () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    const exo = toutesLesExercices().find(e => e.groupe === 'epaules') || toutesLesExercices()[0];
    for (let k = 0; k < 4; k++) {
      const date = shiftDate(todayStr(), -7 * k);
      musculationHistorique.push({ id: 'h' + k, programmeId: 'p1', programmeNom: 'Épaules', date, debut: Date.now() - 3e6, fin: Date.now(), dureeMin: 50, maj: Date.now(),
        exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 20 + k, reps: 10, fait: true }, { poids: 22 + k, reps: 8, fait: true }] }] });
    }
    sauvegarderHistorique();
    allerA('stats'); choisirOngletStats('muscu'); choisirSousOngletMuscu('programmes');
  });
  await page.click('#muscu-stats-programmes [onclick^="voirDetailProgramme"]');
  await page.waitForSelector('#programme-detail-modal.show');
  await page.click('#programme-detail-container .detail-exo-titre');
  await page.waitForSelector('#fiche-exercice-modal.show');
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ visible: !!document.querySelector('#fiche-exercice-modal.show'), courbe: !!document.querySelector('#fiche-resume-courbe canvas, #fiche-resume-courbe svg') }));
  assert.deepEqual(r, { visible: true, courbe: true });
}));

test('la bibliothèque s\'ouvre vite et ne lance que quelques vidéos', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const t0 = performance.now(); ouvrirBibliotheque(); const duree = performance.now() - t0;
    return { duree, lignes: document.querySelectorAll('#picker-liste-exercices .exo-ligne').length, total: toutesLesExercices().length };
  });
  assert.ok(r.total > 200);
  assert.ok(r.lignes <= 60, `rendu progressif attendu, ${r.lignes} lignes d'un coup`);
  assert.ok(r.duree < 200, `ouverture trop lente : ${Math.round(r.duree)} ms`);
  for (let k = 0; k < 15; k++) { await page.evaluate(() => { document.querySelector('#picker-exercices-modal .modal-content').scrollTop += 1200; }); await page.waitForTimeout(50); }
  await page.waitForTimeout(700);
  const apres = await page.evaluate(() => ({ lignes: document.querySelectorAll('#picker-liste-exercices .exo-ligne').length, videos: document.querySelectorAll('#picker-liste-exercices video').length }));
  assert.ok(apres.lignes > r.lignes, 'la suite se charge en défilant');
  assert.ok(apres.videos <= 4, `${apres.videos} vidéos à la fois`);
  // Liste immobile : plus aucune vidéo créée ni retirée (pas de clignotement)
  const remous = await page.evaluate(() => new Promise(ok => {
    let n = 0;
    const obs = new MutationObserver(ms => ms.forEach(m => [...m.addedNodes, ...m.removedNodes].forEach(x => { if (x.tagName === 'VIDEO' || x.tagName === 'IMG') n++; })));
    obs.observe(document.getElementById('picker-liste-exercices'), { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); ok(n); }, 2500);
  }));
  assert.equal(remous, 0, `${remous} vignettes remplacées alors que la liste ne bouge pas`);
  // La recherche filtre toujours toute la base
  await page.fill('#picker-recherche', 'développé couché');
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.querySelectorAll('#picker-liste-exercices .exo-ligne').length) > 0);
}));

test("un lien SmartWorkout collé comme vidéo n'est plus affiché (site comme app) ; une autre image reste une image", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const IMG_AB_COASTER = 'https://api.smartworkout.app/asset/image/4e939dab-2978-4d2f-82f0-74cafb543e9a';
    const connu = videoExercice({ id: 'x', video: IMG_AB_COASTER });
    const inconnu = videoExercice({ id: 'y', video: 'https://exemple.fr/photo.jpg' });
    const vraieVideo = videoExercice({ id: 'z', video: 'https://exemple.fr/demo.mp4' });
    // Vignette et fiche d'un exercice dont l'image est inconnue : une photo, pas un carré noir
    const vignette = medaillonExercice({ id: 'y', nom: 'Test', groupe: 'abdominaux', materiel: 'poids_corps', video: 'https://exemple.fr/photo.jpg' });
    return { connu, inconnu, vraieVideo, vignetteImg: /^<img/.test(vignette) };
  });
  assert.equal(r.connu, null);
  assert.equal(r.inconnu.video, null);
  assert.equal(r.inconnu.poster, 'https://exemple.fr/photo.jpg');
  assert.equal(r.vraieVideo.video, 'https://exemple.fr/demo.mp4');
  assert.ok(r.vignetteImg, 'une image inconnue s\'affiche comme photo');
}));

test('stats muscu : détail par faisceau et déséquilibres (pecs, épaules, dos)', () => avecAppli({}, async ({ page }) => {
  const lire = () => page.evaluate(() => {
    renderZonesMuscu('muscu-zones-container');
    const res = {};
    document.querySelectorAll('#muscu-zones-container details.faisceaux').forEach(d => {
      res[d.dataset.groupe] = {
        lignes: d.querySelectorAll('.faisceau-ligne').length,
        alertes: [...d.querySelectorAll('.alerte-volume-seance')].map(a => a.textContent.trim())
      };
    });
    return res;
  });
  // Semaine déséquilibrée : développé couché, développé militaire et tractions seulement.
  await page.evaluate(() => {
    allerA('stats'); choisirOngletStats('muscu');
    const id = nom => { const e = toutesLesExercices().find(x => x.nom === nom); if (!e) throw new Error('exercice introuvable : ' + nom); return e.id; };
    const series = n => Array.from({ length: n }, () => ({ poids: 50, reps: 8, fait: true, rir: 1 }));
    window.ajouterSeanceTest = noms => {
      musculationHistorique.unshift({ id: 'test-' + musculationHistorique.length, date: todayStr(), exercices: noms.map(nom => ({ exerciceId: id(nom), series: series(6) })) });
    };
    ajouterSeanceTest(['Développé couché avec barre', 'Développé épaules avec haltères', 'Tractions prise large']);
  });
  let r = await lire();
  assert.deepEqual(Object.keys(r).sort(), ['biceps', 'dos', 'epaules', 'pectoraux', 'triceps']);
  assert.deepEqual([r.pectoraux.lignes, r.epaules.lignes, r.dos.lignes], [3, 3, 2]);
  const toutes = ['pectoraux', 'epaules', 'dos'].flatMap(g => r[g].alertes).join(' | ');
  for (const motif of [/postérieur/, /latéral/, /haut des pectoraux/i, /rowing/i]) assert.match(toutes, motif);
  // La somme des faisceaux retombe sur le total du groupe.
  const ecart = await page.evaluate(() => {
    const f = {};
    const s = seriesSemaine(lundiDeLaSemaine(todayStr()), false, null, f);
    return Object.keys(FAISCEAUX).map(g => Math.abs(FAISCEAUX[g].reduce((t, [c]) => t + (f[c] || 0), 0) - (s[g] || 0)));
  });
  assert.ok(ecart.every(e => e < 1e-9), 'faisceaux ≠ total du groupe : ' + ecart);
  // Compléter : incliné, rowing, oiseau, élévations latérales → plus d'alerte.
  await page.evaluate(() => ajouterSeanceTest(['Développé incliné avec haltères', 'Rowing barre buste penché', 'Oiseau à la poulie', 'Élévation latérale avec haltères']));
  r = await lire();
  assert.deepEqual(['pectoraux', 'epaules', 'dos'].flatMap(g => r[g].alertes), []);
}));

test('faisceaux : affichés sur la fiche, réglables dans Administration, données piégées ignorées', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const exo = toutesLesExercices().find(e => e.nom === 'Développé incliné avec haltères');
    const res = {};
    // Fiche : estimation (haut principal, milieu un peu ; antérieur pour les épaules).
    afficherFicheExerciceBiblio(exo.id);
    const lire = () => [...document.querySelectorAll('#fiche-exercice-container .fiche-faisceaux')].map(l => [...l.children].map(x => x.textContent.trim()).join(' '));
    res.ficheEstimee = lire();
    res.noteEstimee = /Estimés/.test(document.querySelector('#fiche-exercice-container .fiche-faisceaux-bloc').textContent);
    fermerModal('fiche-exercice-modal');
    // Administration : toucher « Bas » (non sollicité → principal), « Haut » (principal → un peu).
    editerExerciceAdmin({ ...exo, estBase: true });
    const puce = cle => document.querySelector(`#edit-exo-faisceaux [data-groupe="pectoraux"] [data-faisceau="${cle}"]`);
    res.avant = ['pec_haut', 'pec_milieu', 'pec_bas'].map(c => puce(c).dataset.niveau);
    puce('pec_bas').click(); puce('pec_haut').click();
    res.apres = ['pec_haut', 'pec_milieu', 'pec_bas'].map(c => puce(c).dataset.niveau);
    res.enregistre = faisceauxAEnregistrer(document.getElementById('edit-exo-groupe').value);
    document.querySelector('#edit-exo-faisceaux [data-groupe="pectoraux"] .admin-faisceaux-tete button').click();
    res.retourAuto = faisceauxAEnregistrer('pectoraux');
    fermerModal('modal-edit-exercice-admin');
    // Choix enregistré : il passe avant l'estimation, sur la fiche et dans les stats.
    exo.faisceaux = { pectoraux: { pec_bas: 2, pec_haut: 1 } };
    afficherFicheExerciceBiblio(exo.id);
    res.ficheChoisie = lire();
    res.poids = repartitionFaisceaux(exo, 'pectoraux');
    // Données piégées (exercice partagé par un autre compte) : ignorées.
    res.piege = repartitionFaisceaux({ nom: 'Développé couché', groupe: 'pectoraux', faisceaux: { pectoraux: { '<img src=x onerror=alert(1)>': 2, pec_haut: 7, constructor: 2 } } }, 'pectoraux');
    delete exo.faisceaux;
    return res;
  });
  assert.deepEqual(r.ficheEstimee, ['Pectoraux Haut Milieu', 'Épaules Antérieur', 'Triceps Longue portion Vaste latéral Vaste médial']);
  assert.ok(r.noteEstimee);
  assert.deepEqual(r.avant, ['2', '1', '0']);
  assert.deepEqual(r.apres, ['1', '1', '2']);
  assert.deepEqual(r.enregistre, { pectoraux: { pec_haut: 1, pec_milieu: 1, pec_bas: 2 } });
  assert.equal(r.retourAuto, null);
  assert.deepEqual(r.ficheChoisie, ['Pectoraux Haut Bas', 'Épaules Antérieur', 'Triceps Longue portion Vaste latéral Vaste médial']);
  assert.ok(Math.abs(r.poids.pec_bas - 1 / 1.4) < 1e-9 && Math.abs(r.poids.pec_haut - 0.4 / 1.4) < 1e-9);
  assert.deepEqual(r.piege, { pec_milieu: 0.6, pec_haut: 0.2, pec_bas: 0.2 });
}));

test('faisceaux des jambes : règles, alertes et mannequin (fiche et statistiques)', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const exo = nom => { const e = toutesLesExercices().find(x => x.nom === nom); if (!e) throw new Error('exercice introuvable : ' + nom); return e; };
    const res = {};
    res.legExt = repartitionFaisceaux(exo('Extension des jambes'), 'quadriceps');
    res.squat = niveauxDepuisPoids(repartitionFaisceaux(exo('Squat avec barre'), 'quadriceps'));
    res.mollAssis = repartitionFaisceaux(exo('Élévation des mollets assis'), 'mollets');
    res.abduction = repartitionFaisceaux(exo('Abduction de la hanche à la poulie'), 'fessiers');
    res.curl = repartitionFaisceaux(exo('Curl des ischio-jambiers en position couchée'), 'ischios');
    // Semaine : squats (sans les mollets en secondaire), leg curl et mollets debout seulement.
    const series = n => Array.from({ length: n }, () => ({ poids: 50, reps: 8, fait: true, rir: 1 }));
    musculationHistorique.unshift({ id: 'jambes', date: todayStr(), exercices: ['Squat avec haltères', 'Curl des ischio-jambiers en position couchée', 'Élévation des mollets debout'].map(n => ({ exerciceId: exo(n).id, series: series(6) })) });
    allerA('stats'); choisirOngletStats('muscu');
    renderZonesMuscu('muscu-zones-container');
    res.alertes = {};
    document.querySelectorAll('#muscu-zones-container details.faisceaux').forEach(d => {
      res.alertes[d.dataset.groupe] = [...d.querySelectorAll('.alerte-volume-seance')].map(a => a.textContent.trim());
      if (!d.querySelector('svg.figure-faisceaux')) res.sansFigure = (res.sansFigure || []).concat(d.dataset.groupe);
    });
    // Fiche : le mannequin montre les faisceaux, de face et de dos pour un squat.
    afficherFicheExerciceBiblio(exo('Squat avec barre').id);
    res.figuresFiche = [...document.querySelectorAll('#fiche-exercice-container .fiche-faisceaux-bloc figcaption')].map(f => f.textContent);
    res.colores = document.querySelectorAll('#fiche-exercice-container .fiche-faisceaux-bloc svg path[style*="--fx-fiche"]').length;
    return res;
  });
  assert.equal(r.legExt.quad_droit, 0.5);
  assert.deepEqual(r.squat, { quad_ext: 2, quad_int: 2, quad_droit: 1 });
  assert.ok(r.mollAssis.mol_soleaire > r.mollAssis.mol_gastro);
  assert.ok(r.abduction.fes_moyen > r.abduction.fes_grand);
  assert.ok(r.curl.isch_semi > r.curl.isch_biceps);
  assert.match(r.alertes.quadriceps.join(' '), /leg extension/);
  assert.match(r.alertes.ischios.join(' '), /mouvement de hanche/);
  assert.match(r.alertes.mollets.join(' '), /mollets assis/);
  assert.equal(r.sansFigure, undefined, 'chaque détail par faisceau a son mannequin');
  assert.deepEqual(r.figuresFiche, ['Face', 'Dos']);
  assert.ok(r.colores > 4);
}));

test('faisceaux du biceps et du triceps : règles et alertes', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const exo = nom => { const e = toutesLesExercices().find(x => x.nom === nom); if (!e) throw new Error('exercice introuvable : ' + nom); return e; };
    const principal = (nom, g) => Object.entries(niveauxDepuisPoids(repartitionFaisceaux(exo(nom), g))).filter(([, n]) => n === 2).map(([k]) => k).sort();
    const res = {
      incline: principal('Curl incliné assis pour biceps', 'biceps'),
      pupitre: principal('Curl au pupitre avec barre', 'biceps'),
      marteau: principal('Curl prise marteau', 'biceps'),
      overhead: principal('Extension triceps unilatérale au-dessus de la tête', 'triceps'),
      pushdown: principal('Extension des triceps à la corde', 'triceps'),
      serre: principal('Développé couché prise serrée', 'triceps')
    };
    // Semaine : curls au pupitre et pushdowns seulement.
    const series = n => Array.from({ length: n }, () => ({ poids: 30, reps: 10, fait: true, rir: 1 }));
    musculationHistorique.unshift({ id: 'bras', date: todayStr(), exercices: ['Curl au pupitre avec barre', 'Extension des triceps à la corde'].map(n => ({ exerciceId: exo(n).id, series: series(6) })) });
    allerA('stats'); choisirOngletStats('muscu');
    renderZonesMuscu('muscu-zones-container');
    res.alertes = {};
    document.querySelectorAll('#muscu-zones-container details.faisceaux').forEach(d => { res.alertes[d.dataset.groupe] = [...d.querySelectorAll('.alerte-volume-seance')].map(a => a.textContent.trim()).join(' | '); });
    res.figures = ['biceps', 'triceps'].map(g => document.querySelectorAll(`#muscu-zones-container details.faisceaux[data-groupe="${g}"] svg.figure-faisceaux`).length);
    return res;
  });
  assert.deepEqual(r.incline, ['bic_long']);
  assert.deepEqual(r.pupitre, ['bic_court']);
  assert.deepEqual(r.marteau, ['bic_brachial']);
  assert.deepEqual(r.overhead, ['tri_long']);
  assert.deepEqual(r.pushdown, ['tri_lat']);
  assert.deepEqual(r.serre, ['tri_lat']);
  assert.match(r.alertes.biceps, /curl incliné/);
  assert.match(r.alertes.biceps, /marteau/);
  assert.match(r.alertes.triceps, /au-dessus de la tête/);
  assert.deepEqual(r.figures, [1, 2], 'biceps de face, triceps de face et de dos');
}));

test('en-tête : ma photo et mon nom d\'utilisateur ouvrent le profil, plus de bouton Profil dans le menu', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const lire = () => ({ nom: document.getElementById('moi-entete-nom').textContent, img: !!document.querySelector('#moi-entete-avatar img') });
    const res = {};
    sessionUtilisateur = null; monPseudo = null; monProfil = null; majEnteteMoi();
    res.deconnecte = lire();
    sessionUtilisateur = { id: 'moi', email: 'jamal@x.fr' }; majEnteteMoi();
    res.sansPseudo = lire();
    monPseudo = { pseudo: 'jamal', partage_seances: true }; monProfil = { bio: '', avatar: 'data:image/jpeg;base64,/9j/4AAQ==' }; majEnteteMoi();
    res.complet = lire();
    sessionUtilisateur = null; majEnteteMoi();
    res.apresDeconnexion = lire();
    allerA('repas');
    document.getElementById('moi-entete').click();
    res.ecran = ecranActif;
    res.boutonProfil = !!document.getElementById('nav-reglages');
    res.position = getComputedStyle(document.querySelector('.app-bar')).position;
    // Halo de synchronisation autour de la photo (synchro configurée : puce visible).
    const puce = document.getElementById('puce-sync');
    puce.classList.remove('hidden');
    res.halo = ['ok', 'erreur', 'sync'].map(e => { majEtatSync(e); return document.getElementById('moi-entete').dataset.sync; });
    res.label = document.getElementById('moi-entete').getAttribute('aria-label');
    res.puceVisible = getComputedStyle(puce).display;
    res.compte = document.getElementById('reglages-puce-sync-txt').textContent;
    puce.classList.add('hidden'); majEtatSync('attente');
    res.sansSynchro = document.getElementById('moi-entete').dataset.sync || null;
    // L'en-tête (salutation, photo) n'existe que sur Repas du jour.
    res.enteteSurProfil = getComputedStyle(document.querySelector('.app-bar')).display;
    allerA('repas');
    const barre = document.querySelector('.app-bar-inner').getBoundingClientRect();
    res.aDroite = Math.round(barre.right - document.getElementById('moi-entete').getBoundingClientRect().right) < 4;
    const logo = document.querySelector('.app-bar .logo-anqa').getBoundingClientRect();
    res.logoAGauche = logo.width > 0 && logo.left - barre.left < 4;
    // Le halo (anneau 2 px + lueur ~9 px) doit tenir dans la barre, sans déborder en haut.
    const photo = document.getElementById('moi-entete-avatar').getBoundingClientRect();
    res.margeHaut = Math.round(photo.top - document.querySelector('.app-bar').getBoundingClientRect().top);
    return res;
  });
  assert.deepEqual(r.deconnecte, { nom: 'Se connecter', img: false });
  assert.deepEqual(r.sansPseudo, { nom: 'jamal', img: false });
  assert.deepEqual(r.complet, { nom: 'jamal', img: true });
  assert.equal(r.apresDeconnexion.img, false, 'jamais la photo du compte précédent');
  assert.equal(r.ecran, 'reglages');
  assert.equal(r.boutonProfil, false);
  assert.equal(r.position, 'relative', 'la barre défile avec la page, comme avant');
  assert.deepEqual(r.halo, ['ok', 'erreur', 'sync']);
  assert.equal(r.label, 'Mon profil — synchronisation : Envoi…');
  assert.equal(r.puceVisible, 'none', 'plus de voyant texte dans la barre');
  assert.equal(r.compte, 'Synchronisation : Envoi…');
  assert.equal(r.sansSynchro, null, 'pas de halo sans synchronisation configurée');
  assert.ok(r.aDroite, 'photo et nom calés à droite');
  assert.ok(r.logoAGauche, 'logo Askēsis (colonne) visible à gauche');
  assert.equal(r.enteteSurProfil, 'none');
  assert.ok(r.margeHaut >= 11, 'place pour le halo au-dessus de la photo : ' + r.margeHaut + ' px');
}));

test('les statistiques s\'affichent sur chaque onglet et chaque période', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    const t = todayStr();
    for (let k = 0; k < 30; k += 3) {
      const d = getDay(shiftDate(t, -k));
      d.steps = 6000 + k * 100; d.weight = 80 - k * 0.05;
      d.workouts.push({ type: 'course', time: 30, distance: 5 + (k % 2), intensite: 2 });
      saveData(shiftDate(t, -k));
    }
    allerA('stats');
  });
  for (const onglet of ['poids', 'nutrition', 'activite', 'muscu']) {
    for (const periode of await page.evaluate(() => PERIODES_STATS.map(p => p[0]).filter(p => p !== 'perso'))) {
      await page.evaluate(([o, p]) => { choisirOngletStats(o); choisirPeriodeStats(p); }, [onglet, periode]);
    }
  }
  const r = await page.evaluate(() => ({ semaines: !!cardioSemainesChartInstance, allure: !!cardioAllureChartInstance, records: document.querySelectorAll('#cardio-records .cardio-record').length }));
  assert.deepEqual(r, { semaines: true, allure: true, records: 3 });
}));

test("barre d'onglets : Repas, Activité, +, Progrès, Profil ; plus de bouton flottant", () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => allerA('repas'));
  let r = await page.evaluate(() => {
    const n = document.getElementById('onglets'), b = n.getBoundingClientRect();
    return { pos: getComputedStyle(n).position, dansEcran: b.top >= 0 && b.bottom <= innerHeight, boutons: n.querySelectorAll('button').length,
      actif: document.querySelector('#onglets .onglet.actif').id, fab: document.getElementById('fab-zone'), ajout: document.getElementById('ajout-rapide') };
  });
  assert.deepEqual(r, { pos: 'fixed', dansEcran: true, boutons: 5, actif: 'onglet-repas', fab: null, ajout: null });
  // Chaque onglet mène à son écran et devient l'onglet actif.
  for (const [id, ecran] of [['onglet-seance', 'seance'], ['onglet-profil', 'reglages'], ['onglet-progres', 'stats'], ['onglet-repas', 'repas']]) {
    await page.click('#' + id);
    r = await page.evaluate(() => [ecranActif, document.querySelector('#onglets .onglet.actif').id]);
    assert.deepEqual(r, [ecran, 'onglet-' + (ecran === 'reglages' ? 'profil' : ecran === 'stats' ? 'progres' : ecran)]);
  }
  // Progrès s'ouvre sur le Résumé ; les cinq onglets restent toujours visibles.
  await page.click('#onglet-progres');
  r = await page.evaluate(() => ({ actif: categorieStatsActive(), onglets: [...document.querySelectorAll('#stats-onglets-nav button')].map(b => b.textContent.trim()),
    titre: document.getElementById('stats-titre').textContent }));
  assert.deepEqual(r, { actif: 'resume', onglets: ['Résumé', 'Corps', 'Repas', 'Cardio', 'Muscu'], titre: 'Progrès' });
  await page.evaluate(() => ouvrirStats('nutrition'));
  assert.equal(await page.evaluate(() => document.getElementById('stats-onglets-nav').offsetHeight > 0), true);
  // « + » : ajouter au repas du moment ; la barre s'efface derrière la feuille.
  await page.evaluate(() => allerA('repas'));
  await page.click('#onglet-plus');
  r = await page.evaluate(() => ({ feuille: document.getElementById('feuille-repas').classList.contains('show'), cache: document.body.classList.contains('couche-ouverte'), titre: document.getElementById('feuille-repas-titre').textContent }));
  assert.equal(r.feuille, true); assert.equal(r.cache, true); assert.match(r.titre, /^Ajouter à : /);
}));

test('Repas du jour : toucher une macro ouvre sa courbe face à son objectif', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    const t = todayStr();
    for (let k = 0; k < 10; k++) { const d = shiftDate(t, -k); getDay(d).meals[MEALS[0]].push({ name: 'Test', kcal: 1800, p: 120 + k, c: 200, f: 60 }); saveData(d); }
    allerA('repas'); renderApp();
  });
  await page.click('#ecran-repas .macro-item:nth-child(1)');
  // La macro ouvre Progrès › Repas sur sa courbe (sélecteur réglé dessus).
  assert.equal(await page.evaluate(() => document.getElementById('bloc-depense').classList.contains('macro-stat--vise')), false);
  assert.equal(await page.evaluate(() => serieNutrition + '|' + document.querySelector('#nutri-series-nav [aria-pressed="true"]').textContent), 'p|Prot.');
  await page.waitForFunction(() => Object.keys(macroChartsInstances).length === 3);
  // Défilement doux jusqu'à la courbe (le bilan du jour est au-dessus).
  await page.waitForFunction(() => { const b = document.getElementById('macro-stat-p').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }, null, { timeout: 3000 });
  await page.waitForFunction(() => document.getElementById('macro-stat-p').classList.contains('macro-stat--vise'), null, { timeout: 2000 });
  const r = await page.evaluate(() => {
    const c = macroChartsInstances.p, b = document.getElementById('macro-stat-p').getBoundingClientRect();
    const cible = computeTargets(getDay(todayStr()), todayStr()).protein;
    return { ecran: ecranActif, titre: document.getElementById('stats-titre').textContent,
      series: c.data.datasets.map(d => d.label), dernier: c.data.datasets[0].data.at(-1), objectif: c.data.datasets[1].data.at(-1) === cible,
      visible: b.top >= 0 && b.bottom <= innerHeight, vise: document.getElementById('macro-stat-p').classList.contains('macro-stat--vise'),
      ancien: !!document.getElementById('macrosChart') };
  });
  assert.deepEqual(r, { ecran: 'stats', titre: 'Progrès', series: ['Protéines (g)', 'Objectif'], dernier: 120, objectif: true, visible: true, vise: true, ancien: false });
  await page.click('#onglet-repas');
  // Le reste du résumé : la dépense du jour et le bilan de la journée,
  // dans une fenêtre sur Repas du jour (plus dans Progrès, qui parle de la période).
  await page.click('#ecran-repas .summary-card .anneaux');
  const dep = await page.evaluate(() => ({ ecran: ecranActif, modale: document.getElementById('depense-modal').classList.contains('show'),
    dansProgres: !!document.querySelector('#ecran-stats #bloc-depense, #ecran-stats #carte-bilan-jour'),
    bilanJour: !!document.querySelector('#depense-modal #carte-bilan-jour'),
    lignes: document.querySelectorAll('#detail-depense > div').length, visible: document.getElementById('bloc-depense').getBoundingClientRect().top < innerHeight }));
  assert.deepEqual(dep, { ecran: 'repas', modale: true, dansProgres: false, bilanJour: true, lignes: 7, visible: true });
  await page.evaluate(() => fermerModal('depense-modal'));
  await page.click('#ecran-repas .macro-item:nth-child(3)');
  await page.waitForTimeout(700);
  assert.ok(await page.evaluate(() => document.getElementById('macro-stat-f').classList.contains('macro-stat--vise')));
  assert.equal(await page.evaluate(() => document.querySelector('#ecran-stats .nutri-serie--active').dataset.serie), 'f');
}));

test("« Déjà mangé » suit le nouveau nom d'un aliment renommé (même code-barres)", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const t = todayStr();
    const jours = [shiftDate(t, -3), shiftDate(t, -2), shiftDate(t, -1)];
    getDay(jours[0]).meals[MEALS[0]].push({ name: "Kok'o handgekookte gepelde eieren", grams: 86, kcal: 114, p: 11, c: 1, f: 8, code: '5413828000650' });
    getDay(jours[1]).meals[MEALS[0]].push({ name: "Kok'o handgekookte gepelde eieren", grams: 86, kcal: 114, p: 11, c: 1, f: 8, code: '5413828000650' });
    getDay(jours[2]).meals[MEALS[0]].push({ name: 'Yaourt nature', grams: 125, kcal: 70, p: 5, c: 6, f: 2 });
    // Même produit noté à la main (sans code-barres) sous l'ancien nom : rattaché au code.
    getDay(jours[2]).meals[MEALS[1]].push({ name: "Kok'o handgekookte gepelde eieren", grams: 50, kcal: 66, p: 6, c: 0, f: 5 });
    // Autre saisie à la main, jamais vue avec un code : reste à part.
    getDay(jours[2]).meals[MEALS[2]].push({ name: "Kok'o oeufs durs", grams: 86, kcal: 114, p: 11, c: 1, f: 8 });
    jours.forEach(saveData); invaliderHistorique();
    // La base renvoie l'aliment perso renommé, avec le même code-barres.
    window.chercherAlimentsSupabase = async () => ({ aliments: [
      { name: "Kok'o - oeufs dur", source: 'perso', code: '5413828000650', nutriments: { 'energy-kcal_100g': 132 } }
    ], probleme: '' });
    await afficherRecherche('kok', false);
    const noms = [...document.querySelectorAll('#off-suggestions-list .off-suggestion')].map(b => b.textContent);
    const deja = chercherDansHistorique('', 10).map(p => [p.name, p.fois]);
    return { noms, deja };
  });
  // Le produit au code-barres : une seule entrée au nouveau nom (3 fois, dont la
  // saisie à la main) ; plus de doublon dans « Mes aliments ».
  assert.equal(r.noms.length, 2, JSON.stringify(r.noms));
  assert.match(r.noms[0], /Kok'o - oeufs dur/);
  assert.match(r.noms[1], /Kok'o oeufs durs/);
  assert.doesNotMatch(r.noms.join(' '), /handgekookte/);
  assert.deepEqual(r.deja[0], ["Kok'o - oeufs dur", 3]);
  // Les repas notés prennent le nouveau nom ; valeurs et poids inchangés.
  const repas = await page.evaluate(() => [-3, -1].map(k => getDay(shiftDate(todayStr(), k))).map((j, i) => (i ? j.meals[MEALS[1]] : j.meals[MEALS[0]])[0]).map(it => [it.name, it.code, it.grams, it.kcal]));
  assert.deepEqual(repas, [["Kok'o - oeufs dur", '5413828000650', 86, 114], ["Kok'o - oeufs dur", '5413828000650', 50, 66]]);
  // × : retire l'entrée de « Déjà mangé », sans toucher aux repas.
  await page.evaluate(() => document.querySelectorAll('#off-suggestions-list .off-retirer')[1].click());
  const restant = await page.evaluate(() => ({ deja: chercherDansHistorique('kok', 10).map(p => p.name), repas: getDay(shiftDate(todayStr(), -1)).meals[MEALS[2]].length, masques: Object.keys(userProfile.dejaMangeMasques) }));
  assert.deepEqual(restant, { deja: ["Kok'o - oeufs dur"], repas: 1, masques: ["kok'o oeufs durs"] });
  // Renommage dans Administration : l'ancien nom disparaît aussi des repas sans code-barres.
  const admin = await page.evaluate(() => { const n = renommerDansHistorique({ ancienNom: "Kok'o oeufs durs", codes: [''], nouveauNom: 'Oeufs durs maison' }); const it = getDay(shiftDate(todayStr(), -1)).meals[MEALS[2]][0]; return [n, it.name, it.grams, it.kcal]; });
  assert.deepEqual(admin, [1, 'Oeufs durs maison', 86, 114]);
  // Retenu d'une ouverture à l'autre (sans réseau) et appliqué tout de suite après un renommage.
  const apres = await page.evaluate(() => { nomsParCode = JSON.parse(localStorage.getItem('anqaa_noms_par_code')); invaliderHistorique(); retenirNomParCode('5413828000650', 'Oeufs durs Kokou'); return chercherDansHistorique('', 10)[0].name; });
  assert.equal(apres, 'Oeufs durs Kokou');
}));

test('cartes de stats : pas, eau et poids sur Repas du jour (pesée au toucher), détails dans Progrès, bandeaux cardio et muscu dans Activité', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    const t = todayStr();
    userProfile.mesures = userProfile.mesures || {};
    for (let k = 1; k <= 30; k++) {
      const d = shiftDate(t, -k), jour = getDay(d);
      jour.weight = 80 - k * 0.1;
      jour.meals[MEALS[0]].push({ name: 'Test', kcal: 2000 + k, p: 140, c: 200, f: 60 });
      if (k % 3 === 0) jour.workouts.push({ type: 'course', time: 30, distance: 5, intensite: 2 });
      if (k % 7 === 0) userProfile.mesures[d] = { poids: jour.weight, grassePct: 18 + k / 30, muscleKg: 36, osKg: 3.2, eauPct: 58 };
      saveData(d);
    }
    musculationHistorique.unshift({ id: 'h-test', programmeNom: 'Test', date: t, debut: Date.now(), fin: Date.now(), dureeMin: 50, maj: Date.now(),
      exercices: [{ exerciceId: 'x', nom: 'Développé couché', series: [{ poids: 60, reps: 10, fait: true }, { poids: 60, reps: 9, fait: true }] }] });
    allerA('repas'); renderApp();
  });
  // Plus d'entrée « Statistiques » dans le menu du bouton flottant.
  assert.equal(await page.$('#nav-stats'), null);
  const repas = await page.evaluate(() => [...document.getElementById('cartes-stats-repas').children].map(c => c.id));
  assert.deepEqual(repas, ['carte-stats-pas', 'bloc-eau', 'carte-stats-poids']);
  assert.match(await page.textContent('#carte-stats-poids .carte-stats-valeur'), /79,9\s*kg/);
  // Une même rangée qui défile (icône, valeur, tendance, graphique) ; plus de carte Nutrition ni de bouton dans les coins.
  const rangees = await page.evaluate(() => new Set([...document.getElementById('cartes-stats-repas').children].map(c => c.offsetTop)).size);
  assert.equal(rangees, 1, 'cartes sur la même rangée');
  assert.ok(await page.$('#carte-stats-poids .tuile-graph'));
  assert.equal(await page.$('#cartes-stats-repas .carte-stats-cases'), null);
  assert.equal(await page.$('#carte-stats-nutrition'), null);
  assert.equal(await page.$('#cartes-stats-repas .tuile-plus'), null);

  // Poids : au centre, la carte ouvre la pesée du jour.
  await page.evaluate(() => centrerCarteRoulette('carte-stats-poids', false));
  await page.click('#carte-stats-poids');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('feuille-saisie-rapide').classList.contains('show'), saisieRapide]), [true, 'poids']);
  await page.evaluate(() => fermerFeuilles());

  // Le détail du poids est dans Progrès : 4 petits graphiques de composition, pas de bilan IA.
  await page.evaluate(() => ouvrirStats('poids'));
  // Les graphiques se dessinent 120 ms après l'ouverture (écran visible).
  await page.waitForFunction(() => compoChartsInstances.length > 0);
  let r = await page.evaluate(() => ({
    ecran: ecranActif, onglet: categorieStatsActive(),
    cases: document.querySelectorAll('#compo-grille .compo-case').length,
    vides: document.querySelectorAll('#compo-grille .compo-case--vide').length,
    graphiques: compoChartsInstances.length,
    bilanDansResume: !!document.querySelector('#ecran-stats .stats-tab[data-tab="resume"] .stats-bilan'),
    ongletsVisibles: document.getElementById('stats-onglets-nav').offsetHeight > 0
  }));
  assert.equal(r.ecran, 'stats');
  assert.deepEqual([r.onglet, r.cases, r.vides, r.graphiques, r.bilanDansResume, r.ongletsVisibles], ['poids', 2, 0, 2, true, true]);
  await page.click('#onglet-repas');
  assert.equal(await page.evaluate(() => ecranActif), 'repas');

  // Nutrition : Progrès › Repas (le bilan IA de la période est dans le Résumé).
  await page.evaluate(() => ouvrirStats('nutrition'));
  r = await page.evaluate(() => ({ ecran: ecranActif, onglet: categorieStatsActive(), bilans: document.querySelectorAll('#ecran-stats .stats-bilan').length }));
  assert.deepEqual(r, { ecran: 'stats', onglet: 'nutrition', bilans: 1 });
  await page.evaluate(() => choisirPeriodeStats('perso'));
  await page.click('#onglet-repas');

  // Cardio : plus de carte en doublon, le bandeau de la semaine ouvre Progrès.
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('cardio'); });
  assert.equal(await page.$('#carte-stats-cardio'), null);
  await page.click('#seance-cardio .hx--cardio');
  assert.equal(await page.evaluate(() => ecranActif), 'stats');

  // Muscu : idem, depuis le bandeau « Ta semaine » d'Activité › Musculation.
  await page.click('#onglet-seance');
  await page.evaluate(() => choisirModeSeance('muscu'));
  assert.equal(await page.$('#carte-stats-muscu-carte'), null);
  assert.match(await page.textContent('#vitrine-muscu .hx-unite'), /1 séance/);
  // Le corps, au centre, pivote : on touche la carte à gauche, sur ses textes.
  await page.click('#vitrine-muscu .hx', { position: { x: 40, y: 40 } });
  r = await page.evaluate(() => ({ ecran: ecranActif, onglet: categorieStatsActive(), grille: !!document.getElementById('pg-grille-muscu').offsetHeight }));
  assert.deepEqual(r, { ecran: 'stats', onglet: 'muscu', grille: true });
  // Plus de bouton « Retour » : la barre d'onglets suffit (seule la période est en haut).
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#ecran-stats .stats-entete button')].some(b => /retour/i.test(b.textContent))), false);
}));

test('après le questionnaire : « Par où commencer ? » puis la carte « Premiers pas »', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById('onb-age').value = 30;
    document.getElementById('onb-taille').value = 180;
    document.getElementById('onb-poids').value = 80;
    Object.assign(onbReponses, { gender: 'm', goal: 'maintien', pasHabituels: 6000 });
    onbTerminer();
  });
  await page.waitForSelector('#modal-interets.show');
  await page.click('#modal-interets .interet[data-interet="nutrition"]');
  await page.click('#modal-interets .interet[data-interet="cardio"]');
  await page.click('#btn-interets-ok');
  // Seule la musculation reste choisie : on démarre sur l'écran Activité.
  assert.deepEqual(await page.evaluate(() => [userProfile.premiersPas.interets, ecranActif, modeSeance]), [['muscu'], 'seance', 'muscu']);
  // Nouveau compte : les astuces démarrent, avec la première de l'écran.
  await page.waitForSelector('#astuce[data-astuce="seance-mode"]', { timeout: 5000 });
  assert.equal(await page.evaluate(() => userProfile.astucesActives), true);
  await page.evaluate(() => allerA('repas'));
  assert.match(await page.textContent('#premiers-pas'), /1\/2/);
  // L'étape se coche toute seule une fois faite
  await page.evaluate(() => { musculationProgrammes.push({ id: 'p1', nom: 'Test', exercices: [] }); renderPremiersPas(); });
  assert.match(await page.textContent('#premiers-pas'), /Bravo/);
  await page.click('.pp-masquer');
  assert.equal(await page.evaluate(() => document.getElementById('premiers-pas').innerHTML), '');
}));

// Lit l'astuce affichée : son identifiant, son texte, et si elle est bien
// posée juste au-dessus de l'élément qu'elle explique (sans le cacher, et
// sans rien entre les deux).
const lireAstuce = page => page.evaluate(() => {
  const d = document.getElementById('astuce');
  if (!d) return null;
  const a = ASTUCES.find(x => x.id === d.dataset.astuce), lieu = document.querySelector(a.avant || a.flottante);
  const r = d.getBoundingClientRect(), l = lieu.getBoundingClientRect();
  let pointe = true;
  if (a.flottante) { const x = r.left + parseFloat(d.style.getPropertyValue('--pointe-x')); pointe = x >= l.left && x <= l.right; }
  return { id: a.id, titre: d.querySelector('b').textContent, rang: d.querySelector('.astuce-pied span').textContent,
    posee: (a.flottante ? d.parentNode === document.body : d.nextElementSibling === lieu) && r.bottom <= l.top + 1 && l.top - r.bottom < 40 && pointe };
});

test("astuces : la première fois sur un écran, une carte juste au-dessus de l'élément ; « Compris » passe à la suivante, la croix les masque", () => avecAppli({}, async ({ page }) => {
  // Compte déjà en place, astuces jamais activées : rien ne s'affiche.
  await page.evaluate(() => allerA('repas'));
  assert.equal(await lireAstuce(page), null);
  await page.evaluate(() => { userProfile.astucesVues = []; userProfile.astucesActives = true; allerA('repas'); });
  assert.deepEqual(await lireAstuce(page), { id: 'repas-semaine', titre: 'Ta semaine', rang: 'Astuce 1 sur 4', posee: true });
  // Rien ne s'assombrit ni ne bloque : pas de couche ouverte, l'écran reste utilisable.
  assert.equal(await page.evaluate(() => document.body.classList.contains('couche-ouverte')), false);
  await page.click('#astuce .astuce-ok');
  assert.deepEqual(await lireAstuce(page), { id: 'repas-bilan', titre: 'Bilan de la journée', rang: 'Astuce 2 sur 4', posee: true });
  // La croix masque toutes celles de l'écran, et seulement celles-là.
  await page.click('#astuce .astuce-fermer');
  assert.deepEqual(await page.evaluate(() => [!!document.getElementById('astuce'), userProfile.astucesVues.slice().sort(), userProfile.astucesActives]),
    [false, ['repas-bilan', 'repas-plus', 'repas-semaine', 'repas-stats'], true]);
  // Gardées dans le profil (synchronisé) : jamais remontrées.
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(PROFILE_KEY)).astucesVues.length), 4);
  await page.evaluate(() => { allerA('stats'); allerA('repas'); });
  assert.equal(await lireAstuce(page), null);
  // Écran suivant : la sienne, seule de l'écran.
  await page.evaluate(() => allerA('stats'));
  assert.deepEqual(await lireAstuce(page), { id: 'stats-onglets', titre: 'Tes progrès', rang: 'Astuce', posee: true });
  await page.click('#astuce .astuce-ok');
  assert.equal(await lireAstuce(page), null);
  // Une feuille ouverte la retient ; elle apparaît quand la feuille se ferme.
  await page.evaluate(() => { ouvrirFeuilleRepas(); allerA('reglages'); });
  assert.equal(await lireAstuce(page), null);
  await page.evaluate(() => fermerFeuilles());
  assert.deepEqual(await lireAstuce(page), { id: 'profil-reglages', titre: 'Tes réglages', rang: 'Astuce 1 sur 2', posee: true });
  // Vitrine redessinée (changement de thème) : l'astuce est reposée aussitôt.
  await page.click('#astuce .astuce-ok');
  await page.evaluate(() => choisirTheme('dark'));
  assert.deepEqual(await lireAstuce(page), { id: 'profil-objectif', titre: 'Ton objectif', rang: 'Astuce 2 sur 2', posee: true });
}));

test("astuces : avec la barre d'onglets d'iOS (app iPhone), celle du + flotte au-dessus de la barre, pointe vers le rond de droite", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    ONGLETS_NATIFS = true; document.documentElement.classList.add('onglets-natifs');
    userProfile.astucesActives = true; userProfile.astucesVues = ['repas-semaine', 'repas-bilan', 'repas-stats']; allerA('repas');
    const d = document.getElementById('astuce'), c = d.getBoundingClientRect();
    return { id: d.dataset.astuce, flottante: d.parentNode === document.body, bas: Math.round(innerHeight - c.bottom), pointe: parseFloat(d.style.getPropertyValue('--pointe-x')) / c.width };
  });
  assert.deepEqual([r.id, r.flottante], ['repas-plus', true]);
  assert.ok(r.bas >= 14 && r.bas < 60, 'au-dessus de la barre : ' + r.bas);
  assert.ok(r.pointe > 0.85, 'pointe à droite : ' + r.pointe);
}));

test("astuces : chacune trouve sa place, dans l'ordre, séance en cours comprise ; toutes vues, elles se coupent ; Réglages les relance", () => avecAppli({}, async ({ page }) => {
  const vues = [], malPosees = [], rangs = [];
  // Lit l'astuce affichée et touche « Compris », jusqu'à ce qu'il n'y en ait plus.
  const suivre = async () => {
    for (let i = 0; i < 8; i++) {
      const a = await lireAstuce(page);
      if (!a) return;
      vues.push(a.id); rangs.push(a.rang);
      if (!a.posee) malPosees.push(a.id);
      await page.click('#astuce .astuce-ok');
    }
  };
  await page.evaluate(() => { userProfile.astucesVues = []; userProfile.astucesActives = true; allerA('repas'); });
  await suivre();
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('muscu', true); });
  await suivre();
  // Séance libre, encore vide : « Tes séries » attend le premier exercice.
  await page.evaluate(() => demarrerSeanceLibre());
  assert.equal((await lireAstuce(page)).id, 'session-volume');
  await page.click('#astuce .astuce-ok');
  assert.equal((await lireAstuce(page)).id, 'session-terminer');
  vues.push('session-volume'); rangs.push('Astuce 1 sur 4');
  await page.evaluate(() => ajouterExerciceASession(toutesLesExercices().find(x => x.nom === 'Développé couché avec barre').id));
  await suivre();
  await page.evaluate(() => { musculationSessionActive = null; sauvegarderSessionActive(); renderSeance(); allerA('stats'); });
  await suivre();
  await page.evaluate(() => allerA('reglages'));
  await suivre();
  assert.deepEqual(vues, await page.evaluate(() => astucesApplicables().map(a => a.id)));
  assert.deepEqual(malPosees, []);
  // Le compte est celui de la partie de l'écran : Activité (3 sans IA), puis la séance en cours (4).
  assert.deepEqual(rangs, ['Astuce 1 sur 4', 'Astuce 2 sur 4', 'Astuce 3 sur 4', 'Astuce 4 sur 4', 'Astuce 1 sur 3', 'Astuce 2 sur 3', 'Astuce 3 sur 3',
    'Astuce 1 sur 4', 'Astuce 2 sur 4', 'Astuce 3 sur 4', 'Astuce 4 sur 4', 'Astuce', 'Astuce 1 sur 2', 'Astuce 2 sur 2']);
  // Toutes vues : elles se coupent.
  assert.deepEqual(await page.evaluate(() => { allerA('repas'); return [userProfile.astucesActives, userProfile.tutorielVu, !!document.getElementById('astuce')]; }), [false, true, false]);
  // Réglages › Aide : celles de la musculation seulement…
  await page.evaluate(() => { allerA('reglages'); document.getElementById('btn-visite-muscu').click(); });
  assert.deepEqual(await page.evaluate(() => [ecranActif, modeSeance, userProfile.astucesActives,
    ASTUCES.filter(a => !userProfile.astucesVues.includes(a.id)).every(a => a.groupe === 'muscu')]), ['seance', 'muscu', true, true]);
  assert.equal((await lireAstuce(page)).id, 'seance-mode');
  // … ou toutes.
  await page.evaluate(() => { allerA('reglages'); document.getElementById('btn-revoir-tutoriel').click(); });
  assert.deepEqual(await page.evaluate(() => [ecranActif, userProfile.astucesVues.length]), ['repas', 0]);
  assert.equal((await lireAstuce(page)).id, 'repas-semaine');
}));

test('Administration : les comptes en liste (pseudo, état, recherche, filtres), puis la page d\'un compte', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page, () => Object.assign({ 'rpc:admin_liste_comptes': [
      { utilisateur: 'admin', email: 'moi@x.fr', maj: Date.now(), nb_journees: 40 },
      { utilisateur: 'a1', email: 'alice@x.fr', maj: Date.now() - 1000, nb_journees: 12, cree_le: new Date(Date.now() - 90 * 864e5).toISOString(), derniere_connexion: new Date().toISOString() },
      { utilisateur: 'b2', email: 'bob@x.fr', maj: Date.now() - 2000, statut: 'suspendu' },
      { utilisateur: 'c3', email: 'carl@x.fr', maj: Date.now() - 40 * 864e5 }],
    'table:pseudos': [{ utilisateur: 'a1', pseudo: 'alice.fit' }, { utilisateur: 'b2', pseudo: 'bob' }],
    'table:withings_jetons:compte': { __erreur: { code: '42501', message: 'permission denied for table withings_jetons' } } }, { 'rpc:admin_compte_details': {
    appareils: [{ appareil: 'x', plateforme: 'iPhone · app Askēsis', version: VERSION_APPLI, synchro_le: new Date().toISOString(), en_attente: 0 },
      { appareil: 'y', plateforme: 'Mac · Safari', version: '2026-01-01', synchro_le: new Date(Date.now() - 6 * 864e5).toISOString(), en_attente: 2 }],
    erreurs_7j: 3, erreur: 'délai dépassé', gymbros: 4, signale: 1, ia_mois: 2 } }));
  const r = await page.evaluate(async () => {
    allerA('admin');
    await chargerAdmin();
    const lignes = () => [...document.querySelectorAll('#admin-liste-comptes .adm-compte')].map(b => [b.querySelector('b').textContent, b.querySelector('small').textContent, (b.querySelector('.adm-chip, .adm-droite') || {}).textContent]);
    const res = { toutes: lignes() };
    document.getElementById('admin-recherche').value = '@alice';
    rafraichirListeComptes();
    res.recherche = lignes();
    document.getElementById('admin-recherche').value = '';
    filtrerParStatut('suspendu');
    res.suspendus = lignes();
    filtrerParStatut('tous');
    document.querySelector('#admin-liste-comptes [data-compte="a1"]').click();
    await new Promise(ok => setTimeout(ok, 50));
    const texte = id => document.getElementById(id).textContent;
    res.page = { vue: adminVue, accueilCache: document.getElementById('admin-vue-accueil').classList.contains('hidden'), nom: texte('admin-compte-nom'), email: texte('admin-compte-email'),
      chips: texte('admin-compte-chips'), faits: [...document.querySelectorAll('#admin-compte-faits > div')].map(d => d.textContent),
      appareils: [...document.querySelectorAll('#admin-compte-diagnostic .ligne-reglage')].map(d => [d.querySelector('b').textContent, d.querySelector('small').textContent, (d.querySelector('.adm-etat, .adm-nb') || {}).textContent]),
      sensible: !document.getElementById('admin-zone-sensible').classList.contains('hidden') };
    ouvrirCompteAdmin('admin');
    res.moiSensible = !document.getElementById('admin-zone-sensible').classList.contains('hidden');
    afficherVueAdmin('accueil');
    return res;
  });
  assert.deepEqual(r.toutes, [['moi@x.fr', 'Ton compte', 'Toi'], ['@alice.fit', 'alice@x.fr', "à l'instant"], ['@bob', 'bob@x.fr', 'Suspendu'], ['carl@x.fr', 'Sans nom d’utilisateur', 'Inactif']]);
  assert.deepEqual(r.recherche, [['@alice.fit', 'alice@x.fr', "à l'instant"]]);
  assert.deepEqual(r.suspendus, [['@bob', 'bob@x.fr', 'Suspendu']]);
  assert.deepEqual([r.page.vue, r.page.accueilCache, r.page.nom, r.page.email, r.page.chips], ['compte', true, '@alice.fit', 'alice@x.fr', 'Actif']);
  assert.deepEqual(r.page.faits, ['Inscritil y a 3 mois', "Connexionà l'instant", 'Journées12', 'Gymbros4', 'Signalé1 fois', 'IA ce mois2 essais']);
  assert.equal(r.page.appareils[0][0], 'iPhone · app Askēsis');
  assert.match(r.page.appareils[0][1], /^Version du \d{1,2} \S+ · synchro à l'instant$/);
  assert.equal(r.page.appareils[0][2], 'À jour');
  assert.deepEqual(r.page.appareils[1], ['Mac · Safari', 'Version du 1 janv. · synchro il y a 6 j · 2 journées pas envoyées', 'Ancienne']);
  assert.deepEqual(r.page.appareils[2], ['Erreurs sur 7 jours', 'délai dépassé', '3']);
  assert.equal(r.page.sensible, true);
  assert.equal(r.moiSensible, false, 'pas de zone sensible sur son propre compte');
}));

test('Administration : « À surveiller » (tableau, signalements, erreurs, serveur) et la pastille des signalements', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page, () => Object.assign({ 'rpc:admin_liste_comptes': [
      { utilisateur: 'admin', email: 'moi@x.fr', maj: Date.now(), nb_journees: 40 },
      { utilisateur: 'a1', email: 'alice@x.fr', maj: Date.now() - 1000, nb_journees: 12, cree_le: new Date(Date.now() - 90 * 864e5).toISOString(), derniere_connexion: new Date().toISOString() },
      { utilisateur: 'b2', email: 'bob@x.fr', maj: Date.now() - 2000, statut: 'suspendu' },
      { utilisateur: 'c3', email: 'carl@x.fr', maj: Date.now() - 40 * 864e5 }],
    'table:pseudos': [{ utilisateur: 'a1', pseudo: 'alice.fit' }, { utilisateur: 'b2', pseudo: 'bob' }],
    'table:withings_jetons:compte': { __erreur: { code: '42501', message: 'permission denied for table withings_jetons' } } }, {
    'rpc:admin_tableau_de_bord': { comptes: 4, actifs_jour: 3, actifs_7j: 4, par_jour: [], en_seance: [{ pseudo: 'alice.fit' }] },
    'rpc:admin_signalements': q => q.args.p_traites ? [] : [{ id: 1, cible: 'a1', cible_pseudo: 'alice.fit', motif: 'Pub ou spam', cree_le: new Date().toISOString() }, { id: 2, cible: 'a1', cible_pseudo: 'alice.fit', cree_le: new Date().toISOString() }],
    'table:erreurs_appli:compte': 5,
    'table:abonnements:compte': { __404vide: true },
    'rpc:admin_apercu': { __erreur: { code: 'PGRST202', message: 'Could not find the function public.admin_apercu' } },
  }));
  const r = await page.evaluate(async () => {
    allerA('admin');
    await chargerAdmin();
    await chargerVeilleAdmin(true);
    const tuile = c => [document.getElementById('adm-v-' + c).textContent, document.getElementById('adm-s-' + c).textContent, document.getElementById('adm-t-' + c).className];
    return { tableau: tuile('tableau'), signal: tuile('signal'), erreurs: tuile('erreurs'), serveur: tuile('serveur'),
      pastille: document.querySelector('#nav-admin > .pastille-gymbro')?.textContent || null,
      alice: document.querySelector('#admin-liste-comptes [data-compte="a1"] .adm-chip').textContent };
  });
  assert.deepEqual(r.tableau, ['3', 'actifs aujourd’hui', '']);
  assert.deepEqual(r.signal, ['2', 'à traiter sous 24 h', 'alerte']);
  assert.deepEqual(r.erreurs, ['5', 'à regarder, sur 7 jours', '']);
  assert.deepEqual(r.serveur, ['1', 'point à régler', 'attention']);
  assert.equal(r.pastille, '2');
  assert.equal(r.alice, 'Signalé ×2');
}));

test('Administration : Serveur et SQL sonde chaque SQL sans rien modifier, signale le manquant et donne son SQL', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page, () => ({ 'table:erreurs_appli:compte': { __404vide: true }, 'table:withings_jetons:compte': { __erreur: { code: '42501', message: 'permission denied for table withings_jetons' } } }));
  const r = await page.evaluate(async () => {
    window.__appels = [];
    ouvrirServeurAdmin();
    await verifierServeurAdmin(true);
    await compterErreursAdmin();
    const tuileErreurs = [document.getElementById('adm-v-erreurs').textContent, document.getElementById('adm-s-erreurs').textContent];
    const lignes = [...document.querySelectorAll('#feuille-admin-serveur .adm-sql')].map(d => [d.dataset.sql, d.querySelector('[data-etat-sql]').textContent]);
    const admin = document.querySelector('.adm-sql[data-sql="admin"] .ligne-reglage');
    admin.click();
    return { lignes, bilan: [document.querySelector('#serveur-bilan b').textContent, document.querySelector('#serveur-bilan small').textContent],
      ouvert: admin.getAttribute('aria-expanded'), sql: document.getElementById('bloc-sql-admin').textContent, tuileErreurs,
      ecritures: window.__appels.filter(a => a[0] === 'from' && a[2] !== 'select').length,
      rpc: [...new Set(window.__appels.filter(a => a[0] === 'rpc').map(a => a[1]))].sort() };
  });
  assert.deepEqual(r.lignes, [['supabase', 'OK'], ['rls', 'OK'], ['accents', 'OK'], ['gymbro', 'OK'], ['pro', 'OK'], ['appstore', 'OK'], ['direct', 'OK'], ['admin', 'Manquant'], ['saison', 'OK'], ['withings', 'OK']]);
  assert.equal(r.bilan[0], '1 point à régler');
  assert.match(r.bilan[1], /^Vérifié à l'instant · Supabase répond en \d+ ms$/);
  assert.equal(r.ouvert, 'true');
  assert.match(r.sql, /create table if not exists public\.erreurs_appli/);
  assert.match(r.sql, /public\.est_admin\(\)/);
  assert.doesNotMatch(r.sql, /jambou592/, "l'administration ne dépend plus d'une adresse");
  assert.equal(r.ecritures, 0, 'le bilan ne modifie rien');
  assert.deepEqual(r.rpc, ['admin_regles_ouvertes', 'admin_signalements', 'gymbro_direct', 'gymbro_saisons', 'mes_defis']);
  assert.deepEqual(r.tuileErreurs, ['—', 'SQL « Administration » à passer'], 'table absente : pas « 0 erreur »');
}));

test("Administration : une règle d'accès ouverte à tous sur les tables de données est signalée en rouge, et le script 1 n'en crée plus", () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page, () => ({ 'rpc:admin_regles_ouvertes': 2, 'table:withings_jetons:compte': { __erreur: { code: '42501', message: 'permission denied for table withings_jetons' } } }));
  const r = await page.evaluate(async () => {
    ouvrirServeurAdmin();
    await verifierServeurAdmin(true);
    const rls = document.querySelector('.adm-sql[data-sql="rls"]');
    return { etat: rls.querySelector('[data-etat-sql]').textContent, rouge: rls.classList.contains('adm-sql--ko'), bilan: document.querySelector('#serveur-bilan b').textContent,
      script1: SQL_SUPABASE, script2: SQL_RLS };
  });
  assert.equal(r.etat, 'Accès ouvert à tous');
  assert.equal(r.rouge, true);
  assert.equal(r.bilan, '1 point à régler');
  assert.ok(!/using \(true\)/.test(r.script1), 'le script 1 ne crée plus de règle ouverte');
  assert.match(r.script1, /drop policy if exists "acces journees" on journees;/);
  assert.match(r.script2, /create or replace function public\.admin_regles_ouvertes\(\)/);
}));

test("balance Withings (lot 6) : l'appli ne détient aucun jeton — état, connexion avec « state », pesées et déconnexion passent par la fonction serveur ; un ancien jeton local est repris par le serveur puis effacé ; une table de jetons lisible est signalée", () => avecAppli({}, async ({ page, dialogues }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    let connecte = false;
    supa = { functions: { invoke: async (nom, o) => {
      appels.push([nom, JSON.parse(JSON.stringify(o.body))]);
      const a = o.body.action;
      if (a === 'etat') return { data: { connecte }, error: null };
      if (a === 'importer' || a === 'connecter') { connecte = true; return { data: { connecte: true }, error: null }; }
      if (a === 'deconnecter') { connecte = false; return { data: { connecte: false }, error: null }; }
      if (a === 'mesures') return { data: { status: 0, body: { measuregrps: [{ date: 1762560000, measures: [{ type: 1, value: 80400, unit: -3 }, { type: 6, value: 221, unit: -1 }] }] } }, error: null };
      return { data: null, error: { context: { status: 400, json: async () => ({ erreur: 'Action inconnue.' }) } } };
    } } };
    sessionUtilisateur = { id: 'u-1', email: 'moi@test.fr' };
    const res = {};
    // Un jeton gardé par une ancienne version (profil et appareil) : repris par le serveur, puis plus nulle part ici.
    const ancien = { access_token: 'acc-ancien', refresh_token: 'ref-ancien', expire_le: Date.now() + 1000, userid: 42 };
    localStorage.setItem(WITHINGS_TOKEN_LS, JSON.stringify(ancien));
    userProfile.withings = Object.assign({}, ancien);
    await rafraichirEtatWithings();
    res.importe = appels.filter(a => a[1].action === 'importer').map(a => [a[1].access_token, a[1].refresh_token, a[1].userid]);
    res.localApres = [localStorage.getItem(WITHINGS_TOKEN_LS), 'withings' in userProfile, 'withings' in JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')];
    res.reliee = [etatWithings.connecte, !document.getElementById('withings-connecte-reglages').classList.contains('hidden'), document.getElementById('withings-deconnecte').classList.contains('hidden')];
    // Pesées : lues par le serveur, pré-remplies dans Mesures (poids et masse grasse de cette pesée).
    await importerPoidsWithings();
    res.mesures = [document.getElementById('mes-poids').value, document.getElementById('mes-grasse-pct').value, document.getElementById('mes-muscle-kg').value, document.getElementById('note-import-withings').textContent];
    // Déconnexion : le serveur oublie, l'appli repasse sur « Connecter ».
    await deconnexionWithings();
    res.deconnecte = [etatWithings.connecte, !document.getElementById('withings-deconnecte-reglages').classList.contains('hidden')];
    // Connexion : le lien part avec un « state » gardé sur l'appareil.
    const lien = document.querySelector('#withings-deconnecte-reglages a');
    const suivi = connexionWithings({ currentTarget: lien, preventDefault() { res.empeche = true; } });
    const u = new URL(lien.href);
    const state = u.searchParams.get('state');
    res.lien = [suivi, u.origin + u.pathname, u.searchParams.get('client_id') === WITHINGS_CLIENT_ID, u.searchParams.get('redirect_uri'), (state || '').length, JSON.parse(localStorage.getItem(WITHINGS_STATE_LS)).state === state];
    // Retour avec un mauvais « state » : rien n'est envoyé, l'URL est nettoyée.
    const avant = appels.length;
    history.replaceState({}, '', location.pathname + '?code=CODE-1&state=pirate');
    await traiterRetourWithings();
    res.mauvaisState = [appels.length - avant, etatWithings.connecte, location.search, localStorage.getItem(WITHINGS_STATE_LS)];
    // Le bon « state » : le code part seul (ni URL de retour, ni jeton), la balance est reliée.
    connexionWithings({ currentTarget: lien, preventDefault() {} });
    const bon = JSON.parse(localStorage.getItem(WITHINGS_STATE_LS)).state;
    history.replaceState({}, '', location.pathname + '?code=CODE-2&state=' + bon);
    await traiterRetourWithings();
    const connecter = appels.filter(a => a[1].action === 'connecter');
    res.connecter = [connecter.length, connecter[0] && connecter[0][1], etatWithings.connecte, location.search, localStorage.getItem(WITHINGS_STATE_LS)];
    res.actions = appels.map(a => a[0] + ':' + a[1].action);
    res.jetonSorti = JSON.stringify(appels.filter(a => a[1].action !== 'importer')).includes('acc-ancien');
    res.appliSansJeton = !/wbsapi\.withings\.net|withingsAccessTokenValide|enregistrerTokenWithings/.test(document.documentElement.outerHTML.slice(0, 0) + [...document.scripts].map(x => x.textContent).join(''));
    // Déconnecté du compte : plus d'état.
    definirSessionUtilisateur(null);
    res.sansCompte = [etatWithings.connecte, !document.getElementById('withings-deconnecte-reglages').classList.contains('hidden')];
    return res;
  });
  assert.deepEqual(r.importe, [['acc-ancien', 'ref-ancien', 42]], "l'ancien jeton part une fois au serveur");
  assert.deepEqual(r.localApres, [null, false, false], 'plus de jeton sur l\'appareil ni dans le profil');
  assert.deepEqual(r.reliee, [true, true, true], 'reliée : « Déconnecter » dans Réglages, bouton d\'import dans Mesures');
  assert.deepEqual(r.mesures.slice(0, 3), ['80.4', '22.1', '']);
  assert.match(r.mesures[3], /^Pesée du .* importée \(Poids, Masse grasse\) — vérifie puis enregistre\.$/);
  assert.deepEqual(r.deconnecte, [false, true]);
  assert.equal(r.empeche, undefined, 'la navigation vers Withings suit son cours');
  assert.deepEqual(r.lien, [true, 'https://account.withings.com/oauth2_user/authorize2', true, 'https://boulidjamal-lang.github.io/mon-coach/', 32, true]);
  assert.deepEqual(r.mauvaisState, [0, false, '', null], 'un code avec un autre « state » est ignoré');
  assert.deepEqual(r.connecter, [1, { action: 'connecter', code: 'CODE-2' }, true, '', null]);
  assert.deepEqual(r.actions, ['withings:importer', 'withings:etat', 'withings:mesures', 'withings:deconnecter', 'withings:connecter']);
  assert.equal(r.jetonSorti, false, 'aucun jeton ne circule hors de la reprise');
  assert.equal(r.appliSansJeton, true, "l'appli n'appelle plus Withings directement");
  assert.deepEqual(r.sansCompte, [false, true]);
  assert.ok(dialogues.some(d => /Balance Withings connectée/.test(d)), dialogues.join(' | '));
  assert.ok(dialogues.some(d => /ignorée/.test(d)));
  // Table lisible par l'administrateur = protection absente : signalée en rouge.
  await installerFauxAdmin(page, () => ({ 'table:withings_jetons:compte': 0 }));
  const s = await page.evaluate(async () => {
    ouvrirServeurAdmin();
    await verifierServeurAdmin(true);
    const w = document.querySelector('.adm-sql[data-sql="withings"]');
    return { etat: w.querySelector('[data-etat-sql]').textContent, rouge: w.classList.contains('adm-sql--ko'), sql: SQL_WITHINGS };
  });
  assert.deepEqual([s.etat, s.rouge], ['Accès ouvert à tous', true]);
  assert.match(s.sql, /revoke all on table public\.withings_jetons from public, anon, authenticated;/);
  assert.match(s.sql, /create trigger profil_sans_jetons before insert or update on public\.profil/);
}));

test("administration par identifiant (lot 8) : le serveur dit qui est administrateur (table admins), l'e-mail n'est plus qu'un repli, et tout le SQL passe par est_admin()", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const res = {};
    let reponse = true;
    supa = { rpc: async nom => ({ data: nom === 'est_admin' ? reponse : null, error: null }) };
    // Un compte quelconque, reconnu administrateur par le serveur : l'écran Administration s'ouvre.
    sessionUtilisateur = { id: 'u-9', email: 'quelqu.un@exemple.fr' };
    majUICompte();
    res.avant = [estCompteAdmin(), document.getElementById('nav-admin').classList.contains('hidden')];
    await verifierAdminServeur();
    res.apres = [estCompteAdmin(), document.getElementById('nav-admin').classList.contains('hidden')];
    // Le serveur dit non : l'écran se referme.
    reponse = false;
    await verifierAdminServeur();
    res.retire = [estCompteAdmin(), document.getElementById('nav-admin').classList.contains('hidden')];
    // L'adresse historique reste un repli le temps de la transition.
    sessionUtilisateur = { id: 'u-adm', email: ADMIN_EMAIL };
    res.repli = estCompteAdmin();
    // Tout le SQL passe par est_admin() ; plus aucune règle ne compare l'e-mail.
    const scripts = [SQL_SUPABASE, SQL_RLS, sqlAccents(), SQL_GYMBRO_PHOTOS, SQL_PRO, SQL_APP_STORE, SQL_GYMBRO_DIRECT, SQL_ADMIN, SQL_SAISON, SQL_WITHINGS].join('\n');
    res.sql = {
      table: /create table if not exists public\.admins \(/.test(SQL_RLS),
      fonction: /create or replace function public\.est_admin\(\)/.test(SQL_RLS),
      amorce: /insert into public\.admins \(utilisateur, note\)\s*select id, 'administrateur initial' from auth\.users where email = 'jambou592@gmail\.com'/.test(SQL_RLS),
      comparaisons: (scripts.match(/auth\.jwt\(\) ->> 'email'/g) || []).length,
      estAdmin: (scripts.match(/public\.est_admin\(\)/g) || []).length,
      garde: !/if not exists \(select 1 from pg_policies where schemaname = 'public' and tablename = 'exercices_base_overrides'\)/.test(SQL_GYMBRO_PHOTOS),
    };
    return res;
  });
  assert.deepEqual(r.avant, [false, true]);
  assert.deepEqual(r.apres, [true, false], 'reconnu par le serveur');
  assert.deepEqual(r.retire, [false, true]);
  assert.equal(r.repli, true);
  assert.deepEqual([r.sql.table, r.sql.fonction, r.sql.amorce, r.sql.garde], [true, true, true, true]);
  // Les seules lectures de l'e-mail qui restent : le repli dans est_admin() et l'auteur noté dans le journal (admin_consigner, journaliser_utilisateur).
  assert.equal(r.sql.comparaisons, 3, 'auth.jwt() ->> email : repli, admin_consigner, journaliser_utilisateur');
  assert.ok(r.sql.estAdmin >= 40, 'est_admin() partout : ' + r.sql.estAdmin);
}));

test("stockage local (lot 12) : les données vivent dans IndexedDB et localStorage n'en est qu'une copie — un stockage plein n'empêche plus d'enregistrer, les données reviennent sans localStorage, un changement de compte vide tout, et celles d'une ancienne version sont reprises", () => avecAppli({}, async ({ page, dialogues }) => {
  const jour = '2026-03-04';
  const r1 = await page.evaluate(async jour => {
    const res = { idb: !!baseIDB };
    appData[jour] = { meals: { lunch: [{ name: 'Riz', kcal: 200, p: 4, c: 44, f: 1 }] }, eauMl: 500 };
    res.sauve = saveData(jour);
    await new Promise(ok => setTimeout(ok, 150));
    const blocs = await lireTousIDB(baseIDB);
    res.dansIDB = !!(blocs[STORAGE_KEY] && blocs[STORAGE_KEY][jour]);
    res.copieLocale = !!(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')[jour]);
    // localStorage plein : l'enregistrement passe quand même, sans alerte.
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new DOMException('plein', 'QuotaExceededError'); };
    appData[jour].eauMl = 750;
    res.sauvePlein = saveData(jour);
    res.sature = copieLocaleSaturee;
    localStorage.setItem = setItem;
    await new Promise(ok => setTimeout(ok, 150));
    res.eauIDB = (await lireTousIDB(baseIDB))[STORAGE_KEY][jour].eauMl;
    // Sans la copie localStorage, les données reviennent d'IndexedDB au prochain démarrage.
    localStorage.removeItem(STORAGE_KEY);
    return res;
  }, jour);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof allerA === 'function' && typeof appData === 'object' && Object.keys(appData).length > 0);
  const r2 = await page.evaluate(async jour => {
    const res = { eau: appData[jour] && appData[jour].eauMl };
    // Changement de compte : tout part, IndexedDB compris.
    viderDonneesLocales();
    await new Promise(ok => setTimeout(ok, 150));
    res.apresVidage = Object.keys(await lireTousIDB(baseIDB)).filter(k => k === STORAGE_KEY || k === PROFILE_KEY).length;
    // Une ancienne version n'avait que localStorage : repris au démarrage, puis rangé dans IndexedDB.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ '2025-12-25': { meals: { dinner: [{ name: 'Dinde', kcal: 300, p: 40, c: 0, f: 8 }] } } }));
    return res;
  }, jour);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof allerA === 'function' && typeof appData === 'object' && !!appData['2025-12-25']);
  const r3 = await page.evaluate(async () => {
    await new Promise(ok => setTimeout(ok, 150));
    const blocs = await lireTousIDB(baseIDB);
    return { repris: !!appData['2025-12-25'], dansIDB: !!(blocs[STORAGE_KEY] && blocs[STORAGE_KEY]['2025-12-25']) };
  });
  assert.deepEqual(r1, { idb: true, sauve: true, dansIDB: true, copieLocale: true, sauvePlein: true, sature: true, eauIDB: 750 });
  assert.equal(r2.eau, 750, "les données reviennent d'IndexedDB");
  assert.equal(r2.apresVidage, 0, 'plus rien dans IndexedDB après le changement de compte');
  assert.deepEqual(r3, { repris: true, dansIDB: true });
  assert.ok(!dialogues.some(d => /Impossible d'enregistrer/.test(d)), dialogues.join(' | '));
}));

test("profil fusionné (lot 12) : une pesée faite ici et une autre là-bas sont gardées toutes les deux, un champ changé d'un seul côté passe, changé des deux côtés il va au plus récent, une suppression ne revient pas", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const base = { age: 30, height: 180, poidsVise: 75, mesures: { '2026-01-01': { poids: 80 } }, alimentsFavoris: ['Riz'] };
    const local = { age: 31, height: 180, poidsVise: 75, mesures: { '2026-01-01': { poids: 80 }, '2026-01-02': { poids: 79.5 } }, alimentsFavoris: ['Riz', 'Œuf'] };
    const distant = { age: 30, height: 181, poidsVise: 74, mesures: { '2026-01-03': { poids: 79 } }, maj: 5 };
    return {
      f: fusionnerProfil(base, local, distant, true),
      g: fusionnerProfil(null, local, distant, false),
      conflitPoids: fusionnerProfil(base, Object.assign({}, local, { poidsVise: 73 }), distant, false).poidsVise,
      meme: memeProfil({ a: 1, maj: 2 }, { maj: 3, a: 1 }),
    };
  });
  assert.deepEqual(r.f, { age: 31, height: 181, poidsVise: 74, mesures: { '2026-01-02': { poids: 79.5 }, '2026-01-03': { poids: 79 } }, alimentsFavoris: ['Riz', 'Œuf'] });
  assert.deepEqual(r.g.mesures, { '2026-01-01': { poids: 80 }, '2026-01-02': { poids: 79.5 }, '2026-01-03': { poids: 79 } }, "sans base : rien n'est perdu");
  assert.deepEqual([r.g.age, r.g.height, r.g.poidsVise], [30, 181, 74], "sans base : le plus récent l'emporte sur les champs simples");
  assert.equal(r.conflitPoids, 74, 'changé des deux côtés : le plus récent');
  assert.equal(r.meme, true);
}));

test("taille de texte du système (lot 13) : la racine suit l'échelle du téléphone dans les bornes prévues, rien ne bouge là où le mot-clé n'existe pas, et le pincement pour zoomer reste permis", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const racine = document.documentElement;
    // Le harnais réduit les mouvements : toute transition dure 0,01 ms, mais elle n'avance qu'à l'image
    // suivante ; sous charge, aucune image en 40 ms. On attend donc que la valeur bouge (2 s au plus).
    const tour = () => new Promise(ok => setTimeout(ok, 40));
    const echelle = async v => {
      const avant = getComputedStyle(racine).fontSize;
      if (v == null) racine.style.removeProperty('--echelle-texte'); else racine.style.setProperty('--echelle-texte', v);
      for (let i = 0; i < 50 && getComputedStyle(racine).fontSize === avant; i++) await tour();
      await tour();
    };
    const base = parseFloat(getComputedStyle(racine).fontSize);
    const res = { supporte: CSS.supports('font', '-apple-system-body'), mesure: mesurerTailleTexteSysteme(), echelleIci: appliquerTailleTexteSysteme(), variableIci: racine.style.getPropertyValue('--echelle-texte') };
    // Ce qu'un iPhone réglé « plus grand » donnerait : la racine suit, bornée.
    await echelle('1.3');
    res.agrandi = Math.round(parseFloat(getComputedStyle(racine).fontSize) / base * 100) / 100;
    await echelle('0.85');
    res.reduit = Math.round(parseFloat(getComputedStyle(racine).fontSize) / base * 100) / 100;
    await echelle(null);
    res.retour = parseFloat(getComputedStyle(racine).fontSize) === base;
    res.bornes = [ECHELLE_TEXTE_MIN, ECHELLE_TEXTE_MAX];
    const viewport = document.querySelector('meta[name="viewport"]').content;
    res.zoom = [!/user-scalable\s*=\s*no/.test(viewport), !/maximum-scale/.test(viewport), getComputedStyle(document.documentElement).touchAction];
    return res;
  });
  // Chromium ne connaît pas -apple-system-body : rien n'est appliqué (ni ici, ni sur Android).
  assert.deepEqual([r.supporte, r.mesure, r.echelleIci, r.variableIci], [false, null, 1, '']);
  assert.deepEqual([r.agrandi, r.reduit, r.retour, r.bornes], [1.3, 0.85, true, [0.85, 1.35]]);
  assert.deepEqual(r.zoom, [true, true, 'manipulation'], 'pincement permis, double appui seul retiré');
}));

test("fibres, sucres, sel et AGS (lot 15) : comptés quand les aliments les portent, avec les repères du jour et le nombre d'aliments renseignés ; une étiquette les remplit d'elle-même, la saisie les garde", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const res = {};
    const jour = todayStr();
    const d = getDay(jour);
    d.meals.lunch = [{ name: 'Lentilles', grams: 200, kcal: 230, p: 18, c: 32, f: 1, fib: 15.6, suc: 1.2, sel: 0.02, ags: 0.1 }, { name: 'Pain', grams: 60, kcal: 160, p: 5, c: 30, f: 1 }];
    d.meals.dinner = [{ name: 'Charcuterie', grams: 100, kcal: 300, p: 20, c: 1, f: 24, fib: 0, suc: 0.5, sel: 5.4, ags: 9 }];
    const totaux = sumMeals(d);
    res.totaux = [totaux.fib, totaux.suc, totaux.sel, totaux.ags, totaux.renseignes, totaux.aliments, totaux.kcal];
    updateSummary(d);
    const el = document.getElementById('detail-nutri');
    res.affiche = [!el.classList.contains('hidden'), [...el.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' | '), el.querySelector('.depasse') && el.querySelector('.depasse').textContent.replace(/\s+/g, ' ').trim()];
    res.reperes = reperesDetailsNutri(2000);
    // Sans détail : la ligne disparaît.
    d.meals.lunch = [{ name: 'Pain', grams: 60, kcal: 160, p: 5, c: 30, f: 1 }]; d.meals.dinner = [];
    updateSummary(d);
    res.cache = el.classList.contains('hidden');
    // Une étiquette OpenFoodFacts remplit les détails, la saisie les garde à la quantité près (sodium → sel × 2,5).
    activeMealId = 'lunch';
    fillFromOFF({ name: 'Yaourt nature', source: 'off', nutriments: { 'energy-kcal_100g': 60, 'proteins_100g': 4, 'carbohydrates_100g': 5, 'fat_100g': 3, 'fiber_100g': 0, 'sugars_100g': 4.8, 'sodium_100g': 0.04, 'saturated-fat_100g': 2 } });
    res.champs = ['man-fib100', 'man-suc100', 'man-sel100', 'man-ags100'].map(id => document.getElementById(id).value);
    document.getElementById('man-grams').value = '150';
    await validerAjoutManuel();
    const ajoute = getDay(currentDate).meals.lunch.slice(-1)[0];
    res.ajoute = [ajoute.name, ajoute.fib, ajoute.suc, ajoute.sel, ajoute.ags, Math.round(ajoute.kcal)];
    // La table d'aliments : ses colonnes de détails, quand elle en a (le sodium en mg devient du sel).
    res.ligne = detailsNutriDeLigne({ fib: 'Fibres alimentaires (g/100 g)', suc: 'Sucres (g/100 g)', sodium: 'Sodium (mg/100 g)', ags: 'AG saturés (g/100 g)' },
      { 'Fibres alimentaires (g/100 g)': '2,5', 'Sucres (g/100 g)': '-', 'Sodium (mg/100 g)': '400', 'AG saturés (g/100 g)': '1.1' });
    return res;
  });
  assert.deepEqual(r.totaux, [15.6, 1.7, 5.42, 9.1, 2, 3, 690]);
  assert.equal(r.affiche[0], true);
  assert.match(r.affiche[1], /^Fibres 15,6 g\/30 g \| Sucres 1,7 g\/\d+ g \| Sel 5,42 g\/5 g \| AGS 9,1 g\/\d+ g \| sur 2 aliments sur 3$/);
  assert.match(r.affiche[2], /^Sel 5,42 g/, 'le sel au-dessus du repère est signalé');
  assert.deepEqual(r.reperes, { fib: 30, suc: 50, sel: 5, ags: 22 });
  assert.equal(r.cache, true);
  assert.deepEqual(r.champs, ['0', '4.8', '0.1', '2']);
  assert.deepEqual(r.ajoute, ['Yaourt nature', 0, 7.2, 0.15, 3, 90]);
  assert.deepEqual(r.ligne, { 'fiber_100g': 2.5, 'salt_100g': 1, 'saturated-fat_100g': 1.1 });
}));

test("aide cru/cuit (lot 15) : pour un féculent ou une viande pesés cuits, l'appli propose l'équivalent cru et ne convertit que sur demande ; rien pour un aliment déjà cuit", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const res = {};
    const nom = document.getElementById('man-name'), g = document.getElementById('man-grams'), note = document.getElementById('man-cru-cuit');
    const texte = () => note.classList.contains('hidden') ? null : note.textContent.replace(/\s+/g, ' ').trim();
    nom.value = 'Riz blanc, cru'; g.value = '200'; calculerApercuManuel();
    res.riz = texte();
    convertirCuitEnCru();
    res.converti = [g.value, texte()];
    annulerConversionCuit();
    res.annule = [g.value, texte()];
    nom.value = 'Riz cuit'; calculerApercuManuel();
    res.cuit = texte();
    nom.value = 'Poulet, blanc'; g.value = '150'; calculerApercuManuel();
    res.poulet = texte();
    nom.value = 'Pomme'; calculerApercuManuel();
    res.pomme = texte();
    res.facteurs = ['Pâtes complètes', 'Lentilles vertes', 'Saumon', 'Quinoa', 'Steak haché'].map(n => (aideCruCuit(n) || {}).facteur);
    return res;
  });
  assert.equal(r.riz, 'Valeurs pour le riz cru. Pesé cuit ? 200 g cuit ≈ 71 g cru. Compter 71 g cru');
  assert.deepEqual(r.converti, ['71', '200 g cuit comptés comme 71 g cru. Revenir à 200 g']);
  assert.deepEqual(r.annule, ['200', 'Valeurs pour le riz cru. Pesé cuit ? 200 g cuit ≈ 71 g cru. Compter 71 g cru']);
  assert.equal(r.cuit, null, 'déjà cuit : rien à convertir');
  assert.equal(r.poulet, 'Valeurs pour la viande cru. Pesé cuit ? 150 g cuit ≈ 200 g cru. Compter 200 g cru');
  assert.equal(r.pomme, null);
  assert.deepEqual(r.facteurs, [2.3, 2.5, 0.8, 3, 0.75]);
}));

test("feuille de style externe (lot 14) : le CSS vit dans assets/styles.css, la page n'en garde que la règle du dégradé SVG, et les jetons de dessin s'appliquent", () => avecAppli({}, async ({ page }) => {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(RACINE, 'assets', 'styles.css'), 'utf8');
  const inline = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1].trim());
  assert.ok(html.includes('<link rel="stylesheet" href="assets/styles.css">'));
  assert.deepEqual(inline.map(b => b.split('\n').length), [1], 'une seule règle encore dans la page');
  assert.match(inline[0], /url\(#grad-onglet\)/);
  assert.ok(css.length > 150000, 'la feuille contient le dessin : ' + css.length + ' octets');
  assert.ok(!/url\(#/.test(css), 'aucune référence à un élément de la page depuis la feuille');
  const r = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { bg: cs.getPropertyValue('--bg').trim() !== '', texte: cs.getPropertyValue('--text').trim() !== '', police: getComputedStyle(document.body).fontFamily,
      // Sous file://, les règles d'une feuille externe ne se lisent pas (origine) : sa présence et ses effets suffisent.
      feuille: [...document.styleSheets].some(s => (s.href || '').endsWith('assets/styles.css')),
      onglet: getComputedStyle(document.querySelector('.onglet')).display !== 'inline' };
  });
  assert.deepEqual([r.bg, r.texte, r.feuille, r.onglet], [true, true, true, true]);
  assert.match(r.police, /Inter|Manrope|system-ui|-apple-system/);
}));

test("app iOS (refonte F) : le résumé publié pour les widgets et Siri (journée, séance à faire, poids), les adresses askesis:// (eau, pesée, séance lancée par une intention Siri), et la séance terminée inscrite dans Santé", () => avecAppli({ natif: true }, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const pause = ms => new Promise(ok => setTimeout(ok, ms));
    donneesPretes = true;
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    musculationProgrammes = [{ id: 'p1', nom: 'Push', exercices: [{ exerciceId: exo.id, series: [{ reps: 10, poids: 40 }, { reps: 10, poids: 40 }] }] }];
    sauvegarderProgrammes();
    const auj = todayStr(), day = getDay(auj);
    day.eauMl = 500; day.weight = 79.2; getDay(shiftDate(auj, -3)).weight = 80.1; getDay(shiftDate(auj, -8)).weight = 80.8;
    day.meals.lunch = [{ name: 'Test', grams: 100, kcal: 400, p: 30, c: 40, f: 10 }];
    saveData(auj);
    window.__appelsNatifs.length = 0;
    renderApp(); await pause(700);
    const pub = window.__appelsNatifs.filter(a => a[0] === 'Resume' && a[1] === 'publier').pop();
    const res = { publie: !!pub, resume: pub && pub[2] && pub[2].resume };
    // Adresse d'un widget : un verre d'eau.
    traiterLienProfond('askesis://eau?ml=250'); await pause(200);
    res.eau = getDay(auj).eauMl;
    // Adresse : la pesée (feuille de saisie rapide).
    traiterLienProfond('askesis://poids'); await pause(200);
    res.pesee = document.getElementById('feuille-saisie-rapide').classList.contains('show') && saisieRapide === 'poids';
    fermerFeuilles();
    // Intention laissée par Siri, prise au retour au premier plan : la séance démarre.
    window.__reponsesNatives['Resume.intention'] = { url: 'askesis://seance/demarrer?id=p1' };
    prendreIntentionNative(); await pause(400);
    res.seance = musculationSessionActive && musculationSessionActive.programmeId;
    res.ecran = (document.querySelector('.ecran.actif') || {}).id;
    // Santé activée : la séance terminée y est inscrite avec sa dépense.
    localStorage.setItem('mc_sante_apple', '1');
    musculationSessionActive.exercices[0].series[0].fait = true;
    confirmer = () => Promise.resolve(true);
    window.__appelsNatifs.length = 0;
    await terminerSeance(); await pause(100);
    const sante = window.__appelsNatifs.find(a => a[0] === 'Entrainements' && a[1] === 'enregistrer');
    res.sante = sante && sante[2];
    await pause(700);
    const pub2 = window.__appelsNatifs.filter(a => a[0] === 'Resume' && a[1] === 'publier').pop();
    res.apres = pub2 && pub2[2].resume.seance;
    return res;
  });
  assert.ok(r.publie, 'un résumé publié');
  assert.equal(r.resume.journee.eauMl, 500);
  assert.equal(r.resume.journee.kcalConsommees, 400);
  assert.ok(r.resume.journee.kcalCible > 0 && r.resume.journee.proteinesCible > 0 && r.resume.journee.eauCibleMl > 0);
  assert.deepEqual([r.resume.seance.id, r.resume.seance.nom, r.resume.seance.enCours, r.resume.seance.exercices, r.resume.seance.series], ['p1', 'Push', false, 1, 2]);
  assert.equal(r.resume.poids.dernier, 79.2);
  assert.ok(Array.isArray(r.resume.poids.tendance) && r.resume.poids.tendance.length >= 2, 'une tendance');
  assert.equal(r.eau, 750);
  assert.equal(r.pesee, true);
  assert.equal(r.seance, 'p1');
  assert.equal(r.ecran, 'ecran-seance');
  assert.ok(r.sante && r.sante.type === 'musculation' && r.sante.fin > r.sante.debut && r.sante.kcal >= 0 && r.sante.titre === 'Push', JSON.stringify(r.sante));
  assert.ok(r.apres && r.apres.enCours === false, 'après la séance, le résumé repropose une séance à faire');
}));

test("sur le web, le résumé se calcule mais rien n'est publié ; sans Santé activée, rien n'est inscrit", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const pause = ms => new Promise(ok => setTimeout(ok, ms));
    publierResume(); await pause(500);
    const res = { appels: typeof window.__appelsNatifs, resume: construireResume() };
    res.sante = santeActive();
    return res;
  });
  assert.equal(r.appels, 'undefined');
  assert.equal(r.resume.journee.date.length, 10);
  assert.equal(r.sante, false);
}));

test("IA par le serveur : sans clé personnelle, l'IA reste disponible (photo comprise) et chaque demande part avec sa tâche ; l'administration ne distribue plus de clé", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    supa = { functions: { invoke: async (nom, o) => { appels.push([nom, o.body]); return { data: { candidates: [{ content: { parts: [{ text: '[]' }] } }] }, error: null }; } } };
    sessionUtilisateur = { id: 'u-1', email: 'moi@test.fr' };
    userProfile.geminiKey = ''; userProfile.accordIA = true;
    iaServeur = { pret: true, pro: false, restant: 3 };
    appliquerGeminiKeyEffective();
    const res = { active: document.documentElement.classList.contains('ia-active'), dispo: iaDisponible(), indispo: iaIndisponible() };
    res.journee = await geminiTextes([{ text: 'x' }], 'journee', 1);
    await geminiCandidats([{ text: 'x' }], 'photo', 3);
    res.appels = appels.map(([nom, b]) => [nom, b.tache, b.candidats || 1]);
    // Sans serveur ni clé : rien n'est disponible, et la porte de la photo le dit.
    iaServeur = null; appliquerGeminiKeyEffective();
    res.sansRien = [iaDisponible(), document.documentElement.classList.contains('ia-active')];
    res.admin = [document.getElementById('admin-cle-edition'), typeof definirCleGeminiUtilisateur, /drop function if exists public\.admin_definir_cle_gemini/.test(SQL_RLS), /gemini_key text/.test(SQL_RLS)];
    return res;
  });
  assert.deepEqual({ active: r.active, dispo: r.dispo, indispo: r.indispo }, { active: true, dispo: true, indispo: false });
  assert.deepEqual(r.journee, ['[]']);
  assert.deepEqual(r.appels, [['ia', 'journee', 1], ['ia', 'photo', 3]]);
  assert.deepEqual(r.sansRien, [false, false]);
  assert.deepEqual(r.admin, [null, 'undefined', true, false]);
}));

test('Administration : signalements (motif, bio, « 2e fois ») ; classer et suspendre les traitent', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page, () => Object.assign({ 'rpc:admin_liste_comptes': [
      { utilisateur: 'admin', email: 'moi@x.fr', maj: Date.now(), nb_journees: 40 },
      { utilisateur: 'a1', email: 'alice@x.fr', maj: Date.now() - 1000, nb_journees: 12, cree_le: new Date(Date.now() - 90 * 864e5).toISOString(), derniere_connexion: new Date().toISOString() },
      { utilisateur: 'b2', email: 'bob@x.fr', maj: Date.now() - 2000, statut: 'suspendu' },
      { utilisateur: 'c3', email: 'carl@x.fr', maj: Date.now() - 40 * 864e5 }],
    'table:pseudos': [{ utilisateur: 'a1', pseudo: 'alice.fit' }, { utilisateur: 'b2', pseudo: 'bob' }],
    'table:withings_jetons:compte': { __erreur: { code: '42501', message: 'permission denied for table withings_jetons' } } }, {
    'rpc:admin_signalements': q => q.args.p_traites ? [] : [
      { id: 7, cree_le: new Date(Date.now() - 5 * 3600e3).toISOString(), motif: 'Pub ou spam', traite: false, auteur: 'b2', auteur_pseudo: 'bob', cible: 'a1', cible_pseudo: 'alice.fit', cible_bio: 'Coaching 💸', cible_nb: 2 },
      { id: 8, cree_le: new Date().toISOString(), motif: null, traite: false, auteur: 'a1', auteur_pseudo: 'alice.fit', cible: 'c3', cible_pseudo: null, cible_nb: 1 }],
  }));
  const r = await page.evaluate(async () => {
    allerA('admin');
    await chargerAdmin();
    await ouvrirSignalementsAdmin();
    const cartes = () => [...document.querySelectorAll('#admin-signal-liste .adm-signal')].map(c => [c.querySelector('.adm-qui b').textContent, c.querySelector('.adm-qui small').textContent,
      [...c.querySelectorAll('.adm-signal-tete .adm-chip')].map(x => x.textContent).join('|'), c.querySelector('.adm-motif b').textContent, c.querySelector('.adm-profil p').textContent,
      [...c.querySelectorAll('.adm-actions button')].map(b => b.textContent).join('|')]);
    // Avant 5 h du matin, « il y a 5 h » tombe la veille : l'appli écrit alors « hier ».
    const res = { cartes: cartes(), onglet: document.getElementById('signal-onglet-nb').textContent, avant5h: new Date().getHours() < 5 };
    window.__appels = [];
    [...document.querySelectorAll('#admin-signal-liste .adm-signal')][1].querySelector('.adm-actions button:last-child').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.classer = window.__appels.filter(a => a[0] === 'from' && a[2] === 'update' || a[1] === 'admin_consigner');
    window.__appels = [];
    const suspendre = [...document.querySelectorAll('#admin-signal-liste .adm-signal')][0].querySelector('.adm-actions .danger');
    adminComptes.a1.statut = null;
    window.__rep['rpc:admin_definir_blocage'] = () => { adminComptes.a1.statut = 'suspendu'; return null; };
    window.__rep['rpc:admin_liste_comptes'] = () => Object.values(adminComptes);
    suspendre.click();
    await new Promise(ok => setTimeout(ok, 200));
    validerMotif();
    await new Promise(ok => setTimeout(ok, 300));
    res.suspendre = window.__appels.filter(a => (a[0] === 'rpc' && /blocage|consigner/.test(a[1])) || (a[0] === 'from' && a[2] === 'update')).map(a => a.slice(0, 4));
    return res;
  });
  assert.equal(r.onglet, ' · 2');
  assert.deepEqual(r.cartes[0], ['@alice.fit', 'Signalé par @bob · ' + (r.avant5h ? 'hier' : 'il y a 5 h'), '2e fois', 'Pub ou spam', '« Coaching 💸 »', 'Voir le compte|Suspendre|Classer']);
  assert.deepEqual(r.cartes[1], ['Compte sans nom d’utilisateur', "Signalé par @alice.fit · à l'instant", '', 'Non précisé', 'Pas de bio, pas de photo.', 'Voir le compte|Suspendre|Classer']);
  assert.deepEqual(r.classer.map(a => a.slice(0, 5)), [['from', 'gymbros_signalements', 'update', [['eq', 'id', 8]], { traite: true }], ['rpc', 'admin_consigner', { p_action: 'signalement_classe', p_cible_id: 'c3', p_cible_libelle: null, p_motif: null, p_detail: { signale_par: '@alice.fit' } }]]);
  assert.deepEqual(r.suspendre, [['rpc', 'admin_definir_blocage', { p_utilisateur: 'a1', p_type: 'suspendu' }], ['rpc', 'admin_consigner', { p_action: 'suspendre', p_cible_id: 'a1', p_cible_libelle: 'alice@x.fr', p_motif: 'Signalé : Pub ou spam', p_detail: null }],
    ['from', 'gymbros_signalements', 'update', [['eq', 'cible', 'a1'], ['eq', 'traite', false]]]]);
}));

test('Erreurs : envoyées sans données perso, une fois, pas les coupures réseau ; regroupées pour l\'admin', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page, () => Object.assign({ 'rpc:admin_liste_comptes': [
      { utilisateur: 'admin', email: 'moi@x.fr', maj: Date.now(), nb_journees: 40 },
      { utilisateur: 'a1', email: 'alice@x.fr', maj: Date.now() - 1000, nb_journees: 12, cree_le: new Date(Date.now() - 90 * 864e5).toISOString(), derniere_connexion: new Date().toISOString() },
      { utilisateur: 'b2', email: 'bob@x.fr', maj: Date.now() - 2000, statut: 'suspendu' },
      { utilisateur: 'c3', email: 'carl@x.fr', maj: Date.now() - 40 * 864e5 }],
    'table:pseudos': [{ utilisateur: 'a1', pseudo: 'alice.fit' }, { utilisateur: 'b2', pseudo: 'bob' }],
    'table:withings_jetons:compte': { __erreur: { code: '42501', message: 'permission denied for table withings_jetons' } } }, { 'table:erreurs_appli': [
    { id: 1, utilisateur: 'a1', cree_le: new Date(Date.now() - 12 * 60000).toISOString(), type: 'synchro', message: 'délai dépassé', appareil: 'iPhone · app Askēsis', ecran: 'repas', version: '2026-01-01', detail: 'pile' },
    { id: 2, utilisateur: 'b2', cree_le: new Date(Date.now() - 3600e3).toISOString(), type: 'synchro', message: 'délai dépassé', appareil: 'Mac · Safari', ecran: 'stats', version: VERSION_APPLI },
    { id: 3, utilisateur: 'a1', cree_le: new Date(Date.now() - 2 * 3600e3).toISOString(), type: 'ia', message: 'Quota atteint', appareil: 'iPhone · app Askēsis', ecran: 'repas', version: VERSION_APPLI },
    { id: 4, utilisateur: 'a1', cree_le: new Date(Date.now() - 3 * 3600e3).toISOString(), type: 'js', message: 'déjà réglée', regle_le: new Date().toISOString() }] }));
  const r = await page.evaluate(async () => {
    sessionUtilisateur = { id: 'u1', email: 'u1@x.fr' };
    window.__appels = [];
    noterErreur('js', 'boum', 'pile 1');
    noterErreur('js', 'boum', 'pile 2');
    noterErreur('js', 'TypeError: Failed to fetch');
    majEtatSync('erreur', 'Synchronisation impossible : délai dépassé — tes données restent sur cet appareil.');
    await new Promise(ok => setTimeout(ok, 100));
    const envois = window.__appels.filter(a => a[1] === 'noter_erreur').map(a => [a[2].p_type, a[2].p_message, a[2].p_detail, a[2].p_version === VERSION_APPLI, a[2].p_ecran]);
    sessionUtilisateur = { id: 'admin', email: ADMIN_EMAIL };
    allerA('admin');
    await chargerAdmin();
    await ouvrirErreursAdmin();
    const res = { envois, avant1h: new Date().getHours() < 1, resume: document.getElementById('erreurs-resume').textContent,
      groupes: [...document.querySelectorAll('#admin-erreurs-liste .adm-err')].map(c => [c.querySelector('.adm-nb').textContent, c.querySelector('.adm-qui b').textContent, c.querySelector('.adm-qui small').textContent, c.querySelector('.adm-chips').textContent]) };
    window.__appels = [];
    const premier = document.querySelector('#admin-erreurs-liste .adm-err');
    premier.querySelector('.adm-err-tete').click();
    res.occurrences = [...premier.querySelectorAll('.adm-occ li')].map(l => l.textContent);
    [...premier.querySelectorAll('.adm-actions button')][1].click();
    await new Promise(ok => setTimeout(ok, 50));
    res.regle = window.__appels.filter(a => a[0] === 'from' && a[2] === 'update').map(a => [a[1], a[3]]);
    return res;
  });
  assert.deepEqual(r.envois, [['js', 'boum', 'pile 1', true, 'repas'], ['synchro', 'délai dépassé', null, true, 'repas']]);
  assert.equal(r.resume, '3 erreurs · 2 comptes touchés · dernière il y a 12 min · 1 réglée masquée');
  assert.equal(r.groupes.length, 2);
  assert.deepEqual(r.groupes[0].slice(0, 3), ['×2', 'Synchro : délai dépassé', '2 comptes · dernière il y a 12 min']);
  assert.match(r.groupes[0][3], /iPhone · app Askēsis.*Mac · Safari.*Ancienne version/);
  // Entre minuit et une heure, « il y a 1 h » tombe la veille : « hier ».
  assert.deepEqual(r.occurrences, ["@alice.fit · iPhone · app Askēsis · Repas du jouril y a 12 min", '@bob · Mac · Safari · Progrès' + (r.avant1h ? 'hier' : 'il y a 1 h')]);
  assert.deepEqual(r.regle, [['erreurs_appli', [['eq', 'type', 'synchro'], ['eq', 'message', 'délai dépassé'], ['is', 'regle_le', null]]]]);
}));

test('Appareil : après une synchro réussie, sa version, sa dernière synchro et ce qui attend (au plus toutes les 10 min)', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page);
  const r = await page.evaluate(async () => {
    sessionUtilisateur = { id: 'u1', email: 'u1@x.fr' };
    marquerJourModifie(todayStr());
    window.__appels = [];
    majEtatSync('ok', 'À jour');
    await new Promise(ok => setTimeout(ok, 50));
    majEtatSync('ok', 'À jour');
    await new Promise(ok => setTimeout(ok, 50));
    return window.__appels.filter(a => a[1] === 'noter_appareil').map(a => a[2]);
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].p_version, await page.evaluate(() => VERSION_APPLI));
  assert.equal(r[0].p_en_attente, 1);
  assert.ok(Math.abs(new Date(r[0].p_synchro_le).getTime() - Date.now()) < 60000);
  assert.match(r[0].p_plateforme, / · /);
  assert.match(r[0].p_appareil, /^[a-z0-9]{8,}$/);
}));

test('Message à tous : publié par l\'admin, affiché en haut de Repas du jour, fermé pour de bon', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page);
  const r = await page.evaluate(async () => {
    allerA('admin');
    await ouvrirMessageAdmin();
    document.getElementById('message-texte').value = 'Mettez à jour <b>maintenant</b>';
    choisirOptionMessage('ton', 'important');
    choisirOptionMessage('bouton', 'maj');
    const a = document.getElementById('message-apercu');
    const apercu = [a.querySelector('small').textContent, a.querySelector('p').textContent, a.querySelector('.annonce-txt button').textContent, a.querySelector('.annonce').dataset.ton];
    window.__appels = [];
    window.__rep['table:annonces:insert'] = { id: 5 };
    await publierMessageAdmin();
    const ecrit = window.__appels.filter(a => a[0] === 'from' && a[1] === 'annonces' && a[2] !== 'select').map(a => [a[2], a[3], a[4]]);
    // Chez chacun.
    sessionUtilisateur = { id: 'u1', email: 'u1@x.fr' };
    window.__rep['table:annonces'] = [{ id: 5, texte: 'Mettez à jour <b>maintenant</b>', ton: 'important', bouton: 'maj', pour: 'tous', jusqua: null },
      { id: 4, texte: 'Pour les Pro', ton: 'info', pour: 'pro', jusqua: null }];
    allerA('repas');
    await chargerAnnonce(true);
    const el = document.getElementById('annonce');
    const visible = [!el.classList.contains('hidden'), el.dataset.ton, el.querySelector('p').textContent, el.querySelector('.annonce-txt button').textContent, !!el.querySelector('b')];
    fermerAnnonce();
    await chargerAnnonce(true);
    const apresFermeture = el.classList.contains('hidden');
    window.__rep['table:annonces'] = [{ id: 6, texte: 'Périmé', pour: 'tous', jusqua: new Date(Date.now() - 1000).toISOString() }];
    await chargerAnnonce(true);
    return { apercu, ecrit, visible, apresFermeture, perime: el.classList.contains('hidden') };
  });
  assert.deepEqual(r.apercu, ['Important · Askēsis', 'Mettez à jour <b>maintenant</b>', 'Mettre à jour', 'important']);
  assert.equal(r.ecrit[0][0], 'insert', 'le nouveau message d\'abord');
  assert.deepEqual(Object.assign({}, r.ecrit[0][2], { jusqua: !!r.ecrit[0][2].jusqua }), { texte: 'Mettez à jour <b>maintenant</b>', ton: 'important', bouton: 'maj', lien: null, pour: 'tous', jusqua: true });
  assert.deepEqual(r.ecrit[1].slice(0, 2), ['update', [['eq', 'retiree', false], ['neq', 'id', 5]]], 'puis les autres retirés');
  assert.deepEqual(r.visible, [true, 'important', 'Mettez à jour <b>maintenant</b>', 'Mettre à jour', false]);
  assert.equal(r.apresFermeture, true, 'fermé : il ne revient pas');
  assert.equal(r.perime, true, 'périmé : pas affiché');
}));

test('Tableau de bord : les chiffres de la semaine et 30 jours d\'actifs, une barre touchée affiche sa valeur', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page);
  const r = await page.evaluate(async () => {
    const jours = Array.from({ length: 30 }, (_, k) => ({ jour: shiftDate(todayStr(), k - 29), n: k === 10 ? 8 : 3 }));
    window.__rep['rpc:admin_tableau_de_bord'] = { comptes: 10, actifs_jour: 3, actifs_7j: 6, par_jour: jours, seances_7j: 23, seances_7j_avant: 19, repas_7j: 188, repas_7j_avant: 194,
      en_seance: [{ pseudo: 'karim' }], duos_7j: 3, duos_comptes_7j: 2, nouveaux_7j: ['nora'], usage_7j: { repas: 6, musculation: 4, cardio: 1, gymbro: 2 }, pro: { total: 9, fondateur: 7, offert: 0, payant: 2 } };
    allerA('admin');
    await ouvrirTableauAdmin();
    const c = document.getElementById('admin-tableau');
    const res = { heros: [c.querySelector('.adm-heros b').textContent, c.querySelector('.adm-heros span').textContent, c.querySelector('.adm-heros small').textContent],
      tuiles: [...c.querySelectorAll('.adm-tuiles > div')].map(d => [d.querySelector('small').textContent, d.querySelector('b').textContent, d.querySelector('em').textContent]),
      barres: c.querySelectorAll('.barre').length, cibles: c.querySelectorAll('.cible').length, bulle: c.querySelector('.adm-bulle-txt').textContent,
      usage: [...c.querySelectorAll('.adm-hbarres > span')].map(s => s.textContent) };
    c.querySelector('.cible[data-k="10"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    res.bulle2 = c.querySelector('.adm-bulle-txt').textContent;
    res.choisie = c.querySelectorAll('.barre--choisie').length;
    return res;
  });
  assert.deepEqual(r.heros, ['3', 'actifs aujourd’hui', '6 sur 7 jours · 10 comptes']);
  assert.deepEqual(r.tuiles, [['Séances · 7 j', '23', '▲ 4 vs les 7 jours d’avant'], ['Repas notés · 7 j', '188', '▼ 6 vs les 7 jours d’avant'], ['En séance maintenant', '1', '@karim'],
    ['Séances à deux · 7 j', '3', '2 comptes'], ['Nouveaux comptes · 7 j', '1', '@nora'], ['Askēsis Pro', '9', '7 fondateurs, 2 abonnés']]);
  assert.deepEqual([r.barres, r.cibles], [30, 30]);
  assert.match(r.bulle, / · 3 actifs$/);
  assert.match(r.bulle2, / · 8 actifs$/);
  assert.equal(r.choisie, 1);
  assert.deepEqual(r.usage, ['Repas', 'Musculation', 'Gymbro', 'Cardio']);
}));

test('Réglages : la version de l\'appli, et « Réparer l\'appli » oublie les fichiers gardés sans toucher aux données', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const t = todayStr();
    getDay(t).steps = 1234; saveData(t);
    const supprimes = [], desinscrits = [];
    Object.defineProperty(window, 'caches', { configurable: true, value: { keys: async () => ['anqaa-v1', 'autre'], delete: async k => { supprimes.push(k); return true; } } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: async () => [{ unregister: async () => { desinscrits.push(1); return true; } }] } });
    rechargerPage = () => { window.__recharge = true; };
    derniereVerifVersion = Date.now();
    majVersionAffichee();
    const version = [document.getElementById('reglages-version').textContent, document.getElementById('reglages-version-etat').textContent];
    await reparerAppli();
    return { version, supprimes, desinscrits: desinscrits.length, recharge: !!window.__recharge, pas: getDay(t).steps, attendue: libelleVersion(VERSION_APPLI) };
  });
  assert.deepEqual(r.version, [r.attendue, 'À jour']);
  assert.match(r.attendue, /^\d{1,2} \S+ 20\d\d$/);
  assert.deepEqual(r.supprimes, ['anqaa-v1', 'autre']);
  assert.equal(r.desinscrits, 1);
  assert.equal(r.recharge, true);
  assert.equal(r.pas, 1234, 'les données restent');
}));

test('Administration : aliments à valider et base commune dans une seule fenêtre', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page);
  const r = await page.evaluate(async () => {
    allerA('admin');
    const etat = () => [document.getElementById('feuille-admin-aliments').classList.contains('show'),
      document.getElementById('aliments-panneau-valider').classList.contains('hidden'), document.getElementById('aliments-panneau-base').classList.contains('hidden'),
      document.querySelector('#aliments-onglets [aria-pressed="true"]').dataset.onglet];
    await afficherFeuillAlimentsPersonalises();
    const valider = etat();
    afficherFeuilleBaseAliments();
    return { valider, base: etat(), titre: document.getElementById('feuille-admin-aliments-titre').textContent };
  });
  assert.deepEqual(r.valider, [true, false, true, 'valider']);
  assert.deepEqual(r.base, [true, true, false, 'base']);
  assert.equal(r.titre, 'Aliments');
}));

test('Gymbro : demande, pastille, acceptation, comparaison réservée aux gymbros acceptés', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    let liens = [
      { pseudo: 'alice', sens: 'recue', statut: 'attente' },
      { pseudo: 'bob', sens: 'envoyee', statut: 'attente' },
      { pseudo: 'carl', sens: 'envoyee', statut: 'acceptee' }
    ];
    const reponse = data => ({ then: ok => Promise.resolve({ data, error: null }).then(ok) });
    supa = {
      rpc: (nom, args) => {
        appels.push([nom, args]);
        if (nom === 'gymbro_mes_liens') return reponse(liens);
        if (nom === 'gymbro_repondre') { liens = liens.map(l => l.pseudo === args.p_pseudo ? { ...l, statut: 'acceptee' } : l); return reponse('acceptee'); }
        if (nom === 'gymbro_demander') { liens.push({ pseudo: args.p_pseudo, sens: 'envoyee', statut: 'attente' }); return reponse('attente'); }
        return reponse([]);
      },
      from: () => ({ select: () => reponse(null) })
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    const res = {};
    await chargerLiensGymbro();
    res.pastille = document.querySelector('#onglet-seance .pastille-gymbro')?.textContent;
    ouvrirGymbro();
    await new Promise(ok => setTimeout(ok, 50));
    res.sections = [...document.querySelectorAll('#gymbro-favoris > p')].map(p => p.textContent);
    document.querySelector('#gymbro-favoris .gymbro-accepter').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.reponse = appels.find(a => a[0] === 'gymbro_repondre');
    res.pastilleApres = document.querySelectorAll('.pastille-gymbro').length;
    res.seancesAlice = appels.some(a => a[0] === 'gymbro_seances' && a[1].p_pseudo === 'alice');
    // Pas encore gymbro : pas de séances demandées, une invitation à la place.
    const avant = appels.length;
    await comparerGymbro('dave');
    res.invitation = document.querySelector('#gymbro-comparaison .gymbro-invitation').textContent.includes('Envoyer une demande');
    res.seancesDave = appels.slice(avant).some(a => a[0] === 'gymbro_seances');
    document.querySelector('#gymbro-comparaison .gymbro-invitation .btn-primary').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.demande = appels.find(a => a[0] === 'gymbro_demander');
    res.apresDemande = document.querySelector('#gymbro-comparaison .gymbro-invitation').textContent.includes('Annuler la demande');
    return res;
  });
  assert.equal(r.pastille, '1');
  assert.deepEqual(r.sections, ['Demande reçue', 'Tes gymbros · 1', 'Demande envoyée']);
  assert.deepEqual(r.reponse, ['gymbro_repondre', { p_pseudo: 'alice', p_accepter: true }]);
  assert.equal(r.pastilleApres, 0);
  assert.ok(r.seancesAlice, 'une fois acceptée, la comparaison charge les séances');
  assert.ok(r.invitation);
  assert.equal(r.seancesDave, false);
  assert.deepEqual(r.demande, ['gymbro_demander', { p_pseudo: 'dave' }]);
  assert.ok(r.apresDemande);
}));

test("fil de l'espace Gymbros : cartes, respect, respects reçus", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    const jour = todayStr();
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    const seance = (id, date, programmeNom) => ({ id, date, programmeNom, dureeMin: 52, exercices: [{ exerciceId: exo.id, series: [
      { poids: 100, reps: 5, fait: true }, { poids: 90, reps: 8, fait: true }, { poids: 120, reps: 1, fait: false }] }] });
    const reponse = data => ({ then: ok => Promise.resolve({ data, error: null }).then(ok) });
    supa = {
      rpc: (nom, args) => {
        appels.push([nom, args]);
        if (nom === 'gymbro_fil') return reponse([
          { pseudo: 'carl', seance_id: 's1', donnees: seance('s1', jour, 'Push'), respects: 2, mon_respect: false },
          { pseudo: 'alice', seance_id: 's2', donnees: seance('s2', decalerJours(jour, -1)), respects: 0, mon_respect: true },
          { pseudo: 'pirate', seance_id: 's3', donnees: { date: 'pas une date', exercices: [] } }
        ]);
        if (nom === 'gymbro_respects_recus') return reponse([{ pseudo: 'carl', seance_id: 'm1', seance_date: jour, cree_le: new Date().toISOString() }]);
        if (nom === 'gymbro_respect') return reponse(3);
        if (nom === 'gymbro_mes_liens') return reponse([{ pseudo: 'carl', sens: 'envoyee', statut: 'acceptee' }]);
        return reponse([]);
      },
      from: () => ({ select: () => reponse(null) })
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    userProfile.respectsVus = 0;
    const res = {};
    await chargerFilGymbros(true);
    res.pastille = document.querySelector('#onglet-seance .pastille-gymbro')?.textContent;
    ouvrirGymbro('fil');
    await new Promise(ok => setTimeout(ok, 50));
    const cartes = [...document.querySelectorAll('#fil-gymbros .fil-carte')];
    res.cartes = cartes.map(c => [...c.querySelector('.fil-qui').children].map(x => x.textContent.trim()).join(' '));
    res.stats = [...cartes[0].querySelector('.fil-stats').children].map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    res.meilleure = cartes[0].textContent.includes('100 kg × 5');
    res.respects = document.querySelector('#fil-gymbros .fil-respects').textContent;
    res.pastilleApres = document.querySelectorAll('#onglet-seance .pastille-gymbro').length;
    cartes[0].querySelector('.fil-respect').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.appelRespect = appels.find(a => a[0] === 'gymbro_respect');
    res.bouton = document.querySelector('#fil-gymbros .fil-carte .fil-respect').textContent.trim();
    res.presse = document.querySelector('#fil-gymbros .fil-carte .fil-respect').getAttribute('aria-pressed');
    return res;
  });
  assert.equal(r.pastille, '1', 'un nouveau respect reçu');
  assert.deepEqual(r.cartes, ["@carl Aujourd'hui · Push", '@alice Hier · Séance libre'], 'la séance à la date invalide est écartée');
  assert.equal(r.stats, '52 min | 2 séries | 1 220 kg');
  assert.ok(r.meilleure);
  assert.match(r.respects, /1 respect reçu .*@carl/);
  assert.equal(r.pastilleApres, 0, 'les respects sont vus une fois le fil affiché');
  assert.deepEqual(r.appelRespect, ['gymbro_respect', { p_pseudo: 'carl', p_seance: 's1', p_actif: true }]);
  assert.equal(r.bouton, '💪 Respect · 3');
  assert.equal(r.presse, 'true');
}));

test("Gymbros : rangée d'Activité, record du fil, classement de la semaine, lien d'invitation", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const jour = todayStr();
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    const seance = (id, date, poids, nom) => ({ id, date, programmeNom: nom || 'Push', dureeMin: 50, exercices: [{ exerciceId: exo.id, series: [
      { poids, reps: 5, fait: true }, { poids, reps: 5, fait: true }] }] });
    const reponse = data => ({ then: ok => Promise.resolve({ data, error: null }).then(ok) });
    supa = {
      rpc: (nom, args) => {
        if (nom === 'gymbro_mes_liens') return reponse([{ pseudo: 'carl', sens: 'envoyee', statut: 'acceptee' }, { pseudo: 'alice', sens: 'recue', statut: 'acceptee' }, { pseudo: 'lea', sens: 'recue', statut: 'attente' }]);
        if (nom === 'gymbro_fil') return reponse([
          { pseudo: 'carl', seance_id: 'c1', donnees: seance('c1', jour, 100), respects: 0, mon_respect: false },
          { pseudo: 'alice', seance_id: 'a1', donnees: seance('a1', decalerJours(jour, -10), 60, 'Jambes'), respects: 0, mon_respect: false }]);
        if (nom === 'gymbro_seances' && args.p_pseudo === 'carl') return reponse([seance('c1', jour, 100), seance('c0', decalerJours(jour, -7), 90)].map(d => ({ donnees: d })));
        return reponse([]);
      },
      from: () => ({ select: () => reponse(null) })
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    monPseudo = { pseudo: 'jamal' };
    musculationHistorique.push(seance('m1', jour, 80));
    await chargerLiensGymbro();
    await chargerFilGymbros(true);
    allerA('seance');
    const res = {};
    const textes = sel => [...document.querySelectorAll(sel)].map(x => x.textContent.trim());
    res.noms = textes('#gymbros-rangee .gst small');
    res.sous = textes('#gymbros-rangee .gst em');
    res.anneaux = document.querySelectorAll('#gymbros-rangee .gav--actif').length;
    res.profil = !!document.querySelector('#gymbros-rangee-profil .gstrip');
    ouvrirGymbro('fil');
    await new Promise(ok => setTimeout(ok, 80));
    res.record = document.querySelector('#fil-gymbros .fil-carte .gcarte-rec')?.textContent;
    res.badge = document.getElementById('gymbro-badge-mes').textContent;
    choisirOngletGymbro('classement');
    res.classement = textes('#gymbro-vue-classement .gcl-t b');
    res.valeurs = textes('#gymbro-vue-classement .gcl em');
    res.defi = document.querySelector('#gymbro-vue-classement .gdefi b').textContent;
    choisirMesureGymbro('seances');
    res.parSeances = textes('#gymbro-vue-classement .gcl-t b');
    // Lien d'invitation : partagé avec mon nom, lu à l'ouverture puis retiré de l'adresse.
    Object.defineProperty(navigator, 'share', { configurable: true, value: async o => { res.partage = o.url; } });
    await partagerLienGymbro();
    history.replaceState({}, '', location.pathname + '?gymbro=Carl');
    lireInvitationGymbro();
    res.adresse = location.search;
    fermerModal('gymbro-modal');
    ouvrirInvitationGymbro();
    await new Promise(ok => setTimeout(ok, 80));
    res.ouvert = gymbroModalOuvert();
    res.fiche = document.querySelector('#gymbro-comparaison .gb-barre-retour h4')?.textContent;
    res.face = !!document.querySelector('#gymbro-comparaison .gface .gface-vs');
    return res;
  });
  assert.deepEqual(r.noms, ['Ajouter', '@lea', '@carl', '@alice']);
  assert.deepEqual(r.sous, ['Nouveau', 'Push · auj.', 'il y a 10 j']);
  assert.equal(r.anneaux, 1, "anneau pour qui s'est entraîné aujourd'hui");
  assert.ok(r.profil, 'la rangée est aussi dans le Profil');
  assert.match(r.record, /A battu son record : .*100 kg × 5/);
  assert.equal(r.badge, '1');
  assert.deepEqual(r.classement, ['@carl', 'Toi', '@alice']);
  assert.deepEqual(r.valeurs, ['1t', '800kg', '0kg']);
  assert.equal(r.defi, 'Plus que 200 kg');
  assert.deepEqual(r.parSeances, ['Toi', '@carl', '@alice']);
  assert.match(r.partage, /\?gymbro=jamal$/);
  assert.equal(r.adresse, '');
  assert.ok(r.ouvert);
  assert.equal(r.fiche, '@carl');
  assert.ok(r.face);
}));

test('profil : photo et bio, page profil d\'un gymbro, contenus piégés refusés', () => avecAppli({}, async ({ page, dialogues }) => {
  const r = await page.evaluate(async () => {
    const res = {};
    res.avatars = [
      estAvatarValide('data:image/jpeg;base64,/9j/4AAQ=='),
      estAvatarValide('data:image/svg+xml;base64,PHN2Zz4='),
      estAvatarValide('javascript:alert(1)'),
      estAvatarValide('data:image/jpeg;base64,AA" onerror="x')
    ];
    res.html = avatarHTML('bob', 'javascript:alert(1)');
    res.bios = ['Team prise de masse, 4 séances par semaine', 'je fais du support', 'constant et unique', 'fils de pute', 'Sale merde'].map(texteInterdit);
    // Enregistrement : la bio passe par profils (upsert), une bio insultante est bloquée avant l'envoi.
    const envois = [];
    const reponse = data => ({ then: ok => Promise.resolve({ data, error: null }).then(ok) });
    supa = { from: table => ({ upsert: ligne => { envois.push([table, ligne]); return reponse(null); }, select: () => ({ eq: () => ({ maybeSingle: () => reponse({ bio: 'ancienne', avatar: null }) }) }) }), rpc: () => reponse([]) };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    await chargerMonProfil();
    res.blocVisible = !document.getElementById('profil-perso').classList.contains('hidden');
    res.bioAffichee = document.getElementById('profil-bio').value;
    res.ok = await enregistrerProfil({ bio: '  Objectif : 100 kg au développé  ' });
    res.refuse = await enregistrerProfil({ bio: 'bande de connards' });
    res.envois = envois.map(([t, l]) => [t, l.utilisateur, l.bio]);
    // Page profil d'un gymbro : photo, bio, chiffres.
    profilsGymbros = { carl: { bio: 'Powerlifter <b>du dimanche</b>', avatar: 'data:image/jpeg;base64,/9j/4AAQ==', membreDepuis: Date.parse('2026-03-02') } };
    const jour = todayStr();
    const html = profilGymbroHTML('carl', [{ date: jour }, { date: decalerJours(jour, -7) }, { date: decalerJours(jour, -14) }, { date: decalerJours(jour, -35) }]);
    const div = document.createElement('div'); div.innerHTML = html;
    res.profil = { img: !!div.querySelector('img.avatar'), bio: div.querySelector('p').textContent, gras: !!div.querySelector('p b'), chiffres: [...div.querySelectorAll('.profil-gymbro-chiffres b')].map(b => b.textContent), depuis: div.querySelector('small').textContent };
    return res;
  });
  assert.deepEqual(r.avatars, [true, false, false, false]);
  assert.match(r.html, /^<span class="avatar"/);
  assert.deepEqual(r.bios, [false, false, false, true, true]);
  assert.ok(r.blocVisible);
  assert.equal(r.bioAffichee, 'ancienne');
  assert.equal(r.ok, true);
  assert.equal(r.refuse, false);
  assert.deepEqual(r.envois, [['profils', 'moi', 'Objectif : 100 kg au développé']]);
  assert.ok(dialogues.some(d => /mot non autorisé/.test(d)));
  assert.equal(r.profil.img, true);
  assert.equal(r.profil.bio, 'Powerlifter <b>du dimanche</b>');
  assert.equal(r.profil.gras, false);
  assert.equal(r.profil.chiffres[1], '3', '3 semaines d\'affilée');
  assert.equal(r.profil.depuis, 'Membre depuis mars 2026');
}));

test('Administration : pastilles quand des aliments sont à valider (admin seulement)', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const requetes = [];
    let restants = 3;
    const chaine = () => {
      const q = { filtres: [] };
      const o = {
        select: (cols, opts) => { q.select = [cols, opts]; return o; },
        eq: (c, v) => { q.filtres.push(['eq', c, v]); return o; },
        or: f => { q.filtres.push(['or', f]); return o; },
        then: ok => { requetes.push(q); return Promise.resolve({ count: restants, error: null }).then(ok); }
      };
      return o;
    };
    supa = { from: table => { requetes.push(table); return chaine(); }, rpc: () => ({ then: ok => Promise.resolve({ data: [], error: null }).then(ok) }) };
    const lire = () => ['nav-admin', 'onglet-profil'].map(id => document.querySelector('#' + id + ' > .pastille-gymbro')?.textContent || null)
      .concat(document.querySelector('[onclick="afficherFeuillAlimentsPersonalises()"] > .pastille-gymbro')?.textContent || null);
    const res = {};
    // Compte ordinaire : rien n'est demandé, aucune pastille admin.
    sessionUtilisateur = { id: 'u', email: 'quelquun@x.fr' };
    await compterAValiderAdmin();
    res.nonAdmin = { requetes: requetes.length, pastilles: lire() };
    // Admin : 3 aliments à valider.
    sessionUtilisateur = { id: 'admin', email: ADMIN_EMAIL };
    await compterAValiderAdmin();
    res.admin = lire();
    res.requete = requetes.slice(-2);
    // Tout est validé : les pastilles disparaissent.
    restants = 0;
    await compterAValiderAdmin();
    res.apres = lire();
    return res;
  });
  assert.deepEqual(r.nonAdmin, { requetes: 0, pastilles: [null, null, null] });
  assert.deepEqual(r.admin, ['3', '3', '3']);
  assert.equal(r.requete[0], 'aliments_partages');
  assert.deepEqual(r.requete[1].filtres, [['eq', 'valide', false], ['or', 'supprime.is.null,supprime.eq.false']]);
  assert.deepEqual(r.requete[1].select[1], { count: 'exact', head: true });
  assert.deepEqual(r.apres, [null, null, null]);
}));

test("des données piégées venant d'autres comptes ne s'exécutent jamais (Administration, Gymbro)", () => avecAppli({}, async ({ page }) => {
  await installerFauxSupabase(page);
  const etapes = [
    () => { allerA('admin'); return chargerAdmin(); },
    () => ouvrirCompteAdmin(Object.keys(adminComptes)[1]),
    () => chargerDetailsCompteAdmin(Object.keys(adminComptes)[1]),
    () => { afficherVueAdmin('accueil'); return chargerVeilleAdmin(true); },
    () => ouvrirSignalementsAdmin(),
    () => ouvrirErreursAdmin().then(() => document.querySelectorAll('.adm-err-tete').forEach(b => b.click())),
    () => ouvrirErreursAdmin(Object.keys(adminComptes)[1]),
    () => ouvrirMessageAdmin(),
    () => chargerAnnonce(true),
    () => { tableauAdmin = { comptes: 2, actifs_jour: 1, actifs_7j: 1, par_jour: [{ jour: todayStr(), n: 1 }], en_seance: [{ pseudo: __seancePiegee(1).notes }], nouveaux_7j: [__seancePiegee(1).notes] }; return ouvrirTableauAdmin(); },
    () => ouvrirServeurAdmin(),
    () => chargerApercuAdmin(),
    () => ouvrirJournalAdmin(),
    () => chargerAlimentsAdmin(),
    () => chargerExercicesAdmin(),
    () => chargerRecettesAdmin(),
    () => chargerStatsMuscuAdmin('u1', 'Compte'),
    () => voirDetailHistorique(muscuContexteActuel.historique[0].id),
    () => voirDetailProgramme([...muscuGroupesProgrammesCourant.keys()][0]),
    () => ouvrirHistoriqueExercice(muscuContexteActuel.historique[0].exercices[0].exerciceId),
    () => comparerGymbro('abc'),
    () => chargerLiensGymbro().then(() => ouvrirGymbro()),
    () => { const P = __seancePiegee(1).notes; filGymbrosDernier = Date.now(); filGymbros = [nettoyerSeanceFil({ pseudo: P, seance_id: 'x' + P, donnees: Object.assign(__seancePiegee(1), { programmeNom: P }), respects: 2 })]; respectsRecus = [{ pseudo: P, quand: 1 }]; renderFilGymbros(); },
    () => { allerA('seance'); renderRangeesGymbros(); },
    () => { ouvrirGymbro('mes'); return comparerGymbro(document.querySelector('#gymbro-favoris :is(.gli, .gdem) b').textContent.replace(/^@/, '')); },
    () => { const P = __seancePiegee(1).notes; gymbroLiens = [{ pseudo: P, sens: 'envoyee', statut: 'acceptee' }]; profilsGymbros[P.toLowerCase()] = { bio: P, avatar: P, membreDepuis: Date.now() }; return comparerGymbro(P); },
    () => { renderRangeesGymbros(); ouvrirGymbro('fil'); choisirOngletGymbro('classement'); choisirOngletGymbro('mes'); },
    () => { const P = __seancePiegee(1).notes; monProfil = { bio: P, avatar: 'data:image/jpeg;base64,AA" onerror="window.__xss=1' }; majUIProfilPerso(); }
  ];
  for (const etape of etapes) {
    await page.evaluate(`(${etape.toString()})()`);
    await page.waitForTimeout(250);
    assert.equal(await injectionsTrouvees(page), 0, 'code injecté exécuté après : ' + etape.toString());
  }
}));

test("des données piégées dans ses propres données ne s'exécutent jamais", () => avecAppli({}, async ({ page }) => {
  await page.evaluate(P => {
    const t = todayStr(), d = getDay(t);
    d.meals.lunch.push({ name: P, grams: 100, kcal: 100, p: 1, c: 1, f: 1, code: P });
    d.workouts.push({ type: 'course', time: 30, distance: 5, intensite: 2, note: P });
    saveData(t);
    musculationProgrammes.push({ id: 'p' + P, nom: P, exercices: [{ exerciceId: 'x' + P, nom: P, tempo: P, plage: P, series: [{ poids: P, reps: P }] }], maj: Date.now() });
    musculationHistorique.unshift({ id: 'h' + P, programmeId: 'p' + P, programmeNom: P, date: t, debut: Date.now() - 3e6, fin: Date.now(), dureeMin: 50, notes: P, maj: Date.now(),
      exercices: [{ exerciceId: toutesLesExercices()[0].id, nom: P, notes: P, tempo: P, series: [{ poids: 80, reps: 8, fait: true, technique: P, rir: P }] }] });
  }, P);
  const etapes = [
    () => { allerA('repas'); renderApp(); },
    () => { allerA('seance'); choisirModeSeance('muscu'); renderSeance(); },
    () => choisirModeSeance('cardio'),
    () => { allerA('stats'); ['poids', 'nutrition', 'activite', 'muscu'].forEach(o => choisirOngletStats(o)); },
    () => voirDetailHistorique(musculationHistorique[0].id),
    () => ouvrirEditionProgramme(musculationProgrammes[0].id),
    () => { document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show')); allerA('seance'); demarrerSeance(musculationProgrammes[0].id); renderSessionModal(); }
  ];
  for (const etape of etapes) {
    await page.evaluate(`(${etape.toString()})()`);
    await page.waitForTimeout(200);
    assert.equal(await injectionsTrouvees(page), 0, 'code injecté exécuté après : ' + etape.toString());
  }
}));

test("Repas du jour allégé : idées dans « Recette », pas dans Activité, bilan de la journée dans sa fenêtre", () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    const j = getDay(todayStr());
    j.meals[MEALS[0]].push({ name: "Flocons d'avoine", grams: 80, kcal: 300, p: 10, c: 50, f: 6 });
    saveData(todayStr()); allerA('repas'); renderApp();
  });
  const r = await page.evaluate(() => ({
    idees: !!document.querySelector('#ecran-repas [onclick*="chercherRecettesMacros"]'),
    ideesDansRecette: !!document.querySelector('#feuille-choix-recette [onclick*="chercherRecettesMacros"]'),
    pasDansActivite: getComputedStyle(document.getElementById('carte-pas-seances')).display !== 'none' || !document.querySelector('#ecran-repas #carte-stats-pas'),
    bilanDansNutrition: !!document.querySelector('#depense-modal #carte-bilan-jour'),
    bilanDansRepas: !!document.querySelector('#ecran-repas #carte-bilan-jour'),
    vides: document.querySelectorAll('#meals-container .meal-card--vide').length,
    listesVides: document.querySelectorAll('#meals-container .meal-card--vide .food-list').length,
    macrosAliment: getComputedStyle(document.querySelector('#ecran-repas .food-macros')).display,
    pct: !!document.getElementById('pct-p')
  }));
  assert.deepEqual(r, { idees: false, ideesDansRecette: true, pasDansActivite: false, bilanDansNutrition: true, bilanDansRepas: false, vides: 3, listesVides: 0, macrosAliment: 'none', pct: false });
  // Eau (dans la roulette) : la gourde à gauche de la quantité, les cinq boutons sur une ligne dessous.
  const eau = await page.evaluate(() => {
    const r = s => document.querySelector('#bloc-eau ' + s).getBoundingClientRect(), g = r('.gourde'), q = r('.eau-texte'), b = r('.eau-boutons');
    const hauts = new Set([...document.querySelectorAll('#bloc-eau .eau-boutons .btn-icone')].map(x => Math.round(x.getBoundingClientRect().top)));
    return q.left > g.right - 1 && q.top < g.bottom && b.top > g.bottom - 1 && hauts.size === 1;
  });
  assert.ok(eau);
  // Toucher un aliment ouvre sa fenêtre (poids et macros).
  await page.click('#ecran-repas .food-info');
  assert.ok(await page.evaluate(() => document.getElementById('macros-popup-modal').classList.contains('show')));
}));

test('tout aliment ajouté part en validation dans la base, sauf s\'il y est déjà', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    // Fausse base : aliments partagés + base d'aliments, avec les requêtes réellement faites.
    const T = confSupabase().table;
    const db = { aliments_partages: [], [T]: [{ id: 1, nom: 'Pomme', code_barre: '999' }] };
    const envoyes = [];
    const requete = table => {
      const filtres = []; let ligne = null;
      const b = {
        select: () => b, limit: () => b, single: () => b,
        ilike: (c, v) => { filtres.push(x => String(x[c] || '').toLowerCase() === v.replace(/\\(.)/g, '$1').toLowerCase()); return b; },
        eq: (c, v) => { filtres.push(x => String(x[c]) === String(v)); return b; },
        insert: l => { ligne = l; return b; },
        then: (ok, ko) => {
          if (ligne) { (db[table] = db[table] || []).push(ligne); envoyes.push(ligne); return Promise.resolve({ data: ligne, error: null }).then(ok, ko); }
          return Promise.resolve({ data: (db[table] || []).filter(x => filtres.every(f => f(x))), error: null }).then(ok, ko);
        }
      };
      return b;
    };
    supa = { from: requete };
    sessionUtilisateur = { id: 'u1', email: 'membre@x.fr' };
    detecterSchemaAliments = async () => ({ vide: false, nom: 'nom', codeBarre: 'code_barre', cle: 'id' });
    const attendre = () => new Promise(res => setTimeout(res, 50));
    activeMealId = 'lunch';
    // 1) Produit scanné (OpenFoodFacts) : envoyé, en attente de validation.
    currentScannedFood = { name: 'Skyr nature', code: '123', kcal100: 60, p100: 10, c100: 4, f100: 0.2, unite: 'g', source: 'OpenFoodFacts' };
    document.getElementById('barcode-grams').value = 150;
    ajouterAlimentBarcode(); await attendre();
    // 2) Le même rescanné : pas de doublon.
    ajouterAlimentBarcode(); await attendre();
    // 3) Produit scanné déjà dans la base d'aliments (même code-barres) : rien.
    currentScannedFood = { name: 'Pomme Gala', code: '999', kcal100: 52, p100: 0.3, c100: 14, f100: 0.2, unite: 'g', source: 'OpenFoodFacts' };
    ajouterAlimentBarcode(); await attendre();
    // 4) Repris de « Déjà mangé » et absent de la base : envoyé.
    addItemToMeal('lunch', { name: 'Galette maison', grams: 100, kcal: 200, p: 5, c: 30, f: 6 }, { source: 'historique' }); await attendre();
    // 5) Pris tel quel dans notre base : rien.
    addItemToMeal('lunch', { name: 'Riz', grams: 100, kcal: 130, p: 3, c: 28, f: 0 }, { partager: false }); await attendre();
    return envoyes.map(e => [e.nom, e.code_barre, e.source, e.kcal100, 'valide' in e]);
  });
  assert.deepEqual(r, [['Skyr nature', '123', 'scan', 60, false], ['Galette maison', '', 'historique', 200, false]]);
}));

test("scan : un produit déjà dans notre base s'affiche sous notre nom, pas celui d'OpenFoodFacts", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const db = { aliments_partages: [{ nom: "Kok'o - oeufs dur", kcal100: 132, p100: 12, c100: 1, f100: 9, code_barre: '5413828000650', valide: false, createur_id: 'u1', supprime: false }] };
    const requete = table => {
      const filtres = [];
      const b = { select: () => b, limit: () => b, eq: (c, v) => { filtres.push(x => String(x[c]) === String(v)); return b; },
        then: (ok, ko) => Promise.resolve({ data: (db[table] || []).filter(x => filtres.every(f => f(x))), error: null }).then(ok, ko) };
      return b;
    };
    supa = { from: requete };
    sessionUtilisateur = { id: 'u1', email: 'membre@x.fr' };
    detecterSchemaAliments = async () => null;
    let appelsOFF = 0;
    const fetchOrigine = window.fetch;
    window.fetch = async url => { appelsOFF++; return { json: async () => ({ status: 1, product: { product_name: 'Kok\'o handgekookte gepelde eieren', brands: 'Kok\'o', nutriments: { 'energy-kcal_100g': 132 } } }) }; };
    const lire = () => [document.getElementById('barcode-name').value, (document.getElementById('barcode-source') || {}).textContent];
    // 1) Dans notre base (en attente, créé par moi) : notre nom, sans OpenFoodFacts.
    await chercherProduitOFFParCode('5413828000650');
    const a = [lire(), appelsOFF, currentScannedFood.dansNotreBase];
    // 2) Pas dans notre base mais déjà renommé chez nous : OpenFoodFacts, sous notre nom.
    db.aliments_partages = [];
    nomsParCode['5413828000650'] = 'Oeufs durs maison';
    await chercherProduitOFFParCode('5413828000650');
    const b = [lire(), appelsOFF, !!currentScannedFood.dansNotreBase];
    window.fetch = fetchOrigine;
    return { a, b };
  });
  assert.deepEqual(r.a, [["Kok'o - oeufs dur", 'Trouvé dans : ta base'], 0, true]);
  assert.deepEqual(r.b, [['Oeufs durs maison', 'Trouvé dans : OpenFoodFacts'], 1, false]);
}));

test("Administration : les doublons d'aliments sont fusionnés au lieu d'apparaître deux fois", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const T = confSupabase().table;
    const att = (id, nom, code_barre, cree_le) => ({ id, nom, code_barre, cree_le, valide: false, supprime: false });
    const db = {
      aliments_partages: [
        att('A', 'Skyr nature', '123', '2026-10-01'), att('B', 'Skyr Nature', '', '2026-10-02'),          // même nom
        att('C', 'Galette', '555', '2026-10-01'), att('D', 'Galette maison', '555', '2026-10-03'),       // même code-barres
        att('E', "Kok'o", '777', '2026-10-04'),                                                          // déjà validé
        { id: 'F', nom: "Kok'o - oeufs dur", code_barre: '777', cree_le: '2026-09-01', valide: true, supprime: false },
        att('G', 'Pomme', '999', '2026-10-05'),                                                          // déjà dans la base d'aliments
        att('H', 'Unique', '', '2026-10-05'),                                                            // seul : gardé
        att('I', 'Wrap', '', '2026-10-01'), att('J', 'wrap', '42', '2026-10-02')                         // le gardé récupère le code
      ],
      [T]: [{ id: 1, nom: 'Pomme Gala', code_barre: '999' }]
    };
    const majs = [];
    const requete = table => {
      const filtres = []; let maj = null;
      const b = {
        select: () => b, limit: () => b, or: () => b,
        eq: (c, v) => { filtres.push(x => String(x[c]) === String(v)); return b; },
        in: (c, vals) => { filtres.push(x => vals.map(String).includes(String(x[c]))); return b; },
        update: v => { maj = v; return b; },
        then: (ok, ko) => {
          const lignes = (db[table] || []).filter(x => filtres.every(f => f(x)));
          if (maj) { lignes.forEach(x => Object.assign(x, maj)); majs.push([lignes.map(x => x.id).sort().join(','), Object.keys(maj).join(',')]); }
          return Promise.resolve({ data: maj ? null : lignes, error: null }).then(ok, ko);
        }
      };
      return b;
    };
    supa = { from: requete, rpc: async () => ({ data: null, error: null }) };
    sessionUtilisateur = { id: 'admin', email: ADMIN_EMAIL };
    detecterSchemaAliments = async () => ({ vide: false, nom: 'nom', codeBarre: 'code_barre', cle: 'id' });
    const n = await fusionnerDoublonsAliments(true);
    const restants = db.aliments_partages.filter(a => !a.supprime).map(a => a.id + (a.code_barre ? ':' + a.code_barre : '')).sort();
    return { n, restants, majs, parQui: db.aliments_partages.find(a => a.id === 'B').supprime_par };
  });
  assert.equal(r.n, 5);
  assert.deepEqual(r.restants, ['A:123', 'C:555', 'F:777', 'H', 'I:42']);
  assert.deepEqual(r.majs, [['B,D,E,G,J', 'supprime,supprime_par,supprime_le'], ['I', 'code_barre']]);
  assert.match(r.parQui, /^fusion/);
}));

test('Repas du jour refait : anneaux, semaine, série de jours, coach', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const t = todayStr();
    [-2, -1, 0].forEach(k => { const d = shiftDate(t, k); getDay(d).meals[MEALS[0]].push({ name: 'Skyr', grams: 150, kcal: 600, p: 20, c: 60, f: 10 }); saveData(d); });
    allerA('repas'); renderApp();
    const cible = computeTargets(getDay(t), t).target;
    const a = document.getElementById('anneau-kcal'), tour = 2 * Math.PI * 72;
    const part = 1 - parseFloat(a.style.strokeDashoffset) / tour;
    const res = { part: Math.round(part * 100), attendu: Math.round(600 / cible * 100), trop: a.getAttribute('stroke'),
      jours: document.querySelectorAll('#semaine-jours .semaine-jour:not(.futur)').length, actif: document.querySelector('#semaine-jours .semaine-jour.actif b').textContent,
      dernier: [...document.querySelectorAll('#semaine-jours .semaine-jour:not(.futur)')].pop().dataset.date === t,
      futurs: [...document.querySelectorAll('#semaine-jours .semaine-jour.futur')].map(b => [b.dataset.date > t, b.disabled, b.getAttribute('aria-hidden')].join()),
      // Dernier jour : le dimanche de la semaine, ou aujourd'hui + 3 si c'est plus tard.
      dernierFutur: [...document.querySelectorAll('#semaine-jours .semaine-jour')].pop().dataset.date === [shiftDate(t, (7 - new Date(t + 'T12:00:00').getDay()) % 7), shiftDate(t, 3)].sort().pop(),
      serie: document.getElementById('serie-jours').textContent.trim(), coach: document.getElementById('coach-jour').textContent };
    // Dépassement : l'anneau passe à l'orange-rouge.
    getDay(t).meals[MEALS[1]].push({ name: 'Pizza', grams: 600, kcal: cible, p: 60, c: 200, f: 80 }); saveData(t); renderApp();
    res.tropApres = a.getAttribute('stroke'); res.libelle = document.getElementById('reste-libelle').textContent;
    return res;
  });
  assert.equal(r.part, r.attendu);
  assert.equal(r.trop, 'url(#grad-kcal)');
  // Roulette : 180 jours d'historique jusqu'à aujourd'hui, aujourd'hui au centre ; les jours
  // à venir de la semaine (3 au moins) suivent, grisés et inactifs, jusqu'au dimanche (au-delà s'il en manque).
  assert.equal(r.jours, 181);
  assert.equal(r.dernier, true);
  assert.ok(r.futurs.length >= 3 && r.futurs.length <= 9, String(r.futurs.length));
  assert.ok(r.futurs.every(f => f === 'true,true,true'), r.futurs.join(' '));
  assert.equal(r.dernierFutur, true);
  assert.equal(r.actif, String(new Date().getDate()));
  assert.equal(r.serie, '3');
  assert.match(r.coach, /Coach du jour/);
  assert.equal(r.tropApres, 'url(#grad-kcal-trop)');
  assert.equal(r.libelle, 'Dépassement');
  // Toucher hier : la roulette tourne jusqu'à hier, qui devient le jour affiché.
  await page.click(`#semaine-jours .semaine-jour[data-date="${await page.evaluate(() => shiftDate(todayStr(), -1))}"]`);
  await page.waitForFunction(() => currentDate === shiftDate(todayStr(), -1), null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => document.querySelector('#semaine-jours .semaine-jour.actif').dataset.date), await page.evaluate(() => currentDate));
  // Faire défiler de 5 jours vers le passé : le jour qui s'arrête au centre s'affiche.
  await page.evaluate(() => { const c = document.getElementById('semaine-jours'); rouletteGeste = true; c.scrollLeft -= c.getBoundingClientRect().width / 7 * 5; });
  await page.waitForFunction(() => currentDate === shiftDate(todayStr(), -6), null, { timeout: 3000 });
  // « Aujourd'hui » ramène la roulette au bout.
  await page.click('#semaine-aujourdhui');
  await page.waitForFunction(() => currentDate === todayStr(), null, { timeout: 3000 });
}));

test("Coach du jour : suit l'eau bue, l'heure qui passe et le nouveau jour, sans recharger", () => avecAppli({}, async ({ page }) => {
  const etat = () => page.evaluate(() => ({ coach: document.querySelector('#coach-jour p').textContent, salut: document.getElementById('salut-nom').textContent, jour: currentDate }));
  // 17 h, la journée presque complète mais presque rien bu : le coach demande de boire.
  await page.clock.setFixedTime(new Date('2026-10-27T17:00:00'));
  await page.evaluate(() => {
    currentDate = todayStr();
    const day = getDay(currentDate), t = computeTargets(day, currentDate);
    day.meals[MEALS[1]].push({ name: 'Repas', grams: 100, kcal: t.target * 0.95, p: t.protein, c: t.carbs, f: t.fat });
    day.eauMl = 250; saveData(currentDate);
    allerA('repas'); renderApp();
  });
  assert.match((await etat()).coach, /Pense à boire/);
  // Boire : le conseil change aussitôt (avant, il fallait rouvrir l'appli).
  await page.evaluate(() => ajouterEau(3000));
  assert.match((await etat()).coach, /Objectif presque atteint/);
  // 19 h, l'appli restée ouverte : la minuterie de chaque minute voit l'heure changer.
  await page.clock.setFixedTime(new Date('2026-10-27T19:00:00'));
  await page.evaluate(() => suivreHeureCoach());
  assert.match((await etat()).salut, /^Bonsoir/);
  // Le lendemain matin, retour dans l'appli : elle passe au nouveau jour, conseil du matin.
  await page.clock.setFixedTime(new Date('2026-10-28T08:00:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const matin = await etat();
  assert.equal(matin.jour, '2026-10-28');
  assert.match(matin.coach, /Aujourd'hui\s:\s[\d\s]+\skcal/);
  assert.match(matin.salut, /^Bonjour/);
  // Toujours rien de noté à 11 h 30 : le conseil suit l'heure.
  await page.clock.setFixedTime(new Date('2026-10-28T11:30:00'));
  await page.evaluate(() => suivreHeureCoach());
  assert.match((await etat()).coach, /Rien de noté/);
}));

test('Coach du jour : sans recette qui convienne, une idée de protéines différente chaque jour, pour le repas à venir, et pas avant d\'être en retard', () => avecAppli({}, async ({ page }) => {
  // Trois semaines de blanc de poulet presque tous les soirs, du skyr le matin, et une fois du thon, des œufs, des crevettes.
  // Aucune recette disponible : le coach propose des aliments.
  await page.clock.setFixedTime(new Date('2026-10-27T08:00:00'));
  await page.evaluate(() => {
    recettesAskesisCache = [];
    for (let k = 1; k <= 20; k++) {
      const d = shiftDate(todayStr(), -k), j = getDay(d);
      j.meals.dinner.push({ name: 'Blanc de poulet', grams: 150, kcal: 165, p: 35, c: 0, f: 3 });
      j.meals.breakfast.push({ name: 'Skyr', grams: 150, kcal: 90, p: 15, c: 6, f: 0 });
      if (k === 3) j.meals.lunch.push({ name: 'Thon au naturel', grams: 100, kcal: 110, p: 26, c: 0, f: 1 });
      if (k === 5) j.meals.breakfast.push({ name: 'Oeufs brouillés', grams: 120, kcal: 180, p: 14, c: 1, f: 13 });
      if (k === 8) j.meals.dinner.push({ name: 'Crevettes', grams: 150, kcal: 150, p: 32, c: 0, f: 2 });
      saveData(d);
    }
    invaliderHistorique();
  });
  // Le coach à une date et une heure données, avec les repas de ce jour-là ([repas, aliment] ou une part des protéines visées).
  const coach = async (quand, repas) => {
    await page.clock.setFixedTime(new Date(quand));
    return page.evaluate(repas => {
      currentDate = todayStr();
      const day = getDay(currentDate), cible = computeTargets(day, currentDate).protein;
      MEALS.forEach(m => { day.meals[m] = []; });
      repas.forEach(([m, it]) => day.meals[m].push(Object.assign({}, it, it.partP != null ? { p: Math.round(cible * it.partP) } : {})));
      saveData(currentDate);
      allerA('repas'); renderApp();
      return document.querySelector('#coach-jour p').textContent;
    }, repas);
  };
  const pates = ['lunch', { name: 'Pâtes bolognaise', grams: 350, kcal: 600, p: 20, c: 90, f: 15 }];
  const soirs = [];
  for (const d of ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) soirs.push(await coach(d + 'T19:00:00', [pates]));
  soirs.forEach(m => assert.match(m, /^Il te manque \d+\sg de protéines, il te reste [\d\s]+\skcal\. Pour ce soir\s:\s.+ \((.+,\s)?\+\d+\sg\)/, m));
  assert.ok(soirs.every(m => !/\(\S*[ ]/.test(m.split(/Pour ce soir\s:\s/)[1].replace(/\) et /g, ')'))), 'parenthèses insécables');
  const idees = soirs.map(m => m.split(/Pour ce soir\s:\s/)[1].split(').')[0].split(' et ').map(x => x.split(' (')[0]));
  const premieres = idees.map(i => i[0]);
  // Cinq familles possibles le soir (ton poulet, poisson, œufs, crevettes, légumineuses) : une par soir.
  assert.equal(new Set(premieres).size, 5, 'une idée différente chaque soir : ' + premieres.join(' | '));
  // Et l'idée en plus d'un soir n'est pas la première du lendemain.
  idees.slice(1).forEach((i, n) => assert.ok(!idees[n].includes(i[0]), 'deux soirs de suite : ' + idees.map(x => x.join(' + ')).join(' | ')));
  assert.ok(idees.flat().includes('Blanc de poulet'), 'ton blanc de poulet reste dans le lot : ' + idees.map(x => x.join(' + ')).join(' | '));
  assert.ok(soirs.every(m => !/Skyr|whey/.test(m)), 'pas d\'idée de petit-déjeuner le soir');
  // Du thon déjà mangé à midi : pas de poisson ce soir.
  const apresThon = await coach('2026-11-02T19:00:00', [['lunch', { name: 'Thon au naturel', grams: 140, kcal: 160, p: 36, c: 0, f: 1 }]]);
  assert.match(apresThon, /Pour ce soir\s:\s/);
  assert.doesNotMatch(apresThon, /Thon/);
  // Midi, la moitié des protéines déjà prises au petit-déjeuner : dans le rythme, pas de reproche.
  assert.match(await coach('2026-11-01T12:00:00', [['breakfast', { name: 'Omelette', grams: 300, kcal: 500, partP: 0.5, c: 5, f: 30 }]]), /^Bon rythme\s:\s\d+\sg de protéines déjà\./);
  // Midi avec presque rien : une idée pour midi ; déjà déjeuné à 13 h : une idée pour la collation.
  assert.match(await coach('2026-11-01T12:00:00', [['breakfast', { name: 'Croissant', grams: 60, kcal: 250, p: 5, c: 28, f: 13 }]]), /Pour midi\s:\s/);
  assert.match(await coach('2026-11-01T13:00:00', [pates]), /Pour la collation\s:\s/);
  // Du poulet noté une fois en collation ne devient pas une idée de collation.
  const collation = await page.evaluate(() => {
    const d = shiftDate(todayStr(), -2); getDay(d).meals.snack.push({ name: 'Blanc de poulet', grams: 150, kcal: 165, p: 35, c: 0, f: 3 }); saveData(d); invaliderHistorique();
    return ideesProteines({ meals: {} }, 'snack', 1500, 100).map(i => i.nom);
  });
  assert.ok(!collation.includes('Blanc de poulet'), collation.join(' | '));
  // Jamais de whey proposé à qui n'en a jamais noté ; les lentilles, si.
  assert.doesNotMatch(await coach('2026-11-01T16:00:00', [pates]), /whey/);
  const neuf = await page.evaluate(() => { appData = {}; invaliderHistorique(); return ideesProteines({ meals: {} }, 'dinner', 1500, 100).map(i => i.nom); });
  assert.deepEqual(neuf, ['Lentilles'], 'compte neuf : ni viande, ni poisson, ni fruits de mer');
}));

test('Coach du jour : une analyse complète (programme, séance et record, récupération, reprise, poids, eau), ses actions et son écriture', () => avecAppli({}, async ({ page }) => {
  // Les constats du coach : [clé, texte sans balises, action].
  const analyse = () => page.evaluate(() => {
    currentDate = todayStr();
    const d = getDay(currentDate);
    return analyseCoach(d, sumMeals(d), computeTargets(d, currentDate)).map(c => [c.cle, c.texte.replace(/<[^>]+>/g, ''), c.action ? c.action.libelle : null]);
  });
  const constat = (liste, cle) => (liste.find(c => c[0] === cle) || [])[1] || '';
  const le = async (quand, prep) => { await page.clock.setFixedTime(new Date(quand)); if (prep) await page.evaluate(prep); return analyse(); };
  await page.evaluate(() => {
    const exos = toutesLesExercices();
    window.__pecs = exos.filter(e => e.groupe === 'pectoraux').slice(0, 2);
    window.__quads = exos.filter(e => e.groupe === 'quadriceps').slice(0, 2);
    // D'autres exercices de quadriceps que ceux de « Bas » : une vraie séance libre, pas le programme.
    window.__quadsLibres = exos.filter(e => e.groupe === 'quadriceps').slice(2, 4);
    const prog = (id, nom, liste) => ({ id, nom, maj: Date.now(), exercices: liste.map(e => ({ exerciceId: e.id, nom: e.nom, series: [{ poids: 40, reps: 10 }, { poids: 40, reps: 10 }, { poids: 40, reps: 10 }] })) });
    musculationProgrammes.push(prog('pa', 'Haut', window.__pecs), prog('pb', 'Bas', window.__quads));
    window.__seance = (date, programmeId, exos, poids) => {
      musculationHistorique.push({ id: 'h' + date + programmeId, programmeId, programmeNom: programmeId, date, debut: Date.now() - 3e6, fin: Date.now(), dureeMin: 48, maj: Date.now(),
        exercices: exos.map(e => ({ exerciceId: e.id, nom: e.nom, series: [0, 1, 2].map(() => ({ poids, reps: 8, fait: true })) })) });
      sauvegarderHistorique();
    };
  });

  // Mercredi 8 h, rien de noté, jamais pesé : le plan du jour, la séance « Haut » ; la pesée dans l'analyse.
  const matin = await le('2026-11-04T08:00:00');
  assert.equal(matin[0][0], 'vide');
  assert.match(matin[0][1], /Aujourd'hui\s:\s[\d\s]+\skcal dont \d+\sg de protéines, et ta séance Haut \(pectoraux/);
  assert.match(matin[0][1], /Petit-déjeuner protéiné\s:\s.+ \(1\sportion,\s\d+\skcal,\s\+\d+\sg\)\.$/);
  assert.equal(matin[0][2], 'Voir la recette');
  assert.match(constat(matin, 'seance'), /^Ta prochaine séance\s:\sHaut/);
  assert.match(constat(matin, 'pesee'), /Pèse-toi un matin, à jeun/);
  // La carte : le constat principal, son action, et l'analyse complète repliée puis dépliée.
  const carte = await page.evaluate(() => {
    allerA('repas'); renderApp();
    const c = document.getElementById('coach-jour');
    const avant = [c.querySelector('.coach-analyse').hidden, c.querySelector('.coach-plus').getAttribute('aria-expanded')];
    c.querySelector('.coach-plus').click();
    return { texte: c.querySelector('p').textContent, action: c.querySelector('.coach-actions button').textContent, avant,
      apres: [c.querySelector('.coach-analyse').hidden, c.querySelector('.coach-plus').getAttribute('aria-expanded'), c.querySelector('.coach-plus').textContent],
      points: c.querySelectorAll('.coach-analyse li').length };
  });
  assert.equal(carte.texte, matin[0][1]);
  assert.equal(carte.action, 'Voir la recette');
  assert.deepEqual(carte.avant, [true, 'false']);
  assert.deepEqual(carte.apres.slice(0, 2), [false, 'true']);
  assert.match(carte.apres[2], /^Masquer l'analyse/);
  assert.equal(carte.points, matin.length - 1);
  await page.evaluate(() => basculerAnalyseCoach());

  // Le soir, séance « Haut » faite avec un record (60 kg contre 50 la semaine d'avant), journée bien remplie.
  const soir = await le('2026-11-04T18:00:00', () => {
    window.__seance('2026-10-28', 'pa', window.__pecs, 50);
    window.__seance('2026-11-04', 'pa', window.__pecs, 60);
    const j = getDay(todayStr()), t = computeTargets(j, todayStr());
    j.meals.lunch = [{ name: 'Repas', grams: 500, kcal: Math.round(t.target * 0.6), p: t.protein, c: 100, f: 20 }];
    j.eauMl = quotaEauSuggere(todayStr()); saveData(todayStr());
  });
  assert.equal(soir[0][0], 'seance-faite');
  assert.match(soir[0][1], /^(Belle séance|Bien joué|Séance validée)\s:\s6 séries en 48\smin \(pectoraux/);
  assert.match(soir[0][1], /Nouveau record\s:\s.+ \(60\skg × 8\)/);

  // Jeudi 10 h : la veille, une séance libre a chargé les quadriceps ; la prochaine du programme (« Bas ») attendra.
  const jeudi = await le('2026-11-05T10:00:00', () => {
    window.__seance('2026-11-04', 'libre', window.__quadsLibres, 80);
    const j = getDay(todayStr()), t = computeTargets(j, todayStr());
    j.meals.breakfast = [{ name: 'Omelette', grams: 300, kcal: 500, p: Math.round(t.protein * 0.4), c: 5, f: 30 }]; saveData(todayStr());
  });
  assert.equal(jeudi[0][0], 'recuperation');
  assert.match(jeudi[0][1], /^Tes quadriceps ont beaucoup travaillé hier\. Si tu les sens encore, ta séance Bas peut attendre demain/);
  assert.equal(jeudi[0][2], 'Voir la séance Bas');

  // Une semaine plus tard, plus rien depuis : la reprise. Pesées en baisse de 0,5 kg par semaine, objectif 80 kg.
  const reprise = await le('2026-11-12T10:00:00', () => {
    for (let k = 35; k >= 1; k--) { const d = shiftDate(todayStr(), -k); getDay(d).weight = Math.round((85 - (35 - k) * 0.5 / 7) * 10) / 10; saveData(d); }
    userProfile.poidsVise = 80;
    [-2, -1].forEach(k => { const d = shiftDate(todayStr(), k); getDay(d).eauMl = 2000; saveData(d); });
    const j = getDay(todayStr()), t = computeTargets(j, todayStr());
    j.meals.breakfast = [{ name: 'Omelette', grams: 300, kcal: 500, p: Math.round(t.protein * 0.4), c: 5, f: 30 }]; saveData(todayStr());
  });
  assert.equal(reprise[0][0], 'reprise');
  assert.match(reprise[0][1], /^Ça fait 8 jours sans séance\..+ta prochaine, c'est Bas\./);
  assert.match(constat(reprise, 'poids'), /^Tu perds 0,5\skg par semaine.+À ce rythme, 80\skg vers le \d+ \S+\./);
  assert.equal(constat(reprise, 'pesee'), '', 'pesé hier : pas de rappel');
  // Typographie française : jamais une espace sécable avant « : ; ! ? » (un deux-points ne commence jamais une ligne).
  [...matin, ...soir, ...jeudi, ...reprise].forEach(c => assert.doesNotMatch(c[1], / [:;!?]/, c[1]));
  // Midi : qui note son eau d'habitude est relancé au rythme de la journée ; le bouton ajoute 250 ml.
  const midi = await le('2026-11-12T12:00:00');
  assert.match(constat(midi, 'eau'), /^Pense à boire\s:\s0\sL sur/);
  const eau = await page.evaluate(() => {
    allerA('repas'); renderApp();
    [...document.querySelectorAll('#coach-jour .coach-action')].find(b => b.textContent === '+250 ml d\'eau').click();
    return getDay(todayStr()).eauMl;
  });
  assert.equal(eau, 250);

  // Données piégées : un nom de programme reste du texte.
  await page.evaluate(() => { musculationProgrammes.find(p => p.id === 'pb').nom = '<img src=x onerror="window.__xss=1">'; allerA('repas'); renderApp(); });
  assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('#coach-jour img').length, window.__xss || null]), [0, null]);

  // Sans mouvement réduit : trois points, puis le message s'écrit mot à mot ; un redessin pendant l'écriture ne la coupe pas.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.setFixedTime(new Date('2026-11-12T19:00:00'));
  const ecrit = await page.evaluate(async () => {
    const j = getDay(todayStr());
    j.meals.lunch = [{ name: 'Pâtes', grams: 300, kcal: 600, p: 15, c: 110, f: 8 }]; saveData(todayStr());
    renderApp();
    const p = () => document.querySelector('#coach-jour .coach-texte');
    const pense = !!p().querySelector('.coach-pense');
    renderApp();
    const toujours = !!p().querySelector('.coach-pense');
    await new Promise(ok => setTimeout(ok, 1200));
    const mots = p().querySelectorAll('.cm').length;
    // L'écriture finie, plus aucun mot animé : rien ne peut rester flou ou à moitié affiché.
    await new Promise(ok => setTimeout(ok, 1600));
    return { pense, toujours, mots, apres: p().querySelectorAll('.cm').length, texte: p().textContent };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(ecrit.pense, true);
  assert.equal(ecrit.toujours, true, 'le redessin garde l\'écriture en cours');
  assert.ok(ecrit.mots > 5, String(ecrit.mots));
  assert.equal(ecrit.apres, 0, 'texte simple une fois écrit');
  assert.match(ecrit.texte, /^Il te manque/);
}));

test('Séances prévues : la séance du soir comptée dès le matin, remplacée par la vraie, jamais un jour passé, un jour de repos ou une pause', () => avecAppli({}, async ({ page }) => {
  // Six semaines de séances le lundi, le mercredi et le vendredi vers 19 h, en tournant entre trois programmes.
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
  await page.evaluate(() => {
    const exos = toutesLesExercices().slice(0, 5);
    const prog = (id, nom, n) => ({ id, nom, maj: Date.now(), exercices: exos.slice(0, n).map(e => ({ exerciceId: e.id, nom: e.nom, series: [0, 1, 2, 3].map(() => ({ poids: 40, reps: 10 })) })) });
    musculationProgrammes.push(prog('pa', 'Push', 5), prog('pb', 'Pull', 4), prog('pc', 'Jambes', 3));
    const auj = todayStr();
    let k = 0;
    for (let d = shiftDate(auj, -42); d < auj; d = shiftDate(d, 1)) {
      if (![1, 3, 5].includes(dateLocale(d).getDay())) continue;
      const p = musculationProgrammes[k++ % 3], debut = new Date(d + 'T19:05:00').getTime();
      musculationHistorique.unshift({ id: 'h' + k, programmeId: p.id, programmeNom: p.nom, date: d, debut, fin: debut + 3600e3, dureeMin: 60, maj: debut,
        exercices: p.exercices.map(e => ({ exerciceId: e.exerciceId, nom: e.nom, series: e.series.map(() => ({ poids: 40, reps: 10, fait: true })) })) });
      getDay(d).workouts.push({ type: 'musculation', time: 60, seriesFaites: p.exercices.length * 4, source: 'seance', nom: p.nom });
    }
    sauvegarderHistorique(); saveData();
  });
  // L'état du jour : la séance prévue, l'objectif avec et sans elle, la ligne sous « Il te reste », le coach.
  const etat = () => page.evaluate(() => {
    currentDate = todayStr(); allerA('repas'); renderApp();
    const j = getDay(currentDate), t = computeTargets(j, currentDate);
    const sauve = userProfile.seancesPrevues;
    userProfile.seancesPrevues = { mode: 'off' };
    const sans = computeTargets(j, currentDate).target;
    userProfile.seancesPrevues = sauve;
    const c = analyseCoach(j, sumMeals(j), t).map(x => [x.cle, x.texte.replace(/<[^>]+>/g, '')]);
    const heros = document.getElementById('seance-prevue-heros');
    const s = t.seancePrevue;
    return { prevue: s ? { nom: s.nom, kcal: s.kcal, series: s.series, moment: momentSeance(s), heure: heureSeanceTexte(s.heure) } : null, target: t.target, sans, prevueObjectif: t.prevueObjectif,
      attendu: programmeSuggere().p.nom, heros: heros.classList.contains('hidden') ? null : heros.textContent, coach: c,
      a_venir: prochainesSeances(7).map(x => [x.date, x.nom]) };
  });
  const constat = (e, cle) => (e.coach.find(c => c[0] === cle) || [])[1] || '';

  // Mercredi 9 h : la séance de ce soir est déjà dans l'objectif, avec la même formule que la vraie séance.
  const mer = await etat();
  assert.ok(mer.prevue, 'une séance prévue ce mercredi');
  assert.equal(mer.prevue.nom, mer.attendu, 'le programme qui suit dans la liste');
  assert.equal(mer.prevue.moment, 'ce soir');
  assert.equal(mer.prevue.heure, 'vers 19\u00a0h');
  const formule = await page.evaluate(s => { const p = dernierPoidsConnu(todayStr()); return Math.round(kcalSeance('musculation', 60, p, s, null, { bmr: metabolismeDeBase(p, todayStr()) })); }, mer.prevue.series);
  assert.equal(mer.prevue.kcal, formule);
  assert.ok(mer.prevue.kcal > 0);
  assert.equal(mer.target, mer.sans + mer.prevueObjectif, 'l\'objectif monte de la séance prévue');
  assert.match(mer.heros, /^\+\d+\skcal · séance ce soir$/);
  assert.match(constat(mer, 'seance'), new RegExp(`^Ce soir, ta séance ${mer.prevue.nom} \\(.+\\)\\s:\\s\\+${mer.prevueObjectif}\\skcal déjà dans ton objectif\\.`));
  assert.equal(constat(mer, 'seance-pas-faite'), '', 'le matin, pas de rappel');

  // En sèche avec peu de pas, l'objectif est relevé au métabolisme de base : la séance
  // prévue n'ajoute que ce qui dépasse ce plancher, jamais un chiffre faux.
  const plancher = await page.evaluate(() => {
    const j = getDay(todayStr()), avant = { goal: j.goal, steps: j.steps };
    j.goal = 'seche'; j.steps = 100;
    const t = computeTargets(j, todayStr());
    // « Ta journée » dit pourquoi l'objectif monte moins que la dépense.
    renderSeancesPrevues(); ouvrirDepense();
    const note = document.querySelector('#bloc-seances-prevues .sp-ligne--jour + .sp-note').textContent;
    fermerModal('depense-modal');
    const sauve = userProfile.seancesPrevues;
    userProfile.seancesPrevues = { mode: 'off' };
    const sans = computeTargets(j, todayStr());
    userProfile.seancesPrevues = sauve;
    if (avant.goal === undefined) delete j.goal; else j.goal = avant.goal;
    j.steps = avant.steps;
    return { target: t.target, sans: sans.target, sansPlancher: sans.sousPlancher, ajout: t.prevueObjectif, moins20: Math.round(t.prevueKcal * 0.8), depense: t.prevueKcal, bmr: t.bmr, note };
  });
  assert.equal(plancher.sansPlancher, true, 'sans la séance, la sèche passait sous le métabolisme de base');
  assert.equal(plancher.target, plancher.sans + plancher.ajout);
  assert.ok(plancher.ajout >= 0 && plancher.ajout < plancher.moins20, 'moins que la dépense −20 % : le plancher relevait déjà l\'objectif');
  const nb = n => n.toLocaleString('fr-FR');
  assert.ok(plancher.note.startsWith(plancher.ajout > 0 ? `Objectif +${nb(plancher.ajout)}\u00a0kcal seulement :` : 'Objectif inchangé'), plancher.note);
  assert.ok(plancher.note.includes(`il ne descend jamais sous ton métabolisme de base (${nb(plancher.bmr)}\u00a0kcal)`), plancher.note);
  // Les suivantes dans l'ordre des programmes : vendredi puis lundi.
  assert.deepEqual(mer.a_venir.map(x => x[0]), ['2026-11-04', '2026-11-06', '2026-11-09']);
  const ordre = await page.evaluate(() => musculationProgrammes.map(p => p.nom));
  const i = ordre.indexOf(mer.prevue.nom);
  assert.deepEqual(mer.a_venir.map(x => x[1]), [0, 1, 2].map(k => ordre[(i + k) % 3]));

  // « Ta journée » : la séance du jour, les suivantes, les jours repérés ; « Pas de séance aujourd'hui » la retire.
  const journee = await page.evaluate(() => {
    ouvrirDepense();
    const b = document.getElementById('bloc-seances-prevues');
    const res = { cache: b.classList.contains('hidden'), lignes: [...b.querySelectorAll('.sp-ligne')].map(l => l.querySelector('.sp-nom b').textContent + ' ' + l.querySelector('.sp-kcal').textContent),
      repere: b.querySelector('.sp-reperes').textContent, detail: document.getElementById('detail-depense').textContent };
    [...b.querySelectorAll('button')].find(x => x.textContent === "Pas de séance aujourd'hui").click();
    res.apres = { exception: userProfile.seancesPrevues.exceptions[todayStr()], prevue: !!computeTargets(getDay(todayStr()), todayStr()).seancePrevue,
      bouton: [...b.querySelectorAll('button')].map(x => x.textContent).includes("J'ai une séance aujourd'hui"), heros: document.getElementById('seance-prevue-heros').classList.contains('hidden') };
    [...b.querySelectorAll('button')].find(x => x.textContent === "J'ai une séance aujourd'hui").click();
    res.retour = { exceptions: userProfile.seancesPrevues.exceptions || null, prevue: !!computeTargets(getDay(todayStr()), todayStr()).seancePrevue };
    fermerModal('depense-modal');
    return res;
  });
  assert.equal(journee.cache, false);
  assert.equal(journee.lignes.length, 3);
  assert.match(journee.lignes[0], new RegExp(`^${mer.prevue.nom} \\+${mer.prevue.kcal}\\skcal$`));
  assert.match(journee.repere, /^Repérés sur tes 6 dernières semaines\s:\slundi \(Jambes\), mercredi \(Push\) et vendredi \(Pull\)\.$/);
  assert.match(journee.detail, new RegExp(`Séance prévue \\(${mer.prevue.nom}, estimée\\)\\+ ${mer.prevue.kcal} kcal`));
  assert.deepEqual(journee.apres, { exception: false, prevue: false, bouton: true, heros: true });
  assert.deepEqual(journee.retour, { exceptions: null, prevue: true }, 'revenir à la règle efface l\'exception');

  // Mercredi 21 h 30, toujours pas de séance : le coach propose de la retirer d'un geste.
  await page.clock.setFixedTime(new Date('2026-11-04T21:30:00'));
  const soir = await etat();
  assert.equal(constat(soir, 'seance'), '', 'plus de « Ce soir, ta séance… » à cette heure');
  assert.match(constat(soir, 'seance-pas-faite'), new RegExp(`^Ta séance ${soir.prevue.nom} n'est pas faite\\. Si tu ne la fais pas, retire-la\\s:\\sobjectif −${soir.prevueObjectif}\\skcal\\.$`));
  const retiree = await page.evaluate(() => {
    coachAnalyseOuverte = true; renderApp();
    const b = [...document.querySelectorAll('#coach-jour button')].find(x => x.textContent === "Pas de séance aujourd'hui");
    const avant = computeTargets(getDay(todayStr()), todayStr()).target;
    b.click();
    const t = computeTargets(getDay(todayStr()), todayStr());
    const r = { bouton: !!b, prevue: t.seancePrevue, baisse: avant - t.target, rappel: analyseCoach(getDay(todayStr()), sumMeals(getDay(todayStr())), t).some(c => c.cle === 'seance-pas-faite') };
    definirSeanceDuJour(true); coachAnalyseOuverte = false;
    return r;
  });
  assert.deepEqual(retiree, { bouton: true, prevue: null, baisse: soir.prevueObjectif, rappel: false });

  // Mercredi 21 h, la séance faite : sa vraie dépense remplace l'estimation.
  await page.clock.setFixedTime(new Date('2026-11-04T21:00:00'));
  const faite = await page.evaluate(() => {
    const j = getDay(todayStr());
    j.workouts.push({ type: 'musculation', time: 70, seriesFaites: 14, source: 'seance', nom: 'Push' }); saveData(todayStr());
    allerA('repas'); renderApp();
    const t = computeTargets(j, todayStr());
    return { prevue: t.seancePrevue, workout: t.workoutKcal, heros: document.getElementById('seance-prevue-heros').classList.contains('hidden') };
  });
  assert.equal(faite.prevue, null);
  assert.ok(faite.workout > 0);
  assert.equal(faite.heros, true);

  // Un jour passé n'a jamais de séance prévue, même un lundi sans séance.
  const passe = await page.evaluate(() => {
    const d = '2026-10-26';
    getDay(d).workouts = [];
    musculationHistorique.splice(0, musculationHistorique.length, ...musculationHistorique.filter(h => h.date !== d));
    return computeTargets(getDay(d), d).seancePrevue;
  });
  assert.equal(passe, null);

  // Jeudi : jour de repos, rien de prévu ; le coach annonce la prochaine.
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00'));
  const jeu = await etat();
  assert.equal(jeu.prevue, null);
  assert.equal(jeu.target, jeu.sans);
  assert.equal(jeu.heros, null);
  assert.match(constat(jeu, 'repos'), /^Jour de repos aujourd'hui\s:\sta prochaine séance, .+, est prévue demain soir\.$/);

  // Jours choisis (le jeudi en plus) puis aucun.
  const choisis = await page.evaluate(() => {
    choisirModeSeances('jours');
    const avant = userProfile.seancesPrevues.jours.slice();
    basculerJourSeance(4);
    const r = { avant, apres: userProfile.seancesPrevues.jours.slice(), prevue: !!computeTargets(getDay(todayStr()), todayStr()).seancePrevue };
    choisirModeSeances('off');
    r.off = prochainesSeances(7).length;
    choisirModeSeances('auto');
    return r;
  });
  assert.deepEqual(choisis.avant, [1, 3, 5], 'les jours choisis partent des jours repérés');
  assert.deepEqual(choisis.apres, [1, 3, 4, 5]);
  assert.equal(choisis.prevue, true);
  assert.equal(choisis.off, 0);

  // Deux semaines sans séance : c'est une pause, on ne prévoit plus rien.
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'));
  const pause = await page.evaluate(() => ({ jours: habitudesSeance().jours, pause: habitudesSeance().pause, prevues: prochainesSeances(7).length }));
  assert.deepEqual(pause, { jours: [], pause: true, prevues: 0 });
}));

test('Séances prévues : chaque jour son programme, appris de tes séances (séances libres et programmes recréés reconnus), et ton ordre réel plutôt que celui de ta liste', () => avecAppli({}, async ({ page }) => {
  // Un split fixe sur 6 semaines : lundi Pecs Triceps (en séance libre), mercredi Jambes, jeudi Épaules,
  // samedi matin Dos Biceps (un programme supprimé puis recréé). La liste, elle, est dans un autre ordre.
  // L'ancien calcul (le suivant dans la liste après la dernière séance reconnue, Épaules) annonçait Pecs Triceps mercredi.
  await page.clock.setFixedTime(new Date('2026-11-03T20:00:00'));
  const r = await page.evaluate(() => {
    // Des exercices de groupes distincts : aucun muscle n'est « fatigué » d'une séance à la suivante.
    const exos = toutesLesExercices(), de = (g, n) => exos.filter(e => e.groupe === g).slice(0, n);
    const prog = (id, nom, liste) => ({ id, nom, maj: Date.now(), exercices: liste.map(e => ({ exerciceId: e.id, nom: e.nom, series: [0, 1, 2].map(() => ({ poids: 40, reps: 10 })) })) });
    musculationProgrammes.push(prog('pt', 'Pecs Triceps', [...de('pectoraux', 2), ...de('triceps', 2)]), prog('db', 'Dos Biceps', [...de('dos', 2), ...de('biceps', 2)]),
      prog('jb', 'Jambes', [...de('quadriceps', 2), ...de('ischios', 2)]), prog('ep', 'Épaules', de('epaules', 4)));
    const plan = { 1: ['pt', null, 'Séance libre', 3, '19:00'], 3: ['jb', 'jb', 'Jambes', 4, '19:00'], 4: ['ep', 'ep', 'Épaules', 4, '19:00'], 6: ['db', 'ancien-db', 'Dos Biceps', 4, '10:30'] };
    const auj = todayStr();
    for (let d = shiftDate(auj, -42); d < auj; d = shiftDate(d, 1)) {
      const x = plan[dateLocale(d).getDay()];
      if (!x) continue;
      const [pid, programmeId, programmeNom, nbExos, heure] = x, p = musculationProgrammes.find(q => q.id === pid);
      const debut = new Date(d + 'T' + heure + ':00').getTime();
      musculationHistorique.unshift({ id: 'h' + d, programmeId, programmeNom, date: d, debut, fin: debut + 3600e3, dureeMin: 60, maj: debut,
        exercices: p.exercices.slice(0, nbExos).map(e => ({ exerciceId: e.exerciceId, nom: e.nom, series: e.series.map(() => ({ poids: 40, reps: 10, fait: true })) })) });
    }
    sauvegarderHistorique();
    currentDate = auj; allerA('repas'); renderApp();
    const j = getDay(auj), t = computeTargets(j, auj);
    const lundi = prochainesSeances(7).find(x => x.date === '2026-11-09');
    ouvrirDepense();
    const note = document.querySelector('#bloc-seances-prevues .sp-reperes').textContent;
    fermerModal('depense-modal');
    allerA('seance'); choisirModeSeance('muscu');
    const carte = document.querySelector('#vitrine-muscu .sdj');
    const carteMardi = [carte.querySelector('small').textContent, carte.querySelector('h4').textContent];
    allerA('repas');
    return {
      carteMardi,
      prevues: prochainesSeances(7).map(x => [x.date, x.nom, momentSeance(x)]),
      sdj: programmeSuggere().p.nom,
      repos: (analyseCoach(j, sumMeals(j), t).find(c => c.cle === 'repos') || {}).texte,
      note, lundi: [lundi.origine, lundi.nbBase, lundi.series]
    };
  });
  assert.deepEqual(r.prevues, [
    ['2026-11-04', 'Jambes', 'demain soir'], ['2026-11-05', 'Épaules', 'jeudi soir'],
    ['2026-11-07', 'Dos Biceps', 'samedi matin'], ['2026-11-09', 'Pecs Triceps', 'lundi soir']]);
  assert.equal(r.sdj, 'Jambes', 'la séance du jour suit ton ordre réel : après Pecs Triceps, Jambes');
  assert.deepEqual(r.carteMardi, ['Prochaine séance · demain soir', 'Jambes'], 'un mardi de repos, pas de « Séance du jour »');
  assert.match(r.repos.replace(/<[^>]+>/g, ''), /^Jour de repos aujourd'hui\s:\sta prochaine séance, Jambes, est prévue demain soir\.$/);
  assert.match(r.note, /^Repérés sur tes 5 dernières semaines\s:\slundi \(Pecs Triceps\), mercredi \(Jambes\), jeudi \(Épaules\) et samedi \(Dos Biceps\)\.$/);
  assert.deepEqual(r.lundi, ['historique', 3, 9], 'les séances libres du lundi servent à estimer Pecs Triceps (3 exercices × 3 séries)');

  // Le programme d'un jour fixé à la main l'emporte ; « Auto » le rend aux séances.
  const fixe = await page.evaluate(() => {
    ouvrirDepense();
    const menus = () => [...document.querySelectorAll('#bloc-seances-prevues .sp-prog')].map(l => [l.querySelector('span').textContent, l.querySelector('select').selectedOptions[0].textContent]);
    const avant = menus();
    const sel = [...document.querySelectorAll('#bloc-seances-prevues .sp-prog')].find(l => l.querySelector('span').textContent === 'Mercredi').querySelector('select');
    sel.value = 'ep'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const res = { avant, demain: prochainesSeances(7)[0].nom, carte: seanceAAfficher().p.nom, note: document.querySelector('#bloc-seances-prevues .sp-reperes').textContent, reglage: userProfile.seancesPrevues.programmes };
    choisirProgrammeJour(3, '');
    res.apres = { demain: prochainesSeances(7)[0].nom, reglage: userProfile.seancesPrevues.programmes || null };
    fermerModal('depense-modal');
    return res;
  });
  assert.deepEqual(fixe.avant, [['Lundi', 'Auto · Pecs Triceps'], ['Mercredi', 'Auto · Jambes'], ['Jeudi', 'Auto · Épaules'], ['Samedi', 'Auto · Dos Biceps']]);
  assert.equal(fixe.demain, 'Épaules');
  assert.equal(fixe.carte, 'Épaules');
  assert.match(fixe.note, /mercredi \(Épaules\)/);
  assert.deepEqual(fixe.reglage, { 3: 'ep' });
  assert.deepEqual(fixe.apres, { demain: 'Jambes', reglage: null });

  // Mercredi matin : la séance du jour et la séance prévue, c'est Jambes.
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
  const mer = await page.evaluate(() => {
    allerA('seance'); choisirModeSeance('muscu');
    const carte = document.querySelector('#vitrine-muscu .sdj');
    return { sdj: programmeSuggere().p.nom, prevue: computeTargets(getDay(todayStr()), todayStr()).seancePrevue.nom, carte: carte.querySelector('small').textContent };
  });
  assert.deepEqual(mer, { sdj: 'Jambes', prevue: 'Jambes', carte: 'Séance du jour' });

  // Une rotation qui ne tombe pas sur les mêmes jours (4 programmes, 3 séances par semaine) : ton ordre réel
  // (A, C, B, D) plutôt que celui de la liste (A, B, C, D).
  const rotation = await page.evaluate(() => {
    musculationProgrammes.length = 0; musculationHistorique.length = 0;
    const exos = toutesLesExercices();
    ['A', 'B', 'C', 'D'].forEach((n, k) => musculationProgrammes.push({ id: 'r' + n, nom: n, maj: Date.now(),
      exercices: exos.slice(20 + k * 3, 23 + k * 3).map(e => ({ exerciceId: e.id, nom: e.nom, series: [0, 1, 2].map(() => ({ poids: 40, reps: 10 })) })) }));
    const ordre = ['A', 'C', 'B', 'D'], auj = todayStr();
    let i = 0;
    for (let d = shiftDate(auj, -44); d < auj; d = shiftDate(d, 1)) {
      if (![1, 3, 5].includes(dateLocale(d).getDay())) continue;
      const nom = ordre[i++ % 4], p = musculationProgrammes.find(q => q.nom === nom), debut = new Date(d + 'T18:00:00').getTime();
      musculationHistorique.unshift({ id: 'r' + d, programmeId: p.id, programmeNom: p.nom, date: d, debut, fin: debut + 3600e3, dureeMin: 60, maj: debut,
        exercices: p.exercices.map(e => ({ exerciceId: e.exerciceId, nom: e.nom, series: e.series.map(() => ({ poids: 40, reps: 10, fait: true })) })) });
    }
    sauvegarderHistorique();
    return { derniere: musculationHistorique[0].programmeNom, prevues: prochainesSeances(7).map(x => x.nom) };
  });
  const ordre = ['A', 'C', 'B', 'D'], k = ordre.indexOf(rotation.derniere);
  assert.deepEqual(rotation.prevues, [1, 2, 3].map(n => ordre[(k + n) % 4]));
}));

test('Coach du jour : une recette pour le repas à venir, qui tient dans le reste du jour et suit ce que tu manges', () => avecAppli({}, async ({ page }) => {
  // Trois semaines de poulet le soir et de skyr le matin, une fois du thon et des crevettes : ni bœuf, ni porc, ni alcool.
  await page.clock.setFixedTime(new Date('2026-10-27T08:00:00'));
  await page.evaluate(() => {
    for (let k = 1; k <= 20; k++) {
      const d = shiftDate(todayStr(), -k), j = getDay(d);
      j.meals.dinner.push({ name: 'Blanc de poulet', grams: 150, kcal: 165, p: 35, c: 0, f: 3 });
      j.meals.breakfast.push({ name: 'Skyr', grams: 150, kcal: 90, p: 15, c: 6, f: 0 });
      if (k === 3) j.meals.lunch.push({ name: 'Thon au naturel', grams: 100, kcal: 110, p: 26, c: 0, f: 1 });
      if (k === 8) j.meals.dinner.push({ name: 'Crevettes', grams: 150, kcal: 150, p: 32, c: 0, f: 2 });
      saveData(d);
    }
    invaliderHistorique();
  });
  // Le coach à une date et une heure données, avec les repas de ce jour-là.
  const coach = async (quand, repas) => {
    await page.clock.setFixedTime(new Date(quand));
    return page.evaluate(repas => {
      currentDate = todayStr();
      const day = getDay(currentDate);
      MEALS.forEach(m => { day.meals[m] = []; });
      repas.forEach(([m, it]) => day.meals[m].push(Object.assign({}, it)));
      saveData(currentDate);
      allerA('repas'); renderApp();
      const b = document.querySelector('#coach-jour .coach-actions button');
      return { texte: document.querySelector('#coach-jour p').textContent, action: b ? b.textContent : null, reste: computeTargets(day, currentDate).target - sumMeals(day).kcal };
    }, repas);
  };
  // Ce que contient une recette : la famille de chaque ingrédient, « porc » en plus pour le porc.
  const familles = noms => page.evaluate(noms => noms.map(n => {
    const r = recettesAskesis().concat(recettesPerso).find(x => x.nom === n);
    return r ? { repas: r.repas || [], kcal: totauxRecettePerso(r).parPortionKcal, f: r.ingredients.map(i => (familleAliment(i.nom) || '') + (estPorc(i.nom) ? 'porc' : '')) } : null;
  }), noms);
  const recette = (texte, moment) => (texte.split(new RegExp(`Pour ${moment}\\s:\\s`))[1] || '').split(' (1\u00a0portion')[0];
  const interdites = /🥩|🦪|🥓|🍷|🍺|🍸|whey|porc/;

  const pates = ['lunch', { name: 'Pâtes bolognaise', grams: 350, kcal: 600, p: 20, c: 90, f: 15 }];
  const soirs = [];
  for (const d of ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) soirs.push(await coach(d + 'T19:00:00', [pates]));
  soirs.forEach(s => {
    assert.match(s.texte, /^Il te manque \d+\sg de protéines, il te reste [\d\s]+\skcal\. Pour ce soir\s:\s.+ \(1\u00a0portion,\u00a0[\d\s]+\u00a0kcal,\u00a0\+\d+\u00a0g\)\./, s.texte);
    assert.equal(s.action, 'Voir la recette');
  });
  const noms = soirs.map(s => recette(s.texte, 'ce soir'));
  assert.equal(new Set(noms).size, 5, 'une recette différente chaque soir : ' + noms.join(' | '));
  const details = await familles(noms);
  details.forEach((d, i) => {
    assert.ok(d, 'recette inconnue : ' + noms[i]);
    assert.ok(d.repas.includes('dinner'), noms[i]);
    assert.ok(d.kcal <= soirs[i].reste * 1.05, `${noms[i]} : ${d.kcal} kcal pour ${soirs[i].reste} restantes`);
    assert.ok(!d.f.some(f => interdites.test(f)), `${noms[i]} : ${d.f.join(' ')}`);
  });

  // « Voir la recette » ouvre sa fiche ; « Ajouter une portion au dîner » l'ajoute au dîner et referme.
  const ajout = await page.evaluate(() => {
    document.querySelector('#coach-jour .coach-actions button').click();
    const fiche = document.getElementById('feuille-fiche-recette');
    const res = { ouverte: fiche.classList.contains('show'), titre: document.getElementById('fiche-recette-titre').textContent, bouton: fiche.querySelector('.recette-ajouter').textContent };
    fiche.querySelector('.recette-ajouter').click();
    const it = getDay(todayStr()).meals.dinner.slice(-1)[0];
    const r = recettesAskesis().find(x => x.nom === it.name);
    return Object.assign(res, { fermee: !fiche.classList.contains('show'), nom: it.name, kcal: it.kcal, attendu: totauxRecettePerso(r).parPortionKcal, ingredients: (it.ingredients || []).length, attenduIngr: r.ingredients.length });
  });
  assert.equal(ajout.ouverte, true);
  assert.equal(ajout.titre, noms[4]);
  assert.equal(ajout.bouton, 'Ajouter une portion au dîner');
  assert.equal(ajout.fermee, true);
  assert.equal(ajout.nom, noms[4]);
  assert.ok(Math.abs(ajout.kcal - ajout.attendu) <= Math.max(5, ajout.attendu * 0.03), `${ajout.kcal} pour ${ajout.attendu}`);
  assert.equal(ajout.ingredients, ajout.attenduIngr);

  // Mangée hier soir : pas reproposée aujourd'hui.
  const hier = await page.evaluate(nom => { const d = shiftDate(todayStr(), -1); getDay(d).meals.dinner.push({ name: nom, grams: 400, kcal: 500, p: 35, c: 40, f: 15 }); saveData(d); invaliderHistorique(); return nom; }, noms[4]);
  const lendemain = await coach('2026-10-31T19:00:00', [pates]);
  assert.equal(lendemain.action, 'Voir la recette');
  assert.notEqual(recette(lendemain.texte, 'ce soir'), hier);

  // Du poulet à midi : pas de poulet ce soir, quel que soit le jour.
  const poulet = ['lunch', { name: 'Blanc de poulet', grams: 150, kcal: 165, p: 35, c: 0, f: 3 }];
  const apresPoulet = [];
  for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) apresPoulet.push(recette((await coach(d + 'T19:00:00', [poulet, pates])).texte, 'ce soir'));
  (await familles(apresPoulet.filter(Boolean))).forEach((d, i) => assert.ok(!d.f.includes('🍗'), apresPoulet[i]));

  // Le matin, rien de noté : une recette de petit-déjeuner, un tiers des kcal du jour au plus.
  const matin = await coach('2026-11-02T08:00:00', []);
  assert.equal(matin.action, 'Voir la recette');
  const [pdj] = await familles([recette(matin.texte.replace(/Petit-déjeuner protéiné\s:\s/, 'Pour le petit-déjeuner : '), 'le petit-déjeuner')]);
  assert.ok(pdj && pdj.repas.includes('breakfast'), matin.texte);
  assert.ok(pdj.kcal <= matin.reste * 0.35 * 1.05, `${pdj.kcal} kcal sur ${matin.reste}`);
  // L'après-midi, déjà déjeuné : une recette de collation (ou des aliments), jamais un plat.
  const gouter = await coach('2026-11-02T16:00:00', [['breakfast', { name: 'Café', grams: 200, kcal: 5, p: 0, c: 0, f: 0 }], pates]);
  assert.match(gouter.texte, /Pour la collation\s:\s/);
  const rc = recette(gouter.texte, 'la collation');
  if (gouter.action === 'Voir la recette') assert.ok((await familles([rc]))[0].repas.includes('snack'), rc);

  // Compte neuf : ni viande, ni poisson, ni fruits de mer, ni porc, ni alcool ; mais toujours une recette.
  const neuf = await page.evaluate(() => {
    appData = {}; invaliderHistorique();
    const res = [];
    for (let k = 0; k < 30; k++) { currentDate = shiftDate('2026-11-01', k); const r = recetteProposee({ meals: {} }, 'dinner', 2000, 120); res.push(r ? r.r.nom : null); }
    currentDate = todayStr();
    return res;
  });
  assert.ok(neuf.every(Boolean), neuf.join(' | '));
  assert.ok(new Set(neuf).size >= 4, neuf.join(' | '));
  (await familles([...new Set(neuf)])).forEach(d => assert.ok(!d.f.some(f => /🍗|🐟|🦐|🥩|🦪|🥓|🍷|🍺|🍸|whey|porc/.test(f)), d.f.join(' ')));
  // Du bœuf haché noté, jamais de porc : du bœuf peut venir, le porc jamais.
  const boeuf = await page.evaluate(() => {
    for (let k = 1; k <= 6; k++) { const d = shiftDate(todayStr(), -k); getDay(d).meals.dinner.push({ name: 'Steak haché 5%', grams: 125, kcal: 160, p: 26, c: 0, f: 6 }); saveData(d); }
    invaliderHistorique();
    const res = [];
    for (let k = 0; k < 60; k++) { currentDate = shiftDate('2026-11-01', k); const r = recetteProposee({ meals: {} }, 'dinner', 2000, 120); if (r) res.push(r.r.nom); }
    currentDate = todayStr();
    return [...new Set(res)];
  });
  const fb = await familles(boeuf);
  assert.ok(fb.some(d => d.f.includes('🥩')), 'le bœuf devient possible : ' + boeuf.join(' | '));
  assert.ok(!fb.some(d => d.f.some(f => /porc/.test(f))), 'jamais de porc : ' + boeuf.join(' | '));

  // Tes propres recettes en font partie ; leur nom reste du texte.
  await page.clock.setFixedTime(new Date('2026-11-02T19:00:00'));
  const perso = await page.evaluate(() => {
    recettesAskesisCache = [];
    recettesPerso = [{ id: 'p"1', nom: '<img src=x onerror="window.__xss=1">Mon dahl', portions: 2, ingredients: [
      { nom: 'Lentilles corail', grammes: 200, kcal100: 340, p100: 24, c100: 50, f100: 2 }, { nom: 'Lait de coco', grammes: 100, kcal100: 180, p100: 2, c100: 3, f100: 18 }] }];
    currentDate = todayStr();
    const day = getDay(currentDate);
    MEALS.forEach(m => { day.meals[m] = []; });
    day.meals.lunch.push({ name: 'Pâtes', grams: 350, kcal: 600, p: 20, c: 90, f: 15 });
    saveData(currentDate); renderApp();
    const c = document.getElementById('coach-jour');
    c.querySelector('.coach-actions button').click();
    return { texte: c.querySelector('p').textContent, images: document.querySelectorAll('#coach-jour img, #feuille-fiche-recette img').length, xss: window.__xss || null,
      titre: document.getElementById('fiche-recette-titre').textContent };
  });
  assert.match(perso.texte, /Pour ce soir\s:\s<img src=x onerror="window\.__xss=1">Mon dahl \(1\u00a0portion/);
  assert.deepEqual([perso.images, perso.xss], [0, null]);
  assert.equal(perso.titre, '<img src=x onerror="window.__xss=1">Mon dahl');
}));

test('Recettes Askēsis : une catégorie à la fois (celle du repas visé), la recherche sur toutes, la fiche avec sa source, une portion ajoutée en un geste', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    allerA('repas'); renderApp();
    ouvrirFeuilleRepas('snack'); depuisFeuille('recette');
    const liste = () => [...document.querySelectorAll('#choix-recette-askesis .off-suggestion')].map(b => b.querySelector('.off-nom').textContent);
    const puces = () => [...document.querySelectorAll('#choix-recette-categories button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''));
    const de = cat => recettesAskesis().filter(x => x.categorie === cat).map(x => x.nom);
    const champ = document.getElementById('choix-recette-recherche');
    const compte = () => document.getElementById('choix-recette-compte').textContent;
    const chercher = q => { champ.value = q; champ.dispatchEvent(new Event('input', { bubbles: true })); return liste(); };
    const res = { total: recettesAskesis().length, parCategorie: Object.fromEntries(['plat', 'entree', 'petit-dej', 'collation', 'dessert', 'accompagnement', 'pain', 'sauce', 'boisson'].map(c => [c, de(c).length])),
      puces: puces(), collations: liste(), attendu: de('collation').sort((a, b) => a.localeCompare(b, 'fr')), compte: compte() };
    [...document.querySelectorAll('#choix-recette-categories button')].find(b => b.textContent === 'Desserts').click();
    res.desserts = liste().length; res.pucesDesserts = puces().filter(p => p.endsWith('*'));
    res.lentilles = chercher('LENTILLES'); res.pucesRecherche = puces().filter(p => p.endsWith('*')); res.compteRecherche = compte();
    // Le nom d'abord, puis les ingrédients : pour chaque résultat, [dans le nom, dans les ingrédients].
    res.lentillesOu = res.lentilles.map(n => { const x = recettesAskesis().find(y => y.nom === n); return [/lentilles/i.test(n), x.ingredients.some(i => /lentilles/i.test(i.nom)) || (x.lignes || []).some(l => /lentilles/i.test(l))]; });
    res.metas = [...document.querySelectorAll('#choix-recette-askesis .off-meta')].map(m => m.textContent);
    res.oeufs = chercher('oeufs');
    res.aucune = (chercher('zzzz'), document.getElementById('choix-recette-askesis').textContent);
    res.police = getComputedStyle(champ).fontSize;
    res.imbriques = document.querySelectorAll('#feuille-choix-recette button button').length;
    // Rouverte pour le dîner : les plats, sans la recherche d'avant.
    fermerFeuilles(); ouvrirFeuilleRepas('dinner'); depuisFeuille('recette');
    res.diner = { puces: puces().filter(p => p.endsWith('*')), champ: champ.value, nb: liste().length };
    return res;
  });
  assert.ok(r.total >= 1700, String(r.total));
  Object.entries(r.parCategorie).forEach(([c, n]) => assert.ok(n >= 10, `${c} : ${n}`));
  assert.deepEqual(r.puces, ['Toutes', 'Plats', 'Entrées et soupes', 'Petit-déjeuner', 'Collations*', 'Desserts', 'Accompagnements', 'Pains', 'Sauces et tartinades', 'Boissons']);
  assert.deepEqual(r.collations, r.attendu, 'les collations, par ordre alphabétique');
  assert.equal(r.compte, r.collations.length + ' recettes');
  assert.deepEqual(r.pucesDesserts, ['Desserts*']);
  assert.equal(r.desserts, r.parCategorie.dessert);
  // La recherche porte sur toutes les catégories ; chaque résultat dit la sienne.
  const parNom = r.lentillesOu.findIndex(([nom]) => !nom);
  assert.ok(parNom >= 4, 'les recettes aux lentilles dans leur nom en tête : ' + r.lentilles.join(' | '));
  assert.ok(r.lentillesOu.slice(parNom).length >= 3 && r.lentillesOu.slice(parNom).every(([nom, ingr]) => !nom && ingr), 'puis celles qui en contiennent');
  assert.deepEqual(r.pucesRecherche, [], 'aucune catégorie choisie pendant une recherche');
  assert.equal(r.compteRecherche, r.lentilles.length + ' recettes trouvées');
  r.metas.forEach(m => assert.match(m, /^(Plat|Entrée ou soupe|Petit-déjeuner|Collation|Dessert|Accompagnement|Pain|Sauce ou tartinade|Boisson) · \d+ kcal · P \d+ g · G \d+ g · L \d+ g — par portion$/, m));
  assert.ok(r.oeufs.length >= 5 && r.oeufs.slice(0, 5).every(n => /œufs|oeufs/i.test(n)), 'œ cherché comme oe : ' + r.oeufs.join(' | '));
  assert.match(r.aucune, /Aucune recette ne correspond/);
  assert.equal(r.police, '16px', 'pas de zoom de l\'iPhone sur le champ');
  assert.equal(r.imbriques, 0);
  assert.deepEqual(r.diner, { puces: ['Plats*'], champ: '', nb: r.parCategorie.plat });

  // Une recette de Wikilivres : valeurs par portion, ingrédients, étapes, la source et sa licence.
  const wl = await page.evaluate(() => {
    const champ = document.getElementById('choix-recette-recherche');
    champ.value = 'blanquette'; champ.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('#choix-recette-askesis .off-suggestion')].find(x => x.querySelector('.off-nom').textContent === 'Blanquette de veau').click();
    const f = document.getElementById('fiche-recette'), lien = f.querySelector('.recette-source a');
    return { titre: document.getElementById('fiche-recette-titre').textContent, tuiles: [...f.querySelectorAll('.recette-macros small')].map(x => x.textContent),
      portions: f.querySelector('.note').textContent, ingredients: f.querySelectorAll('.recette-liste li').length, etapes: f.querySelectorAll('.recette-etapes li').length,
      lien: lien && lien.href, licence: f.querySelectorAll('.recette-source a')[1].href, source: f.querySelector('.recette-source').textContent, bouton: f.querySelector('.recette-ajouter').textContent,
      deux: ['feuille-choix-recette', 'feuille-fiche-recette'].map(id => document.getElementById(id).classList.contains('show')) };
  });
  assert.equal(wl.titre, 'Blanquette de veau');
  assert.deepEqual(wl.tuiles, ['kcal', 'Protéines', 'Glucides', 'Lipides']);
  assert.equal(wl.portions, 'Pour 4 portions : valeurs pour une portion.');
  assert.ok(wl.ingredients >= 8 && wl.etapes >= 5, `${wl.ingredients} ingrédients, ${wl.etapes} étapes`);
  assert.equal(wl.lien, 'https://fr.wikibooks.org/wiki/Livre_de_cuisine/Blanquette_de_veau');
  assert.match(wl.source, /^Recette « Blanquette de veau » des contributeurs du Livre de cuisine de Wikilivres, licence CC BY-SA 4\.0, texte adapté\. Valeurs nutritionnelles calculées avec la table CIQUAL 2020 \(Anses\)\.$/);
  assert.equal(wl.licence, 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr');
  assert.equal(wl.bouton, 'Ajouter une portion au dîner');
  assert.deepEqual(wl.deux, [true, true], 'la fiche se pose sur la liste');
  // La fermer ramène à la liste ; une recette Askēsis s'ajoute au dîner, tout se referme.
  const ak = await page.evaluate(() => {
    document.querySelector('#feuille-fiche-recette .feuille-fermer').click();
    const liste = document.getElementById('feuille-choix-recette').classList.contains('show') && !document.getElementById('feuille-fiche-recette').classList.contains('show');
    const champ = document.getElementById('choix-recette-recherche');
    champ.value = 'poke bowl'; champ.dispatchEvent(new Event('input', { bubbles: true }));
    const b = document.querySelector('#choix-recette-askesis .off-suggestion');
    const nom = b.querySelector('.off-nom').textContent, meta = b.querySelector('.off-meta').textContent;
    b.click();
    const source = document.querySelector('#fiche-recette .recette-source').textContent;
    document.querySelector('#fiche-recette .recette-ajouter').click();
    const it = getDay(todayStr()).meals.dinner.slice(-1)[0];
    return { liste, nom, meta, source, ajoute: it && it.name, kcal: it && Math.round(it.kcal), ouvertes: document.querySelectorAll('.feuille.show').length };
  });
  assert.equal(ak.liste, true);
  assert.equal(ak.nom, 'Poke bowl au saumon');
  assert.match(ak.meta, /^Plat · \d+ kcal · P \d+ g · G \d+ g · L \d+ g — par portion$/);
  assert.match(ak.source, /^Recette Askēsis\. Valeurs nutritionnelles calculées avec la table CIQUAL 2020 \(Anses\)\.$/);
  assert.equal(ak.ajoute, ak.nom);
  assert.equal(String(ak.kcal), ak.meta.split(' ')[2]);
  assert.equal(ak.ouvertes, 0);
}));

test('Recettes traduites du Cookbook anglais : la fiche cite sa page, ses contributeurs et la licence ; chaque viande, poisson ou fruit de mer a sa famille pour le coach', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    allerA('repas'); renderApp();
    ouvrirFeuilleRepas('dinner'); depuisFeuille('recette');
    const champ = document.getElementById('choix-recette-recherche');
    champ.value = 'chawarma'; champ.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('#choix-recette-askesis .off-suggestion')].find(x => x.querySelector('.off-nom').textContent === "Chawarma d'agneau").click();
    const f = document.getElementById('fiche-recette'), liens = f.querySelectorAll('.recette-source a');
    const en = recettesAskesis().filter(x => x.id.startsWith('en-'));
    // Une viande, un poisson ou un fruit de mer sans famille : le coach le proposerait à qui n'en mange pas.
    const animaux = /\b(poulet|dinde|canard|boeuf|veau|agneau|mouton|porc|jambon|lard|bacon|saucisses?|saindoux|poissons?|saumon|thon|cabillaud|haddock|crevettes?|crabe|surimi|palourdes?|moules?|huitres?|saint jacques|calamars?)\b/;
    const sansFamille = recettesAskesis().flatMap(x => x.ingredients.map(i => i.nom))
      .filter(n => animaux.test(normaliserRecherche(n)) && !estPorc(n) && !FAMILLES_ANIMALES.includes(familleAliment(n)));
    return { titre: document.getElementById('fiche-recette-titre').textContent, source: f.querySelector('.recette-source').textContent,
      lien: liens[0].href, licence: liens[1].href, lignes: [...f.querySelectorAll('.recette-liste li')].map(li => li.textContent),
      etapes: f.querySelectorAll('.recette-etapes li').length, nbEn: en.length, sansSource: en.filter(x => !x.source).length,
      categories: [...new Set(en.map(x => x.categorie))].sort(), sansFamille: [...new Set(sansFamille)],
      familles: ['Noix de Saint-Jacques', 'Palourdes', 'Haricots secs', 'Haricots verts', 'Bière'].map(familleAliment) };
  });
  assert.equal(r.titre, "Chawarma d'agneau");
  assert.match(r.source, /^Recette « Lamb Shawarma » des contributeurs du Cookbook de Wikibooks \(en anglais\), licence CC BY-SA 4\.0, traduite et adaptée\. Valeurs nutritionnelles calculées avec la table CIQUAL 2020 \(Anses\)\.$/);
  assert.equal(r.lien, 'https://en.wikibooks.org/wiki/Cookbook:Lamb_Shawarma');
  assert.equal(r.licence, 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr');
  assert.deepEqual(r.lignes.slice(0, 4), ["1,5\u00a0kg d'agneau", "3 gousses d'ail", '120\u00a0ml de jus de citron', '2 oignons (300\u00a0g)']);
  assert.ok(r.etapes >= 5, String(r.etapes));
  assert.ok(r.nbEn >= 1280, String(r.nbEn));
  assert.equal(r.sansSource, 0);
  assert.deepEqual(r.categories, ['accompagnement', 'boisson', 'collation', 'dessert', 'entree', 'pain', 'petit-dej', 'plat', 'sauce']);
  assert.deepEqual(r.sansFamille, []);
  assert.deepEqual(r.familles, ['🦪', '🦪', '🫘', '🥗', '🍺']);
}));

test('Recettes Askēsis : bien rangées, affinages cumulables (protéinées, dans mon reste, végétariennes), tri et recherche dans les ingrédients, gardés d\'une fois sur l\'autre', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    // Des recettes qui étaient mal rangées.
    const cat = n => (recettesAskesis().find(x => x.nom === n) || {}).categorie;
    const rangees = ['Moussaka grecque', 'Guacamole', 'Pain de maïs', "Smoothie à l'orange", 'Croissants', 'Houmous et crudités', 'Riz basmati au citron', 'Soupe de lentilles corail et carottes'].map(cat);
    // Il reste 600 kcal aujourd'hui.
    const j = getDay(currentDate = todayStr()), t = computeTargets(j, currentDate);
    j.meals.lunch = [{ name: 'Repas', grams: 500, kcal: t.target - 600, p: 60, c: 100, f: 30 }]; saveData(currentDate);
    allerA('repas'); renderApp();
    ouvrirFeuilleRepas('dinner'); depuisFeuille('recette');
    const noms = () => [...document.querySelectorAll('#choix-recette-askesis .off-suggestion .off-nom')].map(b => b.textContent);
    const valeurs = () => [...document.querySelectorAll('#choix-recette-askesis .off-meta')].map(m => { const x = m.textContent.match(/(\d+) kcal · P (\d+) g/); return [Number(x[1]), Number(x[2])]; });
    const affinage = debut => [...document.querySelectorAll('#choix-recette-affinages button')].find(b => b.textContent.startsWith(debut));
    const tri = libelle => [...document.querySelectorAll('#choix-recette-tri button')].find(b => b.textContent === libelle);
    const res = { rangees, affinages: [...document.querySelectorAll('#choix-recette-affinages button')].map(b => b.textContent), plats: noms().length };
    affinage('Protéinées').click();
    res.proteinees = { nb: noms().length, min: Math.min(...valeurs().map(v => v[1])), presse: affinage('Protéinées').getAttribute('aria-pressed') };
    affinage('Mon reste').click();
    res.reste = { nb: noms().length, max: Math.max(...valeurs().map(v => v[0])) };
    affinage('Végétariennes').click();
    const animal = /\b(poulet|bœuf|boeuf|porc|veau|agneau|dinde|canard|jambon|lardons|bacon|saucisses?|thon|saumon|cabillaud|crevettes|poisson|moules)\b/i;
    res.vege = { nb: noms().length, avecAnimal: noms().filter(n => recettesAskesis().find(x => x.nom === n).ingredients.some(i => animal.test(i.nom))) };
    // Le tri : les plus protéinées d'abord, puis les moins caloriques.
    affinage('Végétariennes').click(); affinage('Mon reste').click();
    tri('Protéines').click();
    const p = valeurs().map(v => v[1]);
    res.triP = p.every((x, i) => !i || x <= p[i - 1]);
    tri('kcal').click();
    const k = valeurs().map(v => v[0]);
    res.triK = k.every((x, i) => !i || x >= k[i - 1]);
    // « Toutes » : chaque recette dit sa catégorie.
    [...document.querySelectorAll('#choix-recette-categories button')].find(b => b.textContent === 'Toutes').click();
    res.toutes = { nb: noms().length, meta: document.querySelector('#choix-recette-askesis .off-meta').textContent };
    // Gardés à la prochaine ouverture (sur cet appareil).
    fermerFeuilles(); ouvrirFeuilleRepas('lunch'); depuisFeuille('recette');
    res.gardes = { proteinees: affinage('Protéinées').getAttribute('aria-pressed'), tri: tri('kcal').getAttribute('aria-pressed'), memo: JSON.parse(localStorage.getItem('recettesFiltres')) };
    affinage('Protéinées').click(); tri('A–Z').click();
    // Une recherche sur un ingrédient : « tofu » trouve aussi les recettes au tofu qui ne le disent pas dans leur nom.
    const champ = document.getElementById('choix-recette-recherche');
    champ.value = 'tofu'; champ.dispatchEvent(new Event('input', { bubbles: true }));
    res.tofu = noms().map(n => { const x = recettesAskesis().find(y => y.nom === n); return [/tofu/i.test(n), x.ingredients.some(i => /tofu/i.test(i.nom)) || (x.lignes || []).some(l => /tofu/i.test(l))]; });
    return res;
  });
  assert.deepEqual(r.rangees, ['plat', 'sauce', 'pain', 'boisson', 'petit-dej', 'collation', 'accompagnement', 'entree']);
  assert.deepEqual(r.affinages, ['Protéinées ≥\u00a020\u00a0g', 'Mon reste ≤\u00a0600\u00a0kcal', 'Végétariennes']);
  assert.ok(r.proteinees.nb > 50 && r.proteinees.nb < r.plats, `${r.proteinees.nb} sur ${r.plats}`);
  assert.ok(r.proteinees.min >= 20);
  assert.equal(r.proteinees.presse, 'true');
  assert.ok(r.reste.nb > 0 && r.reste.nb < r.proteinees.nb && r.reste.max <= 600, JSON.stringify(r.reste));
  assert.ok(r.vege.nb > 0 && r.vege.nb < r.reste.nb, JSON.stringify(r.vege));
  assert.deepEqual(r.vege.avecAnimal, []);
  assert.equal(r.triP, true);
  assert.equal(r.triK, true);
  assert.ok(r.toutes.nb > r.proteinees.nb);
  assert.match(r.toutes.meta, /^(Plat|Entrée ou soupe|Petit-déjeuner|Collation|Dessert|Accompagnement|Pain|Sauce ou tartinade|Boisson) · /);
  assert.deepEqual(r.gardes, { proteinees: 'true', tri: 'true', memo: { tri: 'kcal', proteinees: true, reste: false, vege: false } });
  const parNom = r.tofu.findIndex(([nom]) => !nom);
  assert.ok(parNom >= 3 && r.tofu.slice(parNom).length >= 1 && r.tofu.slice(parNom).every(([nom, ingr]) => !nom && ingr), JSON.stringify(r.tofu));
}));

test('Recette : choisir le nombre de portions (½ à 4) avant de l\'ajouter, les valeurs suivent', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const rec = recettesAskesis().find(x => x.nom === 'Blanquette de veau'), t = totauxRecettePerso(rec);
    currentDate = todayStr(); allerA('repas'); renderApp();
    ouvrirFicheRecette(rec.id, 'dinner');
    const f = document.getElementById('fiche-recette');
    const etat = () => ({ nb: document.getElementById('fiche-recette-nb').textContent, kcal: f.querySelector('.recette-macros b').textContent,
      note: document.getElementById('fiche-recette-portions-note').textContent, bouton: f.querySelector('.recette-ajouter').textContent,
      moins: f.querySelector('.recette-portions button').disabled });
    const plus = () => f.querySelectorAll('.recette-portions button')[1].click(), moins = () => f.querySelector('.recette-portions button').click();
    const res = { parPortion: Math.round(t.parPortionKcal), un: etat() };
    moins(); res.demi = etat(); moins(); res.toujoursDemi = etat().nb;
    plus(); plus(); res.unEtDemi = etat();
    for (let k = 0; k < 8; k++) plus();
    res.max = etat().nb;
    moins(); moins(); moins(); moins(); moins(); // 1,5
    f.querySelector('.recette-ajouter').click();
    const it = getDay(todayStr()).meals.dinner.slice(-1)[0];
    res.ajoute = { nom: it.name, kcal: Math.round(it.kcal) };
    return res;
  });
  const fr = n => n.toLocaleString('fr-FR');
  assert.deepEqual(r.un, { nb: '1 portion', kcal: fr(r.parPortion), note: 'Pour 4 portions : valeurs pour une portion.', bouton: 'Ajouter une portion au dîner', moins: false });
  assert.equal(r.demi.nb, '½ portion');
  assert.equal(r.demi.bouton, 'Ajouter ½ portion au dîner');
  assert.equal(r.demi.moins, true);
  assert.equal(r.toujoursDemi, '½ portion', 'jamais moins d\'une demi-portion');
  assert.equal(r.unEtDemi.bouton, 'Ajouter 1,5 portion au dîner');
  assert.equal(r.unEtDemi.note, 'Pour 4 portions : valeurs pour 1,5 portion.');
  assert.ok(Math.abs(Number(r.unEtDemi.kcal.replace(/\s/g, '')) - r.parPortion * 1.5) <= 1, r.unEtDemi.kcal);
  assert.equal(r.max, '4 portions');
  assert.equal(r.ajoute.nom, 'Blanquette de veau');
  assert.ok(Math.abs(r.ajoute.kcal - r.parPortion * 1.5) <= r.parPortion * 0.03, JSON.stringify(r.ajoute));
}));

test('Repas du jour : « 62/1 821 kcal » et la roulette Pas / Hydratation / Poids', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    const t = todayStr();
    for (let k = 12; k >= 0; k--) { const d = shiftDate(t, -k), j = getDay(d); j.steps = 5000 + k * 250; j.weight = 80 + k * 0.1; j.meals[MEALS[0]].push({ name: 'Test', kcal: 1500, p: 100, c: 150, f: 50 }); saveData(d); }
    allerA('repas'); renderApp();
  });
  // Ce qui reste en grand, puis « /objectif kcal » en petit, sur la même ligne.
  await page.waitForFunction(() => document.getElementById('reste-kcals').firstChild.nodeValue === (computeTargets(getDay(todayStr()), todayStr()).target - 1500).toLocaleString('fr-FR'));
  const ligne = await page.evaluate(() => {
    const el = document.getElementById('reste-kcals'), em = el.querySelector('em'), cible = computeTargets(getDay(todayStr()), todayStr()).target;
    const espaces = s => s.replace(/[  ]/g, ' '), nombre = document.createRange();
    nombre.selectNodeContents(el.firstChild);
    return { texte: espaces(el.textContent), attendu: espaces(`${(cible - 1500).toLocaleString('fr-FR')}/${cible.toLocaleString('fr-FR')} kcal`),
      plusGros: parseFloat(getComputedStyle(el).fontSize) > 2 * parseFloat(getComputedStyle(em).fontSize),
      memeLigne: Math.abs(nombre.getBoundingClientRect().bottom - em.getBoundingClientRect().bottom) < 8, anciennesTuiles: !!document.querySelector('.heros-puces') };
  });
  assert.equal(ligne.texte, ligne.attendu);
  assert.deepEqual([ligne.plusGros, ligne.memeLigne, ligne.anciennesTuiles], [true, true, false]);
  // La roulette : Pas, Hydratation, Poids sur une rangée qui défile, l'eau au centre au départ, les voisines estompées.
  const r = await page.evaluate(() => {
    const c = document.getElementById('cartes-stats-repas'), cartes = [...c.children];
    return { ordre: cartes.map(x => x.id), centre: c.querySelector(':scope > .actif').id, defile: c.scrollWidth > c.clientWidth,
      rangees: new Set(cartes.map(x => x.offsetTop)).size, estompees: cartes.filter(x => !x.classList.contains('actif')).every(x => Number(x.style.opacity) < 0.8),
      pas: document.querySelector('#carte-stats-pas .carte-stats-valeur b').textContent.replace(/\u202f/g, ' '), barresPas: document.querySelectorAll('#carte-stats-pas .tuile-graph rect').length,
      boutonsCoin: c.querySelectorAll('.tuile-plus').length, nutrition: !!document.getElementById('carte-stats-nutrition') };
  });
  assert.deepEqual(r.ordre, ['carte-stats-pas', 'bloc-eau', 'carte-stats-poids']);
  assert.equal(r.centre, 'bloc-eau');
  assert.ok(r.defile && r.rangees === 1 && r.estompees, JSON.stringify(r));
  assert.deepEqual([r.pas, r.barresPas, r.boutonsCoin, r.nutrition], ['5 000', 13, 0, false]);
  // Les boutons de l'eau agissent même quand sa carte est de côté (sans la ramener au centre).
  await page.evaluate(() => centrerCarteRoulette('carte-stats-pas', false));
  const eau = () => page.evaluate(() => Number(getDay(todayStr()).eauMl) || 0);
  const eauAvant = await eau();
  await page.evaluate(() => document.querySelector('#bloc-eau .eau-boutons .btn-icone').click());
  assert.equal(await eau(), eauAvant + 250);
  assert.equal(await page.evaluate(() => rouletteCartesCentre), 'carte-stats-pas');
  // Toucher une carte de côté l'amène au centre sans l'ouvrir ; au centre, elle ouvre la pesée du jour.
  await page.evaluate(() => document.getElementById('carte-stats-poids').click());
  await page.waitForFunction(() => carteAuCentre(document.getElementById('carte-stats-poids')) && document.getElementById('carte-stats-poids').classList.contains('actif'));
  assert.equal(await page.evaluate(() => document.getElementById('feuille-saisie-rapide').classList.contains('show')), false);
  // La carte au centre le reste quand l'écran se redessine.
  await page.evaluate(() => renderApp());
  assert.equal(await page.evaluate(() => document.querySelector('#cartes-stats-repas > .actif').id), 'carte-stats-poids');
  await page.evaluate(() => document.getElementById('carte-stats-poids').click());
  assert.deepEqual(await page.evaluate(() => [document.getElementById('feuille-saisie-rapide').classList.contains('show'), saisieRapide]), [true, 'poids']);
  await page.evaluate(() => fermerFeuilles());
  // Glisser jusqu'au bout vers la gauche : la carte Pas se pose au centre.
  await page.evaluate(() => { document.getElementById('cartes-stats-repas').scrollLeft = 0; });
  await page.waitForFunction(() => document.querySelector('#cartes-stats-repas > .actif').id === 'carte-stats-pas');
}));

test('Repas du jour : un repas se replie et se déplie par son en-tête, et le reste', () => avecAppli({ https: true }, async ({ page }) => {
  await page.evaluate(() => {
    const j = getDay(todayStr());
    j.meals[MEALS[0]].push({ name: 'Pain', grams: 80, kcal: 200, p: 7, c: 40, f: 2 }, { name: 'Beurre', grams: 10, kcal: 74, p: 0, c: 0, f: 8 });
    j.meals[MEALS[1]].push({ name: 'Riz', grams: 200, kcal: 260, p: 5, c: 56, f: 1 });
    saveData(todayStr()); allerA('repas'); renderApp();
  });
  const carte = id => `#meals-container .meal-card[data-repas="${id}"]`;
  const etat = id => page.evaluate(sel => {
    const c = document.querySelector(sel), l = c.querySelector('.food-list');
    return { replie: c.classList.contains('replie'), aria: c.querySelector('.repas-bascule').getAttribute('aria-expanded'),
      hauteur: Math.round(l.getBoundingClientRect().height), visible: getComputedStyle(l).visibility, kcal: c.querySelector('.meal-kcals').textContent.trim() };
  }, carte(id));
  // Déplié au départ ; toucher l'en-tête le replie : la liste disparaît, le total reste.
  let e = await etat('breakfast');
  assert.deepEqual([e.replie, e.aria, e.visible], [false, 'true', 'visible']);
  assert.ok(e.hauteur > 40, String(e.hauteur));
  await page.click(carte('breakfast') + ' .repas-bascule');
  await page.waitForFunction(sel => getComputedStyle(document.querySelector(sel + ' .food-list')).visibility === 'hidden', carte('breakfast'));
  e = await etat('breakfast');
  assert.deepEqual([e.replie, e.aria, e.hauteur, e.visible, e.kcal.replace(/\s+/g, ' ')], [true, 'false', 0, 'hidden', '274 kcal']);
  // Les autres repas ne bougent pas ; le + ajoute sans replier ni déplier.
  assert.equal((await etat('lunch')).replie, false);
  await page.click(carte('breakfast') + ' .repas-ajouter');
  assert.equal(await page.evaluate(() => document.getElementById('feuille-repas').classList.contains('show')), true);
  await page.evaluate(() => fermerFeuilles());
  assert.equal((await etat('breakfast')).replie, true);
  // Gardé quand l'écran se redessine et à la réouverture de l'appli.
  await page.evaluate(() => renderApp());
  assert.equal((await etat('breakfast')).replie, true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof allerA === 'function' && document.querySelector('#meals-container .meal-card[data-repas]'));
  assert.equal((await etat('breakfast')).aria, 'false');
  // Au clavier : Entrée sur l'en-tête le déplie.
  await page.focus(carte('breakfast') + ' .repas-bascule');
  await page.keyboard.press('Enter');
  await page.waitForFunction(sel => getComputedStyle(document.querySelector(sel + ' .food-list')).visibility === 'visible', carte('breakfast'));
  assert.equal((await etat('breakfast')).aria, 'true');
}));

test('anciens styles visuels retirés : un choix enregistré n\'est plus appliqué', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('anqaa_style', 'systeme'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof allerA === 'function');
  const r = await page.evaluate(() => ({ attr: document.documentElement.hasAttribute('data-style'), local: localStorage.getItem('anqaa_style'),
    selecteur: !!document.getElementById('styles-visuels'), fn: typeof choisirStyle }));
  assert.deepEqual(r, { attr: false, local: null, selecteur: false, fn: 'undefined' });
}));

test('le thème sombre ne casse aucun écran', () => avecAppli({ theme: 'dark' }, async ({ page }) => {
  for (const ecran of ['repas', 'seance', 'stats', 'reglages']) {
    await page.evaluate(e => allerA(e), ecran);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('cardio'); ouvrirCardio(); });
  assert.ok(await page.isVisible('#modal-cardio'));
}));

test('vitrines : Activité (corps, séance du jour, programmes), Cardio (arc, tracés), Profil (niveau, badges, objectif)', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    const exos = toutesLesExercices();
    const pecs = exos.filter(e => e.groupe === 'pectoraux').slice(0, 2), jambes = exos.filter(e => e.groupe === 'quadriceps').slice(0, 2);
    const prog = (id, nom, liste) => ({ id, nom, maj: Date.now(), exercices: liste.map(e => ({ exerciceId: e.id, nom: e.nom, series: [{ poids: 40, reps: 10 }, { poids: 40, reps: 10 }] })) });
    musculationProgrammes.push(prog('pa', 'Haut', pecs), prog('pb', 'Bas', jambes));
    // « Haut » fait aujourd'hui : la séance du jour suggérée est « Bas », jamais faite.
    musculationHistorique.push({ id: 'h1', programmeId: 'pa', programmeNom: 'Haut', date: todayStr(), debut: Date.now() - 3e6, fin: Date.now(), dureeMin: 50, maj: Date.now(),
      exercices: pecs.map(e => ({ exerciceId: e.id, nom: e.nom, series: [{ poids: 50, reps: 10, fait: true }, { poids: 50, reps: 8, fait: true }] })) });
    sauvegarderHistorique();
    const j = getDay(todayStr()); j.workouts = [{ type: 'course', time: 30, distance: 5, intensite: 2, cardio: true }]; saveData(todayStr());
    allerA('seance'); choisirModeSeance('muscu');
  });
  const m = await page.evaluate(() => ({
    geant: document.querySelector('#vitrine-muscu .hx-geant').textContent,
    corps: !!document.querySelector('#vitrine-muscu .hx-corps svg path'),
    sdj: document.querySelector('#vitrine-muscu .sdj h4').textContent,
    // Plus de mosaïque (tonnage, records, séances par jour) : les records du mois
    // tiennent dans une pastille de « Ta semaine ».
    mosaique: document.querySelectorAll('#vitrine-muscu .bento').length,
    records: document.querySelector('#vitrine-muscu .hx-puce--record').textContent,
    programmes: [...document.querySelectorAll('#programmes-liste-container .pc b')].map(b => b.textContent),
    // Un seul affichage des programmes (le carrousel), pas de doublon.
    pcAilleurs: document.querySelectorAll('.pc').length - document.querySelectorAll('#programmes-liste-container .pc').length,
    ancienneListe: document.querySelectorAll('.programme-carte').length,
    pasEnBas: getComputedStyle(document.getElementById('carte-pas-seances')).display !== 'none'
  }));
  assert.deepEqual(m, { geant: '4', corps: true, sdj: 'Bas', mosaique: 0, records: '2 records ce mois', programmes: ['Haut', 'Bas'], pcAilleurs: 0, ancienneListe: 0, pasEnBas: false });
  // Le ⋯ d'une carte : modifier, dupliquer, supprimer — sans ouvrir l'aperçu.
  await page.click('#programmes-liste-container .pc:nth-child(1) .pc-options');
  assert.ok(await page.isVisible('#menu-programme-popup'));
  assert.equal(await page.evaluate(() => !!document.querySelector('#apercu-programme-modal.show')), false);
  await page.click('#menu-programme-popup [onclick*="modifier"]');
  assert.equal(await page.evaluate(() => programmeEnEdition && programmeEnEdition.nom), 'Haut');
  await page.evaluate(() => { programmeEnEdition = null; renderSeance(); });
  await page.click('#vitrine-muscu .sdj');
  await page.waitForSelector('#apercu-programme-modal.show');
  assert.match(await page.textContent('#apercu-programme-heros'), /Bas/);
  await page.evaluate(() => { fermerModal('apercu-programme-modal'); choisirModeSeance('cardio'); });
  const c = await page.evaluate(() => ({
    arc: !!document.querySelector('#seance-cardio .hx--cardio .arc-val'),
    // Plus de tracé décoratif : la vraie distance, et les séances groupées par mois.
    trace: document.querySelectorAll('#seance-cardio .cardio-seance .trace').length,
    valeur: document.querySelector('#seance-cardio .cardio-seance-val').textContent,
    mois: document.querySelectorAll('#seance-cardio .cardio-mois').length,
    longue: document.querySelector('#seance-cardio .bento .bt-n').textContent
  }));
  assert.deepEqual(c, { arc: true, trace: 0, valeur: '5 km', mois: 1, longue: '5km' });
  await page.evaluate(() => allerA('reglages'));
  const p = await page.evaluate(() => ({
    palier: document.querySelector('#vitrine-badges .sp-palier b').textContent,
    paliers: document.querySelectorAll('#vitrine-badges .sp-piste .sp-n').length,
    badges: document.querySelectorAll('#vitrine-badges .badge').length,
    objectifCache: getComputedStyle(document.getElementById('carte-objectif')).display
  }));
  // 1 séance (100 XP) + 1 cardio (60 XP), aucun repas : 160 XP, sous le premier palier (250 XP).
  assert.equal(p.badges, 8);
  assert.equal(p.palier, '0');
  assert.equal(p.paliers, 50);
  assert.equal(p.objectifCache, 'none');
  await page.click('#vitrine-profil .obj-tuile:has-text("Masse")');
  const o = await page.evaluate(() => ({ select: document.getElementById('objectif-select').value, goal: getDay(todayStr()).goal, on: document.querySelector('#vitrine-profil .obj-tuile.on').textContent.trim() }));
  assert.deepEqual(o, { select: 'masse', goal: 'masse', on: 'Masse' });
}));

test('séance : un record est fêté une fois, la série cochée « pop », le repos tourne en anneau', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const exo = toutesLesExercices().find(e => e.groupe === 'pectoraux');
    musculationHistorique.push({ id: 'h1', programmeId: null, programmeNom: 'Séance', date: shiftDate(todayStr(), -3), debut: Date.now() - 3e6, fin: Date.now(), dureeMin: 50, maj: Date.now(),
      exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 60, reps: 8, fait: true }, { poids: 60, reps: 8, fait: true }] }] });
    allerA('seance'); demarrerSeanceLibre(); ajouterExerciceASession(exo.id);
    const s = musculationSessionActive.exercices[0].series;
    s[0].poids = 70; s[0].reps = 8; s[1].poids = 70; s[1].reps = 8;
    basculerSerieSession(0, 0);
    const premier = { fete: document.getElementById('celebration').textContent, record: document.querySelectorAll('.serie-record').length,
      pop: !!document.querySelector('.serie-check.pop[data-serie="0_0"]'), anneau: !!document.querySelector('#repos-anneau-0_0') };
    document.getElementById('celebration').textContent = '';
    basculerSerieSession(0, 1); // même charge : pas un nouveau record
    // L'exercice terminé se replie : les records se comptent dans la séance.
    return { ...premier, deuxieme: document.getElementById('celebration').textContent, records: musculationSessionActive.exercices[0].series.filter(x => x.record).length };
  });
  assert.match(r.fete, /Nouveau record/);
  assert.deepEqual({ record: r.record, pop: r.pop, anneau: r.anneau, deuxieme: r.deuxieme, records: r.records }, { record: 1, pop: true, anneau: true, deuxieme: '', records: 1 });
}));

test('passe de saison : deux mois par saison, XP des séances, du cardio et des pesées, 50 paliers, cadre débloqué, tout repart de zéro à la saison suivante', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const res = {
      decoupe: [saisonDe('2026-11-09').id, saisonDe('2026-11-09').debut, saisonDe('2026-11-09').fin, saisonDe('2027-02-28').nom, saisonDe('2027-03-01').debut]
    };
    // La saison d'avant : 6 jours à 2 séances (une 3e le même jour ne compte pas), un record, un cardio, deux pesées.
    const prec = saisonDe(shiftDate(saisonDe(todayStr()).debut, -1));
    for (let k = 0; k < 6; k++) {
      const d = shiftDate(prec.debut, k);
      for (let n = 0; n < (k === 0 ? 3 : 2); n++) musculationHistorique.push({ id: 'p' + k + n, date: d, programmeNom: 'Test',
        exercices: [{ exerciceId: 'x', nom: 'X', series: [{ poids: 50, reps: 8, fait: true, record: k === 0 && n === 0 }] }] });
    }
    const j1 = getDay(shiftDate(prec.debut, 1)); j1.workouts.push({ type: 'course', time: 30, distance: 5, intensite: 2 }); j1.weight = 80; saveData(shiftDate(prec.debut, 1));
    const j2 = getDay(shiftDate(prec.debut, 2)); j2.weight = 79.8; saveData(shiftDate(prec.debut, 2));
    const p = passeSaison(prec);
    res.detail = [p.detail.muscu, p.detail.record, p.detail.cardio, p.detail.pesee, p.detail.journee];
    res.defis = p.detail.defiSemaine % 150 === 0 && p.xp === Object.values(p.detail).reduce((a, b) => a + b, 0);
    res.palier = p.palier >= 5 && p.palier === Math.floor(p.xp / 250);
    // La saison en cours repart de zéro ; le cadre Bronze (palier 5), gagné avant, reste.
    res.enCours = passeSaison().detail.muscu;
    allerA('reglages'); renderVitrineProfil();
    const q = sel => document.querySelectorAll('#vitrine-badges ' + sel).length;
    res.vue = { paliers: q('.sp-n'), recompenses: q('.sp-n.rec'), defis: q('.sp-defi'), cadres: q('.sp-cadre'), verrous: q('.sp-cadre.verrou'), classement: q('.carte-saison-cl') };
    res.cadreParDefaut = !!document.querySelector('#vitrine-profil .pf-av.cadre-av');
    choisirCadre('aucun');
    res.sansCadre = !document.querySelector('#vitrine-profil .pf-av.cadre-av') && userProfile.cadre === 'aucun';
    document.querySelector('#vitrine-badges .sp-cadre:not(.verrou):not(.on)').click();
    res.choisi = [userProfile.cadre, !!document.querySelector('#vitrine-profil .pf-av.cadre-av')];
    // Classement de la saison : un gymbro qui a publié sa saison en cours.
    gymbroLiens = [{ pseudo: 'carl', sens: 'envoyee', statut: 'acceptee' }];
    saisonsGymbros = [{ pseudo: 'carl', saison: { id: saisonDe(todayStr()).id, xp: 900, palier: 99, cadre: 'or' } }, { pseudo: 'vieux', saison: { id: prec.id, xp: 5000 } }];
    renderVitrineProfil();
    res.gymbros = [...document.querySelectorAll('#vitrine-badges .carte-saison-cl .gcl b')].map(b => b.textContent);
    res.palierGymbro = document.querySelector('#vitrine-badges .carte-saison-cl .gcl .gcl-sous').textContent;
    return res;
  });
  assert.deepEqual(r.decoupe, ['2026-6', '2026-11-01', '2026-12-31', 'Résolution', '2027-03-01']);
  assert.deepEqual(r.detail, [1200, 50, 60, 20, 0]);
  assert.equal(r.defis, true);
  assert.equal(r.palier, true);
  assert.equal(r.enCours, 0);
  assert.deepEqual(r.vue, { paliers: 50, recompenses: 10, defis: 3, cadres: 6, verrous: 4, classement: 0 });
  assert.equal(r.cadreParDefaut, true);
  assert.equal(r.sansCadre, true);
  assert.deepEqual(r.choisi, ['bronze', true]);
  assert.deepEqual(r.gymbros, ['@carl', 'Toi']);
  assert.equal(r.palierGymbro, 'Palier 3', 'le palier se recalcule d\'après l\'XP publiée');
}));

test('défis entre gymbros : mon score vient de mes séances, dépassé = bandeau, premier à la fin = badge et XP, invitation, lancer un défi', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page, () => ({}));
  const r = await page.evaluate(async () => {
    const auj = todayStr(), exo = toutesLesExercices().find(e => e.groupe === 'pectoraux');
    monPseudo = { pseudo: 'jamal', partage_seances: true };
    gymbroLiens = [{ pseudo: 'carl', sens: 'envoyee', statut: 'acceptee' }];
    window.__rep['rpc:gymbro_mes_liens'] = [{ pseudo: 'carl', sens: 'envoyee', statut: 'acceptee' }];
    // 80 kg × 5 avant-hier, 85 kg × 3 hier ; l'échauffement à 100 kg ne compte pas.
    musculationHistorique.push({ id: 's1', date: shiftDate(auj, -2), exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 80, reps: 5, fait: true }] }] });
    musculationHistorique.push({ id: 's2', date: shiftDate(auj, -1), exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 85, reps: 3, fait: true }, { poids: 100, reps: 1, fait: true, technique: 'echauffement' }] }] });
    const id1 = '11111111-1111-4111-8111-111111111111', id2 = '22222222-2222-4222-8222-222222222222', id3 = '33333333-3333-4333-8333-333333333333';
    window.__rep['rpc:mes_defis'] = [
      { id: id1, createur: 'carl', exercice_id: exo.id, exercice_nom: exo.nom, critere: 'charge', debut: shiftDate(auj, -3), fin: shiftDate(auj, 10), mon_statut: 'accepte',
        membres: [{ pseudo: 'carl', statut: 'accepte', score: 90 }, { pseudo: 'jamal', statut: 'accepte', score: 80 }] },
      { id: id2, createur: 'jamal', exercice_id: exo.id, exercice_nom: exo.nom, critere: 'tonnage', debut: shiftDate(auj, -9), fin: shiftDate(auj, -1), mon_statut: 'accepte',
        membres: [{ pseudo: 'jamal', statut: 'accepte', score: 655 }, { pseudo: 'carl', statut: 'accepte', score: 300 }] },
      { id: id3, createur: 'carl', exercice_id: 'autre', exercice_nom: '<img src=x onerror="window.__pirate=1">', critere: 'reps', debut: auj, fin: shiftDate(auj, 6), mon_statut: 'invite',
        membres: [{ pseudo: 'carl', statut: 'accepte', score: 0 }, { pseudo: 'jamal', statut: 'invite', score: 0 }] },
      { id: 'pas-un-identifiant', debut: auj, fin: auj, membres: [] }
    ];
    // J'étais premier au dernier passage : carl (90 kg) est passé devant.
    localStorage.setItem('askesis_defis_rangs', JSON.stringify({ [id1]: 1 }));
    await chargerDefis(true);
    const res = {
      defis: defisGymbros.length,
      scores: window.__appels.filter(a => a[0] === 'rpc' && a[1] === 'defi_score').map(a => [a[2].p_defi === id1, a[2].p_score]),
      toast: (document.getElementById('toast-defi') || {}).textContent || '',
      gagnes: JSON.parse(localStorage.getItem('askesis_defis_gagnes') || '[]').map(g => g.id === id2),
      fete: (document.getElementById('celebration') || {}).textContent || '',
      xp: passeSaison(saisonDe(shiftDate(auj, -1))).detail.defiGymbro,
      invitations: invitationsDefis().length
    };
    ouvrirGymbro('classement');
    const zone = document.getElementById('gymbro-vue-classement');
    res.cartes = [zone.querySelectorAll('.gdf').length, zone.querySelectorAll('.gdf--invite').length, zone.querySelectorAll('img[src="x"]').length, !!window.__pirate];
    res.moi = [...zone.querySelectorAll('.gdf')].map(c => { const m = c.querySelector('.gcl.moi em'); return m ? m.textContent : null; });
    res.coupe = zone.textContent.includes('🏆');
    await repondreDefi(id3, true);
    res.reponse = window.__appels.filter(a => a[1] === 'defi_repondre').map(a => a[2]);
    // Lancer un défi : l'exercice le plus fait est déjà choisi.
    ouvrirNouveauDefi();
    choisirDefi('jours', 7); choisirDefi('critere', 'reps');
    res.ouverte = document.getElementById('modal-defi').classList.contains('show') && !document.getElementById('defi-lancer').disabled;
    await lancerDefi();
    const c = window.__appels.filter(a => a[1] === 'defi_creer').map(a => a[2])[0];
    res.creation = c && [c.p_exercice_id === exo.id, c.p_critere, c.p_jours, c.p_debut === auj, c.p_pseudos];
    allerA('reglages'); renderVitrineProfil();
    res.vitrine = [...document.querySelectorAll('#vitrine-badges .badge b')].some(b => b.textContent === 'Vainqueur');
    res.exo = exo.nom;
    return res;
  });
  assert.equal(r.defis, 3, 'un défi mal formé est ignoré');
  assert.deepEqual(r.scores, [[true, 85]], 'seul le score qui a changé est publié');
  assert.equal(r.toast, `@carl t’a dépassé : ${r.exo}Voir`);
  assert.deepEqual(r.gagnes, [true]);
  assert.match(r.fete, /Défi gagné/);
  assert.equal(r.xp, 200);
  assert.equal(r.invitations, 1);
  assert.deepEqual(r.cartes, [3, 1, 0, false]);
  assert.deepEqual(r.moi, [null, '85kg', '655kg']);
  assert.equal(r.coupe, true);
  assert.deepEqual(r.reponse, [{ p_defi: '33333333-3333-4333-8333-333333333333', p_accepte: true }]);
  assert.equal(r.ouverte, true);
  assert.deepEqual(r.creation, [true, 'reps', 7, true, ['carl']]);
  assert.equal(r.vitrine, true);
}));

test('trophées : un badge tout juste gagné est fêté, une seule fois', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    localStorage.setItem('anqaa_trophees', JSON.stringify({ niveau: 1, badges: [] }));
    for (let k = 0; k < 3; k++) { const d = shiftDate(todayStr(), -k), j = getDay(d); j.meals[MEALS[0]].push({ name: 'Pomme', grams: 100, kcal: 52, p: 0, c: 14, f: 0 }); saveData(d); }
    renderApp();
    const fete = document.getElementById('celebration').textContent;
    document.getElementById('celebration').textContent = '';
    renderApp();
    return { fete, encore: document.getElementById('celebration').textContent, memo: JSON.parse(localStorage.getItem('anqaa_trophees')).badges };
  });
  assert.match(r.fete, /Badge débloqué : Série/);
  assert.equal(r.encore, '');
  assert.ok(r.memo.includes('serie'));
}));

test('trophées : un badge déjà gagné n\'est pas refêté quand ses données arrivent après le démarrage', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const d = todayStr(), j = getDay(d); j.meals[MEALS[0]].push({ name: 'Pomme', grams: 100, kcal: 52, p: 0, c: 14, f: 0 }); saveData(d);
    localStorage.setItem('anqaa_trophees', JSON.stringify({ niveau: niveauUtilisateur().n, badges: ['gymbro'] }));
    const fete = () => { const c = document.getElementById('celebration'); const t = c ? c.textContent : ''; if (c) c.textContent = ''; return t; };
    gymbroLiens = [];   // relance : la liste des gymbros n'est pas encore chargée
    renderApp(); const auDemarrage = fete();
    const memo = JSON.parse(localStorage.getItem('anqaa_trophees')).badges;
    gymbroLiens = [{ pseudo: 'carl', sens: 'envoyee', statut: 'acceptee' }];   // elle arrive
    renderApp(); const aLArrivee = fete();
    return { auDemarrage, aLArrivee, memo };
  });
  assert.equal(r.auDemarrage, '');
  assert.ok(r.memo.includes('gymbro'), 'le badge reste mémorisé');
  assert.equal(r.aLArrivee, '', 'pas de fête pour un badge déjà gagné');
}));

test('trophées : l\'arrivée des données au démarrage n\'est pas fêtée', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    renderApp(); // rien de noté : rien de mémorisé
    const avant = localStorage.getItem('anqaa_trophees');
    // Les données arrivent d'un coup (synchronisation) : plusieurs niveaux et badges.
    for (let k = 0; k < 25; k++) { const d = shiftDate(todayStr(), -k), j = getDay(d); j.meals[MEALS[0]].push({ name: 'Pomme', grams: 100, kcal: 52, p: 0, c: 14, f: 0 }); j.eauMl = 4000; saveData(d); }
    for (let k = 0; k < 12; k++) musculationHistorique.push({ id: 'h' + k, date: shiftDate(todayStr(), -k), exercices: [] });
    renderApp(); const premier = (document.getElementById('celebration') || {}).textContent || '';
    localStorage.setItem('anqaa_trophees', JSON.stringify({ niveau: 1, badges: [] }));
    renderApp(); const saut = (document.getElementById('celebration') || {}).textContent || '';
    return { avant, premier, saut };
  });
  assert.deepEqual(r, { avant: null, premier: '', saut: '' });
}));

test('animations : les chiffres défilent jusqu\'à leur valeur exacte', () => avecAppli({ animations: true }, async ({ page }) => {
  await page.evaluate(() => { const j = getDay(todayStr()); j.meals[MEALS[1]].push({ name: 'Riz', grams: 100, kcal: 1234, p: 3, c: 28, f: 0 }); saveData(todayStr()); allerA('repas'); renderApp(); });
  await page.waitForFunction(() => document.getElementById('total-kcals').textContent.replace(/\s/g, '') === '1234');
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('cardio'); });
  await page.waitForFunction(() => /^0/.test(document.querySelector('#seance-cardio .cardio-gros').textContent));
}));

test('bouton + : l\'action utile de chaque écran', () => avecAppli({}, async ({ page }) => {
  const ouvert = () => page.evaluate(() => [...document.querySelectorAll('.feuille.show, .modal.show')].map(m => m.id).join(','));
  const fermer = () => page.evaluate(() => { fermerFeuilles(); document.querySelectorAll('.modal.show').forEach(m => fermerModal(m.id)); });
  await page.evaluate(() => { musculationProgrammes.push({ id: 'pz', nom: 'Jambes', exercices: [], maj: Date.now() }); allerA('repas'); });
  await page.click('#onglet-plus'); assert.equal(await ouvert(), 'feuille-repas'); await fermer();
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('muscu'); });
  assert.equal(await page.getAttribute('#onglet-plus', 'aria-label'), 'Lancer une séance');
  await page.click('#onglet-plus'); assert.equal(await ouvert(), 'feuille-activite');
  assert.match(await page.textContent('#opt-seance-jour'), /Séance du jour\s*Jambes/);
  await page.click('#opt-seance-jour'); assert.equal(await ouvert(), 'apercu-programme-modal'); await fermer();
  await page.evaluate(() => choisirModeSeance('cardio'));
  await page.click('#onglet-plus'); assert.equal(await ouvert(), 'modal-cardio'); await fermer();
  // Progrès : pas de + (grisé, rien ne s'ouvre), sur tous les onglets.
  for (const o of ['resume', 'poids', 'muscu']) {
    await page.evaluate(o => ouvrirStats(o), o);
    assert.equal(await page.isDisabled('#onglet-plus'), true);
    await page.evaluate(() => actionPlus()); assert.equal(await ouvert(), '');
  }
  // Profil : pas de + non plus (masqué, à sa place), comme sur la barre native.
  await page.evaluate(() => allerA('reglages'));
  assert.equal(await page.isDisabled('#onglet-plus'), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('onglet-plus')).visibility), 'hidden');
  // Séance en cours : plein écran, barre d'onglets cachée ; l'ajout d'exercice
  // passe par le bouton de la séance, « Réduire » ramène à l'écran d'avant.
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('muscu'); demarrerSeanceLibre(); });
  assert.equal(await page.getAttribute('#onglet-plus', 'aria-label'), 'Ajouter un exercice');
  assert.equal(await page.evaluate(() => document.body.classList.contains('mode-seance')), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.onglets')).pointerEvents), 'none');
  await page.click('#seance-vue-active button:has-text("Ajouter un exercice")'); assert.equal(await ouvert(), 'picker-exercices-modal'); await fermer();
  await page.click('.seance-reduire');
  assert.deepEqual(await page.evaluate(() => [ecranActif, document.body.classList.contains('mode-seance'), document.getElementById('bandeau-seance-flottant').classList.contains('hidden')]), ['reglages', false, false]);
  await page.click('#bandeau-seance-flottant');
  assert.deepEqual(await page.evaluate(() => [ecranActif, document.body.classList.contains('mode-seance')]), ['seance', true]);
}));

test("séance en cours : en-tête (chrono, avancée, corps) et un mini-cadran par muscle", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    musculationProgrammes.push({ id: 'pc', nom: 'Push', exercices: [{ exerciceId: exo.id, series: [{ poids: 60, reps: 8 }, { poids: 60, reps: 8 }, { poids: 60, reps: 8 }] }], maj: Date.now() });
    allerA('seance'); demarrerSeance('pc');
    basculerSerieSession(0, 0);
    const res = {};
    res.titre = document.getElementById('titre-session-modal').textContent;
    res.chrono = /^\d+:\d{2}$/.test(document.getElementById('session-chrono').textContent);
    res.avancee = document.querySelector('#session-progression .sh-prog-t').textContent.replace(/\s+/g, ' ').trim();
    res.corps = !!document.querySelector('#session-corps svg.corps-svg');
    const c = document.querySelector('#session-zones .mc');
    res.cadran = [c.querySelector('.mc-n').textContent, c.querySelector('.mc-a').textContent];
    c.click();
    res.detail = document.querySelector('#session-zones .mc-detail').textContent;
    document.querySelector('#session-zones .mc').click();
    res.ferme = !document.querySelector('#session-zones .mc-detail');
    basculerCorpsSession();
    res.agrandi = document.getElementById('session-entete').classList.contains('agrandi');
    return res;
  });
  assert.equal(r.titre, 'Push');
  assert.ok(r.chrono, 'chrono en minutes:secondes');
  assert.equal(r.avancee, '1/3 séries · exo 1/1');
  assert.ok(r.corps);
  assert.deepEqual(r.cadran, ['Pectoraux', '+1 auj.']);
  assert.match(r.detail, /^Pectoraux · .* dont 1 aujourd'hui\./);
  assert.ok(r.ferme);
  assert.ok(r.agrandi);
}));

test('vidéos HD : préchargées au démarrage de la séance, reprises telles quelles par la fiche et l\'agrandissement', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    // Une vidéo ajoutée dans Administration (plus aucune vidéo tierce par défaut).
    const exo = toutesLesExercices().find(e => !e.perso && typeof e.video !== 'string');
    exo.video = 'https://exemple.fr/demo.mp4';
    const url = videoExercice(exo).video;
    musculationProgrammes.push({ id: 'pv', nom: 'Test', exercices: [{ exerciceId: exo.id, series: [{ poids: 20, reps: 8 }] }], maj: Date.now() });
    allerA('seance'); demarrerSeance('pv');
    const prechargee = videosHD.get(url);
    afficherFicheExerciceBiblio(exo.id);
    const fiche = document.querySelector('#fiche-exercice-container video.hd');
    agrandirVideoExercice(exo.id);
    const zoom = document.querySelector('#video-zoom-media video.hd');
    fermerVideoExercice();
    return { prechargee: !!prechargee, memeFiche: fiche === prechargee, memeZoom: zoom === prechargee,
      revenue: document.querySelector('#fiche-exercice-container video.hd') === prechargee, src: fiche && fiche.getAttribute('src') === url };
  });
  assert.deepEqual(r, { prechargee: true, memeFiche: true, memeZoom: true, revenue: true, src: true });
}));

test("frictions : confirmation de l'appli (plus de fenêtre du navigateur), série supprimée avec Annuler, quantité prête à taper, mot de passe plus gardé", () => avecAppli({}, async ({ page, dialogues }) => {
  // Vraie fenêtre de l'appli : Abandonner une séance demande confirmation.
  await page.evaluate(() => {
    confirmer = window.__confirmerReel; informer = window.__informerReel;
    const exo = toutesLesExercices()[0];
    musculationProgrammes.push({ id: 'pf', nom: 'Test', exercices: [{ exerciceId: exo.id, series: [{ poids: 20, reps: 8 }, { poids: 20, reps: 8 }] }], maj: Date.now() });
    allerA('seance'); demarrerSeance('pf');
    abandonnerSeance();
  });
  await page.waitForSelector('#modal-dialogue.show');
  assert.match(await page.textContent('#dialogue-texte'), /Abandonner cette séance/);
  assert.equal(await page.textContent('#dialogue-oui'), 'Abandonner');
  await page.click('#dialogue-non');
  assert.ok(await page.evaluate(() => !!musculationSessionActive), 'Annuler garde la séance');
  // alert() passe aussi par la fenêtre de l'appli.
  await page.evaluate(() => alert('Bonjour'));
  await page.waitForSelector('#modal-dialogue.show');
  assert.equal(await page.isHidden('#dialogue-non'), true);
  await page.click('#dialogue-oui');
  // Série supprimée tout de suite, avec Annuler.
  await page.evaluate(() => retirerSerieSession(0, 1));
  assert.equal(await page.evaluate(() => musculationSessionActive.exercices[0].series.length), 1);
  await page.click('#toast-annuler button');
  assert.equal(await page.evaluate(() => musculationSessionActive.exercices[0].series.length), 2);
  // Aliment choisi : la quantité est sélectionnée, prête à être remplacée.
  const q = await page.evaluate(() => {
    ouvrirManuel('lunch');
    selectionnerProduitOFF({ name: 'Riz cuit', nutriments: { 'energy-kcal_100g': 130 } });
    const c = document.activeElement;
    return { id: c.id, tout: c.selectionStart === 0 && c.selectionEnd === c.value.length };
  });
  assert.deepEqual(q, { id: 'man-grams', tout: true });
  // « Se souvenir de moi » : plus de case, plus de mot de passe gardé.
  const mdp = await page.evaluate(() => {
    localStorage.setItem('mc_identifiants_sauvegardes', JSON.stringify({ email: 'a@b.fr', mdp: 'secret' }));
    tenterConnexionAutomatique();
    return { reste: localStorage.getItem('mc_identifiants_sauvegardes'), caseSouvenir: !!document.getElementById('compte-souvenir') };
  });
  assert.deepEqual(mdp, { reste: null, caseSouvenir: false });
  assert.equal(dialogues.length, 0, 'aucune fenêtre du navigateur');
}));

test('séance : pavé de saisie à la salle (− / +, pas selon le matériel, valider)', () => avecAppli({}, async ({ page }) => {
  const r0 = await page.evaluate(() => {
    const exo = toutesLesExercices().find(e => e.materiel === 'barre');
    musculationHistorique.push({ id: 'h1', date: shiftDate(todayStr(), -2), exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 60, reps: 8, fait: true }, { poids: 60, reps: 8, fait: true }] }] });
    allerA('seance'); demarrerSeanceLibre(); ajouterExerciceASession(exo.id);
    const s = musculationSessionActive.exercices[0].series; s.forEach(x => { x.poids = null; x.reps = null; }); renderSessionModal();
    return { paves: document.querySelectorAll('.serie-pave').length, poids: document.getElementById('pave-poids-0_0').value, reps: document.getElementById('pave-reps-0_0').value,
      ligne: !!document.getElementById('serie-poids-0_0'), titre: document.querySelector('#pave-0_0 .pave-titre').textContent,
      prec: document.querySelector('#pave-0_0 .pave-prec').textContent, numero: !!document.querySelector('#pave-0_0 .serie-num-btn'), typeBouton: document.querySelector('#pave-0_0 .pave-titre').tagName };
  });
  // Pré-rempli avec la dernière perf, un seul pavé (la série à faire), qui
  // remplace sa ligne : numéro, perf précédente et validation sont dedans.
  assert.deepEqual(r0, { paves: 1, poids: '60', reps: '8', ligne: false, titre: 'Série 1', prec: 'Préc. 60kg×8', numero: false, typeBouton: 'BUTTON' });
  const plus = '#pave-0_0 .pave-champ:has(#pave-poids-0_0) .pave-btn:last-of-type';
  await page.click(plus); await page.click(plus);
  await page.click('#pave-0_0 .pave-champ:has(#pave-reps-0_0) .pave-btn:first-of-type');
  let r = await page.evaluate(() => ({ poids: document.getElementById('pave-poids-0_0').value, valeur: musculationSessionActive.exercices[0].series[0].poids, reps: document.getElementById('pave-reps-0_0').value }));
  assert.deepEqual(r, { poids: '65', valeur: 65, reps: '7' }); // barre : 2,5 kg par pas
  await page.click('#pave-0_0 .pave-valider');
  r = await page.evaluate(() => ({ fait: musculationSessionActive.exercices[0].series[0].fait, valeurs: [musculationSessionActive.exercices[0].series[0].poids, musculationSessionActive.exercices[0].series[0].reps], pave: !!document.getElementById('pave-0_1'), suivant: document.getElementById('pave-poids-0_1').value, ligne: !!document.getElementById('serie-poids-0_0') }));
  // Validée ; le pavé passe à la série suivante, qui reprend la charge ; la série faite redevient une ligne.
  assert.deepEqual(r, { fait: true, valeurs: [65, 7], pave: true, suivant: '65', ligne: true });
  // Toucher le chiffre pour taper une valeur (virgule acceptée).
  await page.fill('#pave-poids-0_1', '72,5');
  await page.press('#pave-poids-0_1', 'Enter');
  await page.locator('#pave-poids-0_1').evaluate(el => el.blur());
  r = await page.evaluate(() => ({ valeur: musculationSessionActive.exercices[0].series[1].poids, affiche: document.getElementById('pave-poids-0_1').value }));
  assert.deepEqual(r, { valeur: 72.5, affiche: '72,5' });
  // « Série 2 ▾ » ouvre le type de série.
  await page.click('#pave-0_1 .pave-titre');
  await page.click('#menu-technique-popup button[onclick="choisirTechniqueMenu(\'degressif\')"]');
  r = await page.evaluate(() => ({ technique: musculationSessionActive.exercices[0].series[1].technique, titre: document.querySelector('#pave-0_1 .pave-titre').textContent }));
  assert.deepEqual(r, { technique: 'degressif', titre: 'Série 2 · Dégressif' });
}));

test('Bibliothèque : chaque exercice compté pour le bon muscle, le cardio hors du volume, aucun nom en double', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = nom => (EXERCICES_BASE.find(e => e.nom === nom) || {}).groupe;
    const noms = EXERCICES_BASE.map(e => e.nom);
    return {
      groupes: ['Soulevé de terre roumain', 'Soulevé de terre', 'Hip thrust à la barre', 'Hip thrust avec haltère', 'Good morning avec barre', 'Butterfly inversé',
        'Développé poussé avec barre', 'Rameur', 'Course à pied', 'Extension du dos', 'Squat', 'Développé couché avec barre', 'Traction'].map(g),
      doublons: noms.filter((n, i) => noms.indexOf(n) !== i),
      cardioAvecSecondaires: EXERCICES_BASE.filter(e => e.groupe === 'cardio' && (e.secondaires || []).length).map(e => e.nom),
      principalEnSecondaire: EXERCICES_BASE.filter(e => (e.secondaires || []).includes(e.groupe)).map(e => e.nom)
    };
  });
  assert.deepEqual(r.groupes, ['ischios', 'ischios', 'fessiers', 'fessiers', 'ischios', 'epaules', 'epaules', 'cardio', 'cardio', 'lombaires', 'quadriceps', 'pectoraux', 'dos']);
  assert.deepEqual(r.doublons, []);
  assert.deepEqual(r.cardioAvecSecondaires, [], 'une course ne compte pas dans le volume de musculation');
  assert.deepEqual(r.principalEnSecondaire, []);
}));

test('séance du jour : le programme suivant dans l\'ordre de la liste', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    ['A', 'B', 'C'].forEach(n => musculationProgrammes.push({ id: 'p' + n, nom: n, exercices: [], maj: Date.now() }));
    const fait = (id, k) => musculationHistorique.unshift({ id: 'h' + id + k, programmeId: id, programmeNom: id, date: shiftDate(todayStr(), -k), fin: Date.now() - k * 1000, exercices: [] });
    const res = [programmeSuggere().p.nom];   // rien de fait : le premier
    fait('pB', 2); res.push(programmeSuggere().p.nom);   // après B : C
    fait('pA', 5); res.push(programmeSuggere().p.nom);   // A plus ancien : toujours C
    fait('pC', 1); res.push(programmeSuggere().p.nom);   // après C, le dernier : retour à A
    musculationHistorique.unshift({ id: 'libre', programmeId: null, date: todayStr(), exercices: [] });
    res.push(programmeSuggere().p.nom);   // une séance vide ne compte pas
    allerA('seance'); choisirModeSeance('muscu');
    res.push(document.querySelector('#vitrine-muscu .sdj h4').textContent);
    return res;
  });
  assert.deepEqual(r, ['A', 'C', 'C', 'A', 'A', 'A']);
}));

test('séance du jour : le corps se montre du côté où le programme travaille le plus (« Dos Biceps » de dos)', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = g => toutesLesExercices().filter(e => e.groupe === g).map(e => e.id);
    const prog = (nom, groupes) => {
      const vus = {};
      return { id: 'p' + nom, nom, maj: Date.now(), exercices: groupes.map(g => { vus[g] = (vus[g] || 0) + 1; return { exerciceId: ids(g)[vus[g] - 1], series: [{ poids: 20, reps: 10 }] }; }) };
    };
    // Planche du dos à droite de celle de face ; cadrage des jambes plus bas.
    const vue = sel => { const vb = document.querySelector(sel + ' svg').getAttribute('viewBox').split(' ').map(Number); return (vb[0] > 700 ? 'dos' : 'face') + (vb[1] >= 600 ? ' jambes' : ''); };
    const cas = { 'Dos Biceps': ['dos', 'dos', 'biceps', 'biceps', 'lombaires'], Push: ['pectoraux', 'pectoraux', 'epaules', 'triceps'],
      Jambes: ['quadriceps', 'ischios', 'ischios', 'mollets'], 'Biceps Dos': ['biceps', 'dos'], 'Dos et biceps': ['dos', 'biceps'] };
    const res = {};
    Object.entries(cas).forEach(([nom, groupes]) => {
      musculationProgrammes = [prog(nom, groupes)];
      allerA('seance'); choisirModeSeance('muscu');
      const vues = [vue('#vitrine-muscu .sdj-corps'), vue('#programmes-liste-container .pc-corps')];
      ouvrirFeuilleActivite(); vues.push(vue('#opt-seance-jour .sdj-corps')); fermerFeuilles();
      apercuProgramme(musculationProgrammes[0].id); vues.push(vue('#apercu-programme-heros .prog-heros-corps')); fermerModal('apercu-programme-modal');
      res[nom] = vues.join(' | ');
      if (nom === 'Dos Biceps') {
        res.allumes = document.querySelectorAll('#vitrine-muscu .sdj-corps path[fill="var(--corps-cible)"]').length;
        // Les muscles, puis le nombre d'exercices sur sa propre ligne (« 5 » et « exercices » jamais séparés).
        res.sousTitre = document.querySelector('#vitrine-muscu .sdj p').innerHTML;
      }
    });
    return res;
  });
  const quatre = v => [v, v, v, v].join(' | ');
  assert.deepEqual(r, { 'Dos Biceps': quatre('dos'), Push: quatre('face'), Jambes: quatre('dos jambes'), 'Biceps Dos': quatre('face'), 'Dos et biceps': quatre('dos'), allumes: r.allumes, sousTitre: 'Dos, Biceps, Lombaires<br>5&nbsp;exercices' });
  assert.ok(r.allumes >= 4, 'dos et lombaires allumés : ' + r.allumes);
}));

test("bibliothèque : muscles secondaires d'un exercice personnalisé, à la création et à la modification, comptés pour moitié", () => avecAppli({}, async ({ page }) => {
  const puces = sel => page.evaluate(sel => ({ proposes: [...document.querySelectorAll(sel + ' .puce-groupe')].map(b => b.dataset.groupe),
    choisis: [...document.querySelectorAll(sel + ' .puce-groupe[aria-pressed="true"]')].map(b => b.textContent) }), sel);
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('muscu'); ouvrirBibliotheque(); });
  await page.click('#picker-exercices-modal button:has-text("Créer un exercice personnalisé")');
  await page.fill('#perso-nom', 'Rowing assis machine');
  await page.selectOption('#perso-groupe', 'dos');
  await page.click('#perso-secondaires .puce-groupe:has-text("Biceps")');
  await page.click('#perso-secondaires .puce-groupe:has-text("Avant-bras")');
  const creation = await puces('#perso-secondaires');
  // En-tête : le principal en rose franc, les secondaires visibles (vue de dos : avant-bras) en rose atténué.
  const attenues = await page.evaluate(() => document.querySelectorAll('#perso-heros path[fill^="color-mix"]').length);
  const surtitre = () => page.evaluate(() => document.querySelector('#perso-heros small').textContent);
  const surtitreCreation = await surtitre();
  await page.click('#perso-valider-btn');
  const r = await page.evaluate(() => {
    const e = musculationExosPerso[musculationExosPerso.length - 1];
    document.getElementById('picker-recherche').value = 'rowing assis machine';
    rendrePickerExercices();
    return { id: e.id, groupe: e.groupe, secondaires: e.secondaires, ligne: document.querySelector('#picker-liste-exercices .exo-ligne .exo-ligne-meta').textContent,
      series: ajouterSeriesParGroupe({}, [{ exerciceId: e.id, series: [1, 2, 3].map(() => ({ poids: 40, reps: 10, fait: true })) }]) };
  });
  assert.equal(creation.proposes.includes('dos'), false, 'le principal n\'est pas proposé en secondaire');
  assert.equal(creation.proposes.length, 13);
  assert.deepEqual(creation.choisis, ['Biceps', 'Avant-bras']);
  assert.ok(attenues > 0);
  assert.deepEqual([r.groupe, r.secondaires, r.ligne], ['dos', ['biceps', 'avant_bras'], 'Dos Biceps, Avant-bras']);
  assert.deepEqual(r.series, { dos: 3, biceps: 1.5, avant_bras: 1.5 });
  // Modifier depuis la fiche : les secondaires reviennent cochés ; un nouveau principal en sort.
  await page.evaluate(id => { afficherFicheExerciceBiblio(id); choisirOngletFiche('technique'); }, r.id);
  await page.click('#fiche-exercice-container button:has-text("Modifier cet exercice")');
  const avant = await puces('#perso-secondaires');
  assert.deepEqual([surtitreCreation, await surtitre()], ['Nouvel exercice', 'Exercice personnalisé']);
  await page.selectOption('#perso-groupe', 'biceps');
  const apres = await puces('#perso-secondaires');
  await page.click('#perso-valider-btn');
  const modifie = await page.evaluate(id => { const e = musculationExosPerso.find(x => x.id === id); return [e.groupe, e.secondaires]; }, r.id);
  assert.deepEqual(avant.choisis, ['Biceps', 'Avant-bras']);
  assert.deepEqual([apres.proposes.includes('biceps'), apres.proposes.includes('dos'), apres.choisis], [false, true, ['Avant-bras']]);
  assert.deepEqual(modifie, ['biceps', ['avant_bras']]);
}));

test("Administration : muscles secondaires d'un exercice de la base, modifiables depuis sa fiche", () => avecAppli({}, async ({ page }) => {
  const serveur = creerServeur();
  await brancherServeur(page, serveur, 'u1');
  const r = await page.evaluate(async () => {
    const e = toutesLesExercices().find(x => x.nom === 'Rowing barre buste penché');
    const bouton = () => [...document.querySelectorAll('#fiche-exercice-container button')].find(b => /Modifier pour tous/.test(b.textContent));
    afficherFicheExerciceBiblio(e.id);
    const res = { id: e.id, horsAdmin: !!bouton() };
    fermerModal('fiche-exercice-modal');
    sessionUtilisateur = { id: 'admin', email: ADMIN_EMAIL };
    ouvrirBibliotheque();
    afficherFicheExerciceBiblio(e.id);
    bouton().click();
    const modale = document.getElementById('modal-edit-exercice-admin');
    res.dessus = modale.classList.contains('show') && Number(getComputedStyle(modale).zIndex) > Number(getComputedStyle(document.getElementById('picker-exercices-modal')).zIndex);
    res.avant = choixSecondaires('edit-exo-secondaires');
    document.querySelector('#edit-exo-secondaires [data-groupe="triceps"]').click();
    res.faisceaux = [...document.querySelectorAll('#edit-exo-faisceaux .admin-faisceaux-groupe')].map(d => d.dataset.groupe);
    await sauvegarderEditionExerciceAdmin();
    res.ferme = !modale.classList.contains('show');
    res.base = trouverExercice(e.id).secondaires;
    return res;
  });
  const correction = serveur.tables.get('exercices_base_overrides').get(r.id);
  assert.deepEqual([r.horsAdmin, r.dessus, r.ferme], [false, true, true]);
  assert.deepEqual(r.avant, ['epaules', 'biceps', 'triceps', 'avant_bras']);
  assert.deepEqual(r.faisceaux, ['dos', 'epaules', 'biceps']);
  assert.deepEqual(correction.donnees.secondaires, ['epaules', 'biceps', 'avant_bras']);
  assert.deepEqual(r.base, ['epaules', 'biceps', 'avant_bras']);
}));

test('bibliothèque de base : les tirages comptent les biceps, les développés les triceps, les squats les fessiers', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const sec = nom => { const e = toutesLesExercices().find(x => x.nom === nom); if (!e) throw new Error('introuvable : ' + nom); return e.secondaires; };
    const res = {
      tractions: sec('Tractions lestées').includes('biceps'), rowing: sec('Rowing barre buste penché').includes('biceps'),
      brasTendus: sec('Tirage vertical bras tendus').includes('biceps'), pullover: sec('Pull-over à la machine').includes('biceps'),
      smith: ['triceps', 'epaules'].every(g => sec('Développé couché à la Smith machine').includes(g)),
      epaules: sec('Développé épaules avec haltères').includes('triceps'),
      overhead: sec('Squat avec barre au-dessus de la tête').includes('fessiers'), sissy: sec('Squat sissy pondéré en position agenouillée').includes('fessiers')
    };
    // Une séance « Dos » : chaque série de rowing compte une demi-série de biceps.
    const e = toutesLesExercices().find(x => x.nom === 'Rowing barre buste penché');
    res.series = ajouterSeriesParGroupe({}, [{ exerciceId: e.id, series: [1, 2, 3, 4].map(() => ({ poids: 60, reps: 10, fait: true })) }]).biceps;
    return res;
  });
  assert.deepEqual(r, { tractions: true, rowing: true, brasTendus: false, pullover: false, smith: true, epaules: true, overhead: true, sissy: false, series: 2 });
}));

test("bibliothèque : les doublons sont fusionnés, programmes et séances passent sur l'exercice gardé", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = new Set(toutesLesExercices().map(e => e.id));
    const noms = toutesLesExercices().map(e => e.nom.toLocaleLowerCase('fr'));
    const res = {
      sourcesPresentes: Object.keys(FUSIONS_BIBLIOTHEQUE).filter(s => ids.has(s)),
      ciblesAbsentes: Object.values(FUSIONS_BIBLIOTHEQUE).filter(c => !ids.has(c)),
      ciblesFusionnees: Object.values(FUSIONS_BIBLIOTHEQUE).filter(c => FUSIONS_BIBLIOTHEQUE[c]),
      nomsEnDouble: noms.filter((n, i) => noms.indexOf(n) !== i),
      // L'ancienne fiche reste lisible pour les séances qui l'utilisaient.
      ancienneFiche: (trouverExercice('sw-kickboxing') || {}).nom
    };
    // Un programme et une séance passée sur un doublon passent sur l'exercice gardé.
    musculationProgrammes.push({ id: 'p-doublon', nom: 'Test', exercices: [{ exerciceId: 'sw-crunchs-en-bicyclette', nom: 'Crunchs en bicyclette', series: [] }] });
    musculationHistorique.unshift({ id: 'h-doublon', date: todayStr(), exercices: [{ exerciceId: 'sw-squat-gobelet', nom: 'Squat gobelet', series: [{ poids: 0, reps: 12, fait: true }] }] });
    appliquerOverridesBase([]);
    const p = musculationProgrammes.find(x => x.id === 'p-doublon').exercices[0];
    const h = musculationHistorique.find(x => x.id === 'h-doublon').exercices[0];
    res.programme = [p.exerciceId, p.nom];
    res.seance = [h.exerciceId, h.nom, h.series.length];
    // Une simple correction de l'admin (nom) sur un doublon ne le fait pas revenir.
    appliquerOverridesBase([{ id: 'sw-kickboxing', donnees: { nom: 'Kickboxing renommé' } }]);
    res.apresCorrection = toutesLesExercices().some(e => e.id === 'sw-kickboxing');
    // L'admin a fusionné dans l'autre sens : pas de boucle, l'exercice reste dans la bibliothèque.
    appliquerOverridesBase([{ id: 'e338', donnees: { fusionneVers: 'sw-curl-avec-halteres-en-supination' } }]);
    res.sensInverse = [toutesLesExercices().some(e => e.id === 'sw-curl-avec-halteres-en-supination'), toutesLesExercices().some(e => e.id === 'e338'), cibleFusion('e338')];
    return res;
  });
  assert.deepEqual([r.sourcesPresentes, r.ciblesAbsentes, r.ciblesFusionnees, r.nomsEnDouble], [[], [], [], []]);
  assert.equal(r.ancienneFiche, 'Kickboxing');
  assert.deepEqual(r.programme, ['e244', 'Crunch vélo']);
  assert.deepEqual(r.seance, ['sw-squat', 'Squat', 1]);
  assert.equal(r.apresCorrection, false);
  assert.deepEqual(r.sensInverse, [true, false, 'sw-curl-avec-halteres-en-supination']);
}));

test('bibliothèque : le matériel suit ce que montre la vignette (machine, barre, haltères…)', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const exo = nom => { const e = toutesLesExercices().find(x => x.nom === nom); if (!e) throw new Error('introuvable : ' + nom); return e.materiel + '/' + e.groupe; };
    return ['Développé couché à la machine', 'Squat avec barre basse', 'Élévation des mollets assis', 'Course sur tapis roulant', 'Épaulé avec kettlebell',
      'Traction en levier avant', 'Planche latérale avec coquille', 'Pompes prise serrée'].map(exo);
  });
  assert.deepEqual(r, ['machine/pectoraux', 'barre/quadriceps', 'machine/mollets', 'machine/cardio', 'kettlebell/dos',
    'poids_corps/dos', 'poids_corps/fessiers', 'poids_corps/triceps']);
}));

test("bibliothèque : un muscle choisi montre aussi les exercices où il est secondaire", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    ouvrirBibliotheque();
    choisirGroupePicker('biceps');
    const lire = () => ({ compte: document.getElementById('picker-resultats-compte').textContent,
      titres: [...document.querySelectorAll('#picker-liste-exercices .picker-titre-bloc')].map(t => t.textContent),
      noms: [...document.querySelectorAll('#picker-liste-exercices .exo-ligne-nom')].map(n => n.firstChild.textContent.trim()) });
    const res = { biceps: lire() };
    // Tous les biceps d'abord ; avec une recherche, seulement ceux qui le travaillent en secondaire.
    document.getElementById('picker-recherche').value = 'rowing barre buste';
    rendrePickerExercices();
    res.rowing = lire();
    const ligne = [...document.querySelectorAll('#picker-liste-exercices > *')].map(x => x.classList.contains('picker-titre-bloc') ? 'titre' : 'exercice');
    res.ordre = ligne.slice(0, 2);
    choisirGroupePicker('dos'); res.dos = lire().titres;
    return res;
  });
  assert.match(r.biceps.compte, /^\d+ exercices · \d+ en muscle secondaire$/);
  assert.deepEqual(r.biceps.titres, [], 'le premier paquet ne montre que des exercices de biceps');
  assert.ok(r.biceps.noms.length > 0);
  assert.deepEqual([r.rowing.compte, r.rowing.titres, r.ordre], ['2 en muscle secondaire', ['Travaillent aussi les biceps'], ['titre', 'exercice']]);
  assert.deepEqual(r.rowing.noms, ['Rowing barre buste penché', 'Rowing barre buste penché prise supination']);
  assert.deepEqual(r.dos, []);
}));

test('nouvelle version en ligne : bandeau « Mettre à jour » au retour dans l\'appli, seulement si le code a changé', () => avecAppli({}, async ({ page }) => {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const r = await page.evaluate(async html => {
    const res = {};
    // L'empreinte de la page qui tourne est celle du fichier : rien ne modifie ses styles et scripts en route.
    res.memeEmpreinte = empreinteDocument(document) === empreinteDocument(new DOMParser().parseFromString(html, 'text/html'));
    empreintePage = empreinteDocument(document);
    const appels = [];
    let reponse = html, etag = '"v1"';
    window.fetch = async (url, o) => { appels.push([String(url).replace(/^.*\//, ''), o && o.cache]); return new Response(reponse, { status: 200, headers: { etag } }); };
    const bandeau = () => !!document.querySelector('#toast-maj.visible');
    await verifierNouvelleVersion(true); res.identique = bandeau();
    reponse = '<!doctype html><title>Wi-Fi</title><p>Connecte-toi au réseau</p>'; etag = '"portail"';
    await verifierNouvelleVersion(true); res.portail = bandeau();
    reponse = html.replace('/* Le reflet spéculaire', 'window.x = 1;\n/* Le reflet spéculaire'); etag = '"v2"';
    await verifierNouvelleVersion(); res.tropTot = bandeau();   // moins d'une minute après la dernière vérification
    derniereVerifVersion = 0;
    await verifierNouvelleVersion(); res.nouvelle = bandeau();
    res.texte = document.getElementById('toast-maj').textContent;
    let recharge = false;
    rechargerPage = () => { recharge = true; };
    appels.length = 0;
    await mettreAJourAppli(document.querySelector('#toast-maj button'));
    res.miseAJour = [recharge, appels];
    return res;
  }, html);
  assert.equal(r.memeEmpreinte, true);
  assert.deepEqual([r.identique, r.portail, r.tropTot, r.nouvelle], [false, false, false, true]);
  assert.equal(r.texte, 'Nouvelle version disponibleMettre à jour×');
  assert.deepEqual(r.miseAJour, [true, [['', 'reload'], ['index.html', 'reload'], ['donnees.js', 'reload'], ['recettes.js', 'reload']]]);
}));

test('bilan de fin de séance : récapitulatif (tonnage, séries, records, écart), plus d\'avis IA', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const exo = toutesLesExercices().find(e => e.groupe === 'pectoraux');
    musculationProgrammes.push({ id: 'pb', nom: 'Pecs', exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 60, reps: 8 }, { poids: 60, reps: 8 }] }], maj: Date.now() });
    musculationHistorique.push({ id: 'h0', programmeId: 'pb', programmeNom: 'Pecs', date: shiftDate(todayStr(), -3), dureeMin: 40, exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 60, reps: 8, fait: true }, { poids: 60, reps: 8, fait: true }] }] });
    allerA('seance'); demarrerSeance('pb');
    musculationSessionActive.exercices[0].series.forEach(s => { s.poids = 70; s.reps = 8; s.fait = true; });
    terminerSeance();
    const z = document.getElementById('bilan-seance-recap');
    return { titre: z.querySelector('h4').textContent, tonnage: z.querySelector('.bilan-geant b').textContent.replace(/\s/g, ''),
      tuiles: [...z.querySelectorAll('.bilan-tuile b')].map(b => b.textContent), records: z.querySelectorAll('.bilan-records > div').length,
      ecart: z.querySelector('.bilan-ecart').textContent.trim(), ia: !!document.getElementById('bilan-seance-container') || /coach/i.test(document.getElementById('bilan-seance-modal').textContent) };
  });
  assert.deepEqual(r, { titre: 'Pecs', tonnage: '1120', tuiles: ['< 1', '2', '1'], records: 1, ecart: '▲ 17 % vs la dernière fois', ia: false });
}));

test('séance : repos à rebours réglable (retenu dans le programme), disques à la barre', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const exo = toutesLesExercices().find(e => e.materiel === 'barre');
    musculationProgrammes.push({ id: 'pr', nom: 'Force', exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids: 100, reps: 5 }, { poids: 100, reps: 5 }, { poids: 100, reps: 5 }] }], maj: Date.now() });
    allerA('seance'); demarrerSeance('pr'); replierTousExercicesSession(false);
    const res = { disques: document.getElementById('pave-disques-0_0').textContent.replace(/\s+/g, ' ').trim() };
    basculerSerieSession(0, 0);
    res.chrono = document.getElementById('repos-chrono-0_0').textContent;
    ajusterReposExo(0, 15);
    res.apres = document.getElementById('repos-chrono-0_0').textContent;
    res.retenu = musculationProgrammes.find(p => p.id === 'pr').exercices[0].repos;
    // Fin du repos : la barre passe à « Go ! »
    reposActifs['0_0'] = Date.now() - 106 * 1000; majReposActifs();
    res.fini = document.getElementById('repos-barre-0_0').classList.contains('fini');
    res.go = document.getElementById('repos-libelle-0_0').textContent;
    res.plus = document.getElementById('repos-chrono-0_0').textContent;
    return res;
  });
  assert.deepEqual(r, { disques: 'Par côté :2515', // 100 kg : 40 kg par côté = 25 + 15
    chrono: '1:30', apres: '1:45', retenu: 105, fini: true, go: 'Go !', plus: '+0:01' });
}));

test('repas : annuler une suppression, « Comme hier », favoris, pesée et pas rapides, eau libre, icônes', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const hier = shiftDate(todayStr(), -1), jh = getDay(hier);
    jh.meals[MEALS[0]].push({ name: "Flocons d'avoine", grams: 80, kcal: 300, p: 10, c: 50, f: 6 }, { name: 'Lait demi-écrémé', grams: 200, kcal: 92, p: 6, c: 10, f: 3 });
    saveData(hier);
    allerA('repas'); currentDate = todayStr(); renderApp();
    const res = {};
    // « Comme hier »
    ouvrirFeuilleRepas(MEALS[0]);
    res.hier = !document.getElementById('opt-hier').classList.contains('hidden') && document.getElementById('opt-hier-titre').textContent;
    copierRepasPrecedent();
    res.copies = getDay(todayStr()).meals[MEALS[0]].map(x => x.name);
    res.icones = [...document.querySelectorAll('#meals-container .food-initiale')].slice(0, 2).map(x => x.textContent);
    // Suppression puis annulation
    supprimerAliment(MEALS[0], 0);
    res.apresSuppr = getDay(todayStr()).meals[MEALS[0]].length;
    document.querySelector('#toast-annuler button').click();
    res.apresAnnul = getDay(todayStr()).meals[MEALS[0]].map(x => x.name);
    // Pesée rapide
    ouvrirSaisieRapide('poids'); document.getElementById('saisie-rapide-champ').value = 81.4; validerSaisieRapide();
    res.poids = [getDay(todayStr()).weight, userProfile.mesures[todayStr()].poids];
    // Pas : la carte « Pas du jour », au centre de la roulette, ouvre la saisie
    centrerCarteRoulette('carte-stats-pas', false); document.getElementById('carte-stats-pas').click();
    res.feuillePas = document.getElementById('feuille-saisie-rapide').classList.contains('show');
    document.getElementById('saisie-rapide-plus').click(); document.getElementById('saisie-rapide-plus').click(); validerSaisieRapide();
    res.pas = getDay(todayStr()).steps;
    // Eau libre
    const avant = Number(getDay(todayStr()).eauMl) || 0;
    ouvrirSaisieRapide('eau'); document.getElementById('saisie-rapide-champ').value = 330; validerSaisieRapide();
    res.eau = (Number(getDay(todayStr()).eauMl) || 0) - avant;
    // Favori : en tête de « Déjà mangé »
    const cle = historique().find(e => /lait/i.test(e.nom)).cle;
    basculerAlimentFavori(cle);
    res.favoriEnTete = chercherDansHistorique('')[0].name;
    return res;
  });
  assert.deepEqual(r, { hier: 'Comme hier', copies: ["Flocons d'avoine", 'Lait demi-écrémé'], icones: ['🥣', '🥛'], apresSuppr: 1, apresAnnul: ["Flocons d'avoine", 'Lait demi-écrémé'],
    poids: [81.4, 81.4], feuillePas: true, pas: 1000, eau: 330, favoriEnTete: 'Lait demi-écrémé' });
}));

test('thème « Auto » : suit le réglage clair/sombre du téléphone, même en cours de route ; flou coupé si moins de transparence', () => avecAppli({}, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => choisirTheme('auto'));
  const lire = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, pref: localStorage.getItem('elite_theme'),
    actif: document.querySelector('#segment-theme [aria-pressed="true"], #segment-theme .actif')?.textContent.trim() || null }));
  const sombre = await lire();
  await page.emulateMedia({ colorScheme: 'light' });
  // Le navigateur signale le changement à la prochaine image : on l'attend.
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light', null, { timeout: 3000 }).catch(() => {});
  const clair = await lire();
  assert.deepEqual([sombre.theme, sombre.pref, clair.theme, clair.pref], ['dark', 'auto', 'light', 'auto']);
  assert.equal(clair.actif, 'Auto');
  // Un choix explicite ne bouge plus avec le système.
  await page.evaluate(() => choisirTheme('dark'));
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal((await lire()).theme, 'dark');
  // Flou derrière les fenêtres : présent d'ordinaire, coupé avec « réduire la transparence » ou peu de mémoire.
  const flou = () => page.evaluate(() => getComputedStyle(document.querySelector('.modal')).backdropFilter);
  // Un changement de thème retire le flou une image (deux fois, à 80 ms d'écart) pour forcer le repeint.
  await page.waitForFunction(() => !document.documentElement.classList.contains('theme-repaint'));
  await page.waitForTimeout(200);
  assert.notEqual(await flou(), 'none');
  await page.evaluate(() => document.documentElement.classList.add('flou-leger'));
  assert.equal(await flou(), 'none');
  // Pas de service worker hors http(s) (fichier ouvert en local, tests).
  assert.equal(await page.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.controller : null), null);
}));

test('Progrès : résumé en une phrase, projection, maintenance réelle, constats, période en pastille, mensurations, force', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => {
    const t = todayStr();
    userProfile.mesures = {};
    for (let k = 0; k <= 34; k++) {
      const d = shiftDate(t, -k), j = getDay(d), we = [0, 6].includes(new Date(d + 'T12:00:00').getDay());
      j.weight = Math.round((80 + k * 0.03) * 100) / 100;
      j.meals[MEALS[0]].push({ name: 'Poulet rôti', grams: 300, kcal: we ? 2500 : 2000, p: 150, c: 200, f: 70 });
      saveData(d);
    }
    userProfile.mesures[shiftDate(t, -25)] = { tailleCm: 86 };
    userProfile.mesures[shiftDate(t, -2)] = { tailleCm: 84.5 };
    userProfile.poidsVise = 78;
    const exo = toutesLesExercices().find(e => e.groupe === 'pectoraux');
    const seance = (id, date, poids) => ({ id, programmeNom: 'Pecs', date, debut: Date.now(), fin: Date.now(), dureeMin: 50, maj: Date.now(),
      exercices: [{ exerciceId: exo.id, nom: exo.nom, series: [{ poids, reps: 10, fait: true }, { poids, reps: 10, fait: true }, { poids, reps: 9, fait: true }] }] });
    musculationHistorique.push(seance('a1', shiftDate(t, -45), 60), seance('a2', shiftDate(t, -38), 60), seance('b1', shiftDate(t, -20), 62.5), seance('b2', shiftDate(t, -6), 65));
    const j = getDay(t); j.workouts = j.workouts || []; j.workouts.push({ type: 'course', time: 30, distance: 5, intensite: 2, cardio: true }); saveData(t);
    buildMasterArrays();
    choisirPeriodeStats('30');
    ouvrirProgres();
  });
  await page.waitForTimeout(300);
  let r = await page.evaluate(() => ({
    phrase: document.querySelector('.pg-heros h3').textContent,
    sous: document.querySelector('.pg-heros p').textContent,
    courbe: !!document.querySelector('.pg-heros .pg-h-courbe .pg-h-proj'),
    tuiles: document.querySelectorAll('#pg-resume .pg-tuile--lien').length,
    maint: Number((document.querySelector('#pg-resume .pg-maint b').textContent.match(/[\d\s ]+/) || [''])[0].replace(/\D/g, '')),
    faits: [...document.querySelectorAll('#pg-resume .pg-fait')].map(f => f.textContent.replace(/\s+/g, ' ').trim()),
    serie: document.querySelector('#pg-resume .pg-serie').textContent,
    cal: document.querySelectorAll('#pg-resume .pg-cal i').length,
    ligne: document.getElementById('stats-periode-resume').textContent
  }));
  assert.match(r.phrase, /^Tu perds 0,2 kg par semaine sans perdre de force\.$/);
  assert.match(r.sous, /objectif 78 kg vers le/);
  assert.ok(r.courbe);
  assert.equal(r.tuiles, 4);
  assert.ok(r.maint >= 2300 && r.maint <= 2450, 'maintenance ' + r.maint);
  assert.ok(r.faits.some(f => /1 record/.test(f)), r.faits.join(' | '));
  assert.ok(r.faits.some(f => /Le week-end : \+500 kcal/.test(f)), r.faits.join(' | '));
  assert.match(r.serie, /35 jours\s*de suite.*record 35/);
  assert.equal(r.cal, 30);
  assert.match(r.ligne, /comparé aux 30 jours d’avant$/);
  // Une tuile ouvre son onglet.
  await page.click('#pg-resume .pg-tuile--lien');
  assert.equal(await page.evaluate(() => categorieStatsActive()), 'poids');
  // La période : pastille, menu, choix, menu refermé.
  await page.click('#pg-periode-btn');
  assert.equal(await page.evaluate(() => document.getElementById('pg-periode-menu').classList.contains('hidden')), false);
  await page.click('#stats-periode button:nth-child(3)');
  r = await page.evaluate(() => ({ p: periodeStats, lib: document.getElementById('pg-periode-lib').textContent, ferme: document.getElementById('pg-periode-menu').classList.contains('hidden') }));
  assert.deepEqual(r, { p: '90', lib: '3 mois', ferme: true });
  await page.evaluate(() => choisirPeriodeStats('30'));
  // Corps : mensurations et leur écart, projection.
  r = await page.evaluate(() => ({ mesures: document.getElementById('pg-mensurations').textContent.replace(/\s+/g, ' '), proj: document.getElementById('pg-projection-corps').textContent }));
  assert.match(r.mesures, /Tour de taille\s*84,5 cm\s*−1,5 cm/);
  assert.match(r.proj, /objectif 78 kg vers le/);
  // Repas : un seul graphique visible, choisi au sélecteur ; week-ends marqués.
  await page.evaluate(() => choisirOngletStats('nutrition'));
  await page.waitForFunction(() => caloriesChartInstance && caloriesChartInstance.options.plugins.weekEnds);
  await page.click('#nutri-series-nav button:nth-child(5)');
  r = await page.evaluate(() => ({ actives: [...document.querySelectorAll('#ecran-stats .nutri-serie--active')].map(d => d.dataset.serie),
    weekEnds: caloriesChartInstance.options.plugins.weekEnds.dates.length, top: document.querySelector('#pg-top-aliments b').textContent }));
  assert.deepEqual(r, { actives: ['eau'], weekEnds: 30, top: 'Poulet rôti' });
  // Cardio : la semaine en cours et ce qu'il manque.
  await page.evaluate(() => choisirOngletStats('activite'));
  assert.match(await page.textContent('#pg-cardio-semaine'), /30 \/ 150 min.*Encore 120 min/s);
  // Muscu : force exercice par exercice, bulle au toucher d'une case.
  await page.evaluate(() => choisirOngletStats('muscu'));
  await page.waitForTimeout(250);
  assert.match(await page.textContent('#pg-force .pg-lift em'), /↗ \+\d+ %/);
  await page.click('#pg-grille-muscu .zones-case:not(.vide)');
  r = await page.evaluate(() => { const b = document.getElementById('pg-bulle'); return { visible: b.classList.contains('visible'), texte: b.textContent }; });
  assert.ok(r.visible);
  assert.match(r.texte, /Pectoraux · .* : \d+(,\d)? séries?/);
  // Poids visé : effacé, la phrase invite à en fixer un.
  await page.evaluate(() => { userProfile.poidsVise = null; choisirOngletStats('resume'); majToutesStats(); });
  assert.match(await page.textContent('.pg-heros p'), /Fixe un poids visé/);
}));

test('profil : le formulaire suit le profil enregistré et une saisie vide ne remplace rien', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    onbReponses.gender = 'f'; onbReponses.goal = 'seche'; onbReponses.pasHabituels = 6000;
    document.getElementById('onb-age').value = '41'; document.getElementById('onb-taille').value = '163'; document.getElementById('onb-poids').value = '68';
    await onbTerminer();
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    allerA('reglages');
    const formulaire = ['base-gender', 'base-age', 'base-height'].map(id => document.getElementById(id).value);
    // Corriger un seul champ ne réécrit pas les autres avec des valeurs par défaut.
    const sel = document.getElementById('base-gender'); sel.value = 'm'; sel.dispatchEvent(new Event('change'));
    const apresSexe = [userProfile.gender, userProfile.age, userProfile.height];
    // Un âge effacé garde l'ancien, et le champ le réaffiche.
    const age = document.getElementById('base-age'); age.value = ''; age.dispatchEvent(new Event('change'));
    const ageGarde = age.value;
    // Profil arrivé d'un autre appareil : le formulaire se met à jour.
    Object.assign(userProfile, { age: 52, height: 181 }); renderApp();
    return { formulaire, apresSexe, ageGarde, synchro: ['base-age', 'base-height'].map(id => document.getElementById(id).value) };
  });
  assert.deepEqual(r.formulaire, ['f', '41', '163']);
  assert.deepEqual(r.apresSexe, ['m', 41, 163]);
  assert.equal(r.ageGarde, '41');
  assert.deepEqual(r.synchro, ['52', '181']);
}));

test("boissons : l'hydratation suit la boisson (ajout, suppression, annulation, quantité), pas l'alcool", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const eau = () => Number(getDay(currentDate).eauMl) || 0;
    const ajouter = async (nom, ml) => { ouvrirManuel('breakfast'); uniteCourante = 'ml'; activeMealId = 'breakfast';
      document.getElementById('man-name').value = nom; document.getElementById('man-grams').value = ml; document.getElementById('man-kcal100').value = 45; await validerAjoutManuel(); };
    const e = {};
    await ajouter('Lait demi-écrémé', 250); e.lait = eau();
    await ajouter('Bière blonde', 500); e.biere = eau();
    await ajouter('Bière sans alcool', 330); e.sansAlcool = eau();
    supprimerAliment('breakfast', getDay(currentDate).meals.breakfast.findIndex(i => /Lait/.test(i.name))); e.suppression = eau();
    document.querySelector('#toast-annuler button').click(); e.annulation = eau();
    ouvrirPoidsAliment(document.querySelector('#meals-container .food-info[data-nom^="Lait"]'));
    document.getElementById('macros-popup-poids').value = 400; validerPoidsAliment(); e.quantite = eau();
    return e;
  });
  assert.deepEqual(r, { lait: 250, biere: 250, sansAlcool: 580, suppression: 330, annulation: 580, quantite: 730 });
}));

test('chiffres : même tendance du poids sur Repas du jour et Progrès, moyenne des journées terminées, nombres à la française', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const t = todayStr();
    userProfile.mesures = {};
    for (let k = 35; k >= 0; k--) {
      const d = shiftDate(t, -k), jour = getDay(d);
      jour.weight = Math.round((80 + k * 0.06 + (k % 3) * 0.2) * 10) / 10;
      jour.meals[MEALS[0]].push({ name: 'Test', kcal: k === 0 ? 400 : 1800 + (k % 5) * 40, p: 140, c: 200, f: 60 });
      saveData(d);
    }
    userProfile.mesures[t] = { poids: 80.3, grassePct: 17.5, muscleKg: 36.4 };
    allerA('repas'); renderApp();
    const poids = document.querySelector('#carte-stats-poids').textContent.match(/−[0-9,]+ kg\/sem\./)[0];
    const mesure = document.getElementById('resume-mesures').textContent;
    choisirPeriodeStats('30'); allerA('stats');
    await new Promise(res => setTimeout(res, 400));
    const phrase = document.querySelector('.pg-heros').textContent;
    choisirOngletStats('nutrition');
    await new Promise(res => setTimeout(res, 300));
    return { poids, phrase, moyRepas: document.querySelector('#ecran-stats').textContent.replace(/\s+/g, ' '), mesure };
  });
  const rythme = r.poids.replace('−', '').replace(' kg/sem.', '');
  assert.match(r.phrase, new RegExp('Tu perds ' + rythme + ' kg par semaine'));
  // 29 journées terminées (aujourd'hui, entamé, n'entre pas dans la moyenne).
  assert.match(r.moyRepas, /1\s883\s*kcal/);
  assert.match(r.mesure, /80,3 kg · 17,5 % de masse grasse · 36,4 kg de muscle/);
}));

/* Deux appareils d'un même compte (téléphone et tablette) sur un faux serveur. */
async function deuxAppareils(corps) {
  const serveur = creerServeur();
  const tel = await ouvrirAppli(navigateur, {}), tab = await ouvrirAppli(navigateur, {});
  try {
    await brancherServeur(tel.page, serveur, 'u1');
    await brancherServeur(tab.page, serveur, 'u1');
    await corps(tel.page, tab.page, serveur);
    assert.deepEqual(tel.erreurs, [], 'erreurs JavaScript (téléphone)');
    assert.deepEqual(tab.erreurs, [], 'erreurs JavaScript (tablette)');
  } finally { await tel.ctx.close(); await tab.ctx.close(); }
}
const noterAliment = (page, repas, nom) => page.evaluate(([r, n]) => {
  const j = todayStr(); getDay(j).meals[r].push({ name: n, grams: 100, unite: 'g', kcal: 100, p: 5, c: 15, f: 2 }); saveData(j);
}, [repas, nom]);
const retirerAliment = (page, repas, nom) => page.evaluate(([r, n]) => {
  const j = todayStr(), l = getDay(j).meals[r]; l.splice(l.findIndex(i => i.name === n), 1); saveData(j);
}, [repas, nom]);
const journee = page => page.evaluate(() => { const d = getDay(todayStr()); return { matin: d.meals.breakfast.map(i => i.name), midi: d.meals.lunch.map(i => i.name), eau: Number(d.eauMl) || 0 }; });
const synchro = (page, raison = 'auto') => page.evaluate(r => synchroniser(r), raison);

test('synchro : une journée modifiée sur deux appareils est fusionnée, rien ne se perd', () => deuxAppareils(async (tel, tab) => {
  await noterAliment(tel, 'breakfast', 'Flocons');
  await synchro(tel); await synchro(tab);
  assert.deepEqual((await journee(tab)).matin, ['Flocons']);
  // Le téléphone, hors ligne : une banane, deux bananes identiques, 500 ml d'eau, et il retire les flocons.
  await noterAliment(tel, 'breakfast', 'Banane'); await noterAliment(tel, 'breakfast', 'Banane');
  await tel.evaluate(() => ajouterEau(500));
  await retirerAliment(tel, 'breakfast', 'Flocons');
  // Pendant ce temps, la tablette note son déjeuner et 250 ml, et l'envoie.
  await noterAliment(tab, 'lunch', 'Poulet');
  await tab.evaluate(() => ajouterEau(250));
  await synchro(tab);
  // Le téléphone revient en ligne : fusion, puis la tablette la récupère.
  await synchro(tel); await synchro(tab);
  const attendu = { matin: ['Banane', 'Banane'], midi: ['Poulet'], eau: 750 };
  assert.deepEqual(await journee(tel), attendu);
  assert.deepEqual(await journee(tab), attendu);
  // Plus rien en attente d'envoi.
  assert.deepEqual(await tel.evaluate(() => joursModifies()), {});
}));

test("synchro : après la première, seules les nouveautés sont téléchargées, et un appareil à l'heure décalée est vu", () => deuxAppareils(async (tel, tab, serveur) => {
  await noterAliment(tel, 'breakfast', 'Pain');
  await synchro(tel); await synchro(tab);
  const lectures = () => serveur.journal.filter(q => q.table === 'journees' && q.op === 'select');
  const avant = lectures().length;
  // L'horloge de la tablette retarde de 3 heures.
  await tab.evaluate(() => { const vrai = Date.now; Date.now = () => vrai() - 3 * 3600e3; });
  await noterAliment(tab, 'lunch', 'Riz');
  await synchro(tab); await synchro(tel);
  const suivantes = lectures().slice(avant);
  assert.ok(suivantes.length >= 2 && suivantes.every(q => q.filtres.some(f => f[0] === 'gt')), 'lecture incrémentale : ' + JSON.stringify(suivantes.map(q => q.filtres)));
  assert.deepEqual((await journee(tel)).midi, ['Riz']);
  // Recettes et exercices des autres : relus seulement lors d'une synchro complète.
  const recettes = serveur.journal.filter(q => q.table === 'recettes_perso').length;
  await synchro(tel);
  assert.equal(serveur.journal.filter(q => q.table === 'recettes_perso').length, recettes);
  await synchro(tel, 'manuel');
  assert.ok(serveur.journal.filter(q => q.table === 'recettes_perso').length > recettes);
}));

test('synchro : après une déconnexion, la reconnexion retélécharge les journées et n\'écrase rien', () => deuxAppareils(async (tel, tab) => {
  await noterAliment(tab, 'breakfast', 'Flocons');
  await synchro(tab); await synchro(tel);
  assert.deepEqual((await journee(tel)).matin, ['Flocons']);
  // « Se déconnecter » vide le téléphone, puis on se reconnecte au même compte.
  await tel.evaluate(() => { viderDonneesLocales(); sessionUtilisateur = null; });
  assert.equal(await tel.evaluate(() => Object.keys(localStorage).filter(k => /^mc_sync_/.test(k)).length), 0);
  await tel.evaluate(() => { sessionUtilisateur = { id: 'u1', email: 'u1@test.fr' }; });
  await synchro(tel, 'connexion');
  assert.deepEqual((await journee(tel)).matin, ['Flocons']);
  // Un aliment noté ensuite s'ajoute à la journée du serveur au lieu de l'écraser.
  await noterAliment(tel, 'lunch', 'Riz');
  await synchro(tel); await synchro(tab);
  assert.deepEqual(await journee(tab), { matin: ['Flocons'], midi: ['Riz'], eau: 0 });
}));

test('synchro : un appareil vidé en gardant son état de synchro (version précédente) récupère ses journées', () => deuxAppareils(async (tel, tab) => {
  await noterAliment(tab, 'breakfast', 'Flocons');
  await synchro(tab); await synchro(tel);
  await tel.evaluate(() => { appData = {}; effacerBloc(STORAGE_KEY); });
  await synchro(tel, 'connexion');
  assert.deepEqual((await journee(tel)).matin, ['Flocons']);
  assert.deepEqual(await tel.evaluate(() => joursModifies()), {});
}));

test('synchro : une journée modifiée des deux côtés sans version commune garde les aliments des deux', () => deuxAppareils(async (tel, tab) => {
  // La tablette envoie ses flocons ; le téléphone, jamais synchronisé avec
  // cette version, avait noté une banane de son côté.
  await noterAliment(tab, 'breakfast', 'Flocons');
  await synchro(tab);
  await noterAliment(tel, 'breakfast', 'Banane');
  await synchro(tel); await synchro(tab);
  assert.deepEqual((await journee(tel)).matin.sort(), ['Banane', 'Flocons']);
  assert.deepEqual((await journee(tab)).matin.sort(), ['Banane', 'Flocons']);
}));

test("compte : un mot de passe faux le dit simplement ; « Créer un compte » à part (nom, deux cases) ; « Mot de passe oublié ? » ; changer son mot de passe une fois connecté", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = { signUp: [], reset: [], signOut: 0 };
    let existe = false;
    supa = { auth: {
      signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }),
      signUp: async o => { appels.signUp.push({ email: o.email, consentement: o.options.data.consentement }); return { data: { user: { identities: existe ? [] : [{}] }, session: null }, error: null }; },
      resetPasswordForEmail: async email => { appels.reset.push(email); return { error: null }; },
      signOut: async () => { appels.signOut++; return { error: null }; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async () => ({ data: true, error: null }) };
    const champ = id => document.getElementById(id);
    const visible = id => !champ(id).classList.contains('hidden');
    const out = { autocompletes: [champ('compte-email-input').autocomplete, champ('compte-pseudo-input').autocomplete] };
    // Connexion : mot de passe faux.
    champ('compte-email-input').value = 'moi@exemple.fr';
    champ('compte-mdp-input').value = 'mauvais12';
    await connexionOuCreerCompte();
    out.connexion = { note: champ('note-compte').textContent, nom: visible('compte-pseudo-wrap'), cases: visible('compte-accord-wrap'), bouton: champ('compte-bouton').textContent, signUp: appels.signUp.length };
    // Mot de passe oublié : sans adresse, puis avec.
    champ('compte-email-input').value = '';
    await motDePasseOublie();
    out.oublieSansEmail = champ('note-compte').textContent;
    champ('compte-email-input').value = 'moi@exemple.fr';
    const attente = motDePasseOublie();
    await new Promise(ok => setTimeout(ok, 30));
    out.fenetre = [champ('titre-creer-compte').textContent, champ('creer-compte-texte').textContent];
    validerConfirmationCompte();
    await attente;
    out.oublie = { note: champ('note-compte').textContent, reset: appels.reset.slice() };
    // Créer un compte : nom (l'email collé par Safari est ignoré), puis les deux cases.
    document.querySelector('#compte-liens-connexion .lien:last-child').click();
    out.creation = { nom: visible('compte-pseudo-wrap'), cases: visible('compte-accord-wrap'), bouton: champ('compte-bouton').textContent, retour: visible('compte-liens-creation'), mdp: champ('compte-mdp-input').getAttribute('autocomplete') };
    champ('compte-email-input').value = 'nouveau@exemple.fr';
    champ('compte-mdp-input').value = 'secret123';
    champ('compte-pseudo-input').value = 'nouveau@exemple.fr';
    await connexionOuCreerCompte();
    out.sansNom = [champ('note-compte').textContent, champ('compte-pseudo-input').value];
    champ('compte-pseudo-input').value = 'jamal.fit';
    champ('compte-accord-conditions').checked = true;
    await connexionOuCreerCompte();
    out.uneCase = [champ('note-compte').textContent, appels.signUp.length];
    champ('compte-accord-sante').checked = true;
    await connexionOuCreerCompte();
    out.cree = [champ('note-compte').textContent, appels.signUp.length, appels.signUp[0] && appels.signUp[0].consentement];
    // Adresse déjà inscrite : rien n'est créé, retour à la connexion.
    existe = true;
    champ('compte-accord-conditions').checked = true; champ('compte-accord-sante').checked = true;
    await connexionOuCreerCompte();
    out.existe = { note: champ('note-compte').textContent, bouton: champ('compte-bouton').textContent, nom: visible('compte-pseudo-wrap'), cases: [champ('compte-accord-conditions').checked, champ('compte-accord-sante').checked] };
    // Connecté : changer son mot de passe ; Annuler ne déconnecte pas.
    ouvrirChangementMdp();
    out.changer = champ('modal-nouveau-mdp').classList.contains('show');
    annulerNouveauMdp();
    out.deconnexions = appels.signOut;
    return out;
  });
  assert.deepEqual(r.autocompletes, ['username', 'nickname']);
  assert.deepEqual(r.connexion, { note: 'Email ou mot de passe incorrect.', nom: false, cases: false, bouton: 'Se connecter', signUp: 0 });
  assert.match(r.oublieSansEmail, /^Tape d'abord ton adresse email/);
  assert.deepEqual(r.fenetre, ['Mot de passe oublié', 'Recevoir à moi@exemple.fr un email pour choisir un nouveau mot de passe ?']);
  assert.deepEqual(r.oublie, { note: 'Email envoyé à moi@exemple.fr : suis le lien pour choisir un nouveau mot de passe.', reset: ['moi@exemple.fr'] });
  assert.deepEqual(r.creation, { nom: true, cases: true, bouton: 'Créer mon compte', retour: true, mdp: 'new-password' });
  assert.deepEqual(r.sansNom, ["Choisis un nom d'utilisateur.", '']);
  assert.deepEqual(r.uneCase, ['Coche les deux cases pour créer ton compte.', 0]);
  assert.match(r.cree[0], /^Compte créé/);
  assert.equal(r.cree[1], 1);
  assert.deepEqual([r.cree[2].conditions, r.cree[2].sante], [1, true]);
  assert.deepEqual(r.existe, { note: 'Un compte existe déjà avec cette adresse : connecte-toi, ou touche « Mot de passe oublié ? ».', bouton: 'Se connecter', nom: false, cases: [false, false] });
  assert.equal(r.changer, true);
  assert.equal(r.deconnexions, 0);
}));

test("compte plus ancien : les conditions s'acceptent une fois (deux cases), sinon déconnexion ; un compte qui les a acceptées n'est pas dérangé", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const maj = [], sorties = [];
    supa = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), then: (ok) => ok({ data: [], error: null }) }), then: (ok) => ok({ data: [], error: null }) }) }),
      rpc: async () => ({ data: [], error: null }), functions: { invoke: async () => ({ data: null, error: { context: { status: 404 } } }) },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
      auth: { updateUser: async o => { maj.push(o.data.consentement); return { data: {}, error: null }; },
        signOut: async () => { sorties.push(1); definirSessionUtilisateur(null); return { error: null }; },
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
    const ouverte = () => document.getElementById('accord-modal').classList.contains('show');
    const out = {};
    // Déjà accepté : rien ne s'ouvre.
    definirSessionUtilisateur({ id: 'a', email: 'a@x.fr', user_metadata: { consentement: { conditions: 1, sante: true, le: '2026-11-01T00:00:00Z' } } });
    out.dejaAccepte = ouverte();
    definirSessionUtilisateur(null);
    // Ancien compte : la fenêtre s'ouvre, ne se ferme ni par Échap ni à côté.
    definirSessionUtilisateur({ id: 'b', email: 'b@x.fr', user_metadata: {} });
    out.ouverte = ouverte();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fermerBackdropSiCible(document.getElementById('accord-modal'));
    fermerModal('accord-modal');
    out.toujoursOuverte = ouverte();
    out.boutonAvant = document.getElementById('accord-ok').disabled;
    document.getElementById('accord-conditions').click();
    out.boutonUneCase = document.getElementById('accord-ok').disabled;
    document.getElementById('accord-sante').click();
    out.boutonDeuxCases = document.getElementById('accord-ok').disabled;
    document.getElementById('accord-ok').click();
    await new Promise(ok => setTimeout(ok, 50));
    out.fermee = !ouverte();
    out.maj = maj.map(c => [c.conditions, c.sante]);
    // Hors ligne au moment d'accepter : pas redemandé sur cet appareil, enregistré à la connexion suivante.
    definirSessionUtilisateur(null);
    definirSessionUtilisateur({ id: 'b', email: 'b@x.fr', user_metadata: {} });
    out.redemande = ouverte();
    out.majApres = maj.length;
    // Refus : déconnexion.
    definirSessionUtilisateur(null);
    definirSessionUtilisateur({ id: 'c', email: 'c@x.fr' });
    document.querySelector('#accord-modal .btn-secondaire').click();
    await new Promise(ok => setTimeout(ok, 50));
    out.refus = { sorties: sorties.length, ouverte: ouverte(), session: sessionUtilisateur };
    return out;
  });
  assert.equal(r.dejaAccepte, false);
  assert.deepEqual([r.ouverte, r.toujoursOuverte], [true, true]);
  assert.deepEqual([r.boutonAvant, r.boutonUneCase, r.boutonDeuxCases], [true, true, false]);
  assert.equal(r.fermee, true);
  assert.deepEqual(r.maj, [[1, true]]);
  assert.deepEqual([r.redemande, r.majApres], [false, 2]);
  assert.deepEqual(r.refus, { sorties: 1, ouverte: false, session: null });
}));

test("pages légales : dans l'app, la version iPhone (Apple, Apple Santé, sans Stripe) ; sur le site, la version web", async () => {
  const nav = await lancerNavigateur();
  try {
    const page = await nav.newPage();
    const lire = async (fichier, ios) => {
      await page.goto('file://' + path.join(__dirname, '..', fichier) + (ios ? '?app=ios' : ''));
      return page.evaluate(() => ({ texte: document.body.innerText, liens: [...document.querySelectorAll('a[href$="html"], a[href*=".html?"]')].map(a => a.getAttribute('href')) }));
    };
    const cgvIos = await lire('cgv.html', true), cgvWeb = await lire('cgv.html', false);
    assert.match(cgvIos.texte, /Réglages de l'iPhone › ton nom › Abonnements/);
    assert.match(cgvIos.texte, /au moins 24 heures avant/);
    assert.match(cgvIos.texte, /tolérance zéro/i);
    assert.doesNotMatch(cgvIos.texte, /Stripe|Withings|‹ Askēsis/);
    assert.match(cgvWeb.texte, /Stripe/);
    assert.doesNotMatch(cgvWeb.texte, /reportaproblem/);
    assert.ok(cgvIos.liens.length && cgvIos.liens.every(h => h.endsWith('?app=ios')), 'les liens entre pages gardent la version iPhone');
    const confIos = await lire('confidentialite.html', true), confWeb = await lire('confidentialite.html', false);
    assert.match(confIos.texte, /Apple Santé/);
    assert.match(confIos.texte, /ne les stocke pas dans iCloud/);
    assert.doesNotMatch(confIos.texte, /Stripe|Withings/);
    assert.match(confWeb.texte, /Stripe/);
    const mentIos = await lire('mentions-legales.html', true), mentWeb = await lire('mentions-legales.html', false);
    assert.doesNotMatch(mentIos.texte, /SmartWorkout|ExerciseDB|wger/);
    assert.match(mentWeb.texte, /SmartWorkout/);
    assert.match(mentIos.texte, /CC BY-SA 4\.0/);
  } finally { await nav.close(); }
});

test('compte : le nom choisi à la création n\'est pas redemandé quand Supabase annonce la session plusieurs fois', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    // Faux Supabase : la table des noms répond de plus en plus lentement,
    // comme des requêtes parties en même temps qui reviennent dans le désordre.
    const pseudos = new Map();
    let lectures = 0;
    const requete = table => {
      const q = { op: 'select', filtres: {} };
      const api = {
        select() { return api; }, eq(c, v) { q.filtres[c] = v; return api; }, gt() { return api; }, in() { return api; },
        order() { return api; }, limit() { return api; }, range() { return api; }, not() { return api; }, is() { return api; },
        maybeSingle() { q.un = true; return api; }, single() { q.un = true; return api; },
        upsert(l) { q.op = 'upsert'; q.ligne = Array.isArray(l) ? l[0] : l; return api; },
        update() { q.op = 'update'; return api; }, insert() { q.op = 'upsert'; return api; }, delete() { q.op = 'delete'; return api; },
        then(ok, ko) {
          if (table === 'pseudos' && q.op === 'upsert') { pseudos.set(q.ligne.utilisateur, q.ligne); return Promise.resolve({ data: null, error: null }).then(ok, ko); }
          if (table === 'pseudos') {
            const vu = pseudos.get(q.filtres.utilisateur) || null;   // lu tout de suite, rendu plus tard
            const attente = 80 * ++lectures;
            return new Promise(res => setTimeout(() => res({ data: vu, error: null }), attente)).then(ok, ko);
          }
          return Promise.resolve({ data: q.un ? null : [], error: null }).then(ok, ko);
        }
      };
      return api;
    };
    supa = { from: requete, rpc: async () => ({ data: [], error: null }),
      functions: { invoke: async () => ({ data: null, error: { context: { status: 404 } } }) },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
    sessionUtilisateur = null;
    localStorage.setItem(PSEUDO_ATTENTE_LS, 'jamal.fit');
    const u = { id: 'nouveau', email: 'nouveau@exemple.fr' };
    // Session relue, puis annoncée deux fois par Supabase.
    definirSessionUtilisateur(u); definirSessionUtilisateur(u); definirSessionUtilisateur(u);
    await new Promise(res => setTimeout(res, 1200));
    return { pseudo: monPseudo && monPseudo.pseudo, enregistre: (pseudos.get('nouveau') || {}).pseudo,
      fenetre: document.getElementById('pseudo-modal').classList.contains('show') };
  });
  assert.equal(r.enregistre, 'jamal.fit');
  assert.equal(r.pseudo, 'jamal.fit');
  assert.equal(r.fenetre, false, 'le nom d\'utilisateur est redemandé');
}));

test('accueil : « Bonjour » suit le nom d\'utilisateur, jamais le début de l\'adresse email', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    supa = { from: () => ({ upsert: () => ({ then: ok => Promise.resolve({ data: null, error: null }).then(ok) }) }) };
    sessionUtilisateur = { id: 'u1', email: 'boulid.jamal@gmail.com' };
    monPseudo = null; renderApp();
    const salut = () => document.getElementById('salut-nom').textContent.replace(/^Bonsoir/, 'Bonjour');
    const sansNom = salut();
    await enregistrerPseudo('jamal.fit');
    return { sansNom, avecNom: salut(), fiche: document.querySelector('#vitrine-profil .pf-id h3').textContent };
  });
  assert.equal(r.sansNom, 'Bonjour');
  assert.equal(r.avecNom, 'Bonjour Jamal.fit');
  assert.match(r.fiche, /^@jamal\.fit/);
}));

test('Activité : le corps de la semaine pivote (face ↔ dos) sans ouvrir le détail', () => avecAppli({}, async ({ page }) => {
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('muscu'); window.scrollTo(0, 0); });
  const etat = () => page.evaluate(() => {
    const el = document.querySelector('#vitrine-muscu .corps-pivot');
    return { vue: el.dataset.vue, bouton: document.querySelector('#vitrine-muscu .cp-bouton b').textContent, ecran: ecranActif,
      vues: el.querySelectorAll('.cp-face, .cp-dos').length };
  });
  const attendre = () => page.waitForTimeout(250);
  assert.deepEqual(await etat(), { vue: 'face', bouton: 'Dos', ecran: 'seance', vues: 2 });
  // Toucher le corps : demi-tour, et le détail de la semaine ne s'ouvre pas.
  await page.click('#vitrine-muscu .corps-pivot');
  await attendre();
  assert.deepEqual(await etat(), { vue: 'dos', bouton: 'Face', ecran: 'seance', vues: 2 });
  // Le bouton le remet de face ; la vitrine redessinée garde la vue choisie.
  await page.click('#vitrine-muscu .cp-bouton');
  await attendre();
  assert.equal((await etat()).vue, 'face');
  // Glisser du doigt vers la gauche : il pivote et se cale de dos.
  const b = await page.locator('#vitrine-muscu .corps-pivot').boundingBox();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2 + 60 - i * 15, b.y + b.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(900);
  assert.equal((await etat()).vue, 'dos');
  // Pire cas : des mouvements groupés dans la même milliseconde. L'élan reste
  // plafonné : un demi-tour exactement, pas plusieurs tours au hasard.
  const tour = await page.evaluate(() => new Promise(fin => {
    const el = document.querySelector('#vitrine-muscu .corps-pivot');
    el.corpsPivot.regler(0);
    const r = el.getBoundingClientRect(), y = r.top + r.height / 2;
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true, isPrimary: true }));
    ev('pointerdown', r.left + r.width / 2 + 60);
    for (let i = 1; i <= 10; i++) ev('pointermove', r.left + r.width / 2 + 60 - i * 15);
    ev('pointerup', r.left + r.width / 2 - 90);
    setTimeout(() => fin(el.corpsPivot.angle), 1500);
  }));
  assert.equal(Math.abs(tour), 180, 'angle final : ' + tour);
  await page.evaluate(() => renderVitrineMuscu());
  assert.deepEqual(await etat(), { vue: 'dos', bouton: 'Face', ecran: 'seance', vues: 2 });
  // Le titre, lui, ouvre toujours le détail de la semaine.
  const t = await page.locator('#vitrine-muscu .hx-titre').boundingBox();
  await page.mouse.click(t.x + 20, t.y + t.height / 2);
  assert.equal(await page.evaluate(() => ecranActif), 'stats');
  await page.evaluate(() => { corpsPivotVue = 'face'; });
}));

test('bibliothèque : classiques en tête puis l\'alphabet ; icônes d\'aliments ; objectifs du premier lancement', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const noms = () => [...document.querySelectorAll('#picker-liste-exercices .exo-ligne-nom')].map(n => n.firstChild.textContent.trim());
    ouvrirPickerExercices('bibliotheque');
    const res = { tete: noms().slice(0, 5) };
    const champ = document.getElementById('picker-recherche');
    champ.value = 'curl'; rendrePickerExercices();
    res.curl = noms().slice(0, 3);
    const l = noms(), k = l.filter(n => /^curl/i.test(n)).length;
    res.toutesCurl = k > 3 && l.slice(0, k).every(n => /^curl/i.test(n));
    champ.value = ''; document.getElementById('picker-filtre-groupe').value = 'abdos'; rendrePickerExercices();
    const abdos = noms(); const apres = abdos.slice(2);
    res.abdos = abdos.slice(0, 2);
    res.alpha = apres.every((n, i) => !i || COLLATEUR_FR.compare(apres[i - 1], n) <= 0);
    fermerModal('picker-exercices-modal');
    res.icones = ['Thé vert', 'Escalope de veau', 'Laitue', 'Gâteau au chocolat', 'Pain au chocolat', 'Œufs brouillés', 'Plat mystère'].map(iconeAliment);
    getDay(todayStr()).meals[MEALS[0]].push({ name: 'Plat mystère', grams: 100, kcal: 100, p: 1, c: 1, f: 1 }); saveData(todayStr()); allerA('repas'); renderApp();
    res.ligne = [...document.querySelectorAll('.food-initiale')].map(x => x.textContent.trim()).pop();
    res.objectifs = [...document.querySelectorAll('#onb-objectif .onb-option')].map(b => b.dataset.valeur + ':' + b.querySelector('strong').textContent);
    return res;
  });
  assert.deepEqual(r.tete, ['Squat avec barre', 'Développé couché avec barre', 'Soulevé de terre', 'Développé militaire', 'Traction']);
  assert.deepEqual(r.curl, ['Curl à la barre', 'Curl prise marteau', r.curl[2]]);
  assert.match(r.curl[2], /^Curl/);
  assert.equal(r.toutesCurl, true);
  assert.deepEqual(r.abdos, ['Planche', 'Crunch abdominal']);
  assert.equal(r.alpha, true);
  assert.deepEqual(r.icones, ['🍵', '🥩', '🥗', '🍰', '🥐', '🍳', '🍽️']);
  assert.equal(r.ligne, '🍽️');
  assert.deepEqual(r.objectifs, ['seche:Sèche', 'maintien:Maintien', 'masse:Prise de masse', 'recomposition:Recomposition']);
}));

test('IA : cachée sans clé liée au compte, visible avec', () => avecAppli({}, async ({ page, dialogues }) => {
  const etat = () => page.evaluate(() => {
    const vu = sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; };
    const avant = [ecranActif];
    allerA('repas'); ouvrirFeuilleRepas(repasDuMoment());
    const r = { classe: document.documentElement.classList.contains('ia-active'), photo: vu('#opt-photo'), idees: vu('.idees-recette'),
      bilanJour: vu('#carte-bilan-jour'), periode: vu('.stats-bilan'), programme: vu('[onclick="ouvrirAssistantProgrammeIA()"].action-tuile'),
      aideIA: vu('#aide-routine-modal .btn-primary.ia-seulement'), exercicesLarge: getComputedStyle(document.querySelector('.pleine-sans-ia')).gridColumnStart };
    fermerFeuilles(); allerA(avant[0]);
    r.astucesIA = astucesApplicables().filter(a => a.ia).length;
    r.texteBilan = ASTUCES.find(a => a.id === 'repas-bilan').texte;
    return r;
  });
  const sans = await etat();
  assert.deepEqual([sans.classe, sans.photo, sans.idees, sans.bilanJour, sans.periode, sans.programme, sans.aideIA], [false, false, false, false, false, false, false]);
  assert.equal(sans.exercicesLarge, '1');
  assert.equal(sans.astucesIA, 0);
  assert.doesNotMatch(sans.texteBilan, /IA/);
  // Appelée quand même (écran resté ouvert) : un message clair, rien ne s'ouvre.
  await page.evaluate(() => ouvrirPhoto(MEALS[0]));
  assert.equal(await page.evaluate(() => document.getElementById('ai-modal').classList.contains('show')), false);
  assert.match(dialogues.pop(), /pas activée sur ton compte/);
  // Clé liée au compte (synchronisée avec le profil) : tout réapparaît.
  await page.evaluate(() => { userProfile.geminiKey = 'AIza-test'; appliquerGeminiKeyEffective(); });
  const avec = await etat();
  assert.deepEqual([avec.classe, avec.photo, avec.idees, avec.bilanJour, avec.periode, avec.programme, avec.aideIA], [true, true, true, true, true, true, true]);
  assert.equal(avec.astucesIA, 1);
  assert.match(avec.texteBilan, /par l'IA/);
}));

test('accessibilité : zoom permis, champs à 16 px, pas de bouton dans un bouton, cartes au clavier, zones de 44 px', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const t = todayStr();
    for (let k = 0; k < 12; k++) { const d = shiftDate(t, -k); getDay(d).meals[MEALS[0]].push({ name: 'Riz', grams: 100, kcal: 1800, p: 100, c: 200, f: 60 }); saveData(d); }
    musculationProgrammes.push({ id: 'pa', nom: 'Haut', exercices: [], maj: Date.now() });
    const res = { viewport: document.querySelector('meta[name="viewport"]').content, toucher: getComputedStyle(document.documentElement).touchAction };
    const champs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]):not([type=hidden]), select:not(.hidden), textarea')];
    res.petitsChamps = champs.filter(c => parseFloat(getComputedStyle(c).fontSize) < 16).map(c => c.id || c.className);
    const imbriques = [];
    for (const e of ['repas', 'seance', 'stats', 'reglages']) {
      allerA(e); if (e === 'stats') ouvrirStats('resume'); renderApp();
      document.querySelectorAll('button, a[href], [role="button"]').forEach(b => {
        if (b.querySelector('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) imbriques.push(e + ':' + (b.id || b.className));
      });
    }
    res.imbriques = imbriques;
    allerA('stats'); ouvrirStats('resume');
    res.casesSansRole = document.querySelectorAll('i[data-bulle]:not([role="img"])').length;
    allerA('repas');
    const zone = getComputedStyle(document.querySelector('.repas-ajouter'), '::after');
    res.zone = [parseFloat(zone.width) >= 44, parseFloat(zone.height) >= 44];
    return res;
  });
  assert.doesNotMatch(r.viewport, /user-scalable|maximum-scale/);
  assert.equal(r.toucher, 'manipulation');
  assert.deepEqual(r.petitsChamps, []);
  assert.deepEqual(r.imbriques, []);
  assert.equal(r.casesSansRole, 0);
  assert.deepEqual(r.zone, [true, true]);
  // Le résumé des calories s'ouvre au clavier (Entrée sur son bouton) comme au doigt.
  await page.focus('#ecran-repas .summary-card .carte-action');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.getElementById('depense-modal').classList.contains('show')), true);
  await page.evaluate(() => fermerModal('depense-modal'));
  // Une carte de programme : le toucher l'ouvre toujours une seule fois.
  await page.evaluate(() => { allerA('seance'); choisirModeSeance('muscu'); window.__apercus = 0; apercuProgramme = () => { window.__apercus++; }; });
  await page.click('#programmes-liste-container .pc b');
  await page.focus('#programmes-liste-container .pc .carte-action'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__apercus), 2);
}));

test("eau : l'eau versée coule, monte avec le total, puis tout revient au calme dans l'état final", () => avecAppli({ animations: true }, async ({ page }) => {
  await page.evaluate(() => { getDay(currentDate).eauMl = 1000; saveData(currentDate); allerA('repas'); renderApp(); document.getElementById('bloc-eau').scrollIntoView(); });
  await page.waitForTimeout(1300);
  // Deux appuis rapprochés : un seul filet, la pastille cumule.
  await page.evaluate(() => { ajouterEau(250); ajouterEau(250); });
  await page.waitForFunction(() => document.getElementById('gourde').dataset.filet === '1', null, { timeout: 3000 });
  const pendant = await page.evaluate(() => ({ anime: !!gourdeAnim, pastille: document.getElementById('eau-ajout').textContent,
    ouverte: document.getElementById('gourde').classList.contains('ouverte'), donnee: getDay(currentDate).eauMl }));
  assert.deepEqual(pendant, { anime: true, pastille: '+500 ml', ouverte: true, donnee: 1500 });
  await page.waitForFunction(() => !gourdeAnim, null, { timeout: 8000 });
  await page.waitForFunction(() => document.getElementById('gourde').dataset.calme === '1' && document.getElementById('gourde').dataset.particules === '0', null, { timeout: 9000 });
  const fin = await page.evaluate(() => {
    const quota = quotaEauSuggere(currentDate), g = document.getElementById('gourde');
    return { texte: document.getElementById('eau-texte').textContent === `${texteLitres(1500)} / ${texteLitres(quota)} L`,
      niveau: g.dataset.niveau === partGourde(1500, quota).toFixed(3), particules: g.dataset.particules, filet: g.dataset.filet,
      calme: g.dataset.calme, ouverte: g.classList.contains('ouverte') };
  });
  assert.deepEqual(fin, { texte: true, niveau: true, particules: '0', filet: '', calme: '1', ouverte: false });
  // Retrait : le niveau baisse sans filet, et l'animation s'arrête aussi.
  await page.evaluate(() => retirerEau());
  assert.equal(await page.evaluate(() => !!gourdeAnim && !document.getElementById('gourde').classList.contains('ouverte')), true);
  await page.waitForFunction(() => !gourdeAnim, null, { timeout: 8000 });
  assert.match(await page.textContent('#eau-texte'), /^1,25 \//);
}));

test("démarrage : 2,5 s à chaque lancement — le T se forme puis va se poser dans la barre du haut ; simple fondu en mouvement réduit", async () => {
  // Horloge figée dès le départ : les étapes de l'écran de démarrage
  // (minuteries) n'avancent que quand le test le décide.
  async function lancer(ctx) {
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.clock.install({ time: new Date('2026-10-23T08:00:00') });
    await page.clock.pauseAt(new Date('2026-10-23T08:00:01'));
    await page.goto('file://' + path.join(RACINE, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof allerA === 'function' && typeof Chart !== 'undefined');
    // Compte « connecté » : la fenêtre de connexion fermée, Repas du jour affiché.
    await page.evaluate(() => { connexionObligatoire = false; document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show')); document.body.classList.remove('couche-ouverte'); });
    return { page, erreurs };
  }
  const etat = page => page.evaluate(() => {
    const s = document.getElementById('splash-screen'), logo = document.querySelector('.app-bar .logo-anqa');
    return { affiche: getComputedStyle(s).display !== 'none', logo: logo.style.opacity, lettres: s.querySelectorAll('.spl-lettre').length };
  });
  const contexte = reducedMotion => navigateur.newContext({ viewport: { width: 390, height: 844 }, reducedMotion }).then(async ctx => {
    await ctx.route(/^https?:/, r => /\/npm\/chart\.js@/.test(r.request().url())
      ? r.fulfill({ path: path.join(RACINE, 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'), contentType: 'application/javascript' }) : r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('installPopupVu', String(Date.now())); } catch (e) {} });
    return ctx;
  });

  const ctx = await contexte('no-preference');
  try {
    // Animation complète : le T reste jusqu'à 1,8 s…
    const { page, erreurs } = await lancer(ctx);
    await page.clock.runFor(1750);
    assert.deepEqual(await etat(page), { affiche: true, logo: '', lettres: 7 });
    // … puis s'envole vers le logo de la barre (caché le temps du vol)…
    await page.clock.runFor(100);
    assert.equal((await etat(page)).logo, '0');
    const arrivee = await page.evaluate(() => {
      const t = document.querySelector('#splash-screen .spl-t');
      t.getAnimations().forEach(a => a.finish());
      const r = t.getBoundingClientRect(), l = document.querySelector('.app-bar .logo-anqa').getBoundingClientRect();
      // Le masque du logo est en « contain » dans sa case : même largeur, centré en hauteur.
      return [r.left - l.left, r.width - l.width, (r.top + r.height / 2) - (l.top + l.height / 2)].map(v => Math.round(Math.abs(v)));
    });
    assert.deepEqual(arrivee, [0, 0, 0], 'le T se pose exactement sur le logo de la barre');
    // … et s'y pose : l'écran disparaît à 2,5 s, le vrai logo reprend sa place.
    await page.clock.runFor(800);
    assert.deepEqual(await etat(page), { affiche: false, logo: '', lettres: 7 });
    assert.deepEqual(erreurs, []);

    // Lancement suivant (nouvel onglet, même appareil) : la même animation, la même durée.
    const deux = await lancer(ctx);
    await deux.page.clock.runFor(1750);
    assert.deepEqual(await etat(deux.page), { affiche: true, logo: '', lettres: 7 });
    await deux.page.clock.runFor(100);
    assert.equal((await etat(deux.page)).logo, '0');
    await deux.page.clock.runFor(800);
    assert.deepEqual(await etat(deux.page), { affiche: false, logo: '', lettres: 7 });
    // Rechargé dans la même session (mise à jour de l'appli) : pas d'écran de démarrage.
    await deux.page.reload({ waitUntil: 'load' });
    assert.equal((await etat(deux.page)).affiche, false);
    assert.deepEqual(deux.erreurs, []);
  } finally {
    await ctx.close();
  }

  // Mouvement réduit : rien ne bouge, l'écran fond simplement à 2,2 s, sans envol.
  const ctxReduit = await contexte('reduce');
  try {
    const { page, erreurs } = await lancer(ctxReduit);
    await page.clock.runFor(2150);
    assert.deepEqual(await etat(page), { affiche: true, logo: '', lettres: 7 });
    await page.clock.runFor(450);
    assert.deepEqual(await etat(page), { affiche: false, logo: '', lettres: 7 });
    assert.deepEqual(erreurs, []);
  } finally {
    await ctxReduit.close();
  }
});

test("connexion : ouverte d'elle-même (lancement sans session), elle ne fait pas surgir le clavier ; ouverte à la main, le champ email prend le focus", () => avecAppli({}, async ({ page }) => {
  const focus = () => page.evaluate(() => new Promise(r => setTimeout(() => r((document.activeElement && document.activeElement.id) || ''), 150)));
  // Lancement sans session : la fenêtre de connexion s'ouvre seule, sans focus.
  await page.evaluate(() => definirSessionUtilisateur(null));
  assert.equal(await page.evaluate(() => document.getElementById('compte-modal').classList.contains('show')), true);
  assert.equal(await focus(), '');
  // Pendant l'écran de démarrage, aucune fenêtre ne prend le focus.
  await page.evaluate(() => { connexionObligatoire = false; fermerModal('compte-modal'); document.getElementById('splash-screen').style.display = ''; ouvrirModal('compte-modal'); });
  assert.equal(await focus(), '');
  // Ouverte à la main, une fois l'appli affichée : le champ email est prêt.
  await page.evaluate(() => { fermerModal('compte-modal'); document.getElementById('splash-screen').style.display = 'none'; ouvrirModal('compte-modal'); });
  assert.equal(await focus(), 'compte-email-input');
}));

test("bande unie en haut (contre le flou d'iOS) : couleur du fond, absente du Profil, couleur de l'écran de démarrage tant qu'il est là", () => avecAppli({}, async ({ page }) => {
  // Lu une image plus tard : en mouvement réduit, chaque changement de couleur
  // passe par une transition de 0,01 ms.
  const lire = () => page.evaluate(() => new Promise(fin => requestAnimationFrame(() => requestAnimationFrame(() => fin(0))))).then(() => page.evaluate(() => {
    const b = document.querySelector('.bord-haut'), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return { affichee: cs.display !== 'none', fixe: cs.position === 'fixed', haut: r.top, pleineLargeur: r.width === innerWidth, assezHaute: r.height >= 12,
      memeFond: cs.backgroundColor === getComputedStyle(document.body).backgroundColor, fond: cs.backgroundColor };
  }));
  await page.evaluate(() => allerA('repas'));
  const repas = await lire();
  assert.deepEqual({ ...repas, fond: undefined }, { affichee: true, fixe: true, haut: 0, pleineLargeur: true, assezHaute: true, memeFond: true, fond: undefined });
  // Avec l'encoche (59 px), la bande dépasse l'heure de 8 px : iOS cherche
  // l'élément fixe 4 px sous la zone de l'heure.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
  assert.equal(await page.evaluate(() => document.querySelector('.bord-haut').getBoundingClientRect().height), 67);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  await page.evaluate(() => allerA('reglages'));
  assert.equal((await lire()).affichee, false);
  await page.evaluate(() => { allerA('repas'); document.documentElement.classList.add('spl-actif'); });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.bord-haut')).backgroundColor === 'rgb(255, 255, 255)', null, { timeout: 3000 });
  await page.evaluate(() => document.documentElement.classList.remove('spl-actif'));
}));

test("app iPhone : pas de barre de titre en haut, même une fois la page défilée ; réglages marche/arrêt en interrupteurs ; pas de sélection de texte hors des champs", () => avecAppli({ natif: true }, async ({ page }) => {
  // Seule la bande du haut (sous l'heure) reste : rien d'autre ne se pose en haut de l'écran au défilement.
  await page.evaluate(() => { document.body.style.minHeight = '4000px'; allerA('seance'); window.scrollTo(0, 700); });
  await page.waitForTimeout(200);
  const enHaut = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => {
    const st = getComputedStyle(e);
    if (st.position !== 'fixed' || st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.height > 0 && r.height < 200 && r.top < 60 && r.bottom > 0;
  }).map(e => e.className));
  assert.deepEqual(enHaut, []);   // plus rien en haut : ni barre de titre, ni bande
  await page.evaluate(() => allerA('stats'));
  const r = await page.evaluate(() => {
    const largeur = id => getComputedStyle(document.getElementById(id)).width;
    return { interrupteurs: [...document.querySelectorAll('input.interrupteur')].map(i => i.id + ':' + i.getAttribute('role') + ':' + getComputedStyle(i).width).sort(),
      accords: ['accord-conditions', 'accord-sante', 'compte-accord-conditions', 'compte-accord-sante'].map(largeur),
      selection: [getComputedStyle(document.body).userSelect, getComputedStyle(document.getElementById('compte-email-input')).userSelect] };
  });
  assert.deepEqual(r.interrupteurs, ['ajustement-balance', 'partage-masquer-charges', 'profil-partage', 'profil-partage-direct', 'rappel-eau', 'rappel-pesee', 'rappel-proteines',
    'rappel-seance', 'reglage-demander-rir', 'vitrine-ajustement'].map(id => id + ':switch:51px').sort());
  // Les cases d'accord (conditions, données de santé) restent des cases.
  assert.deepEqual(r.accords, ['22px', '22px', '22px', '22px']);
  assert.deepEqual(r.selection, ['none', 'text']);
}));

test("app iPhone : verre liquide sur ce qui flotte (Musculation / Cardio, onglets et période de Progrès, série, « Ajouter » de Tes gymbros) ; dans chaque sélecteur, une bulle glisse sous le choix", () => avecAppli({ natif: true }, async ({ page }) => {
  await page.evaluate(() => { sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' }; gymbroLiensActifs = true; gymbroLiens = []; renderRangeesGymbros(); allerA('seance'); choisirModeSeance('muscu'); });
  await page.waitForTimeout(300);
  const verre = sels => page.evaluate(sels => sels.map(s => /blur/.test(getComputedStyle(document.querySelector(s)).backdropFilter)), sels);
  assert.deepEqual(await verre(['#seance-mode-nav', '#stats-onglets-nav', '#gymbros-rangee .gav--inviter > i', '#pg-periode-btn', '#serie-jours']), [true, true, true, true, true]);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#gymbros-rangee .gav--inviter > i')).borderTopStyle), 'none');
  // La bulle se cale sur le bouton choisi, et le suit ; sur les barres en verre, le choix s'écrit en rose.
  const bulle = id => page.evaluate(id => {
    const seg = document.getElementById(id), choisi = seg.querySelector(':scope > button[aria-pressed="true"]');
    return { posee: seg.classList.contains('a-bulle') && getComputedStyle(seg, '::after').content !== 'none',
      cale: seg.style.getPropertyValue('--bulle-x') === choisi.offsetLeft + 'px' && seg.style.getPropertyValue('--bulle-l') === choisi.offsetWidth + 'px',
      fond: getComputedStyle(choisi).backgroundColor, couleur: getComputedStyle(choisi).color, autre: getComputedStyle(seg.querySelector(':scope > button[aria-pressed="false"]')).color };
  }, id);
  assert.deepEqual(await bulle('seance-mode-nav'), { posee: true, cale: true, fond: 'rgba(0, 0, 0, 0)', couleur: 'rgb(214, 36, 110)', autre: 'rgb(0, 0, 0)' });
  await page.evaluate(() => choisirModeSeance('cardio'));
  await page.waitForTimeout(200);
  assert.deepEqual(await bulle('seance-mode-nav'), { posee: true, cale: true, fond: 'rgba(0, 0, 0, 0)', couleur: 'rgb(214, 36, 110)', autre: 'rgb(0, 0, 0)' });
  // Progrès : la barre est cachée tant qu'on n'y est pas, la bulle s'y pose en arrivant.
  await page.evaluate(() => { allerA('stats'); choisirOngletStats('poids'); });
  await page.waitForTimeout(300);
  assert.deepEqual(await bulle('stats-onglets-nav'), { posee: true, cale: true, fond: 'rgba(0, 0, 0, 0)', couleur: 'rgb(214, 36, 110)', autre: 'rgb(0, 0, 0)' });
  // Dans une fenêtre (thème des Réglages) : la même bulle, sur le fond gris du sélecteur.
  await page.evaluate(() => ouvrirModal('reglages-modal'));
  await page.waitForTimeout(400);
  const theme = await bulle('segment-theme');
  assert.equal(theme.posee && theme.cale, true, JSON.stringify(theme));
  assert.equal(theme.fond, 'rgba(0, 0, 0, 0)');
}));

test("app iPhone : clavier ouvert, la feuille remonte juste au-dessus (le champ reste visible) ; elle redescend quand il se ferme", () => avecAppli({ natif: true }, async ({ page }) => {
  const clavier = h => page.evaluate(h => window.dispatchEvent(Object.assign(new Event(h ? 'keyboardWillShow' : 'keyboardWillHide'), { keyboardHeight: h })), h);
  const ecart = sel => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { bas: Math.round(window.innerHeight - r.bottom), haut: Math.round(r.top) }; }, sel);
  for (const [ouvrir, sel] of [["ouvrirModal('compte-modal')", '#compte-modal .modal-content'], ["ouvrirSaisieRapide('poids')", '#feuille-saisie-rapide .feuille-contenu']]) {
    await page.evaluate(f => { fermerFeuilles(); document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show')); (0, eval)(f); }, ouvrir);
    await page.waitForTimeout(700);
    assert.ok((await ecart(sel)).bas <= 10, sel + ' posée en bas');
    await clavier(336);
    await page.waitForTimeout(600);
    const e = await ecart(sel);
    assert.ok(Math.abs(e.bas - 344) <= 2 && e.haut >= 0, sel + ' au-dessus du clavier : ' + JSON.stringify(e));
    await clavier(0);
    await page.waitForTimeout(600);
    assert.ok((await ecart(sel)).bas <= 10, sel + ' redescendue');
  }
}));

test("app iPhone : une feuille se ferme en tirant sa poignée ; un aliment glissé vers la gauche est supprimé (la croix reste pour VoiceOver)", () => avecAppli({ natif: true }, async ({ page }) => {
  // Feuille d'ajout : tirée de 40 px, elle remonte ; tirée de 160 px, elle se ferme.
  await page.evaluate(() => { allerA('repas'); ouvrirFeuilleRepas('lunch'); });
  await page.waitForTimeout(600);
  const poignee = await page.evaluate(() => { const r = document.querySelector('#feuille-repas .feuille-poignee').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const tirer = async dy => { await page.mouse.move(poignee.x, poignee.y); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(poignee.x, poignee.y + dy * i / 8); await page.mouse.up(); await page.waitForTimeout(500); };
  await tirer(40);
  assert.equal(await page.evaluate(() => document.getElementById('feuille-repas').classList.contains('show')), true);
  await tirer(160);
  assert.equal(await page.evaluate(() => document.getElementById('feuille-repas').classList.contains('show')), false);
  // Un aliment : un petit glissement le laisse, un grand le supprime.
  await page.evaluate(() => {
    const j = getDay(todayStr()); j.meals.lunch = [{ name: 'Riz', grams: 200, kcal: 260, p: 5, c: 56, f: 1 }, { name: 'Poulet', grams: 150, kcal: 248, p: 46, c: 0, f: 5 }];
    saveData(todayStr()); renderApp();
  });
  const ligne = async () => page.evaluate(() => {
    const el = document.querySelector('#meals-container .meal-card[data-repas="lunch"] .food-item-ligne');
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width * .8, y: r.y + r.height / 2, l: r.width };
  });
  const glisser = async dx => { const l = await ligne(); await page.mouse.move(l.x, l.y); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(l.x + dx * i / 10, l.y); await page.mouse.up(); await page.waitForTimeout(500); };
  const noms = () => page.evaluate(() => getDay(todayStr()).meals.lunch.map(a => a.name));
  await glisser(-40);
  assert.deepEqual(await noms(), ['Riz', 'Poulet']);
  await glisser(-220);
  assert.deepEqual(await noms(), ['Poulet']);
  // La croix est toujours là (VoiceOver), mais plus visible.
  assert.deepEqual(await page.evaluate(() => { const b = document.querySelector('#meals-container .btn-delete'); const r = b.getBoundingClientRect(); return [!!b, r.width <= 1]; }), [true, true]);
}));

test("app iPhone, iOS 26 et plus : la barre d'onglets native remplace celle de la page et suit l'écran, les fenêtres, le « + » et la séance en cours", () => avecAppli({ natif: true }, async ({ page }) => {
  // Sans barre native (iOS plus ancien) : la page garde la sienne.
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('onglets-natifs')), false);
  await page.evaluate(async () => {
    window.__ecouteurs = {};
    window.__reponsesNatives['Onglets.etat'] = { actif: true };
    window.__reponsesNatives['Onglets.addListener'] = (nom, f) => { window.__ecouteurs[nom] = f; return {}; };
    allerA('repas');
    window.__appelsNatifs.length = 0;
    await initOngletsNatifs();
  });
  const appels = () => page.evaluate(() => window.__appelsNatifs.filter(a => a[0] === 'Onglets' && a[1] !== 'addListener').map(a => a[1] + ' ' + JSON.stringify(a[2])));
  const pause = () => page.evaluate(() => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f))));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.onglets')).display), 'none');
  assert.deepEqual((await appels()).slice(0, 3), ['etat null', 'selectionner {"nom":"repas"}', 'afficher {"visible":true}']);
  // L'écran choisi dans la page : la barre suit ; sur Progrès (et le Profil), pas de « + ».
  await page.evaluate(() => { window.__appelsNatifs.length = 0; allerA('stats'); });
  assert.deepEqual(await appels(), ['selectionner {"nom":"stats"}', 'plus {"visible":false,"libelle":"Ajouter une pesée"}']);
  // Administration n'a pas d'onglet : la barre montre le Profil, et toucher le
  // Profil (déjà en surbrillance) ou un autre onglet ramène à son écran.
  await page.evaluate(() => { window.__appelsNatifs.length = 0; allerA('admin'); });
  assert.ok((await appels()).includes('selectionner {"nom":"reglages"}'), JSON.stringify(await appels()));
  await page.evaluate(() => window.__ecouteurs.retouche({ nom: 'reglages' }));
  assert.equal(await page.evaluate(() => ecranActif), 'reglages');
  await page.evaluate(() => { allerA('admin'); window.__ecouteurs.retouche({ nom: 'repas' }); });
  assert.equal(await page.evaluate(() => ecranActif), 'repas');
  // L'onglet de l'écran affiché, touché à nouveau : on reste, la page remonte.
  await page.evaluate(() => { window.scrollTo(0, 300); window.__ecouteurs.retouche({ nom: 'repas' }); });
  assert.equal(await page.evaluate(() => ecranActif), 'repas');
  await page.evaluate(() => allerA('stats'));
  // Une feuille ouverte : la barre se cache, puis revient.
  await page.evaluate(() => { window.__appelsNatifs.length = 0; allerA('repas'); ouvrirFeuilleRepas('lunch'); });
  await pause();
  assert.ok((await appels()).includes('afficher {"visible":false}'), JSON.stringify(await appels()));
  await page.evaluate(() => { window.__appelsNatifs.length = 0; fermerFeuilles(); });
  await pause();
  assert.deepEqual(await appels(), ['afficher {"visible":true}']);
  // Un onglet touché dans la barre native : la page change d'écran ; le « + » agit sur l'écran affiché.
  await page.evaluate(() => window.__ecouteurs.onglet({ nom: 'seance' }));
  assert.equal(await page.evaluate(() => ecranActif), 'seance');
  await page.waitForTimeout(550);   // deux « + » à moins d'une demi-seconde n'en font qu'un
  await page.evaluate(() => window.__ecouteurs.plus());
  assert.equal(await page.evaluate(() => document.getElementById('feuille-activite').classList.contains('show')), true);
  await page.evaluate(() => fermerFeuilles());
  // Séance en cours, réduite : posée au-dessus de la barre native, et rouverte d'un appui.
  await page.evaluate(async () => { await demarrerSeanceLibre(); window.__appelsNatifs.length = 0; allerA('repas'); majBandeauSeanceFlottant(); });
  const acc = (await appels()).filter(a => a.startsWith('accessoire'));
  assert.ok(acc.length && /"titre":"Séance libre"/.test(acc[acc.length - 1]) && /"depuis":\d+/.test(acc[acc.length - 1]), JSON.stringify(acc));
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('bandeau-seance-flottant')).display), 'none');
}));

test("barre d'onglets : l'icône de l'onglet actif garde tous ses traits (manche de la fourchette de Repas)", () => avecAppli({}, async ({ page }) => {
  // L'onglet actif se dessine d'une couleur unie, celle du texte : tous les
  // traits sont peints. (Un dégradé calculé sur la boîte de chaque trait ne
  // peindrait pas un trait parfaitement droit, de largeur nulle : celui qui
  // reste défini l'est dans les coordonnées de l'icône.)
  const r = await page.evaluate(() => {
    allerA('repas');
    const g = document.getElementById('grad-onglet');
    const icone = document.querySelector('#onglet-repas .icone-ui');
    const temoin = document.createElement('i');
    temoin.style.color = 'var(--text)';
    document.body.appendChild(temoin);
    const texte = getComputedStyle(temoin).color;
    temoin.remove();
    return { unites: g.getAttribute('gradientUnits'), actif: document.getElementById('onglet-repas').classList.contains('actif'),
      manche: [...icone.querySelectorAll('path')].some(p => p.getAttribute('d') === 'M7 2v20'), trait: getComputedStyle(icone).stroke === texte };
  });
  assert.deepEqual(r, { unites: 'userSpaceOnUse', actif: true, manche: true, trait: true });
}));

test('habillage sobre : accent noir (blanc en sombre), silhouettes en couleur avec les muscles travaillés en rose', () => avecAppli({ theme: 'light' }, async ({ page }) => {
  const lire = () => page.evaluate(() => {
    const fill = el => el ? getComputedStyle(el).fill : null;
    const vise = sel => document.querySelector(`${sel} path[fill="var(--corps-cible)"]`);
    const neutre = document.querySelector('.sdj-corps path[fill="var(--corps-neutre)"]');
    return { primaire: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
      sdj: fill(vise('.sdj-corps')), programme: fill(vise('.pc-corps')), neutre: fill(neutre) };
  });
  await page.evaluate(() => {
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    musculationProgrammes.push({ id: 'pc', nom: 'Push', exercices: [{ exerciceId: exo.id, series: [{ poids: 60, reps: 8 }] }], maj: Date.now() });
    allerA('seance'); choisirModeSeance('muscu');
  });
  const clair = await lire();
  await page.evaluate(() => choisirTheme('dark'));
  // Le changement de thème passe en fondu : on lit les couleurs une fois arrivées.
  await page.waitForTimeout(600);
  const sombre = await lire();
  assert.deepEqual(clair, { primaire: '#0b0b0c', sdj: 'rgb(219, 39, 119)', programme: 'rgb(219, 39, 119)', neutre: 'rgb(212, 212, 218)' });
  assert.deepEqual(sombre, { primaire: '#f5f5f7', sdj: 'rgb(244, 114, 182)', programme: 'rgb(244, 114, 182)', neutre: 'rgb(46, 46, 51)' });
}));

test("image de partage : noir et blanc quel que soit le thème (barres blanches sur fond noir, grille fine)", () => avecAppli({ theme: 'light' }, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    musculationHistorique.push({ id: 'h1', date: todayStr(), programmeNom: 'Push', dureeMin: 50,
      exercices: [{ exerciceId: exo.id, series: [{ poids: 60, reps: 8, fait: true }, { poids: 60, reps: 8, fait: true }] }] });
    allerA('stats');
    ouvrirPartageStats();
    const img = document.getElementById('partage-stats-img');
    for (let i = 0; i < 100 && !(img.src || '').startsWith('data:image/png'); i++) await new Promise(r => setTimeout(r, 50));
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const x = cv.getContext('2d');
    x.drawImage(img, 0, 0);
    const px = (a, b) => [...x.getImageData(a, b, 1, 1).data.slice(0, 3)];
    // Fond hors grille ; première barre (muscle le plus travaillé, pleine largeur).
    return { taille: [cv.width, cv.height], fond: px(30, 30), grille: px(61, 30), barre: px(540, 977) };
  });
  assert.deepEqual(r.taille, [1080, 1920]);
  assert.deepEqual(r.fond, [10, 10, 11]);
  assert.ok(r.grille[0] > 15 && r.grille[0] < 40, `grille visible mais discrète : ${r.grille}`);
  assert.deepEqual(r.barre, [245, 245, 247]);
}));

test("Profil : la page montre « moi » (identité, objectif, corps, badges), l'engrenage tous les réglages, « Modifier » le nom, la photo et la bio", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    allerA('reglages');
    const ecran = document.getElementById('ecran-reglages');
    const blocs = ['vitrine-profil', 'carte-corps', 'gymbros-rangee-profil', 'vitrine-badges'];
    const ordre = [...ecran.children].filter(e => blocs.includes(e.id)).map(e => e.id);
    const dans = (sel, id) => !!document.querySelector(`${sel} #${id}`);
    document.querySelector('#vitrine-profil .pf-modif').click();
    const modifier = document.getElementById('profil-modif-modal').classList.contains('show');
    fermerModal('profil-modif-modal');
    // La balance : « Connecter » dans les réglages, puis « Déconnecter » une fois reliée.
    const visible = id => !document.getElementById(id).classList.contains('hidden');
    const balance = [visible('withings-deconnecte-reglages'), visible('withings-connecte-reglages')];
    return {
      ordre,
      corps: ['base-gender', 'base-age', 'base-height', 'resume-mesures'].every(id => dans('#carte-corps', id)),
      reglages: ['reglages-email', 'reglages-puce-sync', 'segment-theme', 'btn-revoir-tutoriel', 'btn-visite-muscu', 'btn-premiers-pas', 'bloc-installer-app', 'withings-deconnecte-reglages'].every(id => dans('#reglages-modal', id)),
      identite: ['profil-pseudo', 'profil-perso', 'profil-bio', 'profil-partage'].every(id => dans('#profil-modif-modal', id)),
      compteSansBalance: !document.querySelector('#compte-modal .lien-connexion-withings'),
      modifier, balance,
      titres: [...ecran.querySelectorAll('.vitrine-sec h3')].map(h => h.textContent)
    };
  });
  assert.deepEqual(r.ordre, ['vitrine-profil', 'carte-corps', 'gymbros-rangee-profil', 'vitrine-badges']);
  assert.deepEqual(r.titres, ['Mon objectif', 'Mon corps', 'Passe de saison', 'Vitrine']);
  assert.deepEqual([r.corps, r.reglages, r.identite, r.compteSansBalance, r.modifier], [true, true, true, true, true]);
  assert.deepEqual(r.balance, [true, false]);
}));

// Un faux Supabase pour le Pro : la table « abonnements » (absente, vide,
// ou une ligne), les fonctions d'admin et la fonction serveur « ia ».
async function installerFauxPro(page, etat) {
  await page.evaluate(etat => {
    window.__pro = { etat, rpc: [], ia: [] };
    sessionUtilisateur = { id: 'u1', email: 'moi@exemple.fr' };
    supa = {
      from: () => {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => window.__pro.etat === 'absente'
          ? { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.abonnements' in the schema cache" } }
          : { data: window.__pro.etat, error: null } };
        return q;
      },
      rpc: async (nom, args) => { window.__pro.rpc.push([nom, args]); window.__pro.etat = args.p_offert ? { formule: 'offert', statut: 'actif', fin: null } : null; return { error: null }; },
      functions: { invoke: async (nom, o) => window.__pro.ia.shift()(o) }
    };
  }, etat);
}

test("Pro : rien n'est verrouillé tant que le SQL Pro n'est pas exécuté ; ensuite, verrous pour un compte gratuit, aucun pour un fondateur", () => avecAppli({}, async ({ page }) => {
  await installerFauxPro(page, 'absente');
  const lire = () => page.evaluate(async () => {
    await chargerAbonnementPro();
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    const res = { verrous: document.documentElement.classList.contains('verrous-pro'), acces: accesPro(), ligne: document.getElementById('ligne-pro').classList.contains('hidden') ? null : [document.getElementById('pro-statut').textContent, document.getElementById('pro-bouton-ligne').textContent] };
    // Photos, balance, période longue : la fenêtre Pro à la place.
    ouvrirPhotosProgression();
    res.photos = document.getElementById('photos-modal').classList.contains('show') ? 'photos' : document.getElementById('pro-modal').classList.contains('show') ? document.querySelector('#pro-contenu .pro-raison').textContent : '?';
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    res.balance = connexionWithings({ preventDefault() {} });
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    choisirPeriodeStats('30'); choisirPeriodeStats('365');
    res.periode = periodeStats;
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    allerA('reglages');
    res.pastilleNom = !!document.querySelector('#vitrine-profil .pf-id .pastille-pro--abonne');
    return res;
  });
  const sansTable = await lire();
  assert.deepEqual(sansTable, { verrous: false, acces: true, ligne: null, photos: 'photos', balance: true, periode: '365', pastilleNom: false });

  await page.evaluate(() => { window.__pro.etat = null; });
  const gratuit = await lire();
  assert.deepEqual(gratuit, { verrous: true, acces: false, ligne: ['Gratuit', 'Découvrir'], photos: 'Les photos de progression font partie de Pro.', balance: false, periode: '30', pastilleNom: false });
  // Un bloc avancé de Progrès est flouté ; le toucher ouvre la fenêtre Pro.
  const bloc = await page.evaluate(() => {
    ouvrirStats('resume');
    const g = document.querySelector('#pg-resume .pg-maint');
    const apres = getComputedStyle(g, '::after').content;
    g.click();
    return [apres, document.getElementById('pro-modal').classList.contains('show')];
  });
  assert.deepEqual(bloc, ['"Pro · Débloquer"', true]);
  // L'offre : deux formules, l'annuel choisi ; sans liens de paiement, « bientôt ».
  const offre = await page.evaluate(() => ({
    formules: [...document.querySelectorAll('.pro-formule')].map(b => [b.querySelector('span').textContent, b.getAttribute('aria-checked')]),
    bouton: [document.getElementById('pro-essai').textContent, document.getElementById('pro-essai').disabled]
  }));
  assert.deepEqual(offre, { formules: [['29,99 € / an', 'true'], ['3,99 € / mois', 'false']], bouton: ['Paiement bientôt disponible', true] });

  await page.evaluate(() => { window.__pro.etat = { formule: 'fondateur', statut: 'actif', fin: null }; });
  const fondateur = await lire();
  assert.deepEqual(fondateur, { verrous: false, acces: true, ligne: ['Membre fondateur · à vie', 'Voir'], photos: 'photos', balance: true, periode: '365', pastilleNom: true });

  // Abonnement payé mais arrivé à sa fin : retour au gratuit.
  await page.evaluate(() => { window.__pro.etat = { formule: 'an', statut: 'actif', fin: new Date(Date.now() - 60e3).toISOString() }; });
  assert.equal((await lire()).verrous, true);
}));

test("Pro : l'IA passe par le serveur quand il répond (3 essais par mois), puis propose Pro ; lien de paiement au nom du compte", () => avecAppli({}, async ({ page }) => {
  await installerFauxPro(page, null);
  const r = await page.evaluate(async () => {
    const reponse = (status, corps) => ({ data: null, error: { context: new Response(JSON.stringify(corps), { status }) } });
    window.__pro.ia.push(
      () => ({ data: { pret: true, pro: false, restant: 1 }, error: null }),
      o => ({ data: { candidates: [{ content: { parts: [{ text: 'Belle journée.' }] } }], restant: 0, corps: o.body }, error: null }),
      () => reponse(402, { erreur: 'Tes 3 essais IA du mois sont utilisés. Passe à Pro pour continuer.', code: 'pro_requis', restant: 0 })
    );
    await chargerAbonnementPro();
    await verifierIAServeur();
    const res = { active: document.documentElement.classList.contains('ia-active'), puce: document.querySelector('.puce-ia').textContent };
    res.texte = await geminiGenerate([{ text: 'Analyse ma journée' }], 'texte');
    res.puceApres = document.querySelector('.puce-ia').textContent;
    try { await geminiGenerate([{ text: 'Encore' }], 'texte'); } catch (e) { res.erreur = messageIA(e); }
    res.fenetre = document.getElementById('pro-modal').classList.contains('show') && document.querySelector('#pro-contenu .pro-raison').textContent;
    // Paiement : le lien Stripe porte l'identifiant et l'email du compte.
    PRO_LIENS.an = 'https://buy.stripe.com/test_annuel'; PRO_LIENS.mois = 'https://buy.stripe.com/test_mensuel';
    renderPro();
    const bouton = document.getElementById('pro-essai');
    res.avantAccord = [bouton.textContent, bouton.disabled];
    document.getElementById('pro-accord').click();
    res.apresAccord = bouton.disabled;
    let ouverte = null;
    window.open = url => { ouverte = url; return {}; };
    choisirFormulePro('mois');
    commencerPro();
    res.lien = ouverte;
    res.suivi = !!localStorage.getItem('askesis_pro_paiement');
    return res;
  });
  assert.deepEqual([r.active, r.puce, r.texte, r.puceApres], [true, '1 essai IA gratuit ce mois-ci', 'Belle journée.', 'Essais IA du mois utilisés · Pro pour continuer']);
  assert.equal(r.erreur, 'Tes 3 essais IA du mois sont utilisés. Passe à Pro pour continuer.');
  assert.equal(r.fenetre, 'Tes 3 essais IA du mois sont utilisés.');
  assert.deepEqual([r.avantAccord, r.apresAccord], [['Essayer 14 jours gratuitement', true], false]);
  assert.equal(r.lien, 'https://buy.stripe.com/test_mensuel?client_reference_id=u1&prefilled_email=moi%40exemple.fr&locale=fr');
  assert.equal(r.suivi, true);
}));

test('Pro : l\'administrateur offre le Pro à un compte, puis le retire', () => avecAppli({}, async ({ page }) => {
  await installerFauxPro(page, null);
  const r = await page.evaluate(async () => {
    const etat = () => [document.querySelector('#admin-pro b').textContent, [...document.querySelectorAll('#admin-pro .pilule')].map(b => b.textContent)];
    const res = [];
    await afficherProAdmin('u2'); res.push(etat());
    await basculerProAdmin('u2', true); res.push(etat());
    await basculerProAdmin('u2', false); res.push(etat());
    return { res, rpc: window.__pro.rpc };
  });
  assert.deepEqual(r.res, [['Gratuit', ['Offrir Pro']], ['Pro offert', ['Retirer']], ['Gratuit', ['Offrir Pro']]]);
  assert.deepEqual(r.rpc, [['admin_offrir_pro', { p_utilisateur: 'u2', p_offert: true }], ['admin_offrir_pro', { p_utilisateur: 'u2', p_offert: false }]]);
}));

/* ---------- App iOS : un faux iPhone (window.AppNatif imité, voir outils.js)
   note chaque appel aux modules natifs ; sur le web, rien ne doit changer. ---------- */
const appelsNatifs = page => page.evaluate(() => window.__appelsNatifs.map(([m, f, o]) => ({ m, f, o })));
const appelsDe = async (page, module, methode) => (await appelsNatifs(page)).filter(a => a.m === module && (!methode || a.f === methode));

test('app iOS : sur le web, rien ne change (aucun module natif, caméra du navigateur, ni Apple Santé)', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const vibrations = [];
    navigator.vibrate = m => { vibrations.push(m); return true; };
    vibrer('alerte'); vibrer('selection');
    const ligne = id => getComputedStyle(document.getElementById(id).closest('.ligne-reglage')).display;
    return { natif: NATIF, classe: document.documentElement.classList.contains('app-ios'), installee: estAppInstallee(), vibrations,
      retour: urlRetourEmail() === location.origin + location.pathname, lecteur: getComputedStyle(document.getElementById('reader')).display,
      sante: ligne('sante-inactive'), withings: ligne('withings-deconnecte-reglages') };
  });
  assert.deepEqual(r, { natif: null, classe: false, installee: false, vibrations: [[120, 80, 120], 4], retour: true, lecteur: 'block', sante: 'none', withings: 'flex' });
}));

test('app iOS : démarrage, barre d\'état, liens externes et partage passent par les modules de l\'iPhone', () => avecAppli({ natif: true }, async ({ page }) => {
  const depart = await appelsNatifs(page);
  assert.ok(depart.some(a => a.m === 'ScreenOrientation' && a.f === 'lock' && a.o.orientation === 'portrait'), 'portrait au démarrage');
  assert.ok(depart.some(a => a.m === 'SplashScreen' && a.f === 'hide'), "l'écran de lancement d'iOS laisse la place");
  await page.evaluate(() => { window.__appelsNatifs.length = 0; choisirTheme('dark'); choisirTheme('light'); });
  assert.deepEqual((await appelsDe(page, 'StatusBar', 'setStyle')).map(a => a.o.style), ['DARK', 'LIGHT']);
  const r = await page.evaluate(async () => {
    window.__appelsNatifs.length = 0;
    window.__reponsesNatives['Filesystem.writeFile'] = o => ({ uri: 'file:///cache/' + o.path });
    const a = document.createElement('a');
    a.href = 'confidentialite.html'; a.target = '_blank'; a.textContent = 'Confidentialité';
    document.body.appendChild(a); a.click(); a.remove();
    const fenetre = window.open('https://world.openfoodfacts.org/', '_blank');
    partageBlob = new Blob(['png'], { type: 'image/png' });
    await partagerImageStats();
    return { fenetre: !!fenetre, installee: estAppInstallee(), retour: urlRetourEmail(), classe: document.documentElement.classList.contains('app-ios') };
  });
  assert.deepEqual(r, { fenetre: true, installee: true, retour: 'https://boulidjamal-lang.github.io/mon-coach/', classe: true });
  const liste = await appelsNatifs(page);
  assert.deepEqual(liste.filter(a => a.m === 'Browser').map(a => a.o.url),
    ['https://boulidjamal-lang.github.io/mon-coach/confidentialite.html?app=ios', 'https://world.openfoodfacts.org/']);
  const ecrit = liste.find(a => a.m === 'Filesystem' && a.f === 'writeFile');
  assert.deepEqual([ecrit.o.path, ecrit.o.directory, ecrit.o.data], ['bilan-askesis.png', 'CACHE', Buffer.from('png').toString('base64')]);
  assert.deepEqual(liste.find(a => a.m === 'Share').o.files, ['file:///cache/bilan-askesis.png']);
}));

test('app iOS : en séance, écran gardé allumé, retour tactile, et rappel de fin de repos programmé puis annulé', () => avecAppli({ natif: true }, async ({ page }) => {
  const debut = await page.evaluate(() => {
    window.__reponsesNatives['LocalNotifications.checkPermissions'] = { display: 'prompt' };
    window.__reponsesNatives['LocalNotifications.requestPermissions'] = { display: 'granted' };
    allerA('seance'); choisirModeSeance('muscu');
    demarrerSeanceLibre();
    ajouterExerciceASession(toutesLesExercices().find(e => e.groupe === 'pectoraux').id);
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    modifierSerieSession(0, 0, 'poids', '60');
    modifierSerieSession(0, 0, 'reps', '10');
    const t0 = Date.now();
    basculerSerieSession(0, 0);
    return { t0, repos: reposCibleExo(0), nom: libelleExercice(trouverExercice(musculationSessionActive.exercices[0].exerciceId)) };
  });
  await page.waitForFunction(() => window.__appelsNatifs.some(a => a[0] === 'LocalNotifications' && a[1] === 'schedule'));
  assert.equal((await appelsDe(page, 'KeepAwake', 'keepAwake')).length, 1);
  assert.ok((await appelsDe(page, 'Haptics', 'impact')).some(a => a.o.style === 'MEDIUM'), 'un petit choc quand la série est cochée');
  // (addListener : toucher un rappel ouvre le bon écran, branché au démarrage.)
  assert.deepEqual((await appelsDe(page, 'LocalNotifications')).map(a => a.f).filter(f => f !== 'cancel' && f !== 'addListener'), ['checkPermissions', 'requestPermissions', 'schedule']);
  const n = (await appelsDe(page, 'LocalNotifications', 'schedule'))[0].o.notifications[0];
  assert.equal(n.id, 41000);
  assert.equal(n.title, 'Repos terminé');
  assert.equal(n.sound, 'fin-repos.wav');
  assert.ok(n.body.startsWith(debut.nom));
  const fin = new Date(n.schedule.at).getTime() - debut.t0;
  assert.ok(Math.abs(fin - debut.repos * 1000) < 2000, `fin du repos prévue à ${fin} ms`);
  // Repos arrêté : la notification part ; séance finie : l'écran peut s'éteindre.
  await page.evaluate(() => arreterRepos(0, 0));
  await page.waitForFunction(() => window.__appelsNatifs.some(a => a[0] === 'LocalNotifications' && a[1] === 'cancel'));
  assert.deepEqual((await appelsDe(page, 'LocalNotifications', 'cancel'))[0].o, { notifications: [{ id: 41000 }] });
  await page.evaluate(() => terminerSeance());
  await page.waitForTimeout(300);
  assert.equal((await appelsDe(page, 'KeepAwake', 'allowSleep')).length, 1);
}));

test('app iOS : Apple Santé remplit les pas et les pesées, sans jamais écraser une saisie', () => avecAppli({ natif: true }, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const auj = todayStr(), hier = shiftDate(auj, -1);
    const a = (d, h) => new Date(d + 'T' + h).toISOString();
    window.__reponsesNatives['Health.isAvailable'] = { available: true };
    window.__reponsesNatives['Health.queryAggregated'] = { samples: [{ startDate: a(hier, '00:00:00'), value: 3000 }, { startDate: a(auj, '00:00:00'), value: 12000.4 }] };
    window.__reponsesNatives['Health.readSamples'] = { samples: [{ startDate: a(auj, '08:00:00'), value: 80.43 }, { startDate: a(hier, '08:00:00'), value: 81 }] };
    getDay(hier).steps = 5000; getDay(hier).weight = 82; saveData(hier);
    await activerSante();
    const visible = id => !document.getElementById(id).classList.contains('hidden');
    return { pas: getDay(auj).steps, poids: getDay(auj).weight, mesure: userProfile.mesures[auj].poids,
      pasHier: getDay(hier).steps, poidsHier: getDay(hier).weight, reglage: localStorage.getItem('mc_sante_apple'),
      connecte: visible('sante-active'), aConnecter: visible('sante-inactive') };
  });
  assert.deepEqual(r, { pas: 12000, poids: 80.4, mesure: 80.4, pasHier: 5000, poidsHier: 82, reglage: '1', connecte: true, aConnecter: false });
  assert.deepEqual((await appelsDe(page, 'Health', 'requestAuthorization'))[0].o, { read: ['steps', 'weight'] });
  await page.evaluate(() => desactiverSante());
  assert.equal(await page.evaluate(() => localStorage.getItem('mc_sante_apple')), null);
}));

test("calculs (lot 9) : protéines sur la masse maigre estimée au-delà d'un IMC de 30, plancher jamais sous 1 200 / 1 500 kcal, objectif signalé comme estimé sans âge ni taille, densité des liquides, nombres groupés, horizon de la projection", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const auj = todayStr();
    const cibles = (profil, goal) => { Object.assign(userProfile, profil); const j = getDay(auj); j.goal = goal; j.weight = profil.weight; j.workouts = []; j.steps = 0; return computeTargets(j, auj, { sansSemaine: true }); };
    const obese = cibles({ weight: 120, height: 180, age: 35, gender: 'm' }, 'seche');
    const normal = cibles({ weight: 80, height: 180, age: 30, gender: 'm' }, 'seche');
    const petite = cibles({ weight: 50, height: 160, age: 30, gender: 'f' }, 'seche');
    delete userProfile.age; delete userProfile.height;
    const inconnu = cibles({ weight: 80, gender: 'm' }, 'maintien');
    renderApp();
    const badgeVisible = !document.getElementById('objectif-estime').classList.contains('hidden');
    const complet = cibles({ weight: 80, height: 180, age: 30, gender: 'm' }, 'maintien');
    renderApp();
    const badgeCache = document.getElementById('objectif-estime').classList.contains('hidden');
    return { obese: [obese.protein, obese.protein * 4 + obese.carbs * 4 + obese.fat * 9 - obese.target], normal: normal.protein, petite: [petite.plancher, petite.target, petite.plancherRaison],
      estime: [inconnu.estime, complet.estime, badgeVisible, badgeCache],
      densites: [densiteLiquide("Huile d'olive"), densiteLiquide('Lait demi-écrémé'), densiteLiquide('Miel'), densiteLiquide('Eau')], groupe: nombreFr(1905, 0) };
  });
  assert.ok(r.obese[0] >= 150 && r.obese[0] <= 185, 'protéines sur une masse maigre estimée (~76 kg × 2,2), pas 264 g : ' + r.obese[0]);
  assert.ok(Math.abs(r.obese[1]) <= 2, 'macros cohérentes avec la cible');
  assert.equal(r.normal, 176);
  assert.deepEqual(r.petite, [1200, 1200, 'minimum']);
  assert.deepEqual(r.estime, [true, false, true, true]);
  assert.deepEqual(r.densites, [0.92, 1.03, 1.4, 1]);
  assert.equal(r.groupe, '1 905');
  // Saisie manuelle : 100 ml d'huile à 900 kcal/100 g = 828 kcal, et la quantité reste en ml.
  const h = await page.evaluate(() => {
    ouvrirModal('manual-modal'); uniteCourante = 'ml';
    document.getElementById('man-name').value = "Huile d'olive"; document.getElementById('man-grams').value = 100; document.getElementById('man-kcal100').value = 900;
    document.getElementById('man-p100').value = 0; document.getElementById('man-c100').value = 0; document.getElementById('man-f100').value = 100;
    const n = getDay(currentDate).meals[activeMealId || 'lunch'].length;
    return validerAjoutManuel().then(() => { const it = getDay(currentDate).meals[activeMealId || 'lunch'][n]; return it && [Math.round(it.kcal), it.grams, it.unite]; });
  });
  assert.deepEqual(h, [828, 100, 'ml']);
}));

test("interface (lot 10) : chaque champ a un nom accessible, aucun texte sous 12 px sur Repas, « + » masqué sur Progrès et Profil, séance à faire en tête d'une semaine vide, contraste du texte secondaire, animation d'entrée réduite, page jamais défilable de côté", () => avecAppli({ natif: true }, async ({ page }) => {
  const r = await page.evaluate(() => {
    const sansNom = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')].filter(i => !(i.id && document.querySelector(`label[for="${i.id}"]`)) && !i.closest('label') && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby')).map(i => i.id || i.name || i.className);
    allerA('repas'); renderApp();
    const petits = [...new Set([...document.querySelectorAll('#ecran-repas *')].filter(el => el.offsetParent && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 11.9).map(el => el.className + ' ' + getComputedStyle(el).fontSize))];
    const plusRepas = getComputedStyle(document.getElementById('onglet-plus')).visibility;
    allerA('seance'); choisirModeSeance('muscu'); renderApp();
    const ordre = [...document.querySelectorAll('#vitrine-muscu > *')].map(e => e.className.split(' ')[0]);
    const anim = getComputedStyle(document.getElementById('ecran-seance')).animationName;
    const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const probe = document.createElement('span'); probe.style.color = 'var(--text-muted)'; probe.style.background = 'var(--bg)'; document.body.appendChild(probe);
    const cs = getComputedStyle(probe); const [a, b] = [lum(cs.color), lum(cs.backgroundColor)].sort((x, y) => y - x); probe.remove();
    allerA('stats'); const plusStats = [document.getElementById('onglet-plus').disabled, getComputedStyle(document.getElementById('onglet-plus')).visibility];
    allerA('reglages'); const plusProfil = getComputedStyle(document.getElementById('onglet-plus')).visibility;
    return { sansNom, petits, ordre, anim, ratio: Math.round((a + 0.05) / (b + 0.05) * 100) / 100, plusStats, plusProfil, plusRepas, clip: getComputedStyle(document.documentElement).overflowX };
  });
  assert.deepEqual(r.sansNom, []);
  assert.deepEqual(r.petits, []);
  assert.equal(r.ordre[0], 'sdj', 'semaine vide : la séance à faire passe en tête');
  assert.deepEqual([r.plusStats, r.plusProfil, r.plusRepas], [[true, 'hidden'], 'hidden', 'visible']);
  assert.ok(r.ratio >= 5, 'contraste du texte secondaire : ' + r.ratio);
  assert.equal(r.anim, 'none', "animations réduites : l'écran n'est pas animé");
  assert.equal(r.clip, 'clip');
}));

test("garde-fous : l'excès des jours d'avant de la semaine est repris sur les jours qui restent ; une journée trop peu notée ne compte pas ; une séance oubliée s'arrête", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    const auj = todayStr(), lundi = lundiDe(auj), hier = shiftDate(auj, -1);
    const base = computeTargets(getDay(auj), auj, { sansSemaine: true }).target;
    const noter = (d, kcal) => { const j = getDay(d); j.meals.lunch = [{ name: 'Test', grams: 100, kcal, p: 0, c: 0, f: 0 }]; saveData(d); };
    const res = { lundi: auj === lundi };
    if (auj !== lundi) {
      noter(hier, Math.round(base * 1.5));   // une journée bien au-dessus
      const t = computeTargets(getDay(auj), auj);
      res.baisse = t.reprise > 0 && t.target === base - t.reprise && t.reprise <= Math.round(base * 0.15 / 10) * 10 + 10;
      noter(hier, Math.round(base * 0.4));   // une journée à peine notée : ignorée
      res.ignoree = computeTargets(getDay(auj), auj).reprise === 0;
    }
    // Séance oubliée : 2 h sans rien toucher, elle s'arrête 10 min après la dernière action.
    const debut = Date.now() - 4 * 3600000;
    musculationSessionActive = { id: 's1', programmeId: null, programmeNom: 'Test', debut, derniereAction: debut + 50 * 60000, exercices: [], notes: '' };
    return res;
  });
  if (!r.lundi) assert.deepEqual({ baisse: r.baisse, ignoree: r.ignoree }, { baisse: true, ignoree: true });
  await page.evaluate(() => { confirmer = () => Promise.resolve(true); return terminerSeance(); });
  const duree = await page.evaluate(() => musculationHistorique[0] && musculationHistorique[0].dureeMin);
  assert.equal(duree, 60);
}));

test('garde-fous de saisie : une valeur hors norme est signalée (on garde ou on corrige), une valeur impossible est refusée', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const vus = []; let reponse = false;
    confirmer = t => { vus.push(t); return Promise.resolve(reponse); };
    informer = t => { vus.push(t); return Promise.resolve(true); };
    const attendre = () => new Promise(f => setTimeout(f, 0));
    const res = {};
    // Aliment de 2 500 kcal : noté tout de suite, retiré si on ne le garde pas.
    const n = getDay(currentDate).meals.lunch.length;
    addItemToMeal('lunch', { name: 'Pizza', grams: 300, kcal: 2500, p: 0, c: 0, f: 0 }, { partager: false });
    res.ajoute = getDay(currentDate).meals.lunch.length === n + 1;
    await attendre();
    res.retire = getDay(currentDate).meals.lunch.length === n;
    // Pesée impossible : refusée, la feuille reste ouverte.
    ouvrirSaisieRapide('poids'); document.getElementById('saisie-rapide-champ').value = '750'; validerSaisieRapide();
    await attendre();
    res.peseeRefusee = !(getDay(todayStr()).weight === 750);
    // 70 000 pas : demandé, gardé si on confirme.
    reponse = true;
    ouvrirSaisieRapide('pas'); document.getElementById('saisie-rapide-champ').value = '70000'; validerSaisieRapide();
    await attendre();
    res.pas = document.getElementById('daily-steps').value === '70000';
    // Série à 1 000 kg : pas cochée si on corrige.
    reponse = false;
    musculationSessionActive = { id: 's1', programmeNom: 'Test', debut: Date.now(), exercices: [{ exerciceId: 'x', nom: 'X', series: [{ poids: 1000, reps: 8, fait: false }] }], notes: '' };
    basculerSerieSession(0, 0);
    await attendre();
    res.serie = musculationSessionActive.exercices[0].series[0].fait === false;
    musculationSessionActive = null;
    // Cardio : 42 km de course en 1 h, c'est demandé.
    res.cardio = !!alerteCardio('course', 60, 42) && !alerteCardio('course', 60, 12);
    res.messages = vus.length;
    return res;
  });
  assert.deepEqual(r, { ajoute: true, retire: true, peseeRefusee: true, pas: true, serie: true, cardio: true, messages: 4 });
}));

test("gourde : une bouteille dessinée image par image ; un défilement rapide fait tanguer l'eau, qui s'apaise ensuite", () => avecAppli({ animations: true }, async ({ page }) => {
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px'; allerA('repas'); renderApp();
    getDay(currentDate).eauMl = 1000; majJaugeEau();
    document.getElementById('bloc-eau').scrollIntoView({ block: 'center' });
  });
  await page.waitForFunction(() => document.getElementById('gourde').dataset.calme === '1', null, { timeout: 4000 });
  // La toile est bien dessinée (pas vide).
  assert.equal(await page.evaluate(() => {
    const c = document.getElementById('gourde-toile'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n > c.width * c.height * 0.2;
  }), true);
  await page.evaluate(() => { const y = window.scrollY; window.scrollTo(0, y + 4); setTimeout(() => window.scrollTo(0, y + 150), 20); });
  await page.waitForFunction(() => document.getElementById('gourde').dataset.calme === '0', null, { timeout: 2000 });
  await page.waitForFunction(() => document.getElementById('gourde').dataset.calme === '1', null, { timeout: 8000 });
}));

test("gourde : l'eau suit le téléphone — penché, le niveau reste à l'horizontale ; peu d'eau, elle se rassemble dans le coin ; secoué, elle clapote ; à plat, à l'envers ou hors de l'écran, rien ne penche", () => avecAppli({ animations: true }, async ({ page }) => {
  // Navigateur (Safari) : aucune demande d'autorisation, donc aucune fenêtre système.
  await page.evaluate(() => {
    window.__demandes = [];
    DeviceOrientationEvent.requestPermission = () => { window.__demandes.push('orientation'); return Promise.resolve('granted'); };
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(await page.evaluate(() => window.__demandes), []);
  await page.evaluate(() => {
    allerA('repas'); renderApp();
    getDay(currentDate).eauMl = 1000; majJaugeEau();
    document.getElementById('bloc-eau').scrollIntoView({ block: 'center' });
  });
  const calme = (v, timeout) => page.waitForFunction(v => document.getElementById('gourde').dataset.calme === v, v, { timeout });
  await page.waitForFunction(() => document.getElementById('gourde').dataset.calme === '1' && capteursGourdeActifs, null, { timeout: 4000 });
  const pencher = (beta, gamma) => page.evaluate(([b, g]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })), [beta, gamma]);
  // La surface près de chaque paroi (la houle et le ménisque comptent peu).
  const surface = () => page.evaluate(() => {
    const p = surfaceGourde(ySurfaceGourde(moteurGourde.part));
    return { gauche: p[2][1], droite: p[GOURDE_N - 2][1], fondDroite: GOURDE_VIDE - p[GOURDE_N][1], cible: moteurGourde.inclCible, pente: moteurGourde.inclTel };
  });
  // Téléphone penché, côté droit plus bas : l'eau reste à l'horizontale, elle monte donc côté droit de la bouteille.
  await pencher(60, 30);
  await calme('0', 2000);
  await calme('1', 6000);
  let r = await surface();
  assert.ok(Math.abs(r.cible + 0.2887) < 0.005, 'pente voulue : ' + r.cible);
  assert.ok(r.gauche - r.droite > 6, 'surface plus haute à droite : ' + JSON.stringify(r));
  // Presque vide : l'eau se rassemble dans le coin bas, sans disparaître.
  await page.evaluate(() => { getDay(currentDate).eauMl = 0; majJaugeEau(); });
  await page.waitForFunction(() => Math.abs(moteurGourde.part - moteurGourde.cible) < 0.002 && Math.abs(moteurGourde.vPart) < 0.001, null, { timeout: 6000 });
  r = await surface();
  assert.ok(r.fondDroite > 4, "de l'eau dans le coin droit : " + JSON.stringify(r));
  // À plat sur la table, ou tenu à l'envers : rien ne penche.
  for (const [beta, gamma] of [[0, 30], [-60, 20]]) {
    await pencher(beta, gamma);
    await page.waitForFunction(() => Math.abs(moteurGourde.inclTel) < 0.01 && Math.abs(moteurGourde.vTel) < 0.002, null, { timeout: 6000 });
    assert.equal(await page.evaluate(() => moteurGourde.inclCible), 0);
  }
  // Une secousse : l'eau clapote, puis s'apaise.
  await page.evaluate(() => { getDay(currentDate).eauMl = 1000; majJaugeEau(); });
  await pencher(60, 0);
  await calme('1', 8000);
  await page.evaluate(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
    acceleration: { x: 9, y: 0, z: 0 }, accelerationIncludingGravity: { x: 9, y: 8.5, z: 4.9 }, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 16 })));
  await calme('0', 2000);
  assert.equal(await page.evaluate(() => moteurGourde.sensAxes), 1);
  await calme('1', 8000);
  // Hors de l'écran Repas : les capteurs ne sont plus écoutés, la bouteille repart droite.
  await page.evaluate(() => allerA('stats'));
  await page.waitForFunction(() => !capteursGourdeActifs, null, { timeout: 2000 });
  await pencher(60, 30);
  assert.equal(await page.evaluate(() => moteurGourde.inclCible), 0);
}));

test("app iOS : l'accès aux capteurs (pour la gourde) se demande au premier toucher, une seule fois, sans fenêtre ; le reflet des cartes reste fixe", () => avecAppli({ natif: true, animations: true }, async ({ page }) => {
  await page.evaluate(() => {
    window.__demandes = [];
    DeviceOrientationEvent.requestPermission = () => { window.__demandes.push('orientation'); return Promise.resolve('granted'); };
    DeviceMotionEvent.requestPermission = () => { window.__demandes.push('mouvement'); return Promise.resolve('granted'); };
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.deepEqual(await page.evaluate(() => window.__demandes), ['orientation', 'mouvement']);
  const reflet = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--lx'));
  const avant = await reflet();
  await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 30 })));
  await page.waitForTimeout(400);
  assert.equal(await reflet(), avant);
}));

test("app iOS : le scanner de l'app (macro, mise au point rapide) remplace la caméra du navigateur ; l'ancien module reste en secours", () => avecAppli({ natif: true }, async ({ page }) => {
  await page.evaluate(() => {
    window.__reponsesNatives['Scanner.scanner'] = { code: '3017620422003' };
    chercherProduitOFFParCode = async code => { window.__codeCherche = code; };
    ouvrirBarcode('lunch');
  });
  await page.waitForFunction(() => window.__codeCherche);
  const r = await page.evaluate(() => ({ code: window.__codeCherche, champ: document.getElementById('manual-barcode-input').value,
    lecteur: getComputedStyle(document.getElementById('reader')).display, fenetre: document.getElementById('barcode-modal').classList.contains('show') }));
  assert.deepEqual(r, { code: '3017620422003', champ: '3017620422003', lecteur: 'none', fenetre: true });
  assert.deepEqual((await appelsDe(page, 'Scanner', 'scanner'))[0].o, { consigne: 'Vise le code-barres du produit' });
  assert.equal((await appelsDe(page, 'CapacitorBarcodeScanner', 'scanBarcode')).length, 0);
  // Fermé sans code : rien ; caméra refusée ; pas de caméra (dit, jamais silencieux).
  const essai = reponse => page.evaluate(async rep => {
    const dits = [];
    window.__codeCherche = null;
    informer = t => { dits.push(t); return Promise.resolve(true); };
    window.__reponsesNatives['Scanner.scanner'] = rep.erreur ? () => { throw Object.assign(new Error(rep.erreur[1]), { code: rep.erreur[0] }); } : rep;
    await scannerNatif();
    return { dits, cherche: window.__codeCherche };
  }, reponse);
  assert.deepEqual(await essai({ annule: true }), { dits: [], cherche: null });
  assert.match((await essai({ erreur: ['refus', 'Appareil photo refusé'] })).dits[0], /refusé à Askēsis : autorise-le dans Réglages › Askēsis › Appareil photo/);
  assert.deepEqual((await essai({ erreur: ['indisponible', "Pas d'appareil photo"] })).dits, ["Le scanner n'a pas pu s'ouvrir. Tape le code-barres à la main en attendant."]);
  // Une version de l'app sans ce module : l'ancien scanner, avec tous les réglages qu'il exige.
  await page.evaluate(() => {
    window.__reponsesNatives['Scanner.scanner'] = () => { throw Object.assign(new Error('"Scanner" plugin is not implemented on ios'), { code: 'UNIMPLEMENTED' }); };
    window.__reponsesNatives['CapacitorBarcodeScanner.scanBarcode'] = { ScanResult: '5449000000996', format: 9 };
    window.__codeCherche = null;
    scannerNatif();
  });
  await page.waitForFunction(() => window.__codeCherche === '5449000000996');
  assert.deepEqual((await appelsDe(page, 'CapacitorBarcodeScanner', 'scanBarcode'))[0].o,
    { hint: 17, scanInstructions: 'Vise le code-barres du produit', scanButton: false, scanText: ' ', cameraDirection: 1, scanOrientation: 1 });
  // Ses refus : fermé (rien), caméra refusée, autre erreur (dite, avec son code).
  const messages = [];
  for (const [codeErreur, message] of [['OS-PLUG-BARC-0006', 'Couldn’t scan because the process was cancelled.'],
    ['OS-PLUG-BARC-0007', 'Couldn’t scan because camera access wasn’t provided.'], ['OS-PLUG-BARC-0008', 'Scanning parameters are invalid.']]) {
    messages.push(await page.evaluate(async ([c, m]) => {
      const dits = [];
      informer = t => { dits.push(t); return Promise.resolve(true); };
      window.__reponsesNatives['CapacitorBarcodeScanner.scanBarcode'] = () => { throw Object.assign(new Error(m), { code: c }); };
      await scannerNatif();
      return dits;
    }, [codeErreur, message]));
  }
  assert.deepEqual(messages[0], []);
  assert.match(messages[1][0], /refusé à Askēsis : autorise-le dans Réglages › Askēsis › Appareil photo/);
  assert.match(messages[2][0], /^Le scanner n'a pas pu s'ouvrir\. .*\(OS-PLUG-BARC-0008\)$/);
}));

test('compte : accord avant l\'IA (un refus n\'envoie rien), suppression du compte, signaler et bloquer un gymbro', () => avecAppli({}, async ({ page }) => {
  const ia = await page.evaluate(async () => {
    let requetes = 0;
    const f = window.fetch;
    window.fetch = (...a) => { requetes++; return f(...a); };
    confirmer = () => Promise.resolve(false);
    let refus = null;
    try { await geminiGenerate([{ text: 'Bonjour' }], 'texte'); } catch (e) { refus = e.message; }
    confirmer = () => Promise.resolve(true);
    const accord = await accordIA();
    const texte = document.getElementById('accord-ia-etat').textContent;
    retirerAccordIA();
    window.fetch = f;
    return { refus, requetes, accord, texte, retire: !('accordIA' in userProfile), vide: document.getElementById('accord-ia-etat').textContent };
  });
  assert.match(ia.refus, /rien n'a été envoyé/);
  assert.equal(ia.requetes, 0);
  assert.equal(ia.accord, true);
  assert.match(ia.texte, /Partage avec l'IA \(Gemini\) accepté le/);
  assert.deepEqual([ia.retire, ia.vide], [true, '']);

  const sup = await page.evaluate(async () => {
    const trace = [];
    sessionUtilisateur = { id: 'u-1', email: 'moi@test.fr' };
    supa = {
      storage: { from: b => ({ list: async d => { trace.push(['list', b, d]); return { data: [{ name: '2026-10-01_a.jpg' }] }; },
        remove: async c => { trace.push(['remove', c]); return { error: null }; } }) },
      rpc: async n => { trace.push(['rpc', n]); return { error: null }; },
      auth: { signOut: async () => { trace.push(['signOut']); return {}; } }
    };
    getDay(todayStr()).steps = 4321; saveData(todayStr());
    await supprimerMonCompte();
    supa = null;
    return { trace, local: localStorage.getItem(STORAGE_KEY) };
  });
  assert.deepEqual(sup.trace, [['list', 'photos-progression', 'u-1'], ['remove', ['u-1/2026-10-01_a.jpg']], ['rpc', 'supprimer_mon_compte'], ['signOut']]);
  assert.equal(sup.local, null);

  const gb = await page.evaluate(async () => {
    const rpc = [];
    sessionUtilisateur = { id: 'u-1' };
    supa = { rpc: async (n, a) => { rpc.push([n, a]); return { data: [], error: null }; } };
    gymbroLiensActifs = [];
    await comparerGymbro('bob');
    const boutons = [...document.querySelectorAll('#gymbro-comparaison .gb-moderation button')].map(b => b.textContent);
    const signal = signalerGymbro('bob');
    const titre = document.getElementById('titre-signaler').textContent;
    document.querySelector('#modal-signaler [onclick="choisirMotifSignalement(\'Pub ou spam\')"]').click();
    await signal;
    await bloquerGymbro('bob');
    supa = null;
    return { boutons, titre, rpc: rpc.filter(([n]) => /signaler|bloquer/.test(n)) };
  });
  assert.deepEqual(gb.boutons, ['Signaler', 'Bloquer']);
  assert.equal(gb.titre, 'Signaler @bob');
  assert.deepEqual(gb.rpc, [['gymbro_signaler', { p_pseudo: 'bob', p_motif: 'Pub ou spam' }], ['gymbro_bloquer', { p_pseudo: 'bob' }]]);
}));

test('app iOS, Pro en vente : Pro se paie via Apple (prix d\'Apple, achat relié au compte puis vérifié par le serveur)', () => avecAppli({ natif: true }, async ({ page }) => {
  await page.evaluate(() => {
    PRO_EN_VENTE_APP = true;
    PRO_APPLE.an = 'askesis.pro.an'; PRO_APPLE.mois = 'askesis.pro.mois';
    window.__reponsesNatives['NativePurchases.getProducts'] = { products: [
      { identifier: 'askesis.pro.an', priceString: '29,99 €' }, { identifier: 'askesis.pro.mois', priceString: '3,99 €' }] };
    window.__reponsesNatives['NativePurchases.purchaseProduct'] = { transactionId: '1000' };
    const fin = new Date(Date.now() + 14 * 86400e3).toISOString();
    window.__invocations = [];
    let abonnement = null;
    sessionUtilisateur = { id: '6f1c2b8e-0000-4000-8000-000000000001', email: 'moi@test.fr' };
    supa = {
      functions: { invoke: async (nom, o) => {
        window.__invocations.push([nom, o && o.body]);
        if (nom === 'achats-apple') abonnement = { formule: 'an', statut: 'essai', fin };
        return { data: { pro: true }, error: null };
      } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: abonnement, error: null }) }) }) })
    };
    ouvrirPro();
  });
  await page.waitForFunction(() => produitsApple && document.querySelector('.pro-formule span').textContent.includes('29,99'));
  const fenetre = await page.evaluate(() => ({ prix: [...document.querySelectorAll('.pro-formule span')].map(s => s.textContent),
    pied: document.getElementById('pro-pied').textContent, restaurer: document.querySelector('.pro-actualiser').textContent,
    cgv: getComputedStyle(document.querySelector('#pro-contenu .pro-accord')).display, bouton: document.getElementById('pro-essai').disabled,
    balance: document.getElementById('pro-contenu').textContent.includes('Withings') }));
  assert.deepEqual(fenetre.prix, ['29,99 € / an', '3,99 € / mois']);
  assert.match(fenetre.pied, /14 jours gratuits, puis 29,99 € \/ an.*Réglages › ton nom › Abonnements.*Conditions d'utilisation · Confidentialité/);
  assert.deepEqual([fenetre.restaurer, fenetre.cgv, fenetre.bouton, fenetre.balance], ['Restaurer mes achats', 'none', false, false]);
  await page.click('#pro-essai');
  await page.waitForFunction(() => estPro());
  const achat = (await appelsDe(page, 'NativePurchases', 'purchaseProduct'))[0].o;
  assert.deepEqual(achat, { productIdentifier: 'askesis.pro.an', productType: 'subs', appAccountToken: '6f1c2b8e-0000-4000-8000-000000000001' });
  assert.deepEqual(await page.evaluate(() => window.__invocations[0]), ['achats-apple', { transactionId: '1000' }]);
  await page.evaluate(() => { supa = null; });
}));

test("app iOS : ni vidéo SmartWorkout, ni GIF ExerciseDB, ni image wger ; les autres images gardent leur source", () => avecAppli({ natif: true }, async ({ page }) => {
  const requetes = [];
  page.on('request', r => requetes.push(r.url()));
  const r = await page.evaluate(async () => {
    // La fiche montre d'abord le mouvement en 3D ; ici on regarde ce qu'elle montre sans lui (appareil sans WebGL 2,
    // ou « Voir la photo ») : c'est là que se jouent les droits des images.
    window.WebGL2RenderingContext = undefined;
    const fiche = id => {
      afficherFicheExerciceBiblio(id);
      choisirOngletFiche('technique');
      const z = document.querySelector('.fiche-onglet[data-onglet="technique"]');
      const res = { videos: z.querySelectorAll('video').length, img: (z.querySelector('.fiche-exo-image img') || {}).src || null,
        schema: !!z.querySelector('.schema-repli'), source: [...z.querySelectorAll('.fiche-exo-note-source')].map(p => p.textContent.trim()),
        sw: /smartworkout/i.test(z.innerHTML), corps: [...z.querySelectorAll('.corps-exo figcaption')].map(f => f.textContent) };
      fermerModal('fiche-exercice-modal');
      return res;
    };
    const res = {
      swSeul: fiche('sw-crunch-avec-ramene-de-genoux'),
      swEtImage: fiche('e130'),
      gif: fiche('e96'),
      wger: fiche('e168'),
      vignette: medaillonExercice(trouverExercice('sw-crunch-avec-ramene-de-genoux'), true),
      lienSW: videoExercice({ id: 'x', video: 'https://api.smartworkout.app/asset/video/1e4902a0-05fc-4ab0-8fcd-5e745eb096af.mp4' }),
      autreVideo: videoExercice({ id: 'y', video: 'https://exemple.fr/demo.mp4', videoPoster: 'https://api.smartworkout.app/asset/image/4e939dab' })
    };
    agrandirVideoExercice('sw-crunch-avec-ramene-de-genoux');
    res.agrandi = document.getElementById('video-zoom-media').innerHTML;
    fermerVideoExercice();
    prechargerVideosExercices(['sw-crunch-avec-ramene-de-genoux', 'e130']);
    ouvrirBibliotheque();
    await new Promise(ok => setTimeout(ok, 900));
    res.listeSW = /smartworkout|miniatures/.test(document.getElementById('picker-liste-exercices').innerHTML);
    return res;
  });
  assert.deepEqual(r.swSeul, { videos: 0, img: null, schema: true, source: ['En vif, le muscle travaillé.'], sw: false, corps: ['Face', 'Dos'] });
  assert.equal(r.swEtImage.videos, 0);
  assert.match(r.swEtImage.img, /RepDB/);
  assert.deepEqual(r.swEtImage.source, ['Image : RepDB']);
  assert.deepEqual([r.gif.img, r.gif.schema, r.wger.img, r.wger.schema], [null, true, null, true]);
  assert.match(r.vignette, /^<svg/);
  assert.doesNotMatch(r.agrandi, /video|smartworkout/i);
  assert.match(r.agrandi, /schema-repli/);
  assert.equal(r.lienSW, null);
  assert.deepEqual(r.autreVideo, { video: 'https://exemple.fr/demo.mp4', poster: null, page: 'https://exemple.fr/demo.mp4' });
  assert.equal(r.listeSW, false);
  assert.deepEqual(requetes.filter(u => /smartworkout|exercisedb|wger|miniatures/i.test(u)), []);
}));

test("site : comme l'app, ni vidéo SmartWorkout ni GIF ExerciseDB (schéma des muscles à la place) ; chaque image d'exercice cite sa source", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(() => {
    window.WebGL2RenderingContext = undefined;   // la fiche sans le mouvement en 3D : la photo, ou le corps dessiné
    const fiche = id => {
      afficherFicheExerciceBiblio(id);
      choisirOngletFiche('technique');
      const z = document.querySelector('.fiche-onglet[data-onglet="technique"]');
      const res = { video: !!z.querySelector('.fiche-exo-video'), source: [...z.querySelectorAll('.fiche-exo-note-source')].map(p => p.textContent.trim()) };
      fermerModal('fiche-exercice-modal');
      return res;
    };
    return { sw: fiche('sw-crunch-avec-ramene-de-genoux'), repdb: fiche('e1'), illustration: fiche('e336'), photo: fiche('e1001'), gif: fiche('e96'),
      vignette: medaillonExercice(trouverExercice('sw-crunch-avec-ramene-de-genoux'), true) };
  });
  assert.equal(r.sw.video, false); assert.match(r.sw.source.join(' '), /^En vif, le muscle/);
  assert.deepEqual(r.repdb, { video: false, source: ['Image : RepDB'] });
  assert.deepEqual(r.illustration, { video: false, source: ['Illustration : Everkinetic, adaptée par Bryl Lim (CC BY-SA 4.0)'] });
  assert.deepEqual(r.photo, { video: false, source: ['Image : RepDB'] });
  assert.equal(r.gif.video, false); assert.match(r.gif.source.join(' '), /^En vif, le muscle/);
  assert.match(r.vignette, /^<svg/);
  assert.doesNotMatch(r.vignette, /miniatures|smartworkout/);
}));

test("app iOS, Pro pas encore en vente : rien n'est verrouillé ni ne parle de Pro, seuls les essais d'IA restent comptés", () => avecAppli({ natif: true }, async ({ page }) => {
  await installerFauxPro(page, null);
  const lire = () => page.evaluate(async () => {
    await chargerAbonnementPro();
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    const res = { verrous: document.documentElement.classList.contains('verrous-pro'), acces: accesPro(), ajustement: ajustementActif(),
      ligne: !document.getElementById('ligne-pro').classList.contains('hidden') };
    ouvrirPhotosProgression();
    res.photos = document.getElementById('photos-modal').classList.contains('show');
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    return res;
  });
  assert.deepEqual(await lire(), { verrous: false, acces: true, ajustement: true, ligne: false, photos: true });
  // Essais d'IA du mois épuisés : un message, sans fenêtre Pro ni mention de Pro.
  const ia = await page.evaluate(async () => {
    iaServeur = { pret: true, pro: false, restant: 1 };
    window.__pro.ia.push(() => ({ data: null, error: { context: { status: 402, json: async () => ({ code: 'pro_requis', restant: 0, erreur: 'Tes 3 essais IA du mois sont utilisés. Passe à Pro pour continuer.' }) } } }));
    let message = '';
    try { await geminiParServeur([{ text: 'x' }], 'texte'); } catch (e) { message = e.message; }
    return { message, fenetrePro: document.getElementById('pro-modal').classList.contains('show'),
      puces: [...document.querySelectorAll('.puce-ia')].map(p => p.textContent).filter(Boolean) };
  });
  assert.equal(ia.message, 'Tes 3 essais IA du mois sont utilisés : ils reviennent le mois prochain.');
  assert.equal(ia.fenetrePro, false);
  assert.ok(ia.puces.length && ia.puces.every(t => t === 'Essais IA du mois utilisés'), ia.puces.join(' | '));
  // Le jour où Pro est mis en vente dans l'app : les verrous reviennent pour un compte gratuit.
  await page.evaluate(() => { PRO_EN_VENTE_APP = true; });
  const enVente = await lire();
  assert.deepEqual([enVente.verrous, enVente.acces, enVente.ligne], [true, false, true]);
}));

test("app iOS, Pro en vente : offres d'Apple introuvables (réseau, produits pas encore validés) : « Réessayer », jamais de paiement externe", () => avecAppli({ natif: true }, async ({ page }) => {
  const lire = () => page.evaluate(() => ({ bouton: document.getElementById('pro-essai').textContent, actif: !document.getElementById('pro-essai').disabled,
    pied: document.getElementById('pro-pied').textContent.trim(), externe: /stripe|carte bancaire|site web/i.test(document.getElementById('pro-contenu').textContent) }));
  await page.evaluate(() => {
    PRO_EN_VENTE_APP = true;
    sessionUtilisateur = { id: '6f1c2b8e-0000-4000-8000-000000000001', email: 'moi@test.fr' };
    delete window.__reponsesNatives['NativePurchases.getProducts'];
    ouvrirPro();
  });
  await page.waitForFunction(() => produitsAppleEtat === 'erreur');
  const avant = await lire();
  assert.deepEqual([avant.bouton, avant.actif, avant.externe], ['Réessayer', true, false]);
  assert.match(avant.pied, /^Les offres d'Apple ne se chargent pas\. Vérifie ta connexion, puis réessaie\./);
  assert.deepEqual(await page.evaluate(() => PRO_APPLE), { an: 'askesis.pro.an', mois: 'askesis.pro.mois' });
  await page.evaluate(() => {
    window.__reponsesNatives['NativePurchases.getProducts'] = { products: [
      { identifier: 'askesis.pro.an', priceString: '29,99 €' }, { identifier: 'askesis.pro.mois', priceString: '3,99 €' }] };
  });
  await page.click('#pro-essai');
  await page.waitForFunction(() => !!produitsApple);
  const apres = await lire();
  assert.deepEqual([apres.bouton, apres.actif, apres.externe], ['Essayer 14 jours gratuitement', true, false]);
  assert.equal((await appelsDe(page, 'NativePurchases', 'purchaseProduct')).length, 0, "réessayer ne lance pas d'achat");
}));

test("app iOS : les pages légales s'ouvrent dans leur version iPhone, les autres liens tels quels", () => avecAppli({ natif: true }, async ({ page }) => {
  const URL_SITE = await page.evaluate(() => URL_SITE_WEB);
  await page.evaluate(() => {
    ouvrirLienExterne('cgv.html');
    ouvrirLienExterne('confidentialite.html');
    ouvrirLienExterne('https://exemple.fr/cgv.html');
  });
  const urls = (await appelsDe(page, 'Browser', 'open')).map(a => a.o.url);
  assert.deepEqual(urls, [URL_SITE + 'cgv.html?app=ios', URL_SITE + 'confidentialite.html?app=ios', 'https://exemple.fr/cgv.html']);
}));

/* ---------------- Gymbro en direct et séance à deux ---------------- */
test('Gymbro en direct : anneau vert, « En ce moment » dans le fil, sa séance série par série, encouragement', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const tous = toutesLesExercices();
    const id = nom => tous.find(e => e.nom === nom).id;
    const appels = [];
    const reponse = data => ({ then: (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko) });
    let direct = [{ pseudo: 'karim', maj: new Date().toISOString(), donnees: { v: 1, nom: 'Push', debut: Date.now() - 26 * 60000, repos: Date.now() - 48000, rc: 120,
      ex: [{ id: id('Développé couché avec barre'), nom: 'Développé couché avec barre', n: 3, s: [[80, 8, 0], [80, 8, 0], [82.5, 6, 1]] },
        { id: id('Développé incliné avec haltères'), nom: 'Incliné', n: 3, s: [[28, 10, 0], null, null] },
        { id: 'inconnu', nom: '<img src=x onerror=alert(1)>', n: 2, s: [null, null] }] } }];
    supa = {
      rpc: (nom, args) => {
        appels.push([nom, args]);
        if (nom === 'gymbro_mes_liens') return reponse([{ pseudo: 'ines', sens: 'envoyee', statut: 'acceptee' }, { pseudo: 'karim', sens: 'recue', statut: 'acceptee' }]);
        if (nom === 'gymbro_direct') return reponse({ direct, duos: [] });
        if (nom === 'gymbro_encourager') return reponse(true);
        return reponse([]);
      },
      from: () => ({ select: () => reponse(null) })
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    monPseudo = { pseudo: 'jamal', partage_seances: true };
    await chargerLiensGymbro();
    await chargerDirect(true);
    allerA('seance');
    const res = {};
    const textes = sel => [...document.querySelectorAll(sel)].map(x => x.textContent.replace(/\s+/g, ' ').trim());
    res.rangee = textes('#gymbros-rangee .gst small');
    res.sous = textes('#gymbros-rangee .gst em');
    res.anneau = document.querySelectorAll('#gymbros-rangee .gav--direct').length;
    ouvrirGymbro('fil');
    await new Promise(ok => setTimeout(ok, 80));
    res.sections = textes('#fil-gymbros .gb-sec');
    res.maintenant = textes('#fil-gymbros .direct-maintenant > *');
    res.stats = textes('#fil-gymbros .direct-carte .fil-stats > div');
    document.querySelector('#fil-gymbros .direct-carte .gcomp').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.etats = [...document.querySelectorAll('#gymbro-comparaison .direct-ex')].map(x => x.className.replace('direct-ex direct-ex--', ''));
    res.chips = textes('#gymbro-comparaison .direct-ex--fait .direct-chip');
    res.repos = textes('#gymbro-comparaison .direct-repos');
    res.injection = !!document.querySelector('#gymbro-comparaison img[src="x"]');
    res.inconnu = textes('#gymbro-comparaison .direct-ex--avenir b');
    document.querySelector('#gymbro-comparaison .direct-encourager').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.encourage = appels.find(a => a[0] === 'gymbro_encourager');
    res.bouton = document.querySelector('#gymbro-comparaison .direct-encourager').textContent.trim();
    res.grise = document.querySelector('#gymbro-comparaison .direct-encourager').disabled;
    // Karim a fini (ou coupé le partage) : plus rien en direct.
    direct = [];
    await chargerDirect(true);
    res.apres = document.querySelector('#gymbro-comparaison .gvide b').textContent;
    retourRechercheGymbro();
    res.sectionsApres = textes('#fil-gymbros .gb-sec');
    res.anneauApres = document.querySelectorAll('#gymbros-rangee .gav--direct').length;
    return res;
  });
  assert.deepEqual(r.rangee, ['Ajouter', '@karim', '@ines'], "en séance : en tête de la rangée");
  assert.equal(r.sous[0], 'En séance');
  assert.equal(r.anneau, 1);
  assert.deepEqual(r.sections, ['En ce moment']);
  assert.equal(r.maintenant[1], 'Exercice 2 sur 3');
  assert.equal(r.maintenant[2], 'Développé incliné avec haltères');
  assert.match(r.maintenant[3], /^Série 2 sur 3 · au repos depuis 0:4\d$/);
  assert.deepEqual(r.stats, ['4 séries', '2 055 kg', '🏆 1 record']);
  assert.deepEqual(r.etats, ['fait', 'encours', 'avenir']);
  assert.deepEqual(r.chips, ['80kg×8', '80kg×8', '82,5kg×6 🏆']);
  assert.match(r.repos[0], /^Au repos depuis 0:4\d$/);
  assert.ok(!r.injection, "le nom d'exercice venu d'un autre compte est échappé");
  assert.deepEqual(r.inconnu, ['<img src=x onerror=alert(1)>']);
  assert.deepEqual(r.encourage, ['gymbro_encourager', { p_pseudo: 'karim' }]);
  assert.equal(r.bouton, '💪 Envoyé');
  assert.ok(r.grise, 'un 💪 par minute');
  assert.equal(r.apres, 'Plus en séance');
  assert.deepEqual(r.sectionsApres, []);
  assert.equal(r.anneauApres, 0);
}));

test('Ma séance en direct : envoyée à chaque série (jamais les notes), 💪 reçus, effacée si on coupe le partage ou si on abandonne', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    let recus = [];
    const reponse = data => ({ then: (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko) });
    supa = {
      rpc: (nom, args) => {
        appels.push([nom, JSON.parse(JSON.stringify(args || null))]);
        if (nom === 'gymbro_mes_liens') return reponse([{ pseudo: 'karim', sens: 'envoyee', statut: 'acceptee' }]);
        if (nom === 'gymbro_direct') return reponse({ direct: [], duos: [] });
        if (nom === 'direct_publier') return reponse(recus);
        return reponse(null);
      },
      from: () => ({ select: () => reponse(null) })
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    monPseudo = { pseudo: 'jamal', partage_seances: true };
    await chargerLiensGymbro();
    await chargerDirect(true);
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    musculationProgrammes = [{ id: 'p1', nom: 'Push', exercices: [{ exerciceId: exo.id, series: [{ poids: 60, reps: 8 }, { poids: 60, reps: 8 }] }] }];
    await demarrerSeance('p1');
    musculationSessionActive.notes = 'note secrète';
    basculerSerieSession(0, 0);
    await new Promise(ok => setTimeout(ok, 1500));
    const pub = appels.filter(a => a[0] === 'direct_publier');
    const res = { envoi: pub[pub.length - 1] && pub[pub.length - 1][1] };
    // Un 💪 de Karim revient avec l'envoi suivant.
    recus = [{ pseudo: 'karim', cree_le: new Date().toISOString() }];
    basculerSerieSession(0, 1);
    await new Promise(ok => setTimeout(ok, 1500));
    res.fete = document.getElementById('celebration').textContent;
    // Partage coupé en pleine séance : ce qui était visible disparaît.
    basculerPartageDirect(false);
    await new Promise(ok => setTimeout(ok, 80));
    res.efface = appels.filter(a => a[0] === 'direct_terminer').length;
    res.envoisCoupe = appels.filter(a => a[0] === 'direct_publier').length;
    basculerSerieSession(0, 1);
    await new Promise(ok => setTimeout(ok, 1500));
    res.envoisApres = appels.filter(a => a[0] === 'direct_publier').length;
    basculerPartageDirect(true);
    await new Promise(ok => setTimeout(ok, 80));
    await abandonnerSeance();
    await new Promise(ok => setTimeout(ok, 80));
    res.effaceAbandon = appels.filter(a => a[0] === 'direct_terminer').length;
    return res;
  });
  assert.deepEqual(r.envoi.p_donnees.ex[0].s, [[60, 8, 0], null]);
  assert.equal(r.envoi.p_donnees.nom, 'Push');
  assert.equal(r.envoi.p_duo, null);
  assert.ok(!JSON.stringify(r.envoi).includes('secrète'), 'les notes ne partent jamais');
  assert.match(r.fete, /@karim t’encourage 💪/);
  assert.equal(r.efface, 1);
  assert.equal(r.envoisApres, r.envoisCoupe, 'plus rien ne part une fois le partage coupé');
  assert.equal(r.effaceAbandon, 2);
}));

test("Séance à deux, côté hôte : invitation sans mes charges, il rejoint, sa ligne sous l'exercice, son record annoncé, on se quitte", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    const reponse = data => ({ then: (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko) });
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    let etat = { direct: [], duos: [] };
    supa = {
      rpc: (nom, args) => {
        appels.push([nom, JSON.parse(JSON.stringify(args || null))]);
        if (nom === 'gymbro_mes_liens') return reponse([{ pseudo: 'karim', sens: 'envoyee', statut: 'acceptee' }]);
        if (nom === 'gymbro_direct') return reponse(etat);
        if (nom === 'duo_inviter') return reponse('d-1');
        if (nom === 'direct_publier') return reponse([]);
        return reponse(null);
      },
      from: () => ({ select: () => reponse(null) })
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    monPseudo = { pseudo: 'jamal', partage_seances: true };
    await chargerLiensGymbro();
    await chargerDirect(true);
    musculationProgrammes = [{ id: 'p1', nom: 'Push', exercices: [{ exerciceId: exo.id, series: [{ poids: 60, reps: 8 }, { poids: 60, reps: 8 }, { poids: 60, reps: 8 }] }] }];
    await demarrerSeance('p1');
    const res = {};
    res.bouton = document.querySelector('#session-duo .duo-bouton b').textContent;
    document.querySelector('#session-duo .duo-bouton').click();
    res.liste = [...document.querySelectorAll('#duo-inviter-liste .duo-ami b')].map(b => b.textContent);
    document.querySelector('#duo-inviter-liste .gbtn').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.invitation = appels.find(a => a[0] === 'duo_inviter');
    res.attente = document.querySelector('#session-duo .duo-t b').textContent;
    // Karim accepte et commence : une série faite au développé couché.
    etat = { duos: [{ id: 'd-1', pseudo: 'karim', statut: 'acceptee', hote: true, cree_le: new Date().toISOString() }],
      direct: [{ pseudo: 'karim', maj: new Date().toISOString(), donnees: { v: 1, nom: 'Push', debut: Date.now(), ex: [{ id: exo.id, nom: 'x', n: 3, s: [[80, 8, 0], null, null] }] } }] };
    await chargerDirect(true);
    res.rejoint = document.getElementById('celebration').textContent;
    res.avec = document.querySelector('#session-duo .duo-t b').textContent;
    const ligne = () => [...document.querySelectorAll('#session-exercices-container .duo-ligne .direct-chip, #session-exercices-container .duo-ligne .duo-etat')].map(x => x.textContent.trim());
    res.ligne = ligne();
    // Il bat son record.
    etat.direct[0].donnees.ex[0].s = [[80, 8, 0], [85, 6, 1], null];
    await chargerDirect(true);
    res.record = document.getElementById('celebration').textContent;
    res.ligne2 = ligne();
    // Mes séries partent avec le duo.
    basculerSerieSession(0, 0);
    await new Promise(ok => setTimeout(ok, 1500));
    const pub = appels.filter(a => a[0] === 'direct_publier');
    res.duoPublie = pub.length ? pub[pub.length - 1][1].p_duo : null;
    await menuDuo();
    await new Promise(ok => setTimeout(ok, 50));
    res.quitte = appels.find(a => a[0] === 'duo_quitter');
    res.apres = document.querySelector('#session-duo .duo-bouton b').textContent;
    res.lignes = document.querySelectorAll('#session-exercices-container .duo-ligne').length;
    return res;
  });
  assert.equal(r.bouton, "S'entraîner avec un gymbro");
  assert.deepEqual(r.liste, ['@karim']);
  assert.equal(r.invitation[1].p_pseudo, 'karim');
  assert.deepEqual(r.invitation[1].p_programme.ex.map(e => e.n), [3]);
  assert.ok(!JSON.stringify(r.invitation[1]).includes('poids'), 'mes charges ne partent pas');
  assert.equal(r.attente, 'Invitation envoyée à @karim');
  assert.match(r.rejoint, /@karim te rejoint/);
  assert.equal(r.avec, 'Avec @karim');
  assert.deepEqual(r.ligne, ['80kg×8', 'En cours']);
  assert.match(r.record, /@karim : record battu 🏆.*85 kg × 6/);
  assert.deepEqual(r.ligne2, ['80kg×8', '85kg×6 🏆', 'En cours']);
  assert.equal(r.duoPublie, 'd-1');
  assert.deepEqual(r.quitte, ['duo_quitter', { p_id: 'd-1' }]);
  assert.equal(r.apres, "S'entraîner avec un gymbro");
  assert.equal(r.lignes, 0);
}));

test("Séance à deux, côté invité : l'invitation sur n'importe quel écran, il rejoint avec ses propres charges", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    const reponse = data => ({ then: (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko) });
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    const programme = { nom: 'Push', debut: Date.now() - 3 * 60000, ex: [{ id: exo.id, nom: 'Développé couché avec barre', n: 3 }, { id: 'perso-x', nom: 'Mon exo maison', n: 2 }] };
    supa = {
      rpc: (nom, args) => {
        appels.push([nom, JSON.parse(JSON.stringify(args || null))]);
        if (nom === 'gymbro_mes_liens') return reponse([{ pseudo: 'jamal', sens: 'recue', statut: 'acceptee' }]);
        if (nom === 'gymbro_direct') return reponse({ direct: [], duos: [{ id: 'd-9', pseudo: 'jamal', statut: 'attente', hote: false, programme, cree_le: new Date().toISOString() }] });
        if (nom === 'duo_repondre') return reponse(args.p_accepter ? programme : null);
        return reponse([]);
      },
      from: () => ({ select: () => reponse(null) })
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    monPseudo = { pseudo: 'karim', partage_seances: true };
    // Ma dernière fois au développé couché : 70 kg.
    musculationHistorique.unshift({ id: 'h1', date: decalerJours(todayStr(), -3), programmeNom: 'Haut', exercices: [{ exerciceId: exo.id,
      series: [{ poids: 70, reps: 8, fait: true }, { poids: 70, reps: 7, fait: true }, { poids: 70, reps: 6, fait: true }, { poids: 65, reps: 8, fait: true }] }] });
    allerA('repas');
    await chargerLiensGymbro();
    await chargerDirect(true);
    const res = {};
    const b = document.getElementById('duo-invitation');
    res.visible = !b.classList.contains('hidden');
    res.texte = [...b.querySelectorAll('b, small, .duo-invit-ok')].map(x => x.textContent.trim());
    b.click();
    res.titre = document.getElementById('duo-rejoindre-titre').textContent;
    res.lignes = [...document.querySelectorAll('#duo-rejoindre-corps .duo-rj small')].map(x => x.textContent);
    document.querySelector('#duo-rejoindre-modal .btn-primary').click();
    await new Promise(ok => setTimeout(ok, 80));
    res.reponse = appels.find(a => a[0] === 'duo_repondre');
    const s = musculationSessionActive;
    res.seance = s && { nom: s.programmeNom, duo: s.duo, ex: s.exercices.map(e => ({ nom: e.nom, n: e.series.length, poids: e.series[0].poids })) };
    res.ecran = ecranActif;
    res.bandeau = document.getElementById('duo-invitation').classList.contains('hidden');
    return res;
  });
  assert.ok(r.visible, "l'invitation apparaît sur l'écran Repas");
  assert.deepEqual(r.texte, ["@jamal t'invite à sa séance", "Push · 2 exercices · à l'instant", 'Rejoindre']);
  assert.equal(r.titre, 'Séance de @jamal');
  assert.match(r.lignes[0], /^3 séries · toi la dernière fois : 70 kg × 8$/);
  assert.match(r.lignes[1], /pas dans ta bibliothèque/);
  assert.deepEqual(r.reponse, ['duo_repondre', { p_id: 'd-9', p_accepter: true }]);
  assert.equal(r.seance.nom, 'Push');
  assert.deepEqual(r.seance.duo, { id: 'd-9', pseudo: 'jamal', hote: false, statut: 'acceptee' });
  assert.equal(r.seance.ex.length, 2);
  assert.equal(r.seance.ex[0].n, 3, 'même nombre de séries que lui');
  assert.equal(r.seance.ex[0].poids, 70, 'mes propres charges');
  assert.deepEqual(r.seance.ex[1], { nom: 'Mon exo maison', n: 2, poids: null });
  assert.equal(r.ecran, 'seance');
  assert.ok(r.bandeau, "l'invitation disparaît une fois acceptée");
}));

test("Séance à deux depuis une séance libre : l'invitation arrive même sans exercice, ses exercices s'ajoutent d'un geste", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    const reponse = data => ({ then: (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko) });
    const exo = toutesLesExercices().find(e => e.nom === 'Développé couché avec barre');
    const debut = Date.now() - 2 * 60000;
    const programme = { nom: 'Séance libre', debut, ex: [] };
    const etat = { duos: [{ id: 'd-7', pseudo: 'jamal', statut: 'attente', hote: false, programme, cree_le: new Date().toISOString() }],
      direct: [{ pseudo: 'jamal', maj: new Date().toISOString(), donnees: { v: 1, nom: 'Séance libre', debut, ex: [] } }] };
    supa = {
      rpc: (nom, args) => {
        appels.push([nom, JSON.parse(JSON.stringify(args || null))]);
        if (nom === 'gymbro_mes_liens') return reponse([{ pseudo: 'jamal', sens: 'recue', statut: 'acceptee' }]);
        if (nom === 'gymbro_direct') return reponse(etat);
        if (nom === 'duo_repondre') return reponse(programme);
        if (nom === 'direct_publier') return reponse([]);
        return reponse([]);
      },
      from: () => ({ select: () => reponse(null) })
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    monPseudo = { pseudo: 'karim', partage_seances: true };
    allerA('repas');
    await chargerLiensGymbro();
    await chargerDirect(true);
    const res = {};
    const b = document.getElementById('duo-invitation');
    res.visible = !b.classList.contains('hidden');
    res.texte = [...b.querySelectorAll('b, small')].map(x => x.textContent.trim());
    b.click();
    res.tete = document.querySelector('#duo-rejoindre-corps .duo-rj-tete b').textContent;
    res.note = document.querySelector('#duo-rejoindre-corps .duo-note').textContent;
    document.querySelector('#duo-rejoindre-modal .btn-primary').click();
    await new Promise(ok => setTimeout(ok, 80));
    const s = musculationSessionActive;
    res.seance = s && { nom: s.programmeNom, exercices: s.exercices.length, duo: s.duo && s.duo.statut };
    // Jamal ajoute un exercice : je peux l'ajouter d'un geste, et sa ligne apparaît dessous.
    etat.duos[0].statut = 'acceptee';
    etat.direct[0].donnees.ex = [{ id: exo.id, nom: exo.nom, n: 3, s: [[60, 10, 0], null, null] }];
    await chargerDirect(true);
    const ajouter = document.querySelector('#session-duo .duo-ajouter');
    res.ajouter = ajouter && ajouter.textContent.replace(/\s+/g, ' ').trim();
    ajouter.click();
    await new Promise(ok => setTimeout(ok, 50));
    res.apres = musculationSessionActive.exercices.map(e => e.exerciceId === exo.id);
    res.ligne = [...document.querySelectorAll('#session-exercices-container .duo-ligne .direct-chip')].map(x => x.textContent.trim());
    res.ajouterApres = !!document.querySelector('#session-duo .duo-ajouter');
    return res;
  });
  assert.ok(r.visible, "l'invitation d'une séance libre vide s'affiche");
  assert.deepEqual(r.texte, ["@jamal t'invite à sa séance", "Séance libre · à l'instant"]);
  assert.equal(r.tete, 'Séance libre');
  assert.match(r.note, /Pas encore d'exercice/);
  assert.deepEqual(r.seance, { nom: 'Séance libre', exercices: 0, duo: 'acceptee' });
  assert.equal(r.ajouter, '+ Ajouter son exercice : Développé couché avec barre');
  assert.deepEqual(r.apres, [true]);
  assert.deepEqual(r.ligne, ['60kg×10']);
  assert.ok(!r.ajouterApres, 'plus rien à ajouter');
}));

test("Ajouter un gymbro par son nom d'utilisateur : le + de la rangée ouvre la recherche, Ajouter et Accepter en un geste", () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    const appels = [];
    let liens = [{ pseudo: 'lea', sens: 'recue', statut: 'attente' }, { pseudo: 'karim', sens: 'envoyee', statut: 'acceptee' }];
    const tous = [{ pseudo: 'sofiane.fit', partage_seances: true }, { pseudo: 'sophie', partage_seances: false }, { pseudo: 'lea', partage_seances: true }, { pseudo: 'karim', partage_seances: true }];
    const reponse = data => ({ then: (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko) });
    let motif = '';
    const chaine = { select: () => chaine, ilike: (c, m) => { motif = m; return chaine; }, neq: () => chaine, order: () => chaine,
      limit: () => reponse(tous.filter(x => x.pseudo.startsWith(motif.replace('%', '')))) };
    supa = {
      rpc: (nom, args) => {
        appels.push([nom, args]);
        if (nom === 'gymbro_mes_liens') return reponse(liens);
        if (nom === 'gymbro_demander') { liens.push({ pseudo: args.p_pseudo, sens: 'envoyee', statut: 'attente' }); return reponse('attente'); }
        if (nom === 'gymbro_repondre') { liens = liens.map(l => l.pseudo === args.p_pseudo ? { ...l, statut: 'acceptee' } : l); return reponse('acceptee'); }
        return reponse([]);
      },
      from: () => chaine
    };
    sessionUtilisateur = { id: 'moi', email: 'moi@x.fr' };
    monPseudo = { pseudo: 'jamal', partage_seances: true };
    await chargerLiensGymbro();
    allerA('seance');
    const res = {};
    const plus = document.querySelector('#gymbros-rangee .gst');
    res.plus = plus.querySelector('small').textContent;
    plus.click();
    await new Promise(ok => setTimeout(ok, 50));
    res.onglet = gymbroOnglet;
    res.focus = document.activeElement && document.activeElement.id;
    res.monNom = document.getElementById('gymbro-mon-nom').textContent;
    const lignes = () => [...document.querySelectorAll('#gymbro-resultats .grech-res')].map(x => [x.querySelector('b').textContent, x.querySelector('.gbtn').textContent.trim()]);
    await lancerRechercheGymbro('@So');
    res.avant = lignes();
    document.querySelector('#gymbro-resultats .grech-res .gbtn').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.demande = appels.find(a => a[0] === 'gymbro_demander');
    res.apres = lignes();
    await lancerRechercheGymbro('le');
    document.querySelector('#gymbro-resultats .grech-res .gbtn').click();
    await new Promise(ok => setTimeout(ok, 50));
    res.accepte = appels.find(a => a[0] === 'gymbro_repondre');
    res.lea = lignes();
    await lancerRechercheGymbro('ka');
    res.karim = lignes();
    res.sections = [...document.querySelectorAll('#gymbro-favoris > p')].map(p => p.textContent);
    // Depuis « S'entraîner ensemble » aussi.
    fermerModal('gymbro-modal');
    res.lienDuo = document.querySelector('#duo-inviter-modal .duo-ajout-lien').textContent;
    return res;
  });
  assert.equal(r.plus, 'Ajouter');
  assert.equal(r.onglet, 'mes');
  assert.equal(r.focus, 'gymbro-recherche', 'le clavier s\'ouvre sur la recherche');
  assert.equal(r.monNom, 'Ou dis-lui de te chercher : @jamal');
  assert.deepEqual(r.avant, [['@sofiane.fit', 'Ajouter'], ['@sophie', 'Ajouter']]);
  assert.deepEqual(r.demande, ['gymbro_demander', { p_pseudo: 'sofiane.fit' }]);
  assert.deepEqual(r.apres, [['@sofiane.fit', 'Envoyée ✓'], ['@sophie', 'Ajouter']]);
  assert.deepEqual(r.accepte, ['gymbro_repondre', { p_pseudo: 'lea', p_accepter: true }]);
  assert.deepEqual(r.lea, [['@lea', 'Gymbro ✓']]);
  assert.deepEqual(r.karim, [['@karim', 'Gymbro ✓']]);
  assert.deepEqual(r.sections, ['Tes gymbros · 2', 'Demande envoyée']);
  assert.match(r.lienDuo, /Ajouter un gymbro par son nom d'utilisateur/);
}));

test('objectif adapté à la balance : chaque lundi, les repas notés et les pesées corrigent la formule, avec ses garde-fous', () => avecAppli({}, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
  const r = await page.evaluate(() => {
    userProfile.height = 180; userProfile.age = 30; userProfile.gender = 'm';
    const auj = todayStr();
    // 8 semaines de repas notés (kcal par jour) et une pesée tous les deux jours (pente en kg par semaine).
    const remplir = (kcal, pente) => {
      for (let k = 56; k >= 1; k--) {
        const d = shiftDate(auj, -k), j = getDay(d);
        j.meals = { breakfast: [], lunch: [{ name: 'Repas', grams: 500, kcal, p: 150, c: 200, f: 60 }], snack: [], dinner: [] };
        j.weight = k % 2 === 0 ? Math.round((85 - (56 - k) * pente / 7) * 10) / 10 : null;
        if (k === 56) j.goal = 'seche';
      }
      saveData();
      return computeTargets(getDay(auj), auj);
    };
    const res = {};
    res.vide = computeTargets(getDay(auj), auj).correction;
    res.rappelsWeb = getComputedStyle(document.getElementById('carte-rappels')).display;
    // 2 000 kcal par jour et 0,5 kg perdu par semaine : la vraie dépense est d'environ 2 550 kcal.
    const t = remplir(2000, 0.5);
    res.perte = { correction: t.correction, formule: t.tdeeFormule, tdee: t.tdee, bmr: t.bmr, plancher: t.plancher, reelle: t.ajustement.reelle, target: t.target, cibleBase: t.cibleBase, goal: t.goal };
    res.semaines = [];
    for (let k = 6; k >= 0; k--) { const c = correctionMaintenance(shiftDate(lundiDe(auj), -7 * k)); res.semaines.push(c ? c.kcal : 0); }
    res.memeSemaine = computeTargets(getDay(shiftDate(auj, -1)), shiftDate(auj, -1)).correction;
    // Ta journée : la ligne et d'où elle vient.
    currentDate = auj; renderApp(); ouvrirDepense();
    res.detail = document.getElementById('detail-depense').textContent;
    fermerModal('depense-modal');
    // Ce qu'on note cette semaine ne compte qu'à partir de lundi prochain.
    const v = versionDonnees;
    saveData(auj); res.cetteSemaine = versionDonnees === v;
    saveData(shiftDate(lundiDe(auj), -1)); res.avantLundi = versionDonnees !== v;
    // Désactivé dans le Profil : la formule seule.
    allerA('reglages'); renderApp();
    const caseVitrine = () => document.getElementById('vitrine-ajustement');
    res.caseAvant = caseVitrine().checked;
    caseVitrine().click();
    res.coupe = { correction: computeTargets(getDay(auj), auj).correction, profil: userProfile.ajustementBalance, case: caseVitrine().checked, texte: caseVitrine().closest('label').textContent };
    caseVitrine().click();
    res.remis = { correction: computeTargets(getDay(auj), auj).correction, profil: 'ajustementBalance' in userProfile };
    // Stable mais seulement 1 600 kcal notées : −15 % au plus, et le plancher baisse avec.
    const bas = remplir(1600, 0);
    res.stable = { correction: bas.correction, formule: bas.tdeeFormule, bmr: bas.bmr, plancher: bas.plancher };
    // Des jours à moitié notés (700 kcal) ne comptent pas : rien à corriger.
    res.moitie = remplir(700, 0).correction;
    return res;
  });
  assert.equal(r.vide, 0, 'rien de noté : la formule seule');
  assert.equal(r.rappelsWeb, 'none', 'les rappels n\'existent que dans l\'app iPhone');
  assert.ok(r.perte.correction > 0, JSON.stringify(r.perte));
  assert.ok(Math.abs(r.perte.reelle - 2550) < 80, `dépense réelle ${r.perte.reelle}`);
  assert.equal(r.perte.tdee, r.perte.formule + r.perte.correction);
  assert.ok(r.perte.correction <= Math.round(r.perte.formule * 0.15) + 10, 'pas plus de 15 % de la formule');
  assert.equal(r.perte.plancher, r.perte.bmr, 'un ajustement en hausse ne relève pas le plancher');
  assert.equal(r.perte.cibleBase, Math.max(r.perte.plancher, Math.round(r.perte.tdee * 0.8)), 'sèche : −20 % de la dépense ajustée (avant la reprise de la semaine)');
  r.semaines.forEach((c, i) => { if (i) assert.ok(Math.abs(c - r.semaines[i - 1]) <= 100, `100 kcal au plus d'une semaine à l'autre : ${r.semaines}`); });
  assert.equal(r.memeSemaine, r.perte.correction, 'le même ajustement toute la semaine');
  assert.ok(r.detail.includes(`Ajustement d'après ta balance+ ${r.perte.correction} kcal`), r.detail);
  assert.match(r.detail, /tu dépenses environ 2\s5\d\d\skcal par jour ; la formule en prévoyait/);
  assert.deepEqual([r.cetteSemaine, r.avantLundi], [true, true]);
  assert.equal(r.caseAvant, true);
  assert.equal(r.coupe.correction, 0);
  assert.equal(r.coupe.profil, false);
  assert.equal(r.coupe.case, false);
  assert.match(r.coupe.texte, /Désactivé : ton objectif suit la formule seule/);
  assert.deepEqual(r.remis, { correction: r.perte.correction, profil: false });
  assert.ok(r.stable.correction < 0 && Math.abs(r.stable.correction + r.stable.formule * 0.15) <= 20, JSON.stringify(r.stable));
  assert.ok(r.stable.plancher < r.stable.bmr, 'un ajustement en baisse baisse aussi le plancher');
  assert.equal(r.moitie, 0, 'les jours à moitié notés ne comptent pas');
}));

test('rappels sur l\'iPhone : activés avec l\'autorisation, recalculés à chaque saisie, et ils ouvrent le bon écran', () => avecAppli({ natif: true }, async ({ page, dialogues }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
  const r = await page.evaluate(async () => {
    let accord = 'prompt';
    window.__reponsesNatives['LocalNotifications.checkPermissions'] = () => ({ display: accord });
    window.__reponsesNatives['LocalNotifications.requestPermissions'] = () => { accord = window.__refus ? 'denied' : 'granted'; return { display: accord }; };
    const notifs = () => window.__appelsNatifs.filter(a => a[0] === 'LocalNotifications');
    const attendre = async () => { await new Promise(ok => setTimeout(ok, 900)); await fileRappels; };
    const programmes = () => { const s = notifs().filter(a => a[1] === 'schedule').pop(); return s ? s[2].notifications : []; };
    const res = {};
    // Sans rappel activé : aucun appel aux notifications.
    renderApp(); await attendre();
    res.ecoute = notifs().filter(a => a[1] === 'addListener').map(a => a[2]);
    res.auDepart = notifs().filter(a => a[1] !== 'addListener').length;
    ouvrirModal('reglages-modal'); await new Promise(ok => setTimeout(ok, 150));
    res.visible = getComputedStyle(document.getElementById('carte-rappels')).display !== 'none';
    res.focus = document.activeElement && document.activeElement.id;
    // Refusée : la case se décoche, avec l'explication.
    window.__refus = true;
    const c = document.getElementById('rappel-proteines');
    c.checked = true; await changerRappel('proteines');
    res.refus = { case: c.checked, reglage: reglagesRappels().proteines.on };
    // Accordée : 7 jours de rappels de protéines à 18 h.
    window.__refus = false; accord = 'prompt';
    c.checked = true; await changerRappel('proteines'); await attendre();
    res.permission = notifs().map(a => a[1]).filter(f => /Permissions/.test(f));
    res.proteines = programmes().map(n => [n.id, new Date(n.schedule.at).toISOString().slice(0, 16), n.title, n.body, n.extra.rappel]);
    // Un repas protéiné : le rappel du jour disparaît, les autres restent.
    getDay(todayStr()).meals.lunch.push({ name: 'Poulet', grams: 600, kcal: 900, p: 190, c: 0, f: 20 });
    saveData(todayStr()); renderApp(); await attendre();
    res.apresRepas = programmes().map(n => n.id);
    res.annules = (notifs().filter(a => a[1] === 'cancel').pop() || [, , { notifications: [] }])[2].notifications.length;
    // Toucher un rappel : la séance ouvre Ta journée, la pesée sa saisie.
    ouvrirDepuisRappel({ rappel: 'seance', date: todayStr() }); await new Promise(ok => setTimeout(ok, 200));
    res.toucheSeance = document.getElementById('depense-modal').classList.contains('show');
    fermerModal('depense-modal');
    ouvrirDepuisRappel({ rappel: 'pesee' }); await new Promise(ok => setTimeout(ok, 200));
    res.touchePesee = document.getElementById('feuille-saisie-rapide').classList.contains('show');
    fermerFeuilles();
    // Tout coupé : les rappels programmés sont annulés.
    c.checked = false; await changerRappel('proteines'); await attendre();
    res.coupe = { dernier: notifs().pop()[1], programmes: localStorage.getItem('mc_rappels_programmes') };
    return res;
  });
  assert.equal(r.auDepart, 0, 'sans rappel activé, l\'appli ne touche pas aux notifications');
  assert.deepEqual(r.ecoute, ['localNotificationActionPerformed'], 'toucher un rappel est écouté dès le démarrage');
  assert.equal(r.visible, true);
  assert.notEqual(r.focus, 'rappel-heure-proteines', 'le sélecteur d\'heure ne s\'ouvre pas tout seul');
  assert.deepEqual(r.refus, { case: false, reglage: false });
  // Refusée puis accordée : demandée seulement en activant, puis juste vérifiée.
  assert.deepEqual(r.permission, ['checkPermissions', 'requestPermissions', 'checkPermissions', 'requestPermissions', 'checkPermissions']);
  assert.ok(dialogues.some(d => /Les notifications sont coupées pour Askēsis/.test(d)), dialogues.join(' | '));
  assert.equal(r.proteines.length, 7, JSON.stringify(r.proteines));
  assert.deepEqual(r.proteines[0].slice(0, 3), [42000, '2026-11-04T18:00', 'Protéines']);
  assert.match(r.proteines[0][3], /^Rien de noté aujourd'hui : ton objectif est de \d+ g de protéines\.$/);
  assert.equal(r.proteines[0][4], 'proteines');
  assert.deepEqual(r.proteines.map(x => x[0]), [42000, 42001, 42002, 42003, 42004, 42005, 42006]);
  assert.deepEqual(r.apresRepas, [42001, 42002, 42003, 42004, 42005, 42006], 'protéines atteintes : plus de rappel aujourd\'hui');
  assert.equal(r.annules, 28, 'tous les rappels sont annulés avant d\'être reprogrammés');
  assert.equal(r.toucheSeance, true);
  assert.equal(r.touchePesee, true);
  assert.deepEqual(r.coupe, { dernier: 'cancel', programmes: null });
}));

test('objectif adapté : réservé à Pro (cadenas et fenêtre Pro pour un compte gratuit, actif pour un fondateur)', () => avecAppli({}, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
  await installerFauxPro(page, null);
  const r = await page.evaluate(async () => {
    userProfile.height = 180; userProfile.age = 30; userProfile.gender = 'm';
    const auj = todayStr();
    for (let k = 56; k >= 1; k--) {
      const j = getDay(shiftDate(auj, -k));
      j.meals.lunch.push({ name: 'Repas', grams: 500, kcal: 2000, p: 150, c: 200, f: 60 });
      if (k % 2 === 0) j.weight = Math.round((85 - (56 - k) * 0.5 / 7) * 10) / 10;
    }
    saveData();
    await chargerAbonnementPro();
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    allerA('reglages'); renderApp();
    const res = { acces: accesPro(), correction: computeTargets(getDay(auj), auj).correction,
      verrou: document.getElementById('vitrine-ajustement-pro') && document.getElementById('vitrine-ajustement-pro').textContent, caseLibre: !!document.getElementById('vitrine-ajustement') };
    document.getElementById('vitrine-ajustement-pro').click();
    res.fenetre = document.getElementById('pro-modal').classList.contains('show') ? document.querySelector('#pro-contenu .pro-raison').textContent : null;
    res.avantage = document.getElementById('pro-contenu').textContent.includes("Objectif adapté à ta balanceCorrigé chaque lundi d'après tes repas notés et tes pesées");
    fermerModal('pro-modal');
    window.__pro.etat = { formule: 'fondateur', statut: 'actif', fin: null };
    await chargerAbonnementPro();
    res.fondateur = { acces: accesPro(), correction: computeTargets(getDay(auj), auj).correction, case: !!document.getElementById('vitrine-ajustement'), cadenas: !!document.getElementById('vitrine-ajustement-pro') };
    return res;
  });
  assert.equal(r.acces, false);
  assert.equal(r.correction, 0, 'compte gratuit : la formule seule');
  assert.match(r.verrou, /^Ajuster d'après ma balanceProAvec Pro, ton objectif est corrigé chaque lundi/);
  assert.equal(r.caseLibre, false);
  assert.equal(r.fenetre, "L'objectif adapté à ta balance fait partie de Pro.");
  assert.equal(r.avantage, true, 'listé dans les avantages de Pro');
  assert.equal(r.fondateur.acces, true);
  assert.ok(r.fondateur.correction > 0, 'Pro : l\'ajustement s\'applique');
  assert.deepEqual([r.fondateur.case, r.fondateur.cadenas], [true, false]);
}));

test('objectif adapté : un historique par semaine, gardé dans le profil, figé une fois la semaine passée, visible dans Ta journée', () => avecAppli({}, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
  const r = await page.evaluate(() => {
    userProfile.height = 180; userProfile.age = 30; userProfile.gender = 'm';
    const auj = todayStr();
    for (let k = 56; k >= 1; k--) {
      const j = getDay(shiftDate(auj, -k));
      j.meals.lunch.push({ name: 'Repas', grams: 500, kcal: 2000, p: 150, c: 200, f: 60 });
      if (k % 2 === 0) j.weight = Math.round((85 - (56 - k) * 0.5 / 7) * 10) / 10;
    }
    saveData();
    currentDate = auj; renderApp();
    const h = userProfile.ajustements;
    const res = { semaines: h.map(x => x.l), rec: h.map(x => !!x.rec), fidele: h.every(x => { const a = correctionMaintenance(x.l); return a.kcal === x.k && a.reelle === x.r && a.jours === x.j && a.pesees === x.p; }) };
    ouvrirDepense();
    const d = document.getElementById('hist-ajust');
    res.liste = d ? [...d.querySelectorAll('li')].map(li => li.textContent) : null;
    fermerModal('depense-modal');
    return res;
  });
  // Les semaines déjà notées sont reconstituées (marquées), la semaine en cours est la vraie.
  assert.deepEqual(r.semaines, ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(r.rec, [true, true, true, true, true, false]);
  assert.equal(r.fidele, true, 'chaque ligne reprend l\'ajustement appliqué cette semaine-là');
  assert.equal(r.liste.length, 6);
  assert.match(r.liste[0], /^Cette semaine\+\d+\skcaldépense réelle 2\s5\d\d$/);
  assert.match(r.liste[1], /^Sem\. du 26 oct\.\+\d+\skcaldépense réelle /);

  // Une semaine plus tard : la nouvelle s'ajoute. Changer de vieux repas ne réécrit pas les semaines passées.
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00'));
  const r2 = await page.evaluate(() => {
    const avant = JSON.stringify(userProfile.ajustements);
    for (let d = '2026-10-12'; d <= '2026-10-31'; d = shiftDate(d, 1)) { getDay(d).meals.lunch[0].kcal = 1600; saveData(d); }
    const recalcul = correctionMaintenance('2026-11-02').kcal;
    currentDate = todayStr(); renderApp();
    const h = userProfile.ajustements;
    return { avantInchange: JSON.stringify(h.slice(0, -1)) === avant, recalcul, garde: h[h.length - 2].k, nouvelle: [h[h.length - 1].l, !!h[h.length - 1].rec], stockee: JSON.parse(localStorage.getItem(PROFILE_KEY)).ajustements.length === h.length };
  });
  assert.equal(r2.avantInchange, true, 'les semaines passées restent comme elles ont été appliquées');
  assert.notEqual(r2.recalcul, r2.garde, 'recalculée aujourd\'hui, la semaine du 2 novembre aurait changé');
  assert.deepEqual(r2.nouvelle, ['2026-11-09', false]);
  assert.equal(r2.stockee, true, 'gardé dans le profil enregistré (donc synchronisé)');
}));

test('Administration : l\'historique de l\'objectif adapté d\'un compte, semaine par semaine', () => avecAppli({}, async ({ page }) => {
  await installerFauxAdmin(page, () => ({
    'rpc:admin_liste_comptes': [{ utilisateur: 'admin', email: 'moi@x.fr', maj: Date.now(), nb_journees: 40 }, { utilisateur: 'a1', email: 'alice@x.fr', maj: Date.now(), nb_journees: 60 }],
    'table:profil': { donnees: { ajustementBalance: false, ajustements: [
      { l: '2026-10-26', k: 200, r: 2500, f: 2300, j: 27, p: 13, rec: 1 },
      { l: '2026-11-02', k: -140, r: 2130, f: 2270, j: 28, p: 14 }] } }
  }));
  const r = await page.evaluate(async () => {
    allerA('admin');
    await chargerAdmin();
    ouvrirCompteAdmin('a1');
    await new Promise(ok => setTimeout(ok, 100));
    const c = document.getElementById('admin-ajustement');
    return { lignes: [...c.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent)), pied: c.querySelector('.adm-ajust-pied').textContent,
      demande: window.__appels.filter(a => a[1] === 'profil').map(a => a[3]) };
  });
  assert.deepEqual(r.lignes, [
    ['2 nov.', '−140 kcal', '2 130', '2 270', '28 · 14'],
    ['26 oct.*', '+200 kcal', '2 500', '2 300', '27 · 13']]);
  assert.match(r.pied, /^Réglage : désactivé par l'utilisateur ; ne s'applique qu'avec Pro\. \* semaine reconstituée/);
  assert.ok(r.demande.some(f => JSON.stringify(f) === JSON.stringify([['eq', 'utilisateur', 'a1']])), JSON.stringify(r.demande));
}));

test('photo IA : Gemini mesure (unités, volume × densité), trois estimations en une demande, la médiane, puis le haut de la marge', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    geminiKey = 'cle-test';
    let envoi = null;
    const estimation = (riz, pomme, huile) => JSON.stringify({ type: 'aliment', echelle: 'assiette ~26 cm', aliments: [
      { name: 'Riz cuit', surface_cm2: 120, hauteur_cm: 2.5, volume_ml: riz, densite: 0.8, grams: 999, marge: 25, kcal100: 130, p100: 2.7, c100: 28, f100: 0.3 },
      { name: 'Pomme', unites: 1, poids_unite: pomme, grams: 999, marge: 2, kcal100: 52, p100: 0.3, c100: 14, f100: 0.2 },
      { name: 'Huile d\'olive', volume_ml: huile, densite: 0.92, grams: 10, kcal100: 900, p100: 0, c100: 0, f100: 100 }] });
    window.geminiCandidats = async (parts, type, n) => {
      envoi = { texte: parts[0].text, type, n };
      return [estimation(250, 170, 10),
        // La deuxième voit un aliment de plus, et une densité impossible pour l'huile : le poids donné reprend.
        JSON.stringify({ type: 'aliment', aliments: [
          { name: 'Riz basmati cuit', volume_ml: 200, densite: 0.8, grams: 160, marge: 30, kcal100: 130, p100: 2.7, c100: 28, f100: 0.3 },
          { name: 'Pomme', unites: 1, poids_unite: 190, marge: 10, kcal100: 52, p100: 0.3, c100: 14, f100: 0.2 },
          { name: 'Huile d\'olive', volume_ml: 12, densite: 920, grams: 11, kcal100: 900, p100: 0, c100: 0, f100: 100 },
          { name: 'Persil', grams: 2, kcal100: 36, p100: 3, c100: 6, f100: 1 }] }),
        estimation(300, 180, 14)];
    };
    ouvrirModal('ai-modal', true);
    document.getElementById('ai-description').value = 'du riz, une pomme et un filet d\'huile';
    await analyserRepasGemini();
    const res = {
      envoi: { type: envoi.type, n: envoi.n, mesure: /Mesure avant d'estimer/.test(envoi.texte) && /"volume_ml": number ou null/.test(envoi.texte) && /"poids_unite": number ou null/.test(envoi.texte) && /"marge": number/.test(envoi.texte) },
      retenus: detectedBufferGemini.map(a => [a.name, a.estime, a.marge, a.grams, a.nbEstimations]),
      lignes: [...document.querySelectorAll('#detected-ingredients-list .detected-row')].map(l => [l.querySelector('span').textContent, l.querySelector('input').value]),
      astuce: document.getElementById('ai-astuce-photo').textContent
    };
    activeMealId = 'lunch';
    ajouterIngredientsGemini();
    res.repas = getDay(currentDate).meals.lunch.map(i => [i.name, i.grams, Math.round(i.kcal)]);
    // Une seule estimation (modèle sans réponses multiples) : la même chaîne de calcul.
    window.geminiCandidats = async () => [estimation(250, 170, 10)];
    ouvrirModal('ai-modal', true);
    await analyserRepasGemini();
    res.seule = detectedBufferGemini.map(a => [a.name, a.estime, a.nbEstimations]);
    res.ligneSeule = document.querySelector('#detected-ingredients-list .detected-row span').textContent;
    return res;
  });
  assert.deepEqual(r.envoi, { type: 'photo', n: 3, mesure: true });
  // Riz : 200, 160, 240 g → médiane 200 g, marge médiane 25 % → 250 g. Pomme : 170, 180, 190 → 180 g ; marges 2, 10, 2 → 2, remontée à 5 %.
  // Huile : 9,2 g, 11 g (densité impossible), 12,9 g → 11 g, marge 20 % par défaut. Le persil, vu une seule fois, ne reste pas.
  assert.deepEqual(r.retenus, [['Riz cuit', 200, 25, 250, 3], ['Pomme', 180, 5, 189, 3], ['Huile d\'olive', 11, 20, 13, 3]]);
  assert.deepEqual(r.lignes[0], ['Riz cuit≈ 250 ml × 0,8 g/ml → 200 g · +25 % · médiane de 3', '250']);
  assert.deepEqual(r.lignes[1], ['Pomme1 × 180 g → 180 g · +5 % · médiane de 3', '189']);
  assert.match(r.astuce, /^Prends la photo un peu de biais/);
  assert.deepEqual(r.repas, [['Riz cuit', 250, 325], ['Pomme', 189, 98], ['Huile d\'olive', 13, 117]]);
  assert.deepEqual(r.seule, [['Riz cuit', 200, 1], ['Pomme', 170, 1], ['Huile d\'olive', 9, 1]]);
  assert.equal(r.ligneSeule, 'Riz cuit≈ 250 ml × 0,8 g/ml → 200 g · +25 %');
}));

test('Gemini : trois réponses demandées en une requête ; si le modèle refuse, une seule, et il s\'en souvient', () => avecAppli({}, async ({ page }) => {
  const r = await page.evaluate(async () => {
    geminiKey = 'cle-test'; userProfile.accordIA = true; iaServeur = null;
    const corps = [];
    let refuse = true;
    window.fetch = async (url, o) => {
      const b = JSON.parse(o.body); corps.push(b.generationConfig || null);
      if (b.generationConfig && refuse) return new Response(JSON.stringify({ error: { message: 'Multiple candidates is not enabled for this model' } }), { status: 400 });
      const n = b.generationConfig ? b.generationConfig.candidateCount : 1;
      return new Response(JSON.stringify({ candidates: Array.from({ length: n }, (_, k) => ({ content: { parts: [{ text: 'réponse ' + k }] } })) }), { status: 200 });
    };
    const res = {};
    res.refus = await geminiCandidats([{ text: 'x' }], 'photo', 3);
    res.ensuite = await geminiCandidats([{ text: 'x' }], 'photo', 3);
    localStorage.removeItem('mc_ia_une_reponse'); refuse = false;
    res.trois = await geminiCandidats([{ text: 'x' }], 'photo', 3);
    res.simple = await geminiGenerate([{ text: 'x' }]);
    res.corps = corps;
    return res;
  });
  assert.deepEqual(r.refus, ['réponse 0']);
  assert.deepEqual(r.ensuite, ['réponse 0']);
  assert.deepEqual(r.trois, ['réponse 0', 'réponse 1', 'réponse 2']);
  assert.equal(r.simple, 'réponse 0');
  assert.deepEqual(r.corps, [{ candidateCount: 3 }, null, null, { candidateCount: 3 }, null], 'après un refus, plus de demande multiple pour ce modèle');
}));


/* ---------- Atlas musculaire 3D ---------- */
/* Les mouvements de l'atlas (assets/atlas/atlas-mouvements.js), chargés hors navigateur : la table et les familles. */
function mouvementsAtlas() {
  const vm = require('vm'), ctx = { console, Math, Float32Array, Uint8Array, JSON, isNaN, isFinite, Object, Array, String, Number, Error };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'assets', 'atlas', 'atlas-mouvements.js'), 'utf8'), ctx);
  return ctx.AnqaMouvements;
}
/* L'en-tête du modèle (assets/atlas/atlas.bin) : le registre des structures et le squelette de mouvement. */
function enteteAtlas() {
  const b = fs.readFileSync(path.join(RACINE, 'assets', 'atlas', 'atlas.bin'));
  assert.equal(b.toString('latin1', 0, 4), 'ANQA');
  return JSON.parse(b.subarray(12, 12 + b.readUInt32LE(8)).toString('utf8'));
}
/* La peau (assets/atlas/atlas-peau.bin) : en-tête et sommets (20 octets chacun, comme le modèle). */
function peauAtlas() {
  const b = fs.readFileSync(path.join(RACINE, 'assets', 'atlas', 'atlas-peau.bin'));
  assert.equal(b.toString('latin1', 0, 4), 'ANQP');
  const lg = b.readUInt32LE(8), H = JSON.parse(b.subarray(12, 12 + lg).toString('utf8'));
  return { H, octets: b.length, sommets: b.subarray(12 + lg, 12 + lg + H.sommets * H.octetsParSommet), indices: b.subarray(12 + lg + H.sommets * H.octetsParSommet) };
}
/* Quatre semaines et plus de séances d'essai : pectoraux le jour même, dos il y a 2 jours, jambes il y a 4 jours,
   avec des charges qui montent un peu de semaine en semaine. */
const HISTORIQUE_ATLAS = `(() => {
  const jour = n => decalerJours(todayStr(), -n), serie = (poids, reps, n) => Array.from({ length: n }, () => ({ fait: true, poids, reps }));
  const seance = (n, exos) => ({ id: 'h' + n, date: jour(n), exercices: exos.map(([exerciceId, p, r, k]) => ({ exerciceId, series: serie(p, r, k) })) });
  musculationSessionActive = null; musculationHistorique = [];
  for (let sem = 0; sem < 8; sem++) {
    const m = 1 - sem * 0.02;
    musculationHistorique.push(seance(sem * 7, [['e1', Math.round(80 * m), 8, 4], ['e42', Math.round(10 * m), 12, 3]]));
    musculationHistorique.push(seance(sem * 7 + 2, [['e20', 0, 8, 4], ['e24', Math.round(60 * m), 10, 4]]));
    musculationHistorique.push(seance(sem * 7 + 4, [['e265', Math.round(100 * m), 6, 5], ['e29', Math.round(120 * m), 5, 3]]));
  }
})()`;

test('atlas 3D : le registre du modèle parle la langue de l\'appli (groupes, faisceaux, muscles attendus)', () => avecAppli({}, async ({ page }) => {
  const E = enteteAtlas(), S = E.structures;
  assert.equal(E.format, 'anqa-atlas');
  assert.equal(new Set(S.map(s => s.id)).size, S.length, 'identifiants uniques');
  assert.ok(S.length <= 250, 'le numéro de structure tient sur un octet');
  // Chaque structure : un nom français, un nom latin, une région connue, une couche, un maillage à elle.
  for (const s of S) {
    assert.ok(s.nom && s.latin && E.regions[s.region] && s.couche >= 1 && s.couche <= E.couches, 'fiche complète : ' + s.id);
    assert.ok(s.nbSommets > 3 && s.nbIndices >= 3, 'maillage propre : ' + s.id);
  }
  // Les muscles demandés pour l'entraînement, chacun à part.
  const ids = new Set(S.map(s => s.id));
  for (const id of ['pectoral_claviculaire', 'pectoral_sternal', 'pectoral_abdominal', 'deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur', 'trapeze_superieur', 'trapeze_moyen', 'trapeze_inferieur',
    'grand_dorsal', 'grand_rond', 'petit_rond', 'grand_rhomboide', 'petit_rhomboide', 'dentele_anterieur', 'biceps_long', 'biceps_court', 'brachial', 'brachio_radial', 'triceps_long', 'triceps_lateral', 'triceps_medial',
    'grand_droit_abdomen', 'oblique_externe', 'oblique_interne', 'transverse_abdomen', 'grand_fessier', 'moyen_fessier', 'petit_fessier', 'droit_femoral', 'vaste_lateral', 'vaste_medial', 'vaste_intermediaire',
    'biceps_femoral_long', 'semi_tendineux', 'semi_membraneux', 'gastrocnemien_medial', 'gastrocnemien_lateral', 'soleaire', 'tibial_anterieur']) assert.ok(ids.has(id), 'muscle présent : ' + id);
  // Le grand droit se voit en surface (gaine ouverte) ; le transverse est un muscle profond.
  assert.equal(S.find(s => s.id === 'grand_droit_abdomen').couche, 1);
  assert.ok(S.find(s => s.id === 'transverse_abdomen').couche >= 3);
  // Liens avec l'appli : groupes suivis, faisceaux du bon groupe, rôles connus ; chaque faisceau de l'appli a son muscle.
  const appli = await page.evaluate(() => ({ groupes: Object.keys(ZONES_VOLUME), faisceaux: Object.fromEntries(Object.entries(FAISCEAUX).map(([g, l]) => [g, l.map(x => x[0])])), roles: Object.keys(POIDS_ROLE_ATLAS) }));
  const vus = new Set();
  for (const s of S) for (const a of s.app) {
    assert.ok(appli.groupes.includes(a.groupe), `${s.id} : groupe ${a.groupe}`);
    assert.ok(appli.roles.includes(a.role), `${s.id} : rôle ${a.role}`);
    if (a.faisceau) { assert.ok((appli.faisceaux[a.groupe] || []).includes(a.faisceau), `${s.id} : faisceau ${a.faisceau} du groupe ${a.groupe}`); vus.add(a.faisceau); }
  }
  for (const g in appli.faisceaux) for (const f of appli.faisceaux[g]) assert.ok(vus.has(f), 'un muscle pour le faisceau ' + f);
  for (const g of appli.groupes) assert.ok(S.some(s => s.app.some(a => a.groupe === g && a.role === 'principal')), 'un muscle moteur pour le groupe ' + g);
  // Le squelette de mouvement : parents avant enfants, jumeaux gauche-droite réciproques.
  E.squelette.forEach((a, i) => { assert.ok(a.parent < i); assert.equal(E.squelette[a.jumeau].jumeau, i); });
  // Chaque exercice de la bibliothèque a son mouvement, et la table des mouvements ne nomme que des exercices connus.
  const M = mouvementsAtlas();
  // La bibliothèque livrée (avant les fusions de doublons, qui en retirent quelques-uns de la liste visible).
  const bibli = await page.evaluate(() => {
    const ids = [...IDS_EXERCICES_LIVRES];
    REDIRECTIONS_EXERCICES['exercice-commun'] = 'e1';
    const fusionne = mouvementExercice('exercice-commun');
    delete REDIRECTIONS_EXERCICES['exercice-commun'];
    return { ids, visibles: EXERCICES_BASE.map(e => e.id), doublons: EXERCICES_RETIRES.filter(e => e.estFusionBibliotheque).map(e => e.id), anime: ids.every(id => mouvementExercice(id) === cibleFusion(id) && IDS_EXERCICES_LIVRES.has(cibleFusion(id))),
      perso: mouvementExercice('exercice-maison'), fusionne, ancien: mouvementExercice(EXERCICES_RETIRES.find(e => !e.estFusionBibliotheque && !REDIRECTIONS_EXERCICES[e.id]).id) };
  });
  assert.ok(bibli.ids.length > 800 && bibli.visibles.length > 750 && bibli.doublons.length > 20, 'la bibliothèque');
  assert.deepEqual(bibli.visibles.concat(bibli.doublons).filter(id => !bibli.ids.includes(id)), [], 'tout exercice de la bibliothèque, visible ou fusionné comme doublon, fait partie de la liste livrée');
  assert.deepEqual(bibli.ids.filter(id => !M.specDe(id)), [], 'exercices de la bibliothèque sans mouvement');
  assert.deepEqual([bibli.anime, bibli.fusionne], [true, 'e1'], "l'appli annonce un mouvement pour toute la bibliothèque ; un exercice fusionné dans un autre joue celui de sa cible");
  assert.deepEqual([bibli.perso, bibli.ancien], [null, null], "pas de mouvement annoncé pour un exercice maison, ni pour un ancien exercice sorti de la bibliothèque (gardé pour l'historique)");
  const connus = new Set(bibli.ids);
  for (const spec in M.EXERCICES) {
    assert.ok(M.FAM[M.lireSpec(spec).f], 'famille du mouvement « ' + spec + ' »');
    for (const id of M.EXERCICES[spec]) assert.ok(connus.has(id), 'la table nomme un exercice inconnu : ' + id);
  }
}));

/* Chaque mouvement de la table, posé sur le squelette du modèle à plusieurs instants (sans navigateur) : il se définit
   sans erreur, ne donne que des valeurs finies, ne passe pas sous le sol, et ses mains et ses pieds atteignent leurs
   appuis. Le contrôle est celui de la chaîne de fabrication (outils/atlas/mouvements/controle.mjs). */
test('atlas 3D : les mouvements des 823 exercices se posent sans défaut', async () => {
  const { pathToFileURL } = require('url'), dossier = path.join(RACINE, 'outils', 'atlas', 'mouvements');
  const { controlerSpec } = await import(pathToFileURL(path.join(dossier, 'controle.mjs')).href);
  const { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } = await import(pathToFileURL(path.join(dossier, 'silhouettes.mjs')).href);
  assert.equal(path.resolve(FICHIER_MOUVEMENTS), path.join(RACINE, 'assets', 'atlas', 'atlas-mouvements.js'), "c'est bien le fichier servi par l'appli qui est contrôlé");
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS);
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), specs = Object.keys(M.EXERCICES);
  assert.ok(specs.length > 700, 'la table des mouvements');
  assert.equal(specs.reduce((n, s) => n + M.EXERCICES[s].length, 0), 823, 'un mouvement par exercice');
  const defauts = [];
  for (const spec of specs) { const pb = controlerSpec(M, corps, M.TEINTES.clair, spec); if (pb.length) defauts.push(spec + ' : ' + pb.join(' ; ')); }
  assert.deepEqual(defauts, [], 'mouvements à revoir');
});

/* Debout, un geste tient sur ses pieds. Le contrôle (outils/atlas/mouvements/equilibre.mjs) place le centre de gravité du
   corps d'après les masses de ses segments et le compare à l'appui des pieds, à neuf instants de chaque mouvement où les
   deux pieds sont à plat et où rien d'autre ne porte le corps ; il relève aussi les jambes verrouillées qui basculent en
   arrière (le défaut des soulevés de terre du build 53 : jambes tendues penchées de 24° pendant que le buste restait couché). */
test('atlas 3D : debout, les gestes tiennent en équilibre sur leurs pieds', async () => {
  const { pathToFileURL } = require('url'), dossier = path.join(RACINE, 'outils', 'atlas', 'mouvements');
  const { jugerSpec, APPUYES } = await import(pathToFileURL(path.join(dossier, 'equilibre.mjs')).href);
  const { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } = await import(pathToFileURL(path.join(dossier, 'silhouettes.mjs')).href);
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS), corps = new M.Corps(atlas.E.squelette, atlas.peau);
  const defauts = []; let juges = 0;
  for (const spec of Object.keys(M.EXERCICES)) {
    if (APPUYES.some(r => r.test(spec))) continue;
    const r = jugerSpec(M, corps, M.TEINTES.clair, spec);
    if (r.juge) juges++;
    if (r.notes.length) defauts.push(spec + ' : ' + r.notes[0]);
  }
  assert.ok(juges > 240, 'les mouvements debout sont bien jugés : ' + juges);
  assert.deepEqual(defauts, [], 'gestes debout hors d\'équilibre');
  // Le contrôle voit bien un geste mal posé : le même soulevé, le bassin assis 30 cm en arrière à mi-course.
  const faux = Object.assign({}, M, { definir: (spec, c, C) => { const d = M.definir(spec, c, C), cles = d.cles.map(([u, p]) => [u, Object.assign({}, p, { bassin: { pos: p.bassin.pos.clone().add(new M.V3(0, -0.05 * (1 - u) * u * 4, -0.3 * (1 - u) * u * 4)), rot: p.bassin.rot } })]); return Object.assign({}, d, { cles }); } });
  const releve = jugerSpec(faux, corps, M.TEINTES.clair, 'souleve').notes;
  assert.ok(releve.length > 0 && /derrière les talons/.test(releve.join(' ')), 'un soulevé au bassin assis 30 cm en arrière est relevé : ' + releve.length + ' instant(s)');
});

/* Le déroulé des soulevés de terre et du squat, lu sur le squelette (sans navigateur) : angles des genoux, du buste et
   des tibias, place de la barre. Ce sont les repères d'un geste juste, vérifiés à onze instants. */
test('atlas 3D : soulevés de terre et squat se déroulent comme le geste réel', async () => {
  const { pathToFileURL } = require('url'), dossier = path.join(RACINE, 'outils', 'atlas', 'mouvements');
  const { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } = await import(pathToFileURL(path.join(dossier, 'silhouettes.mjs')).href);
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS), corps = new M.Corps(atlas.E.squelette, atlas.peau);
  const DEG = 180 / Math.PI;
  const lire = (spec, n = 10) => {
    const d = M.definir(spec, corps, M.TEINTES.clair), lu = [];
    for (let i = 0; i <= n; i++) {
      const info = corps.poser(M.poseA(d, 0, i / n)), h = info.hanches.G, g = info.genoux.G, ch = info.chevilles.G, e = info.epaules.G, pr = info.prises.G;
      const a = h.clone().sub(g), b = ch.clone().sub(g);
      lu.push({ genou: Math.acos(a.dot(b) / a.length() / b.length()) * DEG, buste: Math.atan2(e.y - h.y, Math.abs(e.z - h.z)) * DEG, tibia: Math.atan2(g.z - ch.z, g.y - ch.y) * DEG,
        hancheSurGenou: h.y - g.y, barreDevantCheville: pr.z - ch.z, epauleDevantBarre: e.z - pr.z, yBarre: pr.y });
    }
    return { d, lu };
  };
  const croissant = (l, k, marge = 0) => l.every((x, i) => !i || x[k] >= l[i - 1][k] - marge);
  const mini = (l, k) => Math.min(...l.map(x => x[k])), maxi = (l, k) => Math.max(...l.map(x => x[k]));

  // Soulevé de terre classique : du sol à la position debout.
  const { d, lu } = lire('souleve'), bas = lu[0], hautS = lu[lu.length - 1];
  assert.ok(Array.isArray(d.cles) && d.cles.length >= 9, 'les postures sont réglées une fois (poses clés), pas recalculées à chaque image');
  assert.ok(bas.genou > 95 && bas.genou < 115 && bas.buste > 20 && bas.buste < 32, `au sol : genoux pliés, dos à plat incliné (${bas.genou.toFixed(0)}°, ${bas.buste.toFixed(0)}°)`);
  assert.ok(bas.hancheSurGenou > 0.08, 'au sol, les hanches sont plus hautes que les genoux (ce n\'est pas un squat)');
  assert.ok(bas.barreDevantCheville > 0.04 && bas.barreDevantCheville < 0.10, 'la barre part du milieu du pied, contre les tibias : ' + bas.barreDevantCheville.toFixed(3));
  assert.ok(bas.epauleDevantBarre > 0.02 && bas.epauleDevantBarre < 0.09, 'au départ, les épaules sont un peu en avant de la barre, bras tendus');
  assert.ok(croissant(lu, 'genou') && croissant(lu, 'buste'), 'les genoux se tendent et le buste se redresse ensemble, sans retour en arrière');
  assert.ok(hautS.genou > 170 && hautS.buste > 85, 'debout : jambes tendues, buste droit');
  assert.ok(mini(lu, 'tibia') > -6 && maxi(lu, 'tibia') < 8, `les tibias restent presque droits (de ${mini(lu, 'tibia').toFixed(0)}° à ${maxi(lu, 'tibia').toFixed(0)}°) : les jambes ne basculent pas en arrière`);
  // À mi-course (barre au-dessus des genoux), les genoux sont encore pliés : les hanches ne sont pas montées seules.
  assert.ok(lu[5].genou < 150 && lu[5].buste > 35, `à mi-course : genoux ${lu[5].genou.toFixed(0)}°, buste ${lu[5].buste.toFixed(0)}°`);
  assert.ok(mini(lu, 'barreDevantCheville') > 0.04 && maxi(lu, 'barreDevantCheville') < 0.125, 'la barre monte droit, le long des jambes');

  // Les variantes depuis le sol plient les genoux elles aussi (elles restaient jambes tendues).
  for (const spec of ['souleve hal', 'souleve kb', 'souleve trapbar', 'souleve sumo', 'souleve deficit']) {
    const v = lire(spec).lu;
    assert.ok(v[0].genou < 125 && v[v.length - 1].genou > 170 && croissant(v, 'genou') && croissant(v, 'buste', 0.5), spec + ' : genoux pliés au départ, tendus debout, sans à-coup');
    assert.ok(mini(v, 'tibia') > -6, spec + ' : pas de jambes basculées en arrière');
  }
  // Soulevé roumain : départ debout, genoux souples, les hanches reculent, la barre descend contre les jambes.
  const roumain = lire('souleve roumain').lu, basR = roumain[roumain.length - 1];
  assert.ok(roumain[0].genou > 170 && basR.genou > 140 && basR.genou < 162, 'roumain : genoux souples en bas (' + basR.genou.toFixed(0) + '°), jamais verrouillés ni accroupis');
  assert.ok(basR.buste < 36 && basR.tibia > -13 && basR.tibia < 0, `roumain en bas : buste couché (${basR.buste.toFixed(0)}°), tibias à peine en arrière (${basR.tibia.toFixed(0)}°)`);
  assert.ok(maxi(roumain, 'barreDevantCheville') < 0.125 && croissant(roumain.slice().reverse(), 'buste'), 'roumain : la barre reste contre les jambes, le buste bascule régulièrement');
  // Jambes tendues : elles le restent, sans partir loin en arrière ; la barre pend sous les épaules.
  const tendues = lire('souleve tendues').lu, basT = tendues[tendues.length - 1];
  assert.ok(mini(tendues, 'genou') > 168 && mini(tendues, 'tibia') > -13 && basT.buste < 12, 'jambes tendues : genoux droits, buste à l\'horizontale en bas');
  // Squat : en bas, les genoux passent au-dessus des orteils et les cuisses arrivent à l'horizontale ; l'haltère pend à la verticale.
  const squat = lire('squat barre').lu, basQ = squat[squat.length - 1];
  assert.ok(basQ.tibia > 25 && basQ.tibia <= 37 && basQ.hancheSurGenou < 0.06 && basQ.genou < 70, `squat en bas : tibia ${basQ.tibia.toFixed(0)}°, hanche ${(100 * basQ.hancheSurGenou).toFixed(0)} cm au-dessus du genou`);
  const haltere = corps.poser(M.poseA(M.definir('squat hal', corps, M.TEINTES.clair), 0, 1));
  assert.ok(Math.abs(haltere.prises.G.z - haltere.epaules.G.z) < 0.06 && haltere.prises.G.x > haltere.genoux.G.x + 0.08, 'squat avec haltères : les bras pendent sous les épaules, en dehors des genoux');
});

test('atlas 3D : la peau va avec le modèle (zones, attaches au squelette, articulations intermédiaires)', () => {
  const E = enteteAtlas(), { H, octets, sommets, indices } = peauAtlas();
  assert.equal(H.format, 'anqa-peau');
  assert.match(H.source, /Z-Anatomy.*CC BY-SA 4\.0/, 'la peau vient de la même source que les muscles, sous la même licence');
  assert.deepEqual(H.zones, ['corps', 'tete', 'main', 'pied', 'ongle', 'poil', 'cheveux', 'oeil']);
  assert.equal(H.articulations, E.squelette.length, 'la peau est attachée au squelette de ce modèle');
  assert.ok(octets < 1.2e6, 'la peau reste légère : ' + octets + ' octets');
  // Les articulations intermédiaires relient deux articulations du squelette, pour une part de leur rotation.
  for (const d of H.intermediaires) assert.ok(E.squelette[d.vers].parent >= 0 && d.de >= 0 && d.de < E.squelette.length && d.part > 0 && d.part < 1, 'articulation intermédiaire valide');
  for (const d of H.intermediaires) assert.ok(d.retrait == null || (d.retrait > 0 && d.retrait <= 1), 'retrait d\'une articulation intermédiaire entre 0 et 1');
  // Chaque sommet : une zone connue, des attaches à des articulations qui existent, des poids dont la somme fait le tout.
  const NT = E.squelette.length + 2 * H.intermediaires.length, pas = H.octetsParSommet, parZone = new Array(H.zones.length).fill(0);
  let defauts = 0;
  for (let i = 0; i < H.sommets; i++) {
    const o = i * pas, zone = sommets[o + 10]; let somme = 0;
    if (zone >= H.zones.length) defauts++; else parZone[zone]++;
    for (let k = 0; k < 4; k++) { const w = sommets[o + 16 + k]; somme += w; if (w && sommets[o + 12 + k] >= NT) defauts++; }
    if (somme !== 255) defauts++;
  }
  assert.equal(defauts, 0, 'sommets de la peau sans défaut');
  assert.ok(parZone.every(n => n > 0), 'chaque zone a ses sommets : ' + parZone.join(', '));
  // Le flanc reste sur les côtes : sous l'aisselle, la peau du tronc ne suit ni le bras ni une articulation qui mène
  // au bras (sinon elle part avec lui quand il se lève, et le torse s'élargit comme une cape).
  const NJ = E.squelette.length, NX = H.intermediaires.length, duBras = n => /^(humerus|ulna|radius|main|doigt)/.test(n);
  const versBras = j => (j < NJ ? duBras(E.squelette[j].nom) : duBras(E.squelette[H.intermediaires[(j - NJ) % NX].vers].nom));
  let flanc = 0, flancBras = 0;
  for (let i = 0; i < H.sommets; i++) {
    const o = i * pas; if (sommets[o + 10] !== 0) continue;
    const x = H.boite.min[0] + sommets.readUInt16LE(o) / 65535 * H.boite.etendue[0], y = H.boite.min[1] + sommets.readUInt16LE(o + 2) / 65535 * H.boite.etendue[1];
    if (x > 0.15 || y < 1.05 || y > 1.24) continue;
    flanc++;
    let part = 0; for (let k = 0; k < 4; k++) if (versBras(sommets[o + 12 + k])) part += sommets[o + 16 + k];
    if (part > 2) flancBras++;
  }
  assert.ok(flanc > 300, 'le contrôle porte bien sur la peau du tronc : ' + flanc + ' sommets');
  assert.equal(flancBras, 0, 'sommets du flanc attachés au bras');
  // Les triangles ne nomment que des sommets qui existent.
  const nb = (H.trianglesPairs + H.trianglesImpairs) * 3, lire = H.indicesSur === 32 ? k => indices.readUInt32LE(k * 4) : k => indices.readUInt16LE(k * 2);
  let hors = 0; for (let k = 0; k < nb; k++) if (lire(k) >= H.sommets) hors++;
  assert.equal(hors, 0);
  // Le short tient entre le haut des cuisses et la taille ; l'œil est à hauteur de tête.
  assert.ok(H.short.bas > 0.5 && H.short.haut > H.short.bas && H.short.haut < 1.1 && H.oeil.centre[1] > 1.5 && H.oeil.rayon > 0.008 && H.oeil.rayon < 0.02);
});

test('atlas 3D : aucun triangle à cheval sur deux structures ni sur deux zones de peau (le moteur compte dessus)', () => {
  // Pour ses valeurs « flat », le moteur demande la convention du premier sommet là où elle existe (sans elle, le rendu
  // est très lent sur les puces Apple). L'image n'en dépend pas tant que les trois sommets d'un triangle portent la
  // même structure, et la même zone pour la peau : c'est ce qui est vérifié ici.
  const b = fs.readFileSync(path.join(RACINE, 'assets', 'atlas', 'atlas.bin')), lg = b.readUInt32LE(8), E = JSON.parse(b.subarray(12, 12 + lg).toString('utf8'));
  const debut = 12 + lg, pas = E.octetsParSommet, ind = debut + E.sommets * pas, structure = v => b[debut + v * pas + 10];
  let k = 0, mixtes = 0;
  for (let i = 0; i < E.pieces.length; i += 2) {
    const v0 = E.pieces[i], n = E.pieces[i + 1];
    for (let j = 0; j < n; j += 3, k += 3) { const s = structure(v0 + b.readUInt16LE(ind + k * 2)); if (structure(v0 + b.readUInt16LE(ind + k * 2 + 2)) !== s || structure(v0 + b.readUInt16LE(ind + k * 2 + 4)) !== s) mixtes++; }
  }
  assert.equal(k, E.triangles * 3, 'tous les triangles du modèle sont parcourus');
  assert.equal(mixtes, 0, 'triangles du modèle à cheval sur deux structures');
  const { H, sommets, indices } = peauAtlas(), lire = H.indicesSur === 32 ? q => indices.readUInt32LE(q * 4) : q => indices.readUInt16LE(q * 2), zone = v => sommets[v * H.octetsParSommet + 10];
  let mixtesPeau = 0;
  for (let t = 0; t < H.trianglesPairs + H.trianglesImpairs; t++) { const z = zone(lire(t * 3)); if (zone(lire(t * 3 + 1)) !== z || zone(lire(t * 3 + 2)) !== z) mixtesPeau++; }
  assert.equal(mixtesPeau, 0, 'triangles de la peau à cheval sur deux zones');
});

test('atlas 3D : les cartes viennent de l\'historique réel, et restent neutres sans donnée', () => avecAppli({}, async ({ page }) => {
  const S = enteteAtlas().structures;
  // Un mardi : la semaine (du lundi) ne compte que la séance du jour ; le dos (il y a 2 jours) et les jambes (il y a 4 jours) sont de la semaine d'avant.
  await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
  const r = await page.evaluate(([S, historique]) => {
    const res = {};
    // Sans aucune séance : rien n'est coloré, et chaque carte le dit.
    musculationSessionActive = null; musculationHistorique = [];
    atlasDonnees = donneesAtlas();
    res.vide = ['semaine', 'seance', 'frequence', 'progression', 'equilibre'].map(m => { const c = carteAtlas(m, S); return [Object.keys(c.couleurs).length, c.note]; });
    (0, eval)(historique);
    atlasDonnees = donneesAtlas();
    const D = atlasDonnees, de = id => S.find(s => s.id === id);
    res.semaine = D.semaine; res.seance = D.seance;
    res.jours = Object.fromEntries(Object.entries(D.jours).map(([g, s]) => [g, s.size]));
    res.progression = Object.fromEntries(Object.entries(D.progression).map(([g, p]) => [g, [p.exercices.length, p.evolution > 0]]));
    res.retards = Object.keys(D.retards).sort();
    const sem = carteAtlas('semaine', S), zone = g => ZONES_INFO[cleZoneVolume(g, D.semaine[g])].couleur, N = neutresAtlas();
    // Le faisceau sternal porte l'essentiel du développé couché : pleine couleur de la zone des pectoraux.
    res.pecSternal = [sem.couleurs.pectoral_sternal, melangerCouleurs(N.muscle, zone('pectoraux'), 1)];
    res.pecHautPlusPale = sem.couleurs.pectoral_claviculaire !== sem.couleurs.pectoral_sternal;
    res.nonTravailles = ['grand_dorsal', 'droit_femoral', 'sartorius'].map(id => sem.couleurs[id] || null);
    res.legendeSemaine = sem.legende.map(l => l.t);
    const se = carteAtlas('seance', S);
    res.seanceCouleurs = [se.couleurs.pectoral_sternal === couleurCssAtlas('--corps-cible', '#f472b6'), !!se.couleurs.triceps_long, se.couleurs.grand_dorsal || null, se.note];
    res.progressionCouleurs = [carteAtlas('progression', S).couleurs.grand_dorsal === couleurCssAtlas('--ok', '#32d74b')];
    res.equilibre = [carteAtlas('equilibre', S).couleurs.pectoral_claviculaire === couleurCssAtlas('--attention', '#ff9f0a')];
    res.anatomie = Object.keys(carteAtlas('anatomie', S).couleurs || {}).length;
    // Fiches : la zone de la semaine, la progression chiffrée, un muscle sans suivi.
    res.ficheSemaine = ficheAtlas(de('pectoral_sternal'), 'semaine').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    res.ficheProgression = ficheAtlas(de('grand_dorsal'), 'progression').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    res.ficheSansSuivi = ficheAtlas(de('sartorius'), 'semaine').replace(/<[^>]+>/g, ' ').trim();
    // Un exercice : ses muscles, pondérés (principal, secondaire, faisceaux de sa fiche).
    atlasExercice = { exo: trouverExercice('e1'), mouvement: mouvementExercice('e1') };
    const ex = carteAtlas('exercice', S);
    res.exercice = [ex.couleurs.pectoral_sternal === couleurCssAtlas('--corps-cible', '#f472b6'), !!ex.couleurs.triceps_lateral && ex.couleurs.triceps_lateral !== ex.couleurs.pectoral_sternal, ex.couleurs.grand_dorsal || null, ex.legende.map(l => l.t)];
    // Les alertes de faisceaux : mêmes phrases qu'avant, avec le faisceau en retard en plus.
    const f = { delt_ant: 10, delt_lat: 1, delt_post: 2 };
    res.avis = [avisFaisceaux('epaules', f, 13).map(a => a.faisceau), alertesFaisceaux('epaules', f, 13).length, avisFaisceaux('epaules', f, 13)[0].texte === alertesFaisceaux('epaules', f, 13)[0]];
    atlasExercice = null; atlasDonnees = null;
    return res;
  }, [S, HISTORIQUE_ATLAS]);
  for (const [n, note] of r.vide) { assert.equal(n, 0); assert.match(note, /^(Aucune|Pas encore)/); }
  // Aujourd'hui : développé couché (4 séries) et élévations latérales (3 séries) ; les secondaires comptent pour moitié.
  assert.equal(r.semaine.pectoraux, 4);
  assert.ok(r.semaine.epaules >= 3 && r.semaine.triceps > 0);
  assert.deepEqual(r.seance.directs, { pectoraux: 4, epaules: 3 });
  assert.ok(r.seance.indirects.triceps > 0 && !r.seance.directs.dos);
  assert.equal(r.jours.pectoraux, 4, 'une séance de pectoraux par semaine sur 28 jours');
  // Le dos : quatre jours de tractions et de rowing, et quatre jours de soulevé de terre (3 séries où il est secondaire : 1,5 série).
  assert.equal(r.jours.dos, 8);
  assert.deepEqual(r.progression.dos, [1, true], 'rowing : mêmes exercices sur les deux périodes, charge en hausse');
  assert.deepEqual(r.progression.pectoraux, [1, true]);
  assert.ok(r.retards.includes('pec_haut'), 'haut des pectoraux en retard (que du développé couché à plat)');
  assert.equal(r.pecSternal[0], r.pecSternal[1]);
  assert.ok(r.pecHautPlusPale, 'un faisceau moins sollicité est plus pâle');
  assert.deepEqual(r.nonTravailles, [null, null, null], 'ce qui n\'a pas travaillé cette semaine reste neutre');
  assert.deepEqual(r.legendeSemaine, ['Trop peu', 'Entretien', 'Progression', 'Zone idéale', 'Trop']);
  assert.deepEqual(r.seanceCouleurs.slice(0, 3), [true, true, null]);
  assert.equal(r.seanceCouleurs[3], "Séance d'aujourd'hui");
  assert.deepEqual(r.progressionCouleurs, [true]);
  assert.deepEqual(r.equilibre, [true]);
  assert.equal(r.anatomie, 0, 'en mode anatomie, les couleurs naturelles');
  assert.match(r.ficheSemaine, /^Pectoraux muscle moteur · Milieu Pectoraux .* 4 séries/);
  assert.match(r.ficheProgression, /^Dos muscle moteur · .*Force estimée : \+\d+(,\d)? % en 28 jours \(1 exercice comparé\)/);
  assert.match(r.ficheSansSuivi, /n'a pas de suivi dédié/);
  assert.deepEqual(r.exercice.slice(0, 3), [true, true, null]);
  assert.deepEqual(r.exercice[3], ['Muscle principal', 'Travaille aussi']);
  assert.deepEqual(r.avis, [['delt_post', 'delt_lat'], 2, true]);
}));

/* Ouvrir un exercice montre son mouvement, sans rien toucher de plus : le corps de l'atlas l'exécute dans la fiche.
   De là, l'atlas s'ouvre en grand DEVANT la fiche (au build 53 il s'ouvrait derrière : on ne voyait rien). */
test('atlas 3D : la fiche d\'un exercice montre son mouvement dès l\'ouverture, et l\'atlas s\'ouvre devant elle', async () => {
  // Sans WebGL 2 : la fiche garde la photo ou le corps dessiné, et rien ne se charge.
  await avecAppli({}, async ({ page }) => {
    const r = await page.evaluate(() => {
      const sauve = window.WebGL2RenderingContext; window.WebGL2RenderingContext = undefined;
      afficherFicheExerciceBiblio('e265');
      const res = { cadre3d: !!document.getElementById('fiche-exo-3d'), statique: !!document.querySelector('#fiche-exo-media .fiche-exo-image'), monte: ficheMouvement };
      fermerModal('fiche-exercice-modal'); window.WebGL2RenderingContext = sauve;
      return res;
    });
    assert.deepEqual(r, { cadre3d: false, statique: true, monte: null });
  });
  const nav = await lancerNavigateur(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);
  try {
    const { page, erreurs, ctx } = await ouvrirAppli(nav, { https: true });
    const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    if (!webgl) { await ctx.close(); return; }   // pas de rendu 3D dans ce navigateur de test : rien à vérifier de plus
    const monte = () => page.waitForFunction(() => ficheMouvement && document.querySelector('#fiche-exo-3d canvas'), null, { timeout: 120000 });
    await page.evaluate(() => afficherFicheExerciceBiblio('e265'));
    await monte();
    const f = await page.evaluate(() => ({
      onglet: !document.querySelector('#fiche-exercice-container .fiche-onglet[data-onglet="technique"]').classList.contains('hidden'),
      anime: ficheMouvement.apercu.anime, peau: ficheMouvement.apercu.atlas.niveauPeau(), toiles: document.querySelectorAll('#fiche-exo-3d canvas').length,
      boutons: [...document.querySelectorAll('#fiche-exo-3d .fiche-3d-btn')].map(b => b.getAttribute('aria-label')),
      spec: ficheMouvement.apercu.atlas && AnqaMouvements.specDe('e265'), colores: Object.keys(carteExerciceAtlas(trouverExercice('e265'), ficheMouvement.apercu.atlas.structures).couleurs).length,
      scripts: [...document.scripts].map(s => s.getAttribute('src')).filter(s => s && s.startsWith('assets/atlas/')).sort(),
      materiel: ficheMouvement.apercu.atlas.mesures().appelsDeDessin
    }));
    assert.ok(f.onglet, "la fiche s'ouvre sur l'onglet où se trouve le mouvement");
    assert.deepEqual([f.anime, f.peau, f.toiles, f.spec], [true, 1, 1, 'squat barre']);
    assert.equal(f.boutons.length, 2);
    assert.match(f.boutons[1], /Ouvrir l'atlas en grand/);
    assert.ok(f.colores > 10, 'les muscles de l\'exercice sont colorés');
    assert.deepEqual(f.scripts, ['assets/atlas/atlas-mouvements.js', 'assets/atlas/atlas3d.js']);
    // La peau gardée (tête, mains, pieds) a la teinte du corps, pas celle de la chair.
    assert.deepEqual(await page.evaluate(() => { const ap = ficheMouvement.apercu.atlas.apparence(), n = neutresExerciceAtlas(); return [ap.chair, ap.teint === n.peau, ap.muscle === n.muscle]; }), [0, true, true]);
    // Lecture et pause.
    const lecture = await page.evaluate(() => { const r = [ficheMouvement.voulu]; basculerLectureFiche(); r.push(ficheMouvement.voulu, ficheMouvement.apercu.lecture()); if (!ficheMouvement.voulu) basculerLectureFiche(); r.push(ficheMouvement.voulu); return r; });
    assert.equal(lecture[1], !lecture[0]);
    assert.equal(lecture[2], lecture[1], 'le bouton commande bien le mouvement');
    assert.equal(lecture[3], true);
    // Un autre onglet de la fiche : le mouvement se met en pause ; au retour, il reprend.
    await page.evaluate(() => choisirOngletFiche('resume'));
    await page.waitForFunction(() => !ficheMouvement.apercu.lecture(), null, { timeout: 20000 });
    await page.evaluate(() => choisirOngletFiche('technique'));
    await page.waitForFunction(() => ficheMouvement.apercu.lecture(), null, { timeout: 20000 });
    // Une pause qui ne vient pas du bouton ne dure pas : tant que le mouvement est voulu et que son cadre se voit, il
    // repart de lui-même. (Dans le moteur web d'iOS, un verdict de visibilité rendu pendant que la fiche glissait en
    // place le laissait figé : le simulateur iPhone l'a montré.)
    assert.deepEqual(await page.evaluate(() => { ficheMouvement.apercu.lecture(false); return [ficheMouvement.voulu, ficheMouvement.apercu.lecture()]; }), [true, false]);
    await page.waitForFunction(() => ficheMouvement.apercu.lecture(), null, { timeout: 20000 });
    // Hors de l'écran (la fiche défilée loin), il se met en pause ; revenu, il reprend.
    await page.evaluate(() => { document.getElementById('fiche-exo-3d').style.transform = 'translateY(3000px)'; });
    await page.waitForFunction(() => !ficheMouvement.apercu.lecture(), null, { timeout: 20000 });
    await page.evaluate(() => { document.getElementById('fiche-exo-3d').style.transform = ''; });
    await page.waitForFunction(() => ficheMouvement.apercu.lecture(), null, { timeout: 20000 });
    // Tourner du doigt : un glissement horizontal change l'angle de vue.
    const boite = await page.evaluate(() => { const r = document.querySelector('#fiche-exo-3d canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, az: ficheMouvement.apercu.atlas.camera().az }; });
    await page.mouse.move(boite.x, boite.y); await page.mouse.down(); await page.mouse.move(boite.x + 80, boite.y + 4, { steps: 6 }); await page.mouse.up();
    const az = await page.evaluate(() => ficheMouvement.apercu.atlas.camera().az);
    assert.ok(Math.abs(az - boite.az) > 20, 'la vue a tourné : ' + boite.az + ' → ' + az);
    // Agrandir : l'atlas s'ouvre devant la fiche, sur le même exercice ; le cadre de la fiche est défait entre-temps.
    await page.evaluate(() => agrandirMouvementFiche());
    await page.waitForFunction(() => atlasMonte && atlasMonte.atlas.mesures().images > 1, null, { timeout: 120000 });
    const g = await page.evaluate(() => {
      const dessus = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return { devant: !!dessus.closest('#atlas-modal'), fiche: ficheMouvement, titre: document.getElementById('titre-atlas').textContent, mode: atlasMonte.etat().mode, anim: !!atlasMonte.animation() };
    });
    assert.deepEqual(g, { devant: true, fiche: null, titre: 'Squat avec barre', mode: 'exercice', anim: true });
    // Le bouton de la fiche (« Explorer les muscles en 3D ») mène au même endroit, lui aussi devant la fiche.
    await page.evaluate(() => fermerAtlas());
    await monte();
    assert.equal(await page.evaluate(() => atlasMonte), null);
    await page.click('#fiche-exercice-container .btn-atlas');
    await page.waitForFunction(() => atlasMonte && atlasMonte.atlas.mesures().images > 1, null, { timeout: 120000 });
    assert.ok(await page.evaluate(() => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2).closest('#atlas-modal')), "l'atlas ouvert depuis la fiche est au premier plan");
    // Là aussi, un seul corps en mémoire graphique : le cadre de la fiche est défait, et revient à la fermeture.
    assert.deepEqual(await page.evaluate(() => [ficheMouvement, document.querySelectorAll('#fiche-exo-3d canvas').length]), [null, 0]);
    await page.evaluate(() => fermerAtlas());
    await monte();
    // La touche Échap referme l'atlas comme sa croix : scène défaite, et la fiche restée dessous reprend son mouvement.
    await page.evaluate(() => agrandirMouvementFiche());
    await page.waitForFunction(() => atlasMonte && atlasMonte.atlas.mesures().images > 1, null, { timeout: 120000 });
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [atlasMonte, document.getElementById('atlas-modal').classList.contains('show'), document.getElementById('fiche-exercice-modal').classList.contains('show')]), [null, false, true]);
    await monte();
    // Un exercice qui a une photo : elle reste à portée, et l'on revient au mouvement.
    const avecPhoto = await page.evaluate(() => { const e = EXERCICES_BASE.find(x => mouvementExercice(x.id) && (mediaExercice(x) || {}).img && mediaExercice(x).img.length); return e ? e.id : null; });
    if (avecPhoto) {
      await page.evaluate(id => afficherFicheExerciceBiblio(id), avecPhoto);
      await monte();
      await page.click('#fiche-exo-media .lien-texte');
      assert.deepEqual(await page.evaluate(() => [ficheMouvement, !!document.querySelector('#fiche-exo-media .fiche-exo-image img'), document.querySelectorAll('#fiche-exo-3d canvas').length]), [null, true, 0]);
      const photo = await page.evaluate(() => { const z = document.getElementById('fiche-exo-media'); return { src: z.querySelector('.fiche-exo-image img').src, notes: [...z.querySelectorAll('.fiche-exo-note-source')].map(p => p.textContent.trim()), interdit: /smartworkout|exercisedb|wger/i.test(z.innerHTML), videos: z.querySelectorAll('video').length }; });
      assert.deepEqual([photo.interdit, photo.videos], [false, 0], 'la photo de la fiche : ni vidéo ni média interdit');
      assert.ok(photo.notes.some(t => /^(Image|Photo|Illustration) : /.test(t)) || !/RepDB|free-exercise-db|workout-guide/.test(photo.src), 'la photo cite sa source : ' + photo.notes.join(' | '));
      assert.ok(photo.notes.some(t => /Voir le mouvement en 3D/.test(t)), 'on peut revenir au mouvement');
      await page.click('#fiche-exo-media .lien-texte');
      await monte();
    }
    // Fermer la fiche défait tout : plus de toile, plus de contexte graphique.
    await page.evaluate(() => fermerModal('fiche-exercice-modal'));
    assert.deepEqual(await page.evaluate(() => [ficheMouvement, document.querySelectorAll('#fiche-exo-3d canvas').length]), [null, 0]);
    // Un exercice créé par l'utilisateur n'a pas de mouvement : sa fiche garde le corps dessiné.
    await page.evaluate(() => { musculationExosPerso.push({ id: 'exercice-maison', nom: 'Exercice maison', groupe: 'biceps', secondaires: [], materiel: 'haltere' }); afficherFicheExerciceBiblio('exercice-maison'); });
    assert.deepEqual(await page.evaluate(() => [!!document.getElementById('fiche-exo-3d'), !!document.querySelector('#fiche-exo-media .fiche-exo-image')]), [false, true]);
    await page.evaluate(() => fermerModal('fiche-exercice-modal'));
    assert.deepEqual(erreurs, [], 'erreurs JavaScript dans la page');
    await ctx.close();
  } finally { await nav.close(); }
});

/* La carrure : les chairs sont étoffées autour des os au chargement — le squelette, la tête, les mains et les pieds ne
   bougent pas ; la peau reçoit la même transformation. Le mélange des articulations (quaternions duaux) redonne la
   pose rigide là où un seul os commande. Le matériel : formes connues du moteur, pile de poids qui suit le câble. */
test('atlas 3D : carrure (os et extrémités intacts), mélange des articulations, matériel des machines', async () => {
  const vm = require('vm');
  const ctxMoteur = { window: {}, Math, Float32Array, Uint8Array, Uint16Array, Uint32Array, DataView, JSON, Object, Array, Infinity, console };
  vm.createContext(ctxMoteur);
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'assets', 'atlas', 'atlas3d.js'), 'utf8'), ctxMoteur);
  const etoffer = ctxMoteur.window.AnqaAtlas.etoffer;
  assert.equal(typeof etoffer, 'function');
  const b = fs.readFileSync(path.join(RACINE, 'assets', 'atlas', 'atlas.bin')), lg = b.readUInt32LE(8), E = JSON.parse(b.subarray(12, 12 + lg).toString('utf8'));
  const debut = 12 + Math.ceil(lg / 4) * 4, pas = E.octetsParSommet, brut = new Uint8Array(b.buffer, b.byteOffset + debut, E.sommets * pas);
  const r = etoffer(brut, pas, E.boite, E.squelette, 1, (v, o) => brut[o + 10] === E.os.pair || brut[o + 10] === E.os.impair);
  const lire = (tab, boite, v) => [0, 1, 2].map(k => boite.min[k] + (tab[v * pas + k * 2] | (tab[v * pas + k * 2 + 1] << 8)) / 65535 * boite.etendue[k]);
  let osBouge = 0, extremites = 0, nbExt = 0;
  const parRegion = {};
  for (const st of E.structures) for (let v = st.sommets; v < st.sommets + st.nbSommets; v += 3) {
    const p0 = lire(brut, E.boite, v), p1 = lire(r.sommets, r.boite, v), d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    if (['tete', 'main', 'pied'].includes(st.region)) { nbExt++; extremites = Math.max(extremites, d); }
    (parRegion[st.region] = parRegion[st.region] || []).push(d);
  }
  for (let v = 0; v < E.sommets; v += 7) if (brut[v * pas + 10] === E.os.pair || brut[v * pas + 10] === E.os.impair) { const p0 = lire(brut, E.boite, v), p1 = lire(r.sommets, r.boite, v); osBouge = Math.max(osBouge, Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])); }
  const moy = t => t.reduce((a, x) => a + x, 0) / t.length;
  assert.ok(osBouge < 0.0005, 'le squelette ne bouge pas : ' + osBouge);
  assert.ok(nbExt > 1000 && extremites < 0.004, 'la tête, les mains et les pieds gardent leur forme : ' + extremites);
  assert.ok(moy(parRegion.bras) > 0.004 && moy(parRegion.cuisse) > 0.004 && moy(parRegion.thorax) > 0.006, 'bras, cuisses et thorax sont étoffés : ' + [moy(parRegion.bras), moy(parRegion.cuisse), moy(parRegion.thorax)].map(x => x.toFixed(4)));
  assert.ok(Math.max(...parRegion.bras, ...parRegion.cuisse, ...parRegion.thorax, ...parRegion.dos) < 0.05, 'sans excès');
  // Sans carrure (force nulle), le modèle revient tel quel.
  const nul = etoffer(brut, pas, E.boite, E.squelette, 0, null);
  let ecart = 0; for (let v = 0; v < E.sommets; v += 11) { const p0 = lire(brut, E.boite, v), p1 = lire(nul.sommets, nul.boite, v); ecart = Math.max(ecart, Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])); }
  assert.ok(ecart < 0.0002, 'force nulle : rien ne change (' + ecart + ')');

  // Le mélange des articulations, tel que le solveur le mesure (et que le moteur le dessine).
  const { pathToFileURL } = require('url'), dossier = path.join(RACINE, 'outils', 'atlas', 'mouvements');
  const { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } = await import(pathToFileURL(path.join(dossier, 'silhouettes.mjs')).href);
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS), C = M.TEINTES.sombre;
  const corps = new M.Corps(atlas.E.squelette, atlas.peau);
  const d = M.definir('developpe epaules barre', corps, C);
  corps.poser(M.poseA(d, 0, 1));
  const pe = corps.peau(null), m = corps.matrices(), S = corps.S;
  let k = 0, pireSeul = 0, nSeul = 0, pireEpaule = Infinity;
  const ep = corps.monde('humerus.G'), ep0 = corps.tete[corps.i['humerus.G']];
  corps.peauPosee(null, (x, y, z) => {
    const cote = k >= pe.n ? 1 : 0, v = k % pe.n; k++;
    const X = cote ? -pe.P[v * 3] : pe.P[v * 3], Y = pe.P[v * 3 + 1], Z = pe.P[v * 3 + 2];
    let seul = -1; for (let q = 0; q < 4; q++) if (pe.W[v * 4 + q] > 0.999) seul = cote ? S[pe.J[v * 4 + q]].jumeau : pe.J[v * 4 + q];
    if (seul >= 0) { const o = seul * 12; nSeul++; pireSeul = Math.max(pireSeul, Math.hypot(x - (m[o] * X + m[o + 1] * Y + m[o + 2] * Z + m[o + 3]), y - (m[o + 4] * X + m[o + 5] * Y + m[o + 6] * Z + m[o + 7]), z - (m[o + 8] * X + m[o + 9] * Y + m[o + 10] * Z + m[o + 11]))); }
    // Autour de l'épaule gauche (à 4–7 cm de l'articulation au repos) : bras levé, la chair reste à distance de l'articulation.
    if (!cote) { const r0 = Math.hypot(X - ep0.x, Y - ep0.y, Z - ep0.z); if (r0 > 0.04 && r0 < 0.07) pireEpaule = Math.min(pireEpaule, Math.hypot(x - ep.x, y - ep.y, z - ep.z) / r0); }
  });
  assert.ok(nSeul > 5000 && pireSeul < 1e-4, 'un sommet tenu par un seul os suit cet os exactement : ' + pireSeul);
  assert.ok(pireEpaule > 0.55, "bras levé, l'épaule garde son volume (rapport de distance le plus faible : " + pireEpaule.toFixed(2) + ')');

  // Le matériel : un développé couché a ses supports de barre ; au tirage vertical, la pile de poids suit le câble.
  const formesDe = (spec, u) => { const def = M.definir(spec, corps, C); return { def, formes: M.materielDe(def, corps.poser(M.poseA(def, 0, u)), u, C, {}) }; };
  const connues = new Set(['cylindre', 'boite', 'sphere', 'tore', 'arc', 'hexa']);
  const couche = formesDe('developpe barre', 0);
  assert.ok(couche.formes.every(x => connues.has(x.forme)), 'des formes que le moteur sait dessiner');
  assert.ok(couche.formes.some(x => x.forme === 'hexa') === false && formesDe('curl hal', 0).formes.some(x => x.forme === 'hexa'), 'les haltères ont des têtes à pans');
  assert.ok(couche.formes.filter(x => x.forme === 'boite' && x.p[1] > 0.9 && Math.abs(Math.abs(x.p[0]) - 0.53) < 0.01).length >= 4, 'deux montants et leurs crochets derrière la tête');
  const haut = formesDe('tirage', 0), basT = formesDe('tirage', 1);
  const levees = t => t.formes.filter(x => x.leve).map(x => x.p[1]);
  assert.ok(levees(haut).length >= 5 && haut.def.cable0 > 0, 'la pile a des plaques mobiles');
  const dy = levees(basT).map((y, i) => y - levees(haut)[i]);
  assert.ok(dy.every(x => Math.abs(x - dy[0]) < 1e-6) && dy[0] > 0.25, 'barre tirée, la pile est montée de ' + dy[0].toFixed(2) + ' m');
  // Une machine à leviers reçoit son bâti et sa pile.
  assert.ok(formesDe('developpe machine assis', 0.5).formes.some(x => x.leve), 'la machine à développer a sa pile de poids');
});

test('atlas 3D : sans WebGL 2, aucun accès ; avec, la fenêtre s\'ouvre, anime un exercice et libère tout à la fermeture', async () => {
  // Sans WebGL 2 : pas de bouton, et l'ouverture forcée prévient sans rien casser.
  await avecAppli({}, async ({ page, dialogues }) => {
    const r = await page.evaluate(async () => {
      const sauve = window.WebGL2RenderingContext; window.WebGL2RenderingContext = undefined;
      const bouton = boutonAtlasHTML('semaine', null, '3D');
      await ouvrirAtlas('semaine');
      const ouverte = document.getElementById('atlas-modal').classList.contains('show');
      window.WebGL2RenderingContext = sauve;
      return { bouton, ouverte, avec: /ouvrirAtlas\(&quot;exercice&quot;, \{ exercice: &quot;e1&quot; \}\)/.test(boutonAtlasHTML('exercice', 'e1', 'Voir')) };
    });
    assert.equal(r.bouton, '');
    assert.equal(r.ouverte, false);
    assert.ok(r.avec);
    assert.ok(dialogues.some(d => /atlas en 3D demande un appareil plus récent/.test(d)));
  });
  // Avec WebGL 2 (rendu logiciel) : l'appli servie comme sur le site, l'atlas chargé à la demande.
  const nav = await lancerNavigateur(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);
  try {
    const { page, erreurs, ctx } = await ouvrirAppli(nav, { https: true });
    const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    if (!webgl) { await ctx.close(); return; }   // pas de rendu 3D dans ce navigateur de test : rien à vérifier de plus
    await page.evaluate(HISTORIQUE_ATLAS);
    const pret = () => page.waitForFunction(() => atlasMonte && atlasMonte.atlas.mesures().images > 1, null, { timeout: 120000 });
    await page.evaluate(() => { ouvrirAtlas('semaine'); });
    await pret();
    const a = await page.evaluate(() => ({ scripts: [...document.scripts].map(s => s.getAttribute('src')).filter(s => s && s.startsWith('assets/atlas/')), modes: [...document.querySelectorAll('.atlas-modes button')].map(b => b.textContent),
      actif: document.querySelector('.atlas-modes button[aria-pressed="true"]').textContent, structures: atlasMonte.atlas.structures.length, appels: atlasMonte.atlas.mesures().appelsDeDessin, peau: [atlasMonte.atlas.aPeau, atlasMonte.etat().peau],
      legende: document.querySelectorAll('.atlas-legende span').length, lecture: document.querySelector('.atlas-barre .atlas-rond[aria-label*="mouvement"]').hidden }));
    assert.deepEqual(a.scripts, ['assets/atlas/atlas3d.js'], 'les mouvements ne se chargent que pour un exercice');
    assert.deepEqual(a.modes, ['Semaine', 'Dernière séance', 'Fréquence', 'Progression', 'Équilibre', 'Anatomie']);
    assert.equal(a.actif, 'Semaine');
    // Tout le corps en 5 appels de dessin (sol, muscles et voiles des deux côtés), 3 de plus pour la peau partielle.
    assert.ok(a.structures > 170 && a.appels <= 8 && a.legende === 5 && a.lecture, JSON.stringify([a.structures, a.appels, a.legende, a.lecture]));
    // Chaque image ne soumet à la carte graphique que ce qui se voit : le modèle une fois par côté, les seuls triangles
    // du voile (et non tout le modèle une seconde fois), et de la peau les seuls triangles de la tête, des mains et des
    // pieds. Le décompte attendu est refait ici d'après les fichiers.
    const soumis = await page.evaluate(() => { const m = atlasMonte.atlas.mesures(); return [m.trianglesSoumis, m.triangles]; });
    const enTete = f => { const b = fs.readFileSync(path.join(__dirname, '..', 'assets', 'atlas', f)), lg = b.readUInt32LE(8); return { b, debut: 12 + lg, e: JSON.parse(b.subarray(12, 12 + lg).toString('utf8')) }; };
    const modele = enTete('atlas.bin'), peauF = enTete('atlas-peau.bin'), ep = peauF.e;
    const voiles = modele.e.structures.filter(x => x.type === 'aponevrose').reduce((t, x) => t + x.nbIndices / 3, 0);
    const debutIndices = peauF.debut + ep.sommets * ep.octetsParSommet, gardes = [0, 0];
    for (let t = 0; t < ep.trianglesPairs + ep.trianglesImpairs; t++) {
      const sommet = ep.indicesSur === 32 ? peauF.b.readUInt32LE(debutIndices + t * 12) : peauF.b.readUInt16LE(debutIndices + t * 6);
      if (peauF.b[peauF.debut + sommet * ep.octetsParSommet + 10] !== 0) gardes[t < ep.trianglesPairs ? 0 : 1]++;
    }
    // (La tête, les mains et les pieds sont finement maillés : ils font plus de la moitié des triangles de la peau,
    // mais une petite part de sa surface ; ce qui n'est plus soumis, c'est toute la peau du tronc et des membres.)
    assert.ok(voiles > 0 && gardes[0] > 5000 && gardes[0] < ep.trianglesPairs - 5000, 'la peau gardée laisse de côté celle du tronc et des membres : ' + gardes + ' sur ' + [ep.trianglesPairs, ep.trianglesImpairs]);
    assert.deepEqual(soumis, [2 * modele.e.triangles + 2 * voiles + 2 * gardes[0] + gardes[1], modele.e.triangles]);
    assert.deepEqual(a.peau, [true, 1], 'sur une carte, la peau couvre la tête, les mains et les pieds');
    // Cette peau a la teinte du corps (un gris entre celui des muscles au repos et celui des tendons, sans rien de la
    // chair) ; en mode « Anatomie », aux couleurs naturelles, elle garde sa teinte naturelle. Vérifié sur les réglages
    // du moteur, puis sur l'image elle-même : la couleur du nez, vu de près.
    const nez = () => page.evaluate(() => new Promise(fin => {
      const at = atlasMonte.atlas, toile = at.toile, avant = at.surImage;
      at.placer({ az: 0, el: 0, cible: at.structures.find(s => s.id === 'nasal').centre, dist: 0.9 });
      at.surImage = cam => {
        if (avant) avant(cam);
        const c = document.createElement('canvas'); c.width = toile.width; c.height = toile.height;
        const x = c.getContext('2d'); x.drawImage(toile, 0, 0);
        const d = x.getImageData(Math.round(toile.width / 2) - 4, Math.round(toile.height / 2) - 4, 9, 9).data, m = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k] / 81;
        at.surImage = avant;
        fin({ px: m.map(Math.round), apparence: at.apparence(), neutres: neutresAtlas() });
      };
      at.redessiner();
    }));
    const surCarte = await nez();
    assert.deepEqual([surCarte.apparence.chair, surCarte.apparence.teint], [0, surCarte.neutres.peau], 'sur une carte, la peau prend la teinte du corps');
    assert.ok(/^#[0-9a-f]{6}$/.test(surCarte.neutres.peau) && surCarte.neutres.peau !== surCarte.neutres.muscle, 'une teinte de peau entre les muscles et les tendons : ' + surCarte.neutres.peau);
    assert.ok(Math.max(...surCarte.px) - Math.min(...surCarte.px) < 26 && Math.min(...surCarte.px) > 40, 'le visage est gris comme le corps : ' + surCarte.px);
    await page.evaluate(() => atlasMonte.choisirMode('anatomie'));
    const naturelle = await nez();
    assert.equal(naturelle.apparence.chair, 1, 'en mode Anatomie, la peau est vivante');
    assert.ok(naturelle.px[0] - naturelle.px[2] > 35, 'en mode Anatomie, le visage a une teinte de chair : ' + naturelle.px);
    await page.evaluate(() => { atlasMonte.choisirMode('semaine'); atlasMonte.atlas.reinitialiser(0); });
    assert.equal(await page.evaluate(() => atlasMonte.atlas.apparence().chair), 0);
    // Le thème d'une carte, côté moteur : sans indication, une peau naturelle ; avec une teinte, les poils la suivent.
    assert.deepEqual(await page.evaluate(() => { const n = AnqaAtlas.themeDeCarte({}), g = AnqaAtlas.themeDeCarte({ peau: '#808080' }); return [n.chair, n.teint, g.chair, g.teint, g.poil]; }), [1, '#c89b80', 0, '#808080', [64, 64, 64]]);
    // Toucher un muscle pour de vrai (un clic au cœur de sa tache à l'écran) : sa fiche dit la zone de la semaine.
    await page.waitForFunction(() => !atlasMonte.atlas.mesures().enCours, null, { timeout: 60000 });
    const pt = await page.evaluate(() => { const c = atlasMonte.atlas.carteReperage(3)['pectoral_sternal|gauche'], r = atlasMonte.atlas.toile.getBoundingClientRect(); return { x: r.left + c.x, y: r.top + c.y, marge: c.marge }; });
    assert.ok(pt.marge > 6, 'le grand pectoral offre une vraie surface à toucher');
    await page.mouse.click(pt.x, pt.y);
    await page.waitForFunction(() => document.querySelector('.atlas-fiche[data-ouverte]'), null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => atlasMonte.etat().choisi), 'pectoral_sternal');
    const fiche = await page.evaluate(() => document.querySelector('.atlas-fiche[data-ouverte]').textContent.replace(/\s+/g, ' '));
    assert.match(fiche, /Grand pectoral · faisceau sternal.*Pars sternocostalis.*Thorax.*Couche 1.*Pectoraux.*4 séries/);
    // Fermer libère le moteur 3D (plus de toile, plus de contexte graphique).
    await page.click('#atlas-modal .close-modal');
    assert.deepEqual(await page.evaluate(() => [atlasMonte, document.querySelectorAll('#atlas-scene canvas').length, document.getElementById('atlas-modal').classList.contains('show')]), [null, 0, false]);
    // Depuis un exercice animé : le corps exécute le mouvement, ses muscles en couleur.
    await page.evaluate(() => { ouvrirAtlas('exercice', { exercice: 'e265' }); });
    await pret();
    const e = await page.evaluate(() => ({ titre: document.getElementById('titre-atlas').textContent, mode: atlasMonte.etat().mode, anim: !!atlasMonte.animation(), scripts: [...document.scripts].map(s => s.getAttribute('src')).filter(s => s && s.startsWith('assets/atlas/')).length,
      pose: atlasMonte.animation().corps.monde('bassin').y < 0.93, colores: Object.keys(carteAtlas('exercice', atlasMonte.atlas.structures).couleurs).length }));
    assert.deepEqual([e.titre, e.mode, e.anim, e.scripts], ['Squat avec barre', 'exercice', true, 2]);
    // Une seule apparence, pendant un exercice comme sur une carte : le corps écorché, la peau gardée sur la tête, les
    // mains et les pieds. Plus de bouton « Peau », plus de réglage retenu ; en profondeur, la peau s'efface.
    const peau = await page.evaluate(() => {
      const r = [atlasMonte.etat().peau, document.querySelectorAll('.atlas-peau').length, localStorage.getItem('anqa-atlas-peau')];
      atlasMonte.couche(2); r.push(atlasMonte.etat().peau); atlasMonte.couche(1); r.push(atlasMonte.etat().peau);
      return r;
    });
    assert.deepEqual(peau, [1, 0, null, 0, 1]);
    assert.ok(e.pose, 'le bassin est descendu : le corps est en plein squat');
    assert.ok(e.colores > 10);
    // Un autre exercice de la bibliothèque, d'une autre famille de mouvements : animé lui aussi, rien à signaler.
    await page.evaluate(() => { fermerAtlas(); ouvrirAtlas('exercice', { exercice: 'e39' }); });
    await pret();
    const autre = await page.evaluate(() => ({ spec: atlasMonte.animation() && atlasMonte.animation().definition.spec, note: document.querySelector('.atlas-note').textContent }));
    assert.ok(autre.spec && !/^squat/.test(autre.spec), 'un mouvement, et pas celui du squat : ' + autre.spec);
    assert.equal(autre.note, '');
    // Un exercice créé par l'utilisateur n'a pas de mouvement : ses muscles, corps au repos, et c'est dit.
    await page.evaluate(() => { fermerAtlas(); musculationExosPerso.push({ id: 'exercice-maison', nom: 'Exercice maison', groupe: 'biceps', secondaires: [], materiel: 'haltere' }); ouvrirAtlas('exercice', { exercice: 'exercice-maison' }); });
    await pret();
    assert.deepEqual(await page.evaluate(() => [!!atlasMonte.animation(), document.querySelector('.atlas-note').textContent]), [false, 'Pas de mouvement animé pour cet exercice : ses muscles, corps au repos.']);
    await page.evaluate(() => fermerAtlas());
    assert.deepEqual(erreurs, [], 'erreurs JavaScript dans la page');
    await ctx.close();
  } finally { await nav.close(); }
});
