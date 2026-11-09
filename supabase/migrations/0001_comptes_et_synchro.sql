-- 0001_comptes_et_synchro — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- À exécuter une seule fois dans l'éditeur SQL de Supabase.
-- Tout est idempotent : relancer le script ne casse rien.

create extension if not exists pg_trgm;

-- Une ligne par journée. La colonne maj arbitre les conflits.
create table if not exists journees (
  utilisateur text not null default 'moi',
  jour        date not null,
  donnees     jsonb not null,
  maj         bigint not null default 0,
  primary key (utilisateur, jour)
);
alter table journees enable row level security;
-- Aucune règle d'accès ici : la table reste fermée tant que le script 2
-- (Sécurité des données) n'a pas créé les règles par compte. Le drop retire
-- l'ancienne règle ouverte à tous si elle existait encore.
drop policy if exists "acces journees" on journees;

create table if not exists profil (
  utilisateur text primary key default 'moi',
  donnees     jsonb not null,
  maj         bigint not null default 0
);
alter table profil enable row level security;
drop policy if exists "acces profil" on profil;

-- Musculation : une ligne par programme / par séance enregistrée / par
-- exercice personnalisé, comme "journees" — jamais un seul blob par
-- compte, pour que deux appareils puissent chacun ajouter une séance
-- différente sans que l'un écrase la séance de l'autre à la synchro.
create table if not exists programmes_musculation (
  utilisateur text not null default 'moi',
  id          text not null,
  donnees     jsonb not null,
  maj         bigint not null default 0,
  primary key (utilisateur, id)
);
alter table programmes_musculation enable row level security;
drop policy if exists "acces programmes_musculation" on programmes_musculation;

create table if not exists seances_musculation (
  utilisateur text not null default 'moi',
  id          text not null,
  donnees     jsonb not null,
  maj         bigint not null default 0,
  primary key (utilisateur, id)
);
alter table seances_musculation enable row level security;
drop policy if exists "acces seances_musculation" on seances_musculation;

create table if not exists exercices_perso_musculation (
  utilisateur text not null default 'moi',
  id          text not null,
  donnees     jsonb not null,
  maj         bigint not null default 0,
  primary key (utilisateur, id)
);
alter table exercices_perso_musculation enable row level security;
drop policy if exists "acces exercices_perso_musculation" on exercices_perso_musculation;

-- La table des aliments n'est pas créée ici : l'application lit celle que
-- tu as déjà. Prépare-la avec le SQL « Préparer la table des aliments ».
