import { GAME_CATALOG } from "../../games/registry";

export type GameId = (typeof GAME_CATALOG)[number]["id"];

const gameGuides: Readonly<Record<GameId, Readonly<{
  objective: string;
  turnHeading: string;
  steps: readonly string[];
  endingHeading: string;
  ending: string;
  timerHeading: string;
  turnLimit: string;
  video?: Readonly<{ href: string; label: string; source: string }>;
}>>> = {
  "connect-four": {
    objective: "Connect four of your discs in a row.",
    turnHeading: "Take your turn",
    steps: [
      "The player marked “Goes first” takes the first turn. Tap an arrow above any open column to drop your disc into its lowest empty space.",
      "Players take turns. Connect four of your discs in a horizontal, vertical, or diagonal line to win.",
    ],
    endingHeading: "How the game ends",
    ending: "The first player to connect four wins. If the board fills with no line of four, the game is a tie.",
    timerHeading: "Turn timer",
    turnLimit: "You have 45 seconds for each turn. The clock resets on your next turn. If it reaches zero, your opponent wins this game.",
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
    ending: "The game ends when neither player can move, even if empty squares remain. The player with more discs wins; equal counts are a tie.",
    timerHeading: "Turn timer",
    turnLimit: "You have 45 seconds for each turn. The clock resets on your next turn. If it reaches zero, your opponent wins this game.",
    video: {
      href: "https://www.youtube.com/watch?v=4XdyAZhzJW8",
      label: "Watch a short Reversi walkthrough",
      source: "YouTube",
    },
  },
};

export function GameHowToPlay({ gameId }: { gameId: string }) {
  const guide = Object.hasOwn(gameGuides, gameId)
    ? gameGuides[gameId as GameId]
    : undefined;
  if (!guide) return null;

  return (
    <div className="game-how-to-play">
      <section className="game-how-to-section game-how-to-goal" aria-labelledby={`${gameId}-guide-goal`}>
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
      <section className="game-how-to-section game-how-to-ending" aria-labelledby={`${gameId}-guide-ending`}>
        <h3 id={`${gameId}-guide-ending`}>{guide.endingHeading}</h3>
        <p>{guide.ending}</p>
      </section>
      <section className="game-how-to-section game-how-to-timer" aria-labelledby={`${gameId}-guide-timer`}>
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
