-- =====================================================================
-- Le Baron — mise à jour 8 : rythme plus progressif + nouvelle partie
-- · Bêtes : 60 pièces la première, +20 % chacune (avant : 50, +15 %)
-- · Paliers : ×1,5 à 10, ×2 à 25, ×3 à 50 (avant : ×2 / ×4 / ×8)
-- · Marché : les villageois consomment 40 % du stock par heure (avant : 20 %)
-- · Remise à zéro : on garde les joueurs (nom, spécialité, accès), tout le reste repart de zéro
-- =====================================================================

create or replace function public.baron_unit_cost(p_units integer)
returns integer language sql immutable as $$
  select round(60 * power(1.20, p_units - 1))::int
$$;

-- passe d'entier à décimal (×1,5) : il faut la recréer
drop function if exists public.baron_milestone(integer);
create function public.baron_milestone(p_units integer)
returns numeric language sql immutable as $$
  select case when p_units >= 50 then 3 when p_units >= 25 then 2 when p_units >= 10 then 1.5 else 1 end
$$;

create or replace function public.baron_mstock(p_res text)
returns numeric language sql stable set search_path = public as $$
  select coalesce(m.stock, 0) * exp(-0.4 * extract(epoch from (now() - m.stock_at)) / 3600.0)
  from public.baron_market m where m.resource = p_res
$$;

-- ---------- Nouvelle partie ----------
delete from public.baron_stocks;
delete from public.baron_orders;
delete from public.baron_price_log;
delete from public.baron_reigns;
delete from public.baron_farms f using public.baron_players p
 where p.id = f.player_id and f.resource <> p.specialty;
update public.baron_farms set units = 1, accrued = 0, accrued_at = now(),
  lvl_entrepot = 0, lvl_rendement = 0, lvl_fermier = 0, lvl_glaciere = 0, lvl_reseau = 0, lvl_etal = 0;
update public.baron_players set coins = 0, earned = 0, market_earned = 0, orders_won = 0, first_sale_at = null;
update public.baron_actions set credit = 3, credit_at = now(), last_chore = now() - interval '1 hour', combo = 0,
  chores_done = 0, energy = 30, energy_at = now(), taps = 0, tap_frac = 0, harvested = 0, sold = 0,
  max_combo = 0, quests = 0;
update public.baron_golden set last_roll = now() - interval '1 hour', until = null, n_today = 0, day = current_date;
update public.baron_market set stock = public.baron_mcap(resource) / 2, stock_at = now(), updated_at = now();
