ALTER TABLE public.game_history
ADD COLUMN record_source text NOT NULL DEFAULT 'verified' CHECK (record_source IN ('verified', 'guest_import'));

COMMENT ON COLUMN public.game_history.record_source IS 'Verified rows are written by the authoritative Worker. Guest imports are user-provided history and must not count toward public rankings.';

CREATE OR REPLACE FUNCTION public.import_guest_history (entries jsonb) returns integer language plpgsql security definer
SET
  search_path = '' AS $$
declare
  current_user_id uuid := auth.uid();
  inserted_count integer;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if entries is null or jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) > 100 then
    raise exception using errcode = '22023', message = 'invalid_guest_history_batch';
  end if;

  insert into public.game_history (
    completion_id, user_id, game_id, rules_version, result, opponent_name,
    wins, losses, series_target, finish_reason, completed_at, record_source
  )
  select
    item.completion_id, current_user_id, item.game_id, item.rules_version,
    item.result, item.opponent_name, item.wins, item.losses, item.series_target,
    item.finish_reason, item.completed_at, 'guest_import'
  from jsonb_to_recordset(entries) as item(
    completion_id text,
    game_id text,
    rules_version integer,
    result text,
    opponent_name text,
    wins smallint,
    losses smallint,
    series_target smallint,
    finish_reason text,
    completed_at timestamptz
  )
  on conflict (completion_id, user_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

REVOKE ALL ON function public.import_guest_history (jsonb)
FROM
  public,
  anon;

GRANT
EXECUTE ON function public.import_guest_history (jsonb) TO authenticated;
