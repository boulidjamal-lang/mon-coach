
  /* Comment la charge est portée (squats, fentes, mollets, good morning) : place les bras de la pose p et renvoie le
     matériel { tenu, objets }. Options : barre (sur les trapèzes ; basse ; avant ; zercher ; tete : bras tendus
     au-dessus de la tête), smith, sac, gobelet (haltère ou kettlebell contre la poitrine), hal (un haltère dans
     chaque main, bras le long du corps), kb, landmine, elas, hanches (mains sur les hanches), sinon bras devant. */
  function porter(c, p, o, C, u) {
    const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax), r = { tenu: [], objets: null };
    const barreSur = (centre, ecart, pole, paume, dirMain) => { const axe = dT(1, 0, 0); for (const [k, s] of COTES) p.bras[k] = { prise: centre.clone().add(axe.clone().multiplyScalar(s * ecart)), pole: dT(...pole(s)), paume: dT(...paume), dirMain: dirMain ? dT(...dirMain) : undefined, doigts: 'barre' }; r.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.225 }]; };
    if (o.barre || o.smith || o.sac) {
      if (o.avant) barreSur(t.duThorax(V(0, -0.015, 0.118)), 0.235, s => [s * 0.35, -0.25, 1], [0, 0.75, -0.66]);
      else if (o.zercher) {
        // La barre dans le pli des coudes, mains remontées vers la poitrine.
        p.bras = pareil(B(12, 34, -14, 122, 60));
        r.objets = (info, uu, sortie) => { const m = info.coudes.G.clone().add(info.coudes.D).multiplyScalar(0.5).add(V(0, 0.035, 0.03).applyQuaternion(info.qThorax)); poserObjet(MAT.barre(C, 1.6, 0.225), m, qTenu(info.coudes.G.clone().sub(info.coudes.D), AY), sortie); };
      } else if (o.tete) { p.bras = pareil(B(62, 170, 0, 4, 180)); r.tenu = [{ t: 'barre', l: 1.6, d: 0.2 }]; }
      else if (o.hack) { p.bras = pareil(B(0, -14, 0, 6, 0)); r.tenu = [{ t: 'barre', l: 1.6, d: 0.225 }]; }     // barre tenue derrière les jambes
      else barreSur(t.cou.clone().add(dT(0, o.basse ? -0.075 : -0.035, o.basse ? -0.12 : -0.105)), 0.37, s => [s * 0.25, -1, -0.55], [0, 0.35, 1]);
      if (o.sac) r.tenu = [];
    } else if (o.gobelet || (o.kb && !o.kb2)) {
      for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.06, -0.16, 0.2)), pole: dT(s * 0.5, -1, 0.1), paume: dT(-s, 0.1, 0), dirMain: dT(0, 0.9, 0.3), doigts: 'barre' };
      r.objets = (info, uu, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), haut = AY.clone().applyQuaternion(info.qThorax); if (o.kb) poserObjet(MAT.kettlebell(C), m.clone().add(haut.clone().multiplyScalar(0.02)), qTenu(AX.clone().applyQuaternion(info.qThorax), haut), sortie); else poserObjet(MAT.haltere(C, 1.25), m.clone().add(haut.clone().multiplyScalar(-0.08)), qTenu(haut, AZ), sortie); };
    } else if (o.hal || o.kb2) { p.bras = pareil(B(90, 4, 0, 6, 90)); r.tenu = [{ t: o.kb2 ? 'kb' : 'haltere', m: 'GD' }]; }
    else if (o.landmine) {
      for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.05, -0.12, 0.2)), pole: dT(s * 0.6, -1, 0.1), paume: dT(-s, 0, 0), dirMain: dT(0, 0.6, 0.8), doigts: 'barre' };
      const piv = V(0, 0.05, 1.5);
      r.objets = (info, uu, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), dir = unite(m.clone().sub(piv)); sortie.push(pret(seg(piv, m.clone().add(dir.clone().multiplyScalar(0.1)), 0.025, C.metal, 1))); const pp = m.clone().sub(dir.clone().multiplyScalar(0.22)), q = arc(AY, dir); sortie.push({ forme: 'cylindre', s: [0.18, 0.045, 0.18], p: [pp.x, pp.y, pp.z], q: [q.x, q.y, q.z, q.w], couleur: C.fonte, metal: 0 }); };
    } else if (o.elas) { p.bras = pareil(B(30, 28, 60, 140, 90)); r.tenu = [{ t: 'elastique', de: 'pieds', m: 'G', bout: 'rien' }, { t: 'elastique', de: 'pieds', m: 'D', bout: 'rien' }]; }
    else if (o.hanches) p.bras = mains(c, t, 'hanches');
    else if (o.nuque) p.bras = mains(c, t, 'nuque');
    else p.bras = pareil(B(6, lerp(30, 86, u == null ? 1 : u), 0, 8, 180, { doigts: 'detendu' }));          // bras qui montent devant pour l'équilibre
    return r;
  }

  /* Squats : les pieds restent au sol, le bassin descend.
     Charge : voir porter. Pieds : (largeur d'épaules), sumo, serre. Amplitude : demi, boite (jusqu'à un banc),
     partiel. Variantes : saut ; pistolet (une jambe ; assiste ; boite) ; sissy ; cosaque ; cycliste (talons
     surélevés) ; thruster (squat puis développé) ; mur (chaise contre le mur, tenue ; ballon) ; hack (machine
     inclinée ; avec barre : la barre derrière les jambes) ; ceinture (charge accrochée à la taille). */
  FAM.squat = (c, o, C) => {
    const L = c.L, sumo = !!o.sumo;
    const ecart = sumo ? 0.34 : o.serre ? 0.09 : 0.17, ouv = sumo ? 40 : 20;
    const prof = o.demi ? 0.52 : o.partiel ? 0.7 : o.boite ? 0.8 : 1;
    const droit = o.avant || o.gobelet || o.kb || o.tete || o.zercher || o.landmine || o.smith || sumo || o.cycliste;   // buste plus droit
    let fixe = [], vue = { az: 38, el: 8 }, objetsPlus = null;
    if (o.mur) {
      // Chaise contre le mur : dos au mur, cuisses à l'horizontale ; tenue.
      const p = debout(c, { dy: -0.4, dz: -0.42, penche: 0, ecart: 0.13, ouv: 6 }); p.bras = pareil(B(0, 20, 0, 10, 180, { doigts: 'detendu' }));
      const zMur = p.bassin.pos.z - L.dos - 0.02;
      fixe = poseFixe(MAT.mur(C, zMur)); if (o.ballon) fixe.push(pret(sphere(0.2, 0, p.bassin.pos.y + 0.25, zMur + 0.2, C.ballon, 0)));
      if (o.ballon) { const hautP = debout(c, { dy: -0.05, dz: -0.42, penche: 0, ecart: 0.13, ouv: 6 }); hautP.bras = cloner(p.bras); return { a: hautP, b: p, fixe, vue: { az: 70, el: 8 } }; }
      const q = cloner(p); q.thorax = 1.5;
      return { a: p, b: q, rythme: 'tenue', fixe, vue: { az: 70, el: 8 } };
    }
    if (o.hack && !o.barre) {
      // Machine inclinée : le dos glisse le long d'un dossier à 60°, les pieds sur un plateau.
      const r = V(0, Math.sin(rad(58)), -Math.cos(rad(58))), base = V(0, 0.92, -0.2);
      const cle = u => { const p = { bassin: { pos: base.clone().add(r.clone().multiplyScalar(-0.3 * u)), rot: qX(-28) }, lombaires: 0, thorax: 0, cou: 6, bras: {}, jambes: {} }; for (const [k, s] of COTES) { p.jambes[k] = { cheville: V(s * 0.16, 0.3, 0.42), pole: V(s * 0.2, 0.4, 1), pied: V(s * 0.15, 0.55, 0.83), hautPied: V(0, 0.83, -0.55) }; p.bras[k] = B(30, 40, 0, 100, 90); } return p; };
      fixe = [pret(boite(0.5, 0.05, 0.5, 0, 0.25, 0.55, C.cadre, 0.5, qX(-32))), pret(seg(V(0, 0.15, 0.25), V(0, 1.75, -0.75), 0.035, C.cadre, 0.5))];
      const d = { pose: cle, fixe, vue: { az: 62, el: 10 }, tenu: [] };
      d.objets = (info, u, sortie) => { const b = info.bassin, q = qX(-28), dos = V(0, 0.32, -0.15).applyQuaternion(q).add(b); sortie.push({ forme: 'boite', s: [0.4, 0.75, 0.06], p: [dos.x, dos.y, dos.z], q: [q.x, q.y, q.z, q.w], couleur: C.banc, metal: 0 }); };
      return d;
    }
    const cle = u => {
      const k = u * prof;
      let p;
      if (o.sissy) {
        // Squat sissy : les genoux partent en avant, le corps bascule en arrière d'un bloc, talons levés.
        p = debout(c, { dy: -0.34 * k, dz: -0.02 * k, penche: -30 * k, ecart: 0.1, ouv: 6, pointe: 48 * k, cou: 10 * k });
        for (const [kk, s] of COTES) p.jambes[kk].pole = V(0, 0, 1);
      } else if (o.cosaque) {
        // Squat cosaque : pieds très écartés, le poids passe sur une jambe pliée, l'autre reste tendue.
        p = debout(c, { dx: 0.3 * k, dy: -0.42 * k, dz: -0.12 * k, penche: 26 * k, ecart: 0.42, ouv: 30, cou: -14 * k });
        p.jambes.D.pied = V(-0.2, 0.7 * k, 0.7).normalize(); p.jambes.D.hautPied = V(0, 0.7, -0.7 * k).normalize();
      } else {
        p = debout(c, { dy: -0.4 * k, dz: (droit ? -0.14 : -0.2) * k, penche: 2 + (droit ? 16 : 28) * k, ecart, ouv, lomb: 4 * k, thor: 6 * k, cou: -(droit ? 12 : 22) * k, y0: o.cycliste ? 0 : 0 });
        if (o.cycliste) for (const [kk, s] of COTES) p.jambes[kk] = pied(c, s, { ecart: 0.1, ouv: 8, pointe: 14 });
      }
      return p;
    };
    const d = { vue, tenu: [], fixe };
    if (o.pistolet) {
      // Sur une jambe : l'autre reste tendue devant.
      d.pose = u => { const p = debout(c, { dx: 0.06, dy: -0.5 * u * (o.boite ? 0.72 : 1), dz: -0.22 * u, penche: 2 + 34 * u, ecart: 0.07, ouv: 6, lomb: 8 * u, cou: -20 * u }); p.jambes.D = J(lerp(8, 84, Math.sqrt(u)) + (2 + 34 * u), 4, 0, 6, 10); const m = porter(c, p, o, C, u); if (o.assiste) { p.bras.G = { prise: V(0.25, 1.05, 0.38), pole: V(1, -0.5, 0), paume: V(-1, 0, 0), doigts: 'barre' }; } d.tenu = m.tenu; d.objets = m.objets; return p; };
      if (o.assiste) fixe.push(pret(seg(V(0.25, 0, 0.4), V(0.25, 1.6, 0.4), 0.02, C.cadre, 0.5)));
      if (o.boite) fixe.push(...poseFixe(MAT.step(C, 0.45, 0.42, 0.4, 0, -0.42)));
      d.pose(0); return d;
    }
    const m0 = porter(c, cle(0), o, C, 0); d.tenu = m0.tenu; d.objets = m0.objets;
    d.pose = u => { const p = cle(u); porter(c, p, o, C, u); return p; };
    if (o.boite || o.banc) fixe.push(...poseFixe(MAT.step(C, 0.5, 0.44, 0.4, 0, -0.5)));
    if (o.cycliste) fixe.push(pret(boite(0.4, 0.035, 0.12, 0, 0.018, -0.03, C.fonte, 0, qX(0))));
    if (o.smith) { const info = c.poser(d.pose(0)); fixe.push(...poseFixe(MAT.smith(C, (info.prises.G.z + info.prises.D.z) / 2))); }
    if (o.ceinture) d.objets = (info, u, sortie) => { const b = info.bassin; sortie.push(pret(seg(V(0, b.y - 0.1, b.z + 0.02), V(0, Math.max(0.12, b.y - 0.55), 0.02), 0.008, C.cadre, 0.6))); sortie.push(pret(cyl(0.2, 0.05, 0, Math.max(0.1, b.y - 0.58), 0.02, C.fonte, 0, DEBOUT_Q))); };
    if (o.saut) {
      // Squat sauté : flexion, détente, envol, réception.
      d.rythme = 'continu'; d.periode = 1.7;
      d.pose = ph => { const u = ph < 0.4 ? lisse(ph / 0.4) * 0.75 : ph < 0.52 ? 0.75 * (1 - lisse((ph - 0.4) / 0.12)) : ph > 0.86 ? 0.3 * Math.sin((ph - 0.86) / 0.14 * Math.PI) : 0; const p = cle(u); const vol = ph > 0.5 && ph < 0.86 ? Math.sin((ph - 0.5) / 0.36 * Math.PI) : 0; p.bassin.pos.y += 0.24 * vol; for (const [kk, s] of COTES) p.jambes[kk] = pied(c, s, { ecart, ouv, pointe: 50 * vol, y0: 0.24 * vol - 0.02 * vol }); porter(c, p, o, C, u * (1 - vol)); if (!(o.barre || o.hal || o.gobelet || o.kb)) p.bras = pareil(B(4, 30 + 130 * vol - 40 * u, 0, 12, 90, { doigts: 'detendu' })); return p; };
    }
    if (o.thruster) {
      // Squat barre devant, puis la barre est poussée au-dessus de la tête en se relevant.
      d.rythme = 'continu'; d.periode = 3.2;
      const bas = cle(1), hautP = cle(0); o.avant = true; porter(c, bas, o, C, 1); porter(c, hautP, o, C, 0);
      const dessus = cloner(hautP); const t = c.tronc(dessus); for (const [kk, s] of COTES) dessus.bras[kk] = { prise: t.duThorax(V(s * 0.3, L.bras + L.prise - 0.03, 0.02)), pole: V(s * 0.7, -1, 0.5).applyQuaternion(t.qThorax), paume: V(0, 0, 1).applyQuaternion(t.qThorax), dirMain: V(0, 1, 0).applyQuaternion(t.qThorax), doigts: 'barre' };
      for (const q of [bas, hautP]) for (const [kk, s] of COTES) { q.bras[kk].paume = V(0, 0.3, 1).applyQuaternion(c.tronc(q).qThorax); }
      d.tenu = [{ t: o.hal ? 'haltere' : 'barre', m: 'GD', l: 1.6, d: 0.2 }];
      d.pose = ph => (ph < 0.3 ? mel(hautP, bas, lisse(ph / 0.3)) : ph < 0.5 ? mel(bas, hautP, lisse((ph - 0.3) / 0.2)) : ph < 0.68 ? mel(hautP, dessus, lisse((ph - 0.5) / 0.18)) : ph < 0.8 ? dessus : mel(dessus, hautP, lisse((ph - 0.8) / 0.2)));
    }
    return d;
  };

  /* Fentes, fentes bulgares, montées sur banc.
     Sortes : statique (défaut : pieds décalés, on descend sur place), avant, arriere, marchee (sur place, en
     alternant), laterale, bulgare (pied arrière sur un banc), step (montée sur un banc), pliometrique (sautée).
     Options : piedAvantHaut (pied avant surélevé), deficit (fente arrière depuis une marche), alt. Charge : porter. */
  FAM.fente = (c, o, C) => {
    const L = c.L, z0 = L.racine.z + L.hanche.z;
    const fixe = [], d = { vue: { az: 62, el: 8 }, tenu: [], fixe };
    const droit = !(o.barre || o.smith);
    if (o.step) {
      // Montée sur banc : un pied sur le banc, le corps se hisse ; l'autre pied vient se poser à côté.
      const h = o.poliquin ? 0.2 : 0.4;
      fixe.push(...poseFixe(MAT.step(C, 0.6, h, 0.42, 0, 0.36)));
      d.pose = u => { const p = debout(c, { dy: h * u - 0.02 * (1 - u), dz: 0.1 + 0.26 * u, penche: 18 * (1 - u) + 2, cou: -10 * (1 - u) }); p.bassin.pos.z = z0 + 0.1 + 0.25 * u; p.jambes.G = pied(c, 1, { z: z0 + 0.34, y0: h, ouv: 6 }); const lv = Math.sin(Math.PI * u); p.jambes.D = pied(c, -1, { z: z0 - 0.12 + 0.44 * u, y0: h * lisse(u) + 0.06 * lv, ouv: 6, pointe: 25 * (1 - u) }); const m = porter(c, p, o, C, 0); d.tenu = m.tenu; d.objets = m.objets; return p; };
      d.pose(0); if (o.poulie) { d.tenu = [{ t: 'cable', de: V(0, 0.2, 1.4), m: 'G', bout: 'poignee' }]; fixe.push(...poseFixe(MAT.colonne(C, V(0, 0.2, 1.4)))); }
      return d;
    }
    if (o.laterale) {
      // Fente latérale : un grand pas de côté, le bassin descend sur la jambe pliée, l'autre reste tendue.
      d.vue = { az: 20, el: 8 };
      const cote = (u, s) => { const p = debout(c, { dx: s * 0.34 * u, dy: -0.34 * u, dz: -0.16 * u, penche: 2 + 30 * u, cou: -16 * u, ecart: 0.1, ouv: 8 }); const kT = s > 0 ? 'G' : 'D', lv = Math.sin(Math.PI * u) * 0.05; p.jambes[kT] = pied(c, s, { x: s * (0.1 + 0.5 * u), ouv: 14, y0: lv * (u < 0.8 ? 1 : 0) }); porter(c, p, Object.assign({}, o, droit && !(o.hal || o.kb || o.gobelet) ? { } : {}), C, u); return p; };
      d.pose = (uG, uD) => (uD > 0 ? cote(uD, -1) : cote(uG || 0, 1));
      d.rythme = 'alt'; const m = porter(c, cote(0, 1), o, C, 0); d.tenu = m.tenu; d.objets = m.objets;
      if (o.pliometrique) { d.rythme = 'continu'; d.periode = 1.3; d.pose = ph => { const s = ph < 0.5 ? 1 : -1, q = (ph % 0.5) / 0.5, p = cote(Math.sin(Math.PI * q), s); p.bassin.pos.y += 0.05 * Math.sin(Math.PI * q) * 0; return p; }; }
      return d;
    }
    // Fentes dans l'axe : pied avant et pied arrière ; le genou arrière descend vers le sol.
    const bulg = !!o.bulgare, hAr = bulg ? 0.44 : 0, hAv = o.piedAvantHaut ? 0.12 : 0, hSol = o.deficit ? 0.15 : 0;
    const zAv = bulg ? 0.3 : 0.34, zAr = bulg ? -0.62 : -0.42;
    if (bulg) fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, zAr - 0.25), qY(90)));
    if (o.piedAvantHaut) fixe.push(pret(boite(0.4, hAv, 0.34, 0.1, hAv / 2, z0 + zAv + 0.05, C.fonte, 0)));
    if (o.deficit) fixe.push(pret(boite(0.5, hSol, 0.4, 0, hSol / 2, z0 + 0.04, C.banc, 0)));
    // k : avancée dans la descente ; pas : part du déplacement du pied mobile déjà faite (fentes avant et arrière).
    const cle = (k, pas, sAv) => {
      const kAv = sAv > 0 ? 'G' : 'D', kAr = sAv > 0 ? 'D' : 'G';
      const avance = o.avant ? 0.34 * pas : o.arriere ? -0.02 * pas : 0;
      const p = debout(c, { dy: (o.deficit ? hSol : 0) - (bulg ? 0.34 : 0.36) * k, dz: (o.avant || o.arriere ? avance - (o.arriere ? 0.14 * pas : 0) : -0.04) , penche: 4 + (droit ? 8 : 14) * k, cou: -6 * k, ecart: 0.09, ouv: 4, y0: o.deficit ? hSol : 0 });
      const lv = Math.sin(Math.PI * pas) * 0.07;
      if (o.avant) { p.jambes[kAv] = pied(c, sAv, { ecart: 0.09, ouv: 4, z: z0 + 0.68 * pas, y0: hAv * pas + (pas < 1 ? lv : 0) }); p.jambes[kAr] = pied(c, -sAv, { ecart: 0.09, ouv: 4, z: z0, pointe: 55 * k }); }
      else if (o.arriere) { p.jambes[kAv] = pied(c, sAv, { ecart: 0.09, ouv: 4, z: z0, y0: o.deficit ? hSol : 0 }); p.jambes[kAr] = pied(c, -sAv, { ecart: 0.09, ouv: 4, z: z0 - 0.7 * pas, y0: (o.deficit ? hSol * (1 - pas) : 0) + (pas < 1 ? lv : 0), pointe: 55 * Math.max(k, pas * 0.6) }); }
      else { p.jambes[kAv] = pied(c, sAv, { ecart: 0.09, ouv: 4, z: z0 + zAv, y0: hAv }); p.jambes[kAr] = pied(c, -sAv, { ecart: 0.09, ouv: 4, z: z0 + zAr, y0: hAr, pointe: bulg ? 74 : 30 + 28 * k }); }
      return p;
    };
    const mouvant = o.avant || o.arriere || o.marchee;
    if (o.marchee) o.avant = true;
    const une = (u, s) => { const pas = mouvant ? lisse(Math.min(1, u / 0.45)) : 1, k = mouvant ? lisse(Math.max(0, (u - 0.3) / 0.7)) : u; const p = cle(k, pas, s); porter(c, p, o, C, 0); return p; };
    const m0 = porter(c, cle(0, mouvant ? 0 : 1, 1), o, C, 0); d.tenu = m0.tenu; d.objets = m0.objets;
    if (o.alt || o.marchee) { d.rythme = 'alt'; d.pose = (uG, uD) => (uD > 0 ? une(uD, -1) : une(uG || 0, 1)); }
    else d.pose = u => une(u, 1);
    if (o.smith) { const info = c.poser(d.pose(0)); fixe.push(...poseFixe(MAT.smith(C, (info.prises.G.z + info.prises.D.z) / 2))); }
    if (o.pliometrique) {
      // Fente sautée : on descend, on bondit, on retombe (sur la même jambe pour la fente bulgare).
      d.rythme = 'continu'; d.periode = 1.5;
      d.pose = ph => { const u = ph < 0.45 ? lisse(ph / 0.45) : ph < 0.6 ? 1 - lisse((ph - 0.45) / 0.15) : 0, vol = ph > 0.58 && ph < 0.9 ? Math.sin((ph - 0.58) / 0.32 * Math.PI) : 0; const p = cle(u, 1, 1); p.bassin.pos.y += 0.16 * vol; p.jambes.G = pied(c, 1, { ecart: 0.09, ouv: 4, z: z0 + zAv, y0: 0.16 * vol, pointe: 40 * vol }); porter(c, p, o, C, 0); return p; };
    }
    return d;
  };
