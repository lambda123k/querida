-- =====================================================================
-- Le Baron — atelier, sous-produits, cellier (appliqué le 11 nov. 2026)
-- · Les sous-produits (paille, plumes, cuir, noyaux, cire, sciure) peuvent être mis en vente entre joueurs.
-- · Garde-fou : une fois passé à cette version (clé v4 dans la sauvegarde), un téléphone resté sur
--   l'ancienne version ne peut plus sauvegarder (il perdrait l'atelier, le cellier et les sous-produits).
-- Le cellier et les outils sont gérés sur le téléphone (rien d'autre à changer côté serveur).
-- =====================================================================
create or replace function public.baron2_list(p_token uuid, p_state jsonb, p_product text, p_qty numeric, p_price numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); i bigint;
begin
  if p_product not in ('ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau',
                       'paille','plumes','cuir','noyaux','cire','sciure') then raise exception 'produit inconnu'; end if;
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
  insert into baron2_saves(player_id, state, saved_at) values (p_pid, p_state, now())
  on conflict (player_id) do update set state = excluded.state, saved_at = now();
end $$;

grant execute on function public.baron2_list(uuid, jsonb, text, numeric, numeric) to anon, authenticated;
