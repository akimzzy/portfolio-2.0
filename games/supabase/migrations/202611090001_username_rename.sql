ALTER TABLE public.profiles
ADD COLUMN username_changed_at timestamptz;

CREATE TABLE public.username_reservations (
  username_key text PRIMARY KEY,
  username text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reserved_until timestamptz NOT NULL,
  CONSTRAINT username_reservations_key_matches_username
    CHECK (username_key = lower(username)),
  CONSTRAINT username_reservations_username_format
    CHECK (username ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$')
);

ALTER TABLE public.username_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.username_reservations FROM public, anon, authenticated;
CREATE INDEX username_reservations_expiry_idx
  ON public.username_reservations (reserved_until);

CREATE OR REPLACE FUNCTION public.claim_username(requested_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  cleaned_username text := btrim(requested_username);
  existing_username text;
  reservation_owner uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;

  SELECT profile.username
    INTO existing_username
    FROM public.profiles AS profile
    WHERE profile.user_id = current_user_id;
  IF FOUND THEN
    RETURN existing_username;
  END IF;

  IF cleaned_username IS NULL OR cleaned_username !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'invalid_username';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.lower(cleaned_username), 0)
  );

  DELETE FROM public.username_reservations AS reservation
    WHERE reservation.reserved_until <= pg_catalog.now();

  IF pg_catalog.lower(cleaned_username) = ANY (
    ARRAY['admin', 'administrator', 'moderator', 'support', 'system', 'root', 'help']
  ) OR EXISTS (
    SELECT 1
      FROM public.in_house_players AS player
      WHERE pg_catalog.lower(player.username) = pg_catalog.lower(cleaned_username)
        OR pg_catalog.lower(player.username) = 'house_' || pg_catalog.lower(cleaned_username)
        OR pg_catalog.lower(player.player_id) = pg_catalog.lower(cleaned_username)
        OR pg_catalog.lower(pg_catalog.regexp_replace(player.display_name, '^[0-9]+[[:space:]]*', ''))
          = pg_catalog.lower(cleaned_username)
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'reserved_username';
  END IF;

  DELETE FROM public.username_reservations AS reservation
    WHERE reservation.username_key = pg_catalog.lower(cleaned_username)
      AND reservation.reserved_until <= pg_catalog.now();

  SELECT reservation.owner_user_id
    INTO reservation_owner
    FROM public.username_reservations AS reservation
    WHERE reservation.username_key = pg_catalog.lower(cleaned_username)
      AND reservation.reserved_until > pg_catalog.now()
    FOR UPDATE;
  IF FOUND THEN
    IF reservation_owner <> current_user_id THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'reserved_username';
    END IF;
    DELETE FROM public.username_reservations AS reservation
      WHERE reservation.username_key = pg_catalog.lower(cleaned_username);
  END IF;

  INSERT INTO public.profiles (user_id, username)
    VALUES (current_user_id, cleaned_username)
    RETURNING username INTO existing_username;

  RETURN existing_username;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'username_taken';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_username(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.change_username(requested_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  cleaned_username text := btrim(requested_username);
  observed_username text;
  current_username text;
  last_changed_at timestamptz;
  next_change_at timestamptz;
  reservation_owner uuid;
  now_at timestamptz := pg_catalog.now();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;
  IF cleaned_username IS NULL OR cleaned_username !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'invalid_username';
  END IF;

  SELECT profile.username
    INTO observed_username
    FROM public.profiles AS profile
    WHERE profile.user_id = current_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'profile_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key, 0))
    FROM (
      SELECT DISTINCT candidate AS lock_key
        FROM pg_catalog.unnest(ARRAY[
          pg_catalog.lower(observed_username),
          pg_catalog.lower(cleaned_username)
        ]) AS names(candidate)
        ORDER BY candidate
    ) AS lock_keys;

  SELECT profile.username, profile.username_changed_at
    INTO current_username, last_changed_at
    FROM public.profiles AS profile
    WHERE profile.user_id = current_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'profile_not_found';
  END IF;
  IF current_username <> observed_username THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'username_changed_concurrently';
  END IF;
  DELETE FROM public.username_reservations AS reservation
    WHERE reservation.reserved_until <= now_at;
  IF pg_catalog.lower(current_username) = pg_catalog.lower(cleaned_username) THEN
    RETURN pg_catalog.jsonb_build_object(
      'username', current_username,
      'username_changed_at', last_changed_at,
      'next_change_at', CASE
        WHEN last_changed_at IS NULL THEN NULL
        ELSE last_changed_at + INTERVAL '30 days'
      END
    );
  END IF;
  IF last_changed_at IS NOT NULL AND now_at < last_changed_at + INTERVAL '30 days' THEN
    next_change_at := last_changed_at + INTERVAL '30 days';
    RAISE EXCEPTION USING
      errcode = 'P0001',
      message = 'username_change_cooldown',
      detail = 'next_change_at=' || pg_catalog.to_char(
        next_change_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      );
  END IF;

  IF pg_catalog.lower(cleaned_username) = ANY (
    ARRAY['admin', 'administrator', 'moderator', 'support', 'system', 'root', 'help']
  ) OR EXISTS (
    SELECT 1
      FROM public.in_house_players AS player
      WHERE pg_catalog.lower(player.username) = pg_catalog.lower(cleaned_username)
        OR pg_catalog.lower(player.username) = 'house_' || pg_catalog.lower(cleaned_username)
        OR pg_catalog.lower(player.player_id) = pg_catalog.lower(cleaned_username)
        OR pg_catalog.lower(pg_catalog.regexp_replace(player.display_name, '^[0-9]+[[:space:]]*', ''))
          = pg_catalog.lower(cleaned_username)
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'reserved_username';
  END IF;

  DELETE FROM public.username_reservations AS reservation
    WHERE reservation.username_key = pg_catalog.lower(cleaned_username)
      AND reservation.reserved_until <= now_at;
  SELECT reservation.owner_user_id
    INTO reservation_owner
    FROM public.username_reservations AS reservation
    WHERE reservation.username_key = pg_catalog.lower(cleaned_username)
      AND reservation.reserved_until > now_at
    FOR UPDATE;
  IF FOUND THEN
    IF reservation_owner <> current_user_id THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'reserved_username';
    END IF;
    DELETE FROM public.username_reservations AS reservation
      WHERE reservation.username_key = pg_catalog.lower(cleaned_username);
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profiles AS profile
      WHERE profile.user_id <> current_user_id
        AND pg_catalog.lower(profile.username) = pg_catalog.lower(cleaned_username)
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'username_taken';
  END IF;

  UPDATE public.profiles AS profile
    SET username = cleaned_username, username_changed_at = now_at
    WHERE profile.user_id = current_user_id;
  next_change_at := now_at + INTERVAL '30 days';

  INSERT INTO public.username_reservations AS existing_reservation (
    username_key, username, owner_user_id, reserved_until
  ) VALUES (
    pg_catalog.lower(current_username), current_username, current_user_id, next_change_at
  )
  ON CONFLICT (username_key) DO UPDATE
    SET username = EXCLUDED.username,
        owner_user_id = EXCLUDED.owner_user_id,
        reserved_until = EXCLUDED.reserved_until
    WHERE existing_reservation.owner_user_id = current_user_id
       OR existing_reservation.reserved_until <= now_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'username_reservation_conflict';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'username', cleaned_username,
    'username_changed_at', now_at,
    'next_change_at', next_change_at
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'username_taken';
END;
$$;

REVOKE ALL ON FUNCTION public.change_username(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leaderboard(requested_game_id text, requested_period text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF requested_game_id IS NULL OR requested_game_id !~ '^[a-z0-9-]{2,40}$'
    OR requested_period IS NULL
    OR requested_period NOT IN ('all_time', 'week', 'month', 'year') THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_leaderboard_request';
  END IF;

  WITH visible AS MATERIALIZED (
    SELECT
      snapshot.player_id,
      CASE
        WHEN snapshot.player_id LIKE 'house:%' THEN house.display_name
        ELSE COALESCE(profile.username, snapshot.player_name)
      END AS player_name,
      snapshot.wins,
      snapshot.losses,
      snapshot.matches,
      snapshot.cutoff_date,
      snapshot.calculated_at
    FROM public.leaderboard_snapshots AS snapshot
    LEFT JOIN public.profiles AS profile
      ON snapshot.player_id = 'user:' || profile.user_id::text
    LEFT JOIN public.in_house_players AS house
      ON snapshot.player_id = 'house:' || house.player_id
    WHERE snapshot.game_id = requested_game_id
      AND snapshot.period = requested_period
      AND ((snapshot.player_id LIKE 'house:%' AND house.is_active)
        OR (snapshot.player_id LIKE 'user:%' AND profile.leaderboard_public))
  ), ranked AS MATERIALIZED (
    SELECT visible.*, rank() OVER (ORDER BY visible.wins DESC)::integer AS rank
    FROM visible
  )
  SELECT pg_catalog.jsonb_build_object(
    'cutoff_date', (SELECT max(ranked.cutoff_date) FROM ranked),
    'calculated_at', (SELECT max(ranked.calculated_at) FROM ranked),
    'entries', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rank', top.rank,
        'player_name', top.player_name,
        'wins', top.wins,
        'losses', top.losses,
        'matches', top.matches,
        'win_rate', round(top.wins::numeric / NULLIF(top.matches, 0), 4)
      ) ORDER BY top.rank, pg_catalog.lower(top.player_name))
      FROM (SELECT * FROM ranked ORDER BY rank, pg_catalog.lower(player_name) LIMIT 100) AS top
    ), '[]'::jsonb),
    'my_entry', (
      SELECT pg_catalog.jsonb_build_object(
        'rank', own.rank,
        'player_name', own.player_name,
        'wins', own.wins,
        'losses', own.losses,
        'matches', own.matches,
        'win_rate', round(own.wins::numeric / NULLIF(own.matches, 0), 4)
      )
      FROM ranked AS own
      WHERE auth.uid() IS NOT NULL
        AND own.player_id = 'user:' || auth.uid()::text
      LIMIT 1
    )
  ) INTO result;

  RETURN COALESCE(
    result,
    pg_catalog.jsonb_build_object('cutoff_date', NULL, 'calculated_at', NULL, 'entries', '[]'::jsonb, 'my_entry', NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.change_username(text) IS
  'Changes an authenticated profile username once per 30 days and reserves the previous username for the same account during that period.';
