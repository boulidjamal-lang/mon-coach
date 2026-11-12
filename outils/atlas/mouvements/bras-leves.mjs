// Relevé des mouvements où un bras passe au-dessus de la tête : à l'instant où il est le plus levé, le coude est-il
// tendu, et de combien l'épaule est-elle montée ? L'épaule monte avec le bras (ceinture scapulaire) : une « longueur de
// bras » comptée depuis l'épaule au repos laisse le coude plié — c'est ce relevé qui a montré les tractions pendues bras
// pliés à 71°, le haut du tirage vertical à 69°, les développés à 64-75°. Il ne juge pas (un triceps derrière la nuque a
// le coude plié, c'est le geste) : il se lit, du plus plié au plus tendu.
// Usage : node bras-leves.mjs [motif]     (motif : ne garder que les mouvements dont le nom le contient)
import fs from 'fs';
import path from 'path';
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const ici = path.dirname(new URL(import.meta.url).pathname), motif = process.argv[2] || '';
const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS), corps = new M.Corps(atlas.E.squelette, atlas.peau);
const table = fs.readFileSync(path.join(ici, 'table.txt'), 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('|').map(x => x.trim()));
const specs = [...new Set(table.map(l => l[1]))].filter(s => s.includes(motif)), sortie = [];
for (const spec of specs) {
  let d; try { d = M.definir(spec, corps, M.TEINTES.clair); } catch (e) { continue; }
  let pire = null;
  for (let i = 0; i <= 10; i++) {
    const u = i / 10, pose = M.poseA(d, 0, u), t = corps.tronc(pose), haut = new M.V3(0, 1, 0).applyQuaternion(t.qThorax), repos = { G: t.epaules.G.clone(), D: t.epaules.D.clone() }, info = corps.poser(pose);
    for (const k of ['G', 'D']) {
      const a1 = info.coudes[k].clone().sub(info.epaules[k]);
      const levee = 180 - Math.acos(Math.max(-1, Math.min(1, a1.dot(haut) / a1.length()))) * 180 / Math.PI;   // 0 : le long du buste ; 180 : dans son prolongement
      if (!pire || levee > pire.levee) pire = { levee, plie: info.angles[k].coude, monte: info.epaules[k].clone().sub(repos[k]).dot(haut) * 100, u, k };
    }
  }
  if (pire && pire.levee > 125) sortie.push({ spec, ...pire });
}
sortie.sort((a, b) => b.plie - a.plie);
console.log(`${sortie.length} mouvements lèvent un bras à plus de 125° du buste. Au plus haut : bras levé · coude plié · épaule montée`);
for (const s of sortie) console.log(`${s.spec.padEnd(46)} ${s.levee.toFixed(0).padStart(4)}° ${s.plie.toFixed(0).padStart(4)}° ${s.monte.toFixed(1).padStart(5)} cm  (u=${s.u}, ${s.k})`);
