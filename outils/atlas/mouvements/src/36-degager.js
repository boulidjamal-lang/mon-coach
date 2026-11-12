  /* ---------- Le matériel tenu ne traverse pas celui qui le tient ----------
     Un haltère qui pend le long de la cuisse, une barre contre le ventre, un disque devant le bassin : les familles les
     placent par angles, et le corps a pris de la carrure depuis — la fonte entrait dans la chair. Au lieu de retoucher
     chaque famille, le mouvement est vérifié une fois à sa définition : à quelques instants de sa course, on pose le
     corps et son matériel, et l'on cherche les points de la surface du corps (hors le bras qui tient) à l'intérieur des
     formes tenues. S'il y en a, la main qui tient est déplacée — du plus court chemin qui sort la fonte de la chair
     (les deux mains ensemble pour un objet à deux mains). Ces déplacements (b.dg : voir Corps.bras) sont gardés en
     table (d.degage) et ajoutés à la pose à chaque image, mélangés d'un instant au suivant.
     Ce qui se touche de près reste admis (TOL_TENU) : la barre posée sur les cuisses, le disque contre la poitrine. */
  const TENUS = /^(haltere|kb|barre|disque|balle|poignee)$/, TOL_TENU = 0.006, DEGAGE_MAX = 0.16;
  const REG_CORPS = ['tete', 'cou', 'thorax', 'dos', 'abdomen', 'bassin', 'cuisse', 'jambe', 'pied'], REG_BRAS = ['epaule', 'bras', 'avant_bras'];
  /* Distance signée d'un point à une forme prête (p, q en tableaux) : négative dedans. */
  function distanceForme(f, x, y, z) {
    const vx = x - f.p[0], vy = y - f.p[1], vz = z - f.p[2], qx = -f.q[0], qy = -f.q[1], qz = -f.q[2], qw = f.q[3], s = f.s;
    const tx = qy * vz - qz * vy + qw * vx, ty = qz * vx - qx * vz + qw * vy, tz = qx * vy - qy * vx + qw * vz;
    const lx = vx + 2 * (qy * tz - qz * ty), ly = vy + 2 * (qz * tx - qx * tz), lz = vz + 2 * (qx * ty - qy * tx);
    if (f.forme === 'boite') { const ax = Math.abs(lx) - s[0] / 2, ay = Math.abs(ly) - s[1] / 2, az = Math.abs(lz) - s[2] / 2; return Math.hypot(Math.max(ax, 0), Math.max(ay, 0), Math.max(az, 0)) + Math.min(Math.max(ax, ay, az), 0); }
    if (f.forme === 'cylindre' || f.forme === 'hexa') { const dr = Math.hypot(lx, lz) - s[0] * (f.forme === 'hexa' ? 0.93 : 1), dy = Math.abs(ly) - s[1] / 2; return Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) + Math.min(Math.max(dr, dy), 0); }
    if (f.forme === 'sphere') return Math.hypot(lx, ly, lz) - s[0];
    if (f.forme === 'tore' || ly >= 0) return Math.hypot(Math.hypot(lx, ly) - s[0], lz) - (f.r || 0);
    return Math.min(Math.hypot(lx - s[0], ly, lz), Math.hypot(lx + s[0], ly, lz)) - (f.r || 0);
  }
  const rayonForme = f => (f.forme === 'boite' ? Math.hypot(f.s[0], f.s[1], f.s[2]) / 2 : f.forme === 'cylindre' || f.forme === 'hexa' ? Math.hypot(f.s[0], f.s[1] / 2) : f.forme === 'sphere' ? f.s[0] : f.s[0] + (f.r || 0));
  const avecDegagement = (p, g) => (g ? Object.assign({}, p, { bras: { G: g.G ? Object.assign({}, p.bras.G, { dg: g.G }) : p.bras.G, D: g.D ? Object.assign({}, p.bras.D, { dg: g.D }) : p.bras.D } }) : p);
  /* Les déplacements à un instant : lus dans la table, mélangés entre deux instants voisins. */
  function degagementA(d, av) {
    const lire = (t, u) => {
      if (!t) return null;
      const n = t.length;
      let i, j, k;
      if (d.degageCycle) { const x = (((u % 1) + 1) % 1) * n; i = Math.floor(x) % n; j = (i + 1) % n; k = x - Math.floor(x); }
      else { const x = Math.min(1, Math.max(0, u)) * (n - 1); i = Math.min(n - 2, Math.floor(x)); j = i + 1; k = x - i; }
      return t[i].clone().lerp(t[j], k);
    };
    return { G: lire(d.degage.G, av.uG != null ? av.uG : av.u), D: lire(d.degage.D, av.uD != null ? av.uD : av.u) };
  }
  function degagerTenu(c, d, C) {
    if (!c.sourcePeau || !d.tenu.some(e => TENUS.test(e.t))) return;
    const cycle = d.rythme === 'continu' || d.rythme === 'boucle';
    const instants = []; for (let i = 0, n = cycle ? 16 : 8; i < (cycle ? n : n + 1); i++) instants.push(i / n);
    const table = { G: [], D: [] }, utile = { G: false, D: false }, modeles = {};
    for (const u of instants) {
      const g = degagerInstant(c, d, C, d.rythme === 'alt' ? { uG: u, uD: 0, u } : { u }, u, modeles);
      for (const k of ['G', 'D']) { table[k].push(g[k]); if (g[k].lengthSq() > 1e-8) utile[k] = true; }
    }
    if (d.rythme === 'alt') { table.D = table.G.map(v => V(-v.x, v.y, v.z)); utile.D = utile.G; }   // le côté droit refait, en miroir, la course du gauche
    if (!utile.G && !utile.D) return;
    if (cycle) {
      // En boucle, une main qui ne bouge presque pas (la charge portée en marchant) garde le même dégagement tout le
      // tour — le plus grand : sinon la charge irait et viendrait à chaque passage de la cuisse.
      const lieux = instants.map(u => { const i = c.poser(poseDe(d, { u })); return { G: i.prises.G.clone(), D: i.prises.D.clone() }; });
      for (const k of ['G', 'D']) {
        if (!utile[k]) continue;
        let course = 0; for (const a of lieux) for (const b of lieux) course = Math.max(course, a[k].distanceTo(b[k]));
        if (course < 0.08) { let m = table[k][0]; for (const v of table[k]) if (v.lengthSq() > m.lengthSq()) m = v; table[k] = table[k].map(() => m.clone()); }
      }
    }
    d.degage = { G: utile.G ? table.G : null, D: utile.D ? table.D : null }; d.degageCycle = cycle;
  }
  /* Distance entre deux segments [a, b] et [c2, d2]. */
  function entreSegments(a, b, c2, d2) {
    const u = b.clone().sub(a), v = d2.clone().sub(c2), w = a.clone().sub(c2), A = u.dot(u), B = u.dot(v), Cc = v.dot(v), D = u.dot(w), E = v.dot(w), den = A * Cc - B * B;
    let sN, sD = den, tN, tD = den;
    if (den < 1e-10) { sN = 0; sD = 1; tN = E; tD = Cc; } else { sN = B * E - Cc * D; tN = A * E - B * D; if (sN < 0) { sN = 0; tN = E; tD = Cc; } else if (sN > sD) { sN = sD; tN = E + B; tD = Cc; } }
    if (tN < 0) { tN = 0; if (-D < 0) sN = 0; else if (-D > A) sN = sD; else { sN = -D; sD = A; } }
    else if (tN > tD) { tN = tD; if (-D + B < 0) sN = 0; else if (-D + B > A) sN = sD; else { sN = -D + B; sD = A; } }
    const sc = Math.abs(sN) < 1e-10 ? 0 : sN / (sD || 1), tc = Math.abs(tN) < 1e-10 ? 0 : tN / (tD || 1);
    return w.add(u.multiplyScalar(sc)).sub(v.multiplyScalar(tc)).length();
  }
  /* Le point de [a, b] le plus proche de (x, y, z). */
  function surSegment(a, b, x, y, z) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, l2 = ux * ux + uy * uy + uz * uz;
    const k = l2 > 1e-12 ? Math.min(1, Math.max(0, ((x - a.x) * ux + (y - a.y) * uy + (z - a.z) * uz) / l2)) : 0;
    return [a.x + ux * k, a.y + uy * k, a.z + uz * k];
  }
  /* Des points à la surface d'une forme prête (dans le monde) : pour savoir si elle entre dans un coussin. */
  function pointsDeForme(f) {
    const q = new Quat(f.q[0], f.q[1], f.q[2], f.q[3]), P = [], s = f.s;
    const m = (x, y, z) => { const v = V(x, y, z).applyQuaternion(q); P.push(v.x + f.p[0], v.y + f.p[1], v.z + f.p[2]); };
    if (f.forme === 'cylindre' || f.forme === 'hexa') {
      const n = Math.max(2, Math.ceil(s[1] / 0.07));
      for (let i = 0; i <= n; i++) { const y = -s[1] / 2 + s[1] * i / n; m(0, y, 0); for (let k = 0; k < 6; k++) m(s[0] * Math.cos(k * Math.PI / 3), y, s[0] * Math.sin(k * Math.PI / 3)); }
    } else if (f.forme === 'sphere') { m(0, 0, 0); for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c2 of [-1, 0, 1]) if (a || b || c2) { const l = s[0] / Math.hypot(a, b, c2); m(a * l, b * l, c2 * l); } }
    else if (f.forme === 'boite') { for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c2 of [-1, 0, 1]) m(a * s[0] / 2, b * s[1] / 2, c2 * s[2] / 2); }
    else for (let k = 0; k < 8; k++) { const a = k * Math.PI / (f.forme === 'tore' ? 4 : 7); m(s[0] * Math.cos(a), s[0] * Math.sin(a), 0); }
    return P;
  }
  /* De combien déplacer chaque main, à un instant, pour que ce qu'elle tient n'entre ni dans le corps ni dans un coussin. */
  function degagerInstant(c, d, C, av, u, modeles) {
    const g = { G: V(), D: V() };
    for (let passe = 0; passe < 3; passe++) {
      const info = c.poser(avecDegagement(poseDe(d, av), g));
      const tout = materielDe(d, info, u, C, modeles), tenus = tout.slice(d.fixe.length).filter(f => f.tenu && TENUS.test(f.tenu));
      if (!tenus.length) break;
      // Les coussins du matériel posé (bancs, sièges, pupitres) : la fonte n'y entre pas non plus.
      const coussins = tout.slice(0, d.fixe.length).filter(f => f.appui && f.forme === 'boite');
      // Le corps en gros : par groupe de régions, les os (segments) et l'épaisseur de chair autour. Sert à savoir quelles
      // régions lire quand une forme s'approche, et de quel côté de l'os se trouve la main.
      const H = info.hanches, Ge = info.genoux, Ch = info.chevilles, Or = info.orteils;
      const groupes = [
        { regs: ['tete', 'cou'], segs: [[info.tete, info.tete.clone().add(V(0, 0.09, 0).applyQuaternion(info.qThorax)), 0.12]] },
        { regs: ['thorax', 'dos', 'abdomen'], segs: [[info.bassin, info.cou, 0.2]] },
        { regs: ['bassin'], segs: [[H.G, H.D, 0.16]] },
        { regs: ['cuisse'], segs: [[H.G, Ge.G, 0.125], [H.D, Ge.D, 0.125]] },
        { regs: ['jambe'], segs: [[Ge.G, Ch.G, 0.085], [Ge.D, Ch.D, 0.085]] },
        { regs: ['pied'], segs: [[Ch.G, Or.G || Ch.G, 0.07], [Ch.D, Or.D || Ch.D, 0.07]] },
      ];
      let change = false;
      for (const main of ['G', 'D', 'GD']) {
        const autre = main === 'GD' ? null : main === 'G' ? 'D' : 'G', F = [], Fc = [], pres = groupes.map(() => false);
        const brasAutre = autre ? [[info.epaules[autre], info.coudes[autre], 0.085], [info.coudes[autre], info.poignets[autre], 0.075]] : null;
        // Le repère de ce qui est tenu : la main (le milieu des deux mains pour un objet à deux mains).
        const ref = main === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[main].clone();
        let bras = false;
        for (const f of tenus) {
          if (f.main !== main) continue;
          // L'axe de la forme (un cylindre : d'un bout à l'autre ; le reste : son centre) et son rayon.
          const ctr = V(f.p[0], f.p[1], f.p[2]), long = f.forme === 'cylindre' || f.forme === 'hexa';
          const axe = long ? AY.clone().applyQuaternion(new Quat(f.q[0], f.q[1], f.q[2], f.q[3])).multiplyScalar(f.s[1] / 2) : V(), a = ctr.clone().sub(axe), b = ctr.clone().add(axe), r = long ? f.s[0] : rayonForme(f);
          let touche = false;
          groupes.forEach((gr, n) => { for (const [p1, p2, ep] of gr.segs) if (entreSegments(a, b, p1, p2) < r + ep + 0.02) { touche = true; pres[n] = true; } });
          if (brasAutre) for (const [p1, p2, ep] of brasAutre) if (entreSegments(a, b, p1, p2) < r + ep) { touche = true; bras = true; }
          if (touche) F.push(f);
          const rf = rayonForme(f);
          if (coussins.some(k => Math.hypot(k.p[0] - f.p[0], k.p[1] - f.p[1], k.p[2] - f.p[2]) < rf + rayonForme(k))) Fc.push(f);
        }
        // Les points du corps de ces groupes (et ceux de l'autre bras, pas de celui qui tient) à moins de 4 cm d'une
        // forme (chaque forme a sa boule : un point qui en est loin n'est pas mesuré), avec le numéro de leur os.
        const boules = F.map(f => { const r = rayonForme(f) + 0.04; return [f.p[0], f.p[1], f.p[2], r * r]; });
        const P = [], os = [];
        let segs = null, os0 = 0;
        const garder = (x, y, z) => {
          for (let n = 0; n < F.length; n++) {
            const bo = boules[n], dx = x - bo[0], dy = y - bo[1], dz = z - bo[2];
            if (dx * dx + dy * dy + dz * dz < bo[3] && distanceForme(F[n], x, y, z) < 0.04) {
              let m = Infinity, mk = 0;
              for (let k = 0; k < segs.length; k++) { const q = surSegment(segs[k][0], segs[k][1], x, y, z), l = Math.hypot(x - q[0], y - q[1], z - q[2]); if (l < m) { m = l; mk = k; } }
              P.push(x, y, z, os0 + mk);
              return;
            }
          }
        };
        if (F.length) {
          groupes.forEach((gr, n) => { if (pres[n]) { segs = gr.segs; os0 = os.length; os.push(...segs); c.peauPosee(gr.regs, garder); } });
          if (bras) { segs = brasAutre; os0 = os.length; os.push(...segs); let n = 0; c.peauPosee(REG_BRAS, () => { n++; }); let i = 0; const moitie = n / 2; c.peauPosee(REG_BRAS, (x, y, z) => { if ((i++ < moitie) === (autre === 'G')) garder(x, y, z); }); }
        }
        // Les points des formes tenues qui peuvent toucher un coussin.
        const Q = []; for (const f of Fc) Q.push(...pointsDeForme(f));
        if (!P.length && !Q.length) continue;
        // On pousse ce qui est tenu hors de la chair et des coussins, pas à pas. Chaque os dont la chair est dans une
        // forme pousse la main du côté où elle se trouve déjà (en l'éloignant de l'os), d'autant plus fort que la chair
        // est entrée ; chaque coussin pousse par sa face la plus proche de la main. On suit la somme, du pire écart.
        // Prise entre deux chairs (un objet entre les cuisses), la forme ne doit entrer dans aucune : on retire du sens
        // suivi ce qui va contre l'une d'elles ; s'il n'en reste rien, on part vers l'avant du buste.
        const T = V(), devant = AZ.clone().applyQuaternion(info.qThorax), W = new Array(os.length + coussins.length), R = [], h = 0.002;
        for (let tour = 0; tour < 12; tour++) {
          W.fill(0); let pire = 0, poids = 0;
          for (let i = 0; i < P.length; i += 4) {
            const x = P[i] - T.x, y = P[i + 1] - T.y, z = P[i + 2] - T.z;
            let e = 0;
            for (const f of F) { const ef = -distanceForme(f, x, y, z) - TOL_TENU; if (ef > e) e = ef; }
            if (e <= 0) continue;
            W[P[i + 3]] += e; poids += e; if (e > pire) pire = e;
          }
          coussins.forEach((k, n) => { for (let i = 0; i < Q.length; i += 3) { const e = -distanceForme(k, Q[i] + T.x, Q[i + 1] + T.y, Q[i + 2] + T.z) - TOL_TENU; if (e > 0) { W[os.length + n] += e; poids += e; if (e > pire) pire = e; } } });
          if (pire <= 0) break;
          // Le sens de chaque obstacle : de l'os vers la main ; du coussin vers la main (par sa face la plus proche).
          const mx = ref.x + T.x, my = ref.y + T.y, mz = ref.z + T.z, dir = V();
          R.length = 0;
          for (let k = 0; k < W.length; k++) {
            if (!W[k]) { R.push(null); continue; }
            let v;
            if (k < os.length) { const q = surSegment(os[k][0], os[k][1], mx, my, mz); v = V(mx - q[0], my - q[1], mz - q[2]); if (v.length() < 0.02) v = null; }
            else { const f = coussins[k - os.length], s0 = distanceForme(f, mx, my, mz); v = V(distanceForme(f, mx + h, my, mz) - s0, distanceForme(f, mx, my + h, mz) - s0, distanceForme(f, mx, my, mz + h) - s0); if (v.length() < 1e-9) v = null; }
            R.push(v ? v.normalize() : null);
            if (v) dir.addScaledVector(v, W[k]);
          }
          if (dir.length() > 0.2 * poids) dir.normalize(); else dir.copy(devant);
          for (let n = 0; n < 2; n++) for (let k = 0; k < W.length; k++) { const v = R[k]; if (v && W[k] > 0.05 * poids && v.dot(dir) < 0) { dir.addScaledVector(v, -v.dot(dir)); if (dir.length() > 0.2) dir.normalize(); else { dir.copy(devant).addScaledVector(v, -v.dot(devant)); if (dir.length() > 1e-3) dir.normalize(); else dir.copy(devant); } } }
          T.addScaledVector(dir, pire + 0.001);
          if (T.y < 0) { let bas = Infinity; for (const f of F.concat(Fc)) bas = Math.min(bas, f.p[1] - rayonForme(f)); if (bas + T.y < 0) T.y = Math.min(0, -bas); }   // pas sous le sol
          if (T.length() > DEGAGE_MAX) { T.multiplyScalar(DEGAGE_MAX / T.length()); break; }
        }
        if (T.lengthSq() < 1e-8) continue;
        for (const k of main === 'GD' ? ['G', 'D'] : [main]) g[k].add(T);
        change = true;
      }
      if (!change) break;
    }
    // Un grand déplacement n'est plus un ajustement : la posture elle-même est à revoir (le crible le dira) ; on ne
    // touche alors à rien, plutôt que d'emmener la charge loin de sa place.
    for (const k of ['G', 'D']) if (g[k].length() > DEGAGE_MAX) g[k].set(0, 0, 0);
    return g;
  }
