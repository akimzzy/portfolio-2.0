CREATE OR REPLACE FUNCTION public.get_my_leaderboard_ranks () returns jsonb language sql stable security definer
SET
  search_path = '' AS $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('game_id', snapshot.game_id, 'rank', snapshot.rank)
      order by snapshot.game_id
    ),
    '[]'::jsonb
  )
  from public.leaderboard_snapshots as snapshot
  join public.profiles as profile
    on snapshot.player_id = 'user:' || profile.user_id::text
  where auth.uid() is not null
    and profile.user_id = auth.uid()
    and profile.leaderboard_public
    and snapshot.period = 'all_time';
$$;

REVOKE ALL ON function public.get_my_leaderboard_ranks ()
FROM
  public,
  anon;

GRANT
EXECUTE ON function public.get_my_leaderboard_ranks () TO authenticated;

COMMENT ON function public.get_my_leaderboard_ranks () IS 'Returns the authenticated player’s public all-time rank per game from the latest published leaderboard snapshots.';
