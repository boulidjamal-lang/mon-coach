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
