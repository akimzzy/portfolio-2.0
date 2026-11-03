const AI_MOVE_DELAY_MIN_MS = 1_000;
const AI_MOVE_DELAY_MODE_MS = 3_000;
const AI_MOVE_DELAY_MAX_MS = 10_000;
const AI_MOVE_DELAY_MODE_QUANTILE = (AI_MOVE_DELAY_MODE_MS - AI_MOVE_DELAY_MIN_MS) /
  (AI_MOVE_DELAY_MAX_MS - AI_MOVE_DELAY_MIN_MS);

/**
 * Client-only pacing keeps server work unchanged. A triangular distribution
 * makes delays near 3s common and the 1s/10s extremes uncommon.
 */
export function aiMoveDelay(random: () => number = Math.random): number {
  const value = random();
  const safeValue = Number.isFinite(value) ? Math.min(0.999999999, Math.max(0, value)) : AI_MOVE_DELAY_MODE_QUANTILE;
  const delay = safeValue < AI_MOVE_DELAY_MODE_QUANTILE
    ? AI_MOVE_DELAY_MIN_MS + Math.sqrt(safeValue * (AI_MOVE_DELAY_MAX_MS - AI_MOVE_DELAY_MIN_MS) * (AI_MOVE_DELAY_MODE_MS - AI_MOVE_DELAY_MIN_MS))
    : AI_MOVE_DELAY_MAX_MS - Math.sqrt((1 - safeValue) * (AI_MOVE_DELAY_MAX_MS - AI_MOVE_DELAY_MIN_MS) * (AI_MOVE_DELAY_MAX_MS - AI_MOVE_DELAY_MODE_MS));
  return Math.round(delay);
}
