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

export const GAME_ID = "reversi" as const;
export const RULES_VERSION = 1 as const;
export const BOARD_SIZE = 8;
export type Cell = PlayerSeat | null;
/** Rows and columns are zero-based, with row zero at the top. */
export type Board = readonly (readonly Cell[])[];
export type PlaceDiscAction = Readonly<{ type: "place-disc"; row: number; column: number }>;
export type ReversiMove = Readonly<{ seat: PlayerSeat; row: number; column: number }>;
export type ReversiState = Readonly<{
  startingPlayer: PlayerSeat;
  board: Board;
  moves: readonly ReversiMove[];
  /** Most recently skipped seat, retained until that seat gets a legal turn. */
  skippedSeat: PlayerSeat | null;
  nextPlayer: PlayerSeat | null;
  outcome: GameOutcome | null;
}>;
export type MoveErrorCode =
  "invalid-action" | "wrong-turn" | "occupied" | "not-legal" | "match-finished";
export type MoveResult = GameActionResult<ReversiState, MoveErrorCode>;

function opponent(seat: PlayerSeat): PlayerSeat {
  return seat === "first" ? "second" : "first";
}
function colorSeat(startingPlayer: PlayerSeat, color: "dark" | "light"): PlayerSeat {
  return color === "dark" ? startingPlayer : opponent(startingPlayer);
}

export function createGame(startingPlayer: PlayerSeat): ReversiState {
  if (!isPlayerSeat(startingPlayer)) throw new TypeError("Invalid starting player seat.");
  const board = Array.from({ length: BOARD_SIZE }, () => new Array<Cell>(BOARD_SIZE).fill(null));
  board[3]![3] = colorSeat(startingPlayer, "light");
  board[3]![4] = colorSeat(startingPlayer, "dark");
  board[4]![3] = colorSeat(startingPlayer, "dark");
  board[4]![4] = colorSeat(startingPlayer, "light");
  return Object.freeze({
    startingPlayer,
    board: Object.freeze(board.map((row) => Object.freeze(row))),
    moves: Object.freeze([]),
    skippedSeat: null,
    nextPlayer: startingPlayer,
    outcome: null,
  });
}

export function parsePlaceDiscAction(input: unknown): ValidationResult<PlaceDiscAction> {
  if (!isExactObject(input, ["type", "row", "column"]) || input.type !== "place-disc")
    return invalid("", "Expected a place-disc action with only type, row, and column.");
  if (
    typeof input.row !== "number" ||
    !Number.isInteger(input.row) ||
    input.row < 0 ||
    input.row >= BOARD_SIZE
  )
    return invalid("row", "Expected a board row from 0 to 7.");
  if (
    typeof input.column !== "number" ||
    !Number.isInteger(input.column) ||
    input.column < 0 ||
    input.column >= BOARD_SIZE
  )
    return invalid("column", "Expected a board column from 0 to 7.");
  return {
    ok: true,
    value: Object.freeze({ type: "place-disc", row: input.row, column: input.column }),
  };
}

const DIRECTIONS = Object.freeze([
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const);

/** Seats are stored in cells; the starter's seat represents dark discs. */
export function discsToFlip(
  board: Board,
  seat: PlayerSeat,
  row: number,
  column: number,
): readonly (readonly [number, number])[] {
  if (
    row < 0 ||
    row >= BOARD_SIZE ||
    column < 0 ||
    column >= BOARD_SIZE ||
    board[row]?.[column] !== null
  )
    return [];
  const other = opponent(seat);
  const flips: (readonly [number, number])[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line: (readonly [number, number])[] = [];
    let r = row + dr;
    let c = column + dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r]?.[c] === other) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }
    if (
      line.length > 0 &&
      r >= 0 &&
      r < BOARD_SIZE &&
      c >= 0 &&
      c < BOARD_SIZE &&
      board[r]?.[c] === seat
    )
      flips.push(...line);
  }
  return flips;
}

export function legalMoves(
  state: Pick<ReversiState, "board" | "startingPlayer">,
  seat: PlayerSeat,
): readonly PlaceDiscAction[] {
  const moves: PlaceDiscAction[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      if (discsToFlip(state.board, seat, row, column).length)
        moves.push(Object.freeze({ type: "place-disc", row, column }));
    }
  }
  return moves;
}

function countDiscs(board: Board): { first: number; second: number } {
  let first = 0;
  let second = 0;
  for (const row of board)
    for (const cell of row) {
      if (cell === "first") first += 1;
      else if (cell === "second") second += 1;
    }
  return { first, second };
}

function finalOutcome(board: Board): GameOutcome {
  const count = countDiscs(board);
  return count.first === count.second
    ? Object.freeze({ kind: "draw" })
    : Object.freeze({ kind: "win", winner: count.first > count.second ? "first" : "second" });
}

function nextAfterMove(
  board: Board,
  starter: PlayerSeat,
  player: PlayerSeat,
): { nextPlayer: PlayerSeat | null; skippedSeat: PlayerSeat | null; outcome: GameOutcome | null } {
  if (board.every((row) => row.every((cell) => cell !== null)))
    return { nextPlayer: null, skippedSeat: null, outcome: finalOutcome(board) };
  const other = opponent(player);
  const candidate = { board, startingPlayer: starter };
  if (legalMoves(candidate, other).length)
    return { nextPlayer: other, skippedSeat: null, outcome: null };
  if (legalMoves(candidate, player).length)
    return { nextPlayer: player, skippedSeat: other, outcome: null };
  return { nextPlayer: null, skippedSeat: null, outcome: finalOutcome(board) };
}

export function applyAction(state: ReversiState, player: PlayerSeat, action: unknown): MoveResult {
  if (state.outcome !== null) return { ok: false, error: { code: "match-finished" } };
  if (!isPlayerSeat(player) || player !== state.nextPlayer)
    return { ok: false, error: { code: "wrong-turn" } };
  const parsed = parsePlaceDiscAction(action);
  if (!parsed.ok) return { ok: false, error: { code: "invalid-action" } };
  const { row, column } = parsed.value;
  const flips = discsToFlip(state.board, player, row, column);
  if (state.board[row]?.[column] !== null) return { ok: false, error: { code: "occupied" } };
  if (flips.length === 0) return { ok: false, error: { code: "not-legal" } };
  const board = state.board.map((cells) => [...cells]);
  board[row]![column] = player;
  for (const [flipRow, flipColumn] of flips) board[flipRow]![flipColumn] = player;
  const frozenBoard = Object.freeze(board.map((cells) => Object.freeze(cells)));
  const next = nextAfterMove(frozenBoard, state.startingPlayer, player);
  const move = Object.freeze({ seat: player, row, column });
  return {
    ok: true,
    value: Object.freeze({
      startingPlayer: state.startingPlayer,
      board: frozenBoard,
      moves: Object.freeze([...state.moves, move]),
      skippedSeat: next.outcome
        ? null
        : (next.skippedSeat ?? (state.skippedSeat === player ? null : state.skippedSeat)),
      nextPlayer: next.nextPlayer,
      outcome: next.outcome,
    }),
  };
}

/** Replay at most 60 placements to validate reachability and forced passes. */
export function parseReversiState(input: unknown): ValidationResult<ReversiState> {
  if (
    !isExactObject(input, [
      "startingPlayer",
      "board",
      "moves",
      "skippedSeat",
      "nextPlayer",
      "outcome",
    ])
  )
    return invalid("", "Invalid Reversi state fields.");
  if (!isPlayerSeat(input.startingPlayer))
    return invalid("startingPlayer", "Invalid starting player seat.");
  if (input.skippedSeat !== null && !isPlayerSeat(input.skippedSeat))
    return invalid("skippedSeat", "Invalid skipped player seat.");
  if (!Array.isArray(input.moves) || input.moves.length > 60)
    return invalid("moves", "Expected at most 60 placements.");
  if (
    !Array.isArray(input.board) ||
    input.board.length !== BOARD_SIZE ||
    input.board.some((row: unknown) => !Array.isArray(row) || row.length !== BOARD_SIZE)
  )
    return invalid("board", "Expected an 8-row, 8-column board.");
  let state = createGame(input.startingPlayer);
  for (let index = 0; index < input.moves.length; index += 1) {
    const move = input.moves[index];
    if (!isExactObject(move, ["seat", "row", "column"]) || !isPlayerSeat(move.seat))
      return invalid(`moves.${index}`, "Invalid move record.");
    if (state.nextPlayer === null || state.outcome !== null)
      return invalid(`moves.${index}`, "Move follows a finished game.");
    const result = applyAction(state, state.nextPlayer, {
      type: "place-disc",
      row: move.row,
      column: move.column,
    });
    if (!result.ok || result.value.moves.at(-1)?.seat !== move.seat)
      return invalid(`moves.${index}`, "Illegal Reversi move history.");
    state = result.value;
  }
  for (let row = 0; row < BOARD_SIZE; row += 1)
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      if (
        !Array.isArray(input.board[row]) ||
        input.board[row]?.[column] !== state.board[row]?.[column]
      )
        return invalid(`board.${row}.${column}`, "Board differs from legal move history.");
    }
  if (input.skippedSeat !== state.skippedSeat)
    return invalid("skippedSeat", "Skipped player differs from legal move history.");
  if (input.nextPlayer !== state.nextPlayer)
    return invalid("nextPlayer", "Next player differs from legal move history.");
  if (input.outcome === null) {
    if (state.outcome !== null) return invalid("outcome", "Missing terminal outcome.");
  } else {
    const parsed = parseGameOutcome(input.outcome);
    if (
      !parsed.ok ||
      state.outcome === null ||
      parsed.value.kind !== state.outcome.kind ||
      (parsed.value.kind === "win" &&
        state.outcome.kind === "win" &&
        parsed.value.winner !== state.outcome.winner)
    )
      return invalid("outcome", "Outcome differs from legal move history.");
  }
  return { ok: true, value: state };
}

export function parseReversiCommand(
  input: unknown,
): ValidationResult<ActionCommand<PlaceDiscAction>> {
  const parsed = parseActionCommand(input, parsePlaceDiscAction);
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== GAME_ID) return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== RULES_VERSION)
    return invalid("rulesVersion", "Unsupported Reversi rules version.");
  return parsed;
}

export function parseReversiStateMessage(
  input: unknown,
): ValidationResult<StateMessage<ReversiState>> {
  const parsed = parseStateMessage(input, parseReversiState);
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== GAME_ID) return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== RULES_VERSION)
    return invalid("rulesVersion", "Unsupported Reversi rules version.");
  return parsed;
}

export const reversi: TwoPlayerGameModule<
  ReversiState,
  PlaceDiscAction,
  MoveErrorCode,
  typeof RULES_VERSION
> = Object.freeze({
  gameId: GAME_ID,
  title: "Reversi",
  description: "Flip more discs to win.",
  playerCount: "2-player match",
  rulesVersion: RULES_VERSION,
  supportedRulesVersions: Object.freeze([RULES_VERSION] as const),
  getSessionPolicy: () => Object.freeze({ turnDurationMs: 45_000, reconnectDurationMs: 60_000 }),
  createState: createGame,
  parseAction: parsePlaceDiscAction,
  parseState: parseReversiState,
  applyAction,
  getOutcome: (state) => state.outcome,
  getNextPlayer: (state) => state.nextPlayer,
  getStartingPlayer: (state) => state.startingPlayer,
  getActionCount: (state) => state.moves.length,
  getLastActionPlayer: (state) => state.moves.at(-1)?.seat ?? null,
  getHistorySnapshot: (state) => ({
    board: state.board,
    startingPlayer: state.startingPlayer,
  }),
});

export const reversiRuntime = adaptTwoPlayerGame(reversi);
