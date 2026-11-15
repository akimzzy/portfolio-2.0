-- Let signed-in players add stable in-house identities without creating fake
-- Supabase Auth users. Acceptance is time-derived, so no alarm or polling job
-- is needed to complete a request.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE pg_catalog.lower(profile.username) IN (
      'ayo', 'tomi18', 'zara', 'kola42', 'maya', 'nia7', 'deji', 'tobi63', 'chichi', 'kemi29'
    )
  ) THEN
    RAISE EXCEPTION 'An existing account uses an in-house friend handle; resolve the collision before applying this migration.';
  END IF;
END;
$$;

CREATE TABLE public.in_house_friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES public.in_house_players (player_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auto_accept_at timestamptz NOT NULL,
  UNIQUE (user_id, player_id)
);

CREATE INDEX in_house_friendships_user_status_idx
  ON public.in_house_friendships (user_id, status, auto_accept_at);

ALTER TABLE public.in_house_friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.in_house_friendships FROM public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lookup_friend(requested_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  cleaned_username text := btrim(requested_username);
  found_user_id uuid;
  found_username text;
  user_relation public.friendships%ROWTYPE;
  found_player_id text;
  found_player_username text;
  house_relation public.in_house_friendships%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;
  IF cleaned_username IS NULL OR cleaned_username !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'invalid_username';
  END IF;

  SELECT profile.user_id, profile.username
    INTO found_user_id, found_username
    FROM public.profiles AS profile
    WHERE pg_catalog.lower(profile.username) = pg_catalog.lower(cleaned_username)
      AND profile.user_id <> current_user_id;
  IF FOUND THEN
    SELECT * INTO user_relation
      FROM public.friendships AS friendship
      WHERE friendship.user_low_id = LEAST(current_user_id, found_user_id)
        AND friendship.user_high_id = GREATEST(current_user_id, found_user_id);
    RETURN pg_catalog.jsonb_build_object(
      'username', found_username,
      'status', CASE WHEN user_relation.id IS NULL THEN NULL ELSE user_relation.status END,
      'requested_by_you', CASE WHEN user_relation.id IS NULL THEN NULL ELSE user_relation.requested_by = current_user_id END,
      'in_house', false
    );
  END IF;

  -- Public handles are the reserved username without its internal house_ prefix.
  SELECT player.player_id, pg_catalog.substr(player.username, 7)
    INTO found_player_id, found_player_username
    FROM public.in_house_players AS player
    WHERE player.is_active
      AND pg_catalog.lower(pg_catalog.substr(player.username, 7)) = pg_catalog.lower(cleaned_username);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO house_relation
    FROM public.in_house_friendships AS friendship
    WHERE friendship.user_id = current_user_id
      AND friendship.player_id = found_player_id;

  RETURN pg_catalog.jsonb_build_object(
    'username', found_player_username,
    'status', CASE
      WHEN house_relation.id IS NULL OR house_relation.status IN ('cancelled', 'removed') THEN
        CASE WHEN house_relation.id IS NULL THEN NULL ELSE house_relation.status END
      WHEN house_relation.auto_accept_at <= pg_catalog.now() THEN 'accepted'
      ELSE 'pending'
    END,
    'requested_by_you', CASE WHEN house_relation.id IS NULL THEN NULL ELSE true END,
    'in_house', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  friend_rows jsonb;
  incoming_rows jsonb;
  outgoing_rows jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item.id,
        'username', item.username,
        'since', item.created_at,
        'series_played', item.series_played,
        'wins', item.wins,
        'losses', item.losses,
        'in_house', item.in_house
      ) ORDER BY pg_catalog.lower(item.username)
    ), '[]'::jsonb
  ) INTO friend_rows
  FROM (
    SELECT friendship.id, profile.username, friendship.created_at,
      count(result.completion_id)::integer AS series_played,
      (count(result.completion_id) FILTER (WHERE result.result = 'win'))::integer AS wins,
      (count(result.completion_id) FILTER (WHERE result.result = 'loss'))::integer AS losses,
      false AS in_house
    FROM public.friendships AS friendship
    JOIN public.profiles AS profile
      ON profile.user_id = CASE
        WHEN friendship.user_low_id = current_user_id THEN friendship.user_high_id
        ELSE friendship.user_low_id
      END
    LEFT JOIN public.leaderboard_series_results AS result
      ON result.player_id = 'user:' || current_user_id::text
      AND result.opponent_id = 'user:' || profile.user_id::text
    WHERE friendship.status = 'accepted'
      AND (friendship.user_low_id = current_user_id OR friendship.user_high_id = current_user_id)
    GROUP BY friendship.id, profile.user_id, profile.username, friendship.created_at

    UNION ALL

    SELECT friendship.id, pg_catalog.substr(player.username, 7), friendship.auto_accept_at,
      count(result.completion_id)::integer AS series_played,
      (count(result.completion_id) FILTER (WHERE result.result = 'win'))::integer AS wins,
      (count(result.completion_id) FILTER (WHERE result.result = 'loss'))::integer AS losses,
      true AS in_house
    FROM public.in_house_friendships AS friendship
    JOIN public.in_house_players AS player ON player.player_id = friendship.player_id
    LEFT JOIN public.leaderboard_series_results AS result
      ON result.player_id = 'user:' || current_user_id::text
      AND result.opponent_id = 'house:' || player.player_id
    WHERE friendship.user_id = current_user_id
      AND player.is_active
      AND friendship.status = 'pending'
      AND friendship.auto_accept_at <= pg_catalog.now()
    GROUP BY friendship.id, player.username, friendship.auto_accept_at
  ) AS item;

  SELECT coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id, 'username', item.username, 'requested_at', item.updated_at
    ) ORDER BY item.updated_at DESC), '[]'::jsonb
  ) INTO incoming_rows
  FROM (
    SELECT friendship.id, profile.username, friendship.updated_at
    FROM public.friendships AS friendship
    JOIN public.profiles AS profile ON profile.user_id = friendship.requested_by
    WHERE friendship.status = 'pending'
      AND friendship.requested_by <> current_user_id
      AND (friendship.user_low_id = current_user_id OR friendship.user_high_id = current_user_id)
    ORDER BY friendship.updated_at DESC
    LIMIT 50
  ) AS item;

  SELECT coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id,
      'username', item.username,
      'requested_at', item.updated_at,
      'auto_accept_at', item.auto_accept_at,
      'auto_accept_in_ms', item.auto_accept_in_ms
    ) ORDER BY item.updated_at DESC), '[]'::jsonb
  ) INTO outgoing_rows
  FROM (
    SELECT requests.id, requests.username, requests.updated_at,
      requests.auto_accept_at, requests.auto_accept_in_ms
    FROM (
      SELECT friendship.id, profile.username, friendship.updated_at,
        NULL::timestamptz AS auto_accept_at, NULL::integer AS auto_accept_in_ms
      FROM public.friendships AS friendship
      JOIN public.profiles AS profile
        ON profile.user_id = CASE
          WHEN friendship.user_low_id = current_user_id THEN friendship.user_high_id
          ELSE friendship.user_low_id
        END
      WHERE friendship.status = 'pending' AND friendship.requested_by = current_user_id

      UNION ALL

      SELECT friendship.id, pg_catalog.substr(player.username, 7), friendship.updated_at,
        friendship.auto_accept_at,
        greatest(
          0,
          floor(extract(epoch FROM (friendship.auto_accept_at - pg_catalog.now())) * 1000)::integer
        ) AS auto_accept_in_ms
      FROM public.in_house_friendships AS friendship
      JOIN public.in_house_players AS player ON player.player_id = friendship.player_id
      WHERE friendship.status = 'pending'
        AND friendship.user_id = current_user_id
        AND friendship.auto_accept_at > pg_catalog.now()
    ) AS requests
    ORDER BY requests.updated_at DESC
    LIMIT 50
  ) AS item;

  RETURN pg_catalog.jsonb_build_object(
    'friends', friend_rows,
    'incoming', incoming_rows,
    'outgoing', outgoing_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.send_friend_request(requested_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_user_id uuid;
  target_player_id text;
  cleaned_username text := btrim(requested_username);
  request_row public.friendships%ROWTYPE;
  house_request public.in_house_friendships%ROWTYPE;
  next_accept_at timestamptz;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;
  IF cleaned_username IS NULL OR cleaned_username !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'invalid_username';
  END IF;

  SELECT profile.user_id INTO target_user_id
    FROM public.profiles AS profile
    WHERE pg_catalog.lower(profile.username) = pg_catalog.lower(cleaned_username)
      AND profile.user_id <> current_user_id;
  IF FOUND THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('friendship:' || LEAST(current_user_id, target_user_id)::text || ':' || GREATEST(current_user_id, target_user_id)::text, 0)
    );
    SELECT * INTO request_row FROM public.friendships AS friendship
      WHERE friendship.user_low_id = LEAST(current_user_id, target_user_id)
        AND friendship.user_high_id = GREATEST(current_user_id, target_user_id)
      FOR UPDATE;
    IF FOUND THEN
      IF request_row.status = 'accepted' THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'already_friends';
      ELSIF request_row.status = 'pending' AND request_row.requested_by = current_user_id THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'request_already_sent';
      ELSIF request_row.status = 'pending' THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'incoming_request_exists';
      END IF;
    END IF;

    IF request_row.id IS NULL THEN
      INSERT INTO public.friendships (user_low_id, user_high_id, requested_by)
      VALUES (
        LEAST(current_user_id, target_user_id),
        GREATEST(current_user_id, target_user_id),
        current_user_id
      ) RETURNING * INTO request_row;
    ELSE
      UPDATE public.friendships
        SET requested_by = current_user_id, status = 'pending',
          created_at = pg_catalog.now(), updated_at = pg_catalog.now()
        WHERE id = request_row.id
        RETURNING * INTO request_row;
    END IF;
    RETURN pg_catalog.jsonb_build_object('id', request_row.id, 'status', request_row.status);
  END IF;

  SELECT player.player_id INTO target_player_id
    FROM public.in_house_players AS player
    WHERE player.is_active
      AND pg_catalog.lower(pg_catalog.substr(player.username, 7)) = pg_catalog.lower(cleaned_username);
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'player_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('house-friendship:' || current_user_id::text || ':' || target_player_id, 0)
  );
  SELECT * INTO house_request FROM public.in_house_friendships AS friendship
    WHERE friendship.user_id = current_user_id AND friendship.player_id = target_player_id
    FOR UPDATE;

  IF FOUND THEN
    IF house_request.status = 'pending' THEN
      IF house_request.auto_accept_at > pg_catalog.now() THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'request_already_sent';
      END IF;
      RAISE EXCEPTION USING errcode = 'P0001', message = 'already_friends';
    END IF;
  END IF;

  next_accept_at := pg_catalog.now() + interval '30 seconds' + random() * interval '90 seconds';
  IF house_request.id IS NULL THEN
    INSERT INTO public.in_house_friendships (user_id, player_id, auto_accept_at)
      VALUES (current_user_id, target_player_id, next_accept_at)
      RETURNING * INTO house_request;
  ELSE
    UPDATE public.in_house_friendships
      SET status = 'pending', created_at = pg_catalog.now(), updated_at = pg_catalog.now(),
        auto_accept_at = next_accept_at
      WHERE id = house_request.id
      RETURNING * INTO house_request;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', house_request.id,
    'status', house_request.status,
    'auto_accept_at', house_request.auto_accept_at,
    'auto_accept_in_ms', greatest(
      0,
      floor(extract(epoch FROM (house_request.auto_accept_at - pg_catalog.now())) * 1000)::integer
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_friend_request(request_id uuid, response text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  request_row public.friendships%ROWTYPE;
  house_request public.in_house_friendships%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;
  IF response IS NULL OR response NOT IN ('accept', 'decline', 'cancel') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'invalid_friend_request_action';
  END IF;

  SELECT * INTO request_row FROM public.friendships AS friendship
    WHERE friendship.id = request_id
      AND (friendship.user_low_id = current_user_id OR friendship.user_high_id = current_user_id)
    FOR UPDATE;
  IF FOUND THEN
    IF request_row.status <> 'pending' THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'friend_request_unavailable';
    END IF;
    IF (response IN ('accept', 'decline') AND request_row.requested_by = current_user_id)
      OR (response = 'cancel' AND request_row.requested_by <> current_user_id) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'not_allowed';
    END IF;
    UPDATE public.friendships
      SET status = CASE response WHEN 'accept' THEN 'accepted' WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,
        updated_at = pg_catalog.now()
      WHERE id = request_row.id;
    RETURN true;
  END IF;

  SELECT * INTO house_request FROM public.in_house_friendships AS friendship
    WHERE friendship.id = request_id AND friendship.user_id = current_user_id
    FOR UPDATE;
  IF NOT FOUND OR response <> 'cancel' OR house_request.status <> 'pending'
    OR house_request.auto_accept_at <= pg_catalog.now() THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'friend_request_unavailable';
  END IF;
  UPDATE public.in_house_friendships SET status = 'cancelled', updated_at = pg_catalog.now()
    WHERE id = house_request.id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(friendship_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;

  UPDATE public.friendships AS friendship
    SET status = 'removed', updated_at = pg_catalog.now()
    WHERE friendship.id = friendship_id
      AND friendship.status = 'accepted'
      AND (friendship.user_low_id = current_user_id OR friendship.user_high_id = current_user_id);
  IF FOUND THEN RETURN true; END IF;

  UPDATE public.in_house_friendships AS friendship
    SET status = 'removed', updated_at = pg_catalog.now()
    WHERE friendship.id = friendship_id
      AND friendship.user_id = current_user_id
      AND friendship.status = 'pending'
      AND friendship.auto_accept_at <= pg_catalog.now();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'friendship_unavailable';
  END IF;
  RETURN true;
END;
$$;

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
  friend_player_id text;
  friend_participant_id text;
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

  IF FOUND THEN
    friend_participant_id := 'user:' || friend_user_id::text;
  ELSE
    SELECT friendship.player_id
      INTO friend_player_id
      FROM public.in_house_friendships AS friendship
      WHERE friendship.id = p_friendship_id
        AND friendship.user_id = current_user_id
        AND friendship.status = 'pending'
        AND friendship.auto_accept_at <= pg_catalog.now();
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'friendship_unavailable';
    END IF;
    friend_participant_id := 'house:' || friend_player_id;
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'completion_id', item.completion_id, 'game_id', item.game_id,
        'result', item.result, 'opponent_name', item.opponent_name,
        'wins', item.wins, 'losses', item.losses, 'series_target', item.series_target,
        'finish_reason', item.finish_reason, 'completed_at', item.completed_at,
        'ranking_status', item.ranking_status, 'replay_available', item.replay_available
      ) ORDER BY item.completed_at DESC, item.completion_id DESC
    ), '[]'::jsonb
  ) INTO history_rows
  FROM (
    SELECT result.completion_id, result.game_id, result.result, result.opponent_name,
      result.wins, result.losses, result.series_target, result.finish_reason,
      result.completed_at, result.ranking_status,
      EXISTS (
        SELECT 1 FROM public.game_history_rounds AS round_history
        WHERE round_history.completion_id = result.completion_id
          AND round_history.user_id = current_user_id
      ) AS replay_available
    FROM public.leaderboard_series_results AS result
    WHERE result.player_id = 'user:' || current_user_id::text
      AND result.opponent_id = friend_participant_id
      AND (
        p_before_completed_at IS NULL
        OR (result.completed_at, result.completion_id) < (p_before_completed_at, p_before_completion_id)
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

COMMENT ON TABLE public.in_house_friendships IS
  'User-to-house friendships; the house identity is a server-managed leaderboard player, not an Auth account.';

REVOKE ALL ON FUNCTION public.lookup_friend(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_friends() FROM public, anon;
REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_friend_match_history(uuid, timestamptz, text, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_friend(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_match_history(uuid, timestamptz, text, integer)
  TO authenticated;
