-- 0005_pro — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- Askēsis Pro : abonnements, essais d'IA, membres fondateurs.
-- À exécuter une fois dans l'éditeur SQL de Supabase, après les autres SQL.
-- Idempotent : relancer ne casse rien, et ne fait pas de nouveaux
-- fondateurs (seuls les comptes qui existent au PREMIER passage le sont).
-- Tant qu'il n'est pas exécuté, l'appli ne verrouille rien.

-- 1) Un abonnement par compte. Lisible par son titulaire (et l'admin) ;
--    écrit seulement par le serveur (webhook Stripe) et les fonctions
--    d'admin ci-dessous.
create table if not exists public.abonnements (
  utilisateur       text primary key,
  formule           text not null check (formule in ('fondateur', 'offert', 'mois', 'an')),
  statut            text not null check (statut in ('actif', 'essai', 'annule', 'impaye', 'expire')),
  fin               timestamptz,
  client_stripe     text,
  abonnement_stripe text unique,
  cree_le           timestamptz not null default now(),
  maj               timestamptz not null default now()
);
alter table public.abonnements enable row level security;
drop policy if exists "abonnements lecture" on public.abonnements;
create policy "abonnements lecture" on public.abonnements for select to authenticated
  using (utilisateur = auth.uid()::text or auth.jwt() ->> 'email' = 'jambou592@gmail.com');

-- 2) Membres fondateurs : tous les comptes qui existent au premier passage.
do $$
begin
  if not exists (select 1 from public.abonnements where formule = 'fondateur') then
    insert into public.abonnements (utilisateur, formule, statut, fin)
    select id::text, 'fondateur', 'actif', null from auth.users
    on conflict (utilisateur) do nothing;
  end if;
end;
$$;

-- 3) Admin : offrir Pro à un compte, ou le retirer (jamais un abonnement payé).
create or replace function public.admin_offrir_pro(p_utilisateur text, p_offert boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'jambou592@gmail.com' then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  if p_offert then
    insert into abonnements (utilisateur, formule, statut, fin) values (p_utilisateur, 'offert', 'actif', null)
    on conflict (utilisateur) do update set formule = 'offert', statut = 'actif', fin = null, maj = now()
      where abonnements.statut = 'expire';
  else
    delete from abonnements where utilisateur = p_utilisateur and formule = 'offert';
  end if;
end;
$$;
grant execute on function public.admin_offrir_pro(text, boolean) to authenticated;

-- 4) Essais d'IA : un compteur par compte et par mois, tenu par la fonction
--    serveur « ia » (3 essais par mois sans Pro).
create table if not exists public.usages_ia (
  utilisateur text not null,
  mois        date not null,
  nombre      integer not null default 0 check (nombre >= 0),
  primary key (utilisateur, mois)
);
alter table public.usages_ia enable row level security;
drop policy if exists "usages_ia lecture" on public.usages_ia;
create policy "usages_ia lecture" on public.usages_ia for select to authenticated
  using (utilisateur = auth.uid()::text);

-- Compte un usage si la limite du mois n'est pas atteinte : renvoie le
-- nouveau total, ou null si la limite est atteinte.
create or replace function public.compter_usage_ia(p_utilisateur text, p_limite integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into usages_ia as u (utilisateur, mois, nombre)
  values (p_utilisateur, date_trunc('month', now())::date, 1)
  on conflict (utilisateur, mois) do update set nombre = u.nombre + 1
    where u.nombre < p_limite
  returning nombre into v;
  return v;
end;
$$;
-- Rend un usage quand l'IA a échoué (rien n'a été fourni).
create or replace function public.rendre_usage_ia(p_utilisateur text)
returns void language sql security definer set search_path = public as $$
  update usages_ia set nombre = greatest(0, nombre - 1)
  where utilisateur = p_utilisateur and mois = date_trunc('month', now())::date;
$$;
-- Réservées au serveur (clé service) : personne d'autre ne touche aux compteurs.
revoke execute on function public.compter_usage_ia(text, integer) from public, anon, authenticated;
revoke execute on function public.rendre_usage_ia(text) from public, anon, authenticated;

-- 5) Un compte effacé emporte ses lignes Pro (pense aussi à résilier son
--    abonnement Stripe s'il en avait un).
create or replace function public.nettoyer_pro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from abonnements where utilisateur = old.id::text;
  delete from usages_ia where utilisateur = old.id::text;
  return old;
end;
$$;
drop trigger if exists nettoyer_pro on auth.users;
create trigger nettoyer_pro after delete on auth.users for each row execute function public.nettoyer_pro();
