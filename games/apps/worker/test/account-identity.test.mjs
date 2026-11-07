import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAccountIdentity } from '../dist/account-identity.js';

const env = { SUPABASE_URL: 'https://games.example.supabase.co/', SUPABASE_ANON_KEY: 'public-key' };
const token = 'valid-access-token';
const userId = '7f25c8d9-07b8-4e2c-9fc1-288019d41f4b';
const request = (authorization = `Bearer ${token}`) => new Request('https://games-worker.example/v1/matches', {
  headers: authorization ? { authorization } : {},
});

function fakeFetch({ userStatus = 200, user = { id: userId }, profileStatus = 200, profiles = [{ username: 'Akeem_7' }] } = {}) {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === '/auth/v1/user') return Response.json(user, { status: userStatus });
    if (url.pathname === '/rest/v1/profiles') return Response.json(profiles, { status: profileStatus });
    throw new Error(`Unexpected Supabase endpoint: ${url.pathname}`);
  };
  return { fetcher, calls };
}

test('guest room operation makes no Supabase requests', async () => {
  const mock = fakeFetch();
  assert.deepEqual(await resolveAccountIdentity(request(null), env, mock.fetcher), { ok: true, identity: null });
  assert.equal(mock.calls.length, 0);
});

test('valid bearer resolves user and RLS-protected username with the same token', async () => {
  const mock = fakeFetch();
  assert.deepEqual(await resolveAccountIdentity(request(), env, mock.fetcher), {
    ok: true, identity: { userId, username: 'Akeem_7' },
  });
  assert.equal(mock.calls.length, 2);
  assert.equal(mock.calls[0].url.pathname, '/auth/v1/user');
  assert.equal(mock.calls[1].url.pathname, '/rest/v1/profiles');
  assert.equal(mock.calls[1].url.searchParams.get('user_id'), `eq.${userId}`);
  for (const call of mock.calls) {
    assert.equal(call.init.headers.apikey, 'public-key');
    assert.equal(call.init.headers.Authorization, `Bearer ${token}`);
  }
});

test('malformed and expired bearer tokens are rejected before profile lookup', async () => {
  const malformed = await resolveAccountIdentity(request('Bearer token with spaces'), env, fakeFetch().fetcher);
  assert.equal(malformed.ok, false);
  assert.equal(malformed.response.status, 401);

  const mock = fakeFetch({ userStatus: 401 });
  const expired = await resolveAccountIdentity(request(), env, mock.fetcher);
  assert.equal(expired.ok, false);
  assert.equal((await expired.response.json()).error, 'account-session-expired');
  assert.equal(mock.calls.length, 1);
});

test('invalid user identifiers and absent or malformed profiles fail closed', async () => {
  for (const setup of [
    { user: { id: 'not-a-user-id' } },
    { profiles: [] },
    { profiles: [{ username: 'Bad Name' }] },
  ]) {
    const result = await resolveAccountIdentity(request(), env, fakeFetch(setup).fetcher);
    assert.equal(result.ok, false);
    assert.ok([401, 428].includes(result.response.status));
  }
});

test('missing configuration and upstream failures return service errors', async () => {
  const missing = await resolveAccountIdentity(request(), {}, fakeFetch().fetcher);
  assert.equal(missing.ok, false);
  assert.equal(missing.response.status, 503);

  const unavailable = await resolveAccountIdentity(request(), env, async () => new Response(null, { status: 500 }));
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.response.status, 503);
});
