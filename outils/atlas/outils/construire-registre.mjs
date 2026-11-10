// Construit le registre central des muscles (donnees/registre.json) à partir de Z-Anatomy, de la table officielle
// des noms (TA2) et de la table d'appartenance d'Anqā (registre-source.mjs).
import fs from 'fs';
import { lireBin, genre } from './commun.mjs';
import { APP, NOMS, EXCLUS, CONTEXTE, OFFICIELS, regionDe, slug, nomOfficiel, NOMS_REGIONS } from './registre-source.mjs';
const TA = JSON.parse(fs.readFileSync('rapport/ta2-muscles.json', 'utf8'));
const E = lireBin(process.argv[2] || '/home/user/z-anatomy/blend/muscles.bin');
const base = n => n.replace(/\.(l|r)$/, '');
const noms = new Set(E.map(e => e.nom));
const FIGES = fs.existsSync('donnees/identifiants.json') ? JSON.parse(fs.readFileSync('donnees/identifiants.json', 'utf8')) : {};
const R = [];
for (const e of E) {
  if (e.nom.endsWith('.r')) continue;
  const b = base(e.nom);
  if (CONTEXTE[b]) { const [id, nom, la, en, region, type] = CONTEXTE[b]; let x0 = 1e9; for (let i = 0; i < e.P.length; i += 3) x0 = Math.min(x0, e.P[i]); R.push({ id, nom, latin: la, anglais: en, ta2: null, type, region, source: b, pair: e.nom.endsWith('.l') || x0 > 0.005, app: [] }); continue; }
  if (genre(e) !== 'muscle' || (EXCLUS.test(b) && !APP[b])) continue;
  const ta = TA[b] || TA[b.replace(/^\(|\)$/g, '')] || {};
  const off = OFFICIELS[b] || {};
  const nom = APP[b] ? APP[b][1] : NOMS[b] || (ta.fr ? nomOfficiel(ta.fr) : null);
  if (!nom) throw new Error('sans nom : ' + b);
  let xmin = 1e9; for (let i = 0; i < e.P.length; i += 3) xmin = Math.min(xmin, e.P[i]);
  const pair = e.nom.endsWith('.l') || xmin > 0.005; // tout entier d'un seul côté : il a un jumeau en miroir
  R.push({ id: FIGES[b] || (APP[b] ? APP[b][0] : slug(nom)), nom, latin: off.la || ta.la || null, anglais: off.en || ta.en || b.replace(/^\(|\)$/g, ''), ta2: ta.id || null, type: 'muscle', region: regionDe(b), source: b, pair, app: APP[b] ? APP[b][2] : [] });
}
const ids = R.map(r => r.id); const dbl = ids.filter((x, i) => ids.indexOf(x) !== i); if (dbl.length) throw new Error('identifiants en double : ' + dbl);
const sansRegion = R.filter(r => !r.region); if (sansRegion.length) throw new Error('sans région : ' + sansRegion.map(r => r.source));
const ordre = Object.keys(NOMS_REGIONS);
R.sort((a, b) => ordre.indexOf(a.region) - ordre.indexOf(b.region) || a.nom.localeCompare(b.nom, 'fr'));
fs.mkdirSync('donnees', { recursive: true });
fs.writeFileSync('donnees/identifiants.json', JSON.stringify(Object.fromEntries(R.map(r => [r.source, r.id]).sort((a, b) => a[0].localeCompare(b[0]))), null, 1));
fs.writeFileSync('donnees/registre.json', JSON.stringify({ regions: NOMS_REGIONS, muscles: R }, null, 1));
console.log(R.length, 'entrées |', R.filter(r => r.app.length).length, 'reliées à l entraînement |', R.filter(r => !r.pair).length, 'sans paire | sans latin :', R.filter(r => !r.latin).map(r => r.source));
if (process.argv.includes('--liste')) for (const r of R) console.log(r.region.padEnd(10), r.id.padEnd(44), '|', r.nom.padEnd(50), '|', r.latin, '|', r.app.map(a => a.groupe + (a.faisceau ? '/' + a.faisceau : '') + ':' + a.role[0]).join(' '));
