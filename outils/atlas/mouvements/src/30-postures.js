
  /* ---------- Postures : de quoi écrire une pose en peu de mots ----------
     Repère : Y vers le haut, Z vers l'avant du corps debout, X vers sa gauche ; le sol est en y = 0. */
  /* Bras par angles anatomiques (voir Corps) : plan, élévation, rotation, coude, pronation. */
  const B = (plan, elev, rot, coude, pron, plus) => Object.assign({ plan, elev, rot: rot || 0, coude: coude || 0, pron: pron == null ? 90 : pron, doigts: 'barre' }, plus);
  /* Jambe par angles : flexion, abduction, rotation de la hanche, flexion du genou, pointe du pied. */
  const J = (flex, abd, rot, genou, pointe, plus) => Object.assign({ flex, abd: abd || 0, rot: rot || 0, genou: genou || 0, pointe: pointe || 0 }, plus);
  const brasRepos = () => ({ plan: 90, elev: 7, rot: 0, coude: 12, pron: 90, doigts: 'detendu' });
  const pareil = spec => ({ G: Object.assign({}, spec), D: Object.assign({}, spec) });
  const deux = f => ({ G: f(1, 'G'), D: f(-1, 'D') });
  function cloner(a) {
    if (a instanceof V3 || a instanceof Quat) return a.clone();
    if (Array.isArray(a)) return a.map(cloner);
    if (a && typeof a === 'object') { const r = {}; for (const k in a) r[k] = cloner(a[k]); return r; }
    return a;
  }

  /* Un pied posé : x, z de la cheville pied à plat ; ouv : pointe ouverte vers le dehors ; pointe : talon levé
     (le pied tourne autour de l'articulation des orteils, qui reste au sol) ; y0 : hauteur du support ;
     lacet : orientation de toute la jambe (0 = vers l'avant). */
  function pied(c, s, o) {
    o = o || {};
    const L = c.L, ouv = rad(o.ouv == null ? 8 : o.ouv), th = rad(o.pointe || 0), y0 = o.y0 || 0;
    const dirH = V(s * Math.sin(ouv), 0, Math.cos(ouv)).applyQuaternion(qAxe(AY, rad(o.lacet || 0)));
    const d = dirH.clone().multiplyScalar(Math.cos(th)).add(V(0, -Math.sin(th), 0));
    const haut = V(0, Math.cos(th), 0).add(dirH.clone().multiplyScalar(Math.sin(th)));
    const x = o.x != null ? o.x : s * (o.ecart == null ? 0.1 : o.ecart), z = o.z != null ? o.z : L.racine.z + L.hanche.z;
    // Pointe négative : le talon reste au sol et la pointe du pied se lève (la cheville ne bouge pas).
    if (th < 0) return { cheville: V(x, y0 + L.chevilleH, z), pole: o.pole ? o.pole.clone() : dirH.clone(), pied: d, hautPied: haut, orteils: 0 };
    const boule = V(x, y0 + L.orteilsH, z).add(dirH.clone().multiplyScalar(L.avantPied));
    const cheville = boule.clone().sub(d.clone().multiplyScalar(L.avantPied)).add(haut.clone().multiplyScalar(L.chevilleH - L.orteilsH));
    return { cheville, pole: o.pole ? o.pole.clone() : dirH.clone(), pied: d, hautPied: haut, orteils: o.pointe || 0 };
  }
  /* Debout : bassin déplacé (dy vers le bas en négatif, dz vers l'arrière en négatif), buste penché en avant de
     `penche` degrés, pieds à plat écartés de 2 × ecart. */
  function debout(c, o) {
    o = o || {};
    const L = c.L;
    const rot = qY(o.lacet || 0).multiply(qX(o.penche || 0)).multiply(qZ(o.roulis || 0));
    const p = { bassin: { pos: L.racine.clone().add(V(o.dx || 0, o.dy || 0, o.dz || 0)), rot }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, jambes: {}, bras: pareil(brasRepos()) };
    for (const [k, s] of COTES) p.jambes[k] = pied(c, s, { ecart: o.ecart, ouv: o.ouv, pointe: o.pointe, y0: o.y0, z: (o.zPieds || 0) + L.racine.z + L.hanche.z });
    return p;
  }
  /* Où tombe le centre de gravité d'une posture debout, dans l'axe avant-arrière : masses des segments d'après les tables
     de Dempster et Winter (tronc 50 %, tête 8 %, bras 10 % comptés à l'épaule, cuisses 20 %, jambes 9 %, pieds 3 %).
     t : le tronc posé (c.tronc(p)) ; les jambes sont résolues depuis leurs appuis. */
  function aplomb(c, p, t) {
    const L = c.L, h = t.hanches, e = t.epaules;
    let z = 0.497 * (h.G.z + h.D.z + e.G.z + e.D.z) / 4 + 0.081 * (t.cou.z + 1.45 * (t.tete.z - t.cou.z)) + 0.1 * (e.G.z + e.D.z) / 2;
    for (const k of ['G', 'D']) {
      const j = p.jambes[k];
      if (!j.cheville) { z += 0.161 * h[k].z; continue; }
      const g = ik2(h[k], j.cheville, L.cuisse, L.jambe, j.pole || AZ).milieu;
      z += 0.1 * (h[k].z + 0.433 * (g.z - h[k].z)) + 0.0465 * (g.z + 0.433 * (j.cheville.z - g.z)) + 0.0145 * (j.cheville.z + 0.06);
    }
    return z;
  }
  /* Avance ou recule le bassin, pieds posés, jusqu'à ce que le centre de gravité tombe en z : une posture debout tient
     en équilibre sur ses pieds (au milieu du pied sous une charge), elle ne s'assied pas dans le vide.
     charge : une charge tenue, en part de la masse du corps, à l'aplomb des épaules décalé de `dzCharge`. */
  function equilibrer(c, p, z, charge, dzCharge) {
    for (let n = 0; n < 3; n++) {
      const t = c.tronc(p), zc = charge ? (aplomb(c, p, t) + charge * ((t.epaules.G.z + t.epaules.D.z) / 2 + (dzCharge || 0))) / (1 + charge) : aplomb(c, p, t);
      p.bassin.pos.z += (z - zc) / 0.85;
    }
    return p;
  }
  /* Règle une posture debout sur deux choses à la fois : la flexion des genoux (degrés) et l'aplomb du centre de gravité
     (z). Le bassin recule ou avance pour l'équilibre, monte ou descend pour les genoux. */
  function tenirDebout(c, p, genou, z, charge, dzCharge) {
    const L = c.L, D = Math.sqrt(L.cuisse * L.cuisse + L.jambe * L.jambe + 2 * L.cuisse * L.jambe * Math.cos(rad(genou)));
    for (let n = 0; n < 3; n++) {
      equilibrer(c, p, z, charge, dzCharge);
      const h = c.tronc(p).hanches.G, ch = p.jambes.G.cheville;
      p.bassin.pos.y += ch.y + Math.sqrt(Math.max(0.01, D * D - Math.pow(h.z - ch.z, 2) - Math.pow(h.x - ch.x, 2))) - h.y;
    }
    return p;
  }
  /* Assis sur un siège de hauteur h, pieds à plat devant (zPieds : avancée des chevilles depuis le bassin). */
  function assis(c, o) {
    o = o || {};
    const h = o.h == null ? 0.45 : o.h, z = o.z || 0;
    const p = { bassin: { pos: V(0, h + 0.12, z), rot: qX(o.penche || 0) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k, s] of COTES) p.jambes[k] = o.jambes ? cloner(o.jambes) : pied(c, s, { ecart: o.ecart == null ? 0.14 : o.ecart, ouv: o.ouv == null ? 6 : o.ouv, z: z + (o.zPieds == null ? 0.4 : o.zPieds), y0: o.yPieds || 0, pointe: o.pointe });
    c.poserSur(p, V(0, h, 0), AY, ['bassin']);
    return p;
  }
  /* Couché sur le dos, la tête vers -Z, sur un plan à la hauteur h dont le dossier est relevé de `angle` degrés
     (charnière à l'origine). jambes : 'sol' (pieds par terre de part et d'autre du banc), 'plies' (genoux pliés,
     pieds à plat sur le plan), 'tendues', 'levees' (hanches et genoux à 90°) ou des angles. */
  function allonge(c, o) {
    o = o || {};
    const L = c.L, h = o.h || 0, angle = o.angle || 0, a = rad(angle);
    const n = V(0, Math.cos(a), Math.sin(a)), t = V(0, Math.sin(a), -Math.cos(a));   // normale du dossier ; vers la tête
    const d = o.d != null ? o.d : (angle > 0 ? lerp(-0.2, 0.1, Math.min(1, angle / 30)) : -0.2);
    const pos = V(0, h, 0).add(t.clone().multiplyScalar(d)).add(n.clone().multiplyScalar(0.15));
    const p = { bassin: { pos, rot: qX(-90 + angle) }, lombaires: o.lomb == null ? -4 : o.lomb, thorax: o.thor == null ? -3 : o.thor, cou: o.cou == null ? 4 : o.cou, bras: pareil(brasRepos()), jambes: {} };
    const jb = o.jambes || (h > 0.2 ? 'sol' : 'plies');
    for (const [k, s] of COTES) {
      if (jb === 'sol' && angle < 0) {
        // Banc décliné : les genoux passent sur le boudin du haut, les chevilles se calent sous celui du bas.
        p.jambes[k] = { cheville: V(s * 0.1, h - 0.115, 0.57), pole: V(0, 1, 0.2), pied: V(0, 0.5, 0.87), hautPied: V(0, 0.87, -0.5) };
      } else if (jb === 'sol') {
        // Pieds à plat par terre de part et d'autre du banc, tibias presque droits : le genou plie à l'équerre, le pied
        // un rien en retrait du genou (c'est l'appui d'un développé couché).
        const ec = o.ecartPieds || 0.26, hHanche = pos.y - 0.04 - (angle > 0 ? Math.sin(a) * 0.02 : 0), yGenou = L.chevilleH + L.jambe * 0.985;
        const dz = Math.sqrt(Math.max(0.04, L.cuisse * L.cuisse - Math.pow(ec - L.hanche.x, 2) - Math.pow(hHanche - yGenou, 2)));
        p.jambes[k] = pied(c, s, { x: s * ec, ouv: 16, z: pos.z + dz - 0.05, pole: V(s * 0.3, 1, 0.25) });
      }
      else if (jb === 'plies') p.jambes[k] = pied(c, s, { x: s * 0.11, ouv: 4, z: pos.z + 0.47, y0: angle ? 0 : h, pole: V(0, 1, 0.2) });
      else if (jb === 'tendues') p.jambes[k] = J(angle, 4, 0, 2, 25);
      else if (jb === 'levees') p.jambes[k] = J(90, 3, 0, 90, 20);
      else p.jambes[k] = cloner(jb.G ? jb[k] : jb);
    }
    c.poserSur(p, V(0, h, 0), n, ['dos', 'bassin']);
    return p;
  }
  /* À plat ventre, la tête vers +Z, sur un plan à la hauteur h relevé de `angle` degrés (banc incliné, buste
     contre le dossier) ; jambes : 'tendues' ou 'sol' (pieds par terre derrière, pour un banc incliné). */
  function aPlatVentre(c, o) {
    o = o || {};
    const h = o.h || 0, angle = o.angle || 0, a = rad(angle);
    const n = V(0, Math.cos(a), -Math.sin(a)), t = V(0, Math.sin(a), Math.cos(a));   // normale du plan ; vers la tête
    const pos = V(0, h, 0).add(t.clone().multiplyScalar(o.d || 0)).add(n.clone().multiplyScalar(0.15));
    const p = { bassin: { pos, rot: qX(90 - angle) }, lombaires: o.lomb == null ? -3 : o.lomb, thorax: o.thor == null ? -2 : o.thor, cou: o.cou == null ? -12 : o.cou, bras: pareil(brasRepos()), jambes: {} };
    const jb = o.jambes || (angle > 15 ? 'sol' : 'tendues');
    for (const [k, s] of COTES) {
      if (jb === 'sol') p.jambes[k] = pied(c, s, { x: s * 0.2, ouv: 8, z: pos.z - (o.zPieds == null ? 0.62 : o.zPieds), pointe: 55, pole: V(0, -0.3, 1) });
      else if (jb === 'tendues') p.jambes[k] = J(-angle * 0.2, 4, 0, 2, 55);
      else p.jambes[k] = cloner(jb.G ? jb[k] : jb);
    }
    c.poserSur(p, V(0, h, 0), n, o.regions || ['thorax', 'abdomen', 'bassin']);
    return p;
  }
  /* Suspendu à une barre à la hauteur H : épaules à `k` × longueur de bras sous la barre ; renvoie la pose (mains
     sur la barre, écartées de 2 × ecart ; paume : 'pro', 'sup' ou 'neutre'). */
  function suspendu(c, o) {
    o = o || {};
    const L = c.L, H = o.H == null ? 2.3 : o.H, k = o.k == null ? 0.96 : o.k, ecart = o.ecart == null ? 0.3 : o.ecart;
    const p = { bassin: { pos: L.racine.clone(), rot: qX(o.penche || 0) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: {}, jambes: {} };
    const t = c.tronc(p), ep = t.epaules.G;
    // Les épaules sous la barre : à la verticale des mains, à la distance voulue.
    const dx = ecart - ep.x, chute = Math.sqrt(Math.max(0.01, Math.pow((L.bras + L.prise) * k, 2) - dx * dx));
    p.bassin.pos.y += H - chute - ep.y; p.bassin.pos.z += (o.z || 0) - ep.z;
    const paume = o.paume === 'sup' ? V(0, 0, -1) : V(0, 0, 1);
    for (const [kk, s] of COTES) {
      p.bras[kk] = { prise: V(s * ecart, H, o.z || 0), pole: V(s * 1, -0.2, o.paume === 'sup' ? 0.5 : -0.25), paume: o.paume === 'neutre' ? V(-s, 0, 0) : paume.clone(), dirMain: V(0, 1, 0), doigts: 'barre' };
      p.jambes[kk] = o.jambes ? cloner(o.jambes) : J(8, 2, 0, 12, 35);
    }
    // Pendu, bras tendus : le corps descend jusqu'à ce que les coudes le soient (sauf si k dit de combien les plier) ;
    // et les mains tombent juste sur la barre, qui ne bouge pas.
    const surBarre = { G: V(ecart, H, o.z || 0), D: V(-ecart, H, o.z || 0) };
    if (o.k == null) tendre(c, p, V(0, -1, 0), null, null, surBarre); else viser(c, p, surBarre);
    return p;
  }
  /* À genoux, buste droit (ou penché) : cuisses à `flex` degrés de la verticale, tibias au sol. */
  function aGenoux(c, o) {
    o = o || {};
    const p = { bassin: { pos: V(0, 0.6, o.z || 0), rot: qX(o.penche || 0) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    const pen = o.penche || 0, flex = o.flex || 0;
    // Tibias à l'horizontale vers l'arrière : le genou plie de 90° de plus que la cuisse ne s'écarte de la verticale.
    for (const [k] of COTES) p.jambes[k] = J(flex + pen, o.abd == null ? 6 : o.abd, 0, 90 + flex, 62);
    c.poserSur(p, V(), AY, ['jambe', 'pied']);
    return p;
  }
  /* Un genou à terre (côté `bas` : 'G' ou 'D'), l'autre pied posé devant. */
  function demiGenou(c, o) {
    o = o || {};
    const bas = o.bas || 'D', pen = o.penche || 0;
    const p = { bassin: { pos: V(0, 0.6, o.z || 0), rot: qX(pen) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k] of COTES) p.jambes[k] = k === bas ? J(pen, 5, 0, 90, 62) : J(90 + pen, 6, 0, 90, 0);
    c.poserSur(p, V(), AY, ['jambe', 'pied']);
    return p;
  }
  /* À quatre pattes : mains sous les épaules, genoux sous les hanches. */
  function quatrePattes(c, o) {
    o = o || {};
    const p = { bassin: { pos: V(0, 0.5, o.z || 0), rot: qX(o.penche == null ? 86 : o.penche) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou == null ? -25 : o.cou, bras: {}, jambes: {} };
    for (const [k] of COTES) p.jambes[k] = J(86, 6, 0, 90, 62);
    p.bras = pareil(brasRepos());
    c.poserSur(p, V(), AY, ['jambe', 'pied']);
    const t = c.tronc(p);
    for (const [k, s] of COTES) p.bras[k] = { prise: V(t.epaules[k].x + s * 0.01, 0.0, t.epaules[k].z + (o.zMains || 0.02)), pole: V(s * 0.3, 0.2, -1), paume: V(0, -1, 0), dirMain: V(0, 0, 1), doigts: 'plat' };
    return p;
  }
  /* Assis par terre : buste incliné vers l'arrière de `recul` degrés ; jambes par angles (par défaut tendues). */
  function assisSol(c, o) {
    o = o || {};
    const recul = o.recul || 0;
    const p = { bassin: { pos: V(0, 0.2, o.z || 0), rot: qX(-recul) }, lombaires: o.lomb == null ? 8 : o.lomb, thorax: o.thor == null ? 4 : o.thor, cou: o.cou || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k] of COTES) p.jambes[k] = o.jambes ? cloner(o.jambes.G ? o.jambes[k] : o.jambes) : J(90 - recul, 5, 0, 4, 10);
    c.poserSur(p, V(), AY, ['bassin', 'cuisse', 'jambe', 'pied']);
    return p;
  }
  /* Couché sur le côté gauche (la tête vers +X, le visage vers +Z) ; cote = 'D' : sur le côté droit. */
  function surLeCote(c, o) {
    o = o || {};
    const s = o.cote === 'D' ? -1 : 1;
    const p = { bassin: { pos: V(0, 0.25, 0), rot: qZ(-90 * s) }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou || 0, inclinaison: o.incl || 0, bras: pareil(brasRepos()), jambes: {} };
    for (const [k] of COTES) p.jambes[k] = o.jambes ? cloner(o.jambes.G ? o.jambes[k] : o.jambes) : J(18, 0, 0, 25, 20);
    c.poserSur(p, V(), AY);
    return p;
  }
  /* Corps gainé en appui sur les pieds (ou les genoux) et les mains : renvoie une fonction qui donne la pose pour
     une hauteur d'épaules. Options : yPieds, zPieds (appui des pieds), genoux (appui sur les genoux),
     ecartPieds, yMains (hauteur des mains), cou. */
  function planche(c, o) {
    o = o || {};
    const L = c.L, yP = o.yPieds || 0, zP = o.zPieds == null ? -1.22 : o.zPieds;
    const base = { bassin: { pos: V(), rot: new Quat() }, lombaires: o.lomb || 0, thorax: o.thor || 0, cou: o.cou == null ? -22 : o.cou, bras: pareil(brasRepos()), jambes: {} };
    // Le pivot : la cheville (pointe de pied au sol), ou le genou.
    const pivot = o.genoux ? V(0, yP + L.genou + 0.03, zP) : V(0, yP + 0.15, zP);
    const portee = o.genoux ? L.cuisse : L.jambe + L.cuisse - 0.004;
    return hEp => {
      const p = cloner(base);
      let alpha = 0.3, t;
      for (let k = 0; k < 6; k++) {
        p.bassin.rot = qAxe(AX, Math.PI / 2 - alpha);
        const dir = V(0, Math.sin(alpha), Math.cos(alpha));
        p.bassin.pos = pivot.clone().add(dir.multiplyScalar(portee)).sub(L.hanche.clone().setX(0).applyQuaternion(p.bassin.rot));
        t = c.tronc(p);
        alpha += Math.asin(borne((hEp - t.epaules.G.y) / 1.4, -0.9, 0.9));
      }
      for (const [k, s] of COTES) {
        if (o.genoux) p.jambes[k] = { cheville: V(s * (o.ecartPieds || 0.09), yP + 0.2, zP - L.jambe * 0.92), pole: V(0, -1, 0.3), pied: V(0, 0.3, -1), hautPied: V(0, -1, -0.3) };
        else p.jambes[k] = { cheville: V(s * (o.ecartPieds || 0.09), pivot.y, zP), pole: V(0, -1, 0.15), pied: V(0, -1, 0.22), hautPied: V(0, 0.2, 1), orteils: 60 };
      }
      p.epaules = t.epaules;
      return p;
    };
  }

  /* Où mettre les mains quand elles ne travaillent pas. t : repères du tronc (c.tronc). */
  function mains(c, t, ou) {
    const r = {};
    for (const [k, s] of COTES) {
      const dT = (x, y, z) => V(s * x, y, z).applyQuaternion(t.qThorax);
      if (ou === 'hanches') r[k] = { prise: t.hanches[k].clone().add(V(s * 0.085, 0.1, 0.03).applyQuaternion(t.qBassin)), pole: dT(0.8, 0, -0.6), paume: dT(-1, -0.2, 0), dirMain: dT(-0.2, -0.3, 1), doigts: 'detendu' };
      else if (ou === 'nuque') r[k] = { prise: t.tete.clone().add(dT(0.075, 0.03, -0.085)), pole: dT(1, -0.1, -0.1), paume: dT(-0.3, 0, 1), dirMain: dT(-1, 0.2, -0.2), doigts: 'detendu' };
      else if (ou === 'oreilles') r[k] = { prise: t.tete.clone().add(dT(0.105, 0.05, 0.0)), pole: dT(1, -0.05, 0.35), paume: dT(-1, 0, 0.2), dirMain: dT(-0.3, 1, 0), doigts: 'detendu' };   // couché : mains aux tempes, coudes ouverts
      else if (ou === 'poitrine') r[k] = { prise: t.duThorax(V(-s * 0.1, -0.1, 0.17)), pole: dT(0.6, -1, 0.2), paume: dT(0, 0, -1), dirMain: dT(-1, 0.5, 0), doigts: 'detendu' };
      else if (ou === 'devant') r[k] = B(8, 88, 0, 4, 180, { doigts: 'detendu' });
      else if (ou === 'haut') r[k] = B(20, 172, 0, 4, 90, { doigts: 'detendu' });
      else if (ou === 'croix') r[k] = B(90, 88, 0, 4, 180, { doigts: 'detendu' });
      else if (ou === 'jointes') r[k] = { prise: t.duThorax(V(s * 0.012, -0.12, 0.27)), pole: dT(0.7, -1, 0), paume: dT(-1, 0, 0), dirMain: dT(0, 0.5, 1), doigts: 'detendu' };
      else r[k] = brasRepos();
    }
    return r;
  }

  /* Déplace le bassin de la pose p pour qu'une articulation du tronc se trouve à l'endroit voulu. */
  function ancrer(c, p, nom, cible) { c.tronc(p); p.bassin.pos.add(cible.clone().sub(c.monde(nom))); return p; }
  /* Bras tendus. L'épaule monte avec le bras (ceinture scapulaire) : une « longueur de bras » comptée depuis l'épaule au
     repos laisse le coude plié de 60 à 75° dès que le bras passe au-dessus de la tête. coudeTendu cherche donc, sur le
     corps posé, la valeur x (entre a et b) pour laquelle le coude le plus tendu de poseDe(x) est à `cible` degrés — 10 par
     défaut : le bras est tendu, la main reste sur sa prise (si les deux bras ne tirent pas pareil, l'autre plie un peu
     plus : aucun ne dépasse sa portée). x doit éloigner la main de l'épaule en grandissant.
     tendre fait de même en déplaçant le bassin le long de dir (unitaire : vers où le corps s'éloigne des mains — vers
     le bas pendu à une barre, vers le haut en appui renversé) ; la pose est modifiée sur place et rendue. Avec
     `cibles` ({ G, D } : où les mains doivent tomber au juste, voir viser), le coude se mesure mains posées sur elles. */
  function coudeTendu(c, poseDe, a, b, cible, cotes) {
    cible = cible == null ? 10 : cible; cotes = cotes || ['G', 'D'];
    const plie = x => { const an = c.poser(poseDe(x)).angles; return Math.min(...cotes.map(k => an[k].coude)); };
    if (plie(a) <= cible) return null;                    // déjà tendu au plus près : rien à régler
    for (let n = 0; n < 12; n++) { const m = (a + b) / 2; if (plie(m) > cible) a = m; else b = m; }
    return a;
  }
  function tendre(c, p, dir, cible, cotes, cibles) {
    const p0 = p.bassin.pos.clone();
    const place = x => {
      p.bassin.pos = p0.clone().add(dir.clone().multiplyScalar(x));
      if (cibles) { for (const k in cibles) p.bras[k].prise = cibles[k].clone(); viser(c, p, cibles); }
      return p;
    };
    const x = coudeTendu(c, place, -0.3, 0.3, cible, cotes);
    return place(x == null ? 0 : x);
  }
  /* Une main posée par cible n'arrive pas exactement sur sa prise : le radius tourne autour de l'ulna, et le poignet
     se décale de 2 à 3 cm selon la pronation. Là où la place de la barre compte au centimètre (contre le corps, devant
     le visage), la cible est corrigée de l'écart constaté jusqu'à ce que la prise tombe juste. cibles : { G, D } (ou un
     seul côté) ; la pose est modifiée sur place ; rend ce que rend poser. */
  function viser(c, p, cibles) {
    for (let n = 0; n < 3; n++) {
      const info = c.poser(p);
      let pire = 0;
      for (const k in cibles) { const e = cibles[k].clone().sub(info.prises[k]); pire = Math.max(pire, e.length()); p.bras[k].prise = p.bras[k].prise.clone().add(e); }
      if (pire < 5e-4) return info;
    }
    return c.poser(p);
  }
