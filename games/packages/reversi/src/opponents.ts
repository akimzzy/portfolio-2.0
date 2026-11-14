/** Legacy profiles remain available to matches created by earlier engine versions. */
export const REVERSI_OPPONENTS = Object.freeze([
  Object.freeze({ id: "standard", name: "Standard", style: "Balanced play" }),
  Object.freeze({ id: "expert", name: "Expert", style: "Plans ahead" }),
  Object.freeze({ id: "defensive", name: "Defensive", style: "Keeps safe positions" }),
  Object.freeze({ id: "aggressive", name: "Aggressive", style: "Pressures the board" }),
] as const);

export type ReversiOpponentId = (typeof REVERSI_OPPONENTS)[number]["id"];

/** Current skill levels are stable per house identity and shared by all games. */
export const REVERSI_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "easy", name: "Easy", style: "" }),
  Object.freeze({ id: "medium", name: "Medium", style: "" }),
  Object.freeze({ id: "hard", name: "Hard", style: "" }),
  Object.freeze({ id: "very-hard", name: "Very hard", style: "" }),
] as const);
export type ReversiDifficulty = (typeof REVERSI_DIFFICULTIES)[number]["id"];

export function isReversiDifficulty(value: unknown): value is ReversiDifficulty {
  return (
    typeof value === "string" && REVERSI_DIFFICULTIES.some((difficulty) => difficulty.id === value)
  );
}

export function isReversiAiProfileId(
  value: unknown,
): value is ReversiOpponentId | ReversiDifficulty {
  return isReversiOpponentId(value) || isReversiDifficulty(value);
}

export function isReversiOpponentId(value: unknown): value is ReversiOpponentId {
  return typeof value === "string" && REVERSI_OPPONENTS.some((opponent) => opponent.id === value);
}
