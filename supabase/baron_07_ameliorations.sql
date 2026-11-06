-- =====================================================================
-- Le Baron — mise à jour 7 : les améliorations
-- 6 améliorations, 5 niveaux chacune. Coût : des pièces (selon ta production) + une ressource
-- d'un autre joueur (à acheter au marché ou à se procurer), doublés à chaque niveau.
--   Entrepôt (bois)     : +4 h avant que la ferme soit pleine
--   Rendement (blé)     : +20 % de production
--   Fermier (œufs)      : ramasse tout seul quand tu ouvres le jeu, et +4/8/12/24/48 h de capacité
--   Glacière (laine)    : œufs et lait se gardent 2×, 3×… plus longtemps
--   Réputation (lait)   : +10 % sur les primes des commandes   (colonne lvl_reseau)
--   Bel étal (miel)     : vente au marché 75 → 95 % (au lieu de 70 %)
-- Ne supprime rien.
-- =====================================================================

-- Heures de capacité apportées par le fermier
create or replace function public.baron_fermier_h(p_lvl integer)
returns integer language sql immutable as $$
  select (array[0, 4, 8, 12, 24, 48])[least(greatest(p_lvl, 0), 5) + 1]
$$;

-- Capacité de la ferme : 8 h + 4 h / Entrepôt + heures du fermier
create or replace function public.baron_cap(f public.baron_farms)
returns numeric language sql stable set search_path = public as $$
  select public.baron_rate(f) * (8 + 4 * f.lvl_entrepot + public.baron_fermier_h(f.lvl_fermier))
$$;

-- Ressource demandée par chaque amélioration
create or replace function public.baron_up_res(p_kind text)
returns text language sql immutable as $$
  select case p_kind when 'entrepot' then 'bois' when 'rendement' then 'ble' when 'fermier' then 'oeufs'
                     when 'glaciere' then 'laine' when 'reseau' then 'lait' when 'etal' then 'miel' end
$$;

-- Coût du prochain niveau : pièces = ¼ d'heure de ta production (300 mini) × 2^niveau ;
-- ressource = 10 min de la production du groupe pour ce produit (5 mini) × 2^niveau
create or replace function public.baron_up_cost(p_player text, p_kind text, p_lvl integer)
returns table(coins bigint, resource text, qty integer) language sql stable security definer set search_path = public as $$
  select (greatest(300, coalesce((select sum(public.baron_rate(f) * r.base_price) from public.baron_farms f
                                   join public.baron_resources r on r.id = f.resource where f.player_id = p_player), 0) * 0.25)
           * power(2, p_lvl))::bigint,
         public.baron_up_res(p_kind),
         (greatest(5, round(public.baron_group_rate(public.baron_up_res(p_kind)) / 6 / 5) * 5) * power(2, p_lvl))::int
$$;
revoke execute on function public.baron_up_cost(text, text, integer) from public, anon, authenticated;

-- Liste des améliorations d'un joueur (niveau, coût du suivant)
create or replace function public.baron_upgrades(p_player text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object('kind', k.kind, 'lvl', k.lvl,
           'coins', c.coins, 'resource', c.resource, 'qty', c.qty) order by k.ord)
  from public.baron_farms f
  join public.baron_players p on p.id = f.player_id and f.resource = p.specialty
  cross join lateral (values
    (1, 'entrepot', f.lvl_entrepot::int), (2, 'rendement', f.lvl_rendement::int), (3, 'fermier', f.lvl_fermier::int),
    (4, 'glaciere', f.lvl_glaciere::int), (5, 'reseau', f.lvl_reseau::int), (6, 'etal', f.lvl_etal::int)) k(ord, kind, lvl)
  cross join lateral public.baron_up_cost(p_player, k.kind, k.lvl) c
  where f.player_id = p_player
$$;
revoke execute on function public.baron_upgrades(text) from public, anon, authenticated;

-- Améliorer
create or replace function public.baron_upgrade(p_token uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  f public.baron_farms; v_lvl integer; c record; v_have integer; v_coins bigint;
begin
  if public.baron_up_res(p_kind) is null then raise exception 'amélioration inconnue'; end if;
  select fa.* into f from public.baron_farms fa join public.baron_players p on p.id = fa.player_id and fa.resource = p.specialty
   where fa.player_id = v_id for update;
  v_lvl := case p_kind when 'entrepot' then f.lvl_entrepot when 'rendement' then f.lvl_rendement when 'fermier' then f.lvl_fermier
                       when 'glaciere' then f.lvl_glaciere when 'reseau' then f.lvl_reseau when 'etal' then f.lvl_etal end;
  if v_lvl >= 5 then raise exception 'niveau maximum'; end if;
  select * into c from public.baron_up_cost(v_id, p_kind, v_lvl);
  select coins into v_coins from public.baron_players where id = v_id for update;
  if v_coins < c.coins then raise exception 'pas assez de pièces'; end if;
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  select coalesce(sum(qty), 0) into v_have from public.baron_stocks where player_id = v_id and resource = c.resource;
  if v_have < c.qty then raise exception 'il te manque des produits'; end if;
  perform public.baron_take(v_id, c.resource, c.qty);
  update public.baron_players set coins = coins - c.coins where id = v_id;
  -- on fige la production déjà faite avant de changer le rythme ou la capacité
  update public.baron_farms set accrued = public.baron_pending(f), accrued_at = now() where id = f.id;
  execute format('update public.baron_farms set %I = %I + 1 where id = $1',
                 'lvl_' || p_kind, 'lvl_' || p_kind) using f.id;
  return jsonb_build_object('kind', p_kind, 'lvl', v_lvl + 1, 'state', public.baron_state(p_token));
end $$;
grant execute on function public.baron_upgrade(uuid, text) to anon;

-- Le fermier ramasse tout seul : appelé à chaque ouverture / rafraîchissement
create or replace function public.baron_autoharvest(p_player text)
returns integer language plpgsql security definer set search_path = public as $$
declare f public.baron_farms; v_pending numeric; v_take integer; v_perish integer; v_total integer := 0;
begin
  for f in select * from public.baron_farms where player_id = p_player and lvl_fermier > 0 for update loop
    v_pending := public.baron_pending(f); v_take := floor(v_pending);
    if v_take > 0 then
      update public.baron_farms set accrued = v_pending - v_take, accrued_at = now() where id = f.id;
      select perish_hours into v_perish from public.baron_resources where id = f.resource;
      insert into public.baron_stocks (player_id, resource, qty, expires_at)
      values (p_player, f.resource, v_take, case when v_perish is null then null else now() + make_interval(hours => v_perish * (1 + f.lvl_glaciere)) end);
      v_total := v_total + v_take;
    end if;
  end loop;
  if v_total > 0 then update public.baron_actions set harvested = harvested + v_total where player_id = p_player; end if;
  return v_total;
end $$;
revoke execute on function public.baron_autoharvest(text) from public, anon, authenticated;

-- État : + améliorations, + ramassage du fermier
create or replace function public.baron_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_etal smallint; a public.baron_actions; q record; v_auto integer;
begin
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  v_auto := public.baron_autoharvest(v_id);
  select coalesce(max(lvl_etal), 0) into v_etal from public.baron_farms where player_id = v_id;
  select * into a from public.baron_actions where player_id = v_id;
  select * into q from public.baron_quest(coalesce(a.quests, 0) + 1);
  return jsonb_build_object(
    'now', now(),
    'player', (select to_jsonb(p) from public.baron_players p where p.id = v_id),
    'sell_rate', 0.70 + 0.05 * v_etal,
    'auto', v_auto,
    'upgrades', public.baron_upgrades(v_id),
    'combo', case when now() - a.last_chore < interval '40 seconds' then a.combo else 0 end,
    'energy', public.baron_energy(a),
    'counters', jsonb_build_object('taps', a.taps, 'harvested', a.harvested, 'sold', a.sold,
                                   'chores', a.chores_done, 'combo', a.max_combo, 'quests', a.quests),
    'quest', case when q.kind is null then null else
             jsonb_build_object('idx', a.quests + 1, 'kind', q.kind, 'target', q.target, 'reward', q.reward) end,
    'farms', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'resource', f.resource, 'units', f.units,
        'rate_per_h', public.baron_rate(f),
        'cap', public.baron_cap(f),
        'pending', public.baron_pending(f),
        'unit_cost', public.baron_unit_cost(f.units),
        'milestone', public.baron_milestone(f.units),
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

-- Livrer : la Réputation ajoute +10 % de prime par niveau
create or replace function public.baron_order_deliver(p_token uuid, p_order bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  o public.baron_orders; r text; v_q integer; v_have integer; v_name text; v_rep integer; v_reward bigint;
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
  select coalesce(max(f.lvl_reseau), 0) into v_rep from public.baron_farms f where f.player_id = v_id;
  v_reward := round(o.reward * (1 + 0.1 * v_rep));
  select name into v_name from public.baron_players where id = v_id;
  update public.baron_orders set winner_id = v_id, winner_name = v_name, won_at = now() where id = o.id;
  update public.baron_players set coins = coins + v_reward, earned = earned + v_reward, orders_won = orders_won + 1 where id = v_id;
  perform public.baron_reign_check();
  return jsonb_build_object('reward', v_reward, 'state', public.baron_state(p_token), 'market', public.baron_market_view(p_token));
end $$;
