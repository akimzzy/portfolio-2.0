/** Public, non-secret metadata shared by the lobby and the server. */
export const CONNECT_FOUR_OPPONENTS = Object.freeze([
  Object.freeze({ id: "standard", name: "Standard", style: "Balanced play" }),
  Object.freeze({ id: "expert", name: "Expert", style: "Looks several moves ahead" }),
  Object.freeze({ id: "defensive", name: "Defensive", style: "Protects against threats" }),
  Object.freeze({ id: "aggressive", name: "Aggressive", style: "Builds attacking pressure" }),
] as const);

export type ConnectFourOpponentId = (typeof CONNECT_FOUR_OPPONENTS)[number]["id"];

export function isConnectFourOpponentId(value: unknown): value is ConnectFourOpponentId {
  return (
    typeof value === "string" && CONNECT_FOUR_OPPONENTS.some((opponent) => opponent.id === value)
  );
}
