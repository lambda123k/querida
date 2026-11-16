-- =====================================================================
-- Le Baron : rendre les lieux plus désirables (16 nov. 2026)
-- Réseau d'espions : une paie du village chaque heure, le chantage, une fausse rumeur par jour, l'abonnement aux commandes.
-- Caravane : voyages bien plus courts (1 h, 2 h, 4 h ; départ auto 1 h après le premier lot), bonus du voyageur sur ses
--   propres lots, et le comptoir : à chaque retour, il rapporte des matières exotiques que personne ne produit au village
--   (café, vanille, cacao, coco, thé, cannelle), qu'il est le seul à vendre. Réseau parallèle : jamais dans les commandes.
-- Laboratoire : une prime à chaque recette découverte (pour le chercheur), il peut cuisiner toutes les recettes trouvées
--   (même secrètes) et les vendre au village, le grand prix de la pièce montée, et 9 recettes exotiques qui demandent
--   les matières de la Caravane.
-- À lancer après baron2_34.
-- =====================================================================

-- ---------------------------------------------------------------- Réseau d'espions
alter table baron2_spy add column if not exists paid_at timestamptz;
alter table baron2_spy add column if not exists black_day date;
alter table baron2_spy add column if not exists black_used int not null default 0;
alter table baron2_spy add column if not exists rumor_day date;

create table if not exists baron2_spy_black (
  id bigserial primary key,
  target_id text not null references baron2_players(id) on delete cascade,
  target_name text not null,
  kind text not null,
  price numeric not null,
  status text not null default 'attente',          -- attente, paye, fuite
  data jsonb,
  created_at timestamptz not null default now(),
  done_at timestamptz);
alter table baron2_spy_black enable row level security;

create table if not exists baron2_spy_subs (
  player_id text primary key references baron2_players(id) on delete cascade,
  until timestamptz not null);
alter table baron2_spy_subs enable row level security;

create table if not exists baron2_spy_rumors (
  slot bigint primary key,
  k text not null, up boolean not null, txt text not null,
  by_id text, at timestamptz not null default now());
alter table baron2_spy_rumors enable row level security;

create or replace function public._baron2_spy_kinds() returns text[]
language sql immutable as $$ select array['argent','stock','paris','caravane','bateaux','labo','commandes','abonnement'] $$;

-- la paie du maître espion (chaque heure, s'il a joué dans les 24 h) et les chantages expirés (1 h) qui fuitent
create or replace function public._baron2_spy_settle() returns void
language plpgsql security definer set search_path = public as $$
declare E baron2_spy; h int; amt numeric; b record;
begin
  select * into E from baron2_spy where id = 1;
  if E.owner_id is not null and (E.paid_at is null or E.paid_at < now() - interval '1 hour') then
    select * into E from baron2_spy where id = 1 for update skip locked;
    if E.id is not null and E.owner_id is not null then
      if E.paid_at is null then update baron2_spy set paid_at = now() where id = 1;
      elsif E.paid_at < now() - interval '1 hour' then
        h := least(24, floor(extract(epoch from (now() - E.paid_at)) / 3600)::int);
        if (select updated_at from baron2_players where id = E.owner_id) > now() - interval '24 hours' then
          amt := h * _baron2_nice(greatest(1e8, coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.0008));
          insert into baron2_credits(player_id, coins, product, qty, buyer) values (E.owner_id, amt, 'spy_pay', h, 'Réseau');
        end if;
        update baron2_spy set paid_at = E.paid_at + make_interval(hours => h) where id = 1;
      end if;
    end if;
  end if;
  if exists (select 1 from baron2_spy_black where status = 'attente' and created_at < now() - interval '1 hour') then
    for b in update baron2_spy_black set status = 'fuite', done_at = now(), data = _baron2_spy_data(kind, target_id)
             where status = 'attente' and created_at < now() - interval '1 hour' returning * loop
      insert into baron2_credits(player_id, coins, product, qty, buyer)
        select id, 0, 'spy_leak', 0, b.kind || '|' || b.target_name from baron2_players;
    end loop;
  end if;
end $$;

create or replace function public.baron2_spy_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); E baron2_spy; own boolean; nx jsonb; today date := (now() at time zone 'Europe/Paris')::date; sub timestamptz;
begin
  perform _baron2_spy_settle();
  select * into E from baron2_spy where id = 1;
  own := E.owner_id is not null and E.owner_id = v;
  nx := _baron2_spy_next();
  select until into sub from baron2_spy_subs where player_id = v and until > now();
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = E.owner_id),
    'since', E.since,
    'prices', E.prices,
    'avg', (select floor(avg(greatest(0, fortune))) from _baron2_fortunes()),
    'pay', _baron2_nice(greatest(1e8, coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.0008)),
    'free_left', case when own then 10 - case when E.free_day = today then E.free_used else 0 end end,
    'black_left', case when own then 3 - case when E.black_day = today then E.black_used else 0 end end,
    'rumor_ok', case when own then E.rumor_day is distinct from today end,
    'sub_until', sub,
    'next', case when own or sub is not null or exists (select 1 from baron2_spy_files f where f.buyer_id = v and f.kind = 'commandes' and f.slot = (nx->>'slot')::bigint) then nx end,
    'next_slot', (nx->>'slot')::bigint,
    'targets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'specialty', specialty) order by created_at) from baron2_players where id <> v), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'target_id', f.target_id, 'target_name', f.target_name, 'data', f.data, 'price', f.price, 'slot', f.slot, 'at', f.at) order by f.id desc)
               from (select * from baron2_spy_files where buyer_id = v order by id desc limit 15) f), '[]'::jsonb),
    'gains', case when own then coalesce((select sum(coins) from baron2_credits where player_id = v and product in ('spy_fee', 'spy_pay', 'spy_black') and at > now() - interval '24 hours'), 0) end,
    'sales', case when own then coalesce((select jsonb_agg(jsonb_build_object('kind', f.kind, 'buyer', b.name, 'target', f.target_name, 'price', f.price, 'at', f.at) order by f.id desc)
               from (select * from baron2_spy_files where buyer_id <> v and price > 0 and at > now() - interval '24 hours' order by id desc limit 15) f
               join baron2_players b on b.id = f.buyer_id), '[]'::jsonb) end,
    -- les chantages : ceux qui me visent, et (pour le maître) ceux en cours
    'black_on_me', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'price', price, 'at', created_at) order by id)
               from baron2_spy_black where target_id = v and status = 'attente'), '[]'::jsonb),
    'blacks', case when own then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'price', price, 'target', target_name, 'status', status, 'at', created_at) order by id desc)
               from (select * from baron2_spy_black where created_at > now() - interval '24 hours' order by id desc limit 10) x), '[]'::jsonb) end,
    -- les dossiers qui ont fuité : publics
    'leaks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'target_name', target_name, 'data', data, 'at', done_at) order by id desc)
               from (select * from baron2_spy_black where status = 'fuite' and done_at > now() - interval '48 hours' order by id desc limit 10) x), '[]'::jsonb),
    'now', now());
end $$;

-- acheter un dossier (ou l'abonnement aux commandes) : p_state est la ferme, prix déjà retiré ; p_price est le prix vu
create or replace function public.baron2_spy_buy(p_token uuid, p_state jsonb, p_kind text, p_target text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); E baron2_spy; own boolean; pr numeric := 0; tn text; d jsonb; fid bigint; bn text;
        today date := (now() at time zone 'Europe/Paris')::date; sl bigint; u timestamptz;
begin
  select * into E from baron2_spy where id = 1 for update;
  if E.owner_id is null then raise exception 'pas de maître espion'; end if;
  own := E.owner_id = v;
  if not (p_kind = any (_baron2_spy_kinds())) then raise exception 'dossier inconnu'; end if;
  if p_kind in ('commandes', 'abonnement') then
    if own then raise exception 'tu les vois déjà'; end if;
    sl := _baron2_slot() + 1;
    if p_kind = 'commandes' and exists (select 1 from baron2_spy_files where buyer_id = v and kind = 'commandes' and slot = sl) then raise exception 'déjà acheté'; end if;
  else
    if p_target is null or p_target = v then raise exception 'cible invalide'; end if;
    select name into tn from baron2_players where id = p_target;
    if tn is null then raise exception 'cible invalide'; end if;
  end if;
  if own then
    if E.free_day is distinct from today then update baron2_spy set free_day = today, free_used = 0 where id = 1; E.free_used := 0; end if;
    if E.free_used >= 10 then raise exception 'plus de dossiers gratuits'; end if;
    update baron2_spy set free_used = free_used + 1, free_day = today where id = 1;
  else
    if E.prices->>p_kind is null then raise exception 'pas à vendre'; end if;
    pr := (E.prices->>p_kind)::numeric;
    if p_price is distinct from pr then raise exception 'prix changé'; end if;
    if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
    perform _baron2_put(v, p_state);
  end if;
  if p_kind = 'abonnement' then
    insert into baron2_spy_subs(player_id, until) values (v, now() + interval '24 hours')
      on conflict (player_id) do update set until = greatest(baron2_spy_subs.until, now()) + interval '24 hours'
      returning until into u;
    d := jsonb_build_object('until', u);
  else
    d := _baron2_spy_data(p_kind, p_target);
  end if;
  insert into baron2_spy_files(buyer_id, target_id, target_name, kind, data, price, slot)
    values (v, case when p_kind in ('commandes', 'abonnement') then null else p_target end, tn, p_kind, d, pr, case when p_kind = 'commandes' then (d->>'slot')::bigint end)
    returning id into fid;
  if pr > 0 then
    select name into bn from baron2_players where id = v;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (E.owner_id, pr, 'spy_fee', 1, p_kind || '|' || bn);
  end if;
  return baron2_spy_get(p_token) || jsonb_build_object('file_id', fid,
    'credits', case when own then '[]'::jsonb else _baron2_credits(v, p_state) end);
end $$;

-- le chantage : le maître espion menace un joueur de rendre public un de ses dossiers, sauf s'il paie (1 h pour répondre)
create or replace function public.baron2_spy_black(p_token uuid, p_target text, p_kind text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); E baron2_spy; tn text; today date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into E from baron2_spy where id = 1 for update;
  if E.owner_id is distinct from v then raise exception 'pas le maître espion'; end if;
  if not (p_kind = any (array['argent','stock','paris','caravane','bateaux','labo'])) then raise exception 'dossier inconnu'; end if;
  select name into tn from baron2_players where id = p_target and id <> v;
  if tn is null then raise exception 'cible invalide'; end if;
  if p_price is null or p_price < 1 or p_price > 1e30 then raise exception 'prix invalide'; end if;
  if exists (select 1 from baron2_spy_black where target_id = p_target and status = 'attente') then raise exception 'déjà menacé'; end if;
  if E.black_day is distinct from today then update baron2_spy set black_day = today, black_used = 0 where id = 1; E.black_used := 0; end if;
  if E.black_used >= 3 then raise exception 'plus de chantages'; end if;
  update baron2_spy set black_used = black_used + 1, black_day = today where id = 1;
  insert into baron2_spy_black(target_id, target_name, kind, price) values (p_target, tn, p_kind, _baron2_nice(p_price));
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (p_target, 0, 'spy_black_ask', 0, p_kind || '|' || _baron2_nice(p_price));
  return baron2_spy_get(p_token);
end $$;

-- la victime répond : payer (le dossier est détruit) ou refuser (il fuite tout de suite)
create or replace function public.baron2_spy_black_answer(p_token uuid, p_state jsonb, p_id bigint, p_pay boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); b baron2_spy_black; own text := (select owner_id from baron2_spy where id = 1); nm text;
begin
  select * into b from baron2_spy_black where id = p_id for update;
  if b.id is null or b.status <> 'attente' or b.target_id <> v then raise exception 'chantage expiré'; end if;
  select name into nm from baron2_players where id = v;
  if coalesce(p_pay, false) then
    if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
    perform _baron2_put(v, p_state);
    update baron2_spy_black set status = 'paye', done_at = now() where id = p_id;
    if own is not null then insert into baron2_credits(player_id, coins, product, qty, buyer) values (own, b.price, 'spy_black', 0, b.kind || '|' || nm); end if;
    return baron2_spy_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
  end if;
  update baron2_spy_black set status = 'fuite', done_at = now(), data = _baron2_spy_data(b.kind, b.target_id) where id = p_id;
  insert into baron2_credits(player_id, coins, product, qty, buyer) select id, 0, 'spy_leak', 0, b.kind || '|' || nm from baron2_players;
  return baron2_spy_get(p_token);
end $$;

-- la fausse rumeur : une par jour, elle s'affiche comme la nouvelle du prochain créneau
create or replace function public.baron2_spy_rumor(p_token uuid, p_k text, p_up boolean, p_txt text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); E baron2_spy; today date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into E from baron2_spy where id = 1 for update;
  if E.owner_id is distinct from v then raise exception 'pas le maître espion'; end if;
  if E.rumor_day = today then raise exception 'déjà une rumeur'; end if;
  if not (p_k = any (array['ble','oeufs','lait','fruits','miel','bois','sucre'])) or length(coalesce(p_txt, '')) not between 3 and 120 then raise exception 'rumeur invalide'; end if;
  insert into baron2_spy_rumors(slot, k, up, txt, by_id) values (_baron2_slot() + 1, p_k, coalesce(p_up, true), p_txt, v)
    on conflict (slot) do update set k = excluded.k, up = excluded.up, txt = excluded.txt, by_id = excluded.by_id, at = now();
  update baron2_spy set rumor_day = today where id = 1;
  return baron2_spy_get(p_token);
end $$;

-- le monde : + les fausses rumeurs du créneau en cours et du suivant (affichées comme de vraies nouvelles)
create or replace function public.baron2_world() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players',  coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty,
                   'stats', p.stats || jsonb_build_object('fortune', _baron2_round2(floor(f.fortune)), 'rk', f.rk), 'updated_at', p.updated_at) order by p.created_at)
                 from baron2_players p join (select id, fortune, row_number() over (order by fortune desc, created_at) rk from _baron2_fortunes()) f on f.id = p.id), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'seller_id', seller_id, 'product', product, 'qty', qty, 'price', price, 'created_at', created_at) order by price, id) from baron2_listings), '[]'::jsonb),
    'trades',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'product', product, 'qty', qty, 'price', price, 'buyer_id', buyer_id, 'seller_id', seller_id, 'at', at) order by id)
                 from (select * from baron2_trades where at > now() - interval '7 days' order by id desc limit 3000) t), '[]'::jsonb),
    'reserve',  jsonb_build_object('slot', _baron2_slot(),
                 'size', (select jsonb_object_agg(k, _baron2_res_size(k)) from unnest(array['ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau']) k),
                 'used', coalesce((select jsonb_object_agg(product, used) from baron2_reserve where slot = _baron2_slot()), '{}'::jsonb)),
    'press',    coalesce((select jsonb_object_agg(product, jsonb_build_object('p', p, 't', floor(extract(epoch from t) * 1000), 'h', hist)) from baron2_press), '{}'::jsonb),
    'med',      _baron2_med_eff(),
    'rumors',   coalesce((select jsonb_object_agg(slot::text, jsonb_build_object('k', k, 'up', up, 'txt', txt)) from baron2_spy_rumors where slot between _baron2_slot() - 2 and _baron2_slot() + 1), '{}'::jsonb),
    'now', now());
$$;

-- ---------------------------------------------------------------- Caravane
-- voyages courts : 20, 40 ou 60 min par étape ; chaque route rapporte 2 matières exotiques
create or replace function public._baron2_cara_route(r text) returns jsonb
language sql immutable as $$
  select case r
    when 'levant' then '{"name":"Route d''Europe","h":0.3333,"risk":0.08,"est":2.6,"rare":["cafe","vanille"],"cities":[
        {"c":"Bruxelles","share":0.4,"m":2.2,"fav":"luxe"},{"c":"Madrid","share":0.5,"m":2.6,"fav":"craft"},{"c":"Rome","share":1,"m":3,"fav":"craft"}]}'
    when 'epices' then '{"name":"Route des Amériques","h":0.6667,"risk":0.12,"est":3.4,"rare":["cacao","coco"],"cities":[
        {"c":"New York","share":0.35,"m":2.8,"fav":"craft"},{"c":"La Havane","share":0.5,"m":3.4,"fav":"luxe"},{"c":"Rio","share":1,"m":4,"fav":"craft"}]}'
    when 'soie' then '{"name":"Le Tour du monde","h":1,"risk":0.15,"est":4.4,"rare":["the","cannelle"],"cities":[
        {"c":"Londres","share":0.3,"m":3.2,"fav":"luxe"},{"c":"Moscou","share":0.4,"m":4,"fav":"craft"},{"c":"Pékin","share":0.5,"m":4.8,"fav":"craft"},{"c":"Tokyo","share":1,"m":6,"fav":"luxe"}]}'
  end::jsonb;
$$;

create table if not exists baron2_cara_rare (
  k text primary key,
  qty numeric not null default 0,
  price numeric);                                  -- prix à l'unité fixé par le voyageur (null : pas à vendre)
alter table baron2_cara_rare enable row level security;
insert into baron2_cara_rare(k) values ('cafe'), ('vanille'), ('cacao'), ('coco'), ('the'), ('cannelle') on conflict do nothing;

-- départ automatique 1 h après le premier lot ; au retour, le voyageur rapporte ses matières exotiques
create or replace function public._baron2_cara_settle() returns void
language plpgsql security definer set search_path = public as $$
declare C baron2_cara; rt jsonb; n int; s int; tot numeric; rk text; q numeric;
begin
  select * into C from baron2_cara where id = 1;
  if C.id is null then return; end if;
  if not C.on_road and (C.first_at is null or C.first_at > now() - interval '1 hour') then return; end if;
  if C.on_road then
    rt := _baron2_cara_route(C.route);
    if C.depart_at + make_interval(secs => (rt->>'h')::numeric * 3600 * (C.done_step + 1)) > now() then return; end if;
  end if;
  select * into C from baron2_cara where id = 1 for update skip locked;
  if C.id is null then return; end if;
  if not C.on_road then
    if C.first_at is null or C.first_at > now() - interval '1 hour' then return; end if;
    update baron2_cara set on_road = true, depart_at = first_at + interval '1 hour', done_step = 0 where id = 1;
    select * into C from baron2_cara where id = 1;
  end if;
  rt := _baron2_cara_route(C.route); n := jsonb_array_length(rt->'cities');
  loop
    s := C.done_step + 1;
    exit when s > n or C.depart_at + make_interval(secs => (rt->>'h')::numeric * 3600 * s) > now();
    perform _baron2_cara_step(C.trip, C.route, s, C.owner_id, C.fee);
    C.done_step := s;
    update baron2_cara set done_step = s where id = 1;
  end loop;
  if C.done_step >= n then
    select coalesce(sum(qty), 0) into tot from baron2_cara_lots where trip = C.trip;
    q := greatest(10, floor(tot * 0.03));
    for rk in select jsonb_array_elements_text(rt->'rare') loop
      update baron2_cara_rare r set qty = r.qty + q where r.k = rk;
    end loop;
    if C.owner_id is not null then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (C.owner_id, 0, 'cara_rare_in', q, (select string_agg(x, ',') from jsonb_array_elements_text(rt->'rare') x));
    end if;
    update baron2_cara set on_road = false, trip = trip + 1, first_at = null, depart_at = null, done_step = 0 where id = 1;
  end if;
end $$;

-- le voyageur touche aussi sa commission (en bonus) sur ses propres lots
create or replace function public._baron2_cara_step(p_trip int, p_route text, p_step int, p_owner text, p_fee int) returns void
language plpgsql security definer set search_path = public as $$
declare rt jsonb := _baron2_cara_route(p_route); c jsonb; v_last boolean; ev text; x numeric; l record; cat text; rc baron2_recipes;
        v_lost numeric; v_sold numeric; mult numeric; gross numeric; fee numeric; roy numeric; refund numeric; tot numeric := 0;
begin
  c := rt->'cities'->(p_step - 1);
  v_last := p_step >= jsonb_array_length(rt->'cities');
  x := random();
  if random() < (rt->>'risk')::numeric then
    ev := case when x < 0.5 then 'pillage' when x < 0.8 then 'douane' else 'sable' end;
  end if;
  for l in select * from baron2_cara_lots where trip = p_trip and left_qty > 0 for update loop
    cat := _baron2_cara_cat(l.product);
    v_lost := case ev when 'pillage' then floor(l.left_qty * 0.4) when 'sable' then floor(l.left_qty * 0.2) else 0 end;
    v_sold := case when v_last then l.left_qty - v_lost else floor((l.left_qty - v_lost) * (c->>'share')::numeric) end;
    mult := (c->>'m')::numeric * case when cat = (c->>'fav') then 1.25 else 1 end * _baron2_cara_sat(p_trip, l.product)
            * case when p_owner is not null and l.player_id = p_owner then 1 + p_fee / 100.0 else 1 end;
    roy := 0; rc := null;
    if cat = 'exo' then
      select * into rc from baron2_recipes where k = l.product;
      if rc.city = (c->>'c') or rc.city = 'Partout' then mult := mult * 1.5; end if;
    end if;
    gross := floor(v_sold * l.unit * mult);
    if ev = 'douane' then gross := floor(gross * 0.7); end if;
    fee := case when p_owner is not null and p_owner <> l.player_id then floor(gross * p_fee / 100.0) else 0 end;
    if rc.k is not null and rc.patent and rc.found_by is not null and rc.found_by <> l.player_id then roy := floor(gross * 0.05); end if;
    if v_sold > 0 then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, gross - fee - roy, 'cara_sale', v_sold, l.product || '|' || (c->>'c') || '|' || coalesce(ev, ''));
      if fee > 0 then insert into baron2_credits(player_id, coins, product, qty, buyer) values (p_owner, fee, 'cara_fee', v_sold, l.name || '|' || (c->>'c')); end if;
      if roy > 0 then insert into baron2_credits(player_id, coins, product, qty, buyer) values (rc.found_by, roy, 'labo_roy', v_sold, l.product || '|' || l.name); end if;
    end if;
    if v_lost > 0 then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, 0, 'cara_lost', v_lost, l.product || '|' || (c->>'c') || '|' || ev);
      if l.insured and p_owner is not null then
        refund := floor(v_lost * l.unit * mult);
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, refund, 'cara_insured', v_lost, l.product);
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (p_owner, -refund, 'cara_ins', 1, l.name);
      end if;
    end if;
    update baron2_cara_lots set left_qty = left_qty - v_lost - v_sold, lost = baron2_cara_lots.lost + v_lost, earned = earned + gross - fee - roy where id = l.id;
    tot := tot + v_sold;
  end loop;
  insert into baron2_cara_steps(trip, route, step, city, event, sold) values (p_trip, p_route, p_step, c->>'c', ev, tot);
end $$;

create or replace function public.baron2_cara_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_cara;
begin
  perform _baron2_cara_settle();
  select * into C from baron2_cara where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = C.owner_id),
    'since', C.since,
    'route', C.route, 'rt', _baron2_cara_route(C.route), 'fee', C.fee, 'ins', C.ins_pct, 'cfg_at', C.cfg_at,
    'trip', C.trip, 'on_road', C.on_road, 'first_at', C.first_at, 'depart_at', C.depart_at, 'done_step', C.done_step,
    'auto_at', C.first_at + interval '1 hour',
    'lots', coalesce((select jsonb_agg(case when l.player_id = v or C.on_road then
                jsonb_build_object('id', l.id, 'pid', l.player_id, 'name', l.name, 'product', l.product, 'qty', l.qty, 'left', l.left_qty,
                  'unit', l.unit, 'earned', l.earned, 'lost', l.lost, 'ins', l.insured, 'premium', l.premium,
                  'sat', case when C.on_road then _baron2_cara_sat(C.trip, l.product) end)
              else jsonb_build_object('id', l.id, 'pid', l.player_id, 'name', l.name, 'hidden', true) end order by l.id)
              from baron2_cara_lots l where l.trip = C.trip), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('step', step, 'city', city, 'event', event, 'sold', sold, 'at', at) order by step)
              from baron2_cara_steps where trip = C.trip), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (
              select s.id, s.trip, s.route, s.step, s.city, s.event, s.sold, s.at from baron2_cara_steps s where s.trip < C.trip order by s.id desc limit 12) x), '[]'::jsonb),
    'last', (select jsonb_agg(jsonb_build_object('pid', player_id, 'name', name, 'product', product, 'qty', qty, 'earned', earned, 'lost', lost, 'ins', insured) order by earned desc)
              from baron2_cara_lots where trip = C.trip - 1),
    'fees', case when v = C.owner_id then coalesce((select sum(coins) from baron2_credits where player_id = v and product in ('cara_fee', 'cara_ins', 'cara_rare') and at > now() - interval '24 hours'), 0) else 0 end,
    'rare', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'qty', qty, 'price', price) order by array_position(array['cafe','vanille','cacao','coco','the','cannelle'], k)) from baron2_cara_rare), '[]'::jsonb),
    'now', now());
end $$;

-- le voyageur fixe le prix d'une matière exotique (null : pas à vendre)
create or replace function public.baron2_cara_rare_price(p_token uuid, p_k text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_cara where id = 1) is distinct from v then raise exception 'pas le voyageur'; end if;
  if p_price is not null and (p_price < 1 or p_price > 1e30) then raise exception 'prix invalide'; end if;
  update baron2_cara_rare set price = case when p_price is null then null else _baron2_nice(p_price) end where k = p_k;
  if not found then raise exception 'matière inconnue'; end if;
  return baron2_cara_get(p_token);
end $$;

-- acheter des matières exotiques au comptoir (le voyageur, lui, se sert gratuitement) : p_state est la ferme, prix retiré, matières ajoutées
create or replace function public.baron2_cara_rare_buy(p_token uuid, p_state jsonb, p_k text, p_qty numeric, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); own text := (select owner_id from baron2_cara where id = 1); r baron2_cara_rare; q numeric := floor(coalesce(p_qty, 0)); nm text;
begin
  select * into r from baron2_cara_rare where k = p_k for update;
  if r.k is null then raise exception 'matière inconnue'; end if;
  if q < 1 or q > r.qty then raise exception 'pas assez au comptoir'; end if;
  if v is distinct from own then
    if own is null then raise exception 'pas de voyageur'; end if;
    if r.price is null then raise exception 'pas à vendre'; end if;
    if r.price is distinct from p_price then raise exception 'prix changé'; end if;
  end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  update baron2_cara_rare set qty = qty - q where k = p_k;
  if v is distinct from own then
    select name into nm from baron2_players where id = v;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (own, q * r.price, 'cara_rare', q, p_k || '|' || nm);
  end if;
  return baron2_cara_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- ---------------------------------------------------------------- Laboratoire
alter table baron2_labo add column if not exists jackpot numeric not null default 0;

insert into baron2_recipes(k, ord, name, e, city, riddle, grid, known) values
 ('chocolatchaud', 39, 'Chocolat chaud', '🥛', 'Moscou', 'Le goûter d''hiver dans un grand bol : du lait, la poudre d''un fruit d''Amérique, et une touche sucrée.', _baron2_labo_norm('["cacao", null, null, "lait", null, null, "sucre", null, null]'::jsonb), false),
 ('mousse', 40, 'Mousse au chocolat', '🍫', 'Londres', 'Un dessert tout léger, plein de bulles : des blancs battus et du chocolat.', _baron2_labo_norm('["cacao", "oeufs", null, null, "sucre", null, null, null, null]'::jsonb), false),
 ('brownie', 41, 'Brownie', '🟫', 'New York', 'Un carré de gâteau américain, très chocolaté, fondant au milieu.', _baron2_labo_norm('["cacao", "ble", null, "oeufs", "sucre", null, null, null, null]'::jsonb), false),
 ('cafecreme', 42, 'Café crème', '☕', 'Rome', 'Le petit noir des terrasses, adouci avec du lait.', _baron2_labo_norm('["cafe", "lait", null, null, null, null, null, null, null]'::jsonb), false),
 ('glace', 43, 'Glace à la vanille', '🍦', 'Rio', 'Une boule blanche et froide dans un cornet, parfumée à une gousse noire venue de loin.', _baron2_labo_norm('["vanille", null, null, null, "lait", null, null, null, "sucre"]'::jsonb), false),
 ('theglace', 44, 'Thé glacé', '🧊', 'Tokyo', 'La boisson fraîche de l''été : des feuilles infusées, du citron et du sucre.', _baron2_labo_norm('["the", "fruits", "sucre", null, null, null, null, null, null]'::jsonb), false),
 ('roule', 45, 'Roulé à la cannelle', '🌀', 'Londres', 'Une brioche enroulée en spirale, parfumée à une épice en bâtons, avec un glaçage sucré.', _baron2_labo_norm('["brioche", "cannelle", null, "sucre", null, null, null, null, null]'::jsonb), false),
 ('rocher', 46, 'Rocher coco', '🥥', 'Pékin', 'Un petit gâteau des îles en forme de montagne, à la noix râpée.', _baron2_labo_norm('["coco", "coco", null, null, "sucre", null, null, null, null]'::jsonb), false),
 ('chai', 47, 'Chai latte', '🍵', 'Pékin', 'Un thé au lait venu d''Inde, parfumé d''épices, très doux.', _baron2_labo_norm('["the", null, null, "cannelle", null, null, "lait", null, null]'::jsonb), false)
on conflict (k) do update set ord = excluded.ord, name = excluded.name, e = excluded.e, city = excluded.city,
  riddle = excluded.riddle, grid = excluded.grid, known = excluded.known;

-- le chercheur peut cuisiner toutes les recettes trouvées, même les recettes secrètes des autres
create or replace function public._baron2_labo_can(p_v text, p_k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from baron2_recipes r where r.k = p_k and (r.known or r.patent or r.found_by = p_v
                   or (r.found_by is not null and (select owner_id from baron2_labo where id = 1) = p_v)))
      or exists (select 1 from baron2_labo_known n where n.player_id = p_v and n.k = p_k);
$$;

create or replace function public._baron2_labo_prime() returns numeric
language sql stable security definer set search_path = public as $$
  select _baron2_nice(greatest(1e9, coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.005));
$$;

create or replace function public.baron2_labo_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_labo; own boolean;
begin
  select * into L from baron2_labo where id = 1;
  own := L.owner_id is not null and L.owner_id = v;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.owner_id),
    'since', L.since,
    'patent_price', _baron2_patent_price(),
    'name_price', _baron2_labo_name_price(),
    'prime', _baron2_labo_prime(),
    'jackpot', case when exists (select 1 from baron2_recipes where k = 'piece' and found_by is null)
                    then greatest(L.jackpot, _baron2_nice(coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.02)) end,
    'book', coalesce((select jsonb_agg(jsonb_build_object(
        'k', r.k, 'ord', r.ord,
        'found', r.found_by is not null, 'known', r.known,
        'by', r.found_name, 'by_id', r.found_by, 'at', r.found_at, 'patent', r.patent,
        'name', case when r.found_by is not null or r.known then r.name end,
        'e', case when r.found_by is not null or r.known then r.e end,
        'city', case when r.found_by is not null or r.known then r.city end,
        'cook', c.can,
        'copied', exists (select 1 from baron2_labo_known n where n.player_id = v and n.k = r.k),
        'grid', case when c.can then r.grid end,
        'ings', case when c.can then (select jsonb_agg(x) from jsonb_array_elements_text(r.grid) x where x is not null) end,
        'n', case when c.can or own then (select count(*) from jsonb_array_elements_text(r.grid) x where x is not null) end,
        'hint', case when own and not c.can then r.riddle end,
        'what', case when own and not c.can and r.found_by is null and exists (select 1 from baron2_labo_names m where m.player_id = v and m.k = r.k) then r.name end
      ) order by r.ord) from baron2_recipes r cross join lateral (select _baron2_labo_can(v, r.k) can) c), '[]'::jsonb),
    'tries', coalesce((select jsonb_agg(jsonb_build_object('grid', t.grid, 'good', t.good, 'placed', t.placed, 'hit', t.hit, 'kind', t.kind, 'at', t.at) order by t.id desc)
               from (select * from baron2_labo_tries where player_id = v order by id desc limit 16) t), '[]'::jsonb),
    'ntries', (select count(*) from baron2_labo_tries where player_id = v),
    'roy', coalesce((select sum(coins) from baron2_credits where player_id = v and product in ('labo_roy', 'labo_prime') and at > now() - interval '24 hours'), 0),
    'now', now());
end $$;

-- un mélange : on accepte aussi les matières exotiques (p_state->'rare') ; prime au chercheur à chaque découverte ;
-- chaque raté grossit le grand prix de la pièce montée
create or replace function public.baron2_labo_try(p_token uuid, p_state jsonb, p_grid jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_labo; r baron2_recipes; x record; res int[]; best int[]; n int := 0; i int; g text; nm text;
        kind text; own boolean; avgf numeric; jp numeric;
begin
  select * into L from baron2_labo where id = 1;
  own := L.owner_id is not null and L.owner_id = v;
  if jsonb_typeof(p_grid) <> 'array' or jsonb_array_length(p_grid) <> 9 then raise exception 'grille invalide'; end if;
  for i in 0..8 loop
    g := nullif(p_grid->>i, '');
    if g is not null then
      if g !~ '^[a-z]{2,16}$' then raise exception 'grille invalide'; end if;
      if coalesce((p_state->'stock'->>g)::numeric, (p_state->'rare'->>g)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
      n := n + 1;
    end if;
  end loop;
  if n < 1 then raise exception 'grille vide'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select avg(greatest(0, fortune)) into avgf from _baron2_fortunes();
  select * into r from baron2_recipes where grid = _baron2_labo_norm(p_grid) for update;
  if r.k is not null then
    if _baron2_labo_can(v, r.k) then kind := 'known';
    elsif r.found_by is null then
      kind := 'found';
      select name into nm from baron2_players where id = v;
      update baron2_recipes set found_by = v, found_name = nm, found_at = now() where k = r.k;
      insert into baron2_credits(player_id, coins, product, qty, buyer)
        select id, 0, 'notice', 0, '⚗️ ' || nm || ' a découvert une recette au Laboratoire : ' || r.e || ' ' || r.name || ' !'
        from baron2_players where id <> v;
      if L.owner_id is not null then
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (L.owner_id, _baron2_labo_prime(), 'labo_prime', 0, r.k || '|' || nm);
      end if;
      if r.k = 'piece' then
        jp := greatest(L.jackpot, _baron2_nice(coalesce(avgf, 0) * 0.02));
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, jp, 'labo_jackpot', 0, 'piece');
        insert into baron2_credits(player_id, coins, product, qty, buyer)
          select id, 0, 'notice', 0, '🏆 ' || nm || ' a trouvé la pièce montée et remporte le grand prix du Laboratoire !' from baron2_players where id <> v;
        update baron2_labo set jackpot = 0 where id = 1;
      end if;
    else
      kind := 'copy';
      insert into baron2_labo_known(player_id, k) values (v, r.k) on conflict do nothing;
    end if;
    insert into baron2_labo_tries(player_id, k, grid, good, placed, hit, kind) values (v, r.k, p_grid, n, n, r.k, kind);
  else
    if own then
      for x in select k, grid from baron2_recipes loop
        if _baron2_labo_can(v, x.k) then continue; end if;
        res := _baron2_labo_eval(p_grid, x.grid);
        if best is null or res[1] * 10 + res[2] > best[1] * 10 + best[2] then best := res; end if;
      end loop;
    end if;
    insert into baron2_labo_tries(player_id, k, grid, good, placed) values (v, null, p_grid, coalesce(best[1], -1), coalesce(best[2], -1));
    if exists (select 1 from baron2_recipes where k = 'piece' and found_by is null) then
      update baron2_labo set jackpot = greatest(jackpot, _baron2_nice(coalesce(avgf, 0) * 0.02)) + _baron2_nice(greatest(1e7, coalesce(avgf, 0) * 0.0005)) where id = 1;
    end if;
  end if;
  return baron2_labo_get(p_token) || jsonb_build_object(
    'res', jsonb_build_object('hit', r.k, 'kind', kind,
             'good', case when r.k is null and own then coalesce(best[1], 0) end,
             'placed', case when r.k is null and own then coalesce(best[2], 0) end,
             'none', r.k is null and own and best is null),
    'credits', _baron2_credits(v, p_state));
end $$;

-- les matières exotiques vivent dans la sauvegarde (S.rare) : on refuse les anciens clients qui les effaceraient
do $f$ declare src text; begin
  select pg_get_functiondef('public._baron2_put(text, jsonb)'::regprocedure) into src;
  if position('''v7''' in src) = 0 then
    src := replace(src, $x$if old is not null and old ? 'v6'   and not p_state ? 'v6'   then raise exception 'ancienne version : recharge Querida'; end if;$x$,
      $x$if old is not null and old ? 'v6'   and not p_state ? 'v6'   then raise exception 'ancienne version : recharge Querida'; end if;
  if old is not null and old ? 'v7'   and not p_state ? 'v7'   then raise exception 'ancienne version : recharge Querida'; end if;$x$);
    execute src;
  end if;
end $f$;

-- ---------------------------------------------------------------- Crédits et charges
create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_choix_settle();
  perform _baron2_port_settle();
  perform _baron2_lotto_settle();
  perform _baron2_fly_settle();
  perform _baron2_loans_settle();
  perform _baron2_cara_settle();
  perform _baron2_spy_settle();
  perform _baron2_charges();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer) order by id), '[]'::jsonb)
          from (select * from baron2_credits
                where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
                order by id limit 300) c);
end $$;

create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0; top text; cr text;
begin
  if (select last_day from baron2_tax where id = 1) >= d then return; end if;
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  top := _baron2_top(); cr := _baron2_croupier();
  for r in
    select 'Port' place, owner_id pid, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product in ('port_fee', 'port_ins') and at > now() - interval '24 hours'), 0)) inc from baron2_port p
    union all select 'Envol', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product in ('fly_fee', 'fly_bank') and at > now() - interval '24 hours'), 0)) from baron2_fly f
    union all select 'Œufs', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = m.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0) from baron2_eggmaster m
    union all select 'Casino', cr, greatest(0, coalesce((select sum(stake - win) from baron2_spins where baron_id = cr and at > now() - interval '24 hours'), 0))
    union all select 'Destin', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = x.owner_id and product = 'destin_gain' and at > now() - interval '24 hours'), 0) from baron2_destin x
    union all select 'Caravane', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = k.owner_id and product in ('cara_fee', 'cara_ins', 'cara_rare') and at > now() - interval '24 hours'), 0)) from baron2_cara k
    union all select 'Espions', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = e.owner_id and product in ('spy_fee', 'spy_pay', 'spy_black') and at > now() - interval '24 hours'), 0) from baron2_spy e
    union all select 'Laboratoire', player_id, sum(coins) from baron2_credits where product in ('labo_roy', 'labo_prime') and at > now() - interval '24 hours' group by player_id
  loop
    if r.pid is null or r.pid = top then continue; end if;
    amt := floor(0.20 * greatest(0, r.inc));
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'charge', 0, r.place);
    insert into baron2_charges(day, player_id, place, income, amount) values (d, r.pid, r.place, r.inc, amt);
    tot := tot + amt;
  end loop;
  if (select cad_open from baron2_tax where id = 1) then
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
  end if;
  if top is not null and tot > 0 then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (top, tot, 'tribut', 0, 'Tribut');
  end if;
end $$;

grant execute on function public.baron2_spy_get(uuid), public.baron2_spy_buy(uuid, jsonb, text, text, numeric),
  public.baron2_spy_black(uuid, text, text, numeric), public.baron2_spy_black_answer(uuid, jsonb, bigint, boolean),
  public.baron2_spy_rumor(uuid, text, boolean, text), public.baron2_world(), public.baron2_cara_get(uuid),
  public.baron2_cara_rare_price(uuid, text, numeric), public.baron2_cara_rare_buy(uuid, jsonb, text, numeric, numeric),
  public.baron2_labo_get(uuid), public.baron2_labo_try(uuid, jsonb, jsonb) to anon, authenticated;
revoke all on function public._baron2_spy_kinds(), public._baron2_spy_settle(), public._baron2_cara_route(text), public._baron2_cara_settle(),
  public._baron2_cara_step(int, text, int, text, int), public._baron2_labo_can(text, text), public._baron2_labo_prime(),
  public._baron2_credits(text, jsonb), public._baron2_charges() from public, anon, authenticated;
