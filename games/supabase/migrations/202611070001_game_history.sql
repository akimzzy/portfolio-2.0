create table public.game_history (
  completion_id text not null check (completion_id ~ '^[A-Za-z0-9_-]{22}:[1-9][0-9]*$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null check (game_id ~ '^[a-z0-9-]{2,40}$'),
  rules_version integer not null check (rules_version > 0),
  result text not null check (result in ('win', 'loss')),
  opponent_name text not null check (char_length(opponent_name) between 1 and 24),
  wins smallint not null check (wins >= 0),
  losses smallint not null check (losses >= 0),
  series_target smallint not null check (series_target in (1, 2, 3)),
  finish_reason text not null check (finish_reason in ('normal', 'timeout', 'disconnect', 'forfeit')),
  completed_at timestamptz not null,
  primary key (completion_id, user_id)
);

create index game_history_user_completed_idx
  on public.game_history (user_id, completed_at desc);

create index game_history_user_game_completed_idx
  on public.game_history (user_id, game_id, completed_at desc);

alter table public.game_history enable row level security;
revoke all on table public.game_history from anon, authenticated;
grant select on table public.game_history to authenticated;
grant all on table public.game_history to service_role;

create policy game_history_select_own
  on public.game_history
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
