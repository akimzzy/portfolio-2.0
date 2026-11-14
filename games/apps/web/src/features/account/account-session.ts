import {
  createClient,
  type RealtimeChannel,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  GUEST_HISTORY_STORAGE_KEY,
  readGuestHistory,
  removeGuestHistory,
  type GuestGameHistoryEntry,
} from "./guest-history.ts";

export type AccountIdentity = Readonly<{ userId: string; username: string; accessToken: string }>;
export type GameHistoryEntry = Readonly<{
  completion_id: string;
  game_id: string;
  result: "win" | "loss";
  opponent_name: string;
  wins: number;
  losses: number;
  series_target: number;
  finish_reason: "normal" | "timeout" | "disconnect" | "forfeit";
  completed_at: string;
  replay_available: boolean | null;
  record_source: "verified" | "guest_import";
  ranking_status:
    | "ranked"
    | "unranked_legacy"
    | "unranked_guest"
    | "unranked_rematch"
    | "unranked_pair_cap"
    | "unranked_privacy";
}>;
export type GameHistoryRound = Readonly<{
  round_number: number;
  game_id: string;
  rules_version: number;
  player_seat: "first" | "second";
  winner_seat: "first" | "second" | null;
  finish_reason: GameHistoryEntry["finish_reason"];
  completed_at: string;
  final_state: unknown;
}>;
export type GameHistoryDetails = Readonly<{
  status: "idle" | "loading" | "ready" | "error";
  rounds: readonly GameHistoryRound[];
  error: string;
}>;
export type FriendRecord = Readonly<{
  id: string;
  username: string;
  since: string;
  seriesPlayed: number;
  wins: number;
  losses: number;
}>;
export type FriendMatchHistoryPage = Readonly<{
  matches: GameHistoryEntry[];
  hasMore: boolean;
}>;
export type FriendRequest = Readonly<{ id: string; username: string; requestedAt: string }>;
export type FriendMatchInvite = Readonly<{
  id: string;
  matchId: string;
  gameId: string;
  seriesTarget: 1 | 2 | 3;
  inviteToken: string;
  senderUsername: string;
  createdAt: string;
  expiresAt: string;
}>;
export type FriendLookup = Readonly<{
  username: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "removed" | null;
  requestedByYou: boolean | null;
}>;
export type FriendRequestResponse = "accept" | "decline" | "cancel";
export type AccountSnapshot = Readonly<{
  status: "unconfigured" | "loading" | "signed-out" | "profile-required" | "signed-in" | "error";
  username: string | null;
  usernameChangeAvailableAt: string | null;
  usernameChangeError: string;
  leaderboardPublic: boolean;
  joinedAt: string | null;
  busy: boolean;
  error: string;
  history: GameHistoryEntry[];
  historyCount: number;
  historyHasMore: boolean;
  historyStatus: "idle" | "loading" | "ready" | "error";
  historyRefreshing: boolean;
  historyLoadingMore: boolean;
  historyError: string;
  historyMoreError: string;
  historyDetails: Readonly<Record<string, GameHistoryDetails>>;
  historyFetchedAt: number | null;
  historyAttemptedAt: number | null;
  guestHistoryCount: number;
  guestHistoryImporting: boolean;
  guestHistoryError: string;
  friends: FriendRecord[];
  incomingFriendRequests: FriendRequest[];
  outgoingFriendRequests: FriendRequest[];
  incomingFriendRequestCount: number | null;
  incomingMatchInvites: FriendMatchInvite[];
  matchInvitesStatus: "idle" | "loading" | "ready" | "error";
  matchInvitesError: string;
  matchInvitesFetchedAt: number | null;
  matchInvitesBusyId: string | null;
  friendsStatus: "idle" | "loading" | "ready" | "error";
  friendsRefreshing: boolean;
  friendsError: string;
  friendsActionBusy: boolean;
  friendsFetchedAt: number | null;
}>;

const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const accountDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const HISTORY_CACHE_TTL_MS = 60_000;
const OAUTH_MATCH_RETURN_KEY = "games.oauth-match-return";
const OAUTH_MATCH_RETURN_TTL_MS = 15 * 60_000;
const HISTORY_INITIAL_LIMIT = 4;
const HISTORY_PAGE_SIZE = 10;
const FRIENDS_CACHE_TTL_MS = 60_000;
const MATCH_INVITES_CACHE_TTL_MS = 30_000;
const initialSnapshot: AccountSnapshot = {
  status: "loading",
  username: null,
  usernameChangeAvailableAt: null,
  usernameChangeError: "",
  leaderboardPublic: true,
  joinedAt: null,
  busy: false,
  error: "",
  history: [],
  historyCount: 0,
  historyHasMore: false,
  historyStatus: "idle",
  historyRefreshing: false,
  historyLoadingMore: false,
  historyError: "",
  historyMoreError: "",
  historyDetails: {},
  historyFetchedAt: null,
  historyAttemptedAt: null,
  guestHistoryCount: 0,
  guestHistoryImporting: false,
  guestHistoryError: "",
  friends: [],
  incomingFriendRequests: [],
  outgoingFriendRequests: [],
  incomingFriendRequestCount: null,
  incomingMatchInvites: [],
  matchInvitesStatus: "idle",
  matchInvitesError: "",
  matchInvitesFetchedAt: null,
  matchInvitesBusyId: null,
  friendsStatus: "idle",
  friendsRefreshing: false,
  friendsError: "",
  friendsActionBusy: false,
  friendsFetchedAt: null,
};

const HISTORY_FIELDS =
  "completion_id,game_id,result,opponent_name,wins,losses,series_target,finish_reason,completed_at,record_source,ranking_status";
const HISTORY_FIELDS_WITH_REPLAYS = `${HISTORY_FIELDS},game_history_rounds(round_number)`;
const FINISH_REASONS = ["normal", "timeout", "disconnect", "forfeit"] as const;
const RANKING_STATUSES = [
  "ranked",
  "unranked_legacy",
  "unranked_guest",
  "unranked_rematch",
  "unranked_pair_cap",
  "unranked_privacy",
] as const;

function parseHistoryEntry(value: unknown): GameHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.completion_id !== "string" ||
    !/^[A-Za-z0-9_-]{22}:[1-9][0-9]*$/.test(row.completion_id) ||
    typeof row.game_id !== "string" ||
    (row.result !== "win" && row.result !== "loss") ||
    typeof row.opponent_name !== "string" ||
    typeof row.wins !== "number" ||
    typeof row.losses !== "number" ||
    typeof row.series_target !== "number" ||
    !FINISH_REASONS.includes(row.finish_reason as GameHistoryEntry["finish_reason"]) ||
    !["verified", "guest_import"].includes(row.record_source as string) ||
    !RANKING_STATUSES.includes(row.ranking_status as GameHistoryEntry["ranking_status"]) ||
    typeof row.completed_at !== "string" ||
    !Number.isFinite(Date.parse(row.completed_at))
  )
    return null;
  return {
    completion_id: row.completion_id,
    game_id: row.game_id,
    result: row.result,
    opponent_name: row.opponent_name,
    wins: row.wins,
    losses: row.losses,
    series_target: row.series_target,
    finish_reason: row.finish_reason as GameHistoryEntry["finish_reason"],
    completed_at: row.completed_at,
    replay_available: Array.isArray(row.game_history_rounds)
      ? row.game_history_rounds.length > 0
      : null,
    record_source: row.record_source as GameHistoryEntry["record_source"],
    ranking_status: row.ranking_status as GameHistoryEntry["ranking_status"],
  };
}

function replayRelationUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "PGRST200" || code === "PGRST201" || code === "PGRST205" || code === "42P01";
}

function friendErrorMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();
  if (message.includes("not_authenticated")) return "Sign in again to manage friends.";
  if (message.includes("invalid_username"))
    return "Use a username with 3–20 letters, numbers, or underscores.";
  if (message.includes("player_not_found")) return "No player found with that username.";
  if (message.includes("already_friends")) return "You’re already friends.";
  if (message.includes("request_already_sent")) return "Your request is already waiting for them.";
  if (message.includes("incoming_request_exists"))
    return "They’ve already sent you a request. Accept it below.";
  if (message.includes("friend_request_unavailable"))
    return "That request is no longer available. Refresh your friends list.";
  if (message.includes("friendship_unavailable"))
    return "That friendship is no longer available. Refresh your friends list.";
  if (message.includes("not_allowed")) return "You can’t take that action on this request.";
  return "That action couldn’t be completed. Check your connection and try again.";
}

function parseHistoryRound(value: unknown): GameHistoryRound | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(row.round_number) ||
    (row.round_number as number) < 1 ||
    typeof row.game_id !== "string" ||
    !/^[a-z0-9-]{2,40}$/.test(row.game_id) ||
    !Number.isSafeInteger(row.rules_version) ||
    (row.rules_version as number) < 1 ||
    (row.player_seat !== "first" && row.player_seat !== "second") ||
    (row.winner_seat !== null && row.winner_seat !== "first" && row.winner_seat !== "second") ||
    !FINISH_REASONS.includes(row.finish_reason as GameHistoryRound["finish_reason"]) ||
    typeof row.completed_at !== "string" ||
    !Number.isFinite(Date.parse(row.completed_at)) ||
    !row.final_state ||
    typeof row.final_state !== "object" ||
    Array.isArray(row.final_state)
  )
    return null;
  return {
    round_number: row.round_number as number,
    game_id: row.game_id,
    rules_version: row.rules_version as number,
    player_seat: row.player_seat,
    winner_seat: row.winner_seat,
    finish_reason: row.finish_reason as GameHistoryRound["finish_reason"],
    completed_at: row.completed_at,
    final_state: row.final_state,
  };
}

function configuredClient(): SupabaseClient | null {
  const url = import.meta.env?.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    )
      return null;
  } catch {
    return null;
  }
  return createClient(url, key, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export class AccountSession {
  private readonly client: SupabaseClient | null;
  private snapshot: AccountSnapshot = initialSnapshot;
  private session: Session | null = null;
  private readonly listeners = new Set<() => void>();
  private authSubscription: { unsubscribe(): void } | null = null;
  private friendRequestChannel: RealtimeChannel | null = null;
  private friendRequestRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private friendRequestCountRequest = 0;
  private profileRequest = 0;
  private historyRequest = 0;
  private historyInFlight: Promise<void> | null = null;
  private historyMoreInFlight: Promise<void> | null = null;
  private readonly historyDetailsInFlight = new Map<string, Promise<void>>();
  private historyUserId: string | null = null;
  private historyInvalidationVersion = 0;
  private historyLoadedVersion = 0;
  private historyAttemptedVersion = 0;
  private historyReplayRelationSupported: boolean | null = null;
  private friendsUserId: string | null = null;
  private friendsRequest = 0;
  private friendsInFlight: Promise<void> | null = null;
  private matchInvitesRequest = 0;
  private matchInvitesInFlight: Promise<void> | null = null;
  private matchInvitesUserId: string | null = null;
  private readonly onGuestHistoryStorage = (event: StorageEvent) => {
    if (event.key === GUEST_HISTORY_STORAGE_KEY) this.refreshGuestHistory();
  };

  constructor(client: SupabaseClient | null) {
    this.client = client;
    this.snapshot = client ? initialSnapshot : { ...initialSnapshot, status: "unconfigured" };
    this.snapshot = { ...this.snapshot, guestHistoryCount: readGuestHistory().length };
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.snapshot;

  start(): void {
    if (!this.client || this.authSubscription) return;
    if (typeof window !== "undefined")
      window.addEventListener("storage", this.onGuestHistoryStorage);
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      if (
        !session &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("error")
      )
        clearOAuthMatchReturn();
      const previousUserId = this.session?.user.id;
      this.session = session;
      if (
        session &&
        previousUserId === session.user.id &&
        ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"].includes(_event) &&
        (this.snapshot.status === "signed-in" || this.snapshot.status === "profile-required")
      ) {
        if (!this.friendRequestChannel) {
          const userId = session.user.id;
          queueMicrotask(() => {
            if (this.session?.user.id === userId && !this.friendRequestChannel)
              this.startFriendRequestUpdates(userId);
          });
        }
        return;
      }
      if (!session || (previousUserId && previousUserId !== session.user.id)) this.clearHistory();
      this.profileRequest += 1;
      if (!session) {
        this.stopFriendRequestUpdates();
        this.update({
          status: "signed-out",
          username: null,
          usernameChangeAvailableAt: null,
          usernameChangeError: "",
          joinedAt: null,
          error: "",
          busy: false,
        });
        return;
      }
      if (previousUserId !== session.user.id) {
        const userId = session.user.id;
        queueMicrotask(() => {
          if (this.session?.user.id === userId) this.startFriendRequestUpdates(userId);
        });
      }
      this.update({
        status: "loading",
        username: null,
        usernameChangeAvailableAt: null,
        usernameChangeError: "",
        busy: false,
        error: "",
      });
      const request = this.profileRequest;
      queueMicrotask(() => {
        void this.loadProfile(session, request);
      });
    });
    this.authSubscription = data.subscription;
  }

  stop(): void {
    this.profileRequest += 1;
    this.stopFriendRequestUpdates();
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
    if (typeof window !== "undefined")
      window.removeEventListener("storage", this.onGuestHistoryStorage);
  }

  getIdentity(): AccountIdentity | null {
    if (this.snapshot.status !== "signed-in" || !this.session || !this.snapshot.username)
      return null;
    return {
      userId: this.session.user.id,
      username: this.snapshot.username,
      accessToken: this.session.access_token,
    };
  }

  /** Wait for persisted auth to resolve before match creation/join, avoiding silent guest fallback. */
  async getIdentityForRequest(timeoutMs = 5_000): Promise<AccountIdentity | null> {
    if (this.snapshot.status === "loading") {
      await new Promise<void>((resolve, reject) => {
        let unsubscribe = () => {};
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(
            new Error("Account check is taking too long. Retry once your connection is back."),
          );
        }, timeoutMs);
        unsubscribe = this.subscribe(() => {
          if (this.snapshot.status === "loading") return;
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        });
      });
    }
    if (this.snapshot.status === "error") {
      throw new Error("Account check failed. Retry or sign out before starting a guest match.");
    }
    return this.getIdentity();
  }

  async signInWithGoogle(options: { preserveMatchLink?: boolean } = {}): Promise<void> {
    if (!this.client) {
      this.update({ error: "Sign-in is not configured yet." });
      return;
    }
    if (options.preserveMatchLink) saveOAuthMatchReturn();
    this.update({ busy: true, error: "" });
    try {
      const { error } = await this.client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        clearOAuthMatchReturn();
        this.update({ busy: false, error: "Google sign-in could not start. Please try again." });
      } else this.update({ busy: false });
    } catch {
      clearOAuthMatchReturn();
      this.update({ busy: false, error: "Google sign-in could not start. Please try again." });
    }
  }

  /** Consume the one-use invite return only after authentication and profile setup succeed. */
  takeOAuthMatchReturn(): string | null {
    try {
      const raw = window.sessionStorage.getItem(OAUTH_MATCH_RETURN_KEY);
      window.sessionStorage.removeItem(OAUTH_MATCH_RETURN_KEY);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object") return null;
      const saved = value as { url?: unknown; savedAt?: unknown };
      if (
        typeof saved.url !== "string" ||
        typeof saved.savedAt !== "number" ||
        Date.now() - saved.savedAt > OAUTH_MATCH_RETURN_TTL_MS
      )
        return null;
      const target = new URL(saved.url, window.location.origin);
      if (target.origin !== window.location.origin) return null;
      const matchId = target.searchParams.get("match");
      if (!matchId || !/^[A-Za-z0-9_-]{22}$/.test(matchId)) return null;
      return `${target.pathname}?match=${encodeURIComponent(matchId)}${target.hash}`;
    } catch {
      return null;
    }
  }

  async claimUsername(username: string): Promise<boolean> {
    const cleaned = username.trim();
    if (!this.client || !this.session) {
      this.update({ error: "Sign in again to choose a username." });
      return false;
    }
    if (!USERNAME_PATTERN.test(cleaned)) {
      this.update({ error: "Use 3–20 letters, numbers, or underscores. Start with a letter." });
      return false;
    }
    const userId = this.session.user.id;
    this.update({ busy: true, error: "" });
    try {
      const { data, error } = await this.client.rpc("claim_username", {
        requested_username: cleaned,
      });
      if (this.session?.user.id !== userId) return false;
      if (error) {
        const message = error.message.toLowerCase();
        this.update({
          busy: false,
          error:
            message.includes("username_taken") || message.includes("profiles_username_lower_unique")
              ? "That username is already taken. Try another."
              : message.includes("reserved_username")
                ? "Choose a different username."
                : message.includes("username_already_claimed")
                  ? "This account already has a username. Refresh to continue."
                  : "We could not save that username. Please try again.",
        });
        return false;
      }
      const saved = typeof data === "string" ? data : cleaned;
      this.update({
        status: "signed-in",
        username: saved,
        usernameChangeAvailableAt: null,
        usernameChangeError: "",
        leaderboardPublic: true,
        joinedAt: new Date().toISOString(),
        busy: false,
        error: "",
      });
      void this.loadGameHistory();
      return true;
    } catch {
      if (this.session?.user.id !== userId) return false;
      this.update({
        busy: false,
        error: "We could not save that username. Check your connection and try again.",
      });
      return false;
    }
  }

  async changeUsername(username: string): Promise<boolean> {
    const cleaned = username.trim();
    if (
      !this.client ||
      !this.session ||
      this.snapshot.status !== "signed-in" ||
      this.snapshot.busy
    ) {
      this.update({ usernameChangeError: "Sign in again before changing your username." });
      return false;
    }
    if (!USERNAME_PATTERN.test(cleaned)) {
      this.update({
        usernameChangeError: "Use 3–20 letters, numbers, or underscores. Start with a letter.",
      });
      return false;
    }
    if (cleaned.toLowerCase() === this.snapshot.username?.toLowerCase()) {
      this.update({ usernameChangeError: "Choose a different username." });
      return false;
    }
    const availableAt = this.snapshot.usernameChangeAvailableAt;
    if (availableAt && Date.parse(availableAt) > Date.now()) {
      this.update({
        usernameChangeError: `You can change your username again on ${accountDate.format(new Date(availableAt))}.`,
      });
      return false;
    }

    const userId = this.session.user.id;
    this.update({ busy: true, usernameChangeError: "" });
    try {
      const { data, error } = await this.client.rpc("change_username", {
        requested_username: cleaned,
      });
      if (this.session?.user.id !== userId) return false;
      if (error) {
        const message = error.message.toLowerCase();
        const detail = typeof error.details === "string" ? error.details : "";
        const nextChangeMatch = detail.match(/next_change_at=([^\s;]+)/i);
        const nextChangeAt = nextChangeMatch?.[1];
        if (message.includes("username_change_cooldown") && nextChangeAt) {
          const parsed = Date.parse(nextChangeAt);
          if (Number.isFinite(parsed)) {
            this.update({
              busy: false,
              usernameChangeAvailableAt: new Date(parsed).toISOString(),
              usernameChangeError: `You can change your username again on ${accountDate.format(new Date(parsed))}.`,
            });
            return false;
          }
        }
        this.update({
          busy: false,
          usernameChangeError:
            message.includes("username_taken") || message.includes("profiles_username_lower_unique")
              ? "That username is already taken. Try another."
              : message.includes("reserved_username") ||
                  message.includes("username_reservation_conflict")
                ? "That username is reserved. Choose another."
                : message.includes("invalid_username")
                  ? "Use 3–20 letters, numbers, or underscores. Start with a letter."
                  : message.includes("not_authenticated")
                    ? "Your sign-in expired. Sign in again before changing your username."
                    : message.includes("username_change_cooldown")
                      ? "Your username was changed recently. Try again after the 30-day waiting period."
                      : message.includes("username_changed_concurrently")
                        ? "Your account changed in another tab. Refresh your account and try again."
                        : message.includes("profile_not_found")
                          ? "Your username could not be found. Refresh your account and try again."
                          : "We could not change your username. Please try again.",
        });
        return false;
      }

      const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      const saved = typeof result.username === "string" ? result.username : cleaned;
      const nextChangeAt =
        typeof result.next_change_at === "string" &&
        Number.isFinite(Date.parse(result.next_change_at))
          ? new Date(result.next_change_at).toISOString()
          : new Date(Date.now() + USERNAME_CHANGE_COOLDOWN_MS).toISOString();
      this.update({
        username: saved,
        usernameChangeAvailableAt: nextChangeAt,
        usernameChangeError: "",
        busy: false,
      });
      return true;
    } catch {
      if (this.session?.user.id !== userId) return false;
      this.update({
        busy: false,
        usernameChangeError:
          "We could not change your username. Check your connection and try again.",
      });
      return false;
    }
  }

  clearUsernameChangeError(): void {
    if (this.snapshot.usernameChangeError) this.update({ usernameChangeError: "" });
  }

  async refreshProfile(): Promise<void> {
    if (!this.session) return;
    const request = ++this.profileRequest;
    this.update({ status: "loading", error: "" });
    await this.loadProfile(this.session, request);
  }

  async loadGameHistory(force = false): Promise<void> {
    const userId = this.session?.user.id;
    if (!this.client || !userId || this.snapshot.status !== "signed-in") return;
    if (this.historyInFlight && this.historyUserId === userId) return this.historyInFlight;
    const fetchedAt = this.snapshot.historyFetchedAt;
    const invalidated = this.historyLoadedVersion < this.historyInvalidationVersion;
    if (
      !force &&
      !invalidated &&
      this.historyUserId === userId &&
      fetchedAt &&
      Date.now() - fetchedAt < HISTORY_CACHE_TTL_MS
    )
      return;
    const attemptedAt = this.snapshot.historyAttemptedAt;
    if (
      !force &&
      this.historyUserId === userId &&
      this.snapshot.historyError &&
      attemptedAt &&
      Date.now() - attemptedAt < HISTORY_CACHE_TTL_MS &&
      this.historyAttemptedVersion === this.historyInvalidationVersion
    )
      return;

    this.historyUserId = userId;
    const request = ++this.historyRequest;
    const requestedInvalidationVersion = this.historyInvalidationVersion;
    this.historyAttemptedVersion = requestedInvalidationVersion;
    const hasCachedHistory = this.snapshot.historyFetchedAt !== null;
    this.update({
      historyStatus: hasCachedHistory ? "ready" : "loading",
      historyRefreshing: true,
      historyLoadingMore: false,
      historyError: "",
      historyMoreError: "",
      historyAttemptedAt: Date.now(),
    });
    this.historyMoreInFlight = null;
    const load = (async () => {
      try {
        const selectHistory = (fields: string) =>
          this.client!.from("game_history")
            .select(fields, { count: "exact" })
            .order("completed_at", { ascending: false })
            .order("completion_id", { ascending: false })
            .limit(HISTORY_INITIAL_LIMIT);
        let { data, error, count } = await selectHistory(
          this.historyReplayRelationSupported === false
            ? HISTORY_FIELDS
            : HISTORY_FIELDS_WITH_REPLAYS,
        );
        if (
          error &&
          this.historyReplayRelationSupported !== false &&
          replayRelationUnavailable(error)
        ) {
          this.historyReplayRelationSupported = false;
          ({ data, error, count } = await selectHistory(HISTORY_FIELDS));
        } else if (!error && this.historyReplayRelationSupported !== false) {
          this.historyReplayRelationSupported = true;
        }
        if (request !== this.historyRequest || this.session?.user.id !== userId) return;
        if (error) throw new Error("Game history could not load. Try again.");
        let history = (data ?? []).flatMap((row): GameHistoryEntry[] => {
          const parsed = parseHistoryEntry(row);
          return parsed ? [parsed] : [];
        });
        if (this.historyReplayRelationSupported === false)
          history = await this.attachReplayAvailability(history);
        const historyCount = typeof count === "number" ? count : history.length;
        this.update({
          history,
          historyCount,
          historyHasMore: historyCount > history.length,
          historyStatus: "ready",
          historyError: "",
          historyMoreError: "",
          historyFetchedAt: Date.now(),
        });
        this.historyLoadedVersion = Math.max(
          this.historyLoadedVersion,
          requestedInvalidationVersion,
        );
      } catch (error) {
        if (request !== this.historyRequest || this.session?.user.id !== userId) return;
        this.update({
          historyStatus: hasCachedHistory ? "ready" : "error",
          historyError:
            error instanceof Error ? error.message : "Game history could not load. Try again.",
        });
      }
    })();
    this.historyInFlight = load;
    try {
      await load;
    } finally {
      if (this.historyInFlight === load) this.historyInFlight = null;
      if (
        request === this.historyRequest &&
        this.session?.user.id === userId &&
        this.snapshot.historyRefreshing
      ) {
        this.update({ historyRefreshing: false });
      }
    }
  }

  async loadFriends(force = false): Promise<void> {
    const userId = this.session?.user.id;
    if (!this.client || !userId || this.snapshot.status !== "signed-in") return;
    if (this.friendsInFlight && this.friendsUserId === userId) return this.friendsInFlight;
    if (
      !force &&
      this.friendsUserId === userId &&
      this.snapshot.friendsFetchedAt !== null &&
      Date.now() - this.snapshot.friendsFetchedAt < FRIENDS_CACHE_TTL_MS
    )
      return;

    this.friendsUserId = userId;
    const request = ++this.friendsRequest;
    const hasCachedFriends =
      this.snapshot.friendsStatus === "ready" || this.snapshot.friendsFetchedAt !== null;
    this.update({
      friendsStatus: hasCachedFriends ? "ready" : "loading",
      friendsRefreshing: hasCachedFriends,
      friendsError: "",
    });
    const load = (async () => {
      try {
        const { data, error } = await this.client!.rpc("get_friends");
        if (error) throw error;
        if (request !== this.friendsRequest || this.session?.user.id !== userId) return;
        const response = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
        const friends = Array.isArray(response.friends)
          ? response.friends.flatMap((item): FriendRecord[] => {
              if (!item || typeof item !== "object") return [];
              const row = item as Record<string, unknown>;
              if (
                typeof row.id !== "string" ||
                typeof row.username !== "string" ||
                typeof row.since !== "string" ||
                !Number.isFinite(Date.parse(row.since)) ||
                !Number.isSafeInteger(row.series_played) ||
                !Number.isSafeInteger(row.wins) ||
                !Number.isSafeInteger(row.losses)
              )
                return [];
              return [
                {
                  id: row.id,
                  username: row.username,
                  since: row.since,
                  seriesPlayed: row.series_played as number,
                  wins: row.wins as number,
                  losses: row.losses as number,
                },
              ];
            })
          : [];
        const parseRequests = (value: unknown): FriendRequest[] =>
          Array.isArray(value)
            ? value.flatMap((item): FriendRequest[] => {
                if (!item || typeof item !== "object") return [];
                const row = item as Record<string, unknown>;
                if (
                  typeof row.id !== "string" ||
                  typeof row.username !== "string" ||
                  typeof row.requested_at !== "string" ||
                  !Number.isFinite(Date.parse(row.requested_at))
                )
                  return [];
                return [{ id: row.id, username: row.username, requestedAt: row.requested_at }];
              })
            : [];
        this.update({
          friends,
          incomingFriendRequests: parseRequests(response.incoming),
          outgoingFriendRequests: parseRequests(response.outgoing),
          friendsStatus: "ready",
          friendsError: "",
          friendsFetchedAt: Date.now(),
        });
      } catch {
        if (request !== this.friendsRequest || this.session?.user.id !== userId) return;
        this.update({
          friendsStatus: hasCachedFriends ? "ready" : "error",
          friendsError: hasCachedFriends
            ? "Could not refresh friends. Showing the saved list."
            : "Friends could not load. Check your connection and try again.",
        });
      }
    })();
    this.friendsInFlight = load;
    try {
      await load;
    } finally {
      if (this.friendsInFlight === load) this.friendsInFlight = null;
      if (
        request === this.friendsRequest &&
        this.session?.user.id === userId &&
        this.snapshot.friendsRefreshing
      ) {
        this.update({ friendsRefreshing: false });
      }
    }
  }

  async loadMatchInvites(force = false): Promise<void> {
    const userId = this.session?.user.id;
    if (!this.client || !userId || this.snapshot.status !== "signed-in") return;
    if (this.matchInvitesInFlight && this.matchInvitesUserId === userId)
      return this.matchInvitesInFlight;
    if (
      !force &&
      this.matchInvitesUserId === userId &&
      this.snapshot.matchInvitesFetchedAt !== null &&
      Date.now() - this.snapshot.matchInvitesFetchedAt < MATCH_INVITES_CACHE_TTL_MS
    )
      return;

    this.matchInvitesUserId = userId;
    const request = ++this.matchInvitesRequest;
    const hasCachedInvites = this.snapshot.matchInvitesFetchedAt !== null;
    this.update({
      matchInvitesStatus: hasCachedInvites ? "ready" : "loading",
      matchInvitesError: "",
    });
    const load = (async () => {
      try {
        const { data, error } = await this.client!.rpc("get_private_match_invites");
        if (error) throw error;
        if (request !== this.matchInvitesRequest || this.session?.user.id !== userId) return;
        const invites = Array.isArray(data)
          ? data.flatMap((value): FriendMatchInvite[] => {
              if (!value || typeof value !== "object") return [];
              const row = value as Record<string, unknown>;
              if (
                typeof row.id !== "string" ||
                typeof row.match_id !== "string" ||
                !/^[A-Za-z0-9_-]{22}$/.test(row.match_id) ||
                typeof row.game_id !== "string" ||
                !["connect-four", "reversi"].includes(row.game_id) ||
                !Number.isSafeInteger(row.series_target) ||
                ![1, 2, 3].includes(row.series_target as number) ||
                typeof row.invite_token !== "string" ||
                !/^[A-Za-z0-9_-]{43}$/.test(row.invite_token) ||
                typeof row.sender_username !== "string" ||
                typeof row.created_at !== "string" ||
                !Number.isFinite(Date.parse(row.created_at)) ||
                typeof row.expires_at !== "string" ||
                !Number.isFinite(Date.parse(row.expires_at))
              )
                return [];
              return [
                {
                  id: row.id,
                  matchId: row.match_id,
                  gameId: row.game_id,
                  seriesTarget: row.series_target as 1 | 2 | 3,
                  inviteToken: row.invite_token,
                  senderUsername: row.sender_username,
                  createdAt: row.created_at,
                  expiresAt: row.expires_at,
                },
              ];
            })
          : [];
        this.update({
          incomingMatchInvites: invites,
          matchInvitesStatus: "ready",
          matchInvitesError: "",
          matchInvitesFetchedAt: Date.now(),
        });
      } catch {
        if (request !== this.matchInvitesRequest || this.session?.user.id !== userId) return;
        this.update({
          matchInvitesStatus: hasCachedInvites ? "ready" : "error",
          matchInvitesError: hasCachedInvites
            ? "Could not refresh match invites. Showing the saved list."
            : "Match invites could not load. Check your connection and try again.",
        });
      }
    })();
    this.matchInvitesInFlight = load;
    try {
      await load;
    } finally {
      if (this.matchInvitesInFlight === load) this.matchInvitesInFlight = null;
    }
  }

  async dismissMatchInvite(inviteId: string): Promise<boolean> {
    if (!this.client || !this.session || this.snapshot.status !== "signed-in") return false;
    if (this.snapshot.matchInvitesBusyId) return false;
    this.update({ matchInvitesBusyId: inviteId, matchInvitesError: "" });
    try {
      const { data, error } = await this.client.rpc("dismiss_private_match_invite", {
        p_invite_id: inviteId,
      });
      if (error) throw error;
      if (data === true)
        this.update({
          incomingMatchInvites: this.snapshot.incomingMatchInvites.filter(
            (invite) => invite.id !== inviteId,
          ),
          incomingFriendRequestCount: Math.max(
            0,
            (this.snapshot.incomingFriendRequestCount ?? 1) - 1,
          ),
        });
      return data === true;
    } catch {
      this.update({ matchInvitesError: "Invite could not be dismissed. Try again." });
      return false;
    } finally {
      this.update({ matchInvitesBusyId: null });
    }
  }

  async loadFriendMatchHistory(
    friendshipId: string,
    before?: Readonly<{ completedAt: string; completionId: string }>,
  ): Promise<FriendMatchHistoryPage> {
    const userId = this.session?.user.id;
    if (!this.client || !userId || this.snapshot.status !== "signed-in")
      throw new Error("Sign in to view match history.");

    const { data, error } = await this.client.rpc("get_friend_match_history", {
      p_friendship_id: friendshipId,
      p_before_completed_at: before?.completedAt ?? null,
      p_before_completion_id: before?.completionId ?? null,
      p_page_size: 5,
    });
    if (error) {
      if (this.session?.user.id !== userId) throw new Error("Your account changed. Try again.");
      if (error.message.toLowerCase().includes("friendship_unavailable"))
        throw new Error("Match history is available while you’re friends.");
      throw new Error("Match history could not load. Try again.");
    }
    if (this.session?.user.id !== userId) throw new Error("Your account changed. Try again.");

    const response = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const matches = Array.isArray(response.matches)
      ? response.matches.flatMap((value): GameHistoryEntry[] => {
          if (!value || typeof value !== "object") return [];
          const row = value as Record<string, unknown>;
          const parsed = parseHistoryEntry({
            ...row,
            record_source: "verified",
            game_history_rounds: row.replay_available === true ? [{}] : [],
          });
          return parsed ? [parsed] : [];
        })
      : [];

    return { matches, hasMore: response.has_more === true };
  }

  private startFriendRequestUpdates(userId: string): void {
    this.stopFriendRequestUpdates();
    if (!this.client) return;

    let initialCountLoaded = false;
    this.friendRequestChannel = this.client
      .channel(`friend-requests:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `user_low_id=eq.${userId}`,
        },
        () => this.scheduleIncomingFriendRequestRefresh(userId),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `user_high_id=eq.${userId}`,
        },
        () => this.scheduleIncomingFriendRequestRefresh(userId),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "private_match_invites",
          filter: `recipient_id=eq.${userId}`,
        },
        () => this.scheduleIncomingFriendRequestRefresh(userId),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (initialCountLoaded) this.scheduleIncomingFriendRequestRefresh(userId);
          else {
            initialCountLoaded = true;
            void this.refreshIncomingFriendRequestCount(userId);
          }
        } else if (!initialCountLoaded && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
          initialCountLoaded = true;
          void this.refreshIncomingFriendRequestCount(userId);
        }
      });
  }

  private stopFriendRequestUpdates(): void {
    if (this.friendRequestRefreshTimer !== null) {
      clearTimeout(this.friendRequestRefreshTimer);
      this.friendRequestRefreshTimer = null;
    }
    this.friendRequestCountRequest += 1;
    if (this.friendRequestChannel) {
      void this.client?.removeChannel(this.friendRequestChannel);
      this.friendRequestChannel = null;
    }
  }

  private scheduleIncomingFriendRequestRefresh(userId: string): void {
    if (this.friendRequestRefreshTimer !== null) clearTimeout(this.friendRequestRefreshTimer);
    this.friendRequestRefreshTimer = setTimeout(() => {
      this.friendRequestRefreshTimer = null;
      void this.refreshIncomingFriendRequestCount(userId);
      if (this.snapshot.matchInvitesFetchedAt !== null) void this.loadMatchInvites(true);
    }, 200);
  }

  private async refreshIncomingFriendRequestCount(userId: string): Promise<void> {
    if (!this.client || this.session?.user.id !== userId) return;
    const request = ++this.friendRequestCountRequest;
    try {
      const { data, error } = await this.client.rpc("get_incoming_friend_request_count");
      if (
        error ||
        request !== this.friendRequestCountRequest ||
        this.session?.user.id !== userId ||
        !Number.isSafeInteger(data) ||
        (data as number) < 0
      )
        return;
      this.update({ incomingFriendRequestCount: data as number });
    } catch {
      // Keep the last known count; the realtime channel will retry after reconnecting.
    }
  }

  async lookupFriend(username: string): Promise<FriendLookup | null> {
    const cleaned = username.trim();
    if (!this.client || !this.session || this.snapshot.status !== "signed-in")
      throw new Error("Sign in to find players.");
    if (!USERNAME_PATTERN.test(cleaned))
      throw new Error("Use a username with 3–20 letters, numbers, or underscores.");
    const { data, error } = await this.client.rpc("lookup_friend", {
      requested_username: cleaned,
    });
    if (error) throw new Error(friendErrorMessage(error.message));
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    const allowedStatuses = ["pending", "accepted", "declined", "cancelled", "removed"];
    if (
      typeof row.username !== "string" ||
      (row.status !== null && !allowedStatuses.includes(row.status as string)) ||
      (row.requested_by_you !== null && typeof row.requested_by_you !== "boolean")
    )
      throw new Error("Player details could not be read. Try again.");
    return {
      username: row.username,
      status: row.status as FriendLookup["status"],
      requestedByYou: row.requested_by_you as boolean | null,
    };
  }

  async sendFriendRequest(username: string): Promise<boolean> {
    const userId = this.session?.user.id;
    return this.runFriendAction(async () => {
      const { data, error } = await this.client!.rpc("send_friend_request", {
        requested_username: username.trim(),
      });
      if (error) throw new Error(friendErrorMessage(error.message));
      if (this.session?.user.id !== userId) return;
      const requestId =
        data && typeof data === "object" ? (data as Record<string, unknown>).id : null;
      if (typeof requestId === "string") {
        this.update({
          outgoingFriendRequests: [
            ...this.snapshot.outgoingFriendRequests,
            { id: requestId, username: username.trim(), requestedAt: new Date().toISOString() },
          ],
        });
      }
    });
  }

  async respondToFriendRequest(id: string, response: FriendRequestResponse): Promise<boolean> {
    const userId = this.session?.user.id;
    return this.runFriendAction(async () => {
      const { error } = await this.client!.rpc("respond_to_friend_request", {
        request_id: id,
        response,
      });
      if (error) throw new Error(friendErrorMessage(error.message));
      if (this.session?.user.id !== userId) return;
      if (response === "cancel") {
        this.update({
          outgoingFriendRequests: this.snapshot.outgoingFriendRequests.filter(
            (request) => request.id !== id,
          ),
        });
        return;
      }
      const request = this.snapshot.incomingFriendRequests.find((item) => item.id === id);
      this.update({
        incomingFriendRequests: this.snapshot.incomingFriendRequests.filter(
          (item) => item.id !== id,
        ),
        ...(response === "accept" && request
          ? {
              friends: [
                ...this.snapshot.friends,
                {
                  id,
                  username: request.username,
                  since: new Date().toISOString(),
                  seriesPlayed: 0,
                  wins: 0,
                  losses: 0,
                },
              ],
            }
          : {}),
      });
    });
  }

  async removeFriend(id: string): Promise<boolean> {
    const userId = this.session?.user.id;
    return this.runFriendAction(async () => {
      const { error } = await this.client!.rpc("remove_friend", { friendship_id: id });
      if (error) throw new Error(friendErrorMessage(error.message));
      if (this.session?.user.id !== userId) return;
      this.update({
        friends: this.snapshot.friends.filter((friend) => friend.id !== id),
      });
    });
  }

  private async runFriendAction(action: () => Promise<void>): Promise<boolean> {
    const userId = this.session?.user.id;
    if (!this.client || !userId || this.snapshot.status !== "signed-in") {
      this.update({ friendsError: "Sign in again to manage friends." });
      return false;
    }
    if (this.snapshot.friendsActionBusy) return false;
    this.friendsRequest += 1;
    this.friendsInFlight = null;
    this.update({ friendsActionBusy: true, friendsError: "" });
    try {
      await action();
      if (this.session?.user.id !== userId) return false;
      this.update({ friendsActionBusy: false });
      await this.loadFriends(true);
      return true;
    } catch (error) {
      if (this.session?.user.id !== userId) return false;
      this.update({
        friendsActionBusy: false,
        friendsError:
          error instanceof Error ? error.message : "Friend request could not be completed.",
      });
      return false;
    }
  }

  clearFriendsError(): void {
    if (this.snapshot.friendsError) this.update({ friendsError: "" });
  }

  async loadMoreGameHistory(): Promise<void> {
    const userId = this.session?.user.id;
    const cursor = this.snapshot.history.at(-1);
    if (
      !this.client ||
      !userId ||
      this.snapshot.status !== "signed-in" ||
      !cursor ||
      !this.snapshot.historyHasMore
    )
      return;
    if (this.historyMoreInFlight) return this.historyMoreInFlight;

    const request = this.historyRequest;
    this.update({ historyLoadingMore: true, historyMoreError: "" });
    const load = (async () => {
      try {
        const selectHistory = (fields: string) =>
          this.client!.from("game_history")
            .select(fields)
            .or(
              `completed_at.lt.${cursor.completed_at},and(completed_at.eq.${cursor.completed_at},completion_id.lt."${cursor.completion_id}")`,
            )
            .order("completed_at", { ascending: false })
            .order("completion_id", { ascending: false })
            .limit(HISTORY_PAGE_SIZE + 1);
        let { data, error } = await selectHistory(
          this.historyReplayRelationSupported === false
            ? HISTORY_FIELDS
            : HISTORY_FIELDS_WITH_REPLAYS,
        );
        if (
          error &&
          this.historyReplayRelationSupported !== false &&
          replayRelationUnavailable(error)
        ) {
          this.historyReplayRelationSupported = false;
          ({ data, error } = await selectHistory(HISTORY_FIELDS));
        } else if (!error && this.historyReplayRelationSupported !== false) {
          this.historyReplayRelationSupported = true;
        }
        if (request !== this.historyRequest || this.session?.user.id !== userId) return;
        if (error) throw new Error("More matches could not load. Try again.");
        let parsed = (data ?? []).flatMap((row): GameHistoryEntry[] => {
          const entry = parseHistoryEntry(row);
          return entry ? [entry] : [];
        });
        if (this.historyReplayRelationSupported === false)
          parsed = await this.attachReplayAvailability(parsed);
        const hasMore = parsed.length > HISTORY_PAGE_SIZE;
        const knownIds = new Set(this.snapshot.history.map((entry) => entry.completion_id));
        const nextPage = parsed
          .slice(0, HISTORY_PAGE_SIZE)
          .filter((entry) => !knownIds.has(entry.completion_id));
        this.update({
          history: [...this.snapshot.history, ...nextPage],
          historyHasMore: hasMore,
          historyMoreError: "",
        });
      } catch (error) {
        if (request !== this.historyRequest || this.session?.user.id !== userId) return;
        this.update({
          historyMoreError:
            error instanceof Error ? error.message : "More matches could not load. Try again.",
        });
      }
    })();
    this.historyMoreInFlight = load;
    try {
      await load;
    } finally {
      if (this.historyMoreInFlight === load) this.historyMoreInFlight = null;
      if (
        request === this.historyRequest &&
        this.session?.user.id === userId &&
        this.snapshot.historyLoadingMore
      )
        this.update({ historyLoadingMore: false });
    }
  }

  private async attachReplayAvailability(entries: GameHistoryEntry[]): Promise<GameHistoryEntry[]> {
    if (!entries.length || !this.client) return entries;
    const { data, error } = await this.client
      .from("game_history_rounds")
      .select("completion_id")
      .in(
        "completion_id",
        entries.map((entry) => entry.completion_id),
      );
    if (error) {
      if (replayRelationUnavailable(error))
        return entries.map((entry) => ({ ...entry, replay_available: false }));
      return entries;
    }
    const available = new Set(
      (data ?? []).flatMap((row) =>
        row && typeof row.completion_id === "string" ? [row.completion_id] : [],
      ),
    );
    return entries.map((entry) => ({
      ...entry,
      replay_available: available.has(entry.completion_id),
    }));
  }

  async loadHistoryRounds(entry: GameHistoryEntry): Promise<void> {
    const userId = this.session?.user.id;
    const completionId = entry.completion_id;
    if (!this.client || !userId || this.snapshot.status !== "signed-in") return;
    const cached = this.snapshot.historyDetails[completionId];
    if (cached?.status === "ready" || cached?.status === "loading") return;
    const inFlight = this.historyDetailsInFlight.get(completionId);
    if (inFlight) return inFlight;
    if (entry.record_source === "guest_import") {
      this.update({
        historyDetails: {
          ...this.snapshot.historyDetails,
          [completionId]: { status: "ready", rounds: [], error: "" },
        },
      });
      return;
    }

    this.update({
      historyDetails: {
        ...this.snapshot.historyDetails,
        [completionId]: { status: "loading", rounds: [], error: "" },
      },
    });
    const load = (async () => {
      try {
        const { data, error } = await this.client!.from("game_history_rounds")
          .select(
            "round_number,game_id,rules_version,player_seat,winner_seat,finish_reason,completed_at,final_state",
          )
          .eq("completion_id", completionId)
          .order("round_number", { ascending: true });
        if (this.session?.user.id !== userId) return;
        if (error) {
          // Older deployments may not have the round snapshot table yet. A history row
          // without replay data is still valid; only transient failures should be retryable.
          if (error.code === "42P01" || error.code === "PGRST205") {
            this.update({
              historyDetails: {
                ...this.snapshot.historyDetails,
                [completionId]: { status: "ready", rounds: [], error: "" },
              },
            });
            return;
          }
          throw new Error("Match details could not load. Try again.");
        }
        const rounds = (data ?? []).flatMap((row): GameHistoryRound[] => {
          const parsed = parseHistoryRound(row);
          return parsed ? [parsed] : [];
        });
        this.update({
          historyDetails: {
            ...this.snapshot.historyDetails,
            [completionId]: { status: "ready", rounds, error: "" },
          },
        });
      } catch (error) {
        if (this.session?.user.id !== userId) return;
        this.update({
          historyDetails: {
            ...this.snapshot.historyDetails,
            [completionId]: {
              status: "error",
              rounds: [],
              error:
                error instanceof Error ? error.message : "Match details could not load. Try again.",
            },
          },
        });
      }
    })();
    this.historyDetailsInFlight.set(completionId, load);
    try {
      await load;
    } finally {
      if (this.historyDetailsInFlight.get(completionId) === load)
        this.historyDetailsInFlight.delete(completionId);
    }
  }

  /** Defer a fresh account-history read until the user opens their account. */
  markGameHistoryStale(): void {
    if (this.session) this.historyInvalidationVersion += 1;
  }

  async setLeaderboardPublic(isPublic: boolean): Promise<boolean> {
    if (!this.client || !this.session || this.snapshot.status !== "signed-in" || this.snapshot.busy)
      return false;
    const userId = this.session.user.id;
    const previous = this.snapshot.leaderboardPublic;
    this.update({ busy: true, error: "" });
    try {
      const { error } = await this.client.rpc("set_leaderboard_visibility", {
        is_public: isPublic,
      });
      if (this.session?.user.id !== userId) return false;
      if (error) throw error;
      this.update({
        leaderboardPublic: isPublic,
        busy: false,
      });
      return true;
    } catch {
      if (this.session?.user.id === userId)
        this.update({
          leaderboardPublic: previous,
          busy: false,
          error: "Leaderboard privacy could not be updated. Try again.",
        });
      return false;
    }
  }

  refreshGuestHistory(): void {
    this.update({ guestHistoryCount: readGuestHistory().length });
  }

  /** Explicitly imports this device's guest archive; imported rows remain unverified. */
  async importGuestHistory(): Promise<boolean> {
    const userId = this.session?.user.id;
    if (
      !this.client ||
      !userId ||
      this.snapshot.status !== "signed-in" ||
      this.snapshot.guestHistoryImporting
    )
      return false;
    const entries: GuestGameHistoryEntry[] = readGuestHistory();
    if (!entries.length) {
      this.refreshGuestHistory();
      return false;
    }
    this.update({ guestHistoryImporting: true, guestHistoryError: "" });
    try {
      const { error } = await this.client.rpc("import_guest_history", { entries });
      if (error) throw error;
      if (this.session?.user.id !== userId) return false;
      removeGuestHistory(entries.map((entry) => entry.completion_id));
      this.refreshGuestHistory();
      // A request started before the import can complete with a stale database snapshot.
      const priorHistoryLoad = this.historyInFlight;
      if (priorHistoryLoad) await priorHistoryLoad;
      if (this.session?.user.id !== userId) return false;
      await this.loadGameHistory(true);
      return true;
    } catch {
      if (this.session?.user.id === userId) {
        this.update({
          guestHistoryError:
            "Guest results could not be imported. Your copy is still on this device; try again.",
        });
      }
      return false;
    } finally {
      if (this.session?.user.id === userId) this.update({ guestHistoryImporting: false });
    }
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    this.update({ busy: true, error: "" });
    try {
      const { error } = await this.client.auth.signOut();
      if (error) this.update({ busy: false, error: "Could not sign out. Try again." });
    } catch {
      this.update({
        busy: false,
        error: "Could not sign out. Check your connection and try again.",
      });
    }
  }

  private async loadProfile(session: Session, request: number): Promise<void> {
    if (!this.client) return;
    try {
      const { data, error } = await this.client
        .from("profiles")
        .select("username,created_at,leaderboard_public,username_changed_at")
        .maybeSingle();
      if (request !== this.profileRequest || this.session?.user.id !== session.user.id) return;
      if (error) {
        this.update({
          status: "error",
          username: null,
          busy: false,
          error: "Your account could not be loaded. Check your connection and retry.",
        });
        return;
      }
      if (!data || typeof data.username !== "string") {
        this.update({
          status: "profile-required",
          username: null,
          usernameChangeAvailableAt: null,
          usernameChangeError: "",
          busy: false,
          error: "",
        });
        return;
      }
      this.update({
        status: "signed-in",
        username: data.username,
        usernameChangeAvailableAt:
          typeof data.username_changed_at === "string" &&
          Number.isFinite(Date.parse(data.username_changed_at))
            ? new Date(
                Date.parse(data.username_changed_at) + USERNAME_CHANGE_COOLDOWN_MS,
              ).toISOString()
            : null,
        usernameChangeError: "",
        leaderboardPublic: data.leaderboard_public !== false,
        joinedAt:
          typeof data.created_at === "string" && Number.isFinite(Date.parse(data.created_at))
            ? data.created_at
            : null,
        busy: false,
        error: "",
      });
      void this.loadGameHistory();
    } catch {
      if (request !== this.profileRequest || this.session?.user.id !== session.user.id) return;
      this.update({
        status: "error",
        username: null,
        busy: false,
        error: "Your account could not be loaded. Check your connection and retry.",
      });
    }
  }

  private clearHistory(): void {
    this.historyRequest += 1;
    this.historyInFlight = null;
    this.historyMoreInFlight = null;
    this.historyDetailsInFlight.clear();
    this.historyUserId = null;
    this.historyInvalidationVersion = 0;
    this.historyLoadedVersion = 0;
    this.historyAttemptedVersion = 0;
    this.friendsRequest += 1;
    this.friendsInFlight = null;
    this.friendsUserId = null;
    this.matchInvitesRequest += 1;
    this.matchInvitesInFlight = null;
    this.matchInvitesUserId = null;
    this.snapshot = {
      ...this.snapshot,
      leaderboardPublic: true,
      joinedAt: null,
      history: [],
      historyCount: 0,
      historyHasMore: false,
      historyStatus: "idle",
      historyRefreshing: false,
      historyLoadingMore: false,
      historyError: "",
      historyMoreError: "",
      historyDetails: {},
      historyFetchedAt: null,
      historyAttemptedAt: null,
      guestHistoryImporting: false,
      guestHistoryError: "",
      friends: [],
      incomingFriendRequests: [],
      outgoingFriendRequests: [],
      incomingFriendRequestCount: null,
      incomingMatchInvites: [],
      matchInvitesStatus: "idle",
      matchInvitesError: "",
      matchInvitesFetchedAt: null,
      matchInvitesBusyId: null,
      friendsStatus: "idle",
      friendsRefreshing: false,
      friendsError: "",
      friendsActionBusy: false,
      friendsFetchedAt: null,
    };
  }

  private update(patch: Partial<AccountSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}

function saveOAuthMatchReturn(): void {
  try {
    const current = new URL(window.location.href);
    const matchId = current.searchParams.get("match");
    if (!matchId || !/^[A-Za-z0-9_-]{22}$/.test(matchId)) return;
    const target = new URL(current.pathname, current.origin);
    target.searchParams.set("match", matchId);
    const inviteToken = new URLSearchParams(current.hash.slice(1)).get("invite");
    if (inviteToken && /^[A-Za-z0-9_-]{1,128}$/.test(inviteToken))
      target.hash = new URLSearchParams({ invite: inviteToken }).toString();
    window.sessionStorage.setItem(
      OAUTH_MATCH_RETURN_KEY,
      JSON.stringify({
        url: `${target.pathname}${target.search}${target.hash}`,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // OAuth remains available when session storage is blocked; only automatic return is lost.
  }
}

function clearOAuthMatchReturn(): void {
  try {
    window.sessionStorage.removeItem(OAUTH_MATCH_RETURN_KEY);
  } catch {
    // No persistent intent needs cleanup when storage is unavailable.
  }
}

const sharedSupabaseClient = configuredClient();
export const accountSession = new AccountSession(sharedSupabaseClient);
export function getSupabaseClient(): SupabaseClient | null {
  return sharedSupabaseClient;
}
