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
  order by md5(requested_match_id || ':' || player.player_id)
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
