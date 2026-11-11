-- =====================================================================
-- Le Baron — coups « avec malice » (11 nov. 2026)
-- 1) Prête-nom : acheter en cachette (+15 % payés au village) ; l'acheteur n'apparaît pas dans l'historique.
-- 2) Contrats d'exclusivité : un joueur paie d'avance un ami ; pendant 1 h, toute la récolte de la ferme de
--    l'ami arrive chez lui et l'ami ne peut plus vendre ce produit. Offre valable 30 min, contre-offre possible,
--    une seule offre ou un seul contrat à la fois par ferme, puis 1 h de pause.
-- Les Cartes Chance et l'Almanach sont calculés sur les téléphones (rien côté serveur).
-- Rétrocompatible : les anciennes fonctions restent, les anciens téléphones continuent de marcher.
-- =====================================================================

-- ---------- crédits : différents genres ----------
-- sale : vente au marché (pièces) · goods : marchandise reçue · refund : remboursement · contract : paiement d'un contrat
alter table public.baron2_credits add column if not exists kind text not null default 'sale';

create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer, 'kind', kind) order by id), '[]'::jsonb)
  from (select * from baron2_credits
        where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
        order by id limit 300) c;
$$;

-- ---------- prête-nom ----------
alter table public.baron2_trades add column if not exists hidden boolean not null default false;

create or replace function public.baron2_buy2(p_token uuid, p_state jsonb, p_id bigint, p_qty numeric, p_price numeric, p_hidden boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); l baron2_listings; bn text; tid bigint;
begin
  select * into l from baron2_listings where id = p_id for update;
  if l.id is null or l.price <> p_price or l.qty < p_qty or p_qty < 1 then raise exception 'offre changée'; end if;
  if l.seller_id = v then raise exception 'ta propre offre'; end if;
  if l.qty = p_qty then delete from baron2_listings where id = l.id;
  else update baron2_listings set qty = qty - p_qty where id = l.id; end if;
  select case when coalesce(p_hidden, false) then '🎩 Un mystérieux acheteur' else name end into bn from baron2_players where id = v;
  insert into baron2_trades(product, qty, price, buyer_id, seller_id, hidden) values (l.product, p_qty, l.price, v, l.seller_id, coalesce(p_hidden, false)) returning id into tid;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.seller_id, p_qty * l.price, l.product, p_qty, bn);
  perform _baron2_put(v, p_state);
  return tid;
end $$;

-- l'historique ne montre plus l'acheteur caché (le reste ne change pas)
create or replace function public.baron2_world() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players',  coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'specialty', specialty, 'stats', stats, 'updated_at', updated_at) order by created_at) from baron2_players), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'seller_id', seller_id, 'product', product, 'qty', qty, 'price', price, 'created_at', created_at) order by price, id) from baron2_listings), '[]'::jsonb),
    'trades',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'product', product, 'qty', qty, 'price', price,
                   'buyer_id', case when hidden then null else buyer_id end, 'hidden', hidden, 'seller_id', seller_id, 'at', at) order by id)
                 from (select * from baron2_trades where at > now() - interval '7 days' order by id desc limit 3000) t), '[]'::jsonb),
    'reserve',  jsonb_build_object('slot', _baron2_slot(),
                 'size', (select jsonb_object_agg(k, _baron2_res_size(k)) from unnest(array['ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau']) k),
                 'used', coalesce((select jsonb_object_agg(product, used) from baron2_reserve where slot = _baron2_slot()), '{}'::jsonb)),
    'now', now());
$$;

-- ---------- contrats d'exclusivité ----------
create table if not exists public.baron2_contracts (
  id         bigint generated always as identity primary key,
  buyer_id   text not null references public.baron2_players(id) on delete cascade,
  seller_id  text not null references public.baron2_players(id) on delete cascade,
  product    text not null,
  price      numeric not null check (price > 0),     -- somme déjà payée (mise de côté) par l'acheteur
  counter    numeric,                                -- contre-offre du vendeur
  status     text not null default 'offer' check (status in ('offer','counter','active','refused','cancelled','expired')),
  delivered  numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  start_at   timestamptz,
  end_at     timestamptz
);
create index if not exists baron2_contracts_seller on public.baron2_contracts (seller_id, id);
alter table public.baron2_contracts enable row level security;   -- uniquement via les fonctions

-- offres restées sans réponse 30 min : l'acheteur est remboursé
create or replace function public._baron2_ctr_expire() returns void
language plpgsql security definer set search_path = public as $$
declare c baron2_contracts;
begin
  for c in select * from baron2_contracts where status in ('offer','counter') and updated_at < now() - interval '30 minutes' for update skip locked loop
    update baron2_contracts set status = 'expired', updated_at = now() where id = c.id;
    insert into baron2_credits(player_id, coins, buyer, kind) values (c.buyer_id, c.price, 'Contrat sans réponse', 'refund');
  end loop;
end $$;

create or replace function public._baron2_ctr_json(c baron2_contracts) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', c.id, 'buyer_id', c.buyer_id, 'seller_id', c.seller_id, 'product', c.product, 'price', c.price,
    'counter', c.counter, 'status', c.status, 'delivered', c.delivered, 'created_at', c.created_at, 'updated_at', c.updated_at,
    'start_at', c.start_at, 'end_at', c.end_at);
$$;

-- les contrats du moment (offres, contrats en cours, et ceux finis il y a moins d'1 h pour la pause)
create or replace function public.baron2_contracts() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_ctr_expire();
  return coalesce((select jsonb_agg(_baron2_ctr_json(c) order by c.id) from baron2_contracts c
    where c.status in ('offer','counter') or (c.status = 'active' and c.end_at > now() - interval '1 hour')
       or (c.status in ('refused','cancelled','expired') and c.updated_at > now() - interval '30 minutes')), '[]'::jsonb);
end $$;

-- proposer : la somme sort tout de suite de la poche de l'acheteur (l'état envoyé en tient compte)
create or replace function public.baron2_ctr_offer(p_token uuid, p_state jsonb, p_seller text, p_price numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); sp text; i bigint;
begin
  perform _baron2_ctr_expire();
  if p_seller = v then raise exception 'pas avec toi-même'; end if;
  if p_price is null or p_price < 1 or p_price > 1e30 then raise exception 'somme invalide'; end if;
  select specialty into sp from baron2_players where id = p_seller;
  if sp is null then raise exception 'joueur inconnu'; end if;
  perform 1 from baron2_players where id = p_seller for update;   -- une offre à la fois, même si deux amis cliquent ensemble
  if exists (select 1 from baron2_contracts where seller_id = p_seller and (status in ('offer','counter') or (status = 'active' and end_at > now() - interval '1 hour'))) then
    raise exception 'cette ferme est déjà sous contrat ou en pause';
  end if;
  insert into baron2_contracts(buyer_id, seller_id, product, price) values (v, p_seller, sp, round(p_price)) returning id into i;
  perform _baron2_put(v, p_state);
  return i;
end $$;

-- démarrer un contrat : le vendeur est payé, ses offres de ce produit au marché lui reviennent
create or replace function public._baron2_ctr_start(c baron2_contracts, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare bn text; l baron2_listings;
begin
  update baron2_contracts set status = 'active', price = p_price, start_at = now(), end_at = now() + interval '1 hour', updated_at = now() where id = c.id;
  select name into bn from baron2_players where id = c.buyer_id;
  insert into baron2_credits(player_id, coins, product, buyer, kind) values (c.seller_id, p_price, c.product, bn, 'contract');
  for l in select * from baron2_listings where seller_id = c.seller_id and product = c.product loop
    delete from baron2_listings where id = l.id;
    insert into baron2_credits(player_id, coins, product, qty, buyer, kind) values (c.seller_id, 0, l.product, l.qty, 'Offre retirée (contrat)', 'goods');
  end loop;
end $$;

-- accepter : le vendeur accepte l'offre, ou l'acheteur accepte la contre-offre (il paie ou récupère la différence)
create or replace function public.baron2_ctr_accept(p_token uuid, p_state jsonb, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); c baron2_contracts;
begin
  perform _baron2_ctr_expire();
  select * into c from baron2_contracts where id = p_id for update;
  if c.id is null then raise exception 'contrat introuvable'; end if;
  if c.status = 'offer' and c.seller_id = v then
    perform _baron2_ctr_start(c, c.price);
  elsif c.status = 'counter' and c.buyer_id = v then
    if c.counter < c.price then insert into baron2_credits(player_id, coins, buyer, kind) values (v, c.price - c.counter, 'Différence du contrat', 'refund'); end if;
    perform _baron2_ctr_start(c, c.counter);
  else raise exception 'le contrat a changé'; end if;
  perform _baron2_put(v, p_state);
  select * into c from baron2_contracts where id = p_id;
  return _baron2_ctr_json(c);
end $$;

-- contre-offre du vendeur
create or replace function public.baron2_ctr_counter(p_token uuid, p_id bigint, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if p_price is null or p_price < 1 or p_price > 1e30 then raise exception 'somme invalide'; end if;
  update baron2_contracts set status = 'counter', counter = round(p_price), updated_at = now()
   where id = p_id and seller_id = v and status = 'offer';
  if not found then raise exception 'le contrat a changé'; end if;
end $$;

-- refuser (vendeur) ou annuler / refuser la contre-offre (acheteur) : l'acheteur est remboursé
create or replace function public.baron2_ctr_refuse(p_token uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); c baron2_contracts;
begin
  select * into c from baron2_contracts where id = p_id for update;
  if c.id is null or c.status not in ('offer','counter') or v not in (c.buyer_id, c.seller_id) then raise exception 'le contrat a changé'; end if;
  update baron2_contracts set status = case when v = c.buyer_id then 'cancelled' else 'refused' end, updated_at = now() where id = c.id;
  insert into baron2_credits(player_id, coins, buyer, kind) values (c.buyer_id, c.price, case when v = c.buyer_id then 'Contrat annulé' else 'Contrat refusé' end, 'refund');
end $$;

-- le vendeur envoie la récolte du contrat (total cumulé) : l'acheteur la reçoit à sa prochaine sauvegarde
create or replace function public.baron2_ctr_deliver(p_token uuid, p_id bigint, p_total numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); c baron2_contracts; d numeric; sn text;
begin
  select * into c from baron2_contracts where id = p_id for update;
  if c.id is null or c.seller_id <> v or c.status <> 'active' then raise exception 'le contrat a changé'; end if;
  d := floor(least(coalesce(p_total, 0), 1e30)) - c.delivered;
  if d > 0 then
    update baron2_contracts set delivered = delivered + d where id = c.id;
    select name into sn from baron2_players where id = v;
    insert into baron2_credits(player_id, coins, product, qty, buyer, kind) values (c.buyer_id, 0, c.product, d, sn, 'goods');
  end if;
  return c.delivered + greatest(d, 0);
end $$;

-- au chargement, le vendeur doit connaître son contrat en cours AVANT de rattraper sa production hors ligne
create or replace function public.baron2_load(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); s jsonb; me jsonb; ct jsonb;
begin
  select state into s from baron2_saves where player_id = v;
  select jsonb_build_object('id', id, 'name', name, 'specialty', specialty) into me from baron2_players where id = v;
  select _baron2_ctr_json(c) into ct from baron2_contracts c where c.seller_id = v and c.status = 'active' and c.end_at > now() - interval '7 days' order by c.id desc limit 1;
  return jsonb_build_object('me', me, 'state', s, 'credits', _baron2_credits(v, s), 'ctr', ct, 'now', now());
end $$;

revoke all on function public._baron2_ctr_expire() from public, anon, authenticated;
revoke all on function public._baron2_ctr_start(baron2_contracts, numeric) from public, anon, authenticated;
grant execute on function public.baron2_buy2(uuid, jsonb, bigint, numeric, numeric, boolean) to anon, authenticated;
grant execute on function public.baron2_contracts() to anon, authenticated;
grant execute on function public.baron2_ctr_offer(uuid, jsonb, text, numeric) to anon, authenticated;
grant execute on function public.baron2_ctr_accept(uuid, jsonb, bigint) to anon, authenticated;
grant execute on function public.baron2_ctr_counter(uuid, bigint, numeric) to anon, authenticated;
grant execute on function public.baron2_ctr_refuse(uuid, bigint) to anon, authenticated;
grant execute on function public.baron2_ctr_deliver(uuid, bigint, numeric) to anon, authenticated;
