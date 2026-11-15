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

export const GAME_ID = "tic-tac-toe" as const;
export const RULES_VERSION = 1 as const;
export const BOARD_SIZE = 3;
export type Cell = PlayerSeat | null;
export type Board = readonly (readonly Cell[])[];
export type PlaceMarkAction = Readonly<{
  type: "place-mark";
  row: number;
  column: number;
}>;
export type TicTacToeMove = Readonly<{ seat: PlayerSeat; row: number; column: number }>;
export type TicTacToeState = Readonly<{
  startingPlayer: PlayerSeat;
  board: Board;
  moves: readonly TicTacToeMove[];
  nextPlayer: PlayerSeat | null;
  outcome: GameOutcome | null;
}>;
export type MoveErrorCode =
  "invalid-player" | "invalid-action" | "wrong-turn" | "occupied" | "match-finished";
export type MoveResult = GameActionResult<TicTacToeState, MoveErrorCode>;

const LINES = Object.freeze([
  Object.freeze([
    [0, 0],
    [0, 1],
    [0, 2],
  ] as const),
  Object.freeze([
    [1, 0],
    [1, 1],
    [1, 2],
  ] as const),
  Object.freeze([
    [2, 0],
    [2, 1],
    [2, 2],
  ] as const),
  Object.freeze([
    [0, 0],
    [1, 0],
    [2, 0],
  ] as const),
  Object.freeze([
    [0, 1],
    [1, 1],
    [2, 1],
  ] as const),
  Object.freeze([
    [0, 2],
    [1, 2],
    [2, 2],
  ] as const),
  Object.freeze([
    [0, 0],
    [1, 1],
    [2, 2],
  ] as const),
  Object.freeze([
    [0, 2],
    [1, 1],
    [2, 0],
  ] as const),
]);

function other(seat: PlayerSeat): PlayerSeat {
  return seat === "first" ? "second" : "first";
}

function freezeBoard(board: Cell[][]): Board {
  return Object.freeze(board.map((row) => Object.freeze(row)));
}

function lineWinner(board: Board): PlayerSeat | null {
  for (const line of LINES) {
    const [first, second, third] = line.map(([row, column]) => board[row]?.[column]);
    if ((first === "first" || first === "second") && first === second && first === third)
      return first;
  }
  return null;
}

function outcomeFor(board: Board): GameOutcome | null {
  const winner = lineWinner(board);
  if (winner) return Object.freeze({ kind: "win", winner });
  return board.every((row) => row.every((cell) => cell !== null))
    ? Object.freeze({ kind: "draw" })
    : null;
}

export function createGame(startingPlayer: PlayerSeat): TicTacToeState {
  if (!isPlayerSeat(startingPlayer)) throw new TypeError("Invalid starting player seat.");
  const board = freezeBoard(
    Array.from({ length: BOARD_SIZE }, () => new Array<Cell>(BOARD_SIZE).fill(null)),
  );
  return Object.freeze({
    startingPlayer,
    board,
    moves: Object.freeze([]),
    nextPlayer: startingPlayer,
    outcome: null,
  });
}

export function parsePlaceMarkAction(input: unknown): ValidationResult<PlaceMarkAction> {
  if (!isExactObject(input, ["type", "row", "column"]) || input.type !== "place-mark")
    return invalid("", "Expected a place-mark action with row and column.");
  if (
    typeof input.row !== "number" ||
    !Number.isInteger(input.row) ||
    input.row < 0 ||
    input.row >= BOARD_SIZE
  )
    return invalid("row", "Expected a board row from 0 to 2.");
  if (
    typeof input.column !== "number" ||
    !Number.isInteger(input.column) ||
    input.column < 0 ||
    input.column >= BOARD_SIZE
  )
    return invalid("column", "Expected a board column from 0 to 2.");
  return {
    ok: true,
    value: Object.freeze({ type: "place-mark", row: input.row, column: input.column }),
  };
}

export function applyAction(
  state: TicTacToeState,
  player: PlayerSeat,
  action: unknown,
): MoveResult {
  if (state.outcome !== null) return { ok: false, error: { code: "match-finished" } };
  if (!isPlayerSeat(player)) return { ok: false, error: { code: "invalid-player" } };
  if (player !== state.nextPlayer) return { ok: false, error: { code: "wrong-turn" } };
  const parsed = parsePlaceMarkAction(action);
  if (!parsed.ok) return { ok: false, error: { code: "invalid-action" } };
  const { row, column } = parsed.value;
  if (state.board[row]?.[column] !== null) return { ok: false, error: { code: "occupied" } };

  const board = state.board.map((cells) => [...cells]);
  board[row]![column] = player;
  const frozenBoard = freezeBoard(board);
  const moves = Object.freeze([...state.moves, Object.freeze({ seat: player, row, column })]);
  const outcome = outcomeFor(frozenBoard);
  return {
    ok: true,
    value: Object.freeze({
      startingPlayer: state.startingPlayer,
      board: frozenBoard,
      moves,
      nextPlayer: outcome ? null : other(player),
      outcome,
    }),
  };
}

export function parseTicTacToeState(input: unknown): ValidationResult<TicTacToeState> {
  if (
    !input ||
    typeof input !== "object" ||
    !isExactObject(input, ["startingPlayer", "board", "moves", "nextPlayer", "outcome"])
  )
    return invalid("", "Expected a Tic-tac-toe state.");
  if (!isPlayerSeat(input.startingPlayer))
    return invalid("startingPlayer", "Expected a valid starting player.");
  if (!Array.isArray(input.board) || input.board.length !== BOARD_SIZE)
    return invalid("board", "Expected a 3 by 3 board.");
  const board: Cell[][] = [];
  for (const row of input.board) {
    if (
      !Array.isArray(row) ||
      row.length !== BOARD_SIZE ||
      !row.every((cell) => cell === null || isPlayerSeat(cell))
    )
      return invalid("board", "Board cells must be empty or belong to a player.");
    board.push([...row] as Cell[]);
  }
  if (!Array.isArray(input.moves) || input.moves.length > BOARD_SIZE * BOARD_SIZE)
    return invalid("moves", "Expected at most 9 moves.");

  let reconstructed = createGame(input.startingPlayer);
  for (let index = 0; index < input.moves.length; index += 1) {
    const move = input.moves[index];
    if (!move || typeof move !== "object" || !isExactObject(move, ["seat", "row", "column"]))
      return invalid(`moves.${index}`, "Expected a move with seat, row, and column.");
    if (!isPlayerSeat(move.seat)) return invalid(`moves.${index}.seat`, "Invalid player seat.");
    const action = parsePlaceMarkAction({ type: "place-mark", row: move.row, column: move.column });
    if (!action.ok) return invalid(`moves.${index}`, "Invalid move coordinates.");
    const applied = applyAction(reconstructed, move.seat, action.value);
    if (!applied.ok) return invalid(`moves.${index}`, "Move sequence is not legal.");
    reconstructed = applied.value;
  }

  const frozenBoard = freezeBoard(board);
  if (JSON.stringify(reconstructed.board) !== JSON.stringify(frozenBoard))
    return invalid("board", "Board does not match its move sequence.");
  const outcome = outcomeFor(frozenBoard);
  if (input.outcome === null) {
    if (outcome !== null) return invalid("outcome", "Missing terminal outcome.");
  } else {
    const parsedOutcome = parseGameOutcome(input.outcome);
    if (
      !parsedOutcome.ok ||
      outcome === null ||
      parsedOutcome.value.kind !== outcome.kind ||
      (parsedOutcome.value.kind === "win" &&
        outcome.kind === "win" &&
        parsedOutcome.value.winner !== outcome.winner)
    )
      return invalid("outcome", "Outcome does not match the board.");
  }
  const nextPlayer = outcome ? null : reconstructed.nextPlayer;
  if (input.nextPlayer !== nextPlayer)
    return invalid("nextPlayer", "Next player does not match the move sequence.");

  return {
    ok: true,
    value: Object.freeze({
      startingPlayer: input.startingPlayer,
      board: frozenBoard,
      moves: reconstructed.moves,
      nextPlayer,
      outcome,
    }),
  };
}

export function parseTicTacToeCommand(
  input: unknown,
): ValidationResult<ActionCommand<PlaceMarkAction>> {
  const parsed = parseActionCommand(input, parsePlaceMarkAction);
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== GAME_ID) return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== RULES_VERSION)
    return invalid("rulesVersion", "Unsupported Tic-tac-toe rules version.");
  return parsed;
}

export function parseTicTacToeStateMessage(
  input: unknown,
): ValidationResult<StateMessage<TicTacToeState>> {
  const parsed = parseStateMessage(input, parseTicTacToeState);
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== GAME_ID) return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== RULES_VERSION)
    return invalid("rulesVersion", "Unsupported Tic-tac-toe rules version.");
  return parsed;
}

export const ticTacToe: TwoPlayerGameModule<
  TicTacToeState,
  PlaceMarkAction,
  MoveErrorCode,
  typeof RULES_VERSION
> = Object.freeze({
  gameId: GAME_ID,
  title: "Tic-tac-toe",
  description: "Get three marks in a row.",
  playerCount: "2-player match",
  rulesVersion: RULES_VERSION,
  supportedRulesVersions: Object.freeze([RULES_VERSION] as const),
  getSessionPolicy: () => Object.freeze({ turnDurationMs: 45_000, reconnectDurationMs: 60_000 }),
  createState: createGame,
  parseAction: parsePlaceMarkAction,
  parseState: parseTicTacToeState,
  applyAction,
  getOutcome: (state) => state.outcome,
  getNextPlayer: (state) => state.nextPlayer,
  getStartingPlayer: (state) => state.startingPlayer,
  getActionCount: (state) => state.moves.length,
  getLastActionPlayer: (state) => state.moves.at(-1)?.seat ?? null,
  getHistorySnapshot: (state) => ({ board: state.board, startingPlayer: state.startingPlayer }),
});

export const ticTacToeRuntime = adaptTwoPlayerGame(ticTacToe);
