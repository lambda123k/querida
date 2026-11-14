-- Le Baron : l'assurance du Port (14 nov. 2026)
-- Le capitaine active l'assurance et fixe sa prime (% de la valeur de la cargaison).
-- Bateau assuré qui coule : le capitaine rembourse 100 % de ce qu'il aurait rapporté.
alter table baron2_port  add column if not exists ins_pct int;            -- null = pas d'assurance
alter table baron2_ships add column if not exists insured boolean not null default false,
                         add column if not exists premium numeric not null default 0;

create or replace function public._baron2_port_settle() returns void
language plpgsql security definer set search_path = public as $$
declare sh record;
begin
  for sh in update baron2_ships set settled = true where not settled and arrive <= now() returning * loop
    if sh.storm then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (sh.player_id, 0, 'port_storm', sh.qty, sh.product);
      if sh.insured and sh.owner_id is not null then
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (sh.player_id, sh.value - sh.fee, 'port_insured', sh.qty, sh.product);
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (sh.owner_id, -(sh.value - sh.fee), 'port_ins', 1, sh.name);
      end if;
    else
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (sh.player_id, sh.value - sh.fee, 'port_back', sh.qty, sh.product);
      if sh.fee > 0 and sh.owner_id is not null then
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (sh.owner_id, sh.fee, 'port_fee', sh.qty, sh.name);
      end if;
    end if;
  end loop;
end $$;

create or replace function public.baron2_port_send(p_token uuid, p_state jsonb, p_product text, p_qty numeric, p_unit numeric, p_insure boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); pt baron2_port; c jsonb; rt jsonb; nm text; q numeric := floor(p_qty); val numeric; fee numeric; hold numeric; ins boolean; prem numeric := 0;
begin
  select * into pt from baron2_port where id = 1 for update;
  if pt.owner_id is null then raise exception 'pas de capitaine'; end if;
  if not pt.open then raise exception 'port fermé'; end if;
  c := _baron2_port_cfg(pt.lvl); rt := _baron2_route(pt.route);
  if (select count(*) from baron2_ships where not settled) >= (c->>'ships')::int then raise exception 'plus de bateau'; end if;
  if p_product !~ '^[a-z]{2,16}$' or q < 1 or coalesce(p_unit, 0) <= 0 then raise exception 'cargaison invalide'; end if;
  hold := floor((c->>'hold')::numeric * 400 * power(2.6, coalesce((p_state->>'barn')::int, 1) - 1));
  if q > hold + 1 then raise exception 'cale trop petite'; end if;
  if coalesce((p_state->'stock'->>p_product)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  val := floor(q * p_unit * (rt->>'mult')::numeric);
  fee := case when pt.owner_id = v then 0 else floor(val * pt.fee / 100.0) end;
  ins := coalesce(p_insure, false) and pt.owner_id <> v;
  if ins then
    if pt.ins_pct is null then raise exception 'assurance fermée'; end if;
    prem := ceil(val * pt.ins_pct / 100.0);
  end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  insert into baron2_ships(player_id, name, owner_id, product, qty, value, fee, storm, arrive, insured, premium)
    values (v, nm, pt.owner_id, p_product, q, val, fee, random() < least(0.6, (c->>'storm')::numeric * (rt->>'s')::numeric),
            now() + make_interval(secs => (c->>'hours')::numeric * (rt->>'h')::numeric * 3600), ins, prem);
  if ins then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (pt.owner_id, prem, 'port_ins', 0, nm);
  end if;
  return baron2_port_get() || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;
grant execute on function public.baron2_port_send(uuid, jsonb, text, numeric, numeric, boolean) to anon, authenticated;

create or replace function public.baron2_port_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt baron2_port; rt jsonb; c jsonb;
begin
  perform _baron2_port_settle();
  perform _baron2_port_check();
  select * into pt from baron2_port where id = 1;
  rt := _baron2_route(pt.route); c := _baron2_port_cfg(pt.lvl);
  c := c || jsonb_build_object('hours', round((c->>'hours')::numeric * (rt->>'h')::numeric, 2), 'storm', least(0.6, round((c->>'storm')::numeric * (rt->>'s')::numeric, 3)));
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.owner_id),
    'heir', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.heir_id),
    'prev', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = pt.prev_id),
    'since', pt.since,
    'seen', (select updated_at from baron2_players where id = pt.owner_id),
    'open', pt.open, 'lvl', pt.lvl, 'cfg', c,
    'fee', pt.fee, 'route', pt.route, 'mult', rt->'mult', 'ins', pt.ins_pct, 'cfg_at', pt.cfg_at,
    'sea', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty, 'value', value - fee, 'ins', insured, 'depart', depart, 'arrive', arrive) order by arrive)
              from baron2_ships where not settled), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'product', product, 'qty', qty, 'value', value - fee, 'storm', storm, 'ins', insured, 'at', arrive) order by arrive desc)
              from (select * from baron2_ships where settled order by arrive desc limit 15) s), '[]'::jsonb),
    'fees', coalesce((select sum(coins) from baron2_credits where player_id = pt.owner_id and product in ('port_fee', 'port_ins') and at > now() - interval '24 hours'), 0),
    'now', now());
end $$;

create or replace function public.baron2_place_cfg(p_token uuid, p_place text, p_key text, p_val text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); own text; t0 timestamptz;
begin
  if p_place = 'port' then select owner_id, cfg_at into own, t0 from baron2_port where id = 1 for update;
  elsif p_place = 'lotto' then select owner_id, cfg_at into own, t0 from baron2_lotto where id = 1 for update;
  elsif p_place = 'fly' then select owner_id, cfg_at into own, t0 from baron2_fly where id = 1 for update;
  elsif p_place = 'casino' then own := _baron2_top(); select cfg_at into t0 from baron2_casino where id = 1 for update;
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

create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0; top text := _baron2_top();
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Port' place, owner_id pid, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product in ('port_fee', 'port_ins') and at > now() - interval '24 hours'), 0)) inc from baron2_port p
    union all select 'Loterie', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = l.owner_id and product = 'lotto_fee' and at > now() - interval '24 hours'), 0) from baron2_lotto l
    union all select 'Envol', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product in ('fly_fee', 'fly_bank') and at > now() - interval '24 hours'), 0)) from baron2_fly f
    union all select 'Œufs', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = m.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0) from baron2_eggmaster m
  loop
    if r.pid is null or r.pid = top then continue; end if;
    amt := floor(0.20 * greatest(0, r.inc));
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'charge', 0, r.place);
    insert into baron2_charges(day, player_id, place, income, amount) values (d, r.pid, r.place, r.inc, amt);
    tot := tot + amt;
  end loop;
  if top is not null and tot > 0 then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (top, tot, 'tribut', 0, 'Tribut');
  end if;
end $$;
