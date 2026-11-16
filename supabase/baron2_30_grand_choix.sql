-- =====================================================================
-- Le Baron : le grand choix des lieux (17 nov. 2026, 9 h) et les titres de propriété
-- À lancer après baron2_29_espions.sql.
--
-- · Jusqu'au 17 nov. 9 h : rien ne change (la Roulette reste au Baron, le Port et l'Aérodrome à leurs patrons).
-- · À 9 h : les 7 lieux (Roulette, Port, Aérodrome, Destin, Laboratoire, Caravane, Réseau d'espions) sont repris
--   à leurs patrons. Chaque joueur classe les 7 lieux, du préféré au moins voulu. Pas de limite de temps : le tirage
--   se fait tout seul dès que tout le monde a voté (Naïm peut le lancer avant ; ceux qui n'ont pas voté prennent
--   ce qui reste, au hasard).
-- · Le tirage, tour par tour : chacun demande son vœu le mieux classé parmi les lieux encore libres ; si plusieurs
--   veulent le même, tirage au sort ; les perdants passent à leur vœu suivant au tour d'après.
-- · La Roulette n'est plus liée au titre de Baron : elle a son propre patron (le croupier). Le Baron garde le Tribut
--   et son Bureau (les prêts).
-- · Ensuite, à tout moment : un patron peut mettre son lieu en vente au prix qu'il veut (le premier qui paie le
--   récupère), ou proposer d'échanger son lieu contre celui d'un autre (qui accepte ou refuse).
-- · Charges : le Destin et la Roulette paient aussi leurs 20 % chaque matin (sauf si le patron est le Baron).
-- =====================================================================

alter table baron2_casino add column if not exists owner_id text references baron2_players(id) on delete set null;
alter table baron2_casino add column if not exists since timestamptz;

create table if not exists baron2_choix (
  id int primary key default 1 check (id = 1),
  opens_at timestamptz not null,
  status text not null default 'avant' check (status in ('avant', 'voeux', 'fait')),
  drawn_at timestamptz,
  result jsonb);
insert into baron2_choix(id, opens_at) values (1, '2026-11-17 09:00:00 Europe/Paris') on conflict do nothing;
alter table baron2_choix enable row level security;

create table if not exists baron2_choix_voeux (
  player_id text primary key references baron2_players(id) on delete cascade,
  ranking jsonb not null,
  at timestamptz not null default now());
alter table baron2_choix_voeux enable row level security;

create table if not exists baron2_lieu_sales (
  place text primary key,
  seller_id text not null references baron2_players(id) on delete cascade,
  price numeric not null,
  at timestamptz not null default now());
alter table baron2_lieu_sales enable row level security;

create table if not exists baron2_lieu_swaps (
  id bigserial primary key,
  from_id text not null references baron2_players(id) on delete cascade,
  from_place text not null,
  to_id text not null references baron2_players(id) on delete cascade,
  to_place text not null,
  status text not null default 'attente',          -- attente, ok, non, annule
  at timestamptz not null default now());
alter table baron2_lieu_swaps enable row level security;

create or replace function public._baron2_lieux() returns text[]
language sql immutable as $$ select array['casino','port','fly','destin','labo','cara','spy'] $$;

create or replace function public._baron2_lieu_name(p text) returns text
language sql immutable as $$
  select case p when 'casino' then 'la Roulette' when 'port' then 'le Port' when 'fly' then 'l''Aérodrome' when 'destin' then 'le Destin'
    when 'labo' then 'le Laboratoire' when 'cara' then 'la Caravane' when 'spy' then 'le Réseau d''espions' end;
$$;

-- qui tient la Roulette : le Baron avant le grand choix, son patron ensuite
create or replace function public._baron2_croupier() returns text
language sql stable security definer set search_path = public as $$
  select case when coalesce((select status from baron2_choix where id = 1), 'avant') = 'avant' then _baron2_top()
              else (select owner_id from baron2_casino where id = 1) end;
$$;

create or replace function public._baron2_lieu_owner(p text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  return case p
    when 'casino' then _baron2_croupier()
    when 'port' then (select owner_id from baron2_port where id = 1)
    when 'fly' then (select owner_id from baron2_fly where id = 1)
    when 'destin' then (select owner_id from baron2_destin where id = 1)
    when 'labo' then (select owner_id from baron2_labo where id = 1)
    when 'cara' then (select owner_id from baron2_cara where id = 1)
    when 'spy' then (select owner_id from baron2_spy where id = 1) end;
end $$;

-- change le patron d'un lieu (null : plus de patron)
create or replace function public._baron2_lieu_set(p text, pid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p = 'casino' then update baron2_casino set owner_id = pid, since = now(), open = false where id = 1;
  elsif p = 'port' then update baron2_port set prev_id = owner_id, owner_id = pid, heir_id = null, since = now(), priced = false, safe_until = null, cfg_at = null where id = 1;
  elsif p = 'fly' then update baron2_fly set prev_id = owner_id, owner_id = pid, heir_id = null, since = now(), priced = false, safe_until = null, cfg_at = null where id = 1;
  elsif p = 'destin' then update baron2_destin set owner_id = pid, since = now() where id = 1;
  elsif p = 'labo' then update baron2_labo set owner_id = pid, since = now() where id = 1;
  elsif p = 'cara' then update baron2_cara set owner_id = pid, since = now() where id = 1;
  elsif p = 'spy' then update baron2_spy set owner_id = pid, since = now() where id = 1;
  else raise exception 'lieu inconnu'; end if;
  delete from baron2_lieu_sales where place = p;
  update baron2_lieu_swaps set status = 'annule' where status = 'attente' and (from_place = p or to_place = p);
end $$;

-- le tirage : tour par tour, chacun son meilleur vœu encore libre ; à plusieurs sur le même lieu, au sort
create or replace function public._baron2_choix_draw() returns void
language plpgsql security definer set search_path = public as $$
declare free text[] := _baron2_lieux(); todo text[]; rnd int := 0; p record; want jsonb; w text; x text; lieu text; win text; log jsonb := '[]'::jsonb; nm text;
        txt text := '';
begin
  select array_agg(id order by random()) into todo from baron2_players;
  for x in select unnest(_baron2_lieux()) loop perform _baron2_lieu_set(x, null); end loop;
  while coalesce(array_length(todo, 1), 0) > 0 and coalesce(array_length(free, 1), 0) > 0 loop
    rnd := rnd + 1;
    want := '{}'::jsonb;
    foreach x in array todo loop
      -- ceux qui n'ont pas voté passent après tous les autres
      if not exists (select 1 from baron2_choix_voeux where player_id = x)
         and exists (select 1 from unnest(todo) y join baron2_choix_voeux v on v.player_id = y) then continue; end if;
      w := null;
      select r into w from baron2_choix_voeux v, jsonb_array_elements_text(v.ranking) with ordinality as t(r, i)
        where v.player_id = x and r = any(free) order by i limit 1;
      if w is null then w := free[1 + floor(random() * array_length(free, 1))::int]; end if;   -- pas de vœu : au hasard
      want := jsonb_set(want, array[w], coalesce(want->w, '[]'::jsonb) || to_jsonb(x));
    end loop;
    for lieu in select jsonb_object_keys(want) loop
      select e into win from jsonb_array_elements_text(want->lieu) e order by random() limit 1;
      perform _baron2_lieu_set(lieu, win);
      log := log || jsonb_build_object('place', lieu, 'id', win, 'name', (select name from baron2_players where id = win), 'round', rnd,
        'others', coalesce((select jsonb_agg(pl.name) from jsonb_array_elements_text(want->lieu) e join baron2_players pl on pl.id = e where e <> win), '[]'::jsonb),
        'voted', exists (select 1 from baron2_choix_voeux where player_id = win));
      free := array_remove(free, lieu); todo := array_remove(todo, win);
    end loop;
  end loop;
  update baron2_choix set status = 'fait', drawn_at = now(), result = log where id = 1;
  select string_agg((e->>'name') || ' : ' || _baron2_lieu_name(e->>'place'), ', ' order by e->>'round', e->>'name') into txt from jsonb_array_elements(log) e;
  insert into baron2_credits(player_id, coins, product, qty, buyer)
    select pl.id, 0, 'choix_fait', 0, coalesce((select e->>'place' from jsonb_array_elements(log) e where e->>'id' = pl.id), '') || '|' || coalesce(txt, '')
    from baron2_players pl;
end $$;

create or replace function public._baron2_choix_settle() returns void
language plpgsql security definer set search_path = public as $$
declare C baron2_choix; x text;
begin
  select * into C from baron2_choix where id = 1 for update;
  if C.id is null or C.status = 'fait' then return; end if;
  if C.status = 'avant' then
    if now() < C.opens_at then return; end if;
    -- 9 h : tous les lieux sont repris à leurs patrons
    update baron2_choix set status = 'voeux' where id = 1;
    for x in select unnest(_baron2_lieux()) loop perform _baron2_lieu_set(x, null); end loop;
    insert into baron2_credits(player_id, coins, product, qty, buyer)
      select id, 0, 'choix_go', 0, '' from baron2_players;
    return;
  end if;
  if (select count(*) from baron2_choix_voeux) >= (select count(*) from baron2_players) then perform _baron2_choix_draw(); end if;
end $$;

create or replace function public.baron2_choix_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_choix;
begin
  perform _baron2_choix_settle();
  select * into C from baron2_choix where id = 1;
  return jsonb_build_object(
    'status', C.status, 'opens_at', C.opens_at, 'drawn_at', C.drawn_at, 'result', C.result,
    'admin', v in ('232590e0-d532-48e0-9239-06fe9ed81c57', 'naim'),
    'mine', (select ranking from baron2_choix_voeux where player_id = v),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'voted', exists (select 1 from baron2_choix_voeux w where w.player_id = p.id)) order by p.created_at) from baron2_players p), '[]'::jsonb),
    'lieux', coalesce((select jsonb_agg(jsonb_build_object('place', l,
        'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = _baron2_lieu_owner(l)),
        'sale', (select jsonb_build_object('price', s.price, 'at', s.at) from baron2_lieu_sales s where s.place = l and s.seller_id = _baron2_lieu_owner(l)))
      order by array_position(_baron2_lieux(), l)) from unnest(_baron2_lieux()) l), '[]'::jsonb),
    'swaps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'from_id', s.from_id, 'from_name', a.name, 'from_place', s.from_place,
        'to_id', s.to_id, 'to_name', b.name, 'to_place', s.to_place, 'at', s.at) order by s.id desc)
      from baron2_lieu_swaps s join baron2_players a on a.id = s.from_id join baron2_players b on b.id = s.to_id
      where s.status = 'attente' and (s.from_id = v or s.to_id = v)), '[]'::jsonb),
    'now', now());
end $$;

-- p_ranking : les 7 lieux, du préféré au moins voulu
create or replace function public.baron2_choix_vote(p_token uuid, p_ranking jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); n int;
begin
  perform _baron2_choix_settle();
  if (select status from baron2_choix where id = 1) <> 'voeux' then raise exception 'choix fermé'; end if;
  if jsonb_typeof(p_ranking) <> 'array' then raise exception 'vœux invalides'; end if;
  select count(distinct e) into n from jsonb_array_elements_text(p_ranking) e where e = any(_baron2_lieux());
  if n <> array_length(_baron2_lieux(), 1) or jsonb_array_length(p_ranking) <> n then raise exception 'classe les 7 lieux'; end if;
  insert into baron2_choix_voeux(player_id, ranking) values (v, p_ranking)
    on conflict (player_id) do update set ranking = excluded.ranking, at = now();
  return baron2_choix_get(p_token);
end $$;

-- Naïm lance le tirage sans attendre les retardataires
create or replace function public.baron2_choix_force(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if v not in ('232590e0-d532-48e0-9239-06fe9ed81c57', 'naim') then raise exception 'pas autorisé'; end if;
  perform _baron2_choix_settle();
  if (select status from baron2_choix where id = 1 for update) <> 'voeux' then raise exception 'choix fermé'; end if;
  perform _baron2_choix_draw();
  return baron2_choix_get(p_token);
end $$;

-- ---------------------------------------------------------------- Titres de propriété : vente et échange
create or replace function public.baron2_lieu_sell(p_token uuid, p_place text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select status from baron2_choix where id = 1) <> 'fait' then raise exception 'pas encore'; end if;
  if not (p_place = any(_baron2_lieux())) then raise exception 'lieu inconnu'; end if;
  if _baron2_lieu_owner(p_place) is distinct from v then raise exception 'pas ton lieu'; end if;
  if p_price is null then delete from baron2_lieu_sales where place = p_place;
  else
    if p_price < 1 or p_price > 1e30 then raise exception 'prix invalide'; end if;
    insert into baron2_lieu_sales(place, seller_id, price) values (p_place, v, floor(p_price))
      on conflict (place) do update set seller_id = excluded.seller_id, price = excluded.price, at = now();
  end if;
  return baron2_choix_get(p_token);
end $$;

-- acheter un lieu en vente : p_state est la ferme, prix déjà retiré ; p_price est le prix vu
create or replace function public.baron2_lieu_buy(p_token uuid, p_state jsonb, p_place text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); s baron2_lieu_sales; nm text; sn text;
begin
  if (select status from baron2_choix where id = 1) <> 'fait' then raise exception 'pas encore'; end if;
  select * into s from baron2_lieu_sales where place = p_place for update;
  if s.place is null or _baron2_lieu_owner(p_place) is distinct from s.seller_id then raise exception 'pas à vendre'; end if;
  if s.seller_id = v then raise exception 'déjà à toi'; end if;
  if s.price is distinct from floor(coalesce(p_price, -1)) then raise exception 'prix changé'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  select name into sn from baron2_players where id = s.seller_id;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (s.seller_id, s.price, 'lieu_sale', 0, p_place || '|' || nm);
  perform _baron2_lieu_set(p_place, v);
  insert into baron2_credits(player_id, coins, product, qty, buyer)
    select id, 0, 'notice', 0, '📜 ' || nm || ' a racheté ' || _baron2_lieu_name(p_place) || ' à ' || sn || ' !'
    from baron2_players where id not in (v, s.seller_id);
  return baron2_choix_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- proposer un échange : mon lieu contre le sien
create or replace function public.baron2_lieu_swap(p_token uuid, p_mine text, p_theirs text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); o text; nm text;
begin
  if (select status from baron2_choix where id = 1) <> 'fait' then raise exception 'pas encore'; end if;
  if _baron2_lieu_owner(p_mine) is distinct from v then raise exception 'pas ton lieu'; end if;
  o := _baron2_lieu_owner(p_theirs);
  if o is null or o = v then raise exception 'pas de patron'; end if;
  if exists (select 1 from baron2_lieu_swaps where status = 'attente' and from_id = v and from_place = p_mine and to_place = p_theirs) then raise exception 'déjà proposé'; end if;
  insert into baron2_lieu_swaps(from_id, from_place, to_id, to_place) values (v, p_mine, o, p_theirs);
  select name into nm from baron2_players where id = v;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (o, 0, 'lieu_swap_ask', 0, p_mine || '|' || p_theirs || '|' || nm);
  return baron2_choix_get(p_token);
end $$;

create or replace function public.baron2_lieu_swap_answer(p_token uuid, p_id bigint, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); s baron2_lieu_swaps; a text; b text;
begin
  select * into s from baron2_lieu_swaps where id = p_id for update;
  if s.id is null or s.status <> 'attente' then raise exception 'proposition expirée'; end if;
  if s.to_id <> v and not (s.from_id = v and not p_ok) then raise exception 'pas pour toi'; end if;
  if not p_ok then
    update baron2_lieu_swaps set status = case when s.from_id = v then 'annule' else 'non' end where id = p_id;
    if s.to_id = v then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (s.from_id, 0, 'lieu_swap_no', 0, s.from_place || '|' || s.to_place || '|' || (select name from baron2_players where id = v));
    end if;
    return baron2_choix_get(p_token);
  end if;
  if _baron2_lieu_owner(s.from_place) is distinct from s.from_id or _baron2_lieu_owner(s.to_place) is distinct from s.to_id then
    update baron2_lieu_swaps set status = 'annule' where id = p_id;
    raise exception 'proposition expirée';
  end if;
  update baron2_lieu_swaps set status = 'ok' where id = p_id;
  perform _baron2_lieu_set(s.from_place, s.to_id);
  perform _baron2_lieu_set(s.to_place, s.from_id);
  select name into a from baron2_players where id = s.from_id;
  select name into b from baron2_players where id = s.to_id;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (s.from_id, 0, 'lieu_swap_ok', 0, s.from_place || '|' || s.to_place || '|' || b);
  insert into baron2_credits(player_id, coins, product, qty, buyer)
    select id, 0, 'notice', 0, '🤝 ' || a || ' et ' || b || ' ont échangé leurs lieux : ' || _baron2_lieu_name(s.to_place) || ' pour ' || a || ', ' || _baron2_lieu_name(s.from_place) || ' pour ' || b || '.'
    from baron2_players where id not in (s.from_id, s.to_id);
  return baron2_choix_get(p_token);
end $$;

-- ---------------------------------------------------------------- La Roulette a son propre patron
create or replace function public.baron2_casino_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select open from baron2_casino where id = 1),
    'max', (select max_bet from baron2_casino where id = 1),
    'partage', (select partage from baron2_casino where id = 1),
    'cfg_at', (select cfg_at from baron2_casino where id = 1),
    'baron', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = _baron2_croupier()),
    'tied', coalesce((select status from baron2_choix where id = 1), 'avant') = 'avant',
    'spins', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'n', n, 'stake', stake, 'win', win, 'at', at) order by id desc)
               from (select * from baron2_spins order by id desc limit 20) s), '[]'::jsonb),
    'bank', coalesce((select sum(stake - win) from baron2_spins where baron_id = _baron2_croupier() and at > now() - interval '24 hours'), 0),
    'now', now());
$$;

create or replace function public.baron2_casino_set(p_token uuid, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if _baron2_croupier() is distinct from v then raise exception 'pas le croupier'; end if;
  update baron2_casino set open = coalesce(p_open, false), at = now() where id = 1;
  return baron2_casino_get();
end $$;

create or replace function public.baron2_casino_spin(p_token uuid, p_state jsonb, p_bets jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); top text := _baron2_croupier(); nm text; C baron2_casino;
  b jsonb; k text; m numeric; stake numeric := 0; win numeric := 0; n int; hit boolean; mult int;
  reds int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
  select * into C from baron2_casino where id = 1;
  if top is null or not coalesce(C.open, false) then raise exception 'casino fermé'; end if;
  if top = v then raise exception 'tu es le baron'; end if;
  if p_bets is null or jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) < 1 or jsonb_array_length(p_bets) > 60 then raise exception 'mise invalide'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  n := floor(random() * 37)::int;
  for b in select * from jsonb_array_elements(p_bets) loop
    k := b->>'k'; m := floor(coalesce((b->>'m')::numeric, 0));
    if m < 1 or m > 1e18 then raise exception 'mise invalide'; end if;
    stake := stake + m; mult := 1;
    if k ~ '^n([0-9]|[12][0-9]|3[0-6])$' then hit := substr(k, 2)::int = n; mult := 35;
    elsif k = 'rouge'  then hit := n = any(reds);
    elsif k = 'noir'   then hit := n > 0 and not (n = any(reds));
    elsif k = 'pair'   then hit := n > 0 and n % 2 = 0;
    elsif k = 'impair' then hit := n % 2 = 1;
    elsif k = 'manque' then hit := n between 1 and 18;
    elsif k = 'passe'  then hit := n between 19 and 36;
    elsif k in ('d1','d2','d3') then hit := n > 0 and (n - 1) / 12 + 1 = substr(k, 2)::int; mult := 2;
    elsif k in ('c1','c2','c3') then hit := n > 0 and ((n - 1) % 3) + 1 = substr(k, 2)::int; mult := 2;
    else raise exception 'mise invalide';
    end if;
    if hit then win := win + m * (mult + 1);
    elsif n = 0 and C.partage and k in ('rouge','noir','pair','impair','manque','passe') then win := win + floor(m / 2);
    end if;
  end loop;
  if C.max_bet is not null and stake > C.max_bet then raise exception 'mise max'; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_spins(player_id, name, baron_id, n, stake, win) values (v, nm, top, n, stake, win);
  if win > 0 then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, win, 'casino_win', n, nm);
  end if;
  if stake <> win then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (top, stake - win, 'casino', n, nm);
  end if;
  return jsonb_build_object('n', n, 'stake', stake, 'win', win, 'credits', _baron2_credits(v, p_state));
end $$;

create or replace function public.baron2_place_cfg(p_token uuid, p_place text, p_key text, p_val text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); own text; t0 timestamptz;
begin
  if p_place = 'port' then select owner_id, cfg_at into own, t0 from baron2_port where id = 1 for update;
  elsif p_place = 'lotto' then select owner_id, cfg_at into own, t0 from baron2_lotto where id = 1 for update;
  elsif p_place = 'fly' then select owner_id, cfg_at into own, t0 from baron2_fly where id = 1 for update;
  elsif p_place = 'casino' then own := _baron2_croupier(); select cfg_at into t0 from baron2_casino where id = 1 for update;
  else raise exception 'lieu inconnu'; end if;
  if own is distinct from v then raise exception 'pas ton lieu'; end if;
  if t0 is not null and t0 > now() - interval '10 minutes' then raise exception 'attends % min', ceil(extract(epoch from (t0 + interval '10 minutes' - now())) / 60); end if;
  if p_place = 'port' and p_key = 'fee' and p_val in ('5','10','15','20') then update baron2_port set fee = p_val::int, cfg_at = now() where id = 1; return baron2_port_get();
  elsif p_place = 'port' and p_key = 'route' and p_val in ('cote','med','ame') then update baron2_port set route = p_val, cfg_at = now() where id = 1; return baron2_port_get();
  elsif p_place = 'port' and p_key = 'ins' and p_val in ('off','5','10','20','30') then update baron2_port set ins_pct = case when p_val = 'off' then null else p_val::int end, cfg_at = now() where id = 1; return baron2_port_get();
  elsif p_place = 'lotto' and p_key = 'fee' and p_val in ('5','10','15','20') then update baron2_lotto set fee = p_val::int, cfg_at = now() where id = 1; return baron2_lotto_get(p_token);
  elsif p_place = 'lotto' and p_key = 'ticket' and p_val in ('5000000000','50000000000','250000000000','1000000000000') then update baron2_lotto set ticket = p_val::numeric, cfg_at = now() where id = 1; return baron2_lotto_get(p_token);
  elsif p_place = 'lotto' and p_key = 'every' and p_val in ('1','2','4') then
    update baron2_lotto set every_h = p_val::int, cfg_at = now(), draw_at = least(draw_at, date_trunc('hour', now()) + make_interval(hours => p_val::int)) where id = 1;
    return baron2_lotto_get(p_token);
  elsif p_place = 'fly' and p_key = 'fee' and p_val in ('5','10','15','20') then update baron2_fly set fee = p_val::int, cfg_at = now() where id = 1; return baron2_fly_get(p_token);
  elsif p_place = 'fly' and p_key = 'plane' and p_val in ('neuf','std','vieux') then update baron2_fly set plane = p_val, cfg_at = now() where id = 1; return baron2_fly_get(p_token);
  elsif p_place = 'fly' and p_key = 'max' and p_val in ('10000000000','100000000000','1000000000000','0') then update baron2_fly set max_bet = nullif(p_val::numeric, 0), cfg_at = now() where id = 1; return baron2_fly_get(p_token);
  elsif p_place = 'casino' and p_key = 'max' and p_val in ('10000000000','100000000000','1000000000000','0') then update baron2_casino set max_bet = nullif(p_val::numeric, 0), cfg_at = now() where id = 1; return baron2_casino_get();
  elsif p_place = 'casino' and p_key = 'zero' and p_val in ('sec','partage') then update baron2_casino set partage = (p_val = 'partage'), cfg_at = now() where id = 1; return baron2_casino_get();
  end if;
  raise exception 'réglage invalide';
end $$;

-- ---------------------------------------------------------------- Crédits et charges
create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_choix_settle();
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

-- tous les lieux paient 20 % de ce qu'ils ont rapporté en 24 h, le Baron excepté (il touche le Tribut)
create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0; top text := _baron2_top(); cr text := _baron2_croupier();
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Port' place, owner_id pid, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product in ('port_fee', 'port_ins') and at > now() - interval '24 hours'), 0)) inc from baron2_port p
    union all select 'Envol', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product in ('fly_fee', 'fly_bank') and at > now() - interval '24 hours'), 0)) from baron2_fly f
    union all select 'Œufs', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = m.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0) from baron2_eggmaster m
    union all select 'Casino', cr, greatest(0, coalesce((select sum(stake - win) from baron2_spins where baron_id = cr and at > now() - interval '24 hours'), 0))
    union all select 'Destin', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = x.owner_id and product = 'destin_gain' and at > now() - interval '24 hours'), 0) from baron2_destin x
    union all select 'Caravane', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = k.owner_id and product in ('cara_fee', 'cara_ins') and at > now() - interval '24 hours'), 0)) from baron2_cara k
    union all select 'Espions', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = e.owner_id and product = 'spy_fee' and at > now() - interval '24 hours'), 0) from baron2_spy e
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
  if (select cad_open from baron2_tax where id = 1) then
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
  end if;
  if top is not null and tot > 0 then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (top, tot, 'tribut', 0, 'Tribut');
  end if;
end $$;

grant execute on function public.baron2_choix_get(uuid), public.baron2_choix_vote(uuid, jsonb), public.baron2_choix_force(uuid),
  public.baron2_lieu_sell(uuid, text, numeric), public.baron2_lieu_buy(uuid, jsonb, text, numeric), public.baron2_lieu_swap(uuid, text, text),
  public.baron2_lieu_swap_answer(uuid, bigint, boolean), public.baron2_casino_get(), public.baron2_casino_set(uuid, boolean),
  public.baron2_casino_spin(uuid, jsonb, jsonb), public.baron2_place_cfg(uuid, text, text, text) to anon, authenticated;
revoke all on function public._baron2_lieux(), public._baron2_lieu_name(text), public._baron2_croupier(), public._baron2_lieu_owner(text),
  public._baron2_lieu_set(text, text), public._baron2_choix_draw(), public._baron2_choix_settle(), public._baron2_credits(text, jsonb),
  public._baron2_charges() from public, anon, authenticated;
