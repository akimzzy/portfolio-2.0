import type { PlayerSeat } from "@portfolio-games/contracts";
import { COLUMNS, ROWS } from "@portfolio-games/connect-four";
import { BOARD_SIZE } from "@portfolio-games/reversi";
import { countReversiDiscs, reversiDiscColor } from "../match/games/reversi/presentation.js";

type BoardSnapshot = Readonly<{
  board: readonly (readonly (PlayerSeat | null)[])[];
  startingPlayer: PlayerSeat;
}>;

function parseBoardSnapshot(value: unknown, rows: number, columns: number): BoardSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    (record.startingPlayer !== "first" && record.startingPlayer !== "second") ||
    !Array.isArray(record.board) ||
    record.board.length !== rows ||
    !record.board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === columns &&
        row.every((cell) => cell === null || cell === "first" || cell === "second"),
    )
  )
    return null;
  return {
    board: record.board as readonly (readonly (PlayerSeat | null)[])[],
    startingPlayer: record.startingPlayer,
  };
}

function ConnectFourHistoryBoard({ snapshot }: { snapshot: BoardSnapshot }) {
  return (
    <div className="board-wrap account-history-board">
      <div className="board" role="grid" aria-label="Connect Four final board">
        {snapshot.board.map((row, rowIndex) => (
          <div className="board-row" role="row" key={rowIndex}>
            {row.map((seat, columnIndex) => (
              <div
                className={`board-cell${seat ? ` is-${seat}` : ""}`}
                role="gridcell"
                key={columnIndex}
                aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}: ${seat ? `Player ${seat === "first" ? 1 : 2}` : "Empty"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReversiHistoryBoard({ snapshot }: { snapshot: BoardSnapshot }) {
  const counts = countReversiDiscs(snapshot.board, snapshot.startingPlayer);
  return (
    <div className="reversi-board-wrap account-history-reversi-board">
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
          aria-label="Reversi final board, columns A through H and rows 1 through 8"
        >
          {snapshot.board.map((row, rowIndex) => (
            <div className="reversi-row" role="row" key={rowIndex}>
              {row.map((seat, columnIndex) => {
                const color = seat ? reversiDiscColor(seat, snapshot.startingPlayer) : null;
                return (
                  <div className="reversi-grid-cell" role="gridcell" key={columnIndex}>
                    <div
                      className={`reversi-square${color ? ` is-${color}` : ""}`}
                      aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}: ${color ? `${color} disc` : "Empty"}`}
                    >
                      <span className="reversi-disc" aria-hidden="true" />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HistoryBoard({ gameId, finalState }: { gameId: string; finalState: unknown }) {
  if (gameId === "connect-four") {
    const snapshot = parseBoardSnapshot(finalState, ROWS, COLUMNS);
    if (!snapshot) return <p className="account-history-message">Board data is unavailable.</p>;
    return <ConnectFourHistoryBoard snapshot={snapshot} />;
  }
  if (gameId === "reversi") {
    const snapshot = parseBoardSnapshot(finalState, BOARD_SIZE, BOARD_SIZE);
    return snapshot ? (
      <ReversiHistoryBoard snapshot={snapshot} />
    ) : (
      <p className="account-history-message">Board data is unavailable.</p>
    );
  }
  return <p className="account-history-message">Board data is unavailable.</p>;
}
