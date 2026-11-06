-- =====================================================================
-- Le Baron — mise à jour 5 : le Marché
-- · Acheter n'importe quelle ressource au marché (+0,1 % sur le prix par unité achetée).
-- · Historique des prix (pour les courbes) à chaque achat et vente.
-- · Le crieur : 3 commandes du village ouvertes, le premier qui livre empoche 3× la valeur.
--   Ressource star du jour : compte double dans les commandes.
-- Ne supprime rien : les joueurs gardent tout.
-- =====================================================================

-- Historique des prix (lisible par tous)
create table if not exists public.baron_price_log (
  id       bigint generated always as identity primary key,
  resource text not null references public.baron_resources(id),
  price    numeric not null,
  at       timestamptz not null default now()
);
create index if not exists baron_price_log_res_at on public.baron_price_log (resource, at);
alter table public.baron_price_log enable row level security;
drop policy if exists "lecture" on public.baron_price_log;
create policy "lecture" on public.baron_price_log for select to anon using (true);
insert into public.baron_price_log (resource, price) select resource, round(public.baron_price(resource), 2) from public.baron_market;

-- Commandes du village (lisibles par tous)
create table if not exists public.baron_orders (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  items       jsonb not null,                -- {"oeufs": 120, "bois": 40}
  value       integer not null,
  reward      integer not null,
  star        text,
  winner_id   text references public.baron_players(id) on delete set null,
  winner_name text,
  won_at      timestamptz
);
alter table public.baron_orders enable row level security;
drop policy if exists "lecture" on public.baron_orders;
create policy "lecture" on public.baron_orders for select to anon using (true);

-- Ressource star : change chaque jour
create or replace function public.baron_star()
returns text language sql stable as $$
  select (array['oeufs','ble','lait','bois','laine','miel'])[((current_date - date '2026-01-01') % 6) + 1]
$$;

-- Retire une quantité du stock d'un joueur (les lots qui périment en premier)
create or replace function public.baron_take(p_player text, p_resource text, p_qty integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_left integer := p_qty; lot record;
begin
  for lot in select id, qty from public.baron_stocks where player_id = p_player and resource = p_resource
              order by expires_at nulls last, id for update loop
    exit when v_left = 0;
    if lot.qty <= v_left then delete from public.baron_stocks where id = lot.id; v_left := v_left - lot.qty;
    else update public.baron_stocks set qty = qty - v_left where id = lot.id; v_left := 0; end if;
  end loop;
  if v_left > 0 then raise exception 'stock insuffisant'; end if;
end $$;
revoke execute on function public.baron_take(text, text, integer) from public, anon, authenticated;

create or replace function public.baron_log_price(p_resource text)
returns void language sql security definer set search_path = public as $$
  insert into public.baron_price_log (resource, price) values (p_resource, round(public.baron_price(p_resource), 2));
  delete from public.baron_price_log where at < now() - interval '2 days';
$$;
revoke execute on function public.baron_log_price(text) from public, anon, authenticated;

-- Vente : comme avant + historique
create or replace function public.baron_sell(p_token uuid, p_resource text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_have integer; v_price numeric; v_base integer; v_rate numeric; v_earned bigint;
begin
  if p_qty is null or p_qty < 1 then raise exception 'quantité invalide'; end if;
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  select coalesce(sum(qty), 0) into v_have from public.baron_stocks where player_id = v_id and resource = p_resource;
  if v_have < p_qty then raise exception 'stock insuffisant'; end if;
  perform public.baron_take(v_id, p_resource, p_qty);
  perform 1 from public.baron_market where resource = p_resource for update;
  v_price := public.baron_price(p_resource);
  select base_price into v_base from public.baron_resources where id = p_resource;
  select 0.70 + 0.05 * coalesce(max(lvl_etal), 0) into v_rate from public.baron_farms where player_id = v_id;
  v_earned := floor(v_price * v_rate * (1 - power(0.999, p_qty)) / 0.001);
  update public.baron_market set price = greatest(v_base * 0.2, v_price * power(0.999, p_qty)), updated_at = now() where resource = p_resource;
  update public.baron_players set coins = coins + v_earned, earned = earned + v_earned, first_sale_at = coalesce(first_sale_at, now()) where id = v_id;
  update public.baron_actions set sold = sold + p_qty where player_id = v_id;
  perform public.baron_log_price(p_resource);
  return jsonb_build_object('earned', v_earned, 'state', public.baron_state(p_token));
end $$;

-- Achat au marché : prix plein, +0,1 % par unité (plafonné à 5× le prix de base)
create or replace function public.baron_buy(p_token uuid, p_resource text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_price numeric; v_base integer; v_perish integer; v_cost bigint; v_coins bigint;
begin
  if p_qty is null or p_qty < 1 or p_qty > 5000 then raise exception 'quantité invalide'; end if;
  perform 1 from public.baron_market where resource = p_resource for update;
  if not found then raise exception 'ressource inconnue'; end if;
  v_price := public.baron_price(p_resource);
  select base_price, perish_hours into v_base, v_perish from public.baron_resources where id = p_resource;
  v_cost := ceil(v_price * (power(1.001, p_qty) - 1) / 0.001);
  select coins into v_coins from public.baron_players where id = v_id for update;
  if v_coins < v_cost then raise exception 'pas assez de pièces'; end if;
  update public.baron_players set coins = coins - v_cost where id = v_id;
  insert into public.baron_stocks (player_id, resource, qty, expires_at)
  values (v_id, p_resource, p_qty, case when v_perish is null then null else now() + make_interval(hours => v_perish) end);
  update public.baron_market set price = least(v_base * 5, v_price * power(1.001, p_qty)), updated_at = now() where resource = p_resource;
  perform public.baron_log_price(p_resource);
  return jsonb_build_object('cost', v_cost, 'state', public.baron_state(p_token));
end $$;

-- Une nouvelle commande du village
create or replace function public.baron_order_new()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_res text[]; v_star text := public.baron_star(); v_target numeric; v_items jsonb := '{}'::jsonb;
  v_value integer := 0; r text; v_q integer; v_base integer; v_n integer;
begin
  -- uniquement des ressources que quelqu'un produit, pour que ce soit faisable
  select array_agg(specialty order by random()) into v_res from public.baron_players;
  if v_res is null then return; end if;
  v_n := least(array_length(v_res, 1), case when random() < 0.5 then 2 else 3 end);
  v_res := v_res[1:v_n];
  if v_star = any(select specialty from public.baron_players) and not v_star = any(v_res) and random() < 0.5 then
    v_res[1] := v_star;
  end if;
  -- la taille des commandes grandit avec la fortune moyenne du groupe
  v_target := 600 + coalesce((select avg(earned) from public.baron_players), 0) * 0.04;
  foreach r in array v_res loop
    select base_price into v_base from public.baron_resources where id = r;
    v_q := greatest(5, round(v_target / v_n / v_base / 5) * 5);
    v_items := v_items || jsonb_build_object(r, v_q);
    v_value := v_value + v_q * v_base * (case when r = v_star then 2 else 1 end);
  end loop;
  insert into public.baron_orders (expires_at, items, value, reward, star)
  values (now() + interval '2 hours', v_items, v_value, v_value * 3, v_star);
end $$;
revoke execute on function public.baron_order_new() from public, anon, authenticated;

-- Le crieur : toujours des commandes ouvertes (3 d'un coup s'il n'y en a plus, sinon une toutes les 10 min)
create or replace function public.baron_orders_tick()
returns void language plpgsql security definer set search_path = public as $$
declare v_open integer; v_last timestamptz;
begin
  perform pg_advisory_xact_lock(4243);
  select count(*) into v_open from public.baron_orders where winner_id is null and expires_at > now();
  select max(created_at) into v_last from public.baron_orders;
  if v_open = 0 then
    perform public.baron_order_new(); perform public.baron_order_new(); perform public.baron_order_new();
  elsif v_open < 3 and v_last < now() - interval '10 minutes' then
    perform public.baron_order_new();
  end if;
end $$;
revoke execute on function public.baron_orders_tick() from public, anon, authenticated;

-- Tout ce qu'il faut pour l'écran Marché
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
        'ago', coalesce((select l.price from public.baron_price_log l where l.resource = m.resource and l.at <= now() - interval '1 hour' order by l.at desc limit 1), r.base_price),
        'history', coalesce((select jsonb_agg(jsonb_build_array(extract(epoch from l.at)::bigint, l.price) order by l.at)
                    from (select at, price from public.baron_price_log where resource = m.resource and at > now() - interval '3 hours' order by at desc limit 60) l), '[]'::jsonb)))
      from public.baron_market m join public.baron_resources r on r.id = m.resource),
    'producers', (select jsonb_object_agg(specialty, name) from public.baron_players),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'items', o.items, 'reward', o.reward, 'star', o.star,
                 'expires_at', o.expires_at, 'winner', o.winner_name, 'mine', o.winner_id = v_id, 'won_at', o.won_at) order by o.winner_id nulls first, o.created_at), '[]'::jsonb)
               from public.baron_orders o
               where (o.winner_id is null and o.expires_at > now()) or o.won_at > now() - interval '30 minutes')
  );
end $$;

-- Livrer une commande : il faut tout avoir en stock
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
  update public.baron_players set coins = coins + o.reward, earned = earned + o.reward where id = v_id;
  return jsonb_build_object('reward', o.reward, 'state', public.baron_state(p_token), 'market', public.baron_market_view(p_token));
end $$;

grant execute on function public.baron_buy(uuid, text, integer)   to anon;
grant execute on function public.baron_market_view(uuid)          to anon;
grant execute on function public.baron_order_deliver(uuid, bigint) to anon;
