-- 0009_saison_et_defis — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- Saison et défis entre gymbros. À passer après « Gymbro et photos ».
-- Ne modifie aucune donnée existante ; le relancer ne casse rien.

-- 1) Passe de saison : chaque compte publie l'XP de sa saison en cours (et
--    son cadre d'avatar) ; ses gymbros acceptés le voient dans le
--    classement de la saison.
alter table public.profils add column if not exists saison jsonb
  check (saison is null or (jsonb_typeof(saison) = 'object' and length(saison::text) <= 300));

create or replace function public.gymbro_saisons()
returns table(pseudo text, saison jsonb)
language sql stable security definer set search_path = public as $$
  select p.pseudo, pr.saison
  from gymbros_liens l
  join pseudos p on p.utilisateur = case when l.demandeur = auth.uid()::text then l.cible else l.demandeur end
  join profils pr on pr.utilisateur = p.utilisateur
  where auth.uid() is not null
    and l.statut = 'acceptee'
    and auth.uid()::text in (l.demandeur, l.cible)
    and pr.saison is not null
    and not exists (select 1 from comptes_bloques b where b.utilisateur = p.utilisateur);
$$;
revoke execute on function public.gymbro_saisons() from public, anon;
grant execute on function public.gymbro_saisons() to authenticated;

-- 2) Défis entre gymbros sur un exercice : 7, 14 ou 30 jours, à la charge
--    max, aux répétitions cumulées ou au tonnage. Chacun publie son score,
--    calculé sur son téléphone d'après ses séances ; seuls les participants
--    voient le défi et son classement. Tout passe par les fonctions.
create table if not exists public.gymbros_defis (
  id           uuid primary key default gen_random_uuid(),
  createur     text not null,
  exercice_id  text not null check (char_length(exercice_id) between 1 and 80),
  exercice_nom text not null check (char_length(exercice_nom) between 1 and 80),
  critere      text not null check (critere in ('charge', 'reps', 'tonnage')),
  debut        date not null,
  fin          date not null,
  cree_le      timestamptz not null default now(),
  check (fin >= debut and fin - debut <= 31)
);
create table if not exists public.gymbros_defis_membres (
  defi        uuid not null references public.gymbros_defis(id) on delete cascade,
  utilisateur text not null,
  statut      text not null default 'invite' check (statut in ('invite', 'accepte', 'refuse')),
  score       numeric not null default 0 check (score >= 0 and score <= 10000000),
  maj         timestamptz not null default now(),
  primary key (defi, utilisateur)
);
alter table public.gymbros_defis enable row level security;
alter table public.gymbros_defis_membres enable row level security;

create or replace function public.defi_creer(p_exercice_id text, p_exercice_nom text, p_critere text, p_jours int, p_debut date, p_pseudos text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_moi text := auth.uid()::text; v_id uuid;
begin
  if v_moi is null then raise exception 'connexion requise'; end if;
  if p_jours not in (7, 14, 30) then raise exception 'durée invalide'; end if;
  if p_critere not in ('charge', 'reps', 'tonnage') then raise exception 'critère invalide'; end if;
  if p_debut is null or p_debut < current_date - 1 or p_debut > current_date + 1 then raise exception 'date invalide'; end if;
  if not public.texte_acceptable(p_exercice_nom) then raise exception 'nom refusé'; end if;
  if (select count(*) from gymbros_defis d where d.createur = v_moi and d.fin >= current_date) >= 5 then
    raise exception 'trop de défis en cours';
  end if;
  insert into gymbros_defis(createur, exercice_id, exercice_nom, critere, debut, fin)
  values (v_moi, left(p_exercice_id, 80), left(p_exercice_nom, 80), p_critere, p_debut, p_debut + p_jours - 1)
  returning id into v_id;
  insert into gymbros_defis_membres(defi, utilisateur, statut) values (v_id, v_moi, 'accepte');
  insert into gymbros_defis_membres(defi, utilisateur, statut)
  select v_id, p.utilisateur, 'invite'::text
  from pseudos p
  where lower(p.pseudo) in (select lower(x) from unnest(coalesce(p_pseudos, '{}'::text[])) x)
    and p.utilisateur <> v_moi
    and public.est_mon_gymbro(p.utilisateur)
    and not exists (select 1 from comptes_bloques b where b.utilisateur = p.utilisateur)
  on conflict do nothing;
  return v_id;
end $$;

create or replace function public.defi_repondre(p_defi uuid, p_accepte boolean)
returns void language sql security definer set search_path = public as $$
  update gymbros_defis_membres set statut = case when p_accepte then 'accepte' else 'refuse' end, maj = now()
  where defi = p_defi and utilisateur = auth.uid()::text and statut = 'invite';
$$;

create or replace function public.defi_quitter(p_defi uuid)
returns void language sql security definer set search_path = public as $$
  delete from gymbros_defis_membres where defi = p_defi and utilisateur = auth.uid()::text;
  delete from gymbros_defis d where d.id = p_defi
    and not exists (select 1 from gymbros_defis_membres m where m.defi = d.id and m.statut = 'accepte');
$$;

-- Score du compte connecté, accepté jusqu'à 2 jours après la fin (séances
-- synchronisées en retard).
create or replace function public.defi_score(p_defi uuid, p_score numeric)
returns void language sql security definer set search_path = public as $$
  update gymbros_defis_membres m set score = greatest(0, least(coalesce(p_score, 0), 10000000)), maj = now()
  from gymbros_defis d
  where d.id = m.defi and m.defi = p_defi and m.utilisateur = auth.uid()::text and m.statut = 'accepte'
    and current_date <= d.fin + 2;
$$;

-- Mes défis (en cours, ou finis depuis 45 jours au plus) et leurs membres.
create or replace function public.mes_defis()
returns table(id uuid, createur text, exercice_id text, exercice_nom text, critere text, debut date, fin date, mon_statut text, membres jsonb)
language sql stable security definer set search_path = public as $$
  select d.id, (select ps.pseudo from pseudos ps where ps.utilisateur = d.createur), d.exercice_id, d.exercice_nom, d.critere, d.debut, d.fin, m.statut,
    coalesce((select jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'statut', m2.statut, 'score', m2.score) order by m2.score desc, m2.maj)
       from gymbros_defis_membres m2 join pseudos p on p.utilisateur = m2.utilisateur
       where m2.defi = d.id and m2.statut <> 'refuse'
         and not exists (select 1 from comptes_bloques b where b.utilisateur = m2.utilisateur)), '[]'::jsonb)
  from gymbros_defis d
  join gymbros_defis_membres m on m.defi = d.id and m.utilisateur = auth.uid()::text and m.statut <> 'refuse'
  where auth.uid() is not null and d.fin >= current_date - 45
  order by d.fin desc
  limit 30;
$$;

revoke execute on function public.defi_creer(text, text, text, int, date, text[]) from public, anon;
revoke execute on function public.defi_repondre(uuid, boolean) from public, anon;
revoke execute on function public.defi_quitter(uuid) from public, anon;
revoke execute on function public.defi_score(uuid, numeric) from public, anon;
revoke execute on function public.mes_defis() from public, anon;
grant execute on function public.defi_creer(text, text, text, int, date, text[]) to authenticated;
grant execute on function public.defi_repondre(uuid, boolean) to authenticated;
grant execute on function public.defi_quitter(uuid) to authenticated;
grant execute on function public.defi_score(uuid, numeric) to authenticated;
grant execute on function public.mes_defis() to authenticated;
