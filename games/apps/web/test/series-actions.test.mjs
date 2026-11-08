import assert from "node:assert/strict";
import test from "node:test";
import { canLeaveSeriesResult } from "../src/features/match/series-actions.ts";

test("a completed series can be left", () => {
  assert.equal(canLeaveSeriesResult({ status: "completed", rematchCountdown: false }), true);
});

test("a rematch countdown can be cancelled by leaving for games", () => {
  assert.equal(canLeaveSeriesResult({ status: "countdown", rematchCountdown: true }), true);
});

test("a normal game countdown cannot be left through the series-result action", () => {
  assert.equal(canLeaveSeriesResult({ status: "countdown", rematchCountdown: false }), false);
});

test("active, between-games, waiting, and missing matches are not series results", () => {
  for (const status of ["active", "between-games", "waiting"]) {
    assert.equal(canLeaveSeriesResult({ status, rematchCountdown: false }), false);
  }
  assert.equal(canLeaveSeriesResult(null), false);
});
