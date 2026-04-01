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

/** O(1) coordinate-to-index lookup precomputed at module load. */
const COORD_INDEX: Map<Coord, number> = new Map(COORDS.map((c, i) => [c, i]));

/** O(1) direction-to-index lookup keyed by `(fileDelta + 1) * 3 + (rankDelta + 1)`. Values are -1/0/+1. */
const DIRECTION_INDEX: Map<number, number> = new Map(
  DIRECTION_VECTORS.map((d, i) => [(d.fileDelta + 1) * 3 + (d.rankDelta + 1), i]),
);

/** O(1) adjacent-action-kind index precomputed at module load. */
const ADJACENT_KIND_INDEX: Map<string, number> = new Map(
  ADJACENT_ACTION_KINDS.map((k, i) => [k, i]),
);

/** Maps a board coordinate into the fixed action-head ordering shared by training and runtime. */
function coordIndex(coord: Coord): number {
  return COORD_INDEX.get(coord) ?? -1;
}

/** Converts geometric direction into the compact directional basis used by the model head. */
function directionIndex(direction: DirectionVector | null): number {
  if (!direction) {
    return -1;
  }

  return DIRECTION_INDEX.get((direction.fileDelta + 1) * 3 + (direction.rankDelta + 1)) ?? -1;
}

/** Adjacent moves share the same geometry lattice and differ only by semantic action kind. */
function adjacentKindIndex(action: TurnAction): number {
  return ADJACENT_KIND_INDEX.get(action.type) ?? -1;
}

/**
 * Friendly transfers use an all-to-all source/target encoding because they are not
 * direction-local moves like adjacent steps and jumps.
 *
 * Target rank in the "all coords except source" list is:
 *   rawTargetRank              if rawTargetRank < sourceRank
 *   rawTargetRank - 1          if rawTargetRank > sourceRank
 */
function encodeFriendlyTransferIndex(source: Coord, target: Coord): number {
  const sourceRank = coordIndex(source);
  const rawTargetRank = coordIndex(target);

  if (sourceRank < 0 || rawTargetRank < 0 || sourceRank === rawTargetRank) {
    return -1;
  }

  const targetRank = rawTargetRank > sourceRank ? rawTargetRank - 1 : rawTargetRank;

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
 * Returns a Float32Array of size AI_MODEL_ACTION_COUNT where each element is the
 * softmax-normalized prior for that action index. Unrepresentable or illegal actions
 * have a prior of 0. Callers index this array using encodeActionIndex.
 *
 * The model never decides legality; it only reweights already legal actions.
 */
export function buildMaskedActionPriors(
  legalActions: TurnAction[],
  logits: ArrayLike<number>,
): Float32Array {
  const result = new Float32Array(AI_MODEL_ACTION_COUNT);
  const indexed = legalActions
    .map((action) => {
      const index = encodeActionIndex(action);

      if (index === null || index < 0 || index >= logits.length) {
        return null;
      }

      return { index, logit: logits[index] / AI_MODEL_POLICY_TEMPERATURE };
    })
    .filter(Boolean) as Array<{ index: number; logit: number }>;

  if (!indexed.length) {
    return result;
  }

  const maxLogit = Math.max(...indexed.map((entry) => entry.logit));
  const weights = indexed.map((entry) => ({
    index: entry.index,
    weight: Math.exp(entry.logit - maxLogit),
  }));
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  for (const entry of weights) {
    result[entry.index] = entry.weight / totalWeight;
  }

  return result;
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
