import type { MatchApiBody, MatchApiClient } from "./match-api-client.js";
import type {
  ActiveMatch,
  DeviceMatchLock,
  MatchCredential,
  MatchOperation,
  MatchReservation,
  MatchSessionStorage,
} from "./match-session-storage.js";

export type SavedMatchResolution =
  | Readonly<{ status: "available"; match: MatchApiBody }>
  | Readonly<{ status: "closed" }>
  | Readonly<{ status: "unavailable" }>;

export type ActiveMatchResolution =
  | Readonly<{ status: "none" }>
  | Readonly<{ status: "available"; saved: ActiveMatch; match: MatchApiBody }>
  | Readonly<{ status: "closed"; saved: ActiveMatch }>
  | Readonly<{ status: "unavailable"; saved: ActiveMatch }>;

export type CreateRoomResolution =
  | Readonly<{ status: "blocked"; lock: DeviceMatchLock | null }>
  | Readonly<{
      status: "created";
      matchId: string;
      seatToken: string;
      inviteToken: string | null;
      listed: boolean;
      seat?: "first" | "second";
      matched?: boolean;
      aiFallbackAt?: number | null;
    }>
  | Readonly<{ status: "rejected"; body: MatchApiBody }>;

export type JoinRoomResolution =
  | Readonly<{ status: "blocked"; lock: DeviceMatchLock | null }>
  | Readonly<{ status: "closed" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "reconnected"; credential: MatchCredential }>
  | Readonly<{ status: "joined"; credential: MatchCredential; reservation: MatchReservation }>
  | Readonly<{ status: "rejected"; body: MatchApiBody }>;

export type CancelRoomResolution =
  | Readonly<{ status: "cancelled"; match: MatchApiBody | undefined }>
  | Readonly<{ status: "not-waiting"; match: MatchApiBody }>
  | Readonly<{ status: "rejected"; message: string }>;

export type LeaveWaitingRoomResolution =
  | Readonly<{ status: "left"; match: MatchApiBody }>
  | Readonly<{ status: "not-waiting"; match: MatchApiBody }>
  | Readonly<{ status: "rejected"; message: string }>;

/** Coordinates browser seat recovery with the authoritative match service. */
export class MatchSessionCoordinator {
  constructor(
    private readonly api: MatchApiClient,
    private readonly storage: MatchSessionStorage,
  ) {}

  isClosedForSeat(match: MatchApiBody | null | undefined, seat: MatchCredential["seat"]): boolean {
    if (!match) return false;
    const ownIndex = seat === "first" ? 0 : 1;
    const closedSeats = Array.isArray(match.closedSeats) ? match.closedSeats : [];
    return (
      ["cancelled", "expired"].includes(String(match.status)) ||
      Boolean(closedSeats[ownIndex]) ||
      (match.status === "completed" && closedSeats.some(Boolean))
    );
  }

  async reconcileLock(
    lock: DeviceMatchLock | null = this.storage.readLock(),
  ): Promise<DeviceMatchLock | null> {
    if (!lock || "pending" in lock) return lock;
    const resolution = await this.resolveSavedSeat(lock.matchId, lock);
    if (resolution.status === "closed") this.storage.clearActiveMatch(lock.matchId);
    return this.storage.readLock();
  }

  async reserveSlot(
    operation: MatchOperation,
    matchId: string | null = null,
  ): Promise<MatchReservation | null> {
    const lock = this.storage.readLock();
    if (lock && !("pending" in lock)) await this.reconcileLock(lock);
    return this.storage.reserve(operation, matchId);
  }

  async recoverActiveMatch(): Promise<ActiveMatchResolution> {
    const saved = this.storage.readActiveMatch();
    if (!saved) return { status: "none" };
    const result = await this.resolveSavedSeat(saved.matchId, saved);
    if (result.status === "closed") {
      this.storage.clearActiveMatch(saved.matchId);
      return { status: "closed", saved };
    }
    if (result.status === "unavailable") return { status: "unavailable", saved };
    return { status: "available", saved, match: result.match };
  }

  async createRoom(
    input: Readonly<{
      gameId: string;
      rulesVersion: number;
      visibility: string;
      seriesTarget: number;
      displayName: string;
      identityMode?: "account" | "guest";
    }>,
  ): Promise<CreateRoomResolution> {
    const reservation = await this.reserveSlot("creating");
    if (!reservation) return { status: "blocked", lock: this.storage.readLock() };
    try {
      const response = await this.api.createMatch(input);
      if (!response.ok) {
        this.storage.release(reservation);
        return { status: "rejected", body: response.body };
      }
      const { matchId, seatToken, inviteToken, listed } = response.body;
      if (
        typeof matchId !== "string" ||
        !/^[A-Za-z0-9_-]{22}$/.test(matchId) ||
        typeof seatToken !== "string" ||
        seatToken.length === 0 ||
        (inviteToken !== undefined && inviteToken !== null && typeof inviteToken !== "string") ||
        (input.visibility === "invite" &&
          (typeof inviteToken !== "string" || inviteToken.length === 0))
      ) {
        this.storage.release(reservation);
        return { status: "rejected", body: { error: "invalid-response" } };
      }
      return {
        status: "created",
        matchId,
        seatToken,
        inviteToken: typeof inviteToken === "string" ? inviteToken : null,
        listed: listed === true,
      };
    } catch (error) {
      this.storage.release(reservation);
      throw error;
    }
  }

  async quickMatch(
    input: Readonly<{
      gameId: string;
      rulesVersion: number;
      seriesTarget: number;
      matchAnySeries?: boolean;
      displayName: string;
      identityMode?: "account" | "guest";
    }>,
  ): Promise<CreateRoomResolution> {
    const reservation = await this.reserveSlot("creating");
    if (!reservation) return { status: "blocked", lock: this.storage.readLock() };
    try {
      const response = await this.api.quickMatch(input);
      if (!response.ok) {
        this.storage.release(reservation);
        return { status: "rejected", body: response.body };
      }
      const { matchId, seatToken } = response.body;
      if (
        typeof matchId !== "string" ||
        !/^[A-Za-z0-9_-]{22}$/.test(matchId) ||
        typeof seatToken !== "string" ||
        seatToken.length === 0 ||
        (response.body.seat !== "first" && response.body.seat !== "second")
      ) {
        this.storage.release(reservation);
        return { status: "rejected", body: { error: "invalid-response" } };
      }
      return {
        status: "created",
        matchId,
        seatToken,
        inviteToken: null,
        listed: response.body.listed === true,
        seat: response.body.seat,
        matched: response.body.matched === true,
        aiFallbackAt:
          typeof response.body.aiFallbackAt === "number" ? response.body.aiFallbackAt : null,
      };
    } catch (error) {
      this.storage.release(reservation);
      throw error;
    }
  }

  async createAiRoom(
    input: Readonly<{
      gameId: string;
      profileId: string;
      inHousePlayerId: string;
      seriesTarget: number;
      displayName: string;
      opponentName: string;
      identityMode?: "account" | "guest";
    }>,
  ): Promise<CreateRoomResolution> {
    const reservation = await this.reserveSlot("creating");
    if (!reservation) return { status: "blocked", lock: this.storage.readLock() };
    try {
      const response = await this.api.createAiMatch(input);
      if (!response.ok) {
        this.storage.release(reservation);
        return { status: "rejected", body: response.body };
      }
      const { matchId, seatToken } = response.body;
      if (
        typeof matchId !== "string" ||
        !/^[A-Za-z0-9_-]{22}$/.test(matchId) ||
        typeof seatToken !== "string" ||
        seatToken.length === 0 ||
        response.body.seat !== "second"
      ) {
        this.storage.release(reservation);
        return { status: "rejected", body: { error: "invalid-response" } };
      }
      return { status: "created", matchId, seatToken, inviteToken: null, listed: false };
    } catch (error) {
      this.storage.release(reservation);
      throw error;
    }
  }

  async previewRoom(
    matchId: string,
    inviteToken: string | null,
    supportedGames: Readonly<Record<string, readonly number[]>>,
  ): Promise<
    | Readonly<{
        status: "available";
        preview: MatchApiBody;
      }>
    | Readonly<{ status: "unavailable"; code: string }>
  > {
    const response = await this.api.previewMatch(matchId, inviteToken, supportedGames);
    return response.ok
      ? { status: "available", preview: response.body }
      : {
          status: "unavailable",
          code:
            typeof response.body.error === "string" ? response.body.error : "preview-unavailable",
        };
  }

  async joinRoom(
    matchId: string,
    input: Readonly<{
      inviteToken: string | null;
      displayName: string | null;
      identityMode?: "account" | "guest";
      supportedGames: Readonly<Record<string, readonly number[]>>;
    }>,
  ): Promise<JoinRoomResolution> {
    let lock = this.storage.readLock();
    if (lock && !("pending" in lock) && lock.matchId !== matchId)
      lock = await this.reconcileLock(lock);
    if (lock && ("pending" in lock || lock.matchId !== matchId)) return { status: "blocked", lock };

    const savedCredential =
      lock && !("pending" in lock) && lock.matchId === matchId
        ? lock
        : this.storage.readSeat(matchId);
    if (savedCredential) {
      const saved = await this.resolveSavedSeat(matchId, savedCredential);
      if (saved.status !== "available") return saved;
      return { status: "reconnected", credential: savedCredential };
    }

    const reservation = await this.reserveSlot("joining", matchId);
    if (!reservation) return { status: "blocked", lock: this.storage.readLock() };
    try {
      const response = await this.api.joinMatch(matchId, input);
      if (!response.ok) {
        this.storage.release(reservation);
        return { status: "rejected", body: response.body };
      }
      const { seatToken, seat } = response.body;
      if (
        typeof seatToken !== "string" ||
        seatToken.length === 0 ||
        (seat !== "first" && seat !== "second")
      ) {
        this.storage.release(reservation);
        return { status: "rejected", body: { error: "invalid-response" } };
      }
      return {
        status: "joined",
        credential: { seatToken, seat, displayName: input.displayName },
        reservation,
      };
    } catch (error) {
      this.storage.release(reservation);
      throw error;
    }
  }

  async cancelWaitingRoom(matchId: string, seatToken: string): Promise<CancelRoomResolution> {
    const response = await this.api.cancelMatch(matchId, seatToken);
    if (response.ok) {
      const match = response.body.match;
      if (match && typeof match === "object" && !Array.isArray(match)) {
        return { status: "cancelled", match: match as MatchApiBody };
      }
      return { status: "rejected", message: "The room could not be closed. Try again." };
    }
    if (response.status === 409) {
      const latest = await this.api.getMatch(matchId, seatToken);
      if (
        latest.ok &&
        (latest.body.status !== "waiting" ||
          (Array.isArray(latest.body.playerNames) &&
            typeof latest.body.playerNames[1] === "string"))
      ) {
        return { status: "not-waiting", match: latest.body };
      }
    }
    return {
      status: "rejected",
      message:
        typeof response.body.message === "string"
          ? response.body.message
          : "The room could not be closed. Try again.",
    };
  }

  async leaveWaitingRoom(matchId: string, seatToken: string): Promise<LeaveWaitingRoomResolution> {
    const response = await this.api.leaveWaitingMatch(matchId, seatToken);
    if (response.ok) {
      const match = response.body.match;
      if (match && typeof match === "object" && !Array.isArray(match)) {
        return { status: "left", match: match as MatchApiBody };
      }
      return { status: "rejected", message: "You could not leave this match. Try again." };
    }
    if (response.status === 409) {
      const latest = await this.api.getMatch(matchId, seatToken);
      if (latest.ok && latest.body.status !== "waiting")
        return { status: "not-waiting", match: latest.body };
    }
    return {
      status: "rejected",
      message:
        typeof response.body.message === "string"
          ? response.body.message
          : "You could not leave this match. Try again.",
    };
  }

  releasePendingReservation(reservation: MatchReservation): void {
    this.storage.release(reservation);
  }

  async resolveSavedSeat(
    matchId: string,
    credential: MatchCredential,
  ): Promise<SavedMatchResolution> {
    try {
      const response = await this.api.getMatch(matchId, credential.seatToken);
      if ([401, 404, 410].includes(response.status)) return { status: "closed" };
      if (!response.ok) return { status: "unavailable" };
      if (this.isClosedForSeat(response.body, credential.seat)) return { status: "closed" };
      return { status: "available", match: response.body };
    } catch {
      return { status: "unavailable" };
    }
  }
}
