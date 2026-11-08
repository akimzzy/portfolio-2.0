import type { PlayerSeat } from "@portfolio-games/contracts";
import { applyAction, createGame } from "@portfolio-games/reversi";
import type { ReversiState } from "@portfolio-games/reversi";

export type ReversiDiscColor = "dark" | "light";

export function reversiDiscColor(seat: PlayerSeat, darkSeat: PlayerSeat): ReversiDiscColor {
  return seat === darkSeat ? "dark" : "light";
}

export function countReversiDiscs(
  board: readonly (readonly (PlayerSeat | null)[])[],
  darkSeat: PlayerSeat,
): Readonly<{ dark: number; light: number }> {
  let dark = 0;
  let light = 0;
  for (const row of board) {
    for (const seat of row) {
      if (!seat) continue;
      if (reversiDiscColor(seat, darkSeat) === "dark") dark += 1;
      else light += 1;
    }
  }
  return { dark, light };
}

/** Rebuild immediately before the latest uninterrupted run by one seat. A
 * repeated seat means the other player had no legal move, so a newly mounted
 * board must replay every placement in that run to preserve the forced pass. */
export function stateBeforeLatestMoveSequence(state: ReversiState): ReversiState | null {
  if (state.moves.length === 0) return null;

  const latestSeat = state.moves.at(-1)?.seat;
  if (!latestSeat) return null;
  let sequenceStart = state.moves.length - 1;
  while (sequenceStart > 0 && state.moves[sequenceStart - 1]?.seat === latestSeat) {
    sequenceStart -= 1;
  }

  let previous = createGame(state.startingPlayer);
  for (const move of state.moves.slice(0, sequenceStart)) {
    const result = applyAction(previous, move.seat, {
      type: "place-disc",
      row: move.row,
      column: move.column,
    });
    if (!result.ok) return null;
    previous = result.value;
  }
  return previous;
}

export function isHiddenAiMoveCell(
  hideAiUpdate: boolean,
  aiSeat: PlayerSeat | null,
  latestMove: ReversiState["moves"][number] | null,
  row: number,
  column: number,
): boolean {
  return Boolean(
    hideAiUpdate &&
    aiSeat &&
    latestMove?.seat === aiSeat &&
    latestMove.row === row &&
    latestMove.column === column,
  );
}
