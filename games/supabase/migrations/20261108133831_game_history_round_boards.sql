CREATE TABLE public.game_history_rounds (
  completion_id text NOT NULL,
  user_id uuid NOT NULL,
  round_number bigint NOT NULL CHECK (round_number > 0),
  game_id text NOT NULL CHECK (game_id ~ '^[a-z0-9-]{2,40}$'),
  rules_version integer NOT NULL CHECK (rules_version > 0),
  player_seat text NOT NULL CHECK (player_seat IN ('first', 'second')),
  winner_seat text CHECK (winner_seat IN ('first', 'second')),
  finish_reason text NOT NULL CHECK (
    finish_reason IN ('normal', 'timeout', 'disconnect', 'forfeit')
  ),
  completed_at timestamptz NOT NULL,
  final_state jsonb NOT NULL CHECK (jsonb_typeof(final_state) = 'object'),
  PRIMARY KEY (completion_id, user_id, round_number),
  FOREIGN KEY (completion_id, user_id)
    REFERENCES public.game_history (completion_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX game_history_rounds_user_series_idx
  ON public.game_history_rounds (user_id, completion_id, round_number);

ALTER TABLE public.game_history_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_history_rounds FROM public, anon, authenticated, service_role;
GRANT SELECT ON public.game_history_rounds TO authenticated;

CREATE POLICY game_history_rounds_select_own
  ON public.game_history_rounds
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.record_match_series_with_rounds (result_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  round_item jsonb;
  history_owner record;
  current_completion_id text;
  current_game_id text := result_payload->>'game_id';
  current_round_number bigint;
  inserted_rows integer := 0;
  stored_rounds integer := 0;
  current_winner text;
  current_finish_reason text;
  current_completed_at timestamptz;
  current_final_state jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
  END IF;

  IF jsonb_typeof(result_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(result_payload->'rounds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_series_round_history';
  END IF;
  FOR round_item IN SELECT value FROM jsonb_array_elements(result_payload->'rounds')
  LOOP
    IF jsonb_typeof(round_item) IS DISTINCT FROM 'object'
      OR coalesce(round_item->>'round_number', '') !~ '^[1-9][0-9]{0,15}$'
      OR (round_item->>'round_number')::numeric > 9007199254740991
      OR round_item->>'game_id' IS DISTINCT FROM current_game_id
      OR coalesce(round_item->>'rules_version', '') !~ '^[1-9][0-9]{0,8}$'
      OR coalesce(round_item->>'winner', '') NOT IN ('', 'first', 'second')
      OR coalesce(round_item->>'finish_reason', '') NOT IN ('normal', 'timeout', 'disconnect', 'forfeit')
      OR jsonb_typeof(round_item->'final_state') IS DISTINCT FROM 'object'
      OR pg_catalog.pg_column_size(round_item->'final_state') > 32768
      OR round_item->>'completed_at' IS NULL
      OR (round_item->>'completed_at')::timestamptz IS NULL THEN
      RAISE EXCEPTION USING errcode = '22023', message = 'invalid_series_round_history';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(result_payload->'rounds') AS item(value)
    GROUP BY (item.value->>'round_number')::numeric
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'duplicate_series_round_number';
  END IF;

  result := public.record_match_series(result_payload);
  current_completion_id := result->>'completion_id';

  FOR history_owner IN
    SELECT history.user_id, item.value->>'seat' AS player_seat
    FROM jsonb_array_elements(result_payload->'players') AS item(value)
    JOIN public.game_history AS history
      ON history.completion_id = current_completion_id
      AND item.value->>'player_id' = 'user:' || history.user_id::text
    WHERE item.value->>'seat' IN ('first', 'second')
  LOOP
    FOR round_item IN SELECT value FROM jsonb_array_elements(result_payload->'rounds')
    LOOP
      current_round_number := (round_item->>'round_number')::bigint;
      current_winner := nullif(round_item->>'winner', '');
      current_finish_reason := round_item->>'finish_reason';
      current_completed_at := (round_item->>'completed_at')::timestamptz;
      current_final_state := round_item->'final_state';

      INSERT INTO public.game_history_rounds (
        completion_id, user_id, round_number, game_id, rules_version,
        player_seat, winner_seat, finish_reason, completed_at, final_state
      ) VALUES (
        current_completion_id,
        history_owner.user_id,
        current_round_number,
        current_game_id,
        (round_item->>'rules_version')::integer,
        history_owner.player_seat,
        current_winner,
        current_finish_reason,
        current_completed_at,
        current_final_state
      ) ON CONFLICT (completion_id, user_id, round_number) DO NOTHING;

      GET DIAGNOSTICS inserted_rows = ROW_COUNT;
      stored_rounds := stored_rounds + inserted_rows;
    END LOOP;
  END LOOP;

  RETURN result || jsonb_build_object('stored_rounds', stored_rounds);
END;
$$;

REVOKE ALL ON FUNCTION public.record_match_series_with_rounds (jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_match_series_with_rounds (jsonb) TO service_role;

COMMENT ON TABLE public.game_history_rounds IS
  'One compact final board snapshot per played round, scoped to each authenticated participant.';
