export const PROTOCOL_VERSION = 1 as const;

/** Seats identify a position in a match, never an account or a token color. */
export type PlayerSeat = "first" | "second";
export const MATCH_REACTIONS = Object.freeze([
  Object.freeze({ id: "clap", symbol: "👏", label: "Nice move" }),
  Object.freeze({ id: "wow", symbol: "😮", label: "Wow" }),
  Object.freeze({ id: "laugh", symbol: "😂", label: "That was funny" }),
  Object.freeze({ id: "fire", symbol: "🔥", label: "On fire" }),
  Object.freeze({ id: "gg", symbol: "GG", label: "Good game" }),
  Object.freeze({ id: "heart", symbol: "❤️", label: "Love it" }),
  Object.freeze({ id: "think", symbol: "🤔", label: "Thinking" }),
  Object.freeze({ id: "celebrate", symbol: "🎉", label: "Celebrate" }),
] as const);
export type MatchReactionId = typeof MATCH_REACTIONS[number]["id"];
export const MAX_QUICK_MESSAGE_CHARS = 100;
export const QUICK_MESSAGE_HISTORY_LIMIT = 6;

/** Normalize untrusted, single-line in-match text for both client and service. */
export function normalizeQuickMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!message || Array.from(message).length > MAX_QUICK_MESSAGE_CHARS) return null;
  return message;
}

export function isMatchReactionId(value: unknown): value is MatchReactionId {
  return typeof value === "string" && MATCH_REACTIONS.some((reaction) => reaction.id === value);
}
export type GameOutcome =
  | Readonly<{ kind: "win"; winner: PlayerSeat }>
  | Readonly<{ kind: "draw" }>;

export type ValidationIssue = Readonly<{ path: string; message: string }>;
export type ValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>;
export type Parser<T> = (input: unknown) => ValidationResult<T>;

export type GameIdentity = Readonly<{ gameId: string; rulesVersion: number }>;
export type GameSessionPolicy = Readonly<{ turnDurationMs: number; reconnectDurationMs: number }>;
export type GameActionResult<TState, TCode extends string> =
  | Readonly<{ ok: true; value: TState }>
  | Readonly<{ ok: false; error: Readonly<{ code: TCode }> }>;

/** Small contract for the initial two-player, alternating-turn games. */
export type TwoPlayerGameModule<
  TState,
  TAction,
  TCode extends string,
  TRulesVersion extends number = number,
> = Readonly<{
  gameId: string;
  title: string;
  description: string;
  playerCount: string;
  rulesVersion: TRulesVersion;
  supportedRulesVersions: readonly TRulesVersion[];
  getSessionPolicy: (rulesVersion: TRulesVersion) => GameSessionPolicy;
  createState: (startingPlayer: PlayerSeat, rulesVersion: TRulesVersion) => TState;
  parseAction: (input: unknown, rulesVersion: TRulesVersion) => ValidationResult<TAction>;
  parseState: (input: unknown, rulesVersion: TRulesVersion) => ValidationResult<TState>;
  applyAction: (state: TState, player: PlayerSeat, action: TAction, rulesVersion: TRulesVersion) => GameActionResult<TState, TCode>;
  getOutcome: (state: TState) => GameOutcome | null;
  getNextPlayer: (state: TState) => PlayerSeat | null;
  getStartingPlayer: (state: TState) => PlayerSeat;
  getActionCount: (state: TState) => number;
}>;

/** A type-erased game module used only after data crosses a runtime boundary. */
export type RuntimeTwoPlayerGame = Readonly<{
  gameId: string;
  title: string;
  description: string;
  playerCount: string;
  rulesVersion: number;
  supportedRulesVersions: readonly number[];
  getSessionPolicy(rulesVersion: number): GameSessionPolicy;
  supportsRulesVersion(rulesVersion: number): boolean;
  createState(startingPlayer: PlayerSeat, rulesVersion: number): unknown;
  parseAction(input: unknown, rulesVersion: number): ValidationResult<unknown>;
  inspectState(input: unknown, rulesVersion: number): ValidationResult<RuntimeGameStateInfo>;
  applyAction(state: unknown, player: PlayerSeat, action: unknown, rulesVersion: number): GameActionResult<unknown, string>;
}>;

export type RuntimeGameStateInfo = Readonly<{
  state: unknown;
  outcome: GameOutcome | null;
  nextPlayer: PlayerSeat | null;
  startingPlayer: PlayerSeat;
  actionCount: number;
}>;

/** Keep generic game state typed inside its module; validate unknown inputs at the platform boundary. */
export function adaptTwoPlayerGame<
  TState,
  TAction,
  TCode extends string,
  TRulesVersion extends number,
>(module: TwoPlayerGameModule<TState, TAction, TCode, TRulesVersion>): RuntimeTwoPlayerGame {
  const supportsRulesVersion = (rulesVersion: number): rulesVersion is TRulesVersion =>
    module.supportedRulesVersions.includes(rulesVersion as TRulesVersion);

  const parseState = (input: unknown, rulesVersion: number): ValidationResult<TState> =>
    supportsRulesVersion(rulesVersion)
      ? module.parseState(input, rulesVersion)
      : invalid("rulesVersion", "Unsupported game rules version.");
  const parseAction = (input: unknown, rulesVersion: number): ValidationResult<TAction> =>
    supportsRulesVersion(rulesVersion)
      ? module.parseAction(input, rulesVersion)
      : invalid("rulesVersion", "Unsupported game rules version.");

  return Object.freeze({
    gameId: module.gameId,
    title: module.title,
    description: module.description,
    playerCount: module.playerCount,
    rulesVersion: module.rulesVersion,
    supportedRulesVersions: Object.freeze([...module.supportedRulesVersions]),
    getSessionPolicy(rulesVersion: number): GameSessionPolicy {
      if (!supportsRulesVersion(rulesVersion)) throw new RangeError("Unsupported game rules version.");
      const policy = module.getSessionPolicy(rulesVersion);
      if (!Number.isSafeInteger(policy.turnDurationMs) || policy.turnDurationMs < 1 ||
        !Number.isSafeInteger(policy.reconnectDurationMs) || policy.reconnectDurationMs < 0) {
        throw new RangeError(`Invalid session policy for ${module.gameId} rules version ${rulesVersion}.`);
      }
      return Object.freeze({ ...policy });
    },
    supportsRulesVersion,
    createState(startingPlayer: PlayerSeat, rulesVersion: number): unknown {
      if (!supportsRulesVersion(rulesVersion)) throw new RangeError("Unsupported game rules version.");
      return module.createState(startingPlayer, rulesVersion);
    },
    parseAction,
    inspectState(input: unknown, rulesVersion: number): ValidationResult<RuntimeGameStateInfo> {
      const parsed = parseState(input, rulesVersion);
      if (!parsed.ok) return parsed;
      return { ok: true, value: Object.freeze({
        state: parsed.value,
        outcome: module.getOutcome(parsed.value),
        nextPlayer: module.getNextPlayer(parsed.value),
        startingPlayer: module.getStartingPlayer(parsed.value),
        actionCount: module.getActionCount(parsed.value),
      }) };
    },
    applyAction(state: unknown, player: PlayerSeat, action: unknown, rulesVersion: number): GameActionResult<unknown, string> {
      const parsedState = parseState(state, rulesVersion);
      if (!parsedState.ok) return { ok: false, error: { code: "invalid-state" } };
      const parsedAction = parseAction(action, rulesVersion);
      if (!parsedAction.ok) return { ok: false, error: { code: "invalid-action" } };
      const result = module.applyAction(parsedState.value, player, parsedAction.value, rulesVersion as TRulesVersion);
      return result.ok ? { ok: true, value: result.value } : result;
    },
  });
}

/** A static registry keeps supported games explicit in each runtime bundle. */
export function createGameRegistry(games: readonly RuntimeTwoPlayerGame[]) {
  const byId = new Map<string, RuntimeTwoPlayerGame>();
  for (const game of games) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(game.gameId)) throw new TypeError(`Invalid game id: ${game.gameId}`);
    if (byId.has(game.gameId)) throw new TypeError(`Duplicate game id: ${game.gameId}`);
    if (!game.title.trim() || !game.description.trim() || !game.playerCount.trim()) throw new TypeError(`Missing game catalog metadata: ${game.gameId}`);
    if (game.supportedRulesVersions.length === 0 || game.supportedRulesVersions.some((version) => !Number.isSafeInteger(version) || version < 1) ||
      new Set(game.supportedRulesVersions).size !== game.supportedRulesVersions.length) throw new TypeError(`Invalid supported rules versions for ${game.gameId}.`);
    if (!game.supportsRulesVersion(game.rulesVersion)) throw new TypeError(`Current rules version is not registered for ${game.gameId}.`);
    for (const version of game.supportedRulesVersions) game.getSessionPolicy(version);
    byId.set(game.gameId, game);
  }
  const entries = Object.freeze([...byId.values()]);
  return Object.freeze({
    entries,
    get(gameId: string, rulesVersion?: number): RuntimeTwoPlayerGame | null {
      const game = byId.get(gameId);
      if (!game || (rulesVersion !== undefined && !game.supportsRulesVersion(rulesVersion))) return null;
      return game;
    },
  });
}
type Envelope = GameIdentity & Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  matchId: string;
}>;

/** Identity/seat is established by the service session, not supplied here. */
export type ActionCommand<TAction> = Envelope & Readonly<{
  type: "submit-action";
  actionId: string;
  expectedRevision: number;
  action: TAction;
}>;

export type StateMessage<TState> = Envelope & Readonly<{
  type: "match-state";
  revision: number;
  state: TState;
}>;

export const ACTION_ERROR_CODES = [
  "invalid-action", "wrong-turn", "match-finished", "stale-revision", "forbidden",
] as const;
export type ActionErrorCode = typeof ACTION_ERROR_CODES[number];
export type ActionRejection = Envelope & Readonly<{
  type: "action-rejected";
  actionId: string;
  code: ActionErrorCode;
}>;

export function invalid(path: string, message: string): ValidationResult<never> {
  return { ok: false, issues: [{ path, message }] };
}

export function isPlayerSeat(value: unknown): value is PlayerSeat {
  return value === "first" || value === "second";
}

/** JSON objects only. Reject extra fields instead of silently trusting them. */
export function isExactObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parseGameOutcome(input: unknown): ValidationResult<GameOutcome> {
  if (isExactObject(input, ["kind"]) && input.kind === "draw") {
    return { ok: true, value: Object.freeze({ kind: "draw" }) };
  }
  if (isExactObject(input, ["kind", "winner"]) && input.kind === "win" && isPlayerSeat(input.winner)) {
    return { ok: true, value: Object.freeze({ kind: "win", winner: input.winner }) };
  }
  return invalid("outcome", "Expected a win with a valid winner, or a draw.");
}

function identifier(input: unknown): input is string {
  return typeof input === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input);
}

function revision(input: unknown): input is number {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= 0;
}

function envelope(input: Record<string, unknown>, type: string): ValidationResult<Envelope> {
  if (input.protocolVersion !== PROTOCOL_VERSION) return invalid("protocolVersion", "Unsupported protocol version.");
  if (input.type !== type) return invalid("type", `Expected ${type}.`);
  if (!identifier(input.matchId)) return invalid("matchId", "Expected a bounded match identifier.");
  if (typeof input.gameId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(input.gameId)) {
    return invalid("gameId", "Expected a bounded game identifier.");
  }
  if (!revision(input.rulesVersion) || input.rulesVersion < 1) return invalid("rulesVersion", "Expected a positive rules version.");
  return { ok: true, value: {
    protocolVersion: PROTOCOL_VERSION, matchId: input.matchId,
    gameId: input.gameId, rulesVersion: input.rulesVersion,
  } };
}

function nested<T>(result: ValidationResult<T>, prefix: string): ValidationResult<T> {
  if (result.ok) return result;
  return { ok: false, issues: result.issues.map((issue) => ({
    path: issue.path ? `${prefix}.${issue.path}` : prefix, message: issue.message,
  })) };
}

const COMMON_KEYS = ["protocolVersion", "type", "matchId", "gameId", "rulesVersion"] as const;

export function parseActionCommand<T>(input: unknown, parseAction: Parser<T>): ValidationResult<ActionCommand<T>> {
  if (!isExactObject(input, [...COMMON_KEYS, "actionId", "expectedRevision", "action"])) return invalid("", "Invalid action envelope fields.");
  const base = envelope(input, "submit-action");
  if (!base.ok) return base;
  if (!identifier(input.actionId)) return invalid("actionId", "Expected a bounded action identifier.");
  if (!revision(input.expectedRevision)) return invalid("expectedRevision", "Expected a nonnegative safe integer.");
  const action = nested(parseAction(input.action), "action");
  if (!action.ok) return action;
  return { ok: true, value: Object.freeze({ ...base.value, type: "submit-action",
    actionId: input.actionId, expectedRevision: input.expectedRevision, action: action.value,
  }) };
}

export function parseStateMessage<T>(input: unknown, parseState: Parser<T>): ValidationResult<StateMessage<T>> {
  if (!isExactObject(input, [...COMMON_KEYS, "revision", "state"])) return invalid("", "Invalid state envelope fields.");
  const base = envelope(input, "match-state");
  if (!base.ok) return base;
  if (!revision(input.revision)) return invalid("revision", "Expected a nonnegative safe integer.");
  const state = nested(parseState(input.state), "state");
  if (!state.ok) return state;
  return { ok: true, value: Object.freeze({ ...base.value, type: "match-state",
    revision: input.revision, state: state.value,
  }) };
}

export function parseActionRejection(input: unknown): ValidationResult<ActionRejection> {
  if (!isExactObject(input, [...COMMON_KEYS, "actionId", "code"])) return invalid("", "Invalid rejection envelope fields.");
  const base = envelope(input, "action-rejected");
  if (!base.ok) return base;
  if (!identifier(input.actionId)) return invalid("actionId", "Expected a bounded action identifier.");
  const code = ACTION_ERROR_CODES.find((candidate) => candidate === input.code);
  if (!code) return invalid("code", "Unknown action error code.");
  return { ok: true, value: Object.freeze({ ...base.value, type: "action-rejected",
    actionId: input.actionId, code,
  }) };
}
