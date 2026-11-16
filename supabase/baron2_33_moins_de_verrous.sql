-- Le Baron : moins de verrous (16 nov. 2026) — EN LIGNE
-- Vers 10 h 10, la base a saturé (attentes en file sur les sauvegardes) : le grand choix et les charges verrouillaient
-- une ligne à CHAQUE sauvegarde. Désormais on lit sans verrou et on ne verrouille que s'il y a vraiment quelque chose à faire.
-- (Contenu appliqué en ligne : voir les définitions de _baron2_choix_settle et _baron2_charges dans Supabase,
--  identiques à baron2_30 sauf la lecture sans verrou au début.)

create or replace function public._baron2_choix_settle() returns void
language plpgsql security definer set search_path = public as $$
declare C baron2_choix; x text;
begin
  -- lecture sans verrou : dans le cas courant il n'y a rien à faire (pas d'attente pour les sauvegardes)
  select * into C from baron2_choix where id = 1;
  if C.id is null or C.status = 'fait' then return; end if;
  if C.status = 'avant' and now() < C.opens_at then return; end if;
  if C.status = 'voeux' and (select count(*) from baron2_choix_voeux) < (select count(*) from baron2_players) then return; end if;
  -- il y a quelque chose à faire : on verrouille sans attendre (un autre appel s'en occupe déjà sinon)
  select * into C from baron2_choix where id = 1 for update skip locked;
  if C.id is null or C.status = 'fait' then return; end if;
  if C.status = 'avant' then
    if now() < C.opens_at then return; end if;
    update baron2_choix set status = 'voeux' where id = 1;
    for x in select unnest(_baron2_lieux()) loop perform _baron2_lieu_set(x, null); end loop;
    insert into baron2_credits(player_id, coins, product, qty, buyer)
      select id, 0, 'choix_go', 0, '' from baron2_players;
    return;
  end if;
  if (select count(*) from baron2_choix_voeux) >= (select count(*) from baron2_players) then perform _baron2_choix_draw(); end if;
end $$;
revoke all on function public._baron2_choix_settle() from public, anon, authenticated;
