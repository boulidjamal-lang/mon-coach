
  /* ---------- Du texte au mouvement ----------
     Un mouvement s'écrit « famille option option clé=valeur » (par exemple « curl hal assis alt »). Chaque famille
     reçoit le corps, ses options et les teintes, et rend :
       a, b      — la pose de départ et la pose d'arrivée (le déroulé les mélange) ; ou cles : [[u, pose], …] ;
                   ou pose(u) pour un mouvement calculé (rythme 'continu' : u est la phase d'un cycle) ;
       rythme    — 'rep' (aller, pause, retour), 'alt' (un côté puis l'autre : `alterne` dit quels membres),
                   'tenue' (position tenue, respiration), 'etire' (étirement : on y va, on tient, on revient),
                   'continu' (cycle sans pause : course, vélo, battements), 'boucle' (poses clés jouées dans l'ordre
                   sur un cycle : la dernière rejoint la première) ;
       tenu      — le matériel tenu : [{ t: 'haltere' | 'barre' | 'kb' | 'disque' | 'balle' | 'poignee', m: 'G' | 'D' | 'GD', … },
                   { t: 'cable' | 'elastique' | 'sangle' | 'levier', de: point, m, bout: 'barre' | 'corde' | 'poignee' }] ;
       fixe      — le matériel posé (formes prêtes) ; objets(info, u, sortie) — matériel calculé à chaque image ;
       vue       — { az, el } : d'où regarder. */
  const FAM = {};
  function lireSpec(spec) {
    const mots = String(spec).trim().split(/\s+/), o = { _: mots.slice(1) };
    for (const m of mots.slice(1)) {
      const k = m.indexOf('=');
      if (k > 0) { const v = m.slice(k + 1); o[m.slice(0, k)] = v !== '' && !isNaN(v) ? +v : v; } else o[m] = true;
    }
    return { f: mots[0], o };
  }
  function definir(spec, c, C) {
    const { f, o } = lireSpec(spec);
    if (!FAM[f]) throw new Error('mouvement inconnu : ' + f);
    const d = FAM[f](c, o, C);
    d.spec = spec; d.famille = f; d.o = o;
    if (d.cles) unifier(c, d.cles.map(x => x[1])); else if (d.a && d.b) unifier(c, [d.a, d.b]);
    // Les pieds posés doivent atteindre leur appui : sinon le bassin est rapproché (poses clés une fois pour toutes,
    // poses calculées à chaque image).
    if (d.cles) d.cles.forEach(x => appuyer(c, x[1])); else if (d.a && d.b) { appuyer(c, d.a); appuyer(c, d.b); }
    if (d.pose) { const f = d.pose; d.pose = (x, y) => appuyer(c, f(x, y)); }
    if (o.amp && d.rythme !== 'boucle' && !d.pose) {
      // Amplitude partielle : on ne va qu'à la fraction demandée du mouvement.
      if (d.cles) { const fin = chemin(d.cles, o.amp); d.cles = d.cles.filter(x => x[0] < o.amp).map(x => [x[0] / o.amp, x[1]]).concat([[1, fin]]); }
      else if (d.a && d.b) d.b = mel(d.a, d.b, o.amp);
    }
    d.rythme = d.rythme || 'rep';
    d.periode = d.periode || { rep: 2.8, alt: 4.6, tenue: 4, etire: 7, continu: 1.2, boucle: 3.4 }[d.rythme];
    d.tenu = d.tenu || []; d.fixe = d.fixe || [];
    // Une machine à bras de levier arrive ici sans bâti : on lui donne le sien (montants, pile de poids, la traverse
    // qui porte les pivots, une poutre au sol jusqu'au siège). Le bâti se tient derrière le corps, ou devant quand
    // les pivots y sont (rowing) ; la pile monte avec le mouvement.
    if (o.machine && !d.fixe.some(x => x.leve)) {
      const info = c.poser(poseA(d, 0, 0));
      const pivots = d.tenu.filter(e => e.t === 'levier' && e.de).map(e => (typeof e.de === 'function' ? e.de(info, 0) : e.de)).filter(p => p && p.x != null);
      if (pivots.length) {
        const zP = pivots.reduce((t, p) => t + p.z, 0) / pivots.length, yP = Math.max(...pivots.map(p => p.y)), zC = info.bassin.z;
        const devant = zP - zC > 0.6, zF = devant ? zP + 0.14 : Math.min(zC, zP) - 0.6, H = Math.max(1.5, yP + 0.12), f = deplacer(bati(C, H, 0), V(0, 0, zF), devant ? qY(180) : null);
        for (const p of pivots) { f.push(tube(V(Math.sign(p.x || 1) * 0.2, H, zF), p, 0.045, C.cadre), cyl(0.042, 0.05, p.x, p.y, p.z, C.cadre, 0.5, null, 0.01)); }
        if (pivots.length > 1) f.push(tube(pivots[0], pivots[1], 0.045, C.cadre));
        f.push(tube(V(0, 0.03, zF), V(0, 0.03, zC), 0.05, C.cadre));
        poserObjet(horsCadre(f), V(), null, d.fixe);
        if (!d.levee) d.levee = (i2, u) => 0.26 * Math.max(0, Math.min(1, u));
      }
    }
    // Une tour de poulie : on relève la longueur de câble la plus courte du mouvement, d'où part la pile de poids.
    if (d.fixe.some(x => x.leve) && d.tenu.some(e => e.t === 'cable')) {
      let mini = Infinity;
      for (let i = 0; i <= 8; i++) { const l = materielDe(d, c.poser(poseA(d, 0, i / 8)), i / 8, C, {}).cable; if (l != null && l < mini) mini = l; }
      if (isFinite(mini)) d.cable0 = mini;
    }
    return d;
  }
  /* Deux poses clés ne se mélangent que si elles décrivent chaque membre de la même façon. Quand l'une donne des angles
     et l'autre une cible (main posée, pied au sol), celle qui est en angles est convertie : on pose le corps, et on
     note où arrivent la main ou le pied. */
  const enCible = {
    bras: (info, k, b) => ({ prise: info.prises[k].clone(), pole: info.coudes[k].clone().sub(info.epaules[k]), paume: info.paumes[k].clone(), dirMain: info.dirMains[k].clone(), doigts: b.doigts, hausse: b.hausse, avance: b.avance, ceinture: b.ceinture }),
    jambes: (info, k, j) => ({ cheville: info.chevilles[k].clone(), pole: info.genoux[k].clone().sub(info.hanches[k]), pied: info.pieds[k].pied.clone(), hautPied: info.pieds[k].hautPied.clone(), orteils: j.orteils })
  };
  const parCible = { bras: b => b.elev == null && !b.dirBras, jambes: j => j.flex == null };
  function unifier(c, poses) {
    for (const m of ['bras', 'jambes']) for (const k of ['G', 'D']) {
      const n = poses.filter(p => parCible[m](p[m][k])).length;
      if (!n || n === poses.length) continue;
      for (const p of poses) if (!parCible[m](p[m][k])) { const info = c.poser(p); p[m] = Object.assign({}, p[m], { [k]: enCible[m](info, k, p[m][k]) }); }
    }
    return poses;
  }
  /* Quand un pied posé (décrit par sa cible) n'atteint pas son appui, la jambe est trop courte pour la position du
     bassin : le bassin est rapproché d'autant. La pose est modifiée sur place (et rendue). */
  function appuyer(c, p) {
    if (!(p.jambes.G.cheville || p.jambes.D.cheville)) return p;
    for (let n = 0; n < 3; n++) {
      const info = c.poser(p); let pire = null, ecart = 0.012;
      for (const k of ['G', 'D']) { const cible = p.jambes[k].cheville; if (!cible) continue; const e = info.chevilles[k].clone().sub(cible), l = e.length(); if (l > ecart) { ecart = l; pire = e; } }
      if (!pire) break;
      p.bassin = { pos: p.bassin.pos.clone().sub(pire), rot: p.bassin.rot };
    }
    return p;
  }
  /* Une répétition sur une phase p de 0 à 1 : repos, aller, pause, retour. */
  function rep(p) {
    if (p < 0.1) return 0;
    if (p < 0.48) return lisse((p - 0.1) / 0.38);
    if (p < 0.58) return 1;
    return 1 - lisse((p - 0.58) / 0.42);
  }
  const phase = (t, periode) => ((t % periode) + periode) % periode / periode;
  function cycle(t, periode = 2.8) { return rep(phase(t, periode)); }
  /* Le long d'une suite de poses clés [[u0, pose0], [u1, pose1], …]. */
  function chemin(cles, u) {
    if (u <= cles[0][0]) return cles[0][1];
    for (let i = 1; i < cles.length; i++) if (u <= cles[i][0]) return mel(cles[i - 1][1], cles[i][1], (u - cles[i - 1][0]) / (cles[i][0] - cles[i - 1][0] || 1));
    return cles[cles.length - 1][1];
  }
  const entre = (d, u) => (d.cles ? chemin(d.cles, u) : mel(d.a, d.b, u));
  /* Où en est le mouvement à l'instant t (secondes), ou pour une avancée imposée u (contrôles, arrêt sur image) :
     { u } pour une répétition, { uG, uD, u } pour un mouvement alterné, { u: phase } pour un cycle. */
  function avancee(d, t, uFixe) {
    if (d.rythme === 'continu' || d.rythme === 'boucle') return { u: uFixe != null ? uFixe : phase(t, d.periode) };
    if (d.rythme === 'alt') {
      if (uFixe != null) return { uG: uFixe, uD: 0, u: uFixe };
      const ph = phase(t, d.periode), uG = ph < 0.5 ? rep(ph * 2) : 0, uD = ph >= 0.5 ? rep((ph - 0.5) * 2) : 0;
      return { uG, uD, u: Math.max(uG, uD) };
    }
    if (uFixe != null) return { u: uFixe };
    const ph = phase(t, d.periode);
    if (d.rythme === 'tenue') return { u: 0.5 - 0.5 * Math.cos(2 * Math.PI * ph) };
    if (d.rythme === 'etire') return { u: ph < 0.22 ? lisse(ph / 0.22) : ph < 0.8 ? 1 : 1 - lisse((ph - 0.8) / 0.2) };
    return { u: rep(ph) };
  }
  /* La pose pour une avancée donnée (voir avancee). */
  function poseDe(d, av) {
    if (d.rythme === 'continu') return d.pose(av.u);
    if (d.rythme === 'boucle') {
      // D'une pose clé à la suivante, avec un départ et une arrivée en douceur (sauf d.file : passage sans arrêt).
      const ph = av.u, K = d.cles;
      if (ph <= K[0][0]) return K[0][1];
      for (let i = 1; i < K.length; i++) if (ph <= K[i][0]) { const x = (ph - K[i - 1][0]) / (K[i][0] - K[i - 1][0] || 1); return mel(K[i - 1][1], K[i][1], d.file ? x : lisse(x)); }
      return K[K.length - 1][1];
    }
    if (d.rythme === 'alt') {
      const { uG, uD } = av;
      if (d.pose) return d.pose(uG, uD);
      // Le tronc suit le côté qui travaille (ou reste en place) ; chaque membre alterné suit son côté.
      const p = cloner(entre(d, d.troncSuit ? Math.max(uG, uD) : 0)), pG = entre(d, uG), pD = entre(d, uD);
      for (const m of d.alterne || ['bras']) { p[m] = { G: pG[m].G, D: pD[m].D }; }
      return p;
    }
    return d.pose ? d.pose(av.u) : entre(d, av.u);
  }
  const poseA = (d, t, uFixe) => poseDe(d, avancee(d, t, uFixe));
  /* Le matériel de l'image : posé, tenu dans les mains, tendu (câbles, élastiques, sangles). */
  function materielDe(d, info, u, C, modeles) {
    const sortie = d.fixe.slice();
    let cable = null;   // longueur du premier câble : la pile de poids de sa tour monte d'autant
    const prise = m => (m === 'GD' || !m ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[m]);
    const cotes = m => (m === 'GD' || !m ? ['G', 'D'] : [m]);
    const point = (v, m) => (v === 'pieds' ? info.orteils.G.clone().add(info.orteils.D).multiplyScalar(0.5).setY(Math.min(info.orteils.G.y, info.orteils.D.y) - 0.02) : v === 'pied' ? info.orteils[m === 'D' ? 'D' : 'G'].clone().add(V(0, -0.02, 0)) : typeof v === 'function' ? v(info, u) : v);
    for (const e of d.tenu) {
      const mod = cle => modeles[cle] || (modeles[cle] = null);
      if (e.t === 'barre') {
        const axe = info.prises.G.clone().sub(info.prises.D);
        const cle = e.ez ? 'ez' : 'barre' + (e.l || '') + (e.d == null ? '' : e.d);
        const f = modeles[cle] || (modeles[cle] = e.ez ? MAT.barreEz(C) : MAT.barre(C, e.l || 1.6, e.d == null ? 0.225 : e.d));
        const pos = e.pos ? point(e.pos) : prise('GD');
        poserObjet(f, e.centre === false ? pos : pos.clone().setX(e.x0 == null ? pos.x : e.x0), e.rot || qTenu(axe.lengthSq() > 1e-6 ? axe : AX, AY), sortie);
      } else if (e.t === 'haltere' || e.t === 'poignee' || e.t === 'kb') {
        const f = modeles[e.t + (e.k || '')] || (modeles[e.t + (e.k || '')] = e.t === 'haltere' ? MAT.haltere(C, e.k || 1) : e.t === 'kb' ? MAT.kettlebell(C) : MAT.poignee(C));
        // Un seul objet tenu à deux mains (entre) : au milieu, dans l'axe des deux mains.
        if (e.entre) { poserObjet(f, prise('GD'), qTenu(info.prises.G.clone().sub(info.prises.D), AY), sortie); continue; }
        for (const k of cotes(e.m)) {
          // La poignée en travers de la paume ; la boule d'un kettlebell pend, ou repose sur l'avant-bras.
          let haut = AY;
          if (e.t === 'kb') haut = e.sens === 'avantbras' ? info.dirMains[k].clone().multiplyScalar(0.8).add(info.paumes[k].clone().multiplyScalar(0.6)) : AY;
          poserObjet(f, info.prises[k], qTenu(info.axes[k], haut), sortie);
        }
      } else if (e.t === 'disque' || e.t === 'balle') {
        const f = modeles[e.t + (e.r || '')] || (modeles[e.t + (e.r || '')] = e.t === 'disque' ? MAT.disque(C, e.r || 0.2) : MAT.balle(C, e.r || 0.11));
        const pos = e.pos ? point(e.pos) : prise(e.m);
        const axe = e.m && e.m !== 'GD' ? info.paumes[e.m] : info.prises.G.clone().sub(info.prises.D);
        poserObjet(f, pos, e.t === 'disque' ? qTenu(e.axe || (axe.lengthSq() > 1e-6 ? axe : AX), AY) : null, sortie);
      } else if (e.t === 'cable' || e.t === 'elastique' || e.t === 'sangle' || e.t === 'levier') {
        const r = e.t === 'cable' ? 0.0045 : e.t === 'elastique' ? 0.007 : e.t === 'sangle' ? 0.009 : 0.017;
        const teinte = e.t === 'cable' ? C.cable : e.t === 'elastique' ? C.elastique : e.t === 'sangle' ? C.sangle : C.cadre;
        const metal = e.t === 'cable' || e.t === 'levier' ? 0.6 : 0;
        const bouts = e.vers ? [point(e.vers, e.m)] : e.bout === 'barre' || e.bout === 'corde' ? [prise('GD')] : cotes(e.m).map(k => info.prises[k]);
        const departs = Array.isArray(e.de) ? e.de : [e.de];
        bouts.forEach((b, n) => {
          const de = point(departs[Math.min(n, departs.length - 1)], cotes(e.m)[n]);
          if (e.t === 'cable' && cable == null) cable = de.distanceTo(b);
          if (e.bout === 'corde') {
            // La corde : le câble s'arrête avant les mains, deux brins vont à chacune.
            const noeud = b.clone().add(unite(de.clone().sub(b)).multiplyScalar(0.12));
            sortie.push(pret(seg(de, noeud, r, teinte, metal)));
            sortie.push(pret(Object.assign(sphere(0.016, 0, 0, 0, C.metal, 0.8), { p: noeud })));
            for (const k of ['G', 'D']) {
              // Chaque brin dépasse un peu la main et finit par une boule de gomme.
              const brin = unite(info.prises[k].clone().sub(noeud)), bout = info.prises[k].clone().add(brin.clone().multiplyScalar(0.07));
              sortie.push(pret(seg(noeud, bout, 0.011, C.sangle, 0, 0.011)));
              sortie.push(pret(Object.assign(sphere(0.021, 0, 0, 0, C.gomme, 0), { p: bout })));
            }
          } else if (e.bout === 'anneau') {
            // L'anneau pend au bout de la sangle ; la main le tient par le bas.
            const k = cotes(e.m)[n], dir = unite(de.clone().sub(b)), centre = b.clone().add(dir.clone().multiplyScalar(0.088));
            sortie.push(pret(seg(de, centre.clone().add(dir.clone().multiplyScalar(0.1)), r, teinte, metal)));
            poserObjet(modeles.anneau || (modeles.anneau = [tore(0.1, 0, 0, 0, C.bois, 0, null, 0.014)]), centre, qTenu(info.axes[k], dir), sortie);
          } else if (e.t === 'cable' && e.bout === 'poignee') {
            // Poignée de câble : le câble s'arrête à un mousqueton, deux brins d'étrier rejoignent les bouts du manchon.
            const k = cotes(e.m)[n], dir = unite(de.clone().sub(b)), attache = b.clone().add(dir.clone().multiplyScalar(0.1));
            sortie.push(pret(seg(de, attache, r, teinte, metal)));
            for (const s of [1, -1]) sortie.push(pret(seg(attache, b.clone().add(info.axes[k].clone().multiplyScalar(s * 0.07)), 0.0045, C.metal, 0.8, 0.0045)));
          } else if (e.t === 'levier') sortie.push(pret(tube(de, b, 0.034, C.cadre)));
          else sortie.push(pret(seg(de, b, r, teinte, metal)));
        });
        if (e.bout === 'barre') {
          const f = modeles['barrette' + (e.l || '')] || (modeles['barrette' + (e.l || '')] = MAT.barrette(C, e.l || 0.9));
          const axe = info.prises.G.clone().sub(info.prises.D);
          poserObjet(f, prise('GD'), qTenu(axe.lengthSq() > 1e-6 ? axe : AX, AY), sortie);
        } else if (e.bout === 'poignee' || (e.t === 'levier' && e.bout !== 'rien')) {
          const f = modeles.poignee || (modeles.poignee = MAT.poignee(C));
          for (const k of cotes(e.m)) poserObjet(f, info.prises[k], qTenu(info.axes[k], AY), sortie);
        }
      }
    }
    if (d.objets) d.objets(info, u, sortie);
    // Les plaques levées de la pile suivent le câble (d.cable0 : sa longueur la plus courte pendant le mouvement).
    sortie.cable = cable;
    if (d.levee || (cable != null && d.cable0 != null)) {
      // (une machine sans câble apparent dit elle-même de combien sa pile monte : d.levee)
      const dy = borne(d.levee ? d.levee(info, u) : cable - d.cable0, 0, 1.2);
      if (dy > 0.001) for (let i = 0; i < d.fixe.length; i++) if (sortie[i].leve) { const o = sortie[i]; sortie[i] = Object.assign({}, o, { p: [o.p[0], o.p[1] + dy, o.p[2]] }); }
    }
    return sortie;
  }
  const pret = f => { const o = { forme: f.forme, s: f.s, q: [f.q.x, f.q.y, f.q.z, f.q.w], p: [f.p.x, f.p.y, f.p.z], couleur: f.couleur, metal: f.metal }; if (f.r) o.r = f.r; if (f.leve) o.leve = f.leve; if (f.hors) o.hors = 1; return o; };
  /* Matériel posé : des formes dans leur repère, placées une fois pour toutes. */
  const poseFixe = (formes, pos, rot) => poserObjet(formes, pos || V(), rot || null, []);
