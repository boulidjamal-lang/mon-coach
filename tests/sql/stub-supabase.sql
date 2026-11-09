-- Double minimal de Supabase pour tester les scripts SQL de l'appli sur un
-- Postgres local : rôles, schéma auth (auth.uid(), auth.jwt(), auth.users),
-- schéma storage, et les droits par défaut que Supabase donne aux rôles
-- (c'est le RLS qui restreint, pas les GRANT).
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  raw_user_meta_data jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role'
$$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false, created_at timestamptz default now());
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant all on all tables in schema public, storage to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema storage grant all on tables to anon, authenticated, service_role;
-- La table des aliments existe avant l'appli (import CIQUAL) : le script 3 la
-- prépare, il ne la crée pas. Même forme que l'import (noms de colonnes CIQUAL).
create table if not exists public.aliments_base (
  alim_code text primary key,
  alim_nom_fr text not null,
  energie_kcal numeric,
  proteines numeric,
  glucides numeric,
  lipides numeric
);
insert into public.aliments_base values ('1', 'Pomme, crue', 52, 0.3, 11.6, 0.2), ('2', 'Œuf, cru', 140, 12.7, 0.3, 9.8) on conflict do nothing;
