-- Le Baron : le Port sans patron (16 nov. 2026) — EN LIGNE
-- Le grand choix laisse les lieux sans patron : le Port ne doit plus désigner d'office le joueur le plus pauvre
-- quand il n'a pas de patron (seulement si son patron ne joue plus depuis 24 h, comme l'Aérodrome).
create or replace function public._baron2_port_check() returns void
language plpgsql security definer set search_path = public as $$
declare pt baron2_port; nxt text;
begin
  select * into pt from baron2_port where id = 1 for update;
  -- sans patron (grand choix, ou personne) : on n'en désigne pas d'office
  if pt.owner_id is null then return; end if;
  if (select updated_at from baron2_players where id = pt.owner_id) > now() - interval '24 hours' then return; end if;
  nxt := (select id from baron2_players where id = pt.heir_id and id is distinct from pt.owner_id and updated_at > now() - interval '24 hours');
  if nxt is null then
    nxt := (select f.id from _baron2_fortunes() f join baron2_players p on p.id = f.id
            where f.id is distinct from pt.owner_id and p.updated_at > now() - interval '24 hours' order by f.fortune limit 1);
  end if;
  if nxt is null then return; end if;
  update baron2_port set prev_id = owner_id, owner_id = nxt, heir_id = null, since = now() where id = 1;
end $$;
update baron2_port set owner_id = null, prev_id = null, since = now() where id = 1 and (select status from baron2_choix where id = 1) = 'voeux';
