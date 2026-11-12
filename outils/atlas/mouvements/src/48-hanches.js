
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
