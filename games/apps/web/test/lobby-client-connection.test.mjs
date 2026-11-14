import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith("file:") &&
      !extname(specifier)
    ) {
      const parentDirectory = dirname(fileURLToPath(context.parentURL));
      for (const extension of [".ts", ".tsx", ".js"]) {
        if (existsSync(resolve(parentDirectory, `${specifier}${extension}`))) {
          return nextResolve(`${specifier}${extension}`, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const scheduled = new Map();
let nextTimerId = 1;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send() {}

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    for (const listener of this.listeners.get("close") ?? []) listener();
  }
}

globalThis.window = {
  location: { origin: "https://games.test", search: "" },
  setTimeout(callback, delay) {
    const id = nextTimerId++;
    scheduled.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) {
    scheduled.delete(id);
  },
};
globalThis.document = {
  visibilityState: "visible",
  querySelector: () => ({ content: "https://games.test" }),
};
globalThis.WebSocket = FakeWebSocket;

const { LobbyClient } = await import("../src/features/lobby/lobby-client.ts");

function makeClient() {
  scheduled.clear();
  const client = new LobbyClient();
  client.setVisible(true);
  return client;
}

function fireTimer(delay) {
  const entry = [...scheduled.entries()].find(([, timer]) => timer.delay === delay);
  assert.ok(entry, `expected a ${delay}ms timer`);
  scheduled.delete(entry[0]);
  entry[1].callback();
}

test("a lobby WebSocket that never opens is closed and retried", () => {
  const client = makeClient();
  const socket = client.socket;

  fireTimer(10_000);

  assert.equal(socket.readyState, FakeWebSocket.CLOSED);
  assert.equal(client.getSnapshot().connection, "reconnecting");
  assert.equal(
    client.getSnapshot().error,
    "Live matches are taking too long to load. Reconnecting…",
  );
  assert.ok([...scheduled.values()].some((timer) => timer.delay === 1_000));
  client.setVisible(false);
});

test("an open lobby socket without its initial snapshot is closed and retried", () => {
  const client = makeClient();
  const socket = client.socket;
  socket.readyState = FakeWebSocket.OPEN;
  for (const listener of socket.listeners.get("open") ?? []) listener();

  fireTimer(10_000);

  assert.equal(socket.readyState, FakeWebSocket.CLOSED);
  assert.equal(client.getSnapshot().connection, "reconnecting");
  assert.ok([...scheduled.values()].some((timer) => timer.delay === 1_000));
  client.setVisible(false);
});
