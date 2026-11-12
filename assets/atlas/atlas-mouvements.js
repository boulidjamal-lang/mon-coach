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
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
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
  function ik2(A, C, l1, l2, pole, distMin) {
    const d = C.clone().sub(A);
    let dist = d.length();
    const dir = d.normalize();
    // distMin : l'articulation du milieu ne plie pas au-delà de ce que la chair permet (voir Corps.L.coudeMin) ; une
    // cible plus proche est atteinte « de loin », dans la même direction.
    dist = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-4, distMin || 0), l1 + l2 - 1e-4);
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
     Options communes aux bras : hausse (épaule haussée) et avance (épaule portée en avant), en degrés ; ceinture
     (part du mouvement du bras reprise par la ceinture scapulaire, à la place de la part ordinaire) ; doigts.
     Options des jambes : orteils (flexion des orteils quand le pied est sur la pointe). */
  class Corps {
    /* squelette : articulations de l'atlas ({ nom, parent, centre, jumeau }) ; sourcePeau(regions) : points de la
       surface du corps au repos ({ n, P, J, W }) pour mesurer le corps posé (appuis, contrôles). */
    constructor(squelette, sourcePeau) {
      const nb = squelette.length;
      this.nb = nb; this.S = squelette;
      this.i = Object.fromEntries(squelette.map((a, k) => [a.nom, k]));
      this.parent = squelette.map(a => a.parent);
      // Les attaches (ajoutées par le moteur : voir reponderer) : orientation de l'articulation d'origine (de), placées
      // comme le point d'insertion (leur centre) emmené par l'os visé (vers). Elles suivent, elles ne se posent pas.
      this.virtuel = squelette.map(a => a.virtuel || null);
      this.evase = new Float32Array(nb); this.aEvase = false;
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
      // Le coude ne plie pas au-delà de 152° : plus loin, l'avant-bras traverse le biceps (le modèle a la carrure d'un
      // athlète, sa chair ne s'écrase pas) — c'est déjà la barre aux clavicules d'un développé ou d'un squat avant.
      // coudeMin : la distance de l'épaule au poignet à cette flexion.
      const plie = rad(152);
      L.coudeMin = Math.sqrt(L.bras * L.bras + L.avantBras * L.avantBras + 2 * L.bras * L.avantBras * Math.cos(plie));
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
      this.aEvase = false;
      for (let b = 0; b < nb; b++) {
        const p = parent[b], vi = this.virtuel[b];
        if (vi) {
          // Où va le point d'insertion (emmené par l'os visé) ; vu de l'articulation d'origine, de combien il a tourné
          // autour de l'axe du tronc : l'attache prend l'orientation de l'origine, tournée d'autant (voir le moteur).
          const c = this.tete[b], w = pw[b].copy(c).sub(this.tete[vi.vers]).applyQuaternion(qw[vi.vers]).add(pw[vi.vers]);
          const l = w.clone().sub(pw[vi.de]).applyQuaternion(qw[vi.de].clone().invert()).add(this.tete[vi.de]), xA = vi.axe[0], zA = vi.axe[1];
          let an = Math.atan2(l.x - xA, l.z - zA) - Math.atan2(c.x - xA, c.z - zA); if (an > Math.PI) an -= 2 * Math.PI; else if (an < -Math.PI) an += 2 * Math.PI;
          qw[b].copy(qw[vi.de]).multiply(qAxe(AY, an));
          // L'évasement : l'écart à l'axe que prend le muscle quand l'insertion monte (voir le moteur).
          this.evase[b] = (vi.evase || 0) * Math.max(0, l.y - c.y); if (this.evase[b] > 1e-5) this.aEvase = true;
          continue;
        }
        if (p < 0) { qw[b].copy(ql[b]); pw[b].copy(this.posRacine); continue; }
        qw[b].multiplyQuaternions(qw[p], ql[b]);
        if (pFixe[b]) pw[b].copy(pFixe[b]);
        else pw[b].copy(decal[b]).applyQuaternion(qw[p]).add(pw[p]);
      }
    }
    /* La ceinture scapulaire sans roulis. La rotation qc met l'épaule (le centre de l'humérus) où il faut, mais, bras
       levé par l'avant, c'est un roulis autour de la clavicule : l'omoplate et ses muscles basculaient alors de
       plusieurs centimètres dans les côtes. On garde l'endroit de l'épaule — donc tout le geste du bras — et on y mène
       la ceinture par une montée (autour de l'axe avant-arrière du thorax) puis une avancée (autour de son axe
       vertical) : l'omoplate glisse sur le dos, vers le haut et vers le flanc, comme elle le fait. */
    sansRoulis(x, qc, QT) {
      const i = this.i, c = this.tete[i['humerus' + x]].clone().sub(this.tete[i['clavicule' + x]]);
      const t = c.clone().applyQuaternion(QT.clone().invert().multiply(qc));
      // La montée e : c.x·sin e + c.y·cos e = t.y ; des deux solutions, la plus petite.
      const A = Math.hypot(c.x, c.y); if (!(A > 1e-6)) return qc;
      const d = Math.atan2(c.y, c.x), a = Math.asin(borne(t.y / A, -1, 1)), tour = v => v - 2 * Math.PI * Math.round(v / (2 * Math.PI));
      const e1 = tour(a - d), e2 = tour(Math.PI - a - d), e = Math.abs(e1) <= Math.abs(e2) ? e1 : e2;
      const x1 = c.x * Math.cos(e) - c.y * Math.sin(e);
      // L'avancée p, autour de la verticale : elle amène (x1, c.z) sur (t.x, t.z).
      const p = tour(Math.atan2(t.x, t.z) - Math.atan2(x1, c.z));
      return QT.clone().multiply(qAxe(AY, p)).multiply(qAxe(AZ, e));
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
    /* Le déplacement de chaque articulation en quaternion dual (rotation, glissement), comme le moteur les mélange :
       chaque rotation est prise du même côté que celle de son parent. */
    quaternionsDuaux() {
      const q = this.dq || (this.dq = new Float32Array(this.nb * 8));
      for (let b = 0; b < this.nb; b++) {
        const r = this.qw[b], c = this.tete[b], p = this.pw[b], pa = this.parent[b], o = b * 8;
        let x = r.x, y = r.y, z = r.z, w = r.w;
        if (pa >= 0 && x * q[pa * 8] + y * q[pa * 8 + 1] + z * q[pa * 8 + 2] + w * q[pa * 8 + 3] < 0) { x = -x; y = -y; z = -z; w = -w; }
        // Le glissement : où va l'origine (p − R·c).
        const ux = y * c.z - z * c.y, uy = z * c.x - x * c.z, uz = x * c.y - y * c.x;
        const tx = p.x - (c.x + 2 * (w * ux + y * uz - z * uy)), ty = p.y - (c.y + 2 * (w * uy + z * ux - x * uz)), tz = p.z - (c.z + 2 * (w * uz + x * uy - y * ux));
        q[o] = x; q[o + 1] = y; q[o + 2] = z; q[o + 3] = w;
        q[o + 4] = 0.5 * (tx * w + ty * z - tz * y); q[o + 5] = 0.5 * (ty * w + tz * x - tx * z); q[o + 6] = 0.5 * (tz * w + tx * y - ty * x); q[o + 7] = -0.5 * (tx * x + ty * y + tz * z);
      }
      return q;
    }
    /* La peau posée (les deux côtés), pour la pose en cours : appelle f(x, y, z) pour chaque point. Même mélange que
       le moteur : quaternions duaux, et, à l'épaule, la part « par la corde » que la source donne pour chaque point
       (pe.C) — ce qu'on mesure ici est ce qui se dessine. */
    peauPosee(regions, f, unCote) {
      const pe = this.peau(regions); if (!pe) return false;
      const q = this.quaternionsDuaux(), S = this.S, A = this.appuis && this.appuis.length ? this.appuis : null;
      // unCote : le côté gauche seul (une pose symétrique se lit sur un côté, pour moitié prix).
      for (let cote = 0; cote < (unCote ? 1 : 2); cote++) for (let v = 0; v < pe.n; v++) {
        const X = cote ? -pe.P[v * 3] : pe.P[v * 3], Y = pe.P[v * 3 + 1], Z = pe.P[v * 3 + 2];
        let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0;
        for (let k = 0; k < 4; k++) {
          const w = pe.W[v * 4 + k]; if (!w) continue;
          const o = (cote ? S[pe.J[v * 4 + k]].jumeau : pe.J[v * 4 + k]) * 8;
          rx += w * q[o]; ry += w * q[o + 1]; rz += w * q[o + 2]; rw += w * q[o + 3]; dx += w * q[o + 4]; dy += w * q[o + 5]; dz += w * q[o + 6]; dw += w * q[o + 7];
        }
        const l = 1 / (Math.hypot(rx, ry, rz, rw) || 1); rx *= l; ry *= l; rz *= l; rw *= l; dx *= l; dy *= l; dz *= l; dw *= l;
        const ux = ry * Z - rz * Y + rw * X, uy = rz * X - rx * Z + rw * Y, uz = rx * Y - ry * X + rw * Z;
        let px = X + 2 * (ry * uz - rz * uy) + 2 * (rw * dx - dw * rx + ry * dz - rz * dy),
          py = Y + 2 * (rz * ux - rx * uz) + 2 * (rw * dy - dw * ry + rz * dx - rx * dz),
          pz = Z + 2 * (rx * uy - ry * ux) + 2 * (rw * dz - dw * rz + rx * dy - ry * dx);
        const c = pe.C ? pe.C[v] : 0;
        if (c > 0) {
          // Par la corde : la moyenne des places que chaque articulation donnerait au point.
          let cx = 0, cy = 0, cz = 0, wt = 0;
          for (let k = 0; k < 4; k++) {
            const w = pe.W[v * 4 + k]; if (!w) continue;
            const o = (cote ? S[pe.J[v * 4 + k]].jumeau : pe.J[v * 4 + k]) * 8, ax = q[o], ay = q[o + 1], az = q[o + 2], aw = q[o + 3], bx = q[o + 4], by = q[o + 5], bz = q[o + 6], bw = q[o + 7];
            const vx = ay * Z - az * Y + aw * X, vy = az * X - ax * Z + aw * Y, vz = ax * Y - ay * X + aw * Z;
            cx += w * (X + 2 * (ay * vz - az * vy) + 2 * (aw * bx - bw * ax + ay * bz - az * by));
            cy += w * (Y + 2 * (az * vx - ax * vz) + 2 * (aw * by - bw * ay + az * bx - ax * bz));
            cz += w * (Z + 2 * (ax * vy - ay * vx) + 2 * (aw * bz - bw * az + ax * by - ay * bx));
            wt += w;
          }
          px += (cx / wt - px) * c; py += (cy / wt - py) * c; pz += (cz / wt - pz) * c;
        }
        // Les attaches : l'évasement du muscle qui monte avec le bras (voir le programme des sommets du moteur).
        if (this.aEvase) for (let k = 0; k < 4; k++) {
          const w = pe.W[v * 4 + k]; if (!w) continue;
          const j = cote ? S[pe.J[v * 4 + k]].jumeau : pe.J[v * 4 + k], e = this.evase[j]; if (!(e > 0)) continue;
          const a = this.virtuel[j].axe, ex = X - a[0], ez = Z - a[1], g = e * w * Math.min(1, 2 * (1 - w)) / Math.max(Math.hypot(ex, ez), 1e-4), vx = ex * g, vz = ez * g;
          // (vx, 0, vz) tourné par la rotation mélangée du sommet.
          const tx = -rz * 0 + rw * vx + ry * vz, ty = rz * vx - rx * vz, tz = rx * 0 - ry * vx + rw * vz;
          px += vx + 2 * (ry * tz - rz * ty); py += 2 * (rz * tx - rx * tz); pz += vz + 2 * (rx * ty - ry * tx);
        }
        // Les appuis du mouvement (this.appuis, voir appuisDe) : la chair écrasée contre les coussins, comme le moteur la dessine.
        if (A) for (let i = 0; i < A.length; i++) {
          const a = A[i], h = a[4] * px + a[5] * py + a[6] * pz + a[7];
          if (h < 0 && h > -a[14]) {
            const bord = (1 - lisse((Math.abs(a[0] * px + a[1] * py + a[2] * pz + a[3]) - a[12]) / 0.03)) * (1 - lisse((Math.abs(a[8] * px + a[9] * py + a[10] * pz + a[11]) - a[13]) / 0.03));
            const e = (-h - a[15] * (1 - Math.exp(h / a[15]))) * bord * lisse((h + a[14]) / (0.25 * a[14]));
            px += a[4] * e; py += a[5] * e; pz += a[6] * e;
          }
        }
        f(px, py, pz);
      }
      return true;
    }
    /* Jusqu'où va le corps dans la direction n (unitaire), pour la pose p : le plus grand (point · n).
       zone(x, y, z) : ne compter que les points pour lesquels elle dit vrai (ce qui est au-dessus d'un coussin). */
    extreme(p, n, regions, zone) {
      this.poser(p);
      let m = -Infinity;
      if (!this.peauPosee(regions, (x, y, z) => { if (zone && !zone(x, y, z)) return; const d = x * n.x + y * n.y + z * n.z; if (d > m) m = d; })) {
        for (const q of this.pw) m = Math.max(m, q.dot(n) + 0.06);   // sans la peau : les articulations, plus une marge
      }
      return m;
    }
    /* Déplace le bassin de la pose p pour que le corps repose sur un plan (point Q, normale n vers le dehors).
       zone : la partie du plan qui porte (voir extreme) ; si rien du corps n'est au-dessus, la pose ne bouge pas. */
    poserSur(p, Q, n, regions, zone) {
      const e = this.extreme(p, n.clone().multiplyScalar(-1), regions, zone);
      if (e === -Infinity) return p;
      const d = -e - Q.dot(n);
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
        cou: this.monde('cou1'), tete: this.monde('tete'), qThorax: this.qMonde('thorax'), qBassin: this.qMonde('bassin'), qTete: this.qMonde('tete'),
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
    devantJambes(p, yMin, yMax, regions, unCote) {
      this.tronc(p);
      const info = { angles: {}, chevilles: {}, genoux: {}, orteils: {} };
      for (const [c, s, x] of COTES) this.jambe(c, s, x, p.jambes[c], info);
      let zMax = -Infinity;
      // regions : pour ne relire que la peau qui peut se trouver à cette hauteur (jambe sous le genou, cuisse et bassin au-dessus).
      if (!this.peauPosee(regions || ['bassin', 'cuisse', 'jambe'], (x, y, z) => { if (y >= yMin && y <= yMax && z > zMax) zMax = z; }, unCote)) return 0.12;
      return zMax === -Infinity ? 0.12 : zMax;
    }
    /* Une barre horizontale (en travers, de rayon r) à la hauteur y, amenée contre le corps dans la pose en cours, par
       l'avant (sens 1) ou par l'arrière (sens -1) : le z de son axe quand elle touche, entre le plan médian et xMax ;
       null si le corps ne passe pas à cette hauteur. Avec un rayon grossi d'une marge, c'est par où elle passe à
       distance (devant le visage, derrière le crâne). */
    barreContre(y, r, regions, xMax, sens) {
      let m = -Infinity;
      if (!this.peauPosee(regions, (px, py, pz) => { const dy = py - y; if (px <= xMax && dy < r && dy > -r) { const z = sens * pz + Math.sqrt(r * r - dy * dy); if (z > m) m = z; } }, true)) return null;
      return m === -Infinity ? null : sens * m;
    }
    /* Les jambes seules, pour la pose donnée (ni les bras ni la peau) : hanches, genoux, chevilles. Sert à régler une
       posture sur ses jambes sans poser tout le corps. */
    jambesDe(p) {
      const t = this.tronc(p), info = { angles: {}, chevilles: {}, genoux: {}, orteils: {}, hanches: t.hanches, epaules: t.epaules };
      for (const [c, s, x] of COTES) this.jambe(c, s, x, p.jambes[c], info);
      return info;
    }
    /* Un bras (voir en tête de classe les trois façons de le décrire) ; doigts : 'barre', 'plat', 'detendu', 'poing'. */
    bras(c, s, x, b, info) {
      const L = this.L, R = this.R[c], i = this.i;
      const QT = this.qw[i.thorax].clone();
      const angles = b.elev != null;
      let d1, d2, coude, fFixe = null, paume, dirMain = b.dirMain ? unite(b.dirMain) : null;
      // Dégagement (voir degagerTenu) : le poignet est déplacé de b.dg (un vecteur, dans le monde) pour que ce que la
      // main tient s'écarte de la cuisse ou du buste ; la main garde son orientation, le coude suit.
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
      const dg = b.dg && b.dg.lengthSq() > 1e-10 ? b.dg : null, d1o = d1, d2o = d2;
      if (dg) fFixe = null;   // le coude plie où le déplacement le mène
      const resoudre = () => {
        const ep = this.pw[i['humerus' + x]];
        if (angles || b.dirBras) {
          if (!angles) { d1 = unite(b.dirBras); d2 = unite(b.dirAvantBras || b.dirBras); }
          else { d1 = d1o; d2 = d2o; }
          coude = ep.clone().add(d1.clone().multiplyScalar(L.bras));
          if (dg) {
            // Par angles : le poignet où les angles le mettent, déplacé ; le coude garde son côté.
            const r = ik2(ep, coude.clone().add(d2.clone().multiplyScalar(L.avantBras)).add(dg), L.bras, L.avantBras, d1, L.coudeMin);
            coude = r.milieu; d1 = unite(coude.clone().sub(ep)); d2 = unite(r.fin.clone().sub(coude));
          }
          return;
        }
        // La barre est dans le creux de la main ; le poignet est en retrait, dans l'axe des doigts.
        const creux = (dg ? b.prise.clone().add(dg) : b.prise.clone()).sub(paume.clone().multiplyScalar(L.creux));
        const r = dirMain ? ik2(ep, creux.sub(dirMain.clone().multiplyScalar(L.main)), L.bras, L.avantBras, b.pole, L.coudeMin) : ik2(ep, creux, L.bras, L.prise, b.pole, L.coudeMin);
        coude = r.milieu; d1 = unite(coude.clone().sub(ep)); d2 = unite(r.fin.clone().sub(coude));
      };
      // 1. La ceinture scapulaire (clavicule et omoplate) accompagne le bras, mesuré depuis le thorax ;
      //    elle peut en plus se hausser (haussement d'épaules) ou s'avancer.
      resoudre();
      const libre0 = arc(R.bras.d1.clone().applyQuaternion(QT), d1).multiply(QT);
      let qc = QT.clone().slerp(libre0, b.ceinture != null ? b.ceinture : K_CEINTURE);
      if (b.hausse || b.avance) qc = qAxe(AZ.clone().applyQuaternion(QT), s * rad(b.hausse || 0)).multiply(qAxe(AY.clone().applyQuaternion(QT), -s * rad(b.avance || 0))).multiply(qc);
      qc = this.sansRoulis(x, qc, QT);
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
     Des formes simples dans le repère de l'objet (voir formesDeBase dans atlas3d.js) : cylindre (le long de Y dans le
     moteur ; ici couché le long de X par défaut), boîte, sphère, anneau, demi-anneau, prisme à six pans. Un cylindre
     et une boîte peuvent avoir les bords arrondis (dernier réglage, en mètres) : c'est ce qui fait un coussin, un
     disque, un tube d'acier. Les mesures sont celles d'une salle : barre de 28 mm, disque de 45 cm, banc à 44 cm.
     Les teintes suivent le thème. */
  const TEINTES = {
    sombre: { metal: [205, 208, 216], fonte: [42, 43, 48], gomme: [30, 31, 35], banc: [50, 51, 58], cadre: [118, 121, 130], cable: [150, 152, 160], elastique: [214, 88, 120], ballon: [92, 110, 150], bois: [176, 148, 112], tapis: [50, 52, 60], sangle: [70, 72, 80], pile: [60, 62, 70], repere: [228, 104, 152] },
    clair: { metal: [186, 189, 197], fonte: [52, 53, 58], gomme: [40, 41, 46], banc: [62, 63, 70], cadre: [134, 137, 146], cable: [110, 112, 120], elastique: [205, 60, 100], ballon: [86, 108, 160], bois: [170, 140, 104], tapis: [150, 152, 160], sangle: [90, 92, 100], pile: [78, 80, 88], repere: [214, 70, 124] }
  };
  const COUCHE = qAxe(AZ, Math.PI / 2);   // un cylindre couché le long de X
  const DEBOUT_Q = new Quat();            // un cylindre debout (le long de Y)
  const LONG_Z = qAxe(AX, Math.PI / 2);   // un cylindre couché le long de Z
  const ANNEAU_X = qAxe(AY, Math.PI / 2); // un anneau dont l'axe est X (autour d'une barre)
  const cyl = (r, l, x, y, z, couleur, metal, q, arrondi) => ({ forme: 'cylindre', s: [r, l, r], p: V(x, y, z), q: q || COUCHE, couleur, metal, r: arrondi || 0 });
  const boite = (lx, ly, lz, x, y, z, couleur, metal, q, arrondi) => ({ forme: 'boite', s: [lx, ly, lz], p: V(x, y, z), q: q || new Quat(), couleur, metal, r: arrondi || 0 });
  const sphere = (r, x, y, z, couleur, metal) => ({ forme: 'sphere', s: [r, r, r], p: V(x, y, z), q: new Quat(), couleur, metal, r: 0 });
  const tore = (r, x, y, z, couleur, metal, q, tube) => ({ forme: 'tore', s: [r, r, r], p: V(x, y, z), q: q || new Quat(), couleur, metal, r: tube == null ? 0.14 * r : tube });
  const demiAnneau = (r, tube, x, y, z, couleur, metal, q) => ({ forme: 'arc', s: [r, r, r], p: V(x, y, z), q: q || new Quat(), couleur, metal, r: tube });
  const hexa = (r, l, x, y, z, couleur, metal, q) => ({ forme: 'hexa', s: [r, l, r], p: V(x, y, z), q: q || COUCHE, couleur, metal, r: 0 });
  /* Un cylindre tendu entre deux points (câble, élastique, sangle, tige). */
  const seg = (a, b, r, couleur, metal, arrondi) => {
    const d = b.clone().sub(a), l = d.length() || 1e-4;
    return { forme: 'cylindre', s: [r, l, r], p: a.clone().add(b).multiplyScalar(0.5), q: arc(AY, d.multiplyScalar(1 / l)), couleur, metal, r: arrondi || 0 };
  };
  /* Un profilé d'acier carré, de côté e, entre deux points ; `face` : vers où tourner l'un de ses pans. */
  const tube = (a, b, e, couleur, metal, face) => {
    const d = b.clone().sub(a), l = d.length() || 1e-4, y = d.multiplyScalar(1 / l);
    let x = perp(face || (Math.abs(y.y) > 0.9 ? AZ : AY), y);
    if (x.lengthSq() < 1e-6) x = perpendiculaire(y);
    x.normalize();
    return { forme: 'boite', s: [e, l + e * 0.5, e], p: a.clone().add(b).multiplyScalar(0.5), q: new Quat().setFromBasis(x, y, x.clone().cross(y)), couleur, metal: metal == null ? 0.45 : metal, r: e * 0.18 };
  };
  /* Un coussin (mousse sous vinyle) : une boîte aux bords très doux. */
  const coussin = (lx, ly, lz, x, y, z, C, q) => Object.assign(boite(lx, ly, lz, x, y, z, C.banc, 0.12, q, Math.min(0.024, ly * 0.42)), { appui: 1 });
  /* Déplace des formes (dans leur repère) : rotation puis position ; les formes restent modifiables. */
  const deplacer = (formes, pos, rot) => formes.map(f => Object.assign({}, f, { p: (rot ? f.p.clone().applyQuaternion(rot) : f.p.clone()).add(pos || V()), q: rot ? rot.clone().multiply(f.q) : f.q }));

  /* Un disque de fonte gainé, sur une barre le long de X : la galette, son moyeu d'acier et un jonc en relief. */
  const galette = (C, R, ep, x) => [
    cyl(R, ep, x, 0, 0, C.fonte, 0.05, null, Math.min(0.014, ep * 0.42)),
    cyl(R * 0.3, ep + 0.008, x, 0, 0, C.metal, 0.75, null, 0.003),
    tore(R * 0.74, x + ep / 2, 0, 0, C.fonte, 0.05, ANNEAU_X, 0.005), tore(R * 0.74, x - ep / 2, 0, 0, C.fonte, 0.05, ANNEAU_X, 0.005)
  ];
  /* Pile de poids d'une machine : plaques empilées entre deux tiges ; les plaques du haut (avec la tête et sa goupille)
     portent la marque `leve` : elles montent avec le câble (voir materielDe). Repère : la pile est centrée en x, z. */
  function pile(C, x, z, yBas, haut, n = 12, leves = 4) {
    const f = [], ep = 0.029, pas = 0.031, lx = 0.25, lz = 0.085;
    for (let i = 0; i < n; i++) { const pl = boite(lx, ep, lz, x, yBas + pas * (i + 0.5), z, C.pile, 0.2, null, 0.004); if (i >= n - leves) pl.leve = 1; f.push(pl); }
    const yT = yBas + pas * n;
    const tete = boite(lx * 0.5, 0.05, lz * 0.8, x, yT + 0.03, z, C.cadre, 0.5, null, 0.006); tete.leve = 1; f.push(tete);
    const goupille = cyl(0.007, 0.05, x, yBas + pas * (n - leves + 0.5), z + lz / 2 + 0.02, C.repere, 0.3, LONG_Z, 0.003); goupille.leve = 1; f.push(goupille);
    for (const s of [1, -1]) f.push(cyl(0.008, haut - yBas + 0.02, x + s * 0.085, (haut + yBas) / 2, z, C.metal, 0.9, DEBOUT_Q));
    return f;
  }
  /* Une poulie : la roue (axe le long de X) entre deux flasques. */
  const poulie = (C, x, y, z, r = 0.045) => [cyl(r, 0.02, x, y, z, C.gomme, 0.1, null, 0.006), cyl(r * 0.36, 0.034, x, y, z, C.metal, 0.8), boite(0.005, r * 2.3, r * 1.5, x + 0.015, y, z, C.cadre, 0.5, null, 0.002), boite(0.005, r * 2.3, r * 1.5, x - 0.015, y, z, C.cadre, 0.5, null, 0.002)];
  /* Pied d'un bâti : un profilé posé au sol, avec ses patins de gomme. */
  const patin = (C, a, b, e = 0.05) => [tube(a, b, e, C.cadre, 0.45, AY), boite(e + 0.012, e + 0.008, e + 0.012, a.x, a.y, a.z, C.gomme, 0, null, 0.008), boite(e + 0.012, e + 0.008, e + 0.012, b.x, b.y, b.z, C.gomme, 0, null, 0.008)];

  /* Bâti d'une machine à charge guidée, dans son repère (l'avant vers +Z) : un socle, deux montants et une traverse,
     la pile de poids entre ses tiges. H : hauteur ; z : le plan des montants. */
  const HAUT_PILE = 0.07 + 0.031 * 12 + 0.05;
  function bati(C, H, z = 0) {
    const f = [boite(0.52, 0.04, 0.6, 0, 0.02, z + 0.04, C.cadre, 0.45, null, 0.012)];
    for (const s of [1, -1]) f.push(tube(V(s * 0.2, 0.04, z), V(s * 0.2, H, z), 0.06, C.cadre));
    f.push(tube(V(-0.2, H, z), V(0.2, H, z), 0.06, C.cadre));
    f.push(...pile(C, 0, z, 0.07, H - 0.06));
    return f;
  }
  /* Le haut d'un grand bâti (tour de poulie, machine guidée) ne compte pas pour le cadrage : l'image se règle sur le
     corps et sur ce qu'il touche, quitte à couper un montant. */
  const horsCadre = (formes, yMax = 1.9) => { for (const f of formes) if (f.p.y > yMax) f.hors = 1; return formes; };

  const MAT = {
    /* Barre : longueur ; disques : rayon du grand disque (0 : barre nue). Longue (≥ 1,5 m) : barre olympique, ses
       manchons, une butée, deux disques et un collier de chaque côté ; courte : petite barre à disques. */
    barre(C, l = 1.6, disques = 0.225) {
      const f = [cyl(0.0135, l, 0, 0, 0, C.metal, 1)];
      if (l >= 1.5) for (const s of [1, -1]) {
        const x0 = s * (l / 2 - 0.26);                                             // la butée, au pied du manchon
        f.push(cyl(0.025, 0.26, s * (l / 2 - 0.13), 0, 0, C.metal, 0.9, null, 0.004));
        f.push(cyl(0.036, 0.022, x0, 0, 0, C.metal, 0.9, null, 0.005));
        if (disques) {
          f.push(...galette(C, disques, 0.046, x0 + s * 0.036));
          f.push(...galette(C, disques * 0.78, 0.034, x0 + s * 0.078).slice(0, 2));
          f.push(cyl(0.04, 0.03, x0 + s * 0.112, 0, 0, C.metal, 0.7, null, 0.006));
        }
      } else {
        // Les disques tiennent toujours au bout de la barre, même très courte.
        const R = Math.min(disques, 0.12), bout = Math.min(0.1, l * 0.18);
        for (const s of [1, -1]) {
          f.push(cyl(0.02, 0.012, s * (l / 2 - bout - 0.012), 0, 0, C.metal, 0.9, null, 0.003));
          if (disques) { f.push(...galette(C, R, 0.032, s * (l / 2 - bout + 0.012)).slice(0, 2)); f.push(cyl(0.03, 0.02, s * (l / 2 - bout + 0.04), 0, 0, C.metal, 0.7, null, 0.004)); }
        }
      }
      return f;
    },
    /* Barre EZ : la partie tenue ondule (prises inclinées), les manchons portent de petits disques. */
    barreEz(C, disques = 0.1) {
      const f = [], pts = [[-0.44, 0], [-0.33, 0], [-0.22, 0.022], [-0.11, 0], [0, 0.022], [0.11, 0], [0.22, 0.022], [0.33, 0], [0.44, 0]];
      for (let i = 0; i + 1 < pts.length; i++) f.push(seg(V(pts[i][0], pts[i][1], 0), V(pts[i + 1][0], pts[i + 1][1], 0), 0.0135, C.metal, 1, 0.0135));
      for (const s of [1, -1]) {
        f.push(cyl(0.022, 0.17, s * 0.515, 0, 0, C.metal, 0.9, null, 0.004));
        f.push(cyl(0.032, 0.02, s * 0.44, 0, 0, C.metal, 0.9, null, 0.004));
        if (disques) { f.push(...galette(C, disques, 0.03, s * 0.47).slice(0, 2)); f.push(...galette(C, disques * 0.8, 0.026, s * 0.5).slice(0, 2)); f.push(cyl(0.032, 0.022, s * 0.528, 0, 0, C.metal, 0.7, null, 0.004)); }
      }
      return f;
    },
    /* Haltère à têtes à six pans : poignée moletée, deux collerettes, deux têtes. */
    haltere(C, k = 1) {
      const f = [cyl(0.0145, 0.14, 0, 0, 0, C.metal, 1), cyl(0.0162, 0.086, 0, 0, 0, C.metal, 0.75, null, 0.002)];
      for (const s of [1, -1]) { f.push(cyl(0.027, 0.012, s * 0.062, 0, 0, C.metal, 0.9, null, 0.003)); f.push(hexa(0.062 * k, 0.07 * k, s * (0.068 + 0.035 * k), 0, 0, C.fonte, 0.05)); }
      return f;
    },
    /* Kettlebell : la poignée à l'origine (le long de X), la boule en dessous (vers -Y), à fond plat. */
    kettlebell(C) {
      const f = [demiAnneau(0.052, 0.0135, 0, -0.05, 0, C.fonte, 0.25), sphere(0.1, 0, -0.172, 0, C.fonte, 0.15), cyl(0.058, 0.022, 0, -0.262, 0, C.fonte, 0.15, DEBOUT_Q, 0.008)];
      for (const s of [1, -1]) f.push(seg(V(s * 0.052, -0.05, 0), V(s * 0.046, -0.105, 0), 0.0135, C.fonte, 0.25, 0.0135));
      return f;
    },
    /* Disque tenu à la main : galette, moyeu, joncs. Son axe est X. */
    disque(C, r = 0.2) { return galette(C, r, 0.036, 0); },
    balle(C, r = 0.11) { return [sphere(r, 0, 0, 0, C.ballon, 0), tore(r * 1.001, 0, 0, 0, C.gomme, 0, null, r * 0.035), tore(r * 1.001, 0, 0, 0, C.gomme, 0, ANNEAU_X, r * 0.035)]; },
    /* Banc : dossier relevé de `angle` degrés (0 = à plat, négatif = décliné), la charnière à l'origine, la tête vers
       -Z (lSiege = 0 : pas d'assise — le banc où l'on se couche à plat ventre, les cuisses libres) ;
       -Z ; le dessus du coussin est à la hauteur h. Bâti : une poutre, deux pieds à patins ; banc réglable : la
       crémaillère qui soutient le dossier ; banc décliné : les boudins qui retiennent les jambes. */
    banc(C, angle = 0, h = 0.44, lDossier = 0.9, lSiege = 0.32) {
      const f = [], a = rad(angle), ep = 0.065, larg = 0.3;
      const zAr = -lDossier * 0.72, zAv = lSiege - 0.07, yP = Math.min(0.14, h * 0.32);
      if (!angle) {
        f.push(coussin(larg, ep, lDossier + lSiege, 0, h - ep / 2, (lSiege - lDossier) / 2, C));
        f.push(tube(V(0, h - ep - 0.028, zAr - 0.06), V(0, h - ep - 0.028, zAv + 0.03), 0.055, C.cadre));
        for (const z of [zAr, zAv]) f.push(tube(V(0, 0.03, z), V(0, h - ep - 0.03, z), 0.055, C.cadre));
      } else {
        // Dossier : part de la charnière et monte vers l'arrière ; assise : légèrement relevée vers l'avant.
        const qd = qAxe(AX, a), mil = V(0, h - ep / 2 + Math.sin(a) * lDossier / 2, -Math.cos(a) * lDossier / 2);
        f.push(coussin(larg, ep, lDossier, mil.x, mil.y, mil.z, C, qd));
        if (lSiege > 0.05) f.push(coussin(larg, ep, lSiege, 0, h - ep / 2 + (angle > 0 ? 0.02 : 0), lSiege / 2 + 0.012, C, qAxe(AX, rad(angle > 0 ? -8 : 0))));
        f.push(tube(V(0, yP, zAr - 0.06), V(0, yP, zAv + 0.03), 0.055, C.cadre));
        // Le montant avant porte l'assise ; la crémaillère part de la poutre et soutient le dossier aux deux tiers.
        f.push(tube(V(0, 0.03, zAv), V(0, h - ep - 0.02, zAv - 0.04), 0.055, C.cadre));
        f.push(tube(V(0, yP, 0.02), V(0, h - ep - 0.02, 0.0), 0.05, C.cadre));
        const dessous = V(0, -ep / 2 - 0.012, 0).applyQuaternion(qd), appui = V(0, h - ep / 2 + Math.sin(a) * lDossier * 0.64, -Math.cos(a) * lDossier * 0.64).add(dessous);
        if (appui.y > yP + 0.08) f.push(tube(V(0, yP, Math.min(appui.z + 0.18, -0.05)), appui, 0.045, C.cadre));
        f.push(tube(V(0, 0.03, zAr), V(0, yP, zAr), 0.055, C.cadre));
        if (angle < 0) for (const [y, z] of [[h + 0.145, lSiege + 0.165], [h - 0.02, lSiege + 0.325]]) {
          // Banc décliné : le boudin du haut se loge au creux des genoux (sous la cuisse, derrière le mollet) ; les
          // chevilles se calent sous celui du bas, qui appuie sur le cou-de-pied (voir allonge : mêmes repères).
          f.push(cyl(0.05, 0.42, 0, y, z, C.banc, 0.12, null, 0.02)); f.push(tube(V(0, yP, zAv), V(0, y, z), 0.04, C.cadre));
        }
      }
      for (const [z, l] of [[zAr, 0.4], [zAv, 0.34]]) f.push(...patin(C, V(-l / 2, 0.028, z), V(l / 2, 0.028, z), 0.05));
      return f;
    },
    /* Supports de barre d'un banc de développé : deux montants derrière la tête, leurs crochets et une traverse.
       h : hauteur des crochets ; ecart : demi-écart des montants ; z : où ils se tiennent. */
    supports(C, h = 1.02, ecart = 0.53, z = 0) {
      const f = [];
      for (const s of [1, -1]) {
        f.push(tube(V(s * ecart, 0.03, z), V(s * ecart, h + 0.16, z), 0.05, C.cadre));
        f.push(...patin(C, V(s * ecart, 0.028, z - 0.2), V(s * ecart, 0.028, z + 0.34), 0.05));
        // Le crochet : une tablette et son ergot, vers le banc.
        f.push(boite(0.045, 0.018, 0.085, s * ecart, h - 0.02, z + 0.06, C.cadre, 0.5, null, 0.004));
        f.push(boite(0.045, 0.06, 0.016, s * ecart, h + 0.005, z + 0.098, C.cadre, 0.5, null, 0.004));
      }
      f.push(tube(V(-ecart, 0.2, z), V(ecart, 0.2, z), 0.045, C.cadre));
      return f;
    },
    /* Siège : assise à hauteur h, dossier incliné de `recul` degrés vers l'arrière (0 = sans dossier). */
    siege(C, h = 0.45, dossier = 0, recul = 8, larg = 0.36) {
      // L'assise : 32 cm de profondeur, de 18 cm derrière les hanches à 14 cm devant (on s'y assoit au bord : la cuisse,
      // qui descend vers le genou, ne la traverse pas).
      const f = [coussin(larg, 0.065, 0.32, 0, h - 0.0325, -0.02, C), tube(V(0, 0.03, 0), V(0, h - 0.07, 0), 0.06, C.cadre), tube(V(0, 0.03, -0.22), V(0, 0.03, 0.24), 0.055, C.cadre)];
      for (const z of [-0.22, 0.24]) f.push(...patin(C, V(-0.2, 0.028, z), V(0.2, 0.028, z), 0.05));
      if (dossier) {
        const a = rad(recul), q = qAxe(AX, -a);
        f.push(coussin(larg - 0.04, dossier, 0.065, 0, h + Math.cos(a) * dossier / 2, -0.2 - Math.sin(a) * dossier / 2, C, q));
        f.push(tube(V(0, 0.03, -0.22), V(0, h + Math.cos(a) * dossier * 0.7, -0.25 - Math.sin(a) * dossier * 0.7), 0.05, C.cadre));
      }
      return f;
    },
    /* Barre fixe sur portique : deux montants à patins, la barre, deux goussets. */
    barreFixe(C, h = 2.42, l = 1.3) {
      const f = [cyl(0.016, l + 0.05, 0, h, 0, C.metal, 1)];
      const pied = Math.min(0.9, 0.3 + h * 0.3);
      for (const s of [1, -1]) {
        f.push(tube(V(s * l / 2, 0.03, 0), V(s * l / 2, h + 0.07, 0), 0.06, C.cadre));
        f.push(...patin(C, V(s * l / 2, 0.028, -pied / 2), V(s * l / 2, 0.028, pied / 2), 0.055));
        if (h > 1.4) for (const z of [-1, 1]) f.push(tube(V(s * l / 2, 0.06, z * pied * 0.42), V(s * l / 2, 0.55, 0), 0.035, C.cadre));
      }
      return f;   // rien au-dessus de la barre : la tête et le buste y passent (traction, muscle-up)
    },
    /* Barres parallèles : deux barres le long de Z, à la hauteur h, écartées de 2 × ecart, sur un bâti en U. */
    paralleles(C, h = 1.25, ecart = 0.28, l = 0.7) {
      const f = [], zM = -l / 2 + 0.03;
      for (const s of [1, -1]) {
        f.push(cyl(0.019, l, s * ecart, h, 0, C.metal, 1, LONG_Z, 0.019));
        f.push(cyl(0.0215, l * 0.42, s * ecart, h, l * 0.26, C.gomme, 0, LONG_Z, 0.006));
        f.push(tube(V(s * ecart, 0.03, zM), V(s * ecart, h, zM), 0.05, C.cadre));
        f.push(...patin(C, V(s * ecart, 0.028, zM - 0.12), V(s * ecart, 0.028, zM + 0.55), 0.05));
        f.push(tube(V(s * ecart, 0.06, zM + 0.3), V(s * ecart, 0.5, zM), 0.035, C.cadre));
      }
      f.push(tube(V(-ecart, 0.32, zM), V(ecart, 0.32, zM), 0.045, C.cadre));
      return f;
    },
    step(C, lx = 0.5, h = 0.3, lz = 0.4, x = 0, z = 0) { return [boite(lx, h, lz, x, h / 2, z, C.banc, 0.05, null, Math.min(0.015, h * 0.3))]; },
    mur(C, z = -0.25, l = 1.4, h = 2.1) { return [boite(l, h, 0.04, 0, h / 2, z - 0.02, C.tapis, 0, null, 0.006)]; },
    /* Tour de poulie : la poulie est au point d'ancrage, sur un chariot qui coulisse le long d'un rail ; derrière, le
       bâti (deux montants, un socle, une traverse), la pile de poids entre ses tiges, et le câble qui monte à la poulie
       du haut puis redescend à la pile. La tour regarde le corps : `pied` (facultatif) dit où est son socle. */
    colonne(C, ancre, pied) {
      // Vers où la tour tourne le dos : à l'opposé du corps (ou vers son socle, quand il est donné).
      let dos = pied ? V(pied.x - ancre.x, 0, pied.z - ancre.z) : Math.abs(ancre.x) > 0.6 ? V(Math.sign(ancre.x), 0, 0) : V(0, 0, ancre.z < 0 ? -1 : 1);
      if (dos.lengthSq() < 1e-6) dos = V(0, 0, ancre.z < 0 ? -1 : 1);
      dos = Math.abs(dos.x) > Math.abs(dos.z) ? V(Math.sign(dos.x), 0, 0) : V(0, 0, Math.sign(dos.z) || 1);
      const rot = qAxe(AY, Math.atan2(-dos.x, -dos.z)), H = Math.max(2.1, ancre.y + 0.24), y = ancre.y, zB = -0.2;
      const f = bati(C, H, zB);
      f.push(tube(V(0, H, zB), V(0, H, -0.02), 0.05, C.cadre));
      // Le rail et le chariot de la poulie.
      f.push(cyl(0.013, H - 0.1, 0, (H + 0.1) / 2, -0.06, C.metal, 0.9, DEBOUT_Q));
      f.push(boite(0.07, 0.13, 0.06, 0, y, -0.06, C.gomme, 0.2, null, 0.01));
      f.push(...poulie(C, 0, y, 0));
      f.push(...poulie(C, 0, H - 0.07, -0.03, 0.04), ...poulie(C, 0, H - 0.07, zB, 0.04));
      // Le câble : de la poulie du chariot à celle du haut, puis à la pile.
      for (const [p0, p1] of [[V(0, y + 0.04, -0.012), V(0, H - 0.07, -0.012)], [V(0, H - 0.032, -0.03), V(0, H - 0.032, zB)], [V(0, H - 0.07, zB - 0.012), V(0, HAUT_PILE, zB - 0.012)]]) f.push(Object.assign(seg(p0, p1, 0.0042, C.cable, 0.6), { hors: 1 }));
      return horsCadre(deplacer(f, V(ancre.x, 0, ancre.z), rot));
    },
    /* Poste de tirage vertical : l'utilisateur est assis face au bâti (vers +Z), les cuisses sous deux boudins ; une
       potence part du haut du bâti et porte la poulie au-dessus de ses mains. ancre : la poulie ; h : hauteur de
       l'assise ; zSiege : où il est assis. */
    tirageHaut(C, ancre, h = 0.5, zSiege = 0) {
      const zB = zSiege + 0.86, H = ancre.y + 0.16, f = deplacer(bati(C, H, 0), V(0, 0, zB));
      f.push(tube(V(0, H, zB), V(0, H, ancre.z - 0.06), 0.06, C.cadre));
      f.push(tube(V(0, H - 0.3, zB), V(0, H, zB - 0.34), 0.04, C.cadre));
      f.push(...poulie(C, 0, ancre.y + 0.045, ancre.z, 0.045), ...poulie(C, 0, H - 0.075, zB - 0.02, 0.04));
      for (const [p0, p1] of [[V(0, ancre.y + 0.085, ancre.z + 0.02), V(0, H - 0.04, zB - 0.02)], [V(0, H - 0.075, zB + 0.012), V(0, HAUT_PILE, zB + 0.012)]]) f.push(Object.assign(seg(p0, p1, 0.0042, C.cable, 0.6), { hors: 1 }));
      // L'assise sur son pied, reliée au bâti ; les boudins au-dessus des cuisses.
      f.push(coussin(0.36, 0.065, 0.32, 0, h - 0.0325, zSiege - 0.02, C));
      f.push(tube(V(0, 0.03, zSiege), V(0, h - 0.07, zSiege), 0.06, C.cadre), tube(V(0, 0.03, zSiege - 0.2), V(0, 0.03, zB), 0.055, C.cadre));
      f.push(...patin(C, V(-0.22, 0.028, zSiege - 0.2), V(0.22, 0.028, zSiege - 0.2), 0.05));
      const yB = h + 0.175, zR = zSiege + 0.3;
      f.push(tube(V(0, yB, zB), V(0, yB, zR), 0.045, C.cadre));
      f.push(cyl(0.014, 0.5, 0, yB, zR, C.metal, 0.8));
      for (const s of [1, -1]) f.push(cyl(0.052, 0.2, s * 0.14, yB, zR, C.banc, 0.12, null, 0.02));
      return horsCadre(f, Math.max(1.9, ancre.y - 0.45));
    },
    /* Repose-pieds d'un poste de rowing assis : deux plaques inclinées sur une traverse, reliées au banc. */
    reposePieds(C, y, z, pente = 62, zBanc = 0, zTour = z + 0.4) {
      const a = rad(pente), q = qAxe(AX, -a), f = [];
      for (const s of [1, -1]) f.push(boite(0.15, 0.3, 0.02, s * 0.13, y, z, C.fonte, 0.3, q, 0.006));
      f.push(tube(V(-0.24, y - 0.02, z + 0.03), V(0.24, y - 0.02, z + 0.03), 0.04, C.cadre));
      f.push(tube(V(0, 0.03, z + 0.06), V(0, y - 0.02, z + 0.03), 0.05, C.cadre));
      f.push(tube(V(0, 0.03, zBanc), V(0, 0.03, zTour), 0.05, C.cadre));
      return f;
    },
    /* Smith machine : deux glissières chromées dans un bâti (montants, socles, traverses) ; la barre coulisse entre
       elles, ses disques à l'extérieur. z : le plan des glissières ; l : écart entre elles + 0,16. */
    smith(C, z, l = 1.6, h = 2.1, penche = 0) {
      const f = [], x = l / 2 - 0.08, zAr = z - 0.68;
      for (const s of [1, -1]) {
        f.push(cyl(0.016, h - 0.1, s * x, h / 2, z, C.metal, 0.95, DEBOUT_Q));
        f.push(tube(V(s * (x + 0.1), 0.03, zAr), V(s * (x + 0.1), h, zAr), 0.06, C.cadre));
        f.push(...patin(C, V(s * (x + 0.1), 0.028, zAr - 0.1), V(s * (x + 0.1), 0.028, z + 0.5), 0.06));
        f.push(tube(V(s * (x + 0.1), h, zAr), V(s * (x + 0.1), h, z + 0.06), 0.05, C.cadre));
        f.push(boite(0.14, 0.03, 0.08, s * (x + 0.04), 0.075, z, C.cadre, 0.5, null, 0.006));
        f.push(boite(0.14, 0.03, 0.08, s * (x + 0.04), h - 0.04, z, C.cadre, 0.5, null, 0.006));
      }
      f.push(tube(V(-(x + 0.1), h, zAr), V(x + 0.1, h, zAr), 0.06, C.cadre));
      f.push(tube(V(-(x + 0.1), 0.09, zAr), V(x + 0.1, 0.09, zAr), 0.045, C.cadre));
      return horsCadre(f);
    },
    /* Pupitre (curl au pupitre) : un coussin incliné devant le buste, sur un pied. */
    pupitre(C, y = 1.05, z = 0.2, angle = 45, long = 0.42, ep = 0.07) {
      const a = rad(angle);
      const f = [coussin(0.5, ep, long, 0, y, z, C, qAxe(AX, a)), tube(V(0, 0.03, z + 0.1), V(0, y - 0.08, z + 0.06), 0.06, C.cadre), tube(V(0, 0.03, z - 0.25), V(0, 0.03, z + 0.3), 0.055, C.cadre)];
      for (const zz of [z - 0.25, z + 0.3]) f.push(...patin(C, V(-0.2, 0.028, zz), V(0.2, 0.028, zz), 0.05));
      return f;
    },
    rouleau(C, l = 0.42, r = 0.07) { return [cyl(r, l, 0, 0, 0, C.ballon, 0, null, Math.min(0.012, r * 0.3))]; },
    /* Boudin d'une machine (jambes, chevilles), le long de X. */
    coussin(C, l = 0.34, r = 0.055) { return [cyl(r, l, 0, 0, 0, C.banc, 0.12, null, Math.min(0.022, r * 0.45)), cyl(0.014, l + 0.04, 0, 0, 0, C.metal, 0.8)]; },
    /* Poignée de câble ou de machine : le manchon de gomme sur son axe d'acier. */
    poignee(C, l = 0.13) { return [cyl(0.0125, l + 0.03, 0, 0, 0, C.metal, 1), cyl(0.0165, l - 0.02, 0, 0, 0, C.gomme, 0, null, 0.005)]; },
    /* Barre de tirage au bout d'un câble : acier, manchons de gomme aux deux bouts, émerillon au milieu. */
    barrette(C, l = 0.9) {
      const g = Math.min(0.16, l * 0.24);
      return [cyl(0.014, l, 0, 0, 0, C.metal, 1, null, 0.006), cyl(0.0175, g, l / 2 - g / 2 - 0.01, 0, 0, C.gomme, 0, null, 0.005), cyl(0.0175, g, -(l / 2 - g / 2 - 0.01), 0, 0, C.gomme, 0, null, 0.005), cyl(0.02, 0.03, 0, 0, 0, C.metal, 0.8, null, 0.004)];
    }
  };
  /* Pose un objet (liste de formes) dans le monde : position, rotation. Ajoute les formes prêtes pour le moteur. */
  function poserObjet(formes, pos, rot, sortie) {
    for (const f of formes) {
      const q = rot ? rot.clone().multiply(f.q) : f.q, p = rot ? f.p.clone().applyQuaternion(rot).add(pos) : (pos ? f.p.clone().add(pos) : f.p);
      const o = { forme: f.forme, s: f.s, q: [q.x, q.y, q.z, q.w], p: [p.x, p.y, p.z], couleur: f.couleur, metal: f.metal };
      if (f.r) o.r = f.r;
      if (f.leve) o.leve = f.leve;
      if (f.hors) o.hors = 1;
      if (f.appui) o.appui = 1;
      sortie.push(o);
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
  /* Où tombe le centre de gravité d'une posture debout, dans l'axe avant-arrière : masses des segments d'après les tables
     de Dempster et Winter (tronc 50 %, tête 8 %, bras 10 % comptés à l'épaule, cuisses 20 %, jambes 9 %, pieds 3 %).
     t : le tronc posé (c.tronc(p)) ; les jambes sont résolues depuis leurs appuis. */
  function aplomb(c, p, t) {
    const L = c.L, h = t.hanches, e = t.epaules;
    let z = 0.497 * (h.G.z + h.D.z + e.G.z + e.D.z) / 4 + 0.081 * (t.cou.z + 1.45 * (t.tete.z - t.cou.z)) + 0.1 * (e.G.z + e.D.z) / 2;
    for (const k of ['G', 'D']) {
      const j = p.jambes[k];
      if (!j.cheville) { z += 0.161 * h[k].z; continue; }
      const g = ik2(h[k], j.cheville, L.cuisse, L.jambe, j.pole || AZ).milieu;
      z += 0.1 * (h[k].z + 0.433 * (g.z - h[k].z)) + 0.0465 * (g.z + 0.433 * (j.cheville.z - g.z)) + 0.0145 * (j.cheville.z + 0.06);
    }
    return z;
  }
  /* Avance ou recule le bassin, pieds posés, jusqu'à ce que le centre de gravité tombe en z : une posture debout tient
     en équilibre sur ses pieds (au milieu du pied sous une charge), elle ne s'assied pas dans le vide.
     charge : une charge tenue, en part de la masse du corps, à l'aplomb des épaules décalé de `dzCharge`. */
  function equilibrer(c, p, z, charge, dzCharge) {
    for (let n = 0; n < 3; n++) {
      const t = c.tronc(p), zc = charge ? (aplomb(c, p, t) + charge * ((t.epaules.G.z + t.epaules.D.z) / 2 + (dzCharge || 0))) / (1 + charge) : aplomb(c, p, t);
      p.bassin.pos.z += (z - zc) / 0.85;
    }
    return p;
  }
  /* Règle une posture debout sur deux choses à la fois : la flexion des genoux (degrés) et l'aplomb du centre de gravité
     (z). Le bassin recule ou avance pour l'équilibre, monte ou descend pour les genoux. */
  function tenirDebout(c, p, genou, z, charge, dzCharge) {
    const L = c.L, D = Math.sqrt(L.cuisse * L.cuisse + L.jambe * L.jambe + 2 * L.cuisse * L.jambe * Math.cos(rad(genou)));
    for (let n = 0; n < 3; n++) {
      equilibrer(c, p, z, charge, dzCharge);
      const h = c.tronc(p).hanches.G, ch = p.jambes.G.cheville;
      p.bassin.pos.y += ch.y + Math.sqrt(Math.max(0.01, D * D - Math.pow(h.z - ch.z, 2) - Math.pow(h.x - ch.x, 2))) - h.y;
    }
    return p;
  }
  /* Le corps sur un coussin : sa chair s'y enfonce un peu (ENFONCE ; le moteur l'y écrase : voir appuisDe). Sur une
     assise relevée vers l'avant, c'est le dessous de la cuisse qui porte le premier, au bord de l'assise : il s'y enfonce
     davantage (ENFONCE_ASSISE), sans quoi les fesses resteraient en l'air à l'arrière.
     Les coussins des bancs font 30 cm de large et 6,5 cm d'épaisseur (MAT.banc) : seul ce qui est au-dessus porte. */
  const ENFONCE = 0.012, ENFONCE_ASSISE = 0.035, DEMI_COUSSIN = 0.15, EP_COUSSIN = 0.065, PROF_ASSISE = 0.14;
  /* Un banc à plat (dessus à 44 cm) dont on se sert comme d'un siège : on s'assoit au bout, face à +Z. Le banc, long de
     1,22 m, va de -0,9 à +0,32 dans son repère : il est reculé pour que son bord avant soit PROF_ASSISE devant les hanches. */
  /* Le siège d'une machine se règle à la personne : 45 cm pour ce corps (plus haut, la cuisse plonge vers le genou et
     traverse le bord de l'assise de plus que la chair ne peut s'écraser). */
  const H_SIEGE = 0.45;
  const H_BANC = 0.44, bancAssis = (C, z) => poseFixe(MAT.banc(C, 0), V(0, 0, (z || 0) + PROF_ASSISE - 0.32));
  /* Assis sur un siège de hauteur h, pieds à plat devant (zPieds : avancée des chevilles depuis le bassin). */
  function assis(c, o) {
    o = o || {};
    const h = o.h == null ? 0.45 : o.h, z = o.z || 0;
    const p = { bassin: { pos: V(0, h + 0.12, z), rot: qX(o.penche || 0) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k, s] of COTES) p.jambes[k] = o.jambes ? cloner(o.jambes) : pied(c, s, { ecart: o.ecart == null ? 0.14 : o.ecart, ouv: o.ouv == null ? 6 : o.ouv, z: z + (o.zPieds == null ? 0.4 : o.zPieds), y0: o.yPieds || 0, pointe: o.pointe });
    // Ce sont les fessiers qui se posent sur le coussin (le bassin se trouve alors dix centimètres au-dessus de
    // l'assise, comme sur un vrai siège) ; le dessous des cuisses, plus bas d'origine, s'y écrase : c'est un appui (voir
    // appuisDe). Les pieds restant au sol, la cuisse tourne quand le bassin monte : on s'y reprend à trois fois.
    const surAssise = (x, y, zz) => Math.abs(x) <= DEMI_COUSSIN && zz >= z - 0.22 && zz <= z + (o.prof == null ? PROF_ASSISE : o.prof);
    for (let n = 0; n < 3; n++) c.poserSur(p, V(0, h - ENFONCE, 0), AY, ['bassin'], surAssise);
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
      if (jb === 'sol' && angle < 0) {
        // Banc décliné : les genoux passent sur le boudin du haut, les chevilles se calent sous celui du bas.
        p.jambes[k] = { cheville: V(s * 0.1, h - 0.115, 0.57), pole: V(0, 1, 0.2), pied: V(0, 0.5, 0.87), hautPied: V(0, 0.87, -0.5) };
      } else if (jb === 'sol') {
        // Pieds à plat par terre de part et d'autre du banc, tibias presque droits : le genou plie à l'équerre, le pied
        // un rien en retrait du genou (c'est l'appui d'un développé couché).
        const ec = o.ecartPieds || 0.26, hHanche = pos.y - 0.04 - (angle > 0 ? Math.sin(a) * 0.02 : 0), yGenou = L.chevilleH + L.jambe * 0.985;
        const dz = Math.sqrt(Math.max(0.04, L.cuisse * L.cuisse - Math.pow(ec - L.hanche.x, 2) - Math.pow(hHanche - yGenou, 2)));
        p.jambes[k] = pied(c, s, { x: s * ec, ouv: 16, z: pos.z + dz - 0.05, pole: V(s * 0.3, 1, 0.25) });
      }
      else if (jb === 'plies') p.jambes[k] = pied(c, s, { x: s * 0.11, ouv: 4, z: pos.z + 0.47, y0: angle ? 0 : h, pole: V(0, 1, 0.2) });
      else if (jb === 'tendues') p.jambes[k] = J(angle, 4, 0, 2, 25);
      else if (jb === 'levees') p.jambes[k] = J(90, 3, 0, 90, 20);
      else p.jambes[k] = cloner(jb.G ? jb[k] : jb);
    }
    if (h <= 0.2) { c.poserSur(p, V(0, h, 0), n, ['dos', 'bassin']); return p; }
    // Sur un banc. Le dessus du dossier : un plan qui passe ep/2·(1 − cos a) au-dessus de la charnière (le coussin tourne
    // autour de son milieu). Banc relevé : l'assise, relevée de 8° vers l'avant, porte les fesses ; le corps glisse le
    // long du dossier jusqu'à elle (deux appuis à la fois), sauf si l'on a dit où il se tient (o.d).
    const Qd = V(0, h, 0).add(n.clone().multiplyScalar(angle ? EP_COUSSIN / 2 * (1 - Math.cos(a)) : 0));
    const dos = ['dos', 'bassin', 'epaule', 'thorax'], surCoussin = x => Math.abs(x) <= DEMI_COUSSIN;
    if (!(angle > 0) || o.d != null) { c.poserSur(p, Qd.clone().sub(n.clone().multiplyScalar(ENFONCE)), n, dos, surCoussin); return p; }
    const lS = o.lSiege || 0.32, th = rad(-8), ns = V(0, Math.cos(th), Math.sin(th)), ts = V(0, -Math.sin(th), Math.cos(th));
    const Cs = V(0, h - EP_COUSSIN / 2 + 0.02, lS / 2 + 0.012), Qs = Cs.clone().add(ns.clone().multiplyScalar(EP_COUSSIN / 2));
    for (let n2 = 0; n2 < 3; n2++) {
      c.poser(p);
      let aD = Infinity, aS = Infinity;
      c.peauPosee(dos, (x, y, z) => { if (!surCoussin(x)) return; const e = (y - Qd.y) * n.y + (z - Qd.z) * n.z; if (e < aD) aD = e; });
      c.peauPosee(['bassin', 'cuisse'], (x, y, z) => { if (!surCoussin(x) || Math.abs((y - Cs.y) * ts.y + (z - Cs.z) * ts.z) > lS / 2) return; const e = (y - Qs.y) * ns.y + (z - Qs.z) * ns.z; if (e < aS) aS = e; });
      if (aD === Infinity) break;
      const r1 = -ENFONCE - aD;
      if (aS === Infinity) { p.bassin.pos.add(n.clone().multiplyScalar(r1)); break; }
      // Le déplacement T (dans le plan vertical) tel que T·n = r1 et T·ns = r2.
      const r2 = -ENFONCE_ASSISE - aS, det = n.y * ns.z - n.z * ns.y;
      if (Math.abs(det) < 0.2) { p.bassin.pos.add(n.clone().multiplyScalar(r1)); break; }
      p.bassin.pos.add(V(0, (r1 * ns.z - r2 * n.z) / det, (n.y * r2 - ns.y * r1) / det));
    }
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
    // Sur un banc : le dessus du coussin (voir allonge), et seul ce qui est au-dessus de lui porte.
    if (h > 0.2) c.poserSur(p, V(0, h, 0).add(n.clone().multiplyScalar((angle ? EP_COUSSIN / 2 * (1 - Math.cos(a)) : 0) - ENFONCE)), n, o.regions || ['thorax', 'abdomen', 'bassin'], x => Math.abs(x) <= DEMI_COUSSIN);
    else c.poserSur(p, V(0, h, 0), n, o.regions || ['thorax', 'abdomen', 'bassin']);
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
    // Pendu, bras tendus : le corps descend jusqu'à ce que les coudes le soient (sauf si k dit de combien les plier) ;
    // et les mains tombent juste sur la barre, qui ne bouge pas.
    const surBarre = { G: V(ecart, H, o.z || 0), D: V(-ecart, H, o.z || 0) };
    if (o.k == null) tendre(c, p, V(0, -1, 0), null, null, surBarre); else viser(c, p, surBarre);
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
      const dT = (x, y, z) => V(s * x, y, z).applyQuaternion(t.qThorax), dC = (x, y, z) => V(s * x, y, z).applyQuaternion(t.qTete || t.qThorax);
      if (ou === 'hanches') r[k] = { prise: t.hanches[k].clone().add(V(s * 0.085, 0.1, 0.03).applyQuaternion(t.qBassin)), pole: dT(0.8, 0, -0.6), paume: dT(-1, -0.2, 0), dirMain: dT(-0.2, -0.3, 1), doigts: 'detendu' };
      // Mains derrière la tête : les paumes à plat sur l'arrière du crâne (au-dessus de la nuque), les doigts vers le
      // milieu, les coudes ouverts. Mains aux oreilles (couché) : le bout des doigts derrière l'oreille, la paume vers
      // la tempe. Les deux se placent dans le repère de la tête : elles la suivent quand le cou plie, et le coude reste
      // autour de 135° (plus près de l'épaule, il se replierait à fond).
      else if (ou === 'nuque') { const pm = unite(dC(-0.35, 0, 1)); r[k] = { prise: t.tete.clone().add(dC(0.05, 0.075, -0.107)).add(pm.clone().multiplyScalar(c.L.creux)), pole: dT(1, -0.15, 0.25), paume: pm, dirMain: dC(-0.9, 0.35, -0.1), doigts: 'detendu', ceinture: 0.1 }; }
      else if (ou === 'oreilles') { const pm = unite(dC(-1, 0, 0.25)); r[k] = { prise: t.tete.clone().add(dC(0.088, 0.115, -0.03)).add(pm.clone().multiplyScalar(c.L.creux)), pole: dT(1, -0.1, 0.4), paume: pm, dirMain: dC(-0.2, 0.9, -0.4), doigts: 'detendu', ceinture: 0.1 }; }
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
  /* Bras tendus. L'épaule monte avec le bras (ceinture scapulaire) : une « longueur de bras » comptée depuis l'épaule au
     repos laisse le coude plié de 60 à 75° dès que le bras passe au-dessus de la tête. coudeTendu cherche donc, sur le
     corps posé, la valeur x (entre a et b) pour laquelle le coude le plus tendu de poseDe(x) est à `cible` degrés — 10 par
     défaut : le bras est tendu, la main reste sur sa prise (si les deux bras ne tirent pas pareil, l'autre plie un peu
     plus : aucun ne dépasse sa portée). x doit éloigner la main de l'épaule en grandissant.
     tendre fait de même en déplaçant le bassin le long de dir (unitaire : vers où le corps s'éloigne des mains — vers
     le bas pendu à une barre, vers le haut en appui renversé) ; la pose est modifiée sur place et rendue. Avec
     `cibles` ({ G, D } : où les mains doivent tomber au juste, voir viser), le coude se mesure mains posées sur elles. */
  function coudeTendu(c, poseDe, a, b, cible, cotes) {
    cible = cible == null ? 10 : cible; cotes = cotes || ['G', 'D'];
    const plie = x => { const an = c.poser(poseDe(x)).angles; return Math.min(...cotes.map(k => an[k].coude)); };
    if (plie(a) <= cible) return null;                    // déjà tendu au plus près : rien à régler
    for (let n = 0; n < 12; n++) { const m = (a + b) / 2; if (plie(m) > cible) a = m; else b = m; }
    return a;
  }
  function tendre(c, p, dir, cible, cotes, cibles) {
    const p0 = p.bassin.pos.clone();
    const place = x => {
      p.bassin.pos = p0.clone().add(dir.clone().multiplyScalar(x));
      if (cibles) { for (const k in cibles) p.bras[k].prise = cibles[k].clone(); viser(c, p, cibles); }
      return p;
    };
    const x = coudeTendu(c, place, -0.3, 0.3, cible, cotes);
    return place(x == null ? 0 : x);
  }
  /* Une main posée par cible n'arrive pas exactement sur sa prise : le radius tourne autour de l'ulna, et le poignet
     se décale de 2 à 3 cm selon la pronation. Là où la place de la barre compte au centimètre (contre le corps, devant
     le visage), la cible est corrigée de l'écart constaté jusqu'à ce que la prise tombe juste. cibles : { G, D } (ou un
     seul côté) ; la pose est modifiée sur place ; rend ce que rend poser. */
  function viser(c, p, cibles) {
    for (let n = 0; n < 3; n++) {
      const info = c.poser(p);
      let pire = 0;
      for (const k in cibles) { const e = cibles[k].clone().sub(info.prises[k]); pire = Math.max(pire, e.length()); p.bras[k].prise = p.bras[k].prise.clone().add(e); }
      if (pire < 5e-4) return info;
    }
    return c.poser(p);
  }

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
    c.appuis = null;   // les appuis du mouvement précédent ne comptent pas pendant qu'on règle celui-ci
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
    degagerTenu(c, d, C);
    // Une machine à bras de levier arrive ici sans bâti : on lui donne le sien (montants, pile de poids, la traverse
    // qui porte les pivots, une poutre au sol jusqu'au siège). Le bâti se tient derrière le corps, ou devant quand
    // les pivots y sont (rowing) ; la pile monte avec le mouvement.
    if (o.machine && !d.fixe.some(x => x.leve)) {
      const info = c.poser(poseA(d, 0, 0));
      const pivots = d.tenu.filter(e => e.t === 'levier' && e.de).map(e => (typeof e.de === 'function' ? e.de(info, 0) : e.de)).filter(p => p && p.x != null);
      if (pivots.length) {
        const zP = pivots.reduce((t, p) => t + p.z, 0) / pivots.length, yP = Math.max(...pivots.map(p => p.y)), zC = info.bassin.z;
        // (bati 'devant' : le levier tourne autour du coude, sur un pupitre ; le bâti se tient au-delà des mains.)
        const coude = d.tenu.some(e => e.t === 'levier' && e.bati === 'devant'), devant = coude || zP - zC > 0.6;
        const zF = devant ? zP + (coude ? 0.45 : 0.14) : Math.min(zC, zP) - 0.6, H = Math.max(1.5, yP + 0.12), f = deplacer(bati(C, H, 0), V(0, 0, zF), devant ? qY(180) : null);
        for (const p of pivots) { f.push(tube(V(Math.sign(p.x || 1) * Math.max(0.2, Math.abs(p.x)), H, zF), p, 0.045, C.cadre), cyl(0.042, 0.05, p.x, p.y, p.z, C.cadre, 0.5, null, 0.01)); }
        if (pivots.length > 1 && !coude) f.push(tube(pivots[0], pivots[1], 0.045, C.cadre));   // (aux coudes, la traverse passerait dans les bras)
        f.push(tube(V(0, 0.03, zF), V(0, 0.03, zC), 0.05, C.cadre));
        poserObjet(horsCadre(f), V(), null, d.fixe);
        if (!d.levee) d.levee = (i2, u) => 0.26 * Math.max(0, Math.min(1, u));
      }
    }
    // Une tour de poulie : on relève la longueur de câble la plus courte du mouvement, d'où part la pile de poids.
    if (d.fixe.some(x => x.leve) && d.tenu.some(e => e.t === 'cable')) {
      let mini = Infinity;
      for (let i = 0; i <= 8; i++) { const l = materielDe(d, c.poser(poseA(d, 0, i / 8)), i / 8, C, {}).cable; if (l != null && l < mini) mini = l; }
      if (isFinite(mini)) d.cable0 = mini;
    }
    d.appuis = appuisDe(c, d);
    return d;
  }
  /* Les appuis du mouvement : chaque coussin du matériel posé (assise, dossier, banc, pupitre) devient une surface
     contre laquelle la chair s'écrase (voir le programme des sommets du moteur, et Corps.peauPosee pour les mesures).
     La face qui porte est celle contre laquelle il y a de la chair (voir plus bas) ; la profondeur d'effet est
     l'épaisseur du coussin, guère plus : ce qui passe de l'autre côté n'est pas de la chair écrasée, c'est une faute
     de posture, et les contrôles la signalent — et ce qui se trouve légitimement de l'autre côté (les cuisses sous un
     pupitre) n'est pas aspiré dans le coussin. Rend, par appui, les seize nombres que lit le moteur ; six appuis au
     plus, ceux que le corps touche le plus. */
  function appuisDe(c, d) {
    const coussins = d.fixe.filter(f => f.appui && f.forme === 'boite');
    if (!coussins.length) return [];
    const P = coussins.map(f => {
      const q = new Quat(f.q[0], f.q[1], f.q[2], f.q[3]), ctr = V(f.p[0], f.p[1], f.p[2]), axes = [AX, AY, AZ].map(a => a.clone().applyQuaternion(q));
      const iT = f.s[0] <= f.s[1] && f.s[0] <= f.s[2] ? 0 : f.s[1] <= f.s[2] ? 1 : 2, iU = (iT + 1) % 3, iV = (iT + 2) % 3;
      return { f, ctr, T: axes[iT], U: axes[iU], W: axes[iV], ep: f.s[iT], hu: f.s[iU] / 2, hw: f.s[iV] / 2, n: [0, 0] };
    });
    // De quel côté de chaque coussin le corps s'appuie : là où il y a de la chair contre la face (à moins de 4 cm
    // devant elle), à trois moments du mouvement. Ce qui est plus loin ne compte pas : les cuisses sous un pupitre ne
    // s'y appuient pas ; ce qui est dedans non plus : cela ne dit pas par où c'est entré.
    const cycle = d.rythme === 'continu' || d.rythme === 'boucle';
    for (const u of cycle ? [0, 1 / 3, 2 / 3] : [0, 0.5, 1]) {
      c.poser(poseA(d, 0, u));
      if (!c.peauPosee(null, (x, y, z) => {
        for (const p of P) {
          const dx = x - p.ctr.x, dy = y - p.ctr.y, dz = z - p.ctr.z;
          if (Math.abs(dx * p.U.x + dy * p.U.y + dz * p.U.z) > p.hu || Math.abs(dx * p.W.x + dy * p.W.y + dz * p.W.z) > p.hw) continue;
          const h = Math.abs(dx * p.T.x + dy * p.T.y + dz * p.T.z) - p.ep / 2;
          if (h > 0 && h < 0.04) p.n[dx * p.T.x + dy * p.T.y + dz * p.T.z > 0 ? 0 : 1]++;
        }
      })) return [];
    }
    // Un appui par face où le corps porte. Une seule face : l'écrasement prend tout le coussin et 2 cm de plus (le
    // dessous d'une cuisse plonge au bord d'une assise) — il n'y a rien de l'autre côté. Les deux (un coussin pris
    // entre deux chairs) : chacune s'écrase sur sa moitié, sans attirer l'autre.
    const A = [];
    for (const p of P) {
      const faces = [0, 1].filter(k => p.n[k] >= Math.max(12, 0.08 * (p.n[0] + p.n[1])));   // quelques points égarés ne font pas un appui
      for (const k of faces) A.push({ p, sens: k ? -1 : 1, n: p.n[k], prof: faces.length > 1 ? p.ep / 2 : p.ep + 0.02 });
    }
    return A.sort((a, b) => b.n - a.n).slice(0, 6).map(({ p, sens, prof }) => {
      const T = p.T.clone().multiplyScalar(sens), S = p.ctr.clone().add(T.clone().multiplyScalar(p.ep / 2));
      return [p.U.x, p.U.y, p.U.z, -p.U.dot(p.ctr), T.x, T.y, T.z, -T.dot(S), p.W.x, p.W.y, p.W.z, -p.W.dot(p.ctr), p.hu, p.hw, prof, 0.01];
    });
  }
  /* Deux poses clés ne se mélangent que si elles décrivent chaque membre de la même façon. Quand l'une donne des angles
     et l'autre une cible (main posée, pied au sol), celle qui est en angles est convertie : on pose le corps, et on
     note où arrivent la main ou le pied. */
  const enCible = {
    bras: (info, k, b) => ({ prise: info.prises[k].clone(), pole: info.coudes[k].clone().sub(info.epaules[k]), paume: info.paumes[k].clone(), dirMain: info.dirMains[k].clone(), doigts: b.doigts, hausse: b.hausse, avance: b.avance, ceinture: b.ceinture }),
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
  const poseA = (d, t, uFixe) => { const av = avancee(d, t, uFixe), p = poseDe(d, av); return d.degage ? avecDegagement(p, degagementA(d, av)) : p; };
  /* Où va le dessus d'un kettlebell tenu par sa poignée, dans la main k. La boule (10 cm de rayon, son centre à 17 cm
     sous la poignée) tourne librement autour de la poignée : elle pend au plus bas sans entrer dans l'avant-bras qui
     la tient — en haut d'un curl, elle vient s'appuyer contre lui. `dos` : la main est passée dans la poignée (épaulé,
     développé, relevé turc) : dès que la main est plus haute que le coude, la boule repose sur le dos de l'avant-bras. */
  function hautKb(info, k, dos) {
    const axe = unite(info.axes[k].clone()), prise = info.prises[k], coude = info.coudes[k], poignet = info.poignets[k], paume = info.paumes[k];
    let h0 = perp(AY, axe); if (h0.lengthSq() < 0.04) h0 = perp(info.dirMains[k].clone().multiplyScalar(-1), axe);
    h0.normalize();
    const cote = axe.clone().cross(h0), lAvant = coude.distanceTo(poignet) || 1;
    // Le sens h0 tourné de a autour de la poignée ; ce que la boule fait alors : libre de l'avant-bras ? de son côté dos ?
    const essai = a => {
      const h = h0.clone().multiplyScalar(Math.cos(a)).addScaledVector(cote, Math.sin(a)), ctr = prise.clone().addScaledVector(h, -0.172);
      const q = surSegment(coude, poignet, ctr.x, ctr.y, ctr.z), dx = ctr.x - q[0], dy = ctr.y - q[1], dz = ctr.z - q[2];
      const ep = lerp(0.027, 0.046, Math.hypot(q[0] - poignet.x, q[1] - poignet.y, q[2] - poignet.z) / lAvant);
      return { h, libre: Math.hypot(dx, dy, dz) >= 0.1 + ep - 0.003, dos: dx * paume.x + dy * paume.y + dz * paume.z < 0 };
    };
    const surLeDos = dos && poignet.y - coude.y > 0.25 * lAvant;
    for (let i = 0; i <= 90; i++) for (const s of i ? [1, -1] : [1]) { const e = essai(s * i * Math.PI / 90); if (e.libre && (!surLeDos || e.dos)) return e.h; }
    return h0;
  }
  /* Le matériel de l'image : posé, tenu dans les mains, tendu (câbles, élastiques, sangles). */
  function materielDe(d, info, u, C, modeles) {
    const sortie = d.fixe.slice();
    let cable = null;   // longueur du premier câble : la pile de poids de sa tour monte d'autant
    const prise = m => (m === 'GD' || !m ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[m]);
    const cotes = m => (m === 'GD' || !m ? ['G', 'D'] : [m]);
    const point = (v, m) => (v === 'pieds' ? info.orteils.G.clone().add(info.orteils.D).multiplyScalar(0.5).setY(Math.min(info.orteils.G.y, info.orteils.D.y) - 0.02) : v === 'pied' ? info.orteils[m === 'D' ? 'D' : 'G'].clone().add(V(0, -0.02, 0)) : typeof v === 'function' ? v(info, u) : v);
    // Chaque forme du matériel tenu dit ce qu'elle est (tenu : 'haltere', 'barre'…) et quelle main la tient (main : 'G',
    // 'D', ou 'GD' pour un objet à deux mains) : le dégagement (degagerTenu) et les contrôles s'en servent.
    let n0 = sortie.length, eAvant = null;
    const marquer = () => {
      for (let i = n0; i < sortie.length; i++) {
        const f = sortie[i]; f.tenu = eAvant.t;
        const deux = eAvant.entre || eAvant.t === 'barre' || !eAvant.m || eAvant.m === 'GD';
        f.main = !deux ? eAvant.m : (eAvant.t === 'haltere' || eAvant.t === 'kb' || eAvant.t === 'poignee') && !eAvant.entre ? (Math.hypot(f.p[0] - info.prises.G.x, f.p[1] - info.prises.G.y, f.p[2] - info.prises.G.z) <= Math.hypot(f.p[0] - info.prises.D.x, f.p[1] - info.prises.D.y, f.p[2] - info.prises.D.z) ? 'G' : 'D') : 'GD';
      }
      n0 = sortie.length;
    };
    for (const e of d.tenu) {
      if (eAvant) marquer();
      eAvant = e;
      const mod = cle => modeles[cle] || (modeles[cle] = null);
      if (e.t === 'barre') {
        const axe = info.prises.G.clone().sub(info.prises.D);
        const cle = e.ez ? 'ez' : 'barre' + (e.l || '') + (e.d == null ? '' : e.d);
        const f = modeles[cle] || (modeles[cle] = e.ez ? MAT.barreEz(C) : MAT.barre(C, e.l || 1.6, e.d == null ? 0.225 : e.d));
        const pos = e.pos ? point(e.pos) : prise('GD');
        poserObjet(f, e.centre === false ? pos : pos.clone().setX(e.x0 == null ? pos.x : e.x0), e.rot || qTenu(axe.lengthSq() > 1e-6 ? axe : AX, AY), sortie);
      } else if (e.t === 'haltere' || e.t === 'poignee' || e.t === 'kb') {
        const f = modeles[e.t + (e.k || '')] || (modeles[e.t + (e.k || '')] = e.t === 'haltere' ? MAT.haltere(C, e.k || 1) : e.t === 'kb' ? MAT.kettlebell(C) : MAT.poignee(C));
        // Un seul objet tenu à deux mains (entre) : au milieu, dans l'axe des deux mains.
        if (e.entre) { poserObjet(f, prise('GD'), qTenu(info.prises.G.clone().sub(info.prises.D), e.sens === 'renverse' ? info.dirMains.G.clone().add(info.dirMains.D).multiplyScalar(-1) : AY), sortie); continue; }
        // La poignée en travers de la paume ; la boule d'un kettlebell pend, ou repose sur l'avant-bras (hautKb).
        for (const k of cotes(e.m)) poserObjet(f, info.prises[k], qTenu(info.axes[k], e.t === 'kb' ? hautKb(info, k, e.sens === 'avantbras') : AY), sortie);
      } else if (e.t === 'disque' || e.t === 'balle') {
        const f = modeles[e.t + (e.r || '')] || (modeles[e.t + (e.r || '')] = e.t === 'disque' ? MAT.disque(C, e.r || 0.2) : MAT.balle(C, e.r || 0.11));
        const pos = e.pos ? point(e.pos) : prise(e.m);
        // L'axe d'un disque : donné (un vecteur ; 'buste' : plaqué contre la poitrine) ; à une main, la paume ; à deux
        // mains, la ligne des mains (serré entre les paumes) — ou, tenu par le bord (e.bord), le sens des avant-bras :
        // le disque fait face au corps, les mains à 3 h et 9 h ; bras pendants, il se redresse devant les cuisses.
        let axe = e.m && e.m !== 'GD' ? info.paumes[e.m] : info.prises.G.clone().sub(info.prises.D);
        if (e.axe === 'buste') axe = AZ.clone().applyQuaternion(info.qThorax);
        else if (e.axe) axe = e.axe;
        else if (e.bord && axe.lengthSq() > 1e-6) {
          const gd = unite(axe.clone()), dm = unite(info.dirMains.G.clone().add(info.dirMains.D));
          dm.addScaledVector(AZ.clone().applyQuaternion(info.qThorax), Math.max(0, -1.6 * dm.y));
          dm.addScaledVector(gd, -dm.dot(gd)); if (dm.lengthSq() > 1e-6) axe = dm;
        }
        poserObjet(f, pos, e.t === 'disque' ? qTenu(axe.lengthSq() > 1e-6 ? axe : AX, AY) : null, sortie);
      } else if (e.t === 'cable' || e.t === 'elastique' || e.t === 'sangle' || e.t === 'levier') {
        const r = e.t === 'cable' ? 0.0045 : e.t === 'elastique' ? 0.007 : e.t === 'sangle' ? 0.009 : 0.017;
        const teinte = e.t === 'cable' ? C.cable : e.t === 'elastique' ? C.elastique : e.t === 'sangle' ? C.sangle : C.cadre;
        const metal = e.t === 'cable' || e.t === 'levier' ? 0.6 : 0;
        const bouts = e.vers ? [point(e.vers, e.m)] : e.bout === 'barre' || e.bout === 'corde' ? [prise('GD')] : cotes(e.m).map(k => info.prises[k]);
        const departs = Array.isArray(e.de) ? e.de : [e.de];
        bouts.forEach((b, n) => {
          const de = point(departs[Math.min(n, departs.length - 1)], cotes(e.m)[n]);
          if (e.t === 'cable' && cable == null) cable = de.distanceTo(b);
          if (e.bout === 'corde') {
            // La corde : le câble s'arrête avant les mains, deux brins vont à chacune.
            const noeud = b.clone().add(unite(de.clone().sub(b)).multiplyScalar(0.12));
            sortie.push(pret(seg(de, noeud, r, teinte, metal)));
            sortie.push(pret(Object.assign(sphere(0.016, 0, 0, 0, C.metal, 0.8), { p: noeud })));
            for (const k of ['G', 'D']) {
              // Chaque brin dépasse un peu la main et finit par une boule de gomme.
              const brin = unite(info.prises[k].clone().sub(noeud)), bout = info.prises[k].clone().add(brin.clone().multiplyScalar(0.07));
              sortie.push(pret(seg(noeud, bout, 0.011, C.sangle, 0, 0.011)));
              sortie.push(pret(Object.assign(sphere(0.021, 0, 0, 0, C.gomme, 0), { p: bout })));
            }
          } else if (e.bout === 'anneau') {
            // L'anneau pend au bout de la sangle ; la main le tient par le bas.
            const k = cotes(e.m)[n], dir = unite(de.clone().sub(b)), centre = b.clone().add(dir.clone().multiplyScalar(0.088));
            sortie.push(pret(seg(de, centre.clone().add(dir.clone().multiplyScalar(0.1)), r, teinte, metal)));
            poserObjet(modeles.anneau || (modeles.anneau = [tore(0.1, 0, 0, 0, C.bois, 0, null, 0.014)]), centre, qTenu(info.axes[k], dir), sortie);
          } else if (e.t === 'cable' && e.bout === 'poignee') {
            // Poignée de câble : le câble s'arrête à un mousqueton, deux brins d'étrier rejoignent les bouts du manchon.
            const k = cotes(e.m)[n], dir = unite(de.clone().sub(b)), attache = b.clone().add(dir.clone().multiplyScalar(0.1));
            sortie.push(pret(seg(de, attache, r, teinte, metal)));
            for (const s of [1, -1]) sortie.push(pret(seg(attache, b.clone().add(info.axes[k].clone().multiplyScalar(s * 0.07)), 0.0045, C.metal, 0.8, 0.0045)));
          } else if (e.t === 'levier') sortie.push(pret(tube(de, b, 0.034, C.cadre)));
          else sortie.push(pret(seg(de, b, r, teinte, metal)));
        });
        if (e.bout === 'barre') {
          const f = modeles['barrette' + (e.l || '')] || (modeles['barrette' + (e.l || '')] = MAT.barrette(C, e.l || 0.9));
          const axe = info.prises.G.clone().sub(info.prises.D);
          poserObjet(f, prise('GD'), qTenu(axe.lengthSq() > 1e-6 ? axe : AX, AY), sortie);
        } else if (e.bout === 'poignee' || (e.t === 'levier' && e.bout !== 'rien')) {
          const f = modeles.poignee || (modeles.poignee = MAT.poignee(C));
          for (const k of cotes(e.m)) poserObjet(f, info.prises[k], qTenu(info.axes[k], AY), sortie);
        }
      }
    }
    if (eAvant) marquer();
    if (d.objets) d.objets(info, u, sortie);
    // Les plaques levées de la pile suivent le câble (d.cable0 : sa longueur la plus courte pendant le mouvement).
    sortie.cable = cable;
    if (d.levee || (cable != null && d.cable0 != null)) {
      // (une machine sans câble apparent dit elle-même de combien sa pile monte : d.levee)
      const dy = borne(d.levee ? d.levee(info, u) : cable - d.cable0, 0, 1.2);
      if (dy > 0.001) for (let i = 0; i < d.fixe.length; i++) if (sortie[i].leve) { const o = sortie[i]; sortie[i] = Object.assign({}, o, { p: [o.p[0], o.p[1] + dy, o.p[2]] }); }
    }
    return sortie;
  }
  const pret = f => { const o = { forme: f.forme, s: f.s, q: [f.q.x, f.q.y, f.q.z, f.q.w], p: [f.p.x, f.p.y, f.p.z], couleur: f.couleur, metal: f.metal }; if (f.r) o.r = f.r; if (f.leve) o.leve = f.leve; if (f.hors) o.hors = 1; if (f.appui) o.appui = 1; return o; };
  /* Matériel posé : des formes dans leur repère, placées une fois pour toutes. */
  const poseFixe = (formes, pos, rot) => poserObjet(formes, pos || V(), rot || null, []);
  /* ---------- Le matériel tenu ne traverse pas celui qui le tient ----------
     Un haltère qui pend le long de la cuisse, une barre contre le ventre, un disque devant le bassin : les familles les
     placent par angles, et le corps a pris de la carrure depuis — la fonte entrait dans la chair. Au lieu de retoucher
     chaque famille, le mouvement est vérifié une fois à sa définition : à quelques instants de sa course, on pose le
     corps et son matériel, et l'on cherche les points de la surface du corps (hors le bras qui tient) à l'intérieur des
     formes tenues. S'il y en a, la main qui tient est déplacée — du plus court chemin qui sort la fonte de la chair
     (les deux mains ensemble pour un objet à deux mains). Ces déplacements (b.dg : voir Corps.bras) sont gardés en
     table (d.degage) et ajoutés à la pose à chaque image, mélangés d'un instant au suivant.
     Ce qui se touche de près reste admis (TOL_TENU) : la barre posée sur les cuisses, le disque contre la poitrine. */
  const TENUS = /^(haltere|kb|barre|disque|balle|poignee)$/, TOL_TENU = 0.006, DEGAGE_MAX = 0.16;
  const REG_CORPS = ['tete', 'cou', 'thorax', 'dos', 'abdomen', 'bassin', 'cuisse', 'jambe', 'pied'], REG_BRAS = ['epaule', 'bras', 'avant_bras'];
  /* Distance signée d'un point à une forme prête (p, q en tableaux) : négative dedans. */
  function distanceForme(f, x, y, z) {
    const vx = x - f.p[0], vy = y - f.p[1], vz = z - f.p[2], qx = -f.q[0], qy = -f.q[1], qz = -f.q[2], qw = f.q[3], s = f.s;
    const tx = qy * vz - qz * vy + qw * vx, ty = qz * vx - qx * vz + qw * vy, tz = qx * vy - qy * vx + qw * vz;
    const lx = vx + 2 * (qy * tz - qz * ty), ly = vy + 2 * (qz * tx - qx * tz), lz = vz + 2 * (qx * ty - qy * tx);
    if (f.forme === 'boite') { const ax = Math.abs(lx) - s[0] / 2, ay = Math.abs(ly) - s[1] / 2, az = Math.abs(lz) - s[2] / 2; return Math.hypot(Math.max(ax, 0), Math.max(ay, 0), Math.max(az, 0)) + Math.min(Math.max(ax, ay, az), 0); }
    if (f.forme === 'cylindre' || f.forme === 'hexa') { const dr = Math.hypot(lx, lz) - s[0] * (f.forme === 'hexa' ? 0.93 : 1), dy = Math.abs(ly) - s[1] / 2; return Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) + Math.min(Math.max(dr, dy), 0); }
    if (f.forme === 'sphere') return Math.hypot(lx, ly, lz) - s[0];
    if (f.forme === 'tore' || ly >= 0) return Math.hypot(Math.hypot(lx, ly) - s[0], lz) - (f.r || 0);
    return Math.min(Math.hypot(lx - s[0], ly, lz), Math.hypot(lx + s[0], ly, lz)) - (f.r || 0);
  }
  const rayonForme = f => (f.forme === 'boite' ? Math.hypot(f.s[0], f.s[1], f.s[2]) / 2 : f.forme === 'cylindre' || f.forme === 'hexa' ? Math.hypot(f.s[0], f.s[1] / 2) : f.forme === 'sphere' ? f.s[0] : f.s[0] + (f.r || 0));
  const avecDegagement = (p, g) => (g ? Object.assign({}, p, { bras: { G: g.G ? Object.assign({}, p.bras.G, { dg: g.G }) : p.bras.G, D: g.D ? Object.assign({}, p.bras.D, { dg: g.D }) : p.bras.D } }) : p);
  /* Les déplacements à un instant : lus dans la table, mélangés entre deux instants voisins. */
  function degagementA(d, av) {
    const lire = (t, u) => {
      if (!t) return null;
      const n = t.length;
      let i, j, k;
      if (d.degageCycle) { const x = (((u % 1) + 1) % 1) * n; i = Math.floor(x) % n; j = (i + 1) % n; k = x - Math.floor(x); }
      else { const x = Math.min(1, Math.max(0, u)) * (n - 1); i = Math.min(n - 2, Math.floor(x)); j = i + 1; k = x - i; }
      return t[i].clone().lerp(t[j], k);
    };
    return { G: lire(d.degage.G, av.uG != null ? av.uG : av.u), D: lire(d.degage.D, av.uD != null ? av.uD : av.u) };
  }
  function degagerTenu(c, d, C) {
    if (!c.sourcePeau || !d.tenu.some(e => TENUS.test(e.t))) return;
    const cycle = d.rythme === 'continu' || d.rythme === 'boucle';
    const instants = []; for (let i = 0, n = cycle ? 16 : 8; i < (cycle ? n : n + 1); i++) instants.push(i / n);
    const table = { G: [], D: [] }, utile = { G: false, D: false }, modeles = {};
    for (const u of instants) {
      const g = degagerInstant(c, d, C, d.rythme === 'alt' ? { uG: u, uD: 0, u } : { u }, u, modeles);
      for (const k of ['G', 'D']) { table[k].push(g[k]); if (g[k].lengthSq() > 1e-8) utile[k] = true; }
    }
    if (d.rythme === 'alt') { table.D = table.G.map(v => V(-v.x, v.y, v.z)); utile.D = utile.G; }   // le côté droit refait, en miroir, la course du gauche
    if (!utile.G && !utile.D) return;
    if (cycle) {
      // En boucle, une main qui ne bouge presque pas (la charge portée en marchant) garde le même dégagement tout le
      // tour — le plus grand : sinon la charge irait et viendrait à chaque passage de la cuisse.
      const lieux = instants.map(u => { const i = c.poser(poseDe(d, { u })); return { G: i.prises.G.clone(), D: i.prises.D.clone() }; });
      for (const k of ['G', 'D']) {
        if (!utile[k]) continue;
        let course = 0; for (const a of lieux) for (const b of lieux) course = Math.max(course, a[k].distanceTo(b[k]));
        if (course < 0.08) { let m = table[k][0]; for (const v of table[k]) if (v.lengthSq() > m.lengthSq()) m = v; table[k] = table[k].map(() => m.clone()); }
      }
    }
    d.degage = { G: utile.G ? table.G : null, D: utile.D ? table.D : null }; d.degageCycle = cycle;
  }
  /* Distance entre deux segments [a, b] et [c2, d2]. */
  function entreSegments(a, b, c2, d2) {
    const u = b.clone().sub(a), v = d2.clone().sub(c2), w = a.clone().sub(c2), A = u.dot(u), B = u.dot(v), Cc = v.dot(v), D = u.dot(w), E = v.dot(w), den = A * Cc - B * B;
    let sN, sD = den, tN, tD = den;
    if (den < 1e-10) { sN = 0; sD = 1; tN = E; tD = Cc; } else { sN = B * E - Cc * D; tN = A * E - B * D; if (sN < 0) { sN = 0; tN = E; tD = Cc; } else if (sN > sD) { sN = sD; tN = E + B; tD = Cc; } }
    if (tN < 0) { tN = 0; if (-D < 0) sN = 0; else if (-D > A) sN = sD; else { sN = -D; sD = A; } }
    else if (tN > tD) { tN = tD; if (-D + B < 0) sN = 0; else if (-D + B > A) sN = sD; else { sN = -D + B; sD = A; } }
    const sc = Math.abs(sN) < 1e-10 ? 0 : sN / (sD || 1), tc = Math.abs(tN) < 1e-10 ? 0 : tN / (tD || 1);
    return w.add(u.multiplyScalar(sc)).sub(v.multiplyScalar(tc)).length();
  }
  /* Le point de [a, b] le plus proche de (x, y, z). */
  function surSegment(a, b, x, y, z) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, l2 = ux * ux + uy * uy + uz * uz;
    const k = l2 > 1e-12 ? Math.min(1, Math.max(0, ((x - a.x) * ux + (y - a.y) * uy + (z - a.z) * uz) / l2)) : 0;
    return [a.x + ux * k, a.y + uy * k, a.z + uz * k];
  }
  /* Des points à la surface d'une forme prête (dans le monde) : pour savoir si elle entre dans un coussin. */
  function pointsDeForme(f) {
    const q = new Quat(f.q[0], f.q[1], f.q[2], f.q[3]), P = [], s = f.s;
    const m = (x, y, z) => { const v = V(x, y, z).applyQuaternion(q); P.push(v.x + f.p[0], v.y + f.p[1], v.z + f.p[2]); };
    if (f.forme === 'cylindre' || f.forme === 'hexa') {
      const n = Math.max(2, Math.ceil(s[1] / 0.07));
      for (let i = 0; i <= n; i++) { const y = -s[1] / 2 + s[1] * i / n; m(0, y, 0); for (let k = 0; k < 6; k++) m(s[0] * Math.cos(k * Math.PI / 3), y, s[0] * Math.sin(k * Math.PI / 3)); }
    } else if (f.forme === 'sphere') { m(0, 0, 0); for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c2 of [-1, 0, 1]) if (a || b || c2) { const l = s[0] / Math.hypot(a, b, c2); m(a * l, b * l, c2 * l); } }
    else if (f.forme === 'boite') { for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c2 of [-1, 0, 1]) m(a * s[0] / 2, b * s[1] / 2, c2 * s[2] / 2); }
    else for (let k = 0; k < 8; k++) { const a = k * Math.PI / (f.forme === 'tore' ? 4 : 7); m(s[0] * Math.cos(a), s[0] * Math.sin(a), 0); }
    return P;
  }
  /* De combien déplacer chaque main, à un instant, pour que ce qu'elle tient n'entre ni dans le corps ni dans un coussin. */
  function degagerInstant(c, d, C, av, u, modeles) {
    const g = { G: V(), D: V() };
    for (let passe = 0; passe < 3; passe++) {
      const info = c.poser(avecDegagement(poseDe(d, av), g));
      const tout = materielDe(d, info, u, C, modeles), tenus = tout.slice(d.fixe.length).filter(f => f.tenu && TENUS.test(f.tenu));
      if (!tenus.length) break;
      // Les coussins du matériel posé (bancs, sièges, pupitres) : la fonte n'y entre pas non plus.
      const coussins = tout.slice(0, d.fixe.length).filter(f => f.appui && f.forme === 'boite');
      // Le corps en gros : par groupe de régions, les os (segments) et l'épaisseur de chair autour. Sert à savoir quelles
      // régions lire quand une forme s'approche, et de quel côté de l'os se trouve la main.
      const H = info.hanches, Ge = info.genoux, Ch = info.chevilles, Or = info.orteils;
      const groupes = [
        { regs: ['tete', 'cou'], segs: [[info.tete, info.tete.clone().add(V(0, 0.09, 0).applyQuaternion(info.qThorax)), 0.12]] },
        { regs: ['thorax', 'dos', 'abdomen'], segs: [[info.bassin, info.cou, 0.2]] },
        { regs: ['bassin'], segs: [[H.G, H.D, 0.16]] },
        { regs: ['cuisse'], segs: [[H.G, Ge.G, 0.125], [H.D, Ge.D, 0.125]] },
        { regs: ['jambe'], segs: [[Ge.G, Ch.G, 0.085], [Ge.D, Ch.D, 0.085]] },
        { regs: ['pied'], segs: [[Ch.G, Or.G || Ch.G, 0.07], [Ch.D, Or.D || Ch.D, 0.07]] },
      ];
      let change = false;
      for (const main of ['G', 'D', 'GD']) {
        const autre = main === 'GD' ? null : main === 'G' ? 'D' : 'G', F = [], Fc = [], pres = groupes.map(() => false);
        const brasAutre = autre ? [[info.epaules[autre], info.coudes[autre], 0.085], [info.coudes[autre], info.poignets[autre], 0.075]] : null;
        // Le repère de ce qui est tenu : la main (le milieu des deux mains pour un objet à deux mains).
        const ref = main === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[main].clone();
        let bras = false;
        for (const f of tenus) {
          if (f.main !== main) continue;
          // L'axe de la forme (un cylindre : d'un bout à l'autre ; le reste : son centre) et son rayon.
          const ctr = V(f.p[0], f.p[1], f.p[2]), long = f.forme === 'cylindre' || f.forme === 'hexa';
          const axe = long ? AY.clone().applyQuaternion(new Quat(f.q[0], f.q[1], f.q[2], f.q[3])).multiplyScalar(f.s[1] / 2) : V(), a = ctr.clone().sub(axe), b = ctr.clone().add(axe), r = long ? f.s[0] : rayonForme(f);
          let touche = false;
          groupes.forEach((gr, n) => { for (const [p1, p2, ep] of gr.segs) if (entreSegments(a, b, p1, p2) < r + ep + 0.02) { touche = true; pres[n] = true; } });
          if (brasAutre) for (const [p1, p2, ep] of brasAutre) if (entreSegments(a, b, p1, p2) < r + ep) { touche = true; bras = true; }
          if (touche) F.push(f);
          const rf = rayonForme(f);
          if (coussins.some(k => Math.hypot(k.p[0] - f.p[0], k.p[1] - f.p[1], k.p[2] - f.p[2]) < rf + rayonForme(k))) Fc.push(f);
        }
        // Les points du corps de ces groupes (et ceux de l'autre bras, pas de celui qui tient) à moins de 4 cm d'une
        // forme (chaque forme a sa boule : un point qui en est loin n'est pas mesuré), avec le numéro de leur os.
        const boules = F.map(f => { const r = rayonForme(f) + 0.04; return [f.p[0], f.p[1], f.p[2], r * r]; });
        const P = [], os = [];
        let segs = null, os0 = 0;
        const garder = (x, y, z) => {
          for (let n = 0; n < F.length; n++) {
            const bo = boules[n], dx = x - bo[0], dy = y - bo[1], dz = z - bo[2];
            if (dx * dx + dy * dy + dz * dz < bo[3] && distanceForme(F[n], x, y, z) < 0.04) {
              let m = Infinity, mk = 0;
              for (let k = 0; k < segs.length; k++) { const q = surSegment(segs[k][0], segs[k][1], x, y, z), l = Math.hypot(x - q[0], y - q[1], z - q[2]); if (l < m) { m = l; mk = k; } }
              P.push(x, y, z, os0 + mk);
              return;
            }
          }
        };
        if (F.length) {
          groupes.forEach((gr, n) => { if (pres[n]) { segs = gr.segs; os0 = os.length; os.push(...segs); c.peauPosee(gr.regs, garder); } });
          if (bras) { segs = brasAutre; os0 = os.length; os.push(...segs); let n = 0; c.peauPosee(REG_BRAS, () => { n++; }); let i = 0; const moitie = n / 2; c.peauPosee(REG_BRAS, (x, y, z) => { if ((i++ < moitie) === (autre === 'G')) garder(x, y, z); }); }
        }
        // Les points des formes tenues qui peuvent toucher un coussin.
        const Q = []; for (const f of Fc) Q.push(...pointsDeForme(f));
        if (!P.length && !Q.length) continue;
        // On pousse ce qui est tenu hors de la chair et des coussins, pas à pas. Chaque os dont la chair est dans une
        // forme pousse la main du côté où elle se trouve déjà (en l'éloignant de l'os), d'autant plus fort que la chair
        // est entrée ; chaque coussin pousse par sa face la plus proche de la main. On suit la somme, du pire écart.
        // Prise entre deux chairs (un objet entre les cuisses), la forme ne doit entrer dans aucune : on retire du sens
        // suivi ce qui va contre l'une d'elles ; s'il n'en reste rien, on part vers l'avant du buste.
        const T = V(), devant = AZ.clone().applyQuaternion(info.qThorax), W = new Array(os.length + coussins.length), R = [], h = 0.002;
        for (let tour = 0; tour < 12; tour++) {
          W.fill(0); let pire = 0, poids = 0;
          for (let i = 0; i < P.length; i += 4) {
            const x = P[i] - T.x, y = P[i + 1] - T.y, z = P[i + 2] - T.z;
            let e = 0;
            for (const f of F) { const ef = -distanceForme(f, x, y, z) - TOL_TENU; if (ef > e) e = ef; }
            if (e <= 0) continue;
            W[P[i + 3]] += e; poids += e; if (e > pire) pire = e;
          }
          coussins.forEach((k, n) => { for (let i = 0; i < Q.length; i += 3) { const e = -distanceForme(k, Q[i] + T.x, Q[i + 1] + T.y, Q[i + 2] + T.z) - TOL_TENU; if (e > 0) { W[os.length + n] += e; poids += e; if (e > pire) pire = e; } } });
          if (pire <= 0) break;
          // Le sens de chaque obstacle : de l'os vers la main ; du coussin vers la main (par sa face la plus proche).
          const mx = ref.x + T.x, my = ref.y + T.y, mz = ref.z + T.z, dir = V();
          R.length = 0;
          for (let k = 0; k < W.length; k++) {
            if (!W[k]) { R.push(null); continue; }
            let v;
            if (k < os.length) { const q = surSegment(os[k][0], os[k][1], mx, my, mz); v = V(mx - q[0], my - q[1], mz - q[2]); if (v.length() < 0.02) v = null; }
            else { const f = coussins[k - os.length], s0 = distanceForme(f, mx, my, mz); v = V(distanceForme(f, mx + h, my, mz) - s0, distanceForme(f, mx, my + h, mz) - s0, distanceForme(f, mx, my, mz + h) - s0); if (v.length() < 1e-9) v = null; }
            R.push(v ? v.normalize() : null);
            if (v) dir.addScaledVector(v, W[k]);
          }
          if (dir.length() > 0.2 * poids) dir.normalize(); else dir.copy(devant);
          for (let n = 0; n < 2; n++) for (let k = 0; k < W.length; k++) { const v = R[k]; if (v && W[k] > 0.05 * poids && v.dot(dir) < 0) { dir.addScaledVector(v, -v.dot(dir)); if (dir.length() > 0.2) dir.normalize(); else { dir.copy(devant).addScaledVector(v, -v.dot(devant)); if (dir.length() > 1e-3) dir.normalize(); else dir.copy(devant); } } }
          T.addScaledVector(dir, pire + 0.001);
          if (T.y < 0) { let bas = Infinity; for (const f of F.concat(Fc)) bas = Math.min(bas, f.p[1] - rayonForme(f)); if (bas + T.y < 0) T.y = Math.min(0, -bas); }   // pas sous le sol
          if (T.length() > DEGAGE_MAX) { T.multiplyScalar(DEGAGE_MAX / T.length()); break; }
        }
        if (T.lengthSq() < 1e-8) continue;
        for (const k of main === 'GD' ? ['G', 'D'] : [main]) g[k].add(T);
        change = true;
      }
      if (!change) break;
    }
    // Un grand déplacement n'est plus un ajustement : la posture elle-même est à revoir (le crible le dira) ; on ne
    // touche alors à rien, plutôt que d'emmener la charge loin de sa place.
    for (const k of ['G', 'D']) if (g[k].length() > DEGAGE_MAX) g[k].set(0, 0, 0);
    return g;
  }

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
      p = aPlatVentre(c, { h: 0.44, angle: a, d: 0.08 }); fixe = poseFixe(MAT.banc(C, a, 0.44, 0.68, 0), V(), qY(180)); vue = { az: 52, el: 12 }; sorte = 'ventre';
    } else if (o.assis) { p = allonge(c, { h: 0.44, angle: 84, lomb: 0, thor: 0, cou: 0 }); fixe = poseFixe(MAT.banc(C, 84)); sorte = 'assis'; vue = { az: 38, el: 10 }; }
    else if (o.tabouret) { p = assis(c, { h: H_BANC, penche: o.penche === true ? 0 : (o.penche || 0) }); fixe = bancAssis(C); sorte = 'assis'; vue = { az: 38, el: 10 }; }
    else if (o.genoux) { p = aGenoux(c, { penche: defauts.penche || 0 }); sorte = 'genoux'; }
    else if (o.demigenou) { p = demiGenou(c, { penche: defauts.penche || 0 }); sorte = 'genoux'; }
    else if (o.penche) {
      const a = o.penche === true ? (defauts.penche || 60) : o.penche;
      p = debout(c, { dy: -0.05 - a * 0.0012, dz: -0.06 - a * 0.0026, penche: a, lomb: 3, thor: 4, cou: -a * 0.55, ecart: 0.14, ouv: 10 }); vue = { az: 122, el: 10 }; sorte = 'penche';
    } else p = debout(c, { ecart: defauts.ecart == null ? 0.14 : defauts.ecart, ouv: 12, penche: defauts.penche || 0, dy: defauts.dy || 0, dz: defauts.dz || 0 });
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
    else if (o.ez) t.push({ t: 'barre', ez: true });
    else if (o.hal) t.push({ t: 'haltere', m });
    else if (o.kb) t.push({ t: 'kb', m, sens: r.sensKb });
    else if (o.disque) t.push({ t: 'disque', m: 'GD', bord: true, r: r.rDisque });
    else if (o.balle) t.push({ t: 'balle', m: 'GD' });
    else if (o.poulie) {
      if (r.bout === 'barre' || r.bout === 'corde') t.push({ t: 'cable', de: pt(r.ancre, 'G'), bout: r.bout, l: r.lCable });
      else for (const k of cotes) t.push({ t: 'cable', de: pt(r.ancre, k), m: k, bout: 'poignee' });
    } else if (o.elas) for (const k of cotes) t.push({ t: 'elastique', de: r.deElas ? pt(r.deElas, k) : 'pieds', m: k, bout: 'poignee' });
    else if (o.machine && r.pivot) for (const k of cotes) t.push({ t: 'levier', de: pt(r.pivot, k), m: k, bati: r.bati });
    else if (o.sangles && r.ancre) for (const k of cotes) t.push({ t: 'sangle', de: pt(r.ancre, k), m: k, bout: 'poignee' });
    return t;
  }
  /* Le pupitre réglé sous les bras, pour la posture p et les bras donnés : son coussin est parallèle au haut des bras
     et sa face touche le dessous des bras (les triceps s'y posent, enfoncés d'un centimètre) ; son bord bas est à
     5 cm au-delà du coude, là où l'avant-bras le quitte ; son bord haut monte vers l'aisselle (19 cm au-dessus du
     coude au plus) tant que son coin arrière ne rentre pas dans la poitrine (de plus de 8 mm). Le dessous du bras se
     mesure de 3 à 14 cm au-dessus du coude : plus haut, le long triceps rejoint l'aisselle et descend bien plus bas
     que le bras. Rend les formes du pupitre ; .coude : la place du coude gauche (le pivot d'une machine). */
  function pupitreSous(c, p, bras, C) {
    const q = cloner(p); q.bras = pareil(bras);
    const i = c.poser(q), e = i.epaules.G, k = i.coudes.G, al = Math.atan2(e.y - k.y, k.z - e.z);
    const n = V(0, Math.cos(al), Math.sin(al)), td = V(0, -Math.sin(al), Math.cos(al));
    // Le dessous du bras se mesure sur les seize centimètres au-dessus du coude (plus haut, c'est l'aisselle).
    const sK = td.dot(k); let m = Infinity;
    c.peauPosee(['bras'], (x, y, z) => { const s = y * td.y + z * td.z; if (s < sK - 0.14 || s > sK - 0.03) return; const h = y * n.y + z * n.z; if (h < m) m = h; });
    const ep = 0.06, h0 = m + ENFONCE - ep, bas = sK + 0.05, larg = 0.25;
    // Le tronc devant le coussin : pour chaque point (dans la largeur du coussin), sa place le long du bras et sous sa face.
    const T = []; c.peauPosee(['thorax', 'abdomen', 'dos', 'epaule'], (x, y, z) => { if (Math.abs(x) > larg) return; const h = y * n.y + z * n.z; if (h < h0 + ep && h > h0 - 0.02) T.push(y * td.y + z * td.z, h); });
    let haut = 0.19;
    for (; haut > 0.1; haut -= 0.01) { let dedans = 0; for (let i = 0; i < T.length; i += 2) if (T[i] > sK - haut && T[i] < bas && T[i + 1] > h0) dedans = Math.max(dedans, Math.min(T[i + 1] - h0, h0 + ep - T[i + 1])); if (dedans <= 0.008) break; }
    const L = bas - (sK - haut), ctr = n.clone().multiplyScalar(h0 + ep / 2).add(td.clone().multiplyScalar((bas + sK - haut) / 2));
    const f = MAT.pupitre(C, ctr.y, ctr.z, al * 180 / Math.PI, L, ep);
    f.coude = k.clone();
    return f;
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
      // Assis derrière le pupitre, le haut des bras posé sur le coussin incliné (à 45° environ : le buste penche de
      // 20°, les bras sont levés de 68° par rapport à lui, les épaules avancées au-dessus du coussin). Machine : le
      // levier tourne autour du coude, son bâti est devant le pupitre.
      p = assis(c, { h: H_SIEGE, penche: 14, zPieds: 0.3 }); p.thorax = 6; p.cou = -8;
      a = B(8, 68, 0, 22, pron, { avance: 12 }); b = B(8, 68, 0, 128, pron, { avance: 12 });
      const t = c.tronc(p), ep = t.epaules.G, pup = pupitreSous(c, p, a, C), k0 = pup.coude;
      fixe = poseFixe(MAT.siege(C, H_SIEGE)).concat(poseFixe(pup));
      ancre = V(0, 0.15, ep.z + 0.75); vue = { az: 52, el: 12 };
      r.pivot = s => V(s * (Math.abs(k0.x) + 0.09), k0.y, k0.z); r.bati = 'devant';
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
      // (Le haut des bras à 45° environ, comme au pupitre ; le levier tourne autour du coude, son bâti est devant.)
      p = assis(c, { h: H_SIEGE, penche: 10, zPieds: 0.3 }); p.thorax = 4;
      a = B(4, 60, 0, 122, 90, { avance: 12 }); b = B(4, 60, 0, 10, 90, { avance: 12 });
      const pup = pupitreSous(c, p, a, C), k0 = pup.coude;
      fixe = poseFixe(MAT.siege(C, H_SIEGE, 0.5, 4)).concat(poseFixe(pup));
      r.pivot = s => V(s * (Math.abs(k0.x) + 0.09), k0.y, k0.z); r.bati = 'devant'; vue = { az: 55, el: 10 };
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
      pose(); const pr = o.marteau || o.disque ? 90 : 180, plan = o.disque ? 3 : 2;
      a = B(plan, 10, 0, 10, pr); b = B(plan, o.haut ? 165 : 94, 0, 10, pr);
      ancre = V(0, 0.1, -0.7); r.bout = m === 'GD' && o.poulie ? (o.corde ? 'corde' : 'barre') : null;
      if (o.volant) plus.pose = true;
      if (P.sorte === 'ventre') { const ang = o.ventre === true ? 45 : o.ventre; a = B(2, ang * 0.95, 0, 10, pr); b = B(2, 165, 0, 10, pr); }
    } else if (o.arriere) {
      // Oiseau : buste penché (ou à plat ventre sur banc incliné), les bras s'ouvrent ; debout aux poulies croisées.
      if (o.poulie && !o.penche && !o.tabouret && o.ventre == null) {
        pose(); a = B(-18, 86, -70, 14, 90); b = B(108, 88, 10, 14, 90); ancre = s => V(-s * 0.75, 1.5, 0.85); vue = { az: 150, el: 10 };
      } else if (o.machine) {
        // Butterfly inversé : assis face au dossier, bras tendus devant qui s'ouvrent.
        p = assis(c, { h: H_SIEGE, zPieds: 0.3 }); const t = c.tronc(p);
        fixe = poseFixe(MAT.siege(C, H_SIEGE)).concat([pret(boite(0.3, 0.5, 0.06, 0, t.epaules.G.y - 0.2, t.epaules.G.z + 0.19, C.banc, 0))]);
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
      pose(); a = B(o.disque ? 3 : -3, 92, o.disque ? 0 : -18, 8, 90); b = B(o.disque ? 3 : -3, 94, o.disque ? 0 : -18, 8, 90); plus.rythme = 'tenue';
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
    // Un disque se tient par le bord : son rayon est le demi-écart des mains (elles restent à la largeur des épaules).
    if (o.disque) { const i0 = c.poser(parLesBras(p, a, b, m, autre).b); r.rDisque = borne(i0.prises.G.distanceTo(i0.prises.D) / 2 + 0.012, 0.13, 0.21); }
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
    if (plus.halo) { d.rythme = 'continu'; d.periode = 3.2; const A = d.a; d.tenu = [{ t: 'kb', m: 'GD', entre: true, sens: 'renverse' }]; d.pose = ph => { const q = cloner(A), w = ph * 2 * Math.PI; q.bras.G = B(20 + 60 * Math.sin(w), 118 + 30 * Math.sin(w + 1.2), -20, 118, 90); q.bras.D = B(20 - 60 * Math.sin(w), 118 + 30 * Math.sin(w + 1.2), -20, 118, 90); return q; }; }
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
      if (P.sorte === 'dos') {
        // Couché : les bras tendus sont à la verticale (quelle que soit l'inclinaison du banc), au-dessus des épaules ;
        // la charge descend au bas des pectoraux sur un banc plat ou décliné, vers le haut de la poitrine sur un banc
        // incliné. La barre s'arrête contre la poitrine ; les haltères descendent à côté d'elle ; par terre, ce sont
        // les bras qui s'arrêtent au sol.
        const A = o.sol ? 0 : (o.plat ? 0 : o.decline ? -18 : o.banc === true ? 45 : +o.banc || 0), an = rad(A);
        const yBas = (A > 0 ? lerp(-0.19, -0.08, borne(A / 40, 0, 1)) : A < 0 ? -0.22 : -0.19) + (libre ? 0.04 : 0);
        const zBas = o.sol ? 0.25 : o.partiel ? 0.24 : libre ? 0.12 : 0.166;
        bas = s => V(s * eBas, yBas, zBas);
        hautP = s => V(s * eHaut, -0.03 + portee * Math.sin(an) * 0.94, portee * (1 - 0.06 * Math.abs(Math.sin(an))) * Math.cos(an) + portee * (1 - Math.cos(an)) * 0.0);
      } else {
        const zBas = o.partiel ? 0.2 : 0.135;
        bas = s => V(s * eBas, -0.115, zBas + (libre ? 0.02 : 0));
        hautP = s => V(s * eHaut, -0.02, portee);
      }
      pole = s => (o.serre ? V(s * 0.3, -0.6, -1) : V(s * 0.75, -0.5, -1));
      dirMain = V(0, 0, 1); paumeA = paumeB = s => (o.neutre || o.marteau ? V(-s, 0, 0) : V(0, -1, 0));
      // Assis à la machine, la poussée peut monter (incline) ou descendre (decline).
      if (montee) { const an = rad(montee); bas = s => V(s * eBas, montee > 0 ? -0.06 : -0.17, 0.155); hautP = s => V(s * eHaut, (montee > 0 ? -0.02 : -0.06) + portee * Math.sin(an) * 0.96, portee * Math.cos(an)); }
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
    /* Au-dessus de la tête : le geste réel, repris point par point.
       À la barre :
       - en bas, la barre repose en haut de la poitrine, à hauteur des clavicules (ou sur les trapèzes, derrière la
         nuque), les mains juste en dehors des épaules, les poignets cassés sous la barre, les avant-bras verticaux ;
       - elle ne monte pas en ligne droite jusqu'au bout des bras — elle traverserait le visage : le menton se rentre,
         le buste s'efface un peu (debout, barre libre), la barre passe devant le visage (ou derrière le crâne) ;
       - la tête passée, le corps revient dessous : en haut la barre est à l'aplomb des épaules, la tête entre les bras.
       Mains libres (haltères, kettlebell, poignées de machine, élastique) : en bas les mains à hauteur d'oreille, de
       part et d'autre de la tête, les coudes dessous ; elles montent en se rapprochant, jusqu'à l'aplomb des épaules.
       Dans tous les cas : les coudes restent le plus bas possible sous la charge (avant-bras au plus près de la
       verticale) puis s'ouvrent ; en haut les bras sont tendus ; l'épaule monte avec le bras de 6 à 7 cm, pas jusqu'aux
       oreilles. Poses clés, du bas vers le haut, réglées une fois sur le corps posé. */
    let cles = null, zRail = null;
    if (haut && !o.landmine) {
      const surBarre = !libre && m === 'GD', guide = !!o.smith, accompagne = surBarre && !guide && P.sorte === 'debout', sens = o.nuque ? -1 : 1;
      const N = surBarre ? 10 : 6, rB = 0.0135, JEU_BAS = 0.012;
      const parPoints = pts => f => chemin(pts, f);
      // Le buste (debout, barre libre) : un peu en arrière au départ et tant que la barre passe le visage, dessous à la fin.
      const penche = parPoints(o.nuque ? [[0, 2], [1, 1]] : [[0, -4], [0.3, -5], [0.6, -3], [1, 2.5]]), avance = parPoints(o.nuque ? [[0, 0], [1, 0]] : [[0, 0.015], [0.35, 0.02], [1, 0.012]]);
      // La tête, à la barre : menton rentré (le cou recule, le visage reste droit) le temps qu'elle passe, puis entre les
      // bras ; derrière la nuque, elle s'incline en avant.
      const cou = parPoints(o.nuque ? [[0, 12], [0.6, 10], [1, 4]] : [[0, -8], [0.35, -12], [0.6, -4], [1, 7]]), tete = parPoints(o.nuque ? [[0, 0], [1, 0]] : [[0, 6], [0.35, 9], [0.6, 3], [1, -4]]);
      const troncA = f => {
        const q = cloner(p);
        if (accompagne) { q.bassin.rot = qX(penche(f)).multiply(p.bassin.rot); q.bassin.pos.z += avance(f); q.thorax = (p.thorax || 0) - 3 * (1 - f); }
        if (surBarre) { q.cou = (p.cou || 0) + cou(f); q.tete = (p.tete || 0) + tete(f); }
        return q;
      };
      // L'épaule : la ceinture scapulaire suit moins le bras à mesure qu'il passe au-dessus de la tête.
      const part = f => lerp(K_CEINTURE, 0.15, lisse(f));
      // La main. À la barre : le poignet cassé en arrière sous la barre posée (elle repose sur le talon de la main), presque
      // droit en haut. Mains libres : paume en avant ; neutre : paumes face à face ; kettlebell : de face à face à en avant ;
      // arnold : la paume part tournée vers soi et finit en avant.
      const casse = parPoints([[0, surBarre ? (o.nuque ? 14 : 30) : 10], [0.35, surBarre ? (o.nuque ? 12 : 16) : 8], [1, 8]]);
      const tourne = o.arnold ? parPoints([[0, 180], [0.75, 0], [1, 0]]) : o.kb ? parPoints([[0, 75], [0.7, 0], [1, 0]]) : o.neutre ? () => 84 : () => 0;
      const mainA = (s, f) => { const w = rad(casse(f)), a = rad(tourne(f)), tour = v => V(-s * (v.z * Math.sin(a)), v.y, v.z * Math.cos(a)); return { paume: tour(V(0, Math.sin(w), Math.cos(w))), dirMain: tour(V(0, Math.cos(w), -Math.sin(w))) }; };
      // Le coude : le plus bas possible sous la charge, puis vers le dehors quand le bras se tend (paumes face à face ou
      // tournées vers soi : il part de devant le corps).
      const devant = o.arnold || o.neutre || o.kb;
      const versCoude = (s, f) => chemin([[0, V(0, -1, o.nuque ? -0.05 : devant ? 0.15 : 0.08)], [0.5, V(s * 0.55, -1, o.nuque ? -0.05 : devant ? 0.3 : 0.05)], [1, V(s * 1, -0.3, o.nuque ? 0.05 : devant ? 0.4 : 0.2)]], f);
      // Où va chaque main : à la barre, la prise ne bouge pas sur la barre (mains juste en dehors des épaules ; derrière la
      // nuque, plus large) ; mains libres, elles partent écartées, coudes dessous, et se rapprochent en montant.
      const xM = o.nuque ? 0.4 : o.large ? 0.34 : o.serre ? 0.215 : 0.285;
      const basL = o.arnold ? V(0.19, 0.06, 0.165) : o.kb ? V(0.25, 0.09, 0.16) : o.neutre ? V(0.305, 0.18, 0.19) : o.machine ? V(0.37, 0.14, 0.08) : V(0.4, 0.18, 0.11);
      const hautL = o.neutre ? V(0.2, 0, 0.02) : o.machine ? V(0.27, 0, 0.01) : V(0.22, 0, 0.01);
      const travaille = COTES.filter(([k]) => m === 'GD' || m === k);
      const poserBras = (q, f, cible) => {
        const t2 = c.tronc(q), dT2 = v => v.applyQuaternion(t2.qThorax), cibles = {};
        for (const [k, s] of COTES) {
          if (m !== 'GD' && m !== k) { q.bras[k] = cloner(autre); continue; }
          const h = mainA(s, f);
          cibles[k] = cible(s, t2);
          q.bras[k] = { prise: cibles[k].clone(), pole: versCoude(s, f), paume: dT2(h.paume), dirMain: dT2(h.dirMain), doigts: 'barre', ceinture: part(f) };
        }
        return viser(c, q, cibles);
      };
      const k0 = travaille[0][0];
      // En haut : bras tendus (10° au coude : la main reste sur sa prise, le bras ne claque pas), à l'aplomb des épaules.
      const hautDe = cible => { let a = 0.3, b = 0.85; for (let n = 0; n < 10; n++) { const y = (a + b) / 2; if (poserBras(troncA(1), 1, (s, t2) => cible(s, t2, y)).angles[k0].coude > 10) a = y; else b = y; } return a; };
      cles = [];
      if (surBarre) {
        // En bas : la barre à hauteur des clavicules (devant) ou en haut des trapèzes (derrière).
        const yBas = c.tronc(troncA(0)).duThorax(V(0, o.nuque ? 0.085 : 0.06, 0)).y;
        const zFin = c.tronc(troncA(1)).epaules.G.z + (o.nuque ? -0.02 : 0.008);
        const epY = f => c.tronc(troncA(f)).duThorax(V()).y;
        const hautBarre = z => epY(1) + hautDe((s, t2, y) => V(s * xM, t2.duThorax(V()).y + y, z));
        let yHaut = hautBarre(zFin);
        const barreA = (f, y, z) => poserBras(troncA(f), f, s => V(s * xM, y, z));
        // Par où passe la barre à la hauteur y, corps posé : elle peut se poser sur la poitrine, les épaules et le cou ; la
        // tête, elle la passe à 2,5 cm.
        const regionsCorps = o.nuque ? ['cou', 'dos', 'epaule'] : ['thorax', 'epaule', 'cou'];
        const auPlusPres = (y, z, jeu) => {
          const corpsZ = c.barreContre(y, rB + jeu, regionsCorps, xM - 0.06, sens), teteZ = c.barreContre(y, rB + 0.025, ['tete'], 0.14, sens);
          if (corpsZ != null) z = sens > 0 ? Math.max(z, corpsZ) : Math.min(z, corpsZ);
          if (teteZ != null) z = sens > 0 ? Math.max(z, teteZ) : Math.min(z, teteZ);
          return z;
        };
        // Premier passage : la barre part posée contre le corps (les bras déjà en place : l'épaule et la poitrine suivent le
        // bras), puis passe au plus près du chemin prévu sans rien traverser.
        const zs = [];
        let z0 = zFin + sens * 0.06;
        for (let n = 0; n < 2; n++) { barreA(0, yBas, z0); z0 = auPlusPres(yBas, zFin - sens * 0.3, JEU_BAS); }
        zs.push(z0);
        for (let i = 1; i <= N; i++) {
          const f = i / N, y = lerp(yBas, yHaut, f), zPrevu = lerp(z0, zFin, lisse((f - 0.5) / 0.45));
          barreA(f, y, zPrevu);
          zs.push(auPlusPres(y, zPrevu, 0.003));
        }
        if (guide) {
          // Barre guidée : elle monte droit sur son rail, placé là où elle passe partout ; la hauteur des bras tendus s'y règle.
          zRail = sens > 0 ? Math.max(...zs) : Math.min(...zs);
          yHaut = hautBarre(zRail);
          for (let i = 0; i <= N; i++) zs[i] = zRail;
        }
        for (let i = 0; i <= N; i++) { const f = i / N, q = troncA(f); poserBras(q, f, s => V(s * xM, lerp(yBas, yHaut, f), zs[i])); cles.push([f, q]); }
      } else {
        // Mains libres : du bas (à hauteur d'oreille, écartées, placées par rapport au buste) au haut (à la verticale des
        // épaules : la charge se pousse droit vers le haut, même adossé à un dossier incliné).
        const auDessus = (s, t2, y) => t2.duThorax(V()).add(V(s * hautL.x, y, hautL.z));
        const yHaut = hautDe(auDessus);
        const ou = (s, t2, f) => { const g = lisse(f), B = t2.duThorax(V(s * basL.x, basL.y, basL.z)), T = auDessus(s, t2, yHaut); return V(lerp(B.x, T.x, g), lerp(B.y, T.y, f), lerp(B.z, T.z, g)); };
        for (let i = 0; i <= N; i++) { const f = i / N, q = troncA(f); poserBras(q, f, (s, t2) => ou(s, t2, f)); cles.push([f, q]); }
      }
    }
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
      const zB = zRail != null ? zRail : t.duThorax(hautP(1)).z;                // la barre guidée monte droit, sur son rail
      fixe = fixe.concat(poseFixe(MAT.smith(C, zB)));
    }
    // Développé couché à la barre : les supports de barre, derrière la tête, crochets juste sous la barre bras tendus.
    if (o.barre && !o.smith && P.sorte === 'dos' && !o.sol && !haut) {
      const hautBarre = t.duThorax(hautP(1));
      fixe = fixe.concat(poseFixe(MAT.supports(C, hautBarre.y - 0.075, 0.53, hautBarre.z - 0.27)));
    }
    // Barre retenue par des élastiques (développé couché avec bandes) : une bande de chaque main jusqu'au sol.
    if (o.barre && o.elas && !haut) { const zB = t.duThorax(hautP(1)).z; for (const k of ['G', 'D']) tenu.push({ t: 'elastique', de: V((k === 'G' ? 1 : -1) * 0.5, 0.03, zB), m: k, bout: 'rien' }); }
    Object.assign(d, { fixe, vue, tenu }, rythmeDe(o));
    if (o.pousse) {
      // Développé poussé : les genoux plient un peu puis les jambes lancent la barre. Départ en bas.
      const A = d.b, Z = d.a, monter = cles ? v => cloner(chemin(cles, v)) : v => mel(A, Z, v);
      d.pose = u => { const q = monter(lisse(borne((u - 0.3) / 0.7, 0, 1))), dy = -0.09 * Math.sin(Math.PI * borne(u / 0.45, 0, 1)); q.bassin.pos.y += dy; q.bassin.pos.z -= 0.02 * Math.sin(Math.PI * borne(u / 0.45, 0, 1)); for (const k of ['G', 'D']) { if (u < 0.45) q.bras[k].prise.y += dy; } return q; };
      if (cles) { delete d.a; delete d.b; }
    } else if (cles) { delete d.a; delete d.b; d.cles = cles; }                 // poses clés, du bas vers le haut
    else if (haut) { const A = d.a; d.a = d.b; d.b = A; }                       // au-dessus de la tête : on part d'en bas
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
    else if (o.ventre != null) { const a = o.ventre === true ? 40 : o.ventre; p = aPlatVentre(c, { h: 0.44, angle: a, d: 0.08 }); fixe = poseFixe(MAT.banc(C, a, 0.44, 0.68, 0), V(), qY(180)); pendante = true; vue = { az: 56, el: 10 }; }
    else if (o.tabouret) {
      // Assis au bout d'un banc, le buste penché sur les cuisses : les haltères pendent le long des jambes.
      p = assis(c, { h: H_BANC, penche: 58 }); p.cou = -24; fixe = bancAssis(C); pendante = true; vue = { az: 58, el: 10 };
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
      if (o.machine) { p = assis(c, { h: H_SIEGE, zPieds: 0.32 }); const t0 = c.tronc(p); fixe = poseFixe(MAT.siege(C, H_SIEGE)).concat([pret(boite(0.3, 0.45, 0.07, 0, t0.epaules.G.y - 0.22, t0.epaules.G.z + 0.2, C.banc, 0))]); ancre = s => V(s * 0.2, t0.epaules.G.y - (o.haut ? -0.5 : 0.25), t0.epaules.G.z + 0.95); }
      else {
        // Les pieds à plat sur les repose-pieds (inclinés, devant le banc), genoux un peu pliés.
        const zRp = 0.76, yRp = 0.36, pente = rad(62), nPl = V(0, Math.cos(pente), -Math.sin(pente)), dPl = V(0, Math.sin(pente), Math.cos(pente));
        const jb = {};
        for (const [k, s] of COTES) jb[k] = { cheville: V(s * 0.13, yRp - 0.05, zRp).add(nPl.clone().multiplyScalar(L.chevilleH + 0.012)), pole: V(s * 0.25, 1, 0.1), pied: dPl.clone(), hautPied: nPl.clone() };
        p = assis(c, { h: 0.42, penche: -2 }); p.jambes = jb;
        const t0 = c.tronc(p), zTour = t0.epaules.G.z + 1.62; ancre = () => V(0, o.haut ? 1.9 : 0.66, zTour);
        fixe = poseFixe(MAT.banc(C, 0, 0.42, 0.62, 0.34), V(0, 0, 0.12)).concat(poseFixe(MAT.reposePieds(C, yRp, zRp, 62, 0.4, zTour - 0.1)));
      }
      vue = { az: 70, el: 10 };
    } else if (o.debout) {
      p = debout(c, { penche: 14, dy: -0.08, dz: -0.02, cou: -6 }); p.jambes.G = pied(c, 1, { z: 0.24 }); p.jambes.D = pied(c, -1, { z: -0.26, pointe: 18 });
      ancre = () => V(0, o.haut ? 1.95 : o.bas ? 0.2 : 1.1, 1.5); vue = { az: 70, el: 8 };
    } else if (o.genoux || o.demigenou) { p = o.genoux ? aGenoux(c, { penche: 6 }) : demiGenou(c, { penche: 6 }); ancre = () => V(0, o.haut ? 2.0 : 1.0, 1.5); vue = { az: 70, el: 8 }; }
    else {
      const a = o.pendlay ? 82 : o.yates ? 40 : o.penche && o.penche !== true ? o.penche : 66;
      p = debout(c, { dy: -0.07 - a * 0.0016, dz: -0.08 - a * 0.0028, penche: a, lomb: 2, thor: 2, cou: -a * 0.42, ecart: o.gorille ? 0.3 : 0.17, ouv: 12 });
      // Buste penché, on tient sur ses pieds : genoux souples, et les hanches reculent juste ce qu'il faut pour que le
      // centre de gravité reste au milieu du pied.
      tenirDebout(c, p, o.pendlay ? 24 : 30, p.jambes.G.cheville.z + 0.065, o.poulie || o.elas ? 0 : 0.4, 0.02);   // la charge pend sous les épaules
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
      const a = ancre(s), ep = t.epaules[k].clone().add(dT(s * (e - 0.165) * 0.6, 0, 0)), vers = unite(a.clone().sub(ep));
      const a_ = x => ep.clone().add(vers.clone().multiplyScalar(x));
      if (o.haut) {
        // Vers une poulie haute, le bras monte et l'épaule avec lui : la portée se règle sur le corps posé (bras tendu).
        const essai = cloner(p), x = coudeTendu(c, x => { essai.bras[k] = { prise: a_(x), pole: dT(s, 0.2, -1), paume: dT(...paume(s).xyz()), doigts: 'barre' }; return essai; }, portee - 0.06, portee + 0.25, 12, [k]);
        if (x != null) return a_(x);
      }
      return a_(portee);
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
    let p, fixe = [], vue = { az: 150, el: 8 }, poste = false;
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
    else { p = assis(c, { h: H_SIEGE, zPieds: 0.3 }); poste = true; }
    const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const e = o.large ? 0.43 : o.serre ? 0.1 : o.sup ? 0.19 : 0.3, portee = (L.bras + L.prise) * 0.97;
    const anc = V(0, t.epaules.G.y + 1.0, t.epaules.G.z + 0.14);
    const paume = s => (o.neutre || o.serre || m !== 'GD' ? V(-s, 0, 0) : o.sup ? V(0, 0, -1) : V(0, 0, 1));
    const basP = s => (o.nuque ? V(s * 0.42, 0.03, -0.1) : V(s * Math.max(e, 0.17), -0.03, 0.17));
    const bras = f => { const r = {}; for (const [k, s] of COTES) r[k] = { prise: t.duThorax(f(s)), pole: dT(s * 1, -0.5, o.sup || o.serre ? 0.5 : -0.25), paume: dT(...paume(s).xyz()), dirMain: dT(0, 1, 0), doigts: 'barre' }; return r; };
    // En haut, les bras sont tendus vers la barre : la hauteur des mains se règle sur le corps posé (l'épaule monte avec le
    // bras ; comptée depuis l'épaule au repos, elle laissait les coudes pliés à 64°).
    const estime = (() => { const dx = e - 0.165; return Math.sqrt(Math.max(0.01, portee * portee - dx * dx - 0.014)); })();
    const yHaut = coudeTendu(c, y => Object.assign(cloner(p), { bras: bras(s => V(s * e, y, 0.12)) }), estime - 0.05, estime + 0.3, 12);
    const hautP = s => V(s * e, yHaut != null ? yHaut : estime, 0.12);
    const d = parLesBras(p, bras(hautP), bras(basP), m);
    // Le buste part un peu en arrière en tirant.
    if (!o.nuque) { d.b.lombaires = -9; d.b.thorax = -5; }
    const r = { ancre: () => anc, bout: m === 'GD' ? 'barre' : null, lCable: o.large ? 1.15 : o.serre ? 0.3 : 0.8, deElas: () => anc, pivot: s => V(s * 0.3, anc.y, anc.z - 0.5) };
    // Assis : le poste de tirage (bâti, potence, assise, boudins) ; sinon une tour de poulie haute devant soi.
    if (poste) fixe = fixe.concat(poseFixe(o.poulie || o.machine ? MAT.tirageHaut(C, anc, H_SIEGE, 0) : MAT.siege(C, H_SIEGE)));
    else if (o.poulie) fixe = fixe.concat(poseFixe(MAT.colonne(C, anc, V(0, 0, anc.z + 0.3))));
    return Object.assign(d, { fixe, vue, tenu: tenuDe(o, m, r) });
  };

  /* Tractions et suspensions à la barre fixe (ou aux anneaux) : les mains ne bougent pas, le corps monte.
     Prise : (pronation), sup, neutre ; large, serre ; nuque. Variantes : leste, elastique (assistée), machine
     (assistée, genoux sur un plateau), negative (descente lente), anneaux, scapulaire (bras tendus, seules les
     épaules travaillent), pendu (suspension tenue), autour (le menton passe d'un côté puis de l'autre). */
  FAM.traction = (c, o, C) => {
    const L = c.L, H = 2.42, ecart = o.large ? 0.46 : o.serre ? 0.14 : o.sup ? 0.22 : 0.33;
    let yPendu = null;
    const base = u => {
      const p = { bassin: { pos: L.racine.clone(), rot: qX(lerp(0, o.nuque ? 6 : -10, u)) }, lombaires: lerp(0, o.nuque ? 0 : -6, u), thorax: lerp(0, o.nuque ? 4 : -6, u), cou: lerp(-4, o.nuque ? -24 : 14, u), jambes: {}, bras: {} };
      let t = c.tronc(p);
      // Épaules à une longueur de bras sous la barre, puis menton au-dessus ; le corps recule : la barre passe devant.
      const dx = ecart - t.epaules.G.x, pendu = Math.sqrt(Math.max(0.01, Math.pow((L.bras + L.prise) * 0.96, 2) - dx * dx));
      // Prise serrée : les mains sont presque à l'aplomb des épaules, le coude est au bout de sa course un peu plus tôt —
      // on monte moins haut, la barre devant le haut de la poitrine.
      const yEp = lerp(yPendu != null ? yPendu : H - pendu, H - (o.nuque ? 0.1 : o.serre ? 0.225 : 0.17), u);
      p.bassin.pos.y += yEp - t.epaules.G.y; p.bassin.pos.z += lerp(0.02, o.nuque ? 0.12 : o.serre ? -0.14 : -0.1, u) - t.epaules.G.z;
      for (const [k, s] of COTES) {
        p.jambes[k] = o.machine ? J(8, 3, 0, 96, 30) : J(lerp(6, 14, u), 2, 0, o.leste ? 20 : 62, 30);
        p.bras[k] = { prise: V(s * ecart, H, 0.02), pole: V(s * 1, -0.2, o.sup || o.neutre ? 0.5 : -0.25), paume: o.neutre ? V(-s, 0, 0) : o.sup ? V(0, 0, -1) : V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'barre' };
        if (o.scapulaire) p.bras[k].hausse = lerp(22, -6, u * 8);
      }
      // La barre est fixe : les mains tombent juste dessus (une main en pronation arrive sinon 2 à 3 cm à côté).
      if (!o.anneaux) viser(c, p, { G: V(ecart, H, 0.02), D: V(-ecart, H, 0.02) });
      return p;
    };
    // Pendu, les bras sont tendus : la hauteur des épaules se règle une fois sur le corps posé (elles montent avec les bras).
    { const p0 = base(0); tendre(c, p0, V(0, -1, 0), null, null, o.anneaux ? null : { G: V(ecart, H, 0.02), D: V(-ecart, H, 0.02) }); yPendu = c.tronc(p0).epaules.G.y; }
    const amp = o.scapulaire ? 0.1 : 1;
    const d = { vue: { az: o.sup ? 150 : 205, el: 4 }, fixe: o.anneaux ? [] : poseFixe(MAT.barreFixe(C, H, Math.max(1.3, 2 * ecart + 0.4))), tenu: [] };
    if (o.pendu) { d.a = base(0); d.b = base(0.03); d.rythme = 'tenue'; }
    else if (o.autour) {
      // Le corps passe d'un côté de la barre à l'autre, mains fixes : seize poses réglées d'avance sur le tour (mains
      // remises sur la barre une fois le corps déporté), et le mouvement passe de l'une à l'autre.
      const tour = ph => { const w = ph * 2 * Math.PI, u = 0.55 + 0.4 * Math.sin(w - Math.PI / 2) * 0.5 + 0.2, p = base(Math.min(1, u)); p.bassin.pos.x += 0.16 * Math.cos(w); p.bassin.rot = p.bassin.rot.clone().multiply(qZ(-8 * Math.cos(w))); for (const [k, s] of COTES) p.bras[k].prise = V(s * ecart, H, 0.02); if (!o.anneaux) viser(c, p, { G: V(ecart, H, 0.02), D: V(-ecart, H, 0.02) }); return p; };
      const N = 16, table = []; for (let i = 0; i <= N; i++) table.push([i / N, tour(i / N)]);
      d.rythme = 'continu'; d.periode = 3.4; d.pose = ph => chemin(table, ph);
    }
    else { d.a = base(0); d.b = base(amp); d.cles = [[0, d.a], [0.25, base(0.25 * amp)], [0.5, base(0.5 * amp)], [0.75, base(0.75 * amp)], [1, d.b]]; }   // cinq poses : entre deux, les mains restent sur la barre à moins de 5 mm
    if (o.negative) { const Z = d.b, monter = v => chemin(d.cles, v); d.rythme = 'continu'; d.periode = 5; d.pose = ph => (ph < 0.12 ? monter(lisse(ph / 0.12)) : ph < 0.2 ? Z : monter(1 - lisse((ph - 0.2) / 0.7))); }
    if (o.anneaux) { d.tenu = [{ t: 'sangle', de: s => V(s * ecart, H + 1.0, 0.02), m: 'G' }]; d.tenu = [{ t: 'sangle', de: V(ecart, H + 1.1, 0.02), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, H + 1.1, 0.02), m: 'D', bout: 'anneau' }]; }
    if (o.leste) {
      // Le disque pend à la ceinture par une chaîne, à plat devant les cuisses : sa distance au bassin se mesure sur
      // le corps posé, en bas et en haut de la traction.
      const R = 0.16, bas = 0.36, devant = u => { const p = base(u), b = c.poser(p).bassin, z = c.devantJambes(p, b.y - bas - 0.7 * R, b.y - bas + 0.7 * R, ['cuisse']); return z - b.z + 0.026; };
      const z0 = devant(0), z1 = devant(amp);
      d.objets = (info, u, sortie) => {
        const b = info.bassin, z = b.z + lerp(z0, z1, u), ventre = V(b.x, b.y - 0.02, b.z + L.ventre + 0.004);
        sortie.push(pret(cyl(R, 0.036, b.x, b.y - bas, z, C.fonte, 0.05, qX(90)))); sortie.push(pret(cyl(0.03, 0.04, b.x, b.y - bas, z, C.metal, 0.8, qX(90))));
        sortie.push(pret(seg(ventre, V(b.x, b.y - bas + 0.02, z + 0.022), 0.005, C.cadre, 0.6))); sortie.push(pret(seg(ventre, V(b.x, b.y - bas + 0.02, z - 0.022), 0.005, C.cadre, 0.6)));
      };
    }
    if (o.elastique) d.objets = (info, u, sortie) => { const pi = info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5); sortie.push(pret(seg(V(0, H, 0.02), pi, 0.008, C.elastique, 0))); };
    if (o.machine) {
      // Machine à tractions assistées : une tour derrière soi, et un bras qui soutient le plateau où posent les genoux.
      const zT = -0.72;
      d.fixe = d.fixe.concat(poseFixe(horsCadre(deplacer(bati(C, 2.2, 0), V(0, 0, zT)))));
      d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().add(info.genoux.D).multiplyScalar(0.5), pl = V(0, g.y - 0.09, g.z - 0.08); sortie.push(pret(coussin(0.46, 0.065, 0.3, pl.x, pl.y, pl.z, C))); sortie.push(pret(tube(V(0, 0.75, zT + 0.05), V(0, pl.y - 0.04, pl.z), 0.05, C.cadre))); };
      d.levee = (info, u) => 0.5 * (1 - u);
    }
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
      // Sur une jambe (pistolet), la charge sert de contrepoids : les bras s'allongent devant à mesure qu'on descend.
      const loin = o.pistolet ? 0.24 * (u || 0) : 0;
      for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.06, -0.16 + 0.4 * loin, 0.2 + loin)), pole: dT(s * 0.5, -1, 0.1), paume: dT(-s, 0.1, 0), dirMain: dT(0, 0.9 - 2 * loin, 0.3 + 2 * loin), doigts: 'barre' };
      if (o.kb) r.tenu = [{ t: 'kb', m: 'GD', entre: true }];
      else r.objets = (info, uu, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), haut = AY.clone().applyQuaternion(info.qThorax); poserObjet(MAT.haltere(C, 1.25), m.clone().add(haut.clone().multiplyScalar(-0.08)), qTenu(haut, AZ), sortie); };
    } else if (o.hal || o.kb2) {
      // Un haltère dans chaque main : les bras pendent à la verticale, quel que soit le buste (ils ne penchent pas avec
      // lui), et s'écartent ce qu'il faut pour passer en dehors de la cuisse et du genou quand on descend.
      const L = c.L, portee = (L.bras + L.prise) * 0.985;
      for (const [k, s] of COTES) {
        const e = t.epaules[k], j = p.jambes[k], g = j && j.cheville ? ik2(t.hanches[k], j.cheville, L.cuisse, L.jambe, j.pole || AZ).milieu : null;
        // De combien la main s'écarte de l'aplomb de l'épaule, vers le dehors (s) : 8 cm, ou jusqu'en dehors du genou.
        const bas = g && e.y - portee < g.y + 0.2, dx = Math.min(0.3, Math.max(0.085, bas ? s * (g.x - e.x) + 0.11 : 0));
        p.bras[k] = { prise: V(e.x + s * dx, e.y - Math.sqrt(Math.max(0.01, portee * portee - dx * dx - 0.0009)), e.z + 0.03), pole: V(s * 0.3, 0, -1), paume: V(-s, 0, 0), dirMain: V(0, -1, 0), doigts: 'barre' };
      }
      r.tenu = [{ t: o.kb2 ? 'kb' : 'haltere', m: 'GD' }];
    }
    else if (o.landmine) {
      for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.05, -0.12, 0.2)), pole: dT(s * 0.6, -1, 0.1), paume: dT(-s, 0, 0), dirMain: dT(0, 0.6, 0.8), doigts: 'barre' };
      const piv = V(0, 0.05, 1.5);
      r.objets = (info, uu, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), dir = unite(m.clone().sub(piv)); sortie.push(pret(seg(piv, m.clone().add(dir.clone().multiplyScalar(0.1)), 0.025, C.metal, 1))); const pp = m.clone().sub(dir.clone().multiplyScalar(0.22)), q = arc(AY, dir); sortie.push({ forme: 'cylindre', s: [0.18, 0.045, 0.18], p: [pp.x, pp.y, pp.z], q: [q.x, q.y, q.z, q.w], couleur: C.fonte, metal: 0 }); };
    } else if (o.elas) { p.bras = pareil(B(30, 28, 60, 140, 90)); r.tenu = [{ t: 'elastique', de: 'pieds', m: 'G', bout: 'rien' }, { t: 'elastique', de: 'pieds', m: 'D', bout: 'rien' }]; }
    else if (o.hanches) p.bras = mains(c, t, 'hanches');
    else if (o.nuque) p.bras = mains(c, t, 'nuque');
    else {
      // Sans charge : les bras tendus devant soi, à l'horizontale, pour l'équilibre (quel que soit le buste).
      const k = u == null ? 1 : u;
      for (const [kk, s] of COTES) p.bras[kk] = { dirBras: V(s * 0.05, -0.35 * (1 - k), 1), dirAvantBras: V(-s * 0.02, -0.3 * (1 - k), 1), paume: V(0, -1, 0), doigts: 'plat' };
    }
    return r;
  }

  /* Squats : les pieds restent au sol, le bassin descend.
     Charge : voir porter. Pieds : (largeur d'épaules), sumo, serre. Amplitude : demi, boite (jusqu'à un banc),
     partiel. Variantes : saut ; pistolet (une jambe ; assiste ; boite) ; sissy ; cosaque ; cycliste (talons
     surélevés) ; thruster (squat puis développé) ; mur (chaise contre le mur, tenue ; ballon) ; hack (machine
     inclinée ; avec barre : la barre derrière les jambes) ; ceinture (charge accrochée à la taille). */
  FAM.squat = (c, o, C) => {
    const L = c.L, sumo = !!o.sumo;
    const ecart = sumo ? 0.36 : o.serre ? 0.09 : 0.2, ouv = sumo ? 42 : 26;
    const prof = o.demi ? 0.52 : o.partiel ? 0.7 : o.boite ? 0.8 : 1;
    const droit = o.avant || o.gobelet || o.kb || o.tete || o.zercher || o.landmine || o.smith || sumo || o.cycliste;   // buste plus droit
    let fixe = [], vue = { az: 38, el: 8 }, objetsPlus = null;
    if (o.mur) {
      // Chaise contre le mur : dos au mur, cuisses à l'horizontale ; tenue.
      const p = debout(c, { dy: -0.4, dz: -0.42, penche: 0, ecart: 0.13, ouv: 6 }); p.bras = pareil(B(0, 20, 0, 10, 180, { doigts: 'detendu' }));
      // Avec un ballon : il est pris entre le dos et le mur (le corps est donc à un ballon du mur) ; debout, il est au
      // creux des reins ; quand on descend, il roule le long du dos — son centre monte, vu du bassin, de la moitié.
      const rB = 0.2, zMur = p.bassin.pos.z - L.dos - (o.ballon ? 2 * rB - 0.015 : 0.02);
      fixe = poseFixe(MAT.mur(C, zMur));
      if (o.ballon) {
        const hautP = debout(c, { dy: -0.05, dz: -0.42, penche: 0, ecart: 0.13, ouv: 6 }); hautP.bras = cloner(p.bras);
        const yHaut = hautP.bassin.pos.y;
        return { a: hautP, b: p, fixe, vue: { az: 70, el: 8 }, objets: (info, u, sortie) => sortie.push(pret(sphere(rB, 0, yHaut + 0.16 - (yHaut - info.bassin.y) / 2, zMur + rB, C.ballon, 0))) };
      }
      const q = cloner(p); q.thorax = 1.5;
      return { a: p, b: q, rythme: 'tenue', fixe, vue: { az: 70, el: 8 } };
    }
    if (o.hack && !o.barre) {
      // Machine inclinée : le dos glisse le long d'un dossier à 60°, les pieds sur un plateau.
      const r = V(0, Math.sin(rad(58)), -Math.cos(rad(58))), base = V(0, 0.92, -0.2);
      const cle = u => { const p = { bassin: { pos: base.clone().add(r.clone().multiplyScalar(-0.3 * u)), rot: qX(-28) }, lombaires: 0, thorax: 0, cou: 6, bras: {}, jambes: {} }; for (const [k, s] of COTES) { p.jambes[k] = { cheville: V(s * 0.16, 0.3, 0.42), pole: V(s * 0.2, 0.4, 1), pied: V(s * 0.15, 0.55, 0.83), hautPied: V(0, 0.83, -0.55) }; p.bras[k] = B(30, 40, 0, 100, 90); } return p; };
      // Le bâti : le plateau des pieds, deux rails inclinés sur leurs montants ; le chariot (dossier, épaulières,
      // traverse, disques) glisse le long des rails avec le dos.
      const xR = 0.36, r0 = V(0, 0.16, 0.36), r1 = r0.clone().add(r.clone().multiplyScalar(2.0));
      fixe = [pret(boite(0.62, 0.035, 0.5, 0, 0.27, 0.56, C.fonte, 0.3, qX(-32), 0.012)), pret(tube(V(0, 0.03, 0.72), V(0, 0.2, 0.62), 0.05, C.cadre))];
      for (const s of [1, -1]) {
        fixe.push(pret(tube(r0.clone().setX(s * xR), r1.clone().setX(s * xR), 0.055, C.cadre)), Object.assign(pret(tube(V(s * xR, 0.03, r1.z), r1.clone().setX(s * xR), 0.055, C.cadre)), { hors: 1 }));
        fixe.push(...poseFixe(patin(C, V(s * xR, 0.028, r1.z - 0.1), V(s * xR, 0.028, 0.85), 0.05)));
      }
      fixe.push(Object.assign(pret(tube(r1.clone().setX(-xR), r1.clone().setX(xR), 0.055, C.cadre)), { hors: 1 }));
      const d = { pose: cle, fixe, vue: { az: 62, el: 10 }, tenu: [] };
      d.objets = (info, u, sortie) => {
        const b = info.bassin, q = qX(-28), dos = V(0, 0.32, -0.15).applyQuaternion(q).add(b);
        sortie.push(pret(coussin(0.4, 0.78, 0.065, dos.x, dos.y, dos.z, C, q)));
        const tr = dos.clone().add(V(0, 0, -0.08).applyQuaternion(q));
        sortie.push(pret(tube(tr.clone().setX(-xR - 0.04), tr.clone().setX(xR + 0.04), 0.05, C.cadre)));
        for (const s of [1, -1]) {
          const ep = info.epaules[s > 0 ? 'G' : 'D'], pad = ep.clone().add(V(0, 0.085, 0.01).applyQuaternion(q));
          sortie.push(pret(cyl(0.05, 0.16, pad.x, pad.y, pad.z, C.banc, 0.12, q.clone().multiply(LONG_Z), 0.02)));
          poserObjet(MAT.disque(C, 0.2), tr.clone().setX(s * (xR + 0.12)), null, sortie);
        }
      };
      return d;
    }
    const libre = !(o.smith || o.ceinture || o.landmine || o.boite || o.elas);
    const debout0 = debout(c, { penche: 2, ecart, ouv }), zDebout = aplomb(c, debout0, c.tronc(debout0)), zMilieu = debout0.jambes.G.cheville.z + 0.05;
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
        // En bas : les hanches passent sous les genoux, le buste penche d'autant que la barre est sur le dos.
        p = debout(c, { dy: -0.44 * k, dz: (droit ? -0.15 : -0.22) * k, penche: 2 + (droit ? 18 : 32) * k, ecart, ouv, lomb: 3 * k, thor: 5 * k, cou: -(droit ? 12 : 24) * k, y0: o.cycliste ? 0 : 0 });
        if (o.cycliste) for (const [kk, s] of COTES) p.jambes[kk] = pied(c, s, { ecart: 0.1, ouv: 8, pointe: 14 });
        // Le squat tient en équilibre : en descendant, le centre de gravité vient au milieu du pied — les genoux avancent
        // au-dessus des orteils au lieu que le bassin s'asseye en arrière des talons. (Pas quand quelque chose retient
        // le corps : barre guidée, ceinture, landmine, boîte où l'on s'assied.)
        if (libre) {
          equilibrer(c, p, lerp(zDebout, zMilieu, Math.min(1, k * 1.6)));
          // La cheville a sa limite : le tibia ne s'incline pas de plus de 36° (buste très droit : il recule un peu).
          for (let n = 0; n < 3; n++) { const j = p.jambes.G, g = ik2(c.tronc(p).hanches.G, j.cheville, L.cuisse, L.jambe, j.pole).milieu, tibia = Math.atan2(g.z - j.cheville.z, g.y - j.cheville.y) * 180 / Math.PI; if (tibia <= 36) break; p.bassin.pos.z -= (tibia - 36) * 0.0067; }
        }
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
      const dessus = cloner(hautP); const t = c.tronc(dessus);
      // Au-dessus de la tête, bras tendus : la hauteur se règle sur le corps posé (l'épaule monte avec le bras).
      const lever = y => { for (const [kk, s] of COTES) dessus.bras[kk] = { prise: t.duThorax(V(s * 0.3, y, 0.02)), pole: V(s * 0.7, -1, 0.5).applyQuaternion(t.qThorax), paume: V(0, 0, 1).applyQuaternion(t.qThorax), dirMain: V(0, 1, 0).applyQuaternion(t.qThorax), doigts: 'barre', ceinture: 0.15 }; return dessus; };
      const yDessus = coudeTendu(c, lever, L.bras + L.prise - 0.08, L.bras + L.prise + 0.3);
      lever(yDessus != null ? yDessus : L.bras + L.prise - 0.03);
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
      // Montée sur banc : un pied sur le banc, le corps se hisse ; l'autre pied vient se poser à côté — il monte d'abord,
      // avance ensuite, pour passer par-dessus le bord de la marche.
      const h = o.poliquin ? 0.2 : 0.4;
      fixe.push(...poseFixe(MAT.step(C, 0.6, h, 0.42, 0, 0.36)));
      d.pose = u => { const p = debout(c, { dy: h * u - 0.02 * (1 - u), dz: 0.1 + 0.26 * u, penche: 18 * (1 - u) + 2, cou: -10 * (1 - u) }); p.bassin.pos.z = z0 + 0.1 + 0.25 * u; p.jambes.G = pied(c, 1, { z: z0 + 0.34, y0: h, ouv: 6 }); const lv = Math.sin(Math.PI * u); p.jambes.D = pied(c, -1, { z: z0 - 0.12 + 0.44 * lisse((u - 0.4) / 0.6), y0: h * lisse(u / 0.55) + 0.05 * lv, ouv: 6, pointe: 25 * (1 - lisse(u / 0.5)) }); const m = porter(c, p, o, C, 0); d.tenu = m.tenu; d.objets = m.objets; return p; };
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
      const cle = u => { const p = { bassin: { pos: V(0, 0.9, 0), rot: qX(ang + 10) }, lombaires: lerp(16, -4, u), thorax: lerp(6, -2, u), cou: lerp(8, -10, u), bras: {}, jambes: pareil(J(lerp(52, 8, u) * 0 + 10 + (ang ? 0 : 0), 4, 0, 4, 25)) }; p.bassin.rot = qX(lerp(ang + 62, ang + 6, u)); p.jambes = pareil(J(lerp(62, 6, u), 4, 0, 4, 25)); const t = c.tronc(p); p.bras = o.hal ? { G: { prise: t.duThorax(V(0.05, -0.12, 0.2)), pole: V(0.6, -1, 0).applyQuaternion(t.qThorax), paume: V(-1, 0, 0).applyQuaternion(t.qThorax), doigts: 'barre' }, D: { prise: t.duThorax(V(-0.05, -0.12, 0.2)), pole: V(-0.6, -1, 0).applyQuaternion(t.qThorax), paume: V(1, 0, 0).applyQuaternion(t.qThorax), doigts: 'barre' } } : mains(c, t, 'poitrine'); return p; };
      if (o.machine) {
        // À la machine, assis : le buste part penché en avant et pousse le coussin vers l'arrière.
        const base = assis(c, { h: H_SIEGE, zPieds: 0.34 });
        d.pose = u => { const p = cloner(base); p.bassin.rot = qX(lerp(34, -18, u)); p.lombaires = lerp(10, -4, u); const t = c.tronc(p); p.bras = mains(c, t, 'poitrine'); return p; };
        // La machine : l'assise, un repose-pieds, le bâti derrière ; le boudin du haut du dos tient au bout d'un bras
        // qui pivote à hauteur des hanches.
        const zT = -0.95;
        fixe.push(...poseFixe(MAT.siege(C, H_SIEGE)), ...poseFixe(horsCadre(deplacer(bati(C, 1.5, 0), V(0, 0, zT)))), pret(tube(V(0, 0.03, zT), V(0, 0.03, 0.3), 0.05, C.cadre)), pret(tube(V(-0.2, 0.12, 0.42), V(0.2, 0.12, 0.42), 0.045, C.cadre)));
        d.objets = (info, u, sortie) => {
          const e = info.epaules.G.clone().add(info.epaules.D).multiplyScalar(0.5), q = info.qThorax, pp = e.clone().add(V(0, -0.08, -0.17).applyQuaternion(q));
          poserObjet(MAT.coussin(C, 0.42, 0.06), pp, null, sortie);
          for (const s of [1, -1]) { sortie.push(pret(tube(V(s * 0.25, 0.62, -0.12), V(s * 0.25, pp.y, pp.z), 0.04, C.cadre))); sortie.push(pret(cyl(0.045, 0.03, s * 0.25, 0.62, -0.12, C.cadre, 0.5, null, 0.008))); }
        };
        d.levee = (info, u) => 0.25 * u;
        d.vue = { az: 70, el: 10 }; return d;
      }
      // Les pieds sont tenus au sol derrière, les cuisses appuyées sur le coussin incliné.
      const piedsF = { G: pied(c, 1, { x: 0.12, z: -0.62, ouv: 0, pointe: 0 }), D: pied(c, -1, { x: -0.12, z: -0.62, ouv: 0, pointe: 0 }) };
      d.pose = u => { const p = cle(u); p.bassin.pos = V(0, 0.93, 0); p.jambes = cloner(piedsF); for (const k of ['G', 'D']) p.jambes[k].pole = V(0, 0.2, 1); return p; };
      fixe.push(pret(boite(0.4, 0.07, 0.36, 0, 0.78, 0.16, C.banc, 0, qX(-42))), pret(seg(V(0, 0, -0.1), V(0, 0.72, 0.16), 0.03, C.cadre, 0.5)), pret(cyl(0.045, 0.4, 0, 0.2, -0.72, C.banc, 0)), pret(seg(V(0, 0, -0.1), V(0, 0.2, -0.72), 0.03, C.cadre, 0.5)), pret(boite(0.5, 0.03, 1.0, 0, 0.015, -0.3, C.cadre, 0.5)));
      if (o.hal) d.tenu = [{ t: 'disque', m: 'GD', r: 0.13, axe: 'buste' }];
      d.vue = { az: 70, el: 10 }; return d;
    }
    /* ---- Régler une posture debout sur ses jambes, pieds posés ----
       Une charnière de hanche ne se règle pas en reculant le bassin « à l'œil » : si le buste se couche pendant que le
       bassin monte, les jambes se verrouillent et basculent en arrière. Ici la posture part des jambes : le tibia
       (son inclinaison vers l'avant) et le genou (sa flexion) sont voulus, et le reste en découle. */
    const sumo = !!o.sumo, y0 = o.deficit ? 0.1 : 0;
    const ecart = sumo ? 0.44 : o.swing ? 0.24 : o.kb ? 0.2 : 0.14, ouv = sumo ? 42 : o.kb || o.swing ? 16 : 12;   // sumo : pieds très écartés, pointes ouvertes
    const portee = (L.bras + L.avantBras) * 0.985, DEG = 180 / Math.PI;
    const base = (pen, k) => debout(c, { dy: y0, penche: pen, lomb: 4 * k, thor: 5 * k, cou: -0.5 * pen, ecart, ouv, y0 });
    // Tibia et genou lus dans le plan avant-arrière, d'après la hanche et la cheville ; `calage` en est l'inverse exact.
    const planDe = (h, ch) => {
      const dy = h.y - ch.y, dz = h.z - ch.z, D = Math.min(Math.hypot(dy, dz), L.cuisse + L.jambe - 1e-4);
      const dedans = Math.acos(borne((L.cuisse * L.cuisse + L.jambe * L.jambe - D * D) / (2 * L.cuisse * L.jambe), -1, 1));
      const aCheville = Math.acos(borne((L.jambe * L.jambe + D * D - L.cuisse * L.cuisse) / (2 * L.jambe * D), -1, 1));
      return { tibia: (Math.atan2(dz, dy) + aCheville) * DEG, genou: 180 - dedans * DEG };
    };
    // De combien déplacer le bassin (t : son tronc posé) pour que la jambe d'appui ait ce tibia et ce genou.
    const calage = (p, t, tibia, genou) => {
      const h = t.hanches.G, ch = p.jambes.G.cheville, a = rad(tibia), g = rad(genou - tibia);
      return { y: ch.y + L.jambe * Math.cos(a) + L.cuisse * Math.cos(g) - h.y, z: ch.z + L.jambe * Math.sin(a) - L.cuisse * Math.sin(g) - h.z };
    };
    const caler = (p, tibia, genou) => { const dp = calage(p, c.tronc(p), tibia, genou); p.bassin.pos.y += dp.y; p.bassin.pos.z += dp.z; return p; };
    // Debout, en haut du geste : buste droit, genoux presque tendus — le bassin descend droit jusqu'à ce que les jambes,
    // même très écartées, atteignent leurs appuis. Ses jambes donnent le point de départ des réglages.
    const haut = base(2, 0); haut.bassin.pos.z -= 0.01;
    { const h = c.tronc(haut).hanches.G, ch = haut.jambes.G.cheville, l = (L.cuisse + L.jambe) * 0.9985; haut.bassin.pos.y += ch.y + Math.sqrt(Math.max(0.01, l * l - Math.pow(h.x - ch.x, 2) - Math.pow(h.z - ch.z, 2))) - h.y; }
    const hHaut = c.tronc(haut).hanches.G, jHaut = planDe(hHaut, haut.jambes.G.cheville);
    // Le vrai tibia debout (jambes écartées, le genou part vers le dehors : le plan avant-arrière ne suffit plus).
    const gHaut = ik2(hHaut, haut.jambes.G.cheville, L.cuisse, L.jambe, haut.jambes.G.pole).milieu, tibiaHaut = Math.atan2(gHaut.z - haut.jambes.G.cheville.z, gHaut.y - haut.jambes.G.cheville.y) * DEG;
    if (o.swing) {
      // Balancement du kettlebell : il passe entre les jambes puis monte devant, bras tendus, par un coup de hanches.
      // En bas : hanches reculées, genoux pliés d'un tiers, tibias presque droits, buste couché à mi-chemin.
      const m = coteDe(o);
      const cle = u => {
        const k = 1 - u, p = caler(debout(c, { penche: 3 + 55 * k, lomb: 2 * k, cou: -28 * k, ecart, ouv }), lerp(jHaut.tibia, -4, k), lerp(jHaut.genou, 38, k));
        p.bras = pareil(B(-4, lerp(-70 + 62, 90, u), -16, 6, 180));
        if (m !== 'GD') {
          // À une main : elle suit le même arc, mais au milieu du corps — le kettlebell passe entre les jambes.
          const t = c.tronc(p), e = t.epaules.G, el = rad(lerp(-8, 90, u)), dx = 0.02 - e.x, l = (L.bras + L.prise) * 0.985, r = Math.sqrt(Math.max(0.01, l * l - dx * dx));
          const dir = V(0, -Math.cos(el), Math.sin(el)).applyQuaternion(t.qThorax);
          p.bras.G = { prise: e.clone().add(V(dx, 0, 0).applyQuaternion(t.qThorax)).addScaledVector(dir, r), pole: V(1, 0.2, -0.6).applyQuaternion(t.qThorax), paume: V(0, -Math.sin(el), -Math.cos(el)).applyQuaternion(t.qThorax), dirMain: dir, doigts: 'barre' };
          p.bras.D = B(70, 30, 0, 20, 90, { doigts: 'detendu' });
        }
        return p;
      };
      d.pose = cle; d.rythme = 'rep'; d.periode = 2.2;
      // La boule prolonge les bras (elle ne pend pas à la verticale pendant le balancement).
      d.tenu = []; d.objets = (info, u, sortie) => { const pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises.G, dir = info.dirMains.G; poserObjet(MAT.kettlebell(C), pr, qTenu(AX, dir.clone().multiplyScalar(-1)), sortie); };
      return d;
    }
    if (o.goodmorning) {
      if (o.assis) { const assise = assis(c, { h: H_BANC, ecart: 0.26, ouv: 20, zPieds: 0.36 }); fixe.push(...bancAssis(C)); d.pose = u => { const p = cloner(assise); p.bassin.rot = qX(lerp(2, 62, u)); p.lombaires = 3 * u; p.cou = -30 * u; porter(c, p, { barre: true }, C); return p; }; }
      // Debout : genoux à peine pliés, les hanches reculent pendant que le buste se couche, dos droit.
      else d.pose = u => { const p = caler(debout(c, { penche: 2 + 66 * u, lomb: 3 * u, thor: 3 * u, cou: -35 * u, ecart, ouv }), lerp(jHaut.tibia, -7, u), lerp(jHaut.genou, 20, u)); porter(c, p, o.smith ? { smith: true } : { barre: true }, C); return p; };
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
    /* Les soulevés proprement dits. Deux gestes :
        — depuis le sol (classique, sumo, haltères, kettlebell, barre hexagonale) : les épaules restent à l'aplomb de la
          charge, bras tendus ; le tibia est avancé au départ, droit quand la charge passe les genoux ; le buste se penche
          ce qu'il faut pour cela, et les genoux plient d'autant. Les jambes poussent et le buste se redresse ensemble ;
        — en charnière (roumain, jambes tendues, poulie, sur une jambe, au poids du corps) : genoux à peine pliés, les
          hanches reculent, le buste bascule jusqu'à ce que les mains soient à la hauteur voulue.
       Les postures sont réglées une fois, à quelques hauteurs de la charge (poses clés) ; le geste passe de l'une à l'autre. */
    const tendues = !!o.tendues, charn = !!(o.roumain || tendues || o.poulie || o.charniere || o.unejambe || o.bstance || o.ceinture);
    const N = 10, cles = [];
    if (o.deficit) for (const s of sumo ? [1, -1] : [0]) fixe.push(pret(boite(sumo ? 0.34 : 0.7, y0, 0.45, s * ecart, y0 / 2, z0 + 0.04, C.banc, 0)));
    if (o.blocs) for (const s of [1, -1]) fixe.push(pret(boite(0.3, 0.5 - 0.225, 0.4, s * 0.6, (0.5 - 0.225) / 2, 0.2, C.banc, 0)));
    // La prise : barre et haltères paumes vers l'arrière ; barre hexagonale et corde paumes face à face.
    const neutre = !!(o.trapbar || o.poulie), xMain = o.trapbar ? 0.32 : o.kb ? 0.05 : o.poulie ? 0.05 : o.hal ? 0.2 : sumo ? 0.2 : 0.27;
    const xP = xMain + (neutre ? L.creux : 0), zP = neutre ? 0 : L.creux;   // du centre de la prise au poignet
    const prises = (p, y, z) => { for (const [kk, s] of COTES) p.bras[kk] = { prise: V(s * xMain, y, z), pole: V(s * 0.3, 0, -1), paume: neutre ? V(-s, 0, 0) : V(0, 0, -1), dirMain: V(0, -1, 0), doigts: 'barre' }; return p; };
    // La charge contre les jambes : la barre les longe, les haltères passent devant de la largeur d'une tête.
    const marge = o.hal ? 0.067 : rayon + 0.004;
    // Le devant des jambes à la hauteur y, plus la marge : on ne relit que la peau qui peut s'y trouver.
    const yGenou = y0 + L.chevilleH + L.jambe;
    const symetrique = !(o.unejambe || o.bstance);   // les deux jambes font la même chose : une seule se relit
    const contact = (p, y) => c.devantJambes(p, y - 0.03, y + 0.03, y < yGenou - 0.13 ? ['jambe'] : y > yGenou + 0.13 ? ['cuisse', 'bassin'] : ['cuisse', 'jambe'], symetrique) + marge;
    // En haut : la charge pend bras tendus — contre les cuisses à sa hauteur, sur les côtés (barre hexagonale) ou devant
    // le bassin. (Deux temps : sa hauteur dépend un peu de son avancée, et son avancée du devant des cuisses à sa hauteur.)
    const eHaut = c.tronc(haut).epaules.G;
    const chuteDe = av => Math.sqrt(Math.max(1e-4, portee * portee - av * av - Math.pow(xP - eHaut.x, 2)));
    let zHaut = o.trapbar ? z0 + 0.035 : o.kb || o.poulie ? z0 + 0.09 : c.devantJambes(haut, 0.6 + y0, 1.0 + y0, ['cuisse', 'bassin'], true) + marge;
    if (!(o.trapbar || o.kb || o.poulie)) zHaut = contact(haut, eHaut.y - chuteDe(eHaut.z - zHaut - zP) - L.main);
    const avHaut = eHaut.z - zHaut - zP, yHaut = eHaut.y - chuteDe(avHaut) - L.main;
    if (!charn) {
      /* Depuis le sol. La pose qui tient les poignets en (y, z), bras tendus, les épaules avancées de `av` sur eux, le
         tibia incliné de `tibia` degrés : plus le buste se penche, plus les hanches reculent et montent, plus le tibia
         part en arrière — le penché se trouve par dichotomie. */
      const tenir = (y, z, av, tibia, k) => {
        const essai = pen => {
          const p = base(pen, k), t = c.tronc(p), e = t.epaules.G, dz = z + av - e.z, dy = y + chuteDe(av) - e.y;
          const j = p.jambes.G, h = t.hanches.G.clone().add(V(0, dy, dz)), g = ik2(h, j.cheville, L.cuisse, L.jambe, j.pole).milieu;
          p.bassin.pos.y += dy; p.bassin.pos.z += dz;
          return { p, tibia: Math.atan2(g.z - j.cheville.z, g.y - j.cheville.y) * DEG };
        };
        let a = -8, b = 100;
        for (let n = 0; n < 13; n++) { const m = (a + b) / 2; if (essai(m).tibia > tibia) a = m; else b = m; }
        return essai((a + b) / 2).p;
      };
      // Le déroulé, repéré par la hauteur de la charge : 0 au sol (disques de 45 cm posés), 1 debout.
      const ySol = o.trapbar ? 0.285 : o.kb ? 0.273 : 0.225;                     // hauteur de la prise, charge posée au sol
      // Où commence le geste : au sol ; sur des blocs ; à mi-tibia pour des haltères ; pieds écartés sur deux marches, le
      // kettlebell descend entre elles, plus bas que les pieds, sans toucher le sol (c'est un squat sumo).
      const yBas = o.blocs ? 0.5 : o.hal ? y0 + 0.26 : o.kb && sumo && o.deficit ? y0 + 0.25 : ySol;
      const hDe = y => (y - y0 - ySol) / (yHaut - y0 - ySol), hGenou = hDe(y0 + L.chevilleH + L.jambe + 0.02);
      // Le tibia : avancé au départ (plus encore sans barre devant lui), droit au passage des genoux — une courbe par
      // trois points (au sol, aux genoux, debout). Plus bas que le sol (pieds surélevés), il n'avance pas davantage.
      const parTrois = (a, b, cc) => h => a * (h - hGenou) * (h - 1) / hGenou + b * h * (h - 1) / (hGenou * (hGenou - 1)) + cc * h * (h - hGenou) / (1 - hGenou);
      const tibia3 = parTrois(o.trapbar ? 9 : o.kb ? (sumo ? 14 : 10) : sumo ? 3 : 6, o.trapbar ? 5 : o.kb ? (sumo ? 6 : 4) : 0, tibiaHaut);
      // Une fois la barre passée au-dessus des genoux, ils reviennent un peu sous elle (4° de tibia au milieu de la
      // montée) : les cuisses la rejoignent, elle remonte contre elles.
      const sousBarre = o.trapbar || o.kb ? 0 : 4;
      const tibiaA = h => tibia3(Math.max(0, h)) + (h > hGenou && h < 1 ? sousBarre * Math.pow(Math.sin(Math.PI * (h - hGenou) / (1 - hGenou)), 2) : 0);
      // Les épaules : un peu en avant de la charge au départ, au-dessus quand elle passe les genoux, et elles n'en
      // reculent qu'à la fin, quand les hanches viennent sous elles. Pieds surélevés : plus en avant encore (dos plus couché).
      const av0 = o.trapbar ? 0 : sumo || o.kb ? 0.03 : 0.05, avG = o.trapbar ? -0.01 : o.kb ? 0 : sumo ? 0.02 : 0.03;
      const avA = h => (h <= 0 ? av0 - 0.15 * h : h <= hGenou ? lerp(av0, avG, h / hGenou) : avG + (avHaut - avG) * Math.pow((h - hGenou) / (1 - hGenou), 2.2));
      const zLibre = h => (o.trapbar ? zHaut : lerp(z0 + 0.05, zHaut, borne(h, 0, 1)));   // kettlebell : d'entre les pieds au devant du bassin
      // Le chemin de la charge : au-dessus du milieu du pied, puis, dans la moitié haute, il rejoint en douceur l'endroit où
      // elle pend debout, contre les cuisses. Les jambes ne le traversent jamais : là où elles avancent plus, elle les longe.
      const zChemin = h => lerp(0.045, Math.max(0.045, zHaut), lisse((h - 0.6) / 0.4));
      let z = 0;
      for (let i = 0; i <= N; i++) {
        const y = lerp(yBas, yHaut, i / N), h = hDe(y), k = 1 - borne(h, 0, 1), tib = borne(tibiaA(h), -6, 20);
        let p;
        if (i === N) { p = cloner(haut); z = zHaut; }
        else if (o.trapbar || o.kb) { z = zLibre(h); p = tenir(y + L.main, z + zP, avA(h), tib, k); }
        else {
          const zc = zChemin(h); let av = avA(h);
          p = tenir(y + L.main, zc + zP, av, tib, k);
          let devant = contact(p, y);
          if (devant > zc + 0.002) { z = devant; p = tenir(y + L.main, z + zP, av, tib, k); }      // les jambes avancent plus : elle les longe
          else if (h > hGenou && zc - devant > 0.006) {
            // Au-dessus des genoux, la charge ne flotte pas devant les cuisses : les épaules avancent d'autant, les
            // hanches et les cuisses avec elles, et les genoux se tendent un peu plus tôt (la barre remonte contre les cuisses).
            // (La cuisse n'avance que d'une part de ce dont avancent les épaules : on en demande davantage, sans que les
            // bras partent de plus de 11 cm en arrière.)
            av = Math.min(0.11, av + 1.7 * (zc - devant)); p = tenir(y + L.main, zc + zP, av, tib, k); devant = contact(p, y); z = Math.max(zc, devant);
          } else z = zc;
        }
        cles.push([i / N, prises(p, y, z)]);
      }
      d.cles = cles;
      if (o.hal) d.tenu = [{ t: 'haltere', m: 'GD' }];
      else if (o.kb) d.tenu = [{ t: 'kb', m: 'GD', entre: true }];
      else if (o.trapbar) d.objets = barreHexagonale(C);
      else d.tenu = [{ t: 'barre', l: sumo ? 1.84 : 1.6, d: 0.225 }];   // sumo : barre plus longue, les disques passent en dehors des pieds
      return d;
    }
    /* En charnière. Les jambes d'abord (tibia et genou voulus à chaque hauteur), puis le buste bascule jusqu'à ce que les
       poignets, bras tendus, soient à la hauteur y : contre les jambes (z donné) ou pendus sous les épaules, reculés de
       `av` (z omis). */
    const sansCharge = !!(o.charniere || o.ceinture || (o.poulie && !o.roumain));
    // En bas : jambes presque tendues et à peine reculées (jambes tendues, sur une jambe) ; sinon genoux souples, et les
    // hanches reculent franchement quand une charge doit rester contre les jambes (les bras ne partent pas en arrière).
    const tibiaB = tendues ? -8 : o.unejambe ? -4 : sansCharge ? -7 : -9, genouB = tendues ? 9 : o.unejambe ? 14 : o.poulie && !o.roumain ? 28 : sansCharge ? 24 : 32;
    const jambesA = g => ({ tibia: lerp(jHaut.tibia, tibiaB, g), genou: lerp(jHaut.genou, genouB, g) });
    const pencher = (y, z, av, g) => {
      const jb = jambesA(g);
      const essai = pen => { const p = base(pen, g), t = c.tronc(p), dp = calage(p, t, jb.tibia, jb.genou), e = t.epaules.G; p.bassin.pos.y += dp.y; p.bassin.pos.z += dp.z; return { p, manque: z != null ? Math.hypot(xP - e.x, e.y + dp.y - y, e.z + dp.z - z) - portee : e.y + dp.y - y - chuteDe(av) }; };
      return essai(premierZero(pen => essai(pen).manque, 0, 112, 8)).p;
    };
    // L'autre jambe : en arrière dans le prolongement du buste (sur une jambe), ou posée sur la pointe en retrait.
    const autreJambe = (p, g) => {
      if (o.unejambe) { p.jambes.D = J(-8 * g, 2, 0, 8 * g + 84 * Math.sin(Math.PI * g) * (g < 0.5 ? 1 : 2 * (1 - g)), 30 * Math.max(0, g - 0.4) / 0.6); p.bassin.pos.x += 0.06 * g; }
      else if (o.bstance) p.jambes.D = pied(c, -1, { ecart: 0.14, z: z0 - 0.26, pointe: 45, ouv: 6 });
      return p;
    };
    if (sansCharge) {
      // Au poids du corps, à la ceinture, ou la corde tirée entre les jambes : le buste bascule d'un angle voulu.
      const penB = o.poulie ? 62 : 66;
      for (let i = 0; i <= N; i++) {
        const g = i / N, jb = jambesA(g), p = autreJambe(i ? caler(base(lerp(2, penB, g), g), jb.tibia, jb.genou) : cloner(haut), g), t = c.tronc(p);
        if (o.poulie) {
          // La corde passe entre les cuisses : les mains la tiennent sous le bassin, bras tendus, et reculent avec lui.
          for (const [kk, s] of COTES) { const e = t.epaules[kk], cible = t.duBassin(V(s * xMain, -0.2, 0.04)), v = cible.clone().sub(e), l = v.length(), lMax = (L.bras + L.prise) * 0.975; if (l > lMax) cible.copy(e).add(v.multiplyScalar(lMax / l)); p.bras[kk] = { prise: cible, pole: V(s * 0.3, 0, -1), paume: V(-s, 0, 0), dirMain: V(0, -1, 0).applyQuaternion(t.qThorax), doigts: 'barre' }; }
        } else p.bras = mains(c, t, 'hanches');
        cles.push([g, p]);
      }
      d.cles = cles;
      if (o.poulie) { const anc = V(0, 0.15, -1.1); d.tenu = [{ t: 'cable', de: anc, bout: 'corde' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
      else if (o.ceinture) d.objets = (info, u, sortie) => { const b = info.bassin; sortie.push(pret(seg(V(0, b.y - 0.1, b.z + 0.05), V(0, 0.15, 0.05), 0.008, C.cadre, 0.6))); };
      return d;
    }
    // Avec une charge : elle descend contre les jambes tant que les bras ne partent pas trop en arrière ; au-delà elle
    // s'en écarte et pend sous les épaules (jambes tendues, sur une jambe). Le kettlebell part de devant le bassin ; la
    // corde d'une poulie basse, devant soi, tire les mains vers l'avant ; la barre guidée monte et descend droit.
    const yBas = (tendues ? 0.3 : 0.43) + y0, avMax = o.smith ? Infinity : tendues ? 0.12 : o.poulie ? -0.02 : o.unejambe ? 0.08 : o.kb ? 0.06 : 0.13;
    const zFixe = o.smith || o.kb || o.poulie;
    // Contre les jambes : elle les suit quand les hanches reculent, sans passer en arrière du pied (2 cm devant la cheville).
    const contre = (p, y) => Math.max(z0 + 0.02, contact(p, y));
    let z = zHaut;
    for (let i = 0; i <= N; i++) {
      const g = i / N, y = lerp(yHaut, yBas, g);
      let p = cloner(haut);
      if (i) {
        // Les jambes ne dépendent pas du buste : leur devant à cette hauteur se lit sur une première pose, puis le buste
        // bascule jusqu'à ce que les mains tiennent la charge là.
        if (!zFixe) { p = pencher(y + L.main, z + zP, 0, g); z = contre(p, y); }
        p = pencher(y + L.main, (zFixe ? zHaut : z) + zP, 0, g);
        const zc = zFixe ? zHaut : z, e = c.tronc(p).epaules.G;
        if (e.z - zc - zP > avMax) { p = pencher(y + L.main, null, avMax, g); z = Math.max(zc, c.tronc(p).epaules.G.z - avMax - zP); } else z = zc;
      }
      cles.push([g, prises(autreJambe(p, g), y, z)]);
    }
    d.cles = cles;
    if (o.hal) d.tenu = [{ t: 'haltere', m: 'GD' }];
    else if (o.kb) d.tenu = [{ t: 'kb', m: 'GD', entre: true }];
    else if (o.poulie) { const anc = V(0, 0.15, 1.15); d.tenu = [{ t: 'cable', de: anc, bout: 'corde' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }   // soulevé roumain à la poulie : elle est devant
    else { d.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.225 }]; if (o.smith) fixe.push(...poseFixe(MAT.smith(C, zHaut))); }
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

  /* Bras de levier d'une machine de jambes : il pivote dans l'axe des genoux et porte un boudin contre les chevilles
     (sens = -1 : devant le tibia, pour l'extension ; +1 : derrière, pour le curl). */
  function levierGenou(C, info, cotes, sens, sortie) {
    const moy = pts => pts.reduce((a, b) => a.add(b), V()).multiplyScalar(1 / pts.length);
    const g = moy(cotes.map(k => info.genoux[k])), ch = moy(cotes.map(k => info.chevilles[k])), dj = unite(ch.clone().sub(g));
    // Le devant du tibia : perpendiculaire à la jambe, du côté des orteils.
    let dev = perp(info.orteils[cotes[0]].clone().sub(info.chevilles[cotes[0]]).setX(0), dj); if (dev.lengthSq() < 1e-6) dev = perpendiculaire(dj); dev.normalize();
    const pp = ch.clone().add(dev.clone().multiplyScalar(-sens * 0.09)).add(dj.clone().multiplyScalar(-0.03)), l = cotes.length > 1 ? 0.44 : 0.2;
    poserObjet(MAT.coussin(C, l, 0.052), pp, null, sortie);
    for (const s of cotes.length > 1 ? [1, -1] : [cotes[0] === 'G' ? 1 : -1]) {
      const x = cotes.length > 1 ? s * 0.26 : g.x + s * 0.13, pivot = V(x, g.y, g.z);
      sortie.push(pret(tube(pivot, V(x, pp.y, pp.z), 0.035, C.cadre)));
      sortie.push(pret(cyl(0.05, 0.03, x, g.y, g.z, C.cadre, 0.5, null, 0.008)));
    }
  }
  /* Le bâti d'une machine où l'on est assis (extension, curl assis) : la pile de poids derrière le dossier, une poutre
     au sol, une poignée sous chaque main ; la pile monte avec le mouvement. */
  function machineAssise(c, C, d, fixe, h, dossier) {
    const i0 = c.poser(d.a), zP = i0.tete.z - 0.5;
    fixe.push(...poseFixe(deplacer(bati(C, 1.45, 0), V(0, 0, zP))), pret(tube(V(0, 0.03, zP), V(0, 0.03, 0.2), 0.05, C.cadre)));
    for (const k of ['G', 'D']) { const pr = i0.prises[k]; fixe.push(...poserObjet(MAT.poignee(C, 0.12), pr, LONG_Z, []), pret(tube(V(pr.x, pr.y, pr.z - 0.07), V(pr.x * 0.6, h - 0.1, pr.z - 0.12), 0.03, C.cadre))); }
    d.levee = (info, u) => 0.28 * u;
  }

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
      // Le siège est fixe ; le chariot (plateau, traverse, disques) suit les pieds le long de deux rails.
      if (!o.verticale) fixe.push(...poseFixe(MAT.banc(C, dossier, 0.3, 0.8, 0.34)));
      const plateau = info => info.chevilles.G.clone().setX(0).add(r.clone().multiplyScalar(L.chevilleH + 0.03)).add(e.clone().multiplyScalar(0.06));
      const P0 = plateau(c.poser(d.pose(0))), qPl = arc(AY, r), bas = P0.clone().add(e.clone().multiplyScalar(-0.27));
      const sMin = ang > 5 ? (0.07 - bas.y) / r.y : -0.45, sMax = course + 0.5, xR = 0.39;
      for (const s of [1, -1]) {
        const a = bas.clone().add(r.clone().multiplyScalar(sMin)).setX(s * xR), b = bas.clone().add(r.clone().multiplyScalar(sMax)).setX(s * xR);
        fixe.push(pret(tube(a, b, 0.055, C.cadre)));
        if (ang < 80) { fixe.push(pret(tube(V(b.x, 0.03, b.z), b, 0.055, C.cadre))); if (ang <= 5) fixe.push(pret(tube(V(a.x, 0.03, a.z), a, 0.055, C.cadre))); }
        fixe.push(...poseFixe(patin(C, V(s * xR, 0.028, Math.min(a.z, b.z) - 0.08), V(s * xR, 0.028, Math.max(a.z, b.z) + 0.08), 0.05)));
      }
      { const b = bas.clone().add(r.clone().multiplyScalar(sMax)); fixe.push(Object.assign(pret(tube(V(-xR, b.y, b.z), V(xR, b.y, b.z), 0.055, C.cadre)), { hors: 1 })); }
      d.objets = (info, u, sortie) => {
        const m = plateau(info), tr = m.clone().add(e.clone().multiplyScalar(-0.27)).add(r.clone().multiplyScalar(0.035));
        sortie.push(pret(boite(0.62, 0.035, 0.46, m.x, m.y, m.z, C.fonte, 0.3, qPl, 0.012)));
        sortie.push(pret(tube(tr.clone().setX(-xR - 0.05), tr.clone().setX(xR + 0.05), 0.05, C.cadre)));
        sortie.push(pret(tube(tr, m.clone().add(r.clone().multiplyScalar(0.03)), 0.04, C.cadre)));
        if (ang === 45) for (const s of [1, -1]) poserObjet(MAT.disque(C, 0.2), tr.clone().setX(s * (xR + 0.11)), null, sortie);
      };
      d.vue = { az: 66, el: 12 }; return d;
    }
    if (o.extension) {
      const base = allonge(c, { h: 0.58, angle: 76, jambes: J(74, 5, 0, 92, 0), lomb: 0, thor: 0, cou: 0 });
      fixe.push(...poseFixe(MAT.banc(C, 76, 0.58)));
      const cle = u => { const p = cloner(base); for (const k of ['G', 'D']) { p.jambes[k] = J(74, 5, 0, lerp(94, 6, u), -10 * u); p.bras[k] = B(80, 14, 0, 35, 90); } if (o.uni) p.jambes.D = J(74, 5, 0, 92, 0); return p; };
      d.a = cle(0); d.b = cle(1);
      d.objets = (info, u, sortie) => levierGenou(C, info, o.uni ? ['G'] : ['G', 'D'], -1, sortie);
      machineAssise(c, C, d, fixe, 0.58, 76);
      return d;
    }
    if (o.curl) {
      if (o.nordique || o.ghr) {
        // À genoux, chevilles tenues : le corps descend d'un bloc vers l'avant, retenu par les ischios, puis remonte.
        // Les genoux ne bougent pas (c'est le pivot) et les tibias restent à plat : cuisses et buste basculent ensemble.
        const h0 = o.ghr ? 0.55 : 0, p0 = aGenoux(c, { flex: 0, penche: 0 });
        c.poserSur(p0, V(0, h0, 0), AY, ['jambe', 'pied']);
        const milieuGenoux = p => { const g = c.poser(p).genoux; return g.G.clone().add(g.D).multiplyScalar(0.5); }, K = milieuGenoux(p0);
        const cle = u => { const p = cloner(p0), a = lerp(0, o.ghr ? 74 : 62, u); p.bassin.rot = qX(a); p.jambes = pareil(J(0, 6, 0, 90 - a, 62)); p.bassin.pos.add(K.clone().sub(milieuGenoux(p))); p.lombaires = -2; p.cou = -14 * u; p.bras = pareil(B(4, 30 + 40 * u, 0, 100 - 20 * u, 150, { doigts: 'plat' })); return p; };
        d.cles = [0, 0.25, 0.5, 0.75, 1].map(u => [u, cle(u)]); d.vue = { az: 70, el: 8 };
        const pz = c.poser(cle(0)).chevilles.G;
        // Le boudin retient les jambes juste au-dessus des chevilles (pas sur le talon).
        if (o.ghr) fixe.push(pret(boite(0.45, 0.08, 0.4, 0, 0.51, pz.z + 0.5, C.banc, 0)), pret(cyl(0.05, 0.45, 0, pz.y + 0.105, pz.z + 0.08, C.banc, 0)), pret(boite(0.5, 0.5, 0.06, 0, 0.25, pz.z + 0.3, C.cadre, 0.5)));
        else fixe.push(pret(cyl(0.045, 0.45, 0, pz.y + 0.1, pz.z + 0.08, C.banc, 0)));
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
        const base = allonge(c, { h: 0.6, angle: 76, jambes: J(74, 5, 0, 12, 0), lomb: 0, thor: 0, cou: 0 });
        fixe.push(...poseFixe(MAT.banc(C, 76, 0.6)));
        const cle = u => { const p = cloner(base); for (const k of ['G', 'D']) { p.jambes[k] = J(74, 5, 0, lerp(10, 104, u), 0); p.bras[k] = B(80, 14, 0, 35, 90); } if (o.uni) p.jambes.D = J(74, 5, 0, 10, 0); return p; };
        d.a = cle(0); d.b = cle(1);
        d.objets = (info, u, sortie) => { levierGenou(C, info, o.uni ? ['G'] : ['G', 'D'], 1, sortie); const g = info.genoux.G.clone().add(info.genoux.D).multiplyScalar(0.5); poserObjet(MAT.coussin(C, 0.44, 0.05), V(0, g.y + 0.11, g.z - 0.1), null, sortie); };
        machineAssise(c, C, d, fixe, 0.6, 76);
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
      else {
        // La machine : le boudin derrière les chevilles sur son bras de levier, deux poignées sous la tête, la pile de poids.
        d.objets = (info, u, sortie) => levierGenou(C, info, o.uni ? ['G'] : ['G', 'D'], 1, sortie);
        const i0 = c.poser(d.a), zT = i0.tete.z + 0.75;
        fixe.push(...poseFixe(deplacer(bati(C, 1.4, 0), V(0, 0, zT), qY(180))), pret(tube(V(0, 0.03, i0.bassin.z), V(0, 0.03, zT), 0.05, C.cadre)));
        for (const k of ['G', 'D']) { const pr = i0.prises[k]; fixe.push(...poserObjet(MAT.poignee(C, 0.12), pr, LONG_Z, []), pret(tube(V(pr.x, pr.y, pr.z + 0.07), V(pr.x * 0.4, 0.5, pr.z + 0.1), 0.03, C.cadre))); }
        d.levee = (info, u) => 0.3 * u;
      }
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
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; if (o.disque) d.tenu = [{ t: 'disque', m: 'GD', r: 0.14, axe: 'buste' }];
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
      const cle = u => { const p = assis(c, { h: H_SIEGE, zPieds: 0.42, yPieds: 0.08, pointe: 36 * u, ecart: 0.11, ouv: 4 }); const t = c.tronc(p); if (o.uni) p.jambes.D = pied(c, -1, { x: -0.2, z: p.bassin.pos.z + 0.6, ouv: 10 }); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.16, p.jambes.G.cheville.y + L.jambe + 0.1, p.bassin.pos.z + 0.4), pole: V(s * 1, 0, -0.5), paume: V(0, -1, 0), doigts: 'barre' }; return p; };
      d.pose = cle; fixe.push(...poseFixe(MAT.siege(C, H_SIEGE)), pret(boite(0.46, 0.08, 0.24, 0, 0.04, 0.63, C.fonte, 0.3, null, 0.012)), pret(tube(V(0, 0.03, 0.2), V(0, 0.03, 0.95), 0.05, C.cadre)), pret(tube(V(0, 0.03, 0.95), V(0, 0.62, 0.95), 0.055, C.cadre)));
      d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().add(o.uni ? info.genoux.G : info.genoux.D).multiplyScalar(0.5); if (o.hal) poserObjet(MAT.haltere(C, 1.2), g.clone().add(V(0, 0.138, -0.05)), null, sortie); else if (o.barre || o.smith) poserObjet(MAT.barre(C, 1.6, 0.18), g.clone().add(V(0, 0.085, -0.05)), null, sortie); else sortie.push(pret(cyl(0.05, 0.42, g.x, g.y + 0.118, g.z - 0.05, C.banc, 0))); };
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
    if (o.machine) {
      // Machine à mollets debout : le bâti derrière soi, deux bras jusqu'aux épaulières ; la pile monte avec les talons.
      const zT = z0 - 0.78;
      fixe.push(...poseFixe(horsCadre(deplacer(bati(C, 1.95, 0), V(0, 0, zT)))), pret(tube(V(0, 0.03, zT), V(0, 0.03, z0 + 0.1), 0.05, C.cadre)));
      d.objets = (info, u, sortie) => { for (const k of ['G', 'D']) { const e = info.epaules[k]; sortie.push(pret(coussin(0.15, 0.065, 0.2, e.x, e.y + 0.095, e.z, C))); sortie.push(pret(tube(V(e.x, e.y + 0.1, e.z - 0.08), V(e.x * 0.9, e.y + 0.02, zT + 0.04), 0.04, C.cadre))); } };
      d.levee = (info, u) => 0.12 * u;
    }
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
      const base = allonge(c, { h: 0.5, angle: 76, jambes: J(74, ferme, 0, 88, 0), lomb: 0, thor: 0, cou: 0 });
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
    const poids = () => { if (o.leste || o.tendus) d.tenu = [{ t: 'disque', m: 'GD', r: 0.13, axe: o.tendus ? AX : 'buste' }]; };
    if (o.vacuum) {
      const cle = u => { const p = debout(c, { penche: 6, ecart: 0.1 }); p.lombaires = 4 + 6 * u; p.thorax = 3 * u; p.bras = mains(c, c.tronc(p), 'hanches'); return p; };
      d.a = cle(0); d.b = cle(1); d.rythme = 'tenue'; d.vue = { az: 60, el: 8 }; return d;
    }
    if (o.machine) {
      // Assis à la machine : les mains tiennent les poignées près de la tête, le buste s'enroule vers les genoux.
      const base = assis(c, { h: H_SIEGE, zPieds: 0.36 });
      const cle = u => { const p = cloner(base); p.lombaires = 34 * u; p.thorax = 22 * u; p.cou = 10 * u; p.bras = pareil(B(20, 120, 20, 120, 90)); return p; };
      d.a = cle(0); d.b = cle(1); fixe.push(...poseFixe(MAT.siege(C, H_SIEGE, 0.55, 4))); d.vue = { az: 66, el: 10 };
      d.tenu = [{ t: 'levier', de: () => V(0.2, 1.75, -0.15), m: 'G' }, { t: 'levier', de: () => V(-0.2, 1.75, -0.15), m: 'D' }]; return d;
    }
    if (o.poulie || o.elas) {
      // La corde tenue de part et d'autre de la tête : le buste s'enroule, les hanches ne bougent presque pas.
      const sorte = o.debout ? 'debout' : o.assis ? 'assis' : 'genoux';
      const base = sorte === 'debout' ? debout(c, { ecart: 0.12 }) : sorte === 'assis' ? assis(c, { h: H_BANC }) : aGenoux(c, { penche: 8 });
      if (sorte === 'assis') fixe.push(...bancAssis(C));
      const dos = o.debout || o.assis;                          // dos à la poulie (debout, assis) ou face à elle (à genoux)
      const cle = u => { const p = cloner(base); p.lombaires = (sorte === 'genoux' ? 44 : 34) * u; p.thorax = 24 * u; p.cou = 8 * u; if (o.lateral) { p.lombaires = 6 * u; p.thorax = 0; p.inclinaison = 30 * u; } if (o.torsion) p.torsion = 34 * u; if (sorte === 'genoux' && !o.lateral) { p.bassin.rot = qX(8 + 16 * u); p.jambes = pareil(J(8 + 16 * u + 14 * u, 6, 0, 90 + 14 * u, 62)); } const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax), dC = (x, y, z) => V(x, y, z).applyQuaternion(t.qTete); /* les poings de part et d'autre du front, à hauteur des tempes : ils suivent la tête, les épaules restent basses */ for (const [k, s] of COTES) p.bras[k] = { prise: t.tete.clone().add(dC(s * 0.12, 0.105, dos ? 0.0 : 0.075)), pole: dT(s * 1, -0.6, 0.3), paume: dC(-s, 0, 0), dirMain: dC(0, 1, dos ? -0.2 : 0.25), doigts: 'barre', ceinture: 0.1 }; return p; };
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
      const cle = u => { const recul = o.vsit ? lerp(62, 32, u) : o.genoux ? lerp(48, 28, u) : 40, p = assisSol(c, { recul, jambes: J(lerp(o.vsit ? 30 + 62 : 50 + recul - 10, o.vsit ? 78 + 32 : 96 + recul, u) - 0, 4, 0, lerp(o.vsit ? 4 : 14, o.vsit ? 4 : 110, u), 25), lomb: 10 + 10 * u, thor: 6 }); if (o.assisJambes) p.jambes = pareil(J(lerp(50, 96, u) + 40, 4, 0, 4, 25)); c.poserSur(p, V(), AY, ['bassin']); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = o.vsit ? B(4, 60, 0, 8, 90, { doigts: 'detendu' }) : { prise: V(s * 0.2, 0, p.bassin.pos.z - 0.17), pole: V(s * 0.5, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; d.vue = { az: 112, el: 14 };
      if (o.alt) { d.rythme = 'alt'; d.alterne = ['jambes']; d.a = cle(0); d.b = cle(1); delete d.cles; }   // une jambe puis l'autre
      if (o.battements) { d.rythme = 'continu'; d.periode = 1.3; const P0 = cle(0.5); delete d.cles; d.pose = ph => { const p = cloner(P0), sn = Math.sin(ph * 2 * Math.PI); p.jambes = { G: J(94 + 10 * sn, 4, 0, 6, 25), D: J(94 - 10 * sn, 4, 0, 6, 25) }; return p; }; }
      if (o.cercles) { d.rythme = 'continu'; d.periode = 2.6; const P0 = cle(0.5); d.pose = ph => { const p = cloner(P0), w = ph * 2 * Math.PI; p.jambes = pareil(J(118 + 18 * Math.cos(w), 4 + 0 * w, 0, 30, 25)); p.jambes.G.abd = 4 + 14 * Math.sin(w); p.jambes.D.abd = 4 - 14 * Math.sin(w); return p; }; }
      return d;
    }
    // Couché sur le dos : par terre, sur banc décliné ou incliné, ou sur un ballon.
    const ang = o.decline ? -24 : o.incline ? 26 : 0, h = ang ? 0.44 : 0;
    if (ang) fixe.push(...poseFixe(MAT.banc(C, ang)));
    const coucher = jb => allonge(c, { h, angle: ang, jambes: jb || (ang < 0 ? 'sol' : 'plies'), lomb: 0, thor: 0, cou: 6, d: ang < 0 ? -0.2 : ang > 0 ? 0.25 : -0.2 });   // décliné : genoux et chevilles dans les boudins
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
        else {
          p.jambes.G = J(lerp(90, 14, g), 3, 0, lerp(90, 6, g), 20); p.jambes.D = J(lerp(90, 14, dr), 3, 0, lerp(90, 6, dr), 20);
          if (o.balle) { const t = c.tronc(p), e = t.epaules.G; for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.108, e.y + 0.54, e.z + 0.02), pole: V(s, 0, 0.35), paume: V(-s, 0, 0), dirMain: V(0, 1, 0), doigts: 'plat' }; }
          else { p.bras.D = B(0, lerp(92, 172, g), 0, 6, 90, { doigts: 'detendu' }); p.bras.G = B(0, lerp(92, 172, dr), 0, 6, 90, { doigts: 'detendu' }); }
        }
        return p;
      };
      if (o.balle) d.tenu = [{ t: 'balle', m: 'GD', r: 0.11 }];   // le ballon tenu au-dessus de la poitrine, bras tendus
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
    // Pendu à la barre, les mains ne bougent pas : quoi que fasse le bassin, les épaules restent sous la barre, bras
    // tendus, mains dessus. Le bassin bascule et le bas du dos s'enroule ; en vrille, ce sont le bassin et les jambes
    // qui tournent sous des épaules qui restent face à la barre.
    const pendu = !o.chaise && !o.paralleles, surBarre = { G: V(0.3, H, 0), D: V(-0.3, H, 0) };
    const milieu = t => t.epaules.G.clone().add(t.epaules.D).multiplyScalar(0.5), m0 = pendu ? milieu(c.tronc(base)) : null;
    const sousLaBarre = p => { p.bassin.pos.add(m0.clone().sub(milieu(c.tronc(p)))); return tendre(c, p, V(0, -1, 0), null, null, surBarre); };
    const vriller = (p, deg) => { p.torsion = deg; if (pendu && deg) { p.bassin.rot = qY(-deg).multiply(p.bassin.rot); sousLaBarre(p); } return p; };
    const curl = k => { const p = cloner(base); if (pendu) { p.bassin.rot = qX(-34 * k); p.lombaires = 26 * k; if (k) sousLaBarre(p); } else p.lombaires = 14 * k; return p; };
    const cle = u => {
      if (o.barre) { const p = curl(u); p.jambes = pareil(J(lerp(8, 128, u), 2, 0, 5, 20)); return p; }
      if (o.coudes) { const p = curl(u * 0.9); p.jambes = pareil(J(lerp(8, 128, u), 4, 0, lerp(12, 118, u), 20)); return p; }
      if (o.garhammer) { const p = curl(u * 0.7); p.jambes = pareil(J(lerp(88, 132, u), 3, 0, lerp(92, 110, u), 20)); return p; }
      if (o.jambes) { const p = curl(u * 0.25); p.jambes = pareil(J(lerp(8, 94, u), 2, 0, 5, 25)); return p; }
      if (o.oblique) { const p = curl(u * 0.4); p.jambes = pareil(J(lerp(8, 100, u), 3, 0, lerp(12, 104, u), 25)); return vriller(p, -34 * u); }
      const p = curl(u * 0.35); p.jambes = pareil(J(lerp(8, o.poitrine ? 122 : 98, u), 3, 0, lerp(12, o.poitrine ? 118 : 100, u), 25)); return p;
    };
    if (o.lsit) { d.a = cle(1); const b = cle(1); b.jambes = pareil(J(96, 2, 0, 5, 25)); d.a.jambes = pareil(J(94, 2, 0, 5, 25)); d.b = b; d.rythme = 'tenue'; }
    else if (o.ciseaux || o.cercles || o.moulinet) {
      d.rythme = 'continu'; d.periode = o.ciseaux ? 1.3 : 2.6; const P0 = curl(0.2);
      // Le buste qui vrille déplace les épaules sous la barre : les poses sont réglées d'avance pour cinq vrilles (bras
      // tendus, mains sur la barre), et le mouvement passe de l'une à l'autre.
      const vrille = o.cercles ? 26 : o.moulinet ? 40 : 0;
      const vrilles = vrille && pendu ? [-1, -0.5, 0, 0.5, 1].map(x => [x, vriller(cloner(P0), vrille * x)]) : null;
      d.pose = ph => { const w = ph * 2 * Math.PI, sn = Math.sin(w), cs = Math.cos(w), p = cloner(vrilles ? chemin(vrilles, sn) : P0); if (o.ciseaux) { p.jambes.G = J(40 + 26 * sn, 3, 0, 5, 25); p.jambes.D = J(40 - 26 * sn, 3, 0, 5, 25); } else if (o.cercles) { p.jambes = pareil(J(84 + 16 * cs, 3, 0, 96, 25)); if (!vrilles) p.torsion = 26 * sn; } else { p.jambes = pareil(J(80, 3, 0, 5, 25)); if (!vrilles) p.torsion = 40 * sn; p.jambes.G.abd = 3 + 22 * sn; p.jambes.D.abd = 3 - 22 * sn; } return p; };
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
        // Bras tendus jusqu'à la roue : sa place se règle sur le corps posé (l'épaule suit le bras ; estimée depuis l'épaule
        // seule, elle laissait les coudes pliés à 60° corps allongé).
        const z0 = p.bras.G.prise.z, rouler = z => { for (const k of ['G', 'D']) p.bras[k].prise.z = z; return p; };
        const zR = coudeTendu(c, rouler, z0 - 0.04, z0 + 0.3, 12);
        rouler(zR != null ? zR : z0);
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
      let hautTendu = null;
      const cle = u => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(176) }, lombaires: -3, thorax: -2, cou: lerp(-6, -16, u), bras: {}, jambes: pareil(J(-2, 2, 0, 3, 40)) };
        const t = c.tronc(p); p.bassin.pos.y += lerp(hautTendu != null ? hautTendu : haut, 0.3, u) - t.epaules.G.y; p.bassin.pos.z += lerp(0, 0.05, u) - t.epaules.G.z;
        for (const [k, s] of COTES) p.bras[k] = aPlat(s, 0.26, 0, -L.main, V(0, 0, -1), V(s * 0.7, 0.2, lerp(-0.2, -1, u)));
        return p;
      };
      // En haut, bras tendus : la hauteur des épaules se règle sur le corps posé.
      { const p0 = cle(0); tendre(c, p0, V(0, 1, 0)); hautTendu = c.tronc(p0).epaules.G.y; }
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
    // Mains reculées vers la taille (pseudo-planche) ; en diamant, elles sont sous la poitrine, pas sous le visage :
    // en bas, les avant-bras restent dressés au lieu de se coucher au sol.
    const recul = o.pseudo ? 0.27 : o.diamant ? 0.12 : 0;
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
      const p = assis(c, { h: H_SIEGE, penche: 2 }), t = c.tronc(p);
      const cle = u => { const q = cloner(p); for (const [k, s] of COTES) q.bras[k] = { prise: V(s * 0.31, lerp(t.epaules.G.y - 0.27, t.epaules.G.y - 0.56, u), t.epaules.G.z + 0.03), pole: V(s * 0.3, 0.2, -1), paume: V(-s, 0, 0), doigts: 'barre' }; return q; };
      d.a = cle(0); d.b = cle(1);
      fixe.push(...poseFixe(MAT.siege(C, H_SIEGE, 0.6, 6)));
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
    const charge = (ecart) => (o.hal ? [{ t: 'haltere', m: 'GD', entre: true }] : o.balle ? [{ t: 'balle', m: 'GD', r: 0.11 }] : o.disque ? [{ t: 'disque', m: 'GD', r: 0.15, bord: true }] : o.kb ? [{ t: 'kb', m: 'GD', entre: true }] : []);

    if (o.russe) {
      // Assis, buste incliné en arrière, genoux fléchis : les mains (et la charge) passent d'une hanche à l'autre.
      const base = assisSol(c, { recul: 32, lomb: 14, thor: 8, jambes: o.leves ? J(98, 5, 0, 58, 10) : J(108, 5, 0, 109, 0) });
      base.cou = 12;
      d.rythme = 'continu'; d.periode = 2.6;
      d.pose = ph => { const p = cloner(base), sn = Math.sin(ph * 2 * Math.PI); p.torsion = 52 * sn; p.couRot = -14 * sn; if (o.barre) Object.assign(d, {}); mainsDevant(p, 0.3, -0.2, o.hal ? 0.09 : o.disque ? 0.138 : o.balle ? 0.1 : 0.03); return p; };
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
    const machine = !!o.machine, base = o.assis || machine ? assis(c, { h: machine ? H_SIEGE : H_BANC, ecart: 0.14 }) : o.genoux ? aGenoux(c, {}) : debout(c, { ecart: 0.19, ouv: 12, dy: -0.02 });
    if (o.assis && !machine) fixe.push(...bancAssis(C));
    if (machine) fixe.push(...poseFixe(MAT.siege(C, H_SIEGE, 0, 0)));
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
      p = assis(c, { h: H_BANC, penche: 34, ecart: 0.13 }); p.cou = -16; fixe.push(...bancAssis(C));
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
        // Tapis roulant : le plateau entre ses deux longerons, la bande (plus sombre), le capot du moteur à l'avant, deux
        // montants, la console inclinée vers le coureur et ses deux mains courantes gainées.
        const q = qX(-pente), pose = (f, x, y, z) => poserObjet([f], V(0, y0 - 0.07, 0).add(V(x, y, z).applyQuaternion(q)), q, fixe);
        pose(boite(0.56, 0.12, 1.7, 0, 0, 0, C.banc, 0, null, 0.012), 0, -0.012, 0.08);
        pose(boite(0.5, 0.012, 1.52, 0, 0, 0, C.gomme, 0, null, 0.004), 0, 0.054, 0.02);
        pose(boite(0.66, 0.2, 0.36, 0, 0, 0, C.fonte, 0.2, null, 0.04), 0, 0.045, 1.0);
        for (const s of [1, -1]) {
          pose(boite(0.06, 0.15, 1.76, 0, 0, 0, C.cadre, 0.45, null, 0.014), s * 0.31, 0.0, 0.1);
          pose(boite(0.07, 0.04, 0.1, 0, 0, 0, C.gomme, 0, null, 0.01), s * 0.31, -0.085, -0.72); pose(boite(0.07, 0.04, 0.1, 0, 0, 0, C.gomme, 0, null, 0.01), s * 0.31, -0.085, 0.92);
          pose(boite(0.055, 1.2, 0.06, 0, 0, 0, C.cadre, 0.45, qX(7), 0.012), s * 0.33, 0.64, 0.93);
          pose(cyl(0.019, 0.52, 0, 0, 0, C.metal, 0.8, LONG_Z, 0.008), s * 0.33, 1.06, 0.62); pose(cyl(0.024, 0.2, 0, 0, 0, C.gomme, 0, LONG_Z, 0.008), s * 0.33, 1.06, 0.46);
        }
        pose(boite(0.74, 0.22, 0.07, 0, 0, 0, C.fonte, 0.2, qX(-28), 0.02), 0, 1.25, 0.84);
        pose(cyl(0.019, 0.62, 0, 0, 0, C.metal, 0.8, null, 0.008), 0, 1.1, 0.8);
      }
      if (o.escalier) {
        // Simulateur d'escalier. Les marches descendent sans arrêt (deux par foulée) entre deux limons ; chaque pied
        // reste posé sur sa marche tant qu'elle descend (six dixièmes de la foulée), puis monte et enjambe la marche
        // suivante pour se poser deux marches plus haut — il monte d'abord, avance ensuite, pour passer les nez de marche.
        const Hm = 0.2, Dm = 0.27, zM = 0.04, lieu = k => [y0 + k * Hm, zM + k * Dm];        // dessus et milieu de la marche au rang k
        const pas = ph => {
          const k = 1 - 2 * ph, s = ph < 0.6 ? 0 : (ph - 0.6) / 0.4;
          const [y, z] = lieu(k); return { y: y + 2 * Hm * lisse(s / 0.6) + 0.04 * Math.sin(Math.PI * s), z: z - 0.065 + 2 * Dm * lisse((s - 0.25) / 0.75), leve: Math.sin(Math.PI * s) };
        };
        const hanche = y0 + 0.78 + L.racine.y - c.tronc({ bassin: { pos: L.racine.clone(), rot: new Quat() } }).hanches.G.y;
        d.pose = ph => {
          const f = ((ph % 1) + 1) % 1, p = { bassin: { pos: V(0, hanche + 0.012 * Math.cos(2 * TAU * f), 0.02), rot: qX(7) }, lombaires: 2, thorax: 2, cou: -5, torsion: 3 * sn(f), bras: {}, jambes: {} };
          for (const [k, s] of COTES) { const a = pas(k === 'G' ? f : (f + 0.5) % 1); p.jambes[k] = pied(c, s, { x: s * 0.1, z: a.z, y0: a.y, ouv: 4, pointe: -8 * a.leve, pole: V(s * 0.05, 0, 1) }); }
          for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.36, y0 + 1.02, 0.22), pole: V(s * 0.4, -1, -0.5), paume: V(-s * 0.2, -1, 0), dirMain: V(0, 0, 1), doigts: 'barre' };
          return p;
        };
        // Les marches du moment (nez gainé), entre le palier du bas et celui du haut.
        d.objets = (info, ph, sortie) => {
          const f = ((ph % 1) + 1) % 1;
          for (let i = -3; i <= 4; i++) { const k = i - 2 * f + Math.floor(2 * f); if (k < -1.9 || k > 1.45) continue; const [y, z] = lieu(k); sortie.push(pret(boite(0.56, Hm, Dm, 0, y - Hm / 2, z, C.banc, 0, null, 0.012)), pret(boite(0.56, 0.02, 0.05, 0, y - 0.005, z - Dm / 2 + 0.025, C.gomme, 0, null, 0.006))); }
        };
        for (const s of [1, -1]) {
          // Le limon : un profilé sous le nez des marches, du sol au palier.
          fixe.push(pret(tube(V(s * 0.31, 0.04, -0.34), V(s * 0.31, 0.62, 0.44), 0.07, C.cadre)));
          fixe.push(pret(tube(V(s * 0.36, 0.05, 0.66), V(s * 0.36, y0 + 1.22, 0.6), 0.055, C.cadre)), pret(cyl(0.02, 0.62, s * 0.36, y0 + 1.02, 0.32, C.metal, 0.8, LONG_Z, 0.008)), pret(cyl(0.025, 0.22, s * 0.36, y0 + 1.02, 0.14, C.gomme, 0, LONG_Z, 0.008)));
        }
        fixe.push(pret(boite(0.8, 0.22, 0.07, 0, y0 + 1.25, 0.6, C.fonte, 0.2, qX(-24), 0.02)), pret(boite(0.72, 0.06, 1.36, 0, 0.03, -0.1, C.cadre, 0.45, null, 0.014)));
        fixe.push(...poseFixe(patin(C, V(-0.38, 0.03, 0.62), V(0.38, 0.03, 0.62), 0.055)), ...poseFixe(patin(C, V(-0.38, 0.03, -0.8), V(0.38, 0.03, -0.8), 0.055)));
      }
      // Le traîneau : deux patins relevés à l'avant, trois traverses, un axe qui porte les disques, et les deux montants
      // que l'on pousse (gainés là où on les tient).
      if (o.traineau) d.objets = (info, u, sortie) => {
        const mi = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), z0 = mi.z + 0.1, z1 = mi.z + 1.0;
        for (const s of [1, -1]) {
          sortie.push(pret(tube(V(s * 0.26, 0.03, z0), V(s * 0.26, 0.03, z1), 0.05, C.cadre)), pret(tube(V(s * 0.26, 0.03, z1), V(s * 0.26, 0.1, z1 + 0.12), 0.05, C.cadre)));
          sortie.push(pret(tube(V(s * 0.2, 0.05, z0 + 0.04), V(s * 0.2, mi.y + 0.14, mi.z), 0.04, C.cadre)), pret(seg(V(s * 0.2, mi.y - 0.07, mi.z + 0.008), V(s * 0.2, mi.y + 0.09, mi.z - 0.004), 0.027, C.gomme, 0, 0.008)));
        }
        for (const z of [z0 + 0.04, (z0 + z1) / 2, z1 - 0.04]) sortie.push(pret(tube(V(-0.26, 0.05, z), V(0.26, 0.05, z), 0.045, C.cadre)));
        const zc = (z0 + z1) / 2 + 0.1;
        sortie.push(pret(cyl(0.025, 0.42, 0, 0.26, zc, C.metal, 0.85, DEBOUT_Q, 0.008)));
        for (let i = 0; i < 3; i++) sortie.push(pret(cyl(0.225, 0.045, 0, 0.1 + i * 0.05, zc, C.fonte, 0.05, DEBOUT_Q, 0.014)), pret(tore(0.17, 0, 0.123 + i * 0.05, zc, C.fonte, 0.05, qX(90), 0.005)));
      };
      d.vue = { az: 70, el: 8 }; return d;
    }
    if (o.velo || o.airbike) {
      // Assis sur la selle, les pieds tournent sur les pédales ; airbike : les mains poussent et tirent les leviers.
      const ax = V(0, 0.31, 0.1), R = 0.17, selle = V(0, 0.95, -0.2), gui = V(0, 1.1, 0.46);
      d.periode = o.airbike ? 0.9 : 1.1;
      // Le bassin repose sur la selle (sa chair touche le dessus, enfoncée d'un bon centimètre) : hauteur mesurée une
      // fois sur le corps posé — il y entrait d'une dizaine de centimètres.
      const ySelle = selle.y + 0.005 + 0.0325, assise = { bassin: { pos: selle.clone().add(V(0, 0.07, 0)), rot: qX(36) }, lombaires: 8, thorax: 6, cou: -30, bras: pareil(brasRepos()), jambes: pareil(J(70, 6, 0, 80, 0)) };
      c.poserSur(assise, V(0, ySelle - 0.014, 0), AY, ['bassin'], (x, y, z) => Math.abs(x) < 0.08 && Math.abs(z - selle.z + 0.05) < 0.07);
      const yBassin = assise.bassin.pos.y;
      d.pose = ph => {
        const p = { bassin: { pos: V(selle.x, yBassin, selle.z), rot: qX(36) }, lombaires: 8, thorax: 6, cou: -30, bras: {}, jambes: {} };
        for (const [k, s] of COTES) {
          const a = TAU * (ph + (k === 'D' ? 0.5 : 0)), pd = ax.clone().add(V(s * 0.12, R * Math.cos(a), R * Math.sin(a)));
          p.jambes[k] = { cheville: pd.clone().add(V(0, 0.105, -0.06)), pole: V(s * 0.08, 0.3, 1), pied: V(0, -0.22, 1), hautPied: V(0, 1, 0.22) };
          const pousse = o.airbike ? 0.13 * Math.cos(a) : 0;
          p.bras[k] = { prise: V(s * (o.airbike ? 0.25 : 0.2), gui.y + (o.airbike ? 0.04 : 0), gui.z + pousse), pole: V(s * 0.7, -0.7, -0.3), paume: o.airbike ? V(-s, 0, 0) : V(0, -1, 0.2), doigts: 'barre' };
        }
        return p;
      };
      // Le vélo : une poutre au sol sur deux pieds, le cadre en profilés, la tige de selle chromée et la selle rembourrée,
      // la potence, la console, la roue d'inertie carénée (une cage de ventilateur pour l'air bike), le pédalier.
      const P = (a, b, e) => fixe.push(pret(tube(a, b, e || 0.05, C.cadre)));
      const roue = V(0, 0.38, 0.72), tete = V(0, gui.y - 0.1, gui.z + 0.06);
      fixe.push(...poseFixe(patin(C, V(-0.27, 0.03, -0.46), V(0.27, 0.03, -0.46), 0.055)), ...poseFixe(patin(C, V(-0.27, 0.03, 0.98), V(0.27, 0.03, 0.98), 0.055)));
      P(V(0, 0.055, -0.46), V(0, 0.055, 0.98), 0.06);
      P(V(0, 0.07, -0.2), ax, 0.055); P(ax, V(0, 0.72, -0.105), 0.055); P(ax, roue, 0.05); P(V(0, 0.07, 0.86), tete, 0.055); P(V(0, 0.62, -0.05), V(0, 0.66, 0.66), 0.045);
      fixe.push(pret(seg(V(0, 0.7, -0.095), V(0, selle.y - 0.02, selle.z + 0.01), 0.017, C.metal, 0.85)), pret(coussin(0.17, 0.065, 0.15, selle.x, selle.y + 0.005, selle.z - 0.05, C)), pret(boite(0.06, 0.05, 0.19, selle.x, selle.y + 0.012, selle.z + 0.11, C.banc, 0.12, null, 0.02)));
      // La roue : un volant plein sous un carter (vélo), ou un ventilateur dans sa cage (air bike).
      if (o.airbike) {
        fixe.push(pret(cyl(0.27, 0.06, roue.x, roue.y, roue.z, C.gomme, 0.1, null, 0.01)), pret(cyl(0.05, 0.13, roue.x, roue.y, roue.z, C.metal, 0.8, null, 0.008)));
        for (const x of [-0.05, 0.05]) for (const r of [0.28, 0.2, 0.12]) fixe.push(pret(tore(r, x, roue.y, roue.z, C.cadre, 0.5, ANNEAU_X, 0.006)));
      } else {
        fixe.push(pret(cyl(0.25, 0.07, roue.x, roue.y, roue.z, C.fonte, 0.25, null, 0.014)), pret(cyl(0.06, 0.1, roue.x, roue.y, roue.z, C.metal, 0.8, null, 0.008)), pret(tore(0.235, roue.x + 0.036, roue.y, roue.z, C.metal, 0.8, ANNEAU_X, 0.006)), pret(tore(0.235, roue.x - 0.036, roue.y, roue.z, C.metal, 0.8, ANNEAU_X, 0.006)));
        fixe.push(pret(boite(0.11, 0.2, 0.34, 0, roue.y + 0.19, roue.z - 0.05, C.cadre, 0.45, qX(-18), 0.03)));
      }
      // Le guidon (vélo) et la console.
      P(tete, V(0, gui.y - 0.02, gui.z + 0.02), 0.04);
      fixe.push(pret(boite(0.17, 0.11, 0.035, 0, gui.y + 0.13, gui.z + 0.07, C.fonte, 0.2, qX(-32), 0.012)), pret(seg(V(0, gui.y - 0.02, gui.z + 0.03), V(0, gui.y + 0.09, gui.z + 0.075), 0.014, C.cadre, 0.5)));
      if (!o.airbike) { fixe.push(pret(cyl(0.016, 0.46, gui.x, gui.y, gui.z, C.metal, 0.8, null, 0.006))); for (const s of [1, -1]) fixe.push(pret(cyl(0.021, 0.12, s * 0.2, gui.y, gui.z, C.gomme, 0, null, 0.008))); }
      else for (const s of [1, -1]) fixe.push(pret(cyl(0.02, 0.1, s * 0.16, 0.3, 0.36, C.gomme, 0, null, 0.008)), pret(seg(V(s * 0.1, 0.36, 0.42), V(s * 0.25, 0.45, 0.42), 0.02, C.cadre, 0.5)));
      // Le plateau du pédalier.
      fixe.push(pret(cyl(0.095, 0.012, 0.062, ax.y, ax.z, C.metal, 0.75, null, 0.004)), pret(cyl(0.03, 0.16, 0, ax.y, ax.z, C.cadre, 0.5, null, 0.006)));
      d.objets = (info, u, sortie) => {
        for (const [k, s] of COTES) {
          const a = TAU * ((u || 0) + (k === 'D' ? 0.5 : 0)), pd = ax.clone().add(V(s * 0.12, R * Math.cos(a), R * Math.sin(a)));
          // La manivelle, la pédale et sa sangle.
          sortie.push(pret(seg(ax.clone().add(V(s * 0.078, 0, 0)), pd.clone().setX(s * 0.078), 0.013, C.metal, 0.85, 0.006)), pret(boite(0.1, 0.024, 0.09, pd.x, pd.y, pd.z, C.gomme, 0, null, 0.008)), pret(boite(0.1, 0.006, 0.03, pd.x, pd.y + 0.06, pd.z + 0.01, C.banc, 0.1, null, 0.003)));
          // Air bike : les leviers, du pivot aux mains, avec leurs poignées.
          if (o.airbike) sortie.push(pret(seg(V(s * 0.25, 0.45, 0.42), info.prises[k], 0.018, C.cadre, 0.5, 0.008)), pret(seg(info.prises[k].clone().add(V(0, -0.06, 0)), info.prises[k].clone().add(V(0, 0.06, 0)), 0.021, C.gomme, 0, 0.008)));
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
      // L'elliptique : une poutre sur deux pieds, le carter de la roue à l'avant (la roue se devine sur ses flancs), le
      // mât et sa console, deux rails à l'arrière où roulent les pédales.
      fixe.push(...poseFixe(patin(C, V(-0.3, 0.03, -0.62), V(0.3, 0.03, -0.62), 0.055)), ...poseFixe(patin(C, V(-0.3, 0.03, 0.92), V(0.3, 0.03, 0.92), 0.055)));
      fixe.push(pret(tube(V(0, 0.055, -0.62), V(0, 0.055, 0.92), 0.07, C.cadre)), pret(boite(0.26, 0.52, 0.5, 0, 0.36, 0.7, C.fonte, 0.2, null, 0.07)));
      for (const s of [1, -1]) fixe.push(pret(cyl(0.2, 0.012, s * 0.134, 0.38, 0.7, C.cadre, 0.5, null, 0.004)), pret(cyl(0.035, 0.03, s * 0.15, 0.38, 0.7, C.metal, 0.8, null, 0.006)), pret(tube(V(s * 0.13, 0.1, -0.56), V(s * 0.13, 0.1, 0.3), 0.035, C.metal, 0.7)));
      fixe.push(pret(tube(V(0, 0.58, 0.78), V(0, 1.42, 0.62), 0.06, C.cadre)), pret(boite(0.3, 0.2, 0.05, 0, 1.5, 0.6, C.fonte, 0.2, qX(-25), 0.016)), pret(cyl(0.022, 0.5, 0, 0.5, 0.62, C.cadre, 0.5, null, 0.008)));
      d.objets = (info, u, sortie) => {
        for (const [k, s] of COTES) {
          const a = TAU * ((u || 0) + (k === 'D' ? 0.5 : 0)), pd = pied(a, s);
          // La pédale (un plateau bordé), sa bielle jusqu'à la roue, et le levier que tient la main.
          sortie.push(pret(boite(0.13, 0.03, 0.36, pd.x, pd.y - 0.015, pd.z, C.gomme, 0, null, 0.01)), pret(boite(0.13, 0.05, 0.03, pd.x, pd.y + 0.012, pd.z + 0.17, C.gomme, 0, null, 0.01)));
          sortie.push(pret(seg(pd.clone().add(V(0, -0.03, 0.17)), V(s * 0.15, 0.38 + 0.12 * Math.sin(a), 0.7 + 0.12 * Math.cos(a)), 0.016, C.cadre, 0.5, 0.007)));
          sortie.push(pret(seg(V(s * 0.25, 0.5, 0.62), info.prises[k], 0.017, C.cadre, 0.5, 0.008)), pret(seg(info.prises[k].clone().add(V(0, -0.07, 0)), info.prises[k].clone().add(V(0, 0.07, 0)), 0.021, C.gomme, 0, 0.008)));
        }
      };
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
      // Le rameur : le rail (un profilé d'aluminium) sur son pied arrière, le pied avant, la roue à air dans sa cage,
      // le bras de l'écran, les deux cale-pieds inclinés avec leur talonnière ; la chaîne, la poignée et le siège bougent.
      const roue = V(0, 0.42, 1.08);
      fixe.push(pret(tube(V(0, hS - 0.1, -1.02), V(0, hS - 0.1, 0.72), 0.075, C.metal, 0.6)), pret(tube(V(0, 0.05, -0.98), V(0, hS - 0.12, -0.98), 0.06, C.cadre)), ...poseFixe(patin(C, V(-0.2, 0.03, -0.98), V(0.2, 0.03, -0.98), 0.055)));
      fixe.push(...poseFixe(patin(C, V(-0.28, 0.03, 0.84), V(0.28, 0.03, 0.84), 0.055)), pret(tube(V(0, 0.05, 0.84), V(0, hS - 0.1, 0.7), 0.06, C.cadre)), pret(tube(V(0, hS - 0.1, 0.7), V(0, 0.34, 0.98), 0.06, C.cadre)));
      fixe.push(pret(cyl(0.27, 0.11, roue.x, roue.y, roue.z, C.fonte, 0.2, null, 0.02)), pret(cyl(0.06, 0.13, roue.x, roue.y, roue.z, C.metal, 0.8, null, 0.008)));
      for (const x of [-0.058, 0.058]) for (const r of [0.25, 0.17, 0.09]) fixe.push(pret(tore(r, x, roue.y, roue.z, C.cadre, 0.5, ANNEAU_X, 0.005)));
      fixe.push(pret(seg(V(0, 0.62, 1.0), V(0, 0.98, 0.78), 0.016, C.cadre, 0.5, 0.006)), pret(boite(0.2, 0.14, 0.03, 0, 1.02, 0.76, C.fonte, 0.2, qX(-20), 0.012)));
      for (const s of [1, -1]) fixe.push(pret(boite(0.12, 0.022, 0.31, s * 0.11, cale.y - 0.02, cale.z, C.gomme, 0, qX(-42), 0.008)), pret(boite(0.12, 0.07, 0.022, s * 0.11, cale.y - 0.115, cale.z - 0.085, C.gomme, 0, qX(-42), 0.008)), pret(tube(V(s * 0.11, hS - 0.1, 0.6), V(s * 0.11, cale.y - 0.05, cale.z + 0.03), 0.03, C.cadre)));
      d.objets = (info, u, sortie) => {
        const mi = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5);
        sortie.push(pret(seg(V(0, 0.52, 0.86), mi, 0.005, C.cable, 0.6)), pret(seg(info.prises.G.clone().add(V(0.09, 0, 0)), info.prises.D.clone().add(V(-0.09, 0, 0)), 0.016, C.gomme, 0, 0.007)));
        // Le siège : une assise moulée sur son chariot.
        sortie.push(pret(coussin(0.28, 0.055, 0.25, 0, hS - 0.04, info.bassin.z - 0.02, C)), pret(boite(0.14, 0.03, 0.2, 0, hS - 0.075, info.bassin.z - 0.02, C.cadre, 0.5, null, 0.006)));
      };
      d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.skierg) {
      // Debout face à l'appareil : les bras tirent deux poignées du dessus de la tête jusqu'aux hanches, le buste plonge.
      const anc = s => V(s * 0.16, 2.05, 0.62);
      let kHaut = 1;
      const cle = u => {
        const p = debout(c, { ecart: 0.14, ouv: 8, dy: -0.02 - 0.13 * u, dz: -0.1 * u, penche: lerp(4, 46, u), cou: -lerp(0, 20, u) });
        const t = c.tronc(p);
        for (const [k, s] of COTES) { const hautP = V(s * 0.17, t.epaules.G.y + 0.5 * kHaut, t.epaules.G.z + 0.26 * kHaut), basP = t.hanches[k].clone().add(V(s * 0.12, -0.06, 0.02)); p.bras[k] = { prise: hautP.lerp(basP, u), pole: V(s * 0.6, 0, -0.8), paume: V(-s, 0, 0), doigts: 'barre' }; }
        return p;
      };
      // En haut, les bras sont presque tendus vers les poignées (25° au coude) : réglé sur le corps posé.
      { const k = coudeTendu(c, x => { kHaut = x; return cle(0); }, 0.9, 1.6, 25); kHaut = k != null ? k : 1; }
      d.rythme = 'rep'; d.periode = 2; d.cles = [0, 0.33, 0.66, 1].map(u => [u, cle(u)]);
      d.tenu = [{ t: 'cable', de: anc(1), m: 'G', bout: 'poignee' }, { t: 'cable', de: anc(-1), m: 'D', bout: 'poignee' }];
      // L'appareil : une plate-forme antidérapante sur deux pieds, le mât, la roue à air dans sa cage en haut du mât,
      // son écran, et les deux sorties de corde.
      fixe.push(pret(boite(0.62, 0.035, 0.95, 0, 0.0175, 0.3, C.gomme, 0, null, 0.012)), ...poseFixe(patin(C, V(-0.33, 0.03, 0.8), V(0.33, 0.03, 0.8), 0.055)));
      fixe.push(pret(tube(V(0, 0.04, 0.74), V(0, 2.12, 0.74), 0.11, C.cadre)), pret(cyl(0.22, 0.13, 0, 1.76, 0.86, C.fonte, 0.2, null, 0.02)), pret(cyl(0.05, 0.15, 0, 1.76, 0.86, C.metal, 0.8, null, 0.008)));
      for (const x of [-0.068, 0.068]) for (const r of [0.2, 0.13]) fixe.push(pret(tore(r, x, 1.76, 0.86, C.cadre, 0.5, ANNEAU_X, 0.005)));
      fixe.push(pret(boite(0.18, 0.13, 0.03, 0, 1.36, 0.66, C.fonte, 0.2, qX(18), 0.012)));
      for (const s of [1, -1]) fixe.push(pret(tube(V(0, 2.08, 0.72), anc(s), 0.035, C.cadre)), pret(cyl(0.03, 0.02, anc(s).x, anc(s).y, anc(s).z, C.gomme, 0.1, null, 0.006)));
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
      const K0 = tendre(c, pose(H - pendu, 0.02, 0, J(8, 2, 0, 12, 35), [1, -0.2, -0.25], [0, 0, 1]), V(0, -1, 0));   // pendu, bras tendus
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
      if (o.shrug) {
        // Haussement d'épaules en appui renversé : les bras restent tendus ; épaules relâchées, le corps s'enfonce entre
        // elles ; épaules haussées, il repousse le sol et monte.
        const a = cloner(dp.a), b = cloner(dp.a);
        for (const k of ['G', 'D']) { a.bras[k].hausse = -8; b.bras[k].hausse = 16; }
        tendre(c, a, V(0, 1, 0)); tendre(c, b, V(0, 1, 0));
        d.a = a; d.b = b; d.rythme = 'rep'; d.periode = 2.2;
      }
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
      const t = c.tronc(p), dx = e - epX, hautR = Math.sqrt(Math.max(0.01, Math.pow(0.97 * Ap, 2) - dx * dx)), estime = un ? 0.97 * Ap : hautR;
      const lever = y => {
        for (const [k, s] of COTES) {
          if (un && k === 'D') { p.bras.D = B(70, 40, 0, 20, 90, { doigts: 'detendu' }); continue; }
          p.bras[k] = { prise: V(un ? s * (epX + 0.02) : s * e, t.epaules.G.y + y, t.epaules.G.z - 0.03), pole: V(s * 1, -0.2, -0.3), paume: un ? V(-s * 0.3, 0, 1) : V(0, 0.2, 1), doigts: 'barre' };
        }
        return p;
      };
      // Bras tendus au-dessus de la tête : la hauteur se règle sur le corps posé (l'épaule monte avec le bras).
      const y = coudeTendu(c, lever, estime - 0.05, estime + 0.3, 10, un ? ['G'] : null);
      return lever(y != null ? y : estime);
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
      const cle = u => { const p = debout(c, { ecart: 0.24, ouv: 24, dy: lerp(-0.6, -0.14, u), dz: lerp(-0.2, -0.2, u), penche: lerp(34, 98, u), lomb: lerp(14, 30, u), thor: 10, cou: lerp(-20, 20, u) }); equilibrer(c, p, p.jambes.G.cheville.z + 0.05); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.orteils[k].clone().add(V(0, 0.03, 0.04)), V(k === 'G' ? 1 : -1, 0.3, -0.2), V(0, -1, 0)); return p; };
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
      const cle = u => { const p = assis(c, { h: H_BANC, penche: lerp(2, 32, u), ecart: 0.12 }); p.lombaires = 12 * u; p.jambes.D = J(lerp(80, 84, u) + lerp(2, 32, u), 22, 74, 96, 10); const info = c.poser(p); p.bras.D = B(20, 30, 0, 60, 150, { doigts: 'detendu' }); p.bras.G = B(20, 30, 0, 60, 150, { doigts: 'detendu' }); return p; };
      fixe.push(...bancAssis(C));
      d.vue = { az: 38, el: 12 }; return deux(cle(0), cle(1));
    }
    if (o.pli) {
      // Flexion avant debout : jambes tendues, le buste se plie, les mains descendent vers le sol.
      const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6, penche: lerp(4, 104, u), dz: lerp(0, -0.11, u), dy: -0.03 * u, lomb: 26 * u, thor: 14 * u, cou: lerp(0, 16, u) }); p.bras = pareil(B(6, lerp(8, 96, u), 0, 6, 150, { doigts: 'detendu' })); if (u) equilibrer(c, p, p.jambes.G.cheville.z + 0.05); return p; };   // les hanches reculent juste ce qu'il faut pour tenir sur ses pieds
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
      const mollets = !!o.mollets, R = 0.07, zR = mollets ? 0.62 : 0;
      // k : la hauteur du bassin (fessiers) ou la flexion des hanches (mollets : bassin soulevé, jambes tendues).
      const posture = (w, k) => {
        const p = corps(qX(mollets ? -46 : -52), { lombaires: 10, cou: 8 });
        p.jambes = mollets ? pareil(J(k, 4, 0, 4, 10)) : { G: J(134, 6, 0, 128, 0), D: J(128, 28, 70, 100, 10) };
        p.bassin.pos = V(0, mollets ? 0.2 : k, (mollets ? 0.07 : 0.05) * w);
        const t = c.tronc(p); for (const [kk, s] of COTES) p.bras[kk] = { prise: V(s * 0.24, 0.008, t.epaules.G.z - 0.1), pole: V(s * 0.2, 0.2, -1), paume: V(0, -1, 0), dirMain: V(s * 0.3, 0, -1), doigts: 'plat' };
        return p;
      };
      // Le corps repose sur le rouleau : la chair touche son dessus, enfoncée d'un centimètre. Réglé sur le corps posé à
      // cinq endroits de l'aller-retour — les fessiers par la hauteur du bassin, les mollets par l'angle des jambes.
      const dessus = 2 * R - 0.01, surRouleau = (x, y, z) => Math.abs(z - zR) < 0.035 && Math.abs(x) < 0.21;
      const reglages = [-1, -0.5, 0, 0.5, 1].map(w => {
        if (!mollets) return [w, c.poserSur(posture(w, 0.235), V(0, dessus, zR), AY, ['bassin', 'cuisse'], surRouleau).bassin.pos.y];
        const bas = k => { const e = c.extreme(posture(w, k), V(0, -1, 0), ['jambe'], surRouleau); return e === -Infinity ? 0 : -e - dessus; };
        return [w, zeroDe(bas, 56, 62, 8, 12)];
      });
      d.pose = ph => { const w = Math.sin(2 * Math.PI * ph); return posture(w, chemin(reglages, w)); };
      d.objets = (info, u, sortie) => { sortie.push(pret(cyl(R, 0.42, 0, R, zR, C.ballon, 0))); };
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
    corps.appuis = d.appuis;
    if (atlas.appuis) atlas.appuis(d.appuis);
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
        if (f.hors || Math.max(f.s[0], f.s[1], f.s[2]) > 1.9) continue;
        const tb = f.forme === 'tore' || f.forme === 'arc' ? (f.r || 0) : 0;
        const q = new Quat(f.q[0], f.q[1], f.q[2], f.q[3]), dd = f.forme === 'boite' ? [f.s[0] / 2, f.s[1] / 2, f.s[2] / 2] : f.forme === 'cylindre' || f.forme === 'hexa' ? [f.s[0], f.s[1] / 2, f.s[2]] : [f.s[0] + tb, f.s[1] + tb, f.s[2] + tb];
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
      quitter() { actif = false; atlas.animer(null); atlas.poser(null); atlas.objets([]); atlas.ombre(null); if (atlas.appuis) atlas.appuis(null); }
    };
  }

  racine.AnqaMouvements = { creerAnimation, definir, poseA, avancee, poseDe, materielDe, specDe, lireSpec, FAM, EXERCICES, TEINTES, cycle, Corps, V3, Quat };
})(typeof window !== 'undefined' ? window : globalThis);
