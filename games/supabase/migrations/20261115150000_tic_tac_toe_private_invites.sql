-- Add Tic-tac-toe to private friend invitations. Existing invite rows remain intact.
ALTER TABLE public.private_match_invites
  DROP CONSTRAINT IF EXISTS private_match_invites_game_id_check;

ALTER TABLE public.private_match_invites
  ADD CONSTRAINT private_match_invites_game_id_check
  CHECK (game_id IN ('connect-four', 'reversi', 'tic-tac-toe')) NOT VALID;

ALTER TABLE public.private_match_invites
  VALIDATE CONSTRAINT private_match_invites_game_id_check;

CREATE OR REPLACE FUNCTION public.create_private_match_invites_v2(
  p_match_id text,
  p_game_id text,
  p_series_target integer,
  p_invite_token text,
  p_friendship_ids uuid[],
  p_in_house_friendship_ids uuid[],
  p_sender_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  human_count integer := coalesce(pg_catalog.cardinality(p_friendship_ids), 0);
  house_count integer := coalesce(pg_catalog.cardinality(p_in_house_friendship_ids), 0);
  requested_count integer;
  confirmed_count integer;
  house_player_ids jsonb;
BEGIN
  IF p_sender_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;
  IF p_match_id IS NULL OR p_match_id !~ '^[A-Za-z0-9_-]{22}$'
     OR p_game_id IS NULL OR p_game_id NOT IN ('connect-four', 'reversi', 'tic-tac-toe')
     OR p_series_target IS NULL OR p_series_target NOT BETWEEN 1 AND 3
     OR p_invite_token IS NULL OR p_invite_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'invalid_match_invite';
  END IF;

  requested_count := human_count + house_count;
  IF requested_count < 1 OR requested_count > 10 OR house_count > 1
     OR requested_count <> (
       SELECT pg_catalog.count(DISTINCT selected.friendship_id)::integer
       FROM pg_catalog.unnest(
         coalesce(p_friendship_ids, ARRAY[]::uuid[]) ||
         coalesce(p_in_house_friendship_ids, ARRAY[]::uuid[])
       ) AS selected(friendship_id)
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

  IF human_count > 0 THEN
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

    SELECT pg_catalog.count(*)::integer
      INTO confirmed_count
      FROM public.friendships AS friendship
      JOIN public.private_match_invites AS invite
        ON invite.match_id = p_match_id
       AND invite.recipient_id = CASE
         WHEN friendship.user_low_id = p_sender_id THEN friendship.user_high_id
         ELSE friendship.user_low_id
       END
       AND invite.game_id = p_game_id
       AND invite.series_target = p_series_target
       AND invite.sender_id = p_sender_id
       AND invite.invite_token = p_invite_token
     WHERE friendship.id = ANY(p_friendship_ids)
       AND friendship.status = 'accepted'
       AND (friendship.user_low_id = p_sender_id OR friendship.user_high_id = p_sender_id);

    IF confirmed_count <> human_count THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'friend_invites_unavailable';
    END IF;
  ELSE
    confirmed_count := 0;
  END IF;

  IF house_count > 0 THEN
    SELECT pg_catalog.jsonb_agg(player.player_id)
      INTO house_player_ids
      FROM public.in_house_friendships AS friendship
      JOIN public.in_house_players AS player
        ON player.player_id = friendship.player_id
      WHERE friendship.id = ANY(p_in_house_friendship_ids)
        AND friendship.user_id = p_sender_id
        AND friendship.status = 'pending'
        AND friendship.auto_accept_at <= pg_catalog.now()
        AND player.is_active;

    IF coalesce(pg_catalog.jsonb_array_length(house_player_ids), 0) <> house_count THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'friend_invites_unavailable';
    END IF;
  ELSE
    house_player_ids := '[]'::jsonb;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'invited_count', confirmed_count,
    'in_house_player_ids', house_player_ids
  );
END;
$$;
