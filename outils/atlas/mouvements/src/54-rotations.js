  /* ---------- Rotations et inclinaisons du tronc ----------
     russe (assis par terre, buste en arrière, d'un côté à l'autre : hal, balle, disque, barre, elas ; pieds : levés) ;
     debout (rotation debout : barre sur les épaules, ou mains devant ; poulie / elas : câble à l'horizontale) ;
     assis (sur un banc : barre, machine) ; hache (coup de hache en diagonale : poulie, elas, hal ; haut = du haut vers
     le bas (défaut), bas = du bas vers le haut ; genoux, demigenou) ; pallof (dos au câble de côté, les mains
     poussent devant : poulie, elas ; genoux) ; flexion (inclinaison latérale : hal, elas) ; moulinet (bras en croix,
     une main va toucher le pied opposé ; kb : kettlebell tenu au-dessus de la tête) ; landmine ; couche (torsion
     couchée, étirement) ; genoucoude (debout, coude vers le genou opposé). */
  FAM.rotation = (c, o, C) => {
    // Posture par défaut, admise dans l'écriture : o.debout.
    const L = c.L, fixe = [], d = { vue: { az: 28, el: 10 }, tenu: [], fixe };
    const mainsDevant = (p, loin, bas, ecart) => { const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * (ecart == null ? 0.02 : ecart), bas == null ? -0.1 : bas, loin)), pole: V(s * 0.6, -1, 0.1).applyQuaternion(t.qThorax), paume: V(-s, 0, 0).applyQuaternion(t.qThorax), dirMain: V(0, 0.25, 1).applyQuaternion(t.qThorax), doigts: 'barre' }; return t; };
    const charge = (ecart) => (o.hal ? [{ t: 'haltere', m: 'GD', entre: true }] : o.balle ? [{ t: 'balle', m: 'GD', r: 0.11 }] : o.disque ? [{ t: 'disque', m: 'GD', r: 0.15, bord: true }] : o.kb ? [{ t: 'kb', m: 'GD', entre: true }] : []);

    if (o.russe) {
      // Assis, buste incliné en arrière, genoux fléchis : les mains (et la charge) passent d'une hanche à l'autre.
      const base = assisSol(c, { recul: 32, lomb: 14, thor: 8, jambes: o.leves ? J(98, 5, 0, 58, 10) : J(108, 5, 0, 109, 0) });
      base.cou = 12;
      d.rythme = 'continu'; d.periode = 2.6;
      d.pose = ph => { const p = cloner(base), sn = Math.sin(ph * 2 * Math.PI); p.torsion = 52 * sn; p.couRot = -14 * sn; if (o.barre) Object.assign(d, {}); mainsDevant(p, 0.3, -0.2, o.hal ? 0.09 : o.disque ? 0.138 : o.balle ? 0.1 : 0.03); return p; };
      d.tenu = charge();
      if (o.barre) { d.pose = ph => { const p = cloner(base), sn = Math.sin(ph * 2 * Math.PI); p.torsion = 48 * sn; p.couRot = -12 * sn; porter(c, p, { barre: true }, C, 0); return p; }; d.tenu = [{ t: 'barre', l: 1.6, d: 0 }]; }
      if (o.elas) d.tenu = [{ t: 'elastique', de: V(1.25, 0.45, 0.25), m: 'GD', bout: 'corde' }];
      d.vue = { az: 42, el: 16 }; return d;
    }
    if (o.couche) {
      // Sur le dos, bras en croix : les genoux fléchis basculent d'un côté, les épaules restent au sol.
      const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: J(84, 0, 0, 90, 10) }); p.bassin.rot = qX(-90).multiply(qY(-62 * u)); p.torsion = 58 * u; p.couRot = 30 * u; c.poserSur(p, V(), AY, ['bassin', 'cuisse', 'thorax', 'dos', 'jambe']); p.bras = pareil(B(90, 88, 0, 6, 0, { doigts: 'detendu' })); return p; };
      d.a = cle(0); d.b = cle(1); d.rythme = 'etire'; d.vue = { az: 60, el: 26 }; return d;
    }
    if (o.genoucoude) {
      // Debout, mains à la tête : un genou monte, le coude opposé vient à sa rencontre.
      const base = debout(c, { ecart: 0.1, ouv: 8 });
      d.rythme = 'alt'; d.periode = 3.2;
      d.pose = (uG, uD) => {
        const p = cloner(base), u = Math.max(uG, uD), sens = uG > 0 ? 1 : -1;
        p.lombaires = 22 * u; p.thorax = 10 * u; p.torsion = 34 * u * sens; p.cou = 6 * u;
        const k = uG > 0 ? 'G' : 'D'; if (u > 0) p.jambes[k] = J(96 * u + 0, 4, 0, 96 * u, 28 * u);
        p.bras = mains(c, c.tronc(p), 'nuque'); return p;
      };
      d.vue = { az: 20, el: 8 }; return d;
    }
    if (o.flexion) {
      // Inclinaison latérale : la charge dans une main descend le long de la cuisse, puis le buste se redresse de l'autre côté.
      const cle = u => { const p = debout(c, { ecart: 0.12, ouv: 8 }); p.inclinaison = lerp(-26, 20, u); p.couIncl = lerp(-6, 5, u); p.bras.D = B(90, 4, 0, 4, 90); const t = c.tronc(p); p.bras.G = o.elas ? B(90, 4, 0, 4, 90) : mains(c, t, 'nuque').G; if (o.elas) p.bras.D = mains(c, t, 'hanches').D; return p; };
      d.a = cle(0); d.b = cle(1);
      if (o.hal) d.tenu = [{ t: 'haltere', m: 'D' }]; else if (o.kb) d.tenu = [{ t: 'kb', m: 'D' }]; else if (o.elas) d.tenu = [{ t: 'elastique', de: 'pied', m: 'G', bout: 'poignee' }];
      d.vue = { az: 6, el: 8 }; return d;
    }
    if (o.moulinet) {
      if (o.kb) {
        // Moulinet au kettlebell : un bras tendu à la verticale, le buste s'incline et tourne, l'autre main descend vers le pied.
        const cle = u => {
          const p = debout(c, { ecart: 0.24, ouv: 24, dx: 0.06 * u, dy: -0.03 * u, penche: 52 * u });
          p.torsion = -58 * u; p.inclinaison = 0; p.cou = -10 * u; p.couRot = -40 * u;
          p.bras.G = { dirBras: V(0.04, 1, 0.02), dirAvantBras: V(0, 1, 0), paume: V(0, 0, 1) };
          const info = c.poser(p), cible = info.chevilles.D.clone().add(V(0.06, 0.06, 0.1)), bas = V(-0.25, info.hanches.D.y - 0.08, 0.06);
          // La main descend vers le pied, sans dépasser la portée du bras.
          const e = info.epaules.D, v = bas.lerp(cible, u).sub(e), R = 0.95 * (L.bras + L.prise); if (v.length() > R) v.multiplyScalar(R / v.length());
          p.bras.D = { prise: e.clone().add(v), pole: V(-1, 0, -0.3), paume: V(1, 0, 0), doigts: 'detendu' };
          return p;
        };
        d.cles = [0, 0.25, 0.5, 0.75, 1].map(u => [u, cle(u)]); d.tenu = [{ t: 'kb', m: 'G', sens: 'avantbras' }];
        d.vue = { az: 24, el: 8 }; return d;
      }
      // Bras en croix, jambes écartées : le buste se penche et tourne, une main va toucher le pied opposé.
      const base = debout(c, { ecart: 0.3, ouv: 14 });
      d.rythme = 'alt'; d.periode = 3.6;
      d.pose = (uG, uD) => {
        const u = Math.max(uG, uD), sens = uG > 0 ? 1 : -1;      // uG : la main gauche descend vers le pied droit
        const p = debout(c, { ecart: 0.3, ouv: 14, penche: 78 * u, dz: -0.06 * u, dy: -0.045 * u, cou: -30 * u });
        p.torsion = -50 * u * sens; p.lombaires = 10 * u;
        p.bras = pareil(B(90, 88, 0, 4, 180, { doigts: 'plat' }));
        return p;
      };
      d.vue = { az: 22, el: 10 }; return d;
    }
    if (o.landmine) {
      // La barre tenue par son bout, bras tendus devant : elle décrit un arc d'une hanche à l'autre.
      const base = debout(c, { ecart: 0.2, ouv: 12, dy: -0.04 }), piv = V(0, 0.05, 1.55);
      d.rythme = 'continu'; d.periode = 3.2;
      d.pose = ph => {
        const p = cloner(base), sn = Math.sin(ph * 2 * Math.PI), t = c.tronc(p);
        p.torsion = 30 * sn; p.couRot = -8 * sn;
        const haut = t.epaules.G.y + 0.12, m = V(0.42 * sn, haut - 0.42 * sn * sn, 0.52 - 0.14 * sn * sn);
        for (const [k, s] of COTES) p.bras[k] = { prise: m.clone().add(V(s * 0.035, 0, 0)), pole: V(s * 0.7, -0.6, -0.2), paume: V(-s, 0, 0), dirMain: V(0, 0.5, 0.85), doigts: 'barre' };
        return p;
      };
      d.objets = (info, u, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), dir = unite(m.clone().sub(piv)); sortie.push(pret(seg(piv, m.clone().add(dir.clone().multiplyScalar(0.12)), 0.025, C.metal, 1))); poserObjet([cyl(0.14, 0.04, 0, 0, 0, C.fonte, 0, DEBOUT_Q)], m.clone().sub(dir.clone().multiplyScalar(0.2)), arc(AY, dir), sortie); };
      d.vue = { az: 150, el: 12 }; return d;
    }
    if (o.pallof) {
      // De profil par rapport au câble : les mains partent du sternum, poussent droit devant, reviennent ; le buste ne tourne pas.
      const base = o.genoux ? aGenoux(c, {}) : o.demigenou ? demiGenou(c, {}) : debout(c, { ecart: 0.17, ouv: 8, dy: -0.03 });
      const t0 = c.tronc(base), yA = o.bas ? 0.35 : t0.epaules.G.y - 0.12, anc = V(1.25, yA, 0.1);
      const cle = u => { const p = cloner(base); mainsDevant(p, lerp(0.19, 0.56, u), -0.12, 0.02); return p; };
      d.a = cle(0); d.b = cle(1);
      d.tenu = [{ t: o.elas ? 'elastique' : 'cable', de: anc, m: 'GD', bout: 'corde' }];
      if (!o.elas) fixe.push(...poseFixe(MAT.colonne(C, anc, V(1.31, 0, 0.1)))); else fixe.push(pret(boite(0.05, yA + 0.2, 0.05, 1.3, (yA + 0.2) / 2, 0.1, C.cadre, 0.5)));
      d.vue = { az: -24, el: 10 }; return d;
    }
    if (o.hache) {
      // Coup de hache : les mains tirent en diagonale, d'au-dessus d'une épaule jusqu'à la hanche opposée (ou l'inverse),
      // le buste tourne et les genoux accompagnent.
      const genoux = o.genoux || o.demigenou, versHaut = !!o.bas;
      const cle = v => {   // v = 0 : mains en haut du côté gauche ; 1 : en bas du côté droit
        const p = o.genoux ? aGenoux(c, { penche: 10 * v }) : o.demigenou ? demiGenou(c, { penche: 8 * v }) : debout(c, { ecart: 0.2, ouv: 12, dy: -0.02 - 0.1 * v, penche: 22 * v, dz: -0.05 * v });
        p.torsion = lerp(42, -44, v); p.couRot = lerp(14, -10, v); p.cou = -8 * v;
        const t = c.tronc(p), ep = t.epaules.G.y, m = V(lerp(0.4, -0.27, v), lerp(ep + 0.26, ep - 0.47 + (genoux ? 0.08 : 0), v), lerp(0.2, 0.3, v) + 0.12 * Math.sin(Math.PI * v));
        for (const [k, s] of COTES) p.bras[k] = { prise: m.clone().add(V(s * 0.03, 0, 0).applyQuaternion(t.qThorax)), pole: V(s * 0.5, -0.6, -0.4).applyQuaternion(t.qThorax), paume: V(-s, 0, 0).applyQuaternion(t.qThorax), dirMain: unite(m.clone().sub(t.cou).add(V(0, 0.2, 0))), doigts: 'barre' };
        return p;
      };
      d.cles = (versHaut ? [1, 0.75, 0.5, 0.25, 0] : [0, 0.25, 0.5, 0.75, 1]).map((v, n) => [n / 4, cle(v)]);
      const t0 = c.tronc(cle(0)), anc = versHaut ? V(-1.3, 0.25, 0.25) : V(1.35, t0.epaules.G.y + 0.75, 0.2);
      if (o.poulie) { d.tenu = [{ t: 'cable', de: anc, m: 'GD', bout: 'corde' }]; fixe.push(...poseFixe(MAT.colonne(C, anc, V(anc.x + (anc.x > 0 ? 0.06 : -0.06), 0, anc.z)))); }
      else if (o.elas) { d.tenu = [{ t: 'elastique', de: anc, m: 'GD', bout: 'corde' }]; fixe.push(pret(boite(0.05, anc.y + 0.15, 0.05, anc.x + (anc.x > 0 ? 0.05 : -0.05), (anc.y + 0.15) / 2, anc.z, C.cadre, 0.5))); }
      else d.tenu = charge();
      d.vue = { az: versHaut ? 20 : -20, el: 10 }; return d;
    }
    // Rotation debout ou assise, les mains devant soi ou la barre sur les épaules.
    const machine = !!o.machine, base = o.assis || machine ? assis(c, { h: machine ? H_SIEGE : H_BANC, ecart: 0.14 }) : o.genoux ? aGenoux(c, {}) : debout(c, { ecart: 0.19, ouv: 12, dy: -0.02 });
    if (o.assis && !machine) fixe.push(...bancAssis(C));
    if (machine) fixe.push(...poseFixe(MAT.siege(C, H_SIEGE, 0, 0)));
    const amp = machine ? 46 : o.barre ? 50 : 44;
    const poser = (p, tw) => {
      p.torsion = tw; p.couRot = -tw * 0.3;
      if (o.barre) porter(c, p, { barre: true }, C, 0);
      else if (o.poulie || o.elas) mainsDevant(p, 0.5, -0.08, 0.02);
      else if (machine) { const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.17, -0.14, 0.3)), pole: V(s * 0.5, -1, -0.1).applyQuaternion(t.qThorax), paume: V(-s, 0, 0).applyQuaternion(t.qThorax), dirMain: V(0, 0.6, 0.8).applyQuaternion(t.qThorax), doigts: 'barre' }; }
      else mainsDevant(p, 0.24, -0.12, 0.03);
      return p;
    };
    if (o.poulie || o.elas) {
      // Câble à l'horizontale, de côté : bras tendus, le buste tourne en s'éloignant de la poulie.
      const t0 = c.tronc(base), anc = V(1.35, t0.epaules.G.y - 0.1, 0.15);
      d.cles = [0, 0.5, 1].map(u => [u, poser(cloner(base), lerp(46, -46, u))]);
      d.tenu = [{ t: o.elas ? 'elastique' : 'cable', de: anc, m: 'GD', bout: 'corde' }];
      if (o.poulie) fixe.push(...poseFixe(MAT.colonne(C, anc, V(1.41, 0, 0.15)))); else fixe.push(pret(boite(0.05, anc.y + 0.2, 0.05, 1.4, (anc.y + 0.2) / 2, 0.15, C.cadre, 0.5)));
      d.vue = { az: -20, el: 10 }; return d;
    }
    d.rythme = 'continu'; d.periode = o.barre ? 3 : 2.6;
    d.pose = ph => poser(cloner(base), amp * Math.sin(ph * 2 * Math.PI));
    if (o.barre) d.tenu = [{ t: 'barre', l: 1.6, d: 0 }]; else d.tenu = charge();
    if (machine) d.objets = (info, u, sortie) => {
      // Le bras de la machine tourne avec le buste : deux poignées reliées, au bout d'un bras qui vient de l'axe (derrière le siège).
      const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), axe = V(0, m.y + 0.42, -0.02);
      sortie.push(pret(seg(info.prises.G, info.prises.D, 0.016, C.cadre, 0.5)), pret(seg(m, V(m.x, axe.y, m.z), 0.018, C.cadre, 0.5)), pret(seg(V(m.x, axe.y, m.z), axe, 0.018, C.cadre, 0.5)), pret(seg(axe, V(0, axe.y, -0.4), 0.022, C.cadre, 0.5)), pret(seg(V(0, axe.y, -0.4), V(0, 0, -0.4), 0.03, C.cadre, 0.5)));
    };
    d.vue = { az: 24, el: 10 }; return d;
  };
