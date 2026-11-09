-- 0010_balance_withings — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- Balance Withings : les jetons de chaque compte restent sur le serveur.
-- À exécuter une fois dans l'éditeur SQL de Supabase, après « Askēsis Pro ».
-- Idempotent : relancer ne casse rien.

-- 1) La table des jetons. Aucune règle d'accès et aucun droit pour l'appli :
--    seule la fonction serveur « withings » (clé de service) la lit et
--    l'écrit. Personne ne voit un jeton depuis l'appli, pas même l'admin.
create table if not exists public.withings_jetons (
  utilisateur   text primary key,
  access_token  text not null,
  refresh_token text not null,
  expire_le     timestamptz not null,
  userid        text,
  cree_le       timestamptz not null default now(),
  maj           timestamptz not null default now()
);
alter table public.withings_jetons enable row level security;
revoke all on table public.withings_jetons from public, anon, authenticated;

-- 2) Les anciennes versions de l'appli gardaient le jeton dans le profil
--    (donnees -> 'withings'). À chaque écriture du profil, il part dans la
--    table (le plus récent gagne) et quitte le profil : une ancienne appli
--    encore ouverte ne peut plus en laisser un.
create or replace function public.profil_sans_jetons()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  w jsonb := new.donnees -> 'withings';
  exp timestamptz;
begin
  if jsonb_typeof(w) = 'object' then
    if coalesce(w ->> 'access_token', '') <> '' and coalesce(w ->> 'refresh_token', '') <> '' then
      exp := case when jsonb_typeof(w -> 'expire_le') = 'number' then to_timestamp((w ->> 'expire_le')::numeric / 1000) else now() end;
      insert into withings_jetons (utilisateur, access_token, refresh_token, expire_le, userid)
      values (new.utilisateur, w ->> 'access_token', w ->> 'refresh_token', exp, w ->> 'userid')
      on conflict (utilisateur) do update
        set access_token = excluded.access_token, refresh_token = excluded.refresh_token,
            expire_le = excluded.expire_le, userid = excluded.userid, maj = now()
        where excluded.expire_le > withings_jetons.expire_le;
    end if;
    new.donnees := new.donnees - 'withings';
  end if;
  return new;
end;
$fn$;
drop trigger if exists profil_sans_jetons on public.profil;
create trigger profil_sans_jetons before insert or update on public.profil
  for each row execute function public.profil_sans_jetons();
-- Les profils déjà enregistrés passent par la même porte.
update public.profil set donnees = donnees where donnees ? 'withings';

-- 3) Un compte effacé part avec ses jetons.
create or replace function public.nettoyer_withings()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  delete from withings_jetons where utilisateur = old.id::text;
  return old;
end;
$fn$;
drop trigger if exists nettoyer_withings on auth.users;
create trigger nettoyer_withings after delete on auth.users
  for each row execute function public.nettoyer_withings();
