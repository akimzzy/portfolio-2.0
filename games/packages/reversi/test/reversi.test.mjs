import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  createGame,
  legalMoves,
  parseReversiState,
  reversiRuntime,
} from "../dist/index.js";
import { chooseReversiMove } from "../dist/ai.js";
import { REVERSI_OPPONENTS } from "../dist/opponents.js";

test("starts with the standard four discs and four legal moves for dark", () => {
  const state = createGame("first");
  assert.equal(state.board.flat().filter(Boolean).length, 4);
  assert.deepEqual(
    legalMoves(state, "first").map(({ row, column }) => [row, column]),
    [
      [2, 3],
      [3, 2],
      [4, 5],
      [5, 4],
    ],
  );
  assert.equal(state.board[3][3], "second");
  assert.equal(state.board[3][4], "first");
  assert.equal(state.nextPlayer, "first");
});

test("places only legal discs, flips bracketed lines, and rejects forged or late moves", () => {
  const initial = createGame("second");
  assert.deepEqual(applyAction(initial, "second", { type: "place-disc", row: 0, column: 0 }), {
    ok: false,
    error: { code: "not-legal" },
  });
  const placed = applyAction(initial, "second", { type: "place-disc", row: 2, column: 3 });
  assert.equal(placed.ok, true);
  assert.equal(placed.value.board[3][3], "second");
  assert.equal(placed.value.board[2][3], "second");
  assert.equal(placed.value.nextPlayer, "first");
  assert.equal(
    applyAction(placed.value, "second", { type: "place-disc", row: 2, column: 4 }).ok,
    false,
  );
  assert.equal(
    applyAction(placed.value, "first", { type: "place-disc", row: 3, column: 2, extra: true }).ok,
    false,
  );
});

test("replays legal history and models forced passes without adding a fake move", () => {
  let passedState = null;
  let terminalState = null;
  for (let seed = 1; seed <= 32 && !passedState; seed += 1) {
    let state = createGame(seed % 2 === 0 ? "first" : "second");
    while (state.outcome === null) {
      const moves = legalMoves(state, state.nextPlayer);
      assert.ok(
        moves.length > 0,
        "a non-terminal state always has a legal move for the active seat",
      );
      const mover = state.nextPlayer;
      const next = applyAction(
        state,
        mover,
        moves[(Math.imul(seed + state.moves.length, 2654435761) >>> 0) % moves.length],
      );
      assert.equal(next.ok, true);
      state = next.value;
      if (state.nextPlayer === mover && state.outcome === null) passedState ??= state;
    }
    terminalState = state;
  }
  assert.ok(passedState, "the deterministic game set should exercise forced passes");
  assert.equal(passedState.skippedSeat, passedState.nextPlayer === "first" ? "second" : "first");
  assert.equal(parseReversiState(passedState).ok, true);
  assert.equal(parseReversiState({ ...passedState, skippedSeat: null }).ok, false);
  assert.equal(terminalState.moves.length <= 60, true);
  assert.ok(terminalState.outcome?.kind === "win" || terminalState.outcome?.kind === "draw");
  assert.equal(parseReversiState(terminalState).ok, true);
  assert.equal(legalMoves(terminalState, "first").length, 0);
  assert.equal(legalMoves(terminalState, "second").length, 0);
  assert.equal(parseReversiState({ ...terminalState, outcome: null }).ok, false);
  assert.equal(
    parseReversiState({
      ...terminalState,
      moves: [...terminalState.moves, { seat: "first", row: 0, column: 0 }],
    }).ok,
    false,
  );
});

test("a forced-pass notice survives the other seat’s bonus move until the skipped seat moves", () => {
  let state = null;
  let skippedSeat = null;
  for (let seed = 1; seed <= 32 && !state; seed += 1) {
    let candidate = createGame(seed % 2 === 0 ? "first" : "second");
    while (candidate.outcome === null) {
      const currentSeat = candidate.nextPlayer;
      const options = legalMoves(candidate, currentSeat);
      const index = (Math.imul(seed + candidate.moves.length, 2654435761) >>> 0) % options.length;
      const result = applyAction(candidate, currentSeat, options[index]);
      assert.equal(result.ok, true);
      candidate = result.value;
      if (candidate.skippedSeat && candidate.nextPlayer !== candidate.skippedSeat) {
        state = candidate;
        skippedSeat = candidate.skippedSeat;
        break;
      }
    }
  }
  assert.ok(state && skippedSeat, "the deterministic game set should produce a forced pass");
  const bonusSeat = state.nextPlayer;
  assert.notEqual(bonusSeat, skippedSeat);
  const bonusMoves = legalMoves(state, bonusSeat);
  const bonus = bonusMoves
    .map((action) => applyAction(state, bonusSeat, action))
    .find(
      (result) =>
        result.ok && result.value.outcome === null && result.value.nextPlayer === skippedSeat,
    );
  assert.ok(bonus, "one legal continuation should return play to the skipped seat");
  assert.equal(bonus.value.skippedSeat, skippedSeat);
  assert.equal(parseReversiState(bonus.value).ok, true);

  const resumed = applyAction(bonus.value, skippedSeat, legalMoves(bonus.value, skippedSeat)[0]);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.value.skippedSeat === skippedSeat, false);
  assert.equal(parseReversiState(resumed.value).ok, true);
});

test("look-ahead profiles maximize their own continuation after forcing an opponent pass", () => {
  const seed = 11;
  let state = createGame("first");
  while (!state.skippedSeat || state.nextPlayer === state.skippedSeat) {
    const seat = state.nextPlayer;
    const options = legalMoves(state, seat);
    const index = (Math.imul(seed + state.moves.length, 2654435761) >>> 0) % options.length;
    const result = applyAction(state, seat, options[index]);
    assert.equal(result.ok, true);
    state = result.value;
    assert.ok(
      state.moves.length < 60,
      "fixture should reach a forced-pass position before the game ends",
    );
  }
  assert.equal(state.nextPlayer, "first");
  assert.equal(state.skippedSeat, "second");
  // On this position, minimizing the AI's own bonus moves picks the exposed
  // corner at (0, 0); correctly maximizing the continuation chooses (0, 4).
  assert.deepEqual(chooseReversiMove(state, "first", "expert", seed), {
    type: "place-disc",
    row: 0,
    column: 4,
  });
});

test("all opponent profiles select a legal action and the runtime adapter exposes last-move attribution", () => {
  const state = createGame("second");
  for (const profile of REVERSI_OPPONENTS) {
    const action = chooseReversiMove(state, "second", profile.id, 12345);
    assert.ok(
      legalMoves(state, "second").some(
        (move) => move.row === action.row && move.column === action.column,
      ),
    );
  }
  const move = applyAction(state, "second", { type: "place-disc", row: 2, column: 3 });
  assert.equal(move.ok, true);
  const inspected = reversiRuntime.inspectState(move.value, 1);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.value.lastActionPlayer, "second");
  assert.equal(reversiRuntime.getSessionPolicy(1).turnDurationMs, 45_000);
});
