-- 0003_table_des_aliments — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- Prépare la table des aliments. Idempotent, aucune donnée touchée.
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- Table commune à tous : tout le monde la LIT, seul l'administrateur
-- l'ÉCRIT (les aliments créés par les utilisateurs passent par
-- aliments_partages et sa validation). Ce script remettait auparavant une
-- policy ouverte en écriture (« using (true) ») : relancé après le script
-- de sécurité, il redonnait à n'importe qui le droit de modifier ou vider
-- la base d'aliments avec la seule clé publique.
alter table aliments_base enable row level security;
drop policy if exists "acces aliments_base" on aliments_base;
drop policy if exists "base lecture" on aliments_base;
drop policy if exists "base admin" on aliments_base;
create policy "base lecture" on aliments_base for select to anon, authenticated using (true);
create policy "base admin" on aliments_base for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- Colonnes ajoutées par l'application pour tes propres aliments.
alter table aliments_base add column if not exists code_barre text;
alter table aliments_base add column if not exists source text default 'ciqual';

-- unaccent() n'est pas marquée immuable : Postgres refuse de l'utiliser dans
-- une colonne calculée. On l'enrobe dans une fonction qui l'est.
create or replace function f_norm(text) returns text
  language sql immutable strict parallel safe as $$
  select lower(public.unaccent('public.unaccent',
           replace(replace($1, 'œ', 'oe'), 'Œ', 'OE')))
$$;

-- Colonne calculée : Postgres la maintient, l'application ne l'écrit jamais.
-- La colonne du nom est trouvée ici même (ma_colonne_nom si l'appli l'a reconnue,
-- sinon la première colonne candidate), pour que le script soit rejouable
-- tel quel sur n'importe quelle base.
do $$
declare col text;
begin
  select column_name into col from information_schema.columns
  where table_schema = 'public' and table_name = 'aliments_base'
    and replace(lower(column_name), '_', ' ') = any (array['ma colonne nom', 'alim nom fr', 'nom fr', 'libelle', 'aliment', 'produit', 'nom', 'name', 'titre'])
  order by array_position(array['ma colonne nom', 'alim nom fr', 'nom fr', 'libelle', 'aliment', 'produit', 'nom', 'name', 'titre'], replace(lower(column_name), '_', ' '))
  limit 1;
  if col is null then raise exception 'table aliments_base : aucune colonne de nom reconnue'; end if;
  execute format('alter table public.%I add column if not exists recherche text generated always as (f_norm(%I)) stored', 'aliments_base', col);
end $$;

-- Sans cet index, chaque frappe balaierait toute la table.
create index if not exists aliments_base_recherche_trgm
  on aliments_base using gin (recherche gin_trgm_ops);
create index if not exists aliments_base_code_barre_idx
  on aliments_base (code_barre);
