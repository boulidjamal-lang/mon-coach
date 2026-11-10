// Réduction d'un maillage (meshoptimizer) en gardant sa forme : erreur maximale donnée en mètres.
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;   // réduction qui respecte un attribut (la part de tendon)
/* P : positions, T : indices, attr : Float32Array (un nombre par sommet, ex. part de tendon) ou null.
   Renvoie { P, T, attr } réduits et compactés. */
export function reduire(P, T, attr, erreurM, partMin = 0.02, bordFixe = false) {
  const drapeaux = bordFixe ? ['LockBorder'] : [];
  const echelle = MeshoptSimplifier.getScale(P, 3) || 1;
  const cible = Math.min(T.length, Math.max(36, Math.floor(T.length * partMin / 3) * 3));
  let idx;
  if (attr) [idx] = MeshoptSimplifier.simplifyWithAttributes(T, P, 3, attr, 1, [0.5], null, cible, erreurM / echelle, drapeaux);
  else [idx] = MeshoptSimplifier.simplify(T, P, 3, cible, erreurM / echelle, drapeaux);
  const [remap, n] = MeshoptSimplifier.compactMesh(idx);
  const P2 = new Float32Array(n * 3), a2 = attr ? new Float32Array(n) : null;
  for (let i = 0; i < remap.length; i++) { const j = remap[i]; if (j === 0xffffffff) continue; P2[j * 3] = P[i * 3]; P2[j * 3 + 1] = P[i * 3 + 1]; P2[j * 3 + 2] = P[i * 3 + 2]; if (a2) a2[j] = attr[i]; }
  return { P: P2, T: idx, attr: a2 };
}
