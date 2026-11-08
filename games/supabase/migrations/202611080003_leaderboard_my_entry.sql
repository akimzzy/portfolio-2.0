CREATE OR REPLACE FUNCTION public.get_leaderboard (requested_game_id text, requested_period text) returns jsonb language plpgsql stable security definer
SET
  search_path = '' AS $$
declare result jsonb;
begin
  if requested_game_id is null or requested_game_id !~ '^[a-z0-9-]{2,40}$'
    or requested_period is null
    or requested_period not in ('all_time', 'week', 'month', 'year') then
    raise exception using errcode = '22023', message = 'invalid_leaderboard_request';
  end if;

  with visible as materialized (
    select snapshot.player_id, snapshot.player_name, snapshot.wins, snapshot.losses,
      snapshot.matches, snapshot.cutoff_date, snapshot.calculated_at
    from public.leaderboard_snapshots as snapshot
    left join public.profiles as profile on snapshot.player_id = 'user:' || profile.user_id::text
    left join public.in_house_players as house on snapshot.player_id = 'house:' || house.player_id
    where snapshot.game_id = requested_game_id
      and snapshot.period = requested_period
      and ((snapshot.player_id like 'house:%' and house.is_active)
        or (snapshot.player_id like 'user:%' and profile.leaderboard_public))
  ), ranked as materialized (
    select visible.*,
      rank() over (order by visible.wins desc)::integer as rank
    from visible
  )
  select jsonb_build_object(
    'cutoff_date', (select max(ranked.cutoff_date) from ranked),
    'calculated_at', (select max(ranked.calculated_at) from ranked),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', top.rank,
        'player_name', top.player_name,
        'wins', top.wins,
        'losses', top.losses,
        'matches', top.matches,
        'win_rate', round(top.wins::numeric / nullif(top.matches, 0), 4)
      ) order by top.rank, lower(top.player_name))
      from (select * from ranked order by rank, lower(player_name) limit 100) as top
    ), '[]'::jsonb),
    'my_entry', (
      select jsonb_build_object(
        'rank', own.rank,
        'player_name', own.player_name,
        'wins', own.wins,
        'losses', own.losses,
        'matches', own.matches,
        'win_rate', round(own.wins::numeric / nullif(own.matches, 0), 4)
      )
      from ranked as own
      where auth.uid() is not null
        and own.player_id = 'user:' || auth.uid()::text
      limit 1
    )
  ) into result;

  return coalesce(result, jsonb_build_object('cutoff_date', null, 'calculated_at', null, 'entries', '[]'::jsonb, 'my_entry', null));
end;
$$;

REVOKE ALL ON function public.get_leaderboard (text, text)
FROM
  public;

GRANT
EXECUTE ON function public.get_leaderboard (text, text) TO anon,
authenticated;

COMMENT ON function public.get_leaderboard (text, text) IS 'Returns the top 100 public leaderboard rows and the authenticated caller’s own public row when ranked.';
