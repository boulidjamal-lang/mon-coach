
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
