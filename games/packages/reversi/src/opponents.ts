/** Public opponent styles are shared by the lobby and match creation UI. */
export const REVERSI_OPPONENTS = Object.freeze([
  Object.freeze({ id: "standard", name: "Standard", style: "Balanced play" }),
  Object.freeze({ id: "expert", name: "Expert", style: "Plans ahead" }),
  Object.freeze({ id: "defensive", name: "Defensive", style: "Keeps safe positions" }),
  Object.freeze({ id: "aggressive", name: "Aggressive", style: "Pressures the board" }),
] as const);

export type ReversiOpponentId = (typeof REVERSI_OPPONENTS)[number]["id"];

export function isReversiOpponentId(value: unknown): value is ReversiOpponentId {
  return typeof value === "string" && REVERSI_OPPONENTS.some((opponent) => opponent.id === value);
}
