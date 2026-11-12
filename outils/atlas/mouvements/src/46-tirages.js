
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
    else if (o.ventre != null) { const a = o.ventre === true ? 40 : o.ventre; p = aPlatVentre(c, { h: 0.44, angle: a, d: 0.3 }); fixe = poseFixe(MAT.banc(C, a), V(), qY(180)); pendante = true; vue = { az: 56, el: 10 }; }
    else if (o.tabouret) {
      // Assis au bout d'un banc, le buste penché sur les cuisses : les haltères pendent le long des jambes.
      p = assis(c, { h: 0.45, penche: 58 }); p.cou = -24; fixe = poseFixe(MAT.banc(C, 0), V(0, 0, 0.28)); pendante = true; vue = { az: 58, el: 10 };
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
      if (o.machine) { p = assis(c, { h: 0.5, zPieds: 0.32 }); const t0 = c.tronc(p); fixe = poseFixe(MAT.siege(C, 0.5)).concat([pret(boite(0.3, 0.45, 0.07, 0, t0.epaules.G.y - 0.22, t0.epaules.G.z + 0.2, C.banc, 0))]); ancre = s => V(s * 0.2, t0.epaules.G.y - (o.haut ? -0.5 : 0.25), t0.epaules.G.z + 0.95); }
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
      const a = o.pendlay ? 82 : o.yates ? 40 : o.penche && o.penche !== true ? o.penche : 66;
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
      const a = ancre(s), ep = t.epaules[k].clone().add(dT(s * (e - 0.165) * 0.6, 0, 0));
      return ep.add(unite(a.clone().sub(ep)).multiplyScalar(portee));
    };
    const bras = fn => { const r = {}; for (const [k, s] of COTES) r[k] = { prise: fn(k, s), pole: dT(s * (o.haut ? 1 : 0.5), 0.2, -1), paume: dT(...paume(s).xyz()), doigts: 'barre' }; return r; };
    const autre = m !== 'GD' && !o.appui ? (pendante ? { prise: t.hanches[m === 'G' ? 'D' : 'G'].clone().add(V((m === 'G' ? -1 : 1) * 0.06, -0.12, 0.3)), pole: V(m === 'G' ? -1 : 1, 0.3, -0.4), paume: V(0, -1, 0), dirMain: V(0, -0.2, 1), doigts: 'detendu' } : null) : (o.appui ? p.bras[m === 'D' ? 'G' : 'D'] : null);
    const d = parLesBras(p, bras(depart), bras((k, s) => t.duThorax(fin(s))), m, autre);
    // Le buste accompagne un peu (assis à la poulie : il part penché en avant et se redresse).
    if (o.assis && !o.machine) { d.a.bassin.rot = qX(10); d.a.lombaires = 8; d.b.bassin.rot = qX(-6); }
    let tenu;
    if (o.landmine || o.tbar) {
      const pivot = V(0, 0.05, t.epaules.G.z - 1.35 + (pendante ? 0 : 0));
      const piv = V(0, 0.05, -1.3);
      fixe = fixe.concat([pret(boite(0.2, 0.08, 0.2, 0, 0.04, piv.z, C.cadre, 0.5))]);
      d.objets = (info, u, sortie) => { const pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[m], dir = unite(pr.clone().sub(piv)); sortie.push(pret(seg(piv, pr.clone().add(dir.clone().multiplyScalar(0.3)), 0.025, C.metal, 1))); const f = cyl(0.2, 0.05, 0, 0, 0, C.fonte, 0), pp = pr.clone().add(dir.clone().multiplyScalar(0.2)), q = arc(AY, dir); sortie.push({ forme: 'cylindre', s: f.s, p: [pp.x, pp.y, pp.z], q: [q.x, q.y, q.z, q.w], couleur: f.couleur, metal: 0 }); };
      tenu = [];
    } else {
      const r = { ancre: s => ancre(s), bout: o.poulie && m === 'GD' ? (o.corde ? 'corde' : 'barre') : null, lCable: o.large ? 1.0 : 0.6, deElas: s => ancre(s), pivot: s => ancre(s).add(V(0, 0.3, 0)), disques: o.pendlay ? 0.225 : 0.2 };
      tenu = o.smith ? [{ t: 'barre', l: 1.6, d: 0.18 }] : tenuDe(o, m, r);
      if (o.poulie && ancre) poserObjet(MAT.colonne(C, ancre(1)), V(), null, fixe);
      if (o.smith) fixe = fixe.concat(poseFixe(MAT.smith(C, depart('G', 1).z)));
    }
    return Object.assign(d, { fixe, vue, tenu }, rythmeDe(o));
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
    else { p = assis(c, { h: 0.5, zPieds: 0.3 }); poste = true; }
    const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const e = o.large ? 0.43 : o.serre ? 0.1 : o.sup ? 0.19 : 0.3, portee = (L.bras + L.prise) * 0.97;
    const anc = V(0, t.epaules.G.y + 1.0, t.epaules.G.z + 0.14);
    const paume = s => (o.neutre || o.serre || m !== 'GD' ? V(-s, 0, 0) : o.sup ? V(0, 0, -1) : V(0, 0, 1));
    const hautP = s => { const dx = s * e - s * 0.165; return V(s * e, Math.sqrt(Math.max(0.01, portee * portee - dx * dx - 0.014)), 0.12); };
    const basP = s => (o.nuque ? V(s * 0.42, 0.03, -0.1) : V(s * Math.max(e, 0.17), -0.03, 0.17));
    const bras = f => { const r = {}; for (const [k, s] of COTES) r[k] = { prise: t.duThorax(f(s)), pole: dT(s * 1, -0.5, o.sup || o.serre ? 0.5 : -0.25), paume: dT(...paume(s).xyz()), dirMain: dT(0, 1, 0), doigts: 'barre' }; return r; };
    const d = parLesBras(p, bras(hautP), bras(basP), m);
    // Le buste part un peu en arrière en tirant.
    if (!o.nuque) { d.b.lombaires = -9; d.b.thorax = -5; }
    const r = { ancre: () => anc, bout: m === 'GD' ? 'barre' : null, lCable: o.large ? 1.15 : o.serre ? 0.3 : 0.8, deElas: () => anc, pivot: s => V(s * 0.3, anc.y, anc.z - 0.5) };
    // Assis : le poste de tirage (bâti, potence, assise, boudins) ; sinon une tour de poulie haute devant soi.
    if (poste) fixe = fixe.concat(poseFixe(o.poulie || o.machine ? MAT.tirageHaut(C, anc, 0.5, 0) : MAT.siege(C, 0.5)));
    else if (o.poulie) fixe = fixe.concat(poseFixe(MAT.colonne(C, anc, V(0, 0, anc.z + 0.3))));
    return Object.assign(d, { fixe, vue, tenu: tenuDe(o, m, r) });
  };

  /* Tractions et suspensions à la barre fixe (ou aux anneaux) : les mains ne bougent pas, le corps monte.
     Prise : (pronation), sup, neutre ; large, serre ; nuque. Variantes : leste, elastique (assistée), machine
     (assistée, genoux sur un plateau), negative (descente lente), anneaux, scapulaire (bras tendus, seules les
     épaules travaillent), pendu (suspension tenue), autour (le menton passe d'un côté puis de l'autre). */
  FAM.traction = (c, o, C) => {
    const L = c.L, H = 2.42, ecart = o.large ? 0.46 : o.serre ? 0.14 : o.sup ? 0.22 : 0.33;
    const base = u => {
      const p = { bassin: { pos: L.racine.clone(), rot: qX(lerp(0, o.nuque ? 6 : -10, u)) }, lombaires: lerp(0, o.nuque ? 0 : -6, u), thorax: lerp(0, o.nuque ? 4 : -6, u), cou: lerp(-4, o.nuque ? -24 : 14, u), jambes: {}, bras: {} };
      let t = c.tronc(p);
      // Épaules à une longueur de bras sous la barre, puis menton au-dessus ; le corps recule : la barre passe devant.
      const dx = ecart - t.epaules.G.x, pendu = Math.sqrt(Math.max(0.01, Math.pow((L.bras + L.prise) * 0.96, 2) - dx * dx));
      const yEp = lerp(H - pendu, H - (o.nuque ? 0.1 : 0.17), u);
      p.bassin.pos.y += yEp - t.epaules.G.y; p.bassin.pos.z += lerp(0.02, o.nuque ? 0.12 : -0.1, u) - t.epaules.G.z;
      for (const [k, s] of COTES) {
        p.jambes[k] = o.machine ? J(8, 3, 0, 96, 30) : J(lerp(6, 14, u), 2, 0, o.leste ? 20 : 62, 30);
        p.bras[k] = { prise: V(s * ecart, H, 0.02), pole: V(s * 1, -0.2, o.sup || o.neutre ? 0.5 : -0.25), paume: o.neutre ? V(-s, 0, 0) : o.sup ? V(0, 0, -1) : V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'barre' };
        if (o.scapulaire) p.bras[k].hausse = lerp(22, -6, u * 8);
      }
      return p;
    };
    const amp = o.scapulaire ? 0.1 : 1;
    const d = { vue: { az: o.sup ? 150 : 205, el: 4 }, fixe: o.anneaux ? [] : poseFixe(MAT.barreFixe(C, H, Math.max(1.3, 2 * ecart + 0.4))), tenu: [] };
    if (o.pendu) { d.a = base(0); d.b = base(0.03); d.rythme = 'tenue'; }
    else if (o.autour) { d.rythme = 'continu'; d.periode = 3.4; d.pose = ph => { const w = ph * 2 * Math.PI, u = 0.55 + 0.4 * Math.sin(w - Math.PI / 2) * 0.5 + 0.2, p = base(Math.min(1, u)); p.bassin.pos.x += 0.16 * Math.cos(w); p.bassin.rot = p.bassin.rot.clone().multiply(qZ(-8 * Math.cos(w))); return p; }; }
    else { d.a = base(0); d.b = base(amp); d.cles = [[0, d.a], [0.5, base(0.5 * amp)], [1, d.b]]; }
    if (o.negative) { const A = d.a, Z = d.b; d.rythme = 'continu'; d.periode = 5; d.pose = ph => (ph < 0.12 ? mel(A, Z, lisse(ph / 0.12)) : ph < 0.2 ? Z : mel(Z, A, lisse((ph - 0.2) / 0.7))); }
    if (o.anneaux) { d.tenu = [{ t: 'sangle', de: s => V(s * ecart, H + 1.0, 0.02), m: 'G' }]; d.tenu = [{ t: 'sangle', de: V(ecart, H + 1.1, 0.02), m: 'G', bout: 'anneau' }, { t: 'sangle', de: V(-ecart, H + 1.1, 0.02), m: 'D', bout: 'anneau' }]; }
    if (o.leste) d.objets = (info, u, sortie) => { const b = info.bassin; sortie.push(pret(cyl(0.16, 0.04, b.x, b.y - 0.42, b.z + 0.04, C.fonte, 0, DEBOUT_Q))); sortie.push(pret(seg(V(b.x, b.y - 0.08, b.z + 0.08), V(b.x, b.y - 0.42, b.z + 0.04), 0.006, C.cadre, 0.6))); };
    if (o.elastique) d.objets = (info, u, sortie) => { const pi = info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5); sortie.push(pret(seg(V(0, H, 0.02), pi, 0.008, C.elastique, 0))); };
    if (o.machine) {
      // Machine à tractions assistées : une tour derrière soi, et un bras qui soutient le plateau où posent les genoux.
      const zT = -0.72;
      d.fixe = d.fixe.concat(poseFixe(horsCadre(deplacer(bati(C, 2.2, 0), V(0, 0, zT)))));
      d.objets = (info, u, sortie) => { const g = info.genoux.G.clone().add(info.genoux.D).multiplyScalar(0.5), pl = V(0, g.y - 0.09, g.z - 0.08); sortie.push(pret(coussin(0.46, 0.065, 0.3, pl.x, pl.y, pl.z, C))); sortie.push(pret(tube(V(0, 0.75, zT + 0.05), V(0, pl.y - 0.04, pl.z), 0.05, C.cadre))); };
      d.levee = (info, u) => 0.5 * (1 - u);
    }
    return d;
  };

  /* Exercices corps incliné, pieds au sol, mains sur une barre basse, des anneaux ou des sangles.
     row (traction australienne : visage vers le haut, la poitrine monte aux mains) ; curl ; triceps (visage vers le
     bas, les coudes plient, la tête descend entre les mains) ; ecarte ; facepull ; pompe. Matériel : barre (défaut
     pour row), anneaux, sangles. Prise : sup, serre. */
  FAM.suspension = (c, o, C) => {
    // Sorte par défaut, admise dans l'écriture : o.row (traction australienne).
    const L = c.L, sorte = o.curl ? 'curl' : o.triceps ? 'triceps' : o.ecarte ? 'ecarte' : o.facepull ? 'facepull' : 'row';
    const haut = sorte === 'row' || sorte === 'curl' || sorte === 'facepull';
    const barre = !(o.anneaux || o.sangles), Hb = barre ? (sorte === 'triceps' ? 0.85 : 0.95) : 2.4;
    // Deux inclinaisons du corps et deux positions de bras ; les mains restent sur leurs poignées.
    const K = { row: [barre ? 16 : 40, barre ? 34 : 60], curl: [48, 66], facepull: [52, 66], triceps: [58, 40], ecarte: [58, 38] }[sorte];
    const bras = { row: [B(6, 88, 0, 8, o.sup ? 0 : barre ? 180 : 90), B(o.large ? 70 : 20, o.large ? 70 : -22, 0, o.large ? 100 : 118, o.sup ? 0 : barre ? 180 : 90)], curl: [B(4, 84, 0, 10, 0), B(4, 96, 0, 132, 0)], facepull: [B(6, 90, -10, 8, 180), B(86, 90, 78, 104, 150)], triceps: [B(2, 118, 0, 8, 180), B(2, 126, 0, 122, 180)], ecarte: [B(6, 84, -84, 14, 0), B(98, 84, 8, 22, 0)] }[sorte];
    const faire = n => { const p = corpsDroit(c, { angle: K[n], face: haut ? 'haut' : 'bas', zPieds: haut ? 0.6 : -0.9, cou: haut ? 4 : -14 }); p.bras = pareil(bras[n]); return p; };
    const a = faire(0), b = faire(1);
    const d = { a, b, vue: { az: haut ? 118 : 70, el: 10 }, fixe: [], tenu: [] };
    // Le matériel est placé d'après les mains de la pose de départ.
    const info = c.poser(a), mid = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5);
    if (barre) { d.fixe = poseFixe(MAT.barreFixe(C, mid.y, 1.3), V(0, 0, mid.z)); d.tenu = []; }
    else { const anc = V(0, 2.5, mid.z + (haut ? 0.25 : -0.25)); const bout = o.anneaux ? 'anneau' : 'poignee'; d.tenu = [{ t: 'sangle', de: anc.clone().add(V(o.anneaux ? 0.2 : 0, 0, 0)), m: 'G', bout }, { t: 'sangle', de: anc.clone().add(V(o.anneaux ? -0.2 : 0, 0, 0)), m: 'D', bout }]; }
    // Les mains fixes : on recale le bassin de la pose d'arrivée pour que les mains restent où elles étaient.
    const info2 = c.poser(b), mid2 = info2.prises.G.clone().add(info2.prises.D).multiplyScalar(0.5);
    if (barre) { /* la barre impose la place des mains : on déplace le corps */ b.bassin.pos.add(mid.clone().sub(mid2).setX(0)); for (const k of ['G', 'D']) b.jambes[k].cheville.add(mid.clone().sub(mid2).setX(0).setY(0)); b.bassin.pos.y -= 0; }
    return d;
  };
