
  /* ---------- Familles ---------- */
  /* Debout, bras un peu écartés : pour regarder le corps. */
  FAM.repos = c => {
    const p = debout(c, { ecart: 0.1, ouv: 8 });
    p.bras = pareil({ plan: 90, elev: 12, rot: 0, coude: 14, pron: 80, doigts: 'detendu' });
    return { a: p, b: p, rythme: 'tenue', vue: { az: 0, el: 4 } };
  };
