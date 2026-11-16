import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  GAME_ID,
  legalMoves,
  MAX_MOVES,
  parseCheckersState,
} from "../dist/index.js";
import { chooseCheckersMove } from "../dist/ai.js";
import { CHECKERS_DIFFICULTIES } from "../dist/opponents.js";

function emptyState(pieces, nextPlayer = "first", boardSize = 8) {
  const board = Array.from({ length: boardSize }, () => Array(boardSize).fill(null));
  for (const [row, column, seat, king = false] of pieces) board[row][column] = { seat, king };
  return {
    startingPlayer: "first",
    board,
    moves: [],
    nextPlayer,
    outcome: null,
    quietProgressPlies: 0,
    positionHistory: [],
  };
}

function apply(state, seat, from, to) {
  return applyAction(state, seat, { type: "move-piece", from, path: [to] });
}

function applyPath(state, seat, from, path) {
  return applyAction(state, seat, { type: "move-piece", from, path });
}

function play(state, seat, from, to) {
  const result = apply(state, seat, from, to);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.ok ? result.value : state;
}

function internationalKingHistory(plies = 49, extraPieces = []) {
  const firstA = { row: 8, column: 1 };
  const firstB = { row: 7, column: 2 };
  const secondA = { row: 1, column: 2 };
  const secondB = { row: 2, column: 1 };
  let firstAtB = false;
  let secondAtB = false;
  const moves = [];

  for (let index = 0; index < plies; index += 1) {
    const seat = index % 2 === 0 ? "first" : "second";
    const from = seat === "first" ? (firstAtB ? firstB : firstA) : secondAtB ? secondB : secondA;
    const to = seat === "first" ? (firstAtB ? firstA : firstB) : secondAtB ? secondA : secondB;
    moves.push({ seat, from, path: [to], captured: [], promoted: false });
    if (seat === "first") firstAtB = !firstAtB;
    else secondAtB = !secondAtB;
  }

  const pieces = [
    [firstAtB ? firstB.row : firstA.row, firstAtB ? firstB.column : firstA.column, "first", true],
    [8, 5, "first", true],
    [
      secondAtB ? secondB.row : secondA.row,
      secondAtB ? secondB.column : secondA.column,
      "second",
      true,
    ],
    [1, 6, "second", true],
    ...extraPieces,
  ];
  return {
    ...emptyState(pieces, plies % 2 === 0 ? "first" : "second", 10),
    moves,
    positionHistory: [],
    materialDrawLimit: null,
    materialDrawPlies: 0,
  };
}

test("defaults to International Draughts with 20 men per side on a 10 by 10 board", () => {
  const state = createGame("first");
  assert.equal(GAME_ID, "checkers");
  assert.equal(state.board.length, 10);
  assert.equal(state.board.flat().filter(Boolean).length, 40);
  assert.equal(state.board.flat().filter((piece) => piece?.seat === "first").length, 20);
  assert.equal(state.board.flat().filter((piece) => piece?.seat === "second").length, 20);
  assert.equal(legalMoves(state).length, 9);
  assert.ok(legalMoves(state).every((move) => move.path.at(-1).row < move.from.row));
});

test("English/American remains selectable as the 8 by 8 rules version", () => {
  const state = createGame("first", 1);
  assert.equal(state.board.length, 8);
  assert.equal(state.board.flat().filter(Boolean).length, 24);
  assert.equal(legalMoves(state).length, 7);
});

test("starting seat controls red orientation when the series alternates the first move", () => {
  const state = createGame("second", 1);
  assert.equal(state.board.flat().filter((piece) => piece?.seat === "second").length, 12);
  assert.ok(legalMoves(state).every((move) => move.path.at(-1).row < move.from.row));
});

test("International captures both forward and backward and requires the longest route", () => {
  const state = emptyState(
    [
      [6, 1, "first"],
      [5, 2, "second"],
      [3, 4, "second"],
      [6, 7, "first"],
      [5, 8, "second"],
    ],
    "first",
    10,
  );
  const captures = legalMoves(state);
  assert.equal(captures.length, 1);
  assert.deepEqual(captures[0].path, [
    { row: 4, column: 3 },
    { row: 2, column: 5 },
  ]);
  assert.equal(captures[0].captured.length, 2);

  const backward = emptyState(
    [
      [3, 2, "first"],
      [4, 3, "second"],
      [8, 9, "second"],
    ],
    "first",
    10,
  );
  assert.ok(legalMoves(backward).some((move) => move.path.at(-1).row === 5));
});

test("International kings fly when moving and may choose an open landing after a capture", () => {
  const state = emptyState(
    [
      [6, 1, "first", true],
      [4, 3, "second"],
      [0, 9, "second"],
    ],
    "first",
    10,
  );
  const moves = legalMoves(state);
  assert.ok(moves.some((move) => move.path.at(-1).row === 3));
  assert.ok(moves.some((move) => move.path.at(-1).row === 2));
  assert.ok(moves.every((move) => move.captured.length === 1));
});

test("an International man that passes the crown row mid-capture stays a man", () => {
  const state = emptyState(
    [
      [2, 1, "first"],
      [1, 2, "second"],
      [1, 4, "second"],
      [8, 9, "second"],
    ],
    "first",
    10,
  );
  const result = applyPath(state, "first", { row: 2, column: 1 }, [
    { row: 0, column: 3 },
    { row: 2, column: 5 },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.board[2]?.[5]?.king, false);
});

test("International reduced-material draw count survives a capture", () => {
  const state = {
    ...emptyState(
      [
        [1, 2, "first", true],
        [1, 4, "first", true],
        [4, 3, "first"],
        [3, 2, "second", true],
      ],
      "second",
      10,
    ),
    materialDrawLimit: 16,
    materialDrawPlies: 31,
  };
  const result = apply(state, "second", { row: 3, column: 2 }, { row: 5, column: 4 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.outcome, { kind: "draw" });
    assert.equal(result.value.materialDrawLimit, 16);
    assert.equal(result.value.materialDrawPlies, 32);
  }
});

test("International king-only endings draw after 25 moves by each player", () => {
  const state = internationalKingHistory();
  const result = apply(state, "second", { row: 1, column: 2 }, { row: 2, column: 1 });

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.outcome, { kind: "draw" });
});

test("an International man move interrupts the king-only draw count", () => {
  const state = internationalKingHistory(49, [[3, 8, "second"]]);
  const result = apply(state, "second", { row: 3, column: 8 }, { row: 4, column: 7 });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.outcome, null);
});

test("men cannot move backward and all captures are compulsory", () => {
  const state = emptyState([
    [4, 1, "first"],
    [3, 2, "second"],
    [6, 1, "first"],
  ]);
  const backward = apply(state, "first", { row: 4, column: 1 }, { row: 5, column: 0 });
  assert.equal(backward.ok, false);
  assert.deepEqual(
    legalMoves(state).map((move) => [
      move.from.row,
      move.from.column,
      move.path.at(-1).row,
      move.path.at(-1).column,
    ]),
    [[4, 1, 2, 3]],
  );
  assert.equal(apply(state, "first", { row: 6, column: 1 }, { row: 5, column: 2 }).ok, false);
});

test("a multi-jump is one atomic turn and removes all captured pieces at completion", () => {
  const state = emptyState([
    [6, 1, "first"],
    [5, 2, "second"],
    [3, 4, "second"],
    [0, 7, "second"],
    [7, 6, "first"],
  ]);
  const incomplete = apply(state, "first", { row: 6, column: 1 }, { row: 4, column: 3 });
  assert.equal(incomplete.ok, false);
  const complete = applyPath(state, "first", { row: 6, column: 1 }, [
    { row: 4, column: 3 },
    { row: 2, column: 5 },
  ]);
  assert.equal(complete.ok, true);
  if (!complete.ok) return;
  assert.equal(complete.value.moves.length, 1);
  assert.equal(complete.value.moves[0].captured.length, 2);
  assert.equal(complete.value.nextPlayer, "second");
  assert.equal(complete.value.board[5]?.[2], null);
  assert.equal(complete.value.board[3]?.[4], null);
});

test("crowning ends a capture turn, and kings move in both directions", () => {
  const state = emptyState([
    [2, 1, "first"],
    [1, 2, "second"],
    [1, 4, "second"],
    [4, 5, "first", true],
  ]);
  const crown = applyPath(state, "first", { row: 2, column: 1 }, [{ row: 0, column: 3 }]);
  assert.equal(crown.ok, true);
  if (!crown.ok) return;
  assert.equal(crown.value.board[0]?.[3]?.king, true);
  assert.equal(crown.value.nextPlayer, "second");
  const kingMoves = legalMoves(
    { ...state, board: crown.value.board, nextPlayer: "first" },
    "first",
  );
  assert.ok(kingMoves.some((move) => move.path.at(-1).row > move.from.row));
});

test("wins when the opponent has no legal move", () => {
  const state = emptyState([
    [2, 7, "first"],
    [2, 5, "first"],
    [0, 7, "second"],
  ]);
  const result = apply(state, "first", { row: 2, column: 7 }, { row: 1, column: 6 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.outcome, { kind: "win", winner: "first" });
  assert.equal(result.value.nextPlayer, null);
});

test("draws after the same position with the same player to move occurs three times", () => {
  let state = emptyState([
    [5, 0, "first", true],
    [2, 7, "second", true],
  ]);
  const cycle = () => {
    if (state.outcome) return;
    state = play(state, "first", { row: 5, column: 0 }, { row: 4, column: 1 });
    if (state.outcome) return;
    state = play(state, "second", { row: 2, column: 7 }, { row: 3, column: 6 });
    if (state.outcome) return;
    state = play(state, "first", { row: 4, column: 1 }, { row: 5, column: 0 });
    if (state.outcome) return;
    state = play(state, "second", { row: 3, column: 6 }, { row: 2, column: 7 });
  };
  cycle();
  cycle();
  assert.equal(state.outcome, null);
  cycle();
  assert.deepEqual(state.outcome, { kind: "draw" });
});

test("draws after 40 moves by each player without a capture or advancing man", () => {
  const state = {
    ...emptyState([
      [5, 0, "first", true],
      [2, 7, "second", true],
    ]),
    quietProgressPlies: 79,
  };
  const result = apply(state, "first", { row: 5, column: 0 }, { row: 4, column: 1 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.outcome, { kind: "draw" });
});

test("an English/American capture resets the no-progress draw count", () => {
  const state = {
    ...emptyState(
      [
        [5, 0, "first"],
        [4, 1, "second"],
        [0, 7, "second"],
        [7, 0, "first"],
      ],
      "first",
      8,
    ),
    quietProgressPlies: 79,
  };
  const result = applyAction(
    state,
    "first",
    { type: "move-piece", from: { row: 5, column: 0 }, path: [{ row: 3, column: 2 }] },
    1,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.quietProgressPlies, 0);
    assert.equal(result.value.outcome, null);
  }
});

test("an English/American man advance resets the no-progress draw count", () => {
  const state = {
    ...emptyState(
      [
        [5, 0, "first"],
        [0, 7, "second"],
        [7, 2, "first"],
      ],
      "first",
      8,
    ),
    quietProgressPlies: 79,
  };
  const result = applyAction(
    state,
    "first",
    { type: "move-piece", from: { row: 5, column: 0 }, path: [{ row: 4, column: 1 }] },
    1,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.quietProgressPlies, 0);
    assert.equal(result.value.outcome, null);
  }
});

test("an English/American multi-capture that advances several rows resets the draw count", () => {
  const state = {
    ...emptyState(
      [
        [5, 0, "first"],
        [4, 1, "second"],
        [2, 3, "second"],
        [0, 7, "second"],
        [7, 0, "first"],
      ],
      "first",
      8,
    ),
    quietProgressPlies: 79,
  };
  const result = applyPath(state, "first", { row: 5, column: 0 }, [
    { row: 3, column: 2 },
    { row: 1, column: 4 },
  ]);

  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.value.quietProgressPlies, 0);
    assert.equal(result.value.outcome, null);
  }
});

test("the bounded move history ends an extreme-length game as a draw", () => {
  const state = {
    ...emptyState([
      [5, 0, "first", true],
      [2, 7, "second", true],
    ]),
    moves: Array.from({ length: MAX_MOVES - 1 }, () => ({})),
  };
  const result = apply(state, "first", { row: 5, column: 0 }, { row: 4, column: 1 });

  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.value.moves.length, MAX_MOVES);
    assert.deepEqual(result.value.outcome, { kind: "draw" });
  }
});

test("every in-house difficulty chooses a legal move", () => {
  const state = createGame("first");
  for (const [index, profile] of CHECKERS_DIFFICULTIES.entries()) {
    const action = chooseCheckersMove(state, "first", profile.id, index + 31);
    assert.ok(
      legalMoves(state).some(
        (move) =>
          move.from.row === action.from.row &&
          move.from.column === action.from.column &&
          move.path.length === action.path.length &&
          move.path.every(
            (position, index) =>
              position.row === action.path[index].row &&
              position.column === action.path[index].column,
          ),
      ),
    );
  }
});

test("rejects malformed actions and wrong-turn moves", () => {
  const state = createGame("first");
  assert.equal(
    applyAction(state, "second", {
      type: "move-piece",
      from: { row: 5, column: 0 },
      path: [{ row: 4, column: 1 }],
    }).ok,
    false,
  );
  assert.equal(applyAction(state, "first", { type: "drop-token", column: 1 }).ok, false);
});

test("validates persisted state by replaying legal history", () => {
  const state = createGame("first");
  const moved = apply(state, "first", { row: 6, column: 1 }, { row: 5, column: 0 });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const parsed = parseCheckersState(JSON.parse(JSON.stringify(moved.value)));
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.issues));
  const forged = { ...moved.value, board: state.board };
  assert.equal(parseCheckersState(forged).ok, false);
});
