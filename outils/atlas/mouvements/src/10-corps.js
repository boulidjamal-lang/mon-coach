
  /* ---------- Le corps : squelette de mouvement et solveur de pose ----------
     Une pose décrit : le bassin (place et orientation), la colonne (angles), et chaque membre de l'une de ces façons :
       bras  — cible { prise, pole, paume, dirMain } (la main va à un endroit précis)
             — directions { dirBras, dirAvantBras, paume } dans le monde
             — angles anatomiques { plan, elev, rot, coude, pron, poignet } dans le repère du thorax :
               plan d'élévation (0 = vers l'avant, 90 = sur le côté), élévation (0 = bras le long du corps, 90 =
               à l'horizontale, 180 = à la verticale ; négative = vers l'arrière), rotation externe de l'humérus,
               flexion du coude, pronation (0 = supination, 90 = prise marteau, 180 = pronation), flexion du poignet ;
       jambe — cible { cheville, pole, pied, hautPied }
             — angles { flex, abd, rot, genou, pointe } dans le repère du bassin : flexion et abduction de la
               hanche, rotation externe, flexion du genou, extension de la cheville (pointe du pied).
     Options communes aux bras : hausse (épaule haussée) et avance (épaule portée en avant), en degrés ; ceinture
     (part du mouvement du bras reprise par la ceinture scapulaire, à la place de la part ordinaire) ; doigts.
     Options des jambes : orteils (flexion des orteils quand le pied est sur la pointe). */
  class Corps {
    /* squelette : articulations de l'atlas ({ nom, parent, centre, jumeau }) ; sourcePeau(regions) : points de la
       surface du corps au repos ({ n, P, J, W }) pour mesurer le corps posé (appuis, contrôles). */
    constructor(squelette, sourcePeau) {
      const nb = squelette.length;
      this.nb = nb; this.S = squelette;
      this.i = Object.fromEntries(squelette.map((a, k) => [a.nom, k]));
      this.parent = squelette.map(a => a.parent);
      // Les attaches (ajoutées par le moteur : voir reponderer) : orientation de l'articulation d'origine (de), placées
      // comme le point d'insertion (leur centre) emmené par l'os visé (vers). Elles suivent, elles ne se posent pas.
      this.virtuel = squelette.map(a => a.virtuel || null);
      this.evase = new Float32Array(nb); this.aEvase = false;
      this.tete = squelette.map(a => V(a.centre[0], a.centre[1], a.centre[2]));
      this.decal = squelette.map((a, k) => (a.parent >= 0 ? this.tete[k].clone().sub(this.tete[a.parent]) : this.tete[k].clone()));
      this.ql = Array.from({ length: nb }, () => new Quat());   // rotation par rapport au parent
      this.qw = Array.from({ length: nb }, () => new Quat());   // rotation dans le monde
      this.pw = Array.from({ length: nb }, () => V());          // position de l'articulation dans le monde
      this.pFixe = new Array(nb).fill(null);                    // articulation posée à un endroit précis
      this.posRacine = this.tete[0].clone();
      this.mats = new Float32Array(nb * 12);
      this.sourcePeau = typeof sourcePeau === 'function' ? sourcePeau : null;
      this.peaux = {};
      this.majMonde();
      const T = nom => this.tete[this.i[nom]];
      const L = this.L = {
        bras: T('ulna.G').distanceTo(T('humerus.G')),
        avantBras: T('main.G').distanceTo(T('ulna.G')),
        main: 0.85 * T('doigt3-1.G').distanceTo(T('main.G')),   // du poignet au creux de la main
        creux: 0.024,                                            // du plan de la main au centre d'une barre tenue
        cuisse: T('tibia.G').distanceTo(T('femur.G')),
        jambe: T('pied.G').distanceTo(T('tibia.G')),
        chevilleH: T('pied.G').y,
        racine: T('bassin').clone(),
        hanche: T('femur.G').clone().sub(T('bassin')),
        epaule: T('humerus.G').clone().sub(T('bassin')),
        // Le pied : de la cheville à l'articulation des orteils (vers l'avant, vers le bas), au repos.
        avantPied: Math.hypot(T('orteils.G').x - T('pied.G').x, T('orteils.G').z - T('pied.G').z),
        orteilsH: T('orteils.G').y,
        dos: 0.11, poitrine: 0.12, ventre: 0.1, fesses: 0.1, genou: 0.05, flanc: 0.16
      };
      // Le coude ne plie pas au-delà de 152° : plus loin, l'avant-bras traverse le biceps (le modèle a la carrure d'un
      // athlète, sa chair ne s'écrase pas) — c'est déjà la barre aux clavicules d'un développé ou d'un squat avant.
      // coudeMin : la distance de l'épaule au poignet à cette flexion.
      const plie = rad(152);
      L.coudeMin = Math.sqrt(L.bras * L.bras + L.avantBras * L.avantBras + 2 * L.bras * L.avantBras * Math.cos(plie));
      L.prise = L.avantBras + L.main;
      L.taille = T('tete').y + 0.16;
      /* Repères au repos des membres : directions des deux segments, sens où
         plie l'articulation (f), axe de la charnière (h), angle au repos. */
      const membre = (d1, d2, f) => {
        d1 = unite(d1); d2 = unite(d2); f = unite(perp(f, d1));
        return { d1, d2, f, h: d1.clone().cross(f).normalize(), theta0: Math.atan2(d2.dot(f), d2.dot(d1)) };
      };
      this.R = {};
      for (const [c, s, x] of COTES) {
        const dBras = T('ulna' + x).clone().sub(T('humerus' + x)), dAB = T('main' + x).clone().sub(T('ulna' + x));
        const dCuisse = T('tibia' + x).clone().sub(T('femur' + x)), dJambe = T('pied' + x).clone().sub(T('tibia' + x));
        const dMain = unite(T('doigt3-1' + x).clone().sub(T('main' + x)));
        const indexAuriculaire = T('doigt5-1' + x).clone().sub(T('doigt2-1' + x));
        const paume = unite(perp(indexAuriculaire.clone().cross(dMain).multiplyScalar(s), dMain));   // sort de la paume
        const versOrteils = T('orteils' + x).clone().sub(T('pied' + x)); versOrteils.y = 0;
        const R = this.R[c] = {
          bras: membre(dBras, dAB, V(0, 0, 1)),               // le coude plie vers l'avant
          jambe: membre(dCuisse, dJambe, V(0, 0, -1)),        // le genou plie vers l'arrière
          main: { d: dMain, paume }, pied: unite(versOrteils), doigts: {}
        };
        for (let f = 1; f <= 5; f++) {
          const base = T(`doigt${f}-1` + x), a = T(`doigt${f}-2` + x), b = T(`doigt${f}-3` + x), bout = b.clone().add(b.clone().sub(a).multiplyScalar(0.9));
          // Les doigts se replient vers la paume ; le pouce, en travers de la paume.
          const versPaume = f === 1 ? unite(paume.clone().multiplyScalar(0.45).add(unite(T('doigt5-1' + x).clone().sub(base)))) : paume;
          R.doigts[f] = unite(bout.clone().sub(base)).cross(versPaume).normalize();
        }
      }
      this.mesurer();
    }
    /* Épaisseurs du corps, mesurées sur la peau au repos : du bassin à la surface du dos, du ventre, etc. */
    mesurer() {
      const L = this.L, pe = this.peau(['bassin', 'cuisse', 'abdomen', 'dos', 'thorax']);
      if (!pe) return;
      const b = L.racine, thor = this.tete[this.i.thorax];
      let zDos = Infinity, zVentre = -Infinity, zPoitrine = -Infinity, zFesses = Infinity, xFlanc = 0;
      for (let v = 0; v < pe.n; v++) {
        const x = pe.P[v * 3], y = pe.P[v * 3 + 1], z = pe.P[v * 3 + 2];
        if (y > b.y - 0.05 && y < b.y + 0.45 && z < zDos) zDos = z;
        if (y > b.y - 0.02 && y < b.y + 0.2 && z > zVentre) zVentre = z;
        if (y > thor.y + 0.12 && y < thor.y + 0.3 && z > zPoitrine) zPoitrine = z;
        if (y > b.y - 0.2 && y < b.y + 0.02 && z < zFesses) zFesses = z;
        if (y > b.y - 0.1 && y < b.y + 0.1 && Math.abs(x) > xFlanc) xFlanc = Math.abs(x);
      }
      if (isFinite(zDos)) L.dos = b.z - zDos;
      if (isFinite(zVentre)) L.ventre = zVentre - b.z;
      if (isFinite(zPoitrine)) L.poitrine = zPoitrine - thor.z;
      if (isFinite(zFesses)) L.fesses = b.z - zFesses;
      if (xFlanc) L.flanc = xFlanc;
    }
    /* Points de la surface du corps pour des régions (mis de côté une fois lus). */
    peau(regions) {
      if (!this.sourcePeau) return null;
      const cle = regions ? regions.join('+') : '*';
      return this.peaux[cle] || (this.peaux[cle] = this.sourcePeau(regions));
    }
    /* Positions et rotations dans le monde, du bassin vers les extrémités. */
    majMonde() {
      const { nb, parent, ql, qw, pw, pFixe, decal } = this;
      this.aEvase = false;
      for (let b = 0; b < nb; b++) {
        const p = parent[b], vi = this.virtuel[b];
        if (vi) {
          // Où va le point d'insertion (emmené par l'os visé) ; vu de l'articulation d'origine, de combien il a tourné
          // autour de l'axe du tronc : l'attache prend l'orientation de l'origine, tournée d'autant (voir le moteur).
          const c = this.tete[b], w = pw[b].copy(c).sub(this.tete[vi.vers]).applyQuaternion(qw[vi.vers]).add(pw[vi.vers]);
          const l = w.clone().sub(pw[vi.de]).applyQuaternion(qw[vi.de].clone().invert()).add(this.tete[vi.de]), xA = vi.axe[0], zA = vi.axe[1];
          let an = Math.atan2(l.x - xA, l.z - zA) - Math.atan2(c.x - xA, c.z - zA); if (an > Math.PI) an -= 2 * Math.PI; else if (an < -Math.PI) an += 2 * Math.PI;
          qw[b].copy(qw[vi.de]).multiply(qAxe(AY, an));
          // L'évasement : l'écart à l'axe que prend le muscle quand l'insertion monte (voir le moteur).
          this.evase[b] = (vi.evase || 0) * Math.max(0, l.y - c.y); if (this.evase[b] > 1e-5) this.aEvase = true;
          continue;
        }
        if (p < 0) { qw[b].copy(ql[b]); pw[b].copy(this.posRacine); continue; }
        qw[b].multiplyQuaternions(qw[p], ql[b]);
        if (pFixe[b]) pw[b].copy(pFixe[b]);
        else pw[b].copy(decal[b]).applyQuaternion(qw[p]).add(pw[p]);
      }
    }
    /* Donne à une articulation sa rotation dans le monde (et, au besoin, sa place). */
    poserMonde(nom, q, pos) {
      const b = this.i[nom];
      this.ql[b].copy(this.qw[this.parent[b]]).invert().multiply(q);
      this.pFixe[b] = pos ? pos.clone() : null;
      this.majMonde();
    }
    monde(nom) { return this.pw[this.i[nom]].clone(); }
    qMonde(nom) { return this.qw[this.i[nom]].clone(); }
    /* Les matrices de pose pour le moteur : une 3×4 par articulation (rotation, puis déplacement), par lignes. */
    matrices() {
      const m = this.mats;
      for (let b = 0; b < this.nb; b++) {
        const q = this.qw[b], c = this.tete[b], p = this.pw[b], x = q.x, y = q.y, z = q.z, w = q.w, o = b * 12;
        const r0 = 1 - 2 * (y * y + z * z), r1 = 2 * (x * y - z * w), r2 = 2 * (x * z + y * w), r3 = 2 * (x * y + z * w), r4 = 1 - 2 * (x * x + z * z), r5 = 2 * (y * z - x * w), r6 = 2 * (x * z - y * w), r7 = 2 * (y * z + x * w), r8 = 1 - 2 * (x * x + y * y);
        m[o] = r0; m[o + 1] = r1; m[o + 2] = r2; m[o + 3] = p.x - (r0 * c.x + r1 * c.y + r2 * c.z);
        m[o + 4] = r3; m[o + 5] = r4; m[o + 6] = r5; m[o + 7] = p.y - (r3 * c.x + r4 * c.y + r5 * c.z);
        m[o + 8] = r6; m[o + 9] = r7; m[o + 10] = r8; m[o + 11] = p.z - (r6 * c.x + r7 * c.y + r8 * c.z);
      }
      return m;
    }
    /* Le déplacement de chaque articulation en quaternion dual (rotation, glissement), comme le moteur les mélange :
       chaque rotation est prise du même côté que celle de son parent. */
    quaternionsDuaux() {
      const q = this.dq || (this.dq = new Float32Array(this.nb * 8));
      for (let b = 0; b < this.nb; b++) {
        const r = this.qw[b], c = this.tete[b], p = this.pw[b], pa = this.parent[b], o = b * 8;
        let x = r.x, y = r.y, z = r.z, w = r.w;
        if (pa >= 0 && x * q[pa * 8] + y * q[pa * 8 + 1] + z * q[pa * 8 + 2] + w * q[pa * 8 + 3] < 0) { x = -x; y = -y; z = -z; w = -w; }
        // Le glissement : où va l'origine (p − R·c).
        const ux = y * c.z - z * c.y, uy = z * c.x - x * c.z, uz = x * c.y - y * c.x;
        const tx = p.x - (c.x + 2 * (w * ux + y * uz - z * uy)), ty = p.y - (c.y + 2 * (w * uy + z * ux - x * uz)), tz = p.z - (c.z + 2 * (w * uz + x * uy - y * ux));
        q[o] = x; q[o + 1] = y; q[o + 2] = z; q[o + 3] = w;
        q[o + 4] = 0.5 * (tx * w + ty * z - tz * y); q[o + 5] = 0.5 * (ty * w + tz * x - tx * z); q[o + 6] = 0.5 * (tz * w + tx * y - ty * x); q[o + 7] = -0.5 * (tx * x + ty * y + tz * z);
      }
      return q;
    }
    /* La peau posée (les deux côtés), pour la pose en cours : appelle f(x, y, z) pour chaque point. Même mélange que
       le moteur : quaternions duaux, et, à l'épaule, la part « par la corde » que la source donne pour chaque point
       (pe.C) — ce qu'on mesure ici est ce qui se dessine. */
    peauPosee(regions, f, unCote) {
      const pe = this.peau(regions); if (!pe) return false;
      const q = this.quaternionsDuaux(), S = this.S, A = this.appuis && this.appuis.length ? this.appuis : null;
      // unCote : le côté gauche seul (une pose symétrique se lit sur un côté, pour moitié prix).
      for (let cote = 0; cote < (unCote ? 1 : 2); cote++) for (let v = 0; v < pe.n; v++) {
        const X = cote ? -pe.P[v * 3] : pe.P[v * 3], Y = pe.P[v * 3 + 1], Z = pe.P[v * 3 + 2];
        let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0;
        for (let k = 0; k < 4; k++) {
          const w = pe.W[v * 4 + k]; if (!w) continue;
          const o = (cote ? S[pe.J[v * 4 + k]].jumeau : pe.J[v * 4 + k]) * 8;
          rx += w * q[o]; ry += w * q[o + 1]; rz += w * q[o + 2]; rw += w * q[o + 3]; dx += w * q[o + 4]; dy += w * q[o + 5]; dz += w * q[o + 6]; dw += w * q[o + 7];
        }
        const l = 1 / (Math.hypot(rx, ry, rz, rw) || 1); rx *= l; ry *= l; rz *= l; rw *= l; dx *= l; dy *= l; dz *= l; dw *= l;
        const ux = ry * Z - rz * Y + rw * X, uy = rz * X - rx * Z + rw * Y, uz = rx * Y - ry * X + rw * Z;
        let px = X + 2 * (ry * uz - rz * uy) + 2 * (rw * dx - dw * rx + ry * dz - rz * dy),
          py = Y + 2 * (rz * ux - rx * uz) + 2 * (rw * dy - dw * ry + rz * dx - rx * dz),
          pz = Z + 2 * (rx * uy - ry * ux) + 2 * (rw * dz - dw * rz + rx * dy - ry * dx);
        const c = pe.C ? pe.C[v] : 0;
        if (c > 0) {
          // Par la corde : la moyenne des places que chaque articulation donnerait au point.
          let cx = 0, cy = 0, cz = 0, wt = 0;
          for (let k = 0; k < 4; k++) {
            const w = pe.W[v * 4 + k]; if (!w) continue;
            const o = (cote ? S[pe.J[v * 4 + k]].jumeau : pe.J[v * 4 + k]) * 8, ax = q[o], ay = q[o + 1], az = q[o + 2], aw = q[o + 3], bx = q[o + 4], by = q[o + 5], bz = q[o + 6], bw = q[o + 7];
            const vx = ay * Z - az * Y + aw * X, vy = az * X - ax * Z + aw * Y, vz = ax * Y - ay * X + aw * Z;
            cx += w * (X + 2 * (ay * vz - az * vy) + 2 * (aw * bx - bw * ax + ay * bz - az * by));
            cy += w * (Y + 2 * (az * vx - ax * vz) + 2 * (aw * by - bw * ay + az * bx - ax * bz));
            cz += w * (Z + 2 * (ax * vy - ay * vx) + 2 * (aw * bz - bw * az + ax * by - ay * bx));
            wt += w;
          }
          px += (cx / wt - px) * c; py += (cy / wt - py) * c; pz += (cz / wt - pz) * c;
        }
        // Les attaches : l'évasement du muscle qui monte avec le bras (voir le programme des sommets du moteur).
        if (this.aEvase) for (let k = 0; k < 4; k++) {
          const w = pe.W[v * 4 + k]; if (!w) continue;
          const j = cote ? S[pe.J[v * 4 + k]].jumeau : pe.J[v * 4 + k], e = this.evase[j]; if (!(e > 0)) continue;
          const a = this.virtuel[j].axe, ex = X - a[0], ez = Z - a[1], g = e * w * Math.min(1, 2 * (1 - w)) / Math.max(Math.hypot(ex, ez), 1e-4), vx = ex * g, vz = ez * g;
          // (vx, 0, vz) tourné par la rotation mélangée du sommet.
          const tx = -rz * 0 + rw * vx + ry * vz, ty = rz * vx - rx * vz, tz = rx * 0 - ry * vx + rw * vz;
          px += vx + 2 * (ry * tz - rz * ty); py += 2 * (rz * tx - rx * tz); pz += vz + 2 * (rx * ty - ry * tx);
        }
        // Les appuis du mouvement (this.appuis, voir appuisDe) : la chair écrasée contre les coussins, comme le moteur la dessine.
        if (A) for (let i = 0; i < A.length; i++) {
          const a = A[i], h = a[4] * px + a[5] * py + a[6] * pz + a[7];
          if (h < 0 && h > -a[14]) {
            const bord = (1 - lisse((Math.abs(a[0] * px + a[1] * py + a[2] * pz + a[3]) - a[12]) / 0.03)) * (1 - lisse((Math.abs(a[8] * px + a[9] * py + a[10] * pz + a[11]) - a[13]) / 0.03));
            const e = (-h - a[15] * (1 - Math.exp(h / a[15]))) * bord * lisse((h + a[14]) / (0.25 * a[14]));
            px += a[4] * e; py += a[5] * e; pz += a[6] * e;
          }
        }
        f(px, py, pz);
      }
      return true;
    }
    /* Jusqu'où va le corps dans la direction n (unitaire), pour la pose p : le plus grand (point · n).
       zone(x, y, z) : ne compter que les points pour lesquels elle dit vrai (ce qui est au-dessus d'un coussin). */
    extreme(p, n, regions, zone) {
      this.poser(p);
      let m = -Infinity;
      if (!this.peauPosee(regions, (x, y, z) => { if (zone && !zone(x, y, z)) return; const d = x * n.x + y * n.y + z * n.z; if (d > m) m = d; })) {
        for (const q of this.pw) m = Math.max(m, q.dot(n) + 0.06);   // sans la peau : les articulations, plus une marge
      }
      return m;
    }
    /* Déplace le bassin de la pose p pour que le corps repose sur un plan (point Q, normale n vers le dehors).
       zone : la partie du plan qui porte (voir extreme) ; si rien du corps n'est au-dessus, la pose ne bouge pas. */
    poserSur(p, Q, n, regions, zone) {
      const e = this.extreme(p, n.clone().multiplyScalar(-1), regions, zone);
      if (e === -Infinity) return p;
      const d = -e - Q.dot(n);
      p.bassin.pos.add(n.clone().multiplyScalar(-d));
      return p;
    }
    /* Bassin, colonne, cou et tête ; renvoie de quoi placer mains et matériel.
       Épaules au repos (la ceinture scapulaire suivra le bras dans poser). */
    tronc(p) {
      const q = nom => this.ql[this.i[nom]];
      this.posRacine.copy(p.bassin.pos); q('bassin').copy(p.bassin.rot);
      const lomb = rad(p.lombaires || 0), thor = rad(p.thorax || 0), cou = rad(p.cou || 0);
      const inclin = rad(p.inclinaison || 0), vrille = rad(p.torsion || 0);
      // Les lombaires fléchissent et s'inclinent ; le thorax tourne surtout sur lui-même.
      for (const nom of ['L5', 'L4', 'L3', 'L2', 'L1']) q(nom).copy(qAxe(AX, lomb / 5).multiply(qAxe(AZ, inclin * 0.14)).multiply(qAxe(AY, vrille * 0.04)));
      q('thorax').copy(qAxe(AX, thor).multiply(qAxe(AZ, inclin * 0.3)).multiply(qAxe(AY, vrille * 0.8)));
      const couI = rad(p.couIncl || 0) / 3, couR = rad(p.couRot || 0) / 3;
      for (const nom of ['cou1', 'cou2', 'cou3']) q(nom).copy(qAxe(AX, cou / 3).multiply(qAxe(AZ, couI)).multiply(qAxe(AY, couR)));
      q('tete').copy(qAxe(AX, rad(p.tete || 0)));
      for (const [, , x] of COTES) q('clavicule' + x).identity();
      this.pFixe.fill(null);
      this.majMonde();
      return {
        epaules: { G: this.monde('humerus.G'), D: this.monde('humerus.D') },
        hanches: { G: this.monde('femur.G'), D: this.monde('femur.D') },
        cou: this.monde('cou1'), tete: this.monde('tete'), qThorax: this.qMonde('thorax'), qBassin: this.qMonde('bassin'), qTete: this.qMonde('tete'),
        // Un point donné dans le repère du thorax (depuis le milieu des épaules) ou du bassin, placé dans le monde.
        duThorax: v => this.monde('humerus.G').add(this.monde('humerus.D')).multiplyScalar(0.5).add(v.clone().applyQuaternion(this.qMonde('thorax'))),
        duBassin: v => this.monde('bassin').add(v.clone().applyQuaternion(this.qMonde('bassin')))
      };
    }
    /* Place tout le corps ; renvoie où sont les mains et les pieds (pour le matériel). */
    poser(p) {
      this.tronc(p);
      const info = { prises: {}, axes: {}, poignets: {}, coudes: {}, paumes: {}, dirMains: {}, chevilles: {}, genoux: {}, orteils: {}, pieds: {}, angles: {} };
      for (const [c, s, x] of COTES) this.bras(c, s, x, p.bras[c], info);
      for (const [c, s, x] of COTES) this.jambe(c, s, x, p.jambes[c], info);
      info.epaules = { G: this.monde('humerus.G'), D: this.monde('humerus.D') };
      info.hanches = { G: this.monde('femur.G'), D: this.monde('femur.D') };
      info.qThorax = this.qMonde('thorax'); info.qBassin = this.qMonde('bassin');
      info.bassin = this.monde('bassin'); info.tete = this.monde('tete'); info.cou = this.monde('cou1');
      return info;
    }
    /* Jusqu'où avancent les jambes (cuisses, genoux, tibias) entre deux
       hauteurs, pour la pose donnée : la barre doit passer devant. */
    devantJambes(p, yMin, yMax, regions, unCote) {
      this.tronc(p);
      const info = { angles: {}, chevilles: {}, genoux: {}, orteils: {} };
      for (const [c, s, x] of COTES) this.jambe(c, s, x, p.jambes[c], info);
      let zMax = -Infinity;
      // regions : pour ne relire que la peau qui peut se trouver à cette hauteur (jambe sous le genou, cuisse et bassin au-dessus).
      if (!this.peauPosee(regions || ['bassin', 'cuisse', 'jambe'], (x, y, z) => { if (y >= yMin && y <= yMax && z > zMax) zMax = z; }, unCote)) return 0.12;
      return zMax === -Infinity ? 0.12 : zMax;
    }
    /* Une barre horizontale (en travers, de rayon r) à la hauteur y, amenée contre le corps dans la pose en cours, par
       l'avant (sens 1) ou par l'arrière (sens -1) : le z de son axe quand elle touche, entre le plan médian et xMax ;
       null si le corps ne passe pas à cette hauteur. Avec un rayon grossi d'une marge, c'est par où elle passe à
       distance (devant le visage, derrière le crâne). */
    barreContre(y, r, regions, xMax, sens) {
      let m = -Infinity;
      if (!this.peauPosee(regions, (px, py, pz) => { const dy = py - y; if (px <= xMax && dy < r && dy > -r) { const z = sens * pz + Math.sqrt(r * r - dy * dy); if (z > m) m = z; } }, true)) return null;
      return m === -Infinity ? null : sens * m;
    }
    /* Les jambes seules, pour la pose donnée (ni les bras ni la peau) : hanches, genoux, chevilles. Sert à régler une
       posture sur ses jambes sans poser tout le corps. */
    jambesDe(p) {
      const t = this.tronc(p), info = { angles: {}, chevilles: {}, genoux: {}, orteils: {}, hanches: t.hanches, epaules: t.epaules };
      for (const [c, s, x] of COTES) this.jambe(c, s, x, p.jambes[c], info);
      return info;
    }
    /* Un bras (voir en tête de classe les trois façons de le décrire) ; doigts : 'barre', 'plat', 'detendu', 'poing'. */
    bras(c, s, x, b, info) {
      const L = this.L, R = this.R[c], i = this.i;
      const QT = this.qw[i.thorax].clone();
      const angles = b.elev != null;
      let d1, d2, coude, fFixe = null, paume, dirMain = b.dirMain ? unite(b.dirMain) : null;
      // Dégagement (voir degagerTenu) : le poignet est déplacé de b.dg (un vecteur, dans le monde) pour que ce que la
      // main tient s'écarte de la cuisse ou du buste ; la main garde son orientation, le coude suit.
      if (angles) {
        const plan = rad(b.plan || 0), k = rad(b.coude || 0);
        const Rq = qAxe(V(Math.cos(plan), 0, -s * Math.sin(plan)), -rad(b.elev));
        const a1 = V(0, -1, 0).applyQuaternion(Rq);
        const f = V(0, 0, 1).applyQuaternion(Rq).applyQuaternion(qAxe(a1, -s * rad(b.rot || 0)));
        const a2 = a1.clone().multiplyScalar(Math.cos(k)).add(f.clone().multiplyScalar(Math.sin(k)));
        // Paume en supination : du côté des fléchisseurs ; la pronation la fait tourner autour de l'avant-bras.
        let pm = a1.clone().multiplyScalar(-Math.sin(k)).add(f.clone().multiplyScalar(Math.cos(k))).applyQuaternion(qAxe(a2, s * rad(b.pron || 0)));
        let dm = a2.clone();
        if (b.poignet) {
          const w = rad(b.poignet), pm0 = pm.clone();
          dm = a2.clone().multiplyScalar(Math.cos(w)).add(pm0.clone().multiplyScalar(Math.sin(w)));
          pm = pm0.multiplyScalar(Math.cos(w)).sub(a2.clone().multiplyScalar(Math.sin(w)));
        }
        if (b.deviation) {
          // Vers le pouce (positif) ou le petit doigt : la main tourne dans le plan de la paume.
          const r = rad(b.deviation), cote = pm.clone().cross(dm).multiplyScalar(s);
          dm = dm.clone().multiplyScalar(Math.cos(r)).add(cote.multiplyScalar(Math.sin(r)));
        }
        d1 = a1.applyQuaternion(QT); d2 = a2.applyQuaternion(QT); fFixe = f.applyQuaternion(QT);
        paume = pm.applyQuaternion(QT).normalize(); dirMain = dm.applyQuaternion(QT).normalize();
      } else paume = unite(b.paume || AZ);
      const dg = b.dg && b.dg.lengthSq() > 1e-10 ? b.dg : null, d1o = d1, d2o = d2;
      if (dg) fFixe = null;   // le coude plie où le déplacement le mène
      const resoudre = () => {
        const ep = this.pw[i['humerus' + x]];
        if (angles || b.dirBras) {
          if (!angles) { d1 = unite(b.dirBras); d2 = unite(b.dirAvantBras || b.dirBras); }
          else { d1 = d1o; d2 = d2o; }
          coude = ep.clone().add(d1.clone().multiplyScalar(L.bras));
          if (dg) {
            // Par angles : le poignet où les angles le mettent, déplacé ; le coude garde son côté.
            const r = ik2(ep, coude.clone().add(d2.clone().multiplyScalar(L.avantBras)).add(dg), L.bras, L.avantBras, d1, L.coudeMin);
            coude = r.milieu; d1 = unite(coude.clone().sub(ep)); d2 = unite(r.fin.clone().sub(coude));
          }
          return;
        }
        // La barre est dans le creux de la main ; le poignet est en retrait, dans l'axe des doigts.
        const creux = (dg ? b.prise.clone().add(dg) : b.prise.clone()).sub(paume.clone().multiplyScalar(L.creux));
        const r = dirMain ? ik2(ep, creux.sub(dirMain.clone().multiplyScalar(L.main)), L.bras, L.avantBras, b.pole, L.coudeMin) : ik2(ep, creux, L.bras, L.prise, b.pole, L.coudeMin);
        coude = r.milieu; d1 = unite(coude.clone().sub(ep)); d2 = unite(r.fin.clone().sub(coude));
      };
      // 1. La ceinture scapulaire (clavicule et omoplate) accompagne le bras, mesuré depuis le thorax ;
      //    elle peut en plus se hausser (haussement d'épaules) ou s'avancer.
      resoudre();
      const libre0 = arc(R.bras.d1.clone().applyQuaternion(QT), d1).multiply(QT);
      let qc = QT.clone().slerp(libre0, b.ceinture != null ? b.ceinture : K_CEINTURE);
      if (b.hausse || b.avance) qc = qAxe(AZ.clone().applyQuaternion(QT), s * rad(b.hausse || 0)).multiply(qAxe(AY.clone().applyQuaternion(QT), -s * rad(b.avance || 0))).multiply(qc);
      this.poserMonde('clavicule' + x, qc);
      // 2. Le bras, depuis l'épaule ainsi déplacée.
      resoudre();
      const libre = arc(R.bras.d1.clone().applyQuaternion(QT), d1).multiply(QT);   // bras orienté, sans rotation sur son axe
      // Sens où plie le coude ; bras tendu : à l'opposé du pôle (ou sans rotation sur l'axe).
      let f = fFixe ? perp(fFixe, d1) : perp(d2, d1);
      if (f.length() < 0.03) f = b.pole ? perp(b.pole.clone().multiplyScalar(-1), d1) : perp(R.bras.f.clone().applyQuaternion(libre), d1);
      f.normalize();
      const Q1 = qVers(R.bras.d1, R.bras.f, d1, f);
      // Le coude : une charnière.
      const theta = Math.atan2(d2.dot(f), d2.dot(d1));
      let Q2 = qAxe(R.bras.h.clone().applyQuaternion(Q1), theta - R.bras.theta0).multiply(Q1);
      Q2 = arc(R.bras.d2.clone().applyQuaternion(Q2), d2).multiply(Q2);
      // L'humérus tourne sur son axe à l'épaule ; l'ulna suit le coude.
      this.poserMonde('humerus' + x, Q1);
      this.poserMonde('ulna' + x, Q2, coude);
      // La main. Sa rotation autour de l'avant-bras est la pronation : c'est le radius qui tourne autour de l'ulna,
      // de 0° (paume en avant, position anatomique) à 175° environ ; le poignet prend le reste.
      const dMain = dirMain || d2.clone();
      const QM = qVers(R.main.d, R.main.paume, dMain, paume);
      let pron = s * torsion(QM.clone().multiply(Q2.clone().invert()), d2);
      if (pron < -Math.PI / 3) pron += 2 * Math.PI;
      pron = Math.min(rad(175), Math.max(rad(-15), pron));
      this.poserMonde('radius' + x, qAxe(d2, s * pron).multiply(Q2));
      this.poserMonde('main' + x, QM);
      // Doigts : refermés sur la barre, à plat, détendus, ou poing serré.
      const PLIS = { barre: [1.05, 1.25, 0.85], plat: [0.03, 0.03, 0.02], detendu: [0.28, 0.42, 0.3], poing: [1.35, 1.5, 1.0] };
      const plis = typeof b.doigts === 'number' ? PLIS.plat.map((x, n) => x + (PLIS.poing[n] - x) * b.doigts) : PLIS[b.doigts || 'detendu'];
      for (let fg = 1; fg <= 5; fg++) for (let j = 1; j <= 3; j++) this.ql[i[`doigt${fg}-${j}` + x]].copy(qAxe(R.doigts[fg], plis[j - 1] * (fg === 1 ? 0.7 : 1)));
      this.majMonde();
      const poignet = this.pw[i['main' + x]].clone();
      info.poignets[c] = poignet;
      info.coudes[c] = coude.clone();
      info.paumes[c] = paume.clone(); info.dirMains[c] = dMain.clone();
      info.prises[c] = poignet.clone().add(dMain.clone().multiplyScalar(L.main)).add(paume.clone().multiplyScalar(L.creux));
      info.axes[c] = paume.clone().cross(dMain).normalize();
      info.angles[c] = { pronation: pron * 180 / Math.PI, coude: theta * 180 / Math.PI };
    }
    /* Une jambe : cible (cheville, pôle du genou, direction et dessus du pied) ou angles anatomiques. */
    jambe(c, s, x, j, info) {
      const L = this.L, R = this.R[c], i = this.i;
      const ha = this.pw[i['femur' + x]];
      let cheville, pole, pied = j.pied, hautPied = j.hautPied;
      if (j.flex != null) {
        const QB = this.qw[i.bassin], k = rad(j.genou || 0), pt = rad(j.pointe || 0);
        const Rq = qAxe(AX, -rad(j.flex)).multiply(qAxe(AZ, s * rad(j.abd || 0)));
        const a1 = V(0, -1, 0).applyQuaternion(Rq);
        const f = V(0, 0, -1).applyQuaternion(Rq).applyQuaternion(qAxe(a1, -s * rad(j.rot || 0)));
        const a2 = a1.clone().multiplyScalar(Math.cos(k)).add(f.clone().multiplyScalar(Math.sin(k)));
        const g = a1.clone().multiplyScalar(-Math.sin(k)).add(f.clone().multiplyScalar(Math.cos(k)));   // vers le mollet
        pied = g.clone().multiplyScalar(-Math.cos(pt)).add(a2.clone().multiplyScalar(Math.sin(pt))).applyQuaternion(QB);
        hautPied = a2.clone().multiplyScalar(-Math.cos(pt)).add(g.clone().multiplyScalar(-Math.sin(pt))).applyQuaternion(QB);
        cheville = ha.clone().add(a1.multiplyScalar(L.cuisse).add(a2.multiplyScalar(L.jambe)).applyQuaternion(QB));
        pole = f.multiplyScalar(-1).applyQuaternion(QB);
      } else { cheville = j.cheville; pole = unite(j.pole || AZ); }
      const r = ik2(ha, cheville, L.cuisse, L.jambe, pole);
      const genou = r.milieu, d1 = unite(genou.clone().sub(ha)), d2 = unite(r.fin.clone().sub(genou));
      let f = perp(d2, d1);
      if (f.length() < 0.03) f = perp(pole.clone().multiplyScalar(-1), d1);
      f.normalize();
      const Q1 = qVers(R.jambe.d1, R.jambe.f, d1, f);
      // Le genou : une charnière.
      const theta = Math.atan2(d2.dot(f), d2.dot(d1));
      let Q2 = qAxe(R.jambe.h.clone().applyQuaternion(Q1), theta - R.jambe.theta0).multiply(Q1);
      Q2 = arc(R.jambe.d2.clone().applyQuaternion(Q2), d2).multiply(Q2);
      this.poserMonde('femur' + x, Q1);
      this.poserMonde('tibia' + x, Q2, genou);
      // Le pied : direction de la pointe et dessus du pied ; les orteils se relèvent quand le pied est sur la pointe.
      this.poserMonde('pied' + x, qVers(R.pied, AY, unite(pied || AZ), hautPied || AY));
      this.ql[i['orteils' + x]].copy(qAxe(AX, -rad(j.orteils || 0)));
      this.majMonde();
      info.chevilles[c] = this.pw[i['pied' + x]].clone(); info.genoux[c] = genou.clone(); info.orteils[c] = this.pw[i['orteils' + x]].clone();
      if (info.pieds) info.pieds[c] = { pied: unite(pied || AZ), hautPied: (hautPied || AY).clone() };
      info.angles['jambe' + c] = { genou: theta * 180 / Math.PI };
    }
  }
