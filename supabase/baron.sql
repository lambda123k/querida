-- =====================================================================
-- Le Baron — base Supabase (joueurs, fermes, stocks, marché, produit doré)
-- Tables et fonctions préfixées baron_ ; rien d'autre dans Querida n'est touché.
-- Lecture publique de ce qui doit l'être (fortunes, fermes, prix) ; aucune écriture
-- directe : tout passe par des fonctions serveur qui vérifient le jeton secret
-- du joueur et calculent la production selon le temps écoulé.
-- =====================================================================

-- Remise à plat (la partie n'a pas encore commencé)
drop function if exists public.baron_golden_claim(uuid, uuid);
drop function if exists public.baron_golden_roll(uuid);
drop function if exists public.baron_sell(uuid, text, integer);
drop function if exists public.baron_harvest(uuid);
drop function if exists public.baron_state(uuid);
drop function if exists public.baron_join(uuid, text, text);
drop function if exists public.baron_join(text, text, text);
drop function if exists public.baron_player_from_token(uuid);
drop function if exists public.baron_price(text);
drop table if exists public.baron_golden, public.baron_market, public.baron_stocks,
  public.baron_farms, public.baron_secrets, public.baron_players, public.baron_resources cascade;

-- 1. Ressources (cahier §1) ------------------------------------------------
create table public.baron_resources (
  id           text primary key,
  label        text not null,
  emoji        text not null,
  unit_label   text not null,
  rate_per_h   numeric not null,
  base_price   integer not null,
  perish_hours integer,
  sort         integer not null
);
insert into public.baron_resources values
  ('oeufs', 'Œufs',  '🥚', 'poule',    6,   10,  24,   1),
  ('ble',   'Blé',   '🌾', 'champ',    5,   12,  null, 2),
  ('lait',  'Lait',  '🥛', 'vache',    3,   20,  12,   3),
  ('bois',  'Bois',  '🪵', 'bûcheron', 2,   30,  null, 4),
  ('laine', 'Laine', '🧶', 'mouton',   1,   60,  null, 5),
  ('miel',  'Miel',  '🍯', 'ruche',    0.5, 120, null, 6);

-- 2. Joueurs ---------------------------------------------------------------
create table public.baron_players (
  id            text primary key check (char_length(id) between 8 and 64),  -- profil Querida
  name          text not null check (char_length(name) between 1 and 30),
  specialty     text not null unique references public.baron_resources(id),
  coins         bigint not null default 0 check (coins >= 0),
  first_sale_at timestamptz,
  created_at    timestamptz not null default now()
);

create table public.baron_secrets (            -- aucune politique : invisible depuis l'appli
  player_id text primary key references public.baron_players(id) on delete cascade,
  token     uuid not null unique default gen_random_uuid()
);

-- 3. Fermes ----------------------------------------------------------------
create table public.baron_farms (
  id            uuid primary key default gen_random_uuid(),
  player_id     text not null references public.baron_players(id) on delete cascade,
  resource      text not null references public.baron_resources(id),
  units         integer not null default 1 check (units >= 1),
  accrued       numeric not null default 0,
  accrued_at    timestamptz not null default now(),
  lvl_entrepot  smallint not null default 0 check (lvl_entrepot  between 0 and 5),
  lvl_rendement smallint not null default 0 check (lvl_rendement between 0 and 5),
  lvl_fermier   smallint not null default 0 check (lvl_fermier   between 0 and 5),
  lvl_glaciere  smallint not null default 0 check (lvl_glaciere  between 0 and 5),
  lvl_reseau    smallint not null default 0 check (lvl_reseau    between 0 and 5),
  lvl_etal      smallint not null default 0 check (lvl_etal      between 0 and 5),
  created_at    timestamptz not null default now(),
  unique (player_id, resource)
);

-- 4. Stocks (par lots, pour la péremption) ---------------------------------
create table public.baron_stocks (
  id         bigint generated always as identity primary key,
  player_id  text not null references public.baron_players(id) on delete cascade,
  resource   text not null references public.baron_resources(id),
  qty        integer not null check (qty > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.baron_stocks (player_id, resource);

-- 5. Marché (prix partagé : −1 % par unité vendue, retour lent vers la base) --
create table public.baron_market (
  resource   text primary key references public.baron_resources(id),
  price      numeric not null,
  updated_at timestamptz not null default now()
);
insert into public.baron_market (resource, price) select id, base_price from public.baron_resources;

-- 6. Produit doré (tiré au sort côté serveur) -------------------------------
create table public.baron_golden (
  player_id text primary key references public.baron_players(id) on delete cascade,
  last_roll timestamptz not null default now() - interval '1 hour',
  golden_id uuid,
  until     timestamptz,
  day       date not null default current_date,
  n_today   integer not null default 0
);

-- Sécurité -------------------------------------------------------------------
alter table public.baron_resources enable row level security;
alter table public.baron_players   enable row level security;
alter table public.baron_secrets   enable row level security;
alter table public.baron_farms     enable row level security;
alter table public.baron_stocks    enable row level security;
alter table public.baron_market    enable row level security;
alter table public.baron_golden    enable row level security;
create policy "lecture" on public.baron_resources for select to anon using (true);
create policy "lecture" on public.baron_players   for select to anon using (true);  -- fortunes visibles
create policy "lecture" on public.baron_farms     for select to anon using (true);  -- village
create policy "lecture" on public.baron_market    for select to anon using (true);
-- baron_stocks, baron_secrets, baron_golden : rien de lisible (stocks des autres cachés)

-- =====================================================================
-- Calculs internes
-- =====================================================================
create function public.baron_rate(f public.baron_farms)
returns numeric language sql stable set search_path = public as $$
  select r.rate_per_h * f.units * (1 + 0.2 * f.lvl_rendement)
  from public.baron_resources r where r.id = f.resource
$$;

create function public.baron_cap(f public.baron_farms)          -- 8 h de production, +4 h / Entrepôt
returns numeric language sql stable set search_path = public as $$
  select public.baron_rate(f) * (8 + 4 * f.lvl_entrepot)
$$;

create function public.baron_pending(f public.baron_farms)      -- au-delà du plein : perdu
returns numeric language sql stable set search_path = public as $$
  select least(public.baron_cap(f),
               f.accrued + public.baron_rate(f) * extract(epoch from (now() - f.accrued_at)) / 3600.0)
$$;

create function public.baron_price(p_resource text)             -- prix actuel, revient vers la base (≈6 h)
returns numeric language sql stable set search_path = public as $$
  select r.base_price + (m.price - r.base_price)
         * exp(- extract(epoch from (now() - m.updated_at)) / 21600.0)
  from public.baron_market m join public.baron_resources r on r.id = m.resource
  where m.resource = p_resource
$$;

create function public.baron_player_from_token(p_token uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select player_id into v from public.baron_secrets where token = p_token;
  if v is null then raise exception 'jeton inconnu'; end if;
  return v;
end $$;

-- =====================================================================
-- Fonctions appelées par l'appli
-- =====================================================================

-- Rejoindre avec une spécialité libre → renvoie le jeton secret
create function public.baron_join(p_profile text, p_name text, p_resource text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  perform pg_advisory_xact_lock(4242);                       -- deux inscriptions simultanées
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
  insert into public.baron_secrets (player_id) values (p_profile) returning token into v_token;
  return v_token;
end $$;

-- État de ma ferme
create function public.baron_state(p_token uuid)
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
    'farms', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'resource', f.resource, 'units', f.units,
        'rate_per_h', public.baron_rate(f),
        'cap', public.baron_cap(f),
        'pending', public.baron_pending(f),
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

-- « Tout récolter »
create function public.baron_harvest(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  f public.baron_farms;
  v_pending numeric; v_take integer; v_perish integer;
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
    end if;
  end loop;
  return jsonb_build_object('gains', v_gains, 'state', public.baron_state(p_token));
end $$;

-- Vente instantanée au marché (cahier §5)
create function public.baron_sell(p_token uuid, p_resource text, p_qty integer)
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

  -- on vend d'abord ce qui périme le plus tôt
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

  -- chaque unité vendue fait baisser le prix de 1 % (somme géométrique)
  v_earned := floor(v_price * v_rate * (1 - power(0.99, p_qty)) / 0.01);
  update public.baron_market
     set price = greatest(v_base * 0.2, v_price * power(0.99, p_qty)), updated_at = now()
   where resource = p_resource;
  update public.baron_players
     set coins = coins + v_earned, first_sale_at = coalesce(first_sale_at, now())
   where id = v_id;

  return jsonb_build_object('earned', v_earned, 'state', public.baron_state(p_token));
end $$;

-- Produit doré : l'appli demande toutes les ~45 s si un produit doré apparaît.
-- ~1,5 % de chance par tirage (≈ 1 par heure d'écran ouvert), 3 par jour max, 8 s pour l'attraper.
create function public.baron_golden_roll(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := public.baron_player_from_token(p_token); g public.baron_golden;
begin
  select * into g from public.baron_golden where player_id = v_id for update;
  if g.day <> current_date then
    update public.baron_golden set day = current_date, n_today = 0 where player_id = v_id;
    g.n_today := 0;
  end if;
  if g.golden_id is not null and g.until > now() then
    return jsonb_build_object('id', g.golden_id, 'until', g.until);
  end if;
  if now() - g.last_roll < interval '40 seconds' or g.n_today >= 3 then
    return null;
  end if;
  update public.baron_golden set last_roll = now() where player_id = v_id;
  if random() < 0.015 then
    update public.baron_golden
       set golden_id = gen_random_uuid(), until = now() + interval '8 seconds', n_today = n_today + 1
     where player_id = v_id returning * into g;
    return jsonb_build_object('id', g.golden_id, 'until', g.until);
  end if;
  return null;
end $$;

-- Attraper le produit doré : ×50 produits de sa spécialité
create function public.baron_golden_claim(p_token uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := public.baron_player_from_token(p_token);
  v_res text; v_perish integer; v_glac smallint;
begin
  update public.baron_golden set golden_id = null, until = null
   where player_id = v_id and golden_id = p_id and until > now() - interval '2 seconds';
  if not found then raise exception 'trop tard'; end if;

  select p.specialty, r.perish_hours into v_res, v_perish
    from public.baron_players p join public.baron_resources r on r.id = p.specialty where p.id = v_id;
  select lvl_glaciere into v_glac from public.baron_farms where player_id = v_id and resource = v_res;
  insert into public.baron_stocks (player_id, resource, qty, expires_at)
  values (v_id, v_res, 50,
          case when v_perish is null then null
               else now() + make_interval(hours => v_perish * (1 + coalesce(v_glac, 0))) end);
  return jsonb_build_object('gains', jsonb_build_array(jsonb_build_object('resource', v_res, 'qty', 50)),
                            'state', public.baron_state(p_token));
end $$;

-- Droits ---------------------------------------------------------------------
revoke execute on function public.baron_player_from_token(uuid) from public, anon, authenticated;
grant execute on function public.baron_join(text, text, text)       to anon;
grant execute on function public.baron_state(uuid)                  to anon;
grant execute on function public.baron_harvest(uuid)                to anon;
grant execute on function public.baron_sell(uuid, text, integer)    to anon;
grant execute on function public.baron_golden_roll(uuid)            to anon;
grant execute on function public.baron_golden_claim(uuid, uuid)     to anon;
