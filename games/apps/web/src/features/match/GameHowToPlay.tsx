import { useId, useState } from "react";
import { GAME_CATALOG } from "../../games/registry";
import {
  CHECKERS_VARIANTS,
  ENGLISH_RULES_VERSION,
  INTERNATIONAL_RULES_VERSION,
  checkersVariantForVersion,
} from "@portfolio-games/checkers";

export type GameId = (typeof GAME_CATALOG)[number]["id"];

const TURN_LIMIT_COPY =
  "Each turn has 45 seconds. If your clock reaches zero, you lose that game, even if you are ahead on the board.";
const SERIES_DRAW_COPY =
  "In an online series, a draw counts toward the 1-, 3-, or 5-game limit but adds no win.";

const gameGuides: Readonly<
  Record<
    Exclude<GameId, "checkers">,
    Readonly<{
      objective: string;
      turnHeading: string;
      steps: readonly string[];
      endingHeading: string;
      ending: string;
      timerHeading: string;
      turnLimit: string;
      video?: Readonly<{ href: string; label: string; source: string }>;
    }>
  >
> = {
  "connect-four": {
    objective: "Connect four of your discs in a row.",
    turnHeading: "Take your turn",
    steps: [
      "The player marked “Goes first” takes the first turn. Tap an arrow above any open column to drop your disc into its lowest empty space.",
      "Players take turns. Connect four of your discs in a horizontal, vertical, or diagonal line to win.",
    ],
    endingHeading: "How the game ends",
    ending:
      "The first player to connect four wins. It is a tie when the board fills without a winner or no four-in-a-row remains possible.",
    timerHeading: "Turn timer",
    turnLimit: TURN_LIMIT_COPY,
  },
  reversi: {
    objective: "Finish with more of your discs on the board.",
    turnHeading: "Take your turn",
    steps: [
      "The board starts with four discs in the centre. Dark moves first.",
      "Tap an empty square marked as a legal move. Your new disc must trap at least one opposing disc between it and another of your discs in a straight line: horizontally, vertically, or diagonally.",
      "Every trapped disc flips to your colour. One move can flip discs in several directions.",
      "If you have no legal move, your turn passes automatically. You cannot pass when a legal move is available.",
    ],
    endingHeading: "How the game ends",
    ending:
      "The game ends when the board is full or neither player has a legal move, even if empty squares remain. More discs wins; equal counts are a tie.",
    timerHeading: "Turn timer",
    turnLimit: TURN_LIMIT_COPY,
    video: {
      href: "https://www.youtube.com/watch?v=4XdyAZhzJW8",
      label: "Watch a short Reversi walkthrough",
      source: "YouTube",
    },
  },
  "tic-tac-toe": {
    objective: "Make a line of three of your marks.",
    turnHeading: "Take your turn",
    steps: [
      "Players take turns placing their mark in an empty square. X goes first; the player cards show each player’s mark.",
      "Make three of your marks in a horizontal, vertical, or diagonal line to win.",
    ],
    endingHeading: "How the game ends",
    ending:
      "The first player to make a line of three wins. If all nine squares fill with no line, the game is a tie.",
    timerHeading: "Turn timer",
    turnLimit: TURN_LIMIT_COPY,
  },
};

const checkersGuideDetails = {
  [INTERNATIONAL_RULES_VERSION]: {
    setup: "10×10 board · 20 pieces per player",
    summary: "10×10 · flying kings · must capture the most",
    differences: [
      "Men can capture diagonally forward or backward.",
      "Flying kings can move any distance along a clear diagonal. After a capture, a king can land on any empty square beyond the captured piece.",
      "Continue a multi-capture with the same piece until no capture is available. You must choose a route that captures the most pieces; kings and men count equally.",
      "A man that reaches the far row during a multi-capture is crowned only after the full move ends.",
    ],
    drawRule:
      "A draw also applies after 25 moves per player with only kings moving and no captures, or after 5 or 16 moves each in specified low-piece endings.",
  },
  [ENGLISH_RULES_VERSION]: {
    setup: "8×8 board · 12 pieces per player",
    summary: "8×8 · short kings · choose any legal route",
    differences: [
      "Men capture only forward. Short kings capture one adjacent piece in either direction and land on the next square.",
      "Continue a multi-capture with the same piece until no jump is available. You may choose any legal route; taking the most pieces is not required.",
      "If a man reaches the far row during a capture, it is crowned and the turn ends.",
    ],
    drawRule: "A draw also applies after 40 moves per player without a capture or a man advancing.",
  },
} as const;

export function GameHowToPlay({ gameId, rulesVersion }: { gameId: string; rulesVersion?: number }) {
  if (gameId === "checkers")
    return <CheckersGuide {...(rulesVersion === undefined ? {} : { rulesVersion })} />;
  const guide = Object.hasOwn(gameGuides, gameId)
    ? gameGuides[gameId as Exclude<GameId, "checkers">]
    : undefined;
  if (!guide) return null;

  return (
    <div className="game-how-to-play">
      <section
        className="game-how-to-section game-how-to-goal"
        aria-labelledby={`${gameId}-guide-goal`}
      >
        <h3 id={`${gameId}-guide-goal`}>Goal</h3>
        <p className="game-how-to-objective">{guide.objective}</p>
      </section>
      <section className="game-how-to-section" aria-labelledby={`${gameId}-guide-turn`}>
        <h3 id={`${gameId}-guide-turn`}>{guide.turnHeading}</h3>
        <ol>
          {guide.steps.map((step, index) => (
            <li key={`${gameId}-${index}`}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="game-how-to-section" aria-labelledby={`${gameId}-guide-ending`}>
        <h3 id={`${gameId}-guide-ending`}>{guide.endingHeading}</h3>
        <p>{guide.ending}</p>
        <p className="game-how-to-note">{SERIES_DRAW_COPY}</p>
      </section>
      <section
        className="game-how-to-section game-how-to-timer"
        aria-labelledby={`${gameId}-guide-timer`}
      >
        <h3 id={`${gameId}-guide-timer`}>{guide.timerHeading}</h3>
        <p>{guide.turnLimit}</p>
      </section>
      {guide.video && (
        <a className="game-how-to-video" href={guide.video.href} target="_blank" rel="noreferrer">
          <span>{guide.video.label}</span>
          <span className="game-how-to-video-source">{guide.video.source}</span>
        </a>
      )}
    </div>
  );
}

function CheckersGuide({ rulesVersion }: { rulesVersion?: number }) {
  const [catalogRulesVersion, setCatalogRulesVersion] = useState<
    typeof ENGLISH_RULES_VERSION | typeof INTERNATIONAL_RULES_VERSION
  >(INTERNATIONAL_RULES_VERSION);
  const variantGroupName = useId();
  const activeRulesVersion =
    rulesVersion === ENGLISH_RULES_VERSION
      ? ENGLISH_RULES_VERSION
      : rulesVersion === undefined
        ? catalogRulesVersion
        : INTERNATIONAL_RULES_VERSION;
  const variant = checkersVariantForVersion(activeRulesVersion)!;
  const details = checkersGuideDetails[activeRulesVersion];

  return (
    <div className="game-how-to-play">
      <section
        className="game-how-to-section game-how-to-goal"
        aria-labelledby="checkers-guide-goal"
      >
        <h3 id="checkers-guide-goal">Goal</h3>
        <p className="game-how-to-objective">
          Capture all your opponent’s pieces or leave them with no legal move.
        </p>
      </section>
      <section className="game-how-to-section" aria-labelledby="checkers-guide-shared">
        <h3 id="checkers-guide-shared">Shared rules</h3>
        <ul>
          <li>Players take turns. The player marked “Goes first” starts.</li>
          <li>Play on dark squares. Men move one square diagonally forward.</li>
          <li>
            Captures are compulsory. Jump diagonally over an opponent’s piece and land beyond it;
            the rules below explain how each version handles captures.
          </li>
        </ul>
      </section>
      {rulesVersion === undefined && (
        <fieldset className="game-guide-variant-choice">
          <legend>Choose a ruleset</legend>
          <div className="game-guide-variant-options">
            {CHECKERS_VARIANTS.map((option) => {
              const optionDetails = checkersGuideDetails[option.rulesVersion];
              return (
                <label className="game-guide-variant-option" key={option.rulesVersion}>
                  <input
                    type="radio"
                    name={`checkers-guide-rules-${variantGroupName}`}
                    value={option.rulesVersion}
                    checked={catalogRulesVersion === option.rulesVersion}
                    onChange={() => setCatalogRulesVersion(option.rulesVersion)}
                  />
                  <span>
                    <strong>{option.name}</strong>
                    <small>{optionDetails.summary}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {rulesVersion !== undefined && (
        <p className="game-guide-variant-summary">{details.summary}</p>
      )}
      <section className="game-how-to-section" aria-labelledby="checkers-guide-variant">
        <h3 id="checkers-guide-variant">Rules that differ</h3>
        <p className="game-how-to-variant-setup">
          {variant.name} · {details.setup}
        </p>
        <ul>
          {details.differences.map((difference) => (
            <li key={difference}>{difference}</li>
          ))}
        </ul>
      </section>
      <section className="game-how-to-section" aria-labelledby="checkers-guide-draws">
        <h3 id="checkers-guide-draws">Draws</h3>
        <ul>
          <li>A position repeated three times with the same player to move is a draw.</li>
          <li>{details.drawRule}</li>
        </ul>
        <p className="game-how-to-note">{SERIES_DRAW_COPY}</p>
      </section>
      <section
        className="game-how-to-section game-how-to-timer"
        aria-labelledby="checkers-guide-timer"
      >
        <h3 id="checkers-guide-timer">Turn timer</h3>
        <p>
          You get 45 seconds each turn. If your clock reaches zero, you lose that game, even if you
          have more pieces.
        </p>
      </section>
    </div>
  );
}
