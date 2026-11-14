-- Le Baron : les Titres de propriété (« cadastre ») + la Loterie du village (15 nov. 2026)
-- Cadastre (Port, Aérodrome) : le patron annonce le prix de son lieu ; n'importe qui peut le racheter à ce prix.
-- Impôt foncier : 2 % par jour du prix le plus haut annoncé sur la journée, versé au Baron avec le Tribut.
-- Un seul lieu du cadastre par joueur ; le Baron (qui tient la Roulette) ne peut pas racheter.
-- Après un rachat (ou au lancement), le lieu est protégé un moment.
-- Loterie : plus de patron, tout le ticket va dans la cagnotte ; fin du faux bug.

alter table baron2_port add column if not exists price numeric not null default 10000000000000,
                       add column if not exists price_max numeric not null default 10000000000000,
                       add column if not exists safe_until timestamptz;
alter table baron2_fly  add column if not exists price numeric not null default 10000000000000,
                       add column if not exists price_max numeric not null default 10000000000000,
                       add column if not exists safe_until timestamptz;
-- pas à vendre tant que le patron n'a pas fixé son prix une première fois (et pas d'impôt non plus)
alter table baron2_port add column if not exists priced boolean not null default false;
alter table baron2_fly  add column if not exists priced boolean not null default false;

create or replace function public.baron2_cad_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'port', (select jsonb_build_object('owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = x.owner_id),
              'price', x.price, 'priced', x.priced, 'tax', floor(x.price_max * 0.02), 'safe', x.safe_until) from baron2_port x where id = 1),
    'fly',  (select jsonb_build_object('owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = x.owner_id),
              'price', x.price, 'priced', x.priced, 'tax', floor(x.price_max * 0.02), 'safe', x.safe_until) from baron2_fly x where id = 1),
    'baron', _baron2_top(), 'now', now());
$$;

create or replace function public.baron2_cad_set(p_token uuid, p_place text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); pr numeric := floor(coalesce(p_price, 0));
begin
  if pr < 1e9 or pr > 1e18 then raise exception 'prix invalide'; end if;
  if p_place = 'port' then
    if (select owner_id from baron2_port where id = 1) is distinct from v then raise exception 'pas ton lieu'; end if;
    update baron2_port set price = pr, price_max = case when priced then greatest(price_max, pr) else pr end, priced = true where id = 1;
  elsif p_place = 'fly' then
    if (select owner_id from baron2_fly where id = 1) is distinct from v then raise exception 'pas ton lieu'; end if;
    update baron2_fly set price = pr, price_max = case when priced then greatest(price_max, pr) else pr end, priced = true where id = 1;
  else raise exception 'lieu inconnu'; end if;
  return baron2_cad_get();
end $$;

-- le client a déjà retiré p_price de ses pièces ; si le prix a changé entre-temps, on refuse
create or replace function public.baron2_cad_buy(p_token uuid, p_state jsonb, p_place text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); own text; pr numeric; safe timestamptz; nm text; lbl text; ok boolean;
begin
  if p_place = 'port' then select owner_id, price, safe_until, priced into own, pr, safe, ok from baron2_port where id = 1 for update; lbl := 'Port';
  elsif p_place = 'fly' then select owner_id, price, safe_until, priced into own, pr, safe, ok from baron2_fly where id = 1 for update; lbl := 'Aérodrome';
  else raise exception 'lieu inconnu'; end if;
  if own = v then raise exception 'déjà à toi'; end if;
  if own is not null and not ok then raise exception 'pas à vendre'; end if;
  if v = _baron2_top() then raise exception 'tu es le baron'; end if;
  if v in (select owner_id from baron2_port where owner_id is not null union select owner_id from baron2_fly where owner_id is not null) then raise exception 'déjà un lieu'; end if;
  if safe is not null and safe > now() then raise exception 'protégé'; end if;
  if pr is distinct from floor(coalesce(p_price, -1)) then raise exception 'prix changé'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  if own is not null then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (own, pr, 'cad_sale', 0, nm || '|' || lbl);
  end if;
  if p_place = 'port' then
    update baron2_port set prev_id = owner_id, owner_id = v, heir_id = null, since = now(), safe_until = now() + interval '30 minutes', price_max = price, priced = true, cfg_at = null where id = 1;
  else
    update baron2_fly set prev_id = owner_id, owner_id = v, heir_id = null, since = now(), safe_until = now() + interval '30 minutes', price_max = price, priced = true, cfg_at = null where id = 1;
  end if;
  return baron2_cad_get() || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;
grant execute on function public.baron2_cad_get(), public.baron2_cad_set(uuid, text, numeric), public.baron2_cad_buy(uuid, jsonb, text, numeric) to anon, authenticated;

-- Tribut + impôt foncier, chaque matin à 8 h
create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0; top text := _baron2_top();
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Port' place, owner_id pid, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product in ('port_fee', 'port_ins') and at > now() - interval '24 hours'), 0)) inc from baron2_port p
    union all select 'Envol', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product in ('fly_fee', 'fly_bank') and at > now() - interval '24 hours'), 0)) from baron2_fly f
    union all select 'Œufs', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = m.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0) from baron2_eggmaster m
  loop
    if r.pid is null or r.pid = top then continue; end if;
    amt := floor(0.20 * greatest(0, r.inc));
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'charge', 0, r.place);
    insert into baron2_charges(day, player_id, place, income, amount) values (d, r.pid, r.place, r.inc, amt);
    tot := tot + amt;
  end loop;
  for r in
    select 'Port' place, owner_id pid, price_max pm from baron2_port where id = 1 and priced
    union all select 'Aérodrome', owner_id, price_max from baron2_fly where id = 1 and priced
  loop
    if r.pid is null or r.pid = top then continue; end if;
    amt := floor(0.02 * r.pm);
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'cad_tax', 0, r.place);
    tot := tot + amt;
  end loop;
  update baron2_port set price_max = price where id = 1;
  update baron2_fly set price_max = price where id = 1;
  if top is not null and tot > 0 then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (top, tot, 'tribut', 0, 'Tribut');
  end if;
end $$;

-- ---------- Loterie du village ----------
update baron2_lotto set owner_id = null, heir_id = null, fee = 0, ticket = 5000000000, every_h = 2 where id = 1;
insert into baron2_credits(player_id, coins, product, qty, buyer)
  select id, 0, 'notice', 0, '🎟️ La Loterie appartient désormais au village : plus besoin de patron. Merci de l''avoir tenue ! Tu recevras bientôt un autre lieu.'
  from baron2_players where name = 'laure';

create or replace function public.baron2_lotto_buy(p_token uuid, p_state jsonb, p_picks jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_lotto; nm text; pk jsonb; x int; y int; n int; have int;
begin
  perform _baron2_lotto_settle();
  select * into L from baron2_lotto where id = 1 for update;
  if p_picks is null or jsonb_typeof(p_picks) <> 'array' then raise exception 'ticket invalide'; end if;
  n := jsonb_array_length(p_picks);
  select count(*) into have from baron2_lotto_tickets where draw_at = L.draw_at and player_id = v;
  if n < 1 or have + n > 25 then raise exception 'tickets max'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  for pk in select * from jsonb_array_elements(p_picks) loop
    x := (pk->>0)::int; y := (pk->>1)::int;
    if x is null or y is null or x = y or least(x, y) < 1 or greatest(x, y) > 8 then raise exception 'ticket invalide'; end if;
    insert into baron2_lotto_tickets(draw_at, player_id, name, a, b) values (L.draw_at, v, nm, least(x, y), greatest(x, y));
  end loop;
  update baron2_lotto set jackpot = jackpot + n * L.ticket where id = 1;
  return baron2_lotto_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

create or replace function public.baron2_lotto_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_lotto;
begin
  perform _baron2_lotto_settle();
  select * into L from baron2_lotto where id = 1;
  return jsonb_build_object(
    'owner', null, 'heir', null, 'prev', null, 'since', L.since, 'prank', false,
    'jackpot', L.jackpot, 'ticket', L.ticket, 'draw_at', L.draw_at,
    'fee', 0, 'every', L.every_h, 'cfg_at', L.cfg_at,
    'count', (select count(*) from baron2_lotto_tickets where draw_at = L.draw_at),
    'mine', coalesce((select jsonb_agg(jsonb_build_array(a, b) order by id) from baron2_lotto_tickets where draw_at = L.draw_at and player_id = v), '[]'),
    'last', (select jsonb_build_object('a', a, 'b', b, 'jackpot', jackpot, 'tickets', tickets, 'winners', winners, 'at', draw_at) from baron2_lotto_draws order by id desc limit 1),
    'fees', 0, 'now', now());
end $$;
