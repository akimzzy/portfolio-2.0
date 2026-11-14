import type { PlayerSeat } from "@portfolio-games/contracts";
import { applyAction, legalMoves } from "./index.js";
import type { PlaceDiscAction, ReversiState } from "./index.js";
import {
  isReversiDifficulty,
  type ReversiDifficulty,
  type ReversiOpponentId,
} from "./opponents.js";

export const REVERSI_AI_ENGINE_VERSION = 2 as const;
type Profile = Readonly<{
  corner: number;
  edge: number;
  mobility: number;
  disc: number;
  volatility: number;
  lookAhead: boolean;
}>;
const PROFILES: Readonly<Record<ReversiOpponentId, Profile>> = Object.freeze({
  standard: Object.freeze({
    corner: 8,
    edge: 2.2,
    mobility: 2.8,
    disc: 0.5,
    volatility: 1.2,
    lookAhead: false,
  }),
  expert: Object.freeze({
    corner: 12,
    edge: 2.5,
    mobility: 4.2,
    disc: 0.3,
    volatility: 0.4,
    lookAhead: true,
  }),
  defensive: Object.freeze({
    corner: 11,
    edge: 3.1,
    mobility: 4.8,
    disc: 0.8,
    volatility: 0.2,
    lookAhead: true,
  }),
  aggressive: Object.freeze({
    corner: 10,
    edge: 1.8,
    mobility: 1.7,
    disc: 1.1,
    volatility: 2.1,
    lookAhead: false,
  }),
});
const DIFFICULTY_PROFILES: Readonly<Record<ReversiDifficulty, Profile>> = Object.freeze({
  easy: Object.freeze({
    corner: 7,
    edge: 1.6,
    mobility: 1.4,
    disc: 0.5,
    volatility: 80,
    lookAhead: false,
  }),
  medium: Object.freeze({
    corner: 9,
    edge: 2.3,
    mobility: 3.2,
    disc: 0.5,
    volatility: 2.5,
    lookAhead: false,
  }),
  hard: Object.freeze({
    corner: 11,
    edge: 2.8,
    mobility: 4.5,
    disc: 0.35,
    volatility: 0.5,
    lookAhead: true,
  }),
  "very-hard": Object.freeze({
    corner: 12,
    edge: 3,
    mobility: 5,
    disc: 0.3,
    volatility: 0.05,
    lookAhead: true,
  }),
});
const CORNERS = [
  [0, 0],
  [0, 7],
  [7, 0],
  [7, 7],
] as const;
const CORNER_NEIGHBORS = [
  {
    corner: [0, 0],
    squares: [
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  },
  {
    corner: [0, 7],
    squares: [
      [0, 6],
      [1, 7],
      [1, 6],
    ],
  },
  {
    corner: [7, 0],
    squares: [
      [6, 0],
      [7, 1],
      [6, 1],
    ],
  },
  {
    corner: [7, 7],
    squares: [
      [6, 7],
      [7, 6],
      [6, 6],
    ],
  },
] as const;

function other(seat: PlayerSeat): PlayerSeat {
  return seat === "first" ? "second" : "first";
}
function discCount(state: ReversiState, seat: PlayerSeat): number {
  return state.board.reduce((sum, row) => sum + row.filter((cell) => cell === seat).length, 0);
}
function positionalScore(state: ReversiState, seat: PlayerSeat, profile: Profile): number {
  const rival = other(seat);
  const empties = state.board.reduce(
    (sum, row) => sum + row.filter((cell) => cell === null).length,
    0,
  );
  const endgame = empties <= 16;
  let score = 0;
  for (const [row, column] of CORNERS) {
    const value = state.board[row]?.[column];
    if (value === seat) score += profile.corner;
    else if (value === rival) score -= profile.corner;
  }
  for (const corner of CORNER_NEIGHBORS) {
    if (state.board[corner.corner[0]]?.[corner.corner[1]] !== null) continue;
    for (const [row, column] of corner.squares) {
      const value = state.board[row]?.[column];
      const penalty =
        row === corner.corner[0] || column === corner.corner[1]
          ? profile.corner * 0.42
          : profile.corner * 0.7;
      if (value === seat) score -= penalty;
      else if (value === rival) score += penalty;
    }
  }
  for (let row = 0; row < 8; row += 1)
    for (let column = 0; column < 8; column += 1) {
      if (row !== 0 && row !== 7 && column !== 0 && column !== 7) continue;
      const value = state.board[row]?.[column];
      if (value === seat) score += profile.edge;
      else if (value === rival) score -= profile.edge;
    }
  const ourMobility = legalMoves(state, seat).length;
  const rivalMobility = legalMoves(state, rival).length;
  score += (ourMobility - rivalMobility) * profile.mobility;
  score +=
    (discCount(state, seat) - discCount(state, rival)) *
    (endgame ? profile.disc * 4 : profile.disc);
  return score;
}

function deterministicNoise(seed: number, ply: number, row: number, column: number): number {
  let value =
    (seed ^
      Math.imul(ply + 1, 0x9e3779b1) ^
      Math.imul(row + 3, 0x85ebca6b) ^
      Math.imul(column + 7, 0xc2b2ae35)) >>>
    0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}

function evaluateMove(
  state: ReversiState,
  action: PlaceDiscAction,
  seat: PlayerSeat,
  profile: Profile,
): number {
  const result = applyAction(state, seat, action);
  if (!result.ok) return -Infinity;
  const next = result.value;
  if (next.outcome?.kind === "win") return next.outcome.winner === seat ? 1_000_000 : -1_000_000;
  if (next.outcome?.kind === "draw") return 0;
  let score = positionalScore(next, seat, profile);
  if (profile.lookAhead && next.nextPlayer !== null) {
    const responseSeat = next.nextPlayer;
    const replies = legalMoves(next, responseSeat);
    if (replies.length) {
      // A forced pass can give the same player another action. Model that as
      // our best continuation; only minimize when the opponent actually moves.
      let bestContinuation = responseSeat === seat ? -Infinity : Infinity;
      for (const reply of replies) {
        const response = applyAction(next, responseSeat, reply);
        if (!response.ok) continue;
        const continuationScore =
          response.value.outcome?.kind === "win"
            ? response.value.outcome.winner === seat
              ? 1_000_000
              : -1_000_000
            : response.value.outcome?.kind === "draw"
              ? 0
              : positionalScore(response.value, seat, profile);
        bestContinuation =
          responseSeat === seat
            ? Math.max(bestContinuation, continuationScore)
            : Math.min(bestContinuation, continuationScore);
      }
      if (Number.isFinite(bestContinuation)) score = score * 0.35 + bestContinuation * 0.65;
    }
  }
  return score;
}

/**
 * Deterministic, bounded Reversi strategy: prioritize corners and mobility,
 * avoid vulnerable corner-adjacent squares, and inspect one reply or forced-pass
 * bonus move for profiles that value planning. Tie variation is seeded per match.
 */
function chooseMoveWithProfile(
  state: ReversiState,
  seat: PlayerSeat,
  profile: Profile,
  seed: number,
): PlaceDiscAction {
  const actions = legalMoves(state, seat);
  if (!actions.length || state.nextPlayer !== seat)
    throw new RangeError("No legal Reversi move is available for this seat.");
  const scored = actions.map((action) => ({
    action,
    score:
      evaluateMove(state, action, seat, profile) +
      deterministicNoise(seed, state.moves.length, action.row, action.column) * profile.volatility,
  }));
  scored.sort(
    (a, b) => b.score - a.score || a.action.row - b.action.row || a.action.column - b.action.column,
  );
  return scored[0]!.action;
}

/** Resolve persisted strategy versions so already-running matches stay stable. */
export function chooseReversiMoveForVersion(
  state: ReversiState,
  seat: PlayerSeat,
  profileId: ReversiOpponentId | ReversiDifficulty,
  seed: number,
  engineVersion: number,
): PlaceDiscAction {
  if (engineVersion === 1) {
    if (isReversiDifficulty(profileId))
      throw new RangeError("Legacy Reversi engine requires a legacy opponent profile.");
    const profile = PROFILES[profileId];
    if (!profile) throw new RangeError("Unsupported Reversi opponent profile.");
    return chooseMoveWithProfile(state, seat, profile, seed);
  }
  if (engineVersion === REVERSI_AI_ENGINE_VERSION) {
    if (!isReversiDifficulty(profileId)) throw new RangeError("Unsupported Reversi difficulty.");
    return chooseMoveWithProfile(state, seat, DIFFICULTY_PROFILES[profileId], seed);
  }
  throw new RangeError(`Unsupported Reversi AI engine version: ${engineVersion}`);
}

/** Legacy-profile convenience retained for existing package consumers. */
export function chooseReversiMove(
  state: ReversiState,
  seat: PlayerSeat,
  profileId: ReversiOpponentId,
  seed: number,
): PlaceDiscAction {
  return chooseReversiMoveForVersion(state, seat, profileId, seed, 1);
}
