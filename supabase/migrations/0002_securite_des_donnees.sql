-- 0002_securite_des_donnees — généré depuis index.html par scripts/exporter-sql.mjs ; ne pas modifier à la main.
-- À exécuter UNE FOIS que toi et l'autre personne avez chacun créé un
-- compte (bouton <svg class="icone-ui" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> <svg class="icone-ui" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg> Créer un compte). Idempotent : relancer ne casse rien.
-- Avant ça, les tables sont fermées (le script 1 ne crée plus de règle) ;
-- après, chaque compte ne peut lire/écrire que les lignes où
-- utilisateur = son propre auth.uid() — sauf le compte administrateur
-- (jambou592@gmail.com), qui voit et gère tout.

-- Comptes suspendus/supprimés : une table à part que seul l'administrateur
-- peut lire ou modifier. Un compte "supprimé" ici garde ses données dans
-- Supabase (utilisateur, journees, profil ne sont jamais touchés) : c'est un
-- blocage d'accès, pas un vrai effacement — la vraie suppression du compte
-- lui-même (identifiants de connexion) demanderait une clé d'administration
-- Supabase qu'on ne met jamais dans le code de l'appli, pour éviter que
-- n'importe qui puisse supprimer n'importe quel compte.
create table if not exists public.comptes_bloques (
  utilisateur text primary key,
  type text not null check (type in ('suspendu','supprime')),
  bloque_le timestamptz not null default now()
);
alter table comptes_bloques enable row level security;
drop policy if exists "admin gere blocages" on comptes_bloques;
create policy "admin gere blocages" on comptes_bloques
  for all
  using (auth.jwt() ->> 'email' = 'jambou592@gmail.com')
  with check (auth.jwt() ->> 'email' = 'jambou592@gmail.com');

-- Utilisée à l'intérieur des policies ci-dessous : un compte bloqué perd
-- l'accès à SES PROPRES lignes, même si utilisateur = auth.uid().
create or replace function public.est_bloque(p_utilisateur text)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from comptes_bloques where utilisateur = p_utilisateur);
$$;
-- Les règles ci-dessous l'appellent avec les droits du compte connecté
-- (une règle s'évalue comme l'appelant, SECURITY DEFINER ne joue qu'à
-- l'intérieur) : elle doit donc rester exécutable par « authenticated »,
-- sinon plus personne ne lit ses propres lignes (vérifié par tests/sql.test.js).
-- Portée : dire si un identifiant (UUID, non devinable) est bloqué.
grant execute on function public.est_bloque(text) to authenticated;

-- Utilisée par l'appli juste après la connexion, pour reconnaître SON PROPRE
-- statut et se déconnecter immédiatement avec un message clair si bloqué.
create or replace function public.mon_statut_compte()
returns text language sql security definer set search_path = public as $$
  select type from comptes_bloques where utilisateur = auth.uid()::text;
$$;
grant execute on function public.mon_statut_compte() to authenticated;

-- Un jeton de connexion déjà émis avant un "Effacer définitivement" reste
-- valable jusqu'à son expiration naturelle (Supabase ne peut pas révoquer
-- un jeton déjà distribué) : sans cette vérification, un appareil resté
-- connecté pouvait continuer à écrire — recréant en douce un compte que
-- l'admin venait pourtant d'effacer (un "compte fantôme", sans email car
-- déjà absent de auth.users). Utilisée dans les policies ci-dessous, elle
-- confirme que le compte existe encore réellement avant d'autoriser quoi
-- que ce soit.
create or replace function public.mon_compte_existe()
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from auth.users where id = auth.uid());
$$;
grant execute on function public.mon_compte_existe() to authenticated;

drop policy if exists "acces journees" on journees;
drop policy if exists "journees par compte" on journees;
create policy "journees par compte" on journees
  for all
  using ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com')
  with check ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com');

drop policy if exists "acces profil" on profil;
drop policy if exists "profil par compte" on profil;
create policy "profil par compte" on profil
  for all
  using ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com')
  with check ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com');

drop policy if exists "acces programmes_musculation" on programmes_musculation;
drop policy if exists "programmes_musculation par compte" on programmes_musculation;
create policy "programmes_musculation par compte" on programmes_musculation
  for all
  using ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com')
  with check ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com');

drop policy if exists "acces seances_musculation" on seances_musculation;
drop policy if exists "seances_musculation par compte" on seances_musculation;
create policy "seances_musculation par compte" on seances_musculation
  for all
  using ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com')
  with check ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com');

drop policy if exists "acces exercices_perso_musculation" on exercices_perso_musculation;
drop policy if exists "exercices_perso_musculation par compte" on exercices_perso_musculation;
create policy "exercices_perso_musculation par compte" on exercices_perso_musculation
  for all
  using ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com')
  with check ((utilisateur = auth.uid()::text and not est_bloque(utilisateur) and mon_compte_existe()) or auth.jwt() ->> 'email' = 'jambou592@gmail.com');

-- Important : ces policies exigent d'être connecté (auth.uid() non nul).
-- Si l'un de vous continue à utiliser l'identifiant libre sans jamais se
-- connecter, ses lectures/écritures échoueront après ce script — dans ce
-- cas, gardez plutôt les policies par défaut ("using (true)") tant que
-- vous n'avez pas tous les deux un compte actif.

-- Fonction dédiée au panneau Administration : la table auth.users (qui
-- contient les emails) n'est normalement pas interrogeable directement par
-- l'appli, même connectée — c'est une protection de Supabase. Cette
-- fonction y accède à sa place, mais vérifie elle-même que l'appelant est
-- bien jambou592@gmail.com avant de renvoyer quoi que ce soit : n'importe
-- qui d'autre qui l'appellerait recevrait une erreur, jamais de données.
-- drop d'abord : le type de retour a changé (la colonne gemini_key a été
-- retirée : l'administration ne lit ni ne distribue plus aucune clé d'IA), ce
-- que "create or replace" refuse de faire seul sur une fonction existante.
drop function if exists public.admin_liste_comptes();

create or replace function public.admin_liste_comptes()
returns table (
  utilisateur text, email text, cree_le timestamptz, derniere_connexion timestamptz,
  age int, taille numeric, poids numeric, genre text, nb_journees bigint, maj bigint, statut text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'jambou592@gmail.com' then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  return query
    select
      p.utilisateur::text,
      u.email::text,
      u.created_at::timestamptz,
      u.last_sign_in_at::timestamptz,
      (p.donnees->>'age')::int,
      (p.donnees->>'height')::numeric,
      (p.donnees->>'weight')::numeric,
      (p.donnees->>'gender')::text,
      (select count(*) from journees j where j.utilisateur = p.utilisateur)::bigint,
      p.maj::bigint,
      cb.type::text
    from profil p
    left join auth.users u on u.id::text = p.utilisateur
    left join comptes_bloques cb on cb.utilisateur = p.utilisateur;
end;
$$;

grant execute on function public.admin_liste_comptes() to authenticated;

-- Suspendre / réactiver / marquer supprimé (garde les données). Passer
-- p_type à NULL réactive le compte (retire tout blocage).
create or replace function public.admin_definir_blocage(p_utilisateur text, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'jambou592@gmail.com' then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  if p_type is null then
    delete from comptes_bloques where utilisateur = p_utilisateur;
  else
    insert into comptes_bloques (utilisateur, type) values (p_utilisateur, p_type)
      on conflict (utilisateur) do update set type = excluded.type, bloque_le = now();
  end if;
end;
$$;
grant execute on function public.admin_definir_blocage(text, text) to authenticated;

-- Rattache les journées/profil/musculation d'un compte "supprimé" à un
-- autre compte (le sien à nouveau après recréation, ou celui de quelqu'un
-- d'autre). Fonctionne seulement si le compte cible n'a pas déjà ses
-- propres données aux mêmes clés (mêmes dates pour les journées, mêmes
-- identifiants pour la musculation) — sans quoi il faudrait choisir
-- laquelle garder, ce que cette fonction ne décide pas à ta place.
-- Tout est rattaché ensemble ou rien ne l'est : la moindre collision sur
-- l'une des quatre tables annule le rattachement dans son ensemble (voir
-- les blocs begin/exception ci-dessous, chacun dans sa propre
-- sous-transaction PL/pgSQL).
create or replace function public.admin_rattacher_donnees(p_ancien text, p_nouveau text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'jambou592@gmail.com' then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  begin
    update journees set utilisateur = p_nouveau where utilisateur = p_ancien;
  exception when unique_violation then
    raise exception 'Le compte cible a déjà des journées enregistrées aux mêmes dates : rattachement impossible sans écraser des données.';
  end;
  begin
    update programmes_musculation set utilisateur = p_nouveau where utilisateur = p_ancien;
  exception when unique_violation then
    raise exception 'Le compte cible a déjà des programmes de musculation avec les mêmes identifiants : rattachement impossible sans écraser des données.';
  end;
  begin
    update seances_musculation set utilisateur = p_nouveau where utilisateur = p_ancien;
  exception when unique_violation then
    raise exception 'Le compte cible a déjà des séances de musculation avec les mêmes identifiants : rattachement impossible sans écraser des données.';
  end;
  begin
    update exercices_perso_musculation set utilisateur = p_nouveau where utilisateur = p_ancien;
  exception when unique_violation then
    raise exception 'Le compte cible a déjà des exercices de musculation personnalisés avec les mêmes identifiants : rattachement impossible sans écraser des données.';
  end;
  if not exists (select 1 from profil where utilisateur = p_nouveau) then
    update profil set utilisateur = p_nouveau where utilisateur = p_ancien;
  else
    delete from profil where utilisateur = p_ancien;
  end if;
  delete from comptes_bloques where utilisateur = p_ancien;
end;
$$;
grant execute on function public.admin_rattacher_donnees(text, text) to authenticated;

-- Plus de clé d'IA distribuée par l'administration : la fonction qui écrivait
-- une clé Gemini dans le profil d'un compte est supprimée (cette clé partait
-- ensuite en clair depuis l'appareil, où n'importe qui pouvait la lire). L'IA
-- passe par la fonction serveur « ia » ; une clé personnelle reste possible
-- dans les réglages du compte. Pour retirer une clé posée par l'administration
-- sur un compte donné (jamais en masse sans l'accord de la personne) :
--   update profil set donnees = donnees - 'geminiKey' where utilisateur = '<identifiant>';
drop function if exists public.admin_definir_cle_gemini(text, text);

-- Efface VRAIMENT un compte : ses données ET son compte d'authentification
-- (auth.users), contrairement à "Supprimer" (admin_definir_blocage), qui ne
-- fait que bloquer l'accès en gardant tout. Après ceci, la personne ne peut
-- plus se reconnecter avec ses anciens identifiants, et l'adresse redevient
-- libre pour un nouveau compte. SECURITY DEFINER : contourne les policies
-- RLS plutôt que d'en dépendre (le bouton "Effacer définitivement" échouait
-- silencieusement si la policy admin n'était pas exactement à jour côté
-- client), et permet de toucher à auth.users sans jamais exposer de clé
-- d'administration Supabase dans le code de l'application.
create or replace function public.admin_effacer_definitivement(p_utilisateur text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'jambou592@gmail.com' then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  delete from journees where utilisateur = p_utilisateur;
  delete from programmes_musculation where utilisateur = p_utilisateur;
  delete from seances_musculation where utilisateur = p_utilisateur;
  delete from exercices_perso_musculation where utilisateur = p_utilisateur;
  delete from profil where utilisateur = p_utilisateur;
  delete from comptes_bloques where utilisateur = p_utilisateur;
  delete from auth.users where id::text = p_utilisateur;
end;
$$;
grant execute on function public.admin_effacer_definitivement(text) to authenticated;

-- Contrôle : combien de règles ouvertes à tous (using (true) ou with check
-- (true)) restent sur les cinq tables de données ? Doit valoir 0. Réservé à
-- l'administrateur ; l'écran Administration l'affiche en rouge sinon.
create or replace function public.admin_regles_ouvertes()
returns integer language sql stable security definer set search_path = public as $$
  select case when coalesce(auth.jwt() ->> 'email', '') = 'jambou592@gmail.com'
    then (select count(*)::int from pg_policies
          where schemaname = 'public'
            and tablename in ('journees', 'profil', 'programmes_musculation', 'seances_musculation', 'exercices_perso_musculation')
            and (qual = 'true' or with_check = 'true'))
    else null end;
$$;
revoke execute on function public.admin_regles_ouvertes() from public, anon;
grant execute on function public.admin_regles_ouvertes() to authenticated;
