-- =====================================================================
-- Le Baron — LE MARCHÉ DU VILLAGE (11 nov. 2026)
-- Le cours d'un produit bouge selon 6 forces. Cinq sont calculées sur le téléphone, à partir de l'heure
-- (saison, commande phare, nouvelle du village, liens entre produits, emballement). La 6e est partagée,
-- donc elle passe par le serveur : ce que TOUT le village achète et vend au village.
--   · chaque unité achetée au village pousse le cours vers le haut, chaque unité vendue vers le bas ;
--   · la poussée s'oublie de moitié toutes les 20 min ;
--   · elle est mesurée en « 30 min de production médiane » : en acheter autant multiplie le cours par 2.
-- La table garde aussi l'historique de la poussée (12 h) pour dessiner les courbes.
-- =====================================================================

create table if not exists public.baron2_press (
  product text primary key,
  p       numeric not null default 0,
  t       timestamptz not null default now(),
  hist    jsonb not null default '[]'::jsonb
);
alter table public.baron2_press enable row level security;   -- uniquement via les fonctions ci-dessous

-- production médiane du groupe, en unités / s (« prod » est en pièces / s au prix de base 10)
create or replace function public._baron2_med_eff() returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(0.5, coalesce(percentile_cont(0.5) within group (order by greatest((stats->>'prod')::numeric, 0)), 0) / 10)
  from baron2_players where updated_at > now() - interval '24 hours';
$$;

-- « profondeur » du village pour un produit : 30 min de production médiane (moins pour les recettes et sous-produits)
create or replace function public._baron2_depth(p_product text) returns numeric
language sql stable security definer set search_path = public as $$
  select _baron2_med_eff() * 1800 * case
    when p_product in ('pain','confiture') then 0.5
    when p_product in ('crepes','tarte') then 0.34
    when p_product = 'gateau' then 0.25
    when p_product in ('paille','plumes','cuir','noyaux','cire','sciure') then 0.1
    else 1 end;
$$;

create or replace function public._baron2_push(p_product text, p_units numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r baron2_press; np numeric; nowms bigint := floor(extract(epoch from now()) * 1000);
begin
  if p_product not in ('ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau',
                       'paille','plumes','cuir','noyaux','cire','sciure','biere','cidre','fromage','hydromel') then
    raise exception 'produit inconnu';
  end if;
  insert into baron2_press(product) values (p_product) on conflict do nothing;
  select * into r from baron2_press where product = p_product for update;
  np := r.p * power(0.5, greatest(0, extract(epoch from now() - r.t)) / 1200) + p_units / greatest(1, _baron2_depth(p_product));
  np := greatest(-4, least(4, np));
  update baron2_press set p = np, t = now(),
    hist = coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(r.hist) e
                       where (e->>0)::bigint > nowms - 12 * 3600000 order by (e->>0)::bigint desc limit 199) z), '[]'::jsonb)
           || jsonb_build_array(jsonb_build_array(nowms, round(np, 4)))
  where product = p_product;
  return jsonb_build_object('p', np, 't', nowms);
end $$;

-- vendre au village (p_units négatif) : enregistre la poussée pour tout le monde
create or replace function public.baron2_vtrade(p_token uuid, p_product text, p_units numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if p_units is null or p_units = 0 then return null; end if;
  return _baron2_push(p_product, greatest(-1e15, least(1e15, p_units)));
end $$;

-- acheter à la réserve du village : en plus, la poussée vers le haut
create or replace function public.baron2_reserve_buy(p_token uuid, p_product text, p_qty numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); sl bigint := _baron2_slot(); sz numeric; u numeric; g numeric;
begin
  if p_qty is null or p_qty < 1 then return 0; end if;
  sz := _baron2_res_size(p_product);
  insert into baron2_reserve(slot, product) values (sl, p_product) on conflict do nothing;
  select used into u from baron2_reserve where slot = sl and product = p_product for update;
  g := greatest(0, least(floor(p_qty), sz - u));
  if g > 0 then
    update baron2_reserve set used = used + g where slot = sl and product = p_product;
    perform _baron2_push(p_product, g);
  end if;
  delete from baron2_reserve where slot < sl - 3;
  return g;
end $$;

-- le monde : + la poussée de chaque produit et la profondeur médiane
create or replace function public.baron2_world() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players',  coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'specialty', specialty, 'stats', stats, 'updated_at', updated_at) order by created_at) from baron2_players), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'seller_id', seller_id, 'product', product, 'qty', qty, 'price', price, 'created_at', created_at) order by price, id) from baron2_listings), '[]'::jsonb),
    'trades',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'product', product, 'qty', qty, 'price', price, 'buyer_id', buyer_id, 'seller_id', seller_id, 'at', at) order by id)
                 from (select * from baron2_trades where at > now() - interval '7 days' order by id desc limit 3000) t), '[]'::jsonb),
    'reserve',  jsonb_build_object('slot', _baron2_slot(),
                 'size', (select jsonb_object_agg(k, _baron2_res_size(k)) from unnest(array['ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau']) k),
                 'used', coalesce((select jsonb_object_agg(product, used) from baron2_reserve where slot = _baron2_slot()), '{}'::jsonb)),
    'press',    coalesce((select jsonb_object_agg(product, jsonb_build_object('p', p, 't', floor(extract(epoch from t) * 1000), 'h', hist)) from baron2_press), '{}'::jsonb),
    'med',      _baron2_med_eff(),
    'now', now());
$$;

-- les commandes : + le produit de la grande commande des créneaux passés (pour les courbes)
create or replace function public.baron2_orders() returns jsonb
language plpgsql security definer set search_path = public as $$
declare sl bigint := _baron2_slot(); o baron2_orders; nx baron2_orders;
begin
  insert into baron2_orders(slot, list) values (sl, _baron2_gen_orders(sl)) on conflict do nothing;
  insert into baron2_orders(slot, list) values (sl + 1, _baron2_gen_orders(sl + 1)) on conflict do nothing;
  delete from baron2_orders where slot < sl - 72;
  select * into o from baron2_orders where slot = sl;
  select * into nx from baron2_orders where slot = sl + 1;
  return jsonb_build_object('slot', sl, 'list', o.list, 'winners', o.winners,
    'next_big', (select e->>'k' from jsonb_array_elements(nx.list) e where (e->>'big')::boolean limit 1),
    'bigs', coalesce((select jsonb_object_agg(b.slot::text, (select e->>'k' from jsonb_array_elements(b.list) e where (e->>'big')::boolean limit 1))
                      from baron2_orders b where b.slot >= sl - 72 and b.slot <= sl + 1), '{}'::jsonb),
    'ends', to_timestamp((sl + 1) * 1200), 'now', now());
end $$;

revoke all on function public._baron2_push(text, numeric) from public, anon, authenticated;
revoke all on function public._baron2_med_eff() from public, anon, authenticated;
revoke all on function public._baron2_depth(text) from public, anon, authenticated;
grant execute on function public.baron2_vtrade(uuid, text, numeric) to anon, authenticated;
grant execute on function public.baron2_reserve_buy(uuid, text, numeric) to anon, authenticated;
grant execute on function public.baron2_world() to anon, authenticated;
grant execute on function public.baron2_orders() to anon, authenticated;
