import type {
  GameOutcome,
  RuntimeGameStateInfo,
  RuntimeTwoPlayerGame,
} from "../../../../packages/contracts/dist/index.js";
import { normalizeQuickMessage } from "../../../../packages/contracts/dist/index.js";
import type { MatchReactionId, PlayerSeat } from "../../../../packages/contracts/dist/index.js";
import type { LobbyMatch } from "../features/lobby/lobby-client";
import { publishMatchView } from "../features/match/match-view-store.js";
import type { GameDialogView, OnlineDialogView } from "../features/match/match-view-store.js";
import { MatchTransport } from "../services/match/match-transport.js";
import { MatchApiClient } from "../services/match/match-api-client.js";
import { MatchSessionStorage } from "../services/match/match-session-storage.js";
import { MatchSessionCoordinator } from "../services/match/match-session-coordinator.js";
import { GameAppStore } from "./game-app-store";
import type { ActiveMatch, DeviceMatchLock } from "../services/match/match-session-storage.js";
import type { MatchApiBody } from "../services/match/match-api-client.js";
import { parseLiveMatch } from "../features/match/match-types.js";
import type {
  LiveMatch,
  OnlineMultiplayer,
  PendingOnlineMove,
} from "../features/match/match-types.js";
import {
  canRetryPendingMove,
  reconcilePendingMove,
} from "../features/match/pending-move-reconciliation.js";
import { canLeaveSeriesResult } from "../features/match/series-actions.js";
import { randomDisplayName } from "../shared/guest-names.js";
import { createMatchViewSnapshot } from "../features/match/match-view-model.js";
import type { GameController } from "./controller-contract.js";
import { clientGames, GAME_CATALOG, supportedGameVersions } from "../games/registry.js";
import { isRegisteredOpponentProfile } from "../games/opponents.js";
import { aiMoveDelay } from "../features/match/ai-presentation.js";
import { accountSession } from "../features/account/account-session.js";
import { saveGuestHistory, type GuestGameHistoryEntry } from "../features/account/guest-history.js";

type Theme = "system" | "light" | "dark";
type GameDialogMode = GameDialogView["mode"];
type OnlineForm = {
  name: string;
  joinAsGuest: boolean;
  seriesTarget: 1 | 2 | 3;
  matchAnySeries: boolean;
  visibility: "public" | "invite";
  optionsExpanded: boolean;
};
type Multiplayer = OnlineMultiplayer;
type CreateRoomInput = Readonly<{
  visibility: "public" | "invite";
  seriesTarget: 1 | 2 | 3;
  matchAnySeries: boolean;
  displayName: string;
}>;
type GameDialogOptions = Pick<GameDialogView, "mode" | "title" | "primaryLabel"> &
  Partial<Omit<GameDialogView, "mode" | "title" | "primaryLabel">>;
type OnlineDialogOptions = Pick<OnlineDialogView, "title"> & Partial<OnlineDialogView>;
type PreviewError = Error & { code?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function createGameController() {
  const appStore = new GameAppStore();
  const requestedLobbyView = new URLSearchParams(window.location.search).get("view");
  let leaderboardReturnTab: "matches" | "games" =
    new URLSearchParams(window.location.search).get("returnTab") === "games" ||
    requestedLobbyView === "games"
      ? "games"
      : "matches";
  let leaderboardNavigationPending = false;
  if (
    requestedLobbyView === "matches" ||
    requestedLobbyView === "games" ||
    requestedLobbyView === "leaderboard"
  ) {
    appStore.update({ lobbyTab: requestedLobbyView });
  }

  let onlineDialogView: OnlineDialogView | null = null;
  let joinAttempt = 0;
  let isLeavingWaitingMatch = false;
  let returnToGamesAfterCreateDialog = false;
  const onlineDialog = {
    get open() {
      return onlineDialogView !== null;
    },
    close() {
      onlineDialogView = null;
      appStore.update({ onlineSetupOpen: false });
      updateMatchViewSnapshot();
    },
  };
  let gameDialogView: GameDialogView | null = null;
  let gameDialogReturnValue = "";
  const gameDialog = {
    get open() {
      return gameDialogView !== null;
    },
    close(value = "") {
      gameDialogReturnValue = value;
      gameDialogView = null;
      updateMatchViewSnapshot();
    },
  };

  const requestedGameId = new URLSearchParams(window.location.search).get("game");
  let currentGameId = clientGames.get(requestedGameId ?? "")?.gameId ?? "connect-four";
  let state: unknown = clientGames
    .get(currentGameId)!
    .createState("first", clientGames.get(currentGameId)!.rulesVersion);
  let stateSummaryCache: {
    gameId: string;
    rulesVersion: number;
    state: unknown;
    value: RuntimeGameStateInfo;
  } | null = null;
  let round = 1;
  let wins = { first: 0, second: 0 };
  let theme: Theme = "system";
  let soundEnabled = true;
  let audioContext: AudioContext | null = null;
  let isRevealingWin = false;
  let pendingWinSeat: PlayerSeat | null = null;
  let resultDialogTimer: number | null = null;
  let activityNotice:
    | { eventId: string; seat: PlayerSeat; kind: "reaction"; reactionId: MatchReactionId }
    | { eventId: string; seat: PlayerSeat; kind: "message"; message: string }
    | null = null;
  let activityNoticeTimer: number | null = null;
  const seenActivityEventIds = new Set<string>();
  let hasUnreadActivity = false;
  let socialFeedback: { id: number; kind: "error"; message: string } | null = null;
  let socialFeedbackTimer: number | null = null;
  let socialFeedbackSequence = 0;
  let lastSocialSentAt = 0;
  let socialSentTimes: number[] = [];
  let multiplayer: Multiplayer | null = null;
  let roomFromUrl = new URLSearchParams(window.location.search).get("match");
  let currentInviteLink = "";
  let matchOpenAttempt = 0;
  const configuredApi =
    document.querySelector<HTMLMetaElement>('meta[name="games-api"]')?.content.replace(/\/$/, "") ??
    "/api";
  const gamesApi = configuredApi.startsWith("/")
    ? `${window.location.origin}${configuredApi}`
    : configuredApi;
  const matchApi = new MatchApiClient(
    gamesApi,
    async () => (await accountSession.getIdentityForRequest())?.accessToken ?? null,
  );
  const matchSessionStorage = new MatchSessionStorage();
  const matchCoordinator = new MatchSessionCoordinator(matchApi, matchSessionStorage);
  let onlineTransport: MatchTransport | null = null;
  let pendingOnlineMove: PendingOnlineMove | null = null;
  let pendingMoveTimer: number | null = null;
  let pendingMoveSyncRequested = false;
  let aiPresentation: {
    matchId: string;
    gameNumber: number;
    actionCount: number;
    thinking: boolean;
    reveal: boolean;
    revealStarted: boolean;
    delayMs: number;
    turnDeadline: number;
  } | null = null;
  let aiPresentationTimer: number | null = null;
  let aiRevealTimer: number | null = null;
  let lastAiPresentationKey = "";
  let serverClockOffset = 0;
  let dialogMode: GameDialogMode = "local-result";
  let onlineForm: OnlineForm = {
    name: "",
    joinAsGuest: accountSession.getIdentity() === null,
    seriesTarget: 2,
    matchAnySeries: false,
    visibility: "public",
    optionsExpanded: false,
  };
  let opponentIntent: {
    gameId: string;
    profileId: string;
    inHousePlayerId: string;
    opponentName: string;
    seriesTarget: 1 | 2 | 3;
  } | null = null;
  let activeMatchNotice = "";
  let checkingSavedMatch = false;
  let savedMatchStatusLabel = "Match in progress";
  let started = false;
  let startupTimer: number | null = null;
  function currentGame(): RuntimeTwoPlayerGame {
    const game = clientGames.get(currentGameId);
    if (!game) throw new Error(`Game is not registered: ${currentGameId}`);
    return game;
  }

  function currentRulesVersion(): number {
    return multiplayer?.match?.rulesVersion ?? currentGame().rulesVersion;
  }

  function inspectCurrentState(): RuntimeGameStateInfo | null {
    const game = currentGame();
    const rulesVersion = currentRulesVersion();
    if (
      stateSummaryCache?.gameId === game.gameId &&
      stateSummaryCache.rulesVersion === rulesVersion &&
      stateSummaryCache.state === state
    )
      return stateSummaryCache.value;
    const inspected = game.inspectState(state, rulesVersion);
    if (!inspected.ok) {
      stateSummaryCache = null;
      return null;
    }
    stateSummaryCache = { gameId: game.gameId, rulesVersion, state, value: inspected.value };
    return inspected.value;
  }
  function gameOutcome(): GameOutcome | null {
    return inspectCurrentState()?.outcome ?? null;
  }
  function gameNextPlayer(): PlayerSeat | null {
    return inspectCurrentState()?.nextPlayer ?? null;
  }
  function gameStartingPlayer(): PlayerSeat | null {
    return inspectCurrentState()?.startingPlayer ?? null;
  }
  function gameActionCount(): number {
    return inspectCurrentState()?.actionCount ?? 0;
  }
  function createCurrentState(
    startingPlayer: PlayerSeat,
    rulesVersion = currentGame().rulesVersion,
  ): unknown {
    return currentGame().createState(startingPlayer, rulesVersion);
  }

  const RESULT_BOARD_PREVIEW_MS = 1_800;
  const SOCIAL_ACTIVITY_DURATION_MS = 6_500;

  function applyTheme(nextTheme: Theme) {
    theme = nextTheme;
    appStore.update({ theme });
  }

  try {
    const savedTheme = localStorage.getItem("games-theme");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system")
      theme = savedTheme;
  } catch {
    // System theme remains available when browser storage is disabled.
  }

  applyTheme(theme);

  try {
    soundEnabled =
      (localStorage.getItem("games-sound") ?? localStorage.getItem("connect-four-sound")) !== "off";
  } catch {
    // Sound remains enabled for this session when browser storage is disabled.
  }

  try {
    onlineForm.name = localStorage.getItem("games-display-name") ?? "";
  } catch {
    // The name field remains editable when browser storage is disabled.
  }

  appStore.update({ soundEnabled });

  function unlockAudio() {
    if (!soundEnabled) return;

    const AudioContextConstructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    try {
      audioContext ??= new AudioContextConstructor();
      if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
    } catch {
      // Audio is an enhancement; gameplay must continue if the device blocks it.
    }
  }

  function playNotes(
    notes: readonly number[],
    waveform: OscillatorType = "sine",
    spacingSeconds = 0.11,
  ) {
    if (!soundEnabled || document.visibilityState === "hidden") return;

    const AudioContextConstructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    try {
      unlockAudio();
      const context = audioContext;
      if (!context || context.state === "closed") return;
      const schedule = () => {
        if (!soundEnabled || document.visibilityState === "hidden" || context.state !== "running")
          return;
        const now = context.currentTime;
        for (const [index, frequency] of notes.entries()) {
          const start = now + index * spacingSeconds;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = waveform;
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.12, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.17);
        }
      };
      if (context.state === "running") schedule();
      else
        void context
          .resume()
          .then(schedule)
          .catch(() => {});
    } catch {
      // Audio is an enhancement; gameplay must continue if the device blocks it.
    }
  }

  function playWinRevealSound() {
    const spacing = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.11;
    playNotes([523, 659, 784, 988], "triangle", spacing);
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    appStore.update({ soundEnabled });
    try {
      localStorage.setItem("games-sound", soundEnabled ? "on" : "off");
    } catch {
      // Sound preference remains available for this session.
    }
    if (soundEnabled) playNotes([660], "triangle");
  }

  function toggleTheme() {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const currentTheme = theme === "light" || theme === "dark" ? theme : "system";
    const isDark = currentTheme === "system" ? systemTheme === "dark" : currentTheme === "dark";
    const nextTheme =
      currentTheme !== "system" && currentTheme !== systemTheme
        ? "system"
        : isDark
          ? "light"
          : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem("games-theme", nextTheme);
    } catch {
      // Theme changes do not depend on persistent storage.
    }
  }

  function announce(message: string) {
    appStore.update({ announcement: message });
  }

  function showSocialError(message: string) {
    socialFeedback = { id: ++socialFeedbackSequence, kind: "error", message };
    if (socialFeedbackTimer !== null) window.clearTimeout(socialFeedbackTimer);
    socialFeedbackTimer = window.setTimeout(() => {
      socialFeedbackTimer = null;
      socialFeedback = null;
      updateMatchViewSnapshot();
    }, 4_000);
    updateMatchViewSnapshot();
  }

  function setLobbyTab(tab: "matches" | "games" | "leaderboard", focus = false) {
    if (tab !== "leaderboard") leaderboardReturnTab = tab;
    appStore.update({ lobbyTab: tab, lobbyTabFocusRequest: focus });
  }

  function openLeaderboard() {
    const currentTab = appStore.getSnapshot().lobbyTab;
    if (currentTab === "leaderboard" || leaderboardNavigationPending) return;
    leaderboardReturnTab = currentTab;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "leaderboard");
    url.searchParams.set("returnTab", leaderboardReturnTab);
    history.pushState({ ...history.state, gamesLeaderboardPage: true }, "", url);
    appStore.update({ lobbyTab: "leaderboard", lobbyTabFocusRequest: false });
  }

  function closeLeaderboard() {
    if (appStore.getSnapshot().lobbyTab !== "leaderboard" || leaderboardNavigationPending) return;
    if (history.state?.gamesLeaderboardPage) {
      leaderboardNavigationPending = true;
      history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("returnTab");
    if (leaderboardReturnTab === "matches") url.searchParams.delete("view");
    else url.searchParams.set("view", leaderboardReturnTab);
    history.replaceState(null, "", url);
    appStore.update({ lobbyTab: leaderboardReturnTab, lobbyTabFocusRequest: true });
  }

  function handleLobbyPopState() {
    leaderboardNavigationPending = false;
    if (appStore.getSnapshot().screen !== "lobby") return;
    const url = new URL(window.location.href);
    const view = url.searchParams.get("view");
    if (view === "leaderboard") {
      leaderboardReturnTab = url.searchParams.get("returnTab") === "games" ? "games" : "matches";
      appStore.update({ lobbyTab: "leaderboard", lobbyTabFocusRequest: false });
    } else {
      const tab = view === "games" ? "games" : "matches";
      leaderboardReturnTab = tab;
      appStore.update({ lobbyTab: tab, lobbyTabFocusRequest: false });
    }
  }

  function clearLobbyTabFocusRequest() {
    appStore.update({ lobbyTabFocusRequest: false });
  }

  function playerName(seat: PlayerSeat | null) {
    if (!seat) return "Player";
    const onlineName = multiplayer?.online
      ? multiplayer.match?.playerNames?.[seat === "first" ? 0 : 1]
      : null;
    if (typeof onlineName === "string" && onlineName) return onlineName;
    if (multiplayer?.online)
      return seat === multiplayer.seat ? (multiplayer.displayName ?? "You") : "Opponent";
    return seat === "first" ? "Player 1" : "Player 2";
  }

  function chosenDisplayName(useAccountIdentity = true) {
    const username = useAccountIdentity ? accountSession.getIdentity()?.username : null;
    if (username) return username;
    const cleaned = enteredDisplayName();
    return cleaned || randomDisplayName();
  }

  function enteredDisplayName(value: string = onlineForm.name) {
    return (
      value
        .normalize("NFKC")
        // eslint-disable-next-line no-control-regex -- Strip control characters from untrusted player names.
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  function rememberDisplayName(value: string = onlineForm.name) {
    const name = Array.from(enteredDisplayName(value)).slice(0, 24).join("");
    if (!name) return;
    try {
      localStorage.setItem("games-display-name", name);
    } catch {
      // Name persistence is a convenience; the current match still works.
    }
  }

  function clearPlayerNameError() {
    if (onlineDialogView) updateOnlineDialog({ nameInvalid: false, error: "" });
  }

  function readDeviceMatchLock(): DeviceMatchLock | null {
    return matchSessionStorage.readLock();
  }

  function readActiveMatch(): ActiveMatch | null {
    return matchSessionStorage.readActiveMatch();
  }

  function showMatchLockNotice(lock: DeviceMatchLock | null = readDeviceMatchLock()) {
    if (onlineDialogView?.mode === "opponent") opponentIntent = null;
    if (onlineDialog.open) onlineDialog.close();
    activeMatchNotice =
      lock && "pending" in lock ? "" : "Finish this match before starting another.";
    renderActiveMatchBanner();
    if (!(lock && "pending" in lock) && appStore.getSnapshot().screen === "lobby")
      setLobbyTab("matches");
  }

  function saveActiveMatch(match: ActiveMatch) {
    matchSessionStorage.saveActiveMatch(match);
    activeMatchNotice = "";
    checkingSavedMatch = false;
    savedMatchStatusLabel = "Match in progress";
    renderActiveMatchBanner();
  }

  function clearActiveMatch(matchId: string | null = null) {
    if (matchSessionStorage.clearActiveMatch(matchId)) {
      activeMatchNotice = "";
      checkingSavedMatch = false;
      savedMatchStatusLabel = "Match in progress";
    }
    renderActiveMatchBanner();
  }

  function renderActiveMatchBanner() {
    const lock = readDeviceMatchLock();
    const summary = lock
      ? {
          pending: "pending" in lock,
          gameId: "gameId" in lock ? (lock.gameId ?? "") : "",
          notice: activeMatchNotice,
          checking: checkingSavedMatch,
          statusLabel: savedMatchStatusLabel,
        }
      : null;
    appStore.update({ activeMatch: summary });
  }

  async function validateSavedMatchOnStartup() {
    const saved = readActiveMatch();
    if (!saved) {
      renderActiveMatchBanner();
      return;
    }
    checkingSavedMatch = true;
    activeMatchNotice = "";
    savedMatchStatusLabel = "Match in progress";
    renderActiveMatchBanner();
    try {
      const recovery = await matchCoordinator.recoverActiveMatch();
      const isStillSavedMatch = readActiveMatch()?.matchId === saved.matchId;
      if (recovery.status === "closed") {
        matchSessionStorage.removeSeat(saved.matchId);
        matchSessionStorage.removeInviteLink(saved.matchId);
        if (isStillSavedMatch) activeMatchNotice = "";
        return;
      }
      if (!isStillSavedMatch) return;
      if (recovery.status === "unavailable") {
        activeMatchNotice = "Could not verify the saved match. Check your connection.";
        return;
      }
      if (recovery.status === "available") {
        const status = recovery.match.status;
        savedMatchStatusLabel =
          status === "between-games"
            ? "Next game ready"
            : status === "completed"
              ? "Series complete · rematch available"
              : status === "waiting"
                ? "Waiting for a player"
                : status === "countdown"
                  ? "Game starting"
                  : "Match in progress";
      }
    } finally {
      checkingSavedMatch = false;
      renderActiveMatchBanner();
    }
  }

  function returnToLobbyFromUnavailableMatch(
    matchId: string | null,
    message = "This match is no longer available.",
  ) {
    if (multiplayer?.online && multiplayer.roomId === matchId) {
      leaveOnlineGame();
    } else {
      clearActiveMatch(matchId);
      if (matchId) {
        matchSessionStorage.removeSeat(matchId);
        matchSessionStorage.removeInviteLink(matchId);
      }
      if (gameDialog.open) gameDialog.close("match-unavailable");
      if (onlineDialog.open) onlineDialog.close();
      roomFromUrl = null;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("match");
      cleanUrl.hash = "";
      history.replaceState(null, "", cleanUrl);
      showLobby();
      setLobbyTab("matches");
    }
    appStore.update({ lobbyError: message });
  }

  async function resumeActiveMatch() {
    if (!readActiveMatch()) {
      renderActiveMatchBanner();
      return;
    }
    activeMatchNotice = "";
    renderActiveMatchBanner();
    appStore.update({ resumingMatch: true, lobbyError: "" });
    try {
      const recovery = await matchCoordinator.recoverActiveMatch();
      if (recovery.status === "none") {
        renderActiveMatchBanner();
        return;
      }
      const { saved } = recovery;
      if (recovery.status === "closed") {
        returnToLobbyFromUnavailableMatch(saved.matchId, "");
        return;
      }
      if (recovery.status === "unavailable") {
        throw new Error("The match could not be reached. Check your connection and try again.");
      }
      const match = parseLiveMatch(recovery.match);
      if (!match) throw new Error("The match service returned invalid match data.");
      const game = clientGames.get(match.gameId, match.rulesVersion);
      if (!game) {
        returnToLobbyFromUnavailableMatch(
          saved.matchId,
          "This game version is no longer supported. Return to games to start another match.",
        );
        return;
      }
      roomFromUrl = saved.matchId;
      currentGameId = match.gameId;
      state = game.createState("first", match.rulesVersion);
      if (saved.seat === "first") {
        currentInviteLink = matchSessionStorage.readInviteLink(saved.matchId);
      }
      const matchUrl = new URL(window.location.href);
      matchUrl.search = `?match=${encodeURIComponent(saved.matchId)}`;
      matchUrl.hash = "";
      history.replaceState(null, "", matchUrl);
      showGameView();
      await enterOnlineMatch(
        saved.matchId,
        saved.seatToken,
        saved.seat,
        saved.displayName,
        saved.accountLinked ?? accountSession.getSnapshot().status === "signed-in",
      );
    } catch (error: unknown) {
      appStore.update({
        lobbyError:
          error instanceof TypeError
            ? "Could not reconnect. Check your connection and try again."
            : errorMessage(error),
      });
    } finally {
      appStore.update({ resumingMatch: false });
      renderActiveMatchBanner();
    }
  }

  function showLobby() {
    appStore.update({
      screen: "lobby",
      title: "Games",
      description: "",
      openingMatch: null,
      controls: {
        ...appStore.getSnapshot().controls,
        homeVisible: false,
        newGameVisible: false,
        playOnlineVisible: false,
        soundVisible: false,
      },
      connection: { ...appStore.getSnapshot().connection, visible: false },
    });
    renderActiveMatchBanner();
  }

  function showGameView() {
    const isOnlineRoute = Boolean(multiplayer?.online || roomFromUrl);
    const game = currentGame();
    appStore.update({
      screen: "match",
      title: game.title,
      description: game.description,
      openingMatch: null,
      controls: {
        ...appStore.getSnapshot().controls,
        homeVisible: true,
        newGameVisible: !isOnlineRoute,
        playOnlineVisible: !isOnlineRoute,
        soundVisible: true,
      },
    });
  }

  async function openLobbyMatch(match: LobbyMatch) {
    const matchId = match.matchId;
    let lock = readDeviceMatchLock();
    if (lock && !("pending" in lock) && lock.matchId !== matchId)
      lock = await matchCoordinator.reconcileLock(lock);
    if (lock) {
      if (!("pending" in lock) && lock.matchId === matchId) {
        void resumeActiveMatch();
        return;
      }
      showMatchLockNotice(lock);
      return;
    }
    roomFromUrl = matchId;
    currentGameId = match.gameId ?? "connect-four";
    const matchUrl = new URL(window.location.href);
    matchUrl.search = `?match=${encodeURIComponent(matchId)}`;
    matchUrl.hash = "";
    history.replaceState(null, "", matchUrl);
    showGameView();
    void showJoinGamePrompt(match);
  }

  function remainingGameWinsLabel(count: number) {
    if (count === 0) return "Series won";
    return `Needs ${count} more ${count === 1 ? "win" : "wins"}`;
  }

  function updateRoomExpiryCountdown(match: LiveMatch | null) {
    if (
      !multiplayer ||
      multiplayer.seat !== "first" ||
      !match ||
      match.status !== "waiting" ||
      !Number.isFinite(match.expiresAt)
    )
      return null;
    return {
      deadline: match.expiresAt,
      clockOffset: serverClockOffset,
      context: "until this room expires",
      clock: true,
    };
  }

  function nextGameCountdownView(match: LiveMatch) {
    if (!multiplayer) return null;
    const isBetweenGames =
      match.status === "between-games" && Number.isFinite(match.nextGameDeadline);
    if (!isBetweenGames) return null;

    const deadline = match.nextGameDeadline;
    if (deadline === undefined || deadline === null) return null;
    const seconds = Math.max(0, Math.ceil((deadline - (Date.now() + serverClockOffset)) / 1000));
    const ownIndex = multiplayer.seat === "first" ? 0 : 1;
    const otherIndex = ownIndex === 0 ? 1 : 0;
    const otherSeat = multiplayer.seat === "first" ? "second" : "first";
    if (!match.connectedSeats?.[otherIndex]) {
      return {
        label: `Waiting for ${playerName(otherSeat)} to reconnect.`,
        deadline: null,
        clockOffset: serverClockOffset,
      };
    } else if (seconds === 0) {
      return { label: "Starting…", deadline: null, clockOffset: serverClockOffset };
    } else if (match.nextReady?.[ownIndex]) {
      return { label: "You’re ready · auto-start in", deadline, clockOffset: serverClockOffset };
    } else if (match.nextReady?.[otherIndex]) {
      return {
        label: `${playerName(otherSeat)} is ready · auto-start in`,
        deadline,
        clockOffset: serverClockOffset,
      };
    } else {
      return { label: "Auto-start in", deadline, clockOffset: serverClockOffset };
    }
  }

  function updateMultiplayerUi() {
    const app = appStore.getSnapshot();
    if (multiplayer?.online) {
      const match = multiplayer.match;
      const statuses = {
        waiting: match?.seatKinds?.includes("ai")
          ? "Connected"
          : match?.aiFallbackAt
            ? "Finding a player"
            : multiplayer.seat === "first"
              ? "Game link ready"
              : "Joining game…",
        countdown: "Connected",
        active: "Connected",
        "between-games": "Connected",
        completed: "Connected",
        cancelled: "Game cancelled",
        expired: "This game link has expired",
      };
      const isTerminalRoom = match !== null && ["cancelled", "expired"].includes(match.status);
      const showReconnectCountdown =
        !multiplayer.connected &&
        match !== null &&
        ["active", "between-games"].includes(match.status) &&
        multiplayer.clientDisconnectedAt !== null;
      const status = multiplayer.connected
        ? ((match ? statuses[match.status] : undefined) ?? "Online game")
        : multiplayer.resuming
          ? "Checking connection…"
          : multiplayer.reconnectStopped
            ? "Reconnect failed"
            : "Reconnecting";
      const controls = {
        ...app.controls,
        homeVisible: app.screen === "match",
        newGameVisible: false,
        newGameDisabled: true,
        playOnlineVisible: false,
        soundVisible: true,
      };
      const reconnectBudget = localReconnectBudgetMs();
      const connection = {
        visible: true,
        connected: multiplayer.connected,
        status,
        roomExpiry: updateRoomExpiryCountdown(match),
        reconnect: showReconnectCountdown
          ? {
              deadline: (multiplayer.clientDisconnectedAt ?? Date.now()) + reconnectBudget,
              clockOffset: 0,
              context: "left to reconnect",
            }
          : null,
        shareVisible:
          multiplayer.seat === "first" && match?.status === "waiting" && Boolean(currentInviteLink),
        cancelVisible: multiplayer.seat === "first" && (!match || match.status === "waiting"),
        leaveVisible: multiplayer.seat === "second" && (!match || match.status === "waiting"),
        leaveDisabled: isLeavingWaitingMatch,
        forfeitVisible: match?.status === "active",
        forfeitDisabled: !multiplayer.connected,
        retryVisible: !multiplayer.connected && multiplayer.reconnectStopped && !isTerminalRoom,
      };
      const isRematchStarting = match?.status === "countdown" && match.rematchCountdown === true;
      round = isRematchStarting
        ? 1
        : match?.status === "countdown" && match.gameNumber > 0
          ? match.gameNumber + 1
          : Math.max(1, match?.gameNumber ?? 1);
      if (
        match &&
        match.status !== "active" &&
        gameDialog.open &&
        ["online-between", "online-confirm-concede", "online-complete"].includes(dialogMode) &&
        ["countdown", "waiting"].includes(match.status)
      )
        gameDialog.close("new-round");
      appStore.update({ controls, connection });
      updateMatchViewSnapshot();
      return;
    }

    const inLobby = app.screen === "lobby";
    const controls = {
      ...app.controls,
      homeVisible: !inLobby,
      newGameVisible: !inLobby,
      newGameDisabled: gameActionCount() === 0 && !gameOutcome(),
      playOnlineVisible: !inLobby,
      playOnlineDisabled: gameActionCount() > 0 || Boolean(gameOutcome()),
      playOnlineLabel: "Play online",
      playOnlineTitle:
        gameActionCount() > 0 || Boolean(gameOutcome())
          ? "Finish this game before creating an online game"
          : "Create or join an online game",
      soundVisible: !inLobby,
    };
    const connection = {
      visible: false,
      connected: false,
      status: "",
      roomExpiry: null,
      reconnect: null,
      shareVisible: false,
      cancelVisible: false,
      leaveVisible: false,
      leaveDisabled: false,
      forfeitVisible: false,
      forfeitDisabled: false,
      retryVisible: false,
    };
    appStore.update({ controls, connection });
    updateMatchViewSnapshot();
  }

  function localReconnectBudgetMs(): number {
    if (!multiplayer?.online) return 0;
    const ownIndex = multiplayer.seat === "first" ? 0 : 1;
    const serverRemaining = multiplayer.match?.reconnectRemainingMs?.[ownIndex];
    return typeof serverRemaining === "number" && Number.isFinite(serverRemaining)
      ? serverRemaining
      : (multiplayer.clientReconnectBudgetMs ?? 60_000);
  }

  function localReconnectRemainingMs(): number {
    const budget = localReconnectBudgetMs();
    return !multiplayer?.online || multiplayer.clientDisconnectedAt === null
      ? budget
      : Math.max(0, budget - (Date.now() - multiplayer.clientDisconnectedAt));
  }

  function onlineSocketUrl(): string {
    if (!multiplayer) throw new Error("No active match connection.");
    return `${gamesApi.replace(/^http/, "ws")}/v1/matches/${multiplayer.roomId}/socket`;
  }

  function clearAiPresentation() {
    if (aiPresentationTimer !== null) window.clearTimeout(aiPresentationTimer);
    if (aiRevealTimer !== null) window.clearTimeout(aiRevealTimer);
    aiPresentationTimer = null;
    aiRevealTimer = null;
    aiPresentation = null;
    lastAiPresentationKey = "";
  }

  function showActivityNotice(
    event:
      | { eventId: string; seat: PlayerSeat; kind: "reaction"; reactionId: MatchReactionId }
      | { eventId: string; seat: PlayerSeat; kind: "message"; message: string },
  ) {
    if (!multiplayer?.online) return;
    if (seenActivityEventIds.has(event.eventId)) return;
    seenActivityEventIds.add(event.eventId);
    if (seenActivityEventIds.size > 64)
      seenActivityEventIds.delete(seenActivityEventIds.values().next().value!);
    if (event.seat !== multiplayer.seat) hasUnreadActivity = true;
    playNotes([659, 880], "sine");
    activityNotice = event;
    if (activityNoticeTimer !== null) window.clearTimeout(activityNoticeTimer);
    activityNoticeTimer = window.setTimeout(() => {
      activityNoticeTimer = null;
      activityNotice = null;
      updateMatchViewSnapshot();
    }, SOCIAL_ACTIVITY_DURATION_MS);
    updateMatchViewSnapshot();
  }

  function beginAiMovePresentation(
    match: LiveMatch,
    actionCount: number,
    playedSeat: PlayerSeat,
    turnDurationMs: number,
  ) {
    const key = `${match.matchId}:${match.gameNumber}:${actionCount}`;
    if (key === lastAiPresentationKey) return false;
    if (aiPresentationTimer !== null) window.clearTimeout(aiPresentationTimer);
    if (aiRevealTimer !== null) window.clearTimeout(aiRevealTimer);
    lastAiPresentationKey = key;
    const animationMs = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 240;
    const awaitingReceipt = match.awaitingTurnReceipt;
    const receiptDeadline =
      awaitingReceipt && multiplayer?.seat === awaitingReceipt.seat
        ? awaitingReceipt.deadline
        : null;
    const receiptBudgetMs =
      receiptDeadline === null
        ? Number.POSITIVE_INFINITY
        : receiptDeadline - (Date.now() + serverClockOffset);
    const delayMs = Math.min(aiMoveDelay(), Math.max(0, receiptBudgetMs - animationMs - 250));
    // The Worker has already accepted the AI move, but the human's authoritative
    // clock is held until the staged move is revealed and its receipt is acked.
    // Use the game's normal turn duration for the AI-side presentation so both
    // player cards keep the same countdown treatment without another server call.
    aiPresentation = {
      matchId: match.matchId,
      gameNumber: match.gameNumber,
      actionCount,
      thinking: true,
      reveal: true,
      revealStarted: false,
      delayMs,
      turnDeadline: Date.now() + turnDurationMs,
    };
    aiPresentationTimer = window.setTimeout(() => {
      aiPresentationTimer = null;
      if (aiPresentation?.matchId !== match.matchId || aiPresentation.actionCount !== actionCount)
        return;
      aiPresentation.revealStarted = true;
      updateMatchViewSnapshot();
      aiPresentationTimer = window.setTimeout(() => {
        aiPresentationTimer = null;
        if (aiPresentation?.matchId !== match.matchId || aiPresentation.actionCount !== actionCount)
          return;
        aiPresentation.thinking = false;
        const outcome = gameOutcome();
        if (outcome?.kind === "win") {
          pendingWinSeat = outcome.winner;
          isRevealingWin = true;
          playWinRevealSound();
          scheduleResultDialog(outcome);
        } else if (outcome?.kind === "draw") {
          playNotes(
            [playedSeat === "first" ? 440 : 554],
            playedSeat === "first" ? "triangle" : "sine",
          );
          playNotes([392, 330], "sine");
          scheduleResultDialog(outcome);
        } else {
          const nextPlayer = gameNextPlayer();
          if (nextPlayer) {
            playNotes(
              [nextPlayer === "first" ? 440 : 554],
              nextPlayer === "first" ? "triangle" : "sine",
            );
            announce(`${playerName(nextPlayer)}’s turn.`);
          }
        }
        const currentMatch = multiplayer?.match;
        if (currentMatch?.matchId === match.matchId) acknowledgeTurnReceipt(currentMatch);
        updateMatchViewSnapshot();
        aiRevealTimer = window.setTimeout(() => {
          aiRevealTimer = null;
          if (
            aiPresentation?.matchId !== match.matchId ||
            aiPresentation.actionCount !== actionCount
          )
            return;
          aiPresentation = null;
          updateMatchViewSnapshot();
        }, 100);
      }, animationMs + 40);
    }, delayMs);
    return true;
  }

  function acknowledgeTurnReceipt(match: LiveMatch) {
    if (!multiplayer?.online || match.matchId !== multiplayer.roomId) return;
    const awaiting = match.awaitingTurnReceipt;
    if (
      awaiting?.seat !== multiplayer.seat ||
      !multiplayer.connected ||
      !onlineTransport ||
      multiplayer.turnReceiptAckedRevision === match.revision
    )
      return;
    if (onlineTransport.send({ type: "turn-received", revision: match.revision })) {
      multiplayer.turnReceiptAckedRevision = match.revision;
    }
  }

  function clearPendingOnlineMove(publish = true) {
    if (!pendingOnlineMove) return;
    pendingOnlineMove = null;
    pendingMoveSyncRequested = false;
    if (pendingMoveTimer !== null) window.clearTimeout(pendingMoveTimer);
    pendingMoveTimer = null;
    if (publish) updateMatchViewSnapshot();
  }

  function sendPendingOnlineMove(match: LiveMatch, pending: PendingOnlineMove): boolean {
    return (
      onlineTransport?.send({
        protocolVersion: 1,
        type: "submit-action",
        gameId: match.gameId,
        rulesVersion: match.rulesVersion,
        matchId: match.matchId,
        actionId: pending.actionId,
        expectedRevision: pending.expectedRevision,
        action: pending.action,
      }) ?? false
    );
  }

  function schedulePendingMoveReconciliation(actionId: string) {
    if (pendingMoveTimer !== null) window.clearTimeout(pendingMoveTimer);
    pendingMoveTimer = window.setTimeout(() => {
      pendingMoveTimer = null;
      if (pendingOnlineMove?.actionId !== actionId) return;
      pendingMoveSyncRequested = true;
      if (multiplayer?.connected) {
        pendingMoveSyncRequested = false;
        onlineTransport?.resume();
      }
      pendingMoveTimer = window.setTimeout(() => {
        pendingMoveTimer = null;
        if (pendingOnlineMove?.actionId === actionId) void reconcilePendingOnlineMove(actionId);
      }, 4_000);
    }, 4_000);
  }

  function updateFromServer(
    input: unknown,
    delivery: { syncId?: string; acceptedActionId?: string } = {},
  ) {
    const match = parseLiveMatch(input);
    if (!multiplayer?.online || !match || match.matchId !== multiplayer.roomId) return;
    const matchedGame = clientGames.get(match.gameId, match.rulesVersion);
    if (!matchedGame) {
      returnToLobbyFromUnavailableMatch(
        match.matchId,
        "This game version is no longer supported. Return to games to start another match.",
      );
      return;
    }
    if (Number.isSafeInteger(match.revision) && match.revision < multiplayer.revision) return;
    const pendingResolution = reconcilePendingMove(pendingOnlineMove, match, delivery);
    const pendingResolved = pendingResolution === "accepted";
    const pendingUnconfirmed = pendingResolution === "not-applied";
    if (pendingResolved) clearPendingOnlineMove(false);
    const previousMatch = multiplayer.match;
    if (previousMatch?.matchId !== match.matchId || previousMatch?.gameNumber !== match.gameNumber)
      clearAiPresentation();
    else if (match.status !== "active" && aiPresentation?.matchId === match.matchId)
      clearAiPresentation();
    const previousMoves = gameActionCount();
    const previousOutcome = gameOutcome();
    const previousStatus = previousMatch?.status;
    const previousGameNumber = previousMatch?.gameNumber ?? 0;
    serverClockOffset = Number.isFinite(match.serverNow) ? match.serverNow - Date.now() : 0;
    multiplayer.match = match;
    currentGameId = match.gameId;
    if (matchCoordinator.isClosedForSeat(match, multiplayer.seat))
      clearActiveMatch(multiplayer.roomId);
    const ownReconnectRemaining =
      match.reconnectRemainingMs?.[multiplayer.seat === "first" ? 0 : 1];
    if (typeof ownReconnectRemaining === "number" && Number.isFinite(ownReconnectRemaining))
      multiplayer.clientReconnectBudgetMs = ownReconnectRemaining;
    multiplayer.revision = match.revision;
    multiplayer.connected = Boolean(match.connectedSeats?.[multiplayer.seat === "first" ? 0 : 1]);
    wins = { first: match.wins?.first ?? 0, second: match.wins?.second ?? 0 };
    round = Math.max(1, match.gameNumber ?? 1);

    const ownIndex = multiplayer.seat === "first" ? 0 : 1;
    if (match.closedSeats?.[ownIndex]) {
      leaveOnlineGame();
      return;
    }
    const isStartingAgreedBoard =
      match.status === "countdown" &&
      Boolean(match.rematchCountdown || match.nextReady?.every(Boolean));
    if (isStartingAgreedBoard && match.nextStartingSeat) {
      state = createCurrentState(match.nextStartingSeat, match.rulesVersion);
    } else if (match.state) {
      const parsed = matchedGame.inspectState(match.state, match.rulesVersion);
      if (parsed.ok) state = parsed.value.state;
      else {
        returnToLobbyFromUnavailableMatch(
          match.matchId,
          "The match state could not be verified. Return to games to start another match.",
        );
        return;
      }
    }

    if (pendingOnlineMove && !pendingResolved && multiplayer.connected) {
      const inspected =
        match.state === null ? null : matchedGame.inspectState(match.state, match.rulesVersion);
      const nextPlayer = inspected?.ok ? inspected.value.nextPlayer : null;
      if (canRetryPendingMove(pendingOnlineMove, match, nextPlayer)) {
        const retry = { ...pendingOnlineMove, expectedRevision: match.revision, retryCount: 1 };
        if (sendPendingOnlineMove(match, retry)) {
          pendingOnlineMove = retry;
          schedulePendingMoveReconciliation(retry.actionId);
        }
      } else if (pendingUnconfirmed && match.awaitingTurnReceipt?.seat !== multiplayer.seat) {
        clearPendingOnlineMove(false);
        announce("Move not confirmed. Choose a column to try again.");
      }
    }

    if (
      match.status === "active" &&
      match.gameNumber !== previousGameNumber &&
      previousGameNumber > 0
    ) {
      if (resultDialogTimer !== null) window.clearTimeout(resultDialogTimer);
      resultDialogTimer = null;
      isRevealingWin = false;
      pendingWinSeat = null;
      if (gameDialog.open) gameDialog.close("new-round");
      announce(
        `Game ${match.gameNumber} of the series. ${playerName(gameStartingPlayer())} goes first.`,
      );
    }
    if (previousStatus === "countdown" && match.status === "active") {
      playNotes([587, 784], "triangle");
    }
    let delayedAiAction = false;
    if (gameActionCount() > previousMoves) {
      const actionDelta = gameActionCount() - previousMoves;
      const playedSeat = inspectCurrentState()?.lastActionPlayer ?? "first";
      const outcome = gameOutcome();
      const aiSeatIndex = match.seatKinds?.findIndex((kind) => kind === "ai") ?? -1;
      const aiSeat = aiSeatIndex === 0 ? "first" : aiSeatIndex === 1 ? "second" : null;
      const shouldDelayAi = Boolean(
        previousMatch &&
        (previousStatus === "active" || previousStatus === "countdown") &&
        ["active", "between-games", "completed"].includes(match.status) &&
        aiSeat === playedSeat &&
        actionDelta <= 2,
      );
      delayedAiAction =
        shouldDelayAi &&
        beginAiMovePresentation(
          match,
          gameActionCount(),
          playedSeat,
          matchedGame.getSessionPolicy(match.rulesVersion).turnDurationMs,
        );
      if (outcome?.kind === "win" && previousOutcome === null && !delayedAiAction) {
        pendingWinSeat = outcome.winner;
        isRevealingWin = true;
        playWinRevealSound();
        renderStatus();
        scheduleResultDialog(outcome);
      } else if (outcome?.kind === "draw" && !delayedAiAction) {
        playNotes(
          [playedSeat === "first" ? 440 : 554],
          playedSeat === "first" ? "triangle" : "sine",
        );
        playNotes([392, 330], "sine");
        renderStatus();
        scheduleResultDialog(outcome);
      } else {
        if (!delayedAiAction && !outcome) {
          playNotes(
            [playedSeat === "first" ? 440 : 554],
            playedSeat === "first" ? "triangle" : "sine",
          );
          announce(`${playerName(gameNextPlayer())}’s turn.`);
        }
        renderStatus();
      }
    } else {
      renderStatus();
    }
    const changedOutcome = match.outcome !== previousMatch?.outcome;
    const changedStatus = match.status !== previousStatus;
    if (match.status === "completed" && (changedStatus || changedOutcome)) {
      accountSession.markGameHistoryStale();
      if (!multiplayer.accountLinked && match.seriesWinner) {
        const ownIndex = multiplayer.seat === "first" ? 0 : 1;
        const rawOpponentName = match.playerNames?.[ownIndex === 0 ? 1 : 0];
        const opponentName =
          typeof rawOpponentName === "string"
            ? Array.from(
                rawOpponentName
                  .normalize("NFKC")
                  // eslint-disable-next-line no-control-regex -- Sanitize names before persisting local match history.
                  .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
                  .replace(/\s+/g, " ")
                  .trim(),
              )
                .slice(0, 24)
                .join("") || "Opponent"
            : "Opponent";
        const finishReason: GuestGameHistoryEntry["finish_reason"] = match.outcome?.startsWith(
          "reconnect-timeout-",
        )
          ? "disconnect"
          : match.outcome?.startsWith("timeout-")
            ? "timeout"
            : match.outcome?.startsWith("resigned-") ||
                match.outcome?.startsWith("series-conceded-")
              ? "forfeit"
              : "normal";
        const completedAt = new Date(match.seriesCompletedAt ?? match.serverNow ?? Date.now());
        const saved = saveGuestHistory({
          completion_id: `${match.matchId}:${match.seriesNumber ?? 1}`,
          game_id: match.gameId,
          rules_version: match.rulesVersion,
          result: match.seriesWinner === multiplayer.seat ? "win" : "loss",
          opponent_name: opponentName,
          wins: ownIndex === 0 ? match.wins.first : match.wins.second,
          losses: ownIndex === 0 ? match.wins.second : match.wins.first,
          series_target: match.seriesTarget,
          finish_reason: finishReason,
          completed_at: new Date(
            Number.isFinite(completedAt.getTime()) ? completedAt.getTime() : Date.now(),
          ).toISOString(),
        });
        if (saved) accountSession.refreshGuestHistory();
      }
    }
    const delayingAiPresentation =
      delayedAiAction ||
      Boolean(
        aiPresentation?.matchId === match.matchId &&
        aiPresentation.actionCount === gameActionCount() &&
        aiPresentation.thinking,
      );
    const timedOut =
      match.outcome?.startsWith("timeout-") || match.outcome?.startsWith("reconnect-timeout-");
    if (
      previousStatus === "active" &&
      timedOut &&
      ["between-games", "completed"].includes(match.status) &&
      changedOutcome
    ) {
      playNotes([440, 349, 262], "triangle");
    }
    if (
      appStore.getSnapshot().screen === "match" &&
      !delayingAiPresentation &&
      !isRevealingWin &&
      match.status === "between-games" &&
      (changedStatus || changedOutcome)
    )
      openOnlineGameResult();
    if (
      appStore.getSnapshot().screen === "match" &&
      !delayingAiPresentation &&
      !isRevealingWin &&
      match.status === "completed" &&
      (changedStatus || changedOutcome)
    )
      openOnlineSeriesResult();
    if (
      appStore.getSnapshot().screen === "match" &&
      ["cancelled", "expired"].includes(match.status) &&
      (changedStatus || changedOutcome)
    )
      openOnlineEndResult();
    if (
      !delayingAiPresentation &&
      gameDialog.open &&
      dialogMode === "online-between" &&
      match.status === "between-games"
    )
      openOnlineGameResult();
    if (
      !delayingAiPresentation &&
      gameDialog.open &&
      dialogMode === "online-complete" &&
      match.status === "completed"
    )
      openOnlineSeriesResult();
    const delayingTurnReceipt = Boolean(
      aiPresentation?.matchId === match.matchId &&
      aiPresentation.actionCount === gameActionCount() &&
      aiPresentation.thinking &&
      match.awaitingTurnReceipt?.seat === multiplayer.seat,
    );
    if (!delayingTurnReceipt) acknowledgeTurnReceipt(match);
  }

  function connectOnlineSocket() {
    if (
      !multiplayer?.online ||
      (multiplayer.match !== null && ["cancelled", "expired"].includes(multiplayer.match.status))
    )
      return;
    if (!onlineTransport) {
      onlineTransport = new MatchTransport({
        url: onlineSocketUrl(),
        seatToken: multiplayer.seatToken,
        getReconnectRemainingMs: localReconnectRemainingMs,
        getMatchStatus: () => multiplayer?.match?.status,
        onStateChange: (connection) => {
          if (!multiplayer?.online) return;
          if (!connection.connected) multiplayer.turnReceiptAckedRevision = null;
          multiplayer.connected = connection.connected;
          multiplayer.reconnecting = connection.reconnectAttempt > 0;
          multiplayer.reconnectAttempt = connection.reconnectAttempt;
          multiplayer.reconnectStopped = connection.reconnectStopped;
          multiplayer.clientDisconnectedAt = connection.disconnectedAt;
          multiplayer.resuming = connection.resuming;
          if (connection.connected && pendingMoveSyncRequested) {
            pendingMoveSyncRequested = false;
            onlineTransport?.resume();
          }
          updateMultiplayerUi();
        },
        onMessage: (message) => {
          if (!multiplayer?.online) return;
          if (message.type === "match") {
            updateFromServer(message.match, message);
          } else if (message.type === "reaction" || message.type === "quick-message") {
            showActivityNotice(
              message.type === "reaction"
                ? {
                    eventId: message.eventId,
                    seat: message.seat,
                    kind: "reaction",
                    reactionId: message.reactionId,
                  }
                : {
                    eventId: message.eventId,
                    seat: message.seat,
                    kind: "message",
                    message: message.message,
                  },
            );
          } else if (
            (message.type === "reaction-rejected" || message.type === "quick-message-rejected") &&
            message.code === "rate-limited"
          ) {
            showSocialError("Wait a moment before sending again.");
          } else if (
            message.type === "quick-message-rejected" &&
            message.code === "invalid-message"
          ) {
            showSocialError("Keep your message under 100 characters.");
          } else if (message.type === "quick-message-rejected") {
            showSocialError("Message not sent. Try again.");
          } else if (message.type === "reaction-rejected") {
            showSocialError("Reaction not sent. Try again.");
          } else if (message.type === "action-rejected") {
            if (
              pendingOnlineMove &&
              (!message.actionId || message.actionId === pendingOnlineMove.actionId)
            ) {
              clearPendingOnlineMove();
              if (message.code === "stale-revision") {
                announce("Updating the board…");
                onlineTransport?.resume();
              } else announce("Move not accepted. Choose a column to try again.");
            }
          }
        },
      });
    }
    onlineTransport.connect();
  }

  function resumeOnlineMatch() {
    if (
      !multiplayer?.online ||
      multiplayer.resuming ||
      (multiplayer.match !== null && ["cancelled", "expired"].includes(multiplayer.match.status))
    )
      return;
    if (!onlineTransport) {
      connectOnlineSocket();
      return;
    }
    onlineTransport.resume();
  }

  async function enterOnlineMatch(
    matchId: string,
    seatToken: string,
    seat: PlayerSeat,
    displayName: string | null = null,
    accountLinked = accountSession.getSnapshot().status === "signed-in",
  ) {
    onlineTransport?.dispose();
    onlineTransport = null;
    clearPendingOnlineMove(false);
    if (activityNoticeTimer !== null) window.clearTimeout(activityNoticeTimer);
    activityNoticeTimer = null;
    activityNotice = null;
    hasUnreadActivity = false;
    if (socialFeedbackTimer !== null) window.clearTimeout(socialFeedbackTimer);
    socialFeedbackTimer = null;
    socialFeedback = null;
    lastSocialSentAt = 0;
    socialSentTimes = [];
    multiplayer = {
      online: true,
      roomId: matchId,
      seatToken,
      seat,
      displayName,
      accountLinked,
      connected: false,
      revision: 0,
      match: null,
      reconnectAttempt: 0,
      reconnectStopped: false,
      reconnecting: false,
      turnReceiptAckedRevision: null,
      clientDisconnectedAt: null,
      clientReconnectBudgetMs: null,
      resuming: false,
    };
    matchSessionStorage.saveSeat(matchId, {
      seatToken,
      seat,
      displayName: multiplayer.displayName,
      gameId: currentGameId,
      accountLinked,
    });
    saveActiveMatch({
      matchId,
      seatToken,
      seat,
      displayName: multiplayer.displayName,
      gameId: currentGameId,
      accountLinked,
    });
    // Authentication over the match socket returns the authoritative snapshot.
    connectOnlineSocket();
    updateMultiplayerUi();
  }

  async function createOnlineMatch({
    visibility,
    seriesTarget,
    matchAnySeries,
    displayName,
  }: CreateRoomInput) {
    updateOnlineDialog({ busy: true, error: "Creating your game…" });
    try {
      const creation =
        visibility === "public"
          ? await matchCoordinator.quickMatch({
              gameId: currentGameId,
              rulesVersion: currentGame().rulesVersion,
              seriesTarget,
              matchAnySeries,
              displayName,
            })
          : await matchCoordinator.createRoom({
              gameId: currentGameId,
              rulesVersion: currentGame().rulesVersion,
              visibility,
              seriesTarget,
              displayName,
            });
      if (creation.status === "blocked") {
        showMatchLockNotice(creation.lock);
        return;
      }
      if (creation.status === "rejected") {
        activeMatchNotice = "";
        renderActiveMatchBanner();
        const error =
          typeof creation.body.error === "string"
            ? creation.body.error
            : "The game could not be created.";
        throw new Error(error);
      }
      const result = creation;
      returnToGamesAfterCreateDialog = false;
      rememberDisplayName(onlineForm.name);
      currentInviteLink = "";
      if (visibility === "invite") {
        const link = new URL(window.location.href);
        link.search = "";
        link.searchParams.set("match", result.matchId);
        link.hash = result.inviteToken ? `invite=${encodeURIComponent(result.inviteToken)}` : "";
        currentInviteLink = link.href;
        matchSessionStorage.saveInviteLink(result.matchId, link.href);
        presentOnlineDialog({
          mode: "invite",
          title: "Invite a friend",
          inviteLink: link.href,
          closeLabel: "Done",
        });
      } else onlineDialog.close();
      const cleanUrl = new URL(window.location.href);
      cleanUrl.search = `?match=${encodeURIComponent(result.matchId)}`;
      cleanUrl.hash = "";
      history.replaceState(null, "", cleanUrl);
      roomFromUrl = result.matchId;
      showGameView();
      if (!result.listed && visibility === "invite") {
        updateOnlineDialog({
          error:
            "Room created, but it could not be added to the public list. You can still share its link.",
        });
      }
      await enterOnlineMatch(
        result.matchId,
        result.seatToken,
        result.seat ?? "first",
        displayName ?? "",
        accountSession.getIdentity() !== null,
      );
    } catch (error: unknown) {
      activeMatchNotice = "";
      renderActiveMatchBanner();
      console.error("Could not create online match", error);
      updateOnlineDialog({
        error:
          error instanceof TypeError
            ? "Could not reach the game service. Check your connection and try again."
            : errorMessage(error),
        busy: false,
      });
    }
  }

  async function createOpponentOnlineMatch(
    gameId: string,
    profileId: string,
    inHousePlayerId: string,
    opponentName: string,
    seriesTarget: 1 | 2 | 3,
    displayName: string,
  ) {
    if (!clientGames.get(gameId) || !isRegisteredOpponentProfile(gameId, profileId)) return;
    let lock = readDeviceMatchLock();
    if (lock && !("pending" in lock)) lock = await matchCoordinator.reconcileLock(lock);
    if (lock) {
      showMatchLockNotice(lock);
      return;
    }

    currentGameId = gameId;
    state = createCurrentState("first");
    round = 1;
    wins = { first: 0, second: 0 };
    try {
      const creation = await matchCoordinator.createAiRoom({
        gameId: currentGameId,
        profileId,
        inHousePlayerId,
        seriesTarget,
        displayName,
        opponentName,
      });
      if (creation.status === "blocked") {
        showMatchLockNotice(creation.lock);
        return;
      }
      if (creation.status === "rejected") {
        const error =
          typeof creation.body.error === "string"
            ? creation.body.error
            : "The game could not be started.";
        updateOnlineDialog({
          error:
            error === "unsupported-opponent" || error === "opponent-unavailable"
              ? "That opponent just became unavailable. Choose another match."
              : "Could not start the game. Try again.",
          busy: false,
        });
        return;
      }
      const cleanUrl = new URL(window.location.href);
      cleanUrl.search = `?match=${encodeURIComponent(creation.matchId)}`;
      cleanUrl.hash = "";
      history.replaceState(null, "", cleanUrl);
      roomFromUrl = creation.matchId;
      currentInviteLink = "";
      showGameView();
      returnToGamesAfterCreateDialog = false;
      rememberDisplayName(onlineForm.name);
      await enterOnlineMatch(
        creation.matchId,
        creation.seatToken,
        "second",
        displayName,
        accountSession.getIdentity() !== null,
      );
      if (onlineDialogView?.mode === "opponent") {
        opponentIntent = null;
        onlineDialog.close();
      }
    } catch (error: unknown) {
      console.error("Could not start AI opponent match", error);
      const message =
        error instanceof TypeError
          ? "Could not reach the game service. Check your connection and try again."
          : "Could not start the game. Try again.";
      if (onlineDialogView?.mode === "opponent")
        updateOnlineDialog({ error: message, busy: false });
      else appStore.update({ lobbyError: message });
    }
  }

  function renderJoinMatchRules(match: MatchApiBody | null) {
    const game = GAME_CATALOG.find((item) => item.id === match?.gameId);
    if (game && game.id !== currentGameId) {
      currentGameId = game.id;
      state = createCurrentState("first");
    }
    const seriesTarget = match?.seriesTarget;
    if (seriesTarget !== 1 && seriesTarget !== 2 && seriesTarget !== 3)
      return {
        title: `Join ${game?.title ?? "game"}`,
        showRules: false,
        rulesSeries: "",
        rulesDetails: "",
      };

    const series = seriesTarget === 1 ? "One game" : `First to win ${seriesTarget} games`;
    const rawTurnSeconds = match?.turnSeconds;
    const turnSeconds =
      typeof rawTurnSeconds === "number" && Number.isSafeInteger(rawTurnSeconds)
        ? rawTurnSeconds
        : 45;
    if (!match)
      return {
        title: `Join ${game?.title ?? "game"}`,
        showRules: false,
        rulesSeries: "",
        rulesDetails: "",
      };
    const timeoutRule =
      match.turnTimeoutForfeitsGame === false ? "Timeouts end a turn" : "Timeout loses this game";
    const tieRule = match.tiesAwardNoPoint === false ? "Ties add a point" : "Ties add no points";
    const gameRules =
      game?.id === "reversi"
        ? "Place a disc to trap and flip opposing discs. Most discs wins. If you have no legal move, you pass."
        : game?.description;
    const matchRules = `${turnSeconds} sec per turn · ${timeoutRule} · ${tieRule}`;
    return {
      title: `Join ${game?.title ?? "game"}`,
      showRules: true,
      rulesSeries: series,
      rulesDetails: gameRules ? `${gameRules} · ${matchRules}` : matchRules,
    };
  }

  async function showJoinGamePrompt(match: MatchApiBody | null = null) {
    let lock = readDeviceMatchLock();
    if (lock && !("pending" in lock)) lock = await matchCoordinator.reconcileLock(lock);
    if (lock) {
      showMatchLockNotice(lock);
      return;
    }
    const rules = renderJoinMatchRules(match);
    onlineForm.joinAsGuest = accountSession.getIdentity() === null;
    clearPlayerNameError();
    presentOnlineDialog({
      mode: "join",
      ...rules,
      showRules: rules.showRules,
      closeLabel: "Not now",
    });
  }

  async function fetchJoinMatchPreview(matchId: string): Promise<MatchApiBody> {
    const inviteToken = new URLSearchParams(window.location.hash.slice(1)).get("invite");
    const result = await matchCoordinator.previewRoom(matchId, inviteToken, supportedGameVersions);
    if (result.status === "unavailable") {
      const error: PreviewError = Object.assign(new Error(result.code), { code: result.code });
      throw error;
    }
    return result.preview;
  }

  function showJoinPreviewFailure(error: PreviewError) {
    const errorCode = error.code ?? "";
    if (["room-expired", "room-unavailable", "room-full", "not-found"].includes(errorCode)) {
      const message =
        errorCode === "room-expired"
          ? "This match link has expired. Browse active matches or choose a game."
          : errorCode === "room-full"
            ? "This match has already been joined. Browse active matches or choose a game."
            : "This match is no longer available. Browse active matches or choose a game.";
      returnToLobbyFromUnavailableMatch(roomFromUrl, message);
      return;
    }
    const messages: Record<
      string,
      Readonly<{ title: string; message: string; action: "retry" | "reload" | null }>
    > = {
      "invite-invalid": {
        title: "Invalid invite",
        message: "Ask the host for a valid private link.",
        action: null,
      },
      "client-update-required": {
        title: "Update required",
        message: "Reload the game to join this match.",
        action: "reload",
      },
    };
    const fallback = {
      title: "Match details unavailable",
      message:
        error.name === "TimeoutError"
          ? "The connection is taking too long. Check your network and try again."
          : error instanceof TypeError
            ? "Could not reach the game. Check your network and try again."
            : "The match details could not be loaded. Try again.",
      action: "retry" as const,
    };
    appStore.update({ openingMatch: { status: "error", ...(messages[errorCode] ?? fallback) } });
  }

  function showMatchOpening() {
    appStore.update({
      screen: "opening",
      title: "Games",
      description: "Opening match…",
      openingMatch: {
        status: "loading",
        title: "Opening match",
        message: "Checking the match link…",
        action: null,
      },
      controls: {
        ...appStore.getSnapshot().controls,
        homeVisible: true,
        newGameVisible: false,
        playOnlineVisible: false,
        soundVisible: false,
      },
      connection: { ...appStore.getSnapshot().connection, visible: false },
    });
  }

  async function joinOnlineMatch(
    displayName: string | null = null,
    isCurrentAttempt: () => boolean = () => true,
    useAccountIdentity = accountSession.getIdentity() !== null,
  ) {
    const matchId = roomFromUrl;
    if (!matchId) return;
    const inviteToken = new URLSearchParams(window.location.hash.slice(1)).get("invite");
    let result;
    try {
      result = await matchCoordinator.joinRoom(matchId, {
        inviteToken,
        displayName,
        identityMode: useAccountIdentity ? "account" : "guest",
        supportedGames: supportedGameVersions,
      });
    } catch (error) {
      activeMatchNotice = "";
      renderActiveMatchBanner();
      throw error;
    }
    if (!isCurrentAttempt()) {
      if (result.status === "joined") {
        try {
          await matchCoordinator.leaveWaitingRoom(matchId, result.credential.seatToken);
        } catch {
          /* The dismissed join flow must not reopen the match. */
        }
        matchCoordinator.releasePendingReservation(result.reservation);
      }
      return;
    }
    if (result.status === "blocked") {
      showMatchLockNotice(result.lock);
      return;
    }
    if (result.status === "closed") {
      returnToLobbyFromUnavailableMatch(
        matchId,
        "This match has ended. Browse active matches or choose a game.",
      );
      return;
    }
    if (result.status === "unavailable") {
      throw new Error("The match could not be reached. Check your connection and try again.");
    }
    if (result.status === "rejected") {
      activeMatchNotice = "";
      renderActiveMatchBanner();
      const errorCode = typeof result.body.error === "string" ? result.body.error : "join-failed";
      if (["room-expired", "room-unavailable", "room-full", "not-found"].includes(errorCode)) {
        const message =
          errorCode === "room-expired"
            ? "This match link has expired. Browse active matches or choose a game."
            : errorCode === "room-full"
              ? "This match has already been joined. Browse active matches or choose a game."
              : "This match is no longer available. Browse active matches or choose a game.";
        returnToLobbyFromUnavailableMatch(matchId, message);
        return;
      }
      if (errorCode === "player-name-taken") {
        updateOnlineDialog({
          mode: "join",
          title: "Join game",
          description: "",
          nameInvalid: true,
          busy: false,
          error:
            "That name is already in this match. Choose another, or leave it blank for a random name.",
        });
        return;
      }
      if (errorCode === "same-account-match") {
        presentOnlineDialog({
          mode: "message",
          title: "Choose another match",
          description: "You can’t join a match created by the same account.",
          closeLabel: "Close",
        });
        return;
      }
      const title =
        errorCode === "room-full"
          ? "This game is full"
          : errorCode === "room-expired"
            ? "Game link expired"
            : errorCode === "room-unavailable"
              ? "This room was closed"
              : errorCode === "client-update-required"
                ? "Update required"
                : "Could not join this game";
      const description =
        errorCode === "room-full"
          ? "This match was just filled. Close this message and choose another."
          : errorCode === "room-expired"
            ? "This room is closed. Ask the host for a new link."
            : errorCode === "room-unavailable"
              ? "The host closed this room. Choose another match or create one."
              : errorCode === "invite-invalid"
                ? "This private invite is invalid. Ask the host for a new link."
                : errorCode === "client-update-required"
                  ? "Reload this page, then try joining again."
                  : "Check the link and try again.";
      presentOnlineDialog({ mode: "message", title, description, closeLabel: "Close" });
      return;
    }

    if (result.status === "joined") {
      rememberDisplayName(onlineForm.name);
      history.replaceState(
        null,
        "",
        `${window.location.pathname}?match=${encodeURIComponent(matchId)}`,
      );
      showGameView();
    }
    const credential = result.credential;
    await enterOnlineMatch(
      matchId,
      credential.seatToken,
      credential.seat,
      credential.displayName ?? displayName,
      useAccountIdentity,
    );
    if (onlineDialog.open) onlineDialog.close();
  }

  async function submitJoin() {
    if (!onlineDialogView || onlineDialogView.mode !== "join" || onlineDialogView.busy) return;
    unlockAudio();
    updateOnlineDialog({ busy: true, error: "", nameInvalid: false });
    clearPlayerNameError();
    const attempt = ++joinAttempt;
    const useAccountIdentity = !onlineForm.joinAsGuest;
    try {
      if (useAccountIdentity && !(await accountSession.getIdentityForRequest()))
        throw new Error("Your sign-in session is unavailable. Sign in again or choose Guest.");
      await joinOnlineMatch(
        chosenDisplayName(useAccountIdentity),
        () => attempt === joinAttempt,
        useAccountIdentity,
      );
    } catch (error: unknown) {
      updateOnlineDialog({
        error:
          error instanceof TypeError
            ? "Could not reach the game. Check your connection and try again."
            : errorMessage(error),
        busy: false,
      });
    }
  }

  async function retryOnlineDialog() {
    if (
      !roomFromUrl ||
      !onlineDialogView ||
      onlineDialogView.mode !== "retry" ||
      onlineDialogView.busy
    )
      return;
    updateOnlineDialog({ busy: true });
    await openRequestedMatch(roomFromUrl);
  }

  async function openCreateMatch(gameId = "connect-four") {
    let lock = readDeviceMatchLock();
    if (lock && !("pending" in lock)) lock = await matchCoordinator.reconcileLock(lock);
    if (lock) {
      showMatchLockNotice(lock);
      return;
    }
    returnToGamesAfterCreateDialog = appStore.getSnapshot().screen === "lobby";
    currentGameId = gameId;
    state = createCurrentState("first");
    round = 1;
    wins = { first: 0, second: 0 };
    onlineForm = {
      ...onlineForm,
      seriesTarget: 2,
      matchAnySeries: false,
      visibility: "public",
      optionsExpanded: false,
    };
    clearPlayerNameError();
    showGameView();
    presentOnlineDialog({
      mode: "create",
      title: `Create a ${currentGame().title} match`,
      closeLabel: "Close",
    });
  }

  function updateOnlineForm(
    field:
      "name" | "joinAsGuest" | "seriesTarget" | "matchAnySeries" | "visibility" | "optionsExpanded",
    value: string | number | boolean,
  ) {
    if (field === "name" && typeof value === "string") onlineForm.name = value.slice(0, 24);
    else if (field === "joinAsGuest" && typeof value === "boolean") onlineForm.joinAsGuest = value;
    else if (field === "seriesTarget" && (value === 1 || value === 2 || value === 3))
      onlineForm.seriesTarget = value;
    else if (field === "matchAnySeries" && typeof value === "boolean")
      onlineForm.matchAnySeries = value;
    else if (field === "visibility" && (value === "public" || value === "invite"))
      onlineForm.visibility = value;
    else if (field === "optionsExpanded" && typeof value === "boolean")
      onlineForm.optionsExpanded = value;
    else return;
    if (onlineDialogView) updateOnlineDialog({ ...onlineForm, nameInvalid: false, error: "" });
  }

  async function openRequestedMatch(requestedMatchId: string) {
    const attempt = ++matchOpenAttempt;
    showMatchOpening();
    let lock = readDeviceMatchLock();
    if (lock && !("pending" in lock) && lock.matchId !== requestedMatchId) {
      lock = await matchCoordinator.reconcileLock(lock);
    }
    if (attempt !== matchOpenAttempt) return;
    if (lock && ("pending" in lock || lock.matchId !== requestedMatchId)) {
      roomFromUrl = null;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("match");
      cleanUrl.hash = "";
      history.replaceState(null, "", cleanUrl);
      showLobby();
      showMatchLockNotice(lock);
      return;
    }

    const stored =
      lock && !("pending" in lock) && lock.matchId === requestedMatchId
        ? lock
        : matchSessionStorage.readSeat(requestedMatchId);
    if (stored?.seatToken && (stored.seat === "first" || stored.seat === "second")) {
      currentGameId = stored.gameId ?? currentGameId;
      if (!clientGames.get(currentGameId)) {
        returnToLobbyFromUnavailableMatch(
          requestedMatchId,
          "This game is no longer supported in this version. Return to games to start another match.",
        );
        return;
      }
      state = createCurrentState("first");
      currentInviteLink =
        stored.seat === "first" ? matchSessionStorage.readInviteLink(requestedMatchId) : "";
      showGameView();
      try {
        await joinOnlineMatch();
      } catch {
        presentOnlineDialog({
          mode: "message",
          title: "Could not connect",
          description: "Check your connection and reopen the game link.",
          closeLabel: "Not now",
        });
      }
      return;
    }
    try {
      const preview = await fetchJoinMatchPreview(requestedMatchId);
      if (attempt !== matchOpenAttempt) return;
      const game = typeof preview.gameId === "string" ? clientGames.get(preview.gameId) : null;
      if (!game) {
        returnToLobbyFromUnavailableMatch(
          requestedMatchId,
          "This game is not available in this version. Return to games to choose another match.",
        );
        return;
      }
      currentGameId = game.gameId;
      state = createCurrentState("first");
      showGameView();
      await showJoinGamePrompt(preview);
    } catch (error) {
      if (attempt !== matchOpenAttempt) return;
      showJoinPreviewFailure(
        error instanceof Error
          ? (error as PreviewError)
          : (new Error("Could not load this match.") as PreviewError),
      );
    }
  }

  function retryOpenMatch() {
    if (roomFromUrl) void openRequestedMatch(roomFromUrl);
  }

  function goToGames() {
    matchOpenAttempt += 1;
    if (multiplayer?.online) {
      roomFromUrl = null;
      const matchUrl = new URL(window.location.href);
      matchUrl.searchParams.delete("match");
      matchUrl.hash = "";
      history.replaceState(null, "", matchUrl);
      if (gameDialog.open) gameDialog.close("back-to-games");
      if (onlineDialog.open) onlineDialog.close();
      appStore.update({ lobbyError: "" });
      showLobby();
      setLobbyTab("matches", true);
      return;
    }
    multiplayer = null;
    currentInviteLink = "";
    state = createCurrentState("first");
    wins = { first: 0, second: 0 };
    round = 1;
    roomFromUrl = null;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = "";
    cleanUrl.hash = "";
    history.replaceState(null, "", cleanUrl);
    showLobby();
    setLobbyTab("matches", true);
  }

  function createMatch(gameId: string) {
    if (clientGames.get(gameId)) {
      currentGameId = gameId;
      void openCreateMatch(gameId);
    }
  }

  function playOpponentMatch(
    gameId: string,
    profileId: string,
    inHousePlayerId: string,
    opponentName: string,
    seriesTarget: 1 | 2 | 3,
  ) {
    if (!clientGames.get(gameId) || !isRegisteredOpponentProfile(gameId, profileId)) return;
    appStore.update({ lobbyError: "" });
    opponentIntent = { gameId, profileId, inHousePlayerId, opponentName, seriesTarget };
    returnToGamesAfterCreateDialog = appStore.getSnapshot().screen === "lobby";
    currentGameId = gameId;
    onlineForm = { ...onlineForm, seriesTarget, visibility: "public", optionsExpanded: false };
    clearPlayerNameError();
    showGameView();
    presentOnlineDialog({
      mode: "opponent",
      title: `Play ${currentGame().title}`,
      description: `Against ${opponentName}`,
      showRules: true,
      rulesSeries: seriesTarget === 1 ? "One game" : `First to win ${seriesTarget}`,
      rulesDetails: "Ties add no wins.",
      closeLabel: "Close",
    });
  }

  function joinMatch(match: LobbyMatch) {
    if (
      match &&
      /^[A-Za-z0-9_-]{22}$/.test(match.matchId) &&
      GAME_CATALOG.some((game) => game.id === match.gameId)
    ) {
      currentGameId = match.gameId;
      state = createCurrentState("first");
      void openLobbyMatch(match);
    }
  }

  function handlePageVisible(visible: boolean) {
    if (visible && multiplayer?.online) resumeOnlineMatch();
  }

  function resumeMatch() {
    void resumeActiveMatch();
  }

  function shareGameLink() {
    if (!currentInviteLink) return;
    presentOnlineDialog({
      mode: "invite",
      title: "Share game link",
      inviteLink: currentInviteLink,
      closeLabel: "Done",
    });
  }

  function cancelMatch() {
    openCancelRoomConfirmation();
  }
  function forfeitMatch() {
    openForfeitConfirmation();
  }

  function sendReaction(reactionId: MatchReactionId): boolean {
    if (
      !multiplayer?.online ||
      multiplayer.match?.status !== "active" ||
      !multiplayer.connected ||
      !onlineTransport
    )
      return false;
    unlockAudio();
    const now = Date.now();
    socialSentTimes = socialSentTimes.filter((sentAt) => now - sentAt < 10_000);
    if (now - lastSocialSentAt < 800 || socialSentTimes.length >= 6) {
      showSocialError("Wait a moment before sending again.");
      return false;
    }
    lastSocialSentAt = now;
    socialSentTimes.push(now);
    if (!onlineTransport.send({ type: "reaction", reactionId })) {
      showSocialError("Reaction not sent. Check your connection.");
      return false;
    }
    return true;
  }

  function sendQuickMessage(value: string): boolean {
    const message = normalizeQuickMessage(value);
    if (!message) {
      announce("Keep your message to 100 characters or fewer.");
      return false;
    }
    if (
      !multiplayer?.online ||
      multiplayer.match?.status !== "active" ||
      !multiplayer.connected ||
      !onlineTransport
    ) {
      announce("Reconnect before sending a message.");
      return false;
    }
    unlockAudio();
    const now = Date.now();
    socialSentTimes = socialSentTimes.filter((sentAt) => now - sentAt < 10_000);
    if (now - lastSocialSentAt < 800 || socialSentTimes.length >= 6) {
      showSocialError("Wait a moment before sending again.");
      return false;
    }
    lastSocialSentAt = now;
    socialSentTimes.push(now);
    if (!onlineTransport.send({ type: "quick-message", message })) {
      showSocialError("Message not sent. Check your connection.");
      return false;
    }
    return true;
  }

  function submitCreate() {
    if (!onlineDialogView || onlineDialogView.mode !== "create" || onlineDialogView.busy) return;
    unlockAudio();
    const displayName = chosenDisplayName();
    updateOnlineDialog({ busy: true, error: "Preparing your game…" });
    void createOnlineMatch({
      visibility: onlineForm.visibility,
      seriesTarget: onlineForm.seriesTarget,
      matchAnySeries: onlineForm.matchAnySeries,
      displayName,
    });
  }

  function submitOpponent() {
    if (
      !onlineDialogView ||
      onlineDialogView.mode !== "opponent" ||
      onlineDialogView.busy ||
      !opponentIntent
    )
      return;
    unlockAudio();
    const intent = opponentIntent;
    updateOnlineDialog({ busy: true, error: "Starting your game…" });
    void createOpponentOnlineMatch(
      intent.gameId,
      intent.profileId,
      intent.inHousePlayerId,
      intent.opponentName,
      intent.seriesTarget,
      chosenDisplayName(),
    );
  }

  async function copyInviteLink() {
    if (!onlineDialogView?.inviteLink) return;
    try {
      await navigator.clipboard.writeText(onlineDialogView.inviteLink);
      updateOnlineDialog({ copyLabel: "Link copied" });
    } catch {
      updateOnlineDialog({ error: "Copy is unavailable. Select and copy the link above." });
    }
  }

  function closeOnlineDialog() {
    if (onlineDialogView?.mode === "join" && onlineDialogView.busy) joinAttempt += 1;
    if (onlineDialogView?.mode === "opponent" && onlineDialogView.busy) return;
    if (onlineDialogView?.mode === "opponent") opponentIntent = null;
    onlineDialog.close();
  }
  function onOnlineDialogClosed() {
    if (returnToGamesAfterCreateDialog) {
      returnToGamesAfterCreateDialog = false;
      showLobby();
      setLobbyTab("games", true);
      return;
    }
    if (!multiplayer?.online && roomFromUrl) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("match");
      cleanUrl.hash = "";
      history.replaceState(null, "", cleanUrl);
      roomFromUrl = null;
      showLobby();
      setLobbyTab("matches", true);
    }
  }

  function retryConnection() {
    if (!multiplayer?.online || !onlineTransport) return;
    appStore.update({
      connection: {
        ...appStore.getSnapshot().connection,
        status: "Reconnecting to game…",
        retryVisible: false,
      },
    });
    onlineTransport.retry();
  }

  function updateMatchViewSnapshot() {
    const currentAiPresentation = aiPresentation;
    publishMatchView(
      createMatchViewSnapshot({
        game:
          clientGames.get(
            multiplayer?.match?.gameId ?? currentGameId,
            multiplayer?.match?.rulesVersion,
          ) ?? currentGame(),
        gameId: currentGameId,
        state,
        round,
        wins,
        multiplayer,
        aiPresentation: {
          thinking: Boolean(
            currentAiPresentation &&
            currentAiPresentation.matchId === multiplayer?.roomId &&
            currentAiPresentation.thinking,
          ),
          reveal: Boolean(
            currentAiPresentation &&
            currentAiPresentation.matchId === multiplayer?.roomId &&
            currentAiPresentation.reveal,
          ),
          revealStarted: Boolean(
            currentAiPresentation &&
            currentAiPresentation.matchId === multiplayer?.roomId &&
            currentAiPresentation.revealStarted,
          ),
          delayMs:
            currentAiPresentation && currentAiPresentation.matchId === multiplayer?.roomId
              ? currentAiPresentation.delayMs
              : 0,
          turnDeadline:
            currentAiPresentation && currentAiPresentation.matchId === multiplayer?.roomId
              ? currentAiPresentation.turnDeadline
              : null,
        },
        isRevealingWin,
        pendingWinSeat,
        pendingOnlineMove,
        serverClockOffset,
        socialFeedback,
        activityNotice,
        hasUnreadActivity,
        dialog: gameDialogView,
        dialogReturnValue: gameDialogReturnValue,
        onlineDialog: onlineDialogView,
        playerName,
      }),
    );
  }

  function presentOnlineDialog(view: OnlineDialogOptions) {
    const defaults: OnlineDialogView = {
      mode: "message",
      title: "",
      description: "",
      error: "",
      name: onlineForm.name,
      joinAsGuest: onlineForm.joinAsGuest,
      nameInvalid: false,
      showRules: false,
      rulesSeries: "",
      rulesDetails: "",
      seriesTarget: onlineForm.seriesTarget,
      matchAnySeries: onlineForm.matchAnySeries,
      visibility: onlineForm.visibility,
      optionsExpanded: onlineForm.optionsExpanded,
      inviteLink: "",
      copyLabel: "Copy link",
      busy: false,
      closeLabel: "Close",
    };
    onlineDialogView = Object.assign(defaults, view);
    appStore.update({ onlineSetupOpen: true });
    updateMatchViewSnapshot();
  }

  function updateOnlineDialog(patch: Partial<OnlineDialogView>) {
    if (!onlineDialogView) return;
    onlineDialogView = { ...onlineDialogView, ...patch };
    updateMatchViewSnapshot();
  }

  function showGameDialog(view: GameDialogView) {
    dialogMode = view.mode;
    gameDialogReturnValue = "";
    gameDialogView = view;
    updateMatchViewSnapshot();
  }

  function updateGameDialog(patch: Partial<GameDialogView>) {
    if (!gameDialogView) return;
    gameDialogView = { ...gameDialogView, ...patch };
    updateMatchViewSnapshot();
  }

  function makeGameDialog({
    mode,
    mark = "!",
    markTone = "draw",
    title,
    description = "",
    primaryLabel,
    primaryDisabled = false,
    primaryDanger = false,
    secondaryLabel = null,
    secondaryDisabled = false,
    canDismiss = false,
    hasSeriesResult = false,
    series = null,
    countdown = null,
  }: GameDialogOptions): GameDialogView {
    return {
      mode,
      mark,
      markTone,
      title,
      description,
      primaryLabel,
      primaryDisabled,
      primaryDanger,
      secondaryLabel,
      secondaryDisabled,
      canDismiss,
      hasSeriesResult,
      series,
      countdown,
    };
  }

  function openResultDialog(outcome: GameOutcome) {
    if (multiplayer?.online) {
      if (multiplayer.match?.status === "completed") openOnlineSeriesResult();
      else openOnlineGameResult();
      return;
    }

    const winner = outcome.kind === "win" ? outcome.winner : null;
    if (winner) {
      showGameDialog(
        makeGameDialog({
          mode: "local-result",
          mark: winner === "first" ? "1" : "2",
          markTone: winner,
          title: `${playerName(winner)} wins!`,
          description: `Score: ${wins.first}–${wins.second}.`,
          primaryLabel: "New game",
          secondaryLabel: "Winning line",
        }),
      );
    } else {
      showGameDialog(
        makeGameDialog({
          mode: "local-result",
          mark: "T",
          title: "It’s a tie!",
          description: `No more moves are available. Score stays ${wins.first}–${wins.second}.`,
          primaryLabel: "New game",
          secondaryLabel: "View board",
        }),
      );
    }
  }

  function scheduleResultDialog(outcome: GameOutcome) {
    if (resultDialogTimer !== null) window.clearTimeout(resultDialogTimer);
    resultDialogTimer = window.setTimeout(() => {
      resultDialogTimer = null;
      if (outcome.kind === "win") finishWinReveal();
      else openResultDialog(outcome);
    }, RESULT_BOARD_PREVIEW_MS);
  }

  function openOnlineGameResult() {
    if (!multiplayer?.online || !multiplayer.match || multiplayer.match.status !== "between-games")
      return;
    const match = multiplayer.match;
    const outcome = match.outcome ?? "draw";
    const reportedWinner = outcome.startsWith("win-") ? outcome.slice(4) : "";
    const winner: PlayerSeat | null =
      reportedWinner === "first"
        ? "first"
        : reportedWinner === "second"
          ? "second"
          : outcome === "draw"
            ? null
            : outcome.endsWith("-first")
              ? "second"
              : outcome.endsWith("-second")
                ? "first"
                : null;
    const ownReady = match.nextReady?.[multiplayer.seat === "first" ? 0 : 1] ?? false;
    const otherSeat = multiplayer.seat === "first" ? "second" : "first";
    const reason = outcome.startsWith("timeout-")
      ? ` ${playerName(outcome.endsWith("-first") ? "first" : "second")} ran out of time.`
      : outcome.startsWith("resigned-") || outcome.startsWith("reconnect-timeout-")
        ? " The game was forfeited."
        : outcome === "draw"
          ? " No more moves are available."
          : "";
    const countdown = nextGameCountdownView(match);
    showGameDialog(
      makeGameDialog({
        mode: "online-between",
        mark: winner === "first" ? "1" : winner === "second" ? "2" : "T",
        markTone: winner ?? "draw",
        title: winner
          ? `${playerName(winner)} won Game ${match.gameNumber}`
          : `Game ${match.gameNumber} is tied`,
        description: reason.trim(),
        primaryLabel: ownReady ? `Waiting for ${playerName(otherSeat)}…` : "Next game",
        primaryDisabled: ownReady,
        secondaryLabel: "Leave series",
        canDismiss: false,
        hasSeriesResult: true,
        series: {
          score: `${match.wins.first}–${match.wins.second}`,
          firstName: playerName("first"),
          firstNeeded: remainingGameWinsLabel(Math.max(0, match.seriesTarget - match.wins.first)),
          secondName: playerName("second"),
          secondNeeded: remainingGameWinsLabel(Math.max(0, match.seriesTarget - match.wins.second)),
        },
        countdown,
      }),
    );
  }

  function openOnlineSeriesResult() {
    if (!multiplayer?.online || !multiplayer.match || multiplayer.match.status !== "completed")
      return;
    const match = multiplayer.match;
    const winner = match.seriesWinner;
    const ownIndex = multiplayer.seat === "first" ? 0 : 1;
    const otherSeat = multiplayer.seat === "first" ? "second" : "first";
    const ownReady = match.rematchReady?.[ownIndex] ?? false;
    const opponentLeft = match.closedSeats?.[otherSeat === "first" ? 0 : 1] ?? false;
    const opponentIsInHouse = match.seatKinds?.[otherSeat === "first" ? 0 : 1] === "ai";
    const description =
      opponentLeft && opponentIsInHouse
        ? `Final score ${match.wins.first}–${match.wins.second}. Your opponent has finished playing for now.`
        : match.outcome?.startsWith("series-conceded-")
          ? `Final score ${match.wins.first}–${match.wins.second}. The other player conceded.`
          : `Final score ${match.wins.first}–${match.wins.second}.`;
    showGameDialog(
      makeGameDialog({
        mode: "online-complete",
        mark: winner === "first" ? "1" : winner === "second" ? "2" : "✓",
        markTone: winner ?? "draw",
        title: winner ? `${playerName(winner)} wins the series!` : "Series complete",
        description,
        primaryLabel: opponentLeft
          ? "Rematch unavailable"
          : ownReady
            ? `Waiting for ${playerName(otherSeat)}…`
            : "Rematch",
        primaryDisabled: opponentLeft || ownReady,
        secondaryLabel: "Back to games",
      }),
    );
  }

  function openOnlineEndResult() {
    if (
      !multiplayer?.online ||
      !multiplayer.match ||
      !["cancelled", "expired"].includes(multiplayer.match.status)
    )
      return;
    const wasCancelled = multiplayer.match.status === "cancelled";
    const wasHostCancelled = multiplayer.match.outcome === "room-cancelled";
    if (wasHostCancelled && multiplayer.seat === "first") {
      leaveOnlineGame();
      announce("Room closed. You can start another game.");
      return;
    }
    const isExpiredWaitingRoom =
      multiplayer.match.status === "expired" &&
      multiplayer.seat === "first" &&
      multiplayer.match.gameNumber === 0;
    if (isExpiredWaitingRoom) {
      showGameDialog(
        makeGameDialog({
          mode: "online-room-expired",
          mark: "—",
          title: "No one joined in time",
          description: "Create a new room to restart the timer, or return to games.",
          primaryLabel: "Create new room",
          secondaryLabel: "Back to games",
          canDismiss: false,
        }),
      );
      return;
    }
    const description =
      multiplayer.match.outcome === "both-players-disconnected"
        ? "No winner was recorded."
        : wasCancelled
          ? "No result was recorded."
          : "";
    showGameDialog(
      makeGameDialog({
        mode: "online-ended",
        mark: "—",
        title: wasHostCancelled
          ? "Room closed"
          : wasCancelled
            ? "Series cancelled"
            : "This game link expired",
        description,
        primaryLabel: "Back to games",
      }),
    );
  }

  async function recreateExpiredRoom() {
    if (
      !multiplayer?.online ||
      multiplayer.seat !== "first" ||
      multiplayer.match?.status !== "expired"
    )
      return;
    const expiredMatch = multiplayer.match;
    const roomSettings: CreateRoomInput = {
      visibility: expiredMatch.visibility,
      seriesTarget: expiredMatch.seriesTarget,
      matchAnySeries: onlineForm.matchAnySeries,
      displayName: multiplayer.displayName ?? expiredMatch.playerNames?.[0] ?? "",
    };
    currentGameId = expiredMatch.gameId;
    gameDialog.close("recreate-room");
    leaveOnlineGame();
    onlineForm = {
      ...onlineForm,
      name: roomSettings.displayName,
      visibility: roomSettings.visibility,
      seriesTarget: roomSettings.seriesTarget,
    };
    presentOnlineDialog({
      mode: "create",
      title: `Create a new ${currentGame().title} match`,
      busy: true,
      error: "Creating a new room…",
      name: roomSettings.displayName,
      visibility: roomSettings.visibility,
      seriesTarget: roomSettings.seriesTarget,
    });
    await createOnlineMatch(roomSettings);
  }

  function refreshMatchStatus() {
    const session = multiplayer;
    if (!session?.online) return;
    void matchApi
      .getMatch(session.roomId, session.seatToken)
      .then((result) => {
        if (multiplayer !== session) return;
        if (result.ok) updateFromServer(result.body);
        else onlineTransport?.resume();
      })
      .catch(() => {
        if (multiplayer === session) onlineTransport?.resume();
      });
  }

  function sendOnlineAction(type: string) {
    if (!multiplayer?.online || !onlineTransport?.send({ type })) {
      announce("Reconnecting. Your choice has not been sent yet.");
      return false;
    }
    return true;
  }

  async function leaveCompletedSeries() {
    const session = multiplayer;
    if (!session?.online || !canLeaveSeriesResult(session.match)) return;
    updateGameDialog({ secondaryDisabled: true, secondaryLabel: "Leaving…" });
    try {
      const result = await matchApi.leaveCompletedSeries(session.roomId, session.seatToken);
      if (multiplayer !== session) return;
      if (result.ok) {
        leaveOnlineGame();
        return;
      }
      updateGameDialog({
        description: "Could not leave the series. Check your connection and try again.",
        secondaryDisabled: false,
        secondaryLabel: "Back to games",
      });
    } catch {
      if (multiplayer !== session) return;
      updateGameDialog({
        description: "Could not leave the series. Check your connection and try again.",
        secondaryDisabled: false,
        secondaryLabel: "Try again",
      });
    }
  }

  function openCancelRoomConfirmation() {
    if (
      !multiplayer?.online ||
      multiplayer.seat !== "first" ||
      multiplayer.match?.status !== "waiting"
    )
      return;
    showGameDialog(
      makeGameDialog({
        mode: "online-confirm-cancel-room",
        title: "Close this waiting room?",
        description: "The room will close now, and its link will stop working.",
        primaryLabel: "Close room",
        primaryDanger: true,
        secondaryLabel: "Keep room open",
      }),
    );
  }

  function openForfeitConfirmation() {
    if (!multiplayer?.online || multiplayer.match?.status !== "active") return;
    showGameDialog(
      makeGameDialog({
        mode: "online-confirm-forfeit",
        title: "Forfeit this game?",
        description: "Your opponent wins this game. The series continues unless this decides it.",
        primaryLabel: "Forfeit game",
        primaryDisabled: !multiplayer.connected,
        primaryDanger: true,
        secondaryLabel: "Keep playing",
      }),
    );
  }

  async function cancelWaitingRoom() {
    if (!multiplayer?.online || multiplayer.seat !== "first") return;
    updateGameDialog({ primaryDisabled: true, primaryLabel: "Closing room…" });
    try {
      const result = await matchCoordinator.cancelWaitingRoom(
        multiplayer.roomId,
        multiplayer.seatToken,
      );
      if (result.status === "cancelled") {
        leaveOnlineGame();
        announce("Waiting room cancelled.");
        return;
      }
      if (result.status === "not-waiting") {
        updateFromServer(result.match);
        if (gameDialog.open && dialogMode === "online-confirm-cancel-room")
          gameDialog.close("cancel-not-available");
        return;
      }
      throw new Error(result.message);
    } catch (error: unknown) {
      updateGameDialog({
        title: "Could not close room",
        description:
          error instanceof TypeError ? "Check your connection and try again." : errorMessage(error),
        primaryDisabled: false,
        primaryLabel: "Try again",
      });
    }
  }

  async function leaveWaitingMatch() {
    const current = multiplayer;
    if (
      isLeavingWaitingMatch ||
      !current?.online ||
      current.seat !== "second" ||
      (current.match && current.match.status !== "waiting")
    )
      return;
    isLeavingWaitingMatch = true;
    appStore.update({
      connection: {
        ...appStore.getSnapshot().connection,
        leaveDisabled: true,
        status: "Leaving match…",
      },
    });
    try {
      const result = await matchCoordinator.leaveWaitingRoom(current.roomId, current.seatToken);
      if (result.status === "not-waiting") {
        isLeavingWaitingMatch = false;
        if (multiplayer === current) updateFromServer(result.match);
        return;
      }
      if (result.status === "rejected") {
        isLeavingWaitingMatch = false;
        appStore.update({
          connection: {
            ...appStore.getSnapshot().connection,
            leaveDisabled: false,
            status: result.message,
          },
        });
        return;
      }
      isLeavingWaitingMatch = false;
      if (multiplayer === current) leaveOnlineGame();
    } catch (error) {
      isLeavingWaitingMatch = false;
      if (multiplayer !== current) return;
      leaveOnlineGame();
      appStore.update({
        lobbyError:
          error instanceof TypeError
            ? "You left the match. Its seat may remain unavailable until the room expires."
            : "You left the match, but its seat may remain unavailable until the room expires.",
      });
    }
  }

  function leaveOnlineGame() {
    clearAiPresentation();
    isLeavingWaitingMatch = false;
    if (!multiplayer?.online) {
      roomFromUrl = null;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("match");
      cleanUrl.hash = "";
      history.replaceState(null, "", cleanUrl);
      if (gameDialog.open) gameDialog.close("leave-game");
      if (onlineDialog.open) onlineDialog.close();
      showLobby();
      return;
    }
    const matchId = multiplayer.roomId;
    onlineTransport?.dispose();
    onlineTransport = null;
    clearPendingOnlineMove(false);
    if (activityNoticeTimer !== null) window.clearTimeout(activityNoticeTimer);
    activityNoticeTimer = null;
    activityNotice = null;
    if (socialFeedbackTimer !== null) window.clearTimeout(socialFeedbackTimer);
    socialFeedbackTimer = null;
    socialFeedback = null;
    matchSessionStorage.removeSeat(matchId);
    matchSessionStorage.removeInviteLink(matchId);
    currentInviteLink = "";
    clearActiveMatch(matchId);
    multiplayer = null;
    serverClockOffset = 0;
    state = createCurrentState("first");
    round = 1;
    wins = { first: 0, second: 0 };
    isRevealingWin = false;
    pendingWinSeat = null;
    if (resultDialogTimer !== null) window.clearTimeout(resultDialogTimer);
    resultDialogTimer = null;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("match");
    cleanUrl.hash = "";
    history.replaceState(null, "", cleanUrl);
    if (gameDialog.open) gameDialog.close("leave-game");
    if (onlineDialog.open) onlineDialog.close();
    dialogMode = "local-result";
    roomFromUrl = null;
    showLobby();
    setLobbyTab("matches", true);
    renderStatus();
    announce("You left the online game.");
  }

  function openRestartConfirmation() {
    showGameDialog(
      makeGameDialog({
        mode: "local-confirm-restart",
        title: "Start a new game?",
        description: "This clears the board. The score stays.",
        primaryLabel: "New game",
        secondaryLabel: "Keep playing",
      }),
    );
  }

  function handleGameDialogPrimary() {
    if (dialogMode === "online-room-expired") {
      if (!multiplayer?.online || !multiplayer.match) return;
      updateGameDialog({
        primaryDisabled: true,
        secondaryDisabled: true,
        primaryLabel: "Creating room…",
      });
      void recreateExpiredRoom();
      return;
    }
    if (dialogMode === "online-confirm-cancel-room") {
      void cancelWaitingRoom();
      return;
    }
    if (dialogMode === "online-confirm-forfeit") {
      if (sendOnlineAction("resign")) {
        updateGameDialog({ primaryDisabled: true, primaryLabel: "Forfeiting…" });
      }
      return;
    }
    if (dialogMode === "online-between") {
      if (!multiplayer) return;
      if (sendOnlineAction("next-game")) {
        updateGameDialog({
          primaryDisabled: true,
          primaryLabel: `Waiting for ${multiplayer.seat === "first" ? "Player 2" : "Player 1"}…`,
        });
      }
      return;
    }
    if (dialogMode === "online-confirm-concede") {
      if (sendOnlineAction("concede-series")) {
        updateGameDialog({ primaryDisabled: true, primaryLabel: "Ending series…" });
      }
      return;
    }
    if (dialogMode === "online-complete") {
      if (!multiplayer) return;
      if (sendOnlineAction("rematch")) {
        updateGameDialog({
          primaryDisabled: true,
          primaryLabel: `Waiting for ${multiplayer.seat === "first" ? "Player 2" : "Player 1"}…`,
        });
      }
      return;
    }
    if (dialogMode === "online-ended") {
      leaveOnlineGame();
      return;
    }
    gameDialog.close("new-round");
    startNewRound();
  }

  function handleGameDialogSecondary() {
    if (dialogMode === "online-room-expired") {
      leaveOnlineGame();
      return;
    }
    if (dialogMode === "online-between") {
      if (!multiplayer) return;
      const winner = multiplayer.seat === "first" ? "Player 2" : "Player 1";
      showGameDialog(
        makeGameDialog({
          mode: "online-confirm-concede",
          title: "Concede the series?",
          description: `${winner} wins the series. You can’t rejoin.`,
          primaryLabel: "Concede series",
          primaryDanger: true,
          secondaryLabel: "Keep playing",
        }),
      );
      return;
    }
    if (dialogMode === "online-confirm-concede") {
      openOnlineGameResult();
      return;
    }
    if (dialogMode === "online-confirm-cancel-room") {
      gameDialog.close("keep-room-open");
      return;
    }
    if (dialogMode === "online-confirm-forfeit") {
      gameDialog.close("keep-playing");
      return;
    }
    if (dialogMode === "online-complete") {
      void leaveCompletedSeries();
      return;
    }
    gameDialog.close("review");
  }

  function dismissGameDialog(returnValue = "dismiss-round-result") {
    gameDialog.close(returnValue);
  }

  function gameDialogClosed(returnValue = gameDialogReturnValue) {
    gameDialogReturnValue = "";
    if (returnValue === "dismiss-round-result")
      document.querySelector<HTMLButtonElement>(".header-back-button")?.focus();
    else if (gameOutcome()) {
      if (returnValue === "review" || returnValue === "")
        document.querySelector<HTMLElement>("#board")?.focus();
    } else if (returnValue === "review") document.querySelector<HTMLElement>("#board")?.focus();
    else if (returnValue === "keep-room-open")
      document.querySelector<HTMLButtonElement>(".cancel-room-button")?.focus();
    else if (returnValue === "keep-playing")
      document.querySelector<HTMLButtonElement>(".forfeit-game-button")?.focus();
    else if (returnValue === "")
      document.querySelector<HTMLButtonElement>(".new-game-button")?.focus();
  }

  function renderStatus() {
    updateMultiplayerUi();
  }

  function finishWinReveal() {
    const outcome = gameOutcome();
    if (outcome?.kind !== "win" || !isRevealingWin) return;
    if (resultDialogTimer !== null) window.clearTimeout(resultDialogTimer);
    resultDialogTimer = null;
    isRevealingWin = false;
    pendingWinSeat = null;
    renderStatus();
    if (multiplayer?.online) {
      if (multiplayer.match?.status === "between-games") openOnlineGameResult();
      else if (multiplayer.match?.status === "completed") openOnlineSeriesResult();
      else openResultDialog(outcome);
    } else openResultDialog(outcome);
  }

  function playGameAction(action: unknown) {
    const game = currentGame();
    const version = currentRulesVersion();
    const parsedAction = game.parseAction(action, version);
    const seat = gameNextPlayer();
    if (!parsedAction.ok || !seat) return;
    if (multiplayer) {
      if (
        pendingOnlineMove ||
        !multiplayer.connected ||
        multiplayer.match?.status !== "active" ||
        seat !== multiplayer.seat
      )
        return;
      const actionId = crypto.randomUUID();
      const expectedRevision = multiplayer.revision;
      pendingOnlineMove = {
        actionId,
        action: parsedAction.value,
        previousStateKey: JSON.stringify(state) ?? "",
        seat: multiplayer.seat,
        expectedRevision,
        retryCount: 0,
      };
      updateMatchViewSnapshot();
      const sent = multiplayer.match
        ? sendPendingOnlineMove(multiplayer.match, pendingOnlineMove)
        : false;
      if (!sent) {
        clearPendingOnlineMove();
        announce("Move not sent. Check your connection and try again.");
        return;
      }
      schedulePendingMoveReconciliation(actionId);
      return;
    }

    commitGameAction(seat, parsedAction.value);
  }

  async function reconcilePendingOnlineMove(actionId: string) {
    const session = multiplayer;
    if (!session?.online || pendingOnlineMove?.actionId !== actionId) return;
    try {
      const result = await matchApi.getMatch(session.roomId, session.seatToken);
      if (pendingOnlineMove?.actionId !== actionId || multiplayer !== session) return;
      if (result.ok) {
        updateFromServer(result.body, { syncId: `move-recovery-${actionId}` });
        return;
      }
      if ([401, 404, 410].includes(result.status)) {
        returnToLobbyFromUnavailableMatch(
          session.roomId,
          "This match is no longer available. Browse active matches or choose a game.",
        );
        return;
      }
    } catch {
      /* The authoritative read may also fail while the connection is unavailable. */
    }
    if (pendingOnlineMove?.actionId === actionId && multiplayer === session) {
      clearPendingOnlineMove();
      announce("Move confirmation timed out. Check the board, then try again.");
    }
  }

  function commitGameAction(seat: PlayerSeat, action: unknown) {
    const result = currentGame().applyAction(state, seat, action, currentRulesVersion());
    if (!result.ok) {
      announce("That move could not be played.");
      return;
    }

    const movedSeat = seat;
    state = result.value;
    const outcome = gameOutcome();
    if (outcome?.kind === "win") {
      wins[outcome.winner] += 1;
      pendingWinSeat = outcome.winner;
      isRevealingWin = true;
      playWinRevealSound();
      announce("A winning line is on the board.");
    } else {
      playNotes([movedSeat === "first" ? 440 : 554], movedSeat === "first" ? "triangle" : "sine");
    }
    if (outcome?.kind === "draw") {
      playNotes([392, 330], "sine");
    } else {
      if (!outcome) announce(`${playerName(gameNextPlayer())}’s turn.`);
    }

    renderStatus();
    if (outcome?.kind === "win") {
      document.querySelector<HTMLElement>("#board")?.focus();
      scheduleResultDialog(outcome);
    } else if (outcome?.kind === "draw") {
      document.querySelector<HTMLElement>("#board")?.focus();
      scheduleResultDialog(outcome);
    }
  }

  function startNewRound() {
    if (multiplayer?.online) {
      announce("Online rematches are not available yet.");
      return;
    }
    if (resultDialogTimer !== null) window.clearTimeout(resultDialogTimer);
    resultDialogTimer = null;
    isRevealingWin = false;
    pendingWinSeat = null;
    if (gameDialog.open) gameDialog.close("new-round");
    round += 1;
    const previousStarter = gameStartingPlayer() ?? "first";
    const starter =
      round % 2 === 0 ? (previousStarter === "first" ? "second" : "first") : previousStarter;
    state = createCurrentState(starter);
    announce(`Game ${round}. ${playerName(starter)} goes first.`);
    renderStatus();
    if (!multiplayer || multiplayer.seat === "first")
      document.querySelector<HTMLElement>("#board")?.focus();
  }

  function newGame() {
    if (gameActionCount() > 0 && !gameOutcome()) openRestartConfirmation();
    else startNewRound();
  }

  function start() {
    if (started) return;
    started = true;
    window.addEventListener("popstate", handleLobbyPopState);
    startupTimer = window.setTimeout(() => {
      startupTimer = null;
      if (!started) return;
      renderActiveMatchBanner();
      document.addEventListener("visibilitychange", handleVisibilityChange);
      if (roomFromUrl) void openRequestedMatch(roomFromUrl);
      else if (clientGames.get(new URLSearchParams(window.location.search).get("game") ?? "")) {
        showGameView();
        void validateSavedMatchOnStartup();
      } else {
        showLobby();
        void validateSavedMatchOnStartup();
      }
      renderStatus();
    }, 0);
  }

  function dispose() {
    started = false;
    window.removeEventListener("popstate", handleLobbyPopState);
    if (startupTimer !== null) window.clearTimeout(startupTimer);
    startupTimer = null;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    clearPendingOnlineMove(false);
    clearAiPresentation();
    if (activityNoticeTimer !== null) window.clearTimeout(activityNoticeTimer);
    activityNoticeTimer = null;
    activityNotice = null;
    if (socialFeedbackTimer !== null) window.clearTimeout(socialFeedbackTimer);
    socialFeedbackTimer = null;
    socialFeedback = null;
    if (resultDialogTimer !== null) window.clearTimeout(resultDialogTimer);
    resultDialogTimer = null;
    onlineTransport?.dispose();
    onlineTransport = null;
  }

  function handleVisibilityChange() {
    handlePageVisible(document.visibilityState === "visible");
  }

  function handleGameDialogPrimaryAction() {
    handleGameDialogPrimary();
  }
  function handleGameDialogSecondaryAction() {
    handleGameDialogSecondary();
  }

  return {
    store: appStore,
    start,
    dispose,
    playAction: playGameAction,
    setLobbyTab,
    openLeaderboard,
    closeLeaderboard,
    clearLobbyTabFocusRequest,
    createMatch,
    playOpponentMatch,
    joinMatch,
    resumeMatch,
    retryOpenMatch,
    goToGames,
    playOnline: () => {
      void openCreateMatch(currentGameId);
    },
    newGame,
    toggleSound,
    toggleTheme,
    shareGameLink,
    cancelMatch,
    leaveWaitingMatch,
    forfeitMatch,
    retryConnection,
    refreshMatchStatus,
    sendReaction,
    reportSocialFailure: showSocialError,
    markActivityRead: () => {
      hasUnreadActivity = false;
      updateMatchViewSnapshot();
    },
    sendQuickMessage,
    submitCreate,
    submitOpponent,
    submitJoin,
    retryOnlineDialog,
    updateOnlineForm,
    copyInviteLink,
    closeOnlineDialog,
    onlineDialogClosed: onOnlineDialogClosed,
    dismissGameDialog,
    gameDialogClosed,
    gameDialogPrimary: handleGameDialogPrimaryAction,
    gameDialogSecondary: handleGameDialogSecondaryAction,
  } satisfies GameController;
}
