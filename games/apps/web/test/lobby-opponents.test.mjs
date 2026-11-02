import assert from 'node:assert/strict';
import test from 'node:test';
import { inHouseMatchCount } from '../src/features/lobby/lobby-opponents.ts';
import { opponentProfilesForLobby } from '../src/games/opponents.ts';

test('in-house choices fill the lobby target while retaining at least four choices', () => {
  assert.equal(inHouseMatchCount(0, true), 10);
  assert.equal(inHouseMatchCount(4, true), 6);
  assert.equal(inHouseMatchCount(7, true), 4);
  assert.equal(inHouseMatchCount(40, true), 4);
  assert.equal(inHouseMatchCount(0, false), 0);
});

test('lobby opponent profiles follow the selected game registry', () => {
  assert.ok(opponentProfilesForLobby('all').length > 0);
  assert.ok(opponentProfilesForLobby('connect-four').every((profile) => profile.gameId === 'connect-four'));
  assert.deepEqual(opponentProfilesForLobby('unregistered-game'), []);
});
