  /* ---------- Les machines de salle ----------
     Les machines guidées des salles (leg extension, leg curl, presses, tirages, pec deck…), dessinées d'après leur
     fonctionnement et non d'après le modèle d'une marque : un bâti de profilés ovales posé au sol, la pile de poids
     dans une tour carénée (une fente laisse voir les plaques qui montent), des coussins réglés sur le corps, et des
     bras mobiles rigides qui tournent chacun autour d'un axe — celui de l'articulation qui travaille (genou, coude,
     épaule, hanche), marqué d'une pastille comme sur les machines. Le corps est posé sur l'arc du bras (les mains, les
     chevilles y tombent juste) ; à chaque image, le bras tourne de l'angle qui amène sa poignée ou son boudin sur la
     main ou la jambe : rien ne s'allonge ni ne se tord. */

  /* Un profilé ovale (section l × e, l'aplat tourné vers `face`) entre deux points : les montants, les longerons. */
  const ovale = (a, b, l, e, couleur, metal, face) => {
    const d = b.clone().sub(a), lg = d.length() || 1e-4, y = d.multiplyScalar(1 / lg);
    let x = perp(face || (Math.abs(y.y) > 0.9 ? AX : AY), y);
    if (x.lengthSq() < 1e-6) x = perpendiculaire(y);
    x.normalize();
    return { forme: 'boite', s: [l, lg + e * 0.4, e], p: a.clone().add(b).multiplyScalar(0.5), q: new Quat().setFromBasis(x, y, x.clone().cross(y)), couleur, metal: metal == null ? 0.5 : metal, r: e * 0.45 };
  };
  const profil = (C, a, b, face, l = 0.075, e = 0.048) => ovale(a, b, l, e, C.cadre, 0.5, face);
  /* Moyeu d'un bras mobile : le palier sur son axe, une pastille de couleur au bout (l'alignement de l'articulation). */
  function moyeu(C, p, axe, r = 0.052, l = 0.085) {
    const n = unite(axe);
    return [seg(p.clone().addScaledVector(n, -l / 2), p.clone().addScaledVector(n, l / 2), r, C.cadre, 0.55, 0.012),
      seg(p.clone().addScaledVector(n, l / 2 - 0.002), p.clone().addScaledVector(n, l / 2 + 0.006), r * 0.52, C.repere, 0.25, 0.003),
      seg(p.clone().addScaledVector(n, -l / 2 - 0.006), p.clone().addScaledVector(n, -l / 2 + 0.002), r * 0.52, C.repere, 0.25, 0.003)];
  }
  /* La came d'un bras à charge guidée : un disque plat sur l'axe, d'où part la sangle vers la pile. */
  const came = (C, p, axe, r = 0.075) => { const n = unite(axe); return [seg(p.clone().addScaledVector(n, -0.01), p.clone().addScaledVector(n, 0.01), r, C.cadre, 0.45, 0.006)]; };
  /* Poignée de machine entre deux points : l'âme d'acier, le manchon de gomme. */
  const manchon = (C, a, b, r = 0.0165) => [seg(a, b, 0.0125, C.metal, 1), seg(a.clone().lerp(b, 0.08), a.clone().lerp(b, 0.92), r, C.gomme, 0, 0.005)];
  /* Boudin d'un bras de jambes : la mousse sur son axe d'acier, entre deux points. */
  const boudin = (C, a, b, r = 0.052) => [seg(a, b, 0.014, C.metal, 0.8), seg(a.clone().lerp(b, 0.04), a.clone().lerp(b, 0.96), r, C.banc, 0.12, Math.min(0.022, r * 0.45))];

  /* La tour de charge, dans son repère (posée au sol, la fente vers +Z) : un socle, deux flancs et un dos carénés, un
     chapeau, deux joues devant qui laissent voir la pile (ses plaques du haut montent avec la charge). */
  function tourCharge(C, h = 1.5) {
    const f = [boite(0.48, 0.04, 0.44, 0, 0.02, 0, C.cadre, 0.45, null, 0.012)];
    for (const s of [1, -1]) {
      f.push(boite(0.035, h, 0.4, s * 0.215, h / 2 + 0.02, 0, C.banc, 0.18, null, 0.012));
      f.push(boite(0.075, h - 0.12, 0.025, s * 0.17, h / 2 + 0.02, 0.188, C.banc, 0.18, null, 0.008));
    }
    f.push(boite(0.4, h, 0.022, 0, h / 2 + 0.02, -0.19, C.banc, 0.18, null, 0.006));
    f.push(boite(0.5, 0.075, 0.45, 0, h + 0.05, 0, C.cadre, 0.45, null, 0.02));
    f.push(...pile(C, 0, 0.02, 0.07, h - 0.04));
    return f;
  }
  /* Où se tient la tour et ce qui la relie au reste : posée en `pos`, tournée de `rot` (autour de Y). */
  const placerTour = (C, pos, rot, h) => deplacer(tourCharge(C, h), pos, rot);

  /* Un bras mobile : ses formes sont données à la position de départ ; il tourne autour de l'axe `axe` passant par
     `pivot`. suit(info) : le point du corps qu'il suit ; ref : ce même point au départ. À chaque image, il tourne de
     l'angle qui amène ref sur le point suivi (l'un et l'autre vus dans le plan de rotation). */
  function brasMobile(pivot, axe, formes, ref, suit) {
    const n = unite(axe), r0 = perp(ref.clone().sub(pivot), n);
    const angle = info => {
      const r1 = perp(suit(info).clone().sub(pivot), n);
      if (r1.lengthSq() < 1e-10 || r0.lengthSq() < 1e-10) return 0;
      return Math.atan2(r0.clone().cross(r1).dot(n), r0.dot(r1));
    };
    const dessiner = (info, u, sortie) => {
      const q = qAxe(n, angle(info));
      for (const f of formes) sortie.push(pret(Object.assign({}, f, { p: f.p.clone().sub(pivot).applyQuaternion(q).add(pivot), q: f.aPlat ? f.q : q.clone().multiply(f.q) })));
    };
    return { angle, dessiner, pivot, axe: n };
  }
  /* Le pivot le plus proche de P0 (l'axe gardant la direction n) qui soit à la même distance de a et de b, les deux
     positions extrêmes du point suivi : le bras rigide les touche toutes deux (sinon, le point suivi s'écartant ou se
     rapprochant du pivot, le boudin rentrait dans le membre ou le quittait). */
  function pivotEgal(P0, n, a, b) {
    const u = unite(n), pa = perp(a.clone().sub(P0), u).add(P0), pb = perp(b.clone().sub(P0), u).add(P0);
    const w = pb.clone().sub(pa); if (w.lengthSq() < 1e-8) return P0.clone();
    w.normalize(); const M = pa.clone().add(pb).multiplyScalar(0.5);
    return P0.clone().addScaledVector(w, -P0.clone().sub(M).dot(w));
  }
  /* Le pivot du cercle qui passe par trois positions du point suivi (début, milieu, fin de la course), vues dans le plan
     de rotation : le bras rigide les touche toutes trois, et presque toutes celles d'entre elles. Si elles sont presque
     alignées (le cercle serait immense), le pivot à égale distance des deux bouts le plus proche de P0. */
  function pivotCercle(P0, n, pts) {
    const u = unite(n), pl = q => perp(q.clone().sub(P0), u);
    const a = pl(pts[0]), b = pl(pts[Math.floor(pts.length / 2)]), c2 = pl(pts[pts.length - 1]);
    const ab = b.clone().sub(a), ac = c2.clone().sub(a), nn = ab.clone().cross(ac), d2 = 2 * nn.lengthSq();
    if (d2 < 1e-10) return pivotEgal(P0, n, pts[0], pts[pts.length - 1]);
    const ctr = ac.clone().cross(nn).multiplyScalar(ab.lengthSq()).add(nn.clone().cross(ab).multiplyScalar(ac.lengthSq())).multiplyScalar(1 / d2).add(a);
    if (ctr.distanceTo(a) > 1.6) return pivotEgal(P0, n, pts[0], pts[pts.length - 1]);
    return ctr.add(P0);
  }
  /* Le point `p` tourné de l'angle a (radians) autour de l'axe `axe` passant par `pivot`. */
  const surArc = (pivot, axe, p, a) => p.clone().sub(pivot).applyQuaternion(qAxe(unite(axe), a)).add(pivot);

  /* Siège et dossier d'une machine, aux mêmes places que ceux du banc (MAT.banc : le corps posé par allonge s'y
     ajuste) : le dossier relevé de `angle` degrés, sa charnière à l'origine, la tête vers -Z ; l'assise devant, sa
     face à la hauteur h. Dessous : la platine du dossier, le fût du siège (réglable : une tige et sa goupille), et une
     jambe de force vers le longeron. Rend les formes ; .zArriere : le bas du dossier. */
  function posteAssis(C, h, angle, lDossier = 0.62, lSiege = 0.34, larg = 0.36) {
    const f = [], a = rad(angle), ep = 0.065, qd = qAxe(AX, a);
    const mil = V(0, h - ep / 2 + Math.sin(a) * lDossier / 2, -Math.cos(a) * lDossier / 2);
    f.push(coussin(larg, ep, lDossier, mil.x, mil.y, mil.z, C, qd));
    f.push(coussin(larg, ep, lSiege, 0, h - ep / 2 + 0.02, lSiege / 2 + 0.012, C, qAxe(AX, rad(-8))));
    // La platine sous l'assise, celle derrière le dossier.
    f.push(boite(larg * 0.7, 0.025, lSiege * 0.8, 0, h - ep - 0.005, lSiege / 2, C.cadre, 0.45, qAxe(AX, rad(-8)), 0.006));
    const dos = V(0, -ep / 2 - 0.02, 0).applyQuaternion(qd);
    f.push(boite(larg * 0.55, 0.025, lDossier * 0.85, mil.x + dos.x, mil.y + dos.y, mil.z + dos.z, C.cadre, 0.45, qd, 0.006));
    // Le fût réglable sous l'assise : le tube extérieur, la tige, la goupille rose.
    const zF = lSiege * 0.45, yH = h - ep - 0.02;
    f.push(profil(C, V(0, 0.05, zF), V(0, yH - 0.14, zF), AZ, 0.085, 0.085));
    f.push(profil(C, V(0, yH - 0.2, zF), V(0, yH, zF), AZ, 0.06, 0.06));
    f.push(cyl(0.012, 0.05, 0, yH - 0.17, zF + 0.065, C.metal, 0.8, LONG_Z), sphere(0.02, 0, yH - 0.17, zF + 0.095, C.repere, 0.2));
    // La jambe de force : du bas du dossier au pied du fût.
    const basDos = mil.clone().add(dos).add(V(0, -Math.sin(a) * lDossier * 0.35, Math.cos(a) * lDossier * 0.35));
    f.push(profil(C, basDos, V(0, 0.06, zF - 0.02), AX, 0.06, 0.045));
    f.zArriere = mil.z - Math.cos(a) * lDossier / 2 - 0.05;
    return f;
  }
  /* Le longeron au sol, d'un bout à l'autre de la machine (le long de Z), avec ses patins. */
  const longeron = (C, z0, z1, x = 0) => [profil(C, V(x, 0.03, z0), V(x, 0.03, z1), AY, 0.09, 0.055),
    boite(0.12, 0.012, 0.14, x, 0.006, z0, C.gomme, 0, null, 0.004), boite(0.12, 0.012, 0.14, x, 0.006, z1, C.gomme, 0, null, 0.004)];
  /* Une traverse au sol (le long de X), avec ses patins. */
  const traverse = (C, x0, x1, z) => [profil(C, V(x0, 0.03, z), V(x1, 0.03, z), AY, 0.08, 0.05),
    boite(0.1, 0.012, 0.12, x0, 0.006, z, C.gomme, 0, null, 0.004), boite(0.1, 0.012, 0.12, x1, 0.006, z, C.gomme, 0, null, 0.004)];
  /* Une poignée fixe sous la main, au bout d'une tige qui part du bâti en `depuis` : le manchon dans l'axe de la prise. */
  function poigneeFixe(C, info, k, depuis) {
    const pr = info.prises[k], ax = unite(info.axes[k].clone()), a = pr.clone().addScaledVector(ax, -0.07), b = pr.clone().addScaledVector(ax, 0.07);
    const bout = a.distanceTo(depuis) < b.distanceTo(depuis) ? a : b;
    return [...manchon(C, a, b), seg(bout, depuis, 0.014, C.cadre, 0.5, 0.006)];
  }

  const moyenneDe = pts => pts.reduce((a, b) => a.add(b), V()).multiplyScalar(1 / pts.length);
  /* Leg extension et leg curl assis. Le poste assis (siège à h, dossier relevé de `angle`), la tour derrière le
     dossier ; le bras mobile tourne dans l'axe des genoux, sur le flanc gauche de la machine — sa pastille en face du
     genou — et porte le boudin en travers des deux jambes : contre le bas des tibias (sens = -1, extension) ou
     au-dessus des talons (sens = +1, curl). cuisses : le boudin qui tient les cuisses au-dessus des genoux (curl
     assis). Une poignée sous chaque main, de part et d'autre de l'assise. d.a : la pose de départ ; cotes : les jambes
     qui travaillent. Remplit fixe, d.objets et d.levee. */
  function posteJambes(c, C, d, fixe, h, angle, sens, cotes, cuisses) {
    const i0 = c.poser(d.a), L = c.L;
    const g = moyenneDe(cotes.map(k => i0.genoux[k])), ch = moyenneDe(cotes.map(k => i0.chevilles[k])), dj = unite(ch.clone().sub(g));
    // Le devant du tibia : perpendiculaire à la jambe, du côté des orteils.
    let dev = perp(i0.orteils[cotes[0]].clone().sub(i0.chevilles[cotes[0]]).setX(0), dj); if (dev.lengthSq() < 1e-6) dev = perpendiculaire(dj); dev.normalize();
    const rc = ch.clone().addScaledVector(dev, -sens * 0.09).addScaledVector(dj, -0.03), xP = 0.27;
    const P = V(xP, g.y, g.z), E = V(xP, rc.y, rc.z);
    // Le bras : le palier, la came, le profilé jusqu'au boudin, la douille de réglage, le boudin.
    const formes = [...moyeu(C, P, AX), ...came(C, P.clone().setX(xP + 0.065), AX), profil(C, P, E, AX, 0.07, 0.045),
      ovale(E.clone().addScaledVector(dj, -0.09), E.clone().addScaledVector(dj, 0.03), 0.085, 0.06, C.cadre, 0.5, AX),
      ...boudin(C, V(xP - 0.02, rc.y, rc.z), V(-0.23, rc.y, rc.z))];
    const bras = brasMobile(P, AX, formes, ch, info => moyenneDe(cotes.map(k => info.chevilles[k])));
    // L'axe du bras : une broche d'acier qui sort du montant.
    const poste = posteAssis(C, h, angle, 0.62, 0.32), zS = poste.zArriere;
    fixe.push(...poseFixe(poste));
    fixe.push(pret(seg(V(xP - 0.05, g.y, g.z), V(xP + 0.13, g.y, g.z), 0.02, C.metal, 0.9)));
    fixe.push(pret(profil(C, V(xP + 0.12, 0.03, g.z - 0.22), V(xP + 0.12, g.y + 0.03, g.z), AX, 0.075, 0.05)));
    fixe.push(...poseFixe(traverse(C, xP + 0.12, -0.05, g.z - 0.22)));
    // La tour derrière le dossier, sa fente vers le flanc gauche ; le longeron qui la relie à l'avant.
    const zT = zS - 0.32;
    fixe.push(...poseFixe(placerTour(C, V(0, 0, zT), qY(90), 1.45)));
    fixe.push(...poseFixe(longeron(C, zT + 0.2, g.z - 0.2)));
    // Le boudin des cuisses (curl assis) : fixe, juste au-dessus des cuisses, sur une potence du flanc droit.
    if (cuisses) {
      let haut = -Infinity;
      for (const u of [0, 0.25, 0.5, 0.75, 1]) { c.poser(mel(d.a, d.b, u)); c.peauPosee(['cuisse'], (x, y, z) => { if (Math.abs(x) < 0.16 && Math.abs(z - (g.z - 0.1)) < 0.04 && y > haut) haut = y; }); }
      const yC = (isFinite(haut) ? haut : g.y + 0.08) + 0.048 - ENFONCE, zC = g.z - 0.1;
      fixe.push(...poseFixe(boudin(C, V(-0.27, yC, zC), V(0.22, yC, zC), 0.05)));
      fixe.push(pret(profil(C, V(-0.29, yC, zC), V(-0.29, 0.03, zC - 0.25), AX, 0.07, 0.045)));
    }
    // Les poignées sous les mains, tenues par le bâti de l'assise.
    for (const [k, s] of COTES) fixe.push(...poseFixe(poigneeFixe(C, i0, k, V(s * 0.2, h - 0.09, i0.prises[k].z - 0.06))));
    d.objets = (info, u, sortie) => bras.dessiner(info, u, sortie);
    d.levee = info => 0.12 * Math.abs(bras.angle(info));
    return bras;
  }

  /* Le siège et le coussin de poitrine d'un poste où l'on se tient assis face à la machine (rowing, oiseau) : l'assise
     à h, le coussin debout devant le sternum, posé contre la poitrine telle que la pose p la place. */
  function postePoitrine(c, C, p, h) {
    c.poser(p);
    let zMax = -Infinity, yS = 0, n = 0;
    const t = c.tronc(p), yH = t.epaules.G.y;
    c.poser(p);
    c.peauPosee(['thorax'], (x, y, z) => { if (Math.abs(x) < 0.09 && y < yH - 0.06 && y > yH - 0.3) { if (z > zMax) zMax = z; yS += y; n++; } });
    const zC = (isFinite(zMax) ? zMax : t.epaules.G.z + 0.15) + 0.035 - ENFONCE, yC = n ? yS / n : yH - 0.18;
    const f = [coussin(0.3, 0.42, 0.07, 0, yC, zC, C), boite(0.2, 0.36, 0.025, 0, yC, zC + 0.05, C.cadre, 0.45, null, 0.006)];
    f.push(coussin(0.36, 0.065, 0.34, 0, h - 0.0325, -0.02, C), boite(0.25, 0.025, 0.28, 0, h - 0.075, -0.02, C.cadre, 0.45, null, 0.006));
    f.push(profil(C, V(0, 0.05, -0.02), V(0, h - 0.085, -0.02), AZ, 0.085, 0.085), cyl(0.012, 0.05, 0, h - 0.25, 0.045, C.metal, 0.8, LONG_Z), sphere(0.02, 0, h - 0.25, 0.075, C.repere, 0.2));
    f.push(profil(C, V(0, 0.05, zC + 0.12), V(0, yC - 0.1, zC + 0.065), AZ, 0.075, 0.05));
    f.zPoitrine = zC; f.yPoitrine = yC;
    return f;
  }

  /* Un exercice de bras à la machine. La famille a posé les mains au départ (d.a) et à l'arrivée (d.b) ; elles tiennent
     les poignées de bras mobiles (un par main qui travaille) qui tournent chacun autour d'un axe. Pivot calculé : il
     est choisi du côté o.pivot de la course ('haut', 'bas', 'arriere', 'avant', ou un vecteur), à la distance qui donne
     au bras la longueur o.rayon, et à o.ecart du milieu ; l'axe est celui qui amène la main du départ à l'arrivée.
     Pivot donné : o.axe(k, iA, iB) rend { P, n }. Les mains suivent l'arc (poses clés), leur orientation tourne avec la
     poignée ; le reste du corps va du départ à l'arrivée comme la famille l'a dit.
     o.poste : { h, angle } (assise et dossier, le corps posé par allonge) ou { h, poitrine: true } (assise, coussin de
     poitrine) ; o.tour : 'derriere' | 'devant' ; o.cotes : les mains qui travaillent. Rend les bras (pour les bâtis
     particuliers) ; remplit d.cles, d.fixe, d.objets, d.levee. */
  function surMachine(c, C, d, o) {
    const cotes = o.cotes || ['G', 'D'], iA = c.poser(d.a), iB = c.poser(d.b);
    const A0 = cloner(d.a), B0 = cloner(d.b), N = o.n || 8;
    const vers = { haut: AY, bas: V(0, -1, 0), arriere: V(0, 0, -1), avant: AZ };
    const arcs = {};
    for (const k of cotes) {
      const s = k === 'G' ? 1 : -1, A = iA.prises[k].clone(), B = iB.prises[k].clone();
      let P, n;
      if (o.axe) ({ P, n } = o.axe(k, iA, iB));
      else {
        const w = unite(B.clone().sub(A)), M = A.clone().add(B).multiplyScalar(0.5), demi = A.distanceTo(B) / 2;
        const dir = unite(perp(typeof o.pivot === 'string' ? vers[o.pivot] : o.pivot, w)), D = Math.sqrt(Math.max(0.01, Math.pow(o.rayon || 0.8, 2) - demi * demi));
        P = M.clone().addScaledVector(dir, D);
        const v = perp(AX, w); if (o.ecart != null && Math.abs(v.x) > 0.3) P.addScaledVector(v, (s * o.ecart - P.x) / v.x);
        n = unite(A.clone().sub(P).cross(B.clone().sub(P)));
      }
      const rA = perp(A.clone().sub(P), n), rB = perp(B.clone().sub(P), n);
      const tot = Math.atan2(rA.clone().cross(rB).dot(n), rA.dot(rB));
      // Le côté du coude : celui que la famille a donné ; sinon, mesuré sur le corps posé — bras tendu, le coude est sur la
      // ligne épaule-main et son côté ne se lit plus : on garde celui de l'autre bout de la course.
      const mesure = (i, H) => i.coudes[k].clone().sub(i.epaules[k].clone().add(H).multiplyScalar(0.5));
      let poleA = d.a.bras[k] && d.a.bras[k].pole ? d.a.bras[k].pole.clone() : mesure(iA, A), poleB = d.b.bras[k] && d.b.bras[k].pole ? d.b.bras[k].pole.clone() : mesure(iB, B);
      if (poleA.length() < 0.04) poleA = poleB.clone(); if (poleB.length() < 0.04) poleB = poleA.clone();
      if (o.pole) { const p = o.pole(k); if (p.A) { poleA = p.A.clone(); poleB = p.B.clone(); } else poleA = poleB = p; }
      arcs[k] = { P, n, A, tot, paume: iA.paumes[k].clone(), dirMain: iA.dirMains[k].clone(), axeMain: iA.axes[k].clone(), poleA: poleA.normalize(), poleB: poleB.normalize(),
        paumeB: iB.paumes[k].clone(), dirMainB: iB.dirMains[k].clone() };
    }
    // Poignées pivotantes quand le bras tourne beaucoup (plus de 45°) : la main garde l'orientation que la famille lui
    // donne d'un bout à l'autre, la poignée tourne sur son axe au bout du bras (sinon le poignet suivait le bras et le
    // coude finissait par basculer de l'autre côté).
    const pivotante = k => o.pivotantes != null ? o.pivotantes : Math.abs(arcs[k].tot) > Math.PI / 4;
    // Les poses clés : les mains sur l'arc (o.garderPoses : la famille les y met déjà — un avant-bras qui tourne autour
    // du coude — et ses poses par angles gardent le coude en place sur le pupitre).
    d.cles = [];
    if (o.garderPoses) d.cles = [[0, A0], [1, B0]];
    else for (let i = 0; i <= N; i++) {
      const f = i / N, q = mel(A0, B0, f), cibles = {};
      for (const k of cotes) {
        const a = arcs[k], rot = qAxe(a.n, f * a.tot);
        const pole = a.poleA.dot(a.poleB) > -0.95 ? a.poleA.clone().applyQuaternion(new Quat().slerp(new Quat().setFromUnitVectors(a.poleA, a.poleB), f)) : a.poleA.clone();
        const libre = pivotante(k), paume = libre ? a.paume.clone().lerp(a.paumeB, f).normalize() : a.paume.clone().applyQuaternion(rot), dirMain = libre ? a.dirMain.clone().lerp(a.dirMainB, f).normalize() : a.dirMain.clone().applyQuaternion(rot);
        // (Ce que la famille a écrit de l'épaule et du poignet passe tel quel — épaules haussées ou avancées, part de la
        // ceinture, poignet cassé : sans cela le shrug montait les mains en pliant les coudes, et en haut du développé
        // épaules l'épaule montait trop, le coude restait plié à 24°.)
        const g = q.bras[k] || {};
        q.bras[k] = { prise: surArc(a.P, a.n, a.A, f * a.tot), paume, dirMain, pole, doigts: 'barre', rayon: 0.017 };
        for (const r of ['hausse', 'avance', 'ceinture', 'casse']) if (g[r] != null) q.bras[k][r] = g[r];
        cibles[k] = q.bras[k].prise.clone();
      }
      viser(c, q, cibles);
      d.cles.push([f, q]);
    }
    delete d.a; delete d.b;
    // Les bras mobiles : le palier, le profilé jusqu'au bout de la poignée, la poignée.
    const i0 = c.poser(d.cles[0][1]), bras = {};
    for (const k of cotes) {
      const a = arcs[k], ax = unite(i0.axes[k].clone()), pr = i0.prises[k];
      const e1 = pr.clone().addScaledVector(ax, -0.075), e2 = pr.clone().addScaledVector(ax, 0.075), bout = e1.distanceTo(a.P) < e2.distanceTo(a.P) ? e1 : e2;
      const coude = o.dehors ? bout.clone().add(V(Math.sign(pr.x || 1) * o.dehors, 0, 0)).lerp(a.P, 0.12) : bout.clone().lerp(a.P, 0.18).addScaledVector(perp(bout.clone().sub(pr), a.n).normalize(), 0.03);
      const formes = [...moyeu(C, a.P, a.n), profil(C, a.P, coude, a.n, 0.065, 0.042), profil(C, coude, bout, a.n, 0.055, 0.036)];
      if (!pivotante(k)) formes.push(...manchon(C, e1, e2));
      bras[k] = brasMobile(a.P, a.n, formes, pr, info => info.prises[k]);
      if (pivotante(k)) {
        // La poignée suit la main ; une chape relie son bout au bout du bras, autour duquel elle pivote.
        const dessinerBras = bras[k].dessiner, bout0 = bout.clone();
        bras[k].dessiner = (info, u, sortie) => {
          dessinerBras(info, u, sortie);
          const B2 = surArc(a.P, a.n, bout0, bras[k].angle(info)), ax2 = unite(info.axes[k].clone()), p2 = info.prises[k];
          const f1 = p2.clone().addScaledVector(ax2, -0.075), f2 = p2.clone().addScaledVector(ax2, 0.075), b2 = f1.distanceTo(B2) < f2.distanceTo(B2) ? f1 : f2;
          for (const f of manchon(C, f1, f2)) sortie.push(pret(f));
          sortie.push(pret(seg(B2, b2, 0.016, C.cadre, 0.5, 0.006)), pret(sphere(0.022, B2.x, B2.y, B2.z, C.cadre, 0.5)));
        };
      }
    }
    const garde = o.garder ? d.fixe : [];
    d.fixe = garde.slice();
    // Le poste : assise et dossier, ou assise et coussin de poitrine.
    let zDos = null;
    if (o.poste && o.poste.angle != null) { const ps = posteAssis(C, o.poste.h, o.poste.angle, 0.62, 0.32); zDos = ps.zArriere; d.fixe.push(...poseFixe(ps)); }
    else if (o.poste && o.poste.poitrine) d.fixe.push(...poseFixe(postePoitrine(c, C, d.cles[0][1], o.poste.h)));
    d.objets = (info, u, sortie) => { for (const k of cotes) bras[k].dessiner(info, u, sortie); };
    d.levee = info => 0.1 * Math.max(...cotes.map(k => Math.abs(bras[k].angle(info))));
    // Les paliers : le point et l'axe autour desquels tourne chaque bras (les tests vérifient qu'ils sont ceux de
    // l'articulation qui travaille).
    d.paliers = {};
    for (const k of cotes) d.paliers[k] = { pivot: arcs[k].P.clone(), axe: arcs[k].n.clone() };
    return { bras, arcs, zDos, i0 };
  }

  /* Le bâti qui porte les paliers des bras (M : ce que rend surMachine). Les paliers au-dessus de la course
     (pivot 'haut') : une colonne derrière le dossier (ou devant, `devant`), une poutre qui avance au-dessus de la tête,
     une traverse qui porte les deux paliers. Derrière (pivot 'arriere') : la traverse derrière le dossier, sur la
     colonne. La tour derrière la colonne (ou devant, du côté de la colonne). */
  function batiBras(C, d, M, o) {
    o = o || {};
    const ks = Object.keys(M.arcs), P = ks.map(k => M.arcs[k].P), f = [];
    const yH = Math.max(...P.map(p => p.y)), zH = P.reduce((t, p) => t + p.z, 0) / P.length, xH = Math.max(...P.map(p => Math.abs(p.x)));
    // (Paliers derrière le dossier : la colonne est sous eux ; au-dessus de la course : derrière le dossier.)
    const derriere = M.zDos != null && zH < M.zDos - 0.05;
    // (Devant : au-delà des pieds, la tour encore devant la colonne.)
    const zPieds = M.i0 ? Math.max(M.i0.orteils.G.z, M.i0.orteils.D.z) : -Infinity;
    const zCol = o.zColonne != null ? o.zColonne : o.devant ? Math.max(zH + 0.25, zPieds + 0.22) : derriere ? zH : (M.zDos != null ? M.zDos - 0.1 : zH - 0.3);
    const yT = o.dessous ? yH : yH + 0.09;
    // La colonne et, si les paliers sont ailleurs qu'au-dessus d'elle, la poutre qui les rejoint.
    f.push(profil(C, V(0, 0.03, zCol), V(0, yT + 0.03, zCol), AX, 0.1, 0.07));
    if (Math.abs(zH - zCol) > 0.08) f.push(profil(C, V(0, yT, zCol), V(0, yT, zH), AY, 0.09, 0.06));
    // La traverse et, de chaque bout, le support du palier (le long de l'axe du bras).
    f.push(profil(C, V(-(xH + 0.02), yT, zH), V(xH + 0.02, yT, zH), AY, 0.08, 0.055));
    for (const k of ks) {
      const a = M.arcs[k], s = Math.sign(a.P.x) || 1, bout = V(s * (xH + 0.02), yT, zH);
      if (a.P.distanceTo(bout) > 0.03) f.push(profil(C, bout, a.P.clone().addScaledVector(a.n, -s * Math.sign(a.n.x || 1) * 0.0), AZ, 0.06, 0.045));
      f.push(seg(a.P.clone().addScaledVector(a.n, -0.07), a.P.clone().addScaledVector(a.n, 0.07), 0.018, C.metal, 0.9));
    }
    // La tour, et le longeron qui la relie au pied de la colonne et à l'avant de l'assise.
    const zT = o.devant ? zCol + 0.35 : zCol - 0.35;
    f.push(...placerTour(C, V(0, 0, zT), qY(o.devant ? 180 : 0), o.hTour || 1.5));
    f.push(...longeron(C, zT, o.zAvant != null ? o.zAvant : 0.3));
    d.fixe.push(...poseFixe(horsCadre(f, 1.95)));
  }

  /* Pec deck, écartés à la machine et oiseau à la machine : deux bras qui pendent du haut de la machine et tournent
     chacun autour d'un axe vertical passant par l'épaule. Écartés : une poignée verticale au bout du bras ; pec deck :
     un coussin vertical contre l'avant-bras, la main sur sa poignée ; oiseau (face) : assis face au coussin de
     poitrine, les bras tendus devant qui s'ouvrent. Remplit d.cles, d.fixe, d.objets, d.levee. */
  function machineEcarte(c, C, d, o) {
    const cotes = o.cotes || ['G', 'D'], i0 = c.poser(d.a), haut = Math.max(i0.epaules.G.y, i0.epaules.D.y) + 0.52;
    const M = surMachine(c, C, d, {
      cotes, n: 10, poste: o.face ? { h: H_SIEGE, poitrine: true } : { h: 0.44, angle: 84 },
      // (Oiseau : bras presque tendus, le côté du coude ne se lit pas sur le corps ; il est dehors et un peu en arrière
      // au départ, en arrière bras ouverts — sinon l'humérus tourne sur lui-même et le deltoïde postérieur se creuse.)
      pole: o.face ? (k => { const s = k === 'G' ? 1 : -1; return { A: V(s * 0.7, 0.18, -0.7), B: V(-s * 0.7, 0.14, -0.7) }; }) : null,
      axe: k => { const e = i0.epaules[k]; return { P: V(e.x, haut, e.z), n: o.face ? V(0, k === 'G' ? 1 : -1, 0) : V(0, k === 'G' ? -1 : 1, 0) }; }
    });
    // Le bras : du palier, à l'horizontale jusqu'au-dessus de la poignée, puis à la verticale jusqu'à elle (pec deck :
    // jusqu'au haut du coussin, qui longe l'avant-bras).
    const iA = M.i0;
    for (const k of cotes) {
      const a = M.arcs[k], pr = iA.prises[k], ax = unite(iA.axes[k].clone()), s = k === 'G' ? 1 : -1;
      const e1 = pr.clone().addScaledVector(ax, -0.075), e2 = pr.clone().addScaledVector(ax, 0.075), hautP = e1.y > e2.y ? e1 : e2;
      const coin = V(hautP.x, a.P.y, hautP.z), f = [...moyeu(C, a.P, a.n), profil(C, a.P, coin, AY, 0.065, 0.045), profil(C, coin, hautP, AX, 0.06, 0.04), ...manchon(C, e1, e2)];
      if (o.pecdeck) {
        // Le coussin le long de l'avant-bras, côté où il pousse.
        const cd = iA.coudes[k], av = unite(pr.clone().sub(cd)), tg = unite(a.n.clone().cross(pr.clone().sub(a.P))).multiplyScalar(-1);
        const ctr = cd.clone().lerp(pr, 0.45).addScaledVector(tg, 0.095), q = new Quat().setFromBasis(unite(perp(tg, av)).cross(av), av, unite(perp(tg, av)));
        f.push(Object.assign(boite(0.11, cd.distanceTo(pr) * 0.95, 0.07, ctr.x, ctr.y, ctr.z, C.banc, 0.12, q, 0.024), {}), profil(C, hautP, ctr.clone().addScaledVector(av, cd.distanceTo(pr) * 0.45), AX, 0.04, 0.03));
      }
      M.bras[k] = brasMobile(a.P, a.n, f, pr, info => info.prises[k]);
    }
    d.objets = (info, u, sortie) => { for (const k of cotes) M.bras[k].dessiner(info, u, sortie); };
    // Le bâti : une colonne derrière le dossier (devant le coussin de poitrine pour l'oiseau), une poutre au-dessus de
    // la tête, une traverse qui porte les deux paliers.
    batiBras(C, d, M, { devant: !!o.face, dessous: true, zAvant: o.face ? -0.25 : 0.32 });
    return M;
  }

  /* L'assise d'un poste où les cuisses sont calées (tirage vertical) : le siège à h, deux boudins posés sur les
     cuisses, portés par une potence qui monte devant les genoux. */
  function posteCuisses(c, C, p, h) {
    c.poser(p);
    let yMax = -Infinity, zG = 0, n = 0;
    const info = c.poser(p), g = info.genoux.G.clone().add(info.genoux.D).multiplyScalar(0.5), zB = g.z - 0.12;
    c.peauPosee(['cuisse'], (x, y, z) => { if (Math.abs(z - zB) < 0.03 && Math.abs(x) < 0.18 && y > yMax) yMax = y; });
    const yC = (isFinite(yMax) ? yMax : g.y + 0.08) + 0.05 - ENFONCE;
    const f = [coussin(0.36, 0.065, 0.34, 0, h - 0.0325, -0.02, C), boite(0.25, 0.025, 0.28, 0, h - 0.075, -0.02, C.cadre, 0.45, null, 0.006),
      profil(C, V(0, 0.05, -0.02), V(0, h - 0.085, -0.02), AZ, 0.085, 0.085), cyl(0.012, 0.05, 0, h - 0.25, 0.045, C.metal, 0.8, LONG_Z), sphere(0.02, 0, h - 0.25, 0.075, C.repere, 0.2)];
    for (const s of [1, -1]) f.push(...boudin(C, V(s * 0.04, yC, zB), V(s * 0.25, yC, zB), 0.05));
    f.push(seg(V(-0.04, yC, zB), V(0.04, yC, zB), 0.016, C.metal, 0.9), profil(C, V(0, yC - 0.03, zB + 0.02), V(0, 0.05, zB + 0.42), AX, 0.07, 0.05));
    return f;
  }

  /* Le bâti des machines dont les bras tournent à hauteur des coudes (curl, triceps) ou des poignets : de chaque
     palier, une broche vers le dehors et un montant jusqu'au sol, une traverse entre les montants ; la tour devant,
     au-delà des pieds, sa fente vers soi, reliée par un longeron. */
  function batiCoudes(C, d, M) {
    const f = [], ks = Object.keys(M.arcs), xs = [];
    for (const k of ks) {
      const a = M.arcs[k], s = Math.sign(a.P.x) || 1, x = a.P.x + s * 0.09;
      f.push(seg(a.P.clone().setX(a.P.x - s * 0.05), V(x + s * 0.02, a.P.y, a.P.z), 0.018, C.metal, 0.9));
      xs.push(x);
    }
    const zB0 = Math.max(Object.values(M.arcs)[0].P.z - 0.12, Math.max(M.i0.orteils.G.z, M.i0.orteils.D.z) + 0.1);
    for (const k of ks) { const a = M.arcs[k], s = Math.sign(a.P.x) || 1, x = a.P.x + s * 0.09; f.push(profil(C, V(x, a.P.y + 0.03, a.P.z), V(x, 0.03, zB0), AZ, 0.075, 0.05)); }
    // (Les montants descendent au-delà des pieds : plantés près des coudes, ils tombaient sur les chevilles.)
    const zB = Math.max(Object.values(M.arcs)[0].P.z - 0.12, Math.max(M.i0.orteils.G.z, M.i0.orteils.D.z) + 0.1);
    f.push(...traverse(C, Math.max(0.2, ...xs.map(Math.abs)), -Math.max(0.2, ...xs.map(Math.abs)), zB));
    // (La tour sur le flanc droit, à hauteur des coudes : devant, elle cachait tout.)
    f.push(...placerTour(C, V(-0.72, 0, zB + 0.05), qY(90), 1.3), ...traverse(C, -0.5, -Math.max(0.2, ...xs.map(Math.abs)), zB));
    d.fixe.push(...poseFixe(f));
  }
  /* Curl et extension des triceps à la machine, poignets à la machine : le bras tourne autour du coude (ou du poignet)
     posé sur le pupitre, son palier en dehors de l'articulation. Le siège et le pupitre de la famille sont gardés. */
  function machineCoudes(c, C, d, cotes, centre) {
    const iA = c.poser(d.a), pts = centre === 'poignets' ? iA.poignets : iA.coudes;
    // L'axe du bras de la machine est celui de l'articulation : perpendiculaire au plan où la main tourne autour d'elle
    // (le bras n'est pas tout à fait dans l'axe du corps) ; le palier est sur cet axe, 12 cm en dehors.
    const M = surMachine(c, C, d, { cotes, garder: true, garderPoses: true, dehors: 0.06, axe: (k, i1, i2) => {
      const s = k === 'G' ? 1 : -1, e = pts[k];
      let n = unite(i1.prises[k].clone().sub(e).cross(i2.prises[k].clone().sub(e))); if (n.x * s < 0) n.multiplyScalar(-1);
      return { P: e.clone().addScaledVector(n, 0.12), n };
    } });
    batiCoudes(C, d, M);
    return M;
  }

  /* Élévations latérales à la machine : assis, le dos au dossier ; chaque bras de la machine tourne autour d'un axe
     d'avant en arrière qui passe par l'épaule, son palier derrière elle, et pousse le coude par un boudin posé sur le
     dehors du bras, près du coude. Le bras de la machine passe derrière l'épaule puis longe le bras jusqu'au boudin. */
  function machineDeltoides(c, C, d, cotes) {
    const i0 = c.poser(d.a), f = [], bras = {};
    for (const k of cotes) {
      const s = k === 'G' ? 1 : -1, e = i0.epaules[k], cd = i0.coudes[k], P = V(e.x, e.y, e.z - 0.2), n = V(0, 0, s);
      const dehors = unite(perp(cd.clone().sub(e), AZ)), le = cd.clone().addScaledVector(dehors, 0.1).addScaledVector(unite(e.clone().sub(cd)), 0.06);
      const coin = V(le.x, le.y, P.z), formes = [...moyeu(C, P, n), profil(C, P, coin, AZ, 0.06, 0.042), profil(C, coin, le.clone().setZ(le.z - 0.12), AY, 0.05, 0.035), ...boudin(C, le.clone().setZ(le.z - 0.17), le.clone().setZ(le.z - 0.03), 0.045)];
      bras[k] = brasMobile(P, n, formes, cd, info => info.coudes[k]);
      f.push(seg(P.clone().setZ(P.z - 0.1), P.clone().setZ(P.z + 0.03), 0.018, C.metal, 0.9));
    }
    d.objets = (info, u, sortie) => { for (const k of cotes) bras[k].dessiner(info, u, sortie); };
    d.levee = info => 0.12 * Math.max(...cotes.map(k => Math.abs(bras[k].angle(info))));
    const ps = posteAssis(C, 0.44, 84, 0.62, 0.32), zC = Math.min(...cotes.map(k => i0.epaules[k].z)) - 0.3, yC = Math.max(...cotes.map(k => i0.epaules[k].y));
    d.fixe = poseFixe(ps);
    f.push(profil(C, V(0, 0.03, zC), V(0, yC + 0.04, zC), AX, 0.1, 0.07), profil(C, V(-0.3, yC, zC + 0.1), V(0.3, yC, zC + 0.1), AY, 0.08, 0.055));
    for (const k of cotes) { const s = k === 'G' ? 1 : -1; f.push(profil(C, V(s * 0.3, yC, zC + 0.1), V(i0.epaules[k].x, i0.epaules[k].y, zC + 0.1), AZ, 0.06, 0.045)); }
    f.push(...placerTour(C, V(0, 0, zC - 0.38), null, 1.45), ...longeron(C, zC - 0.2, 0.32));
    d.fixe.push(...poseFixe(f));
  }

  /* Pull-over à la machine : assis, les coudes contre deux boudins portés par des bras qui tournent autour de l'axe
     des épaules ; les bras de la machine partent de paliers en dehors des épaules. */
  function machinePullover(c, C, d) {
    const i0 = c.poser(d.a), f = [], bras = {};
    for (const k of ['G', 'D']) {
      const s = k === 'G' ? 1 : -1, e = i0.epaules[k], cd = i0.coudes[k], P = V(s * 0.3, e.y, e.z), n = V(1, 0, 0);
      const rc = perp(cd.clone().sub(P), n), tg = unite(n.clone().cross(rc)).multiplyScalar(-1);
      // Le boudin, posé contre le bras du côté où il pousse, en travers du bras ; le bras de la machine, en dehors.
      const pad = cd.clone().addScaledVector(unite(e.clone().sub(cd)), 0.08).addScaledVector(tg, 0.088), bout = V(P.x, pad.y, pad.z);
      const formes = [...moyeu(C, P, n), profil(C, P, bout, AX, 0.065, 0.045), ...boudin(C, bout, pad.clone().setX(cd.x + s * 0.01), 0.045)];
      bras[k] = brasMobile(P, n, formes, cd, info => info.coudes[k]);
      f.push(seg(P.clone().setX(P.x - s * 0.04), P.clone().setX(P.x + s * 0.14), 0.02, C.metal, 0.9), profil(C, V(s * 0.44, 0.03, P.z - 0.1), V(s * 0.44, P.y + 0.03, P.z), AX, 0.075, 0.05));
    }
    d.objets = (info, u, sortie) => { for (const k of ['G', 'D']) bras[k].dessiner(info, u, sortie); };
    d.levee = info => 0.1 * Math.abs(bras.G.angle(info));
    const ps = posteAssis(C, 0.44, 84, 0.62, 0.32);
    d.fixe = poseFixe(ps);
    f.push(...traverse(C, 0.44, -0.44, i0.epaules.G.z - 0.1), ...placerTour(C, V(0, 0, ps.zArriere - 0.3), null, 1.4), ...longeron(C, ps.zArriere - 0.1, 0.32));
    d.fixe.push(...poseFixe(f));
  }

  /* Des paliers portés chacun par son poteau (quand une traverse entre eux passerait dans le corps) : de chaque palier,
     une broche vers le dehors et un poteau jusqu'au sol ; une traverse au sol derrière ; la tour derrière. */
  function batiPoteaux(C, d, M, o) {
    o = o || {};
    const f = [], ks = Object.keys(M.arcs);
    let zMin = Infinity;
    for (const k of ks) {
      const a = M.arcs[k], s = Math.sign(a.P.x) || 1, x = a.P.x + s * 0.08;
      f.push(seg(a.P.clone().setX(a.P.x - s * 0.04), V(x + s * 0.02, a.P.y, a.P.z), 0.018, C.metal, 0.9));
      f.push(profil(C, V(x, a.P.y + 0.03, a.P.z), V(x, 0.03, a.P.z - 0.15), AZ, 0.075, 0.05));
      zMin = Math.min(zMin, a.P.z - 0.15);
    }
    const xs = ks.map(k => Math.abs(M.arcs[k].P.x) + 0.08), X = Math.max(0.3, ...xs);
    f.push(...traverse(C, X, -X, zMin));
    const zT = o.zTour != null ? o.zTour : (M.zDos != null ? Math.min(M.zDos, zMin) : zMin) - 0.4;
    f.push(...placerTour(C, V(0, 0, zT), null, o.hTour || 1.4), ...longeron(C, zT + 0.2, o.zAvant != null ? o.zAvant : 0.3));
    d.fixe.push(...poseFixe(f));
  }

  /* Les machines de jambes où un bras tourne autour d'un axe et pousse un membre par un boudin (abducteurs, adducteurs,
     fessiers, hip thrust) : axe et pivot donnés, le boudin suit le point du corps `suit`. formes(k, i0) rend les formes
     du bras au départ. */
  function brasDeJambe(C, d, cotes, P, n, formes, suit) {
    const i0 = d.i0, bras = {};
    for (const k of cotes) bras[k] = brasMobile(P(k), n(k), formes(k, i0), suit(i0, k), info => suit(info, k));
    d.objets = (info, u, sortie) => { for (const k of cotes) bras[k].dessiner(info, u, sortie); };
    d.levee = info => 0.12 * Math.max(...cotes.map(k => Math.abs(bras[k].angle(info))));
    return bras;
  }

  /* Machine à tractions et dips assistés : deux montants derrière soi, la tour derrière eux ; en haut, la barre de
     traction tenue en avant par deux potences ; à mi-hauteur, les deux poignées de dips ; le plateau où posent les
     genoux, au bout d'un long bras qui tourne au pied des montants (il pousse les genoux vers le haut : c'est
     l'assistance). dips : les poignées sont en (±ecart, h) ; traction : la barre est à hBarre. */
  function machineAssistance(c, C, d, o) {
    const iA = d.cles ? c.poser(d.cles[0][1]) : c.poser(d.a), iB = d.cles ? c.poser(d.cles[d.cles.length - 1][1]) : c.poser(d.b);
    const genoux = info => info.genoux.G.clone().add(info.genoux.D).multiplyScalar(0.5);
    const g0 = genoux(iA), g1 = genoux(iB), zM = Math.min(g0.z, g1.z) - 0.55, f = [];
    for (const s of [1, -1]) f.push(profil(C, V(s * 0.36, 0.03, zM), V(s * 0.36, (o.hBarre || 2.3) + 0.06, zM), AZ, 0.09, 0.06));
    f.push(profil(C, V(-0.4, 0.06, zM), V(0.4, 0.06, zM), AY, 0.08, 0.05), ...longeron(C, zM - 0.55, zM + 0.25, 0.36), ...longeron(C, zM - 0.55, zM + 0.25, -0.36));
    if (o.hBarre) {
      const yB = o.hBarre;
      f.push(profil(C, V(-0.4, yB + 0.06, zM), V(0.4, yB + 0.06, zM), AY, 0.08, 0.05));
      for (const s of [1, -1]) f.push(profil(C, V(s * 0.36, yB + 0.06, zM), V(s * 0.36, yB + 0.02, 0.02), AY, 0.065, 0.045));
      f.push(cyl(0.016, 0.82, 0, yB, 0.02, C.metal, 1), cyl(0.0185, 0.2, 0.28, yB, 0.02, C.gomme, 0, null, 0.005), cyl(0.0185, 0.2, -0.28, yB, 0.02, C.gomme, 0, null, 0.005));
    }
    if (o.ecart) for (const s of [1, -1]) {
      const x = s * o.ecart;
      f.push(profil(C, V(s * 0.36, o.h - 0.02, zM), V(x, o.h - 0.02, zM + 0.08), AY, 0.065, 0.045), seg(V(x, o.h, zM + 0.06), V(x, o.h, 0.42), 0.019, C.metal, 1), seg(V(x, o.h, 0.08), V(x, o.h, 0.4), 0.0215, C.gomme, 0, 0.006));
    }
    // La tour sur le côté (o.cote : +1 à gauche, -1 à droite), à l'aplomb des montants : derrière, elle cachait le corps
    // vu de dos.
    const sT = o.cote || 1;
    f.push(...placerTour(C, V(sT * 0.82, 0, zM), qY(-90 * sT), 1.7), ...traverse(C, sT * 0.36, sT * 0.6, zM));
    // Le bras d'assistance : son palier au pied des montants ; le plateau sous les genoux.
    const pl = g0.clone().add(V(0, -0.11, -0.06)), P = pivotEgal(V(0, 0.32, zM + 0.05), AX, pl, g1.clone().add(V(0, -0.11, -0.06)));
    const formes = [...moyeu(C, P, AX, 0.06, 0.16), profil(C, P, pl.clone().add(V(0, -0.04, 0)), AX, 0.075, 0.05), Object.assign(coussin(0.44, 0.065, 0.3, pl.x, pl.y, pl.z, C), { aPlat: true }), Object.assign(boite(0.3, 0.025, 0.22, pl.x, pl.y - 0.045, pl.z, C.cadre, 0.45, null, 0.006), { aPlat: true })];
    const bras = brasMobile(P, AX, formes, pl, info => genoux(info).add(V(0, -0.11, -0.06)));
    d.objets = (info, u, sortie) => bras.dessiner(info, u, sortie);
    d.levee = info => 0.35 * Math.abs(bras.angle(info));
    d.fixe = (o.garder ? d.fixe : []).concat(poseFixe(horsCadre(f, 2.0)));
  }
