import { CONNECT_FOUR_OPPONENTS } from '@portfolio-games/connect-four/opponents';

export type GameOpponentProfile = Readonly<{
  gameId: string;
  id: string;
  name: string;
  style: string;
}>;

/** Browser-safe opponent catalog. The lobby and match chooser use the same registry. */
const profiles: readonly GameOpponentProfile[] = Object.freeze(
  CONNECT_FOUR_OPPONENTS.map((profile) => Object.freeze({ gameId: 'connect-four', ...profile })),
);

export function opponentProfilesForGame(gameId: string): readonly GameOpponentProfile[] {
  return profiles.filter((profile) => profile.gameId === gameId);
}

export function opponentProfilesForLobby(gameFilter: string): readonly GameOpponentProfile[] {
  return gameFilter === 'all' ? profiles : opponentProfilesForGame(gameFilter);
}

export function isRegisteredOpponentProfile(gameId: string, profileId: string): boolean {
  return profiles.some((profile) => profile.gameId === gameId && profile.id === profileId);
}
