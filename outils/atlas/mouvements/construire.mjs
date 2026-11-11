// Assemble les sources des mouvements (src/*.js, dans l'ordre) et la table des exercices en un seul fichier :
// atlas-mouvements.js. Usage : node construire.mjs [fichier de sortie]
import fs from 'fs';
import path from 'path';
const ici = path.dirname(new URL(import.meta.url).pathname);
// Dans le dépôt, le fichier va dans assets/atlas ; dans un dossier de travail, à côté de la page d'essai.
const depot = path.join(ici, '..', '..', '..', 'assets', 'atlas');
const sortie = process.argv[2] || path.join(fs.existsSync(path.join(depot, 'atlas.bin')) ? depot : path.join(ici, '..', 'appli'), 'atlas-mouvements.js');
const entete = `/* =====================================================================
   MOUVEMENTS DE L'ATLAS — le corps anatomique exécute les exercices.
   Chaque exercice de la bibliothèque est relié à un mouvement écrit en
   quelques mots (« curl hal assis alt ») ; une famille de mouvements en
   fait deux poses (départ, arrivée) : bassin, colonne, mains et pieds par
   cibles ou par angles anatomiques. Un petit solveur en déduit la rotation
   de chaque articulation ; le moteur de l'atlas (atlas3d.js) déforme alors
   os et muscles en conséquence, et dessine le matériel.
   Fichier assemblé par outils/atlas/mouvements/construire.mjs à partir de
   src/*.js et de la table des exercices : ne pas le modifier à la main.
   Dépend de atlas3d.js ; ne se charge que pour montrer un exercice.
   ===================================================================== */
(function (racine) {
  'use strict';
`;
const parts = fs.readdirSync(path.join(ici, 'src')).filter(f => f.endsWith('.js')).sort();
let corps = '';
for (const f of parts) corps += fs.readFileSync(path.join(ici, 'src', f), 'utf8').replace(/\s+$/, '') + '\n';
// La table : « spec : identifiants », lue dans table.txt (une ligne par exercice : identifiant | spec | nom).
const lignes = fs.existsSync(path.join(ici, 'table.txt')) ? fs.readFileSync(path.join(ici, 'table.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')) : [];
const parSpec = {};
for (const l of lignes) { const [id, spec] = l.split('|').map(x => x.trim()); if (!spec || spec === '?') continue; (parSpec[spec] = parSpec[spec] || []).push(id); }
const table = '\n  /* ---------- La table : chaque mouvement et les exercices de la bibliothèque qui l\'exécutent ---------- */\n  const EXERCICES = ' + JSON.stringify(parSpec).replace(/],"/g, '],\n    "').replace(/^{/, '{\n    ').replace(/}$/, '\n  }') + ';\n';
// La table doit être définie avant l'animation (90-…).
const i90 = corps.indexOf('\n  /* ---------- Animation d\'un exercice sur l\'atlas');
const tout = entete + corps.slice(0, i90) + table + corps.slice(i90) + "})(typeof window !== 'undefined' ? window : globalThis);\n";
fs.writeFileSync(sortie, tout);
console.log('écrit', sortie, Math.round(tout.length / 1000) + ' ko,', Object.keys(parSpec).length, 'mouvements,', lignes.filter(l => l.split('|')[1] && l.split('|')[1].trim() !== '?').length, 'exercices reliés');
