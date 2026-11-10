/* =====================================================================
   ATLAS MUSCULAIRE 3D D'ANQĀ — moteur d'affichage
   Un corps écorché où chaque muscle est un maillage à part entière
   (modèle : Z-Anatomy / BodyParts3D, CC BY-SA 4.0, voir assets/atlas/LISEZMOI.md).
   Écrit directement en WebGL 2, sans bibliothèque : tout le modèle tient
   dans un seul tampon de sommets, dessiné en deux appels (le côté gauche,
   puis son miroir). L'état de chaque muscle (couleur, surbrillance,
   transparence, masquage) vit dans une petite texture lue par le numéro
   de structure de chaque sommet : changer une couleur ne coûte rien.
   L'image n'est recalculée que lorsqu'elle change (rien ne tourne au repos).
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- Un peu de calcul matriciel (matrices 4×4 rangées par colonnes) ---------- */
  function perspective(fovY, aspect, pres, loin) {
    const f = 1 / Math.tan(fovY / 2), d = 1 / (pres - loin);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (loin + pres) * d, -1, 0, 0, 2 * loin * pres * d, 0];
  }
  function produit(a, b) {
    const r = new Array(16);
    for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) r[c * 4 + l] = a[l] * b[c * 4] + a[4 + l] * b[c * 4 + 1] + a[8 + l] * b[c * 4 + 2] + a[12 + l] * b[c * 4 + 3];
    return r;
  }
  const norme = v => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const croix = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const borne = (x, a, b) => Math.min(b, Math.max(a, x));
  const lin = c => Math.pow(c, 2.2);
  function couleur(c) {   // '#rrggbb' ou [r, v, b] (0-255) -> [r, v, b] (0-255)
    if (Array.isArray(c)) return c;
    const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    const m3 = /^#?([0-9a-f]{3})$/i.exec(String(c).trim());
    if (m3) return m3[1].split('').map(x => parseInt(x + x, 16));
    return [128, 128, 128];
  }

  /* ---------- Les programmes de dessin ---------- */
  const SOMMETS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_ombreTendon;
layout(location=2) in vec2 a_nor;
layout(location=3) in float a_num;
layout(location=4) in uvec4 a_os;
layout(location=5) in vec4 a_poids;
uniform vec3 u_min, u_etendue;
uniform mat4 u_vp;
uniform float u_cote, u_passe;
uniform sampler2D u_etats;
uniform highp sampler2D u_os;      // la pose : une matrice 3×4 par articulation (ligne 0 : côté gauche, ligne 1 : son miroir)
out vec3 v_pos, v_nor;
out float v_ombre, v_tendon;
flat out vec4 v_teinte, v_etat;
flat out float v_num;
vec3 octa(vec2 e) {
  vec3 v = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-v.z, 0.0);
  v.x += v.x >= 0.0 ? -t : t; v.y += v.y >= 0.0 ? -t : t;
  return normalize(v);
}
void main() {
  int num = int(a_num + 0.5), cote = int(u_cote + 0.5);
  v_teinte = texelFetch(u_etats, ivec2(num, cote), 0);
  v_etat = texelFetch(u_etats, ivec2(num, 2 + cote), 0);
  v_num = a_num;
  float presence = v_teinte.a;
  // Passe 0 : les structures pleines. Passe 1 : les fantômes et les voiles (aponévroses fines, translucides).
  // Passe 2 : le repérage au doigt, structures pleines seulement — on touche le muscle à travers un voile ou un fantôme.
  bool voile = v_etat.g > 0.25 && v_etat.g < 0.75;
  bool plein = presence >= 0.99 && !voile;
  bool voir = u_passe == 1.0 ? (presence > 0.004 && !plein) : plein;
  // Chaque sommet suit jusqu'à quatre articulations ; au repos, les matrices sont l'identité (ou le miroir).
  vec4 r0 = vec4(0.0), r1 = vec4(0.0), r2 = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    float w = a_poids[k];
    if (w > 0.0) { int j = int(a_os[k]) * 3; r0 += w * texelFetch(u_os, ivec2(j, cote), 0); r1 += w * texelFetch(u_os, ivec2(j + 1, cote), 0); r2 += w * texelFetch(u_os, ivec2(j + 2, cote), 0); }
  }
  vec4 p4 = vec4(u_min + a_pos * u_etendue, 1.0);
  vec3 p = vec3(dot(r0, p4), dot(r1, p4), dot(r2, p4));
  vec3 n0 = octa(a_nor);
  vec3 n = normalize(vec3(dot(r0.xyz, n0), dot(r1.xyz, n0), dot(r2.xyz, n0)));
  v_pos = p; v_nor = n;
  v_ombre = a_ombreTendon.x; v_tendon = a_ombreTendon.y;
  gl_Position = voir ? u_vp * vec4(p, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

  const PIXELS = `#version 300 es
precision highp float;
in vec3 v_pos, v_nor;
in float v_ombre, v_tendon;
flat in vec4 v_teinte, v_etat;
flat in float v_num;
uniform vec3 u_cam, u_tendon, u_accent;
uniform mat3 u_lum;          // repère des projecteurs : il suit l'azimut de la caméra, pas son élévation
uniform float u_passe, u_cote, u_clair, u_estompe;
out vec4 o;
vec3 versLin(vec3 c) { return pow(c, vec3(2.2)); }
// Courbe de rendu « neutre » (Khronos) : garde les teintes justes dans les hautes lumières.
vec3 neutre(vec3 c) {
  float x = min(c.r, min(c.g, c.b));
  float dec = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= dec;
  float pic = max(c.r, max(c.g, c.b));
  if (pic < 0.76) return c;
  float d = 0.24, np = 1.0 - d * d / (pic + d - 0.76);
  c *= np / pic;
  float g = 1.0 - 1.0 / (0.15 * (pic - np) + 1.0);
  return mix(c, vec3(np), g);
}
float ggx(float nh, float r) { float a = r * r, a2 = a * a, d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (3.14159 * d * d); }
void main() {
  vec3 N = normalize(v_nor); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(u_cam - v_pos);
  float nv = max(dot(N, V), 0.0);
  float os = step(0.75, v_etat.g);                      // matière : 0 muscle, 0,5 aponévrose (voile), 1 os
  float ten = smoothstep(0.30, 0.78, v_tendon) * (1.0 - os);
  float brille = v_etat.r, estompe = v_etat.b * u_estompe;
  vec3 teinte = versLin(v_teinte.rgb);
  vec3 base = mix(teinte, u_tendon, ten * mix(1.0, 0.55, v_etat.a));   // v_etat.a : part de la couleur de carte gardée sur les tendons
  // Ombrage de relief (calculé une fois pour toutes sur le modèle) : creux entre les muscles, plis, dessous.
  float ombre = v_ombre;
  float creux = mix(0.06, 1.0, smoothstep(0.02, 0.96, ombre));
  float creuxDirect = mix(0.30, 1.0, smoothstep(0.05, 0.80, ombre));
  // La chair est plus sombre et plus rouge au fond des sillons, un rien plus claire sur les reliefs exposés.
  base *= mix(vec3(0.72, 0.60, 0.60), vec3(1.04, 1.03, 1.02), smoothstep(0.15, 0.95, ombre) * (1.0 - 0.6 * max(ten, os)) + 0.6 * max(ten, os));
  // Estompe : les muscles non choisis se retirent (moins de couleur, un peu plus sombres) sans disparaître.
  float gris = dot(base, vec3(0.2126, 0.7152, 0.0722));
  base = mix(base, vec3(gris) * 0.80 + 0.012, estompe);
  // Lumière d'ambiance : ciel doux au-dessus, sol plus chaud en dessous.
  vec3 ciel = mix(vec3(0.200, 0.205, 0.225), vec3(0.30, 0.31, 0.34), u_clair), sol = mix(vec3(0.075, 0.062, 0.058), vec3(0.17, 0.155, 0.145), u_clair);
  vec3 lumiere = mix(sol, ciel, N.y * 0.5 + 0.5) * creux;
  vec3 reflets = vec3(0.0);
  float rug = mix(mix(0.44, 0.36, ten), 0.56, os);       // satiné : ni mat ni plastique
  float f0 = mix(0.055, 0.04, os);
  // Trois projecteurs de studio : principal (chaud, en haut à gauche), débouchage (froid, à droite), contre-jour.
  vec3 dirs[3] = vec3[3](normalize(vec3(-0.55, 0.66, 0.52)), normalize(vec3(0.80, 0.06, 0.60)), normalize(vec3(0.30, 0.50, -0.81)));
  vec3 cols[3] = vec3[3](vec3(1.00, 0.955, 0.90) * 0.98, vec3(0.78, 0.87, 1.00) * 0.26, vec3(1.00, 0.97, 0.94) * 0.62);
  for (int i = 0; i < 3; i++) {
    vec3 L = u_lum * dirs[i];
    float nl = dot(N, L);
    // Lumière enveloppante : la chair diffuse un peu la lumière au-delà de la limite d'ombre, en la réchauffant.
    float env = mix(0.16, 0.06, max(ten, os));
    float d = max((nl + env) / (1.0 + env), 0.0);
    vec3 chair = mix(vec3(1.0), vec3(1.0, 0.50, 0.42), (1.0 - os) * (1.0 - ten) * smoothstep(0.30, 0.0, d) * 0.6);
    lumiere += cols[i] * d * chair * creuxDirect;
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0), vh = max(dot(V, H), 0.0);
    float F = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
    float vis = 0.25 / (mix(max(nl, 0.0), 1.0, rug * 0.5) * mix(nv, 1.0, rug * 0.5) + 0.05);
    reflets += cols[i] * ggx(nh, rug) * F * vis * max(nl, 0.0) * creuxDirect;
  }
  // Liseré de bord : un voile clair sur les contours fuyants, qui détache la silhouette du fond.
  float bord = pow(1.0 - nv, 3.0);
  vec3 c = base * lumiere + reflets * mix(1.0, 0.6, estompe) + bord * mix(vec3(0.050, 0.046, 0.052), vec3(0.03), u_clair) * creux;
  // Muscle choisi : il s'éclaire de l'intérieur, avec un halo de la couleur d'accent sur ses bords.
  c += brille * (base * 0.50 + u_accent * (0.06 + 0.60 * bord));
  if (u_passe == 1.0) {
    // Fantôme : presque rien de face, un peu plus sur les bords — on devine le volume sans cacher ce qu'il recouvre.
    if (v_teinte.a >= 0.99) {
      // Voile : une lame fibreuse fine, éclairée comme le reste, qui laisse voir le muscle qu'elle recouvre.
      float av = 0.40 + 0.45 * pow(1.0 - nv, 2.0);
      c = neutre(c);
      o = vec4(pow(c, vec3(1.0 / 2.2)) * av, av); return;
    }
    float a = v_teinte.a * (0.10 + 0.90 * pow(1.0 - nv, 1.6));
    vec3 f = mix(vec3(0.80, 0.84, 0.92), vec3(0.34, 0.37, 0.44), u_clair);
    o = vec4(f * a, a); return;
  }
  c = neutre(c);
  o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;

  // Repérage : chaque structure écrit son numéro et son côté (valeurs entières exactes).
  const PIXELS_REPERAGE = `#version 300 es
precision highp float;
in vec3 v_pos, v_nor;
in float v_ombre, v_tendon;
flat in vec4 v_teinte, v_etat;
flat in float v_num;
uniform float u_cote;
out vec4 o;
void main() { o = vec4(v_num / 255.0, (u_cote + 1.0) / 255.0, 0.0, 1.0); }`;

  const SOL_S = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_p;
uniform mat4 u_vp; uniform vec3 u_centre; uniform vec2 u_taille;
out vec2 v_p;
void main() { v_p = a_p; gl_Position = u_vp * vec4(u_centre.x + a_p.x * u_taille.x, u_centre.y, u_centre.z + a_p.y * u_taille.y, 1.0); }`;
  const SOL_P = `#version 300 es
precision highp float;
in vec2 v_p; uniform float u_clair, u_force; uniform vec2 u_pieds; out vec4 o;
void main() {
  // Ombre de contact : dense sous chaque pied, large et légère autour.
  float large = smoothstep(1.0, 0.0, length(v_p)) ;
  vec2 q = vec2(abs(v_p.x) - u_pieds.x, (v_p.y - 0.08) * 0.62);
  float pied = smoothstep(u_pieds.y, 0.0, length(q));
  float a = (large * large * 0.20 + pied * pied * 0.42 * step(0.0, u_pieds.x)) * u_force;
  vec3 c = mix(vec3(0.0), vec3(0.05, 0.07, 0.12), u_clair);
  a *= mix(0.85, 0.50, u_clair);
  o = vec4(c * a, a);
}`;

  // Le matériel (barre, haltères, banc) : des formes simples, éclairées comme le corps.
  const OBJ_S = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_p;
layout(location=1) in vec3 a_n;
uniform mat4 u_vp; uniform vec4 u_q; uniform vec3 u_t, u_s;
out vec3 v_pos, v_nor;
vec3 tourner(vec3 v, vec4 q) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() { vec3 w = tourner(a_p * u_s, u_q) + u_t; v_pos = w; v_nor = tourner(a_n / u_s, u_q); gl_Position = u_vp * vec4(w, 1.0); }`;
  const OBJ_P = `#version 300 es
precision highp float;
in vec3 v_pos, v_nor;
uniform vec3 u_cam, u_couleur; uniform mat3 u_lum; uniform float u_metal, u_clair;
out vec4 o;
float ggx(float nh, float r) { float a = r * r, a2 = a * a, d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (3.14159 * d * d); }
void main() {
  vec3 N = normalize(v_nor), V = normalize(u_cam - v_pos);
  float nv = max(dot(N, V), 0.0);
  vec3 base = pow(u_couleur, vec3(2.2));
  vec3 ciel = mix(vec3(0.20, 0.205, 0.225), vec3(0.30, 0.31, 0.34), u_clair), sol = mix(vec3(0.075, 0.062, 0.058), vec3(0.17, 0.155, 0.145), u_clair);
  vec3 lumiere = mix(sol, ciel, N.y * 0.5 + 0.5), reflets = vec3(0.0);
  float rug = mix(0.6, 0.3, u_metal), f0 = mix(0.04, 0.7, u_metal);
  vec3 dirs[3] = vec3[3](normalize(vec3(-0.55, 0.66, 0.52)), normalize(vec3(0.80, 0.06, 0.60)), normalize(vec3(0.30, 0.50, -0.81)));
  vec3 cols[3] = vec3[3](vec3(1.00, 0.955, 0.90) * 0.98, vec3(0.78, 0.87, 1.00) * 0.26, vec3(1.00, 0.97, 0.94) * 0.62);
  for (int i = 0; i < 3; i++) {
    vec3 L = u_lum * dirs[i]; float nl = max(dot(N, L), 0.0);
    lumiere += cols[i] * nl;
    vec3 H = normalize(L + V); float nh = max(dot(N, H), 0.0), vh = max(dot(V, H), 0.0);
    float F = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
    reflets += cols[i] * ggx(nh, rug) * F * 0.25 / (mix(nl, 1.0, rug * 0.5) * mix(nv, 1.0, rug * 0.5) + 0.05) * nl;
  }
  vec3 c = base * mix(1.0, 0.35, u_metal) * lumiere + reflets * mix(vec3(1.0), base, u_metal) + pow(1.0 - nv, 3.0) * 0.04;
  c = c / (1.0 + max(max(c.r, c.g), c.b) * 0.25);
  o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;
  /* Formes de base : un cylindre (rayon 1, hauteur 1, le long de Y) et une boîte (côté 1), positions puis normales. */
  function formesDeBase() {
    const cyl = [], N = 28;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      cyl.push(c0, -0.5, s0, c0, 0, s0, c0, 0.5, s0, c0, 0, s0, c1, 0.5, s1, c1, 0, s1, c0, -0.5, s0, c0, 0, s0, c1, 0.5, s1, c1, 0, s1, c1, -0.5, s1, c1, 0, s1);
      cyl.push(0, 0.5, 0, 0, 1, 0, c1, 0.5, s1, 0, 1, 0, c0, 0.5, s0, 0, 1, 0, 0, -0.5, 0, 0, -1, 0, c0, -0.5, s0, 0, -1, 0, c1, -0.5, s1, 0, -1, 0);
    }
    const boite = [];
    for (const [n, u, v] of [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]])
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) boite.push(0.5 * (n[0] + a * u[0] + b * v[0]), 0.5 * (n[1] + a * u[1] + b * v[1]), 0.5 * (n[2] + a * u[2] + b * v[2]), n[0], n[1], n[2]);
    return { cylindre: new Float32Array(cyl), boite: new Float32Array(boite) };
  }

  function programme(gl, vs, fs) {
    const faire = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('atlas : ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, faire(gl.VERTEX_SHADER, vs)); gl.attachShader(p, faire(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('atlas : ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nom = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[nom] = gl.getUniformLocation(p, nom); }
    return { p, u };
  }

  /* ---------- Lecture du fichier du modèle ---------- */
  function lireModele(tampon) {
    const vue = new DataView(tampon);
    if (vue.getUint32(0, true) !== 0x41514e41) throw new Error("atlas : ce fichier n'est pas un modèle Anqā");
    const lg = vue.getUint32(8, true);
    const entete = JSON.parse(new TextDecoder().decode(new Uint8Array(tampon, 12, lg)));
    const debut = 12 + lg, octets = entete.sommets * entete.octetsParSommet;
    const sommets = new Uint8Array(tampon, debut, octets);
    // Indices locaux sur 16 bits, pièce par pièce : on les remet dans la numérotation d'ensemble au moment de les
    // confier à la carte graphique (le tableau déplié n'est pas gardé en mémoire).
    const indices = () => {
      const src = new Uint16Array(tampon, debut + octets, entete.triangles * 3), out = new Uint32Array(entete.triangles * 3);
      let k = 0;
      for (let i = 0; i < entete.pieces.length; i += 2) { const v0 = entete.pieces[i], n = entete.pieces[i + 1]; for (let j = 0; j < n; j++, k++) out[k] = v0 + src[k]; }
      return out;
    };
    return { entete, sommets, indices, nbIndices: entete.triangles * 3 };
  }

  /* ---------- L'atlas ---------- */
  const VUES = { face: 0, gauche: 90, dos: 180, droite: -90 };
  const DEFAUTS = {
    muscle: '#a5463f', tendon: '#cdc4b3', os: '#c3baa7', accent: '#f472b6',
    clair: false,            // fond clair ou sombre : règle le liseré, les fantômes et l'ombre au sol
    estompe: 0.7,            // retrait des muscles non choisis (0 : aucun, 1 : gris)
    ppMax: 2,                // densité de pixels maximale (au-delà, le gain ne se voit plus sur un corps entier)
    champ: 24                // angle de champ vertical, en degrés (longue focale : peu de déformation)
  };

  function creer(conteneur, tampon, options) {
    const opt = Object.assign({}, DEFAUTS, options || {});
    const toile = document.createElement('canvas');
    toile.className = 'atlas-toile';
    toile.setAttribute('role', 'img');
    toile.setAttribute('aria-label', 'Corps en trois dimensions : fais-le tourner du doigt, touche un muscle pour le nommer');
    conteneur.appendChild(toile);
    const gl = toile.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) { toile.remove(); throw new Error('atlas : WebGL 2 indisponible'); }

    const M = lireModele(tampon), E = M.entete, S = E.structures;
    const NB = S.length, NUM_OS = [E.os.pair, E.os.impair];
    const parId = new Map(S.map((s, i) => [s.id, i]));
    const hauteur = E.boite.etendue[1], centreCorps = [0, E.boite.min[1] + hauteur / 2, E.boite.min[2] + E.boite.etendue[2] / 2];

    // État de chaque structure (ce que l'appli demande), puis sa traduction en texture (ce que la carte graphique lit).
    const etat = S.map(() => ({ couleur: null, masque: false, part: 1 }));
    let couleurTendonCarte = 0;      // en mode « carte », les tendons gardent une part de la couleur du muscle
    let coucheMin = 1, fantomes = true, isoles = null, choisi = -1, squelette = true;
    const brillance = new Float32Array(NB), estompe = new Float32Array(NB);   // valeurs affichées (animées)
    let estompeCible = 0, estompeOs = 0;
    const texels = new Uint8Array(256 * 4 * 4);
    let texSale = true;
    // La pose : pour chaque articulation, une matrice 3×4 (rotation et déplacement), rangée par lignes. La seconde
    // rangée sert au côté dessiné en miroir : la matrice de l'articulation jumelle, précédée du miroir.
    const SQ = E.squelette || [], NJ = Math.max(1, SQ.length);
    const pose = new Float32Array(NJ * 3 * 4 * 2);
    let poseSale = true;
    function ecrirePose(mats) {
      for (let i = 0; i < NJ; i++) {
        const j = SQ.length ? SQ[i].jumeau : i;
        for (let k = 0; k < 12; k++) {
          pose[i * 12 + k] = mats ? mats[i * 12 + k] : (k % 5 === 0 ? 1 : 0);
          const v = mats ? mats[j * 12 + k] : (k % 5 === 0 ? 1 : 0);
          pose[NJ * 12 + i * 12 + k] = k % 4 === 0 ? -v : v;
        }
      }
      poseSale = true;
    }
    ecrirePose(null);

    let prog, progRep, progSol, progObj, vaoObj = {}, vao, vaoSol, tex, texOs, tamponSommets, tamponIndices, tamponSol, cadreRep = null, texRep, profRep;
    function installer() {
      prog = programme(gl, SOMMETS, PIXELS); progRep = programme(gl, SOMMETS, PIXELS_REPERAGE); progSol = programme(gl, SOL_S, SOL_P); progObj = programme(gl, OBJ_S, OBJ_P);
      const formes = formesDeBase(); vaoObj = {};
      for (const nom in formes) {
        const v = gl.createVertexArray(); gl.bindVertexArray(v);
        const t = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, t); gl.bufferData(gl.ARRAY_BUFFER, formes[nom], gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        vaoObj[nom] = { vao: v, n: formes[nom].length / 6 };
      }
      vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      tamponSommets = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tamponSommets); gl.bufferData(gl.ARRAY_BUFFER, M.sommets, gl.STATIC_DRAW);
      const pas = E.octetsParSommet;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, pas, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.UNSIGNED_BYTE, true, pas, 6);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.BYTE, true, pas, 8);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, pas, 10);
      gl.enableVertexAttribArray(4); gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, pas, 12);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, pas, 16);
      tamponIndices = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tamponIndices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, M.indices(), gl.STATIC_DRAW);
      vaoSol = gl.createVertexArray(); gl.bindVertexArray(vaoSol);
      tamponSol = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tamponSol); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, texels);
      texOs = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texOs);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, NJ * 3, 2, 0, gl.RGBA, gl.FLOAT, pose);
      poseSale = false;
      // Petite image hors écran pour repérer la structure sous le doigt.
      cadreRep = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, cadreRep);
      texRep = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texRep); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, REP, REP, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texRep, 0);
      profRep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, profRep); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, REP, REP);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, profRep);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      texSale = true;
    }
    const REP = 9;   // côté, en pixels, de la zone lue sous le doigt

    /* ----- Traduction de l'état en texture ----- */
    let transparents = false;
    function presence(i) {
      const s = S[i], e = etat[i];
      if (e.masque) return 0;
      if (isoles && !isoles.has(i)) return fantomes ? 0.5 : 0;
      if (s.couche < coucheMin) return fantomes ? 0.5 : 0;
      return 1;
    }
    function ecrireTexture() {
      const base = couleur(opt.muscle), cTendon = couleur(opt.tendon), cOs = couleur(opt.os);
      transparents = false;
      for (let i = 0; i < NB; i++) {
        const s = S[i], e = etat[i], p = presence(i), voile = s.type === 'aponevrose';
        if (p > 0 && (p < 1 || voile)) transparents = true;
        let c = e.couleur || (s.type !== 'muscle' ? cTendon : base);
        if (!e.couleur && s.type === 'muscle') { const v = 1 + (((i * 37) % 11) - 5) * 0.012; c = [borne(c[0] * v, 0, 255), borne(c[1] * v, 0, 255), borne(c[2] * v, 0, 255)]; }
        for (let cote = 0; cote < 2; cote++) {
          const o = (cote * 256 + i) * 4, o2 = ((2 + cote) * 256 + i) * 4;
          texels[o] = c[0]; texels[o + 1] = c[1]; texels[o + 2] = c[2]; texels[o + 3] = (cote === 1 && !s.pair) ? 0 : Math.round(p * 255);
          texels[o2] = Math.round(brillance[i] * 255); texels[o2 + 1] = voile ? 128 : 0; texels[o2 + 2] = Math.round(estompe[i] * 255); texels[o2 + 3] = e.couleur ? Math.round(couleurTendonCarte * 255) : 0;
        }
      }
      // Le squelette : deux numéros (os pairs, dessinés des deux côtés ; os du milieu, dessinés une seule fois).
      NUM_OS.forEach((num, k) => {
        for (let cote = 0; cote < 2; cote++) {
          const o = (cote * 256 + num) * 4, o2 = ((2 + cote) * 256 + num) * 4;
          texels[o] = cOs[0]; texels[o + 1] = cOs[1]; texels[o + 2] = cOs[2]; texels[o + 3] = (!squelette || (k === 1 && cote === 1)) ? 0 : 255;
          texels[o2] = 0; texels[o2 + 1] = 255; texels[o2 + 2] = Math.round(estompeOs * 255); texels[o2 + 3] = 0;
        }
      });
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 4, gl.RGBA, gl.UNSIGNED_BYTE, texels);
      texSale = false;
    }

    function envoyerPose() {
      gl.bindTexture(gl.TEXTURE_2D, texOs);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NJ * 3, 2, gl.RGBA, gl.FLOAT, pose);
      poseSale = false;
    }

    /* ----- Caméra : elle tourne autour du corps ----- */
    const cam = { az: 0, el: 4, dist: 1, cible: centreCorps.slice() };
    let larg = 1, haut = 1, pp = 1;
    let entier = true;   // la caméra cadre le corps entier : elle se réajuste quand la place libre change
    const champ = opt.champ * Math.PI / 180;
    // Marges prises par l'interface, en pixels d'écran : le corps se cadre dans la zone restée libre.
    const marges = { haut: 0, bas: 0 }, margesVues = { haut: 0, bas: 0 };
    const densite = () => haut / (toile.clientHeight || haut);   // pixels de l'image par pixel d'écran
    function distancePour(h) { return (h / 2) / Math.tan(champ / 2); }
    function distanceEntiere() {
      // Le corps entier, bras compris, tient dans la zone libre quelle que soit la forme de l'écran.
      const marge = 1.08, aspect = larg / haut, l = E.boite.etendue[0] * 2 + 2 * E.boite.min[0];
      const libre = Math.max(0.3, 1 - (marges.haut + marges.bas) * densite() / haut);
      return Math.max(distancePour(hauteur * marge / libre), distancePour(Math.max(l, 0.8) * marge / aspect));
    }
    function matrices(decoupe) {
      const az = cam.az * Math.PI / 180, el = cam.el * Math.PI / 180;
      const arriere = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const oeil = [cam.cible[0] + arriere[0] * cam.dist, cam.cible[1] + arriere[1] * cam.dist, cam.cible[2] + arriere[2] * cam.dist];
      const droite = norme(croix([0, 1, 0], arriere)), dessus = croix(arriere, droite);
      const vue = [droite[0], dessus[0], arriere[0], 0, droite[1], dessus[1], arriere[1], 0, droite[2], dessus[2], arriere[2], 0,
        -(droite[0] * oeil[0] + droite[1] * oeil[1] + droite[2] * oeil[2]), -(dessus[0] * oeil[0] + dessus[1] * oeil[1] + dessus[2] * oeil[2]), -(arriere[0] * oeil[0] + arriere[1] * oeil[1] + arriere[2] * oeil[2]), 1];
      let proj = perspective(champ, larg / haut, Math.max(0.02, cam.dist - 1.6), cam.dist + 1.8);
      // L'image est remontée (ou descendue) pour se centrer dans la zone libre de l'interface.
      const dy = (margesVues.bas - margesVues.haut) * densite() / haut;
      if (dy) proj = produit([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, dy, 0, 1], proj);
      if (decoupe) {   // ne garder qu'une petite fenêtre de l'image (repérage sous le doigt)
        const [x, y, w, h] = decoupe;
        const sx = larg / w, sy = haut / h, tx = (larg - 2 * x - w) / w, ty = (haut - 2 * y - h) / h;
        proj = produit([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, tx, ty, 0, 1], proj);
      }
      return { vp: produit(proj, vue), oeil, droite, dessus, arriere, az };
    }

    /* ----- Dessin ----- */
    function passe(m, n) {
      const pr = n === 2 ? progRep : prog;
      gl.uniform1f(pr.u.u_passe, n);
      for (let cote = 0; cote < 2; cote++) {
        gl.uniform1f(pr.u.u_cote, cote);
        gl.frontFace(cote ? gl.CW : gl.CCW);
        gl.drawElements(gl.TRIANGLES, M.nbIndices, gl.UNSIGNED_INT, 0);
      }
      gl.frontFace(gl.CCW);
    }
    function preparer(m, reperage) {
      const pr = reperage ? progRep : prog;
      gl.useProgram(pr.p);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texOs); gl.uniform1i(pr.u.u_os, 1);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pr.u.u_etats, 0);
      gl.uniformMatrix4fv(pr.u.u_vp, false, m.vp);
      gl.uniform3fv(pr.u.u_min, E.boite.min); gl.uniform3fv(pr.u.u_etendue, E.boite.etendue);
      if (reperage) return;
      gl.uniform3fv(prog.u.u_cam, m.oeil);
      const c = Math.cos(m.az), s = Math.sin(m.az);
      gl.uniformMatrix3fv(prog.u.u_lum, false, [c, 0, -s, 0, 1, 0, s, 0, c]);
      gl.uniform3fv(prog.u.u_tendon, couleur(opt.tendon).map(x => lin(x / 255)));
      gl.uniform3fv(prog.u.u_accent, couleur(opt.accent).map(x => lin(x / 255)));
      gl.uniform1f(prog.u.u_clair, opt.clair ? 1 : 0);
      gl.uniform1f(prog.u.u_estompe, opt.estompe);
    }
    let nbImages = 0, dernierTemps = 0;
    let objets = [], ombreSol = null, animation = null, scene = null;
    function dessiner() {
      if (gl.isContextLost()) return;
      const t0 = performance.now();
      if (texSale) ecrireTexture();
      if (poseSale) envoyerPose();
      const m = matrices();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, toile.width, toile.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // L'ombre au sol, d'abord (elle ne masque rien).
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(progSol.p); gl.bindVertexArray(vaoSol);
      gl.uniformMatrix4fv(progSol.u.u_vp, false, m.vp);
      if (ombreSol) {
        gl.uniform3f(progSol.u.u_centre, ombreSol.centre[0], 0.002, ombreSol.centre[1]);
        gl.uniform2f(progSol.u.u_taille, ombreSol.taille[0] * 1.5, ombreSol.taille[1] * 1.5);
        gl.uniform2f(progSol.u.u_pieds, -1, 0.30); gl.uniform1f(progSol.u.u_force, ombreSol.force == null ? 1 : ombreSol.force);
      } else {
        gl.uniform3f(progSol.u.u_centre, 0, E.boite.min[1] + 0.002, centreCorps[2]);
        gl.uniform2f(progSol.u.u_taille, 0.62, 0.50);
        gl.uniform2f(progSol.u.u_pieds, 0.17, 0.30); gl.uniform1f(progSol.u.u_force, 1);
      }
      gl.uniform1f(progSol.u.u_clair, opt.clair ? 1 : 0);
      if (cam.el > -2) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // Les structures pleines, puis les fantômes par-dessus (sans écrire la profondeur).
      preparer(m);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      passe(m, 0);
      if (objets.length) {
        // Le matériel de l'exercice.
        gl.useProgram(progObj.p); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
        gl.uniformMatrix4fv(progObj.u.u_vp, false, m.vp); gl.uniform3fv(progObj.u.u_cam, m.oeil);
        const co = Math.cos(m.az), si = Math.sin(m.az);
        gl.uniformMatrix3fv(progObj.u.u_lum, false, [co, 0, -si, 0, 1, 0, si, 0, co]); gl.uniform1f(progObj.u.u_clair, opt.clair ? 1 : 0);
        for (const f of objets) {
          const v = vaoObj[f.forme]; if (!v) continue;
          gl.bindVertexArray(v.vao);
          gl.uniform4fv(progObj.u.u_q, f.q); gl.uniform3fv(progObj.u.u_t, f.p); gl.uniform3fv(progObj.u.u_s, f.s);
          gl.uniform3f(progObj.u.u_couleur, f.couleur[0] / 255, f.couleur[1] / 255, f.couleur[2] / 255); gl.uniform1f(progObj.u.u_metal, f.metal || 0);
          gl.drawArrays(gl.TRIANGLES, 0, v.n);
        }
        gl.disable(gl.CULL_FACE);
        preparer(m);
      }
      if (transparents) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
        passe(m, 1);
        gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      }
      gl.bindVertexArray(null);
      nbImages++; dernierTemps = performance.now() - t0;
    }

    /* ----- Repérage : quelle structure sous ce point de l'écran ? ----- */
    const lus = new Uint8Array(REP * REP * 4);
    function reperer(xCss, yCss) {
      if (gl.isContextLost()) return null;
      if (texSale) ecrireTexture();
      if (poseSale) envoyerPose();
      const x = xCss / toile.clientWidth * larg, y = (1 - yCss / toile.clientHeight) * haut;   // en pixels de l'image, origine en bas
      const m = matrices([Math.round(x - REP / 2), Math.round(y - REP / 2), REP, REP]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, cadreRep);
      gl.viewport(0, 0, REP, REP);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      preparer(m, true);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      passe(m, 2);
      gl.readPixels(0, 0, REP, REP, gl.RGBA, gl.UNSIGNED_BYTE, lus);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null);
      // Le pixel le plus proche du centre qui porte une structure (un petit muscle se touche plus facilement).
      let mieux = null, dMin = 1e9, c = (REP - 1) / 2;
      for (let j = 0; j < REP; j++) for (let i = 0; i < REP; i++) {
        const o = (j * REP + i) * 4; if (!lus[o + 1]) continue;
        const d = (i - c) * (i - c) + (j - c) * (j - c);
        if (d < dMin) { dMin = d; mieux = { num: lus[o], cote: lus[o + 1] - 1 }; }
      }
      if (!mieux) return null;
      if (mieux.num >= NB) return { os: true };
      return { indice: mieux.num, cote: mieux.cote ? 'droit' : 'gauche', structure: S[mieux.num] };
    }

    // Toute la vue d'un coup, à échelle réduite : pour chaque point, la structure qu'on y toucherait (sert aux contrôles).
    function carteReperage(pas) {
      if (gl.isContextLost()) return null;
      if (texSale) ecrireTexture();
      if (poseSale) envoyerPose();
      pas = pas || 4;
      const l = Math.max(1, Math.round(toile.clientWidth / pas)), h = Math.max(1, Math.round(toile.clientHeight / pas));
      const cadre = gl.createFramebuffer(), t = gl.createTexture(), prof = gl.createRenderbuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, cadre);
      gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, l, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindRenderbuffer(gl.RENDERBUFFER, prof); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, l, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, prof);
      gl.viewport(0, 0, l, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const m = matrices(); preparer(m, true);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      passe(m, 2);
      const px = new Uint8Array(l * h * 4); gl.readPixels(0, 0, l, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null);
      gl.deleteFramebuffer(cadre); gl.deleteTexture(t); gl.deleteRenderbuffer(prof);
      // Résumé par structure et par côté : nombre de points, et un point sûr (le plus proche du barycentre).
      const vus = {};
      for (let j = 0; j < h; j++) for (let i = 0; i < l; i++) {
        const o = (j * l + i) * 4; if (!px[o + 1] || px[o] >= NB) continue;
        const k = S[px[o]].id + '|' + (px[o + 1] - 1 ? 'droit' : 'gauche'), v = vus[k] || (vus[k] = { n: 0, sx: 0, sy: 0, pts: [] });
        v.n++; v.sx += i; v.sy += j; v.pts.push(i, j);
      }
      for (const k in vus) {
        const v = vus[k], cx = v.sx / v.n, cy = v.sy / v.n; let dm = 1e9, bx = 0, by = 0;
        for (let q = 0; q < v.pts.length; q += 2) { const d = (v.pts[q] - cx) * (v.pts[q] - cx) + (v.pts[q + 1] - cy) * (v.pts[q + 1] - cy); if (d < dm) { dm = d; bx = v.pts[q]; by = v.pts[q + 1]; } }
        vus[k] = { n: v.n, x: (bx + 0.5) * pas, y: (h - by - 0.5) * pas };
      }
      return vus;
    }

    /* ----- Boucle d'animation : elle ne tourne que lorsqu'il y a quelque chose à animer ----- */
    let amorce = false;
    let demande = 0, vivant = true, transition = null, elan = { az: 0, el: 0 }, enMain = false;
    const reduit = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    function demander() { if (!demande && vivant) demande = requestAnimationFrame(image); }
    function image(t) {
      demande = 0;
      if (!vivant) return;
      let encore = false;
      if (transition) {
        const k = reduit ? 1 : borne((t - transition.t0) / transition.duree, 0, 1), e = 1 - Math.pow(1 - k, 3);
        cam.az = transition.de.az + (transition.a.az - transition.de.az) * e;
        cam.el = transition.de.el + (transition.a.el - transition.de.el) * e;
        cam.dist = transition.de.dist + (transition.a.dist - transition.de.dist) * e;
        for (let i = 0; i < 3; i++) cam.cible[i] = transition.de.cible[i] + (transition.a.cible[i] - transition.de.cible[i]) * e;
        if (k >= 1) { transition = null; cam.az = ((cam.az + 180) % 360 + 360) % 360 - 180; } else encore = true;
      } else if (!enMain && (Math.abs(elan.az) > 0.02 || Math.abs(elan.el) > 0.02)) {
        cam.az += elan.az; cam.el = borne(cam.el + elan.el, -80, 80); elan.az *= 0.92; elan.el *= 0.88; encore = true;
      }
      // Un exercice en cours : la pose est recalculée à chaque image.
      if (animation && animation(t / 1000)) encore = true;
      // Surbrillance et estompe : fondus doux.
      for (let i = 0; i < NB; i++) {
        const cb = i === choisi ? 1 : 0, ce = i === choisi ? 0 : estompeCible;
        if (brillance[i] !== cb || estompe[i] !== ce) {
          const pas = reduit ? 1 : 0.16;
          brillance[i] = Math.abs(cb - brillance[i]) < 0.02 ? cb : brillance[i] + (cb - brillance[i]) * pas;
          estompe[i] = Math.abs(ce - estompe[i]) < 0.02 ? ce : estompe[i] + (ce - estompe[i]) * pas;
          texSale = true; if (brillance[i] !== cb || estompe[i] !== ce) encore = true;
        }
      }
      for (const k of ['haut', 'bas']) if (margesVues[k] !== marges[k]) {
        margesVues[k] = reduit || Math.abs(marges[k] - margesVues[k]) < 0.5 ? marges[k] : margesVues[k] + (marges[k] - margesVues[k]) * 0.2;
        if (margesVues[k] !== marges[k]) encore = true;
      }
      if (estompeOs !== estompeCible) { estompeOs = Math.abs(estompeCible - estompeOs) < 0.02 ? estompeCible : estompeOs + (estompeCible - estompeOs) * (reduit ? 1 : 0.16); texSale = true; if (estompeOs !== estompeCible) encore = true; }
      const mouvement = encore || enMain;
      if (mouvement) {
        const dt = t - tPrec;
        if (dt > 0 && dt < 200) { lentes = dt > 22 ? lentes + 1 : Math.max(0, lentes - 1); if (lentes > 8 && echelleMouvement > 0.55) { echelleMouvement = Math.max(0.55, echelleMouvement - 0.15); lentes = 0; } }
        if (echelle !== echelleMouvement) { echelle = echelleMouvement; tailler(); }
        clearTimeout(minuterieNet);
        if (echelle < 1) minuterieNet = setTimeout(() => { if (vivant && echelle < 1) { echelle = 1; tailler(); } }, 170);
      } else if (echelle !== 1) { echelle = 1; tailler(); }
      tPrec = t;
      dessiner();
      if (!amorce) { amorce = true; setTimeout(() => { if (vivant) reperer(-99, -99); }, 250); }
      if (api.surImage) api.surImage(cam);
      if (encore) demander();
    }

    // Densité de l'image : pleine au repos ; pendant un mouvement, elle baisse d'elle-même si l'appareil ne suit pas
    // (moins de 45 images par seconde), puis l'image redevient nette dès que le geste s'arrête.
    let echelle = 1, echelleMouvement = 1, lentes = 0, tPrec = 0, minuterieNet = 0;
    function tailler() {
      const r = conteneur.getBoundingClientRect();
      if (!r.width || !r.height) return;
      pp = Math.min(window.devicePixelRatio || 1, opt.ppMax);
      const w = Math.max(1, Math.round(r.width * pp * echelle)), h = Math.max(1, Math.round(r.height * pp * echelle));
      const premier = larg === 1 && haut === 1;
      if (toile.width !== w || toile.height !== h) { toile.width = w; toile.height = h; }
      larg = w; haut = h;
      if (premier) { margesVues.haut = marges.haut; margesVues.bas = marges.bas; }
      if (entier && !transition) { cam.dist = distanceEntiere(); cam.cible = centreCorps.slice(); }
      demander();
    }

    /* ----- Ce que l'appli peut demander ----- */
    function allerA(a, duree) {
      // Le plus court chemin en azimut.
      let az = a.az != null ? a.az : cam.az; while (az - cam.az > 180) az -= 360; while (az - cam.az < -180) az += 360;
      const but = { az, el: a.el != null ? a.el : cam.el, dist: a.dist != null ? a.dist : cam.dist, cible: a.cible ? a.cible.slice() : cam.cible.slice() };
      elan.az = elan.el = 0;
      if (duree === 0 || reduit) { transition = null; cam.az = ((but.az + 180) % 360 + 360) % 360 - 180; cam.el = but.el; cam.dist = but.dist; cam.cible = but.cible; }
      else transition = { t0: performance.now(), duree: duree == null ? 520 : duree, de: { az: cam.az, el: cam.el, dist: cam.dist, cible: cam.cible.slice() }, a: but };
      demander();
    }
    const api = {
      toile, structures: S, entete: E, regions: E.regions,
      surImage: null,
      indice: id => parId.has(id) ? parId.get(id) : -1,
      vue(nom, duree) { if (nom in VUES) allerA({ az: VUES[nom], el: 4 }, duree); },
      reinitialiser(duree) { entier = true; allerA({ az: 0, el: 4, dist: distanceEntiere(), cible: centreCorps }, duree); },
      camera: () => ({ az: cam.az, el: cam.el, dist: cam.dist, cible: cam.cible.slice() }),
      placer(a) { if (a.dist != null || a.cible) entier = false; Object.assign(cam, { az: a.az != null ? a.az : cam.az, el: a.el != null ? a.el : cam.el, dist: a.dist != null ? a.dist : cam.dist }); if (a.cible) cam.cible = a.cible.slice(); transition = null; demander(); },
      // Cadre un muscle : il vient au centre, à la bonne distance, vu du côté où il se montre le mieux.
      cadrer(id, duree) {
        const i = api.indice(id); if (i < 0) return;
        entier = false;
        const s = S[i], cote = (cam.az > 0 && cam.az < 180) ? -1 : 1;
        const libre = Math.max(0.3, 1 - (marges.haut + marges.bas) * densite() / haut);
        const d = borne(distancePour(s.rayon * 2 * 2.3 / libre), 0.5, distanceEntiere());
        allerA({ dist: d, cible: [s.centre[0] * (Math.abs(s.centre[0]) < 0.04 ? 0 : cote), s.centre[1], s.centre[2]] }, duree);
      },
      // Pose du corps : une matrice 3×4 par articulation (12 nombres, par lignes), dans l'ordre de `squelette`.
      // Sans argument : retour à la position de repos.
      squelette: SQ,
      poser(mats) { ecrirePose(mats || null); demander(); },
      // Pose donnée par des rotations locales : { nom d'articulation: [x, y, z, w] } (quaternion, repère du parent),
      // et, au besoin, un déplacement du bassin. Sert aux essais et aux poses simples.
      poserRotations(rot, deplacement) {
        const mats = new Float32Array(NJ * 12), R = [], C = [];
        for (let i = 0; i < NJ; i++) {
          const a = SQ[i], q = (rot && rot[a.nom]) || [0, 0, 0, 1], x = q[0], y = q[1], z = q[2], w = q[3];
          const l = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
          let r, c;
          if (a.parent < 0) { r = l; c = [a.centre[0] + (deplacement ? deplacement[0] : 0), a.centre[1] + (deplacement ? deplacement[1] : 0), a.centre[2] + (deplacement ? deplacement[2] : 0)]; }
          else {
            const rp = R[a.parent], cp = C[a.parent], d = [a.centre[0] - SQ[a.parent].centre[0], a.centre[1] - SQ[a.parent].centre[1], a.centre[2] - SQ[a.parent].centre[2]];
            r = new Array(9);
            for (let u = 0; u < 3; u++) for (let v = 0; v < 3; v++) r[u * 3 + v] = rp[u * 3] * l[v] + rp[u * 3 + 1] * l[3 + v] + rp[u * 3 + 2] * l[6 + v];
            c = [cp[0] + rp[0] * d[0] + rp[1] * d[1] + rp[2] * d[2], cp[1] + rp[3] * d[0] + rp[4] * d[1] + rp[5] * d[2], cp[2] + rp[6] * d[0] + rp[7] * d[1] + rp[8] * d[2]];
          }
          R.push(r); C.push(c);
          for (let u = 0; u < 3; u++) {
            mats[i * 12 + u * 4] = r[u * 3]; mats[i * 12 + u * 4 + 1] = r[u * 3 + 1]; mats[i * 12 + u * 4 + 2] = r[u * 3 + 2];
            mats[i * 12 + u * 4 + 3] = c[u] - (r[u * 3] * a.centre[0] + r[u * 3 + 1] * a.centre[1] + r[u * 3 + 2] * a.centre[2]);
          }
        }
        ecrirePose(mats); demander();
        return { mats, centres: C };
      },
      // Matériel : liste de formes { forme: 'cylindre' | 'boite', s (tailles), q (rotation), p (position), couleur, metal }.
      objets(liste) { objets = liste || []; demander(); },
      // Ombre au sol : par défaut sous les pieds ; pendant un exercice, sous toute la scène ({ centre, taille, force }).
      ombre(o) { ombreSol = o || null; demander(); },
      // Fonction appelée à chaque image (temps en secondes) tant qu'elle renvoie vrai : l'animation d'un exercice.
      animer(fn) { animation = fn || null; if (animation) demander(); },
      // Cadre une boîte de la scène (min, max) depuis une vue ({ az, el }) : tout tient dans la zone libre de l'écran.
      cadrerBoite(mini, maxi, vue, duree) {
        entier = false;
        const c = [(mini[0] + maxi[0]) / 2, (mini[1] + maxi[1]) / 2, (mini[2] + maxi[2]) / 2];
        const az = (vue && vue.az != null ? vue.az : cam.az) * Math.PI / 180, el = (vue && vue.el != null ? vue.el : cam.el) * Math.PI / 180;
        const arriere = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], droite = norme(croix([0, 1, 0], arriere)), dessus = croix(arriere, droite);
        const libre = Math.max(0.3, 1 - (marges.haut + marges.bas) * densite() / haut), tv = Math.tan(champ / 2) * libre * 0.96, th = Math.tan(champ / 2) * (larg / haut) * 0.96;
        let d = 0.5;
        for (let k = 0; k < 8; k++) {
          const q = [(k & 1 ? maxi[0] : mini[0]) - c[0], (k & 2 ? maxi[1] : mini[1]) - c[1], (k & 4 ? maxi[2] : mini[2]) - c[2]];
          const x = q[0] * droite[0] + q[1] * droite[1] + q[2] * droite[2], y = q[0] * dessus[0] + q[1] * dessus[1] + q[2] * dessus[2], z = q[0] * arriere[0] + q[1] * arriere[1] + q[2] * arriere[2];
          d = Math.max(d, z + Math.abs(x) / th, z + Math.abs(y) / tv);
        }
        scene = { centre: c, demi: [(maxi[0] - mini[0]) / 2, (maxi[1] - mini[1]) / 2, (maxi[2] - mini[2]) / 2], dist: d };
        allerA({ az: vue && vue.az != null ? vue.az : cam.az, el: vue && vue.el != null ? vue.el : cam.el, dist: d, cible: c }, duree);
      },
      quitterScene() { scene = null; },
      // Points de la surface du corps au repos (un sommet sur six des structures des régions demandées), avec leurs
      // articulations et leurs poids : pour mesurer le corps posé (où passe une barre devant les jambes, etc.).
      peau(regions) {
        const vue = new DataView(M.sommets.buffer, M.sommets.byteOffset, M.sommets.byteLength), pas = E.octetsParSommet, P = [], J = [], W = [];
        for (const s of S) {
          if (regions && !regions.includes(s.region)) continue;
          for (let v = s.sommets; v < s.sommets + s.nbSommets; v += 6) {
            const o = v * pas;
            for (let k = 0; k < 3; k++) P.push(E.boite.min[k] + vue.getUint16(o + k * 2, true) / 65535 * E.boite.etendue[k]);
            for (let k = 0; k < 4; k++) { J.push(vue.getUint8(o + 12 + k)); W.push(vue.getUint8(o + 16 + k) / 255); }
          }
        }
        const bassin = SQ.length ? SQ[0].centre : centreCorps; let zDos = Infinity;
        for (let i = 0; i < P.length; i += 3) if (P[i + 1] > bassin[1] - 0.05 && P[i + 1] < bassin[1] + 0.45 && P[i + 2] < zDos) zDos = P[i + 2];
        return { n: P.length / 3, P: Float32Array.from(P), J: Uint8Array.from(J), W: Float32Array.from(W), dos: bassin[2] - zDos };
      },
      choisir(id) { choisi = id == null ? -1 : api.indice(id); estompeCible = choisi >= 0 ? 1 : 0; demander(); },
      choisi: () => choisi >= 0 ? S[choisi] : null,
      // Couleurs de carte : { identifiant: '#rrggbb' }. Une structure absente reprend sa couleur naturelle.
      colorer(couleurs, options) {
        for (let i = 0; i < NB; i++) { const c = couleurs && couleurs[S[i].id]; etat[i].couleur = c ? couleur(c) : null; }
        couleurTendonCarte = options && options.tendons != null ? options.tendons : 0;
        if (options && options.muscle) opt.muscle = options.muscle;
        texSale = true; demander();
      },
      couche(k) { if (k != null) { coucheMin = borne(Math.round(k), 1, E.couches + 1); texSale = true; demander(); } return coucheMin; },
      fantomes(v) { if (v != null) { fantomes = !!v; texSale = true; demander(); } return fantomes; },
      voirSquelette(v) { if (v != null) { squelette = !!v; texSale = true; demander(); } return squelette; },
      isoler(ids) { isoles = ids && ids.length ? new Set(ids.map(api.indice).filter(i => i >= 0)) : null; texSale = true; demander(); },
      isoles: () => isoles ? [...isoles].map(i => S[i].id) : null,
      masquer(id, v) { const i = api.indice(id); if (i >= 0) { etat[i].masque = v !== false; texSale = true; demander(); } },
      masques: () => S.filter((s, i) => etat[i].masque).map(s => s.id),
      toutAfficher() { etat.forEach(e => { e.masque = false; }); isoles = null; coucheMin = 1; texSale = true; demander(); },
      theme(o) { Object.assign(opt, o); texSale = true; demander(); },
      // Place prise par l'interface en haut et en bas (pixels d'écran) : l'image se recentre en douceur.
      marges(m, immediat) {
        if (m.haut != null) marges.haut = m.haut; if (m.bas != null) marges.bas = m.bas;
        if (immediat) { margesVues.haut = marges.haut; margesVues.bas = marges.bas; }
        if (entier) allerA({ dist: distanceEntiere(), cible: centreCorps }, immediat ? 0 : 320);
        demander();
      },
      reperer, carteReperage,
      // Position à l'écran (pixels d'écran, origine en haut à gauche) d'un point du corps ; cote 'droit' : son miroir.
      projeter(p, cote) {
        const m = matrices().vp, x = cote === 'droit' ? -p[0] : p[0], y = p[1], z = p[2];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        return { x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * toile.clientWidth, y: (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * toile.clientHeight, devant: w > 0 };
      },
      redessiner: demander,
      tailler,
      mesures: () => ({ images: nbImages, dernierTempsMs: dernierTemps, largeur: larg, hauteur: haut, pixels: pp, echelleMouvement, triangles: E.triangles, sommets: E.sommets, appelsDeDessin: 1 + 2 * (transparents ? 2 : 1) }),
      detruire() {
        vivant = false; if (demande) cancelAnimationFrame(demande);
        clearTimeout(minuterieNet); document.removeEventListener('visibilitychange', visible);
        if (observateur) observateur.disconnect();
        toile.removeEventListener('webglcontextlost', perdu); toile.removeEventListener('webglcontextrestored', retrouve);
        const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
        toile.remove();
      },
      // Accès bas niveau pour les gestes (voir activerGestes).
      _: { cam, borne, distanceEntiere, distancePour, hauteur, centreCorps, demander, elan, tenir(v) { enMain = v; }, arreter() { transition = null; }, enTransition: () => !!transition, libre() { entier = false; }, entier: () => entier, champ, taille: () => [toile.clientWidth, toile.clientHeight], matrices, boite: E.boite, scene: () => scene }
    };

    function perdu(e) { e.preventDefault(); if (demande) { cancelAnimationFrame(demande); demande = 0; } }
    function visible() { if (!document.hidden) demander(); }
    document.addEventListener('visibilitychange', visible);
    function retrouve() { installer(); demander(); }
    toile.addEventListener('webglcontextlost', perdu);
    toile.addEventListener('webglcontextrestored', retrouve);
    installer();
    const observateur = window.ResizeObserver ? new ResizeObserver(tailler) : null;
    if (observateur) observateur.observe(conteneur);
    tailler();
    return api;
  }

  /* =====================================================================
     GESTES — un doigt fait tourner, deux doigts rapprochent, éloignent et
     déplacent ; une touche brève désigne un muscle ; deux touches cadrent.
     Souris : glisser pour tourner, molette pour le zoom, bouton droit (ou
     Maj) pour déplacer. Clavier : flèches, + et −, Échap.
     ===================================================================== */
  function activerGestes(a, surTouche) {
    const t = a.toile, i = a._, cam = i.cam, doigts = new Map();
    let depart = null, pince = null, bouge = false, multi = false, derniere = null, vit = { az: 0, el: 0 };
    const distMin = 0.30;
    const parPixel = () => 2 * cam.dist * Math.tan(i.champ / 2) / t.clientHeight;
    function bornerCible() {
      // Déplacement contrôlé : plus on est près, plus on peut s'écarter du centre ; de loin, le corps reste au milieu.
      const sc = i.scene(), dE = sc ? sc.dist : i.distanceEntiere(), k = i.borne((dE - cam.dist) / (dE * 0.45), 0, 1), b = i.boite, c = sc ? sc.centre : i.centreCorps;
      const demi = sc ? sc.demi : [b.min[0] + b.etendue[0], b.etendue[1] / 2, b.etendue[2] / 2];
      for (let n = 0; n < 3; n++) cam.cible[n] = i.borne(cam.cible[n], c[n] - demi[n] * k, c[n] + demi[n] * k);
    }
    function zoomer(facteur, x, y) {
      // Le point sous les doigts (ou le pointeur) reste en place pendant le zoom.
      const m = i.matrices(), r = t.getBoundingClientRect(), dx = x - r.left - r.width / 2, dy = r.height / 2 - (y - r.top);
      const sc = i.scene(), avant = parPixel(), dist = i.borne(cam.dist * facteur, distMin, (sc ? sc.dist : i.distanceEntiere()) * 1.12), apres = avant * dist / cam.dist;
      for (let n = 0; n < 3; n++) cam.cible[n] += (m.droite[n] * dx + m.dessus[n] * dy) * (avant - apres);
      cam.dist = dist; bornerCible(); i.libre();
    }
    function deplacer(dx, dy) {
      const m = i.matrices(), k = parPixel();
      for (let n = 0; n < 3; n++) cam.cible[n] += (-m.droite[n] * dx + m.dessus[n] * dy) * k;
      bornerCible(); i.libre();
    }
    function bas(e) {
      if (e.pointerType === 'mouse' && e.button > 2) return;
      try { t.setPointerCapture(e.pointerId); } catch (err) {}
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      i.arreter(); i.tenir(true); i.elan.az = i.elan.el = 0; vit = { az: 0, el: 0 };
      if (doigts.size === 1) { depart = { x: e.clientX, y: e.clientY, t: performance.now(), bouton: e.button, maj: e.shiftKey }; bouge = false; multi = false; }
      else { multi = true; const p = [...doigts.values()]; pince = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; }
    }
    function glisse(e) {
      const d = doigts.get(e.pointerId); if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY;
      if (doigts.size === 1 && depart) {
        if (!bouge && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) < 8) return;
        bouge = true;
        if (depart.bouton === 2 || depart.maj) deplacer(dx, dy);
        else {
          vit.az = -dx * 0.42; vit.el = dy * 0.30;
          cam.az += vit.az; cam.el = i.borne(cam.el + vit.el, -75, 80);
        }
        i.demander();
      } else if (doigts.size >= 2 && pince) {
        const p = [...doigts.values()], dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), x = (p[0].x + p[1].x) / 2, y = (p[0].y + p[1].y) / 2;
        if (pince.d > 10 && dist > 10) zoomer(pince.d / dist, x, y);
        deplacer(x - pince.x, y - pince.y);
        pince = { d: dist, x, y }; bouge = true;
        i.demander();
      }
    }
    function haut(e) {
      if (!doigts.has(e.pointerId)) return;
      doigts.delete(e.pointerId);
      try { t.releasePointerCapture(e.pointerId); } catch (err) {}
      if (doigts.size === 1) { pince = null; return; }
      if (doigts.size) return;
      i.tenir(false);
      const maintenant = performance.now();
      if (depart && !bouge && !multi && e.type !== 'pointercancel' && maintenant - depart.t < 500) {
        const r = t.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const double = derniere && maintenant - derniere.t < 340 && Math.hypot(x - derniere.x, y - derniere.y) < 30;
        // Seconde touche d'une double touche : c'est la structure de la première qui compte (le corps a pu se
        // recadrer entre les deux, quand la fiche s'ouvre).
        const touche = double ? derniere.touche : a.reperer(x, y);
        derniere = double ? null : { t: maintenant, x, y, touche };
        surTouche(touche, !!double, { x, y });
      } else if (bouge && !multi && depart && depart.bouton !== 2 && !depart.maj) {
        i.elan.az = vit.az; i.elan.el = vit.el;      // l'élan prolonge le geste, puis retombe
        i.demander();
      }
      depart = null;
    }
    function molette(e) {
      e.preventDefault();
      i.arreter();
      zoomer(Math.exp(i.borne(e.deltaY, -120, 120) * (e.ctrlKey ? 0.012 : 0.0022)), e.clientX, e.clientY);
      i.demander();
    }
    function touche(e) {
      const pas = e.shiftKey ? 30 : 10;
      if (e.key === 'ArrowLeft') cam.az -= pas; else if (e.key === 'ArrowRight') cam.az += pas;
      else if (e.key === 'ArrowUp') cam.el = i.borne(cam.el + pas, -75, 80); else if (e.key === 'ArrowDown') cam.el = i.borne(cam.el - pas, -75, 80);
      else if (e.key === '+' || e.key === '=') { const r = t.getBoundingClientRect(); zoomer(0.85, r.left + r.width / 2, r.top + r.height / 2); }
      else if (e.key === '-') { const r = t.getBoundingClientRect(); zoomer(1.18, r.left + r.width / 2, r.top + r.height / 2); }
      else if (e.key === 'Escape') surTouche(null, false, null);
      else return;
      e.preventDefault(); i.arreter(); i.demander();
    }
    const bloquer = e => e.preventDefault();
    t.style.touchAction = 'none'; t.tabIndex = 0;
    t.addEventListener('pointerdown', bas); t.addEventListener('pointermove', glisse);
    t.addEventListener('pointerup', haut); t.addEventListener('pointercancel', haut);
    t.addEventListener('wheel', molette, { passive: false });
    t.addEventListener('keydown', touche);
    t.addEventListener('contextmenu', bloquer);
    t.addEventListener('gesturestart', bloquer); t.addEventListener('gesturechange', bloquer);
  }

  /* =====================================================================
     INTERFACE — les commandes posées sur le corps : modes de carte, couches
     de profondeur, vues, fiche du muscle choisi, index des muscles.
     Les couleurs viennent des jetons de l'appli (--text, --s1, --ligne…),
     avec des valeurs de repli pour fonctionner seule.
     ===================================================================== */
  const STYLE = `
.atlas{position:relative;width:100%;height:100%;overflow:hidden;color:var(--text,#f5f5f7);-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;
  --a-fond:var(--bg,#0a0a0b);--a-carte:var(--s1,#161618);--a-creux:var(--s2,#222225);--a-ligne:var(--ligne,rgba(255,255,255,.08));--a-muet:var(--text-muted,#9b9ba2);--a-inv:var(--inv,#f5f5f7);--a-sur-inv:var(--sur-inv,#0a0a0b);
  background:radial-gradient(ellipse 85% 60% at 50% 44%,var(--a-halo,#1d1d22) 0%,var(--a-fond) 74%)}
.atlas[data-clair]{--a-halo:#ffffff}
.atlas *{box-sizing:border-box}
.atlas button{appearance:none;-webkit-appearance:none;margin:0;font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.atlas-toile{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;cursor:grab}
.atlas-toile:active{cursor:grabbing}
.atlas-verre{background:var(--a-carte);background:color-mix(in srgb,var(--a-carte) 80%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid var(--a-ligne)}
.atlas-haut{position:absolute;top:0;left:0;right:0;padding:8px 0 0;pointer-events:none}
.atlas-modes{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 14px;pointer-events:auto;scroll-snap-type:x proximity}
.atlas-modes::-webkit-scrollbar{display:none}
.atlas-puce{flex:none;height:36px;padding:0 14px;border-radius:18px;color:var(--a-muet);font-size:13px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;scroll-snap-align:center;transition:background .18s,color .18s}
.atlas-puce[aria-pressed="true"]{background:var(--a-inv);color:var(--a-sur-inv);border-color:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}
.atlas-note{margin:8px 16px 0;font-size:12px;line-height:1.35;color:var(--a-muet);text-align:center;pointer-events:none;text-wrap:balance}
.atlas-couches{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;transition:opacity .2s}
.atlas-couches-titre{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--a-muet)}
.atlas-pile{display:flex;flex-direction:column;border-radius:22px;padding:3px;gap:1px}
.atlas-pile button{width:38px;height:38px;border:0;border-radius:19px;background:transparent;color:var(--a-muet);font-size:13px;font-weight:700;display:grid;place-items:center;transition:background .18s,color .18s}
.atlas-pile button[aria-pressed="true"]{background:var(--a-inv);color:var(--a-sur-inv)}
.atlas-pile svg,.atlas-rond svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.atlas-rond{width:44px;height:44px;border-radius:22px;display:grid;place-items:center;color:var(--a-muet);flex:none}
.atlas-rond[aria-pressed="true"]{color:var(--text,#f5f5f7)}
.atlas-rond[aria-pressed="false"]{opacity:.55}
.atlas-bas{position:absolute;left:0;right:0;bottom:0;padding:0 12px max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;transition:opacity .2s,transform .28s cubic-bezier(.2,.8,.2,1)}
.atlas-bas>*{pointer-events:auto}
.atlas-legende{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;font-size:11.5px;font-weight:600;color:var(--a-muet);max-width:420px}
.atlas-legende span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.atlas-legende i{width:9px;height:9px;border-radius:50%;flex:none}
.atlas-barre{display:flex;align-items:center;gap:8px;max-width:100%}
.atlas-vues{display:flex;border-radius:22px;padding:3px;gap:1px;min-width:0}
.atlas-vues button{height:38px;padding:0 13px;border:0;border-radius:19px;background:transparent;color:var(--a-muet);font-size:13px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;transition:background .18s,color .18s}
.atlas-vues button[aria-pressed="true"]{background:var(--a-inv);color:var(--a-sur-inv)}
.atlas-retablir{height:30px;padding:0 12px;border-radius:15px;font-size:12px;font-weight:600;color:var(--text,#f5f5f7)}
.atlas-fiche{position:absolute;left:0;right:0;bottom:0;max-height:52%;display:flex;flex-direction:column;border-radius:22px 22px 0 0;background:var(--s-fen,var(--a-carte));border-top:1px solid var(--a-ligne);box-shadow:0 -18px 44px -18px rgba(0,0,0,.45);transform:translateY(105%);transition:transform .32s cubic-bezier(.2,.8,.2,1);padding:8px 18px max(14px,env(safe-area-inset-bottom));-webkit-user-select:text;user-select:text}
.atlas-fiche[data-ouverte]{transform:none}
.atlas-fiche::before{content:"";width:36px;height:4px;border-radius:2px;background:var(--a-ligne);align-self:center;margin-bottom:8px;flex:none}
.atlas-fiche-tete{display:flex;gap:12px;align-items:flex-start;flex:none}
.atlas-fiche-tete>div{flex:1;min-width:0}
.atlas-fiche h3{margin:0;font-size:19px;line-height:1.2;font-weight:700;letter-spacing:-.02em;text-wrap:balance}
.atlas-latin{margin:3px 0 0;font-size:12.5px;line-height:1.35;color:var(--a-muet)}
.atlas-latin i{font-style:italic}
.atlas-fermer{width:30px;height:30px;border-radius:15px;border:0;background:var(--a-creux);color:var(--a-muet);display:grid;place-items:center;flex:none}
.atlas-fermer svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}
.atlas-defile{overflow-y:auto;-webkit-overflow-scrolling:touch;margin:10px -18px 0;padding:0 18px;min-height:0}
.atlas-etiquettes{display:flex;flex-wrap:wrap;gap:6px}
.atlas-etiquettes span{height:24px;padding:0 9px;border-radius:12px;background:var(--a-creux);font-size:11.5px;font-weight:600;color:var(--a-muet);display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.atlas-etiquettes span b{color:var(--text,#f5f5f7);font-weight:600}
.atlas-donnees{margin-top:12px;font-size:13.5px;line-height:1.45}
.atlas-donnees:empty{display:none}
.atlas-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.atlas-actions button{flex:1 1 auto;height:38px;padding:0 12px;border-radius:12px;border:1px solid var(--a-ligne);background:transparent;font-size:13px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.atlas-actions button[aria-pressed="true"]{background:var(--a-inv);color:var(--a-sur-inv);border-color:transparent}
.atlas-actions svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.atlas-index{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--a-fond);transform:translateY(102%);transition:transform .32s cubic-bezier(.2,.8,.2,1);padding:12px 16px 0;visibility:hidden}
.atlas-index[data-ouvert]{transform:none;visibility:visible}
.atlas-index-tete{display:flex;gap:10px;align-items:center;flex:none}
.atlas-index input{flex:1;min-width:0;height:40px;border-radius:12px;border:1px solid var(--a-ligne);background:var(--a-carte);color:inherit;font:inherit;font-size:16px;padding:0 12px;outline:none;-webkit-user-select:text;user-select:text}
.atlas-index-liste{overflow-y:auto;-webkit-overflow-scrolling:touch;margin:10px -16px 0;padding:0 16px max(16px,env(safe-area-inset-bottom));flex:1}
.atlas-index h4{margin:16px 0 6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--a-muet)}
.atlas-index-liste button{display:flex;width:100%;align-items:center;gap:10px;min-height:44px;padding:8px 0;border:0;border-bottom:1px solid var(--a-ligne);background:transparent;text-align:left;font-size:14.5px}
.atlas-index-liste button small{margin-left:auto;font-size:11.5px;color:var(--a-muet);white-space:nowrap}
.atlas-index-liste button i{width:9px;height:9px;border-radius:50%;flex:none;background:var(--a-creux)}
.atlas-vide{padding:28px 0;text-align:center;color:var(--a-muet);font-size:13.5px}
.atlas-indice{position:absolute;left:50%;top:58px;transform:translateX(-50%);padding:7px 13px;border-radius:16px;font-size:12.5px;font-weight:600;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .35s}
.atlas-indice[data-vu]{opacity:1}
.atlas[data-fiche] .atlas-bas{opacity:0;pointer-events:none;transform:translateY(12px)}
.atlas[data-fiche] .atlas-bas>*{pointer-events:none}
.atlas-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (max-width:360px){.atlas-vues button{padding:0 10px;font-size:12.5px}}
@media (prefers-reduced-motion:reduce){.atlas-fiche,.atlas-index,.atlas-bas,.atlas-indice{transition:none}}
`;
  const IC = {
    retour: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    liste: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
    os: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z"/></svg>',
    voile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5" stroke-dasharray="2.5 3"/></svg>',
    croix: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    centrer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    isoler: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3.2"/><circle cx="12" cy="12" r="3.5"/></svg>',
    masquer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.3-1"/></svg>'
  };
  const NOMS_COUCHES = ['', 'Surface', 'Intermédiaire', 'Profonde', 'Très profonde'];
  const echap = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sansAccent = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function monter(conteneur, tampon, options) {
    const o = Object.assign({ modes: [{ id: 'anatomie', nom: 'Anatomie' }], mode: null, clair: false, carte: null, fiche: null, groupe: null }, options || {});
    if (!document.getElementById('atlas-style')) { const st = document.createElement('style'); st.id = 'atlas-style'; st.textContent = STYLE; document.head.appendChild(st); }
    const racine = document.createElement('div');
    racine.className = 'atlas'; if (o.clair) racine.setAttribute('data-clair', '');
    conteneur.appendChild(racine);
    let a;
    try { a = creer(racine, tampon, { clair: o.clair, accent: o.accent || (o.clair ? '#db2777' : '#f472b6') }); }
    catch (e) { racine.remove(); throw e; }
    const S = a.structures, nbCouches = a.entete.couches;
    const el = (balise, classe, html) => { const n = document.createElement(balise); if (classe) n.className = classe; if (html != null) n.innerHTML = html; return n; };

    /* ----- Haut : les modes de carte ----- */
    const haut = el('div', 'atlas-haut');
    const modes = el('div', 'atlas-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Ce que montrent les couleurs');
    o.modes.forEach(m => { const b = el('button', 'atlas-puce atlas-verre', echap(m.nom)); b.type = 'button'; b.dataset.mode = m.id; modes.appendChild(b); });
    const note = el('p', 'atlas-note');
    haut.appendChild(modes); haut.appendChild(note);
    if (o.modes.length < 2) modes.hidden = true;

    /* ----- Côté : les couches de profondeur ----- */
    const couches = el('div', 'atlas-couches');
    couches.setAttribute('role', 'group'); couches.setAttribute('aria-label', 'Profondeur des muscles affichés');
    const pile = el('div', 'atlas-pile atlas-verre');
    for (let k = 1; k <= nbCouches + 1; k++) {
      const b = el('button', '', k <= nbCouches ? String(k) : IC.os); b.type = 'button'; b.dataset.couche = k;
      b.setAttribute('aria-label', k === 1 ? 'Tous les muscles, depuis la surface' : k <= nbCouches ? `Retirer les couches 1 à ${k - 1} : couche ${NOMS_COUCHES[k].toLowerCase()}` : 'Squelette seul');
      pile.appendChild(b);
    }
    const bVoile = el('button', 'atlas-rond atlas-verre', IC.voile); bVoile.type = 'button';
    bVoile.setAttribute('aria-label', 'Garder en transparence les muscles retirés');
    couches.appendChild(el('span', 'atlas-couches-titre', 'Couches')); couches.appendChild(pile); couches.appendChild(bVoile);

    /* ----- Bas : légende, vues, index ----- */
    const bas = el('div', 'atlas-bas');
    const retablir = el('button', 'atlas-retablir atlas-verre'); retablir.type = 'button'; retablir.hidden = true;
    const legende = el('div', 'atlas-legende'); legende.setAttribute('aria-label', 'Légende des couleurs');
    const barre = el('div', 'atlas-barre');
    const bIndex = el('button', 'atlas-rond atlas-verre', IC.liste); bIndex.type = 'button'; bIndex.setAttribute('aria-label', 'Index des muscles');
    const vues = el('div', 'atlas-vues atlas-verre'); vues.setAttribute('role', 'group'); vues.setAttribute('aria-label', 'Vue');
    [['face', 'Face', 'Vue de face'], ['dos', 'Dos', 'Vue de dos'], ['gauche', 'Gauche', 'Profil gauche'], ['droite', 'Droite', 'Profil droit']].forEach(([id, nom, aria]) => { const b = el('button', '', nom); b.type = 'button'; b.dataset.vue = id; b.setAttribute('aria-label', aria); vues.appendChild(b); });
    const bRetour = el('button', 'atlas-rond atlas-verre', IC.retour); bRetour.type = 'button'; bRetour.setAttribute('aria-label', 'Revenir à la vue de départ');
    barre.appendChild(bIndex); barre.appendChild(vues); barre.appendChild(bRetour);
    bas.appendChild(retablir); bas.appendChild(legende); bas.appendChild(barre);

    /* ----- Fiche du muscle choisi ----- */
    const fiche = el('div', 'atlas-fiche'); fiche.setAttribute('role', 'region'); fiche.setAttribute('aria-label', 'Muscle choisi'); fiche.setAttribute('aria-live', 'polite');
    /* ----- Index ----- */
    const index = el('div', 'atlas-index'); index.setAttribute('role', 'dialog'); index.setAttribute('aria-label', 'Index des muscles');
    index.innerHTML = `<div class="atlas-index-tete"><input type="search" placeholder="Chercher un muscle" aria-label="Chercher un muscle" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="atlas-fermer" aria-label="Fermer l'index">${IC.croix}</button></div><div class="atlas-index-liste"></div>`;
    const indice = el('div', 'atlas-indice atlas-verre', 'Touche un muscle · glisse pour tourner');
    [haut, couches, bas, indice, fiche, index].forEach(n => racine.appendChild(n));

    let mode = null, carte = {}, choisi = null, isoleGroupe = false;
    const etat = () => ({ mode, choisi: choisi && choisi.id, couche: a.couche(), fantomes: a.fantomes(), isoles: a.isoles(), masques: a.masques() });

    function majMarges(immediat) {
      const hFiche = choisi ? fiche.getBoundingClientRect().height : 0;
      a.marges({ haut: haut.getBoundingClientRect().height + 4, bas: choisi ? hFiche : bas.getBoundingClientRect().height + 4 }, immediat);
    }
    function majCouches() {
      const k = a.couche();
      pile.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.couche === k)));
      bVoile.setAttribute('aria-pressed', String(a.fantomes()));
      const nM = a.masques().length, iso = a.isoles();
      retablir.hidden = !(nM || iso);
      retablir.textContent = iso ? 'Tout réafficher' : nM > 1 ? `Réafficher les ${nM} muscles masqués` : 'Réafficher le muscle masqué';
    }
    function majVues(cam) {
      const az = ((cam.az % 360) + 540) % 360 - 180;
      vues.querySelectorAll('button').forEach(b => { let d = Math.abs(az - VUES[b.dataset.vue]); if (d > 180) d = 360 - d; b.setAttribute('aria-pressed', String(d < 12 && Math.abs(cam.el) < 25)); });
    }
    function appliquerCarte() {
      carte = (o.carte && o.carte(mode, S)) || {};
      a.colorer(carte.couleurs || null, { tendons: carte.tendons || 0 });
      a.theme({ muscle: carte.muscle || DEFAUTS.muscle, tendon: carte.tendon || DEFAUTS.tendon, os: carte.os || DEFAUTS.os, estompe: carte.estompe != null ? carte.estompe : DEFAUTS.estompe });
      legende.innerHTML = (carte.legende || []).map(l => `<span><i style="background:${echap(l.c)}"></i>${echap(l.t)}</span>`).join('');
      legende.hidden = !(carte.legende && carte.legende.length);
      note.textContent = carte.note || ''; note.hidden = !carte.note;
      modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      if (choisi) dessinerFiche();
      requestAnimationFrame(() => majMarges());
    }
    function choisirMode(id) {
      if (!o.modes.some(m => m.id === id)) id = o.modes[0].id;
      mode = id; appliquerCarte();
      if (o.surMode) o.surMode(id);
    }
    function dessinerFiche() {
      const s = choisi; if (!s) return;
      const iso = a.isoles(), seul = !!iso && iso.length === 1 && iso[0] === s.id, groupe = o.groupe ? o.groupe(s) : null;
      const sorte = s.type === 'muscle' ? '' : `<span>${s.type === 'aponevrose' ? 'Aponévrose' : 'Tendon'}</span>`;
      fiche.innerHTML = `<div class="atlas-fiche-tete"><div><h3>${echap(s.nom)}</h3><p class="atlas-latin"><i lang="la">${echap(s.latin || '')}</i>${s.anglais ? ` · <span lang="en">${echap(s.anglais)}</span>` : ''}</p></div>
        <button type="button" class="atlas-fermer" data-action="fermer" aria-label="Fermer la fiche">${IC.croix}</button></div>
        <div class="atlas-defile"><div class="atlas-etiquettes"><span>${echap(a.regions[s.region] || s.region)}</span><span>Couche <b>${s.couche}</b> · ${NOMS_COUCHES[s.couche].toLowerCase()}</span>${sorte}</div>
        <div class="atlas-donnees">${(o.fiche && o.fiche(s, mode)) || ''}</div>
        <div class="atlas-actions"><button type="button" data-action="centrer">${IC.centrer}Centrer</button>
        <button type="button" data-action="isoler" aria-pressed="${seul}">${IC.isoler}Isoler</button>
        ${groupe && groupe.ids.length > 1 ? `<button type="button" data-action="groupe" aria-pressed="${!!iso && !seul && isoleGroupe}">${IC.isoler}${echap(groupe.nom)}</button>` : ''}
        <button type="button" data-action="masquer">${IC.masquer}Masquer</button></div></div>`;
    }
    function choisir(id, opts) {
      const s = id == null ? null : S[a.indice(id)] || null;
      if (!s && choisi && a.isoles()) { a.isoler(null); isoleGroupe = false; }
      choisi = s; a.choisir(s ? s.id : null);
      if (s) { dessinerFiche(); fiche.setAttribute('data-ouverte', ''); racine.setAttribute('data-fiche', ''); }
      else { fiche.removeAttribute('data-ouverte'); racine.removeAttribute('data-fiche'); }
      indice.removeAttribute('data-vu');
      majCouches();
      requestAnimationFrame(() => { majMarges(); if (s && opts && opts.cadrer) a.cadrer(s.id); });
      if (o.surChoix) o.surChoix(s);
    }
    // Amène une structure à l'écran, où qu'elle soit (masquée, retirée avec sa couche, ou enfouie sous d'autres).
    function montrer(s) {
      if (a.masques().includes(s.id)) a.masquer(s.id, false);
      // On se place à la couche du muscle : un muscle profond se découvre (ceux qui le recouvrent passent en fantômes),
      // un muscle de surface revient si on l'avait retiré.
      if (s.couche !== a.couche()) a.couche(s.couche);
      const iso = a.isoles(); if (iso && !iso.includes(s.id)) { a.isoler(null); isoleGroupe = false; }
      majCouches();
    }

    activerGestes(a, (touche, double) => {
      if (!touche || touche.os) { if (double) { a.reinitialiser(); return; } if (choisi) choisir(null); return; }
      const s = touche.structure;
      if (double) { if (!choisi || choisi.id !== s.id) choisir(s.id); a.cadrer(s.id); return; }
      if (choisi && choisi.id === s.id) choisir(null); else choisir(s.id);
    });
    a.surImage = cam => { majVues(cam); if (o.surImage) o.surImage(cam); };

    modes.addEventListener('click', e => { const b = e.target.closest('button'); if (b) choisirMode(b.dataset.mode); });
    pile.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      a.couche(+b.dataset.couche); majCouches();
      if (choisi && choisi.couche < a.couche()) choisir(null);
    });
    bVoile.addEventListener('click', () => { a.fantomes(!a.fantomes()); majCouches(); });
    vues.addEventListener('click', e => { const b = e.target.closest('button'); if (b) a.vue(b.dataset.vue); });
    bRetour.addEventListener('click', () => { a.toutAfficher(); isoleGroupe = false; majCouches(); a.reinitialiser(); });
    retablir.addEventListener('click', () => { const k = a.couche(); a.toutAfficher(); a.couche(k); isoleGroupe = false; majCouches(); if (choisi) dessinerFiche(); });
    fiche.addEventListener('click', e => {
      const b = e.target.closest('button[data-action]'); if (!b || !choisi) return;
      const act = b.dataset.action, s = choisi;
      if (act === 'fermer') choisir(null);
      else if (act === 'centrer') a.cadrer(s.id);
      else if (act === 'isoler') { const iso = a.isoles(), seul = iso && iso.length === 1 && iso[0] === s.id; a.isoler(seul ? null : [s.id]); isoleGroupe = false; if (!seul) a.cadrer(s.id); majCouches(); dessinerFiche(); }
      else if (act === 'groupe') { const g = o.groupe && o.groupe(s), actif = a.isoles() && isoleGroupe; a.isoler(actif || !g ? null : g.ids); isoleGroupe = !actif && !!g; majCouches(); dessinerFiche(); }
      else if (act === 'masquer') { a.masquer(s.id); choisir(null); }
    });

    /* ----- Index des muscles ----- */
    const champ = index.querySelector('input'), liste = index.querySelector('.atlas-index-liste');
    function remplirIndex() {
      const q = sansAccent(champ.value.trim());
      const parRegion = {};
      S.forEach(s => { if (!q || sansAccent(s.nom + ' ' + (s.latin || '') + ' ' + (s.anglais || '')).includes(q)) (parRegion[s.region] = parRegion[s.region] || []).push(s); });
      const html = Object.keys(a.regions).filter(r => parRegion[r]).map(r => `<h4>${echap(a.regions[r])}</h4>` + parRegion[r].map(s => {
        const c = carte.couleurs && carte.couleurs[s.id];
        return `<button type="button" data-id="${echap(s.id)}"><i${c ? ` style="background:${echap(c)}"` : ''}></i><span>${echap(s.nom)}</span><small>couche ${s.couche}</small></button>`;
      }).join('')).join('');
      liste.innerHTML = html || '<p class="atlas-vide">Aucun muscle ne porte ce nom.</p>';
    }
    function ouvrirIndex(v) {
      if (v) { champ.value = ''; remplirIndex(); index.setAttribute('data-ouvert', ''); }
      else { index.removeAttribute('data-ouvert'); champ.blur(); }
    }
    bIndex.addEventListener('click', () => ouvrirIndex(true));
    index.querySelector('.atlas-fermer').addEventListener('click', () => ouvrirIndex(false));
    champ.addEventListener('input', remplirIndex);
    liste.addEventListener('click', e => {
      const b = e.target.closest('button[data-id]'); if (!b) return;
      const s = S[a.indice(b.dataset.id)]; ouvrirIndex(false); montrer(s); choisir(s.id, { cadrer: true });
    });

    majCouches();
    choisirMode(o.mode || o.modes[0].id);
    majMarges(true);
    a.reinitialiser(0);
    let vu = false; try { vu = !!localStorage.getItem('anqa_atlas_indice'); } catch (e) {}
    if (!vu) { setTimeout(() => indice.setAttribute('data-vu', ''), 700); setTimeout(() => indice.removeAttribute('data-vu'), 5200); try { localStorage.setItem('anqa_atlas_indice', '1'); } catch (e) {} }
    const surTaille = () => majMarges();
    window.addEventListener('resize', surTaille);

    return {
      atlas: a, racine, etat, choisirMode, choisir, montrer, ouvrirIndex,
      couche(k) { a.couche(k); majCouches(); if (choisi && choisi.couche < a.couche()) choisir(null); },
      fantomes(v) { a.fantomes(v); majCouches(); },
      rafraichir: appliquerCarte,
      theme(clair) { o.clair = !!clair; racine.toggleAttribute('data-clair', o.clair); a.theme({ clair: o.clair, accent: o.accent || (o.clair ? '#db2777' : '#f472b6') }); appliquerCarte(); },
      detruire() { window.removeEventListener('resize', surTaille); a.detruire(); racine.remove(); }
    };
  }

  window.AnqaAtlas = { creer, activerGestes, monter, VUES };
})();
