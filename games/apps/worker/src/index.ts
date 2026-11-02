import { invalid, isMatchReactionId, normalizeQuickMessage, parseActionCommand } from "@portfolio-games/contracts";
import type { ActionCommand, PlayerSeat, RuntimeTwoPlayerGame, ValidationResult } from "@portfolio-games/contracts";
import { workerGames } from "./games/registry.js";
import { opponentProviderForGame, opponentProviderForVersion } from "./games/opponents.js";

const DEFAULT_TURN_DURATION_MS = 45_000;
const DEFAULT_RECONNECT_DURATION_MS = 60_000;
const ROOM_TTL_MS = 5 * 60_000;
const INVITE_TTL_MS = 24 * 60 * 60_000;
const COUNTDOWN_MS = 2_000;
const NEXT_GAME_TIMEOUT_MS = 30_000;
const TERMINAL_MATCH_RETENTION_MS = 24 * 60 * 60_000;
const AUTH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 4_096;
const MAX_FRAME_BYTES = 2_048;
const MAX_ACTIONS_PER_10S = 30;
const MAX_SOCIAL_EVENTS_PER_10S = 6;
const REACTION_COOLDOWN_MS = 800;
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const NAME_ADJECTIVES = ['Bright', 'Clever', 'Golden', 'Happy', 'Merry', 'Quiet', 'Swift', 'Witty'];
const NAME_ANIMALS = ['Badger', 'Comet', 'Falcon', 'Fox', 'Otter', 'Panda', 'Raven', 'Tiger'];
type Visibility = "public" | "invite";
type GameId = string;
const SUPPORTED_GAME_IDS = workerGames.entries.map((game) => game.gameId);
type Status = "waiting" | "countdown" | "active" | "between-games" | "completed" | "cancelled" | "expired";
type Seat = { tokenHash: string | null; kind?: "human" | "ai"; aiProfileId?: string; displayName?: string; connected: boolean; reconnectRemainingMs: number; disconnectedAt: number | null; turnReceiptSupported?: boolean };
type Match = {
  id: string; gameId: GameId; rulesVersion: number; visibility: Visibility; status: Status; createdAt: number; expiresAt: number;
  retentionDeadline?: number | null;
  revision: number; state: unknown | null; seats: [Seat | null, Seat | null];
  countdownAt: number | null; turnDeadline: number | null; turnStartedAt: number | null;
  nextGameDeadline: number | null;
  reconnectSeat: PlayerSeat | null; reconnectDeadline: number | null; pausedTurnMs: number | null;
  turnReceiptPending?: boolean;
  turnReceiptStartedAt?: number | null;
  outcome: string | null; recentActions: Record<string, unknown>; actionTimes: [number[], number[]];
  seriesTarget: 1 | 2 | 3; wins: { first: number; second: number }; gameNumber: number;
  seriesStartingSeat: PlayerSeat | null; nextStartingSeat: PlayerSeat | null;
  nextReady: [boolean, boolean]; rematchReady: [boolean, boolean]; closedSeats: [boolean, boolean];
  rematchCountdown: boolean; seriesWinner: PlayerSeat | null;
  aiSeed?: number | null;
  aiEngineVersion?: number | null;
};
type LobbyEntry = Readonly<{
  matchId: string; gameId: GameId; displayName: string; seriesTarget: 1 | 2 | 3; createdAt: number; expiresAt: number;
}>;
type SocketAttachment = { authenticated: false; authDeadline: number } | {
  authenticated: true; seat: PlayerSeat; lastSyncAt?: number; reactionTimes?: number[];
};

function gameForMatch(match: Pick<Match, 'gameId' | 'rulesVersion'>): RuntimeTwoPlayerGame | null {
  return workerGames.get(match.gameId, match.rulesVersion);
}

function sessionPolicy(match: Pick<Match, 'gameId' | 'rulesVersion'>) {
  return gameForMatch(match)?.getSessionPolicy(match.rulesVersion) ?? {
    turnDurationMs: DEFAULT_TURN_DURATION_MS,
    reconnectDurationMs: DEFAULT_RECONNECT_DURATION_MS,
  };
}

/** Exact per-game support avoids comparing unrelated games' rules-version numbers. */
function clientSupportsMatchRules(supportedGames: unknown, legacyVersion: unknown, match: Match): boolean {
  if (typeof supportedGames === 'object' && supportedGames !== null && !Array.isArray(supportedGames)) {
    const versions = (supportedGames as Record<string, unknown>)[match.gameId];
    return Array.isArray(versions) && versions.some((version) => version === match.rulesVersion);
  }
  // Older deployed clients only report Connect Four's current numeric version.
  return match.gameId === 'connect-four' && typeof legacyVersion === 'number' && Number.isSafeInteger(legacyVersion) && legacyVersion >= match.rulesVersion;
}

function parseGameCommand(input: unknown, game: RuntimeTwoPlayerGame, rulesVersion: number): ValidationResult<ActionCommand<unknown>> {
  const parsed = parseActionCommand(input, (action) => game.parseAction(action, rulesVersion));
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== game.gameId) return invalid('gameId', 'Unsupported game.');
  if (parsed.value.rulesVersion !== rulesVersion) return invalid('rulesVersion', 'Unsupported game rules version.');
  return parsed;
}

function stateStartingPlayer(match: Match): PlayerSeat | null {
  if (match.state === null) return null;
  const inspected = gameForMatch(match)?.inspectState(match.state, match.rulesVersion);
  return inspected?.ok ? inspected.value.startingPlayer : null;
}

function stateNextPlayer(match: Match): PlayerSeat | null {
  if (match.state === null) return null;
  const inspected = gameForMatch(match)?.inspectState(match.state, match.rulesVersion);
  return inspected?.ok ? inspected.value.nextPlayer : null;
}

async function setAlarmIfChanged(storage: DurableObjectStorage, deadline: number | null): Promise<void> {
  const current = await storage.getAlarm();
  if (deadline === null) {
    if (current !== null) await storage.deleteAlarm();
  } else if (current !== deadline) {
    await storage.setAlarm(deadline);
  }
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
});

function token(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function body(request: Request): Promise<unknown | null> {
  const size = Number(request.headers.get("content-length"));
  if (Number.isFinite(size) && size > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return null;
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}
function origins(env: WorkerEnv): string[] { return env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean); }
function isAllowed(request: Request, env: WorkerEnv): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origins(env).includes(origin);
  const path = new URL(request.url).pathname;
  return request.method === "GET" && /^\/v1\/matches\/[A-Za-z0-9_-]{22}$/.test(path) &&
    Boolean(request.headers.get("authorization"));
}
function cors(request: Request, env: WorkerEnv): HeadersInit {
  const origin = request.headers.get("origin");
  return origin && origins(env).includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", Vary: "Origin" }
    : {};
}
function createId(): string { return token(16).replaceAll("-", "X").replaceAll("_", "Y").slice(0, 22); }
function fallbackDisplayName(matchId: string, seatIndex: number): string {
  let value = 2_166_136_261 ^ (seatIndex * 2_246_822_519);
  for (const character of matchId) value = Math.imul(value ^ character.charCodeAt(0), 16_777_619);
  const unsigned = value >>> 0;
  return `${NAME_ADJECTIVES[unsigned % NAME_ADJECTIVES.length]} ${NAME_ANIMALS[(unsigned >>> 8) % NAME_ANIMALS.length]} ${(unsigned >>> 16) % 100}`;
}
function normalizeDisplayName(value: unknown, matchId: string, seatIndex: number): string {
  if (typeof value !== 'string') return fallbackDisplayName(matchId, seatIndex);
  const cleaned = Array.from(value.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ').trim()).slice(0, 24).join('');
  return cleaned || fallbackDisplayName(matchId, seatIndex);
}
function displayNameKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}
function uniqueGeneratedDisplayName(matchId: string, seatIndex: number, otherNames: readonly string[]): string {
  for (let variant = 0; variant < 32; variant += 1) {
    const candidate = fallbackDisplayName(matchId, seatIndex + variant);
    if (!otherNames.some((name) => displayNameKey(name) === displayNameKey(candidate))) return candidate;
  }
  const base = fallbackDisplayName(matchId, seatIndex);
  let suffix = 2;
  let candidate = `${base} ${suffix}`;
  while (otherNames.some((name) => displayNameKey(name) === displayNameKey(candidate))) {
    suffix += 1;
    candidate = `${base} ${suffix}`;
  }
  return candidate;
}
function snapshot(match: Match) {
  const now = Date.now();
  return {
    matchId: match.id, gameId: match.gameId, rulesVersion: match.rulesVersion, visibility: match.visibility, status: match.status, revision: match.revision,
    state: match.state, connectedSeats: match.seats.map((seat) => Boolean(seat?.connected)),
    playerNames: match.seats.map((seat) => seat?.displayName ?? null),
    seatKinds: match.seats.map((seat) => seat?.kind ?? "human"),
    countdownAt: match.countdownAt, turnDeadline: match.turnDeadline, nextGameDeadline: match.nextGameDeadline, outcome: match.outcome,
    expiresAt: match.expiresAt, serverNow: Date.now(), seriesTarget: match.seriesTarget,
    bestOf: match.seriesTarget * 2 - 1, wins: match.wins, gameNumber: match.gameNumber,
    nextReady: match.nextReady, rematchReady: match.rematchReady, closedSeats: match.closedSeats,
    seriesWinner: match.seriesWinner, nextStartingSeat: match.nextStartingSeat,
    rematchCountdown: match.rematchCountdown,
    reconnectRemainingMs: match.seats.map((seat, index) => {
      if (!seat) return null;
      const playerSeat = index === 0 ? "first" : "second";
      if (match.status === "active" && match.reconnectSeat === playerSeat && match.reconnectDeadline !== null) {
        return Math.max(0, match.reconnectDeadline - now);
      }
      if (match.status === "between-games" && !seat.connected && seat.disconnectedAt !== null) {
        return Math.max(0, seat.reconnectRemainingMs - (now - seat.disconnectedAt));
      }
      return seat.reconnectRemainingMs;
    }),
    awaitingTurnReceipt: match.turnReceiptPending && match.reconnectSeat && match.reconnectDeadline !== null
      ? { seat: match.reconnectSeat, deadline: match.reconnectDeadline }
      : null,
  };
}
function expiredStatus(match: Match): boolean {
  return match.status === "cancelled" || match.status === "expired";
}
function otherSeat(seat: PlayerSeat): PlayerSeat { return seat === "first" ? "second" : "first"; }
function outcomeWinner(outcome: string): PlayerSeat | null {
  if (outcome === "draw") return null;
  if (outcome.startsWith("win-")) return outcome.endsWith("first") ? "first" : outcome.endsWith("second") ? "second" : null;
  if (outcome.endsWith("-first")) return "second";
  if (outcome.endsWith("-second")) return "first";
  return null;
}
function normalizeMatch(match: Match): Match {
  const now = Date.now();
  const legacy = match as Match & { seriesTarget?: number; wins?: Match["wins"] };
  const target = legacy.seriesTarget === 1 || legacy.seriesTarget === 2 || legacy.seriesTarget === 3 ? legacy.seriesTarget : 1;
  const wins = legacy.wins && Number.isSafeInteger(legacy.wins.first) && Number.isSafeInteger(legacy.wins.second)
    ? legacy.wins : { first: 0, second: 0 };
  const priorWinner = match.status === "completed" && !legacy.seriesTarget && match.outcome
    ? outcomeWinner(match.outcome) : null;
  if (priorWinner) wins[priorWinner] = Math.max(wins[priorWinner], target);
  const normalized: Match = {
    ...match,
    gameId: typeof match.gameId === "string" ? match.gameId : "connect-four",
    rulesVersion: Number.isSafeInteger(match.rulesVersion) && match.rulesVersion > 0 ? match.rulesVersion : 1,
    seats: match.seats.map((seat, index) => seat ? {
      ...seat, kind: seat.kind === "ai" ? "ai" : "human",
      ...(seat.kind === "ai" ? {
        aiProfileId: opponentProviderForGame(match.gameId)?.supportsProfile(seat.aiProfileId)
          ? seat.aiProfileId
          : opponentProviderForGame(match.gameId)?.defaultProfileId ?? "standard",
      } : {}),
      tokenHash: typeof seat.tokenHash === "string" ? seat.tokenHash : null,
      displayName: normalizeDisplayName(seat.displayName, match.id, index),
    } : null) as Match['seats'],
    seriesTarget: target, wins, gameNumber: Number.isSafeInteger(match.gameNumber) ? match.gameNumber : 1,
    nextGameDeadline: Number.isFinite(match.nextGameDeadline)
      ? match.nextGameDeadline
      : match.status === "between-games" ? now + NEXT_GAME_TIMEOUT_MS : null,
    seriesStartingSeat: match.seriesStartingSeat ?? stateStartingPlayer(match),
    nextStartingSeat: match.nextStartingSeat ?? null, nextReady: match.nextReady ?? [false, false],
    rematchReady: match.rematchReady ?? [false, false], closedSeats: match.closedSeats ?? [false, false],
    rematchCountdown: match.rematchCountdown ?? false,
    seriesWinner: match.seriesWinner ?? priorWinner,
    turnReceiptPending: match.turnReceiptPending === true,
    turnReceiptStartedAt: match.turnReceiptPending === true
      ? typeof match.turnReceiptStartedAt === "number" && Number.isFinite(match.turnReceiptStartedAt) ? match.turnReceiptStartedAt : now
      : null,
  };
  normalized.countdownAt = Number.isFinite(normalized.countdownAt) ? normalized.countdownAt : null;
  normalized.turnDeadline = Number.isFinite(normalized.turnDeadline) ? normalized.turnDeadline : null;
  normalized.turnStartedAt = Number.isFinite(normalized.turnStartedAt) ? normalized.turnStartedAt : null;
  normalized.reconnectSeat = normalized.reconnectSeat === "first" || normalized.reconnectSeat === "second"
    ? normalized.reconnectSeat : null;
  normalized.reconnectDeadline = Number.isFinite(normalized.reconnectDeadline) ? normalized.reconnectDeadline : null;
  normalized.pausedTurnMs = Number.isFinite(normalized.pausedTurnMs) ? normalized.pausedTurnMs : null;
  if (normalized.status !== "active" || normalized.reconnectSeat === null) {
    normalized.turnReceiptPending = false;
    normalized.turnReceiptStartedAt = null;
  }
  if (normalized.status === "active") {
    if (normalized.reconnectSeat === null) {
      normalized.reconnectDeadline = null;
      normalized.pausedTurnMs = null;
      if (normalized.turnDeadline === null) {
        normalized.turnStartedAt = now;
        normalized.turnDeadline = now + sessionPolicy(normalized).turnDurationMs;
      }
    } else {
      normalized.turnDeadline = null;
      if (normalized.reconnectDeadline === null) {
        const seatIndex = normalized.reconnectSeat === "first" ? 0 : 1;
        const seat = normalized.seats[seatIndex];
        normalized.reconnectDeadline = seat && Number.isFinite(seat.disconnectedAt)
          ? seat.disconnectedAt! + Math.max(0, seat.reconnectRemainingMs)
          : now + Math.max(0, seat?.reconnectRemainingMs ?? 0);
      }
    }
  }
  if (normalized.status === "countdown" && normalized.countdownAt === null) normalized.countdownAt = now + COUNTDOWN_MS;
  normalized.aiSeed = typeof normalized.aiSeed === "number" && Number.isSafeInteger(normalized.aiSeed) ? normalized.aiSeed : null;
  normalized.aiEngineVersion = normalized.seats.some((seat) => seat?.kind === "ai")
    ? typeof normalized.aiEngineVersion === "number" && Number.isSafeInteger(normalized.aiEngineVersion)
      ? normalized.aiEngineVersion
      : opponentProviderForGame(normalized.gameId)?.currentEngineVersion ?? null
    : null;
  return normalized;
}
function timerStateNeedsPersistence(original: Match, normalized: Match): boolean {
  const fields = ["countdownAt", "turnDeadline", "turnStartedAt", "nextGameDeadline", "reconnectSeat", "reconnectDeadline", "pausedTurnMs", "turnReceiptPending", "turnReceiptStartedAt"] as const;
    return fields.some((field) => !Object.hasOwn(original, field) || original[field] !== normalized[field]);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const headers = cors(request, env);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/health" && request.method === "GET") return json({ status: "ok" }, 200, headers);
    if (!isAllowed(request, env)) return json({ error: "origin-not-allowed" }, 403, headers);

    if ((url.pathname === "/v1/lobby" && request.method === "GET") ||
      (url.pathname === "/v1/lobby/socket" && request.headers.get("upgrade")?.toLowerCase() === "websocket")) {
      const source = request.headers.get("cf-connecting-ip") ?? "local-development";
      const { success } = await env.ROOMS_RATE_LIMITER.limit({ key: `lobby-list:${source}` });
      if (!success) return json({ error: "rate-limited", message: "Too many lobby connections. Wait a moment and reconnect." }, 429, { ...headers, "Retry-After": "60" });
      const requestedGameId = url.searchParams.get("gameId");
      if (requestedGameId && !SUPPORTED_GAME_IDS.includes(requestedGameId as GameId)) return json({ error: "unsupported-game" }, 404, headers);
      const hub = env.LOBBY_HUB.get(env.LOBBY_HUB.idFromName("lobby:global"));
      const hubUrl = new URL(request.url);
      hubUrl.hostname = "lobby-hub.internal";
      hubUrl.protocol = "https:";
      if (url.pathname === "/v1/lobby/socket") {
        return hub.fetch(new Request(hubUrl, { headers: { Upgrade: "websocket" } }));
      }
      hubUrl.pathname = "/list";
      const response = await hub.fetch(new Request(hubUrl));
      if (!response.ok) return json({ error: "lobby-unavailable", message: "Open matches are unavailable right now. Reconnect to try again." }, 503, headers);
      return json(await response.json(), 200, headers);
    }

    if ((request.method === "POST" && (url.pathname === "/v1/matches" || url.pathname === "/v1/matches/ai" || /^\/v1\/matches\/[A-Za-z0-9_-]{22}\/(?:join|preview)$/.test(url.pathname)))) {
      const source = request.headers.get("cf-connecting-ip") ?? "local-development";
      const { success } = await env.ROOMS_RATE_LIMITER.limit({ key: `room-operations:${source}` });
      if (!success) return json({ error: "rate-limited", message: "Too many game room requests. Wait a moment and try again." }, 429, { ...headers, "Retry-After": "60" });
    }

    if (url.pathname === "/v1/matches" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid-request" }, 400, headers);
      const values = input as Record<string, unknown>;
      const gameId = typeof values.gameId === "string" ? values.gameId : "connect-four";
      const game = workerGames.get(gameId);
      if (!game) return json({ error: "unsupported-game" }, 404, headers);
      // Older cached clients omit this field and only understand Connect Four v1.
      const rulesVersion = values.rulesVersion ?? (game.gameId === "connect-four" ? 1 : game.rulesVersion);
      if (typeof rulesVersion !== "number" || !game.supportsRulesVersion(rulesVersion)) return json({ error: "unsupported-rules-version" }, 400, headers);
      const visibility = values.visibility;
      if (visibility !== "public" && visibility !== "invite") return json({ error: "invalid-visibility" }, 400, headers);
      const seriesTarget = values.seriesTarget;
      if (seriesTarget !== 1 && seriesTarget !== 2 && seriesTarget !== 3) return json({ error: "invalid-series-target" }, 400, headers);
      const id = createId();
      const seatToken = token();
      const inviteToken = visibility === "invite" ? token() : null;
      const now = Date.now();
      const displayName = normalizeDisplayName(values.displayName, id, 0);
      const match: Match = {
        id, gameId, rulesVersion, visibility, status: "waiting", createdAt: now,
        retentionDeadline: null,
        expiresAt: now + (visibility === "public" ? ROOM_TTL_MS : INVITE_TTL_MS),
        revision: 0, state: null,
        seats: [{ tokenHash: await hash(seatToken), displayName, connected: false, reconnectRemainingMs: game.getSessionPolicy(rulesVersion).reconnectDurationMs, disconnectedAt: null }, null],
        countdownAt: null, turnDeadline: null, turnStartedAt: null, nextGameDeadline: null,
        reconnectSeat: null, reconnectDeadline: null, pausedTurnMs: null, turnReceiptPending: false, turnReceiptStartedAt: null, outcome: null,
        recentActions: {}, actionTimes: [[], []],
        seriesTarget, wins: { first: 0, second: 0 }, gameNumber: 0,
        seriesStartingSeat: null, nextStartingSeat: null, nextReady: [false, false],
        rematchReady: [false, false], closedSeats: [false, false], rematchCountdown: false, seriesWinner: null,
      };
      const stub = env.MATCHES.get(env.MATCHES.idFromName(id));
      const created = await stub.fetch(new Request("https://match.internal/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match, inviteHash: inviteToken ? await hash(inviteToken) : null }),
      }));
      if (!created.ok) return json({ error: "match-create-failed" }, 503, headers);
      let listed = visibility !== "public";
      if (visibility === "public") {
        try {
          const lobby = env.LOBBY_HUB.get(env.LOBBY_HUB.idFromName("lobby:global"));
          const indexed = await lobby.fetch(new Request("https://lobby-hub.internal/upsert", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: id, gameId, displayName, seriesTarget, createdAt: now, expiresAt: match.expiresAt }),
          }));
          listed = indexed.ok;
        } catch { listed = false; }
      }
      return json({ matchId: id, gameId, visibility, seat: "first", seatToken, inviteToken, status: "waiting", expiresAt: match.expiresAt, seriesTarget, listed }, 201, headers);
    }

    if (url.pathname === "/v1/matches/ai" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid-request" }, 400, headers);
      const values = input as Record<string, unknown>;
      const gameId = typeof values.gameId === "string" ? values.gameId : "";
      const game = workerGames.get(gameId);
      const opponentProvider = opponentProviderForGame(gameId);
      if (!game || !opponentProvider) return json({ error: "unsupported-game" }, 404, headers);
      if (!opponentProvider.supportsProfile(values.profileId)) return json({ error: "unsupported-opponent" }, 400, headers);
      const seriesTarget = values.seriesTarget;
      if (seriesTarget !== 1 && seriesTarget !== 2 && seriesTarget !== 3) return json({ error: "invalid-series-target" }, 400, headers);
      const id = createId();
      const seatToken = token();
      const now = Date.now();
      const seedBytes = crypto.getRandomValues(new Uint32Array(1));
      const aiSeed = seedBytes[0] ?? 1;
      const humanName = normalizeDisplayName(values.displayName, id, 1);
      const requestedAiName = normalizeDisplayName(values.opponentName, id, 0);
      const aiName = displayNameKey(requestedAiName) === displayNameKey(humanName)
        ? uniqueGeneratedDisplayName(id, 1, [humanName])
        : requestedAiName;
      const policy = game.getSessionPolicy(game.rulesVersion);
      const match: Match = {
        id, gameId: game.gameId, rulesVersion: game.rulesVersion, visibility: "public", status: "waiting", createdAt: now,
        retentionDeadline: null, expiresAt: now + ROOM_TTL_MS, revision: 0, state: null,
        seats: [
          { tokenHash: null, kind: "ai", aiProfileId: values.profileId, displayName: aiName, connected: true, reconnectRemainingMs: policy.reconnectDurationMs, disconnectedAt: null },
          { tokenHash: await hash(seatToken), kind: "human", displayName: humanName, connected: false, reconnectRemainingMs: policy.reconnectDurationMs, disconnectedAt: null },
        ],
        countdownAt: null, turnDeadline: null, turnStartedAt: null, nextGameDeadline: null,
        reconnectSeat: null, reconnectDeadline: null, pausedTurnMs: null, turnReceiptPending: false, turnReceiptStartedAt: null, outcome: null,
        recentActions: {}, actionTimes: [[], []], seriesTarget, wins: { first: 0, second: 0 }, gameNumber: 0,
        seriesStartingSeat: null, nextStartingSeat: null, nextReady: [false, false], rematchReady: [false, false],
        closedSeats: [false, false], rematchCountdown: false, seriesWinner: null,
        aiSeed, aiEngineVersion: opponentProvider.currentEngineVersion,
      };
      const stub = env.MATCHES.get(env.MATCHES.idFromName(id));
      const created = await stub.fetch(new Request("https://match.internal/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match }),
      }));
      if (!created.ok) return json({ error: "match-create-failed" }, 503, headers);
      return json({ matchId: id, gameId: game.gameId, visibility: "public", seat: "second", seatToken, status: "waiting", expiresAt: match.expiresAt, seriesTarget }, 201, headers);
    }

    const route = url.pathname.match(/^\/v1\/matches\/([A-Za-z0-9_-]{22})(?:\/(join|preview|socket|resign|cancel|leave|leave-series))?$/);
    if (!route || !ID_PATTERN.test(route[1] ?? "")) return json({ error: "not-found" }, 404, headers);
    const id = route[1]!;
    const operation = route[2];
    const stub = env.MATCHES.get(env.MATCHES.idFromName(id));

    if (operation === "preview" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid-request" }, 400, headers);
      const inviteToken = (input as Record<string, unknown>).inviteToken;
      const values = input as Record<string, unknown>;
      const requestedVersion = values.rulesVersion ?? 1;
      if (typeof requestedVersion !== "number" || !Number.isSafeInteger(requestedVersion) || requestedVersion < 1) return json({ error: "unsupported-rules-version" }, 400, headers);
      const result = await stub.fetch(new Request("https://match.internal/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteHash: typeof inviteToken === "string" ? await hash(inviteToken) : null, clientSupportedGames: values.supportedGames, clientRulesVersion: requestedVersion }),
      }));
      return json(await result.json(), result.status, headers);
    }

    if (operation === "join" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid-request" }, 400, headers);
      const inviteToken = (input as Record<string, unknown>).inviteToken;
      const values = input as Record<string, unknown>;
      const requestedVersion = values.rulesVersion ?? 1;
      if (typeof requestedVersion !== "number" || !Number.isSafeInteger(requestedVersion) || requestedVersion < 1) return json({ error: "unsupported-rules-version" }, 400, headers);
      const seatToken = token();
      const result = await stub.fetch(new Request("https://match.internal/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteHash: typeof inviteToken === "string" ? await hash(inviteToken) : null,
          seatTokenHash: await hash(seatToken),
          displayName: normalizeDisplayName((input as Record<string, unknown>).displayName, id, 1),
          clientSupportedGames: values.supportedGames,
          clientRulesVersion: requestedVersion,
          now: Date.now(),
        }),
      }));
      const payload = await result.json() as Record<string, unknown>;
      return json(result.ok ? { ...payload, seatToken } : payload, result.status, headers);
    }
    if (operation === "socket" && request.method === "GET") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket-required" }, 426, headers);
      return stub.fetch(new Request("https://match.internal/socket", { method: "GET", headers: { Upgrade: "websocket" } }));
    }
    if (operation === "resign" && request.method === "POST") {
      const credential = request.headers.get("authorization");
      if (!credential) return json({ error: "unauthorized" }, 401, headers);
      return stub.fetch(new Request("https://match.internal/resign", { method: "POST", headers: { Authorization: credential } }));
    }
    if (operation === "cancel" && request.method === "POST") {
      const credential = request.headers.get("authorization");
      if (!credential) return json({ error: "unauthorized" }, 401, headers);
      const result = await stub.fetch(new Request("https://match.internal/cancel", { method: "POST", headers: { Authorization: credential } }));
      return json(await result.json(), result.status, headers);
    }
    if (operation === "leave" && request.method === "POST") {
      const credential = request.headers.get("authorization");
      if (!credential) return json({ error: "unauthorized" }, 401, headers);
      const result = await stub.fetch(new Request("https://match.internal/leave", { method: "POST", headers: { Authorization: credential } }));
      return json(await result.json(), result.status, headers);
    }
    if (operation === "leave-series" && request.method === "POST") {
      const credential = request.headers.get("authorization");
      if (!credential) return json({ error: "unauthorized" }, 401, headers);
      const result = await stub.fetch(new Request("https://match.internal/leave-series", { method: "POST", headers: { Authorization: credential } }));
      return json(await result.json(), result.status, headers);
    }
    if (!operation && request.method === "GET") {
      const snapshotHeaders = new Headers();
      const authorization = request.headers.get("authorization");
      if (authorization) snapshotHeaders.set("Authorization", authorization);
      const response = await stub.fetch(new Request("https://match.internal/snapshot", { headers: snapshotHeaders }));
      const payload = await response.json() as unknown;
      return json(payload, response.status, headers);
    }
    return json({ error: "not-found" }, 404, headers);
  },
};

export class MatchDurableObject {
  constructor(private readonly ctx: DurableObjectState, private readonly env: WorkerEnv) {}

  private async load(): Promise<Match | null> {
    const stored = await this.ctx.storage.get<Match>("match");
    if (!stored) return null;
    const normalized = normalizeMatch(stored);
    const game = gameForMatch(normalized);
    if (!game || (normalized.state !== null && !game.inspectState(normalized.state, normalized.rulesVersion).ok)) return null;
    let shouldPersist = timerStateNeedsPersistence(stored, normalized);
    if (["completed", "cancelled", "expired"].includes(normalized.status) &&
      (typeof normalized.retentionDeadline !== "number" || !Number.isFinite(normalized.retentionDeadline))) {
      normalized.retentionDeadline = Date.now() + TERMINAL_MATCH_RETENTION_MS;
      shouldPersist = true;
      await this.schedule(normalized);
    }
    if (shouldPersist) await this.ctx.storage.put("match", normalized);
    return normalized;
  }
  private async save(match: Match): Promise<void> { await this.ctx.storage.put("match", match); }

  async fetch(request: Request): Promise<Response> {
    const operation = new URL(request.url).pathname.split("/").at(-1);
    if (operation === "create" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object") return json({ error: "invalid-request" }, 400);
      const data = input as { match?: Match; inviteHash?: string | null };
      if (!data.match || !ID_PATTERN.test(data.match.id) || !["public", "invite"].includes(data.match.visibility)) return json({ error: "invalid-match" }, 400);
      if (await this.load()) return json({ error: "already-exists" }, 409);
      await this.save(data.match);
      if (data.match.visibility === "invite" && data.inviteHash) await this.ctx.storage.put("invite-hash", data.inviteHash);
      await this.schedule(data.match);
      return json({ ok: true }, 201);
    }
    if (operation === "join" && request.method === "POST") return this.join(request);
    if (operation === "preview" && request.method === "POST") return this.preview(request);
    if (operation === "cancel" && request.method === "POST") return this.cancelWaitingRoom(request);
    if (operation === "leave" && request.method === "POST") return this.leaveWaitingRoom(request);
    if (operation === "leave-series" && request.method === "POST") return this.leaveCompletedSeries(request);
    if (operation === "snapshot" && request.method === "GET") {
      const match = await this.load();
      if (!match) return json({ error: "not-found" }, 404);
      const credential = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!credential) return json({ error: "unauthorized" }, 401);
      const credentialHash = await hash(credential);
      if (!match.seats.some((seat) => seat?.tokenHash === credentialHash)) return json({ error: "unauthorized" }, 401);
      await this.alarm();
      const latest = await this.load();
      return latest ? json(snapshot(latest)) : json({ error: "not-found" }, 404);
    }
    if (operation === "socket" && request.method === "GET") return this.socketUpgrade();
    if (operation === "resign" && request.method === "POST") return this.resign(request);
    return json({ error: "not-found" }, 404);
  }

  private async join(request: Request): Promise<Response> {
    const input = await body(request);
    if (!input || typeof input !== "object") return json({ error: "invalid-request" }, 400);
    const data = input as { inviteHash?: unknown; seatTokenHash?: unknown; displayName?: unknown; clientRulesVersion?: unknown; clientSupportedGames?: unknown; now?: unknown };
    if (typeof data.seatTokenHash !== "string" || typeof data.now !== "number") return json({ error: "invalid-request" }, 400);
    const match = await this.load();
    if (!match) return json({ error: "not-found" }, 404);
    if (!clientSupportsMatchRules(data.clientSupportedGames, data.clientRulesVersion, match) || !gameForMatch(match)?.supportsRulesVersion(match.rulesVersion)) return json({ error: "client-update-required" }, 426);
    if (await this.expireWaitingRoom(match, data.now)) return json({ error: "room-expired" }, 410);
    if (match.status === "expired") return json({ error: "room-expired" }, 410);
    if (match.status === "cancelled") return json({ error: "room-unavailable" }, 410);
    if (match.status !== "waiting" || match.seats[1]) return json({ error: "room-full" }, 409);
    if (match.visibility === "invite") {
      const expected = await this.ctx.storage.get<string>("invite-hash");
      if (typeof data.inviteHash !== "string" || !expected || data.inviteHash !== expected) return json({ error: "invite-invalid" }, 403);
    }
    const displayName = normalizeDisplayName(data.displayName, match.id, 1);
    const hostDisplayName = normalizeDisplayName(match.seats[0]?.displayName, match.id, 0);
    if (displayNameKey(displayName) === displayNameKey(hostDisplayName)) {
      return json({ error: "player-name-taken" }, 409);
    }
    match.seats[1] = {
      tokenHash: data.seatTokenHash, displayName,
      connected: false, reconnectRemainingMs: sessionPolicy(match).reconnectDurationMs, disconnectedAt: null,
    };
    match.revision += 1;
    await this.save(match);
    await this.removeFromLobby(match);
    return json({ matchId: match.id, seat: "second", visibility: match.visibility, status: match.status });
  }

  private async preview(request: Request): Promise<Response> {
    const input = await body(request);
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid-request" }, 400);
    const data = input as { inviteHash?: unknown; clientRulesVersion?: unknown; clientSupportedGames?: unknown };
    const match = await this.load();
    if (!match) return json({ error: "not-found" }, 404);
    if (!clientSupportsMatchRules(data.clientSupportedGames, data.clientRulesVersion, match) || !gameForMatch(match)?.supportsRulesVersion(match.rulesVersion)) return json({ error: "client-update-required" }, 426);
    if (match.visibility === "invite") {
      const expected = await this.ctx.storage.get<string>("invite-hash");
      if (typeof data.inviteHash !== "string" || !expected || data.inviteHash !== expected) return json({ error: "invite-invalid" }, 403);
    }
    if (await this.expireWaitingRoom(match, Date.now())) return json({ error: "room-expired" }, 410);
    if (match.status === "expired") return json({ error: "room-expired" }, 410);
    if (match.status === "cancelled") return json({ error: "room-unavailable" }, 410);
    if (match.status !== "waiting" || match.seats[1]) return json({ error: "room-full" }, 409);
    return json({
      gameId: match.gameId,
      hostDisplayName: match.seats[0]?.displayName ?? null,
      visibility: match.visibility,
      seriesTarget: match.seriesTarget,
      turnSeconds: sessionPolicy(match).turnDurationMs / 1_000,
      turnTimeoutForfeitsGame: true,
      tiesAwardNoPoint: true,
    });
  }

  private async cancelWaitingRoom(request: Request): Promise<Response> {
    const match = await this.load();
    const credential = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!match || !credential) return json({ error: "unauthorized" }, 401);
    const tokenHash = await hash(credential);
    const index = match.seats.findIndex((seat) => seat?.tokenHash === tokenHash);
    if (index !== 0) return json({ error: "forbidden" }, 403);
    if (match.status !== "waiting" || match.seats[1]) return json({ error: match.seats[1] ? "room-full" : "room-not-waiting", match: snapshot(match) }, 409);
    match.status = "cancelled";
    match.outcome = "room-cancelled";
    match.retentionDeadline = Date.now() + TERMINAL_MATCH_RETENTION_MS;
    match.revision += 1;
    await this.publish(match);
    await this.removeFromLobby(match);
    return json({ match: snapshot(match) });
  }

  private async leaveWaitingRoom(request: Request): Promise<Response> {
    const match = await this.load();
    const credential = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!match || !credential) return json({ error: "unauthorized" }, 401);
    if (await this.expireWaitingRoom(match, Date.now())) return json({ error: "room-expired" }, 410);
    const tokenHash = await hash(credential);
    const index = match.seats.findIndex((seat) => seat?.tokenHash === tokenHash);
    if (index !== 1) return json({ error: "forbidden" }, 403);
    if (match.status !== "waiting") return json({ error: "room-not-waiting" }, 409);

    if (match.seats[0]?.kind === "ai") {
      match.status = "cancelled";
      match.outcome = "ai-match-left-before-start";
      match.retentionDeadline = Date.now() + TERMINAL_MATCH_RETENTION_MS;
      match.closedSeats[1] = true;
      match.revision += 1;
      await this.publish(match);
      return json({ match: snapshot(match) });
    }

    match.seats[1] = null;
    match.revision += 1;
    await this.save(match);
    await this.schedule(match);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
      if (attachment?.authenticated && attachment.seat === "second") socket.close(1000, "Player left the waiting room");
    }
    this.broadcast({ type: "match", match: snapshot(match) });
    if (match.visibility === "public") {
      try {
        const lobby = this.env.LOBBY_HUB.get(this.env.LOBBY_HUB.idFromName("lobby:global"));
        await lobby.fetch(new Request("https://lobby-hub.internal/upsert", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: match.id, gameId: match.gameId, displayName: match.seats[0]?.displayName ?? "Player", seriesTarget: match.seriesTarget, createdAt: match.createdAt, expiresAt: match.expiresAt }),
        }));
      } catch { /* The waiting room remains authoritative; the lobby entry can be refreshed later. */ }
    }
    return json({ match: snapshot(match) });
  }

  private async leaveCompletedSeries(request: Request): Promise<Response> {
    const match = await this.load();
    const credential = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!match || !credential) return json({ error: "unauthorized" }, 401);
    const tokenHash = await hash(credential);
    const index = match.seats.findIndex((seat) => seat?.tokenHash === tokenHash);
    if (index < 0) return json({ error: "unauthorized" }, 401);
    if (match.status === "completed" && match.closedSeats[index]) return json({ match: snapshot(match) });
    if (match.status === "countdown" && match.rematchCountdown) {
      match.status = "completed";
      match.countdownAt = null;
      match.rematchCountdown = false;
      match.rematchReady = [false, false];
    } else if (match.status !== "completed") {
      return json({ error: "series-not-complete" }, 409);
    }
    match.closedSeats[index] = true;
    match.rematchReady = [false, false];
    match.retentionDeadline ??= Date.now() + TERMINAL_MATCH_RETENTION_MS;
    match.revision += 1;
    await this.publish(match);
    return json({ match: snapshot(match) });
  }

  private async socketUpgrade(): Promise<Response> {
    const match = await this.load();
    if (!match || expiredStatus(match)) return json({ error: "match-unavailable" }, 409);
    await this.expireWaitingRoom(match, Date.now());
    if (expiredStatus(match)) return json({ error: "match-unavailable" }, 409);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment?.({ authenticated: false, authDeadline: Date.now() + AUTH_TIMEOUT_MS } satisfies SocketAttachment);
    await this.schedule(match);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_FRAME_BYTES) { socket.close(1009, "Message too large"); return; }
    let message: unknown;
    try { message = JSON.parse(raw) as unknown; } catch { socket.close(1007, "Invalid JSON"); return; }
    const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
    const match = await this.load();
    if (!attachment || !match) { socket.close(1011, "Match unavailable"); return; }

    if (!attachment.authenticated) {
      const authMessage = message as Record<string, unknown> | null;
      if (!authMessage || authMessage.type !== "authenticate" || typeof authMessage.seatToken !== "string" ||
        (authMessage.supportsTurnReceipt !== undefined && typeof authMessage.supportsTurnReceipt !== "boolean") ||
        Date.now() > attachment.authDeadline) {
        socket.close(1008, "Authentication required"); return;
      }
      const tokenHash = await hash(authMessage.seatToken);
      const index = match.seats.findIndex((seat) => seat?.tokenHash === tokenHash);
      if (index < 0 || !match.seats[index]) { socket.close(1008, "Invalid seat credential"); return; }
      const seat = index === 0 ? "first" : "second";
      if (match.closedSeats[index]) { socket.close(1008, "This seat has left the game"); return; }
      const now = Date.now();
      if (await this.expireWaitingRoom(match, now)) {
        socket.close(1008, "Waiting room expired");
        return;
      }
      const seatState = match.seats[index]!;
      seatState.turnReceiptSupported = authMessage.supportsTurnReceipt === true;
      const revisionBeforeAuthentication = match.revision;
      const wasConnected = seatState.connected;
      if (match.status === "between-games" && seatState.disconnectedAt !== null) {
        this.expireIntermissionDisconnects(match, now);
        if (match.closedSeats[index]) {
          await this.publish(match);
          socket.close(1008, "Reconnect window expired");
          return;
        }
        if (match.status === "between-games") {
          const disconnectedFor = now - seatState.disconnectedAt;
          seatState.reconnectRemainingMs = Math.max(0, seatState.reconnectRemainingMs - disconnectedFor);
          seatState.disconnectedAt = null;
        }
      }
      if (match.status === "active" && match.reconnectSeat === seat && match.reconnectDeadline !== null) {
        if (now >= match.reconnectDeadline) {
          await this.finishForfeit(match, seat, "reconnect-timeout");
          socket.close(1008, "Reconnect window expired");
          return;
        }
        if (!match.turnReceiptPending) {
          const disconnectedFor = seatState.disconnectedAt === null ? 0 : Date.now() - seatState.disconnectedAt;
          seatState.reconnectRemainingMs = Math.max(0, seatState.reconnectRemainingMs - disconnectedFor);
          seatState.disconnectedAt = null;
          match.turnDeadline = Date.now() + Math.max(0, match.pausedTurnMs ?? 0);
          match.turnStartedAt = Date.now();
          match.reconnectSeat = null;
          match.reconnectDeadline = null;
          match.pausedTurnMs = null;
        }
      }
      socket.serializeAttachment?.({ authenticated: true, seat } satisfies SocketAttachment);
      match.seats[index]!.connected = true;
      for (const oldSocket of this.ctx.getWebSockets()) {
        if (oldSocket === socket) continue;
        const oldAttachment = oldSocket.deserializeAttachment?.() as SocketAttachment | null;
        if (oldAttachment?.authenticated && oldAttachment.seat === seat) oldSocket.close(4001, "Replaced by a newer connection");
      }
      if (match.seats.every((entry) => entry?.connected) && match.status === "waiting") {
        match.status = "countdown";
        match.countdownAt = Date.now() + COUNTDOWN_MS;
      }
      if (match.status === "between-games" && match.seats.every((entry) => entry?.connected) &&
        (match.nextReady.every(Boolean) || (match.nextGameDeadline !== null && now >= match.nextGameDeadline))) {
        this.beginNextGameCountdown(match, now);
        match.revision += 1;
      }
      if (match.revision === revisionBeforeAuthentication && !wasConnected) match.revision += 1;
      await this.save(match);
      await this.schedule(match);
      socket.serializeAttachment?.({ authenticated: true, seat } satisfies SocketAttachment);
      this.broadcast({ type: "match", match: snapshot(match) });
      socket.send(JSON.stringify({ type: "match", match: snapshot(match) }));
      return;
    }

    if (!message || typeof message !== "object" || !("type" in message)) { socket.send(JSON.stringify({ type: "error", code: "invalid-message" })); return; }
    if (message.type === "ping") { socket.send(JSON.stringify({ type: "pong", at: Date.now() })); return; }
    if (message.type === "turn-received") {
      const receipt = message as Record<string, unknown>;
      if (Object.keys(receipt).some((key) => !["type", "revision"].includes(key)) ||
        !Number.isSafeInteger(receipt.revision)) {
        socket.send(JSON.stringify({ type: "error", code: "invalid-turn-receipt" }));
        return;
      }
      if (!match.turnReceiptPending || match.status !== "active" ||
        match.reconnectSeat !== attachment.seat ||
        stateNextPlayer(match) !== attachment.seat ||
        receipt.revision !== match.revision) {
        socket.send(JSON.stringify({ type: "match", match: snapshot(match) }));
        return;
      }
      const now = Date.now();
      if (match.reconnectDeadline === null || now >= match.reconnectDeadline) {
        await this.finishForfeit(match, attachment.seat, "reconnect-timeout");
        return;
      }
      const seat = match.seats[attachment.seat === "first" ? 0 : 1];
      if (!seat) return;
      if (seat.disconnectedAt !== null) {
        const receiptStartedAt = match.turnReceiptStartedAt ?? seat.disconnectedAt;
        const disconnectedSinceReceipt = Math.max(0, now - Math.max(seat.disconnectedAt, receiptStartedAt));
        seat.reconnectRemainingMs = Math.max(0, seat.reconnectRemainingMs - disconnectedSinceReceipt);
      }
      seat.connected = true;
      seat.disconnectedAt = null;
      match.turnDeadline = now + Math.max(0, match.pausedTurnMs ?? sessionPolicy(match).turnDurationMs);
      match.turnStartedAt = now;
      match.reconnectSeat = null;
      match.reconnectDeadline = null;
      match.pausedTurnMs = null;
      match.turnReceiptPending = false;
      match.turnReceiptStartedAt = null;
      match.revision += 1;
      await this.save(match);
      await this.schedule(match);
      this.broadcast({ type: "match", match: snapshot(match) });
      return;
    }
    if (message.type === "sync") {
      const syncId = "syncId" in message ? message.syncId : undefined;
      if (Object.keys(message).some((key) => !["type", "syncId"].includes(key)) ||
        typeof syncId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(syncId)) {
        socket.send(JSON.stringify({ type: "error", code: "invalid-sync" }));
        return;
      }
      const now = Date.now();
      if (await this.expireWaitingRoom(match, now)) return;
      if (attachment.lastSyncAt !== undefined && now - attachment.lastSyncAt < 500) {
        socket.send(JSON.stringify({ type: "sync-rejected", syncId, code: "rate-limited" }));
        return;
      }
      socket.serializeAttachment?.({ ...attachment, lastSyncAt: now } satisfies SocketAttachment);
      await this.alarm();
      const latest = await this.load();
      if (!latest) { socket.close(1011, "Match unavailable"); return; }
      socket.send(JSON.stringify({ type: "match", match: snapshot(latest), syncId }));
      return;
    }
    if (message.type === "reaction" || message.type === "quick-message") {
      const activity = message as Record<string, unknown>;
      const isReaction = message.type === "reaction";
      const validKeys = isReaction ? ["type", "reactionId"] : ["type", "message"];
      const reactionId = activity.reactionId;
      const text = normalizeQuickMessage(activity.message);
      if (Object.keys(activity).some((key) => !validKeys.includes(key)) ||
        (isReaction ? !isMatchReactionId(reactionId) : text === null)) {
        if (isReaction) socket.send(JSON.stringify({ type: "error", code: "invalid-reaction" }));
        else socket.send(JSON.stringify({ type: "quick-message-rejected", code: "invalid-message" }));
        return;
      }
      if (match.status !== "active") {
        socket.send(JSON.stringify({ type: isReaction ? "reaction-rejected" : "quick-message-rejected", code: "match-not-active" }));
        return;
      }
      if (match.seats.some((seat) => seat?.kind === "ai")) {
        socket.send(JSON.stringify({ type: isReaction ? "reaction-rejected" : "quick-message-rejected", code: "social-unavailable" }));
        return;
      }
      const now = Date.now();
      const reactionTimes = (attachment.reactionTimes ?? []).filter((at) => now - at < 10_000);
      const lastReactionAt = reactionTimes.at(-1) ?? 0;
      if (reactionTimes.length >= MAX_SOCIAL_EVENTS_PER_10S || now - lastReactionAt < REACTION_COOLDOWN_MS) {
        socket.send(JSON.stringify({ type: isReaction ? "reaction-rejected" : "quick-message-rejected", code: "rate-limited" }));
        return;
      }
      reactionTimes.push(now);
      socket.serializeAttachment?.({ ...attachment, reactionTimes } satisfies SocketAttachment);
      if (isReaction) this.broadcast({ type: "reaction", eventId: token(12), seat: attachment.seat, reactionId });
      else this.broadcast({ type: "quick-message", eventId: token(12), seat: attachment.seat, message: text });
      return;
    }
    if (message.type === "resign") {
      if (match.status !== "active") { socket.send(JSON.stringify({ type: "match", match: snapshot(match) })); return; }
      await this.finishForfeit(match, attachment.seat, "resigned");
      return;
    }
    if (message.type === "next-game") {
      if (match.status !== "between-games" || match.seriesWinner) {
        socket.send(JSON.stringify({ type: "match", match: snapshot(match) }));
        return;
      }
      await this.requestNextGame(match, attachment.seat);
      return;
    }
    if (message.type === "rematch") {
      if (match.status !== "completed" || !match.seriesWinner || match.closedSeats.some(Boolean)) {
        socket.send(JSON.stringify({ type: "match", match: snapshot(match) }));
        return;
      }
      await this.requestRematch(match, attachment.seat);
      return;
    }
    if (message.type === "concede-series") {
      if (match.status !== "between-games") {
        socket.send(JSON.stringify({ type: "match", match: snapshot(match) }));
        return;
      }
      await this.concedeSeries(match, attachment.seat);
      return;
    }
    if (message.type === "leave-game") {
      if (match.status !== "completed") { socket.send(JSON.stringify({ type: "error", code: "series-not-complete" })); return; }
      const index = attachment.seat === "first" ? 0 : 1;
      match.closedSeats[index] = true;
      match.rematchReady = [false, false];
      match.revision += 1;
      await this.publish(match);
      return;
    }
    if (message.type !== "submit-action") { socket.send(JSON.stringify({ type: "error", code: "unsupported-message" })); return; }
    const game = gameForMatch(match);
    if (!game || match.state === null) { socket.send(JSON.stringify({ type: "error", code: "unsupported-game" })); return; }
    const parsed = parseGameCommand(message, game, match.rulesVersion);
    if (!parsed.ok || parsed.value.matchId !== match.id) { socket.send(JSON.stringify({ type: "error", code: "invalid-action" })); return; }
    const command = parsed.value;
    if (Object.hasOwn(match.recentActions, command.actionId)) {
      const prior = match.recentActions[command.actionId] as Record<string, unknown>;
      socket.send(JSON.stringify({ ...prior, match: snapshot(match) }));
      return;
    }
    const now = Date.now();
    const index = attachment.seat === "first" ? 0 : 1;
    const times = match.actionTimes[index].filter((at) => now - at < 10_000);
    if (times.length >= MAX_ACTIONS_PER_10S) { socket.send(JSON.stringify({ type: "action-rejected", actionId: command.actionId, code: "rate-limited" })); return; }
    times.push(now);
    match.actionTimes[index] = times;
    if (match.status !== "active" || match.turnDeadline === null || now >= match.turnDeadline) { socket.send(JSON.stringify({ type: "action-rejected", actionId: command.actionId, code: "match-not-active" })); return; }
    if (command.expectedRevision !== match.revision) { socket.send(JSON.stringify({ type: "action-rejected", actionId: command.actionId, code: "stale-revision", revision: match.revision })); return; }
    if (stateNextPlayer(match) !== attachment.seat) { socket.send(JSON.stringify({ type: "action-rejected", actionId: command.actionId, code: "wrong-turn", revision: match.revision })); return; }
    const result = game.applyAction(match.state, attachment.seat, command.action, match.rulesVersion);
    if (!result.ok) { socket.send(JSON.stringify({ type: "action-rejected", actionId: command.actionId, code: result.error.code })); return; }
    const inspectedState = game.inspectState(result.value, match.rulesVersion);
    if (!inspectedState.ok) { socket.send(JSON.stringify({ type: "error", code: "invalid-game-state" })); return; }
    match.state = result.value;
    match.revision += 1;
    const gameOutcome = inspectedState.value.outcome;
    if (gameOutcome) {
      const outcome = gameOutcome.kind === "draw" ? "draw" : `win-${gameOutcome.winner}`;
      this.applyGameOutcome(match, outcome);
    } else {
      const nextPlayer = inspectedState.value.nextPlayer;
      const nextIndex = nextPlayer === "first" ? 0 : 1;
      const nextSeat = match.seats[nextIndex];
      if (nextPlayer && nextSeat) {
        if (nextSeat.turnReceiptSupported) {
          match.reconnectSeat = nextPlayer;
          match.reconnectDeadline = now + nextSeat.reconnectRemainingMs;
          match.pausedTurnMs = sessionPolicy(match).turnDurationMs;
          match.turnDeadline = null;
          match.turnStartedAt = null;
          match.turnReceiptPending = true;
          match.turnReceiptStartedAt = now;
          if (!nextSeat.connected) nextSeat.disconnectedAt ??= now;
        } else {
          match.reconnectSeat = null;
          match.reconnectDeadline = null;
          match.pausedTurnMs = null;
          match.turnReceiptPending = false;
          match.turnReceiptStartedAt = null;
          match.turnStartedAt = now;
          match.turnDeadline = now + sessionPolicy(match).turnDurationMs;
        }
      }
    }
    this.applyAiTurn(match, now);
    const event = { type: "match", match: snapshot(match), acceptedActionId: command.actionId };
    match.recentActions[command.actionId] = event;
    const actionIds = Object.keys(match.recentActions);
    for (const oldId of actionIds.slice(0, Math.max(0, actionIds.length - 64))) delete match.recentActions[oldId];
    await this.save(match);
    await this.schedule(match);
    this.broadcast(event);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
    if (!attachment?.authenticated) return;
    const hasReplacement = this.ctx.getWebSockets().some((candidate) => {
      if (candidate === socket) return false;
      const candidateAttachment = candidate.deserializeAttachment?.() as SocketAttachment | null;
      return candidateAttachment?.authenticated === true && candidateAttachment.seat === attachment.seat;
    });
    if (hasReplacement) return;
    const match = await this.load();
    if (!match) return;
    const index = attachment.seat === "first" ? 0 : 1;
    const seatState = match.seats[index];
    if (!seatState?.connected) return;
    const revisionBeforeDisconnect = match.revision;
    seatState.connected = false;
    seatState.disconnectedAt ??= Date.now();
    if (match.status === "countdown") {
      const wasRematch = match.rematchCountdown;
      match.status = wasRematch ? "completed" : match.gameNumber > 0 ? "between-games" : "waiting";
      match.countdownAt = null;
      match.rematchCountdown = false;
      if (wasRematch) match.rematchReady = [false, false];
      else if (match.gameNumber > 0) {
        match.nextReady = [false, false];
        match.nextGameDeadline = Date.now() + NEXT_GAME_TIMEOUT_MS;
      }
    }
    if (match.status === "active" && stateNextPlayer(match) === attachment.seat && match.turnDeadline !== null) {
      match.pausedTurnMs = Math.max(0, match.turnDeadline - Date.now());
      match.turnDeadline = null;
      match.reconnectSeat = attachment.seat;
      match.reconnectDeadline = Date.now() + match.seats[index]!.reconnectRemainingMs;
    }
    if (match.revision === revisionBeforeDisconnect) match.revision += 1;
    await this.save(match);
    await this.schedule(match);
    this.broadcast({ type: "match", match: snapshot(match) });
  }

  async alarm(): Promise<void> {
    const match = await this.load();
    if (!match) return;
    const now = Date.now();
    if (["completed", "cancelled", "expired"].includes(match.status)) {
      if (typeof match.retentionDeadline === "number" && now >= match.retentionDeadline) {
        for (const socket of this.ctx.getWebSockets()) socket.close(1000, "Match data expired");
        await this.ctx.storage.deleteAll();
        return;
      }
      await this.schedule(match);
      return;
    }
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
      if (attachment && !attachment.authenticated && now >= attachment.authDeadline) socket.close(1008, "Authentication timeout");
    }
    let changed = false;
    if (await this.expireWaitingRoom(match, now)) return;
    if (match.status === "countdown" && match.countdownAt !== null && now >= match.countdownAt) {
      if (match.seats.every((seat) => seat?.connected)) {
        const startsRematch = match.rematchCountdown;
        if (startsRematch) {
          match.wins = { first: 0, second: 0 };
          match.gameNumber = 0;
          match.seriesWinner = null;
          match.outcome = null;
          match.nextReady = [false, false];
          match.rematchReady = [false, false];
          match.closedSeats = [false, false];
        }
        const starter = match.nextStartingSeat ?? (crypto.getRandomValues(new Uint8Array(1))[0]! % 2 === 0 ? "first" : "second");
        const game = gameForMatch(match);
        if (!game) return;
        match.state = game.createState(starter, match.rulesVersion);
        if (match.gameNumber === 0) {
          match.gameNumber = 1;
          match.seriesStartingSeat = starter;
        } else match.gameNumber += 1;
        match.rematchCountdown = false;
        match.nextStartingSeat = null;
        match.status = "active";
        match.countdownAt = null;
        match.turnStartedAt = null;
        match.turnDeadline = null;
        const starterSeat = match.seats[starter === "first" ? 0 : 1];
        if (starterSeat?.turnReceiptSupported) {
          match.reconnectSeat = starter;
          match.reconnectDeadline = now + starterSeat.reconnectRemainingMs;
          match.pausedTurnMs = sessionPolicy(match).turnDurationMs;
          match.turnReceiptPending = true;
          match.turnReceiptStartedAt = now;
        } else {
          match.reconnectSeat = null;
          match.reconnectDeadline = null;
          match.pausedTurnMs = null;
          match.turnReceiptPending = false;
          match.turnReceiptStartedAt = null;
          match.turnStartedAt = now;
          match.turnDeadline = now + sessionPolicy(match).turnDurationMs;
        }
        this.applyAiTurn(match, now);
      } else {
        match.status = match.rematchCountdown ? "completed" : match.gameNumber > 0 ? "between-games" : "waiting";
        match.retentionDeadline = match.status === "completed" ? now + TERMINAL_MATCH_RETENTION_MS : null;
        match.countdownAt = null;
        match.rematchCountdown = false;
        match.nextReady = [false, false];
        match.rematchReady = [false, false];
        if (match.status === "between-games") match.nextGameDeadline = now + NEXT_GAME_TIMEOUT_MS;
      }
      match.revision += 1;
      changed = true;
    } else if (match.status === "active" && match.reconnectDeadline !== null && now >= match.reconnectDeadline && match.reconnectSeat) {
      await this.finishForfeit(match, match.reconnectSeat, "reconnect-timeout");
      return;
    } else if (match.status === "active" && match.turnDeadline !== null && now >= match.turnDeadline) {
      const loser = stateNextPlayer(match);
      this.applyGameOutcome(match, loser ? `timeout-${loser}` : "draw");
      match.revision += 1;
      changed = true;
    } else if (match.status === "between-games") {
      changed = this.expireIntermissionDisconnects(match, now);
      if (match.status === "between-games" && match.nextGameDeadline !== null && now >= match.nextGameDeadline &&
        match.seats.every((seat) => seat?.connected)) {
        this.beginNextGameCountdown(match, now);
        match.revision += 1;
        changed = true;
      }
    }
    if (!changed) {
      await this.schedule(match);
      return;
    }
    await this.save(match);
    await this.schedule(match);
    this.broadcast({ type: "match", match: snapshot(match) });
  }

  private async resign(request: Request): Promise<Response> {
    const match = await this.load();
    const credential = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!match || !credential) return json({ error: "unauthorized" }, 401);
    const tokenHash = await hash(credential);
    const index = match.seats.findIndex((seat) => seat?.tokenHash === tokenHash);
    if (index < 0) return json({ error: "unauthorized" }, 401);
    if (match.status !== "active") return json({ error: "match-not-active" }, 409);
    await this.finishForfeit(match, index === 0 ? "first" : "second", "resigned");
    return json({ ok: true });
  }

  private async finishForfeit(match: Match, loser: PlayerSeat, reason: string): Promise<void> {
    if (match.status !== "active") return;
    this.applyGameOutcome(match, `${reason}-${loser}`);
    match.revision += 1;
    await this.publish(match);
  }

  private async expireWaitingRoom(match: Match, now: number): Promise<boolean> {
    if (match.status !== "waiting" || now < match.expiresAt) return false;
    match.status = "expired";
    match.outcome = "room-expired";
    match.retentionDeadline = now + TERMINAL_MATCH_RETENTION_MS;
    match.revision += 1;
    await this.removeFromLobby(match);
    await this.save(match);
    await this.schedule(match);
    this.broadcast({ type: "match", match: snapshot(match) });
    return true;
  }

  private applyGameOutcome(match: Match, outcome: string): void {
    if (match.status !== "active") return;
    match.outcome = outcome;
    match.turnDeadline = null;
    match.turnStartedAt = null;
    match.reconnectSeat = null;
    match.reconnectDeadline = null;
    match.pausedTurnMs = null;
    match.turnReceiptPending = false;
    match.turnReceiptStartedAt = null;
    const winner = outcomeWinner(outcome);
    if (winner) match.wins[winner] += 1;
    match.seriesWinner = winner && match.wins[winner] >= match.seriesTarget ? winner : null;
    match.status = match.seriesWinner ? "completed" : "between-games";
    match.retentionDeadline = match.status === "completed" ? Date.now() + TERMINAL_MATCH_RETENTION_MS : null;
    match.nextGameDeadline = match.seriesWinner ? null : Date.now() + NEXT_GAME_TIMEOUT_MS;
    match.nextReady = [false, false];
    match.rematchReady = [false, false];
    if (match.status === "between-games") {
      const aiIndex = match.seats.findIndex((seat) => seat?.kind === "ai");
      if (aiIndex >= 0) match.nextReady[aiIndex] = true;
    }
  }

  /** Run the virtual seat synchronously in the same authoritative request/alarm. */
  private applyAiTurn(match: Match, now: number): void {
    if (match.status !== "active" || match.state === null || !Number.isSafeInteger(match.aiEngineVersion)) return;
    const nextSeat = stateNextPlayer(match);
    if (!nextSeat) return;
    const aiIndex = match.seats.findIndex((seat) => seat?.kind === "ai");
    const ai = match.seats[aiIndex];
    if (aiIndex < 0 || !ai?.aiProfileId || (aiIndex === 0 ? "first" : "second") !== nextSeat) return;
    const opponent = opponentProviderForVersion(match.gameId, match.aiEngineVersion!);
    if (!opponent || !opponent.supportsProfile(ai.aiProfileId)) return;
    const game = gameForMatch(match);
    if (!game || !game.inspectState(match.state, match.rulesVersion).ok) return;

    const action = opponent.chooseAction(match.state, nextSeat, ai.aiProfileId, match.aiSeed ?? 1, match.aiEngineVersion!);
    const applied = game.applyAction(match.state, nextSeat, action, match.rulesVersion);
    if (!applied.ok) return;
    const inspected = game.inspectState(applied.value, match.rulesVersion);
    if (!inspected.ok) return;
    match.state = applied.value;
    match.revision += 1;
    if (inspected.value.outcome) {
      const result = inspected.value.outcome.kind === "draw" ? "draw" : `win-${inspected.value.outcome.winner}`;
      this.applyGameOutcome(match, result);
      return;
    }

    const humanTurn = inspected.value.nextPlayer;
    const humanIndex = humanTurn === "first" ? 0 : 1;
    const human = match.seats[humanIndex];
    if (!humanTurn || !human || human.kind === "ai") return;
    if (human.turnReceiptSupported) {
      match.reconnectSeat = humanTurn;
      match.reconnectDeadline = now + human.reconnectRemainingMs;
      match.pausedTurnMs = sessionPolicy(match).turnDurationMs;
      match.turnDeadline = null;
      match.turnStartedAt = null;
      match.turnReceiptPending = true;
      match.turnReceiptStartedAt = now;
      if (!human.connected) human.disconnectedAt ??= now;
    } else {
      match.reconnectSeat = null;
      match.reconnectDeadline = null;
      match.pausedTurnMs = null;
      match.turnReceiptPending = false;
      match.turnReceiptStartedAt = null;
      match.turnStartedAt = now;
      match.turnDeadline = now + sessionPolicy(match).turnDurationMs;
    }
  }

  private async requestNextGame(match: Match, seat: PlayerSeat): Promise<void> {
    if (match.status !== "between-games" || match.seriesWinner) return;
    const now = Date.now();
    if (match.nextGameDeadline !== null && now >= match.nextGameDeadline && match.seats.every((entry) => entry?.connected)) {
      this.beginNextGameCountdown(match, now);
      match.revision += 1;
      await this.publish(match);
      return;
    }
    const index = seat === "first" ? 0 : 1;
    if (match.nextReady[index]) return;
    match.nextReady[index] = true;
    const aiIndex = match.seats.findIndex((entry) => entry?.kind === "ai");
    if (aiIndex >= 0) match.nextReady[aiIndex] = true;
    if (match.nextReady.every(Boolean) && match.seats.every((entry) => entry?.connected)) {
      this.beginNextGameCountdown(match, now);
    }
    match.revision += 1;
    await this.publish(match);
  }

  private beginNextGameCountdown(match: Match, now: number): void {
    if (match.status !== "between-games" || match.seriesWinner) return;
    match.nextStartingSeat = otherSeat(stateStartingPlayer(match) ?? match.seriesStartingSeat ?? "first");
    match.status = "countdown";
    match.countdownAt = now + COUNTDOWN_MS;
    match.nextGameDeadline = null;
    match.nextReady = [false, false];
  }

  private async requestRematch(match: Match, seat: PlayerSeat): Promise<void> {
    if (match.status !== "completed" || !match.seriesWinner || match.closedSeats.some(Boolean)) return;
    const index = seat === "first" ? 0 : 1;
    if (match.rematchReady[index]) return;
    match.rematchReady[index] = true;
    const aiIndex = match.seats.findIndex((entry) => entry?.kind === "ai");
    if (aiIndex >= 0) match.rematchReady[aiIndex] = true;
    if (match.rematchReady.every(Boolean)) {
      const previousStarter = match.seriesStartingSeat ?? stateStartingPlayer(match) ?? "first";
      match.nextStartingSeat = otherSeat(previousStarter);
      match.rematchCountdown = true;
      match.status = "countdown";
      match.retentionDeadline = null;
      match.countdownAt = Date.now() + COUNTDOWN_MS;
    }
    match.revision += 1;
    await this.publish(match);
  }

  private async concedeSeries(match: Match, seat: PlayerSeat): Promise<void> {
    if (match.status !== "between-games") return;
    match.status = "completed";
    match.retentionDeadline = Date.now() + TERMINAL_MATCH_RETENTION_MS;
    match.seriesWinner = otherSeat(seat);
    match.outcome = `series-conceded-${seat}`;
    match.turnDeadline = null;
    match.nextReady = [false, false];
    match.nextGameDeadline = null;
    match.closedSeats[seat === "first" ? 0 : 1] = true;
    match.revision += 1;
    await this.publish(match);
  }

  private expireIntermissionDisconnects(match: Match, now: number): boolean {
    if (match.status !== "between-games") return false;
    const expired = match.seats
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat }) => seat && !seat.connected && seat.disconnectedAt !== null &&
        now >= seat.disconnectedAt + seat.reconnectRemainingMs);
    if (!expired.length) return false;

    match.turnDeadline = null;
    match.nextGameDeadline = null;
    match.nextReady = [false, false];
    match.rematchReady = [false, false];
    if (expired.length === 2) {
      match.status = "cancelled";
      match.retentionDeadline = now + TERMINAL_MATCH_RETENTION_MS;
      match.outcome = "both-players-disconnected";
      match.seriesWinner = null;
      match.closedSeats = [true, true];
    } else {
      const loserIndex = expired[0]!.index;
      const loser = loserIndex === 0 ? "first" : "second";
      match.status = "completed";
      match.retentionDeadline = now + TERMINAL_MATCH_RETENTION_MS;
      match.outcome = `series-conceded-${loser}`;
      match.seriesWinner = otherSeat(loser);
      match.closedSeats[loserIndex] = true;
    }
    match.reconnectSeat = null;
    match.reconnectDeadline = null;
    match.pausedTurnMs = null;
    match.revision += 1;
    return true;
  }

  private async publish(match: Match): Promise<void> {
    await this.save(match);
    await this.schedule(match);
    this.broadcast({ type: "match", match: snapshot(match) });
  }

  private async schedule(match: Match): Promise<void> {
    if (["completed", "cancelled", "expired"].includes(match.status)) {
      await setAlarmIfChanged(this.ctx.storage,
        typeof match.retentionDeadline === "number" && Number.isFinite(match.retentionDeadline)
          ? match.retentionDeadline : null);
      return;
    }
    const now = Date.now();
    const deadlines: number[] = [];
    const addDeadline = (deadline: number | null, dueIsActionable = true) => {
      if (typeof deadline !== "number" || !Number.isFinite(deadline)) return;
      if (deadline > now) deadlines.push(deadline);
      else if (dueIsActionable) deadlines.push(now + 50);
    };
    if (match.status === "waiting") addDeadline(match.expiresAt);
    if (match.status === "countdown") addDeadline(match.countdownAt);
    if (match.status === "active") {
      addDeadline(match.turnDeadline);
      if (match.reconnectSeat) addDeadline(match.reconnectDeadline);
    }
    if (match.status === "between-games") {
      addDeadline(match.nextGameDeadline, match.seats.every((seat) => seat?.connected));
      for (const seat of match.seats) {
        if (seat && !seat.connected && seat.disconnectedAt !== null) {
          addDeadline(seat.disconnectedAt + seat.reconnectRemainingMs);
        }
      }
    }
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
      if (attachment && !attachment.authenticated) addDeadline(attachment.authDeadline);
    }
    await setAlarmIfChanged(this.ctx.storage, deadlines.length ? Math.min(...deadlines) : null);
  }

  private async removeFromLobby(match: Match): Promise<void> {
    if (match.visibility !== "public") return;
    try {
      const lobby = this.env.LOBBY_HUB.get(this.env.LOBBY_HUB.idFromName("lobby:global"));
      await lobby.fetch(new Request(`https://lobby-hub.internal/remove?matchId=${encodeURIComponent(match.id)}`, { method: "POST" }));
    } catch { /* The room remains authoritative; stale directory entries expire independently. */ }
  }

  private broadcast(event: unknown): void {
    const message = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
      if (attachment?.authenticated) { try { socket.send(message); } catch { socket.close(1011, "Send failed"); } }
    }
  }
}

type LobbySocketAttachment = { gameId: GameId | null; identified: boolean };
const LOBBY_PAGE_SIZE = 20;

/** Event-driven, cross-game lobby feed for joinable human-created rooms. */
export class LobbyHubDurableObject {
  constructor(private readonly ctx: DurableObjectState, _env: WorkerEnv) {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS public_rooms (
        match_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        series_target INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lobby_rooms_created ON public_rooms (created_at DESC, match_id ASC);
      CREATE INDEX IF NOT EXISTS lobby_rooms_game_created ON public_rooms (game_id, created_at DESC, match_id ASC);
      CREATE INDEX IF NOT EXISTS lobby_rooms_expiry ON public_rooms (expires_at);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const operation = url.pathname.split("/").at(-1);
    if (operation === "socket" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const requestedGame = url.searchParams.get("gameId");
      if (requestedGame && !SUPPORTED_GAME_IDS.includes(requestedGame as GameId)) return json({ error: "unsupported-game" }, 404);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ["lobby"]);
      server.serializeAttachment?.({ gameId: requestedGame as GameId | null, identified: false });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (operation === "upsert" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid-request" }, 400);
      const entry = input as Partial<LobbyEntry>;
      if (typeof entry.matchId !== "string" || !ID_PATTERN.test(entry.matchId) || !entry.gameId || !SUPPORTED_GAME_IDS.includes(entry.gameId) ||
        typeof entry.displayName !== "string" || ![1, 2, 3].includes(entry.seriesTarget ?? 0) ||
        !Number.isSafeInteger(entry.createdAt) || !Number.isSafeInteger(entry.expiresAt)) return json({ error: "invalid-entry" }, 400);
      this.ctx.storage.sql.exec(`
        INSERT INTO public_rooms (match_id, game_id, display_name, series_target, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_id) DO UPDATE SET
          game_id = excluded.game_id,
          display_name = excluded.display_name,
          series_target = excluded.series_target,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at
      `, entry.matchId, entry.gameId, entry.displayName, entry.seriesTarget!, entry.createdAt!, entry.expiresAt!);
      await this.schedule();
      this.broadcastRoom({ type: "lobby-room-upsert", match: entry as LobbyEntry });
      return json({ ok: true }, 201);
    }
    if (operation === "remove" && request.method === "POST") {
      const matchId = url.searchParams.get("matchId");
      if (!matchId || !ID_PATTERN.test(matchId)) return json({ error: "invalid-match-id" }, 400);
      const existing = this.ctx.storage.sql.exec<{ gameId: GameId }>("SELECT game_id AS gameId FROM public_rooms WHERE match_id = ?", matchId).toArray()[0];
      this.ctx.storage.sql.exec("DELETE FROM public_rooms WHERE match_id = ?", matchId);
      await this.schedule();
      if (existing) this.broadcastRoom({ type: "lobby-room-remove", matchId, gameId: existing.gameId });
      return json({ ok: true });
    }
    if (operation === "list" && request.method === "GET") {
      const gameId = url.searchParams.get("gameId");
      if (gameId && !SUPPORTED_GAME_IDS.includes(gameId as GameId)) return json({ error: "unsupported-game" }, 404);
      const cursor = url.searchParams.get("cursor");
      if (cursor && !/^\d{13}\.[A-Za-z0-9_-]{22}$/.test(cursor)) return json({ error: "invalid-cursor" }, 400);
      const result = this.page(gameId as GameId | null, cursor, LOBBY_PAGE_SIZE);
      return json({ ...result, serverNow: Date.now() });
    }
    return json({ error: "not-found" }, 404);
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== "string" || raw.length > MAX_FRAME_BYTES) { socket.close(1009, "Message too large"); return; }
    let message: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      message = parsed as Record<string, unknown>;
    } catch { return; }
    const attachment = socket.deserializeAttachment?.() as LobbySocketAttachment | null;
    if (!attachment) return;
    if (!attachment.identified) {
      if (message.type !== "identify" || Object.keys(message).some((key) => !["type", "visitorId", "gameId"].includes(key)) ||
        (message.visitorId !== undefined && (typeof message.visitorId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(message.visitorId)))) {
        socket.close(1008, "Invalid lobby session");
        return;
      }
      const gameId = message.gameId === null || message.gameId === undefined ? null : message.gameId;
      if (gameId !== null && (typeof gameId !== "string" || !SUPPORTED_GAME_IDS.includes(gameId as GameId))) {
        socket.close(1008, "Invalid game filter");
        return;
      }
      const identified = { ...attachment, gameId: gameId as GameId | null, identified: true };
      socket.serializeAttachment?.(identified);
      this.sendSnapshot(socket, identified.gameId, null);
      return;
    }
    if (Object.keys(message).some((key) => !["type", "gameId", "cursor"].includes(key))) return;
    if (message.type === "subscribe") {
      const gameId = message.gameId === null || message.gameId === "all" ? null : message.gameId;
      if (gameId !== null && (typeof gameId !== "string" || !SUPPORTED_GAME_IDS.includes(gameId as GameId))) {
        socket.send(JSON.stringify({ type: "lobby-error", message: "That game filter is not available." }));
        return;
      }
      socket.serializeAttachment?.({ ...attachment, gameId: gameId as GameId | null });
      this.sendSnapshot(socket, gameId as GameId | null, null);
      return;
    }
    if (message.type === "load-more") {
      const cursor = message.cursor;
      if (typeof cursor !== "string" || !/^\d{13}\.[A-Za-z0-9_-]{22}$/.test(cursor)) return;
      this.sendSnapshot(socket, attachment.gameId, cursor, "lobby-page");
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const expired = this.ctx.storage.sql.exec<{ matchId: string; gameId: GameId }>(
      "SELECT match_id AS matchId, game_id AS gameId FROM public_rooms WHERE expires_at <= ?", now,
    ).toArray();
    if (expired.length) {
      this.ctx.storage.sql.exec("DELETE FROM public_rooms WHERE expires_at <= ?", now);
      const totals = this.totalsByGame();
      for (const socket of this.ctx.getWebSockets("lobby")) {
        const attachment = socket.deserializeAttachment?.() as LobbySocketAttachment | null;
        if (!attachment) continue;
        const removed = expired.filter((entry) => attachment.gameId === null || attachment.gameId === entry.gameId).map((entry) => entry.matchId);
        if (!removed.length) continue;
        const totalMatches = attachment.gameId === null
          ? Object.values(totals).reduce<number>((sum, count) => sum + (count ?? 0), 0)
          : totals[attachment.gameId] ?? 0;
        try { socket.send(JSON.stringify({ type: "lobby-rooms-remove", matchIds: removed, totalMatches })); } catch { socket.close(1011, "Send failed"); }
      }
    }
    await this.schedule();
  }

  private page(gameId: GameId | null, cursor: string | null, limit: number) {
    const now = Date.now();
    let matches: LobbyEntry[];
    if (cursor) {
      const separator = cursor.indexOf(".");
      const createdAt = Number(cursor.slice(0, separator));
      const matchId = cursor.slice(separator + 1);
      matches = this.ctx.storage.sql.exec<LobbyEntry>(`
        SELECT match_id AS matchId, game_id AS gameId, display_name AS displayName,
          series_target AS seriesTarget, created_at AS createdAt, expires_at AS expiresAt
        FROM public_rooms
        WHERE expires_at > ? AND (? IS NULL OR game_id = ?) AND (created_at < ? OR (created_at = ? AND match_id > ?))
        ORDER BY created_at DESC, match_id ASC LIMIT ?
      `, now, gameId, gameId, createdAt, createdAt, matchId, limit + 1).toArray();
    } else {
      matches = this.ctx.storage.sql.exec<LobbyEntry>(`
        SELECT match_id AS matchId, game_id AS gameId, display_name AS displayName,
          series_target AS seriesTarget, created_at AS createdAt, expires_at AS expiresAt
        FROM public_rooms WHERE expires_at > ? AND (? IS NULL OR game_id = ?)
        ORDER BY created_at DESC, match_id ASC LIMIT ?
      `, now, gameId, gameId, limit + 1).toArray();
    }
    const hasMore = matches.length > limit;
    const page = matches.slice(0, limit);
    const last = hasMore ? page.at(-1) : null;
    const nextCursor = last ? `${String(last.createdAt).padStart(13, "0")}.${last.matchId}` : null;
    const totalMatches = gameId
      ? this.totalsByGame()[gameId] ?? 0
      : Object.values(this.totalsByGame()).reduce<number>((sum, count) => sum + (count ?? 0), 0);
    return { matches: page, totalMatches, nextCursor, hasMore };
  }

  private sendSnapshot(socket: WebSocket, gameId: GameId | null, cursor: string | null, type = "lobby-snapshot"): void {
    const page = this.page(gameId, cursor, LOBBY_PAGE_SIZE);
    try { socket.send(JSON.stringify({ type, ...page, serverNow: Date.now() })); }
    catch { socket.close(1011, "Send failed"); }
  }

  private totalsByGame(): Partial<Record<GameId, number>> {
    const rows = this.ctx.storage.sql.exec<{ gameId: GameId; total: number }>(
      "SELECT game_id AS gameId, COUNT(*) AS total FROM public_rooms WHERE expires_at > ? GROUP BY game_id", Date.now(),
    ).toArray();
    return Object.fromEntries(rows.map((row) => [row.gameId, row.total]));
  }

  private broadcastRoom(event: { type: "lobby-room-upsert"; match: LobbyEntry } | { type: "lobby-room-remove"; matchId: string; gameId: GameId }): void {
    const totals = this.totalsByGame();
    for (const socket of this.ctx.getWebSockets("lobby")) {
      const attachment = socket.deserializeAttachment?.() as LobbySocketAttachment | null;
      if (!attachment?.identified || (attachment.gameId && attachment.gameId !== (event.type === "lobby-room-upsert" ? event.match.gameId : event.gameId))) continue;
      const totalMatches = attachment.gameId ? totals[attachment.gameId] ?? 0 : Object.values(totals).reduce<number>((sum, count) => sum + (count ?? 0), 0);
      const payload = event.type === "lobby-room-upsert"
        ? { ...event, totalMatches }
        : { ...event, totalMatches };
      try { socket.send(JSON.stringify(payload)); } catch { socket.close(1011, "Send failed"); }
    }
  }

  private async schedule(): Promise<void> {
    const expiry = this.ctx.storage.sql.exec<{ expiresAt: number | null }>(
      "SELECT MIN(expires_at) AS expiresAt FROM public_rooms",
    ).toArray()[0]?.expiresAt;
    await setAlarmIfChanged(this.ctx.storage, expiry ?? null);
  }
}
