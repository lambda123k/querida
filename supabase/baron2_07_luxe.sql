-- =====================================================================
-- Le Baron — produits de luxe échangeables (11 nov. 2026)
-- · Bière, fromage, cidre, hydromel : mis en bouteille depuis le cellier, ce sont des produits en stock
--   comme les autres : on peut les vendre / acheter entre joueurs.
-- · Le village en commande : une commande de luxe une fois sur deux par créneau (tavernier, fromager).
-- · Garde-fou v5 : un téléphone resté sur l'ancienne version ne peut plus sauvegarder.
-- =====================================================================
create or replace function public._baron2_gen_orders(p_slot bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m numeric; eff numeric; l jsonb := '[]'::jsonb; k text; big text; q numeric; b numeric; i int; n int;
  raw text[] := array['ble','oeufs','lait','fruits','miel','bois'];
  rec text[] := array['pain','crepes','tarte','confiture','gateau'];
  allp text[] := array['ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau'];
  nrec jsonb := '{"pain":2,"crepes":3,"tarte":3,"confiture":2,"gateau":4}';
  lux text[] := array['biere','fromage','cidre','hydromel'];
  who jsonb := '{"biere":"tavernier","cidre":"tavernier","hydromel":"tavernier","fromage":"fromager","ble":"boulanger","pain":"boulanger","oeufs":"aubergiste","lait":"aubergiste","crepes":"aubergiste","gateau":"patissiere","tarte":"patissiere","confiture":"epiciere","fruits":"epiciere","miel":"epiciere","bois":"charpentier"}';
  -- visiteurs surprises possibles selon le produit
  vis jsonb := '{"ble":["meunier","cirque","voisine","colporteur"],"oeufs":["voisine","capitaine","colporteur"],"lait":["voisine","cirque","colporteur"],"fruits":["chatelaine","cirque","noce","colporteur"],"miel":["chatelaine","capitaine","colporteur"],"bois":["forgeron","cirque","capitaine","colporteur"],"pain":["capitaine","forgeron","noce"],"crepes":["noce","cirque"],"tarte":["chatelaine","noce"],"confiture":["chatelaine","capitaine"],"gateau":["noce","chatelaine"]}';
  used text[]; ns int; at1 int; at2 int; t int; kind text; vl jsonb;
begin
  select coalesce(percentile_cont(0.5) within group (order by (stats->>'prod')::numeric), 0) into m
    from baron2_players where updated_at > now() - interval '24 hours' and coalesce((stats->>'prod')::numeric, 0) > 0;
  m := greatest(m, 5); eff := m / 10;
  -- la grande commande du maire
  big := raw[1 + floor(random() * 6)::int]; used := array[big];
  l := l || jsonb_build_array(jsonb_build_object('id', p_slot || '-G', 'k', big, 'big', true, 'who', 'maire',
         'qty', greatest(15, _baron2_nice(eff * (150 + random() * 210) * 1.5)),
         'bonus', _baron2_nice(m * 60 * (8 + random() * 7) * 1.5)));
  -- trois produits de ferme et trois recettes
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
  -- une commande de produit de luxe (fait au cellier) une fois sur deux
  if random() < 0.5 then
    k := lux[1 + floor(random() * 4)::int];
    l := l || jsonb_build_array(jsonb_build_object('id', p_slot || '-L', 'k', k, 'who', who->>k,
           'qty', greatest(10, _baron2_nice(eff * (120 + random() * 180))),
           'bonus', _baron2_nice(m * 60 * (10 + random() * 6) * 1.4)));
  end if;
  -- demandes surprises : 1 ou 2, à des moments au hasard (entre 1 min 30 et 18 min, au moins 4 min d'écart)
  ns := case when random() < 0.55 then 2 else 1 end;
  at1 := 90 + floor(random() * (case when ns = 2 then 600 else 900 end))::int;
  at2 := least(1080, at1 + 240 + floor(random() * 600)::int);
  for i in 1..ns loop
    t := case when i = 1 then at1 else at2 end;
    -- produit : de préférence un autre que les commandes du créneau (bruts plus souvent que recettes)
    k := allp[1 + floor(random() * 11)::int];
    if k = any(used) then k := allp[1 + floor(random() * 11)::int]; end if;
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
end $$;

create or replace function public.baron2_list(p_token uuid, p_state jsonb, p_product text, p_qty numeric, p_price numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); i bigint;
begin
  if p_product not in ('ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau',
                       'paille','plumes','cuir','noyaux','cire','sciure','biere','fromage','cidre','hydromel') then raise exception 'produit inconnu'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1e18 or p_price is null or p_price <= 0 or p_price > 1e9 then raise exception 'offre invalide'; end if;
  if (select count(*) from baron2_listings where seller_id = v) >= 20 then raise exception 'trop d''offres'; end if;
  insert into baron2_listings(seller_id, product, qty, price) values (v, p_product, floor(p_qty), round(p_price, 1)) returning id into i;
  perform _baron2_put(v, p_state);
  return i;
end $$;

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
  if old is not null and old ? 'ord2' and not p_state ? 'ord2' then raise exception 'ancienne version : recharge Querida'; end if;
  if old is not null and old ? 'ord3' and not p_state ? 'ord3' then raise exception 'ancienne version : recharge Querida'; end if;
  if old is not null and old ? 'v4'   and not p_state ? 'v4'   then raise exception 'ancienne version : recharge Querida'; end if;
  if old is not null and old ? 'v5'   and not p_state ? 'v5'   then raise exception 'ancienne version : recharge Querida'; end if;
  insert into baron2_saves(player_id, state, saved_at) values (p_pid, p_state, now())
  on conflict (player_id) do update set state = excluded.state, saved_at = now();
end $$;

revoke all on function public._baron2_gen_orders(bigint) from public, anon, authenticated;
grant execute on function public.baron2_list(uuid, jsonb, text, numeric, numeric) to anon, authenticated;
