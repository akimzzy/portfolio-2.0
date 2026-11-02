import {
  adaptTwoPlayerGame,
  invalid,
  isExactObject,
  isPlayerSeat,
  parseActionCommand,
  parseGameOutcome,
  parseStateMessage,
} from "@portfolio-games/contracts";
import type {
  ActionCommand,
  GameActionResult,
  GameOutcome,
  PlayerSeat,
  StateMessage,
  TwoPlayerGameModule,
  ValidationResult,
} from "@portfolio-games/contracts";

export const GAME_ID = "connect-four" as const;
export const RULES_VERSION = 2 as const;
export type ConnectFourRulesVersion = 1 | typeof RULES_VERSION;
export const COLUMNS = 7;
export const ROWS = 6;
export type Cell = PlayerSeat | null;
/** Row zero is the top of the board; column zero is the left edge. */
export type Board = readonly (readonly Cell[])[];
export type DropTokenAction = Readonly<{ type: "drop-token"; column: number }>;
export type ConnectFourState = Readonly<{
  startingPlayer: PlayerSeat;
  board: Board;
  moves: readonly number[];
  nextPlayer: PlayerSeat | null;
  outcome: GameOutcome | null;
}>;
export type MoveErrorCode =
  | "invalid-player"
  | "invalid-action"
  | "wrong-turn"
  | "column-full"
  | "match-finished";
export type MoveResult = GameActionResult<ConnectFourState, MoveErrorCode>;

function opponent(player: PlayerSeat): PlayerSeat {
  return player === "first" ? "second" : "first";
}

export function createGame(startingPlayer: PlayerSeat): ConnectFourState {
  if (!isPlayerSeat(startingPlayer))
    throw new TypeError("Invalid starting player seat.");
  const board = Object.freeze(
    Array.from({ length: ROWS }, () =>
      Object.freeze(new Array<Cell>(COLUMNS).fill(null)),
    ),
  );
  return Object.freeze({
    startingPlayer,
    board,
    moves: Object.freeze([]),
    nextPlayer: startingPlayer,
    outcome: null,
  });
}

export function parseDropTokenAction(
  input: unknown,
): ValidationResult<DropTokenAction> {
  if (
    !isExactObject(input, ["type", "column"]) ||
    input.type !== "drop-token"
  ) {
    return invalid(
      "",
      "Expected a drop-token action with only type and column.",
    );
  }
  if (
    typeof input.column !== "number" ||
    !Number.isInteger(input.column) ||
    input.column < 0 ||
    input.column >= COLUMNS
  ) {
    return invalid("column", "Expected an integer column from 0 to 6.");
  }
  return {
    ok: true,
    value: Object.freeze({ type: "drop-token", column: input.column }),
  };
}

function connectedFour(
  board: Board,
  row: number,
  column: number,
  player: PlayerSeat,
): boolean {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;
  for (const [dr, dc] of directions) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = column + dc * sign;
      while (
        r >= 0 &&
        r < ROWS &&
        c >= 0 &&
        c < COLUMNS &&
        board[r]?.[c] === player
      ) {
        count++;
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

/**
 * True while at least one four-cell line has not been blocked by both seats.
 * Moves only add tokens, so a line containing both seats can never reopen.
 */
export function hasPossibleConnectFour(board: Board): boolean {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      for (const [dr, dc] of directions) {
        const endRow = row + dr * 3;
        const endColumn = column + dc * 3;
        if (endRow < 0 || endRow >= ROWS || endColumn < 0 || endColumn >= COLUMNS) continue;
        let hasFirst = false;
        let hasSecond = false;
        for (let offset = 0; offset < 4; offset++) {
          const cell = board[row + dr * offset]?.[column + dc * offset];
          hasFirst ||= cell === "first";
          hasSecond ||= cell === "second";
        }
        if (!(hasFirst && hasSecond)) return true;
      }
    }
  }
  return false;
}

/** State must originate from createGame, this function, or parseConnectFourState. */
export function applyAction(
  state: ConnectFourState,
  player: PlayerSeat,
  action: unknown,
  rulesVersion: ConnectFourRulesVersion = RULES_VERSION,
): MoveResult {
  if (state.outcome !== null)
    return { ok: false, error: { code: "match-finished" } };
  if (!isPlayerSeat(player))
    return { ok: false, error: { code: "invalid-player" } };
  if (player !== state.nextPlayer)
    return { ok: false, error: { code: "wrong-turn" } };
  const parsed = parseDropTokenAction(action);
  if (!parsed.ok) return { ok: false, error: { code: "invalid-action" } };
  const { column } = parsed.value;
  let row = ROWS - 1;
  while (row >= 0 && state.board[row]?.[column] !== null) row--;
  if (row < 0) return { ok: false, error: { code: "column-full" } };

  const board = [...state.board];
  const cells = [...(board[row] ?? [])];
  cells[column] = player;
  board[row] = Object.freeze(cells);
  const moves = Object.freeze([...state.moves, column]);
  const outcome: GameOutcome | null = connectedFour(board, row, column, player)
    ? Object.freeze({ kind: "win", winner: player })
    : (rulesVersion >= 2 && !hasPossibleConnectFour(board)) || moves.length === ROWS * COLUMNS
      ? Object.freeze({ kind: "draw" })
      : null;
  return {
    ok: true,
    value: Object.freeze({
      startingPlayer: state.startingPlayer,
      board: Object.freeze(board),
      moves,
      outcome,
      nextPlayer: outcome === null ? opponent(player) : null,
    }),
  };
}

/**
 * Bounded replay (at most 42 moves) validates gravity, turns and terminal state.
 * This checks reachability, not provenance: the service still owns match results.
 */
export function parseConnectFourState(
  input: unknown,
  rulesVersion: ConnectFourRulesVersion = RULES_VERSION,
): ValidationResult<ConnectFourState> {
  if (
    !isExactObject(input, [
      "startingPlayer",
      "board",
      "moves",
      "nextPlayer",
      "outcome",
    ])
  ) {
    return invalid("", "Invalid Connect Four state fields.");
  }
  if (!isPlayerSeat(input.startingPlayer))
    return invalid("startingPlayer", "Invalid starting player seat.");
  if (!Array.isArray(input.moves) || input.moves.length > ROWS * COLUMNS)
    return invalid("moves", "Expected at most 42 moves.");
  if (
    !Array.isArray(input.board) ||
    input.board.length !== ROWS ||
    input.board.some(
      (row: unknown) => !Array.isArray(row) || row.length !== COLUMNS,
    )
  ) {
    return invalid("board", "Expected a 6-row, 7-column board.");
  }
  let state = createGame(input.startingPlayer);
  for (let i = 0; i < input.moves.length; i++) {
    if (state.nextPlayer === null)
      return invalid(`moves.${i}`, "Move follows a finished game.");
    const result = applyAction(state, state.nextPlayer, {
      type: "drop-token",
      column: input.moves[i],
    }, rulesVersion);
    if (!result.ok) return invalid(`moves.${i}`, "Illegal move history.");
    state = result.value;
  }
  for (let row = 0; row < ROWS; row++) {
    const cells: unknown = input.board[row];
    if (!Array.isArray(cells)) return invalid("board", "Invalid board row.");
    for (let column = 0; column < COLUMNS; column++) {
      if (cells[column] !== state.board[row]?.[column])
        return invalid(
          `board.${row}.${column}`,
          "Board differs from legal move history.",
        );
    }
  }
  if (input.nextPlayer !== state.nextPlayer)
    return invalid(
      "nextPlayer",
      "Next player differs from legal move history.",
    );
  if (input.outcome === null) {
    if (state.outcome !== null)
      return invalid("outcome", "Missing terminal outcome.");
  } else {
    const parsed = parseGameOutcome(input.outcome);
    if (
      !parsed.ok ||
      state.outcome === null ||
      parsed.value.kind !== state.outcome.kind ||
      (parsed.value.kind === "win" &&
        state.outcome.kind === "win" &&
        parsed.value.winner !== state.outcome.winner)
    ) {
      return invalid("outcome", "Outcome differs from legal move history.");
    }
  }
  return { ok: true, value: state };
}

export function parseConnectFourCommand(
  input: unknown,
  rulesVersion: ConnectFourRulesVersion = RULES_VERSION,
): ValidationResult<ActionCommand<DropTokenAction>> {
  const parsed = parseActionCommand(input, parseDropTokenAction);
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== GAME_ID)
    return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== rulesVersion)
    return invalid("rulesVersion", "Unsupported Connect Four rules version.");
  return parsed;
}

export function parseConnectFourStateMessage(
  input: unknown,
  rulesVersion: ConnectFourRulesVersion = RULES_VERSION,
): ValidationResult<StateMessage<ConnectFourState>> {
  const parsed = parseStateMessage(input, (state) => parseConnectFourState(state, rulesVersion));
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== GAME_ID)
    return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== rulesVersion)
    return invalid("rulesVersion", "Unsupported Connect Four rules version.");
  return parsed;
}

export const connectFour: TwoPlayerGameModule<
  ConnectFourState,
  DropTokenAction,
  MoveErrorCode,
  ConnectFourRulesVersion
> = Object.freeze({
  gameId: GAME_ID,
  title: "Connect Four",
  description: "Drop four tokens in a row to win.",
  playerCount: "2-player match",
  rulesVersion: RULES_VERSION,
  supportedRulesVersions: Object.freeze([1, RULES_VERSION] as const),
  getSessionPolicy: (_rulesVersion: ConnectFourRulesVersion) => Object.freeze({ turnDurationMs: 45_000, reconnectDurationMs: 60_000 }),
  createState: createGame,
  parseAction: parseDropTokenAction,
  parseState: parseConnectFourState,
  applyAction,
  getOutcome: (state: ConnectFourState) => state.outcome,
  getNextPlayer: (state: ConnectFourState) => state.nextPlayer,
  getStartingPlayer: (state: ConnectFourState) => state.startingPlayer,
  getActionCount: (state: ConnectFourState) => state.moves.length,
});

/** Type-erased adapter shared by the Worker and web platform registries. */
export const connectFourRuntime = adaptTwoPlayerGame(connectFour);
