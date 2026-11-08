DO $$
begin
  if exists (
    select 1 from public.profiles as profile
    where lower(profile.username) in (
      'ayo', 'house_ayo', 'tomi', 'tomi18', 'house_tomi', 'house_tomi18', 'zara', 'house_zara',
      'kola', 'kola42', 'house_kola', 'house_kola42', 'maya', 'house_maya', 'nia', 'nia7', 'house_nia', 'house_nia7',
      'deji', 'house_deji', 'tobi', 'tobi63', 'house_tobi', 'house_tobi63', 'chichi', 'house_chichi',
      'kemi', 'kemi29', 'house_kemi', 'house_kemi29'
    )
  ) then
    raise exception 'An existing account uses a protected in-house username; resolve the collision before applying this migration.';
  end if;
end;
$$;

ALTER TABLE public.profiles
ADD COLUMN leaderboard_public boolean NOT NULL DEFAULT TRUE;

ALTER TABLE public.game_history
ADD COLUMN ranking_status text NOT NULL DEFAULT 'unranked_legacy' CHECK (
  ranking_status IN (
    'ranked',
    'unranked_legacy',
    'unranked_guest',
    'unranked_rematch',
    'unranked_pair_cap',
    'unranked_privacy'
  )
);

CREATE TABLE public.in_house_players (
  player_id text PRIMARY KEY CHECK (player_id ~ '^house_[a-z0-9_]{2,24}$'),
  username text NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'),
  display_name text NOT NULL UNIQUE CHECK (char_length(display_name) BETWEEN 1 AND 24),
  active_match_id text UNIQUE CHECK (
    active_match_id IS NULL
    OR active_match_id ~ '^[A-Za-z0-9_-]{22}$'
  ),
  lease_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (active_match_id IS NULL) = (lease_expires_at IS NULL)
  )
);

-- The numeric prefixes are fixed per identity, not regenerated on each visit.
INSERT INTO
  public.in_house_players (player_id, username, display_name)
VALUES
  ('house_ayo', 'house_ayo', 'Ayo'),
  ('house_tomi', 'house_tomi18', '18 Tomi'),
  ('house_zara', 'house_zara', 'Zara'),
  ('house_kola', 'house_kola42', '42 Kola'),
  ('house_maya', 'house_maya', 'Maya'),
  ('house_nia', 'house_nia7', '7 Nia'),
  ('house_deji', 'house_deji', 'Deji'),
  ('house_tobi', 'house_tobi63', '63 Tobi'),
  ('house_chichi', 'house_chichi', 'Chichi'),
  ('house_kemi', 'house_kemi29', '29 Kemi');

CREATE TABLE public.leaderboard_pair_daily_slots (
  game_id text NOT NULL CHECK (game_id ~ '^[a-z0-9-]{2,40}$'),
  pair_key text NOT NULL CHECK (char_length(pair_key) <= 100),
  ranking_day date NOT NULL,
  completion_id text NOT NULL CHECK (completion_id ~ '^[A-Za-z0-9_-]{22}:[1-9][0-9]*$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, pair_key, ranking_day),
  UNIQUE (completion_id)
);

CREATE TABLE public.leaderboard_series_results (
  completion_id text NOT NULL CHECK (completion_id ~ '^[A-Za-z0-9_-]{22}:[1-9][0-9]*$'),
  game_id text NOT NULL CHECK (game_id ~ '^[a-z0-9-]{2,40}$'),
  player_id text NOT NULL CHECK (
    player_id ~ '^(user:[0-9a-f-]{36}|house:house_[a-z0-9_]{2,24})$'
  ),
  opponent_id text NOT NULL CHECK (
    opponent_id ~ '^(user:[0-9a-f-]{36}|house:house_[a-z0-9_]{2,24}|guest:[A-Za-z0-9_-]{22}:[12])$'
  ),
  player_name text NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 24),
  opponent_name text NOT NULL CHECK (char_length(opponent_name) BETWEEN 1 AND 24),
  result text NOT NULL CHECK (result IN ('win', 'loss')),
  wins smallint NOT NULL CHECK (wins >= 0),
  losses smallint NOT NULL CHECK (losses >= 0),
  series_target smallint NOT NULL CHECK (series_target IN (1, 2, 3)),
  finish_reason text NOT NULL CHECK (
    finish_reason IN ('normal', 'timeout', 'disconnect', 'forfeit')
  ),
  visibility text NOT NULL CHECK (visibility IN ('public', 'invite')),
  series_number integer NOT NULL CHECK (series_number > 0),
  ranking_day date NOT NULL,
  ranking_status text NOT NULL CHECK (
    ranking_status IN (
      'ranked',
      'unranked_guest',
      'unranked_rematch',
      'unranked_pair_cap',
      'unranked_privacy'
    )
  ),
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (completion_id, player_id)
);

CREATE INDEX leaderboard_results_ranked_day_idx ON public.leaderboard_series_results (game_id, ranking_day, player_id)
WHERE
  ranking_status = 'ranked';

CREATE INDEX leaderboard_results_player_idx ON public.leaderboard_series_results (player_id, game_id, completed_at DESC);

CREATE TABLE public.leaderboard_daily_totals (
  game_id text NOT NULL,
  ranking_day date NOT NULL,
  player_id text NOT NULL,
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  matches integer NOT NULL DEFAULT 0 CHECK (matches >= 0),
  PRIMARY KEY (game_id, ranking_day, player_id)
);

CREATE INDEX leaderboard_daily_player_day_idx ON public.leaderboard_daily_totals (player_id, game_id, ranking_day DESC);

CREATE TABLE public.leaderboard_all_time_totals (
  game_id text NOT NULL,
  player_id text NOT NULL,
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  matches integer NOT NULL DEFAULT 0 CHECK (matches >= 0),
  PRIMARY KEY (game_id, player_id)
);

CREATE TABLE public.leaderboard_snapshots (
  game_id text NOT NULL,
  period text NOT NULL CHECK (period IN ('all_time', 'week', 'month', 'year')),
  player_id text NOT NULL,
  player_name text NOT NULL,
  wins integer NOT NULL CHECK (wins >= 0),
  losses integer NOT NULL CHECK (losses >= 0),
  matches integer NOT NULL CHECK (matches > 0),
  rank integer NOT NULL CHECK (rank > 0),
  cutoff_date date NOT NULL,
  calculated_at timestamptz NOT NULL,
  PRIMARY KEY (game_id, period, player_id)
);

REVOKE ALL ON public.in_house_players,
public.leaderboard_pair_daily_slots,
public.leaderboard_series_results,
public.leaderboard_daily_totals,
public.leaderboard_all_time_totals,
public.leaderboard_snapshots
FROM
  public,
  anon,
  authenticated;

GRANT ALL ON public.in_house_players,
public.leaderboard_pair_daily_slots,
public.leaderboard_series_results,
public.leaderboard_daily_totals,
public.leaderboard_all_time_totals,
public.leaderboard_snapshots TO service_role;

ALTER TABLE public.in_house_players enable ROW level security;

ALTER TABLE public.leaderboard_pair_daily_slots enable ROW level security;

ALTER TABLE public.leaderboard_series_results enable ROW level security;

ALTER TABLE public.leaderboard_daily_totals enable ROW level security;

ALTER TABLE public.leaderboard_all_time_totals enable ROW level security;

ALTER TABLE public.leaderboard_snapshots enable ROW level security;

CREATE OR REPLACE FUNCTION public.claim_username (requested_username text) returns text language plpgsql security definer
SET
  search_path = '' AS $$
declare
  current_user_id uuid := auth.uid();
  cleaned_username text := btrim(requested_username);
  existing_username text;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if cleaned_username !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then
    raise exception using errcode = 'P0001', message = 'invalid_username';
  end if;
  if lower(cleaned_username) = any (array['admin', 'administrator', 'moderator', 'support', 'system', 'root', 'help'])
    or exists (
      select 1 from public.in_house_players as player
      where lower(player.username) = lower(cleaned_username)
        or lower(player.username) = 'house_' || lower(cleaned_username)
        or lower(player.player_id) = lower(cleaned_username)
        or lower(regexp_replace(player.display_name, '^[0-9]+[[:space:]]*', '')) = lower(cleaned_username)
    ) then
    raise exception using errcode = 'P0001', message = 'reserved_username';
  end if;

  insert into public.profiles (user_id, username)
  values (current_user_id, cleaned_username)
  on conflict (user_id) do nothing;
  select profile.username into existing_username
  from public.profiles as profile where profile.user_id = current_user_id;
  return existing_username;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'username_taken';
end;
$$;

REVOKE ALL ON function public.claim_username (text)
FROM
  public,
  anon;

GRANT
EXECUTE ON function public.claim_username (text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_leaderboard_visibility (is_public boolean) returns boolean language plpgsql security definer
SET
  search_path = '' AS $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  update public.profiles set leaderboard_public = is_public where user_id = current_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  return is_public;
end;
$$;

REVOKE ALL ON function public.set_leaderboard_visibility (boolean)
FROM
  public,
  anon;

GRANT
EXECUTE ON function public.set_leaderboard_visibility (boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_in_house_player (requested_player_id text, requested_match_id text) returns TABLE (player_id text, username text, display_name text) language plpgsql security definer
SET
  search_path = '' AS $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if requested_match_id is null or requested_match_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception using errcode = '22023', message = 'invalid_match_id';
  end if;

  return query
  update public.in_house_players as player
  set active_match_id = requested_match_id, lease_expires_at = now() + interval '24 hours'
  where player.player_id = requested_player_id
    and player.is_active
    and (player.active_match_id is null or player.lease_expires_at <= now() or player.active_match_id = requested_match_id)
  returning player.player_id, player.username, player.display_name;
end;
$$;

REVOKE ALL ON function public.claim_in_house_player (text, text)
FROM
  public,
  anon,
  authenticated;

GRANT
EXECUTE ON function public.claim_in_house_player (text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_any_in_house_player (requested_match_id text) returns TABLE (player_id text, username text, display_name text) language plpgsql security definer
SET
  search_path = '' AS $$
declare selected_id text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if requested_match_id is null or requested_match_id !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception using errcode = '22023', message = 'invalid_match_id';
  end if;

  select player.player_id into selected_id
  from public.in_house_players as player
  where player.is_active
    and (player.active_match_id is null or player.lease_expires_at <= now())
  order by player.player_id
  for update skip locked
  limit 1;

  if selected_id is null then return; end if;
  return query select * from public.claim_in_house_player(selected_id, requested_match_id);
end;
$$;

REVOKE ALL ON function public.claim_any_in_house_player (text)
FROM
  public,
  anon,
  authenticated;

GRANT
EXECUTE ON function public.claim_any_in_house_player (text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_in_house_player (requested_match_id text) returns boolean language plpgsql security definer
SET
  search_path = '' AS $$
declare released integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  update public.in_house_players
  set active_match_id = null, lease_expires_at = null
  where active_match_id = requested_match_id;
  get diagnostics released = row_count;
  return released > 0;
end;
$$;

REVOKE ALL ON function public.release_in_house_player (text)
FROM
  public,
  anon,
  authenticated;

GRANT
EXECUTE ON function public.release_in_house_player (text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_match_series (result_payload jsonb) returns jsonb language plpgsql security definer
SET
  search_path = '' AS $$
declare
  current_match_id text := result_payload->>'match_id';
  current_game_id text := result_payload->>'game_id';
  current_visibility text := result_payload->>'visibility';
  current_series integer := (result_payload->>'series_number')::integer;
  current_target smallint := (result_payload->>'series_target')::smallint;
  current_completed timestamptz := (result_payload->>'completed_at')::timestamptz;
  current_reason text := result_payload->>'finish_reason';
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
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if jsonb_typeof(result_payload) is distinct from 'object'
    or current_match_id is null
    or current_match_id !~ '^[A-Za-z0-9_-]{22}$'
    or current_game_id is null
    or current_game_id !~ '^[a-z0-9-]{2,40}$'
    or current_visibility is null
    or current_visibility not in ('public', 'invite')
    or current_series is null or current_series < 1
    or current_target is null or current_target not in (1, 2, 3)
    or current_completed is null
    or current_reason is null
    or current_reason not in ('normal', 'timeout', 'disconnect', 'forfeit')
    or jsonb_typeof(result_payload->'players') is distinct from 'array'
    or jsonb_array_length(result_payload->'players') <> 2 then
    raise exception using errcode = '22023', message = 'invalid_series_result';
  end if;

  current_completion_id := current_match_id || ':' || current_series::text;
  current_ranking_day := (current_completed at time zone 'Africa/Lagos')::date;
  select array_agg(item.player_id order by item.player_id) into pair_ids
  from jsonb_to_recordset(result_payload->'players') as item(player_id text);
  if pair_ids is null or array_length(pair_ids, 1) <> 2 or pair_ids[1] = pair_ids[2] then
    raise exception using errcode = '22023', message = 'invalid_series_participants';
  end if;

  base_eligible := current_series = 1 and not exists (
    select 1 from jsonb_to_recordset(result_payload->'players') as item(player_id text)
    where item.player_id like 'guest:%'
  );
  current_pair_key := pair_ids[1] || '|' || pair_ids[2];

  if base_eligible then
    insert into public.leaderboard_pair_daily_slots (game_id, pair_key, ranking_day, completion_id)
    values (current_game_id, current_pair_key, current_ranking_day, current_completion_id)
    on conflict do nothing;
    get diagnostics row_inserted = row_count;
    slot_claimed := row_inserted = 1;
  end if;

  for participant in select value from jsonb_array_elements(result_payload->'players')
  loop
    select value into opponent
    from jsonb_array_elements(result_payload->'players') as other(value)
    where other.value->>'player_id' <> participant->>'player_id'
    limit 1;

    participant_id := participant->>'player_id';
    opponent_id := opponent->>'player_id';
    player_name := participant->>'display_name';
    opponent_name := opponent->>'display_name';
    player_result := participant->>'result';
    player_wins := (participant->>'wins')::smallint;
    player_losses := (participant->>'losses')::smallint;
    if player_result not in ('win', 'loss') or char_length(player_name) not between 1 and 24
      or char_length(opponent_name) not between 1 and 24 or player_wins < 0 or player_losses < 0 then
      raise exception using errcode = '22023', message = 'invalid_series_participant';
    end if;

    participant_kind := split_part(participant_id, ':', 1);
    participant_user_id := null;
    participant_house_id := null;
    profile_visible := true;
    if participant_kind = 'user' then
      participant_user_id := split_part(participant_id, ':', 2)::uuid;
      select profile.leaderboard_public into profile_visible
      from public.profiles as profile where profile.user_id = participant_user_id;
      if not found then raise exception using errcode = '22023', message = 'participant_profile_missing'; end if;
      select profile.username into player_name from public.profiles as profile where profile.user_id = participant_user_id;
    elsif participant_kind = 'house' then
      participant_house_id := split_part(participant_id, ':', 2);
      select player.display_name into player_name
      from public.in_house_players as player where player.player_id = participant_house_id and player.is_active;
      if not found then raise exception using errcode = '22023', message = 'in_house_player_missing'; end if;
    elsif participant_kind = 'guest' then
      continue;
    else
      raise exception using errcode = '22023', message = 'invalid_participant_id';
    end if;

    if current_series > 1 then
      status := 'unranked_rematch';
    elsif not base_eligible then
      status := 'unranked_guest';
    elsif not slot_claimed then
      status := 'unranked_pair_cap';
    elsif participant_kind = 'user' and not profile_visible then
      status := 'unranked_privacy';
    else
      status := 'ranked';
    end if;

    insert into public.leaderboard_series_results (
      completion_id, game_id, player_id, opponent_id, player_name, opponent_name,
      result, wins, losses, series_target, finish_reason, visibility, series_number,
      ranking_day, ranking_status, completed_at
    ) values (
      current_completion_id, current_game_id, participant_id, opponent_id, player_name, opponent_name,
      player_result, player_wins, player_losses, current_target, current_reason, current_visibility, current_series,
      current_ranking_day, status, current_completed
    ) on conflict (completion_id, player_id) do nothing;
    get diagnostics row_inserted = row_count;
    if row_inserted = 1 then
      stored := stored + 1;
      if participant_user_id is not null then
        insert into public.game_history (
          completion_id, user_id, game_id, rules_version, result, opponent_name,
          wins, losses, series_target, finish_reason, completed_at, record_source, ranking_status
        ) values (
          current_completion_id, participant_user_id, current_game_id, (result_payload->>'rules_version')::integer,
          player_result, opponent_name, player_wins, player_losses, current_target, current_reason, current_completed,
          'verified', status
        ) on conflict (completion_id, user_id) do update
        set game_id = excluded.game_id,
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
        where public.game_history.record_source = 'guest_import';
      end if;
      if status = 'ranked' then
        ranked_count := ranked_count + 1;
        insert into public.leaderboard_daily_totals (game_id, ranking_day, player_id, wins, losses, matches)
        values (current_game_id, current_ranking_day, participant_id,
          case when player_result = 'win' then 1 else 0 end,
          case when player_result = 'loss' then 1 else 0 end, 1)
        on conflict (game_id, ranking_day, player_id) do update
        set wins = public.leaderboard_daily_totals.wins + excluded.wins,
            losses = public.leaderboard_daily_totals.losses + excluded.losses,
            matches = public.leaderboard_daily_totals.matches + 1;
        insert into public.leaderboard_all_time_totals (game_id, player_id, wins, losses, matches)
        values (current_game_id, participant_id,
          case when player_result = 'win' then 1 else 0 end,
          case when player_result = 'loss' then 1 else 0 end, 1)
        on conflict (game_id, player_id) do update
        set wins = public.leaderboard_all_time_totals.wins + excluded.wins,
            losses = public.leaderboard_all_time_totals.losses + excluded.losses,
            matches = public.leaderboard_all_time_totals.matches + 1;
      end if;
    end if;
  end loop;

  update public.in_house_players
  set active_match_id = null, lease_expires_at = null
  where active_match_id = current_match_id;

  return jsonb_build_object(
    'completion_id', current_completion_id,
    'stored_participants', stored,
    'ranked_participants', ranked_count,
    'ranking_status', case when current_series > 1 then 'unranked_rematch'
      when not base_eligible then 'unranked_guest'
      when not slot_claimed then 'unranked_pair_cap'
      else 'ranked' end
  );
end;
$$;

REVOKE ALL ON function public.record_match_series (jsonb)
FROM
  public,
  anon,
  authenticated;

GRANT
EXECUTE ON function public.record_match_series (jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.publish_daily_leaderboards () returns jsonb language plpgsql security definer
SET
  search_path = '' AS $$
declare
  calculated timestamptz := now();
  local_today date := (now() at time zone 'Africa/Lagos')::date;
  cutoff date := local_today - 1;
  week_start date := date_trunc('week', (local_today - 1)::timestamp)::date;
  month_start date := date_trunc('month', (local_today - 1)::timestamp)::date;
  year_start date := date_trunc('year', (local_today - 1)::timestamp)::date;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('games_leaderboard_publish_daily'));

  delete from public.leaderboard_snapshots;
  insert into public.leaderboard_snapshots (
    game_id, period, player_id, player_name, wins, losses, matches, rank, cutoff_date, calculated_at
  )
  with all_periods as (
    select game_id, player_id, wins, losses, matches, 'all_time'::text as period from public.leaderboard_all_time_totals where matches > 0
    union all
    select daily.game_id, daily.player_id, sum(daily.wins)::integer, sum(daily.losses)::integer, sum(daily.matches)::integer, 'week'
    from public.leaderboard_daily_totals as daily where daily.ranking_day between week_start and cutoff group by daily.game_id,daily.player_id
    union all
    select daily.game_id, daily.player_id, sum(daily.wins)::integer, sum(daily.losses)::integer, sum(daily.matches)::integer, 'month'
    from public.leaderboard_daily_totals as daily where daily.ranking_day between month_start and cutoff group by daily.game_id,daily.player_id
    union all
    select daily.game_id, daily.player_id, sum(daily.wins)::integer, sum(daily.losses)::integer, sum(daily.matches)::integer, 'year'
    from public.leaderboard_daily_totals as daily where daily.ranking_day between year_start and cutoff group by daily.game_id,daily.player_id
  ), named as (
    select entry.*, case when entry.player_id like 'house:%' then house.display_name else profile.username end as player_name
    from all_periods as entry
    left join public.in_house_players as house on entry.player_id = 'house:' || house.player_id
    left join public.profiles as profile on entry.player_id = 'user:' || profile.user_id::text
    where (entry.player_id like 'house:%' and house.is_active)
      or (entry.player_id like 'user:%' and profile.leaderboard_public)
  ), ranked as (
    select named.*, rank() over (partition by game_id, period order by wins desc) as rank
    from named where matches > 0
  )
  select game_id, period, player_id, player_name, wins, losses, matches, rank::integer, cutoff, calculated
  from ranked;

  return jsonb_build_object('cutoff_date', cutoff, 'calculated_at', calculated);
end;
$$;

REVOKE ALL ON function public.publish_daily_leaderboards ()
FROM
  public,
  anon,
  authenticated;

GRANT
EXECUTE ON function public.publish_daily_leaderboards () TO service_role;

CREATE OR REPLACE FUNCTION public.get_leaderboard (requested_game_id text, requested_period text) returns jsonb language plpgsql stable security definer
SET
  search_path = '' AS $$
declare result jsonb;
begin
  if requested_game_id is null or requested_game_id !~ '^[a-z0-9-]{2,40}$'
    or requested_period is null
    or requested_period not in ('all_time', 'week', 'month', 'year') then
    raise exception using errcode = '22023', message = 'invalid_leaderboard_request';
  end if;
  select jsonb_build_object(
    'cutoff_date', max(ranked.cutoff_date),
    'calculated_at', max(ranked.calculated_at),
    'entries', coalesce(jsonb_agg(jsonb_build_object(
      'rank', ranked.rank,
      'player_name', ranked.player_name,
      'wins', ranked.wins,
      'losses', ranked.losses,
      'matches', ranked.matches,
      'win_rate', round(ranked.wins::numeric / nullif(ranked.matches, 0), 4)
    ) order by ranked.rank, lower(ranked.player_name)), '[]'::jsonb)
  ) into result
  from (
    select snapshot.game_id, snapshot.period, snapshot.player_id, snapshot.player_name,
      snapshot.wins, snapshot.losses, snapshot.matches,
      rank() over (order by snapshot.wins desc)::integer as rank,
      snapshot.cutoff_date, snapshot.calculated_at
    from public.leaderboard_snapshots as snapshot
    left join public.profiles as profile on snapshot.player_id = 'user:' || profile.user_id::text
    left join public.in_house_players as house on snapshot.player_id = 'house:' || house.player_id
    where snapshot.game_id = requested_game_id and snapshot.period = requested_period
      and ((snapshot.player_id like 'house:%' and house.is_active)
        or (snapshot.player_id like 'user:%' and profile.leaderboard_public))
    order by snapshot.rank, lower(snapshot.player_name)
    limit 100
  ) as ranked;
  return coalesce(result, jsonb_build_object('cutoff_date', null, 'calculated_at', null, 'entries', '[]'::jsonb));
end;
$$;

REVOKE ALL ON function public.get_leaderboard (text, text)
FROM
  public;

GRANT
EXECUTE ON function public.get_leaderboard (text, text) TO anon,
authenticated;

COMMENT ON TABLE public.in_house_players IS 'Stable non-authenticated opponents used by the Games service; identities are server-managed and usernames are reserved from account claims.';

COMMENT ON TABLE public.leaderboard_series_results IS 'One server-verified row per participant per completed series; individual rounds are not ranked separately.';

COMMENT ON TABLE public.leaderboard_pair_daily_slots IS 'One ranked series per unordered player pair, game, and Africa/Lagos day; rematches are excluded.';
