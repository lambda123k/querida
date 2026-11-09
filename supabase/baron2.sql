-- =====================================================================
-- Le Baron (version 2) — base Supabase
-- Tables et fonctions préfixées baron2_ ; rien d'autre dans Querida n'est touché.
-- La ferme de chaque joueur est simulée sur son téléphone et sauvegardée ici (baron2_saves).
-- Le serveur garde ce qui est commun : joueurs, offres du marché, transactions, et l'argent
-- dû aux vendeurs (baron2_credits), versé à leur prochaine connexion.
-- Aucune lecture ni écriture directe des tables : tout passe par les fonctions ci-dessous,
-- qui vérifient le jeton secret du joueur.
-- =====================================================================

drop function if exists public.baron2_buy(uuid, jsonb, bigint, numeric, numeric);
drop function if exists public.baron2_unlist(uuid, jsonb, bigint, numeric);
drop function if exists public.baron2_list(uuid, jsonb, text, numeric, numeric);
drop function if exists public.baron2_world();
drop function if exists public.baron2_save(uuid, jsonb, jsonb);
drop function if exists public.baron2_load(uuid);
drop function if exists public.baron2_join(text, text, text, jsonb);
drop function if exists public.baron2_pid(uuid);
drop table if exists public.baron2_credits, public.baron2_trades, public.baron2_listings,
  public.baron2_saves, public.baron2_secrets, public.baron2_players cascade;

create table public.baron2_players (
  id         text primary key check (char_length(id) between 1 and 64),   -- profil Querida
  name       text not null check (char_length(name) between 1 and 30),
  specialty  text not null unique check (specialty in ('ble','oeufs','lait','fruits','miel','bois')),
  stats      jsonb not null default '{}'::jsonb,                          -- fortune, production… (classement)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.baron2_secrets (
  player_id text primary key references public.baron2_players(id) on delete cascade,
  token     uuid not null unique default gen_random_uuid()
);
create table public.baron2_saves (
  player_id text primary key references public.baron2_players(id) on delete cascade,
  state     jsonb not null,
  saved_at  timestamptz not null default now()
);
create table public.baron2_listings (
  id         bigint generated always as identity primary key,
  seller_id  text not null references public.baron2_players(id) on delete cascade,
  product    text not null,
  qty        numeric not null check (qty > 0),
  price      numeric not null check (price > 0),
  created_at timestamptz not null default now()
);
create index on public.baron2_listings (product, price);
create table public.baron2_trades (
  id        bigint generated always as identity primary key,
  product   text not null,
  qty       numeric not null,
  price     numeric not null,
  buyer_id  text not null,
  seller_id text not null,
  at        timestamptz not null default now()
);
create index on public.baron2_trades (at);
create table public.baron2_credits (
  id        bigint generated always as identity primary key,
  player_id text not null references public.baron2_players(id) on delete cascade,
  coins     numeric not null,
  product   text,
  qty       numeric,
  buyer     text,
  at        timestamptz not null default now()
);
create index on public.baron2_credits (player_id, id);

alter table public.baron2_players  enable row level security;
alter table public.baron2_secrets  enable row level security;
alter table public.baron2_saves    enable row level security;
alter table public.baron2_listings enable row level security;
alter table public.baron2_trades   enable row level security;
alter table public.baron2_credits  enable row level security;
-- aucune politique : les tables ne sont lisibles qu'à travers les fonctions

create or replace function public.baron2_pid(p_token uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select player_id into v from baron2_secrets where token = p_token;
  if v is null then raise exception 'jeton inconnu'; end if;
  return v;
end $$;

create or replace function public._baron2_put(p_pid text, p_state jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 200000 then
    raise exception 'état invalide';
  end if;
  insert into baron2_saves(player_id, state, saved_at) values (p_pid, p_state, now())
  on conflict (player_id) do update set state = excluded.state, saved_at = now();
end $$;

create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer) order by id), '[]'::jsonb)
  from (select * from baron2_credits
        where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
        order by id limit 300) c;
$$;

create or replace function public.baron2_join(p_profile text, p_name text, p_spec text, p_state jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if exists (select 1 from baron2_players where id = p_profile) then raise exception 'déjà inscrit'; end if;
  if (select count(*) from baron2_players) >= 6 then raise exception 'partie complète'; end if;
  if exists (select 1 from baron2_players where specialty = p_spec) then raise exception 'spécialité prise'; end if;
  begin
    insert into baron2_players(id, name, specialty) values (p_profile, left(coalesce(nullif(trim(p_name), ''), 'Ami'), 30), p_spec);
  exception when unique_violation then raise exception 'spécialité prise';
  end;
  insert into baron2_secrets(player_id) values (p_profile) returning token into t;
  perform _baron2_put(p_profile, p_state);
  return t;
end $$;

create or replace function public.baron2_load(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); s jsonb; me jsonb;
begin
  select state into s from baron2_saves where player_id = v;
  select jsonb_build_object('id', id, 'name', name, 'specialty', specialty) into me from baron2_players where id = v;
  return jsonb_build_object('me', me, 'state', s, 'credits', _baron2_credits(v, s), 'now', now());
end $$;

create or replace function public.baron2_save(p_token uuid, p_state jsonb, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  perform _baron2_put(v, p_state);
  if p_stats is not null and jsonb_typeof(p_stats) = 'object' and octet_length(p_stats::text) < 4000 then
    update baron2_players set stats = p_stats, updated_at = now() where id = v;
  end if;
  return jsonb_build_object('credits', _baron2_credits(v, p_state), 'now', now());
end $$;

create or replace function public.baron2_world() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players',  coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'specialty', specialty, 'stats', stats, 'updated_at', updated_at) order by created_at) from baron2_players), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'seller_id', seller_id, 'product', product, 'qty', qty, 'price', price, 'created_at', created_at) order by price, id) from baron2_listings), '[]'::jsonb),
    'trades',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'product', product, 'qty', qty, 'price', price, 'buyer_id', buyer_id, 'seller_id', seller_id, 'at', at) order by id)
                 from (select * from baron2_trades where at > now() - interval '7 days' order by id desc limit 3000) t), '[]'::jsonb),
    'now', now());
$$;

-- mettre en vente : la marchandise sort de la grange (l'état envoyé en tient compte) et attend un acheteur
create or replace function public.baron2_list(p_token uuid, p_state jsonb, p_product text, p_qty numeric, p_price numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); i bigint;
begin
  if p_product not in ('ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau') then raise exception 'produit inconnu'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1e18 or p_price is null or p_price <= 0 or p_price > 1e9 then raise exception 'offre invalide'; end if;
  if (select count(*) from baron2_listings where seller_id = v) >= 20 then raise exception 'trop d''offres'; end if;
  insert into baron2_listings(seller_id, product, qty, price) values (v, p_product, floor(p_qty), round(p_price, 1)) returning id into i;
  perform _baron2_put(v, p_state);
  return i;
end $$;

-- retirer son offre : la marchandise revient dans la grange
create or replace function public.baron2_unlist(p_token uuid, p_state jsonb, p_id bigint, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  delete from baron2_listings where id = p_id and seller_id = v and qty = p_qty;
  if not found then raise exception 'offre changée'; end if;
  perform _baron2_put(v, p_state);
end $$;

-- acheter à un joueur : le vendeur est payé à sa prochaine connexion
create or replace function public.baron2_buy(p_token uuid, p_state jsonb, p_id bigint, p_qty numeric, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); l baron2_listings; bn text;
begin
  select * into l from baron2_listings where id = p_id for update;
  if l.id is null or l.price <> p_price or l.qty < p_qty or p_qty < 1 then raise exception 'offre changée'; end if;
  if l.seller_id = v then raise exception 'ta propre offre'; end if;
  if l.qty = p_qty then delete from baron2_listings where id = l.id;
  else update baron2_listings set qty = qty - p_qty where id = l.id; end if;
  select name into bn from baron2_players where id = v;
  insert into baron2_trades(product, qty, price, buyer_id, seller_id) values (l.product, p_qty, l.price, v, l.seller_id);
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.seller_id, p_qty * l.price, l.product, p_qty, bn);
  perform _baron2_put(v, p_state);
end $$;

revoke all on function public._baron2_put(text, jsonb) from public, anon, authenticated;
revoke all on function public._baron2_credits(text, jsonb) from public, anon, authenticated;
revoke all on function public.baron2_pid(uuid) from public, anon, authenticated;
grant execute on function public.baron2_join(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.baron2_load(uuid) to anon, authenticated;
grant execute on function public.baron2_save(uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.baron2_world() to anon, authenticated;
grant execute on function public.baron2_list(uuid, jsonb, text, numeric, numeric) to anon, authenticated;
grant execute on function public.baron2_unlist(uuid, jsonb, bigint, numeric) to anon, authenticated;
grant execute on function public.baron2_buy(uuid, jsonb, bigint, numeric, numeric) to anon, authenticated;
