import assert from 'node:assert/strict';
import test from 'node:test';
import { aiMoveDelay } from '../src/features/match/ai-presentation.ts';

test('AI presentation delay stays within a weighted 1–10 second client-only range', () => {
  const delays = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999999].map((value) => aiMoveDelay(() => value));
  assert.ok(delays.every((delay) => delay >= 1_000 && delay <= 10_000));
  assert.equal(aiMoveDelay(() => 0), 1_000);
  assert.equal(aiMoveDelay(() => 2 / 9), 3_000);
  assert.ok(aiMoveDelay(() => 0.001) < 1_200);
  assert.ok(aiMoveDelay(() => 0.999) > 9_700);
  assert.ok(new Set(delays).size > 1);
});

test('invalid random samples still produce a safe bounded delay', () => {
  assert.equal(aiMoveDelay(() => Number.NaN), 3_000);
  assert.equal(aiMoveDelay(() => -1), 1_000);
  assert.ok(aiMoveDelay(() => 2) <= 10_000);
});
