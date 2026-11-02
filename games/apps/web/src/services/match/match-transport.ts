import { isMatchReactionId, isPlayerSeat, normalizeQuickMessage } from '../../../../../packages/contracts/dist/index.js';
import type { MatchReactionId, PlayerSeat } from '../../../../../packages/contracts/dist/index.js';

export type MatchTransportState = Readonly<{
  connected: boolean;
  resuming: boolean;
  reconnectStopped: boolean;
  reconnectAttempt: number;
  disconnectedAt: number | null;
}>;

export type MatchSocketMessage =
  | Readonly<{ type: 'match'; match: unknown; syncId?: string; acceptedActionId?: string }>
  | Readonly<{ type: 'sync-rejected'; syncId?: string; code?: string }>
  | Readonly<{ type: 'action-rejected'; actionId?: string; code?: string }>
  | Readonly<{ type: 'reaction'; eventId: string; seat: PlayerSeat; reactionId: MatchReactionId }>
  | Readonly<{ type: 'reaction-rejected'; code?: string }>
  | Readonly<{ type: 'quick-message'; eventId: string; seat: PlayerSeat; message: string }>
  | Readonly<{ type: 'quick-message-rejected'; code?: string }>
  | Readonly<{ type: 'error'; code?: string }>;

type TransportOptions = Readonly<{
  url: string;
  seatToken: string;
  getReconnectRemainingMs: () => number;
  getMatchStatus: () => string | undefined;
  onStateChange: (state: MatchTransportState) => void;
  onMessage: (message: MatchSocketMessage) => void;
}>;

function parseSocketMessage(input: unknown): MatchSocketMessage | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  const message = input as Record<string, unknown>;
  if (message.type === 'match' && Object.hasOwn(message, 'match')) {
    return {
      type: 'match',
      match: message.match,
      ...(typeof message.syncId === 'string' ? { syncId: message.syncId } : {}),
      ...(typeof message.acceptedActionId === 'string' ? { acceptedActionId: message.acceptedActionId } : {}),
    };
  }
  if (message.type === 'sync-rejected') {
    return typeof message.syncId === 'string'
      ? { type: 'sync-rejected', syncId: message.syncId, ...(typeof message.code === 'string' ? { code: message.code } : {}) }
      : { type: 'sync-rejected', ...(typeof message.code === 'string' ? { code: message.code } : {}) };
  }
  if (message.type === 'action-rejected') {
    return {
      type: 'action-rejected',
      ...(typeof message.actionId === 'string' ? { actionId: message.actionId } : {}),
      ...(typeof message.code === 'string' ? { code: message.code } : {}),
    };
  }
  if (message.type === 'reaction' && typeof message.eventId === 'string' && isPlayerSeat(message.seat) && isMatchReactionId(message.reactionId)) {
    return { type: 'reaction', eventId: message.eventId, seat: message.seat, reactionId: message.reactionId };
  }
  if (message.type === 'reaction-rejected') {
    return { type: 'reaction-rejected', ...(typeof message.code === 'string' ? { code: message.code } : {}) };
  }
  if (message.type === 'quick-message' && typeof message.eventId === 'string' && isPlayerSeat(message.seat)) {
    const text = normalizeQuickMessage(message.message);
    if (text) return { type: 'quick-message', eventId: message.eventId, seat: message.seat, message: text };
  }
  if (message.type === 'quick-message-rejected') {
    return { type: 'quick-message-rejected', ...(typeof message.code === 'string' ? { code: message.code } : {}) };
  }
  if (message.type === 'error') {
    return { type: 'error', ...(typeof message.code === 'string' ? { code: message.code } : {}) };
  }
  return null;
}

/** Owns the online match WebSocket, reconnection backoff, and resume handshake. */
export class MatchTransport {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private connectTimer: number | null = null;
  private resumeTimer: number | null = null;
  private resumeSyncId: string | null = null;
  private reconnectAttempt = 0;
  private reconnectStopped = false;
  private connected = false;
  private resuming = false;
  private disconnectedAt: number | null = null;
  private disposed = false;

  constructor(private readonly options: TransportOptions) {}

  private publishState(): void {
    this.options.onStateChange({
      connected: this.connected,
      resuming: this.resuming,
      reconnectStopped: this.reconnectStopped,
      reconnectAttempt: this.reconnectAttempt,
      disconnectedAt: this.disconnectedAt,
    });
  }

  connect(): void {
    if (this.disposed || this.reconnectStopped) return;
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) return;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    const reconnectBudget = this.disconnectedAt === null
      ? 8_000 : Math.max(1, Math.min(8_000, this.options.getReconnectRemainingMs()));
    this.connectTimer = window.setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) socket.close();
    }, reconnectBudget);

    socket.addEventListener('open', () => {
      if (this.disposed || this.socket !== socket) {
        socket.close(1000, 'Connection replaced');
        return;
      }
      this.clearConnectTimer();
      socket.send(JSON.stringify({
        type: 'authenticate',
        seatToken: this.options.seatToken,
        supportsTurnReceipt: true,
      }));
    });

    socket.addEventListener('message', (event) => {
      if (this.disposed || this.socket !== socket) return;
      let decoded: unknown;
      try { decoded = JSON.parse(String(event.data)); } catch { return; }
      const message = parseSocketMessage(decoded);
      if (!message) return;

      if (message.type === 'match') {
        if (message.syncId && message.syncId !== this.resumeSyncId) return;
        this.clearResumeCheck();
        this.reconnectAttempt = 0;
        this.reconnectStopped = false;
        this.disconnectedAt = null;
        this.connected = true;
        this.publishState();
      } else if (message.type === 'sync-rejected' && message.syncId === this.resumeSyncId) {
        this.replace();
        return;
      }
      this.options.onMessage(message);
    });

    socket.addEventListener('close', () => {
      if (this.disposed || this.socket !== socket) return;
      this.clearConnectTimer();
      if (this.options.getMatchStatus() === 'cancelled' || this.options.getMatchStatus() === 'expired') return;
      this.clearResumeCheck();
      this.connected = false;
      this.disconnectedAt ??= Date.now();
      this.publishState();
      const terminalStatus = this.options.getMatchStatus();
      if (this.reconnectAttempt >= 6) {
        this.reconnectStopped = true;
        this.publishState();
        return;
      }
      const remaining = this.options.getReconnectRemainingMs();
      const delay = Math.min(5_000, 500 * (2 ** this.reconnectAttempt));
      if (['active', 'between-games'].includes(terminalStatus ?? '') && delay >= remaining) {
        this.reconnectStopped = true;
        this.publishState();
        return;
      }
      this.reconnectAttempt += 1;
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.disposed && !this.connected) this.connect();
      }, delay);
      this.publishState();
    });
  }

  send(message: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  retry(): void {
    if (this.disposed) return;
    this.reconnectAttempt = 0;
    this.reconnectStopped = false;
    this.disconnectedAt = null;
    this.resuming = false;
    this.publishState();
    this.connect();
  }

  resume(): void {
    if (this.disposed || ['cancelled', 'expired'].includes(this.options.getMatchStatus() ?? '')) return;
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this.replace();
      return;
    }
    const syncId = crypto.randomUUID();
    this.resumeSyncId = syncId;
    this.resuming = true;
    this.connected = false;
    if (!this.send({ type: 'sync', syncId })) {
      this.replace();
      return;
    }
    this.publishState();
    this.resumeTimer = window.setTimeout(() => {
      if (!this.disposed && this.resumeSyncId === syncId) this.replace();
    }, 4_000);
  }

  replace(): void {
    if (this.disposed || ['cancelled', 'expired'].includes(this.options.getMatchStatus() ?? '')) return;
    const previousSocket = this.socket;
    this.clearResumeCheck();
    this.connected = false;
    this.resuming = true;
    this.reconnectStopped = false;
    this.disconnectedAt ??= Date.now();
    this.socket = null;
    if (previousSocket && previousSocket.readyState < WebSocket.CLOSING) {
      previousSocket.close(4000, 'Refreshing the match connection');
    }
    this.publishState();
    this.connect();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearConnectTimer();
    this.clearResumeCheck();
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Player left the game');
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) window.clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private clearResumeCheck(): void {
    if (this.resumeTimer !== null) window.clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
    this.resumeSyncId = null;
    this.resuming = false;
  }
}
