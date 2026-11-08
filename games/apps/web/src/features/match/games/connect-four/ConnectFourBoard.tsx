import { useEffect, useRef, type CSSProperties } from "react";
import { COLUMNS } from "@portfolio-games/connect-four";
import type { ConnectFourState, DropTokenAction } from "@portfolio-games/connect-four";
import type { GameBoardProps } from "../../game-view-types";

function winningSequence(state: ConnectFourState) {
  if (state.outcome?.kind !== "win") return [];
  const column = state.moves.at(-1);
  if (column === undefined) return [];
  const row = state.board.findIndex((cells) => cells[column] !== null);
  const winner = state.outcome.winner;
  if (row < 0 || state.board[row]?.[column] !== winner) return [];
  const directions: readonly (readonly [number, number])[] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [rowStep, columnStep] of directions) {
    const collect = (direction: -1 | 1) => {
      const cells: { row: number; column: number }[] = [];
      for (let distance = 1; distance <= 3; distance += 1) {
        const candidateRow = row + rowStep * distance * direction;
        const candidateColumn = column + columnStep * distance * direction;
        if (
          candidateRow < 0 ||
          candidateRow >= state.board.length ||
          candidateColumn < 0 ||
          candidateColumn >= COLUMNS ||
          state.board[candidateRow]?.[candidateColumn] !== winner
        )
          break;
        cells.push({ row: candidateRow, column: candidateColumn });
      }
      return cells;
    };
    const before = collect(-1).reverse();
    const line = [...before, { row, column }, ...collect(1)];
    if (line.length >= 4) {
      const start = Math.max(0, Math.min(before.length - 3, line.length - 4));
      return line.slice(start, start + 4);
    }
  }
  return [];
}

function parseColumnAction(value: unknown): DropTokenAction | null {
  if (typeof value !== "object" || value === null || !("type" in value) || !("column" in value))
    return null;
  const action = value as { type?: unknown; column?: unknown };
  return action.type === "drop-token" &&
    Number.isInteger(action.column) &&
    Number(action.column) >= 0 &&
    Number(action.column) < COLUMNS
    ? { type: "drop-token", column: Number(action.column) }
    : null;
}

export default function ConnectFourBoard({ match, controller }: GameBoardProps) {
  const state = match.gameState as ConnectFourState;
  const previousCount = useRef(match.actionCount);
  const pendingAction = parseColumnAction(match.pendingAction?.action);
  const winningSteps = new Map(
    (state && !match.aiThinking ? winningSequence(state) : []).map((cell, index) => [
      `${cell.row}-${cell.column}`,
      index + 1,
    ]),
  );
  const lastColumn = state?.moves.at(-1) ?? -1;
  const lastRow =
    state && lastColumn >= 0 ? state.board.findIndex((cells) => cells[lastColumn] !== null) : -1;
  let pendingRow = -1;
  if (state && pendingAction) {
    pendingRow = state.board.length - 1;
    while (pendingRow >= 0 && state.board[pendingRow]?.[pendingAction.column] !== null)
      pendingRow -= 1;
  }

  useEffect(() => {
    if (match.actionCount <= previousCount.current) {
      previousCount.current = match.actionCount;
      return;
    }
    if (!state || lastColumn < 0 || lastRow < 0) return;
    const aiTokenReveal = match.aiReveal && match.aiSeat === state.board[lastRow]?.[lastColumn];
    if (aiTokenReveal && !match.aiRevealStarted) return;
    previousCount.current = match.actionCount;
    const cell = document.querySelector<HTMLElement>(
      `.board-cell[data-row="${lastRow}"][data-column="${lastColumn}"]`,
    );
    const launch = document.querySelector<HTMLElement>(
      `.column-button[data-column="${lastColumn}"]`,
    );
    if (!cell || !launch || typeof cell.animate !== "function") return;
    const distance = Math.max(
      0,
      cell.getBoundingClientRect().top - launch.getBoundingClientRect().bottom,
    );
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = cell.animate(
      reducedMotion
        ? [{ opacity: 0.7 }, { opacity: 1 }]
        : [
            { transform: `translateY(-${distance}px)`, opacity: 0.86 },
            { transform: "translateY(0)", opacity: 1 },
          ],
      {
        duration: reducedMotion ? 120 : 240,
        easing: "cubic-bezier(.16, 1, .3, 1)",
        fill: aiTokenReveal ? "both" : "none",
      },
    );
    animation.onfinish = () => {
      if (!aiTokenReveal) animation.cancel();
    };
    return () => animation.cancel();
  }, [
    match.actionCount,
    lastColumn,
    lastRow,
    state,
    match.aiReveal,
    match.aiSeat,
    match.aiRevealStarted,
  ]);

  if (typeof match.gameState !== "object" || match.gameState === null)
    return (
      <div className="board-wrap" role="status">
        Loading game board…
      </div>
    );
  return (
    <div
      className="board-wrap"
      onKeyDown={(event) => {
        if (!/^[1-7]$/.test(event.key) || event.defaultPrevented) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable || target.matches("input, textarea, select, button, a"))
        )
          return;
        event.preventDefault();
        controller.playAction({ type: "drop-token", column: Number(event.key) - 1 });
      }}
    >
      <div
        className="column-controls"
        id="column-controls"
        role="group"
        aria-label="Choose a column"
      >
        {Array.from({ length: COLUMNS }, (_, column) => (
          <button
            className="column-button"
            type="button"
            key={column}
            data-column={column}
            disabled={!match.canPlay || match.outcome !== null || state.board[0]?.[column] !== null}
            aria-label={`Drop token in column ${column + 1}`}
            onClick={() => controller.playAction({ type: "drop-token", column })}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 8 5 5 5-5" />
            </svg>
          </button>
        ))}
      </div>
      <div className="board" id="board" role="table" aria-label="Connect Four board" tabIndex={-1}>
        {state.board.map((row, rowIndex) => (
          <div className="board-row" role="row" key={rowIndex}>
            {row.map((seat, columnIndex) => {
              const step = winningSteps.get(`${rowIndex}-${columnIndex}`);
              const isLastMove = rowIndex === lastRow && lastColumn === columnIndex;
              const isAiMove = isLastMove && match.aiReveal && match.aiSeat === seat;
              const isAiMovePending = isAiMove && !match.aiRevealStarted;
              const visibleSeat = isAiMovePending ? null : seat;
              const isPendingMove =
                pendingRow === rowIndex && pendingAction?.column === columnIndex;
              const pendingSeat = isPendingMove ? match.pendingAction?.seat : null;
              return (
                <div
                  className={`board-cell${visibleSeat ? ` is-${visibleSeat}` : ""}${isPendingMove ? ` is-pending token-${pendingSeat}` : ""}${step ? " is-winning" : ""}${isLastMove && !isAiMovePending ? " is-last-move" : ""}${isAiMove && match.aiRevealStarted ? " is-ai-reveal" : ""}`}
                  role="cell"
                  key={columnIndex}
                  data-row={rowIndex}
                  data-column={columnIndex}
                  aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}${visibleSeat ? `, ${match.players.find((player) => player.seat === visibleSeat)?.name ?? `Player ${visibleSeat === "first" ? 1 : 2}`}` : isPendingMove ? ", move awaiting confirmation" : ", empty"}${step ? `, winning sequence token ${step} of 4` : ""}`}
                  style={step ? ({ "--win-order": String(step - 1) } as CSSProperties) : undefined}
                >
                  {step && (
                    <span className="winning-step" aria-hidden="true">
                      {step}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
