
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
