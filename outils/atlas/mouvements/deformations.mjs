// Les muscles se déforment-ils ? Chaque mouvement est posé à plusieurs instants ; pour chaque point de la surface des
// muscles (couches 1 et 2, un sommet sur PAS, des deux côtés), on mesure l'épaisseur de chair au-dessus de l'os — la
// distance au point d'os le plus proche, os posés eux aussi — et on la compare à ce qu'elle est au repos.
//   gonflement : la chair s'éloigne de l'os (un muscle qui ballonne, une fesse qui pend sous la cuisse) ;
//   creux      : la chair s'écrase sur l'os ou passe dessous (pli qui s'effondre, torsion en papillote, os qui perce).
// Le relevé donne, par partie du corps, les pires écarts ; il sert à trouver quelles articulations et quels exercices
// revoir, puis à vérifier qu'une correction du moteur améliore sans rien casser.
// Usage : node deformations.mjs "<spec>" …   |   --table [motif]   ;   --json fichier ; SEUIL=0.02 (m)
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const ici = path.dirname(new URL(import.meta.url).pathname);
const PAS = +(process.env.PAS || 3), CASE = 0.04, LOIN = 0.16;

const partie = nom => {
  const b = nom.replace(/\.[GD]$/, '');
  if (/^doigt/.test(b) || b === 'main') return 'main';
  if (b === 'pied' || b === 'orteils') return 'pied';
  if (b === 'ulna' || b === 'radius') return 'avant-bras';
  if (b === 'humerus') return 'bras';
  if (b === 'clavicule') return 'épaule';
  if (b === 'femur') return 'cuisse';
  if (b === 'tibia') return 'jambe';
  if (b === 'tete' || /^cou/.test(b)) return 'cou';
  if (/^L\d/.test(b)) return 'ventre';
  return b;
};
/* Une grille de cases pour chercher le point d'os le plus proche. */
class Grille {
  constructor() { this.cases = new Map(); }
  vider() { this.cases.clear(); }
  ajouter(X, n) {
    for (let i = 0; i < n; i++) {
      const k = (Math.floor(X[i * 3] / CASE) + 512) + (Math.floor(X[i * 3 + 1] / CASE) + 512) * 1024 + (Math.floor(X[i * 3 + 2] / CASE) + 512) * 1048576;
      let l = this.cases.get(k); if (!l) { l = []; this.cases.set(k, l); }
      l.push(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]);
    }
  }
  /* Distance au point le plus proche (plafonnée à LOIN). */
  plusProche(x, y, z) {
    const cx = Math.floor(x / CASE) + 512, cy = Math.floor(y / CASE) + 512, cz = Math.floor(z / CASE) + 512;
    let d2 = LOIN * LOIN;
    for (let r = 1; r <= 4; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r && r > 1) continue;   // la couronne seulement, après le premier tour
        const l = this.cases.get((cx + i) + (cy + j) * 1024 + (cz + k) * 1048576); if (!l) continue;
        for (let o = 0; o < l.length; o += 3) { const dx = l[o] - x, dy = l[o + 1] - y, dz = l[o + 2] - z, e = dx * dx + dy * dy + dz * dz; if (e < d2) d2 = e; }
      }
      if (d2 <= (r * CASE) * (r * CASE)) break;   // rien de plus proche ne peut se trouver plus loin
    }
    return Math.sqrt(d2);
  }
}
export function preparer(atlas, corps) {
  const E = atlas.E, tout = atlas.points(1), nbS = E.structures.length;
  const choisir = garde => {
    const idx = []; for (let v = 0; v < tout.n; v++) if (garde(v)) idx.push(v);
    const n = idx.length, e = { n, P: new Float32Array(n * 3), J: new Uint8Array(n * 4), W: new Float32Array(n * 4), C: new Float32Array(n), structure: new Uint8Array(n) };
    idx.forEach((v, i) => { for (let k = 0; k < 3; k++) e.P[i * 3 + k] = tout.P[v * 3 + k]; for (let k = 0; k < 4; k++) { e.J[i * 4 + k] = tout.J[v * 4 + k]; e.W[i * 4 + k] = tout.W[v * 4 + k]; } e.C[i] = tout.C[v]; e.structure[i] = tout.structure[v]; });
    return e;
  };
  // Les os : un sommet sur deux. La chair : la surface des muscles des couches 1 et 2, un sommet sur PAS — hors tête,
  // mains et pieds (petits muscles collés à l'os, que la peau recouvre dans l'appli).
  const os = choisir(v => tout.structure[v] >= nbS && v % 2 === 0);
  const chair = choisir(v => tout.structure[v] < nbS && E.structures[tout.structure[v]].couche <= 2 && !['tete', 'main', 'pied'].includes(E.structures[tout.structure[v]].region) && v % PAS === 0);
  corps.peaux.os = os; corps.peaux.chair = chair;
  const parties = [], rang = {}, part = new Uint8Array(chair.n);
  for (let i = 0; i < chair.n; i++) {
    let jm = 0, wm = -1; for (let k = 0; k < 4; k++) if (chair.W[i * 4 + k] > wm) { wm = chair.W[i * 4 + k]; jm = chair.J[i * 4 + k]; }
    const nom = partie(E.squelette[jm].nom); if (rang[nom] == null) { rang[nom] = parties.length; parties.push(nom); } part[i] = rang[nom];
  }
  const K = { E, os, chair, part, parties, XO: new Float32Array(os.n * 6), XC: new Float32Array(chair.n * 6), grille: new Grille(), repos: new Float32Array(chair.n * 2) };
  // L'épaisseur au repos (position anatomique).
  const neutre = { bassin: { pos: corps.L.racine.clone(), rot: new (corps.qw[0].constructor)() }, lombaires: 0, thorax: 0, cou: 0, bras: { G: { plan: 90, elev: 0, rot: 0, coude: 0, pron: 0, doigts: 'plat' }, D: { plan: 90, elev: 0, rot: 0, coude: 0, pron: 0, doigts: 'plat' } }, jambes: { G: { flex: 0, abd: 0, rot: 0, genou: 0, cheville: 0 }, D: { flex: 0, abd: 0, rot: 0, genou: 0, cheville: 0 } } };
  K.neutre = neutre;
  mesurer(corps, K, null, K.repos);
  return K;
}
/* Pose les os et la chair du corps (déjà posé), et range l'épaisseur de chaque point de chair dans `sortie`. */
function mesurer(corps, K, pose, sortie) {
  if (!pose) {
    // Au repos : les sommets tels qu'ils sont dans le modèle (aucune articulation tournée).
    for (let c = 0; c < 2; c++) { for (let i = 0; i < K.os.n; i++) { const o = (c * K.os.n + i) * 3; K.XO[o] = (c ? -1 : 1) * K.os.P[i * 3]; K.XO[o + 1] = K.os.P[i * 3 + 1]; K.XO[o + 2] = K.os.P[i * 3 + 2]; } for (let i = 0; i < K.chair.n; i++) { const o = (c * K.chair.n + i) * 3; K.XC[o] = (c ? -1 : 1) * K.chair.P[i * 3]; K.XC[o + 1] = K.chair.P[i * 3 + 1]; K.XC[o + 2] = K.chair.P[i * 3 + 2]; } }
  } else {
    let i = 0; corps.peauPosee(['os'], (x, y, z) => { K.XO[i++] = x; K.XO[i++] = y; K.XO[i++] = z; });
    i = 0; corps.peauPosee(['chair'], (x, y, z) => { K.XC[i++] = x; K.XC[i++] = y; K.XC[i++] = z; });
  }
  K.grille.vider(); K.grille.ajouter(K.XO, K.os.n * 2);
  for (let j = 0; j < K.chair.n * 2; j++) sortie[j] = K.grille.plusProche(K.XC[j * 3], K.XC[j * 3 + 1], K.XC[j * 3 + 2]);
}
/* Le relevé d'un mouvement : par partie du corps et par côté, le pire gonflement et le pire creux (en mètres, moyenne
   des 12 points les plus touchés pour ne pas juger sur un sommet isolé), l'instant, et le muscle le plus concerné. */
export function releverSpec(M, corps, C, K, spec) {
  let d;
  try { d = M.definir(spec, corps, C); } catch (e) { return { erreur: String(e.message).slice(0, 160) }; }
  const continu = d.rythme === 'continu' || d.rythme === 'boucle';
  const instants = continu ? [0.02, 0.26, 0.5, 0.74, 0.96] : [0, 0.25, 0.5, 0.75, 1];
  const n = K.chair.n, ep = new Float32Array(n * 2), bilan = {};
  for (const u of instants) {
    try { corps.poser(M.poseA(d, 0, u)); } catch (e) { return { erreur: 'u=' + u + ' : ' + String(e.message).slice(0, 160) }; }
    mesurer(corps, K, true, ep);
    const parP = {};
    for (let j = 0; j < 2 * n; j++) {
      const v = j < n ? j : j - n, e0 = K.repos[v], e = ep[j], delta = e - e0;
      if (delta < 0.012 && delta > -0.012) continue;
      const cle = K.parties[K.part[v]] + (j < n ? ' G' : ' D'), p = parP[cle] || (parP[cle] = { plus: [], moins: [] });
      (delta > 0 ? p.plus : p.moins).push([delta, K.chair.structure[v], e0]);
    }
    for (const cle in parP) {
      const b = bilan[cle] || (bilan[cle] = { gonfle: 0, creux: 0 });
      for (const [sens, liste] of [['gonfle', parP[cle].plus], ['creux', parP[cle].moins]]) {
        if (liste.length < 12) continue;
        liste.sort((a, c) => Math.abs(c[0]) - Math.abs(a[0]));
        const tete = liste.slice(0, 12), moy = tete.reduce((t, x) => t + Math.abs(x[0]), 0) / 12;
        if (moy > b[sens]) { const compte = {}; for (const x of tete) compte[x[1]] = (compte[x[1]] || 0) + 1; const st = +Object.keys(compte).sort((a, c) => compte[c] - compte[a])[0];
          b[sens] = moy; b[sens + 'U'] = u; b[sens + 'Muscle'] = K.E.structures[st].id; b[sens + 'Nb'] = liste.length; b[sens + 'Repos'] = tete.reduce((t, x) => t + x[2], 0) / 12; }
      }
    }
  }
  return { bilan };
}
function principal() {
  const args = process.argv.slice(2);
  const iJson = args.indexOf('--json'), json = iJson >= 0 ? args.splice(iJson, 2)[1] : null;
  const SEUIL = +(process.env.SEUIL || 0.02);
  let specs = [], titres = {};
  if (args[0] === '--table') {
    const motif = args[1] ? new RegExp(args[1], 'i') : null;
    for (const l of fs.readFileSync(path.join(ici, 'table.txt'), 'utf8').split('\n')) {
      if (!l.trim() || l.startsWith('#')) continue;
      const [id, spec, nom] = l.split('|').map(x => x.trim());
      if (!spec || spec === '?' || (motif && !motif.test(l))) continue;
      if (!titres[spec]) { titres[spec] = id + ' ' + nom; specs.push(spec); }
    }
  } else specs = args;
  const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS);
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair, K = preparer(atlas, corps);
  const tout = {};
  for (const spec of specs) {
    const r = releverSpec(M, corps, C, K, spec);
    if (r.erreur) { console.log(spec.padEnd(44), '→ erreur :', r.erreur); continue; }
    tout[spec] = r.bilan;
    if (!json || specs.length <= 12) {
      const lignes = [];
      for (const cle in r.bilan) { const b = r.bilan[cle]; if (cle.endsWith(' D') && specs.length > 3) continue;
        if (b.gonfle >= SEUIL) lignes.push(`${cle} gonfle +${(b.gonfle * 100).toFixed(1)} cm (${b.gonfleMuscle}, u=${b.gonfleU}, ${b.gonfleNb} pts, repos ${(b.gonfleRepos * 100).toFixed(1)})`);
        if (b.creux >= SEUIL) lignes.push(`${cle} creux −${(b.creux * 100).toFixed(1)} cm (${b.creuxMuscle}, u=${b.creuxU}, ${b.creuxNb} pts, repos ${(b.creuxRepos * 100).toFixed(1)})`); }
      console.log(spec.padEnd(40), lignes.length ? '\n     ' + lignes.join('\n     ') : '— rien au-dessus du seuil');
    }
  }
  if (json) fs.writeFileSync(json, JSON.stringify({ pas: PAS, bilan: tout, titres }));
  console.log(`${specs.length} mouvements mesurés (${K.chair.n * 2} points de chair, ${K.os.n * 2} points d'os)`);
}
if (process.argv[1] && path.basename(process.argv[1]) === 'deformations.mjs') principal();
