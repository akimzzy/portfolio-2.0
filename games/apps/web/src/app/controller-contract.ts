import type { MatchReactionId } from "../../../../packages/contracts/dist/index.js";
import type { LobbyMatch } from "../features/lobby/lobby-client";
import type { GameAppStore } from "./game-app-store";

/** The UI-facing actions shared by the app shell and its feature screens. */
export type GameController = Readonly<{
  store: Pick<GameAppStore, "subscribe" | "getSnapshot">;
  start(): void;
  dispose(): void;
  clearLobbyTabFocusRequest(): void;
  setLobbyTab(tab: "matches" | "games" | "leaderboard", focus?: boolean): void;
  openLeaderboard(): void;
  closeLeaderboard(): void;
  createMatch(gameId: string): void;
  playOpponentMatch(
    gameId: string,
    profileId: string,
    inHousePlayerId: string,
    opponentName: string,
    seriesTarget: 1 | 2 | 3,
  ): void;
  joinMatch(match: LobbyMatch): void;
  resumeMatch(): void;
  retryOpenMatch(): void;
  goToGames(): void;
  playOnline(): void;
  newGame(): void;
  toggleSound(): void;
  toggleTheme(): void;
  shareGameLink(): void;
  cancelMatch(): void;
  leaveWaitingMatch(): Promise<void>;
  forfeitMatch(): void;
  retryConnection(): void;
  refreshMatchStatus(): void;
  sendReaction(reactionId: MatchReactionId): boolean;
  sendQuickMessage(value: string): boolean;
  reportSocialFailure(message: string): void;
  markActivityRead(): void;
  submitCreate(): void;
  submitOpponent(): void;
  submitJoin(): Promise<void>;
  retryOnlineDialog(): Promise<void>;
  updateOnlineForm(
    field:
      "name" | "joinAsGuest" | "seriesTarget" | "matchAnySeries" | "visibility" | "optionsExpanded",
    value: string | number | boolean,
  ): void;
  copyInviteLink(): Promise<void>;
  closeOnlineDialog(): void;
  dismissGameDialog(returnValue?: string): void;
  playAction(action: unknown): void;
  gameDialogClosed(returnValue?: string): void;
  gameDialogPrimary(): void;
  gameDialogSecondary(): void;
  onlineDialogClosed(): void;
}>;
