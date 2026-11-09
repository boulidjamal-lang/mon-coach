#!/usr/bin/env node
/* Écrit les scripts SQL de l'appli (ceux de l'écran Administration › Serveur
   et SQL, source unique dans index.html) dans supabase/migrations/, un fichier
   par script et dans l'ordre où ils se passent. Les scripts sont idempotents :
   le dossier est donc rejouable sur une base vide (tests, CI) comme sur la
   production (supabase db push). Lancer : node scripts/exporter-sql.mjs
   Le test « migrations à jour » échoue si le dossier n'a pas été régénéré
   après un changement des scripts dans index.html. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { lancerNavigateur, ouvrirAppli } = require(path.join(RACINE, 'tests', 'outils.js'));

export const SCRIPTS = [
  ['0001_comptes_et_synchro', 'SQL_SUPABASE'],
  ['0002_securite_des_donnees', 'SQL_RLS'],
  ['0003_table_des_aliments', 'sqlAccents()'],
  ['0004_pseudos_gymbros_photos', 'SQL_GYMBRO_PHOTOS'],
  ['0005_pro', 'SQL_PRO'],
  ['0006_app_store', 'SQL_APP_STORE'],
  ['0007_seances_en_direct', 'SQL_GYMBRO_DIRECT'],
  ['0008_administration', 'SQL_ADMIN'],
  ['0009_saison_et_defis', 'SQL_SAISON'],
  ['0010_balance_withings', 'SQL_WITHINGS'],
];

export async function lireScripts() {
  const navigateur = await lancerNavigateur();
  try {
    const appli = await ouvrirAppli(navigateur, {});
    try {
      return await appli.page.evaluate(exprs => exprs.map(e => (0, eval)(e)), SCRIPTS.map(([, e]) => e));
    } finally { await appli.ctx.close(); }
  } finally { await navigateur.close(); }
}

export function contenuFichier(nom, sql) {
  return `-- ${nom} — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.\n` + sql.replace(/\s+$/, '') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dossier = path.join(RACINE, 'supabase', 'migrations');
  fs.mkdirSync(dossier, { recursive: true });
  const textes = await lireScripts();
  SCRIPTS.forEach(([nom], i) => fs.writeFileSync(path.join(dossier, nom + '.sql'), contenuFichier(nom, textes[i])));
  console.log(`${SCRIPTS.length} scripts écrits dans supabase/migrations/`);
}
