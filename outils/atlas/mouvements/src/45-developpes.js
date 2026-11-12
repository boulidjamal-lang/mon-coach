
  /* Développés : la main part de près de l'épaule et pousse jusqu'au bout du bras.
     (défaut) développé pour la poitrine, couché (plat, banc=<angle>, decline, sol), assis (machine, poulie ; avec
     incline ou decline, la poussée monte ou descend) ou debout
     (poulie) ; epaules : au-dessus de la tête, debout, assis, genoux ou demigenou.
     Matériel : barre, hal, kb, smith, machine, poulie, elas. Prise : serre, large, neutre. Côtés : uni, alt.
     Variantes : larsen (jambes en l'air), partiel (arrêt au-dessus de la poitrine), nuque, arnold, pousse (élan des
     jambes), landmine, svend (disque serré entre les paumes), autour (un bras, en travers du corps). */
  FAM.developpe = (c, o, C) => {
    const L = c.L, m = coteDe(o), haut = !!o.epaules;
    const libre = !(o.barre || o.smith || o.landmine || o.svend);       // mains indépendantes
    // Assis à la machine, incline et decline disent le sens de la poussée, pas l'inclinaison d'un banc.
    const montee = o.assis && o.machine ? (o.incline ? 28 : o.decline ? -22 : 0) : 0;
    if (montee) o.decline = false;
    if (!(o.barre || o.smith || o.kb || o.machine || o.poulie || o.elas || o.landmine || o.svend || o.pc)) o.hal = true;
    if (!haut && !o.assis && !o.debout && !o.sol && o.banc == null && !o.decline && !o.svend && !o.autour && !o.genoux && !o.demigenou) o.plat = true;
    if (o.debout) { o.plat = false; }
    if (o.larsen) o.jambes = J(12, 5, 0, 6, 25);
    const P = postureDe(c, o, C, { penche: haut || o.svend ? 0 : 4 });
    let p = P.p, fixe = P.fixe, vue = haut ? { az: 30, el: 8 } : P.vue;
    if (o.debout && !haut) { p.jambes.G = pied(c, 1, { z: 0.22 }); p.jambes.D = pied(c, -1, { z: -0.24, pointe: 22 }); p.bassin.rot = qX(6); vue = { az: 70, el: 8 }; }
    const t = c.tronc(p);
    const dT = (x, y, z) => V(x, y, z).applyQuaternion(t.qThorax);
    const portee = L.bras + L.prise - 0.035;
    const eBas = libre ? (o.serre ? 0.15 : 0.27) : (o.serre ? 0.17 : o.large ? 0.47 : 0.38), eHaut = libre ? (o.serre ? 0.12 : 0.18) : eBas;
    let bas, hautP, pole, dirMain, paumeA, paumeB;
    if (haut) {
      // Au-dessus de la tête : des clavicules (ou des épaules) jusqu'au bout des bras.
      bas = s => (o.nuque ? V(s * 0.42, -0.01, -0.105) : libre ? V(s * 0.3, -0.02, 0.03) : V(s * eBas * 0.82, -0.075, 0.135));
      hautP = s => (o.nuque ? V(s * 0.4, portee, -0.05) : V(s * (libre ? 0.2 : eBas * 0.82), portee, libre ? 0.0 : 0.02));
      pole = s => (o.nuque ? V(s * 1, -0.7, -0.1) : libre ? V(s * 1, -0.8, 0.25) : V(s * 0.7, -1, 0.5));
      dirMain = V(0, 1, 0); paumeA = paumeB = s => (o.neutre ? V(-s, 0, 0.1) : V(0, 0, 1));
      if (o.arnold) { paumeA = () => V(0, 0, -1); bas = s => V(s * 0.17, -0.07, 0.17); }
      if (o.landmine) { bas = s => V(s * (m === 'GD' ? 0.07 : 0.2), -0.1, 0.17); hautP = s => V(s * (m === 'GD' ? 0.06 : 0.17), 0.36, 0.44); dirMain = V(0, 0.75, 0.66); paumeA = paumeB = s => V(-s, 0, 0); pole = s => V(s * 0.6, -1, 0.1); }
    } else if (o.svend) {
      // Disque serré entre les deux paumes, poussé droit devant la poitrine.
      bas = s => V(s * 0.02, -0.12, 0.2); hautP = s => V(s * 0.02, -0.1, portee - 0.04); pole = s => V(s * 0.8, -0.7, -0.2); dirMain = V(0, 0.2, 1); paumeA = paumeB = s => V(-s, 0, 0);
    } else {
      if (P.sorte === 'dos') {
        // Couché : les bras tendus sont à la verticale (quelle que soit l'inclinaison du banc), au-dessus des épaules ;
        // la charge descend au bas des pectoraux sur un banc plat ou décliné, vers le haut de la poitrine sur un banc
        // incliné. La barre s'arrête contre la poitrine ; les haltères descendent à côté d'elle ; par terre, ce sont
        // les bras qui s'arrêtent au sol.
        const A = o.sol ? 0 : (o.plat ? 0 : o.decline ? -18 : o.banc === true ? 45 : +o.banc || 0), an = rad(A);
        const yBas = (A > 0 ? lerp(-0.19, -0.08, borne(A / 40, 0, 1)) : A < 0 ? -0.22 : -0.19) + (libre ? 0.04 : 0);
        const zBas = o.sol ? 0.25 : o.partiel ? 0.24 : libre ? 0.12 : 0.166;
        bas = s => V(s * eBas, yBas, zBas);
        hautP = s => V(s * eHaut, -0.03 + portee * Math.sin(an) * 0.94, portee * (1 - 0.06 * Math.abs(Math.sin(an))) * Math.cos(an) + portee * (1 - Math.cos(an)) * 0.0);
      } else {
        const zBas = o.partiel ? 0.2 : 0.135;
        bas = s => V(s * eBas, -0.115, zBas + (libre ? 0.02 : 0));
        hautP = s => V(s * eHaut, -0.02, portee);
      }
      pole = s => (o.serre ? V(s * 0.3, -0.6, -1) : V(s * 0.75, -0.5, -1));
      dirMain = V(0, 0, 1); paumeA = paumeB = s => (o.neutre || o.marteau ? V(-s, 0, 0) : V(0, -1, 0));
      // Assis à la machine, la poussée peut monter (incline) ou descendre (decline).
      if (montee) { const an = rad(montee); bas = s => V(s * eBas, montee > 0 ? -0.06 : -0.17, 0.155); hautP = s => V(s * eHaut, (montee > 0 ? -0.02 : -0.06) + portee * Math.sin(an) * 0.96, portee * Math.cos(an)); }
      if (o.autour) { bas = s => V(s * 0.3, -0.12, 0.12); hautP = s => V(-s * 0.1, -0.16, portee - 0.06); pole = s => V(s * 0.6, -0.8, -0.4); paumeA = paumeB = s => V(-s, 0, 0); vue = { az: 25, el: 8 }; }
    }
    const bras = (f, pa, doigts) => {
      const r = {};
      for (const [k, s] of COTES) r[k] = { prise: t.duThorax(f(s)), pole: dT(...pole(s).xyz()), paume: dT(...pa(s).xyz()).normalize(), dirMain: dT(dirMain.x, dirMain.y, dirMain.z), doigts: doigts || 'barre' };
      return r;
    };
    // Le mouvement va du haut (bras tendus, départ) au bas (barre à la poitrine), puis remonte.
    const autre = m !== 'GD' ? (haut ? { prise: t.hanches.D.clone().add(V(-0.085, 0.1, 0.03).applyQuaternion(t.qBassin)), pole: dT(-0.8, 0, -0.6), paume: dT(1, -0.2, 0), dirMain: dT(0.2, -0.3, 1), doigts: 'detendu' } : bras(hautP, paumeB).D) : null;
    const d = parLesBras(p, bras(hautP, paumeB), bras(bas, paumeA), m, autre);
    if (m !== 'GD' && !haut && !o.poulie) { d.a.bras.D = cloner(bras(hautP, paumeB).D); d.b.bras.D = cloner(bras(hautP, paumeB).D); if (o.hal || o.kb) { /* l'autre haltère reste en haut */ } }
    /* Au-dessus de la tête : le geste réel, repris point par point.
       À la barre :
       - en bas, la barre repose en haut de la poitrine, à hauteur des clavicules (ou sur les trapèzes, derrière la
         nuque), les mains juste en dehors des épaules, les poignets cassés sous la barre, les avant-bras verticaux ;
       - elle ne monte pas en ligne droite jusqu'au bout des bras — elle traverserait le visage : le menton se rentre,
         le buste s'efface un peu (debout, barre libre), la barre passe devant le visage (ou derrière le crâne) ;
       - la tête passée, le corps revient dessous : en haut la barre est à l'aplomb des épaules, la tête entre les bras.
       Mains libres (haltères, kettlebell, poignées de machine, élastique) : en bas les mains à hauteur d'oreille, de
       part et d'autre de la tête, les coudes dessous ; elles montent en se rapprochant, jusqu'à l'aplomb des épaules.
       Dans tous les cas : les coudes restent le plus bas possible sous la charge (avant-bras au plus près de la
       verticale) puis s'ouvrent ; en haut les bras sont tendus ; l'épaule monte avec le bras de 6 à 7 cm, pas jusqu'aux
       oreilles. Poses clés, du bas vers le haut, réglées une fois sur le corps posé. */
    let cles = null, zRail = null;
    if (haut && !o.landmine) {
      const surBarre = !libre && m === 'GD', guide = !!o.smith, accompagne = surBarre && !guide && P.sorte === 'debout', sens = o.nuque ? -1 : 1;
      const N = surBarre ? 10 : 6, rB = 0.0135, JEU_BAS = 0.012;
      const parPoints = pts => f => chemin(pts, f);
      // Le buste (debout, barre libre) : un peu en arrière au départ et tant que la barre passe le visage, dessous à la fin.
      const penche = parPoints(o.nuque ? [[0, 2], [1, 1]] : [[0, -4], [0.3, -5], [0.6, -3], [1, 2.5]]), avance = parPoints(o.nuque ? [[0, 0], [1, 0]] : [[0, 0.015], [0.35, 0.02], [1, 0.012]]);
      // La tête, à la barre : menton rentré (le cou recule, le visage reste droit) le temps qu'elle passe, puis entre les
      // bras ; derrière la nuque, elle s'incline en avant.
      const cou = parPoints(o.nuque ? [[0, 12], [0.6, 10], [1, 4]] : [[0, -8], [0.35, -12], [0.6, -4], [1, 7]]), tete = parPoints(o.nuque ? [[0, 0], [1, 0]] : [[0, 6], [0.35, 9], [0.6, 3], [1, -4]]);
      const troncA = f => {
        const q = cloner(p);
        if (accompagne) { q.bassin.rot = qX(penche(f)).multiply(p.bassin.rot); q.bassin.pos.z += avance(f); q.thorax = (p.thorax || 0) - 3 * (1 - f); }
        if (surBarre) { q.cou = (p.cou || 0) + cou(f); q.tete = (p.tete || 0) + tete(f); }
        return q;
      };
      // L'épaule : la ceinture scapulaire suit moins le bras à mesure qu'il passe au-dessus de la tête.
      const part = f => lerp(K_CEINTURE, 0.15, lisse(f));
      // La main. À la barre : le poignet cassé en arrière sous la barre posée (elle repose sur le talon de la main), presque
      // droit en haut. Mains libres : paume en avant ; neutre : paumes face à face ; kettlebell : de face à face à en avant ;
      // arnold : la paume part tournée vers soi et finit en avant.
      const casse = parPoints([[0, surBarre ? (o.nuque ? 14 : 30) : 10], [0.35, surBarre ? (o.nuque ? 12 : 16) : 8], [1, 8]]);
      const tourne = o.arnold ? parPoints([[0, 180], [0.75, 0], [1, 0]]) : o.kb ? parPoints([[0, 75], [0.7, 0], [1, 0]]) : o.neutre ? () => 84 : () => 0;
      const mainA = (s, f) => { const w = rad(casse(f)), a = rad(tourne(f)), tour = v => V(-s * (v.z * Math.sin(a)), v.y, v.z * Math.cos(a)); return { paume: tour(V(0, Math.sin(w), Math.cos(w))), dirMain: tour(V(0, Math.cos(w), -Math.sin(w))) }; };
      // Le coude : le plus bas possible sous la charge, puis vers le dehors quand le bras se tend (paumes face à face ou
      // tournées vers soi : il part de devant le corps).
      const devant = o.arnold || o.neutre || o.kb;
      const versCoude = (s, f) => chemin([[0, V(0, -1, o.nuque ? -0.05 : devant ? 0.15 : 0.08)], [0.5, V(s * 0.55, -1, o.nuque ? -0.05 : devant ? 0.3 : 0.05)], [1, V(s * 1, -0.3, o.nuque ? 0.05 : devant ? 0.4 : 0.2)]], f);
      // Où va chaque main : à la barre, la prise ne bouge pas sur la barre (mains juste en dehors des épaules ; derrière la
      // nuque, plus large) ; mains libres, elles partent écartées, coudes dessous, et se rapprochent en montant.
      const xM = o.nuque ? 0.4 : o.large ? 0.34 : o.serre ? 0.215 : 0.285;
      const basL = o.arnold ? V(0.19, 0.06, 0.165) : o.kb ? V(0.25, 0.09, 0.16) : o.neutre ? V(0.305, 0.18, 0.19) : o.machine ? V(0.37, 0.14, 0.08) : V(0.4, 0.18, 0.11);
      const hautL = o.neutre ? V(0.2, 0, 0.02) : o.machine ? V(0.27, 0, 0.01) : V(0.22, 0, 0.01);
      const travaille = COTES.filter(([k]) => m === 'GD' || m === k);
      const poserBras = (q, f, cible) => {
        const t2 = c.tronc(q), dT2 = v => v.applyQuaternion(t2.qThorax), cibles = {};
        for (const [k, s] of COTES) {
          if (m !== 'GD' && m !== k) { q.bras[k] = cloner(autre); continue; }
          const h = mainA(s, f);
          cibles[k] = cible(s, t2);
          q.bras[k] = { prise: cibles[k].clone(), pole: versCoude(s, f), paume: dT2(h.paume), dirMain: dT2(h.dirMain), doigts: 'barre', ceinture: part(f) };
        }
        return viser(c, q, cibles);
      };
      const k0 = travaille[0][0];
      // En haut : bras tendus (10° au coude : la main reste sur sa prise, le bras ne claque pas), à l'aplomb des épaules.
      const hautDe = cible => { let a = 0.3, b = 0.85; for (let n = 0; n < 10; n++) { const y = (a + b) / 2; if (poserBras(troncA(1), 1, (s, t2) => cible(s, t2, y)).angles[k0].coude > 10) a = y; else b = y; } return a; };
      cles = [];
      if (surBarre) {
        // En bas : la barre à hauteur des clavicules (devant) ou en haut des trapèzes (derrière).
        const yBas = c.tronc(troncA(0)).duThorax(V(0, o.nuque ? 0.085 : 0.06, 0)).y;
        const zFin = c.tronc(troncA(1)).epaules.G.z + (o.nuque ? -0.02 : 0.008);
        const epY = f => c.tronc(troncA(f)).duThorax(V()).y;
        const hautBarre = z => epY(1) + hautDe((s, t2, y) => V(s * xM, t2.duThorax(V()).y + y, z));
        let yHaut = hautBarre(zFin);
        const barreA = (f, y, z) => poserBras(troncA(f), f, s => V(s * xM, y, z));
        // Par où passe la barre à la hauteur y, corps posé : elle peut se poser sur la poitrine, les épaules et le cou ; la
        // tête, elle la passe à 2,5 cm.
        const regionsCorps = o.nuque ? ['cou', 'dos', 'epaule'] : ['thorax', 'epaule', 'cou'];
        const auPlusPres = (y, z, jeu) => {
          const corpsZ = c.barreContre(y, rB + jeu, regionsCorps, xM - 0.06, sens), teteZ = c.barreContre(y, rB + 0.025, ['tete'], 0.14, sens);
          if (corpsZ != null) z = sens > 0 ? Math.max(z, corpsZ) : Math.min(z, corpsZ);
          if (teteZ != null) z = sens > 0 ? Math.max(z, teteZ) : Math.min(z, teteZ);
          return z;
        };
        // Premier passage : la barre part posée contre le corps (les bras déjà en place : l'épaule et la poitrine suivent le
        // bras), puis passe au plus près du chemin prévu sans rien traverser.
        const zs = [];
        let z0 = zFin + sens * 0.06;
        for (let n = 0; n < 2; n++) { barreA(0, yBas, z0); z0 = auPlusPres(yBas, zFin - sens * 0.3, JEU_BAS); }
        zs.push(z0);
        for (let i = 1; i <= N; i++) {
          const f = i / N, y = lerp(yBas, yHaut, f), zPrevu = lerp(z0, zFin, lisse((f - 0.5) / 0.45));
          barreA(f, y, zPrevu);
          zs.push(auPlusPres(y, zPrevu, 0.003));
        }
        if (guide) {
          // Barre guidée : elle monte droit sur son rail, placé là où elle passe partout ; la hauteur des bras tendus s'y règle.
          zRail = sens > 0 ? Math.max(...zs) : Math.min(...zs);
          yHaut = hautBarre(zRail);
          for (let i = 0; i <= N; i++) zs[i] = zRail;
        }
        for (let i = 0; i <= N; i++) { const f = i / N, q = troncA(f); poserBras(q, f, s => V(s * xM, lerp(yBas, yHaut, f), zs[i])); cles.push([f, q]); }
      } else {
        // Mains libres : du bas (à hauteur d'oreille, écartées, placées par rapport au buste) au haut (à la verticale des
        // épaules : la charge se pousse droit vers le haut, même adossé à un dossier incliné).
        const auDessus = (s, t2, y) => t2.duThorax(V()).add(V(s * hautL.x, y, hautL.z));
        const yHaut = hautDe(auDessus);
        const ou = (s, t2, f) => { const g = lisse(f), B = t2.duThorax(V(s * basL.x, basL.y, basL.z)), T = auDessus(s, t2, yHaut); return V(lerp(B.x, T.x, g), lerp(B.y, T.y, f), lerp(B.z, T.z, g)); };
        for (let i = 0; i <= N; i++) { const f = i / N, q = troncA(f); poserBras(q, f, (s, t2) => ou(s, t2, f)); cles.push([f, q]); }
      }
    }
    // Matériel.
    const r = { disques: haut ? 0.16 : 0.225, sensKb: 'avantbras' };
    let tenu;
    if (o.landmine) {
      const pivot = V(0, 0.05, t.epaules.G.z + 1.45);
      tenu = [{ t: 'levier', de: pivot, m: m === 'GD' ? 'G' : m, bout: 'rien' }];
      fixe = fixe.concat([pret(boite(0.2, 0.08, 0.2, pivot.x, 0.04, pivot.z, C.cadre, 0.5))]);
      d.objets = (info, u, sortie) => { const k = m === 'GD' ? 'G' : m, pr = m === 'GD' ? info.prises.G.clone().add(info.prises.D).multiplyScalar(0.5) : info.prises[k], dir = unite(pr.clone().sub(pivot)); sortie.push(pret(seg(pivot, pr.clone().add(dir.clone().multiplyScalar(0.12)), 0.025, C.metal, 1))); sortie.push(pret(cyl(0.15, 0.04, 0, 0, 0, C.fonte, 0))); const dq = sortie[sortie.length - 1], pp = pr.clone().sub(dir.clone().multiplyScalar(0.18)), q = arc(AY, dir); dq.p = [pp.x, pp.y, pp.z]; dq.q = [q.x, q.y, q.z, q.w]; };
      tenu = [];
    } else if (o.svend) tenu = [{ t: 'disque', m: 'GD', r: 0.14, axe: AX }];
    else if (o.smith) { tenu = [{ t: 'barre', l: 1.6, d: 0.18 }]; }
    else {
      const anc = haut ? (s => V(s * 0.35, 0.1, -0.05)) : P.sorte === 'dos' ? (s => V(s * 0.95, 0.2, t.epaules.G.z)) : (s => V(s * 0.45, t.epaules.G.y - 0.05, t.epaules.G.z - 0.95));
      r.ancre = anc; r.deElas = haut ? null : anc;
      if (o.machine) r.pivot = haut ? (s => V(s * 0.3, t.epaules.G.y + 0.45, t.epaules.G.z - 0.35)) : (s => V(s * 0.32, t.epaules.G.y + 0.55, t.epaules.G.z + 0.1));
      tenu = tenuDe(o, m === 'GD' ? 'GD' : (haut || o.poulie ? m : 'GD'), r);
      if (o.poulie) for (const s of m === 'GD' ? [1, -1] : [m === 'D' ? -1 : 1]) poserObjet(MAT.colonne(C, anc(s)), V(), null, fixe);
    }
    if (o.smith) {
      const zB = zRail != null ? zRail : t.duThorax(hautP(1)).z;                // la barre guidée monte droit, sur son rail
      fixe = fixe.concat(poseFixe(MAT.smith(C, zB)));
    }
    // Développé couché à la barre : les supports de barre, derrière la tête, crochets juste sous la barre bras tendus.
    if (o.barre && !o.smith && P.sorte === 'dos' && !o.sol && !haut) {
      const hautBarre = t.duThorax(hautP(1));
      fixe = fixe.concat(poseFixe(MAT.supports(C, hautBarre.y - 0.075, 0.53, hautBarre.z - 0.27)));
    }
    // Barre retenue par des élastiques (développé couché avec bandes) : une bande de chaque main jusqu'au sol.
    if (o.barre && o.elas && !haut) { const zB = t.duThorax(hautP(1)).z; for (const k of ['G', 'D']) tenu.push({ t: 'elastique', de: V((k === 'G' ? 1 : -1) * 0.5, 0.03, zB), m: k, bout: 'rien' }); }
    Object.assign(d, { fixe, vue, tenu }, rythmeDe(o));
    if (o.pousse) {
      // Développé poussé : les genoux plient un peu puis les jambes lancent la barre. Départ en bas.
      const A = d.b, Z = d.a, monter = cles ? v => cloner(chemin(cles, v)) : v => mel(A, Z, v);
      d.pose = u => { const q = monter(lisse(borne((u - 0.3) / 0.7, 0, 1))), dy = -0.09 * Math.sin(Math.PI * borne(u / 0.45, 0, 1)); q.bassin.pos.y += dy; q.bassin.pos.z -= 0.02 * Math.sin(Math.PI * borne(u / 0.45, 0, 1)); for (const k of ['G', 'D']) { if (u < 0.45) q.bras[k].prise.y += dy; } return q; };
      if (cles) { delete d.a; delete d.b; }
    } else if (cles) { delete d.a; delete d.b; d.cles = cles; }                 // poses clés, du bas vers le haut
    else if (haut) { const A = d.a; d.a = d.b; d.b = A; }                       // au-dessus de la tête : on part d'en bas
    return d;
  };
  V3.prototype.xyz = function () { return [this.x, this.y, this.z]; };

  /* Écartés : bras presque tendus qui se referment devant la poitrine.
     Couché (plat, banc=<angle>, decline, sol) avec haltères ou poulies basses ; debout, à genoux ou assis aux
     poulies (haut : de haut en bas ; bas : de bas en haut ; sinon à hauteur de poitrine) ; machine (pecdeck : coudes
     pliés sur les coussins) ; elas. Côtés : uni. */
  FAM.ecarte = (c, o, C) => {
    const m = coteDe(o);
    if (!(o.poulie || o.machine || o.elas)) o.hal = true;
    const couche = o.plat || o.banc != null || o.decline || o.sol;
    if (!couche && o.hal && !o.debout) o.plat = true;      // haltères : couché, sauf écarté debout (de bas en haut)
    if (o.machine) o.assis = true;
    const P = postureDe(c, o, C); let p = P.p, fixe = P.fixe, vue = P.vue, a, b, ancre;
    const t = c.tronc(p);
    if (P.sorte === 'dos') {
      a = B(102, 88, 12, 24, 0); b = B(6, 90, -84, 16, 0);
      if (o.sol) a = B(96, 88, 6, 30, 0);
      ancre = s => V(s * 1.0, 0.2, t.epaules.G.z); vue = { az: 150, el: 22 };
      if (o.basHaut) { a = B(100, 60, 10, 24, 0); b = B(6, 110, -84, 16, 0); }
    } else if (o.pecdeck) {
      a = B(102, 86, 96, 92, 90); b = B(10, 86, 8, 92, 90); vue = { az: 25, el: 10 };
    } else {
      // Aux poulies (ou à la machine, bras tendus) : buste droit ou un peu penché, un pied en avant.
      const hA = o.haut ? 2.0 : o.bas ? 0.15 : t.epaules.G.y - 0.02;
      if (P.sorte === 'debout') { p.bassin.rot = qX(o.haut ? 14 : 6); p.jambes.G = pied(c, 1, { z: 0.2 }); p.jambes.D = pied(c, -1, { z: -0.22, pointe: 20 }); }
      a = o.haut ? B(98, 104, 10, 26, 0) : o.bas ? B(96, 38, 6, 22, 0) : B(102, 88, 12, 24, 0);
      b = o.haut ? B(14, 48, -76, 18, 0) : o.bas ? B(8, 104, -84, 18, 0) : B(6, 88, -84, 16, 0);
      ancre = s => V(s * 1.0, hA, t.epaules.G.z - 0.2); vue = { az: 20, el: 8 };
    }
    const r = { ancre, deElas: ancre, pivot: s => V(s * 0.35, t.epaules.G.y + 0.5, t.epaules.G.z - 0.1) };
    if (o.poulie && ancre) for (const s of m === 'GD' ? [1, -1] : [m === 'D' ? -1 : 1]) poserObjet(MAT.colonne(C, ancre(s)), V(), null, fixe);
    return Object.assign(parLesBras(p, a, b, m), { fixe, vue, tenu: tenuDe(o, m, r) }, rythmeDe(o));
  };

  /* Pull-over : couché, les bras partent de derrière la tête et reviennent au-dessus de la poitrine.
     hal (un haltère tenu à deux mains), barre, poulie, machine (assis : les bras descendent de devant le visage). */
  FAM.pullover = (c, o, C) => {
    if (o.machine) {
      const p = allonge(c, { h: 0.44, angle: 84, lomb: 0, thor: 0, cou: 0 }), t = c.tronc(p);
      const a = B(0, 150, 0, 85, 90), b = B(0, 40, 0, 85, 90);
      return Object.assign(parLesBras(p, a, b), { fixe: poseFixe(MAT.banc(C, 84)), vue: { az: 60, el: 10 }, tenu: [{ t: 'levier', de: V(0.24, t.epaules.G.y + 0.02, t.epaules.G.z - 0.02), m: 'G' }, { t: 'levier', de: V(-0.24, t.epaules.G.y + 0.02, t.epaules.G.z - 0.02), m: 'D' }] });
    }
    o.plat = true; if (o.jambesHautes) o.jambes = 'levees';
    const P = postureDe(c, o, C), p = P.p;
    const a = B(0, 162, o.barre ? 0 : -6, 24, o.barre ? 180 : 90), b = B(0, 96, o.barre ? 0 : -6, 16, o.barre ? 180 : 90);
    const tenu = o.barre || o.ez ? [{ t: 'barre', l: 1.2, d: 0.12 }] : o.poulie ? [{ t: 'cable', de: V(0, 0.3, -1.5), bout: 'corde' }] : [{ t: 'haltere', m: 'G', k: 1.25 }];
    const fixe = o.poulie ? P.fixe.concat(poseFixe(MAT.colonne(C, V(0, 0.3, -1.5)))) : P.fixe;
    return Object.assign(parLesBras(p, a, b), { fixe, vue: { az: 120, el: 16 }, tenu });
  };
