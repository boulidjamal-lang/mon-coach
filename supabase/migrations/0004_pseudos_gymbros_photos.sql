-- 0004_pseudos_gymbros_photos — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- Nom d'utilisateur, Gymbro, photos de progression et protection des
-- exercices supprimés.
-- À exécuter une fois dans l'éditeur SQL de Supabase, APRÈS le SQL des
-- politiques de sécurité (RLS). Idempotent : relancer ne casse rien.

-- 1) Noms d'utilisateur : un par compte, uniques (sans tenir compte des
--    majuscules), lisibles par tout compte connecté pour la recherche.
create table if not exists public.pseudos (
  utilisateur     text primary key,
  pseudo          text not null,
  partage_seances boolean not null default true,
  cree_le         timestamptz not null default now()
);
create unique index if not exists pseudos_pseudo_unique on public.pseudos (lower(pseudo));
-- Deux noms qui ne diffèrent que par des points ou tirets bas comptent
-- comme le même nom (jamal.fit = jamal_fit = jamalfit), pour éviter les
-- usurpations. (Si cette ligne échoue, deux comptes ont déjà des noms
-- de ce genre : renommer l'un d'eux puis relancer.)
create unique index if not exists pseudos_pseudo_norm_unique on public.pseudos (regexp_replace(lower(pseudo), '[._]', '', 'g'));

-- Noms offensants, dégradants ou réservés : mêmes listes et même
-- normalisation que dans l'appli (voir pseudoInterdit), vérifiées par le
-- serveur à chaque création ou modification.
create or replace function public.forme_normalisee_pseudo(s text)
returns text language sql immutable as $fn$
  select regexp_replace(regexp_replace(translate(lower(coalesce(s, '')), '0134578@$', 'oieastbas'), '[^a-z0-9]', '', 'g'), '(.)\1+', '\1', 'g');
$fn$;
create or replace function public.pseudo_acceptable(p text)
returns boolean language plpgsql immutable as $fn$
declare
  partiel text[] := array['conard','conase','salope','salaud','encule','batard','putain','niquer','niquetamere','tamere','filsdepute','poufiase','poufiase','grognase','branleur','branlete','suceur','suceuse','couile','nichon','enfoire','abruti','negre','negro','bougnoul','youpin','chinetoque','bamboula','gouine','travelo','tarlouze','tapete','pedophile','violeur','hitler','siegheil','heilhitler','nazisme','teroriste','inceste','merdeux','tafiole','salearabe','salearabe','salenoir','salejuif','fuck','fack','fvck','phuck','fukyou','fckyou','bitch','biatch','cunt','niger','niga','fagot','whore','slut','pusy','ashole','bastard','rapist','trany','porno','motherfucker','dickhead','jerkof','cumshot','blowjob'];
  exact   text[] := array['con','cone','pute','pd','pede','pedale','ntm','nique','bite','zizi','chate','cul','chier','merde','catin','traine','mongol','mongole','debile','atarde','cretin','raton','bicot','nazi','nazis','pedo','viol','sexe','sex','x','porn','retard','fag','dick','cock','fck','fuk','k','kike','spic','chink','dyke','rape','shit','tits','anus','penis','vagin','admin','administrateur','moderateur','modo','suport','anqa','anqa','askesis','claude','rot','system','systeme','oficiel','oficial','staf','equipe','team'];
  formes  text[];
  f text; m text;
begin
  formes := array[public.forme_normalisee_pseudo(p), public.forme_normalisee_pseudo(regexp_replace(lower(p), '[0-9]', '', 'g'))]
            || array(select public.forme_normalisee_pseudo(x) from regexp_split_to_table(lower(p), '[._]+') as x);
  foreach f in array formes loop
    continue when f = '';
    if f = any(exact) then return false; end if;
    foreach m in array partiel loop
      if position(m in f) > 0 then return false; end if;
    end loop;
  end loop;
  return true;
end;
$fn$;
create or replace function public.verifier_pseudo()
returns trigger language plpgsql as $fn$
begin
  if not public.pseudo_acceptable(new.pseudo) then
    raise exception 'pseudo_interdit' using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;
drop trigger if exists pseudos_verifier on public.pseudos;
create trigger pseudos_verifier before insert or update of pseudo on public.pseudos
  for each row execute function public.verifier_pseudo();
do $$ begin
  alter table public.pseudos add constraint pseudo_format check (pseudo ~ '^[a-z0-9_.]{3,20}$');
exception when duplicate_object then null; end $$;
alter table public.pseudos enable row level security;
drop policy if exists "pseudos lisibles" on public.pseudos;
create policy "pseudos lisibles" on public.pseudos for select to authenticated using (true);
drop policy if exists "pseudo perso ajout" on public.pseudos;
create policy "pseudo perso ajout" on public.pseudos for insert to authenticated
  with check (utilisateur = auth.uid()::text);
drop policy if exists "pseudo perso modif" on public.pseudos;
create policy "pseudo perso modif" on public.pseudos for update to authenticated
  using (utilisateur = auth.uid()::text) with check (utilisateur = auth.uid()::text);
drop policy if exists "pseudo perso suppr" on public.pseudos;
create policy "pseudo perso suppr" on public.pseudos for delete to authenticated
  using (utilisateur = auth.uid()::text);

-- Vérifie qu'un nom est libre AVANT la création du compte (appelable sans
-- être connecté ; ne renvoie qu'un oui/non, jamais la liste des noms).
create or replace function public.pseudo_disponible(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pseudo_acceptable(p)
     and not exists (select 1 from pseudos where regexp_replace(lower(pseudo), '[._]', '', 'g') = regexp_replace(lower(p), '[._]', '', 'g'));
$$;
grant execute on function public.pseudo_disponible(text) to anon, authenticated;

-- 2) Gymbro : demandes entre comptes. Pour comparer ses séances avec
--    quelqu'un, il faut lui envoyer une demande et qu'il l'accepte. Une
--    ligne par paire (demandeur -> cible), en attente ou acceptée ; un
--    refus ou un retrait supprime simplement la ligne. Aucune écriture
--    directe dans la table : tout passe par les fonctions ci-dessous, qui
--    vérifient qui fait quoi.
create table if not exists public.gymbros_liens (
  demandeur  text not null,
  cible      text not null,
  statut     text not null default 'attente' check (statut in ('attente', 'acceptee')),
  cree_le    timestamptz not null default now(),
  repondu_le timestamptz,
  primary key (demandeur, cible),
  check (demandeur <> cible)
);
alter table public.gymbros_liens enable row level security;
drop policy if exists "gymbros liens lecture" on public.gymbros_liens;
create policy "gymbros liens lecture" on public.gymbros_liens for select to authenticated
  using (demandeur = auth.uid()::text or cible = auth.uid()::text);

-- Envoyer une demande. Si l'autre m'avait déjà demandé, c'est accepté
-- d'office. Au plus 30 demandes en attente par compte (anti-spam).
create or replace function public.gymbro_demander(p_pseudo text)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  lui text;
  existant text;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  if exists (select 1 from comptes_bloques b where b.utilisateur = moi) then raise exception 'compte_bloque'; end if;
  select utilisateur into lui from pseudos where lower(pseudo) = lower(p_pseudo);
  if lui is null then raise exception 'pseudo_inconnu'; end if;
  if lui = moi then raise exception 'soi_meme'; end if;
  update gymbros_liens set statut = 'acceptee', repondu_le = now()
    where demandeur = lui and cible = moi and statut = 'attente';
  if found then return 'acceptee'; end if;
  select statut into existant from gymbros_liens
    where (demandeur = moi and cible = lui) or (demandeur = lui and cible = moi) limit 1;
  if existant is not null then return existant; end if;
  if (select count(*) from gymbros_liens where demandeur = moi and statut = 'attente') >= 30 then
    raise exception 'trop_de_demandes';
  end if;
  insert into gymbros_liens (demandeur, cible) values (moi, lui);
  return 'attente';
end;
$fn$;
grant execute on function public.gymbro_demander(text) to authenticated;

-- Accepter ou refuser une demande reçue.
create or replace function public.gymbro_repondre(p_pseudo text, p_accepter boolean)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  lui text;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  select utilisateur into lui from pseudos where lower(pseudo) = lower(p_pseudo);
  if lui is null then raise exception 'pseudo_inconnu'; end if;
  if p_accepter then
    update gymbros_liens set statut = 'acceptee', repondu_le = now()
      where demandeur = lui and cible = moi and statut = 'attente';
    return case when found then 'acceptee' else 'aucune' end;
  end if;
  delete from gymbros_liens where demandeur = lui and cible = moi and statut = 'attente';
  return 'refusee';
end;
$fn$;
grant execute on function public.gymbro_repondre(text, boolean) to authenticated;

-- Annuler une demande envoyée ou retirer un gymbro (dans les deux sens).
create or replace function public.gymbro_retirer(p_pseudo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  lui text;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  select utilisateur into lui from pseudos where lower(pseudo) = lower(p_pseudo);
  if lui is null then return; end if;
  delete from gymbros_liens where (demandeur = moi and cible = lui) or (demandeur = lui and cible = moi);
end;
$fn$;
grant execute on function public.gymbro_retirer(text) to authenticated;

-- Mes liens : pseudo de l'autre, sens (envoyée / reçue) et statut.
create or replace function public.gymbro_mes_liens()
returns table(pseudo text, sens text, statut text, cree_le timestamptz)
language sql stable security definer set search_path = public as $$
  select p.pseudo,
         case when l.demandeur = auth.uid()::text then 'envoyee' else 'recue' end,
         l.statut, l.cree_le
  from gymbros_liens l
  join pseudos p on p.utilisateur = case when l.demandeur = auth.uid()::text then l.cible else l.demandeur end
  where auth.uid() is not null
    and (l.demandeur = auth.uid()::text or l.cible = auth.uid()::text)
  order by l.cree_le desc;
$$;
grant execute on function public.gymbro_mes_liens() to authenticated;

--    Séances d'un gymbro (90 derniers jours par défaut) : seulement si la
--    demande a été acceptée (dans un sens ou dans l'autre) ET qu'il a
--    laissé le partage activé. La table des séances reste protégée par
--    RLS : cette fonction n'en expose que ça.
create or replace function public.gymbro_seances(p_pseudo text, p_depuis date default (current_date - 90))
returns table(donnees jsonb) language sql stable security definer set search_path = public as $$
  select s.donnees
  from seances_musculation s
  join pseudos p on p.utilisateur = s.utilisateur
  where auth.uid() is not null
    and lower(p.pseudo) = lower(p_pseudo)
    and p.partage_seances
    and exists (select 1 from gymbros_liens l
                where l.statut = 'acceptee'
                  and ((l.demandeur = auth.uid()::text and l.cible = p.utilisateur)
                    or (l.cible = auth.uid()::text and l.demandeur = p.utilisateur)))
    and not exists (select 1 from comptes_bloques b where b.utilisateur = p.utilisateur)
    and coalesce(s.donnees->>'date', '') >= p_depuis::text
  order by s.donnees->>'date' desc
  limit 300;
$$;
grant execute on function public.gymbro_seances(text, date) to authenticated;

--    Fil des gymbros (onglet Activité) : séances récentes (14 jours par
--    défaut, 31 au plus) de tous mes gymbros acceptés qui partagent leurs
--    séances, avec le nombre de « respects » reçus et si j'en ai donné un.
create table if not exists public.gymbros_respects (
  seance_utilisateur text not null,
  seance_id          text not null,
  auteur             text not null,
  cree_le            timestamptz not null default now(),
  primary key (seance_utilisateur, seance_id, auteur)
);
alter table public.gymbros_respects enable row level security;
drop policy if exists "gymbros respects lecture" on public.gymbros_respects;
create policy "gymbros respects lecture" on public.gymbros_respects for select to authenticated
  using (auteur = auth.uid()::text or seance_utilisateur = auth.uid()::text);

create or replace function public.gymbro_fil(p_jours int default 14)
returns table(pseudo text, seance_id text, donnees jsonb, respects int, mon_respect boolean)
language sql stable security definer set search_path = public as $$
  with amis as (
    select case when l.demandeur = auth.uid()::text then l.cible else l.demandeur end as utilisateur
    from gymbros_liens l
    where l.statut = 'acceptee' and auth.uid()::text in (l.demandeur, l.cible)
  )
  select p.pseudo, s.id, s.donnees,
         (select count(*)::int from gymbros_respects r where r.seance_utilisateur = s.utilisateur and r.seance_id = s.id),
         exists (select 1 from gymbros_respects r where r.seance_utilisateur = s.utilisateur and r.seance_id = s.id and r.auteur = auth.uid()::text)
  from amis a
  join pseudos p on p.utilisateur = a.utilisateur and p.partage_seances
  join seances_musculation s on s.utilisateur = a.utilisateur
  where auth.uid() is not null
    and not exists (select 1 from comptes_bloques b where b.utilisateur = a.utilisateur)
    and coalesce(s.donnees->>'date', '') >= (current_date - least(greatest(coalesce(p_jours, 14), 1), 31))::text
  order by s.donnees->>'date' desc, s.maj desc
  limit 60;
$$;
grant execute on function public.gymbro_fil(int) to authenticated;

-- Donner (ou reprendre) un respect sur la séance d'un gymbro.
create or replace function public.gymbro_respect(p_pseudo text, p_seance text, p_actif boolean)
returns int language plpgsql security definer set search_path = public as $fn$
declare
  moi text := auth.uid()::text;
  lui text;
  n int;
begin
  if moi is null then raise exception 'non_connecte'; end if;
  if exists (select 1 from comptes_bloques b where b.utilisateur = moi) then raise exception 'compte_bloque'; end if;
  select utilisateur into lui from pseudos where lower(pseudo) = lower(p_pseudo) and partage_seances;
  if lui is null then raise exception 'pseudo_inconnu'; end if;
  if not exists (select 1 from gymbros_liens l where l.statut = 'acceptee'
                 and ((l.demandeur = moi and l.cible = lui) or (l.cible = moi and l.demandeur = lui))) then
    raise exception 'pas_gymbro';
  end if;
  if not exists (select 1 from seances_musculation s where s.utilisateur = lui and s.id = p_seance) then
    raise exception 'seance_inconnue';
  end if;
  if p_actif then
    insert into gymbros_respects (seance_utilisateur, seance_id, auteur) values (lui, p_seance, moi)
      on conflict do nothing;
  else
    delete from gymbros_respects where seance_utilisateur = lui and seance_id = p_seance and auteur = moi;
  end if;
  select count(*)::int into n from gymbros_respects where seance_utilisateur = lui and seance_id = p_seance;
  return n;
end;
$fn$;
grant execute on function public.gymbro_respect(text, text, boolean) to authenticated;

-- Respects reçus sur mes séances (14 derniers jours par défaut).
create or replace function public.gymbro_respects_recus(p_jours int default 14)
returns table(pseudo text, seance_id text, seance_date text, cree_le timestamptz)
language sql stable security definer set search_path = public as $$
  select p.pseudo, r.seance_id, s.donnees->>'date', r.cree_le
  from gymbros_respects r
  join pseudos p on p.utilisateur = r.auteur
  left join seances_musculation s on s.utilisateur = r.seance_utilisateur and s.id = r.seance_id
  where auth.uid() is not null
    and r.seance_utilisateur = auth.uid()::text
    and r.cree_le >= now() - make_interval(days => least(greatest(coalesce(p_jours, 14), 1), 60))
  order by r.cree_le desc
  limit 50;
$$;
grant execute on function public.gymbro_respects_recus(int) to authenticated;

--    Profil : photo (petite, compressée par l'appli) et courte bio, visibles
--    seulement par la personne et ses gymbros acceptés. Bio filtrée comme
--    les noms d'utilisateur (insultes), sans les noms réservés.
create or replace function public.texte_acceptable(t text)
returns boolean language plpgsql immutable as $fn$
declare
  partiel text[] := array['conard','conase','salope','salaud','encule','batard','putain','niquer','niquetamere','tamere','filsdepute','poufiase','poufiase','grognase','branleur','branlete','suceur','suceuse','couile','nichon','enfoire','abruti','negre','negro','bougnoul','youpin','chinetoque','bamboula','gouine','travelo','tarlouze','tapete','pedophile','violeur','hitler','siegheil','heilhitler','nazisme','teroriste','inceste','merdeux','tafiole','salearabe','salearabe','salenoir','salejuif','fuck','fack','fvck','phuck','fukyou','fckyou','bitch','biatch','cunt','niger','niga','fagot','whore','slut','pusy','ashole','bastard','rapist','trany','porno','motherfucker','dickhead','jerkof','cumshot','blowjob'];
  exact   text[] := array['con','cone','pute','pd','pede','pedale','ntm','nique','bite','zizi','chate','cul','chier','merde','catin','traine','mongol','mongole','debile','atarde','cretin','raton','bicot','nazi','nazis','pedo','viol','sexe','sex','x','porn','retard','fag','dick','cock','fck','fuk','k','kike','spic','chink','dyke','rape','shit','tits','anus','penis','vagin'];
  f text; m text;
begin
  if t is null or btrim(t) = '' then return true; end if;
  foreach m in array partiel loop
    if position(m in public.forme_normalisee_pseudo(t)) > 0 then return false; end if;
  end loop;
  for f in select public.forme_normalisee_pseudo(x) from regexp_split_to_table(lower(t), '[[:space:][:punct:]]+') as x loop
    continue when f = '';
    if f = any(exact) then return false; end if;
  end loop;
  return true;
end;
$fn$;
create or replace function public.est_mon_gymbro(p_utilisateur text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from gymbros_liens l where l.statut = 'acceptee'
    and ((l.demandeur = auth.uid()::text and l.cible = p_utilisateur)
      or (l.cible = auth.uid()::text and l.demandeur = p_utilisateur)));
$$;
create table if not exists public.profils (
  utilisateur text primary key,
  bio         text check (bio is null or char_length(bio) <= 160),
  avatar      text check (avatar is null or (length(avatar) <= 40000 and avatar ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')),
  maj         timestamptz not null default now()
);
alter table public.profils enable row level security;
drop policy if exists "profils lecture" on public.profils;
create policy "profils lecture" on public.profils for select to authenticated
  using (utilisateur = auth.uid()::text or public.est_mon_gymbro(utilisateur));
drop policy if exists "profils ajout" on public.profils;
create policy "profils ajout" on public.profils for insert to authenticated
  with check (utilisateur = auth.uid()::text and public.texte_acceptable(bio));
drop policy if exists "profils modif" on public.profils;
create policy "profils modif" on public.profils for update to authenticated
  using (utilisateur = auth.uid()::text) with check (utilisateur = auth.uid()::text and public.texte_acceptable(bio));
drop policy if exists "profils suppr" on public.profils;
create policy "profils suppr" on public.profils for delete to authenticated
  using (utilisateur = auth.uid()::text);

-- Profils de mes gymbros acceptés (pseudo, bio, photo, date d'inscription).
create or replace function public.gymbro_profils()
returns table(pseudo text, bio text, avatar text, membre_depuis timestamptz)
language sql stable security definer set search_path = public as $$
  select p.pseudo, pr.bio, pr.avatar, p.cree_le
  from gymbros_liens l
  join pseudos p on p.utilisateur = case when l.demandeur = auth.uid()::text then l.cible else l.demandeur end
  left join profils pr on pr.utilisateur = p.utilisateur
  where auth.uid() is not null
    and l.statut = 'acceptee'
    and auth.uid()::text in (l.demandeur, l.cible)
    and not exists (select 1 from comptes_bloques b where b.utilisateur = p.utilisateur);
$$;
grant execute on function public.gymbro_profils() to authenticated;

-- 3) Exercices supprimés ou fusionnés par l'admin : ils ne peuvent plus
--    être recréés par le cache d'un téléphone (même avec une ancienne
--    version de l'appli). La ligne renvoyée est simplement ignorée.
create table if not exists public.exercices_base_overrides (
  id          text primary key,
  donnees     jsonb not null default '{}'::jsonb,
  maj         bigint not null default 0,
  modifie_par text
);
alter table public.exercices_base_overrides enable row level security;
drop policy if exists "corrections lisibles" on public.exercices_base_overrides;
drop policy if exists "corrections admin" on public.exercices_base_overrides;
create policy "corrections lisibles" on public.exercices_base_overrides for select to authenticated using (true);
create policy "corrections admin" on public.exercices_base_overrides for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
create or replace function public.bloquer_exercice_supprime()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if exists (select 1 from exercices_base_overrides o
             where o.id = new.id
               and (coalesce((o.donnees ->> 'supprime')::boolean, false) or o.donnees ? 'fusionneVers')) then
    return null;
  end if;
  return new;
end;
$fn$;
drop trigger if exists exercices_perso_pas_de_resurrection on public.exercices_perso_musculation;
create trigger exercices_perso_pas_de_resurrection before insert or update on public.exercices_perso_musculation
  for each row execute function public.bloquer_exercice_supprime();

-- 4) Recettes : privées à leur créateur, sauf celles que l'admin rend
--    accessibles à tous (donnees.partagee = true). L'écriture reste
--    réservée au propriétaire ou à l'admin.
create table if not exists public.recettes_perso (
  utilisateur text not null,
  id          text not null,
  donnees     jsonb not null,
  maj         bigint not null default 0,
  primary key (utilisateur, id)
);
alter table public.recettes_perso enable row level security;
drop policy if exists "recettes_perso par compte" on public.recettes_perso;
drop policy if exists "recettes_perso lecture" on public.recettes_perso;
drop policy if exists "recettes_perso ecriture" on public.recettes_perso;
drop policy if exists "recettes_perso modif" on public.recettes_perso;
drop policy if exists "recettes_perso suppr" on public.recettes_perso;
create policy "recettes_perso lecture" on public.recettes_perso for select to authenticated
  using (utilisateur = auth.uid()::text or public.est_admin() or donnees ->> 'partagee' = 'true');
create policy "recettes_perso ecriture" on public.recettes_perso for insert to authenticated
  with check ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or public.est_admin());
create policy "recettes_perso modif" on public.recettes_perso for update to authenticated
  using ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or public.est_admin())
  with check ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or public.est_admin());
create policy "recettes_perso suppr" on public.recettes_perso for delete to authenticated
  using ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or public.est_admin());

-- 5) Photos de progression : bucket privé, chaque compte ne voit et ne
--    gère que son propre dossier (<son id>/...).
insert into storage.buckets (id, name, public)
values ('photos-progression', 'photos-progression', false)
on conflict (id) do nothing;
drop policy if exists "photos progression lecture" on storage.objects;
create policy "photos progression lecture" on storage.objects for select to authenticated
  using (bucket_id = 'photos-progression' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos progression ajout" on storage.objects;
create policy "photos progression ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos-progression' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos progression suppr" on storage.objects;
create policy "photos progression suppr" on storage.objects for delete to authenticated
  using (bucket_id = 'photos-progression' and (storage.foldername(name))[1] = auth.uid()::text);

-- 6) Aliments partagés : un aliment créé par un utilisateur n'est visible
--    que par lui tant que l'admin ne l'a pas validé. Tout est vérifié ici,
--    côté serveur : modifier le stockage local du téléphone ne peut ni
--    valider un aliment, ni le rendre visible, ni en ressusciter un retiré.
-- Table des aliments ajoutés par les utilisateurs (créée à la main en
-- production avant ce script : « if not exists » la laisse telle quelle ;
-- les colonnes de validation sont ajoutées juste au-dessus).
create table if not exists public.aliments_partages (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  kcal100     numeric,
  p100        numeric,
  c100        numeric,
  f100        numeric,
  code_barre  text,
  source      text,
  createur_id text,
  cree_le     timestamptz not null default now(),
  supprime    boolean not null default false,
  valide      boolean not null default false,
  valide_par  text,
  valide_le   timestamptz
);
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'aliments_partages' and column_name = 'valide') then
    alter table public.aliments_partages add column valide boolean not null default false;
    -- Les aliments déjà partagés avant cette étape restent visibles.
    update public.aliments_partages set valide = true where not coalesce(supprime, false);
  end if;
end $$;
alter table public.aliments_partages add column if not exists valide_par text;
alter table public.aliments_partages add column if not exists valide_le timestamptz;
alter table public.aliments_partages enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'aliments_partages' loop
    execute format('drop policy %I on public.aliments_partages', r.policyname);
  end loop;
end $$;
create policy "aliments lecture" on public.aliments_partages for select to authenticated
  using (public.est_admin()
         or (not coalesce(supprime, false) and (valide or createur_id::text = auth.uid()::text)));
create policy "aliments creation" on public.aliments_partages for insert to authenticated
  with check (public.est_admin()
              or (createur_id::text = auth.uid()::text and not valide and not coalesce(supprime, false)
                  and not est_bloque(auth.uid()::text) and mon_compte_existe()));
create policy "aliments admin modif" on public.aliments_partages for update to authenticated
  using (public.est_admin()) with check (public.est_admin());
create policy "aliments admin suppr" on public.aliments_partages for delete to authenticated
  using (public.est_admin());

create or replace function public.plier_texte(t text) returns text language sql immutable as $fn$
  select translate(lower(coalesce(t, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa')
$fn$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.proname = 'chercher_aliments' and p.pronamespace = 'public'::regnamespace loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;
create function public.chercher_aliments(p_query text, p_limite integer default 20)
returns setof jsonb language sql stable security definer set search_path = public as $fn$
  with mots as (
    select m from unnest(string_to_array(plier_texte(trim(p_query)), ' ')) as m where m <> ''
  )
  select jsonb_build_object(
    'id', to_jsonb(a) -> 'id', 'nom', a.nom,
    'kcal100', a.kcal100, 'p100', a.p100, 'c100', a.c100, 'f100', a.f100,
    'code_barre', a.code_barre, 'cree_le', to_jsonb(a) -> 'cree_le',
    'est_mien', coalesce(a.createur_id::text = auth.uid()::text, false),
    'valide', a.valide)
  from aliments_partages a
  where not coalesce(a.supprime, false)
    and (a.valide or a.createur_id::text = auth.uid()::text)
    and length(trim(coalesce(p_query, ''))) >= 2
    and not exists (select 1 from mots where position(mots.m in plier_texte(a.nom)) = 0)
  order by coalesce(a.createur_id::text = auth.uid()::text, false) desc,
           position(plier_texte(trim(p_query)) in plier_texte(a.nom)) = 0,
           length(a.nom)
  limit least(greatest(coalesce(p_limite, 20), 1), 50)
$fn$;
grant execute on function public.chercher_aliments(text, integer) to anon, authenticated;

-- 7) Recettes : seul l'admin peut rendre une recette visible par tous.
--    Le drapeau « partagee » envoyé par un téléphone est ignoré : à la
--    création il est retiré, à la modification il garde sa valeur serveur.
create or replace function public.proteger_partage_recette()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if public.est_admin() then return new; end if;
  if tg_op = 'INSERT' or not (old.donnees ? 'partagee') then
    new.donnees := new.donnees - 'partagee';
  else
    new.donnees := jsonb_set(new.donnees, '{partagee}', old.donnees -> 'partagee');
  end if;
  return new;
end;
$fn$;
drop trigger if exists recettes_partage_admin_seul on public.recettes_perso;
create trigger recettes_partage_admin_seul before insert or update on public.recettes_perso
  for each row execute function public.proteger_partage_recette();
-- Une recette supprimée (par l'admin ou son créateur) ne revient jamais :
-- un téléphone resté sur une vieille copie ne peut pas la recréer.
create table if not exists public.recettes_supprimees (
  utilisateur text not null,
  id          text not null,
  supprime_le timestamptz not null default now(),
  primary key (utilisateur, id)
);
alter table public.recettes_supprimees enable row level security;
create or replace function public.memoriser_recette_supprimee()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into recettes_supprimees (utilisateur, id) values (old.utilisateur, old.id) on conflict do nothing;
  return old;
end;
$fn$;
drop trigger if exists recettes_memoriser_suppression on public.recettes_perso;
create trigger recettes_memoriser_suppression after delete on public.recettes_perso
  for each row execute function public.memoriser_recette_supprimee();
create or replace function public.bloquer_recette_supprimee()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if exists (select 1 from recettes_supprimees s where s.utilisateur = new.utilisateur and s.id = new.id) then
    return null;
  end if;
  return new;
end;
$fn$;
drop trigger if exists recettes_pas_de_resurrection on public.recettes_perso;
create trigger recettes_pas_de_resurrection before insert on public.recettes_perso
  for each row execute function public.bloquer_recette_supprimee();

-- 8) Base d'aliments (ex-« ciqual_aliments », renommée « aliments_base ») :
--    lecture pour tous, écriture réservée à l'admin (l'appli n'y écrit
--    plus ; un ancien téléphone ne peut plus y ajouter d'aliment).
do $$ begin
  if to_regclass('public.aliments_base') is null and exists (
       select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'ciqual_aliments' and c.relkind = 'r') then
    alter table public.ciqual_aliments rename to aliments_base;
  end if;
end $$;
do $$ declare r record; begin
  if to_regclass('public.aliments_base') is not null then
    execute 'alter table public.aliments_base enable row level security';
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'aliments_base' loop
      execute format('drop policy %I on public.aliments_base', r.policyname);
    end loop;
    execute 'create policy "base lecture" on public.aliments_base for select to anon, authenticated using (true)';
    execute 'create policy "base admin" on public.aliments_base for all to authenticated '
         || 'using (public.est_admin()) with check (public.est_admin())';
    -- Ancien nom gardé en lecture seule, le temps que tous les téléphones
    -- aient la nouvelle version de l'appli (mêmes droits que la table).
    if to_regclass('public.ciqual_aliments') is null then
      execute 'create view public.ciqual_aliments with (security_invoker = true) as select * from public.aliments_base';
      execute 'grant select on public.ciqual_aliments to anon, authenticated';
    end if;
  end if;
end $$;

-- 9) Journal des actions des utilisateurs (aliments, recettes, exercices
--    personnalisés). Écrit uniquement par le serveur (déclencheurs) :
--    l'appli ne peut ni y écrire ni le falsifier. Lisible par l'admin seul.
create table if not exists public.journal_utilisateurs (
  id            bigserial primary key,
  fait_le       timestamptz not null default now(),
  utilisateur   text,
  email         text,
  action        text not null,
  cible_id      text,
  cible_libelle text,
  detail        jsonb
);
create index if not exists journal_utilisateurs_date on public.journal_utilisateurs (fait_le desc);
alter table public.journal_utilisateurs enable row level security;
drop policy if exists "journal utilisateurs admin" on public.journal_utilisateurs;
create policy "journal utilisateurs admin" on public.journal_utilisateurs for select to authenticated
  using (public.est_admin());

create or replace function public.journaliser_utilisateur()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := auth.jwt() ->> 'email';
  v_uid   text := auth.uid()::text;
  v_ligne jsonb;
  v_avant jsonb;
  v_action text;
begin
  -- Les actions de l'admin sont déjà dans son propre journal.
  if v_uid is null or public.est_admin() then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'aliments_partages' then
    if tg_op <> 'INSERT' then return new; end if;
    insert into journal_utilisateurs (utilisateur, email, action, cible_id, cible_libelle, detail)
    values (v_uid, v_email, 'u_aliment_cree', (to_jsonb(new) ->> 'id'), new.nom,
            jsonb_build_object('kcal100', new.kcal100, 'p100', new.p100, 'c100', new.c100, 'f100', new.f100,
                               'code_barre', nullif(new.code_barre, '')));
    return new;
  end if;
  -- recettes_perso / exercices_perso_musculation (même schéma)
  v_ligne := case when tg_op = 'DELETE' then old.donnees else new.donnees end;
  if tg_op = 'UPDATE' then
    v_avant := old.donnees;
    -- Une synchro qui renvoie la même chose n'est pas une action.
    if (old.donnees - 'maj' - 'partagee') = (new.donnees - 'maj' - 'partagee') then return new; end if;
  end if;
  v_action := (case when tg_table_name = 'recettes_perso' then 'u_recette_' else 'u_exercice_' end)
           || (case tg_op when 'INSERT' then 'creee' when 'UPDATE' then 'modifiee' else 'supprimee' end);
  insert into journal_utilisateurs (utilisateur, email, action, cible_id, cible_libelle, detail)
  values (v_uid, v_email, v_action, coalesce(new.id, old.id), v_ligne ->> 'nom',
          case
            when tg_table_name = 'recettes_perso' then
              jsonb_strip_nulls(jsonb_build_object(
                'avant', case when v_avant is not null then jsonb_build_object('nom', v_avant -> 'nom', 'portions', v_avant -> 'portions', 'ingredients', v_avant -> 'ingredients') end,
                'apres', case when tg_op <> 'DELETE' then jsonb_build_object('nom', v_ligne -> 'nom', 'portions', v_ligne -> 'portions', 'ingredients', v_ligne -> 'ingredients') end,
                'ingredients', case when tg_op = 'DELETE' then v_ligne -> 'ingredients' end))
            else
              jsonb_strip_nulls(jsonb_build_object(
                'avant', case when v_avant is not null then jsonb_build_object('nom', v_avant -> 'nom', 'groupe', v_avant -> 'groupe', 'materiel', v_avant -> 'materiel') end,
                'apres', case when tg_op <> 'DELETE' then jsonb_build_object('nom', v_ligne -> 'nom', 'groupe', v_ligne -> 'groupe', 'materiel', v_ligne -> 'materiel') end))
          end);
  return coalesce(new, old);
end;
$fn$;
drop trigger if exists journal_aliments_partages on public.aliments_partages;
create trigger journal_aliments_partages after insert on public.aliments_partages
  for each row execute function public.journaliser_utilisateur();
drop trigger if exists journal_recettes on public.recettes_perso;
create trigger journal_recettes after insert or update or delete on public.recettes_perso
  for each row execute function public.journaliser_utilisateur();
drop trigger if exists journal_exercices_perso on public.exercices_perso_musculation;
create trigger journal_exercices_perso after insert or update or delete on public.exercices_perso_musculation
  for each row execute function public.journaliser_utilisateur();
