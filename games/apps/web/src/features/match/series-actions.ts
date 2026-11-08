import type { LiveMatch } from "./match-types.js";

/** A completed series can still be left while both players are in the rematch countdown. */
export function canLeaveSeriesResult(
  match: Pick<LiveMatch, "status" | "rematchCountdown"> | null | undefined,
): boolean {
  return (
    match?.status === "completed" ||
    (match?.status === "countdown" && match.rematchCountdown === true)
  );
}
