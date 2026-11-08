import { useEffect, useMemo, useSyncExternalStore } from "react";
import LobbyApp from "../features/lobby/LobbyApp";
import MatchApp from "../features/match/MatchApp";
import { createGameController } from "./application-controller";
import { lobbyClient } from "../features/lobby/lobby-client";
import type { OpeningMatchView } from "./game-app-store";
import { Button } from "../components/Button";
import { AccountControl } from "../features/account/AccountControl";
import { accountSession } from "../features/account/account-session";

export default function App() {
  const controller = useMemo(() => createGameController(), []);
  const app = useSyncExternalStore(
    controller.store.subscribe,
    controller.store.getSnapshot,
    controller.store.getSnapshot,
  );
  const account = useSyncExternalStore(
    accountSession.subscribe,
    accountSession.getSnapshot,
    accountSession.getSnapshot,
  );

  useEffect(() => {
    accountSession.start();
    return () => accountSession.stop();
  }, []);

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    if (account.status !== "signed-in") return;
    const returnToMatch = accountSession.takeOAuthMatchReturn();
    if (returnToMatch) window.location.replace(returnToMatch);
  }, [account.status]);

  useEffect(() => {
    document.documentElement.dataset.theme = app.theme;
    document.documentElement.style.colorScheme = app.theme === "system" ? "light dark" : app.theme;
  }, [app.theme]);

  const matchScreen = app.screen === "match";
  const openingScreen = app.screen === "opening";
  const gameScreen = matchScreen || openingScreen;
  const leaderboardPage = app.screen === "lobby" && app.lobbyTab === "leaderboard";
  const showHeaderBack = gameScreen || leaderboardPage;
  const headerBackLabel = leaderboardPage ? "Back to lobby" : "Back to games";
  return (
    <div className="game-app-root">
      <a
        className="skip-link"
        href={matchScreen ? "#board" : openingScreen ? "#match-opening" : "#lobby-view"}
      >
        {gameScreen ? "Skip to game" : "Skip to games"}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <div className="game-title">
            <div className={showHeaderBack ? "header-title-row" : undefined}>
              {showHeaderBack && (
                <button
                  className="header-back-button"
                  type="button"
                  onClick={leaderboardPage ? controller.closeLeaderboard : controller.goToGames}
                  aria-label={headerBackLabel}
                  title={headerBackLabel}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20">
                    <path d="M15.5 10H4.5m0 0 4.2-4.2M4.5 10l4.2 4.2" />
                  </svg>
                </button>
              )}
              <div className="header-title-copy">
                <h1 className={leaderboardPage ? "leaderboard-page-title" : undefined}>
                  {leaderboardPage ? "Leaderboard" : app.title}
                </h1>
                {gameScreen
                  ? app.description && <p aria-live="polite">{app.description}</p>
                  : !leaderboardPage && <LobbySummary />}
              </div>
              {leaderboardPage && (
                <div id="leaderboard-game-picker-slot" className="leaderboard-header-slot" />
              )}
            </div>
          </div>
          <div className="header-actions">
            {app.screen === "lobby" && app.lobbyTab !== "leaderboard" && (
              <button
                className="leaderboard-nav-button"
                type="button"
                onClick={controller.openLeaderboard}
                aria-label="Leaderboard"
                title="Leaderboard"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M6 3.5h8v3.2a4 4 0 0 1-8 0V3.5Zm0 1H3.5v1.8a3.3 3.3 0 0 0 3.8 3.2m6.7-5h2.5v1.8a3.3 3.3 0 0 1-3.8 3.2M10 10.8v3.4m-3 2.3h6m-5-2.3h4" />
                </svg>
                <span>Leaderboard</span>
              </button>
            )}
            {app.controls.playOnlineVisible && !app.onlineSetupOpen && (
              <button
                className="multiplayer-button"
                type="button"
                disabled={app.controls.playOnlineDisabled}
                title={app.controls.playOnlineTitle}
                onClick={controller.playOnline}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="7.5" />
                  <path d="M2.8 7h14.4M2.8 13h14.4M10 2.5c2 2.1 3 4.6 3 7.5s-1 5.4-3 7.5c-2-2.1-3-4.6-3-7.5s1-5.4 3-7.5Z" />
                </svg>
                <span>{app.controls.playOnlineLabel}</span>
              </button>
            )}
            {app.controls.newGameVisible && !app.onlineSetupOpen && (
              <button
                className="new-game-button"
                type="button"
                disabled={app.controls.newGameDisabled}
                onClick={controller.newGame}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M16.7 8A7 7 0 1 0 17 11M16.7 8V3.7M16.7 8h-4.2" />
                </svg>
                <span>New game</span>
              </button>
            )}
            {app.controls.soundVisible && (
              <button
                className={`sound-button${app.soundEnabled ? "" : " is-muted"}`}
                type="button"
                aria-label={app.soundEnabled ? "Mute sound" : "Enable sound"}
                onClick={controller.toggleSound}
              >
                <svg className="sound-on-icon" aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M3 8v4h3l4 3V5L6 8H3Z" />
                  <path d="M13 7a5 5 0 0 1 0 6M15 4.5a8 8 0 0 1 0 11" />
                </svg>
                <svg className="sound-off-icon" aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M3 8v4h3l4 3V5L6 8H3Z" />
                  <path d="m13 8 4 4m0-4-4 4" />
                </svg>
              </button>
            )}
            <AccountControl theme={app.theme} onToggleTheme={controller.toggleTheme} />
          </div>
        </div>
      </header>
      <main id="game" className={`page-shell${matchScreen ? " match-page-shell" : ""}`}>
        {matchScreen ? (
          <div className="match-view">
            <MatchApp controller={controller} connection={app.connection} />
          </div>
        ) : openingScreen && app.openingMatch ? (
          <MatchOpening
            opening={app.openingMatch}
            onRetry={controller.retryOpenMatch}
            onBack={controller.goToGames}
          />
        ) : (
          <section className="lobby-view" id="lobby-view" aria-label="Games lobby">
            <LobbyApp controller={controller} />
          </section>
        )}
      </main>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {app.announcement}
      </div>
    </div>
  );
}

function MatchOpening({
  opening,
  onRetry,
  onBack,
}: {
  opening: OpeningMatchView;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <section
      className="match-opening"
      id="match-opening"
      aria-labelledby="match-opening-title"
      aria-busy={opening.status === "loading"}
    >
      <div className="opening-board" aria-hidden="true">
        {Array.from({ length: 42 }, (_, index) => (
          <span className="opening-cell" key={index} />
        ))}
      </div>
      <div className="opening-copy" role={opening.status === "error" ? "alert" : "status"}>
        {opening.status === "loading" && <span className="opening-spinner" aria-hidden="true" />}
        <h2 id="match-opening-title">{opening.title}</h2>
        <p>{opening.message}</p>
        {opening.action === "retry" && (
          <Button variant="primary" type="button" onClick={onRetry}>
            Try again
          </Button>
        )}
        {opening.action === "reload" && (
          <Button variant="primary" type="button" onClick={() => window.location.reload()}>
            Reload game
          </Button>
        )}
        {opening.status === "error" && (
          <button className="opening-back-button" type="button" onClick={onBack}>
            Back to games
          </button>
        )}
      </div>
    </section>
  );
}

function LobbySummary() {
  const lobby = useSyncExternalStore(
    lobbyClient.subscribe,
    lobbyClient.getSnapshot,
    lobbyClient.getSnapshot,
  );
  if (lobby.connection !== "connected") {
    return (
      <p className="lobby-presence" role="status">
        {lobby.connection === "connecting" ? "Connecting…" : "Reconnecting…"}
      </p>
    );
  }
  if (lobby.totalMatches === null) return null;
  const availableMatches = lobby.totalMatches + lobby.opponentOffers.length;
  return (
    <p className="lobby-presence" aria-live="polite">
      {availableMatches} {availableMatches === 1 ? "match" : "matches"} available
    </p>
  );
}
