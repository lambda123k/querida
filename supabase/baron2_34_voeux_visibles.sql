-- Le Baron : les vœux de ceux qui ont déjà voté au grand choix sont visibles de tous (16 nov. 2026) — EN LIGNE
create or replace function public.baron2_choix_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := baron2_pid(p_token); C baron2_choix;
begin
  perform _baron2_choix_settle();
  select * into C from baron2_choix where id = 1;
  return jsonb_build_object(
    'status', C.status, 'opens_at', C.opens_at, 'drawn_at', C.drawn_at, 'result', C.result,
    'admin', v in ('232590e0-d532-48e0-9239-06fe9ed81c57', 'naim'),
    'mine', (select ranking from baron2_choix_voeux where player_id = v),
    -- les vœux de ceux qui ont voté sont visibles de tous
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
        'voted', w.player_id is not null, 'ranking', w.ranking, 'voted_at', w.at) order by p.created_at)
      from baron2_players p left join baron2_choix_voeux w on w.player_id = p.id), '[]'::jsonb),
    'lieux', coalesce((select jsonb_agg(jsonb_build_object('place', l,
        'owner', (select jsonb_build_object('id', p.id, 'name', p.name) from baron2_players p where p.id = _baron2_lieu_owner(l)),
        'sale', (select jsonb_build_object('price', s.price, 'at', s.at) from baron2_lieu_sales s where s.place = l and s.seller_id = _baron2_lieu_owner(l)))
      order by array_position(_baron2_lieux(), l)) from unnest(_baron2_lieux()) l), '[]'::jsonb),
    'swaps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'from_id', s.from_id, 'from_name', a.name, 'from_place', s.from_place,
        'to_id', s.to_id, 'to_name', b.name, 'to_place', s.to_place, 'at', s.at) order by s.id desc)
      from baron2_lieu_swaps s join baron2_players a on a.id = s.from_id join baron2_players b on b.id = s.to_id
      where s.status = 'attente' and (s.from_id = v or s.to_id = v)), '[]'::jsonb),
    'now', now());
end $$;
