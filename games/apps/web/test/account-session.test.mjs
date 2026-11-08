import assert from "node:assert/strict";
import test from "node:test";
import { AccountSession } from "../src/features/account/account-session.ts";

const signedInSession = {
  access_token: "test-access-token",
  user: { id: "7f25c8d9-07b8-4e2c-9fc1-288019d41f4b" },
};

function fakeClient({
  profile = { username: "Akeem_7", created_at: "2026-11-01T10:00:00.000Z" },
  claim = "Akeem_7",
  history = [],
  historyCount = history.length,
  historyError = null,
} = {}) {
  let authListener;
  let historyRequests = 0;
  return {
    client: {
      auth: {
        onAuthStateChange(listener) {
          authListener = listener;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async signInWithOAuth() {
          return { error: null };
        },
        async signOut() {
          authListener?.("SIGNED_OUT", null);
          return { error: null };
        },
      },
      from(table) {
        if (table === "profiles")
          return {
            select() {
              return {
                async maybeSingle() {
                  return { data: profile, error: null };
                },
              };
            },
          };
        assert.equal(table, "game_history");
        return {
          select() {
            historyRequests += 1;
            const query = {
              order() {
                return query;
              },
              async limit(limit) {
                return {
                  data: history.slice(0, limit),
                  error: historyError,
                  count: historyCount,
                };
              },
            };
            return query;
          },
        };
      },
      async rpc(name, args) {
        assert.equal(name, "claim_username");
        assert.equal(args.requested_username, "NewName_1");
        return { data: claim, error: null };
      },
    },
    emit(event, session) {
      authListener?.(event, session);
    },
    get historyRequests() {
      return historyRequests;
    },
  };
}

test("restored auth waits for profile resolution before match identity is returned", async () => {
  let releaseProfile;
  const fake = fakeClient();
  fake.client.from = () => ({
    select: () => ({
      maybeSingle: () =>
        new Promise((resolve) => {
          releaseProfile = resolve;
        }),
    }),
  });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("INITIAL_SESSION", signedInSession);

  const pendingIdentity = account.getIdentityForRequest();
  assert.equal(account.getIdentity(), null);
  await new Promise((resolve) => queueMicrotask(resolve));
  releaseProfile({
    data: { username: "Akeem_7", created_at: "2026-11-01T10:00:00.000Z" },
    error: null,
  });
  assert.deepEqual(await pendingIdentity, {
    userId: signedInSession.user.id,
    username: "Akeem_7",
    accessToken: "test-access-token",
  });
  account.stop();
});

test("preloads recent series after account resolution and serves cached data without another request", async () => {
  const fake = fakeClient({
    historyCount: 7,
    history: [
      {
        completion_id: "abcdefghijklmnopqrstuv:1",
        game_id: "reversi",
        result: "win",
        opponent_name: "Bright Fox 17",
        wins: 1,
        losses: 0,
        series_target: 1,
        finish_reason: "normal",
        completed_at: "2026-11-06T10:00:00.000Z",
        record_source: "verified",
        ranking_status: "ranked",
      },
    ],
  });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("INITIAL_SESSION", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(account.getSnapshot().joinedAt, "2026-11-01T10:00:00.000Z");
  assert.equal(account.getSnapshot().historyStatus, "ready");
  assert.equal(account.getSnapshot().historyCount, 7);
  assert.equal(account.getSnapshot().history[0].opponent_name, "Bright Fox 17");
  assert.equal(fake.historyRequests, 1);

  await account.loadGameHistory();
  assert.equal(fake.historyRequests, 1);
  await account.loadGameHistory(true);
  assert.equal(fake.historyRequests, 2);
  account.stop();
});

test("a failed history request is not repeated on every account open; explicit retry bypasses backoff", async () => {
  const fake = fakeClient({ historyError: new Error("offline") });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("INITIAL_SESSION", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(account.getSnapshot().historyStatus, "error");
  assert.equal(fake.historyRequests, 1);
  await account.loadGameHistory();
  assert.equal(fake.historyRequests, 1);
  await account.loadGameHistory(true);
  assert.equal(fake.historyRequests, 2);
  account.stop();
});

test("signed-out users resolve to guest identity without waiting", async () => {
  const fake = fakeClient();
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("INITIAL_SESSION", null);
  assert.equal(await account.getIdentityForRequest(), null);
  account.stop();
});

test("username claim updates the account identity", async () => {
  const fake = fakeClient({ claim: "NewName_1" });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("SIGNED_IN", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await account.claimUsername("NewName_1"), true);
  assert.equal(account.getSnapshot().username, "NewName_1");
  account.stop();
});

test("identity request fails closed on account lookup failure instead of falling back to guest", async () => {
  const fake = fakeClient();
  fake.client.from = () => ({
    select: () => ({
      async maybeSingle() {
        return { data: null, error: new Error("offline") };
      },
    }),
  });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("INITIAL_SESSION", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(account.getIdentityForRequest(), /Account check failed/);
  account.stop();
});
