
  /* Abdominaux au sol, sur banc ou à la poulie.
     Couché : crunch (défaut), situp (relevé de buste complet), vup, toucher (jambes à la verticale, les mains vont
     aux pieds), inverse (crunch inversé), jambes (relevé de jambes tendues), velo, battements, ciseaux, chevilles
     (taps de cheville), grenouille, deadbug, hollow (tenue), dragon (drapeau du dragon), chandelle, lateral (couché
     sur le côté). Assis par terre : genoux (ramené de genoux), inout, vsit. Options : decline (banc décliné),
     incline (banc incliné, pour les relevés de jambes), ballon, leste, tendus (bras tendus avec un poids), torsion.
     À la poulie ou à l'élastique : poulie genoux (défaut) / debout / assis ; machine (assis) ; vacuum (debout). */
  FAM.abdos = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 68, el: 16 }, tenu: [], fixe };
    const mainsDe = (p, ou) => { const t = c.tronc(p); if (ou === 'tendus') return pareil(B(0, 96, -6, 6, 90)); if (ou === 'long') return pareil(B(90, 18, 0, 6, 180, { doigts: 'plat' })); if (ou === 'haut') return pareil(B(10, 168, 0, 6, 180, { doigts: 'detendu' })); return mains(c, t, ou); };
    const ou = o.tendus ? 'tendus' : o.leste || o.poitrine ? 'poitrine' : 'oreilles';
    const poids = () => { if (o.leste || o.tendus) d.tenu = [{ t: 'disque', m: 'GD', r: 0.13, axe: o.tendus ? AX : 'buste' }]; };
    if (o.vacuum) {
      const cle = u => { const p = debout(c, { penche: 6, ecart: 0.1 }); p.lombaires = 4 + 6 * u; p.thorax = 3 * u; p.bras = mains(c, c.tronc(p), 'hanches'); return p; };
      d.a = cle(0); d.b = cle(1); d.rythme = 'tenue'; d.vue = { az: 60, el: 8 }; return d;
    }
    if (o.machine) {
      // Assis à la machine : les mains tiennent les poignées près de la tête, le buste s'enroule vers les genoux.
      const base = assis(c, { h: H_SIEGE, zPieds: 0.36 });
      const cle = u => { const p = cloner(base); p.lombaires = 34 * u; p.thorax = 22 * u; p.cou = 10 * u; p.bras = pareil(B(20, 120, 20, 120, 90)); return p; };
      d.a = cle(0); d.b = cle(1); fixe.push(...poseFixe(MAT.siege(C, H_SIEGE, 0.55, 4))); d.vue = { az: 66, el: 10 };
      d.tenu = [{ t: 'levier', de: () => V(0.2, 1.75, -0.15), m: 'G' }, { t: 'levier', de: () => V(-0.2, 1.75, -0.15), m: 'D' }]; return d;
    }
    if (o.poulie || o.elas) {
      // La corde tenue de part et d'autre de la tête : le buste s'enroule, les hanches ne bougent presque pas.
      const sorte = o.debout ? 'debout' : o.assis ? 'assis' : 'genoux';
      const base = sorte === 'debout' ? debout(c, { ecart: 0.12 }) : sorte === 'assis' ? assis(c, { h: H_BANC }) : aGenoux(c, { penche: 8 });
      if (sorte === 'assis') fixe.push(...bancAssis(C));
      const dos = o.debout || o.assis;                          // dos à la poulie (debout, assis) ou face à elle (à genoux)
      const cle = u => { const p = cloner(base); p.lombaires = (sorte === 'genoux' ? 44 : 34) * u; p.thorax = 24 * u; p.cou = 8 * u; if (o.lateral) { p.lombaires = 6 * u; p.thorax = 0; p.inclinaison = 30 * u; } if (o.torsion) p.torsion = 34 * u; if (sorte === 'genoux' && !o.lateral) { p.bassin.rot = qX(8 + 16 * u); p.jambes = pareil(J(8 + 16 * u + 14 * u, 6, 0, 90 + 14 * u, 62)); } const t = c.tronc(p), dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax), dC = (x, y, z) => V(x, y, z).applyQuaternion(t.qTete); /* les poings de part et d'autre du front, à hauteur des tempes : ils suivent la tête, les épaules restent basses */ for (const [k, s] of COTES) p.bras[k] = { prise: t.tete.clone().add(dC(s * 0.12, 0.105, dos ? 0.0 : 0.075)), pole: dT(s * 1, -0.6, 0.3), paume: dC(-s, 0, 0), dirMain: dC(0, 1, dos ? -0.2 : 0.25), doigts: 'barre', ceinture: 0.1 }; return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; if (sorte === 'genoux') for (const [, p] of d.cles) c.poserSur(p, V(), AY, ['jambe', 'pied']);
      const anc = dos ? V(0, sorte === 'assis' ? 1.75 : 2.05, -0.55) : V(0, 2.0, 0.55);
      d.tenu = [{ t: o.elas ? 'elastique' : 'cable', de: anc, bout: 'corde' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); d.vue = { az: 68, el: 8 }; return d;
    }
    if (o.lateral) {
      // Couché sur le côté : le buste se soulève de côté.
      const base = surLeCote(c, { cote: 'D', jambes: J(30, 0, 0, 50, 20) });
      const cle = u => { const p = cloner(base); p.inclinaison = -26 * u; p.lombaires = 4; const t = c.tronc(p); p.bras.G = mains(c, t, 'oreilles').G; p.bras.D = { prise: V(t.epaules.D.x - 0.04, 0.03, t.epaules.D.z + 0.42), pole: V(0, 1, 0.3), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      d.a = cle(0); d.b = cle(1); d.vue = { az: 0, el: 24 }; return d;
    }
    if (o.genoux || o.inout || o.vsit || o.assisJambes || o.cercles || (o.battements && o.assis)) {
      // Assis par terre, buste incliné vers l'arrière, mains posées derrière : les genoux viennent à la poitrine, repartent.
      const cle = u => { const recul = o.vsit ? lerp(62, 32, u) : o.genoux ? lerp(48, 28, u) : 40, p = assisSol(c, { recul, jambes: J(lerp(o.vsit ? 30 + 62 : 50 + recul - 10, o.vsit ? 78 + 32 : 96 + recul, u) - 0, 4, 0, lerp(o.vsit ? 4 : 14, o.vsit ? 4 : 110, u), 25), lomb: 10 + 10 * u, thor: 6 }); if (o.assisJambes) p.jambes = pareil(J(lerp(50, 96, u) + 40, 4, 0, 4, 25)); c.poserSur(p, V(), AY, ['bassin']); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = o.vsit ? B(4, 60, 0, 8, 90, { doigts: 'detendu' }) : { prise: V(s * 0.2, 0, p.bassin.pos.z - 0.17), pole: V(s * 0.5, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' }; return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; d.vue = { az: 112, el: 14 };
      if (o.alt) { d.rythme = 'alt'; d.alterne = ['jambes']; d.a = cle(0); d.b = cle(1); delete d.cles; }   // une jambe puis l'autre
      if (o.battements) { d.rythme = 'continu'; d.periode = 1.3; const P0 = cle(0.5); delete d.cles; d.pose = ph => { const p = cloner(P0), sn = Math.sin(ph * 2 * Math.PI); p.jambes = { G: J(94 + 10 * sn, 4, 0, 6, 25), D: J(94 - 10 * sn, 4, 0, 6, 25) }; return p; }; }
      if (o.cercles) { d.rythme = 'continu'; d.periode = 2.6; const P0 = cle(0.5); d.pose = ph => { const p = cloner(P0), w = ph * 2 * Math.PI; p.jambes = pareil(J(118 + 18 * Math.cos(w), 4 + 0 * w, 0, 30, 25)); p.jambes.G.abd = 4 + 14 * Math.sin(w); p.jambes.D.abd = 4 - 14 * Math.sin(w); return p; }; }
      return d;
    }
    // Couché sur le dos : par terre, sur banc décliné ou incliné, ou sur un ballon.
    const ang = o.decline ? -24 : o.incline ? 26 : 0, h = ang ? 0.44 : 0;
    if (ang) fixe.push(...poseFixe(MAT.banc(C, ang)));
    const coucher = jb => allonge(c, { h, angle: ang, jambes: jb || (ang < 0 ? 'sol' : 'plies'), lomb: 0, thor: 0, cou: 6, d: ang < 0 ? -0.2 : ang > 0 ? 0.25 : -0.2 });   // décliné : genoux et chevilles dans les boudins
    if (o.ballon) {
      // Sur un ballon, le bas du dos appuyé : le buste part en extension puis s'enroule.
      const base = { bassin: { pos: V(0, 0.62, 0), rot: qX(-74) }, lombaires: -14, thorax: -8, cou: 6, bras: pareil(brasRepos()), jambes: { G: pied(c, 1, { x: 0.2, ouv: 14, z: 0.52, pole: V(0.2, 1, 0.3) }), D: pied(c, -1, { x: -0.2, ouv: 14, z: 0.52, pole: V(-0.2, 1, 0.3) }) } };
      const cle = u => { const p = cloner(base); p.lombaires = lerp(-14, 22, u); p.thorax = lerp(-8, 20, u); p.cou = lerp(0, 12, u); p.bras = mainsDe(p, ou); return p; };
      d.a = cle(0); d.b = cle(1); fixe.push(pret(sphere(0.3, 0, 0.3, -0.16, C.ballon, 0))); poids(); return d;
    }
    if (o.situp) {
      // Relevé de buste : tout le buste se redresse jusqu'à la position assise ; les fesses ne décollent pas.
      const base = coucher(), hanche = c.tronc(base).hanches.G.clone();
      const cle = u => { const p = cloner(base); p.bassin.rot = qX(lerp(-90 + ang, -18, u)); p.lombaires = 18 * Math.sin(Math.PI * u) + 8 * u; p.thorax = 14 * Math.sin(Math.PI * u) + 4 * u; p.cou = 8 * (1 - u); if (o.torsion) p.torsion = 38 * u; ancrer(c, p, 'femur.G', hanche); p.bras = mainsDe(p, ou); return p; };
      d.cles = [[0, cle(0)], [0.25, cle(0.25)], [0.5, cle(0.5)], [0.75, cle(0.75)], [1, cle(1)]]; poids(); return d;
    }
    if (o.vup || o.toucher) {
      const base = coucher(o.toucher ? J(90, 3, 0, 4, 20) : 'tendues');
      const cle = u => { const p = cloner(base); if (o.toucher) { p.lombaires = 22 * u; p.thorax = 24 * u; p.cou = 12 * u; p.bras = pareil(B(0, lerp(96, 88, u), 0, 6, 180, { doigts: 'detendu' })); } else { p.bassin.rot = qX(lerp(-90, -52, u)); p.lombaires = 14 * u; p.thorax = 10 * u; p.jambes = pareil(J(lerp(0, 92, u), 3, 0, 4, 25)); p.bras = pareil(B(8, lerp(172, 74, u), 0, 6, 180, { doigts: 'detendu' })); c.poserSur(p, V(), AY, ['bassin', 'dos']); } return p; };
      d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; return d;
    }
    if (o.jambes || o.inverse || o.dragon || o.chandelle) {
      const base = coucher(o.inverse ? J(96, 3, 0, 86, 20) : 'tendues');
      if (o.dragon || o.chandelle) {
        // Le corps, tendu, pivote autour des épaules (les mains tiennent le banc derrière la tête, ou soutiennent le dos).
        const cle = u => { const phi = o.chandelle ? 80 + 3 * u : lerp(8, 68, u), p = { bassin: { pos: V(0, 0.4, 0), rot: qX(-90 - phi) }, lombaires: o.chandelle ? 6 : 0, thorax: o.chandelle ? 18 : 4, cou: o.chandelle ? 52 : 24, bras: {}, jambes: pareil(J(o.chandelle ? 6 : 2, 3, 0, 3, 30)) }; ancrer(c, p, 'cou1', V(0, (o.chandelle ? 0 : 0.44) + 0.09, -0.4)); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = o.chandelle ? { prise: t.duBassin(V(s * 0.12, 0.12, -L.dos - 0.02)), pole: V(s * 0.6, -1, 0), paume: V(0, 0, 1).applyQuaternion(t.qBassin), doigts: 'plat' } : { prise: V(s * 0.16, 0.4, -0.72), pole: V(s * 1, 0.3, -0.3), paume: V(-s, 0, 0), doigts: 'barre' }; return p; };
        d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]]; if (o.chandelle) d.rythme = 'tenue'; else fixe.push(...poseFixe(MAT.banc(C, 0))); d.vue = { az: 112, el: 12 }; return d;
      }
      const cle = u => { const p = cloner(base); if (o.inverse) { p.bassin.rot = qX(-90 + ang - 30 * u); p.lombaires = 16 * u; p.jambes = pareil(J(lerp(96, 112, u), 3, 0, 86, 20)); ancrer(c, p, 'thorax', c.tronc(base) && c.monde('thorax')); } else p.jambes = pareil(J(lerp(ang > 0 ? 8 : 6, 92, u) - ang * 0, 3, 0, 4, 25)); p.bras = ang > 0 ? pareil(B(0, 170, 0, 30, 90)) : mainsDe(p, 'long'); return p; };
      const tA = c.tronc(base), ancreT = c.monde('thorax');
      const cle2 = u => { const p = cloner(base); if (o.inverse) { p.bassin.rot = qX(-90 + ang - 30 * u); p.lombaires = 30 * u; p.jambes = pareil(J(lerp(96, 112, u), 3, 0, 86, 20)); ancrer(c, p, 'thorax', ancreT); } else p.jambes = pareil(J(lerp(6, 92, u), 3, 0, 4, 25)); p.bras = ang > 0 ? pareil(B(0, 170, 0, 30, 90)) : mainsDe(p, 'long'); return p; };
      d.cles = [[0, cle2(0)], [0.5, cle2(0.5)], [1, cle2(1)]]; if (o.leste) d.objets = (info, u, sortie) => poserObjet(MAT.haltere(C, 1), info.chevilles.G.clone().add(info.chevilles.D).multiplyScalar(0.5), null, sortie); return d;
    }
    if (o.velo || o.battements || o.ciseaux || o.deadbug) {
      const base = coucher('levees'); d.rythme = 'continu'; d.periode = o.deadbug ? 3.6 : o.velo ? 2 : 1.3;
      d.pose = ph => {
        const p = cloner(base), w = ph * 2 * Math.PI, sn = Math.sin(w), g = 0.5 + 0.5 * sn, dr = 0.5 - 0.5 * sn;
        if (o.velo) { p.lombaires = 20; p.thorax = 22; p.cou = 10; p.torsion = 34 * sn; p.jambes.G = J(lerp(34, 104, dr), 3, 0, lerp(10, 104, dr), 20); p.jambes.D = J(lerp(34, 104, g), 3, 0, lerp(10, 104, g), 20); p.bras = mainsDe(p, 'oreilles'); }
        else if (o.battements) { p.lombaires = 8; p.jambes.G = J(22 + 14 * sn, 3, 0, 4, 30); p.jambes.D = J(22 - 14 * sn, 3, 0, 4, 30); p.bras = mainsDe(p, 'long'); }
        else if (o.ciseaux) { p.lombaires = 8; p.jambes.G = J(30, 6 + 16 * sn, 0, 4, 30); p.jambes.D = J(30, 6 + 16 * sn, 0, 4, 30); p.jambes.G.flex = 30 + 5 * sn; p.jambes.D.flex = 30 - 5 * sn; p.bras = mainsDe(p, 'long'); }
        else {
          p.jambes.G = J(lerp(90, 14, g), 3, 0, lerp(90, 6, g), 20); p.jambes.D = J(lerp(90, 14, dr), 3, 0, lerp(90, 6, dr), 20);
          if (o.balle) { const t = c.tronc(p), e = t.epaules.G; for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.108, e.y + 0.54, e.z + 0.02), pole: V(s, 0, 0.35), paume: V(-s, 0, 0), dirMain: V(0, 1, 0), doigts: 'plat' }; }
          else { p.bras.D = B(0, lerp(92, 172, g), 0, 6, 90, { doigts: 'detendu' }); p.bras.G = B(0, lerp(92, 172, dr), 0, 6, 90, { doigts: 'detendu' }); }
        }
        return p;
      };
      if (o.balle) d.tenu = [{ t: 'balle', m: 'GD', r: 0.11 }];   // le ballon tenu au-dessus de la poitrine, bras tendus
      return d;
    }
    if (o.hollow) {
      const cle = u => { const p = coucher('tendues'); p.lombaires = 12 + 2 * u; p.thorax = 10; p.cou = 8; p.jambes = pareil(J(20 + 2 * u, 3, 0, 4, 30)); p.bras = pareil(B(6, 160, 0, 6, 90, { doigts: 'detendu' })); return p; };
      d.a = cle(0); d.b = cle(1); d.rythme = 'tenue'; if (o.leste) d.tenu = [{ t: 'disque', m: 'GD', r: 0.13, axe: AX }]; return d;
    }
    // Crunch : les épaules décollent, le bas du dos reste au sol.
    const base = coucher(o.grenouille ? null : o.jambesHautes ? 'levees' : null);
    if (o.grenouille) for (const [k, s] of COTES) base.jambes[k] = { cheville: V(s * 0.035, 0.05, base.bassin.pos.z + 0.36), pole: V(s * 1, 0.4, 0.15), pied: V(-s * 0.1, 0.1, 1), hautPied: V(s * 1, 0.2, 0) };
    const cle = (u, cote) => { const p = cloner(base); p.lombaires = (ang < 0 ? 30 : 20) * u; p.thorax = 26 * u; p.cou = 6 + 10 * u; if (o.torsion) p.torsion = 32 * u * (cote || 1); if (o.chevilles) { p.lombaires = 12; p.thorax = 12; p.inclinaison = 24 * u * (cote || 1); p.bras = pareil(B(62, 22, 0, 6, 180, { doigts: 'detendu' })); } else p.bras = mainsDe(p, ou); return p; };
    if (o.chevilles || o.alt) { d.rythme = 'alt'; d.pose = (uG, uD) => (uD > 0 ? cle(uD, -1) : cle(uG || 0, 1)); }
    else d.cles = [[0, cle(0)], [0.5, cle(0.5)], [1, cle(1)]];
    poids(); return d;
  };
