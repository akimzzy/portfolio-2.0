/** Legacy profiles remain available to matches created by earlier engine versions. */
export const CONNECT_FOUR_OPPONENTS = Object.freeze([
  Object.freeze({ id: "standard", name: "Standard", style: "Balanced play" }),
  Object.freeze({ id: "expert", name: "Expert", style: "Looks several moves ahead" }),
  Object.freeze({ id: "defensive", name: "Defensive", style: "Protects against threats" }),
  Object.freeze({ id: "aggressive", name: "Aggressive", style: "Builds attacking pressure" }),
] as const);

export type ConnectFourOpponentId = (typeof CONNECT_FOUR_OPPONENTS)[number]["id"];

/** Current skill levels are stable per house identity and shared by all games. */
export const CONNECT_FOUR_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "easy", name: "Easy", style: "" }),
  Object.freeze({ id: "medium", name: "Medium", style: "" }),
  Object.freeze({ id: "hard", name: "Hard", style: "" }),
  Object.freeze({ id: "very-hard", name: "Very hard", style: "" }),
] as const);
export type ConnectFourDifficulty = (typeof CONNECT_FOUR_DIFFICULTIES)[number]["id"];

export function isConnectFourDifficulty(value: unknown): value is ConnectFourDifficulty {
  return (
    typeof value === "string" &&
    CONNECT_FOUR_DIFFICULTIES.some((difficulty) => difficulty.id === value)
  );
}

export function isConnectFourAiProfileId(
  value: unknown,
): value is ConnectFourOpponentId | ConnectFourDifficulty {
  return isConnectFourOpponentId(value) || isConnectFourDifficulty(value);
}

export function isConnectFourOpponentId(value: unknown): value is ConnectFourOpponentId {
  return (
    typeof value === "string" && CONNECT_FOUR_OPPONENTS.some((opponent) => opponent.id === value)
  );
}
