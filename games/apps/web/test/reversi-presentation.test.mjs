import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, createGame, legalMoves } from "../../../packages/reversi/dist/index.js";
import {
  countReversiDiscs,
  isHiddenAiMoveCell,
  reversiDiscColor,
  stateBeforeLatestMoveSequence,
} from "../src/features/match/games/reversi/presentation.ts";

test("disc colors follow the starting seat whichever seat starts", () => {
  assert.equal(reversiDiscColor("first", "first"), "dark");
  assert.equal(reversiDiscColor("second", "first"), "light");
  assert.equal(reversiDiscColor("first", "second"), "light");
  assert.equal(reversiDiscColor("second", "second"), "dark");
});

test("the actual game state assigns dark to either starting seat consistently", () => {
  for (const starter of ["first", "second"]) {
    const state = createGame(starter);
    assert.equal(state.startingPlayer, starter);
    assert.equal(state.nextPlayer, starter);
    assert.equal(reversiDiscColor(state.board[3][4], starter), "dark");
    assert.equal(reversiDiscColor(state.board[3][3], starter), "light");
    assert.deepEqual(countReversiDiscs(state.board, starter), { dark: 2, light: 2 });
  }
});

test("board score counts match the rendered disc colors when seat two starts", () => {
  const board = [
    ["second", "first", "second", "first"],
    ["second", "second", "first", "second", "second", "first"],
  ];
  assert.deepEqual(countReversiDiscs(board, "second"), { dark: 6, light: 4 });
});

test("a first server snapshot can replay its opening move from the initial board", () => {
  const initial = createGame("second");
  const action = legalMoves(initial, "second")[0];
  assert.ok(action);
  const opening = applyAction(initial, "second", action);
  assert.equal(opening.ok, true);
  if (!opening.ok) return;

  const beforeLatest = stateBeforeLatestMoveSequence(opening.value);
  assert.deepEqual(beforeLatest, initial);
  const move = opening.value.moves.at(-1);
  assert.ok(move);
  const replayed = applyAction(beforeLatest, move.seat, {
    type: "place-disc",
    row: move.row,
    column: move.column,
  });
  assert.deepEqual(replayed, opening);
});

test("a hydrated board replays only the latest move, with earlier flips already applied", () => {
  let state = createGame("first");
  for (let count = 0; count < 3; count += 1) {
    const move = legalMoves(state, state.nextPlayer)[0];
    assert.ok(move);
    const result = applyAction(state, state.nextPlayer, move);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    state = result.value;
  }

  const beforeLatest = stateBeforeLatestMoveSequence(state);
  assert.ok(beforeLatest);
  assert.equal(beforeLatest.moves.length, state.moves.length - 1);
  const latest = state.moves.at(-1);
  assert.ok(latest);
  const replayed = applyAction(beforeLatest, latest.seat, {
    type: "place-disc",
    row: latest.row,
    column: latest.column,
  });
  assert.deepEqual(replayed, { ok: true, value: state });
});

test("a hydrated snapshot replays every consecutive move after a forced pass", () => {
  let state = createGame("first");
  while (state.nextPlayer && state.moves.length < 60) {
    const move = legalMoves(state, state.nextPlayer)[0];
    assert.ok(move);
    const result = applyAction(state, state.nextPlayer, move);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    state = result.value;
    const moves = state.moves;
    if (moves.length < 2 || moves.at(-1)?.seat !== moves.at(-2)?.seat) continue;

    const beforeSequence = stateBeforeLatestMoveSequence(state);
    assert.ok(beforeSequence);
    assert.equal(beforeSequence.moves.length, moves.length - 2);

    let replayed = beforeSequence;
    for (const moveInSequence of moves.slice(-2)) {
      const step = applyAction(replayed, replayed.nextPlayer, {
        type: "place-disc",
        row: moveInSequence.row,
        column: moveInSequence.column,
      });
      assert.equal(step.ok, true);
      if (!step.ok) return;
      replayed = step.value;
    }
    assert.deepEqual(replayed, state);
    assert.equal(state.skippedSeat, "first");
    return;
  }
  assert.fail("Expected the deterministic legal-move sequence to contain a forced pass.");
});

test("an unrevealed AI move hides only its own square after a forced pass", () => {
  const previousAiMove = { seat: "second", row: 2, column: 3 };
  const latestAiMove = { seat: "second", row: 4, column: 5 };

  assert.equal(isHiddenAiMoveCell(true, "second", latestAiMove, 4, 5), true);
  assert.equal(isHiddenAiMoveCell(true, "second", latestAiMove, 2, 3), false);
  assert.equal(isHiddenAiMoveCell(false, "second", latestAiMove, 4, 5), false);
  assert.equal(isHiddenAiMoveCell(true, "first", latestAiMove, 4, 5), false);
  assert.equal(isHiddenAiMoveCell(true, "second", previousAiMove, 4, 5), false);
});
