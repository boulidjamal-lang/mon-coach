
  /* ---------- Outils communs aux familles ---------- */
  /* Posture d'un exercice de bras ou d'épaules, d'après ses options :
       (rien) debout ; assis (banc à dossier droit) ; tabouret (assis sans dossier) ; banc=<angle> (sur le dos, banc
       relevé de tant de degrés ; plat = banc=0 ; decline = -18) ; sol (sur le dos par terre) ; ventre=<angle> (à plat
       ventre sur banc incliné) ; penche[=angle] (debout, buste penché) ; genoux ; demigenou.
     Renvoie { p (pose de base), fixe (matériel posé), vue, sorte }. */
  function postureDe(c, o, C, defauts) {
    defauts = defauts || {};
    let p, fixe = [], vue = { az: 35, el: 8 }, sorte = 'debout';
    const banc = o.plat ? 0 : o.decline ? -18 : o.banc === true ? 45 : o.banc;
    if (banc != null && banc !== false) {
      p = allonge(c, { h: 0.44, angle: banc, jambes: o.jambes }); fixe = poseFixe(MAT.banc(C, banc)); vue = banc >= 20 ? { az: 40, el: 12 } : { az: 60, el: 14 }; sorte = 'dos';
    } else if (o.sol) { p = allonge(c, { h: 0, angle: 0, jambes: o.jambes || 'plies' }); vue = { az: 66, el: 16 }; sorte = 'dos'; }
    else if (o.ventre != null && o.ventre !== false) {
      const a = o.ventre === true ? 45 : o.ventre;
      p = aPlatVentre(c, { h: 0.44, angle: a, d: a > 15 ? 0.3 : 0.25 }); fixe = poseFixe(MAT.banc(C, a), V(), qY(180)); vue = { az: 52, el: 12 }; sorte = 'ventre';
    } else if (o.assis) { p = allonge(c, { h: 0.44, angle: 84, lomb: 0, thor: 0, cou: 0 }); fixe = poseFixe(MAT.banc(C, 84)); sorte = 'assis'; vue = { az: 38, el: 10 }; }
    else if (o.tabouret) { p = assis(c, { h: 0.45, penche: o.penche === true ? 0 : (o.penche || 0) }); fixe = poseFixe(MAT.banc(C, 0), V(0, 0, 0.28)); sorte = 'assis'; vue = { az: 38, el: 10 }; }
    else if (o.genoux) { p = aGenoux(c, { penche: defauts.penche || 0 }); sorte = 'genoux'; }
    else if (o.demigenou) { p = demiGenou(c, { penche: defauts.penche || 0 }); sorte = 'genoux'; }
    else if (o.penche) {
      const a = o.penche === true ? (defauts.penche || 60) : o.penche;
      p = debout(c, { dy: -0.05 - a * 0.0012, dz: -0.06 - a * 0.0026, penche: a, lomb: 3, thor: 4, cou: -a * 0.55, ecart: 0.14, ouv: 10 }); vue = { az: 122, el: 10 }; sorte = 'penche';
    } else p = debout(c, { ecart: defauts.ecart == null ? 0.11 : defauts.ecart, ouv: 10, penche: defauts.penche || 0, dy: defauts.dy || 0, dz: defauts.dz || 0 });
    return { p, fixe, vue, sorte };
  }
  /* Deux poses qui ne diffèrent que par les bras. a, b : angles (ou cibles) des bras au départ et à l'arrivée, pour
     les deux côtés ou { G, D } ; cote : 'G' ou 'D' si un seul bras travaille (l'autre prend `autre`, au repos par défaut). */
  function parLesBras(p, a, b, cote, autre) {
    const A = cloner(p), Z = cloner(p);
    for (const [k] of COTES) {
      const aK = a.G ? a[k] : a, bK = b.G ? b[k] : b;
      if (cote && cote !== 'GD' && cote !== k) { A.bras[k] = cloner(autre || brasRepos()); Z.bras[k] = cloner(autre || brasRepos()); }
      else { A.bras[k] = cloner(aK); Z.bras[k] = cloner(bK); }
    }
    return { a: A, b: Z };
  }
  /* Le matériel tenu, d'après les options : hal, barre, ez, kb, disque, balle, poulie, elas, machine, sangles.
     r : réglages de la famille { ancre (poulie : point ou fonction du côté), bout, pivot (machine), deElas, lBarre }. */
  function tenuDe(o, m, r) {
    r = r || {};
    const t = [], pt = (v, k) => (typeof v === 'function' && v.length ? v(k === 'D' ? -1 : 1, k) : v);
    const cotes = m === 'GD' || !m ? ['G', 'D'] : [m];
    if (o.barre) t.push({ t: 'barre', l: r.lBarre || 1.6, d: r.disques });
    else if (o.ez) t.push({ t: 'barre', l: 1.2, d: 0.09 });
    else if (o.hal) t.push({ t: 'haltere', m });
    else if (o.kb) t.push({ t: 'kb', m, sens: r.sensKb });
    else if (o.disque) t.push({ t: 'disque', m: 'GD' });
    else if (o.balle) t.push({ t: 'balle', m: 'GD' });
    else if (o.poulie) {
      if (r.bout === 'barre' || r.bout === 'corde') t.push({ t: 'cable', de: pt(r.ancre, 'G'), bout: r.bout, l: r.lCable });
      else for (const k of cotes) t.push({ t: 'cable', de: pt(r.ancre, k), m: k, bout: 'poignee' });
    } else if (o.elas) for (const k of cotes) t.push({ t: 'elastique', de: r.deElas ? pt(r.deElas, k) : 'pieds', m: k, bout: 'poignee' });
    else if (o.machine && r.pivot) for (const k of cotes) t.push({ t: 'levier', de: pt(r.pivot, k), m: k });
    else if (o.sangles && r.ancre) for (const k of cotes) t.push({ t: 'sangle', de: pt(r.ancre, k), m: k, bout: 'poignee' });
    return t;
  }
  /* Colonne de poulie posée au point d'ancrage (quand l'exercice se fait au câble). */
  const colonneSi = (o, C, ancre, fixe) => { if (o.poulie && ancre) for (const a of Array.isArray(ancre) ? ancre : [ancre]) poserObjet(MAT.colonne(C, a), V(), null, fixe); return fixe; };
  /* Quel côté travaille : 'GD', ou 'G' pour un exercice à un bras (uni). */
  const coteDe = o => (o.uni ? (o.droit ? 'D' : 'G') : 'GD');
  /* Le rythme d'après les options : alt (un côté puis l'autre), sinon répétitions. */
  const rythmeDe = (o, membres) => (o.alt ? { rythme: 'alt', alterne: membres || ['bras'] } : {});
