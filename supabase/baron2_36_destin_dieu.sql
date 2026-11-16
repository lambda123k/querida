-- =====================================================================
-- Le Baron : le Destin devient un dieu (16 nov. 2026)
-- La Foudre : une jauge qui se remplit toute seule (+100 par jour, plafond 150) et de +5 à chaque vœu exaucé.
-- Le Destin la dépense quand il veut, sur qui il veut : météo, fléau, bénédiction, main du Destin (paris), naufrage,
-- tempête sur la caravane, jour de fête, krach ou miracle sur un produit, Jugement, exil, message du ciel, ciel du village,
-- titre, et un Prodige par semaine.
-- Vœux : toujours payés par les joueurs ; le Destin exauce, refuse, contre-propose un prix ou exauce « à l'envers ».
-- Garde-fou : une même cible ne peut être frappée par le Destin qu'une fois toutes les 30 min. Tout est affiché sur La Place.
-- À lancer après baron2_35.
-- =====================================================================

alter table baron2_destin add column if not exists foudre numeric not null default 100;
alter table baron2_destin add column if not exists foudre_at timestamptz not null default now();
alter table baron2_destin add column if not exists jug_day date;
alter table baron2_destin add column if not exists prodige_week text;
alter table baron2_wishes add column if not exists arg text;
alter table baron2_wishes add column if not exists power boolean not null default false;
alter table baron2_wishes add column if not exists counter numeric;

-- la Foudre en ce moment
create or replace function public._baron2_foudre() returns numeric
language sql stable security definer set search_path = public as $$
  select floor(least(150, foudre + extract(epoch from (now() - foudre_at)) / 86400 * 100)) from baron2_destin where id = 1;
$$;
create or replace function public._baron2_foudre_add(p_n numeric) returns void
language sql security definer set search_path = public as $$
  update baron2_destin set foudre = greatest(0, least(150, _baron2_foudre() + p_n)), foudre_at = now() where id = 1;
$$;

-- les pouvoirs : coût en Foudre, cible (joueur) ou village, durée (min), néfaste ou non
create or replace function public._baron2_power_cfg(p_kind text) returns jsonb
language sql immutable as $$
  select case p_kind
    when 'gel'        then '{"cost":4,  "target":true,  "mins":5,    "bad":true}'
    when 'soleil'     then '{"cost":4,  "target":true,  "mins":5,    "bad":false}'
    when 'brouillard' then '{"cost":4,  "target":true,  "mins":5,    "bad":true}'
    when 'vent'       then '{"cost":4,  "target":true,  "mins":0,    "bad":true}'
    when 'pluie'      then '{"cost":6,  "target":false, "mins":20,   "bad":false}'
    when 'tempete'    then '{"cost":6,  "target":false, "mins":30,   "bad":false}'
    when 'mer'        then '{"cost":6,  "target":false, "mins":30,   "bad":false}'
    when 'saison'     then '{"cost":6,  "target":false, "mins":0,    "bad":false}'
    when 'fleau'      then '{"cost":12, "target":true,  "mins":10,   "bad":true}'
    when 'beni'       then '{"cost":10, "target":true,  "mins":15,   "bad":false}'
    when 'main_ok'    then '{"cost":15, "target":true,  "mins":2,    "bad":false}'
    when 'main_ko'    then '{"cost":15, "target":true,  "mins":2,    "bad":true}'
    when 'naufrage'   then '{"cost":12, "target":true,  "mins":0,    "bad":true}'
    when 'ventfav'    then '{"cost":12, "target":true,  "mins":0,    "bad":false}'
    when 'cara_storm' then '{"cost":12, "target":false, "mins":240,  "bad":false}'
    when 'cara_safe'  then '{"cost":12, "target":false, "mins":240,  "bad":false}'
    when 'fete'       then '{"cost":20, "target":false, "mins":20,   "bad":false}'
    when 'krach'      then '{"cost":25, "target":false, "mins":50,   "bad":false, "arg":"product"}'
    when 'miracle'    then '{"cost":25, "target":false, "mins":50,   "bad":false, "arg":"product"}'
    when 'jugement'   then '{"cost":40, "target":false, "mins":0,    "bad":false}'
    when 'exil'       then '{"cost":30, "target":true,  "mins":60,   "bad":true}'
    when 'msg'        then '{"cost":5,  "target":false, "mins":10,   "bad":false, "arg":"text"}'
    when 'ciel'       then '{"cost":5,  "target":false, "mins":30,   "bad":false, "arg":"sky"}'
    when 'titre'      then '{"cost":5,  "target":true,  "mins":1440, "bad":false, "arg":"title"}'
    when 'prodige'    then '{"cost":0,  "target":false, "mins":30,   "bad":false, "arg":"prodige"}'
  end::jsonb;
$$;

-- jusqu'à quand une cible est à l'abri des coups du Destin (30 min après le dernier)
create or replace function public._baron2_power_safe(p_pid text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(done_at) + interval '30 minutes' from baron2_wishes
  where status = 'done' and power and target_id = p_pid and done_at > now() - interval '30 minutes'
    and kind in ('gel', 'brouillard', 'vent', 'fleau', 'main_ko', 'naufrage', 'exil');
$$;

-- demandes (et contre-propositions) sans réponse depuis 1 h : remboursées
create or replace function public._baron2_destin_settle() returns void
language plpgsql security definer set search_path = public as $$
declare w record;
begin
  if not exists (select 1 from baron2_wishes where status in ('ask', 'counter') and created_at < now() - interval '1 hour') then return; end if;
  for w in update baron2_wishes set status = 'expired', done_at = now()
           where status in ('ask', 'counter') and created_at < now() - interval '1 hour' returning * loop
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.from_id, w.price, 'destin_back', 0, w.kind);
  end loop;
end $$;

-- vœux exaucés aujourd'hui (les pouvoirs du Destin ne comptent pas)
create or replace function public._baron2_destin_today() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from baron2_wishes
  where status = 'done' and not power and (done_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date;
$$;

-- les effets immédiats d'un vœu ou d'un pouvoir (saison, vent, bateaux, jugement, prodige)
create or replace function public._baron2_wish_fx(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare w baron2_wishes; pt baron2_port; p numeric; base bigint; r record; po record; amt numeric;
begin
  select * into w from baron2_wishes where id = p_id;
  if w.kind = 'saison' then
    base := floor(extract(epoch from now()) * 1000)
            + coalesce((select sum(shift_ms) from baron2_wishes where status = 'done' and kind = 'saison' and id <> w.id), 0);
    update baron2_wishes set shift_ms = 5400000 - (base % 5400000) where id = w.id;
  elsif w.kind = 'vent' then
    select * into pt from baron2_port where id = 1;
    p := least(0.6, (_baron2_port_cfg(pt.lvl)->>'storm')::numeric * (_baron2_route(pt.route)->>'s')::numeric);
    update baron2_ships set storm = storm or random() < p where player_id = w.target_id and not settled;
  elsif w.kind = 'naufrage' then
    update baron2_ships set storm = true where player_id = w.target_id and not settled;
  elsif w.kind = 'ventfav' then
    update baron2_ships set storm = false, arrive = now() + (arrive - now()) / 2 where player_id = w.target_id and not settled and arrive > now();
  elsif w.kind = 'jugement' then
    select f.id, f.name, f.fortune into r from _baron2_fortunes() f order by f.fortune desc limit 1;
    select f.id, f.name, f.fortune into po from _baron2_fortunes() f where f.id <> r.id order by f.fortune asc limit 1;
    if r.id is not null and po.id is not null then
      amt := floor(0.02 * greatest(0, r.fortune));
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.id, -amt, 'destin_jug', 0, '-|' || po.name);
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (po.id, amt, 'destin_jug', 1, '+|' || r.name);
      update baron2_wishes set target_id = r.id, target_name = r.name || ' → ' || po.name where id = w.id;
    end if;
  elsif w.kind = 'prodige' and w.arg = 'or' then
    amt := _baron2_nice(greatest(1e8, coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.01));
    insert into baron2_credits(player_id, coins, product, qty, buyer) select id, amt, 'destin_or', 0, '' from baron2_players;
  end if;
end $$;

create or replace function public.baron2_destin_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); D baron2_destin; own boolean; wk text := to_char(now() at time zone 'Europe/Paris', 'IYYY-IW');
begin
  perform _baron2_destin_settle();
  select * into D from baron2_destin where id = 1;
  own := D.owner_id is not null and D.owner_id = v;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = D.owner_id),
    'since', D.since,
    'today', _baron2_destin_today(), 'max', 10,
    'foudre', _baron2_foudre(), 'foudre_max', 150,
    'jug_ok', D.jug_day is distinct from (now() at time zone 'Europe/Paris')::date,
    'prodige_ok', D.prodige_week is distinct from wk,
    'fx', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'target', target_id, 'tname', target_name, 'from', from_name, 'power', power, 'arg', arg,
                    'start', floor(extract(epoch from done_at) * 1000), 'end', floor(extract(epoch from end_at) * 1000)) order by done_at)
                    from baron2_wishes where status = 'done' and end_at > now() - interval '24 hours' and end_at > done_at), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(jsonb_build_array(floor(extract(epoch from done_at) * 1000), shift_ms) order by done_at)
                    from baron2_wishes where status = 'done' and kind = 'saison'), '[]'::jsonb),
    'asks', case when own then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'from', from_name, 'target', target_id, 'tname', target_name,
                    'price', price, 'counter', counter, 'status', status, 'at', created_at,
                    'safe', case when target_id is not null and (_baron2_wish_cfg(kind)->>'bad')::boolean then _baron2_destin_safe(target_id) end) order by id)
                    from baron2_wishes where status in ('ask', 'counter')), '[]'::jsonb) else '[]'::jsonb end,
    'mine', (select jsonb_build_object('id', id, 'kind', kind, 'tname', target_name, 'price', price, 'counter', counter, 'status', status, 'at', created_at, 'done', done_at, 'rev', arg = 'rev')
             from baron2_wishes where from_id = v and not power and (status in ('ask', 'counter') or done_at > now() - interval '30 minutes') order by id desc limit 1),
    'log', coalesce((select jsonb_agg(to_jsonb(x) order by x.done_at desc) from (
                    select id, kind, from_name "from", target_name tname, status, done_at, power, arg from baron2_wishes
                    where status in ('done', 'refused') order by done_at desc limit 15) x), '[]'::jsonb),
    'gains', case when own then coalesce((select sum(coins) from baron2_credits where player_id = v and product = 'destin_gain' and at > now() - interval '24 hours'), 0) else 0 end,
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'price',
                    jsonb_build_object('gel', _baron2_wish_price('gel', f.id), 'soleil', _baron2_wish_price('soleil', f.id),
                                       'brouillard', _baron2_wish_price('brouillard', f.id), 'vent', _baron2_wish_price('vent', f.id)),
                    'safe', _baron2_destin_safe(f.id), 'psafe', case when own then _baron2_power_safe(f.id) end) order by f.name) from _baron2_fortunes() f), '[]'::jsonb),
    'village', jsonb_build_object('pluie', _baron2_wish_price('pluie', null), 'tempete', _baron2_wish_price('tempete', null),
                                  'mer', _baron2_wish_price('mer', null), 'saison', _baron2_wish_price('saison', null)),
    'now', now());
end $$;

-- un pouvoir du Destin
create or replace function public.baron2_destin_power(p_token uuid, p_kind text, p_target text, p_arg text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); D baron2_destin; c jsonb := _baron2_power_cfg(p_kind); nm text; tg text; tn text; a text := nullif(btrim(coalesce(p_arg, '')), '');
        wk text := to_char(now() at time zone 'Europe/Paris', 'IYYY-IW'); wid bigint; mins int;
begin
  if c is null then raise exception 'pouvoir inconnu'; end if;
  select * into D from baron2_destin where id = 1 for update;
  if D.owner_id is distinct from v then raise exception 'pas le destin'; end if;
  if _baron2_foudre() < (c->>'cost')::numeric then raise exception 'pas assez de foudre'; end if;
  if (c->>'target')::boolean then
    select id, name into tg, tn from baron2_players where id = p_target;
    if tg is null then raise exception 'joueur inconnu'; end if;
    if (c->>'bad')::boolean and tg = v then raise exception 'pas sur toi'; end if;
    if (c->>'bad')::boolean and _baron2_power_safe(tg) is not null then raise exception 'protégé'; end if;
  end if;
  case c->>'arg'
    when 'product' then if a is null or a !~ '^[a-z]{2,16}$' then raise exception 'produit invalide'; end if;
    when 'text'    then if a is null or length(a) > 140 then raise exception 'message invalide'; end if;
    when 'title'   then if a is null or length(a) > 24 then raise exception 'titre invalide'; end if;
    when 'sky'     then if a is null or not (a = any (array['pluie', 'neige', 'orage', 'or', 'nuit'])) then raise exception 'ciel invalide'; end if;
    when 'prodige' then if a is null or not (a = any (array['or', 'recolte'])) then raise exception 'prodige invalide'; end if;
    else a := null;
  end case;
  if p_kind = 'jugement' then
    if D.jug_day = (now() at time zone 'Europe/Paris')::date then raise exception 'déjà jugé'; end if;
    update baron2_destin set jug_day = (now() at time zone 'Europe/Paris')::date where id = 1;
  end if;
  if p_kind = 'prodige' then
    if D.prodige_week = wk then raise exception 'déjà un prodige'; end if;
    update baron2_destin set prodige_week = wk where id = 1;
  end if;
  perform _baron2_foudre_add(-(c->>'cost')::numeric);
  select name into nm from baron2_players where id = v;
  mins := case when p_kind = 'prodige' and a = 'or' then 0 else (c->>'mins')::int end;
  insert into baron2_wishes(kind, from_id, from_name, target_id, target_name, price, status, done_at, end_at, power, arg)
    values (p_kind, v, nm, tg, tn, 0, 'done', now(), now() + make_interval(mins => mins), true, a) returning id into wid;
  perform _baron2_wish_fx(wid);
  if tg is not null and tg <> v then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (tg, 0, 'destin_hit', 1, p_kind || '|' || nm || '|' || coalesce(a, ''));
  end if;
  return baron2_destin_get(p_token);
end $$;

-- exaucer un vœu (à l'endroit ou à l'envers) : effets, gains, Foudre
create or replace function public._baron2_wish_grant(p_id bigint, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare w baron2_wishes; c jsonb := _baron2_wish_cfg(p_kind); gain numeric; D baron2_destin;
begin
  select * into D from baron2_destin where id = 1;
  select * into w from baron2_wishes where id = p_id;
  update baron2_wishes set status = 'done', kind = p_kind, done_at = now(), end_at = now() + make_interval(mins => (c->>'mins')::int),
    arg = case when p_kind <> w.kind then 'rev' else w.arg end where id = w.id;
  perform _baron2_wish_fx(w.id);
  gain := floor(w.price * 0.7);
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (D.owner_id, gain, 'destin_gain', 0, p_kind || '|' || w.from_name);
  update baron2_lotto set jackpot = jackpot + (w.price - gain) where id = 1;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.from_id, 0, case when p_kind <> w.kind then 'destin_rev' else 'destin_ok' end, 0, p_kind || '|' || coalesce(w.target_name, ''));
  if w.target_id is not null and w.target_id <> w.from_id then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.target_id, 0, 'destin_hit', 0, p_kind || '|' || w.from_name);
  end if;
  perform _baron2_foudre_add(5);
end $$;

-- le Destin répond : oui, non, à l'envers (5 de Foudre), ou contre-proposition (un autre prix)
create or replace function public.baron2_destin_reply(p_token uuid, p_state jsonb, p_id bigint, p_mode text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); D baron2_destin; w baron2_wishes; c jsonb; rk text;
begin
  perform _baron2_destin_settle();
  select * into D from baron2_destin where id = 1 for update;
  if v is distinct from D.owner_id then raise exception 'pas le destin'; end if;
  select * into w from baron2_wishes where id = p_id for update;
  if w.id is null or w.status <> 'ask' then raise exception 'vœu expiré'; end if;
  c := _baron2_wish_cfg(w.kind);
  if p_mode = 'no' then
    update baron2_wishes set status = 'refused', done_at = now() where id = w.id;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.from_id, w.price, 'destin_back', 2, w.kind);
  elsif p_mode = 'counter' then
    if p_price is null or p_price < 1 or p_price > 1e30 then raise exception 'prix invalide'; end if;
    update baron2_wishes set status = 'counter', counter = _baron2_nice(p_price), created_at = now() where id = w.id;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (w.from_id, 0, 'destin_counter', 0, w.kind || '|' || _baron2_nice(p_price));
  elsif p_mode in ('yes', 'rev') then
    if _baron2_destin_today() >= 10 then raise exception 'plus de vœux'; end if;
    rk := case when p_mode = 'yes' then w.kind else case w.kind when 'soleil' then 'gel' when 'gel' then 'soleil' when 'tempete' then 'mer' when 'mer' then 'tempete' end end;
    if rk is null then raise exception 'pas d''envers'; end if;
    if p_mode = 'rev' then
      if _baron2_foudre() < 5 then raise exception 'pas assez de foudre'; end if;
      perform _baron2_foudre_add(-5);
    end if;
    if (_baron2_wish_cfg(rk)->>'bad')::boolean and w.target_id is not null and _baron2_destin_safe(w.target_id) is not null then raise exception 'protégé'; end if;
    perform _baron2_wish_grant(w.id, rk);
  else raise exception 'réponse inconnue';
  end if;
  return baron2_destin_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- le joueur répond à la contre-proposition : p_state a déjà la différence retirée (ou ajoutée si le prix baisse)
create or replace function public.baron2_destin_counter(p_token uuid, p_state jsonb, p_yes boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); w baron2_wishes;
begin
  perform _baron2_destin_settle();
  select * into w from baron2_wishes where from_id = v and status = 'counter' order by id desc limit 1 for update;
  if w.id is null then raise exception 'plus de contre-proposition'; end if;
  if coalesce(p_yes, false) then
    if _baron2_destin_today() >= 10 then raise exception 'plus de vœux'; end if;
    if (_baron2_wish_cfg(w.kind)->>'bad')::boolean and w.target_id is not null and _baron2_destin_safe(w.target_id) is not null then raise exception 'protégé'; end if;
    if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
    perform _baron2_put(v, p_state);
    update baron2_wishes set price = w.counter where id = w.id;
    perform _baron2_wish_grant(w.id, w.kind);
  else
    update baron2_wishes set status = 'refused', done_at = now() where id = w.id;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, w.price, 'destin_back', 3, w.kind);
  end if;
  return baron2_destin_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- un vœu en attente bloque aussi pendant une contre-proposition
create or replace function public.baron2_destin_wish(p_token uuid, p_state jsonb, p_kind text, p_target text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); c jsonb := _baron2_wish_cfg(p_kind); D baron2_destin; pr numeric; nm text; tn text; tg text;
begin
  perform _baron2_destin_settle();
  if c is null then raise exception 'vœu inconnu'; end if;
  select * into D from baron2_destin where id = 1 for update;
  if D.owner_id is null then raise exception 'pas de destin'; end if;
  if v = D.owner_id then raise exception 'tu es le destin'; end if;
  if exists(select 1 from baron2_wishes where from_id = v and status in ('ask', 'counter')) then raise exception 'déjà un vœu'; end if;
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
  for w in update baron2_wishes set status = 'expired', done_at = now() where from_id = v and status in ('ask', 'counter') returning * loop
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, w.price, 'destin_back', 1, w.kind);
  end loop;
  return baron2_destin_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- l'ancienne réponse (anciens téléphones) passe par la nouvelle
create or replace function public.baron2_destin_answer(p_token uuid, p_state jsonb, p_id bigint, p_yes boolean) returns jsonb
language sql security definer set search_path = public as $$
  select baron2_destin_reply(p_token, p_state, p_id, case when coalesce(p_yes, false) then 'yes' else 'no' end, null);
$$;

-- Caravane : la tempête ou la protection du Destin s'applique à la prochaine étape
create or replace function public._baron2_cara_step(p_trip int, p_route text, p_step int, p_owner text, p_fee int) returns void
language plpgsql security definer set search_path = public as $$
declare rt jsonb := _baron2_cara_route(p_route); c jsonb; v_last boolean; ev text; x numeric; l record; cat text; rc baron2_recipes;
        v_lost numeric; v_sold numeric; mult numeric; gross numeric; fee numeric; roy numeric; refund numeric; tot numeric := 0; gk text;
begin
  c := rt->'cities'->(p_step - 1);
  v_last := p_step >= jsonb_array_length(rt->'cities');
  x := random();
  if random() < (rt->>'risk')::numeric then
    ev := case when x < 0.5 then 'pillage' when x < 0.8 then 'douane' else 'sable' end;
  end if;
  select kind into gk from baron2_wishes where status = 'done' and kind in ('cara_storm', 'cara_safe') and end_at > now() order by done_at desc limit 1;
  if gk = 'cara_storm' then ev := 'pillage'; elsif gk = 'cara_safe' then ev := null; end if;
  if gk is not null then update baron2_wishes set end_at = now() where status = 'done' and kind in ('cara_storm', 'cara_safe') and end_at > now(); end if;
  for l in select * from baron2_cara_lots where trip = p_trip and left_qty > 0 for update loop
    cat := _baron2_cara_cat(l.product);
    v_lost := case ev when 'pillage' then floor(l.left_qty * 0.4) when 'sable' then floor(l.left_qty * 0.2) else 0 end;
    v_sold := case when v_last then l.left_qty - v_lost else floor((l.left_qty - v_lost) * (c->>'share')::numeric) end;
    mult := (c->>'m')::numeric * case when cat = (c->>'fav') then 1.25 else 1 end * _baron2_cara_sat(p_trip, l.product)
            * case when p_owner is not null and l.player_id = p_owner then 1 + p_fee / 100.0 else 1 end;
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

grant execute on function public.baron2_destin_get(uuid), public.baron2_destin_power(uuid, text, text, text),
  public.baron2_destin_reply(uuid, jsonb, bigint, text, numeric), public.baron2_destin_counter(uuid, jsonb, boolean),
  public.baron2_destin_wish(uuid, jsonb, text, text), public.baron2_destin_cancel(uuid, jsonb),
  public.baron2_destin_answer(uuid, jsonb, bigint, boolean) to anon, authenticated;
revoke all on function public._baron2_foudre(), public._baron2_foudre_add(numeric), public._baron2_power_cfg(text), public._baron2_power_safe(text),
  public._baron2_destin_settle(), public._baron2_destin_today(), public._baron2_wish_fx(bigint), public._baron2_wish_grant(bigint, text),
  public._baron2_cara_step(int, text, int, text, int) from public, anon, authenticated;
