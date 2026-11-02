import assert from "node:assert/strict";
import test from "node:test";
import {
  COLUMNS, ROWS, GAME_ID, RULES_VERSION, applyAction, connectFour, createGame,
  hasPossibleConnectFour, parseConnectFourCommand, parseConnectFourState, parseConnectFourStateMessage, parseDropTokenAction,
} from "@portfolio-games/connect-four";

const drop = (column) => ({ type: "drop-token", column });
function play(columns, startingPlayer = "first", rulesVersion = RULES_VERSION) {
  let state = createGame(startingPlayer);
  for (const column of columns) {
    const result = applyAction(state, state.nextPlayer, drop(column), rulesVersion);
    assert.equal(result.ok, true, `Move ${state.moves.length + 1} in column ${column} failed`);
    state = result.value;
  }
  return state;
}
const wire = () => ({ protocolVersion: 1, gameId: GAME_ID, rulesVersion: RULES_VERSION, matchId: "match-1" });

test("starts with independent empty boards and caller-selected starting seats", () => {
  for (const startingPlayer of ["first", "second"]) {
    const state = createGame(startingPlayer);
    assert.equal(state.board.length, ROWS);
    assert.ok(state.board.every((row) => row.length === COLUMNS && row.every((cell) => cell === null)));
    assert.equal(state.nextPlayer, startingPlayer);
    assert.equal(state.outcome, null);
    assert.deepEqual(state.moves, []);
    assert.notEqual(state.board[0], state.board[1]);
  }
  assert.throws(() => createGame("invalid"), TypeError);
});

test("tokens fall to the lowest cell and turns alternate", () => {
  const state = play([3, 3, 3]);
  assert.equal(state.board[5][3], "first");
  assert.equal(state.board[4][3], "second");
  assert.equal(state.board[3][3], "first");
  assert.equal(state.board[2][3], null);
  assert.equal(state.nextPlayer, "second");
});

test("moves preserve prior states and freeze all returned state data", () => {
  const previous = createGame("first");
  const next = applyAction(previous, "first", drop(0)).value;
  assert.equal(previous.board[5][0], null);
  assert.deepEqual(previous.moves, []);
  assert.notEqual(next.board, previous.board);
  assert.ok(Object.isFrozen(next) && Object.isFrozen(next.moves));
  assert.ok(next.board.every(Object.isFrozen));
  assert.throws(() => { next.board[5][0] = "second"; }, TypeError);
  assert.throws(() => { next.moves.push(1); }, TypeError);
});

test("rejects wrong players, malformed actions, and full columns without consuming a turn", () => {
  const state = play([0, 0, 0, 0, 0, 0]);
  const original = JSON.stringify(state);
  assert.equal(applyAction(state, "second", drop(1)).error.code, "wrong-turn");
  assert.equal(applyAction(state, "invalid", drop(1)).error.code, "invalid-player");
  assert.equal(applyAction(state, "first", drop(0)).error.code, "column-full");
  assert.equal(applyAction(state, "first", drop(7)).error.code, "invalid-action");
  assert.equal(JSON.stringify(state), original);
  assert.equal(applyAction(state, "first", drop(1)).ok, true);
});

for (const column of [-1, 7, 0.1, "1", NaN, Infinity, undefined, null]) {
  test(`rejects column ${String(column)}`, () => assert.equal(parseDropTokenAction(drop(column)).ok, false));
}

test("rejects extra action properties and unknown action types", () => {
  for (const value of [null, [], {}, { ...drop(0), winner: "first" }, { type: "pop-token", column: 0 }]) {
    assert.equal(parseDropTokenAction(value).ok, false);
  }
});

for (const [name, columns, winner] of [
  ["horizontal", [0, 0, 1, 1, 2, 2, 3], "first"],
  ["vertical", [0, 1, 0, 1, 0, 1, 0], "first"],
  ["second-player vertical", [0, 1, 0, 1, 2, 1, 2, 1], "second"],
  ["rising diagonal", [0, 1, 1, 2, 3, 2, 2, 3, 4, 3, 3], "first"],
  ["falling diagonal", [6, 5, 5, 4, 3, 4, 4, 3, 2, 3, 3], "first"],
  ["five-token connection", [0, 6, 1, 6, 3, 5, 4, 5, 2], "first"],
]) {
  test(`detects ${name} wins and prevents further moves`, () => {
    const before = play(columns.slice(0, -1));
    assert.equal(before.outcome, null);
    const state = play(columns);
    assert.deepEqual(state.outcome, { kind: "win", winner });
    assert.equal(state.nextPlayer, null);
    assert.ok(Object.isFrozen(state.outcome));
    assert.equal(applyAction(state, winner, drop(0)).error.code, "match-finished");
    assert.equal(parseConnectFourState(JSON.parse(JSON.stringify(state))).ok, true);
  });
}

test("winning works when the second seat starts", () => {
  assert.deepEqual(play([0, 0, 1, 1, 2, 2, 3], "second").outcome, { kind: "win", winner: "second" });
});

const DRAW = [4, 4, 1, 2, 6, 4, 3, 6, 0, 2, 1, 2, 6, 0, 3, 3, 4, 0, 6, 6, 3,
  0, 0, 3, 0, 6, 1, 4, 3, 5, 5, 1, 2, 1, 5, 5, 5, 4, 2, 5, 2, 1];
test("legacy rules keep full-board draws for already-running matches", () => {
  assert.equal(play(DRAW.slice(0, -1), "first", 1).outcome, null);
  const state = play(DRAW, "first", 1);
  assert.deepEqual(state.outcome, { kind: "draw" });
  assert.equal(state.nextPlayer, null);
  assert.ok(state.board.every((row) => row.every((cell) => cell !== null)));
  assert.equal(applyAction(state, "first", drop(0)).error.code, "match-finished");
  assert.deepEqual(parseConnectFourState(JSON.parse(JSON.stringify(state))).value, state);
});

test("ends a game as a draw when every remaining four-cell line is blocked", () => {
  const columns = [0, 4, 5, 1, 3, 3, 6, 4, 0, 0, 0, 0, 3, 3, 3, 3, 1, 2, 4, 0,
    5, 1, 1, 2, 6, 5, 6, 6, 2, 6, 4, 6, 5, 4, 2, 1, 5, 4, 1, 2, 5];
  const before = play(columns.slice(0, -1));
  assert.equal(before.moves.length, 40);
  assert.equal(hasPossibleConnectFour(before.board), true);
  const state = play(columns);
  assert.equal(state.moves.length, 41);
  assert.deepEqual(state.outcome, { kind: "draw" });
  assert.equal(state.nextPlayer, null);
  assert.equal(hasPossibleConnectFour(state.board), false);
  for (let row = 0; row < ROWS; row++) for (let column = 0; column < COLUMNS; column++) {
    if (state.board[row][column] !== null) continue;
    for (const seat of ["first", "second"]) {
      const nextBoard = state.board.map((line) => [...line]);
      nextBoard[row][column] = seat;
      assert.equal(hasPossibleConnectFour(nextBoard), false, `a ${seat} token cannot reopen a blocked line`);
    }
  }
  assert.deepEqual(parseConnectFourState(JSON.parse(JSON.stringify(state))).value, state);
  assert.equal(play(columns, "first", 1).outcome, null);
  assert.equal(parseConnectFourState(JSON.parse(JSON.stringify(play(columns, "first", 1))), 1).ok, true);
  assert.equal(parseConnectFourState(JSON.parse(JSON.stringify(play(columns, "first", 1)))).ok, false);
});

test("a win on the 42nd move takes precedence over a full-board draw", () => {
  const columns = [4, 5, 3, 6, 2, 2, 2, 6, 3, 4, 5, 0, 3, 2, 6, 2, 6, 4, 6, 3, 4,
    3, 2, 0, 5, 0, 3, 6, 0, 4, 4, 1, 1, 5, 5, 0, 1, 5, 0, 1, 1, 1];
  assert.equal(play(columns.slice(0, -1)).outcome, null);
  const state = play(columns);
  assert.equal(state.moves.length, 42);
  assert.deepEqual(state.outcome, { kind: "win", winner: "second" });
});

test("restores only snapshots consistent with a legal, bounded move history", () => {
  const state = play([0, 1, 0]);
  assert.deepEqual(parseConnectFourState(JSON.parse(JSON.stringify(state))).value, state);
  const clone = () => JSON.parse(JSON.stringify(state));
  const wrongBoard = clone(); wrongBoard.board[0][0] = "first";
  const wrongTurn = clone(); wrongTurn.nextPlayer = "first";
  const wrongWinner = clone(); wrongWinner.outcome = { kind: "win", winner: "first" };
  const badMoves = clone(); badMoves.moves = [7];
  const fullColumn = clone(); fullColumn.moves = Array(7).fill(0);
  const tooManyMoves = clone(); tooManyMoves.moves = Array(43).fill(0);
  const afterWin = JSON.parse(JSON.stringify(play([0, 1, 0, 1, 0, 1, 0]))); afterWin.moves.push(2);
  const missingOutcome = JSON.parse(JSON.stringify(play(DRAW))); missingOutcome.outcome = null;
  const badSize = clone(); badSize.board.pop();
  for (const value of [wrongBoard, wrongTurn, wrongWinner, badMoves, fullColumn, tooManyMoves,
    afterWin, missingOutcome, badSize, { ...clone(), extra: true }, null, {},
  ]) assert.equal(parseConnectFourState(value).ok, false);
});

test("Connect Four command boundary pins game/rules versions and rejects player impersonation fields", () => {
  const input = { ...wire(), type: "submit-action", actionId: "action-1", expectedRevision: 0, action: drop(2) };
  assert.equal(parseConnectFourCommand(input).ok, true);
  for (const value of [{ ...input, gameId: "other-game" }, { ...input, rulesVersion: RULES_VERSION + 1 },
    { ...input, protocolVersion: 2 }, { ...input, player: "first" },
  ]) assert.equal(parseConnectFourCommand(value).ok, false);
  const bad = parseConnectFourCommand({ ...input, action: drop(-1) });
  assert.equal(bad.issues[0].path, "action.column");
  assert.equal(parseConnectFourCommand({ ...input, rulesVersion: RULES_VERSION + 1 }).issues[0].path, "rulesVersion");
  assert.equal(parseConnectFourCommand({ ...input, rulesVersion: 1 }, 1).ok, true);
  assert.equal(parseConnectFourCommand({ ...input, rulesVersion: 1 }).ok, false);
});

test("state messages pin versions and reconstruct frozen validated state", () => {
  const input = { ...wire(), type: "match-state", revision: 3, state: play([0, 1, 0]) };
  assert.deepEqual(parseConnectFourStateMessage(JSON.parse(JSON.stringify(input))).value, input);
  assert.equal(parseConnectFourStateMessage({ ...input, rulesVersion: RULES_VERSION + 1 }).ok, false);
  assert.equal(parseConnectFourStateMessage({ ...input, state: {} }).ok, false);
});

test("game module exposes rules through the shared two-player contract", () => {
  const state = connectFour.createState("first");
  assert.equal(connectFour.gameId, "connect-four");
  assert.equal(connectFour.getNextPlayer(state), "first");
  assert.equal(connectFour.getOutcome(state), null);
  assert.equal(connectFour.parseAction(drop(0)).ok, true);
  assert.equal(connectFour.parseState(state).ok, true);
  assert.equal(connectFour.applyAction(state, "first", drop(0)).ok, true);
});

// Independent board-wide oracle checks generated legal games, rather than
// repeating the production algorithm that counts from the latest placed token.
function winnerOnBoard(board) {
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLUMNS; col++) {
    const player = board[row][col];
    if (player === null) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      if ([0, 1, 2, 3].every((n) => board[row + n * dr]?.[col + n * dc] === player)) return player;
    }
  }
  return null;
}

function hasOpenWinningLine(board) {
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLUMNS; col++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = Array.from({ length: 4 }, (_, n) => board[row + n * dr]?.[col + n * dc]);
      if (cells.some((cell) => cell === undefined)) continue;
      if (!(cells.includes('first') && cells.includes('second'))) return true;
    }
  }
  return false;
}

test("200 reproducible legal games preserve counts, gravity, and independently checked outcomes", () => {
  let seed = 12345;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let game = 0; game < 200; game++) {
    let state = createGame(game % 2 === 0 ? "first" : "second");
    while (state.outcome === null) {
      const available = Array.from({ length: COLUMNS }, (_, col) => col).filter((col) => state.board[0][col] === null);
      const column = available[random() % available.length];
      const result = applyAction(state, state.nextPlayer, drop(column));
      assert.equal(result.ok, true);
      state = result.value;
      assert.equal(state.board.flat().filter((cell) => cell !== null).length, state.moves.length);
      assert.ok(state.moves.length <= ROWS * COLUMNS);
      const winner = winnerOnBoard(state.board);
      if (winner) assert.deepEqual(state.outcome, { kind: "win", winner });
      else if (state.moves.length === ROWS * COLUMNS || !hasOpenWinningLine(state.board)) assert.deepEqual(state.outcome, { kind: "draw" });
      else assert.equal(state.outcome, null);
      for (let col = 0; col < COLUMNS; col++) for (let row = 0; row < ROWS - 1; row++) {
        if (state.board[row][col] !== null) assert.notEqual(state.board[row + 1][col], null);
      }
    }
    assert.deepEqual(parseConnectFourState(JSON.parse(JSON.stringify(state))).value, state);
  }
});
