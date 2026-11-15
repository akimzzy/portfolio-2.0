export const TIC_TAC_TOE_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "easy", name: "Easy", style: "" }),
  Object.freeze({ id: "medium", name: "Medium", style: "" }),
  Object.freeze({ id: "hard", name: "Hard", style: "" }),
  Object.freeze({ id: "very-hard", name: "Very hard", style: "" }),
] as const);
export type TicTacToeDifficulty = (typeof TIC_TAC_TOE_DIFFICULTIES)[number]["id"];

export function isTicTacToeDifficulty(value: unknown): value is TicTacToeDifficulty {
  return typeof value === "string" && TIC_TAC_TOE_DIFFICULTIES.some((item) => item.id === value);
}
