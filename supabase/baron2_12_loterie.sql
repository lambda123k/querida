-- =====================================================================
-- Le Baron · la Loterie du village (12 nov. 2026)
-- Le patron est le premier qui « se sacrifie » devant un faux message d'erreur (un piège : rien
-- n'est supprimé). Il garde 10 % de chaque ticket vendu. Chaque ticket = 2 numéros de 1 à 8 (1 chance sur 28).
-- Tirage toutes les 2 h (heures paires, heure de Paris) ; s'il n'y a pas de gagnant, la cagnotte grossit.
-- Changement de patron comme le Port : héritier choisi, et passage après 24 h sans jouer.
-- =====================================================================

create table if not exists public.baron2_lotto (
  id       int primary key default 1 check (id = 1),
  owner_id text, heir_id text, prev_id text,
  since    timestamptz not null default now(),
  jackpot  numeric not null default 10e9,
  seed     numeric not null default 10e9,
  ticket   numeric not null default 5e9,
  draw_at  timestamptz not null default ((date_trunc('day', now() at time zone 'Europe/Paris') + interval '21 hours') at time zone 'Europe/Paris'),
  at       timestamptz not null default now()
);
insert into public.baron2_lotto(id) values (1) on conflict do nothing;
update public.baron2_lotto set draw_at = draw_at + interval '1 day' where id = 1 and draw_at <= now();

create table if not exists public.baron2_lotto_tickets (
  id        bigint generated always as identity primary key,
  draw_at   timestamptz not null,
  player_id text not null, name text not null,
  a int not null, b int not null,
  at        timestamptz not null default now()
);
create index if not exists baron2_lotto_t_draw on public.baron2_lotto_tickets (draw_at);
create table if not exists public.baron2_lotto_draws (
  id        bigint generated always as identity primary key,
  draw_at   timestamptz not null, a int not null, b int not null,
  jackpot   numeric not null, tickets int not null, winners jsonb not null default '[]'
);
alter table public.baron2_lotto enable row level security;
alter table public.baron2_lotto_tickets enable row level security;
alter table public.baron2_lotto_draws enable row level security;

-- tirages en retard + changement de patron absent depuis 24 h
create or replace function public._baron2_lotto_settle() returns void
language plpgsql security definer set search_path = public as $$
declare L baron2_lotto; x int; y int; n int; w jsonb; per numeric; nxt text;
begin
  select * into L from baron2_lotto where id = 1 for update;
  while L.draw_at <= now() loop
    x := 1 + floor(random() * 8)::int; y := 1 + floor(random() * 7)::int; if y >= x then y := y + 1; end if;
    if x > y then n := x; x := y; y := n; end if;
    select count(*) into n from baron2_lotto_tickets where draw_at = L.draw_at;
    select coalesce(jsonb_agg(jsonb_build_object('id', player_id, 'name', name)), '[]') into w from baron2_lotto_tickets where draw_at = L.draw_at and a = x and b = y;
    insert into baron2_lotto_draws(draw_at, a, b, jackpot, tickets, winners) values (L.draw_at, x, y, L.jackpot, n, w);
    if jsonb_array_length(w) > 0 then
      per := floor(L.jackpot / jsonb_array_length(w));
      insert into baron2_credits(player_id, coins, product, qty, buyer)
        select player_id, per, 'lotto_win', 1, x || '-' || y from baron2_lotto_tickets where draw_at = L.draw_at and a = x and b = y;
      L.jackpot := L.seed;
    end if;
    L.draw_at := L.draw_at + interval '2 hours';
  end loop;
  -- patron absent depuis 24 h : la loterie passe à son héritier, sinon au dernier du classement qui joue
  if L.owner_id is not null and (select updated_at from baron2_players where id = L.owner_id) <= now() - interval '24 hours' then
    nxt := (select id from baron2_players where id = L.heir_id and id <> L.owner_id and updated_at > now() - interval '24 hours');
    if nxt is null then
      nxt := (select f.id from _baron2_fortunes() f join baron2_players p on p.id = f.id
              where f.id <> L.owner_id and p.updated_at > now() - interval '24 hours' order by f.fortune limit 1);
    end if;
    if nxt is not null then L.prev_id := L.owner_id; L.owner_id := nxt; L.heir_id := null; L.since := now(); end if;
  end if;
  update baron2_lotto set jackpot = L.jackpot, draw_at = L.draw_at, owner_id = L.owner_id, heir_id = L.heir_id, prev_id = L.prev_id, since = L.since where id = 1;
end $$;

-- les crédits règlent aussi la loterie
create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_port_settle();
  perform _baron2_lotto_settle();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer) order by id), '[]'::jsonb)
          from (select * from baron2_credits
                where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
                order by id limit 300) c);
end $$;
revoke all on function public._baron2_credits(text, jsonb) from public, anon, authenticated;

create or replace function public.baron2_lotto_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_lotto;
begin
  perform _baron2_lotto_settle();
  select * into L from baron2_lotto where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.owner_id),
    'heir',  (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.heir_id),
    'prev',  (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.prev_id),
    'since', L.since,
    -- le faux bug : tant que personne ne s'est sacrifié, et jamais pour Naïm (il connaît le piège)
    'prank', L.owner_id is null and v <> '232590e0-d532-48e0-9239-06fe9ed81c57',
    'jackpot', L.jackpot, 'ticket', L.ticket, 'draw_at', L.draw_at,
    'count', (select count(*) from baron2_lotto_tickets where draw_at = L.draw_at),
    'mine', coalesce((select jsonb_agg(jsonb_build_array(a, b) order by id) from baron2_lotto_tickets where draw_at = L.draw_at and player_id = v), '[]'),
    'last', (select jsonb_build_object('a', a, 'b', b, 'jackpot', jackpot, 'tickets', tickets, 'winners', winners, 'at', draw_at) from baron2_lotto_draws order by id desc limit 1),
    'fees', coalesce((select sum(coins) from baron2_credits where player_id = L.owner_id and product = 'lotto_fee' and at > now() - interval '24 hours'), 0),
    'now', now());
end $$;

-- le sacrifice : le premier devient patron
create or replace function public.baron2_lotto_claim(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); won boolean := false;
begin
  update baron2_lotto set owner_id = v, since = now() where id = 1 and owner_id is null returning true into won;
  return baron2_lotto_get(p_token) || jsonb_build_object('won', coalesce(won, false));
end $$;

-- p_picks : [[a, b], …] ; p_state : la ferme, prix des tickets déjà retiré
create or replace function public.baron2_lotto_buy(p_token uuid, p_state jsonb, p_picks jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_lotto; nm text; pk jsonb; x int; y int; n int; have int;
begin
  perform _baron2_lotto_settle();
  select * into L from baron2_lotto where id = 1 for update;
  if L.owner_id is null then raise exception 'loterie fermée'; end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'array' then raise exception 'ticket invalide'; end if;
  n := jsonb_array_length(p_picks);
  select count(*) into have from baron2_lotto_tickets where draw_at = L.draw_at and player_id = v;
  if n < 1 or have + n > 10 then raise exception 'dix tickets max'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  for pk in select * from jsonb_array_elements(p_picks) loop
    x := (pk->>0)::int; y := (pk->>1)::int;
    if x is null or y is null or x = y or least(x, y) < 1 or greatest(x, y) > 8 then raise exception 'ticket invalide'; end if;
    insert into baron2_lotto_tickets(draw_at, player_id, name, a, b) values (L.draw_at, v, nm, least(x, y), greatest(x, y));
  end loop;
  update baron2_lotto set jackpot = jackpot + floor(n * L.ticket * 0.9) where id = 1;
  if L.owner_id <> v then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (L.owner_id, floor(n * L.ticket * 0.1), 'lotto_fee', n, nm);
  end if;
  return baron2_lotto_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

create or replace function public.baron2_lotto_heir(p_token uuid, p_heir text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_lotto where id = 1) is distinct from v then raise exception 'pas le patron'; end if;
  if p_heir is not null and (p_heir = v or not exists(select 1 from baron2_players where id = p_heir)) then raise exception 'héritier invalide'; end if;
  update baron2_lotto set heir_id = p_heir where id = 1;
  return baron2_lotto_get(p_token);
end $$;

create or replace function public.baron2_lotto_give(p_token uuid, p_to text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_lotto where id = 1) is distinct from v then raise exception 'pas le patron'; end if;
  if p_to is null or p_to = v or not exists(select 1 from baron2_players where id = p_to) then raise exception 'joueur invalide'; end if;
  update baron2_lotto set prev_id = owner_id, owner_id = p_to, heir_id = null, since = now() where id = 1;
  return baron2_lotto_get(p_token);
end $$;

revoke all on function public._baron2_lotto_settle() from public, anon, authenticated;
grant execute on function public.baron2_lotto_get(uuid) to anon, authenticated;
grant execute on function public.baron2_lotto_claim(uuid) to anon, authenticated;
grant execute on function public.baron2_lotto_buy(uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.baron2_lotto_heir(uuid, text) to anon, authenticated;
grant execute on function public.baron2_lotto_give(uuid, text) to anon, authenticated;
