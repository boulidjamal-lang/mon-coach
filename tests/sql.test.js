/* Tests d'isolation des données sur un vrai Postgres : les scripts SQL de
   l'appli (supabase/migrations, générés depuis index.html) sont rejoués sur
   une base vide avec un double de Supabase (rôles, auth.uid(), auth.jwt()),
   puis deux comptes se font face : aucun ne doit voir, modifier ni effacer
   les lignes de l'autre, et les fonctions ne doivent répondre qu'à qui de
   droit. Sautés (en le disant) si Postgres n'est pas installé.
   Lancer : node --test tests/sql.test.js */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { demarrerPostgres } = require('./sql/postgres-local');

const RACINE = path.join(__dirname, '..');
const MIGRATIONS = path.join(RACINE, 'supabase', 'migrations');
const ADMIN = 'jambou592@gmail.com';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', ADM = '33333333-3333-4333-8333-333333333333';

let pg = null;
before(() => {
  pg = demarrerPostgres();
  if (!pg) { console.log('# Postgres absent : tests SQL sautés'); return; }
  pg.sql(null, { fichier: path.join(__dirname, 'sql', 'stub-supabase.sql') });
  for (const f of fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) pg.sql(null, { fichier: path.join(MIGRATIONS, f) });
  pg.sql(`insert into auth.users (id, email) values ('${A}', 'a@test.fr'), ('${B}', 'b@test.fr'), ('${ADM}', '${ADMIN}');`);
});
after(() => { if (pg) pg.arreter(); });

/* Exécute du SQL « en tant que » un compte (comme PostgREST : rôle
   authenticated et revendications du jeton), dans une transaction. */
function enTantQue(utilisateur, email, sql) {
  const claims = utilisateur ? JSON.stringify({ sub: utilisateur, email, role: 'authenticated' }) : '{}';
  const role = utilisateur ? 'authenticated' : 'anon';
  return pg.sql(`begin; set local role ${role}; select set_config('request.jwt.claims', '${claims.replace(/'/g, "''")}', true); select set_config('request.jwt.claim.sub', '${utilisateur || ''}', true);\n${sql}\ncommit;`);
}
const lignes = sortie => sortie.trim().split('\n').filter(l => l && !/^(SET|BEGIN|COMMIT|set_config|-+|\(\d+ rows?\)|\s*$)/.test(l) && !/^\s*$/.test(l));
const compte = (utilisateur, email, requete) => Number(enTantQue(utilisateur, email, `\\pset tuples_only on\n${requete}`).trim().split('\n').filter(l => /^\s*-?\d+\s*$/.test(l)).pop());
const refuse = (utilisateur, email, sql) => { try { enTantQue(utilisateur, email, sql); return false; } catch (e) { return /permission denied|violates row-level security|Accès réservé|does not exist|not found|réservé/i.test(e.message) ? true : e.message; } };

const si = (nom, f) => test(nom, { skip: !pg && 'Postgres absent' }, f);

si('journées, profil, programmes, séances, exercices perso : chaque compte ne voit et ne touche que ses lignes ; un visiteur sans compte ne voit rien', () => {
  enTantQue(A, 'a@test.fr', `insert into journees (utilisateur, jour, donnees) values ('${A}', '2026-11-01', '{"meals":{}}');
    insert into profil (utilisateur, donnees) values ('${A}', '{"age":30}');
    insert into programmes_musculation (utilisateur, id, donnees) values ('${A}', 'p1', '{}');
    insert into seances_musculation (utilisateur, id, donnees) values ('${A}', 's1', '{"date":"2026-11-01"}');
    insert into exercices_perso_musculation (utilisateur, id, donnees) values ('${A}', 'e1', '{}');`);
  for (const table of ['journees', 'profil', 'programmes_musculation', 'seances_musculation', 'exercices_perso_musculation']) {
    assert.equal(compte(A, 'a@test.fr', `select count(*) from ${table};`), 1, table + ' : A voit sa ligne');
    assert.equal(compte(B, 'b@test.fr', `select count(*) from ${table};`), 0, table + ' : B ne voit rien');
    assert.equal(compte(B, 'b@test.fr', `with m as (update ${table} set donnees = '{"pirate":true}' where utilisateur = '${A}' returning 1) select count(*) from m;`), 0, table + ' : B ne modifie rien');
    assert.equal(compte(B, 'b@test.fr', `with m as (delete from ${table} where utilisateur = '${A}' returning 1) select count(*) from m;`), 0, table + ' : B n\'efface rien');
    assert.equal(compte(null, null, `select count(*) from ${table};`), 0, table + ' : anonyme ne voit rien');
    // B ne peut pas non plus écrire une ligne au nom de A.
    assert.equal(refuse(B, 'b@test.fr', `insert into ${table} (utilisateur, ${table === 'profil' ? '' : table === 'journees' ? 'jour, ' : 'id, '}donnees) values ('${A}', ${table === 'profil' ? '' : table === 'journees' ? "'2026-11-02', " : "'x', "}'{}');`), true, table + ' : B n\'écrit pas au nom de A');
  }
  assert.equal(compte(A, 'a@test.fr', `select count(*) from journees where donnees ? 'pirate';`), 0);
});

si("l'administrateur est reconnu par la table admins (est_admin), l'e-mail historique restant un repli ; un autre compte avec un e-mail quelconque ne voit rien", () => {
  // Repli par l'e-mail : le compte ADM n'existait pas encore quand le script 2 a amorcé la table.
  assert.equal(compte(ADM, ADMIN, 'select count(*) from journees;'), 1);
  assert.equal(compte(B, 'b@test.fr', 'select count(*) from journees;'), 0);
  assert.equal(compte(ADM, ADMIN, 'select (est_admin())::int;'), 1);
  assert.equal(compte(B, 'b@test.fr', 'select (est_admin())::int;'), 0);
  // Rejouer l'amorce une fois le compte créé : l'identifiant entre dans la table.
  pg.sql(`insert into public.admins (utilisateur, note) select id, 'administrateur initial' from auth.users where email = '${ADMIN}' on conflict (utilisateur) do nothing;`);
  assert.match(pg.sql(`\\pset tuples_only on\nselect utilisateur from admins;`), new RegExp(ADM));
  // Un compte inscrit dans la table est administrateur quel que soit son e-mail, et personne ne lit ni n'écrit la table depuis l'appli.
  const D = '55555555-5555-4555-8555-555555555555';
  pg.sql(`insert into auth.users (id, email) values ('${D}', 'd@test.fr'); insert into public.admins (utilisateur, note) values ('${D}', 'second administrateur');`);
  assert.equal(compte(D, 'd@test.fr', 'select count(*) from journees;'), 1, 'D lit comme administrateur');
  assert.equal(compte(D, 'd@test.fr', 'select (est_admin())::int;'), 1);
  for (const [u, e] of [[A, 'a@test.fr'], [D, 'd@test.fr'], [ADM, ADMIN], [null, null]]) {
    assert.equal(refuse(u, e, 'select count(*) from admins;'), true, (e || 'anonyme') + ' ne lit pas la table admins');
    assert.equal(refuse(u, e, `insert into admins (utilisateur) values ('${u || A}');`), true, (e || 'anonyme') + " ne s'y inscrit pas");
  }
  // Phase 2 : sans le repli par l'e-mail, seuls les identifiants de la table comptent.
  pg.sql(`create or replace function public.est_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.admins where utilisateur = auth.uid()); $$;`);
  assert.equal(compte(ADM, ADMIN, 'select count(*) from journees;'), 1, 'ADM, inscrit dans la table, garde l\'accès');
  assert.equal(compte('66666666-6666-4666-8666-666666666666', ADMIN, 'select count(*) from journees;'), 0, 'la seule adresse ne suffit plus');
  assert.equal(compte(D, 'd@test.fr', 'select count(*) from journees;'), 1);
  pg.sql(`delete from auth.users where id = '${D}';`);
  assert.match(pg.sql(`\\pset tuples_only on\nselect count(*) from admins where utilisateur = '${D}';`), /^\s*0\s*$/m);
});

si('fonctions réservées : admin_regles_ouvertes() répond à l\'administrateur (0 règle ouverte) et rien aux autres ; est_bloque() reste appelable (les règles l\'évaluent avec les droits du compte)', () => {
  assert.equal(compte(ADM, ADMIN, 'select coalesce(admin_regles_ouvertes(), -1);'), 0, 'aucune règle ouverte à tous après les scripts');
  assert.equal(compte(B, 'b@test.fr', 'select coalesce(admin_regles_ouvertes(), -1);'), -1, 'un compte ordinaire ne reçoit rien');
  assert.equal(compte(B, 'b@test.fr', `select (est_bloque('${A}'))::int;`), 0, 'est_bloque répond (sinon les règles elles-mêmes échouent)');
  assert.equal(refuse(B, 'b@test.fr', `select admin_liste_comptes();`), true, 'liste des comptes réservée');
});

si('le script 2 retire toute règle ouverte à tous restée sur les tables de données, sous n\'importe quel nom, et seulement là où la règle par compte est en place', () => {
  const ouvertes = () => compte(ADM, ADMIN, 'select coalesce(admin_regles_ouvertes(), -1);');
  const bVoitA = () => compte(B, 'b@test.fr', `select count(*) from journees where utilisateur = '${A}';`);
  const avant = compte(A, 'a@test.fr', `select count(*) from journees where utilisateur = '${A}';`);
  // Deux règles ouvertes créées à la main (noms du tableau de bord Supabase) : la table s'ouvre à tous.
  pg.sql(`create policy "Enable read access for all users" on journees for select using (true);
          create policy "Enable insert for all users" on profil for insert with check (true);`);
  assert.deepEqual([ouvertes(), bVoitA() > 0], [2, true], 'une seule règle ouverte suffit à tout ouvrir');
  // Le script 2 rejoué : retirées, chacun ne voit plus que ses lignes, et la règle par compte reste.
  pg.sql(null, { fichier: path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find(f => f.startsWith('0002'))) });
  assert.deepEqual([ouvertes(), bVoitA()], [0, 0]);
  assert.equal(compte(A, 'a@test.fr', `select count(*) from journees where utilisateur = '${A}';`), avant, 'A garde ses lignes');
  assert.match(pg.sql(`\\pset tuples_only on\nselect string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'journees';`), /^\s*journees par compte\s*$/m);
});

si('rejouer le script 1 après le script 2 ne rouvre rien (SEC-01)', () => {
  pg.sql(null, { fichier: path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find(f => f.startsWith('0001'))) });
  assert.equal(compte(B, 'b@test.fr', 'select count(*) from journees;'), 0);
  assert.equal(compte(ADM, ADMIN, 'select coalesce(admin_regles_ouvertes(), -1);'), 0);
});

si('gymbros : les séances partagées ne sont visibles que d\'un gymbro accepté ; un défi n\'est visible que de ses membres', () => {
  enTantQue(A, 'a@test.fr', `insert into pseudos (utilisateur, pseudo, partage_seances) values ('${A}', 'alice', true);`);
  enTantQue(B, 'b@test.fr', `insert into pseudos (utilisateur, pseudo, partage_seances) values ('${B}', 'bob', true);`);
  assert.equal(compte(B, 'b@test.fr', "select count(*) from gymbro_seances('alice');"), 0, 'pas gymbro : rien');
  enTantQue(B, 'b@test.fr', "select gymbro_demander('alice');");
  enTantQue(A, 'a@test.fr', "select gymbro_repondre('bob', true);");
  assert.equal(compte(B, 'b@test.fr', "select count(*) from gymbro_seances('alice');"), 1, 'gymbro accepté : la séance partagée');
  const id = enTantQue(A, 'a@test.fr', "\\pset tuples_only on\nselect defi_creer('x', 'Squat', 'charge', 7, current_date, array['bob']);").trim().split('\n').pop().trim();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(compte(B, 'b@test.fr', 'select count(*) from mes_defis();'), 1, 'invité : voit le défi');
  pg.sql(`insert into auth.users (id, email) values ('44444444-4444-4444-8444-444444444444', 'c@test.fr');`);
  assert.equal(compte('44444444-4444-4444-8444-444444444444', 'c@test.fr', 'select count(*) from mes_defis();'), 0, 'un tiers ne voit pas le défi');
  assert.equal(compte('44444444-4444-4444-8444-444444444444', 'c@test.fr', `select count(*) from gymbros_defis;`), 0, 'ni directement dans la table');
});

si('balance Withings (SEC-08) : aucun compte ne lit ni n\'écrit les jetons, un jeton laissé dans le profil part dans la table protégée (le plus récent gagne), un compte effacé emporte le sien', () => {
  // Un profil écrit par une ancienne version, jeton compris : il ressort sans jeton, le reste intact.
  enTantQue(A, 'a@test.fr', `insert into profil (utilisateur, donnees) values ('${A}', '{"age":31,"withings":{"access_token":"acc","refresh_token":"ref","expire_le":1800000000000,"userid":"42"}}')
    on conflict (utilisateur) do update set donnees = excluded.donnees;`);
  assert.equal(compte(A, 'a@test.fr', `select count(*) from profil where utilisateur = '${A}' and donnees ? 'withings';`), 0, 'plus de jeton dans le profil');
  assert.equal(compte(A, 'a@test.fr', `select count(*) from profil where utilisateur = '${A}' and donnees ->> 'age' = '31';`), 1, 'le reste du profil est intact');
  // Personne depuis l'appli (ni A, ni B, ni l'admin, ni un anonyme) ne lit ou n'écrit la table ; le serveur (clé de service), si.
  for (const [u, e] of [[A, 'a@test.fr'], [B, 'b@test.fr'], [ADM, ADMIN], [null, null]]) {
    assert.equal(refuse(u, e, 'select count(*) from withings_jetons;'), true, (e || 'anonyme') + ' ne lit pas les jetons');
    assert.equal(refuse(u, e, `insert into withings_jetons (utilisateur, access_token, refresh_token, expire_le) values ('${u || A}', 'x', 'y', now());`), true, (e || 'anonyme') + " n'écrit pas de jeton");
  }
  const serveur = pg.sql(`\\pset tuples_only on\nbegin; set local role service_role; select access_token || '/' || refresh_token || '/' || coalesce(userid, '') from withings_jetons where utilisateur = '${A}'; commit;`);
  assert.match(serveur, /acc\/ref\/42/);
  // Un jeton plus récent remplace l'ancien ; un plus ancien, non.
  enTantQue(A, 'a@test.fr', `update profil set donnees = donnees || '{"withings":{"access_token":"acc2","refresh_token":"ref2","expire_le":1900000000000}}' where utilisateur = '${A}';`);
  enTantQue(A, 'a@test.fr', `update profil set donnees = donnees || '{"withings":{"access_token":"vieux","refresh_token":"vieux","expire_le":1000}}' where utilisateur = '${A}';`);
  assert.match(pg.sql(`\\pset tuples_only on\nselect access_token from withings_jetons where utilisateur = '${A}';`), /acc2/);
  assert.equal(compte(A, 'a@test.fr', `select count(*) from profil where utilisateur = '${A}' and donnees ? 'withings';`), 0);
  // Le compte effacé emporte son jeton.
  pg.sql(`delete from auth.users where id = '${A}';`);
  assert.match(pg.sql(`\\pset tuples_only on\nselect count(*) from withings_jetons where utilisateur = '${A}';`), /^\s*0\s*$/m);
});
