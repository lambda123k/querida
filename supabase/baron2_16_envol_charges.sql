-- =====================================================================
-- Le Baron · L'Envol (crash de l'avion) + les charges des lieux (13 nov. 2026)
-- L'Envol : chacun son avion. On mise, le multiplicateur monte (×e^(0,15 t)), on encaisse avant
-- le crash. Le crash est tiré ici au décollage. Les gains sont payés par le village ; le patron
-- (Hugo) touche la « boîte noire » : 10 % des mises perdues. Il ne peut pas jouer.
-- Les charges : chaque matin à 8 h (Paris), chaque patron d'un lieu (Baron/casino, Port, Loterie,
-- Envol) paie 20 % de ce que le lieu lui a rapporté sur 24 h, au moins 0,5 % de sa fortune.
-- L'argent des charges va dans la cagnotte de la Loterie.
-- =====================================================================

create table if not exists public.baron2_fly (
  id       int primary key default 1 check (id = 1),
  owner_id text, heir_id text, prev_id text,
  since    timestamptz not null default now()
);
insert into public.baron2_fly(id, owner_id) select 1, (select id from baron2_players where name = 'Hugo' limit 1) on conflict do nothing;

create table if not exists public.baron2_flights (
  id        bigint generated always as identity primary key,
  player_id text not null, name text not null, owner_id text,
  stake     numeric not null,
  crash     numeric not null,
  start     timestamptz not null default now(),
  cashed    numeric,
  settled   boolean not null default false
);
create index if not exists baron2_flights_open on public.baron2_flights (settled, player_id);

create table if not exists public.baron2_tax (
  id int primary key default 1 check (id = 1),
  last_day date not null default ((now() at time zone 'Europe/Paris') - interval '8 hours')::date
);
insert into public.baron2_tax(id) values (1) on conflict do nothing;
create table if not exists public.baron2_charges (
  id bigint generated always as identity primary key,
  day date not null, player_id text not null, place text not null, income numeric not null, amount numeric not null
);
alter table public.baron2_fly enable row level security;
alter table public.baron2_flights enable row level security;
alter table public.baron2_tax enable row level security;
alter table public.baron2_charges enable row level security;

-- secondes avant le crash
create or replace function public._baron2_fly_t(c numeric) returns double precision
language sql immutable as $$ select ln(greatest(c, 1)::double precision) / 0.15 $$;

-- les vols abandonnés et déjà écrasés : la boîte noire encaisse
create or replace function public._baron2_fly_settle() returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  for f in update baron2_flights set settled = true
           where not settled and cashed is null and start + make_interval(secs => _baron2_fly_t(crash)) < now() returning * loop
    if f.owner_id is not null and f.owner_id <> f.player_id then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (f.owner_id, floor(f.stake * 0.10), 'fly_fee', 1, f.name);
    end if;
  end loop;
end $$;

-- les charges du matin
create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0;
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Casino' place, _baron2_top() pid,
           greatest(0, coalesce((select sum(stake - win) from baron2_spins where baron_id = _baron2_top() and at > now() - interval '24 hours'), 0)) inc
    union all select 'Port', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product = 'port_fee' and at > now() - interval '24 hours'), 0) from baron2_port p
    union all select 'Loterie', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = l.owner_id and product = 'lotto_fee' and at > now() - interval '24 hours'), 0) from baron2_lotto l
    union all select 'Envol', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product = 'fly_fee' and at > now() - interval '24 hours'), 0) from baron2_fly f
  loop
    if r.pid is null then continue; end if;
    amt := floor(greatest(0.20 * r.inc, 0.005 * coalesce((select fortune from _baron2_fortunes() where id = r.pid), 0)));
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'charge', 0, r.place);
    insert into baron2_charges(day, player_id, place, income, amount) values (d, r.pid, r.place, r.inc, amt);
    tot := tot + amt;
  end loop;
  update baron2_lotto set jackpot = jackpot + tot where id = 1;
end $$;

create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_port_settle();
  perform _baron2_lotto_settle();
  perform _baron2_fly_settle();
  perform _baron2_charges();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer) order by id), '[]'::jsonb)
          from (select * from baron2_credits
                where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
                order by id limit 300) c);
end $$;
revoke all on function public._baron2_credits(text, jsonb) from public, anon, authenticated;

create or replace function public.baron2_fly_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); F baron2_fly; nxt text;
begin
  perform _baron2_fly_settle();
  select * into F from baron2_fly where id = 1 for update;
  -- patron absent 24 h : héritier, sinon le dernier du classement qui joue
  if F.owner_id is not null and (select updated_at from baron2_players where id = F.owner_id) <= now() - interval '24 hours' then
    nxt := (select id from baron2_players where id = F.heir_id and id <> F.owner_id and updated_at > now() - interval '24 hours');
    if nxt is null then nxt := (select f.id from _baron2_fortunes() f join baron2_players p on p.id = f.id where f.id <> F.owner_id and p.updated_at > now() - interval '24 hours' order by f.fortune limit 1); end if;
    if nxt is not null then update baron2_fly set prev_id = owner_id, owner_id = nxt, heir_id = null, since = now() where id = 1; select * into F from baron2_fly where id = 1; end if;
  end if;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = F.owner_id),
    'heir',  (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = F.heir_id),
    'prev',  (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = F.prev_id),
    'since', F.since,
    'hist', coalesce((select jsonb_agg(jsonb_build_object('c', crash, 'name', name, 'pid', player_id, 'cashed', cashed, 'stake', stake) order by id desc)
              from (select * from baron2_flights where settled order by id desc limit 15) h), '[]'),
    'fees', coalesce((select sum(coins) from baron2_credits where player_id = F.owner_id and product = 'fly_fee' and at > now() - interval '24 hours'), 0),
    'charge', (select jsonb_build_object('place', place, 'amount', amount, 'day', day) from baron2_charges where player_id = v order by id desc limit 1),
    'now', now());
end $$;

-- p_state : la ferme, mise déjà retirée
create or replace function public.baron2_fly_start(p_token uuid, p_state jsonb, p_stake numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); F baron2_fly; nm text; u double precision; c numeric; fid bigint; st timestamptz;
begin
  perform _baron2_fly_settle();
  select * into F from baron2_fly where id = 1;
  if F.owner_id is null then raise exception 'pas de patron'; end if;
  if F.owner_id = v then raise exception 'tu es le patron'; end if;
  if exists(select 1 from baron2_flights where player_id = v and not settled) then raise exception 'déjà en vol'; end if;
  if floor(coalesce(p_stake, 0)) < 1 then raise exception 'mise invalide'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  u := random();
  c := least(1000, greatest(1, floor(97 / (1 - u)) / 100.0));
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_flights(player_id, name, owner_id, stake, crash) values (v, nm, F.owner_id, floor(p_stake), c) returning id, start into fid, st;
  -- le billet d'embarquement (10 % de la mise, déjà retiré par le client) va au patron
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (F.owner_id, ceil(floor(p_stake) * 0.10), 'fly_fee', 0, nm);
  return jsonb_build_object('id', fid, 'start', st, 'now', now());
end $$;

-- où en est mon avion ? (révèle le crash seulement quand il a eu lieu)
create or replace function public.baron2_fly_peek(p_token uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); f baron2_flights;
begin
  perform _baron2_fly_settle();
  select * into f from baron2_flights where id = p_id and player_id = v;
  if f.id is null then raise exception 'vol inconnu'; end if;
  if f.cashed is not null then return jsonb_build_object('state', 'cashed', 'crash', f.crash, 'cashed', f.cashed); end if;
  if f.settled then return jsonb_build_object('state', 'crashed', 'crash', f.crash); end if;
  return jsonb_build_object('state', 'flying', 'now', now());
end $$;

create or replace function public.baron2_fly_cash(p_token uuid, p_state jsonb, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); f baron2_flights; m numeric; win numeric;
begin
  perform _baron2_fly_settle();
  select * into f from baron2_flights where id = p_id and player_id = v for update;
  if f.id is null then raise exception 'vol inconnu'; end if;
  if f.settled then return jsonb_build_object('state', case when f.cashed is null then 'crashed' else 'cashed' end, 'crash', f.crash, 'cashed', f.cashed, 'credits', _baron2_credits(v, p_state)); end if;
  m := floor(exp(0.15 * extract(epoch from (now() - f.start)))::numeric * 100) / 100;
  if m >= f.crash then
    update baron2_flights set settled = true where id = f.id;
    if f.owner_id is not null and f.owner_id <> v then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (f.owner_id, floor(f.stake * 0.10), 'fly_fee', 1, f.name);
    end if;
    return jsonb_build_object('state', 'crashed', 'crash', f.crash, 'credits', _baron2_credits(v, p_state));
  end if;
  m := greatest(m, 1);
  win := floor(f.stake * m);
  update baron2_flights set settled = true, cashed = m where id = f.id;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, win, 'fly_win', 1, m::text);
  return jsonb_build_object('state', 'cashed', 'crash', f.crash, 'cashed', m, 'win', win, 'credits', _baron2_credits(v, p_state));
end $$;

create or replace function public.baron2_fly_heir(p_token uuid, p_heir text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_fly where id = 1) is distinct from v then raise exception 'pas le patron'; end if;
  if p_heir is not null and (p_heir = v or not exists(select 1 from baron2_players where id = p_heir)) then raise exception 'héritier invalide'; end if;
  update baron2_fly set heir_id = p_heir where id = 1;
  return baron2_fly_get(p_token);
end $$;

create or replace function public.baron2_fly_give(p_token uuid, p_to text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_fly where id = 1) is distinct from v then raise exception 'pas le patron'; end if;
  if p_to is null or p_to = v or not exists(select 1 from baron2_players where id = p_to) then raise exception 'joueur invalide'; end if;
  update baron2_fly set prev_id = owner_id, owner_id = p_to, heir_id = null, since = now() where id = 1;
  return baron2_fly_get(p_token);
end $$;

-- la dernière charge de chacun, pour l'afficher dans les lieux
create or replace function public.baron2_my_charge(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('place', place, 'amount', amount, 'income', income, 'day', day) order by id desc), '[]')
  from (select * from baron2_charges where player_id = baron2_pid(p_token) order by id desc limit 8) c;
$$;

revoke all on function public._baron2_fly_settle() from public, anon, authenticated;
revoke all on function public._baron2_charges() from public, anon, authenticated;
grant execute on function public.baron2_fly_get(uuid) to anon, authenticated;
grant execute on function public.baron2_fly_start(uuid, jsonb, numeric) to anon, authenticated;
grant execute on function public.baron2_fly_peek(uuid, bigint) to anon, authenticated;
grant execute on function public.baron2_fly_cash(uuid, jsonb, bigint) to anon, authenticated;
grant execute on function public.baron2_fly_heir(uuid, text) to anon, authenticated;
grant execute on function public.baron2_fly_give(uuid, text) to anon, authenticated;
grant execute on function public.baron2_my_charge(uuid) to anon, authenticated;
