import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { accountSession, getSupabaseClient } from "../account/account-session";
import { GAME_CATALOG } from "../../games/registry";
import { showDialogWithoutActionFocus } from "../../shared/show-dialog";
import { Button } from "../../components/Button";

type Period = "all_time" | "week" | "month" | "year";
type Entry = Readonly<{
  rank: number;
  player_name: string;
  wins: number;
  losses: number;
  matches: number;
  win_rate: number;
}>;
type Board = Readonly<{
  cutoff_date: string | null;
  entries: readonly Entry[];
  my_entry: Entry | null;
}>;
type State = Readonly<{ board: Board | null; loading: boolean; error: string }>;
const cache = new Map<string, { board: Board; savedAt: number }>();
const inFlight = new Map<string, Promise<Board>>();
const CACHE_MS = 5 * 60_000;
const PERIODS: ReadonlyArray<{ id: Period; label: string }> = [
  { id: "all_time", label: "All time" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

function parseEntry(value: unknown): Entry | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(item.rank) ||
    (item.rank as number) < 1 ||
    typeof item.player_name !== "string" ||
    !Number.isSafeInteger(item.wins) ||
    !Number.isSafeInteger(item.losses) ||
    !Number.isSafeInteger(item.matches) ||
    typeof item.win_rate !== "number"
  )
    return null;
  return {
    rank: item.rank as number,
    player_name: item.player_name,
    wins: item.wins as number,
    losses: item.losses as number,
    matches: item.matches as number,
    win_rate: item.win_rate,
  };
}

function parseBoard(value: unknown): Board | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.entries)) return null;
  const entries = record.entries.flatMap((entry): Entry[] => {
    const parsed = parseEntry(entry);
    return parsed ? [parsed] : [];
  });
  return {
    cutoff_date: typeof record.cutoff_date === "string" ? record.cutoff_date : null,
    entries,
    my_entry: parseEntry(record.my_entry),
  };
}

function createPreviewBoard(): Board {
  const entries = Array.from({ length: 100 }, (_, index): Entry => {
    const rank = index + 1;
    return {
      rank,
      player_name: rank === 12 ? "PreviewPlayer" : `Player${String(rank).padStart(3, "0")}`,
      wins: 120 - rank,
      losses: Math.floor(rank / 3),
      matches: 120 - rank + Math.floor(rank / 3),
      win_rate: (120 - rank) / (120 - rank + Math.floor(rank / 3)),
    };
  });
  return {
    cutoff_date: new Date().toISOString().slice(0, 10),
    entries,
    my_entry: entries[11] ?? null,
  };
}

async function loadBoard(gameId: string, period: Period, userId: string | null): Promise<Board> {
  const key = `${gameId}:${period}:${userId ?? "guest"}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.savedAt < CACHE_MS) return cached.board;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const client = getSupabaseClient();
  if (!client) throw new Error("leaderboard-unavailable");
  const request = (async () => {
    const { data, error } = await client.rpc("get_leaderboard", {
      requested_game_id: gameId,
      requested_period: period,
    });
    if (error) throw error;
    const board = parseBoard(data);
    if (!board) throw new Error("invalid-leaderboard-response");
    cache.set(key, { board, savedAt: Date.now() });
    return board;
  })();
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }
}

export function LeaderboardPanel({ onBrowseGames }: { onBrowseGames: () => void }) {
  const account = useSyncExternalStore(
    accountSession.subscribe,
    accountSession.getSnapshot,
    accountSession.getSnapshot,
  );
  const userId =
    account.status === "signed-in" ? (accountSession.getIdentity()?.userId ?? null) : null;
  const publicStanding = account.status === "signed-in" && account.leaderboardPublic;
  const [gameId, setGameId] = useState<string>(GAME_CATALOG[0]?.id ?? "connect-four");
  const [period, setPeriod] = useState<Period>("all_time");
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const [gamePickerHost, setGamePickerHost] = useState<HTMLElement | null>(null);
  const gamePickerRef = useRef<HTMLDialogElement>(null);
  const leaderboardListRef = useRef<HTMLOListElement>(null);
  const currentEntryRef = useRef<HTMLLIElement>(null);
  const [currentEntryVisible, setCurrentEntryVisible] = useState(false);
  const key = `${gameId}:${period}:${userId ?? "guest"}:${publicStanding ? "public" : "private"}`;
  const previewMode =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("leaderboardPreview") === "long";
  const [state, setState] = useState<State>({ board: null, loading: true, error: "" });

  useEffect(() => {
    setGamePickerHost(document.getElementById("leaderboard-game-picker-slot"));
  }, []);

  useEffect(() => {
    const dialog = gamePickerRef.current;
    if (!dialog) return;
    if (gamePickerOpen && !dialog.open) showDialogWithoutActionFocus(dialog);
    else if (!gamePickerOpen && dialog.open) dialog.close();
  }, [gamePickerOpen]);

  useEffect(() => {
    if (previewMode) {
      setState({ board: createPreviewBoard(), loading: false, error: "" });
      return;
    }
    let current = true;
    const cached = cache.get(key);
    const fresh = cached && Date.now() - cached.savedAt < CACHE_MS;
    setState({ board: cached?.board ?? null, loading: !cached, error: "" });
    if (!fresh)
      void loadBoard(gameId, period, userId)
        .then((board) => {
          if (current) setState({ board, loading: false, error: "" });
        })
        .catch(() => {
          if (current)
            setState({
              board: cache.get(key)?.board ?? null,
              loading: false,
              error: "Could not update leaderboard.",
            });
        });
    return () => {
      current = false;
    };
  }, [key, gameId, period, userId, previewMode]);

  const myEntry = state.board?.my_entry ?? null;
  const currentEntryKey = myEntry ? `${myEntry.rank}:${myEntry.player_name}` : "";
  useEffect(() => {
    setCurrentEntryVisible(false);
    const list = leaderboardListRef.current;
    const row = currentEntryRef.current;
    if (!currentEntryKey || !list || !row || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setCurrentEntryVisible(entry.isIntersecting && entry.intersectionRatio >= 0.85);
      },
      { root: list, threshold: [0, 0.85, 1] },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [key, currentEntryKey]);

  const chooseGame = (nextGameId: string) => {
    setGameId(nextGameId);
    setGamePickerOpen(false);
  };
  const selectedGame = GAME_CATALOG.find((game) => game.id === gameId);
  return (
    <section className="leaderboard-panel" aria-label="Leaderboard rankings">
      <div className="leaderboard-toolbar">
        <div
          className="leaderboard-period-tabs"
          role="tablist"
          aria-label="Choose leaderboard period"
        >
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={period === item.id}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {gamePickerHost &&
        createPortal(
          <button
            className="leaderboard-game-trigger"
            type="button"
            aria-haspopup="dialog"
            aria-controls="leaderboard-game-dialog"
            onClick={() => setGamePickerOpen(true)}
          >
            <span>{selectedGame?.title ?? "Game"}</span>
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </button>,
          gamePickerHost,
        )}
      {state.loading && (
        <p className="leaderboard-message" role="status">
          Loading rankings…
        </p>
      )}
      {state.error && (
        <p className="leaderboard-message" role="status">
          {state.error}
        </p>
      )}
      {!state.loading && !state.error && state.board?.entries.length === 0 && !myEntry && (
        <div className="leaderboard-empty-state">
          <span className="leaderboard-empty-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 19h16M6 18v-5h4v5m0-5V7h4v11m0-4h4v4" />
            </svg>
          </span>
          <h2>No rankings yet</h2>
          <p>Complete a ranked series while signed in. Rankings refresh daily at 12:15 a.m. WAT.</p>
          <Button variant="primary" size="compact" onClick={onBrowseGames}>
            Browse games
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M3.5 10h12m-5-5 5 5-5 5" />
            </svg>
          </Button>
        </div>
      )}
      {state.board?.entries.length ? (
        <ol
          className="leaderboard-list"
          ref={leaderboardListRef}
          aria-label={`${selectedGame?.title ?? "Game"} ${period.replace("_", " ")} rankings`}
        >
          {state.board.entries.map((entry) => {
            const isCurrentPlayer =
              !!myEntry && entry.rank === myEntry.rank && entry.player_name === myEntry.player_name;
            const podiumClass = entry.rank <= 3 ? ` leaderboard-rank--${entry.rank}` : "";
            return (
              <li
                key={entry.player_name}
                ref={isCurrentPlayer ? currentEntryRef : undefined}
                className={isCurrentPlayer ? "is-current-player" : undefined}
                aria-current={isCurrentPlayer ? "true" : undefined}
              >
                <span className={`leaderboard-rank${podiumClass}`}>{entry.rank}</span>
                <span className="leaderboard-player">
                  {entry.player_name}
                  {isCurrentPlayer && <small> · You</small>}
                </span>
                <span className="leaderboard-record">
                  <strong>{entry.wins}</strong>
                  <small>wins</small>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {myEntry && (
        <div
          className={`leaderboard-current-standing${currentEntryVisible ? " is-obscured-by-list-row" : ""}`}
          aria-label={`Your rank: ${myEntry.rank}`}
          aria-hidden={currentEntryVisible}
        >
          <span
            className={`leaderboard-rank${myEntry.rank <= 3 ? ` leaderboard-rank--${myEntry.rank}` : ""}`}
          >
            {myEntry.rank}
          </span>
          <span className="leaderboard-current-player">
            <strong>You</strong>
            <small>{myEntry.player_name}</small>
          </span>
          <span className="leaderboard-record">
            <strong>{myEntry.wins}</strong>
            <small>wins</small>
          </span>
        </div>
      )}
      {state.board?.cutoff_date && (
        <p className="leaderboard-cutoff">
          Results through{" "}
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeZone: "Africa/Lagos",
          }).format(new Date(`${state.board.cutoff_date}T12:00:00+01:00`))}
        </p>
      )}

      <dialog
        className="game-dialog leaderboard-game-dialog"
        id="leaderboard-game-dialog"
        ref={gamePickerRef}
        aria-labelledby="leaderboard-game-title"
        onCancel={(event) => {
          event.preventDefault();
          setGamePickerOpen(false);
        }}
        onClose={() => setGamePickerOpen(false)}
      >
        <div className="dialog-content">
          <div className="online-dialog-header">
            <h2 id="leaderboard-game-title">Choose a game</h2>
            <button
              className="dialog-close"
              type="button"
              aria-label="Close game selection"
              onClick={() => setGamePickerOpen(false)}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
          <fieldset className="lobby-filter-options leaderboard-game-options">
            <legend className="sr-only">Game</legend>
            {GAME_CATALOG.map((game) => (
              <label className="lobby-filter-option" key={game.id}>
                <input
                  type="radio"
                  name="leaderboard-game"
                  value={game.id}
                  checked={gameId === game.id}
                  onChange={() => chooseGame(game.id)}
                />
                <span>{game.title}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </dialog>
    </section>
  );
}
