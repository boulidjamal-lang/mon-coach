
  /* Hanches : abductions, adductions, extensions.
     abduction / adduction : debout (poulie, elas, pc), assis (machine, elas), cote (couché sur le côté), coquille
     (couché sur le côté, genoux pliés), borne (à quatre pattes, le genou s'écarte) ;
     kickback (extension) : debout (poulie, elas, machine), quatrepattes (genou plié : coup de pied de mule ; tendu),
     smith (à quatre pattes, le pied pousse la barre) ; hyperinverse (à plat ventre sur un banc, les jambes montent) ;
     monstre (marche avec mini-bande : avant ou lateral) ; balancement (avant ou lateral) ; cercles. */
  FAM.hanche = (c, o, C) => {
    const L = c.L, fixe = [], d = { vue: { az: 25, el: 8 }, tenu: [], fixe }, z0 = L.racine.z + L.hanche.z;
    const appui = (p, z) => { for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.16, 1.05, z == null ? 0.42 : z), pole: V(s * 1, -0.6, -0.2), paume: V(0, -1, 0), doigts: 'barre' }; fixe.push(pret(seg(V(0, 0, (z == null ? 0.42 : z) + 0.03), V(0, 1.02, (z == null ? 0.42 : z) + 0.03), 0.025, C.cadre, 0.5)), pret(cyl(0.015, 0.5, 0, 1.03, (z == null ? 0.42 : z) + 0.01, C.metal, 1))); };
    if (o.monstre) {
      // Marche avec mini-bande aux genoux, en quart de squat : sur place, un pied s'écarte, l'autre le rejoint.
      d.rythme = 'continu'; d.periode = 2;
      d.pose = ph => { const p = debout(c, { dy: -0.14, dz: -0.08, penche: 16, ecart: 0.13, ouv: 8, cou: -8 }); const w = ph * 2, s = w < 1 ? 1 : -1, q = w % 1, lv = Math.sin(Math.PI * q) * 0.06, k = s > 0 ? 'G' : 'D'; if (o.lateral) { p.jambes[k] = pied(c, s, { x: s * (0.13 + 0.12 * Math.sin(Math.PI * q)), ouv: 8, y0: lv }); p.bassin.pos.x += s * 0.04 * Math.sin(Math.PI * q); } else p.jambes[k] = pied(c, s, { x: s * 0.2, ouv: 10, z: z0 + 0.22 * Math.sin(Math.PI * q) - 0.04, y0: lv }); p.bras = mains(c, c.tronc(p), 'hanches'); return p; };
      d.objets = (info, u, sortie) => sortie.push(pret(seg(info.genoux.G.clone().add(V(0, 0.06, 0)), info.genoux.D.clone().add(V(0, 0.06, 0)), 0.012, C.elastique, 0)));
      d.vue = o.lateral ? { az: 12, el: 8 } : { az: 40, el: 8 }; return d;
    }
    if (o.balancement || o.cercles) {
      d.rythme = 'continu'; d.periode = o.cercles ? 2.4 : 1.6;
      const base = debout(c, { ecart: 0.07, ouv: 6 }); appui(base, o.lateral ? 0.42 : null);
      if (!o.lateral && !o.cercles) { fixe.length = 0; for (const [k, s] of COTES) base.bras[k] = k === 'D' ? { prise: V(-0.45, 1.05, 0), pole: V(-1, -0.6, -0.2), paume: V(0, -1, 0), doigts: 'barre' } : B(90, 40, 0, 15, 90, { doigts: 'detendu' }); fixe.push(pret(seg(V(-0.47, 0, 0), V(-0.47, 1.03, 0), 0.025, C.cadre, 0.5))); }
      d.pose = ph => { const p = cloner(base), w = ph * 2 * Math.PI; p.jambes.G = o.cercles ? J(62 + 16 * Math.cos(w), 22 + 22 * Math.sin(w), 0, 80, 20) : o.lateral ? J(0, 14 + 30 * Math.sin(w), 0, 4, 15) : J(42 * Math.sin(w) + 6, 3, 0, 8 + 24 * (1 - Math.abs(Math.sin(w))) + 10 * Math.max(0, -Math.sin(w)), 4); return p; };
      d.vue = o.lateral || o.cercles ? { az: 15, el: 8 } : { az: 70, el: 8 }; return d;
    }
    if (o.hyperinverse) {
      // À plat ventre sur un banc haut, hanches au bord : les jambes pendent puis montent à l'horizontale.
      const base = aPlatVentre(c, { h: 0.85, angle: 0, d: 0.1, jambes: J(60, 4, 0, 10, 20), regions: ['thorax', 'abdomen'] });
      const cle = u => { const p = cloner(base); p.jambes = pareil(J(lerp(62, -10, u), 4, 0, lerp(14, 4, u), 20)); for (const [k, s] of COTES) p.bras[k] = { prise: V(s * 0.2, 0.72, p.bassin.pos.z + 0.6), pole: V(s * 1, -0.3, -0.2), paume: V(-s, 0, 0), doigts: 'barre' }; return p; };
      d.a = cle(0); d.b = cle(1); fixe.push(...poseFixe(MAT.banc(C, 0, 0.85, 0.8, 0.1), V(0, 0, 0.1), qY(180)));
      if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(V(0, 0.1, base.bassin.pos.z + 0.3), info.chevilles.G.clone().setX(0), 0.008, C.elastique, 0)));
      d.vue = { az: 62, el: 10 }; return d;
    }
    if (o.quatrepattes || o.borne || o.smith) {
      const base = quatrePattes(c, {});
      let a = J(86, 6, 0, 90, 62), b;
      if (o.borne) b = J(86, 52, 0, 90, 40);                       // le genou s'écarte sur le côté
      else if (o.tendu) b = J(-6, 6, 0, 8, 30);                    // jambe tendue vers l'arrière
      else b = J(2, 6, 0, 96, 20);                                 // genou plié, la plante du pied vers le plafond
      const A = cloner(base), Z = cloner(base); A.jambes.G = a; Z.jambes.G = b; d.a = A; d.b = Z; d.vue = { az: o.borne ? 150 : 70, el: 12 };
      if (o.smith) { d.objets = (info, u, sortie) => { const pi = info.chevilles.G.clone().add(info.orteils.G).multiplyScalar(0.5); poserObjet(MAT.barre(C, 1.6, 0.18), V(0, pi.y + 0.07, pi.z), null, sortie); }; const iz = c.poser(Z).chevilles.G.z; fixe.push(...poseFixe(MAT.smith(C, iz + 0.05))); }
      if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(info.chevilles.D, info.chevilles.G, 0.008, C.elastique, 0)));
      if (o.poulie) { const anc = V(0.09, 0.1, c.poser(A).chevilles.G.z + 1.3); d.tenu = [{ t: 'cable', de: anc, vers: info => info.chevilles.G, m: 'G', bout: 'rien' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
      return d;
    }
    if (o.cote || o.coquille) {
      // Couché sur le côté droit : c'est la jambe du dessus (la gauche) qui travaille.
      const base = surLeCote(c, { cote: 'D', jambes: o.coquille ? J(48, 0, 0, 88, 20) : J(8, 0, 0, 6, 20) });
      base.bras.D = B(0, 150, 0, 70, 90, { doigts: 'detendu' }); base.bras.G = B(40, 40, -40, 80, 180, { doigts: 'plat' });
      if (!o.coquille) base.jambes.D = J(30, 0, 0, 55, 20);
      const A = cloner(base), Z = cloner(base);
      Z.jambes.G = o.coquille ? J(48, 40, 0, 88, 20) : J(8, 42, 0, 6, 20);
      if (o.adduction) { A.jambes.G = J(60, 20, 0, 80, 0); Z.jambes.G = J(60, 20, 0, 80, 0); A.jambes.D = J(4, 0, 0, 4, 20); Z.jambes.D = J(4, -24, 0, 4, 20); }
      d.a = A; d.b = Z; d.vue = { az: 0, el: 20 };
      if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(info.genoux.D, info.genoux.G, 0.012, C.elastique, 0)));
      return d;
    }
    if (o.assis) {
      // À la machine (ou avec une bande aux genoux) : assis, les cuisses s'ouvrent ou se referment.
      const ouvert = 36, ferme = 5;
      const base = allonge(c, { h: 0.5, angle: 76, jambes: J(74, ferme, 0, 88, 0), lomb: 0, thor: 0, cou: 0 });
      fixe.push(...poseFixe(MAT.banc(C, 76, 0.5)));
      const cle = k => { const p = cloner(base); p.jambes = pareil(J(74, k, 0, 88, 0)); p.bras = pareil(B(80, 14, 0, 35, 90)); return p; };
      d.a = cle(o.adduction ? ouvert : ferme); d.b = cle(o.adduction ? ferme : ouvert); d.vue = { az: 20, el: 14 };
      d.objets = (info, u, sortie) => { for (const [k, s] of COTES) { const g = info.genoux[k]; if (o.elas) continue; sortie.push(pret(boite(0.05, 0.16, 0.2, g.x + s * (o.adduction ? -0.075 : 0.075), g.y, g.z - 0.08, C.banc, 0))); } if (o.elas) sortie.push(pret(seg(info.genoux.G.clone().add(V(0, 0.05, -0.04)), info.genoux.D.clone().add(V(0, 0.05, -0.04)), 0.012, C.elastique, 0))); };
      return d;
    }
    // Debout, en appui sur une jambe, mains sur un support : l'autre jambe s'écarte, se rapproche ou part en arrière.
    const pen = o.kickback ? 14 : 0;
    const base = debout(c, { penche: pen, dz: -pen * 0.003, ecart: 0.08, ouv: 6 }); appui(base);
    let a, b;
    if (o.adduction) { a = J(4 + pen, 28, 0, 3, 10); b = J(12 + pen, -16, 0, 3, 10); }
    else if (o.kickback) { a = J(18 + pen, 2, 0, 40, 0); b = J(-30 + pen, 2, 0, 10, 30); if (o.machine) { a = J(40 + pen, 2, 0, 70, 0); b = J(-22 + pen, 2, 0, 10, 20); } }
    else { a = J(0, 5, 0, 3, 10); b = J(0, 40, 0, 3, 15); }
    const A = cloner(base), Z = cloner(base); A.jambes.G = a; Z.jambes.G = b; d.a = A; d.b = Z;
    d.vue = o.kickback ? { az: 68, el: 8 } : { az: 15, el: 8 };
    if (o.poulie) { const anc = o.kickback ? V(0.09, 0.1, 1.2) : o.adduction ? V(1.1, 0.1, 0) : V(-1.1, 0.1, 0); d.tenu = [{ t: 'cable', de: anc, vers: info => info.chevilles.G, m: 'G', bout: 'rien' }]; fixe.push(...poseFixe(MAT.colonne(C, anc))); }
    else if (o.elas) d.objets = (info, u, sortie) => sortie.push(pret(seg(info.chevilles.D, info.chevilles.G, 0.008, C.elastique, 0)));
    else if (o.machine) d.objets = (info, u, sortie) => { const ch = info.chevilles.G; sortie.push(pret(boite(0.2, 0.04, 0.22, ch.x, ch.y - 0.06, ch.z + 0.02, C.cadre, 0.5))); };
    return d;
  };
