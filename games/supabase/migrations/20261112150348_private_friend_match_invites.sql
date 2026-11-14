CREATE TABLE public.private_match_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL CHECK (match_id ~ '^[A-Za-z0-9_-]{22}$'),
  game_id text NOT NULL CHECK (game_id IN ('connect-four', 'reversi')),
  series_target smallint NOT NULL CHECK (series_target BETWEEN 1 AND 3),
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invite_token text NOT NULL CHECK (invite_token ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  dismissed_at timestamptz,
  CONSTRAINT private_match_invites_distinct_players CHECK (sender_id <> recipient_id),
  CONSTRAINT private_match_invites_per_match UNIQUE (match_id, recipient_id)
);

CREATE INDEX private_match_invites_recipient_pending_idx
  ON public.private_match_invites (recipient_id, created_at DESC)
  WHERE dismissed_at IS NULL;
CREATE INDEX private_match_invites_expiry_idx
  ON public.private_match_invites (expires_at);

ALTER TABLE public.private_match_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_match_invites FROM public, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.private_match_invites TO authenticated;
CREATE POLICY private_match_invites_recipient_select ON public.private_match_invites
  FOR SELECT TO authenticated
  USING (recipient_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.create_private_match_invites(
  p_match_id text,
  p_game_id text,
  p_series_target integer,
  p_invite_token text,
  p_friendship_ids uuid[],
  p_sender_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_count integer;
  inserted_count integer;
BEGIN
  IF p_sender_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;
  IF p_match_id IS NULL OR p_match_id !~ '^[A-Za-z0-9_-]{22}$'
     OR p_game_id IS NULL OR p_game_id NOT IN ('connect-four', 'reversi')
     OR p_series_target IS NULL OR p_series_target NOT BETWEEN 1 AND 3
     OR p_invite_token IS NULL OR p_invite_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'invalid_match_invite';
  END IF;
  requested_count := coalesce(pg_catalog.cardinality(p_friendship_ids), 0);
  IF requested_count < 1 OR requested_count > 10
     OR requested_count <> (
       SELECT pg_catalog.count(DISTINCT selected.friendship_id)::integer
       FROM pg_catalog.unnest(p_friendship_ids) AS selected(friendship_id)
     ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'invalid_invite_recipients';
  END IF;

  DELETE FROM public.private_match_invites
  WHERE id IN (
    SELECT id
    FROM public.private_match_invites
    WHERE expires_at <= pg_catalog.now()
    ORDER BY expires_at
    LIMIT 100
  );

  INSERT INTO public.private_match_invites (
    match_id, game_id, series_target, sender_id, recipient_id, invite_token
  )
  SELECT
    p_match_id,
    p_game_id,
    p_series_target,
    p_sender_id,
    CASE
      WHEN friendship.user_low_id = p_sender_id THEN friendship.user_high_id
      ELSE friendship.user_low_id
    END,
    p_invite_token
  FROM public.friendships AS friendship
  WHERE friendship.id = ANY(p_friendship_ids)
    AND friendship.status = 'accepted'
    AND (friendship.user_low_id = p_sender_id OR friendship.user_high_id = p_sender_id)
  ON CONFLICT (match_id, recipient_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count <> requested_count THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'friend_invites_unavailable';
  END IF;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_private_match_invites()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  invite_rows jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;
  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item.id,
        'match_id', item.match_id,
        'game_id', item.game_id,
        'series_target', item.series_target,
        'invite_token', item.invite_token,
        'sender_username', item.sender_username,
        'created_at', item.created_at,
        'expires_at', item.expires_at
      ) ORDER BY item.created_at DESC
    ), '[]'::jsonb
  ) INTO invite_rows
  FROM (
    SELECT invite.id, invite.match_id, invite.game_id, invite.series_target,
      invite.invite_token, profile.username AS sender_username,
      invite.created_at, invite.expires_at
    FROM public.private_match_invites AS invite
    JOIN public.profiles AS profile ON profile.user_id = invite.sender_id
    WHERE invite.recipient_id = current_user_id
      AND invite.dismissed_at IS NULL
      AND invite.expires_at > pg_catalog.now()
    ORDER BY invite.created_at DESC
    LIMIT 50
  ) AS item;
  RETURN invite_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_private_match_invite(p_invite_id uuid)
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
  UPDATE public.private_match_invites
    SET dismissed_at = pg_catalog.now()
    WHERE id = p_invite_id
      AND recipient_id = current_user_id
      AND dismissed_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_incoming_friend_request_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;
  RETURN (
    SELECT pg_catalog.count(*)::integer
    FROM public.friendships AS friendship
    WHERE friendship.status = 'pending'
      AND friendship.requested_by <> current_user_id
      AND (friendship.user_low_id = current_user_id OR friendship.user_high_id = current_user_id)
  ) + (
    SELECT pg_catalog.count(*)::integer
    FROM public.private_match_invites AS invite
    WHERE invite.recipient_id = current_user_id
      AND invite.dismissed_at IS NULL
      AND invite.expires_at > pg_catalog.now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_private_match_invites(text, text, integer, text, uuid[], uuid) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_private_match_invites() FROM public, anon;
REVOKE ALL ON FUNCTION public.dismiss_private_match_invite(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_incoming_friend_request_count() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_private_match_invites(text, text, integer, text, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_private_match_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_private_match_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incoming_friend_request_count() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'private_match_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.private_match_invites;
  END IF;
END;
$$;
