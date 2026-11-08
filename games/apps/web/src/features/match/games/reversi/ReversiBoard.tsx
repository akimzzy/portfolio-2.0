import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { applyAction, BOARD_SIZE, discsToFlip, legalMoves } from "@portfolio-games/reversi";
import type { PlaceDiscAction, ReversiState } from "@portfolio-games/reversi";
import type { GameBoardProps } from "../../game-view-types";
import {
  countReversiDiscs,
  isHiddenAiMoveCell,
  reversiDiscColor,
  stateBeforeLatestMoveSequence,
} from "./presentation.js";
type PlayerSeat = "first" | "second";

function parsePlaceAction(value: unknown): PlaceDiscAction | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    !("row" in value) ||
    !("column" in value)
  )
    return null;
  const action = value as { type?: unknown; row?: unknown; column?: unknown };
  return action.type === "place-disc" &&
    Number.isInteger(action.row) &&
    Number.isInteger(action.column) &&
    Number(action.row) >= 0 &&
    Number(action.row) < BOARD_SIZE &&
    Number(action.column) >= 0 &&
    Number(action.column) < BOARD_SIZE
    ? {
        type: "place-disc",
        row: Number(action.row),
        column: Number(action.column),
      }
    : null;
}

type PresentedFlip = Readonly<{
  row: number;
  column: number;
  from: PlayerSeat;
}>;
type FlipPresentation = Readonly<{
  key: string;
  matchId: string | null;
  actionCount: number;
  seat: PlayerSeat;
  row: number;
  column: number;
  flipCount: number;
  inRapidSequence: boolean;
  skippedSeat: PlayerSeat | null;
  state: ReversiState;
  cells: readonly PresentedFlip[];
}>;

const FLIP_STAGGER_MS = 90;
const FLIP_MAX_DELAY_MS = 450;
const FLIP_START_DELAY_MS = 180;
const FLIP_DURATION_MS = 280;
const MOVE_HANDOFF_PAUSE_MS = 360;

function moveKey(
  matchId: string | null,
  actionCount: number,
  seat: PlayerSeat,
  row: number,
  column: number,
) {
  return `${matchId ?? "local"}:${actionCount}:${seat}:${row}:${column}`;
}

function countTrailingMovesForSeat(
  moves: ReversiState["moves"],
  fromIndex: number,
  seat: PlayerSeat,
) {
  let count = 0;
  for (let index = moves.length - 1; index >= Math.max(0, fromIndex); index -= 1) {
    if (moves[index]?.seat !== seat) break;
    count += 1;
  }
  return count;
}

function makePresentation(
  from: ReversiState,
  to: ReversiState,
  matchId: string | null,
  actionCount: number,
  seat: PlayerSeat,
  row: number,
  column: number,
): FlipPresentation {
  const cells = discsToFlip(from.board, seat, row, column)
    .map(([flipRow, flipColumn]) => ({
      row: flipRow,
      column: flipColumn,
      from: from.board[flipRow]?.[flipColumn],
    }))
    .filter((cell): cell is PresentedFlip => cell.from === "first" || cell.from === "second");
  return {
    key: moveKey(matchId, actionCount, seat, row, column),
    matchId,
    actionCount,
    seat,
    row,
    column,
    flipCount: cells.length,
    inRapidSequence: false,
    // Keep this as the pass event caused by this move, rather than a historic
    // skippedSeat that may now have a legal turn again.
    skippedSeat: to.skippedSeat && to.nextPlayer === seat ? to.skippedSeat : null,
    state: to,
    cells,
  };
}

export default function ReversiBoard({
  match,
  controller,
  onMovePresentationChange,
}: GameBoardProps) {
  const state = match.gameState as ReversiState | null;
  const [presentations, setPresentations] = useState<readonly FlipPresentation[]>([]);
  const presentationQueueRef = useRef<readonly FlipPresentation[]>([]);
  const presentationStartedAtRef = useRef<{
    key: string;
    startedAt: number;
  } | null>(null);
  const scheduledStateRef = useRef<ReversiState | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const activePresentation = presentations[0] ?? null;
  const lastMove = state?.moves.at(-1) ?? null;
  const selfSeat = match.players.find((player) => player.isSelf)?.seat ?? null;
  const pending = parsePlaceAction(match.pendingAction?.action);
  const pendingSeat = match.pendingAction?.seat ?? null;
  const pendingResult =
    state && pending && pendingSeat && pendingSeat === selfSeat && state.nextPlayer === pendingSeat
      ? applyAction(state, pendingSeat, pending)
      : null;
  const optimisticState = pendingResult?.ok ? pendingResult.value : null;
  const aiMove = Boolean(lastMove && match.aiReveal && match.aiSeat === lastMove.seat);
  const hideAiUpdate = aiMove && !match.aiRevealStarted;

  useLayoutEffect(() => {
    if (!state) return;
    const replaceQueue = (next: readonly FlipPresentation[]) => {
      presentationQueueRef.current = next;
      if (next.length === 0) presentationStartedAtRef.current = null;
      setPresentations(next);
    };
    const appendPresentation = (next: FlipPresentation) => {
      const queue = presentationQueueRef.current;
      if (queue.some((item) => item.key === next.key)) return;
      if (queue.length > 0) {
        replaceQueue([
          ...queue.map((item) => ({ ...item, inRapidSequence: true })),
          { ...next, inRapidSequence: true },
        ]);
        return;
      }
      replaceQueue([next]);
    };

    if (matchIdRef.current !== match.matchId || !scheduledStateRef.current) {
      matchIdRef.current = match.matchId;
      // A first snapshot may already contain consecutive moves by one seat
      // after a forced pass. Rebuild before the whole run so every placement
      // and flip is shown in order, including the opening move.
      const previous = match.status === "active" ? stateBeforeLatestMoveSequence(state) : null;
      scheduledStateRef.current = previous ?? state;
      replaceQueue([]);
      onMovePresentationChange?.(null);
    }

    let scheduled = scheduledStateRef.current;
    let scheduledCount = scheduled?.moves.length ?? 0;

    // Roll back an optimistic placement if the authoritative state rejected it.
    if (state.moves.length < scheduledCount) {
      const stillPending = Boolean(
        pending &&
        pendingSeat === selfSeat &&
        scheduledCount === state.moves.length + 1 &&
        scheduled?.moves.length === state.moves.length + 1,
      );
      if (!stillPending) {
        scheduled = state;
        scheduledCount = state.moves.length;
        scheduledStateRef.current = state;
        replaceQueue([]);
        onMovePresentationChange?.(null);
      }
    }

    // Show the player's move as soon as it is submitted. This is a visual
    // prediction only; the server remains authoritative and a rejection rolls it back.
    if (
      optimisticState &&
      pending &&
      pendingSeat &&
      pendingSeat === selfSeat &&
      scheduledCount === state.moves.length &&
      scheduled?.nextPlayer === pendingSeat
    ) {
      const result = applyAction(scheduled, pendingSeat, pending);
      if (result.ok) {
        const step = makePresentation(
          scheduled,
          result.value,
          match.matchId,
          state.moves.length + 1,
          pendingSeat,
          pending.row,
          pending.column,
        );
        appendPresentation(step);
        scheduled = result.value;
        scheduledCount = result.value.moves.length;
        scheduledStateRef.current = scheduled;
      }
    }

    // A server snapshot can contain more than one move if React batches the
    // player's move and a fast reply. Replay the move log in order instead of
    // jumping straight to the latest board.
    const hiddenAiMoves =
      hideAiUpdate && match.aiSeat && lastMove?.seat === match.aiSeat
        ? countTrailingMovesForSeat(state.moves, scheduledCount, match.aiSeat)
        : 0;
    const visibleActionCount = Math.max(scheduledCount, state.moves.length - hiddenAiMoves);
    while (scheduled && scheduledCount < visibleActionCount) {
      const move = state.moves[scheduledCount];
      if (!move) break;
      const result = applyAction(scheduled, move.seat, {
        type: "place-disc",
        row: move.row,
        column: move.column,
      });
      if (!result.ok) {
        // The validated server history should always replay. If it doesn't,
        // prefer the authoritative snapshot over a stuck or incorrect preview.
        scheduled = state;
        scheduledStateRef.current = state;
        replaceQueue([]);
        onMovePresentationChange?.(null);
        break;
      }
      const step = makePresentation(
        scheduled,
        result.value,
        match.matchId,
        scheduledCount + 1,
        move.seat,
        move.row,
        move.column,
      );
      appendPresentation(step);
      scheduled = result.value;
      scheduledCount = result.value.moves.length;
    }

    scheduledStateRef.current = scheduled;
  }, [
    state,
    match.actionCount,
    match.matchId,
    match.status,
    match.aiSeat,
    match.aiReveal,
    match.aiRevealStarted,
    hideAiUpdate,
    lastMove,
    optimisticState,
    pending,
    pendingSeat,
    selfSeat,
    onMovePresentationChange,
  ]);

  useLayoutEffect(() => {
    onMovePresentationChange?.(
      activePresentation
        ? {
            key: activePresentation.key,
            matchId: activePresentation.matchId,
            actionCount: activePresentation.actionCount,
            seat: activePresentation.seat,
            row: activePresentation.row,
            column: activePresentation.column,
            flipCount: activePresentation.flipCount,
            inRapidSequence: activePresentation.inRapidSequence,
            skippedSeat: activePresentation.skippedSeat,
          }
        : null,
    );
  }, [activePresentation, onMovePresentationChange]);

  useEffect(() => {
    if (!activePresentation) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (presentationStartedAtRef.current?.key !== activePresentation.key) {
      presentationStartedAtRef.current = {
        key: activePresentation.key,
        startedAt: performance.now(),
      };
    }
    const lastDelay = Math.min(
      Math.max(0, activePresentation.cells.length - 1) * FLIP_STAGGER_MS,
      FLIP_MAX_DELAY_MS,
    );
    const handoffPause = presentationQueueRef.current.length > 1 ? MOVE_HANDOFF_PAUSE_MS : 0;
    const totalDuration = reducedMotion
      ? 180
      : FLIP_START_DELAY_MS + lastDelay + FLIP_DURATION_MS + 60 + handoffPause;
    const elapsed = performance.now() - presentationStartedAtRef.current.startedAt;
    const clearAfter = Math.max(0, totalDuration - elapsed);
    const activeKey = activePresentation.key;
    const timer = window.setTimeout(() => {
      if (presentationQueueRef.current[0]?.key !== activeKey) return;
      const next = presentationQueueRef.current.slice(1);
      presentationQueueRef.current = next;
      if (next.length === 0) presentationStartedAtRef.current = null;
      setPresentations(next);
    }, clearAfter);
    return () => window.clearTimeout(timer);
  }, [activePresentation, presentations.length]);

  const displayState =
    activePresentation?.state ?? optimisticState ?? scheduledStateRef.current ?? state;
  const displayedMove = activePresentation
    ? {
        seat: activePresentation.seat,
        row: activePresentation.row,
        column: activePresentation.column,
      }
    : (displayState?.moves.at(-1) ?? null);
  const presentationBlocked = Boolean(
    activePresentation || presentations.length > 0 || pending || hideAiUpdate,
  );
  const legal = new Set(
    displayState && match.canPlay && !presentationBlocked && match.outcome === null
      ? legalMoves(displayState, displayState.nextPlayer ?? "first").map(
          (move) => `${move.row}-${move.column}`,
        )
      : [],
  );
  const darkSeat = displayState?.startingPlayer ?? state?.startingPlayer;
  const counts = displayState && darkSeat ? countReversiDiscs(displayState.board, darkSeat) : null;
  const passState = activePresentation ? activePresentation.state : state;
  const skippedSeat = activePresentation ? activePresentation.skippedSeat : passState?.skippedSeat;
  const passNotice = Boolean(!hideAiUpdate && skippedSeat && passState?.outcome === null);
  const passMessage = (() => {
    if (activePresentation && skippedSeat) {
      return selfSeat === skippedSeat
        ? "No legal move. Your turn is skipped."
        : "Your opponent has no legal move. Play again.";
    }
    if (!passState?.skippedSeat) return "";
    if (passState.skippedSeat === passState.nextPlayer) {
      return selfSeat === passState.skippedSeat
        ? "No legal move earlier. You can play now."
        : "Your opponent had no legal move. Play again.";
    }
    return selfSeat === passState.skippedSeat
      ? "No legal move. Your turn is skipped."
      : "Your opponent has no legal move. Play again.";
  })();

  if (!state || !displayState) {
    return (
      <div className="board-wrap" role="status">
        Loading game board…
      </div>
    );
  }

  return (
    <div className="reversi-board-wrap">
      {counts && (
        <div className="reversi-score" aria-label={`Dark ${counts.dark}, light ${counts.light}`}>
          <span>
            <i className="reversi-score-disc is-dark" aria-hidden="true" />
            Dark <strong>{counts.dark}</strong>
          </span>
          <span>
            <i className="reversi-score-disc is-light" aria-hidden="true" />
            Light <strong>{counts.light}</strong>
          </span>
        </div>
      )}
      <div className="reversi-coordinate-frame">
        <div className="reversi-column-coordinates" aria-hidden="true">
          {Array.from({ length: BOARD_SIZE }, (_, index) => (
            <span key={index}>{String.fromCharCode(65 + index)}</span>
          ))}
        </div>
        <div className="reversi-row-coordinates" aria-hidden="true">
          {Array.from({ length: BOARD_SIZE }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <div
          className="reversi-board"
          role="grid"
          aria-label="Reversi board, columns A through H and rows 1 through 8"
        >
          {displayState.board.map((row, rowIndex) => (
            <div className="reversi-row" role="row" key={rowIndex}>
              {row.map((seat, columnIndex) => {
                const canPlace = legal.has(`${rowIndex}-${columnIndex}`);
                const isLast =
                  displayedMove?.row === rowIndex && displayedMove.column === columnIndex;
                const hiddenAi = isHiddenAiMoveCell(
                  hideAiUpdate,
                  match.aiSeat,
                  lastMove,
                  rowIndex,
                  columnIndex,
                );
                const pendingMove =
                  !optimisticState && pending?.row === rowIndex && pending.column === columnIndex;
                const placed =
                  activePresentation?.row === rowIndex && activePresentation.column === columnIndex;
                const flipping = activePresentation?.cells.find(
                  (cell) => cell.row === rowIndex && cell.column === columnIndex,
                );
                const owner = hiddenAi ? null : seat;
                const discColor = owner && darkSeat ? reversiDiscColor(owner, darkSeat) : null;
                const label = discColor
                  ? `${discColor === "dark" ? "Dark" : "Light"} disc`
                  : canPlace
                    ? "Legal move"
                    : "Empty";
                return (
                  <div role="gridcell" className="reversi-grid-cell" key={columnIndex}>
                    <button
                      className={`reversi-square${discColor ? ` is-${discColor}` : ""}${canPlace ? " is-legal" : ""}${isLast && !hiddenAi ? " is-last-move" : ""}${pendingMove ? " is-pending" : ""}${hiddenAi ? " is-ai-hidden" : ""}${placed ? " is-placed" : ""}${flipping ? " is-flipping" : ""}`}
                      type="button"
                      data-row={rowIndex}
                      data-column={columnIndex}
                      data-flip-from={
                        flipping && darkSeat ? reversiDiscColor(flipping.from, darkSeat) : undefined
                      }
                      style={
                        flipping
                          ? ({
                              "--flip-delay": `${FLIP_START_DELAY_MS + Math.min((activePresentation?.cells.indexOf(flipping) ?? 0) * FLIP_STAGGER_MS, FLIP_MAX_DELAY_MS)}ms`,
                            } as CSSProperties & { "--flip-delay": string })
                          : undefined
                      }
                      aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}: ${label}${canPlace ? ", place disc" : ""}`}
                      disabled={
                        !canPlace || !match.canPlay || presentationBlocked || match.outcome !== null
                      }
                      onClick={() =>
                        controller.playAction({
                          type: "place-disc",
                          row: rowIndex,
                          column: columnIndex,
                        })
                      }
                    >
                      <span className="reversi-disc" aria-hidden="true" />
                      {canPlace && <span className="reversi-legal-dot" aria-hidden="true" />}
                      {pendingMove && <span className="reversi-pending-disc" aria-hidden="true" />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {passNotice && (
        <p className="reversi-pass-notice" role="status">
          {passMessage}
        </p>
      )}
    </div>
  );
}
