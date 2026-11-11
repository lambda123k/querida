-- =====================================================================
-- Le Baron — réserve du village COMMUNE (11 nov. 2026)
-- Une seule réserve par produit pour tout le village, rechargée toutes les 20 min.
-- Taille = 60 s de la production cumulée des joueurs actifs (sauvegarde < 24 h), ÷3 pour les recettes :
-- plus il y a de joueurs actifs, plus elle est grosse. Si quelqu'un la vide, elle est vide pour tout le monde.
-- =====================================================================
create table if not exists public.baron2_reserve (
  slot    bigint not null,
  product text   not null check (product in ('ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau')),
  used    numeric not null default 0 check (used >= 0),
  primary key (slot, product)
);
alter table public.baron2_reserve enable row level security;   -- uniquement via les fonctions ci-dessous

create or replace function public._baron2_slot() returns bigint
language sql stable as $$ select floor(extract(epoch from now()) * 1000 / 1200000)::bigint $$;

create or replace function public._baron2_res_size(p_product text) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(30, ceil(60 * coalesce(sum(greatest((stats->>'prod')::numeric, 0)), 0)
                 / case when p_product in ('ble','oeufs','lait','fruits','miel','bois') then 1 else 3 end))
  from baron2_players where updated_at > now() - interval '24 hours';
$$;

-- acheter à la réserve : renvoie la quantité vraiment obtenue (0 si quelqu'un a été plus rapide)
create or replace function public.baron2_reserve_buy(p_token uuid, p_product text, p_qty numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); sl bigint := _baron2_slot(); sz numeric; u numeric; g numeric;
begin
  if p_qty is null or p_qty < 1 then return 0; end if;
  sz := _baron2_res_size(p_product);
  insert into baron2_reserve(slot, product) values (sl, p_product) on conflict do nothing;
  select used into u from baron2_reserve where slot = sl and product = p_product for update;
  g := greatest(0, least(floor(p_qty), sz - u));
  if g > 0 then update baron2_reserve set used = used + g where slot = sl and product = p_product; end if;
  delete from baron2_reserve where slot < sl - 3;
  return g;
end $$;

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
    'now', now());
$$;
grant execute on function public.baron2_reserve_buy(uuid, text, numeric) to anon, authenticated;
revoke all on function public._baron2_res_size(text) from public, anon, authenticated;
