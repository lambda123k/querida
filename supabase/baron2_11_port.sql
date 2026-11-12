-- =====================================================================
-- Le Baron · le Port (12 nov. 2026)
-- Un joueur possède le Port : Hugo au départ. Le capitaine choisit un héritier ; s'il ne joue pas
-- pendant 24 h d'affilée, le port passe à son héritier (à défaut : au dernier du classement parmi
-- ceux qui jouent). Il peut aussi céder le port à qui il veut, quand il veut.
-- Il l'ouvre ou le ferme, l'améliore, et prend 10 % sur chaque cargaison des autres.
-- Les joueurs y envoient une partie de leur stock à l'étranger : payé 1,6× le cours du village
-- au départ, sans faire baisser le cours, mais après un voyage de quelques heures, et une tempête
-- peut tout couler (le propriétaire ne touche alors rien).
-- Les bateaux rentrés sont réglés à chaque sauvegarde de n'importe qui (via _baron2_credits).
-- =====================================================================

create table if not exists public.baron2_port (
  id       int primary key default 1 check (id = 1),
  owner_id text,
  open     boolean not null default false,
  lvl      int not null default 1,
  heir_id  text,
  prev_id  text,              -- l'ancien capitaine (pour l'annonce)
  since    timestamptz not null default now(),
  at       timestamptz not null default now()
);
insert into public.baron2_port(id, owner_id) select 1, (select id from baron2_players where name = 'Hugo' limit 1) on conflict do nothing;

-- change de capitaine si celui-ci n'a pas joué depuis 24 h
create or replace function public._baron2_port_check() returns void
language plpgsql security definer set search_path = public as $$
declare pt baron2_port; nxt text;
begin
  select * into pt from baron2_port where id = 1 for update;
  if pt.owner_id is not null and (select updated_at from baron2_players where id = pt.owner_id) > now() - interval '24 hours' then return; end if;
  nxt := (select id from baron2_players where id = pt.heir_id and id is distinct from pt.owner_id and updated_at > now() - interval '24 hours');
  if nxt is null then
    nxt := (select f.id from _baron2_fortunes() f join baron2_players p on p.id = f.id
            where f.id is distinct from pt.owner_id and p.updated_at > now() - interval '24 hours' order by f.fortune limit 1);
  end if;
  if nxt is null then return; end if;
  update baron2_port set prev_id = owner_id, owner_id = nxt, heir_id = null, since = now() where id = 1;
end $$;

create table if not exists public.baron2_ships (
  id        bigint generated always as identity primary key,
  player_id text not null,
  name      text not null,
  owner_id  text,
  product   text not null,
  qty       numeric not null,
  value     numeric not null,   -- ce que paie l'étranger (brut)
  fee       numeric not null,   -- la part du port
  storm     boolean not null,   -- tiré au départ, révélé à l'arrivée
  depart    timestamptz not null default now(),
  arrive    timestamptz not null,
  settled   boolean not null default false
);
create index if not exists baron2_ships_open on public.baron2_ships (settled, arrive);
alter table public.baron2_port enable row level security;
alter table public.baron2_ships enable row level security;

-- réglages par niveau (1 à 5) : bateaux, durée (h), risque de tempête, cale (part de la grange), prix du niveau suivant
create or replace function public._baron2_port_cfg(l int) returns jsonb
language sql immutable as $$
  select (array[
    '{"ships":10,"hours":1,   "storm":0.15,"hold":0.10,"next":30e9}',
    '{"ships":11,"hours":0.9, "storm":0.12,"hold":0.14,"next":90e9}',
    '{"ships":12,"hours":0.8, "storm":0.10,"hold":0.18,"next":250e9}',
    '{"ships":13,"hours":0.7, "storm":0.07,"hold":0.24,"next":600e9}',
    '{"ships":14,"hours":0.6, "storm":0.05,"hold":0.30,"next":null}'
  ])[greatest(1, least(5, l))]::jsonb;
$$;

create or replace function public._baron2_port_settle() returns void
language plpgsql security definer set search_path = public as $$
declare sh record;
begin
  for sh in update baron2_ships set settled = true where not settled and arrive <= now() returning * loop
    if sh.storm then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (sh.player_id, 0, 'port_storm', sh.qty, sh.product);
    else
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (sh.player_id, sh.value - sh.fee, 'port_back', sh.qty, sh.product);
      if sh.fee > 0 and sh.owner_id is not null then
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (sh.owner_id, sh.fee, 'port_fee', sh.qty, sh.name);
      end if;
    end if;
  end loop;
end $$;

-- les crédits règlent d'abord les bateaux arrivés (appelé par load, save, casino…)
create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_port_settle();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer) order by id), '[]'::jsonb)
          from (select * from baron2_credits
                where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
                order by id limit 300) c);
end $$;
revoke all on function public._baron2_credits(text, jsonb) from public, anon, authenticated;

create or replace function public.baron2_port_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt baron2_port;
begin
  perform _baron2_port_settle();
  perform _baron2_port_check();
  select * into pt from baron2_port where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.owner_id),
    'heir', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.heir_id),
    'prev', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.prev_id),
    'since', pt.since,
    'seen', (select updated_at from baron2_players where id = pt.owner_id),
    'open', pt.open, 'lvl', pt.lvl, 'cfg', _baron2_port_cfg(pt.lvl),
    'sea', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty, 'value', value - fee, 'depart', depart, 'arrive', arrive) order by arrive)
              from baron2_ships where not settled), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty, 'value', value - fee, 'storm', storm, 'at', arrive) order by arrive desc)
              from (select * from baron2_ships where settled order by arrive desc limit 15) s), '[]'::jsonb),
    'fees', coalesce((select sum(fee) from baron2_ships where settled and not storm and owner_id = pt.owner_id and arrive > now() - interval '24 hours'), 0),
    'now', now());
end $$;

create or replace function public.baron2_port_set(p_token uuid, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_port where id = 1) is distinct from v then raise exception 'pas le capitaine'; end if;
  update baron2_port set open = coalesce(p_open, false), at = now() where id = 1;
  return baron2_port_get();
end $$;

create or replace function public.baron2_port_heir(p_token uuid, p_heir text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_port where id = 1) is distinct from v then raise exception 'pas le capitaine'; end if;
  if p_heir is not null and (p_heir = v or not exists(select 1 from baron2_players where id = p_heir)) then raise exception 'héritier invalide'; end if;
  update baron2_port set heir_id = p_heir where id = 1;
  return baron2_port_get();
end $$;

create or replace function public.baron2_port_give(p_token uuid, p_to text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_port where id = 1) is distinct from v then raise exception 'pas le capitaine'; end if;
  if p_to is null or p_to = v or not exists(select 1 from baron2_players where id = p_to) then raise exception 'joueur invalide'; end if;
  update baron2_port set prev_id = owner_id, owner_id = p_to, heir_id = null, since = now() where id = 1;
  return baron2_port_get();
end $$;

-- p_state : la ferme, prix du niveau déjà retiré des pièces
create or replace function public.baron2_port_up(p_token uuid, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); pt baron2_port;
begin
  select * into pt from baron2_port where id = 1 for update;
  if pt.owner_id is distinct from v then raise exception 'pas le capitaine'; end if;
  if pt.lvl >= 5 then raise exception 'port au maximum'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  update baron2_port set lvl = lvl + 1 where id = 1;
  return baron2_port_get() || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- p_state : la ferme, cargaison déjà retirée de la grange ; p_unit : le cours du village au départ
create or replace function public.baron2_port_send(p_token uuid, p_state jsonb, p_product text, p_qty numeric, p_unit numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); pt baron2_port; c jsonb; nm text; q numeric := floor(p_qty); val numeric; fee numeric; hold numeric;
begin
  select * into pt from baron2_port where id = 1 for update;
  if pt.owner_id is null then raise exception 'pas de capitaine'; end if;
  if not pt.open then raise exception 'port fermé'; end if;
  c := _baron2_port_cfg(pt.lvl);
  if (select count(*) from baron2_ships where not settled) >= (c->>'ships')::int then raise exception 'plus de bateau'; end if;
  if p_product !~ '^[a-z]{2,16}$' or q < 1 or coalesce(p_unit, 0) <= 0 then raise exception 'cargaison invalide'; end if;
  hold := floor((c->>'hold')::numeric * 400 * power(2.6, coalesce((p_state->>'barn')::int, 1) - 1));
  if q > hold + 1 then raise exception 'cale trop petite'; end if;
  if coalesce((p_state->'stock'->>p_product)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  val := floor(q * p_unit * 1.6);
  fee := case when pt.owner_id = v then 0 else floor(val * 0.10) end;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_ships(player_id, name, owner_id, product, qty, value, fee, storm, arrive)
    values (v, nm, pt.owner_id, p_product, q, val, fee, random() < (c->>'storm')::numeric,
            now() + make_interval(secs => (c->>'hours')::numeric * 3600));
  return baron2_port_get() || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

revoke all on function public._baron2_port_settle() from public, anon, authenticated;
revoke all on function public._baron2_port_check() from public, anon, authenticated;
grant execute on function public.baron2_port_heir(uuid, text) to anon, authenticated;
grant execute on function public.baron2_port_give(uuid, text) to anon, authenticated;
grant execute on function public.baron2_port_get() to anon, authenticated;
grant execute on function public.baron2_port_set(uuid, boolean) to anon, authenticated;
grant execute on function public.baron2_port_up(uuid, jsonb) to anon, authenticated;
grant execute on function public.baron2_port_send(uuid, jsonb, text, numeric, numeric) to anon, authenticated;
