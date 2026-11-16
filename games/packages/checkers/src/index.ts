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

export const GAME_ID = "checkers" as const;
export const ENGLISH_RULES_VERSION = 1 as const;
export const INTERNATIONAL_RULES_VERSION = 2 as const;
export const RULES_VERSION = INTERNATIONAL_RULES_VERSION;
export const BOARD_SIZE = 10;
export const MIN_BOARD_SIZE = 8;
export const MAX_MOVES = 10_000;
export const MAX_QUIET_PLIES = 80;
export const INTERNATIONAL_KING_DRAW_PLIES = 50;
export const CHECKERS_VARIANTS = Object.freeze([
  Object.freeze({
    rulesVersion: INTERNATIONAL_RULES_VERSION,
    id: "international",
    name: "International draughts",
    summary: "10×10 · flying kings · maximum captures",
    boardSize: 10,
  }),
  Object.freeze({
    rulesVersion: ENGLISH_RULES_VERSION,
    id: "english-american",
    name: "English / American",
    summary: "8×8 · short kings · choose any capture",
    boardSize: 8,
  }),
] as const);
export type CheckersVariant = (typeof CHECKERS_VARIANTS)[number];
export type Position = Readonly<{ row: number; column: number }>;
export type Piece = Readonly<{ seat: PlayerSeat; king: boolean }>;
export type Cell = Piece | null;
export type Board = readonly (readonly Cell[])[];
export type MovePieceAction = Readonly<{
  type: "move-piece";
  from: Position;
  path: readonly Position[];
}>;
export type CheckersMove = Readonly<{
  seat: PlayerSeat;
  from: Position;
  path: readonly Position[];
  captured: readonly Position[];
  promoted: boolean;
}>;
export type CheckersState = Readonly<{
  startingPlayer: PlayerSeat;
  board: Board;
  moves: readonly CheckersMove[];
  nextPlayer: PlayerSeat | null;
  outcome: GameOutcome | null;
  quietProgressPlies: number;
  positionHistory: readonly string[];
  /** International Draughts endgame timer; absent from legacy English state. */
  materialDrawLimit?: 5 | 16 | null;
  materialDrawPlies?: number;
}>;
export type CheckersRulesVersion = 1 | 2;
export type MoveErrorCode =
  | "invalid-player"
  | "invalid-action"
  | "wrong-turn"
  | "illegal-move"
  | "must-capture"
  | "match-finished";
export type MoveResult = GameActionResult<CheckersState, MoveErrorCode>;
export type LegalMove = Readonly<{
  from: Position;
  path: readonly Position[];
  captured: readonly Position[];
}>;

const DIAGONALS = Object.freeze([
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const);

function other(seat: PlayerSeat): PlayerSeat {
  return seat === "first" ? "second" : "first";
}

function rulesVersionForBoard(board: Board): CheckersRulesVersion | null {
  if (board.length === 8) return ENGLISH_RULES_VERSION;
  if (board.length === BOARD_SIZE) return INTERNATIONAL_RULES_VERSION;
  return null;
}

function inside({ row, column }: Position, boardSize = BOARD_SIZE): boolean {
  return row >= 0 && row < boardSize && column >= 0 && column < boardSize;
}

function samePosition(left: Position, right: Position): boolean {
  return left.row === right.row && left.column === right.column;
}

function directionFor(seat: PlayerSeat, startingPlayer: PlayerSeat): -1 | 1 {
  return seat === startingPlayer ? -1 : 1;
}

function isKingRow(
  row: number,
  seat: PlayerSeat,
  startingPlayer: PlayerSeat,
  boardSize: number,
): boolean {
  return row === (seat === startingPlayer ? 0 : boardSize - 1);
}

function freezeBoard(board: Cell[][]): Board {
  return Object.freeze(board.map((row) => Object.freeze(row)));
}

function copyPosition(position: Position): Position {
  return Object.freeze({ row: position.row, column: position.column });
}

function freezeMove(move: CheckersMove): CheckersMove {
  return Object.freeze({
    seat: move.seat,
    from: copyPosition(move.from),
    path: Object.freeze(move.path.map(copyPosition)),
    captured: Object.freeze(move.captured.map(copyPosition)),
    promoted: move.promoted,
  });
}

function createBoard(startingPlayer: PlayerSeat, rulesVersion: CheckersRulesVersion): Board {
  const boardSize = rulesVersion === INTERNATIONAL_RULES_VERSION ? BOARD_SIZE : MIN_BOARD_SIZE;
  const rowsPerPlayer = rulesVersion === INTERNATIONAL_RULES_VERSION ? 4 : 3;
  const board: Cell[][] = Array.from({ length: boardSize }, () =>
    new Array<Cell>(boardSize).fill(null),
  );
  for (let row = 0; row < boardSize; row += 1) {
    for (let column = 0; column < boardSize; column += 1) {
      if ((row + column) % 2 !== 1) continue;
      if (row < rowsPerPlayer)
        board[row]![column] = Object.freeze({ seat: other(startingPlayer), king: false });
      else if (row >= boardSize - rowsPerPlayer)
        board[row]![column] = Object.freeze({ seat: startingPlayer, king: false });
    }
  }
  return freezeBoard(board);
}

function positionKey(board: Board, nextPlayer: PlayerSeat): string {
  let encoded = nextPlayer === "first" ? "1" : "2";
  for (let rowIndex = 0; rowIndex < board.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < board.length; columnIndex += 1) {
      if ((rowIndex + columnIndex) % 2 !== 1) continue;
      const piece = board[rowIndex]?.[columnIndex] ?? null;
      encoded +=
        piece === null
          ? "0"
          : piece.seat === "first"
            ? piece.king
              ? "3"
              : "1"
            : piece.king
              ? "4"
              : "2";
    }
  }
  return encoded;
}

export function createGame(
  startingPlayer: PlayerSeat,
  rulesVersion: CheckersRulesVersion = RULES_VERSION,
): CheckersState {
  if (!isPlayerSeat(startingPlayer)) throw new TypeError("Invalid starting player seat.");
  if (!isCheckersRulesVersion(rulesVersion)) throw new TypeError("Invalid Checkers rules version.");
  const board = createBoard(startingPlayer, rulesVersion);
  return Object.freeze({
    startingPlayer,
    board,
    moves: Object.freeze([]),
    nextPlayer: startingPlayer,
    outcome: null,
    quietProgressPlies: 0,
    positionHistory: Object.freeze([positionKey(board, startingPlayer)]),
    ...(rulesVersion === INTERNATIONAL_RULES_VERSION
      ? { materialDrawLimit: null, materialDrawPlies: 0 }
      : {}),
  });
}

export function isCheckersRulesVersion(value: unknown): value is CheckersRulesVersion {
  return value === ENGLISH_RULES_VERSION || value === INTERNATIONAL_RULES_VERSION;
}

export function checkersVariantForVersion(rulesVersion: number): CheckersVariant | null {
  return CHECKERS_VARIANTS.find((variant) => variant.rulesVersion === rulesVersion) ?? null;
}

function parsePosition(input: unknown, boardSize = BOARD_SIZE): ValidationResult<Position> {
  if (!isExactObject(input, ["row", "column"])) return invalid("", "Expected a board position.");
  if (
    typeof input.row !== "number" ||
    !Number.isInteger(input.row) ||
    typeof input.column !== "number" ||
    !Number.isInteger(input.column) ||
    !inside({ row: input.row, column: input.column }, boardSize)
  ) {
    return invalid("", `Position must be within the ${boardSize} by ${boardSize} board.`);
  }
  return { ok: true, value: Object.freeze({ row: input.row, column: input.column }) };
}

export function parseMovePieceAction(
  input: unknown,
  rulesVersion: CheckersRulesVersion = RULES_VERSION,
): ValidationResult<MovePieceAction> {
  if (!isExactObject(input, ["type", "from", "path"]) || input.type !== "move-piece") {
    return invalid("", "Expected a move-piece action with only type, from, and path.");
  }
  const boardSize = rulesVersion === INTERNATIONAL_RULES_VERSION ? BOARD_SIZE : MIN_BOARD_SIZE;
  const from = parsePosition(input.from, boardSize);
  if (!from.ok) return invalid("from", from.issues[0]?.message ?? "Invalid source position.");
  if (!Array.isArray(input.path) || input.path.length < 1 || input.path.length > 20)
    return invalid("path", "A move must include between one and twenty destinations.");
  const path: Position[] = [];
  for (let index = 0; index < input.path.length; index += 1) {
    const destination = parsePosition(input.path[index], boardSize);
    if (!destination.ok)
      return invalid(
        `path.${index}`,
        destination.issues[0]?.message ?? "Invalid destination position.",
      );
    path.push(destination.value);
  }
  return {
    ok: true,
    value: Object.freeze({
      type: "move-piece",
      from: from.value,
      path: Object.freeze(path),
    }),
  };
}

function captureMovesFrom(
  board: Board,
  seat: PlayerSeat,
  startingPlayer: PlayerSeat,
  from: Position,
  rulesVersion = rulesVersionForBoard(board) ?? RULES_VERSION,
): LegalMove[] {
  const initialPiece = board[from.row]?.[from.column];
  if (!initialPiece || initialPiece.seat !== seat) return [];
  const completed: LegalMove[] = [];

  const continueCapture = (
    currentBoard: Board,
    current: Position,
    path: readonly Position[],
    captured: readonly Position[],
    piece: Piece,
  ) => {
    const boardSize = currentBoard.length;
    const directions =
      piece.king || rulesVersion === INTERNATIONAL_RULES_VERSION
        ? DIAGONALS
        : DIAGONALS.filter(([rowDelta]) => rowDelta === directionFor(seat, startingPlayer));
    let extended = false;
    for (const [rowDelta, columnDelta] of directions) {
      let distance = 1;
      while (
        inside(
          {
            row: current.row + rowDelta * distance,
            column: current.column + columnDelta * distance,
          },
          boardSize,
        )
      ) {
        const victim = {
          row: current.row + rowDelta * distance,
          column: current.column + columnDelta * distance,
        };
        const target = currentBoard[victim.row]?.[victim.column];
        if (!target) {
          if (!(piece.king && rulesVersion === INTERNATIONAL_RULES_VERSION)) break;
          distance += 1;
          continue;
        }
        const alreadyCaptured = captured.some((position) => samePosition(position, victim));
        if (target.seat === seat || alreadyCaptured) break;
        const flyingKing = piece.king && rulesVersion === INTERNATIONAL_RULES_VERSION;
        const firstLandingDistance = distance + 1;
        for (
          let landingDistance = firstLandingDistance;
          inside(
            {
              row: current.row + rowDelta * landingDistance,
              column: current.column + columnDelta * landingDistance,
            },
            boardSize,
          );
          landingDistance += 1
        ) {
          const destination = {
            row: current.row + rowDelta * landingDistance,
            column: current.column + columnDelta * landingDistance,
          };
          if (currentBoard[destination.row]?.[destination.column] !== null) break;
          if (!flyingKing && landingDistance > distance + 1) break;

          extended = true;
          const nextBoard = currentBoard.map((row) => [...row]);
          nextBoard[current.row]![current.column] = null;
          const nextPiece = Object.freeze({ seat, king: piece.king });
          nextBoard[destination.row]![destination.column] = nextPiece;
          const nextPath = [...path, copyPosition(destination)];
          const nextCaptured = [...captured, copyPosition(victim)];
          const crownedAtEnd =
            !piece.king &&
            rulesVersion === ENGLISH_RULES_VERSION &&
            isKingRow(destination.row, seat, startingPlayer, boardSize);
          if (crownedAtEnd) {
            completed.push(
              Object.freeze({
                from: copyPosition(from),
                path: Object.freeze(nextPath),
                captured: Object.freeze(nextCaptured),
              }),
            );
          } else {
            continueCapture(freezeBoard(nextBoard), destination, nextPath, nextCaptured, nextPiece);
          }
        }
        break;
      }
    }
    if (!extended && path.length > 0) {
      completed.push(
        Object.freeze({
          from: copyPosition(from),
          path: Object.freeze([...path]),
          captured: Object.freeze([...captured]),
        }),
      );
    }
  };

  continueCapture(board, from, [], [], initialPiece);
  return completed;
}

function allCaptureMoves(
  board: Board,
  seat: PlayerSeat,
  startingPlayer: PlayerSeat,
  rulesVersion = rulesVersionForBoard(board) ?? RULES_VERSION,
): LegalMove[] {
  const moves: LegalMove[] = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let column = 0; column < board.length; column += 1) {
      if (board[row]?.[column]?.seat === seat)
        moves.push(...captureMovesFrom(board, seat, startingPlayer, { row, column }, rulesVersion));
    }
  }
  return moves;
}

function ordinaryMovesFrom(
  board: Board,
  seat: PlayerSeat,
  startingPlayer: PlayerSeat,
  from: Position,
): LegalMove[] {
  const piece = board[from.row]?.[from.column];
  if (!piece || piece.seat !== seat) return [];
  const directions = piece.king
    ? DIAGONALS
    : DIAGONALS.filter(([rowDelta]) => rowDelta === directionFor(seat, startingPlayer));
  const moves: LegalMove[] = [];
  for (const [rowDelta, columnDelta] of directions) {
    const boardSize = board.length;
    const stepLimit = piece.king && boardSize === BOARD_SIZE ? boardSize : 1;
    for (let distance = 1; distance <= stepLimit; distance += 1) {
      const to = {
        row: from.row + rowDelta * distance,
        column: from.column + columnDelta * distance,
      };
      if (!inside(to, boardSize) || board[to.row]?.[to.column] !== null) break;
      moves.push(
        Object.freeze({
          from: copyPosition(from),
          path: Object.freeze([copyPosition(to)]),
          captured: Object.freeze([]),
        }),
      );
    }
  }
  return moves;
}

export function legalMoves(
  state: CheckersState,
  seat: PlayerSeat = state.nextPlayer ?? state.startingPlayer,
): readonly LegalMove[] {
  if (state.outcome || state.nextPlayer !== seat) return Object.freeze([]);
  const rulesVersion = rulesVersionForBoard(state.board) ?? RULES_VERSION;
  const captures = allCaptureMoves(state.board, seat, state.startingPlayer, rulesVersion);
  if (captures.length) {
    if (rulesVersion !== INTERNATIONAL_RULES_VERSION) return Object.freeze(captures);
    const maximumCaptures = Math.max(...captures.map((move) => move.captured.length));
    return Object.freeze(captures.filter((move) => move.captured.length === maximumCaptures));
  }
  const moves: LegalMove[] = [];
  for (let row = 0; row < state.board.length; row += 1) {
    for (let column = 0; column < state.board.length; column += 1) {
      if (state.board[row]?.[column]?.seat === seat)
        moves.push(...ordinaryMovesFrom(state.board, seat, state.startingPlayer, { row, column }));
    }
  }
  return Object.freeze(moves);
}

function pieceCount(board: Board, seat: PlayerSeat): number {
  return board.reduce(
    (total, row) => total + row.filter((piece) => piece?.seat === seat).length,
    0,
  );
}

function hasLegalMove(board: Board, seat: PlayerSeat, startingPlayer: PlayerSeat): boolean {
  const rulesVersion = rulesVersionForBoard(board) ?? RULES_VERSION;
  if (allCaptureMoves(board, seat, startingPlayer, rulesVersion).length) return true;
  for (let row = 0; row < board.length; row += 1) {
    for (let column = 0; column < board.length; column += 1) {
      if (
        board[row]?.[column]?.seat === seat &&
        ordinaryMovesFrom(board, seat, startingPlayer, { row, column }).length
      )
        return true;
    }
  }
  return false;
}

function internationalKingOnlyDraw(moves: readonly CheckersMove[], board: Board): boolean {
  if (moves.length < INTERNATIONAL_KING_DRAW_PLIES) return false;
  const firstMove = moves.length - INTERNATIONAL_KING_DRAW_PLIES;
  const priorBoard = board.map((row) => [...row]);
  const moveCounts: Record<PlayerSeat, number> = { first: 0, second: 0 };

  for (let index = moves.length - 1; index >= firstMove; index -= 1) {
    const move = moves[index]!;
    if (move.captured.length > 0 || move.promoted || move.path.length !== 1) return false;
    moveCounts[move.seat] += 1;
    const destination = move.path[0]!;
    const piece = priorBoard[destination.row]?.[destination.column];
    if (!piece || piece.seat !== move.seat || !piece.king) return false;
    priorBoard[destination.row]![destination.column] = null;
    priorBoard[move.from.row]![move.from.column] = piece;
  }
  return moveCounts.first >= 25 && moveCounts.second >= 25;
}

function internationalMaterialDrawLimit(board: Board): 5 | 16 | null {
  const material = (seat: PlayerSeat) => {
    const pieces = board.flat().filter((piece) => piece?.seat === seat);
    return { count: pieces.length, kings: pieces.filter((piece) => piece?.king).length };
  };
  const first = material("first");
  const second = material("second");
  const loneKing = (side: typeof first) => side.count === 1 && side.kings === 1;
  const twoPieceEnding = (side: typeof first) =>
    side.count === 2 && (side.kings === 2 || side.kings === 1);
  const threePieceEnding = (side: typeof first) => side.count === 3 && side.kings >= 1;

  if (
    (loneKing(first) && loneKing(second)) ||
    (loneKing(first) && twoPieceEnding(second)) ||
    (loneKing(second) && twoPieceEnding(first))
  )
    return 5;
  if (
    (loneKing(first) && threePieceEnding(second)) ||
    (loneKing(second) && threePieceEnding(first))
  )
    return 16;
  return null;
}

function isAdvancingMan(move: LegalMove, piece: Piece, startingPlayer: PlayerSeat): boolean {
  const destination = move.path.at(-1);
  return Boolean(
    destination &&
    !piece.king &&
    (destination.row - move.from.row) * directionFor(piece.seat, startingPlayer) > 0,
  );
}

export function applyAction(
  state: CheckersState,
  player: PlayerSeat,
  action: unknown,
  rulesVersion: CheckersRulesVersion = rulesVersionForBoard(state.board) ?? RULES_VERSION,
): MoveResult {
  if (!isCheckersRulesVersion(rulesVersion) || rulesVersionForBoard(state.board) !== rulesVersion)
    return { ok: false, error: { code: "invalid-action" } };
  if (state.outcome !== null) return { ok: false, error: { code: "match-finished" } };
  if (!isPlayerSeat(player)) return { ok: false, error: { code: "invalid-player" } };
  if (player !== state.nextPlayer) return { ok: false, error: { code: "wrong-turn" } };
  const parsed = parseMovePieceAction(action, rulesVersion);
  if (!parsed.ok) return { ok: false, error: { code: "invalid-action" } };
  const { from, path } = parsed.value;
  const legal = legalMoves(state, player);
  const selected = legal.find(
    (move) =>
      samePosition(move.from, from) &&
      move.path.length === path.length &&
      move.path.every((position, index) => samePosition(position, path[index]!)),
  );
  if (!selected) {
    return {
      ok: false,
      error: {
        code: allCaptureMoves(state.board, player, state.startingPlayer, rulesVersion).length
          ? "must-capture"
          : "illegal-move",
      },
    };
  }

  const piece = state.board[from.row]?.[from.column];
  if (!piece) return { ok: false, error: { code: "illegal-move" } };
  const to = selected.path.at(-1)!;
  const board = state.board.map((row) => [...row]);
  board[from.row]![from.column] = null;
  for (const captured of selected.captured) board[captured.row]![captured.column] = null;
  const promoted =
    !piece.king && isKingRow(to.row, player, state.startingPlayer, state.board.length);
  const movedPiece = Object.freeze({ seat: player, king: piece.king || promoted });
  board[to.row]![to.column] = movedPiece;
  const nextBoard = freezeBoard(board);
  const actionMove = freezeMove({
    seat: player,
    from,
    path: selected.path,
    captured: selected.captured,
    promoted,
  });
  const moves = Object.freeze([...state.moves, actionMove]);
  const nextPlayer = other(player);
  const madeProgress =
    selected.captured.length > 0 || isAdvancingMan(selected, piece, state.startingPlayer);
  const quietProgressPlies = madeProgress ? 0 : state.quietProgressPlies + 1;
  const previousDrawLimit = state.materialDrawLimit ?? null;
  const materialDrawLimit =
    rulesVersion === INTERNATIONAL_RULES_VERSION
      ? (previousDrawLimit ?? internationalMaterialDrawLimit(nextBoard))
      : null;
  const materialDrawPlies =
    rulesVersion === INTERNATIONAL_RULES_VERSION
      ? previousDrawLimit === null
        ? 0
        : (state.materialDrawPlies ?? 0) + 1
      : 0;
  const key = positionKey(nextBoard, nextPlayer);
  const positionHistory = Object.freeze([...state.positionHistory, key]);
  const repetitionCount = positionHistory.filter((entry) => entry === key).length;

  let outcome: GameOutcome | null = null;
  const opponent = other(player);
  if (
    pieceCount(nextBoard, opponent) === 0 ||
    !hasLegalMove(nextBoard, opponent, state.startingPlayer)
  ) {
    outcome = Object.freeze({ kind: "win", winner: player });
  } else if (
    repetitionCount >= 3 ||
    (rulesVersion === ENGLISH_RULES_VERSION && quietProgressPlies >= MAX_QUIET_PLIES) ||
    (rulesVersion === INTERNATIONAL_RULES_VERSION &&
      (internationalKingOnlyDraw(moves, nextBoard) ||
        (materialDrawLimit !== null && materialDrawPlies >= materialDrawLimit * 2))) ||
    moves.length >= MAX_MOVES
  ) {
    outcome = Object.freeze({ kind: "draw" });
  }

  return {
    ok: true,
    value: Object.freeze({
      startingPlayer: state.startingPlayer,
      board: nextBoard,
      moves,
      nextPlayer: outcome ? null : nextPlayer,
      outcome,
      quietProgressPlies,
      positionHistory,
      ...(rulesVersion === INTERNATIONAL_RULES_VERSION
        ? { materialDrawLimit, materialDrawPlies }
        : {}),
    }),
  };
}

function parseStateMove(
  input: unknown,
  index: number,
  boardSize: number,
): ValidationResult<CheckersMove> {
  if (!isExactObject(input, ["seat", "from", "path", "captured", "promoted"]))
    return invalid(`moves.${index}`, "Invalid move fields.");
  if (!isPlayerSeat(input.seat)) return invalid(`moves.${index}.seat`, "Invalid player seat.");
  const from = parsePosition(input.from, boardSize);
  if (!from.ok) return invalid(`moves.${index}.from`, "Invalid source position.");
  if (!Array.isArray(input.path) || input.path.length < 1 || input.path.length > 20)
    return invalid(`moves.${index}.path`, "Invalid move path.");
  const path: Position[] = [];
  for (const [pathIndex, item] of input.path.entries()) {
    const parsed = parsePosition(item, boardSize);
    if (!parsed.ok)
      return invalid(`moves.${index}.path.${pathIndex}`, "Invalid destination position.");
    path.push(parsed.value);
  }
  if (!Array.isArray(input.captured) || input.captured.length > 20)
    return invalid(`moves.${index}.captured`, "Invalid captured positions.");
  const captured: Position[] = [];
  for (const [capturedIndex, item] of input.captured.entries()) {
    const parsed = parsePosition(item, boardSize);
    if (!parsed.ok)
      return invalid(`moves.${index}.captured.${capturedIndex}`, "Invalid captured position.");
    captured.push(parsed.value);
  }
  if (typeof input.promoted !== "boolean")
    return invalid(`moves.${index}.promoted`, "Expected a boolean.");
  return {
    ok: true,
    value: freezeMove({
      seat: input.seat,
      from: from.value,
      path: Object.freeze(path),
      captured: Object.freeze(captured),
      promoted: input.promoted,
    }),
  };
}

export function parseCheckersState(
  input: unknown,
  requestedRulesVersion?: CheckersRulesVersion,
): ValidationResult<CheckersState> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid("", "Invalid Checkers state fields.");
  const raw = input as Record<string, unknown>;
  const boardSize = Array.isArray(raw.board) ? raw.board.length : 0;
  const inferredRulesVersion =
    boardSize === MIN_BOARD_SIZE
      ? ENGLISH_RULES_VERSION
      : boardSize === BOARD_SIZE
        ? INTERNATIONAL_RULES_VERSION
        : null;
  const rulesVersion = requestedRulesVersion ?? inferredRulesVersion;
  if (!isCheckersRulesVersion(rulesVersion) || rulesVersion !== inferredRulesVersion)
    return invalid("board", "Board size does not match the selected Checkers rules.");
  const stateKeys = [
    "startingPlayer",
    "board",
    "moves",
    "nextPlayer",
    "outcome",
    "quietProgressPlies",
    "positionHistory",
    ...(rulesVersion === INTERNATIONAL_RULES_VERSION
      ? ["materialDrawLimit", "materialDrawPlies"]
      : []),
  ];
  if (!isExactObject(input, stateKeys)) return invalid("", "Invalid Checkers state fields.");
  if (!isPlayerSeat(raw.startingPlayer))
    return invalid("startingPlayer", "Invalid starting player.");
  if (!Array.isArray(raw.moves) || raw.moves.length > MAX_MOVES)
    return invalid("moves", `Expected at most ${MAX_MOVES} moves.`);
  const positionCount = 1 + (boardSize * boardSize) / 2;
  const positionPattern = new RegExp(`^[0-4]{${positionCount}}$`, "u");
  if (
    !Array.isArray(raw.positionHistory) ||
    raw.positionHistory.length > MAX_MOVES + 1 ||
    raw.positionHistory.some((entry) => typeof entry !== "string" || !positionPattern.test(entry))
  )
    return invalid("positionHistory", "Invalid repetition history.");
  const maxQuietProgressPlies =
    rulesVersion === ENGLISH_RULES_VERSION ? MAX_QUIET_PLIES : MAX_MOVES;
  if (
    !Number.isInteger(raw.quietProgressPlies) ||
    Number(raw.quietProgressPlies) < 0 ||
    Number(raw.quietProgressPlies) > maxQuietProgressPlies
  )
    return invalid("quietProgressPlies", "Invalid quiet-move count.");
  if (
    rulesVersion === INTERNATIONAL_RULES_VERSION &&
    raw.materialDrawLimit !== null &&
    raw.materialDrawLimit !== 5 &&
    raw.materialDrawLimit !== 16
  )
    return invalid("materialDrawLimit", "Invalid endgame draw counter.");
  if (
    rulesVersion === INTERNATIONAL_RULES_VERSION &&
    (!Number.isSafeInteger(raw.materialDrawPlies) ||
      Number(raw.materialDrawPlies) < 0 ||
      Number(raw.materialDrawPlies) > 32)
  )
    return invalid("materialDrawPlies", "Invalid endgame draw count.");
  if (raw.nextPlayer !== null && !isPlayerSeat(raw.nextPlayer))
    return invalid("nextPlayer", "Invalid next player.");
  if (
    !Array.isArray(raw.board) ||
    raw.board.length !== boardSize ||
    raw.board.some((row: unknown) => !Array.isArray(row) || row.length !== boardSize)
  )
    return invalid("board", "Expected a supported 8 by 8 or 10 by 10 board.");

  const moves: CheckersMove[] = [];
  let state = createGame(raw.startingPlayer, rulesVersion);
  for (let index = 0; index < raw.moves.length; index += 1) {
    const parsed = parseStateMove(raw.moves[index], index, boardSize);
    if (!parsed.ok) return parsed;
    if (state.nextPlayer === null || parsed.value.seat !== state.nextPlayer)
      return invalid(`moves.${index}.seat`, "Move history has the wrong player.");
    const result = applyAction(
      state,
      state.nextPlayer,
      {
        type: "move-piece",
        from: parsed.value.from,
        path: parsed.value.path,
      },
      rulesVersion,
    );
    if (!result.ok) return invalid(`moves.${index}`, "Illegal Checkers move history.");
    const applied = result.value.moves.at(-1);
    if (
      !applied ||
      !samePosition(applied.from, parsed.value.from) ||
      applied.path.length !== parsed.value.path.length ||
      applied.path.some(
        (position, pathIndex) => !samePosition(position, parsed.value.path[pathIndex]!),
      ) ||
      applied.captured.length !== parsed.value.captured.length ||
      applied.captured.some(
        (position, capturedIndex) => !samePosition(position, parsed.value.captured[capturedIndex]!),
      ) ||
      applied.promoted !== parsed.value.promoted
    )
      return invalid(`moves.${index}`, "Move summary differs from legal history.");
    state = result.value;
    moves.push(applied);
  }

  for (let row = 0; row < boardSize; row += 1) {
    for (let column = 0; column < boardSize; column += 1) {
      const inputPiece = (raw.board[row] as unknown[])[column];
      const expected = state.board[row]?.[column] ?? null;
      if (inputPiece === null && expected === null) continue;
      if (
        !isExactObject(inputPiece, ["seat", "king"]) ||
        !isPlayerSeat(inputPiece.seat) ||
        typeof inputPiece.king !== "boolean" ||
        expected?.seat !== inputPiece.seat ||
        expected.king !== inputPiece.king
      )
        return invalid(`board.${row}.${column}`, "Board differs from legal move history.");
    }
  }
  if (raw.nextPlayer !== state.nextPlayer)
    return invalid("nextPlayer", "Next player differs from legal history.");
  if (raw.quietProgressPlies !== state.quietProgressPlies)
    return invalid("quietProgressPlies", "Quiet-move count differs from legal history.");
  if (JSON.stringify(raw.positionHistory) !== JSON.stringify(state.positionHistory))
    return invalid("positionHistory", "Position history differs from legal history.");
  if (
    rulesVersion === INTERNATIONAL_RULES_VERSION &&
    (raw.materialDrawLimit !== state.materialDrawLimit ||
      raw.materialDrawPlies !== state.materialDrawPlies)
  )
    return invalid("materialDrawPlies", "Endgame draw count differs from legal history.");
  if (raw.outcome === null) {
    if (state.outcome !== null) return invalid("outcome", "Missing terminal outcome.");
  } else {
    const parsedOutcome = parseGameOutcome(raw.outcome);
    if (
      !parsedOutcome.ok ||
      state.outcome === null ||
      parsedOutcome.value.kind !== state.outcome.kind ||
      (parsedOutcome.value.kind === "win" &&
        state.outcome.kind === "win" &&
        parsedOutcome.value.winner !== state.outcome.winner)
    )
      return invalid("outcome", "Outcome differs from legal history.");
  }
  return { ok: true, value: state };
}

export function parseCheckersCommand(
  input: unknown,
): ValidationResult<ActionCommand<MovePieceAction>> {
  const rawVersion =
    typeof input === "object" && input !== null && "rulesVersion" in input
      ? input.rulesVersion
      : RULES_VERSION;
  if (!isCheckersRulesVersion(rawVersion))
    return invalid("rulesVersion", "Unsupported Checkers rules version.");
  const parsed = parseActionCommand(input, (action) => parseMovePieceAction(action, rawVersion));
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== GAME_ID) return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== rawVersion)
    return invalid("rulesVersion", "Unsupported Checkers rules version.");
  return parsed;
}

export function parseCheckersStateMessage(
  input: unknown,
): ValidationResult<StateMessage<CheckersState>> {
  const rawVersion =
    typeof input === "object" && input !== null && "rulesVersion" in input
      ? input.rulesVersion
      : RULES_VERSION;
  if (!isCheckersRulesVersion(rawVersion))
    return invalid("rulesVersion", "Unsupported Checkers rules version.");
  const parsed = parseStateMessage(input, (value) => parseCheckersState(value, rawVersion));
  if (!parsed.ok) return parsed;
  if (parsed.value.gameId !== GAME_ID) return invalid("gameId", "Unsupported game.");
  if (parsed.value.rulesVersion !== rawVersion)
    return invalid("rulesVersion", "Unsupported Checkers rules version.");
  return parsed;
}

export const checkers: TwoPlayerGameModule<
  CheckersState,
  MovePieceAction,
  MoveErrorCode,
  CheckersRulesVersion
> = Object.freeze({
  gameId: GAME_ID,
  title: "Checkers",
  description: "Capture or block every opposing piece.",
  playerCount: "2-player match",
  rulesVersion: RULES_VERSION,
  supportedRulesVersions: Object.freeze([ENGLISH_RULES_VERSION, INTERNATIONAL_RULES_VERSION]),
  getSessionPolicy: (_rulesVersion: CheckersRulesVersion) =>
    Object.freeze({ turnDurationMs: 45_000, reconnectDurationMs: 60_000 }),
  createState: createGame,
  parseAction: parseMovePieceAction,
  parseState: parseCheckersState,
  applyAction,
  getOutcome: (state: CheckersState) => state.outcome,
  getNextPlayer: (state: CheckersState) => state.nextPlayer,
  getStartingPlayer: (state: CheckersState) => state.startingPlayer,
  getActionCount: (state: CheckersState) => state.moves.length,
  getLastActionPlayer: (state: CheckersState) => state.moves.at(-1)?.seat ?? null,
  getHistorySnapshot: (state: CheckersState) => ({
    board: state.board,
    startingPlayer: state.startingPlayer,
  }),
});

export const checkersRuntime = adaptTwoPlayerGame(checkers);
