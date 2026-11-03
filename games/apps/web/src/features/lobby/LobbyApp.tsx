import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { lobbyClient, type LobbyMatch } from "./lobby-client";
import { GAME_CATALOG } from "../../games/registry";
import type { GameController } from "../../app/controller-contract";
import { showDialogWithoutActionFocus } from "../../shared/show-dialog";
import { Button } from "../../components/Button";

function seriesLabel(target: number): string {
  return target === 1 ? "One game" : `First to win ${target}`;
}

export default function LobbyApp({
  controller,
}: {
  controller: GameController;
}) {
  const app = useSyncExternalStore(
    controller.store.subscribe,
    controller.store.getSnapshot,
    controller.store.getSnapshot,
  );
  const lobbyState = useSyncExternalStore(
    lobbyClient.subscribe,
    lobbyClient.getSnapshot,
    lobbyClient.getSnapshot,
  );
  const tab = app.lobbyTab;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const filter = lobbyState.filter;

  useEffect(() => {
    const onVisibility = () =>
      lobbyClient.setPageVisible(document.visibilityState === "visible");
    lobbyClient.setVisible(true);
    lobbyClient.setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      lobbyClient.setVisible(false);
    };
  }, []);

  useEffect(() => {
    if (app.lobbyTabFocusRequest) {
      tabRefs.current[tab === "matches" ? 0 : 1]?.focus();
      controller.clearLobbyTabFocusRequest();
    }
  }, [app.lobbyTabFocusRequest, controller, tab]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "games") url.searchParams.set("view", "games");
    else url.searchParams.delete("view");
    if (filter === "all") url.searchParams.delete("lobbyGame");
    else url.searchParams.set("lobbyGame", filter);
    history.replaceState(null, "", url);
  }, [tab, filter]);

  const filteredMatches = lobbyState.matches.filter(
    (match) => filter === "all" || match.gameId === filter,
  );
  const showEmptyState =
    lobbyState.hasLoadedSnapshot &&
    lobbyState.connection === "connected" &&
    !lobbyState.hasMore &&
    filteredMatches.length === 0 &&
    lobbyState.opponentOffers.length === 0;
  const selectedGame = GAME_CATALOG.find((game) => game.id === filter);
  const openFilter = () => {
    if (dialogRef.current && !dialogRef.current.open)
      showDialogWithoutActionFocus(dialogRef.current);
  };
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = tab === "matches" ? 0 : 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowLeft"
        ? (current + 1) % 2
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? 1
            : -1;
    if (next < 0) return;
    event.preventDefault();
    controller.setLobbyTab(next === 0 ? "matches" : "games");
    tabRefs.current[next]?.focus();
  };
  const join = (match: LobbyMatch) => controller.joinMatch(match);

  return (
    <>
      {app.activeMatch && (
        <aside className="active-match-banner" aria-label="Ongoing match">
          <div className="active-match-copy">
            <strong>
              {app.activeMatch.pending
                ? "Match setup in progress"
                : app.activeMatch.checking
                  ? "Checking saved match…"
                  : app.activeMatch.notice
                    ? "Saved match needs attention"
                    : app.activeMatch.statusLabel}
            </strong>
            <span>
              {app.activeMatch.pending
                ? "Another tab is creating or joining a match."
                : app.activeMatch.checking
                  ? "Verifying your saved match."
                  : app.activeMatch.notice ||
                    `${GAME_CATALOG.find((game) => game.id === app.activeMatch?.gameId)?.title ?? "Online"} match`}
            </span>
          </div>
          {!app.activeMatch.pending && (
            <Button
              className="active-match-resume"
              variant="accent-outline"
              type="button"
              disabled={app.resumingMatch || app.activeMatch.checking}
              onClick={controller.resumeMatch}
            >
              {app.resumingMatch
                ? "Reconnecting…"
                : app.activeMatch.notice
                  ? "Try again"
                  : "Return to match"}
            </Button>
          )}
        </aside>
      )}

      <div className="lobby-navigation-row">
        <nav
          className="lobby-tabs"
          role="tablist"
          aria-label="Browse open matches or games"
          onKeyDown={onTabKeyDown}
        >
          <button
            ref={(node) => {
              tabRefs.current[0] = node;
            }}
            className="lobby-tab"
            id="matches-tab"
            type="button"
            role="tab"
            aria-selected={tab === "matches"}
            aria-controls="matches-panel"
            tabIndex={tab === "matches" ? 0 : -1}
            onClick={() => controller.setLobbyTab("matches")}
          >
            Open matches
          </button>
          <button
            ref={(node) => {
              tabRefs.current[1] = node;
            }}
            className="lobby-tab"
            id="games-tab"
            type="button"
            role="tab"
            aria-selected={tab === "games"}
            aria-controls="games-panel"
            tabIndex={tab === "games" ? 0 : -1}
            onClick={() => controller.setLobbyTab("games")}
          >
            Games
          </button>
        </nav>
      </div>
      {tab === "matches" && (
        <div className="lobby-filter-row">
          <Button
            className="lobby-filter-trigger"
            variant="secondary"
            size="compact"
            type="button"
            aria-haspopup="dialog"
            aria-controls="lobby-filter-dialog"
            aria-label={`Filter matches. ${selectedGame?.title ?? "All games"} selected`}
            onClick={openFilter}
          >
            <svg className="lobby-filter-icon" aria-hidden="true" viewBox="0 0 20 20">
              <path d="M2.5 4h15l-5.7 6.5v4.4l-3.6 1.8v-6.2L2.5 4Z" />
            </svg>
            <span>{selectedGame?.title ?? "All games"}</span>
            <svg className="lobby-filter-chevron" aria-hidden="true" viewBox="0 0 20 20">
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </Button>
          <Button
            className="lobby-create-match"
            variant="primary"
            size="compact"
            type="button"
            aria-label="Create a match"
            onClick={() => controller.setLobbyTab("games", true)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Create match
          </Button>
        </div>
      )}

      <section
        className="lobby-panel"
        id="matches-panel"
        role="tabpanel"
        aria-labelledby="matches-tab"
        hidden={tab !== "matches"}
      >
        <div
          className="lobby-match-list"
          role="region"
          tabIndex={0}
          aria-label="Open matches for the selected game"
          aria-live="polite"
          aria-busy={
            !lobbyState.hasLoadedSnapshot &&
            lobbyState.connection !== "connected"
          }
        >
          {filteredMatches.length === 0 && !lobbyState.hasLoadedSnapshot && (
            <p className="lobby-empty">
              {lobbyState.connection === "reconnecting"
                ? "Reconnecting…"
                : "Loading matches…"}
            </p>
          )}
          {showEmptyState && (
            <div className="lobby-empty-state">
              <p>No open matches</p>
              <Button
                variant="primary"
                size="compact"
                type="button"
                onClick={() => controller.setLobbyTab("games", true)}
              >
                Choose a game
              </Button>
            </div>
          )}
          {filteredMatches.map((match) => {
            const game = GAME_CATALOG.find((item) => item.id === match.gameId);
            if (!game) return null;
            return (
              <article className="lobby-match-row" key={match.matchId}>
                <div className="lobby-match-copy">
                  <strong>{match.displayName}</strong>
                  <span>
                    {game.title} · {seriesLabel(match.seriesTarget)}
                  </span>
                </div>
                <Button
                  className="lobby-join-button"
                  variant="secondary"
                  size="compact"
                  type="button"
                  aria-label={`Play ${game.title} with ${match.displayName}`}
                  onClick={() => join(match)}
                >
                  Play
                </Button>
              </article>
            );
          })}
          {!lobbyState.hasMore && lobbyState.opponentOffers.map((opponent) => (
            <article className="lobby-match-row" key={opponent.offerId}>
              <div className="lobby-match-copy">
                <strong>{opponent.displayName}</strong>
                <span>
                  {GAME_CATALOG.find((game) => game.id === opponent.gameId)
                    ?.title ?? "Game"}{" "}
                  · {seriesLabel(opponent.seriesTarget)}
                </span>
              </div>
              <Button
                className="lobby-join-button"
                variant="secondary"
                size="compact"
                type="button"
                aria-label={`Play ${GAME_CATALOG.find((game) => game.id === opponent.gameId)?.title ?? "game"} with ${opponent.displayName}`}
                onClick={() => {
                  controller.playOpponentMatch(
                    opponent.gameId,
                    opponent.profileId,
                    opponent.displayName,
                    opponent.seriesTarget,
                  );
                  lobbyClient.consumeOpponentOffer(opponent.offerId);
                }}
              >
                Play
              </Button>
            </article>
          ))}
        </div>
        {lobbyState.hasMore && (
          <Button
            className="lobby-load-more"
            variant="secondary"
            type="button"
            disabled={lobbyState.loadingMore}
            onClick={() => lobbyClient.loadMore()}
          >
            {lobbyState.loadingMore ? "Loading…" : "Show more matches"}
          </Button>
        )}
        {(app.lobbyError || lobbyState.error) && (
          <p className="lobby-error" role="status" aria-live="polite">
            {app.lobbyError || lobbyState.error}
          </p>
        )}
        {lobbyState.canReconnect && (
          <button
            className="lobby-reconnect"
            type="button"
            onClick={() => lobbyClient.retry()}
          >
            Reconnect
          </button>
        )}
      </section>

      <section
        className="lobby-panel"
        id="games-panel"
        role="tabpanel"
        aria-labelledby="games-tab"
        hidden={tab !== "games"}
      >
        <div className="game-catalog-list">
          {GAME_CATALOG.map((game) => (
            <article className="game-catalog-row" key={game.id}>
              <div className="game-catalog-identity">
                <div className="game-catalog-copy">
                  <div className="game-catalog-title-line">
                    <h4>{game.title}</h4>
                    <span className="game-catalog-meta">
                      {game.playerCount}
                    </span>
                  </div>
                </div>
              </div>
              <div className="game-catalog-actions">
                <Button
                  variant="primary"
                  type="button"
                  aria-label={`Create a ${game.title} match`}
                  onClick={() => controller.createMatch(game.id)}
                >
                  Play online
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <dialog
        className="game-dialog lobby-filter-dialog"
        id="lobby-filter-dialog"
        ref={dialogRef}
        aria-labelledby="lobby-filter-title"
      >
        <div className="dialog-content">
          <div className="online-dialog-header">
            <h2 id="lobby-filter-title">Filter matches</h2>
            <button
              className="dialog-close"
              type="button"
              aria-label="Close filters"
              onClick={() => dialogRef.current?.close()}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" /></svg>
            </button>
          </div>
          <fieldset className="lobby-filter-options">
            <legend className="sr-only">Game</legend>
            {[{ id: "all", title: "All games" }, ...GAME_CATALOG].map(
              (game) => (
                <label className="lobby-filter-option" key={game.id}>
                  <input
                    type="radio"
                    name="lobby-game-filter"
                    value={game.id}
                    checked={filter === game.id}
                    onChange={() => {
                      lobbyClient.setFilter(game.id);
                      dialogRef.current?.close("selected");
                    }}
                  />
                  <span>{game.title}</span>
                </label>
              ),
            )}
          </fieldset>
        </div>
      </dialog>
    </>
  );
}
