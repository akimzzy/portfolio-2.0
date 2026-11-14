import {
  isConnectFourDifficulty,
  type ConnectFourDifficulty,
  type ConnectFourOpponentId,
} from "./opponents.js";
import type { ConnectFourState } from "./index.js";

type Candidate = { column: number; score: number };
type Profile = { depth: number; nodes: number; center: number; attack: number; defense: number };
export const CONNECT_FOUR_AI_ENGINE_VERSION = 3 as const;

const PROFILES: Record<ConnectFourOpponentId, Profile> = {
  standard: { depth: 4, nodes: 1_050, center: 3, attack: 1, defense: 1 },
  expert: { depth: 6, nodes: 1_200, center: 4, attack: 2, defense: 2 },
  defensive: { depth: 4, nodes: 1_350, center: 2, attack: 1, defense: 3 },
  aggressive: { depth: 4, nodes: 1_350, center: 3, attack: 3, defense: 1 },
};

const PROFILES_V2: Record<ConnectFourOpponentId, Profile> = {
  standard: { depth: 4, nodes: 1_150, center: 3, attack: 2, defense: 2 },
  expert: { depth: 6, nodes: 1_450, center: 3, attack: 2, defense: 2 },
  defensive: { depth: 5, nodes: 1_300, center: 2, attack: 1, defense: 4 },
  aggressive: { depth: 4, nodes: 1_300, center: 3, attack: 4, defense: 1 },
};

const PROFILES_V3: Record<ConnectFourDifficulty, Profile> = {
  easy: { depth: 0, nodes: 1, center: 1, attack: 1, defense: 1 },
  medium: { depth: 2, nodes: 520, center: 2, attack: 1, defense: 2 },
  hard: { depth: 4, nodes: 1_050, center: 3, attack: 2, defense: 3 },
  "very-hard": { depth: 6, nodes: 1_450, center: 3, attack: 2, defense: 2 },
};

const ROWS = 6;
const COLUMNS = 7;
const WIN = 100_000;
const ORDER = [3, 2, 4, 1, 5, 0, 6] as const;
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

function seatNumber(seat: "first" | "second"): number {
  return seat === "first" ? 1 : 2;
}

function indexOf(row: number, column: number): number {
  return row * COLUMNS + column;
}

function drop(board: Int8Array, heights: number[], column: number, player: number): number {
  const row = ROWS - 1 - heights[column]!;
  board[indexOf(row, column)] = player;
  heights[column] = heights[column]! + 1;
  return row;
}

function undo(board: Int8Array, heights: number[], column: number, row: number): void {
  board[indexOf(row, column)] = 0;
  heights[column] = heights[column]! - 1;
}

function isWin(board: Int8Array, row: number, column: number, player: number): boolean {
  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = column + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLUMNS && board[indexOf(r, c)] === player) {
        count += 1;
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

function legalColumns(heights: number[]): number[] {
  return ORDER.filter((column) => heights[column]! < ROWS);
}

function winningColumns(board: Int8Array, heights: number[], player: number): number[] {
  const wins: number[] = [];
  for (const column of legalColumns(heights)) {
    const row = drop(board, heights, column, player);
    if (isWin(board, row, column, player)) wins.push(column);
    undo(board, heights, column, row);
  }
  return wins;
}

function opponentCanCreateFork(
  board: Int8Array,
  heights: number[],
  opponent: number,
  player: number,
): boolean {
  for (const column of legalColumns(heights)) {
    const row = drop(board, heights, column, opponent);
    const winsNext =
      winningColumns(board, heights, player).length === 0 &&
      winningColumns(board, heights, opponent).length >= 2;
    undo(board, heights, column, row);
    if (winsNext) return true;
  }
  return false;
}

function scoreWindow(ours: number, theirs: number, profile: Profile): number {
  const empty = 4 - ours - theirs;
  if (ours && theirs) return 0;
  if (ours === 4) return WIN / 2;
  if (theirs === 4) return -WIN / 2;
  if (ours === 3 && empty === 1) return 34 * profile.attack;
  if (theirs === 3 && empty === 1) return -42 * profile.defense;
  if (ours === 2 && empty === 2) return 5 * profile.attack;
  if (theirs === 2 && empty === 2) return -6 * profile.defense;
  if (ours === 1 && empty === 3) return profile.attack;
  return 0;
}

function evaluate(board: Int8Array, player: number, profile: Profile): number {
  const other = player === 1 ? 2 : 1;
  let score = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const value = board[indexOf(row, column)]!;
      if (value === player) score += (COLUMNS - Math.abs(3 - column)) * profile.center;
      else if (value === other) score -= (COLUMNS - Math.abs(3 - column)) * profile.center;
      for (const [dr, dc] of DIRECTIONS) {
        const endRow = row + dr * 3;
        const endColumn = column + dc * 3;
        if (endRow < 0 || endRow >= ROWS || endColumn < 0 || endColumn >= COLUMNS) continue;
        let ours = 0;
        let theirs = 0;
        for (let offset = 0; offset < 4; offset += 1) {
          const token = board[indexOf(row + dr * offset, column + dc * offset)]!;
          if (token === player) ours += 1;
          else if (token !== 0) theirs += 1;
        }
        score += scoreWindow(ours, theirs, profile);
      }
    }
  }
  return score;
}

function search(
  board: Int8Array,
  heights: number[],
  player: number,
  root: number,
  depth: number,
  alpha: number,
  beta: number,
  profile: Profile,
  budget: { nodes: number; maximum: number },
): number {
  budget.nodes += 1;
  if (budget.nodes >= budget.maximum || depth === 0) return evaluate(board, root, profile);
  const columns = legalColumns(heights);
  if (columns.length === 0) return 0;
  let best = player === root ? -Infinity : Infinity;
  for (const column of columns) {
    if (budget.nodes >= budget.maximum) break;
    const row = drop(board, heights, column, player);
    let value: number;
    if (isWin(board, row, column, player)) {
      value = player === root ? WIN + depth : -WIN - depth;
    } else {
      value = search(
        board,
        heights,
        player === 1 ? 2 : 1,
        root,
        depth - 1,
        alpha,
        beta,
        profile,
        budget,
      );
    }
    undo(board, heights, column, row);
    if (player === root) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best === Infinity || best === -Infinity ? evaluate(board, root, profile) : best;
}

function tieIndex(seed: number, ply: number, length: number): number {
  let value = (seed ^ Math.imul(ply + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) % length;
}

/**
 * Choose a legal Connect Four move with forced wins and blocks checked first.
 * Search is deterministic per match, bounded by profile node budgets, and has
 * no network, storage, timer, or third-party engine dependency.
 */
function chooseConnectFourMoveWithProfile(
  state: ConnectFourState,
  seat: "first" | "second",
  profile: Profile,
  seed: number,
): number {
  const board = Int8Array.from(
    state.board.flatMap((row) =>
      row.map((cell) => (cell === "first" ? 1 : cell === "second" ? 2 : 0)),
    ),
  );
  const heights = Array.from({ length: COLUMNS }, (_, column) =>
    state.board.reduce((sum, row) => sum + (row[column] === null ? 0 : 1), 0),
  );
  const legal = legalColumns(heights);
  if (!legal.length) throw new RangeError("No legal Connect Four move is available.");
  const player = seatNumber(seat);
  const immediateWins = winningColumns(board, heights, player);
  if (immediateWins.length)
    return immediateWins[tieIndex(seed, state.moves.length, immediateWins.length)]!;
  const opponentWins = winningColumns(board, heights, player === 1 ? 2 : 1);
  // One open winning square is a forced block (placing in any other column
  // leaves that square playable). Multiple threats are handled by search.
  const candidates = opponentWins.length === 1 ? opponentWins : legal;
  const scored: Candidate[] = [];
  let best = -Infinity;
  const perCandidateBudget = Math.max(1, Math.ceil(profile.nodes / candidates.length));
  for (const column of candidates) {
    const row = drop(board, heights, column, player);
    const budget = { nodes: 0, maximum: perCandidateBudget };
    const value = isWin(board, row, column, player)
      ? WIN
      : search(
          board,
          heights,
          player === 1 ? 2 : 1,
          player,
          profile.depth - 1,
          -Infinity,
          Infinity,
          profile,
          budget,
        );
    undo(board, heights, column, row);
    scored.push({ column, score: value });
    best = Math.max(best, value);
  }
  const nearBest = scored.filter((candidate) => candidate.score >= best - 3);
  return nearBest[tieIndex(seed, state.moves.length, nearBest.length)]!.column;
}

function chooseConnectFourMoveV1(
  state: ConnectFourState,
  seat: "first" | "second",
  profileId: ConnectFourOpponentId,
  seed: number,
): number {
  return chooseConnectFourMoveWithProfile(state, seat, PROFILES[profileId], seed);
}

/**
 * A v2 root pass gives forced tactics priority before the bounded profile
 * search. In particular, two simultaneous winning drops are a fork: a single
 * opponent reply cannot occupy both columns. All simulations are local and
 * bounded to the seven columns of the board.
 */
function chooseConnectFourMoveV2(
  state: ConnectFourState,
  seat: "first" | "second",
  profileId: ConnectFourOpponentId,
  seed: number,
): number {
  const board = Int8Array.from(
    state.board.flatMap((row) =>
      row.map((cell) => (cell === "first" ? 1 : cell === "second" ? 2 : 0)),
    ),
  );
  const heights = Array.from({ length: COLUMNS }, (_, column) =>
    state.board.reduce((sum, row) => sum + (row[column] === null ? 0 : 1), 0),
  );
  const legal = legalColumns(heights);
  if (!legal.length) throw new RangeError("No legal Connect Four move is available.");
  const player = seatNumber(seat);
  const opponent = player === 1 ? 2 : 1;
  const ply = state.moves.length;

  const immediateWins = winningColumns(board, heights, player);
  if (immediateWins.length) return immediateWins[tieIndex(seed, ply, immediateWins.length)]!;
  const opponentWins = winningColumns(board, heights, opponent);
  // A single immediate threat must be blocked. If there are multiple, search
  // the full legal set and choose the move with the best survival prospects.
  if (opponentWins.length === 1) return opponentWins[0]!;

  const safe: number[] = [];
  const forkSafe: number[] = [];
  const forks: number[] = [];
  for (const column of legal) {
    const row = drop(board, heights, column, player);
    const opponentCanWin = winningColumns(board, heights, opponent).length > 0;
    if (!opponentCanWin) {
      safe.push(column);
      const ownWinningDrops = winningColumns(board, heights, player).length;
      if (ownWinningDrops >= 2) forks.push(column);
      if (!opponentCanCreateFork(board, heights, opponent, player)) forkSafe.push(column);
    }
    undo(board, heights, column, row);
  }

  if (forks.length) return forks[tieIndex(seed, ply, forks.length)]!;
  const candidates = forkSafe.length ? forkSafe : safe.length ? safe : legal;
  const profile = PROFILES_V2[profileId];
  const scored: Candidate[] = [];
  let best = -Infinity;
  const perCandidateBudget = Math.max(1, Math.ceil(profile.nodes / candidates.length));
  for (const column of candidates) {
    const row = drop(board, heights, column, player);
    const budget = { nodes: 0, maximum: perCandidateBudget };
    const value = isWin(board, row, column, player)
      ? WIN
      : search(
          board,
          heights,
          opponent,
          player,
          profile.depth - 1,
          -Infinity,
          Infinity,
          profile,
          budget,
        );
    undo(board, heights, column, row);
    scored.push({ column, score: value });
    best = Math.max(best, value);
  }
  const nearBest = scored.filter((candidate) => candidate.score >= best - 3);
  return nearBest[tieIndex(seed, ply, nearBest.length)]!.column;
}

/** Skill-tiered selector. Work is local and has a strict per-move node budget. */
function chooseConnectFourMoveV3(
  state: ConnectFourState,
  seat: "first" | "second",
  difficulty: ConnectFourDifficulty,
  seed: number,
): number {
  const board = Int8Array.from(
    state.board.flatMap((row) =>
      row.map((cell) => (cell === "first" ? 1 : cell === "second" ? 2 : 0)),
    ),
  );
  const heights = Array.from({ length: COLUMNS }, (_, column) =>
    state.board.reduce((sum, row) => sum + (row[column] === null ? 0 : 1), 0),
  );
  const legal = legalColumns(heights);
  if (!legal.length) throw new RangeError("No legal Connect Four move is available.");
  const player = seatNumber(seat);
  const opponent = player === 1 ? 2 : 1;
  const ply = state.moves.length;
  const profile = PROFILES_V3[difficulty];

  const wins = winningColumns(board, heights, player);
  if (wins.length) return wins[tieIndex(seed, ply, wins.length)]!;
  const threats = winningColumns(board, heights, opponent);
  if (threats.length === 1) return threats[0]!;

  const safe: number[] = [];
  const forkSafe: number[] = [];
  const forks: number[] = [];
  for (const column of legal) {
    const row = drop(board, heights, column, player);
    const allowsImmediateWin = winningColumns(board, heights, opponent).length > 0;
    if (!allowsImmediateWin) {
      safe.push(column);
      if (difficulty === "hard" || difficulty === "very-hard") {
        if (winningColumns(board, heights, player).length >= 2) forks.push(column);
        if (!opponentCanCreateFork(board, heights, opponent, player)) forkSafe.push(column);
      }
    }
    undo(board, heights, column, row);
  }

  if (forks.length) return forks[tieIndex(seed, ply, forks.length)]!;
  const candidates =
    difficulty === "hard" || difficulty === "very-hard"
      ? forkSafe.length
        ? forkSafe
        : safe.length
          ? safe
          : legal
      : safe.length
        ? safe
        : legal;
  const scores: Candidate[] = [];
  let best = -Infinity;
  const perCandidateBudget = Math.max(1, Math.ceil(profile.nodes / candidates.length));
  for (const column of candidates) {
    const row = drop(board, heights, column, player);
    const budget = { nodes: 0, maximum: perCandidateBudget };
    const value = isWin(board, row, column, player)
      ? WIN
      : search(
          board,
          heights,
          opponent,
          player,
          profile.depth,
          -Infinity,
          Infinity,
          profile,
          budget,
        );
    undo(board, heights, column, row);
    scores.push({ column, score: value });
    best = Math.max(best, value);
  }
  const tolerance = difficulty === "easy" ? 36 : difficulty === "medium" ? 12 : 3;
  const nearBest = scores.filter((candidate) => candidate.score >= best - tolerance);
  return nearBest[tieIndex(seed, ply, nearBest.length)]!.column;
}

type ConnectFourMoveSelector = typeof chooseConnectFourMoveV1;
const MOVE_SELECTORS: Readonly<Record<number, ConnectFourMoveSelector>> = Object.freeze({
  1: chooseConnectFourMoveV1,
  2: chooseConnectFourMoveV2,
});

export function supportsConnectFourAiEngineVersion(engineVersion: number): boolean {
  return (
    engineVersion === CONNECT_FOUR_AI_ENGINE_VERSION || Object.hasOwn(MOVE_SELECTORS, engineVersion)
  );
}

/** Resolve a persisted engine version so active matches survive later AI upgrades. */
export function chooseConnectFourMoveForVersion(
  state: ConnectFourState,
  seat: "first" | "second",
  profileId: ConnectFourOpponentId | ConnectFourDifficulty,
  seed: number,
  engineVersion: number,
): number {
  if (engineVersion === CONNECT_FOUR_AI_ENGINE_VERSION) {
    if (!isConnectFourDifficulty(profileId))
      throw new RangeError("Unsupported Connect Four difficulty.");
    return chooseConnectFourMoveV3(state, seat, profileId, seed);
  }
  const selector = MOVE_SELECTORS[engineVersion];
  if (!selector)
    throw new RangeError(`Unsupported Connect Four AI engine version: ${engineVersion}`);
  if (isConnectFourDifficulty(profileId))
    throw new RangeError("Legacy Connect Four engine requires a legacy opponent profile.");
  return selector(state, seat, profileId, seed);
}

export function chooseConnectFourMove(
  state: ConnectFourState,
  seat: "first" | "second",
  profileId: ConnectFourOpponentId | ConnectFourDifficulty,
  seed: number,
): number {
  if (isConnectFourDifficulty(profileId))
    return chooseConnectFourMoveForVersion(
      state,
      seat,
      profileId,
      seed,
      CONNECT_FOUR_AI_ENGINE_VERSION,
    );
  return chooseConnectFourMoveForVersion(state, seat, profileId, seed, 2);
}
