-- =====================================================================
-- Le Baron — mise à jour 4 : un début de partie qui accroche
-- · Taper sur sa bête : produit tout de suite (énergie 30, +1 toutes les 4 s).
-- · Objectifs en chaîne avec récompenses (toujours un objectif affiché).
-- · Bêtes bien moins chères : 50, puis ×1,15 (au lieu de 500 puis ×1,5).
-- · Paliers : production ×2 à 10 bêtes, ×4 à 25, ×8 à 50.
-- · Cadeau d'arrivée : la ferme démarre avec 30 min de production à ramasser.
-- Ne supprime rien : les joueurs déjà inscrits gardent tout.
-- =====================================================================

alter table public.baron_actions
  add column if not exists energy    numeric not null default 30,
  add column if not exists energy_at timestamptz not null default now(),
  add column if not exists taps      integer not null default 0,
  add column if not exists tap_frac  numeric not null default 0,
  add column if not exists harvested integer not null default 0,
  add column if not exists sold      integer not null default 0,
  add column if not exists max_combo integer not null default 0,
  add column if not exists quests    integer not null default 0;
alter table public.baron_players add column if not exists earned bigint not null default 0;

-- Palier de production selon le nombre de bêtes
create or replace function public.baron_milestone(p_units integer)
returns integer language sql immutable as $$
  select case when p_units >= 50 then 8 when p_units >= 25 then 4 when p_units >= 10 then 2 else 1 end
$$;

create or replace function public.baron_rate(f public.baron_farms)
returns numeric language sql stable set search_path = public as $$
  select r.rate_per_h * f.units * (1 + 0.2 * f.lvl_rendement) * public.baron_milestone(f.units)
  from public.baron_resources r where r.id = f.resource
$$;

-- Prix de la bête suivante selon le nombre déjà possédé : 50, 58, 66, 76, 87…
create or replace function public.baron_unit_cost(p_units integer)
returns integer language sql immutable as $$
  select round(50 * power(1.15, p_units - 1))::int
$$;

-- Objectifs : condition et récompense (en pièces)
create or replace function public.baron_quest(p_idx integer)
returns table(kind text, target integer, reward integer) language sql immutable as $$
  select kind, target, reward from (values
    (1,  'harvested', 1,     30),
    (2,  'taps',      15,    40),
    (3,  'sold',      1,     60),
    (4,  'units',     2,     60),
    (5,  'chores',    2,     80),
    (6,  'units',     5,     150),
    (7,  'combo',     2,     150),
    (8,  'earned',    1000,  300),
    (9,  'units',     10,    500),
    (10, 'units',     15,    800),
    (11, 'earned',    10000, 1500),
    (12, 'units',     25,    3000)
  ) q(i, kind, target, reward) where q.i = p_idx
$$;

-- Énergie actuelle (30 max, +1 toutes les 4 s)
create or replace function public.baron_energy(a public.baron_actions)
returns numeric language sql stable as $$
  select least(30, a.energy + extract(epoch from (now() - a.energy_at)) / 4.0)
$$;

-- Inscription : cadeau d'arrivée (30 min de production déjà prêtes)
create or replace function public.baron_join(p_profile text, p_name text, p_resource text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from public.baron_players where id = p_profile) then raise exception 'déjà inscrit'; end if;
  if (select count(*) from public.baron_players) >= 6 then raise exception 'partie complète'; end if;
  if exists (select 1 from public.baron_players where specialty = p_resource) then raise exception 'spécialité déjà prise'; end if;
  insert into public.baron_players (id, name, specialty) values (p_profile, trim(p_name), p_resource);
  insert into public.baron_farms (player_id, resource, accrued)
    select p_profile, p_resource, r.rate_per_h * 0.5 from public.baron_resources r where r.id = p_resource;
  insert into public.baron_golden (player_id) values (p_profile);
  insert into public.baron_actions (player_id) values (p_profile);
  insert into public.baron_secrets (player_id) values (p_profile) returning token into v_token;
  return v_token;
end $$;

-- État : + compteurs, énergie, objectif en cours
create or replace function public.baron_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_etal smallint; a public.baron_actions; q record;
begin
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  select coalesce(max(lvl_etal), 0) into v_etal from public.baron_farms where player_id = v_id;
  select * into a from public.baron_actions where player_id = v_id;
  select * into q from public.baron_quest(coalesce(a.quests, 0) + 1);
  return jsonb_build_object(
    'now', now(),
    'player', (select to_jsonb(p) from public.baron_players p where p.id = v_id),
    'sell_rate', 0.70 + 0.05 * v_etal,
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

-- Récolte : on compte ce qui est ramassé (pour les objectifs)
create or replace function public.baron_harvest(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  f public.baron_farms;
  v_pending numeric; v_take integer; v_perish integer; v_total integer := 0;
  v_gains jsonb := '[]'::jsonb;
begin
  for f in select * from public.baron_farms where player_id = v_id for update loop
    v_pending := public.baron_pending(f);
    v_take := floor(v_pending);
    update public.baron_farms set accrued = v_pending - v_take, accrued_at = now() where id = f.id;
    if v_take > 0 then
      select perish_hours into v_perish from public.baron_resources where id = f.resource;
      insert into public.baron_stocks (player_id, resource, qty, expires_at)
      values (v_id, f.resource, v_take,
              case when v_perish is null then null
                   else now() + make_interval(hours => v_perish * (1 + f.lvl_glaciere)) end);
      v_gains := v_gains || jsonb_build_object('resource', f.resource, 'qty', v_take);
      v_total := v_total + v_take;
    end if;
  end loop;
  update public.baron_actions set harvested = harvested + v_total where player_id = v_id;
  return jsonb_build_object('gains', v_gains, 'state', public.baron_state(p_token));
end $$;

-- Vente : on compte les ventes et le total gagné
create or replace function public.baron_sell(p_token uuid, p_resource text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_have integer; v_left integer; v_price numeric; v_base integer;
  v_rate numeric; v_earned bigint; lot record;
begin
  if p_qty is null or p_qty < 1 then raise exception 'quantité invalide'; end if;
  delete from public.baron_stocks where player_id = v_id and expires_at <= now();
  select coalesce(sum(qty), 0) into v_have from public.baron_stocks where player_id = v_id and resource = p_resource;
  if v_have < p_qty then raise exception 'stock insuffisant'; end if;
  v_left := p_qty;
  for lot in select id, qty from public.baron_stocks where player_id = v_id and resource = p_resource
              order by expires_at nulls last, id for update loop
    exit when v_left = 0;
    if lot.qty <= v_left then delete from public.baron_stocks where id = lot.id; v_left := v_left - lot.qty;
    else update public.baron_stocks set qty = qty - v_left where id = lot.id; v_left := 0; end if;
  end loop;
  perform 1 from public.baron_market where resource = p_resource for update;
  v_price := public.baron_price(p_resource);
  select base_price into v_base from public.baron_resources where id = p_resource;
  select 0.70 + 0.05 * coalesce(max(lvl_etal), 0) into v_rate from public.baron_farms where player_id = v_id;
  v_earned := floor(v_price * v_rate * (1 - power(0.999, p_qty)) / 0.001);
  update public.baron_market set price = greatest(v_base * 0.2, v_price * power(0.999, p_qty)), updated_at = now() where resource = p_resource;
  update public.baron_players set coins = coins + v_earned, earned = earned + v_earned,
         first_sale_at = coalesce(first_sale_at, now()) where id = v_id;
  update public.baron_actions set sold = sold + p_qty where player_id = v_id;
  return jsonb_build_object('earned', v_earned, 'state', public.baron_state(p_token));
end $$;

-- Corvée : on retient le meilleur combo
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
  if not found then insert into public.baron_actions (player_id) values (v_id) returning * into a; end if;
  v_credit := least(3, a.credit + extract(epoch from (now() - a.credit_at)) / 12.0);
  if v_credit < 1 then raise exception 'doucement'; end if;
  v_combo := case when now() - a.last_chore < interval '40 seconds' then least(5, a.combo + 1) else 0 end;
  select * into f from public.baron_farms fa where fa.player_id = v_id and fa.resource = (select specialty from public.baron_players where id = v_id);
  v_qty := greatest(1, floor(public.baron_rate(f) * v_min / 60.0 * (1 + 0.2 * v_combo) + random()));
  select perish_hours into v_perish from public.baron_resources where id = f.resource;
  insert into public.baron_stocks (player_id, resource, qty, expires_at)
  values (v_id, f.resource, v_qty, case when v_perish is null then null else now() + make_interval(hours => v_perish * (1 + f.lvl_glaciere)) end);
  update public.baron_actions set credit = v_credit - 1, credit_at = now(), last_chore = now(), combo = v_combo,
         chores_done = chores_done + 1, max_combo = greatest(max_combo, v_combo) where player_id = v_id;
  return jsonb_build_object('resource', f.resource, 'qty', v_qty, 'combo', v_combo, 'state', public.baron_state(p_token));
end $$;

-- Achat d'une bête : plus besoin d'avoir vendu avant
create or replace function public.baron_buy_unit(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  p public.baron_players; f public.baron_farms; v_cost integer;
begin
  select * into p from public.baron_players where id = v_id for update;
  select * into f from public.baron_farms where player_id = v_id and resource = p.specialty for update;
  v_cost := public.baron_unit_cost(f.units);
  if p.coins < v_cost then raise exception 'pas assez de pièces'; end if;
  update public.baron_farms set accrued = public.baron_pending(f), accrued_at = now(), units = units + 1 where id = f.id;
  update public.baron_players set coins = coins - v_cost where id = v_id;
  return jsonb_build_object('cost', v_cost, 'state', public.baron_state(p_token));
end $$;

-- Taper sur sa bête : chaque tap vaut 10 pièces de produits (×palier), selon l'énergie
create or replace function public.baron_tap(p_token uuid, p_n integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  a public.baron_actions; f public.baron_farms;
  v_e numeric; v_take integer; v_val numeric; v_qty integer; v_perish integer; v_base integer;
begin
  select * into a from public.baron_actions where player_id = v_id for update;
  v_e := public.baron_energy(a);
  v_take := least(greatest(coalesce(p_n, 0), 0), 25, floor(v_e)::int);
  if v_take = 0 then
    return jsonb_build_object('qty', 0, 'taps', 0, 'energy', v_e);
  end if;
  select * into f from public.baron_farms fa where fa.player_id = v_id
     and fa.resource = (select specialty from public.baron_players where id = v_id);
  select base_price, perish_hours into v_base, v_perish from public.baron_resources where id = f.resource;
  v_val := a.tap_frac + v_take * 10.0 / v_base * public.baron_milestone(f.units);
  v_qty := floor(v_val);
  if v_qty > 0 then
    insert into public.baron_stocks (player_id, resource, qty, expires_at)
    values (v_id, f.resource, v_qty, case when v_perish is null then null
            else now() + make_interval(hours => v_perish * (1 + f.lvl_glaciere)) end);
  end if;
  update public.baron_actions set energy = v_e - v_take, energy_at = now(), taps = taps + v_take,
         tap_frac = v_val - v_qty where player_id = v_id;
  return jsonb_build_object('qty', v_qty, 'taps', v_take, 'resource', f.resource, 'state', public.baron_state(p_token));
end $$;

-- Récupérer la récompense de l'objectif en cours
create or replace function public.baron_quest_claim(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  a public.baron_actions; q record; v_have bigint; v_units integer; v_earned bigint;
begin
  select * into a from public.baron_actions where player_id = v_id for update;
  select * into q from public.baron_quest(a.quests + 1);
  if q.kind is null then raise exception 'plus d''objectif'; end if;
  select f.units into v_units from public.baron_farms f join public.baron_players p on p.id = f.player_id
   where f.player_id = v_id and f.resource = p.specialty;
  select earned into v_earned from public.baron_players where id = v_id;
  v_have := case q.kind when 'harvested' then a.harvested when 'taps' then a.taps when 'sold' then a.sold
              when 'units' then v_units when 'chores' then a.chores_done when 'combo' then a.max_combo
              when 'earned' then v_earned end;
  if v_have < q.target then raise exception 'pas encore'; end if;
  update public.baron_actions set quests = quests + 1 where player_id = v_id;
  update public.baron_players set coins = coins + q.reward, earned = earned + q.reward where id = v_id;
  return jsonb_build_object('reward', q.reward, 'idx', a.quests + 1, 'state', public.baron_state(p_token));
end $$;

grant execute on function public.baron_tap(uuid, integer)  to anon;
grant execute on function public.baron_quest_claim(uuid)   to anon;
