import type { GameBoardView } from "./game-view-types";
import ConnectFourBoard from "./games/connect-four/ConnectFourBoard";
import ReversiBoard from "./games/reversi/ReversiBoard";
import TicTacToeBoard from "./games/tic-tac-toe/TicTacToeBoard";
import { clientGames } from "../../games/registry";

/** UI renderers are client-only and registered separately from game rules. */
export const gameViews: Readonly<Record<string, GameBoardView>> = Object.freeze({
  "connect-four": ConnectFourBoard,
  reversi: ReversiBoard,
  "tic-tac-toe": TicTacToeBoard,
});

for (const game of clientGames.entries) {
  if (!gameViews[game.gameId])
    throw new Error(`No browser view registered for game: ${game.gameId}`);
}
