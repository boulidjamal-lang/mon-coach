
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
