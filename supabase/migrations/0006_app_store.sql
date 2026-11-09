-- 0006_app_store — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- App iOS et App Store : suppression du compte par la personne elle-même,
-- signaler et bloquer dans Gymbro, abonnements payés via Apple.
-- À exécuter une fois dans l'éditeur SQL de Supabase, après les autres SQL.
-- Idempotent : relancer ne casse rien. Aucune donnée existante n'est modifiée.

-- 1) Supprimer mon compte : toutes les données de la personne, puis le compte.
--    Les tables pas encore créées sont ignorées. Les photos de progression
--    sont effacées avant, par l'appli (le stockage ne se vide pas en SQL).
create or replace function public.supprimer_mon_compte()
returns void language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  r record;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  -- Un abonnement Stripe en cours se résilie d'abord (sinon il continuerait d'être prélevé).
  if to_regclass('public.abonnements') is not null and exists (
    select 1 from abonnements where utilisateur = moi and abonnement_stripe is not null
      and formule in ('mois', 'an') and statut in ('actif', 'essai')
  ) then raise exception 'abonnement_actif'; end if;
  for r in select * from (values
      ('journees', 'utilisateur'), ('profil', 'utilisateur'), ('programmes_musculation', 'utilisateur'),
      ('seances_musculation', 'utilisateur'), ('exercices_perso_musculation', 'utilisateur'),
      ('recettes_perso', 'utilisateur'), ('recettes_supprimees', 'utilisateur'),
      ('pseudos', 'utilisateur'), ('profils', 'utilisateur'),
      ('gymbros_liens', 'demandeur'), ('gymbros_liens', 'cible'),
      ('gymbros_respects', 'seance_utilisateur'), ('gymbros_respects', 'auteur'),
      ('gymbros_bloques', 'auteur'), ('gymbros_bloques', 'cible'),
      ('gymbros_signalements', 'auteur'), ('gymbros_signalements', 'cible'),
      ('seances_direct', 'utilisateur'), ('seances_duo', 'hote'), ('seances_duo', 'invite'),
      ('gymbros_encouragements', 'auteur'), ('gymbros_encouragements', 'cible'),
      ('abonnements', 'utilisateur'), ('usages_ia', 'utilisateur'),
      ('comptes_bloques', 'utilisateur'), ('journal_utilisateurs', 'utilisateur'),
      ('erreurs_appli', 'utilisateur'), ('appareils', 'utilisateur')
    ) as t(nom, colonne)
  loop
    if to_regclass('public.' || r.nom) is not null then
      execute format('delete from public.%I where %I = $1', r.nom, r.colonne) using moi;
    end if;
  end loop;
  -- Aliments proposés à la base commune : ceux pas encore validés partent,
  -- les validés restent pour tous, sans plus de lien avec le compte.
  if to_regclass('public.aliments_partages') is not null then
    begin
      delete from aliments_partages where createur_id::text = moi and not coalesce(valide, false);
    exception when others then null;
    end;
    begin
      update aliments_partages set createur_id = null where createur_id::text = moi;
    exception when others then null;
    end;
  end if;
  delete from auth.users where id::text = moi;
end;
$fn$;
revoke execute on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;

-- 2) Gymbro : bloquer et signaler.
create table if not exists public.gymbros_bloques (
  auteur  text not null,
  cible   text not null,
  cree_le timestamptz not null default now(),
  primary key (auteur, cible)
);
alter table public.gymbros_bloques enable row level security;
-- Pas de policy : on n'y passe que par les fonctions ci-dessous.

create table if not exists public.gymbros_signalements (
  id      bigserial primary key,
  auteur  text not null,
  cible   text not null,
  motif   text check (motif is null or char_length(motif) <= 500),
  cree_le timestamptz not null default now(),
  traite  boolean not null default false
);
alter table public.gymbros_signalements enable row level security;
drop policy if exists "signalements admin" on public.gymbros_signalements;
create policy "signalements admin" on public.gymbros_signalements for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

create or replace function public.gymbro_bloquer(p_pseudo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  lui text;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  select utilisateur into lui from pseudos where lower(pseudo) = lower(p_pseudo);
  if lui is null then raise exception 'pseudo_inconnu'; end if;
  if lui = moi then raise exception 'soi_meme'; end if;
  insert into gymbros_bloques (auteur, cible) values (moi, lui) on conflict do nothing;
  delete from gymbros_liens where (demandeur = moi and cible = lui) or (demandeur = lui and cible = moi);
end;
$fn$;
grant execute on function public.gymbro_bloquer(text) to authenticated;

create or replace function public.gymbro_signaler(p_pseudo text, p_motif text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  lui text;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  select utilisateur into lui from pseudos where lower(pseudo) = lower(p_pseudo);
  if lui is null then raise exception 'pseudo_inconnu'; end if;
  if lui = moi then raise exception 'soi_meme'; end if;
  if (select count(*) from gymbros_signalements where auteur = moi and cree_le > now() - interval '1 day') >= 20 then
    raise exception 'trop_de_signalements';
  end if;
  insert into gymbros_signalements (auteur, cible, motif) values (moi, lui, nullif(left(trim(coalesce(p_motif, '')), 500), ''));
end;
$fn$;
grant execute on function public.gymbro_signaler(text, text) to authenticated;

-- Une demande entre deux personnes dont l'une a bloqué l'autre est refusée.
create or replace function public.gymbros_liens_sans_blocage()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if exists (select 1 from gymbros_bloques b
             where (b.auteur = new.demandeur and b.cible = new.cible) or (b.auteur = new.cible and b.cible = new.demandeur)) then
    raise exception 'bloque';
  end if;
  return new;
end;
$fn$;
do $$
begin
  if to_regclass('public.gymbros_liens') is not null then
    drop trigger if exists gymbros_liens_sans_blocage on public.gymbros_liens;
    create trigger gymbros_liens_sans_blocage before insert on public.gymbros_liens
      for each row execute function public.gymbros_liens_sans_blocage();
  end if;
end $$;

-- 3) Abonnements payés via Apple (fonction « achats-apple ») : d'où vient
--    l'abonnement, et la transaction Apple d'origine (une par compte).
do $$
begin
  if to_regclass('public.abonnements') is not null then
    alter table public.abonnements add column if not exists source text;
    alter table public.abonnements add column if not exists transaction_apple text;
    create unique index if not exists abonnements_transaction_apple
      on public.abonnements (transaction_apple) where transaction_apple is not null;
  end if;
end $$;
