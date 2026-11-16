import { CONNECT_FOUR_DIFFICULTIES } from "@portfolio-games/connect-four/opponents";
import { REVERSI_DIFFICULTIES } from "@portfolio-games/reversi/opponents";
import { TIC_TAC_TOE_DIFFICULTIES } from "@portfolio-games/tic-tac-toe/opponents";
import { CHECKERS_DIFFICULTIES } from "@portfolio-games/checkers/opponents";

export type GameOpponentProfile = Readonly<{
  gameId: string;
  id: string;
  name: string;
  style: string;
}>;

/** Browser-safe opponent catalog. The lobby and match chooser use the same registry. */
const profiles: readonly GameOpponentProfile[] = Object.freeze([
  ...CONNECT_FOUR_DIFFICULTIES.map((profile) =>
    Object.freeze({ gameId: "connect-four", ...profile }),
  ),
  ...REVERSI_DIFFICULTIES.map((profile) => Object.freeze({ gameId: "reversi", ...profile })),
  ...TIC_TAC_TOE_DIFFICULTIES.map((profile) =>
    Object.freeze({ gameId: "tic-tac-toe", ...profile }),
  ),
  ...CHECKERS_DIFFICULTIES.map((profile) => Object.freeze({ gameId: "checkers", ...profile })),
]);

export function opponentProfilesForGame(gameId: string): readonly GameOpponentProfile[] {
  return profiles.filter((profile) => profile.gameId === gameId);
}

export function opponentProfilesForLobby(gameFilter: string): readonly GameOpponentProfile[] {
  return gameFilter === "all" ? profiles : opponentProfilesForGame(gameFilter);
}

export function isRegisteredOpponentProfile(gameId: string, profileId: string): boolean {
  return profiles.some((profile) => profile.gameId === gameId && profile.id === profileId);
}
