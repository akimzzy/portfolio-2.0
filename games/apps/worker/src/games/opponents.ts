import type { PlayerSeat } from '@portfolio-games/contracts';
import { chooseConnectFourMoveForVersion, CONNECT_FOUR_AI_ENGINE_VERSION, supportsConnectFourAiEngineVersion } from '@portfolio-games/connect-four/ai';
import { CONNECT_FOUR_OPPONENTS, isConnectFourOpponentId } from '@portfolio-games/connect-four/opponents';
import { chooseReversiMove, REVERSI_AI_ENGINE_VERSION } from '@portfolio-games/reversi/ai';
import { REVERSI_OPPONENTS, isReversiOpponentId } from '@portfolio-games/reversi/opponents';

export type WorkerOpponentProvider = Readonly<{
  gameId: string;
  currentEngineVersion: number;
  defaultProfileId: string;
  profileIds: readonly string[];
  supportsEngineVersion(engineVersion: number): boolean;
  supportsProfile(profileId: unknown): profileId is string;
  chooseAction(state: unknown, seat: PlayerSeat, profileId: string, seed: number, engineVersion: number): unknown;
}>;

/** Server-only strategy adapters, indexed by game so the match engine stays generic. */
const providers: readonly WorkerOpponentProvider[] = Object.freeze([
  Object.freeze({
    gameId: 'connect-four',
    currentEngineVersion: CONNECT_FOUR_AI_ENGINE_VERSION,
    defaultProfileId: 'standard',
    profileIds: CONNECT_FOUR_OPPONENTS.map((profile) => profile.id),
    supportsEngineVersion: supportsConnectFourAiEngineVersion,
    supportsProfile: isConnectFourOpponentId,
    chooseAction(state: unknown, seat: PlayerSeat, profileId: string, seed: number, engineVersion: number) {
      if (!isConnectFourOpponentId(profileId)) throw new RangeError('Unsupported Connect Four opponent profile.');
      const column = chooseConnectFourMoveForVersion(state as import('@portfolio-games/connect-four').ConnectFourState, seat, profileId, seed, engineVersion);
      return { type: 'drop-token', column };
    },
  }),
  Object.freeze({
    gameId: 'reversi',
    currentEngineVersion: REVERSI_AI_ENGINE_VERSION,
    defaultProfileId: 'standard',
    profileIds: REVERSI_OPPONENTS.map((profile) => profile.id),
    supportsEngineVersion: (engineVersion: number) => engineVersion === REVERSI_AI_ENGINE_VERSION,
    supportsProfile: isReversiOpponentId,
    chooseAction(state: unknown, seat: PlayerSeat, profileId: string, seed: number) {
      if (!isReversiOpponentId(profileId)) throw new RangeError('Unsupported Reversi opponent profile.');
      return chooseReversiMove(state as import('@portfolio-games/reversi').ReversiState, seat, profileId, seed);
    },
  }),
]);

export function opponentProviderForGame(gameId: string): WorkerOpponentProvider | null {
  return providers.find((provider) => provider.gameId === gameId) ?? null;
}

export function opponentProviderForVersion(gameId: string, engineVersion: number): WorkerOpponentProvider | null {
  const provider = opponentProviderForGame(gameId);
  return provider?.supportsEngineVersion(engineVersion) ? provider : null;
}
