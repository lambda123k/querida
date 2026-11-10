-- =====================================================================
-- Le Baron — La Grande Réforme (10 nov. 2026)
-- 1) Garde-fou : une fois la réforme appliquée, un téléphone resté sur l'ancienne version
--    ne peut plus écraser la sauvegarde avec l'ancienne ferme.
-- 2) Réforme : chaque ferme repart de zéro (côté appli, au prochain chargement), chacun garde sa
--    spécialité et reçoit en pièces une part de son ancienne fortune :
--    jusqu'à 200 000 on garde tout ; au-delà, 200 000 × √(fortune / 200 000).
--    + son bois (3 000 au plus, 200 au moins) et la médaille de Pionnier.
-- =====================================================================
create or replace function public._baron2_put(p_pid text, p_state jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare old jsonb;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 200000 then
    raise exception 'état invalide';
  end if;
  select state into old from baron2_saves where player_id = p_pid;
  if old is not null and (old ? 'reform' or old ? 'reform_todo') and not (p_state ? 'reform' or p_state ? 'reform_todo') then
    raise exception 'ancienne version : recharge Querida';
  end if;
  insert into baron2_saves(player_id, state, saved_at) values (p_pid, p_state, now())
  on conflict (player_id) do update set state = excluded.state, saved_at = now();
end $$;

with f as (
  select s.player_id,
         greatest(coalesce((p.stats->>'fortune')::numeric, 0), 0) as fortune,
         least(greatest(coalesce((s.state->'stock'->>'bois')::numeric, 0), 200), 3000) as wood,
         rank() over (order by coalesce((p.stats->>'fortune')::numeric, 0) desc) as rk
  from baron2_saves s join baron2_players p on p.id = s.player_id
  where not (s.state ? 'reform' or s.state ? 'reform_todo')
), r as (
  select player_id, fortune, wood, rk,
         floor(case when fortune <= 200000 then fortune else 200000 * sqrt(fortune / 200000) end) as coins
  from f
), up as (
  update baron2_saves s set state = s.state || jsonb_build_object('reform_todo', true,
      'reform', jsonb_build_object('v', 1, 'from', r.fortune, 'coins', r.coins, 'wood', r.wood, 'rank', r.rk,
                                   'at', (extract(epoch from now()) * 1000)::bigint)), saved_at = now()
  from r where r.player_id = s.player_id
  returning s.player_id, r.coins
)
update baron2_players p set stats = p.stats || jsonb_build_object('fortune', up.coins, 'prod', 0, 'parcels', 1, 'pio', 1,
                                   'farms', jsonb_build_array(p.specialty)), updated_at = now()
from up where up.player_id = p.id;
