-- Le Baron : les Réglages des lieux (14 nov. 2026)
-- Chaque propriétaire règle son lieu ; chaque réglage a un pour et un contre, et les joueurs le voient.
-- Un changement par lieu toutes les 10 minutes (pour ne pas piéger quelqu'un en pleine mise).

alter table baron2_port   add column if not exists fee int not null default 10,
                          add column if not exists route text not null default 'med',
                          add column if not exists cfg_at timestamptz;
alter table baron2_lotto  add column if not exists fee int not null default 10,
                          add column if not exists every_h int not null default 2,
                          add column if not exists cfg_at timestamptz;
alter table baron2_fly    add column if not exists fee int not null default 10,
                          add column if not exists plane text not null default 'std',
                          add column if not exists cfg_at timestamptz;
alter table baron2_casino add column if not exists max_bet numeric,
                          add column if not exists partage boolean not null default false,
                          add column if not exists cfg_at timestamptz;

-- routes du port : multiplicateur du cours, durée du voyage, risque de tempête
create or replace function public._baron2_route(r text) returns jsonb
language sql immutable as $$
  select case r
    when 'cote' then '{"k":"cote","mult":1.3,"h":0.5,"s":0.5}'::jsonb
    when 'ame'  then '{"k":"ame","mult":2.2,"h":2,"s":2}'::jsonb
    else             '{"k":"med","mult":1.6,"h":1,"s":1}'::jsonb end;
$$;
-- avions de l'aérodrome : part gardée par le village (plus elle est haute, plus l'avion tombe tôt)
create or replace function public._baron2_plane_edge(p text) returns numeric
language sql immutable as $$ select case p when 'neuf' then 1 when 'vieux' then 8 else 3 end::numeric; $$;

-- ---------- un seul point d'entrée pour régler son lieu ----------
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
  elsif p_place = 'lotto' and p_key = 'ticket' and p_val in ('1000000000','5000000000','25000000000','100000000000') then update baron2_lotto set ticket = p_val::numeric, cfg_at = now() where id = 1; return baron2_lotto_get(p_token);
  elsif p_place = 'lotto' and p_key = 'every' and p_val in ('1','2','4') then
    update baron2_lotto set every_h = p_val::int, cfg_at = now(),
      draw_at = least(draw_at, date_trunc('hour', now()) + make_interval(hours => p_val::int)) where id = 1;
    return baron2_lotto_get(p_token);
  elsif p_place = 'fly' and p_key = 'fee' and p_val in ('5','10','15','20') then update baron2_fly set fee = p_val::int, cfg_at = now() where id = 1; return baron2_fly_get(p_token);
  elsif p_place = 'fly' and p_key = 'plane' and p_val in ('neuf','std','vieux') then update baron2_fly set plane = p_val, cfg_at = now() where id = 1; return baron2_fly_get(p_token);
  elsif p_place = 'casino' and p_key = 'max' and p_val in ('10000000000','100000000000','1000000000000','0') then update baron2_casino set max_bet = nullif(p_val::numeric, 0), cfg_at = now() where id = 1; return baron2_casino_get();
  elsif p_place = 'casino' and p_key = 'zero' and p_val in ('sec','partage') then update baron2_casino set partage = (p_val = 'partage'), cfg_at = now() where id = 1; return baron2_casino_get();
  end if;
  raise exception 'réglage invalide';
end $$;
grant execute on function public.baron2_place_cfg(uuid, text, text, text) to anon, authenticated;

-- ---------- Port ----------
create or replace function public.baron2_port_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt baron2_port; rt jsonb; c jsonb;
begin
  perform _baron2_port_settle();
  perform _baron2_port_check();
  select * into pt from baron2_port where id = 1;
  rt := _baron2_route(pt.route); c := _baron2_port_cfg(pt.lvl);
  c := c || jsonb_build_object('hours', round((c->>'hours')::numeric * (rt->>'h')::numeric, 2), 'storm', least(0.6, round((c->>'storm')::numeric * (rt->>'s')::numeric, 3)));
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.owner_id),
    'heir', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.heir_id),
    'prev', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.prev_id),
    'since', pt.since,
    'seen', (select updated_at from baron2_players where id = pt.owner_id),
    'open', pt.open, 'lvl', pt.lvl, 'cfg', c,
    'fee', pt.fee, 'route', pt.route, 'mult', rt->'mult', 'cfg_at', pt.cfg_at,
    'sea', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty, 'value', value - fee, 'depart', depart, 'arrive', arrive) order by arrive)
              from baron2_ships where not settled), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty, 'value', value - fee, 'storm', storm, 'at', arrive) order by arrive desc)
              from (select * from baron2_ships where settled order by arrive desc limit 15) s), '[]'::jsonb),
    'fees', coalesce((select sum(fee) from baron2_ships where settled and not storm and owner_id = pt.owner_id and arrive > now() - interval '24 hours'), 0),
    'now', now());
end $$;

create or replace function public.baron2_port_send(p_token uuid, p_state jsonb, p_product text, p_qty numeric, p_unit numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); pt baron2_port; c jsonb; rt jsonb; nm text; q numeric := floor(p_qty); val numeric; fee numeric; hold numeric;
begin
  select * into pt from baron2_port where id = 1 for update;
  if pt.owner_id is null then raise exception 'pas de capitaine'; end if;
  if not pt.open then raise exception 'port fermé'; end if;
  c := _baron2_port_cfg(pt.lvl); rt := _baron2_route(pt.route);
  if (select count(*) from baron2_ships where not settled) >= (c->>'ships')::int then raise exception 'plus de bateau'; end if;
  if p_product !~ '^[a-z]{2,16}$' or q < 1 or coalesce(p_unit, 0) <= 0 then raise exception 'cargaison invalide'; end if;
  hold := floor((c->>'hold')::numeric * 400 * power(2.6, coalesce((p_state->>'barn')::int, 1) - 1));
  if q > hold + 1 then raise exception 'cale trop petite'; end if;
  if coalesce((p_state->'stock'->>p_product)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  val := floor(q * p_unit * (rt->>'mult')::numeric);
  fee := case when pt.owner_id = v then 0 else floor(val * pt.fee / 100.0) end;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_ships(player_id, name, owner_id, product, qty, value, fee, storm, arrive)
    values (v, nm, pt.owner_id, p_product, q, val, fee, random() < least(0.6, (c->>'storm')::numeric * (rt->>'s')::numeric),
            now() + make_interval(secs => (c->>'hours')::numeric * (rt->>'h')::numeric * 3600));
  return baron2_port_get() || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- ---------- Loterie ----------
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
      L.jackpot := L.seed;
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

create or replace function public.baron2_lotto_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_lotto;
begin
  perform _baron2_lotto_settle();
  select * into L from baron2_lotto where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.owner_id),
    'heir',  (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.heir_id),
    'prev',  (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.prev_id),
    'since', L.since,
    'prank', L.owner_id is null and v <> '232590e0-d532-48e0-9239-06fe9ed81c57',
    'jackpot', L.jackpot, 'ticket', L.ticket, 'draw_at', L.draw_at,
    'fee', L.fee, 'every', L.every_h, 'cfg_at', L.cfg_at,
    'count', (select count(*) from baron2_lotto_tickets where draw_at = L.draw_at),
    'mine', coalesce((select jsonb_agg(jsonb_build_array(a, b) order by id) from baron2_lotto_tickets where draw_at = L.draw_at and player_id = v), '[]'),
    'last', (select jsonb_build_object('a', a, 'b', b, 'jackpot', jackpot, 'tickets', tickets, 'winners', winners, 'at', draw_at) from baron2_lotto_draws order by id desc limit 1),
    'fees', coalesce((select sum(coins) from baron2_credits where player_id = L.owner_id and product = 'lotto_fee' and at > now() - interval '24 hours'), 0),
    'now', now());
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
  if n < 1 or have + n > 10 then raise exception 'dix tickets max'; end if;
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

-- ---------- Aérodrome ----------
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
    'fee', F.fee, 'plane', F.plane, 'cfg_at', F.cfg_at,
    'hist', coalesce((select jsonb_agg(jsonb_build_object('c', crash, 'name', name, 'pid', player_id, 'cashed', cashed, 'stake', stake) order by id desc)
              from (select * from baron2_flights where settled order by id desc limit 15) h), '[]'),
    'fees', coalesce((select sum(coins) from baron2_credits where player_id = F.owner_id and product = 'fly_fee' and at > now() - interval '24 hours'), 0),
    'charge', (select jsonb_build_object('place', place, 'amount', amount, 'day', day) from baron2_charges where player_id = v order by id desc limit 1),
    'now', now());
end $$;

-- ---------- Casino (roulette) ----------
create or replace function public.baron2_casino_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select open from baron2_casino where id = 1),
    'max', (select max_bet from baron2_casino where id = 1),
    'partage', (select partage from baron2_casino where id = 1),
    'cfg_at', (select cfg_at from baron2_casino where id = 1),
    'baron', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = _baron2_top()),
    'spins', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'n', n, 'stake', stake, 'win', win, 'at', at) order by id desc)
               from (select * from baron2_spins order by id desc limit 20) s), '[]'::jsonb),
    'bank', coalesce((select sum(stake - win) from baron2_spins where baron_id = _baron2_top() and at > now() - interval '24 hours'), 0),
    'now', now());
$$;

create or replace function public.baron2_casino_spin(p_token uuid, p_state jsonb, p_bets jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); top text := _baron2_top(); nm text; C baron2_casino;
  b jsonb; k text; m numeric; stake numeric := 0; win numeric := 0; n int; hit boolean; mult int;
  reds int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
  select * into C from baron2_casino where id = 1;
  if not coalesce(C.open, false) then raise exception 'casino fermé'; end if;
  if top = v then raise exception 'tu es le baron'; end if;
  if p_bets is null or jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) < 1 or jsonb_array_length(p_bets) > 60 then raise exception 'mise invalide'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  n := floor(random() * 37)::int;
  for b in select * from jsonb_array_elements(p_bets) loop
    k := b->>'k'; m := floor(coalesce((b->>'m')::numeric, 0));
    if m < 1 or m > 1e18 then raise exception 'mise invalide'; end if;
    stake := stake + m; mult := 1;
    if k ~ '^n([0-9]|[12][0-9]|3[0-6])$' then hit := substr(k, 2)::int = n; mult := 35;
    elsif k = 'rouge'  then hit := n = any(reds);
    elsif k = 'noir'   then hit := n > 0 and not (n = any(reds));
    elsif k = 'pair'   then hit := n > 0 and n % 2 = 0;
    elsif k = 'impair' then hit := n % 2 = 1;
    elsif k = 'manque' then hit := n between 1 and 18;
    elsif k = 'passe'  then hit := n between 19 and 36;
    elsif k in ('d1','d2','d3') then hit := n > 0 and (n - 1) / 12 + 1 = substr(k, 2)::int; mult := 2;
    elsif k in ('c1','c2','c3') then hit := n > 0 and ((n - 1) % 3) + 1 = substr(k, 2)::int; mult := 2;
    else raise exception 'mise invalide';
    end if;
    if hit then win := win + m * (mult + 1);
    elsif n = 0 and C.partage and k in ('rouge','noir','pair','impair','manque','passe') then win := win + floor(m / 2);
    end if;
  end loop;
  if C.max_bet is not null and stake > C.max_bet then raise exception 'mise max'; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_spins(player_id, name, baron_id, n, stake, win) values (v, nm, top, n, stake, win);
  if win > 0 then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, win, 'casino_win', n, nm);
  end if;
  if stake <> win then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (top, stake - win, 'casino', n, nm);
  end if;
  return jsonb_build_object('n', n, 'stake', stake, 'win', win, 'credits', _baron2_credits(v, p_state));
end $$;
