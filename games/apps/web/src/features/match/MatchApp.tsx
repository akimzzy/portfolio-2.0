import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { getMatchViewSnapshot, subscribeMatchView } from "./match-view-store";
import type { GameController } from "../../app/controller-contract";
import type { GameAppSnapshot } from "../../app/game-app-store";
import {
  MATCH_REACTIONS,
  MAX_QUICK_MESSAGE_CHARS,
  normalizeQuickMessage,
  QUICK_MESSAGE_HISTORY_LIMIT,
} from "../../../../../packages/contracts/dist/index.js";
import {
  clearQuickMessageHistory,
  readQuickMessageHistory,
  rememberQuickMessage,
} from "./quick-message-history";
import { Countdown } from "../../components/Countdown";
import { showDialogWithoutActionFocus } from "../../shared/show-dialog";
import { gameViews } from "./game-views";
import { GameHowToPlay } from "./GameHowToPlay";
import { reversiDiscColor } from "./games/reversi/presentation.js";
import { accountSession } from "../account/account-session";

type ReversiMovePresentation = {
  key: string;
  matchId: string | null;
  actionCount: number;
  seat: "first" | "second";
  row: number;
  column: number;
  flipCount: number;
  inRapidSequence: boolean;
  skippedSeat: "first" | "second" | null;
};

const MOVE_CUE_DURATION_MS = 2600;

function getPlayerStatusLabel(
  match: ReturnType<typeof getMatchViewSnapshot>,
  player: (typeof match.players)[number],
  presentation: ReversiMovePresentation | null = null,
) {
  if (presentation?.skippedSeat) {
    if (player.seat === presentation.skippedSeat) return "No legal move";
    if (player.seat === presentation.seat) return "Plays again";
  }
  if (presentation) return player.seat === presentation.seat ? "Move played" : "Waiting";
  if (match.aiThinking)
    return player.seat === match.aiSeat ? (player.isSelf ? "Your turn" : "Their turn") : "Waiting";
  if (match.turnReceipt?.seat === player.seat) return "Syncing turn";
  const isTurnStatus =
    match.statusText === "Your turn" ||
    match.statusText === "Move sent" ||
    match.statusText.endsWith("’s turn") ||
    match.statusText.endsWith(" to move");

  if (isTurnStatus) {
    if (!player.active) return "Waiting";
    if (match.statusText === "Move sent") return "Move sent";
    if (player.isSelf) return "Your turn";
    return match.statusText.endsWith(" to move") ? "To move" : "Their turn";
  }

  if (player.winner && match.outcome?.kind === "win") return "Won this game";
  return player.seatLabel;
}

export default function MatchApp({
  controller,
  connection,
}: {
  controller: GameController;
  connection: GameAppSnapshot["connection"];
}) {
  const match = useSyncExternalStore(
    subscribeMatchView,
    getMatchViewSnapshot,
    getMatchViewSnapshot,
  );
  const account = useSyncExternalStore(
    accountSession.subscribe,
    accountSession.getSnapshot,
    accountSession.getSnapshot,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"match" | "rules">("match");
  const [onlineGuideKeyOpen, setOnlineGuideKeyOpen] = useState<string | null>(null);
  const [movePresentation, setMovePresentation] = useState<ReversiMovePresentation | null>(null);
  const [moveCue, setMoveCue] = useState<ReversiMovePresentation | null>(null);
  const [reviewedResultDialog, setReviewedResultDialog] = useState<NonNullable<
    ReturnType<typeof getMatchViewSnapshot>["dialog"]
  > | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [pendingMessage, setPendingMessage] = useState<{
    id: number;
    text: string;
    previousEventId: string | null;
    previousFeedbackId: number | null;
  } | null>(null);
  const [unconfirmedMessage, setUnconfirmedMessage] = useState<{
    text: string;
    previousEventId: string | null;
    previousFeedbackId: number | null;
  } | null>(null);
  const [chatSendStatus, setChatSendStatus] = useState("");
  const [chatActionError, setChatActionError] = useState("");
  const [messageHistory, setMessageHistory] = useState(readQuickMessageHistory);
  const joinIdentityTouched = useRef(false);
  const previousOnlineDialogMode = useRef(match.onlineDialog?.mode ?? null);
  const messageRequestSequence = useRef(0);
  const closingResultForBoardReview = useRef(false);
  const resultDialogKeyRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const chatDialogRef = useRef<HTMLDialogElement>(null);
  const resultDialogRef = useRef<HTMLDialogElement>(null);
  const boardReviewToggleRef = useRef<HTMLButtonElement>(null);
  const onlineDialogRef = useRef<HTMLDialogElement>(null);
  const moveCueClearTimer = useRef<number | null>(null);
  const GameBoard = gameViews[match.gameId];
  const reversiStarter =
    match.gameId === "reversi" &&
    match.status !== "waiting" &&
    match.status !== "countdown" &&
    typeof match.gameState === "object" &&
    match.gameState !== null &&
    "startingPlayer" in match.gameState &&
    (match.gameState.startingPlayer === "first" || match.gameState.startingPlayer === "second")
      ? match.gameState.startingPlayer
      : null;
  const optionsExpanded = match.onlineDialog?.optionsExpanded ?? false;
  const onlineDialogMode = match.onlineDialog?.mode ?? null;
  const supportsIdentityChoice =
    onlineDialogMode === "create" || onlineDialogMode === "join" || onlineDialogMode === "opponent";
  const onlineDialogKey = match.onlineDialog ? `${match.gameId}:${onlineDialogMode}` : null;
  const onlineGuideOpen = onlineDialogKey !== null && onlineGuideKeyOpen === onlineDialogKey;
  const chatLength = Array.from(chatText.normalize("NFC").replace(/\s+/gu, " ").trim()).length;
  const canReviewResultBoard = Boolean(
    match.dialog &&
    ["local-result", "online-between", "online-complete"].includes(match.dialog.mode),
  );
  const resultBoardReview = Boolean(
    reviewedResultDialog && reviewedResultDialog === match.dialog && canReviewResultBoard,
  );
  const boardReviewDialog = resultBoardReview ? match.dialog : null;

  useEffect(() => {
    if (supportsIdentityChoice && previousOnlineDialogMode.current !== onlineDialogMode)
      joinIdentityTouched.current = false;
    previousOnlineDialogMode.current = onlineDialogMode;
  }, [onlineDialogMode, supportsIdentityChoice]);

  useEffect(() => {
    if (
      supportsIdentityChoice &&
      account.status === "signed-in" &&
      !joinIdentityTouched.current &&
      match.onlineDialog?.joinAsGuest
    )
      controller.updateOnlineForm("joinAsGuest", false);
  }, [
    account.status,
    controller,
    match.onlineDialog?.joinAsGuest,
    onlineDialogMode,
    supportsIdentityChoice,
  ]);
  const onMovePresentationChange = useCallback((presentation: ReversiMovePresentation | null) => {
    setMovePresentation(presentation);
    if (moveCueClearTimer.current !== null) window.clearTimeout(moveCueClearTimer.current);
    if (presentation) {
      setMoveCue(presentation.flipCount > 1 || presentation.inRapidSequence ? presentation : null);
    } else {
      moveCueClearTimer.current = window.setTimeout(() => {
        moveCueClearTimer.current = null;
        setMoveCue(null);
      }, MOVE_CUE_DURATION_MS);
    }
  }, []);
  const isMovePresentationActive = Boolean(
    match.gameId === "reversi" &&
    movePresentation &&
    movePresentation.matchId === match.matchId &&
    movePresentation.actionCount <= match.actionCount + (match.pendingAction ? 1 : 0),
  );
  const presentationSeat = isMovePresentationActive ? (movePresentation?.seat ?? null) : null;
  const activeMovePresentation = isMovePresentationActive ? movePresentation : null;
  const selfSeat = match.players.find((player) => player.isSelf)?.seat;
  const movePresentationHint =
    match.gameId === "reversi" && moveCue?.matchId === match.matchId
      ? `${moveCue.seat === selfSeat ? "You" : "Opponent"} played ${String.fromCharCode(65 + moveCue.column)}${moveCue.row + 1} · flipped ${moveCue.flipCount} ${moveCue.flipCount === 1 ? "disc" : "discs"}.`
      : null;
  const routineReversiHint =
    match.gameId === "reversi" &&
    ["Your move.", "Waiting for your opponent."].includes(match.boardHint);
  const boardStatusHint = routineReversiHint
    ? (movePresentationHint ?? "")
    : match.boardHint || movePresentationHint || "";
  useEffect(() => {
    if (moveCue?.matchId === match.matchId) return;
    if (moveCueClearTimer.current !== null) window.clearTimeout(moveCueClearTimer.current);
    moveCueClearTimer.current = null;
    setMoveCue(null);
    return () => {
      if (moveCueClearTimer.current !== null) window.clearTimeout(moveCueClearTimer.current);
    };
  }, [match.matchId, moveCue?.matchId]);
  useEffect(
    () => () => {
      if (moveCueClearTimer.current !== null) window.clearTimeout(moveCueClearTimer.current);
    },
    [],
  );
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (detailsOpen && !dialog.open) showDialogWithoutActionFocus(dialog);
    else if (!detailsOpen && dialog.open) dialog.close();
  }, [detailsOpen]);

  useEffect(() => {
    const dialog = chatDialogRef.current;
    if (!dialog) return;
    if (chatOpen && !dialog.open) {
      const mobile = window.matchMedia(
        "(max-width: 700px), (orientation: landscape) and (max-height: 520px)",
      ).matches;
      showDialogWithoutActionFocus(dialog, mobile);
    } else if (!chatOpen && dialog.open) dialog.close();
  }, [chatOpen]);

  useEffect(() => {
    const notice = match.activityNotice;
    if (
      !pendingMessage ||
      notice?.kind !== "message" ||
      notice.message !== pendingMessage.text ||
      notice.eventId === pendingMessage.previousEventId
    )
      return;
    const self = match.players.find((player) => player.isSelf);
    if (!self || notice.seat !== self.seat) return;
    // This effect reconciles local input state with an authoritative pushed match event.
    setChatText((current) => (current === pendingMessage.text ? "" : current));
    setPendingMessage(null);
    setUnconfirmedMessage(null);
    setChatActionError("");
    setChatSendStatus("Sent");
  }, [match.activityNotice, match.players, pendingMessage]);

  useEffect(() => {
    if (
      !pendingMessage ||
      !match.socialFeedback ||
      match.socialFeedback.id === pendingMessage.previousFeedbackId
    )
      return;
    // Server rejection is delivered through the external match snapshot subscription.
    setPendingMessage(null);
    setChatSendStatus("");
    setChatActionError(match.socialFeedback.message);
  }, [match.socialFeedback, pendingMessage]);

  useEffect(() => {
    if (!pendingMessage) return;
    const timedOutMessage = pendingMessage;
    const timer = window.setTimeout(() => {
      setPendingMessage((current) => (current?.id === timedOutMessage.id ? null : current));
      setUnconfirmedMessage({
        text: timedOutMessage.text,
        previousEventId: timedOutMessage.previousEventId,
        previousFeedbackId: timedOutMessage.previousFeedbackId,
      });
      setChatSendStatus((current) => (current === "Sending…" ? "" : current));
      setChatActionError("No confirmation received. Check your connection before retrying.");
      controller.reportSocialFailure("Message not confirmed. Check your connection.");
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [pendingMessage, controller]);

  useEffect(() => {
    const notice = match.activityNotice;
    if (
      !unconfirmedMessage ||
      notice?.kind !== "message" ||
      notice.message !== unconfirmedMessage.text ||
      notice.eventId === unconfirmedMessage.previousEventId
    )
      return;
    const self = match.players.find((player) => player.isSelf);
    if (!self || notice.seat !== self.seat) return;
    // A late authoritative event confirms this message after the local retry window.
    setChatText((current) => (current === unconfirmedMessage.text ? "" : current));
    setUnconfirmedMessage(null);
    setChatActionError("");
    setChatSendStatus("Sent");
  }, [match.activityNotice, match.players, unconfirmedMessage]);

  useEffect(() => {
    if (
      !unconfirmedMessage ||
      !match.socialFeedback ||
      match.socialFeedback.id === unconfirmedMessage.previousFeedbackId
    )
      return;
    // Clear the local retry state when the external match store reports rejection.
    setUnconfirmedMessage(null);
    setChatSendStatus("");
    setChatActionError(match.socialFeedback.message);
  }, [match.socialFeedback, unconfirmedMessage]);

  function sendTypedMessage(value: string): boolean {
    const message = normalizeQuickMessage(value);
    if (!message || pendingMessage) {
      if (!message && chatLength > MAX_QUICK_MESSAGE_CHARS)
        setChatActionError(`Keep your message to ${MAX_QUICK_MESSAGE_CHARS} characters or fewer.`);
      return false;
    }
    if (!controller.sendQuickMessage(message)) {
      setChatActionError(
        getMatchViewSnapshot().socialFeedback?.message ?? "Message not sent. Try again.",
      );
      return false;
    }
    setMessageHistory(rememberQuickMessage(message));
    setUnconfirmedMessage(null);
    setChatActionError("");
    setChatText(message);
    setPendingMessage({
      id: ++messageRequestSequence.current,
      text: message,
      previousEventId: match.activityNotice?.eventId ?? null,
      previousFeedbackId: match.socialFeedback?.id ?? null,
    });
    setChatSendStatus("Sending…");
    return true;
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendTypedMessage(chatText)) closeChat();
  }

  function sendSavedMessage(message: string) {
    if (sendTypedMessage(message)) closeChat();
  }

  function sendChatReaction(reactionId: (typeof MATCH_REACTIONS)[number]["id"]) {
    if (controller.sendReaction(reactionId)) closeChat();
    else
      setChatActionError(
        getMatchViewSnapshot().socialFeedback?.message ?? "Reaction not sent. Try again.",
      );
  }

  function closeChat() {
    setChatOpen(false);
  }

  useEffect(() => {
    const dialog = resultDialogRef.current;
    if (!dialog) return;
    if (boardReviewDialog) {
      if (dialog.open) {
        closingResultForBoardReview.current = true;
        dialog.close("board-review");
      }
      return;
    }
    const resultDialogKey = match.dialog ? `${match.dialog.mode}:${match.dialog.title}` : null;
    if (match.dialog && !dialog.open) {
      showDialogWithoutActionFocus(dialog);
    } else if (match.dialog && dialog.open && resultDialogKeyRef.current !== resultDialogKey) {
      // Result dialogs can transition in place (for example, a forfeit
      // confirmation becoming the round result). Keep focus off the new action.
      dialog.focus({ preventScroll: true });
    } else if (!match.dialog && dialog.open) dialog.close(match.dialogReturnValue);
    resultDialogKeyRef.current = resultDialogKey;
  }, [match.dialog, match.dialogReturnValue, boardReviewDialog]);

  useEffect(() => {
    const dialog = onlineDialogRef.current;
    if (!dialog) return;
    if (match.onlineDialog && !dialog.open) {
      showDialogWithoutActionFocus(dialog);
    } else if (!match.onlineDialog && dialog.open) dialog.close();
  }, [match.onlineDialog]);

  return (
    <>
      <section className="match-status-bar" aria-label="Match status and players">
        <div
          className={`connection-notice${connection.connected ? " is-connected" : ""}${connection.visible ? "" : " is-local"}${connection.shareVisible || connection.cancelVisible || connection.leaveVisible ? " is-waiting-room" : ""}`}
        >
          {connection.visible && (
            <div className="connection-copy" aria-live="polite">
              <span id="connection-status">{connection.status}</span>
              {connection.roomExpiry && (
                <span className="room-expiry">
                  Expires in{" "}
                  <Countdown
                    deadline={connection.roomExpiry.deadline}
                    clockOffset={connection.roomExpiry.clockOffset}
                    context={connection.roomExpiry.context}
                    showMinutes
                    onExpire={controller.refreshMatchStatus}
                  />{" "}
                </span>
              )}
              {connection.reconnect && (
                <Countdown
                  deadline={connection.reconnect.deadline}
                  clockOffset={connection.reconnect.clockOffset}
                  context={connection.reconnect.context}
                  urgent={connection.reconnect.urgent === true}
                  onExpire={controller.refreshMatchStatus}
                />
              )}
            </div>
          )}
          <div className="connection-actions">
            <button
              className="round-move-count"
              id="round-move-count"
              type="button"
              aria-label={`Match details: ${match.roundLabel}`}
              aria-haspopup="dialog"
              aria-controls="match-details-dialog"
              onClick={() => {
                setDetailsTab("match");
                setDetailsOpen(true);
              }}
            >
              <span id="round-move-label">Match details</span>
              <svg aria-hidden="true" viewBox="0 0 12 12">
                <path d="m3 4.5 3 3 3-3" />
              </svg>
            </button>
            {connection.shareVisible && (
              <button
                className="share-game-link-button"
                type="button"
                aria-label="Share game link"
                title="Share game link"
                onClick={controller.shareGameLink}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 10v6h12v-6" />
                </svg>
                <span>Share</span>
              </button>
            )}
            {connection.cancelVisible && (
              <button
                className="cancel-room-button"
                type="button"
                aria-label="Cancel waiting room"
                title="Cancel waiting room"
                onClick={controller.cancelMatch}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="7.25" />
                  <path d="m7.5 7.5 5 5m0-5-5 5" />
                </svg>
                <span>Cancel</span>
              </button>
            )}
            {connection.leaveVisible && (
              <button
                className="cancel-room-button"
                type="button"
                aria-label="Leave waiting match"
                title="Leave waiting match"
                disabled={connection.leaveDisabled}
                onClick={controller.leaveWaitingMatch}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="7.25" />
                  <path d="m7.5 7.5 5 5m0-5-5 5" />
                </svg>
                <span>Leave</span>
              </button>
            )}
            {connection.forfeitVisible && (
              <button
                className="forfeit-game-button"
                type="button"
                aria-label="Forfeit game"
                disabled={connection.forfeitDisabled}
                onClick={controller.forfeitMatch}
              >
                Forfeit
              </button>
            )}
            {connection.retryVisible && (
              <button
                className="retry-connection-button"
                type="button"
                onClick={controller.retryConnection}
              >
                Retry connection
              </button>
            )}
          </div>
        </div>
        <section
          className="player-list"
          id="player-list"
          data-game={match.gameId}
          aria-label="Match score"
        >
          {match.players.map((player) => {
            const playerIsActive = isMovePresentationActive
              ? player.seat === presentationSeat
              : player.active;
            return (
              <div
                className={`player-row${playerIsActive ? " is-active" : ""}${player.winner ? " is-winner" : ""}`}
                data-player={player.seat}
                key={player.seat}
              >
                <span
                  className={`player-token token-${player.seat}${reversiStarter ? ` disc-${reversiDiscColor(player.seat, reversiStarter)}` : ""}`}
                  aria-hidden="true"
                >
                  {player.seat === "first" ? "1" : "2"}
                </span>
                <span className="player-copy">
                  <span className="player-name-line">
                    <span className="player-name">{player.name}</span>
                    <span className="player-score" id={`score-${player.seat}`}>
                      {player.score}
                    </span>
                  </span>
                  <span className="player-status-line" aria-live="polite">
                    {getPlayerStatusLabel(match, player, activeMovePresentation)}
                    {!isMovePresentationActive && player.active && match.turnCountdown && (
                      <Countdown
                        deadline={match.turnCountdown.deadline}
                        clockOffset={match.turnCountdown.clockOffset}
                        context="left in this turn"
                        urgent
                        {...(match.aiThinking ? {} : { onExpire: controller.refreshMatchStatus })}
                      />
                    )}
                    {!isMovePresentationActive &&
                      player.active &&
                      match.turnReceipt?.seat === player.seat && (
                        <Countdown
                          deadline={match.turnReceipt.deadline}
                          clockOffset={match.turnReceipt.clockOffset}
                          context="to receive the move"
                        />
                      )}
                  </span>
                </span>
              </div>
            );
          })}
        </section>
        {(connection.visible || match.reactionsVisible) && (
          <div className="match-activity-row" aria-live="polite" aria-atomic="true">
            {(["first", "second"] as const).map((seat) => {
              const notice = match.activityNotice?.seat === seat ? match.activityNotice : null;
              const reaction =
                notice?.kind === "reaction"
                  ? MATCH_REACTIONS.find((item) => item.id === notice.reactionId)
                  : null;
              const playerName =
                match.players.find((player) => player.seat === seat)?.name ??
                `Player ${seat === "first" ? 1 : 2}`;
              return (
                <span className={`match-activity-side side-${seat}`} key={seat}>
                  {notice && (
                    <span
                      className={`activity-bubble token-${seat}${notice.kind === "message" ? " is-message" : " is-reaction"}`}
                      key={notice.eventId}
                    >
                      <span className="sr-only">
                        {notice.kind === "reaction"
                          ? `${playerName} reacted: ${reaction?.label ?? "reaction"}`
                          : `${playerName}: ${notice.message}`}
                      </span>
                      <span aria-hidden="true">
                        {notice.kind === "reaction" ? reaction?.symbol : notice.message}
                      </span>
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </section>

      <section
        className={`game-layout${boardReviewDialog ? " is-board-review" : ""}`}
        aria-label={`${match.gameId} game`}
      >
        <div className="board-section">
          {boardReviewDialog ? (
            <div className="board-info-row board-review-heading">
              <strong className="board-review-title">{boardReviewDialog.title}</strong>
              {boardReviewDialog.countdown && (
                <span className="board-review-countdown">
                  <span>{boardReviewDialog.countdown.label}</span>
                  {boardReviewDialog.countdown.deadline !== null && (
                    <Countdown
                      deadline={boardReviewDialog.countdown.deadline}
                      clockOffset={boardReviewDialog.countdown.clockOffset}
                      context="until the next game starts"
                      onExpire={controller.refreshMatchStatus}
                    />
                  )}
                </span>
              )}
              <button
                className="result-board-toggle"
                type="button"
                ref={boardReviewToggleRef}
                onClick={() => setReviewedResultDialog(null)}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M5 8l5 5 5-5" />
                </svg>
                Show result
              </button>
            </div>
          ) : (
            <div className="board-info-row">
              <div className="board-info-copy">
                <div
                  className={`board-status-hint${movePresentationHint && boardStatusHint === movePresentationHint ? " is-move-cue" : ""}`}
                  id="board-hint"
                  aria-live="polite"
                >
                  {boardStatusHint}
                </div>
                {match.startCountdown && (
                  <Countdown
                    deadline={match.startCountdown.deadline}
                    clockOffset={match.startCountdown.clockOffset}
                    context="until the game starts"
                    onExpire={controller.refreshMatchStatus}
                  />
                )}
              </div>
            </div>
          )}
          {(boardReviewDialog || match.gameId === "reversi") && (
            <div className="board-review-action-slot" aria-hidden={!boardReviewDialog}>
              {boardReviewDialog && (
                <>
                  <div
                    className="dialog-actions board-review-actions"
                    role="group"
                    aria-label="Choose what to do next"
                  >
                    {boardReviewDialog.secondaryLabel && (
                      <button
                        className="dialog-secondary"
                        type="button"
                        disabled={boardReviewDialog.secondaryDisabled}
                        onClick={controller.gameDialogSecondary}
                      >
                        {boardReviewDialog.secondaryLabel}
                      </button>
                    )}
                    <button
                      className={`dialog-primary${boardReviewDialog.primaryDanger ? " dialog-danger" : ""}`}
                      type="button"
                      disabled={boardReviewDialog.primaryDisabled}
                      onClick={controller.gameDialogPrimary}
                    >
                      {boardReviewDialog.primaryLabel}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {GameBoard ? (
            <GameBoard
              match={match}
              controller={controller}
              {...(match.gameId === "reversi" ? { onMovePresentationChange } : {})}
            />
          ) : (
            <div className="board-wrap" role="status">
              This game is not available in this build.
            </div>
          )}
          {(connection.visible || match.matchId !== null || match.reactionsVisible) && (
            <div
              className={`social-dock${match.reactionsVisible ? "" : " is-unavailable"}`}
              role="group"
              aria-label="Quick reactions and chat"
              aria-hidden={!match.reactionsVisible}
            >
              <div className="quick-reactions">
                {[
                  MATCH_REACTIONS[0],
                  MATCH_REACTIONS[1],
                  MATCH_REACTIONS[3],
                  MATCH_REACTIONS[4],
                  MATCH_REACTIONS[5],
                ].map((reaction) => (
                  <button
                    className="quick-reaction"
                    key={reaction.id}
                    type="button"
                    disabled={!match.canReact}
                    aria-label={`React: ${reaction.label}`}
                    title={reaction.label}
                    onClick={() => controller.sendReaction(reaction.id)}
                  >
                    {reaction.symbol}
                  </button>
                ))}
              </div>
              <button
                className={`chat-open-button${match.hasUnreadActivity ? " has-unread" : ""}`}
                type="button"
                disabled={!match.canReact}
                aria-label={
                  match.hasUnreadActivity
                    ? "Open chat and all reactions. New message received."
                    : "Open chat and all reactions"
                }
                onClick={() => {
                  controller.markActivityRead();
                  setChatOpen(true);
                }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z" />
                </svg>
                <span>Chat</span>
                {match.hasUnreadActivity && <i className="chat-unread-dot" aria-hidden="true" />}
              </button>
            </div>
          )}
          {(connection.visible || match.matchId !== null || match.socialFeedback) && (
            <p
              className="social-feedback"
              role={match.socialFeedback ? "status" : undefined}
              aria-live={match.socialFeedback ? "polite" : undefined}
              aria-hidden={!match.socialFeedback}
            >
              {match.socialFeedback?.message ?? ""}
            </p>
          )}
        </div>
      </section>

      <dialog
        className="game-dialog chat-dialog"
        id="chat-dialog"
        ref={chatDialogRef}
        aria-labelledby="chat-title"
        aria-describedby="chat-guidance"
        onCancel={(event) => {
          event.preventDefault();
          closeChat();
        }}
        onClose={closeChat}
      >
        <div className="dialog-content chat-content">
          <div className="online-dialog-header">
            <h2 id="chat-title">Reactions & chat</h2>
            <button
              className="dialog-close"
              type="button"
              aria-label="Close chat"
              onClick={closeChat}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
          <div className="chat-reaction-grid" role="group" aria-label="Send a reaction">
            {MATCH_REACTIONS.map((reaction) => (
              <button
                className="chat-reaction"
                key={reaction.id}
                type="button"
                disabled={!match.canReact}
                onClick={() => sendChatReaction(reaction.id)}
              >
                <span>{reaction.symbol}</span>
                <small>{reaction.label}</small>
              </button>
            ))}
          </div>
          {messageHistory.length > 0 && (
            <div className="chat-history-inline" aria-label="Recent messages saved on this device">
              <div className="chat-history-heading">
                <h3>Recent</h3>
                <button
                  type="button"
                  onClick={() => {
                    clearQuickMessageHistory();
                    setMessageHistory([]);
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="chat-history-list">
                {messageHistory.slice(0, QUICK_MESSAGE_HISTORY_LIMIT).map((message) => (
                  <button
                    type="button"
                    key={message}
                    title={`Send: ${message}`}
                    onClick={() => sendSavedMessage(message)}
                  >
                    {message}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form className="chat-composer" onSubmit={submitMessage}>
            <label htmlFor="quick-message-input">Write a message</label>
            <div className="chat-input-row">
              <input
                id="quick-message-input"
                type="text"
                autoComplete="off"
                maxLength={MAX_QUICK_MESSAGE_CHARS * 2}
                value={chatText}
                onChange={(event) => {
                  setChatText(event.currentTarget.value);
                  setChatSendStatus("");
                  setChatActionError("");
                  setUnconfirmedMessage(null);
                }}
                placeholder="Type a short message"
                aria-describedby="chat-guidance"
                disabled={!match.canReact || pendingMessage !== null}
              />
              <button
                className="chat-send-button"
                type="submit"
                disabled={
                  !match.canReact || pendingMessage !== null || !normalizeQuickMessage(chatText)
                }
              >
                {pendingMessage ? "Sending…" : "Send"}
              </button>
            </div>
            {chatSendStatus && (
              <p className="chat-send-status" role="status">
                {chatSendStatus}
              </p>
            )}
            {chatActionError && (
              <p className="chat-send-error" role="status" aria-live="polite">
                {chatActionError}
              </p>
            )}
            {chatLength > MAX_QUICK_MESSAGE_CHARS && (
              <p className="chat-length-warning" role="status">
                {chatLength} characters. Shorten to {MAX_QUICK_MESSAGE_CHARS}.
              </p>
            )}
            <p id="chat-guidance">
              Keep it respectful. Don’t share personal details. Misuse may restrict access.
            </p>
          </form>
        </div>
      </dialog>

      <dialog
        className="game-dialog match-details-dialog"
        id="match-details-dialog"
        ref={dialogRef}
        aria-labelledby="match-details-title"
        onCancel={(event) => {
          event.preventDefault();
          setDetailsOpen(false);
        }}
        onClose={() => setDetailsOpen(false)}
      >
        <div className="dialog-content">
          <div className="online-dialog-header">
            <h2 id="match-details-title">Match details</h2>
            <button
              className="dialog-close"
              type="button"
              aria-label="Close match details"
              onClick={() => setDetailsOpen(false)}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
          <div className="game-guide-tabs" role="group" aria-label="Match information">
            <button
              id="match-info-tab"
              type="button"
              aria-pressed={detailsTab === "match"}
              aria-controls="match-info-panel"
              onClick={() => setDetailsTab("match")}
            >
              Match
            </button>
            <button
              id="match-rules-tab"
              type="button"
              aria-pressed={detailsTab === "rules"}
              aria-controls="match-rules-panel"
              onClick={() => setDetailsTab("rules")}
            >
              How to play
            </button>
          </div>
          <div id="match-info-panel" hidden={detailsTab !== "match"}>
            <dl className="match-details-list">
              <div>
                <dt>Series</dt>
                <dd>{match.detail.format}</dd>
              </div>
              <div>
                <dt>Current game</dt>
                <dd>{match.detail.game}</dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{match.detail.room}</dd>
              </div>
              <div className="match-details-score-row">
                <dt>Games won</dt>
                <dd>
                  <ul className="match-details-players">
                    <li>
                      <span>{match.detail.firstName}</span>
                      <strong>{match.detail.firstScore}</strong>
                    </li>
                    <li>
                      <span>{match.detail.secondName}</span>
                      <strong>{match.detail.secondScore}</strong>
                    </li>
                  </ul>
                </dd>
              </div>
              <div>
                <dt>Now</dt>
                <dd>{match.detail.status}</dd>
              </div>
            </dl>
            <p className="match-details-note">Tied games add no wins and can extend the series.</p>
            {match.hasAiOpponent && (
              <p className="match-details-note">Your opponent is computer-controlled.</p>
            )}
          </div>
          <div id="match-rules-panel" hidden={detailsTab !== "rules"}>
            <GameHowToPlay gameId={match.gameId} />
          </div>
        </div>
      </dialog>

      <dialog
        className={`game-dialog${match.dialog?.hasSeriesResult ? " has-series-result" : ""}`}
        id="game-dialog"
        ref={resultDialogRef}
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        onCancel={(event) => {
          event.preventDefault();
          if (match.dialog?.mode === "online-between" || match.dialog?.mode.startsWith("online-"))
            return;
          controller.dismissGameDialog("");
        }}
        onClose={(event) => {
          if (closingResultForBoardReview.current) {
            closingResultForBoardReview.current = false;
            boardReviewToggleRef.current?.focus({ preventScroll: true });
            return;
          }
          controller.gameDialogClosed((event.currentTarget as HTMLDialogElement).returnValue);
        }}
      >
        {match.dialog && (
          <div className="dialog-content">
            {match.dialog.canDismiss && (
              <button
                className="dialog-close game-dialog-close"
                id="game-dialog-close"
                type="button"
                aria-label="Close round result"
                onClick={() => controller.dismissGameDialog()}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            )}
            <span
              className={`dialog-mark${match.dialog.markTone === "first" ? " token-first" : match.dialog.markTone === "second" ? " token-second" : " is-draw"}`}
              aria-hidden="true"
            >
              {match.dialog.mark}
            </span>
            <h2 id="dialog-title">{match.dialog.title}</h2>
            {canReviewResultBoard && (
              <button
                className="result-board-toggle"
                type="button"
                aria-pressed={resultBoardReview}
                onClick={() =>
                  setReviewedResultDialog((current) =>
                    current === match.dialog ? null : match.dialog,
                  )
                }
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d={resultBoardReview ? "M5 8l5 5 5-5" : "M5 12l5-5 5 5"} />
                </svg>
                {resultBoardReview ? "Show result" : "View board"}
              </button>
            )}
            <p id="dialog-description">{match.dialog.description}</p>
            {match.dialog.countdown && (
              <p className="next-game-countdown">
                <span className="next-game-countdown-label">{match.dialog.countdown.label}</span>
                {match.dialog.countdown.deadline !== null && (
                  <Countdown
                    deadline={match.dialog.countdown.deadline}
                    clockOffset={match.dialog.countdown.clockOffset}
                    context="until the next game starts"
                    onExpire={controller.refreshMatchStatus}
                  />
                )}
              </p>
            )}
            {match.dialog.series && (
              <section
                className="series-result-progress"
                id="series-result-progress"
                aria-label="Series progress"
              >
                <div className="series-result-score">
                  <span>Series score</span>
                  <strong>{match.dialog.series.score}</strong>
                </div>
                <ul className="series-result-players">
                  <li>
                    <span>{match.dialog.series.firstName}</span>
                    <span>{match.dialog.series.firstNeeded}</span>
                  </li>
                  <li>
                    <span>{match.dialog.series.secondName}</span>
                    <span>{match.dialog.series.secondNeeded}</span>
                  </li>
                </ul>
              </section>
            )}
            <div className="dialog-actions">
              {match.dialog.secondaryLabel && (
                <button
                  className="dialog-secondary"
                  id="dialog-secondary"
                  type="button"
                  disabled={match.dialog.secondaryDisabled}
                  onClick={controller.gameDialogSecondary}
                >
                  {match.dialog.secondaryLabel}
                </button>
              )}
              <button
                className={`dialog-primary${match.dialog.primaryDanger ? " dialog-danger" : ""}`}
                id="dialog-primary"
                type="button"
                disabled={match.dialog.primaryDisabled}
                onClick={controller.gameDialogPrimary}
              >
                {match.dialog.primaryLabel}
              </button>
            </div>
          </div>
        )}
      </dialog>

      <dialog
        className="game-dialog online-dialog"
        id="online-dialog"
        ref={onlineDialogRef}
        aria-labelledby="online-title"
        onCancel={(event) => {
          event.preventDefault();
          controller.closeOnlineDialog();
        }}
        onClose={() => {
          setOnlineGuideKeyOpen(null);
          controller.onlineDialogClosed();
        }}
      >
        {match.onlineDialog && (
          <div className="dialog-content">
            <div className="online-dialog-header">
              <h2 id="online-title">{match.onlineDialog.title}</h2>
              <button
                className="dialog-close online-close-button"
                type="button"
                aria-label={match.onlineDialog.closeLabel}
                onClick={controller.closeOnlineDialog}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            </div>
            <div className="online-dialog-body">
              {match.onlineDialog.description && (
                <p id="online-description">{match.onlineDialog.description}</p>
              )}
              {(match.onlineDialog.mode === "join" || match.onlineDialog.mode === "opponent") &&
                match.onlineDialog.showRules && (
                  <div className="join-match-rules" role="group" aria-label="Match rules">
                    <strong>{match.onlineDialog.rulesSeries}</strong>
                    <span>{match.onlineDialog.rulesDetails}</span>
                  </div>
                )}
              {(match.onlineDialog.mode === "create" ||
                match.onlineDialog.mode === "join" ||
                match.onlineDialog.mode === "opponent") && (
                <div className="online-game-guide">
                  <button
                    className="game-guide-disclosure"
                    type="button"
                    aria-expanded={onlineGuideOpen}
                    onClick={() => setOnlineGuideKeyOpen(onlineGuideOpen ? null : onlineDialogKey)}
                  >
                    {onlineGuideOpen ? "Hide how to play" : "How to play"}
                    <svg aria-hidden="true" viewBox="0 0 12 12">
                      <path d={onlineGuideOpen ? "m3 7.5 3-3 3 3" : "m3 4.5 3 3 3-3"} />
                    </svg>
                  </button>
                  {onlineGuideOpen && <GameHowToPlay gameId={match.gameId} />}
                </div>
              )}
              {(match.onlineDialog.mode === "create" ||
                match.onlineDialog.mode === "join" ||
                match.onlineDialog.mode === "opponent") && (
                <>
                  {supportsIdentityChoice && account.status === "signed-in" && (
                    <fieldset className="join-identity-options">
                      <legend>
                        {match.onlineDialog.mode === "join"
                          ? "Join as"
                          : match.onlineDialog.mode === "create"
                            ? "Create as"
                            : "Play as"}
                      </legend>
                      <label>
                        <input
                          type="radio"
                          name="match-identity"
                          checked={!match.onlineDialog.joinAsGuest}
                          onChange={() => {
                            joinIdentityTouched.current = true;
                            controller.updateOnlineForm("joinAsGuest", false);
                          }}
                        />
                        <span>
                          Account <strong>@{account.username}</strong>
                        </span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="match-identity"
                          checked={match.onlineDialog.joinAsGuest}
                          onChange={() => {
                            joinIdentityTouched.current = true;
                            controller.updateOnlineForm("joinAsGuest", true);
                          }}
                        />
                        <span>Guest</span>
                      </label>
                    </fieldset>
                  )}
                  {supportsIdentityChoice && account.status === "loading" && (
                    <p className="join-identity-status" role="status">
                      Checking sign-in…
                    </p>
                  )}
                  <div
                    className={
                      supportsIdentityChoice && account.status === "signed-in"
                        ? "identity-choice-details"
                        : undefined
                    }
                  >
                    {account.status === "signed-in" && !match.onlineDialog.joinAsGuest ? (
                      <div className="identity-choice-note" aria-live="polite">
                        Using your account for this match.
                      </div>
                    ) : (
                      <div className="player-name-field">
                        <label htmlFor="player-name-input">
                          Your name <span>Optional</span>
                        </label>
                        <input
                          id="player-name-input"
                          type="text"
                          maxLength={24}
                          autoComplete="nickname"
                          autoCapitalize="words"
                          aria-describedby={
                            match.onlineDialog.nameInvalid
                              ? "player-name-hint online-error"
                              : "player-name-hint"
                          }
                          aria-invalid={match.onlineDialog.nameInvalid || undefined}
                          value={match.onlineDialog.name}
                          onChange={(event) =>
                            controller.updateOnlineForm("name", event.currentTarget.value)
                          }
                          placeholder="e.g. Swift Fox 42"
                        />
                        <small id="player-name-hint">
                          Leave blank for a random name. Names must differ in a match.
                        </small>
                        {supportsIdentityChoice && match.onlineDialog.joinAsGuest && (
                          <small className="join-identity-status">
                            Guest results stay on this device. They won’t appear in account history
                            or rankings.
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                  {supportsIdentityChoice &&
                    (account.status === "signed-out" || account.status === "error") && (
                      <div className="join-account-signin">
                        <span>Have an account?</span>
                        <button
                          type="button"
                          disabled={account.busy}
                          onClick={() =>
                            void accountSession.signInWithGoogle({
                              preserveMatchLink: match.onlineDialog?.mode === "join",
                            })
                          }
                        >
                          {account.busy ? "Opening Google…" : "Sign in with Google"}
                        </button>
                        {account.error && <small role="alert">{account.error}</small>}
                      </div>
                    )}
                </>
              )}
              {match.onlineDialog.mode === "create" && (
                <div className="match-create-form">
                  <fieldset className="visibility-options create-visibility-options">
                    <legend>Who can join?</legend>
                    {(
                      [
                        { value: "public", title: "Public", note: "Anyone can join" },
                        { value: "invite", title: "Private", note: "Invite link only" },
                      ] as const
                    ).map((option) => (
                      <label className="visibility-option" key={option.value}>
                        <input
                          type="radio"
                          name="room-visibility"
                          value={option.value}
                          checked={match.onlineDialog?.visibility === option.value}
                          onChange={() => controller.updateOnlineForm("visibility", option.value)}
                        />
                        <span>
                          <strong>{option.title}</strong>
                          <small>{option.note}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  {match.onlineDialog.visibility === "invite" &&
                    account.status === "signed-in" &&
                    !match.onlineDialog.joinAsGuest && (
                      <fieldset className="invite-friends-options">
                        <legend>Invite friends</legend>
                        {account.friendsStatus === "loading" || account.friendsStatus === "idle" ? (
                          <p className="invite-friends-note" role="status">
                            Loading friends…
                          </p>
                        ) : account.friendsStatus === "error" ? (
                          <button
                            className="invite-friends-note is-action"
                            type="button"
                            onClick={() => void accountSession.loadFriends(true)}
                          >
                            Try again
                          </button>
                        ) : account.friends.length === 0 ? (
                          <p className="invite-friends-note">Add friends from your account.</p>
                        ) : (
                          <div className="invite-friends-list">
                            {account.friends.map((friend) => {
                              const checked = match.onlineDialog?.invitedFriendshipIds.includes(
                                friend.id,
                              );
                              const atLimit =
                                match.onlineDialog!.invitedFriendshipIds.length >= 10 && !checked;
                              return (
                                <label className="invite-friend-option" key={friend.id}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={atLimit}
                                    onChange={(event) => {
                                      const selected = new Set(
                                        match.onlineDialog?.invitedFriendshipIds ?? [],
                                      );
                                      if (event.currentTarget.checked) selected.add(friend.id);
                                      else selected.delete(friend.id);
                                      controller.updateOnlineForm("invitedFriendshipIds", [
                                        ...selected,
                                      ]);
                                    }}
                                  />
                                  <span>@{friend.username}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {account.friends.length > 0 && (
                          <p className="invite-friends-note">First friend to join gets the seat.</p>
                        )}
                      </fieldset>
                    )}
                  {match.onlineDialog.visibility === "invite" &&
                    account.status === "signed-in" &&
                    match.onlineDialog.joinAsGuest && (
                      <p className="invite-friends-note">Friend invites need an account.</p>
                    )}
                  {!optionsExpanded && (
                    <p className="match-setup-summary">
                      {match.onlineDialog.seriesTarget === 1
                        ? "One game"
                        : `First to win ${match.onlineDialog.seriesTarget}`}
                    </p>
                  )}
                  <button
                    className="match-options-toggle"
                    type="button"
                    aria-expanded={optionsExpanded}
                    onClick={() => controller.updateOnlineForm("optionsExpanded", !optionsExpanded)}
                  >
                    {optionsExpanded ? "Hide settings" : "Match settings"}
                  </button>
                  {match.onlineDialog.optionsExpanded && (
                    <div id="match-create-options">
                      <fieldset className="series-options">
                        <legend>Wins to take the series</legend>
                        {([1, 2, 3] as const).map((target) => (
                          <label className="series-option" key={target}>
                            <input
                              type="radio"
                              name="series-target"
                              value={target}
                              checked={match.onlineDialog?.seriesTarget === target}
                              onChange={() => controller.updateOnlineForm("seriesTarget", target)}
                            />
                            <span className="series-option-copy">
                              <strong>
                                {target === 1 ? "One game" : `First to win ${target} games`}
                              </strong>
                            </span>
                          </label>
                        ))}
                        <p className="series-options-note">Ties add no wins.</p>
                      </fieldset>
                      {match.onlineDialog.visibility === "public" && (
                        <fieldset className="series-options matchmaking-preference">
                          <legend>Pair with</legend>
                          {(
                            [
                              { value: false, label: "Same series length" },
                              { value: true, label: "Any series length" },
                            ] as const
                          ).map((option) => (
                            <label className="series-option" key={String(option.value)}>
                              <input
                                type="radio"
                                name="match-series-preference"
                                checked={match.onlineDialog?.matchAnySeries === option.value}
                                onChange={() =>
                                  controller.updateOnlineForm("matchAnySeries", option.value)
                                }
                              />
                              <span className="series-option-copy">
                                <strong>{option.label}</strong>
                              </span>
                            </label>
                          ))}
                          {match.onlineDialog.matchAnySeries && (
                            <p className="series-options-note">
                              If no room is waiting, your room uses the selected series length.
                            </p>
                          )}
                        </fieldset>
                      )}
                    </div>
                  )}
                </div>
              )}
              {match.onlineDialog.mode === "invite" && (
                <div className="invite-link-row">
                  <input
                    id="invite-link"
                    aria-label="Game invite link"
                    readOnly
                    value={match.onlineDialog.inviteLink}
                  />
                  <button
                    className="dialog-secondary"
                    type="button"
                    onClick={controller.copyInviteLink}
                  >
                    {match.onlineDialog.copyLabel}
                  </button>
                </div>
              )}
              {match.onlineDialog.error && (
                <p className="online-error" id="online-error" role="status" aria-live="polite">
                  {match.onlineDialog.error}
                </p>
              )}
            </div>
            <div className="dialog-actions online-actions">
              {match.onlineDialog.mode === "create" && (
                <button
                  className="dialog-primary"
                  type="button"
                  disabled={match.onlineDialog.busy || account.status === "loading"}
                  onClick={controller.submitCreate}
                >
                  {account.status === "loading"
                    ? "Checking sign-in…"
                    : match.onlineDialog.busy
                      ? "Creating…"
                      : "Create match"}
                </button>
              )}
              {match.onlineDialog.mode === "join" && (
                <button
                  className="dialog-primary"
                  type="button"
                  disabled={match.onlineDialog.busy || account.status === "loading"}
                  onClick={controller.submitJoin}
                >
                  {account.status === "loading"
                    ? "Checking sign-in…"
                    : match.onlineDialog.busy
                      ? "Joining…"
                      : "Join game"}
                </button>
              )}
              {match.onlineDialog.mode === "opponent" && (
                <button
                  className="dialog-primary"
                  type="button"
                  disabled={match.onlineDialog.busy || account.status === "loading"}
                  onClick={controller.submitOpponent}
                >
                  {account.status === "loading"
                    ? "Checking sign-in…"
                    : match.onlineDialog.busy
                      ? "Starting…"
                      : "Start match"}
                </button>
              )}
              {match.onlineDialog.mode === "retry" && (
                <button
                  className="dialog-primary"
                  type="button"
                  disabled={match.onlineDialog.busy}
                  onClick={controller.retryOnlineDialog}
                >
                  {match.onlineDialog.busy ? "Loading…" : "Try again"}
                </button>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
