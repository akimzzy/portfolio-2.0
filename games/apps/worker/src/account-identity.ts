export type VerifiedAccountIdentity = Readonly<{ userId: string; username: string }>;
export type AccountResolution = Readonly<{ ok: true; identity: VerifiedAccountIdentity | null }> | Readonly<{ ok: false; response: Response }>;
export type AccountEnvironment = Readonly<{ SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string }>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

/** Verify the bearer token and resolve its RLS-protected username only for account-aware room operations. */
export async function resolveAccountIdentity(
  request: Request,
  env: AccountEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<AccountResolution> {
  const authorization = request.headers.get('authorization');
  if (!authorization) return { ok: true, identity: null };
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || match[1]!.length > 8_192) return { ok: false, response: json({ error: 'account-session-invalid' }, 401) };
  const baseUrl = env.SUPABASE_URL?.replace(/\/+$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) return { ok: false, response: json({ error: 'account-service-unavailable' }, 503) };

  try {
    const headers = { apikey: anonKey, Authorization: `Bearer ${match[1]}` };
    const userResponse = await fetcher(`${baseUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(5_000) });
    if (userResponse.status === 401 || userResponse.status === 403) {
      return { ok: false, response: json({ error: 'account-session-expired' }, 401) };
    }
    if (!userResponse.ok) return { ok: false, response: json({ error: 'account-service-unavailable' }, 503) };
    const user = await userResponse.json() as { id?: unknown };
    if (typeof user.id !== 'string' || !USER_ID_PATTERN.test(user.id)) {
      return { ok: false, response: json({ error: 'account-session-invalid' }, 401) };
    }

    const profileUrl = new URL(`${baseUrl}/rest/v1/profiles`);
    profileUrl.searchParams.set('select', 'username');
    profileUrl.searchParams.set('user_id', `eq.${user.id}`);
    const profileResponse = await fetcher(profileUrl, { headers, signal: AbortSignal.timeout(5_000) });
    if (profileResponse.status === 401 || profileResponse.status === 403) {
      return { ok: false, response: json({ error: 'account-profile-unavailable' }, 403) };
    }
    if (!profileResponse.ok) return { ok: false, response: json({ error: 'account-service-unavailable' }, 503) };
    const profiles = await profileResponse.json() as Array<{ username?: unknown }>;
    const username = profiles[0]?.username;
    if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
      return { ok: false, response: json({ error: 'account-username-required' }, 428) };
    }
    return { ok: true, identity: { userId: user.id, username } };
  } catch {
    return { ok: false, response: json({ error: 'account-service-unavailable' }, 503) };
  }
}
