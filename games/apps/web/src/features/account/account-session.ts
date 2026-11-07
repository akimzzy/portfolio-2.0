import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

export type AccountIdentity = Readonly<{ userId: string; username: string; accessToken: string }>;
export type GameHistoryEntry = Readonly<{
  game_id: string;
  result: 'win' | 'loss';
  opponent_name: string;
  wins: number;
  losses: number;
  series_target: number;
  finish_reason: 'normal' | 'timeout' | 'disconnect' | 'forfeit';
  completed_at: string;
}>;
export type AccountSnapshot = Readonly<{
  status: 'unconfigured' | 'loading' | 'signed-out' | 'profile-required' | 'signed-in' | 'error';
  username: string | null;
  joinedAt: string | null;
  busy: boolean;
  error: string;
  history: GameHistoryEntry[];
  historyCount: number;
  historyStatus: 'idle' | 'loading' | 'ready' | 'error';
  historyRefreshing: boolean;
  historyError: string;
  historyFetchedAt: number | null;
  historyAttemptedAt: number | null;
}>;

const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const HISTORY_CACHE_TTL_MS = 60_000;
const HISTORY_PRELOAD_LIMIT = 20;
const initialSnapshot: AccountSnapshot = {
  status: 'loading', username: null, joinedAt: null, busy: false, error: '',
  history: [], historyCount: 0, historyStatus: 'idle', historyRefreshing: false, historyError: '', historyFetchedAt: null, historyAttemptedAt: null,
};

function configuredClient(): SupabaseClient | null {
  const url = import.meta.env?.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null;
  } catch { return null; }
  return createClient(url, key, {
    auth: {
      flowType: 'pkce',
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
  private historyUserId: string | null = null;
  private historyInvalidationVersion = 0;
  private historyLoadedVersion = 0;
  private historyAttemptedVersion = 0;

  constructor(client: SupabaseClient | null) {
    this.client = client;
    this.snapshot = client ? initialSnapshot : { ...initialSnapshot, status: 'unconfigured' };
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.snapshot;

  start(): void {
    if (!this.client || this.authSubscription) return;
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      const previousUserId = this.session?.user.id;
      this.session = session;
      if (session && previousUserId === session.user.id &&
        ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(_event) &&
        (this.snapshot.status === 'signed-in' || this.snapshot.status === 'profile-required')) return;
      if (!session || (previousUserId && previousUserId !== session.user.id)) this.clearHistory();
      this.profileRequest += 1;
      if (!session) {
        this.update({ status: 'signed-out', username: null, joinedAt: null, error: '', busy: false });
        return;
      }
      this.update({ status: 'loading', username: null, error: '' });
      const request = this.profileRequest;
      queueMicrotask(() => { void this.loadProfile(session, request); });
    });
    this.authSubscription = data.subscription;
  }

  stop(): void {
    this.profileRequest += 1;
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
  }

  getIdentity(): AccountIdentity | null {
    if (this.snapshot.status !== 'signed-in' || !this.session || !this.snapshot.username) return null;
    return { userId: this.session.user.id, username: this.snapshot.username, accessToken: this.session.access_token };
  }

  /** Wait for persisted auth to resolve before match creation/join, avoiding silent guest fallback. */
  async getIdentityForRequest(timeoutMs = 5_000): Promise<AccountIdentity | null> {
    if (this.snapshot.status === 'loading') {
      await new Promise<void>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout>;
        const unsubscribe = this.subscribe(() => {
          if (this.snapshot.status === 'loading') return;
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        });
        timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error('Account check is taking too long. Retry once your connection is back.'));
        }, timeoutMs);
      });
    }
    if (this.snapshot.status === 'error') {
      throw new Error('Account check failed. Retry or sign out before starting a guest match.');
    }
    return this.getIdentity();
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.client) {
      this.update({ error: 'Sign-in is not configured yet.' });
      return;
    }
    this.update({ busy: true, error: '' });
    try {
      const { error } = await this.client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) this.update({ busy: false, error: 'Google sign-in could not start. Please try again.' });
      else this.update({ busy: false });
    } catch {
      this.update({ busy: false, error: 'Google sign-in could not start. Please try again.' });
    }
  }

  async claimUsername(username: string): Promise<boolean> {
    const cleaned = username.trim();
    if (!this.client || !this.session) {
      this.update({ error: 'Sign in again to choose a username.' });
      return false;
    }
    if (!USERNAME_PATTERN.test(cleaned)) {
      this.update({ error: 'Use 3–20 letters, numbers, or underscores. Start with a letter.' });
      return false;
    }
    const userId = this.session.user.id;
    this.update({ busy: true, error: '' });
    try {
      const { data, error } = await this.client.rpc('claim_username', { requested_username: cleaned });
      if (this.session?.user.id !== userId) return false;
      if (error) {
        const message = error.message.toLowerCase();
        this.update({
          busy: false,
          error: message.includes('username_taken') || message.includes('profiles_username_lower_unique')
            ? 'That username is already taken. Try another.'
            : message.includes('reserved_username')
              ? 'Choose a different username.'
              : message.includes('username_already_claimed')
                ? 'This account already has a username. Refresh to continue.'
                : 'We could not save that username. Please try again.',
        });
        return false;
      }
      const saved = typeof data === 'string' ? data : cleaned;
      this.update({ status: 'signed-in', username: saved, joinedAt: new Date().toISOString(), busy: false, error: '' });
      void this.loadGameHistory();
      return true;
    } catch {
      if (this.session?.user.id !== userId) return false;
      this.update({
        busy: false,
        error: 'We could not save that username. Check your connection and try again.',
      });
      return false;
    }
  }

  async refreshProfile(): Promise<void> {
    if (!this.session) return;
    const request = ++this.profileRequest;
    this.update({ status: 'loading', error: '' });
    await this.loadProfile(this.session, request);
  }

  async loadGameHistory(force = false): Promise<void> {
    const userId = this.session?.user.id;
    if (!this.client || !userId || this.snapshot.status !== 'signed-in') return;
    if (this.historyInFlight && this.historyUserId === userId) return this.historyInFlight;
    const fetchedAt = this.snapshot.historyFetchedAt;
    const invalidated = this.historyLoadedVersion < this.historyInvalidationVersion;
    if (!force && !invalidated && this.historyUserId === userId && fetchedAt && Date.now() - fetchedAt < HISTORY_CACHE_TTL_MS) return;
    const attemptedAt = this.snapshot.historyAttemptedAt;
    if (!force && this.historyUserId === userId && this.snapshot.historyError && attemptedAt &&
      Date.now() - attemptedAt < HISTORY_CACHE_TTL_MS && this.historyAttemptedVersion === this.historyInvalidationVersion) return;

    this.historyUserId = userId;
    const request = ++this.historyRequest;
    const requestedInvalidationVersion = this.historyInvalidationVersion;
    this.historyAttemptedVersion = requestedInvalidationVersion;
    const hasCachedHistory = this.snapshot.historyFetchedAt !== null;
    this.update({
      historyStatus: hasCachedHistory ? 'ready' : 'loading',
      historyRefreshing: true,
      historyError: '',
      historyAttemptedAt: Date.now(),
    });
    const load = (async () => {
      try {
        const { data, error, count } = await this.client!.from('game_history')
          .select('game_id,result,opponent_name,wins,losses,series_target,finish_reason,completed_at', { count: 'exact' })
          .order('completed_at', { ascending: false })
          .limit(HISTORY_PRELOAD_LIMIT);
        if (request !== this.historyRequest || this.session?.user.id !== userId) return;
        if (error) throw new Error('Game history could not load. Try again.');
        const history = (data ?? []).flatMap((row): GameHistoryEntry[] => {
          if (typeof row.game_id !== 'string' || (row.result !== 'win' && row.result !== 'loss') ||
            typeof row.opponent_name !== 'string' || typeof row.wins !== 'number' || typeof row.losses !== 'number' ||
            typeof row.series_target !== 'number' ||
            !['normal', 'timeout', 'disconnect', 'forfeit'].includes(row.finish_reason) ||
            typeof row.completed_at !== 'string' || !Number.isFinite(Date.parse(row.completed_at))) return [];
          return [{
            game_id: row.game_id,
            result: row.result,
            opponent_name: row.opponent_name,
            wins: row.wins,
            losses: row.losses,
            series_target: row.series_target,
            finish_reason: row.finish_reason as GameHistoryEntry['finish_reason'],
            completed_at: row.completed_at,
          }];
        });
        this.update({
          history,
          historyCount: typeof count === 'number' ? count : history.length,
          historyStatus: 'ready',
          historyError: '',
          historyFetchedAt: Date.now(),
        });
        this.historyLoadedVersion = Math.max(this.historyLoadedVersion, requestedInvalidationVersion);
      } catch (error) {
        if (request !== this.historyRequest || this.session?.user.id !== userId) return;
        this.update({
          historyStatus: hasCachedHistory ? 'ready' : 'error',
          historyError: error instanceof Error ? error.message : 'Game history could not load. Try again.',
        });
      }
    })();
    this.historyInFlight = load;
    try { await load; }
    finally {
      if (this.historyInFlight === load) this.historyInFlight = null;
      if (request === this.historyRequest && this.session?.user.id === userId && this.snapshot.historyRefreshing) {
        this.update({ historyRefreshing: false });
      }
    }
  }

  /** Defer a fresh account-history read until the user opens their account. */
  markGameHistoryStale(): void {
    if (this.session) this.historyInvalidationVersion += 1;
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    this.update({ busy: true, error: '' });
    try {
      const { error } = await this.client.auth.signOut();
      if (error) this.update({ busy: false, error: 'Could not sign out. Try again.' });
    } catch {
      this.update({ busy: false, error: 'Could not sign out. Check your connection and try again.' });
    }
  }

  private async loadProfile(session: Session, request: number): Promise<void> {
    if (!this.client) return;
    try {
      const { data, error } = await this.client.from('profiles').select('username,created_at').maybeSingle();
      if (request !== this.profileRequest || this.session?.user.id !== session.user.id) return;
      if (error) {
        this.update({ status: 'error', username: null, busy: false, error: 'Your account could not be loaded. Check your connection and retry.' });
        return;
      }
      if (!data || typeof data.username !== 'string') {
        this.update({ status: 'profile-required', username: null, busy: false, error: '' });
        return;
      }
      this.update({
        status: 'signed-in', username: data.username,
        joinedAt: typeof data.created_at === 'string' && Number.isFinite(Date.parse(data.created_at)) ? data.created_at : null,
        busy: false, error: '',
      });
      void this.loadGameHistory();
    } catch {
      if (request !== this.profileRequest || this.session?.user.id !== session.user.id) return;
      this.update({ status: 'error', username: null, busy: false, error: 'Your account could not be loaded. Check your connection and retry.' });
    }
  }

  private clearHistory(): void {
    this.historyRequest += 1;
    this.historyInFlight = null;
    this.historyUserId = null;
    this.historyInvalidationVersion = 0;
    this.historyLoadedVersion = 0;
    this.historyAttemptedVersion = 0;
    this.snapshot = {
      ...this.snapshot,
      joinedAt: null,
      history: [], historyCount: 0, historyStatus: 'idle', historyRefreshing: false, historyError: '', historyFetchedAt: null, historyAttemptedAt: null,
    };
  }

  private update(patch: Partial<AccountSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}

export const accountSession = new AccountSession(configuredClient());
