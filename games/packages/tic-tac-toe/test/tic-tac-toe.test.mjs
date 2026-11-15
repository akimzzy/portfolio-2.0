import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_ID,
  RULES_VERSION,
  applyAction,
  createGame,
  parsePlaceMarkAction,
  parseTicTacToeCommand,
  parseTicTacToeState,
  parseTicTacToeStateMessage,
} from "@portfolio-games/tic-tac-toe";
import { chooseTicTacToeMove } from "@portfolio-games/tic-tac-toe/ai";
import { TIC_TAC_TOE_DIFFICULTIES } from "@portfolio-games/tic-tac-toe/opponents";

const place = (row, column) => ({ type: "place-mark", row, column });
const wire = () => ({
  protocolVersion: 1,
  gameId: GAME_ID,
  rulesVersion: RULES_VERSION,
  matchId: "match-123",
});

function play(moves, startingPlayer = "first") {
  let state = createGame(startingPlayer);
  for (const [row, column] of moves) {
    const result = applyAction(state, state.nextPlayer, place(row, column));
    assert.equal(result.ok, true, `Move ${state.moves.length + 1} failed at ${row},${column}`);
    state = result.value;
  }
  return state;
}

test("starts with a fresh immutable board for either starting seat", () => {
  for (const startingPlayer of ["first", "second"]) {
    const state = createGame(startingPlayer);
    assert.equal(state.board.length, 3);
    assert.ok(state.board.every((row) => row.length === 3 && row.every((cell) => cell === null)));
    assert.equal(state.nextPlayer, startingPlayer);
    assert.equal(state.outcome, null);
    assert.deepEqual(state.moves, []);
    assert.notEqual(state.board[0], state.board[1]);
    assert.ok(Object.isFrozen(state) && Object.isFrozen(state.board));
    assert.ok(state.board.every(Object.isFrozen));
  }
  assert.throws(() => createGame("invalid"), TypeError);
});

test("places marks legally, alternates turns, and preserves earlier states", () => {
  const initial = createGame("first");
  const first = applyAction(initial, "first", place(1, 1));
  assert.equal(first.ok, true);
  assert.equal(first.value.board[1][1], "first");
  assert.equal(first.value.nextPlayer, "second");
  assert.equal(initial.board[1][1], null);
  assert.deepEqual(initial.moves, []);
  assert.ok(Object.isFrozen(first.value.moves[0]));
});

test("rejects wrong turns, occupied squares, malformed actions, and moves after conclusion", () => {
  const initial = createGame("first");
  assert.equal(applyAction(initial, "second", place(0, 0)).error.code, "wrong-turn");
  assert.equal(applyAction(initial, "first", { type: "place-mark", row: 3, column: 0 }).ok, false);
  assert.equal(applyAction(initial, "first", place(0, 0)).ok, true);
  const occupied = applyAction(initial, "first", place(0, 0)).value;
  assert.equal(applyAction(occupied, "second", place(0, 0)).error.code, "occupied");
  assert.equal(parsePlaceMarkAction({ ...place(0, 0), seat: "second" }).ok, false);
  assert.equal(parsePlaceMarkAction({ type: "drop-token", row: 0, column: 0 }).ok, false);

  const won = play([
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
  ]);
  assert.equal(applyAction(won, "second", place(2, 2)).error.code, "match-finished");
});

for (const [name, moves, winner] of [
  [
    "horizontal",
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
    "first",
  ],
  [
    "vertical",
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
    ],
    "first",
  ],
  [
    "diagonal",
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [2, 2],
    ],
    "first",
  ],
  [
    "anti-diagonal",
    [
      [0, 2],
      [0, 1],
      [1, 1],
      [1, 0],
      [2, 0],
    ],
    "first",
  ],
]) {
  test(`detects ${name} wins and ends the turn sequence`, () => {
    const state = play(moves);
    assert.deepEqual(state.outcome, { kind: "win", winner });
    assert.equal(state.nextPlayer, null);
    assert.equal(parseTicTacToeState(JSON.parse(JSON.stringify(state))).ok, true);
  });
}

test("declares a draw only after all nine squares fill without a winning line", () => {
  const state = play([
    [0, 0],
    [1, 1],
    [0, 1],
    [0, 2],
    [2, 0],
    [1, 0],
    [1, 2],
    [2, 1],
    [2, 2],
  ]);
  assert.deepEqual(state.outcome, { kind: "draw" });
  assert.equal(state.nextPlayer, null);
  assert.equal(state.moves.length, 9);
});

test("state parsing reconstructs legal histories and rejects mismatched snapshots", () => {
  const state = play([
    [0, 0],
    [1, 1],
    [0, 1],
  ]);
  const serialized = JSON.parse(JSON.stringify(state));
  assert.deepEqual(parseTicTacToeState(serialized).value, state);

  const wrongBoard = structuredClone(serialized);
  wrongBoard.board[2][2] = "first";
  const wrongTurn = { ...serialized, nextPlayer: "first" };
  const wrongOutcome = { ...serialized, outcome: { kind: "win", winner: "first" } };
  const invalidMove = structuredClone(serialized);
  invalidMove.moves[1].row = 4;
  for (const invalid of [
    wrongBoard,
    wrongTurn,
    wrongOutcome,
    invalidMove,
    { ...serialized, extra: true },
  ])
    assert.equal(parseTicTacToeState(invalid).ok, false);
});

test("command and state-message boundaries pin protocol, game, and rules versions", () => {
  const command = {
    ...wire(),
    type: "submit-action",
    actionId: "action-1",
    expectedRevision: 0,
    action: place(2, 1),
  };
  assert.equal(parseTicTacToeCommand(command).ok, true);
  assert.equal(parseTicTacToeCommand({ ...command, gameId: "reversi" }).ok, false);
  assert.equal(parseTicTacToeCommand({ ...command, rulesVersion: 2 }).ok, false);

  const message = {
    ...wire(),
    type: "match-state",
    revision: 1,
    state: play([[2, 1]]),
  };
  assert.equal(parseTicTacToeStateMessage(JSON.parse(JSON.stringify(message))).ok, true);
  assert.equal(parseTicTacToeStateMessage({ ...message, protocolVersion: 2 }).ok, false);
});

test("every difficulty returns a legal, reproducible move and takes an immediate win", () => {
  const opening = createGame("first");
  for (const profile of TIC_TAC_TOE_DIFFICULTIES) {
    const move = chooseTicTacToeMove(opening, "first", profile.id, 12345);
    assert.equal(parsePlaceMarkAction(move).ok, true);
    assert.deepEqual(chooseTicTacToeMove(opening, "first", profile.id, 12345), move);
  }

  const winningState = play([
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]);
  for (const profile of TIC_TAC_TOE_DIFFICULTIES) {
    assert.deepEqual(chooseTicTacToeMove(winningState, "first", profile.id, 7), place(0, 2));
  }
});

test("medium and stronger profiles block a direct opponent win", () => {
  const threat = play([
    [0, 0],
    [1, 0],
    [0, 1],
  ]);
  for (const difficulty of ["medium", "hard", "very-hard"]) {
    assert.deepEqual(chooseTicTacToeMove(threat, "second", difficulty, 42), place(0, 2));
  }
});

test("harder search treats symmetric boards as equivalent without changing legality", () => {
  const state = play([
    [0, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ]);
  for (const difficulty of ["hard", "very-hard"]) {
    const action = chooseTicTacToeMove(state, state.nextPlayer, difficulty, 9);
    assert.equal(parsePlaceMarkAction(action).ok, true);
    assert.equal(state.board[action.row][action.column], null);
  }
});
