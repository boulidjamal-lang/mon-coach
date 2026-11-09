/* Captures de l'app iPhone en mode « app iOS » (html.app-ios, faux pont
   natif), depuis Chromium : clair et sombre, iPhone 390 et 430 pt, chaque
   écran et quelques états (feuille ouverte, séance en cours, titre replié,
   menu contextuel). Les données viennent du remplisseur de démonstration de
   l'app iOS (dépôt Anqa, ios-app/scripts/capture-demo.js).
   Ce ne sont pas les polices ni le verre d'iOS : ces images valident la mise
   en page, le simulateur (workflow « App iOS ») valide le rendu.
   Usage : node scripts/captures-ios.js [dossier de sortie] [--seulement repas,seance]
   Variable ANQA_DEMO : chemin du capture-demo.js (par défaut ../muscu/ios-app/scripts). */
const path = require('path');
const fs = require('fs');
const { lancerNavigateur, ouvrirAppli, RACINE } = require('../tests/outils.js');

const SORTIE = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : path.join(RACINE, 'captures-ios');
const seulement = (process.argv.find(a => a.startsWith('--seulement=')) || '').split('=')[1];
const DEMO = process.env.ANQA_DEMO || path.join(RACINE, '..', 'muscu', 'ios-app', 'scripts', 'capture-demo.js');
const TAILLES = [{ nom: '390', viewport: { width: 390, height: 844 } }, { nom: '430', viewport: { width: 430, height: 932 } }];
const ECRANS = ['repas', 'seance', 'cardio', 'encours', 'stats', 'reglages', 'feuille', 'accessoire', 'replie', 'menu'];

async function preparerDemo(page) {
  await page.evaluate(() => { window.__captureManuel = true; });
  if (fs.existsSync(DEMO)) {
    await page.addScriptTag({ path: DEMO });
    await page.evaluate(() => { window.__demo.remplirDemo(); });
  } else console.warn('capture-demo.js introuvable (' + DEMO + ') : captures sans données de démonstration');
}

async function montrer(page, ecran) {
  await page.evaluate(async ecran => {
    const pause = ms => new Promise(ok => setTimeout(ok, ms));
    if (window.__demo) window.__demo.fermerFenetres();
    fermerMenuContextuel();
    window.scrollTo(0, 0);
    if (ecran === 'feuille') { allerA('repas'); renderApp(); ouvrirFeuilleRepas('lunch'); return; }
    if (ecran === 'cardio') { allerA('seance'); choisirModeSeance('cardio'); renderApp(); return; }
    if (ecran === 'encours') { allerA('seance'); choisirModeSeance('muscu'); if (musculationProgrammes[0]) await demarrerSeance(musculationProgrammes[0].id); renderApp(); return; }
    if (ecran === 'accessoire') { allerA('seance'); if (musculationProgrammes[0]) await demarrerSeance(musculationProgrammes[0].id); allerA('repas'); renderApp(); return; }
    if (ecran === 'replie') { allerA('seance'); renderApp(); await pause(100); window.scrollTo(0, 420); majTitreReplie(420); return; }
    if (ecran === 'menu') {
      allerA('repas'); renderApp(); await pause(100);
      const ligne = document.querySelector('#meals-container .food-item-ligne');
      if (ligne) { const r = ligne.getBoundingClientRect(); ligne.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 40, clientY: r.top + 20, pointerId: 1 })); await pause(560); }
      return;
    }
    if (ecran === 'seance') choisirModeSeance('muscu');
    allerA(ecran); renderApp();
  }, ecran);
  await page.waitForTimeout(700);
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const nav = await lancerNavigateur();
  for (const theme of ['light', 'dark']) {
    for (const taille of TAILLES) {
      const { page, ctx } = await ouvrirAppli(nav, { natif: true, theme, viewport: taille.viewport, echelle: 2 });
      await preparerDemo(page);
      await page.evaluate(theme => appliquerTheme(theme), theme);
      for (const ecran of ECRANS) {
        if (seulement && !seulement.split(',').includes(ecran)) continue;
        try {
          await montrer(page, ecran);
          await page.screenshot({ path: path.join(SORTIE, `${theme}-${taille.nom}-${ecran}.png`) });
        } catch (e) { console.warn(`${theme} ${taille.nom} ${ecran} : ${e.message}`); }
      }
      await ctx.close();
    }
  }
  await nav.close();
  console.log('captures dans ' + SORTIE);
})();
