import type { PlayerSeat } from '../../../../../packages/contracts/dist/index.js';

export type LiveMatch = {
  matchId: string;
  gameId: string;
  rulesVersion: number;
  visibility: 'public' | 'invite';
  status: 'waiting' | 'countdown' | 'active' | 'between-games' | 'completed' | 'cancelled' | 'expired';
  revision: number;
  state: unknown | null;
  connectedSeats?: readonly boolean[];
  playerNames?: readonly (string | null)[];
  countdownAt: number | null;
  turnDeadline: number | null;
  awaitingTurnReceipt?: { seat: PlayerSeat; deadline: number } | null;
  nextGameDeadline: number | null;
  expiresAt: number;
  serverNow: number;
  seriesTarget: 1 | 2 | 3;
  wins: Readonly<{ first: number; second: number }>;
  gameNumber: number;
  nextReady?: readonly boolean[];
  rematchReady?: readonly boolean[];
  closedSeats?: readonly boolean[];
  seriesWinner?: PlayerSeat | null;
  nextStartingSeat?: PlayerSeat | null;
  rematchCountdown?: boolean;
  outcome?: string | null;
  reconnectRemainingMs?: readonly (number | null)[];
};

export type OnlineMultiplayer = {
  online: true;
  roomId: string;
  seatToken: string;
  seat: PlayerSeat;
  displayName: string | null;
  connected: boolean;
  revision: number;
  match: LiveMatch | null;
  reconnectAttempt: number;
  reconnectStopped: boolean;
  reconnecting: boolean;
  clientDisconnectedAt: number | null;
  clientReconnectBudgetMs: number | null;
  resuming: boolean;
  turnReceiptAckedRevision: number | null;
};

export type PendingOnlineMove = Readonly<{
  actionId: string;
  action: unknown;
  previousStateKey: string;
  seat: PlayerSeat;
  expectedRevision: number;
}>;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlayerSeat(value: unknown): value is PlayerSeat {
  return value === 'first' || value === 'second';
}

/** Parse and validate a server match payload before it enters client state. */
export function parseLiveMatch(value: unknown): LiveMatch | null {
  if (!isRecord(value) || typeof value.matchId !== 'string' ||
    typeof value.gameId !== 'string' || !Number.isSafeInteger(value.rulesVersion) || Number(value.rulesVersion) < 1 || !['public', 'invite'].includes(String(value.visibility)) ||
    !['waiting', 'countdown', 'active', 'between-games', 'completed', 'cancelled', 'expired'].includes(String(value.status)) ||
    !Number.isSafeInteger(value.revision) || !Number.isFinite(value.serverNow) || !Number.isFinite(value.expiresAt) ||
    ![1, 2, 3].includes(Number(value.seriesTarget)) || !Number.isSafeInteger(value.gameNumber)) return null;
  const wins = value.wins;
  const nullableNumber = (entry: unknown) => entry === null || (typeof entry === 'number' && Number.isFinite(entry));
  const optionalSeats = (entry: unknown) => entry === undefined || (Array.isArray(entry) && entry.length === 2 && entry.every((item) => typeof item === 'boolean'));
  if (!isRecord(wins) || !Number.isSafeInteger(wins.first) || !Number.isSafeInteger(wins.second) ||
    !nullableNumber(value.countdownAt) || !nullableNumber(value.turnDeadline) || !nullableNumber(value.nextGameDeadline) ||
    !optionalSeats(value.connectedSeats) || !optionalSeats(value.nextReady) || !optionalSeats(value.rematchReady) || !optionalSeats(value.closedSeats)) return null;
  if (value.awaitingTurnReceipt !== undefined && value.awaitingTurnReceipt !== null &&
    (!isRecord(value.awaitingTurnReceipt) ||
      !isPlayerSeat(value.awaitingTurnReceipt.seat) ||
      !Number.isFinite(value.awaitingTurnReceipt.deadline))) return null;
  return value as unknown as LiveMatch;
}
