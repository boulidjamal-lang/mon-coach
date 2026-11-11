
  /* Développés : la main part de près de l'épaule et pousse jusqu'au bout du bras.
     (défaut) développé pour la poitrine, couché (plat, banc=<angle>, decline, sol), assis (machine, poulie ; avec
     incline ou decline, la poussée monte ou descend) ou debout
     (poulie) ; epaules : au-dessus de la tête, debout, assis, genoux ou demigenou.
     Matériel : barre, hal, kb, smith, machine, poulie, elas. Prise : serre, large, neutre. Côtés : uni, alt.
     Variantes : larsen (jambes en l'air), partiel (arrêt au-dessus de la poitrine), nuque, arnold, pousse (élan des
     jambes), landmine, svend (disque serré entre les paumes), autour (un bras, en travers du corps). */
  FAM.developpe = (c, o, C) => {
    const L = c.L, m = coteDe(o), haut = !!o.epaules;
    const libre = !(o.barre || o.smith || o.landmine || o.svend);       // mains indépendantes
    // Assis à la machine, incline et decline disent le sens de la poussée, pas l'inclinaison d'un banc.
    const montee = o.assis && o.machine ? (o.incline ? 28 : o.decline ? -22 : 0) : 0;
    if (montee) o.decline = false;
    if (!(o.barre || o.smith || o.kb || o.machine || o.poulie || o.elas || o.landmine || o.svend || o.pc)) o.hal = true;
    if (!haut && !o.assis && !o.debout && !o.sol && o.banc == null && !o.decline && !o.svend && !o.autour && !o.genoux && !o.demigenou) o.plat = true;
    if (o.debout) { o.plat = false; }
    if (o.larsen) o.jambes = J(12, 5, 0, 6, 25);
    const P = postureDe(c, o, C, { penche: haut || o.svend ? 0 : 4 });
    let p = P.p, fixe = P.fixe, vue = haut ? { az: 30, el: 8 } : P.vue;
    if (o.debout && !haut) { p.jambes.G = pied(c, 1, { z: 0.22 }); p.jambes.D = pied(c, -1, { z: -0.24, pointe: 22 }); p.bassin.rot = qX(6); vue = { az: 70, el: 8 }; }
    const t = c.tronc(p);
    const dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const portee = L.bras + L.prise - 0.035;
    const eBas = libre ? (o.serre ? 0.15 : 0.27) : (o.serre ? 0.17 : o.large ? 0.47 : 0.38), eHaut = libre ? (o.serre ? 0.12 : 0.18) : eBas;
    let bas, hautP, pole, dirMain, paumeA, paumeB;
    if (haut) {
      // Au-dessus de la tête : des clavicules (ou des épaules) jusqu'au bout des bras.
      bas = s => (o.nuque ? V(s * 0.42, -0.01, -0.105) : libre ? V(s * 0.3, -0.02, 0.03) : V(s * eBas * 0.82, -0.075, 0.135));
      hautP = s => (o.nuque ? V(s * 0.4, portee, -0.05) : V(s * (libre ? 0.2 : eBas * 0.82), portee, libre ? 0.0 : 0.02));
      pole = s => (o.nuque ? V(s * 1, -0.7, -0.1) : libre ? V(s * 1, -0.8, 0.25) : V(s * 0.7, -1, 0.5));
      dirMain = V(0, 1, 0); paumeA = paumeB = s => (o.neutre ? V(-s, 0, 0.1) : V(0, 0, 1));
      if (o.arnold) { paumeA = () => V(0, 0, -1); bas = s => V(s * 0.17, -0.07, 0.17); }
      if (o.landmine) { bas = s => V(s * (m === 'GD' ? 0.07 : 0.2), -0.1, 0.17); hautP = s => V(s * (m === 'GD' ? 0.06 : 0.17), 0.36, 0.44); dirMain = V(0, 0.75, 0.66); paumeA = paumeB = s => V(-s, 0, 0); pole = s => V(s * 0.6, -1, 0.1); }
    } else if (o.svend) {
      // Disque serré entre les deux paumes, poussé droit devant la poitrine.
      bas = s => V(s * 0.02, -0.12, 0.2); hautP = s => V(s * 0.02, -0.1, portee - 0.04); pole = s => V(s * 0.8, -0.7, -0.2); dirMain = V(0, 0.2, 1); paumeA = paumeB = s => V(-s, 0, 0);
    } else {
      const zBas = o.sol ? 0.2 : o.partiel ? 0.2 : 0.135;
      bas = s => V(s * eBas, o.banc > 20 ? -0.07 : -0.115, zBas + (libre ? 0.02 : 0));
      hautP = s => V(s * eHaut, o.banc > 20 ? 0.0 : -0.02, portee);
      pole = s => (o.serre ? V(s * 0.3, -0.6, -1) : V(s * 0.75, -0.35, -1));
      dirMain = V(0, 0, 1); paumeA = paumeB = s => (o.neutre || o.marteau ? V(-s, 0, 0) : V(0, -1, 0));
      // Assis à la machine, la poussée peut monter (incline) ou descendre (decline).
      if (montee) { const an = rad(montee); bas = s => V(s * eBas, montee > 0 ? -0.06 : -0.17, zBas + 0.02); hautP = s => V(s * eHaut, (montee > 0 ? -0.02 : -0.06) + portee * Math.sin(an) * 0.96, portee * Math.cos(an)); }
      if (o.autour) { bas = s => V(s * 0.3, -0.12, 0.12); hautP = s => V(-s * 0.1, -0.16, portee - 0.06); pole = s => V(s * 0.6, -0.8, -0.4); paumeA = paumeB = s => V(-s, 0, 0); vue = { az: 25, el: 8 }; }
    }
    const bras = (f, pa, doigts) => {
      const r = {};
      for (const [k, s] of COTES) r[k] = { prise: t.duThorax(f(s)), pole: dT(...pole(s).xyz()), paume: dT(...pa(s).xyz()).normalize(), dirMain: dT(dirMain.x, dirMain.y, dirMain.z), doigts: doigts || 'barre' };
      return r;
    };
    // Le mouvement va du haut (bras tendus, départ) au bas (barre à la poitrine), puis remonte.
    const autre = m !== 'GD' ? (haut ? { prise: t.hanches.D.clone().add(V(-0.085, 0.1, 0.03).applyQuaternion(t.qBassin)), pole: dT(-0.8, 0, -0.6), paume: dT(1, -0.2, 0), dirMain: dT(0.2, -0.3, 1), doigts: 'detendu' } : bras(hautP, paumeB).D) : null;
    const d = parLesBras(p, bras(hautP, paumeB), bras(bas, paumeA), m, autre);
    if (m !== 'GD' && !haut && !o.poulie) { d.a.bras.D = cloner(bras(hautP, paumeB).D); d.b.bras.D = cloner(bras(hautP, paumeB).D); if (o.hal || o.kb) { /* l'autre haltère reste en haut */ } }
    // Matériel.
    const r = { disques: haut ? 0.16 : 0.225, sensKb: 'avantbras' };
    let tenu;
    if (o.landmine) {
      const pivot = V(0, 0.05, t.epaules.G.z + 1.45);
      tenu = [{ t: 'levier', de: pivot, m: m === 'GD' ? 'G' : m, bout: 'rien' }];
      fixe = fixe.concat([pret(boite(0.2, 0.08, 0.2, pivot.x, 0.04, pivot.z, C.cadre, 0.5))]);
      d.objets = (info, u, sortie) => { const k = m === 'GD' ? 'G' : m, pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[k], dir = unite(pr.clone().sub(pivot)); sortie.push(pret(seg(pivot, pr.clone().add(dir.clone().multiplyScalar(0.12)), 0.025, C.metal, 1))); sortie.push(pret(cyl(0.15, 0.04, 0, 0, 0, C.fonte, 0))); const dq = sortie[sortie.length - 1], pp = pr.clone().sub(dir.clone().multiplyScalar(0.18)), q = arc(AY, dir); dq.p = [pp.x, pp.y, pp.z]; dq.q = [q.x, q.y, q.z, q.w]; };
      tenu = [];
    } else if (o.svend) tenu = [{ t: 'disque', m: 'GD', r: 0.14, axe: AX }];
    else if (o.smith) { tenu = [{ t: 'barre', l: 1.6, d: 0.18 }]; }
    else {
      const anc = haut ? (s => V(s * 0.35, 0.1, -0.05)) : P.sorte === 'dos' ? (s => V(s * 0.95, 0.2, t.epaules.G.z)) : (s => V(s * 0.45, t.epaules.G.y - 0.05, t.epaules.G.z - 0.95));
      r.ancre = anc; r.deElas = haut ? null : anc;
      if (o.machine) r.pivot = haut ? (s => V(s * 0.3, t.epaules.G.y + 0.45, t.epaules.G.z - 0.35)) : (s => V(s * 0.32, t.epaules.G.y + 0.55, t.epaules.G.z + 0.1));
      tenu = tenuDe(o, m === 'GD' ? 'GD' : (haut || o.poulie ? m : 'GD'), r);
      if (o.poulie) for (const s of m === 'GD' ? [1, -1] : [m === 'D' ? -1 : 1]) poserObjet(MAT.colonne(C, anc(s)), V(), null, fixe);
    }
    if (o.smith) {
      const zB = t.duThorax(hautP(1)).z;
      fixe = fixe.concat(poseFixe(MAT.smith(C, zB)));
    }
    // Barre retenue par des élastiques (développé couché avec bandes) : une bande de chaque main jusqu'au sol.
    if (o.barre && o.elas && !haut) { const zB = t.duThorax(hautP(1)).z; for (const k of ['G', 'D']) tenu.push({ t: 'elastique', de: V((k === 'G' ? 1 : -1) * 0.5, 0.03, zB), m: k, bout: 'rien' }); }
    Object.assign(d, { fixe, vue, tenu }, rythmeDe(o));
    if (o.pousse) {
      // Développé poussé : les genoux plient un peu puis les jambes lancent la barre. Départ en bas.
      const A = d.b, Z = d.a;
      d.pose = u => { const q = mel(A, Z, lisse(borne((u - 0.3) / 0.7, 0, 1))), dy = -0.09 * Math.sin(Math.PI * borne(u / 0.45, 0, 1)); q.bassin.pos.y += dy; q.bassin.pos.z -= 0.02 * Math.sin(Math.PI * borne(u / 0.45, 0, 1)); for (const k of ['G', 'D']) { if (u < 0.45) q.bras[k].prise.y += dy; } return q; };
    } else if (haut) { const A = d.a; d.a = d.b; d.b = A; }                 // au-dessus de la tête : on part d'en bas
    return d;
  };
  V3.prototype.xyz = function () { return [this.x, this.y, this.z]; };

  /* Écartés : bras presque tendus qui se referment devant la poitrine.
     Couché (plat, banc=<angle>, decline, sol) avec haltères ou poulies basses ; debout, à genoux ou assis aux
     poulies (haut : de haut en bas ; bas : de bas en haut ; sinon à hauteur de poitrine) ; machine (pecdeck : coudes
     pliés sur les coussins) ; elas. Côtés : uni. */
  FAM.ecarte = (c, o, C) => {
    const m = coteDe(o);
    if (!(o.poulie || o.machine || o.elas)) o.hal = true;
    const couche = o.plat || o.banc != null || o.decline || o.sol;
    if (!couche && o.hal && !o.debout) o.plat = true;      // haltères : couché, sauf écarté debout (de bas en haut)
    if (o.machine) o.assis = true;
    const P = postureDe(c, o, C); let p = P.p, fixe = P.fixe, vue = P.vue, a, b, ancre;
    const t = c.tronc(p);
    if (P.sorte === 'dos') {
      a = B(102, 88, 12, 24, 0); b = B(6, 90, -84, 16, 0);
      if (o.sol) a = B(96, 88, 6, 30, 0);
      ancre = s => V(s * 1.0, 0.2, t.epaules.G.z); vue = { az: 150, el: 22 };
      if (o.basHaut) { a = B(100, 60, 10, 24, 0); b = B(6, 110, -84, 16, 0); }
    } else if (o.pecdeck) {
      a = B(102, 86, 96, 92, 90); b = B(10, 86, 8, 92, 90); vue = { az: 25, el: 10 };
    } else {
      // Aux poulies (ou à la machine, bras tendus) : buste droit ou un peu penché, un pied en avant.
      const hA = o.haut ? 2.0 : o.bas ? 0.15 : t.epaules.G.y - 0.02;
      if (P.sorte === 'debout') { p.bassin.rot = qX(o.haut ? 14 : 6); p.jambes.G = pied(c, 1, { z: 0.2 }); p.jambes.D = pied(c, -1, { z: -0.22, pointe: 20 }); }
      a = o.haut ? B(98, 104, 10, 26, 0) : o.bas ? B(96, 38, 6, 22, 0) : B(102, 88, 12, 24, 0);
      b = o.haut ? B(14, 48, -76, 18, 0) : o.bas ? B(8, 104, -84, 18, 0) : B(6, 88, -84, 16, 0);
      ancre = s => V(s * 1.0, hA, t.epaules.G.z - 0.2); vue = { az: 20, el: 8 };
    }
    const r = { ancre, deElas: ancre, pivot: s => V(s * 0.35, t.epaules.G.y + 0.5, t.epaules.G.z - 0.1) };
    if (o.poulie && ancre) for (const s of m === 'GD' ? [1, -1] : [m === 'D' ? -1 : 1]) poserObjet(MAT.colonne(C, ancre(s)), V(), null, fixe);
    return Object.assign(parLesBras(p, a, b, m), { fixe, vue, tenu: tenuDe(o, m, r) }, rythmeDe(o));
  };

  /* Pull-over : couché, les bras partent de derrière la tête et reviennent au-dessus de la poitrine.
     hal (un haltère tenu à deux mains), barre, poulie, machine (assis : les bras descendent de devant le visage). */
  FAM.pullover = (c, o, C) => {
    if (o.machine) {
      const p = allonge(c, { h: 0.44, angle: 84, lomb: 0, thor: 0, cou: 0 }), t = c.tronc(p);
      const a = B(0, 150, 0, 85, 90), b = B(0, 40, 0, 85, 90);
      return Object.assign(parLesBras(p, a, b), { fixe: poseFixe(MAT.banc(C, 84)), vue: { az: 60, el: 10 }, tenu: [{ t: 'levier', de: V(0.24, t.epaules.G.y + 0.02, t.epaules.G.z - 0.02), m: 'G' }, { t: 'levier', de: V(-0.24, t.epaules.G.y + 0.02, t.epaules.G.z - 0.02), m: 'D' }] });
    }
    o.plat = true; if (o.jambesHautes) o.jambes = 'levees';
    const P = postureDe(c, o, C), p = P.p;
    const a = B(0, 162, o.barre ? 0 : -6, 24, o.barre ? 180 : 90), b = B(0, 96, o.barre ? 0 : -6, 16, o.barre ? 180 : 90);
    const tenu = o.barre || o.ez ? [{ t: 'barre', l: 1.2, d: 0.12 }] : o.poulie ? [{ t: 'cable', de: V(0, 0.3, -1.5), bout: 'corde' }] : [{ t: 'haltere', m: 'G', k: 1.25 }];
    const fixe = o.poulie ? P.fixe.concat(poseFixe(MAT.colonne(C, V(0, 0.3, -1.5)))) : P.fixe;
    return Object.assign(parLesBras(p, a, b), { fixe, vue: { az: 120, el: 16 }, tenu });
  };
