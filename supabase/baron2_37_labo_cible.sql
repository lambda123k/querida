-- =====================================================================
-- Le Baron : Laboratoire, 🟢 / 🎯 corrigés (16 nov. 2026)
-- · 🎯 « à la bonne place » : on essaie tous les décalages de la recette dans la grille et on garde le meilleur
--   (avant, un produit faux en haut ou à gauche décalait tout et faisait tomber 🎯 à 0).
-- · La réponse du chercheur dit à quelle recette inconnue elle se compare (la plus proche ; à égalité,
--   la première du livre), pour qu'il sache quelle carte il approche.
-- =====================================================================

alter table baron2_labo_tries add column if not exists near text;

-- {bons ingrédients, bien placés (meilleur décalage), 1 si c'est exactement la recette}
create or replace function public._baron2_labo_eval(p_grid jsonb, p_target jsonb) returns int[]
language plpgsql immutable as $$
declare good int := 0; placed int := 0; exact int; i int; g text; t text; tgt text[] := '{}'; mine text[] := '{}'; x text; p int;
        dr int; dc int; r int; c int; sr int; sc int; cnt int;
begin
  exact := case when _baron2_labo_norm(p_grid) = _baron2_labo_norm(p_target) then 1 else 0 end;
  for i in 0..8 loop
    g := nullif(p_grid->>i, ''); t := nullif(p_target->>i, '');
    if t is not null then tgt := tgt || t; end if;
    if g is not null then mine := mine || g; end if;
  end loop;
  foreach x in array mine loop
    p := array_position(tgt, x);
    if p is not null then good := good + 1; tgt := tgt[1:p-1] || tgt[p+1:]; end if;
  end loop;
  for dr in -2..2 loop
    for dc in -2..2 loop
      cnt := 0;
      for i in 0..8 loop
        g := nullif(p_grid->>i, '');
        if g is null then continue; end if;
        r := i / 3; c := i % 3; sr := r - dr; sc := c - dc;
        if sr between 0 and 2 and sc between 0 and 2 and nullif(p_target->>(sr * 3 + sc), '') = g then cnt := cnt + 1; end if;
      end loop;
      placed := greatest(placed, cnt);
    end loop;
  end loop;
  return array[good, placed, exact];
end $$;

create or replace function public.baron2_labo_try(p_token uuid, p_state jsonb, p_grid jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_labo; r baron2_recipes; x record; res int[]; best int[]; best_k text; n int := 0; i int; g text; nm text;
        kind text; own boolean; avgf numeric; jp numeric;
begin
  select * into L from baron2_labo where id = 1;
  own := L.owner_id is not null and L.owner_id = v;
  if jsonb_typeof(p_grid) <> 'array' or jsonb_array_length(p_grid) <> 9 then raise exception 'grille invalide'; end if;
  for i in 0..8 loop
    g := nullif(p_grid->>i, '');
    if g is not null then
      if g !~ '^[a-z]{2,16}$' then raise exception 'grille invalide'; end if;
      if coalesce((p_state->'stock'->>g)::numeric, (p_state->'rare'->>g)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
      n := n + 1;
    end if;
  end loop;
  if n < 1 then raise exception 'grille vide'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select avg(greatest(0, fortune)) into avgf from _baron2_fortunes();
  select * into r from baron2_recipes where grid = _baron2_labo_norm(p_grid) for update;
  if r.k is not null then
    if _baron2_labo_can(v, r.k) then kind := 'known';
    elsif r.found_by is null then
      kind := 'found';
      select name into nm from baron2_players where id = v;
      update baron2_recipes set found_by = v, found_name = nm, found_at = now() where k = r.k;
      insert into baron2_credits(player_id, coins, product, qty, buyer)
        select id, 0, 'notice', 0, '⚗️ ' || nm || ' a découvert une recette au Laboratoire : ' || r.e || ' ' || r.name || ' !'
        from baron2_players where id <> v;
      if L.owner_id is not null then
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (L.owner_id, _baron2_labo_prime(), 'labo_prime', 0, r.k || '|' || nm);
      end if;
      if r.k = 'piece' then
        jp := greatest(L.jackpot, _baron2_nice(coalesce(avgf, 0) * 0.02));
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (v, jp, 'labo_jackpot', 0, 'piece');
        insert into baron2_credits(player_id, coins, product, qty, buyer)
          select id, 0, 'notice', 0, '🏆 ' || nm || ' a trouvé la pièce montée et remporte le grand prix du Laboratoire !' from baron2_players where id <> v;
        update baron2_labo set jackpot = 0 where id = 1;
      end if;
    else
      kind := 'copy';
      insert into baron2_labo_known(player_id, k) values (v, r.k) on conflict do nothing;
    end if;
    insert into baron2_labo_tries(player_id, k, grid, good, placed, hit, kind) values (v, r.k, p_grid, n, n, r.k, kind);
  else
    if own then
      for x in select k, grid from baron2_recipes order by ord loop
        if _baron2_labo_can(v, x.k) then continue; end if;
        res := _baron2_labo_eval(p_grid, x.grid);
        if best is null or res[1] * 10 + res[2] > best[1] * 10 + best[2] then best := res; best_k := x.k; end if;
      end loop;
    end if;
    insert into baron2_labo_tries(player_id, k, grid, good, placed, near) values (v, null, p_grid, coalesce(best[1], -1), coalesce(best[2], -1), best_k);
    if exists (select 1 from baron2_recipes where k = 'piece' and found_by is null) then
      update baron2_labo set jackpot = greatest(jackpot, _baron2_nice(coalesce(avgf, 0) * 0.02)) + _baron2_nice(greatest(1e7, coalesce(avgf, 0) * 0.0005)) where id = 1;
    end if;
  end if;
  return baron2_labo_get(p_token) || jsonb_build_object(
    'res', jsonb_build_object('hit', r.k, 'kind', kind,
             'good', case when r.k is null and own then coalesce(best[1], 0) end,
             'placed', case when r.k is null and own then coalesce(best[2], 0) end,
             'near', case when r.k is null and own then best_k end,
             'none', r.k is null and own and best is null),
    'credits', _baron2_credits(v, p_state));
end $$;

-- l'historique des mélanges garde la recette comparée (pour « n°X »)
create or replace function public.baron2_labo_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_labo; own boolean;
begin
  select * into L from baron2_labo where id = 1;
  own := L.owner_id is not null and L.owner_id = v;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = L.owner_id),
    'since', L.since,
    'patent_price', _baron2_patent_price(),
    'name_price', _baron2_labo_name_price(),
    'prime', _baron2_labo_prime(),
    'jackpot', case when exists (select 1 from baron2_recipes where k = 'piece' and found_by is null)
                    then greatest(L.jackpot, _baron2_nice(coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.02)) end,
    'book', coalesce((select jsonb_agg(jsonb_build_object(
        'k', r.k, 'ord', r.ord,
        'found', r.found_by is not null, 'known', r.known,
        'by', r.found_name, 'by_id', r.found_by, 'at', r.found_at, 'patent', r.patent,
        'name', case when r.found_by is not null or r.known then r.name end,
        'e', case when r.found_by is not null or r.known then r.e end,
        'city', case when r.found_by is not null or r.known then r.city end,
        'cook', c.can,
        'copied', exists (select 1 from baron2_labo_known n where n.player_id = v and n.k = r.k),
        'grid', case when c.can then r.grid end,
        'ings', case when c.can then (select jsonb_agg(x) from jsonb_array_elements_text(r.grid) x where x is not null) end,
        'n', case when c.can or own then (select count(*) from jsonb_array_elements_text(r.grid) x where x is not null) end,
        'hint', case when own and not c.can then r.riddle end,
        'what', case when own and not c.can and r.found_by is null and exists (select 1 from baron2_labo_names m where m.player_id = v and m.k = r.k) then r.name end
      ) order by r.ord) from baron2_recipes r cross join lateral (select _baron2_labo_can(v, r.k) can) c), '[]'::jsonb),
    'tries', coalesce((select jsonb_agg(jsonb_build_object('grid', t.grid, 'good', t.good, 'placed', t.placed, 'hit', t.hit, 'kind', t.kind, 'near', t.near, 'at', t.at) order by t.id desc)
               from (select * from baron2_labo_tries where player_id = v order by id desc limit 16) t), '[]'::jsonb),
    'ntries', (select count(*) from baron2_labo_tries where player_id = v),
    'roy', coalesce((select sum(coins) from baron2_credits where player_id = v and product in ('labo_roy', 'labo_prime') and at > now() - interval '24 hours'), 0),
    'now', now());
end $$;
