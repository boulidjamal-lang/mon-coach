
  /* Extensions des triceps.
     Sortes : (défaut) pushdown à la poulie haute ; nuque (au-dessus de la tête) ; front (barre au front, couché) ;
     kickback ; croise (deux poulies hautes croisées) ; travers (un bras, en travers du corps) ; tate ; jm ;
     pullover ; machine ; horizontal (assis dos à la poulie). Prise : (pronation), neutre, sup. Côtés : uni. */
  FAM.triceps = (c, o, C) => {
    const m = coteDe(o), pron = o.neutre || o.corde ? 90 : o.sup ? 0 : 180;
    let P, p, fixe, vue, a, b, ancre = null, autre = null, r = { bout: o.corde ? 'corde' : o.barreP ? 'barre' : null, lCable: 0.55, disques: 0.13 }, tenu = null;
    if (o.front || o.tate || o.jm || o.pullover) {
      // Couché : bras à la verticale au-dessus des épaules ; seuls les coudes plient (barre au front).
      if (o.banc == null && !o.sol && !o.decline) o.plat = true;
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = P.vue;
      if (o.tate) { a = B(0, 90, 0, 6, 180); b = B(75, 82, 0, 122, 180); }                      // les haltères descendent sur la poitrine, coudes ouverts
      else if (o.jm) { a = B(0, 90, 0, 5, 180); b = B(22, 62, 0, 112, 180); }                  // entre le développé serré et la barre au front
      else if (o.pullover) { a = B(0, 150, 0, 100, pron); b = B(0, 95, 0, 10, pron); }
      else { a = B(0, 100, 0, 112, pron); b = B(0, 94, 0, 6, pron); }
      ancre = V(0, 0.3, -1.35);
    } else if (o.nuque) {
      // Bras à la verticale, les avant-bras descendent derrière la tête.
      // Debout : vu de trois quarts arrière (on voit les avant-bras descendre) ; assis contre un dossier : de trois quarts avant.
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = P.sorte === 'assis' && o.assis ? { az: 42, el: 8 } : { az: 150, el: 8 };
      if (o.haute) {
        // Dos à la poulie haute, buste penché : les bras poussent vers l'avant.
        p = debout(c, { penche: 42, dy: -0.06, dz: -0.02, lomb: 3, cou: -22 });
        p.jambes.G = pied(c, 1, { z: 0.3 }); p.jambes.D = pied(c, -1, { z: -0.3, pointe: 25 });
        a = B(0, 150, 0, 128, pron); b = B(0, 150, 0, 8, pron); ancre = V(0, 2.0, -0.75); vue = { az: 110, el: 8 };
      } else { a = B(m === 'GD' ? 6 : 20, 168, 0, 132, pron); b = B(m === 'GD' ? 6 : 20, 174, 0, 8, pron); ancre = o.katana ? (s => V(s * 0.55, 0.1, -0.2)) : V(0, 0.15, -0.7); }
      if (o.hal1) {
        // Un seul haltère tenu à deux mains, à la verticale.
        a = B(4, 168, -8, 128, 90); b = B(4, 174, -6, 8, 90);
        tenu = [{ t: 'haltere', m: 'G', k: 1.2 }];
      }
    } else if (o.kickback) {
      if (!o.tabouret && !o.penche) o.penche = 72;
      if (o.tabouret) o.penche = 48;
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = { az: 110, el: 8 };
      a = B(0, -6, 0, 96, pron === 180 ? 90 : pron); b = B(0, -12, 0, 4, pron === 180 ? 90 : pron);
      ancre = V(0, 0.15, 0.95);
      if (m !== 'GD' && !o.tabouret) { const t = c.tronc(p); autre = { prise: t.hanches.D.clone().add(V(-0.06, -0.2, 0.3)), pole: V(-1, 0.3, -0.4), paume: V(0, -1, 0), dirMain: V(0.3, -0.2, 1), doigts: 'detendu' }; }
    } else if (o.croise) {
      // Deux poulies hautes : chaque main tient le câble d'en face ; les bras s'ouvrent vers le bas.
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = { az: 12, el: 8 };
      a = B(45, 78, -35, 122, 180); b = B(80, 58, -5, 8, 180);
      ancre = s => V(-s * 0.85, 2.0, 0.25);
    } else if (o.travers) {
      // Un bras : le coude devant le buste, la main part de l'épaule opposée et s'étend sur le côté.
      P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = { az: 20, el: 8 };
      a = B(25, 82, -70, 118, 180); b = B(70, 84, -5, 8, 180); ancre = s => V(-s * 0.9, 1.45, 0.2);
    } else if (o.horizontal) {
      // Assis dos à la poulie haute : les avant-bras partent de derrière la tête et s'étendent vers l'avant.
      o.assis = true; P = postureDe(c, o, C); p = P.p; fixe = P.fixe; vue = { az: 120, el: 8 };
      a = B(0, 108, 0, 128, 90); b = B(0, 100, 0, 8, 90); ancre = V(0, 1.55, -0.95);
    } else if (o.machine) {
      // Assis, le haut des bras posé sur un coussin : les mains poussent les poignées vers le bas.
      p = assis(c, { h: 0.52, penche: 10, zPieds: 0.3 }); p.thorax = 4;
      a = B(4, 56, 0, 122, 90); b = B(4, 56, 0, 10, 90);
      const t = c.tronc(p), ep = t.epaules.G;
      fixe = poseFixe(MAT.siege(C, 0.52, 0.5, 4)).concat(poseFixe(MAT.pupitre(C, ep.y - 0.22, ep.z + 0.25, 35)));
      r.pivot = s => V(s * 0.2, ep.y - 0.3, ep.z + 0.32); vue = { az: 55, el: 10 };
    } else {
      // Pushdown : face à la poulie haute, coudes au corps ; les avant-bras descendent.
      P = postureDe(c, o, C, { penche: 8 }); p = P.p; fixe = P.fixe; vue = { az: 55, el: 8 };
      a = B(20, 14, 0, 118, pron); b = B(20, 9, 0, 6, pron);
      if (o.corde) b = B(40, 9, 12, 4, 90);                       // la corde s'ouvre en bas
      ancre = V(0, 2.02, 0.42);
      if (!r.bout && m === 'GD' && (o.poulie || !o.elas)) r.bout = 'barre';
      if (!o.elas && !o.poulie) o.poulie = true;
    }
    r.ancre = ancre;
    if (!(o.barre || o.ez || o.hal || o.kb || o.poulie || o.elas || o.machine || o.hal1)) o.hal = true;
    if (o.elas && ancre) r.deElas = ancre;
    const ancres = !ancre ? null : typeof ancre === 'function' ? [ancre(1), ancre(-1)].slice(0, m === 'GD' ? 2 : 1) : ancre;
    return Object.assign(parLesBras(p, a, b, m, autre), { fixe: colonneSi(o, C, ancres, fixe || []), vue, tenu: tenu || tenuDe(o, m, r) }, rythmeDe(o));
  };
