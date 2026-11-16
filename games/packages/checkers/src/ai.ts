import type { PlayerSeat } from "@portfolio-games/contracts";
import { applyAction, legalMoves, type CheckersState, type MovePieceAction } from "./index.js";
import { isCheckersDifficulty, type CheckersDifficulty } from "./opponents.js";

export const CHECKERS_AI_ENGINE_VERSION = 1 as const;
const MAX_SEARCH_NODES_PER_MOVE = 5_000;

function noise(seed: number, ply: number, index: number): number {
  let value = (seed ^ Math.imul(ply + 1, 0x9e3779b1) ^ Math.imul(index + 7, 0x85ebca6b)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}

function legalActions(state: CheckersState): MovePieceAction[] {
  return legalMoves(state).map(({ from, path }) => ({ type: "move-piece", from, path }));
}

function evaluate(state: CheckersState, perspective: PlayerSeat): number {
  if (state.outcome?.kind === "win")
    return state.outcome.winner === perspective ? 100_000 : -100_000;
  if (state.outcome?.kind === "draw") return 0;

  let score = 0;
  const boardSize = state.board.length;
  for (let row = 0; row < boardSize; row += 1) {
    for (let column = 0; column < boardSize; column += 1) {
      const piece = state.board[row]?.[column];
      if (!piece) continue;
      const sign = piece.seat === perspective ? 1 : -1;
      const advancement = piece.seat === state.startingPlayer ? boardSize - 1 - row : row;
      score += sign * (piece.king ? 180 : 100 + advancement * 5);
      const centerStart = Math.floor(boardSize / 4);
      const centerEnd = boardSize - centerStart - 1;
      if (row >= centerStart && row <= centerEnd && column >= centerStart && column <= centerEnd)
        score += sign * 5;
      if (column === 0 || column === boardSize - 1) score += sign * 3;
    }
  }
  if (state.nextPlayer) {
    const mobility = legalMoves(state).length;
    score += (state.nextPlayer === perspective ? 1 : -1) * mobility * 2;
  }
  return score;
}

function actionKey(action: MovePieceAction): string {
  return `${action.from.row}${action.from.column}:${action.path.map(({ row, column }) => `${row}${column}`).join(":")}`;
}

function orderedActions(
  state: CheckersState,
  actions: readonly MovePieceAction[],
): MovePieceAction[] {
  return [...actions].sort((left, right) => {
    const leftCapture =
      left.path.length > 1 || Math.abs(left.path[0]!.row - left.from.row) >= 2 ? 1 : 0;
    const rightCapture =
      right.path.length > 1 || Math.abs(right.path[0]!.row - right.from.row) >= 2 ? 1 : 0;
    if (leftCapture !== rightCapture) return rightCapture - leftCapture;
    const leftSeat = state.board[left.from.row]?.[left.from.column]?.seat;
    const rightSeat = state.board[right.from.row]?.[right.from.column]?.seat;
    const leftPromotes = Boolean(
      leftSeat &&
      !state.board[left.from.row]?.[left.from.column]?.king &&
      left.path.at(-1)?.row === (leftSeat === state.startingPlayer ? 0 : state.board.length - 1),
    );
    const rightPromotes = Boolean(
      rightSeat &&
      !state.board[right.from.row]?.[right.from.column]?.king &&
      right.path.at(-1)?.row === (rightSeat === state.startingPlayer ? 0 : state.board.length - 1),
    );
    return (
      Number(rightPromotes) - Number(leftPromotes) ||
      actionKey(left).localeCompare(actionKey(right))
    );
  });
}

type SearchContext = { nodes: number; readonly limit: number; exhausted: boolean };

function search(
  state: CheckersState,
  perspective: PlayerSeat,
  depth: number,
  alpha: number,
  beta: number,
  context: SearchContext,
): number {
  if (context.nodes >= context.limit) {
    context.exhausted = true;
    return evaluate(state, perspective);
  }
  context.nodes += 1;
  if (context.nodes >= context.limit && depth > 0 && !state.outcome) {
    context.exhausted = true;
    return evaluate(state, perspective);
  }
  if (depth === 0 || state.outcome) return evaluate(state, perspective);
  const seat = state.nextPlayer;
  if (!seat) return evaluate(state, perspective);
  const actions = orderedActions(state, legalActions(state));
  if (!actions.length) return seat === perspective ? -100_000 + depth : 100_000 - depth;

  const maximizing = seat === perspective;
  let best = maximizing ? -Infinity : Infinity;
  for (const action of actions) {
    const result = applyAction(state, seat, action);
    if (!result.ok) continue;
    const value = search(result.value, perspective, depth - 1, alpha, beta, context);
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha || context.nodes >= context.limit) break;
  }
  return best;
}

function seededChoice(
  seed: number,
  ply: number,
  actions: readonly MovePieceAction[],
): MovePieceAction {
  const ordered = [...actions].sort((left, right) =>
    actionKey(left).localeCompare(actionKey(right)),
  );
  return ordered[Math.floor(noise(seed, ply, ordered.length) * ordered.length)]!;
}

export function chooseCheckersMove(
  state: CheckersState,
  seat: PlayerSeat,
  difficulty: CheckersDifficulty,
  seed = 0,
): MovePieceAction {
  if (!isCheckersDifficulty(difficulty)) throw new RangeError("Unsupported Checkers difficulty.");
  if (state.outcome || state.nextPlayer !== seat)
    throw new RangeError("No Checkers move is available for this seat.");
  const actions = legalActions(state);
  if (!actions.length) throw new RangeError("No legal Checkers move is available.");
  if (difficulty === "easy") return seededChoice(seed, state.moves.length, actions);

  const depth = difficulty === "medium" ? 2 : difficulty === "hard" ? 4 : 6;
  const ordered = orderedActions(state, actions);
  let scored = ordered.map((action) => ({ action, score: evaluate(state, seat) }));
  const context: SearchContext = {
    nodes: 0,
    limit: MAX_SEARCH_NODES_PER_MOVE,
    exhausted: false,
  };

  // Iterative deepening ensures every candidate is compared at the same depth.
  // If a deeper pass exhausts its shared budget, keep the last complete pass.
  for (let currentDepth = 1; currentDepth <= depth; currentDepth += 1) {
    const nextScores: typeof scored = [];
    for (const action of ordered) {
      if (context.exhausted) break;
      const result = applyAction(state, seat, action);
      nextScores.push({
        action,
        score: result.ok
          ? search(result.value, seat, currentDepth - 1, -Infinity, Infinity, context)
          : -Infinity,
      });
      if (context.exhausted) break;
    }
    if (context.exhausted || nextScores.length !== ordered.length) break;
    scored = nextScores;
  }
  const best = Math.max(...scored.map(({ score }) => score));
  const tolerance = difficulty === "medium" ? 55 : difficulty === "hard" ? 12 : 0;
  const candidates = scored.filter(({ score }) => score >= best - tolerance);
  return seededChoice(
    seed,
    state.moves.length,
    candidates.map(({ action }) => action),
  );
}
