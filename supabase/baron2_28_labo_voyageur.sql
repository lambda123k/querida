-- Le Baron : le Laboratoire et le Voyageur (15 nov. 2026) — PAS ENCORE EN LIGNE (à lancer avec les autres nouveaux lieux)
-- Laboratoire : 10 recettes exotiques cachées. Chacune = 1 recette + 1 produit de luxe + 1 sous-produit.
--   Le chercheur tente des mélanges (il perd les ingrédients et un peu d'argent) ; indice : combien d'ingrédients sont bons
--   (le meilleur score parmi les recettes encore cachées). Trouvée : il paie un brevet, la recette devient publique.
--   Chaque vente d'une recette brevetée au Voyageur lui rapporte 5 % (sauf ses propres ventes). Le brevet reste à celui qui l'a trouvé.
-- Voyageur : des voyages très lointains, longs et sûrs (pas de tempête), 3 caravanes à la fois pour tout le village.
--   Il achète seulement des plats cuisinés : recettes (×1,8 le cours) et produits de luxe (×1,8), et les plats exotiques
--   brevetés (×3,5 la valeur de leurs ingrédients, sans limite de quantité). Le voyageur prend 10 %, ouvre et ferme.
-- Attribution des lieux : plus tard (update baron2_lab / baron2_voy set owner_id = '<id>' where id = 1).

create table if not exists baron2_lab (
  id int primary key default 1 check (id = 1),
  owner_id text references baron2_players(id) on delete set null,
  since timestamptz);
insert into baron2_lab(id) values (1) on conflict do nothing;

create table if not exists baron2_exo (
  k text primary key, label text not null, e text not null, place text not null,
  craft text not null, aged text not null, sub text not null,
  found_by text references baron2_players(id) on delete set null, found_name text, found_at timestamptz,
  patent_at timestamptz,
  unique (craft, aged, sub));
insert into baron2_exo(k, label, e, place, craft, aged, sub) values
  ('mochi',    'Mochis',          '🍡', 'Kyoto',     'meringue',  'hydromel', 'plumes'),
  ('curry',    'Curry',           '🍛', 'Madras',    'pain',      'biere',    'melasse'),
  ('raviolis', 'Raviolis vapeur', '🥟', 'Canton',    'crepes',    'fromage',  'paille'),
  ('tajine',   'Tajine',          '🫕', 'Marrakech', 'confiture', 'cidre',    'noyaux'),
  ('ramen',    'Ramen',           '🍜', 'Tokyo',     'brioche',   'biere',    'sciure'),
  ('falafels', 'Falafels',        '🧆', 'Le Caire',  'pain',      'hydromel', 'cuir'),
  ('tamales',  'Tamales',         '🫔', 'Oaxaca',    'tarte',     'rhum',     'paille'),
  ('satay',    'Brochettes satay','🍢', 'Bangkok',   'caramel',   'rhum',     'cire'),
  ('lune',     'Gâteaux de lune', '🥮', 'Pékin',     'gateau',    'fromage',  'cire'),
  ('baklava',  'Baklava',         '🍯', 'Istanbul',  'bonbons',   'cidre',    'melasse')
on conflict do nothing;

create table if not exists baron2_lab_tries (
  id bigserial primary key, player_id text not null,
  craft text not null, aged text not null, sub text not null,
  hint int not null, hit_k text, at timestamptz not null default now());

create table if not exists baron2_voy (
  id int primary key default 1 check (id = 1),
  owner_id text references baron2_players(id) on delete set null,
  open boolean not null default true, since timestamptz);
insert into baron2_voy(id) values (1) on conflict do nothing;

create table if not exists baron2_trips (
  id bigserial primary key,
  player_id text not null, name text not null, owner_id text,
  product text not null, qty numeric not null, value numeric not null,
  fee numeric not null default 0, roy numeric not null default 0, roy_id text,
  exo boolean not null default false,
  depart timestamptz not null default now(), arrive timestamptz not null, settled boolean not null default false);
create index if not exists baron2_trips_open on baron2_trips(settled) where not settled;

alter table baron2_lab enable row level security;
alter table baron2_exo enable row level security;
alter table baron2_lab_tries enable row level security;
alter table baron2_voy enable row level security;
alter table baron2_trips enable row level security;

-- les réglages (un seul endroit)
create or replace function public._baron2_lab_cfg() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'try',    _baron2_nice(greatest(1e8,  coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.002)),
    'patent', _baron2_nice(greatest(1e10, coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.05)),
    'roy', 5, 'cook', 1800);
$$;
create or replace function public._baron2_voy_cfg() returns jsonb
language sql immutable as $$
  select '{"slots":3, "hours":8, "reg":1.8, "exo":3.5, "fee":10, "roy":5, "hold":3}'::jsonb;
$$;

-- recettes brevetées (publiques)
create or replace function public._baron2_exo_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('k', k, 'label', label, 'e', e, 'place', place,
           'rec', jsonb_build_object(craft, 1, aged, 1, sub, 1), 'by', found_by, 'byname', found_name, 'at', patent_at) order by patent_at), '[]'::jsonb)
  from baron2_exo where patent_at is not null;
$$;

create or replace function public.baron2_lab_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_lab; me boolean;
begin
  select * into L from baron2_lab where id = 1;
  me := v is not distinct from L.owner_id and v is not null;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.owner_id),
    'since', L.since, 'cfg', _baron2_lab_cfg(),
    'patents', _baron2_exo_public(),
    'hidden', (select count(*) from baron2_exo where found_by is null),
    'total', (select count(*) from baron2_exo),
    -- trouvées par moi, pas encore brevetées
    'found', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'label', label, 'e', e, 'place', place, 'rec', jsonb_build_object(craft, 1, aged, 1, sub, 1)))
               from baron2_exo where found_by = v and patent_at is null), '[]'::jsonb),
    'tries', case when me then coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (
               select id, craft, aged, sub, hint, hit_k, at from baron2_lab_tries where player_id = v order by id desc limit 30) x), '[]'::jsonb) else '[]'::jsonb end,
    'roy', coalesce((select sum(coins) from baron2_credits where player_id = v and product = 'lab_roy' and at > now() - interval '24 hours'), 0),
    'now', now());
end $$;

-- un essai : le téléphone a déjà retiré les ingrédients ; le serveur prend le prix de l'essai (crédit négatif)
create or replace function public.baron2_lab_try(p_token uuid, p_state jsonb, p_craft text, p_aged text, p_sub text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_lab; cost numeric; h int; hit text; nm text;
begin
  select * into L from baron2_lab where id = 1 for update;
  if L.owner_id is distinct from v then raise exception 'pas ton labo'; end if;
  if p_craft not in ('pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche')
     or p_aged not in ('biere','cidre','fromage','hydromel','rhum')
     or p_sub not in ('paille','plumes','cuir','noyaux','cire','sciure','melasse') then raise exception 'mélange invalide'; end if;
  cost := (_baron2_lab_cfg()->>'try')::numeric;
  if coalesce((p_state->>'coins')::numeric, -1) < cost then raise exception 'pas assez'; end if;
  if coalesce((p_state->'stock'->>p_craft)::numeric, -1) < 0 or coalesce((p_state->'stock'->>p_aged)::numeric, -1) < 0
     or coalesce((p_state->'stock'->>p_sub)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, -cost, 'lab_try', 0, 'Essai');
  -- le meilleur score parmi les recettes encore cachées
  select (case when craft = p_craft then 1 else 0 end) + (case when aged = p_aged then 1 else 0 end) + (case when sub = p_sub then 1 else 0 end), k
    into h, hit from baron2_exo where found_by is null
    order by 1 desc, k limit 1;
  h := coalesce(h, 0);
  if h = 3 then
    select name into nm from baron2_players where id = v;
    update baron2_exo set found_by = v, found_name = nm, found_at = now() where k = hit;
  else hit := null; end if;
  insert into baron2_lab_tries(player_id, craft, aged, sub, hint, hit_k) values (v, p_craft, p_aged, p_sub, h, hit);
  return baron2_lab_get(p_token) || jsonb_build_object('hint', h, 'hit', hit, 'credits', _baron2_credits(v, p_state));
end $$;

-- déposer le brevet : la recette devient publique (prix pris en crédit négatif)
create or replace function public.baron2_lab_patent(p_token uuid, p_state jsonb, p_k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); x baron2_exo; cost numeric := (_baron2_lab_cfg()->>'patent')::numeric;
begin
  select * into x from baron2_exo where k = p_k for update;
  if x.k is null or x.found_by is distinct from v then raise exception 'pas ta recette'; end if;
  if x.patent_at is not null then raise exception 'déjà brevetée'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < cost then raise exception 'pas assez'; end if;
  update baron2_exo set patent_at = now() where k = p_k;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, -cost, 'lab_patent', 0, x.label);
  insert into baron2_credits(player_id, coins, product, qty, buyer)
    select id, 0, 'lab_new', 0, x.e || '|' || x.label || '|' || x.found_name from baron2_players where id <> v;
  return baron2_lab_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- ---------- Le Voyageur ----------
create or replace function public._baron2_voy_settle() returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  for t in update baron2_trips set settled = true where not settled and arrive <= now() returning * loop
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (t.player_id, t.value - t.fee - t.roy, 'voy_back', t.qty, t.product);
    if t.fee > 0 and t.owner_id is not null then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (t.owner_id, t.fee, 'voy_fee', t.qty, t.name);
    end if;
    if t.roy > 0 and t.roy_id is not null then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (t.roy_id, t.roy, 'lab_roy', t.qty, t.product || '|' || t.name);
    end if;
  end loop;
end $$;

create or replace function public.baron2_voy_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare vy baron2_voy;
begin
  perform _baron2_voy_settle();
  select * into vy from baron2_voy where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = vy.owner_id),
    'open', vy.open, 'since', vy.since, 'cfg', _baron2_voy_cfg(),
    'patents', _baron2_exo_public(),
    'road', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty,
              'value', value - fee - roy, 'exo', exo, 'depart', depart, 'arrive', arrive) order by arrive) from baron2_trips where not settled), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty,
              'value', value - fee - roy, 'exo', exo, 'at', arrive) order by arrive desc) from (select * from baron2_trips where settled order by arrive desc limit 15) s), '[]'::jsonb),
    'fees', coalesce((select sum(coins) from baron2_credits where player_id = vy.owner_id and product = 'voy_fee' and at > now() - interval '24 hours'), 0),
    'now', now());
end $$;

create or replace function public.baron2_voy_set(p_token uuid, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_voy where id = 1) is distinct from v then raise exception 'pas ton lieu'; end if;
  update baron2_voy set open = coalesce(p_open, true) where id = 1;
  return baron2_voy_get();
end $$;

-- envoyer une cargaison : le téléphone a déjà retiré la marchandise ; p_unit = cours (recettes, luxe) ou valeur des ingrédients (exotique)
create or replace function public.baron2_voy_send(p_token uuid, p_state jsonb, p_product text, p_qty numeric, p_unit numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); vy baron2_voy; c jsonb := _baron2_voy_cfg(); q numeric := floor(p_qty); x baron2_exo; isx boolean := false;
        val numeric; fee numeric; roy numeric := 0; rid text; hold numeric; nm text;
begin
  select * into vy from baron2_voy where id = 1 for update;
  if vy.owner_id is null then raise exception 'pas de voyageur'; end if;
  if not vy.open then raise exception 'voyageur fermé'; end if;
  if (select count(*) from baron2_trips where not settled) >= (c->>'slots')::int then raise exception 'plus de caravane'; end if;
  if q < 1 or coalesce(p_unit, 0) <= 0 then raise exception 'cargaison invalide'; end if;
  select * into x from baron2_exo where k = p_product;
  if x.k is not null then
    if x.patent_at is null then raise exception 'pas brevetée'; end if;
    isx := true;
  elsif p_product not in ('pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche','biere','cidre','fromage','hydromel','rhum') then
    raise exception 'pas un plat';
  else
    hold := floor((c->>'hold')::numeric * 400 * power(2.6, coalesce((p_state->>'barn')::int, 1) - 1));
    if q > hold + 1 then raise exception 'caravane trop petite'; end if;
  end if;
  if coalesce((p_state->'stock'->>p_product)::numeric, -1) < 0 or coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  val := floor(q * p_unit * (c->>(case when isx then 'exo' else 'reg' end))::numeric);
  fee := case when vy.owner_id = v then 0 else floor(val * (c->>'fee')::numeric / 100) end;
  if isx and x.found_by is not null and x.found_by <> v then roy := floor(val * (c->>'roy')::numeric / 100); rid := x.found_by; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_trips(player_id, name, owner_id, product, qty, value, fee, roy, roy_id, exo, arrive)
    values (v, nm, vy.owner_id, p_product, q, val, fee, roy, rid, isx, now() + make_interval(hours => (c->>'hours')::int));
  return baron2_voy_get() || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

grant execute on function public.baron2_lab_get(uuid), public.baron2_lab_try(uuid, jsonb, text, text, text), public.baron2_lab_patent(uuid, jsonb, text),
  public.baron2_voy_get(), public.baron2_voy_set(uuid, boolean), public.baron2_voy_send(uuid, jsonb, text, numeric, numeric) to anon, authenticated;
revoke all on function public._baron2_lab_cfg(), public._baron2_exo_public(), public._baron2_voy_settle() from public, anon, authenticated;

-- les crédits règlent aussi les caravanes arrivées
create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_port_settle();
  perform _baron2_lotto_settle();
  perform _baron2_fly_settle();
  perform _baron2_loans_settle();
  perform _baron2_voy_settle();
  perform _baron2_charges();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer) order by id), '[]'::jsonb)
          from (select * from baron2_credits
                where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
                order by id limit 300) c);
end $$;

-- le Tribut du matin : le Voyageur (commissions) et le Laboratoire (brevets) paient aussi leurs charges au Baron
create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0; top text := _baron2_top();
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Port' place, owner_id pid, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product in ('port_fee', 'port_ins') and at > now() - interval '24 hours'), 0)) inc from baron2_port p
    union all select 'Envol', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product in ('fly_fee', 'fly_bank') and at > now() - interval '24 hours'), 0)) from baron2_fly f
    union all select 'Œufs', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = m.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0) from baron2_eggmaster m
    union all select 'Voyageur', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = y.owner_id and product = 'voy_fee' and at > now() - interval '24 hours'), 0) from baron2_voy y
    union all select 'Laboratoire', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = l.owner_id and product = 'lab_roy' and at > now() - interval '24 hours'), 0) from baron2_lab l
  loop
    if r.pid is null or r.pid = top then continue; end if;
    amt := floor(0.20 * greatest(0, r.inc));
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'charge', 0, r.place);
    insert into baron2_charges(day, player_id, place, income, amount) values (d, r.pid, r.place, r.inc, amt);
    tot := tot + amt;
  end loop;
  for r in
    select 'Port' place, owner_id pid, price_max pm from baron2_port where id = 1 and priced
    union all select 'Aérodrome', owner_id, price_max from baron2_fly where id = 1 and priced
  loop
    if r.pid is null or r.pid = top then continue; end if;
    amt := floor(0.02 * r.pm);
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'cad_tax', 0, r.place);
    tot := tot + amt;
  end loop;
  update baron2_port set price_max = price where id = 1;
  update baron2_fly set price_max = price where id = 1;
  if top is not null and tot > 0 then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (top, tot, 'tribut', 0, 'Tribut');
  end if;
end $$;
