-- =====================================================================
-- Suppression complète de l'ancien Baron (tables et fonctions baron_*)
-- À lancer au moment de mettre en ligne le nouveau Baron (baron2_*), pas avant :
-- l'ancienne version de l'appli s'en sert encore tant qu'elle est en ligne.
-- Ne touche à rien d'autre (ni baron2_*, ni le reste de Querida).
-- =====================================================================
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'baron\_%' and p.proname not like 'baron2\_%' loop
    execute 'drop function if exists ' || r.f || ' cascade';
  end loop;
  for r in select tablename from pg_tables
           where schemaname = 'public' and tablename like 'baron\_%' and tablename not like 'baron2\_%' loop
    execute 'drop table if exists public.' || quote_ident(r.tablename) || ' cascade';
  end loop;
end $$;
