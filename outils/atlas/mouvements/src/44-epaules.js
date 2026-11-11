
  /* Élévations et tirages des épaules et des trapèzes.
     Sortes : lat (élévation latérale, défaut), front, arriere (oiseau), y, menton (rowing menton), shrug, facepull,
     rotext (rotation externe), cubain (rotation cubaine), lu, cercles, ange (ange mural), passage (bande passée
     par-dessus la tête), tete (kettlebell autour de la tête), volant (disque tourné comme un volant), tenue (maintien
     bras tendus devant). Options : hal, barre, disque, poulie, elas, machine, kb ; uni, alt ; postures de postureDe ;
     marteau ; serre, large (rowing menton) ; dos (barre derrière le dos) ; kelso (haussement, buste sur banc incliné). */
  FAM.elevation = (c, o, C) => {
    // Sorte par défaut, admise dans l'écriture : o.lat (élévation latérale).
    const m = coteDe(o);
    if (!(o.barre || o.ez || o.kb || o.poulie || o.elas || o.machine || o.disque || o.pc || o.balle)) o.hal = true;
    let P, p, fixe, vue, a, b, ancre = null, autre = null, r = { disques: 0.13, lCable: 0.5 }, plus = {};
    const pose = def => { P = postureDe(c, o, C, def); p = P.p; fixe = P.fixe; vue = P.vue; };
    if (o.front) {
      pose(); const pr = o.marteau || o.disque ? 90 : 180, plan = o.disque ? -4 : 2;
      a = B(plan, 10, o.disque ? -18 : 0, 10, pr); b = B(plan, o.haut ? 165 : 94, o.disque ? -18 : 0, 10, pr);
      ancre = V(0, 0.1, -0.7); r.bout = m === 'GD' && o.poulie ? (o.corde ? 'corde' : 'barre') : null;
      if (o.volant) plus.pose = true;
      if (P.sorte === 'ventre') { const ang = o.ventre === true ? 45 : o.ventre; a = B(2, ang * 0.95, 0, 10, pr); b = B(2, 165, 0, 10, pr); }
    } else if (o.arriere) {
      // Oiseau : buste penché (ou à plat ventre sur banc incliné), les bras s'ouvrent ; debout aux poulies croisées.
      if (o.poulie && !o.penche && !o.tabouret && o.ventre == null) {
        pose(); a = B(-18, 86, -70, 14, 90); b = B(108, 88, 10, 14, 90); ancre = s => V(-s * 0.75, 1.5, 0.85); vue = { az: 150, el: 10 };
      } else if (o.machine) {
        // Butterfly inversé : assis face au dossier, bras tendus devant qui s'ouvrent.
        p = assis(c, { h: 0.5, zPieds: 0.3 }); const t = c.tronc(p);
        fixe = poseFixe(MAT.siege(C, 0.5)).concat([pret(boite(0.3, 0.5, 0.06, 0, t.epaules.G.y - 0.2, t.epaules.G.z + 0.19, C.banc, 0))]);
        a = B(8, 86, -80, 12, 90); b = B(104, 88, 10, 12, 90); r.pivot = () => V(0, t.epaules.G.y + 0.35, t.epaules.G.z + 0.3); vue = { az: 150, el: 12 };
      } else {
        if (o.tabouret) o.penche = 62; else if (o.ventre == null && !o.penche && !o.cote) o.penche = 76;
        pose(); const pen = P.sorte === 'ventre' ? (o.ventre === true ? 45 : o.ventre) : (o.penche === true ? 76 : o.penche || 76);
        a = B(6, pen * 0.96, -80, 14, 90); b = B(o.t ? 96 : 104, 88, 10, 16, o.t ? 180 : 90); ancre = s => V(-s * 0.6, 0.1, 0.5);
        if (m !== 'GD' && P.sorte === 'penche') { const t = c.tronc(p); autre = { prise: t.hanches.D.clone().add(V(-0.07, -0.15, 0.3)), pole: V(-1, 0.3, -0.4), paume: V(0, -1, 0), dirMain: V(0.3, -0.2, 1), doigts: 'detendu' }; }
      }
    } else if (o.y) {
      // Élévation en Y : les bras montent en diagonale, pouces vers le haut.
      if (o.ventre == null && !o.poulie) o.ventre = 40;
      pose();
      if (P.sorte === 'ventre') { const ang = o.ventre === true ? 40 : o.ventre; a = B(10, ang, 0, 8, 90); b = B(38, 152, 0, 8, 90); }
      else { a = B(-10, 30, -40, 10, 90); b = B(38, 150, 0, 8, 90); ancre = s => V(-s * 0.5, 0.1, 0.6); vue = { az: 160, el: 8 }; }
    } else if (o.menton) {
      // Rowing menton : les coudes montent haut sur les côtés, les mains longent le buste.
      pose(); const serre = o.serre ? -8 : o.large ? 12 : 0;
      a = B(10, 9, -30 + serre, 8, 180); b = B(82, o.large ? 76 : 84, -84 + serre, o.large ? 96 : 116, 180);
      ancre = V(0, 0.1, 0.35); r.bout = o.poulie ? (o.corde ? 'corde' : 'barre') : null;
    } else if (o.shrug) {
      // Haussement d'épaules : bras tendus, seules les épaules montent.
      if (o.kelso) o.ventre = 40;
      pose();
      const base = o.kelso ? B(4, 40, 0, 5, 90) : o.dos ? B(0, -12, 0, 6, 0) : o.barre ? B(0, 8, -25, 6, 180) : B(90, 5, 0, 6, 90);
      a = Object.assign({}, base, o.kelso ? { avance: 10 } : {}); b = Object.assign({}, base, o.kelso ? { avance: -14, hausse: 8 } : { hausse: 26 });
      ancre = s => V(s * 0.28, 0.05, 0.02); if (o.machine) r.pivot = s => V(s * 0.3, 0.3, -0.5);
    } else if (o.facepull) {
      // Tirage visage : la corde vient vers le front, coudes hauts, mains de part et d'autre de la tête.
      if (o.sol) { pose(); a = B(6, 92, -10, 8, 180); b = B(86, 88, 78, 104, 150); ancre = V(0, 1.2, -1.2); }
      else { pose(); a = B(6, 92, -10, 8, 180); b = B(86, 90, 78, 104, 150); ancre = V(0, P.sorte === 'assis' ? 1.3 : 1.62, 1.0); vue = { az: 140, el: 10 }; }
      r.bout = o.poulie ? 'corde' : null; if (o.elas) r.deElas = () => ancre; if (o.sup) { a.pron = 20; b.pron = 30; }
    } else if (o.rotext) {
      // Rotation externe : coude au corps plié à angle droit (couché sur le côté), ou coude à hauteur d'épaule.
      if (o.cote) {
        p = surLeCote(c, { cote: 'D' }); fixe = []; vue = { az: 0, el: 22 };
        a = B(90, 6, -62, 90, 90); b = B(90, 6, 38, 90, 90);
        autre = B(0, 150, 0, 60, 90, { doigts: 'detendu' });
      } else { pose(); a = B(90, 86, 4, 90, 180); b = B(90, 86, 86, 90, 180); }
    } else if (o.cubain) {
      // Rotation cubaine : coudes à hauteur d'épaules, les avant-bras basculent de bas en haut.
      pose(); a = B(84, 84, -80, 92, 180); b = B(84, 84, 86, 92, 180);
    } else if (o.cercles) {
      // Cercles de bras : bras en croix, petits cercles.
      pose(); a = B(90, 88, 0, 4, 180, { doigts: 'detendu' }); b = a; plus.cercles = true;
    } else if (o.ange) {
      // Ange mural : dos au mur, les bras glissent du « chandelier » jusqu'au-dessus de la tête.
      pose(); fixe = fixe.concat(poseFixe(MAT.mur(C, -c.L.dos - 0.07)));
      a = B(92, 82, 88, 100, 180, { doigts: 'plat' }); b = B(92, 158, 88, 22, 180, { doigts: 'plat' }); vue = { az: 0, el: 6 };
    } else if (o.passage) {
      // Bande tenue large, bras tendus : elle passe de devant les cuisses à derrière le dos, par-dessus la tête.
      pose(); a = B(40, 20, 0, 4, 180); b = B(60, 200, 0, 4, 180); vue = { az: 60, el: 8 };
    } else if (o.tete) {
      // Kettlebell tenu à deux mains, qui tourne autour de la tête.
      pose(); a = B(0, 60, -30, 120, 90); b = a; plus.halo = true;
    } else if (o.tenue) {
      pose(); a = B(-3, 92, -18, 8, 90); b = B(-3, 94, -18, 8, 90); plus.rythme = 'tenue';
    } else {
      // Élévation latérale : bras presque tendus, levés sur les côtés jusqu'à l'horizontale (lu : jusqu'en haut).
      if (o.cote) {
        // Couché sur le côté sur un banc incliné : un bras.
        p = surLeCote(c, { cote: 'D' }); fixe = []; vue = { az: 0, el: 20 };
        a = B(90, 4, 0, 10, 90); b = B(90, 92, 0, 10, 90); autre = B(0, 150, 0, 60, 90, { doigts: 'detendu' });
      } else {
        pose({ roulis: 0 });
        const haut = o.lu ? 172 : 86;
        a = B(88, 9, 0, 12, 90); b = B(86, haut, 0, o.poliquin ? 14 : 14, o.lu ? 150 : 90);
        if (o.poliquin) a = B(60, 20, 30, 95, 90);                        // montée coudes pliés, descente bras tendus
        if (o.latfront) { plus.cles = true; }
        ancre = s => V(-s * 0.75, 0.1, 0.05);
        if (o.machine) { a = B(88, 12, 0, 85, 90); b = B(88, 84, 0, 85, 90); r.pivot = s => V(s * 0.2, 1.36, -0.25); }
        if (P.sorte === 'ventre') { const ang = o.ventre === true ? 45 : o.ventre; a = B(20, ang * 0.9, 0, 12, 90); b = B(84, 86, 0, 14, 90); }
        if (o.penchecote) { p.bassin.rot = qZ(-14 * (m === 'D' ? -1 : 1)); p.bassin.pos.x += 0.1 * (m === 'D' ? 1 : -1); autre = B(90, 70, 0, 20, 90); }
      }
    }
    r.ancre = ancre;
    if (o.elas && ancre && !r.deElas && o.ancreElas) r.deElas = ancre;
    const ancres = !ancre ? null : typeof ancre === 'function' ? [ancre(1), ancre(-1)].slice(0, m === 'GD' ? 2 : 1) : ancre;
    const d = Object.assign(parLesBras(p, a, b, m, autre), { fixe: colonneSi(o, C, ancres, fixe || []), vue, tenu: tenuDe(o, m, r) }, rythmeDe(o));
    if (plus.rythme) d.rythme = plus.rythme;
    if (o.landmine) {
      // La barre tenue par un bout, l'autre bout posé au sol devant soi : elle suit la main.
      const piv = V(0, 0.05, 1.5); d.tenu = [];
      d.objets = (info, u, sortie) => { const pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[m], dir = unite(pr.clone().sub(piv)); sortie.push(pret(seg(piv, pr.clone().add(dir.clone().multiplyScalar(0.12)), 0.025, C.metal, 1))); poserObjet([cyl(0.13, 0.04, 0, 0, 0, C.fonte, 0, DEBOUT_Q)], pr.clone().sub(dir.clone().multiplyScalar(0.2)), arc(AY, dir), sortie); };
    }
    if (o.passage) d.tenu = [{ t: 'elastique', de: info => info.prises.D, m: 'G', bout: 'rien' }];
    if (plus.cercles) { d.rythme = 'continu'; d.periode = 1.6; const A = d.a; d.pose = ph => { const q = cloner(A), w = ph * 2 * Math.PI; for (const k of ['G', 'D']) { q.bras[k].elev = 88 + 9 * Math.sin(w); q.bras[k].plan = 90 + 9 * Math.cos(w); } return q; }; }
    if (plus.halo) { d.rythme = 'continu'; d.periode = 3.2; const A = d.a; d.tenu = [{ t: 'kb', m: 'G', sens: 'avantbras' }]; d.pose = ph => { const q = cloner(A), w = ph * 2 * Math.PI; q.bras.G = B(20 + 60 * Math.sin(w), 118 + 30 * Math.sin(w + 1.2), -20, 118, 90); q.bras.D = B(20 - 60 * Math.sin(w), 118 + 30 * Math.sin(w + 1.2), -20, 118, 90); return q; }; }
    if (plus.cles) { const A = d.a, Zl = d.b, F = cloner(d.a); for (const k of ['G', 'D']) F.bras[k] = B(4, 90, 0, 10, 180); d.cles = [[0, A], [0.45, Zl], [1, F]]; }
    if (plus.pose) { const A = d.a, Z = d.b; d.rythme = 'continu'; d.periode = 4; d.pose = ph => { const u = ph < 0.2 ? lisse(ph / 0.2) : ph > 0.85 ? 1 - lisse((ph - 0.85) / 0.15) : 1, q = mel(A, Z, u), w = Math.sin((ph - 0.2) / 0.65 * 2 * Math.PI) * (u >= 1 ? 1 : 0); q.bras.G.elev += 10 * w; q.bras.D.elev -= 10 * w; return q; }; }
    return d;
  };
