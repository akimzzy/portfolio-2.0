import {
  IN_HOUSE_PLAYERS,
  invalid,
  isMatchReactionId,
  normalizeQuickMessage,
  parseActionCommand,
} from "@portfolio-games/contracts";
import type {
  ActionCommand,
  PlayerSeat,
  RuntimeTwoPlayerGame,
  ValidationResult,
} from "@portfolio-games/contracts";
import { workerGames } from "./games/registry.js";
import { opponentProviderForGame, opponentProviderForVersion } from "./games/opponents.js";
import { resolveAccountIdentity } from "./account-identity.js";

const DEFAULT_TURN_DURATION_MS = 45_000;
const DEFAULT_RECONNECT_DURATION_MS = 60_000;
const ROOM_TTL_MS = 5 * 60_000;
const INVITE_TTL_MS = 24 * 60 * 60_000;
const COUNTDOWN_MS = 2_000;
const PUBLIC_AI_FALLBACK_MIN_MS = 8_000;
const PUBLIC_AI_FALLBACK_MAX_MS = 60_000;
const NEXT_GAME_TIMEOUT_MS = 30_000;
const TERMINAL_MATCH_RETENTION_MS = 24 * 60 * 60_000;
const AUTH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 4_096;
const MAX_FRAME_BYTES = 2_048;
const MAX_ACTIONS_PER_10S = 30;
const MAX_SOCIAL_EVENTS_PER_10S = 6;
const REACTION_COOLDOWN_MS = 800;
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const NAME_ADJECTIVES = ["Bright", "Clever", "Golden", "Happy", "Merry", "Quiet", "Swift", "Witty"];
const NAME_ANIMALS = ["Badger", "Comet", "Falcon", "Fox", "Otter", "Panda", "Raven", "Tiger"];
type Visibility = "public" | "invite";
type GameId = string;
const SUPPORTED_GAME_IDS = workerGames.entries.map((game) => game.gameId);
type Status =
  "waiting" | "countdown" | "active" | "between-games" | "completed" | "cancelled" | "expired";
type Seat = {
  tokenHash: string | null;
  kind?: "human" | "ai";
  aiProfileId?: string;
  inHousePlayerId?: string;
  accountId?: string | null;
  displayName?: string;
  connected: boolean;
  reconnectRemainingMs: number;
  disconnectedAt: number | null;
  turnReceiptSupported?: boolean;
};
type Match = {
  id: string;
  gameId: GameId;
  rulesVersion: number;
  visibility: Visibility;
  status: Status;
  createdAt: number;
  expiresAt: number;
  retentionDeadline?: number | null;
  aiFallbackAt?: number | null;
  revision: number;
  state: unknown | null;
  seats: [Seat | null, Seat | null];
  countdownAt: number | null;
  turnDeadline: number | null;
  turnStartedAt: number | null;
  nextGameDeadline: number | null;
  reconnectSeat: PlayerSeat | null;
  reconnectDeadline: number | null;
  pausedTurnMs: number | null;
  turnReceiptPending?: boolean;
  turnReceiptStartedAt?: number | null;
  outcome: string | null;
  recentActions: Record<string, unknown>;
  actionTimes: [number[], number[]];
  seriesTarget: 1 | 2 | 3;
  wins: { first: number; second: number };
  gameNumber: number;
  seriesNumber: number;
  roundHistory?: RoundHistory[];
  persistedSeriesNumber?: number;
  historyOutbox?: PendingHistoryWrite[];
  seriesCompletedAt?: number | null;
  houseLeaseReleased?: boolean;
  houseLeaseReleaseAttempted?: boolean;
  seriesStartingSeat: PlayerSeat | null;
  nextStartingSeat: PlayerSeat | null;
  nextReady: [boolean, boolean];
  rematchReady: [boolean, boolean];
  closedSeats: [boolean, boolean];
  rematchCountdown: boolean;
  seriesWinner: PlayerSeat | null;
  aiSeed?: number | null;
  aiEngineVersion?: number | null;
  aiRematchesAllowed?: number;
  aiRematchesUsed?: number;
};
type RoundHistory = Readonly<{
  roundNumber: number;
  winner: PlayerSeat | null;
  finishReason: "normal" | "timeout" | "disconnect" | "forfeit";
  completedAt: string;
  finalState: unknown;
}>;
type PendingHistoryWrite = Readonly<{
  seriesNumber: number;
  payload: Record<string, unknown>;
  attempts: number;
  retryAt: number;
}>;
type LobbyEntry = Readonly<{
  matchId: string;
  gameId: GameId;
  rulesVersion: number;
  displayName: string;
  seriesTarget: 1 | 2 | 3;
  createdAt: number;
  expiresAt: number;
}>;
type SocketAttachment =
  | { authenticated: false; authDeadline: number }
  | {
      authenticated: true;
      seat: PlayerSeat;
      lastSyncAt?: number;
      reactionTimes?: number[];
    };

function gameForMatch(match: Pick<Match, "gameId" | "rulesVersion">): RuntimeTwoPlayerGame | null {
  return workerGames.get(match.gameId, match.rulesVersion);
}

function sessionPolicy(match: Pick<Match, "gameId" | "rulesVersion">) {
  return (
    gameForMatch(match)?.getSessionPolicy(match.rulesVersion) ?? {
      turnDurationMs: DEFAULT_TURN_DURATION_MS,
      reconnectDurationMs: DEFAULT_RECONNECT_DURATION_MS,
    }
  );
}

type InHousePlayer = Readonly<{ player_id: string; username: string; display_name: string }>;

const LEADERBOARD_PUBLISH_ATTEMPTS = 3;
const LEADERBOARD_RETRY_DELAYS_MS = [1_000, 5_000] as const;

class SupabaseRpcError extends Error {
  constructor(
    readonly functionName: string,
    readonly status: number,
  ) {
    super(`supabase-rpc-${functionName}-failed-${status}`);
    this.name = "SupabaseRpcError";
  }
}

function isRetryableSupabaseFailure(error: unknown): boolean {
  if (error instanceof SupabaseRpcError)
    return (
      error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500
    );
  if (!(error instanceof Error)) return false;
  return (
    error instanceof TypeError || error.name === "TimeoutError" || error.name === "NetworkError"
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function localHousePlayer(playerId: string): InHousePlayer | null {
  const player = IN_HOUSE_PLAYERS.find((entry) => entry.playerId === playerId);
  return player
    ? { player_id: player.playerId, username: player.username, display_name: player.displayName }
    : null;
}

function houseRosterAt(index: number): InHousePlayer | null {
  const player = IN_HOUSE_PLAYERS[index];
  return player
    ? { player_id: player.playerId, username: player.username, display_name: player.displayName }
    : null;
}

async function supabaseRpc<T>(env: WorkerEnv, functionName: string, body: unknown): Promise<T> {
  const baseUrl = env.SUPABASE_URL?.trim();
  const serviceKey = supabaseServerKey(env);
  if (!baseUrl || !serviceKey) throw new Error("supabase-not-configured");
  const response = await fetch(new URL(`/rest/v1/rpc/${functionName}`, baseUrl), {
    method: "POST",
    headers: {
      apikey: serviceKey,
      ...(serviceKey.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${serviceKey}` }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new SupabaseRpcError(functionName, response.status);
  return (await response.json()) as T;
}

async function publishDailyLeaderboards(scheduledTime: number, env: WorkerEnv): Promise<void> {
  for (let attempt = 1; attempt <= LEADERBOARD_PUBLISH_ATTEMPTS; attempt += 1) {
    try {
      await supabaseRpc(env, "publish_daily_leaderboards", {});
      console.info("[leaderboard] Daily snapshot published.", { scheduledTime, attempt });
      return;
    } catch (error) {
      const retryable = isRetryableSupabaseFailure(error);
      if (!retryable || attempt === LEADERBOARD_PUBLISH_ATTEMPTS) {
        console.error("[leaderboard] Daily snapshot publish failed.", {
          scheduledTime,
          attempt,
          retryable,
          error: error instanceof Error ? error.message : "unknown-error",
        });
        throw error;
      }

      console.warn("[leaderboard] Transient publish failure; retrying.", {
        scheduledTime,
        attempt,
        nextAttempt: attempt + 1,
        error: error instanceof Error ? error.message : "unknown-error",
      });
      await wait(LEADERBOARD_RETRY_DELAYS_MS[attempt - 1] ?? 0);
    }
  }
}

async function claimHousePlayer(
  env: WorkerEnv,
  playerId: string,
  matchId: string,
): Promise<InHousePlayer | null> {
  if (!env.SUPABASE_URL?.trim() || !supabaseServerKey(env)) {
    if (env.APP_ENV && env.APP_ENV !== "development") throw new Error("supabase-not-configured");
    return localHousePlayer(playerId);
  }
  const rows = await supabaseRpc<InHousePlayer[]>(env, "claim_in_house_player", {
    requested_player_id: playerId,
    requested_match_id: matchId,
  });
  return rows[0] ?? null;
}

async function claimAnyHousePlayer(env: WorkerEnv, matchId: string): Promise<InHousePlayer | null> {
  if (!env.SUPABASE_URL?.trim() || !supabaseServerKey(env)) {
    if (env.APP_ENV && env.APP_ENV !== "development") throw new Error("supabase-not-configured");
    const hash = Array.from(matchId).reduce(
      (value, char) => (value * 33 + char.charCodeAt(0)) >>> 0,
      5381,
    );
    return houseRosterAt(hash % IN_HOUSE_PLAYERS.length);
  }
  const rows = await supabaseRpc<InHousePlayer[]>(env, "claim_any_in_house_player", {
    requested_match_id: matchId,
  });
  return rows[0] ?? null;
}

async function releaseHousePlayer(env: WorkerEnv, matchId: string): Promise<void> {
  if (!env.SUPABASE_URL?.trim() || !supabaseServerKey(env)) return;
  await supabaseRpc<boolean>(env, "release_in_house_player", { requested_match_id: matchId });
}

function outcomeFinishReason(outcome: string | null): RoundHistory["finishReason"] {
  return outcome?.startsWith("reconnect-timeout-")
    ? "disconnect"
    : outcome?.startsWith("timeout-")
      ? "timeout"
      : outcome?.startsWith("resigned-") || outcome?.startsWith("series-conceded-")
        ? "forfeit"
        : "normal";
}

function roundHistoryResult(match: Match, outcome: string): RoundHistory | null {
  if (match.state === null || !Number.isSafeInteger(match.gameNumber) || match.gameNumber < 1)
    return null;
  const game = gameForMatch(match);
  const snapshot = game?.getHistorySnapshot(match.state, match.rulesVersion);
  if (!snapshot?.ok) return null;
  return {
    roundNumber: match.gameNumber,
    winner: outcomeWinner(outcome),
    finishReason: outcomeFinishReason(outcome),
    completedAt: new Date().toISOString(),
    finalState: snapshot.value,
  };
}

function seriesResultPayload(match: Match): Record<string, unknown> | null {
  if (
    match.status !== "completed" ||
    !match.seriesWinner ||
    !match.seriesCompletedAt ||
    !match.seats[0] ||
    !match.seats[1]
  )
    return null;
  const winnerIndex = match.seriesWinner === "first" ? 0 : 1;
  const finishReason = outcomeFinishReason(match.outcome);
  const completedAt = new Date(match.seriesCompletedAt).toISOString();
  const players = match.seats.map((seat, index) => {
    const opponent = match.seats[index === 0 ? 1 : 0]!;
    const isFirst = index === 0;
    const playerId =
      seat!.accountId && /^[0-9a-f-]{36}$/i.test(seat!.accountId)
        ? `user:${seat!.accountId.toLowerCase()}`
        : seat!.inHousePlayerId
          ? `house:${seat!.inHousePlayerId}`
          : `guest:${match.id}:${index + 1}`;
    const opponentId =
      opponent.accountId && /^[0-9a-f-]{36}$/i.test(opponent.accountId)
        ? `user:${opponent.accountId.toLowerCase()}`
        : opponent.inHousePlayerId
          ? `house:${opponent.inHousePlayerId}`
          : `guest:${match.id}:${index === 0 ? 2 : 1}`;
    return {
      player_id: playerId,
      opponent_id: opponentId,
      display_name: normalizeDisplayName(seat!.displayName, match.id, index),
      seat: isFirst ? "first" : "second",
      result: index === winnerIndex ? "win" : "loss",
      wins: isFirst ? match.wins.first : match.wins.second,
      losses: isFirst ? match.wins.second : match.wins.first,
    };
  });
  if (players[0]?.player_id === players[1]?.player_id) return null;
  return {
    match_id: match.id,
    game_id: match.gameId,
    rules_version: match.rulesVersion,
    visibility: match.visibility,
    series_number: match.seriesNumber,
    series_target: match.seriesTarget,
    finish_reason: finishReason,
    completed_at: completedAt,
    players,
    rounds: (match.roundHistory ?? []).map((round) => ({
      round_number: round.roundNumber,
      game_id: match.gameId,
      rules_version: match.rulesVersion,
      winner: round.winner,
      finish_reason: round.finishReason,
      completed_at: round.completedAt,
      final_state: round.finalState,
    })),
  };
}

function supabaseServerKey(env: WorkerEnv): string | null {
  return env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

/** Exact per-game support avoids comparing unrelated games' rules-version numbers. */
function clientSupportsMatchRules(
  supportedGames: unknown,
  legacyVersion: unknown,
  match: Match,
): boolean {
  if (
    typeof supportedGames === "object" &&
    supportedGames !== null &&
    !Array.isArray(supportedGames)
  ) {
    const versions = (supportedGames as Record<string, unknown>)[match.gameId];
    return Array.isArray(versions) && versions.some((version) => version === match.rulesVersion);
  }
  // Older deployed clients only report Connect Four's current numeric version.
  return (
    match.gameId === "connect-four" &&
    typeof legacyVersion === "number" &&
    Number.isSafeInteger(legacyVersion) &&
    legacyVersion >= match.rulesVersion
  );
}

function parseGameCommand(
  input: unknown,
  game: RuntimeTwoPlayerGame,
  rulesVersion: number,
): ValidationResult<ActionCommand<unknown>> {
  const parsed = parseActionCommand(input, (action) => game.parseAction(action, rulesVersion));
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== game.gameId) return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== rulesVersion)
    return invalid("rulesVersion", "Unsupported game rules version.");
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

async function setAlarmIfChanged(
  storage: DurableObjectStorage,
  deadline: number | null,
): Promise<void> {
  const current = await storage.getAlarm();
  if (deadline === null) {
    if (current !== null) await storage.deleteAlarm();
  } else if (current !== deadline) {
    await storage.setAlarm(deadline);
  }
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

function token(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
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
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
function origins(env: WorkerEnv): string[] {
  return env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
function isAllowed(request: Request, env: WorkerEnv): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origins(env).includes(origin);
  const path = new URL(request.url).pathname;
  return (
    request.method === "GET" &&
    /^\/v1\/matches\/[A-Za-z0-9_-]{22}$/.test(path) &&
    Boolean(request.headers.get("authorization"))
  );
}
function cors(request: Request, env: WorkerEnv): HeadersInit {
  const origin = request.headers.get("origin");
  return origin && origins(env).includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        Vary: "Origin",
      }
    : {};
}
function createId(): string {
  return token(16).replaceAll("-", "X").replaceAll("_", "Y").slice(0, 22);
}
function publicAiFallbackAt(createdAt: number, expiresAt: number): number {
  const earliest = createdAt + PUBLIC_AI_FALLBACK_MIN_MS;
  const latest = Math.min(expiresAt, createdAt + PUBLIC_AI_FALLBACK_MAX_MS);
  return earliest + Math.floor(Math.random() * (latest - earliest + 1));
}
function fallbackDisplayName(matchId: string, seatIndex: number): string {
  let value = 2_166_136_261 ^ (seatIndex * 2_246_822_519);
  for (const character of matchId) value = Math.imul(value ^ character.charCodeAt(0), 16_777_619);
  const unsigned = value >>> 0;
  return `${NAME_ADJECTIVES[unsigned % NAME_ADJECTIVES.length]} ${NAME_ANIMALS[(unsigned >>> 8) % NAME_ANIMALS.length]} ${(unsigned >>> 16) % 100}`;
}
function normalizeDisplayName(value: unknown, matchId: string, seatIndex: number): string {
  if (typeof value !== "string") return fallbackDisplayName(matchId, seatIndex);
  const cleaned = Array.from(
    value
      .normalize("NFKC")
      // eslint-disable-next-line no-control-regex -- Remove control characters from untrusted player names.
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, 24)
    .join("");
  return cleaned || fallbackDisplayName(matchId, seatIndex);
}
function displayNameKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
function uniqueGeneratedDisplayName(
  matchId: string,
  seatIndex: number,
  otherNames: readonly string[],
): string {
  for (let variant = 0; variant < 32; variant += 1) {
    const candidate = fallbackDisplayName(matchId, seatIndex + variant);
    if (!otherNames.some((name) => displayNameKey(name) === displayNameKey(candidate)))
      return candidate;
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
    matchId: match.id,
    gameId: match.gameId,
    rulesVersion: match.rulesVersion,
    visibility: match.visibility,
    status: match.status,
    revision: match.revision,
    state: match.state,
    connectedSeats: match.seats.map((seat) => Boolean(seat?.connected)),
    playerNames: match.seats.map((seat) => seat?.displayName ?? null),
    seatKinds: match.seats.map((seat) => seat?.kind ?? "human"),
    countdownAt: match.countdownAt,
    turnDeadline: match.turnDeadline,
    nextGameDeadline: match.nextGameDeadline,
    outcome: match.outcome,
    aiFallbackAt: match.aiFallbackAt ?? null,
    expiresAt: match.expiresAt,
    serverNow: Date.now(),
    seriesTarget: match.seriesTarget,
    bestOf: match.seriesTarget * 2 - 1,
    wins: match.wins,
    gameNumber: match.gameNumber,
    nextReady: match.nextReady,
    rematchReady: match.rematchReady,
    closedSeats: match.closedSeats,
    seriesWinner: match.seriesWinner,
    nextStartingSeat: match.nextStartingSeat,
    rematchCountdown: match.rematchCountdown,
    reconnectRemainingMs: match.seats.map((seat, index) => {
      if (!seat) return null;
      const playerSeat = index === 0 ? "first" : "second";
      if (
        match.status === "active" &&
        match.reconnectSeat === playerSeat &&
        match.reconnectDeadline !== null
      ) {
        return Math.max(0, match.reconnectDeadline - now);
      }
      if (match.status === "between-games" && !seat.connected && seat.disconnectedAt !== null) {
        return Math.max(0, seat.reconnectRemainingMs - (now - seat.disconnectedAt));
      }
      return seat.reconnectRemainingMs;
    }),
    awaitingTurnReceipt:
      match.turnReceiptPending && match.reconnectSeat && match.reconnectDeadline !== null
        ? { seat: match.reconnectSeat, deadline: match.reconnectDeadline }
        : null,
  };
}
function expiredStatus(match: Match): boolean {
  return match.status === "cancelled" || match.status === "expired";
}
function otherSeat(seat: PlayerSeat): PlayerSeat {
  return seat === "first" ? "second" : "first";
}
function aiRematchLimit(seed: number): number {
  return 1 + (seed % 3);
}
function outcomeWinner(outcome: string): PlayerSeat | null {
  if (outcome === "draw") return null;
  if (outcome.startsWith("win-"))
    return outcome.endsWith("first") ? "first" : outcome.endsWith("second") ? "second" : null;
  if (outcome.endsWith("-first")) return "second";
  if (outcome.endsWith("-second")) return "first";
  return null;
}
function normalizeRoundHistory(value: unknown): RoundHistory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RoundHistory[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const round = entry as Record<string, unknown>;
    if (
      !Number.isSafeInteger(round.roundNumber) ||
      (round.roundNumber as number) < 1 ||
      (round.winner !== null && round.winner !== "first" && round.winner !== "second") ||
      !["normal", "timeout", "disconnect", "forfeit"].includes(String(round.finishReason)) ||
      typeof round.completedAt !== "string" ||
      !Number.isFinite(Date.parse(round.completedAt)) ||
      !round.finalState ||
      typeof round.finalState !== "object" ||
      Array.isArray(round.finalState)
    )
      return [];
    return [
      {
        roundNumber: round.roundNumber as number,
        winner: round.winner,
        finishReason: round.finishReason as RoundHistory["finishReason"],
        completedAt: round.completedAt,
        finalState: round.finalState,
      },
    ];
  });
}

function normalizeHistoryOutbox(value: unknown): PendingHistoryWrite[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): PendingHistoryWrite[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (
      !Number.isSafeInteger(row.seriesNumber) ||
      (row.seriesNumber as number) < 1 ||
      !row.payload ||
      typeof row.payload !== "object" ||
      Array.isArray(row.payload) ||
      !Number.isSafeInteger(row.attempts) ||
      (row.attempts as number) < 0 ||
      typeof row.retryAt !== "number" ||
      !Number.isFinite(row.retryAt)
    )
      return [];
    return [
      {
        seriesNumber: row.seriesNumber as number,
        payload: row.payload as Record<string, unknown>,
        attempts: row.attempts as number,
        retryAt: row.retryAt,
      },
    ];
  });
}

function historyRetryDelay(attempts: number): number {
  const backoff = [30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];
  return backoff[Math.min(Math.max(0, attempts - 1), backoff.length - 1)]!;
}

function normalizeMatch(match: Match): Match {
  const now = Date.now();
  const legacy = match as Match & { seriesTarget?: number; wins?: Match["wins"] };
  const target =
    legacy.seriesTarget === 1 || legacy.seriesTarget === 2 || legacy.seriesTarget === 3
      ? legacy.seriesTarget
      : 1;
  const wins =
    legacy.wins &&
    Number.isSafeInteger(legacy.wins.first) &&
    Number.isSafeInteger(legacy.wins.second)
      ? legacy.wins
      : { first: 0, second: 0 };
  const priorWinner =
    match.status === "completed" && !legacy.seriesTarget && match.outcome
      ? outcomeWinner(match.outcome)
      : null;
  if (priorWinner) wins[priorWinner] = Math.max(wins[priorWinner], target);
  const normalized: Match = {
    ...match,
    aiFallbackAt:
      typeof match.aiFallbackAt === "number" && Number.isFinite(match.aiFallbackAt)
        ? match.aiFallbackAt
        : null,
    gameId: typeof match.gameId === "string" ? match.gameId : "connect-four",
    rulesVersion:
      Number.isSafeInteger(match.rulesVersion) && match.rulesVersion > 0 ? match.rulesVersion : 1,
    seats: match.seats.map((seat, index) =>
      seat
        ? {
            ...seat,
            kind: seat.kind === "ai" ? "ai" : "human",
            ...(seat.kind === "ai"
              ? {
                  aiProfileId: opponentProviderForGame(match.gameId)?.supportsProfile(
                    seat.aiProfileId,
                  )
                    ? seat.aiProfileId
                    : (opponentProviderForGame(match.gameId)?.defaultProfileId ?? "standard"),
                }
              : {}),
            tokenHash: typeof seat.tokenHash === "string" ? seat.tokenHash : null,
            displayName: normalizeDisplayName(seat.displayName, match.id, index),
          }
        : null,
    ) as Match["seats"],
    seriesTarget: target,
    wins,
    gameNumber: Number.isSafeInteger(match.gameNumber) ? match.gameNumber : 1,
    seriesNumber:
      Number.isSafeInteger(match.seriesNumber) && match.seriesNumber > 0 ? match.seriesNumber : 1,
    roundHistory: normalizeRoundHistory(match.roundHistory),
    historyOutbox: normalizeHistoryOutbox(match.historyOutbox),
    persistedSeriesNumber:
      typeof match.persistedSeriesNumber === "number" &&
      Number.isSafeInteger(match.persistedSeriesNumber) &&
      match.persistedSeriesNumber >= 0
        ? match.persistedSeriesNumber
        : 0,
    houseLeaseReleaseAttempted:
      match.houseLeaseReleaseAttempted === true || match.houseLeaseReleased === true,
    seriesCompletedAt:
      typeof match.seriesCompletedAt === "number" && Number.isFinite(match.seriesCompletedAt)
        ? match.seriesCompletedAt
        : null,
    nextGameDeadline: Number.isFinite(match.nextGameDeadline)
      ? match.nextGameDeadline
      : match.status === "between-games"
        ? now + NEXT_GAME_TIMEOUT_MS
        : null,
    seriesStartingSeat: match.seriesStartingSeat ?? stateStartingPlayer(match),
    nextStartingSeat: match.nextStartingSeat ?? null,
    nextReady: match.nextReady ?? [false, false],
    rematchReady: match.rematchReady ?? [false, false],
    closedSeats: match.closedSeats ?? [false, false],
    rematchCountdown: match.rematchCountdown ?? false,
    seriesWinner: match.seriesWinner ?? priorWinner,
    turnReceiptPending: match.turnReceiptPending === true,
    turnReceiptStartedAt:
      match.turnReceiptPending === true
        ? typeof match.turnReceiptStartedAt === "number" &&
          Number.isFinite(match.turnReceiptStartedAt)
          ? match.turnReceiptStartedAt
          : now
        : null,
  };
  normalized.countdownAt = Number.isFinite(normalized.countdownAt) ? normalized.countdownAt : null;
  normalized.turnDeadline = Number.isFinite(normalized.turnDeadline)
    ? normalized.turnDeadline
    : null;
  normalized.turnStartedAt = Number.isFinite(normalized.turnStartedAt)
    ? normalized.turnStartedAt
    : null;
  normalized.reconnectSeat =
    normalized.reconnectSeat === "first" || normalized.reconnectSeat === "second"
      ? normalized.reconnectSeat
      : null;
  normalized.reconnectDeadline = Number.isFinite(normalized.reconnectDeadline)
    ? normalized.reconnectDeadline
    : null;
  normalized.pausedTurnMs = Number.isFinite(normalized.pausedTurnMs)
    ? normalized.pausedTurnMs
    : null;
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
        normalized.reconnectDeadline =
          seat && Number.isFinite(seat.disconnectedAt)
            ? seat.disconnectedAt! + Math.max(0, seat.reconnectRemainingMs)
            : now + Math.max(0, seat?.reconnectRemainingMs ?? 0);
      }
    }
  }
  if (normalized.status === "countdown" && normalized.countdownAt === null)
    normalized.countdownAt = now + COUNTDOWN_MS;
  normalized.aiSeed =
    typeof normalized.aiSeed === "number" && Number.isSafeInteger(normalized.aiSeed)
      ? normalized.aiSeed
      : null;
  normalized.aiEngineVersion = normalized.seats.some((seat) => seat?.kind === "ai")
    ? typeof normalized.aiEngineVersion === "number" &&
      Number.isSafeInteger(normalized.aiEngineVersion)
      ? normalized.aiEngineVersion
      : (opponentProviderForGame(normalized.gameId)?.currentEngineVersion ?? null)
    : null;
  const hasAiSeat = normalized.seats.some((seat) => seat?.kind === "ai");
  normalized.aiRematchesAllowed =
    hasAiSeat &&
    typeof normalized.aiRematchesAllowed === "number" &&
    Number.isSafeInteger(normalized.aiRematchesAllowed) &&
    normalized.aiRematchesAllowed >= 1 &&
    normalized.aiRematchesAllowed <= 3
      ? normalized.aiRematchesAllowed
      : hasAiSeat
        ? 1
        : 0;
  normalized.aiRematchesUsed =
    hasAiSeat &&
    typeof normalized.aiRematchesUsed === "number" &&
    Number.isSafeInteger(normalized.aiRematchesUsed) &&
    normalized.aiRematchesUsed >= 0 &&
    normalized.aiRematchesUsed <= 3
      ? normalized.aiRematchesUsed
      : 0;
  return normalized;
}
function timerStateNeedsPersistence(original: Match, normalized: Match): boolean {
  const fields = [
    "aiFallbackAt",
    "countdownAt",
    "turnDeadline",
    "turnStartedAt",
    "nextGameDeadline",
    "reconnectSeat",
    "reconnectDeadline",
    "pausedTurnMs",
    "turnReceiptPending",
    "turnReceiptStartedAt",
  ] as const;
  const aiFields = normalized.seats.some((seat) => seat?.kind === "ai")
    ? (["aiRematchesAllowed", "aiRematchesUsed"] as const)
    : [];
  const allFields = [...fields, ...aiFields] as readonly (keyof Match)[];
  return allFields.some(
    (field) => !Object.hasOwn(original, field) || original[field] !== normalized[field],
  );
}

export default {
  async scheduled(
    controller: { scheduledTime: number; cron: string },
    env: WorkerEnv,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> {
    ctx.waitUntil(publishDailyLeaderboards(controller.scheduledTime, env));
  },
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const headers = cors(request, env);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/health" && request.method === "GET")
      return json({ status: "ok" }, 200, headers);
    if (!isAllowed(request, env)) return json({ error: "origin-not-allowed" }, 403, headers);

    if (
      (url.pathname === "/v1/lobby" && request.method === "GET") ||
      (url.pathname === "/v1/lobby/socket" &&
        request.headers.get("upgrade")?.toLowerCase() === "websocket")
    ) {
      const source = request.headers.get("cf-connecting-ip") ?? "local-development";
      const { success } = await env.ROOMS_RATE_LIMITER.limit({ key: `lobby-list:${source}` });
      if (!success)
        return json(
          {
            error: "rate-limited",
            message: "Too many lobby connections. Wait a moment and reconnect.",
          },
          429,
          { ...headers, "Retry-After": "60" },
        );
      const requestedGameId = url.searchParams.get("gameId");
      if (requestedGameId && !SUPPORTED_GAME_IDS.includes(requestedGameId as GameId))
        return json({ error: "unsupported-game" }, 404, headers);
      const hub = env.LOBBY_HUB.get(env.LOBBY_HUB.idFromName("lobby:global"));
      const hubUrl = new URL(request.url);
      hubUrl.hostname = "lobby-hub.internal";
      hubUrl.protocol = "https:";
      if (url.pathname === "/v1/lobby/socket") {
        return hub.fetch(new Request(hubUrl, { headers: { Upgrade: "websocket" } }));
      }
      hubUrl.pathname = "/list";
      const response = await hub.fetch(new Request(hubUrl));
      if (!response.ok)
        return json(
          {
            error: "lobby-unavailable",
            message: "Open matches are unavailable right now. Reconnect to try again.",
          },
          503,
          headers,
        );
      return json(await response.json(), 200, headers);
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/v1/matches" ||
        url.pathname === "/v1/matches/quick" ||
        url.pathname === "/v1/matches/ai" ||
        /^\/v1\/matches\/[A-Za-z0-9_-]{22}\/(?:join|preview)$/.test(url.pathname))
    ) {
      const source = request.headers.get("cf-connecting-ip") ?? "local-development";
      const { success } = await env.ROOMS_RATE_LIMITER.limit({ key: `room-operations:${source}` });
      if (!success)
        return json(
          {
            error: "rate-limited",
            message: "Too many game room requests. Wait a moment and try again.",
          },
          429,
          { ...headers, "Retry-After": "60" },
        );
    }

    if (url.pathname === "/v1/matches/quick" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return json({ error: "invalid-request" }, 400, headers);
      const values = input as Record<string, unknown>;
      const account = await resolveAccountIdentity(request, env);
      if (!account.ok) return json(await account.response.json(), account.response.status, headers);
      const gameId = typeof values.gameId === "string" ? values.gameId : "connect-four";
      const game = workerGames.get(gameId);
      if (!game) return json({ error: "unsupported-game" }, 404, headers);
      const rulesVersion =
        values.rulesVersion ?? (game.gameId === "connect-four" ? 1 : game.rulesVersion);
      if (typeof rulesVersion !== "number" || !game.supportsRulesVersion(rulesVersion))
        return json({ error: "unsupported-rules-version" }, 400, headers);
      const seriesTarget = values.seriesTarget;
      if (seriesTarget !== 1 && seriesTarget !== 2 && seriesTarget !== 3)
        return json({ error: "invalid-series-target" }, 400, headers);
      if (values.matchAnySeries !== undefined && typeof values.matchAnySeries !== "boolean")
        return json({ error: "invalid-match-preference" }, 400, headers);
      const lobby = env.LOBBY_HUB.get(env.LOBBY_HUB.idFromName("lobby:global"));
      const result = await lobby.fetch(
        new Request("https://lobby-hub.internal/quick-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId,
            rulesVersion,
            seriesTarget,
            matchAnySeries: values.matchAnySeries === true,
            displayName: account.identity?.username ?? values.displayName,
            accountId: account.identity?.userId ?? null,
          }),
        }),
      );
      const payload = (await result.json()) as unknown;
      return json(payload, result.status, headers);
    }

    if (url.pathname === "/v1/matches" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return json({ error: "invalid-request" }, 400, headers);
      const values = input as Record<string, unknown>;
      const account = await resolveAccountIdentity(request, env);
      if (!account.ok) return json(await account.response.json(), account.response.status, headers);
      const gameId = typeof values.gameId === "string" ? values.gameId : "connect-four";
      const game = workerGames.get(gameId);
      if (!game) return json({ error: "unsupported-game" }, 404, headers);
      // Older cached clients omit this field and only understand Connect Four v1.
      const rulesVersion =
        values.rulesVersion ?? (game.gameId === "connect-four" ? 1 : game.rulesVersion);
      if (typeof rulesVersion !== "number" || !game.supportsRulesVersion(rulesVersion))
        return json({ error: "unsupported-rules-version" }, 400, headers);
      const visibility = values.visibility;
      if (visibility !== "public" && visibility !== "invite")
        return json({ error: "invalid-visibility" }, 400, headers);
      const seriesTarget = values.seriesTarget;
      if (seriesTarget !== 1 && seriesTarget !== 2 && seriesTarget !== 3)
        return json({ error: "invalid-series-target" }, 400, headers);
      const id = createId();
      const seatToken = token();
      const inviteToken = visibility === "invite" ? token() : null;
      const now = Date.now();
      const displayName =
        account.identity?.username ?? normalizeDisplayName(values.displayName, id, 0);
      const match: Match = {
        id,
        gameId,
        rulesVersion,
        visibility,
        status: "waiting",
        createdAt: now,
        retentionDeadline: null,
        expiresAt: now + (visibility === "public" ? ROOM_TTL_MS : INVITE_TTL_MS),
        aiFallbackAt: visibility === "public" ? publicAiFallbackAt(now, now + ROOM_TTL_MS) : null,
        revision: 0,
        state: null,
        roundHistory: [],
        seats: [
          {
            tokenHash: await hash(seatToken),
            accountId: account.identity?.userId ?? null,
            displayName,
            connected: false,
            reconnectRemainingMs: game.getSessionPolicy(rulesVersion).reconnectDurationMs,
            disconnectedAt: null,
          },
          null,
        ],
        countdownAt: null,
        turnDeadline: null,
        turnStartedAt: null,
        nextGameDeadline: null,
        reconnectSeat: null,
        reconnectDeadline: null,
        pausedTurnMs: null,
        turnReceiptPending: false,
        turnReceiptStartedAt: null,
        outcome: null,
        recentActions: {},
        actionTimes: [[], []],
        seriesTarget,
        wins: { first: 0, second: 0 },
        gameNumber: 0,
        seriesNumber: 1,
        seriesStartingSeat: null,
        nextStartingSeat: null,
        nextReady: [false, false],
        rematchReady: [false, false],
        closedSeats: [false, false],
        rematchCountdown: false,
        seriesWinner: null,
        aiRematchesAllowed: 0,
        aiRematchesUsed: 0,
      };
      const stub = env.MATCHES.get(env.MATCHES.idFromName(id));
      const created = await stub.fetch(
        new Request("https://match.internal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ match, inviteHash: inviteToken ? await hash(inviteToken) : null }),
        }),
      );
      if (!created.ok) return json({ error: "match-create-failed" }, 503, headers);
      let listed = visibility !== "public";
      if (visibility === "public") {
        try {
          const lobby = env.LOBBY_HUB.get(env.LOBBY_HUB.idFromName("lobby:global"));
          const indexed = await lobby.fetch(
            new Request("https://lobby-hub.internal/upsert", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                matchId: id,
                gameId,
                rulesVersion,
                displayName,
                seriesTarget,
                createdAt: now,
                expiresAt: match.expiresAt,
              }),
            }),
          );
          listed = indexed.ok;
        } catch {
          listed = false;
        }
      }
      return json(
        {
          matchId: id,
          gameId,
          visibility,
          seat: "first",
          seatToken,
          inviteToken,
          status: "waiting",
          expiresAt: match.expiresAt,
          seriesTarget,
          listed,
        },
        201,
        headers,
      );
    }

    if (url.pathname === "/v1/matches/ai" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return json({ error: "invalid-request" }, 400, headers);
      const values = input as Record<string, unknown>;
      const account = await resolveAccountIdentity(request, env);
      if (!account.ok) return json(await account.response.json(), account.response.status, headers);
      const gameId = typeof values.gameId === "string" ? values.gameId : "";
      const game = workerGames.get(gameId);
      const opponentProvider = opponentProviderForGame(gameId);
      if (!game || !opponentProvider) return json({ error: "unsupported-game" }, 404, headers);
      if (!opponentProvider.supportsProfile(values.profileId))
        return json({ error: "unsupported-opponent" }, 400, headers);
      const seriesTarget = values.seriesTarget;
      if (seriesTarget !== 1 && seriesTarget !== 2 && seriesTarget !== 3)
        return json({ error: "invalid-series-target" }, 400, headers);
      const id = createId();
      const seatToken = token();
      const now = Date.now();
      const seedBytes = crypto.getRandomValues(new Uint32Array(1));
      const aiSeed = seedBytes[0] ?? 1;
      const humanName =
        account.identity?.username ?? normalizeDisplayName(values.displayName, id, 1);
      const housePlayerId =
        typeof values.inHousePlayerId === "string" ? values.inHousePlayerId : "";
      const requestedHousePlayerId =
        housePlayerId ||
        (!env.APP_ENV || env.APP_ENV === "development"
          ? IN_HOUSE_PLAYERS[seedBytes[0]! % IN_HOUSE_PLAYERS.length]!.playerId
          : "");
      if (!/^house_[a-z0-9_]{2,24}$/.test(requestedHousePlayerId))
        return json({ error: "opponent-unavailable" }, 400, headers);
      let housePlayer: InHousePlayer | null;
      try {
        housePlayer = await claimHousePlayer(env, requestedHousePlayerId, id);
      } catch {
        return json({ error: "opponent-unavailable" }, 503, headers);
      }
      if (!housePlayer) return json({ error: "opponent-unavailable" }, 409, headers);
      const aiName =
        displayNameKey(housePlayer.display_name) === displayNameKey(humanName)
          ? uniqueGeneratedDisplayName(id, 1, [humanName])
          : housePlayer.display_name;
      const policy = game.getSessionPolicy(game.rulesVersion);
      const match: Match = {
        id,
        gameId: game.gameId,
        rulesVersion: game.rulesVersion,
        visibility: "public",
        status: "waiting",
        createdAt: now,
        retentionDeadline: null,
        expiresAt: now + ROOM_TTL_MS,
        revision: 0,
        state: null,
        roundHistory: [],
        seats: [
          {
            tokenHash: null,
            kind: "ai",
            aiProfileId: values.profileId,
            inHousePlayerId: housePlayer.player_id,
            displayName: aiName,
            connected: true,
            reconnectRemainingMs: policy.reconnectDurationMs,
            disconnectedAt: null,
          },
          {
            tokenHash: await hash(seatToken),
            kind: "human",
            accountId: account.identity?.userId ?? null,
            displayName: humanName,
            connected: false,
            reconnectRemainingMs: policy.reconnectDurationMs,
            disconnectedAt: null,
          },
        ],
        countdownAt: null,
        turnDeadline: null,
        turnStartedAt: null,
        nextGameDeadline: null,
        reconnectSeat: null,
        reconnectDeadline: null,
        pausedTurnMs: null,
        turnReceiptPending: false,
        turnReceiptStartedAt: null,
        outcome: null,
        recentActions: {},
        actionTimes: [[], []],
        seriesTarget,
        wins: { first: 0, second: 0 },
        gameNumber: 0,
        seriesNumber: 1,
        seriesStartingSeat: null,
        nextStartingSeat: null,
        nextReady: [false, false],
        rematchReady: [false, false],
        closedSeats: [false, false],
        rematchCountdown: false,
        seriesWinner: null,
        aiSeed,
        aiEngineVersion: opponentProvider.currentEngineVersion,
        aiRematchesAllowed: aiRematchLimit(aiSeed),
        aiRematchesUsed: 0,
      };
      const stub = env.MATCHES.get(env.MATCHES.idFromName(id));
      const created = await stub.fetch(
        new Request("https://match.internal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ match }),
        }),
      );
      if (!created.ok) {
        try {
          await releaseHousePlayer(env, id);
        } catch {
          /* Lease expires automatically if cleanup is unavailable. */
        }
        return json({ error: "match-create-failed" }, 503, headers);
      }
      return json(
        {
          matchId: id,
          gameId: game.gameId,
          visibility: "public",
          seat: "second",
          seatToken,
          status: "waiting",
          expiresAt: match.expiresAt,
          seriesTarget,
        },
        201,
        headers,
      );
    }

    const route = url.pathname.match(
      /^\/v1\/matches\/([A-Za-z0-9_-]{22})(?:\/(join|preview|socket|resign|cancel|leave|leave-series))?$/,
    );
    if (!route || !ID_PATTERN.test(route[1] ?? ""))
      return json({ error: "not-found" }, 404, headers);
    const id = route[1]!;
    const operation = route[2];
    const stub = env.MATCHES.get(env.MATCHES.idFromName(id));

    if (operation === "preview" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return json({ error: "invalid-request" }, 400, headers);
      const inviteToken = (input as Record<string, unknown>).inviteToken;
      const values = input as Record<string, unknown>;
      const requestedVersion = values.rulesVersion ?? 1;
      if (
        typeof requestedVersion !== "number" ||
        !Number.isSafeInteger(requestedVersion) ||
        requestedVersion < 1
      )
        return json({ error: "unsupported-rules-version" }, 400, headers);
      const result = await stub.fetch(
        new Request("https://match.internal/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inviteHash: typeof inviteToken === "string" ? await hash(inviteToken) : null,
            clientSupportedGames: values.supportedGames,
            clientRulesVersion: requestedVersion,
          }),
        }),
      );
      return json(await result.json(), result.status, headers);
    }

    if (operation === "join" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return json({ error: "invalid-request" }, 400, headers);
      const account = await resolveAccountIdentity(request, env);
      if (!account.ok) return json(await account.response.json(), account.response.status, headers);
      const inviteToken = (input as Record<string, unknown>).inviteToken;
      const values = input as Record<string, unknown>;
      const requestedVersion = values.rulesVersion ?? 1;
      if (
        typeof requestedVersion !== "number" ||
        !Number.isSafeInteger(requestedVersion) ||
        requestedVersion < 1
      )
        return json({ error: "unsupported-rules-version" }, 400, headers);
      const seatToken = token();
      const result = await stub.fetch(
        new Request("https://match.internal/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inviteHash: typeof inviteToken === "string" ? await hash(inviteToken) : null,
            seatTokenHash: await hash(seatToken),
            displayName:
              account.identity?.username ??
              normalizeDisplayName((input as Record<string, unknown>).displayName, id, 1),
            accountId: account.identity?.userId ?? null,
            clientSupportedGames: values.supportedGames,
            clientRulesVersion: requestedVersion,
            now: Date.now(),
          }),
        }),
      );
      const payload = (await result.json()) as Record<string, unknown>;
      return json(result.ok ? { ...payload, seatToken } : payload, result.status, headers);
    }
    if (operation === "socket" && request.method === "GET") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
        return json({ error: "websocket-required" }, 426, headers);
      return stub.fetch(
        new Request("https://match.internal/socket", {
          method: "GET",
          headers: { Upgrade: "websocket" },
        }),
      );
    }
    if (operation === "resign" && request.method === "POST") {
      const credential = request.headers.get("authorization");
      if (!credential) return json({ error: "unauthorized" }, 401, headers);
      return stub.fetch(
        new Request("https://match.internal/resign", {
          method: "POST",
          headers: { Authorization: credential },
        }),
      );
    }
    if (operation === "cancel" && request.method === "POST") {
      const credential = request.headers.get("authorization");
      if (!credential) return json({ error: "unauthorized" }, 401, headers);
      const result = await stub.fetch(
        new Request("https://match.internal/cancel", {
          method: "POST",
          headers: { Authorization: credential },
        }),
      );
      return json(await result.json(), result.status, headers);
    }
    if (operation === "leave" && request.method === "POST") {
      const credential = request.headers.get("authorization");
      if (!credential) return json({ error: "unauthorized" }, 401, headers);
      const result = await stub.fetch(
        new Request("https://match.internal/leave", {
          method: "POST",
          headers: { Authorization: credential },
        }),
      );
      return json(await result.json(), result.status, headers);
    }
    if (operation === "leave-series" && request.method === "POST") {
      const credential = request.headers.get("authorization");
      if (!credential) return json({ error: "unauthorized" }, 401, headers);
      const result = await stub.fetch(
        new Request("https://match.internal/leave-series", {
          method: "POST",
          headers: { Authorization: credential },
        }),
      );
      return json(await result.json(), result.status, headers);
    }
    if (!operation && request.method === "GET") {
      const snapshotHeaders = new Headers();
      const authorization = request.headers.get("authorization");
      if (authorization) snapshotHeaders.set("Authorization", authorization);
      const response = await stub.fetch(
        new Request("https://match.internal/snapshot", { headers: snapshotHeaders }),
      );
      const payload = (await response.json()) as unknown;
      return json(payload, response.status, headers);
    }
    return json({ error: "not-found" }, 404, headers);
  },
};

export class MatchDurableObject {
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: WorkerEnv,
  ) {}

  private async serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private enqueueSeriesHistory(match: Match): boolean {
    const payload = seriesResultPayload(match);
    if (!payload || match.seriesNumber <= (match.persistedSeriesNumber ?? 0)) return false;
    const historyOutbox = match.historyOutbox ?? [];
    if (historyOutbox.some((entry) => entry.seriesNumber === match.seriesNumber)) return false;
    match.historyOutbox = [
      ...historyOutbox,
      {
        seriesNumber: match.seriesNumber,
        payload,
        attempts: 0,
        retryAt: Date.now() + 30_000,
      },
    ].sort((left, right) => left.seriesNumber - right.seriesNumber);
    return true;
  }

  private async load(retryHistory = true): Promise<Match | null> {
    const stored = await this.ctx.storage.get<Match>("match");
    if (!stored) return null;
    const normalized = normalizeMatch(stored);
    const game = gameForMatch(normalized);
    if (
      !game ||
      (normalized.state !== null &&
        !game.inspectState(normalized.state, normalized.rulesVersion).ok)
    )
      return null;
    let shouldPersist = timerStateNeedsPersistence(stored, normalized);
    if (
      ["completed", "cancelled", "expired"].includes(normalized.status) &&
      (typeof normalized.retentionDeadline !== "number" ||
        !Number.isFinite(normalized.retentionDeadline))
    ) {
      normalized.retentionDeadline = Date.now() + TERMINAL_MATCH_RETENTION_MS;
      shouldPersist = true;
    }
    const enqueuedHistory = this.enqueueSeriesHistory(normalized);
    if (enqueuedHistory) shouldPersist = true;
    if (shouldPersist) await this.ctx.storage.put("match", normalized);
    if (retryHistory && normalized.historyOutbox?.length)
      this.queueSeriesHistoryWrite(normalized, enqueuedHistory);
    if (shouldPersist) await this.schedule(normalized);
    return normalized;
  }
  private async save(match: Match): Promise<void> {
    const enqueuedHistory = this.enqueueSeriesHistory(match);
    await this.ctx.storage.put("match", match);
    if (match.historyOutbox?.length) this.queueSeriesHistoryWrite(match, enqueuedHistory);
  }

  private readonly historyWritesInFlight = new Set<string>();

  private queueSeriesHistoryWrite(match: Match, force = false): void {
    const serviceKey = supabaseServerKey(this.env);
    const baseUrl = this.env.SUPABASE_URL?.trim();
    if (!serviceKey || !baseUrl) return;
    const pending = match.historyOutbox?.find((entry) => force || entry.retryAt <= Date.now());
    if (!pending) return;
    const completionId = `${match.id}:${pending.seriesNumber}`;
    if (this.historyWritesInFlight.has(completionId)) return;
    this.historyWritesInFlight.add(completionId);
    this.ctx.waitUntil(
      (async () => {
        let roundsPersisted = false;
        try {
          roundsPersisted = await this.writeSeriesHistory(baseUrl, serviceKey, pending.payload);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            roundsPersisted = await this.writeSeriesHistory(baseUrl, serviceKey, pending.payload);
          } catch {
            /* A transient failure keeps the durable outbox for the scheduled retry. */
          }
        }
        if (!roundsPersisted) {
          await this.scheduleHistoryRetry(match.id, pending.seriesNumber);
          console.warn("[game-history] Round boards are not persisted yet.");
          return;
        }
        const current = await this.markSeriesHistoryPersisted(match.id, pending.seriesNumber);
        if (current) {
          await this.schedule(current);
          this.queueSeriesHistoryWrite(current);
        }
      })()
        .catch(async () => {
          // The Durable Object outbox remains authoritative until Supabase confirms the write.
          console.warn("[game-history] Could not persist a completed series.");
        })
        .finally(() => this.historyWritesInFlight.delete(completionId)),
    );
  }

  private async writeSeriesHistory(
    baseUrl: string,
    serviceKey: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const headers = {
      apikey: serviceKey,
      ...(serviceKey.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${serviceKey}` }),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    };
    const body = JSON.stringify({ result_payload: payload });
    const endpoint = new URL("/rest/v1/rpc/record_match_series_with_rounds", baseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return true;

    // The round-board migration is additive. If a deployment is temporarily
    // behind, still persist the account result through the original RPC so
    // neither player's history disappears while replay storage is unavailable.
    const errorBody = await response.text().catch(() => "");
    const missingRoundsRpc =
      response.status === 404 ||
      /PGRST202|42883|record_match_series_with_rounds.*(?:not found|does not exist)/i.test(
        errorBody,
      );
    if (!missingRoundsRpc) throw new Error("history-write-failed");

    const fallback = await fetch(new URL("/rest/v1/rpc/record_match_series", baseUrl), {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!fallback.ok) throw new Error("history-write-failed");
    return false;
  }

  private async markSeriesHistoryPersisted(
    matchId: string,
    seriesNumber: number,
  ): Promise<Match | null> {
    return this.serializeMutation(async () => {
      const saved = await this.ctx.storage.get<Match>("match");
      if (!saved || saved.id !== matchId) return null;
      const current = normalizeMatch(saved);
      current.persistedSeriesNumber = Math.max(current.persistedSeriesNumber ?? 0, seriesNumber);
      current.historyOutbox = (current.historyOutbox ?? []).filter(
        (entry) => entry.seriesNumber !== seriesNumber,
      );
      await this.ctx.storage.put("match", current);
      return current;
    });
  }

  private async scheduleHistoryRetry(matchId: string, seriesNumber: number): Promise<void> {
    await this.serializeMutation(async () => {
      const saved = await this.ctx.storage.get<Match>("match");
      if (!saved || saved.id !== matchId) return;
      const current = normalizeMatch(saved);
      current.historyOutbox = (current.historyOutbox ?? []).map((entry) =>
        entry.seriesNumber === seriesNumber
          ? {
              ...entry,
              attempts: entry.attempts + 1,
              retryAt: Date.now() + historyRetryDelay(entry.attempts + 1),
            }
          : entry,
      );
      await this.ctx.storage.put("match", current);
      await this.schedule(current);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const operation = new URL(request.url).pathname.split("/").at(-1);
    if (operation === "create" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object") return json({ error: "invalid-request" }, 400);
      const data = input as { match?: Match; inviteHash?: string | null };
      if (
        !data.match ||
        !ID_PATTERN.test(data.match.id) ||
        !["public", "invite"].includes(data.match.visibility)
      )
        return json({ error: "invalid-match" }, 400);
      if (await this.load()) return json({ error: "already-exists" }, 409);
      await this.save(data.match);
      if (data.match.visibility === "invite" && data.inviteHash)
        await this.ctx.storage.put("invite-hash", data.inviteHash);
      await this.schedule(data.match);
      return json({ ok: true }, 201);
    }
    if (operation === "join" && request.method === "POST")
      return this.serializeMutation(() => this.join(request));
    if (operation === "preview" && request.method === "POST")
      return this.serializeMutation(() => this.preview(request));
    if (operation === "cancel" && request.method === "POST")
      return this.serializeMutation(() => this.cancelWaitingRoom(request));
    if (operation === "leave" && request.method === "POST")
      return this.serializeMutation(() => this.leaveWaitingRoom(request));
    if (operation === "leave-series" && request.method === "POST")
      return this.serializeMutation(() => this.leaveCompletedSeries(request));
    if (operation === "snapshot" && request.method === "GET") {
      const match = await this.load();
      if (!match) return json({ error: "not-found" }, 404);
      const credential = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!credential) return json({ error: "unauthorized" }, 401);
      const credentialHash = await hash(credential);
      if (!match.seats.some((seat) => seat?.tokenHash === credentialHash))
        return json({ error: "unauthorized" }, 401);
      await this.alarm();
      const latest = await this.load();
      return latest ? json(snapshot(latest)) : json({ error: "not-found" }, 404);
    }
    if (operation === "socket" && request.method === "GET")
      return this.serializeMutation(() => this.socketUpgrade());
    if (operation === "resign" && request.method === "POST")
      return this.serializeMutation(() => this.resign(request));
    return json({ error: "not-found" }, 404);
  }

  private async join(request: Request): Promise<Response> {
    const input = await body(request);
    if (!input || typeof input !== "object") return json({ error: "invalid-request" }, 400);
    const data = input as {
      inviteHash?: unknown;
      seatTokenHash?: unknown;
      displayName?: unknown;
      accountId?: unknown;
      clientRulesVersion?: unknown;
      clientSupportedGames?: unknown;
      now?: unknown;
    };
    if (typeof data.seatTokenHash !== "string" || typeof data.now !== "number")
      return json({ error: "invalid-request" }, 400);
    const match = await this.load();
    if (!match) return json({ error: "not-found" }, 404);
    if (
      !clientSupportsMatchRules(data.clientSupportedGames, data.clientRulesVersion, match) ||
      !gameForMatch(match)?.supportsRulesVersion(match.rulesVersion)
    )
      return json({ error: "client-update-required" }, 426);
    if (await this.expireWaitingRoom(match, data.now)) return json({ error: "room-expired" }, 410);
    if (match.status === "expired") return json({ error: "room-expired" }, 410);
    if (match.status === "cancelled") return json({ error: "room-unavailable" }, 410);
    if (match.status !== "waiting" || match.seats[1]) return json({ error: "room-full" }, 409);
    if (match.visibility === "invite") {
      const expected = await this.ctx.storage.get<string>("invite-hash");
      if (typeof data.inviteHash !== "string" || !expected || data.inviteHash !== expected)
        return json({ error: "invite-invalid" }, 403);
    }
    const joiningAccountId =
      typeof data.accountId === "string" && /^[0-9a-f-]{36}$/i.test(data.accountId)
        ? data.accountId.toLowerCase()
        : null;
    const hostAccountId =
      typeof match.seats[0]?.accountId === "string" ? match.seats[0].accountId.toLowerCase() : null;
    if (joiningAccountId && joiningAccountId === hostAccountId)
      return json({ error: "same-account-match" }, 409);
    const displayName = normalizeDisplayName(data.displayName, match.id, 1);
    const hostDisplayName = normalizeDisplayName(match.seats[0]?.displayName, match.id, 0);
    if (displayNameKey(displayName) === displayNameKey(hostDisplayName)) {
      return json({ error: "player-name-taken" }, 409);
    }
    match.seats[1] = {
      tokenHash: data.seatTokenHash,
      accountId: joiningAccountId,
      displayName,
      connected: false,
      reconnectRemainingMs: sessionPolicy(match).reconnectDurationMs,
      disconnectedAt: null,
    };
    match.aiFallbackAt = null;
    match.revision += 1;
    await this.save(match);
    await this.removeFromLobby(match);
    return json({
      matchId: match.id,
      seat: "second",
      visibility: match.visibility,
      status: match.status,
    });
  }

  private async preview(request: Request): Promise<Response> {
    const input = await body(request);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({ error: "invalid-request" }, 400);
    const data = input as {
      inviteHash?: unknown;
      clientRulesVersion?: unknown;
      clientSupportedGames?: unknown;
    };
    const match = await this.load();
    if (!match) return json({ error: "not-found" }, 404);
    if (
      !clientSupportsMatchRules(data.clientSupportedGames, data.clientRulesVersion, match) ||
      !gameForMatch(match)?.supportsRulesVersion(match.rulesVersion)
    )
      return json({ error: "client-update-required" }, 426);
    if (match.visibility === "invite") {
      const expected = await this.ctx.storage.get<string>("invite-hash");
      if (typeof data.inviteHash !== "string" || !expected || data.inviteHash !== expected)
        return json({ error: "invite-invalid" }, 403);
    }
    if (await this.expireWaitingRoom(match, Date.now()))
      return json({ error: "room-expired" }, 410);
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
    if (match.status !== "waiting" || match.seats[1])
      return json(
        { error: match.seats[1] ? "room-full" : "room-not-waiting", match: snapshot(match) },
        409,
      );
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
    if (await this.expireWaitingRoom(match, Date.now()))
      return json({ error: "room-expired" }, 410);
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
      if (attachment?.authenticated && attachment.seat === "second")
        socket.close(1000, "Player left the waiting room");
    }
    this.broadcast({ type: "match", match: snapshot(match) });
    if (match.visibility === "public") {
      try {
        const lobby = this.env.LOBBY_HUB.get(this.env.LOBBY_HUB.idFromName("lobby:global"));
        await lobby.fetch(
          new Request("https://lobby-hub.internal/upsert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              matchId: match.id,
              gameId: match.gameId,
              rulesVersion: match.rulesVersion,
              displayName: match.seats[0]?.displayName ?? "Player",
              seriesTarget: match.seriesTarget,
              createdAt: match.createdAt,
              expiresAt: match.expiresAt,
            }),
          }),
        );
      } catch {
        /* The waiting room remains authoritative; the lobby entry can be refreshed later. */
      }
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
    if (match.status === "completed" && match.closedSeats[index])
      return json({ match: snapshot(match) });
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
    server.serializeAttachment?.({
      authenticated: false,
      authDeadline: Date.now() + AUTH_TIMEOUT_MS,
    } satisfies SocketAttachment);
    await this.schedule(match);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    return this.serializeMutation(() => this.processWebSocketMessage(socket, raw));
  }

  private async processWebSocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_FRAME_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(raw) as unknown;
    } catch {
      socket.close(1007, "Invalid JSON");
      return;
    }
    const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
    const match = await this.load();
    if (!attachment || !match) {
      socket.close(1011, "Match unavailable");
      return;
    }

    if (!attachment.authenticated) {
      const authMessage = message as Record<string, unknown> | null;
      if (
        !authMessage ||
        authMessage.type !== "authenticate" ||
        typeof authMessage.seatToken !== "string" ||
        (authMessage.supportsTurnReceipt !== undefined &&
          typeof authMessage.supportsTurnReceipt !== "boolean") ||
        Date.now() > attachment.authDeadline
      ) {
        socket.close(1008, "Authentication required");
        return;
      }
      const tokenHash = await hash(authMessage.seatToken);
      const index = match.seats.findIndex((seat) => seat?.tokenHash === tokenHash);
      if (index < 0 || !match.seats[index]) {
        socket.close(1008, "Invalid seat credential");
        return;
      }
      const seat = index === 0 ? "first" : "second";
      if (match.closedSeats[index]) {
        socket.close(1008, "This seat has left the game");
        return;
      }
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
          seatState.reconnectRemainingMs = Math.max(
            0,
            seatState.reconnectRemainingMs - disconnectedFor,
          );
          seatState.disconnectedAt = null;
        }
      }
      if (
        match.status === "active" &&
        match.reconnectSeat === seat &&
        match.reconnectDeadline !== null
      ) {
        if (now >= match.reconnectDeadline) {
          await this.finishForfeit(match, seat, "reconnect-timeout");
          socket.close(1008, "Reconnect window expired");
          return;
        }
        if (!match.turnReceiptPending) {
          const disconnectedFor =
            seatState.disconnectedAt === null ? 0 : Date.now() - seatState.disconnectedAt;
          seatState.reconnectRemainingMs = Math.max(
            0,
            seatState.reconnectRemainingMs - disconnectedFor,
          );
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
        if (oldAttachment?.authenticated && oldAttachment.seat === seat)
          oldSocket.close(4001, "Replaced by a newer connection");
      }
      if (match.seats.every((entry) => entry?.connected) && match.status === "waiting") {
        match.status = "countdown";
        match.countdownAt = Date.now() + COUNTDOWN_MS;
      }
      if (
        match.status === "between-games" &&
        match.seats.every((entry) => entry?.connected) &&
        (match.nextReady.every(Boolean) ||
          (match.nextGameDeadline !== null && now >= match.nextGameDeadline))
      ) {
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

    if (!message || typeof message !== "object" || !("type" in message)) {
      socket.send(JSON.stringify({ type: "error", code: "invalid-message" }));
      return;
    }
    if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }
    if (message.type === "turn-received") {
      const receipt = message as Record<string, unknown>;
      if (
        Object.keys(receipt).some((key) => !["type", "revision"].includes(key)) ||
        !Number.isSafeInteger(receipt.revision)
      ) {
        socket.send(JSON.stringify({ type: "error", code: "invalid-turn-receipt" }));
        return;
      }
      if (
        !match.turnReceiptPending ||
        match.status !== "active" ||
        match.reconnectSeat !== attachment.seat ||
        stateNextPlayer(match) !== attachment.seat ||
        receipt.revision !== match.revision
      ) {
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
        const disconnectedSinceReceipt = Math.max(
          0,
          now - Math.max(seat.disconnectedAt, receiptStartedAt),
        );
        seat.reconnectRemainingMs = Math.max(
          0,
          seat.reconnectRemainingMs - disconnectedSinceReceipt,
        );
      }
      seat.connected = true;
      seat.disconnectedAt = null;
      match.turnDeadline =
        now + Math.max(0, match.pausedTurnMs ?? sessionPolicy(match).turnDurationMs);
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
      if (
        Object.keys(message).some((key) => !["type", "syncId"].includes(key)) ||
        typeof syncId !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(syncId)
      ) {
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
      await this.processAlarm();
      const latest = await this.load();
      if (!latest) {
        socket.close(1011, "Match unavailable");
        return;
      }
      socket.send(JSON.stringify({ type: "match", match: snapshot(latest), syncId }));
      return;
    }
    if (message.type === "reaction" || message.type === "quick-message") {
      const activity = message as Record<string, unknown>;
      const isReaction = message.type === "reaction";
      const validKeys = isReaction ? ["type", "reactionId"] : ["type", "message"];
      const reactionId = activity.reactionId;
      const text = normalizeQuickMessage(activity.message);
      if (
        Object.keys(activity).some((key) => !validKeys.includes(key)) ||
        (isReaction ? !isMatchReactionId(reactionId) : text === null)
      ) {
        if (isReaction) socket.send(JSON.stringify({ type: "error", code: "invalid-reaction" }));
        else
          socket.send(JSON.stringify({ type: "quick-message-rejected", code: "invalid-message" }));
        return;
      }
      if (match.status !== "active") {
        socket.send(
          JSON.stringify({
            type: isReaction ? "reaction-rejected" : "quick-message-rejected",
            code: "match-not-active",
          }),
        );
        return;
      }
      const now = Date.now();
      const reactionTimes = (attachment.reactionTimes ?? []).filter((at) => now - at < 10_000);
      const lastReactionAt = reactionTimes.at(-1) ?? 0;
      if (
        reactionTimes.length >= MAX_SOCIAL_EVENTS_PER_10S ||
        now - lastReactionAt < REACTION_COOLDOWN_MS
      ) {
        socket.send(
          JSON.stringify({
            type: isReaction ? "reaction-rejected" : "quick-message-rejected",
            code: "rate-limited",
          }),
        );
        return;
      }
      reactionTimes.push(now);
      socket.serializeAttachment?.({ ...attachment, reactionTimes } satisfies SocketAttachment);
      if (isReaction)
        this.broadcast({ type: "reaction", eventId: token(12), seat: attachment.seat, reactionId });
      else
        this.broadcast({
          type: "quick-message",
          eventId: token(12),
          seat: attachment.seat,
          message: text,
        });
      return;
    }
    if (message.type === "resign") {
      if (match.status !== "active") {
        socket.send(JSON.stringify({ type: "match", match: snapshot(match) }));
        return;
      }
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
      if (match.status !== "completed") {
        socket.send(JSON.stringify({ type: "error", code: "series-not-complete" }));
        return;
      }
      const index = attachment.seat === "first" ? 0 : 1;
      match.closedSeats[index] = true;
      match.rematchReady = [false, false];
      match.revision += 1;
      await this.publish(match);
      return;
    }
    if (message.type !== "submit-action") {
      socket.send(JSON.stringify({ type: "error", code: "unsupported-message" }));
      return;
    }
    const game = gameForMatch(match);
    if (!game || match.state === null) {
      socket.send(JSON.stringify({ type: "error", code: "unsupported-game" }));
      return;
    }
    const parsed = parseGameCommand(message, game, match.rulesVersion);
    if (!parsed.ok || parsed.value.matchId !== match.id) {
      socket.send(JSON.stringify({ type: "error", code: "invalid-action" }));
      return;
    }
    const command = parsed.value;
    if (Object.hasOwn(match.recentActions, command.actionId)) {
      const prior = match.recentActions[command.actionId] as Record<string, unknown>;
      socket.send(JSON.stringify({ ...prior, match: snapshot(match) }));
      return;
    }
    const now = Date.now();
    const index = attachment.seat === "first" ? 0 : 1;
    const times = match.actionTimes[index].filter((at) => now - at < 10_000);
    if (times.length >= MAX_ACTIONS_PER_10S) {
      socket.send(
        JSON.stringify({
          type: "action-rejected",
          actionId: command.actionId,
          code: "rate-limited",
        }),
      );
      return;
    }
    times.push(now);
    match.actionTimes[index] = times;
    if (match.status !== "active" || match.turnDeadline === null || now >= match.turnDeadline) {
      socket.send(
        JSON.stringify({
          type: "action-rejected",
          actionId: command.actionId,
          code: "match-not-active",
        }),
      );
      return;
    }
    if (command.expectedRevision !== match.revision) {
      socket.send(
        JSON.stringify({
          type: "action-rejected",
          actionId: command.actionId,
          code: "stale-revision",
          revision: match.revision,
        }),
      );
      return;
    }
    if (stateNextPlayer(match) !== attachment.seat) {
      socket.send(
        JSON.stringify({
          type: "action-rejected",
          actionId: command.actionId,
          code: "wrong-turn",
          revision: match.revision,
        }),
      );
      return;
    }
    const result = game.applyAction(
      match.state,
      attachment.seat,
      command.action,
      match.rulesVersion,
    );
    if (!result.ok) {
      socket.send(
        JSON.stringify({
          type: "action-rejected",
          actionId: command.actionId,
          code: result.error.code,
        }),
      );
      return;
    }
    const inspectedState = game.inspectState(result.value, match.rulesVersion);
    if (!inspectedState.ok) {
      socket.send(JSON.stringify({ type: "error", code: "invalid-game-state" }));
      return;
    }
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
    for (const oldId of actionIds.slice(0, Math.max(0, actionIds.length - 64)))
      delete match.recentActions[oldId];
    await this.save(match);
    await this.schedule(match);
    this.broadcast(event);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    return this.serializeMutation(() => this.processWebSocketClose(socket));
  }

  private async processWebSocketClose(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
    if (!attachment?.authenticated) return;
    const hasReplacement = this.ctx.getWebSockets().some((candidate) => {
      if (candidate === socket) return false;
      const candidateAttachment = candidate.deserializeAttachment?.() as SocketAttachment | null;
      return (
        candidateAttachment?.authenticated === true && candidateAttachment.seat === attachment.seat
      );
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
    if (
      match.status === "active" &&
      stateNextPlayer(match) === attachment.seat &&
      match.turnDeadline !== null
    ) {
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
    return this.serializeMutation(() => this.processAlarm());
  }

  private async processAlarm(): Promise<void> {
    const match = await this.load(false);
    if (!match) return;
    const now = Date.now();
    if (match.historyOutbox?.some((entry) => entry.retryAt <= now))
      this.queueSeriesHistoryWrite(match);
    if (["completed", "cancelled", "expired"].includes(match.status)) {
      if (!match.houseLeaseReleaseAttempted) {
        try {
          await releaseHousePlayer(this.env, match.id);
          match.houseLeaseReleased = true;
        } catch {
          /* Lease expiry is the bounded cleanup fallback. */
        }
        match.houseLeaseReleaseAttempted = true;
        await this.ctx.storage.put("match", match);
      }
      if (typeof match.retentionDeadline === "number" && now >= match.retentionDeadline) {
        if (match.historyOutbox?.length) {
          await this.schedule(match);
          return;
        }
        for (const socket of this.ctx.getWebSockets()) socket.close(1000, "Match data expired");
        await this.ctx.storage.deleteAll();
        return;
      }
      await this.schedule(match);
      return;
    }
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
      if (attachment && !attachment.authenticated && now >= attachment.authDeadline)
        socket.close(1008, "Authentication timeout");
    }
    let changed = false;
    if (await this.expireWaitingRoom(match, now)) return;
    if (
      match.status === "waiting" &&
      match.aiFallbackAt !== null &&
      match.aiFallbackAt !== undefined &&
      now >= match.aiFallbackAt &&
      !match.seats[1]
    ) {
      const provider = opponentProviderForGame(match.gameId);
      const game = gameForMatch(match);
      if (provider && game) {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
        const profileId =
          provider.profileIds[seed % provider.profileIds.length] ?? provider.defaultProfileId;
        let housePlayer: InHousePlayer | null = null;
        try {
          housePlayer = await claimAnyHousePlayer(this.env, match.id);
        } catch {
          /* No server-side roster claim means we keep the room human-joinable. */
        }
        if (!housePlayer) {
          match.aiFallbackAt = null;
          match.revision += 1;
          await this.save(match);
          await this.schedule(match);
          this.broadcast({ type: "match", match: snapshot(match) });
          return;
        }
        match.seats[1] = {
          tokenHash: null,
          kind: "ai",
          aiProfileId: profileId,
          inHousePlayerId: housePlayer.player_id,
          displayName:
            displayNameKey(housePlayer.display_name) ===
            displayNameKey(match.seats[0]?.displayName ?? "")
              ? uniqueGeneratedDisplayName(match.id, 1, [match.seats[0]?.displayName ?? ""])
              : housePlayer.display_name,
          connected: true,
          reconnectRemainingMs: sessionPolicy(match).reconnectDurationMs,
          disconnectedAt: null,
        };
        match.aiSeed = seed;
        match.aiEngineVersion = provider.currentEngineVersion;
        match.aiRematchesAllowed = aiRematchLimit(seed);
        match.aiRematchesUsed = 0;
        match.aiFallbackAt = null;
        if (match.seats[0]?.connected) {
          match.status = "countdown";
          match.countdownAt = now + COUNTDOWN_MS;
        }
        match.revision += 1;
        await this.save(match);
        await this.removeFromLobby(match);
        await this.schedule(match);
        this.broadcast({ type: "match", match: snapshot(match) });
        return;
      }
    }
    if (match.status === "countdown" && match.countdownAt !== null && now >= match.countdownAt) {
      if (match.seats.every((seat) => seat?.connected)) {
        const startsRematch = match.rematchCountdown;
        if (startsRematch) {
          const houseSeat = match.seats.find((seat) => seat?.inHousePlayerId);
          if (houseSeat?.inHousePlayerId) {
            let claimed: InHousePlayer | null = null;
            try {
              claimed = await claimHousePlayer(this.env, houseSeat.inHousePlayerId, match.id);
            } catch {
              /* Treat a database outage as unavailable instead of starting unranked. */
            }
            if (!claimed) {
              match.status = "completed";
              match.countdownAt = null;
              match.rematchCountdown = false;
              match.nextReady = [false, false];
              match.rematchReady = [false, false];
              match.outcome = "rematch-opponent-unavailable";
              match.revision += 1;
              await this.save(match);
              await this.schedule(match);
              this.broadcast({ type: "match", match: snapshot(match) });
              return;
            }
            houseSeat.displayName = claimed.display_name;
            match.houseLeaseReleased = false;
          }
          match.seriesNumber += 1;
          match.roundHistory = [];
          match.seriesCompletedAt = null;
          if (match.seats.some((seat) => seat?.kind === "ai")) {
            match.aiRematchesUsed = Math.min(3, (match.aiRematchesUsed ?? 0) + 1);
          }
          match.wins = { first: 0, second: 0 };
          match.gameNumber = 0;
          match.seriesWinner = null;
          match.outcome = null;
          match.nextReady = [false, false];
          match.rematchReady = [false, false];
          match.closedSeats = [false, false];
        }
        const starter =
          match.nextStartingSeat ??
          (crypto.getRandomValues(new Uint8Array(1))[0]! % 2 === 0 ? "first" : "second");
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
        match.status = match.rematchCountdown
          ? "completed"
          : match.gameNumber > 0
            ? "between-games"
            : "waiting";
        match.retentionDeadline =
          match.status === "completed" ? now + TERMINAL_MATCH_RETENTION_MS : null;
        match.countdownAt = null;
        match.rematchCountdown = false;
        match.nextReady = [false, false];
        match.rematchReady = [false, false];
        if (match.status === "between-games") match.nextGameDeadline = now + NEXT_GAME_TIMEOUT_MS;
      }
      match.revision += 1;
      changed = true;
    } else if (
      match.status === "active" &&
      match.reconnectDeadline !== null &&
      now >= match.reconnectDeadline &&
      match.reconnectSeat
    ) {
      await this.finishForfeit(match, match.reconnectSeat, "reconnect-timeout");
      return;
    } else if (
      match.status === "active" &&
      match.turnDeadline !== null &&
      now >= match.turnDeadline
    ) {
      const loser = stateNextPlayer(match);
      this.applyGameOutcome(match, loser ? `timeout-${loser}` : "draw");
      match.revision += 1;
      changed = true;
    } else if (match.status === "between-games") {
      changed = this.expireIntermissionDisconnects(match, now);
      if (
        match.status === "between-games" &&
        match.nextGameDeadline !== null &&
        now >= match.nextGameDeadline &&
        match.seats.every((seat) => seat?.connected)
      ) {
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
    const round = roundHistoryResult(match, outcome);
    if (round) {
      const rounds = match.roundHistory ?? [];
      match.roundHistory = [
        ...rounds.filter((entry) => entry.roundNumber !== round.roundNumber),
        round,
      ].sort((left, right) => left.roundNumber - right.roundNumber);
    }
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
    match.seriesCompletedAt = match.seriesWinner ? Date.now() : null;
    match.status = match.seriesWinner ? "completed" : "between-games";
    match.retentionDeadline =
      match.status === "completed" ? Date.now() + TERMINAL_MATCH_RETENTION_MS : null;
    if (match.status === "completed") {
      const aiIndex = match.seats.findIndex((seat) => seat?.kind === "ai");
      if (aiIndex >= 0 && (match.aiRematchesUsed ?? 0) >= (match.aiRematchesAllowed ?? 1)) {
        match.closedSeats[aiIndex] = true;
      }
    }
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
    if (
      match.status !== "active" ||
      match.state === null ||
      !Number.isSafeInteger(match.aiEngineVersion)
    )
      return;
    const aiIndex = match.seats.findIndex((seat) => seat?.kind === "ai");
    const ai = match.seats[aiIndex];
    const aiSeat: PlayerSeat | null = aiIndex === 0 ? "first" : aiIndex === 1 ? "second" : null;
    if (!aiSeat || !ai?.aiProfileId) return;
    const opponent = opponentProviderForVersion(match.gameId, match.aiEngineVersion!);
    if (!opponent || !opponent.supportsProfile(ai.aiProfileId)) return;
    const game = gameForMatch(match);
    if (!game || !game.inspectState(match.state, match.rulesVersion).ok) return;
    let inspected = game.inspectState(match.state, match.rulesVersion);
    // Some games can pass a turn without an action. If that gives the AI
    // another legal move, process it in this same request: no additional alarm,
    // network message, or storage round trip is needed.
    for (
      let moves = 0;
      inspected.ok && inspected.value.nextPlayer === aiSeat && moves < 60;
      moves += 1
    ) {
      const action = opponent.chooseAction(
        match.state,
        aiSeat,
        ai.aiProfileId,
        match.aiSeed ?? 1,
        match.aiEngineVersion!,
      );
      const applied = game.applyAction(match.state, aiSeat, action, match.rulesVersion);
      if (!applied.ok) return;
      inspected = game.inspectState(applied.value, match.rulesVersion);
      if (!inspected.ok) return;
      match.state = applied.value;
      match.revision += 1;
      if (inspected.value.outcome) {
        const result =
          inspected.value.outcome.kind === "draw"
            ? "draw"
            : `win-${inspected.value.outcome.winner}`;
        this.applyGameOutcome(match, result);
        return;
      }
    }

    const humanTurn = inspected.ok ? inspected.value.nextPlayer : null;
    if (!humanTurn || humanTurn === aiSeat) return;
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
    if (
      match.nextGameDeadline !== null &&
      now >= match.nextGameDeadline &&
      match.seats.every((entry) => entry?.connected)
    ) {
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
    match.nextStartingSeat = otherSeat(
      stateStartingPlayer(match) ?? match.seriesStartingSeat ?? "first",
    );
    match.status = "countdown";
    match.countdownAt = now + COUNTDOWN_MS;
    match.nextGameDeadline = null;
    match.nextReady = [false, false];
  }

  private async requestRematch(match: Match, seat: PlayerSeat): Promise<void> {
    if (match.status !== "completed" || !match.seriesWinner || match.closedSeats.some(Boolean))
      return;
    const index = seat === "first" ? 0 : 1;
    if (match.rematchReady[index]) return;
    const aiIndex = match.seats.findIndex((entry) => entry?.kind === "ai");
    if (aiIndex >= 0 && (match.aiRematchesUsed ?? 0) >= (match.aiRematchesAllowed ?? 1)) {
      match.closedSeats[aiIndex] = true;
      match.revision += 1;
      await this.publish(match);
      return;
    }
    match.rematchReady[index] = true;
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
    match.seriesCompletedAt = Date.now();
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
      .filter(
        ({ seat }) =>
          seat &&
          !seat.connected &&
          seat.disconnectedAt !== null &&
          now >= seat.disconnectedAt + seat.reconnectRemainingMs,
      );
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
    const stored = await this.ctx.storage.get<Match>("match");
    const current = stored?.id === match.id ? normalizeMatch(stored) : match;
    if (["completed", "cancelled", "expired"].includes(current.status)) {
      const deadlines: number[] = [];
      const pending = current.historyOutbox?.reduce<PendingHistoryWrite | null>(
        (earliest, entry) => (!earliest || entry.retryAt < earliest.retryAt ? entry : earliest),
        null,
      );
      if (pending && this.env.SUPABASE_URL?.trim() && supabaseServerKey(this.env)) {
        const key = `${current.id}:${pending.seriesNumber}`;
        deadlines.push(
          this.historyWritesInFlight.has(key)
            ? Date.now() + 15_000
            : Math.max(Date.now() + 50, pending.retryAt),
        );
      } else if (
        !pending &&
        typeof current.retentionDeadline === "number" &&
        Number.isFinite(current.retentionDeadline)
      ) {
        deadlines.push(current.retentionDeadline);
      }
      await setAlarmIfChanged(this.ctx.storage, deadlines.length ? Math.min(...deadlines) : null);
      return;
    }
    const now = Date.now();
    const deadlines: number[] = [];
    const pendingHistory = current.historyOutbox?.reduce<PendingHistoryWrite | null>(
      (earliest, entry) => (!earliest || entry.retryAt < earliest.retryAt ? entry : earliest),
      null,
    );
    if (pendingHistory && this.env.SUPABASE_URL?.trim() && supabaseServerKey(this.env)) {
      const key = `${current.id}:${pendingHistory.seriesNumber}`;
      deadlines.push(
        this.historyWritesInFlight.has(key)
          ? now + 15_000
          : Math.max(now + 50, pendingHistory.retryAt),
      );
    }
    const addDeadline = (deadline: number | null, dueIsActionable = true) => {
      if (typeof deadline !== "number" || !Number.isFinite(deadline)) return;
      if (deadline > now) deadlines.push(deadline);
      else if (dueIsActionable) deadlines.push(now + 50);
    };
    if (current.status === "waiting") addDeadline(current.expiresAt);
    if (current.status === "waiting") addDeadline(current.aiFallbackAt ?? null);
    if (current.status === "countdown") addDeadline(current.countdownAt);
    if (current.status === "active") {
      addDeadline(current.turnDeadline);
      if (current.reconnectSeat) addDeadline(current.reconnectDeadline);
    }
    if (current.status === "between-games") {
      addDeadline(
        current.nextGameDeadline,
        current.seats.every((seat) => seat?.connected),
      );
      for (const seat of current.seats) {
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
      await lobby.fetch(
        new Request(`https://lobby-hub.internal/remove?matchId=${encodeURIComponent(match.id)}`, {
          method: "POST",
        }),
      );
    } catch {
      /* The room remains authoritative; stale directory entries expire independently. */
    }
  }

  private broadcast(event: unknown): void {
    const message = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment?.() as SocketAttachment | null;
      if (attachment?.authenticated) {
        try {
          socket.send(message);
        } catch {
          socket.close(1011, "Send failed");
        }
      }
    }
  }
}

type LobbySocketAttachment = { gameId: GameId | null; identified: boolean };
const LOBBY_PAGE_SIZE = 20;

/** Event-driven, cross-game lobby feed for joinable human-created rooms. */
export class LobbyHubDurableObject {
  private readonly matchmakingTails = new Map<string, Promise<void>>();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: WorkerEnv,
  ) {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS public_rooms (
        match_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        rules_version INTEGER NOT NULL DEFAULT 1,
        display_name TEXT NOT NULL,
        series_target INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
    const columns = this.ctx.storage.sql
      .exec<{ name: string }>("PRAGMA table_info(public_rooms)")
      .toArray();
    if (!columns.some((column) => column.name === "rules_version")) {
      this.ctx.storage.sql.exec(
        "ALTER TABLE public_rooms ADD COLUMN rules_version INTEGER NOT NULL DEFAULT 1",
      );
    }
    this.ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS lobby_rooms_created ON public_rooms (created_at DESC, match_id ASC);
      CREATE INDEX IF NOT EXISTS lobby_rooms_game_created ON public_rooms (game_id, created_at DESC, match_id ASC);
      CREATE INDEX IF NOT EXISTS lobby_rooms_expiry ON public_rooms (expires_at);
      CREATE INDEX IF NOT EXISTS lobby_rooms_matchmaking ON public_rooms (game_id, rules_version, series_target, created_at, match_id);
    `);
  }

  private async serializeMatchmaking<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.matchmakingTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.matchmakingTails.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.matchmakingTails.get(key) === current) this.matchmakingTails.delete(key);
    }
  }

  private upsertEntry(entry: LobbyEntry): void {
    this.ctx.storage.sql.exec(
      `
      INSERT INTO public_rooms (match_id, game_id, rules_version, display_name, series_target, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        game_id = excluded.game_id,
        rules_version = excluded.rules_version,
        display_name = excluded.display_name,
        series_target = excluded.series_target,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `,
      entry.matchId,
      entry.gameId,
      entry.rulesVersion,
      entry.displayName,
      entry.seriesTarget,
      entry.createdAt,
      entry.expiresAt,
    );
  }

  private async quickMatch(input: Record<string, unknown>): Promise<Response> {
    const gameId = typeof input.gameId === "string" ? input.gameId : "";
    const game = workerGames.get(gameId);
    const provider = opponentProviderForGame(gameId);
    const rulesVersion = input.rulesVersion;
    const seriesTarget = input.seriesTarget;
    const matchAnySeries = input.matchAnySeries === true;
    if (!game || !provider) return json({ error: "unsupported-game" }, 404);
    if (typeof rulesVersion !== "number" || !game.supportsRulesVersion(rulesVersion))
      return json({ error: "unsupported-rules-version" }, 400);
    if (seriesTarget !== 1 && seriesTarget !== 2 && seriesTarget !== 3)
      return json({ error: "invalid-series-target" }, 400);

    const key = `${gameId}:${rulesVersion}`;
    return this.serializeMatchmaking(key, async () => {
      const candidates = this.ctx.storage.sql
        .exec<LobbyEntry>(
          `
        SELECT match_id AS matchId, game_id AS gameId, rules_version AS rulesVersion,
          display_name AS displayName, series_target AS seriesTarget, created_at AS createdAt, expires_at AS expiresAt
        FROM public_rooms
        WHERE game_id = ? AND rules_version = ? AND (? = 1 OR series_target = ?) AND expires_at > ?
        ORDER BY created_at ASC, match_id ASC LIMIT 8
      `,
          gameId,
          rulesVersion,
          matchAnySeries ? 1 : 0,
          seriesTarget,
          Date.now(),
        )
        .toArray();

      for (const entry of candidates) {
        const seatToken = token();
        const matchStub = this.env.MATCHES.get(this.env.MATCHES.idFromName(entry.matchId));
        try {
          const joined = await matchStub.fetch(
            new Request("https://match.internal/join", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                seatTokenHash: await hash(seatToken),
                displayName: normalizeDisplayName(input.displayName, entry.matchId, 1),
                accountId: typeof input.accountId === "string" ? input.accountId : null,
                clientSupportedGames: { [gameId]: [rulesVersion] },
                clientRulesVersion: rulesVersion,
                now: Date.now(),
              }),
            }),
          );
          const payload = (await joined.json()) as Record<string, unknown>;
          if (joined.ok) {
            // The match room already claimed the seat. Directory reconciliation must
            // never turn that success into a second room creation if cleanup fails.
            try {
              if (this.removeEntry(entry.matchId, gameId)) await this.schedule();
            } catch {
              /* The match room is authoritative; stale entries expire independently. */
            }
            return json(
              {
                ...payload,
                seatToken,
                seat: "second",
                expiresAt: entry.expiresAt,
                seriesTarget: entry.seriesTarget,
                matched: true,
              },
              200,
            );
          }
          if (
            ["room-expired", "room-unavailable", "room-full", "not-found"].includes(
              String(payload.error),
            )
          ) {
            try {
              if (this.removeEntry(entry.matchId, gameId)) await this.schedule();
            } catch {
              /* Ignore directory cleanup failures and continue matching. */
            }
          }
        } catch {
          // Keep a transiently unreachable candidate indexed; its owning room remains authoritative.
        }
      }

      const id = createId();
      const seatToken = token();
      const createdAt = Date.now();
      const expiresAt = createdAt + ROOM_TTL_MS;
      const aiFallbackAt = publicAiFallbackAt(createdAt, expiresAt);
      const displayName = normalizeDisplayName(input.displayName, id, 0);
      const match: Match = {
        id,
        gameId,
        rulesVersion,
        visibility: "public",
        status: "waiting",
        createdAt,
        expiresAt,
        retentionDeadline: null,
        aiFallbackAt,
        revision: 0,
        state: null,
        roundHistory: [],
        seats: [
          {
            tokenHash: await hash(seatToken),
            accountId:
              typeof input.accountId === "string" && /^[0-9a-f-]{36}$/i.test(input.accountId)
                ? input.accountId
                : null,
            displayName,
            connected: false,
            reconnectRemainingMs: game.getSessionPolicy(rulesVersion).reconnectDurationMs,
            disconnectedAt: null,
          },
          null,
        ],
        countdownAt: null,
        turnDeadline: null,
        turnStartedAt: null,
        nextGameDeadline: null,
        reconnectSeat: null,
        reconnectDeadline: null,
        pausedTurnMs: null,
        turnReceiptPending: false,
        turnReceiptStartedAt: null,
        outcome: null,
        recentActions: {},
        actionTimes: [[], []],
        seriesTarget,
        wins: { first: 0, second: 0 },
        gameNumber: 0,
        seriesNumber: 1,
        seriesStartingSeat: null,
        nextStartingSeat: null,
        nextReady: [false, false],
        rematchReady: [false, false],
        closedSeats: [false, false],
        rematchCountdown: false,
        seriesWinner: null,
      };
      const stub = this.env.MATCHES.get(this.env.MATCHES.idFromName(id));
      const created = await stub.fetch(
        new Request("https://match.internal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ match }),
        }),
      );
      if (!created.ok) return json({ error: "match-create-failed" }, 503);
      const entry: LobbyEntry = {
        matchId: id,
        gameId,
        rulesVersion,
        displayName,
        seriesTarget,
        createdAt,
        expiresAt,
      };
      let listed = false;
      try {
        this.upsertEntry(entry);
        await this.schedule();
        listed = true;
        this.broadcastRoom({ type: "lobby-room-upsert", match: entry });
      } catch {
        /* Preserve the created room and seat credentials if lobby indexing is unavailable. */
      }
      return json(
        {
          matchId: id,
          gameId,
          visibility: "public",
          seat: "first",
          seatToken,
          status: "waiting",
          expiresAt,
          seriesTarget,
          matched: false,
          aiFallbackAt,
          listed,
        },
        201,
      );
    });
  }

  private removeEntry(matchId: string, gameId: GameId): boolean {
    const result = this.ctx.storage.sql.exec(
      "DELETE FROM public_rooms WHERE match_id = ?",
      matchId,
    );
    const removed = result.rowsWritten > 0;
    if (removed) this.broadcastRoom({ type: "lobby-room-remove", matchId, gameId });
    return removed;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const operation = url.pathname.split("/").at(-1);
    if (operation === "quick-match" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return json({ error: "invalid-request" }, 400);
      return this.quickMatch(input as Record<string, unknown>);
    }
    if (operation === "socket" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const requestedGame = url.searchParams.get("gameId");
      if (requestedGame && !SUPPORTED_GAME_IDS.includes(requestedGame as GameId))
        return json({ error: "unsupported-game" }, 404);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ["lobby"]);
      server.serializeAttachment?.({ gameId: requestedGame as GameId | null, identified: false });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (operation === "upsert" && request.method === "POST") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return json({ error: "invalid-request" }, 400);
      const entry = input as Partial<LobbyEntry>;
      const rulesVersion =
        entry.rulesVersion ?? workerGames.get(entry.gameId ?? "")?.rulesVersion ?? 1;
      if (
        typeof entry.matchId !== "string" ||
        !ID_PATTERN.test(entry.matchId) ||
        !entry.gameId ||
        !SUPPORTED_GAME_IDS.includes(entry.gameId) ||
        typeof entry.displayName !== "string" ||
        ![1, 2, 3].includes(entry.seriesTarget ?? 0) ||
        !Number.isSafeInteger(rulesVersion) ||
        !Number.isSafeInteger(entry.createdAt) ||
        !Number.isSafeInteger(entry.expiresAt)
      )
        return json({ error: "invalid-entry" }, 400);
      const normalizedEntry: LobbyEntry = { ...(entry as LobbyEntry), rulesVersion };
      this.upsertEntry(normalizedEntry);
      await this.schedule();
      this.broadcastRoom({ type: "lobby-room-upsert", match: normalizedEntry });
      return json({ ok: true }, 201);
    }
    if (operation === "remove" && request.method === "POST") {
      const matchId = url.searchParams.get("matchId");
      if (!matchId || !ID_PATTERN.test(matchId)) return json({ error: "invalid-match-id" }, 400);
      const existing = this.ctx.storage.sql
        .exec<{ gameId: GameId }>(
          "SELECT game_id AS gameId FROM public_rooms WHERE match_id = ?",
          matchId,
        )
        .toArray()[0];
      const result = this.ctx.storage.sql.exec(
        "DELETE FROM public_rooms WHERE match_id = ?",
        matchId,
      );
      if (result.rowsWritten > 0) {
        if (existing)
          this.broadcastRoom({ type: "lobby-room-remove", matchId, gameId: existing.gameId });
        try {
          await this.schedule();
        } catch {
          /* Expiry filtering keeps the directory correct until its next alarm. */
        }
      }
      return json({ ok: true });
    }
    if (operation === "list" && request.method === "GET") {
      const gameId = url.searchParams.get("gameId");
      if (gameId && !SUPPORTED_GAME_IDS.includes(gameId as GameId))
        return json({ error: "unsupported-game" }, 404);
      const cursor = url.searchParams.get("cursor");
      if (cursor && !/^\d{13}\.[A-Za-z0-9_-]{22}$/.test(cursor))
        return json({ error: "invalid-cursor" }, 400);
      const result = this.page(gameId as GameId | null, cursor, LOBBY_PAGE_SIZE);
      return json({ ...result, serverNow: Date.now() });
    }
    return json({ error: "not-found" }, 404);
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== "string" || raw.length > MAX_FRAME_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }
    let message: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      message = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    const attachment = socket.deserializeAttachment?.() as LobbySocketAttachment | null;
    if (!attachment) return;
    if (!attachment.identified) {
      if (
        message.type !== "identify" ||
        Object.keys(message).some((key) => !["type", "visitorId", "gameId"].includes(key)) ||
        (message.visitorId !== undefined &&
          (typeof message.visitorId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(message.visitorId)))
      ) {
        socket.close(1008, "Invalid lobby session");
        return;
      }
      const gameId =
        message.gameId === null || message.gameId === undefined ? null : message.gameId;
      if (
        gameId !== null &&
        (typeof gameId !== "string" || !SUPPORTED_GAME_IDS.includes(gameId as GameId))
      ) {
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
      if (
        gameId !== null &&
        (typeof gameId !== "string" || !SUPPORTED_GAME_IDS.includes(gameId as GameId))
      ) {
        socket.send(
          JSON.stringify({ type: "lobby-error", message: "That game filter is not available." }),
        );
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
    const expired = this.ctx.storage.sql
      .exec<{ matchId: string; gameId: GameId }>(
        "SELECT match_id AS matchId, game_id AS gameId FROM public_rooms WHERE expires_at <= ?",
        now,
      )
      .toArray();
    if (expired.length) {
      this.ctx.storage.sql.exec("DELETE FROM public_rooms WHERE expires_at <= ?", now);
      const totals = this.totalsByGame();
      for (const socket of this.ctx.getWebSockets("lobby")) {
        const attachment = socket.deserializeAttachment?.() as LobbySocketAttachment | null;
        if (!attachment) continue;
        const removed = expired
          .filter((entry) => attachment.gameId === null || attachment.gameId === entry.gameId)
          .map((entry) => entry.matchId);
        if (!removed.length) continue;
        const totalMatches =
          attachment.gameId === null
            ? Object.values(totals).reduce<number>((sum, count) => sum + (count ?? 0), 0)
            : (totals[attachment.gameId] ?? 0);
        try {
          socket.send(
            JSON.stringify({ type: "lobby-rooms-remove", matchIds: removed, totalMatches }),
          );
        } catch {
          socket.close(1011, "Send failed");
        }
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
      matches = this.ctx.storage.sql
        .exec<LobbyEntry>(
          `
        SELECT match_id AS matchId, game_id AS gameId, rules_version AS rulesVersion, display_name AS displayName,
          series_target AS seriesTarget, created_at AS createdAt, expires_at AS expiresAt
        FROM public_rooms
        WHERE expires_at > ? AND (? IS NULL OR game_id = ?) AND (created_at < ? OR (created_at = ? AND match_id > ?))
        ORDER BY created_at DESC, match_id ASC LIMIT ?
      `,
          now,
          gameId,
          gameId,
          createdAt,
          createdAt,
          matchId,
          limit + 1,
        )
        .toArray();
    } else {
      matches = this.ctx.storage.sql
        .exec<LobbyEntry>(
          `
        SELECT match_id AS matchId, game_id AS gameId, rules_version AS rulesVersion, display_name AS displayName,
          series_target AS seriesTarget, created_at AS createdAt, expires_at AS expiresAt
        FROM public_rooms WHERE expires_at > ? AND (? IS NULL OR game_id = ?)
        ORDER BY created_at DESC, match_id ASC LIMIT ?
      `,
          now,
          gameId,
          gameId,
          limit + 1,
        )
        .toArray();
    }
    const hasMore = matches.length > limit;
    const page = matches.slice(0, limit);
    const last = hasMore ? page.at(-1) : null;
    const nextCursor = last ? `${String(last.createdAt).padStart(13, "0")}.${last.matchId}` : null;
    const totalMatches = gameId
      ? (this.totalsByGame()[gameId] ?? 0)
      : Object.values(this.totalsByGame()).reduce<number>((sum, count) => sum + (count ?? 0), 0);
    return { matches: page, totalMatches, nextCursor, hasMore };
  }

  private sendSnapshot(
    socket: WebSocket,
    gameId: GameId | null,
    cursor: string | null,
    type = "lobby-snapshot",
  ): void {
    const page = this.page(gameId, cursor, LOBBY_PAGE_SIZE);
    try {
      socket.send(JSON.stringify({ type, ...page, serverNow: Date.now() }));
    } catch {
      socket.close(1011, "Send failed");
    }
  }

  private totalsByGame(): Partial<Record<GameId, number>> {
    const rows = this.ctx.storage.sql
      .exec<{ gameId: GameId; total: number }>(
        "SELECT game_id AS gameId, COUNT(*) AS total FROM public_rooms WHERE expires_at > ? GROUP BY game_id",
        Date.now(),
      )
      .toArray();
    return Object.fromEntries(rows.map((row) => [row.gameId, row.total]));
  }

  private broadcastRoom(
    event:
      | { type: "lobby-room-upsert"; match: LobbyEntry }
      | { type: "lobby-room-remove"; matchId: string; gameId: GameId },
  ): void {
    const totals = this.totalsByGame();
    for (const socket of this.ctx.getWebSockets("lobby")) {
      const attachment = socket.deserializeAttachment?.() as LobbySocketAttachment | null;
      if (
        !attachment?.identified ||
        (attachment.gameId &&
          attachment.gameId !==
            (event.type === "lobby-room-upsert" ? event.match.gameId : event.gameId))
      )
        continue;
      const totalMatches = attachment.gameId
        ? (totals[attachment.gameId] ?? 0)
        : Object.values(totals).reduce<number>((sum, count) => sum + (count ?? 0), 0);
      const payload =
        event.type === "lobby-room-upsert"
          ? { ...event, totalMatches }
          : { ...event, totalMatches };
      try {
        socket.send(JSON.stringify(payload));
      } catch {
        socket.close(1011, "Send failed");
      }
    }
  }

  private async schedule(): Promise<void> {
    const expiry = this.ctx.storage.sql
      .exec<{ expiresAt: number | null }>("SELECT MIN(expires_at) AS expiresAt FROM public_rooms")
      .toArray()[0]?.expiresAt;
    await setAlarmIfChanged(this.ctx.storage, expiry ?? null);
  }
}
