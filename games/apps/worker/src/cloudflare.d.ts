interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
  sql: SqlStorage;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}
interface SqlStorage {
  exec<T extends Record<string, unknown>>(
    query: string,
    ...bindings: (string | number | null)[]
  ): { toArray(): T[]; rowsWritten: number };
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  waitUntil(promise: Promise<unknown>): void;
  acceptWebSocket(socket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}
interface DurableObjectNamespace<T> {
  idFromName(name: string): unknown;
  get(id: unknown): T;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}
interface WorkerEnv {
  APP_ENV?: "production" | "preview" | "development";
  MATCHES: DurableObjectNamespace<DurableObjectStub>;
  LOBBY_HUB: DurableObjectNamespace<DurableObjectStub>;
  ROOMS_RATE_LIMITER: RateLimitBinding;
  ALLOWED_ORIGINS: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  /** Legacy JWT key; prefer SUPABASE_SECRET_KEY. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
declare const WebSocketPair: { new (): WebSocketPair };

interface WebSocket {
  serializeAttachment?(attachment: unknown): void;
  deserializeAttachment?(): unknown;
}
interface ResponseInit {
  webSocket?: WebSocket;
}
