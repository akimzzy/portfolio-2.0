create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$')
);

create unique index profiles_username_lower_unique on public.profiles (lower(username));

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.claim_username(requested_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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

  if lower(cleaned_username) = any (array['admin', 'administrator', 'moderator', 'support', 'system', 'root', 'help']) then
    raise exception using errcode = 'P0001', message = 'reserved_username';
  end if;

  insert into public.profiles (user_id, username)
  values (current_user_id, cleaned_username)
  on conflict (user_id) do nothing;

  select profile.username
    into existing_username
    from public.profiles as profile
    where profile.user_id = current_user_id;

  return existing_username;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'username_taken';
end;
$$;

revoke all on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
