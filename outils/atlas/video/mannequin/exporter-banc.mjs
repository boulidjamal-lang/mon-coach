// Banc d'essai du bras : le corps debout, les deux bras posés par leurs angles (plan, élévation, rotation, coude,
// pronation), une image par ligne de la série. Sert à juger les déformations du mannequin hors de tout exercice.
// node exporter-banc.mjs <dépôt> <sortie.json> <série> [vue "az,el"]
//   série : "coude", "pronation", "pronation90", "epaule-cote", "epaule-avant", "rotation", ou une liste
//           "plan,elev,rot,coude,pron;plan,elev,rot,coude,pron;…"
import fs from 'fs';
import path from 'path';
const [DEPOT, sortie, serie = 'coude', vueArg] = process.argv.slice(2);
const { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } = await import(path.join(DEPOT, 'outils', 'atlas', 'mouvements', 'silhouettes.mjs'));
process.env.CARRURE = '1';
const A = chargerAtlas(FICHIER_ATLAS), E = A.E, MV = chargerMouvements(FICHIER_MOUVEMENTS);
const corps = new MV.Corps(E.squelette, A.peau);
const d = MV.definir('curl hal', corps, MV.TEINTES.sombre);
const base = MV.poseDe(d, MV.avancee(d, 0));
const SERIES = {
  // coude : bras le long du corps, supination, le coude se plie
  coude: [0, 30, 60, 90, 120, 145].map(c => [90, 8, 0, c, 0]),
  // pronation : bras un peu levé devant, coude presque tendu, l'avant-bras tourne
  pronation: [0, 45, 90, 135, 180].map(p => [20, 35, 0, 15, p]),
  // pronation, coude à angle droit
  pronation90: [0, 45, 90, 135, 180].map(p => [60, 12, 0, 90, p]),
  // épaule : le bras monte sur le côté, puis devant
  'epaule-cote': [0, 45, 90, 135, 170].map(e => [90, e, 0, 10, 90]),
  'epaule-avant': [0, 45, 90, 135, 170].map(e => [0, e, 0, 10, 90]),
  // rotation de l'humérus, bras à l'horizontale sur le côté, coude à angle droit
  rotation: [-60, -30, 0, 45, 90].map(r => [90, 90, r, 90, 90]),
};
const lignes = SERIES[serie] || serie.split(';').map(l => l.split(',').map(Number));
const images = [];
for (const [plan, elev, rot, coude, pron] of lignes) {
  const pose = Object.assign({}, base, { bras: {} });
  for (const k of ['G', 'D']) pose.bras[k] = { plan, elev, rot, coude, pron, doigts: 'detendu' };
  corps.poser(pose);
  const pw = corps.pw.map(p => [p.x, p.y, p.z]);
  const noms_ = E.squelette.map(a => a.nom);
  const cadre = process.env.CADRE || (serie.startsWith("epaule") || serie === "rotation" ? "epaule" : "bras");
  const g_ = (cadre === 'epaule' ? ['clavicule.G', 'humerus.G', 'ulna.G', 'cou2'] : cadre === 'coude' ? ['ulna.G'] : ['humerus.G', 'ulna.G', 'radius.G', 'main.G', 'doigt3-3.G', 'doigt1-3.G']).map(n => noms_.indexOf(n)).filter(i => i >= 0);
  const mg = cadre === 'coude' ? 0.14 : cadre === 'epaule' ? 0.11 : 0.085;
  const b0 = [Infinity, Infinity, Infinity], b1 = [-Infinity, -Infinity, -Infinity];
  for (const i of g_) for (let k = 0; k < 3; k++) { b0[k] = Math.min(b0[k], pw[i][k] - mg); b1[k] = Math.max(b1[k], pw[i][k] + mg); }
  images.push({ u: 0, angles: { plan, elev, rot, coude, pron }, dq: Array.from(corps.quaternionsDuaux()), formes: [], pw, boite: { min: b0, max: b1 } });
}
// Cadrage : le bras gauche et l'épaule, sur toute la série.
const noms = E.squelette.map(a => a.nom), garde = ['clavicule.G', 'humerus.G', 'ulna.G', 'radius.G', 'main.G', 'doigt3-3.G'].map(n => noms.indexOf(n)).filter(i => i >= 0);
const mini = [Infinity, Infinity, Infinity], maxi = [-Infinity, -Infinity, -Infinity];
for (const im of images) for (const i of garde) for (let k = 0; k < 3; k++) { mini[k] = Math.min(mini[k], im.pw[i][k] - 0.09); maxi[k] = Math.max(maxi[k], im.pw[i][k] + 0.09); }
const [az, el] = (vueArg || '35,8').split(',').map(Number);
fs.writeFileSync(sortie, JSON.stringify({ quoi: 'banc-' + serie, spec: 'banc ' + serie, nom: 'Banc ' + serie, periode: images.length / 25, ips: 25, vue: { az, el }, boite: { min: mini, max: maxi }, articulations: noms, images }));
console.log(sortie, ':', images.length, 'poses ; boîte', mini.map(x => x.toFixed(2)).join(' '), '→', maxi.map(x => x.toFixed(2)).join(' '));
