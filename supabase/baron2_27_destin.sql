-- Le Baron : le Destin (15 nov. 2026) — PAS ENCORE EN LIGNE (à lancer avec les autres nouveaux lieux)
-- Une force supérieure qui agit sur la météo et les tempêtes (jamais directement sur les cours).
-- Les joueurs achètent des vœux tout faits ; le Destin (un joueur, identité connue) accepte ou refuse.
-- · Le vœu est payé à la demande, rendu si le Destin refuse ou ne répond pas dans l'heure.
-- · Vœu accepté : 70 % pour le Destin, 30 % dans la cagnotte de la Loterie.
-- · 10 vœux exaucés par jour au maximum ; le Destin ne fait pas de vœux, mais subit son propre ciel.
-- · Un joueur ne peut être visé par un vœu néfaste (gel, brouillard, coup de vent) qu'une fois par heure.
-- · Prix : un % de la fortune de la cible (vœux sur un joueur) ou de la fortune moyenne (vœux pour le village).
-- Attribution du lieu : plus tard (update baron2_destin set owner_id = '<id>' where id = 1).

create table if not exists baron2_destin (
  id int primary key default 1 check (id = 1),
  owner_id text references baron2_players(id) on delete set null,
  since timestamptz);
insert into baron2_destin(id) values (1) on conflict do nothing;
alter table baron2_destin enable row level security;

create table if not exists baron2_wishes (
  id bigserial primary key,
  kind text not null,
  from_id text not null, from_name text not null,
  target_id text, target_name text,
  price numeric not null,
  status text not null default 'ask',            -- ask, done, refused, expired
  created_at timestamptz not null default now(),
  done_at timestamptz, end_at timestamptz,
  shift_ms bigint);                               -- saison pressée : le saut, en ms
create index if not exists baron2_wishes_open on baron2_wishes(status) where status = 'ask';
create index if not exists baron2_wishes_done on baron2_wishes(done_at) where status = 'done';
alter table baron2_wishes enable row level security;

-- le catalogue : cible (joueur) ou village, durée en minutes, part de fortune, néfaste ou non
create or replace function public._baron2_wish_cfg(p_kind text) returns jsonb
language sql immutable as $$
  select case p_kind
    when 'gel'       then '{"target":true,  "mins":5,  "pct":0.03, "bad":true}'::jsonb
    when 'soleil'    then '{"target":true,  "mins":5,  "pct":0.03, "bad":false}'::jsonb
    when 'brouillard'then '{"target":true,  "mins":5,  "pct":0.02, "bad":true}'::jsonb
    when 'vent'      then '{"target":true,  "mins":0,  "pct":0.03, "bad":true}'::jsonb
    when 'pluie'     then '{"target":false, "mins":20, "pct":0.04, "bad":false}'::jsonb
    when 'tempete'   then '{"target":false, "mins":30, "pct":0.03, "bad":false}'::jsonb
    when 'mer'       then '{"target":false, "mins":30, "pct":0.03, "bad":false}'::jsonb
    when 'saison'    then '{"target":false, "mins":0,  "pct":0.02, "bad":false}'::jsonb
  end;
$$;

create or replace function public._baron2_wish_price(p_kind text, p_target text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare c jsonb := _baron2_wish_cfg(p_kind); base numeric;
begin
  if c is null then return null; end if;
  if (c->>'target')::boolean then
    select greatest(0, fortune) into base from _baron2_fortunes() where id = p_target;
  else
    select avg(greatest(0, fortune)) into base from _baron2_fortunes();
  end if;
  return _baron2_nice(greatest(1e9, coalesce(base, 0) * (c->>'pct')::numeric));
end $$;

-- demandes sans réponse depuis 1 h : remboursées
create or replace function public._baron2_destin_settle() returns void
language plpgsql security definer set search_path = public as $$
declare w record;
begin
  for w in update baron2_wishes set status = 'expired', done_at = now()
           where status = 'ask' and created_at < now() - interval '1 hour' returning * loop
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.from_id, w.price, 'destin_back', 0, w.kind);
  end loop;
end $$;

-- vœux exaucés aujourd'hui (jour de Paris)
create or replace function public._baron2_destin_today() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from baron2_wishes
  where status = 'done' and (done_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date;
$$;

-- jusqu'à quand un joueur est protégé des vœux néfastes
create or replace function public._baron2_destin_safe(p_pid text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(done_at) + interval '1 hour' from baron2_wishes
  where status = 'done' and target_id = p_pid and kind in ('gel', 'brouillard', 'vent') and done_at > now() - interval '1 hour';
$$;

-- tempêtes au port en ce moment : ×2 (Grande tempête), ×0 (Mer d'huile), ×1 sinon ; le dernier vœu l'emporte
create or replace function public._baron2_wx_storm() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select case kind when 'tempete' then 2 else 0 end from baron2_wishes
                   where status = 'done' and kind in ('tempete', 'mer') and end_at > now() order by done_at desc limit 1), 1)::numeric;
$$;

-- les saisons : on ajoute les sauts des « saisons pressées »
create or replace function public._baron2_season() returns int
language sql stable security definer set search_path = public as $$
  select (floor((extract(epoch from now()) * 1000
          + coalesce((select sum(shift_ms) from baron2_wishes where status = 'done' and kind = 'saison' and done_at <= now()), 0)) / 5400000)::bigint % 4)::int
$$;

create or replace function public.baron2_destin_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); D baron2_destin;
begin
  perform _baron2_destin_settle();
  select * into D from baron2_destin where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = D.owner_id),
    'since', D.since,
    'today', _baron2_destin_today(), 'max', 10,
    -- effets des dernières 24 h (le téléphone rattrape aussi le temps hors ligne)
    'fx', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'target', target_id, 'tname', target_name, 'from', from_name,
                    'start', floor(extract(epoch from done_at) * 1000), 'end', floor(extract(epoch from end_at) * 1000)) order by done_at)
                    from baron2_wishes where status = 'done' and end_at > now() - interval '24 hours' and end_at > done_at), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(jsonb_build_array(floor(extract(epoch from done_at) * 1000), shift_ms) order by done_at)
                    from baron2_wishes where status = 'done' and kind = 'saison'), '[]'::jsonb),
    'asks', case when v = D.owner_id then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'from', from_name, 'target', target_id, 'tname', target_name,
                    'price', price, 'at', created_at, 'safe', case when target_id is not null and (_baron2_wish_cfg(kind)->>'bad')::boolean then _baron2_destin_safe(target_id) end) order by id)
                    from baron2_wishes where status = 'ask'), '[]'::jsonb) else '[]'::jsonb end,
    'mine', (select jsonb_build_object('id', id, 'kind', kind, 'tname', target_name, 'price', price, 'status', status, 'at', created_at, 'done', done_at)
             from baron2_wishes where from_id = v and (status = 'ask' or done_at > now() - interval '30 minutes') order by id desc limit 1),
    'log', coalesce((select jsonb_agg(to_jsonb(x) order by x.done_at desc) from (
                    select id, kind, from_name "from", target_name tname, status, done_at from baron2_wishes
                    where status in ('done', 'refused') order by done_at desc limit 12) x), '[]'::jsonb),
    'gains', case when v = D.owner_id then coalesce((select sum(coins) from baron2_credits where player_id = v and product = 'destin_gain' and at > now() - interval '24 hours'), 0) else 0 end,
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'price',
                    jsonb_build_object('gel', _baron2_wish_price('gel', f.id), 'soleil', _baron2_wish_price('soleil', f.id),
                                       'brouillard', _baron2_wish_price('brouillard', f.id), 'vent', _baron2_wish_price('vent', f.id)),
                    'safe', _baron2_destin_safe(f.id)) order by f.name) from _baron2_fortunes() f), '[]'::jsonb),
    'village', jsonb_build_object('pluie', _baron2_wish_price('pluie', null), 'tempete', _baron2_wish_price('tempete', null),
                                  'mer', _baron2_wish_price('mer', null), 'saison', _baron2_wish_price('saison', null)),
    'now', now());
end $$;

-- faire un vœu : le prix est pris tout de suite (un crédit négatif), rendu en cas de refus
create or replace function public.baron2_destin_wish(p_token uuid, p_state jsonb, p_kind text, p_target text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); c jsonb := _baron2_wish_cfg(p_kind); D baron2_destin; pr numeric; nm text; tn text; tg text;
begin
  perform _baron2_destin_settle();
  if c is null then raise exception 'vœu inconnu'; end if;
  select * into D from baron2_destin where id = 1 for update;
  if D.owner_id is null then raise exception 'pas de destin'; end if;
  if v = D.owner_id then raise exception 'tu es le destin'; end if;
  if exists(select 1 from baron2_wishes where from_id = v and status = 'ask') then raise exception 'déjà un vœu'; end if;
  if _baron2_destin_today() >= 10 then raise exception 'plus de vœux'; end if;
  if (c->>'target')::boolean then
    select id, name into tg, tn from baron2_players where id = p_target;
    if tg is null then raise exception 'joueur inconnu'; end if;
    if (c->>'bad')::boolean and tg = v then raise exception 'pas sur toi'; end if;
    if (c->>'bad')::boolean and _baron2_destin_safe(tg) is not null then raise exception 'protégé'; end if;
  end if;
  pr := _baron2_wish_price(p_kind, tg);
  if coalesce((p_state->>'coins')::numeric, -1) < pr then raise exception 'pas assez'; end if;
  select name into nm from baron2_players where id = v;
  insert into baron2_wishes(kind, from_id, from_name, target_id, target_name, price) values (p_kind, v, nm, tg, tn, pr);
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, -pr, 'destin_pay', 0, p_kind);
  return baron2_destin_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

create or replace function public.baron2_destin_cancel(p_token uuid, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); w record;
begin
  for w in update baron2_wishes set status = 'expired', done_at = now() where from_id = v and status = 'ask' returning * loop
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, w.price, 'destin_back', 1, w.kind);
  end loop;
  return baron2_destin_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- le Destin répond : p_yes = true exauce, false refuse (et rembourse)
create or replace function public.baron2_destin_answer(p_token uuid, p_state jsonb, p_id bigint, p_yes boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); D baron2_destin; w baron2_wishes; c jsonb; gain numeric; pt baron2_port; p numeric; base bigint; sh bigint;
begin
  perform _baron2_destin_settle();
  select * into D from baron2_destin where id = 1 for update;
  if v is distinct from D.owner_id then raise exception 'pas le destin'; end if;
  select * into w from baron2_wishes where id = p_id for update;
  if w.id is null or w.status <> 'ask' then raise exception 'vœu expiré'; end if;
  c := _baron2_wish_cfg(w.kind);
  if not coalesce(p_yes, false) then
    update baron2_wishes set status = 'refused', done_at = now() where id = w.id;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.from_id, w.price, 'destin_back', 2, w.kind);
    return baron2_destin_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
  end if;
  if _baron2_destin_today() >= 10 then raise exception 'plus de vœux'; end if;
  if (c->>'bad')::boolean and _baron2_destin_safe(w.target_id) is not null then raise exception 'protégé'; end if;
  if w.kind = 'saison' then
    base := floor(extract(epoch from now()) * 1000)
            + coalesce((select sum(shift_ms) from baron2_wishes where status = 'done' and kind = 'saison'), 0);
    sh := 5400000 - (base % 5400000);
  end if;
  update baron2_wishes set status = 'done', done_at = now(), end_at = now() + make_interval(mins => (c->>'mins')::int), shift_ms = sh where id = w.id;
  gain := floor(w.price * 0.7);
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, gain, 'destin_gain', 0, w.kind || '|' || w.from_name);
  update baron2_lotto set jackpot = jackpot + (w.price - gain) where id = 1;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.from_id, 0, 'destin_ok', 0, w.kind || '|' || coalesce(w.target_name, ''));
  if w.target_id is not null and w.target_id <> w.from_id then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.target_id, 0, 'destin_hit', 0, w.kind || '|' || w.from_name);
  end if;
  -- coup de vent : chaque bateau de la cible déjà en mer retente sa chance face à la tempête
  if w.kind = 'vent' then
    select * into pt from baron2_port where id = 1;
    p := least(0.6, (_baron2_port_cfg(pt.lvl)->>'storm')::numeric * (_baron2_route(pt.route)->>'s')::numeric);
    update baron2_ships set storm = storm or random() < p where player_id = w.target_id and not settled;
  end if;
  return baron2_destin_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

grant execute on function public.baron2_destin_get(uuid), public.baron2_destin_wish(uuid, jsonb, text, text),
  public.baron2_destin_cancel(uuid, jsonb), public.baron2_destin_answer(uuid, jsonb, bigint, boolean) to anon, authenticated;
revoke all on function public._baron2_destin_settle(), public._baron2_destin_today(), public._baron2_destin_safe(text),
  public._baron2_wish_price(text, text), public._baron2_wx_storm() from public, anon, authenticated;

-- le Port : les vœux Grande tempête / Mer d'huile changent le risque des bateaux qui partent
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
    values (v, nm, pt.owner_id, p_product, q, val, fee,
            random() < least(0.6, (c->>'storm')::numeric * (rt->>'s')::numeric * _baron2_wx_storm()),
            now() + make_interval(secs => (c->>'hours')::numeric * (rt->>'h')::numeric * 3600), ins, prem);
  if ins then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (pt.owner_id, prem, 'port_ins', 0, nm);
  end if;
  return baron2_port_get() || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;
grant execute on function public.baron2_port_send(uuid, jsonb, text, numeric, numeric, boolean) to anon, authenticated;
