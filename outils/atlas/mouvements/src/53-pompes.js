  /* ---------- Pompes et dips ---------- */
  /* Appui sur les mains et les pieds, hanches fléchies (pompe en pike, chien tête en bas). Les pieds restent posés
     (yPieds, à `portee` derrière les mains) ; le bassin bascule jusqu'à ce que l'épaule soit à la distance voulue du
     poignet. Renvoie (distance épaule-poignet, flexion des hanches) => pose. */
  function appuiPike(c, o) {
    return (dist, pike) => {
      const p = { bassin: { pos: V(), rot: new Quat() }, lombaires: o.lomb == null ? 6 : o.lomb, thorax: o.thor == null ? 4 : o.thor, cou: o.cou == null ? 10 : o.cou, bras: pareil(brasRepos()), jambes: pareil(J(pike, 2, 0, o.genou || 3, o.pointe == null ? 28 : o.pointe)) };
      const poser = th => {
        p.bassin.rot = qX(th); p.bassin.pos.set(0, 1, 0);
        c.poserSur(p, V(0, o.yPieds || 0, 0), AY, ['pied']);
        const info = c.poser(p); p.bassin.pos.z += -o.portee - info.orteils.G.z;
        return info.epaules.G.clone().add(V(0, 0, -o.portee - info.orteils.G.z)).distanceTo(o.poignet) - dist;
      };
      // La moins renversée des solutions : en basculant depuis l'horizontale, la première fois que la distance est bonne.
      poser(premierZero(poser, 70, 178, 6));
      return p;
    };
  }
  /* Pompes : le corps droit (des talons, ou des genoux, à la tête), les mains en appui, les coudes plient.
     Mains : large, serre, diamant, triceps (coudes au corps), inverse (doigts vers les pieds), doigts, jointures,
     poignees, hal (mains sur des haltères), profonde (barres basses : la poitrine descend sous les mains), anneaux,
     pseudo (pseudo-planche : mains à la taille). Appuis : genoux, incline (mains sur un banc), decline (pieds sur un
     banc). Variantes : archer, unbras, claquement, jack, cobra (pompe hindoue), negatif, leste, elas, scapulaire,
     birddog, superman, poignets ; pike (hanches hautes ; banc : pieds surélevés ; entre : mains sur deux bancs) ;
     equilibre (en équilibre contre un mur) ; planche (pieds décollés, corps à l'horizontale). */
  FAM.pompe = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 62, el: 12 }, tenu: [], fixe };
    const A = L.bras + L.avantBras, Ap = L.bras + L.prise;
    const aPlat = (s, x, y, z, dir, pole, doigts) => ({ prise: V(s * x, y + 0.008, z), pole, paume: V(0, -1, 0), dirMain: dir || V(0, 0, 1), doigts: doigts || 'plat' });
    const epX = c.tronc(debout(c, {})).epaules.G.x;

    if (o.equilibre) {
      // En équilibre sur les mains, les talons contre un mur : les coudes plient, la tête descend vers le sol.
      const haut = Math.sqrt(Math.pow(0.97 * A, 2) - Math.pow(0.26 - epX, 2)) + L.creux, tete0 = c.tronc(debout(c, {}));
      let hautTendu = null;
      const cle = u => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(176) }, lombaires: -3, thorax: -2, cou: lerp(-6, -16, u), bras: {}, jambes: pareil(J(-2, 2, 0, 3, 40)) };
        const t = c.tronc(p); p.bassin.pos.y += lerp(hautTendu != null ? hautTendu : haut, 0.3, u) - t.epaules.G.y; p.bassin.pos.z += lerp(0, 0.05, u) - t.epaules.G.z;
        for (const [k, s] of COTES) p.bras[k] = aPlat(s, 0.26, 0, -L.main, V(0, 0, -1), V(s * 0.7, 0.2, lerp(-0.2, -1, u)));
        return p;
      };
      // En haut, bras tendus : la hauteur des épaules se règle sur le corps posé.
      { const p0 = cle(0); tendre(c, p0, V(0, 1, 0)); hautTendu = c.tronc(p0).epaules.G.y; }
      d.a = cle(0); d.b = cle(1);
      const info = c.poser(cle(0)); fixe.push(...poseFixe(MAT.mur(C, Math.max(info.chevilles.G.z, info.orteils.G.z) + 0.1, 1.2, 2.3)));
      d.vue = { az: 122, el: 6 }; return d;
    }
    if (o.planche) {
      // Planche : corps à l'horizontale, pieds décollés, bras tendus penchés vers l'avant ; les coudes plient.
      const cle = u => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(92) }, lombaires: 2, thorax: 6, cou: -24, bras: {}, jambes: pareil(J(-4, 3, 0, 3, 50)) };
        const t = c.tronc(p), h = lerp(0.74 * A, 0.3 * A, u); p.bassin.pos.y += h + L.creux - t.epaules.G.y; p.bassin.pos.z += -t.epaules.G.z;
        const recul = Math.sqrt(Math.max(0.01, Math.pow(0.96 * A, 2) - 0.74 * A * 0.74 * A)) * lerp(1, 0.75, u);
        for (const [k, s] of COTES) p.bras[k] = aPlat(s, 0.24, 0, -recul + L.main, V(s * 0.7, 0, 0.5), V(s * 0.5, 0.3, -1));
        return p;
      };
      d.a = cle(0); d.b = cle(1); d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.pike) {
      // Hanches hautes, en V renversé : les coudes plient, la tête descend vers le sol entre les mains.
      const yM = o.entre ? 0.44 : 0, yP = o.banc ? 0.44 : 0, portee = o.banc ? 0.78 : o.entre ? 1.0 : 0.92;
      const ap = appuiPike(c, { yPieds: yP, portee, poignet: V(0.26, yM + L.creux + 0.008, -L.main), cou: 16 });
      const bas = o.entre ? 0.42 * A : o.banc ? 0.64 * A : 0.56 * A;
      const cle = u => { const p = ap(lerp(0.965 * A, bas, u), lerp(80, 92, u)); p.cou = lerp(16, 2, u); for (const [k, s] of COTES) p.bras[k] = aPlat(s, 0.26, yM, 0, V(s * 0.15, 0, 1), V(s * 0.85, 0.3, lerp(0.2, -0.3, u))); return p; };
      d.cles = [0, 0.33, 0.66, 1].map(u => [u, cle(u)]);
      if (o.banc) fixe.push(...poseFixe(MAT.banc(C, 0), V(0.3, 0, -portee - 0.08), qY(90)));
      if (o.entre) for (const s of [1, -1]) fixe.push(...poseFixe(MAT.banc(C, 0), V(s * 0.31, 0, 0.3)));
      d.vue = { az: 68, el: 10 }; return d;
    }

    // Pompe classique et ses variantes.
    const yM = o.incline ? 0.44 : o.anneaux ? 0.2 : o.profonde ? 0.22 : o.poignees ? 0.11 : o.hal ? 0.062 : o.jointures ? 0.032 : o.doigts ? 0.05 : 0;
    const yP = o.decline ? 0.44 : 0;
    const ecart = o.archer ? 0.46 : o.large ? 0.4 : o.diamant ? 0.045 : o.serre || o.triceps ? 0.17 : o.unbras ? 0.07 : 0.26;
    const ferme = !!(o.poignees || o.hal || o.anneaux || o.jointures || o.profonde);   // main refermée, dans l'axe de l'avant-bras
    // Mains reculées vers la taille (pseudo-planche) ; en diamant, elles sont sous la poitrine, pas sous le visage :
    // en bas, les avant-bras restent dressés au lieu de se coucher au sol.
    const recul = o.pseudo ? 0.27 : o.diamant ? 0.12 : 0;
    const pl = planche(c, { yPieds: yP, genoux: !!o.genoux, ecartPieds: o.unbras ? 0.3 : 0.09 });
    const portee = 0.965 * (ferme ? Ap : A), dx = ecart - epX, yAppui = yM + (ferme ? 0 : L.creux + 0.008);
    const hHaut = yAppui + Math.sqrt(Math.max(0.01, portee * portee - dx * dx - recul * recul));
    const zEp = pl(hHaut).epaules.G.z, zM = zEp - recul + (ferme ? 0 : L.main);
    // Le bas : la poitrine arrive près du sol (ou du support ; plus bas entre des appuis surélevés).
    // Mains sous la poitrine (diamant, serrée, un bras) : la poitrine s'arrête sur les mains.
    const cible = o.incline ? yM + 0.07 : o.profonde ? yM - 0.1 : o.poignees || o.hal || o.anneaux ? yM - 0.03 : o.diamant ? yM + 0.16 : o.unbras ? yM + 0.11 : o.serre || o.triceps ? yM + 0.07 : yM + 0.05;
    const basPoitrine = h => -c.extreme(pl(h), V(0, -1, 0), o.incline ? ['thorax'] : ['thorax', 'abdomen']) - cible;
    const hBas = o.scapulaire ? hHaut - 0.05 : o.poignets ? hHaut : Math.max(zeroDe(basPoitrine, hHaut - 0.2, hHaut - 0.3, 0.12), yAppui + 0.1);
    const pole = s => (o.large || o.archer ? V(s * 1, 0.5, -0.25) : o.serre || o.triceps || o.pseudo || o.unbras ? V(s * 0.3, 0.6, -1) : o.diamant ? V(s * 0.6, 0.6, -0.8) : V(s * 0.75, 0.6, -0.7));
    const dir = s => (o.diamant ? V(-s * 0.75, 0, 0.66) : o.inverse ? V(s * 0.4, 0, -1) : o.pseudo ? V(s * 0.85, 0, -0.4) : o.large || o.archer ? V(s * 0.25, 0, 1) : V(0, 0, 1));
    const main = (s, u) => (ferme ? { prise: V(s * ecart, yM, zM), pole: pole(s), paume: o.jointures || !o.hal ? V(-s, 0, 0) : V(-s, 0, 0), doigts: o.jointures ? 'poing' : 'barre' }
      : aPlat(s, ecart, yM, zM, dir(s), pole(s), o.doigts ? 'detendu' : 'plat'));
    const cle = (u, plus) => {
      const p = pl(lerp(hHaut, hBas, u));
      for (const [k, s] of COTES) p.bras[k] = main(s, u);
      if (o.scapulaire) for (const k of ['G', 'D']) p.bras[k].avance = lerp(10, -10, u);
      if (o.jack) for (const [k, s] of COTES) { p.jambes[k].cheville.x = s * lerp(0.09, 0.34, u); p.jambes[k].cheville.z += 0.05 * u; }
      if (o.unbras) p.bras.D = B(40, -34, 0, 96, 150, { doigts: 'detendu' });
      if (plus) plus(p);
      return p;
    };
    // Le matériel.
    if (o.incline) fixe.push(...poseFixe(MAT.banc(C, 0), V(0.3, 0, zM + 0.07), qY(90)));
    if (o.decline) fixe.push(...poseFixe(MAT.banc(C, 0), V(0.3, 0, -1.22 - 0.06), qY(90)));
    if (o.hal) d.tenu = [{ t: 'haltere', m: 'GD' }];
    if (o.poignees) for (const s of [1, -1]) { fixe.push(pret(cyl(0.015, 0.17, s * ecart, yM, zM, C.metal, 1, LONG_Z))); for (const z of [-0.075, 0.075]) fixe.push(pret(boite(0.1, yM, 0.018, s * ecart, yM / 2, zM + z, C.cadre, 0.5))); }
    if (o.profonde) for (const s of [1, -1]) { fixe.push(pret(cyl(0.017, 0.5, s * ecart, yM, zM, C.metal, 1, LONG_Z))); for (const z of [-0.22, 0.22]) { fixe.push(pret(boite(0.03, yM, 0.03, s * ecart, yM / 2, zM + z, C.cadre, 0.5))); fixe.push(pret(boite(0.22, 0.02, 0.04, s * ecart, 0.01, zM + z, C.cadre, 0.5))); } }
    if (o.anneaux) d.tenu = [{ t: 'sangle', de: V(ecart, 2.6, zM), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, 2.6, zM), m: 'D', bout: 'anneau' }];
    const dos = (info, dy, dz) => info.epaules.G.clone().add(info.epaules.D).multiplyScalar(0.5).add(V(0, dy, dz).applyQuaternion(info.qThorax));
    if (o.leste) {
      const info0 = c.poser(cle(0)), m0 = dos(info0, -0.14, 0), n0 = V(0, 0, -1).applyQuaternion(info0.qThorax); let haut = 0.08;
      c.peauPosee(['dos', 'thorax', 'epaule'], (x, y, z) => { const v = V(x - m0.x, y - m0.y, z - m0.z), h = v.dot(n0); if (h > haut && v.sub(n0.clone().multiplyScalar(h)).length() < 0.15) haut = h; });
      d.objets = (info, u, sortie) => { const b = dos(info, -0.14, -haut - 0.022); poserObjet([cyl(0.2, 0.04, 0, 0, 0, C.fonte, 0, LONG_Z)], b, info.qThorax, sortie); };
    }
    if (o.elas) d.objets = (info, u, sortie) => { const g = dos(info, -0.03, -L.dos - 0.01).add(V(0.17, 0, 0)), dr = g.clone().setX(-0.17); sortie.push(pret(seg(info.prises.G, g, 0.008, C.elastique, 0)), pret(seg(g, dr, 0.008, C.elastique, 0)), pret(seg(dr, info.prises.D, 0.008, C.elastique, 0))); };

    if (o.archer) {
      // Un bras plie et porte le corps de son côté, l'autre reste tendu ; puis l'inverse.
      d.rythme = 'alt'; d.periode = 5.2;
      d.pose = (uG, uD) => { const u = Math.max(uG, uD), p = cle(0.92 * u); p.bassin.pos.x += 0.2 * (uG - uD); p.inclinaison = 0; for (const [k, s] of COTES) p.bras[k].pole = (k === 'G' ? uG : uD) > 0 ? V(s * 0.5, 0.2, -1) : V(s * 1, 0.6, 0); return p; };
      d.vue = { az: 40, el: 16 }; return d;
    }
    if (o.claquement || o.superman || o.negatif) {
      const haut = cle(0), bas = cle(1);
      if (o.negatif) { d.rythme = 'boucle'; d.periode = 4.6; d.cles = [[0, haut], [0.08, haut], [0.66, bas], [0.76, bas], [0.92, haut], [1, haut]]; return d; }
      // Poussée explosive : les mains quittent le sol (elles claquent, ou les bras partent vers l'avant), puis on se reçoit.
      const vol = cle(0, p => {
        p.bassin.pos.y += o.superman ? 0.2 : 0.1;
        const t = c.tronc(p);
        if (o.superman) { p.bras = pareil(B(8, 168, 0, 6, 180, { doigts: 'plat' })); for (const [k, s] of COTES) { p.jambes[k] = cloner(p.jambes[k]); p.jambes[k].cheville.y += 0.22; } }
        else for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.025, t.epaules.G.y - 0.36, zM - 0.02), pole: V(s * 1, 0.2, -0.4), paume: V(-s, 0, 0), dirMain: V(0, -0.2, 1), doigts: 'plat' };
      });
      d.rythme = 'boucle'; d.periode = 3.2; d.cles = [[0, haut], [0.1, haut], [0.4, bas], [0.47, bas], [0.6, haut], [0.72, vol], [0.86, haut], [1, haut]];
      return d;
    }
    if (o.cobra) {
      // Pompe hindoue : du V renversé, la poitrine plonge au ras du sol entre les mains et remonte, hanches basses.
      const ras = cle(1), orteils = c.poser(ras).orteils.G.z;
      const ap = appuiPike(c, { yPieds: 0, portee: -orteils, poignet: V(0.26, L.creux + 0.008, zM - L.main), cou: 12 });
      const v = ap(0.965 * A, 70); for (const [k, s] of COTES) v.bras[k] = main(s, 0);
      const chien = { bassin: { pos: V(0, 0.2, 0), rot: qX(62) }, lombaires: -30, thorax: -16, cou: -18, bras: {}, jambes: {} };
      const t = c.tronc(chien); chien.bassin.pos.add(V(0, yAppui + portee - 0.01 - t.epaules.G.y, zEp + 0.04 - t.epaules.G.z));
      for (const [k, s] of COTES) { chien.bras[k] = main(s, 0); chien.jambes[k] = cloner(ras.jambes[k]); }
      // Hanches basses, le corps avance : les pieds suivent de quelques centimètres (les jambes restent tendues).
      { const info = c.poser(chien); for (const k of ['G', 'D']) chien.jambes[k].cheville.z += info.chevilles[k].z - chien.jambes[k].cheville.z; }
      // Les pieds de la planche et ceux du V renversé ne sont pas au même endroit : tout est ramené aux mêmes appuis.
      for (const [k, s] of COTES) { const info = c.poser(v); v.jambes = Object.assign({}, v.jambes, { [k]: { cheville: info.chevilles[k].clone(), pole: V(0, -1, 0.15), pied: info.pieds[k].pied.clone(), hautPied: info.pieds[k].hautPied.clone(), orteils: 40 } }); }
      const zV = v.jambes.G.cheville.z, zR = ras.jambes.G.cheville.z;
      for (const p of [ras, chien]) { p.bassin.pos.z += 0; }
      d.rythme = 'boucle'; d.periode = 4.4; d.cles = [[0, v], [0.1, v], [0.42, ras], [0.62, chien], [0.72, chien], [0.92, v], [1, v]];
      d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.birddog) {
      // Une pompe, puis en haut un bras et la jambe opposée s'allongent.
      const haut = cle(0), bas = cle(1), tendu = cle(0, p => { p.bras.G = B(0, 170, 0, 6, 90, { doigts: 'plat' }); const j = cloner(p.jambes.D); j.cheville.y += 0.32; j.cheville.z -= 0.05; p.jambes.D = j; });
      d.rythme = 'boucle'; d.periode = 4.8; d.cles = [[0, haut], [0.06, haut], [0.3, bas], [0.36, bas], [0.56, haut], [0.72, tendu], [0.84, tendu], [1, haut]];
      return d;
    }
    if (o.poignets) {
      // Pompes sur les poignets : bras tendus, les paumes se soulèvent (appui sur les doigts) puis se reposent.
      const levee = cle(0, p => { p.bassin.pos.y += 0.035; for (const [k, s] of COTES) { p.bras[k] = aPlat(s, ecart, 0.05, zM - 0.012, V(0, -0.62, 1), pole(s), 'plat'); } });
      d.a = cle(0); d.b = levee; return d;
    }
    d.a = cle(0); d.b = cle(1);
    return d;
  };

  /* Dips : en appui sur deux barres, les coudes plient et le corps descend.
     (défaut) barres parallèles ; pecs (buste plus penché) ; anneaux ; barre (barre droite devant soi) ; coreen (barre
     dans le dos) ; banc (mains sur un banc derrière soi, talons au sol ; pieds : sur un second banc ; leste) ;
     machine (dips assistés, genoux sur un plateau) ; assis (machine à dips assise) ; shrug (bras tendus, seules les
     épaules montent et descendent) ; leste (disque à la ceinture). */
  FAM.dips = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 52, el: 8 }, tenu: [], fixe };
    const R = 0.97 * (L.bras + L.prise);
    if (o.banc) {
      // Dos au banc, mains sur le bord, jambes devant : les coudes plient vers l'arrière, les fesses descendent.
      const hB = 0.44, hP = o.pieds ? 0.44 : 0, A = L.bras + L.avantBras;
      const cle = u => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(lerp(-6, -2, u)) }, lombaires: 2, thorax: 2, cou: 4, bras: {}, jambes: {} };
        const t = c.tronc(p); p.bassin.pos.y += hB + L.creux + lerp(0.955 * A, 0.5 * A, u) - t.epaules.G.y; p.bassin.pos.z += 0.02 - t.epaules.G.z;
        for (const [k, s] of COTES) {
          p.bras[k] = { prise: V(s * 0.21, hB + 0.008, -0.02 + L.main * 0.4), pole: V(s * 0.12, 0.25, -1), paume: V(0, -1, 0), dirMain: V(0, -0.15, 1), doigts: 'plat' };
          p.jambes[k] = { cheville: V(s * 0.1, hP + 0.085, o.pieds ? 0.78 : 0.8), pole: V(0, 1, 0.3), pied: V(0, 0.86, 0.5), hautPied: V(0, 0.5, -0.86) };
        }
        return p;
      };
      d.a = cle(0); d.b = cle(1);
      fixe.push(...poseFixe(MAT.banc(C, 0, hB), V(0.3, 0, -0.17), qY(90)));
      if (o.pieds) fixe.push(...poseFixe(MAT.banc(C, 0, hP), V(0.3, 0, 0.86), qY(90)));
      if (o.leste) d.objets = (info, u, sortie) => { const m = info.hanches.G.clone().add(info.hanches.D).multiplyScalar(0.5).add(info.genoux.G).add(info.genoux.D).multiplyScalar(1 / 3); poserObjet([cyl(0.19, 0.04, 0, 0, 0, C.fonte, 0, DEBOUT_Q)], V(0, m.y + 0.11, m.z + 0.02), qX(-12), sortie); };
      d.vue = { az: 58, el: 10 }; return d;
    }
    if (o.assis) {
      // Machine à dips assise : poignées de chaque côté du siège, les bras poussent vers le bas.
      const p = assis(c, { h: H_SIEGE, penche: 2 }), t = c.tronc(p);
      const cle = u => { const q = cloner(p); for (const [k, s] of COTES) q.bras[k] = { prise: V(s * 0.31, lerp(t.epaules.G.y - 0.27, t.epaules.G.y - 0.56, u), t.epaules.G.z + 0.03), pole: V(s * 0.3, 0.2, -1), paume: V(-s, 0, 0), doigts: 'barre' }; return q; };
      d.a = cle(0); d.b = cle(1);
      fixe.push(...poseFixe(MAT.siege(C, H_SIEGE, 0.6, 6)));
      d.tenu = [{ t: 'levier', de: V(0.31, 0.5, -0.5), m: 'G' }, { t: 'levier', de: V(-0.31, 0.5, -0.5), m: 'D' }];
      d.vue = { az: 55, el: 10 }; return d;
    }
    // Barres parallèles, anneaux, barre droite, barre dans le dos.
    const h = o.barre || o.coreen ? 1.1 : 1.25, ecart = o.barre ? 0.29 : o.coreen ? 0.3 : 0.28;
    const cle = u => {
      const penche = o.barre ? lerp(10, 38, u) : o.coreen ? lerp(-4, 6, u) : o.pecs ? lerp(18, 34, u) : lerp(6, 16, u);
      const p = { bassin: { pos: V(0, 1.2, 0), rot: qX(penche) }, lombaires: 4, thorax: 4, cou: -penche * 0.5, bras: {}, jambes: {} };
      // Les jambes pendent : genoux fléchis, chevilles croisées vers l'arrière (tendues devant la barre droite).
      p.jambes = o.barre ? pareil(J(penche + lerp(14, 30, u), 2, 0, 6, 40)) : o.coreen ? pareil(J(penche + lerp(10, 34, u), 2, 0, 8, 40)) : o.machine ? pareil(J(penche + 4, 3, 0, 92, 30)) : pareil(J(penche - 4, 3, 0, 74, 30));
      const t = c.tronc(p), ep = t.epaules.G;
      const yEp = o.shrug ? h + R * 0.985 - 0.065 * u : lerp(h + R * 0.985, h + L.prise * 0.9, u);
      const zEp = o.barre ? lerp(-0.1, 0.02, u) : o.coreen ? lerp(0.1, 0.16, u) : o.shrug ? 0 : lerp(0, 0.17, u);
      p.bassin.pos.y += yEp - ep.y; p.bassin.pos.z += zEp - ep.z;
      for (const [k, s] of COTES) {
        p.bras[k] = o.barre ? { prise: V(s * ecart, h, 0), pole: V(s * 0.5, 0.2, -1), paume: V(0, -0.2, -1), doigts: 'barre' }
          : o.coreen ? { prise: V(s * ecart, h, 0), pole: V(s * 0.45, 0.1, -1), paume: V(0, -0.2, -1), doigts: 'barre' }
          : { prise: V(s * ecart, h, 0), pole: V(s * (o.pecs ? 0.6 : 0.22), 0.2, -1), paume: V(-s, 0, 0), doigts: 'barre' };
        if (o.shrug) p.bras[k].hausse = lerp(-6, 16, u);
      }
      return p;
    };
    d.a = cle(0); d.b = cle(1);
    if (o.anneaux) d.tenu = [{ t: 'sangle', de: V(ecart, 2.9, 0), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, 2.9, 0), m: 'D', bout: 'anneau' }];
    else if (o.barre || o.coreen) fixe.push(...poseFixe(MAT.barreFixe(C, h, 1.3)));
    else fixe.push(...poseFixe(MAT.paralleles(C, h, ecart, 0.75)));
    if (o.machine) d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().add(info.genoux.D).multiplyScalar(0.5); sortie.push(pret(boite(0.42, 0.05, 0.26, 0, g.y - 0.085, g.z - 0.12, C.banc, 0)), pret(seg(V(0, g.y - 0.1, g.z - 0.12), V(0, 0.25, -0.5), 0.022, C.cadre, 0.5)), pret(boite(0.5, 0.04, 0.5, 0, 0.02, -0.45, C.cadre, 0.5))); };
    if (o.leste) d.objets = (info, u, sortie) => { const b = info.bassin.clone().add(V(0, -0.34, 0.1).applyQuaternion(info.qBassin)); sortie.push(pret(seg(info.bassin.clone().add(V(0, -0.02, 0.1).applyQuaternion(info.qBassin)), b, 0.006, C.cable, 0.6))); poserObjet([cyl(0.17, 0.04, 0, 0, 0, C.fonte, 0)], b, null, sortie); };
    if (o.barre) d.vue = { az: 60, el: 8 }; else if (o.coreen) d.vue = { az: 120, el: 8 };
    return d;
  };
