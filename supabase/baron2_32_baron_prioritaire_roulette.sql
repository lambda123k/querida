-- Le Baron : le Baron du moment est prioritaire sur la Roulette au grand choix (16 nov. 2026) — EN LIGNE
-- S'il a mis la Roulette en 1er vœu, elle est à lui, sans tirage au sort. (Aussi intégré dans baron2_30.)
create or replace function public._baron2_choix_draw() returns void
language plpgsql security definer set search_path = public as $$
declare free text[] := _baron2_lieux(); todo text[]; rnd int := 0; p record; want jsonb; w text; x text; lieu text; win text; log jsonb := '[]'::jsonb; nm text;
        txt text := '';
begin
  select array_agg(id order by random()) into todo from baron2_players;
  for x in select unnest(_baron2_lieux()) loop perform _baron2_lieu_set(x, null); end loop;
  -- le Baron est prioritaire sur la Roulette : s'il l'a mise en 1er vœu, elle est à lui, sans tirage
  win := _baron2_top();
  if win is not null and (select ranking->>0 from baron2_choix_voeux where player_id = win) = 'casino' then
    perform _baron2_lieu_set('casino', win);
    log := log || jsonb_build_object('place', 'casino', 'id', win, 'name', (select name from baron2_players where id = win), 'round', 1, 'prio', true,
      'others', coalesce((select jsonb_agg(pl.name) from baron2_choix_voeux v join baron2_players pl on pl.id = v.player_id where v.ranking->>0 = 'casino' and v.player_id <> win), '[]'::jsonb),
      'voted', true);
    free := array_remove(free, 'casino'); todo := array_remove(todo, win);
  end if;
  while coalesce(array_length(todo, 1), 0) > 0 and coalesce(array_length(free, 1), 0) > 0 loop
    rnd := rnd + 1;
    want := '{}'::jsonb;
    foreach x in array todo loop
      -- ceux qui n'ont pas voté passent après tous les autres
      if not exists (select 1 from baron2_choix_voeux where player_id = x)
         and exists (select 1 from unnest(todo) y join baron2_choix_voeux v on v.player_id = y) then continue; end if;
      w := null;
      select r into w from baron2_choix_voeux v, jsonb_array_elements_text(v.ranking) with ordinality as t(r, i)
        where v.player_id = x and r = any(free) order by i limit 1;
      if w is null then w := free[1 + floor(random() * array_length(free, 1))::int]; end if;   -- pas de vœu : au hasard
      want := jsonb_set(want, array[w], coalesce(want->w, '[]'::jsonb) || to_jsonb(x));
    end loop;
    for lieu in select jsonb_object_keys(want) loop
      select e into win from jsonb_array_elements_text(want->lieu) e order by random() limit 1;
      perform _baron2_lieu_set(lieu, win);
      log := log || jsonb_build_object('place', lieu, 'id', win, 'name', (select name from baron2_players where id = win), 'round', rnd,
        'others', coalesce((select jsonb_agg(pl.name) from jsonb_array_elements_text(want->lieu) e join baron2_players pl on pl.id = e where e <> win), '[]'::jsonb),
        'voted', exists (select 1 from baron2_choix_voeux where player_id = win));
      free := array_remove(free, lieu); todo := array_remove(todo, win);
    end loop;
  end loop;
  update baron2_choix set status = 'fait', drawn_at = now(), result = log where id = 1;
  select string_agg((e->>'name') || ' : ' || _baron2_lieu_name(e->>'place'), ', ' order by e->>'round', e->>'name') into txt from jsonb_array_elements(log) e;
  insert into baron2_credits(player_id, coins, product, qty, buyer)
    select pl.id, 0, 'choix_fait', 0, coalesce((select e->>'place' from jsonb_array_elements(log) e where e->>'id' = pl.id), '') || '|' || coalesce(txt, '')
    from baron2_players pl;
end $$;
