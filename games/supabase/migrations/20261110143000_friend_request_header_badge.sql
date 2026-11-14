-- Keep the header's incoming-request badge current without polling or loading
-- the full friends-and-match-statistics response.
CREATE OR REPLACE FUNCTION public.get_incoming_friend_request_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  request_count integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'not_authenticated';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO request_count
    FROM public.friendships AS friendship
    WHERE friendship.status = 'pending'
      AND friendship.requested_by <> current_user_id
      AND (friendship.user_low_id = current_user_id OR friendship.user_high_id = current_user_id);

  RETURN request_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_incoming_friend_request_count() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_incoming_friend_request_count() TO authenticated;

-- Postgres Changes needs a narrowly scoped SELECT policy for authenticated
-- subscribers. Direct writes remain revoked; changes still go through RPCs.
GRANT SELECT ON TABLE public.friendships TO authenticated;
CREATE POLICY friendships_participant_select ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = user_low_id OR auth.uid() = user_high_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'friendships'
    ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships';
  END IF;
END;
$$;
