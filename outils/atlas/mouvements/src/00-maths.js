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
