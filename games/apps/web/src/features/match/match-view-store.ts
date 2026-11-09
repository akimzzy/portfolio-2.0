import type { MatchReactionId } from "../../../../../packages/contracts/dist/index.js";
import type { PlayerSeat } from "../../../../../packages/contracts/dist/index.js";
import type { LiveMatch } from "./match-types.js";
export type { PlayerSeat } from "../../../../../packages/contracts/dist/index.js";
export type GameDialogView = {
  mode: string;
  mark: string;
  markTone: "first" | "second" | "draw";
  title: string;
  description: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  primaryDanger: boolean;
  secondaryLabel: string | null;
  secondaryDisabled: boolean;
  canDismiss: boolean;
  hasSeriesResult: boolean;
  series: {
    score: string;
    firstName: string;
    firstNeeded: string;
    secondName: string;
    secondNeeded: string;
  } | null;
  countdown: { label: string; deadline: number | null; clockOffset: number } | null;
};
export type OnlineDialogView = {
  mode: "create" | "join" | "opponent" | "retry" | "invite" | "message";
  title: string;
  description: string;
  error: string;
  name: string;
  joinAsGuest: boolean;
  nameInvalid: boolean;
  showRules: boolean;
  rulesSeries: string;
  rulesDetails: string;
  seriesTarget: 1 | 2 | 3;
  matchAnySeries: boolean;
  visibility: "public" | "invite";
  optionsExpanded: boolean;
  inviteLink: string;
  copyLabel: string;
  busy: boolean;
  closeLabel: string;
};
export type MatchViewSnapshot = {
  matchId: string | null;
  status: LiveMatch["status"] | null;
  hasAiOpponent: boolean;
  aiSeat: PlayerSeat | null;
  aiThinking: boolean;
  aiReveal: boolean;
  aiRevealStarted: boolean;
  aiThinkDelayMs: number;
  gameId: string;
  rulesVersion: number;
  gameState: unknown;
  actionCount: number;
  nextPlayer: PlayerSeat | null;
  outcome: { kind: "win"; winner: PlayerSeat } | { kind: "draw" } | null;
  statusText: string;
  boardHint: string;
  canPlay: boolean;
  pendingAction: { action: unknown; seat: PlayerSeat } | null;
  reactionsVisible: boolean;
  canReact: boolean;
  socialFeedback: { id: number; kind: "error"; message: string } | null;
  activityNotice:
    | { eventId: string; seat: PlayerSeat; kind: "reaction"; reactionId: MatchReactionId }
    | { eventId: string; seat: PlayerSeat; kind: "message"; message: string }
    | null;
  hasUnreadActivity: boolean;
  roundLabel: string;
  players: readonly {
    seat: PlayerSeat;
    name: string;
    isSelf: boolean;
    seatLabel: string;
    score: number;
    active: boolean;
    winner: boolean;
  }[];
  detail: {
    format: string;
    game: string;
    room: string;
    firstName: string;
    secondName: string;
    firstScore: number;
    secondScore: number;
    status: string;
  };
  turnCountdown: { deadline: number; clockOffset: number } | null;
  turnReceipt: { seat: PlayerSeat; deadline: number; clockOffset: number } | null;
  startCountdown: { deadline: number; clockOffset: number } | null;
  dialog: GameDialogView | null;
  dialogReturnValue: string;
  onlineDialog: OnlineDialogView | null;
};

const EMPTY_SNAPSHOT: MatchViewSnapshot = {
  matchId: null,
  status: null,
  hasAiOpponent: false,
  aiSeat: null,
  aiThinking: false,
  aiReveal: false,
  aiRevealStarted: false,
  aiThinkDelayMs: 0,
  gameId: "connect-four",
  rulesVersion: 2,
  gameState: null,
  actionCount: 0,
  nextPlayer: "first",
  outcome: null,
  statusText: "Player 1 to move",
  boardHint: "Choose a column.",
  canPlay: true,
  pendingAction: null,
  reactionsVisible: false,
  canReact: false,
  socialFeedback: null,
  activityNotice: null,
  hasUnreadActivity: false,
  roundLabel: "Game 1 · 0 moves",
  players: [
    {
      seat: "first",
      name: "Player 1",
      isSelf: false,
      seatLabel: "Goes first",
      score: 0,
      active: true,
      winner: false,
    },
    {
      seat: "second",
      name: "Player 2",
      isSelf: false,
      seatLabel: "Goes second",
      score: 0,
      active: false,
      winner: false,
    },
  ],
  detail: {
    format: "Local practice",
    game: "Game 1",
    room: "Local",
    firstName: "Player 1",
    secondName: "Player 2",
    firstScore: 0,
    secondScore: 0,
    status: "Player 1 to move",
  },
  turnCountdown: null,
  turnReceipt: null,
  startCountdown: null,
  dialog: null,
  dialogReturnValue: "",
  onlineDialog: null,
};

let snapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

export function subscribeMatchView(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMatchViewSnapshot() {
  return snapshot;
}

export function publishMatchView(next: MatchViewSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}
