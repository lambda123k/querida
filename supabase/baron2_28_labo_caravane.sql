-- =====================================================================
-- Le Baron : le Laboratoire et la Caravane (15 nov. 2026) — PAS ENCORE EN LIGNE
-- (à lancer avec les autres nouveaux lieux, après baron2_27_destin.sql)
--
-- Le Laboratoire (un chercheur) : des recettes exotiques cachées, une grille de 3×3 façon Minecraft.
-- · Le chercheur choisit une énigme et place des produits dans la grille. Chaque essai brûle les produits
--   posés et coûte un peu d'argent (retirés sur le téléphone). Essais illimités.
-- · Réponse façon Mastermind, mais à moitié à l'aveugle : combien d'ingrédients sont justes et combien sont
--   à la bonne case, sans jamais dire lesquels. On ne sait pas non plus combien d'ingrédients il faut.
-- · Recette trouvée : seul son découvreur peut la cuisiner. Il peut déposer un brevet (payant) : tout le
--   monde peut alors la cuisiner, et il touche 5 % de chaque vente.
-- · Les produits exotiques ne se vendent qu'en caravane (pas au marché ni au village).
--
-- La Caravane (un voyageur) : de longs voyages en plusieurs étapes, uniquement des produits transformés
-- (recettes, produits de luxe, produits exotiques), jamais de récoltes brutes.
-- · Le voyageur choisit la route (Levant 3 h, Épices 6 h, Soie 10 h), sa commission et son assurance,
--   et donne le départ (sinon la caravane part seule 3 h après le premier chargement).
-- · À chaque ville, une partie de chaque lot est vendue, au cours du village au départ × le prix de la ville
--   (plus cher si la ville aime ce genre de produit, encore plus pour le produit exotique de la ville).
-- · Risques à chaque étape : pillage (−40 % de ce qui reste), tempête de sable (−20 %), douane (−30 % des ventes
--   de la ville). L'assurance (le voyageur fixe la prime) rembourse les marchandises perdues ; c'est le voyageur qui paie.
-- Attribution des lieux : plus tard (update baron2_labo / baron2_cara set owner_id = '<id>' where id = 1).
-- =====================================================================

-- ---------------------------------------------------------------- Laboratoire
create table if not exists baron2_labo (
  id int primary key default 1 check (id = 1),
  owner_id text references baron2_players(id) on delete set null,
  since timestamptz);
insert into baron2_labo(id) values (1) on conflict do nothing;
alter table baron2_labo enable row level security;

create table if not exists baron2_recipes (
  k text primary key,
  ord int not null,
  name text not null, e text not null,
  city text not null,                     -- la ville qui la paie le plus cher ('Partout' : toutes)
  riddle text not null,
  grid jsonb not null,                    -- 9 cases (ligne par ligne) : un produit ou null
  found_by text references baron2_players(id) on delete set null, found_name text, found_at timestamptz,
  patent boolean not null default false, patent_at timestamptz);
alter table baron2_recipes enable row level security;

insert into baron2_recipes(k, ord, name, e, city, riddle, grid) values
 ('zabaione', 1,  'Sabayon',         '🥂', 'Venise',     'Une crème de Venise : de quoi sucrer, quelque chose qui sort du poulailler, et un vin très doux. Forme : Une diagonale, d''un coin à l''autre.',
    '["sucre",null,null, null,"oeufs",null, null,null,"hydromel"]'),
 ('loukoum',  2,  'Loukoums',        '🌹', 'Istanbul',   'Des cubes moelleux d''Istanbul : une douceur, une farine, et un goût de verger. Forme : Une ligne de 3.',
    '[null,null,null, "sucre","ble","fruits", null,null,null]'),
 ('baklava',  3,  'Baklava',         '🥮', 'Damas',      'Des feuilles de pâte très fines, des fruits secs, et le trésor des abeilles… en double. Forme : Un L (3 cases en colonne, plus une à droite en bas).',
    '["crepes",null,null, "noyaux",null,null, "miel","miel",null]'),
 ('basbousa', 4,  'Basbousa',        '🟨', 'Le Caire',   'Un gâteau de semoule : une céréale, de quoi le sucrer, des fruits secs, et quelque chose de blanc qui vient de l''étable. Forme : Un carré de 2×2.',
    '["ble","sucre",null, "noyaux","lait",null, null,null,null]'),
 ('rhumarr',  5,  'Rhum arrangé',    '🍹', 'Zanzibar',   'Un alcool des îles qui fait mûrir des fruits, avec le sirop noir qui reste quand on fait le sucre. Forme : Un T à l''envers (1 case en haut, une ligne de 3 dessous).',
    '[null,"rhum",null, "fruits","melasse","fruits", null,null,null]'),
 ('chai',     6,  'Thé chaï',        '🫖', 'Bombay',     'Une boisson chaude d''Inde, lactée et bien sucrée. Forme : Une colonne de 3.',
    '[null,"miel",null, null,"lait",null, null,"sucre",null]'),
 ('encens',   7,  'Encens',          '🪔', 'Bagdad',     'Une fumée de palais : au cœur, ce qui fait briller les bougies, entouré de la ruche, du poulailler et de la forêt. Forme : Une croix +.',
    '[null,"sciure",null, "miel","cire","plumes", null,"sciure",null]'),
 ('halva',    8,  'Halva',           '🟫', 'Samarcande', 'Une pâte de graines broyées, adoucie, liée avec quelque chose de l''étable et une touche dorée. Forme : Un Y.',
    '["noyaux",null,"lait", null,"sucre",null, null,"miel",null]'),
 ('nan',      9,  'Nan aux noix',    '🫓', 'Kachgar',    'Un pain rond autour d''un trou, garni de fruits secs, doré au poulailler, avec une touche des abeilles. Forme : Un losange (les 4 bords, le centre vide).',
    '[null,"pain",null, "noyaux",null,"oeufs", null,"miel",null]'),
 ('mochi',    10, 'Mochi',           '🍡', 'Kyoto',      'Une pâte de céréale collante, fourrée d''une douceur de fruits cuits, et roulée dans quelque chose de blanc et sucré. Forme : Une diagonale, dans l''autre sens.',
    '[null,null,"ble", null,"confiture",null, "sucre",null,null]'),
 ('elixir',   11, 'Élixir d''Orient', '⚗️', 'Partout',   'Cinq trésors : deux alcools qui ont vieilli, l''or des abeilles, ce dont on fait les bougies, et un produit de l''étable affiné en cave. Forme : Un X (les 4 coins et le centre).',
    '["hydromel",null,"rhum", null,"miel",null, "cire",null,"fromage"]')
on conflict (k) do nothing;

create table if not exists baron2_labo_tries (
  id bigserial primary key,
  player_id text not null references baron2_players(id) on delete cascade,
  k text not null references baron2_recipes(k) on delete cascade,
  grid jsonb not null, good int not null, placed int not null,
  at timestamptz not null default now());
create index if not exists baron2_labo_tries_k on baron2_labo_tries(k, player_id, id);
alter table baron2_labo_tries enable row level security;

-- {bons ingrédients, bien placés, 1 si c'est exactement la recette}
create or replace function public._baron2_labo_eval(p_grid jsonb, p_target jsonb) returns int[]
language plpgsql immutable as $$
declare good int := 0; placed int := 0; exact int := 1; i int; g text; t text; tgt text[] := '{}'; mine text[] := '{}'; x text; p int;
begin
  for i in 0..8 loop
    g := nullif(p_grid->>i, ''); t := nullif(p_target->>i, '');
    if g is not null and g = t then placed := placed + 1; end if;
    if coalesce(g, '') <> coalesce(t, '') then exact := 0; end if;
    if t is not null then tgt := tgt || t; end if;
    if g is not null then mine := mine || g; end if;
  end loop;
  foreach x in array mine loop
    p := array_position(tgt, x);
    if p is not null then good := good + 1; tgt := tgt[1:p-1] || tgt[p+1:]; end if;
  end loop;
  return array[good, placed, exact];
end $$;

create or replace function public._baron2_labo_today() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from baron2_labo_tries
  where (at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date;
$$;

-- le brevet : 2 % de la fortune moyenne du village (au moins 10B)
create or replace function public._baron2_patent_price() returns numeric
language sql stable security definer set search_path = public as $$
  select _baron2_nice(greatest(1e10, coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.02));
$$;

create or replace function public.baron2_labo_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_labo;
begin
  select * into L from baron2_labo where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.owner_id),
    'since', L.since,
    'today', _baron2_labo_today(), 'max', null,
    'patent_price', _baron2_patent_price(),
    'book', coalesce((select jsonb_agg(jsonb_build_object(
        'k', r.k, 'riddle', r.riddle, 'city', r.city,
        'found', r.found_by is not null, 'by', r.found_name, 'by_id', r.found_by, 'at', r.found_at, 'patent', r.patent,
        'name', case when r.found_by is not null then r.name end,
        'e', case when r.found_by is not null then r.e end,
        -- les ingrédients : pour celui qui l'a trouvée, ou pour tous une fois brevetée
        'ings', case when r.found_by is not null and (r.patent or r.found_by = v)
                     then (select jsonb_agg(x) from jsonb_array_elements_text(r.grid) x where x is not null) end,
        'grid', case when r.found_by = v then r.grid end,
        'tries', case when v = L.owner_id then coalesce((select jsonb_agg(jsonb_build_object('grid', t.grid, 'good', t.good, 'placed', t.placed, 'at', t.at) order by t.id desc)
                     from (select * from baron2_labo_tries where k = r.k and player_id = v order by id desc limit 12) t), '[]'::jsonb) end,
        'ntries', (select count(*) from baron2_labo_tries where k = r.k)
      ) order by r.ord) from baron2_recipes r), '[]'::jsonb),
    'roy', coalesce((select sum(coins) from baron2_credits where player_id = v and product = 'labo_roy' and at > now() - interval '24 hours'), 0),
    'now', now());
end $$;

-- un essai : p_state est la ferme, produits posés et prix de l'essai déjà retirés
create or replace function public.baron2_labo_try(p_token uuid, p_state jsonb, p_k text, p_grid jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_labo; r baron2_recipes; res int[]; n int := 0; i int; g text; nm text;
begin
  select * into L from baron2_labo where id = 1 for update;
  if L.owner_id is null then raise exception 'pas de chercheur'; end if;
  if v is distinct from L.owner_id then raise exception 'pas le chercheur'; end if;
  select * into r from baron2_recipes where k = p_k for update;
  if r.k is null then raise exception 'recette inconnue'; end if;
  if r.found_by is not null then raise exception 'déjà trouvée'; end if;
  if jsonb_typeof(p_grid) <> 'array' or jsonb_array_length(p_grid) <> 9 then raise exception 'grille invalide'; end if;
  for i in 0..8 loop
    g := nullif(p_grid->>i, '');
    if g is not null then
      if g !~ '^[a-z]{2,16}$' then raise exception 'grille invalide'; end if;
      if coalesce((p_state->'stock'->>g)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
      n := n + 1;
    end if;
  end loop;
  if n < 1 then raise exception 'grille vide'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  res := _baron2_labo_eval(p_grid, r.grid);
  insert into baron2_labo_tries(player_id, k, grid, good, placed) values (v, p_k, p_grid, res[1], res[2]);
  if res[3] = 1 then
    select name into nm from baron2_players where id = v;
    update baron2_recipes set found_by = v, found_name = nm, found_at = now() where k = p_k;
    insert into baron2_credits(player_id, coins, product, qty, buyer)
      select id, 0, 'notice', 0, '🧪 ' || nm || ' a découvert une recette exotique au Laboratoire : ' || r.e || ' ' || r.name || ' !'
      from baron2_players where id <> v;
  end if;
  return baron2_labo_get(p_token) || jsonb_build_object(
    'res', jsonb_build_object('k', p_k, 'good', res[1], 'placed', res[2], 'found', res[3] = 1),
    'credits', _baron2_credits(v, p_state));
end $$;

-- le brevet : p_state est la ferme, prix du brevet déjà retiré
create or replace function public.baron2_labo_patent(p_token uuid, p_state jsonb, p_k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); r baron2_recipes;
begin
  select * into r from baron2_recipes where k = p_k for update;
  if r.k is null or r.found_by is distinct from v then raise exception 'pas ta recette'; end if;
  if r.patent then raise exception 'déjà brevetée'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  update baron2_recipes set patent = true, patent_at = now() where k = p_k;
  insert into baron2_credits(player_id, coins, product, qty, buyer)
    select id, 0, 'notice', 0, '📜 ' || r.found_name || ' a breveté sa recette : ' || r.e || ' ' || r.name || '. Tout le monde peut la cuisiner au Laboratoire et la vendre en caravane !'
    from baron2_players where id <> v;
  return baron2_labo_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- ---------------------------------------------------------------- Caravane
create table if not exists baron2_cara (
  id int primary key default 1 check (id = 1),
  owner_id text references baron2_players(id) on delete set null,
  since timestamptz,
  route text not null default 'levant',
  fee int not null default 10,
  ins_pct int,                              -- null : pas d'assurance
  cfg_at timestamptz,
  trip int not null default 1,
  on_road boolean not null default false,
  first_at timestamptz,                     -- premier chargement (départ automatique 3 h après)
  depart_at timestamptz,
  done_step int not null default 0);
insert into baron2_cara(id) values (1) on conflict do nothing;
alter table baron2_cara enable row level security;

create table if not exists baron2_cara_lots (
  id bigint generated always as identity primary key,
  trip int not null,
  player_id text not null references baron2_players(id) on delete cascade,
  name text not null,
  product text not null,
  qty numeric not null, left_qty numeric not null,
  unit numeric not null,                    -- le cours du village au chargement
  earned numeric not null default 0, lost numeric not null default 0,
  insured boolean not null default false, premium numeric not null default 0,
  at timestamptz not null default now());
create index if not exists baron2_cara_lots_trip on baron2_cara_lots(trip);
alter table baron2_cara_lots enable row level security;

create table if not exists baron2_cara_steps (
  id bigserial primary key,
  trip int not null, route text not null, step int not null, city text not null,
  event text,                               -- null, pillage, sable, douane
  sold numeric not null default 0,
  at timestamptz not null default now());
alter table baron2_cara_steps enable row level security;

-- les routes : durée d'une étape (h), risque par étape, villes (part vendue, prix × le cours, ce qu'elle aime)
create or replace function public._baron2_cara_route(r text) returns jsonb
language sql immutable as $$
  select case r
    when 'levant' then '{"name":"Route du Levant","h":1,"risk":0.08,"est":2.6,"cities":[
        {"c":"Venise","share":0.4,"m":2.2,"fav":"luxe"},{"c":"Istanbul","share":0.5,"m":2.6,"fav":"craft"},{"c":"Damas","share":1,"m":3,"fav":"craft"}]}'
    when 'epices' then '{"name":"Route des épices","h":2,"risk":0.12,"est":3.4,"cities":[
        {"c":"Le Caire","share":0.35,"m":2.8,"fav":"craft"},{"c":"Zanzibar","share":0.5,"m":3.4,"fav":"luxe"},{"c":"Bombay","share":1,"m":4,"fav":"craft"}]}'
    when 'soie' then '{"name":"Route de la soie","h":2.5,"risk":0.15,"est":4.4,"cities":[
        {"c":"Bagdad","share":0.3,"m":3.2,"fav":"luxe"},{"c":"Samarcande","share":0.4,"m":4,"fav":"craft"},{"c":"Kachgar","share":0.5,"m":4.8,"fav":"craft"},{"c":"Kyoto","share":1,"m":6,"fav":"luxe"}]}'
  end::jsonb;
$$;

-- recette, luxe ou exotique ; null : refusé (récoltes brutes, sous-produits)
create or replace function public._baron2_cara_cat(p text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p = any (array['pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche']) then 'craft'
    when p = any (array['biere','cidre','fromage','hydromel','rhum']) then 'luxe'
    when exists (select 1 from baron2_recipes where k = p and found_by is not null) then 'exo'
  end;
$$;

-- une étape : la ville achète une part de chaque lot (ou tout, à la dernière)
create or replace function public._baron2_cara_step(p_trip int, p_route text, p_step int, p_owner text, p_fee int) returns void
language plpgsql security definer set search_path = public as $$
declare rt jsonb := _baron2_cara_route(p_route); c jsonb; v_last boolean; ev text; x numeric; l record; cat text; rc baron2_recipes;
        v_lost numeric; v_sold numeric; mult numeric; gross numeric; fee numeric; roy numeric; refund numeric; tot numeric := 0;
begin
  c := rt->'cities'->(p_step - 1);
  v_last := p_step >= jsonb_array_length(rt->'cities');
  x := random();
  if random() < (rt->>'risk')::numeric then
    ev := case when x < 0.5 then 'pillage' when x < 0.8 then 'douane' else 'sable' end;
  end if;
  for l in select * from baron2_cara_lots where trip = p_trip and left_qty > 0 for update loop
    cat := _baron2_cara_cat(l.product);
    v_lost := case ev when 'pillage' then floor(l.left_qty * 0.4) when 'sable' then floor(l.left_qty * 0.2) else 0 end;
    v_sold := case when v_last then l.left_qty - v_lost else floor((l.left_qty - v_lost) * (c->>'share')::numeric) end;
    mult := (c->>'m')::numeric * case when cat = (c->>'fav') then 1.25 else 1 end;
    roy := 0; rc := null;
    if cat = 'exo' then
      select * into rc from baron2_recipes where k = l.product;
      if rc.city = (c->>'c') or rc.city = 'Partout' then mult := mult * 1.5; end if;
    end if;
    gross := floor(v_sold * l.unit * mult);
    if ev = 'douane' then gross := floor(gross * 0.7); end if;
    fee := case when p_owner is not null and p_owner <> l.player_id then floor(gross * p_fee / 100.0) else 0 end;
    if rc.k is not null and rc.patent and rc.found_by is not null and rc.found_by <> l.player_id then roy := floor(gross * 0.05); end if;
    if v_sold > 0 then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, gross - fee - roy, 'cara_sale', v_sold, l.product || '|' || (c->>'c') || '|' || coalesce(ev, ''));
      if fee > 0 then insert into baron2_credits(player_id, coins, product, qty, buyer) values (p_owner, fee, 'cara_fee', v_sold, l.name || '|' || (c->>'c')); end if;
      if roy > 0 then insert into baron2_credits(player_id, coins, product, qty, buyer) values (rc.found_by, roy, 'labo_roy', v_sold, l.product || '|' || l.name); end if;
    end if;
    if v_lost > 0 then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, 0, 'cara_lost', v_lost, l.product || '|' || (c->>'c') || '|' || ev);
      if l.insured and p_owner is not null then
        refund := floor(v_lost * l.unit * mult);
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, refund, 'cara_insured', v_lost, l.product);
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (p_owner, -refund, 'cara_ins', 1, l.name);
      end if;
    end if;
    update baron2_cara_lots set left_qty = left_qty - v_lost - v_sold, lost = baron2_cara_lots.lost + v_lost, earned = earned + gross - fee - roy where id = l.id;
    tot := tot + v_sold;
  end loop;
  insert into baron2_cara_steps(trip, route, step, city, event, sold) values (p_trip, p_route, p_step, c->>'c', ev, tot);
end $$;

create or replace function public._baron2_cara_settle() returns void
language plpgsql security definer set search_path = public as $$
declare C baron2_cara; rt jsonb; n int; s int;
begin
  select * into C from baron2_cara where id = 1 for update;
  if C.id is null then return; end if;
  if not C.on_road then
    -- départ automatique 3 h après le premier chargement
    if C.first_at is null or C.first_at > now() - interval '3 hours' then return; end if;
    update baron2_cara set on_road = true, depart_at = first_at + interval '3 hours', done_step = 0 where id = 1;
    select * into C from baron2_cara where id = 1;
  end if;
  rt := _baron2_cara_route(C.route); n := jsonb_array_length(rt->'cities');
  loop
    s := C.done_step + 1;
    exit when s > n or C.depart_at + make_interval(secs => (rt->>'h')::numeric * 3600 * s) > now();
    perform _baron2_cara_step(C.trip, C.route, s, C.owner_id, C.fee);
    C.done_step := s;
    update baron2_cara set done_step = s where id = 1;
  end loop;
  if C.done_step >= n then
    update baron2_cara set on_road = false, trip = trip + 1, first_at = null, depart_at = null, done_step = 0 where id = 1;
  end if;
end $$;

create or replace function public.baron2_cara_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_cara;
begin
  perform _baron2_cara_settle();
  select * into C from baron2_cara where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = C.owner_id),
    'since', C.since,
    'route', C.route, 'rt', _baron2_cara_route(C.route), 'fee', C.fee, 'ins', C.ins_pct, 'cfg_at', C.cfg_at,
    'trip', C.trip, 'on_road', C.on_road, 'first_at', C.first_at, 'depart_at', C.depart_at, 'done_step', C.done_step,
    'auto_at', C.first_at + interval '3 hours',
    'lots', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty, 'left', left_qty,
              'unit', unit, 'earned', earned, 'lost', lost, 'ins', insured, 'premium', premium) order by id) from baron2_cara_lots where trip = C.trip), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('step', step, 'city', city, 'event', event, 'sold', sold, 'at', at) order by step)
              from baron2_cara_steps where trip = C.trip), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (
              select s.id, s.trip, s.route, s.step, s.city, s.event, s.sold, s.at from baron2_cara_steps s where s.trip < C.trip order by s.id desc limit 12) x), '[]'::jsonb),
    'last', (select jsonb_agg(jsonb_build_object('pid', player_id, 'name', name, 'product', product, 'qty', qty, 'earned', earned, 'lost', lost, 'ins', insured) order by earned desc)
              from baron2_cara_lots where trip = C.trip - 1),
    'fees', case when v = C.owner_id then coalesce((select sum(coins) from baron2_credits where player_id = v and product in ('cara_fee', 'cara_ins') and at > now() - interval '24 hours'), 0) else 0 end,
    'now', now());
end $$;

-- charger un lot : p_state est la ferme, marchandise et prime d'assurance déjà retirées
create or replace function public.baron2_cara_load(p_token uuid, p_state jsonb, p_product text, p_qty numeric, p_unit numeric, p_insure boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_cara; cat text; q numeric := floor(p_qty); hold numeric; used numeric; nm text; prem numeric := 0; ins boolean;
begin
  perform _baron2_cara_settle();
  select * into C from baron2_cara where id = 1 for update;
  if C.owner_id is null then raise exception 'pas de voyageur'; end if;
  if C.on_road then raise exception 'caravane partie'; end if;
  cat := _baron2_cara_cat(p_product);
  if cat is null then raise exception 'produit refusé'; end if;
  if q < 1 or coalesce(p_unit, 0) <= 0 then raise exception 'cargaison invalide'; end if;
  if (select count(*) from baron2_cara_lots where trip = C.trip and player_id = v) >= 3 then raise exception 'trois lots'; end if;
  hold := floor(0.25 * 400 * power(2.6, coalesce((p_state->>'barn')::int, 1) - 1));
  select coalesce(sum(qty), 0) into used from baron2_cara_lots where trip = C.trip and player_id = v;
  if used + q > hold + 1 then raise exception 'chameaux pleins'; end if;
  if cat = 'exo' then
    if coalesce((p_state->'exo'->>p_product)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  elsif coalesce((p_state->'stock'->>p_product)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  ins := coalesce(p_insure, false) and C.owner_id <> v;
  if ins then
    if C.ins_pct is null then raise exception 'assurance fermée'; end if;
    prem := ceil(q * p_unit * (_baron2_cara_route(C.route)->>'est')::numeric * C.ins_pct / 100.0);
  end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_cara_lots(trip, player_id, name, product, qty, left_qty, unit, insured, premium) values (C.trip, v, nm, p_product, q, q, p_unit, ins, prem);
  if C.first_at is null then update baron2_cara set first_at = now() where id = 1; end if;
  if ins then insert into baron2_credits(player_id, coins, product, qty, buyer) values (C.owner_id, prem, 'cara_ins', 0, nm); end if;
  return baron2_cara_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- reprendre son lot avant le départ (marchandise et prime rendues)
create or replace function public.baron2_cara_unload(p_token uuid, p_state jsonb, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_cara; l baron2_cara_lots;
begin
  perform _baron2_cara_settle();
  select * into C from baron2_cara where id = 1 for update;
  select * into l from baron2_cara_lots where id = p_id for update;
  if l.id is null or l.player_id <> v or l.trip <> C.trip then raise exception 'lot introuvable'; end if;
  if C.on_road then raise exception 'caravane partie'; end if;
  delete from baron2_cara_lots where id = l.id;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, l.premium, 'cara_back', l.qty, l.product);
  if l.premium > 0 and C.owner_id is not null then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (C.owner_id, -l.premium, 'cara_ins', 2, l.name);
  end if;
  if not exists (select 1 from baron2_cara_lots where trip = C.trip) then update baron2_cara set first_at = null where id = 1; end if;
  return baron2_cara_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- le voyageur donne le départ
create or replace function public.baron2_cara_go(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_cara;
begin
  perform _baron2_cara_settle();
  select * into C from baron2_cara where id = 1 for update;
  if C.owner_id is distinct from v then raise exception 'pas le voyageur'; end if;
  if C.on_road then raise exception 'caravane partie'; end if;
  if not exists (select 1 from baron2_cara_lots where trip = C.trip) then raise exception 'caravane vide'; end if;
  update baron2_cara set on_road = true, depart_at = now(), done_step = 0 where id = 1;
  insert into baron2_credits(player_id, coins, product, qty, buyer)
    select distinct player_id, 0, 'cara_go', 0, C.route from baron2_cara_lots where trip = C.trip and player_id <> v;
  return baron2_cara_get(p_token);
end $$;

-- les réglages du voyageur (un changement toutes les 10 minutes ; la route seulement avant le départ)
create or replace function public.baron2_cara_cfg(p_token uuid, p_key text, p_val text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_cara;
begin
  select * into C from baron2_cara where id = 1 for update;
  if C.owner_id is distinct from v then raise exception 'pas le voyageur'; end if;
  if C.cfg_at is not null and C.cfg_at > now() - interval '10 minutes' then
    raise exception 'attends % min', ceil(extract(epoch from (C.cfg_at + interval '10 minutes' - now())) / 60);
  end if;
  if p_key = 'route' and p_val in ('levant', 'epices', 'soie') then
    if C.on_road then raise exception 'caravane partie'; end if;
    update baron2_cara set route = p_val, cfg_at = now() where id = 1;
  elsif p_key = 'fee' and p_val in ('5', '10', '15', '20') then update baron2_cara set fee = p_val::int, cfg_at = now() where id = 1;
  elsif p_key = 'ins' and p_val in ('off', '5', '10', '20', '30') then update baron2_cara set ins_pct = case when p_val = 'off' then null else p_val::int end, cfg_at = now() where id = 1;
  else raise exception 'réglage invalide';
  end if;
  return baron2_cara_get(p_token);
end $$;

-- ---------------------------------------------------------------- Branchements
-- les crédits règlent aussi les étapes de la caravane
create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_port_settle();
  perform _baron2_lotto_settle();
  perform _baron2_fly_settle();
  perform _baron2_loans_settle();
  perform _baron2_cara_settle();
  perform _baron2_charges();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer) order by id), '[]'::jsonb)
          from (select * from baron2_credits
                where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
                order by id limit 300) c);
end $$;

-- les charges du matin : la Caravane (commissions + primes) et le Laboratoire (brevets) paient comme les autres lieux
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
    union all select 'Caravane', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = k.owner_id and product in ('cara_fee', 'cara_ins') and at > now() - interval '24 hours'), 0)) from baron2_cara k
    -- le Laboratoire : ses brevets, payés à celui qui a trouvé la recette
    union all select 'Laboratoire', player_id, sum(coins) from baron2_credits where product = 'labo_roy' and at > now() - interval '24 hours' group by player_id
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

grant execute on function public.baron2_labo_get(uuid), public.baron2_labo_try(uuid, jsonb, text, jsonb), public.baron2_labo_patent(uuid, jsonb, text),
  public.baron2_cara_get(uuid), public.baron2_cara_load(uuid, jsonb, text, numeric, numeric, boolean), public.baron2_cara_unload(uuid, jsonb, bigint),
  public.baron2_cara_go(uuid), public.baron2_cara_cfg(uuid, text, text) to anon, authenticated;
revoke all on function public._baron2_labo_today(), public._baron2_patent_price(), public._baron2_cara_cat(text),
  public._baron2_cara_step(int, text, int, text, int), public._baron2_cara_settle(), public._baron2_credits(text, jsonb), public._baron2_charges()
  from public, anon, authenticated;
