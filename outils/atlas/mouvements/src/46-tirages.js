
  /* Corps tendu comme une planche, en appui sur les talons (visage vers le haut) ou la pointe des pieds (visage
     vers le bas), incliné de `angle` degrés au-dessus de l'horizontale. Renvoie la pose de base (sans les bras). */
  function corpsDroit(c, o) {
    const L = c.L, a = rad(o.angle), haut = o.face === 'haut', zP = o.zPieds || 0, yP = o.yPieds || 0;
    // La ligne du corps part des chevilles et monte vers la tête (vers -Z si le visage regarde en haut, +Z sinon).
    const dir = V(0, Math.sin(a), (haut ? -1 : 1) * Math.cos(a));
    const rot = haut ? qX(-(90 - o.angle)) : qX(90 - o.angle);
    const p = { bassin: { pos: V(), rot }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou == null ? (haut ? 8 : -20) : o.cou, bras: pareil(brasRepos()), jambes: {} };
    // Visage vers le bas : sur la pointe des pieds, le talon d'autant plus levé que le corps est à plat.
    const pointe = borne(92 - o.angle * 1.15, 12, 80);
    for (const [k, s] of COTES) {
      if (haut) p.jambes[k] = { cheville: V(s * (o.ecartPieds || 0.09), yP + 0.07, zP), pole: V(0, 1, -0.2), pied: V(0, 0.75, 0.66), hautPied: V(0, 0.66, -0.75) };
      else p.jambes[k] = pied(c, s, { x: s * (o.ecartPieds || 0.09), z: zP, y0: yP, ouv: 0, pointe, pole: V(0, -1, 0.15) });
    }
    const cheville = p.jambes.G.cheville.clone().setX(0);
    p.bassin.pos = cheville.clone().add(dir.clone().multiplyScalar(L.jambe + L.cuisse - 0.004)).sub(L.hanche.clone().setX(0).applyQuaternion(rot));
    return p;
  }

  /* Rowings : la main part bras tendu et vient au buste, le coude passe derrière.
     Postures : penche (défaut : 55° ; pendlay : presque à l'horizontale ; yates : buste relevé), ventre=<angle>
     (poitrine appuyée sur banc incliné), seal (à plat ventre sur un banc haut), appui (une main et un genou sur un
     banc), assis (poulie basse, jambes devant), debout (poulie, un pied en avant), machine (assis, poitrine appuyée),
     landmine / tbar (barre tenue par un bout). Cible : (bas des côtes), haut (coudes écartés, vers la poitrine),
     hanche. Matériel : barre, hal, kb, poulie, elas, machine, smith. Prise : (pronation), sup, neutre. Côtés : uni, alt. */
  FAM.rowing = (c, o, C) => {
    const L = c.L, m = coteDe(o);
    if (!(o.barre || o.kb || o.poulie || o.elas || o.machine || o.smith || o.landmine || o.tbar)) o.hal = true;
    let p, fixe = [], vue = { az: 128, el: 10 }, ancre = null, pendante = false;
    if (o.seal) { p = aPlatVentre(c, { h: 0.82, angle: 0, d: 0.1, jambes: 'tendues' }); fixe = poseFixe(MAT.banc(C, 0, 0.82, 1.0, 0.75), V(0, 0, -0.35), qY(180)); pendante = true; vue = { az: 60, el: 8 }; }
    else if (o.ventre != null) { const a = o.ventre === true ? 40 : o.ventre; p = aPlatVentre(c, { h: 0.44, angle: a, d: 0.08 }); fixe = poseFixe(MAT.banc(C, a, 0.44, 0.68, 0), V(), qY(180)); pendante = true; vue = { az: 56, el: 10 }; }
    else if (o.tabouret) {
      // Assis au bout d'un banc, le buste penché sur les cuisses : les haltères pendent le long des jambes.
      p = assis(c, { h: H_BANC, penche: 58 }); p.cou = -24; fixe = bancAssis(C); pendante = true; vue = { az: 58, el: 10 };
    }
    else if (o.appui) {
      // Une main et un genou sur le banc, l'autre pied par terre : le dos à plat.
      const s = m === 'D' ? -1 : 1, kA = s > 0 ? 'D' : 'G', kT = s > 0 ? 'G' : 'D';
      p = { bassin: { pos: V(0, 0.44 + 0.47, 0), rot: qX(80) }, lombaires: 2, thorax: 2, cou: -28, bras: pareil(brasRepos()), jambes: {} };
      p.jambes[kA] = J(78, 4, 0, 96, 40); p.jambes[kT] = pied(c, s, { x: s * 0.24, z: 0.0, ouv: 12 });
      // Le genou d'appui posé sur le banc (l'autre jambe descend jusqu'au sol).
      { const info = c.poser(p); p.bassin.pos.y += 0.44 + 0.065 - info.genoux[kA].y; }
      const t0 = c.tronc(p);
      p.bras[kA] = { prise: V(-s * 0.1, 0.448, t0.epaules[kA].z + 0.06), pole: V(-s * 0.4, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
      fixe = poseFixe(MAT.banc(C, 0), V(-s * 0.1, 0, 0.55)); pendante = true; vue = { az: s > 0 ? 62 : -62, el: 10 };
    } else if (o.assis || o.machine) {
      // Assis : à la poulie basse, jambes devant, pieds calés ; à la machine, poitrine contre le coussin.
      if (o.machine) { p = assis(c, { h: H_SIEGE, zPieds: 0.32 }); const t0 = c.tronc(p); fixe = poseFixe(MAT.siege(C, H_SIEGE)).concat([pret(boite(0.3, 0.45, 0.07, 0, t0.epaules.G.y - 0.22, t0.epaules.G.z + 0.2, C.banc, 0))]); ancre = s => V(s * 0.2, t0.epaules.G.y - (o.haut ? -0.5 : 0.25), t0.epaules.G.z + 0.95); }
      else {
        // Les pieds à plat sur les repose-pieds (inclinés, devant le banc), genoux un peu pliés.
        const zRp = 0.76, yRp = 0.36, pente = rad(62), nPl = V(0, Math.cos(pente), -Math.sin(pente)), dPl = V(0, Math.sin(pente), Math.cos(pente));
        const jb = {};
        for (const [k, s] of COTES) jb[k] = { cheville: V(s * 0.13, yRp - 0.05, zRp).add(nPl.clone().multiplyScalar(L.chevilleH + 0.012)), pole: V(s * 0.25, 1, 0.1), pied: dPl.clone(), hautPied: nPl.clone() };
        p = assis(c, { h: 0.42, penche: -2 }); p.jambes = jb;
        const t0 = c.tronc(p), zTour = t0.epaules.G.z + 1.62; ancre = () => V(0, o.haut ? 1.9 : 0.66, zTour);
        fixe = poseFixe(MAT.banc(C, 0, 0.42, 0.62, 0.34), V(0, 0, 0.12)).concat(poseFixe(MAT.reposePieds(C, yRp, zRp, 62, 0.4, zTour - 0.1)));
      }
      vue = { az: 70, el: 10 };
    } else if (o.debout) {
      p = debout(c, { penche: 14, dy: -0.08, dz: -0.02, cou: -6 }); p.jambes.G = pied(c, 1, { z: 0.24 }); p.jambes.D = pied(c, -1, { z: -0.26, pointe: 18 });
      ancre = () => V(0, o.haut ? 1.95 : o.bas ? 0.2 : 1.1, 1.5); vue = { az: 70, el: 8 };
    } else if (o.genoux || o.demigenou) { p = o.genoux ? aGenoux(c, { penche: 6 }) : demiGenou(c, { penche: 6 }); ancre = () => V(0, o.haut ? 2.0 : 1.0, 1.5); vue = { az: 70, el: 8 }; }
    else {
      const a = o.pendlay ? 82 : o.yates ? 40 : o.penche && o.penche !== true ? o.penche : o.tbar || o.landmine ? 52 : 66;   // barre en T : le buste moins couché
      p = debout(c, { dy: -0.07 - a * 0.0016, dz: -0.08 - a * 0.0028, penche: a, lomb: 2, thor: 2, cou: -a * 0.42, ecart: o.gorille ? 0.3 : 0.17, ouv: 12 });
      // Buste penché, on tient sur ses pieds : genoux souples, et les hanches reculent juste ce qu'il faut pour que le
      // centre de gravité reste au milieu du pied.
      tenirDebout(c, p, o.pendlay ? 24 : 30, p.jambes.G.cheville.z + 0.065, o.poulie || o.elas ? 0 : 0.4, 0.02);   // la charge pend sous les épaules
      pendante = true; ancre = () => V(0, 0.15, 1.2);
    }
    const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const portee = (L.bras + L.prise) * 0.985;
    // Arrivée : au bas des côtes (coudes au corps), à la poitrine (coudes écartés) ou à la hanche.
    const e = o.large ? 0.34 : o.serre || o.landmine || o.tbar ? 0.1 : 0.21;
    const fin = s => (o.haut && !o.assis && !o.debout && !o.genoux && !o.demigenou && !o.machine ? V(s * Math.max(e, 0.3), -0.13, 0.14) : o.hanche ? V(s * e, -0.44, 0.07) : V(s * Math.max(e, 0.19), -0.33, 0.11));
    const paume = s => (o.neutre || o.landmine || o.tbar || o.corde ? V(-s, 0, 0) : o.sup ? V(0, 1, 0) : V(0, -1, 0));
    const depart = (k, s) => {
      if (pendante && !(o.poulie || o.elas)) {
        // Bras pendant à la verticale sous l'épaule (poids libre).
        const yBas = o.gorille || o.pendlay ? 0.24 : null;
        const pt = t.epaules[k].clone().add(V(s * (e - 0.165) * 0.6, -portee, 0.02));
        if (yBas != null) pt.y = Math.max(pt.y, yBas);
        return pt;
      }
      const a = ancre(s), ep = t.epaules[k].clone().add(dT(s * (e - 0.165) * 0.6, 0, 0)), vers = unite(a.clone().sub(ep));
      const a_ = x => ep.clone().add(vers.clone().multiplyScalar(x));
      if (o.haut) {
        // Vers une poulie haute, le bras monte et l'épaule avec lui : la portée se règle sur le corps posé (bras tendu).
        const essai = cloner(p), x = coudeTendu(c, x => { essai.bras[k] = { prise: a_(x), pole: dT(s, 0.2, -1), paume: dT(...paume(s).xyz()), doigts: 'barre' }; return essai; }, portee - 0.06, portee + 0.25, 12, [k]);
        if (x != null) return a_(x);
      }
      return a_(portee);
    };
    const bras = fn => { const r = {}; for (const [k, s] of COTES) r[k] = { prise: fn(k, s), pole: dT(s * (o.haut ? 1 : 0.5), 0.2, -1), paume: dT(...paume(s).xyz()), doigts: 'barre' }; return r; };
    const autre = m !== 'GD' && !o.appui ? (pendante ? { prise: t.hanches[m === 'G' ? 'D' : 'G'].clone().add(V((m === 'G' ? -1 : 1) * 0.06, -0.12, 0.3)), pole: V(m === 'G' ? -1 : 1, 0.3, -0.4), paume: V(0, -1, 0), dirMain: V(0, -0.2, 1), doigts: 'detendu' } : null) : (o.appui ? p.bras[m === 'D' ? 'G' : 'D'] : null);
    const d = parLesBras(p, bras(depart), bras((k, s) => t.duThorax(fin(s))), m, autre);
    // Le buste accompagne un peu (assis à la poulie : il part penché en avant et se redresse).
    if (o.assis && !o.machine) { d.a.bassin.rot = qX(10); d.a.lombaires = 8; d.b.bassin.rot = qX(-6); }
    let tenu;
    if (o.landmine || o.tbar) {
      // La barre est tenue par un bout, l'autre posé au sol derrière soi : ce que tiennent les mains décrit un arc autour
      // de ce pivot. Debout : une poignée en V passée sous la barre (mains serrées, paumes face à face), ou une seule
      // main sur la barre, qui passe alors à côté de la jambe. À plat ventre sur le banc : la barre passe sous le banc,
      // les mains tiennent deux poignées montées sur une traverse, de part et d'autre du coussin.
      const uni = m !== 'GD', sM = m === 'D' ? -1 : 1, couche = o.ventre != null || !!o.seal;
      const xB = uni ? sM * 0.3 : 0, sous = couche ? 0.12 : 0, R_DISQUE = couche ? 0.15 : 0.17, piv = V(xB, 0.05, -1.3);
      const milieu = q => (uni ? q.bras[m].prise.clone() : q.bras.G.prise.clone().add(q.bras.D.prise).multiplyScalar(0.5)).setX(xB);
      const ecart = uni ? 0 : couche ? Math.abs(d.b.bras.G.prise.x) : 0.065;
      const poserMains = (q, M) => { for (const [k, s] of COTES) if (!uni || k === m) q.bras[k].prise = M.clone().add(V(s * ecart, 0, 0)); };
      // La barre, son disque et ses poignées, pour des mains données (M : leur milieu ; G, D : chacune).
      const barre = (M, G, D, sortie) => {
        const b0 = M.clone().add(V(0, -sous, 0)), dir = unite(b0.clone().sub(piv));
        sortie.push(pret(seg(piv, b0.clone().addScaledVector(dir, 0.3), 0.025, C.metal, 1)));
        poserObjet([cyl(R_DISQUE, 0.05, 0, 0, 0, C.fonte, 0)], b0.clone().addScaledVector(dir, 0.2), arc(AY, dir), sortie);
        if (uni) return;
        const bout = (P, x) => P.clone().addScaledVector(dir, x);
        for (const P of [G, D]) sortie.push(pret(seg(bout(P, -0.06), bout(P, 0.06), 0.0135, C.metal, 1)));
        if (couche) { const tr = [b0.clone().setX(G.x), b0.clone().setX(D.x)]; sortie.push(pret(seg(tr[0], tr[1], 0.016, C.metal, 1)), pret(seg(tr[0], bout(G, -0.06), 0.014, C.metal, 1)), pret(seg(tr[1], bout(D, -0.06), 0.014, C.metal, 1))); }
        else for (const x of [-0.06, 0.06]) sortie.push(pret(seg(bout(G, x), bout(D, x), 0.011, C.metal, 1)));
      };
      const M0 = milieu(d.a), R = M0.distanceTo(piv);
      let M1 = piv.clone().addScaledVector(unite(milieu(d.b).sub(piv)), R);
      poserMains(d.a, M0);
      // En haut, le disque s'arrête contre le buste : les mains montent jusque-là, pas plus.
      for (let i = 0; i < 24; i++) {
        poserMains(d.b, M1);
        const info = c.poser(d.b), F = [], G = uni ? M1 : info.prises.G, D = uni ? M1 : info.prises.D;
        barre(uni ? info.prises[m].clone().setX(xB) : G.clone().add(D).multiplyScalar(0.5), G, D, F);
        let dedans = 0;
        c.peauPosee(['thorax', 'abdomen', 'bassin', 'cuisse', 'tete', 'cou'], (x, y, z) => { for (const f of F) { const e = -distanceForme(f, x, y, z); if (e > dedans) dedans = e; } });
        if (dedans <= 0.004) break;
        M1 = piv.clone().addScaledVector(unite(M1.clone().add(V(0, -Math.max(0.01, dedans * 0.7), 0)).sub(piv)), R);
      }
      if (couche) {
        // Machine : du banc on ne garde que le coussin, porté par deux montants de chaque côté — la barre, sa traverse
        // et son disque passent dessous, au milieu.
        const cous = fixe.filter(x => x.appui)[0];
        if (cous) {
          const qC = new Quat(cous.q[0], cous.q[1], cous.q[2], cous.q[3]), cp = V(cous.p[0], cous.p[1], cous.p[2]), long = AZ.clone().applyQuaternion(qC), X = 0.3;
          if (long.y < 0) long.multiplyScalar(-1);
          fixe = [cous];
          for (const sx of [1, -1]) {
            fixe.push(pret(seg(V(sx * X, 0.03, -0.05), V(sx * X, 0.03, 0.6), 0.025, C.cadre, 0.5)));
            for (const x of [-0.2, 0.14]) { const a = cp.clone().addScaledVector(long, x); fixe.push(pret(seg(V(sx * X, 0.03, a.z), V(sx * X, a.y, a.z), 0.025, C.cadre, 0.5)), pret(seg(V(sx * X, a.y, a.z), V(sx * 0.14, a.y, a.z), 0.022, C.cadre, 0.5))); }
          }
          for (const z of [-0.05, 0.6]) fixe.push(pret(seg(V(-X, 0.03, z), V(X, 0.03, z), 0.025, C.cadre, 0.5)));
        }
      }
      fixe = fixe.concat([pret(boite(0.2, 0.08, 0.2, piv.x, 0.04, piv.z, C.cadre, 0.5))]);
      d.objets = (info, u, sortie) => { const G = info.prises.G, D = info.prises.D; barre(uni ? info.prises[m].clone() : G.clone().add(D).multiplyScalar(0.5), G, D, sortie); };
      tenu = [];
    } else {
      const r = { ancre: s => ancre(s), bout: o.poulie && m === 'GD' ? (o.corde ? 'corde' : 'barre') : null, lCable: o.large ? 1.0 : 0.6, deElas: s => ancre(s), disques: o.pendlay ? 0.225 : 0.2 };
      tenu = o.smith ? [{ t: 'barre', l: 1.6, d: 0.18 }] : tenuDe(o, m, r);
      if (o.poulie && ancre) poserObjet(MAT.colonne(C, ancre(1)), V(), null, fixe);
      if (o.smith) fixe = fixe.concat(poseFixe(MAT.smith(C, depart('G', 1).z)));
    }
    Object.assign(d, { fixe, vue, tenu }, rythmeDe(o));
    // À la machine, poitrine contre le coussin : les poignées au bout de bras qui pendent du haut de la machine, devant.
    if (o.machine && !(o.landmine || o.tbar)) {
      // (Rowing haut : les coudes partent sur les côtés, un peu en bas et en arrière, du début à la fin — le côté que leur
      // donnait la famille, presque dans l'axe du bras quand la main passe sous l'épaule, les faisait basculer.)
      const M = surMachine(c, C, d, { pivot: 'haut', rayon: o.haut ? 0.95 : 0.85, ecart: o.haut ? 0.56 : 0.3, poste: { h: H_SIEGE, poitrine: true }, cotes: m === 'GD' ? ['G', 'D'] : [m],
        pole: o.haut ? (k => V(k === 'G' ? 1 : -1, -0.25, -0.35)) : null });
      batiBras(C, d, M, { devant: true, zAvant: -0.25 });
    }
    return d;
  };

  /* Tirages verticaux à la poulie haute : la barre descend à la poitrine (ou derrière la nuque).
     Postures : assis (défaut, cuisses calées), genoux, demigenou, debout penché (elas). tendus : tirage bras tendus,
     debout. Prise : large, serre (neutre), sup, neutre. Matériel : poulie (défaut), machine, elas. Côtés : uni. */
  FAM.tirage = (c, o, C) => {
    const L = c.L, m = coteDe(o);
    if (!(o.machine || o.elas)) o.poulie = true;
    let p, fixe = [], vue = { az: 150, el: 8 }, poste = false;
    if (o.tendus) {
      // Debout face à la poulie haute, buste un peu penché : les bras tendus descendent jusqu'aux cuisses.
      p = debout(c, { penche: 22, dy: -0.05, dz: -0.06, lomb: 2, cou: -12, ecart: 0.13 });
      const anc = V(0, 2.05, 0.75), a = B(0, 132, -8, 12, 180), b = B(0, 14, -8, 10, 180);
      if (o.corde) { a.pron = 90; b.pron = 90; }
      fixe = poseFixe(MAT.colonne(C, anc));
      return Object.assign(parLesBras(p, a, b, m), { fixe, vue: { az: 62, el: 8 }, tenu: tenuDe(o, m, { ancre: () => anc, bout: m === 'GD' ? (o.corde ? 'corde' : 'barre') : null, lCable: 0.7, deElas: () => anc }) });
    }
    if (o.genoux) p = aGenoux(c, {}); else if (o.demigenou) p = demiGenou(c, {});
    else if (o.debout) { p = debout(c, { penche: 30, dy: -0.08, dz: -0.1, cou: -15 }); }
    else { p = assis(c, { h: H_SIEGE, zPieds: 0.3 }); poste = true; }
    const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const e = o.large ? 0.43 : o.serre ? 0.1 : o.sup ? 0.19 : 0.3, portee = (L.bras + L.prise) * 0.97;
    const anc = V(0, t.epaules.G.y + 1.0, t.epaules.G.z + (o.demigenou ? 0.5 : o.genoux ? 0.23 : 0.14));   // à genoux : la tour reste devant les genoux (et devant le pied avancé)
    const paume = s => (o.neutre || o.serre || m !== 'GD' ? V(-s, 0, 0) : o.sup ? V(0, 0, -1) : V(0, 0, 1));
    const basP = s => (o.nuque ? V(s * 0.42, 0.03, -0.1) : V(s * Math.max(e, 0.17), -0.1, 0.16));   // devant le haut de la poitrine (l'origine est entre les deux épaules)
    // Une poignée au bout du câble (prise neutre, serrée, à une main) tourne avec la main : le poignet reste droit.
    const libre = o.neutre || o.serre || m !== 'GD';
    const bras = f => { const r = {}; for (const [k, s] of COTES) { r[k] = { prise: t.duThorax(f(s)), pole: dT(s * 1, -0.5, o.sup || o.serre ? 0.5 : -0.25), paume: dT(...paume(s).xyz()), dirMain: dT(0, 1, 0), doigts: 'barre' }; if (libre) r[k].autour = 'libre'; } return r; };
    // En haut, les bras sont tendus vers la barre : la hauteur des mains se règle sur le corps posé (l'épaule monte avec le
    // bras ; comptée depuis l'épaule au repos, elle laissait les coudes pliés à 64°).
    const estime = (() => { const dx = e - 0.165; return Math.sqrt(Math.max(0.01, portee * portee - dx * dx - 0.014)); })();
    const yHaut = coudeTendu(c, y => Object.assign(cloner(p), { bras: bras(s => V(s * e, y, 0.12)) }), estime - 0.05, estime + 0.3, 12);
    const hautP = s => V(s * e, yHaut != null ? yHaut : estime, 0.12);
    const d = parLesBras(p, bras(hautP), bras(basP), m);
    // Le buste part un peu en arrière en tirant.
    if (!o.nuque) { d.b.lombaires = -9; d.b.thorax = -5; }
    const r = { ancre: () => anc, bout: m === 'GD' ? 'barre' : null, lCable: o.large ? 1.15 : o.serre ? 0.3 : 0.8, deElas: () => anc };
    // Assis : le poste de tirage (bâti, potence, assise, boudins) ; sinon une tour de poulie haute devant soi.
    if (poste) fixe = fixe.concat(poseFixe(o.poulie ? MAT.tirageHaut(C, anc, H_SIEGE, 0) : MAT.siege(C, H_SIEGE)));
    else if (o.poulie) fixe = fixe.concat(poseFixe(MAT.colonne(C, anc, V(0, 0, anc.z + 0.3))));
    Object.assign(d, { fixe, vue, tenu: tenuDe(o, m, r) });
    // À la machine : les poignées au bout de bras dont les paliers sont derrière la tête ; les cuisses calées.
    if (o.machine && poste) {
      const M = surMachine(c, C, d, { pivot: 'arriere', rayon: 0.85, ecart: 0.33, cotes: m === 'GD' ? ['G', 'D'] : [m] });
      d.fixe.push(...poseFixe(posteCuisses(c, C, d.cles[0][1], H_SIEGE)));
      batiBras(C, d, M, { zAvant: 0.45 });
    }
    return d;
  };

  /* Tractions et suspensions à la barre fixe (ou aux anneaux) : les mains ne bougent pas, le corps monte.
     Prise : (pronation), sup, neutre ; large, serre ; nuque. Variantes : leste, elastique (assistée), machine
     (assistée, genoux sur un plateau), negative (descente lente), anneaux, scapulaire (bras tendus, seules les
     épaules travaillent), pendu (suspension tenue), autour (le menton passe d'un côté puis de l'autre). */
  FAM.traction = (c, o, C) => {
    const L = c.L, H = 2.42, ecart = o.large ? 0.46 : o.serre ? 0.14 : o.sup ? 0.22 : o.neutre ? 0.27 : 0.33;
    let yPendu = null;
    const base = u => {
      const p = { bassin: { pos: L.racine.clone(), rot: qX(lerp(0, o.nuque ? 6 : -10, u)) }, lombaires: lerp(0, o.nuque ? 0 : -6, u), thorax: lerp(0, o.nuque ? 4 : -6, u), cou: lerp(-4, o.nuque ? -24 : 14, u), jambes: {}, bras: {} };
      let t = c.tronc(p);
      // Épaules à une longueur de bras sous la barre, puis menton au-dessus ; le corps recule : la barre passe devant.
      const dx = ecart - t.epaules.G.x, pendu = Math.sqrt(Math.max(0.01, Math.pow((L.bras + L.prise) * 0.96, 2) - dx * dx));
      // Prise serrée : les mains sont presque à l'aplomb des épaules, le coude est au bout de sa course un peu plus tôt —
      // on monte moins haut, la barre devant le haut de la poitrine. Prise neutre : le visage monte entre les poignées,
      // la poitrine vient à leur hauteur (épaules 12 cm dessous), sans reculer derrière elles.
      const yEp = lerp(yPendu != null ? yPendu : H - pendu, H - (o.nuque ? 0.1 : o.serre ? 0.225 : o.neutre ? 0.12 : 0.17), u);
      p.bassin.pos.y += yEp - t.epaules.G.y; p.bassin.pos.z += lerp(0.02, o.nuque ? 0.12 : o.serre ? -0.14 : o.neutre ? -0.05 : -0.1, u) - t.epaules.G.z;
      for (const [k, s] of COTES) {
        p.jambes[k] = o.machine ? J(8, 3, 0, 96, 30) : J(lerp(6, 14, u), 2, 0, o.leste ? 20 : 62, 30);
        // Le coude : sur le côté en pronation ; devant le corps en prise serrée ; un peu en avant en supination. En prise
        // neutre (poignées parallèles, paumes face à face), il descend devant le buste et le long des côtes au lieu de
        // s'ouvrir sur les côtés (le dos faisait des « ailes ») : le poignet s'incline un peu plus autour de la poignée.
        p.bras[k] = { prise: V(s * ecart, H, 0.02), pole: o.neutre ? V(s * 0.3, -0.7, 0.65) : o.serre ? V(s * 0.35, -0.6, 0.8) : V(s * 1, -0.2, o.sup ? 0.5 : -0.25), ...(o.neutre ? { aplomb: 30 } : {}), paume: o.neutre ? V(-s, 0, 0) : o.sup ? V(0, 0, -1) : V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'barre' };
        if (o.scapulaire) p.bras[k].hausse = lerp(22, -6, u * 8);
      }
      // La barre est fixe : les mains tombent juste dessus (une main en pronation arrive sinon 2 à 3 cm à côté).
      if (!o.anneaux) viser(c, p, { G: V(ecart, H, 0.02), D: V(-ecart, H, 0.02) });
      return p;
    };
    // Pendu, les bras sont tendus : la hauteur des épaules se règle une fois sur le corps posé (elles montent avec les bras).
    { const p0 = base(0); tendre(c, p0, V(0, -1, 0), null, null, o.anneaux ? null : { G: V(ecart, H, 0.02), D: V(-ecart, H, 0.02) }); yPendu = c.tronc(p0).epaules.G.y; }
    const amp = o.scapulaire ? 0.1 : 1;
    // Prise neutre : deux poignées parallèles, la barre du portique derrière la tête.
    const fixe = o.anneaux ? [] : o.neutre ? poseFixe(MAT.barreFixe(C, H, 1.3), V(0, 0, -0.36)).concat(poseFixe(MAT.poigneesNeutres(C, H, ecart)))
      : poseFixe(MAT.barreFixe(C, H, Math.max(1.3, 2 * ecart + 0.4)));
    const d = { vue: { az: o.sup ? 150 : 205, el: 4 }, fixe, tenu: [] };
    if (o.pendu) { d.a = base(0); d.b = base(0.03); d.rythme = 'tenue'; }
    else if (o.autour) {
      // Le corps passe d'un côté de la barre à l'autre, mains fixes : seize poses réglées d'avance sur le tour (mains
      // remises sur la barre une fois le corps déporté), et le mouvement passe de l'une à l'autre.
      const tour = ph => { const w = ph * 2 * Math.PI, u = 0.55 + 0.4 * Math.sin(w - Math.PI / 2) * 0.5 + 0.2, p = base(Math.min(1, u)); p.bassin.pos.x += 0.16 * Math.cos(w); p.bassin.rot = p.bassin.rot.clone().multiply(qZ(-8 * Math.cos(w))); for (const [k, s] of COTES) p.bras[k].prise = V(s * ecart, H, 0.02); if (!o.anneaux) viser(c, p, { G: V(ecart, H, 0.02), D: V(-ecart, H, 0.02) }); return p; };
      const N = 16, table = []; for (let i = 0; i <= N; i++) table.push([i / N, tour(i / N)]);
      d.rythme = 'continu'; d.periode = 3.4; d.pose = ph => chemin(table, ph);
    }
    else { d.a = base(0); d.b = base(amp); d.cles = [[0, d.a], [0.25, base(0.25 * amp)], [0.5, base(0.5 * amp)], [0.75, base(0.75 * amp)], [1, d.b]]; }   // cinq poses : entre deux, les mains restent sur la barre à moins de 5 mm
    if (o.negative) { const Z = d.b, monter = v => chemin(d.cles, v); d.rythme = 'continu'; d.periode = 5; d.pose = ph => (ph < 0.12 ? monter(lisse(ph / 0.12)) : ph < 0.2 ? Z : monter(1 - lisse((ph - 0.2) / 0.7))); }
    if (o.anneaux) { d.tenu = [{ t: 'sangle', de: s => V(s * ecart, H + 1.0, 0.02), m: 'G' }]; d.tenu = [{ t: 'sangle', de: V(ecart, H + 1.1, 0.02), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, H + 1.1, 0.02), m: 'D', bout: 'anneau' }]; }
    if (o.leste) {
      // Le disque pend à la ceinture par une chaîne, à plat devant les cuisses : sa distance au bassin se mesure sur
      // le corps posé, en bas et en haut de la traction.
      const R = 0.16, bas = 0.36, devant = u => { const p = base(u), b = c.poser(p).bassin, z = c.devantJambes(p, b.y - bas - 0.7 * R, b.y - bas + 0.7 * R, ['cuisse']); return z - b.z + 0.026; };
      const z0 = devant(0), z1 = devant(amp);
      d.objets = (info, u, sortie) => {
        const b = info.bassin, z = b.z + lerp(z0, z1, u), ventre = V(b.x, b.y - 0.02, b.z + L.ventre + 0.004);
        sortie.push(pret(cyl(R, 0.036, b.x, b.y - bas, z, C.fonte, 0.05, qX(90)))); sortie.push(pret(cyl(0.03, 0.04, b.x, b.y - bas, z, C.metal, 0.8, qX(90))));
        sortie.push(pret(seg(ventre, V(b.x, b.y - bas + 0.02, z + 0.022), 0.005, C.cadre, 0.6))); sortie.push(pret(seg(ventre, V(b.x, b.y - bas + 0.02, z - 0.022), 0.005, C.cadre, 0.6)));
      };
    }
    if (o.elastique) d.objets = (info, u, sortie) => { const pi = info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5); sortie.push(pret(seg(V(0, H, 0.02), pi, 0.008, C.elastique, 0))); };
    if (o.machine) machineAssistance(c, C, d, { hBarre: H, cote: 1 });   // machine à tractions assistées : genoux sur le plateau
    return d;
  };

  /* Exercices corps incliné, pieds au sol, mains sur une barre basse, des anneaux ou des sangles.
     row (traction australienne : visage vers le haut, la poitrine monte aux mains) ; curl ; triceps (visage vers le
     bas, les coudes plient, la tête descend entre les mains) ; ecarte ; facepull ; pompe. Matériel : barre (défaut
     pour row), anneaux, sangles. Prise : sup, serre. */
  FAM.suspension = (c, o, C) => {
    // Sorte par défaut, admise dans l'écriture : o.row (traction australienne).
    const sorte = o.curl ? 'curl' : o.triceps ? 'triceps' : o.ecarte ? 'ecarte' : o.facepull ? 'facepull' : 'row';
    const haut = sorte === 'row' || sorte === 'curl' || sorte === 'facepull';
    const barre = !(o.anneaux || o.sangles);
    // Deux inclinaisons du corps et deux positions de bras ; les mains restent sur leurs poignées.
    const K = { row: [barre ? 16 : 40, barre ? 34 : 60], curl: [48, 66], facepull: [52, 66], triceps: [58, 40], ecarte: [58, 38] }[sorte];
    const bras = { row: [B(6, 88, 0, 8, o.sup ? 0 : barre ? 180 : 90), B(o.large ? 70 : 20, o.large ? 70 : -22, 0, o.large ? 100 : 118, o.sup ? 0 : barre ? 180 : 90)], curl: [B(4, 84, 0, 10, 0), B(4, 96, 0, 132, 0)], facepull: [B(6, 90, -10, 8, 180), B(86, 90, 78, 104, 150)], triceps: [B(2, 118, 0, 8, 180), B(2, 126, 0, 122, 180)], ecarte: [B(6, 84, -84, 14, 0), B(98, 84, 8, 22, 0)] }[sorte];
    const faire = n => { const p = corpsDroit(c, { angle: K[n], face: haut ? 'haut' : 'bas', zPieds: haut ? 0.6 : -0.9, cou: haut ? 4 : -14 }); p.bras = pareil(bras[n]); return p; };
    const a = faire(0), b = faire(1);
    const d = { a, b, vue: { az: haut ? 118 : 70, el: 10 }, fixe: [], tenu: [] };
    // Le matériel est placé d'après les mains de la pose de départ.
    const info = c.poser(a), mid = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5);
    if (barre) {
      // Sur une barre fixe, les mains ne bougent pas : le corps, d'un bloc, pivote sur ses pieds et les bras plient de
      // ce qu'il faut. La pose par angles ne sert plus qu'à dire de quel côté va le coude et comment tourne la paume.
      d.fixe = poseFixe(MAT.barreFixe(C, mid.y, 1.3), V(0, 0, mid.z)); d.tenu = [];
      const mains = { G: info.prises.G.clone().setY(mid.y).setZ(mid.z), D: info.prises.D.clone().setY(mid.y).setZ(mid.z) };
      d.pose = u => {
        const p = mel(a, b, u), i = c.poser(p);
        // La main tourne autour de la barre avec l'avant-bras (autour) : la paume des angles dit seulement de quel côté.
        for (const [k] of COTES) p.bras[k] = { prise: mains[k], pole: poleDe(i, k), paume: perp(i.paumes[k], AX).normalize(), dirMain: perp(i.dirMains[k], AX).normalize(), autour: AX, doigts: 'barre' };
        return p;
      };
    }
    else { const anc = V(0, 2.5, mid.z + (haut ? 0.25 : -0.25)); const bout = o.anneaux ? 'anneau' : 'poignee'; d.tenu = [{ t: 'sangle', de: anc.clone().add(V(o.anneaux ? 0.2 : 0, 0, 0)), m: 'G', bout }, { t: 'sangle', de: anc.clone().add(V(o.anneaux ? -0.2 : 0, 0, 0)), m: 'D', bout }]; }
    return d;
  };
