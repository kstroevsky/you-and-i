import type { ActionKind, Board, Coord, PendingJump, Player } from '@/domain/model/types';

export type PartialJumpResolution = {
  board: Board;
  currentCoord: Coord;
  jumpedCheckerIds: Set<string>;
  firstJumpedOwner: Player | null;
};

export type AppliedActionState = {
  board: Board;
  continuationTargets?: Coord[];
  pendingJump: PendingJump | null;
};

export type TargetMap = Record<ActionKind, Coord[]>;
