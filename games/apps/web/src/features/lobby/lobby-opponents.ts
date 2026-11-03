export const MAX_IN_HOUSE_MATCH_COUNT = 10;
export const MIN_IN_HOUSE_MATCH_COUNT = 4;

/** Pick the initial in-house offer count; live offers can later expire naturally. */
export function randomInHouseOfferCount(random: () => number = Math.random): number {
  const value = random();
  const safeValue = Number.isFinite(value) ? Math.min(0.999999999, Math.max(0, value)) : 0.5;
  return MIN_IN_HOUSE_MATCH_COUNT + Math.floor(safeValue * (MAX_IN_HOUSE_MATCH_COUNT - MIN_IN_HOUSE_MATCH_COUNT + 1));
}

/** Refill a single offer only when the live roster drops below its soft floor. */
export function inHouseRefillCount(currentCount: number): number {
  return Number.isFinite(currentCount) && currentCount >= 0 && currentCount < MIN_IN_HOUSE_MATCH_COUNT ? 1 : 0;
}

export function shuffled<T>(values: readonly T[], random: () => number = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const draw = random();
    const safeDraw = Number.isFinite(draw) ? Math.min(0.999999999, Math.max(0, draw)) : 0.5;
    const other = Math.floor(safeDraw * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
