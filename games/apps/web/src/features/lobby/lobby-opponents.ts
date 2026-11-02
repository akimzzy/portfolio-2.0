export const MAX_IN_HOUSE_MATCH_COUNT = 10;
const MIN_IN_HOUSE_MATCH_COUNT = 4;

/** Keep human rooms first, then provide enough in-house choices to avoid an empty lobby. */
export function inHouseMatchCount(humanMatchCount: number, hasOpponentProvider: boolean): number {
  if (!hasOpponentProvider) return 0;
  if (!Number.isSafeInteger(humanMatchCount) || humanMatchCount < 0) return MIN_IN_HOUSE_MATCH_COUNT;
  return Math.min(MAX_IN_HOUSE_MATCH_COUNT, Math.max(MIN_IN_HOUSE_MATCH_COUNT, MAX_IN_HOUSE_MATCH_COUNT - humanMatchCount));
}
