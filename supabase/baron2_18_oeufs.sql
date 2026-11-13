-- =====================================================================
-- Le Baron · Les Œufs (13 nov. 2026)
-- On ouvre des œufs (1 gratuit toutes les 8 h, 2 en réserve max ; ou achetés), l'animal éclot.
-- Le Pokédex : 47 animaux, 6 familles, 6 raretés (c, u, r, e, l, m). Brillant : 1 %.
-- Les mythiques (m) n'existent qu'en un exemplaire pour tout le groupe.
-- Les points (une fois par animal, ×5 s'il est brillant) font le classement des collectionneurs.
-- Le Maître des œufs : le premier au bout de 6 jours (19 nov. 13 h), à vie ; il touche 10 % du prix
-- des œufs achetés par les autres, et paie les charges du matin comme les autres lieux.
-- Le totem : un animal du Pokédex qu'on montre aux autres (pour frimer, sans bonus).
-- Les doublons se revendent presque rien (sauf épiques et légendaires).
-- =====================================================================

create table if not exists public.baron2_animals (
  id text primary key, fam text not null, rar text not null, season int, name text not null
);
insert into public.baron2_animals(id, fam, rar, season, name) values
 ('poule','bc','c',null,'Poule rousse'),('poussin','bc','c',0,'Poussin'),('canard','bc','c',null,'Canard'),('oie','bc','u',null,'Oie'),
 ('dinde','bc','u',2,'Dinde'),('pigeon','bc','u',null,'Pigeon voyageur'),('coq','bc','r',null,'Coq doré'),('paon','bc','e',0,'Paon'),
 ('vache','pa','c',null,'Vache'),('mouton','pa','c',null,'Mouton'),('cochon','pa','c',null,'Cochon'),('chevre','pa','u',null,'Chèvre'),
 ('ane','pa','u',null,'Âne'),('cheval','pa','r',null,'Cheval'),('belier','pa','r',0,'Bélier'),('alpaga','pa','r',null,'Alpaga'),('bison','pa','e',null,'Bison'),
 ('lapin','fo','c',0,'Lapin'),('ecureuil','fo','c',2,'Écureuil'),('herisson','fo','u',2,'Hérisson'),('blaireau','fo','u',null,'Blaireau'),
 ('sanglier','fo','u',2,'Sanglier'),('renard','fo','r',null,'Renard'),('hibou','fo','r',3,'Hibou grand-duc'),('cerf','fo','e',2,'Cerf'),
 ('loup','fo','l',3,'Loup'),('ours','fo','l',2,'Ours brun'),
 ('grenouille','ma','c',1,'Grenouille'),('escargot','ma','c',0,'Escargot'),('coccinelle','ma','c',0,'Coccinelle'),('abeille','ma','u',0,'Abeille'),
 ('papillon','ma','u',1,'Papillon'),('tortue','ma','r',1,'Tortue'),('castor','ma','r',null,'Castor'),('cygne','ma','e',3,'Cygne'),('flamant','ma','e',1,'Flamant rose'),
 ('perroquet','ex','r',1,'Perroquet'),('kangourou','ex','r',null,'Kangourou'),('koala','ex','e',null,'Koala'),('paresseux','ex','e',null,'Paresseux'),
 ('manchot','ex','e',3,'Manchot'),('panda','ex','l',null,'Panda'),('tigre','ex','l',1,'Tigre'),('ourspolaire','ex','l',3,'Ours polaire'),
 ('licorne','my','m',null,'Licorne des prés'),('phenix','my','m',null,'Phénix de la moisson'),('dragon','my','m',null,'Dragon des vergers')
on conflict (id) do update set fam = excluded.fam, rar = excluded.rar, season = excluded.season, name = excluded.name;

create table if not exists public.baron2_egg_p (
  player_id text primary key,
  free_n int not null default 2,
  free_at timestamptz not null default now(),
  totem text, totem_shiny boolean not null default false
);
create table if not exists public.baron2_dex (
  player_id text not null, animal text not null, shiny boolean not null default false,
  n int not null default 1, first_at timestamptz not null default now(),
  primary key (player_id, animal, shiny)
);
-- un mythique = un seul exemplaire dans tout le village
create unique index if not exists baron2_dex_myth on public.baron2_dex (animal) where animal in ('licorne','phenix','dragon');
create table if not exists public.baron2_eggbuys (
  id bigint generated always as identity primary key,
  player_id text not null, kind text not null, price numeric not null, at timestamptz not null default now()
);
create index if not exists baron2_eggbuys_p on public.baron2_eggbuys (player_id, at);
create table if not exists public.baron2_hatches (
  id bigint generated always as identity primary key,
  player_id text not null, name text not null, animal text not null, shiny boolean not null, rar text not null, kind text not null,
  at timestamptz not null default now()
);
create table if not exists public.baron2_eggmaster (
  id int primary key default 1 check (id = 1),
  owner_id text,
  ends timestamptz not null,
  decided boolean not null default false
);
insert into public.baron2_eggmaster(id, ends) values (1, '2026-11-19 13:00:00+01') on conflict do nothing;

alter table public.baron2_animals enable row level security;
alter table public.baron2_egg_p enable row level security;
alter table public.baron2_dex enable row level security;
alter table public.baron2_eggbuys enable row level security;
alter table public.baron2_hatches enable row level security;
alter table public.baron2_eggmaster enable row level security;

create or replace function public._baron2_rar_pts(r text) returns numeric
language sql immutable as $$ select case r when 'c' then 1 when 'u' then 3 when 'r' then 10 when 'e' then 40 when 'l' then 200 when 'm' then 1000 else 0 end $$;

create or replace function public._baron2_season() returns int
language sql stable as $$ select (floor(extract(epoch from now()) / 5400)::bigint % 4)::int $$;

-- prix de base : 1 œuf de ferme = 0,3 % de la fortune médiane des joueurs actifs
create or replace function public._baron2_egg_base() returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(1000, coalesce(percentile_cont(0.5) within group (order by f.fortune), 0) * 0.003)::numeric
  from _baron2_fortunes() f join baron2_players p on p.id = f.id where p.updated_at > now() - interval '3 days';
$$;

-- prix pour ce joueur : +15 % par œuf acheté sur les dernières 24 h
create or replace function public._baron2_egg_price(p_pid text, p_kind text) returns numeric
language sql stable security definer set search_path = public as $$
  select floor(_baron2_egg_base()
         * case p_kind when 'dore' then 6.5 when 'saison' then 2.5 else 1 end
         * power(1.15, (select count(*) from baron2_eggbuys where player_id = p_pid and at > now() - interval '24 hours')));
$$;

-- le joueur et ses œufs gratuits (recharge 1 / 8 h, max 2)
create or replace function public._baron2_egg_me(p_pid text) returns baron2_egg_p
language plpgsql security definer set search_path = public as $$
declare e baron2_egg_p; k int;
begin
  insert into baron2_egg_p(player_id) values (p_pid) on conflict do nothing;
  select * into e from baron2_egg_p where player_id = p_pid for update;
  if e.free_n >= 2 then
    update baron2_egg_p set free_at = now() where player_id = p_pid returning * into e;
  else
    k := floor(extract(epoch from (now() - e.free_at)) / 28800)::int;
    if k > 0 then
      update baron2_egg_p set free_n = least(2, free_n + k),
             free_at = case when free_n + k >= 2 then now() else free_at + make_interval(secs => k * 28800) end
      where player_id = p_pid returning * into e;
    end if;
  end if;
  return e;
end $$;

create or replace function public._baron2_egg_points() returns table(pid text, pts numeric, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.player_id, sum(_baron2_rar_pts(a.rar) * case when d.shiny then 5 else 1 end), max(d.first_at)
  from baron2_dex d join baron2_animals a on a.id = d.animal group by d.player_id;
$$;

-- fin du concours : le premier devient Maître des œufs, à vie
create or replace function public._baron2_egg_decide() returns void
language plpgsql security definer set search_path = public as $$
declare M baron2_eggmaster; w text;
begin
  select * into M from baron2_eggmaster where id = 1;
  if M.decided or now() < M.ends then return; end if;
  select * into M from baron2_eggmaster where id = 1 for update;
  if M.decided then return; end if;
  select pid into w from _baron2_egg_points() order by pts desc, last_at limit 1;
  update baron2_eggmaster set owner_id = w, decided = true where id = 1;
end $$;

create or replace function public.baron2_egg_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); e baron2_egg_p; M baron2_eggmaster;
begin
  perform _baron2_egg_decide();
  e := _baron2_egg_me(v);
  select * into M from baron2_eggmaster where id = 1;
  return jsonb_build_object(
    'free', e.free_n, 'next_free', case when e.free_n >= 2 then null else e.free_at + interval '8 hours' end,
    'totem', e.totem, 'totem_shiny', e.totem_shiny,
    'prices', jsonb_build_object('ferme', _baron2_egg_price(v, 'ferme'), 'saison', _baron2_egg_price(v, 'saison'), 'dore', _baron2_egg_price(v, 'dore')),
    'base', _baron2_egg_base(),
    'season', _baron2_season(),
    'dex', coalesce((select jsonb_agg(jsonb_build_object('a', animal, 's', shiny, 'n', n)) from baron2_dex where player_id = v), '[]'),
    'rank', coalesce((select jsonb_agg(jsonb_build_object('pid', p.id, 'name', p.name, 'pts', coalesce(x.pts, 0), 'nb', (select count(distinct animal) from baron2_dex d where d.player_id = p.id),
                       'totem', g.totem, 'ts', coalesce(g.totem_shiny, false)) order by coalesce(x.pts, 0) desc, x.last_at)
              from baron2_players p left join _baron2_egg_points() x on x.pid = p.id left join baron2_egg_p g on g.player_id = p.id), '[]'),
    'myth', coalesce((select jsonb_agg(jsonb_build_object('a', d.animal, 'pid', d.player_id, 'name', p.name)) from baron2_dex d join baron2_animals a on a.id = d.animal and a.rar = 'm' join baron2_players p on p.id = d.player_id), '[]'),
    'feed', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'pid', player_id, 'a', animal, 's', shiny, 'r', rar, 'at', at) order by id desc)
              from (select * from baron2_hatches where rar in ('r','e','l','m') or shiny order by id desc limit 12) h), '[]'),
    'master', jsonb_build_object('ends', M.ends, 'decided', M.decided,
              'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = M.owner_id),
              'fees', coalesce((select sum(coins) from baron2_credits where player_id = M.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0)),
    'now', now());
end $$;

-- ouvrir un œuf. p_kind : 'free' (gratuit), 'ferme', 'saison', 'dore' (payants : le client a déjà retiré p_price de p_state)
create or replace function public.baron2_egg_open(p_token uuid, p_state jsonb, p_kind text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); e baron2_egg_p; pr numeric := 0; u double precision; vr text; mchance double precision;
        sea int := _baron2_season(); an text; sh boolean; nm text; isnew boolean; cnt int; mst text; ek text;
begin
  perform _baron2_egg_decide();
  if p_kind not in ('free','ferme','saison','dore') then raise exception 'œuf inconnu'; end if;
  e := _baron2_egg_me(v);
  ek := case when p_kind = 'free' then 'ferme' else p_kind end;
  if p_kind = 'free' then
    if e.free_n < 1 then raise exception 'pas d''œuf gratuit'; end if;
    update baron2_egg_p set free_n = free_n - 1, free_at = case when free_n >= 2 then now() else free_at end where player_id = v;
  else
    pr := _baron2_egg_price(v, p_kind);
    if coalesce(p_price, 0) < pr * 0.97 then raise exception 'prix changé'; end if;
    pr := floor(p_price);
    if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
    perform _baron2_put(v, p_state);
    insert into baron2_eggbuys(player_id, kind, price) values (v, p_kind, pr);
    select owner_id into mst from baron2_eggmaster where id = 1;
    if mst is not null and mst <> v then
      insert into baron2_credits(player_id, coins, product, qty, buyer)
      values (mst, floor(pr * 0.10), 'egg_fee', 1, (select name from baron2_players where id = v));
    end if;
  end if;

  -- rareté
  mchance := case ek when 'dore' then 0.003 when 'saison' then 0.001 else 0.0005 end;
  u := random();
  if u < mchance and exists(select 1 from baron2_animals a where a.rar = 'm' and not exists(select 1 from baron2_dex d where d.animal = a.id)) then
    vr := 'm';
  else
    u := random() * 100;
    vr := case ek
      when 'dore'   then case when u < 25 then 'c' when u < 60 then 'u' when u < 87 then 'r' when u < 97 then 'e' else 'l' end
      when 'saison' then case when u < 50 then 'c' when u < 78 then 'u' when u < 93 then 'r' when u < 98.5 then 'e' else 'l' end
      else               case when u < 60 then 'c' when u < 85 then 'u' when u < 96 then 'r' when u < 99.5 then 'e' else 'l' end end;
  end if;

  -- l'animal
  if vr = 'm' then
    select a.id into an from baron2_animals a where a.rar = 'm' and not exists(select 1 from baron2_dex d where d.animal = a.id) order by random() limit 1;
  else
    if ek = 'saison' then select id into an from baron2_animals where rar = vr and season = sea order by random() limit 1; end if;
    if an is null then select id into an from baron2_animals a where a.rar = vr and (a.season is null or a.season = sea) order by random() limit 1; end if;
  end if;
  sh := vr <> 'm' and random() < 0.01;

  select n into cnt from baron2_dex where player_id = v and animal = an and shiny = sh for update;
  isnew := cnt is null;
  if isnew then
    insert into baron2_dex(player_id, animal, shiny) values (v, an, sh);
  else
    update baron2_dex set n = n + 1 where player_id = v and animal = an and shiny = sh;
  end if;
  update baron2_egg_p set totem = an, totem_shiny = sh where player_id = v and totem is null;
  select name into nm from baron2_players where id = v;
  insert into baron2_hatches(player_id, name, animal, shiny, rar, kind) values (v, coalesce(nm, '?'), an, sh, vr, p_kind);
  delete from baron2_hatches where id <= (select id from baron2_hatches order by id desc offset 300 limit 1);

  return jsonb_build_object('a', an, 's', sh, 'r', vr, 'new', isnew, 'n', coalesce(cnt, 0) + 1, 'paid', pr, 'get', baron2_egg_get(p_token));
end $$;

-- revendre les doublons (garde 1 exemplaire). p_animal null : tous les doublons
create or replace function public.baron2_egg_sell(p_token uuid, p_state jsonb, p_animal text, p_shiny boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); base numeric := _baron2_egg_base(); tot numeric := 0; q int := 0; d record;
begin
  for d in select x.animal, x.shiny, x.n, a.rar from baron2_dex x join baron2_animals a on a.id = x.animal
           where x.player_id = v and x.n > 1 and (p_animal is null or (x.animal = p_animal and x.shiny = coalesce(p_shiny, false))) for update of x loop
    tot := tot + (d.n - 1) * base * (case d.rar when 'c' then 0.01 when 'u' then 0.025 when 'r' then 0.06 when 'e' then 0.5 when 'l' then 1.5 else 0 end) * (case when d.shiny then 3 else 1 end);
    q := q + d.n - 1;
    update baron2_dex set n = 1 where player_id = v and animal = d.animal and shiny = d.shiny;
  end loop;
  tot := floor(tot);
  if q > 0 and tot > 0 then insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, tot, 'egg_dup', q, ''); end if;
  return jsonb_build_object('qty', q, 'coins', tot, 'credits', _baron2_credits(v, p_state), 'get', baron2_egg_get(p_token));
end $$;

create or replace function public.baron2_egg_totem(p_token uuid, p_animal text, p_shiny boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if not exists(select 1 from baron2_dex where player_id = v and animal = p_animal and shiny = coalesce(p_shiny, false)) then raise exception 'pas à toi'; end if;
  perform _baron2_egg_me(v);
  update baron2_egg_p set totem = p_animal, totem_shiny = coalesce(p_shiny, false) where player_id = v;
  return baron2_egg_get(p_token);
end $$;

-- les charges du matin : on ajoute les Œufs
create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0;
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Casino' place, _baron2_top() pid,
           greatest(0, coalesce((select sum(stake - win) from baron2_spins where baron_id = _baron2_top() and at > now() - interval '24 hours'), 0)) inc
    union all select 'Port', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product = 'port_fee' and at > now() - interval '24 hours'), 0) from baron2_port p
    union all select 'Loterie', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = l.owner_id and product = 'lotto_fee' and at > now() - interval '24 hours'), 0) from baron2_lotto l
    union all select 'Envol', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product = 'fly_fee' and at > now() - interval '24 hours'), 0) from baron2_fly f
    union all select 'Œufs', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = m.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0) from baron2_eggmaster m
  loop
    if r.pid is null then continue; end if;
    amt := floor(greatest(0.20 * r.inc, 0.005 * coalesce((select fortune from _baron2_fortunes() where id = r.pid), 0)));
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'charge', 0, r.place);
    insert into baron2_charges(day, player_id, place, income, amount) values (d, r.pid, r.place, r.inc, amt);
    tot := tot + amt;
  end loop;
  update baron2_lotto set jackpot = jackpot + tot where id = 1;
end $$;

revoke all on function public._baron2_egg_base() from public, anon, authenticated;
revoke all on function public._baron2_egg_price(text, text) from public, anon, authenticated;
revoke all on function public._baron2_egg_me(text) from public, anon, authenticated;
revoke all on function public._baron2_egg_points() from public, anon, authenticated;
revoke all on function public._baron2_egg_decide() from public, anon, authenticated;
revoke all on function public._baron2_charges() from public, anon, authenticated;
grant execute on function public.baron2_egg_get(uuid) to anon, authenticated;
grant execute on function public.baron2_egg_open(uuid, jsonb, text, numeric) to anon, authenticated;
grant execute on function public.baron2_egg_sell(uuid, jsonb, text, boolean) to anon, authenticated;
grant execute on function public.baron2_egg_totem(uuid, text, boolean) to anon, authenticated;
