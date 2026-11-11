  /* ---------- Cardio et déplacements ----------
     course, marche (sur place ; tapis : sur un tapis roulant ; pente ; charge : hal, kb, uni → marche du fermier) ;
     velo (vélo d'appartement ; airbike : avec les bras) ; elliptique ; rameur ; skierg ; escalier (simulateur
     d'escalier) ; jacks (sauts écartés) ; burpee ; cordes (cordes ondulatoires) ; boxe (sac de frappe) ; kickboxing ;
     sauter (corde à sauter) ; traineau (poussée de traîneau). */
  FAM.cardio = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 62, el: 8 }, tenu: [], fixe, rythme: 'continu' };
    const TAU = 2 * Math.PI, sn = x => Math.sin(TAU * x), onde = x => 0.5 - 0.5 * Math.cos(TAU * x);

    if (o.course || o.marche || o.escalier || o.traineau) {
      // Une foulée : chaque jambe monte le genou, s'allonge vers l'avant, passe sous le corps puis derrière.
      const cours = !!o.course, y0 = o.tapis ? 0.14 : o.escalier ? 0.46 : 0, pente = o.pente ? 7 : 0, n = V(0, Math.cos(rad(pente)), -Math.sin(rad(pente)));
      const ampH = cours ? 34 : o.escalier ? 30 : 22, cH = cours ? 20 : o.escalier ? 34 : 9, ampG = cours ? 78 : o.escalier ? 62 : 38;
      const penche = (cours ? 9 : o.traineau ? 46 : 4) + pente * 0.6;
      const jambe = ph => { const h = cH + ampH * Math.sin(TAU * ph), g = 6 + ampG * Math.pow(0.5 + 0.5 * Math.sin(TAU * ph + 1.25), cours ? 1.4 : 1.8); return J(h + penche, 3, 0, g, cours ? 18 * (0.5 - 0.5 * Math.sin(TAU * ph)) : 6); };
      d.periode = cours ? 0.74 : o.escalier ? 1.5 : 1.15;
      const charge = o.hal || o.kb;
      d.pose = ph => {
        const p = { bassin: { pos: V(0, 1, 0), rot: qX(penche) }, lombaires: 2, thorax: 2, cou: -penche * 0.7, torsion: (cours ? 9 : 5) * sn(ph), bras: {}, jambes: { G: jambe(ph), D: jambe(ph + 0.5) } };
        const sw = (cours ? 38 : 20) * sn(ph);
        if (o.traineau) { const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.duThorax(V(s * 0.2, -0.12, 0.52)), pole: V(s * 0.5, -1, 0), paume: V(-s, 0, 0).applyQuaternion(t.qThorax), doigts: 'barre' }; }
        else if (o.escalier) { p.bras = pareil(B(20, 34, 0, 60, 90)); }
        else if (charge) { p.bras.D = (o.uni ? B(40, 10, 0, 16, 90, { doigts: 'detendu' }) : B(90, 5, 0, 5, 90)); p.bras.G = B(90, 5, 0, 5, 90); p.torsion *= 0.4; }
        else { p.bras.G = B(0, -sw * 0.9 + 4, 0, cours ? 88 : 22, 90, { doigts: cours ? 'poing' : 'detendu' }); p.bras.D = B(0, sw * 0.9 + 4, 0, cours ? 88 : 22, 90, { doigts: cours ? 'poing' : 'detendu' }); }
        c.poserSur(p, V(0, y0, 0), n, ['pied']);
        if (cours) p.bassin.pos.y += 0.035 * Math.pow(Math.abs(Math.cos(TAU * ph)), 2);
        return p;
      };
      if (charge) d.tenu = [{ t: o.kb ? 'kb' : 'haltere', m: o.uni ? 'G' : 'GD', k: 1.2 }];
      if (o.tapis) {
        // Tapis roulant : la bande, les montants, la console et ses poignées.
        const q = qX(-pente), pose = (f, x, y, z) => poserObjet([f], V(0, y0 - 0.07, 0).add(V(x, y, z).applyQuaternion(q)), q, fixe);
        pose(boite(0.62, 0.14, 1.75, 0, 0, 0, C.banc, 0), 0, 0, 0.1);
        for (const s of [1, -1]) { pose(boite(0.05, 1.2, 0.06, 0, 0, 0, C.cadre, 0.5), s * 0.33, 0.6, 0.9); pose(cyl(0.018, 0.5, 0, 0, 0, C.metal, 0.8, LONG_Z), s * 0.33, 1.05, 0.66); }
        pose(boite(0.72, 0.2, 0.06, 0, 0, 0, C.fonte, 0.2), 0, 1.22, 0.92);
      }
      if (o.escalier) {
        // Simulateur d'escalier : trois marches, deux rampes, une console.
        for (let k = -1; k < 3; k++) fixe.push(pret(boite(0.6, 0.2, 0.27, 0, y0 - 0.1 - k * 0.2, 0.04 - k * 0.27, C.banc, 0)));
        for (const s of [1, -1]) { fixe.push(pret(boite(0.05, y0 + 1.25, 0.06, s * 0.36, (y0 + 1.25) / 2, 0.66, C.cadre, 0.5))); fixe.push(pret(cyl(0.02, 0.6, s * 0.36, y0 + 1.02, 0.38, C.metal, 0.8, LONG_Z))); }
        fixe.push(pret(boite(0.78, 0.2, 0.06, 0, y0 + 1.25, 0.68, C.fonte, 0.2)), pret(boite(0.7, 0.05, 1.3, 0, 0.025, -0.1, C.cadre, 0.5)));
      }
      if (o.traineau) d.objets = (info, u, sortie) => { const mi = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5); for (const s of [1, -1]) sortie.push(pret(seg(V(s * 0.2, 0.06, mi.z + 0.12), V(s * 0.2, mi.y + 0.12, mi.z), 0.02, C.cadre, 0.5))); sortie.push(pret(boite(0.6, 0.06, 0.9, 0, 0.03, mi.z + 0.5, C.cadre, 0.5)), pret(cyl(0.2, 0.12, 0, 0.14, mi.z + 0.6, C.fonte, 0, DEBOUT_Q))); };
      d.vue = { az: 70, el: 8 }; return d;
    }
    if (o.velo || o.airbike) {
      // Assis sur la selle, les pieds tournent sur les pédales ; airbike : les mains poussent et tirent les leviers.
      const ax = V(0, 0.31, 0.1), R = 0.17, selle = V(0, 0.95, -0.2), gui = V(0, 1.1, 0.46);
      d.periode = o.airbike ? 0.9 : 1.1;
      d.pose = ph => {
        const p = { bassin: { pos: selle.clone().add(V(0, 0.07, 0)), rot: qX(36) }, lombaires: 8, thorax: 6, cou: -30, bras: {}, jambes: {} };
        for (const [k, s] of COTES) {
          const a = TAU * (ph + (k === 'D' ? 0.5 : 0)), pd = ax.clone().add(V(s * 0.12, R * Math.cos(a), R * Math.sin(a)));
          p.jambes[k] = { cheville: pd.clone().add(V(0, 0.105, -0.06)), pole: V(s * 0.08, 0.3, 1), pied: V(0, -0.22, 1), hautPied: V(0, 1, 0.22) };
          const pousse = o.airbike ? 0.13 * Math.cos(a) : 0;
          p.bras[k] = { prise: V(s * (o.airbike ? 0.25 : 0.2), gui.y + (o.airbike ? 0.04 : 0), gui.z + pousse), pole: V(s * 0.7, -0.7, -0.3), paume: o.airbike ? V(-s, 0, 0) : V(0, -1, 0.2), doigts: 'barre' };
        }
        return p;
      };
      // Le vélo : cadre, selle, guidon, roue d'inertie, pédalier.
      const tube = (a, b, r) => fixe.push(pret(seg(a, b, r || 0.022, C.cadre, 0.5)));
      tube(ax, selle, 0.024); tube(ax, V(0, 0.36, 0.72)); tube(V(0, 0.36, 0.72), V(0, gui.y - 0.02, gui.z + 0.02)); tube(V(0, 0.05, -0.42), ax); tube(V(0, 0.05, 0.86), V(0, 0.36, 0.72));
      fixe.push(pret(boite(0.17, 0.05, 0.27, selle.x, selle.y, selle.z, C.fonte, 0)), pret(cyl(0.26, o.airbike ? 0.05 : 0.08, 0, 0.36, 0.72, C.fonte, 0.2)), pret(boite(0.5, 0.04, 0.06, 0, 0.02, -0.42, C.cadre, 0.5)), pret(boite(0.5, 0.04, 0.06, 0, 0.02, 0.86, C.cadre, 0.5)));
      if (!o.airbike) fixe.push(pret(cyl(0.015, 0.46, gui.x, gui.y, gui.z, C.metal, 0.8)));
      d.objets = (info, u, sortie) => {
        for (const [k, s] of COTES) {
          const a = TAU * ((u || 0) + (k === 'D' ? 0.5 : 0)), pd = ax.clone().add(V(s * 0.12, R * Math.cos(a), R * Math.sin(a)));
          sortie.push(pret(seg(ax.clone().add(V(s * 0.07, 0, 0)), pd.clone().setX(s * 0.07), 0.012, C.metal, 0.8)), pret(boite(0.09, 0.02, 0.08, pd.x, pd.y, pd.z, C.fonte, 0)));
          if (o.airbike) sortie.push(pret(seg(V(s * 0.25, 0.45, 0.42), info.prises[k], 0.016, C.cadre, 0.5)));
        }
      };
      d.vue = { az: 68, el: 8 }; return d;
    }
    if (o.elliptique) {
      // Debout sur deux pédales qui décrivent une ellipse, les mains sur des leviers qui vont et viennent.
      d.periode = 1.3;
      const centre = V(0, 0.3, 0.02), pied = (a, s) => centre.clone().add(V(s * 0.13, 0.07 * Math.sin(a), 0.2 * Math.cos(a)));
      d.pose = ph => {
        const p = { bassin: { pos: V(0, 1.19, -0.04), rot: qX(8) }, lombaires: 2, thorax: 2, cou: -6, torsion: 6 * sn(ph), bras: {}, jambes: {} };
        for (const [k, s] of COTES) {
          const a = TAU * (ph + (k === 'D' ? 0.5 : 0)), pd = pied(a, s);
          p.jambes[k] = { cheville: pd.clone().add(V(0, 0.1, -0.05)), pole: V(0, 0.2, 1), pied: V(0, -0.1 - 0.12 * Math.sin(a), 1), hautPied: V(0, 1, 0.1) };
          p.bras[k] = { prise: V(s * 0.25, 1.22, 0.36 - 0.13 * Math.cos(a)), pole: V(s * 0.6, -1, -0.3), paume: V(-s, 0, 0), doigts: 'barre' };
        }
        return p;
      };
      fixe.push(pret(boite(0.5, 0.08, 1.5, 0, 0.04, 0.1, C.cadre, 0.5)), pret(boite(0.28, 0.5, 0.4, 0, 0.33, 0.72, C.fonte, 0.2)), pret(seg(V(0, 0.5, 0.75), V(0, 1.45, 0.6), 0.03, C.cadre, 0.5)), pret(boite(0.3, 0.2, 0.05, 0, 1.5, 0.6, C.fonte, 0.2)));
      d.objets = (info, u, sortie) => { for (const [k, s] of COTES) { const a = TAU * ((u || 0) + (k === 'D' ? 0.5 : 0)), pd = pied(a, s); sortie.push(pret(boite(0.12, 0.03, 0.34, pd.x, pd.y - 0.015, pd.z, C.banc, 0)), pret(seg(pd.clone().add(V(0, -0.02, 0.17)), V(s * 0.13, 0.42, 0.7), 0.014, C.cadre, 0.5)), pret(seg(V(s * 0.25, 0.5, 0.62), info.prises[k], 0.015, C.cadre, 0.5))); } };
      d.vue = { az: 70, el: 8 }; return d;
    }
    if (o.rameur) {
      // Assis sur le chariot : les jambes poussent, le buste bascule en arrière, les bras tirent la poignée au ventre.
      const hS = 0.3, cale = V(0, 0.34, 0.62);
      const cle = (jam, dos, tire) => {
        const p = { bassin: { pos: V(0, hS + 0.11, lerp(0.09, -0.235, jam)), rot: qX(lerp(22, -14, dos)) }, lombaires: lerp(10, 2, dos), thorax: 6, cou: -4, bras: {}, jambes: {} };
        const t = c.tronc(p);
        for (const [k, s] of COTES) {
          p.jambes[k] = { cheville: cale.clone().add(V(s * 0.11, 0.07, -0.05)), pole: V(s * 0.1, 1, 0.1), pied: V(0, 0.75, 0.66), hautPied: V(0, 0.66, -0.75) };
          const loin = V(s * 0.14, t.epaules.G.y - 0.26, t.epaules.G.z + 0.55), pres = t.duThorax(V(s * 0.14, -0.3, 0.16));
          p.bras[k] = { prise: loin.lerp(pres, tire), pole: V(s * 0.7, -0.4, -0.6), paume: V(0, -1, 0), doigts: 'barre' };
        }
        return p;
      };
      d.rythme = 'boucle'; d.periode = 2.6; d.cles = [[0, cle(0, 0, 0)], [0.22, cle(0.85, 0.25, 0)], [0.4, cle(1, 1, 1)], [0.5, cle(1, 1, 1)], [0.66, cle(1, 0.3, 0)], [1, cle(0, 0, 0)]];
      fixe.push(pret(boite(0.08, 0.06, 1.9, 0, hS - 0.1, -0.1, C.cadre, 0.5)), pret(boite(0.36, hS - 0.13, 0.06, 0, (hS - 0.13) / 2, -0.95, C.cadre, 0.5)), pret(cyl(0.26, 0.1, 0, 0.42, 1.05, C.fonte, 0.2)), pret(boite(0.4, 0.3, 0.08, 0, 0.2, 0.78, C.cadre, 0.5)), pret(boite(0.34, 0.02, 0.3, 0, cale.y - 0.02, cale.z, C.banc, 0, qX(-42))));
      d.objets = (info, u, sortie) => { const mi = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5); sortie.push(pret(seg(V(0, 0.55, 0.95), mi, 0.004, C.cable, 0.6)), pret(seg(info.prises.G.clone().add(V(0.07, 0, 0)), info.prises.D.clone().add(V(-0.07, 0, 0)), 0.014, C.metal, 0.8)), pret(boite(0.26, 0.05, 0.24, 0, hS - 0.045, info.bassin.z - 0.02, C.fonte, 0))); };
      d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.skierg) {
      // Debout face à l'appareil : les bras tirent deux poignées du dessus de la tête jusqu'aux hanches, le buste plonge.
      const anc = s => V(s * 0.16, 2.05, 0.62);
      const cle = u => {
        const p = debout(c, { ecart: 0.14, ouv: 8, dy: -0.02 - 0.13 * u, dz: -0.1 * u, penche: lerp(4, 46, u), cou: -lerp(0, 20, u) });
        const t = c.tronc(p);
        for (const [k, s] of COTES) { const hautP = V(s * 0.17, t.epaules.G.y + 0.5, t.epaules.G.z + 0.26), basP = t.hanches[k].clone().add(V(s * 0.12, -0.06, 0.02)); p.bras[k] = { prise: hautP.lerp(basP, u), pole: V(s * 0.6, 0, -0.8), paume: V(-s, 0, 0), doigts: 'barre' }; }
        return p;
      };
      d.rythme = 'rep'; d.periode = 2; d.cles = [0, 0.33, 0.66, 1].map(u => [u, cle(u)]);
      d.tenu = [{ t: 'cable', de: anc(1), m: 'G', bout: 'poignee' }, { t: 'cable', de: anc(-1), m: 'D', bout: 'poignee' }];
      fixe.push(pret(boite(0.34, 2.15, 0.1, 0, 1.075, 0.72, C.cadre, 0.5)), pret(cyl(0.2, 0.12, 0, 1.75, 0.72, C.fonte, 0.2)), pret(boite(0.6, 0.04, 0.9, 0, 0.02, 0.35, C.cadre, 0.5)));
      d.vue = { az: 66, el: 8 }; return d;
    }
    if (o.jacks) {
      // Sauts écartés : bras et jambes s'ouvrent et se referment, avec un petit rebond.
      d.periode = 1.0;
      d.pose = ph => { const w = onde(ph), p = { bassin: { pos: V(0, 1, 0), rot: qX(2) }, lombaires: 0, thorax: 0, cou: 0, bras: pareil(B(90, lerp(8, 168, w), 0, 8, lerp(90, 0, w), { doigts: 'plat' })), jambes: pareil(J(2, lerp(2, 24, w), 0, 6, 14)) }; c.poserSur(p, V(), AY, ['pied']); p.bassin.pos.y += 0.05 * Math.pow(Math.sin(TAU * ph), 2); return p; };
      d.vue = { az: 12, el: 8 }; return d;
    }
    if (o.sauter) {
      // Corde à sauter : petits sauts pieds joints, les poignets font tourner la corde.
      d.periode = 0.5;
      d.pose = ph => { const p = { bassin: { pos: V(0, 1, 0), rot: qX(3) }, lombaires: 0, thorax: 0, cou: 0, bras: pareil(B(70, 22, 30, 78, 60, { poignet: 14 * sn(ph), doigts: 'poing' })), jambes: pareil(J(8, 2, 0, 16, 34)) }; c.poserSur(p, V(), AY, ['pied']); p.bassin.pos.y += 0.07 * onde(ph); return p; };
      d.objets = (info, u, sortie) => {
        // La corde : un arc entre les deux mains, qui passe sous les pieds puis au-dessus de la tête.
        const a = TAU * (u || 0) + Math.PI, g = info.prises.G, dr = info.prises.D, N = 14, ray = 1.05;
        let prec = g;
        for (let i = 1; i <= N; i++) { const x = i / N, pt = g.clone().lerp(dr, x), bombe = Math.sin(Math.PI * x) * ray; pt.y += -bombe * Math.cos(a) + 0.02; pt.z += bombe * Math.sin(a); if (i === N) pt.copy(dr); sortie.push(pret(seg(prec, pt, 0.004, C.sangle, 0))); prec = pt; }
      };
      d.vue = { az: 30, el: 8 }; return d;
    }
    if (o.cordes) {
      // Cordes ondulatoires : demi-squat, les bras montent et descendent tour à tour, l'onde court le long des cordes.
      const base = debout(c, { ecart: 0.22, ouv: 14, dy: -0.2, dz: -0.12, penche: 26, cou: -18 });
      d.periode = 0.7;
      d.pose = ph => { const p = cloner(base); p.bras.G = B(6, 44 + 26 * sn(ph), 0, 34, 150, { doigts: 'barre' }); p.bras.D = B(6, 44 - 26 * sn(ph), 0, 34, 150, { doigts: 'barre' }); return p; };
      d.objets = (info, u, sortie) => { for (const [k, s] of COTES) { const de = info.prises[k], a = V(s * 0.12, 0.03, 2.9), N = 12; let prec = de; for (let i = 1; i <= N; i++) { const x = i / N, pt = de.clone().lerp(a, x); pt.y = Math.max(0.03, de.y * (1 - x) * (1 - x) + 0.03 + 0.2 * (1 - x) * Math.sin(TAU * ((u || 0) * (k === 'G' ? 1 : 1) - x * 1.6) + (k === 'D' ? Math.PI : 0)) * Math.sin(Math.PI * Math.min(1, x * 3))); sortie.push(pret(seg(prec, pt, 0.019, C.sangle, 0))); prec = pt; } } };
      d.vue = { az: 118, el: 12 }; return d;
    }
    if (o.boxe || o.kickboxing) {
      // En garde, pied gauche devant : direct du gauche, direct du droit (le buste tourne) ; kickboxing : puis un coup de pied.
      const garde = () => { const p = debout(c, { ecart: 0.13, ouv: 6, dy: -0.06, lacet: 0 }); p.jambes.G = pied(c, 1, { x: 0.13, z: 0.2, ouv: 4 }); p.jambes.D = pied(c, -1, { x: -0.15, z: -0.2, ouv: 32, pointe: 18 }); p.torsion = -16; p.cou = 4; p.couRot = 14; p.bras.G = B(14, 46, -20, 122, 90, { doigts: 'poing' }); p.bras.D = B(8, 30, -28, 138, 90, { doigts: 'poing' }); return p; };
      const g0 = garde(), jab = garde(), droit = garde();
      jab.torsion = -26; jab.bras.G = B(-8, 86, 0, 6, 170, { doigts: 'poing' });
      droit.torsion = 30; droit.couRot = -24; droit.bras.D = B(-10, 86, 0, 6, 170, { doigts: 'poing' }); droit.jambes.D = pied(c, -1, { x: -0.15, z: -0.18, ouv: 6, pointe: 40 });
      d.rythme = 'boucle';
      if (o.kickboxing) {
        const kick = garde(); kick.bassin.rot = qX(-12); kick.lombaires = 8; kick.torsion = 0; kick.jambes.D = J(96, 6, 0, 14, 20); kick.bassin.pos.y += 0.04;
        const arme = garde(); arme.jambes.D = J(92, 6, 0, 108, 30);
        d.periode = 3.6; d.cles = [[0, g0], [0.1, jab], [0.2, g0], [0.32, droit], [0.44, g0], [0.56, arme], [0.66, kick], [0.76, arme], [0.9, g0], [1, g0]];
      } else { d.periode = 2.2; d.cles = [[0, g0], [0.16, jab], [0.32, g0], [0.52, droit], [0.72, g0], [1, g0]]; }
      if (o.boxe) { const z = 0.99; fixe.push(pret(cyl(0.19, 1.0, 0.04, 1.2, z, C.banc, 0, DEBOUT_Q)), pret(seg(V(0.04, 1.7, z), V(0.04, 2.6, z), 0.006, C.cable, 0.6))); }
      d.vue = { az: 58, el: 8 }; return d;
    }
    if (o.burpee) {
      // Debout, accroupi mains au sol, planche, accroupi, saut bras en l'air.
      const droit = debout(c, { ecart: 0.12, ouv: 8 });
      const pl = planche(c, { ecartPieds: 0.1 }), A = L.bras + L.avantBras, hE = 0.024 + 0.95 * A, plc = pl(hE), zM = plc.epaules.G.z + L.main;
      const mainsSol = p => { for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.24, 0.008, zM), pole: V(s * 0.6, 0.5, -0.8), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      mainsSol(plc);
      const accroupi = { bassin: { pos: V(0, 0.36, zM - 0.62), rot: qX(52) }, lombaires: 16, thorax: 10, cou: -30, bras: {}, jambes: {} };
      for (const [k, s] of COTES) accroupi.jambes[k] = pied(c, s, { x: s * 0.2, z: zM - 0.52, ouv: 16, pointe: 34 });
      mainsSol(accroupi);
      // Debout au même endroit que l'accroupi, puis le saut.
      const deb = debout(c, { ecart: 0.2, ouv: 16 }); deb.bassin.pos.z += zM - 0.52 - deb.jambes.G.cheville.z; for (const k of ['G', 'D']) deb.jambes[k].cheville.z += zM - 0.52 - deb.jambes[k].cheville.z;
      const saut = cloner(deb); saut.bassin.pos.y += 0.2; for (const [k, s] of COTES) { saut.jambes[k] = pied(c, s, { x: s * 0.2, z: zM - 0.52, ouv: 16, pointe: 55, y0: 0.2 }); } saut.bras = pareil(B(30, 172, 0, 6, 90, { doigts: 'plat' }));
      d.rythme = 'boucle'; d.periode = 3.8;
      d.cles = [[0, deb], [0.06, deb], [0.2, accroupi], [0.36, plc], [0.46, plc], [0.62, accroupi], [0.76, deb], [0.86, saut], [0.96, deb], [1, deb]];
      d.vue = { az: 70, el: 10 }; return d;
    }
    throw new Error('cardio : mouvement non décrit (' + (o._ || []).join(' ') + ')');
  };
