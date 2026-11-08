import assert from "node:assert/strict";
import test from "node:test";
import {
  canRetryPendingMove,
  reconcilePendingMove,
} from "../src/features/match/pending-move-reconciliation.ts";

const pending = {
  actionId: "action-1",
  action: { type: "drop-token", column: 2 },
  previousStateKey: JSON.stringify({ moves: [] }),
  seat: "first",
  expectedRevision: 4,
};

function match(state, revision = 4) {
  return { state, revision };
}

test("an authoritative sync with the unchanged board confirms the move was not applied", () => {
  assert.equal(
    reconcilePendingMove(pending, match({ moves: [] }), { syncId: "sync-1" }),
    "not-applied",
  );
});

test("a sync snapshot with a newer board resolves the pending move", () => {
  assert.equal(
    reconcilePendingMove(pending, match({ moves: ["first:2"] }, 5), { syncId: "sync-1" }),
    "accepted",
  );
});

test("an action acknowledgement resolves the pending move even without a board comparison", () => {
  assert.equal(
    reconcilePendingMove(pending, match(null), { acceptedActionId: "action-1" }),
    "accepted",
  );
});

test("a non-sync snapshot without the move leaves reconciliation pending", () => {
  assert.equal(reconcilePendingMove(pending, match({ moves: [] }), {}), "pending");
});

test("an unchanged active turn can retry the pending move once", () => {
  assert.equal(
    canRetryPendingMove(
      pending,
      {
        ...match({ moves: [] }),
        status: "active",
        serverNow: 1_000,
        turnDeadline: 46_000,
        awaitingTurnReceipt: null,
      },
      "first",
    ),
    true,
  );
});

test("a receipt revision can be retried when the board and player turn stayed unchanged", () => {
  assert.equal(
    canRetryPendingMove(
      pending,
      {
        ...match({ moves: [] }, 5),
        status: "active",
        serverNow: 1_000,
        turnDeadline: 46_000,
        awaitingTurnReceipt: null,
      },
      "first",
    ),
    true,
  );
});

test("a move is not retried if the board, turn, timer, or receipt state changed", () => {
  const base = {
    ...match({ moves: [] }),
    status: "active",
    serverNow: 1_000,
    turnDeadline: 46_000,
    awaitingTurnReceipt: null,
  };
  assert.equal(
    canRetryPendingMove(pending, { ...base, state: { moves: ["first:2"] } }, "first"),
    false,
  );
  assert.equal(canRetryPendingMove(pending, base, "second"), false);
  assert.equal(canRetryPendingMove(pending, { ...base, turnDeadline: null }, "first"), false);
  assert.equal(
    canRetryPendingMove(
      pending,
      { ...base, awaitingTurnReceipt: { seat: "first", deadline: 8_000 } },
      "first",
    ),
    false,
  );
  assert.equal(canRetryPendingMove({ ...pending, retryCount: 1 }, base, "first"), false);
});
