import { GAME_CATALOG } from '../../games/registry';

export type LobbyGame = (typeof GAME_CATALOG)[number];
export type LobbyMatch = {
  matchId: string;
  gameId: string;
  displayName: string;
  seriesTarget: 1 | 2 | 3;
  createdAt: number;
  expiresAt: number;
};
export type LobbyState = {
  matches: LobbyMatch[];
  hasLoadedSnapshot: boolean;
  totalMatches: number | null;
  cursor: string | null;
  hasMore: boolean;
  onlineCount: number | null;
  connection: 'connecting' | 'connected' | 'reconnecting';
  error: string;
  canReconnect: boolean;
  loadingMore: boolean;
  filter: string;
};

const INITIAL_STATE: LobbyState = {
  matches: [], hasLoadedSnapshot: false, totalMatches: null, cursor: null, hasMore: false, onlineCount: null,
  connection: 'connecting', error: '', canReconnect: false, loadingMore: false,
  filter: getInitialFilter(),
};

function getInitialFilter(): string {
  const value = new URLSearchParams(window.location.search).get('lobbyGame');
  return GAME_CATALOG.some((game) => game.id === value) ? value! : 'all';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLobbyMatch(value: unknown): value is LobbyMatch {
  if (!isRecord(value)) return false;
  return typeof value.matchId === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value.matchId) &&
    typeof value.gameId === 'string' && GAME_CATALOG.some((game) => game.id === value.gameId) &&
    typeof value.displayName === 'string' && value.displayName.trim().length > 0 && Array.from(value.displayName).length <= 24 &&
    (value.seriesTarget === 1 || value.seriesTarget === 2 || value.seriesTarget === 3) &&
    Number.isFinite(value.createdAt) && Number.isFinite(value.expiresAt);
}

export function readVisitorId(): string {
  const key = 'games-presence-id';
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[A-Za-z0-9_-]{22}$/.test(existing)) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const value = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    localStorage.setItem(key, value);
    return value;
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`.slice(0, 22);
  }
}

function socketUrl(filter: string): URL {
  const configuredApi = document.querySelector<HTMLMetaElement>('meta[name="games-api"]')?.content.replace(/\/$/, '') ?? '/api';
  const api = configuredApi.startsWith('/') ? `${window.location.origin}${configuredApi}` : configuredApi;
  const url = new URL(`${api.replace(/^http/, 'ws')}/v1/lobby/socket`);
  if (filter !== 'all') url.searchParams.set('gameId', filter);
  return url;
}

class LobbyClient {
  private snapshot = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private stableConnectionTimer: number | null = null;
  private reconnectAttempt = 0;
  private lobbyVisible = false;
  private pageVisible = document.visibilityState === 'visible';
  private awaitingSnapshot = false;

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
    const nextFilter = GAME_CATALOG.some((game) => game.id === filter) ? filter : 'all';
    if (this.snapshot.filter === nextFilter) return;
    this.awaitingSnapshot = true;
    this.update({ ...this.snapshot, filter: nextFilter, matches: [], hasLoadedSnapshot: false, totalMatches: null, cursor: null, hasMore: false, loadingMore: false });
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'subscribe', gameId: nextFilter === 'all' ? null : nextFilter }));
    }
  }

  retry() {
    this.reconnectAttempt = 0;
    this.closeSocket();
    this.connect();
  }

  loadMore() {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.snapshot.cursor || this.snapshot.loadingMore) return;
    this.update({ ...this.snapshot, loadingMore: true });
    this.socket.send(JSON.stringify({ type: 'load-more', cursor: this.snapshot.cursor }));
  }

  private update(snapshot: LobbyState) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private syncConnection() {
    if (!this.lobbyVisible || !this.pageVisible) {
      this.closeSocket();
      return;
    }
    if (!this.socket && this.reconnectTimer === null) this.connect();
  }

  private connect() {
    if (!this.lobbyVisible || !this.pageVisible || this.socket) return;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.update({ ...this.snapshot, connection: this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting', canReconnect: false });
    this.awaitingSnapshot = true;
    const socket = new WebSocket(socketUrl(this.snapshot.filter));
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify({ type: 'identify', visitorId: readVisitorId(), gameId: this.snapshot.filter === 'all' ? null : this.snapshot.filter }));
      if (this.stableConnectionTimer !== null) window.clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = window.setTimeout(() => { this.reconnectAttempt = 0; }, 15_000);
      this.update({ ...this.snapshot, connection: 'connected', error: '', canReconnect: false });
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      if (this.socket !== socket) return;
      let message: unknown;
      try { message = JSON.parse(event.data) as unknown; } catch { return; }
      if (!isRecord(message) || typeof message.type !== 'string') return;

      if (message.type === 'lobby-page' && this.awaitingSnapshot) return;
      if (message.type === 'lobby-snapshot' || message.type === 'lobby-page') {
        if (message.type === 'lobby-snapshot') this.awaitingSnapshot = false;
        const incoming = Array.isArray(message.matches) ? message.matches.filter(isLobbyMatch) : [];
        const matches = message.type === 'lobby-snapshot'
          ? incoming
          : [...this.snapshot.matches, ...incoming.filter((item) => !this.snapshot.matches.some((known) => known.matchId === item.matchId))];
        this.update({
          ...this.snapshot,
          matches,
          hasLoadedSnapshot: this.snapshot.hasLoadedSnapshot || message.type === 'lobby-snapshot',
          totalMatches: Number.isSafeInteger(message.totalMatches) && Number(message.totalMatches) >= 0 ? Number(message.totalMatches) : this.snapshot.totalMatches,
          cursor: typeof message.nextCursor === 'string' ? message.nextCursor : null,
          hasMore: message.hasMore === true,
          onlineCount: Number.isSafeInteger(message.onlineCount) && Number(message.onlineCount) >= 0 ? Number(message.onlineCount) : this.snapshot.onlineCount,
          loadingMore: false,
          error: '',
        });
      } else if (message.type === 'lobby-room-upsert' && isLobbyMatch(message.match)) {
        const match = message.match;
        const filtered = this.snapshot.matches.filter((item) => item.matchId !== match.matchId);
        const matches = this.snapshot.filter === 'all' || match.gameId === this.snapshot.filter ? [match, ...filtered] : filtered;
        matches.sort((left, right) => right.createdAt - left.createdAt || left.matchId.localeCompare(right.matchId));
        this.update({ ...this.snapshot, matches, totalMatches: Number.isSafeInteger(message.totalMatches) && Number(message.totalMatches) >= 0 ? Number(message.totalMatches) : this.snapshot.totalMatches });
      } else if (message.type === 'lobby-room-remove' && typeof message.matchId === 'string') {
        this.update({ ...this.snapshot, matches: this.snapshot.matches.filter((item) => item.matchId !== message.matchId), totalMatches: Number.isSafeInteger(message.totalMatches) && Number(message.totalMatches) >= 0 ? Number(message.totalMatches) : this.snapshot.totalMatches });
      } else if (message.type === 'lobby-rooms-remove' && Array.isArray(message.matchIds)) {
        const removed = new Set(message.matchIds.filter((item): item is string => typeof item === 'string'));
        this.update({ ...this.snapshot, matches: this.snapshot.matches.filter((item) => !removed.has(item.matchId)), totalMatches: Number.isSafeInteger(message.totalMatches) && Number(message.totalMatches) >= 0 ? Number(message.totalMatches) : this.snapshot.totalMatches });
      } else if (message.type === 'lobby-presence' && Number.isSafeInteger(message.onlineCount) && Number(message.onlineCount) >= 0) {
        this.update({ ...this.snapshot, onlineCount: Number(message.onlineCount) });
      } else if (message.type === 'lobby-error') {
        this.update({ ...this.snapshot, error: typeof message.message === 'string' ? message.message : 'Live matches are unavailable.' });
      }
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stableConnectionTimer !== null) window.clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = null;
      if (!this.lobbyVisible || !this.pageVisible) return;
      this.reconnectAttempt += 1;
      this.update({ ...this.snapshot, connection: 'reconnecting', canReconnect: this.reconnectAttempt >= 2, loadingMore: false });
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, Math.min(1_000 * (2 ** (this.reconnectAttempt - 1)), 30_000));
    });

    socket.addEventListener('error', () => {
      if (this.socket === socket) this.update({ ...this.snapshot, error: 'Live matches are unavailable. Reconnecting…' });
    });
  }

  private closeSocket() {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.stableConnectionTimer !== null) window.clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = null;
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.close(1000, 'Lobby not visible');
  }
}

export const lobbyClient = new LobbyClient();
