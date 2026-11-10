// Articulation du corps : le squelette de mouvement (59 articulations) et l'attache de chaque sommet à ses os.
//  - Les centres d'articulation viennent du squelette articulé de Z-Biomechanics (même auteur, mêmes coordonnées).
//  - Chaque pièce d'os suit une articulation, d'un bloc.
//  - Chaque sommet de muscle est attaché aux os les plus proches par « diffusion de chaleur » : l'os le plus proche
//    ancre le sommet d'autant plus fort qu'il est près, et l'attache se diffuse le long du muscle. Un muscle reste
//    ainsi fixé à ses os d'origine et de terminaison, et suit l'os qu'il longe entre les deux.
import fs from 'fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const DOIGTS = ['1st', '2nd', '3rd', '4th', '5th'], ORD = ['first', 'second', 'third', 'fourth', 'fifth'];
/* Blender (x, y vers l'arrière, z vers le haut) -> appli (x, y vers le haut, z vers l'avant). */
const versAppli = p => [p[0], p[2], -p[1]];

export function construireSquelette(cheminRig) {
  const rig = JSON.parse(fs.readFileSync(cheminRig, 'utf8')), os = new Map(rig.os.map(o => [o.nom, o]));
  const tete = n => { const o = os.get(n); if (!o) throw new Error('os absent du squelette articulé : ' + n); return versAppli(o.tete); };
  const A = [];   // articulations : { nom, parent (indice), centre, cote }
  const ajouter = (nom, parent, centre, cote = null) => { A.push({ nom, parent: parent == null ? -1 : A.findIndex(a => a.nom === parent), centre: centre.map(x => +x.toFixed(5)), cote }); };
  ajouter('bassin', null, tete('Hips'));
  ['L5', 'L4', 'L3', 'L2', 'L1'].forEach((n, i) => ajouter(n, i ? ['L5', 'L4', 'L3', 'L2'][i - 1] : 'bassin', tete(n)));
  ajouter('thorax', 'L1', tete('T12'));
  ajouter('cou1', 'thorax', tete('C7')); ajouter('cou2', 'cou1', tete('C5')); ajouter('cou3', 'cou2', tete('C2')); ajouter('tete', 'cou3', tete('C1'));
  const axiales = A.length;
  // Côté gauche (le droit est son miroir).
  const G = (nom, parent, centre) => ajouter(nom + '.G', /\.G$/.test(parent) || A.some(a => a.nom === parent) ? parent : parent + '.G', centre, 'G');
  G('clavicule', 'thorax', tete('Clavicle-Z.l'));
  G('humerus', 'clavicule', tete('LeftArm'));
  G('ulna', 'humerus', tete('Ulna.l'));
  G('radius', 'ulna', tete('Radius.l'));
  G('main', 'radius', tete('LeftHand'));
  for (let f = 1; f <= 5; f++) {
    const d = DOIGTS[f - 1];
    const noms = f === 1 ? ['LeftThumb', 'Proximal phalanx of hand-1st finger.l', 'Distal phalanx of hand-1st finger.l']
      : [f === 3 ? 'LeftFingerBase' : `Proximal phalanx of hand-${d} finger.l`, `Middle phalanx of hand-${d} finger.l`, `Distal phalanx of hand-${d} finger.l`];
    noms.forEach((n, k) => G(`doigt${f}-${k + 1}`, k ? `doigt${f}-${k}` : 'main', tete(n)));
  }
  G('femur', 'bassin', tete('LeftUpLeg'));
  G('tibia', 'femur', tete('Knee-Flexion.l'));
  G('pied', 'tibia', tete('LeftFoot'));
  G('orteils', 'pied', tete('LeftToeBase'));
  const parCote = A.length - axiales;
  // Côté droit : mêmes articulations, en miroir.
  for (let i = axiales; i < axiales + parCote; i++) {
    const a = A[i], p = a.parent;
    A.push({ nom: a.nom.replace(/\.G$/, '.D'), parent: p >= axiales ? p + parCote : p, centre: [-a.centre[0], a.centre[1], a.centre[2]], cote: 'D' });
  }
  A.forEach((a, i) => { a.jumeau = a.cote === 'G' ? i + parCote : a.cote === 'D' ? i - parCote : i; });
  return { articulations: A, axiales, parCote };
}

/* L'articulation que suit une pièce d'os (côté gauche ou axe du corps), d'après son nom. */
export function articulationDeLaPiece(nom, centre, S) {
  const i = n => { const k = S.articulations.findIndex(a => a.nom === n); if (k < 0) throw new Error('articulation inconnue : ' + n); return k; };
  const n = nom.replace(/\.(l|r)$/, '');
  let m;
  if (/^(Hip bone|Sacrum|Coccyx)$/.test(n)) return i('bassin');
  if ((m = /^Vertebra L([1-5])$/.exec(n))) return i('L' + m[1]);
  if (/^Vertebra T\d+$/.test(n) || / rib$/.test(n) || /^Costal cartilage/.test(n) || /sternum|Xiphoid/.test(n)) return i('thorax');
  if (/^Vertebra C[67]$/.test(n)) return i('cou1');
  if (/^Vertebra C[345]$/.test(n) || /Hyoid|Thyroid cartilage|Cricoid|Arytenoid|Corniculate/.test(n)) return i('cou2');
  if (/^(Axis \(C2\)|Atlas \(C1\))$/.test(n)) return i('cou3');
  if (/^(Clavicle|Scapula)$/.test(n)) return i('clavicule.G');
  if (n === 'Humerus') return i('humerus.G');
  if (n === 'Ulna') return i('ulna.G');
  if (n === 'Radius') return i('radius.G');
  if ((m = /^(Proximal|Middle|Distal) phalanx of (\w+) finger of hand$/.exec(n))) {
    const f = ORD.indexOf(m[2]) + 1, k = f === 1 ? { Proximal: 2, Distal: 3 }[m[1]] : { Proximal: 1, Middle: 2, Distal: 3 }[m[1]];
    return i(`doigt${f}-${k}.G`);
  }
  if (n === 'First metacarpal bone') return i('doigt1-1.G');
  if (/metacarpal bone$|^(Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate) bone$/.test(n)) return i('main.G');
  if (n === 'Femur') return i('femur.G');
  if (/^(Tibia|Fibula|Patella)$/.test(n)) return i('tibia.G');
  if (/phalanx of \w+ finger of foot$/.test(n)) return i('orteils.G');
  if (/metatarsal bone$|^(Calcaneus|Talus|Navicular bone|Cuboid bone|Sesamoid bones of foot)$|cuneiform bone$/.test(n)) return i('pied.G');
  if (centre[1] > 1.49) return i('tete');   // crâne, mâchoire, dents, cartilages du nez
  throw new Error('pièce d\'os sans articulation : ' + nom);
}

/* Attache des sommets d'un muscle aux articulations : jusqu'à 4 par sommet, poids sur un octet (somme 255). */
export function creerAttacheur(S, OS) {
  // Un volume de recherche par articulation (côté gauche et axe) : les os qui la suivent.
  const groupes = new Map();
  for (const o of OS) { if (!groupes.has(o.joint)) groupes.set(o.joint, []); groupes.get(o.joint).push(o); }
  const volumes = [];
  for (const [joint, pieces] of groupes) {
    let nv = 0, nt = 0; for (const p of pieces) { nv += p.P.length / 3; nt += p.T.length; }
    const P = new Float32Array(nv * 3), T = new Uint32Array(nt); let v = 0, t = 0;
    for (const p of pieces) { P.set(p.P, v * 3); for (let k = 0; k < p.T.length; k++) T[t++] = v + p.T[k]; v += p.P.length / 3; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(new THREE.BufferAttribute(T, 1));
    volumes.push({ joint, bvh: new MeshBVH(g), boite: new THREE.Box3().setFromArray(P) });
  }
  const pt = new THREE.Vector3(), cible = {};
  function osLePlusProche(x, y, z) {
    pt.set(x, y, z); let dm = Infinity, jm = -1;
    for (const vol of volumes) {
      if (vol.boite.distanceToPoint(pt) >= dm) continue;
      const r = vol.bvh.closestPointToPoint(pt, cible, 0, dm);
      if (r && r.distance < dm) { dm = r.distance; jm = vol.joint; }
    }
    return [jm, dm];
  }
  const FORCE = Number(process.env.FORCE_ATTACHE || 1), TOURS = 260;
  return function attacher(P, T) {
    const nv = P.length / 3;
    const V = Array.from({ length: nv }, () => new Set());
    let longueur = 0, na = 0;
    for (let k = 0; k < T.length; k += 3) for (let j = 0; j < 3; j++) {
      const a = T[k + j], b = T[k + (j + 1) % 3]; V[a].add(b); V[b].add(a);
      longueur += Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]); na++;
    }
    const voisins = V.map(s => Uint32Array.from(s)), l = longueur / Math.max(1, na);
    const proche = new Int16Array(nv), H = new Float32Array(nv), locaux = [];
    for (let i = 0; i < nv; i++) {
      const [j, d] = osLePlusProche(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      let k = locaux.indexOf(j); if (k < 0) { k = locaux.length; locaux.push(j); }
      proche[i] = k; const r = l / Math.max(d, 0.0005); H[i] = FORCE * r * r;
    }
    const nj = locaux.length, W = new Float32Array(nv * nj);
    for (let i = 0; i < nv; i++) W[i * nj + proche[i]] = 1;
    if (nj > 1) for (let tour = 0; tour < TOURS; tour++) for (let i = 0; i < nv; i++) {
      const vs = voisins[i], den = vs.length + H[i]; if (!vs.length) continue;
      for (let j = 0; j < nj; j++) { let s = j === proche[i] ? H[i] : 0; for (let q = 0; q < vs.length; q++) s += W[vs[q] * nj + j]; W[i * nj + j] = s / den; }
    }
    // Les 4 attaches les plus fortes, ramenées à une somme de 255.
    const os = new Uint8Array(nv * 4), poids = new Uint8Array(nv * 4), ordre = [];
    for (let i = 0; i < nv; i++) {
      ordre.length = 0; for (let j = 0; j < nj; j++) ordre.push(j);
      ordre.sort((a, b) => W[i * nj + b] - W[i * nj + a]);
      const n = Math.min(4, nj); let somme = 0; for (let k = 0; k < n; k++) somme += W[i * nj + ordre[k]];
      let reste = 255;
      for (let k = n - 1; k >= 0; k--) {
        const w = k === 0 ? reste : Math.min(reste, Math.round(255 * W[i * nj + ordre[k]] / (somme || 1)));
        os[i * 4 + k] = locaux[ordre[k]]; poids[i * 4 + k] = w; reste -= w;
      }
    }
    return { os, poids, articulations: locaux };
  };
}
