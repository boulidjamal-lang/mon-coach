  /* ---------- Étirements, postures et mobilité ----------
     Chaque posture va de la position de départ à l'étirement, s'y tient, puis revient.
     Hanches et jambes : 9090, papillon (avant ; couche), grenouille (demi), pigeon, lezard, fente (fléchisseurs de hanche),
     monde (le « plus grand étirement du monde »), squatpli, bebe, genoupoitrine (couche), figure4 (sol), ischios
     (genou ; assis ; deux), pli (flexion avant debout), quadriceps (genou ; couche ; cote ; debout). Dos : chatvache, enfant, rotationdos, lateral,
     chienbas (debout). Haut du corps : deltarriere, pectoraux (coude ; porte ; coudes), triceps, cou (curl : flexion
     de nuque, exercice). rouleau (auto-massage : fessiers, mollets, pied). */
  FAM.etire = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 55, el: 12 }, tenu: [], fixe, rythme: 'etire' };
    const SOL = ['bassin', 'cuisse', 'jambe', 'pied'];
    const auSol = (p, regions) => c.poserSur(p, V(), AY, regions || SOL);
    const corps = (rot, plus) => Object.assign({ bassin: { pos: V(0, 0.6, 0), rot }, lombaires: 0, thorax: 0, cou: 0, bras: pareil(brasRepos()), jambes: pareil(J(0, 3, 0, 3, 10)) }, plus || {});
    // Une main va tenir un point (pied, genou, coude) : la cible est ramenée à portée de bras.
    const tenir = (p, k, cible, pole, paume) => { const info = c.poser(p), e = info.epaules[k], v = cible.clone().sub(e), R = 0.95 * (L.bras + L.prise); if (v.length() > R) v.multiplyScalar(R / v.length()); p.bras[k] = { prise: e.clone().add(v), pole: pole || V(k === 'G' ? 1 : -1, -0.5, -0.2), paume: paume || V(0, 0, -1), doigts: 'barre' }; return p; };
    const deux = (a, b) => { d.a = a; d.b = b; return d; };

    if (o['9090']) {
      const cle = u => { const p = corps(qX(6 + 26 * u), { lombaires: 8 + 14 * u, thorax: 6 * u, cou: -6 * u }); p.jambes.G = J(86 + 26 * u, 16, 84, 92, 10); p.jambes.D = J(6 + 26 * u, 82, 0, 92, 30); auSol(p); const t = c.tronc(p); for (const k of ['G', 'D']) { tenir(p, k, V(k === 'G' ? 0.32 : -0.3, 0.03, t.epaules.G.z + 0.1 + 0.16 * u), V(k === 'G' ? 0.6 : -0.6, 0.3, -0.6), V(0, -1, 0)); p.bras[k].doigts = 'detendu'; } return p; };
      d.vue = { az: 35, el: 20 }; return deux(cle(0), cle(1));
    }
    if (o.papillon) {
      const jb = () => pareil(J(66, 40, 62, 128, 20));
      if (o.couche) { const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: J(lerp(40, 58, u), lerp(8, 44, u), lerp(10, 62, u), lerp(70, 118, u), 20) }); p.bras = pareil(B(90, 40, 0, 10, 0, { doigts: 'detendu' })); auSol(p, ['bassin', 'dos', 'cuisse', 'jambe', 'pied', 'thorax']); return p; }; d.vue = { az: 50, el: 26 }; return deux(cle(0), cle(1)); }
      const cle = u => { const pen = o.avant ? 34 * u : 4 * u, p = corps(qX(2 + pen), { lombaires: 6 + (o.avant ? 22 * u : 0), thorax: o.avant ? 10 * u : 0, cou: o.avant ? 10 * u : 0, jambes: pareil(J(66 + 0.9 * pen, lerp(30, 44, o.avant ? 0.6 : u), 62, 128, 20)) }); auSol(p); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.chevilles[k].clone().add(V(0, 0.04, 0.02)), V(k === 'G' ? 1 : -1, 0.2, -0.3), V(0, -1, 0)); return p; };
      d.vue = { az: 30, el: 20 }; return deux(cle(0), cle(1));
    }
    if (o.grenouille) {
      // À quatre pattes, genoux très écartés : le bassin recule vers les talons, puis revient.
      const cle = u => {
        const p = corps(qX(88), { cou: -20, jambes: { G: J(lerp(84, 116, u), 44, 0, lerp(90, 118, u), 40), D: o.demi ? J(lerp(60, 86, u), 78, 0, 4, 0) : J(lerp(84, 116, u), 44, 0, lerp(90, 118, u), 40) } });
        auSol(p, ['jambe', 'pied']); p.bassin.pos.z = -0.2 * u;
        const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.2, 0.008, t.epaules.G.z + 0.04 + 0.2 * u), pole: V(s * 0.4, 0.4, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
        return p;
      };
      d.rythme = 'rep'; d.periode = 3.6; d.vue = { az: 60, el: 18 }; return deux(cle(0), cle(1));
    }
    if (o.chatvache) {
      const base = quatrePattes(c, {});
      const cle = u => { const p = cloner(base); p.lombaires = lerp(-18, 26, u); p.thorax = lerp(-10, 20, u); p.cou = lerp(-34, 28, u); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k].prise = V(t.epaules[k].x + s * 0.01, 0.008, t.epaules[k].z + 0.02); return p; };
      d.rythme = 'rep'; d.periode = 4.4; d.vue = { az: 72, el: 12 }; return deux(cle(0), cle(1));
    }
    if (o.enfant) {
      // De la position à quatre pattes, les fesses reculent sur les talons, le buste se couche sur les cuisses, bras allongés devant.
      const zM = quatrePattes(c, {}).bras.G.prise.z;
      const cle = u => {
        const p = corps(qX(lerp(86, 80, u)), { lombaires: 24 * u, thorax: 10 * u, cou: lerp(-25, 8, u), jambes: pareil(J(lerp(86, 132, u), lerp(6, 12, u), 0, lerp(90, 150, u), 62)) });
        auSol(p, ['jambe', 'pied']);
        const info = c.poser(p); p.bassin.pos.z += -info.genoux.G.z;
        const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.18, 0.008, Math.min(zM + 0.36, t.epaules.G.z + lerp(0.03, 0.5, u))), pole: V(s * 0.5, 0.5, -0.6), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
        return p;
      };
      d.cles = [0, 0.33, 0.66, 1].map(u => [u, cle(u)]); d.vue = { az: 70, el: 14 }; return d;
    }
    if (o.rotationdos) {
      // À quatre pattes, une main à la nuque : le coude plonge vers le bras d'appui, puis s'ouvre vers le plafond.
      const base = quatrePattes(c, {});
      const cle = u => { const p = cloner(base); p.torsion = lerp(-24, 52, u); p.couRot = lerp(-10, 30, u); p.bras.G = mains(c, c.tronc(p), 'nuque').G; return p; };
      d.rythme = 'rep'; d.periode = 4; d.vue = { az: 40, el: 16 }; return deux(cle(0), cle(1));
    }
    if (o.lateral) {
      const cle = u => { const p = debout(c, { ecart: 0.12, ouv: 8, dx: -0.04 * u }); p.inclinaison = -30 * u; p.couIncl = -8 * u; p.bras.G = B(90, lerp(8, 172, Math.min(1, u * 3)), 0, 8, 90, { doigts: 'plat' }); p.bras.D = mains(c, c.tronc(p), 'hanches').D; return p; };
      d.vue = { az: 8, el: 8 }; return deux(cle(0), cle(1));
    }
    if (o.chienbas) {
      if (o.debout) {
        // Mains sur un appui à hauteur de hanches, buste à l'horizontale, bras dans le prolongement du dos.
        const cle = u => { const p = debout(c, { ecart: 0.12, ouv: 6, penche: lerp(48, 88, u), dz: lerp(-0.15, -0.28, u), dy: -0.03, lomb: -2, cou: -lerp(10, 20, u) }); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.2, 0.96, 0.62), pole: V(s * 0.5, -1, 0), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
        fixe.push(pret(boite(0.9, 0.04, 0.3, 0, 0.93, 0.7, C.banc, 0)), pret(boite(0.05, 0.92, 0.05, -0.4, 0.46, 0.75, C.cadre, 0.5)), pret(boite(0.05, 0.92, 0.05, 0.4, 0.46, 0.75, C.cadre, 0.5)));
        d.vue = { az: 70, el: 8 }; return deux(cle(0), cle(1));
      }
      const A = L.bras + L.avantBras, ap = appuiPike(c, { yPieds: 0, portee: 0.98, poignet: V(0.24, L.creux + 0.008, -L.main), cou: 16, pointe: 12 });
      const cle = u => { const p = ap(0.975 * A, lerp(66, 88, u)); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.24, 0.008, 0), pole: V(s * 0.8, 0.4, 0.2), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      d.vue = { az: 70, el: 10 }; return deux(cle(0), cle(1));
    }
    if (o.pigeon || o.lezard || o.fente || o.monde) {
      // Grande fente basse : pied gauche devant, jambe droite allongée derrière.
      const cle = u => {
        const bas = o.pigeon ? 0.16 : o.fente ? 0.42 : 0.3;
        const p = corps(qX(o.pigeon ? lerp(38, 52, u) : o.fente ? lerp(4, -4, u) : 58), { lombaires: o.pigeon ? lerp(-30, 14, u) : o.fente ? -8 * u : 8, thorax: o.pigeon ? lerp(-8, 12, u) : 0, cou: o.fente ? 0 : o.pigeon ? lerp(0, 10, u) : -14 });
        p.bassin.pos = V(0, bas, 0);
        if (o.pigeon) { p.jambes.G = J(lerp(128, 142, u), 26, 72, 104, 10); p.jambes.D = J(lerp(-44, -30, u), 4, 0, 6, 58); auSol(p, ['cuisse', 'jambe', 'pied', 'bassin']); }
        else {
          const av = o.fente ? lerp(0.5, 0.62, u) : 0.56;
          p.jambes.G = pied(c, 1, { x: 0.15, z: av, ouv: 6 });
          p.jambes.D = o.fente ? { cheville: V(-0.11, 0.07, -0.72), pole: V(0, -1, 0.2), pied: V(0, -0.2, -1), hautPied: V(0, -1, 0.2) } : { cheville: V(-0.11, 0.15, -0.82), pole: V(0, -1, 0.2), pied: V(0, -1, 0.22), hautPied: V(0, 0.2, 1), orteils: 60 };
          p.bassin.pos.y = o.fente ? lerp(0.46, 0.36, u) : 0.34; p.bassin.pos.z = o.fente ? lerp(-0.1, 0.04, u) : -0.02;
        }
        const t = c.tronc(p);
        if (o.pigeon) { for (const k of ['G', 'D']) tenir(p, k, V(k === 'G' ? 0.3 : -0.3, 0.03, t.epaules.G.z + lerp(0.02, 0.44, u)), V(k === 'G' ? 0.6 : -0.6, 0.3, -0.6), V(0, -1, 0)); for (const k of ['G', 'D']) p.bras[k].doigts = 'detendu'; }
        else if (o.fente) p.bras = mains(c, t, 'hanches');
        else if (o.lezard) for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.1 - 0.06, lerp(0.008, 0.035, u), t.epaules.G.z + 0.02 + 0.27 * u), pole: V(s * 0.3, lerp(0.5, -1, u), -0.4), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
        else {
          // Le plus grand étirement du monde : main droite au sol, le bras gauche s'ouvre vers le plafond, le buste tourne.
          p.torsion = 62 * u; p.couRot = 34 * u;
          p.bras.D = { prise: V(-0.2, 0.008, t.epaules.G.z + 0.02), pole: V(-0.5, 0.4, -0.6), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
          p.bras.G = u < 0.02 ? { prise: V(-0.02, 0.06, t.epaules.G.z + 0.08), pole: V(0.6, 0.6, -0.3), paume: V(0, -1, 0), doigts: 'detendu' } : { dirBras: unite(V(0.25, lerp(-1, 1, u), 0.1)), dirAvantBras: unite(V(0.3, lerp(-1, 1, u), 0.1)), paume: V(0, 0, 1), doigts: 'plat' };
        }
        if (o.lezard) p.bassin.pos.y = lerp(0.34, 0.29, u);
        return p;
      };
      if (o.monde) { d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); d.rythme = 'rep'; d.periode = 4.6; d.vue = { az: 40, el: 14 }; return d; }
      d.vue = { az: 62, el: 14 }; return deux(cle(0), cle(1));
    }
    if (o.squatpli) {
      // Accroupi, les mains tiennent les pointes de pieds ; les jambes se tendent, le buste reste plié sur les cuisses.
      const cle = u => { const p = debout(c, { ecart: 0.24, ouv: 24, dy: lerp(-0.6, -0.14, u), dz: lerp(-0.2, -0.2, u), penche: lerp(34, 98, u), lomb: lerp(14, 30, u), thor: 10, cou: lerp(-20, 20, u) }); equilibrer(c, p, p.jambes.G.cheville.z + 0.05); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.orteils[k].clone().add(V(0, 0.03, 0.04)), V(k === 'G' ? 1 : -1, 0.3, -0.2), V(0, -1, 0)); return p; };
      d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); d.rythme = 'rep'; d.periode = 5; d.vue = { az: 40, el: 10 }; return d;
    }
    if (o.bebe) {
      const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: J(lerp(90, 128, u), lerp(8, 30, u), 8, lerp(90, 96, u), 0) }); p.lombaires = 6 * u; const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.chevilles[k].clone().add(V(k === 'G' ? 0.03 : -0.03, 0.03, 0)), V(k === 'G' ? 1 : -1, -0.2, 0.3), V(k === 'G' ? -1 : 1, 0, 0)); return p; };
      d.vue = { az: 55, el: 24 }; return deux(cle(0), cle(1));
    }
    if (o.genoupoitrine) {
      if (o.couche) { const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: { G: J(lerp(40, 128, u), 4, 0, lerp(60, 130, u), 10), D: J(o.deux ? lerp(40, 128, u) : 4, 4, 0, o.deux ? lerp(60, 130, u) : 4, 20) } }); auSol(p, ['bassin', 'dos', 'thorax', 'jambe', 'pied']); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.genoux[o.deux ? k : 'G'].clone().add(V(k === 'G' ? 0.05 : -0.05, 0.02, -0.06)), V(k === 'G' ? 1 : -1, -0.3, 0.3), V(0, -0.3, -1)); return p; }; d.vue = { az: 60, el: 22 }; return deux(cle(0), cle(1)); }
      const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6 }); p.jambes.G = J(lerp(10, 116, u), 4, 0, lerp(10, 128, u), 20); const info = c.poser(p); if (u > 0.05) for (const k of ['G', 'D']) tenir(p, k, info.genoux.G.clone().add(V(k === 'G' ? 0.05 : -0.05, -0.06, 0.07)), V(k === 'G' ? 1 : -1, -0.6, 0), V(0, 0, -1)); return p; };
      d.cles = [0, 0.3, 1].map(u => [u, cle(u)]); d.vue = { az: 40, el: 8 }; return d;
    }
    if (o.figure4) {
      if (o.sol) {
        // Sur le dos : une cheville posée sur le genou opposé, les mains ramènent la cuisse vers la poitrine.
        const cle = u => { const p = allonge(c, { h: 0, angle: 0, jambes: { G: J(lerp(62, 104, u), 4, 0, lerp(100, 96, u), 10), D: J(lerp(70, 104, u), 34, 72, 92, 10) } }); auSol(p, ['bassin', 'dos', 'thorax', 'jambe', 'pied']); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.genoux.G.clone().add(V(k === 'G' ? 0.05 : -0.05, -0.02, -0.08)), V(k === 'G' ? 1 : -1, -0.3, 0.3), V(0, -0.3, -1)); return p; };
        d.vue = { az: 60, el: 22 }; return deux(cle(0), cle(1));
      }
      const cle = u => { const p = assis(c, { h: 0.46, penche: lerp(2, 32, u), ecart: 0.12 }); p.lombaires = 12 * u; p.jambes.D = J(lerp(80, 84, u) + lerp(2, 32, u), 22, 74, 96, 10); const info = c.poser(p); p.bras.D = B(20, 30, 0, 60, 150, { doigts: 'detendu' }); p.bras.G = B(20, 30, 0, 60, 150, { doigts: 'detendu' }); return p; };
      fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, 0.3)));
      d.vue = { az: 38, el: 12 }; return deux(cle(0), cle(1));
    }
    if (o.pli) {
      // Flexion avant debout : jambes tendues, le buste se plie, les mains descendent vers le sol.
      const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6, penche: lerp(4, 104, u), dz: lerp(0, -0.11, u), dy: -0.03 * u, lomb: 26 * u, thor: 14 * u, cou: lerp(0, 16, u) }); p.bras = pareil(B(6, lerp(8, 96, u), 0, 6, 150, { doigts: 'detendu' })); if (u) equilibrer(c, p, p.jambes.G.cheville.z + 0.05); return p; };   // les hanches reculent juste ce qu'il faut pour tenir sur ses pieds
      d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); d.vue = { az: 70, el: 8 }; return d;
    }
    if (o.ischios) {
      if (o.assis) {
        // Assis, une jambe tendue, l'autre repliée pied contre la cuisse : le buste se penche vers le pied.
        const cle = u => { const pen = lerp(6, 44, u), p = corps(qX(pen), { lombaires: 10 + 22 * u, thorax: 12 * u, cou: 8 * u }); p.jambes.G = J(88 + pen, 4, 0, 3, -10); p.jambes.D = o.deux ? J(88 + pen, 4, 0, 3, -10) : J(64 + pen, 40, 66, 132, 20); auSol(p); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.orteils.G.clone().add(V(k === 'G' ? 0.04 : -0.04, 0.02, -0.04)), V(k === 'G' ? 1 : -1, 0.4, -0.2), V(0, -1, 0)); return p; };
        d.vue = { az: 50, el: 16 }; return deux(cle(0), cle(1));
      }
      // Un genou à terre, la jambe avant tendue talon au sol : le buste se penche sur elle.
      const cle = u => { const pen = lerp(4, 52, u), p = corps(qX(pen), { lombaires: 14 * u, cou: -10 * u }); p.jambes.D = J(pen + lerp(0, -8, u), 5, 0, lerp(92, 100, u), 62); p.jambes.G = J(pen + lerp(74, 80, u), 5, 0, lerp(26, 4, u), -18); auSol(p, ['jambe', 'pied']); const info = c.poser(p); for (const k of ['G', 'D']) tenir(p, k, info.genoux.G.clone().add(V(k === 'G' ? 0.08 : -0.08, lerp(0.1, -0.08, u), lerp(0, 0.22, u))), V(k === 'G' ? 1 : -1, 0.2, -0.4), V(0, -1, 0)); return p; };
      d.vue = { az: 62, el: 12 }; return deux(cle(0), cle(1));
    }
    if (o.quadriceps) {
      if (o.debout) { const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6 }); if (u > 0) p.jambes.G = J(lerp(4, -14, u), 4, 0, lerp(20, 142, u), 30); const info = c.poser(p); if (u > 0.3) tenir(p, 'G', info.chevilles.G.clone().add(V(0.02, -0.04, -0.03)), V(1, 0, -1), V(0, 0, 1)); p.bras.D = B(90, 40 * u, 0, 8, 90); return p; }; d.cles = [0, 0.4, 1].map(u => [u, cle(u)]); d.vue = { az: 70, el: 8 }; return d; }
      if (o.couche || o.cote) {
        const cle = u => {
          const p = o.cote ? surLeCote(c, { cote: 'D', jambes: { D: J(14, 0, 0, 20, 20), G: J(lerp(10, -16, u), 2, 0, lerp(30, 140, u), 30) } }) : aPlatVentre(c, { h: 0, angle: 0, jambes: { D: J(0, 5, 0, 3, 55), G: J(lerp(0, -4, u), 5, 0, lerp(10, 138, u), 40) }, cou: -10 });
          const info = c.poser(p);
          if (u > 0.3) tenir(p, 'G', info.chevilles.G.clone().add(V(0, 0.02, 0)), o.cote ? V(0, 1, -1) : V(1, 1, -0.5), V(0, 0, 1));
          const front = k => ({ prise: V((k === 'G' ? 1 : -1) * 0.07, 0.03, info.tete.z + 0.06), pole: V(k === 'G' ? 1 : -1, 0.15, -0.1), paume: V(0, -1, 0), dirMain: V(k === 'G' ? -1 : 1, 0, 0.3), doigts: 'plat' });
          if (u <= 0.3) p.bras.G = o.cote ? B(40, 20, 0, 30, 150) : front('G');
          p.bras.D = o.cote ? B(10, 160, 0, 24, 90, { doigts: 'plat' }) : front('D');
          if (o.cote) c.poserSur(p, V(), AY);
          return p;
        };
        d.cles = [0, 0.4, 1].map(u => [u, cle(u)]); d.vue = o.cote ? { az: 0, el: 18 } : { az: 62, el: 20 }; return d;
      }
      // Un genou à terre : la main attrape le pied arrière et ramène le talon vers la fesse.
      const cle = u => { const p = demiGenou(c, { bas: 'G' }); p.jambes.G = J(lerp(0, -6, u), 5, 0, lerp(90, 146, u), 62); p.bassin.pos.z += 0.03 * u; const info = c.poser(p); if (u > 0.3) tenir(p, 'G', info.chevilles.G.clone().add(V(0.02, 0.0, -0.03)), V(1, 0.2, -1), V(0, 0, 1)); p.bras.D = B(20, 40, 0, 50, 150, { doigts: 'detendu' }); return p; };
      d.cles = [0, 0.4, 1].map(u => [u, cle(u)]); d.vue = { az: 66, el: 10 }; return d;
    }
    if (o.deltarriere) {
      const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8 }); p.bras.G = B(lerp(40, -34, u), lerp(20, 88, u), 0, 6, 90, { doigts: 'detendu' }); const info = c.poser(p); p.bras.D = u > 0.3 ? { prise: info.coudes.G.clone().add(V(0.0, -0.01, 0.07)), pole: V(-1, -0.6, 0.2), paume: V(0, 0, -1), doigts: 'detendu' } : B(30, 40 * u / 0.3, 0, 60 * u / 0.3, 90, { doigts: 'detendu' }); return p; };
      d.cles = [0, 0.35, 1].map(u => [u, cle(u)]); d.vue = { az: 18, el: 8 }; return d;
    }
    if (o.triceps) {
      const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8 }); p.bras.G = B(70, lerp(20, 170, u), 0, lerp(10, 146, u), 90, { doigts: 'detendu' }); const info = c.poser(p); p.bras.D = u > 0.5 ? { prise: info.coudes.G.clone().add(V(-0.02, 0.05, 0.0)), pole: V(-1, 0.2, -0.3), paume: V(1, -0.3, 0), doigts: 'detendu' } : B(60, 150 * u / 0.5, 0, 30, 90, { doigts: 'detendu' }); return p; };
      d.cles = [0, 0.5, 1].map(u => [u, cle(u)]); d.vue = { az: 150, el: 8 }; return d;
    }
    if (o.pectoraux) {
      if (o.coudes) { const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8 }); p.thorax = -10 * u; p.lombaires = -4 * u; const t = c.tronc(p); p.bras = mains(c, t, 'nuque'); for (const [k, s] of COTES) p.bras[k].pole = V(s * 1, 0, lerp(0.5, -0.5, u)).applyQuaternion(t.qThorax); return p; }; d.vue = { az: 30, el: 8 }; return deux(cle(0), cle(1)); }
      if (o.porte) {
        // Dans l'encadrement d'une porte : les avant-bras sur les montants, le corps avance.
        const cle = u => { const p = debout(c, { ecart: 0.1, ouv: 6, dz: 0.11 * u, penche: 4 * u }); p.jambes.G = pied(c, 1, { x: 0.1, z: 0.22 }); p.jambes.D = pied(c, -1, { x: -0.1, z: -0.2, pointe: 16 * u }); const t = c.tronc(debout(c, {})); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.46, t.epaules.G.y + 0.26, 0.05), pole: V(s * 0.6, -1, -0.2), paume: V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'plat' }; return p; };
        for (const s of [1, -1]) fixe.push(pret(boite(0.1, 2.1, 0.1, s * 0.5, 1.05, 0.12, C.cadre, 0.3))); fixe.push(pret(boite(1.1, 0.1, 0.1, 0, 2.1, 0.12, C.cadre, 0.3)));
        d.vue = { az: 150, el: 8 }; return deux(cle(0), cle(1));
      }
      // Une main (ou l'avant-bras, coude à angle droit) contre un montant : le corps se détourne.
      const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8, lacet: -34 * u }); const t = c.tronc(debout(c, {})); p.bras.G = o.coude ? { prise: V(0.42, t.epaules.G.y + 0.27, 0.02), pole: V(0.3, -1, -0.5), paume: V(0, 0, 1), dirMain: V(0, 1, 0), doigts: 'plat' } : { prise: V(0.56, t.epaules.G.y + 0.02, 0.0), pole: V(0, -1, -0.3), paume: V(0, 0, 1), dirMain: V(1, 0.2, 0), doigts: 'plat' }; return p; };
      fixe.push(pret(boite(0.1, 2.1, 0.1, o.coude ? 0.47 : 0.66, 1.05, 0.1, C.cadre, 0.3)));
      d.vue = { az: 150, el: 8 }; return deux(cle(0), cle(1));
    }
    if (o.cou) {
      if (o.curl) {
        // Flexion de nuque, sur le dos, la tête dépassant du banc.
        const cle = u => { const p = allonge(c, { h: 0.44, angle: 0, d: -0.42, jambes: 'sol', cou: lerp(-24, 34, u) }); p.bras = mains(c, c.tronc(p), 'poitrine'); return p; };
        fixe.push(...poseFixe(MAT.banc(C, 0, 0.44, 0.62, 0.5)));
        d.rythme = 'rep'; d.vue = { az: 60, el: 14 }; return deux(cle(0), cle(1));
      }
      const cle = u => { const p = debout(c, { ecart: 0.11, ouv: 8 }); p.couIncl = 34 * u; const info = c.poser(p); if (u > 0.4) p.bras.G = { prise: info.tete.clone().add(V(-0.05, 0.19, 0.0)), pole: V(1, 0.5, -0.2), paume: V(-0.3, -1, 0), doigts: 'detendu' }; else p.bras.G = B(90, 150 * u / 0.4, 0, 60 * u / 0.4, 90, { doigts: 'detendu' }); return p; };
      d.cles = [0, 0.4, 1].map(u => [u, cle(u)]); d.vue = { az: 10, el: 6 }; return d;
    }
    if (o.rouleau) {
      // Auto-massage au rouleau : le corps va et vient dessus.
      // Zone par défaut, admise dans l'écriture : o.fessiers.
      d.rythme = 'continu'; d.periode = 2.6;
      if (o.pied) { const base = debout(c, { ecart: 0.1, ouv: 6 }); d.pose = ph => { const p = cloner(base), w = Math.sin(2 * Math.PI * ph); p.jambes.G = pied(c, 1, { x: 0.1, z: L.racine.z + L.hanche.z + 0.1 + 0.05 * w, y0: 0.045, pointe: 6 }); p.bras = mains(c, c.tronc(p), 'hanches'); return p; }; d.objets = (info, u, sortie) => sortie.push(pret(sphere(0.035, info.orteils.G.x, 0.035, info.chevilles.G.z + 0.06, C.ballon, 0))); d.vue = { az: 50, el: 10 }; return d; }
      const mollets = !!o.mollets;
      d.pose = ph => {
        const w = Math.sin(2 * Math.PI * ph), p = corps(qX(mollets ? -34 : -36), { lombaires: 10, cou: 8 });
        p.jambes = mollets ? pareil(J(56, 4, 0, 4, 10)) : { G: J(118, 6, 0, 128, 0), D: J(112, 28, 70, 100, 10) };
        p.bassin.pos = V(0, mollets ? 0.2 : 0.235, (mollets ? 0.07 : 0.05) * w);
        const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.25, 0.008, t.epaules.G.z - 0.12), pole: V(s * 0.2, 0.2, -1), paume: V(0, -1, 0), dirMain: V(s * 0.3, 0, -1), doigts: 'plat' };
        return p;
      };
      d.objets = (info, u, sortie) => { const z = mollets ? (info.chevilles.G.z + info.genoux.G.z) / 2 + 0.03 : 0.0, y = 0.07; sortie.push(pret(cyl(0.07, 0.42, 0, y, mollets ? 0.62 : 0, C.ballon, 0))); };
      d.vue = { az: 60, el: 14 }; return d;
    }
    throw new Error('etire : posture non décrite (' + (o._ || []).join(' ') + ')');
  };
