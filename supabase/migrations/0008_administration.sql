-- 0008_administration — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- Administration : journal des actions, signalements, erreurs, appareils,
-- tableau de bord et message à tous.
-- À exécuter une fois dans l'éditeur SQL de Supabase, après les autres SQL.
-- Idempotent : relancer ne casse rien, aucune donnée existante n'est modifiée.

-- 0) Qui est l'administrateur : est_admin() (script « Sécurité des données »).
--    je_suis_admin() est gardée comme simple alias, pour les objets créés
--    par d'anciennes versions de ce script.
create or replace function public.je_suis_admin()
returns boolean language sql stable as $fn$
  select public.est_admin();
$fn$;
grant execute on function public.je_suis_admin() to anon, authenticated;

-- 1) Journal des actions de l'administrateur (suspendre, archiver, valider…).
--    Les anciennes versions de ces fonctions, créées à la main, sont
--    remplacées (quelle que soit leur forme).
create table if not exists public.journal_admin (
  id            bigserial primary key,
  fait_le       timestamptz not null default now(),
  fait_par      text,
  action        text not null,
  cible_id      text,
  cible_libelle text,
  motif         text,
  detail        jsonb
);
alter table public.journal_admin add column if not exists fait_le timestamptz not null default now();
alter table public.journal_admin add column if not exists fait_par text;
alter table public.journal_admin add column if not exists cible_id text;
alter table public.journal_admin add column if not exists cible_libelle text;
alter table public.journal_admin add column if not exists motif text;
alter table public.journal_admin add column if not exists detail jsonb;
create index if not exists journal_admin_date on public.journal_admin (fait_le desc);
alter table public.journal_admin enable row level security;
drop policy if exists "journal admin lecture" on public.journal_admin;
create policy "journal admin lecture" on public.journal_admin for select to authenticated using (public.est_admin());
grant select on public.journal_admin to authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('admin_apercu', 'admin_consigner', 'admin_journal_lire') loop
    execute 'drop function ' || f.sig;
  end loop;
end $$;

create function public.admin_consigner(p_action text, p_cible_id text default null, p_cible_libelle text default null,
                                       p_motif text default null, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  insert into journal_admin (fait_par, action, cible_id, cible_libelle, motif, detail)
  values (auth.jwt() ->> 'email', left(coalesce(p_action, '?'), 80), left(p_cible_id, 200), left(p_cible_libelle, 300), left(p_motif, 1000), p_detail);
end;
$fn$;

create function public.admin_journal_lire(p_cible text default null, p_limite integer default 100)
returns setof public.journal_admin language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  return query select * from journal_admin j where p_cible is null or j.cible_id = p_cible
    order by j.fait_le desc limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$fn$;

-- Chiffres du haut de l'Administration (inactif : rien envoyé depuis 30 jours).
create function public.admin_apercu()
returns table (total bigint, actifs bigint, suspendus bigint, inactifs30 bigint, supprimes bigint)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  return query
    select count(*),
           count(*) filter (where b.type is null),
           count(*) filter (where b.type = 'suspendu'),
           count(*) filter (where b.type is null and coalesce(p.maj, 0) < (extract(epoch from now() - interval '30 days') * 1000)::bigint),
           count(*) filter (where b.type = 'supprime')
    from profil p left join comptes_bloques b on b.utilisateur = p.utilisateur
    where p.utilisateur <> 'moi';
end;
$fn$;
revoke execute on function public.admin_consigner(text, text, text, text, jsonb) from public, anon;
revoke execute on function public.admin_journal_lire(text, integer) from public, anon;
revoke execute on function public.admin_apercu() from public, anon;
grant execute on function public.admin_consigner(text, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_journal_lire(text, integer) to authenticated;
grant execute on function public.admin_apercu() to authenticated;

-- 2) Erreurs de l'appli : chaque appareil envoie ses plantages (message,
--    écran, appareil, version) — jamais de repas ni de séance. 30 par heure
--    et par compte au plus, effacées après 30 jours. Lues par l'admin seul.
create table if not exists public.erreurs_appli (
  id          bigserial primary key,
  utilisateur text not null,
  cree_le     timestamptz not null default now(),
  type        text not null,
  message     text not null,
  detail      text,
  ecran       text,
  appareil    text,
  version     text,
  regle_le    timestamptz
);
create index if not exists erreurs_appli_date on public.erreurs_appli (cree_le desc);
create index if not exists erreurs_appli_compte on public.erreurs_appli (utilisateur, cree_le desc);
alter table public.erreurs_appli enable row level security;
drop policy if exists "erreurs admin" on public.erreurs_appli;
create policy "erreurs admin" on public.erreurs_appli for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
grant select, update, delete on public.erreurs_appli to authenticated;

create or replace function public.noter_erreur(p_type text, p_message text, p_detail text default null,
                                                  p_ecran text default null, p_appareil text default null, p_version text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare moi text := auth.uid()::text;
begin
  if moi is null then return; end if;
  if (select count(*) from erreurs_appli where utilisateur = moi and cree_le > now() - interval '1 hour') >= 30 then return; end if;
  insert into erreurs_appli (utilisateur, type, message, detail, ecran, appareil, version)
  values (moi, left(coalesce(nullif(trim(p_type), ''), 'js'), 20), left(coalesce(nullif(trim(p_message), ''), '?'), 300),
          left(p_detail, 2000), left(p_ecran, 40), left(p_appareil, 60), left(p_version, 40));
  if random() < 0.05 then delete from erreurs_appli where cree_le < now() - interval '30 days'; end if;
end;
$fn$;
revoke execute on function public.noter_erreur(text, text, text, text, text, text) from public, anon;
grant execute on function public.noter_erreur(text, text, text, text, text, text) to authenticated;

-- 3) Appareils de chaque compte : version de l'appli, dernière synchro,
--    modifications pas encore envoyées (10 appareils au plus par compte).
create table if not exists public.appareils (
  utilisateur text not null,
  appareil    text not null,
  plateforme  text,
  version     text,
  synchro_le  timestamptz,
  en_attente  integer not null default 0,
  vu_le       timestamptz not null default now(),
  primary key (utilisateur, appareil)
);
alter table public.appareils enable row level security;
drop policy if exists "appareils admin" on public.appareils;
create policy "appareils admin" on public.appareils for select to authenticated using (public.est_admin());
grant select on public.appareils to authenticated;

create or replace function public.noter_appareil(p_appareil text, p_plateforme text, p_version text,
                                                    p_synchro_le timestamptz default null, p_en_attente integer default 0)
returns void language plpgsql security definer set search_path = public as $fn$
declare moi text := auth.uid()::text;
begin
  if moi is null or coalesce(trim(p_appareil), '') = '' then return; end if;
  insert into appareils as a (utilisateur, appareil, plateforme, version, synchro_le, en_attente, vu_le)
  values (moi, left(p_appareil, 40), left(p_plateforme, 60), left(p_version, 40), least(p_synchro_le, now()),
          greatest(0, least(coalesce(p_en_attente, 0), 100000)), now())
  on conflict (utilisateur, appareil) do update set plateforme = excluded.plateforme, version = excluded.version,
    synchro_le = coalesce(excluded.synchro_le, a.synchro_le), en_attente = excluded.en_attente, vu_le = now();
  delete from appareils where utilisateur = moi and appareil not in
    (select appareil from appareils where utilisateur = moi order by vu_le desc limit 10);
end;
$fn$;
revoke execute on function public.noter_appareil(text, text, text, timestamptz, integer) from public, anon;
grant execute on function public.noter_appareil(text, text, text, timestamptz, integer) to authenticated;

-- 4) Message à tous : un bandeau en haut de l'appli, écrit par l'admin.
create table if not exists public.annonces (
  id      bigserial primary key,
  texte   text not null check (char_length(texte) between 1 and 300),
  ton     text not null default 'info' check (ton in ('info', 'important')),
  bouton  text check (bouton in ('maj', 'lien')),
  lien    text check (lien is null or (char_length(lien) <= 300 and lien ~ '^https://')),
  pour    text not null default 'tous' check (pour in ('tous', 'pro')),
  jusqua  timestamptz,
  cree_le timestamptz not null default now(),
  retiree boolean not null default false
);
alter table public.annonces enable row level security;
drop policy if exists "annonces lecture" on public.annonces;
create policy "annonces lecture" on public.annonces for select to anon, authenticated
  using ((not retiree and (jusqua is null or jusqua > now())) or public.est_admin());
drop policy if exists "annonces admin" on public.annonces;
create policy "annonces admin" on public.annonces for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
grant select on public.annonces to anon, authenticated;
grant insert, update, delete on public.annonces to authenticated;
grant usage on sequence public.annonces_id_seq to authenticated;

-- 5) Signalements Gymbro vus par l'admin : qui, par qui, motif, et ce que
--    voient ses gymbros (nom, bio, photo).
create or replace function public.admin_signalements(p_traites boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare r jsonb;
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  if to_regclass('public.gymbros_signalements') is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by (x ->> 'cree_le') desc), '[]'::jsonb) into r from (
    select jsonb_build_object('id', s.id, 'cree_le', s.cree_le, 'motif', s.motif, 'traite', s.traite,
             'auteur', s.auteur, 'auteur_pseudo', pa.pseudo, 'cible', s.cible, 'cible_pseudo', pc.pseudo,
             'cible_bio', pr.bio, 'cible_avatar', pr.avatar, 'cible_statut', b.type,
             'cible_nb', (select count(*) from gymbros_signalements t where t.cible = s.cible)) as x
    from gymbros_signalements s
    left join pseudos pa on pa.utilisateur = s.auteur
    left join pseudos pc on pc.utilisateur = s.cible
    left join profils pr on pr.utilisateur = s.cible
    left join comptes_bloques b on b.utilisateur = s.cible
    where s.traite = coalesce(p_traites, false)
    order by s.cree_le desc limit 100) q;
  return r;
end;
$fn$;
revoke execute on function public.admin_signalements(boolean) from public, anon;
grant execute on function public.admin_signalements(boolean) to authenticated;

-- 6) Fiche d'un compte : appareils, erreurs, IA, gymbros, signalements.
create or replace function public.admin_compte_details(p_utilisateur text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare r jsonb;
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  r := jsonb_build_object(
    'appareils', (select coalesce(jsonb_agg(to_jsonb(a) - 'utilisateur' order by a.vu_le desc), '[]'::jsonb) from appareils a where a.utilisateur = p_utilisateur),
    'erreurs_7j', (select count(*) from erreurs_appli e where e.utilisateur = p_utilisateur and e.cree_le > now() - interval '7 days'),
    'erreur', (select e.message from erreurs_appli e where e.utilisateur = p_utilisateur and e.cree_le > now() - interval '7 days' order by e.cree_le desc limit 1));
  if to_regclass('public.usages_ia') is not null then
    r := r || jsonb_build_object('ia_mois', coalesce((select u.nombre from usages_ia u where u.utilisateur = p_utilisateur and u.mois = date_trunc('month', now())::date), 0));
  end if;
  if to_regclass('public.gymbros_liens') is not null then
    r := r || jsonb_build_object('gymbros', (select count(*) from gymbros_liens l where l.statut = 'acceptee' and (l.demandeur = p_utilisateur or l.cible = p_utilisateur)));
  end if;
  if to_regclass('public.gymbros_signalements') is not null then
    r := r || jsonb_build_object('signale', (select count(*) from gymbros_signalements s where s.cible = p_utilisateur));
  end if;
  if to_regclass('public.seances_direct') is not null then
    r := r || jsonb_build_object('en_seance', exists (select 1 from seances_direct d where d.utilisateur = p_utilisateur
      and d.maj > now() - interval '45 minutes' and d.donnees ->> 'fini' is null));
  end if;
  return r;
end;
$fn$;
revoke execute on function public.admin_compte_details(text) from public, anon;
grant execute on function public.admin_compte_details(text) to authenticated;

-- 7) Tableau de bord. Un compte est « actif » un jour s'il a envoyé quelque
--    chose ce jour-là (journée, séance, programme, profil) ou ouvert l'appli.
create or replace function public.admin_tableau_de_bord()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  auj date := (now() at time zone 'Europe/Paris')::date;
  r jsonb;
  gymbro text[] := '{}';
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  with comptes as (select id::text as utilisateur from auth.users),
  act as (
    select utilisateur, (to_timestamp(maj / 1000.0) at time zone 'Europe/Paris')::date as jour from journees where maj > 0
    union select utilisateur, (to_timestamp(maj / 1000.0) at time zone 'Europe/Paris')::date from seances_musculation where maj > 0
    union select utilisateur, (to_timestamp(maj / 1000.0) at time zone 'Europe/Paris')::date from programmes_musculation where maj > 0
    union select utilisateur, (to_timestamp(maj / 1000.0) at time zone 'Europe/Paris')::date from profil where maj > 0
    union select utilisateur, (vu_le at time zone 'Europe/Paris')::date from appareils
  ),
  act30 as (select distinct a.utilisateur, a.jour from act a join comptes c using (utilisateur) where a.jour > auj - 30 and a.jour <= auj),
  repas as (
    select j.utilisateur, j.jour, (select coalesce(sum(jsonb_array_length(m.value)), 0) from jsonb_each(j.donnees -> 'meals') m
                                   where jsonb_typeof(m.value) = 'array') as n
    from journees j where jsonb_typeof(j.donnees -> 'meals') = 'object' and j.jour > auj - 14 and j.jour <= auj
  ),
  seances as (
    select s.utilisateur, (s.donnees ->> 'date') as jour from seances_musculation s
    where coalesce(s.donnees ->> 'date', '') > (auj - 14)::text and coalesce(s.donnees ->> 'date', '') <= auj::text
  )
  select jsonb_build_object(
    'comptes', (select count(*) from comptes),
    'actifs_jour', (select count(*) from act30 where jour = auj),
    'actifs_7j', (select count(distinct utilisateur) from act30 where jour > auj - 7),
    'par_jour', (select jsonb_agg(jsonb_build_object('jour', d::date, 'n', (select count(*) from act30 a where a.jour = d::date)) order by d)
                 from generate_series(auj - 29, auj, interval '1 day') d),
    'seances_7j', (select count(*) from seances where jour > (auj - 7)::text),
    'seances_7j_avant', (select count(*) from seances where jour <= (auj - 7)::text),
    'repas_7j', (select coalesce(sum(n), 0) from repas where jour > auj - 7),
    'repas_7j_avant', (select coalesce(sum(n), 0) from repas where jour <= auj - 7),
    'nouveaux_7j', (select coalesce(jsonb_agg(coalesce(p.pseudo, split_part(u.email, '@', 1)) order by u.created_at desc), '[]'::jsonb)
                    from auth.users u left join pseudos p on p.utilisateur = u.id::text where u.created_at > now() - interval '7 days'),
    'usage_7j', jsonb_build_object(
      'repas', (select count(distinct utilisateur) from repas where jour > auj - 7 and n > 0),
      'musculation', (select count(distinct utilisateur) from seances where jour > (auj - 7)::text),
      'cardio', (select count(distinct j.utilisateur) from journees j where j.jour > auj - 7 and j.jour <= auj
                 and jsonb_typeof(j.donnees -> 'workouts') = 'array' and jsonb_array_length(j.donnees -> 'workouts') > 0))
  ) into r;
  if to_regclass('public.seances_direct') is not null then
    r := r || jsonb_build_object('en_seance', (select coalesce(jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'nom', d.donnees ->> 'nom',
        'debut', d.donnees -> 'debut') order by d.maj desc), '[]'::jsonb)
      from seances_direct d left join pseudos p on p.utilisateur = d.utilisateur
      where d.maj > now() - interval '45 minutes' and d.donnees ->> 'fini' is null));
    select array_agg(distinct utilisateur) into gymbro from seances_direct where maj > now() - interval '7 days';
  end if;
  if to_regclass('public.seances_duo') is not null then
    r := r || jsonb_build_object('duos_7j', (select count(*) from seances_duo where statut in ('acceptee', 'terminee') and cree_le > now() - interval '7 days'),
      'duos_comptes_7j', (select count(distinct u) from seances_duo, lateral (values (hote), (invite)) v(u)
                          where statut in ('acceptee', 'terminee') and cree_le > now() - interval '7 days'));
  end if;
  if to_regclass('public.gymbros_respects') is not null then
    gymbro := coalesce(gymbro, '{}') || coalesce((select array_agg(distinct auteur) from gymbros_respects where cree_le > now() - interval '7 days'), '{}');
  end if;
  if to_regclass('public.gymbros_liens') is not null then
    gymbro := coalesce(gymbro, '{}') || coalesce((select array_agg(distinct demandeur) from gymbros_liens where cree_le > now() - interval '7 days'), '{}');
  end if;
  r := jsonb_set(r, '{usage_7j,gymbro}', to_jsonb((select count(distinct g) from unnest(coalesce(gymbro, '{}')) g)));
  if to_regclass('public.abonnements') is not null then
    r := r || jsonb_build_object('pro', (select jsonb_build_object(
      'total', count(*),
      'fondateur', count(*) filter (where formule = 'fondateur'),
      'offert', count(*) filter (where formule = 'offert'),
      'payant', count(*) filter (where formule in ('mois', 'an')))
      from abonnements where statut in ('actif', 'essai')));
  end if;
  if to_regclass('public.usages_ia') is not null then
    r := r || jsonb_build_object('ia_mois', (select coalesce(sum(nombre), 0) from usages_ia where mois = date_trunc('month', now())::date));
  end if;
  return r;
end;
$fn$;
revoke execute on function public.admin_tableau_de_bord() from public, anon;
grant execute on function public.admin_tableau_de_bord() to authenticated;

-- 8) Un compte effacé (par lui-même ou par l'admin) part avec ses erreurs
--    et ses appareils.
create or replace function public.nettoyer_compte_admin()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  delete from erreurs_appli where utilisateur = old.id::text;
  delete from appareils where utilisateur = old.id::text;
  return old;
end;
$fn$;
drop trigger if exists nettoyer_compte_admin on auth.users;
create trigger nettoyer_compte_admin after delete on auth.users
  for each row execute function public.nettoyer_compte_admin();
