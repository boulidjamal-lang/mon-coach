-- 0007_seances_en_direct — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- Gymbro en direct et séances à deux.
-- À exécuter une fois dans l'éditeur SQL de Supabase, APRÈS le SQL
-- « Nom d'utilisateur, Gymbro, photos » (il s'appuie sur ses tables).
-- Idempotent : relancer ne casse rien. Aucune donnée existante n'est modifiée.
--
-- Rien n'est lisible ni modifiable directement dans ces trois tables : tout
-- passe par les fonctions ci-dessous, qui vérifient qui fait quoi (gymbros
-- acceptés seulement, partage des séances respecté, comptes bloqués exclus).

-- 1) La séance en cours de chacun : une ligne par personne, remplacée à
--    chaque série cochée. Un résumé léger (exercices, séries faites, repos),
--    jamais les notes. Effacée si la séance est abandonnée ; une séance
--    terminée n'est plus montrée qu'au partenaire de duo.
create table if not exists public.seances_direct (
  utilisateur text primary key,
  donnees     jsonb not null,
  duo         uuid,
  maj         timestamptz not null default now()
);
alter table public.seances_direct enable row level security;

-- 2) S'entraîner ensemble : une invitation par ligne (hôte -> invité), avec
--    les exercices de la séance de l'hôte, sans ses charges.
create table if not exists public.seances_duo (
  id         uuid primary key default gen_random_uuid(),
  hote       text not null,
  invite     text not null,
  programme  jsonb not null,
  statut     text not null default 'attente'
             check (statut in ('attente', 'acceptee', 'refusee', 'annulee', 'terminee')),
  cree_le    timestamptz not null default now(),
  repondu_le timestamptz
);
create index if not exists seances_duo_hote on public.seances_duo (hote, cree_le desc);
create index if not exists seances_duo_invite on public.seances_duo (invite, cree_le desc);
alter table public.seances_duo enable row level security;

-- 3) Les 💪 envoyés à un gymbro pendant sa séance.
create table if not exists public.gymbros_encouragements (
  auteur  text not null,
  cible   text not null,
  cree_le timestamptz not null default now()
);
create index if not exists gymbros_encouragements_cible on public.gymbros_encouragements (cible, cree_le desc);
alter table public.gymbros_encouragements enable row level security;

-- 4) Publier ma séance en cours (l'appli l'appelle à chaque série cochée
--    et toutes les minutes pendant la séance). Renvoie les 💪 reçus ces
--    10 dernières minutes.
create or replace function public.direct_publier(p_donnees jsonb, p_duo uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  v_duo uuid := p_duo;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  if p_donnees is null or jsonb_typeof(p_donnees) <> 'object' or length(p_donnees::text) > 20000 then
    raise exception 'donnees_invalides';
  end if;
  if v_duo is not null and not exists (select 1 from seances_duo d where d.id = v_duo and moi in (d.hote, d.invite)) then
    v_duo := null;
  end if;
  insert into seances_direct (utilisateur, donnees, duo, maj) values (moi, p_donnees, v_duo, now())
    on conflict (utilisateur) do update set donnees = excluded.donnees, duo = excluded.duo, maj = now();
  if random() < 0.05 then
    delete from seances_direct where maj < now() - interval '1 day';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'cree_le', e.cree_le) order by e.cree_le)
    from gymbros_encouragements e join pseudos p on p.utilisateur = e.auteur
    where e.cible = moi and e.cree_le > now() - interval '10 minutes'), '[]'::jsonb);
end;
$fn$;

-- Séance abandonnée : plus rien n'en reste.
create or replace function public.direct_terminer()
returns void language sql security definer set search_path = public as $$
  delete from seances_direct where utilisateur = auth.uid()::text;
$$;

-- 5) Ce que je vois : les séances en cours de mes gymbros acceptés (s'ils
--    partagent leurs séances), celle de mon partenaire de duo dans tous les
--    cas, et nos invitations à nous entraîner ensemble (reçues et envoyées).
--    Bloquer quelqu'un retire le lien gymbro : il disparaît d'ici aussi.
create or replace function public.gymbro_direct()
returns jsonb language sql stable security definer set search_path = public as $$
  with moi as (select auth.uid()::text as id),
  amis as (
    select case when l.demandeur = moi.id then l.cible else l.demandeur end as utilisateur
    from gymbros_liens l, moi
    where l.statut = 'acceptee' and moi.id in (l.demandeur, l.cible)
      and not exists (select 1 from comptes_bloques b where b.utilisateur = case when l.demandeur = moi.id then l.cible else l.demandeur end)
  ),
  duos as (
    select d.id, d.statut, d.hote = moi.id as hote, d.programme, d.cree_le,
           case when d.hote = moi.id then d.invite else d.hote end as autre
    from seances_duo d, moi
    where moi.id in (d.hote, d.invite) and d.cree_le > now() - interval '6 hours' and d.statut <> 'annulee'
  )
  select jsonb_build_object(
    'direct', coalesce((
      select jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'donnees', s.donnees, 'maj', s.maj) order by s.maj desc)
      from seances_direct s
      join amis a on a.utilisateur = s.utilisateur
      join pseudos p on p.utilisateur = s.utilisateur
      where s.maj > now() - interval '45 minutes'
        and ((p.partage_seances and s.donnees->>'fini' is null)
          or exists (select 1 from duos d where d.autre = s.utilisateur and d.statut = 'acceptee'))
    ), '[]'::jsonb),
    'duos', coalesce((
      select jsonb_agg(x.ligne order by x.cree_le desc) from (
        select jsonb_build_object('id', d.id, 'pseudo', p.pseudo, 'statut', d.statut, 'hote', d.hote,
                 'programme', case when not d.hote and d.statut = 'attente' then d.programme end,
                 'cree_le', d.cree_le) as ligne, d.cree_le
        from duos d
        join amis a on a.utilisateur = d.autre
        join pseudos p on p.utilisateur = d.autre
        order by d.cree_le desc limit 10) x
    ), '[]'::jsonb))
  from moi where moi.id is not null;
$$;

-- 6) S'entraîner ensemble : inviter (une invitation en attente à la fois),
--    répondre, quitter.
create or replace function public.duo_inviter(p_pseudo text, p_programme jsonb)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  lui text;
  nouveau uuid;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  if exists (select 1 from comptes_bloques b where b.utilisateur = moi) then raise exception 'compte_bloque'; end if;
  select utilisateur into lui from pseudos where lower(pseudo) = lower(p_pseudo);
  if lui is null or lui = moi or exists (select 1 from comptes_bloques b where b.utilisateur = lui) then
    raise exception 'pseudo_inconnu';
  end if;
  if not exists (select 1 from gymbros_liens l where l.statut = 'acceptee'
                 and ((l.demandeur = moi and l.cible = lui) or (l.cible = moi and l.demandeur = lui))) then
    raise exception 'pas_gymbro';
  end if;
  if p_programme is null or jsonb_typeof(p_programme) <> 'object' or length(p_programme::text) > 12000 then
    raise exception 'programme_invalide';
  end if;
  if (select count(*) from seances_duo where hote = moi and cree_le > now() - interval '1 day') >= 30 then
    raise exception 'trop_d_invitations';
  end if;
  delete from seances_duo where cree_le < now() - interval '7 days';
  update seances_duo set statut = 'annulee' where hote = moi and statut = 'attente';
  insert into seances_duo (hote, invite, programme) values (moi, lui, p_programme) returning id into nouveau;
  return nouveau;
end;
$fn$;

-- Accepter renvoie les exercices de l'hôte (pour démarrer la même séance).
create or replace function public.duo_repondre(p_id uuid, p_accepter boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  d record;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  select * into d from seances_duo where id = p_id and invite = moi for update;
  if not found then raise exception 'invitation_inconnue'; end if;
  if d.statut <> 'attente' or d.cree_le < now() - interval '3 hours' then raise exception 'invitation_expiree'; end if;
  if p_accepter and not exists (select 1 from gymbros_liens l where l.statut = 'acceptee'
                 and ((l.demandeur = moi and l.cible = d.hote) or (l.cible = moi and l.demandeur = d.hote))) then
    raise exception 'pas_gymbro';
  end if;
  update seances_duo set statut = case when p_accepter then 'acceptee' else 'refusee' end, repondu_le = now()
    where id = p_id;
  if not p_accepter then return null; end if;
  -- Un seul duo à la fois : mes autres duos en cours se terminent.
  update seances_duo set statut = 'terminee' where id <> p_id and statut = 'acceptee' and moi in (hote, invite);
  return d.programme;
end;
$fn$;

create or replace function public.duo_quitter(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update seances_duo set statut = case when statut = 'attente' then 'annulee' else 'terminee' end
  where id = p_id and auth.uid()::text in (hote, invite) and statut in ('attente', 'acceptee');
$$;

-- 7) Encourager un gymbro pendant sa séance (un 💪 par minute au plus).
create or replace function public.gymbro_encourager(p_pseudo text)
returns boolean language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  lui text;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  if exists (select 1 from comptes_bloques b where b.utilisateur = moi) then raise exception 'compte_bloque'; end if;
  select utilisateur into lui from pseudos where lower(pseudo) = lower(p_pseudo);
  if lui is null or lui = moi then raise exception 'pseudo_inconnu'; end if;
  if not exists (select 1 from gymbros_liens l where l.statut = 'acceptee'
                 and ((l.demandeur = moi and l.cible = lui) or (l.cible = moi and l.demandeur = lui))) then
    raise exception 'pas_gymbro';
  end if;
  if not exists (select 1 from seances_direct s where s.utilisateur = lui and s.maj > now() - interval '45 minutes'
                 and s.donnees->>'fini' is null) then
    raise exception 'pas_en_seance';
  end if;
  if exists (select 1 from gymbros_encouragements e where e.auteur = moi and e.cible = lui
             and e.cree_le > now() - interval '1 minute') then
    return false;
  end if;
  delete from gymbros_encouragements where cree_le < now() - interval '2 days';
  insert into gymbros_encouragements (auteur, cible) values (moi, lui);
  return true;
end;
$fn$;

revoke execute on function public.direct_publier(jsonb, uuid) from public, anon;
revoke execute on function public.direct_terminer() from public, anon;
revoke execute on function public.gymbro_direct() from public, anon;
revoke execute on function public.duo_inviter(text, jsonb) from public, anon;
revoke execute on function public.duo_repondre(uuid, boolean) from public, anon;
revoke execute on function public.duo_quitter(uuid) from public, anon;
revoke execute on function public.gymbro_encourager(text) from public, anon;
grant execute on function public.direct_publier(jsonb, uuid) to authenticated;
grant execute on function public.direct_terminer() to authenticated;
grant execute on function public.gymbro_direct() to authenticated;
grant execute on function public.duo_inviter(text, jsonb) to authenticated;
grant execute on function public.duo_repondre(uuid, boolean) to authenticated;
grant execute on function public.duo_quitter(uuid) to authenticated;
grant execute on function public.gymbro_encourager(text) to authenticated;
