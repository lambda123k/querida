-- Le Baron : rééquilibrage des lieux (14 nov. 2026)
-- Aérodrome : le patron devient la banque (encaisse les mises perdues, paie les gains) + mise max réglable.
-- Loterie : 25 tickets par tirage, tickets jusqu'à 1 T, cagnotte de départ = 10 tickets.
-- Charges : 20 % de ce que le lieu rapporte, sans minimum.
alter table baron2_fly add column if not exists max_bet numeric;

create or replace function public._baron2_fly_settle() returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  for f in update baron2_flights set settled = true
           where not settled and cashed is null and start + make_interval(secs => _baron2_fly_t(crash)) < now() returning * loop
    if f.owner_id is not null and f.owner_id <> f.player_id then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (f.owner_id, f.stake, 'fly_fee', 1, f.name);
    end if;
  end loop;
end $$;

create or replace function public.baron2_fly_cash(p_token uuid, p_state jsonb, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); f baron2_flights; m numeric; win numeric;
begin
  perform _baron2_fly_settle();
  select * into f from baron2_flights where id = p_id and player_id = v for update;
  if f.id is null then raise exception 'vol inconnu'; end if;
  if f.settled then return jsonb_build_object('state', case when f.cashed is null then 'crashed' else 'cashed' end, 'crash', f.crash, 'cashed', f.cashed, 'credits', _baron2_credits(v, p_state)); end if;
  m := floor(exp(0.15 * extract(epoch from (now() - f.start)))::numeric * 100) / 100;
  if m >= f.crash then
    update baron2_flights set settled = true where id = f.id;
    if f.owner_id is not null and f.owner_id <> v then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (f.owner_id, f.stake, 'fly_fee', 1, f.name);
    end if;
    return jsonb_build_object('state', 'crashed', 'crash', f.crash, 'credits', _baron2_credits(v, p_state));
  end if;
  m := greatest(m, 1);
  win := floor(f.stake * m);
  update baron2_flights set settled = true, cashed = m where id = f.id;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, win, 'fly_win', 1, m::text);
  if f.owner_id is not null and f.owner_id <> v and win > f.stake then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (f.owner_id, -(win - f.stake), 'fly_bank', 2, f.name);
  end if;
  return jsonb_build_object('state', 'cashed', 'crash', f.crash, 'cashed', m, 'win', win, 'credits', _baron2_credits(v, p_state));
end $$;

create or replace function public.baron2_fly_start(p_token uuid, p_state jsonb, p_stake numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); F baron2_fly; nm text; u double precision; c numeric; fid bigint; st timestamptz;
begin
  perform _baron2_fly_settle();
  select * into F from baron2_fly where id = 1;
  if F.owner_id is null then raise exception 'pas de patron'; end if;
  if F.owner_id = v then raise exception 'tu es le patron'; end if;
  if not F.open then raise exception 'aérodrome fermé'; end if;
  if exists(select 1 from baron2_flights where player_id = v and not settled) then raise exception 'déjà en vol'; end if;
  if floor(coalesce(p_stake, 0)) < 1 then raise exception 'mise invalide'; end if;
  if F.max_bet is not null and floor(p_stake) > F.max_bet then raise exception 'mise max'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  u := random();
  c := least(1000, greatest(1, floor((100 - _baron2_plane_edge(F.plane)) / (1 - u)) / 100.0));
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_flights(player_id, name, owner_id, stake, crash) values (v, nm, F.owner_id, floor(p_stake), c) returning id, start into fid, st;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (F.owner_id, ceil(floor(p_stake) * F.fee / 100.0), 'fly_fee', 0, nm);
  return jsonb_build_object('id', fid, 'start', st, 'now', now());
end $$;

create or replace function public.baron2_fly_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); F baron2_fly; nxt text;
begin
  perform _baron2_fly_settle();
  select * into F from baron2_fly where id = 1 for update;
  if F.owner_id is not null and (select updated_at from baron2_players where id = F.owner_id) <= now() - interval '24 hours' then
    nxt := (select id from baron2_players where id = F.heir_id and id <> F.owner_id and updated_at > now() - interval '24 hours');
    if nxt is null then nxt := (select f.id from _baron2_fortunes() f join baron2_players p on p.id = f.id where f.id <> F.owner_id and p.updated_at > now() - interval '24 hours' order by f.fortune limit 1); end if;
    if nxt is not null then update baron2_fly set prev_id = owner_id, owner_id = nxt, heir_id = null, since = now() where id = 1; select * into F from baron2_fly where id = 1; end if;
  end if;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = F.owner_id),
    'heir',  (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = F.heir_id),
    'prev',  (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = F.prev_id),
    'since', F.since, 'open', F.open,
    'fee', F.fee, 'plane', F.plane, 'max', F.max_bet, 'cfg_at', F.cfg_at,
    'hist', coalesce((select jsonb_agg(jsonb_build_object('c', crash, 'name', name, 'pid', player_id, 'cashed', cashed, 'stake', stake) order by id desc)
              from (select * from baron2_flights where settled order by id desc limit 15) h), '[]'),
    'fees', coalesce((select sum(coins) from baron2_credits where player_id = F.owner_id and product in ('fly_fee', 'fly_bank') and at > now() - interval '24 hours'), 0),
    'charge', (select jsonb_build_object('place', place, 'amount', amount, 'day', day) from baron2_charges where player_id = v order by id desc limit 1),
    'now', now());
end $$;

create or replace function public.baron2_place_cfg(p_token uuid, p_place text, p_key text, p_val text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); own text; t0 timestamptz;
begin
  if p_place = 'port' then select owner_id, cfg_at into own, t0 from baron2_port where id = 1 for update;
  elsif p_place = 'lotto' then select owner_id, cfg_at into own, t0 from baron2_lotto where id = 1 for update;
  elsif p_place = 'fly' then select owner_id, cfg_at into own, t0 from baron2_fly where id = 1 for update;
  elsif p_place = 'casino' then own := _baron2_top(); select cfg_at into t0 from baron2_casino where id = 1 for update;
  else raise exception 'lieu inconnu'; end if;
  if own is distinct from v then raise exception 'pas ton lieu'; end if;
  if t0 is not null and t0 > now() - interval '10 minutes' then raise exception 'attends % min', ceil(extract(epoch from (t0 + interval '10 minutes' - now())) / 60); end if;
  if p_place = 'port' and p_key = 'fee' and p_val in ('5','10','15','20') then update baron2_port set fee = p_val::int, cfg_at = now() where id = 1; return baron2_port_get();
  elsif p_place = 'port' and p_key = 'route' and p_val in ('cote','med','ame') then update baron2_port set route = p_val, cfg_at = now() where id = 1; return baron2_port_get();
  elsif p_place = 'lotto' and p_key = 'fee' and p_val in ('5','10','15','20') then update baron2_lotto set fee = p_val::int, cfg_at = now() where id = 1; return baron2_lotto_get(p_token);
  elsif p_place = 'lotto' and p_key = 'ticket' and p_val in ('5000000000','50000000000','250000000000','1000000000000') then update baron2_lotto set ticket = p_val::numeric, cfg_at = now() where id = 1; return baron2_lotto_get(p_token);
  elsif p_place = 'lotto' and p_key = 'every' and p_val in ('1','2','4') then
    update baron2_lotto set every_h = p_val::int, cfg_at = now(), draw_at = least(draw_at, date_trunc('hour', now()) + make_interval(hours => p_val::int)) where id = 1;
    return baron2_lotto_get(p_token);
  elsif p_place = 'fly' and p_key = 'fee' and p_val in ('5','10','15','20') then update baron2_fly set fee = p_val::int, cfg_at = now() where id = 1; return baron2_fly_get(p_token);
  elsif p_place = 'fly' and p_key = 'plane' and p_val in ('neuf','std','vieux') then update baron2_fly set plane = p_val, cfg_at = now() where id = 1; return baron2_fly_get(p_token);
  elsif p_place = 'fly' and p_key = 'max' and p_val in ('10000000000','100000000000','1000000000000','0') then update baron2_fly set max_bet = nullif(p_val::numeric, 0), cfg_at = now() where id = 1; return baron2_fly_get(p_token);
  elsif p_place = 'casino' and p_key = 'max' and p_val in ('10000000000','100000000000','1000000000000','0') then update baron2_casino set max_bet = nullif(p_val::numeric, 0), cfg_at = now() where id = 1; return baron2_casino_get();
  elsif p_place = 'casino' and p_key = 'zero' and p_val in ('sec','partage') then update baron2_casino set partage = (p_val = 'partage'), cfg_at = now() where id = 1; return baron2_casino_get();
  end if;
  raise exception 'réglage invalide';
end $$;

create or replace function public.baron2_lotto_buy(p_token uuid, p_state jsonb, p_picks jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_lotto; nm text; pk jsonb; x int; y int; n int; have int; cut numeric;
begin
  perform _baron2_lotto_settle();
  select * into L from baron2_lotto where id = 1 for update;
  if L.owner_id is null then raise exception 'loterie fermée'; end if;
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
  cut := floor(n * L.ticket * L.fee / 100.0);
  update baron2_lotto set jackpot = jackpot + (n * L.ticket - cut) where id = 1;
  if L.owner_id <> v then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (L.owner_id, cut, 'lotto_fee', n, nm);
  end if;
  return baron2_lotto_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

create or replace function public._baron2_lotto_settle() returns void
language plpgsql security definer set search_path = public as $$
declare L baron2_lotto; x int; y int; n int; w jsonb; per numeric; nxt text;
begin
  select * into L from baron2_lotto where id = 1 for update;
  while L.draw_at <= now() loop
    x := 1 + floor(random() * 8)::int; y := 1 + floor(random() * 7)::int; if y >= x then y := y + 1; end if;
    if x > y then n := x; x := y; y := n; end if;
    select count(*) into n from baron2_lotto_tickets where draw_at = L.draw_at;
    select coalesce(jsonb_agg(jsonb_build_object('id', player_id, 'name', name)), '[]') into w from baron2_lotto_tickets where draw_at = L.draw_at and a = x and b = y;
    insert into baron2_lotto_draws(draw_at, a, b, jackpot, tickets, winners) values (L.draw_at, x, y, L.jackpot, n, w);
    if jsonb_array_length(w) > 0 then
      per := floor(L.jackpot / jsonb_array_length(w));
      insert into baron2_credits(player_id, coins, product, qty, buyer)
        select player_id, per, 'lotto_win', 1, x || '-' || y from baron2_lotto_tickets where draw_at = L.draw_at and a = x and b = y;
      L.jackpot := greatest(L.seed, L.ticket * 10);
    end if;
    L.draw_at := L.draw_at + make_interval(hours => greatest(1, coalesce(L.every_h, 2)));
  end loop;
  if L.owner_id is not null and (select updated_at from baron2_players where id = L.owner_id) <= now() - interval '24 hours' then
    nxt := (select id from baron2_players where id = L.heir_id and id <> L.owner_id and updated_at > now() - interval '24 hours');
    if nxt is null then
      nxt := (select f.id from _baron2_fortunes() f join baron2_players p on p.id = f.id
              where f.id <> L.owner_id and p.updated_at > now() - interval '24 hours' order by f.fortune limit 1);
    end if;
    if nxt is not null then L.prev_id := L.owner_id; L.owner_id := nxt; L.heir_id := null; L.since := now(); end if;
  end if;
  update baron2_lotto set jackpot = L.jackpot, draw_at = L.draw_at, owner_id = L.owner_id, heir_id = L.heir_id, prev_id = L.prev_id, since = L.since where id = 1;
end $$;

create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0;
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Casino' place, _baron2_top() pid,
           greatest(0, coalesce((select sum(stake - win) from baron2_spins where baron_id = _baron2_top() and at > now() - interval '24 hours'), 0)) inc
    union all select 'Port', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product = 'port_fee' and at > now() - interval '24 hours'), 0) from baron2_port p
    union all select 'Loterie', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = l.owner_id and product = 'lotto_fee' and at > now() - interval '24 hours'), 0) from baron2_lotto l
    union all select 'Envol', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product in ('fly_fee', 'fly_bank') and at > now() - interval '24 hours'), 0)) from baron2_fly f
    union all select 'Œufs', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = m.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0) from baron2_eggmaster m
  loop
    if r.pid is null then continue; end if;
    amt := floor(0.20 * greatest(0, r.inc));
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'charge', 0, r.place);
    insert into baron2_charges(day, player_id, place, income, amount) values (d, r.pid, r.place, r.inc, amt);
    tot := tot + amt;
  end loop;
  update baron2_lotto set jackpot = jackpot + tot where id = 1;
end $$;
