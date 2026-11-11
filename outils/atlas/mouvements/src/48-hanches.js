
  /* Soulevés de terre et autres charnières de hanche : le buste bascule autour des hanches, dos droit.
     (défaut) soulevé de terre barre depuis le sol ; sumo ; roumain (la barre descend à mi-tibia, genoux à peine
     pliés) ; tendues (jambes tendues) ; deficit ; blocs (barre surélevée) ; trapbar ; hal ; kb (un kettlebell tenu
     à deux mains) ; unejambe ; bstance ; goodmorning (barre sur le dos ; assis) ; poulie (tirage entre les jambes) ;
     charniere (au poids du corps) ; jefferson (dos qui s'enroule) ; swing (balancement du kettlebell ; uni) ;
     extension (banc à lombaires ; machine) ; smith ; ceinture. */
  FAM.souleve = (c, o, C) => {
    const L = c.L, rayon = 0.0135, z0 = L.racine.z + L.hanche.z;
    const fixe = [], d = { vue: { az: 128, el: 10 }, tenu: [], fixe };
    if (o.extension) {
      // Banc à lombaires : hanches calées, jambes tenues ; le buste descend puis remonte à l'alignement.
      const ang = o.machine ? 0 : 42;
      const cle = u => { const p = { bassin: { pos: V(0, 0.9, 0), rot: qX(ang + 10) }, lombaires: lerp(34, -4, u), thorax: lerp(14, -2, u), cou: lerp(8, -10, u), bras: {}, jambes: pareil(J(lerp(52, 8, u) * 0 + 10 + (ang ? 0 : 0), 4, 0, 4, 25)) }; p.bassin.rot = qX(lerp(ang + 62, ang + 6, u)); p.jambes = pareil(J(lerp(62, 6, u), 4, 0, 4, 25)); const t = c.tronc(p); p.bras = o.hal ? { G: { prise: t.duThorax(V(0.05, -0.12, 0.2)), pole: V(0.6, -1, 0).applyQuaternion(t.qThorax), paume: V(-1, 0, 0).applyQuaternion(t.qThorax), doigts: 'barre' }, D: { prise: t.duThorax(V(-0.05, -0.12, 0.2)), pole: V(-0.6, -1, 0).applyQuaternion(t.qThorax), paume: V(1, 0, 0).applyQuaternion(t.qThorax), doigts: 'barre' } } : mains(c, t, 'poitrine'); return p; };
      if (o.machine) {
        // À la machine, assis : le buste part penché en avant et pousse le coussin vers l'arrière.
        const base = assis(c, { h: 0.5, zPieds: 0.34 });
        d.pose = u => { const p = cloner(base); p.bassin.rot = qX(lerp(34, -18, u)); p.lombaires = lerp(10, -4, u); const t = c.tronc(p); p.bras = mains(c, t, 'poitrine'); return p; };
        fixe.push(...poseFixe(MAT.siege(C, 0.5)));
        d.objets = (info, u, sortie) => { const e = info.epaules.G.clone().add(info.epaules.D).multiplyScalar(0.5), q = info.qThorax, pp = e.clone().add(V(0, -0.08, -0.17).applyQuaternion(q)); sortie.push({ forme: 'cylindre', s: [0.06, 0.4, 0.06], p: [pp.x, pp.y, pp.z], q: [COUCHE.x, COUCHE.y, COUCHE.z, COUCHE.w], couleur: C.banc, metal: 0 }); };
        d.vue = { az: 70, el: 10 }; return d;
      }
      // Les pieds sont tenus au sol derrière, les cuisses appuyées sur le coussin incliné.
      const piedsF = { G: pied(c, 1, { x: 0.12, z: -0.62, ouv: 0, pointe: 0 }), D: pied(c, -1, { x: -0.12, z: -0.62, ouv: 0, pointe: 0 }) };
      d.pose = u => { const p = cle(u); p.bassin.pos = V(0, 0.93, 0); p.jambes = cloner(piedsF); for (const k of ['G', 'D']) p.jambes[k].pole = V(0, 0.2, 1); return p; };
      fixe.push(pret(boite(0.4, 0.07, 0.36, 0, 0.78, 0.16, C.banc, 0, qX(-42))), pret(seg(V(0, 0, -0.1), V(0, 0.72, 0.16), 0.03, C.cadre, 0.5)), pret(cyl(0.045, 0.4, 0, 0.2, -0.72, C.banc, 0)), pret(seg(V(0, 0, -0.1), V(0, 0.2, -0.72), 0.03, C.cadre, 0.5)), pret(boite(0.5, 0.03, 1.0, 0, 0.015, -0.3, C.cadre, 0.5)));
      if (o.hal) d.tenu = [{ t: 'disque', m: 'GD', r: 0.13, axe: AZ }];
      d.vue = { az: 70, el: 10 }; return d;
    }
    if (o.swing) {
      // Balancement du kettlebell : il passe entre les jambes puis monte devant, bras tendus, par un coup de hanches.
      const m = coteDe(o);
      const cle = u => { const k = 1 - u, p = debout(c, { dy: -0.1 * k, dz: -0.3 * k, penche: 4 + 58 * k, lomb: 2 * k, cou: -30 * k, ecart: 0.2, ouv: 16 }); const br = B(0, lerp(-8 - 58, 88, u) + (4 + 58 * k) * 0, -10, 6, 180); p.bras = pareil(B(m === 'GD' ? -4 : 0, lerp(-70 + 62, 90, u), m === 'GD' ? -16 : 0, 6, 180)); if (m !== 'GD') p.bras.D = B(70, 30, 0, 20, 90, { doigts: 'detendu' }); return p; };
      d.pose = cle; d.tenu = [{ t: 'kb', m: 'G', sens: 'bas' }];
      d.objets = null; d.rythme = 'rep'; d.periode = 2.2;
      // La boule prolonge les bras (elle ne pend pas à la verticale pendant le balancement).
      d.tenu = []; d.objets = (info, u, sortie) => { const pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises.G, dir = info.dirMains.G; poserObjet(MAT.kettlebell(C), pr, qTenu(AX, dir.clone().multiplyScalar(-1)), sortie); };
      return d;
    }
    if (o.goodmorning) {
      if (o.assis) { const base = assis(c, { h: 0.45, ecart: 0.26, ouv: 20, zPieds: 0.36 }); fixe.push(...poseFixe(MAT.banc(C, 0), V(0, 0, 0.28))); d.pose = u => { const p = cloner(base); p.bassin.rot = qX(lerp(2, 62, u)); p.lombaires = 3 * u; p.cou = -30 * u; porter(c, p, { barre: true }, C); return p; }; }
      else d.pose = u => { const p = debout(c, { dy: -0.03 * u, dz: -0.2 * u, penche: 2 + 68 * u, lomb: 3 * u, thor: 3 * u, cou: -36 * u, ecart: 0.14, ouv: 10 }); porter(c, p, o.smith ? { smith: true } : { barre: true }, C); return p; };
      d.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.2 }];
      if (o.smith) { const info = c.poser(d.pose(0)); fixe.push(...poseFixe(MAT.smith(C, info.prises.G.z))); }
      return d;
    }
    if (o.jefferson) {
      // Curl Jefferson : debout sur un support, le dos s'enroule vertèbre par vertèbre, la charge descend sous les pieds.
      fixe.push(...poseFixe(MAT.step(C, 0.5, 0.3, 0.4, 0, 0.03)));
      d.pose = u => { const p = debout(c, { dy: 0.3 - 0.02 * u, dz: -0.12 * u, penche: 2 + 50 * u, lomb: 46 * u, thor: 30 * u, cou: 30 * u, ecart: 0.1, ouv: 6, y0: 0.3 }); p.bras = pareil(B(0, 4 + 96 * u * 0 + (2 + 50 * u) * 0, -20, 4, 180)); const t = c.tronc(p); for (const [k, s] of COTES) p.bras[k] = { prise: t.epaules[k].clone().add(V(-s * 0.06, -(L.bras + L.prise) * 0.985, 0.03)), pole: V(s * 0.3, 0, -1), paume: V(0, 0, -1), dirMain: V(0, -1, 0), doigts: 'barre' }; return p; };
      d.tenu = o.barre ? [{ t: 'barre', l: 1.2, d: 0.1 }] : [{ t: 'haltere', m: 'GD' }]; d.periode = 4; return d;
    }
    // Les soulevés proprement dits. Profil : jusqu'où le buste bascule et les genoux plient en bas.
    const sumo = !!o.sumo, roumain = o.roumain || o.tendues || o.poulie || o.charniere || o.unejambe || o.bstance || o.ceinture;
    const penB = o.tendues ? 78 : roumain ? 66 : sumo ? 44 : o.trapbar ? 48 : 58;
    const recul = o.tendues ? -0.2 : roumain ? -0.26 : sumo ? -0.18 : -0.3;
    const ecart = sumo ? 0.36 : 0.14, ouv = sumo ? 38 : 12, xMain = sumo ? 0.2 : o.trapbar ? 0.32 : 0.27;
    const yBas = o.deficit ? 0.225 - 0 : o.blocs ? 0.5 : roumain ? (o.tendues ? 0.3 : 0.42) : 0.225;
    const y0 = o.deficit ? 0.1 : 0;
    if (o.deficit) fixe.push(pret(boite(0.7, y0, 0.45, 0, y0 / 2, z0 + 0.04, C.banc, 0)));
    if (o.blocs) for (const s of [1, -1]) fixe.push(pret(boite(0.3, 0.5 - 0.225, 0.4, s * 0.6, (0.5 - 0.225) / 2, 0.2, C.banc, 0)));
    const libres = o.hal || o.kb || o.trapbar || o.charniere || o.poulie || o.ceinture;
    const corps = k => {
      // Du bas vers le haut : les jambes poussent d'abord (buste encore penché), puis le buste se redresse.
      const penche = lisse(Math.min(1, k / (roumain ? 1 : 0.5)));
      const p = debout(c, { dy: y0, dz: lerp(-0.01, recul, penche), penche: lerp(2, penB, penche) + (roumain ? 0 : 5 * Math.max(0, (k - 0.5) / 0.5)), lomb: lerp(0, 4, penche), thor: lerp(0, 5, penche), cou: lerp(0, -penB * 0.52, penche), ecart, ouv, y0 });
      if (o.unejambe) {
        // Sur une jambe : l'autre part en arrière, dans le prolongement du buste.
        p.jambes.D = J(-8 * penche, 2, 0, 8 * penche + 84 * Math.sin(Math.PI * penche) * (penche < 0.5 ? 1 : 2 * (1 - penche)), 30 * Math.max(0, penche - 0.4) / 0.6);
        p.bassin.pos.x += 0.06 * penche;
      } else if (o.bstance) p.jambes.D = pied(c, -1, { ecart: 0.14, z: z0 - 0.26, pointe: 45, ouv: 6 });
      return p;
    };
    const portee = (L.bras + L.avantBras) * 0.985;
    const epaules = (p, zBarre) => { const e = c.tronc(p).epaules.G, dz = zBarre + L.creux - e.z, dx = xMain - e.x; return { y: e.y, chute: Math.sqrt(Math.max(1e-4, portee * portee - dz * dz - dx * dx)) }; };
    if (libres) {
      // Haltères, kettlebell, barre hexagonale, câble : les bras pendent, tendus, sous les épaules.
      const cle = k => { const p = corps(k), t = c.tronc(p); const profondeur = lisse(Math.min(1, k)); for (const [kk, s] of COTES) { const cible = o.kb ? V(s * 0.06, 0, 0.08) : o.trapbar ? V(s * 0.32, 0, z0 + 0.02 - t.epaules[kk].z) : o.poulie ? V(s * 0.05, 0, o.roumain ? 0.16 : -0.1) : V(s * (xMain - 0.165) + 0, 0, 0.1 + 0.08 * profondeur); const large = o.trapbar ? Math.sqrt(Math.max(0.01, Math.pow((L.bras + L.prise) * 0.985, 2) - Math.pow(0.32 - t.epaules.G.x, 2))) : (L.bras + L.prise) * 0.985; const pr = V(o.kb || o.poulie || o.trapbar ? cible.x : t.epaules[kk].x + cible.x, t.epaules[kk].y - large, t.epaules[kk].z + cible.z); if (o.kb) pr.y = Math.max(pr.y, 0.2); p.bras[kk] = o.charniere ? mains(c, t, 'hanches')[kk] : { prise: pr, pole: V(s * 0.3, 0, -1), paume: o.trapbar || o.poulie ? V(-s, 0, 0) : V(0, 0, -1), dirMain: V(0, -1, 0), doigts: 'barre' }; } return p; };
      d.pose = u => cle(o.depuisHaut || roumain ? u : 1 - u);
      if (!roumain && !o.depuisHaut) d.pose = u => cle(1 - u);
      d.pose = roumain ? (u => cle(u)) : (u => cle(1 - u));
      if (o.hal) d.tenu = [{ t: 'haltere', m: 'GD' }];
      else if (o.kb) { d.tenu = []; d.objets = (info, u, sortie) => poserObjet(MAT.kettlebell(C), info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), qTenu(AX, AY), sortie); }
      else if (o.trapbar) { d.tenu = []; d.objets = (info, u, sortie) => { const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5); for (const s of [1, -1]) { sortie.push(pret(cyl(0.014, 0.4, m.x + s * 0.32, m.y, m.z, C.metal, 1, LONG_Z))); sortie.push(pret(seg(V(m.x + s * 0.32, m.y, m.z + 0.2), V(m.x + s * 0.12, m.y - 0.06, m.z + 0.34), 0.014, C.metal, 1))); sortie.push(pret(seg(V(m.x + s * 0.32, m.y, m.z - 0.2), V(m.x + s * 0.12, m.y - 0.06, m.z - 0.34), 0.014, C.metal, 1))); sortie.push(pret(cyl(0.025, 0.4, m.x + s * 0.55, m.y - 0.06, m.z, C.metal, 1))); sortie.push(pret(cyl(0.225, 0.05, m.x + s * 0.62, m.y - 0.06, m.z, C.fonte, 0))); sortie.push(pret(seg(V(m.x + s * 0.12, m.y - 0.06, m.z + 0.34), V(m.x - s * 0.12, m.y - 0.06, m.z + 0.34), 0.014, C.metal, 1))); sortie.push(pret(seg(V(m.x + s * 0.12, m.y - 0.06, m.z - 0.34), V(m.x - s * 0.12, m.y - 0.06, m.z - 0.34), 0.014, C.metal, 1))); sortie.push(pret(seg(V(m.x + s * 0.32, m.y - 0.06, m.z), V(m.x + s * 0.36, m.y - 0.06, m.z), 0.014, C.metal, 1))); } }; }
      else if (o.poulie) { const anc = V(0, 0.15, o.roumain ? 1.15 : -1.1);   // tirage entre les jambes : poulie derrière ; soulevé roumain : poulie devant
        d.tenu = [{ t: 'cable', de: anc, bout: 'corde' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
      else if (o.ceinture) d.objets = (info, u, sortie) => { const b = info.bassin; sortie.push(pret(seg(V(0, b.y - 0.1, b.z + 0.05), V(0, 0.15, 0.05), 0.008, C.cadre, 0.6))); };
      return d;
    }
    // À la barre : elle longe les jambes, juste devant les cuisses, les genoux puis les tibias.
    const debout0 = debout(c, { dz: -0.01, penche: 2, ecart, ouv, dy: y0, y0 });
    const zHaut = c.devantJambes(debout0, 0.6 + y0, 1.0 + y0) + rayon + 0.004;
    const hautE = epaules(debout0, zHaut);
    const cle = k => {
      const p = corps(k), yBarre = lerp(hautE.y - hautE.chute - L.main, yBas + y0 * 0, k);
      let zBarre = zHaut;
      for (let passe = 0; passe < 3; passe++) { const e = epaules(p, zBarre); p.bassin.pos.y += yBarre + L.main + e.chute - e.y; zBarre = Math.max(0.1, c.devantJambes(p, yBarre - 0.03, yBarre + 0.03) + rayon + 0.004); }
      const barreP = V(0, yBarre, zBarre);
      for (const [kk, s] of COTES) p.bras[kk] = { prise: barreP.clone().setX(s * xMain), pole: V(s * 0.3, 0, -1), paume: V(0, 0, -1), dirMain: V(0, -1, 0), doigts: 'barre' };
      return p;
    };
    // Soulevé classique : départ barre au sol, on monte ; roumain : départ debout, on descend.
    d.pose = roumain ? (u => cle(u)) : (u => cle(1 - u));
    d.tenu = [{ t: 'barre', l: 1.6, d: o.smith ? 0.18 : 0.225 }];
    if (o.smith) fixe.push(...poseFixe(MAT.smith(C, zHaut)));
    return d;
  };
