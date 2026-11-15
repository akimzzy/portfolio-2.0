import type { PlayerSeat } from "@portfolio-games/contracts";

export function ticTacToeSymbol(seat: PlayerSeat, startingPlayer: PlayerSeat): "X" | "O" {
  return seat === startingPlayer ? "X" : "O";
}
