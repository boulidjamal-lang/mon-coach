// Mannequin Blender, export d'un mouvement : les poses du moteur de l'appli image par image (quaternions duaux de chaque
// articulation), le matériel de chaque image, la vue et la boîte du cadrage. Même tempo que l'appli.
// node exporter-mouvement.mjs <dépôt, ou - pour celui-ci> <identifiant ou "spec"> <images par seconde> <sortie.json>
import fs from 'fs';
import path from 'path';
const ICI = path.dirname(new URL(import.meta.url).pathname);
const [depot = '-', quoi = 'e338', ips = '25', sortie = 'mouvement.json'] = process.argv.slice(2);
const DEPOT = depot === '-' ? path.join(ICI, '..', '..', '..', '..') : depot;
const { chargerAtlas, chargerMouvements, FICHIER_ATLAS, FICHIER_MOUVEMENTS } = await import(path.join(DEPOT, 'outils', 'atlas', 'mouvements', 'silhouettes.mjs'));
process.env.CARRURE = '1';
const A = chargerAtlas(FICHIER_ATLAS), E = A.E, MV = chargerMouvements(FICHIER_MOUVEMENTS);
const table = Object.fromEntries(fs.readFileSync(path.join(DEPOT, 'outils', 'atlas', 'mouvements', 'table.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|').map(x => x.trim())).map(([id, spec, nom]) => [id, { spec, nom }]));
const spec = table[quoi] ? table[quoi].spec : quoi;
const C = MV.TEINTES.sombre;
const corps = new MV.Corps(E.squelette, A.peau);
const d = MV.definir(spec, corps, C), modeles = {};
corps.appuis = d.appuis;
const N = Math.max(2, Math.round(d.periode * +ips));
const nb = E.squelette.length, images = [];
const V3 = MV.V3;
for (let f = 0; f < N; f++) {
  const t = f / N * d.periode, av = MV.avancee(d, t), pose = MV.poseDe(d, av);
  const pose2 = d.degage ? MV.poseA(d, t) : pose;
  let info = corps.poser(pose2);
  if (d.filet) { let bas = Infinity; for (const pt of corps.pw) if (pt.y < bas) bas = pt.y; if (bas < 0.045) { const p2 = Object.assign({}, pose2, { bassin: { pos: pose2.bassin.pos.clone().add(new V3(0, 0.045 - bas, 0)), rot: pose2.bassin.rot } }); info = corps.poser(p2); } }
  const dq = Array.from(corps.quaternionsDuaux());
  const formes = MV.materielDe(d, info, av.u, C, modeles).map(m => ({ forme: m.forme, s: Array.from(m.s), p: Array.isArray(m.p) ? m.p : [m.p.x, m.p.y, m.p.z], q: Array.isArray(m.q) ? m.q : [m.q.x, m.q.y, m.q.z, m.q.w], couleur: m.couleur, metal: m.metal, r: m.r || 0, hors: m.hors ? 1 : 0, tenu: m.tenu || '', appui: m.appui ? 1 : 0 }));
  images.push({ u: av.u, dq, formes, pw: corps.pw.map(p => [p.x, p.y, p.z]) });
}
// La boîte du cadrage : comme creerAnimation (articulations + marge, matériel sauf ce qui est très grand).
const mini = [1e9, 1e9, 1e9], maxi = [-1e9, -1e9, -1e9];
const etendre = (x, y, z, r) => { mini[0] = Math.min(mini[0], x - r); mini[1] = Math.min(mini[1], y - r); mini[2] = Math.min(mini[2], z - r); maxi[0] = Math.max(maxi[0], x + r); maxi[1] = Math.max(maxi[1], y + r); maxi[2] = Math.max(maxi[2], z + r); };
for (const im of images) {
  for (const p of im.pw) etendre(p[0], p[1], p[2], 0.09);
  for (const f of im.formes) {
    if (f.hors || Math.max(f.s[0], f.s[1], f.s[2]) > 1.9) continue;
    const tb = f.forme === 'tore' || f.forme === 'arc' ? (f.r || 0) : 0, q = new MV.Quat(f.q[0], f.q[1], f.q[2], f.q[3]);
    const dd = f.forme === 'boite' ? [f.s[0] / 2, f.s[1] / 2, f.s[2] / 2] : f.forme === 'cylindre' || f.forme === 'hexa' ? [f.s[0], f.s[1] / 2, f.s[2]] : [f.s[0] + tb, f.s[1] + tb, f.s[2] + tb];
    for (let k = 0; k < 8; k++) { const cc = new V3(k & 1 ? dd[0] : -dd[0], k & 2 ? dd[1] : -dd[1], k & 4 ? dd[2] : -dd[2]).applyQuaternion(q); etendre(f.p[0] + cc.x, f.p[1] + cc.y, f.p[2] + cc.z, 0); }
  }
}
mini[1] = Math.max(0, mini[1]);
const nbF = images.map(i => i.formes.length);
fs.writeFileSync(sortie, JSON.stringify({ quoi, spec, nom: table[quoi] ? table[quoi].nom : '', periode: d.periode, rythme: d.rythme, ips: +ips, vue: d.vue || { az: 45, el: 10 }, boite: { min: mini, max: maxi }, articulations: E.squelette.map(a => a.nom), images }));
console.log(`${quoi} « ${spec} » : ${N} images (${d.periode} s, rythme ${d.rythme}), ${Math.min(...nbF)} à ${Math.max(...nbF)} formes de matériel, vue ${JSON.stringify(d.vue || null)}, boîte ${mini.map(x => x.toFixed(2))} → ${maxi.map(x => x.toFixed(2))} ; ${(fs.statSync(sortie).size / 1e6).toFixed(1)} Mo`);
