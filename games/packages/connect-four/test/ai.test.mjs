import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame } from '@portfolio-games/connect-four';
import { chooseConnectFourMove, chooseConnectFourMoveForVersion, supportsConnectFourAiEngineVersion } from '@portfolio-games/connect-four/ai';
import { CONNECT_FOUR_OPPONENTS } from '@portfolio-games/connect-four/opponents';

function play(columns, startingPlayer = 'first') {
  let state = createGame(startingPlayer);
  for (const column of columns) {
    const next = applyAction(state, state.nextPlayer, { type: 'drop-token', column });
    assert.equal(next.ok, true);
    state = next.value;
  }
  return state;
}

test('every opponent returns a legal deterministic opening move', () => {
  const state = createGame('first');
  for (const profile of CONNECT_FOUR_OPPONENTS) {
    const first = chooseConnectFourMove(state, 'first', profile.id, 12345);
    assert.ok(Number.isInteger(first) && first >= 0 && first < 7);
    assert.equal(chooseConnectFourMove(state, 'first', profile.id, 12345), first);
  }
});

test('all profiles continue to return legal actions across reproducible midgame states', () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    let state = createGame(seed % 2 === 0 ? 'first' : 'second');
    let random = seed;
    for (let ply = 0; ply < 18 && state.outcome === null; ply += 1) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const legal = Array.from({ length: 7 }, (_, column) => column).filter((column) => state.board[0][column] === null);
      if (legal.length === 0) break;
      const column = legal[random % legal.length];
      const applied = applyAction(state, state.nextPlayer, { type: 'drop-token', column });
      assert.equal(applied.ok, true);
      state = applied.value;
    }
    if (state.outcome !== null) continue;
    for (const profile of CONNECT_FOUR_OPPONENTS) {
      const column = chooseConnectFourMove(state, state.nextPlayer, profile.id, seed);
      const applied = applyAction(state, state.nextPlayer, { type: 'drop-token', column });
      assert.equal(applied.ok, true, `${profile.id} chose illegal column ${column} at seed ${seed}`);
    }
  }
});

test('persisted AI engine versions resolve explicitly and reject unknown versions', () => {
  const state = createGame('first');
  assert.equal(supportsConnectFourAiEngineVersion(1), true);
  assert.equal(supportsConnectFourAiEngineVersion(2), false);
  assert.equal(chooseConnectFourMoveForVersion(state, 'first', 'standard', 1, 1), chooseConnectFourMove(state, 'first', 'standard', 1));
  assert.throws(() => chooseConnectFourMoveForVersion(state, 'first', 'standard', 1, 2), /Unsupported Connect Four AI engine version/);
});

test('all profiles take a direct win before strategic preference', () => {
  const state = play([0, 6, 1, 6, 2, 5]);
  assert.equal(state.nextPlayer, 'first');
  for (const profile of CONNECT_FOUR_OPPONENTS) {
    assert.equal(chooseConnectFourMove(state, 'first', profile.id, 9), 3);
  }
});

test('all profiles block an immediate opponent win when one safe block exists', () => {
  const state = play([0, 6, 1, 6, 2]);
  assert.equal(state.nextPlayer, 'second');
  for (const profile of CONNECT_FOUR_OPPONENTS) {
    assert.equal(chooseConnectFourMove(state, 'second', profile.id, 19), 3);
  }
});

test('profiles make legal choices from a mixed midgame board', () => {
  const state = play([3, 2, 4, 3, 2, 4, 1, 5, 0, 6, 3, 2]);
  for (const profile of CONNECT_FOUR_OPPONENTS) {
    const column = chooseConnectFourMove(state, state.nextPlayer, profile.id, 0x12345678);
    assert.ok(column >= 0 && column < 7);
    assert.ok(state.board[0][column] === null);
  }
});

test('profile weighting changes the choice in an ambiguous midgame position', () => {
  const state = play([1, 4, 0, 3, 6, 3, 4, 0, 6, 4, 0, 6, 1, 3, 4, 2, 4, 4]);
  assert.equal(state.outcome, null);
  const standard = chooseConnectFourMove(state, state.nextPlayer, 'standard', 2);
  const expert = chooseConnectFourMove(state, state.nextPlayer, 'expert', 2);
  assert.notEqual(expert, standard);
});
