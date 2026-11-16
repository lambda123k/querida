-- =====================================================================
-- Le Baron : rattrapage (16 nov. 2026) — ce qui était déjà en ligne mais pas dans le dépôt
-- (modifs faites directement sur Supabase : Cadastre désactivable via cad_open, sucre dans les commandes
--  et la réserve du village). Déjà appliqué en ligne : ne sert qu'à garder le dépôt à jour.
-- =====================================================================
alter table baron2_tax add column if not exists cad_open boolean not null default false;

CREATE OR REPLACE FUNCTION public._baron2_gen_orders(p_slot bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m numeric; eff numeric; l jsonb := '[]'::jsonb; k text; big text; q numeric; b numeric; i int; n int;
  raw text[] := array['ble','oeufs','lait','fruits','miel','bois','sucre'];
  rec text[] := array['pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche'];
  allp text[] := array['ble','oeufs','lait','fruits','miel','bois','sucre','pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche'];
  nrec jsonb := '{"pain":2,"crepes":3,"tarte":3,"confiture":2,"gateau":4,"caramel":2,"bonbons":2,"meringue":2,"brioche":3}';
  lux text[] := array['biere','fromage','cidre','hydromel','rhum'];
  who jsonb := '{"biere":"tavernier","cidre":"tavernier","hydromel":"tavernier","fromage":"fromager","ble":"boulanger","pain":"boulanger","oeufs":"aubergiste","lait":"aubergiste","crepes":"aubergiste","gateau":"patissiere","tarte":"patissiere","confiture":"epiciere","fruits":"epiciere","miel":"epiciere","bois":"charpentier","sucre":"confiseur","caramel":"confiseur","bonbons":"confiseur","meringue":"confiseur","brioche":"patissiere","rhum":"tavernier"}';
  vis jsonb := '{"ble":["meunier","cirque","voisine","colporteur"],"oeufs":["voisine","capitaine","colporteur"],"lait":["voisine","cirque","colporteur"],"fruits":["chatelaine","cirque","noce","colporteur"],"miel":["chatelaine","capitaine","colporteur"],"bois":["forgeron","cirque","capitaine","colporteur"],"pain":["capitaine","forgeron","noce"],"crepes":["noce","cirque"],"tarte":["chatelaine","noce"],"confiture":["chatelaine","capitaine"],"gateau":["noce","chatelaine"],"sucre":["chatelaine","cirque","colporteur"],"caramel":["cirque","noce"],"bonbons":["cirque","chatelaine"],"meringue":["noce","chatelaine"],"brioche":["capitaine","noce"]}';
  used text[]; ns int; at1 int; at2 int; t int; kind text; vl jsonb;
begin
  select coalesce(percentile_cont(0.5) within group (order by (stats->>'prod')::numeric), 0) into m
    from baron2_players where updated_at > now() - interval '24 hours' and coalesce((stats->>'prod')::numeric, 0) > 0;
  m := greatest(m, 5); eff := m / 10;
  big := raw[1 + floor(random() * 7)::int]; used := array[big];
  l := l || jsonb_build_array(jsonb_build_object('id', p_slot || '-G', 'k', big, 'big', true, 'who', 'maire',
         'qty', greatest(15, _baron2_nice(eff * (150 + random() * 210) * 1.5)),
         'bonus', _baron2_nice(m * 60 * (8 + random() * 7) * 1.5)));
  for i in 0..5 loop
    loop
      k := case when i < 3 then raw[1 + floor(random() * 7)::int] else rec[1 + floor(random() * 9)::int] end;
      exit when not (k = any(used));
    end loop;
    used := used || k;
    n := coalesce((nrec->>k)::int, 1);
    q := case when i < 3 then greatest(10, _baron2_nice(eff * (150 + random() * 210)))
              else greatest(10, _baron2_nice(eff * (60 + random() * 90) / n)) end;
    b := _baron2_nice(m * 60 * (8 + random() * 7) * case when i < 3 then 1 else 1.4 end);
    l := l || jsonb_build_array(jsonb_build_object('id', p_slot || '-' || i, 'k', k, 'qty', q, 'bonus', b, 'who', who->>k));
  end loop;
  if random() < 0.5 then
    k := lux[1 + floor(random() * 5)::int];
    l := l || jsonb_build_array(jsonb_build_object('id', p_slot || '-L', 'k', k, 'who', who->>k,
           'qty', greatest(10, _baron2_nice(eff * (120 + random() * 180))),
           'bonus', _baron2_nice(m * 60 * (10 + random() * 6) * 1.4)));
  end if;
  ns := case when random() < 0.55 then 2 else 1 end;
  at1 := 90 + floor(random() * (case when ns = 2 then 600 else 900 end))::int;
  at2 := least(1080, at1 + 240 + floor(random() * 600)::int);
  for i in 1..ns loop
    t := case when i = 1 then at1 else at2 end;
    k := allp[1 + floor(random() * 16)::int];
    if k = any(used) then k := allp[1 + floor(random() * 16)::int]; end if;
    used := used || k;
    n := coalesce((nrec->>k)::int, 1);
    kind := case when random() < 0.6 then 'vite' else 'gros' end;
    if kind = 'vite' then
      q := greatest(8, _baron2_nice(eff * (50 + random() * 70) / n));
      b := _baron2_nice(m * 60 * (6 + random() * 5) * case when n > 1 then 1.3 else 1 end);
    else
      q := greatest(20, _baron2_nice(eff * (400 + random() * 300) / n));
      b := _baron2_nice(m * 60 * (16 + random() * 10) * case when n > 1 then 1.3 else 1 end);
    end if;
    vl := vis->k;
    l := l || jsonb_build_array(jsonb_build_object('id', p_slot || '-S' || i, 'k', k, 'qty', q, 'bonus', b,
           'who', vl->>(floor(random() * jsonb_array_length(vl))::int),
           'surprise', true, 'kind', kind, 'at', t, 'line', floor(random() * 3)::int));
  end loop;
  return l;
end $function$;

CREATE OR REPLACE FUNCTION public._baron2_res_size(p_product text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select greatest(30, ceil(count(*) * 60 * coalesce(percentile_cont(0.5) within group (order by greatest((stats->>'prod')::numeric, 0)), 0) / 10
                 / case when p_product in ('ble','oeufs','lait','fruits','miel','bois','sucre') then 1 else 3 end))
  from baron2_players where updated_at > now() - interval '24 hours';
$function$;

CREATE OR REPLACE FUNCTION public.baron2_cad_get()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'open', (select cad_open from baron2_tax where id = 1),
    'port', (select jsonb_build_object('owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = x.owner_id),
              'price', x.price, 'priced', x.priced, 'tax', floor(x.price_max * 0.02), 'safe', x.safe_until) from baron2_port x where id = 1),
    'fly',  (select jsonb_build_object('owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = x.owner_id),
              'price', x.price, 'priced', x.priced, 'tax', floor(x.price_max * 0.02), 'safe', x.safe_until) from baron2_fly x where id = 1),
    'baron', _baron2_top(), 'now', now());
$function$;

CREATE OR REPLACE FUNCTION public.baron2_cad_set(p_token uuid, p_place text, p_price numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := baron2_pid(p_token); pr numeric := floor(coalesce(p_price, 0));
begin
  if not (select cad_open from baron2_tax where id = 1) then raise exception 'rachats fermés'; end if;
  if pr < 1e9 or pr > 1e18 then raise exception 'prix invalide'; end if;
  if p_place = 'port' then
    if (select owner_id from baron2_port where id = 1) is distinct from v then raise exception 'pas ton lieu'; end if;
    update baron2_port set price = pr, price_max = case when priced then greatest(price_max, pr) else pr end, priced = true where id = 1;
  elsif p_place = 'fly' then
    if (select owner_id from baron2_fly where id = 1) is distinct from v then raise exception 'pas ton lieu'; end if;
    update baron2_fly set price = pr, price_max = case when priced then greatest(price_max, pr) else pr end, priced = true where id = 1;
  else raise exception 'lieu inconnu'; end if;
  return baron2_cad_get();
end $function$;

CREATE OR REPLACE FUNCTION public.baron2_cad_buy(p_token uuid, p_state jsonb, p_place text, p_price numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := baron2_pid(p_token); own text; pr numeric; safe timestamptz; nm text; lbl text; ok boolean;
begin
  if not (select cad_open from baron2_tax where id = 1) then raise exception 'rachats fermés'; end if;
  if p_place = 'port' then select owner_id, price, safe_until, priced into own, pr, safe, ok from baron2_port where id = 1 for update; lbl := 'Port';
  elsif p_place = 'fly' then select owner_id, price, safe_until, priced into own, pr, safe, ok from baron2_fly where id = 1 for update; lbl := 'Aérodrome';
  else raise exception 'lieu inconnu'; end if;
  if own = v then raise exception 'déjà à toi'; end if;
  if own is not null and not ok then raise exception 'pas à vendre'; end if;
  if v = _baron2_top() then raise exception 'tu es le baron'; end if;
  if v in (select owner_id from baron2_port where owner_id is not null union select owner_id from baron2_fly where owner_id is not null) then raise exception 'déjà un lieu'; end if;
  if safe is not null and safe > now() then raise exception 'protégé'; end if;
  if pr is distinct from floor(coalesce(p_price, -1)) then raise exception 'prix changé'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  if own is not null then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (own, pr, 'cad_sale', 0, nm || '|' || lbl);
  end if;
  if p_place = 'port' then
    update baron2_port set prev_id = owner_id, owner_id = v, heir_id = null, since = now(), safe_until = now() + interval '30 minutes', price_max = price, priced = true, cfg_at = null where id = 1;
  else
    update baron2_fly set prev_id = owner_id, owner_id = v, heir_id = null, since = now(), safe_until = now() + interval '30 minutes', price_max = price, priced = true, cfg_at = null where id = 1;
  end if;
  return baron2_cad_get() || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $function$;

CREATE OR REPLACE FUNCTION public._baron2_charges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0; top text := _baron2_top();
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Port' place, owner_id pid, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product in ('port_fee', 'port_ins') and at > now() - interval '24 hours'), 0)) inc from baron2_port p
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
end $function$;
