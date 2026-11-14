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
  rename = {
    username: "NewName_1",
    username_changed_at: "2026-11-08T10:00:00.000Z",
    next_change_at: "2026-12-08T10:00:00.000Z",
  },
  renameError = null,
  history = [],
  historyCount = history.length,
  historyError = null,
  incomingFriendRequestCount = 0,
} = {}) {
  let authListener;
  let historyRequests = 0;
  let currentIncomingCount = incomingFriendRequestCount;
  const friendshipListeners = [];
  const rpcRequests = [];
  return {
    client: {
      channel() {
        const handlers = [];
        const channel = {
          on(_type, _filter, handler) {
            handlers.push(handler);
            return channel;
          },
          subscribe(onStatus) {
            queueMicrotask(() => onStatus("SUBSCRIBED"));
            friendshipListeners.push(...handlers);
            return channel;
          },
        };
        return channel;
      },
      async removeChannel() {},
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
        rpcRequests.push({ name, args });
        if (name === "get_incoming_friend_request_count")
          return { data: currentIncomingCount, error: null };
        if (name === "claim_username") return { data: claim, error: null };
        assert.equal(name, "change_username");
        return { data: rename, error: renameError };
      },
    },
    emit(event, session) {
      authListener?.(event, session);
    },
    emitFriendshipChange(count) {
      currentIncomingCount = count;
      for (const listener of friendshipListeners) listener({ event: "INSERT" });
    },
    get historyRequests() {
      return historyRequests;
    },
    rpcRequests,
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

test("loads the pending request count after subscribing and refreshes on friendship changes", async () => {
  const fake = fakeClient({ incomingFriendRequestCount: 2 });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("INITIAL_SESSION", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(account.getSnapshot().incomingFriendRequestCount, 2);

  fake.emitFriendshipChange(3);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(account.getSnapshot().incomingFriendRequestCount, 3);
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

test("username change updates the current identity and applies the 30-day availability date", async () => {
  const fake = fakeClient({
    rename: {
      username: "NewName_1",
      username_changed_at: "2026-11-08T10:00:00.000Z",
      next_change_at: "2026-12-08T10:00:00.000Z",
    },
  });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("SIGNED_IN", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(await account.changeUsername("NewName_1"), true);
  assert.equal(account.getSnapshot().username, "NewName_1");
  assert.equal(account.getSnapshot().usernameChangeAvailableAt, "2026-12-08T10:00:00.000Z");
  assert.deepEqual(fake.rpcRequests.at(-1), {
    name: "change_username",
    args: { requested_username: "NewName_1" },
  });
  account.stop();
});

test("username change cooldown is enforced locally before an RPC is sent", async () => {
  const fake = fakeClient({
    profile: {
      username: "Akeem_7",
      created_at: "2026-11-01T10:00:00.000Z",
      username_changed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("SIGNED_IN", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(await account.changeUsername("NewName_1"), false);
  assert.match(account.getSnapshot().usernameChangeError, /change your username again on/);
  assert.equal(
    fake.rpcRequests.some(({ name }) => name === "change_username"),
    false,
  );
  account.stop();
});

test("username change reports taken names and stays retryable", async () => {
  const fake = fakeClient({ renameError: new Error("username_taken") });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("SIGNED_IN", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(await account.changeUsername("NewName_1"), false);
  assert.equal(account.getSnapshot().username, "Akeem_7");
  assert.equal(account.getSnapshot().busy, false);
  assert.equal(
    account.getSnapshot().usernameChangeError,
    "That username is already taken. Try another.",
  );
  account.stop();
});

test("server-side username cooldown refreshes the blocked-until date", async () => {
  const cooldownError = new Error("username_change_cooldown");
  cooldownError.details = "next_change_at=2026-12-08T10:00:00.000Z";
  const fake = fakeClient({ renameError: cooldownError });
  const account = new AccountSession(fake.client);
  account.start();
  fake.emit("SIGNED_IN", signedInSession);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(await account.changeUsername("NewName_1"), false);
  assert.equal(account.getSnapshot().busy, false);
  assert.equal(account.getSnapshot().usernameChangeAvailableAt, "2026-12-08T10:00:00.000Z");
  assert.match(account.getSnapshot().usernameChangeError, /change your username again on/);
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
