
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
      // (Buste relevé, ce sont les omoplates qui portent sur le bord du banc : le haut du dos est un peu plus haut.)
      ancrer(c, p, 'cou1', banc ? V(0, hB + 0.085 + 0.024 * phi / 38, zS) : V(0, 0.1, zS));
      const zPied = zS + (banc ? 0.52 + 0.4 : 0.5 + 0.4);
      for (const [kk, s] of COTES) {
        if (o.grenouille) p.jambes[kk] = { cheville: V(s * 0.035, 0.05, zPied - 0.12), pole: V(s * 1, 0.35, 0.15), pied: V(-s * 0.1, 0.1, 1), hautPied: V(s * 1, 0.2, 0) };
        else p.jambes[kk] = pied(c, s, { x: s * 0.13, ouv: 6, z: zPied, pole: V(0, 1, 0.25) });
      }
      if (o.unejambe) p.jambes.D = J(lerp(banc ? 70 : 50, 4, k), 3, 0, lerp(70, 6, k), 20);
      const t = c.tronc(p);
      for (const [kk, s] of COTES) {
        if (o.hal) p.bras[kk] = { prise: t.duBassin(V(s * 0.152, 0.0, L.ventre + 0.035)), pole: V(s * 1, -0.3, -0.2), paume: V(-s, 0, 0).applyQuaternion(t.qBassin), dirMain: V(0, -1, 0.25).applyQuaternion(t.qBassin), doigts: 'plat' };   // l'haltère en travers des hanches, une main à plat sur chaque tête
        else if (o.barre || o.smith || o.disque) p.bras[kk] = { prise: t.duBassin(V(s * (o.barre || o.smith ? 0.3 : 0.1), 0.0, L.ventre + 0.035)), pole: V(s * 1, -0.3, -0.2), paume: V(0, -0.3, -1).applyQuaternion(t.qBassin), doigts: 'barre' };
        else if (o.machine) p.bras[kk] = { prise: t.duBassin(V(s * 0.38, 0.02, L.ventre + 0.055)), pole: V(s * 1, -0.3, -0.2), paume: V(0, -0.3, -1).applyQuaternion(t.qBassin), doigts: 'barre' };   // les mains sur les poignées du bras de la machine, de part et d'autre du coussin
        else if (banc) p.bras[kk] = B(92, 62, 0, 70, 180, { doigts: 'detendu' });
        else p.bras[kk] = B(90, 22, 0, 8, 180, { doigts: 'plat' });
      }
      return p;
    };
    d.pose = cle;
    if (banc) fixe.push(...poseFixe(MAT.banc(C, 0, hB), V(0.3, 0, zS - 0.14), qY(90)));
    if (o.barre || o.smith) d.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.225 }];
    else if (o.hal) d.tenu = [{ t: 'haltere', m: 'GD', entre: true, k: 1.2 }];
    else if (o.disque) d.tenu = [{ t: 'disque', m: 'GD', r: 0.17, axe: AY }];
    if (o.smith) { const info = c.poser(cle(1)); fixe.push(...poseFixe(MAT.smith(C, info.prises.G.z))); }
    if (o.machine) {
      // Le coussin en travers des hanches, au bout de deux bras qui tournent autour de l'axe des genoux (les hanches
      // décrivent un arc autour d'eux, les tibias restant à peu près droits) ; les paliers en dehors des genoux. Les
      // mains tiennent les poignées du bras, de part et d'autre du coussin : elles montent avec les hanches.
      const iA = c.poser(cle(0)), iB = c.poser(cle(1)), g0 = iA.genoux.G.clone().add(iA.genoux.D).multiplyScalar(0.5);
      const hanches = info => info.bassin.clone().add(V(0, 0.02, L.ventre + 0.055).applyQuaternion(info.qBassin));
      const g = pivotCercle(g0, AX, [hanches(iA), hanches(c.poser(cle(0.5))), hanches(iB)]);
      d.i0 = iA;
      // (Le centre de l'arc des hanches est près des omoplates, posées sur le banc : c'est là que tourne le bras, comme
      // sur les machines où le dos est calé — ses paliers loin en dehors, au-delà des bras posés sur le banc.)
      const X = 0.56;
      brasDeJambe(C, d, ['G'], () => V(X, g.y, g.z), () => AX, () => { const b = hanches(iA), f = [...boudin(C, V(-0.3, b.y, b.z), V(0.3, b.y, b.z), 0.055)]; for (const s of [1, -1]) f.push(...moyeu(C, V(s * X, g.y, g.z), AX), profil(C, V(s * X, g.y, g.z), V(s * X, b.y, b.z), AX, 0.065, 0.045), profil(C, V(s * X, b.y, b.z), V(s * 0.47, b.y, b.z), AY, 0.06, 0.04), ...manchon(C, V(s * 0.47, b.y, b.z), V(s * 0.29, b.y, b.z))); return f; }, info => hanches(info));
      for (const s of [1, -1]) fixe.push(pret(seg(V(s * (X - 0.03), g.y, g.z), V(s * (X + 0.12), g.y, g.z), 0.02, C.metal, 0.9)), pret(profil(C, V(s * (X + 0.12), g.y + 0.03, g.z), V(s * (X + 0.12), 0.03, g.z - 0.1), AZ, 0.075, 0.05)));
      fixe.push(...poseFixe(traverse(C, X + 0.12, -X - 0.12, g.z - 0.1)), ...poseFixe(placerTour(C, V(-X - 0.42, 0, g.z - 0.1), qY(90), 1.3)));
    }
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
      d.pose = u => { const p = cloner(base), k = o.mollets ? 1 : u, pt = o.mollets ? 34 * u : 0; for (const [kk, s] of COTES) { const ch = plie.clone().add(r.clone().multiplyScalar((0.4 * k) + (o.mollets ? 0.05 * u : 0))).setX(s * ecart); const dir = e.clone().multiplyScalar(Math.cos(rad(pt))).add(r.clone().multiplyScalar(Math.sin(rad(pt)))), hautP = r.clone().multiplyScalar(-Math.cos(rad(pt))).add(e.clone().multiplyScalar(Math.sin(rad(pt)))); p.jambes[kk] = { cheville: ch, pole: e.clone().add(V(s * (o.large ? 0.6 : 0.25), 0, 0)).add(r.clone().multiplyScalar(-0.2)), pied: dir, hautPied: hautP, orteils: pt }; } if (o.unejambe) p.jambes.D = pied(c, -1, { x: -0.3, z: ha.z + 0.45, ouv: 20, pole: V(-0.5, 1, 0.3) }); for (const [kk] of COTES) p.bras[kk] = B(60, 22, 0, 30, 90, { doigts: 'barre' }); return p; };
      // Une poignée de chaque côté du siège, dans les mains.
      { const i0 = c.poser(d.pose(0)); for (const [kk, s] of COTES) poigneeEnMain(C, i0, kk, V(s * 0.21, i0.prises[kk].y - 0.09, i0.prises[kk].z), fixe); }
      // Le siège est fixe ; le chariot (plateau, traverse, disques) suit les pieds le long de deux rails.
      if (!o.verticale) fixe.push(...poseFixe(o.horizontale ? MAT.banc(C, dossier, 0.3, 0.8, 0.34) : posteAssis(C, 0.3, dossier, 0.8, 0.34, 0.42)));
      const plateau = info => info.chevilles.G.clone().setX(0).add(r.clone().multiplyScalar(L.chevilleH + 0.03)).add(e.clone().multiplyScalar(0.06));
      const P0 = plateau(c.poser(d.pose(0))), qPl = arc(AY, r), bas = P0.clone().add(e.clone().multiplyScalar(-0.27));
      const sMin = ang > 5 ? (0.07 - bas.y) / r.y : -0.45, sMax = course + 0.5, xR = 0.39;
      for (const s of [1, -1]) {
        const a = bas.clone().add(r.clone().multiplyScalar(sMin)).setX(s * xR), b = bas.clone().add(r.clone().multiplyScalar(sMax)).setX(s * xR);
        fixe.push(pret(profil(C, a, b, AX, 0.09, 0.06)));
        if (ang < 80) { fixe.push(pret(profil(C, V(b.x, 0.03, b.z), b, AX, 0.09, 0.06))); if (ang <= 5) fixe.push(pret(profil(C, V(a.x, 0.03, a.z), a, AX, 0.09, 0.06))); }
        fixe.push(...poseFixe(patin(C, V(s * xR, 0.028, Math.min(a.z, b.z) - 0.08), V(s * xR, 0.028, Math.max(a.z, b.z) + 0.08), 0.05)));
      }
      { const b = bas.clone().add(r.clone().multiplyScalar(sMax)); fixe.push(Object.assign(pret(profil(C, V(-xR, b.y, b.z), V(xR, b.y, b.z), AY, 0.09, 0.06)), { hors: 1 })); }
      d.objets = (info, u, sortie) => {
        const m = plateau(info), tr = m.clone().add(e.clone().multiplyScalar(-0.27)).add(r.clone().multiplyScalar(0.035));
        sortie.push(pret(boite(0.62, 0.035, 0.46, m.x, m.y, m.z, C.fonte, 0.3, qPl, 0.012)));
        sortie.push(pret(profil(C, tr.clone().setX(-xR - 0.05), tr.clone().setX(xR + 0.05), AY, 0.08, 0.055)));
        sortie.push(pret(profil(C, tr, m.clone().add(r.clone().multiplyScalar(0.03)), AX, 0.07, 0.05)));
        // Les patins du chariot sur les rails.
        for (const s2 of [1, -1]) sortie.push(pret(ovale(tr.clone().setX(s2 * xR).addScaledVector(r, -0.12), tr.clone().setX(s2 * xR).addScaledVector(r, 0.12), 0.13, 0.11, C.cadre, 0.45, AX)));
        if (ang === 45) for (const s of [1, -1]) poserObjet(MAT.disque(C, 0.2), tr.clone().setX(s * (xR + 0.11)), null, sortie);
      };
      d.vue = { az: 66, el: 12 }; return d;
    }
    if (o.extension) {
      const base = allonge(c, { h: 0.58, angle: 76, jambes: J(74, 5, 0, 92, 0), lomb: 0, thor: 0, cou: 0 });
      const cle = u => { const p = cloner(base); for (const k of ['G', 'D']) { p.jambes[k] = J(74, 5, 0, lerp(94, 6, u), -10 * u); p.bras[k] = B(80, 14, 0, 35, 90); } if (o.uni) p.jambes.D = J(74, 5, 0, 92, 0); return p; };
      d.a = cle(0); d.b = cle(1);
      posteJambes(c, C, d, fixe, 0.58, 76, -1, o.uni ? ['G'] : ['G', 'D']);
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
        const cle = u => { const p = cloner(base); for (const k of ['G', 'D']) { p.jambes[k] = J(74, 5, 0, lerp(10, 104, u), 0); p.bras[k] = B(80, 14, 0, 35, 90); } if (o.uni) p.jambes.D = J(74, 5, 0, 10, 0); return p; };
        d.a = cle(0); d.b = cle(1);
        posteJambes(c, C, d, fixe, 0.6, 76, 1, o.uni ? ['G'] : ['G', 'D'], true);
        return d;
      }
      if (o.debout) {
        // Debout, une jambe : la cuisse reste à la verticale, le talon monte vers la fesse.
        const p = debout(c, { penche: 8, ecart: 0.09, ouv: 6 }); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.16, 1.12, 0.38), pole: V(s * 0.6, -1, -0.2), paume: V(0, -1, 0), doigts: 'barre' };   // les mains sur la barre d'appui
        const cle = u => { const q = cloner(p); q.jambes.G = J(8 + 2, 3, 0, lerp(6, 112, u), 20); return q; };
        d.a = cle(0); d.b = cle(1);
        fixe.push(pret(seg(V(0, 0, 0.4), V(0, 1.15, 0.4), 0.03, C.cadre, 0.5)), pret(cyl(0.015, 0.5, 0, 1.12, 0.38, C.metal, 1)));
        if (o.poulie) { const anc = V(0.09, 0.1, 0.9); d.tenu = [{ t: 'cable', de: anc, vers: info => info.chevilles.G, m: 'G', bout: 'rien' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
        d.a.jambes.G = J(10, 3, 0, 6, 0);
        if (o.machine) {
          // La machine : le coussin devant la cuisse, au-dessus du genou ; le boudin derrière la cheville, au bout d'un
          // bras qui tourne dans l'axe du genou ; la tour sur le côté de la jambe d'appui.
          fixe.length = 0;
          const iA = c.poser(d.a), g = iA.genoux.G, ch = iA.chevilles.G, dj = unite(ch.clone().sub(g)), P = V(g.x + 0.17, g.y, g.z);
          const rc = info => { const gg = info.genoux.G, c2 = info.chevilles.G, j = unite(c2.clone().sub(gg)), arr = perp(V(0, 0, -1), j).normalize(); return c2.clone().addScaledVector(arr, 0.085).addScaledVector(j, -0.04); };
          const r0 = rc(iA), bras = brasMobile(P, AX, [...moyeu(C, P, AX), profil(C, P, V(P.x, r0.y, r0.z), AX, 0.065, 0.045), ...boudin(C, V(P.x, r0.y, r0.z), V(r0.x - 0.09, r0.y, r0.z), 0.045)], r0, rc);
          d.objets = (info, u, sortie) => bras.dessiner(info, u, sortie); d.levee = info => 0.12 * Math.abs(bras.angle(info));
          const cu = g.clone().addScaledVector(dj, -0.16).add(V(0, 0, 0.11));
          fixe.push(pret(coussin(0.2, 0.22, 0.07, cu.x, cu.y, cu.z, C)), pret(profil(C, V(cu.x, cu.y, cu.z + 0.05), V(cu.x, 0.03, cu.z + 0.15), AX, 0.07, 0.05)));
          fixe.push(pret(seg(V(P.x - 0.03, P.y, P.z), V(P.x + 0.1, P.y, P.z), 0.02, C.metal, 0.9)), pret(profil(C, V(P.x + 0.1, P.y + 0.03, P.z), V(P.x + 0.1, 0.03, P.z + 0.1), AZ, 0.075, 0.05)));
          // L'appui des mains : deux poignées sur une potence, devant la poitrine.
          for (const [k, s2] of COTES) fixe.push(...poseFixe(manchon(C, V(s2 * 0.1, 1.12, 0.38), V(s2 * 0.24, 1.12, 0.38))));
          fixe.push(pret(profil(C, V(-0.24, 1.12, 0.4), V(0.24, 1.12, 0.4), AY, 0.05, 0.035)), pret(profil(C, V(0, 1.12, 0.42), V(0, 0.03, 0.45), AX, 0.075, 0.05)));
          fixe.push(...poseFixe(longeron(C, P.z + 0.1, 0.5)), ...poseFixe(placerTour(C, V(-0.6, 0, 0.1), qY(90), 1.4)), ...poseFixe(traverse(C, -0.4, P.x + 0.1, P.z + 0.1)));
        }
        return d;
      }
      // Couché à plat ventre sur le banc : les talons montent vers les fesses.
      const base = aPlatVentre(c, { h: 0.55, angle: 0, d: 0.2, jambes: J(0, 4, 0, 6, 20), cou: -8 });
      fixe.push(...poseFixe(MAT.banc(C, 0, 0.55, 0.9, 0.3), V(0, 0, 0.05), qY(180)));
      const cle = u => { const p = cloner(base); for (const [k, s] of COTES) { p.jambes[k] = J(-2, 4, 0, lerp(6, 116, u), 20); p.bras[k] = { prise: V(s * 0.15, 0.55 - 0.0325, p.bassin.pos.z + 0.62), pole: V(s * 1, -0.2, -0.2), paume: V(-s, 0, 0), doigts: 'barre', rayon: 0.03 }; } if (o.uni) p.jambes.D = J(-2, 4, 0, 6, 20); return p; };
      d.a = cle(0); d.b = cle(1); d.vue = { az: 62, el: 12 };
      if (o.hal) d.objets = (info, u, sortie) => { const m = info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5), pd = unite(info.orteils.G.clone().sub(info.chevilles.G)); poserObjet(MAT.haltere(C, 1.1), m.clone().add(pd.multiplyScalar(0.1)), qTenu(pd, AX), sortie); };
      else if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(V(0, 0.3, info.chevilles.G.z - 1.0 + 0 * u), info.chevilles.G.clone().setX(0), 0.008, C.elastique, 0)));
      else {
        // La machine : le bras tourne dans l'axe des genoux, sur le flanc gauche, et porte le boudin derrière les
        // chevilles ; deux poignées sous la tête ; la tour devant la tête, sa fente vers le côté.
        const i0 = c.poser(d.a), cotes = o.uni ? ['G'] : ['G', 'D'];
        const gm = moyenneDe(cotes.map(k => i0.genoux[k])), P = V(0.27, gm.y, gm.z);
        const rc = info => { const gg = moyenneDe(cotes.map(k => info.genoux[k])), c2 = moyenneDe(cotes.map(k => info.chevilles[k])), j = unite(c2.clone().sub(gg)), haut = perp(AY, j).normalize(); return c2.clone().addScaledVector(haut, 0.085).addScaledVector(j, -0.04); };
        const r0 = rc(i0), bras = brasMobile(P, AX, [...moyeu(C, P, AX), ...came(C, P.clone().setX(0.335), AX), profil(C, P, V(0.27, r0.y, r0.z), AX, 0.07, 0.045), ...boudin(C, V(0.25, r0.y, r0.z), V(-0.23, r0.y, r0.z))], r0, rc);
        d.objets = (info, u, sortie) => bras.dessiner(info, u, sortie);
        d.levee = info => 0.12 * Math.abs(bras.angle(info));
        const zT = i0.tete.z + 0.62;
        fixe.push(pret(seg(V(0.22, gm.y, gm.z), V(0.4, gm.y, gm.z), 0.02, C.metal, 0.9)), pret(profil(C, V(0.4, gm.y + 0.03, gm.z), V(0.4, 0.03, gm.z + 0.15), AZ, 0.075, 0.05)));
        fixe.push(...poseFixe(placerTour(C, V(0, 0, zT), qY(90), 1.4)), ...poseFixe(longeron(C, gm.z + 0.15, zT - 0.2)), ...poseFixe(traverse(C, 0.4, -0.05, gm.z + 0.15)));
        for (const k of ['G', 'D']) { const pr = i0.prises[k]; fixe.push(...poseFixe(poigneeFixe(C, i0, k, V(pr.x * 0.6, 0.5, pr.z + 0.08)))); }
        fixe.push(pret(profil(C, V(0, 0.03, i0.bassin.z), V(0, 0.5, i0.bassin.z + 0.1), AX, 0.08, 0.06)));
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
      // Les mains tiennent ce qui charge les genoux, là où d.objets le pose : la barre, ou le coussin de la machine (une
      // main sur un rouleau de 5 cm de rayon, pas dedans).
      const tenue = o.barre || o.smith ? { h: 0.085, r: 0.0135 } : { h: 0.118, r: 0.05 };
      const cle = u => {
        const p = assis(c, { h: H_SIEGE, zPieds: 0.42, yPieds: 0.08, pointe: 36 * u, ecart: 0.11, ouv: 4 });
        // À une jambe : l'autre pied repose par terre, en deçà de la cale.
        if (o.uni) p.jambes.D = pied(c, -1, { x: -0.2, z: p.bassin.pos.z + 0.27, ouv: 10 });
        const gn = c.jambesDe(p).genoux, g = gn.G.clone().add(o.uni ? gn.G : gn.D).multiplyScalar(0.5);
        // L'haltère couché sur les genoux : une main à plat sur chacune de ses têtes.
        for (const [k, s] of COTES) p.bras[k] = o.hal ? { prise: V(g.x + s * 0.11, g.y + 0.138 + 0.071, g.z - 0.05), pole: V(s * 1, 0, -0.5), paume: V(0, -1, 0), dirMain: V(-s * 0.25, 0, 1), doigts: 'plat' } : Object.assign({ prise: V((o.uni ? g.x : 0) + s * (o.uni ? 0.12 : 0.16), g.y + tenue.h, g.z - 0.05), pole: V(s * 1, 0, -0.5), paume: V(0, -1, 0), doigts: 'barre' }, { rayon: tenue.r });
        return p;
      };
      d.pose = cle; fixe.push(...poseFixe(MAT.siege(C, H_SIEGE)), pret(boite(0.46, 0.08, 0.24, 0, 0.04, 0.63, C.fonte, 0.3, null, 0.012)));
      d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().add(o.uni ? info.genoux.G : info.genoux.D).multiplyScalar(0.5); if (o.hal) poserObjet(MAT.haltere(C, 1.2), g.clone().add(V(0, 0.138, -0.05)), null, sortie); else if (o.barre || o.smith) poserObjet(MAT.barre(C, 1.6, 0.18), g.clone().add(V(0, 0.085, -0.05)), null, sortie); };
      if (o.smith) fixe.push(...poseFixe(MAT.smith(C, 0.37)));
      if (o.machine) {
        // La machine : le coussin des genoux au bout d'un bras qui tourne autour d'un axe devant les pieds, à hauteur du
        // plateau (les genoux montent quand les talons montent) ; les mains tiennent le coussin.
        const iA = c.poser(cle(0)), iB = c.poser(cle(1)), genou = info => info.genoux.G.clone().add(o.uni ? info.genoux.G : info.genoux.D).multiplyScalar(0.5).add(V(0, 0.122, -0.05));
        const g0 = genou(iA), P = pivotCercle(V(0.3, 0.18, Math.max(iA.orteils.G.z, iA.orteils.D.z) + 0.12), AX, [g0, genou(c.poser(cle(0.5))), genou(iB)]);
        d.i0 = iA;
        brasDeJambe(C, d, ['G'], () => P, () => AX, () => { const f = [...boudin(C, V(-0.3, g0.y, g0.z), V(0.3, g0.y, g0.z), 0.05)]; for (const s of [1, -1]) f.push(...moyeu(C, V(s * 0.3, P.y, P.z), AX), profil(C, V(s * 0.3, P.y, P.z), V(s * 0.3, g0.y, g0.z), AX, 0.065, 0.045)); return f; }, info => genou(info));
        for (const s of [1, -1]) fixe.push(pret(seg(V(s * 0.27, P.y, P.z), V(s * 0.4, P.y, P.z), 0.02, C.metal, 0.9)), pret(profil(C, V(s * 0.4, P.y + 0.03, P.z), V(s * 0.4, 0.03, P.z), AZ, 0.075, 0.05)));
        fixe.push(...poseFixe(traverse(C, 0.4, -0.4, P.z)), ...poseFixe(longeron(C, -0.2, P.z)));
      }
      return d;
    }
    const cle = u => {
      const th = 40 * u, p = debout(c, { ecart: 0.1, ouv: 6, y0, dy: y0 });
      for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { ecart: 0.1, ouv: 6, pointe: th, y0, z: z0 });
      // Le bassin monte avec les chevilles.
      p.bassin.pos.y = L.racine.y + (p.jambes.G.cheville.y - L.chevilleH); p.bassin.pos.z += (p.jambes.G.cheville.z - z0);
      if (o.uni) p.jambes.D = J(-6, 3, 0, 62, 30);
      const m = porter(c, p, o.pc || !(o.barre || o.hal || o.smith) ? { hanches: true } : o, C, 0); d.tenu = m.tenu;
      if (o.machine) for (const [k] of COTES) p.bras[k] = B(40, 30, 40, 120, 90);
      return p;
    };
    d.pose = cle; cle(0);
    if (o.smith) { const info = c.poser(cle(0)); fixe.push(...poseFixe(MAT.smith(C, info.prises.G.z))); }
    if (o.machine) {
      // Machine à mollets debout : le bâti derrière soi, deux bras jusqu'aux épaulières ; la pile monte avec les talons.
      // La machine à mollets debout : les épaulières au bout de deux bras dont les paliers sont loin derrière, à hauteur
      // d'épaules (elles montent presque droit) ; une marche sous l'avant des pieds ; la tour derrière.
      const iA = c.poser(cle(0)), ep = k => info => info.epaules[k].clone().add(V(0, 0.095, 0));
      const e0 = iA.epaules.G.clone().add(iA.epaules.D).multiplyScalar(0.5), zP = e0.z - 0.85, yP = e0.y + 0.095;
      d.i0 = iA;
      const bras = brasDeJambe(C, d, ['G', 'D'], k => V(k === 'G' ? 0.3 : -0.3, yP, zP), () => AX, k => { const s = k === 'G' ? 1 : -1, e = ep(k)(iA); return [...moyeu(C, V(s * 0.3, yP, zP), AX), profil(C, V(s * 0.3, yP, zP), V(s * 0.3, e.y + 0.04, e.z - 0.12), AX, 0.065, 0.045), profil(C, V(s * 0.3, e.y + 0.04, e.z - 0.12), V(e.x, e.y + 0.04, e.z - 0.04), AY, 0.055, 0.04), coussin(0.15, 0.065, 0.2, e.x, e.y, e.z, C)]; }, (info, k) => ep(k)(info));
      const objets = d.objets;
      d.objets = (info, u, sortie) => { objets(info, u, sortie); for (const k of ['G', 'D']) { const e = info.epaules[k]; poigneeEnMain(C, info, k, V(e.x * 1.2, e.y + 0.1, e.z + 0.02), sortie); } };
      for (const s of [1, -1]) fixe.push(pret(seg(V(s * 0.27, yP, zP), V(s * 0.4, yP, zP), 0.02, C.metal, 0.9)), pret(profil(C, V(s * 0.4, yP + 0.03, zP), V(s * 0.4, 0.03, zP), AZ, 0.075, 0.05)));
      fixe.push(...poseFixe(traverse(C, 0.4, -0.4, zP)), ...poseFixe(placerTour(C, V(0, 0, zP - 0.32), null, 1.6)), ...poseFixe(longeron(C, zP - 0.12, z0 + 0.25)), pret(boite(0.5, 0.05, 0.3, 0, 0.025, z0 + 0.06, C.gomme, 0, null, 0.01)));
    }
    return d;
  };
