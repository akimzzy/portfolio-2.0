export type TicTacToeSymbol = "X" | "O";

export function TicTacToeMark({ symbol }: { symbol: TicTacToeSymbol }) {
  return symbol === "X" ? (
    <svg className="tic-tac-toe-mark-icon is-x" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12 12 36 36M36 12 12 36" />
    </svg>
  ) : (
    <svg className="tic-tac-toe-mark-icon is-o" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="15" />
    </svg>
  );
}
