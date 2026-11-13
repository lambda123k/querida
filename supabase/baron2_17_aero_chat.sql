-- =====================================================================
-- Le Baron · Aérodrome qu'on peut fermer + la Taverne (chat) (13 nov. 2026)
-- Aérodrome : le patron l'ouvre ou le ferme quand il veut (les avions déjà en vol finissent leur vol).
-- Taverne : un chat entre joueurs. Messages de 300 caractères max ; on garde les 500 derniers
-- (quelques dizaines de Ko à peine), les plus vieux s'effacent tout seuls.
-- =====================================================================

alter table public.baron2_fly add column if not exists open boolean not null default true;

create or replace function public.baron2_fly_set(p_token uuid, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token);
begin
  if (select owner_id from baron2_fly where id = 1) is distinct from v then raise exception 'pas le patron'; end if;
  update baron2_fly set open = coalesce(p_open, true) where id = 1;
  return baron2_fly_get(p_token);
end $$;
grant execute on function public.baron2_fly_set(uuid, boolean) to anon, authenticated;

-- fly_get renvoie aussi « open »
do $$
declare d text := pg_get_functiondef('public.baron2_fly_get(uuid)'::regprocedure);
begin
  if position('''open''' in d) = 0 then
    d := replace(d, '''since'', F.since,', '''since'', F.since, ''open'', F.open,');
    execute d;
  end if;
end $$;

-- fly_start refuse si l'aérodrome est fermé
do $$
declare d text := pg_get_functiondef('public.baron2_fly_start(uuid, jsonb, numeric)'::regprocedure);
begin
  if position('aérodrome fermé' in d) = 0 then
    d := replace(d, 'if F.owner_id = v then raise exception ''tu es le patron''; end if;',
                    'if F.owner_id = v then raise exception ''tu es le patron''; end if;
  if not F.open then raise exception ''aérodrome fermé''; end if;');
    execute d;
  end if;
end $$;

-- ---------- La Taverne ----------
create table if not exists public.baron2_chat (
  id        bigint generated always as identity primary key,
  player_id text not null,
  name      text not null,
  body      text not null check (char_length(body) between 1 and 300),
  at        timestamptz not null default now()
);
alter table public.baron2_chat enable row level security;

create or replace function public.baron2_chat_get(p_after bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'pid', player_id, 'name', name, 'body', body, 'at', at) order by id), '[]')
  from (select * from baron2_chat where id > coalesce(p_after, 0) order by id desc limit 80) c;
$$;

create or replace function public.baron2_chat_send(p_token uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); b text := btrim(coalesce(p_body, '')); nm text;
begin
  if b = '' then raise exception 'message vide'; end if;
  b := left(b, 300);
  if (select count(*) from baron2_chat where player_id = v and at > now() - interval '10 seconds') >= 5 then raise exception 'doucement'; end if;
  select name into nm from baron2_players where id = v;
  insert into baron2_chat(player_id, name, body) values (v, coalesce(nm, '?'), b);
  delete from baron2_chat where id <= (select id from baron2_chat order by id desc offset 500 limit 1);
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.baron2_chat_get(bigint) to anon, authenticated;
grant execute on function public.baron2_chat_send(uuid, text) to anon, authenticated;
