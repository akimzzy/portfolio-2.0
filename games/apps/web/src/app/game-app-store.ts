export type GameScreen = 'lobby' | 'match' | 'opening';
export type ActiveMatchSummary = Readonly<{
  pending: boolean;
  gameId: string;
  notice: string;
  checking: boolean;
  statusLabel: string;
}> | null;
export type OpeningMatchView = Readonly<{
  status: 'loading' | 'error';
  title: string;
  message: string;
  action: 'retry' | 'reload' | null;
}>;
export type CountdownView = Readonly<{ deadline: number; clockOffset: number; context: string; urgent?: boolean }>;

export type GameAppSnapshot = Readonly<{
  screen: GameScreen;
  lobbyTab: 'matches' | 'games';
  lobbyTabFocusRequest: boolean;
  title: string;
  description: string;
  theme: 'system' | 'light' | 'dark';
  soundEnabled: boolean;
  announcement: string;
  activeMatch: ActiveMatchSummary;
  resumingMatch: boolean;
  onlineSetupOpen: boolean;
  openingMatch: OpeningMatchView | null;
  lobbyError: string;
  controls: Readonly<{
    homeVisible: boolean;
    newGameVisible: boolean;
    newGameDisabled: boolean;
    playOnlineVisible: boolean;
    playOnlineDisabled: boolean;
    playOnlineLabel: string;
    playOnlineTitle: string;
    soundVisible: boolean;
  }>;
  connection: Readonly<{
    visible: boolean;
    connected: boolean;
    status: string;
    roomExpiry: CountdownView | null;
    reconnect: CountdownView | null;
    shareVisible: boolean;
    cancelVisible: boolean;
    leaveVisible: boolean;
    leaveDisabled: boolean;
    forfeitVisible: boolean;
    forfeitDisabled: boolean;
    retryVisible: boolean;
  }>;
}>;

const initialSnapshot: GameAppSnapshot = {
  screen: 'lobby',
  lobbyTab: 'matches',
  lobbyTabFocusRequest: false,
  title: 'Games',
  description: '',
  theme: 'system',
  soundEnabled: true,
  announcement: '',
  activeMatch: null,
  resumingMatch: false,
  onlineSetupOpen: false,
  openingMatch: null,
  lobbyError: '',
  controls: {
    homeVisible: false,
    newGameVisible: false,
    newGameDisabled: false,
    playOnlineVisible: false,
    playOnlineDisabled: false,
    playOnlineLabel: 'Play online',
    playOnlineTitle: 'Create or join an online game',
    soundVisible: false,
  },
  connection: {
    visible: false,
    connected: false,
    status: '',
    roomExpiry: null,
    reconnect: null,
    shareVisible: false,
    cancelVisible: false,
    leaveVisible: false,
    leaveDisabled: false,
    forfeitVisible: false,
    forfeitDisabled: false,
    retryVisible: false,
  },
};

export class GameAppStore {
  private snapshot: GameAppSnapshot = initialSnapshot;
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): GameAppSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: Partial<GameAppSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
