import assert from "node:assert/strict";
import test from "node:test";
import { MatchApiClient } from "../src/services/match/match-api-client.ts";

test("account-aware room creation waits for the resolved token and sends it to the Worker", async () => {
  const originalFetch = globalThis.fetch;
  let releaseToken;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ matchId: "abcdefghijklmnopqrstuv", seatToken: "seat-token" });
  };
  try {
    const client = new MatchApiClient(
      "https://games.example",
      () =>
        new Promise((resolve) => {
          releaseToken = resolve;
        }),
    );
    const pending = client.createMatch({
      gameId: "connect-four",
      rulesVersion: 1,
      visibility: "invite",
      seriesTarget: 1,
      displayName: "GuestName",
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.equal(calls.length, 0);
    releaseToken("restored-session-token");
    await pending;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://games.example/v1/matches");
    assert.equal(
      new Headers(calls[0].init.headers).get("authorization"),
      "Bearer restored-session-token",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed account restoration prevents the room request instead of downgrading to guest", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json({});
  };
  try {
    const client = new MatchApiClient("https://games.example", async () => {
      throw new Error("Account check failed");
    });
    await assert.rejects(
      client.createMatch({
        gameId: "connect-four",
        rulesVersion: 1,
        visibility: "public",
        seriesTarget: 1,
        displayName: "GuestName",
      }),
      /Account check failed/,
    );
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("account-selected joins fail closed when the account token is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json({});
  };
  try {
    const client = new MatchApiClient("https://games.example", async () => null);
    await assert.rejects(
      client.joinMatch("abcdefghijklmnopqrstuv", {
        inviteToken: null,
        displayName: null,
        identityMode: "account",
        supportedGames: { "connect-four": [1] },
      }),
      /sign-in session is unavailable/i,
    );
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("guest-selected joins do not request or send an account token", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  let tokenReads = 0;
  globalThis.fetch = async (_url, init) => {
    requestCount += 1;
    assert.equal(new Headers(init.headers).has("authorization"), false);
    return Response.json({ seatToken: "seat-token", seat: "second" });
  };
  try {
    const client = new MatchApiClient("https://games.example", async () => {
      tokenReads += 1;
      return null;
    });
    await client.joinMatch("abcdefghijklmnopqrstuv", {
      inviteToken: null,
      displayName: "Swift Fox 42",
      identityMode: "guest",
      supportedGames: { "connect-four": [1] },
    });
    assert.equal(requestCount, 1);
    assert.equal(tokenReads, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
