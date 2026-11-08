import { GAME_CATALOG } from "../../games/registry";
import type { GameHistoryEntry } from "./account-session";

export function historyGameTitle(gameId: string): string {
  return GAME_CATALOG.find((game) => game.id === gameId)?.title ?? gameId;
}

export function historyFinishReasonLabel(reason: GameHistoryEntry["finish_reason"]): string | null {
  switch (reason) {
    case "timeout":
      return "Timed out";
    case "disconnect":
      return "Connection lost";
    case "forfeit":
      return "Forfeit";
    default:
      return null;
  }
}

export function historyRankingLabel(status: GameHistoryEntry["ranking_status"]): string | null {
  switch (status) {
    case "ranked":
      return "Ranked";
    case "unranked_rematch":
      return "Rematch";
    case "unranked_pair_cap":
      return "Daily limit";
    case "unranked_privacy":
      return "Private";
    case "unranked_guest":
      return "Unranked";
    case "unranked_legacy":
      return "Pre-ranking";
    default:
      return null;
  }
}
