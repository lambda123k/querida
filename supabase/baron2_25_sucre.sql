-- Le Baron : 7e spécialité, le Sucre (15 nov. 2026) — pour Gautier
-- Recettes : caramel (lait+sucre), bonbons (miel+sucre), meringue (œufs+sucre), brioche (blé+œufs+sucre)
-- Sous-produit : mélasse · Produit de luxe : rhum. 7 joueurs max.
do $mig$
declare d text;
begin
  -- commandes du village
  d := pg_get_functiondef('public._baron2_gen_orders'::regproc);
  d := replace(d, $a$raw text[] := array['ble','oeufs','lait','fruits','miel','bois'];$a$, $a$raw text[] := array['ble','oeufs','lait','fruits','miel','bois','sucre'];$a$);
  d := replace(d, $a$rec text[] := array['pain','crepes','tarte','confiture','gateau'];$a$, $a$rec text[] := array['pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche'];$a$);
  d := replace(d, $a$allp text[] := array['ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau'];$a$, $a$allp text[] := array['ble','oeufs','lait','fruits','miel','bois','sucre','pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche'];$a$);
  d := replace(d, $a$"gateau":4}'$a$, $a$"gateau":4,"caramel":2,"bonbons":2,"meringue":2,"brioche":3}'$a$);
  d := replace(d, $a$lux text[] := array['biere','fromage','cidre','hydromel'];$a$, $a$lux text[] := array['biere','fromage','cidre','hydromel','rhum'];$a$);
  d := replace(d, $a$"bois":"charpentier"}'$a$, $a$"bois":"charpentier","sucre":"confiseur","caramel":"confiseur","bonbons":"confiseur","meringue":"confiseur","brioche":"patissiere","rhum":"tavernier"}'$a$);
  d := replace(d, $a$"gateau":["noce","chatelaine"]}'$a$, $a$"gateau":["noce","chatelaine"],"sucre":["chatelaine","cirque","colporteur"],"caramel":["cirque","noce"],"bonbons":["cirque","chatelaine"],"meringue":["noce","chatelaine"],"brioche":["capitaine","noce"]}'$a$);
  d := replace(d, 'raw[1 + floor(random() * 6)::int]', 'raw[1 + floor(random() * 7)::int]');
  d := replace(d, 'rec[1 + floor(random() * 5)::int]', 'rec[1 + floor(random() * 9)::int]');
  d := replace(d, 'lux[1 + floor(random() * 4)::int]', 'lux[1 + floor(random() * 5)::int]');
  d := replace(d, 'allp[1 + floor(random() * 11)::int]', 'allp[1 + floor(random() * 16)::int]');
  execute d;

  -- produits acceptés
  d := pg_get_functiondef('public._baron2_push'::regproc);
  d := replace(d, $a$'biere','cidre','fromage','hydromel')$a$, $a$'biere','cidre','fromage','hydromel','sucre','caramel','bonbons','meringue','brioche','melasse','rhum')$a$);
  execute d;
  d := pg_get_functiondef('public.baron2_list'::regproc);
  d := replace(d, $a$'biere','fromage','cidre','hydromel')$a$, $a$'biere','fromage','cidre','hydromel','sucre','caramel','bonbons','meringue','brioche','melasse','rhum')$a$);
  execute d;

  -- réserve du village et profondeur du marché
  d := pg_get_functiondef('public._baron2_res_size'::regproc);
  d := replace(d, $a$('ble','oeufs','lait','fruits','miel','bois')$a$, $a$('ble','oeufs','lait','fruits','miel','bois','sucre')$a$);
  execute d;
  d := pg_get_functiondef('public.baron2_world'::regproc);
  d := replace(d, $a$unnest(array['ble','oeufs','lait','fruits','miel','bois','pain','crepes','tarte','confiture','gateau'])$a$, $a$unnest(array['ble','oeufs','lait','fruits','miel','bois','sucre','pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche'])$a$);
  execute d;
  d := pg_get_functiondef('public._baron2_depth'::regproc);
  d := replace(d, $a$when p_product in ('pain','confiture') then 0.5$a$, $a$when p_product in ('pain','confiture','caramel','bonbons','meringue') then 0.5$a$);
  d := replace(d, $a$when p_product in ('crepes','tarte') then 0.34$a$, $a$when p_product in ('crepes','tarte','brioche') then 0.34$a$);
  d := replace(d, $a$'cire','sciure') then 0.1$a$, $a$'cire','sciure','melasse') then 0.1$a$);
  execute d;

  -- 7 joueurs
  d := pg_get_functiondef('public.baron2_join'::regproc);
  d := replace(d, '(select count(*) from baron2_players) >= 6', '(select count(*) from baron2_players) >= 7');
  execute d;

  -- les anciennes versions de l'appli ne connaissent pas le sucre : on les oblige à recharger
  d := pg_get_functiondef('public._baron2_put'::regproc);
  d := replace(d, $a$  insert into baron2_saves(player_id, state, saved_at)$a$, $a$  if old is not null and old ? 'v6'   and not p_state ? 'v6'   then raise exception 'ancienne version : recharge Querida'; end if;
  insert into baron2_saves(player_id, state, saved_at)$a$);
  execute d;
end $mig$;
