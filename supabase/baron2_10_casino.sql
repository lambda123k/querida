-- =====================================================================
-- Le Baron · le Casino du Baron (12 nov. 2026) : une roulette européenne (0 à 36).
-- Le Baron du moment (1er du classement) tient la banque : il ouvre ou ferme le casino,
-- il ne peut pas jouer, il encaisse ce que les joueurs perdent et paie leurs gains,
-- quitte à passer en négatif. Pas de limite de mise.
-- Le tirage est fait ici, sur le serveur. L'argent passe par baron2_credits :
--   'casino_win' = le gain du joueur (mise comprise), 'casino' = le solde pour la banque.
-- =====================================================================

create table if not exists public.baron2_casino (
  id   int primary key default 1 check (id = 1),
  open boolean not null default false,
  at   timestamptz not null default now()
);
insert into public.baron2_casino(id, open) values (1, false) on conflict do nothing;

create table if not exists public.baron2_spins (
  id        bigint generated always as identity primary key,
  player_id text not null,
  name      text not null,
  baron_id  text not null,
  n         int not null,
  stake     numeric not null,
  win       numeric not null,
  at        timestamptz not null default now()
);
create index if not exists baron2_spins_at on public.baron2_spins (at);
alter table public.baron2_casino enable row level security;
alter table public.baron2_spins enable row level security;

-- fortune « à jour » : la dernière fortune envoyée + l'argent pas encore encaissé (ventes, casino)
create or replace function public._baron2_fortunes() returns table(id text, name text, fortune numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name,
         coalesce((p.stats->>'fortune')::numeric, 0)
         + coalesce((select sum(c.coins) from baron2_credits c
                     where c.player_id = p.id and c.id > coalesce((s.state->>'credit_seen')::bigint, 0)), 0),
         p.created_at
  from baron2_players p left join baron2_saves s on s.player_id = p.id;
$$;

create or replace function public._baron2_top() returns text
language sql stable security definer set search_path = public as $$
  select id from _baron2_fortunes() order by fortune desc, created_at limit 1;
$$;

-- le classement voit tout de suite l'argent en attente (sinon la banque du casino serait en retard)
create or replace function public.baron2_world() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players',  coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty,
                   'stats', p.stats || jsonb_build_object('fortune', floor(f.fortune)), 'updated_at', p.updated_at) order by p.created_at)
                 from baron2_players p join _baron2_fortunes() f on f.id = p.id), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'seller_id', seller_id, 'product', product, 'qty', qty, 'price', price, 'created_at', created_at) order by price, id) from baron2_listings), '[]'::jsonb),
    'trades',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'product', product, 'qty', qty, 'price', price, 'buyer_id', buyer_id, 'seller_id', seller_id, 'at', at) order by id)
                 from (select * from baron2_trades where at > now() - interval '7 days' order by id desc limit 3000) t), '[]'::jsonb),
    'reserve',  jsonb_build_object('slot', _baron2_slot(),
                 'size', (select jsonb_object_agg(k, _baron2_res_size(k)) from unnest(array['ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau']) k),
                 'used', coalesce((select jsonb_object_agg(product, used) from baron2_reserve where slot = _baron2_slot()), '{}'::jsonb)),
    'press',    coalesce((select jsonb_object_agg(product, jsonb_build_object('p', p, 't', floor(extract(epoch from t) * 1000), 'h', hist)) from baron2_press), '{}'::jsonb),
    'med',      _baron2_med_eff(),
    'now', now());
$$;

create or replace function public.baron2_casino_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select open from baron2_casino where id = 1),
    'baron', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = _baron2_top()),
    'spins', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'n', n, 'stake', stake, 'win', win, 'at', at) order by id desc)
               from (select * from baron2_spins order by id desc limit 20) s), '[]'::jsonb),
    'bank', coalesce((select sum(stake - win) from baron2_spins where baron_id = _baron2_top() and at > now() - interval '24 hours'), 0),
    'now', now());
$$;

create or replace function public.baron2_casino_set(p_token uuid, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if _baron2_top() is distinct from v then raise exception 'pas le baron'; end if;
  update baron2_casino set open = coalesce(p_open, false), at = now() where id = 1;
  return baron2_casino_get();
end $$;

-- p_bets : [{ "k": "n17" | "rouge" | "noir" | "pair" | "impair" | "manque" | "passe" | "d1".."d3" | "c1".."c3", "m": mise }]
-- p_state : la ferme du joueur, mise déjà retirée de ses pièces
create or replace function public.baron2_casino_spin(p_token uuid, p_state jsonb, p_bets jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); top text := _baron2_top(); nm text;
  b jsonb; k text; m numeric; stake numeric := 0; win numeric := 0; n int; hit boolean; mult int;
  reds int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
  if not coalesce((select open from baron2_casino where id = 1), false) then raise exception 'casino fermé'; end if;
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
    if hit then win := win + m * (mult + 1); end if;
  end loop;
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

revoke all on function public._baron2_fortunes() from public, anon, authenticated;
revoke all on function public._baron2_top() from public, anon, authenticated;
grant execute on function public.baron2_world() to anon, authenticated;
grant execute on function public.baron2_casino_get() to anon, authenticated;
grant execute on function public.baron2_casino_set(uuid, boolean) to anon, authenticated;
grant execute on function public.baron2_casino_spin(uuid, jsonb, jsonb) to anon, authenticated;
