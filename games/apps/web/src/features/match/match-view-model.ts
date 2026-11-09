import type {
  PlayerSeat,
  RuntimeTwoPlayerGame,
} from "../../../../../packages/contracts/dist/index.js";
import type { GameDialogView, MatchViewSnapshot, OnlineDialogView } from "./match-view-store.js";
import type { LiveMatch, OnlineMultiplayer, PendingOnlineMove } from "./match-types.js";
import { reversiDiscColor } from "./games/reversi/presentation.js";

type MatchViewModelInput = Readonly<{
  game: RuntimeTwoPlayerGame;
  gameId: string;
  state: unknown;
  round: number;
  wins: Readonly<{ first: number; second: number }>;
  multiplayer: OnlineMultiplayer | null;
  aiPresentation: Readonly<{
    thinking: boolean;
    reveal: boolean;
    revealStarted: boolean;
    delayMs: number;
    turnDeadline: number | null;
  }>;
  isRevealingWin: boolean;
  pendingWinSeat: PlayerSeat | null;
  pendingOnlineMove: PendingOnlineMove | null;
  serverClockOffset: number;
  socialFeedback: MatchViewSnapshot["socialFeedback"];
  activityNotice: MatchViewSnapshot["activityNotice"];
  hasUnreadActivity: boolean;
  dialog: GameDialogView | null;
  dialogReturnValue: string;
  onlineDialog: OnlineDialogView | null;
  playerName: (seat: PlayerSeat | null) => string;
}>;

/** Build the shared match shell snapshot from the selected game's public selectors. */
export function createMatchViewSnapshot(input: MatchViewModelInput): MatchViewSnapshot {
  const {
    game,
    gameId,
    state,
    round,
    wins,
    multiplayer: activeSession,
    aiPresentation,
    isRevealingWin,
    pendingWinSeat,
    pendingOnlineMove,
    serverClockOffset,
    socialFeedback,
    activityNotice,
    hasUnreadActivity,
    dialog,
    dialogReturnValue,
    onlineDialog,
    playerName,
  } = input;
  const match = activeSession?.match ?? null;
  const aiSeatIndex = match?.seatKinds?.findIndex((kind) => kind === "ai") ?? -1;
  const aiSeat: PlayerSeat | null =
    aiSeatIndex === 0 ? "first" : aiSeatIndex === 1 ? "second" : null;
  const isOnline = match !== null;
  const isOnlineSession = activeSession !== null;
  const effectiveGameId = match?.gameId ?? gameId;
  const rulesVersion = match?.rulesVersion ?? game.rulesVersion;
  const runtime = match?.state === null || match?.state === undefined ? state : match.state;
  const inspected = game.inspectState(runtime, rulesVersion);
  const fallback = inspected.ok ? inspected : game.inspectState(state, rulesVersion);
  const gameState = fallback.ok ? fallback.value.state : null;
  const outcome = fallback.ok ? fallback.value.outcome : null;
  const nextPlayer = fallback.ok ? fallback.value.nextPlayer : null;
  const startingPlayer = fallback.ok ? fallback.value.startingPlayer : null;
  const playerColorStarter =
    isOnline &&
    effectiveGameId === "reversi" &&
    (match.status === "waiting" || match.status === "countdown")
      ? null
      : startingPlayer;
  const actionCount = fallback.ok ? fallback.value.actionCount : 0;
  const revealingWin = outcome?.kind === "win" && isRevealingWin;
  const current = outcome?.kind === "win" ? outcome.winner : nextPlayer;
  const activeTurn = outcome ? null : nextPlayer;
  const isRematchStarting = isOnline && match.status === "countdown" && match.rematchCountdown;
  const visibleGameNumber = isOnline
    ? isRematchStarting
      ? 1
      : match.status === "countdown" && match.gameNumber > 0
        ? match.gameNumber + 1
        : Math.max(1, match.gameNumber ?? 1)
    : round;
  const target = isOnline ? match.seriesTarget : null;
  const confirmedWins = isRematchStarting ? { first: 0, second: 0 } : (match?.wins ?? wins);
  const displayedWins =
    aiPresentation.thinking && outcome?.kind === "win" && aiSeat === outcome.winner
      ? { ...confirmedWins, [outcome.winner]: Math.max(0, confirmedWins[outcome.winner] - 1) }
      : confirmedWins;
  let statusText = revealingWin
    ? "Winning line"
    : outcome?.kind === "win"
      ? `${playerName(outcome.winner)} won this game`
      : outcome?.kind === "draw"
        ? "This game ended in a tie"
        : `${playerName(current)} to move`;
  let boardHint = revealingWin
    ? "Follow the winning line."
    : outcome?.kind === "win"
      ? "The winning line is shown on the board."
      : outcome?.kind === "draw"
        ? "No moves left."
        : "Your move.";

  if (match && activeSession) {
    if (match.status === "waiting") {
      statusText = "Waiting for a player";
      boardHint = "";
    } else if (match.status === "countdown") {
      statusText = "Starting";
      boardHint = "Get ready.";
    } else if (match.status === "active" && activeTurn) {
      const otherIndex = activeSession.seat === "first" ? 1 : 0;
      const otherSeat = activeSession.seat === "first" ? "second" : "first";
      if (!activeSession.connected) {
        statusText = "Reconnecting…";
        boardHint = "Reconnecting to the match.";
      } else if (match.awaitingTurnReceipt?.seat === activeSession.seat) {
        statusText = "Syncing your turn…";
        boardHint = "Your turn starts when the board is ready.";
      } else if (match.awaitingTurnReceipt) {
        statusText = "Waiting for update";
        boardHint = `Waiting for ${playerName(match.awaitingTurnReceipt.seat)} to receive the move.`;
      } else if (
        match.connectedSeats &&
        !match.connectedSeats[otherIndex] &&
        activeTurn !== activeSession.seat
      ) {
        statusText = `${playerName(otherSeat)} is offline`;
        boardHint = "Waiting for your opponent to reconnect.";
      } else {
        statusText =
          activeTurn === activeSession.seat ? "Your turn" : `${playerName(activeTurn)}’s turn`;
        boardHint = activeTurn === activeSession.seat ? "Your move." : "Waiting for your opponent.";
      }
    } else if (match.status === "between-games") {
      statusText = "Next game";
      const ownIndex = activeSession.seat === "first" ? 0 : 1;
      const otherIndex = ownIndex === 0 ? 1 : 0;
      const otherSeat = activeSession.seat === "first" ? "second" : "first";
      boardHint = !match.connectedSeats?.[otherIndex]
        ? `Waiting for ${playerName(otherSeat)} to reconnect.`
        : match.nextReady?.[ownIndex]
          ? `You’re ready. Waiting for ${playerName(otherSeat)}.`
          : match.nextReady?.[otherIndex]
            ? `${playerName(otherSeat)} is ready. Choose Next game or wait.`
            : "Choose Next game to start now.";
    } else if (match.status === "completed") {
      statusText = match.seriesWinner
        ? `${playerName(match.seriesWinner)} wins the series`
        : "Series complete";
      boardHint = match.closedSeats?.some(Boolean)
        ? "Player left. Start a new game to play again."
        : "Choose Rematch to play again.";
    } else if (match.status === "cancelled") {
      statusText = "Game cancelled";
      boardHint = "No result was recorded.";
    } else if (match.status === "expired") {
      statusText = "This game link has expired";
      boardHint = "Return to games to start or join another match.";
    }
  } else if (isOnlineSession) {
    statusText = "Joining game…";
    boardHint = "Connecting to game…";
  }
  if (pendingOnlineMove && match?.status === "active") {
    statusText = "Move sent";
    boardHint = "Confirming move…";
  }
  if (
    aiPresentation.thinking &&
    activeSession?.connected &&
    match &&
    ["active", "between-games", "completed"].includes(match.status)
  ) {
    statusText = aiSeat ? `${playerName(aiSeat)}’s turn` : "Opponent’s turn";
    boardHint = "Waiting for your opponent.";
  }

  const players = (["first", "second"] as const).map((seat) => {
    const name = playerName(seat);
    const reversiColor = playerColorStarter ? reversiDiscColor(seat, playerColorStarter) : null;
    const seatLabel = isOnline
      ? match.connectedSeats?.[seat === "first" ? 0 : 1]
        ? effectiveGameId === "reversi"
          ? reversiColor
            ? `${reversiColor === "dark" ? "Dark" : "Light"} · ${seat === playerColorStarter ? "Goes first" : "Goes second"}`
            : seat === "first"
              ? "Player 1"
              : "Player 2"
          : startingPlayer
            ? seat === startingPlayer
              ? "Goes first"
              : "Goes second"
            : seat === "first"
              ? "Player 1"
              : "Player 2"
        : seat === activeSession?.seat
          ? "Reconnecting…"
          : match.status === "waiting" && seat === "second"
            ? "Waiting for player"
            : "Offline"
      : seat === startingPlayer
        ? "Goes first"
        : "Goes second";
    const pendingWin = revealingWin && pendingWinSeat === seat ? 1 : 0;
    return {
      seat,
      name: isOnline && seat === activeSession?.seat && name !== "You" ? `${name} · You` : name,
      isSelf: isOnline && seat === activeSession?.seat,
      seatLabel,
      score: Math.max(0, (displayedWins[seat] ?? 0) - pendingWin),
      active: aiPresentation.thinking
        ? seat === aiSeat && !outcome
        : isOnline
          ? match.status === "active" && !outcome && nextPlayer === seat
          : !outcome && nextPlayer === seat,
      winner: isOnline
        ? Boolean(!aiPresentation.thinking && !isRematchStarting && match.seriesWinner === seat)
        : Boolean(!revealingWin && outcome?.kind === "win" && outcome.winner === seat),
    };
  });
  const statusCopy: Record<LiveMatch["status"], string> = {
    waiting: "Waiting for a player",
    countdown: "Starting",
    "between-games": "Between games",
    active: "In progress",
    completed: "Series complete",
    cancelled: "Cancelled",
    expired: "Expired",
  };
  const detailStatus = isOnline
    ? match.status === "active" && activeTurn
      ? `${playerName(activeTurn)} to move`
      : (statusCopy[match.status] ?? "Connecting")
    : outcome?.kind === "draw"
      ? "Tied"
      : outcome?.kind === "win"
        ? `${playerName(outcome.winner)} won`
        : `${playerName(activeTurn)} to move`;

  return {
    matchId: match?.matchId ?? null,
    status: match?.status ?? null,
    hasAiOpponent: aiSeat !== null,
    aiSeat,
    aiThinking: aiPresentation.thinking,
    aiReveal: aiPresentation.reveal,
    aiRevealStarted: aiPresentation.revealStarted,
    aiThinkDelayMs: aiPresentation.delayMs,
    gameId: effectiveGameId,
    rulesVersion,
    gameState,
    actionCount,
    nextPlayer,
    outcome,
    statusText,
    boardHint,
    canPlay:
      !aiPresentation.thinking &&
      !pendingOnlineMove &&
      !outcome &&
      Boolean(activeTurn) &&
      (activeSession
        ? Boolean(
            match &&
            activeSession.connected &&
            match.status === "active" &&
            !match.awaitingTurnReceipt &&
            activeTurn === activeSession.seat,
          )
        : true),
    pendingAction: pendingOnlineMove
      ? { action: pendingOnlineMove.action, seat: pendingOnlineMove.seat }
      : null,
    reactionsVisible: Boolean(isOnlineSession && match?.status === "active"),
    canReact: Boolean(
      isOnlineSession &&
      activeSession?.connected &&
      match?.connectedSeats?.every(Boolean) &&
      match?.status === "active",
    ),
    socialFeedback,
    activityNotice,
    hasUnreadActivity,
    roundLabel: isOnline
      ? `Game ${visibleGameNumber} · ${target === 1 ? "One game" : `First to ${target}`}`
      : `Game ${round} · ${actionCount} ${actionCount === 1 ? "move" : "moves"}`,
    players,
    detail: {
      format: isOnline
        ? target === 1
          ? "One game"
          : `First to win ${target} games`
        : "Local practice",
      game: `Game ${visibleGameNumber}`,
      room: isOnline
        ? match.visibility === "invite"
          ? "Private invite"
          : "Public match"
        : "Local",
      firstName: playerName("first"),
      secondName: playerName("second"),
      firstScore: displayedWins.first ?? 0,
      secondScore: displayedWins.second ?? 0,
      status: detailStatus,
    },
    turnCountdown:
      aiPresentation.thinking && aiPresentation.turnDeadline !== null
        ? { deadline: aiPresentation.turnDeadline, clockOffset: 0 }
        : isOnline && match.status === "active" && typeof match.turnDeadline === "number"
          ? { deadline: match.turnDeadline, clockOffset: serverClockOffset }
          : null,
    turnReceipt:
      isOnline && match.status === "active" && match.awaitingTurnReceipt
        ? { ...match.awaitingTurnReceipt, clockOffset: serverClockOffset }
        : null,
    startCountdown:
      isOnline && match.status === "countdown" && typeof match.countdownAt === "number"
        ? { deadline: match.countdownAt, clockOffset: serverClockOffset }
        : null,
    dialog,
    dialogReturnValue,
    onlineDialog,
  };
}
