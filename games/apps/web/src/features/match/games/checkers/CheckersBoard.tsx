import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { PlayerSeat } from "@portfolio-games/contracts";
import {
  applyAction,
  createGame,
  legalMoves,
  type CheckersRulesVersion,
  type CheckersState,
  type MovePieceAction,
  type Position,
} from "@portfolio-games/checkers";
import type { GameBoardProps } from "../../game-view-types";
import { CheckersCrown } from "./CheckersCrown.js";

function positionId(position: Position): string {
  return `${position.row}-${position.column}`;
}

function parseMove(value: unknown): MovePieceAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Record<string, unknown>;
  const validPosition = (position: unknown): position is Position => {
    if (!position || typeof position !== "object") return false;
    const candidate = position as Record<string, unknown>;
    return (
      Number.isInteger(candidate.row) &&
      Number.isInteger(candidate.column) &&
      Number(candidate.row) >= 0 &&
      Number(candidate.row) < 10 &&
      Number(candidate.column) >= 0 &&
      Number(candidate.column) < 10
    );
  };
  return action.type === "move-piece" &&
    validPosition(action.from) &&
    Array.isArray(action.path) &&
    action.path.length > 0 &&
    action.path.every(validPosition)
    ? { type: "move-piece", from: action.from, path: action.path }
    : null;
}

function colorName(seat: PlayerSeat, redSeat: PlayerSeat): "Red" | "White" {
  return seat === redSeat ? "Red" : "White";
}

export default function CheckersBoard({ match, controller }: GameBoardProps) {
  const state = match.gameState as CheckersState | null;
  const [selected, setSelected] = useState<Position | null>(null);
  const [selectedPath, setSelectedPath] = useState<readonly Position[]>([]);
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const squareRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pending = parseMove(match.pendingAction?.action);
  const lastRecordedMove = state?.moves.at(-1) ?? null;
  const previousStateRef = useRef<{
    matchId: string | null;
    gameNumber: number;
    state: CheckersState;
  } | null>(null);
  const aiMovePending = Boolean(
    lastRecordedMove &&
    match.aiReveal &&
    !match.aiRevealStarted &&
    match.aiSeat === lastRecordedMove.seat,
  );
  const previousState = previousStateRef.current;
  let displayState = state;
  if (aiMovePending && state) {
    const isSameGame =
      previousState?.matchId === match.matchId && previousState.gameNumber === match.gameNumber;
    const cachedState =
      isSameGame && previousState.state.moves.length < state.moves.length
        ? previousState.state
        : !isSameGame || state.moves.length === 1
          ? createGame(state.startingPlayer, match.rulesVersion as CheckersRulesVersion)
          : null;
    const unseenMoves = cachedState ? state.moves.slice(cachedState.moves.length, -1) : [];
    if (cachedState && unseenMoves.length <= 1) {
      let beforeAiMove = cachedState;
      for (const move of unseenMoves) {
        const result = applyAction(beforeAiMove, move.seat, {
          type: "move-piece",
          from: move.from,
          path: move.path,
        });
        if (!result.ok) {
          beforeAiMove = state;
          break;
        }
        beforeAiMove = result.value;
      }
      displayState = beforeAiMove;
    }
  }
  const moves = useMemo(() => (displayState ? legalMoves(displayState) : []), [displayState]);
  const selectedMoves = selected
    ? moves.filter((move) => move.from.row === selected.row && move.from.column === selected.column)
    : [];
  const destinationIds = new Set(
    selectedMoves
      .filter((move) => move.path.length > selectedPath.length)
      .filter((move) =>
        selectedPath.every(
          (position, index) => positionId(position) === positionId(move.path[index]!),
        ),
      )
      .map((move) => positionId(move.path[selectedPath.length]!)),
  );
  const selectableIds = new Set(moves.map((move) => positionId(move.from)));
  const captureRequired = moves.some((move) => move.captured.length > 0);
  const lastMove = displayState?.moves.at(-1) ?? null;
  const lastMovePathIds = new Set(
    lastMove?.path.slice(0, -1).map((position) => positionId(position)) ?? [],
  );
  const lastCapturedIds = new Set(lastMove?.captured.map((position) => positionId(position)) ?? []);
  const lastMoveFromId = lastMove ? positionId(lastMove.from) : null;
  const lastMoveTo = lastMove?.path.at(-1) ?? null;
  const lastMoveToId = lastMoveTo ? positionId(lastMoveTo) : null;

  useEffect(() => {
    setSelected(null);
    setSelectedPath([]);
    setInteractionMessage(null);
  }, [match.gameNumber, match.matchId, state?.moves.length]);

  useLayoutEffect(() => {
    const visibleState = aiMovePending ? displayState : state;
    previousStateRef.current = visibleState
      ? { matchId: match.matchId, gameNumber: match.gameNumber, state: visibleState }
      : null;
  }, [aiMovePending, displayState, match.gameNumber, match.matchId, state]);

  if (!state)
    return (
      <div className="checkers-board-wrap" role="status">
        {match.status === "waiting"
          ? "Waiting for an opponent…"
          : match.status === "countdown"
            ? "Game starting…"
            : "Loading game board…"}
      </div>
    );

  const boardState = displayState ?? state;
  const boardSize = boardState.board.length;
  const redSeat = boardState.startingPlayer;
  const redCount = boardState.board.flat().filter((piece) => piece?.seat === redSeat).length;
  const whiteCount = boardState.board
    .flat()
    .filter((piece) => piece && piece.seat !== redSeat).length;
  const canSelect = match.canPlay && !match.outcome && !pending;
  const pendingTo = pending?.path.at(-1) ?? null;
  const selectedTo = selectedPath.at(-1) ?? null;
  const pendingCaptured = pending
    ? pending.path.flatMap((to, index) => {
        const from = index === 0 ? pending.from : pending.path[index - 1]!;
        const rowStep = Math.sign(to.row - from.row);
        const columnStep = Math.sign(to.column - from.column);
        const movingPiece = boardState.board[pending.from.row]?.[pending.from.column];
        for (let distance = 1; distance < Math.abs(to.row - from.row); distance += 1) {
          const candidate = {
            row: from.row + rowStep * distance,
            column: from.column + columnStep * distance,
          };
          const piece = boardState.board[candidate.row]?.[candidate.column];
          if (piece && piece.seat !== movingPiece?.seat) return [candidate];
        }
        return [];
      })
    : [];

  const playCell = (row: number, column: number) => {
    if (!canSelect) return;
    const position = { row, column };
    const id = positionId(position);
    if (destinationIds.has(id) && selected) {
      setInteractionMessage(null);
      const nextPath = [...selectedPath, position];
      const candidates = selectedMoves.filter((move) =>
        nextPath.every((step, index) => positionId(step) === positionId(move.path[index]!)),
      );
      const completed = candidates.find((move) => move.path.length === nextPath.length);
      if (completed) {
        controller.playAction({ type: "move-piece", from: selected, path: completed.path });
        setSelected(null);
        setSelectedPath([]);
      } else {
        setSelectedPath(nextPath);
      }
      return;
    }
    if (selectedPath.length > 0) return;
    if (selectableIds.has(id)) {
      setSelected(position);
      setInteractionMessage(null);
      return;
    }

    const tappedPiece = boardState.board[row]?.[column];
    if (tappedPiece?.seat === boardState.nextPlayer) {
      setSelected(null);
      setInteractionMessage(
        captureRequired ? "You must capture with a marked piece." : "That piece has no legal move.",
      );
    } else if (selected) {
      setSelected(null);
      setInteractionMessage(null);
    }
  };

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) => {
    const offsets: Readonly<Record<string, readonly [number, number]>> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    let nextRow = row + offset[0];
    let nextColumn = column + offset[1];
    while (nextRow >= 0 && nextRow < boardSize && nextColumn >= 0 && nextColumn < boardSize) {
      if ((nextRow + nextColumn) % 2 === 1) {
        squareRefs.current[nextRow * boardSize + nextColumn]?.focus();
        return;
      }
      nextRow += offset[0];
      nextColumn += offset[1];
    }
  };

  return (
    <div className="checkers-board-wrap">
      <div className="checkers-score" aria-label={`Red ${redCount}, White ${whiteCount}`}>
        <span>
          <i className="checkers-score-piece is-red" aria-hidden="true" />
          Red <strong>{redCount}</strong>
        </span>
        <span>
          <i className="checkers-score-piece is-white" aria-hidden="true" />
          White <strong>{whiteCount}</strong>
        </span>
      </div>
      <div
        className="checkers-board"
        role="grid"
        aria-label={`Checkers board, ${boardSize} rows by ${boardSize} columns`}
        style={{ gridTemplateRows: `repeat(${boardSize}, minmax(0, 1fr))` }}
        aria-describedby="board-hint"
      >
        {boardState.board.map((rowCells, row) => (
          <div
            className="checkers-row"
            role="row"
            key={row}
            style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
          >
            {rowCells.map((piece, column) => {
              const position = { row, column };
              const id = positionId(position);
              const playable = (row + column) % 2 === 1;
              const isSelected = selected?.row === row && selected.column === column;
              const isDestination = destinationIds.has(id);
              const isCaptureSource =
                canSelect &&
                captureRequired &&
                !selected &&
                piece?.seat === boardState.nextPlayer &&
                selectableIds.has(id);
              const isPendingSource = pending?.from.row === row && pending.from.column === column;
              const isSelectionSource =
                selectedTo !== null && selected?.row === row && selected.column === column;
              const isSelectionDestination =
                selectedTo?.row === row && selectedTo.column === column;
              const isPendingCapture = pendingCaptured.some(
                (captured) => captured.row === row && captured.column === column,
              );
              const isPendingDestination = pendingTo?.row === row && pendingTo.column === column;
              const isLastMoveOrigin = !pending && id === lastMoveFromId;
              const isLastMovePath = !pending && lastMovePathIds.has(id);
              const isLastCapture = !pending && lastCapturedIds.has(id);
              const isLastMoveDestination = !pending && id === lastMoveToId;
              const isLastMove = isPendingDestination || isLastMoveDestination;
              const sourcePiece = pending
                ? boardState.board[pending.from.row]?.[pending.from.column]
                : null;
              const selectedPiece = selected
                ? boardState.board[selected.row]?.[selected.column]
                : null;
              const movingPiece = sourcePiece ?? selectedPiece;
              const promoted = Boolean(
                movingPiece &&
                !movingPiece.king &&
                row === (movingPiece.seat === redSeat ? 0 : boardSize - 1),
              );
              const shownPiece =
                isPendingSource || isPendingCapture || isSelectionSource
                  ? null
                  : (isPendingDestination || isSelectionDestination) && movingPiece
                    ? { seat: movingPiece.seat, king: movingPiece.king || promoted }
                    : piece;
              const discColor = shownPiece?.seat
                ? shownPiece.seat === redSeat
                  ? "red"
                  : "white"
                : "";
              const label = shownPiece?.seat
                ? `Row ${row + 1}, column ${column + 1}: ${colorName(shownPiece.seat, redSeat)}${shownPiece.king ? " king" : " man"}`
                : `Row ${row + 1}, column ${column + 1}: empty`;
              const lastMoveLabel = isLastMoveOrigin
                ? ", start of last move"
                : isLastMoveDestination
                  ? ", end of last move"
                  : isLastMovePath
                    ? ", part of last move path"
                    : isLastCapture
                      ? ", captured on last move"
                      : "";
              return (
                <button
                  className={`checkers-square${playable ? " is-playable" : ""}${isSelected ? " is-selected" : ""}${isDestination ? " is-destination" : ""}${isCaptureSource ? " is-capture-source" : ""}${isLastMoveOrigin ? " is-last-move-origin" : ""}${isLastMovePath ? " is-last-move-path" : ""}${isLastCapture ? " is-last-capture" : ""}${isLastMove ? " is-last-move" : ""}`}
                  type="button"
                  role="gridcell"
                  key={id}
                  ref={(element) => {
                    squareRefs.current[row * boardSize + column] = element;
                  }}
                  tabIndex={row === 0 && column === 1 ? 0 : -1}
                  aria-label={`${label}${isCaptureSource ? ", can make a required capture" : ""}${isDestination ? ", legal destination" : ""}${lastMoveLabel}`}
                  aria-pressed={isSelected}
                  disabled={!playable || !canSelect}
                  onKeyDown={(event) => moveFocus(event, row, column)}
                  onClick={() => playCell(row, column)}
                >
                  {shownPiece?.seat && (
                    <span
                      className={`checkers-piece is-${discColor}${shownPiece.king ? " is-king" : ""}${isLastMove || isSelectionDestination ? " is-arriving" : ""}${isLastMove && match.aiRevealStarted && match.aiSeat === lastMove?.seat ? " is-ai-reveal" : ""}`}
                      aria-hidden="true"
                    >
                      {shownPiece.king && <CheckersCrown />}
                    </span>
                  )}
                  {isDestination && <span className="checkers-legal-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="checkers-board-hint" id="board-hint" aria-live="polite">
        {selectedPath.length > 0 ? (
          <>
            <span>Choose the next jump to finish the capture.</span>
            <button
              className="checkers-undo"
              type="button"
              onClick={() => setSelectedPath((path) => path.slice(0, -1))}
            >
              Undo last jump
            </button>
          </>
        ) : match.aiThinking ? (
          "Opponent is thinking…"
        ) : match.canPlay && captureRequired && selected ? (
          "Choose a highlighted square to capture."
        ) : interactionMessage ? (
          interactionMessage
        ) : match.canPlay && captureRequired ? (
          "You must capture. Select a marked piece."
        ) : match.canPlay && selected ? (
          "Choose a highlighted square."
        ) : match.canPlay ? (
          "Select a piece, then its destination."
        ) : (
          "Waiting for the next move."
        )}
      </p>
    </div>
  );
}
