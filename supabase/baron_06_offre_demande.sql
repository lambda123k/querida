-- =====================================================================
-- Le Baron — mise à jour 6 : offre et demande, commandes à la mesure de chacun, classement
-- · Le marché a un vrai stock par produit : on n'achète que ce que les joueurs y ont vendu.
--   Stock vide → rupture, prix jusqu'à ×4. Marché plein → il n'achète plus.
--   Les villageois consomment 20 % du stock par heure (ça libère de la place).
--   Place au marché = 3 h de la production du groupe pour ce produit.
-- · Commandes : jusqu'à 6 ouvertes, une nouvelle toutes les 4 min, tailles calculées
--   d'après la production réelle de chaque produit.
-- · Classement : fortune (pièces + stock + bêtes), titres, rangs, règnes du Baron.
-- Ne supprime rien : les joueurs gardent tout.
-- =====================================================================

alter table public.baron_market
  add column if not exists stock    numeric,
  add column if not exists stock_at timestamptz not null default now();
alter table public.baron_players
  add column if not exists market_earned bigint  not null default 0,
  add column if not exists orders_won    integer not null default 0;
update public.baron_players p set orders_won = (select count(*) from public.baron_orders o where o.winner_id = p.id);

-- Production totale du groupe pour un produit (unités / h)
create or replace function public.baron_group_rate(p_res text)
returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(public.baron_rate(f)), 0) from public.baron_farms f where f.resource = p_res
$$;

-- Place au marché pour un produit : 3 h de production du groupe (40 minimum)
create or replace function public.baron_mcap(p_res text)
returns numeric language sql stable set search_path = public as $$
  select greatest(40, 3 * public.baron_group_rate(p_res))
$$;

-- Stock actuel du marché (les villageois en consomment 20 % par heure)
create or replace function public.baron_mstock(p_res text)
returns numeric language sql stable set search_path = public as $$
  select coalesce(m.stock, 0) * exp(-0.2 * extract(epoch from (now() - m.stock_at)) / 3600.0)
  from public.baron_market m where m.resource = p_res
$$;

-- Prix selon la rareté : normal à mi-stock, jusqu'à ×4 en rupture, ×0,35 quand c'est plein
create or replace function public.baron_price_at(p_res text, p_stock numeric)
returns numeric language sql stable set search_path = public as $$
  select r.base_price * least(4, greatest(0.35,
           power((c.cap / 2) / greatest(p_stock, c.cap * 0.05), 0.6)))
  from public.baron_resources r, (select public.baron_mcap(p_res) as cap) c
  where r.id = p_res
$$;

create or replace function public.baron_price(p_resource text)
returns numeric language sql stable set search_path = public as $$
  select public.baron_price_at(p_resource, public.baron_mstock(p_resource))
$$;

-- Au départ, chaque étal est à moitié plein (prix normal)
update public.baron_market set stock = public.baron_mcap(resource) / 2, stock_at = now() where stock is null;

-- Vente : le marché n'achète que s'il a de la place
create or replace function public.baron_sell(p_token uuid, p_resource text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_have integer; v_s numeric; v_cap numeric; v_q integer; v_rate numeric; v_earned bigint;
begin
  if p_qty is null or p_qty < 1 then raise exception 'quantité invalide'; end if;
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  select coalesce(sum(qty), 0) into v_have from public.baron_stocks where player_id = v_id and resource = p_resource;
  if v_have < 1 then raise exception 'stock insuffisant'; end if;
  perform 1 from public.baron_market where resource = p_resource for update;
  v_s := public.baron_mstock(p_resource); v_cap := public.baron_mcap(p_resource);
  v_q := least(p_qty, v_have, floor(v_cap - v_s)::int);
  if v_q < 1 then raise exception 'marché plein'; end if;
  perform public.baron_take(v_id, p_resource, v_q);
  select 0.70 + 0.05 * coalesce(max(lvl_etal), 0) into v_rate from public.baron_farms where player_id = v_id;
  v_earned := floor(v_q * public.baron_price_at(p_resource, v_s + v_q / 2.0) * v_rate);
  update public.baron_market set stock = v_s + v_q, stock_at = now(), updated_at = now() where resource = p_resource;
  update public.baron_players set coins = coins + v_earned, earned = earned + v_earned, market_earned = market_earned + v_earned,
         first_sale_at = coalesce(first_sale_at, now()) where id = v_id;
  update public.baron_actions set sold = sold + v_q where player_id = v_id;
  perform public.baron_log_price(p_resource);
  perform public.baron_reign_check();
  return jsonb_build_object('earned', v_earned, 'sold', v_q, 'state', public.baron_state(p_token));
end $$;

-- Achat : seulement ce qu'il y a en stock
create or replace function public.baron_buy(p_token uuid, p_resource text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_s numeric; v_perish integer; v_cost bigint; v_coins bigint;
begin
  if p_qty is null or p_qty < 1 then raise exception 'quantité invalide'; end if;
  perform 1 from public.baron_market where resource = p_resource for update;
  if not found then raise exception 'ressource inconnue'; end if;
  v_s := public.baron_mstock(p_resource);
  if floor(v_s) < 1 then raise exception 'rupture'; end if;
  if p_qty > floor(v_s) then raise exception 'pas assez au marché'; end if;
  select perish_hours into v_perish from public.baron_resources where id = p_resource;
  v_cost := ceil(p_qty * public.baron_price_at(p_resource, v_s - p_qty / 2.0));
  select coins into v_coins from public.baron_players where id = v_id for update;
  if v_coins < v_cost then raise exception 'pas assez de pièces'; end if;
  update public.baron_players set coins = coins - v_cost where id = v_id;
  insert into public.baron_stocks (player_id, resource, qty, expires_at)
  values (v_id, p_resource, p_qty, case when v_perish is null then null else now() + make_interval(hours => v_perish) end);
  update public.baron_market set stock = v_s - p_qty, stock_at = now(), updated_at = now() where resource = p_resource;
  perform public.baron_log_price(p_resource);
  return jsonb_build_object('cost', v_cost, 'state', public.baron_state(p_token));
end $$;

-- Une commande : 1 à 3 produits, chaque quantité = 20 à 60 min de la production du groupe
create or replace function public.baron_order_new()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_res text[]; v_star text := public.baron_star(); v_items jsonb := '{}'::jsonb;
  v_value integer := 0; r text; v_q integer; v_base integer; v_n integer; v_rate numeric;
begin
  select array_agg(distinct specialty) into v_res from public.baron_players;
  if v_res is null then return; end if;
  select array_agg(x order by random()) into v_res from unnest(v_res) x;
  v_n := least(array_length(v_res, 1), 1 + floor(random() * 3)::int);
  v_res := v_res[1:v_n];
  if v_star = any(select specialty from public.baron_players) and not v_star = any(v_res) and random() < 0.4 then
    v_res[1] := v_star;
  end if;
  foreach r in array v_res loop
    select base_price into v_base from public.baron_resources where id = r;
    v_rate := public.baron_group_rate(r);
    v_q := greatest(5, round(v_rate * (0.33 + random() * 0.67) / 5) * 5);
    v_items := v_items || jsonb_build_object(r, v_q);
    v_value := v_value + v_q * v_base * (case when r = v_star then 2 else 1 end);
  end loop;
  insert into public.baron_orders (expires_at, items, value, reward, star)
  values (now() + interval '90 minutes', v_items, v_value, round(v_value * 2.5), v_star);
end $$;
revoke execute on function public.baron_order_new() from public, anon, authenticated;

-- Le crieur : jusqu'à 6 commandes ouvertes (4 d'un coup s'il n'y en a plus, sinon une toutes les 4 min)
create or replace function public.baron_orders_tick()
returns void language plpgsql security definer set search_path = public as $$
declare v_open integer; v_last timestamptz;
begin
  perform pg_advisory_xact_lock(4243);
  select count(*) into v_open from public.baron_orders where winner_id is null and expires_at > now();
  select max(created_at) into v_last from public.baron_orders;
  if v_open = 0 then
    perform public.baron_order_new(); perform public.baron_order_new();
    perform public.baron_order_new(); perform public.baron_order_new();
  elsif v_open < 6 and v_last < now() - interval '4 minutes' then
    perform public.baron_order_new();
  end if;
end $$;
revoke execute on function public.baron_orders_tick() from public, anon, authenticated;

-- Écran Marché : + stock et place de chaque étal
create or replace function public.baron_market_view(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := public.baron_player_from_token(p_token);
begin
  perform public.baron_orders_tick();
  return jsonb_build_object(
    'now', now(),
    'star', public.baron_star(),
    'prices', (select jsonb_object_agg(m.resource, jsonb_build_object(
        'price', round(public.baron_price(m.resource), 2),
        'base', r.base_price,
        'stock', floor(public.baron_mstock(m.resource)),
        'cap', floor(public.baron_mcap(m.resource)),
        'rate', round(public.baron_group_rate(m.resource)),
        'ago', coalesce((select l.price from public.baron_price_log l where l.resource = m.resource and l.at <= now() - interval '1 hour' order by l.at desc limit 1), r.base_price),
        'history', coalesce((select jsonb_agg(jsonb_build_array(extract(epoch from l.at)::bigint, l.price) order by l.at)
                    from (select at, price from public.baron_price_log where resource = m.resource and at > now() - interval '3 hours' order by at desc limit 60) l), '[]'::jsonb)))
      from public.baron_market m join public.baron_resources r on r.id = m.resource),
    'producers', (select jsonb_object_agg(specialty, name) from public.baron_players),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'items', o.items, 'reward', o.reward, 'star', o.star,
                 'expires_at', o.expires_at, 'winner', o.winner_name, 'mine', o.winner_id = v_id, 'won_at', o.won_at) order by o.winner_id nulls first, o.created_at), '[]'::jsonb)
               from public.baron_orders o
               where (o.winner_id is null and o.expires_at > now()) or o.won_at > now() - interval '20 minutes')
  );
end $$;

-- Livrer : + compteur de commandes, + vérif du Baron
create or replace function public.baron_order_deliver(p_token uuid, p_order bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  o public.baron_orders; r text; v_q integer; v_have integer; v_name text;
begin
  select * into o from public.baron_orders where id = p_order for update;
  if not found then raise exception 'commande inconnue'; end if;
  if o.winner_id is not null then raise exception 'déjà livrée'; end if;
  if o.expires_at <= now() then raise exception 'commande expirée'; end if;
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  for r, v_q in select key, value::int from jsonb_each_text(o.items) loop
    select coalesce(sum(qty), 0) into v_have from public.baron_stocks where player_id = v_id and resource = r;
    if v_have < v_q then raise exception 'il te manque des produits'; end if;
  end loop;
  for r, v_q in select key, value::int from jsonb_each_text(o.items) loop
    perform public.baron_take(v_id, r, v_q);
  end loop;
  select name into v_name from public.baron_players where id = v_id;
  update public.baron_orders set winner_id = v_id, winner_name = v_name, won_at = now() where id = o.id;
  update public.baron_players set coins = coins + o.reward, earned = earned + o.reward, orders_won = orders_won + 1 where id = v_id;
  perform public.baron_reign_check();
  return jsonb_build_object('reward', o.reward, 'state', public.baron_state(p_token), 'market', public.baron_market_view(p_token));
end $$;

-- ----------------------------------------------------------------- Classement
-- Valeur des bêtes : ce qu'elles ont coûté (50 + 58 + 66 + …)
create or replace function public.baron_farm_value(p_units integer)
returns bigint language sql immutable as $$
  select coalesce((select sum(public.baron_unit_cost(i)) from generate_series(1, p_units - 1) i), 0)::bigint
$$;

create or replace function public.baron_fortunes()
returns table(player_id text, name text, specialty text, coins bigint, stock_value bigint, farm_value bigint,
              fortune bigint, prod_value bigint, units integer, orders_won integer, market_earned bigint, work integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.specialty, p.coins,
         coalesce((select sum(s.qty * r.base_price) from public.baron_stocks s join public.baron_resources r on r.id = s.resource
                   where s.player_id = p.id and (s.expires_at is null or s.expires_at > now())), 0)::bigint,
         coalesce((select sum(public.baron_farm_value(f.units)) from public.baron_farms f where f.player_id = p.id), 0)::bigint,
         0::bigint,   -- (fortune calculée par baron_ranking)
         coalesce((select sum(public.baron_rate(f) * r.base_price) from public.baron_farms f join public.baron_resources r on r.id = f.resource
                   where f.player_id = p.id), 0)::bigint,
         coalesce((select f.units from public.baron_farms f where f.player_id = p.id and f.resource = p.specialty), 1),
         p.orders_won, p.market_earned,
         coalesce((select a.taps + a.chores_done * 5 from public.baron_actions a where a.player_id = p.id), 0)
  from public.baron_players p
$$;
revoke execute on function public.baron_fortunes() from public, anon, authenticated;

-- Règnes du Baron
create table if not exists public.baron_reigns (
  id         bigint generated always as identity primary key,
  player_id  text references public.baron_players(id) on delete set null,
  name       text not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
alter table public.baron_reigns enable row level security;
drop policy if exists "lecture" on public.baron_reigns;
create policy "lecture" on public.baron_reigns for select to anon using (true);

-- Vérifie qui est le plus riche ; s'il a changé, nouveau règne (+ notification, 30 min mini entre deux)
create or replace function public.baron_reign_check()
returns void language plpgsql security definer set search_path = public as $$
declare v_top record; v_cur public.baron_reigns;
begin
  perform pg_advisory_xact_lock(4244);
  select f.player_id, f.name, (f.coins + f.stock_value + f.farm_value) as total into v_top
    from public.baron_fortunes() f order by (f.coins + f.stock_value + f.farm_value) desc limit 1;
  if v_top.player_id is null or v_top.total < 1000 then return; end if;
  select * into v_cur from public.baron_reigns where ended_at is null order by started_at desc limit 1;
  if v_cur.player_id is not distinct from v_top.player_id then return; end if;
  if v_cur.id is not null then update public.baron_reigns set ended_at = now() where id = v_cur.id; end if;
  insert into public.baron_reigns (player_id, name) values (v_top.player_id, v_top.name);
  -- on ne prévient tout le monde que si l'ancien Baron a régné au moins 30 min (pas de spam quand ça se joue à rien)
  if v_cur.id is not null and v_cur.started_at < now() - interval '30 minutes' then
    begin
      perform net.http_post(
        url := 'https://hslnyzbpuhmqekjbusrl.supabase.co/functions/v1/notify',
        body := jsonb_build_object('type', 'shared', 'title', '👑 Nouveau Baron !',
                  'body', v_top.name || ' détrône ' || v_cur.name || ' et devient le plus riche du Baron.'),
        headers := '{"Content-Type":"application/json","apikey":"sb_publishable_TQSglO05NtQHZ1TVF8xpdQ_l66-kAJI"}'::jsonb);
    exception when others then null;
    end;
  end if;
end $$;
revoke execute on function public.baron_reign_check() from public, anon, authenticated;

-- Le classement (lisible par tous, comme les fortunes)
create or replace function public.baron_ranking()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  perform public.baron_reign_check();
  select jsonb_agg(row_to_json(x)::jsonb order by x.fortune desc) into v_rows from (
    select f.player_id as id, f.name, f.specialty, f.coins, f.stock_value, f.farm_value,
           f.coins + f.stock_value + f.farm_value as fortune, f.prod_value, f.units, f.orders_won, f.market_earned, f.work
    from public.baron_fortunes() f) x;
  return jsonb_build_object(
    'now', now(),
    'players', coalesce(v_rows, '[]'::jsonb),
    'reign', (select to_jsonb(r) from public.baron_reigns r where ended_at is null order by started_at desc limit 1),
    'history', (select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
                from (select * from public.baron_reigns order by started_at desc limit 8) r)
  );
end $$;

grant execute on function public.baron_ranking() to anon;

-- Grands nombres : les primes peuvent dépasser 2 milliards
alter table public.baron_orders alter column value type bigint, alter column reward type bigint;
-- (baron_order_new utilise aussi des bigint pour v_value et v_q)
