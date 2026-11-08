import { useState } from "react";
import type { GameHistoryDetails as GameHistoryDetailsState } from "./account-session";
import { historyFinishReasonLabel } from "./history-presentation";
import { HistoryBoard } from "./HistoryBoard";

function roundOutcome(entry: GameHistoryDetailsState["rounds"][number]): "win" | "loss" | "tie" {
  if (!entry.winner_seat) return "tie";
  return entry.winner_seat === entry.player_seat ? "win" : "loss";
}

function roundScore(entry: GameHistoryDetailsState["rounds"][number]): string {
  const outcome = roundOutcome(entry);
  if (outcome === "tie") return "0–0";
  return outcome === "win" ? "1–0" : "0–1";
}

function roundOutcomeLabel(outcome: "win" | "loss" | "tie"): string {
  if (outcome === "tie") return "tied";
  return outcome === "win" ? "won" : "lost";
}

export function GameHistoryDetails({
  details,
  onRetry,
}: {
  details: GameHistoryDetailsState | undefined;
  onRetry: () => void;
}) {
  const rounds = details?.rounds ?? [];
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);
  const selectedRound =
    rounds.find((round) => round.round_number === selectedRoundNumber) ?? rounds.at(-1) ?? null;
  const selectedRoundFinishReason = selectedRound
    ? historyFinishReasonLabel(selectedRound.finish_reason)
    : null;

  return (
    <div className="account-history-details" aria-label="Round boards">
      {details?.status === "loading" && (
        <p className="account-history-message" role="status">
          Loading round boards…
        </p>
      )}
      {details?.status === "error" && (
        <div className="account-history-retry">
          <p className="account-history-message" role="alert">
            {details.error}
          </p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {details?.status === "ready" && selectedRound && (
        <>
          <div
            className="account-history-round-tabs"
            role="group"
            aria-label="Choose a game to review"
          >
            {rounds.map((round) => {
              const outcome = roundOutcome(round);
              const selected = selectedRound.round_number === round.round_number;
              const score = roundScore(round);
              return (
                <button
                  key={round.round_number}
                  type="button"
                  className={`account-history-round-tab is-${outcome}`}
                  aria-pressed={selected}
                  aria-label={`Game ${round.round_number}, ${roundOutcomeLabel(outcome)}, score ${score}`}
                  title={`Game ${round.round_number} · ${score}`}
                  onClick={() => setSelectedRoundNumber(round.round_number)}
                >
                  <span className="account-history-round-tab-label">
                    <span className="account-history-round-outcome" aria-hidden="true" />
                    Game {round.round_number}
                  </span>
                  <strong>{score}</strong>
                </button>
              );
            })}
          </div>
          <div
            className="account-history-round-panel"
            key={selectedRound.round_number}
            role="region"
            aria-label={`Game ${selectedRound.round_number} final board; ${roundOutcomeLabel(roundOutcome(selectedRound))}${selectedRoundFinishReason ? `, ${selectedRoundFinishReason}` : ""}`}
          >
            <HistoryBoard gameId={selectedRound.game_id} finalState={selectedRound.final_state} />
          </div>
        </>
      )}
    </div>
  );
}
