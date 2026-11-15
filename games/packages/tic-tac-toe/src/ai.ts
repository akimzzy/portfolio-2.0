import type { PlayerSeat } from "@portfolio-games/contracts";
import { applyAction, type PlaceMarkAction, type TicTacToeState } from "./index.js";
import { isTicTacToeDifficulty, type TicTacToeDifficulty } from "./opponents.js";

export const TIC_TAC_TOE_AI_ENGINE_VERSION = 1 as const;

function other(seat: PlayerSeat): PlayerSeat {
  return seat === "first" ? "second" : "first";
}

function noise(seed: number, ply: number, index: number): number {
  let value = (seed ^ Math.imul(ply + 1, 0x9e3779b1) ^ Math.imul(index + 7, 0x85ebca6b)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}

function legalActions(state: TicTacToeState): PlaceMarkAction[] {
  const actions: PlaceMarkAction[] = [];
  for (let row = 0; row < 3; row += 1)
    for (let column = 0; column < 3; column += 1)
      if (state.board[row]?.[column] === null) actions.push({ type: "place-mark", row, column });
  return actions;
}

function immediateWins(state: TicTacToeState, seat: PlayerSeat): PlaceMarkAction[] {
  return legalActions(state).filter((action) => {
    const result = applyAction(state, seat, action);
    return (
      result.ok && result.value.outcome?.kind === "win" && result.value.outcome.winner === seat
    );
  });
}

function boardKey(state: TicTacToeState, player: PlayerSeat, depth: number): string {
  let canonical = "222222222";
  for (let reflected = 0; reflected < 2; reflected += 1) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const cells = new Array<string>(9);
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          const reflectedColumn = reflected ? 2 - column : column;
          let transformedRow = row;
          let transformedColumn = reflectedColumn;
          for (let turn = 0; turn < rotation; turn += 1) {
            [transformedRow, transformedColumn] = [transformedColumn, 2 - transformedRow];
          }
          const cell = state.board[row]?.[column];
          cells[transformedRow * 3 + transformedColumn] =
            cell === null ? "0" : cell === "first" ? "1" : "2";
        }
      }
      const encoded = cells.join("");
      if (encoded < canonical) canonical = encoded;
    }
  }
  return `${canonical}:${player}:${depth}`;
}

function minimax(
  state: TicTacToeState,
  player: PlayerSeat,
  root: PlayerSeat,
  depth: number,
  memo: Map<string, number>,
): number {
  if (state.outcome?.kind === "win") return state.outcome.winner === root ? 10 - depth : depth - 10;
  if (state.outcome?.kind === "draw") return 0;
  const key = boardKey(state, player, depth);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const actions = legalActions(state);
  let best = player === root ? -Infinity : Infinity;
  if (player === root) {
    for (const action of actions) {
      const result = applyAction(state, player, action);
      if (result.ok)
        best = Math.max(best, minimax(result.value, other(player), root, depth + 1, memo));
    }
  } else {
    for (const action of actions) {
      const result = applyAction(state, player, action);
      if (result.ok)
        best = Math.min(best, minimax(result.value, other(player), root, depth + 1, memo));
    }
  }
  memo.set(key, best);
  return best;
}

function tacticalScore(state: TicTacToeState, action: PlaceMarkAction, seat: PlayerSeat): number {
  const result = applyAction(state, seat, action);
  if (!result.ok) return -Infinity;
  if (result.value.outcome?.kind === "win") return 100;
  const [row, column] = [action.row, action.column];
  let score = row === 1 && column === 1 ? 6 : row !== 1 && column !== 1 ? 3 : 2;
  const next = result.value;
  score -= immediateWins(next, other(seat)).length * 12;
  const occupied = next.board.flat().filter(Boolean).length;
  // Prefer moves that participate in two potential lines, without making
  // medium play deterministic or exposing a fixed opening script.
  if (occupied <= 4 && (row === 1 || column === 1)) score += 1;
  return score;
}

function tieBreak(
  seed: number,
  ply: number,
  candidates: readonly PlaceMarkAction[],
): PlaceMarkAction {
  const ranked = [...candidates].sort((a, b) => a.row - b.row || a.column - b.column);
  return ranked[Math.floor(noise(seed, ply, ranked.length) * ranked.length)]!;
}

export function chooseTicTacToeMove(
  state: TicTacToeState,
  seat: PlayerSeat,
  difficulty: TicTacToeDifficulty,
  seed = 0,
): PlaceMarkAction {
  if (!isTicTacToeDifficulty(difficulty))
    throw new RangeError("Unsupported Tic-tac-toe difficulty.");
  if (state.outcome || state.nextPlayer !== seat)
    throw new RangeError("No Tic-tac-toe move is available for this seat.");
  const actions = legalActions(state);
  if (!actions.length) throw new RangeError("No legal Tic-tac-toe move is available.");

  const wins = immediateWins(state, seat);
  if (wins.length) return tieBreak(seed, state.moves.length, wins);
  const blocks = immediateWins(state, other(seat));
  if (difficulty === "easy") {
    // Easy play sometimes misses a block, but still takes an available win.
    if (blocks.length && noise(seed ^ 0x2c1b3c6d, state.moves.length, 0) < 0.68)
      return tieBreak(seed, state.moves.length, blocks);
    return tieBreak(seed ^ 0x7f4a7c15, state.moves.length, actions);
  }
  if (blocks.length) return tieBreak(seed, state.moves.length, blocks);

  if (difficulty === "medium") {
    const scored = actions.map((action) => ({ action, score: tacticalScore(state, action, seat) }));
    const best = Math.max(...scored.map((entry) => entry.score));
    const nearBest = scored.filter((entry) => entry.score >= best - 2);
    return tieBreak(
      seed ^ 0x51ed270b,
      state.moves.length,
      nearBest.map((entry) => entry.action),
    );
  }

  const memo = new Map<string, number>();
  const scored = actions.map((action) => {
    const result = applyAction(state, seat, action);
    return {
      action,
      score: result.ok ? minimax(result.value, other(seat), seat, 1, memo) : -Infinity,
    };
  });
  const best = Math.max(...scored.map((entry) => entry.score));
  const candidates =
    difficulty === "hard"
      ? scored.filter((entry) => entry.score >= best - 1)
      : scored.filter((entry) => entry.score === best);
  return tieBreak(
    seed,
    state.moves.length,
    candidates.map((entry) => entry.action),
  );
}
