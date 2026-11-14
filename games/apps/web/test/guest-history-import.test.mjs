import assert from "node:assert/strict";
import test from "node:test";
import { AccountSession } from "../src/features/account/account-session.ts";
import { readGuestHistory, saveGuestHistory } from "../src/features/account/guest-history.ts";

const session = {
  access_token: "session-token",
  user: { id: "7f25c8d9-07b8-4e2c-9fc1-288019d41f4b" },
};
const guestEntry = {
  completion_id: "abcdefghijklmnopqrstuv:1",
  game_id: "reversi",
  rules_version: 1,
  result: "win",
  opponent_name: "Bright Fox 17",
  wins: 1,
  losses: 0,
  series_target: 1,
  finish_reason: "normal",
  completed_at: "2026-11-07T12:00:00.000Z",
};

function withLocalStorage(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  return Promise.resolve()
    .then(() => run(values))
    .finally(() => {
      if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
      else delete globalThis.localStorage;
    });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createFakeClient({ firstHistory, importError = null }) {
  let authListener;
  let imported = false;
  let historyRequests = 0;
  let rpcCalled;
  const rpcStarted = new Promise((resolve) => {
    rpcCalled = resolve;
  });
  const client = {
    channel() {
      const channel = {
        on() {
          return channel;
        },
        subscribe(onStatus) {
          queueMicrotask(() => onStatus("SUBSCRIBED"));
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
      async signOut() {
        authListener?.("SIGNED_OUT", null);
        return { error: null };
      },
    },
    from(table) {
      if (table === "profiles")
        return {
          select: () => ({
            maybeSingle: async () => ({
              data: { username: "TestPlayer", created_at: "2026-11-01T00:00:00Z" },
              error: null,
            }),
          }),
        };
      assert.equal(table, "game_history");
      return {
        select: () => {
          const query = {
            order: () => query,
            limit: async () => {
              historyRequests += 1;
              const rows =
                historyRequests === 1 && firstHistory
                  ? await firstHistory.promise
                  : imported
                    ? [
                        {
                          ...guestEntry,
                          record_source: "guest_import",
                          ranking_status: "unranked_legacy",
                        },
                      ]
                    : [];
              return { data: rows, error: null, count: rows.length };
            },
          };
          return query;
        },
      };
    },
    async rpc(name, args) {
      if (name === "get_incoming_friend_request_count") return { data: 0, error: null };
      assert.equal(name, "import_guest_history");
      assert.deepEqual(args.entries, [guestEntry]);
      rpcCalled();
      if (importError) return { data: null, error: importError };
      imported = true;
      return { data: 1, error: null };
    },
  };
  return {
    client,
    emit(event, value) {
      authListener?.(event, value);
    },
    rpcStarted,
    get historyRequests() {
      return historyRequests;
    },
  };
}

test("import waits for an in-flight stale history read, then reloads imported rows", async () => {
  await withLocalStorage(async () => {
    assert.equal(saveGuestHistory(guestEntry), true);
    const firstHistory = deferred();
    const fake = createFakeClient({ firstHistory });
    const account = new AccountSession(fake.client);
    account.start();
    fake.emit("SIGNED_IN", session);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fake.historyRequests, 1);
    assert.equal(account.getSnapshot().historyStatus, "loading");

    const importing = account.importGuestHistory();
    await fake.rpcStarted;
    assert.equal(fake.historyRequests, 1);
    firstHistory.resolve([]);
    assert.equal(await importing, true);

    assert.equal(fake.historyRequests, 2);
    assert.equal(account.getSnapshot().history[0].record_source, "guest_import");
    assert.equal(account.getSnapshot().historyCount, 1);
    assert.equal(account.getSnapshot().guestHistoryCount, 0);
    assert.deepEqual(readGuestHistory(), []);
    account.stop();
  });
});

test("failed import preserves the local copy and reports a retryable error", async () => {
  await withLocalStorage(async () => {
    assert.equal(saveGuestHistory(guestEntry), true);
    const fake = createFakeClient({ importError: new Error("migration not applied") });
    const account = new AccountSession(fake.client);
    account.start();
    fake.emit("SIGNED_IN", session);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(await account.importGuestHistory(), false);
    assert.equal(account.getSnapshot().guestHistoryCount, 1);
    assert.equal(account.getSnapshot().guestHistoryError.includes("still on this device"), true);
    assert.equal(readGuestHistory().length, 1);
    account.stop();
  });
});
