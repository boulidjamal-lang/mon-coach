
  /* ---------- Animation d'un exercice sur l'atlas ----------
     atlas : le moteur (AnqaAtlas.creer ou monte.atlas) ; exo : { exercice: identifiant } ou { spec: 'famille …' }
     (ou { mouvement } : ancien nom) ; options : { clair, vue }. */
  const ANCIENS = { repos: 'repos', squat: 'squat barre', developpeCouche: 'developpe barre', curl: 'curl hal', traction: 'traction', pompe: 'pompe', elevationsLaterales: 'elevation lat hal', souleveDeTerre: 'souleve barre', rowing: 'rowing barre' };
  let INDEX = null;
  function specDe(id) {
    if (!INDEX) { INDEX = {}; for (const spec in EXERCICES) for (const x of EXERCICES[spec]) INDEX[x] = spec; }
    return INDEX[id] || null;
  }
  function creerAnimation(atlas, exo, options) {
    options = options || {};
    const C = TEINTES[options.clair ? 'clair' : 'sombre'];
    const corps = new Corps(atlas.squelette, atlas.peau ? regions => atlas.peau(regions) : null);
    const spec = exo.spec || (exo.exercice && specDe(exo.exercice)) || ANCIENS[exo.mouvement] || exo.mouvement;
    if (!spec) throw new Error('exercice sans mouvement : ' + (exo.exercice || ''));
    const d = definir(spec, corps, C), modeles = {};
    function placer(t, uFixe) {
      const av = avancee(d, t, uFixe), pose = poseDe(d, av);
      let info = corps.poser(pose);
      if (d.filet) {
        // Filet de sécurité des enchaînements complexes : entre deux poses clés, rien ne descend sous le sol.
        let bas = Infinity; for (const pt of corps.pw) if (pt.y < bas) bas = pt.y;
        if (bas < 0.045) { const p2 = Object.assign({}, pose, { bassin: { pos: pose.bassin.pos.clone().add(V(0, 0.045 - bas, 0)), rot: pose.bassin.rot } }); info = corps.poser(p2); }
      }
      return { info, formes: materielDe(d, info, av.u, C, modeles) };
    }
    // Cadrage : tout ce qui se voit pendant la répétition entière (articulations, plus une marge pour la chair ; matériel).
    const mini = [1e9, 1e9, 1e9], maxi = [-1e9, -1e9, -1e9];
    const etendre = (x, y, z, r) => { mini[0] = Math.min(mini[0], x - r); mini[1] = Math.min(mini[1], y - r); mini[2] = Math.min(mini[2], z - r); maxi[0] = Math.max(maxi[0], x + r); maxi[1] = Math.max(maxi[1], y + r); maxi[2] = Math.max(maxi[2], z + r); };
    for (let n = 0; n < 12; n++) {
      const { formes } = placer(n / 12 * d.periode);
      for (const pt of corps.pw) etendre(pt.x, pt.y, pt.z, 0.09);
      // Le matériel : les huit coins de chaque forme, tournés et posés (sauf ce qui est très grand : murs, colonnes).
      for (const f of formes) {
        if (Math.max(f.s[0], f.s[1], f.s[2]) > 1.9) continue;
        const q = new Quat(f.q[0], f.q[1], f.q[2], f.q[3]), dd = f.forme === 'boite' ? [f.s[0] / 2, f.s[1] / 2, f.s[2] / 2] : f.forme === 'cylindre' ? [f.s[0], f.s[1] / 2, f.s[2]] : [f.s[0], f.s[1], f.s[2]];
        for (let k = 0; k < 8; k++) { const cc = V(k & 1 ? dd[0] : -dd[0], k & 2 ? dd[1] : -dd[1], k & 4 ? dd[2] : -dd[2]).applyQuaternion(q); etendre(f.p[0] + cc.x, f.p[1] + cc.y, f.p[2] + cc.z, 0); }
      }
    }
    mini[1] = Math.max(0, mini[1]);
    const vue = options.vue || d.vue || { az: 45, el: 10 };
    function rendre(t, uFixe) {
      const { info, formes } = placer(t, uFixe);
      atlas.poser(corps.matrices());
      atlas.objets(formes);
      const b = corps.pw[0];
      atlas.ombre({ centre: [(mini[0] + maxi[0]) / 2, (mini[2] + maxi[2]) / 2], taille: [Math.max(0.45, (maxi[0] - mini[0]) * 0.5), Math.max(0.45, (maxi[2] - mini[2]) * 0.5)], pieds: false, force: b.y > 1.4 ? 0.5 : 1 });
      return info;
    }
    let actif = false, t0 = 0;
    const pas = tSec => { if (!actif) return false; if (!t0) t0 = tSec; rendre(tSec - t0); return true; };
    return {
      corps, rendre, boite: { min: mini, max: maxi }, vue, definition: d,
      cadrer(duree) { atlas.cadrerBoite(mini, maxi, vue, duree); },
      demarrer() { if (!actif) { actif = true; t0 = 0; atlas.animer(pas); } },
      arreter() { actif = false; atlas.animer(null); },
      // Retour à la position anatomique, sans matériel.
      quitter() { actif = false; atlas.animer(null); atlas.poser(null); atlas.objets([]); atlas.ombre(null); }
    };
  }

  racine.AnqaMouvements = { creerAnimation, definir, poseA, avancee, poseDe, materielDe, specDe, lireSpec, FAM, EXERCICES, TEINTES, cycle, Corps, V3, Quat };
