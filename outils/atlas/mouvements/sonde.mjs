// Sonde : point le plus bas de la peau, par région, pour une pose donnée.  node sonde.mjs "<spec>" [u]
import { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } from './silhouettes.mjs';
const atlas = chargerAtlas(FICHIER_ATLAS), M = chargerMouvements(FICHIER_MOUVEMENTS);
const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair;
const [spec, uTxt] = process.argv.slice(2);
const d = M.definir(spec, corps, C);
for (const u of uTxt != null ? [+uTxt] : [0, 0.5, 1]) {
  const pose = M.poseA(d, 0, u), info = corps.poser(pose);
  const bas = {};
  for (const r of ['tete', 'cou', 'epaule', 'thorax', 'dos', 'abdomen', 'bassin', 'bras', 'avant_bras', 'main', 'cuisse', 'jambe', 'pied']) { let m = Infinity; corps.peauPosee([r], (x, y) => { if (y < m) m = y; }); bas[r] = +m.toFixed(3); }
  console.log('u=' + u, JSON.stringify(bas));
  console.log('   bassin', info.bassin.xyz ? info.bassin.xyz().map(x => +x.toFixed(2)) : info.bassin, 'épaules y', +info.epaules.G.y.toFixed(2), 'prises', ['G', 'D'].map(k => [info.prises[k].x, info.prises[k].y, info.prises[k].z].map(x => +x.toFixed(2)).join(',')).join(' | '), 'chevilles', ['G', 'D'].map(k => [info.chevilles[k].x, info.chevilles[k].y, info.chevilles[k].z].map(x => +x.toFixed(2)).join(',')).join(' | '));
}
