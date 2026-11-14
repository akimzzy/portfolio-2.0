-- Read only the authenticated player's shared, completed series with an
-- accepted friend. Board snapshots remain available through the existing
-- participant-scoped game_history_rounds policy.
CREATE OR REPLACE FUNCTION public.get_friend_match_history(
  p_friendship_id uuid,
  p_before_completed_at timestamptz DEFAULT NULL,
  p_before_completion_id text DEFAULT NULL,
  p_page_size integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  friend_user_id uuid;
  page_size integer := greatest(1, least(coalesce(p_page_size, 5), 10));
  history_rows jsonb;
  visible_rows jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;

  IF p_friendship_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'friendship_unavailable';
  END IF;

  IF (p_before_completed_at IS NULL) <> (p_before_completion_id IS NULL) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_history_cursor';
  END IF;

  SELECT CASE
      WHEN friendship.user_low_id = current_user_id THEN friendship.user_high_id
      ELSE friendship.user_low_id
    END
    INTO friend_user_id
    FROM public.friendships AS friendship
    WHERE friendship.id = p_friendship_id
      AND friendship.status = 'accepted'
      AND (friendship.user_low_id = current_user_id OR friendship.user_high_id = current_user_id);
  IF NOT FOUND OR friend_user_id = current_user_id THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'friendship_unavailable';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'completion_id', item.completion_id,
        'game_id', item.game_id,
        'result', item.result,
        'opponent_name', item.opponent_name,
        'wins', item.wins,
        'losses', item.losses,
        'series_target', item.series_target,
        'finish_reason', item.finish_reason,
        'completed_at', item.completed_at,
        'ranking_status', item.ranking_status,
        'replay_available', item.replay_available
      ) ORDER BY item.completed_at DESC, item.completion_id DESC
    ),
    '[]'::jsonb
  ) INTO history_rows
  FROM (
    SELECT
      result.completion_id,
      result.game_id,
      result.result,
      result.opponent_name,
      result.wins,
      result.losses,
      result.series_target,
      result.finish_reason,
      result.completed_at,
      result.ranking_status,
      EXISTS (
        SELECT 1
        FROM public.game_history_rounds AS round_history
        WHERE round_history.completion_id = result.completion_id
          AND round_history.user_id = current_user_id
      ) AS replay_available
    FROM public.leaderboard_series_results AS result
    WHERE result.player_id = 'user:' || current_user_id::text
      AND result.opponent_id = 'user:' || friend_user_id::text
      AND (
        p_before_completed_at IS NULL
        OR (result.completed_at, result.completion_id)
          < (p_before_completed_at, p_before_completion_id)
      )
    ORDER BY result.completed_at DESC, result.completion_id DESC
    LIMIT page_size + 1
  ) AS item;

  SELECT coalesce(pg_catalog.jsonb_agg(item.value ORDER BY item.ordinality), '[]'::jsonb)
    INTO visible_rows
    FROM pg_catalog.jsonb_array_elements(history_rows) WITH ORDINALITY AS item(value, ordinality)
    WHERE item.ordinality <= page_size;

  RETURN pg_catalog.jsonb_build_object(
    'matches', visible_rows,
    'has_more', pg_catalog.jsonb_array_length(history_rows) > page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_match_history(uuid, timestamptz, text, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_match_history(uuid, timestamptz, text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_friend_match_history(uuid, timestamptz, text, integer) IS
  'Returns a paginated history of completed series shared by the caller and an accepted friend; it does not expose either player’s unrelated match history.';
