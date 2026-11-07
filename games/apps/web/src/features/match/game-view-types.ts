import type { ReactNode } from "react";
import type { PlayerSeat } from "../../../../../packages/contracts/dist/index.js";
import type { GameController } from "../../app/controller-contract";
import type { MatchViewSnapshot } from "./match-view-store";

export type GameBoardProps = Readonly<{
  match: MatchViewSnapshot;
  controller: GameController;
  onMovePresentationChange?: (
    presentation: Readonly<{
      key: string;
      matchId: string | null;
      actionCount: number;
      seat: PlayerSeat;
      row: number;
      column: number;
      flipCount: number;
      inRapidSequence: boolean;
      skippedSeat: PlayerSeat | null;
    }> | null,
  ) => void;
}>;

export type GameBoardView = (props: GameBoardProps) => ReactNode;
