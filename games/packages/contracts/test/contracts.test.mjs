import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  IN_HOUSE_PLAYERS,
  inHouseDifficultyForPlayer,
  PROTOCOL_VERSION,
  adaptTwoPlayerGame,
  createGameRegistry,
  invalid,
  isExactObject,
  parseActionCommand,
  parseActionRejection,
  parseGameOutcome,
  parseStateMessage,
} from "@portfolio-games/contracts";

const base = {
  protocolVersion: PROTOCOL_VERSION,
  matchId: "match-123",
  gameId: "another-game",
  rulesVersion: 1,
};
const parseChoice = (input) =>
  isExactObject(input, ["choice"]) && input.choice === "left"
    ? { ok: true, value: Object.freeze({ choice: "left" }) }
    : invalid("choice", "Invalid choice.");
const command = () => ({
  ...base,
  type: "submit-action",
  actionId: "action-1",
  expectedRevision: 0,
  action: { choice: "left" },
});

test("in-house roster is stable, unique, and matches the Supabase seed", async () => {
  assert.equal(IN_HOUSE_PLAYERS.length, 10);
  assert.equal(new Set(IN_HOUSE_PLAYERS.map((player) => player.playerId)).size, 10);
  assert.equal(new Set(IN_HOUSE_PLAYERS.map((player) => player.username)).size, 10);
  assert.equal(new Set(IN_HOUSE_PLAYERS.map((player) => player.displayName)).size, 10);
  assert.ok(IN_HOUSE_PLAYERS.some((player) => player.displayName === "Chichi"));
  assert.ok(IN_HOUSE_PLAYERS.some((player) => /^\d+ /.test(player.displayName)));
  assert.deepEqual(
    Object.fromEntries(
      ["easy", "medium", "hard", "very-hard"].map((difficulty) => [
        difficulty,
        IN_HOUSE_PLAYERS.filter((player) => player.difficulty === difficulty).length,
      ]),
    ),
    { easy: 3, medium: 3, hard: 2, "very-hard": 2 },
  );
  for (const player of IN_HOUSE_PLAYERS)
    assert.equal(inHouseDifficultyForPlayer(player.playerId), player.difficulty);
  assert.equal(inHouseDifficultyForPlayer("house_unknown"), null);
  const migration = await readFile(
    new URL("../../../supabase/migrations/20261107204750_leaderboards.sql", import.meta.url),
    "utf8",
  );
  for (const player of IN_HOUSE_PLAYERS) {
    assert.ok(migration.includes(`'${player.playerId}'`), `${player.playerId} is seeded`);
    assert.ok(migration.includes(`'${player.username}'`), `${player.username} is reserved`);
    assert.ok(migration.includes(`'${player.displayName}'`), `${player.displayName} is seeded`);
  }
});

function createCounterGame(gameId = "counter-game") {
  const parseState = (input) =>
    input &&
    typeof input === "object" &&
    Number.isSafeInteger(input.count) &&
    (input.nextPlayer === "first" || input.nextPlayer === "second") &&
    (input.startingPlayer === "first" || input.startingPlayer === "second") &&
    (input.outcome === null ||
      input.outcome?.kind === "draw" ||
      (input.outcome?.kind === "win" &&
        (input.outcome.winner === "first" || input.outcome.winner === "second")))
      ? { ok: true, value: Object.freeze({ ...input }) }
      : invalid("state", "Invalid counter state.");
  const gameModule = Object.freeze({
    gameId,
    title: "Counter game",
    description: "Alternate moves.",
    playerCount: "2-player match",
    rulesVersion: 3,
    supportedRulesVersions: Object.freeze([1, 3]),
    getSessionPolicy: (version) => ({
      turnDurationMs: 20_000 * version,
      reconnectDurationMs: 30_000 * version,
    }),
    createState: (startingPlayer) =>
      Object.freeze({ count: 0, startingPlayer, nextPlayer: startingPlayer, outcome: null }),
    parseAction: (input) =>
      isExactObject(input, ["type"]) && input.type === "step"
        ? { ok: true, value: Object.freeze({ type: "step" }) }
        : invalid("action", "Invalid action."),
    parseState,
    applyAction: (state, player) =>
      state.nextPlayer === player
        ? {
            ok: true,
            value: Object.freeze({
              count: state.count + 1,
              startingPlayer: state.startingPlayer,
              nextPlayer: player === "first" ? "second" : "first",
              outcome: null,
            }),
          }
        : { ok: false, error: { code: "wrong-turn" } },
    getOutcome: (state) => state.outcome,
    getNextPlayer: (state) => state.nextPlayer,
    getStartingPlayer: (state) => state.startingPlayer,
    getActionCount: (state) => state.count,
    getHistorySnapshot: (state) => ({ count: state.count }),
  });
  return adaptTwoPlayerGame(gameModule);
}

test("generic action contracts work independently of Connect Four", () => {
  const input = command();
  const parsed = parseActionCommand(input, parseChoice);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, input);
  assert.notEqual(parsed.value, input);
  assert.ok(Object.isFrozen(parsed.value));
  input.matchId = "changed";
  assert.equal(parsed.value.matchId, "match-123");
});

test("game registry validates version support and returns one validated state summary", () => {
  const counter = createCounterGame();
  const registry = createGameRegistry([counter]);
  const game = registry.get("counter-game", 1);
  assert.ok(game);
  assert.equal(registry.get("counter-game", 2), null);
  assert.equal(registry.get("missing-game"), null);
  assert.deepEqual(game.getSessionPolicy(1), {
    turnDurationMs: 20_000,
    reconnectDurationMs: 30_000,
  });

  const initial = game.createState("first", 1);
  const inspected = game.inspectState(initial, 1);
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.value, {
    state: initial,
    outcome: null,
    nextPlayer: "first",
    startingPlayer: "first",
    actionCount: 0,
    lastActionPlayer: null,
  });
  assert.ok(Object.isFrozen(inspected.value));

  const moved = game.applyAction(initial, "first", { type: "step" }, 1);
  assert.equal(moved.ok, true);
  assert.equal(game.inspectState(moved.value, 1).value.nextPlayer, "second");
  assert.equal(game.inspectState({ ...initial, count: "invalid" }, 1).ok, false);
  assert.throws(() => game.getSessionPolicy(2), /Unsupported game rules version/);
  assert.throws(() => createGameRegistry([counter, createCounterGame()]), /Duplicate game id/);
});

for (const [field, value] of [
  ["protocolVersion", 2],
  ["protocolVersion", "1"],
  ["rulesVersion", 0],
  ["rulesVersion", 1.5],
  ["rulesVersion", Infinity],
  ["matchId", ""],
  ["matchId", "a".repeat(129)],
  ["matchId", "has space"],
  ["actionId", ""],
  ["gameId", "BadGame"],
  ["gameId", "x".repeat(65)],
  ["expectedRevision", -1],
  ["expectedRevision", 0.5],
  ["expectedRevision", "0"],
  ["expectedRevision", NaN],
  ["expectedRevision", Number.MAX_SAFE_INTEGER + 1],
]) {
  test(`rejects invalid ${field}: ${String(value)}`, () => {
    const result = parseActionCommand({ ...command(), [field]: value }, parseChoice);
    assert.equal(result.ok, false);
    assert.equal(result.issues[0].path, field);
  });
}

test("rejects unexpected fields and non-JSON object shapes", () => {
  for (const value of [
    null,
    [],
    "move",
    1,
    {},
    new Date(),
    { ...command(), player: "first" },
    Object.assign(Object.create({ admin: true }), command()),
    JSON.parse('{"__proto__":{},"type":"submit-action"}'),
  ])
    assert.equal(parseActionCommand(value, parseChoice).ok, false);
  const missing = command();
  delete missing.action;
  assert.equal(parseActionCommand(missing, parseChoice).ok, false);
});

test("nested validation identifies the action field without echoing input", () => {
  const result = parseActionCommand(
    { ...command(), action: { choice: "secret-invalid-value" } },
    parseChoice,
  );
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].path, "action.choice");
  assert.ok(!JSON.stringify(result).includes("secret-invalid-value"));
});

test("state messages validate revision and use the supplied game-state parser", () => {
  const input = { ...base, type: "match-state", revision: 0, state: { choice: "left" } };
  assert.deepEqual(parseStateMessage(input, parseChoice), { ok: true, value: input });
  assert.equal(parseStateMessage({ ...input, revision: Infinity }, parseChoice).ok, false);
  assert.equal(
    parseStateMessage({ ...input, state: { choice: "right" } }, parseChoice).issues[0].path,
    "state.choice",
  );
  assert.equal(parseStateMessage({ ...input, type: "submit-action" }, parseChoice).ok, false);
});

test("error messages accept only bounded correlation fields and known codes", () => {
  const input = { ...base, type: "action-rejected", actionId: "action-1", code: "wrong-turn" };
  assert.deepEqual(parseActionRejection(input), { ok: true, value: input });
  for (const value of [
    { ...input, code: "unknown" },
    { ...input, actionId: "" },
    { ...input, message: "internal exception" },
    { ...input, protocolVersion: 2 },
  ])
    assert.equal(parseActionRejection(value).ok, false);
});

test("outcomes require a valid winner only for wins", () => {
  for (const value of [
    { kind: "win", winner: "first" },
    { kind: "win", winner: "second" },
    { kind: "draw" },
  ]) {
    const parsed = parseGameOutcome(value);
    assert.deepEqual(parsed, { ok: true, value });
    assert.ok(Object.isFrozen(parsed.value));
  }
  for (const value of [
    { kind: "win" },
    { kind: "win", winner: "other" },
    { kind: "draw", winner: "first" },
    { kind: "cancelled" },
    null,
  ])
    assert.equal(parseGameOutcome(value).ok, false);
});

test("valid wire data round-trips through JSON without framework types", () => {
  const input = command();
  assert.deepEqual(parseActionCommand(JSON.parse(JSON.stringify(input)), parseChoice).value, input);
});
