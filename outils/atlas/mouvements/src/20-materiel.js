
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
