-- Le Baron · l'Établi (12 nov. 2026) : un grand client pour tout le village toutes les 30 min,
-- le premier qui lui livre l'objet sur mesure gagne. Le client et l'objet sont calculés sur le téléphone
-- (même tirage pour tous) ; le serveur ne garde que le gagnant de chaque client.
create table if not exists public.baron2_etabli (
  cid bigint primary key,
  winner jsonb not null,
  at timestamptz not null default now()
);
alter table public.baron2_etabli enable row level security;

create or replace function public.baron2_etabli_win(p_token uuid, p_cid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); cur bigint := floor(extract(epoch from now()) / 1800); w jsonb; nm text;
begin
  if p_cid <> cur and not (p_cid = cur - 1 and extract(epoch from now()) - cur * 1800 < 20) then
    return jsonb_build_object('won', false, 'late', true);
  end if;
  select winner into w from baron2_etabli where cid = p_cid;
  if w is not null then return jsonb_build_object('won', w->>'id' = v, 'name', w->>'name'); end if;
  select name into nm from baron2_players where id = v;
  insert into baron2_etabli(cid, winner) values (p_cid, jsonb_build_object('id', v, 'name', nm))
  on conflict (cid) do nothing;
  select winner into w from baron2_etabli where cid = p_cid;
  return jsonb_build_object('won', w->>'id' = v, 'name', w->>'name');
end $$;

create or replace function public.baron2_etabli_get() returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(cid::text, winner), '{}'::jsonb) from baron2_etabli
  where cid >= floor(extract(epoch from now()) / 1800) - 1;
$$;

grant execute on function public.baron2_etabli_win(uuid, bigint) to anon, authenticated;
grant execute on function public.baron2_etabli_get() to anon, authenticated;
