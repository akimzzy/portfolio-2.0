import {
  normalizeQuickMessage,
  QUICK_MESSAGE_HISTORY_LIMIT,
} from "../../../../../packages/contracts/dist/index.js";

const STORAGE_KEY = "games-quick-message-history";

export function readQuickMessageHistory(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeQuickMessage)
      .filter((message): message is string => message !== null)
      .slice(0, QUICK_MESSAGE_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function rememberQuickMessage(value: string): string[] {
  const message = normalizeQuickMessage(value);
  if (!message) return readQuickMessageHistory();

  const next = [
    message,
    ...readQuickMessageHistory().filter((saved) => saved.toLowerCase() !== message.toLowerCase()),
  ].slice(0, QUICK_MESSAGE_HISTORY_LIMIT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The composer remains usable when browser storage is disabled or full.
  }
  return next;
}

export function clearQuickMessageHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing is best effort when browser storage is unavailable.
  }
}
