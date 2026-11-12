
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
      p = aPlatVentre(c, { h: 0.44, angle: a, d: 0.08 }); fixe = poseFixe(MAT.banc(C, a, 0.44, 0.68, 0), V(), qY(180)); vue = { az: 52, el: 12 }; sorte = 'ventre';
    } else if (o.assis) { p = allonge(c, { h: 0.44, angle: 84, lomb: 0, thor: 0, cou: 0 }); fixe = poseFixe(MAT.banc(C, 84)); sorte = 'assis'; vue = { az: 38, el: 10 }; }
    else if (o.tabouret) { p = assis(c, { h: H_BANC, penche: o.penche === true ? 0 : (o.penche || 0) }); fixe = bancAssis(C); sorte = 'assis'; vue = { az: 38, el: 10 }; }
    else if (o.genoux) { p = aGenoux(c, { penche: defauts.penche || 0 }); sorte = 'genoux'; }
    else if (o.demigenou) { p = demiGenou(c, { penche: defauts.penche || 0 }); sorte = 'genoux'; }
    else if (o.penche) {
      const a = o.penche === true ? (defauts.penche || 60) : o.penche;
      p = debout(c, { dy: -0.05 - a * 0.0012, dz: -0.06 - a * 0.0026, penche: a, lomb: 3, thor: 4, cou: -a * 0.55, ecart: 0.14, ouv: 10 }); vue = { az: 122, el: 10 }; sorte = 'penche';
    } else p = debout(c, { ecart: defauts.ecart == null ? 0.14 : defauts.ecart, ouv: 12, penche: defauts.penche || 0, dy: defauts.dy || 0, dz: defauts.dz || 0 });
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
  /* Barre hexagonale (trap bar) : un cadre autour du corps, une poignée de chaque côté, les disques au bout.
     Elle suit les mains : les poignées passent par elles, quel que soit leur écart. */
  function barreHexagonale(C) {
    return (info, u, sortie) => {
      const m = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), e = Math.abs(info.prises.G.x - info.prises.D.x) / 2, y = m.y - 0.06;
      for (const s of [1, -1]) {
        sortie.push(pret(cyl(0.014, 0.4, m.x + s * e, m.y, m.z, C.metal, 1, LONG_Z)));                                      // la poignée
        for (const z of [0.2, -0.2]) sortie.push(pret(seg(V(m.x + s * e, m.y, m.z + z), V(m.x + s * 0.12, y, m.z + z * 1.7), 0.014, C.metal, 1)));   // les pans du cadre
        sortie.push(pret(seg(V(m.x + s * e, y, m.z), V(m.x + s * (e + 0.04), y, m.z), 0.014, C.metal, 1)));
        sortie.push(pret(cyl(0.025, 0.4, m.x + s * (e + 0.23), y, m.z, C.metal, 1)));                                        // le manchon
        sortie.push(pret(cyl(0.225, 0.05, m.x + s * (e + 0.3), y, m.z, C.fonte, 0)));                                        // le disque
        for (const z of [0.34, -0.34]) sortie.push(pret(seg(V(m.x + s * 0.12, y, m.z + z), V(m.x - s * 0.12, y, m.z + z), 0.014, C.metal, 1)));      // devant, derrière
      }
    };
  }
  /* Le matériel tenu, d'après les options : hal, barre, ez, kb, disque, balle, poulie, elas, machine, sangles.
     r : réglages de la famille { ancre (poulie : point ou fonction du côté), bout, pivot (machine), deElas, lBarre }. */
  function tenuDe(o, m, r) {
    r = r || {};
    const t = [], pt = (v, k) => (typeof v === 'function' && v.length ? v(k === 'D' ? -1 : 1, k) : v);
    const cotes = m === 'GD' || !m ? ['G', 'D'] : [m];
    if (o.barre) t.push({ t: 'barre', l: r.lBarre || 1.6, d: r.disques });
    else if (o.ez) t.push({ t: 'barre', ez: true });
    else if (o.hal) t.push({ t: 'haltere', m });
    else if (o.kb) t.push({ t: 'kb', m, sens: r.sensKb });
    else if (o.disque) t.push({ t: 'disque', m: 'GD', bord: true, r: r.rDisque });
    else if (o.balle) t.push({ t: 'balle', m: 'GD' });
    else if (o.poulie) {
      if (r.bout === 'barre' || r.bout === 'corde') t.push({ t: 'cable', de: pt(r.ancre, 'G'), bout: r.bout, l: r.lCable });
      else for (const k of cotes) t.push({ t: 'cable', de: pt(r.ancre, k), m: k, bout: 'poignee' });
    } else if (o.elas) for (const k of cotes) t.push({ t: 'elastique', de: r.deElas ? pt(r.deElas, k) : 'pieds', m: k, bout: 'poignee' });
    else if (o.machine && r.pivot) for (const k of cotes) t.push({ t: 'levier', de: pt(r.pivot, k), m: k, bati: r.bati });
    else if (o.sangles && r.ancre) for (const k of cotes) t.push({ t: 'sangle', de: pt(r.ancre, k), m: k, bout: 'poignee' });
    return t;
  }
  /* Le pupitre réglé sous les bras, pour la posture p et les bras donnés : son coussin est parallèle au haut des bras
     et sa face touche le dessous des bras (les triceps s'y posent, enfoncés d'un centimètre) ; son bord bas est à
     5 cm au-delà du coude, là où l'avant-bras le quitte ; son bord haut monte vers l'aisselle (19 cm au-dessus du
     coude au plus) tant que son coin arrière ne rentre pas dans la poitrine (de plus de 8 mm). Le dessous du bras se
     mesure de 3 à 14 cm au-dessus du coude : plus haut, le long triceps rejoint l'aisselle et descend bien plus bas
     que le bras. Rend les formes du pupitre ; .coude : la place du coude gauche (le pivot d'une machine). */
  function pupitreSous(c, p, bras, C) {
    const q = cloner(p); q.bras = pareil(bras);
    const i = c.poser(q), e = i.epaules.G, k = i.coudes.G, al = Math.atan2(e.y - k.y, k.z - e.z);
    const n = V(0, Math.cos(al), Math.sin(al)), td = V(0, -Math.sin(al), Math.cos(al));
    // Le dessous du bras se mesure sur les seize centimètres au-dessus du coude (plus haut, c'est l'aisselle).
    const sK = td.dot(k); let m = Infinity;
    c.peauPosee(['bras'], (x, y, z) => { const s = y * td.y + z * td.z; if (s < sK - 0.14 || s > sK - 0.03) return; const h = y * n.y + z * n.z; if (h < m) m = h; });
    const ep = 0.06, h0 = m + ENFONCE - ep, bas = sK + 0.05, larg = 0.25;
    // Le tronc devant le coussin : pour chaque point (dans la largeur du coussin), sa place le long du bras et sous sa face.
    const T = []; c.peauPosee(['thorax', 'abdomen', 'dos', 'epaule'], (x, y, z) => { if (Math.abs(x) > larg) return; const h = y * n.y + z * n.z; if (h < h0 + ep && h > h0 - 0.02) T.push(y * td.y + z * td.z, h); });
    let haut = 0.19;
    for (; haut > 0.1; haut -= 0.01) { let dedans = 0; for (let i = 0; i < T.length; i += 2) if (T[i] > sK - haut && T[i] < bas && T[i + 1] > h0) dedans = Math.max(dedans, Math.min(T[i + 1] - h0, h0 + ep - T[i + 1])); if (dedans <= 0.008) break; }
    const L = bas - (sK - haut), ctr = n.clone().multiplyScalar(h0 + ep / 2).add(td.clone().multiplyScalar((bas + sK - haut) / 2));
    const f = MAT.pupitre(C, ctr.y, ctr.z, al * 180 / Math.PI, L, ep);
    f.coude = k.clone();
    return f;
  }
  /* Colonne de poulie posée au point d'ancrage (quand l'exercice se fait au câble). */
  const colonneSi = (o, C, ancre, fixe) => { if (o.poulie && ancre) for (const a of Array.isArray(ancre) ? ancre : [ancre]) poserObjet(MAT.colonne(C, a), V(), null, fixe); return fixe; };
  /* Quel côté travaille : 'GD', ou 'G' pour un exercice à un bras (uni). */
  const coteDe = o => (o.uni ? (o.droit ? 'D' : 'G') : 'GD');
  /* Le rythme d'après les options : alt (un côté puis l'autre), sinon répétitions. */
  const rythmeDe = (o, membres) => (o.alt ? { rythme: 'alt', alterne: membres || ['bras'] } : {});
