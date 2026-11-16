-- =====================================================================
-- Le Baron (16 nov. 2026, soir)
-- · Vœux du Destin 10× moins chers (0,2 à 0,4 % de la fortune visée ou moyenne, au moins 100M).
-- · La cagnotte de la Loterie se nourrit des petites pertes du village :
--   20 % de la valeur d'un bateau coulé, 30 % des marchandises perdues par la caravane,
--   10 % des charges et des impôts des lieux (en plus, rien n'est retiré à personne).
-- =====================================================================

create or replace function public._baron2_wish_cfg(p_kind text) returns jsonb
language sql immutable as $$
  select case p_kind
    when 'gel'       then '{"target":true,  "mins":5,  "pct":0.003, "bad":true}'::jsonb
    when 'soleil'    then '{"target":true,  "mins":5,  "pct":0.003, "bad":false}'::jsonb
    when 'brouillard'then '{"target":true,  "mins":5,  "pct":0.002, "bad":true}'::jsonb
    when 'vent'      then '{"target":true,  "mins":0,  "pct":0.003, "bad":true}'::jsonb
    when 'pluie'     then '{"target":false, "mins":20, "pct":0.004, "bad":false}'::jsonb
    when 'tempete'   then '{"target":false, "mins":30, "pct":0.003, "bad":false}'::jsonb
    when 'mer'       then '{"target":false, "mins":30, "pct":0.003, "bad":false}'::jsonb
    when 'saison'    then '{"target":false, "mins":0,  "pct":0.002, "bad":false}'::jsonb
  end;
$$;

create or replace function public._baron2_wish_price(p_kind text, p_target text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare c jsonb := _baron2_wish_cfg(p_kind); base numeric;
begin
  if c is null then return null; end if;
  if (c->>'target')::boolean then
    select greatest(0, fortune) into base from _baron2_fortunes() where id = p_target;
  else
    select avg(greatest(0, fortune)) into base from _baron2_fortunes();
  end if;
  return _baron2_nice(greatest(1e8, coalesce(base, 0) * (c->>'pct')::numeric));
end $$;

-- la cagnotte grossit
create or replace function public._baron2_lotto_feed(p_amt numeric) returns void
language sql security definer set search_path = public as $$
  update baron2_lotto set jackpot = jackpot + floor(greatest(0, coalesce(p_amt, 0))) where id = 1 and coalesce(p_amt, 0) >= 1;
$$;

create or replace function public._baron2_lotto_from_ship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.settled and not old.settled and new.storm then perform _baron2_lotto_feed(new.value * 0.20); end if;
  return new;
end $$;
drop trigger if exists baron2_lotto_ship on baron2_ships;
create trigger baron2_lotto_ship after update on baron2_ships for each row execute function _baron2_lotto_from_ship();

create or replace function public._baron2_lotto_from_cara() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lost > old.lost then perform _baron2_lotto_feed((new.lost - old.lost) * new.unit * 0.30); end if;
  return new;
end $$;
drop trigger if exists baron2_lotto_cara on baron2_cara_lots;
create trigger baron2_lotto_cara after update on baron2_cara_lots for each row execute function _baron2_lotto_from_cara();

create or replace function public._baron2_lotto_from_credit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product in ('charge', 'cad_tax') and new.coins < 0 then perform _baron2_lotto_feed(-new.coins * 0.10); end if;
  return new;
end $$;
drop trigger if exists baron2_lotto_credit on baron2_credits;
create trigger baron2_lotto_credit after insert on baron2_credits for each row execute function _baron2_lotto_from_credit();

revoke all on function public._baron2_lotto_feed(numeric), public._baron2_lotto_from_ship(), public._baron2_lotto_from_cara(), public._baron2_lotto_from_credit() from public, anon, authenticated;
