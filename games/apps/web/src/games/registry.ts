import { createGameRegistry } from "@portfolio-games/contracts";
import { connectFourRuntime } from "@portfolio-games/connect-four";
import { reversiRuntime } from "@portfolio-games/reversi";

/** Browser-safe game rules registry; React renderers are registered separately. */
export const clientGames = createGameRegistry([connectFourRuntime, reversiRuntime]);

export const GAME_CATALOG = Object.freeze(
  clientGames.entries.map(({ gameId, title, description, playerCount }) =>
    Object.freeze({
      id: gameId,
      title,
      description,
      playerCount,
    }),
  ),
);

/** Exact per-game compatibility advertised to the service when a player joins. */
export const supportedGameVersions: Readonly<Record<string, readonly number[]>> = Object.freeze(
  Object.fromEntries(clientGames.entries.map((game) => [game.gameId, game.supportedRulesVersions])),
);
