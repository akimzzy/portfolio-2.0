import type { PlayerSeat } from "@portfolio-games/contracts";
import {
  chooseConnectFourMoveForVersion,
  CONNECT_FOUR_AI_ENGINE_VERSION,
  supportsConnectFourAiEngineVersion,
} from "@portfolio-games/connect-four/ai";
import {
  isConnectFourDifficulty,
  isConnectFourAiProfileId,
  isConnectFourOpponentId,
} from "@portfolio-games/connect-four/opponents";
import {
  chooseReversiMoveForVersion,
  REVERSI_AI_ENGINE_VERSION,
} from "@portfolio-games/reversi/ai";
import {
  isReversiAiProfileId,
  isReversiDifficulty,
  isReversiOpponentId,
} from "@portfolio-games/reversi/opponents";

export type WorkerOpponentProvider = Readonly<{
  gameId: string;
  currentEngineVersion: number;
  defaultProfileId: string;
  supportsEngineVersion(engineVersion: number): boolean;
  supportsProfile(profileId: unknown): profileId is string;
  profileEngineVersion(profileId: string): number | null;
  chooseAction(
    state: unknown,
    seat: PlayerSeat,
    profileId: string,
    seed: number,
    engineVersion: number,
  ): unknown;
}>;

/** Server-only strategy adapters, indexed by game so the match engine stays generic. */
const providers: readonly WorkerOpponentProvider[] = Object.freeze([
  Object.freeze({
    gameId: "connect-four",
    currentEngineVersion: CONNECT_FOUR_AI_ENGINE_VERSION,
    defaultProfileId: "medium",
    supportsEngineVersion: supportsConnectFourAiEngineVersion,
    supportsProfile: isConnectFourAiProfileId,
    profileEngineVersion(profileId: string) {
      if (isConnectFourDifficulty(profileId)) return CONNECT_FOUR_AI_ENGINE_VERSION;
      return isConnectFourOpponentId(profileId) ? 2 : null;
    },
    chooseAction(
      state: unknown,
      seat: PlayerSeat,
      profileId: string,
      seed: number,
      engineVersion: number,
    ) {
      if (!isConnectFourAiProfileId(profileId))
        throw new RangeError("Unsupported Connect Four opponent profile.");
      const column = chooseConnectFourMoveForVersion(
        state as import("@portfolio-games/connect-four").ConnectFourState,
        seat,
        profileId,
        seed,
        engineVersion,
      );
      return { type: "drop-token", column };
    },
  }),
  Object.freeze({
    gameId: "reversi",
    currentEngineVersion: REVERSI_AI_ENGINE_VERSION,
    defaultProfileId: "medium",
    supportsEngineVersion: (engineVersion: number) =>
      engineVersion === 1 || engineVersion === REVERSI_AI_ENGINE_VERSION,
    supportsProfile: isReversiAiProfileId,
    profileEngineVersion(profileId: string) {
      if (isReversiDifficulty(profileId)) return REVERSI_AI_ENGINE_VERSION;
      return isReversiOpponentId(profileId) ? 1 : null;
    },
    chooseAction(
      state: unknown,
      seat: PlayerSeat,
      profileId: string,
      seed: number,
      engineVersion: number,
    ) {
      if (!isReversiAiProfileId(profileId))
        throw new RangeError("Unsupported Reversi opponent profile.");
      return chooseReversiMoveForVersion(
        state as import("@portfolio-games/reversi").ReversiState,
        seat,
        profileId,
        seed,
        engineVersion,
      );
    },
  }),
]);

export function opponentProviderForGame(gameId: string): WorkerOpponentProvider | null {
  return providers.find((provider) => provider.gameId === gameId) ?? null;
}

export function opponentProviderForVersion(
  gameId: string,
  engineVersion: number,
): WorkerOpponentProvider | null {
  const provider = opponentProviderForGame(gameId);
  return provider?.supportsEngineVersion(engineVersion) ? provider : null;
}
