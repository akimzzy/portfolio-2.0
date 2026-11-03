import assert from 'node:assert/strict';
import test from 'node:test';
import { inHouseRefillCount, randomInHouseOfferCount, shuffled } from '../src/features/lobby/lobby-opponents.ts';
import { opponentProfilesForLobby } from '../src/games/opponents.ts';

test('initial in-house roster size varies from four to ten', () => {
  assert.equal(randomInHouseOfferCount(() => 0), 4);
  assert.equal(randomInHouseOfferCount(() => 0.999999), 10);
});

test('expired offers reduce the live roster; refill starts only below the soft floor', () => {
  assert.equal(inHouseRefillCount(6), 0);
  assert.equal(inHouseRefillCount(4), 0);
  assert.equal(inHouseRefillCount(3), 1);
  assert.equal(inHouseRefillCount(0), 1);
});

test('lobby opponent profiles follow the selected game registry', () => {
  assert.ok(opponentProfilesForLobby('all').length > 0);
  assert.ok(opponentProfilesForLobby('connect-four').every((profile) => profile.gameId === 'connect-four'));
  assert.deepEqual(opponentProfilesForLobby('unregistered-game'), []);
});

test('profile shuffle does not repeat a style before the whole profile set has appeared', () => {
  const profiles = opponentProfilesForLobby('connect-four');
  const cycle = shuffled(profiles, () => 0.5);
  assert.equal(new Set(cycle.map((profile) => profile.id)).size, profiles.length);
});

test('random roster size handles invalid random sources without escaping its bounds', () => {
  assert.equal(randomInHouseOfferCount(() => Number.NaN), 7);
  assert.equal(randomInHouseOfferCount(() => -1), 4);
  assert.equal(randomInHouseOfferCount(() => 2), 10);
});
