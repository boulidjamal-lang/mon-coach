
  /* Curl des biceps et ses variantes.
     Matériel : hal (défaut), barre, ez, kb, poulie, elas, machine, disque. Prise : (supination), marteau, pro, zottman.
     Posture : voir postureDe, plus pupitre, araignee (à plat ventre sur banc incliné), concentre, drag, bayesien,
     hercule, croise, accroupi, mur, allonge. Côtés : alt, uni. */
  FAM.curl = (c, o, C) => {
    const pron = o.marteau ? 90 : o.pro ? 180 : 0;
    const m = coteDe(o);
    if (!(o.barre || o.ez || o.kb || o.poulie || o.elas || o.machine || o.disque)) o.hal = true;
    if (o.araignee) o.ventre = o.ventre == null ? 50 : o.ventre;
    if (o.incline) o.banc = o.banc == null ? 55 : o.banc;
    if (o.concentre) { o.tabouret = true; o.penche = 42; }
    if (o.allonge) o.sol = true;
    const P = postureDe(c, o, C, { penche: o.bayesien ? 8 : 0 });
    let p = P.p, fixe = P.fixe, vue = P.vue, a, b, ancre = V(0, 0.1, 0.8), autre = null, bout = o.barreP ? 'barre' : o.corde ? 'corde' : null, r = { disques: 0.13, lCable: 0.7 };
    if (o.pupitre) {
      // Assis derrière le pupitre, le haut des bras posé sur le coussin incliné.
      p = assis(c, { h: H_SIEGE, penche: 14, zPieds: 0.3 }); p.thorax = 6; p.cou = -8;
      a = B(8, 52, 0, 22, pron); b = B(8, 52, 0, 128, pron);
      const t = c.tronc(p), ep = t.epaules.G;
      fixe = poseFixe(MAT.siege(C, H_SIEGE)).concat(poseFixe(pupitreSous(c, p, a, C)));
      ancre = V(0, 0.15, ep.z + 0.75); vue = { az: 52, el: 12 };
      r.pivot = s => V(s * 0.2, ep.y - 0.3, ep.z + 0.3);
    } else if (P.sorte === 'ventre') {
      // À plat ventre sur le banc incliné : les bras pendent à la verticale devant le banc.
      const pen = o.ventre === true ? 50 : o.ventre;
      a = B(4, pen, 0, 14, pron); b = B(4, pen, 0, 132, pron);
    } else if (P.sorte === 'dos') {
      // Sur le dos : banc incliné, les bras pendent derrière le buste ; par terre (câble), le long du corps.
      const ang = o.sol ? 0 : (o.banc === true ? 55 : o.banc);
      a = B(90, 5, 0, 10, pron); b = B(60, 10, 0, 138, pron);
      if (!o.sol) { a = B(0, -(90 - ang) * 0.85, 0, 8, pron); b = B(0, -(90 - ang) * 0.8, 0, 132, pron); }
      ancre = V(0, 0.25, 1.35);
    } else if (o.concentre) {
      // Assis, buste penché : le bras pend entre les cuisses, le coude contre l'intérieur de la cuisse.
      a = B(-12, 48, -10, 14, pron); b = B(-12, 50, -10, 136, pron);
      const t = c.tronc(p);
      autre = { prise: t.hanches.D.clone().add(V(-0.1, 0.02, 0.36)), pole: V(-1, 0.4, -0.4), paume: V(0, -1, 0), dirMain: V(0.3, 0, 1), doigts: 'detendu' };
      for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { ecart: 0.26, ouv: 22, z: 0.4 });
      vue = { az: 20, el: 10 };
    } else if (o.drag) {
      // Les coudes reculent : la barre monte le long du buste.
      a = B(90, 5, 0, 10, pron); b = B(0, -30, 6, 118, pron);
    } else if (o.bayesien) {
      // Dos à la poulie basse : le bras part de derrière le corps.
      a = B(0, -28, 0, 8, pron); b = B(0, 4, 0, 136, pron);
      ancre = s => V(s * 0.2, 0.1, -0.95);
      if (P.sorte === 'debout') { p.jambes.G = pied(c, 1, { z: 0.16 }); p.jambes.D = pied(c, -1, { z: -0.2, pointe: 20 }); }
      vue = { az: 60, el: 8 };
    } else if (o.hercule) {
      // Entre deux poulies hautes : bras en croix, les mains viennent vers les oreilles.
      a = B(90, 98, 90, 18, 0); b = B(90, 98, 90, 128, 0);
      ancre = s => V(s * 1.1, 1.95, 0); vue = { az: 0, el: 6 };
    } else if (o.croise) {
      // L'avant-bras monte en travers du buste, vers l'épaule opposée.
      a = B(90, 6, 0, 12, 90); b = B(30, 12, -42, 132, 90);
    } else if (o.accroupi) {
      // Accroupi face à la poulie basse, les coudes calés sur les genoux.
      p = debout(c, { dy: -0.52, dz: -0.24, penche: 24, ecart: 0.2, ouv: 22, cou: -14 });
      a = B(0, 62, 0, 30, pron); b = B(0, 62, 0, 130, pron); ancre = V(0, 0.12, 0.85); vue = { az: 60, el: 10 };
    } else {
      // Debout ou assis : coudes au corps ; ils avancent un peu en haut du mouvement.
      const ecart = o.large ? 14 : o.serre ? -16 : 0;
      a = B(90, 6, ecart, 12, pron); b = B(35, 16, ecart, 142, pron);
      if (o.haute) { a = B(0, 80, 0, 20, pron); b = B(0, 86, 0, 120, pron); ancre = V(0, 1.9, 0.9); }   // poulie haute, bras devant
    }
    if (o.mur) fixe = fixe.concat(poseFixe(MAT.mur(C, -c.L.dos - 0.06)));
    r.ancre = ancre; r.bout = bout;
    const d = Object.assign(parLesBras(p, a, b, m, autre), { fixe: colonneSi(o, C, typeof ancre === 'function' ? [ancre(1), ancre(-1)].slice(0, m === 'GD' ? 2 : 1) : ancre, fixe), vue, tenu: tenuDe(o, m, r) }, rythmeDe(o));
    if (o.zottman) {
      // Montée en supination ; la main se retourne en haut ; descente en pronation ; elle se retourne en bas.
      const A = d.a, Z = d.b;
      d.pose = (u, sens) => { const q = mel(A, Z, u), pr = sens < 0 ? 180 * lisse(u / 0.2) : 180 * lisse((u - 0.86) / 0.14); for (const k of ['G', 'D']) q.bras[k].pron = pr; return q; };
    }
    return d;
  };
