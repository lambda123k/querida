-- =====================================================================
-- Le Baron — commandes du village en COURSE (11 nov. 2026)
-- Les mêmes commandes pour tout le village (générées ici, une fois par créneau de 20 min).
-- Chacun livre de son côté (marchandise payée au prix de base), mais la PRIME ne va qu'au premier
-- qui termine la commande. Quantités et primes à l'échelle de la production médiane des joueurs actifs.
-- =====================================================================
create table if not exists public.baron2_orders (
  slot       bigint primary key,
  list       jsonb not null,
  winners    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.baron2_orders enable row level security;   -- uniquement via les fonctions

create or replace function public._baron2_nice(n numeric) returns numeric
language sql immutable as $$
  select case when n < 100 then ceil(n)
    else ceil(n / power(10, floor(log(n)) - 1)) * power(10, floor(log(n)) - 1) end;
$$;

-- random() donne un double : même arrondi
create or replace function public._baron2_nice(n double precision) returns numeric
language sql immutable as $$ select public._baron2_nice(n::numeric) $$;

create or replace function public._baron2_gen_orders(p_slot bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m numeric; eff numeric; l jsonb := '[]'::jsonb; k text; big text; q numeric; b numeric; i int; n int;
  raw text[] := array['ble','oeufs','lait','fruits','miel','bois'];
  rec text[] := array['pain','crepes','tarte','confiture','gateau'];
  nrec jsonb := '{"pain":2,"crepes":3,"tarte":3,"confiture":2,"gateau":4}';
  who jsonb := '{"ble":"boulanger","pain":"boulanger","oeufs":"aubergiste","lait":"aubergiste","crepes":"aubergiste","gateau":"patissiere","tarte":"patissiere","confiture":"epiciere","fruits":"epiciere","miel":"epiciere","bois":"charpentier"}';
  used text[];
begin
  -- production médiane d'un joueur actif (pièces/s au prix de base ; ÷10 = unités/s)
  select coalesce(percentile_cont(0.5) within group (order by (stats->>'prod')::numeric), 0) into m
    from baron2_players where updated_at > now() - interval '24 hours' and coalesce((stats->>'prod')::numeric, 0) > 0;
  m := greatest(m, 5); eff := m / 10;
  -- la grande commande du maire
  big := raw[1 + floor(random() * 6)::int]; used := array[big];
  l := l || jsonb_build_array(jsonb_build_object('id', p_slot || '-G', 'k', big, 'big', true, 'who', 'maire',
         'qty', greatest(15, _baron2_nice(eff * (150 + random() * 210) * 1.5)),
         'bonus', _baron2_nice(m * 60 * (8 + random() * 7) * 1.5)));
  -- trois produits de ferme et trois recettes (7 commandes en tout, depuis le 11 nov. 15 h)
  for i in 0..5 loop
    loop
      k := case when i < 3 then raw[1 + floor(random() * 6)::int] else rec[1 + floor(random() * 5)::int] end;
      exit when not (k = any(used));
    end loop;
    used := used || k;
    n := coalesce((nrec->>k)::int, 1);
    q := case when i < 3 then greatest(10, _baron2_nice(eff * (150 + random() * 210)))
              else greatest(10, _baron2_nice(eff * (60 + random() * 90) / n)) end;
    b := _baron2_nice(m * 60 * (8 + random() * 7) * case when i < 3 then 1 else 1.4 end);
    l := l || jsonb_build_array(jsonb_build_object('id', p_slot || '-' || i, 'k', k, 'qty', q, 'bonus', b, 'who', who->>k));
  end loop;
  return l;
end $$;

-- les commandes du moment (et la grande commande du créneau suivant, annoncée à l'avance)
create or replace function public.baron2_orders() returns jsonb
language plpgsql security definer set search_path = public as $$
declare sl bigint := _baron2_slot(); o baron2_orders; nx baron2_orders;
begin
  insert into baron2_orders(slot, list) values (sl, _baron2_gen_orders(sl)) on conflict do nothing;
  insert into baron2_orders(slot, list) values (sl + 1, _baron2_gen_orders(sl + 1)) on conflict do nothing;
  delete from baron2_orders where slot < sl - 72;
  select * into o from baron2_orders where slot = sl;
  select * into nx from baron2_orders where slot = sl + 1;
  return jsonb_build_object('slot', sl, 'list', o.list, 'winners', o.winners,
    'next_big', (select e->>'k' from jsonb_array_elements(nx.list) e where (e->>'big')::boolean limit 1),
    'ends', to_timestamp((sl + 1) * 1200), 'now', now());
end $$;

-- « j'ai fini cette commande » : le premier gagne la prime, les autres arrivent trop tard
create or replace function public.baron2_order_win(p_token uuid, p_slot bigint, p_oid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); o baron2_orders; it jsonb; w jsonb; nm text;
begin
  if p_slot < _baron2_slot() - 1 then return jsonb_build_object('won', false, 'late', true); end if;
  select * into o from baron2_orders where slot = p_slot for update;
  if o.slot is null then return jsonb_build_object('won', false, 'late', true); end if;
  select e into it from jsonb_array_elements(o.list) e where e->>'id' = p_oid;
  if it is null then return jsonb_build_object('won', false, 'late', true); end if;
  w := o.winners->p_oid;
  if w is not null then return jsonb_build_object('won', w->>'id' = v, 'name', w->>'name', 'bonus', (it->>'bonus')::numeric); end if;
  select name into nm from baron2_players where id = v;
  update baron2_orders set winners = winners || jsonb_build_object(p_oid, jsonb_build_object('id', v, 'name', nm, 'at', now())) where slot = p_slot;
  return jsonb_build_object('won', true, 'bonus', (it->>'bonus')::numeric);
end $$;

-- garde-fou : une fois passé à cette version, un téléphone resté sur l'ancienne (primes chacun pour soi)
-- ne peut plus sauvegarder ; on garde aussi celui de la Grande Réforme
create or replace function public._baron2_put(p_pid text, p_state jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare old jsonb;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 200000 then
    raise exception 'état invalide';
  end if;
  select state into old from baron2_saves where player_id = p_pid;
  if old is not null and (old ? 'reform' or old ? 'reform_todo') and not (p_state ? 'reform' or p_state ? 'reform_todo') then
    raise exception 'ancienne version : recharge Querida';
  end if;
  if old is not null and old ? 'ord2' and not p_state ? 'ord2' then
    raise exception 'ancienne version : recharge Querida';
  end if;
  insert into baron2_saves(player_id, state, saved_at) values (p_pid, p_state, now())
  on conflict (player_id) do update set state = excluded.state, saved_at = now();
end $$;

revoke all on function public._baron2_gen_orders(bigint) from public, anon, authenticated;
grant execute on function public.baron2_orders() to anon, authenticated;
grant execute on function public.baron2_order_win(uuid, bigint, text) to anon, authenticated;
