import { getCell } from '@/domain/model/board';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { allCoords, parseCoord } from '@/domain/model/coordinates';
import type { EngineState } from '@/domain/model/types';

export const AI_MODEL_PLANE_COUNT = 16;

/** Writes one feature activation into the flattened plane-major tensor layout. */
function setPlaneValue(
  buffer: Float32Array,
  plane: number,
  coordIndex: number,
  value = 1,
): void {
  buffer[plane * 36 + coordIndex] = value;
}

/**
 * Encodes the engine state into the fixed feature planes expected by the ONNX model.
 *
 * The representation is perspective-aligned: "own" and "opponent" planes are
 * relative to the side to move, which lets one model serve both players.
 */
export function encodeStateForModel(state: EngineState): Float32Array {
  const buffer = new Float32Array(AI_MODEL_PLANE_COUNT * 36);
  const own = state.currentPlayer;
  const coords = allCoords();

  for (let index = 0; index < coords.length; index += 1) {
    const coord = coords[index];
    const cell = getCell(state.board, coord);
    const { row } = parseCoord(coord);

    if (!cell.checkers.length) {
      setPlaneValue(buffer, 12, index);
    }

    if (HOME_ROWS[own].has(row as never)) {
      setPlaneValue(buffer, 13, index);
    }

    if (row === FRONT_HOME_ROW[own]) {
      setPlaneValue(buffer, 14, index);
    }

    if (state.pendingJump?.source === coord) {
      setPlaneValue(buffer, 15, index);
    }

    for (let depth = 0; depth < cell.checkers.length; depth += 1) {
      const checker = cell.checkers[depth];
      const planeOffset = checker.owner === own ? 0 : 6;
      const topDepth = cell.checkers.length - 1;

      if (cell.checkers.length === 1) {
        setPlaneValue(buffer, planeOffset + (checker.frozen ? 1 : 0), index);
        continue;
      }

      if (depth === topDepth) {
        setPlaneValue(buffer, planeOffset + (cell.checkers.length === 2 ? 2 : 3), index);
        continue;
      }

      if (topDepth - depth === 1) {
        setPlaneValue(buffer, planeOffset + 4, index);
      } else {
        setPlaneValue(buffer, planeOffset + 5, index);
      }
    }

  }

  return buffer;
}
