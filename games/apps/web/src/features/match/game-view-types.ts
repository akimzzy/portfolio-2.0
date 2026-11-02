import type { ReactNode } from 'react';
import type { GameController } from '../../app/controller-contract';
import type { MatchViewSnapshot } from './match-view-store';

export type GameBoardProps = Readonly<{
  match: MatchViewSnapshot;
  controller: GameController;
}>;

export type GameBoardView = (props: GameBoardProps) => ReactNode;
