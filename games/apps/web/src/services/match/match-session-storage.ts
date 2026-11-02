export type MatchSeat = 'first' | 'second';
export type MatchOperation = 'creating' | 'joining';
export type MatchCredential = Readonly<{
  seatToken: string;
  seat: MatchSeat;
  displayName?: string | null;
  gameId?: string;
}>;
export type ActiveMatch = MatchCredential & Readonly<{
  matchId: string;
  gameId?: string;
}>;
export type MatchReservation = Readonly<{
  pending: true;
  attemptId: string | null;
  operation: MatchOperation;
  matchId: string | null;
  createdAt: number;
}>;
export type DeviceMatchLock = ActiveMatch | MatchReservation;

const ACTIVE_MATCH_KEY = 'games-active-match';
const MATCH_SETUP_LOCK_TIMEOUT_MS = 120_000;
const MATCH_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSeat(value: unknown): value is MatchSeat {
  return value === 'first' || value === 'second';
}

function parseLock(value: unknown): DeviceMatchLock | null {
  if (!isRecord(value)) return null;
  if (value.pending === true && typeof value.attemptId === 'string' &&
    (value.operation === 'creating' || value.operation === 'joining') &&
    (value.matchId === null || typeof value.matchId === 'string') && Number.isFinite(value.createdAt)) {
    return value as unknown as MatchReservation;
  }
  if (typeof value.matchId === 'string' && MATCH_ID_PATTERN.test(value.matchId) &&
    typeof value.seatToken === 'string' && value.seatToken.length > 0 && isSeat(value.seat)) {
    return value as unknown as ActiveMatch;
  }
  return null;
}

/** Browser persistence for one active match per device and tab-scoped seat recovery. */
export class MatchSessionStorage {
  readLock(): DeviceMatchLock | null {
    try {
      const raw = localStorage.getItem(ACTIVE_MATCH_KEY);
      if (raw === null) return null;
      const parsed = parseLock(JSON.parse(raw));
      if (!parsed) {
        localStorage.removeItem(ACTIVE_MATCH_KEY);
        return null;
      }
      if ('pending' in parsed && Date.now() - parsed.createdAt > MATCH_SETUP_LOCK_TIMEOUT_MS) {
        localStorage.removeItem(ACTIVE_MATCH_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  readActiveMatch(): ActiveMatch | null {
    const lock = this.readLock();
    return lock && !('pending' in lock) ? lock : null;
  }

  async reserve(operation: MatchOperation, matchId: string | null = null): Promise<MatchReservation | null> {
    let reservation: MatchReservation | null = null;
    const tryReserve = (): void => {
      if (this.readLock()) return;
      reservation = {
        pending: true,
        attemptId: crypto.randomUUID(),
        operation,
        matchId,
        createdAt: Date.now(),
      };
      try {
        localStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify(reservation));
      } catch {
        // Continue without a cross-refresh lock when browser storage is unavailable.
        reservation = { ...reservation, attemptId: null };
      }
    };

    if (navigator.locks?.request) {
      await navigator.locks.request('games-active-match-reservation', tryReserve);
    } else {
      tryReserve();
    }
    return reservation;
  }

  async reserveWaitingReplacement(previous: ActiveMatch): Promise<MatchReservation | null> {
    let reservation: MatchReservation | null = null;
    const tryReserve = (): void => {
      const current = this.readLock();
      if (!current || 'pending' in current || current.matchId !== previous.matchId || current.seatToken !== previous.seatToken) return;
      reservation = {
        pending: true,
        attemptId: crypto.randomUUID(),
        operation: 'creating',
        matchId: previous.matchId,
        createdAt: Date.now(),
      };
      try { localStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify(reservation)); } catch {
        reservation = { ...reservation, attemptId: null };
      }
    };
    if (navigator.locks?.request) await navigator.locks.request('games-active-match-reservation', tryReserve);
    else tryReserve();
    return reservation;
  }

  restoreWaitingReplacement(reservation: MatchReservation, previous: ActiveMatch): boolean {
    const current = this.readLock();
    if (!current || !('pending' in current) || current.matchId !== reservation.matchId ||
      (reservation.attemptId !== null && current.attemptId !== reservation.attemptId)) return false;
    this.saveActiveMatch(previous);
    return true;
  }

  release(reservation: MatchReservation | null | undefined): boolean {
    if (!reservation?.attemptId) return false;
    try {
      const current = this.readLock();
      if (!current || !('pending' in current) || current.attemptId !== reservation.attemptId) return false;
      localStorage.removeItem(ACTIVE_MATCH_KEY);
      return true;
    } catch {
      return false;
    }
  }

  saveActiveMatch(match: ActiveMatch): void {
    try { localStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify(match)); } catch {
      // The current tab can still recover the seat from session storage.
    }
  }

  clearActiveMatch(matchId?: string | null): boolean {
    try {
      const saved = this.readActiveMatch();
      if (!saved || (matchId && saved.matchId !== matchId)) return false;
      localStorage.removeItem(ACTIVE_MATCH_KEY);
      return true;
    } catch {
      return false;
    }
  }

  readSeat(matchId: string): MatchCredential | null {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(`games-seat:${matchId}`) ?? 'null');
      if (!isRecord(value) || typeof value.seatToken !== 'string' || value.seatToken.length === 0 || !isSeat(value.seat)) return null;
      return {
        seatToken: value.seatToken,
        seat: value.seat,
        displayName: typeof value.displayName === 'string' ? value.displayName : null,
      };
    } catch {
      return null;
    }
  }

  saveSeat(matchId: string, credential: MatchCredential): void {
    try { sessionStorage.setItem(`games-seat:${matchId}`, JSON.stringify(credential)); } catch {}
  }

  removeSeat(matchId: string): void {
    try { sessionStorage.removeItem(`games-seat:${matchId}`); } catch {}
  }

  readInviteLink(matchId: string): string {
    try { return sessionStorage.getItem(`games-invite-link:${matchId}`) ?? ''; } catch { return ''; }
  }

  saveInviteLink(matchId: string, link: string): void {
    try { sessionStorage.setItem(`games-invite-link:${matchId}`, link); } catch {}
  }

  removeInviteLink(matchId: string): void {
    try { sessionStorage.removeItem(`games-invite-link:${matchId}`); } catch {}
  }
}
