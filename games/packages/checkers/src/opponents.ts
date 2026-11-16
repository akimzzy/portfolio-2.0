export const CHECKERS_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "easy", name: "Easy", style: "" }),
  Object.freeze({ id: "medium", name: "Medium", style: "" }),
  Object.freeze({ id: "hard", name: "Hard", style: "" }),
  Object.freeze({ id: "very-hard", name: "Very hard", style: "" }),
] as const);

export type CheckersDifficulty = (typeof CHECKERS_DIFFICULTIES)[number]["id"];

export function isCheckersDifficulty(value: unknown): value is CheckersDifficulty {
  return typeof value === "string" && CHECKERS_DIFFICULTIES.some((item) => item.id === value);
}
