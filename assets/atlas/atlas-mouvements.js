/* =====================================================================
   MOUVEMENTS DE L'ATLAS — le corps anatomique exécute les exercices.
   Chaque mouvement décrit la pose à un instant u (0 = départ, 1 = fin) :
   bassin, colonne, cibles des mains et des pieds. Un petit solveur en
   déduit la rotation de chaque articulation (épaule, coude, avant-bras,
   poignet, doigts, hanche, genou, cheville) ; le moteur de l'atlas
   (atlas3d.js) déforme alors os et muscles en conséquence.
   Dépend de atlas3d.js ; ne se charge que pour montrer un exercice.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- Vecteurs et quaternions : le strict nécessaire ---------- */
  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new V3(this.x, this.y, this.z); }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setX(x) { this.x = x; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    cross(v) { const x = this.y * v.z - this.z * v.y, y = this.z * v.x - this.x * v.z, z = this.x * v.y - this.y * v.x; this.x = x; this.y = y; this.z = z; return this; }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    applyQuaternion(q) {
      const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
      this.x = x + qw * tx + qy * tz - qz * ty; this.y = y + qw * ty + qz * tx - qx * tz; this.z = z + qw * tz + qx * ty - qy * tx;
      return this;
    }
  }
  class Quat {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    clone() { return new Quat(this.x, this.y, this.z, this.w); }
    copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
    identity() { this.x = this.y = this.z = 0; this.w = 1; return this; }
    setFromAxisAngle(a, t) { const s = Math.sin(t / 2); this.x = a.x * s; this.y = a.y * s; this.z = a.z * s; this.w = Math.cos(t / 2); return this; }
    multiplyQuaternions(a, b) {
      const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
      this.x = ax * bw + aw * bx + ay * bz - az * by; this.y = ay * bw + aw * by + az * bx - ax * bz; this.z = az * bw + aw * bz + ax * by - ay * bx; this.w = aw * bw - ax * bx - ay * by - az * bz;
      return this;
    }
    multiply(q) { return this.multiplyQuaternions(this, q); }
    invert() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
    normalize() { const l = Math.hypot(this.x, this.y, this.z, this.w) || 1; this.x /= l; this.y /= l; this.z /= l; this.w /= l; return this; }
    slerp(q, t) {
      let cos = this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      if (cos < 0) { cos = -cos; qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
      if (cos > 0.9995) { this.x += (qx - this.x) * t; this.y += (qy - this.y) * t; this.z += (qz - this.z) * t; this.w += (qw - this.w) * t; return this.normalize(); }
      const a = Math.acos(cos), s = Math.sin(a), k0 = Math.sin((1 - t) * a) / s, k1 = Math.sin(t * a) / s;
      this.x = this.x * k0 + qx * k1; this.y = this.y * k0 + qy * k1; this.z = this.z * k0 + qz * k1; this.w = this.w * k0 + qw * k1;
      return this;
    }
    setFromUnitVectors(a, b) {
      let r = a.dot(b) + 1;
      if (r < 1e-6) { r = 0; if (Math.abs(a.x) > Math.abs(a.z)) { this.x = -a.y; this.y = a.x; this.z = 0; } else { this.x = 0; this.y = -a.z; this.z = a.y; } }
      else { this.x = a.y * b.z - a.z * b.y; this.y = a.z * b.x - a.x * b.z; this.z = a.x * b.y - a.y * b.x; }
      this.w = r; return this.normalize();
    }
    // Rotation dont les colonnes sont les trois vecteurs (repère orthonormé direct).
    setFromBasis(a, b, c) {
      const m11 = a.x, m12 = b.x, m13 = c.x, m21 = a.y, m22 = b.y, m23 = c.y, m31 = a.z, m32 = b.z, m33 = c.z, tr = m11 + m22 + m33;
      if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); this.w = 0.25 / s; this.x = (m32 - m23) * s; this.y = (m13 - m31) * s; this.z = (m21 - m12) * s; }
      else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); this.w = (m32 - m23) / s; this.x = 0.25 * s; this.y = (m12 + m21) / s; this.z = (m13 + m31) / s; }
      else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); this.w = (m13 - m31) / s; this.x = (m12 + m21) / s; this.y = 0.25 * s; this.z = (m23 + m32) / s; }
      else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); this.w = (m21 - m12) / s; this.x = (m13 + m31) / s; this.y = (m23 + m32) / s; this.z = 0.25 * s; }
      return this;
    }
  }
  const V = (x = 0, y = 0, z = 0) => new V3(x, y, z);
  const lerp = (a, b, t) => a + (b - a) * t;
  const lisse = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const rad = d => (d * Math.PI) / 180;
  const qAxe = (axe, a) => new Quat().setFromAxisAngle(axe, a);
  const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
  const COTES = [['G', 1, '.G'], ['D', -1, '.D']];
  const unite = v => v.clone().normalize();
  /* Part de v perpendiculaire à d (d unitaire). */
  const perp = (v, d) => v.clone().sub(d.clone().multiplyScalar(v.dot(d)));
  /* Plus courte rotation qui amène a sur b. */
  const arc = (a, b) => new Quat().setFromUnitVectors(unite(a), unite(b));
  /* Angle de la rotation q autour de l'axe (unitaire), entre -180° et 180°. */
  function torsion(q, axe) {
    let a = 2 * Math.atan2(q.x * axe.x + q.y * axe.y + q.z * axe.z, q.w);
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
  /* Répétition : repos, aller, repos, retour (u de 0 à 1 puis 0). */
  function cycle(t, periode = 2.8) {
    const p = ((t % periode) + periode) % periode / periode;
    if (p < 0.1) return 0;
    if (p < 0.48) return lisse((p - 0.1) / 0.38);
    if (p < 0.58) return 1;
    return 1 - lisse((p - 0.58) / 0.42);
  }
  function perpendiculaire(d) { const r = Math.abs(d.y) < 0.9 ? AY : AZ; return perp(r, d).normalize(); }
  /* Cinématique inverse à deux segments : racine A, cible C, longueurs l1 l2,
     « pôle » : la direction vers laquelle part l'articulation du milieu. */
  function ik2(A, C, l1, l2, pole) {
    const d = C.clone().sub(A);
    let dist = d.length();
    const dir = d.normalize();
    dist = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const p = perp(pole, dir);
    if (p.lengthSq() < 1e-8) p.copy(perpendiculaire(dir));
    p.normalize();
    const milieu = A.clone().add(dir.clone().multiplyScalar(l1 * cosA)).add(p.multiplyScalar(l1 * sinA));
    const fin = A.clone().add(dir.multiplyScalar(dist));
    return { milieu, fin };
  }
  /* Rotation qui amène un repère (direction d0, avant a0) sur (d, a). */
  function qBase(d, a) {
    const y = unite(d);
    const z = perp(a, y);
    if (z.lengthSq() < 1e-8) z.copy(perpendiculaire(y));
    z.normalize();
    return new Quat().setFromBasis(y.clone().cross(z), y, z);
  }
  const qVers = (d0, a0, d, a) => qBase(d, a).multiply(qBase(d0, a0).invert());

  /* Part du mouvement du bras reprise par la ceinture scapulaire (clavicule et omoplate) : un tiers environ. */
  const K_CEINTURE = 0.24;

  /* ---------- Le corps : squelette de mouvement et solveur de pose ---------- */
  class Corps {
    /* squelette : articulations de l'atlas ({ nom, parent, centre }) ; peau : points de la surface des jambes et du
       tronc (positions, articulations, poids) pour mesurer le corps posé. */
    constructor(squelette, peau) {
      const nb = squelette.length;
      this.nb = nb; this.S = squelette;
      this.i = Object.fromEntries(squelette.map((a, k) => [a.nom, k]));
      this.parent = squelette.map(a => a.parent);
      this.tete = squelette.map(a => V(a.centre[0], a.centre[1], a.centre[2]));
      this.decal = squelette.map((a, k) => (a.parent >= 0 ? this.tete[k].clone().sub(this.tete[a.parent]) : this.tete[k].clone()));
      this.ql = Array.from({ length: nb }, () => new Quat());   // rotation par rapport au parent
      this.qw = Array.from({ length: nb }, () => new Quat());   // rotation dans le monde
      this.pw = Array.from({ length: nb }, () => V());          // position de l'articulation dans le monde
      this.pFixe = new Array(nb).fill(null);                    // articulation posée à un endroit précis
      this.posRacine = this.tete[0].clone();
      this.mats = new Float32Array(nb * 12);
      this.peauJambes = peau || null;
      this.majMonde();
      const T = nom => this.tete[this.i[nom]];
      const L = this.L = {
        bras: T('ulna.G').distanceTo(T('humerus.G')),
        avantBras: T('main.G').distanceTo(T('ulna.G')),
        main: 0.85 * T('doigt3-1.G').distanceTo(T('main.G')),   // du poignet au creux de la main
        creux: 0.024,                                            // du plan de la main au centre d'une barre tenue
        cuisse: T('tibia.G').distanceTo(T('femur.G')),
        jambe: T('pied.G').distanceTo(T('tibia.G')),
        chevilleH: T('pied.G').y,
        racine: T('bassin').clone(),
        hanche: T('femur.G').clone().sub(T('bassin')),
        dos: peau && peau.dos != null ? peau.dos : 0.11         // du bassin à la surface du dos (pour s'allonger)
      };
      L.prise = L.avantBras + L.main;
      /* Repères au repos des membres : directions des deux segments, sens où
         plie l'articulation (f), axe de la charnière (h), angle au repos. */
      const membre = (d1, d2, f) => {
        d1 = unite(d1); d2 = unite(d2); f = unite(perp(f, d1));
        return { d1, d2, f, h: d1.clone().cross(f).normalize(), theta0: Math.atan2(d2.dot(f), d2.dot(d1)) };
      };
      this.R = {};
      for (const [c, s, x] of COTES) {
        const dBras = T('ulna' + x).clone().sub(T('humerus' + x)), dAB = T('main' + x).clone().sub(T('ulna' + x));
        const dCuisse = T('tibia' + x).clone().sub(T('femur' + x)), dJambe = T('pied' + x).clone().sub(T('tibia' + x));
        const dMain = unite(T('doigt3-1' + x).clone().sub(T('main' + x)));
        const indexAuriculaire = T('doigt5-1' + x).clone().sub(T('doigt2-1' + x));
        const paume = unite(perp(indexAuriculaire.clone().cross(dMain).multiplyScalar(s), dMain));   // sort de la paume
        const versOrteils = T('orteils' + x).clone().sub(T('pied' + x)); versOrteils.y = 0;
        const R = this.R[c] = {
          bras: membre(dBras, dAB, V(0, 0, 1)),               // le coude plie vers l'avant
          jambe: membre(dCuisse, dJambe, V(0, 0, -1)),        // le genou plie vers l'arrière
          main: { d: dMain, paume }, pied: unite(versOrteils), doigts: {}
        };
        for (let f = 1; f <= 5; f++) {
          const base = T(`doigt${f}-1` + x), a = T(`doigt${f}-2` + x), b = T(`doigt${f}-3` + x), bout = b.clone().add(b.clone().sub(a).multiplyScalar(0.9));
          // Les doigts se replient vers la paume ; le pouce, en travers de la paume.
          const versPaume = f === 1 ? unite(paume.clone().multiplyScalar(0.45).add(unite(T('doigt5-1' + x).clone().sub(base)))) : paume;
          R.doigts[f] = unite(bout.clone().sub(base)).cross(versPaume).normalize();
        }
      }
    }
    /* Positions et rotations dans le monde, du bassin vers les extrémités. */
    majMonde() {
      const { nb, parent, ql, qw, pw, pFixe, decal } = this;
      for (let b = 0; b < nb; b++) {
        const p = parent[b];
        if (p < 0) { qw[b].copy(ql[b]); pw[b].copy(this.posRacine); continue; }
        qw[b].multiplyQuaternions(qw[p], ql[b]);
        if (pFixe[b]) pw[b].copy(pFixe[b]);
        else pw[b].copy(decal[b]).applyQuaternion(qw[p]).add(pw[p]);
      }
    }
    /* Donne à une articulation sa rotation dans le monde (et, au besoin, sa place). */
    poserMonde(nom, q, pos) {
      const b = this.i[nom];
      this.ql[b].copy(this.qw[this.parent[b]]).invert().multiply(q);
      this.pFixe[b] = pos ? pos.clone() : null;
      this.majMonde();
    }
    monde(nom) { return this.pw[this.i[nom]].clone(); }
    qMonde(nom) { return this.qw[this.i[nom]].clone(); }
    /* Les matrices de pose pour le moteur : une 3×4 par articulation (rotation, puis déplacement), par lignes. */
    matrices() {
      const m = this.mats;
      for (let b = 0; b < this.nb; b++) {
        const q = this.qw[b], c = this.tete[b], p = this.pw[b], x = q.x, y = q.y, z = q.z, w = q.w, o = b * 12;
        const r0 = 1 - 2 * (y * y + z * z), r1 = 2 * (x * y - z * w), r2 = 2 * (x * z + y * w), r3 = 2 * (x * y + z * w), r4 = 1 - 2 * (x * x + z * z), r5 = 2 * (y * z - x * w), r6 = 2 * (x * z - y * w), r7 = 2 * (y * z + x * w), r8 = 1 - 2 * (x * x + y * y);
        m[o] = r0; m[o + 1] = r1; m[o + 2] = r2; m[o + 3] = p.x - (r0 * c.x + r1 * c.y + r2 * c.z);
        m[o + 4] = r3; m[o + 5] = r4; m[o + 6] = r5; m[o + 7] = p.y - (r3 * c.x + r4 * c.y + r5 * c.z);
        m[o + 8] = r6; m[o + 9] = r7; m[o + 10] = r8; m[o + 11] = p.z - (r6 * c.x + r7 * c.y + r8 * c.z);
      }
      return m;
    }
    /* Bassin, colonne, cou et tête ; renvoie de quoi placer mains et matériel.
       Épaules au repos (la ceinture scapulaire suivra le bras dans poser). */
    tronc(p) {
      const q = nom => this.ql[this.i[nom]];
      this.posRacine.copy(p.bassin.pos); q('bassin').copy(p.bassin.rot);
      const lomb = rad(p.lombaires || 0), thor = rad(p.thorax || 0), cou = rad(p.cou || 0);
      const inclin = rad(p.inclinaison || 0), vrille = rad(p.torsion || 0);
      // Les lombaires fléchissent et s'inclinent ; le thorax tourne surtout sur lui-même.
      for (const nom of ['L5', 'L4', 'L3', 'L2', 'L1']) q(nom).copy(qAxe(AX, lomb / 5).multiply(qAxe(AZ, inclin * 0.14)).multiply(qAxe(AY, vrille * 0.04)));
      q('thorax').copy(qAxe(AX, thor).multiply(qAxe(AZ, inclin * 0.3)).multiply(qAxe(AY, vrille * 0.8)));
      for (const nom of ['cou1', 'cou2', 'cou3']) q(nom).copy(qAxe(AX, cou / 3));
      q('tete').copy(qAxe(AX, rad(p.tete || 0)));
      for (const [, , x] of COTES) q('clavicule' + x).identity();
      this.pFixe.fill(null);
      this.majMonde();
      return {
        epaules: { G: this.monde('humerus.G'), D: this.monde('humerus.D') },
        hanches: { G: this.monde('femur.G'), D: this.monde('femur.D') },
        cou: this.monde('cou1'), qThorax: this.qMonde('thorax'), qBassin: this.qMonde('bassin')
      };
    }
    /* Place tout le corps ; renvoie où sont les mains (pour le matériel). */
    poser(p) {
      this.tronc(p);
      const info = { prises: {}, axes: {}, poignets: {}, angles: {} };
      for (const [c, s, x] of COTES) this.bras(c, s, x, p.bras[c], info);
      for (const [c, s, x] of COTES) this.jambe(c, x, p.jambes[c], info);
      return info;
    }
    /* Jusqu'où avancent les jambes (cuisses, genoux, tibias) entre deux
       hauteurs, pour la pose donnée : la barre doit passer devant. */
    devantJambes(p, yMin, yMax) {
      this.tronc(p);
      const info = { angles: {} };
      for (const [c, , x] of COTES) this.jambe(c, x, p.jambes[c], info);
      const pe = this.peauJambes; if (!pe) return 0.12;
      const m = this.matrices();
      let z = -Infinity;
      for (let cote = 0; cote < 2; cote++) for (let v = 0; v < pe.n; v++) {
        const X = cote ? -pe.P[v * 3] : pe.P[v * 3], Y = pe.P[v * 3 + 1], Z = pe.P[v * 3 + 2];
        let y = 0, zz = 0;
        for (let k = 0; k < 4; k++) {
          const w = pe.W[v * 4 + k]; if (!w) continue;
          const o = (cote ? this.S[pe.J[v * 4 + k]].jumeau : pe.J[v * 4 + k]) * 12;
          y += w * (m[o + 4] * X + m[o + 5] * Y + m[o + 6] * Z + m[o + 7]); zz += w * (m[o + 8] * X + m[o + 9] * Y + m[o + 10] * Z + m[o + 11]);
        }
        if (y >= yMin && y <= yMax && zz > z) z = zz;
      }
      return z === -Infinity ? 0.12 : z;
    }
    /* Un bras. Soit une cible pour la main (prise, pôle du coude), soit les
       directions du bras et de l'avant-bras ; paume : vers où regarde la
       paume ; dirMain : vers où pointent les doigts (par défaut, dans l'axe de
       l'avant-bras) ; doigts : 'barre', 'plat' ou 'detendu'. */
    bras(c, s, x, b, info) {
      const L = this.L, R = this.R[c], i = this.i;
      const QT = this.qw[i.thorax].clone();
      const paume = unite(b.paume || AZ);
      let d1, d2, coude;
      const resoudre = () => {
        const ep = this.pw[i['humerus' + x]];
        if (b.dirBras) {
          d1 = unite(b.dirBras); d2 = unite(b.dirAvantBras || b.dirBras);
          coude = ep.clone().add(d1.clone().multiplyScalar(L.bras));
          return;
        }
        // La barre est dans le creux de la main ; le poignet est en retrait, dans l'axe des doigts.
        const creux = b.prise.clone().sub(paume.clone().multiplyScalar(L.creux));
        const r = b.dirMain ? ik2(ep, creux.sub(unite(b.dirMain).multiplyScalar(L.main)), L.bras, L.avantBras, b.pole) : ik2(ep, creux, L.bras, L.prise, b.pole);
        coude = r.milieu; d1 = unite(coude.clone().sub(ep)); d2 = unite(r.fin.clone().sub(coude));
      };
      // 1. La ceinture scapulaire (clavicule et omoplate) accompagne le bras, mesuré depuis le thorax.
      resoudre();
      const libre0 = arc(R.bras.d1.clone().applyQuaternion(QT), d1).multiply(QT);
      this.poserMonde('clavicule' + x, QT.clone().slerp(libre0, K_CEINTURE));
      // 2. Le bras, depuis l'épaule ainsi déplacée.
      resoudre();
      const libre = arc(R.bras.d1.clone().applyQuaternion(QT), d1).multiply(QT);   // bras orienté, sans rotation sur son axe
      // Sens où plie le coude ; bras tendu : à l'opposé du pôle (ou sans rotation sur l'axe).
      let f = perp(d2, d1);
      if (f.length() < 0.03) f = b.pole ? perp(b.pole.clone().multiplyScalar(-1), d1) : perp(R.bras.f.clone().applyQuaternion(libre), d1);
      f.normalize();
      const Q1 = qVers(R.bras.d1, R.bras.f, d1, f);
      // Le coude : une charnière.
      const theta = Math.atan2(d2.dot(f), d2.dot(d1));
      let Q2 = qAxe(R.bras.h.clone().applyQuaternion(Q1), theta - R.bras.theta0).multiply(Q1);
      Q2 = arc(R.bras.d2.clone().applyQuaternion(Q2), d2).multiply(Q2);
      // L'humérus tourne sur son axe à l'épaule ; l'ulna suit le coude.
      this.poserMonde('humerus' + x, Q1);
      this.poserMonde('ulna' + x, Q2, coude);
      // La main. Sa rotation autour de l'avant-bras est la pronation : c'est le radius qui tourne autour de l'ulna,
      // de 0° (paume en avant, position anatomique) à 175° environ ; le poignet prend le reste.
      const dirMain = unite(b.dirMain || d2);
      const QM = qVers(R.main.d, R.main.paume, dirMain, paume);
      let pron = s * torsion(QM.clone().multiply(Q2.clone().invert()), d2);
      if (pron < -Math.PI / 3) pron += 2 * Math.PI;
      pron = Math.min(rad(175), Math.max(rad(-15), pron));
      this.poserMonde('radius' + x, qAxe(d2, s * pron).multiply(Q2));
      this.poserMonde('main' + x, QM);
      // Doigts : refermés sur la barre, à plat, ou détendus.
      const plis = { barre: [1.05, 1.25, 0.85], plat: [0.03, 0.03, 0.02], detendu: [0.28, 0.42, 0.3] }[b.doigts || 'detendu'];
      for (let fg = 1; fg <= 5; fg++) for (let j = 1; j <= 3; j++) this.ql[i[`doigt${fg}-${j}` + x]].copy(qAxe(R.doigts[fg], plis[j - 1] * (fg === 1 ? 0.7 : 1)));
      this.majMonde();
      const poignet = this.pw[i['main' + x]].clone();
      info.poignets[c] = poignet;
      info.prises[c] = poignet.clone().add(dirMain.clone().multiplyScalar(L.main)).add(paume.clone().multiplyScalar(L.creux));
      info.axes[c] = paume.clone().cross(dirMain).normalize();
      info.angles[c] = { pronation: pron * 180 / Math.PI, coude: theta * 180 / Math.PI };
    }
    /* Une jambe : cheville (cible), pôle du genou, direction et dessus du pied. */
    jambe(c, x, j, info) {
      const L = this.L, R = this.R[c], i = this.i;
      const ha = this.pw[i['femur' + x]];
      const pole = unite(j.pole || AZ);
      const r = ik2(ha, j.cheville, L.cuisse, L.jambe, pole);
      const genou = r.milieu, d1 = unite(genou.clone().sub(ha)), d2 = unite(r.fin.clone().sub(genou));
      let f = perp(d2, d1);
      if (f.length() < 0.03) f = perp(pole.clone().multiplyScalar(-1), d1);
      f.normalize();
      const Q1 = qVers(R.jambe.d1, R.jambe.f, d1, f);
      // Le genou : une charnière.
      const theta = Math.atan2(d2.dot(f), d2.dot(d1));
      let Q2 = qAxe(R.jambe.h.clone().applyQuaternion(Q1), theta - R.jambe.theta0).multiply(Q1);
      Q2 = arc(R.jambe.d2.clone().applyQuaternion(Q2), d2).multiply(Q2);
      this.poserMonde('femur' + x, Q1);
      this.poserMonde('tibia' + x, Q2, genou);
      // Le pied : direction de la pointe et dessus du pied.
      this.poserMonde('pied' + x, qVers(R.pied, AY, unite(j.pied || AZ), j.hautPied || AY));
      info.angles['jambe' + c] = { genou: theta * 180 / Math.PI };
    }
  }

  /* ---------- Le matériel : barre, haltères, banc, barre fixe ----------
     Chaque objet est une liste de formes simples (cylindre le long de Y, boîte) posées dans son repère. */
  const TEINTES = {
    sombre: { metal: [205, 208, 216], fonte: [44, 45, 50], banc: [58, 59, 66], cadre: [96, 98, 106] },
    clair: { metal: [186, 189, 197], fonte: [52, 53, 58], banc: [70, 71, 78], cadre: [120, 122, 130] }
  };
  const COUCHE = qAxe(AZ, Math.PI / 2);   // un cylindre couché le long de X
  const cyl = (r, l, x, y, z, couleur, metal, q) => ({ forme: 'cylindre', s: [r, l, r], p: V(x, y, z), q: q || COUCHE, couleur, metal });
  const boite = (lx, ly, lz, x, y, z, couleur, metal) => ({ forme: 'boite', s: [lx, ly, lz], p: V(x, y, z), q: new Quat(), couleur, metal });
  function barre(C, longueur = 1.6, disques = true) {
    const f = [cyl(0.0135, longueur, 0, 0, 0, C.metal, 1)];
    for (const s of [1, -1]) {
      f.push(cyl(0.025, 0.36, s * (longueur / 2 - 0.18), 0, 0, C.metal, 1));
      if (disques) for (const [x, r, e] of [[0.56, 0.225, 0.05], [0.615, 0.17, 0.035]]) f.push(cyl(r, e, s * x, 0, 0, C.fonte, 0));
    }
    return f;
  }
  function haltere(C) { return [cyl(0.016, 0.15, 0, 0, 0, C.metal, 1), cyl(0.062, 0.05, 0.1, 0, 0, C.fonte, 0), cyl(0.062, 0.05, -0.1, 0, 0, C.fonte, 0)]; }
  function banc(C, longueur = 1.15, hauteur = 0.44) {
    const f = [boite(0.29, 0.06, longueur, 0, hauteur - 0.03, 0, C.banc, 0)];
    for (const z of [-longueur / 2 + 0.12, longueur / 2 - 0.12]) { f.push(boite(0.05, hauteur - 0.06, 0.05, 0, (hauteur - 0.06) / 2, z, C.cadre, 0.6)); f.push(boite(0.36, 0.035, 0.06, 0, 0.0175, z, C.cadre, 0.6)); }
    return f;
  }
  function barreFixe(C, hauteur) {
    const f = [cyl(0.016, 1.3, 0, hauteur, 0, C.metal, 1)];
    for (const s of [1, -1]) f.push(boite(0.05, hauteur + 0.08, 0.05, s * 0.65, (hauteur + 0.08) / 2, 0, C.cadre, 0.5));
    return f;
  }
  /* Pose un objet (liste de formes) dans le monde : position, rotation. Renvoie les formes prêtes pour le moteur. */
  function poserObjet(formes, pos, rot, sortie) {
    for (const f of formes) {
      const q = rot ? rot.clone().multiply(f.q) : f.q, p = rot ? f.p.clone().applyQuaternion(rot).add(pos) : f.p.clone().add(pos);
      sortie.push({ forme: f.forme, s: f.s, q: [q.x, q.y, q.z, q.w], p: [p.x, p.y, p.z], couleur: f.couleur, metal: f.metal });
    }
  }

  /* ---------- Mouvements types ----------
     Chacun reçoit u (0 = départ, 1 = fin du mouvement) et le corps (mesures,
     repères du tronc), et renvoie la pose et le matériel. Matériel : barre
     ({ pos, rot } ou pos: 'mains' = entre les deux mains), haltères (dans les
     mains), banc, barre fixe. */
  function piedsAuSol(c, ecart = 0.12, ouverture = 12, z = 0) {
    const j = {};
    for (const [k, s] of COTES) {
      const avant = V(s * Math.sin(rad(ouverture)), 0, Math.cos(rad(ouverture)));
      // Le genou suit la pointe du pied.
      j[k] = { cheville: V(s * ecart, c.L.chevilleH, z + c.L.racine.z + c.L.hanche.z), pole: avant, pied: avant };
    }
    return j;
  }
  const debout = (c, dy = 0, dz = 0, inclinaison = 0) => ({ pos: c.L.racine.clone().add(V(0, dy, dz)), rot: qAxe(AX, rad(inclinaison)) });
  const IDENTITE = new Quat();

  const MOUVEMENTS = {
    /* Debout, bras un peu écartés : pour regarder le corps. */
    repos(u, c) {
      const p = { bassin: debout(c), jambes: piedsAuSol(c, 0.1, 8), bras: {} };
      for (const [k, s] of COTES) p.bras[k] = { dirBras: V(s * 0.2, -1, -0.03), dirAvantBras: V(s * 0.16, -1, 0.14), paume: V(-s * 0.2, 0, 1), doigts: 'detendu' };
      return { pose: p, materiel: {} };
    },
    squat(u, c) {
      const p = { bassin: debout(c, lerp(0, -0.4, u), lerp(0, -0.2, u), lerp(2, 30, u)), lombaires: lerp(0, 4, u), thorax: lerp(0, 6, u), cou: lerp(0, -22, u), jambes: piedsAuSol(c, 0.17, 20) };
      const t = c.tronc(p);
      // La barre sur les trapèzes, derrière la nuque.
      const barreP = t.cou.clone().add(V(0, -0.035, -0.105).applyQuaternion(t.qThorax));
      const axe = AX.clone().applyQuaternion(t.qThorax);
      p.bras = {};
      for (const [k, s] of COTES) p.bras[k] = { prise: barreP.clone().add(axe.clone().multiplyScalar(s * 0.37)), pole: V(s * 0.25, -1, -0.55), paume: V(0, 0.35, 1).applyQuaternion(t.qThorax), doigts: 'barre' };
      return { pose: p, materiel: { barre: { pos: barreP, rot: t.qThorax } } };
    },
    developpeCouche(u, c) {
      // Allongé sur le banc (44 cm), la tête vers -Z, les pieds au sol.
      const p = { bassin: { pos: V(0, 0.44 + c.L.dos - 0.012, 0.27), rot: qAxe(AX, rad(-90)) }, lombaires: -6, thorax: -4, cou: 6, jambes: {} };
      for (const [k, s] of COTES) p.jambes[k] = { cheville: V(s * 0.27, c.L.chevilleH, 0.76), pole: V(s * 0.25, 1, 0.3), pied: V(s * 0.25, 0, 1) };
      const t = c.tronc(p);
      const milieu = t.epaules.G.clone().add(t.epaules.D).multiplyScalar(0.5);
      // Barre : bras tendus au-dessus des épaules, puis sur le bas de la poitrine.
      const haut = milieu.clone().add(V(0, c.L.bras + c.L.prise - 0.035, 0.03));
      const bas = milieu.clone().add(V(0, 0.155, 0.13));
      const barreP = haut.clone().lerp(bas, u);
      p.bras = {};
      for (const [k, s] of COTES) p.bras[k] = { prise: barreP.clone().add(V(s * 0.38, 0, 0)), pole: V(s * 0.75, -1, 0.35), paume: V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'barre' };
      return { pose: p, materiel: { barre: { pos: barreP, rot: IDENTITE }, banc: { pos: V(0, 0, 0.0) } } };
    },
    curl(u, c) {
      const p = { bassin: debout(c), jambes: piedsAuSol(c, 0.1, 10), bras: {} };
      const angle = rad(lerp(12, 138, u));
      for (const [k, s] of COTES) {
        // Coudes au corps ; l'avant-bras monte, paume vers le haut.
        const dirAvantBras = V(s * 0.06, -Math.cos(angle), Math.sin(angle));
        p.bras[k] = { dirBras: V(s * 0.14, -1, lerp(0.0, 0.08, u)), dirAvantBras, paume: V(0, Math.sin(angle), Math.cos(angle)), doigts: 'barre' };
      }
      return { pose: p, materiel: { halteres: true } };
    },
    traction(u, c) {
      const hauteur = 2.42;
      const p = { bassin: { pos: c.L.racine.clone(), rot: qAxe(AX, rad(lerp(0, -10, u))) }, lombaires: lerp(0, -6, u), thorax: lerp(0, -6, u), cou: lerp(-4, 14, u), jambes: {} };
      // Hauteur du corps : épaules à une longueur de bras sous la barre, puis menton à la barre ;
      // le corps recule en montant : la barre passe devant le menton.
      let t = c.tronc(p);
      const yEp = lerp(hauteur - (c.L.bras + c.L.prise) * 0.9, hauteur - 0.17, u);
      p.bassin.pos.y += yEp - t.epaules.G.y; p.bassin.pos.z += lerp(0.02, -0.1, u) - t.epaules.G.z;
      t = c.tronc(p);
      for (const [k] of COTES) {
        const genou = t.hanches[k].clone().add(V(0, -1, 0.1).normalize().multiplyScalar(c.L.cuisse));
        p.jambes[k] = { cheville: genou.clone().add(V(0, -1, -0.55).normalize().multiplyScalar(c.L.jambe)), pole: V(0, 0, 1), pied: V(0, -0.75, 1) };
      }
      p.bras = {};
      for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.36, hauteur, 0.02), pole: V(s * 1, -0.2, -0.25), paume: V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'barre' };
      return { pose: p, materiel: { barreFixe: { hauteur } } };
    },
    pompe(u, c) {
      const L = c.L;
      const cheville = V(0, 0.105, -1.22);
      const p = { bassin: { pos: V(), rot: new Quat() }, lombaires: 0, thorax: 0, cou: -22, jambes: {} };
      // Corps gainé : il tourne autour des chevilles jusqu'à la hauteur d'épaules voulue.
      const planche = hEp => {
        let alpha = 0.3, t;
        for (let k = 0; k < 5; k++) {
          p.bassin.rot = qAxe(AX, Math.PI / 2 - alpha);
          const dir = V(0, Math.sin(alpha), Math.cos(alpha));
          p.bassin.pos = cheville.clone().add(dir.multiplyScalar(L.jambe + L.cuisse - 0.004)).sub(L.hanche.clone().setX(0).applyQuaternion(p.bassin.rot));
          t = c.tronc(p);
          alpha += Math.asin(Math.max(-0.9, Math.min(0.9, (hEp - t.epaules.G.y) / 1.4)));
        }
        return t;
      };
      // En haut : bras presque tendus ; les mains se posent sous les épaules de cette position.
      const hHaut = 0.016 + 0.95 * (L.bras + L.avantBras);
      const zMains = planche(hHaut).epaules.G.z + 0.03;
      planche(lerp(hHaut, 0.19, u));
      // Sur la pointe des pieds : les orteils vers le sol, le dessus du pied vers la tête.
      for (const [k, s] of COTES) p.jambes[k] = { cheville: V(s * 0.09, cheville.y, cheville.z), pole: V(0, -1, 0.15), pied: V(0, -1, 0.22), hautPied: V(0, 0.2, 1) };
      p.bras = {};
      // Mains à plat sous les épaules, doigts vers l'avant ; la cible est le creux de la main.
      for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.25, -0.008, zMains), pole: V(s * 0.75, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
      return { pose: p, materiel: {} };
    },
    elevationsLaterales(u, c) {
      const p = { bassin: debout(c), thorax: 2, jambes: piedsAuSol(c, 0.1, 10), bras: {} };
      const phi = rad(lerp(12, 86, u));
      for (const [k, s] of COTES) {
        // Bras presque tendus, levés sur les côtés ; paumes vers les cuisses, puis vers le sol.
        const dirBras = V(s * Math.sin(phi), -Math.cos(phi), 0.08);
        p.bras[k] = { dirBras, dirAvantBras: dirBras.clone().normalize().add(V(0, 0.02, 0.26)), paume: V(-s * Math.cos(phi), -Math.sin(phi), 0), doigts: 'barre' };
      }
      return { pose: p, materiel: { halteres: true } };
    },
    souleveDeTerre(u, c) {
      const k = u, L = c.L, xMain = 0.27, rayon = 0.0135;
      // Du sol aux genoux, les jambes poussent (le buste reste penché) ; ensuite le buste se redresse.
      const penche = lisse(Math.min(1, k / 0.5));
      const corps = () => ({ bassin: debout(c, 0, lerp(-0.01, -0.3, penche), lerp(2, 58, penche) + 5 * Math.max(0, (k - 0.5) / 0.5)), lombaires: lerp(0, 4, penche), thorax: lerp(0, 5, penche), cou: lerp(0, -30, penche), jambes: piedsAuSol(c, 0.14, 12, 0) });
      // Bras tendus jusqu'à la barre : à quelle hauteur sont les épaules au-dessus du poignet.
      const portee = (L.bras + L.avantBras) * 0.985;
      const epaules = (p, zBarre) => { const e = c.tronc(p).epaules.G; const dz = zBarre + L.creux - e.z, dx = xMain - e.x; return { y: e.y, chute: Math.sqrt(Math.max(1e-4, portee * portee - dz * dz - dx * dx)) }; };
      // Hauteur de la barre : bras tendus debout, puis disques au sol (rayon 22,5 cm).
      const debout0 = { bassin: debout(c, 0, -0.01, 2), jambes: piedsAuSol(c, 0.14, 12, 0) };
      const zHaut = c.devantJambes(debout0, 0.6, 1.0) + rayon + 0.004;
      const haut = epaules(debout0, zHaut);
      const yBarre = lerp(haut.y - haut.chute - L.main, 0.225, k);
      // La barre longe les jambes : elle passe juste devant les cuisses, les genoux puis les tibias.
      const p = corps();
      let zBarre = zHaut;
      for (let passe = 0; passe < 3; passe++) {
        const e = epaules(p, zBarre);
        p.bassin.pos.y += yBarre + L.main + e.chute - e.y;
        zBarre = Math.max(0.12, c.devantJambes(p, yBarre - 0.03, yBarre + 0.03) + rayon + 0.004);
      }
      const barreP = V(0, yBarre, zBarre);
      p.bras = {};
      for (const [kk, s] of COTES) p.bras[kk] = { prise: barreP.clone().setX(s * xMain), pole: V(s * 0.3, 0, -1), paume: V(0, 0, -1), dirMain: V(0, -1, 0), doigts: 'barre' };
      return { pose: p, materiel: { barre: { pos: barreP, rot: IDENTITE } } };
    },
    rowing(u, c) {
      const p = { bassin: debout(c, -0.1, -0.17, 46), lombaires: 4, thorax: 5, cou: -30, jambes: piedsAuSol(c, 0.15, 10, -0.02) };
      const t = c.tronc(p);
      const ventre = c.monde('L3').add(V(0, 0.02, 0.165).applyQuaternion(t.qThorax));
      p.bras = {};
      for (const [k, s] of COTES) {
        const pendante = t.epaules[k].clone().add(V(s * 0.05, -(c.L.bras + c.L.prise) + 0.03, 0.02));
        const tiree = ventre.clone().add(V(s * 0.25, -0.03, 0));
        p.bras[k] = { prise: pendante.lerp(tiree, u), pole: V(s * 0.4, 0.5, -1), paume: V(0, 0, -1), doigts: 'barre' };
      }
      return { pose: p, materiel: { barre: { pos: 'mains', rot: IDENTITE } } };
    }
  };

  /* Vues : azimut (0 = de face, 90 = côté gauche du corps), hauteur. */
  const VUES = {
    repos: { az: 0, el: 4 }, squat: { az: 38, el: 8 }, developpeCouche: { az: 150, el: 30 }, curl: { az: 34, el: 6 }, traction: { az: 205, el: 4 },
    pompe: { az: 84, el: 12 }, elevationsLaterales: { az: 14, el: 6 }, souleveDeTerre: { az: 128, el: 10 }, rowing: { az: 136, el: 12 }
  };

  /* ---------- Animation d'un exercice sur l'atlas ----------
     atlas : le moteur (AnqaAtlas.creer ou monte.atlas) ; exo : { mouvement, periode } ; options : { clair, vue }. */
  function creerAnimation(atlas, exo, options) {
    options = options || {};
    const C = TEINTES[options.clair ? 'clair' : 'sombre'];
    const corps = new Corps(atlas.squelette, atlas.peau ? atlas.peau(['bassin', 'cuisse', 'jambe', 'abdomen', 'dos']) : null);
    const mouvement = MOUVEMENTS[exo.mouvement];
    if (!mouvement) throw new Error('mouvement inconnu : ' + exo.mouvement);
    const init = mouvement(0, corps);
    const modeles = {};
    if (init.materiel.barre) modeles.barre = barre(C);
    if (init.materiel.banc) modeles.banc = banc(C);
    if (init.materiel.barreFixe) modeles.barreFixe = barreFixe(C, init.materiel.barreFixe.hauteur);
    if (init.materiel.halteres) modeles.haltere = haltere(C);
    let derniere = null;
    function placer(r) {
      const info = derniere = corps.poser(r.pose), m = r.materiel, formes = [];
      if (m.barre && modeles.barre) {
        const pos = m.barre.pos === 'mains' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5).setX(0) : m.barre.pos;
        poserObjet(modeles.barre, pos, m.barre.rot, formes);
      }
      if (m.banc && modeles.banc) poserObjet(modeles.banc, m.banc.pos, null, formes);
      if (modeles.barreFixe) poserObjet(modeles.barreFixe, V(), null, formes);
      // Haltères : dans la main, la poignée en travers de la paume.
      if (m.halteres && modeles.haltere) for (const k of ['G', 'D']) poserObjet(modeles.haltere, info.prises[k], arc(AX, info.axes[k]), formes);
      return { info, formes };
    }
    // Cadrage : tout ce qui se voit pendant la répétition entière (articulations, plus une marge pour la chair ; matériel).
    const mini = [1e9, 1e9, 1e9], maxi = [-1e9, -1e9, -1e9];
    const etendre = (x, y, z, r) => { mini[0] = Math.min(mini[0], x - r); mini[1] = Math.min(mini[1], y - r); mini[2] = Math.min(mini[2], z - r); maxi[0] = Math.max(maxi[0], x + r); maxi[1] = Math.max(maxi[1], y + r); maxi[2] = Math.max(maxi[2], z + r); };
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const { formes } = placer(mouvement(u, corps));
      for (const pt of corps.pw) etendre(pt.x, pt.y, pt.z, 0.09);
      // Le matériel : les huit coins de chaque forme, tournés et posés.
      for (const f of formes) {
        const q = new Quat(f.q[0], f.q[1], f.q[2], f.q[3]), d = f.forme === 'boite' ? [f.s[0] / 2, f.s[1] / 2, f.s[2] / 2] : [f.s[0], f.s[1] / 2, f.s[2]];
        for (let k = 0; k < 8; k++) { const c = V(k & 1 ? d[0] : -d[0], k & 2 ? d[1] : -d[1], k & 4 ? d[2] : -d[2]).applyQuaternion(q); etendre(f.p[0] + c.x, f.p[1] + c.y, f.p[2] + c.z, 0); }
      }
    }
    mini[1] = Math.max(0, mini[1]);
    const vue = options.vue || VUES[exo.mouvement] || { az: 45, el: 10 };
    function rendre(t, uFixe) {
      const { info, formes } = placer(mouvement(uFixe != null ? uFixe : cycle(t, exo.periode || 2.8), corps));
      atlas.poser(corps.matrices());
      atlas.objets(formes);
      const b = corps.pw[0];
      atlas.ombre({ centre: [(mini[0] + maxi[0]) / 2, (mini[2] + maxi[2]) / 2], taille: [Math.max(0.45, (maxi[0] - mini[0]) * 0.5), Math.max(0.45, (maxi[2] - mini[2]) * 0.5)], pieds: false, force: b.y > 1.4 ? 0.5 : 1 });
      return info;
    }
    let actif = false, t0 = 0;
    const pas = tSec => { if (!actif) return false; if (!t0) t0 = tSec; rendre(tSec - t0); return true; };
    return {
      corps, rendre, boite: { min: mini, max: maxi }, vue,
      cadrer(duree) { atlas.cadrerBoite(mini, maxi, vue, duree); },
      demarrer() { if (!actif) { actif = true; t0 = 0; atlas.animer(pas); } },
      arreter() { actif = false; atlas.animer(null); },
      // Retour à la position anatomique, sans matériel.
      quitter() { actif = false; atlas.animer(null); atlas.poser(null); atlas.objets([]); atlas.ombre(null); }
    };
  }

  window.AnqaMouvements = { creerAnimation, MOUVEMENTS, VUES, cycle, Corps };
})();
