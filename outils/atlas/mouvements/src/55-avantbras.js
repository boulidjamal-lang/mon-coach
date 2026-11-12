  /* ---------- Avant-bras : poignets, pronation, prise ----------
     (défaut) flexion des poignets, assis, avant-bras posés sur les cuisses, paumes vers le haut ; inverse (paumes
     vers le bas : extension) ; neutre (pouces en haut : inclinaison vers le pouce) ; debout (bras le long du corps) ;
     dos (barre tenue dans le dos) ; pronation / supination (coude à angle droit, l'avant-bras tourne) ; couche ;
     rouleau (enrouleur de poignets : bras tendus devant, la charge monte au bout d'une cordelette) ; pince (poignées
     de musculation de la main). Charge : barre, ez, hal, poulie, machine. uni : un seul bras. */
  FAM.poignet = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 40, el: 14 }, tenu: [], fixe }, m = coteDe(o);
    if (!(o.barre || o.ez || o.poulie || o.machine || o.rouleau || o.pince)) o.hal = true;
    if (o.rouleau) {
      // Bras tendus devant soi, une barrette dans les mains : les poignets tournent tour à tour, la charge monte puis redescend.
      const base = debout(c, { ecart: 0.12, ouv: 8 });
      d.rythme = 'continu'; d.periode = 7;
      d.pose = ph => { const p = cloner(base), a = 26 * Math.sin(ph * 2 * Math.PI * 9); p.bras.G = B(4, 86, 0, 6, 180, { poignet: a }); p.bras.D = B(4, 86, 0, 6, 180, { poignet: -a }); return p; };
      d.tenu = [{ t: 'barre', l: 0.5, d: 0 }];
      d.objets = (info, u, sortie) => { const mi = info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5), h = 0.42 + 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (u || 0))); sortie.push(pret(seg(mi, V(mi.x, h + 0.02, mi.z), 0.004, C.cable, 0.4))); poserObjet([cyl(0.11, 0.035, 0, 0, 0, C.fonte, 0, DEBOUT_Q)], V(mi.x, h, mi.z), null, sortie); };
      if (o.poulie) { d.objets = null; d.tenu = [{ t: 'barre', l: 0.5, d: 0 }, { t: 'cable', de: V(0, 0.12, 0.75), m: 'GD', bout: 'rien', vers: info => info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) }]; fixe.push(...poseFixe(MAT.colonne(C, V(0, 0.12, 0.75)))); }
      return d;
    }
    if (o.pince) {
      // Poignées de force : coudes fléchis, les doigts serrent puis s'ouvrent.
      const p = debout(c, { ecart: 0.11, ouv: 8 });
      const cle = u => { const q = cloner(p); for (const [k] of COTES) q.bras[k] = (m === 'GD' || m === k) ? B(6, 14, 0, 96, 90, { doigts: lerp(0.3, 0.92, u) }) : brasRepos(); return q; };
      d.a = cle(0); d.b = cle(1); d.periode = 1.8;
      d.objets = (info, u, sortie) => { for (const k of m === 'GD' ? ['G', 'D'] : [m]) { const pr = info.prises[k], ax = info.axes[k], pa = info.paumes[k], dm = info.dirMains[k], e = lerp(0.07, 0.03, u == null ? 0 : u); sortie.push(pret(seg(pr.clone().add(ax.clone().multiplyScalar(-0.06)).add(pa.clone().multiplyScalar(-0.012)), pr.clone().add(ax.clone().multiplyScalar(0.06)).add(pa.clone().multiplyScalar(-0.012)), 0.009, C.cadre, 0.5)), pret(seg(pr.clone().add(ax.clone().multiplyScalar(-0.06)).add(pa.clone().multiplyScalar(e)).add(dm.clone().multiplyScalar(0.01)), pr.clone().add(ax.clone().multiplyScalar(0.06)).add(pa.clone().multiplyScalar(e)).add(dm.clone().multiplyScalar(0.01)), 0.009, C.cadre, 0.5))); } };
      d.vue = { az: 30, el: 10 }; return d;
    }
    const tourne = o.pronation || o.supination;
    let p, bras;
    if (o.debout || o.dos) {
      p = debout(c, { ecart: 0.11, ouv: 8 });
      bras = u => (o.dos ? B(0, -12, 0, 8, 180, { poignet: lerp(-8, 52, u) }) : o.inverse ? B(0, 8, 0, 10, 180, { poignet: lerp(34, -42, u) }) : B(0, 8, 0, 10, 0, { poignet: lerp(-30, 48, u) }));
      d.vue = o.dos ? { az: 150, el: 8 } : { az: 30, el: 8 };
    } else if (o.couche) {
      // Sur le dos, coude au sol plié à angle droit : l'avant-bras à la verticale tourne sur lui-même.
      p = allonge(c, { h: 0, angle: 0, jambes: 'plies' });
      bras = u => B(90, 12, 0, 90, o.supination ? lerp(150, 10, u) : lerp(10, 150, u));
      d.vue = { az: 60, el: 18 };
    } else {
      // Assis, buste penché, avant-bras posés sur les cuisses, les mains dépassent des genoux.
      p = assis(c, { h: H_BANC, penche: 34, ecart: 0.13 }); p.cou = -16; fixe.push(...bancAssis(C));
      bras = u => (tourne ? B(-4, 36, 0, 92, o.supination ? lerp(160, 20, u) : lerp(20, 160, u))
        : o.neutre ? B(-4, 36, 0, 92, 90, { deviation: lerp(-22, 26, u) })
        : o.inverse ? B(-4, 36, 0, 92, 180, { poignet: lerp(36, -44, u) }) : B(-4, 36, 0, 92, 0, { poignet: lerp(-34, 50, u) }));
    }
    const cle = u => { const q = cloner(p); for (const [k] of COTES) q.bras[k] = (m === 'GD' || m === k) ? bras(u) : (o.debout || o.dos || o.couche ? brasRepos() : B(-4, 36, 0, 92, 150, { doigts: 'detendu' })); return q; };
    d.a = cle(0); d.b = cle(1); d.periode = 2.2;
    const anc = V(0, 0.12, 0.95);
    d.tenu = o.barre ? [{ t: 'barre', l: 1.2, d: 0.11 }] : o.ez ? [{ t: 'barre', l: 1.1, d: 0.09 }] : o.poulie ? [{ t: 'cable', de: anc, m: 'GD', bout: 'barre', l: 0.5 }] : o.machine ? (m === 'GD' ? ['G', 'D'] : [m]).map(k => ({ t: 'levier', de: V(k === 'G' ? 0.2 : -0.2, 0.5, 0.75), m: k })) : [{ t: 'haltere', m, k: tourne ? 0.8 : 1 }];
    if (o.poulie) fixe.push(...poseFixe(MAT.colonne(C, anc)));
    return d;
  };
