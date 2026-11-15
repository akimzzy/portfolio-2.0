import { useRef, type KeyboardEvent } from "react";
import type { PlayerSeat } from "@portfolio-games/contracts";
import type { PlaceMarkAction, TicTacToeState } from "@portfolio-games/tic-tac-toe";
import type { GameBoardProps } from "../../game-view-types";
import { TicTacToeMark } from "./TicTacToeMark";
import { ticTacToeSymbol } from "./presentation.js";

function parseMarkAction(value: unknown): PlaceMarkAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Record<string, unknown>;
  return action.type === "place-mark" &&
    Number.isInteger(action.row) &&
    Number.isInteger(action.column) &&
    Number(action.row) >= 0 &&
    Number(action.row) < 3 &&
    Number(action.column) >= 0 &&
    Number(action.column) < 3
    ? { type: "place-mark", row: Number(action.row), column: Number(action.column) }
    : null;
}

function winningCells(state: TicTacToeState): ReadonlySet<string> {
  if (state.outcome?.kind !== "win") return new Set();
  const lastMove = state.moves.at(-1);
  if (!lastMove) return new Set();
  const winner = state.outcome.winner;
  const lines: readonly (readonly (readonly [number, number])[])[] = [
    [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    [
      [0, 2],
      [1, 1],
      [2, 0],
    ],
  ];
  const line = lines.find(
    (cells) =>
      cells.some(([row, column]) => row === lastMove.row && column === lastMove.column) &&
      cells.every(([row, column]) => state.board[row]?.[column] === winner),
  );
  return new Set(line?.map(([row, column]) => `${row}-${column}`) ?? []);
}

export default function TicTacToeBoard({ match, controller }: GameBoardProps) {
  const state = match.gameState as TicTacToeState | null;
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const pending = parseMarkAction(match.pendingAction?.action);
  const pendingSeat = match.pendingAction?.seat ?? null;
  const winner = state ? winningCells(state) : new Set<string>();
  const lastMove = state?.moves.at(-1) ?? null;
  const hiddenAiMove = Boolean(
    lastMove && match.aiReveal && match.aiSeat === lastMove.seat && !match.aiRevealStarted,
  );

  if (!state)
    return (
      <div className="board-wrap" role="status">
        Loading game board…
      </div>
    );

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) => {
    const offsets: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(2, row + offset[0]));
    const nextColumn = Math.max(0, Math.min(2, column + offset[1]));
    cells.current[nextRow * 3 + nextColumn]?.focus();
  };

  return (
    <div className="tic-tac-toe-board-wrap">
      <div
        className="tic-tac-toe-board"
        id="tic-tac-toe-board"
        role="grid"
        aria-label="Tic-tac-toe board"
        aria-describedby="board-hint"
      >
        {state.board.map((row, rowIndex) => (
          <div className="tic-tac-toe-row" role="row" key={rowIndex}>
            {row.map((seat, columnIndex) => {
              const index = rowIndex * 3 + columnIndex;
              const isPending = pending?.row === rowIndex && pending.column === columnIndex;
              const isLastMove = lastMove?.row === rowIndex && lastMove.column === columnIndex;
              const isHiddenAiCell = isLastMove && hiddenAiMove;
              const visibleSeat = isHiddenAiCell ? null : seat;
              const markSeat: PlayerSeat | null = isPending ? pendingSeat : visibleSeat;
              const symbol = markSeat ? ticTacToeSymbol(markSeat, state.startingPlayer) : null;
              const cellName = markSeat
                ? `Player ${markSeat === "first" ? "1" : "2"} ${symbol}`
                : "Empty";
              return (
                <button
                  className={`tic-tac-toe-cell${markSeat ? ` is-${markSeat}` : ""}${isPending ? " is-pending" : ""}${winner.has(`${rowIndex}-${columnIndex}`) ? " is-winning" : ""}${isLastMove && !isHiddenAiCell ? " is-last-move" : ""}${isLastMove && match.aiRevealStarted && match.aiSeat === lastMove?.seat ? " is-ai-reveal" : ""}`}
                  type="button"
                  role="gridcell"
                  key={index}
                  ref={(element) => {
                    cells.current[index] = element;
                  }}
                  disabled={!match.canPlay || match.outcome !== null || seat !== null || isPending}
                  aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}: ${cellName}`}
                  aria-current={isLastMove && !isHiddenAiCell ? "true" : undefined}
                  onKeyDown={(event) => moveFocus(event, rowIndex, columnIndex)}
                  onClick={() =>
                    controller.playAction({
                      type: "place-mark",
                      row: rowIndex,
                      column: columnIndex,
                    })
                  }
                >
                  {symbol && <TicTacToeMark symbol={symbol} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
