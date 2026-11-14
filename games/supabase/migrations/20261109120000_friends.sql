CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled', 'removed')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_canonical_pair CHECK (user_low_id < user_high_id),
  CONSTRAINT friendships_requester_in_pair CHECK (
    requested_by = user_low_id OR requested_by = user_high_id
  ),
  UNIQUE (user_low_id, user_high_id)
);

CREATE INDEX friendships_low_status_idx ON public.friendships (user_low_id, status, updated_at DESC);
CREATE INDEX friendships_high_status_idx ON public.friendships (user_high_id, status, updated_at DESC);
CREATE INDEX friendships_requester_pending_idx ON public.friendships (requested_by, status)
WHERE status = 'pending';

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.friendships FROM public, anon, authenticated, service_role;

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
  relation public.friendships%ROWTYPE;
  low_id uuid;
  high_id uuid;
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
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  low_id := LEAST(current_user_id, found_user_id);
  high_id := GREATEST(current_user_id, found_user_id);
  SELECT * INTO relation
    FROM public.friendships AS friendship
    WHERE friendship.user_low_id = low_id AND friendship.user_high_id = high_id;

  RETURN pg_catalog.jsonb_build_object(
    'username', found_username,
    'status', CASE WHEN relation.id IS NULL THEN NULL ELSE relation.status END,
    'requested_by_you', CASE WHEN relation.id IS NULL THEN NULL ELSE relation.requested_by = current_user_id END
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
        'losses', item.losses
      ) ORDER BY pg_catalog.lower(item.username)
    ), '[]'::jsonb
  ) INTO friend_rows
  FROM (
    SELECT friendship.id, profile.username, friendship.created_at,
      count(result.completion_id)::integer AS series_played,
      (count(result.completion_id) FILTER (WHERE result.result = 'win'))::integer AS wins,
      (count(result.completion_id) FILTER (WHERE result.result = 'loss'))::integer AS losses
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
      'id', item.id, 'username', item.username, 'requested_at', item.updated_at
    ) ORDER BY item.updated_at DESC), '[]'::jsonb
  ) INTO outgoing_rows
  FROM (
    SELECT friendship.id, profile.username, friendship.updated_at
    FROM public.friendships AS friendship
    JOIN public.profiles AS profile
      ON profile.user_id = CASE
        WHEN friendship.user_low_id = current_user_id THEN friendship.user_high_id
        ELSE friendship.user_low_id
      END
    WHERE friendship.status = 'pending' AND friendship.requested_by = current_user_id
    ORDER BY friendship.updated_at DESC
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
  cleaned_username text := btrim(requested_username);
  low_id uuid;
  high_id uuid;
  request_row public.friendships%ROWTYPE;
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
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'player_not_found';
  END IF;

  low_id := LEAST(current_user_id, target_user_id);
  high_id := GREATEST(current_user_id, target_user_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('friendship:' || low_id::text || ':' || high_id::text, 0)
  );

  SELECT * INTO request_row FROM public.friendships AS friendship
    WHERE friendship.user_low_id = low_id AND friendship.user_high_id = high_id
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
    VALUES (low_id, high_id, current_user_id)
    RETURNING * INTO request_row;
  ELSE
    UPDATE public.friendships AS friendship
      SET requested_by = current_user_id,
        status = 'pending',
        created_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
      WHERE friendship.id = request_row.id
      RETURNING * INTO request_row;
  END IF;

  RETURN pg_catalog.jsonb_build_object('id', request_row.id, 'status', request_row.status);
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
  IF NOT FOUND OR request_row.status <> 'pending' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'friend_request_unavailable';
  END IF;
  IF (response IN ('accept', 'decline') AND request_row.requested_by = current_user_id)
    OR (response = 'cancel' AND request_row.requested_by <> current_user_id) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_allowed';
  END IF;

  IF response = 'accept' THEN
    UPDATE public.friendships SET status = 'accepted', updated_at = pg_catalog.now()
      WHERE id = request_row.id;
  ELSIF response = 'decline' THEN
    UPDATE public.friendships SET status = 'declined', updated_at = pg_catalog.now()
      WHERE id = request_row.id;
  ELSE
    UPDATE public.friendships SET status = 'cancelled', updated_at = pg_catalog.now()
      WHERE id = request_row.id;
  END IF;
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
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'friendship_unavailable';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_friend(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_friends() FROM public, anon;
REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lookup_friend(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
