import assert from "node:assert/strict";
import test from "node:test";
import {
  GUEST_HISTORY_LIMIT,
  readGuestHistory,
  removeGuestHistory,
  saveGuestHistory,
} from "../src/features/account/guest-history.ts";

const entry = (completion_id, completed_at = "2026-11-07T12:00:00.000Z", overrides = {}) => ({
  completion_id,
  game_id: "connect-four",
  rules_version: 2,
  result: "win",
  opponent_name: "Bright Fox 17",
  wins: 2,
  losses: 0,
  series_target: 2,
  finish_reason: "normal",
  completed_at,
  ...overrides,
});

function withStorage(run, initial = null, storageOverrides = {}) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map(initial === null ? [] : [["games-guest-history:v1", initial]]);
  const storage = {
    getItem(key) {
      if (storageOverrides.getItemThrows) throw new Error("blocked");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (storageOverrides.setItemThrows) throw new Error("blocked");
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

test("guest history upserts by completed series and removes only imported records", async () => {
  await withStorage(async (values) => {
    assert.equal(saveGuestHistory(entry("abcdefghijklmnopqrstuv:1")), true);
    assert.equal(
      saveGuestHistory(
        entry("abcdefghijklmnopqrstuv:1", "2026-11-07T12:01:00.000Z", { result: "loss" }),
      ),
      true,
    );
    assert.equal(saveGuestHistory(entry("abcdefghijklmnopqrstuw:1")), true);
    assert.equal(readGuestHistory().length, 2);
    assert.equal(readGuestHistory()[0].result, "loss");

    removeGuestHistory(["abcdefghijklmnopqrstuv:1"]);
    assert.deepEqual(
      readGuestHistory().map((item) => item.completion_id),
      ["abcdefghijklmnopqrstuw:1"],
    );
    assert.equal(JSON.parse(values.get("games-guest-history:v1")).length, 1);
  });
});

test("guest history rejects malformed records and bounds the device archive", async () => {
  await withStorage(async (values) => {
    assert.equal(saveGuestHistory(entry("not-a-completion-id")), false);
    assert.equal(
      saveGuestHistory(entry("abcdefghijklmnopqrstuv:1", undefined, { wins: -1 })),
      false,
    );
    for (let index = 1; index <= GUEST_HISTORY_LIMIT + 5; index += 1) {
      const id = String(index).padStart(22, "0");
      assert.equal(
        saveGuestHistory(entry(`${id}:1`, new Date(1_800_000_000_000 + index).toISOString())),
        true,
      );
    }
    const entries = readGuestHistory();
    assert.equal(entries.length, GUEST_HISTORY_LIMIT);
    assert.equal(
      entries[0].completion_id,
      `${String(GUEST_HISTORY_LIMIT + 5).padStart(22, "0")}:1`,
    );
    assert.equal(values.get("games-guest-history:v1").length < 100_000, true);
  });
});

test("guest history storage failures degrade without blocking gameplay", async () => {
  await withStorage(
    async () => {
      assert.deepEqual(readGuestHistory(), []);
      assert.equal(saveGuestHistory(entry("abcdefghijklmnopqrstuv:1")), false);
    },
    null,
    { getItemThrows: true, setItemThrows: true },
  );
});
