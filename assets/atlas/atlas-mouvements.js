/* =====================================================================
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
  /* ---------- Vecteurs et quaternions : le strict nécessaire ---------- */
  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new V3(this.x, this.y, this.z); }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setX(x) { this.x = x; return this; }
    setY(y) { this.y = y; return this; }
    setZ(z) { this.z = z; return this; }
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


  /* ---------- Poses : mélange de deux poses, valeur par valeur ----------
     Nombres et vecteurs : interpolation droite ; rotations : au plus court ; le reste (textes) : celui de la pose
     la plus proche. Les deux poses doivent décrire chaque membre de la même façon (cible, ou angles). */
  function mel(a, b, u) {
    if (a === b || b === undefined) return a;
    if (a === undefined) return b;
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
    if (a instanceof V3 && b instanceof V3) return a.clone().lerp(b, u);
    if (a instanceof Quat && b instanceof Quat) return a.clone().slerp(b, u);
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
      const r = {};
      for (const k in a) r[k] = mel(a[k], b[k], u);
      for (const k in b) if (!(k in a)) r[k] = b[k];
      return r;
    }
    return u < 0.5 ? a : b;
  }
  const borne = (x, a, b) => Math.min(b, Math.max(a, x));
  /* Premier x entre a et b (parcouru par pas) où f change de signe, affiné par dichotomie ; à défaut, le x où |f| est le
     plus petit. Sert quand une contrainte a plusieurs solutions et qu'on veut la première. */
  function premierZero(f, a, b, pas) {
    let x0 = a, f0 = f(a), xMin = a, fMin = Math.abs(f0);
    for (let x = a + pas; (pas > 0 ? x <= b : x >= b); x += pas) {
      const fx = f(x);
      if (Math.abs(fx) < fMin) { fMin = Math.abs(fx); xMin = x; }
      if (f0 === 0 || fx * f0 < 0) {
        let g = x0, h = x, fg = f0;
        for (let i = 0; i < 18; i++) { const m = (g + h) / 2, fm = f(m); if (fm * fg <= 0) h = m; else { g = m; fg = fm; } }
        return (g + h) / 2;
      }
      x0 = x; f0 = fx;
    }
    return xMin;
  }
  /* Cherche x tel que f(x) = 0 (méthode de la sécante, pas bornés) : sert à régler une pose sur une contrainte. */
  function zeroDe(f, x0, x1, pasMax, n) {
    let f0 = f(x0), f1 = f(x1);
    for (let i = 0; i < (n || 12) && Math.abs(f1) > 2e-4; i++) {
      const pente = (f1 - f0) / ((x1 - x0) || 1e-9), x2 = Math.abs(pente) < 1e-9 ? x1 + (pasMax || 10) * 0.3 : borne(x1 - f1 / pente, x1 - (pasMax || 10), x1 + (pasMax || 10));
      x0 = x1; f0 = f1; x1 = x2; f1 = f(x1);
    }
    return x1;
  }
  const sin = d => Math.sin(d * Math.PI / 180), cos = d => Math.cos(d * Math.PI / 180);
  /* Rotation « avant/arrière » (autour de X), « côté » (autour de Z), « lacet » (autour de Y), en degrés. */
  const qX = d => qAxe(AX, rad(d)), qY = d => qAxe(AY, rad(d)), qZ = d => qAxe(AZ, rad(d));

  /* ---------- Le corps : squelette de mouvement et solveur de pose ----------
     Une pose décrit : le bassin (place et orientation), la colonne (angles), et chaque membre de l'une de ces façons :
       bras  — cible { prise, pole, paume, dirMain } (la main va à un endroit précis)
             — directions { dirBras, dirAvantBras, paume } dans le monde
             — angles anatomiques { plan, elev, rot, coude, pron, poignet } dans le repère du thorax :
               plan d'élévation (0 = vers l'avant, 90 = sur le côté), élévation (0 = bras le long du corps, 90 =
               à l'horizontale, 180 = à la verticale ; négative = vers l'arrière), rotation externe de l'humérus,
               flexion du coude, pronation (0 = supination, 90 = prise marteau, 180 = pronation), flexion du poignet ;
       jambe — cible { cheville, pole, pied, hautPied }
             — angles { flex, abd, rot, genou, pointe } dans le repère du bassin : flexion et abduction de la
               hanche, rotation externe, flexion du genou, extension de la cheville (pointe du pied).
     Options communes aux bras : hausse (épaule haussée) et avance (épaule portée en avant), en degrés ; doigts.
     Options des jambes : orteils (flexion des orteils quand le pied est sur la pointe). */
  class Corps {
    /* squelette : articulations de l'atlas ({ nom, parent, centre, jumeau }) ; sourcePeau(regions) : points de la
       surface du corps au repos ({ n, P, J, W }) pour mesurer le corps posé (appuis, contrôles). */
    constructor(squelette, sourcePeau) {
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
      this.sourcePeau = typeof sourcePeau === 'function' ? sourcePeau : null;
      this.peaux = {};
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
        epaule: T('humerus.G').clone().sub(T('bassin')),
        // Le pied : de la cheville à l'articulation des orteils (vers l'avant, vers le bas), au repos.
        avantPied: Math.hypot(T('orteils.G').x - T('pied.G').x, T('orteils.G').z - T('pied.G').z),
        orteilsH: T('orteils.G').y,
        dos: 0.11, poitrine: 0.12, ventre: 0.1, fesses: 0.1, genou: 0.05, flanc: 0.16
      };
      L.prise = L.avantBras + L.main;
      L.taille = T('tete').y + 0.16;
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
      this.mesurer();
    }
    /* Épaisseurs du corps, mesurées sur la peau au repos : du bassin à la surface du dos, du ventre, etc. */
    mesurer() {
      const L = this.L, pe = this.peau(['bassin', 'cuisse', 'abdomen', 'dos', 'thorax']);
      if (!pe) return;
      const b = L.racine, thor = this.tete[this.i.thorax];
      let zDos = Infinity, zVentre = -Infinity, zPoitrine = -Infinity, zFesses = Infinity, xFlanc = 0;
      for (let v = 0; v < pe.n; v++) {
        const x = pe.P[v * 3], y = pe.P[v * 3 + 1], z = pe.P[v * 3 + 2];
        if (y > b.y - 0.05 && y < b.y + 0.45 && z < zDos) zDos = z;
        if (y > b.y - 0.02 && y < b.y + 0.2 && z > zVentre) zVentre = z;
        if (y > thor.y + 0.12 && y < thor.y + 0.3 && z > zPoitrine) zPoitrine = z;
        if (y > b.y - 0.2 && y < b.y + 0.02 && z < zFesses) zFesses = z;
        if (y > b.y - 0.1 && y < b.y + 0.1 && Math.abs(x) > xFlanc) xFlanc = Math.abs(x);
      }
      if (isFinite(zDos)) L.dos = b.z - zDos;
      if (isFinite(zVentre)) L.ventre = zVentre - b.z;
      if (isFinite(zPoitrine)) L.poitrine = zPoitrine - thor.z;
      if (isFinite(zFesses)) L.fesses = b.z - zFesses;
      if (xFlanc) L.flanc = xFlanc;
    }
    /* Points de la surface du corps pour des régions (mis de côté une fois lus). */
    peau(regions) {
      if (!this.sourcePeau) return null;
      const cle = regions ? regions.join('+') : '*';
      return this.peaux[cle] || (this.peaux[cle] = this.sourcePeau(regions));
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
    /* La peau posée (les deux côtés), pour la pose en cours : appelle f(x, y, z) pour chaque point. */
    peauPosee(regions, f) {
      const pe = this.peau(regions); if (!pe) return false;
      const m = this.matrices(), S = this.S;
      for (let cote = 0; cote < 2; cote++) for (let v = 0; v < pe.n; v++) {
        const X = cote ? -pe.P[v * 3] : pe.P[v * 3], Y = pe.P[v * 3 + 1], Z = pe.P[v * 3 + 2];
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < 4; k++) {
          const w = pe.W[v * 4 + k]; if (!w) continue;
          const o = (cote ? S[pe.J[v * 4 + k]].jumeau : pe.J[v * 4 + k]) * 12;
          x += w * (m[o] * X + m[o + 1] * Y + m[o + 2] * Z + m[o + 3]);
          y += w * (m[o + 4] * X + m[o + 5] * Y + m[o + 6] * Z + m[o + 7]);
          z += w * (m[o + 8] * X + m[o + 9] * Y + m[o + 10] * Z + m[o + 11]);
        }
        f(x, y, z);
      }
      return true;
    }
    /* Jusqu'où va le corps dans la direction n (unitaire), pour la pose p : le plus grand (point · n). */
    extreme(p, n, regions) {
      this.poser(p);
      let m = -Infinity;
      if (!this.peauPosee(regions, (x, y, z) => { const d = x * n.x + y * n.y + z * n.z; if (d > m) m = d; })) {
        for (const q of this.pw) m = Math.max(m, q.dot(n) + 0.06);   // sans la peau : les articulations, plus une marge
      }
      return m;
    }
    /* Déplace le bassin de la pose p pour que le corps repose sur un plan (point Q, normale n vers le dehors). */
    poserSur(p, Q, n, regions) {
      const d = -this.extreme(p, n.clone().multiplyScalar(-1), regions) - Q.dot(n);
      p.bassin.pos.add(n.clone().multiplyScalar(-d));
      return p;
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
      const couI = rad(p.couIncl || 0) / 3, couR = rad(p.couRot || 0) / 3;
      for (const nom of ['cou1', 'cou2', 'cou3']) q(nom).copy(qAxe(AX, cou / 3).multiply(qAxe(AZ, couI)).multiply(qAxe(AY, couR)));
      q('tete').copy(qAxe(AX, rad(p.tete || 0)));
      for (const [, , x] of COTES) q('clavicule' + x).identity();
      this.pFixe.fill(null);
      this.majMonde();
      return {
        epaules: { G: this.monde('humerus.G'), D: this.monde('humerus.D') },
        hanches: { G: this.monde('femur.G'), D: this.monde('femur.D') },
        cou: this.monde('cou1'), tete: this.monde('tete'), qThorax: this.qMonde('thorax'), qBassin: this.qMonde('bassin'),
        // Un point donné dans le repère du thorax (depuis le milieu des épaules) ou du bassin, placé dans le monde.
        duThorax: v => this.monde('humerus.G').add(this.monde('humerus.D')).multiplyScalar(0.5).add(v.clone().applyQuaternion(this.qMonde('thorax'))),
        duBassin: v => this.monde('bassin').add(v.clone().applyQuaternion(this.qMonde('bassin')))
      };
    }
    /* Place tout le corps ; renvoie où sont les mains et les pieds (pour le matériel). */
    poser(p) {
      this.tronc(p);
      const info = { prises: {}, axes: {}, poignets: {}, coudes: {}, paumes: {}, dirMains: {}, chevilles: {}, genoux: {}, orteils: {}, pieds: {}, angles: {} };
      for (const [c, s, x] of COTES) this.bras(c, s, x, p.bras[c], info);
      for (const [c, s, x] of COTES) this.jambe(c, s, x, p.jambes[c], info);
      info.epaules = { G: this.monde('humerus.G'), D: this.monde('humerus.D') };
      info.hanches = { G: this.monde('femur.G'), D: this.monde('femur.D') };
      info.qThorax = this.qMonde('thorax'); info.qBassin = this.qMonde('bassin');
      info.bassin = this.monde('bassin'); info.tete = this.monde('tete'); info.cou = this.monde('cou1');
      return info;
    }
    /* Jusqu'où avancent les jambes (cuisses, genoux, tibias) entre deux
       hauteurs, pour la pose donnée : la barre doit passer devant. */
    devantJambes(p, yMin, yMax) {
      this.tronc(p);
      const info = { angles: {}, chevilles: {}, genoux: {}, orteils: {} };
      for (const [c, s, x] of COTES) this.jambe(c, s, x, p.jambes[c], info);
      let zMax = -Infinity;
      if (!this.peauPosee(['bassin', 'cuisse', 'jambe'], (x, y, z) => { if (y >= yMin && y <= yMax && z > zMax) zMax = z; })) return 0.12;
      return zMax === -Infinity ? 0.12 : zMax;
    }
    /* Un bras (voir en tête de classe les trois façons de le décrire) ; doigts : 'barre', 'plat', 'detendu', 'poing'. */
    bras(c, s, x, b, info) {
      const L = this.L, R = this.R[c], i = this.i;
      const QT = this.qw[i.thorax].clone();
      const angles = b.elev != null;
      let d1, d2, coude, fFixe = null, paume, dirMain = b.dirMain ? unite(b.dirMain) : null;
      if (angles) {
        const plan = rad(b.plan || 0), k = rad(b.coude || 0);
        const Rq = qAxe(V(Math.cos(plan), 0, -s * Math.sin(plan)), -rad(b.elev));
        const a1 = V(0, -1, 0).applyQuaternion(Rq);
        const f = V(0, 0, 1).applyQuaternion(Rq).applyQuaternion(qAxe(a1, -s * rad(b.rot || 0)));
        const a2 = a1.clone().multiplyScalar(Math.cos(k)).add(f.clone().multiplyScalar(Math.sin(k)));
        // Paume en supination : du côté des fléchisseurs ; la pronation la fait tourner autour de l'avant-bras.
        let pm = a1.clone().multiplyScalar(-Math.sin(k)).add(f.clone().multiplyScalar(Math.cos(k))).applyQuaternion(qAxe(a2, s * rad(b.pron || 0)));
        let dm = a2.clone();
        if (b.poignet) {
          const w = rad(b.poignet), pm0 = pm.clone();
          dm = a2.clone().multiplyScalar(Math.cos(w)).add(pm0.clone().multiplyScalar(Math.sin(w)));
          pm = pm0.multiplyScalar(Math.cos(w)).sub(a2.clone().multiplyScalar(Math.sin(w)));
        }
        if (b.deviation) {
          // Vers le pouce (positif) ou le petit doigt : la main tourne dans le plan de la paume.
          const r = rad(b.deviation), cote = pm.clone().cross(dm).multiplyScalar(s);
          dm = dm.clone().multiplyScalar(Math.cos(r)).add(cote.multiplyScalar(Math.sin(r)));
        }
        d1 = a1.applyQuaternion(QT); d2 = a2.applyQuaternion(QT); fFixe = f.applyQuaternion(QT);
        paume = pm.applyQuaternion(QT).normalize(); dirMain = dm.applyQuaternion(QT).normalize();
      } else paume = unite(b.paume || AZ);
      const resoudre = () => {
        const ep = this.pw[i['humerus' + x]];
        if (angles || b.dirBras) {
          if (!angles) { d1 = unite(b.dirBras); d2 = unite(b.dirAvantBras || b.dirBras); }
          coude = ep.clone().add(d1.clone().multiplyScalar(L.bras));
          return;
        }
        // La barre est dans le creux de la main ; le poignet est en retrait, dans l'axe des doigts.
        const creux = b.prise.clone().sub(paume.clone().multiplyScalar(L.creux));
        const r = dirMain ? ik2(ep, creux.sub(dirMain.clone().multiplyScalar(L.main)), L.bras, L.avantBras, b.pole) : ik2(ep, creux, L.bras, L.prise, b.pole);
        coude = r.milieu; d1 = unite(coude.clone().sub(ep)); d2 = unite(r.fin.clone().sub(coude));
      };
      // 1. La ceinture scapulaire (clavicule et omoplate) accompagne le bras, mesuré depuis le thorax ;
      //    elle peut en plus se hausser (haussement d'épaules) ou s'avancer.
      resoudre();
      const libre0 = arc(R.bras.d1.clone().applyQuaternion(QT), d1).multiply(QT);
      let qc = QT.clone().slerp(libre0, K_CEINTURE);
      if (b.hausse || b.avance) qc = qAxe(AZ.clone().applyQuaternion(QT), s * rad(b.hausse || 0)).multiply(qAxe(AY.clone().applyQuaternion(QT), -s * rad(b.avance || 0))).multiply(qc);
      this.poserMonde('clavicule' + x, qc);
      // 2. Le bras, depuis l'épaule ainsi déplacée.
      resoudre();
      const libre = arc(R.bras.d1.clone().applyQuaternion(QT), d1).multiply(QT);   // bras orienté, sans rotation sur son axe
      // Sens où plie le coude ; bras tendu : à l'opposé du pôle (ou sans rotation sur l'axe).
      let f = fFixe ? perp(fFixe, d1) : perp(d2, d1);
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
      const dMain = dirMain || d2.clone();
      const QM = qVers(R.main.d, R.main.paume, dMain, paume);
      let pron = s * torsion(QM.clone().multiply(Q2.clone().invert()), d2);
      if (pron < -Math.PI / 3) pron += 2 * Math.PI;
      pron = Math.min(rad(175), Math.max(rad(-15), pron));
      this.poserMonde('radius' + x, qAxe(d2, s * pron).multiply(Q2));
      this.poserMonde('main' + x, QM);
      // Doigts : refermés sur la barre, à plat, détendus, ou poing serré.
      const PLIS = { barre: [1.05, 1.25, 0.85], plat: [0.03, 0.03, 0.02], detendu: [0.28, 0.42, 0.3], poing: [1.35, 1.5, 1.0] };
      const plis = typeof b.doigts === 'number' ? PLIS.plat.map((x, n) => x + (PLIS.poing[n] - x) * b.doigts) : PLIS[b.doigts || 'detendu'];
      for (let fg = 1; fg <= 5; fg++) for (let j = 1; j <= 3; j++) this.ql[i[`doigt${fg}-${j}` + x]].copy(qAxe(R.doigts[fg], plis[j - 1] * (fg === 1 ? 0.7 : 1)));
      this.majMonde();
      const poignet = this.pw[i['main' + x]].clone();
      info.poignets[c] = poignet;
      info.coudes[c] = coude.clone();
      info.paumes[c] = paume.clone(); info.dirMains[c] = dMain.clone();
      info.prises[c] = poignet.clone().add(dMain.clone().multiplyScalar(L.main)).add(paume.clone().multiplyScalar(L.creux));
      info.axes[c] = paume.clone().cross(dMain).normalize();
      info.angles[c] = { pronation: pron * 180 / Math.PI, coude: theta * 180 / Math.PI };
    }
    /* Une jambe : cible (cheville, pôle du genou, direction et dessus du pied) ou angles anatomiques. */
    jambe(c, s, x, j, info) {
      const L = this.L, R = this.R[c], i = this.i;
      const ha = this.pw[i['femur' + x]];
      let cheville, pole, pied = j.pied, hautPied = j.hautPied;
      if (j.flex != null) {
        const QB = this.qw[i.bassin], k = rad(j.genou || 0), pt = rad(j.pointe || 0);
        const Rq = qAxe(AX, -rad(j.flex)).multiply(qAxe(AZ, s * rad(j.abd || 0)));
        const a1 = V(0, -1, 0).applyQuaternion(Rq);
        const f = V(0, 0, -1).applyQuaternion(Rq).applyQuaternion(qAxe(a1, -s * rad(j.rot || 0)));
        const a2 = a1.clone().multiplyScalar(Math.cos(k)).add(f.clone().multiplyScalar(Math.sin(k)));
        const g = a1.clone().multiplyScalar(-Math.sin(k)).add(f.clone().multiplyScalar(Math.cos(k)));   // vers le mollet
        pied = g.clone().multiplyScalar(-Math.cos(pt)).add(a2.clone().multiplyScalar(Math.sin(pt))).applyQuaternion(QB);
        hautPied = a2.clone().multiplyScalar(-Math.cos(pt)).add(g.clone().multiplyScalar(-Math.sin(pt))).applyQuaternion(QB);
        cheville = ha.clone().add(a1.multiplyScalar(L.cuisse).add(a2.multiplyScalar(L.jambe)).applyQuaternion(QB));
        pole = f.multiplyScalar(-1).applyQuaternion(QB);
      } else { cheville = j.cheville; pole = unite(j.pole || AZ); }
      const r = ik2(ha, cheville, L.cuisse, L.jambe, pole);
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
      // Le pied : direction de la pointe et dessus du pied ; les orteils se relèvent quand le pied est sur la pointe.
      this.poserMonde('pied' + x, qVers(R.pied, AY, unite(pied || AZ), hautPied || AY));
      this.ql[i['orteils' + x]].copy(qAxe(AX, -rad(j.orteils || 0)));
      this.majMonde();
      info.chevilles[c] = this.pw[i['pied' + x]].clone(); info.genoux[c] = genou.clone(); info.orteils[c] = this.pw[i['orteils' + x]].clone();
      if (info.pieds) info.pieds[c] = { pied: unite(pied || AZ), hautPied: (hautPied || AY).clone() };
      info.angles['jambe' + c] = { genou: theta * 180 / Math.PI };
    }
  }

  /* ---------- Le matériel ----------
     Des formes simples dans le repère de l'objet : cylindre (le long de Y dans le moteur ; ici couché le long de X
     par défaut), boîte, sphère, tore (anneau). Les teintes suivent le thème. */
  const TEINTES = {
    sombre: { metal: [205, 208, 216], fonte: [44, 45, 50], banc: [58, 59, 66], cadre: [96, 98, 106], cable: [150, 152, 160], elastique: [214, 88, 120], ballon: [92, 110, 150], bois: [176, 148, 112], tapis: [50, 52, 60], sangle: [70, 72, 80] },
    clair: { metal: [186, 189, 197], fonte: [52, 53, 58], banc: [70, 71, 78], cadre: [120, 122, 130], cable: [110, 112, 120], elastique: [205, 60, 100], ballon: [86, 108, 160], bois: [170, 140, 104], tapis: [150, 152, 160], sangle: [90, 92, 100] }
  };
  const COUCHE = qAxe(AZ, Math.PI / 2);   // un cylindre couché le long de X
  const DEBOUT_Q = new Quat();            // un cylindre debout (le long de Y)
  const LONG_Z = qAxe(AX, Math.PI / 2);   // un cylindre couché le long de Z
  const cyl = (r, l, x, y, z, couleur, metal, q) => ({ forme: 'cylindre', s: [r, l, r], p: V(x, y, z), q: q || COUCHE, couleur, metal });
  const boite = (lx, ly, lz, x, y, z, couleur, metal, q) => ({ forme: 'boite', s: [lx, ly, lz], p: V(x, y, z), q: q || new Quat(), couleur, metal });
  const sphere = (r, x, y, z, couleur, metal) => ({ forme: 'sphere', s: [r, r, r], p: V(x, y, z), q: new Quat(), couleur, metal });
  const tore = (r, x, y, z, couleur, metal, q) => ({ forme: 'tore', s: [r, r, r], p: V(x, y, z), q: q || new Quat(), couleur, metal });
  /* Un cylindre tendu entre deux points (câble, élastique, sangle, montant). */
  const seg = (a, b, r, couleur, metal) => {
    const d = b.clone().sub(a), l = d.length() || 1e-4;
    return { forme: 'cylindre', s: [r, l, r], p: a.clone().add(b).multiplyScalar(0.5), q: arc(AY, d.multiplyScalar(1 / l)), couleur, metal };
  };

  const MAT = {
    /* Barre : longueur, disques (rayon du grand disque, ou 0). */
    barre(C, l = 1.6, disques = 0.225) {
      const f = [cyl(0.0135, l, 0, 0, 0, C.metal, 1)];
      if (l > 1.3) for (const s of [1, -1]) {
        f.push(cyl(0.025, 0.36, s * (l / 2 - 0.18), 0, 0, C.metal, 1));
        if (disques) { f.push(cyl(disques, 0.05, s * 0.56, 0, 0, C.fonte, 0)); f.push(cyl(disques * 0.76, 0.035, s * 0.615, 0, 0, C.fonte, 0)); }
      } else if (disques) for (const s of [1, -1]) f.push(cyl(Math.min(disques, 0.11), 0.05, s * (l / 2 - 0.06), 0, 0, C.fonte, 0));
      return f;
    },
    haltere(C, k = 1) { return [cyl(0.016, 0.15, 0, 0, 0, C.metal, 1), cyl(0.062 * k, 0.05, 0.1, 0, 0, C.fonte, 0), cyl(0.062 * k, 0.05, -0.1, 0, 0, C.fonte, 0)]; },
    /* Kettlebell : la poignée à l'origine (le long de X), la boule en dessous (vers -Y). */
    kettlebell(C) { return [cyl(0.014, 0.12, 0, 0, 0, C.fonte, 0.2), cyl(0.012, 0.075, 0.055, -0.035, 0, C.fonte, 0.2, DEBOUT_Q), cyl(0.012, 0.075, -0.055, -0.035, 0, C.fonte, 0.2, DEBOUT_Q), sphere(0.095, 0, -0.15, 0, C.fonte, 0.1)]; },
    disque(C, r = 0.2) { return [cyl(r, 0.035, 0, 0, 0, C.fonte, 0), cyl(0.03, 0.04, 0, 0, 0, C.metal, 1)]; },
    balle(C, r = 0.11) { return [sphere(r, 0, 0, 0, C.ballon, 0)]; },
    /* Banc : dossier relevé de `angle` degrés (0 = à plat), la charnière à l'origine, la tête vers -Z. */
    banc(C, angle = 0, h = 0.44, lDossier = 0.9, lSiege = 0.32) {
      const f = [], a = rad(angle), ep = 0.06;
      if (!angle) {
        f.push(boite(0.29, ep, lDossier + lSiege, 0, h - ep / 2, (lSiege - lDossier) / 2, C.banc, 0));
      } else {
        // Dossier : part de la charnière et monte vers l'arrière ; assise : légèrement relevée vers l'avant.
        f.push(boite(0.29, ep, lDossier, 0, h - ep / 2 + Math.sin(a) * lDossier / 2, -Math.cos(a) * lDossier / 2, C.banc, 0, qAxe(AX, a)));
        f.push(boite(0.29, ep, lSiege, 0, h - ep / 2 + (angle > 0 ? 0.02 : 0), lSiege / 2 + 0.01, C.banc, 0, qAxe(AX, rad(angle > 0 ? -8 : 0))));
        if (angle > 20) f.push(boite(0.05, Math.sin(a) * lDossier * 0.7, 0.05, 0, h - 0.06 + Math.sin(a) * lDossier * 0.35 - 0.02, -Math.cos(a) * lDossier * 0.72, C.cadre, 0.6));
      }
      for (const z of [-lDossier * 0.72, lSiege - 0.06]) { f.push(boite(0.05, h - ep, 0.05, 0, (h - ep) / 2, z, C.cadre, 0.6)); f.push(boite(0.36, 0.035, 0.06, 0, 0.0175, z, C.cadre, 0.6)); }
      f.push(boite(0.05, 0.04, lDossier * 0.72 + lSiege - 0.06, 0, 0.1, (lSiege - 0.06 - lDossier * 0.72) / 2, C.cadre, 0.6));
      return f;
    },
    /* Siège : assise à hauteur h, dossier incliné de `recul` degrés vers l'arrière (0 = sans dossier). */
    siege(C, h = 0.45, dossier = 0, recul = 8, larg = 0.36) {
      const f = [boite(larg, 0.06, 0.38, 0, h - 0.03, 0.02, C.banc, 0), boite(0.06, h - 0.06, 0.06, 0, (h - 0.06) / 2, 0, C.cadre, 0.6), boite(0.4, 0.035, 0.5, 0, 0.0175, 0, C.cadre, 0.6)];
      if (dossier) { const a = rad(recul); f.push(boite(larg - 0.04, dossier, 0.06, 0, h + Math.cos(a) * dossier / 2, -0.2 - Math.sin(a) * dossier / 2, C.banc, 0, qAxe(AX, -a))); }
      return f;
    },
    barreFixe(C, h = 2.42, l = 1.3) {
      const f = [cyl(0.016, l, 0, h, 0, C.metal, 1)];
      for (const s of [1, -1]) f.push(boite(0.05, h + 0.08, 0.05, s * l / 2, (h + 0.08) / 2, 0, C.cadre, 0.5));
      return f;
    },
    /* Barres parallèles : deux barres le long de Z, à la hauteur h, écartées de 2 × ecart. */
    paralleles(C, h = 1.25, ecart = 0.28, l = 0.7) {
      const f = [];
      for (const s of [1, -1]) {
        f.push(cyl(0.019, l, s * ecart, h, 0, C.metal, 1, LONG_Z));
        f.push(boite(0.045, h, 0.045, s * ecart, h / 2, -l / 2 + 0.03, C.cadre, 0.5));
        f.push(boite(0.045, 0.035, 0.5, s * ecart, 0.0175, -l / 2 + 0.2, C.cadre, 0.5));
      }
      f.push(boite(2 * ecart, 0.045, 0.045, 0, 0.3, -l / 2 + 0.03, C.cadre, 0.5));
      return f;
    },
    step(C, lx = 0.5, h = 0.3, lz = 0.4, x = 0, z = 0) { return [boite(lx, h, lz, x, h / 2, z, C.banc, 0)]; },
    mur(C, z = -0.25, l = 1.4, h = 2.1) { return [boite(l, h, 0.04, 0, h / 2, z - 0.02, C.tapis, 0)]; },
    /* Colonne de poulie : un montant et sa poulie au point d'ancrage. */
    colonne(C, ancre, pied) {
      const base = pied || V(ancre.x, 0, ancre.z + (ancre.z < 0 ? -0.06 : 0.06));
      return [seg(V(base.x, 0, base.z), V(base.x, Math.max(ancre.y + 0.12, 0.3), base.z), 0.028, C.cadre, 0.5), boite(0.34, 0.03, 0.3, base.x, 0.015, base.z, C.cadre, 0.5), cyl(0.045, 0.03, ancre.x, ancre.y, ancre.z, C.metal, 0.8)];
    },
    /* Rails de la Smith machine : deux glissières verticales aux bouts de la barre. */
    smith(C, z, l = 1.6, h = 2.1, penche = 0) {
      const f = [];
      for (const s of [1, -1]) { f.push(cyl(0.02, h, s * (l / 2 - 0.08), h / 2, z, C.cadre, 0.7, DEBOUT_Q)); f.push(boite(0.12, 0.04, 0.5, s * (l / 2 - 0.08), 0.02, z, C.cadre, 0.5)); }
      f.push(boite(l - 0.16, 0.05, 0.05, 0, h, z, C.cadre, 0.5));
      return f;
    },
    /* Pupitre (curl au pupitre) : un coussin incliné devant le buste, sur un pied. */
    pupitre(C, y = 1.05, z = 0.2, angle = 45) {
      const a = rad(angle);
      return [boite(0.5, 0.06, 0.42, 0, y, z, C.banc, 0, qAxe(AX, a)), boite(0.06, y - 0.1, 0.06, 0, (y - 0.1) / 2, z + 0.08, C.cadre, 0.6), boite(0.4, 0.035, 0.5, 0, 0.0175, z, C.cadre, 0.6)];
    },
    rouleau(C, l = 0.42, r = 0.07) { return [cyl(r, l, 0, 0, 0, C.ballon, 0)]; },
    /* Coussin cylindrique d'une machine (jambes, chevilles), le long de X. */
    coussin(C, l = 0.34, r = 0.055) { return [cyl(r, l, 0, 0, 0, C.banc, 0)]; },
    poignee(C, l = 0.13) { return [cyl(0.015, l, 0, 0, 0, C.metal, 1)]; }
  };
  /* Pose un objet (liste de formes) dans le monde : position, rotation. Ajoute les formes prêtes pour le moteur. */
  function poserObjet(formes, pos, rot, sortie) {
    for (const f of formes) {
      const q = rot ? rot.clone().multiply(f.q) : f.q, p = rot ? f.p.clone().applyQuaternion(rot).add(pos) : (pos ? f.p.clone().add(pos) : f.p);
      sortie.push({ forme: f.forme, s: f.s, q: [q.x, q.y, q.z, q.w], p: [p.x, p.y, p.z], couleur: f.couleur, metal: f.metal });
    }
    return sortie;
  }
  /* Rotation d'un objet tenu : son axe X le long de `axe`, son dessus (Y) vers `haut` autant que possible. */
  function qTenu(axe, haut) {
    const x = unite(axe); let y = perp(haut || AY, x);
    if (y.lengthSq() < 1e-6) y = perpendiculaire(x);
    y.normalize();
    return new Quat().setFromBasis(x, y, x.clone().cross(y));
  }

  /* ---------- Postures : de quoi écrire une pose en peu de mots ----------
     Repère : Y vers le haut, Z vers l'avant du corps debout, X vers sa gauche ; le sol est en y = 0. */
  /* Bras par angles anatomiques (voir Corps) : plan, élévation, rotation, coude, pronation. */
  const B = (plan, elev, rot, coude, pron, plus) => Object.assign({ plan, elev, rot: rot || 0, coude: coude || 0, pron: pron == null ? 90 : pron, doigts: 'barre' }, plus);
  /* Jambe par angles : flexion, abduction, rotation de la hanche, flexion du genou, pointe du pied. */
  const J = (flex, abd, rot, genou, pointe, plus) => Object.assign({ flex, abd: abd || 0, rot: rot || 0, genou: genou || 0, pointe: pointe || 0 }, plus);
  const brasRepos = () => ({ plan: 90, elev: 7, rot: 0, coude: 12, pron: 90, doigts: 'detendu' });
  const pareil = spec => ({ G: Object.assign({}, spec), D: Object.assign({}, spec) });
  const deux = f => ({ G: f(1, 'G'), D: f(-1, 'D') });
  function cloner(a) {
    if (a instanceof V3 || a instanceof Quat) return a.clone();
    if (Array.isArray(a)) return a.map(cloner);
    if (a && typeof a === 'object') { const r = {}; for (const k in a) r[k] = cloner(a[k]); return r; }
    return a;
  }

  /* Un pied posé : x, z de la cheville pied à plat ; ouv : pointe ouverte vers le dehors ; pointe : talon levé
     (le pied tourne autour de l'articulation des orteils, qui reste au sol) ; y0 : hauteur du support ;
     lacet : orientation de toute la jambe (0 = vers l'avant). */
  function pied(c, s, o) {
    o = o || {};
    const L = c.L, ouv = rad(o.ouv == null ? 8 : o.ouv), th = rad(o.pointe || 0), y0 = o.y0 || 0;
    const dirH = V(s * Math.sin(ouv), 0, Math.cos(ouv)).applyQuaternion(qAxe(AY, rad(o.lacet || 0)));
    const d = dirH.clone().multiplyScalar(Math.cos(th)).add(V(0, -Math.sin(th), 0));
    const haut = V(0, Math.cos(th), 0).add(dirH.clone().multiplyScalar(Math.sin(th)));
    const x = o.x != null ? o.x : s * (o.ecart == null ? 0.1 : o.ecart), z = o.z != null ? o.z : L.racine.z + L.hanche.z;
    // Pointe négative : le talon reste au sol et la pointe du pied se lève (la cheville ne bouge pas).
    if (th < 0) return { cheville: V(x, y0 + L.chevilleH, z), pole: o.pole ? o.pole.clone() : dirH.clone(), pied: d, hautPied: haut, orteils: 0 };
    const boule = V(x, y0 + L.orteilsH, z).add(dirH.clone().multiplyScalar(L.avantPied));
    const cheville = boule.clone().sub(d.clone().multiplyScalar(L.avantPied)).add(haut.clone().multiplyScalar(L.chevilleH - L.orteilsH));
    return { cheville, pole: o.pole ? o.pole.clone() : dirH.clone(), pied: d, hautPied: haut, orteils: o.pointe || 0 };
  }
  /* Debout : bassin déplacé (dy vers le bas en négatif, dz vers l'arrière en négatif), buste penché en avant de
     `penche` degrés, pieds à plat écartés de 2 × ecart. */
  function debout(c, o) {
    o = o || {};
    const L = c.L;
    const rot = qY(o.lacet || 0).multiply(qX(o.penche || 0)).multiply(qZ(o.roulis || 0));
    const p = { bassin: { pos: L.racine.clone().add(V(o.dx || 0, o.dy || 0, o.dz || 0)), rot }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, jambes: {}, bras: pareil(brasRepos()) };
    for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { ecart: o.ecart, ouv: o.ouv, pointe: o.pointe, y0: o.y0, z: (o.zPieds || 0) + L.racine.z + L.hanche.z });
    return p;
  }
  /* Assis sur un siège de hauteur h, pieds à plat devant (zPieds : avancée des chevilles depuis le bassin). */
  function assis(c, o) {
    o = o || {};
    const h = o.h == null ? 0.45 : o.h, z = o.z || 0;
    const p = { bassin: { pos: V(0, h + 0.12, z), rot: qX(o.penche || 0) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k, s] of COTES) p.jambes[k] = o.jambes ? cloner(o.jambes) : pied(c, s, { ecart: o.ecart == null ? 0.14 : o.ecart, ouv: o.ouv == null ? 6 : o.ouv, z: z + (o.zPieds == null ? 0.4 : o.zPieds), y0: o.yPieds || 0, pointe: o.pointe });
    c.poserSur(p, V(0, h, 0), AY, ['bassin']);
    return p;
  }
  /* Couché sur le dos, la tête vers -Z, sur un plan à la hauteur h dont le dossier est relevé de `angle` degrés
     (charnière à l'origine). jambes : 'sol' (pieds par terre de part et d'autre du banc), 'plies' (genoux pliés,
     pieds à plat sur le plan), 'tendues', 'levees' (hanches et genoux à 90°) ou des angles. */
  function allonge(c, o) {
    o = o || {};
    const L = c.L, h = o.h || 0, angle = o.angle || 0, a = rad(angle);
    const n = V(0, Math.cos(a), Math.sin(a)), t = V(0, Math.sin(a), -Math.cos(a));   // normale du dossier ; vers la tête
    const d = o.d != null ? o.d : (angle > 0 ? lerp(-0.2, 0.1, Math.min(1, angle / 30)) : -0.2);
    const pos = V(0, h, 0).add(t.clone().multiplyScalar(d)).add(n.clone().multiplyScalar(0.15));
    const p = { bassin: { pos, rot: qX(-90 + angle) }, lombaires: o.lomb == null ? -4 : o.lomb, thorax: o.thor == null ? -3 : o.thor, cou: o.cou == null ? 4 : o.cou, bras: pareil(brasRepos()), jambes: {} };
    const jb = o.jambes || (h > 0.2 ? 'sol' : 'plies');
    for (const [k, s] of COTES) {
      if (jb === 'sol') p.jambes[k] = pied(c, s, { x: s * (o.ecartPieds || 0.27), ouv: 14, z: pos.z + (angle > 15 ? 0.42 : 0.5), pole: V(s * 0.25, 1, 0.3) });
      else if (jb === 'plies') p.jambes[k] = pied(c, s, { x: s * 0.11, ouv: 4, z: pos.z + 0.47, y0: angle ? 0 : h, pole: V(0, 1, 0.2) });
      else if (jb === 'tendues') p.jambes[k] = J(angle, 4, 0, 2, 25);
      else if (jb === 'levees') p.jambes[k] = J(90, 3, 0, 90, 20);
      else p.jambes[k] = cloner(jb.G ? jb[k] : jb);
    }
    c.poserSur(p, V(0, h, 0), n, ['dos', 'bassin']);
    return p;
  }
  /* À plat ventre, la tête vers +Z, sur un plan à la hauteur h relevé de `angle` degrés (banc incliné, buste
     contre le dossier) ; jambes : 'tendues' ou 'sol' (pieds par terre derrière, pour un banc incliné). */
  function aPlatVentre(c, o) {
    o = o || {};
    const h = o.h || 0, angle = o.angle || 0, a = rad(angle);
    const n = V(0, Math.cos(a), -Math.sin(a)), t = V(0, Math.sin(a), Math.cos(a));   // normale du plan ; vers la tête
    const pos = V(0, h, 0).add(t.clone().multiplyScalar(o.d || 0)).add(n.clone().multiplyScalar(0.15));
    const p = { bassin: { pos, rot: qX(90 - angle) }, lombaires: o.lomb == null ? -3 : o.lomb, thorax: o.thor == null ? -2 : o.thor, cou: o.cou == null ? -12 : o.cou, bras: pareil(brasRepos()), jambes: {} };
    const jb = o.jambes || (angle > 15 ? 'sol' : 'tendues');
    for (const [k, s] of COTES) {
      if (jb === 'sol') p.jambes[k] = pied(c, s, { x: s * 0.2, ouv: 8, z: pos.z - (o.zPieds == null ? 0.62 : o.zPieds), pointe: 55, pole: V(0, -0.3, 1) });
      else if (jb === 'tendues') p.jambes[k] = J(-angle * 0.2, 4, 0, 2, 55);
      else p.jambes[k] = cloner(jb.G ? jb[k] : jb);
    }
    c.poserSur(p, V(0, h, 0), n, o.regions || ['thorax', 'abdomen', 'bassin']);
    return p;
  }
  /* Suspendu à une barre à la hauteur H : épaules à `k` × longueur de bras sous la barre ; renvoie la pose (mains
     sur la barre, écartées de 2 × ecart ; paume : 'pro', 'sup' ou 'neutre'). */
  function suspendu(c, o) {
    o = o || {};
    const L = c.L, H = o.H == null ? 2.3 : o.H, k = o.k == null ? 0.96 : o.k, ecart = o.ecart == null ? 0.3 : o.ecart;
    const p = { bassin: { pos: L.racine.clone(), rot: qX(o.penche || 0) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: {}, jambes: {} };
    const t = c.tronc(p), ep = t.epaules.G;
    // Les épaules sous la barre : à la verticale des mains, à la distance voulue.
    const dx = ecart - ep.x, chute = Math.sqrt(Math.max(0.01, Math.pow((L.bras + L.prise) * k, 2) - dx * dx));
    p.bassin.pos.y += H - chute - ep.y; p.bassin.pos.z += (o.z || 0) - ep.z;
    const paume = o.paume === 'sup' ? V(0, 0, -1) : V(0, 0, 1);
    for (const [kk, s] of COTES) {
      p.bras[kk] = { prise: V(s * ecart, H, o.z || 0), pole: V(s * 1, -0.2, o.paume === 'sup' ? 0.5 : -0.25), paume: o.paume === 'neutre' ? V(-s, 0, 0) : paume.clone(), dirMain: V(0, 1, 0), doigts: 'barre' };
      p.jambes[kk] = o.jambes ? cloner(o.jambes) : J(8, 2, 0, 12, 35);
    }
    return p;
  }
  /* À genoux, buste droit (ou penché) : cuisses à `flex` degrés de la verticale, tibias au sol. */
  function aGenoux(c, o) {
    o = o || {};
    const p = { bassin: { pos: V(0, 0.6, o.z || 0), rot: qX(o.penche || 0) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    const pen = o.penche || 0, flex = o.flex || 0;
    // Tibias à l'horizontale vers l'arrière : le genou plie de 90° de plus que la cuisse ne s'écarte de la verticale.
    for (const [k] of COTES) p.jambes[k] = J(flex + pen, o.abd == null ? 6 : o.abd, 0, 90 + flex, 62);
    c.poserSur(p, V(), AY, ['jambe', 'pied']);
    return p;
  }
  /* Un genou à terre (côté `bas` : 'G' ou 'D'), l'autre pied posé devant. */
  function demiGenou(c, o) {
    o = o || {};
    const bas = o.bas || 'D', pen = o.penche || 0;
    const p = { bassin: { pos: V(0, 0.6, o.z || 0), rot: qX(pen) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k] of COTES) p.jambes[k] = k === bas ? J(pen, 5, 0, 90, 62) : J(90 + pen, 6, 0, 90, 0);
    c.poserSur(p, V(), AY, ['jambe', 'pied']);
    return p;
  }
  /* À quatre pattes : mains sous les épaules, genoux sous les hanches. */
  function quatrePattes(c, o) {
    o = o || {};
    const p = { bassin: { pos: V(0, 0.5, o.z || 0), rot: qX(o.penche == null ? 86 : o.penche) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou == null ? -25 : o.cou, bras: {}, jambes: {} };
    for (const [k] of COTES) p.jambes[k] = J(86, 6, 0, 90, 62);
    p.bras = pareil(brasRepos());
    c.poserSur(p, V(), AY, ['jambe', 'pied']);
    const t = c.tronc(p);
    for (const [k, s] of COTES) p.bras[k] = { prise: V(t.epaules[k].x + s * 0.01, 0.0, t.epaules[k].z + (o.zMains || 0.02)), pole: V(s * 0.3, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
    return p;
  }
  /* Assis par terre : buste incliné vers l'arrière de `recul` degrés ; jambes par angles (par défaut tendues). */
  function assisSol(c, o) {
    o = o || {};
    const recul = o.recul || 0;
    const p = { bassin: { pos: V(0, 0.2, o.z || 0), rot: qX(-recul) }, lombaires: o.lomb == null ? 8 : o.lomb, thorax: o.thor == null ? 4 : o.thor, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k] of COTES) p.jambes[k] = o.jambes ? cloner(o.jambes.G ? o.jambes[k] : o.jambes) : J(90 - recul, 5, 0, 4, 10);
    c.poserSur(p, V(), AY, ['bassin', 'cuisse', 'jambe', 'pied']);
    return p;
  }
  /* Couché sur le côté gauche (la tête vers +X, le visage vers +Z) ; cote = 'D' : sur le côté droit. */
  function surLeCote(c, o) {
    o = o || {};
    const s = o.cote === 'D' ? -1 : 1;
    const p = { bassin: { pos: V(0, 0.25, 0), rot: qZ(-90 * s) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, inclinaison: o.incl || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k] of COTES) p.jambes[k] = o.jambes ? cloner(o.jambes.G ? o.jambes[k] : o.jambes) : J(18, 0, 0, 25, 20);
    c.poserSur(p, V(), AY);
    return p;
  }
  /* Corps gainé en appui sur les pieds (ou les genoux) et les mains : renvoie une fonction qui donne la pose pour
     une hauteur d'épaules. Options : yPieds, zPieds (appui des pieds), genoux (appui sur les genoux),
     ecartPieds, yMains (hauteur des mains), cou. */
  function planche(c, o) {
    o = o || {};
    const L = c.L, yP = o.yPieds || 0, zP = o.zPieds == null ? -1.22 : o.zPieds;
    const base = { bassin: { pos: V(), rot: new Quat() }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou == null ? -22 : o.cou, bras: pareil(brasRepos()), jambes: {} };
    // Le pivot : la cheville (pointe de pied au sol), ou le genou.
    const pivot = o.genoux ? V(0, yP + L.genou + 0.03, zP) : V(0, yP + 0.15, zP);
    const portee = o.genoux ? L.cuisse : L.jambe + L.cuisse - 0.004;
    return hEp => {
      const p = cloner(base);
      let alpha = 0.3, t;
      for (let k = 0; k < 6; k++) {
        p.bassin.rot = qAxe(AX, Math.PI / 2 - alpha);
        const dir = V(0, Math.sin(alpha), Math.cos(alpha));
        p.bassin.pos = pivot.clone().add(dir.multiplyScalar(portee)).sub(L.hanche.clone().setX(0).applyQuaternion(p.bassin.rot));
        t = c.tronc(p);
        alpha += Math.asin(borne((hEp - t.epaules.G.y) / 1.4, -0.9, 0.9));
      }
      for (const [k, s] of COTES) {
        if (o.genoux) p.jambes[k] = { cheville: V(s * (o.ecartPieds || 0.09), yP + 0.2, zP - L.jambe * 0.92), pole: V(0, -1, 0.3), pied: V(0, 0.3, -1), hautPied: V(0, -1, -0.3) };
        else p.jambes[k] = { cheville: V(s * (o.ecartPieds || 0.09), pivot.y, zP), pole: V(0, -1, 0.15), pied: V(0, -1, 0.22), hautPied: V(0, 0.2, 1), orteils: 60 };
      }
      p.epaules = t.epaules;
      return p;
    };
  }

  /* Où mettre les mains quand elles ne travaillent pas. t : repères du tronc (c.tronc). */
  function mains(c, t, ou) {
    const r = {};
    for (const [k, s] of COTES) {
      const dT = (x, y, z) => V(s * x, y, z).applyQuaternion(t.qThorax);
      if (ou === 'hanches') r[k] = { prise: t.hanches[k].clone().add(V(s * 0.085, 0.1, 0.03).applyQuaternion(t.qBassin)), pole: dT(0.8, 0, -0.6), paume: dT(-1, -0.2, 0), dirMain: dT(-0.2, -0.3, 1), doigts: 'detendu' };
      else if (ou === 'nuque') r[k] = { prise: t.tete.clone().add(dT(0.075, 0.03, -0.085)), pole: dT(1, -0.1, -0.1), paume: dT(-0.3, 0, 1), dirMain: dT(-1, 0.2, -0.2), doigts: 'detendu' };
      else if (ou === 'oreilles') r[k] = { prise: t.tete.clone().add(dT(0.105, 0.05, 0.0)), pole: dT(1, -0.05, 0.35), paume: dT(-1, 0, 0.2), dirMain: dT(-0.3, 1, 0), doigts: 'detendu' };   // couché : mains aux tempes, coudes ouverts
      else if (ou === 'poitrine') r[k] = { prise: t.duThorax(V(-s * 0.1, -0.1, 0.17)), pole: dT(0.6, -1, 0.2), paume: dT(0, 0, -1), dirMain: dT(-1, 0.5, 0), doigts: 'detendu' };
      else if (ou === 'devant') r[k] = B(8, 88, 0, 4, 180, { doigts: 'detendu' });
      else if (ou === 'haut') r[k] = B(20, 172, 0, 4, 90, { doigts: 'detendu' });
      else if (ou === 'croix') r[k] = B(90, 88, 0, 4, 180, { doigts: 'detendu' });
      else if (ou === 'jointes') r[k] = { prise: t.duThorax(V(s * 0.012, -0.12, 0.27)), pole: dT(0.7, -1, 0), paume: dT(-1, 0, 0), dirMain: dT(0, 0.5, 1), doigts: 'detendu' };
      else r[k] = brasRepos();
    }
    return r;
  }

  /* Déplace le bassin de la pose p pour qu'une articulation du tronc se trouve à l'endroit voulu. */
  function ancrer(c, p, nom, cible) { c.tronc(p); p.bassin.pos.add(cible.clone().sub(c.monde(nom))); return p; }

  /* ---------- Du texte au mouvement ----------
     Un mouvement s'écrit « famille option option clé=valeur » (par exemple « curl hal assis alt »). Chaque famille
     reçoit le corps, ses options et les teintes, et rend :
       a, b      — la pose de départ et la pose d'arrivée (le déroulé les mélange) ; ou cles : [[u, pose], …] ;
                   ou pose(u) pour un mouvement calculé (rythme 'continu' : u est la phase d'un cycle) ;
       rythme    — 'rep' (aller, pause, retour), 'alt' (un côté puis l'autre : `alterne` dit quels membres),
                   'tenue' (position tenue, respiration), 'etire' (étirement : on y va, on tient, on revient),
                   'continu' (cycle sans pause : course, vélo, battements), 'boucle' (poses clés jouées dans l'ordre
                   sur un cycle : la dernière rejoint la première) ;
       tenu      — le matériel tenu : [{ t: 'haltere' | 'barre' | 'kb' | 'disque' | 'balle' | 'poignee', m: 'G' | 'D' | 'GD', … },
                   { t: 'cable' | 'elastique' | 'sangle' | 'levier', de: point, m, bout: 'barre' | 'corde' | 'poignee' }] ;
       fixe      — le matériel posé (formes prêtes) ; objets(info, u, sortie) — matériel calculé à chaque image ;
       vue       — { az, el } : d'où regarder. */
  const FAM = {};
  function lireSpec(spec) {
    const mots = String(spec).trim().split(/\s+/), o = { _: mots.slice(1) };
    for (const m of mots.slice(1)) {
      const k = m.indexOf('=');
      if (k > 0) { const v = m.slice(k + 1); o[m.slice(0, k)] = v !== '' && !isNaN(v) ? +v : v; } else o[m] = true;
    }
    return { f: mots[0], o };
  }
  function definir(spec, c, C) {
    const { f, o } = lireSpec(spec);
    if (!FAM[f]) throw new Error('mouvement inconnu : ' + f);
    const d = FAM[f](c, o, C);
    d.spec = spec; d.famille = f; d.o = o;
    if (d.cles) unifier(c, d.cles.map(x => x[1])); else if (d.a && d.b) unifier(c, [d.a, d.b]);
    // Les pieds posés doivent atteindre leur appui : sinon le bassin est rapproché (poses clés une fois pour toutes,
    // poses calculées à chaque image).
    if (d.cles) d.cles.forEach(x => appuyer(c, x[1])); else if (d.a && d.b) { appuyer(c, d.a); appuyer(c, d.b); }
    if (d.pose) { const f = d.pose; d.pose = (x, y) => appuyer(c, f(x, y)); }
    if (o.amp && d.rythme !== 'boucle' && !d.pose) {
      // Amplitude partielle : on ne va qu'à la fraction demandée du mouvement.
      if (d.cles) { const fin = chemin(d.cles, o.amp); d.cles = d.cles.filter(x => x[0] < o.amp).map(x => [x[0] / o.amp, x[1]]).concat([[1, fin]]); }
      else if (d.a && d.b) d.b = mel(d.a, d.b, o.amp);
    }
    d.rythme = d.rythme || 'rep';
    d.periode = d.periode || { rep: 2.8, alt: 4.6, tenue: 4, etire: 7, continu: 1.2, boucle: 3.4 }[d.rythme];
    d.tenu = d.tenu || []; d.fixe = d.fixe || [];
    return d;
  }
  /* Deux poses clés ne se mélangent que si elles décrivent chaque membre de la même façon. Quand l'une donne des angles
     et l'autre une cible (main posée, pied au sol), celle qui est en angles est convertie : on pose le corps, et on
     note où arrivent la main ou le pied. */
  const enCible = {
    bras: (info, k, b) => ({ prise: info.prises[k].clone(), pole: info.coudes[k].clone().sub(info.epaules[k]), paume: info.paumes[k].clone(), dirMain: info.dirMains[k].clone(), doigts: b.doigts, hausse: b.hausse, avance: b.avance }),
    jambes: (info, k, j) => ({ cheville: info.chevilles[k].clone(), pole: info.genoux[k].clone().sub(info.hanches[k]), pied: info.pieds[k].pied.clone(), hautPied: info.pieds[k].hautPied.clone(), orteils: j.orteils })
  };
  const parCible = { bras: b => b.elev == null && !b.dirBras, jambes: j => j.flex == null };
  function unifier(c, poses) {
    for (const m of ['bras', 'jambes']) for (const k of ['G', 'D']) {
      const n = poses.filter(p => parCible[m](p[m][k])).length;
      if (!n || n === poses.length) continue;
      for (const p of poses) if (!parCible[m](p[m][k])) { const info = c.poser(p); p[m] = Object.assign({}, p[m], { [k]: enCible[m](info, k, p[m][k]) }); }
    }
    return poses;
  }
  /* Quand un pied posé (décrit par sa cible) n'atteint pas son appui, la jambe est trop courte pour la position du
     bassin : le bassin est rapproché d'autant. La pose est modifiée sur place (et rendue). */
  function appuyer(c, p) {
    if (!(p.jambes.G.cheville || p.jambes.D.cheville)) return p;
    for (let n = 0; n < 3; n++) {
      const info = c.poser(p); let pire = null, ecart = 0.012;
      for (const k of ['G', 'D']) { const cible = p.jambes[k].cheville; if (!cible) continue; const e = info.chevilles[k].clone().sub(cible), l = e.length(); if (l > ecart) { ecart = l; pire = e; } }
      if (!pire) break;
      p.bassin = { pos: p.bassin.pos.clone().sub(pire), rot: p.bassin.rot };
    }
    return p;
  }
  /* Une répétition sur une phase p de 0 à 1 : repos, aller, pause, retour. */
  function rep(p) {
    if (p < 0.1) return 0;
    if (p < 0.48) return lisse((p - 0.1) / 0.38);
    if (p < 0.58) return 1;
    return 1 - lisse((p - 0.58) / 0.42);
  }
  const phase = (t, periode) => ((t % periode) + periode) % periode / periode;
  function cycle(t, periode = 2.8) { return rep(phase(t, periode)); }
  /* Le long d'une suite de poses clés [[u0, pose0], [u1, pose1], …]. */
  function chemin(cles, u) {
    if (u <= cles[0][0]) return cles[0][1];
    for (let i = 1; i < cles.length; i++) if (u <= cles[i][0]) return mel(cles[i - 1][1], cles[i][1], (u - cles[i - 1][0]) / (cles[i][0] - cles[i - 1][0] || 1));
    return cles[cles.length - 1][1];
  }
  const entre = (d, u) => (d.cles ? chemin(d.cles, u) : mel(d.a, d.b, u));
  /* Où en est le mouvement à l'instant t (secondes), ou pour une avancée imposée u (contrôles, arrêt sur image) :
     { u } pour une répétition, { uG, uD, u } pour un mouvement alterné, { u: phase } pour un cycle. */
  function avancee(d, t, uFixe) {
    if (d.rythme === 'continu' || d.rythme === 'boucle') return { u: uFixe != null ? uFixe : phase(t, d.periode) };
    if (d.rythme === 'alt') {
      if (uFixe != null) return { uG: uFixe, uD: 0, u: uFixe };
      const ph = phase(t, d.periode), uG = ph < 0.5 ? rep(ph * 2) : 0, uD = ph >= 0.5 ? rep((ph - 0.5) * 2) : 0;
      return { uG, uD, u: Math.max(uG, uD) };
    }
    if (uFixe != null) return { u: uFixe };
    const ph = phase(t, d.periode);
    if (d.rythme === 'tenue') return { u: 0.5 - 0.5 * Math.cos(2 * Math.PI * ph) };
    if (d.rythme === 'etire') return { u: ph < 0.22 ? lisse(ph / 0.22) : ph < 0.8 ? 1 : 1 - lisse((ph - 0.8) / 0.2) };
    return { u: rep(ph) };
  }
  /* La pose pour une avancée donnée (voir avancee). */
  function poseDe(d, av) {
    if (d.rythme === 'continu') return d.pose(av.u);
    if (d.rythme === 'boucle') {
      // D'une pose clé à la suivante, avec un départ et une arrivée en douceur (sauf d.file : passage sans arrêt).
      const ph = av.u, K = d.cles;
      if (ph <= K[0][0]) return K[0][1];
      for (let i = 1; i < K.length; i++) if (ph <= K[i][0]) { const x = (ph - K[i - 1][0]) / (K[i][0] - K[i - 1][0] || 1); return mel(K[i - 1][1], K[i][1], d.file ? x : lisse(x)); }
      return K[K.length - 1][1];
    }
    if (d.rythme === 'alt') {
      const { uG, uD } = av;
      if (d.pose) return d.pose(uG, uD);
      // Le tronc suit le côté qui travaille (ou reste en place) ; chaque membre alterné suit son côté.
      const p = cloner(entre(d, d.troncSuit ? Math.max(uG, uD) : 0)), pG = entre(d, uG), pD = entre(d, uD);
      for (const m of d.alterne || ['bras']) { p[m] = { G: pG[m].G, D: pD[m].D }; }
      return p;
    }
    return d.pose ? d.pose(av.u) : entre(d, av.u);
  }
  const poseA = (d, t, uFixe) => poseDe(d, avancee(d, t, uFixe));
  /* Le matériel de l'image : posé, tenu dans les mains, tendu (câbles, élastiques, sangles). */
  function materielDe(d, info, u, C, modeles) {
    const sortie = d.fixe.slice();
    const prise = m => (m === 'GD' || !m ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[m]);
    const cotes = m => (m === 'GD' || !m ? ['G', 'D'] : [m]);
    const point = (v, m) => (v === 'pieds' ? info.orteils.G.clone().add(info.orteils.D).multiplyScalar(0.5).setY(Math.min(info.orteils.G.y, info.orteils.D.y) - 0.02) : v === 'pied' ? info.orteils[m === 'D' ? 'D' : 'G'].clone().add(V(0, -0.02, 0)) : typeof v === 'function' ? v(info, u) : v);
    for (const e of d.tenu) {
      const mod = cle => modeles[cle] || (modeles[cle] = null);
      if (e.t === 'barre') {
        const axe = info.prises.G.clone().sub(info.prises.D);
        const f = modeles['barre' + (e.l || '') + (e.d == null ? '' : e.d)] || (modeles['barre' + (e.l || '') + (e.d == null ? '' : e.d)] = MAT.barre(C, e.l || 1.6, e.d == null ? 0.225 : e.d));
        const pos = e.pos ? point(e.pos) : prise('GD');
        poserObjet(f, e.centre === false ? pos : pos.clone().setX(e.x0 == null ? pos.x : e.x0), e.rot || qTenu(axe.lengthSq() > 1e-6 ? axe : AX, AY), sortie);
      } else if (e.t === 'haltere' || e.t === 'poignee' || e.t === 'kb') {
        const f = modeles[e.t + (e.k || '')] || (modeles[e.t + (e.k || '')] = e.t === 'haltere' ? MAT.haltere(C, e.k || 1) : e.t === 'kb' ? MAT.kettlebell(C) : MAT.poignee(C));
        // Un seul objet tenu à deux mains (entre) : au milieu, dans l'axe des deux mains.
        if (e.entre) { poserObjet(f, prise('GD'), qTenu(info.prises.G.clone().sub(info.prises.D), AY), sortie); continue; }
        for (const k of cotes(e.m)) {
          // La poignée en travers de la paume ; la boule d'un kettlebell pend, ou repose sur l'avant-bras.
          let haut = AY;
          if (e.t === 'kb') haut = e.sens === 'avantbras' ? info.dirMains[k].clone().multiplyScalar(0.8).add(info.paumes[k].clone().multiplyScalar(0.6)) : AY;
          poserObjet(f, info.prises[k], qTenu(info.axes[k], haut), sortie);
        }
      } else if (e.t === 'disque' || e.t === 'balle') {
        const f = modeles[e.t + (e.r || '')] || (modeles[e.t + (e.r || '')] = e.t === 'disque' ? MAT.disque(C, e.r || 0.2) : MAT.balle(C, e.r || 0.11));
        const pos = e.pos ? point(e.pos) : prise(e.m);
        const axe = e.m && e.m !== 'GD' ? info.paumes[e.m] : info.prises.G.clone().sub(info.prises.D);
        poserObjet(f, pos, e.t === 'disque' ? qTenu(e.axe || (axe.lengthSq() > 1e-6 ? axe : AX), AY) : null, sortie);
      } else if (e.t === 'cable' || e.t === 'elastique' || e.t === 'sangle' || e.t === 'levier') {
        const r = e.t === 'cable' ? 0.0045 : e.t === 'elastique' ? 0.007 : e.t === 'sangle' ? 0.009 : 0.017;
        const teinte = e.t === 'cable' ? C.cable : e.t === 'elastique' ? C.elastique : e.t === 'sangle' ? C.sangle : C.cadre;
        const metal = e.t === 'cable' || e.t === 'levier' ? 0.6 : 0;
        const bouts = e.vers ? [point(e.vers, e.m)] : e.bout === 'barre' || e.bout === 'corde' ? [prise('GD')] : cotes(e.m).map(k => info.prises[k]);
        const departs = Array.isArray(e.de) ? e.de : [e.de];
        bouts.forEach((b, n) => {
          const de = point(departs[Math.min(n, departs.length - 1)], cotes(e.m)[n]);
          if (e.bout === 'corde') {
            // La corde : le câble s'arrête avant les mains, deux brins vont à chacune.
            const noeud = b.clone().add(unite(de.clone().sub(b)).multiplyScalar(0.12));
            sortie.push(pret(seg(de, noeud, r, teinte, metal)));
            for (const k of ['G', 'D']) sortie.push(pret(seg(noeud, info.prises[k], 0.011, C.sangle, 0)));
          } else if (e.bout === 'anneau') {
            // L'anneau pend au bout de la sangle ; la main le tient par le bas.
            const k = cotes(e.m)[n], dir = unite(de.clone().sub(b)), centre = b.clone().add(dir.clone().multiplyScalar(0.088));
            sortie.push(pret(seg(de, centre.clone().add(dir.clone().multiplyScalar(0.1)), r, teinte, metal)));
            poserObjet(modeles.anneau || (modeles.anneau = [tore(0.1, 0, 0, 0, C.bois, 0)]), centre, qTenu(info.axes[k], dir), sortie);
          } else sortie.push(pret(seg(de, b, r, teinte, metal)));
        });
        if (e.bout === 'barre') {
          const f = modeles['barrette' + (e.l || '')] || (modeles['barrette' + (e.l || '')] = [cyl(0.014, e.l || 0.9, 0, 0, 0, C.metal, 1)]);
          const axe = info.prises.G.clone().sub(info.prises.D);
          poserObjet(f, prise('GD'), qTenu(axe.lengthSq() > 1e-6 ? axe : AX, AY), sortie);
        } else if (e.bout === 'poignee' || (e.t === 'levier' && e.bout !== 'rien')) {
          const f = modeles.poignee || (modeles.poignee = MAT.poignee(C));
          for (const k of cotes(e.m)) poserObjet(f, info.prises[k], qTenu(info.axes[k], AY), sortie);
        }
      }
    }
    if (d.objets) d.objets(info, u, sortie);
    return sortie;
  }
  const pret = f => ({ forme: f.forme, s: f.s, q: [f.q.x, f.q.y, f.q.z, f.q.w], p: [f.p.x, f.p.y, f.p.z], couleur: f.couleur, metal: f.metal });
  /* Matériel posé : des formes dans leur repère, placées une fois pour toutes. */
  const poseFixe = (formes, pos, rot) => poserObjet(formes, pos || V(), rot || null, []);

  /* ---------- Familles ---------- */
  /* Debout, bras un peu écartés : pour regarder le corps. */
  FAM.repos = c => {
    const p = debout(c, { ecart: 0.1, ouv: 8 });
    p.bras = pareil({ plan: 90, elev: 12, rot: 0, coude: 14, pron: 80, doigts: 'detendu' });
    return { a: p, b: p, rythme: 'tenue', vue: { az: 0, el: 4 } };
  };

  /* ---------- Outils communs aux familles ---------- */
  /* Posture d'un exercice de bras ou d'épaules, d'après ses options :
       (rien) debout ; assis (banc à dossier droit) ; tabouret (assis sans dossier) ; banc=<angle> (sur le dos, banc
       relevé de tant de degrés ; plat = banc=0 ; decline = -18) ; sol (sur le dos par terre) ; ventre=<angle> (à plat
       ventre sur banc incliné) ; penche[=angle] (debout, buste penché) ; genoux ; demigenou.
     Renvoie { p (pose de base), fixe (matériel posé), vue, sorte }. */
  function postureDe(c, o, C, defauts) {
    defauts = defauts || {};
    let p, fixe = [], vue = { az: 35, el: 8 }, sorte = 'debout';
    const banc = o.plat ? 0 : o.decline ? -18 : o.banc === true ? 45 : o.banc;
    if (banc != null && banc !== false) {
      p = allonge(c, { h: 0.44, angle: banc, jambes: o.jambes }); fixe = poseFixe(MAT.banc(C, banc)); vue = banc >= 20 ? { az: 40, el: 12 } : { az: 60, el: 14 }; sorte = 'dos';
    } else if (o.sol) { p = allonge(c, { h: 0, angle: 0, jambes: o.jambes || 'plies' }); vue = { az: 66, el: 16 }; sorte = 'dos'; }
    else if (o.ventre != null && o.ventre !== false) {
      const a = o.ventre === true ? 45 : o.ventre;
      p = aPlatVentre(c, { h: 0.44, angle: a, d: a > 15 ? 0.3 : 0.25 }); fixe = poseFixe(MAT.banc(C, a), V(), qY(180)); vue = { az: 52, el: 12 }; sorte = 'ventre';
    } else if (o.assis) { p = allonge(c, { h: 0.44, angle: 84, lomb: 0, thor: 0, cou: 0 }); fixe = poseFixe(MAT.banc(C, 84)); sorte = 'assis'; vue = { az: 38, el: 10 }; }
    else if (o.tabouret) { p = assis(c, { h: 0.45, penche: o.penche === true ? 0 : (o.penche || 0) }); fixe = poseFixe(MAT.banc(C, 0), V(0, 0, 0.28)); sorte = 'assis'; vue = { az: 38, el: 10 }; }
    else if (o.genoux) { p = aGenoux(c, { penche: defauts.penche || 0 }); sorte = 'genoux'; }
    else if (o.demigenou) { p = demiGenou(c, { penche: defauts.penche || 0 }); sorte = 'genoux'; }
    else if (o.penche) {
      const a = o.penche === true ? (defauts.penche || 60) : o.penche;
      p = debout(c, { dy: -0.05 - a * 0.0012, dz: -0.06 - a * 0.0026, penche: a, lomb: 3, thor: 4, cou: -a * 0.55, ecart: 0.14, ouv: 10 }); vue = { az: 122, el: 10 }; sorte = 'penche';
    } else p = debout(c, { ecart: defauts.ecart == null ? 0.11 : defauts.ecart, ouv: 10, penche: defauts.penche || 0, dy: defauts.dy || 0, dz: defauts.dz || 0 });
    return { p, fixe, vue, sorte };
  }
  /* Deux poses qui ne diffèrent que par les bras. a, b : angles (ou cibles) des bras au départ et à l'arrivée, pour
     les deux côtés ou { G, D } ; cote : 'G' ou 'D' si un seul bras travaille (l'autre prend `autre`, au repos par défaut). */
  function parLesBras(p, a, b, cote, autre) {
    const A = cloner(p), Z = cloner(p);
    for (const [k] of COTES) {
      const aK = a.G ? a[k] : a, bK = b.G ? b[k] : b;
      if (cote && cote !== 'GD' && cote !== k) { A.bras[k] = cloner(autre || brasRepos()); Z.bras[k] = cloner(autre || brasRepos()); }
      else { A.bras[k] = cloner(aK); Z.bras[k] = cloner(bK); }
    }
    return { a: A, b: Z };
  }
  /* Barre hexagonale (trap bar) : un cadre autour du corps, une poignée de chaque côté, les disques au bout.
     Elle suit les mains : les poignées passent par elles, quel que soit leur écart. */
  function barreHexagonale(C) {
    return (info, u, sortie) => {
      const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), e = Math.abs(info.prises.G.x - info.prises.D.x) / 2, y = m.y - 0.06;
      for (const s of [1, -1]) {
        sortie.push(pret(cyl(0.014, 0.4, m.x + s * e, m.y, m.z, C.metal, 1, LONG_Z)));                                      // la poignée
        for (const z of [0.2, -0.2]) sortie.push(pret(seg(V(m.x + s * e, m.y, m.z + z), V(m.x + s * 0.12, y, m.z + z * 1.7), 0.014, C.metal, 1)));   // les pans du cadre
        sortie.push(pret(seg(V(m.x + s * e, y, m.z), V(m.x + s * (e + 0.04), y, m.z), 0.014, C.metal, 1)));
        sortie.push(pret(cyl(0.025, 0.4, m.x + s * (e + 0.23), y, m.z, C.metal, 1)));                                        // le manchon
        sortie.push(pret(cyl(0.225, 0.05, m.x + s * (e + 0.3), y, m.z, C.fonte, 0)));                                        // le disque
        for (const z of [0.34, -0.34]) sortie.push(pret(seg(V(m.x + s * 0.12, y, m.z + z), V(m.x - s * 0.12, y, m.z + z), 0.014, C.metal, 1)));      // devant, derrière
      }
    };
  }
  /* Le matériel tenu, d'après les options : hal, barre, ez, kb, disque, balle, poulie, elas, machine, sangles.
     r : réglages de la famille { ancre (poulie : point ou fonction du côté), bout, pivot (machine), deElas, lBarre }. */
  function tenuDe(o, m, r) {
    r = r || {};
    const t = [], pt = (v, k) => (typeof v === 'function' && v.length ? v(k === 'D' ? -1 : 1, k) : v);
    const cotes = m === 'GD' || !m ? ['G', 'D'] : [m];
    if (o.barre) t.push({ t: 'barre', l: r.lBarre || 1.6, d: r.disques });
    else if (o.ez) t.push({ t: 'barre', l: 1.2, d: 0.09 });
    else if (o.hal) t.push({ t: 'haltere', m });
    else if (o.kb) t.push({ t: 'kb', m, sens: r.sensKb });
    else if (o.disque) t.push({ t: 'disque', m: 'GD' });
    else if (o.balle) t.push({ t: 'balle', m: 'GD' });
    else if (o.poulie) {
      if (r.bout === 'barre' || r.bout === 'corde') t.push({ t: 'cable', de: pt(r.ancre, 'G'), bout: r.bout, l: r.lCable });
      else for (const k of cotes) t.push({ t: 'cable', de: pt(r.ancre, k), m: k, bout: 'poignee' });
    } else if (o.elas) for (const k of cotes) t.push({ t: 'elastique', de: r.deElas ? pt(r.deElas, k) : 'pieds', m: k, bout: 'poignee' });
    else if (o.machine && r.pivot) for (const k of cotes) t.push({ t: 'levier', de: pt(r.pivot, k), m: k });
    else if (o.sangles && r.ancre) for (const k of cotes) t.push({ t: 'sangle', de: pt(r.ancre, k), m: k, bout: 'poignee' });
    return t;
  }
  /* Colonne de poulie posée au point d'ancrage (quand l'exercice se fait au câble). */
  const colonneSi = (o, C, ancre, fixe) => { if (o.poulie && ancre) for (const a of Array.isArray(ancre) ? ancre : [ancre]) poserObjet(MAT.colonne(C, a), V(), null, fixe); return fixe; };
  /* Quel côté travaille : 'GD', ou 'G' pour un exercice à un bras (uni). */
  const coteDe = o => (o.uni ? (o.droit ? 'D' : 'G') : 'GD');
  /* Le rythme d'après les options : alt (un côté puis l'autre), sinon répétitions. */
  const rythmeDe = (o, membres) => (o.alt ? { rythme: 'alt', alterne: membres || ['bras'] } : {});

  /* Curl des biceps et ses variantes.
     Matériel : hal (défaut), barre, ez, kb, poulie, elas, machine, disque. Prise : (supination), marteau, pro, zottman.
     Posture : voir postureDe, plus pupitre, araignee (à plat ventre sur banc incliné), concentre, drag, bayesien,
     hercule, croise, accroupi, mur, allonge. Côtés : alt, uni. */
  FAM.curl = (c, o, C) => {
    const pron = o.marteau ? 90 : o.pro ? 180 : 0;
    const m = coteDe(o);
    if (!(o.barre || o.ez || o.kb || o.poulie || o.elas || o.machine || o.disque)) o.hal = true;
    if (o.araignee) o.ventre = o.ventre == null ? 50 : o.ventre;
    if (o.incline) o.banc = o.banc == null ? 55 : o.banc;
    if (o.concentre) { o.tabouret = true; o.penche = 42; }
    if (o.allonge) o.sol = true;
    const P = postureDe(c, o, C, { penche: o.bayesien ? 8 : 0 });
    let p = P.p, fixe = P.fixe, vue = P.vue, a, b, ancre = V(0, 0.1, 0.8), autre = null, bout = o.barreP ? 'barre' : o.corde ? 'corde' : null, r = { disques: 0.13, lCable: 0.7 };
    if (o.pupitre) {
      // Assis derrière le pupitre, le haut des bras posé sur le coussin incliné.
      p = assis(c, { h: 0.52, penche: 14, zPieds: 0.3 }); p.thorax = 6; p.cou = -8;
      a = B(8, 52, 0, 22, pron); b = B(8, 52, 0, 128, pron);
      const t = c.tronc(p), ep = t.epaules.G;
      fixe = poseFixe(MAT.siege(C, 0.52)).concat(poseFixe(MAT.pupitre(C, ep.y - 0.2, ep.z + 0.24, 50)));
      ancre = V(0, 0.15, ep.z + 0.75); vue = { az: 52, el: 12 };
      r.pivot = s => V(s * 0.2, ep.y - 0.3, ep.z + 0.3);
    } else if (P.sorte === 'ventre') {
      // À plat ventre sur le banc incliné : les bras pendent à la verticale devant le banc.
      const pen = o.ventre === true ? 50 : o.ventre;
      a = B(4, pen, 0, 14, pron); b = B(4, pen, 0, 132, pron);
    } else if (P.sorte === 'dos') {
      // Sur le dos : banc incliné, les bras pendent derrière le buste ; par terre (câble), le long du corps.
      const ang = o.sol ? 0 : (o.banc === true ? 55 : o.banc);
      a = B(90, 5, 0, 10, pron); b = B(60, 10, 0, 138, pron);
      if (!o.sol) { a = B(0, -(90 - ang) * 0.85, 0, 8, pron); b = B(0, -(90 - ang) * 0.8, 0, 132, pron); }
      ancre = V(0, 0.25, 1.35);
    } else if (o.concentre) {
      // Assis, buste penché : le bras pend entre les cuisses, le coude contre l'intérieur de la cuisse.
      a = B(-12, 48, -10, 14, pron); b = B(-12, 50, -10, 136, pron);
      const t = c.tronc(p);
      autre = { prise: t.hanches.D.clone().add(V(-0.1, 0.02, 0.36)), pole: V(-1, 0.4, -0.4), paume: V(0, -1, 0), dirMain: V(0.3, 0, 1), doigts: 'detendu' };
      for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { ecart: 0.26, ouv: 22, z: 0.4 });
      vue = { az: 20, el: 10 };
    } else if (o.drag) {
      // Les coudes reculent : la barre monte le long du buste.
      a = B(90, 5, 0, 10, pron); b = B(0, -30, 6, 118, pron);
    } else if (o.bayesien) {
      // Dos à la poulie basse : le bras part de derrière le corps.
      a = B(0, -28, 0, 8, pron); b = B(0, 4, 0, 136, pron);
      ancre = s => V(s * 0.2, 0.1, -0.95);
      if (P.sorte === 'debout') { p.jambes.G = pied(c, 1, { z: 0.16 }); p.jambes.D = pied(c, -1, { z: -0.2, pointe: 20 }); }
      vue = { az: 60, el: 8 };
    } else if (o.hercule) {
      // Entre deux poulies hautes : bras en croix, les mains viennent vers les oreilles.
      a = B(90, 98, 90, 18, 0); b = B(90, 98, 90, 128, 0);
      ancre = s => V(s * 1.1, 1.95, 0); vue = { az: 0, el: 6 };
    } else if (o.croise) {
      // L'avant-bras monte en travers du buste, vers l'épaule opposée.
      a = B(90, 6, 0, 12, 90); b = B(30, 12, -42, 132, 90);
    } else if (o.accroupi) {
      // Accroupi face à la poulie basse, les coudes calés sur les genoux.
      p = debout(c, { dy: -0.52, dz: -0.24, penche: 24, ecart: 0.2, ouv: 22, cou: -14 });
      a = B(0, 62, 0, 30, pron); b = B(0, 62, 0, 130, pron); ancre = V(0, 0.12, 0.85); vue = { az: 60, el: 10 };
    } else {
      // Debout ou assis : coudes au corps ; ils avancent un peu en haut du mouvement.
      const ecart = o.large ? 14 : o.serre ? -16 : 0;
      a = B(90, 6, ecart, 12, pron); b = B(35, 16, ecart, 142, pron);
      if (o.haute) { a = B(0, 80, 0, 20, pron); b = B(0, 86, 0, 120, pron); ancre = V(0, 1.9, 0.9); }   // poulie haute, bras devant
    }
    if (o.mur) fixe = fixe.concat(poseFixe(MAT.mur(C, -c.L.dos - 0.06)));
    r.ancre = ancre; r.bout = bout;
    const d = Object.assign(parLesBras(p, a, b, m, autre), { fixe: colonneSi(o, C, typeof ancre === 'function' ? [ancre(1), ancre(-1)].slice(0, m === 'GD' ? 2 : 1) : ancre, fixe), vue, tenu: tenuDe(o, m, r) }, rythmeDe(o));
    if (o.zottman) {
      // Montée en supination ; la main se retourne en haut ; descente en pronation ; elle se retourne en bas.
      const A = d.a, Z = d.b;
      d.pose = (u, sens) => { const q = mel(A, Z, u), pr = sens < 0 ? 180 * lisse(u / 0.2) : 180 * lisse((u - 0.86) / 0.14); for (const k of ['G', 'D']) q.bras[k].pron = pr; return q; };
    }
    return d;
  };

  /* Extensions des triceps.
     Sortes : (défaut) pushdown à la poulie haute ; nuque (au-dessus de la tête) ; front (barre au front, couché) ;
     kickback ; croise (deux poulies hautes croisées) ; travers (un bras, en travers du corps) ; tate ; jm ;
     pullover ; machine ; horizontal (assis dos à la poulie). Prise : (pronation), neutre, sup. Côtés : uni. */
  FAM.triceps = (c, o, C) => {
    const m = coteDe(o), pron = o.neutre || o.corde ? 90 : o.sup ? 0 : 180;
    let P, p, fixe, vue, a, b, ancre = null, autre = null, r = { bout: o.corde ? 'corde' : o.barreP ? 'barre' : null, lCable: 0.55, disques: 0.13 }, tenu = null;
    if (o.front || o.tate || o.jm || o.pullover) {
      // Couché : bras à la verticale au-dessus des épaules ; seuls les coudes plient (barre au front).
      if (o.banc == null && !o.sol && !o.decline) o.plat = true;
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = P.vue;
      if (o.tate) { a = B(0, 90, 0, 6, 180); b = B(75, 82, 0, 122, 180); }                      // les haltères descendent sur la poitrine, coudes ouverts
      else if (o.jm) { a = B(0, 90, 0, 5, 180); b = B(22, 62, 0, 112, 180); }                  // entre le développé serré et la barre au front
      else if (o.pullover) { a = B(0, 150, 0, 100, pron); b = B(0, 95, 0, 10, pron); }
      else { a = B(0, 100, 0, 112, pron); b = B(0, 94, 0, 6, pron); }
      ancre = V(0, 0.3, -1.35);
    } else if (o.nuque) {
      // Bras à la verticale, les avant-bras descendent derrière la tête.
      // Debout : vu de trois quarts arrière (on voit les avant-bras descendre) ; assis contre un dossier : de trois quarts avant.
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = P.sorte === 'assis' && o.assis ? { az: 42, el: 8 } : { az: 150, el: 8 };
      if (o.haute) {
        // Dos à la poulie haute, buste penché : les bras poussent vers l'avant.
        p = debout(c, { penche: 42, dy: -0.06, dz: -0.02, lomb: 3, cou: -22 });
        p.jambes.G = pied(c, 1, { z: 0.3 }); p.jambes.D = pied(c, -1, { z: -0.3, pointe: 25 });
        a = B(0, 150, 0, 128, pron); b = B(0, 150, 0, 8, pron); ancre = V(0, 2.0, -0.75); vue = { az: 110, el: 8 };
      } else { a = B(m === 'GD' ? 6 : 20, 168, 0, 132, pron); b = B(m === 'GD' ? 6 : 20, 174, 0, 8, pron); ancre = o.katana ? (s => V(s * 0.55, 0.1, -0.2)) : V(0, 0.15, -0.7); }
      if (o.hal1) {
        // Un seul haltère tenu à deux mains, à la verticale.
        a = B(4, 168, -8, 128, 90); b = B(4, 174, -6, 8, 90);
        tenu = [{ t: 'haltere', m: 'G', k: 1.2 }];
      }
    } else if (o.kickback) {
      if (!o.tabouret && !o.penche) o.penche = 72;
      if (o.tabouret) o.penche = 48;
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = { az: 110, el: 8 };
      a = B(0, -6, 0, 96, pron === 180 ? 90 : pron); b = B(0, -12, 0, 4, pron === 180 ? 90 : pron);
      ancre = V(0, 0.15, 0.95);
      if (m !== 'GD' && !o.tabouret) { const t = c.tronc(p); autre = { prise: t.hanches.D.clone().add(V(-0.06, -0.2, 0.3)), pole: V(-1, 0.3, -0.4), paume: V(0, -1, 0), dirMain: V(0.3, -0.2, 1), doigts: 'detendu' }; }
    } else if (o.croise) {
      // Deux poulies hautes : chaque main tient le câble d'en face ; les bras s'ouvrent vers le bas.
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = { az: 12, el: 8 };
      a = B(45, 78, -35, 122, 180); b = B(80, 58, -5, 8, 180);
      ancre = s => V(-s * 0.85, 2.0, 0.25);
    } else if (o.travers) {
      // Un bras : le coude devant le buste, la main part de l'épaule opposée et s'étend sur le côté.
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = { az: 20, el: 8 };
      a = B(25, 82, -70, 118, 180); b = B(70, 84, -5, 8, 180); ancre = s => V(-s * 0.9, 1.45, 0.2);
    } else if (o.horizontal) {
      // Assis dos à la poulie haute : les avant-bras partent de derrière la tête et s'étendent vers l'avant.
      o.assis = true; P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = { az: 120, el: 8 };
      a = B(0, 108, 0, 128, 90); b = B(0, 100, 0, 8, 90); ancre = V(0, 1.55, -0.95);
    } else if (o.machine) {
      // Assis, le haut des bras posé sur un coussin : les mains poussent les poignées vers le bas.
      p = assis(c, { h: 0.52, penche: 10, zPieds: 0.3 }); p.thorax = 4;
      a = B(4, 56, 0, 122, 90); b = B(4, 56, 0, 10, 90);
      const t = c.tronc(p), ep = t.epaules.G;
      fixe = poseFixe(MAT.siege(C, 0.52, 0.5, 4)).concat(poseFixe(MAT.pupitre(C, ep.y - 0.22, ep.z + 0.25, 35)));
      r.pivot = s => V(s * 0.2, ep.y - 0.3, ep.z + 0.32); vue = { az: 55, el: 10 };
    } else {
      // Pushdown : face à la poulie haute, coudes au corps ; les avant-bras descendent.
      P = postureDe(c, o, C, { penche: 8 }); p = P.p; fixe = P.fixe; vue = { az: 55, el: 8 };
      a = B(20, 14, 0, 118, pron); b = B(20, 9, 0, 6, pron);
      if (o.corde) b = B(40, 9, 12, 4, 90);                       // la corde s'ouvre en bas
      ancre = V(0, 2.02, 0.42);
      if (!r.bout && m === 'GD' && (o.poulie || !o.elas)) r.bout = 'barre';
      if (!o.elas && !o.poulie) o.poulie = true;
    }
    r.ancre = ancre;
    if (o.smith) o.barre = true;
    if (!(o.barre || o.ez || o.hal || o.kb || o.poulie || o.elas || o.machine || o.hal1)) o.hal = true;
    if (o.elas && ancre) r.deElas = ancre;
    const ancres = !ancre ? null : typeof ancre === 'function' ? [ancre(1), ancre(-1)].slice(0, m === 'GD' ? 2 : 1) : ancre;
    const d = Object.assign(parLesBras(p, a, b, m, autre), { fixe: colonneSi(o, C, ancres, fixe || []), vue, tenu: tenu || tenuDe(o, m, r) }, rythmeDe(o));
    // Smith machine (développé JM) : la barre coulisse entre deux rails.
    if (o.smith) { const info = c.poser(d.a); d.tenu = [{ t: 'barre', l: 1.6, d: 0.18 }]; d.fixe = d.fixe.concat(poseFixe(MAT.smith(C, (info.prises.G.z + info.prises.D.z) / 2))); }
    return d;
  };

  /* Élévations et tirages des épaules et des trapèzes.
     Sortes : lat (élévation latérale, défaut), front, arriere (oiseau), y, menton (rowing menton), shrug, facepull,
     rotext (rotation externe), cubain (rotation cubaine), lu, cercles, ange (ange mural), passage (bande passée
     par-dessus la tête), tete (kettlebell autour de la tête), volant (disque tourné comme un volant), tenue (maintien
     bras tendus devant). Options : hal, barre, disque, poulie, elas, machine, kb ; uni, alt ; postures de postureDe ;
     marteau ; serre, large (rowing menton) ; dos (barre derrière le dos) ; kelso (haussement, buste sur banc incliné) ;
     smith (la barre coulisse entre deux rails) ; trapbar (haussement à la barre hexagonale). */
  FAM.elevation = (c, o, C) => {
    // Sorte par défaut, admise dans l'écriture : o.lat (élévation latérale).
    const m = coteDe(o);
    if (o.smith) o.barre = true;
    if (!(o.barre || o.ez || o.kb || o.poulie || o.elas || o.machine || o.disque || o.pc || o.balle || o.trapbar)) o.hal = true;
    let P, p, fixe, vue, a, b, ancre = null, autre = null, r = { disques: 0.13, lCable: 0.5 }, plus = {};
    const pose = def => { P = postureDe(c, o, C, def); p = P.p; fixe = P.fixe; vue = P.vue; };
    if (o.front) {
      pose(); const pr = o.marteau || o.disque ? 90 : 180, plan = o.disque ? -4 : 2;
      a = B(plan, 10, o.disque ? -18 : 0, 10, pr); b = B(plan, o.haut ? 165 : 94, o.disque ? -18 : 0, 10, pr);
      ancre = V(0, 0.1, -0.7); r.bout = m === 'GD' && o.poulie ? (o.corde ? 'corde' : 'barre') : null;
      if (o.volant) plus.pose = true;
      if (P.sorte === 'ventre') { const ang = o.ventre === true ? 45 : o.ventre; a = B(2, ang * 0.95, 0, 10, pr); b = B(2, 165, 0, 10, pr); }
    } else if (o.arriere) {
      // Oiseau : buste penché (ou à plat ventre sur banc incliné), les bras s'ouvrent ; debout aux poulies croisées.
      if (o.poulie && !o.penche && !o.tabouret && o.ventre == null) {
        pose(); a = B(-18, 86, -70, 14, 90); b = B(108, 88, 10, 14, 90); ancre = s => V(-s * 0.75, 1.5, 0.85); vue = { az: 150, el: 10 };
      } else if (o.machine) {
        // Butterfly inversé : assis face au dossier, bras tendus devant qui s'ouvrent.
        p = assis(c, { h: 0.5, zPieds: 0.3 }); const t = c.tronc(p);
        fixe = poseFixe(MAT.siege(C, 0.5)).concat([pret(boite(0.3, 0.5, 0.06, 0, t.epaules.G.y - 0.2, t.epaules.G.z + 0.19, C.banc, 0))]);
        a = B(8, 86, -80, 12, 90); b = B(104, 88, 10, 12, 90); r.pivot = () => V(0, t.epaules.G.y + 0.35, t.epaules.G.z + 0.3); vue = { az: 150, el: 12 };
      } else {
        if (o.tabouret) o.penche = 62; else if (o.ventre == null && !o.penche && !o.cote) o.penche = 76;
        pose(); const pen = P.sorte === 'ventre' ? (o.ventre === true ? 45 : o.ventre) : (o.penche === true ? 76 : o.penche || 76);
        a = B(6, pen * 0.96, -80, 14, 90); b = B(o.t ? 96 : 104, 88, 10, 16, o.t ? 180 : 90); ancre = s => V(-s * 0.6, 0.1, 0.5);
        if (m !== 'GD' && P.sorte === 'penche') { const t = c.tronc(p); autre = { prise: t.hanches.D.clone().add(V(-0.07, -0.15, 0.3)), pole: V(-1, 0.3, -0.4), paume: V(0, -1, 0), dirMain: V(0.3, -0.2, 1), doigts: 'detendu' }; }
      }
    } else if (o.y) {
      // Élévation en Y : les bras montent en diagonale, pouces vers le haut.
      if (o.ventre == null && !o.poulie) o.ventre = 40;
      pose();
      if (P.sorte === 'ventre') { const ang = o.ventre === true ? 40 : o.ventre; a = B(10, ang, 0, 8, 90); b = B(38, 152, 0, 8, 90); }
      else { a = B(-10, 30, -40, 10, 90); b = B(38, 150, 0, 8, 90); ancre = s => V(-s * 0.5, 0.1, 0.6); vue = { az: 160, el: 8 }; }
    } else if (o.menton) {
      // Rowing menton : les coudes montent haut sur les côtés, les mains longent le buste.
      pose(); const serre = o.serre ? -8 : o.large ? 12 : 0;
      a = B(10, 9, -30 + serre, 8, 180); b = B(82, o.large ? 76 : 84, -84 + serre, o.large ? 96 : 116, 180);
      ancre = V(0, 0.1, 0.35); r.bout = o.poulie ? (o.corde ? 'corde' : 'barre') : null;
    } else if (o.shrug) {
      // Haussement d'épaules : bras tendus, seules les épaules montent.
      if (o.kelso) o.ventre = 40;
      pose();
      const base = o.kelso ? B(4, 40, 0, 5, 90) : o.dos ? B(0, -12, 0, 6, 0) : o.barre ? B(0, 8, -25, 6, 180) : o.trapbar ? B(90, 11, 0, 6, 90) : B(90, 5, 0, 6, 90);
      a = Object.assign({}, base, o.kelso ? { avance: 10 } : {}); b = Object.assign({}, base, o.kelso ? { avance: -14, hausse: 8 } : { hausse: 26 });
      ancre = s => V(s * 0.28, 0.05, 0.02); if (o.machine) r.pivot = s => V(s * 0.3, 0.3, -0.5);
    } else if (o.facepull) {
      // Tirage visage : la corde vient vers le front, coudes hauts, mains de part et d'autre de la tête.
      if (o.sol) { pose(); a = B(6, 92, -10, 8, 180); b = B(86, 88, 78, 104, 150); ancre = V(0, 1.2, -1.2); }
      else { pose(); a = B(6, 92, -10, 8, 180); b = B(86, 90, 78, 104, 150); ancre = V(0, P.sorte === 'assis' ? 1.3 : 1.62, 1.0); vue = { az: 140, el: 10 }; }
      r.bout = o.poulie ? 'corde' : null; if (o.elas) r.deElas = () => ancre; if (o.sup) { a.pron = 20; b.pron = 30; }
    } else if (o.rotext) {
      // Rotation externe : coude au corps plié à angle droit (couché sur le côté), ou coude à hauteur d'épaule.
      if (o.cote) {
        p = surLeCote(c, { cote: 'D' }); fixe = []; vue = { az: 0, el: 22 };
        a = B(90, 6, -62, 90, 90); b = B(90, 6, 38, 90, 90);
        autre = B(0, 150, 0, 60, 90, { doigts: 'detendu' });
      } else { pose(); a = B(90, 86, 4, 90, 180); b = B(90, 86, 86, 90, 180); }
    } else if (o.cubain) {
      // Rotation cubaine : coudes à hauteur d'épaules, les avant-bras basculent de bas en haut.
      pose(); a = B(84, 84, -80, 92, 180); b = B(84, 84, 86, 92, 180);
    } else if (o.cercles) {
      // Cercles de bras : bras en croix, petits cercles.
      pose(); a = B(90, 88, 0, 4, 180, { doigts: 'detendu' }); b = a; plus.cercles = true;
    } else if (o.ange) {
      // Ange mural : dos au mur, les bras glissent du « chandelier » jusqu'au-dessus de la tête.
      pose(); fixe = fixe.concat(poseFixe(MAT.mur(C, -c.L.dos - 0.07)));
      a = B(92, 82, 88, 100, 180, { doigts: 'plat' }); b = B(92, 158, 88, 22, 180, { doigts: 'plat' }); vue = { az: 0, el: 6 };
    } else if (o.passage) {
      // Bande tenue large, bras tendus : elle passe de devant les cuisses à derrière le dos, par-dessus la tête.
      pose(); a = B(40, 20, 0, 4, 180); b = B(60, 200, 0, 4, 180); vue = { az: 60, el: 8 };
    } else if (o.tete) {
      // Kettlebell tenu à deux mains, qui tourne autour de la tête.
      pose(); a = B(0, 60, -30, 120, 90); b = a; plus.halo = true;
    } else if (o.tenue) {
      pose(); a = B(-3, 92, -18, 8, 90); b = B(-3, 94, -18, 8, 90); plus.rythme = 'tenue';
    } else {
      // Élévation latérale : bras presque tendus, levés sur les côtés jusqu'à l'horizontale (lu : jusqu'en haut).
      if (o.cote) {
        // Couché sur le côté sur un banc incliné : un bras.
        p = surLeCote(c, { cote: 'D' }); fixe = []; vue = { az: 0, el: 20 };
        a = B(90, 4, 0, 10, 90); b = B(90, 92, 0, 10, 90); autre = B(0, 150, 0, 60, 90, { doigts: 'detendu' });
      } else {
        pose({ roulis: 0 });
        const haut = o.lu ? 172 : 86;
        a = B(88, 9, 0, 12, 90); b = B(86, haut, 0, o.poliquin ? 14 : 14, o.lu ? 150 : 90);
        if (o.poliquin) a = B(60, 20, 30, 95, 90);                        // montée coudes pliés, descente bras tendus
        if (o.latfront) { plus.cles = true; }
        ancre = s => V(-s * 0.75, 0.1, 0.05);
        if (o.machine) { a = B(88, 12, 0, 85, 90); b = B(88, 84, 0, 85, 90); r.pivot = s => V(s * 0.2, 1.36, -0.25); }
        if (P.sorte === 'ventre') { const ang = o.ventre === true ? 45 : o.ventre; a = B(20, ang * 0.9, 0, 12, 90); b = B(84, 86, 0, 14, 90); }
        if (o.penchecote) { p.bassin.rot = qZ(-14 * (m === 'D' ? -1 : 1)); p.bassin.pos.x += 0.1 * (m === 'D' ? 1 : -1); autre = B(90, 70, 0, 20, 90); }
      }
    }
    r.ancre = ancre;
    if (o.elas && ancre && !r.deElas && o.ancreElas) r.deElas = ancre;
    const ancres = !ancre ? null : typeof ancre === 'function' ? [ancre(1), ancre(-1)].slice(0, m === 'GD' ? 2 : 1) : ancre;
    const d = Object.assign(parLesBras(p, a, b, m, autre), { fixe: colonneSi(o, C, ancres, fixe || []), vue, tenu: tenuDe(o, m, r) }, rythmeDe(o));
    if (plus.rythme) d.rythme = plus.rythme;
    if (o.smith) { const info = c.poser(d.a); d.tenu = [{ t: 'barre', l: 1.6, d: 0.18 }]; d.fixe = d.fixe.concat(poseFixe(MAT.smith(C, (info.prises.G.z + info.prises.D.z) / 2))); }
    if (o.trapbar) { d.tenu = []; d.objets = barreHexagonale(C); }
    if (o.landmine) {
      // La barre tenue par un bout, l'autre bout posé au sol devant soi : elle suit la main.
      const piv = V(0, 0.05, 1.5); d.tenu = [];
      d.objets = (info, u, sortie) => { const pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[m], dir = unite(pr.clone().sub(piv)); sortie.push(pret(seg(piv, pr.clone().add(dir.clone().multiplyScalar(0.12)), 0.025, C.metal, 1))); poserObjet([cyl(0.13, 0.04, 0, 0, 0, C.fonte, 0, DEBOUT_Q)], pr.clone().sub(dir.clone().multiplyScalar(0.2)), arc(AY, dir), sortie); };
    }
    if (o.passage) d.tenu = [{ t: 'elastique', de: info => info.prises.D, m: 'G', bout: 'rien' }];
    if (plus.cercles) { d.rythme = 'continu'; d.periode = 1.6; const A = d.a; d.pose = ph => { const q = cloner(A), w = ph * 2 * Math.PI; for (const k of ['G', 'D']) { q.bras[k].elev = 88 + 9 * Math.sin(w); q.bras[k].plan = 90 + 9 * Math.cos(w); } return q; }; }
    if (plus.halo) { d.rythme = 'continu'; d.periode = 3.2; const A = d.a; d.tenu = [{ t: 'kb', m: 'G', sens: 'avantbras' }]; d.pose = ph => { const q = cloner(A), w = ph * 2 * Math.PI; q.bras.G = B(20 + 60 * Math.sin(w), 118 + 30 * Math.sin(w + 1.2), -20, 118, 90); q.bras.D = B(20 - 60 * Math.sin(w), 118 + 30 * Math.sin(w + 1.2), -20, 118, 90); return q; }; }
    if (plus.cles) { const A = d.a, Zl = d.b, F = cloner(d.a); for (const k of ['G', 'D']) F.bras[k] = B(4, 90, 0, 10, 180); d.cles = [[0, A], [0.45, Zl], [1, F]]; }
    if (plus.pose) { const A = d.a, Z = d.b; d.rythme = 'continu'; d.periode = 4; d.pose = ph => { const u = ph < 0.2 ? lisse(ph / 0.2) : ph > 0.85 ? 1 - lisse((ph - 0.85) / 0.15) : 1, q = mel(A, Z, u), w = Math.sin((ph - 0.2) / 0.65 * 2 * Math.PI) * (u >= 1 ? 1 : 0); q.bras.G.elev += 10 * w; q.bras.D.elev -= 10 * w; return q; }; }
    return d;
  };

  /* Développés : la main part de près de l'épaule et pousse jusqu'au bout du bras.
     (défaut) développé pour la poitrine, couché (plat, banc=<angle>, decline, sol), assis (machine, poulie ; avec
     incline ou decline, la poussée monte ou descend) ou debout
     (poulie) ; epaules : au-dessus de la tête, debout, assis, genoux ou demigenou.
     Matériel : barre, hal, kb, smith, machine, poulie, elas. Prise : serre, large, neutre. Côtés : uni, alt.
     Variantes : larsen (jambes en l'air), partiel (arrêt au-dessus de la poitrine), nuque, arnold, pousse (élan des
     jambes), landmine, svend (disque serré entre les paumes), autour (un bras, en travers du corps). */
  FAM.developpe = (c, o, C) => {
    const L = c.L, m = coteDe(o), haut = !!o.epaules;
    const libre = !(o.barre || o.smith || o.landmine || o.svend);       // mains indépendantes
    // Assis à la machine, incline et decline disent le sens de la poussée, pas l'inclinaison d'un banc.
    const montee = o.assis && o.machine ? (o.incline ? 28 : o.decline ? -22 : 0) : 0;
    if (montee) o.decline = false;
    if (!(o.barre || o.smith || o.kb || o.machine || o.poulie || o.elas || o.landmine || o.svend || o.pc)) o.hal = true;
    if (!haut && !o.assis && !o.debout && !o.sol && o.banc == null && !o.decline && !o.svend && !o.autour && !o.genoux && !o.demigenou) o.plat = true;
    if (o.debout) { o.plat = false; }
    if (o.larsen) o.jambes = J(12, 5, 0, 6, 25);
    const P = postureDe(c, o, C, { penche: haut || o.svend ? 0 : 4 });
    let p = P.p, fixe = P.fixe, vue = haut ? { az: 30, el: 8 } : P.vue;
    if (o.debout && !haut) { p.jambes.G = pied(c, 1, { z: 0.22 }); p.jambes.D = pied(c, -1, { z: -0.24, pointe: 22 }); p.bassin.rot = qX(6); vue = { az: 70, el: 8 }; }
    const t = c.tronc(p);
    const dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const portee = L.bras + L.prise - 0.035;
    const eBas = libre ? (o.serre ? 0.15 : 0.27) : (o.serre ? 0.17 : o.large ? 0.47 : 0.38), eHaut = libre ? (o.serre ? 0.12 : 0.18) : eBas;
    let bas, hautP, pole, dirMain, paumeA, paumeB;
    if (haut) {
      // Au-dessus de la tête : des clavicules (ou des épaules) jusqu'au bout des bras.
      bas = s => (o.nuque ? V(s * 0.42, -0.01, -0.105) : libre ? V(s * 0.3, -0.02, 0.03) : V(s * eBas * 0.82, -0.075, 0.135));
      hautP = s => (o.nuque ? V(s * 0.4, portee, -0.05) : V(s * (libre ? 0.2 : eBas * 0.82), portee, libre ? 0.0 : 0.02));
      pole = s => (o.nuque ? V(s * 1, -0.7, -0.1) : libre ? V(s * 1, -0.8, 0.25) : V(s * 0.7, -1, 0.5));
      dirMain = V(0, 1, 0); paumeA = paumeB = s => (o.neutre ? V(-s, 0, 0.1) : V(0, 0, 1));
      if (o.arnold) { paumeA = () => V(0, 0, -1); bas = s => V(s * 0.17, -0.07, 0.17); }
      if (o.landmine) { bas = s => V(s * (m === 'GD' ? 0.07 : 0.2), -0.1, 0.17); hautP = s => V(s * (m === 'GD' ? 0.06 : 0.17), 0.36, 0.44); dirMain = V(0, 0.75, 0.66); paumeA = paumeB = s => V(-s, 0, 0); pole = s => V(s * 0.6, -1, 0.1); }
    } else if (o.svend) {
      // Disque serré entre les deux paumes, poussé droit devant la poitrine.
      bas = s => V(s * 0.02, -0.12, 0.2); hautP = s => V(s * 0.02, -0.1, portee - 0.04); pole = s => V(s * 0.8, -0.7, -0.2); dirMain = V(0, 0.2, 1); paumeA = paumeB = s => V(-s, 0, 0);
    } else {
      const zBas = o.sol ? 0.2 : o.partiel ? 0.2 : 0.135;
      bas = s => V(s * eBas, o.banc > 20 ? -0.07 : -0.115, zBas + (libre ? 0.02 : 0));
      hautP = s => V(s * eHaut, o.banc > 20 ? 0.0 : -0.02, portee);
      pole = s => (o.serre ? V(s * 0.3, -0.6, -1) : V(s * 0.75, -0.35, -1));
      dirMain = V(0, 0, 1); paumeA = paumeB = s => (o.neutre || o.marteau ? V(-s, 0, 0) : V(0, -1, 0));
      // Assis à la machine, la poussée peut monter (incline) ou descendre (decline).
      if (montee) { const an = rad(montee); bas = s => V(s * eBas, montee > 0 ? -0.06 : -0.17, zBas + 0.02); hautP = s => V(s * eHaut, (montee > 0 ? -0.02 : -0.06) + portee * Math.sin(an) * 0.96, portee * Math.cos(an)); }
      if (o.autour) { bas = s => V(s * 0.3, -0.12, 0.12); hautP = s => V(-s * 0.1, -0.16, portee - 0.06); pole = s => V(s * 0.6, -0.8, -0.4); paumeA = paumeB = s => V(-s, 0, 0); vue = { az: 25, el: 8 }; }
    }
    const bras = (f, pa, doigts) => {
      const r = {};
      for (const [k, s] of COTES) r[k] = { prise: t.duThorax(f(s)), pole: dT(...pole(s).xyz()), paume: dT(...pa(s).xyz()).normalize(), dirMain: dT(dirMain.x, dirMain.y, dirMain.z), doigts: doigts || 'barre' };
      return r;
    };
    // Le mouvement va du haut (bras tendus, départ) au bas (barre à la poitrine), puis remonte.
    const autre = m !== 'GD' ? (haut ? { prise: t.hanches.D.clone().add(V(-0.085, 0.1, 0.03).applyQuaternion(t.qBassin)), pole: dT(-0.8, 0, -0.6), paume: dT(1, -0.2, 0), dirMain: dT(0.2, -0.3, 1), doigts: 'detendu' } : bras(hautP, paumeB).D) : null;
    const d = parLesBras(p, bras(hautP, paumeB), bras(bas, paumeA), m, autre);
    if (m !== 'GD' && !haut && !o.poulie) { d.a.bras.D = cloner(bras(hautP, paumeB).D); d.b.bras.D = cloner(bras(hautP, paumeB).D); if (o.hal || o.kb) { /* l'autre haltère reste en haut */ } }
    // Matériel.
    const r = { disques: haut ? 0.16 : 0.225, sensKb: 'avantbras' };
    let tenu;
    if (o.landmine) {
      const pivot = V(0, 0.05, t.epaules.G.z + 1.45);
      tenu = [{ t: 'levier', de: pivot, m: m === 'GD' ? 'G' : m, bout: 'rien' }];
      fixe = fixe.concat([pret(boite(0.2, 0.08, 0.2, pivot.x, 0.04, pivot.z, C.cadre, 0.5))]);
      d.objets = (info, u, sortie) => { const k = m === 'GD' ? 'G' : m, pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[k], dir = unite(pr.clone().sub(pivot)); sortie.push(pret(seg(pivot, pr.clone().add(dir.clone().multiplyScalar(0.12)), 0.025, C.metal, 1))); sortie.push(pret(cyl(0.15, 0.04, 0, 0, 0, C.fonte, 0))); const dq = sortie[sortie.length - 1], pp = pr.clone().sub(dir.clone().multiplyScalar(0.18)), q = arc(AY, dir); dq.p = [pp.x, pp.y, pp.z]; dq.q = [q.x, q.y, q.z, q.w]; };
      tenu = [];
    } else if (o.svend) tenu = [{ t: 'disque', m: 'GD', r: 0.14, axe: AX }];
    else if (o.smith) { tenu = [{ t: 'barre', l: 1.6, d: 0.18 }]; }
    else {
      const anc = haut ? (s => V(s * 0.35, 0.1, -0.05)) : P.sorte === 'dos' ? (s => V(s * 0.95, 0.2, t.epaules.G.z)) : (s => V(s * 0.45, t.epaules.G.y - 0.05, t.epaules.G.z - 0.95));
      r.ancre = anc; r.deElas = haut ? null : anc;
      if (o.machine) r.pivot = haut ? (s => V(s * 0.3, t.epaules.G.y + 0.45, t.epaules.G.z - 0.35)) : (s => V(s * 0.32, t.epaules.G.y + 0.55, t.epaules.G.z + 0.1));
      tenu = tenuDe(o, m === 'GD' ? 'GD' : (haut || o.poulie ? m : 'GD'), r);
      if (o.poulie) for (const s of m === 'GD' ? [1, -1] : [m === 'D' ? -1 : 1]) poserObjet(MAT.colonne(C, anc(s)), V(), null, fixe);
    }
    if (o.smith) {
      const zB = t.duThorax(hautP(1)).z;
      fixe = fixe.concat(poseFixe(MAT.smith(C, zB)));
    }
    // Barre retenue par des élastiques (développé couché avec bandes) : une bande de chaque main jusqu'au sol.
    if (o.barre && o.elas && !haut) { const zB = t.duThorax(hautP(1)).z; for (const k of ['G', 'D']) tenu.push({ t: 'elastique', de: V((k === 'G' ? 1 : -1) * 0.5, 0.03, zB), m: k, bout: 'rien' }); }
    Object.assign(d, { fixe, vue, tenu }, rythmeDe(o));
    if (o.pousse) {
      // Développé poussé : les genoux plient un peu puis les jambes lancent la barre. Départ en bas.
      const A = d.b, Z = d.a;
      d.pose = u => { const q = mel(A, Z, lisse(borne((u - 0.3) / 0.7, 0, 1))), dy = -0.09 * Math.sin(Math.PI * borne(u / 0.45, 0, 1)); q.bassin.pos.y += dy; q.bassin.pos.z -= 0.02 * Math.sin(Math.PI * borne(u / 0.45, 0, 1)); for (const k of ['G', 'D']) { if (u < 0.45) q.bras[k].prise.y += dy; } return q; };
    } else if (haut) { const A = d.a; d.a = d.b; d.b = A; }                 // au-dessus de la tête : on part d'en bas
    return d;
  };
  V3.prototype.xyz = function () { return [this.x, this.y, this.z]; };

  /* Écartés : bras presque tendus qui se referment devant la poitrine.
     Couché (plat, banc=<angle>, decline, sol) avec haltères ou poulies basses ; debout, à genoux ou assis aux
     poulies (haut : de haut en bas ; bas : de bas en haut ; sinon à hauteur de poitrine) ; machine (pecdeck : coudes
     pliés sur les coussins) ; elas. Côtés : uni. */
  FAM.ecarte = (c, o, C) => {
    const m = coteDe(o);
    if (!(o.poulie || o.machine || o.elas)) o.hal = true;
    const couche = o.plat || o.banc != null || o.decline || o.sol;
    if (!couche && o.hal && !o.debout) o.plat = true;      // haltères : couché, sauf écarté debout (de bas en haut)
    if (o.machine) o.assis = true;
    const P = postureDe(c, o, C); let p = P.p, fixe = P.fixe, vue = P.vue, a, b, ancre;
    const t = c.tronc(p);
    if (P.sorte === 'dos') {
      a = B(102, 88, 12, 24, 0); b = B(6, 90, -84, 16, 0);
      if (o.sol) a = B(96, 88, 6, 30, 0);
      ancre = s => V(s * 1.0, 0.2, t.epaules.G.z); vue = { az: 150, el: 22 };
      if (o.basHaut) { a = B(100, 60, 10, 24, 0); b = B(6, 110, -84, 16, 0); }
    } else if (o.pecdeck) {
      a = B(102, 86, 96, 92, 90); b = B(10, 86, 8, 92, 90); vue = { az: 25, el: 10 };
    } else {
      // Aux poulies (ou à la machine, bras tendus) : buste droit ou un peu penché, un pied en avant.
      const hA = o.haut ? 2.0 : o.bas ? 0.15 : t.epaules.G.y - 0.02;
      if (P.sorte === 'debout') { p.bassin.rot = qX(o.haut ? 14 : 6); p.jambes.G = pied(c, 1, { z: 0.2 }); p.jambes.D = pied(c, -1, { z: -0.22, pointe: 20 }); }
      a = o.haut ? B(98, 104, 10, 26, 0) : o.bas ? B(96, 38, 6, 22, 0) : B(102, 88, 12, 24, 0);
      b = o.haut ? B(14, 48, -76, 18, 0) : o.bas ? B(8, 104, -84, 18, 0) : B(6, 88, -84, 16, 0);
      ancre = s => V(s * 1.0, hA, t.epaules.G.z - 0.2); vue = { az: 20, el: 8 };
    }
    const r = { ancre, deElas: ancre, pivot: s => V(s * 0.35, t.epaules.G.y + 0.5, t.epaules.G.z - 0.1) };
    if (o.poulie && ancre) for (const s of m === 'GD' ? [1, -1] : [m === 'D' ? -1 : 1]) poserObjet(MAT.colonne(C, ancre(s)), V(), null, fixe);
    return Object.assign(parLesBras(p, a, b, m), { fixe, vue, tenu: tenuDe(o, m, r) }, rythmeDe(o));
  };

  /* Pull-over : couché, les bras partent de derrière la tête et reviennent au-dessus de la poitrine.
     hal (un haltère tenu à deux mains), barre, poulie, machine (assis : les bras descendent de devant le visage). */
  FAM.pullover = (c, o, C) => {
    if (o.machine) {
      const p = allonge(c, { h: 0.44, angle: 84, lomb: 0, thor: 0, cou: 0 }), t = c.tronc(p);
      const a = B(0, 150, 0, 85, 90), b = B(0, 40, 0, 85, 90);
      return Object.assign(parLesBras(p, a, b), { fixe: poseFixe(MAT.banc(C, 84)), vue: { az: 60, el: 10 }, tenu: [{ t: 'levier', de: V(0.24, t.epaules.G.y + 0.02, t.epaules.G.z - 0.02), m: 'G' }, { t: 'levier', de: V(-0.24, t.epaules.G.y + 0.02, t.epaules.G.z - 0.02), m: 'D' }] });
    }
    o.plat = true; if (o.jambesHautes) o.jambes = 'levees';
    const P = postureDe(c, o, C), p = P.p;
    const a = B(0, 162, o.barre ? 0 : -6, 24, o.barre ? 180 : 90), b = B(0, 96, o.barre ? 0 : -6, 16, o.barre ? 180 : 90);
    const tenu = o.barre || o.ez ? [{ t: 'barre', l: 1.2, d: 0.12 }] : o.poulie ? [{ t: 'cable', de: V(0, 0.3, -1.5), bout: 'corde' }] : [{ t: 'haltere', m: 'G', k: 1.25 }];
    const fixe = o.poulie ? P.fixe.concat(poseFixe(MAT.colonne(C, V(0, 0.3, -1.5)))) : P.fixe;
    return Object.assign(parLesBras(p, a, b), { fixe, vue: { az: 120, el: 16 }, tenu });
  };

  /* Corps tendu comme une planche, en appui sur les talons (visage vers le haut) ou la pointe des pieds (visage
     vers le bas), incliné de `angle` degrés au-dessus de l'horizontale. Renvoie la pose de base (sans les bras). */
  function corpsDroit(c, o) {
    const L = c.L, a = rad(o.angle), haut = o.face === 'haut', zP = o.zPieds || 0, yP = o.yPieds || 0;
    // La ligne du corps part des chevilles et monte vers la tête (vers -Z si le visage regarde en haut, +Z sinon).
    const dir = V(0, Math.sin(a), (haut ? -1 : 1) * Math.cos(a));
    const rot = haut ? qX(-(90 - o.angle)) : qX(90 - o.angle);
    const p = { bassin: { pos: V(), rot }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou == null ? (haut ? 8 : -20) : o.cou, bras: pareil(brasRepos()), jambes: {} };
    // Visage vers le bas : sur la pointe des pieds, le talon d'autant plus levé que le corps est à plat.
    const pointe = borne(92 - o.angle * 1.15, 12, 80);
    for (const [k, s] of COTES) {
      if (haut) p.jambes[k] = { cheville: V(s * (o.ecartPieds || 0.09), yP + 0.07, zP), pole: V(0, 1, -0.2), pied: V(0, 0.75, 0.66), hautPied: V(0, 0.66, -0.75) };
      else p.jambes[k] = pied(c, s, { x: s * (o.ecartPieds || 0.09), z: zP, y0: yP, ouv: 0, pointe, pole: V(0, -1, 0.15) });
    }
    const cheville = p.jambes.G.cheville.clone().setX(0);
    p.bassin.pos = cheville.clone().add(dir.clone().multiplyScalar(L.jambe + L.cuisse - 0.004)).sub(L.hanche.clone().setX(0).applyQuaternion(rot));
    return p;
  }

  /* Rowings : la main part bras tendu et vient au buste, le coude passe derrière.
     Postures : penche (défaut : 55° ; pendlay : presque à l'horizontale ; yates : buste relevé), ventre=<angle>
     (poitrine appuyée sur banc incliné), seal (à plat ventre sur un banc haut), appui (une main et un genou sur un
     banc), assis (poulie basse, jambes devant), debout (poulie, un pied en avant), machine (assis, poitrine appuyée),
     landmine / tbar (barre tenue par un bout). Cible : (bas des côtes), haut (coudes écartés, vers la poitrine),
     hanche. Matériel : barre, hal, kb, poulie, elas, machine, smith. Prise : (pronation), sup, neutre. Côtés : uni, alt. */
  FAM.rowing = (c, o, C) => {
    const L = c.L, m = coteDe(o);
    if (!(o.barre || o.kb || o.poulie || o.elas || o.machine || o.smith || o.landmine || o.tbar)) o.hal = true;
    let p, fixe = [], vue = { az: 128, el: 10 }, ancre = null, pendante = false;
    if (o.seal) { p = aPlatVentre(c, { h: 0.82, angle: 0, d: 0.1, jambes: 'tendues' }); fixe = poseFixe(MAT.banc(C, 0, 0.82, 1.0, 0.75), V(0, 0, -0.35), qY(180)); pendante = true; vue = { az: 60, el: 8 }; }
    else if (o.ventre != null) { const a = o.ventre === true ? 40 : o.ventre; p = aPlatVentre(c, { h: 0.44, angle: a, d: 0.3 }); fixe = poseFixe(MAT.banc(C, a), V(), qY(180)); pendante = true; vue = { az: 56, el: 10 }; }
    else if (o.tabouret) {
      // Assis au bout d'un banc, le buste penché sur les cuisses : les haltères pendent le long des jambes.
      p = assis(c, { h: 0.45, penche: 58 }); p.cou = -24; fixe = poseFixe(MAT.banc(C, 0), V(0, 0, 0.28)); pendante = true; vue = { az: 58, el: 10 };
    }
    else if (o.appui) {
      // Une main et un genou sur le banc, l'autre pied par terre : le dos à plat.
      const s = m === 'D' ? -1 : 1, kA = s > 0 ? 'D' : 'G', kT = s > 0 ? 'G' : 'D';
      p = { bassin: { pos: V(0, 0.44 + 0.47, 0), rot: qX(80) }, lombaires: 2, thorax: 2, cou: -28, bras: pareil(brasRepos()), jambes: {} };
      p.jambes[kA] = J(78, 4, 0, 96, 40); p.jambes[kT] = pied(c, s, { x: s * 0.24, z: 0.0, ouv: 12 });
      // Le genou d'appui posé sur le banc (l'autre jambe descend jusqu'au sol).
      { const info = c.poser(p); p.bassin.pos.y += 0.44 + 0.065 - info.genoux[kA].y; }
      const t0 = c.tronc(p);
      p.bras[kA] = { prise: V(-s * 0.1, 0.448, t0.epaules[kA].z + 0.06), pole: V(-s * 0.4, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
      fixe = poseFixe(MAT.banc(C, 0), V(-s * 0.1, 0, 0.55)); pendante = true; vue = { az: s > 0 ? 62 : -62, el: 10 };
    } else if (o.assis || o.machine) {
      // Assis : à la poulie basse, jambes devant, pieds calés ; à la machine, poitrine contre le coussin.
      if (o.machine) { p = assis(c, { h: 0.5, zPieds: 0.32 }); const t0 = c.tronc(p); fixe = poseFixe(MAT.siege(C, 0.5)).concat([pret(boite(0.3, 0.45, 0.07, 0, t0.epaules.G.y - 0.22, t0.epaules.G.z + 0.2, C.banc, 0))]); ancre = s => V(s * 0.2, t0.epaules.G.y - (o.haut ? -0.5 : 0.25), t0.epaules.G.z + 0.95); }
      else {
        p = assis(c, { h: 0.42, jambes: J(74, 8, 0, 24, 5), penche: -2 }); p.jambes = pareil(J(74, 8, 0, 24, 5));
        fixe = poseFixe(MAT.banc(C, 0, 0.42, 0.6, 0.3), V(0, 0, 0.1)).concat([pret(boite(0.5, 0.3, 0.05, 0, 0.42, 0.98, C.cadre, 0.5, qX(-25)))]);
        const t0 = c.tronc(p); ancre = () => V(0, o.haut ? 1.9 : 0.72, t0.epaules.G.z + 1.5);
      }
      vue = { az: 70, el: 10 };
    } else if (o.debout) {
      p = debout(c, { penche: 14, dy: -0.08, dz: -0.02, cou: -6 }); p.jambes.G = pied(c, 1, { z: 0.24 }); p.jambes.D = pied(c, -1, { z: -0.26, pointe: 18 });
      ancre = () => V(0, o.haut ? 1.95 : o.bas ? 0.2 : 1.1, 1.5); vue = { az: 70, el: 8 };
    } else if (o.genoux || o.demigenou) { p = o.genoux ? aGenoux(c, { penche: 6 }) : demiGenou(c, { penche: 6 }); ancre = () => V(0, o.haut ? 2.0 : 1.0, 1.5); vue = { az: 70, el: 8 }; }
    else {
      const a = o.pendlay ? 80 : o.yates ? 36 : o.penche && o.penche !== true ? o.penche : 56;
      p = debout(c, { dy: -0.05 - a * 0.0012, dz: -0.06 - a * 0.0026, penche: a, lomb: 3, thor: 4, cou: -a * 0.5, ecart: o.gorille ? 0.3 : 0.15, ouv: 10 });
      pendante = true; ancre = () => V(0, 0.15, 1.2);
    }
    const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const portee = (L.bras + L.prise) * 0.985;
    // Arrivée : au bas des côtes (coudes au corps), à la poitrine (coudes écartés) ou à la hanche.
    const e = o.large ? 0.34 : o.serre || o.landmine || o.tbar ? 0.1 : 0.21;
    const fin = s => (o.haut && !o.assis && !o.debout && !o.genoux && !o.demigenou && !o.machine ? V(s * Math.max(e, 0.3), -0.13, 0.14) : o.hanche ? V(s * e, -0.44, 0.07) : V(s * Math.max(e, 0.19), -0.33, 0.11));
    const paume = s => (o.neutre || o.landmine || o.tbar || o.corde ? V(-s, 0, 0) : o.sup ? V(0, 1, 0) : V(0, -1, 0));
    const depart = (k, s) => {
      if (pendante && !(o.poulie || o.elas)) {
        // Bras pendant à la verticale sous l'épaule (poids libre).
        const yBas = o.gorille || o.pendlay ? 0.24 : null;
        const pt = t.epaules[k].clone().add(V(s * (e - 0.165) * 0.6, -portee, 0.02));
        if (yBas != null) pt.y = Math.max(pt.y, yBas);
        return pt;
      }
      const a = ancre(s), ep = t.epaules[k].clone().add(dT(s * (e - 0.165) * 0.6, 0, 0));
      return ep.add(unite(a.clone().sub(ep)).multiplyScalar(portee));
    };
    const bras = fn => { const r = {}; for (const [k, s] of COTES) r[k] = { prise: fn(k, s), pole: dT(s * (o.haut ? 1 : 0.5), 0.2, -1), paume: dT(...paume(s).xyz()), doigts: 'barre' }; return r; };
    const autre = m !== 'GD' && !o.appui ? (pendante ? { prise: t.hanches[m === 'G' ? 'D' : 'G'].clone().add(V((m === 'G' ? -1 : 1) * 0.06, -0.12, 0.3)), pole: V(m === 'G' ? -1 : 1, 0.3, -0.4), paume: V(0, -1, 0), dirMain: V(0, -0.2, 1), doigts: 'detendu' } : null) : (o.appui ? p.bras[m === 'D' ? 'G' : 'D'] : null);
    const d = parLesBras(p, bras(depart), bras((k, s) => t.duThorax(fin(s))), m, autre);
    // Le buste accompagne un peu (assis à la poulie : il part penché en avant et se redresse).
    if (o.assis && !o.machine) { d.a.bassin.rot = qX(10); d.a.lombaires = 8; d.b.bassin.rot = qX(-6); }
    let tenu;
    if (o.landmine || o.tbar) {
      const pivot = V(0, 0.05, t.epaules.G.z - 1.35 + (pendante ? 0 : 0));
      const piv = V(0, 0.05, -1.3);
      fixe = fixe.concat([pret(boite(0.2, 0.08, 0.2, 0, 0.04, piv.z, C.cadre, 0.5))]);
      d.objets = (info, u, sortie) => { const pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[m], dir = unite(pr.clone().sub(piv)); sortie.push(pret(seg(piv, pr.clone().add(dir.clone().multiplyScalar(0.3)), 0.025, C.metal, 1))); const f = cyl(0.2, 0.05, 0, 0, 0, C.fonte, 0), pp = pr.clone().add(dir.clone().multiplyScalar(0.2)), q = arc(AY, dir); sortie.push({ forme: 'cylindre', s: f.s, p: [pp.x, pp.y, pp.z], q: [q.x, q.y, q.z, q.w], couleur: f.couleur, metal: 0 }); };
      tenu = [];
    } else {
      const r = { ancre: s => ancre(s), bout: o.poulie && m === 'GD' ? (o.corde ? 'corde' : 'barre') : null, lCable: o.large ? 1.0 : 0.6, deElas: s => ancre(s), pivot: s => ancre(s).add(V(0, 0.3, 0)), disques: o.pendlay ? 0.225 : 0.2 };
      tenu = o.smith ? [{ t: 'barre', l: 1.6, d: 0.18 }] : tenuDe(o, m, r);
      if (o.poulie && ancre) poserObjet(MAT.colonne(C, ancre(1)), V(), null, fixe);
      if (o.smith) fixe = fixe.concat(poseFixe(MAT.smith(C, depart('G', 1).z)));
    }
    return Object.assign(d, { fixe, vue, tenu }, rythmeDe(o));
  };

  /* Tirages verticaux à la poulie haute : la barre descend à la poitrine (ou derrière la nuque).
     Postures : assis (défaut, cuisses calées), genoux, demigenou, debout penché (elas). tendus : tirage bras tendus,
     debout. Prise : large, serre (neutre), sup, neutre. Matériel : poulie (défaut), machine, elas. Côtés : uni. */
  FAM.tirage = (c, o, C) => {
    const L = c.L, m = coteDe(o);
    if (!(o.machine || o.elas)) o.poulie = true;
    let p, fixe = [], vue = { az: 150, el: 8 };
    if (o.tendus) {
      // Debout face à la poulie haute, buste un peu penché : les bras tendus descendent jusqu'aux cuisses.
      p = debout(c, { penche: 22, dy: -0.05, dz: -0.06, lomb: 2, cou: -12, ecart: 0.13 });
      const anc = V(0, 2.05, 0.75), a = B(0, 132, -8, 12, 180), b = B(0, 14, -8, 10, 180);
      if (o.corde) { a.pron = 90; b.pron = 90; }
      fixe = poseFixe(MAT.colonne(C, anc));
      return Object.assign(parLesBras(p, a, b, m), { fixe, vue: { az: 62, el: 8 }, tenu: tenuDe(o, m, { ancre: () => anc, bout: m === 'GD' ? (o.corde ? 'corde' : 'barre') : null, lCable: 0.7, deElas: () => anc }) });
    }
    if (o.genoux) p = aGenoux(c, {}); else if (o.demigenou) p = demiGenou(c, {});
    else if (o.debout) { p = debout(c, { penche: 30, dy: -0.08, dz: -0.1, cou: -15 }); }
    else { p = assis(c, { h: 0.5, zPieds: 0.3 }); fixe = poseFixe(MAT.siege(C, 0.5)).concat([pret(cyl(0.05, 0.4, 0, 0.5 + 0.2, 0.26, C.banc, 0))]); }
    const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const e = o.large ? 0.43 : o.serre ? 0.1 : o.sup ? 0.19 : 0.3, portee = (L.bras + L.prise) * 0.97;
    const anc = V(0, t.epaules.G.y + 1.0, t.epaules.G.z + 0.14);
    const paume = s => (o.neutre || o.serre || m !== 'GD' ? V(-s, 0, 0) : o.sup ? V(0, 0, -1) : V(0, 0, 1));
    const hautP = s => { const dx = s * e - s * 0.165; return V(s * e, Math.sqrt(Math.max(0.01, portee * portee - dx * dx - 0.014)), 0.12); };
    const basP = s => (o.nuque ? V(s * 0.42, 0.03, -0.1) : V(s * Math.max(e, 0.17), -0.03, 0.17));
    const bras = f => { const r = {}; for (const [k, s] of COTES) r[k] = { prise: t.duThorax(f(s)), pole: dT(s * 1, -0.5, o.sup || o.serre ? 0.5 : -0.25), paume: dT(...paume(s).xyz()), dirMain: dT(0, 1, 0), doigts: 'barre' }; return r; };
    const d = parLesBras(p, bras(hautP), bras(basP), m);
    // Le buste part un peu en arrière en tirant.
    if (!o.nuque) { d.b.lombaires = -9; d.b.thorax = -5; }
    const r = { ancre: () => anc, bout: m === 'GD' ? 'barre' : null, lCable: o.large ? 1.15 : o.serre ? 0.3 : 0.8, deElas: () => anc, pivot: s => V(s * 0.3, anc.y, anc.z - 0.5) };
    if (o.poulie) fixe = fixe.concat([pret(seg(V(0, 0, anc.z + 0.45), V(0, anc.y + 0.1, anc.z + 0.45), 0.03, C.cadre, 0.5)), pret(seg(V(0, anc.y + 0.1, anc.z + 0.45), V(0, anc.y + 0.1, anc.z), 0.025, C.cadre, 0.5))]);
    return Object.assign(d, { fixe, vue, tenu: tenuDe(o, m, r) });
  };

  /* Tractions et suspensions à la barre fixe (ou aux anneaux) : les mains ne bougent pas, le corps monte.
     Prise : (pronation), sup, neutre ; large, serre ; nuque. Variantes : leste, elastique (assistée), machine
     (assistée, genoux sur un plateau), negative (descente lente), anneaux, scapulaire (bras tendus, seules les
     épaules travaillent), pendu (suspension tenue), autour (le menton passe d'un côté puis de l'autre). */
  FAM.traction = (c, o, C) => {
    const L = c.L, H = 2.42, ecart = o.large ? 0.46 : o.serre ? 0.14 : o.sup ? 0.22 : 0.33;
    const base = u => {
      const p = { bassin: { pos: L.racine.clone(), rot: qX(lerp(0, o.nuque ? 6 : -10, u)) }, lombaires: lerp(0, o.nuque ? 0 : -6, u), thorax: lerp(0, o.nuque ? 4 : -6, u), cou: lerp(-4, o.nuque ? -24 : 14, u), jambes: {}, bras: {} };
      let t = c.tronc(p);
      // Épaules à une longueur de bras sous la barre, puis menton au-dessus ; le corps recule : la barre passe devant.
      const dx = ecart - t.epaules.G.x, pendu = Math.sqrt(Math.max(0.01, Math.pow((L.bras + L.prise) * 0.96, 2) - dx * dx));
      const yEp = lerp(H - pendu, H - (o.nuque ? 0.1 : 0.17), u);
      p.bassin.pos.y += yEp - t.epaules.G.y; p.bassin.pos.z += lerp(0.02, o.nuque ? 0.12 : -0.1, u) - t.epaules.G.z;
      for (const [k, s] of COTES) {
        p.jambes[k] = o.machine ? J(8, 3, 0, 96, 30) : J(lerp(6, 14, u), 2, 0, o.leste ? 20 : 62, 30);
        p.bras[k] = { prise: V(s * ecart, H, 0.02), pole: V(s * 1, -0.2, o.sup || o.neutre ? 0.5 : -0.25), paume: o.neutre ? V(-s, 0, 0) : o.sup ? V(0, 0, -1) : V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'barre' };
        if (o.scapulaire) p.bras[k].hausse = lerp(22, -6, u * 8);
      }
      return p;
    };
    const amp = o.scapulaire ? 0.1 : 1;
    const d = { vue: { az: o.sup ? 150 : 205, el: 4 }, fixe: o.anneaux ? [] : poseFixe(MAT.barreFixe(C, H, Math.max(1.3, 2 * ecart + 0.4))), tenu: [] };
    if (o.pendu) { d.a = base(0); d.b = base(0.03); d.rythme = 'tenue'; }
    else if (o.autour) { d.rythme = 'continu'; d.periode = 3.4; d.pose = ph => { const w = ph * 2 * Math.PI, u = 0.55 + 0.4 * Math.sin(w - Math.PI / 2) * 0.5 + 0.2, p = base(Math.min(1, u)); p.bassin.pos.x += 0.16 * Math.cos(w); p.bassin.rot = p.bassin.rot.clone().multiply(qZ(-8 * Math.cos(w))); return p; }; }
    else { d.a = base(0); d.b = base(amp); d.cles = [[0, d.a], [0.5, base(0.5 * amp)], [1, d.b]]; }
    if (o.negative) { const A = d.a, Z = d.b; d.rythme = 'continu'; d.periode = 5; d.pose = ph => (ph < 0.12 ? mel(A, Z, lisse(ph / 0.12)) : ph < 0.2 ? Z : mel(Z, A, lisse((ph - 0.2) / 0.7))); }
    if (o.anneaux) { d.tenu = [{ t: 'sangle', de: s => V(s * ecart, H + 1.0, 0.02), m: 'G' }]; d.tenu = [{ t: 'sangle', de: V(ecart, H + 1.1, 0.02), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, H + 1.1, 0.02), m: 'D', bout: 'anneau' }]; }
    if (o.leste) d.objets = (info, u, sortie) => { const b = info.bassin; sortie.push(pret(cyl(0.16, 0.04, b.x, b.y - 0.42, b.z + 0.04, C.fonte, 0, DEBOUT_Q))); sortie.push(pret(seg(V(b.x, b.y - 0.08, b.z + 0.08), V(b.x, b.y - 0.42, b.z + 0.04), 0.006, C.cadre, 0.6))); };
    if (o.elastique) d.objets = (info, u, sortie) => { const pi = info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5); sortie.push(pret(seg(V(0, H, 0.02), pi, 0.008, C.elastique, 0))); };
    if (o.machine) d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().add(info.genoux.D).multiplyScalar(0.5); sortie.push(pret(boite(0.45, 0.06, 0.3, 0, g.y - 0.09, g.z - 0.08, C.banc, 0))); sortie.push(pret(seg(V(0, 0, g.z + 0.5), V(0, g.y - 0.1, g.z - 0.05), 0.03, C.cadre, 0.5))); };
    return d;
  };

  /* Exercices corps incliné, pieds au sol, mains sur une barre basse, des anneaux ou des sangles.
     row (traction australienne : visage vers le haut, la poitrine monte aux mains) ; curl ; triceps (visage vers le
     bas, les coudes plient, la tête descend entre les mains) ; ecarte ; facepull ; pompe. Matériel : barre (défaut
     pour row), anneaux, sangles. Prise : sup, serre. */
  FAM.suspension = (c, o, C) => {
    // Sorte par défaut, admise dans l'écriture : o.row (traction australienne).
    const L = c.L, sorte = o.curl ? 'curl' : o.triceps ? 'triceps' : o.ecarte ? 'ecarte' : o.facepull ? 'facepull' : 'row';
    const haut = sorte === 'row' || sorte === 'curl' || sorte === 'facepull';
    const barre = !(o.anneaux || o.sangles), Hb = barre ? (sorte === 'triceps' ? 0.85 : 0.95) : 2.4;
    // Deux inclinaisons du corps et deux positions de bras ; les mains restent sur leurs poignées.
    const K = { row: [barre ? 16 : 40, barre ? 34 : 60], curl: [48, 66], facepull: [52, 66], triceps: [58, 40], ecarte: [58, 38] }[sorte];
    const bras = { row: [B(6, 88, 0, 8, o.sup ? 0 : barre ? 180 : 90), B(o.large ? 70 : 20, o.large ? 70 : -22, 0, o.large ? 100 : 118, o.sup ? 0 : barre ? 180 : 90)], curl: [B(4, 84, 0, 10, 0), B(4, 96, 0, 132, 0)], facepull: [B(6, 90, -10, 8, 180), B(86, 90, 78, 104, 150)], triceps: [B(2, 118, 0, 8, 180), B(2, 126, 0, 122, 180)], ecarte: [B(6, 84, -84, 14, 0), B(98, 84, 8, 22, 0)] }[sorte];
    const faire = n => { const p = corpsDroit(c, { angle: K[n], face: haut ? 'haut' : 'bas', zPieds: haut ? 0.6 : -0.9, cou: haut ? 4 : -14 }); p.bras = pareil(bras[n]); return p; };
    const a = faire(0), b = faire(1);
    const d = { a, b, vue: { az: haut ? 118 : 70, el: 10 }, fixe: [], tenu: [] };
    // Le matériel est placé d'après les mains de la pose de départ.
    const info = c.poser(a), mid = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5);
    if (barre) { d.fixe = poseFixe(MAT.barreFixe(C, mid.y, 1.3), V(0, 0, mid.z)); d.tenu = []; }
    else { const anc = V(0, 2.5, mid.z + (haut ? 0.25 : -0.25)); const bout = o.anneaux ? 'anneau' : 'poignee'; d.tenu = [{ t: 'sangle', de: anc.clone().add(V(o.anneaux ? 0.2 : 0, 0, 0)), m: 'G', bout }, { t: 'sangle', de: anc.clone().add(V(o.anneaux ? -0.2 : 0, 0, 0)), m: 'D', bout }]; }
    // Les mains fixes : on recale le bassin de la pose d'arrivée pour que les mains restent où elles étaient.
    const info2 = c.poser(b), mid2 = info2.prises.G.clone().add(info2.prises.D).multiplyScalar(0.5);
    if (barre) { /* la barre impose la place des mains : on déplace le corps */ b.bassin.pos.add(mid.clone().sub(mid2).setX(0)); for (const k of ['G', 'D']) b.jambes[k].cheville.add(mid.clone().sub(mid2).setX(0).setY(0)); b.bassin.pos.y -= 0; }
    return d;
  };

  /* Comment la charge est portée (squats, fentes, mollets, good morning) : place les bras de la pose p et renvoie le
     matériel { tenu, objets }. Options : barre (sur les trapèzes ; basse ; avant ; zercher ; tete : bras tendus
     au-dessus de la tête), smith, sac, gobelet (haltère ou kettlebell contre la poitrine), hal (un haltère dans
     chaque main, bras le long du corps), kb, landmine, elas, hanches (mains sur les hanches), sinon bras devant. */
  function porter(c, p, o, C, u) {
    const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax), r = { tenu: [], objets: null };
    const barreSur = (centre, ecart, pole, paume, dirMain) => { const axe = dT(1, 0, 0); for (const [k, s] of COTES) p.bras[k] = { prise: centre.clone().add(axe.clone().multiplyScalar(s * ecart)), pole: dT(...pole(s)), paume: dT(...paume), dirMain: dirMain ? dT(...dirMain) : undefined, doigts: 'barre' }; r.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.225 }]; };
    if (o.barre || o.smith || o.sac) {
      if (o.avant) barreSur(t.duThorax(V(0, -0.015, 0.118)), 0.235, s => [s * 0.35, -0.25, 1], [0, 0.75, -0.66]);
      else if (o.zercher) {
        // La barre dans le pli des coudes, mains remontées vers la poitrine.
        p.bras = pareil(B(12, 34, -14, 122, 60));
        r.objets = (info, uu, sortie) => { const m = info.coudes.G.clone().add(info.coudes.D).multiplyScalar(0.5).add(V(0, 0.035, 0.03).applyQuaternion(info.qThorax)); poserObjet(MAT.barre(C, 1.6, 0.225), m, qTenu(info.coudes.G.clone().sub(info.coudes.D), AY), sortie); };
      } else if (o.tete) { p.bras = pareil(B(62, 170, 0, 4, 180)); r.tenu = [{ t: 'barre', l: 1.6, d: 0.2 }]; }
      else if (o.hack) { p.bras = pareil(B(0, -14, 0, 6, 0)); r.tenu = [{ t: 'barre', l: 1.6, d: 0.225 }]; }     // barre tenue derrière les jambes
      else barreSur(t.cou.clone().add(dT(0, o.basse ? -0.075 : -0.035, o.basse ? -0.12 : -0.105)), 0.37, s => [s * 0.25, -1, -0.55], [0, 0.35, 1]);
      if (o.sac) r.tenu = [];
    } else if (o.gobelet || (o.kb && !o.kb2)) {
      for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.06, -0.16, 0.2)), pole: dT(s * 0.5, -1, 0.1), paume: dT(-s, 0.1, 0), dirMain: dT(0, 0.9, 0.3), doigts: 'barre' };
      r.objets = (info, uu, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), haut = AY.clone().applyQuaternion(info.qThorax); if (o.kb) poserObjet(MAT.kettlebell(C), m.clone().add(haut.clone().multiplyScalar(0.02)), qTenu(AX.clone().applyQuaternion(info.qThorax), haut), sortie); else poserObjet(MAT.haltere(C, 1.25), m.clone().add(haut.clone().multiplyScalar(-0.08)), qTenu(haut, AZ), sortie); };
    } else if (o.hal || o.kb2) { p.bras = pareil(B(90, 4, 0, 6, 90)); r.tenu = [{ t: o.kb2 ? 'kb' : 'haltere', m: 'GD' }]; }
    else if (o.landmine) {
      for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.05, -0.12, 0.2)), pole: dT(s * 0.6, -1, 0.1), paume: dT(-s, 0, 0), dirMain: dT(0, 0.6, 0.8), doigts: 'barre' };
      const piv = V(0, 0.05, 1.5);
      r.objets = (info, uu, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), dir = unite(m.clone().sub(piv)); sortie.push(pret(seg(piv, m.clone().add(dir.clone().multiplyScalar(0.1)), 0.025, C.metal, 1))); const pp = m.clone().sub(dir.clone().multiplyScalar(0.22)), q = arc(AY, dir); sortie.push({ forme: 'cylindre', s: [0.18, 0.045, 0.18], p: [pp.x, pp.y, pp.z], q: [q.x, q.y, q.z, q.w], couleur: C.fonte, metal: 0 }); };
    } else if (o.elas) { p.bras = pareil(B(30, 28, 60, 140, 90)); r.tenu = [{ t: 'elastique', de: 'pieds', m: 'G', bout: 'rien' }, { t: 'elastique', de: 'pieds', m: 'D', bout: 'rien' }]; }
    else if (o.hanches) p.bras = mains(c, t, 'hanches');
    else if (o.nuque) p.bras = mains(c, t, 'nuque');
    else p.bras = pareil(B(6, lerp(30, 86, u == null ? 1 : u), 0, 8, 180, { doigts: 'detendu' }));          // bras qui montent devant pour l'équilibre
    return r;
  }

  /* Squats : les pieds restent au sol, le bassin descend.
     Charge : voir porter. Pieds : (largeur d'épaules), sumo, serre. Amplitude : demi, boite (jusqu'à un banc),
     partiel. Variantes : saut ; pistolet (une jambe ; assiste ; boite) ; sissy ; cosaque ; cycliste (talons
     surélevés) ; thruster (squat puis développé) ; mur (chaise contre le mur, tenue ; ballon) ; hack (machine
     inclinée ; avec barre : la barre derrière les jambes) ; ceinture (charge accrochée à la taille). */
  FAM.squat = (c, o, C) => {
    const L = c.L, sumo = !!o.sumo;
    const ecart = sumo ? 0.34 : o.serre ? 0.09 : 0.17, ouv = sumo ? 40 : 20;
    const prof = o.demi ? 0.52 : o.partiel ? 0.7 : o.boite ? 0.8 : 1;
    const droit = o.avant || o.gobelet || o.kb || o.tete || o.zercher || o.landmine || o.smith || sumo || o.cycliste;   // buste plus droit
    let fixe = [], vue = { az: 38, el: 8 }, objetsPlus = null;
    if (o.mur) {
      // Chaise contre le mur : dos au mur, cuisses à l'horizontale ; tenue.
      const p = debout(c, { dy: -0.4, dz: -0.42, penche: 0, ecart: 0.13, ouv: 6 }); p.bras = pareil(B(0, 20, 0, 10, 180, { doigts: 'detendu' }));
      const zMur = p.bassin.pos.z - L.dos - 0.02;
      fixe = poseFixe(MAT.mur(C, zMur)); if (o.ballon) fixe.push(pret(sphere(0.2, 0, p.bassin.pos.y + 0.25, zMur + 0.2, C.ballon, 0)));
      if (o.ballon) { const hautP = debout(c, { dy: -0.05, dz: -0.42, penche: 0, ecart: 0.13, ouv: 6 }); hautP.bras = cloner(p.bras); return { a: hautP, b: p, fixe, vue: { az: 70, el: 8 } }; }
      const q = cloner(p); q.thorax = 1.5;
      return { a: p, b: q, rythme: 'tenue', fixe, vue: { az: 70, el: 8 } };
    }
    if (o.hack && !o.barre) {
      // Machine inclinée : le dos glisse le long d'un dossier à 60°, les pieds sur un plateau.
      const r = V(0, Math.sin(rad(58)), -Math.cos(rad(58))), base = V(0, 0.92, -0.2);
      const cle = u => { const p = { bassin: { pos: base.clone().add(r.clone().multiplyScalar(-0.3 * u)), rot: qX(-28) }, lombaires: 0, thorax: 0, cou: 6, bras: {}, jambes: {} }; for (const [k, s] of COTES) { p.jambes[k] = { cheville: V(s * 0.16, 0.3, 0.42), pole: V(s * 0.2, 0.4, 1), pied: V(s * 0.15, 0.55, 0.83), hautPied: V(0, 0.83, -0.55) }; p.bras[k] = B(30, 40, 0, 100, 90); } return p; };
      fixe = [pret(boite(0.5, 0.05, 0.5, 0, 0.25, 0.55, C.cadre, 0.5, qX(-32))), pret(seg(V(0, 0.15, 0.25), V(0, 1.75, -0.75), 0.035, C.cadre, 0.5))];
      const d = { pose: cle, fixe, vue: { az: 62, el: 10 }, tenu: [] };
      d.objets = (info, u, sortie) => { const b = info.bassin, q = qX(-28), dos = V(0, 0.32, -0.15).applyQuaternion(q).add(b); sortie.push({ forme: 'boite', s: [0.4, 0.75, 0.06], p: [dos.x, dos.y, dos.z], q: [q.x, q.y, q.z, q.w], couleur: C.banc, metal: 0 }); };
      return d;
    }
    const cle = u => {
      const k = u * prof;
      let p;
      if (o.sissy) {
        // Squat sissy : les genoux partent en avant, le corps bascule en arrière d'un bloc, talons levés.
        p = debout(c, { dy: -0.34 * k, dz: -0.02 * k, penche: -30 * k, ecart: 0.1, ouv: 6, pointe: 48 * k, cou: 10 * k });
        for (const [kk, s] of COTES) p.jambes[kk].pole = V(0, 0, 1);
      } else if (o.cosaque) {
        // Squat cosaque : pieds très écartés, le poids passe sur une jambe pliée, l'autre reste tendue.
        p = debout(c, { dx: 0.3 * k, dy: -0.42 * k, dz: -0.12 * k, penche: 26 * k, ecart: 0.42, ouv: 30, cou: -14 * k });
        p.jambes.D.pied = V(-0.2, 0.7 * k, 0.7).normalize(); p.jambes.D.hautPied = V(0, 0.7, -0.7 * k).normalize();
      } else {
        p = debout(c, { dy: -0.4 * k, dz: (droit ? -0.14 : -0.2) * k, penche: 2 + (droit ? 16 : 28) * k, ecart, ouv, lomb: 4 * k, thor: 6 * k, cou: -(droit ? 12 : 22) * k, y0: o.cycliste ? 0 : 0 });
        if (o.cycliste) for (const [kk, s] of COTES) p.jambes[kk] = pied(c, s, { ecart: 0.1, ouv: 8, pointe: 14 });
      }
      return p;
    };
    const d = { vue, tenu: [], fixe };
    if (o.pistolet) {
      // Sur une jambe : l'autre reste tendue devant.
      d.pose = u => { const p = debout(c, { dx: 0.06, dy: -0.5 * u * (o.boite ? 0.72 : 1), dz: -0.22 * u, penche: 2 + 34 * u, ecart: 0.07, ouv: 6, lomb: 8 * u, cou: -20 * u }); p.jambes.D = J(lerp(8, 84, Math.sqrt(u)) + (2 + 34 * u), 4, 0, 6, 10); const m = porter(c, p, o, C, u); if (o.assiste) { p.bras.G = { prise: V(0.25, 1.05, 0.38), pole: V(1, -0.5, 0), paume: V(-1, 0, 0), doigts: 'barre' }; } d.tenu = m.tenu; d.objets = m.objets; return p; };
      if (o.assiste) fixe.push(pret(seg(V(0.25, 0, 0.4), V(0.25, 1.6, 0.4), 0.02, C.cadre, 0.5)));
      if (o.boite) fixe.push(...poseFixe(MAT.step(C, 0.45, 0.42, 0.4, 0, -0.42)));
      d.pose(0); return d;
    }
    const m0 = porter(c, cle(0), o, C, 0); d.tenu = m0.tenu; d.objets = m0.objets;
    d.pose = u => { const p = cle(u); porter(c, p, o, C, u); return p; };
    if (o.boite || o.banc) fixe.push(...poseFixe(MAT.step(C, 0.5, 0.44, 0.4, 0, -0.5)));
    if (o.cycliste) fixe.push(pret(boite(0.4, 0.035, 0.12, 0, 0.018, -0.03, C.fonte, 0, qX(0))));
    if (o.smith) { const info = c.poser(d.pose(0)); fixe.push(...poseFixe(MAT.smith(C, (info.prises.G.z + info.prises.D.z) / 2))); }
    if (o.ceinture) d.objets = (info, u, sortie) => { const b = info.bassin; sortie.push(pret(seg(V(0, b.y - 0.1, b.z + 0.02), V(0, Math.max(0.12, b.y - 0.55), 0.02), 0.008, C.cadre, 0.6))); sortie.push(pret(cyl(0.2, 0.05, 0, Math.max(0.1, b.y - 0.58), 0.02, C.fonte, 0, DEBOUT_Q))); };
    if (o.saut) {
      // Squat sauté : flexion, détente, envol, réception.
      d.rythme = 'continu'; d.periode = 1.7;
      d.pose = ph => { const u = ph < 0.4 ? lisse(ph / 0.4) * 0.75 : ph < 0.52 ? 0.75 * (1 - lisse((ph - 0.4) / 0.12)) : ph > 0.86 ? 0.3 * Math.sin((ph - 0.86) / 0.14 * Math.PI) : 0; const p = cle(u); const vol = ph > 0.5 && ph < 0.86 ? Math.sin((ph - 0.5) / 0.36 * Math.PI) : 0; p.bassin.pos.y += 0.24 * vol; for (const [kk, s] of COTES) p.jambes[kk] = pied(c, s, { ecart, ouv, pointe: 50 * vol, y0: 0.24 * vol - 0.02 * vol }); porter(c, p, o, C, u * (1 - vol)); if (!(o.barre || o.hal || o.gobelet || o.kb)) p.bras = pareil(B(4, 30 + 130 * vol - 40 * u, 0, 12, 90, { doigts: 'detendu' })); return p; };
    }
    if (o.thruster) {
      // Squat barre devant, puis la barre est poussée au-dessus de la tête en se relevant.
      d.rythme = 'continu'; d.periode = 3.2;
      const bas = cle(1), hautP = cle(0); o.avant = true; porter(c, bas, o, C, 1); porter(c, hautP, o, C, 0);
      const dessus = cloner(hautP); const t = c.tronc(dessus); for (const [kk, s] of COTES) dessus.bras[kk] = { prise: t.duThorax(V(s * 0.3, L.bras + L.prise - 0.03, 0.02)), pole: V(s * 0.7, -1, 0.5).applyQuaternion(t.qThorax), paume: V(0, 0, 1).applyQuaternion(t.qThorax), dirMain: V(0, 1, 0).applyQuaternion(t.qThorax), doigts: 'barre' };
      for (const q of [bas, hautP]) for (const [kk, s] of COTES) { q.bras[kk].paume = V(0, 0.3, 1).applyQuaternion(c.tronc(q).qThorax); }
      d.tenu = [{ t: o.hal ? 'haltere' : 'barre', m: 'GD', l: 1.6, d: 0.2 }];
      d.pose = ph => (ph < 0.3 ? mel(hautP, bas, lisse(ph / 0.3)) : ph < 0.5 ? mel(bas, hautP, lisse((ph - 0.3) / 0.2)) : ph < 0.68 ? mel(hautP, dessus, lisse((ph - 0.5) / 0.18)) : ph < 0.8 ? dessus : mel(dessus, hautP, lisse((ph - 0.8) / 0.2)));
    }
    return d;
  };

  /* Fentes, fentes bulgares, montées sur banc.
     Sortes : statique (défaut : pieds décalés, on descend sur place), avant, arriere, marchee (sur place, en
     alternant), laterale, bulgare (pied arrière sur un banc), step (montée sur un banc), pliometrique (sautée).
     Options : piedAvantHaut (pied avant surélevé), deficit (fente arrière depuis une marche), alt. Charge : porter. */
  FAM.fente = (c, o, C) => {
    const L = c.L, z0 = L.racine.z + L.hanche.z;
    const fixe = [], d = { vue: { az: 62, el: 8 }, tenu: [], fixe };
    const droit = !(o.barre || o.smith);
    if (o.step) {
      // Montée sur banc : un pied sur le banc, le corps se hisse ; l'autre pied vient se poser à côté.
      const h = o.poliquin ? 0.2 : 0.4;
      fixe.push(...poseFixe(MAT.step(C, 0.6, h, 0.42, 0, 0.36)));
      d.pose = u => { const p = debout(c, { dy: h * u - 0.02 * (1 - u), dz: 0.1 + 0.26 * u, penche: 18 * (1 - u) + 2, cou: -10 * (1 - u) }); p.bassin.pos.z = z0 + 0.1 + 0.25 * u; p.jambes.G = pied(c, 1, { z: z0 + 0.34, y0: h, ouv: 6 }); const lv = Math.sin(Math.PI * u); p.jambes.D = pied(c, -1, { z: z0 - 0.12 + 0.44 * u, y0: h * lisse(u) + 0.06 * lv, ouv: 6, pointe: 25 * (1 - u) }); const m = porter(c, p, o, C, 0); d.tenu = m.tenu; d.objets = m.objets; return p; };
      d.pose(0); if (o.poulie) { d.tenu = [{ t: 'cable', de: V(0, 0.2, 1.4), m: 'G', bout: 'poignee' }]; fixe.push(...poseFixe(MAT.colonne(C, V(0, 0.2, 1.4)))); }
      return d;
    }
    if (o.laterale) {
      // Fente latérale : un grand pas de côté, le bassin descend sur la jambe pliée, l'autre reste tendue.
      d.vue = { az: 20, el: 8 };
      const cote = (u, s) => { const p = debout(c, { dx: s * 0.34 * u, dy: -0.34 * u, dz: -0.16 * u, penche: 2 + 30 * u, cou: -16 * u, ecart: 0.1, ouv: 8 }); const kT = s > 0 ? 'G' : 'D', lv = Math.sin(Math.PI * u) * 0.05; p.jambes[kT] = pied(c, s, { x: s * (0.1 + 0.5 * u), ouv: 14, y0: lv * (u < 0.8 ? 1 : 0) }); porter(c, p, Object.assign({}, o, droit && !(o.hal || o.kb || o.gobelet) ? { } : {}), C, u); return p; };
      d.pose = (uG, uD) => (uD > 0 ? cote(uD, -1) : cote(uG || 0, 1));
      d.rythme = 'alt'; const m = porter(c, cote(0, 1), o, C, 0); d.tenu = m.tenu; d.objets = m.objets;
      if (o.pliometrique) { d.rythme = 'continu'; d.periode = 1.3; d.pose = ph => { const s = ph < 0.5 ? 1 : -1, q = (ph % 0.5) / 0.5, p = cote(Math.sin(Math.PI * q), s); p.bassin.pos.y += 0.05 * Math.sin(Math.PI * q) * 0; return p; }; }
      return d;
    }
    // Fentes dans l'axe : pied avant et pied arrière ; le genou arrière descend vers le sol.
    const bulg = !!o.bulgare, hAr = bulg ? 0.44 : 0, hAv = o.piedAvantHaut ? 0.12 : 0, hSol = o.deficit ? 0.15 : 0;
    const zAv = bulg ? 0.3 : 0.34, zAr = bulg ? -0.62 : -0.42;
    if (bulg) fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, zAr - 0.25), qY(90)));
    if (o.piedAvantHaut) fixe.push(pret(boite(0.4, hAv, 0.34, 0.1, hAv / 2, z0 + zAv + 0.05, C.fonte, 0)));
    if (o.deficit) fixe.push(pret(boite(0.5, hSol, 0.4, 0, hSol / 2, z0 + 0.04, C.banc, 0)));
    // k : avancée dans la descente ; pas : part du déplacement du pied mobile déjà faite (fentes avant et arrière).
    const cle = (k, pas, sAv) => {
      const kAv = sAv > 0 ? 'G' : 'D', kAr = sAv > 0 ? 'D' : 'G';
      const avance = o.avant ? 0.34 * pas : o.arriere ? -0.02 * pas : 0;
      const p = debout(c, { dy: (o.deficit ? hSol : 0) - (bulg ? 0.34 : 0.36) * k, dz: (o.avant || o.arriere ? avance - (o.arriere ? 0.14 * pas : 0) : -0.04) , penche: 4 + (droit ? 8 : 14) * k, cou: -6 * k, ecart: 0.09, ouv: 4, y0: o.deficit ? hSol : 0 });
      const lv = Math.sin(Math.PI * pas) * 0.07;
      if (o.avant) { p.jambes[kAv] = pied(c, sAv, { ecart: 0.09, ouv: 4, z: z0 + 0.68 * pas, y0: hAv * pas + (pas < 1 ? lv : 0) }); p.jambes[kAr] = pied(c, -sAv, { ecart: 0.09, ouv: 4, z: z0, pointe: 55 * k }); }
      else if (o.arriere) { p.jambes[kAv] = pied(c, sAv, { ecart: 0.09, ouv: 4, z: z0, y0: o.deficit ? hSol : 0 }); p.jambes[kAr] = pied(c, -sAv, { ecart: 0.09, ouv: 4, z: z0 - 0.7 * pas, y0: (o.deficit ? hSol * (1 - pas) : 0) + (pas < 1 ? lv : 0), pointe: 55 * Math.max(k, pas * 0.6) }); }
      else { p.jambes[kAv] = pied(c, sAv, { ecart: 0.09, ouv: 4, z: z0 + zAv, y0: hAv }); p.jambes[kAr] = pied(c, -sAv, { ecart: 0.09, ouv: 4, z: z0 + zAr, y0: hAr, pointe: bulg ? 74 : 30 + 28 * k }); }
      return p;
    };
    const mouvant = o.avant || o.arriere || o.marchee;
    if (o.marchee) o.avant = true;
    const une = (u, s) => { const pas = mouvant ? lisse(Math.min(1, u / 0.45)) : 1, k = mouvant ? lisse(Math.max(0, (u - 0.3) / 0.7)) : u; const p = cle(k, pas, s); porter(c, p, o, C, 0); return p; };
    const m0 = porter(c, cle(0, mouvant ? 0 : 1, 1), o, C, 0); d.tenu = m0.tenu; d.objets = m0.objets;
    if (o.alt || o.marchee) { d.rythme = 'alt'; d.pose = (uG, uD) => (uD > 0 ? une(uD, -1) : une(uG || 0, 1)); }
    else d.pose = u => une(u, 1);
    if (o.smith) { const info = c.poser(d.pose(0)); fixe.push(...poseFixe(MAT.smith(C, (info.prises.G.z + info.prises.D.z) / 2))); }
    if (o.pliometrique) {
      // Fente sautée : on descend, on bondit, on retombe (sur la même jambe pour la fente bulgare).
      d.rythme = 'continu'; d.periode = 1.5;
      d.pose = ph => { const u = ph < 0.45 ? lisse(ph / 0.45) : ph < 0.6 ? 1 - lisse((ph - 0.45) / 0.15) : 0, vol = ph > 0.58 && ph < 0.9 ? Math.sin((ph - 0.58) / 0.32 * Math.PI) : 0; const p = cle(u, 1, 1); p.bassin.pos.y += 0.16 * vol; p.jambes.G = pied(c, 1, { ecart: 0.09, ouv: 4, z: z0 + zAv, y0: 0.16 * vol, pointe: 40 * vol }); porter(c, p, o, C, 0); return p; };
    }
    return d;
  };

  /* Soulevés de terre et autres charnières de hanche : le buste bascule autour des hanches, dos droit.
     (défaut) soulevé de terre barre depuis le sol ; sumo ; roumain (la barre descend à mi-tibia, genoux à peine
     pliés) ; tendues (jambes tendues) ; deficit ; blocs (barre surélevée) ; trapbar ; hal ; kb (un kettlebell tenu
     à deux mains) ; unejambe ; bstance ; goodmorning (barre sur le dos ; assis) ; poulie (tirage entre les jambes) ;
     charniere (au poids du corps) ; jefferson (dos qui s'enroule) ; swing (balancement du kettlebell ; uni) ;
     extension (banc à lombaires ; machine) ; smith ; ceinture. */
  FAM.souleve = (c, o, C) => {
    const L = c.L, rayon = 0.0135, z0 = L.racine.z + L.hanche.z;
    const fixe = [], d = { vue: { az: 128, el: 10 }, tenu: [], fixe };
    if (o.extension) {
      // Banc à lombaires : hanches calées, jambes tenues ; le buste descend puis remonte à l'alignement.
      const ang = o.machine ? 0 : 42;
      const cle = u => { const p = { bassin: { pos: V(0, 0.9, 0), rot: qX(ang + 10) }, lombaires: lerp(34, -4, u), thorax: lerp(14, -2, u), cou: lerp(8, -10, u), bras: {}, jambes: pareil(J(lerp(52, 8, u) * 0 + 10 + (ang ? 0 : 0), 4, 0, 4, 25)) }; p.bassin.rot = qX(lerp(ang + 62, ang + 6, u)); p.jambes = pareil(J(lerp(62, 6, u), 4, 0, 4, 25)); const t = c.tronc(p); p.bras = o.hal ? { G: { prise: t.duThorax(V(0.05, -0.12, 0.2)), pole: V(0.6, -1, 0).applyQuaternion(t.qThorax), paume: V(-1, 0, 0).applyQuaternion(t.qThorax), doigts: 'barre' }, D: { prise: t.duThorax(V(-0.05, -0.12, 0.2)), pole: V(-0.6, -1, 0).applyQuaternion(t.qThorax), paume: V(1, 0, 0).applyQuaternion(t.qThorax), doigts: 'barre' } } : mains(c, t, 'poitrine'); return p; };
      if (o.machine) {
        // À la machine, assis : le buste part penché en avant et pousse le coussin vers l'arrière.
        const base = assis(c, { h: 0.5, zPieds: 0.34 });
        d.pose = u => { const p = cloner(base); p.bassin.rot = qX(lerp(34, -18, u)); p.lombaires = lerp(10, -4, u); const t = c.tronc(p); p.bras = mains(c, t, 'poitrine'); return p; };
        fixe.push(...poseFixe(MAT.siege(C, 0.5)));
        d.objets = (info, u, sortie) => { const e = info.epaules.G.clone().add(info.epaules.D).multiplyScalar(0.5), q = info.qThorax, pp = e.clone().add(V(0, -0.08, -0.17).applyQuaternion(q)); sortie.push({ forme: 'cylindre', s: [0.06, 0.4, 0.06], p: [pp.x, pp.y, pp.z], q: [COUCHE.x, COUCHE.y, COUCHE.z, COUCHE.w], couleur: C.banc, metal: 0 }); };
        d.vue = { az: 70, el: 10 }; return d;
      }
      // Les pieds sont tenus au sol derrière, les cuisses appuyées sur le coussin incliné.
      const piedsF = { G: pied(c, 1, { x: 0.12, z: -0.62, ouv: 0, pointe: 0 }), D: pied(c, -1, { x: -0.12, z: -0.62, ouv: 0, pointe: 0 }) };
      d.pose = u => { const p = cle(u); p.bassin.pos = V(0, 0.93, 0); p.jambes = cloner(piedsF); for (const k of ['G', 'D']) p.jambes[k].pole = V(0, 0.2, 1); return p; };
      fixe.push(pret(boite(0.4, 0.07, 0.36, 0, 0.78, 0.16, C.banc, 0, qX(-42))), pret(seg(V(0, 0, -0.1), V(0, 0.72, 0.16), 0.03, C.cadre, 0.5)), pret(cyl(0.045, 0.4, 0, 0.2, -0.72, C.banc, 0)), pret(seg(V(0, 0, -0.1), V(0, 0.2, -0.72), 0.03, C.cadre, 0.5)), pret(boite(0.5, 0.03, 1.0, 0, 0.015, -0.3, C.cadre, 0.5)));
      if (o.hal) d.tenu = [{ t: 'disque', m: 'GD', r: 0.13, axe: AZ }];
      d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.swing) {
      // Balancement du kettlebell : il passe entre les jambes puis monte devant, bras tendus, par un coup de hanches.
      const m = coteDe(o);
      const cle = u => { const k = 1 - u, p = debout(c, { dy: -0.1 * k, dz: -0.3 * k, penche: 4 + 58 * k, lomb: 2 * k, cou: -30 * k, ecart: 0.2, ouv: 16 }); const br = B(0, lerp(-8 - 58, 88, u) + (4 + 58 * k) * 0, -10, 6, 180); p.bras = pareil(B(m === 'GD' ? -4 : 0, lerp(-70 + 62, 90, u), m === 'GD' ? -16 : 0, 6, 180)); if (m !== 'GD') p.bras.D = B(70, 30, 0, 20, 90, { doigts: 'detendu' }); return p; };
      d.pose = cle; d.tenu = [{ t: 'kb', m: 'G', sens: 'bas' }];
      d.objets = null; d.rythme = 'rep'; d.periode = 2.2;
      // La boule prolonge les bras (elle ne pend pas à la verticale pendant le balancement).
      d.tenu = []; d.objets = (info, u, sortie) => { const pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises.G, dir = info.dirMains.G; poserObjet(MAT.kettlebell(C), pr, qTenu(AX, dir.clone().multiplyScalar(-1)), sortie); };
      return d;
    }
    if (o.goodmorning) {
      if (o.assis) { const base = assis(c, { h: 0.45, ecart: 0.26, ouv: 20, zPieds: 0.36 }); fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, 0.28))); d.pose = u => { const p = cloner(base); p.bassin.rot = qX(lerp(2, 62, u)); p.lombaires = 3 * u; p.cou = -30 * u; porter(c, p, { barre: true }, C); return p; }; }
      else d.pose = u => { const p = debout(c, { dy: -0.03 * u, dz: -0.2 * u, penche: 2 + 68 * u, lomb: 3 * u, thor: 3 * u, cou: -36 * u, ecart: 0.14, ouv: 10 }); porter(c, p, o.smith ? { smith: true } : { barre: true }, C); return p; };
      d.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.2 }];
      if (o.smith) { const info = c.poser(d.pose(0)); fixe.push(...poseFixe(MAT.smith(C, info.prises.G.z))); }
      return d;
    }
    if (o.jefferson) {
      // Curl Jefferson : debout sur un support, le dos s'enroule vertèbre par vertèbre, la charge descend sous les pieds.
      fixe.push(...poseFixe(MAT.step(C, 0.5, 0.3, 0.4, 0, 0.03)));
      d.pose = u => { const p = debout(c, { dy: 0.3 - 0.02 * u, dz: -0.12 * u, penche: 2 + 50 * u, lomb: 46 * u, thor: 30 * u, cou: 30 * u, ecart: 0.1, ouv: 6, y0: 0.3 }); p.bras = pareil(B(0, 4 + 96 * u * 0 + (2 + 50 * u) * 0, -20, 4, 180)); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.epaules[k].clone().add(V(-s * 0.06, -(L.bras + L.prise) * 0.985, 0.03)), pole: V(s * 0.3, 0, -1), paume: V(0, 0, -1), dirMain: V(0, -1, 0), doigts: 'barre' }; return p; };
      d.tenu = o.barre ? [{ t: 'barre', l: 1.2, d: 0.1 }] : [{ t: 'haltere', m: 'GD' }]; d.periode = 4; return d;
    }
    // Les soulevés proprement dits. Profil : jusqu'où le buste bascule et les genoux plient en bas.
    const sumo = !!o.sumo, roumain = o.roumain || o.tendues || o.poulie || o.charniere || o.unejambe || o.bstance || o.ceinture;
    const penB = o.tendues ? 78 : roumain ? 66 : sumo ? 44 : o.trapbar ? 48 : 58;
    const recul = o.tendues ? -0.2 : roumain ? -0.26 : sumo ? -0.18 : -0.3;
    const ecart = sumo ? 0.36 : 0.14, ouv = sumo ? 38 : 12, xMain = sumo ? 0.2 : o.trapbar ? 0.32 : 0.27;
    const yBas = o.deficit ? 0.225 - 0 : o.blocs ? 0.5 : roumain ? (o.tendues ? 0.3 : 0.42) : 0.225;
    const y0 = o.deficit ? 0.1 : 0;
    if (o.deficit) fixe.push(pret(boite(0.7, y0, 0.45, 0, y0 / 2, z0 + 0.04, C.banc, 0)));
    if (o.blocs) for (const s of [1, -1]) fixe.push(pret(boite(0.3, 0.5 - 0.225, 0.4, s * 0.6, (0.5 - 0.225) / 2, 0.2, C.banc, 0)));
    const libres = o.hal || o.kb || o.trapbar || o.charniere || o.poulie || o.ceinture;
    const corps = k => {
      // Du bas vers le haut : les jambes poussent d'abord (buste encore penché), puis le buste se redresse.
      const penche = lisse(Math.min(1, k / (roumain ? 1 : 0.5)));
      const p = debout(c, { dy: y0, dz: lerp(-0.01, recul, penche), penche: lerp(2, penB, penche) + (roumain ? 0 : 5 * Math.max(0, (k - 0.5) / 0.5)), lomb: lerp(0, 4, penche), thor: lerp(0, 5, penche), cou: lerp(0, -penB * 0.52, penche), ecart, ouv, y0 });
      if (o.unejambe) {
        // Sur une jambe : l'autre part en arrière, dans le prolongement du buste.
        p.jambes.D = J(-8 * penche, 2, 0, 8 * penche + 84 * Math.sin(Math.PI * penche) * (penche < 0.5 ? 1 : 2 * (1 - penche)), 30 * Math.max(0, penche - 0.4) / 0.6);
        p.bassin.pos.x += 0.06 * penche;
      } else if (o.bstance) p.jambes.D = pied(c, -1, { ecart: 0.14, z: z0 - 0.26, pointe: 45, ouv: 6 });
      return p;
    };
    const portee = (L.bras + L.avantBras) * 0.985;
    const epaules = (p, zBarre) => { const e = c.tronc(p).epaules.G, dz = zBarre + L.creux - e.z, dx = xMain - e.x; return { y: e.y, chute: Math.sqrt(Math.max(1e-4, portee * portee - dz * dz - dx * dx)) }; };
    if (libres) {
      // Haltères, kettlebell, barre hexagonale, câble : les bras pendent, tendus, sous les épaules.
      const cle = k => { const p = corps(k), t = c.tronc(p); const profondeur = lisse(Math.min(1, k)); for (const [kk, s] of COTES) { const cible = o.kb ? V(s * 0.06, 0, 0.08) : o.trapbar ? V(s * 0.32, 0, z0 + 0.02 - t.epaules[kk].z) : o.poulie ? V(s * 0.05, 0, o.roumain ? 0.16 : -0.1) : V(s * (xMain - 0.165) + 0, 0, 0.1 + 0.08 * profondeur); const large = o.trapbar ? Math.sqrt(Math.max(0.01, Math.pow((L.bras + L.prise) * 0.985, 2) - Math.pow(0.32 - t.epaules.G.x, 2))) : (L.bras + L.prise) * 0.985; const pr = V(o.kb || o.poulie || o.trapbar ? cible.x : t.epaules[kk].x + cible.x, t.epaules[kk].y - large, t.epaules[kk].z + cible.z); if (o.kb) pr.y = Math.max(pr.y, 0.2); p.bras[kk] = o.charniere ? mains(c, t, 'hanches')[kk] : { prise: pr, pole: V(s * 0.3, 0, -1), paume: o.trapbar || o.poulie ? V(-s, 0, 0) : V(0, 0, -1), dirMain: V(0, -1, 0), doigts: 'barre' }; } return p; };
      d.pose = u => cle(o.depuisHaut || roumain ? u : 1 - u);
      if (!roumain && !o.depuisHaut) d.pose = u => cle(1 - u);
      d.pose = roumain ? (u => cle(u)) : (u => cle(1 - u));
      if (o.hal) d.tenu = [{ t: 'haltere', m: 'GD' }];
      else if (o.kb) { d.tenu = []; d.objets = (info, u, sortie) => poserObjet(MAT.kettlebell(C), info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), qTenu(AX, AY), sortie); }
      else if (o.trapbar) { d.tenu = []; d.objets = barreHexagonale(C); }
      else if (o.poulie) { const anc = V(0, 0.15, o.roumain ? 1.15 : -1.1);   // tirage entre les jambes : poulie derrière ; soulevé roumain : poulie devant
        d.tenu = [{ t: 'cable', de: anc, bout: 'corde' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
      else if (o.ceinture) d.objets = (info, u, sortie) => { const b = info.bassin; sortie.push(pret(seg(V(0, b.y - 0.1, b.z + 0.05), V(0, 0.15, 0.05), 0.008, C.cadre, 0.6))); };
      return d;
    }
    // À la barre : elle longe les jambes, juste devant les cuisses, les genoux puis les tibias.
    const debout0 = debout(c, { dz: -0.01, penche: 2, ecart, ouv, dy: y0, y0 });
    const zHaut = c.devantJambes(debout0, 0.6 + y0, 1.0 + y0) + rayon + 0.004;
    const hautE = epaules(debout0, zHaut);
    const cle = k => {
      const p = corps(k), yBarre = lerp(hautE.y - hautE.chute - L.main, yBas + y0 * 0, k);
      let zBarre = zHaut;
      for (let passe = 0; passe < 3; passe++) { const e = epaules(p, zBarre); p.bassin.pos.y += yBarre + L.main + e.chute - e.y; zBarre = Math.max(0.1, c.devantJambes(p, yBarre - 0.03, yBarre + 0.03) + rayon + 0.004); }
      const barreP = V(0, yBarre, zBarre);
      for (const [kk, s] of COTES) p.bras[kk] = { prise: barreP.clone().setX(s * xMain), pole: V(s * 0.3, 0, -1), paume: V(0, 0, -1), dirMain: V(0, -1, 0), doigts: 'barre' };
      return p;
    };
    // Soulevé classique : départ barre au sol, on monte ; roumain : départ debout, on descend.
    d.pose = roumain ? (u => cle(u)) : (u => cle(1 - u));
    d.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.225 }];
    if (o.smith) fixe.push(...poseFixe(MAT.smith(C, zHaut)));
    return d;
  };

  /* Ponts fessiers et hip thrusts : épaules en appui (au sol, ou sur le bord d'un banc), pieds à plat, les hanches montent.
     banc (hip thrust) ; charge : barre, hal, smith, machine, elas (mini-bande aux genoux), disque ; unejambe ;
     grenouille (plantes de pieds jointes) ; kas (petite amplitude) ; genoux (hip thrust à genoux, à la Smith machine). */
  FAM.pont = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 48, el: 14 }, tenu: [], fixe };
    if (o.genoux) {
      // À genoux, la barre dans le pli des hanches : assis sur les talons, puis hanches poussées vers l'avant.
      const cle = u => { const p = aGenoux(c, { flex: lerp(-52, 0, u) * 0, penche: lerp(34, 0, u) }); p.jambes = pareil(J(lerp(34, 0, u) + lerp(58, 0, u), 6, 0, lerp(148, 90, u), 62)); c.poserSur(p, V(), AY, ['jambe', 'pied']); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.duBassin(V(s * 0.3, -0.02, L.ventre + 0.03)), pole: V(s * 1, 0, -0.4), paume: V(0, 0, -1).applyQuaternion(t.qBassin), dirMain: V(0, -1, 0.2), doigts: 'barre' }; return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; d.tenu = [{ t: 'barre', l: 1.6, d: 0.18 }];
      const info = c.poser(cle(1)); fixe.push(...poseFixe(MAT.smith(C, info.prises.G.z))); d.vue = { az: 70, el: 8 }; return d;
    }
    const banc = !!o.banc || o.barre && !o.sol || o.smith || o.machine, hB = 0.42;
    const zS = -0.55;                                             // où reposent les épaules
    const cle = u => {
      // Sur un banc : le buste part relevé (épaules sur le banc, fesses près du sol) et finit à l'horizontale ;
      // par terre : il part à plat et finit incliné, les hanches plus hautes que les épaules.
      const k = o.kas ? lerp(0.6, 1, u) : u, phi = banc ? lerp(38, 2, k) : lerp(0, -27, k);
      const p = { bassin: { pos: V(0, 0.3, 0), rot: qX(-90 + phi) }, lombaires: banc ? lerp(12, -2, k) : lerp(-4, -8, k), thorax: banc ? lerp(8, 0, k) : -3, cou: banc ? lerp(-26, 14, k) : lerp(4, 26, k), bras: pareil(brasRepos()), jambes: {} };
      ancrer(c, p, 'cou1', banc ? V(0, hB + 0.085, zS) : V(0, 0.1, zS));
      const zPied = zS + (banc ? 0.52 + 0.4 : 0.5 + 0.4);
      for (const [kk, s] of COTES) {
        if (o.grenouille) p.jambes[kk] = { cheville: V(s * 0.035, 0.05, zPied - 0.12), pole: V(s * 1, 0.35, 0.15), pied: V(-s * 0.1, 0.1, 1), hautPied: V(s * 1, 0.2, 0) };
        else p.jambes[kk] = pied(c, s, { x: s * 0.13, ouv: 6, z: zPied, pole: V(0, 1, 0.25) });
      }
      if (o.unejambe) p.jambes.D = J(lerp(banc ? 70 : 50, 4, k), 3, 0, lerp(70, 6, k), 20);
      const t = c.tronc(p);
      for (const [kk, s] of COTES) {
        if (o.barre || o.smith || o.hal || o.disque) p.bras[kk] = { prise: t.duBassin(V(s * (o.barre || o.smith ? 0.3 : 0.1), 0.0, L.ventre + 0.035)), pole: V(s * 1, -0.3, -0.2), paume: V(0, -0.3, -1).applyQuaternion(t.qBassin), doigts: 'barre' };
        else if (banc) p.bras[kk] = B(92, 62, 0, 70, 180, { doigts: 'detendu' });
        else p.bras[kk] = B(90, 22, 0, 8, 180, { doigts: 'plat' });
      }
      return p;
    };
    d.pose = cle;
    if (banc) fixe.push(...poseFixe(MAT.banc(C, 0, hB), V(0.3, 0, zS - 0.14), qY(90)));
    if (o.barre || o.smith) d.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.225 }];
    else if (o.hal) d.tenu = [{ t: 'haltere', m: 'G', k: 1.2 }];
    else if (o.disque) d.tenu = [{ t: 'disque', m: 'GD', r: 0.17, axe: AY }];
    if (o.smith) { const info = c.poser(cle(1)); fixe.push(...poseFixe(MAT.smith(C, info.prises.G.z))); }
    if (o.machine) d.objets = (info, u, sortie) => { const b = info.bassin.clone().add(V(0, 0.02, L.ventre + 0.05).applyQuaternion(info.qBassin)); sortie.push(pret(cyl(0.05, 0.5, b.x, b.y, b.z, C.banc, 0))); for (const s of [1, -1]) sortie.push(pret(seg(V(s * 0.3, b.y, b.z), V(s * 0.3, 0.1, b.z + 0.5), 0.02, C.cadre, 0.5))); };
    if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(info.genoux.G.clone().add(V(0, -0.03, 0)), info.genoux.D.clone().add(V(0, -0.03, 0)), 0.012, C.elastique, 0)));
    return d;
  };

  /* Machines et exercices des cuisses, assis ou couché.
     presse (presse à cuisses à 45° ; horizontale ; verticale ; unejambe ; large, serre ; mollets : presse à mollets) ;
     extension (leg extension ; uni) ; curl (ischios : couché par défaut, assis, debout ; machine, poulie, elas, hal ;
     nordique ; ghr ; glisse / ballon / anneaux : pont, talons qui reviennent) ; tke (extension finale du genou,
     debout, élastique ou câble derrière le genou) ; nordiqueInverse (à genoux, le corps part en arrière). */
  FAM.jambes = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 68, el: 10 }, tenu: [], fixe };
    if (o.presse) {
      const ang = o.horizontale ? 0 : o.verticale ? 90 : 45, r = V(0, Math.sin(rad(ang)), Math.cos(rad(ang))), e = V(0, Math.cos(rad(ang)), -Math.sin(rad(ang)));
      const dossier = o.verticale ? 0 : o.horizontale ? 68 : 40;       // inclinaison du dos sur l'horizontale
      const base = allonge(c, { h: o.verticale ? 0 : 0.3, angle: dossier, jambes: J(100, 6, 0, 100, 0), lomb: 0, thor: 0, cou: 2, d: 0.12 });
      const ha = c.tronc(base).hanches.G, ecart = o.large ? 0.26 : o.serre ? 0.07 : 0.15;
      const plie = ha.clone().setX(0).add(r.clone().multiplyScalar(o.verticale ? 0.36 : 0.3)).add(e.clone().multiplyScalar(o.verticale ? 0 : 0.26)), course = o.mollets ? 0.05 : 0.4;
      d.pose = u => { const p = cloner(base), k = o.mollets ? 1 : u, pt = o.mollets ? 34 * u : 0; for (const [kk, s] of COTES) { const ch = plie.clone().add(r.clone().multiplyScalar((0.4 * k) + (o.mollets ? 0.05 * u : 0))).setX(s * ecart); const dir = e.clone().multiplyScalar(Math.cos(rad(pt))).add(r.clone().multiplyScalar(Math.sin(rad(pt)))), hautP = r.clone().multiplyScalar(-Math.cos(rad(pt))).add(e.clone().multiplyScalar(Math.sin(rad(pt)))); p.jambes[kk] = { cheville: ch, pole: e.clone().add(V(s * (o.large ? 0.6 : 0.25), 0, 0)).add(r.clone().multiplyScalar(-0.2)), pied: dir, hautPied: hautP, orteils: pt }; } if (o.unejambe) p.jambes.D = pied(c, -1, { x: -0.3, z: ha.z + 0.45, ouv: 20, pole: V(-0.5, 1, 0.3) }); for (const [kk, s] of COTES) p.bras[kk] = B(60, 22, 0, 30, 90, { doigts: 'barre' }); return p; };
      // Le plateau suit les pieds ; le siège est fixe.
      if (!o.verticale) fixe.push(...poseFixe(MAT.banc(C, dossier, 0.3, 0.8, 0.34)));
      d.objets = (info, u, sortie) => { const m = info.chevilles.G.clone().setX(0).add(r.clone().multiplyScalar(L.chevilleH + 0.03)).add(e.clone().multiplyScalar(0.06)), q = arc(AY, r); sortie.push({ forme: 'boite', s: [0.62, 0.04, 0.42], p: [m.x, m.y, m.z], q: [q.x, q.y, q.z, q.w], couleur: C.cadre, metal: 0.5 }); const bout = m.clone().add(r.clone().multiplyScalar(0.75)); sortie.push(pret(seg(m, bout, 0.03, C.cadre, 0.5))); if (ang === 45) for (const s of [1, -1]) sortie.push(pret(cyl(0.2, 0.05, s * 0.42, m.y + 0.02, m.z + 0.02, C.fonte, 0))); };
      d.vue = { az: 66, el: 12 }; return d;
    }
    if (o.extension) {
      const base = allonge(c, { h: 0.58, angle: 76, jambes: J(74, 5, 0, 92, 0), lomb: 0, thor: 0, cou: 0, d: 0.1 });
      fixe.push(...poseFixe(MAT.banc(C, 76, 0.58)));
      const cle = u => { const p = cloner(base); for (const k of ['G', 'D']) { p.jambes[k] = J(74, 5, 0, lerp(94, 6, u), -10 * u); p.bras[k] = B(80, 14, 0, 35, 90); } if (o.uni) p.jambes.D = J(74, 5, 0, 92, 0); return p; };
      d.a = cle(0); d.b = cle(1);
      d.objets = (info, u, sortie) => { for (const k of o.uni ? ['G'] : ['G', 'D']) { const g = info.genoux[k], ch = info.chevilles[k], av = unite(ch.clone().sub(g)).cross(AX).multiplyScalar(-1); } const g = info.genoux.G.clone().setX(0), ch = info.chevilles.G.clone().setX(0), dj = unite(ch.clone().sub(g)), dev = dj.clone().cross(AX).normalize(), pp = ch.clone().add(dev.multiplyScalar(-0.085)).add(dj.clone().multiplyScalar(-0.03)); sortie.push(pret(cyl(0.05, 0.4, 0, pp.y, pp.z, C.banc, 0))); sortie.push(pret(seg(V(0.24, g.y - 0.02, g.z - 0.02), V(0.24, pp.y, pp.z), 0.018, C.cadre, 0.5))); };
      return d;
    }
    if (o.curl) {
      if (o.nordique || o.ghr) {
        // À genoux, chevilles tenues : le corps descend d'un bloc vers l'avant, retenu par les ischios, puis remonte.
        const cle = u => { const p = aGenoux(c, { flex: 0, penche: 0 }); const a = lerp(0, o.ghr ? 74 : 62, u); p.bassin.rot = qX(a); p.jambes = pareil(J(a, 6, 0, 90 - a, 62)); c.poserSur(p, V(0, o.ghr ? 0.55 : 0, 0), AY, ['jambe', 'pied']); p.lombaires = -2; p.cou = -14 * u; const t = c.tronc(p); p.bras = pareil(B(4, 30 + 40 * u, 0, 100 - 20 * u, 150, { doigts: 'plat' })); return p; };
        d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; d.vue = { az: 70, el: 8 };
        const pz = c.poser(cle(0)).chevilles.G;
        if (o.ghr) fixe.push(pret(boite(0.45, 0.08, 0.4, 0, 0.51, pz.z + 0.5, C.banc, 0)), pret(cyl(0.05, 0.45, 0, pz.y + 0.1, pz.z, C.banc, 0)), pret(boite(0.5, 0.5, 0.06, 0, 0.25, pz.z + 0.3, C.cadre, 0.5)));
        else fixe.push(pret(cyl(0.045, 0.45, 0, pz.y + 0.1, pz.z - 0.02, C.banc, 0)));
        return d;
      }
      if (o.glisse || o.ballon || o.anneaux) {
        // Sur le dos, hanches levées : les talons (sur un ballon, des patins ou dans des sangles) reviennent vers les fesses.
        const yT = o.ballon ? 0.5 : o.anneaux ? 0.25 : 0.03;
        const cle = u => { const phi = lerp(14, 26, u) + (o.ballon ? 6 : 0), p = { bassin: { pos: V(0, 0.3, 0), rot: qX(-90 - phi) }, lombaires: -4, thorax: -2, cou: 18, bras: pareil(B(90, 24, 0, 8, 180, { doigts: 'plat' })), jambes: {} }; ancrer(c, p, 'cou1', V(0, 0.1, -0.55)); const t = c.tronc(p), zT = t.hanches.G.z + lerp(0.74, 0.42, u); for (const [k, s] of COTES) p.jambes[k] = { cheville: V(s * 0.1, yT + 0.07, zT), pole: V(0, 1, 0.2), pied: V(0, 0.8, 0.6), hautPied: V(0, 0.6, -0.8) }; return p; };
        d.pose = cle; d.vue = { az: 118, el: 14 };
        if (o.ballon) d.objets = (info, u, sortie) => sortie.push(pret(sphere(0.25, 0, 0.25, info.chevilles.G.z + 0.06, C.ballon, 0)));
        if (o.anneaux) d.tenu = [], d.objets = (info, u, sortie) => { for (const k of ['G', 'D']) sortie.push(pret(seg(V(info.chevilles[k].x, 2.4, info.chevilles[k].z + 0.2), info.chevilles[k], 0.008, C.sangle, 0))); };
        return d;
      }
      if (o.assis) {
        const base = allonge(c, { h: 0.6, angle: 76, jambes: J(74, 5, 0, 12, 0), lomb: 0, thor: 0, cou: 0, d: 0.1 });
        fixe.push(...poseFixe(MAT.banc(C, 76, 0.6)));
        const cle = u => { const p = cloner(base); for (const k of ['G', 'D']) { p.jambes[k] = J(74, 5, 0, lerp(10, 104, u), 0); p.bras[k] = B(80, 14, 0, 35, 90); } if (o.uni) p.jambes.D = J(74, 5, 0, 10, 0); return p; };
        d.a = cle(0); d.b = cle(1);
        d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().setX(0), ch = info.chevilles.G.clone().setX(0), dj = unite(ch.clone().sub(g)), der = dj.clone().cross(AX).normalize(), pp = ch.clone().add(der.multiplyScalar(0.085)); sortie.push(pret(cyl(0.05, 0.4, 0, pp.y, pp.z, C.banc, 0))); sortie.push(pret(seg(V(0.24, g.y, g.z), V(0.24, pp.y, pp.z), 0.018, C.cadre, 0.5))); sortie.push(pret(cyl(0.045, 0.4, 0, g.y + 0.1, g.z - 0.06, C.banc, 0))); };
        return d;
      }
      if (o.debout) {
        // Debout, une jambe : la cuisse reste à la verticale, le talon monte vers la fesse.
        const p = debout(c, { penche: 8, ecart: 0.09, ouv: 6 }); p.bras = pareil(B(10, 50, 0, 40, 90));
        const cle = u => { const q = cloner(p); q.jambes.G = J(8 + 2, 3, 0, lerp(6, 112, u), 20); return q; };
        d.a = cle(0); d.b = cle(1);
        fixe.push(pret(seg(V(0, 0, 0.4), V(0, 1.15, 0.4), 0.03, C.cadre, 0.5)), pret(cyl(0.015, 0.5, 0, 1.12, 0.38, C.metal, 1)));
        if (o.poulie) { const anc = V(0.09, 0.1, 0.9); d.tenu = [{ t: 'cable', de: anc, vers: info => info.chevilles.G, m: 'G', bout: 'rien' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
        else if (o.machine) d.objets = (info, u, sortie) => { const ch = info.chevilles.G; sortie.push(pret(cyl(0.045, 0.2, ch.x, ch.y + 0.03, ch.z - 0.09, C.banc, 0))); };
        d.a.jambes.G = J(10, 3, 0, 6, 0); return d;
      }
      // Couché à plat ventre sur le banc : les talons montent vers les fesses.
      const base = aPlatVentre(c, { h: 0.55, angle: 0, d: 0.2, jambes: J(0, 4, 0, 6, 20), cou: -8 });
      fixe.push(...poseFixe(MAT.banc(C, 0, 0.55, 0.9, 0.3), V(0, 0, 0.05), qY(180)));
      const cle = u => { const p = cloner(base); for (const [k, s] of COTES) { p.jambes[k] = J(-2, 4, 0, lerp(6, 116, u), 20); p.bras[k] = { prise: V(s * 0.2, 0.42, p.bassin.pos.z + 0.62), pole: V(s * 1, -0.2, -0.2), paume: V(-s, 0, 0), doigts: 'barre' }; } if (o.uni) p.jambes.D = J(-2, 4, 0, 6, 20); return p; };
      d.a = cle(0); d.b = cle(1); d.vue = { az: 62, el: 12 };
      if (o.hal) d.objets = (info, u, sortie) => { const m = info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5), pd = unite(info.orteils.G.clone().sub(info.chevilles.G)); poserObjet(MAT.haltere(C, 1.1), m.clone().add(pd.multiplyScalar(0.1)), qTenu(pd, AX), sortie); };
      else if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(V(0, 0.3, info.chevilles.G.z - 1.0 + 0 * u), info.chevilles.G.clone().setX(0), 0.008, C.elastique, 0)));
      else d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().setX(0), ch = info.chevilles.G.clone().setX(0), dj = unite(ch.clone().sub(g)), der = AX.clone().cross(dj).normalize(), pp = ch.clone().add(der.multiplyScalar(0.09)); sortie.push(pret(cyl(0.05, 0.4, 0, pp.y, pp.z, C.banc, 0))); sortie.push(pret(seg(V(0.24, g.y - 0.03, g.z), V(0.24, pp.y, pp.z), 0.018, C.cadre, 0.5))); };
      return d;
    }
    if (o.tke) {
      // Extension finale du genou : debout, une résistance derrière le genou, qui se verrouille.
      const cle = u => { const p = debout(c, { penche: 4, ecart: 0.09, ouv: 6 }); p.jambes.G = pied(c, 1, { ecart: 0.09, z: L.racine.z + L.hanche.z + 0.14, pointe: lerp(18, 0, u), pole: V(0, 0, 1) }); p.bassin.pos.y -= lerp(0.035, 0, u); p.bras = mains(c, c.tronc(p), 'hanches'); return p; };
      d.a = cle(0); d.b = cle(1);
      const anc = V(0.09, 0.45, 1.1); d.tenu = [{ t: o.poulie ? 'cable' : 'elastique', de: anc, vers: info => info.genoux.G.clone().add(V(0, 0, -0.06)), m: 'G', bout: 'rien' }];
      fixe.push(...poseFixe(MAT.colonne(C, anc))); return d;
    }
    if (o.nordiqueInverse) {
      // À genoux, buste et cuisses alignés : tout le corps part en arrière, retenu par les quadriceps.
      const cle = u => { const a = lerp(0, -48, u), p = aGenoux(c, {}); p.bassin.rot = qX(a); p.jambes = pareil(J(a, 6, 0, 90 - a, 62)); c.poserSur(p, V(), AY, ['jambe', 'pied']); p.cou = 8 * u; p.bras = o.disque ? p.bras : pareil(B(0, 20, 0, 10, 180, { doigts: 'detendu' })); if (o.disque) p.bras = mains(c, c.tronc(p), 'poitrine'); return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; if (o.disque) d.tenu = [{ t: 'disque', m: 'GD', r: 0.14, axe: AZ }];
      return d;
    }
    throw new Error('jambes : sorte inconnue');
  };

  /* Mollets : les talons montent, sur la pointe des pieds.
     debout (défaut) : pc, barre, hal, smith, machine ; uni ; marche (pointes sur une marche) ; assis (machine, hal,
     barre, smith) ; tibial (dos au mur, ce sont les pointes de pied qui se lèvent). */
  FAM.mollets = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 62, el: 8 }, tenu: [], fixe }, y0 = o.marche ? 0.1 : 0, z0 = L.racine.z + L.hanche.z;
    if (o.marche) fixe.push(pret(boite(0.6, y0, 0.3, 0, y0 / 2, z0 + 0.19, C.banc, 0)));
    if (o.tibial) {
      const cle = u => { const p = debout(c, { dz: -0.22, penche: -6, ecart: 0.1, ouv: 4 }); for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { ecart: 0.1, ouv: 4, z: z0 + 0.12, pointe: -26 * u }); p.bras = pareil(B(90, 10, 0, 10, 180, { doigts: 'plat' })); return p; };
      d.a = cle(0); d.b = cle(1); fixe.push(...poseFixe(MAT.mur(C, cle(0).bassin.pos.z - L.dos - 0.03))); return d;
    }
    if (o.assis) {
      // Assis, genoux à angle droit, la charge sur les genoux : seuls les talons montent.
      const cle = u => { const p = assis(c, { h: 0.5, zPieds: 0.42, pointe: 36 * u, ecart: 0.11, ouv: 4 }); const t = c.tronc(p); if (o.uni) p.jambes.D = pied(c, -1, { x: -0.2, z: p.bassin.pos.z + 0.6, ouv: 10 }); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.16, p.jambes.G.cheville.y + L.jambe + 0.1, p.bassin.pos.z + 0.4), pole: V(s * 1, 0, -0.5), paume: V(0, -1, 0), doigts: 'barre' }; return p; };
      d.pose = cle; fixe.push(...poseFixe(MAT.siege(C, 0.5)), pret(boite(0.4, 0.08, 0.3, 0, 0.04, 0.5, C.cadre, 0.5)));
      d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().add(o.uni ? info.genoux.G : info.genoux.D).multiplyScalar(0.5); if (o.hal) poserObjet(MAT.haltere(C, 1.2), g.clone().add(V(0, 0.09, -0.04)), null, sortie); else if (o.barre || o.smith) poserObjet(MAT.barre(C, 1.6, 0.18), g.clone().add(V(0, 0.085, -0.05)), null, sortie); else sortie.push(pret(cyl(0.05, 0.42, g.x, g.y + 0.1, g.z - 0.05, C.banc, 0))); };
      if (o.smith) fixe.push(...poseFixe(MAT.smith(C, 0.37)));
      return d;
    }
    const cle = u => {
      const th = 40 * u, p = debout(c, { ecart: 0.1, ouv: 6, y0, dy: y0 });
      for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { ecart: 0.1, ouv: 6, pointe: th, y0, z: z0 });
      // Le bassin monte avec les chevilles.
      p.bassin.pos.y = L.racine.y + (p.jambes.G.cheville.y - L.chevilleH); p.bassin.pos.z += (p.jambes.G.cheville.z - z0);
      if (o.uni) p.jambes.D = J(-6, 3, 0, 62, 30);
      const m = porter(c, p, o.pc || !(o.barre || o.hal || o.smith) ? { hanches: true } : o, C, 0); d.tenu = m.tenu;
      if (o.machine) for (const [k, s] of COTES) p.bras[k] = B(40, 30, 40, 120, 90);
      return p;
    };
    d.pose = cle; cle(0);
    if (o.smith) { const info = c.poser(cle(0)); fixe.push(...poseFixe(MAT.smith(C, info.prises.G.z))); }
    if (o.machine) d.objets = (info, u, sortie) => { for (const k of ['G', 'D']) { const e = info.epaules[k]; sortie.push(pret(boite(0.14, 0.06, 0.2, e.x, e.y + 0.09, e.z, C.banc, 0))); sortie.push(pret(seg(V(e.x, e.y + 0.1, e.z - 0.08), V(e.x, e.y + 0.1, e.z - 0.6), 0.02, C.cadre, 0.5))); } };
    return d;
  };

  /* Hanches : abductions, adductions, extensions.
     abduction / adduction : debout (poulie, elas, pc), assis (machine, elas), cote (couché sur le côté), coquille
     (couché sur le côté, genoux pliés), borne (à quatre pattes, le genou s'écarte) ;
     kickback (extension) : debout (poulie, elas, machine), quatrepattes (genou plié : coup de pied de mule ; tendu),
     smith (à quatre pattes, le pied pousse la barre) ; hyperinverse (à plat ventre sur un banc, les jambes montent) ;
     monstre (marche avec mini-bande : avant ou lateral) ; balancement (avant ou lateral) ; cercles. */
  FAM.hanche = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 25, el: 8 }, tenu: [], fixe }, z0 = L.racine.z + L.hanche.z;
    const appui = (p, z) => { for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.16, 1.05, z == null ? 0.42 : z), pole: V(s * 1, -0.6, -0.2), paume: V(0, -1, 0), doigts: 'barre' }; fixe.push(pret(seg(V(0, 0, (z == null ? 0.42 : z) + 0.03), V(0, 1.02, (z == null ? 0.42 : z) + 0.03), 0.025, C.cadre, 0.5)), pret(cyl(0.015, 0.5, 0, 1.03, (z == null ? 0.42 : z) + 0.01, C.metal, 1))); };
    if (o.monstre) {
      // Marche avec mini-bande aux genoux, en quart de squat : sur place, un pied s'écarte, l'autre le rejoint.
      d.rythme = 'continu'; d.periode = 2;
      d.pose = ph => { const p = debout(c, { dy: -0.14, dz: -0.08, penche: 16, ecart: 0.13, ouv: 8, cou: -8 }); const w = ph * 2, s = w < 1 ? 1 : -1, q = w % 1, lv = Math.sin(Math.PI * q) * 0.06, k = s > 0 ? 'G' : 'D'; if (o.lateral) { p.jambes[k] = pied(c, s, { x: s * (0.13 + 0.12 * Math.sin(Math.PI * q)), ouv: 8, y0: lv }); p.bassin.pos.x += s * 0.04 * Math.sin(Math.PI * q); } else p.jambes[k] = pied(c, s, { x: s * 0.2, ouv: 10, z: z0 + 0.22 * Math.sin(Math.PI * q) - 0.04, y0: lv }); p.bras = mains(c, c.tronc(p), 'hanches'); return p; };
      d.objets = (info, u, sortie) => sortie.push(pret(seg(info.genoux.G.clone().add(V(0, 0.06, 0)), info.genoux.D.clone().add(V(0, 0.06, 0)), 0.012, C.elastique, 0)));
      d.vue = o.lateral ? { az: 12, el: 8 } : { az: 40, el: 8 }; return d;
    }
    if (o.balancement || o.cercles) {
      d.rythme = 'continu'; d.periode = o.cercles ? 2.4 : 1.6;
      const base = debout(c, { ecart: 0.07, ouv: 6 }); appui(base, o.lateral ? 0.42 : null);
      if (!o.lateral && !o.cercles) { fixe.length = 0; for (const [k, s] of COTES) base.bras[k] = k === 'D' ? { prise: V(-0.45, 1.05, 0), pole: V(-1, -0.6, -0.2), paume: V(0, -1, 0), doigts: 'barre' } : B(90, 40, 0, 15, 90, { doigts: 'detendu' }); fixe.push(pret(seg(V(-0.47, 0, 0), V(-0.47, 1.03, 0), 0.025, C.cadre, 0.5))); }
      d.pose = ph => { const p = cloner(base), w = ph * 2 * Math.PI; p.jambes.G = o.cercles ? J(62 + 16 * Math.cos(w), 22 + 22 * Math.sin(w), 0, 80, 20) : o.lateral ? J(0, 14 + 30 * Math.sin(w), 0, 4, 15) : J(42 * Math.sin(w) + 6, 3, 0, 8 + 24 * (1 - Math.abs(Math.sin(w))) + 10 * Math.max(0, -Math.sin(w)), 4); return p; };
      d.vue = o.lateral || o.cercles ? { az: 15, el: 8 } : { az: 70, el: 8 }; return d;
    }
    if (o.hyperinverse) {
      // À plat ventre sur un banc haut, hanches au bord : les jambes pendent puis montent à l'horizontale.
      const base = aPlatVentre(c, { h: 0.85, angle: 0, d: 0.1, jambes: J(60, 4, 0, 10, 20), regions: ['thorax', 'abdomen'] });
      const cle = u => { const p = cloner(base); p.jambes = pareil(J(lerp(62, -10, u), 4, 0, lerp(14, 4, u), 20)); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.2, 0.72, p.bassin.pos.z + 0.6), pole: V(s * 1, -0.3, -0.2), paume: V(-s, 0, 0), doigts: 'barre' }; return p; };
      d.a = cle(0); d.b = cle(1); fixe.push(...poseFixe(MAT.banc(C, 0, 0.85, 0.8, 0.1), V(0, 0, 0.1), qY(180)));
      if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(V(0, 0.1, base.bassin.pos.z + 0.3), info.chevilles.G.clone().setX(0), 0.008, C.elastique, 0)));
      d.vue = { az: 62, el: 10 }; return d;
    }
    if (o.quatrepattes || o.borne || o.smith) {
      const base = quatrePattes(c, {});
      let a = J(86, 6, 0, 90, 62), b;
      if (o.borne) b = J(86, 52, 0, 90, 40);                       // le genou s'écarte sur le côté
      else if (o.tendu) b = J(-6, 6, 0, 8, 30);                    // jambe tendue vers l'arrière
      else b = J(2, 6, 0, 96, 20);                                 // genou plié, la plante du pied vers le plafond
      const A = cloner(base), Z = cloner(base); A.jambes.G = a; Z.jambes.G = b; d.a = A; d.b = Z; d.vue = { az: o.borne ? 150 : 70, el: 12 };
      if (o.smith) { d.objets = (info, u, sortie) => { const pi = info.chevilles.G.clone().add(info.orteils.G).multiplyScalar(0.5); poserObjet(MAT.barre(C, 1.6, 0.18), V(0, pi.y + 0.07, pi.z), null, sortie); }; const iz = c.poser(Z).chevilles.G.z; fixe.push(...poseFixe(MAT.smith(C, iz + 0.05))); }
      if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(info.chevilles.D, info.chevilles.G, 0.008, C.elastique, 0)));
      if (o.poulie) { const anc = V(0.09, 0.1, c.poser(A).chevilles.G.z + 1.3); d.tenu = [{ t: 'cable', de: anc, vers: info => info.chevilles.G, m: 'G', bout: 'rien' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
      return d;
    }
    if (o.cote || o.coquille) {
      // Couché sur le côté droit : c'est la jambe du dessus (la gauche) qui travaille.
      const base = surLeCote(c, { cote: 'D', jambes: o.coquille ? J(48, 0, 0, 88, 20) : J(8, 0, 0, 6, 20) });
      base.bras.D = B(0, 150, 0, 70, 90, { doigts: 'detendu' }); base.bras.G = B(40, 40, -40, 80, 180, { doigts: 'plat' });
      if (!o.coquille) base.jambes.D = J(30, 0, 0, 55, 20);
      const A = cloner(base), Z = cloner(base);
      Z.jambes.G = o.coquille ? J(48, 40, 0, 88, 20) : J(8, 42, 0, 6, 20);
      if (o.adduction) { A.jambes.G = J(60, 20, 0, 80, 0); Z.jambes.G = J(60, 20, 0, 80, 0); A.jambes.D = J(4, 0, 0, 4, 20); Z.jambes.D = J(4, -24, 0, 4, 20); }
      d.a = A; d.b = Z; d.vue = { az: 0, el: 20 };
      if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(info.genoux.D, info.genoux.G, 0.012, C.elastique, 0)));
      return d;
    }
    if (o.assis) {
      // À la machine (ou avec une bande aux genoux) : assis, les cuisses s'ouvrent ou se referment.
      const ouvert = 36, ferme = 5;
      const base = allonge(c, { h: 0.5, angle: 76, jambes: J(74, ferme, 0, 88, 0), lomb: 0, thor: 0, cou: 0, d: 0.1 });
      fixe.push(...poseFixe(MAT.banc(C, 76, 0.5)));
      const cle = k => { const p = cloner(base); p.jambes = pareil(J(74, k, 0, 88, 0)); p.bras = pareil(B(80, 14, 0, 35, 90)); return p; };
      d.a = cle(o.adduction ? ouvert : ferme); d.b = cle(o.adduction ? ferme : ouvert); d.vue = { az: 20, el: 14 };
      d.objets = (info, u, sortie) => { for (const [k, s] of COTES) { const g = info.genoux[k]; if (o.elas) continue; sortie.push(pret(boite(0.05, 0.16, 0.2, g.x + s * (o.adduction ? -0.075 : 0.075), g.y, g.z - 0.08, C.banc, 0))); } if (o.elas) sortie.push(pret(seg(info.genoux.G.clone().add(V(0, 0.05, -0.04)), info.genoux.D.clone().add(V(0, 0.05, -0.04)), 0.012, C.elastique, 0))); };
      return d;
    }
    // Debout, en appui sur une jambe, mains sur un support : l'autre jambe s'écarte, se rapproche ou part en arrière.
    const pen = o.kickback ? 14 : 0;
    const base = debout(c, { penche: pen, dz: -pen * 0.003, ecart: 0.08, ouv: 6 }); appui(base);
    let a, b;
    if (o.adduction) { a = J(4 + pen, 28, 0, 3, 10); b = J(12 + pen, -16, 0, 3, 10); }
    else if (o.kickback) { a = J(18 + pen, 2, 0, 40, 0); b = J(-30 + pen, 2, 0, 10, 30); if (o.machine) { a = J(40 + pen, 2, 0, 70, 0); b = J(-22 + pen, 2, 0, 10, 20); } }
    else { a = J(0, 5, 0, 3, 10); b = J(0, 40, 0, 3, 15); }
    const A = cloner(base), Z = cloner(base); A.jambes.G = a; Z.jambes.G = b; d.a = A; d.b = Z;
    d.vue = o.kickback ? { az: 68, el: 8 } : { az: 15, el: 8 };
    if (o.poulie) { const anc = o.kickback ? V(0.09, 0.1, 1.2) : o.adduction ? V(1.1, 0.1, 0) : V(-1.1, 0.1, 0); d.tenu = [{ t: 'cable', de: anc, vers: info => info.chevilles.G, m: 'G', bout: 'rien' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
    else if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(info.chevilles.D, info.chevilles.G, 0.008, C.elastique, 0)));
    else if (o.machine) d.objets = (info, u, sortie) => { const ch = info.chevilles.G; sortie.push(pret(boite(0.2, 0.04, 0.22, ch.x, ch.y - 0.06, ch.z + 0.02, C.cadre, 0.5))); };
    return d;
  };

  /* Abdominaux au sol, sur banc ou à la poulie.
     Couché : crunch (défaut), situp (relevé de buste complet), vup, toucher (jambes à la verticale, les mains vont
     aux pieds), inverse (crunch inversé), jambes (relevé de jambes tendues), velo, battements, ciseaux, chevilles
     (taps de cheville), grenouille, deadbug, hollow (tenue), dragon (drapeau du dragon), chandelle, lateral (couché
     sur le côté). Assis par terre : genoux (ramené de genoux), inout, vsit. Options : decline (banc décliné),
     incline (banc incliné, pour les relevés de jambes), ballon, leste, tendus (bras tendus avec un poids), torsion.
     À la poulie ou à l'élastique : poulie genoux (défaut) / debout / assis ; machine (assis) ; vacuum (debout). */
  FAM.abdos = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 68, el: 16 }, tenu: [], fixe };
    const mainsDe = (p, ou) => { const t = c.tronc(p); if (ou === 'tendus') return pareil(B(0, 96, -6, 6, 90)); if (ou === 'long') return pareil(B(90, 18, 0, 6, 180, { doigts: 'plat' })); if (ou === 'haut') return pareil(B(10, 168, 0, 6, 180, { doigts: 'detendu' })); return mains(c, t, ou); };
    const ou = o.tendus ? 'tendus' : o.leste || o.poitrine ? 'poitrine' : 'oreilles';
    const poids = () => { if (o.leste || o.tendus) d.tenu = [{ t: 'disque', m: 'GD', r: 0.13, axe: o.tendus ? AX : AZ }]; };
    if (o.vacuum) {
      const cle = u => { const p = debout(c, { penche: 6, ecart: 0.1 }); p.lombaires = 4 + 6 * u; p.thorax = 3 * u; p.bras = mains(c, c.tronc(p), 'hanches'); return p; };
      d.a = cle(0); d.b = cle(1); d.rythme = 'tenue'; d.vue = { az: 60, el: 8 }; return d;
    }
    if (o.machine) {
      // Assis à la machine : les mains tiennent les poignées près de la tête, le buste s'enroule vers les genoux.
      const base = assis(c, { h: 0.5, zPieds: 0.36 });
      const cle = u => { const p = cloner(base); p.lombaires = 34 * u; p.thorax = 22 * u; p.cou = 10 * u; p.bras = pareil(B(20, 120, 20, 120, 90)); return p; };
      d.a = cle(0); d.b = cle(1); fixe.push(...poseFixe(MAT.siege(C, 0.5, 0.55, 4))); d.vue = { az: 66, el: 10 };
      d.tenu = [{ t: 'levier', de: () => V(0.2, 1.75, -0.15), m: 'G' }, { t: 'levier', de: () => V(-0.2, 1.75, -0.15), m: 'D' }]; return d;
    }
    if (o.poulie || o.elas) {
      // La corde tenue de part et d'autre de la tête : le buste s'enroule, les hanches ne bougent presque pas.
      const sorte = o.debout ? 'debout' : o.assis ? 'assis' : 'genoux';
      const base = sorte === 'debout' ? debout(c, { ecart: 0.12 }) : sorte === 'assis' ? assis(c, { h: 0.45 }) : aGenoux(c, { penche: 8 });
      if (sorte === 'assis') fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, 0.28)));
      const dos = o.debout || o.assis;                          // dos à la poulie (debout, assis) ou face à elle (à genoux)
      const cle = u => { const p = cloner(base); p.lombaires = (sorte === 'genoux' ? 44 : 34) * u; p.thorax = 24 * u; p.cou = 8 * u; if (o.lateral) { p.lombaires = 6 * u; p.thorax = 0; p.inclinaison = 30 * u; } if (o.torsion) p.torsion = 34 * u; if (sorte === 'genoux' && !o.lateral) { p.bassin.rot = qX(8 + 16 * u); p.jambes = pareil(J(8 + 16 * u + 14 * u, 6, 0, 90 + 14 * u, 62)); } const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax); for (const [k, s] of COTES) p.bras[k] = { prise: t.tete.clone().add(dT(s * 0.11, 0.04, dos ? -0.02 : 0.1)), pole: dT(s * 1, -0.6, 0.3), paume: dT(-s, 0, 0), dirMain: dT(0, 1, dos ? -0.3 : 0.3), doigts: 'barre' }; return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; if (sorte === 'genoux') for (const [, p] of d.cles) c.poserSur(p, V(), AY, ['jambe', 'pied']);
      const anc = dos ? V(0, sorte === 'assis' ? 1.75 : 2.05, -0.55) : V(0, 2.0, 0.55);
      d.tenu = [{ t: o.elas ? 'elastique' : 'cable', de: anc, bout: 'corde' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); d.vue = { az: 68, el: 8 }; return d;
    }
    if (o.lateral) {
      // Couché sur le côté : le buste se soulève de côté.
      const base = surLeCote(c, { cote: 'D', jambes: J(30, 0, 0, 50, 20) });
      const cle = u => { const p = cloner(base); p.inclinaison = -26 * u; p.lombaires = 4; const t = c.tronc(p); p.bras.G = mains(c, t, 'oreilles').G; p.bras.D = { prise: V(t.epaules.D.x - 0.04, 0.03, t.epaules.D.z + 0.42), pole: V(0, 1, 0.3), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      d.a = cle(0); d.b = cle(1); d.vue = { az: 0, el: 24 }; return d;
    }
    if (o.genoux || o.inout || o.vsit || o.assisJambes || o.cercles || (o.battements && o.assis)) {
      // Assis par terre, buste incliné vers l'arrière, mains posées derrière : les genoux viennent à la poitrine, repartent.
      const cle = u => { const recul = o.vsit ? lerp(62, 32, u) : o.genoux ? lerp(48, 28, u) : 40, p = assisSol(c, { recul, jambes: J(lerp(o.vsit ? 30 + 62 : 50 + recul - 10, o.vsit ? 78 + 32 : 96 + recul, u) - 0, 4, 0, lerp(o.vsit ? 4 : 14, o.vsit ? 4 : 110, u), 25), lomb: 10 + 10 * u, thor: 6 }); if (o.assisJambes) p.jambes = pareil(J(lerp(50, 96, u) + 40, 4, 0, 4, 25)); c.poserSur(p, V(), AY, ['bassin']); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = o.vsit ? B(4, 60, 0, 8, 90, { doigts: 'detendu' }) : { prise: V(s * 0.2, 0, p.bassin.pos.z - 0.28), pole: V(s * 0.5, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; d.vue = { az: 112, el: 14 };
      if (o.alt) { d.rythme = 'alt'; d.alterne = ['jambes']; d.a = cle(0); d.b = cle(1); delete d.cles; }   // une jambe puis l'autre
      if (o.battements) { d.rythme = 'continu'; d.periode = 1.3; const P0 = cle(0.5); delete d.cles; d.pose = ph => { const p = cloner(P0), sn = Math.sin(ph * 2 * Math.PI); p.jambes = { G: J(94 + 10 * sn, 4, 0, 6, 25), D: J(94 - 10 * sn, 4, 0, 6, 25) }; return p; }; }
      if (o.cercles) { d.rythme = 'continu'; d.periode = 2.6; const P0 = cle(0.5); d.pose = ph => { const p = cloner(P0), w = ph * 2 * Math.PI; p.jambes = pareil(J(118 + 18 * Math.cos(w), 4 + 0 * w, 0, 30, 25)); p.jambes.G.abd = 4 + 14 * Math.sin(w); p.jambes.D.abd = 4 - 14 * Math.sin(w); return p; }; }
      return d;
    }
    // Couché sur le dos : par terre, sur banc décliné ou incliné, ou sur un ballon.
    const ang = o.decline ? -24 : o.incline ? 26 : 0, h = ang ? 0.44 : 0;
    if (ang) fixe.push(...poseFixe(MAT.banc(C, ang)));
    const coucher = jb => { const p = allonge(c, { h, angle: ang, jambes: jb || 'plies', lomb: 0, thor: 0, cou: 6, d: ang < 0 ? -0.35 : ang > 0 ? 0.25 : -0.2 }); if (ang < 0 && !jb) for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { x: s * 0.12, ouv: 4, z: p.bassin.pos.z + 0.5, y0: 0.56, pole: V(0, 1, 0.2) }); return p; };
    if (o.ballon) {
      // Sur un ballon, le bas du dos appuyé : le buste part en extension puis s'enroule.
      const base = { bassin: { pos: V(0, 0.62, 0), rot: qX(-74) }, lombaires: -14, thorax: -8, cou: 6, bras: pareil(brasRepos()), jambes: { G: pied(c, 1, { x: 0.2, ouv: 14, z: 0.52, pole: V(0.2, 1, 0.3) }), D: pied(c, -1, { x: -0.2, ouv: 14, z: 0.52, pole: V(-0.2, 1, 0.3) }) } };
      const cle = u => { const p = cloner(base); p.lombaires = lerp(-14, 22, u); p.thorax = lerp(-8, 20, u); p.cou = lerp(0, 12, u); p.bras = mainsDe(p, ou); return p; };
      d.a = cle(0); d.b = cle(1); fixe.push(pret(sphere(0.3, 0, 0.3, -0.16, C.ballon, 0))); poids(); return d;
    }
    if (o.situp) {
      // Relevé de buste : tout le buste se redresse jusqu'à la position assise ; les fesses ne décollent pas.
      const base = coucher(), hanche = c.tronc(base).hanches.G.clone();
      const cle = u => { const p = cloner(base); p.bassin.rot = qX(lerp(-90 + ang, -18, u)); p.lombaires = 18 * Math.sin(Math.PI * u) + 8 * u; p.thorax = 14 * Math.sin(Math.PI * u) + 4 * u; p.cou = 8 * (1 - u); if (o.torsion) p.torsion = 38 * u; ancrer(c, p, 'femur.G', hanche); p.bras = mainsDe(p, ou); return p; };
      d.cles = [[0, cle(0)], [0.25, cle(0.25)], [0.5, cle(0.5)], [0.75, cle(0.75)], [1, cle(1)]]; poids(); return d;
    }
    if (o.vup || o.toucher) {
      const base = coucher(o.toucher ? J(90, 3, 0, 4, 20) : 'tendues');
      const cle = u => { const p = cloner(base); if (o.toucher) { p.lombaires = 22 * u; p.thorax = 24 * u; p.cou = 12 * u; p.bras = pareil(B(0, lerp(96, 88, u), 0, 6, 180, { doigts: 'detendu' })); } else { p.bassin.rot = qX(lerp(-90, -52, u)); p.lombaires = 14 * u; p.thorax = 10 * u; p.jambes = pareil(J(lerp(0, 92, u), 3, 0, 4, 25)); p.bras = pareil(B(8, lerp(172, 74, u), 0, 6, 180, { doigts: 'detendu' })); c.poserSur(p, V(), AY, ['bassin', 'dos']); } return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; return d;
    }
    if (o.jambes || o.inverse || o.dragon || o.chandelle) {
      const base = coucher(o.inverse ? J(96, 3, 0, 86, 20) : 'tendues');
      if (o.dragon || o.chandelle) {
        // Le corps, tendu, pivote autour des épaules (les mains tiennent le banc derrière la tête, ou soutiennent le dos).
        const cle = u => { const phi = o.chandelle ? 80 + 3 * u : lerp(8, 68, u), p = { bassin: { pos: V(0, 0.4, 0), rot: qX(-90 - phi) }, lombaires: o.chandelle ? 6 : 0, thorax: o.chandelle ? 18 : 4, cou: o.chandelle ? 52 : 24, bras: {}, jambes: pareil(J(o.chandelle ? 6 : 2, 3, 0, 3, 30)) }; ancrer(c, p, 'cou1', V(0, (o.chandelle ? 0 : 0.44) + 0.09, -0.4)); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = o.chandelle ? { prise: t.duBassin(V(s * 0.12, 0.12, -L.dos - 0.02)), pole: V(s * 0.6, -1, 0), paume: V(0, 0, 1).applyQuaternion(t.qBassin), doigts: 'plat' } : { prise: V(s * 0.16, 0.4, -0.72), pole: V(s * 1, 0.3, -0.3), paume: V(-s, 0, 0), doigts: 'barre' }; return p; };
        d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; if (o.chandelle) d.rythme = 'tenue'; else fixe.push(...poseFixe(MAT.banc(C, 0))); d.vue = { az: 112, el: 12 }; return d;
      }
      const cle = u => { const p = cloner(base); if (o.inverse) { p.bassin.rot = qX(-90 + ang - 30 * u); p.lombaires = 16 * u; p.jambes = pareil(J(lerp(96, 112, u), 3, 0, 86, 20)); ancrer(c, p, 'thorax', c.tronc(base) && c.monde('thorax')); } else p.jambes = pareil(J(lerp(ang > 0 ? 8 : 6, 92, u) - ang * 0, 3, 0, 4, 25)); p.bras = ang > 0 ? pareil(B(0, 170, 0, 30, 90)) : mainsDe(p, 'long'); return p; };
      const tA = c.tronc(base), ancreT = c.monde('thorax');
      const cle2 = u => { const p = cloner(base); if (o.inverse) { p.bassin.rot = qX(-90 + ang - 30 * u); p.lombaires = 30 * u; p.jambes = pareil(J(lerp(96, 112, u), 3, 0, 86, 20)); ancrer(c, p, 'thorax', ancreT); } else p.jambes = pareil(J(lerp(6, 92, u), 3, 0, 4, 25)); p.bras = ang > 0 ? pareil(B(0, 170, 0, 30, 90)) : mainsDe(p, 'long'); return p; };
      d.cles = [[0, cle2(0)], [0.5, cle2(0.5)], [1, cle2(1)]]; if (o.leste) d.objets = (info, u, sortie) => poserObjet(MAT.haltere(C, 1), info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5), null, sortie); return d;
    }
    if (o.velo || o.battements || o.ciseaux || o.deadbug) {
      const base = coucher('levees'); d.rythme = 'continu'; d.periode = o.deadbug ? 3.6 : o.velo ? 2 : 1.3;
      d.pose = ph => {
        const p = cloner(base), w = ph * 2 * Math.PI, sn = Math.sin(w), g = 0.5 + 0.5 * sn, dr = 0.5 - 0.5 * sn;
        if (o.velo) { p.lombaires = 20; p.thorax = 22; p.cou = 10; p.torsion = 34 * sn; p.jambes.G = J(lerp(34, 104, dr), 3, 0, lerp(10, 104, dr), 20); p.jambes.D = J(lerp(34, 104, g), 3, 0, lerp(10, 104, g), 20); p.bras = mainsDe(p, 'oreilles'); }
        else if (o.battements) { p.lombaires = 8; p.jambes.G = J(22 + 14 * sn, 3, 0, 4, 30); p.jambes.D = J(22 - 14 * sn, 3, 0, 4, 30); p.bras = mainsDe(p, 'long'); }
        else if (o.ciseaux) { p.lombaires = 8; p.jambes.G = J(30, 6 + 16 * sn, 0, 4, 30); p.jambes.D = J(30, 6 + 16 * sn, 0, 4, 30); p.jambes.G.flex = 30 + 5 * sn; p.jambes.D.flex = 30 - 5 * sn; p.bras = mainsDe(p, 'long'); }
        else { p.jambes.G = J(lerp(90, 14, g), 3, 0, lerp(90, 6, g), 20); p.jambes.D = J(lerp(90, 14, dr), 3, 0, lerp(90, 6, dr), 20); p.bras.D = B(0, lerp(92, 172, g), 0, 6, 90, { doigts: 'detendu' }); p.bras.G = B(0, lerp(92, 172, dr), 0, 6, 90, { doigts: 'detendu' }); }
        return p;
      };
      if (o.balle) d.objets = (info, u, sortie) => sortie.push(pret(sphere(0.12, 0, info.bassin.y + 0.4, info.bassin.z + 0.1, C.ballon, 0)));
      return d;
    }
    if (o.hollow) {
      const cle = u => { const p = coucher('tendues'); p.lombaires = 12 + 2 * u; p.thorax = 10; p.cou = 8; p.jambes = pareil(J(20 + 2 * u, 3, 0, 4, 30)); p.bras = pareil(B(6, 160, 0, 6, 90, { doigts: 'detendu' })); return p; };
      d.a = cle(0); d.b = cle(1); d.rythme = 'tenue'; if (o.leste) d.tenu = [{ t: 'disque', m: 'GD', r: 0.13, axe: AX }]; return d;
    }
    // Crunch : les épaules décollent, le bas du dos reste au sol.
    const base = coucher(o.grenouille ? null : o.jambesHautes ? 'levees' : null);
    if (o.grenouille) for (const [k, s] of COTES) base.jambes[k] = { cheville: V(s * 0.035, 0.05, base.bassin.pos.z + 0.36), pole: V(s * 1, 0.4, 0.15), pied: V(-s * 0.1, 0.1, 1), hautPied: V(s * 1, 0.2, 0) };
    const cle = (u, cote) => { const p = cloner(base); p.lombaires = (ang < 0 ? 30 : 20) * u; p.thorax = 26 * u; p.cou = 6 + 10 * u; if (o.torsion) p.torsion = 32 * u * (cote || 1); if (o.chevilles) { p.lombaires = 12; p.thorax = 12; p.inclinaison = 24 * u * (cote || 1); p.bras = pareil(B(62, 22, 0, 6, 180, { doigts: 'detendu' })); } else p.bras = mainsDe(p, ou); return p; };
    if (o.chevilles || o.alt) { d.rythme = 'alt'; d.pose = (uG, uD) => (uD > 0 ? cle(uD, -1) : cle(uG || 0, 1)); }
    else d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]];
    poids(); return d;
  };

  /* Abdominaux en suspension : pendu à la barre fixe (ou en appui sur une chaise romaine, des barres parallèles),
     les jambes montent. genoux (défaut), jambes (tendues), barre (les pieds vont à la barre), coudes (genoux aux
     coudes), oblique, garhammer, ciseaux, cercles, moulinet, lsit (tenue). Appui : chaise, paralleles. leste. */
  FAM.suspendu = (c, o, C) => {
    const L = c.L, H = 2.42, fixe = [], d = { vue: { az: 62, el: 6 }, tenu: [], fixe };
    let base;
    if (o.chaise || o.paralleles) {
      // En appui : avant-bras sur les accoudoirs (chaise romaine), ou bras tendus sur les barres parallèles.
      const yM = 1.25;
      base = { bassin: { pos: V(0, 1.2, 0), rot: qX(0) }, lombaires: 0, thorax: 0, cou: 0, bras: pareil(o.chaise ? B(0, 6, 0, 88, 90) : B(90, 8, 0, 4, 90)), jambes: pareil(J(6, 2, 0, 8, 30)) };
      const info = c.poser(base), dy = (o.chaise ? 1.28 : yM) - (o.chaise ? info.coudes.G.y : info.prises.G.y);
      base.bassin.pos.y += dy;
      const i2 = c.poser(base);
      if (o.chaise) fixe.push(pret(boite(0.4, 0.75, 0.06, 0, i2.bassin.y + 0.3, i2.bassin.z - L.dos - 0.05, C.banc, 0)), pret(boite(0.09, 0.05, 0.32, 0.3, 1.24, i2.coudes.G.z + 0.14, C.banc, 0)), pret(boite(0.09, 0.05, 0.32, -0.3, 1.24, i2.coudes.G.z + 0.14, C.banc, 0)), pret(seg(V(0, 0, i2.bassin.z - 0.2), V(0, 1.9, i2.bassin.z - 0.2), 0.035, C.cadre, 0.5)), pret(boite(0.6, 0.03, 0.7, 0, 0.015, 0, C.cadre, 0.5)));
      else fixe.push(...poseFixe(MAT.paralleles(C, i2.prises.G.y - 0.01, Math.abs(i2.prises.G.x)), V(0, 0, i2.prises.G.z)));
    } else { base = suspendu(c, { H, ecart: 0.3 }); fixe.push(...poseFixe(MAT.barreFixe(C, H))); }
    const curl = k => { const p = cloner(base); if (!o.chaise && !o.paralleles) { p.bassin.rot = qX(-34 * k); p.lombaires = 26 * k; const t0 = c.tronc(base), e0 = t0.epaules.G.clone(); const t = c.tronc(p); p.bassin.pos.add(e0.sub(t.epaules.G)); } else p.lombaires = 14 * k; return p; };
    const cle = u => {
      if (o.barre) { const p = curl(u); p.jambes = pareil(J(lerp(8, 128, u), 2, 0, 5, 20)); return p; }
      if (o.coudes) { const p = curl(u * 0.9); p.jambes = pareil(J(lerp(8, 128, u), 4, 0, lerp(12, 118, u), 20)); return p; }
      if (o.garhammer) { const p = curl(u * 0.7); p.jambes = pareil(J(lerp(88, 132, u), 3, 0, lerp(92, 110, u), 20)); return p; }
      if (o.jambes) { const p = curl(u * 0.25); p.jambes = pareil(J(lerp(8, 94, u), 2, 0, 5, 25)); return p; }
      if (o.oblique) { const p = curl(u * 0.4); p.torsion = -34 * u; p.jambes = pareil(J(lerp(8, 100, u), 3, 0, lerp(12, 104, u), 25)); return p; }
      const p = curl(u * 0.35); p.jambes = pareil(J(lerp(8, o.poitrine ? 122 : 98, u), 3, 0, lerp(12, o.poitrine ? 118 : 100, u), 25)); return p;
    };
    if (o.lsit) { d.a = cle(1); const b = cle(1); b.jambes = pareil(J(96, 2, 0, 5, 25)); d.a.jambes = pareil(J(94, 2, 0, 5, 25)); d.b = b; d.rythme = 'tenue'; }
    else if (o.ciseaux || o.cercles || o.moulinet) {
      d.rythme = 'continu'; d.periode = o.ciseaux ? 1.3 : 2.6; const P0 = curl(0.2);
      d.pose = ph => { const p = cloner(P0), w = ph * 2 * Math.PI, sn = Math.sin(w), cs = Math.cos(w); if (o.ciseaux) { p.jambes.G = J(40 + 26 * sn, 3, 0, 5, 25); p.jambes.D = J(40 - 26 * sn, 3, 0, 5, 25); } else if (o.cercles) { p.jambes = pareil(J(84 + 16 * cs, 3, 0, 96, 25)); p.torsion = 26 * sn; } else { p.jambes = pareil(J(80, 3, 0, 5, 25)); p.torsion = 40 * sn; p.jambes.G.abd = 3 + 22 * sn; p.jambes.D.abd = 3 - 22 * sn; } return p; };
    } else d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]];
    if (o.leste) d.objets = (info, u, sortie) => poserObjet(MAT.haltere(C, 1), info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5).add(V(0, -0.02, 0.04)), null, sortie);
    return d;
  };

  /* Gainage et exercices en appui sur les mains ou les avant-bras.
     (défaut) planche sur les avant-bras, tenue ; mains (bras tendus) ; cote (planche latérale ; abduction, coquille,
     hal) ; ours ; birddog (à quatre pattes ou en planche : bras et jambe opposés) ; scie ; epaule (touche d'épaule) ;
     grimpeur ; ballon ; leste ; orteils (les hanches montent, une main va toucher le pied opposé) ; pike (pieds dans
     des sangles, des anneaux ou sur un ballon : les hanches montent) ; rollout (roue abdominale ; barre) ; renegat
     (rowing en planche) ; crabe ; chienHaut ; superman ; nageur ; trx. */
  FAM.planche = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 80, el: 12 }, tenu: [], fixe };
    const mainsSol = (p, ecart, zM, y) => { for (const [k, s] of COTES) p.bras[k] = { prise: V(s * (ecart || 0.24), (y || 0) + 0.008, zM), pole: V(s * 0.5, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; };
    const coudesSol = (p, t, y) => { for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.1, (y || 0) + 0.035, t.epaules[k].z + 0.27), pole: V(s * 0.2, -1, -0.25), paume: V(0, -1, 0), dirMain: V(-s * 0.15, 0, 1), doigts: 'plat' }; };
    if (o.cote) {
      // Planche latérale, côté droit vers le sol : appui sur l'avant-bras (ou la main, bras tendu) et le bord du pied
      // (ou le genou). Le corps est une ligne droite ; son inclinaison est réglée pour que l'épaule soit au-dessus du coude.
      const hEp = o.mains ? 0.02 + 0.97 * (L.bras + L.avantBras) : L.bras * 0.98 + 0.045;
      const cle = u => {
        const incl = o.hanche ? lerp(13, -9, u) : 0, genoux = !!o.coquille;
        const p = { bassin: { pos: V(), rot: new Quat() }, lombaires: 0, thorax: 0, cou: 0, inclinaison: incl, bras: pareil(brasRepos()), jambes: {} };
        p.jambes.D = genoux ? J(28, 0, 0, 88, 10) : J(3, 0, 0, 4, 5);
        p.jambes.G = genoux ? J(28, 34 * u, 28 * u, 88, 10) : J(3, o.abduction ? 36 * u : 2, 0, 4, 5);
        let phi = 14, info;
        for (let n = 0; n < 7; n++) {
          p.bassin.rot = qZ(90 - phi); p.bassin.pos.set(0, 0, 0);
          info = c.poser(p);
          const appui = genoux ? info.genoux.D : info.chevilles.D, y0 = genoux ? 0.065 : 0.05;
          p.bassin.pos.set(-appui.x, y0 - appui.y, -appui.z);
          const ep = info.epaules.D, portee = Math.hypot(ep.x - appui.x, ep.y - appui.y) || 1;
          phi += Math.asin(borne((hEp - (ep.y + y0 - appui.y)) / portee, -0.4, 0.4)) * 180 / Math.PI;
        }
        // À genoux : la jambe d'appui repose de tout son long (le pied ne passe pas sous le sol).
        if (genoux) c.poserSur(p, V(), AY, ['jambe', 'pied']);
        const t = c.tronc(p), e = t.epaules.D;
        p.bras.D = o.mains ? { prise: V(e.x - 0.02, 0.008, e.z + 0.03), pole: V(0.3, 0.2, -1), paume: V(0, -1, 0), dirMain: V(-0.3, 0, 1), doigts: 'plat' }
          : { prise: V(e.x + 0.02, 0.035, e.z + 0.27), pole: V(-0.2, -1, -0.3), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
        p.bras.G = o.haut ? B(90, 168, 0, 6, 90, { doigts: 'plat' }) : o.hal ? B(90, lerp(8, 92, u), 0, 8, 90) : B(90, 8, 0, 34, 150, { doigts: 'detendu' });
        return p;
      };
      d.a = cle(0); d.b = cle(1); d.vue = { az: 0, el: 16 };
      if (!(o.abduction || o.coquille || o.hanche || o.hal)) d.rythme = 'tenue';
      if (o.hal) d.tenu = [{ t: 'haltere', m: 'G' }];
      return d;
    }
    if (o.birddog && !o.planche || o.ours || o.trx) {
      const base = quatrePattes(c, {});
      if (o.ours) { const p = cloner(base); p.bassin.pos.y += 0.06; for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { x: s * 0.1, z: c.tronc(base).hanches.G.z - 0.42, pointe: 70, ouv: 0, pole: V(0, -0.4, 1) }); const q = cloner(p); q.bassin.pos.y += 0.008; d.a = p; d.b = q; d.rythme = 'tenue'; return d; }
      const A = cloner(base), Z = cloner(base);
      Z.jambes.D = J(-4, 6, 0, 6, 30); Z.bras.G = B(0, 172, 0, 6, 90, { doigts: 'detendu' });
      if (o.trx) { A.jambes.D = J(40, 6, 0, 60, 30); Z.jambes.D = J(-4, 6, 0, 6, 30); d.objets = (info, u, sortie) => sortie.push(pret(seg(V(info.chevilles.D.x, 2.4, info.chevilles.D.z + 0.3), info.chevilles.D, 0.008, C.sangle, 0))); }
      d.a = A; d.b = Z; d.vue = { az: 110, el: 12 }; return d;
    }
    if (o.crabe || o.chienHaut || o.superman || o.nageur) {
      if (o.crabe) {
        // Table inversée : assis, mains derrière, pieds à plat ; les hanches montent à l'horizontale.
        const cle = u => { const p = { bassin: { pos: V(0, lerp(0.16, 0.5, u), 0), rot: qX(lerp(-28, -84, u)) }, lombaires: lerp(8, -4, u), thorax: 0, cou: lerp(-10, 20, u), bras: {}, jambes: {} }; const t = c.tronc(p); for (const [k, s] of COTES) { p.jambes[k] = pied(c, s, { x: s * 0.13, ouv: 6, z: 0.55, pole: V(0, 1, 0.2) }); p.bras[k] = { prise: V(s * 0.22, -0.008, -0.42), pole: V(s * 0.2, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; } return p; };
        d.a = cle(0.85); d.b = cle(1); d.rythme = 'tenue'; d.vue = { az: 110, el: 12 }; return d;
      }
      if (o.chienHaut) {
        // Chien tête en haut : à plat ventre, bras tendus, le buste se redresse, hanches près du sol.
        const cle = u => { const p = { bassin: { pos: V(0, 0.15, 0), rot: qX(lerp(88, 62, u)) }, lombaires: lerp(-4, -30, u), thorax: lerp(-2, -16, u), cou: lerp(-10, -20, u), bras: pareil(brasRepos()), jambes: pareil(J(lerp(-2, -24, u), 4, 0, 4, 55)) }; c.poserSur(p, V(), AY, ['cuisse', 'jambe', 'pied', 'bassin']); const t = c.tronc(p); mainsSol(p, 0.2, t.hanches.G.z + 0.5); return p; };
        d.a = cle(0.85); d.b = cle(1); d.rythme = 'tenue'; d.vue = { az: 70, el: 12 }; return d;
      }
      // Superman : à plat ventre, bras devant ; bras, buste et jambes se soulèvent. Nageur : en alternant.
      const base = aPlatVentre(c, { h: 0, angle: 0, jambes: J(0, 5, 0, 3, 55), cou: -8 });
      const cle = (u, g, dr) => { const p = cloner(base); p.lombaires = -3 - 14 * u; p.thorax = -2 - 10 * u; p.cou = -8 - 10 * u; p.jambes.G = J(-18 * (g == null ? u : g), 5, 0, 3, 55); p.jambes.D = J(-18 * (dr == null ? u : dr), 5, 0, 3, 55); p.bras.G = B(8, 172 + 14 * (dr == null ? u : dr), 0, 6, 180, { doigts: 'plat' }); p.bras.D = B(8, 172 + 14 * (g == null ? u : g), 0, 6, 180, { doigts: 'plat' }); return p; };
      if (o.nageur) { d.rythme = 'continu'; d.periode = 1.4; d.pose = ph => { const sn = Math.sin(ph * 2 * Math.PI); return cle(0.6, 0.5 + 0.5 * sn, 0.5 - 0.5 * sn); }; }
      else { d.a = cle(0); d.b = cle(1); }
      d.vue = { az: 70, el: 14 }; return d;
    }
    if (o.rollout) {
      // À genoux, les mains sur la roue (ou la barre) : elle roule vers l'avant, les cuisses s'inclinent, le corps
      // s'allonge presque à l'horizontale, puis revient. La roue est placée là où les bras tendus l'atteignent.
      const hR = o.barre ? 0.225 : 0.1, R = 0.955 * (L.bras + L.prise);
      const cle = u => {
        const a = lerp(2, 50, u), b = lerp(76, 96, u);
        const p = { bassin: { pos: V(0, 0.5, 0), rot: qX(b) }, lombaires: lerp(8, -2, u), thorax: lerp(8, 0, u), cou: lerp(-30, -14, u), bras: pareil(brasRepos()), jambes: pareil(J(b - a, 5, 0, 90 - a, 62)) };
        c.poserSur(p, V(), AY, ['jambe', 'pied']);
        const info = c.poser(Object.assign(cloner(p), { bras: pareil(B(0, lerp(40, 150, u), 0, 4, 180)) }));
        for (const [k, s] of COTES) {
          const e = info.epaules[k], dy = Math.min(R - 0.01, Math.max(0, e.y - hR));
          p.bras[k] = { prise: V(s * (o.barre ? 0.26 : 0.13), hR, e.z + Math.sqrt(R * R - dy * dy)), pole: V(s * 0.6, 0.5, -1), paume: V(0, -1, -1), doigts: 'barre' };
        }
        return p;
      };
      d.cles = [0, 0.25, 0.5, 0.75, 1].map(u => [u, cle(u)]);
      if (o.barre) d.tenu = [{ t: 'barre', l: 1.6, d: 0.225 }]; else d.objets = (info, u, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5); sortie.push(pret(cyl(0.1, 0.035, m.x, hR, m.z, C.fonte, 0))); sortie.push(pret(cyl(0.014, 0.36, m.x, hR, m.z, C.metal, 1))); };
      d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.pike || o.orteils) {
      // Les hanches montent en V renversé : pieds dans des sangles, sur un ballon, ou au sol (une main va au pied opposé).
      const yP = o.pike ? (o.ballon ? 0.5 : 0.28) : 0;
      const pl = planche(c, { yPieds: yP, zPieds: -1.15 });
      const haut0 = pl(yP + 0.016 + 0.95 * (L.bras + L.avantBras) * (yP ? 0.75 : 1) + (yP ? 0.12 : 0)), zM = haut0.epaules.G.z + 0.03;
      const cle = u => { const a = lerp(yP ? 6 : 12, 58, u), p = { bassin: { pos: V(), rot: qX(90 - a + (yP ? 0 : 0)) }, lombaires: 10 * u, thorax: 0, cou: lerp(-20, 20, u), bras: pareil(brasRepos()), jambes: {} }; p.bassin.rot = qX(lerp(88, 150, u)); const t0 = c.tronc(p); mainsSol(p, 0.22, zM); const portee = 0.95 * (L.bras + L.avantBras); const ep = t0.epaules.G; p.bassin.pos.add(V(0, Math.sqrt(Math.max(0.01, portee * portee - Math.pow(0.22 - 0.165, 2) - 0.0009)) - ep.y, zM - 0.03 - ep.z)); for (const [k, s] of COTES) p.jambes[k] = J(lerp(4, 96, u), 3, 0, 4, lerp(60, 30, u)); if (o.orteils && u > 0) {
          // La main droite quitte le sol et va vers le pied gauche, aussi loin que le bras le permet.
          const info = c.poser(p), e = info.epaules.D, v = info.chevilles.G.clone().add(V(0, 0.05, 0.1)).sub(e), R = 0.93 * (L.bras + L.avantBras + L.main);
          if (v.length() > R) v.multiplyScalar(R / v.length());
          const fin = e.clone().add(v);
          p.bras.D = { prise: V(lerp(-0.22, fin.x, u), lerp(0.008, fin.y, u) + 0.1 * Math.sin(Math.PI * u), lerp(zM, fin.z, u)), pole: V(-0.5, 0.2, -1), paume: V(0, -1, 0), dirMain: unite(V(-Math.sin(Math.PI * u), -0.2 * u, lerp(1, -1, u))), doigts: 'plat' };
        }
        return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]];
      if (o.ballon) d.objets = (info, u, sortie) => sortie.push(pret(sphere(0.25, 0, 0.25, info.chevilles.G.z + 0.02, C.ballon, 0)));
      else if (o.pike) d.objets = (info, u, sortie) => { for (const k of ['G', 'D']) sortie.push(pret(seg(V(info.chevilles[k].x, 2.4, info.chevilles[k].z + 0.25), info.chevilles[k], 0.008, C.sangle, 0))); };
      return d;
    }
    // Planche ventrale : sur les avant-bras (ou les mains), corps aligné des talons à la tête.
    const yM = o.ballon ? 0.5 : 0, surMains = o.mains || o.epaule || o.grimpeur || o.renegat;
    const pl = planche(c, { ecartPieds: o.epaule || o.renegat ? 0.22 : 0.09 });
    const hEp = surMains ? 0.016 + 0.95 * (L.bras + L.avantBras) + (o.renegat ? 0.1 : 0) : yM + L.bras * 0.97 + 0.06;
    const base = pl(hEp), tB = c.tronc(base), zM = tB.epaules.G.z + 0.03;
    if (surMains) mainsSol(base, 0.22, zM, o.renegat ? 0.1 : 0); else coudesSol(base, tB, yM);
    if (o.ballon) fixe.push(pret(sphere(0.25, 0, 0.25, tB.epaules.G.z + 0.2, C.ballon, 0)));
    if (o.grimpeur) {
      // Les hanches plus hautes que dans la planche (le buste bascule autour des épaules, les pieds se rapprochent) :
      // le genou passe sous le corps sans toucher le sol. Un genou vient vers la poitrine, puis l'autre.
      c.tronc(base); const cou0 = c.monde('cou1'), haut = cloner(base);
      haut.bassin.rot = qX(18).multiply(base.bassin.rot); haut.lombaires = 8; ancrer(c, haut, 'cou1', cou0);
      for (const k of ['G', 'D']) haut.jambes[k].cheville.z += 0.13;
      const hz = c.tronc(haut).hanches.G.z;
      d.rythme = 'continu'; d.periode = 0.9;
      d.pose = ph => {
        const p = cloner(haut), sn = Math.sin(ph * 2 * Math.PI);
        for (const [k, s] of COTES) {
          const w = lisse(0.5 + 0.5 * (k === 'G' ? sn : -sn)), j0 = haut.jambes[k];
          p.jambes[k] = { cheville: V(j0.cheville.x, j0.cheville.y + 0.03 * w + 0.09 * Math.sin(Math.PI * w), lerp(j0.cheville.z, hz + 0.02, w)), pole: V(0, -0.3, 1), pied: j0.pied.clone(), hautPied: j0.hautPied.clone(), orteils: 60 };
        }
        return p;
      };
      return d;
    }
    if (o.epaule) { d.rythme = 'alt'; d.pose = (uG, uD) => { const p = cloner(base), t = c.tronc(p); if (uG > 0) p.bras.G = mel(base.bras.G, { prise: t.epaules.D.clone().add(V(0, -0.02, 0.07)), pole: V(1, 0.2, -0.6), paume: V(0, 0.4, -1), dirMain: V(-1, 0.3, 0), doigts: 'plat' }, uG); if (uD > 0) p.bras.D = mel(base.bras.D, { prise: t.epaules.G.clone().add(V(0, -0.02, 0.07)), pole: V(-1, 0.2, -0.6), paume: V(0, 0.4, -1), dirMain: V(1, 0.3, 0), doigts: 'plat' }, uD); return p; }; return d; }
    if (o.renegat) { d.rythme = 'alt'; d.tenu = [{ t: o.kb ? 'kb' : 'haltere', m: 'GD' }]; d.pose = (uG, uD) => { const p = cloner(base), t = c.tronc(p); for (const [k, s] of COTES) { const u = k === 'G' ? uG : uD; p.bras[k] = { prise: mel(V(s * 0.22, 0.1, zM), t.duThorax(V(s * 0.21, -0.3, 0.1)), u || 0), pole: V(s * 0.5, 0.6, -1), paume: V(-s, 0, 0), dirMain: undefined, doigts: 'barre' }; } return p; }; return d; }
    if (o.scie) { d.rythme = 'continu'; d.periode = 2.4; d.pose = ph => { const p = cloner(base), dz = 0.08 * Math.sin(ph * 2 * Math.PI); p.bassin.pos.z += dz; for (const k of ['G', 'D']) { p.jambes[k] = cloner(base.jambes[k]); p.jambes[k].cheville.z += dz * 0.92; } return p; }; return d; }
    if (o.birddog) { const Z = cloner(base); Z.jambes.D = J(-8, 4, 0, 4, 40); Z.bras.G = B(0, 172, 0, 6, 90, { doigts: 'detendu' }); d.a = base; d.b = Z; return d; }
    const q = cloner(base); q.thorax = 1.5; d.a = base; d.b = q; d.rythme = 'tenue';
    if (o.leste) d.objets = (info, u, sortie) => { const b = info.bassin.clone().add(V(0, L.dos + 0.03, 0.12)); sortie.push(pret(cyl(0.2, 0.04, b.x, b.y, b.z, C.fonte, 0, DEBOUT_Q))); };
    return d;
  };
  /* ---------- Pompes et dips ---------- */
  /* Appui sur les mains et les pieds, hanches fléchies (pompe en pike, chien tête en bas). Les pieds restent posés
     (yPieds, à `portee` derrière les mains) ; le bassin bascule jusqu'à ce que l'épaule soit à la distance voulue du
     poignet. Renvoie (distance épaule-poignet, flexion des hanches) => pose. */
  function appuiPike(c, o) {
    return (dist, pike) => {
      const p = { bassin: { pos: V(), rot: new Quat() }, lombaires: o.lomb == null ? 6 : o.lomb, thorax: o.thor == null ? 4 : o.thor, cou: o.cou == null ? 10 : o.cou, bras: pareil(brasRepos()), jambes: pareil(J(pike, 2, 0, o.genou || 3, o.pointe == null ? 28 : o.pointe)) };
      const poser = th => {
        p.bassin.rot = qX(th); p.bassin.pos.set(0, 1, 0);
        c.poserSur(p, V(0, o.yPieds || 0, 0), AY, ['pied']);
        const info = c.poser(p); p.bassin.pos.z += -o.portee - info.orteils.G.z;
        return info.epaules.G.clone().add(V(0, 0, -o.portee - info.orteils.G.z)).distanceTo(o.poignet) - dist;
      };
      // La moins renversée des solutions : en basculant depuis l'horizontale, la première fois que la distance est bonne.
      poser(premierZero(poser, 70, 178, 6));
      return p;
    };
  }
  /* Pompes : le corps droit (des talons, ou des genoux, à la tête), les mains en appui, les coudes plient.
     Mains : large, serre, diamant, triceps (coudes au corps), inverse (doigts vers les pieds), doigts, jointures,
     poignees, hal (mains sur des haltères), profonde (barres basses : la poitrine descend sous les mains), anneaux,
     pseudo (pseudo-planche : mains à la taille). Appuis : genoux, incline (mains sur un banc), decline (pieds sur un
     banc). Variantes : archer, unbras, claquement, jack, cobra (pompe hindoue), negatif, leste, elas, scapulaire,
     birddog, superman, poignets ; pike (hanches hautes ; banc : pieds surélevés ; entre : mains sur deux bancs) ;
     equilibre (en équilibre contre un mur) ; planche (pieds décollés, corps à l'horizontale). */
  FAM.pompe = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 62, el: 12 }, tenu: [], fixe };
    const A = L.bras + L.avantBras, Ap = L.bras + L.prise;
    const aPlat = (s, x, y, z, dir, pole, doigts) => ({ prise: V(s * x, y + 0.008, z), pole, paume: V(0, -1, 0), dirMain: dir || V(0, 0, 1), doigts: doigts || 'plat' });
    const epX = c.tronc(debout(c, {})).epaules.G.x;

    if (o.equilibre) {
      // En équilibre sur les mains, les talons contre un mur : les coudes plient, la tête descend vers le sol.
      const haut = Math.sqrt(Math.pow(0.97 * A, 2) - Math.pow(0.26 - epX, 2)) + L.creux, tete0 = c.tronc(debout(c, {}));
      const cle = u => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(176) }, lombaires: -3, thorax: -2, cou: lerp(-6, -16, u), bras: {}, jambes: pareil(J(-2, 2, 0, 3, 40)) };
        const t = c.tronc(p); p.bassin.pos.y += lerp(haut, 0.3, u) - t.epaules.G.y; p.bassin.pos.z += lerp(0, 0.05, u) - t.epaules.G.z;
        for (const [k, s] of COTES) p.bras[k] = aPlat(s, 0.26, 0, -L.main, V(0, 0, -1), V(s * 0.7, 0.2, lerp(-0.2, -1, u)));
        return p;
      };
      d.a = cle(0); d.b = cle(1);
      const info = c.poser(cle(0)); fixe.push(...poseFixe(MAT.mur(C, Math.max(info.chevilles.G.z, info.orteils.G.z) + 0.1, 1.2, 2.3)));
      d.vue = { az: 122, el: 6 }; return d;
    }
    if (o.planche) {
      // Planche : corps à l'horizontale, pieds décollés, bras tendus penchés vers l'avant ; les coudes plient.
      const cle = u => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(92) }, lombaires: 2, thorax: 6, cou: -24, bras: {}, jambes: pareil(J(-4, 3, 0, 3, 50)) };
        const t = c.tronc(p), h = lerp(0.74 * A, 0.3 * A, u); p.bassin.pos.y += h + L.creux - t.epaules.G.y; p.bassin.pos.z += -t.epaules.G.z;
        const recul = Math.sqrt(Math.max(0.01, Math.pow(0.96 * A, 2) - 0.74 * A * 0.74 * A)) * lerp(1, 0.75, u);
        for (const [k, s] of COTES) p.bras[k] = aPlat(s, 0.24, 0, -recul + L.main, V(s * 0.7, 0, 0.5), V(s * 0.5, 0.3, -1));
        return p;
      };
      d.a = cle(0); d.b = cle(1); d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.pike) {
      // Hanches hautes, en V renversé : les coudes plient, la tête descend vers le sol entre les mains.
      const yM = o.entre ? 0.44 : 0, yP = o.banc ? 0.44 : 0, portee = o.banc ? 0.78 : o.entre ? 1.0 : 0.92;
      const ap = appuiPike(c, { yPieds: yP, portee, poignet: V(0.26, yM + L.creux + 0.008, -L.main), cou: 16 });
      const bas = o.entre ? 0.42 * A : o.banc ? 0.64 * A : 0.56 * A;
      const cle = u => { const p = ap(lerp(0.965 * A, bas, u), lerp(80, 92, u)); p.cou = lerp(16, 2, u); for (const [k, s] of COTES) p.bras[k] = aPlat(s, 0.26, yM, 0, V(s * 0.15, 0, 1), V(s * 0.85, 0.3, lerp(0.2, -0.3, u))); return p; };
      d.cles = [0, 0.33, 0.66, 1].map(u => [u, cle(u)]);
      if (o.banc) fixe.push(...poseFixe(MAT.banc(C, 0), V(0.3, 0, -portee - 0.08), qY(90)));
      if (o.entre) for (const s of [1, -1]) fixe.push(...poseFixe(MAT.banc(C, 0), V(s * 0.31, 0, 0.3)));
      d.vue = { az: 68, el: 10 }; return d;
    }

    // Pompe classique et ses variantes.
    const yM = o.incline ? 0.44 : o.anneaux ? 0.2 : o.profonde ? 0.22 : o.poignees ? 0.11 : o.hal ? 0.062 : o.jointures ? 0.032 : o.doigts ? 0.05 : 0;
    const yP = o.decline ? 0.44 : 0;
    const ecart = o.archer ? 0.46 : o.large ? 0.4 : o.diamant ? 0.045 : o.serre || o.triceps ? 0.17 : o.unbras ? 0.07 : 0.26;
    const ferme = !!(o.poignees || o.hal || o.anneaux || o.jointures || o.profonde);   // main refermée, dans l'axe de l'avant-bras
    const recul = o.pseudo ? 0.27 : 0;
    const pl = planche(c, { yPieds: yP, genoux: !!o.genoux, ecartPieds: o.unbras ? 0.3 : 0.09 });
    const portee = 0.965 * (ferme ? Ap : A), dx = ecart - epX, yAppui = yM + (ferme ? 0 : L.creux + 0.008);
    const hHaut = yAppui + Math.sqrt(Math.max(0.01, portee * portee - dx * dx - recul * recul));
    const zEp = pl(hHaut).epaules.G.z, zM = zEp - recul + (ferme ? 0 : L.main);
    // Le bas : la poitrine arrive près du sol (ou du support ; plus bas entre des appuis surélevés).
    // Mains sous la poitrine (diamant, serrée, un bras) : la poitrine s'arrête sur les mains.
    const cible = o.incline ? yM + 0.07 : o.profonde ? yM - 0.1 : o.poignees || o.hal || o.anneaux ? yM - 0.03 : o.diamant ? yM + 0.16 : o.unbras ? yM + 0.11 : o.serre || o.triceps ? yM + 0.07 : yM + 0.05;
    const basPoitrine = h => -c.extreme(pl(h), V(0, -1, 0), o.incline ? ['thorax'] : ['thorax', 'abdomen']) - cible;
    const hBas = o.scapulaire ? hHaut - 0.05 : o.poignets ? hHaut : Math.max(zeroDe(basPoitrine, hHaut - 0.2, hHaut - 0.3, 0.12), yAppui + 0.1);
    const pole = s => (o.large || o.archer ? V(s * 1, 0.5, -0.25) : o.serre || o.triceps || o.pseudo || o.unbras ? V(s * 0.3, 0.6, -1) : o.diamant ? V(s * 0.6, 0.6, -0.8) : V(s * 0.75, 0.6, -0.7));
    const dir = s => (o.diamant ? V(-s * 0.75, 0, 0.66) : o.inverse ? V(s * 0.4, 0, -1) : o.pseudo ? V(s * 0.85, 0, -0.4) : o.large || o.archer ? V(s * 0.25, 0, 1) : V(0, 0, 1));
    const main = (s, u) => (ferme ? { prise: V(s * ecart, yM, zM), pole: pole(s), paume: o.jointures || !o.hal ? V(-s, 0, 0) : V(-s, 0, 0), doigts: o.jointures ? 'poing' : 'barre' }
      : aPlat(s, ecart, yM, zM, dir(s), pole(s), o.doigts ? 'detendu' : 'plat'));
    const cle = (u, plus) => {
      const p = pl(lerp(hHaut, hBas, u));
      for (const [k, s] of COTES) p.bras[k] = main(s, u);
      if (o.scapulaire) for (const k of ['G', 'D']) p.bras[k].avance = lerp(10, -10, u);
      if (o.jack) for (const [k, s] of COTES) { p.jambes[k].cheville.x = s * lerp(0.09, 0.34, u); p.jambes[k].cheville.z += 0.05 * u; }
      if (o.unbras) p.bras.D = B(40, -34, 0, 96, 150, { doigts: 'detendu' });
      if (plus) plus(p);
      return p;
    };
    // Le matériel.
    if (o.incline) fixe.push(...poseFixe(MAT.banc(C, 0), V(0.3, 0, zM + 0.07), qY(90)));
    if (o.decline) fixe.push(...poseFixe(MAT.banc(C, 0), V(0.3, 0, -1.22 - 0.06), qY(90)));
    if (o.hal) d.tenu = [{ t: 'haltere', m: 'GD' }];
    if (o.poignees) for (const s of [1, -1]) { fixe.push(pret(cyl(0.015, 0.17, s * ecart, yM, zM, C.metal, 1, LONG_Z))); for (const z of [-0.075, 0.075]) fixe.push(pret(boite(0.1, yM, 0.018, s * ecart, yM / 2, zM + z, C.cadre, 0.5))); }
    if (o.profonde) for (const s of [1, -1]) { fixe.push(pret(cyl(0.017, 0.5, s * ecart, yM, zM, C.metal, 1, LONG_Z))); for (const z of [-0.22, 0.22]) { fixe.push(pret(boite(0.03, yM, 0.03, s * ecart, yM / 2, zM + z, C.cadre, 0.5))); fixe.push(pret(boite(0.22, 0.02, 0.04, s * ecart, 0.01, zM + z, C.cadre, 0.5))); } }
    if (o.anneaux) d.tenu = [{ t: 'sangle', de: V(ecart, 2.6, zM), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, 2.6, zM), m: 'D', bout: 'anneau' }];
    const dos = (info, dy, dz) => info.epaules.G.clone().add(info.epaules.D).multiplyScalar(0.5).add(V(0, dy, dz).applyQuaternion(info.qThorax));
    if (o.leste) {
      const info0 = c.poser(cle(0)), m0 = dos(info0, -0.14, 0), n0 = V(0, 0, -1).applyQuaternion(info0.qThorax); let haut = 0.08;
      c.peauPosee(['dos', 'thorax', 'epaule'], (x, y, z) => { const v = V(x - m0.x, y - m0.y, z - m0.z), h = v.dot(n0); if (h > haut && v.sub(n0.clone().multiplyScalar(h)).length() < 0.15) haut = h; });
      d.objets = (info, u, sortie) => { const b = dos(info, -0.14, -haut - 0.022); poserObjet([cyl(0.2, 0.04, 0, 0, 0, C.fonte, 0, LONG_Z)], b, info.qThorax, sortie); };
    }
    if (o.elas) d.objets = (info, u, sortie) => { const g = dos(info, -0.03, -L.dos - 0.01).add(V(0.17, 0, 0)), dr = g.clone().setX(-0.17); sortie.push(pret(seg(info.prises.G, g, 0.008, C.elastique, 0)), pret(seg(g, dr, 0.008, C.elastique, 0)), pret(seg(dr, info.prises.D, 0.008, C.elastique, 0))); };

    if (o.archer) {
      // Un bras plie et porte le corps de son côté, l'autre reste tendu ; puis l'inverse.
      d.rythme = 'alt'; d.periode = 5.2;
      d.pose = (uG, uD) => { const u = Math.max(uG, uD), p = cle(0.92 * u); p.bassin.pos.x += 0.2 * (uG - uD); p.inclinaison = 0; for (const [k, s] of COTES) p.bras[k].pole = (k === 'G' ? uG : uD) > 0 ? V(s * 0.5, 0.2, -1) : V(s * 1, 0.6, 0); return p; };
      d.vue = { az: 40, el: 16 }; return d;
    }
    if (o.claquement || o.superman || o.negatif) {
      const haut = cle(0), bas = cle(1);
      if (o.negatif) { d.rythme = 'boucle'; d.periode = 4.6; d.cles = [[0, haut], [0.08, haut], [0.66, bas], [0.76, bas], [0.92, haut], [1, haut]]; return d; }
      // Poussée explosive : les mains quittent le sol (elles claquent, ou les bras partent vers l'avant), puis on se reçoit.
      const vol = cle(0, p => {
        p.bassin.pos.y += o.superman ? 0.2 : 0.1;
        const t = c.tronc(p);
        if (o.superman) { p.bras = pareil(B(8, 168, 0, 6, 180, { doigts: 'plat' })); for (const [k, s] of COTES) { p.jambes[k] = cloner(p.jambes[k]); p.jambes[k].cheville.y += 0.22; } }
        else for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.025, t.epaules.G.y - 0.36, zM - 0.02), pole: V(s * 1, 0.2, -0.4), paume: V(-s, 0, 0), dirMain: V(0, -0.2, 1), doigts: 'plat' };
      });
      d.rythme = 'boucle'; d.periode = 3.2; d.cles = [[0, haut], [0.1, haut], [0.4, bas], [0.47, bas], [0.6, haut], [0.72, vol], [0.86, haut], [1, haut]];
      return d;
    }
    if (o.cobra) {
      // Pompe hindoue : du V renversé, la poitrine plonge au ras du sol entre les mains et remonte, hanches basses.
      const ras = cle(1), orteils = c.poser(ras).orteils.G.z;
      const ap = appuiPike(c, { yPieds: 0, portee: -orteils, poignet: V(0.26, L.creux + 0.008, zM - L.main), cou: 12 });
      const v = ap(0.965 * A, 70); for (const [k, s] of COTES) v.bras[k] = main(s, 0);
      const chien = { bassin: { pos: V(0, 0.2, 0), rot: qX(62) }, lombaires: -30, thorax: -16, cou: -18, bras: {}, jambes: {} };
      const t = c.tronc(chien); chien.bassin.pos.add(V(0, yAppui + portee - 0.01 - t.epaules.G.y, zEp + 0.04 - t.epaules.G.z));
      for (const [k, s] of COTES) { chien.bras[k] = main(s, 0); chien.jambes[k] = cloner(ras.jambes[k]); }
      // Hanches basses, le corps avance : les pieds suivent de quelques centimètres (les jambes restent tendues).
      { const info = c.poser(chien); for (const k of ['G', 'D']) chien.jambes[k].cheville.z += info.chevilles[k].z - chien.jambes[k].cheville.z; }
      // Les pieds de la planche et ceux du V renversé ne sont pas au même endroit : tout est ramené aux mêmes appuis.
      for (const [k, s] of COTES) { const info = c.poser(v); v.jambes = Object.assign({}, v.jambes, { [k]: { cheville: info.chevilles[k].clone(), pole: V(0, -1, 0.15), pied: info.pieds[k].pied.clone(), hautPied: info.pieds[k].hautPied.clone(), orteils: 40 } }); }
      const zV = v.jambes.G.cheville.z, zR = ras.jambes.G.cheville.z;
      for (const p of [ras, chien]) { p.bassin.pos.z += 0; }
      d.rythme = 'boucle'; d.periode = 4.4; d.cles = [[0, v], [0.1, v], [0.42, ras], [0.62, chien], [0.72, chien], [0.92, v], [1, v]];
      d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.birddog) {
      // Une pompe, puis en haut un bras et la jambe opposée s'allongent.
      const haut = cle(0), bas = cle(1), tendu = cle(0, p => { p.bras.G = B(0, 170, 0, 6, 90, { doigts: 'plat' }); const j = cloner(p.jambes.D); j.cheville.y += 0.32; j.cheville.z -= 0.05; p.jambes.D = j; });
      d.rythme = 'boucle'; d.periode = 4.8; d.cles = [[0, haut], [0.06, haut], [0.3, bas], [0.36, bas], [0.56, haut], [0.72, tendu], [0.84, tendu], [1, haut]];
      return d;
    }
    if (o.poignets) {
      // Pompes sur les poignets : bras tendus, les paumes se soulèvent (appui sur les doigts) puis se reposent.
      const levee = cle(0, p => { p.bassin.pos.y += 0.035; for (const [k, s] of COTES) { p.bras[k] = aPlat(s, ecart, 0.05, zM - 0.012, V(0, -0.62, 1), pole(s), 'plat'); } });
      d.a = cle(0); d.b = levee; return d;
    }
    d.a = cle(0); d.b = cle(1);
    return d;
  };

  /* Dips : en appui sur deux barres, les coudes plient et le corps descend.
     (défaut) barres parallèles ; pecs (buste plus penché) ; anneaux ; barre (barre droite devant soi) ; coreen (barre
     dans le dos) ; banc (mains sur un banc derrière soi, talons au sol ; pieds : sur un second banc ; leste) ;
     machine (dips assistés, genoux sur un plateau) ; assis (machine à dips assise) ; shrug (bras tendus, seules les
     épaules montent et descendent) ; leste (disque à la ceinture). */
  FAM.dips = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 52, el: 8 }, tenu: [], fixe };
    const R = 0.97 * (L.bras + L.prise);
    if (o.banc) {
      // Dos au banc, mains sur le bord, jambes devant : les coudes plient vers l'arrière, les fesses descendent.
      const hB = 0.44, hP = o.pieds ? 0.44 : 0, A = L.bras + L.avantBras;
      const cle = u => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(lerp(-6, -2, u)) }, lombaires: 2, thorax: 2, cou: 4, bras: {}, jambes: {} };
        const t = c.tronc(p); p.bassin.pos.y += hB + L.creux + lerp(0.955 * A, 0.5 * A, u) - t.epaules.G.y; p.bassin.pos.z += 0.02 - t.epaules.G.z;
        for (const [k, s] of COTES) {
          p.bras[k] = { prise: V(s * 0.21, hB + 0.008, -0.02 + L.main * 0.4), pole: V(s * 0.12, 0.25, -1), paume: V(0, -1, 0), dirMain: V(0, -0.15, 1), doigts: 'plat' };
          p.jambes[k] = { cheville: V(s * 0.1, hP + 0.085, o.pieds ? 0.78 : 0.8), pole: V(0, 1, 0.3), pied: V(0, 0.86, 0.5), hautPied: V(0, 0.5, -0.86) };
        }
        return p;
      };
      d.a = cle(0); d.b = cle(1);
      fixe.push(...poseFixe(MAT.banc(C, 0, hB), V(0.3, 0, -0.17), qY(90)));
      if (o.pieds) fixe.push(...poseFixe(MAT.banc(C, 0, hP), V(0.3, 0, 0.86), qY(90)));
      if (o.leste) d.objets = (info, u, sortie) => { const m = info.hanches.G.clone().add(info.hanches.D).multiplyScalar(0.5).add(info.genoux.G).add(info.genoux.D).multiplyScalar(1 / 3); poserObjet([cyl(0.19, 0.04, 0, 0, 0, C.fonte, 0, DEBOUT_Q)], V(0, m.y + 0.11, m.z + 0.02), qX(-12), sortie); };
      d.vue = { az: 58, el: 10 }; return d;
    }
    if (o.assis) {
      // Machine à dips assise : poignées de chaque côté du siège, les bras poussent vers le bas.
      const p = assis(c, { h: 0.5, penche: 2 }), t = c.tronc(p);
      const cle = u => { const q = cloner(p); for (const [k, s] of COTES) q.bras[k] = { prise: V(s * 0.31, lerp(t.epaules.G.y - 0.27, t.epaules.G.y - 0.56, u), t.epaules.G.z + 0.03), pole: V(s * 0.3, 0.2, -1), paume: V(-s, 0, 0), doigts: 'barre' }; return q; };
      d.a = cle(0); d.b = cle(1);
      fixe.push(...poseFixe(MAT.siege(C, 0.5, 0.6, 6)));
      d.tenu = [{ t: 'levier', de: V(0.31, 0.5, -0.5), m: 'G' }, { t: 'levier', de: V(-0.31, 0.5, -0.5), m: 'D' }];
      d.vue = { az: 55, el: 10 }; return d;
    }
    // Barres parallèles, anneaux, barre droite, barre dans le dos.
    const h = o.barre || o.coreen ? 1.1 : 1.25, ecart = o.barre ? 0.29 : o.coreen ? 0.3 : 0.28;
    const cle = u => {
      const penche = o.barre ? lerp(10, 38, u) : o.coreen ? lerp(-4, 6, u) : o.pecs ? lerp(18, 34, u) : lerp(6, 16, u);
      const p = { bassin: { pos: V(0, 1.2, 0), rot: qX(penche) }, lombaires: 4, thorax: 4, cou: -penche * 0.5, bras: {}, jambes: {} };
      // Les jambes pendent : genoux fléchis, chevilles croisées vers l'arrière (tendues devant la barre droite).
      p.jambes = o.barre ? pareil(J(penche + lerp(14, 30, u), 2, 0, 6, 40)) : o.coreen ? pareil(J(penche + lerp(10, 34, u), 2, 0, 8, 40)) : o.machine ? pareil(J(penche + 4, 3, 0, 92, 30)) : pareil(J(penche - 4, 3, 0, 74, 30));
      const t = c.tronc(p), ep = t.epaules.G;
      const yEp = o.shrug ? h + R * 0.985 - 0.065 * u : lerp(h + R * 0.985, h + L.prise * 0.9, u);
      const zEp = o.barre ? lerp(-0.1, 0.02, u) : o.coreen ? lerp(0.1, 0.16, u) : o.shrug ? 0 : lerp(0, 0.17, u);
      p.bassin.pos.y += yEp - ep.y; p.bassin.pos.z += zEp - ep.z;
      for (const [k, s] of COTES) {
        p.bras[k] = o.barre ? { prise: V(s * ecart, h, 0), pole: V(s * 0.5, 0.2, -1), paume: V(0, -0.2, -1), doigts: 'barre' }
          : o.coreen ? { prise: V(s * ecart, h, 0), pole: V(s * 0.45, 0.1, -1), paume: V(0, -0.2, -1), doigts: 'barre' }
          : { prise: V(s * ecart, h, 0), pole: V(s * (o.pecs ? 0.6 : 0.22), 0.2, -1), paume: V(-s, 0, 0), doigts: 'barre' };
        if (o.shrug) p.bras[k].hausse = lerp(-6, 16, u);
      }
      return p;
    };
    d.a = cle(0); d.b = cle(1);
    if (o.anneaux) d.tenu = [{ t: 'sangle', de: V(ecart, 2.9, 0), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, 2.9, 0), m: 'D', bout: 'anneau' }];
    else if (o.barre || o.coreen) fixe.push(...poseFixe(MAT.barreFixe(C, h, 1.3)));
    else fixe.push(...poseFixe(MAT.paralleles(C, h, ecart, 0.75)));
    if (o.machine) d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().add(info.genoux.D).multiplyScalar(0.5); sortie.push(pret(boite(0.42, 0.05, 0.26, 0, g.y - 0.085, g.z - 0.12, C.banc, 0)), pret(seg(V(0, g.y - 0.1, g.z - 0.12), V(0, 0.25, -0.5), 0.022, C.cadre, 0.5)), pret(boite(0.5, 0.04, 0.5, 0, 0.02, -0.45, C.cadre, 0.5))); };
    if (o.leste) d.objets = (info, u, sortie) => { const b = info.bassin.clone().add(V(0, -0.34, 0.1).applyQuaternion(info.qBassin)); sortie.push(pret(seg(info.bassin.clone().add(V(0, -0.02, 0.1).applyQuaternion(info.qBassin)), b, 0.006, C.cable, 0.6))); poserObjet([cyl(0.17, 0.04, 0, 0, 0, C.fonte, 0)], b, null, sortie); };
    if (o.barre) d.vue = { az: 60, el: 8 }; else if (o.coreen) d.vue = { az: 120, el: 8 };
    return d;
  };
  /* ---------- Rotations et inclinaisons du tronc ----------
     russe (assis par terre, buste en arrière, d'un côté à l'autre : hal, balle, disque, barre, elas ; pieds : levés) ;
     debout (rotation debout : barre sur les épaules, ou mains devant ; poulie / elas : câble à l'horizontale) ;
     assis (sur un banc : barre, machine) ; hache (coup de hache en diagonale : poulie, elas, hal ; haut = du haut vers
     le bas (défaut), bas = du bas vers le haut ; genoux, demigenou) ; pallof (dos au câble de côté, les mains
     poussent devant : poulie, elas ; genoux) ; flexion (inclinaison latérale : hal, elas) ; moulinet (bras en croix,
     une main va toucher le pied opposé ; kb : kettlebell tenu au-dessus de la tête) ; landmine ; couche (torsion
     couchée, étirement) ; genoucoude (debout, coude vers le genou opposé). */
  FAM.rotation = (c, o, C) => {
    // Posture par défaut, admise dans l'écriture : o.debout.
    const L = c.L, fixe = [], d = { vue: { az: 28, el: 10 }, tenu: [], fixe };
    const mainsDevant = (p, loin, bas, ecart) => { const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * (ecart == null ? 0.02 : ecart), bas == null ? -0.1 : bas, loin)), pole: V(s * 0.6, -1, 0.1).applyQuaternion(t.qThorax), paume: V(-s, 0, 0).applyQuaternion(t.qThorax), dirMain: V(0, 0.25, 1).applyQuaternion(t.qThorax), doigts: 'barre' }; return t; };
    const charge = (ecart) => (o.hal ? [{ t: 'haltere', m: 'GD', entre: true }] : o.balle ? [{ t: 'balle', m: 'GD', r: 0.11 }] : o.disque ? [{ t: 'disque', m: 'GD', r: 0.15 }] : o.kb ? [{ t: 'kb', m: 'GD', entre: true }] : []);

    if (o.russe) {
      // Assis, buste incliné en arrière, genoux fléchis : les mains (et la charge) passent d'une hanche à l'autre.
      const base = assisSol(c, { recul: 32, lomb: 14, thor: 8, jambes: o.leves ? J(98, 5, 0, 58, 10) : J(108, 5, 0, 109, 0) });
      base.cou = 12;
      d.rythme = 'continu'; d.periode = 2.6;
      d.pose = ph => { const p = cloner(base), sn = Math.sin(ph * 2 * Math.PI); p.torsion = 52 * sn; p.couRot = -14 * sn; if (o.barre) Object.assign(d, {}); mainsDevant(p, 0.3, -0.2, o.hal ? 0.09 : o.balle || o.disque ? 0.1 : 0.03); return p; };
      d.tenu = charge();
      if (o.barre) { d.pose = ph => { const p = cloner(base), sn = Math.sin(ph * 2 * Math.PI); p.torsion = 48 * sn; p.couRot = -12 * sn; porter(c, p, { barre: true }, C, 0); return p; }; d.tenu = [{ t: 'barre', l: 1.6, d: 0 }]; }
      if (o.elas) d.tenu = [{ t: 'elastique', de: V(1.25, 0.45, 0.25), m: 'GD', bout: 'corde' }];
      d.vue = { az: 42, el: 16 }; return d;
    }
    if (o.couche) {
      // Sur le dos, bras en croix : les genoux fléchis basculent d'un côté, les épaules restent au sol.
      const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: J(84, 0, 0, 90, 10) }); p.bassin.rot = qX(-90).multiply(qY(-62 * u)); p.torsion = 58 * u; p.couRot = 30 * u; c.poserSur(p, V(), AY, ['bassin', 'cuisse', 'thorax', 'dos', 'jambe']); p.bras = pareil(B(90, 88, 0, 6, 0, { doigts: 'detendu' })); return p; };
      d.a = cle(0); d.b = cle(1); d.rythme = 'etire'; d.vue = { az: 60, el: 26 }; return d;
    }
    if (o.genoucoude) {
      // Debout, mains à la tête : un genou monte, le coude opposé vient à sa rencontre.
      const base = debout(c, { ecart: 0.1, ouv: 8 });
      d.rythme = 'alt'; d.periode = 3.2;
      d.pose = (uG, uD) => {
        const p = cloner(base), u = Math.max(uG, uD), sens = uG > 0 ? 1 : -1;
        p.lombaires = 22 * u; p.thorax = 10 * u; p.torsion = 34 * u * sens; p.cou = 6 * u;
        const k = uG > 0 ? 'G' : 'D'; if (u > 0) p.jambes[k] = J(96 * u + 0, 4, 0, 96 * u, 28 * u);
        p.bras = mains(c, c.tronc(p), 'nuque'); return p;
      };
      d.vue = { az: 20, el: 8 }; return d;
    }
    if (o.flexion) {
      // Inclinaison latérale : la charge dans une main descend le long de la cuisse, puis le buste se redresse de l'autre côté.
      const cle = u => { const p = debout(c, { ecart: 0.12, ouv: 8 }); p.inclinaison = lerp(-26, 20, u); p.couIncl = lerp(-6, 5, u); p.bras.D = B(90, 4, 0, 4, 90); const t = c.tronc(p); p.bras.G = o.elas ? B(90, 4, 0, 4, 90) : mains(c, t, 'nuque').G; if (o.elas) p.bras.D = mains(c, t, 'hanches').D; return p; };
      d.a = cle(0); d.b = cle(1);
      if (o.hal) d.tenu = [{ t: 'haltere', m: 'D' }]; else if (o.kb) d.tenu = [{ t: 'kb', m: 'D' }]; else if (o.elas) d.tenu = [{ t: 'elastique', de: 'pied', m: 'G', bout: 'poignee' }];
      d.vue = { az: 6, el: 8 }; return d;
    }
    if (o.moulinet) {
      if (o.kb) {
        // Moulinet au kettlebell : un bras tendu à la verticale, le buste s'incline et tourne, l'autre main descend vers le pied.
        const cle = u => {
          const p = debout(c, { ecart: 0.24, ouv: 24, dx: 0.06 * u, dy: -0.03 * u, penche: 52 * u });
          p.torsion = -58 * u; p.inclinaison = 0; p.cou = -10 * u; p.couRot = -40 * u;
          p.bras.G = { dirBras: V(0.04, 1, 0.02), dirAvantBras: V(0, 1, 0), paume: V(0, 0, 1) };
          const info = c.poser(p), cible = info.chevilles.D.clone().add(V(0.06, 0.06, 0.1)), bas = V(-0.25, info.hanches.D.y - 0.08, 0.06);
          // La main descend vers le pied, sans dépasser la portée du bras.
          const e = info.epaules.D, v = bas.lerp(cible, u).sub(e), R = 0.95 * (L.bras + L.prise); if (v.length() > R) v.multiplyScalar(R / v.length());
          p.bras.D = { prise: e.clone().add(v), pole: V(-1, 0, -0.3), paume: V(1, 0, 0), doigts: 'detendu' };
          return p;
        };
        d.cles = [0, 0.25, 0.5, 0.75, 1].map(u => [u, cle(u)]); d.tenu = [{ t: 'kb', m: 'G', sens: 'avantbras' }];
        d.vue = { az: 24, el: 8 }; return d;
      }
      // Bras en croix, jambes écartées : le buste se penche et tourne, une main va toucher le pied opposé.
      const base = debout(c, { ecart: 0.3, ouv: 14 });
      d.rythme = 'alt'; d.periode = 3.6;
      d.pose = (uG, uD) => {
        const u = Math.max(uG, uD), sens = uG > 0 ? 1 : -1;      // uG : la main gauche descend vers le pied droit
        const p = debout(c, { ecart: 0.3, ouv: 14, penche: 78 * u, dz: -0.06 * u, dy: -0.045 * u, cou: -30 * u });
        p.torsion = -50 * u * sens; p.lombaires = 10 * u;
        p.bras = pareil(B(90, 88, 0, 4, 180, { doigts: 'plat' }));
        return p;
      };
      d.vue = { az: 22, el: 10 }; return d;
    }
    if (o.landmine) {
      // La barre tenue par son bout, bras tendus devant : elle décrit un arc d'une hanche à l'autre.
      const base = debout(c, { ecart: 0.2, ouv: 12, dy: -0.04 }), piv = V(0, 0.05, 1.55);
      d.rythme = 'continu'; d.periode = 3.2;
      d.pose = ph => {
        const p = cloner(base), sn = Math.sin(ph * 2 * Math.PI), t = c.tronc(p);
        p.torsion = 30 * sn; p.couRot = -8 * sn;
        const haut = t.epaules.G.y + 0.12, m = V(0.42 * sn, haut - 0.42 * sn * sn, 0.52 - 0.14 * sn * sn);
        for (const [k, s] of COTES) p.bras[k] = { prise: m.clone().add(V(s * 0.035, 0, 0)), pole: V(s * 0.7, -0.6, -0.2), paume: V(-s, 0, 0), dirMain: V(0, 0.5, 0.85), doigts: 'barre' };
        return p;
      };
      d.objets = (info, u, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), dir = unite(m.clone().sub(piv)); sortie.push(pret(seg(piv, m.clone().add(dir.clone().multiplyScalar(0.12)), 0.025, C.metal, 1))); poserObjet([cyl(0.14, 0.04, 0, 0, 0, C.fonte, 0, DEBOUT_Q)], m.clone().sub(dir.clone().multiplyScalar(0.2)), arc(AY, dir), sortie); };
      d.vue = { az: 150, el: 12 }; return d;
    }
    if (o.pallof) {
      // De profil par rapport au câble : les mains partent du sternum, poussent droit devant, reviennent ; le buste ne tourne pas.
      const base = o.genoux ? aGenoux(c, {}) : o.demigenou ? demiGenou(c, {}) : debout(c, { ecart: 0.17, ouv: 8, dy: -0.03 });
      const t0 = c.tronc(base), yA = o.bas ? 0.35 : t0.epaules.G.y - 0.12, anc = V(1.25, yA, 0.1);
      const cle = u => { const p = cloner(base); mainsDevant(p, lerp(0.19, 0.56, u), -0.12, 0.02); return p; };
      d.a = cle(0); d.b = cle(1);
      d.tenu = [{ t: o.elas ? 'elastique' : 'cable', de: anc, m: 'GD', bout: 'corde' }];
      if (!o.elas) fixe.push(...poseFixe(MAT.colonne(C, anc, V(1.31, 0, 0.1)))); else fixe.push(pret(boite(0.05, yA + 0.2, 0.05, 1.3, (yA + 0.2) / 2, 0.1, C.cadre, 0.5)));
      d.vue = { az: -24, el: 10 }; return d;
    }
    if (o.hache) {
      // Coup de hache : les mains tirent en diagonale, d'au-dessus d'une épaule jusqu'à la hanche opposée (ou l'inverse),
      // le buste tourne et les genoux accompagnent.
      const genoux = o.genoux || o.demigenou, versHaut = !!o.bas;
      const cle = v => {   // v = 0 : mains en haut du côté gauche ; 1 : en bas du côté droit
        const p = o.genoux ? aGenoux(c, { penche: 10 * v }) : o.demigenou ? demiGenou(c, { penche: 8 * v }) : debout(c, { ecart: 0.2, ouv: 12, dy: -0.02 - 0.1 * v, penche: 22 * v, dz: -0.05 * v });
        p.torsion = lerp(42, -44, v); p.couRot = lerp(14, -10, v); p.cou = -8 * v;
        const t = c.tronc(p), ep = t.epaules.G.y, m = V(lerp(0.4, -0.27, v), lerp(ep + 0.26, ep - 0.47 + (genoux ? 0.08 : 0), v), lerp(0.2, 0.3, v) + 0.12 * Math.sin(Math.PI * v));
        for (const [k, s] of COTES) p.bras[k] = { prise: m.clone().add(V(s * 0.03, 0, 0).applyQuaternion(t.qThorax)), pole: V(s * 0.5, -0.6, -0.4).applyQuaternion(t.qThorax), paume: V(-s, 0, 0).applyQuaternion(t.qThorax), dirMain: unite(m.clone().sub(t.cou).add(V(0, 0.2, 0))), doigts: 'barre' };
        return p;
      };
      d.cles = (versHaut ? [1, 0.75, 0.5, 0.25, 0] : [0, 0.25, 0.5, 0.75, 1]).map((v, n) => [n / 4, cle(v)]);
      const t0 = c.tronc(cle(0)), anc = versHaut ? V(-1.3, 0.25, 0.25) : V(1.35, t0.epaules.G.y + 0.75, 0.2);
      if (o.poulie) { d.tenu = [{ t: 'cable', de: anc, m: 'GD', bout: 'corde' }]; fixe.push(...poseFixe(MAT.colonne(C, anc, V(anc.x + (anc.x > 0 ? 0.06 : -0.06), 0, anc.z)))); }
      else if (o.elas) { d.tenu = [{ t: 'elastique', de: anc, m: 'GD', bout: 'corde' }]; fixe.push(pret(boite(0.05, anc.y + 0.15, 0.05, anc.x + (anc.x > 0 ? 0.05 : -0.05), (anc.y + 0.15) / 2, anc.z, C.cadre, 0.5))); }
      else d.tenu = charge();
      d.vue = { az: versHaut ? 20 : -20, el: 10 }; return d;
    }
    // Rotation debout ou assise, les mains devant soi ou la barre sur les épaules.
    const machine = !!o.machine, base = o.assis || machine ? assis(c, { h: 0.47, ecart: 0.14 }) : o.genoux ? aGenoux(c, {}) : debout(c, { ecart: 0.19, ouv: 12, dy: -0.02 });
    if (o.assis && !machine) fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, 0.3)));
    if (machine) fixe.push(...poseFixe(MAT.siege(C, 0.47, 0, 0)));
    const amp = machine ? 46 : o.barre ? 50 : 44;
    const poser = (p, tw) => {
      p.torsion = tw; p.couRot = -tw * 0.3;
      if (o.barre) porter(c, p, { barre: true }, C, 0);
      else if (o.poulie || o.elas) mainsDevant(p, 0.5, -0.08, 0.02);
      else if (machine) { const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.17, -0.14, 0.3)), pole: V(s * 0.5, -1, -0.1).applyQuaternion(t.qThorax), paume: V(-s, 0, 0).applyQuaternion(t.qThorax), dirMain: V(0, 0.6, 0.8).applyQuaternion(t.qThorax), doigts: 'barre' }; }
      else mainsDevant(p, 0.24, -0.12, 0.03);
      return p;
    };
    if (o.poulie || o.elas) {
      // Câble à l'horizontale, de côté : bras tendus, le buste tourne en s'éloignant de la poulie.
      const t0 = c.tronc(base), anc = V(1.35, t0.epaules.G.y - 0.1, 0.15);
      d.cles = [0, 0.5, 1].map(u => [u, poser(cloner(base), lerp(46, -46, u))]);
      d.tenu = [{ t: o.elas ? 'elastique' : 'cable', de: anc, m: 'GD', bout: 'corde' }];
      if (o.poulie) fixe.push(...poseFixe(MAT.colonne(C, anc, V(1.41, 0, 0.15)))); else fixe.push(pret(boite(0.05, anc.y + 0.2, 0.05, 1.4, (anc.y + 0.2) / 2, 0.15, C.cadre, 0.5)));
      d.vue = { az: -20, el: 10 }; return d;
    }
    d.rythme = 'continu'; d.periode = o.barre ? 3 : 2.6;
    d.pose = ph => poser(cloner(base), amp * Math.sin(ph * 2 * Math.PI));
    if (o.barre) d.tenu = [{ t: 'barre', l: 1.6, d: 0 }]; else d.tenu = charge();
    if (machine) d.objets = (info, u, sortie) => {
      // Le bras de la machine tourne avec le buste : deux poignées reliées, au bout d'un bras qui vient de l'axe (derrière le siège).
      const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), axe = V(0, m.y + 0.42, -0.02);
      sortie.push(pret(seg(info.prises.G, info.prises.D, 0.016, C.cadre, 0.5)), pret(seg(m, V(m.x, axe.y, m.z), 0.018, C.cadre, 0.5)), pret(seg(V(m.x, axe.y, m.z), axe, 0.018, C.cadre, 0.5)), pret(seg(axe, V(0, axe.y, -0.4), 0.022, C.cadre, 0.5)), pret(seg(V(0, axe.y, -0.4), V(0, 0, -0.4), 0.03, C.cadre, 0.5)));
    };
    d.vue = { az: 24, el: 10 }; return d;
  };
  /* ---------- Avant-bras : poignets, pronation, prise ----------
     (défaut) flexion des poignets, assis, avant-bras posés sur les cuisses, paumes vers le haut ; inverse (paumes
     vers le bas : extension) ; neutre (pouces en haut : inclinaison vers le pouce) ; debout (bras le long du corps) ;
     dos (barre tenue dans le dos) ; pronation / supination (coude à angle droit, l'avant-bras tourne) ; couche ;
     rouleau (enrouleur de poignets : bras tendus devant, la charge monte au bout d'une cordelette) ; pince (poignées
     de musculation de la main). Charge : barre, ez, hal, poulie, machine. uni : un seul bras. */
  FAM.poignet = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 40, el: 14 }, tenu: [], fixe }, m = coteDe(o);
    if (!(o.barre || o.ez || o.poulie || o.machine || o.rouleau || o.pince)) o.hal = true;
    if (o.rouleau) {
      // Bras tendus devant soi, une barrette dans les mains : les poignets tournent tour à tour, la charge monte puis redescend.
      const base = debout(c, { ecart: 0.12, ouv: 8 });
      d.rythme = 'continu'; d.periode = 7;
      d.pose = ph => { const p = cloner(base), a = 26 * Math.sin(ph * 2 * Math.PI * 9); p.bras.G = B(4, 86, 0, 6, 180, { poignet: a }); p.bras.D = B(4, 86, 0, 6, 180, { poignet: -a }); return p; };
      d.tenu = [{ t: 'barre', l: 0.5, d: 0 }];
      d.objets = (info, u, sortie) => { const mi = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), h = 0.42 + 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (u || 0))); sortie.push(pret(seg(mi, V(mi.x, h + 0.02, mi.z), 0.004, C.cable, 0.4))); poserObjet([cyl(0.11, 0.035, 0, 0, 0, C.fonte, 0, DEBOUT_Q)], V(mi.x, h, mi.z), null, sortie); };
      if (o.poulie) { d.objets = null; d.tenu = [{ t: 'barre', l: 0.5, d: 0 }, { t: 'cable', de: V(0, 0.12, 0.75), m: 'GD', bout: 'rien', vers: info => info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) }]; fixe.push(...poseFixe(MAT.colonne(C, V(0, 0.12, 0.75)))); }
      return d;
    }
    if (o.pince) {
      // Poignées de force : coudes fléchis, les doigts serrent puis s'ouvrent.
      const p = debout(c, { ecart: 0.11, ouv: 8 });
      const cle = u => { const q = cloner(p); for (const [k] of COTES) q.bras[k] = (m === 'GD' || m === k) ? B(6, 14, 0, 96, 90, { doigts: lerp(0.3, 0.92, u) }) : brasRepos(); return q; };
      d.a = cle(0); d.b = cle(1); d.periode = 1.8;
      d.objets = (info, u, sortie) => { for (const k of m === 'GD' ? ['G', 'D'] : [m]) { const pr = info.prises[k], ax = info.axes[k], pa = info.paumes[k], dm = info.dirMains[k], e = lerp(0.07, 0.03, u == null ? 0 : u); sortie.push(pret(seg(pr.clone().add(ax.clone().multiplyScalar(-0.06)).add(pa.clone().multiplyScalar(-0.012)), pr.clone().add(ax.clone().multiplyScalar(0.06)).add(pa.clone().multiplyScalar(-0.012)), 0.009, C.cadre, 0.5)), pret(seg(pr.clone().add(ax.clone().multiplyScalar(-0.06)).add(pa.clone().multiplyScalar(e)).add(dm.clone().multiplyScalar(0.01)), pr.clone().add(ax.clone().multiplyScalar(0.06)).add(pa.clone().multiplyScalar(e)).add(dm.clone().multiplyScalar(0.01)), 0.009, C.cadre, 0.5))); } };
      d.vue = { az: 30, el: 10 }; return d;
    }
    const tourne = o.pronation || o.supination;
    let p, bras;
    if (o.debout || o.dos) {
      p = debout(c, { ecart: 0.11, ouv: 8 });
      bras = u => (o.dos ? B(0, -12, 0, 8, 180, { poignet: lerp(-8, 52, u) }) : o.inverse ? B(0, 8, 0, 10, 180, { poignet: lerp(34, -42, u) }) : B(0, 8, 0, 10, 0, { poignet: lerp(-30, 48, u) }));
      d.vue = o.dos ? { az: 150, el: 8 } : { az: 30, el: 8 };
    } else if (o.couche) {
      // Sur le dos, coude au sol plié à angle droit : l'avant-bras à la verticale tourne sur lui-même.
      p = allonge(c, { h: 0, angle: 0, jambes: 'plies' });
      bras = u => B(90, 12, 0, 90, o.supination ? lerp(150, 10, u) : lerp(10, 150, u));
      d.vue = { az: 60, el: 18 };
    } else {
      // Assis, buste penché, avant-bras posés sur les cuisses, les mains dépassent des genoux.
      p = assis(c, { h: 0.46, penche: 34, ecart: 0.13 }); p.cou = -16; fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, 0.3)));
      bras = u => (tourne ? B(-4, 36, 0, 92, o.supination ? lerp(160, 20, u) : lerp(20, 160, u))
        : o.neutre ? B(-4, 36, 0, 92, 90, { deviation: lerp(-22, 26, u) })
        : o.inverse ? B(-4, 36, 0, 92, 180, { poignet: lerp(36, -44, u) }) : B(-4, 36, 0, 92, 0, { poignet: lerp(-34, 50, u) }));
    }
    const cle = u => { const q = cloner(p); for (const [k] of COTES) q.bras[k] = (m === 'GD' || m === k) ? bras(u) : (o.debout || o.dos || o.couche ? brasRepos() : B(-4, 36, 0, 92, 150, { doigts: 'detendu' })); return q; };
    d.a = cle(0); d.b = cle(1); d.periode = 2.2;
    const anc = V(0, 0.12, 0.95);
    d.tenu = o.barre ? [{ t: 'barre', l: 1.2, d: 0.11 }] : o.ez ? [{ t: 'barre', l: 1.1, d: 0.09 }] : o.poulie ? [{ t: 'cable', de: anc, m: 'GD', bout: 'barre', l: 0.5 }] : o.machine ? (m === 'GD' ? ['G', 'D'] : [m]).map(k => ({ t: 'levier', de: V(k === 'G' ? 0.2 : -0.2, 0.5, 0.75), m: k })) : [{ t: 'haltere', m, k: tourne ? 0.8 : 1 }];
    if (o.poulie) fixe.push(...poseFixe(MAT.colonne(C, anc)));
    return d;
  };
  /* ---------- Cardio et déplacements ----------
     course, marche (sur place ; tapis : sur un tapis roulant ; pente ; charge : hal, kb, uni → marche du fermier) ;
     velo (vélo d'appartement ; airbike : avec les bras) ; elliptique ; rameur ; skierg ; escalier (simulateur
     d'escalier) ; jacks (sauts écartés) ; burpee ; cordes (cordes ondulatoires) ; boxe (sac de frappe) ; kickboxing ;
     sauter (corde à sauter) ; traineau (poussée de traîneau). */
  FAM.cardio = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 62, el: 8 }, tenu: [], fixe, rythme: 'continu' };
    const TAU = 2 * Math.PI, sn = x => Math.sin(TAU * x), onde = x => 0.5 - 0.5 * Math.cos(TAU * x);

    if (o.course || o.marche || o.escalier || o.traineau) {
      // Une foulée : chaque jambe monte le genou, s'allonge vers l'avant, passe sous le corps puis derrière.
      const cours = !!o.course, y0 = o.tapis ? 0.14 : o.escalier ? 0.46 : 0, pente = o.pente ? 7 : 0, n = V(0, Math.cos(rad(pente)), -Math.sin(rad(pente)));
      const ampH = cours ? 34 : o.escalier ? 30 : 22, cH = cours ? 20 : o.escalier ? 34 : 9, ampG = cours ? 78 : o.escalier ? 62 : 38;
      const penche = (cours ? 9 : o.traineau ? 46 : 4) + pente * 0.6;
      const jambe = ph => { const h = cH + ampH * Math.sin(TAU * ph), g = 6 + ampG * Math.pow(0.5 + 0.5 * Math.sin(TAU * ph + 1.25), cours ? 1.4 : 1.8); return J(h + penche, 3, 0, g, cours ? 18 * (0.5 - 0.5 * Math.sin(TAU * ph)) : 6); };
      d.periode = cours ? 0.74 : o.escalier ? 1.5 : 1.15;
      const charge = o.hal || o.kb;
      d.pose = ph => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(penche) }, lombaires: 2, thorax: 2, cou: -penche * 0.7, torsion: (cours ? 9 : 5) * sn(ph), bras: {}, jambes: { G: jambe(ph), D: jambe(ph + 0.5) } };
        const sw = (cours ? 38 : 20) * sn(ph);
        if (o.traineau) { const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.2, -0.12, 0.52)), pole: V(s * 0.5, -1, 0), paume: V(-s, 0, 0).applyQuaternion(t.qThorax), doigts: 'barre' }; }
        else if (o.escalier) { p.bras = pareil(B(20, 34, 0, 60, 90)); }
        else if (charge) { p.bras.D = (o.uni ? B(40, 10, 0, 16, 90, { doigts: 'detendu' }) : B(90, 5, 0, 5, 90)); p.bras.G = B(90, 5, 0, 5, 90); p.torsion *= 0.4; }
        else { p.bras.G = B(0, -sw * 0.9 + 4, 0, cours ? 88 : 22, 90, { doigts: cours ? 'poing' : 'detendu' }); p.bras.D = B(0, sw * 0.9 + 4, 0, cours ? 88 : 22, 90, { doigts: cours ? 'poing' : 'detendu' }); }
        c.poserSur(p, V(0, y0, 0), n, ['pied']);
        if (cours) p.bassin.pos.y += 0.035 * Math.pow(Math.abs(Math.cos(TAU * ph)), 2);
        return p;
      };
      if (charge) d.tenu = [{ t: o.kb ? 'kb' : 'haltere', m: o.uni ? 'G' : 'GD', k: 1.2 }];
      if (o.tapis) {
        // Tapis roulant : la bande, les montants, la console et ses poignées.
        const q = qX(-pente), pose = (f, x, y, z) => poserObjet([f], V(0, y0 - 0.07, 0).add(V(x, y, z).applyQuaternion(q)), q, fixe);
        pose(boite(0.62, 0.14, 1.75, 0, 0, 0, C.banc, 0), 0, 0, 0.1);
        for (const s of [1, -1]) { pose(boite(0.05, 1.2, 0.06, 0, 0, 0, C.cadre, 0.5), s * 0.33, 0.6, 0.9); pose(cyl(0.018, 0.5, 0, 0, 0, C.metal, 0.8, LONG_Z), s * 0.33, 1.05, 0.66); }
        pose(boite(0.72, 0.2, 0.06, 0, 0, 0, C.fonte, 0.2), 0, 1.22, 0.92);
      }
      if (o.escalier) {
        // Simulateur d'escalier : trois marches, deux rampes, une console.
        for (let k = -1; k < 3; k++) fixe.push(pret(boite(0.6, 0.2, 0.27, 0, y0 - 0.1 - k * 0.2, 0.04 - k * 0.27, C.banc, 0)));
        for (const s of [1, -1]) { fixe.push(pret(boite(0.05, y0 + 1.25, 0.06, s * 0.36, (y0 + 1.25) / 2, 0.66, C.cadre, 0.5))); fixe.push(pret(cyl(0.02, 0.6, s * 0.36, y0 + 1.02, 0.38, C.metal, 0.8, LONG_Z))); }
        fixe.push(pret(boite(0.78, 0.2, 0.06, 0, y0 + 1.25, 0.68, C.fonte, 0.2)), pret(boite(0.7, 0.05, 1.3, 0, 0.025, -0.1, C.cadre, 0.5)));
      }
      if (o.traineau) d.objets = (info, u, sortie) => { const mi = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5); for (const s of [1, -1]) sortie.push(pret(seg(V(s * 0.2, 0.06, mi.z + 0.12), V(s * 0.2, mi.y + 0.12, mi.z), 0.02, C.cadre, 0.5))); sortie.push(pret(boite(0.6, 0.06, 0.9, 0, 0.03, mi.z + 0.5, C.cadre, 0.5)), pret(cyl(0.2, 0.12, 0, 0.14, mi.z + 0.6, C.fonte, 0, DEBOUT_Q))); };
      d.vue = { az: 70, el: 8 }; return d;
    }
    if (o.velo || o.airbike) {
      // Assis sur la selle, les pieds tournent sur les pédales ; airbike : les mains poussent et tirent les leviers.
      const ax = V(0, 0.31, 0.1), R = 0.17, selle = V(0, 0.95, -0.2), gui = V(0, 1.1, 0.46);
      d.periode = o.airbike ? 0.9 : 1.1;
      d.pose = ph => {
        const p = { bassin: { pos: selle.clone().add(V(0, 0.07, 0)), rot: qX(36) }, lombaires: 8, thorax: 6, cou: -30, bras: {}, jambes: {} };
        for (const [k, s] of COTES) {
          const a = TAU * (ph + (k === 'D' ? 0.5 : 0)), pd = ax.clone().add(V(s * 0.12, R * Math.cos(a), R * Math.sin(a)));
          p.jambes[k] = { cheville: pd.clone().add(V(0, 0.105, -0.06)), pole: V(s * 0.08, 0.3, 1), pied: V(0, -0.22, 1), hautPied: V(0, 1, 0.22) };
          const pousse = o.airbike ? 0.13 * Math.cos(a) : 0;
          p.bras[k] = { prise: V(s * (o.airbike ? 0.25 : 0.2), gui.y + (o.airbike ? 0.04 : 0), gui.z + pousse), pole: V(s * 0.7, -0.7, -0.3), paume: o.airbike ? V(-s, 0, 0) : V(0, -1, 0.2), doigts: 'barre' };
        }
        return p;
      };
      // Le vélo : cadre, selle, guidon, roue d'inertie, pédalier.
      const tube = (a, b, r) => fixe.push(pret(seg(a, b, r || 0.022, C.cadre, 0.5)));
      tube(ax, selle, 0.024); tube(ax, V(0, 0.36, 0.72)); tube(V(0, 0.36, 0.72), V(0, gui.y - 0.02, gui.z + 0.02)); tube(V(0, 0.05, -0.42), ax); tube(V(0, 0.05, 0.86), V(0, 0.36, 0.72));
      fixe.push(pret(boite(0.17, 0.05, 0.27, selle.x, selle.y, selle.z, C.fonte, 0)), pret(cyl(0.26, o.airbike ? 0.05 : 0.08, 0, 0.36, 0.72, C.fonte, 0.2)), pret(boite(0.5, 0.04, 0.06, 0, 0.02, -0.42, C.cadre, 0.5)), pret(boite(0.5, 0.04, 0.06, 0, 0.02, 0.86, C.cadre, 0.5)));
      if (!o.airbike) fixe.push(pret(cyl(0.015, 0.46, gui.x, gui.y, gui.z, C.metal, 0.8)));
      d.objets = (info, u, sortie) => {
        for (const [k, s] of COTES) {
          const a = TAU * ((u || 0) + (k === 'D' ? 0.5 : 0)), pd = ax.clone().add(V(s * 0.12, R * Math.cos(a), R * Math.sin(a)));
          sortie.push(pret(seg(ax.clone().add(V(s * 0.07, 0, 0)), pd.clone().setX(s * 0.07), 0.012, C.metal, 0.8)), pret(boite(0.09, 0.02, 0.08, pd.x, pd.y, pd.z, C.fonte, 0)));
          if (o.airbike) sortie.push(pret(seg(V(s * 0.25, 0.45, 0.42), info.prises[k], 0.016, C.cadre, 0.5)));
        }
      };
      d.vue = { az: 68, el: 8 }; return d;
    }
    if (o.elliptique) {
      // Debout sur deux pédales qui décrivent une ellipse, les mains sur des leviers qui vont et viennent.
      d.periode = 1.3;
      const centre = V(0, 0.3, 0.02), pied = (a, s) => centre.clone().add(V(s * 0.13, 0.07 * Math.sin(a), 0.2 * Math.cos(a)));
      d.pose = ph => {
        const p = { bassin: { pos: V(0, 1.19, -0.04), rot: qX(8) }, lombaires: 2, thorax: 2, cou: -6, torsion: 6 * sn(ph), bras: {}, jambes: {} };
        for (const [k, s] of COTES) {
          const a = TAU * (ph + (k === 'D' ? 0.5 : 0)), pd = pied(a, s);
          p.jambes[k] = { cheville: pd.clone().add(V(0, 0.1, -0.05)), pole: V(0, 0.2, 1), pied: V(0, -0.1 - 0.12 * Math.sin(a), 1), hautPied: V(0, 1, 0.1) };
          p.bras[k] = { prise: V(s * 0.25, 1.22, 0.36 - 0.13 * Math.cos(a)), pole: V(s * 0.6, -1, -0.3), paume: V(-s, 0, 0), doigts: 'barre' };
        }
        return p;
      };
      fixe.push(pret(boite(0.5, 0.08, 1.5, 0, 0.04, 0.1, C.cadre, 0.5)), pret(boite(0.28, 0.5, 0.4, 0, 0.33, 0.72, C.fonte, 0.2)), pret(seg(V(0, 0.5, 0.75), V(0, 1.45, 0.6), 0.03, C.cadre, 0.5)), pret(boite(0.3, 0.2, 0.05, 0, 1.5, 0.6, C.fonte, 0.2)));
      d.objets = (info, u, sortie) => { for (const [k, s] of COTES) { const a = TAU * ((u || 0) + (k === 'D' ? 0.5 : 0)), pd = pied(a, s); sortie.push(pret(boite(0.12, 0.03, 0.34, pd.x, pd.y - 0.015, pd.z, C.banc, 0)), pret(seg(pd.clone().add(V(0, -0.02, 0.17)), V(s * 0.13, 0.42, 0.7), 0.014, C.cadre, 0.5)), pret(seg(V(s * 0.25, 0.5, 0.62), info.prises[k], 0.015, C.cadre, 0.5))); } };
      d.vue = { az: 70, el: 8 }; return d;
    }
    if (o.rameur) {
      // Assis sur le chariot : les jambes poussent, le buste bascule en arrière, les bras tirent la poignée au ventre.
      const hS = 0.3, cale = V(0, 0.34, 0.62);
      const cle = (jam, dos, tire) => {
        const p = { bassin: { pos: V(0, hS + 0.11, lerp(0.09, -0.235, jam)), rot: qX(lerp(22, -14, dos)) }, lombaires: lerp(10, 2, dos), thorax: 6, cou: -4, bras: {}, jambes: {} };
        const t = c.tronc(p);
        for (const [k, s] of COTES) {
          p.jambes[k] = { cheville: cale.clone().add(V(s * 0.11, 0.07, -0.05)), pole: V(s * 0.1, 1, 0.1), pied: V(0, 0.75, 0.66), hautPied: V(0, 0.66, -0.75) };
          const loin = V(s * 0.14, t.epaules.G.y - 0.26, t.epaules.G.z + 0.55), pres = t.duThorax(V(s * 0.14, -0.3, 0.16));
          p.bras[k] = { prise: loin.lerp(pres, tire), pole: V(s * 0.7, -0.4, -0.6), paume: V(0, -1, 0), doigts: 'barre' };
        }
        return p;
      };
      d.rythme = 'boucle'; d.periode = 2.6; d.cles = [[0, cle(0, 0, 0)], [0.22, cle(0.85, 0.25, 0)], [0.4, cle(1, 1, 1)], [0.5, cle(1, 1, 1)], [0.66, cle(1, 0.3, 0)], [1, cle(0, 0, 0)]];
      fixe.push(pret(boite(0.08, 0.06, 1.9, 0, hS - 0.1, -0.1, C.cadre, 0.5)), pret(boite(0.36, hS - 0.13, 0.06, 0, (hS - 0.13) / 2, -0.95, C.cadre, 0.5)), pret(cyl(0.26, 0.1, 0, 0.42, 1.05, C.fonte, 0.2)), pret(boite(0.4, 0.3, 0.08, 0, 0.2, 0.78, C.cadre, 0.5)), pret(boite(0.34, 0.02, 0.3, 0, cale.y - 0.02, cale.z, C.banc, 0, qX(-42))));
      d.objets = (info, u, sortie) => { const mi = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5); sortie.push(pret(seg(V(0, 0.55, 0.95), mi, 0.004, C.cable, 0.6)), pret(seg(info.prises.G.clone().add(V(0.07, 0, 0)), info.prises.D.clone().add(V(-0.07, 0, 0)), 0.014, C.metal, 0.8)), pret(boite(0.26, 0.05, 0.24, 0, hS - 0.045, info.bassin.z - 0.02, C.fonte, 0))); };
      d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.skierg) {
      // Debout face à l'appareil : les bras tirent deux poignées du dessus de la tête jusqu'aux hanches, le buste plonge.
      const anc = s => V(s * 0.16, 2.05, 0.62);
      const cle = u => {
        const p = debout(c, { ecart: 0.14, ouv: 8, dy: -0.02 - 0.13 * u, dz: -0.1 * u, penche: lerp(4, 46, u), cou: -lerp(0, 20, u) });
        const t = c.tronc(p);
        for (const [k, s] of COTES) { const hautP = V(s * 0.17, t.epaules.G.y + 0.5, t.epaules.G.z + 0.26), basP = t.hanches[k].clone().add(V(s * 0.12, -0.06, 0.02)); p.bras[k] = { prise: hautP.lerp(basP, u), pole: V(s * 0.6, 0, -0.8), paume: V(-s, 0, 0), doigts: 'barre' }; }
        return p;
      };
      d.rythme = 'rep'; d.periode = 2; d.cles = [0, 0.33, 0.66, 1].map(u => [u, cle(u)]);
      d.tenu = [{ t: 'cable', de: anc(1), m: 'G', bout: 'poignee' }, { t: 'cable', de: anc(-1), m: 'D', bout: 'poignee' }];
      fixe.push(pret(boite(0.34, 2.15, 0.1, 0, 1.075, 0.72, C.cadre, 0.5)), pret(cyl(0.2, 0.12, 0, 1.75, 0.72, C.fonte, 0.2)), pret(boite(0.6, 0.04, 0.9, 0, 0.02, 0.35, C.cadre, 0.5)));
      d.vue = { az: 66, el: 8 }; return d;
    }
    if (o.jacks) {
      // Sauts écartés : bras et jambes s'ouvrent et se referment, avec un petit rebond.
      d.periode = 1.0;
      d.pose = ph => { const w = onde(ph), p = { bassin: { pos: V(0, 1, 0), rot: qX(2) }, lombaires: 0, thorax: 0, cou: 0, bras: pareil(B(90, lerp(8, 168, w), 0, 8, lerp(90, 0, w), { doigts: 'plat' })), jambes: pareil(J(2, lerp(2, 24, w), 0, 6, 14)) }; c.poserSur(p, V(), AY, ['pied']); p.bassin.pos.y += 0.05 * Math.pow(Math.sin(TAU * ph), 2); return p; };
      d.vue = { az: 12, el: 8 }; return d;
    }
    if (o.sauter) {
      // Corde à sauter : petits sauts pieds joints, les poignets font tourner la corde.
      d.periode = 0.5;
      d.pose = ph => { const p = { bassin: { pos: V(0, 1, 0), rot: qX(3) }, lombaires: 0, thorax: 0, cou: 0, bras: pareil(B(70, 22, 30, 78, 60, { poignet: 14 * sn(ph), doigts: 'poing' })), jambes: pareil(J(8, 2, 0, 16, 34)) }; c.poserSur(p, V(), AY, ['pied']); p.bassin.pos.y += 0.07 * onde(ph); return p; };
      d.objets = (info, u, sortie) => {
        // La corde : un arc entre les deux mains, qui passe sous les pieds puis au-dessus de la tête.
        const a = TAU * (u || 0) + Math.PI, g = info.prises.G, dr = info.prises.D, N = 14, ray = 1.05;
        let prec = g;
        for (let i = 1; i <= N; i++) { const x = i / N, pt = g.clone().lerp(dr, x), bombe = Math.sin(Math.PI * x) * ray; pt.y += -bombe * Math.cos(a) + 0.02; pt.z += bombe * Math.sin(a); if (i === N) pt.copy(dr); sortie.push(pret(seg(prec, pt, 0.004, C.sangle, 0))); prec = pt; }
      };
      d.vue = { az: 30, el: 8 }; return d;
    }
    if (o.cordes) {
      // Cordes ondulatoires : demi-squat, les bras montent et descendent tour à tour, l'onde court le long des cordes.
      const base = debout(c, { ecart: 0.22, ouv: 14, dy: -0.2, dz: -0.12, penche: 26, cou: -18 });
      d.periode = 0.7;
      d.pose = ph => { const p = cloner(base); p.bras.G = B(6, 44 + 26 * sn(ph), 0, 34, 150, { doigts: 'barre' }); p.bras.D = B(6, 44 - 26 * sn(ph), 0, 34, 150, { doigts: 'barre' }); return p; };
      d.objets = (info, u, sortie) => { for (const [k, s] of COTES) { const de = info.prises[k], a = V(s * 0.12, 0.03, 2.9), N = 12; let prec = de; for (let i = 1; i <= N; i++) { const x = i / N, pt = de.clone().lerp(a, x); pt.y = Math.max(0.03, de.y * (1 - x) * (1 - x) + 0.03 + 0.2 * (1 - x) * Math.sin(TAU * ((u || 0) * (k === 'G' ? 1 : 1) - x * 1.6) + (k === 'D' ? Math.PI : 0)) * Math.sin(Math.PI * Math.min(1, x * 3))); sortie.push(pret(seg(prec, pt, 0.019, C.sangle, 0))); prec = pt; } } };
      d.vue = { az: 118, el: 12 }; return d;
    }
    if (o.boxe || o.kickboxing) {
      // En garde, pied gauche devant : direct du gauche, direct du droit (le buste tourne) ; kickboxing : puis un coup de pied.
      const garde = () => { const p = debout(c, { ecart: 0.13, ouv: 6, dy: -0.06, lacet: 0 }); p.jambes.G = pied(c, 1, { x: 0.13, z: 0.2, ouv: 4 }); p.jambes.D = pied(c, -1, { x: -0.15, z: -0.2, ouv: 32, pointe: 18 }); p.torsion = -16; p.cou = 4; p.couRot = 14; p.bras.G = B(14, 46, -20, 122, 90, { doigts: 'poing' }); p.bras.D = B(8, 30, -28, 138, 90, { doigts: 'poing' }); return p; };
      const g0 = garde(), jab = garde(), droit = garde();
      jab.torsion = -26; jab.bras.G = B(-8, 86, 0, 6, 170, { doigts: 'poing' });
      droit.torsion = 30; droit.couRot = -24; droit.bras.D = B(-10, 86, 0, 6, 170, { doigts: 'poing' }); droit.jambes.D = pied(c, -1, { x: -0.15, z: -0.18, ouv: 6, pointe: 40 });
      d.rythme = 'boucle';
      if (o.kickboxing) {
        const kick = garde(); kick.bassin.rot = qX(-12); kick.lombaires = 8; kick.torsion = 0; kick.jambes.D = J(96, 6, 0, 14, 20); kick.bassin.pos.y += 0.04;
        const arme = garde(); arme.jambes.D = J(92, 6, 0, 108, 30);
        d.periode = 3.6; d.cles = [[0, g0], [0.1, jab], [0.2, g0], [0.32, droit], [0.44, g0], [0.56, arme], [0.66, kick], [0.76, arme], [0.9, g0], [1, g0]];
      } else { d.periode = 2.2; d.cles = [[0, g0], [0.16, jab], [0.32, g0], [0.52, droit], [0.72, g0], [1, g0]]; }
      if (o.boxe) { const z = 0.99; fixe.push(pret(cyl(0.19, 1.0, 0.04, 1.2, z, C.banc, 0, DEBOUT_Q)), pret(seg(V(0.04, 1.7, z), V(0.04, 2.6, z), 0.006, C.cable, 0.6))); }
      d.vue = { az: 58, el: 8 }; return d;
    }
    if (o.burpee) {
      // Debout, accroupi mains au sol, planche, accroupi, saut bras en l'air.
      const droit = debout(c, { ecart: 0.12, ouv: 8 });
      const pl = planche(c, { ecartPieds: 0.1 }), A = L.bras + L.avantBras, hE = 0.024 + 0.95 * A, plc = pl(hE), zM = plc.epaules.G.z + L.main;
      const mainsSol = p => { for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.24, 0.008, zM), pole: V(s * 0.6, 0.5, -0.8), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      mainsSol(plc);
      const accroupi = { bassin: { pos: V(0, 0.36, zM - 0.62), rot: qX(52) }, lombaires: 16, thorax: 10, cou: -30, bras: {}, jambes: {} };
      for (const [k, s] of COTES) accroupi.jambes[k] = pied(c, s, { x: s * 0.2, z: zM - 0.52, ouv: 16, pointe: 34 });
      mainsSol(accroupi);
      // Debout au même endroit que l'accroupi, puis le saut.
      const deb = debout(c, { ecart: 0.2, ouv: 16 }); deb.bassin.pos.z += zM - 0.52 - deb.jambes.G.cheville.z; for (const k of ['G', 'D']) deb.jambes[k].cheville.z += zM - 0.52 - deb.jambes[k].cheville.z;
      const saut = cloner(deb); saut.bassin.pos.y += 0.2; for (const [k, s] of COTES) { saut.jambes[k] = pied(c, s, { x: s * 0.2, z: zM - 0.52, ouv: 16, pointe: 55, y0: 0.2 }); } saut.bras = pareil(B(30, 172, 0, 6, 90, { doigts: 'plat' }));
      d.rythme = 'boucle'; d.periode = 3.8;
      d.cles = [[0, deb], [0.06, deb], [0.2, accroupi], [0.36, plc], [0.46, plc], [0.62, accroupi], [0.76, deb], [0.86, saut], [0.96, deb], [1, deb]];
      d.vue = { az: 70, el: 10 }; return d;
    }
    throw new Error('cardio : mouvement non décrit (' + (o._ || []).join(' ') + ')');
  };
  /* ---------- Gymnastique au poids du corps ----------
     levier (levier avant, sur le dos sous la barre ; dos : levier arrière, face au sol ; traction : le corps monte
     vers la barre) ; drapeau ; muscleup (anneaux ; leste) ; planche (ecart ; grenouille ; penchee : pieds au sol) ;
     equilibre (sur les mains ; mur) ; tete (poirier sur la tête et les avant-bras) ; lsit (équerre sur deux barres basses). */
  FAM.gym = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 62, el: 8 }, tenu: [], fixe, rythme: 'tenue' }, H = 2.42, A = L.bras + L.avantBras, Ap = L.bras + L.prise;
    const epX = c.tronc(debout(c, {})).epaules.G.x;
    const respire = a => { const b = cloner(a); b.thorax = (a.thorax || 0) + 1.5; d.a = a; d.b = b; };
    if (o.levier) {
      const dos = !!o.dos, ecart = 0.26, recul = 0.38;
      const cle = plie => {
        // Le corps à l'horizontale sous la barre, les mains au-dessus des hanches.
        const p = { bassin: { pos: V(0, 1.6, 0), rot: qX(dos ? 90 : -90) }, lombaires: dos ? -4 : 4, thorax: 0, cou: dos ? -18 : 12, bras: {}, jambes: pareil(J(dos ? -3 : 3, 2, 0, 3, 42)) };
        const t = c.tronc(p), portee = 0.96 * Ap * lerp(1, 0.42, plie), r = recul * lerp(1, 0.5, plie), dx = ecart - epX;
        const dy = Math.sqrt(Math.max(0.01, portee * portee - r * r - dx * dx)), sens = dos ? -1 : 1;
        p.bassin.pos.y += H - dy - t.epaules.G.y; p.bassin.pos.z += 0.02 - sens * r - t.epaules.G.z;
        for (const [k, s] of COTES) p.bras[k] = { prise: V(s * ecart, H, 0.02), pole: V(s * 0.7, -0.5, sens * 0.6), paume: V(0, 0, dos ? -1 : 1), dirMain: V(0, 1, 0), doigts: 'barre' };
        return p;
      };
      if (o.traction) { d.rythme = 'rep'; d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); } else respire(cle(0));
      fixe.push(...poseFixe(MAT.barreFixe(C, H, 1.3)));
      d.vue = { az: 70, el: 6 }; return d;
    }
    if (o.drapeau) {
      // Drapeau : le corps à l'horizontale, de profil, tenu à bout de bras à un poteau (une main haute, une main basse).
      const xp = -1.02;
      const p = { bassin: { pos: V(0, 1.3, 0), rot: qZ(90) }, lombaires: 0, thorax: 0, cou: 0, inclinaison: 5, bras: {}, jambes: pareil(J(2, 7, 0, 3, 40)) };
      const t = c.tronc(p), mi = t.epaules.G.clone().add(t.epaules.D).multiplyScalar(0.5);
      p.bassin.pos.x += xp + 0.44 - mi.x;
      const t2 = c.tronc(p);
      p.bras.G = { prise: V(xp, t2.epaules.G.y + 0.38, 0), pole: V(1, 1, 0.2), paume: V(0, 0, -1), doigts: 'barre' };
      p.bras.D = { prise: V(xp, t2.epaules.D.y - 0.4, 0), pole: V(1, -1, 0.2), paume: V(0, 0, 1), doigts: 'barre' };
      respire(p);
      fixe.push(pret(cyl(0.03, 2.7, xp, 1.35, 0, C.metal, 0.8, DEBOUT_Q)), pret(boite(0.5, 0.04, 0.5, xp, 0.02, 0, C.cadre, 0.5)));
      d.vue = { az: 0, el: 6 }; return d;
    }
    if (o.muscleup) {
      // De la suspension à l'appui : traction explosive, passage des coudes au-dessus de la barre, puis poussée bras tendus.
      const ecart = o.anneaux ? 0.26 : 0.3, pendu = 0.96 * Ap;
      const pose = (yEp, zEp, penche, jambes, pole, paume) => {
        const p = { bassin: { pos: V(0, 1.2, 0), rot: qX(penche) }, lombaires: 4, thorax: 4, cou: -penche * 0.4, bras: {}, jambes: pareil(jambes) };
        const t = c.tronc(p); p.bassin.pos.y += yEp - t.epaules.G.y; p.bassin.pos.z += zEp - t.epaules.G.z;
        for (const [k, s] of COTES) p.bras[k] = { prise: V(s * ecart, H, 0), pole: V(s * pole[0], pole[1], pole[2]), paume: V(...paume), doigts: 'barre' };
        return p;
      };
      const K0 = pose(H - pendu, 0.02, 0, J(8, 2, 0, 12, 35), [1, -0.2, -0.25], [0, 0, 1]);
      const K1 = pose(H - 0.13, -0.14, -16, J(30, 2, 0, 10, 35), [1, -0.5, -0.4], [0, -0.4, 1]);
      const K2 = pose(H + 0.12, 0.1, 44, J(56, 2, 0, 24, 35), [0.6, 0.5, -1], [0, -1, 0]);
      const K3 = pose(H + 0.975 * Ap, 0.05, 9, J(16, 2, 0, 6, 35), [0.4, 0.3, -1], [0, -0.3, -1]);
      d.rythme = 'boucle'; d.periode = 4.6;
      d.cles = [[0, K0], [0.1, K0], [0.3, K1], [0.44, K2], [0.6, K3], [0.72, K3], [0.84, K2], [0.92, K1], [1, K0]];
      if (o.anneaux) d.tenu = [{ t: 'sangle', de: V(ecart, H + 1.6, 0), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, H + 1.6, 0), m: 'D', bout: 'anneau' }];
      else fixe.push(...poseFixe(MAT.barreFixe(C, H, 1.3)));
      if (o.leste) d.objets = (info, u, sortie) => { const b = info.bassin.clone().add(V(0, -0.36, 0.1).applyQuaternion(info.qBassin)); sortie.push(pret(seg(info.bassin.clone().add(V(0, -0.02, 0.1).applyQuaternion(info.qBassin)), b, 0.006, C.cable, 0.6))); poserObjet([cyl(0.17, 0.04, 0, 0, 0, C.fonte, 0)], b, null, sortie); };
      d.vue = { az: 205, el: 4 }; return d;
    }
    if (o.planche) {
      if (o.penchee) { const dp = FAM.pompe(c, { pseudo: true }, C); respire(dp.a); d.vue = dp.vue; return d; }
      const dp = FAM.pompe(c, { planche: true }, C), a = dp.a;
      if (o.ecart) a.jambes = pareil(J(-4, 36, 0, 3, 50));
      if (o.grenouille) {
        // Planche groupée : genoux fléchis posés contre les coudes, bras un peu pliés, les pieds décollés.
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(104) }, lombaires: 14, thorax: 8, cou: -34, bras: {}, jambes: pareil(J(118, 16, 0, 132, 40)) };
        const t = c.tronc(p); p.bassin.pos.y += 0.62 * A + L.creux - t.epaules.G.y; p.bassin.pos.z += 0.1 - t.epaules.G.z;
        for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.22, 0.008, L.main), pole: V(s * 0.6, 0.3, -1), paume: V(0, -1, 0), dirMain: V(s * 0.2, 0, 1), doigts: 'plat' };
        respire(p); d.vue = { az: 70, el: 10 }; return d;
      }
      respire(a); d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.equilibre) {
      const dp = FAM.pompe(c, { equilibre: true }, C); respire(dp.a); if (o.mur) fixe.push(...dp.fixe); d.vue = dp.vue;
      // Haussements d'épaules en équilibre : bras tendus, le corps monte et descend de quelques centimètres.
      if (o.shrug) { const b = cloner(dp.a); b.bassin.pos.y -= 0.055; for (const k of ['G', 'D']) b.bras[k].hausse = 16; d.a = dp.a; d.b = b; d.rythme = 'rep'; d.periode = 2.2; }
      return d;
    }
    if (o.tete) {
      // Poirier : le sommet du crâne au sol, les mains croisées derrière la tête, les avant-bras au sol, le corps à la verticale.
      const p = { bassin: { pos: V(0, 1, 0), rot: qX(180) }, lombaires: -2, thorax: -2, cou: 0, bras: pareil(brasRepos()), jambes: pareil(J(-1, 2, 0, 3, 45)) };
      c.poserSur(p, V(), AY, ['tete']);
      const t = c.tronc(p);
      for (const [k, s] of COTES) p.bras[k] = { dirBras: V(s * 0.42, -0.66, -0.62), dirAvantBras: V(-s * 0.5, 0.1, 0.86), paume: V(0, 0.2, -1), doigts: 'detendu' };
      respire(p); d.vue = { az: 118, el: 8 }; return d;
    }
    if (o.lsit) {
      // Équerre : en appui bras tendus sur deux barres basses, les jambes tendues à l'horizontale.
      const yM = 0.22, p = { bassin: { pos: V(0, 1, 0), rot: qX(-3) }, lombaires: 10, thorax: 6, cou: 0, bras: {}, jambes: pareil(J(88, 2, 0, 3, 40)) };
      const t = c.tronc(p); p.bassin.pos.y += yM + 0.975 * Ap - t.epaules.G.y;
      for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.27, yM, t.epaules.G.z + 0.02), pole: V(s * 0.3, 0.2, -1), paume: V(-s, 0, 0), doigts: 'barre' };
      respire(p);
      for (const s of [1, -1]) { fixe.push(pret(cyl(0.017, 0.5, s * 0.27, yM, t.epaules.G.z + 0.02, C.metal, 1, LONG_Z))); for (const z of [-0.22, 0.22]) { fixe.push(pret(boite(0.03, yM, 0.03, s * 0.27, yM / 2, t.epaules.G.z + 0.02 + z, C.cadre, 0.5))); fixe.push(pret(boite(0.22, 0.02, 0.04, s * 0.27, 0.01, t.epaules.G.z + 0.02 + z, C.cadre, 0.5))); } }
      d.vue = { az: 58, el: 10 }; return d;
    }
    throw new Error('gym : mouvement non décrit');
  };

  /* ---------- Haltérophilie et mouvements balistiques ----------
     (défaut) épaulé : la barre part du sol, monte le long du corps, se reçoit sur les épaules ; arrache (prise large,
     reçue bras tendus au-dessus de la tête) ; suspendu (départ barre aux cuisses) ; squat (réception en squat complet) ;
     tirage (sans réception : tirage d'arraché ou d'épaulé) ; jete (épaulé puis jeté au-dessus de la tête) ;
     hal / kb (un haltère ou un kettlebell, à un bras) ; balle (lancer de médecine-ball au sol) ; getup (relevé turc). */
  FAM.halt = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 50, el: 8 }, tenu: [], fixe, rythme: 'boucle' };
    const corps = (dy, dz, penche, pointe) => debout(c, { ecart: 0.16, ouv: 14, dy, dz, penche, pointe, lomb: -2, thor: -2, cou: -penche * 0.55 });
    const epX = c.tronc(debout(c, {})).epaules.G.x, Ap = L.bras + L.prise;
    if (o.getup) {
      // Relevé turc : couché, le kettlebell à bout de bras ; on se redresse sur le coude, sur la main, à genou, puis debout.
      const brasHaut = { dirBras: V(0, 1, 0), dirAvantBras: V(0, 1, 0), paume: V(0, 0, 1) };
      const T0 = { bassin: { pos: V(0, 0.11, 0), rot: qX(-90) }, lombaires: 0, thorax: 0, cou: 6, bras: { D: cloner(brasHaut), G: B(90, 42, 0, 6, 150, { doigts: 'plat' }) }, jambes: { G: J(4, 12, 0, 4, 20), D: J(52, 6, 0, 96, 0) } };
      const T1 = { bassin: { pos: V(0, 0.12, 0), rot: qX(-78).multiply(qZ(8)) }, lombaires: 26, thorax: 12, torsion: 26, cou: 10, bras: { D: cloner(brasHaut), G: B(60, 34, 0, 86, 150, { doigts: 'plat' }) }, jambes: { G: J(16, 12, 0, 4, 20), D: J(60, 8, 0, 100, 0) } };
      const T2 = { bassin: { pos: V(0, 0.12, 0), rot: qX(-34).multiply(qZ(6)) }, lombaires: 14, thorax: 8, torsion: 22, cou: 6, bras: { D: cloner(brasHaut), G: B(96, -34, 0, 4, 150, { doigts: 'plat' }) }, jambes: { G: J(56, 12, 0, 4, 20), D: J(92, 8, 0, 104, 0) } };
      const T3 = demiGenou(c, { bas: 'G' }); T3.bras = { D: cloner(brasHaut), G: B(60, 16, 0, 10, 90, { doigts: 'detendu' }) }; T3.cou = -8;
      const T4 = debout(c, { ecart: 0.12, ouv: 8 }); T4.bras = { D: cloner(brasHaut), G: B(60, 12, 0, 10, 90, { doigts: 'detendu' }) }; T4.cou = -8;
      for (const p of [T0, T1, T2]) c.poserSur(p, V(), AY, ['bassin', 'cuisse', 'jambe', 'pied', 'dos', 'thorax']);
      T3.bassin.pos.z = 0.25; T4.bassin.pos.z += 0.3; for (const k of ['G', 'D']) T4.jambes[k].cheville.z += 0.3;
      d.periode = 9; d.filet = true;
      d.cles = [[0, T0], [0.06, T0], [0.2, T1], [0.34, T2], [0.52, T3], [0.66, T4], [0.74, T4], [0.84, T3], [0.92, T2], [0.97, T1], [1, T0]];
      d.tenu = [{ t: 'kb', m: 'D', sens: 'avantbras' }];
      d.vue = { az: 55, el: 12 }; return d;
    }
    if (o.balle) {
      // Médecine-ball : montée au-dessus de la tête sur la pointe des pieds, puis lancer vers le sol en fléchissant.
      const tenir = (p, pos) => { for (const [k, s] of COTES) p.bras[k] = { prise: pos.clone().add(V(s * 0.115, 0, 0)), pole: V(s * 1, -0.3, -0.3), paume: V(-s, 0, 0), dirMain: unite(pos.clone().sub(c.tronc(p).cou).add(V(0, 0.3, 0.2))), doigts: 'plat' }; return p; };
      const p0 = corps(0, 0, 0), t0 = c.tronc(p0);
      const K0 = tenir(p0, V(0, t0.epaules.G.y - 0.2, 0.3));
      const p1 = corps(0.05, 0.01, -4, 34), K1 = tenir(p1, V(0, c.tronc(p1).epaules.G.y + 0.5, 0.06));
      const p2 = corps(-0.3, -0.18, 44), K2 = tenir(p2, V(0, 0.34, 0.36));
      d.periode = 2.6; d.cles = [[0, K0], [0.1, K0], [0.34, K1], [0.42, K1], [0.56, K2], [0.7, K2], [1, K0]];
      d.tenu = [{ t: 'balle', m: 'GD', r: 0.12 }];
      return d;
    }
    const un = o.hal || o.kb, arrache = !!o.arrache, e = un ? 0.03 : arrache ? 0.45 : 0.27;
    // Les mains tiennent la charge à la hauteur y, au ras des jambes.
    const tenirBas = (p, y, hausse) => {
      const z = (y < 0.9 ? c.devantJambes(p, y - 0.1, y + 0.1) : c.tronc(p).hanches.G.z + L.ventre) + (un ? 0.09 : 0.03);
      for (const [k, s] of COTES) {
        if (un && k === 'D') { p.bras.D = B(70, 30, 0, 30, 90, { doigts: 'detendu' }); continue; }
        p.bras[k] = { prise: V(s * e, y, z), pole: V(s * 1, 0.4, -0.4), paume: un ? V(-s * 0.3, -0.2, -1) : V(0, -0.2, -1), doigts: 'barre', hausse: hausse || 0 };
      }
      return p;
    };
    // Réception : sur les épaules (épaulé), ou bras tendus au-dessus de la tête (arraché, jeté).
    const auDessus = p => {
      const t = c.tronc(p), dx = e - epX, hautR = Math.sqrt(Math.max(0.01, Math.pow(0.97 * Ap, 2) - dx * dx));
      for (const [k, s] of COTES) {
        if (un && k === 'D') { p.bras.D = B(70, 40, 0, 20, 90, { doigts: 'detendu' }); continue; }
        p.bras[k] = { prise: V(un ? s * (epX + 0.02) : s * e, t.epaules.G.y + (un ? 0.97 * Ap : hautR), t.epaules.G.z - 0.03), pole: V(s * 1, -0.2, -0.3), paume: un ? V(-s * 0.3, 0, 1) : V(0, 0.2, 1), doigts: 'barre' };
      }
      return p;
    };
    const auxEpaules = p => {
      if (un) { const t = c.tronc(p); p.bras.G = { prise: t.duThorax(V(0.15, -0.1, 0.15)), pole: V(0.5, -1, 0.1), paume: V(-1, 0, 0.2).applyQuaternion(t.qThorax), dirMain: V(-0.2, 1, 0).applyQuaternion(t.qThorax), doigts: 'barre' }; p.bras.D = B(70, 34, 0, 26, 90, { doigts: 'detendu' }); return p; }
      porter(c, p, { barre: true, avant: true }, C, 0); return p;
    };
    const yBas = un ? (o.kb ? 0.3 : 0.2) : 0.225;
    const K0 = tenirBas(arrache || un ? corps(-0.44, -0.23, 50) : corps(-0.34, -0.2, 50), yBas);
    const K1 = tenirBas(corps(-0.15, -0.14, 42), 0.53);
    const Kh = tenirBas(corps(0, 0, 2), 0.86);
    const K2 = tenirBas(corps(0.05, 0.02, -7, 34), 1.0, 16);
    const bas = o.squat ? -0.46 : -0.16;
    const K3 = (arrache ? auDessus : auxEpaules)(corps(bas, o.squat ? -0.1 : -0.06, o.squat ? 16 : 8));
    const K4 = (arrache ? auDessus : auxEpaules)(corps(0, 0, 0));
    const depart = o.suspendu ? Kh : K0;
    d.periode = o.jete ? 5.4 : 4.2;
    if (o.tirage) d.cles = [[0, K0], [0.1, K0], [0.34, K1], [0.5, K2], [0.58, K2], [0.74, K1], [0.92, K0], [1, K0]];
    else if (o.jete) {
      // Épaulé, flexion, puis poussée au-dessus de la tête.
      const K5 = auxEpaules(corps(-0.1, -0.03, 4)), K6 = auDessus(corps(0, 0, 0));
      d.cles = [[0, depart], [0.06, depart], [0.16, K1], [0.24, K2], [0.33, K3], [0.42, K4], [0.5, K4], [0.57, K5], [0.66, K6], [0.76, K6], [0.84, K4], [0.92, Kh], [1, depart]];
    } else d.cles = (o.suspendu ? [[0, Kh], [0.1, Kh], [0.24, K1]] : [[0, K0], [0.08, K0], [0.22, K1]]).concat([[0.33, K2], [0.45, K3], [0.58, K4], [0.7, K4], [0.82, Kh], [0.94, depart], [1, depart]]);
    d.tenu = o.kb ? [{ t: 'kb', m: 'G', sens: 'avantbras' }] : o.hal ? [{ t: 'haltere', m: 'G', k: 1.15 }] : [{ t: 'barre', l: 1.6, d: 0.225 }];
    return d;
  };

  /* ---------- Sauts ----------
     boite (saut sur une boîte ; unejambe) ; longueur (saut en longueur sans élan) ; pogo (petits rebonds jambes
     tendues) ; genoux (montées de genoux sautillées). */
  FAM.saut = (c, o, C) => {
    // Sorte par défaut, admise dans l'écriture : o.boite (saut sur une boîte).
    const L = c.L, fixe = [], d = { vue: { az: 70, el: 8 }, tenu: [], fixe, rythme: 'boucle' };
    const TAU = 2 * Math.PI;
    if (o.pogo || o.genoux) {
      d.rythme = 'continu'; d.periode = o.genoux ? 0.8 : 0.5;
      if (o.pogo) { d.pose = ph => { const w = 0.5 - 0.5 * Math.cos(TAU * ph), p = debout(c, { ecart: 0.09, ouv: 6, y0: 0.07 * w, dy: 0.07 * w + 0.045 * Math.min(1, w * 2.5), pointe: 34 * Math.min(1, w * 2.5) }); p.bras = pareil(B(30, 14, 0, 44, 90, { doigts: 'poing' })); return p; }; return d; }
      // Montées de genoux sautillées : un genou monte à hauteur de hanche, la main opposée vient le toucher.
      d.pose = ph => {
        const g = Math.max(0, Math.sin(TAU * ph)), dr = Math.max(0, -Math.sin(TAU * ph));
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(4) }, lombaires: 2, thorax: 2, cou: -4, bras: { G: B(10, 20 + 50 * dr, -20, 60 + 20 * dr, 120, { doigts: 'plat' }), D: B(10, 20 + 50 * g, -20, 60 + 20 * g, 120, { doigts: 'plat' }) }, jambes: { G: J(6 + 86 * g, 3, 0, 8 + 92 * g, 30), D: J(6 + 86 * dr, 3, 0, 8 + 92 * dr, 30) } };
        c.poserSur(p, V(), AY, ['pied']); p.bassin.pos.y += 0.04 * Math.pow(Math.cos(TAU * ph), 2); return p;
      };
      d.vue = { az: 40, el: 8 }; return d;
    }
    const hB = 0.5, loin = o.longueur ? 1.35 : 0.74, un = !!o.unejambe;
    const pied1 = p => { if (un) p.jambes.D = J(-4, 3, 0, 84, 20); return p; };
    const S0 = pied1(debout(c, { ecart: 0.12, ouv: 8 }));
    const S1 = pied1(debout(c, { ecart: 0.12, ouv: 8, dy: -0.24, dz: -0.15, penche: 40, cou: -24 })); S1.bras = pareil(B(0, -44, 0, 10, 90));
    const S2 = pied1(debout(c, { ecart: 0.12, ouv: 8, dy: 0.06, dz: o.longueur ? 0.14 : 0.04, penche: o.longueur ? 20 : 6, pointe: 42 })); S2.bras = pareil(B(8, 150, 0, 8, 90));
    const vol = { bassin: { pos: L.racine.clone().add(V(0, o.longueur ? 0.26 : hB + 0.12, loin * 0.52)), rot: qX(16) }, lombaires: 6, thorax: 4, cou: -6, bras: pareil(B(8, 80, 0, 14, 90)), jambes: { G: J(86, 4, 0, o.longueur ? 62 : 104, 10), D: un ? J(-4, 3, 0, 84, 20) : J(86, 4, 0, o.longueur ? 62 : 104, 10) } };
    const y1 = o.longueur ? 0 : hB;
    const S4 = pied1(debout(c, { ecart: 0.13, ouv: 10, y0: y1, zPieds: loin, dz: loin - 0.14, dy: y1 - 0.26, penche: 36, cou: -22 })); S4.bras = pareil(B(8, 70, 0, 10, 90));
    const S5 = pied1(debout(c, { ecart: 0.12, ouv: 8, y0: y1, zPieds: loin, dz: loin, dy: y1 }));
    const retour = pied1(debout(c, { ecart: 0.12, ouv: 8, y0: y1 + (o.longueur ? 0.03 : 0.05), zPieds: loin * 0.42, dz: loin * 0.42, dy: y1 + (o.longueur ? 0.03 : 0.07) }));
    d.periode = 4.2;
    d.cles = [[0, S0], [0.07, S0], [0.2, S1], [0.3, S2], [0.4, vol], [0.52, S4], [0.66, S5], [0.76, S5], [0.9, retour], [1, S0]];
    if (!o.longueur) fixe.push(pret(boite(0.7, hB, 0.62, 0, hB / 2, loin + 0.03, C.bois, 0)));
    return d;
  };
  /* ---------- Étirements, postures et mobilité ----------
     Chaque posture va de la position de départ à l'étirement, s'y tient, puis revient.
     Hanches et jambes : 9090, papillon (avant ; couche), grenouille (demi), pigeon, lezard, fente (fléchisseurs de hanche),
     monde (le « plus grand étirement du monde »), squatpli, bebe, genoupoitrine (couche), figure4 (sol), ischios
     (genou ; assis ; deux), pli (flexion avant debout), quadriceps (genou ; couche ; cote ; debout). Dos : chatvache, enfant, rotationdos, lateral,
     chienbas (debout). Haut du corps : deltarriere, pectoraux (coude ; porte ; coudes), triceps, cou (curl : flexion
     de nuque, exercice). rouleau (auto-massage : fessiers, mollets, pied). */
  FAM.etire = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 55, el: 12 }, tenu: [], fixe, rythme: 'etire' };
    const SOL = ['bassin', 'cuisse', 'jambe', 'pied'];
    const auSol = (p, regions) => c.poserSur(p, V(), AY, regions || SOL);
    const corps = (rot, plus) => Object.assign({ bassin: { pos: V(0, 0.6, 0), rot }, lombaires: 0, thorax: 0, cou: 0, bras: pareil(brasRepos()), jambes: pareil(J(0, 3, 0, 3, 10)) }, plus || {});
    // Une main va tenir un point (pied, genou, coude) : la cible est ramenée à portée de bras.
    const tenir = (p, k, cible, pole, paume) => { const info = c.poser(p), e = info.epaules[k], v = cible.clone().sub(e), R = 0.95 * (L.bras + L.prise); if (v.length() > R) v.multiplyScalar(R / v.length()); p.bras[k] = { prise: e.clone().add(v), pole: pole || V(k === 'G' ? 1 : -1, -0.5, -0.2), paume: paume || V(0, 0, -1), doigts: 'barre' }; return p; };
    const deux = (a, b) => { d.a = a; d.b = b; return d; };

    if (o['9090']) {
      const cle = u => { const p = corps(qX(6 + 26 * u), { lombaires: 8 + 14 * u, thorax: 6 * u, cou: -6 * u }); p.jambes.G = J(86 + 26 * u, 16, 84, 92, 10); p.jambes.D = J(6 + 26 * u, 82, 0, 92, 30); auSol(p); const t = c.tronc(p); for (const k of ['G', 'D']) { tenir(p, k, V(k === 'G' ? 0.32 : -0.3, 0.03, t.epaules.G.z + 0.1 + 0.16 * u), V(k === 'G' ? 0.6 : -0.6, 0.3, -0.6), V(0, -1, 0)); p.bras[k].doigts = 'detendu'; } return p; };
      d.vue = { az: 35, el: 20 }; return deux(cle(0), cle(1));
    }
    if (o.papillon) {
      const jb = () => pareil(J(66, 40, 62, 128, 20));
      if (o.couche) { const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: J(lerp(40, 58, u), lerp(8, 44, u), lerp(10, 62, u), lerp(70, 118, u), 20) }); p.bras = pareil(B(90, 40, 0, 10, 0, { doigts: 'detendu' })); auSol(p, ['bassin', 'dos', 'cuisse', 'jambe', 'pied', 'thorax']); return p; }; d.vue = { az: 50, el: 26 }; return deux(cle(0), cle(1)); }
      const cle = u => { const pen = o.avant ? 34 * u : 4 * u, p = corps(qX(2 + pen), { lombaires: 6 + (o.avant ? 22 * u : 0), thorax: o.avant ? 10 * u : 0, cou: o.avant ? 10 * u : 0, jambes: pareil(J(66 + 0.9 * pen, lerp(30, 44, o.avant ? 0.6 : u), 62, 128, 20)) }); auSol(p); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.chevilles[k].clone().add(V(0, 0.04, 0.02)), V(k === 'G' ? 1 : -1, 0.2, -0.3), V(0, -1, 0)); return p; };
      d.vue = { az: 30, el: 20 }; return deux(cle(0), cle(1));
    }
    if (o.grenouille) {
      // À quatre pattes, genoux très écartés : le bassin recule vers les talons, puis revient.
      const cle = u => {
        const p = corps(qX(88), { cou: -20, jambes: { G: J(lerp(84, 116, u), 44, 0, lerp(90, 118, u), 40), D: o.demi ? J(lerp(60, 86, u), 78, 0, 4, 0) : J(lerp(84, 116, u), 44, 0, lerp(90, 118, u), 40) } });
        auSol(p, ['jambe', 'pied']); p.bassin.pos.z = -0.2 * u;
        const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.2, 0.008, t.epaules.G.z + 0.04 + 0.2 * u), pole: V(s * 0.4, 0.4, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
        return p;
      };
      d.rythme = 'rep'; d.periode = 3.6; d.vue = { az: 60, el: 18 }; return deux(cle(0), cle(1));
    }
    if (o.chatvache) {
      const base = quatrePattes(c, {});
      const cle = u => { const p = cloner(base); p.lombaires = lerp(-18, 26, u); p.thorax = lerp(-10, 20, u); p.cou = lerp(-34, 28, u); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k].prise = V(t.epaules[k].x + s * 0.01, 0.008, t.epaules[k].z + 0.02); return p; };
      d.rythme = 'rep'; d.periode = 4.4; d.vue = { az: 72, el: 12 }; return deux(cle(0), cle(1));
    }
    if (o.enfant) {
      // De la position à quatre pattes, les fesses reculent sur les talons, le buste se couche sur les cuisses, bras allongés devant.
      const zM = quatrePattes(c, {}).bras.G.prise.z;
      const cle = u => {
        const p = corps(qX(lerp(86, 80, u)), { lombaires: 24 * u, thorax: 10 * u, cou: lerp(-25, 8, u), jambes: pareil(J(lerp(86, 132, u), lerp(6, 12, u), 0, lerp(90, 150, u), 62)) });
        auSol(p, ['jambe', 'pied']);
        const info = c.poser(p); p.bassin.pos.z += -info.genoux.G.z;
        const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.18, 0.008, Math.min(zM + 0.36, t.epaules.G.z + lerp(0.03, 0.5, u))), pole: V(s * 0.5, 0.5, -0.6), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
        return p;
      };
      d.cles = [0, 0.33, 0.66, 1].map(u => [u, cle(u)]); d.vue = { az: 70, el: 14 }; return d;
    }
    if (o.rotationdos) {
      // À quatre pattes, une main à la nuque : le coude plonge vers le bras d'appui, puis s'ouvre vers le plafond.
      const base = quatrePattes(c, {});
      const cle = u => { const p = cloner(base); p.torsion = lerp(-24, 52, u); p.couRot = lerp(-10, 30, u); p.bras.G = mains(c, c.tronc(p), 'nuque').G; return p; };
      d.rythme = 'rep'; d.periode = 4; d.vue = { az: 40, el: 16 }; return deux(cle(0), cle(1));
    }
    if (o.lateral) {
      const cle = u => { const p = debout(c, { ecart: 0.12, ouv: 8, dx: -0.04 * u }); p.inclinaison = -30 * u; p.couIncl = -8 * u; p.bras.G = B(90, lerp(8, 172, Math.min(1, u * 3)), 0, 8, 90, { doigts: 'plat' }); p.bras.D = mains(c, c.tronc(p), 'hanches').D; return p; };
      d.vue = { az: 8, el: 8 }; return deux(cle(0), cle(1));
    }
    if (o.chienbas) {
      if (o.debout) {
        // Mains sur un appui à hauteur de hanches, buste à l'horizontale, bras dans le prolongement du dos.
        const cle = u => { const p = debout(c, { ecart: 0.12, ouv: 6, penche: lerp(48, 88, u), dz: lerp(-0.15, -0.28, u), dy: -0.03, lomb: -2, cou: -lerp(10, 20, u) }); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.2, 0.96, 0.62), pole: V(s * 0.5, -1, 0), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
        fixe.push(pret(boite(0.9, 0.04, 0.3, 0, 0.93, 0.7, C.banc, 0)), pret(boite(0.05, 0.92, 0.05, -0.4, 0.46, 0.75, C.cadre, 0.5)), pret(boite(0.05, 0.92, 0.05, 0.4, 0.46, 0.75, C.cadre, 0.5)));
        d.vue = { az: 70, el: 8 }; return deux(cle(0), cle(1));
      }
      const A = L.bras + L.avantBras, ap = appuiPike(c, { yPieds: 0, portee: 0.98, poignet: V(0.24, L.creux + 0.008, -L.main), cou: 16, pointe: 12 });
      const cle = u => { const p = ap(0.975 * A, lerp(66, 88, u)); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.24, 0.008, 0), pole: V(s * 0.8, 0.4, 0.2), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      d.vue = { az: 70, el: 10 }; return deux(cle(0), cle(1));
    }
    if (o.pigeon || o.lezard || o.fente || o.monde) {
      // Grande fente basse : pied gauche devant, jambe droite allongée derrière.
      const cle = u => {
        const bas = o.pigeon ? 0.16 : o.fente ? 0.42 : 0.3;
        const p = corps(qX(o.pigeon ? lerp(38, 52, u) : o.fente ? lerp(4, -4, u) : 58), { lombaires: o.pigeon ? lerp(-30, 14, u) : o.fente ? -8 * u : 8, thorax: o.pigeon ? lerp(-8, 12, u) : 0, cou: o.fente ? 0 : o.pigeon ? lerp(0, 10, u) : -14 });
        p.bassin.pos = V(0, bas, 0);
        if (o.pigeon) { p.jambes.G = J(lerp(128, 142, u), 26, 72, 104, 10); p.jambes.D = J(lerp(-44, -30, u), 4, 0, 6, 58); auSol(p, ['cuisse', 'jambe', 'pied', 'bassin']); }
        else {
          const av = o.fente ? lerp(0.5, 0.62, u) : 0.56;
          p.jambes.G = pied(c, 1, { x: 0.15, z: av, ouv: 6 });
          p.jambes.D = o.fente ? { cheville: V(-0.11, 0.07, -0.72), pole: V(0, -1, 0.2), pied: V(0, -0.2, -1), hautPied: V(0, -1, 0.2) } : { cheville: V(-0.11, 0.15, -0.82), pole: V(0, -1, 0.2), pied: V(0, -1, 0.22), hautPied: V(0, 0.2, 1), orteils: 60 };
          p.bassin.pos.y = o.fente ? lerp(0.46, 0.36, u) : 0.34; p.bassin.pos.z = o.fente ? lerp(-0.1, 0.04, u) : -0.02;
        }
        const t = c.tronc(p);
        if (o.pigeon) { for (const k of ['G', 'D']) tenir(p, k, V(k === 'G' ? 0.3 : -0.3, 0.03, t.epaules.G.z + lerp(0.02, 0.44, u)), V(k === 'G' ? 0.6 : -0.6, 0.3, -0.6), V(0, -1, 0)); for (const k of ['G', 'D']) p.bras[k].doigts = 'detendu'; }
        else if (o.fente) p.bras = mains(c, t, 'hanches');
        else if (o.lezard) for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.1 - 0.06, lerp(0.008, 0.035, u), t.epaules.G.z + 0.02 + 0.27 * u), pole: V(s * 0.3, lerp(0.5, -1, u), -0.4), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
        else {
          // Le plus grand étirement du monde : main droite au sol, le bras gauche s'ouvre vers le plafond, le buste tourne.
          p.torsion = 62 * u; p.couRot = 34 * u;
          p.bras.D = { prise: V(-0.2, 0.008, t.epaules.G.z + 0.02), pole: V(-0.5, 0.4, -0.6), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
          p.bras.G = u < 0.02 ? { prise: V(-0.02, 0.06, t.epaules.G.z + 0.08), pole: V(0.6, 0.6, -0.3), paume: V(0, -1, 0), doigts: 'detendu' } : { dirBras: unite(V(0.25, lerp(-1, 1, u), 0.1)), dirAvantBras: unite(V(0.3, lerp(-1, 1, u), 0.1)), paume: V(0, 0, 1), doigts: 'plat' };
        }
        if (o.lezard) p.bassin.pos.y = lerp(0.34, 0.29, u);
        return p;
      };
      if (o.monde) { d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); d.rythme = 'rep'; d.periode = 4.6; d.vue = { az: 40, el: 14 }; return d; }
      d.vue = { az: 62, el: 14 }; return deux(cle(0), cle(1));
    }
    if (o.squatpli) {
      // Accroupi, les mains tiennent les pointes de pieds ; les jambes se tendent, le buste reste plié sur les cuisses.
      const cle = u => { const p = debout(c, { ecart: 0.24, ouv: 24, dy: lerp(-0.6, -0.14, u), dz: lerp(-0.2, -0.2, u), penche: lerp(34, 98, u), lomb: lerp(14, 30, u), thor: 10, cou: lerp(-20, 20, u) }); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.orteils[k].clone().add(V(0, 0.03, 0.04)), V(k === 'G' ? 1 : -1, 0.3, -0.2), V(0, -1, 0)); return p; };
      d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); d.rythme = 'rep'; d.periode = 5; d.vue = { az: 40, el: 10 }; return d;
    }
    if (o.bebe) {
      const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: J(lerp(90, 128, u), lerp(8, 30, u), 8, lerp(90, 96, u), 0) }); p.lombaires = 6 * u; const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.chevilles[k].clone().add(V(k === 'G' ? 0.03 : -0.03, 0.03, 0)), V(k === 'G' ? 1 : -1, -0.2, 0.3), V(k === 'G' ? -1 : 1, 0, 0)); return p; };
      d.vue = { az: 55, el: 24 }; return deux(cle(0), cle(1));
    }
    if (o.genoupoitrine) {
      if (o.couche) { const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: { G: J(lerp(40, 128, u), 4, 0, lerp(60, 130, u), 10), D: J(o.deux ? lerp(40, 128, u) : 4, 4, 0, o.deux ? lerp(60, 130, u) : 4, 20) } }); auSol(p, ['bassin', 'dos', 'thorax', 'jambe', 'pied']); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.genoux[o.deux ? k : 'G'].clone().add(V(k === 'G' ? 0.05 : -0.05, 0.02, -0.06)), V(k === 'G' ? 1 : -1, -0.3, 0.3), V(0, -0.3, -1)); return p; }; d.vue = { az: 60, el: 22 }; return deux(cle(0), cle(1)); }
      const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6 }); p.jambes.G = J(lerp(10, 116, u), 4, 0, lerp(10, 128, u), 20); const info = c.poser(p); if (u > 0.05) for (const k of ['G', 'D']) tenir(p, k, info.genoux.G.clone().add(V(k === 'G' ? 0.05 : -0.05, -0.06, 0.07)), V(k === 'G' ? 1 : -1, -0.6, 0), V(0, 0, -1)); return p; };
      d.cles = [0, 0.3, 1].map(u => [u, cle(u)]); d.vue = { az: 40, el: 8 }; return d;
    }
    if (o.figure4) {
      if (o.sol) {
        // Sur le dos : une cheville posée sur le genou opposé, les mains ramènent la cuisse vers la poitrine.
        const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: { G: J(lerp(62, 104, u), 4, 0, lerp(100, 96, u), 10), D: J(lerp(70, 104, u), 34, 72, 92, 10) } }); auSol(p, ['bassin', 'dos', 'thorax', 'jambe', 'pied']); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.genoux.G.clone().add(V(k === 'G' ? 0.05 : -0.05, -0.02, -0.08)), V(k === 'G' ? 1 : -1, -0.3, 0.3), V(0, -0.3, -1)); return p; };
        d.vue = { az: 60, el: 22 }; return deux(cle(0), cle(1));
      }
      const cle = u => { const p = assis(c, { h: 0.46, penche: lerp(2, 32, u), ecart: 0.12 }); p.lombaires = 12 * u; p.jambes.D = J(lerp(80, 84, u) + lerp(2, 32, u), 22, 74, 96, 10); const info = c.poser(p); p.bras.D = B(20, 30, 0, 60, 150, { doigts: 'detendu' }); p.bras.G = B(20, 30, 0, 60, 150, { doigts: 'detendu' }); return p; };
      fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, 0.3)));
      d.vue = { az: 38, el: 12 }; return deux(cle(0), cle(1));
    }
    if (o.pli) {
      // Flexion avant debout : jambes tendues, le buste se plie, les mains descendent vers le sol.
      const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6, penche: lerp(4, 104, u), dz: lerp(0, -0.11, u), dy: -0.03 * u, lomb: 26 * u, thor: 14 * u, cou: lerp(0, 16, u) }); p.bras = pareil(B(6, lerp(8, 96, u), 0, 6, 150, { doigts: 'detendu' })); return p; };
      d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); d.vue = { az: 70, el: 8 }; return d;
    }
    if (o.ischios) {
      if (o.assis) {
        // Assis, une jambe tendue, l'autre repliée pied contre la cuisse : le buste se penche vers le pied.
        const cle = u => { const pen = lerp(6, 44, u), p = corps(qX(pen), { lombaires: 10 + 22 * u, thorax: 12 * u, cou: 8 * u }); p.jambes.G = J(88 + pen, 4, 0, 3, -10); p.jambes.D = o.deux ? J(88 + pen, 4, 0, 3, -10) : J(64 + pen, 40, 66, 132, 20); auSol(p); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.orteils.G.clone().add(V(k === 'G' ? 0.04 : -0.04, 0.02, -0.04)), V(k === 'G' ? 1 : -1, 0.4, -0.2), V(0, -1, 0)); return p; };
        d.vue = { az: 50, el: 16 }; return deux(cle(0), cle(1));
      }
      // Un genou à terre, la jambe avant tendue talon au sol : le buste se penche sur elle.
      const cle = u => { const pen = lerp(4, 52, u), p = corps(qX(pen), { lombaires: 14 * u, cou: -10 * u }); p.jambes.D = J(pen + lerp(0, -8, u), 5, 0, lerp(92, 100, u), 62); p.jambes.G = J(pen + lerp(74, 80, u), 5, 0, lerp(26, 4, u), -18); auSol(p, ['jambe', 'pied']); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.genoux.G.clone().add(V(k === 'G' ? 0.08 : -0.08, lerp(0.1, -0.08, u), lerp(0, 0.22, u))), V(k === 'G' ? 1 : -1, 0.2, -0.4), V(0, -1, 0)); return p; };
      d.vue = { az: 62, el: 12 }; return deux(cle(0), cle(1));
    }
    if (o.quadriceps) {
      if (o.debout) { const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6 }); if (u > 0) p.jambes.G = J(lerp(4, -14, u), 4, 0, lerp(20, 142, u), 30); const info = c.poser(p); if (u > 0.3) tenir(p, 'G', info.chevilles.G.clone().add(V(0.02, -0.04, -0.03)), V(1, 0, -1), V(0, 0, 1)); p.bras.D = B(90, 40 * u, 0, 8, 90); return p; }; d.cles = [0, 0.4, 1].map(u => [u, cle(u)]); d.vue = { az: 70, el: 8 }; return d; }
      if (o.couche || o.cote) {
        const cle = u => {
          const p = o.cote ? surLeCote(c, { cote: 'D', jambes: { D: J(14, 0, 0, 20, 20), G: J(lerp(10, -16, u), 2, 0, lerp(30, 140, u), 30) } }) : aPlatVentre(c, { h: 0, angle: 0, jambes: { D: J(0, 5, 0, 3, 55), G: J(lerp(0, -4, u), 5, 0, lerp(10, 138, u), 40) }, cou: -10 });
          const info = c.poser(p);
          if (u > 0.3) tenir(p, 'G', info.chevilles.G.clone().add(V(0, 0.02, 0)), o.cote ? V(0, 1, -1) : V(1, 1, -0.5), V(0, 0, 1));
          const front = k => ({ prise: V((k === 'G' ? 1 : -1) * 0.07, 0.03, info.tete.z + 0.06), pole: V(k === 'G' ? 1 : -1, 0.15, -0.1), paume: V(0, -1, 0), dirMain: V(k === 'G' ? -1 : 1, 0, 0.3), doigts: 'plat' });
          if (u <= 0.3) p.bras.G = o.cote ? B(40, 20, 0, 30, 150) : front('G');
          p.bras.D = o.cote ? B(10, 160, 0, 24, 90, { doigts: 'plat' }) : front('D');
          if (o.cote) c.poserSur(p, V(), AY);
          return p;
        };
        d.cles = [0, 0.4, 1].map(u => [u, cle(u)]); d.vue = o.cote ? { az: 0, el: 18 } : { az: 62, el: 20 }; return d;
      }
      // Un genou à terre : la main attrape le pied arrière et ramène le talon vers la fesse.
      const cle = u => { const p = demiGenou(c, { bas: 'G' }); p.jambes.G = J(lerp(0, -6, u), 5, 0, lerp(90, 146, u), 62); p.bassin.pos.z += 0.03 * u; const info = c.poser(p); if (u > 0.3) tenir(p, 'G', info.chevilles.G.clone().add(V(0.02, 0.0, -0.03)), V(1, 0.2, -1), V(0, 0, 1)); p.bras.D = B(20, 40, 0, 50, 150, { doigts: 'detendu' }); return p; };
      d.cles = [0, 0.4, 1].map(u => [u, cle(u)]); d.vue = { az: 66, el: 10 }; return d;
    }
    if (o.deltarriere) {
      const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8 }); p.bras.G = B(lerp(40, -34, u), lerp(20, 88, u), 0, 6, 90, { doigts: 'detendu' }); const info = c.poser(p); p.bras.D = u > 0.3 ? { prise: info.coudes.G.clone().add(V(0.0, -0.01, 0.07)), pole: V(-1, -0.6, 0.2), paume: V(0, 0, -1), doigts: 'detendu' } : B(30, 40 * u / 0.3, 0, 60 * u / 0.3, 90, { doigts: 'detendu' }); return p; };
      d.cles = [0, 0.35, 1].map(u => [u, cle(u)]); d.vue = { az: 18, el: 8 }; return d;
    }
    if (o.triceps) {
      const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8 }); p.bras.G = B(70, lerp(20, 170, u), 0, lerp(10, 146, u), 90, { doigts: 'detendu' }); const info = c.poser(p); p.bras.D = u > 0.5 ? { prise: info.coudes.G.clone().add(V(-0.02, 0.05, 0.0)), pole: V(-1, 0.2, -0.3), paume: V(1, -0.3, 0), doigts: 'detendu' } : B(60, 150 * u / 0.5, 0, 30, 90, { doigts: 'detendu' }); return p; };
      d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); d.vue = { az: 150, el: 8 }; return d;
    }
    if (o.pectoraux) {
      if (o.coudes) { const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8 }); p.thorax = -10 * u; p.lombaires = -4 * u; const t = c.tronc(p); p.bras = mains(c, t, 'nuque'); for (const [k, s] of COTES) p.bras[k].pole = V(s * 1, 0, lerp(0.5, -0.5, u)).applyQuaternion(t.qThorax); return p; }; d.vue = { az: 30, el: 8 }; return deux(cle(0), cle(1)); }
      if (o.porte) {
        // Dans l'encadrement d'une porte : les avant-bras sur les montants, le corps avance.
        const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6, dz: 0.11 * u, penche: 4 * u }); p.jambes.G = pied(c, 1, { x: 0.1, z: 0.22 }); p.jambes.D = pied(c, -1, { x: -0.1, z: -0.2, pointe: 16 * u }); const t = c.tronc(debout(c, {})); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.46, t.epaules.G.y + 0.26, 0.05), pole: V(s * 0.6, -1, -0.2), paume: V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'plat' }; return p; };
        for (const s of [1, -1]) fixe.push(pret(boite(0.1, 2.1, 0.1, s * 0.5, 1.05, 0.12, C.cadre, 0.3))); fixe.push(pret(boite(1.1, 0.1, 0.1, 0, 2.1, 0.12, C.cadre, 0.3)));
        d.vue = { az: 150, el: 8 }; return deux(cle(0), cle(1));
      }
      // Une main (ou l'avant-bras, coude à angle droit) contre un montant : le corps se détourne.
      const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8, lacet: -34 * u }); const t = c.tronc(debout(c, {})); p.bras.G = o.coude ? { prise: V(0.42, t.epaules.G.y + 0.27, 0.02), pole: V(0.3, -1, -0.5), paume: V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'plat' } : { prise: V(0.56, t.epaules.G.y + 0.02, 0.0), pole: V(0, -1, -0.3), paume: V(0, 0, 1), dirMain: V(1, 0.2, 0), doigts: 'plat' }; return p; };
      fixe.push(pret(boite(0.1, 2.1, 0.1, o.coude ? 0.47 : 0.66, 1.05, 0.1, C.cadre, 0.3)));
      d.vue = { az: 150, el: 8 }; return deux(cle(0), cle(1));
    }
    if (o.cou) {
      if (o.curl) {
        // Flexion de nuque, sur le dos, la tête dépassant du banc.
        const cle = u => { const p = allonge(c, { h: 0.44, angle: 0, d: -0.42, jambes: 'sol', cou: lerp(-24, 34, u) }); p.bras = mains(c, c.tronc(p), 'poitrine'); return p; };
        fixe.push(...poseFixe(MAT.banc(C, 0, 0.44, 0.62, 0.5)));
        d.rythme = 'rep'; d.vue = { az: 60, el: 14 }; return deux(cle(0), cle(1));
      }
      const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8 }); p.couIncl = 34 * u; const info = c.poser(p); if (u > 0.4) p.bras.G = { prise: info.tete.clone().add(V(-0.05, 0.19, 0.0)), pole: V(1, 0.5, -0.2), paume: V(-0.3, -1, 0), doigts: 'detendu' }; else p.bras.G = B(90, 150 * u / 0.4, 0, 60 * u / 0.4, 90, { doigts: 'detendu' }); return p; };
      d.cles = [0, 0.4, 1].map(u => [u, cle(u)]); d.vue = { az: 10, el: 6 }; return d;
    }
    if (o.rouleau) {
      // Auto-massage au rouleau : le corps va et vient dessus.
      // Zone par défaut, admise dans l'écriture : o.fessiers.
      d.rythme = 'continu'; d.periode = 2.6;
      if (o.pied) { const base = debout(c, { ecart: 0.1, ouv: 6 }); d.pose = ph => { const p = cloner(base), w = Math.sin(2 * Math.PI * ph); p.jambes.G = pied(c, 1, { x: 0.1, z: L.racine.z + L.hanche.z + 0.1 + 0.05 * w, y0: 0.045, pointe: 6 }); p.bras = mains(c, c.tronc(p), 'hanches'); return p; }; d.objets = (info, u, sortie) => sortie.push(pret(sphere(0.035, info.orteils.G.x, 0.035, info.chevilles.G.z + 0.06, C.ballon, 0))); d.vue = { az: 50, el: 10 }; return d; }
      const mollets = !!o.mollets;
      d.pose = ph => {
        const w = Math.sin(2 * Math.PI * ph), p = corps(qX(mollets ? -34 : -36), { lombaires: 10, cou: 8 });
        p.jambes = mollets ? pareil(J(56, 4, 0, 4, 10)) : { G: J(118, 6, 0, 128, 0), D: J(112, 28, 70, 100, 10) };
        p.bassin.pos = V(0, mollets ? 0.2 : 0.235, (mollets ? 0.07 : 0.05) * w);
        const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.25, 0.008, t.epaules.G.z - 0.12), pole: V(s * 0.2, 0.2, -1), paume: V(0, -1, 0), dirMain: V(s * 0.3, 0, -1), doigts: 'plat' };
        return p;
      };
      d.objets = (info, u, sortie) => { const z = mollets ? (info.chevilles.G.z + info.genoux.G.z) / 2 + 0.03 : 0.0, y = 0.07; sortie.push(pret(cyl(0.07, 0.42, 0, y, mollets ? 0.62 : 0, C.ballon, 0))); };
      d.vue = { az: 60, el: 14 }; return d;
    }
    throw new Error('etire : posture non décrite (' + (o._ || []).join(' ') + ')');
  };

  /* ---------- La table : chaque mouvement et les exercices de la bibliothèque qui l'exécutent ---------- */
  const EXERCICES = {
    "planche rollout":["e119"],
    "abdos":["sw-crunchs-abdominaux","sw-crunch-allonge-a-la-machine"],
    "abdos vacuum":["sw-aspiration-abdominale"],
    "abdos chevilles":["sw-taps-de-cheville"],
    "abdos velo":["sw-crunchs-velos-avec-elastique","e244","sw-crunchs-en-bicyclette"],
    "rotation hache elas demigenou":["sw-rotation-a-genou-avec-elastique"],
    "abdos elas torsion":["sw-crunch-torsion-a-genoux-avec-bande"],
    "rotation pallof elas":["sw-press-pallof-avec-bande"],
    "rotation russe elas":["sw-rotation-russe-avec-elastique"],
    "abdos elas debout":["sw-crunchs-debout-avec-elastique"],
    "rotation flexion elas":["sw-flexion-laterale-debout-avec-bande-elastique"],
    "abdos elas debout torsion":["sw-crunchs-debout-avec-rotation-et-elastique"],
    "rotation debout elas":["sw-rotation-horizontale-avec-bande-elastique"],
    "planche rollout barre":["sw-deroule-a-la-barre-a-genoux"],
    "rotation debout barre":["sw-rotation-debout-avec-barre"],
    "planche ours":["sw-planche-de-l-x27-ours"],
    "planche birddog":["e225"],
    "planche birddog planche mains":["sw-planche-avec-extension-bras-et-jambe-opposes"],
    "rotation moulinet":["sw-moulinet-au-poids-du-corps"],
    "rotation hache bas":["sw-rotation-ascendante"],
    "rotation pallof poulie":["sw-pallof-press-horizontal-a-la-poulie"],
    "abdos poulie lateral":["sw-crunch-lateral-a-genoux-avec-cable"],
    "rotation debout poulie":["sw-rotation-avec-cable-horizontale"],
    "rotation hache poulie":["sw-rotation-avec-cable-haut-bas"],
    "suspendu chaise jambes":["sw-elevations-de-jambes-droites-a-la-chaise-romaine"],
    "suspendu chaise":["e1026","sw-releve-de-genoux-a-l-x27-ab-coaster"],
    "planche crabe":["sw-posture-du-crabe"],
    "abdos deadbug":["e226"],
    "abdos deadbug balle":["sw-dead-bug-avec-ballon","sw-insecte-mort-leste"],
    "abdos decline":["sw-crunchs-sur-banc-decline"],
    "abdos dragon":["e123"],
    "rotation russe hal":["sw-rotation-russe-avec-halteres"],
    "planche cote hal":["sw-pont-lateral-avec-halteres"],
    "rotation flexion hal":["sw-inclinaison-laterale-debout-avec-halteres"],
    "abdos grenouille":["sw-crunch-grenouille"],
    "suspendu garhammer":["sw-elevation-suspendue-des-jambes-en-prise-garhammer"],
    "suspendu moulinet":["sw-demi-moulinet-suspendu"],
    "suspendu cercles":["sw-cercles-de-genoux-en-suspension"],
    "suspendu":["sw-elevations-de-genoux-suspendues"],
    "suspendu poitrine":["sw-elevation-des-genoux-a-la-poitrine-en-suspension"],
    "suspendu coudes":["sw-genoux-aux-coudes-suspendus"],
    "suspendu barre":["sw-elevation-des-jambes-suspendues-a-la-barre","e202"],
    "suspendu oblique":["sw-elevation-des-genoux-obliques-en-suspension"],
    "suspendu ciseaux":["sw-ciseaux-suspendus"],
    "suspendu jambes":["sw-elevation-des-jambes-suspendues"],
    "rotation hache elas":["sw-coup-de-hache-de-haut-en-bas-avec-bande-elastique"],
    "abdos hollow":["e200"],
    "abdos jambes incline":["e204"],
    "abdos situp decline torsion":["sw-redressement-assis-incline-avec-rotation"],
    "abdos situp":["sw-releve-de-buste-janda","e205"],
    "rotation moulinet kb":["e1099"],
    "abdos genoux":["sw-crunch-avec-ramene-de-genoux"],
    "abdos elas":["sw-crunchs-abdominaux-a-genoux-avec-bande"],
    "abdos poulie":["e199"],
    "rotation hache poulie genoux":["sw-rotation-du-tronc-a-la-poulie-en-position-a-genoux"],
    "gym lsit":["e1101"],
    "rotation landmine":["sw-rotation-avec-barre-en-t"],
    "abdos inout":["sw-flexion-et-extension-des-jambes"],
    "rotation pallof poulie bas genoux":["sw-pallof-press-horizontal-a-la-poulie-basse"],
    "rotation couche":["sw-torsion-vertebrale-couchee"],
    "abdos jambes":["e114"],
    "abdos machine":["sw-crunchs-abdominaux-a-la-machine"],
    "rotation russe balle":["sw-rotation-russe-avec-medecine-ball"],
    "halt balle":["e1104"],
    "planche grimpeur":["e120"],
    "rotation genoucoude":["sw-coudes-opposes-au-genou","sw-velo-air-debout"],
    "planche":["e115"],
    "abdos inverse":["e1130"],
    "planche pike":["sw-pike-sur-anneaux","sw-v-ups-en-suspension"],
    "rotation machine":["sw-rotation-du-tronc-a-la-machine","sw-rotation-du-tronc-a-la-machine-assise"],
    "planche scie":["sw-planche-scie"],
    "abdos ciseaux":["sw-ciseaux"],
    "abdos poulie assis":["sw-crunch-abdominal-assis-a-la-cable"],
    "abdos genoux alt":["sw-crunchs-alternes-assis"],
    "rotation assis barre":["sw-rotation-russe-avec-barre"],
    "abdos battements assis":["sw-battement-de-jambes-assis"],
    "abdos assisJambes":["sw-elevation-des-jambes-assis"],
    "abdos cercles":["sw-crunchs-inverses-en-cercle-assis"],
    "planche epaule":["sw-touche-d-x27-epaule"],
    "abdos chandelle":["sw-posture-de-la-chandelle"],
    "abdos lateral":["sw-crunch-lateral"],
    "planche cote":["e116"],
    "rotation assis":["sw-rotation-assise"],
    "abdos ballon":["sw-crunch-sur-ballon-de-stabilite"],
    "abdos poulie debout":["sw-crunch-debout-a-la-poulie"],
    "rotation debout":["sw-rotation-du-tronc-debout"],
    "suspendu paralleles jambes":["sw-elevation-des-jambes-tendues-sur-barres-paralleles"],
    "planche ballon":["sw-planche-sur-ballon-suisse"],
    "abdos toucher":["sw-toucher-des-orteils"],
    "planche trx":["sw-bird-dog-unilateral-avec-trx"],
    "halt getup":["e140"],
    "planche chienHaut":["sw-chien-tete-en-haut"],
    "abdos vsit":["sw-crunch-en-v"],
    "abdos vup":["e122"],
    "abdos leste":["sw-crunchs-abdominaux-ponderes"],
    "abdos decline leste":["sw-crunch-decline-avec-poids"],
    "suspendu jambes leste":["sw-elevation-des-jambes-suspendues-avec-poids"],
    "abdos hollow leste":["sw-maintien-en-position-creuse-lestee"],
    "planche leste":["sw-planche-avec-poids"],
    "rotation russe disque":["sw-rotation-russe-avec-poids"],
    "abdos situp leste":["e201"],
    "abdos tendus":["sw-crunch-avec-bras-tendus-et-poids"],
    "rotation hache hal":["sw-coup-de-hache-avec-charge"],
    "etire 9090":["sw-etirement-90-a-90"],
    "etire papillon avant":["sw-etirement-papillon-incline-vers-l-x27-avant"],
    "etire papillon":["sw-etirement-papillon"],
    "hanche adduction poulie":["e239"],
    "squat cosaque":["sw-squat-cosaque"],
    "hanche cercles":["sw-cercles-de-hanches"],
    "etire papillon couche":["sw-posture-du-papillon-couche"],
    "hanche adduction elas":["e243"],
    "etire grenouille":["sw-grenouille-balancante"],
    "etire grenouille demi":["sw-etirement-de-la-demi-grenouille-en-mouvement"],
    "hanche adduction assis machine":["sw-adduction-des-hanches-assis"],
    "hanche balancement lateral":["sw-balancements-lateraux-de-jambe"],
    "souleve kb sumo deficit":["sw-squat-sumo-sur-stepbox"],
    "curl barre pro":["e67"],
    "poignet barre inverse":["e125"],
    "poignet dos barre":["sw-curl-des-poignets-debout-avec-barre"],
    "poignet debout barre":["sw-curl-poignet-debout-avec-barre"],
    "poignet barre":["e124"],
    "poignet rouleau poulie":["sw-enroulement-de-poignet-debout-a-la-cable"],
    "poignet poulie":["e312","sw-flexion-des-poignets-a-la-poulie-assis"],
    "traction pendu":["e127"],
    "cardio marche hal":["sw-porte-de-fermier-avec-halteres","sw-marche-du-fermier"],
    "poignet pronation couche uni":["e341"],
    "curl hal pro":["sw-curl-inverse-des-biceps-avec-halteres"],
    "poignet debout hal inverse":["e206"],
    "poignet debout hal":["sw-flexion-des-poignets-debout-avec-halteres"],
    "curl ez pro":["sw-curl-inverse-des-biceps-avec-barre-ez"],
    "curl ez pro araignee":["sw-curl-araignee-inverse-a-la-barre-ez"],
    "poignet ez inverse":["sw-curl-inverse-des-poignets-assis-avec-barre-ez"],
    "poignet ez":["sw-flexion-des-poignets-assis-avec-barre-ez"],
    "poignet pince":["sw-hand-gripper-poignee-de-musculation"],
    "poignet hal inverse uni":["sw-curl-inverse-du-poignet-avec-haltere-a-un-bras"],
    "poignet supination uni":["sw-supination-couchee-avec-halteres"],
    "poignet neutre uni":["sw-curl-haltere-a-un-bras-en-prise-neutre"],
    "poignet hal uni":["sw-flexion-du-poignet-a-un-bras-avec-haltere"],
    "curl poulie pro":["sw-curl-inverse-a-la-poulie"],
    "pompe genoux poignets":["sw-pompes-completes-sur-les-poignets","sw-pompes-sur-les-poignets"],
    "cardio marche kb uni":["sw-marche-du-fermier-unilaterale"],
    "poignet machine":["sw-machine-de-flexion-des-poignets"],
    "poignet rouleau":["e1190"],
    "curl hal alt":["e336","sw-curl-alterne-avec-halteres-en-supination"],
    "curl hal marteau alt":["e245"],
    "curl hal":["sw-curl-biceps-avec-halteres-et-support-de-bras","e338","sw-curl-avec-halteres-en-supination"],
    "curl elas":["sw-band-biceps-curl"],
    "curl elas marteau":["sw-curl-marteau-avec-bande"],
    "curl poulie barreP":["sw-curl-biceps-a-la-barre-avec-cable"],
    "curl barre":["sw-curl-a-la-barre"],
    "curl barre drag":["e172"],
    "curl barre pupitre":["e61"],
    "curl barre araignee":["sw-curl-incline-avec-barre-en-pronation"],
    "curl barre mur":["sw-curl-mural-avec-barre"],
    "curl poulie bayesien uni":["sw-curl-bayesien-a-la-poulie","sw-curl-a-la-poulie-en-position-inversee"],
    "curl poulie bayesien uni tabouret":["sw-curl-biceps-assis-avec-cable"],
    "curl poulie pupitre barreP":["e303"],
    "curl poulie accroupi barreP":["sw-curl-a-genoux-avec-cable"],
    "curl barre serre":["sw-curl-biceps-prise-serree"],
    "curl ez serre":["e323"],
    "curl hal concentre marteau uni":["sw-curl-marteau-de-concentration"],
    "curl hal pupitre":["sw-curl-au-pupitre-avec-halteres","sw-curl-predicateur-supination-avec-halteres"],
    "curl hal concentre uni":["e60"],
    "curl hal croise marteau alt":["e328"],
    "curl hal drag":["sw-curl-en-traction-avec-halteres"],
    "curl hal marteau":["e58"],
    "curl hal incline alt":["e247"],
    "curl hal incline marteau":["sw-curl-marteau-incline-avec-halteres"],
    "curl hal assis marteau alt":["sw-curl-marteau-alterne-assis-avec-halteres"],
    "curl hal araignee":["sw-curl-araignee-avec-halteres"],
    "curl ez":["e56"],
    "curl ez pupitre":["sw-curl-au-pupitre-avec-barre-ez"],
    "curl ez araignee":["sw-curl-araignee-avec-barre-ez"],
    "curl poulie hercule":["sw-curl-heracles"],
    "curl poulie incline":["e173"],
    "curl kb":["sw-curl-biceps-avec-kettlebell"],
    "curl poulie allonge barreP":["sw-curl-des-biceps-a-la-poulie-en-position-allongee"],
    "curl machine pupitre":["sw-curl-biceps-a-la-machine","e417"],
    "curl poulie uni":["sw-curl-biceps-unilateral-a-la-cable"],
    "curl hal pupitre uni":["sw-curl-au-pupitre-avec-haltere-a-un-bras"],
    "curl poulie marteau uni":["sw-one-arm-hammer-cable-curl-flexion-du-bras-a-la-corde-en-prise-marteau"],
    "curl machine pupitre uni":["sw-curl-au-pupitre-a-un-bras-a-la-machine"],
    "curl hal pupitre marteau uni":["sw-curl-marteau-sur-pupitre-avec-un-bras"],
    "curl hal pupitre marteau":["sw-curl-marteau-au-pupitre"],
    "curl poulie corde marteau":["e295"],
    "curl hal assis":["sw-curl-assis-avec-halteres"],
    "curl hal assis marteau":["sw-curl-marteau-assis"],
    "curl hal incline":["sw-curl-incline-assis-pour-biceps"],
    "curl hal uni":["sw-curl-avec-haltere-unique"],
    "curl hal araignee marteau":["sw-curl-marteau-araignee"],
    "suspension curl sangles":["sw-curl-biceps-avec-trx"],
    "curl barre large":["sw-curl-debout-a-la-barre-avec-prise-large"],
    "curl hal zottman":["e170"],
    "cardio airbike":["sw-velo-d-x27-assaut-air"],
    "cardio cordes":["e215"],
    "cardio burpee":["e135"],
    "cardio elliptique":["sw-entraineur-elliptique"],
    "cardio jacks":["e1086"],
    "cardio kickboxing":["sw-kickboxing"],
    "cardio boxe":["sw-boxe-avec-sac-de-frappe"],
    "cardio rameur":["e131"],
    "cardio course":["e1139"],
    "cardio skierg":["sw-ergometre-de-ski"],
    "cardio escalier":["e212"],
    "cardio velo":["e211"],
    "cardio marche tapis pente":["sw-montee-sur-tapis-roulant"],
    "cardio course tapis":["sw-course-sur-tapis-roulant"],
    "cardio marche":["sw-marche-cardio"],
    "planche renegat":["sw-rangee-alternee-en-position-de-planche"],
    "traction machine":["e154"],
    "suspension row sup":["sw-traction-australienne-prise-supination"],
    "gym levier dos":["e1005"],
    "traction elastique":["sw-traction-assistee-par-bande-elastique"],
    "tirage elas debout":["sw-tirage-lateral-avec-bande-en-position-penchee"],
    "rowing elas debout haut large":["sw-tirage-large-avec-bande-ancree-en-hauteur"],
    "tirage elas genoux nuque":["sw-tirage-a-la-bande-derriere-la-nuque"],
    "rowing barre":["e24"],
    "rowing barre pendlay":["sw-rowing-barre-penche-depuis-pin","e149"],
    "rowing barre ventre=35 large":["sw-rowing-barre-incline-prise-large"],
    "pullover barre":["sw-pullover-avec-barre"],
    "souleve blocs":["e157","sw-souleve-de-terre-a-partir-de-blocs"],
    "rowing barre sup":["sw-rowing-a-la-barre-en-pronation-inversee-penche-en-avant"],
    "rowing kb":["sw-rowing-penche-avec-kettlebell"],
    "tirage serre":["e23"],
    "tirage":["sw-tirage-vertical-a-la-poulie"],
    "tirage neutre":["sw-tirage-vertical-a-la-poulie-prise-neutre"],
    "tirage sup":["sw-tirage-a-la-poulie-haute-prise-inversee"],
    "rowing poulie assis neutre":["sw-tirage-assis-a-la-poulie-avec-prise-neutre","sw-tirage-bas-assis-a-la-poulie-avec-prise-neutre"],
    "rowing poulie assis sup":["sw-tirage-assis-a-la-poulie-avec-prise-supine"],
    "tirage tendus":["sw-rameur-kayak-thibaudeau-a-cable","sw-tirage-vertical-bras-tendus"],
    "tirage large nuque":["sw-tirage-a-la-cable-prise-large-derriere-la-nuque"],
    "tirage large neutre":["e22"],
    "etire chatvache":["e1213"],
    "rowing machine":["e159","sw-tirage-bas-avec-levier"],
    "rowing tbar ventre":["sw-rowing-t-bar-avec-appui-poitrine"],
    "etire enfant":["e1215"],
    "traction sup":["e21"],
    "rowing landmine serre":["sw-rameur-a-prise-serree-avec-barre-au-sol"],
    "traction serre":["sw-traction-en-prise-serree"],
    "rowing hal":["sw-rowing-buste-penche-avec-halteres"],
    "rowing hal appui uni":["e275"],
    "rowing hal ventre=35 neutre":["sw-rowing-incline-avec-halteres-prise-neutre"],
    "pullover hal":["e9"],
    "pullover hal jambesHautes":["sw-pull-over-avec-halteres-et-jambes-elevees"],
    "rowing hal seal":["sw-rowing-halteres-sur-banc-incline"],
    "halt hal arrache":["e1066"],
    "gym drapeau":["sw-drapeau"],
    "gym levier":["e1074"],
    "gym levier traction":["sw-traction-en-levier-avant"],
    "rowing kb gorille alt":["sw-rowing-gorilla"],
    "halt arrache suspendu":["e353"],
    "traction scapulaire":["sw-retractions-scapulaires-suspendues"],
    "rowing hal ventre=35 haut":["sw-rowing-large-incline-avec-halteres"],
    "rowing barre ventre=35":["sw-rowing-incline-avec-barre-poitrine-soutenue"],
    "suspension row":["e155"],
    "halt kb":["sw-arrache-avec-kettlebell"],
    "planche renegat kb":["sw-rameur-renegat-avec-kettlebell"],
    "etire rotationdos":["sw-etirement-en-rotation-du-dos-a-genoux"],
    "tirage genoux":["sw-tirage-vertical-a-genoux-a-la-poulie"],
    "tirage machine":["e1266"],
    "rowing machine haut":["sw-tirage-haut-a-la-machine"],
    "pullover machine":["sw-pull-over-a-la-machine"],
    "gym muscleup":["sw-muscle-up"],
    "suspension row anneaux":["sw-traction-australienne-a-prise-etroite-avec-anneaux"],
    "traction negative":["e160"],
    "traction neutre leste":["sw-traction-a-la-barre-fixe-avec-prise-neutre-et-charge-additionnelle"],
    "traction neutre":["sw-traction-en-prise-neutre"],
    "tirage elas genoux uni":["sw-tirage-vertical-a-un-bras-avec-bande-elastique"],
    "tirage demigenou uni":["sw-tirage-a-la-poulie-unilateral-en-demi-genou"],
    "rowing poulie assis uni":["sw-tirage-bas-a-un-bras-a-la-poulie","sw-rowing-assis-a-un-bras-avec-poulie-basse"],
    "rowing poulie debout uni":["sw-tirage-unilateral-a-la-poulie"],
    "rowing machine uni":["sw-tirage-a-un-bras-sur-machine-avec-support-pour-la-poitrine","sw-tirage-assis-a-un-bras"],
    "rowing poulie demigenou haut uni":["sw-tirage-haut-unilateral-a-la-cable"],
    "rowing landmine uni":["sw-rowing-a-un-bras-avec-barre-fixee-au-sol-en-position-penchee"],
    "tirage uni":["sw-tirage-vertical-a-un-bras"],
    "rowing machine haut uni":["sw-tirage-haut-a-un-bras-avec-levier"],
    "tirage tendus uni":["sw-tirage-vertical-unilateral-a-la-poulie"],
    "halt arrache":["e377"],
    "planche nageur":["sw-nageur-en-decubitus-ventral"],
    "traction autour":["sw-tirage-circulaire"],
    "traction":["e20"],
    "traction large":["sw-tractions-prise-large"],
    "gym muscleup anneaux":["sw-muscle-up-aux-anneaux"],
    "traction anneaux":["sw-traction-aux-anneaux"],
    "tirage tendus corde":["sw-tirage-a-la-corde-bras-tendus"],
    "rowing barre seal":["e150"],
    "rowing poulie assis":["sw-rameur-assis-a-la-poulie-en-flexion","e27"],
    "rowing poulie assis large":["e151"],
    "rowing smith":["sw-rowing-penche-a-la-barre-guidee"],
    "halt arrache squat":["sw-snatch-arrache"],
    "etire lateral":["sw-etirement-lateral-debout"],
    "suspension row sangles":["sw-rangee-inversee-en-suspension","sw-rangee-en-suspension"],
    "rowing tbar":["sw-rameur-a-la-barre-en-t-penche"],
    "traction sup leste":["sw-traction-avec-charge"],
    "gym muscleup leste":["sw-muscle-up-avec-charge"],
    "traction leste":["e153"],
    "rowing machine large":["sw-rowing-a-prise-large-sur-banc-incline"],
    "tirage large":["sw-tirage-poitrine-verticale-barre"],
    "traction large nuque":["sw-traction-arriere-prise-large"],
    "rowing barre yates":["e37"],
    "elevation arriere hal penche alt":["sw-elevation-laterale-inversee-avec-halteres-en-position-penchee"],
    "elevation cercles pc":["sw-cercles-d-x27-epaules"],
    "elevation lat elas":["sw-elevation-laterale-avec-bande"],
    "elevation passage elas":["sw-passage-de-bande-au-dessus-des-epaules","sw-echauffement-dynamique-des-epaules-avec-bande-elastique"],
    "developpe epaules elas":["sw-developpe-epaules-avec-bande-elastique"],
    "elevation menton elas":["e404"],
    "elevation facepull elas":["sw-tirage-visage-avec-bande-elastique"],
    "developpe epaules barre nuque":["e162"],
    "elevation front barre":["e45"],
    "elevation menton barre serre":["sw-rowing-vertical-a-la-barre-avec-prise-serree"],
    "developpe epaules barre":["e39","sw-developpe-epaules-tsunami"],
    "developpe epaules barre pousse":["e1129"],
    "elevation arriere barre penche":["sw-elevation-arriere-des-deltoides-avec-barre"],
    "rowing barre haut large":["e258"],
    "elevation menton barre":["sw-rowing-menton-a-la-barre-prise-largeur-d-epaules"],
    "elevation menton barre large":["sw-tirage-vertical-a-la-barre-avec-prise-large"],
    "elevation arriere hal penche":["e163"],
    "elevation facepull poulie":["e33"],
    "elevation front poulie":["sw-elevation-frontale-a-la-poulie"],
    "elevation y poulie banc=60":["sw-elevation-en-y-sur-banc-incline-avec-support-dorsal"],
    "elevation lat poulie":["e43"],
    "elevation arriere poulie":["e304"],
    "elevation arriere poulie tabouret":["sw-elevation-laterale-arriere-assise-a-la-cable"],
    "elevation facepull poulie sup":["sw-tirage-visage-a-la-poulie-en-supination"],
    "elevation menton poulie":["e49"],
    "elevation y poulie":["sw-elevation-en-y-a-la-poulie"],
    "elevation arriere t ventre=35 pc":["sw-elevation-laterale-en-t-avec-support-poitrine"],
    "elevation front hal alt":["sw-elevation-frontale-alternee-avec-halteres"],
    "elevation front hal marteau alt":["sw-dumbbell-alternate-hammer-front-raise-elevation-frontale-alternee-avec-halteres-en-prise-marteau"],
    "elevation cubain hal":["sw-rotation-cubaine-avec-halteres","sw-presse-cubaine-debout"],
    "elevation front hal":["e44"],
    "developpe epaules hal demigenou uni":["sw-developpe-epaules-avec-halteres-en-position-demi-genouillee"],
    "elevation lat hal ventre=40":["sw-elevations-laterales-incline-avec-support-pour-la-poitrine-et-halteres"],
    "elevation arriere t hal ventre=35":["sw-elevation-laterale-arriere-en-t-incline-avec-halteres","sw-elevation-en-t-incline-avec-halteres"],
    "elevation lat hal":["e42"],
    "elevation lat hal poliquin":["sw-elevation-laterale-poliquin-avec-halteres"],
    "developpe epaules hal pousse":["sw-developpe-pousse-avec-halteres"],
    "rowing hal haut":["sw-rowing-arriere-avec-halteres-pour-deltoides-posterieurs"],
    "rowing hal haut tabouret":["sw-tirage-haut-assis-penche-avec-halteres"],
    "developpe epaules hal alt":["sw-developpe-alterne-debout-avec-halteres"],
    "elevation front volant hal":["sw-driver-debout-avec-halteres"],
    "elevation menton hal":["e394"],
    "gym planche grenouille":["sw-planche-grenouille"],
    "gym planche":["sw-planche-complete"],
    "pompe planche":["sw-pompe-en-planche-complete","sw-dips-en-planche"],
    "gym equilibre mur":["sw-maintien-en-equilibre-sur-les-mains"],
    "pompe equilibre":["e52"],
    "elevation lat hal cote uni":["sw-elevation-de-powell-inclinee","sw-elevation-laterale-inclinee-avec-haltere-a-un-bras","sw-elevation-de-powell"],
    "elevation tete kb":["sw-rotation-autour-de-la-tete-avec-kettlebell"],
    "elevation lat landmine uni":["e165"],
    "developpe landmine debout":["e148"],
    "elevation lat hal latfront":["sw-elevation-laterale-a-frontale"],
    "gym planche penchee":["sw-planche-inclinee"],
    "elevation lat poulie uni penchecote":["sw-elevation-laterale-inclinee-a-la-poulie"],
    "developpe epaules machine assis neutre":["sw-presse-epaules-assis-prise-marteau-a-levier"],
    "elevation lat hal lu":["sw-elevations-laterales-avec-halteres"],
    "elevation facepull poulie sol":["sw-tirage-visage-couche-a-la-poulie"],
    "elevation arriere poulie plat":["sw-elevation-laterale-arriere-avec-halteres-allonge"],
    "elevation lat machine":["e51"],
    "elevation arriere machine":["sw-butterfly-inverse"],
    "developpe epaules machine assis":["e47"],
    "elevation arriere poulie penche uni":["sw-elevation-laterale-penchee-a-un-bras-avec-cable"],
    "elevation front poulie uni":["sw-elevation-frontale-a-la-corde-avec-un-bras"],
    "elevation lat poulie uni":["sw-elevation-laterale-a-un-bras-avec-cable"],
    "elevation arriere poulie uni":["sw-elevation-arriere-des-deltoides-a-un-bras-avec-cable"],
    "elevation lat hal uni":["sw-elevation-laterale-a-un-bras-avec-haltere"],
    "elevation arriere hal penche uni":["sw-elevation-laterale-avec-haltere-a-un-bras-en-appui-penche"],
    "developpe epaules kb uni":["sw-developpe-avec-kettlebell-a-un-bras-au-dessus-de-la-tete"],
    "developpe landmine demigenou uni":["sw-presse-epaule-a-un-bras-en-demi-genou-avec-landmine"],
    "developpe landmine debout uni":["sw-developpe-epaules-a-un-bras-avec-landmine-en-position-debout"],
    "elevation arriere machine uni":["sw-elevation-posterieure-a-un-bras"],
    "developpe epaules hal uni":["sw-developpe-epaules-a-un-bras-avec-haltere"],
    "pompe pike":["e53"],
    "pompe pike entre":["sw-pompe-en-pike-entre-bancs","sw-pompe-en-pike-entre-des-chaises"],
    "pompe pike banc":["sw-pompe-en-pike-sur-banc"],
    "elevation front volant disque":["sw-conducteur-de-volant-avec-disque"],
    "elevation front disque":["sw-elevation-frontale-avec-disque"],
    "elevation front disque haut":["sw-elevations-frontales-avec-rotation"],
    "etire deltarriere":["sw-etirement-du-deltoide-posterieur"],
    "suspension facepull anneaux":["sw-tirage-facial-aux-anneaux"],
    "developpe epaules hal arnold assis":["e41"],
    "developpe epaules barre assis":["e261"],
    "elevation cubain hal tabouret":["sw-press-cubain-assis"],
    "elevation lat hal tabouret":["sw-elevation-laterale-assise-avec-halteres"],
    "developpe epaules hal assis":["e40"],
    "elevation facepull poulie tabouret":["sw-tirage-visage-assis"],
    "elevation rotext hal tabouret uni":["sw-rotation-externe-de-l-x27-epaule-en-position-assise"],
    "developpe epaules hal assis neutre":["sw-developpe-epaules-assis-prise-neutre"],
    "elevation rotext hal cote uni":["sw-rotation-externe-en-decubitus-lateral"],
    "elevation menton smith":["e391"],
    "developpe epaules smith nuque assis":["sw-developpe-derriere-la-nuque-a-la-machine-smith-en-position-assise"],
    "developpe epaules smith assis":["sw-developpe-epaules-assis-a-la-smith-machine"],
    "developpe epaules hal":["sw-developpe-epaules-debout-avec-halteres"],
    "elevation tenue disque":["sw-gainage-frontal-statique"],
    "gym planche ecart":["sw-planche-ecartee"],
    "gym tete":["sw-posture-sur-la-tete-avec-appui-sirsasana"],
    "elevation ange":["sw-ange-mural"],
    "hanche elas":["e104","e1015"],
    "hanche coquille elas":["sw-coquilles-avec-bande-elastique-en-position-allongee"],
    "hanche hyperinverse elas":["sw-hyperextension-inversee-avec-bande"],
    "hanche kickback elas":["sw-extension-de-la-hanche-en-equilibre-avec-bande"],
    "pont barre sol":["e255"],
    "pont banc barre":["e99"],
    "hanche poulie":["sw-abduction-de-la-hanche-a-la-poulie"],
    "hanche kickback quatrepattes":["sw-coup-de-pied-de-mule"],
    "pont banc hal":["e100"],
    "pont banc hal unejambe":["sw-releve-de-bassin-unilateral-avec-haltere"],
    "etire figure4":["sw-etirement-en-figure-4-sur-chaise","sw-etirement-en-position-assise-en-figure-4"],
    "hanche monstre elas":["sw-marche-monstre-avant-avec-bande"],
    "pont grenouille":["e193"],
    "pont":["e101"],
    "pont banc":["sw-pont-fessier-sur-banc","sw-releve-de-bassin"],
    "pont unejambe":["e388"],
    "hanche kickback poulie":["sw-extension-de-la-hanche-a-la-poulie"],
    "hanche kickback machine":["sw-extension-des-hanches-a-la-machine"],
    "etire rouleau fessiers":["sw-roulement-des-fessiers"],
    "souleve charniere":["sw-charniere-de-hanche"],
    "pont banc smith":["sw-extension-de-la-hanche-a-la-machine-smith"],
    "pont banc kas":["sw-pont-fessier-kas"],
    "souleve swing":["e136"],
    "hanche kickback quatrepattes elas":["sw-extension-de-jambe-avec-bande-elastique"],
    "hanche monstre lateral elas":["sw-marche-laterale-avec-bande"],
    "etire genoupoitrine couche":["sw-etirement-couche-genou-poitrine"],
    "pont banc machine":["e192"],
    "pont elas":["sw-pont-fessier-avec-mini-bande"],
    "souleve swing uni":["sw-balancement-a-un-bras-avec-kettlebell"],
    "etire pigeon":["sw-posture-du-pigeon"],
    "hanche assis elas":["e1013"],
    "hanche assis machine":["sw-abduction-de-la-hanche-assis"],
    "hanche cote":["e1144"],
    "planche cote coquille":["sw-planche-laterale-avec-coquille"],
    "planche cote abduction":["sw-planche-laterale-avec-abduction-de-la-hanche"],
    "pont unejambe disque":["sw-pont-fessier-unilateral-avec-charge"],
    "pont genoux":["sw-releve-de-bassin-a-genoux-a-la-smith-machine"],
    "hanche kickback smith":["sw-extension-de-la-hanche-a-la-machine-smith-2"],
    "souleve sumo":["e31"],
    "pont disque":["sw-pont-fessier-avec-poids"],
    "etire monde":["sw-etirement-complet-du-corps"],
    "souleve roumain bstance kb":["sw-souleve-de-terre-roumain-en-position-b"],
    "jambes curl elas":["sw-curl-des-ischio-jambiers-allonge-avec-bande-elastique"],
    "souleve goodmorning":["e36"],
    "souleve tendues":["sw-souleve-de-terre-jambes-tendues-avec-barre"],
    "souleve roumain poulie":["sw-presse-a-cuisses-avec-ceinture","sw-souleve-de-terre-roumain-a-la-poulie"],
    "souleve poulie":["e195"],
    "souleve":["e29"],
    "etire squatpli":["sw-squat-profond-avec-flexion-large-et-maintien-du-pied"],
    "souleve deficit":["e334"],
    "etire chienbas":["sw-chien-tete-en-bas"],
    "souleve hal":["sw-souleve-de-terre-avec-halteres"],
    "jambes curl hal":["sw-curl-des-ischio-jambiers-couche-avec-halteres"],
    "souleve roumain hal":["sw-souleve-de-terre-roumain-avec-halteres"],
    "souleve tendues hal":["sw-souleve-de-terre-jambes-tendues-avec-halteres"],
    "jambes curl ghr":["sw-elevation-ischio-jambiers-gluteaux-1-2"],
    "halt suspendu":["sw-hang-power-clean"],
    "etire bebe":["e1226"],
    "souleve jefferson hal":["e1085"],
    "souleve kb":["sw-souleve-de-terre-avec-kettlebell"],
    "etire genoupoitrine":["e1229"],
    "etire ischios":["sw-etirement-des-ischio-jambiers-a-genoux"],
    "hanche balancement":["sw-balancements-de-jambes"],
    "etire fente":["sw-etirement-en-fente"],
    "jambes curl nordique":["e97"],
    "jambes curl machine":["sw-curl-des-ischio-jambiers-en-position-couchee"],
    "jambes curl anneaux":["sw-curl-des-ischio-jambiers-avec-anneaux"],
    "souleve roumain":["e30"],
    "etire ischios assis deux":["e1250"],
    "souleve goodmorning assis":["e384"],
    "jambes curl assis machine":["e94"],
    "jambes curl assis machine uni":["sw-curl-ischio-jambiers-assis-a-une-jambe"],
    "etire ischios assis":["sw-etirement-ischio-jambiers-unilateral-assis"],
    "souleve unejambe hal":["sw-souleve-de-terre-sur-une-jambe-avec-haltere"],
    "souleve unejambe roumain hal":["e190"],
    "jambes curl debout poulie uni":["sw-curl-ischio-jambier-unilateral-a-la-poulie"],
    "souleve unejambe":["sw-souleve-de-terre-unilateral"],
    "jambes curl machine uni":["sw-curl-ischio-jambier-unilateral-couche"],
    "jambes curl glisse":["sw-curl-des-ischio-jambiers-en-glissement"],
    "souleve goodmorning smith":["e1157"],
    "souleve roumain smith":["sw-souleve-de-terre-roumain-a-la-smith-machine"],
    "halt arrache tirage":["sw-tirage-d-x27-arrache"],
    "etire pli":["sw-flexion-avant-debout"],
    "jambes curl debout machine":["sw-curl-des-ischio-jambiers-debout"],
    "jambes curl ballon":["sw-curl-des-jambes-sur-swiss-ball"],
    "souleve extension hal":["sw-extension-du-dos-avec-haltere","sw-extension-du-dos"],
    "souleve extension machine":["sw-extension-dorsale-sur-machine"],
    "planche superman":["e35"],
    "mollets barre":["sw-elevation-des-mollets-avec-barre"],
    "jambes presse mollets":["e108"],
    "mollets hal":["e109"],
    "saut genoux":["sw-tapping-genou-haut-en-sautant"],
    "cardio sauter":["e134"],
    "saut pogo":["sw-sauts-sur-place"],
    "etire rouleau mollets":["sw-roulement-des-mollets"],
    "etire rouleau pied":["sw-roulement-du-pied"],
    "mollets machine":["sw-elevation-des-mollets-a-la-machine"],
    "mollets assis machine":["e260"],
    "mollets assis machine uni":["sw-elevation-des-mollets-a-une-jambe-sur-machine-assise"],
    "mollets smith uni":["sw-elevation-des-mollets-unilaterale-a-la-smith-machine"],
    "mollets uni":["e1153"],
    "mollets hal uni":["sw-elevations-unilaterales-avec-haltere"],
    "mollets assis hal uni":["sw-elevation-du-mollet-assis-sur-une-jambe-avec-haltere"],
    "mollets smith":["sw-elevations-des-mollets-a-la-machine-smith"],
    "mollets assis smith":["sw-elevation-des-mollets-assis-a-la-machine-smith"],
    "mollets":["e393"],
    "mollets tibial":["sw-elevation-du-tibial-anterieur-en-position-debout"],
    "mollets assis hal":["sw-elevation-des-mollets-assis-avec-poids"],
    "pompe archer":["sw-pompes-archer"],
    "developpe elas":["sw-developpe-couche-avec-bande"],
    "ecarte elas":["sw-ecarte-avec-bande-elastique"],
    "developpe barre":["e1","e270"],
    "developpe barre sol":["e1073"],
    "developpe barre larsen":["sw-developpe-couche-larsen-avec-barre"],
    "developpe barre elas":["sw-developpe-couche-avec-bande-de-resistance"],
    "etire pectoraux coude":["sw-etirement-de-la-poitrine-avec-bras-flechis"],
    "pompe birddog":["sw-pompe-avec-extension-bras-jambe-opposes"],
    "developpe poulie plat":["sw-developpe-couche-a-la-cable"],
    "ecarte poulie haut genoux":["sw-ecarte-a-la-poulie-haute-a-basse-a-genoux"],
    "ecarte poulie":["sw-ecarte-a-la-corde-pour-le-milieu-de-la-poitrine"],
    "developpe poulie autour uni":["sw-pression-debout-circulaire"],
    "dips pecs":["e16"],
    "pompe claquement":["sw-pompes-avec-claquement"],
    "developpe hal serre neutre":["e322"],
    "pompe cobra":["sw-pompe-cobra"],
    "developpe machine assis uni":["sw-developpe-unilateral-en-travers-du-corps"],
    "developpe barre decline":["e3"],
    "developpe poulie decline":["sw-developpe-couche-decline-a-la-poulie"],
    "developpe machine assis decline":["sw-developpe-couche-decline"],
    "developpe hal decline":["e6"],
    "ecarte hal decline":["e332"],
    "pompe decline":["e15"],
    "developpe smith decline":["e333"],
    "pompe profonde":["sw-pompe-profonde-sur-barres-paralleles"],
    "etire pectoraux porte":["e1219"],
    "developpe hal":["e4","sw-developpe-poliquin-avec-halteres"],
    "ecarte hal":["sw-ecarte-couche-avec-halteres","sw-ecartes-poliquin"],
    "pompe hal":["sw-pompes-profondes-avec-halteres"],
    "ecarte hal sol":["sw-ecarte-couche-au-sol-avec-halteres"],
    "developpe hal larsen":["sw-developpe-larsen-avec-halteres"],
    "ecarte hal debout bas":["sw-ecarte-avec-halteres-de-bas-en-haut"],
    "etire pectoraux coudes":["sw-etirement-de-la-poitrine-avec-les-coudes-ecartes","sw-coquille-thoracique-assise","sw-ouverture-de-la-poitrine-en-position-debout"],
    "pompe doigts":["sw-pompe-sur-les-doigts"],
    "developpe hal sol":["sw-developpe-couche-au-sol-avec-halteres"],
    "developpe hal neutre":["sw-developpe-couche-avec-halteres-en-prise-marteau"],
    "ecarte poulie haut":["sw-ecartes-a-la-poulie"],
    "developpe barre banc=30":["e2"],
    "ecarte poulie banc=30":["sw-ecarte-couche-incline-a-la-poulie"],
    "developpe hal banc=30":["e5"],
    "ecarte hal banc=30":["sw-ecarte-couche-incline-avec-halteres"],
    "developpe machine assis incline":["sw-developpe-incline-marteau"],
    "developpe hal banc=30 neutre":["sw-developpe-incline-avec-halteres-en-prise-neutre"],
    "pompe incline":["e14"],
    "pompe jack":["sw-pompes-jack"],
    "developpe kb sol uni":["e1111"],
    "pompe genoux":["sw-pompes-sur-les-genoux"],
    "pompe genoux anneaux":["sw-pompes-aux-anneaux-a-genoux"],
    "pompe genoux large":["sw-pompes-larges-a-genoux"],
    "pompe jointures":["sw-pompe-sur-les-jointures"],
    "dips coreen":["sw-dips-coreens"],
    "developpe poulie banc=30":["sw-developpe-incline-a-la-poulie-basse"],
    "ecarte hal banc=15":["sw-ecarte-incline-avec-halteres"],
    "ecarte poulie bas":["sw-ecarte-couche-a-la-poulie-basse-haute"],
    "ecarte poulie plat":["sw-ecarte-couche-a-la-poulie"],
    "developpe machine":["sw-developpe-couche-prise-marteau"],
    "ecarte machine":["sw-ecarte-a-la-machine-pour-pectoraux"],
    "developpe machine assis":["e10","sw-presse-pectorale-a-la-machine"],
    "developpe machine assis neutre":["sw-presse-a-pectoraux-a-prise-marteau-sur-machine"],
    "pompe negatif":["sw-pompe-negative"],
    "ecarte poulie uni":["sw-ecarte-a-un-bras-a-la-poulie"],
    "developpe hal uni":["sw-developpe-couche-a-un-bras-avec-haltere"],
    "developpe hal banc=30 uni":["sw-developpe-incline-avec-haltere-a-un-bras"],
    "ecarte poulie haut uni":["sw-ecarte-a-la-poulie-haute-vers-basse-a-un-bras"],
    "ecarte hal debout bas uni":["sw-ecarte-a-un-bras-avec-haltere-en-position-basse"],
    "pompe unbras":["sw-pompe-a-un-bras"],
    "ecarte machine pecdeck":["sw-ecarte-a-la-machine-pec-deck"],
    "developpe barre partiel":["sw-developpe-couche-avec-arret","e1160"],
    "pompe pseudo":["sw-pompes-pseudo-planche"],
    "pompe":["e13"],
    "pompe poignees":["sw-pompes-sur-poignees"],
    "pompe elas":["sw-pompes-avec-bande-de-resistance"],
    "dips anneaux":["e1136"],
    "pompe anneaux":["e145"],
    "pompe scapulaire":["sw-pompes-scapulaires"],
    "developpe poulie assis":["e292"],
    "ecarte poulie assis":["sw-ecarte-a-la-poulie-assis"],
    "developpe smith":["sw-developpe-couche-a-la-smith-machine"],
    "developpe smith banc=30":["sw-developpe-incline-a-la-machine-smith"],
    "developpe poulie debout":["sw-developpe-debout-a-la-poulie-pour-les-pectoraux"],
    "developpe poulie debout bas":["sw-presse-a-la-poitrine-basse-avec-cable-en-position-debout"],
    "etire chienbas debout":["sw-chien-tete-en-bas-debout"],
    "ecarte elas bas":["sw-ecarte-incline-debout-avec-bande-elastique"],
    "dips barre":["e1165"],
    "pompe superman":["sw-pompe-superman"],
    "suspension ecarte sangles":["sw-ecarte-couche-en-suspension"],
    "developpe svend debout":["e1169"],
    "pompe leste":["e144"],
    "pompe large":["sw-pompes-mains-larges"],
    "squat barre partiel":["sw-squat-anderson","sw-squat-partiel"],
    "squat pistolet assiste":["sw-squat-pistolet-assiste"],
    "squat elas":["e1014"],
    "fente bulgare barre":["sw-squat-bulgare-avec-barre"],
    "squat cosaque barre":["sw-squat-cosaque-avec-barre-olympique"],
    "fente avant barre":["sw-fente-avant-avec-barre"],
    "squat barre hack":["sw-squat-hack-a-la-barre"],
    "squat barre tete":["e1116"],
    "fente arriere deficit barre":["sw-fente-arriere-avec-barre-sur-step"],
    "fente arriere barre":["sw-fentes-arriere-avec-barre"],
    "fente barre":["sw-fente-avec-barre"],
    "squat barre":["e265","sw-squat-avec-barre-haute"],
    "fente step barre":["sw-montee-sur-banc-avec-barre"],
    "squat barre sumo":["sw-squat-sumo-avec-barre"],
    "squat barre avant thruster":["sw-thruster-avec-barre"],
    "fente marchee barre":["sw-fentes"],
    "squat barre avant boite":["sw-squat-avant-avec-barre-sur-banc"],
    "saut boite":["e216"],
    "squat barre boite":["sw-squat-sur-boite"],
    "fente step":["sw-montee-sur-boite"],
    "saut longueur":["sw-saut-en-longueur"],
    "fente marchee sac":["sw-bulgarian-bag-walking-lunges-fentes-marchees-avec-sac-bulgare"],
    "fente bulgare pliometrique":["sw-squat-saute-bulgare"],
    "fente bulgare":["sw-fente-bulgare"],
    "fente bulgare smith":["sw-fente-bulgare-a-la-smith-machine"],
    "fente step poulie":["sw-montee-sur-banc-avec-cable"],
    "jambes tke poulie":["sw-extension-du-genou-a-la-poulie"],
    "halt squat":["sw-squat-avec-epaule"],
    "squat barre cycliste":["sw-squat-cycliste"],
    "fente bulgare hal":["sw-squat-bulgare-avec-halteres"],
    "squat cosaque gobelet":["sw-squat-cosaque-avec-halteres","sw-squat-cosaque-avec-poids"],
    "squat gobelet":["e81","sw-squat-gobelet"],
    "squat saut hal":["sw-saut-avec-halteres"],
    "fente avant hal":["e84"],
    "fente arriere hal":["sw-fente-arriere-avec-halteres"],
    "fente arriere deficit hal":["sw-fente-arriere-avec-halteres-sur-marche"],
    "fente laterale hal":["sw-fentes-laterales-avec-halteres"],
    "fente hal":["sw-fente-avec-halteres"],
    "squat hal":["sw-squat-avec-halteres"],
    "fente step hal":["e91"],
    "squat sumo gobelet":["e105"],
    "fente marchee hal":["e85"],
    "squat barre avant":["e80"],
    "etire quadriceps":["sw-etirement-du-quadriceps-en-demi-agenouillement"],
    "squat barre demi":["sw-demi-squat"],
    "squat saut":["e89"],
    "halt jete kb":["sw-epaule-jete-avec-kettlebell"],
    "squat kb":["sw-squat-gobelet-avec-kettlebell"],
    "fente arriere kb":["sw-fente-arriere-avec-kettlebell"],
    "squat landmine":["sw-squat-avec-barre-pivotante"],
    "jambes presse":["e82"],
    "jambes presse large":["sw-presse-a-cuisses-en-position-large"],
    "jambes presse horizontale":["sw-presse-a-cuisses-horizontale"],
    "etire lezard":["sw-posture-du-lezard"],
    "squat barre basse":["sw-squat-avec-barre-basse"],
    "etire quadriceps couche":["sw-etirement-des-quadriceps-en-position-allongee"],
    "squat ceinture":["sw-squat-a-la-machine-avec-ceinture"],
    "squat hack":["e88","sw-squat-hack-inverse-a-la-machine"],
    "jambes presse serre":["sw-presse-a-cuisses-a-45-degres-avec-pieds-rapproches"],
    "squat barre avant partiel":["sw-squat-avant-avec-arret"],
    "squat pistolet boite":["sw-squat-sur-boite-en-pistolet"],
    "squat pistolet":["e185"],
    "fente laterale pliometrique":["sw-fente-laterale-plyometrique"],
    "fente step poliquin":["sw-montee-sur-banc-poliquin"],
    "halt":["e375"],
    "cardio traineau":["sw-traineau-prowler"],
    "fente arriere":["sw-fente-arriere"],
    "jambes nordiqueInverse":["sw-squat-sissy-a-genoux"],
    "jambes extension":["e87"],
    "fente laterale":["e1143"],
    "etire quadriceps cote":["sw-etirement-des-quadriceps-en-position-laterale-couche"],
    "jambes presse unejambe":["e182"],
    "saut boite unejambe":["sw-saut-sur-boite-a-une-jambe"],
    "jambes extension uni":["sw-extension-unilaterale-de-la-jambe"],
    "squat sissy":["e92","sw-squat-sissy-avec-poids"],
    "squat smith":["sw-squat-chaise-sur-smith-machine","sw-squat-hack-a-la-machine-smith","sw-squat-au-smith-machine"],
    "squat smith avant":["sw-squat-avant-a-la-smith-machine"],
    "fente arriere smith":["sw-fente-arriere-a-la-smith-machine"],
    "fente smith":["sw-fente-sur-machine-smith"],
    "squat smith boite":["sw-squat-au-banc-avec-smith-machine"],
    "squat smith zercher":["sw-squat-zercher-a-la-smith-machine"],
    "fente":["sw-fente-bulgare-2"],
    "fente piedAvantHaut barre":["sw-fente-avec-pied-avant-sureleve"],
    "squat":["sw-squat"],
    "squat mur ballon":["sw-squat-contre-le-mur-avec-ballon-de-stabilite"],
    "etire quadriceps debout":["sw-etirement-des-quadriceps-en-position-debout"],
    "squat sumo":["sw-squat-sumo"],
    "squat smith sumo":["sw-squat-sumo-avec-smith-machine"],
    "jambes tke elas":["e1018"],
    "souleve trapbar":["e156"],
    "jambes presse verticale":["sw-presse-a-jambes-verticale-sur-machine-smith"],
    "fente marchee":["sw-fentes-marchees"],
    "squat mur":["e1182"],
    "squat pistolet kb":["sw-squat-pistole-avec-poids"],
    "jambes nordiqueInverse disque":["sw-squat-sissy-pondere-en-position-agenouillee"],
    "squat barre zercher":["e180"],
    "elevation shrug barre":["sw-haussement-d-x27-epaules-avec-barre"],
    "elevation shrug barre dos":["e262"],
    "elevation shrug poulie":["e311"],
    "dips shrug":["sw-haussements-d-x27-epaules-en-dips"],
    "elevation shrug hal kelso":["sw-haussements-d-x27-epaules-kelso-avec-halteres"],
    "elevation shrug hal":["sw-haussements-d-x27-epaules-avec-halteres"],
    "gym equilibre mur shrug":["sw-haussement-d-x27-epaules-inverse"],
    "elevation shrug machine":["e130"],
    "etire cou curl":["sw-flexion-du-cou"],
    "etire cou":["e1239"],
    "rowing hal appui uni amp=0.25":["sw-rowing-unilateral-avec-haltere-en-appui-sur-scapula-en-flexion-du-tronc"],
    "elevation shrug hal tabouret":["sw-haussements-d-x27-epaules-avec-halteres-en-position-assise"],
    "elevation shrug smith":["sw-haussement-d-x27-epaules-a-la-smith-machine"],
    "elevation shrug trapbar":["sw-haussements-d-x27-epaules-avec-barre-hexagonale"],
    "elevation y hal ventre=30":["sw-elevation-en-y-pour-trapezes"],
    "dips machine":["e1003"],
    "triceps elas":["sw-extension-des-triceps-avec-bande-elastique"],
    "triceps pullover barre":["sw-extension-des-triceps-a-la-barre-droite-en-position-couchee"],
    "triceps croise poulie":["sw-extension-des-triceps-a-la-poulie-croisee"],
    "triceps kickback poulie":["sw-extension-des-triceps-a-deux-bras-a-la-poulie"],
    "triceps front poulie banc=30":["sw-extension-des-triceps-a-la-poulie-inclinee"],
    "triceps nuque poulie corde":["e306"],
    "triceps poulie barreP":["sw-extensions-a-la-poulie","sw-extension-des-triceps-a-la-barre-ez","e1178"],
    "triceps jm barre":["sw-developpe-californien"],
    "developpe barre serre":["e17"],
    "developpe hal banc=30 serre neutre":["sw-developpe-couche-incline-avec-halteres-prise-serree"],
    "pompe serre":["sw-pompes-prise-serree","sw-pompes-bras-croises"],
    "developpe smith serre":["sw-developpe-couche-jm-smith"],
    "triceps front barre decline":["sw-developpe-couche-decline-a-la-barre"],
    "pompe decline diamant":["sw-pompe-diamant-en-declinaison"],
    "pompe diamant":["e77"],
    "dips":["sw-dips"],
    "triceps front hal":["e1103"],
    "triceps nuque hal assis":["e1142"],
    "triceps nuque ez assis":["sw-extension-des-triceps-assis-a-la-barre-ez"],
    "triceps nuque poulie haute":["sw-extension-des-triceps-a-la-poulie-haute"],
    "triceps front barre banc=30":["sw-extension-des-triceps-a-la-barre-sur-banc-incline"],
    "pompe incline serre":["sw-pompe-inclinee-prise-serree"],
    "triceps front hal banc=30":["sw-extension-des-triceps-avec-halteres-sur-banc-incline"],
    "triceps jm smith":["sw-developpe-couche-prise-serree-a-la-machine-smith"],
    "triceps nuque poulie katana uni":["sw-extension-triceps-katana","sw-extension-triceps-au-dessus-de-la-tete-a-un-bras"],
    "pompe genoux serre":["sw-pompes-serrees-sur-les-genoux"],
    "pompe genoux diamant":["sw-pompes-diamant-sur-les-genoux"],
    "triceps front barre":["sw-extensions-triceps"],
    "triceps front poulie":["sw-extension-des-triceps-a-la-poulie-en-position-couchee"],
    "triceps front ez":["sw-extension-des-triceps-allonge-a-la-barre-ez"],
    "triceps machine":["e76"],
    "triceps travers poulie uni":["sw-extension-horizontale-du-triceps-debout-a-un-bras-avec-cable"],
    "triceps poulie uni":["sw-extension-unilaterale-a-la-poulie","sw-extension-des-triceps-a-un-bras-a-la-poulie"],
    "triceps kickback hal uni tabouret":["sw-kickback-assis-avec-haltere-a-un-bras"],
    "triceps nuque hal uni":["sw-extension-triceps-unilaterale-au-dessus-de-la-tete"],
    "triceps poulie sup uni":["sw-extension-triceps-unilaterale-en-prise-inversee-a-la-poulie"],
    "triceps nuque elas":["sw-extension-des-triceps-au-dessus-de-la-tete-avec-bande-elastique"],
    "triceps nuque poulie barreP":["sw-extension-des-triceps-a-la-poulie-haute-barre"],
    "etire triceps":["e1240"],
    "triceps poulie sup barreP":["sw-extension-des-triceps-a-la-poulie-prise-inversee"],
    "pompe inverse":["sw-pompe-inversee"],
    "suspension triceps anneaux":["sw-extension-des-triceps-aux-anneaux"],
    "triceps corde":["e69"],
    "triceps horizontal poulie":["sw-extension-des-triceps-a-la-poulie-horizontale-assis"],
    "dips assis":["sw-presse-a-triceps-a-la-machine"],
    "dips banc":["sw-dips-triceps-assis-sur-banc"],
    "triceps nuque hal1":["sw-extension-triceps-a-un-haltere-debout"],
    "triceps nuque barre":["sw-extension-des-triceps-a-la-barre-au-dessus-de-la-tete-en-position-debout"],
    "suspension triceps sangles":["sw-extension-des-triceps-en-suspension"],
    "triceps tate hal":["sw-presse-tate"],
    "triceps kickback poulie uni":["e177"],
    "pompe triceps":["sw-pompes-triceps"],
    "suspension triceps sup":["sw-extension-des-triceps-en-prise-supine"],
    "dips banc leste":["sw-dips-sur-banc-avec-poids"],
    "dips leste":["e143"]
  };

  /* ---------- Animation d'un exercice sur l'atlas ----------
     atlas : le moteur (AnqaAtlas.creer ou monte.atlas) ; exo : { exercice: identifiant } ou { spec: 'famille …' }
     (ou { mouvement } : ancien nom) ; options : { clair, vue }. */
  const ANCIENS = { repos: 'repos', squat: 'squat barre', developpeCouche: 'developpe barre', curl: 'curl hal', traction: 'traction', pompe: 'pompe', elevationsLaterales: 'elevation lat hal', souleveDeTerre: 'souleve barre', rowing: 'rowing barre' };
  let INDEX = null;
  function specDe(id) {
    if (!INDEX) { INDEX = {}; for (const spec in EXERCICES) for (const x of EXERCICES[spec]) INDEX[x] = spec; }
    return INDEX[id] || null;
  }
  function creerAnimation(atlas, exo, options) {
    options = options || {};
    const C = TEINTES[options.clair ? 'clair' : 'sombre'];
    const corps = new Corps(atlas.squelette, atlas.peau ? regions => atlas.peau(regions) : null);
    const spec = exo.spec || (exo.exercice && specDe(exo.exercice)) || ANCIENS[exo.mouvement] || exo.mouvement;
    if (!spec) throw new Error('exercice sans mouvement : ' + (exo.exercice || ''));
    const d = definir(spec, corps, C), modeles = {};
    function placer(t, uFixe) {
      const av = avancee(d, t, uFixe), pose = poseDe(d, av);
      let info = corps.poser(pose);
      if (d.filet) {
        // Filet de sécurité des enchaînements complexes : entre deux poses clés, rien ne descend sous le sol.
        let bas = Infinity; for (const pt of corps.pw) if (pt.y < bas) bas = pt.y;
        if (bas < 0.045) { const p2 = Object.assign({}, pose, { bassin: { pos: pose.bassin.pos.clone().add(V(0, 0.045 - bas, 0)), rot: pose.bassin.rot } }); info = corps.poser(p2); }
      }
      return { info, formes: materielDe(d, info, av.u, C, modeles) };
    }
    // Cadrage : tout ce qui se voit pendant la répétition entière (articulations, plus une marge pour la chair ; matériel).
    const mini = [1e9, 1e9, 1e9], maxi = [-1e9, -1e9, -1e9];
    const etendre = (x, y, z, r) => { mini[0] = Math.min(mini[0], x - r); mini[1] = Math.min(mini[1], y - r); mini[2] = Math.min(mini[2], z - r); maxi[0] = Math.max(maxi[0], x + r); maxi[1] = Math.max(maxi[1], y + r); maxi[2] = Math.max(maxi[2], z + r); };
    for (let n = 0; n < 12; n++) {
      const { formes } = placer(n / 12 * d.periode);
      for (const pt of corps.pw) etendre(pt.x, pt.y, pt.z, 0.09);
      // Le matériel : les huit coins de chaque forme, tournés et posés (sauf ce qui est très grand : murs, colonnes).
      for (const f of formes) {
        if (Math.max(f.s[0], f.s[1], f.s[2]) > 1.9) continue;
        const q = new Quat(f.q[0], f.q[1], f.q[2], f.q[3]), dd = f.forme === 'boite' ? [f.s[0] / 2, f.s[1] / 2, f.s[2] / 2] : f.forme === 'cylindre' ? [f.s[0], f.s[1] / 2, f.s[2]] : [f.s[0], f.s[1], f.s[2]];
        for (let k = 0; k < 8; k++) { const cc = V(k & 1 ? dd[0] : -dd[0], k & 2 ? dd[1] : -dd[1], k & 4 ? dd[2] : -dd[2]).applyQuaternion(q); etendre(f.p[0] + cc.x, f.p[1] + cc.y, f.p[2] + cc.z, 0); }
      }
    }
    mini[1] = Math.max(0, mini[1]);
    const vue = options.vue || d.vue || { az: 45, el: 10 };
    function rendre(t, uFixe) {
      const { info, formes } = placer(t, uFixe);
      atlas.poser(corps.matrices());
      atlas.objets(formes);
      const b = corps.pw[0];
      atlas.ombre({ centre: [(mini[0] + maxi[0]) / 2, (mini[2] + maxi[2]) / 2], taille: [Math.max(0.45, (maxi[0] - mini[0]) * 0.5), Math.max(0.45, (maxi[2] - mini[2]) * 0.5)], pieds: false, force: b.y > 1.4 ? 0.5 : 1 });
      return info;
    }
    let actif = false, t0 = 0;
    const pas = tSec => { if (!actif) return false; if (!t0) t0 = tSec; rendre(tSec - t0); return true; };
    return {
      corps, rendre, boite: { min: mini, max: maxi }, vue, definition: d,
      cadrer(duree) { atlas.cadrerBoite(mini, maxi, vue, duree); },
      demarrer() { if (!actif) { actif = true; t0 = 0; atlas.animer(pas); } },
      arreter() { actif = false; atlas.animer(null); },
      // Retour à la position anatomique, sans matériel.
      quitter() { actif = false; atlas.animer(null); atlas.poser(null); atlas.objets([]); atlas.ombre(null); }
    };
  }

  racine.AnqaMouvements = { creerAnimation, definir, poseA, avancee, poseDe, materielDe, specDe, lireSpec, FAM, EXERCICES, TEINTES, cycle, Corps, V3, Quat };
})(typeof window !== 'undefined' ? window : globalThis);
