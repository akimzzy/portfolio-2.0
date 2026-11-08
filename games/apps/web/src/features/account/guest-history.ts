export type GuestGameHistoryEntry = Readonly<{
  completion_id: string;
  game_id: string;
  rules_version: number;
  result: "win" | "loss";
  opponent_name: string;
  wins: number;
  losses: number;
  series_target: number;
  finish_reason: "normal" | "timeout" | "disconnect" | "forfeit";
  completed_at: string;
}>;

export const GUEST_HISTORY_STORAGE_KEY = "games-guest-history:v1";
export const GUEST_HISTORY_LIMIT = 100;
const COMPLETION_ID_PATTERN = /^[A-Za-z0-9_-]{22}:[1-9][0-9]*$/;
const GAME_ID_PATTERN = /^[a-z0-9-]{2,40}$/;
const FINISH_REASONS = new Set(["normal", "timeout", "disconnect", "forfeit"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): GuestGameHistoryEntry | null {
  if (
    !isRecord(value) ||
    typeof value.completion_id !== "string" ||
    !COMPLETION_ID_PATTERN.test(value.completion_id) ||
    typeof value.game_id !== "string" ||
    !GAME_ID_PATTERN.test(value.game_id) ||
    !Number.isSafeInteger(value.rules_version) ||
    Number(value.rules_version) < 1 ||
    (value.result !== "win" && value.result !== "loss") ||
    typeof value.opponent_name !== "string" ||
    value.opponent_name.length < 1 ||
    value.opponent_name.length > 24 ||
    !Number.isSafeInteger(value.wins) ||
    Number(value.wins) < 0 ||
    !Number.isSafeInteger(value.losses) ||
    Number(value.losses) < 0 ||
    ![1, 2, 3].includes(Number(value.series_target)) ||
    typeof value.finish_reason !== "string" ||
    !FINISH_REASONS.has(value.finish_reason) ||
    typeof value.completed_at !== "string" ||
    !Number.isFinite(Date.parse(value.completed_at))
  )
    return null;

  return {
    completion_id: value.completion_id,
    game_id: value.game_id,
    rules_version: Number(value.rules_version),
    result: value.result,
    opponent_name: value.opponent_name,
    wins: Number(value.wins),
    losses: Number(value.losses),
    series_target: Number(value.series_target),
    finish_reason: value.finish_reason as GuestGameHistoryEntry["finish_reason"],
    completed_at: value.completed_at,
  };
}

export function readGuestHistory(): GuestGameHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_HISTORY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const byId = new Map<string, GuestGameHistoryEntry>();
    for (const item of parsed) {
      const entry = parseEntry(item);
      if (entry) byId.set(entry.completion_id, entry);
    }
    return [...byId.values()]
      .sort((left, right) => Date.parse(right.completed_at) - Date.parse(left.completed_at))
      .slice(0, GUEST_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/** Save guest results locally only; these records are explicitly unverified. */
export function saveGuestHistory(entry: GuestGameHistoryEntry): boolean {
  const parsed = parseEntry(entry);
  if (!parsed) return false;
  try {
    const entries = readGuestHistory().filter(
      (item) => item.completion_id !== parsed.completion_id,
    );
    entries.push(parsed);
    entries.sort((left, right) => Date.parse(right.completed_at) - Date.parse(left.completed_at));
    localStorage.setItem(
      GUEST_HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, GUEST_HISTORY_LIMIT)),
    );
    return true;
  } catch {
    return false;
  }
}

export function removeGuestHistory(completionIds: readonly string[]): void {
  if (!completionIds.length) return;
  const remove = new Set(completionIds);
  try {
    const remaining = readGuestHistory().filter((entry) => !remove.has(entry.completion_id));
    localStorage.setItem(GUEST_HISTORY_STORAGE_KEY, JSON.stringify(remaining));
  } catch {
    // Keep the local copy if storage is unavailable; a later import can retry safely.
  }
}
