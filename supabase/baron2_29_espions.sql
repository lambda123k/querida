-- =====================================================================
-- Le Baron : le Réseau d'espions, le Laboratoire en mélange libre, la caravane qui sature,
-- le classement flou (16 nov. 2026) — PAS ENCORE EN LIGNE
-- À lancer après baron2_27_destin.sql et baron2_28_labo_caravane.sql, avec les autres nouveaux lieux.
--
-- Le Laboratoire (ouvert à tous) : on pose ce qu'on veut dans la grille de 3×3. La forme compte, pas la
-- position (façon Minecraft). 38 plats connus de tous, le pain perdu est donné en exemple.
-- · Une recette jamais trouvée : son découvreur la cuisine seul, ou la brevète (cher) : tout le monde la
--   cuisine et il touche 5 % de chaque vente en caravane.
-- · Une recette secrète d'un autre (pas brevetée) qu'on refait soi-même : on l'apprend en secret et on peut
--   la cuisiner sans rien lui payer. Il n'en sait rien. (D'où l'intérêt d'espionner le chercheur.)
-- · Seul le chercheur a des indices : 🟢/🎯 par rapport à la recette inconnue la plus proche, le nombre
--   d'ingrédients et l'indice de chaque carte, et « Savoir ce que c'est » (payant). Les autres cherchent à l'aveugle.
-- La Caravane : plus il y a de lots du même produit sur un voyage, moins les villes le paient. Avant le départ,
-- on ne voit pas ce que les autres ont chargé (seul un dossier d'espion le dit). Nouvelles villes, connues de tous.
-- Le Réseau d'espions (un maître espion) : il vend des dossiers sur les joueurs, au prix qu'il fixe pour chaque
-- type ; 10 dossiers gratuits par jour pour lui ; la victime ne sait jamais rien. Il voit les commandes du
-- prochain créneau 20 min avant tout le monde, et peut vendre l'info.
-- Classement flou : les fortunes sont arrondies à 2 chiffres (352B → 350B) ; seul un dossier donne la vraie.
-- Attribution plus tard : update baron2_spy set owner_id = '<id>', since = now() where id = 1;
-- =====================================================================

-- ---------------------------------------------------------------- Laboratoire en mélange libre
-- une grille recalée en haut à gauche : seule la forme compte
create or replace function public._baron2_labo_norm(g jsonb) returns jsonb
language plpgsql immutable as $$
declare r0 int := 3; c0 int := 3; i int; x text; o text[] := array_fill(null::text, array[9]);
begin
  if g is null or jsonb_typeof(g) <> 'array' then return to_jsonb(o); end if;
  for i in 0..8 loop
    x := nullif(g->>i, '');
    if x is not null then r0 := least(r0, i / 3); c0 := least(c0, i % 3); end if;
  end loop;
  if r0 = 3 then return to_jsonb(o); end if;
  for i in 0..8 loop
    x := nullif(g->>i, '');
    if x is not null then o[(i / 3 - r0) * 3 + (i % 3 - c0) + 1] := x; end if;
  end loop;
  return to_jsonb(o);
end $$;

-- {bons ingrédients, bien placés (une fois recalés), 1 si c'est exactement la recette}
create or replace function public._baron2_labo_eval(p_grid jsonb, p_target jsonb) returns int[]
language plpgsql immutable as $$
declare a jsonb := _baron2_labo_norm(p_grid); b jsonb := _baron2_labo_norm(p_target);
        good int := 0; placed int := 0; exact int := 1; i int; g text; t text; tgt text[] := '{}'; mine text[] := '{}'; x text; p int;
begin
  for i in 0..8 loop
    g := nullif(a->>i, ''); t := nullif(b->>i, '');
    if g is not null and g = t then placed := placed + 1; end if;
    if coalesce(g, '') <> coalesce(t, '') then exact := 0; end if;
    if t is not null then tgt := tgt || t; end if;
    if g is not null then mine := mine || g; end if;
  end loop;
  foreach x in array mine loop
    p := array_position(tgt, x);
    if p is not null then good := good + 1; tgt := tgt[1:p-1] || tgt[p+1:]; end if;
  end loop;
  return array[good, placed, exact];
end $$;

alter table baron2_recipes add column if not exists known boolean not null default false;   -- connue de tous (l'exemple)
alter table baron2_labo_tries alter column k drop not null;
alter table baron2_labo_tries add column if not exists hit text;
alter table baron2_labo_tries add column if not exists kind text;                        -- found, copy, known

-- les recettes apprises en secret (refaites d'après la recette secrète d'un autre)
create table if not exists baron2_labo_known (
  player_id text not null references baron2_players(id) on delete cascade,
  k text not null references baron2_recipes(k) on delete cascade,
  at timestamptz not null default now(),
  primary key (player_id, k));
alter table baron2_labo_known enable row level security;

-- « Savoir ce que c'est » acheté par le chercheur
create table if not exists baron2_labo_names (
  player_id text not null references baron2_players(id) on delete cascade,
  k text not null references baron2_recipes(k) on delete cascade,
  at timestamptz not null default now(),
  primary key (player_id, k));
alter table baron2_labo_names enable row level security;

-- les 38 plats à la place des 11 anciennes recettes exotiques (grilles recalées)
delete from baron2_recipes where k not in ('painperdu','croque','pizza','mojito','milkshake','pancakes','tiramisu','creme','nougat','epices',
  'tatin','croquemadame','crepesucre','galette','fondue','welsh','pinacolada','grog','smoothie','saladefruits','compote','madeleines','gaufre',
  'churros','beignet','barbe','pommeamour','brochette','galettedesrois','buche','clafoutis','omelette','painaulait','flan','tartine','crepecidre',
  'plateau','piece');
insert into baron2_recipes(k, ord, name, e, city, riddle, grid, known) values
 ('painperdu', 1, 'Pain perdu', '🍞', 'New York', 'Du pain trempé dans des œufs et du lait, puis doré à la poêle : c''est l''exemple, connu de tous.', _baron2_labo_norm('[null, "pain", null, null, "oeufs", null, null, "lait", null]'::jsonb), true),
 ('croque', 2, 'Croque-monsieur', '🥪', 'Londres', 'Un classique des cafés français, chaud et qui file. C''est un sandwich : quelque chose dessus, quelque chose dessous.', _baron2_labo_norm('["pain", null, null, "fromage", null, null, "pain", null, null]'::jsonb), false),
 ('pizza', 3, 'Pizza', '🍕', 'Rome', 'Ronde, plate, et elle vient d''Italie. Petit secret : la tomate, c''est un fruit.', _baron2_labo_norm('[null, null, null, "ble", "fruits", "fromage", null, null, null]'::jsonb), false),
 ('mojito', 4, 'Mojito', '🍹', 'La Havane', 'Un cocktail cubain bien frais, avec un alcool des îles. Il se boit avec du citron.', _baron2_labo_norm('["fruits", null, null, null, "sucre", null, null, null, "rhum"]'::jsonb), false),
 ('milkshake', 5, 'Milkshake', '🥤', 'New York', 'Ça se boit à la paille dans les fast-foods américains, souvent à la fraise. Le sucre est pile au milieu.', _baron2_labo_norm('[null, null, "fruits", null, "sucre", null, "lait", null, null]'::jsonb), false),
 ('pancakes', 6, 'Pancakes', '🥞', 'New York', 'Le petit-déjeuner des films américains : des galettes empilées, avec un sirop doré tout en haut.', _baron2_labo_norm('[null, "miel", null, "ble", "oeufs", "lait", null, null, null]'::jsonb), false),
 ('tiramisu', 7, 'Tiramisu', '🍨', 'Rome', 'Un dessert italien en couches, avec des biscuits et une crème au mascarpone (un fromage).', _baron2_labo_norm('["gateau", "fromage", null, "oeufs", "sucre", null, null, null, null]'::jsonb), false),
 ('creme', 8, 'Crème brûlée', '🍮', 'Madrid', 'Un dessert à la vanille qu''on casse à la petite cuillère, grâce à sa couche dorée tout en haut.', _baron2_labo_norm('["caramel", null, null, "lait", null, null, "oeufs", "sucre", null]'::jsonb), false),
 ('nougat', 9, 'Nougat', '🤍', 'Rome', 'Une confiserie blanche et dure de Montélimar, pleine d''amandes (des noyaux) et liée au miel.', _baron2_labo_norm('[null, "miel", null, "noyaux", null, "meringue", null, "sucre", null]'::jsonb), false),
 ('epices', 10, 'Pain d''épices', '🍪', 'Moscou', 'Ça sent Noël et les marchés d''hiver. Une farine et beaucoup, beaucoup de miel.', _baron2_labo_norm('["miel", null, "miel", null, "ble", null, null, null, null]'::jsonb), false),
 ('tatin', 11, 'Tarte Tatin', '🥧', 'Londres', 'Une tarte aux pommes cuite à l''envers, toute caramélisée.', _baron2_labo_norm('["fruits", "caramel", null, "ble", null, null, null, null, null]'::jsonb), false),
 ('croquemadame', 12, 'Croque-madame', '🍳', 'Tokyo', 'Le cousin chic du croque-monsieur, avec un œuf posé dessus.', _baron2_labo_norm('["pain", "oeufs", null, "fromage", null, null, "pain", null, null]'::jsonb), false),
 ('crepesucre', 13, 'Crêpe au sucre', '🥞', 'Tokyo', 'La crêpe la plus simple de la crêperie : juste un peu de blanc saupoudré dessus.', _baron2_labo_norm('["sucre", null, null, "crepes", null, null, null, null, null]'::jsonb), false),
 ('galette', 14, 'Galette complète', '🫓', 'Londres', 'La galette bretonne de base : un œuf et du fromage posés dessus.', _baron2_labo_norm('["oeufs", "fromage", null, "crepes", "crepes", null, null, null, null]'::jsonb), false),
 ('fondue', 15, 'Fondue savoyarde', '🫕', 'Moscou', 'Un caquelon de fromage fondu, où l''on trempe des morceaux de pain.', _baron2_labo_norm('[null, "pain", null, "fromage", "fromage", null, null, null, null]'::jsonb), false),
 ('welsh', 16, 'Welsh', '🥘', 'Bruxelles', 'Le plat du Nord : une tranche de pain, noyée sous du fromage fondu… à la bière.', _baron2_labo_norm('["biere", null, null, "fromage", null, null, "pain", null, null]'::jsonb), false),
 ('pinacolada', 17, 'Piña colada', '🍍', 'La Havane', 'Un cocktail des Caraïbes à l''ananas, avec un alcool des îles et une touche crémeuse.', _baron2_labo_norm('["rhum", null, null, "fruits", "lait", null, null, null, null]'::jsonb), false),
 ('grog', 18, 'Grog', '☕', 'Moscou', 'Le remède de grand-mère contre le rhume : un alcool des îles, du citron et le trésor des abeilles.', _baron2_labo_norm('["fruits", null, "miel", null, "rhum", null, null, null, null]'::jsonb), false),
 ('smoothie', 19, 'Smoothie', '🍓', 'Rio', 'Plein de fruits mixés, adoucis avec ce que font les abeilles.', _baron2_labo_norm('["fruits", null, null, "fruits", null, null, "miel", null, null]'::jsonb), false),
 ('saladefruits', 20, 'Salade de fruits', '🍉', 'Rio', 'Un grand saladier de fruits coupés en morceaux, avec un peu de sucre en dessous.', _baron2_labo_norm('["fruits", "fruits", "fruits", null, "sucre", null, null, null, null]'::jsonb), false),
 ('compote', 21, 'Compote', '🍏', 'Bruxelles', 'Des pommes cuites jusqu''à devenir de la purée, avec un peu de sucre.', _baron2_labo_norm('["fruits", "sucre", null, null, null, null, null, null, null]'::jsonb), false),
 ('madeleines', 22, 'Madeleines', '🐚', 'Tokyo', 'Des petits gâteaux en forme de coquillage, bien bombés. Farine, œufs, sucre.', _baron2_labo_norm('["ble", null, null, null, "oeufs", null, null, null, "sucre"]'::jsonb), false),
 ('gaufre', 23, 'Gaufre', '🧇', 'Bruxelles', 'Ça se mange à la fête foraine, avec plein de petits carreaux. Une pâte, et du sucre dessus.', _baron2_labo_norm('["ble", "oeufs", null, "lait", "sucre", null, null, null, null]'::jsonb), false),
 ('churros', 24, 'Churros', '🥨', 'Madrid', 'Des bâtonnets de pâte frits à la fête foraine, roulés dans le sucre.', _baron2_labo_norm('["ble", null, null, null, "sucre", null, null, null, null]'::jsonb), false),
 ('beignet', 25, 'Beignet', '🍩', 'New York', 'Une boule de pâte frite, fourrée de quelque chose de rouge, avec du sucre sur le dessus.', _baron2_labo_norm('[null, "sucre", null, "ble", "confiture", "ble", null, null, null]'::jsonb), false),
 ('barbe', 26, 'Barbe à papa', '🍥', 'Rio', 'Un gros nuage rose qui colle, sur un bâton, à la fête foraine.', _baron2_labo_norm('["sucre", null, null, "sucre", null, null, "bois", null, null]'::jsonb), false),
 ('pommeamour', 27, 'Pomme d''amour', '🍎', 'Pékin', 'Une pomme toute rouge et brillante, plantée sur un bâton, à la fête foraine.', _baron2_labo_norm('["caramel", null, null, "fruits", null, null, "bois", null, null]'::jsonb), false),
 ('brochette', 28, 'Brochette de bonbons', '🍡', 'Pékin', 'Des bonbons enfilés sur une pique en bois, de travers.', _baron2_labo_norm('[null, null, "bonbons", null, "bonbons", null, "bois", null, null]'::jsonb), false),
 ('galettedesrois', 29, 'Galette des rois', '👑', 'Madrid', 'On la mange en janvier en cherchant la fève : de la pâte dessus, de la pâte dessous, des amandes au milieu.', _baron2_labo_norm('["ble", null, null, "noyaux", null, null, "ble", null, null]'::jsonb), false),
 ('buche', 30, 'Bûche de Noël', '🎄', 'Moscou', 'Le dessert de Noël, roulé en forme de bûche, avec des petits champignons en meringue au bout.', _baron2_labo_norm('["gateau", "gateau", "gateau", "meringue", null, null, null, null, null]'::jsonb), false),
 ('clafoutis', 31, 'Clafoutis', '🍒', 'Londres', 'Un flan du Limousin plein de cerises, fait avec des œufs et du lait.', _baron2_labo_norm('["fruits", "fruits", null, "oeufs", "lait", null, null, null, null]'::jsonb), false),
 ('omelette', 32, 'Omelette au fromage', '🥚', 'Madrid', 'Des œufs battus dans la poêle, avec du râpé au bout.', _baron2_labo_norm('["oeufs", "oeufs", "fromage", null, null, null, null, null, null]'::jsonb), false),
 ('painaulait', 33, 'Pain au lait', '🥯', 'Tokyo', 'Un petit pain tout doux du goûter : farine, lait, et une touche sucrée.', _baron2_labo_norm('["ble", "lait", null, null, "sucre", null, null, null, null]'::jsonb), false),
 ('flan', 34, 'Flan pâtissier', '🟨', 'Rio', 'Le flan des boulangeries : une crème bien jaune aux œufs et au lait, posée sur une pâte.', _baron2_labo_norm('["lait", "oeufs", null, "tarte", "tarte", null, null, null, null]'::jsonb), false),
 ('tartine', 35, 'Tartine de confiture', '🥖', 'Bruxelles', 'Le petit-déjeuner le plus simple : une tranche avec quelque chose de sucré étalé dessus.', _baron2_labo_norm('["confiture", null, null, "pain", null, null, null, null, null]'::jsonb), false),
 ('crepecidre', 36, 'Crêpe et cidre', '🍾', 'Bruxelles', 'Le repas breton par excellence : une crêpe, et une bolée à côté.', _baron2_labo_norm('["crepes", "cidre", null, null, null, null, null, null, null]'::jsonb), false),
 ('plateau', 37, 'Plateau de fromages', '🧀', 'Rome', 'Pour finir le repas à la française : trois fromages, et de quoi les manger.', _baron2_labo_norm('["fromage", "fromage", "fromage", null, "pain", null, null, null, null]'::jsonb), false),
 ('piece', 38, 'Pièce montée', '🎂', 'Partout', 'La légende des mariages : une tour de gâteaux très haute, avec du caramel au sommet.', _baron2_labo_norm('[null, "caramel", null, "meringue", "gateau", "meringue", null, "gateau", null]'::jsonb), false)
on conflict (k) do update set ord = excluded.ord, name = excluded.name, e = excluded.e, city = excluded.city,
  riddle = excluded.riddle, grid = excluded.grid, known = excluded.known;

-- peut cuisiner la recette (et donc voir sa grille)
create or replace function public._baron2_labo_can(p_v text, p_k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from baron2_recipes r where r.k = p_k and (r.known or r.patent or r.found_by = p_v))
      or exists (select 1 from baron2_labo_known n where n.player_id = p_v and n.k = p_k);
$$;

-- le brevet : 5 % de la fortune moyenne du village (au moins 50B) ; « Savoir ce que c'est » : 0,5 % (au moins 1B)
create or replace function public._baron2_patent_price() returns numeric
language sql stable security definer set search_path = public as $$
  select _baron2_nice(greatest(5e10, coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.05));
$$;
create or replace function public._baron2_labo_name_price() returns numeric
language sql stable security definer set search_path = public as $$
  select _baron2_nice(greatest(1e9, coalesce((select avg(greatest(0, fortune)) from _baron2_fortunes()), 0) * 0.005));
$$;

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
        -- les indices : seulement pour le chercheur, sur les recettes qu'il ne sait pas encore faire
        'n', case when c.can or own then (select count(*) from jsonb_array_elements_text(r.grid) x where x is not null) end,
        'hint', case when own and not c.can then r.riddle end,
        'what', case when own and not c.can and r.found_by is null and exists (select 1 from baron2_labo_names m where m.player_id = v and m.k = r.k) then r.name end
      ) order by r.ord) from baron2_recipes r cross join lateral (select _baron2_labo_can(v, r.k) can) c), '[]'::jsonb),
    'tries', coalesce((select jsonb_agg(jsonb_build_object('grid', t.grid, 'good', t.good, 'placed', t.placed, 'hit', t.hit, 'kind', t.kind, 'at', t.at) order by t.id desc)
               from (select * from baron2_labo_tries where player_id = v order by id desc limit 16) t), '[]'::jsonb),
    'ntries', (select count(*) from baron2_labo_tries where player_id = v),
    'roy', coalesce((select sum(coins) from baron2_credits where player_id = v and product = 'labo_roy' and at > now() - interval '24 hours'), 0),
    'now', now());
end $$;

-- un mélange : p_state est la ferme, produits posés et prix de l'essai déjà retirés
drop function if exists public.baron2_labo_try(uuid, jsonb, text, jsonb);
create or replace function public.baron2_labo_try(p_token uuid, p_state jsonb, p_grid jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_labo; r baron2_recipes; x record; res int[]; best int[]; n int := 0; i int; g text; nm text;
        kind text; own boolean;
begin
  select * into L from baron2_labo where id = 1;
  own := L.owner_id is not null and L.owner_id = v;
  if jsonb_typeof(p_grid) <> 'array' or jsonb_array_length(p_grid) <> 9 then raise exception 'grille invalide'; end if;
  for i in 0..8 loop
    g := nullif(p_grid->>i, '');
    if g is not null then
      if g !~ '^[a-z]{2,16}$' then raise exception 'grille invalide'; end if;
      if coalesce((p_state->'stock'->>g)::numeric, -1) < 0 then raise exception 'pas assez'; end if;
      n := n + 1;
    end if;
  end loop;
  if n < 1 then raise exception 'grille vide'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  select * into r from baron2_recipes where grid = _baron2_labo_norm(p_grid) for update;
  if r.k is not null then
    if _baron2_labo_can(v, r.k) then kind := 'known';
    elsif r.found_by is null then
      -- une découverte : tout le village l'apprend
      kind := 'found';
      select name into nm from baron2_players where id = v;
      update baron2_recipes set found_by = v, found_name = nm, found_at = now() where k = r.k;
      insert into baron2_credits(player_id, coins, product, qty, buyer)
        select id, 0, 'notice', 0, '⚗️ ' || nm || ' a découvert une recette au Laboratoire : ' || r.e || ' ' || r.name || ' !'
        from baron2_players where id <> v;
    else
      -- la recette secrète d'un autre, refaite : on l'apprend en secret
      kind := 'copy';
      insert into baron2_labo_known(player_id, k) values (v, r.k) on conflict do nothing;
    end if;
    insert into baron2_labo_tries(player_id, k, grid, good, placed, hit, kind) values (v, r.k, p_grid, n, n, r.k, kind);
  else
    -- raté : le chercheur seul sait à quel point il est proche de la recette inconnue la plus proche
    if own then
      for x in select k, grid from baron2_recipes loop
        if _baron2_labo_can(v, x.k) then continue; end if;
        res := _baron2_labo_eval(p_grid, x.grid);
        if best is null or res[1] * 10 + res[2] > best[1] * 10 + best[2] then best := res; end if;
      end loop;
    end if;
    insert into baron2_labo_tries(player_id, k, grid, good, placed) values (v, null, p_grid, coalesce(best[1], -1), coalesce(best[2], -1));
  end if;
  return baron2_labo_get(p_token) || jsonb_build_object(
    'res', jsonb_build_object('hit', r.k, 'kind', kind,
             'good', case when r.k is null and own then coalesce(best[1], 0) end,
             'placed', case when r.k is null and own then coalesce(best[2], 0) end,
             'none', r.k is null and own and best is null),
    'credits', _baron2_credits(v, p_state));
end $$;

-- « Savoir ce que c'est » (le chercheur, sur une recette que personne n'a trouvée) : p_state est la ferme, prix déjà retiré
create or replace function public.baron2_labo_name(p_token uuid, p_state jsonb, p_k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); L baron2_labo; r baron2_recipes;
begin
  select * into L from baron2_labo where id = 1;
  if L.owner_id is distinct from v then raise exception 'pas le chercheur'; end if;
  select * into r from baron2_recipes where k = p_k;
  if r.k is null or r.found_by is not null or r.known then raise exception 'déjà connue'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  insert into baron2_labo_names(player_id, k) values (v, p_k) on conflict do nothing;
  return baron2_labo_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- le brevet : seulement le découvreur ; p_state est la ferme, prix du brevet déjà retiré
create or replace function public.baron2_labo_patent(p_token uuid, p_state jsonb, p_k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); r baron2_recipes;
begin
  select * into r from baron2_recipes where k = p_k for update;
  if r.k is null or r.found_by is distinct from v then raise exception 'pas ta recette'; end if;
  if r.patent then raise exception 'déjà brevetée'; end if;
  if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
  perform _baron2_put(v, p_state);
  update baron2_recipes set patent = true, patent_at = now() where k = p_k;
  insert into baron2_credits(player_id, coins, product, qty, buyer)
    select id, 0, 'notice', 0, '📜 ' || r.found_name || ' a breveté sa recette : ' || r.e || ' ' || r.name || '. Tout le monde peut la cuisiner au Laboratoire et la vendre en caravane !'
    from baron2_players where id <> v;
  return baron2_labo_get(p_token) || jsonb_build_object('credits', _baron2_credits(v, p_state));
end $$;

-- ---------------------------------------------------------------- Caravane : nouvelles villes, saturation, lots cachés
create or replace function public._baron2_cara_route(r text) returns jsonb
language sql immutable as $$
  select case r
    when 'levant' then '{"name":"Route d''Europe","h":1,"risk":0.08,"est":2.6,"cities":[
        {"c":"Bruxelles","share":0.4,"m":2.2,"fav":"luxe"},{"c":"Madrid","share":0.5,"m":2.6,"fav":"craft"},{"c":"Rome","share":1,"m":3,"fav":"craft"}]}'
    when 'epices' then '{"name":"Route des Amériques","h":2,"risk":0.12,"est":3.4,"cities":[
        {"c":"New York","share":0.35,"m":2.8,"fav":"craft"},{"c":"La Havane","share":0.5,"m":3.4,"fav":"luxe"},{"c":"Rio","share":1,"m":4,"fav":"craft"}]}'
    when 'soie' then '{"name":"Le Tour du monde","h":2.5,"risk":0.15,"est":4.4,"cities":[
        {"c":"Londres","share":0.3,"m":3.2,"fav":"luxe"},{"c":"Moscou","share":0.4,"m":4,"fav":"craft"},{"c":"Pékin","share":0.5,"m":4.8,"fav":"craft"},{"c":"Tokyo","share":1,"m":6,"fav":"luxe"}]}'
  end::jsonb;
$$;

-- recette, luxe ou plat du Laboratoire ; null : refusé (récoltes brutes, sous-produits)
create or replace function public._baron2_cara_cat(p text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p = any (array['pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche']) then 'craft'
    when p = any (array['biere','cidre','fromage','hydromel','rhum']) then 'luxe'
    when exists (select 1 from baron2_recipes where k = p and (found_by is not null or known)) then 'exo'
  end;
$$;

-- la saturation : 1 lot du produit = plein prix, 2 lots = ×0,77, 3 = ×0,63, 4 = ×0,53…
create or replace function public._baron2_cara_sat(p_trip int, p_product text) returns numeric
language sql stable security definer set search_path = public as $$
  select 1 / (1 + 0.3 * greatest(0, (select count(*) from baron2_cara_lots where trip = p_trip and product = p_product) - 1));
$$;

-- une étape : la ville achète une part de chaque lot (ou tout, à la dernière)
create or replace function public._baron2_cara_step(p_trip int, p_route text, p_step int, p_owner text, p_fee int) returns void
language plpgsql security definer set search_path = public as $$
declare rt jsonb := _baron2_cara_route(p_route); c jsonb; v_last boolean; ev text; x numeric; l record; cat text; rc baron2_recipes;
        v_lost numeric; v_sold numeric; mult numeric; gross numeric; fee numeric; roy numeric; refund numeric; tot numeric := 0;
begin
  c := rt->'cities'->(p_step - 1);
  v_last := p_step >= jsonb_array_length(rt->'cities');
  x := random();
  if random() < (rt->>'risk')::numeric then
    ev := case when x < 0.5 then 'pillage' when x < 0.8 then 'douane' else 'sable' end;
  end if;
  for l in select * from baron2_cara_lots where trip = p_trip and left_qty > 0 for update loop
    cat := _baron2_cara_cat(l.product);
    v_lost := case ev when 'pillage' then floor(l.left_qty * 0.4) when 'sable' then floor(l.left_qty * 0.2) else 0 end;
    v_sold := case when v_last then l.left_qty - v_lost else floor((l.left_qty - v_lost) * (c->>'share')::numeric) end;
    mult := (c->>'m')::numeric * case when cat = (c->>'fav') then 1.25 else 1 end * _baron2_cara_sat(p_trip, l.product);
    roy := 0; rc := null;
    if cat = 'exo' then
      select * into rc from baron2_recipes where k = l.product;
      if rc.city = (c->>'c') or rc.city = 'Partout' then mult := mult * 1.5; end if;
    end if;
    gross := floor(v_sold * l.unit * mult);
    if ev = 'douane' then gross := floor(gross * 0.7); end if;
    fee := case when p_owner is not null and p_owner <> l.player_id then floor(gross * p_fee / 100.0) else 0 end;
    if rc.k is not null and rc.patent and rc.found_by is not null and rc.found_by <> l.player_id then roy := floor(gross * 0.05); end if;
    if v_sold > 0 then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, gross - fee - roy, 'cara_sale', v_sold, l.product || '|' || (c->>'c') || '|' || coalesce(ev, ''));
      if fee > 0 then insert into baron2_credits(player_id, coins, product, qty, buyer) values (p_owner, fee, 'cara_fee', v_sold, l.name || '|' || (c->>'c')); end if;
      if roy > 0 then insert into baron2_credits(player_id, coins, product, qty, buyer) values (rc.found_by, roy, 'labo_roy', v_sold, l.product || '|' || l.name); end if;
    end if;
    if v_lost > 0 then
      insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, 0, 'cara_lost', v_lost, l.product || '|' || (c->>'c') || '|' || ev);
      if l.insured and p_owner is not null then
        refund := floor(v_lost * l.unit * mult);
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (l.player_id, refund, 'cara_insured', v_lost, l.product);
        insert into baron2_credits(player_id, coins, product, qty, buyer) values (p_owner, -refund, 'cara_ins', 1, l.name);
      end if;
    end if;
    update baron2_cara_lots set left_qty = left_qty - v_lost - v_sold, lost = baron2_cara_lots.lost + v_lost, earned = earned + gross - fee - roy where id = l.id;
    tot := tot + v_sold;
  end loop;
  insert into baron2_cara_steps(trip, route, step, city, event, sold) values (p_trip, p_route, p_step, c->>'c', ev, tot);
end $$;

-- avant le départ, on ne voit pas ce que les autres ont chargé (seulement qu'ils ont un lot)
create or replace function public.baron2_cara_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_cara;
begin
  perform _baron2_cara_settle();
  select * into C from baron2_cara where id = 1;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = C.owner_id),
    'since', C.since,
    'route', C.route, 'rt', _baron2_cara_route(C.route), 'fee', C.fee, 'ins', C.ins_pct, 'cfg_at', C.cfg_at,
    'trip', C.trip, 'on_road', C.on_road, 'first_at', C.first_at, 'depart_at', C.depart_at, 'done_step', C.done_step,
    'auto_at', C.first_at + interval '3 hours',
    'lots', coalesce((select jsonb_agg(case when l.player_id = v or C.on_road then
                jsonb_build_object('id', l.id, 'pid', l.player_id, 'name', l.name, 'product', l.product, 'qty', l.qty, 'left', l.left_qty,
                  'unit', l.unit, 'earned', l.earned, 'lost', l.lost, 'ins', l.insured, 'premium', l.premium,
                  'sat', case when C.on_road then _baron2_cara_sat(C.trip, l.product) end)
              else jsonb_build_object('id', l.id, 'pid', l.player_id, 'name', l.name, 'hidden', true) end order by l.id)
              from baron2_cara_lots l where l.trip = C.trip), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('step', step, 'city', city, 'event', event, 'sold', sold, 'at', at) order by step)
              from baron2_cara_steps where trip = C.trip), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (
              select s.id, s.trip, s.route, s.step, s.city, s.event, s.sold, s.at from baron2_cara_steps s where s.trip < C.trip order by s.id desc limit 12) x), '[]'::jsonb),
    'last', (select jsonb_agg(jsonb_build_object('pid', player_id, 'name', name, 'product', product, 'qty', qty, 'earned', earned, 'lost', lost, 'ins', insured) order by earned desc)
              from baron2_cara_lots where trip = C.trip - 1),
    'fees', case when v = C.owner_id then coalesce((select sum(coins) from baron2_credits where player_id = v and product in ('cara_fee', 'cara_ins') and at > now() - interval '24 hours'), 0) else 0 end,
    'now', now());
end $$;

-- ---------------------------------------------------------------- Réseau d'espions
create table if not exists baron2_spy (
  id int primary key default 1 check (id = 1),
  owner_id text references baron2_players(id) on delete set null,
  since timestamptz,
  prices jsonb not null default '{}'::jsonb,     -- type de dossier → prix fixé par le maître espion (absent : pas à vendre)
  free_day date, free_used int not null default 0);
insert into baron2_spy(id) values (1) on conflict do nothing;
alter table baron2_spy enable row level security;

create table if not exists baron2_spy_files (
  id bigserial primary key,
  buyer_id text not null references baron2_players(id) on delete cascade,
  target_id text references baron2_players(id) on delete cascade,
  target_name text,
  kind text not null,
  data jsonb not null,
  price numeric not null default 0,
  slot bigint,                                    -- pour les commandes : le créneau espionné
  at timestamptz not null default now());
create index if not exists baron2_spy_files_buyer on baron2_spy_files(buyer_id, id);
alter table baron2_spy_files enable row level security;

create or replace function public._baron2_spy_kinds() returns text[]
language sql immutable as $$ select array['argent','stock','paris','caravane','bateaux','labo','commandes'] $$;

-- les commandes du prochain créneau (générées à l'avance, comme dans baron2_orders)
create or replace function public._baron2_spy_next() returns jsonb
language plpgsql security definer set search_path = public as $$
declare sl bigint := _baron2_slot() + 1; o baron2_orders;
begin
  insert into baron2_orders(slot, list) values (sl, _baron2_gen_orders(sl)) on conflict do nothing;
  select * into o from baron2_orders where slot = sl;
  return jsonb_build_object('slot', sl, 'list', o.list, 'starts', to_timestamp(sl * 1200));
end $$;

-- le contenu d'un dossier, tiré de la dernière sauvegarde du joueur et des lieux
create or replace function public._baron2_spy_data(p_kind text, p_target text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s baron2_saves; K baron2_cara;
begin
  if p_kind = 'commandes' then return _baron2_spy_next(); end if;
  select * into s from baron2_saves where player_id = p_target;
  if p_kind = 'argent' then
    return jsonb_build_object(
      'coins', floor(coalesce((s.state->>'coins')::numeric, 0) + coalesce((select sum(c.coins) from baron2_credits c
                 where c.player_id = p_target and c.id > coalesce((s.state->>'credit_seen')::bigint, 0)), 0)),
      'fortune', (select floor(fortune) from _baron2_fortunes() where id = p_target),
      'saved_at', s.saved_at);
  elsif p_kind = 'stock' then
    return jsonb_build_object(
      'stock', coalesce((select jsonb_object_agg(key, floor(value::numeric)) from jsonb_each_text(coalesce(s.state->'stock', '{}'::jsonb))
                 where value ~ '^-?[0-9.eE+]+$' and value::numeric >= 1), '{}'::jsonb),
      'exo', coalesce((select jsonb_object_agg(key, floor(value::numeric)) from jsonb_each_text(coalesce(s.state->'exo', '{}'::jsonb))
                 where value ~ '^-?[0-9.eE+]+$' and value::numeric >= 1), '{}'::jsonb),
      'lab', s.state->'lab', 'barn', s.state->'barn', 'saved_at', s.saved_at);
  elsif p_kind = 'paris' then
    return jsonb_build_object('bets', coalesce(s.state->'bets', '[]'::jsonb), 'saved_at', s.saved_at);
  elsif p_kind = 'caravane' then
    select * into K from baron2_cara where id = 1;
    return jsonb_build_object('on_road', K.on_road, 'route', K.route,
      'lots', coalesce((select jsonb_agg(jsonb_build_object('product', product, 'qty', qty, 'ins', insured) order by id)
                from baron2_cara_lots where trip = K.trip and player_id = p_target), '[]'::jsonb),
      'all', coalesce((select jsonb_object_agg(product, n) from (select product, count(*) n from baron2_cara_lots where trip = K.trip group by product) z), '{}'::jsonb));
  elsif p_kind = 'bateaux' then
    return jsonb_build_object('ships', coalesce((select jsonb_agg(jsonb_build_object('product', product, 'qty', qty, 'value', value, 'arrive', arrive, 'ins', insured) order by arrive)
                from baron2_ships where player_id = p_target and not settled), '[]'::jsonb));
  elsif p_kind = 'labo' then
    return jsonb_build_object(
      'tries', coalesce((select jsonb_agg(jsonb_build_object('grid', t.grid, 'hit', t.hit, 'kind', t.kind, 'at', t.at) order by t.id desc)
                 from (select * from baron2_labo_tries where player_id = p_target order by id desc limit 12) t), '[]'::jsonb),
      'ntries', (select count(*) from baron2_labo_tries where player_id = p_target),
      -- ses recettes secrètes : trouvées par lui et pas brevetées, ou apprises en secret
      'secrets', coalesce((select jsonb_agg(jsonb_build_object('k', r.k, 'name', r.name, 'e', r.e, 'grid', r.grid) order by r.ord)
                 from baron2_recipes r where not r.patent and not r.known
                   and (r.found_by = p_target or exists (select 1 from baron2_labo_known n where n.player_id = p_target and n.k = r.k))), '[]'::jsonb));
  end if;
  return '{}'::jsonb;
end $$;

create or replace function public.baron2_spy_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); E baron2_spy; own boolean; nx jsonb; today date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into E from baron2_spy where id = 1;
  own := E.owner_id is not null and E.owner_id = v;
  nx := _baron2_spy_next();
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = E.owner_id),
    'since', E.since,
    'prices', E.prices,
    'avg', (select floor(avg(greatest(0, fortune))) from _baron2_fortunes()),
    'free_left', case when own then 10 - case when E.free_day = today then E.free_used else 0 end end,
    -- les commandes du prochain créneau : pour le maître espion, ou pour qui a acheté ce dossier
    'next', case when own or exists (select 1 from baron2_spy_files f where f.buyer_id = v and f.kind = 'commandes' and f.slot = (nx->>'slot')::bigint) then nx end,
    'next_slot', (nx->>'slot')::bigint,
    'targets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'specialty', specialty) order by created_at) from baron2_players where id <> v), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'target_id', f.target_id, 'target_name', f.target_name, 'data', f.data, 'price', f.price, 'slot', f.slot, 'at', f.at) order by f.id desc)
               from (select * from baron2_spy_files where buyer_id = v order by id desc limit 15) f), '[]'::jsonb),
    'gains', case when own then coalesce((select sum(coins) from baron2_credits where player_id = v and product = 'spy_fee' and at > now() - interval '24 hours'), 0) end,
    'sales', case when own then coalesce((select jsonb_agg(jsonb_build_object('kind', f.kind, 'buyer', b.name, 'target', f.target_name, 'price', f.price, 'at', f.at) order by f.id desc)
               from (select * from baron2_spy_files where buyer_id <> v and price > 0 and at > now() - interval '24 hours' order by id desc limit 15) f
               join baron2_players b on b.id = f.buyer_id), '[]'::jsonb) end,
    'now', now());
end $$;

-- acheter un dossier : p_state est la ferme, prix déjà retiré ; p_price est le prix que le joueur a vu
create or replace function public.baron2_spy_buy(p_token uuid, p_state jsonb, p_kind text, p_target text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); E baron2_spy; own boolean; pr numeric := 0; tn text; d jsonb; fid bigint; bn text;
        today date := (now() at time zone 'Europe/Paris')::date; sl bigint;
begin
  select * into E from baron2_spy where id = 1 for update;
  if E.owner_id is null then raise exception 'pas de maître espion'; end if;
  own := E.owner_id = v;
  if not (p_kind = any (_baron2_spy_kinds())) then raise exception 'dossier inconnu'; end if;
  if p_kind = 'commandes' then
    if own then raise exception 'tu les vois déjà'; end if;
    sl := _baron2_slot() + 1;
    if exists (select 1 from baron2_spy_files where buyer_id = v and kind = 'commandes' and slot = sl) then raise exception 'déjà acheté'; end if;
  else
    if p_target is null or p_target = v then raise exception 'cible invalide'; end if;
    select name into tn from baron2_players where id = p_target;
    if tn is null then raise exception 'cible invalide'; end if;
  end if;
  if own then
    if E.free_day is distinct from today then update baron2_spy set free_day = today, free_used = 0 where id = 1; E.free_used := 0; end if;
    if E.free_used >= 10 then raise exception 'plus de dossiers gratuits'; end if;
    update baron2_spy set free_used = free_used + 1, free_day = today where id = 1;
  else
    if E.prices->>p_kind is null then raise exception 'pas à vendre'; end if;
    pr := (E.prices->>p_kind)::numeric;
    if p_price is distinct from pr then raise exception 'prix changé'; end if;
    if coalesce((p_state->>'coins')::numeric, -1) < 0 then raise exception 'pas assez'; end if;
    perform _baron2_put(v, p_state);
  end if;
  d := _baron2_spy_data(p_kind, p_target);
  insert into baron2_spy_files(buyer_id, target_id, target_name, kind, data, price, slot)
    values (v, case when p_kind = 'commandes' then null else p_target end, tn, p_kind, d, pr, case when p_kind = 'commandes' then (d->>'slot')::bigint end)
    returning id into fid;
  if pr > 0 then
    select name into bn from baron2_players where id = v;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (E.owner_id, pr, 'spy_fee', 1, p_kind || '|' || bn);
  end if;
  return baron2_spy_get(p_token) || jsonb_build_object('file_id', fid,
    'credits', case when own then '[]'::jsonb else _baron2_credits(v, p_state) end);
end $$;

-- le maître espion fixe le prix d'un type de dossier (null : retiré de la vente)
create or replace function public.baron2_spy_price(p_token uuid, p_kind text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); E baron2_spy;
begin
  select * into E from baron2_spy where id = 1 for update;
  if E.owner_id is distinct from v then raise exception 'pas le maître espion'; end if;
  if not (p_kind = any (_baron2_spy_kinds())) then raise exception 'dossier inconnu'; end if;
  if p_price is null then update baron2_spy set prices = prices - p_kind where id = 1;
  else
    if p_price < 1 or p_price > 1e30 then raise exception 'prix invalide'; end if;
    update baron2_spy set prices = prices || jsonb_build_object(p_kind, _baron2_nice(p_price)) where id = 1;
  end if;
  return baron2_spy_get(p_token);
end $$;

-- ---------------------------------------------------------------- Classement flou
-- 2 chiffres significatifs : 352 → 350, 1 234 567 → 1 200 000
create or replace function public._baron2_round2(x numeric) returns numeric
language sql immutable as $$
  select case when x is null then null when abs(x) < 100 then round(x)
    else round(x / power(10::numeric, floor(log(abs(x))) - 1)) * power(10::numeric, floor(log(abs(x))) - 1) end;
$$;

-- le monde : les fortunes arrondies, et la place exacte de chacun (rk : 1 = le Baron)
create or replace function public.baron2_world() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players',  coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty,
                   'stats', p.stats || jsonb_build_object('fortune', _baron2_round2(floor(f.fortune)), 'rk', f.rk), 'updated_at', p.updated_at) order by p.created_at)
                 from baron2_players p join (select id, fortune, row_number() over (order by fortune desc, created_at) rk from _baron2_fortunes()) f on f.id = p.id), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'seller_id', seller_id, 'product', product, 'qty', qty, 'price', price, 'created_at', created_at) order by price, id) from baron2_listings), '[]'::jsonb),
    'trades',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'product', product, 'qty', qty, 'price', price, 'buyer_id', buyer_id, 'seller_id', seller_id, 'at', at) order by id)
                 from (select * from baron2_trades where at > now() - interval '7 days' order by id desc limit 3000) t), '[]'::jsonb),
    'reserve',  jsonb_build_object('slot', _baron2_slot(),
                 'size', (select jsonb_object_agg(k, _baron2_res_size(k)) from unnest(array['ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau']) k),
                 'used', coalesce((select jsonb_object_agg(product, used) from baron2_reserve where slot = _baron2_slot()), '{}'::jsonb)),
    'press',    coalesce((select jsonb_object_agg(product, jsonb_build_object('p', p, 't', floor(extract(epoch from t) * 1000), 'h', hist)) from baron2_press), '{}'::jsonb),
    'med',      _baron2_med_eff(),
    'now', now());
$$;

-- ---------------------------------------------------------------- Charges
-- le Réseau d'espions paie ses charges comme les autres lieux (20 % de ses ventes de dossiers sur 24 h)
create or replace function public._baron2_charges() returns void
language plpgsql security definer set search_path = public as $$
declare d date := ((now() at time zone 'Europe/Paris') - interval '8 hours')::date; r record; amt numeric; tot numeric := 0; top text := _baron2_top();
begin
  if (select last_day from baron2_tax where id = 1 for update) >= d then return; end if;
  update baron2_tax set last_day = d where id = 1;
  for r in
    select 'Port' place, owner_id pid, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = p.owner_id and product in ('port_fee', 'port_ins') and at > now() - interval '24 hours'), 0)) inc from baron2_port p
    union all select 'Envol', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = f.owner_id and product in ('fly_fee', 'fly_bank') and at > now() - interval '24 hours'), 0)) from baron2_fly f
    union all select 'Œufs', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = m.owner_id and product = 'egg_fee' and at > now() - interval '24 hours'), 0) from baron2_eggmaster m
    union all select 'Caravane', owner_id, greatest(0, coalesce((select sum(coins) from baron2_credits c where c.player_id = k.owner_id and product in ('cara_fee', 'cara_ins') and at > now() - interval '24 hours'), 0)) from baron2_cara k
    union all select 'Espions', owner_id, coalesce((select sum(coins) from baron2_credits c where c.player_id = e.owner_id and product = 'spy_fee' and at > now() - interval '24 hours'), 0) from baron2_spy e
    -- le Laboratoire : ses brevets, payés à celui qui a trouvé la recette
    union all select 'Laboratoire', player_id, sum(coins) from baron2_credits where product = 'labo_roy' and at > now() - interval '24 hours' group by player_id
  loop
    if r.pid is null or r.pid = top then continue; end if;
    amt := floor(0.20 * greatest(0, r.inc));
    if amt <= 0 then continue; end if;
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (r.pid, -amt, 'charge', 0, r.place);
    insert into baron2_charges(day, player_id, place, income, amount) values (d, r.pid, r.place, r.inc, amt);
    tot := tot + amt;
  end loop;
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
  if top is not null and tot > 0 then
    insert into baron2_credits(player_id, coins, product, qty, buyer) values (top, tot, 'tribut', 0, 'Tribut');
  end if;
end $$;

grant execute on function public.baron2_labo_get(uuid), public.baron2_labo_try(uuid, jsonb, jsonb), public.baron2_labo_patent(uuid, jsonb, text),
  public.baron2_labo_name(uuid, jsonb, text), public.baron2_cara_get(uuid), public.baron2_world(),
  public.baron2_spy_get(uuid), public.baron2_spy_buy(uuid, jsonb, text, text, numeric), public.baron2_spy_price(uuid, text, numeric) to anon, authenticated;
revoke all on function public._baron2_labo_norm(jsonb), public._baron2_labo_eval(jsonb, jsonb), public._baron2_labo_can(text, text),
  public._baron2_patent_price(), public._baron2_labo_name_price(), public._baron2_cara_route(text), public._baron2_cara_cat(text),
  public._baron2_cara_sat(int, text), public._baron2_cara_step(int, text, int, text, int), public._baron2_spy_kinds(), public._baron2_spy_next(),
  public._baron2_spy_data(text, text), public._baron2_round2(numeric), public._baron2_charges()
  from public, anon, authenticated;
