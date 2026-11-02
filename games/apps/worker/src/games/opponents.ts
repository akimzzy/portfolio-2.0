import type { PlayerSeat } from '@portfolio-games/contracts';
import { chooseConnectFourMoveForVersion, CONNECT_FOUR_AI_ENGINE_VERSION, supportsConnectFourAiEngineVersion } from '@portfolio-games/connect-four/ai';
import { isConnectFourOpponentId } from '@portfolio-games/connect-four/opponents';

export type WorkerOpponentProvider = Readonly<{
  gameId: string;
  currentEngineVersion: number;
  defaultProfileId: string;
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
    supportsEngineVersion: supportsConnectFourAiEngineVersion,
    supportsProfile: isConnectFourOpponentId,
    chooseAction(state: unknown, seat: PlayerSeat, profileId: string, seed: number, engineVersion: number) {
      if (!isConnectFourOpponentId(profileId)) throw new RangeError('Unsupported Connect Four opponent profile.');
      const column = chooseConnectFourMoveForVersion(state as import('@portfolio-games/connect-four').ConnectFourState, seat, profileId, seed, engineVersion);
      return { type: 'drop-token', column };
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
