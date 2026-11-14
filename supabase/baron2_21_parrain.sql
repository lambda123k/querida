-- Le Baron « parrain » (14 nov. 2026)
-- Le Tribut : les charges des lieux vont au Baron du moment (au lieu de la cagnotte de la Loterie).
-- Les Prêts du Baron : un joueur demande, le Baron accepte en fixant le délai ; on rembourse 10 % de plus.
-- Délai dépassé : le Baron se sert automatiquement (ce qui est dû + 20 %), même si l'emprunteur passe en négatif.

create table if not exists baron2_loans (
  id bigserial primary key,
  borrower_id text not null, name text not null,
  lender_id text, lender_name text,
  amount numeric not null, owed numeric,
  status text not null default 'ask',          -- ask, live, paid, seized, refused, expired
  hours int, created_at timestamptz not null default now(), due_at timestamptz, done_at timestamptz);
create index if not exists baron2_loans_open on baron2_loans(status) where status in ('ask','live');
alter table baron2_loans enable row level security;

create or replace function public._baron2_loans_settle() returns void
language plpgsql security definer set search_path = public as $$
declare l record; pen numeric;
begin
  update baron2_loans set status = 'expired', done_at = now() where status = 'ask' and created_at < now() - interval '1 hour';
  for l in update baron2_loans set status = 'seized', done_at = now() where status = 'live' and due_at <= now() returning * loop
    pen := ceil(l.owed * 1.2);
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.borrower_id, -pen, 'loan_seize', l.id, l.lender_name);
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.lender_id, pen, 'loan_seize', l.id, l.name);
  end loop;
end $$;

create or replace function public.baron2_loans_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); top text := _baron2_top();
begin
  perform _baron2_loans_settle();
  return jsonb_build_object(
    'baron', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = top),
    'mine', (select to_jsonb(x) from (select id, amount, owed, status, hours, created_at, due_at, done_at, lender_name from baron2_loans
             where borrower_id = v and (status in ('ask','live') or done_at > now() - interval '30 minutes') order by id desc limit 1) x),
    'asks', case when v = top then coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (select id, borrower_id pid, name, amount, created_at from baron2_loans where status = 'ask' and borrower_id <> v) x), '[]') else '[]' end,
    'book', coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at) from (select id, name, amount, owed, due_at from baron2_loans where status = 'live' and lender_id = v) x), '[]'),
    'tribut', case when v = top then coalesce((select sum(coins) from baron2_credits where player_id = v and product = 'tribut' and at > now() - interval '24 hours'), 0) else 0 end,
    'now', now());
end $$;

create or replace function public.baron2_loan_ask(p_token uuid, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); a numeric := floor(coalesce(p_amount, 0));
begin
  perform _baron2_loans_settle();
  if v = _baron2_top() then raise exception 'tu es le baron'; end if;
  if a < 1 or a > 1e18 then raise exception 'montant invalide'; end if;
  if exists(select 1 from baron2_loans where borrower_id = v and status in ('ask','live')) then raise exception 'déjà un prêt'; end if;
  insert into baron2_loans(borrower_id, name, amount) values (v, (select name from baron2_players where id = v), a);
  return baron2_loans_get(p_token);
end $$;

create or replace function public.baron2_loan_cancel(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  update baron2_loans set status = 'expired', done_at = now() where borrower_id = v and status = 'ask';
  return baron2_loans_get(p_token);
end $$;

-- p_hours = 0 : refus ; sinon le Baron prête (le client a déjà retiré le montant de ses pièces)
create or replace function public.baron2_loan_answer(p_token uuid, p_state jsonb, p_id bigint, p_hours int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); l baron2_loans; nm text;
begin
  perform _baron2_loans_settle();
  if v is distinct from _baron2_top() then raise exception 'pas le baron'; end if;
  select * into l from baron2_loans where id = p_id for update;
  if l.id is null or l.status <> 'ask' then raise exception 'demande expirée'; end if;
  if coalesce(p_hours, 0) = 0 then
    update baron2_loans set status = 'refused', done_at = now() where id = p_id;
    return baron2_loans_get(p_token);
  end if;
  if p_hours not in (1, 3, 6, 24) then raise exception 'délai invalide'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select name into nm from baron2_players where id = v;
  update baron2_loans set status = 'live', lender_id = v, lender_name = nm, owed = ceil(l.amount * 1.1), hours = p_hours, due_at = now() + make_interval(hours => p_hours) where id = p_id;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.borrower_id, l.amount, 'loan_in', p_hours, nm);
  return baron2_loans_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- l'emprunteur rembourse (le client a déjà retiré ce qui est dû)
create or replace function public.baron2_loan_repay(p_token uuid, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); l baron2_loans;
begin
  perform _baron2_loans_settle();
  select * into l from baron2_loans where borrower_id = v and status = 'live' for update;
  if l.id is null then raise exception 'aucun prêt'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  update baron2_loans set status = 'paid', done_at = now() where id = l.id;
  insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.lender_id, l.owed, 'loan_back', l.id, l.name);
  return baron2_loans_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

grant execute on function public.baron2_loans_get(uuid), public.baron2_loan_ask(uuid, numeric), public.baron2_loan_cancel(uuid),
  public.baron2_loan_answer(uuid, jsonb, bigint, int), public.baron2_loan_repay(uuid, jsonb) to anon, authenticated;
revoke all on function public._baron2_loans_settle() from public, anon, authenticated;

-- les crédits vérifient aussi les prêts échus
create or replace function public._baron2_credits(p_pid text, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _baron2_port_settle();
  perform _baron2_lotto_settle();
  perform _baron2_fly_settle();
  perform _baron2_loans_settle();
  perform _baron2_charges();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'product', product, 'qty', qty, 'buyer', buyer) order by id), '[]'::jsonb)
          from (select * from baron2_credits
                where player_id = p_pid and id > coalesce((p_state->>'credit_seen')::bigint, 0)
                order by id limit 300) c);
end $$;

-- le Tribut : les charges vont au Baron (le Baron ne paie pas de charges à lui-même)
create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0; top text := _baron2_top();
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Port' place, owner_id pid, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product = 'port_fee' and at > now() - interval '24 hours'), 0) inc from baron2_port p
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
