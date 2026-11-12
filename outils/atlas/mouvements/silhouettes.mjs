// Contrôle rapide des mouvements, sans moteur 3D : le squelette posé est dessiné en silhouette (côté gauche en bleu,
// droit en rouge) avec le matériel, à trois instants et sous trois angles. Sert à régler les poses et à relire les
// 823 exercices ; le rendu réel (muscles) se contrôle ensuite dans l'atlas.
// Usage : node silhouettes.mjs <sortie.png|.html> <spec> [<spec> …]   ou   --fichier liste.txt   (une spec par ligne ; « spec | titre »)
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ici = path.dirname(new URL(import.meta.url).pathname);
/* Dans le dépôt, le modèle et le module sont dans assets/atlas ; dans un dossier de travail, à côté des outils. */
const DEPOT = path.join(ici, '..', '..', '..', 'assets', 'atlas');
export const FICHIER_ATLAS = process.env.ATLAS || (fs.existsSync(path.join(DEPOT, 'atlas.bin')) ? path.join(DEPOT, 'atlas.bin') : path.join(ici, '..', 'donnees', 'atlas.bin'));
export const FICHIER_MOUVEMENTS = process.env.MOUVEMENTS || (fs.existsSync(path.join(DEPOT, 'atlas.bin')) ? path.join(DEPOT, 'atlas-mouvements.js') : path.join(ici, '..', 'appli', 'atlas-mouvements.js'));
/* Le modèle tel que le moteur le montre : avec sa carrure (les chairs étoffées autour des os), calculée par la même
   fonction que dans l'appli. CARRURE=0 : le corps d'origine. */
export function chargerAtlas(fichier) {
  const brut = fs.readFileSync(fichier), n = brut.readUInt32LE(8), E = JSON.parse(brut.slice(12, 12 + n).toString('utf8'));
  const debut = 12 + Math.ceil(n / 4) * 4, pas = E.octetsParSommet;
  let b = brut.subarray(debut, debut + E.sommets * pas);
  const force = process.env.CARRURE == null ? 1 : +process.env.CARRURE;
  const ctx = { window: {}, Math, Float32Array, Uint8Array, Uint16Array, Uint32Array, DataView, JSON, Object, Array, Infinity, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(path.dirname(fichier), 'atlas3d.js'), 'utf8'), ctx);
  if (force > 0) {
    const r = ctx.window.AnqaAtlas.etoffer(new Uint8Array(b.buffer, b.byteOffset, b.length), pas, E.boite, E.squelette, force, (v, o) => b[o + 10] === E.os.pair || b[o + 10] === E.os.impair);
    b = Buffer.from(r.sommets.buffer, r.sommets.byteOffset, r.sommets.length); E.boite = r.boite;
  }
  // Les poids autour de l'épaule et de l'avant-bras, répondérés par le moteur lui-même (POIDS=0 : poids du fichier) :
  // la préparation écrite dans le fichier pour cette carrure, comme l'appli l'applique ; à défaut, le calcul.
  if (ctx.window.AnqaAtlas.reponderer && process.env.POIDS !== '0') {
    if (!(force > 0)) b = Buffer.from(b);
    const u8 = new Uint8Array(b.buffer, b.byteOffset, b.length), ab = brut.buffer.slice(brut.byteOffset, brut.byteOffset + brut.length);
    const pret = E.preparation && +E.preparation.carrure === force && ctx.window.AnqaAtlas.appliquerPreparation && ctx.window.AnqaAtlas.appliquerPreparation(u8, pas, E, ab);
    if (!pret) {
      const o0 = brut.byteOffset + debut + E.sommets * pas;
      ctx.window.AnqaAtlas.reponderer(u8, pas, E, new Uint16Array(brut.buffer.slice(o0, o0 + E.triangles * 6)), (v, o) => b[o + 10] === E.os.pair || b[o + 10] === E.os.impair);
    }
  }
  // « Par la corde » (épaule, hanche) : la part de chaque sommet, écrite par le moteur lui-même dans son octet libre.
  // CORDE : un nombre, ou un objet en JSON ({"epaule":0.85,"hancheArriere":0.9,"hancheAvant":0.3}), pour essayer un réglage.
  const reglage = process.env.CORDE == null ? undefined : (/^[\[{]/.test(process.env.CORDE) ? JSON.parse(process.env.CORDE) : +process.env.CORDE);
  if (ctx.window.AnqaAtlas.marquerCorde) ctx.window.AnqaAtlas.marquerCorde(new Uint8Array(b.buffer, b.byteOffset, b.length), pas, E.boite, E.squelette, reglage, (v, o) => b[o + 10] === E.os.pair || b[o + 10] === E.os.impair);
  const peau = regions => {
    const P = [], J = [], W = [], C = [];
    for (const s of E.structures) {
      if (regions && !regions.includes(s.region)) continue;
      for (let v = s.sommets; v < s.sommets + s.nbSommets; v += 6) {
        const o = v * pas;
        for (let k = 0; k < 3; k++) P.push(E.boite.min[k] + b.readUInt16LE(o + k * 2) / 65535 * E.boite.etendue[k]);
        for (let k = 0; k < 4; k++) { J.push(b.readUInt8(o + 12 + k)); W.push(b.readUInt8(o + 16 + k) / 255); }
        C.push(b.readUInt8(o + 11) / 255);
      }
    }
    return { n: P.length / 3, P: Float32Array.from(P), J: Uint8Array.from(J), W: Float32Array.from(W), C: Float32Array.from(C) };
  };
  /* Tous les sommets du modèle, un sur `tous`, os compris : comme `peau`, avec en plus le numéro de la structure de
     chaque point (E.os.pair et E.os.impair : un os). Pour les cribles (traversées du matériel, déformations). */
  const points = (tous = 3) => {
    const n = Math.ceil(E.sommets / tous), P = new Float32Array(n * 3), J = new Uint8Array(n * 4), W = new Float32Array(n * 4), C = new Float32Array(n), structure = new Uint8Array(n);
    for (let i = 0, v = 0; v < E.sommets; v += tous, i++) {
      const o = v * pas;
      for (let k = 0; k < 3; k++) P[i * 3 + k] = E.boite.min[k] + b.readUInt16LE(o + k * 2) / 65535 * E.boite.etendue[k];
      for (let k = 0; k < 4; k++) { J[i * 4 + k] = b.readUInt8(o + 12 + k); W[i * 4 + k] = b.readUInt8(o + 16 + k) / 255; }
      C[i] = b.readUInt8(o + 11) / 255; structure[i] = b.readUInt8(o + 10);
    }
    return { n, P, J, W, C, structure };
  };
  return { E, peau, points };
}
export function chargerMouvements(fichier) {
  const ctx = { console, Math, Float32Array, Uint8Array, JSON, isNaN, isFinite, Object, Array, String, Number, Error };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(fichier, 'utf8'), ctx, { filename: fichier });
  return ctx.AnqaMouvements;
}
const OS = [];   // [articulation, parent, épaisseur (m), côté]
export function preparer(E) {
  const noms = E.squelette.map(a => a.nom), ep = { humerus: 0, ulna: 0.075, radius: 0, main: 0.055, 'doigt3-1': 0.04, femur: 0, tibia: 0.115, pied: 0.085, orteils: 0.06, clavicule: 0 };
  OS.length = 0;
  E.squelette.forEach((a, i) => {
    if (a.parent < 0) return;
    const base = a.nom.replace(/\.[GD]$/, ''), cote = a.nom.endsWith('.G') ? 'G' : a.nom.endsWith('.D') ? 'D' : 'M';
    if (/^doigt/.test(base) && base !== 'doigt3-1') return;
    if (base === 'radius') return;
    let e = ep[base] != null ? ep[base] : 0.13;
    if (base === 'humerus') e = 0.05; if (base === 'femur') e = 0.09; if (base === 'clavicule') e = 0.05;
    if (/^cou/.test(base) || base === 'tete') e = 0.07;
    // L'ulna part de l'humérus : le segment dessiné est l'os parent → cette articulation.
    OS.push([i, a.parent, e, cote]);
  });
  return noms;
}
const COUL = { G: '#2f6fed', D: '#e5484d', M: '#7b8494' };
export function dessiner(M, corps, d, C, o) {
  // Renvoie le SVG d'une pose : u, vue { az, el }, cadre { cx, cy (monde, m), l, h (px), ech (px/m) }.
  const pose = M.poseA(d, 0, o.u), info = corps.poser(pose);
  const formes = M.materielDe(d, info, o.u, C, o.modeles);
  const az = o.vue.az * Math.PI / 180, el = o.vue.el * Math.PI / 180;
  const ar = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const dn = Math.hypot(ar[2], ar[0]) || 1, dr = [ar[2] / dn, 0, -ar[0] / dn], de = [ar[1] * dr[2] - ar[2] * dr[1], ar[2] * dr[0] - ar[0] * dr[2], ar[0] * dr[1] - ar[1] * dr[0]];
  const pr = p => [p[0] * dr[0] + p[1] * dr[1] + p[2] * dr[2], p[0] * de[0] + p[1] * de[1] + p[2] * de[2], p[0] * ar[0] + p[1] * ar[1] + p[2] * ar[2]];
  const P = corps.pw.map(v => pr([v.x, v.y, v.z]));
  const { cx, cy, l, h, ech } = o.cadre;
  const X = x => (l / 2 + (x - cx) * ech).toFixed(1), Y = y => (h / 2 - (y - cy) * ech).toFixed(1);
  const D = [];   // [profondeur, svg]
  for (const [i, p, e, cote] of OS) D.push([(P[i][2] + P[p][2]) / 2, `<line x1="${X(P[p][0])}" y1="${Y(P[p][1])}" x2="${X(P[i][0])}" y2="${Y(P[i][1])}" stroke="${COUL[cote]}" stroke-width="${(e * ech).toFixed(1)}" stroke-linecap="round"/>`]);
  // La tête : au-dessus de l'articulation, dans son repère ; le nez indique où regarde le visage.
  const it = corps.i.tete, qt = corps.qw[it], tr = (x, y, z) => { const v = new M.V3(x, y, z).applyQuaternion(qt); return pr([corps.pw[it].x + v.x, corps.pw[it].y + v.y, corps.pw[it].z + v.z]); };
  const tc = tr(0, 0.085, 0.025), nez = tr(0, 0.07, 0.13);
  D.push([tc[2], `<circle cx="${X(tc[0])}" cy="${Y(tc[1])}" r="${(0.1 * ech).toFixed(1)}" fill="#9aa3b2"/>`]);
  D.push([nez[2] + 0.01, `<circle cx="${X(nez[0])}" cy="${Y(nez[1])}" r="${(0.022 * ech).toFixed(1)}" fill="#3b4252"/>`]);
  for (const f of formes) {
    const q = new M.Quat(f.q[0], f.q[1], f.q[2], f.q[3]), c0 = pr(f.p);
    const coul = `rgb(${f.couleur.map(x => Math.round(x * 0.55)).join(',')})`;
    if (f.forme === 'cylindre') {
      const ax = new M.V3(0, f.s[1] / 2, 0).applyQuaternion(q), a = pr([f.p[0] - ax.x, f.p[1] - ax.y, f.p[2] - ax.z]), b = pr([f.p[0] + ax.x, f.p[1] + ax.y, f.p[2] + ax.z]);
      const lp = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (lp * ech < 2 * f.s[0] * ech * 0.6) D.push([c0[2], `<circle cx="${X(c0[0])}" cy="${Y(c0[1])}" r="${Math.max(1, f.s[0] * ech).toFixed(1)}" fill="${coul}" opacity=".8"/>`]);
      else D.push([c0[2], `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${coul}" stroke-width="${Math.max(1.2, 2 * f.s[0] * ech).toFixed(1)}" opacity=".85"/>`]);
    } else if (f.forme === 'boite') {
      const pts = [];
      for (let k = 0; k < 8; k++) { const v = new M.V3((k & 1 ? 1 : -1) * f.s[0] / 2, (k & 2 ? 1 : -1) * f.s[1] / 2, (k & 4 ? 1 : -1) * f.s[2] / 2).applyQuaternion(q); const w = pr([f.p[0] + v.x, f.p[1] + v.y, f.p[2] + v.z]); pts.push([+X(w[0]), +Y(w[1])]); }
      // Enveloppe convexe des huit coins projetés.
      pts.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
      const cr = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]), bas = [], haut = [];
      for (const pt of pts) { while (bas.length >= 2 && cr(bas[bas.length - 2], bas[bas.length - 1], pt) <= 0) bas.pop(); bas.push(pt); }
      for (const pt of pts.slice().reverse()) { while (haut.length >= 2 && cr(haut[haut.length - 2], haut[haut.length - 1], pt) <= 0) haut.pop(); haut.push(pt); }
      const env = bas.slice(0, -1).concat(haut.slice(0, -1));
      D.push([c0[2] - 0.3, `<polygon points="${env.map(pt => pt.join(',')).join(' ')}" fill="${coul}" opacity=".5" stroke="${coul}" stroke-width=".6"/>`]);
    } else D.push([c0[2], `<circle cx="${X(c0[0])}" cy="${Y(c0[1])}" r="${Math.max(1, f.s[0] * ech).toFixed(1)}" fill="${coul}" opacity=".7"/>`]);
  }
  D.sort((u, v) => u[0] - v[0]);
  // Le sol : y = 0 au centre de la scène.
  const s0 = pr([0, 0, 0]);
  const sol = `<line x1="0" y1="${Y(s0[1])}" x2="${l}" y2="${Y(s0[1])}" stroke="#c9ced8" stroke-width="1"/>`;
  return { svg: `<svg width="${l}" height="${h}" viewBox="0 0 ${l} ${h}">${sol}${D.map(x => x[1]).join('')}</svg>`, P, info, pose, formes };
}
// Contrôles automatiques d'une pose : valeurs finies, rien sous le sol.
export function controler(corps, d, M, C) {
  const pb = [];
  for (const u of d.rythme === 'continu' || d.rythme === 'boucle' ? [0.12, 0.4, 0.7] : [0, 0.5, 1]) {
    const pose = M.poseA(d, 0, u); corps.poser(pose);
    const m = corps.matrices(); for (let i = 0; i < m.length; i++) if (!Number.isFinite(m[i])) { pb.push('valeur non finie (u=' + u + ')'); break; }
    let yMin = Infinity; corps.peauPosee(null, (x, y) => { if (y < yMin) yMin = y; });
    if (yMin < -0.045) pb.push(`sous le sol de ${Math.round(-yMin * 100)} cm (u=${u})`);
  }
  return pb;
}
async function principal() {
  const args = process.argv.slice(2), sortie = args.shift();
  let specs = [];
  if (args[0] === '--fichier') specs = fs.readFileSync(args[1], 'utf8').split('\n').filter(x => x.trim() && !x.startsWith('#')).map(x => { const [s, t] = x.split('|').map(y => y.trim()); return { spec: s, titre: t || '' }; });
  else specs = args.map(s => ({ spec: s, titre: '' }));
  const atlas = chargerAtlas(FICHIER_ATLAS);
  const M = chargerMouvements(FICHIER_MOUVEMENTS);
  preparer(atlas.E);
  const corps = new M.Corps(atlas.E.squelette, atlas.peau), C = M.TEINTES.clair;
  const l = +(process.env.L || 150), h = +(process.env.H || 165), ech = +(process.env.ECH || 74), par = +(process.env.PAR || 16);
  // Plusieurs planches si la liste est longue : sortie-1.png, sortie-2.png, …
  if (specs.length > par && !sortie.endsWith('.html')) {
    const { execFileSync } = require('child_process');
    let nb = 0;
    for (let i = 0, n = 1; i < specs.length; i += par, n++) {
      const f = sortie.replace(/\.png$/, '-' + n + '.txt'); fs.writeFileSync(f, specs.slice(i, i + par).map(x => x.spec + ' | ' + x.titre).join('\n'));
      const r = execFileSync(process.execPath, [process.argv[1], sortie.replace(/\.png$/, '-' + n + '.png'), '--fichier', f], { env: process.env }).toString(); process.stdout.write(r); nb++;
    }
    return;
  }
  let html = `<!doctype html><meta charset="utf-8"><style>body{margin:8px;font:11px/1.25 system-ui,sans-serif;color:#1c2230;background:#fff}.g{display:grid;grid-template-columns:repeat(${process.env.COLS || 2},max-content);gap:6px 12px}.b{border:1px solid #d8dce4;border-radius:6px;padding:3px 5px}.t{font-weight:600;max-width:${5 * l}px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.t small{font-weight:400;color:#5c6577}.t b{color:#c0392b}.r{display:flex}svg{background:#f6f7f9;margin-right:1px}</style><div class="g">`;
  let nbPb = 0;
  for (const { spec, titre } of specs) {
    let bloc;
    try {
      const d = M.definir(spec, corps, C), modeles = {};
      const pb = controler(corps, d, M, C); if (pb.length) nbPb++;
      // Cadre commun aux images de même vue : centre de la boîte des articulations sur tout le mouvement.
      // Mouvement en cycle continu : trois instants du cycle ; sinon départ, milieu, arrivée.
      const cyc = d.rythme === 'continu' || d.rythme === 'boucle', U = cyc ? [0.12, 0.4, 0.7] : [0, 0.5, 1], v0 = d.vue || { az: 45, el: 10 };
      const vues = [[U[0], v0], [U[1], v0], [U[2], v0], [cyc ? U[1] : 1, { az: 90, el: 0 }], [cyc ? U[1] : 1, { az: 0, el: 0 }]];
      const cadreDe = vue => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const u of U) { const r = dessiner(M, corps, d, C, { u, vue, modeles, cadre: { cx: 0, cy: 0, l, h, ech } }); for (const p of r.P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } }
        const e = Math.min(ech, (l - 16) / (x1 - x0 + 0.25), (h - 16) / (y1 - y0 + 0.3));
        return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 + 0.03, l, h, ech: e };
      };
      const cadres = new Map();
      const cellules = vues.map(([u, vue]) => { const k = vue.az + '/' + vue.el; if (!cadres.has(k)) cadres.set(k, cadreDe(vue)); return dessiner(M, corps, d, C, { u, vue, modeles, cadre: cadres.get(k) }).svg; });
      bloc = `<div class="b"><div class="t">${spec} <small>${titre}</small>${pb.length ? ' <b>' + pb.join(' ; ') + '</b>' : ''}</div><div class="r">${cellules.join('')}</div></div>`;
    } catch (e) { nbPb++; bloc = `<div class="b"><div class="t">${spec} <b>${String(e.message).slice(0, 90)}</b></div><div class="r" style="height:${h}px;width:${5 * l}px"></div></div>`; if (process.env.TRACE) console.error(e); }
    html += bloc;
  }
  html += '</div>';
  if (sortie.endsWith('.html')) { fs.writeFileSync(sortie, html); console.log('écrit', sortie); return; }
  const tmp = sortie.replace(/\.png$/, '.html'); fs.writeFileSync(tmp, html);
  const { chromium } = require('playwright');
  const nav = await chromium.launch(), page = await nav.newPage({ viewport: { width: (+(process.env.COLS || 2)) * (5 * l + 26) + 16, height: 600 } });
  await page.goto('file://' + path.resolve(tmp)); await page.screenshot({ path: sortie, fullPage: true }); await nav.close();
  console.log('écrit', sortie, specs.length, 'mouvements,', nbPb, 'à revoir');
}
if (process.argv[1] && process.argv[1].endsWith('silhouettes.mjs')) principal().catch(e => { console.error(e); process.exit(1); });
