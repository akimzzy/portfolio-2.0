import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { MatchDurableObject } from "../dist/index.js";
import { createGame } from "@portfolio-games/connect-four";

const now = 1_800_000_000_000;

function makeMatch({ firstDeadline, secondDeadline }) {
  return {
    id: "abcdefghijklmnopqrstuv", visibility: "public", status: "between-games",
    createdAt: now - 60_000, expiresAt: now + 60_000, revision: 8,
    state: createGame("first"),
    seats: [
      { tokenHash: "first-hash", connected: false, reconnectRemainingMs: firstDeadline, disconnectedAt: now },
      { tokenHash: "second-hash", connected: false, reconnectRemainingMs: secondDeadline, disconnectedAt: now },
    ],
    countdownAt: null, turnDeadline: null, turnStartedAt: null, nextGameDeadline: now + 30_000,
    reconnectSeat: null, reconnectDeadline: null, pausedTurnMs: null,
    outcome: null, recentActions: {}, actionTimes: [[], []],
    seriesTarget: 2, wins: { first: 1, second: 0 }, gameNumber: 2,
    seriesStartingSeat: "first", nextStartingSeat: "second",
    nextReady: [false, false], rematchReady: [false, false], closedSeats: [false, false],
    rematchCountdown: false, seriesWinner: null,
  };
}

function makeWaitingMatch(seatToken, expiresAt = now) {
  return {
    id: "abcdefghijklmnopqrstuv", visibility: "public", status: "waiting",
    createdAt: now - 60_000, expiresAt, revision: 2, state: null,
    seats: [
      { tokenHash: createHash("sha256").update(seatToken).digest("hex"), displayName: "Host", connected: false, reconnectRemainingMs: 60_000, disconnectedAt: null },
      null,
    ],
    countdownAt: null, turnDeadline: null, turnStartedAt: null, nextGameDeadline: null,
    reconnectSeat: null, reconnectDeadline: null, pausedTurnMs: null, outcome: null,
    recentActions: {}, actionTimes: [[], []], seriesTarget: 2, wins: { first: 0, second: 0 },
    gameNumber: 0, seriesStartingSeat: null, nextStartingSeat: null, nextReady: [false, false],
    rematchReady: [false, false], closedSeats: [false, false], rematchCountdown: false, seriesWinner: null,
  };
}

function makeObject(match, sockets = []) {
  const values = new Map([["match", match]]);
  const storage = {
    async get(key) { return values.get(key); },
    async getAlarm() { return this.alarmAt ?? null; },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async deleteAll() { values.clear(); this.alarmAt = null; },
    async setAlarm(value) { this.alarmAt = value instanceof Date ? value.getTime() : value; },
    async deleteAlarm() { this.alarmAt = null; },
  };
  const ctx = { storage, getWebSockets: () => sockets, acceptWebSocket() {}, waitUntil() {} };
  return { object: new MatchDurableObject(ctx, {}), storage, values };
}

async function atTime(time, callback) {
  const originalNow = Date.now;
  Date.now = () => time;
  try { return await callback(); } finally { Date.now = originalNow; }
}

test("one expired intermission reconnect window concedes the series to the other seat", async () => {
  const match = makeMatch({ firstDeadline: 5_000, secondDeadline: 20_000 });
  const { object, values } = makeObject(match);
  await atTime(now + 5_000, () => object.alarm());

  const result = values.get("match");
  assert.equal(result.status, "completed");
  assert.equal(result.outcome, "series-conceded-first");
  assert.equal(result.seriesWinner, "second");
  assert.deepEqual(result.closedSeats, [true, false]);
});

test("simultaneous intermission reconnect expiry cancels the series without a winner", async () => {
  const match = makeMatch({ firstDeadline: 5_000, secondDeadline: 5_000 });
  const { object, values, storage } = makeObject(match);
  await atTime(now + 5_000, () => object.alarm());

  const result = values.get("match");
  assert.equal(result.status, "cancelled");
  assert.equal(result.outcome, "both-players-disconnected");
  assert.equal(result.seriesWinner, null);
  assert.deepEqual(result.closedSeats, [true, true]);
  assert.equal(result.retentionDeadline, now + 5_000 + 24 * 60 * 60_000);
  assert.equal(await storage.getAlarm(), result.retentionDeadline);
});

test("leaving during a mutual-rematch countdown cancels only that rematch", async () => {
  const seatToken = "first-seat-token";
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    status: "countdown", countdownAt: now + 2_000, rematchCountdown: true,
    rematchReady: [true, true], seriesWinner: "first", outcome: "win-first",
  };
  match.seats[0].tokenHash = createHash("sha256").update(seatToken).digest("hex");
  const { object, values } = makeObject(match);
  const response = await object.fetch(new Request("https://match.internal/leave-series", {
    method: "POST", headers: { Authorization: `Bearer ${seatToken}` },
  }));

  assert.equal(response.status, 200);
  const result = values.get("match");
  assert.equal(result.status, "completed");
  assert.equal(result.rematchCountdown, false);
  assert.equal(result.countdownAt, null);
  assert.deepEqual(result.rematchReady, [false, false]);
  assert.deepEqual(result.closedSeats, [true, false]);
  assert.equal(result.seriesWinner, "first");
});

test("a late host socket authentication expires the waiting room instead of starting it", async () => {
  const seatToken = "host-seat-token";
  const match = makeWaitingMatch(seatToken);
  const socket = {
    attachment: { authenticated: false, authDeadline: now + 10_000 },
    closed: null,
    deserializeAttachment() { return this.attachment; },
    serializeAttachment(value) { this.attachment = structuredClone(value); },
    send() {},
    close(code, reason) { this.closed = { code, reason }; },
  };
  const { object, values } = makeObject(match, [socket]);
  await atTime(now + 1, () => object.webSocketMessage(socket, JSON.stringify({ type: "authenticate", seatToken })));

  const expired = values.get("match");
  assert.equal(expired.status, "expired");
  assert.equal(expired.outcome, "room-expired");
  assert.equal(expired.gameNumber, 0);
  assert.equal(expired.seats[0].connected, false);
  assert.deepEqual(socket.closed, { code: 1008, reason: "Waiting room expired" });
});

test("an authenticated room snapshot observes expiry even when its alarm has not run", async () => {
  const seatToken = "host-seat-token";
  const { object, values } = makeObject(makeWaitingMatch(seatToken));
  const response = await atTime(now + 1, () => object.fetch(new Request(
    "https://match.internal/snapshot",
    { headers: { Authorization: `Bearer ${seatToken}` } },
  )));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "expired");
  assert.equal(values.get("match").status, "expired");
});

test("scheduling an unchanged match deadline does not rewrite its alarm", async () => {
  const match = makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 });
  const { object, storage } = makeObject(match);
  let writes = 0;
  storage.setAlarm = async (value) => {
    writes += 1;
    storage.alarmAt = value instanceof Date ? value.getTime() : value;
  };

  await object.schedule(match);
  await object.schedule(match);

  assert.equal(writes, 1);
  assert.equal(await storage.getAlarm(), now + 30_000);
});

test("an intermission alarm before either reconnect deadline preserves the series", async () => {
  const match = makeMatch({ firstDeadline: 5_000, secondDeadline: 20_000 });
  const { object, values, storage } = makeObject(match);
  await atTime(now + 4_999, () => object.alarm());

  const result = values.get("match");
  assert.equal(result.status, "between-games");
  assert.equal(result.seriesWinner, null);
  assert.equal(storage.alarmAt, now + 5_000);
});

test("a legacy active match with no turn deadline is repaired and scheduled in the future", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    status: "active",
    turnStartedAt: undefined,
    turnDeadline: undefined,
    reconnectSeat: null,
    reconnectDeadline: null,
    pausedTurnMs: null,
    seats: [
      { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
    ],
  };
  const { object, values, storage } = makeObject(match);

  await atTime(now, () => object.alarm());

  const repaired = values.get("match");
  assert.equal(repaired.status, "active");
  assert.equal(repaired.turnStartedAt, now);
  assert.equal(repaired.turnDeadline, now + 45_000);
  assert.ok(Number.isFinite(storage.alarmAt));
  assert.equal(storage.alarmAt, now + 45_000);
});

test("an older client starts its turn clock without a receipt handshake", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    status: "countdown", countdownAt: now, state: null, gameNumber: 0,
    nextStartingSeat: "first",
    seats: [
      { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
    ],
  };
  const { object, values } = makeObject(match);

  await atTime(now, () => object.alarm());

  const started = values.get("match");
  assert.equal(started.status, "active");
  assert.equal(started.turnReceiptPending, false);
  assert.equal(started.turnDeadline, now + 45_000);
});

test("a legacy intermission with an undefined next-game deadline gets its shared timer", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    nextGameDeadline: undefined,
  };
  const { object, values, storage } = makeObject(match);

  await atTime(now, () => object.alarm());

  const repaired = values.get("match");
  assert.equal(repaired.status, "between-games");
  assert.equal(repaired.nextGameDeadline, now + 30_000);
  assert.equal(storage.alarmAt, now + 30_000);
});

test("the shared intermission deadline starts the next game even when neither player votes", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    seats: [
      { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
    ],
    nextGameDeadline: now + 30_000,
  };
  const { object, values, storage } = makeObject(match);
  await atTime(now + 30_000, () => object.alarm());

  const result = values.get("match");
  assert.equal(result.status, "countdown");
  assert.equal(result.countdownAt, now + 32_000);
  assert.equal(result.nextStartingSeat, "second");
  assert.equal(result.nextGameDeadline, null);
  assert.deepEqual(result.nextReady, [false, false]);
  assert.equal(storage.alarmAt, now + 32_000);
});

test("the other player's vote starts the next-game countdown before the shared deadline", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    seats: [
      { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
    ],
    nextGameDeadline: now + 30_000,
  };
  const { object, values } = makeObject(match);
  await atTime(now, async () => {
    await object.requestNextGame(match, "first");
    assert.equal(values.get("match").status, "between-games");
    await object.requestNextGame(match, "second");
  });

  const result = values.get("match");
  assert.equal(result.status, "countdown");
  assert.equal(result.countdownAt, now + 2_000);
  assert.equal(result.nextGameDeadline, null);
});

test("the automatic next-game deadline waits for a disconnected player to reconnect", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    seats: [
      { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: false, reconnectRemainingMs: 60_000, disconnectedAt: now },
    ],
    nextGameDeadline: now + 30_000,
  };
  const { object, values, storage } = makeObject(match);
  await atTime(now + 30_000, () => object.alarm());

  const result = values.get("match");
  assert.equal(result.status, "between-games");
  assert.equal(result.nextGameDeadline, now + 30_000);
  assert.equal(storage.alarmAt, now + 60_000);
});

test("two saved readiness votes do not bypass the connected-player requirement", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    seats: [
      { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: false, reconnectRemainingMs: 60_000, disconnectedAt: now },
    ],
    nextReady: [false, true],
    nextGameDeadline: now + 30_000,
  };
  const { object, values } = makeObject(match);
  await atTime(now + 30_000, () => object.requestNextGame(match, "first"));

  const result = values.get("match");
  assert.equal(result.status, "between-games");
  assert.deepEqual(result.nextReady, [true, true]);
  assert.equal(result.nextGameDeadline, now + 30_000);
});

test("a player who reconnects after the shared deadline starts the next-game countdown", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    seats: [
      { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: false, reconnectRemainingMs: 60_000, disconnectedAt: now },
    ],
    nextGameDeadline: now + 30_000,
  };
  const socket = {
    deserializeAttachment: () => ({ authenticated: false, authDeadline: now + 60_000 }),
    serializeAttachment() {}, send() {}, close() {},
  };
  const { object, values, storage } = makeObject(match, [socket]);
  const seatToken = "reconnect-token";
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(seatToken));
  values.get("match").seats[1].tokenHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  await atTime(now + 40_000, () => object.webSocketMessage(socket, JSON.stringify({ type: "authenticate", seatToken })));

  const result = values.get("match");
  assert.equal(result.status, "countdown");
  assert.equal(result.countdownAt, now + 42_000);
  assert.equal(result.nextGameDeadline, null);
  assert.equal(result.seats[1].disconnectedAt, null);
  assert.equal(storage.alarmAt, now + 42_000);
});

test("turn expiry forfeits only the current game and awards one series point", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
    status: "active", turnDeadline: now + 5_000, turnStartedAt: now,
    reconnectSeat: null, reconnectDeadline: null, pausedTurnMs: null,
    wins: { first: 1, second: 0 }, seriesWinner: null,
  };
  const { object, values } = makeObject(match);
  await atTime(now + 5_000, () => object.alarm());

  const result = values.get("match");
  assert.equal(result.status, "between-games");
  assert.equal(result.outcome, "timeout-first");
  assert.deepEqual(result.wins, { first: 1, second: 1 });
  assert.equal(result.seriesWinner, null);
});

test("active reconnect expiry forfeits the current game and leaves the series score consistent", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 5_000, secondDeadline: 60_000 }),
    status: "active", turnDeadline: null, turnStartedAt: now - 5_000,
    reconnectSeat: "first", reconnectDeadline: now + 5_000, pausedTurnMs: 18_000,
    seats: [
      { tokenHash: "first-hash", connected: false, reconnectRemainingMs: 5_000, disconnectedAt: now },
      { tokenHash: "second-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
    ],
  };
  const { object, values } = makeObject(match);
  await atTime(now + 5_000, () => object.alarm());

  const result = values.get("match");
  assert.equal(result.status, "between-games");
  assert.equal(result.outcome, "reconnect-timeout-first");
  assert.deepEqual(result.wins, { first: 1, second: 1 });
  assert.equal(result.seriesWinner, null);
});

test("a turn that is never acknowledged expires within the recipient's reconnect budget", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 5_000, secondDeadline: 60_000 }),
    status: "active", turnDeadline: null, turnStartedAt: null,
    reconnectSeat: "first", reconnectDeadline: now + 5_000, pausedTurnMs: 45_000,
    turnReceiptPending: true,
    seats: [
      { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 5_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
    ],
  };
  const { object, values } = makeObject(match);
  await atTime(now + 5_000, () => object.alarm());

  const result = values.get("match");
  assert.equal(result.status, "between-games");
  assert.equal(result.outcome, "reconnect-timeout-first");
  assert.equal(result.turnReceiptPending, false);
  assert.deepEqual(result.wins, { first: 1, second: 1 });
});

test("a move at the deadline loses to timeout, while an earlier accepted move resets the deadline", async () => {
  function makeActiveHarness() {
    const match = {
      ...makeMatch({ firstDeadline: 60_000, secondDeadline: 60_000 }),
      status: "active", turnDeadline: now + 5_000, turnStartedAt: now,
      seats: [
        { tokenHash: "first-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null },
      { tokenHash: "second-hash", connected: true, reconnectRemainingMs: 60_000, disconnectedAt: null, turnReceiptSupported: true },
      ],
    };
    const messages = [];
    const socket = {
      deserializeAttachment: () => ({ authenticated: true, seat: "first" }),
      serializeAttachment() {}, send: (message) => messages.push(JSON.parse(message)), close() {},
    };
    const nextPlayerSocket = {
      deserializeAttachment: () => ({ authenticated: true, seat: "second" }),
      serializeAttachment() {}, send: (message) => messages.push(JSON.parse(message)), close() {},
    };
    const harness = makeObject(match, [socket, nextPlayerSocket]);
    const command = {
      protocolVersion: 1, gameId: "connect-four", rulesVersion: 1, type: "submit-action",
      matchId: match.id, actionId: "deadline-race-1", expectedRevision: match.revision,
      action: { type: "drop-token", column: 3 },
    };
    return { ...harness, messages, socket, nextPlayerSocket, command };
  }

  const atDeadline = makeActiveHarness();
  await atTime(now + 5_000, async () => {
    await atDeadline.object.webSocketMessage(atDeadline.socket, JSON.stringify(atDeadline.command));
    await atDeadline.object.alarm();
  });
  assert.ok(atDeadline.messages.some((message) => message.type === "action-rejected" && message.code === "match-not-active"));
  assert.equal(atDeadline.values.get("match").status, "between-games");
  assert.equal(atDeadline.values.get("match").state.moves.length, 0);

  const beforeDeadline = makeActiveHarness();
  await atTime(now + 4_999, async () => {
    await beforeDeadline.object.webSocketMessage(beforeDeadline.socket, JSON.stringify(beforeDeadline.command));
    await beforeDeadline.object.alarm();
  });
  const accepted = beforeDeadline.values.get("match");
  assert.equal(accepted.status, "active");
  assert.equal(accepted.state.moves.length, 1);
  assert.equal(accepted.turnDeadline, null);
  assert.equal(accepted.turnReceiptPending, true);
  assert.equal(accepted.reconnectSeat, "second");
  await atTime(now + 10_000, () => beforeDeadline.object.webSocketMessage(
    beforeDeadline.nextPlayerSocket,
    JSON.stringify({ type: "turn-received", revision: accepted.revision }),
  ));
  const acknowledged = beforeDeadline.values.get("match");
  assert.equal(acknowledged.turnReceiptPending, false);
  assert.equal(acknowledged.turnDeadline, now + 10_000 + 45_000);
  assert.equal(acknowledged.seats[1].reconnectRemainingMs, 60_000);

  const disconnectedRecipient = makeActiveHarness();
  const disconnectedSeat = disconnectedRecipient.values.get("match").seats[1];
  disconnectedSeat.connected = false;
  disconnectedSeat.disconnectedAt = now - 30_000;
  await atTime(now + 4_999, () => disconnectedRecipient.object.webSocketMessage(
    disconnectedRecipient.socket,
    JSON.stringify(disconnectedRecipient.command),
  ));
  const disconnectedMove = disconnectedRecipient.values.get("match");
  assert.equal(disconnectedMove.turnReceiptStartedAt, now + 4_999);
  await atTime(now + 10_000, () => disconnectedRecipient.object.webSocketMessage(
    disconnectedRecipient.nextPlayerSocket,
    JSON.stringify({ type: "turn-received", revision: disconnectedMove.revision }),
  ));
  const reconnectedRecipient = disconnectedRecipient.values.get("match");
  assert.equal(reconnectedRecipient.seats[1].reconnectRemainingMs, 54_999);
  assert.equal(reconnectedRecipient.seats[1].disconnectedAt, null);

  const legacyClient = makeActiveHarness();
  legacyClient.values.get("match").seats[1].turnReceiptSupported = false;
  await atTime(now + 4_999, () => legacyClient.object.webSocketMessage(
    legacyClient.socket,
    JSON.stringify(legacyClient.command),
  ));
  const legacyAccepted = legacyClient.values.get("match");
  assert.equal(legacyAccepted.turnReceiptPending, false);
  assert.equal(legacyAccepted.turnDeadline, now + 4_999 + 45_000);
});

test("terminal match data is removed after its retention deadline", async () => {
  const match = {
    ...makeMatch({ firstDeadline: 0, secondDeadline: 0 }),
    status: "completed", retentionDeadline: now + 24 * 60 * 60_000,
    seriesWinner: "first",
  };
  const { object, values, storage } = makeObject(match);

  await object.schedule(match);
  assert.equal(await storage.getAlarm(), match.retentionDeadline);

  await atTime(match.retentionDeadline, () => object.alarm());

  assert.equal(values.has("match"), false);
  assert.equal(await storage.getAlarm(), null);
});
