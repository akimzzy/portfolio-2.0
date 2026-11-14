import { GAME_CATALOG } from "../../games/registry";
import { IN_HOUSE_PLAYERS } from "@portfolio-games/contracts";
import { opponentProfilesForLobby } from "../../games/opponents";
import {
  inHouseRefillCount,
  MAX_IN_HOUSE_MATCH_COUNT,
  MIN_IN_HOUSE_MATCH_COUNT,
  randomInHouseOfferCount,
  shuffled,
} from "./lobby-opponents";

export type LobbyGame = (typeof GAME_CATALOG)[number];
export type LobbyMatch = {
  matchId: string;
  gameId: string;
  displayName: string;
  seriesTarget: 1 | 2 | 3;
  createdAt: number;
  expiresAt: number;
};
export type LobbyOpponentOffer = Readonly<{
  offerId: string;
  inHousePlayerId: string;
  gameId: string;
  profileId: string;
  displayName: string;
  seriesTarget: 1 | 2 | 3;
  expiresAt: number;
}>;
export type LobbyState = {
  matches: LobbyMatch[];
  opponentOffers: LobbyOpponentOffer[];
  hasLoadedSnapshot: boolean;
  totalMatches: number | null;
  cursor: string | null;
  hasMore: boolean;
  connection: "connecting" | "connected" | "reconnecting";
  error: string;
  canReconnect: boolean;
  loadingMore: boolean;
  filter: string;
};

const INITIAL_STATE: LobbyState = {
  matches: [],
  opponentOffers: [],
  hasLoadedSnapshot: false,
  totalMatches: null,
  cursor: null,
  hasMore: false,
  connection: "connecting",
  error: "",
  canReconnect: false,
  loadingMore: false,
  filter: getInitialFilter(),
};
const LOBBY_SOCKET_TIMEOUT_MS = 10_000;

function getInitialFilter(): string {
  const value = new URLSearchParams(window.location.search).get("lobbyGame");
  return GAME_CATALOG.some((game) => game.id === value) ? value! : "all";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLobbyMatch(value: unknown): value is LobbyMatch {
  if (!isRecord(value)) return false;
  return (
    typeof value.matchId === "string" &&
    /^[A-Za-z0-9_-]{22}$/.test(value.matchId) &&
    typeof value.gameId === "string" &&
    GAME_CATALOG.some((game) => game.id === value.gameId) &&
    typeof value.displayName === "string" &&
    value.displayName.trim().length > 0 &&
    Array.from(value.displayName).length <= 24 &&
    (value.seriesTarget === 1 || value.seriesTarget === 2 || value.seriesTarget === 3) &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.expiresAt)
  );
}

function socketUrl(filter: string): URL {
  const configuredApi =
    document.querySelector<HTMLMetaElement>('meta[name="games-api"]')?.content.replace(/\/$/, "") ??
    "/api";
  const api = configuredApi.startsWith("/")
    ? `${window.location.origin}${configuredApi}`
    : configuredApi;
  const url = new URL(`${api.replace(/^http/, "ws")}/v1/lobby/socket`);
  if (filter !== "all") url.searchParams.set("gameId", filter);
  return url;
}

export class LobbyClient {
  private snapshot = INITIAL_STATE;
  private readonly houseRosterOrder = shuffled(IN_HOUSE_PLAYERS);
  private readonly listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private socketTimeoutTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private stableConnectionTimer: number | null = null;
  private reconnectAttempt = 0;
  private lobbyVisible = false;
  private pageVisible = document.visibilityState === "visible";
  private awaitingSnapshot = false;
  private offerTimer: number | null = null;
  private nextOfferAt: number | null = null;
  private initialOfferCount: number | null = null;
  private offersInitialized = false;
  private readonly profileBags = new Map<
    string,
    ReturnType<typeof opponentProfilesForLobby>[number][]
  >();
  private readonly lastProfileByFilter = new Map<string, string>();

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.snapshot;

  setVisible(visible: boolean) {
    this.lobbyVisible = visible;
    this.syncConnection();
  }

  setPageVisible(visible: boolean) {
    this.pageVisible = visible;
    this.syncConnection();
  }

  setFilter(filter: string) {
    const nextFilter = GAME_CATALOG.some((game) => game.id === filter) ? filter : "all";
    if (this.snapshot.filter === nextFilter) return;
    this.awaitingSnapshot = true;
    this.clearOfferTimer();
    this.nextOfferAt = null;
    this.initialOfferCount = null;
    this.offersInitialized = false;
    this.update({
      ...this.snapshot,
      filter: nextFilter,
      matches: [],
      opponentOffers: [],
      hasLoadedSnapshot: false,
      totalMatches: null,
      cursor: null,
      hasMore: false,
      loadingMore: false,
    });
    this.restoreOffers(nextFilter);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "subscribe",
          gameId: nextFilter === "all" ? null : nextFilter,
        }),
      );
      this.armSocketTimeout(this.socket);
    }
  }

  retry() {
    this.reconnectAttempt = 0;
    this.closeSocket();
    this.connect();
  }

  loadMore() {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      !this.snapshot.cursor ||
      this.snapshot.loadingMore
    )
      return;
    this.update({ ...this.snapshot, loadingMore: true });
    this.socket.send(JSON.stringify({ type: "load-more", cursor: this.snapshot.cursor }));
  }

  consumeOpponentOffer(offerId: string) {
    const opponentOffers = this.snapshot.opponentOffers.filter(
      (offer) => offer.offerId !== offerId,
    );
    if (opponentOffers.length === this.snapshot.opponentOffers.length) return;
    this.update({ ...this.snapshot, opponentOffers });
  }

  private update(snapshot: LobbyState) {
    this.snapshot = snapshot;
    this.syncOffers();
    for (const listener of this.listeners) listener();
  }

  private syncOffers() {
    if (!this.snapshot.hasLoadedSnapshot) {
      this.clearOfferTimer();
      return;
    }
    const profiles = opponentProfilesForLobby(this.snapshot.filter);
    const now = Date.now();
    let offers = this.snapshot.opponentOffers.filter((offer) => offer.expiresAt > now);

    if (!profiles.length) {
      offers = [];
      this.nextOfferAt = null;
      this.snapshot = { ...this.snapshot, opponentOffers: offers };
      this.persistOffers();
      this.scheduleOfferTimer();
      return;
    }

    // Keep the restored roster while human pages are loading; render it only
    // after every human room has been listed so humans always appear first.
    if (this.snapshot.hasMore) {
      this.nextOfferAt = null;
    } else if (!this.offersInitialized) {
      this.initialOfferCount ??= randomInHouseOfferCount();
      this.snapshot = { ...this.snapshot, opponentOffers: offers };
      offers = this.createOffers(this.initialOfferCount, profiles, now);
      this.offersInitialized = true;
      this.nextOfferAt = null;
    } else {
      const refillCount = inHouseRefillCount(offers.length);
      if (refillCount === 0) {
        this.nextOfferAt = null;
      } else {
        this.nextOfferAt ??= now + randomBetween(8_000, 18_000);
        if (this.nextOfferAt <= now) {
          this.snapshot = { ...this.snapshot, opponentOffers: offers };
          offers = [
            ...offers,
            ...this.createOffers(
              Math.min(refillCount, MAX_IN_HOUSE_MATCH_COUNT - offers.length),
              profiles,
              now,
            ),
          ];
          this.nextOfferAt =
            inHouseRefillCount(offers.length) > 0 ? now + randomBetween(8_000, 18_000) : null;
        }
      }
    }

    this.snapshot = { ...this.snapshot, opponentOffers: offers };
    this.persistOffers();
    this.scheduleOfferTimer();
  }

  private createOffers(
    count: number,
    profiles: ReturnType<typeof opponentProfilesForLobby>,
    now: number,
  ): LobbyOpponentOffer[] {
    const usedPlayers = new Set(this.snapshot.opponentOffers.map((offer) => offer.inHousePlayerId));
    const availablePlayers = this.houseRosterOrder.filter(
      (player) => !usedPlayers.has(player.playerId),
    );
    return Array.from(
      { length: Math.min(Math.max(0, count), availablePlayers.length) },
      (_, index) => {
        const profile = this.nextProfile(profiles);
        const identity = availablePlayers[index]!;
        const displayName = identity.displayName;
        return {
          offerId: `${now.toString(36)}-${Math.random().toString(36).slice(2, 9)}-${index}`,
          inHousePlayerId: identity.playerId,
          gameId: profile.gameId,
          profileId: identity.difficulty,
          displayName,
          seriesTarget: ([1, 2, 3] as const)[Math.floor(Math.random() * 3)]!,
          expiresAt: now + randomBetween(180_000, 300_000),
        };
      },
    );
  }

  private nextProfile(
    profiles: ReturnType<typeof opponentProfilesForLobby>,
  ): ReturnType<typeof opponentProfilesForLobby>[number] {
    const filter = this.snapshot.filter;
    const availableIds = new Set(profiles.map((profile) => profile.id));
    let bag = (this.profileBags.get(filter) ?? []).filter((profile) =>
      availableIds.has(profile.id),
    );
    if (!bag.length) bag = shuffled(profiles);
    const lastId = this.lastProfileByFilter.get(filter);
    if (bag.length > 1 && bag[0]?.id === lastId) [bag[0], bag[1]] = [bag[1]!, bag[0]!];
    const profile = bag.shift() ?? profiles[0]!;
    this.profileBags.set(filter, bag);
    this.lastProfileByFilter.set(filter, profile.id);
    return profile;
  }

  private scheduleOfferTimer() {
    this.clearOfferTimer();
    if (!this.lobbyVisible || !this.pageVisible || !this.snapshot.hasLoadedSnapshot) return;
    const nextExpiry = this.snapshot.opponentOffers.reduce<number | null>(
      (soonest, offer) =>
        soonest === null || offer.expiresAt < soonest ? offer.expiresAt : soonest,
      null,
    );
    const deadlines = [nextExpiry, this.nextOfferAt].filter(
      (value): value is number => value !== null,
    );
    if (!deadlines.length) return;
    this.offerTimer = window.setTimeout(
      () => {
        this.offerTimer = null;
        this.update({ ...this.snapshot });
      },
      Math.max(0, Math.min(...deadlines) - Date.now()),
    );
  }

  private clearOfferTimer() {
    if (this.offerTimer !== null) window.clearTimeout(this.offerTimer);
    this.offerTimer = null;
  }

  private persistOffers() {
    try {
      sessionStorage.setItem(
        `games:lobby-offers:${this.snapshot.filter}`,
        JSON.stringify({
          offers: this.snapshot.opponentOffers,
          nextOfferAt: this.nextOfferAt,
          initialOfferCount: this.initialOfferCount,
          offersInitialized: this.offersInitialized,
        }),
      );
    } catch {
      /* Offers are ephemeral if browser storage is unavailable. */
    }
  }

  private restoreOffers(filter: string) {
    try {
      const saved = sessionStorage.getItem(`games:lobby-offers:${filter}`);
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        offers?: LobbyOpponentOffer[];
        nextOfferAt?: number | null;
        initialOfferCount?: number;
        offersInitialized?: boolean;
        offerTarget?: number;
      };
      const offers = Array.isArray(parsed.offers)
        ? parsed.offers.flatMap((offer) => {
            if (
              !offer ||
              typeof offer.offerId !== "string" ||
              typeof offer.gameId !== "string" ||
              typeof offer.inHousePlayerId !== "string" ||
              typeof offer.displayName !== "string" ||
              ![1, 2, 3].includes(offer.seriesTarget) ||
              !Number.isFinite(offer.expiresAt) ||
              offer.expiresAt <= Date.now()
            )
              return [];
            const identity = IN_HOUSE_PLAYERS.find(
              (player) => player.playerId === offer.inHousePlayerId,
            );
            if (!identity || !GAME_CATALOG.some((game) => game.id === offer.gameId)) return [];
            return [
              {
                ...offer,
                profileId: identity.difficulty,
                displayName: identity.displayName,
              },
            ];
          })
        : [];
      this.snapshot = { ...this.snapshot, opponentOffers: offers };
      const savedInitialCount = parsed.initialOfferCount ?? parsed.offerTarget;
      this.initialOfferCount =
        Number.isSafeInteger(savedInitialCount) &&
        savedInitialCount! >= MIN_IN_HOUSE_MATCH_COUNT &&
        savedInitialCount! <= MAX_IN_HOUSE_MATCH_COUNT
          ? savedInitialCount!
          : null;
      this.offersInitialized =
        typeof parsed.offersInitialized === "boolean"
          ? parsed.offersInitialized
          : Array.isArray(parsed.offers);
      this.nextOfferAt =
        typeof parsed.nextOfferAt === "number" && parsed.nextOfferAt > Date.now()
          ? parsed.nextOfferAt
          : null;
    } catch {
      this.nextOfferAt = null;
      this.initialOfferCount = null;
      this.offersInitialized = false;
    }
  }

  private syncConnection() {
    if (!this.lobbyVisible || !this.pageVisible) {
      this.clearOfferTimer();
      this.closeSocket();
      return;
    }
    if (!this.socket && this.reconnectTimer === null) this.connect();
  }

  private connect() {
    if (!this.lobbyVisible || !this.pageVisible || this.socket) return;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.update({
      ...this.snapshot,
      connection: this.reconnectAttempt === 0 ? "connecting" : "reconnecting",
      canReconnect: false,
    });
    this.awaitingSnapshot = true;
    this.restoreOffers(this.snapshot.filter);
    const socket = new WebSocket(socketUrl(this.snapshot.filter));
    this.socket = socket;
    this.armSocketTimeout(socket);

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      socket.send(
        JSON.stringify({
          type: "identify",
          gameId: this.snapshot.filter === "all" ? null : this.snapshot.filter,
        }),
      );
      if (this.stableConnectionTimer !== null) window.clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = window.setTimeout(() => {
        this.reconnectAttempt = 0;
      }, 15_000);
      this.armSocketTimeout(socket);
      this.update({
        ...this.snapshot,
        connection: "connected",
        error: "",
        canReconnect: false,
      });
    });

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      if (this.socket !== socket) return;
      let message: unknown;
      try {
        message = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }
      if (!isRecord(message) || typeof message.type !== "string") return;

      if (message.type === "lobby-page" && this.awaitingSnapshot) return;
      if (message.type === "lobby-snapshot" || message.type === "lobby-page") {
        if (message.type === "lobby-snapshot") {
          this.awaitingSnapshot = false;
          this.clearSocketTimeout();
        }
        const incoming = Array.isArray(message.matches) ? message.matches.filter(isLobbyMatch) : [];
        const matches =
          message.type === "lobby-snapshot"
            ? incoming
            : [
                ...this.snapshot.matches,
                ...incoming.filter(
                  (item) => !this.snapshot.matches.some((known) => known.matchId === item.matchId),
                ),
              ];
        this.update({
          ...this.snapshot,
          matches,
          hasLoadedSnapshot: this.snapshot.hasLoadedSnapshot || message.type === "lobby-snapshot",
          totalMatches:
            Number.isSafeInteger(message.totalMatches) && Number(message.totalMatches) >= 0
              ? Number(message.totalMatches)
              : this.snapshot.totalMatches,
          cursor: typeof message.nextCursor === "string" ? message.nextCursor : null,
          hasMore: message.hasMore === true,
          loadingMore: false,
          error: "",
        });
      } else if (message.type === "lobby-room-upsert" && isLobbyMatch(message.match)) {
        const match = message.match;
        const filtered = this.snapshot.matches.filter((item) => item.matchId !== match.matchId);
        const matches =
          this.snapshot.filter === "all" || match.gameId === this.snapshot.filter
            ? [match, ...filtered]
            : filtered;
        matches.sort(
          (left, right) =>
            right.createdAt - left.createdAt || left.matchId.localeCompare(right.matchId),
        );
        this.update({
          ...this.snapshot,
          matches,
          totalMatches:
            Number.isSafeInteger(message.totalMatches) && Number(message.totalMatches) >= 0
              ? Number(message.totalMatches)
              : this.snapshot.totalMatches,
        });
      } else if (message.type === "lobby-room-remove" && typeof message.matchId === "string") {
        this.update({
          ...this.snapshot,
          matches: this.snapshot.matches.filter((item) => item.matchId !== message.matchId),
          totalMatches:
            Number.isSafeInteger(message.totalMatches) && Number(message.totalMatches) >= 0
              ? Number(message.totalMatches)
              : this.snapshot.totalMatches,
        });
      } else if (message.type === "lobby-rooms-remove" && Array.isArray(message.matchIds)) {
        const removed = new Set(
          message.matchIds.filter((item): item is string => typeof item === "string"),
        );
        this.update({
          ...this.snapshot,
          matches: this.snapshot.matches.filter((item) => !removed.has(item.matchId)),
          totalMatches:
            Number.isSafeInteger(message.totalMatches) && Number(message.totalMatches) >= 0
              ? Number(message.totalMatches)
              : this.snapshot.totalMatches,
        });
      } else if (message.type === "lobby-error") {
        this.update({
          ...this.snapshot,
          error:
            typeof message.message === "string" ? message.message : "Live matches are unavailable.",
        });
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.clearSocketTimeout();
      this.socket = null;
      if (this.stableConnectionTimer !== null) window.clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = null;
      if (!this.lobbyVisible || !this.pageVisible) return;
      this.reconnectAttempt += 1;
      this.update({
        ...this.snapshot,
        connection: "reconnecting",
        canReconnect: this.reconnectAttempt >= 2,
        loadingMore: false,
      });
      this.reconnectTimer = window.setTimeout(
        () => {
          this.reconnectTimer = null;
          this.connect();
        },
        Math.min(1_000 * 2 ** (this.reconnectAttempt - 1), 30_000),
      );
    });

    socket.addEventListener("error", () => {
      if (this.socket === socket)
        this.update({
          ...this.snapshot,
          error: "Live matches are unavailable. Reconnecting…",
        });
    });
  }

  private armSocketTimeout(socket: WebSocket) {
    this.clearSocketTimeout();
    this.socketTimeoutTimer = window.setTimeout(() => {
      this.socketTimeoutTimer = null;
      if (this.socket !== socket) return;
      this.update({
        ...this.snapshot,
        error: "Live matches are taking too long to load. Reconnecting…",
      });
      if (socket.readyState < WebSocket.CLOSING) socket.close(4000, "Lobby connection timed out");
    }, LOBBY_SOCKET_TIMEOUT_MS);
  }

  private clearSocketTimeout() {
    if (this.socketTimeoutTimer !== null) window.clearTimeout(this.socketTimeoutTimer);
    this.socketTimeoutTimer = null;
  }

  private closeSocket() {
    this.clearSocketTimeout();
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.stableConnectionTimer !== null) window.clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = null;
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.close(1000, "Lobby not visible");
  }
}

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export const lobbyClient = new LobbyClient();
