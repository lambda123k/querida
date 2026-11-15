-- Le Baron : le sucre était refusé par deux contraintes de la base (inscription de Gautier, réserve du village)
alter table baron2_players drop constraint baron2_players_specialty_check;
alter table baron2_players add constraint baron2_players_specialty_check check (specialty = any (array['ble','oeufs','lait','fruits','miel','bois','sucre']));
alter table baron2_reserve drop constraint baron2_reserve_product_check;
alter table baron2_reserve add constraint baron2_reserve_product_check check (product = any (array['ble','oeufs','lait','fruits','miel','bois','sucre','pain','crepes','tarte','confiture','gateau','caramel','bonbons','meringue','brioche']));
