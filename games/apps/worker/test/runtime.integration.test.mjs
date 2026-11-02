import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import WebSocket from "ws";
import { RULES_VERSION } from "@portfolio-games/connect-four";

const gamesRoot = path.resolve(import.meta.dirname, "../../..");
const origin = "http://localhost:4178";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startWorker(port, persistencePath) {
  const child = spawn(process.execPath, [
    "node_modules/wrangler/bin/wrangler.js", "dev", "--local",
    "--config", "apps/worker/wrangler.jsonc", "--ip", "127.0.0.1", "--port", String(port),
    "--persist-to", persistencePath, "--show-interactive-dev-session=false", "--log-level", "error",
  ], { cwd: gamesRoot, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (child.exitCode !== null) throw new Error(`Worker exited before readiness.\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return { process: child, baseUrl, output: () => output };
    } catch {}
    await delay(100);
  }
  await stopWorker(child);
  throw new Error(`Worker did not become ready.\n${output}`);
}

async function stopWorker(process) {
  if (process.exitCode !== null) return;
  const exited = once(process, "exit");
  process.kill("SIGTERM");
  const finished = await Promise.race([exited.then(() => true), delay(5_000).then(() => false)]);
  if (!finished && process.exitCode === null) {
    process.kill("SIGKILL");
    await once(process, "exit");
  }
}

async function api(baseUrl, pathName, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", origin);
  const response = await fetch(`${baseUrl}${pathName}`, { ...init, headers });
  return { response, body: await response.json() };
}

function socketClient(baseUrl, matchId, seatToken) {
  const client = { socket: null, queue: [], waiters: [] };
  const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/v1/matches/${matchId}/socket`, {
    headers: { Origin: origin },
  });
  client.socket = socket;
  socket.on("message", (raw) => {
    let payload;
    try { payload = JSON.parse(raw.toString()); } catch { return; }
    const index = client.waiters.findIndex((waiter) => waiter.predicate(payload));
    if (index >= 0) client.waiters.splice(index, 1)[0].resolve(payload);
    else client.queue.push(payload);
  });
  const opened = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  client.waitFor = (predicate, timeoutMs = 5_000) => {
    const queuedIndex = client.queue.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(client.queue.splice(queuedIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      let timer;
      const onClose = () => {
        clearTimeout(timer);
        client.waiters = client.waiters.filter((candidate) => candidate !== waiter);
        reject(new Error("Worker socket closed while waiting for an event."));
      };
      const waiter = { predicate, resolve: (value) => {
        clearTimeout(timer);
        socket.off("close", onClose);
        resolve(value);
      } };
      timer = setTimeout(() => {
        client.waiters = client.waiters.filter((candidate) => candidate !== waiter);
        socket.off("close", onClose);
        reject(new Error("Timed out waiting for a Worker socket event."));
      }, timeoutMs);
      client.waiters.push(waiter);
      socket.once("close", onClose);
    });
  };
  client.openAndAuthenticate = async () => {
    await opened;
    socket.send(JSON.stringify({ type: "authenticate", seatToken, supportsTurnReceipt: true }));
    return client.waitFor((payload) => payload.type === "match");
  };
  client.send = (message) => socket.send(JSON.stringify(message));
  client.close = () => {
    if (socket.readyState < WebSocket.CLOSING) socket.close(1000, "Integration test complete");
  };
  return client;
}

function lobbySocketClient(baseUrl, visitorId = null) {
  const client = { socket: null, queue: [], waiters: [] };
  const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/v1/lobby/socket`, {
    headers: { Origin: origin },
  });
  client.socket = socket;
  socket.on("message", (raw) => {
    let payload;
    try { payload = JSON.parse(raw.toString()); } catch { return; }
    const index = client.waiters.findIndex((waiter) => waiter.predicate(payload));
    if (index >= 0) client.waiters.splice(index, 1)[0].resolve(payload);
    else client.queue.push(payload);
  });
  const opened = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  client.waitFor = (predicate, timeoutMs = 5_000) => {
    const queuedIndex = client.queue.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(client.queue.splice(queuedIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      let timer;
      const waiter = { predicate, resolve: (value) => {
        clearTimeout(timer);
        socket.off("close", onClose);
        resolve(value);
      } };
      const onClose = () => {
        clearTimeout(timer);
        client.waiters = client.waiters.filter((candidate) => candidate !== waiter);
        reject(new Error("Lobby socket closed while waiting for an event."));
      };
      timer = setTimeout(() => {
        client.waiters = client.waiters.filter((candidate) => candidate !== waiter);
        socket.off("close", onClose);
        reject(new Error("Timed out waiting for a lobby event."));
      }, timeoutMs);
      client.waiters.push(waiter);
      socket.once("close", onClose);
    });
  };
  client.identify = async () => {
    await opened;
    socket.send(JSON.stringify({ type: "identify", ...(visitorId ? { visitorId } : {}) }));
    return client.waitFor((payload) => payload.type === "lobby-snapshot");
  };
  client.close = () => {
    if (socket.readyState < WebSocket.CLOSING) socket.close(1000, "Integration test complete");
  };
  return client;
}

test("lobby snapshots report available matches without visitor presence counts", { timeout: 30_000 }, async (t) => {
  const port = await unusedPort();
  const persistencePath = await mkdtemp(path.join(os.tmpdir(), "portfolio-games-lobby-"));
  let worker;
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    if (worker) await stopWorker(worker.process);
    await rm(persistencePath, { recursive: true, force: true });
  });

  worker = await startWorker(port, persistencePath);
  const first = lobbySocketClient(worker.baseUrl);
  clients.push(first);
  const firstSnapshot = await first.identify();
  assert.equal(firstSnapshot.totalMatches, 0);
  assert.equal("onlineCount" in firstSnapshot, false);

  const second = lobbySocketClient(worker.baseUrl, "B".repeat(22));
  clients.push(second);
  const secondSnapshot = await second.identify();
  assert.equal(secondSnapshot.totalMatches, 0);
  assert.equal("onlineCount" in secondSnapshot, false);
});

test("competing joins can claim only one seat", { timeout: 30_000 }, async (t) => {
  const port = await unusedPort();
  const persistencePath = await mkdtemp(path.join(os.tmpdir(), "portfolio-games-join-race-"));
  let worker;
  t.after(async () => {
    if (worker) await stopWorker(worker.process);
    await rm(persistencePath, { recursive: true, force: true });
  });

  worker = await startWorker(port, persistencePath);
  const created = await api(worker.baseUrl, "/v1/matches", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "connect-four", rulesVersion: RULES_VERSION, visibility: "public", seriesTarget: 1, displayName: "Host" }),
  });
  assert.equal(created.response.status, 201);

  const joins = await Promise.all(["Visitor A", "Visitor B"].map((displayName) => api(
    worker.baseUrl,
    `/v1/matches/${created.body.matchId}/join`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rulesVersion: RULES_VERSION, displayName }) },
  )));
  assert.deepEqual(joins.map((result) => result.response.status).sort(), [200, 409]);
});

test("a room cannot be cancelled after a concurrent join has claimed its seat", { timeout: 30_000 }, async (t) => {
  const port = await unusedPort();
  const persistencePath = await mkdtemp(path.join(os.tmpdir(), "portfolio-games-cancel-race-"));
  let worker;
  t.after(async () => {
    if (worker) await stopWorker(worker.process);
    await rm(persistencePath, { recursive: true, force: true });
  });

  worker = await startWorker(port, persistencePath);
  const created = await api(worker.baseUrl, "/v1/matches", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "connect-four", rulesVersion: RULES_VERSION, visibility: "public", seriesTarget: 1, displayName: "Host" }),
  });
  assert.equal(created.response.status, 201);

  const [cancelled, joined] = await Promise.all([
    api(worker.baseUrl, `/v1/matches/${created.body.matchId}/cancel`, {
      method: "POST", headers: { Authorization: `Bearer ${created.body.seatToken}` },
    }),
    api(worker.baseUrl, `/v1/matches/${created.body.matchId}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rulesVersion: RULES_VERSION, displayName: "Visitor" }),
    }),
  ]);

  const hostSnapshot = await api(worker.baseUrl, `/v1/matches/${created.body.matchId}`, {
    headers: { Authorization: `Bearer ${created.body.seatToken}` },
  });
  if (joined.response.status === 200) {
    assert.equal(cancelled.response.status, 409);
    assert.equal(hostSnapshot.body.status, "waiting");
    assert.equal(hostSnapshot.body.playerNames[1], "Visitor");
  } else {
    assert.ok([409, 410].includes(joined.response.status));
    assert.equal(cancelled.response.status, 200);
    assert.equal(hostSnapshot.body.status, "cancelled");
  }
});

test("two concurrent moves from one seat produce one accepted action", { timeout: 30_000 }, async (t) => {
  const port = await unusedPort();
  const persistencePath = await mkdtemp(path.join(os.tmpdir(), "portfolio-games-action-race-"));
  let worker;
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    if (worker) await stopWorker(worker.process);
    await rm(persistencePath, { recursive: true, force: true });
  });

  worker = await startWorker(port, persistencePath);
  const created = await api(worker.baseUrl, "/v1/matches", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "connect-four", rulesVersion: RULES_VERSION, visibility: "public", seriesTarget: 1 }),
  });
  assert.equal(created.response.status, 201);
  const joined = await api(worker.baseUrl, `/v1/matches/${created.body.matchId}/join`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rulesVersion: RULES_VERSION }),
  });
  assert.equal(joined.response.status, 200);

  const first = socketClient(worker.baseUrl, created.body.matchId, created.body.seatToken);
  const second = socketClient(worker.baseUrl, created.body.matchId, joined.body.seatToken);
  clients.push(first, second);
  await Promise.all([first.openAndAuthenticate(), second.openAndAuthenticate()]);
  const activePredicate = (payload) => payload.type === "match" && payload.match.status === "active";
  const [firstActive, secondActive] = await Promise.all([first.waitFor(activePredicate), second.waitFor(activePredicate)]);
  const active = firstActive.match.revision >= secondActive.match.revision ? firstActive.match : secondActive.match;
  const starter = active.awaitingTurnReceipt.seat === "first" ? first : second;
  const started = Promise.all([
    first.waitFor((payload) => payload.type === "match" && payload.match.turnDeadline !== null),
    second.waitFor((payload) => payload.type === "match" && payload.match.turnDeadline !== null),
  ]);
  starter.send({ type: "turn-received", revision: active.revision });
  const [firstReady, secondReady] = await started;
  const ready = firstReady.match.revision >= secondReady.match.revision ? firstReady.match : secondReady.match;
  const mover = ready.state.nextPlayer === "first" ? first : second;
  const commands = ["race-action-a", "race-action-b"].map((actionId, index) => ({
    protocolVersion: 1,
    type: "submit-action",
    gameId: "connect-four",
    rulesVersion: RULES_VERSION,
    matchId: created.body.matchId,
    actionId,
    expectedRevision: ready.revision,
    action: { type: "drop-token", column: index + 2 },
  }));
  const responseA = mover.waitFor((payload) => payload.acceptedActionId === commands[0].actionId || payload.actionId === commands[0].actionId);
  const responseB = mover.waitFor((payload) => payload.acceptedActionId === commands[1].actionId || payload.actionId === commands[1].actionId);
  mover.send(commands[0]);
  mover.send(commands[1]);
  const [resultA, resultB] = await Promise.all([responseA, responseB]);
  assert.equal([resultA, resultB].filter((result) => result.acceptedActionId).length, 1);
  assert.equal([resultA, resultB].filter((result) => result.type === "action-rejected").length, 1);

  const snapshot = await api(worker.baseUrl, `/v1/matches/${created.body.matchId}`, {
    headers: { Authorization: `Bearer ${created.body.seatToken}` },
  });
  assert.equal(snapshot.body.state.moves.length, 1);
});

test("AI matches start on demand and make a server-authoritative reply in the same turn flow", { timeout: 30_000 }, async (t) => {
  const port = await unusedPort();
  const persistencePath = await mkdtemp(path.join(os.tmpdir(), "portfolio-games-ai-match-"));
  let worker;
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    if (worker) await stopWorker(worker.process);
    await rm(persistencePath, { recursive: true, force: true });
  });

  worker = await startWorker(port, persistencePath);
  const unsupportedGame = await api(worker.baseUrl, "/v1/matches/ai", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "unregistered-game", profileId: "standard", seriesTarget: 1, displayName: "Test Player" }),
  });
  assert.equal(unsupportedGame.response.status, 404);
  const unsupportedProfile = await api(worker.baseUrl, "/v1/matches/ai", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "connect-four", profileId: "unregistered-profile", seriesTarget: 1, displayName: "Test Player" }),
  });
  assert.equal(unsupportedProfile.response.status, 400);
  const created = await api(worker.baseUrl, "/v1/matches/ai", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "connect-four", profileId: "standard", seriesTarget: 1, displayName: "Test Player" }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.seat, "second");

  const client = socketClient(worker.baseUrl, created.body.matchId, created.body.seatToken);
  clients.push(client);
  await client.openAndAuthenticate();
  const activeEvent = await client.waitFor((payload) => payload.type === "match" && payload.match.status === "active" && payload.match.state !== null);
  let active = activeEvent.match;
  if (active.awaitingTurnReceipt?.seat === "second") {
    client.send({ type: "turn-received", revision: active.revision });
    active = (await client.waitFor((payload) => payload.type === "match" && payload.match.status === "active" && payload.match.turnDeadline !== null)).match;
  }
  assert.ok(active.state.moves.length === 0 || active.state.moves.length === 1);
  assert.equal(active.state.nextPlayer, "second");

  const accepted = client.waitFor((payload) => payload.acceptedActionId === "human-first-move");
  client.send({
    protocolVersion: 1, type: "submit-action", gameId: "connect-four", rulesVersion: RULES_VERSION,
    matchId: created.body.matchId, actionId: "human-first-move", expectedRevision: active.revision,
    action: { type: "drop-token", column: 3 },
  });
  const response = await accepted;
  assert.equal(response.match.status, "active");
  assert.equal(response.match.state.moves.length, active.state.moves.length + 2);
  assert.equal(response.match.state.nextPlayer, "second");
  assert.equal(response.match.seatKinds[0], "ai");
  assert.equal(response.match.seatKinds[1], "human");
});

test("AI opponent accepts a rematch and starts the next game without another player seat", { timeout: 30_000 }, async (t) => {
  const port = await unusedPort();
  const persistencePath = await mkdtemp(path.join(os.tmpdir(), "portfolio-games-ai-rematch-"));
  let worker;
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    if (worker) await stopWorker(worker.process);
    await rm(persistencePath, { recursive: true, force: true });
  });

  worker = await startWorker(port, persistencePath);
  const created = await api(worker.baseUrl, "/v1/matches/ai", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "connect-four", profileId: "standard", seriesTarget: 1, displayName: "Test Player" }),
  });
  assert.equal(created.response.status, 201);

  const client = socketClient(worker.baseUrl, created.body.matchId, created.body.seatToken);
  clients.push(client);
  await client.openAndAuthenticate();
  await client.waitFor((payload) => payload.type === "match" && payload.match.status === "active" && payload.match.state !== null);

  const completed = client.waitFor((payload) => payload.type === "match" && payload.match.status === "completed");
  client.send({ type: "resign" });
  const result = await completed;
  assert.equal(result.match.seriesWinner, "first");

  const countdown = client.waitFor((payload) => payload.type === "match" && payload.match.status === "countdown" && payload.match.rematchCountdown === true);
  client.send({ type: "rematch" });
  await countdown;
  const restarted = await client.waitFor((payload) => payload.type === "match" && payload.match.status === "active" &&
    payload.match.gameNumber === 1 && payload.match.revision > result.match.revision);
  assert.ok(restarted.match.state.moves.length === 0 || restarted.match.state.moves.length === 1);
  assert.equal(restarted.match.state.nextPlayer, "second");
});

test("replacing a live player's socket preserves the seat and allows the current turn", { timeout: 60_000 }, async (t) => {
  const port = await unusedPort();
  const persistencePath = await mkdtemp(path.join(os.tmpdir(), "portfolio-games-worker-replace-"));
  let worker;
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    if (worker) await stopWorker(worker.process);
    await rm(persistencePath, { recursive: true, force: true });
  });

  worker = await startWorker(port, persistencePath);
  const created = await api(worker.baseUrl, "/v1/matches", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "connect-four", rulesVersion: RULES_VERSION, visibility: "public", seriesTarget: 2 }),
  });
  assert.equal(created.response.status, 201);
  const joined = await api(worker.baseUrl, `/v1/matches/${created.body.matchId}/join`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rulesVersion: RULES_VERSION }),
  });
  assert.equal(joined.response.status, 200);

  const first = socketClient(worker.baseUrl, created.body.matchId, created.body.seatToken);
  const second = socketClient(worker.baseUrl, created.body.matchId, joined.body.seatToken);
  clients.push(first, second);
  await Promise.all([first.openAndAuthenticate(), second.openAndAuthenticate()]);
  const activePredicate = (payload) => payload.type === "match" && payload.match.status === "active";
  const [firstActive, secondActive] = await Promise.all([first.waitFor(activePredicate), second.waitFor(activePredicate)]);
  assert.equal(firstActive.match.revision, secondActive.match.revision);

  const starterSeat = firstActive.match.awaitingTurnReceipt.seat;
  const starter = starterSeat === "first" ? first : second;
  const starterReady = Promise.all([
    first.waitFor((payload) => payload.type === "match" && payload.match.turnDeadline !== null),
    second.waitFor((payload) => payload.type === "match" && payload.match.turnDeadline !== null),
  ]);
  starter.send({ type: "turn-received", revision: firstActive.match.revision });
  const [readyFromFirst] = await starterReady;

  const oldClient = starter;
  const seatToken = starterSeat === "first" ? created.body.seatToken : joined.body.seatToken;
  const replacement = socketClient(worker.baseUrl, created.body.matchId, seatToken);
  clients.push(replacement);
  const oldSocketClosed = once(oldClient.socket, "close");
  const replacementSnapshot = await replacement.openAndAuthenticate();
  await oldSocketClosed;

  assert.equal(replacementSnapshot.match.status, "active");
  assert.notEqual(replacementSnapshot.match.turnDeadline, null);
  const authoritative = await api(worker.baseUrl, `/v1/matches/${created.body.matchId}`, {
    headers: { Authorization: `Bearer ${seatToken}` },
  });
  assert.equal(authoritative.response.status, 200);
  assert.equal(authoritative.body.connectedSeats[starterSeat === "first" ? 0 : 1], true);
  assert.equal(authoritative.body.turnDeadline, readyFromFirst.match.turnDeadline);

  const actionId = "replacement-socket-move";
  const accepted = replacement.waitFor((payload) => payload.acceptedActionId === actionId);
  replacement.send({
    protocolVersion: 1, type: "submit-action", gameId: "connect-four", rulesVersion: RULES_VERSION,
    matchId: created.body.matchId, actionId, expectedRevision: authoritative.body.revision,
    action: { type: "drop-token", column: 2 },
  });
  assert.equal((await accepted).match.state.moves.length, 1);
});

test("Worker runtime synchronizes two clients, deduplicates actions, rejects stale moves, and restores stored state", { timeout: 90_000 }, async (t) => {
  const port = await unusedPort();
  const persistencePath = await mkdtemp(path.join(os.tmpdir(), "portfolio-games-worker-"));
  let worker;
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    if (worker) await stopWorker(worker.process);
    await rm(persistencePath, { recursive: true, force: true });
  });

  worker = await startWorker(port, persistencePath);
  const created = await api(worker.baseUrl, "/v1/matches", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "connect-four", rulesVersion: RULES_VERSION, visibility: "public", seriesTarget: 2 }),
  });
  assert.equal(created.response.status, 201);
  const matchId = created.body.matchId;
  const waiting = await api(worker.baseUrl, `/v1/matches/${matchId}`, {
    headers: { Authorization: `Bearer ${created.body.seatToken}` },
  });
  assert.equal(waiting.body.status, "waiting");
  assert.equal(waiting.body.rulesVersion, RULES_VERSION);
  const stalePreview = await api(worker.baseUrl, `/v1/matches/${matchId}/preview`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rulesVersion: 1 }),
  });
  assert.equal(stalePreview.response.status, 426);
  const currentPreview = await api(worker.baseUrl, `/v1/matches/${matchId}/preview`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rulesVersion: RULES_VERSION }),
  });
  assert.equal(currentPreview.response.status, 200);

  const legacyCreated = await api(worker.baseUrl, "/v1/matches", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibility: "public", seriesTarget: 1 }),
  });
  assert.equal(legacyCreated.response.status, 201);
  const legacyWaiting = await api(worker.baseUrl, `/v1/matches/${legacyCreated.body.matchId}`, {
    headers: { Authorization: `Bearer ${legacyCreated.body.seatToken}` },
  });
  assert.equal(legacyWaiting.body.rulesVersion, 1);
  const legacyCompatiblePreview = await api(worker.baseUrl, `/v1/matches/${legacyCreated.body.matchId}/preview`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rulesVersion: 1 }),
  });
  assert.equal(legacyCompatiblePreview.response.status, 200);
  const staleJoin = await api(worker.baseUrl, `/v1/matches/${matchId}/join`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rulesVersion: 1 }),
  });
  assert.equal(staleJoin.response.status, 426);
  const joined = await api(worker.baseUrl, `/v1/matches/${matchId}/join`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rulesVersion: RULES_VERSION }),
  });
  assert.equal(joined.response.status, 200);

  const first = socketClient(worker.baseUrl, matchId, created.body.seatToken);
  const second = socketClient(worker.baseUrl, matchId, joined.body.seatToken);
  clients.push(first, second);
  await Promise.all([first.openAndAuthenticate(), second.openAndAuthenticate()]);
  const countdownPredicate = (payload) => payload.type === "match" && payload.match.status === "countdown";
  const [firstCountdown, secondCountdown] = await Promise.all([
    first.waitFor(countdownPredicate), second.waitFor(countdownPredicate),
  ]);
  assert.equal(firstCountdown.match.revision, secondCountdown.match.revision);
  const activePredicate = (payload) => payload.type === "match" && payload.match.status === "active";
  const [firstActive, secondActive] = await Promise.all([first.waitFor(activePredicate), second.waitFor(activePredicate)]);
  assert.ok(firstActive.match.revision > waiting.body.revision);
  assert.ok(firstActive.match.revision > firstCountdown.match.revision);
  assert.equal(firstActive.match.revision, secondActive.match.revision);
  assert.deepEqual(firstActive.match.state, secondActive.match.state);
  assert.equal(firstActive.match.turnDeadline, null);
  assert.equal(firstActive.match.awaitingTurnReceipt.seat, firstActive.match.state.nextPlayer);

  const firstStarter = firstActive.match.awaitingTurnReceipt.seat === "first" ? first : second;
  const initialTurnStarted = Promise.all([
    first.waitFor((payload) => payload.type === "match" && payload.match.turnDeadline !== null),
    second.waitFor((payload) => payload.type === "match" && payload.match.turnDeadline !== null),
  ]);
  firstStarter.send({ type: "turn-received", revision: firstActive.match.revision });
  const [firstTurnReady, secondTurnReady] = await initialTurnStarted;
  assert.equal(firstTurnReady.match.revision, secondTurnReady.match.revision);
  assert.equal(firstTurnReady.match.awaitingTurnReceipt, null);

  const mover = firstTurnReady.match.state.nextPlayer === "first" ? first : second;
  const moveActionId = "integration-move-1";
  const action = {
    protocolVersion: 1, gameId: "connect-four", rulesVersion: RULES_VERSION, type: "submit-action", matchId,
    actionId: moveActionId, expectedRevision: firstTurnReady.match.revision,
    action: { type: "drop-token", column: 3 },
  };
  const movedPredicate = (payload) => payload.type === "match" && payload.match.state?.moves.length === 1;
  const moved = Promise.all([first.waitFor(movedPredicate), second.waitFor(movedPredicate)]);
  mover.send(action);
  const [firstMoved, secondMoved] = await moved;
  assert.equal(firstMoved.match.revision, secondMoved.match.revision);
  assert.deepEqual(firstMoved.match.state, secondMoved.match.state);
  assert.equal(firstMoved.match.turnDeadline, null);
  assert.equal(firstMoved.match.awaitingTurnReceipt.seat, firstMoved.match.state.nextPlayer);

  const nextPlayer = firstMoved.match.awaitingTurnReceipt.seat === "first" ? first : second;
  const nextTurnStarted = Promise.all([
    first.waitFor((payload) => payload.type === "match" && payload.match.turnDeadline !== null && payload.match.revision > firstMoved.match.revision),
    second.waitFor((payload) => payload.type === "match" && payload.match.turnDeadline !== null && payload.match.revision > firstMoved.match.revision),
  ]);
  nextPlayer.send({ type: "turn-received", revision: firstMoved.match.revision });
  const [firstNextTurn, secondNextTurn] = await nextTurnStarted;
  assert.equal(firstNextTurn.match.revision, secondNextTurn.match.revision);

  const syncId = "integration-sync-1";
  const synchronized = mover.waitFor((payload) => payload.type === "match" && payload.syncId === syncId);
  mover.send({ type: "sync", syncId });
  const syncSnapshot = await synchronized;
  assert.equal(syncSnapshot.match.revision, firstNextTurn.match.revision);
  assert.deepEqual(syncSnapshot.match.state, firstNextTurn.match.state);
  const rateLimitedSyncId = "integration-sync-2";
  const rateLimited = mover.waitFor((payload) => payload.type === "sync-rejected" && payload.syncId === rateLimitedSyncId);
  mover.send({ type: "sync", syncId: rateLimitedSyncId });
  assert.equal((await rateLimited).code, "rate-limited");
  for (const type of ["concede-series", "next-game", "rematch"]) {
    const authoritative = mover.waitFor((payload) => payload.type === "match" && payload.match.revision === firstNextTurn.match.revision);
    mover.send({ type });
    const currentMatch = await authoritative;
    assert.equal(currentMatch.match.status, "active");
    assert.deepEqual(currentMatch.match.state, firstNextTurn.match.state);
  }

  const duplicate = mover.waitFor((payload) => payload.acceptedActionId === moveActionId);
  mover.send(action);
  const duplicateResponse = await duplicate;
  assert.equal(duplicateResponse.match.revision, firstNextTurn.match.revision);
  assert.equal(duplicateResponse.match.turnDeadline, firstNextTurn.match.turnDeadline);
  const authorized = await api(worker.baseUrl, `/v1/matches/${matchId}`, {
    headers: { Authorization: `Bearer ${created.body.seatToken}` },
  });
  assert.equal(authorized.response.status, 200);
  assert.equal(authorized.body.state.moves.length, 1);
  const unauthorized = await api(worker.baseUrl, `/v1/matches/${matchId}`);
  assert.equal(unauthorized.response.status, 401);

  const stale = mover.waitFor((payload) => payload.type === "action-rejected" && payload.code === "stale-revision");
  mover.send({ ...action, actionId: "integration-stale-1", expectedRevision: firstMoved.match.revision - 1 });
  await stale;
  const afterStale = await api(worker.baseUrl, `/v1/matches/${matchId}`, {
    headers: { Authorization: `Bearer ${created.body.seatToken}` },
  });
  assert.equal(afterStale.body.state.moves.length, 1);
  assert.equal(afterStale.body.revision, firstNextTurn.match.revision);

  clients.splice(0).forEach((client) => client.close());
  await Promise.all([first, second].map((client) => new Promise((resolve) => client.socket.once("close", resolve))));
  await stopWorker(worker.process);
  worker = await startWorker(port, persistencePath);
  const restored = await api(worker.baseUrl, `/v1/matches/${matchId}`, {
    headers: { Authorization: `Bearer ${created.body.seatToken}` },
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.state.moves.length, 1);
  assert.ok(restored.body.revision >= firstMoved.match.revision);

  const resumedFirst = socketClient(worker.baseUrl, matchId, created.body.seatToken);
  const resumedSecond = socketClient(worker.baseUrl, matchId, joined.body.seatToken);
  clients.push(resumedFirst, resumedSecond);
  await Promise.all([resumedFirst.openAndAuthenticate(), resumedSecond.openAndAuthenticate()]);
  const connectedPredicate = (payload) => payload.type === "match" && payload.match.connectedSeats.every(Boolean);
  const [resumedA, resumedB] = await Promise.all([
    resumedFirst.waitFor(connectedPredicate), resumedSecond.waitFor(connectedPredicate),
  ]);
  assert.deepEqual(resumedA.match.state, resumedB.match.state);
  assert.equal(resumedA.match.state.moves.length, 1);
});
