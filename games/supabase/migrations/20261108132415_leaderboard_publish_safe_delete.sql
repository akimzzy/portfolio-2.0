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

  delete from public.leaderboard_snapshots where game_id is not null;
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
