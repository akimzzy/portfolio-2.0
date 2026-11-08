import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
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
export type AccountLeaderboardRank = Readonly<{ game_id: string; rank: number }>;
export type AccountSnapshot = Readonly<{
  status: "unconfigured" | "loading" | "signed-out" | "profile-required" | "signed-in" | "error";
  username: string | null;
  leaderboardPublic: boolean;
  leaderboardRanks: AccountLeaderboardRank[];
  leaderboardRanksStatus: "idle" | "loading" | "ready" | "error";
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
}>;

const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const HISTORY_CACHE_TTL_MS = 60_000;
const OAUTH_MATCH_RETURN_KEY = "games.oauth-match-return";
const OAUTH_MATCH_RETURN_TTL_MS = 15 * 60_000;
const HISTORY_INITIAL_LIMIT = 4;
const HISTORY_PAGE_SIZE = 10;
const LEADERBOARD_RANKS_CACHE_TTL_MS = 5 * 60_000;
const initialSnapshot: AccountSnapshot = {
  status: "loading",
  username: null,
  leaderboardPublic: true,
  leaderboardRanks: [],
  leaderboardRanksStatus: "idle",
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
  private leaderboardRanksUserId: string | null = null;
  private leaderboardRanksFetchedAt: number | null = null;
  private leaderboardRanksAttemptedAt: number | null = null;
  private leaderboardRanksInFlight: Promise<void> | null = null;
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
      )
        return;
      if (!session || (previousUserId && previousUserId !== session.user.id)) this.clearHistory();
      this.profileRequest += 1;
      if (!session) {
        this.update({
          status: "signed-out",
          username: null,
          joinedAt: null,
          error: "",
          busy: false,
        });
        return;
      }
      this.update({ status: "loading", username: null, error: "" });
      const request = this.profileRequest;
      queueMicrotask(() => {
        void this.loadProfile(session, request);
      });
    });
    this.authSubscription = data.subscription;
  }

  stop(): void {
    this.profileRequest += 1;
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
        leaderboardPublic: true,
        leaderboardRanks: [],
        leaderboardRanksStatus: "idle",
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
        const selectHistory = (fields: string) => this.client!.from("game_history")
          .select(fields, { count: "exact" })
          .order("completed_at", { ascending: false })
          .order("completion_id", { ascending: false })
          .limit(HISTORY_INITIAL_LIMIT);
        let { data, error, count } = await selectHistory(
          this.historyReplayRelationSupported === false ? HISTORY_FIELDS : HISTORY_FIELDS_WITH_REPLAYS,
        );
        if (error && this.historyReplayRelationSupported !== false && replayRelationUnavailable(error)) {
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
        const selectHistory = (fields: string) => this.client!.from("game_history")
          .select(fields)
          .or(
            `completed_at.lt.${cursor.completed_at},and(completed_at.eq.${cursor.completed_at},completion_id.lt."${cursor.completion_id}")`,
          )
          .order("completed_at", { ascending: false })
          .order("completion_id", { ascending: false })
          .limit(HISTORY_PAGE_SIZE + 1);
        let { data, error } = await selectHistory(
          this.historyReplayRelationSupported === false ? HISTORY_FIELDS : HISTORY_FIELDS_WITH_REPLAYS,
        );
        if (error && this.historyReplayRelationSupported !== false && replayRelationUnavailable(error)) {
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

  private async attachReplayAvailability(
    entries: GameHistoryEntry[],
  ): Promise<GameHistoryEntry[]> {
    if (!entries.length || !this.client) return entries;
    const { data, error } = await this.client
      .from("game_history_rounds")
      .select("completion_id")
      .in("completion_id", entries.map((entry) => entry.completion_id));
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

  async loadLeaderboardRanks(force = false): Promise<void> {
    const userId = this.session?.user.id;
    if (
      !this.client ||
      !userId ||
      this.snapshot.status !== "signed-in" ||
      !this.snapshot.leaderboardPublic
    )
      return;
    if (this.leaderboardRanksInFlight && this.leaderboardRanksUserId === userId)
      return this.leaderboardRanksInFlight;
    if (
      !force &&
      this.leaderboardRanksUserId === userId &&
      this.leaderboardRanksFetchedAt !== null &&
      Date.now() - this.leaderboardRanksFetchedAt < LEADERBOARD_RANKS_CACHE_TTL_MS
    )
      return;
    if (
      !force &&
      this.leaderboardRanksUserId === userId &&
      this.snapshot.leaderboardRanksStatus === "error" &&
      this.leaderboardRanksAttemptedAt !== null &&
      Date.now() - this.leaderboardRanksAttemptedAt < LEADERBOARD_RANKS_CACHE_TTL_MS
    )
      return;

    this.leaderboardRanksUserId = userId;
    this.leaderboardRanksAttemptedAt = Date.now();
    this.update({ leaderboardRanksStatus: "loading" });
    const load = (async () => {
      try {
        const { data, error } = await this.client!.rpc("get_my_leaderboard_ranks");
        if (error) throw error;
        if (this.session?.user.id !== userId || !this.snapshot.leaderboardPublic) return;
        const ranks = Array.isArray(data)
          ? data.flatMap((item): AccountLeaderboardRank[] => {
              if (!item || typeof item !== "object") return [];
              const record = item as Record<string, unknown>;
              if (
                typeof record.game_id !== "string" ||
                !Number.isSafeInteger(record.rank) ||
                (record.rank as number) < 1
              )
                return [];
              return [{ game_id: record.game_id, rank: record.rank as number }];
            })
          : [];
        this.leaderboardRanksFetchedAt = Date.now();
        this.update({ leaderboardRanks: ranks, leaderboardRanksStatus: "ready" });
      } catch {
        if (this.session?.user.id === userId && this.snapshot.leaderboardPublic)
          this.update({ leaderboardRanksStatus: "error" });
      }
    })();
    this.leaderboardRanksInFlight = load;
    try {
      await load;
    } finally {
      if (this.leaderboardRanksInFlight === load) this.leaderboardRanksInFlight = null;
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
        leaderboardRanks: isPublic ? this.snapshot.leaderboardRanks : [],
        leaderboardRanksStatus: isPublic ? this.snapshot.leaderboardRanksStatus : "ready",
        busy: false,
      });
      this.leaderboardRanksFetchedAt = isPublic ? this.leaderboardRanksFetchedAt : Date.now();
      if (isPublic) {
        this.leaderboardRanksFetchedAt = null;
        void this.loadLeaderboardRanks(true);
      }
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
        .select("username,created_at,leaderboard_public")
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
        this.update({ status: "profile-required", username: null, busy: false, error: "" });
        return;
      }
      this.update({
        status: "signed-in",
        username: data.username,
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
    this.leaderboardRanksUserId = null;
    this.leaderboardRanksFetchedAt = null;
    this.leaderboardRanksAttemptedAt = null;
    this.leaderboardRanksInFlight = null;
    this.snapshot = {
      ...this.snapshot,
      leaderboardPublic: true,
      leaderboardRanks: [],
      leaderboardRanksStatus: "idle",
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
