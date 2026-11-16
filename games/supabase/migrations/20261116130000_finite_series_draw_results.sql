-- Preserve existing results while allowing capped series to finish as draws.
ALTER TABLE public.game_history
  ADD CONSTRAINT game_history_result_with_draw_check
  CHECK (result IN ('win', 'loss', 'draw')) NOT VALID;
ALTER TABLE public.game_history
  DROP CONSTRAINT IF EXISTS game_history_result_check;
ALTER TABLE public.game_history
  VALIDATE CONSTRAINT game_history_result_with_draw_check;

ALTER TABLE public.leaderboard_series_results
  ADD CONSTRAINT leaderboard_series_result_with_draw_check
  CHECK (result IN ('win', 'loss', 'draw')) NOT VALID;
ALTER TABLE public.leaderboard_series_results
  DROP CONSTRAINT IF EXISTS leaderboard_series_results_result_check;
ALTER TABLE public.leaderboard_series_results
  VALIDATE CONSTRAINT leaderboard_series_result_with_draw_check;

CREATE OR REPLACE FUNCTION public.record_match_series (result_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_match_id text := result_payload->>'match_id';
  current_game_id text := result_payload->>'game_id';
  current_visibility text := result_payload->>'visibility';
  current_series integer := (result_payload->>'series_number')::integer;
  current_target smallint := (result_payload->>'series_target')::smallint;
  current_completed timestamptz := (result_payload->>'completed_at')::timestamptz;
  current_reason text := result_payload->>'finish_reason';
  current_series_result text := coalesce(result_payload->>'series_result', 'decided');
  current_completion_id text;
  current_ranking_day date;
  pair_ids text[];
  current_pair_key text;
  slot_claimed boolean := false;
  base_eligible boolean := false;
  participant jsonb;
  opponent jsonb;
  participant_id text;
  opponent_id text;
  participant_kind text;
  participant_user_id uuid;
  participant_house_id text;
  player_name text;
  opponent_name text;
  player_result text;
  player_wins smallint;
  player_losses smallint;
  status text;
  row_inserted integer;
  profile_visible boolean;
  stored integer := 0;
  ranked_count integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
  END IF;
  IF jsonb_typeof(result_payload) IS DISTINCT FROM 'object'
    OR current_match_id IS NULL
    OR current_match_id !~ '^[A-Za-z0-9_-]{22}$'
    OR current_game_id IS NULL
    OR current_game_id !~ '^[a-z0-9-]{2,40}$'
    OR current_visibility IS NULL
    OR current_visibility NOT IN ('public', 'invite')
    OR current_series IS NULL OR current_series < 1
    OR current_target IS NULL OR current_target NOT IN (1, 2, 3)
    OR current_completed IS NULL
    OR current_reason IS NULL
    OR current_reason NOT IN ('normal', 'timeout', 'disconnect', 'forfeit')
    OR current_series_result NOT IN ('decided', 'draw')
    OR jsonb_typeof(result_payload->'players') IS DISTINCT FROM 'array'
    OR jsonb_array_length(result_payload->'players') <> 2 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_series_result';
  END IF;

  IF current_series_result = 'draw' AND EXISTS (
    SELECT 1 FROM jsonb_to_recordset(result_payload->'players') AS item(result text)
    WHERE item.result IS DISTINCT FROM 'draw'
  ) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_series_draw';
  ELSIF current_series_result = 'decided' AND (
    (SELECT count(*) FROM jsonb_to_recordset(result_payload->'players') AS item(result text)
      WHERE item.result = 'win') <> 1
    OR
    (SELECT count(*) FROM jsonb_to_recordset(result_payload->'players') AS item(result text)
      WHERE item.result = 'loss') <> 1
  ) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_series_winner';
  END IF;

  current_completion_id := current_match_id || ':' || current_series::text;
  current_ranking_day := (current_completed AT TIME ZONE 'Africa/Lagos')::date;
  SELECT array_agg(item.player_id ORDER BY item.player_id) INTO pair_ids
  FROM jsonb_to_recordset(result_payload->'players') AS item(player_id text);
  IF pair_ids IS NULL OR array_length(pair_ids, 1) <> 2 OR pair_ids[1] = pair_ids[2] THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_series_participants';
  END IF;

  base_eligible := current_series = 1 AND NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(result_payload->'players') AS item(player_id text)
    WHERE item.player_id LIKE 'guest:%'
  );
  current_pair_key := pair_ids[1] || '|' || pair_ids[2];

  IF base_eligible THEN
    INSERT INTO public.leaderboard_pair_daily_slots (game_id, pair_key, ranking_day, completion_id)
    VALUES (current_game_id, current_pair_key, current_ranking_day, current_completion_id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS row_inserted = ROW_COUNT;
    slot_claimed := row_inserted = 1;
  END IF;

  FOR participant IN SELECT value FROM jsonb_array_elements(result_payload->'players')
  LOOP
    SELECT value INTO opponent
    FROM jsonb_array_elements(result_payload->'players') AS other(value)
    WHERE other.value->>'player_id' <> participant->>'player_id'
    LIMIT 1;

    participant_id := participant->>'player_id';
    opponent_id := opponent->>'player_id';
    player_name := participant->>'display_name';
    opponent_name := opponent->>'display_name';
    player_result := participant->>'result';
    player_wins := (participant->>'wins')::smallint;
    player_losses := (participant->>'losses')::smallint;
    IF player_result NOT IN ('win', 'loss', 'draw')
      OR char_length(player_name) NOT BETWEEN 1 AND 24
      OR char_length(opponent_name) NOT BETWEEN 1 AND 24
      OR player_wins < 0 OR player_losses < 0 THEN
      RAISE EXCEPTION USING errcode = '22023', message = 'invalid_series_participant';
    END IF;

    participant_kind := split_part(participant_id, ':', 1);
    participant_user_id := NULL;
    participant_house_id := NULL;
    profile_visible := true;
    IF participant_kind = 'user' THEN
      participant_user_id := split_part(participant_id, ':', 2)::uuid;
      SELECT profile.leaderboard_public INTO profile_visible
      FROM public.profiles AS profile WHERE profile.user_id = participant_user_id;
      IF NOT FOUND THEN RAISE EXCEPTION USING errcode = '22023', message = 'participant_profile_missing'; END IF;
      SELECT profile.username INTO player_name
      FROM public.profiles AS profile WHERE profile.user_id = participant_user_id;
    ELSIF participant_kind = 'house' THEN
      participant_house_id := split_part(participant_id, ':', 2);
      SELECT player.display_name INTO player_name
      FROM public.in_house_players AS player
      WHERE player.player_id = participant_house_id AND player.is_active;
      IF NOT FOUND THEN RAISE EXCEPTION USING errcode = '22023', message = 'in_house_player_missing'; END IF;
    ELSIF participant_kind = 'guest' THEN
      CONTINUE;
    ELSE
      RAISE EXCEPTION USING errcode = '22023', message = 'invalid_participant_id';
    END IF;

    IF current_series > 1 THEN
      status := 'unranked_rematch';
    ELSIF NOT base_eligible THEN
      status := 'unranked_guest';
    ELSIF NOT slot_claimed THEN
      status := 'unranked_pair_cap';
    ELSIF participant_kind = 'user' AND NOT profile_visible THEN
      status := 'unranked_privacy';
    ELSE
      status := 'ranked';
    END IF;

    INSERT INTO public.leaderboard_series_results (
      completion_id, game_id, player_id, opponent_id, player_name, opponent_name,
      result, wins, losses, series_target, finish_reason, visibility, series_number,
      ranking_day, ranking_status, completed_at
    ) VALUES (
      current_completion_id, current_game_id, participant_id, opponent_id, player_name, opponent_name,
      player_result, player_wins, player_losses, current_target, current_reason, current_visibility,
      current_series, current_ranking_day, status, current_completed
    ) ON CONFLICT (completion_id, player_id) DO NOTHING;
    GET DIAGNOSTICS row_inserted = ROW_COUNT;
    IF row_inserted = 1 THEN
      stored := stored + 1;
      IF participant_user_id IS NOT NULL THEN
        INSERT INTO public.game_history (
          completion_id, user_id, game_id, rules_version, result, opponent_name,
          wins, losses, series_target, finish_reason, completed_at, record_source, ranking_status
        ) VALUES (
          current_completion_id, participant_user_id, current_game_id,
          (result_payload->>'rules_version')::integer, player_result, opponent_name,
          player_wins, player_losses, current_target, current_reason, current_completed,
          'verified', status
        ) ON CONFLICT (completion_id, user_id) DO UPDATE
        SET game_id = excluded.game_id,
            rules_version = excluded.rules_version,
            result = excluded.result,
            opponent_name = excluded.opponent_name,
            wins = excluded.wins,
            losses = excluded.losses,
            series_target = excluded.series_target,
            finish_reason = excluded.finish_reason,
            completed_at = excluded.completed_at,
            record_source = 'verified',
            ranking_status = excluded.ranking_status
        WHERE public.game_history.record_source = 'guest_import';
      END IF;

      IF status = 'ranked' THEN
        ranked_count := ranked_count + 1;
        INSERT INTO public.leaderboard_daily_totals (game_id, ranking_day, player_id, wins, losses, matches)
        VALUES (
          current_game_id, current_ranking_day, participant_id,
          CASE WHEN player_result = 'win' THEN 1 ELSE 0 END,
          CASE WHEN player_result = 'loss' THEN 1 ELSE 0 END, 1
        ) ON CONFLICT (game_id, ranking_day, player_id) DO UPDATE
        SET wins = public.leaderboard_daily_totals.wins + excluded.wins,
            losses = public.leaderboard_daily_totals.losses + excluded.losses,
            matches = public.leaderboard_daily_totals.matches + 1;

        INSERT INTO public.leaderboard_all_time_totals (game_id, player_id, wins, losses, matches)
        VALUES (
          current_game_id, participant_id,
          CASE WHEN player_result = 'win' THEN 1 ELSE 0 END,
          CASE WHEN player_result = 'loss' THEN 1 ELSE 0 END, 1
        ) ON CONFLICT (game_id, player_id) DO UPDATE
        SET wins = public.leaderboard_all_time_totals.wins + excluded.wins,
            losses = public.leaderboard_all_time_totals.losses + excluded.losses,
            matches = public.leaderboard_all_time_totals.matches + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.in_house_players
  SET active_match_id = NULL, lease_expires_at = NULL
  WHERE active_match_id = current_match_id;

  RETURN jsonb_build_object(
    'completion_id', current_completion_id,
    'stored_participants', stored,
    'ranked_participants', ranked_count,
    'ranking_status', CASE WHEN current_series > 1 THEN 'unranked_rematch'
      WHEN NOT base_eligible THEN 'unranked_guest'
      WHEN NOT slot_claimed THEN 'unranked_pair_cap'
      ELSE 'ranked' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_match_series (jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_match_series (jsonb) TO service_role;
