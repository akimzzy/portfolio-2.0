import { useCallback, useEffect, useRef, useState } from "react";
import { GameHistoryDetails } from "./GameHistoryDetails";
import { historyFinishReasonLabel, historyGameTitle } from "./history-presentation";
import {
  accountSession,
  type AccountSnapshot,
  type FriendRecord,
  type GameHistoryEntry,
} from "./account-session";

type HistoryState = Readonly<{
  status: "idle" | "loading" | "ready" | "error";
  matches: GameHistoryEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  error: string;
  errorLoadMore: boolean;
}>;

const EMPTY_HISTORY: HistoryState = {
  status: "idle",
  matches: [],
  hasMore: false,
  loadingMore: false,
  error: "",
  errorLoadMore: false,
};
const matchDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function FriendMatchup({
  account,
  friend,
  disabled,
  onRemove,
}: {
  account: AccountSnapshot;
  friend: FriendRecord;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const lastFriendsRefreshRef = useRef(account.friendsFetchedAt);
  const panelId = `friend-history-${friend.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  const loadHistory = useCallback(
    async (loadMore = false) => {
      if (loadingRef.current) return;
      const cursor = loadMore ? history.matches.at(-1) : undefined;
      if (loadMore && (!cursor || !history.hasMore)) return;

      loadingRef.current = true;
      setHistory((current) => ({
        ...current,
        status: current.matches.length ? "ready" : "loading",
        loadingMore: loadMore,
        error: "",
        errorLoadMore: false,
      }));
      try {
        const page = await accountSession.loadFriendMatchHistory(
          friend.id,
          cursor
            ? { completedAt: cursor.completed_at, completionId: cursor.completion_id }
            : undefined,
        );
        setHistory((current) => {
          const known = new Set(
            loadMore ? current.matches.map((match) => match.completion_id) : [],
          );
          const appended = page.matches.filter((match) => !known.has(match.completion_id));
          return {
            status: "ready",
            matches: loadMore ? [...current.matches, ...appended] : page.matches,
            hasMore: page.hasMore,
            loadingMore: false,
            error: "",
            errorLoadMore: false,
          };
        });
      } catch (error) {
        setHistory((current) => ({
          ...current,
          status: current.matches.length ? "ready" : "error",
          loadingMore: false,
          error:
            error instanceof Error ? error.message : "Match history could not load. Try again.",
          errorLoadMore: loadMore,
        }));
      } finally {
        loadingRef.current = false;
      }
    },
    [friend.id, history.hasMore, history.matches],
  );

  useEffect(() => {
    const refreshedAt = account.friendsFetchedAt;
    if (refreshedAt === null || refreshedAt === lastFriendsRefreshRef.current) return;
    lastFriendsRefreshRef.current = refreshedAt;
    if (expanded && history.status === "ready") void loadHistory();
  }, [account.friendsFetchedAt, expanded, history.status, loadHistory]);

  useEffect(() => {
    if (!expanded && !selectedMatchId) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(
      () => {
        const target = selectedMatchId
          ? itemRef.current?.querySelector<HTMLElement>(".account-history-details")
          : itemRef.current;
        target?.scrollIntoView({
          block: "nearest",
          behavior: reducedMotion ? "auto" : "smooth",
        });
      },
      reducedMotion ? 0 : 220,
    );
    return () => window.clearTimeout(timeout);
  }, [expanded, selectedMatchId]);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && history.status === "idle") void loadHistory();
  };

  const toggleRounds = async (entry: GameHistoryEntry) => {
    if (selectedMatchId === entry.completion_id) {
      setSelectedMatchId(null);
      return;
    }
    if (!entry.replay_available) return;
    await accountSession.loadHistoryRounds(entry);
    const details = accountSession.getSnapshot().historyDetails[entry.completion_id];
    if (details?.status === "ready" && details.rounds.length === 0) return;
    setSelectedMatchId(entry.completion_id);
  };

  const matchupSummary =
    friend.seriesPlayed === 0
      ? "No games together yet"
      : `${friend.wins} series won, ${friend.losses} lost, ${friend.seriesPlayed} played`;

  return (
    <li className={`account-friend-item${expanded ? " is-expanded" : ""}`} ref={itemRef}>
      <div className="account-friend-row">
        <button
          className="account-friend-overview"
          type="button"
          aria-label={`${expanded ? "Hide" : "View"} match history with @${friend.username}. ${matchupSummary}.`}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={toggleExpanded}
        >
          <span className="account-friend-overview-copy">
            <strong>@{friend.username}</strong>
            <span className="account-friend-record" aria-hidden="true">
              {friend.seriesPlayed === 0 ? (
                <span>No games together yet</span>
              ) : (
                <>
                  <span>
                    <b className="is-win">{friend.wins}</b>W
                  </span>
                  <span>
                    <b className="is-loss">{friend.losses}</b>L
                  </span>
                  <span>{friend.seriesPlayed} series</span>
                </>
              )}
            </span>
          </span>
          <span className="account-friend-history-cue">
            {expanded ? "Hide" : "History"}
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d={expanded ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"} />
            </svg>
          </span>
        </button>
        <button
          className="account-friend-action is-destructive"
          type="button"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
      <div
        className={`account-friend-history-disclosure${expanded ? " is-open" : ""}`}
        id={panelId}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div
          className="account-friend-history-content"
          aria-busy={history.status === "loading" || history.loadingMore || undefined}
        >
          {history.status === "loading" && (
            <div
              className="account-friend-history-skeleton"
              role="status"
              aria-label="Loading match history"
            >
              <span />
              <span />
            </div>
          )}
          {history.status === "error" && (
            <div className="account-friend-history-error" role="alert">
              <p className="account-friends-message is-error">{history.error}</p>
              <button
                className="account-friends-retry"
                type="button"
                onClick={() => void loadHistory(history.errorLoadMore)}
              >
                Try again
              </button>
            </div>
          )}
          {history.status === "ready" && history.matches.length === 0 && (
            <p className="account-friends-message">No games together yet.</p>
          )}
          {history.matches.length > 0 && (
            <ol
              className="account-friend-history-list"
              aria-label={`Match history with @${friend.username}`}
            >
              {history.matches.map((entry) => {
                const isSelected = selectedMatchId === entry.completion_id;
                const details = account.historyDetails[entry.completion_id];
                const hasReplay =
                  entry.replay_available === true &&
                  !(details?.status === "ready" && details.rounds.length === 0);
                const finishReason = historyFinishReasonLabel(entry.finish_reason);
                return (
                  <li className="account-friend-history-item" key={entry.completion_id}>
                    <div className="account-friend-history-heading">
                      <span
                        className={`account-history-outcome ${entry.result === "win" ? "is-win" : "is-loss"}`}
                      >
                        {entry.result === "win" ? "Won" : "Lost"}
                      </span>
                      <strong>{historyGameTitle(entry.game_id)}</strong>
                      <time dateTime={entry.completed_at}>
                        {matchDate.format(new Date(entry.completed_at))}
                      </time>
                    </div>
                    <div className="account-friend-history-detail">
                      <span>
                        Series {entry.wins}–{entry.losses}
                      </span>
                      {finishReason && <span>{finishReason}</span>}
                      {hasReplay && (
                        <button
                          className="account-friend-history-toggle"
                          type="button"
                          aria-expanded={isSelected}
                          disabled={details?.status === "loading"}
                          onClick={() => void toggleRounds(entry)}
                        >
                          {details?.status === "loading"
                            ? "Loading…"
                            : isSelected
                              ? "Hide boards"
                              : "View boards"}
                        </button>
                      )}
                    </div>
                    {isSelected && (
                      <GameHistoryDetails
                        details={details}
                        onRetry={() => void accountSession.loadHistoryRounds(entry)}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {history.status === "ready" && history.error && history.matches.length > 0 && (
            <div className="account-friend-history-error" role="alert">
              <p className="account-friends-message is-error">{history.error}</p>
              <button
                className="account-friends-retry"
                type="button"
                onClick={() => void loadHistory(history.errorLoadMore)}
              >
                Try again
              </button>
            </div>
          )}
          {history.hasMore && !history.error && (
            <button
              className="account-history-more"
              type="button"
              disabled={history.loadingMore}
              onClick={() => void loadHistory(true)}
            >
              {history.loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
