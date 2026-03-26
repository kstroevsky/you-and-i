import type { Coord, EngineState, TurnAction } from '@/domain/model/types';

type TurnConstraintState = Pick<EngineState, 'pendingJump'>;

/** Resolves the only coordinate that may act this turn when a jump continuation is open. */
export function getForcedActionCoord(state: TurnConstraintState): Coord | null {
  return state.pendingJump?.source ?? null;
}

/** Projects every action variant onto the coordinate that initiates it. */
export function getActingCoord(action: TurnAction): Coord {
  return action.type === 'manualUnfreeze' ? action.coord : action.source;
}
