import { createGameRegistry } from '@portfolio-games/contracts';
import { connectFourRuntime } from '@portfolio-games/connect-four';
import { reversiRuntime } from '@portfolio-games/reversi';

/** Worker-safe rules registry. Do not add UI components or browser APIs here. */
export const workerGames = createGameRegistry([connectFourRuntime, reversiRuntime]);
