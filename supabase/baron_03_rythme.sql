-- =====================================================================
-- Le Baron — mise à jour 3 : partie rapide
-- · Rythme ×10 : chaque ressource produit 10 fois plus vite.
-- · Marché ajusté : −0,1 % par unité vendue (au lieu de −1 %) pour que les prix tiennent.
-- · Corvées (arroser, nourrir, mauvaises herbes, renard) : produits tout de suite + combo.
-- · Achat d'unités dès la première vente : 500, puis ×1,5 à chaque fois.
-- Ne supprime rien : les joueurs déjà inscrits gardent tout.
-- =====================================================================

update public.baron_resources set rate_per_h = rate_per_h * 10;

-- Corvées : un « crédit » qui se recharge (1 corvée toutes les 12 s, 3 d'avance max) et un combo
create table if not exists public.baron_actions (
  player_id   text primary key references public.baron_players(id) on delete cascade,
  credit      numeric not null default 3,
  credit_at   timestamptz not null default now(),
  last_chore  timestamptz not null default now() - interval '1 hour',
  combo       integer not null default 0,
  chores_done integer not null default 0
);
alter table public.baron_actions enable row level security;   -- aucune politique : invisible
insert into public.baron_actions (player_id) select id from public.baron_players on conflict do nothing;

-- Prix de l'unité suivante selon le nombre déjà possédé : 1 → 500, 2 → 750, 3 → 1 125, 4 → 1 690…
create or replace function public.baron_unit_cost(p_units integer)
returns integer language sql immutable as $$
  select (round(500 * power(1.5, p_units - 1) / 5) * 5)::int
$$;

-- Les prix du marché reviennent vers leur base en ~2 h (au lieu de 6 h) : partie rapide
create or replace function public.baron_price(p_resource text)
returns numeric language sql stable set search_path = public as $$
  select r.base_price + (m.price - r.base_price)
         * exp(- extract(epoch from (now() - m.updated_at)) / 7200.0)
  from public.baron_market m join public.baron_resources r on r.id = m.resource
  where m.resource = p_resource
$$;

-- Inscription : on crée aussi la ligne des corvées
create or replace function public.baron_join(p_profile text, p_name text, p_resource text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from public.baron_players where id = p_profile) then
    raise exception 'déjà inscrit';
  end if;
  if (select count(*) from public.baron_players) >= 6 then
    raise exception 'partie complète';
  end if;
  if exists (select 1 from public.baron_players where specialty = p_resource) then
    raise exception 'spécialité déjà prise';
  end if;
  insert into public.baron_players (id, name, specialty) values (p_profile, trim(p_name), p_resource);
  insert into public.baron_farms (player_id, resource) values (p_profile, p_resource);
  insert into public.baron_golden (player_id) values (p_profile);
  insert into public.baron_actions (player_id) values (p_profile);
  insert into public.baron_secrets (player_id) values (p_profile) returning token into v_token;
  return v_token;
end $$;

-- État : on ajoute le prix de l'unité suivante et le combo en cours
create or replace function public.baron_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_etal smallint;
begin
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  select coalesce(max(lvl_etal), 0) into v_etal from public.baron_farms where player_id = v_id;
  return jsonb_build_object(
    'now', now(),
    'player', (select to_jsonb(p) from public.baron_players p where p.id = v_id),
    'sell_rate', 0.70 + 0.05 * v_etal,
    'combo', (select case when now() - a.last_chore < interval '40 seconds' then a.combo else 0 end
              from public.baron_actions a where a.player_id = v_id),
    'farms', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'resource', f.resource, 'units', f.units,
        'rate_per_h', public.baron_rate(f),
        'cap', public.baron_cap(f),
        'pending', public.baron_pending(f),
        'unit_cost', public.baron_unit_cost(f.units),
        'full_at', f.accrued_at + make_interval(secs =>
            greatest(0, (public.baron_cap(f) - f.accrued) / public.baron_rate(f) * 3600)),
        'levels', jsonb_build_object(
          'entrepot', f.lvl_entrepot, 'rendement', f.lvl_rendement, 'fermier', f.lvl_fermier,
          'glaciere', f.lvl_glaciere, 'reseau', f.lvl_reseau, 'etal', f.lvl_etal)
      ) order by f.created_at), '[]'::jsonb)
      from public.baron_farms f where f.player_id = v_id),
    'stocks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'resource', s.resource, 'qty', s.qty_total, 'next_expiry', s.next_expiry) order by s.sort), '[]'::jsonb)
      from (select st.resource, sum(st.qty) as qty_total, min(st.expires_at) as next_expiry, min(r.sort) as sort
            from public.baron_stocks st join public.baron_resources r on r.id = st.resource
            where st.player_id = v_id group by st.resource) s),
    'market', (
      select jsonb_object_agg(m.resource, round(public.baron_price(m.resource), 2))
      from public.baron_market m)
  );
end $$;

-- Vente : −0,1 % par unité (le rythme ×10 fait vendre 10 fois plus d'unités)
create or replace function public.baron_sell(p_token uuid, p_resource text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_have integer; v_left integer; v_price numeric; v_base integer;
  v_rate numeric; v_earned bigint; lot record;
begin
  if p_qty is null or p_qty < 1 then raise exception 'quantité invalide'; end if;
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  select coalesce(sum(qty), 0) into v_have from public.baron_stocks
   where player_id = v_id and resource = p_resource;
  if v_have < p_qty then raise exception 'stock insuffisant'; end if;
  v_left := p_qty;
  for lot in select id, qty from public.baron_stocks
              where player_id = v_id and resource = p_resource
              order by expires_at nulls last, id for update loop
    exit when v_left = 0;
    if lot.qty <= v_left then
      delete from public.baron_stocks where id = lot.id; v_left := v_left - lot.qty;
    else
      update public.baron_stocks set qty = qty - v_left where id = lot.id; v_left := 0;
    end if;
  end loop;
  perform 1 from public.baron_market where resource = p_resource for update;
  v_price := public.baron_price(p_resource);
  select base_price into v_base from public.baron_resources where id = p_resource;
  select 0.70 + 0.05 * coalesce(max(lvl_etal), 0) into v_rate from public.baron_farms where player_id = v_id;
  v_earned := floor(v_price * v_rate * (1 - power(0.999, p_qty)) / 0.001);
  update public.baron_market
     set price = greatest(v_base * 0.2, v_price * power(0.999, p_qty)), updated_at = now()
   where resource = p_resource;
  update public.baron_players
     set coins = coins + v_earned, first_sale_at = coalesce(first_sale_at, now())
   where id = v_id;
  return jsonb_build_object('earned', v_earned, 'state', public.baron_state(p_token));
end $$;

-- Faire une corvée : des produits tout de suite (quelques minutes de production), combo jusqu'à ×2
create or replace function public.baron_chore(p_token uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  a public.baron_actions; f public.baron_farms;
  v_min numeric; v_credit numeric; v_combo integer; v_qty integer; v_perish integer;
begin
  v_min := case p_kind when 'arroser' then 4 when 'nourrir' then 4 when 'herbes' then 6 when 'renard' then 8 end;
  if v_min is null then raise exception 'corvée inconnue'; end if;

  select * into a from public.baron_actions where player_id = v_id for update;
  if not found then
    insert into public.baron_actions (player_id) values (v_id) returning * into a;
  end if;
  v_credit := least(3, a.credit + extract(epoch from (now() - a.credit_at)) / 12.0);
  if v_credit < 1 then raise exception 'doucement'; end if;
  v_combo := case when now() - a.last_chore < interval '40 seconds' then least(5, a.combo + 1) else 0 end;

  select * into f from public.baron_farms fa
   where fa.player_id = v_id and fa.resource = (select specialty from public.baron_players where id = v_id);
  -- arrondi au hasard (juste en moyenne) : même le miel profite du combo
  v_qty := greatest(1, floor(public.baron_rate(f) * v_min / 60.0 * (1 + 0.2 * v_combo) + random()));

  select perish_hours into v_perish from public.baron_resources where id = f.resource;
  insert into public.baron_stocks (player_id, resource, qty, expires_at)
  values (v_id, f.resource, v_qty,
          case when v_perish is null then null
               else now() + make_interval(hours => v_perish * (1 + f.lvl_glaciere)) end);
  update public.baron_actions
     set credit = v_credit - 1, credit_at = now(), last_chore = now(),
         combo = v_combo, chores_done = chores_done + 1
   where player_id = v_id;

  return jsonb_build_object('resource', f.resource, 'qty', v_qty, 'combo', v_combo,
                            'state', public.baron_state(p_token));
end $$;

-- Acheter une unité de plus (poule, vache…) : débloqué après la première vente
create or replace function public.baron_buy_unit(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  p public.baron_players; f public.baron_farms; v_cost integer;
begin
  select * into p from public.baron_players where id = v_id for update;
  if p.first_sale_at is null then raise exception 'vends d''abord'; end if;
  select * into f from public.baron_farms where player_id = v_id and resource = p.specialty for update;
  v_cost := public.baron_unit_cost(f.units);
  if p.coins < v_cost then raise exception 'pas assez de pièces'; end if;
  -- on fige la production déjà faite avant d'ajouter l'unité
  update public.baron_farms
     set accrued = public.baron_pending(f), accrued_at = now(), units = units + 1
   where id = f.id;
  update public.baron_players set coins = coins - v_cost where id = v_id;
  return jsonb_build_object('cost', v_cost, 'state', public.baron_state(p_token));
end $$;

grant execute on function public.baron_chore(uuid, text) to anon;
grant execute on function public.baron_buy_unit(uuid)    to anon;
