import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { accountSession } from "./account-session";
import { showDialogWithoutActionFocus } from "../../shared/show-dialog";
import { Button } from "../../components/Button";
import { GAME_CATALOG } from "../../games/registry";
import { GameHistoryDetails } from "./GameHistoryDetails";
import {
  historyFinishReasonLabel,
  historyGameTitle,
  historyRankingLabel,
} from "./history-presentation";

const accountDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function AccountControl({
  theme,
  onToggleTheme,
}: {
  theme: "system" | "light" | "dark";
  onToggleTheme: () => void;
}) {
  const account = useSyncExternalStore(
    accountSession.subscribe,
    accountSession.getSnapshot,
    accountSession.getSnapshot,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const signOutDialogRef = useRef<HTMLDialogElement>(null);
  const accountBodyRef = useRef<HTMLDivElement>(null);
  const historyItemRefs = useRef(new Map<string, HTMLLIElement>());
  const promptedForUsername = useRef(false);
  const [username, setUsername] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyOpeningId, setHistoryOpeningId] = useState<string | null>(null);
  const [signOutPending, setSignOutPending] = useState(false);

  useEffect(() => {
    if (account.status === "signed-out") promptedForUsername.current = false;
    if (account.status === "profile-required" && !promptedForUsername.current) {
      promptedForUsername.current = true;
      if (dialogRef.current && !dialogRef.current.open)
        showDialogWithoutActionFocus(dialogRef.current);
    }
  }, [account.status]);

  useEffect(() => {
    if (account.status !== "signed-in") {
      setSelectedHistoryId(null);
      setHistoryOpeningId(null);
    }
  }, [account.status]);

  useEffect(() => {
    if (!selectedHistoryId) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollDetailsIntoView = () => {
      const body = accountBodyRef.current;
      const item = historyItemRefs.current.get(selectedHistoryId);
      const details = item?.querySelector<HTMLElement>(".account-history-details");
      if (!body || !item || !details) return;

      const bodyRect = body.getBoundingClientRect();
      const detailsRect = details.getBoundingClientRect();
      const inset = 12;
      const topLimit = bodyRect.top + inset;
      const bottomLimit = bodyRect.bottom - inset;
      const availableHeight = body.clientHeight - inset * 2;
      let targetScrollTop = body.scrollTop;

      if (detailsRect.height > availableHeight) {
        if (detailsRect.top < topLimit || detailsRect.top > bottomLimit) {
          targetScrollTop += detailsRect.top - topLimit;
        }
      } else if (detailsRect.top < topLimit) {
        targetScrollTop += detailsRect.top - topLimit;
      } else if (detailsRect.bottom > bottomLimit) {
        targetScrollTop += detailsRect.bottom - bottomLimit;
      } else {
        return;
      }

      body.scrollTo({
        top: Math.max(0, Math.min(body.scrollHeight - body.clientHeight, targetScrollTop)),
        behavior: reducedMotion ? "auto" : "smooth",
      });
    };

    const timeout = window.setTimeout(scrollDetailsIntoView, reducedMotion ? 0 : 220);
    return () => window.clearTimeout(timeout);
  }, [selectedHistoryId]);

  useEffect(() => {
    if (!signOutPending) return;
    if (account.status === "signed-out") {
      dialogRef.current?.close();
      setSignOutPending(false);
    } else if (account.error) {
      setSignOutPending(false);
    }
  }, [account.status, account.error, signOutPending]);

  const open = () => {
    // Use the in-memory result immediately; only revalidate after it becomes stale.
    void accountSession.loadGameHistory();
    if (account.leaderboardPublic) void accountSession.loadLeaderboardRanks();
    if (dialogRef.current && !dialogRef.current.open)
      showDialogWithoutActionFocus(dialogRef.current);
  };
  const close = () => dialogRef.current?.close();
  const requestSignOut = () => {
    if (signOutDialogRef.current && !signOutDialogRef.current.open)
      showDialogWithoutActionFocus(signOutDialogRef.current);
  };
  const cancelSignOut = () => signOutDialogRef.current?.close();
  const confirmSignOut = async () => {
    cancelSignOut();
    setSignOutPending(true);
    await accountSession.signOut();
    const snapshot = accountSession.getSnapshot();
    if (snapshot.status !== "signed-out" && snapshot.error) {
      setSignOutPending(false);
    }
  };
  const submitUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const claimed = await accountSession.claimUsername(username);
    if (claimed) {
      setUsername("");
      close();
    }
  };
  const accountLoading = account.status === "loading";
  const buttonLabel = account.username
    ? `Account menu for @${account.username}`
    : accountLoading
      ? "Loading account"
      : "Account and sign in";
  const themeLabel = theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";
  return (
    <>
      <button
        className="account-trigger"
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        aria-busy={accountLoading || undefined}
        onClick={open}
      >
        {account.username ? (
          <span className="account-trigger-username">@{account.username}</span>
        ) : accountLoading ? (
          <span className="account-trigger-skeleton" aria-hidden="true" />
        ) : (
          <span className="account-trigger-person" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <circle cx="10" cy="6.5" r="3" />
              <path d="M3.8 17a6.2 6.2 0 0 1 12.4 0" />
            </svg>
          </span>
        )}
        <svg className="account-trigger-chevron" aria-hidden="true" viewBox="0 0 20 20">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      <dialog
        className="game-dialog account-dialog"
        ref={dialogRef}
        aria-labelledby="account-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <div className="dialog-content account-content">
          <div className="online-dialog-header">
            <h2 className="sr-only" id="account-title">
              Profile and settings
            </h2>
            <button
              className="dialog-close"
              type="button"
              aria-label="Close account panel"
              onClick={close}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
            <button
              className="account-appearance-button"
              type="button"
              aria-label={`Change theme. Current theme: ${themeLabel.toLowerCase()}`}
              title={`Theme: ${themeLabel}`}
              onClick={onToggleTheme}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="6" />
                <path d="M10 4a6 6 0 0 1 0 12Z" />
              </svg>
              <span>{themeLabel}</span>
            </button>
          </div>
          <div className="account-body" ref={accountBodyRef}>
            {account.status === "profile-required" && (
              <div className="account-heading">
                <h3>Choose a username</h3>
              </div>
            )}
            {account.status === "unconfigured" && (
              <p>
                Sign-in is not configured yet. Supabase Auth and Google sign-in need to be
                connected.
              </p>
            )}
            {account.status === "loading" && <p role="status">Checking your account…</p>}
            {account.status === "signed-out" && (
              <>
                <p>
                  Sign in with Google to keep a unique username across devices. You can still play
                  as a guest.
                </p>
                <Button
                  variant="primary"
                  type="button"
                  disabled={account.busy}
                  onClick={() => void accountSession.signInWithGoogle()}
                >
                  {account.busy ? "Opening Google…" : "Continue with Google"}
                </Button>
              </>
            )}
            {account.status === "profile-required" && (
              <form
                className="account-username-form"
                onSubmit={(event) => void submitUsername(event)}
              >
                <p>Your username is how other players can recognize and find you.</p>
                <label htmlFor="account-username">Username</label>
                <div className="account-username-input">
                  <span aria-hidden="true">@</span>
                  <input
                    id="account-username"
                    name="username"
                    value={username}
                    onChange={(event) => setUsername(event.currentTarget.value)}
                    autoComplete="username"
                    maxLength={20}
                    minLength={3}
                    required
                    pattern="[A-Za-z][A-Za-z0-9_]{2,19}"
                    aria-describedby="username-hint"
                  />
                </div>
                <small id="username-hint">
                  3–20 characters. Start with a letter; use letters, numbers, or underscores.
                </small>
                <Button variant="primary" type="submit" disabled={account.busy}>
                  {account.busy ? "Saving…" : "Save username"}
                </Button>
              </form>
            )}
            {account.status === "signed-in" && (
              <div className="account-signed-in">
                <section className="account-summary" aria-label="Account summary">
                  <div className="account-identity-row">
                    <div className="account-identity">
                      <strong>@{account.username}</strong>
                    </div>
                    <button
                      className="account-sign-out-link"
                      type="button"
                      aria-label="Sign out"
                      disabled={account.busy}
                      onClick={requestSignOut}
                    >
                      <span className="account-sign-out-tag">Sign out</span>
                    </button>
                  </div>
                  <div className="account-facts">
                    {account.joinedAt && (
                      <span>Joined {accountDate.format(new Date(account.joinedAt))}</span>
                    )}
                    <span className="account-match-count">
                      <strong>{account.historyCount}</strong>
                      <span>matches played</span>
                    </span>
                    {account.leaderboardRanks.map((entry) => {
                      const gameTitle =
                        GAME_CATALOG.find((game) => game.id === entry.game_id)?.title ??
                        entry.game_id;
                      return (
                        <span
                          className="account-rank-tag"
                          key={entry.game_id}
                          title={`${gameTitle} all-time rank`}
                        >
                          <strong>#{entry.rank}</strong>
                          <span>{gameTitle}</span>
                        </span>
                      );
                    })}
                  </div>
                </section>
                <div className="account-leaderboard-privacy">
                  <span>
                    <strong>Show on leaderboard</strong>
                  </span>
                  <button
                    className="account-privacy-switch"
                    type="button"
                    role="switch"
                    aria-checked={account.leaderboardPublic}
                    aria-label="Show my rankings publicly"
                    disabled={account.busy}
                    onClick={() =>
                      void accountSession.setLeaderboardPublic(!account.leaderboardPublic)
                    }
                  >
                    <span aria-hidden="true" />
                  </button>
                </div>
                {account.guestHistoryCount > 0 && (
                  <div className="account-guest-import">
                    <div>
                      <strong>Guest results on this device</strong>
                      <small>Imported results are kept out of rankings.</small>
                    </div>
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={account.guestHistoryImporting}
                      onClick={() => void accountSession.importGuestHistory()}
                    >
                      {account.guestHistoryImporting
                        ? "Importing…"
                        : `Import ${account.guestHistoryCount}`}
                    </Button>
                  </div>
                )}
                {account.guestHistoryError && (
                  <p className="account-error" role="alert">
                    {account.guestHistoryError}
                  </p>
                )}
                <section className="account-history" aria-label="Recent game history">
                  <div className="account-history-heading">
                    <h3>Recent matches</h3>
                    <button
                      className="account-history-refresh"
                      type="button"
                      onClick={() => void accountSession.loadGameHistory(true)}
                      aria-label={
                        account.historyRefreshing
                          ? "Refreshing recent matches"
                          : "Refresh recent matches"
                      }
                      title={
                        account.historyRefreshing
                          ? "Refreshing recent matches"
                          : "Refresh recent matches"
                      }
                      aria-busy={account.historyRefreshing}
                      disabled={account.historyRefreshing}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20">
                        <path d="M16.2 7.1A6.6 6.6 0 1 0 16.6 11M16.2 3.8v3.8h-3.8" />
                      </svg>
                    </button>
                  </div>
                  {account.historyStatus === "loading" && account.history.length === 0 ? (
                    <div
                      className="account-history-skeleton-list"
                      role="status"
                      aria-label="Loading recent matches"
                    >
                      {[0, 1, 2].map((item) => (
                        <div className="account-history-skeleton" key={item} aria-hidden="true">
                          <span className="account-history-skeleton-outcome" />
                          <span className="account-history-skeleton-title" />
                          <span className="account-history-skeleton-date" />
                          <span className="account-history-skeleton-detail" />
                        </div>
                      ))}
                    </div>
                  ) : account.historyStatus === "error" && account.history.length === 0 ? (
                    <div className="account-history-retry">
                      <p className="account-history-message" role="alert">
                        {account.historyError}
                      </p>
                      <button
                        type="button"
                        onClick={() => void accountSession.loadGameHistory(true)}
                      >
                        Try again
                      </button>
                    </div>
                  ) : account.history.length === 0 ? (
                    <p className="account-history-message">Completed results will appear here.</p>
                  ) : (
                    <ol className="account-history-list">
                      {account.history.map((entry) => {
                        const finishReason = historyFinishReasonLabel(entry.finish_reason);
                        const gameName = historyGameTitle(entry.game_id);
                        const isExpanded = selectedHistoryId === entry.completion_id;
                        const historyDetails = account.historyDetails[entry.completion_id];
                        const hasReplay =
                          entry.replay_available === true &&
                          !(
                            historyDetails?.status === "ready" && historyDetails.rounds.length === 0
                          );
                        const detailsId = `history-replay-${entry.completion_id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
                        const cardContent = (
                          <>
                            <div className="account-history-card-heading">
                              <strong
                                className={`account-history-outcome ${entry.result === "win" ? "is-win" : "is-loss"}`}
                              >
                                {entry.result === "win" ? "Won" : "Lost"}
                              </strong>
                              <span className="account-history-game-name">{gameName}</span>
                              {entry.record_source === "guest_import" && (
                                <span className="account-history-imported">Imported</span>
                              )}
                              {historyRankingLabel(entry.ranking_status) && (
                                <span
                                  className={`account-history-ranking ${entry.ranking_status === "ranked" ? "is-ranked" : ""}`}
                                >
                                  {historyRankingLabel(entry.ranking_status)}
                                </span>
                              )}
                              <time dateTime={entry.completed_at}>
                                {accountDate.format(new Date(entry.completed_at))}
                              </time>
                            </div>
                            <div className="account-history-card-detail">
                              <span className="account-history-opponent">
                                vs. {entry.opponent_name}
                              </span>
                              <span
                                className="account-history-score"
                                aria-label={`Series score: ${entry.wins} wins to ${entry.losses}`}
                              >
                                {entry.wins}–{entry.losses}
                              </span>
                              {finishReason && (
                                <span className="account-history-reason">{finishReason}</span>
                              )}
                              {hasReplay &&
                                (historyOpeningId === entry.completion_id ? (
                                  <span className="account-history-checking" role="status">
                                    Checking…
                                  </span>
                                ) : (
                                  <svg
                                    className="account-history-expand-icon"
                                    aria-hidden="true"
                                    viewBox="0 0 20 20"
                                  >
                                    <path d={isExpanded ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"} />
                                  </svg>
                                ))}
                            </div>
                          </>
                        );

                        const toggleHistoryDetails = async () => {
                          if (isExpanded) {
                            setSelectedHistoryId(null);
                            return;
                          }
                          if (!hasReplay || historyOpeningId) return;
                          setHistoryOpeningId(entry.completion_id);
                          await accountSession.loadHistoryRounds(entry);
                          const loaded =
                            accountSession.getSnapshot().historyDetails[entry.completion_id];
                          setHistoryOpeningId((current) =>
                            current === entry.completion_id ? null : current,
                          );
                          if (loaded?.status === "ready" && loaded.rounds.length === 0) return;
                          setSelectedHistoryId(entry.completion_id);
                        };
                        const retryHistoryDetails = async () => {
                          await accountSession.loadHistoryRounds(entry);
                          const loaded =
                            accountSession.getSnapshot().historyDetails[entry.completion_id];
                          if (loaded?.status === "ready" && loaded.rounds.length === 0)
                            setSelectedHistoryId(null);
                        };
                        return (
                          <li
                            className={`account-history-item${isExpanded ? " is-expanded" : ""}`}
                            key={entry.completion_id}
                            ref={(node) => {
                              if (node) historyItemRefs.current.set(entry.completion_id, node);
                              else historyItemRefs.current.delete(entry.completion_id);
                            }}
                          >
                            {hasReplay ? (
                              <button
                                className="account-history-card"
                                type="button"
                                aria-label={`${entry.result === "win" ? "Won" : "Lost"} ${gameName} against ${entry.opponent_name}, score ${entry.wins} to ${entry.losses}. ${isExpanded ? "Hide" : "View"} game boards`}
                                aria-busy={historyOpeningId === entry.completion_id || undefined}
                                aria-expanded={isExpanded}
                                aria-controls={detailsId}
                                disabled={historyOpeningId === entry.completion_id}
                                onClick={() => void toggleHistoryDetails()}
                              >
                                {cardContent}
                              </button>
                            ) : (
                              <div className="account-history-card is-static">{cardContent}</div>
                            )}
                            {hasReplay && (
                              <div
                                className={`account-history-disclosure${isExpanded ? " is-open" : ""}`}
                                id={detailsId}
                                aria-hidden={!isExpanded}
                                inert={!isExpanded}
                              >
                                <div className="account-history-disclosure-inner">
                                  {historyDetails && (
                                    <GameHistoryDetails
                                      details={historyDetails}
                                      onRetry={() => void retryHistoryDetails()}
                                    />
                                  )}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {(account.historyHasMore || account.historyMoreError) && (
                    <button
                      className="account-history-more"
                      type="button"
                      disabled={account.historyLoadingMore}
                      onClick={() => void accountSession.loadMoreGameHistory()}
                    >
                      {account.historyLoadingMore
                        ? "Loading…"
                        : account.historyMoreError
                          ? "Try again"
                          : "Show more"}
                    </button>
                  )}
                  {account.historyMoreError && (
                    <p className="account-history-note" role="alert">
                      {account.historyMoreError}
                    </p>
                  )}
                  {account.historyError && account.history.length > 0 && (
                    <p className="account-history-note">
                      Showing saved results. Refresh when you’re back online.
                    </p>
                  )}
                </section>
              </div>
            )}
            {account.status === "error" && (
              <div className="account-error-state" role="alert">
                <p>{account.error}</p>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void accountSession.refreshProfile()}
                >
                  Try again
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={account.busy}
                  onClick={requestSignOut}
                >
                  Sign out
                </Button>
              </div>
            )}
            {account.error && account.status !== "error" && (
              <p className="account-error" role="alert">
                {account.error}
              </p>
            )}
          </div>
        </div>
      </dialog>
      <dialog
        className="game-dialog account-signout-dialog"
        ref={signOutDialogRef}
        aria-labelledby="signout-title"
        onCancel={(event) => {
          event.preventDefault();
          cancelSignOut();
        }}
      >
        <div className="dialog-content account-signout-content">
          <div className="online-dialog-header">
            <h2 id="signout-title">Sign out?</h2>
            <button
              className="dialog-close"
              type="button"
              aria-label="Cancel sign out"
              onClick={cancelSignOut}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
          <p>You can still play as a guest and sign in again anytime.</p>
          <div className="account-signout-actions">
            <Button variant="secondary" type="button" onClick={cancelSignOut}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={account.busy}
              onClick={() => void confirmSignOut()}
            >
              {account.busy ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
