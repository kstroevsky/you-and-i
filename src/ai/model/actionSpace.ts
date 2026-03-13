import { actionKey } from '@/ai/search/shared';
import { DIRECTION_VECTORS } from '@/domain/model/constants';
import {
  allCoords,
  getDirectionBetween,
  getJumpDirection,
  type DirectionVector,
} from '@/domain/model/coordinates';
import type { Coord, TurnAction } from '@/domain/model/types';

export const AI_MODEL_ACTION_COUNT = 2_736;
export const AI_MODEL_POLICY_TEMPERATURE = 1.1;

const MANUAL_UNFREEZE_COUNT = 36;
const JUMP_DIRECTION_COUNT = 36 * DIRECTION_VECTORS.length;
const ADJACENT_ACTION_KINDS = [
  'climbOne',
  'moveSingleToEmpty',
  'splitOneFromStack',
  'splitTwoFromStack',
] as const;
const ADJACENT_ACTION_COUNT = 36 * DIRECTION_VECTORS.length * ADJACENT_ACTION_KINDS.length;
const FRIENDLY_TRANSFER_COUNT = 36 * 35;

const MANUAL_OFFSET = 0;
const JUMP_OFFSET = MANUAL_OFFSET + MANUAL_UNFREEZE_COUNT;
const ADJACENT_OFFSET = JUMP_OFFSET + JUMP_DIRECTION_COUNT;
const FRIENDLY_TRANSFER_OFFSET = ADJACENT_OFFSET + ADJACENT_ACTION_COUNT;

const COORDS = allCoords();

/** Maps a board coordinate into the fixed action-head ordering shared by training and runtime. */
function coordIndex(coord: Coord): number {
  return COORDS.indexOf(coord);
}

/** Converts geometric direction into the compact directional basis used by the model head. */
function directionIndex(direction: DirectionVector | null): number {
  if (!direction) {
    return -1;
  }

  return DIRECTION_VECTORS.findIndex(
    (candidate) =>
      candidate.fileDelta === direction.fileDelta && candidate.rankDelta === direction.rankDelta,
  );
}

/** Adjacent moves share the same geometry lattice and differ only by semantic action kind. */
function adjacentKindIndex(action: TurnAction): number {
  return ADJACENT_ACTION_KINDS.indexOf(action.type as (typeof ADJACENT_ACTION_KINDS)[number]);
}

/**
 * Friendly transfers use an all-to-all source/target encoding because they are not
 * direction-local moves like adjacent steps and jumps.
 */
function encodeFriendlyTransferIndex(source: Coord, target: Coord): number {
  const sourceRank = coordIndex(source);
  const targets = COORDS.filter((coord) => coord !== source);
  const targetRank = targets.indexOf(target);

  if (sourceRank < 0 || targetRank < 0) {
    return -1;
  }

  return FRIENDLY_TRANSFER_OFFSET + sourceRank * 35 + targetRank;
}

/**
 * Bridges one legal domain action to the fixed policy-head index space.
 *
 * This mapping is the contract that must stay aligned across self-play data
 * generation, training, ONNX export, and runtime inference.
 */
export function encodeActionIndex(action: TurnAction): number | null {
  switch (action.type) {
    case 'manualUnfreeze': {
      const index = coordIndex(action.coord);
      return index < 0 ? null : MANUAL_OFFSET + index;
    }
    case 'jumpSequence': {
      const landing = action.path.at(-1);
      const source = coordIndex(action.source);
      const direction = directionIndex(
        landing ? getJumpDirection(action.source, landing) : null,
      );

      if (source < 0 || direction < 0) {
        return null;
      }

      return JUMP_OFFSET + source * DIRECTION_VECTORS.length + direction;
    }
    case 'friendlyStackTransfer': {
      const index = encodeFriendlyTransferIndex(action.source, action.target);
      return index < 0 ? null : index;
    }
    default: {
      const source = coordIndex(action.source);
      const direction = directionIndex(getDirectionBetween(action.source, action.target));
      const kind = adjacentKindIndex(action);

      if (source < 0 || direction < 0 || kind < 0) {
        return null;
      }

      return (
        ADJACENT_OFFSET +
        source * DIRECTION_VECTORS.length * ADJACENT_ACTION_KINDS.length +
        direction * ADJACENT_ACTION_KINDS.length +
        kind
      );
    }
  }
}

/**
 * Masks raw model logits down to legal actions and turns them into normalized priors.
 *
 * The model never decides legality; it only reweights already legal actions.
 */
export function buildMaskedActionPriors(
  legalActions: TurnAction[],
  logits: ArrayLike<number>,
): Record<string, number> {
  const indexed = legalActions
    .map((action) => {
      const index = encodeActionIndex(action);

      if (index === null || index < 0 || index >= logits.length) {
        return null;
      }

      return {
        action,
        logit: logits[index] / AI_MODEL_POLICY_TEMPERATURE,
      };
    })
    .filter(Boolean) as Array<{ action: TurnAction; logit: number }>;

  if (!indexed.length) {
    return {};
  }

  const maxLogit = Math.max(...indexed.map((entry) => entry.logit));
  const weights = indexed.map((entry) => ({
    key: actionKey(entry.action),
    weight: Math.exp(entry.logit - maxLogit),
  }));
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  return weights.reduce<Record<string, number>>((priors, entry) => {
    priors[entry.key] = entry.weight / totalWeight;
    return priors;
  }, {});
}

/** Exposes action-space metadata for tests, tooling, and model/documentation sanity checks. */
export function getActionSpaceMetadata() {
  return {
    actionCount: AI_MODEL_ACTION_COUNT,
    adjacentActionKinds: [...ADJACENT_ACTION_KINDS],
    offsets: {
      adjacent: ADJACENT_OFFSET,
      friendlyTransfer: FRIENDLY_TRANSFER_OFFSET,
      jump: JUMP_OFFSET,
      manualUnfreeze: MANUAL_OFFSET,
    },
  };
}

if (FRIENDLY_TRANSFER_OFFSET + FRIENDLY_TRANSFER_COUNT !== AI_MODEL_ACTION_COUNT) {
  throw new Error('AI model action-space constants are out of sync.');
}
