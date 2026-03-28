import type { AiDifficultyPreset, AiRiskMode, AiStrategicTag } from '@/ai/types';
import { getStrategicScore } from '@/ai/strategy';
import { getCellHeight } from '@/domain/model/board';
import { allCoords } from '@/domain/model/coordinates';
import type {
  EngineState,
  GameState,
  Player,
  RuleConfig,
  StateSnapshot,
  TurnAction,
  TurnRecord,
} from '@/domain/model/types';
import { getLegalActions, getScoreSummary, hashPosition } from '@/domain';
import type { AiSearchDiagnostics } from '@/ai/types';

export type ProgressSnapshot = {
  frozenSingles: Record<Player, number>;
  homeFieldProgress: Record<Player, number>;
  sixStackProgress: Record<Player, number>;
};

export type RiskProfile = {
  riskMode: AiRiskMode;
  stagnationIndex: number;
};

export type RiskCandidateSignal = {
  emptyCellsDelta: number;
  freezeSwingBonus: number;
  homeFieldDelta: number;
  isForced: boolean;
  isRepetition: boolean;
  isSelfUndo: boolean;
  isTactical: boolean;
  mobilityDelta: number;
  repeatedPositionCount?: number;
  sixStackDelta: number;
  tags: AiStrategicTag[];
};

const STAGNATION_WINDOW = 6;
const LATE_RISK_MOVE_NUMBER = 70;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

function countChangedCells(
  before: Pick<StateSnapshot | GameState | EngineState, 'board'>,
  after: Pick<StateSnapshot | GameState | EngineState, 'board'>,
): number {
  let changed = 0;

  for (const coord of allCoords()) {
    const beforeCell = before.board[coord].checkers;
    const afterCell = after.board[coord].checkers;

    if (beforeCell.length !== afterCell.length) {
      changed += 1;
      continue;
    }

    if (
      beforeCell.some(
        (checker, index) =>
          checker.id !== afterCell[index]?.id ||
          checker.owner !== afterCell[index]?.owner ||
          checker.frozen !== afterCell[index]?.frozen,
      )
    ) {
      changed += 1;
    }
  }

  return changed;
}

function isQuietAction(action: TurnAction): boolean {
  return action.type !== 'jumpSequence' && action.type !== 'manualUnfreeze';
}

function getActionGeometry(action: TurnAction): { source: string; target: string } | null {
  switch (action.type) {
    case 'manualUnfreeze':
      return null;
    case 'jumpSequence':
      return {
        source: action.source,
        target: action.path.at(-1) ?? action.source,
      };
    default:
      return {
        source: action.source,
        target: action.target,
      };
  }
}

function isQuietSelfUndo(current: TurnAction, previous: TurnAction): boolean {
  if (!isQuietAction(current) || !isQuietAction(previous)) {
    return false;
  }

  const left = getActionGeometry(current);
  const right = getActionGeometry(previous);

  if (!left || !right) {
    return false;
  }

  return left.source === right.target && left.target === right.source;
}

function toEngineState(
  snapshot: StateSnapshot,
  positionCounts: Record<string, number>,
): EngineState {
  return {
    ...snapshot,
    positionCounts,
  };
}

export function createProgressSnapshot(
  state: Pick<GameState | EngineState | StateSnapshot, 'board'>,
): ProgressSnapshot {
  const summary = getScoreSummary(state as GameState);

  return {
    frozenSingles: {
      white: summary.frozenEnemySingles.black,
      black: summary.frozenEnemySingles.white,
    },
    homeFieldProgress: {
      white: summary.homeFieldSingles.white / 18,
      black: summary.homeFieldSingles.black / 18,
    },
    sixStackProgress: {
      white: summary.controlledHomeRowHeightThreeStacks.white / 6,
      black: summary.controlledHomeRowHeightThreeStacks.black / 6,
    },
  };
}

export function getEmptyCellCount(state: Pick<GameState | EngineState | StateSnapshot, 'board'>): number {
  return allCoords().reduce(
    (sum, coord) => sum + (getCellHeight(state.board, coord) === 0 ? 1 : 0),
    0,
  );
}

/**
 * Computes one root-level stagnation score from recent match history.
 *
 * This intentionally mirrors the variety-report intuition: repetition, tiny board
 * displacement, flat mobility, and flat win-condition progress are signs that the
 * search should start valuing decisive play more aggressively.
 */
export function getRiskProfile(
  state: EngineState,
  ruleConfig: RuleConfig,
  preset: AiDifficultyPreset,
  diagnostics: AiSearchDiagnostics | null = null,
): RiskProfile {
  if (state.status === 'gameOver') {
    return {
      riskMode: 'normal',
      stagnationIndex: 0,
    };
  }

  if (state.moveNumber >= LATE_RISK_MOVE_NUMBER) {
    if (diagnostics) {
      diagnostics.lateRiskTriggers += 1;
    }

    return {
      riskMode: 'late',
      stagnationIndex: 1,
    };
  }

  if (!('history' in state) || !Array.isArray(state.history) || state.history.length < 2) {
    const repetitionPressure = clamp(((state.positionCounts[hashPosition(state)] ?? 1) - 1) / 2, 0, 1);
    const structuralFlatness = clamp(
      (360 - Math.abs(getStrategicScore(state, state.currentPlayer))) / 360,
      0,
      1,
    );
    const movePressure = clamp((state.moveNumber - 24) / 30, 0, 1);
    const fallbackIndex = clamp(
      repetitionPressure * 0.45 + structuralFlatness * 0.35 + movePressure * 0.2,
      0,
      1,
    );

    if (fallbackIndex >= preset.stagnationThreshold && diagnostics) {
      diagnostics.stagnationRiskTriggers += 1;
    }

    return {
      riskMode: fallbackIndex >= preset.stagnationThreshold ? 'stagnation' : 'normal',
      stagnationIndex: fallbackIndex,
    };
  }

  const recent = state.history.slice(-STAGNATION_WINDOW);
  const startProgress = createProgressSnapshot(recent[0].beforeState);
  const endProgress = createProgressSnapshot(recent.at(-1)?.afterState ?? recent[0].afterState);
  const repetitionPressure =
    recent.reduce(
      (sum, record) =>
        sum +
        ((state.positionCounts[hashPosition(toEngineState(record.afterState, state.positionCounts))] ?? 0) > 1
          ? 1
          : 0),
      0,
    ) / recent.length;
  const averageDisplacement =
    recent.reduce((sum, record) => sum + countChangedCells(record.beforeState, record.afterState), 0) /
    recent.length /
    36;
  const displacementPressure = clamp((0.16 - averageDisplacement) / 0.16, 0, 1);
  const mobilityPressure =
    recent.reduce((sum, record) => {
      const beforeMobility = getLegalActions(
        toEngineState(record.beforeState, state.positionCounts),
        ruleConfig,
      ).length;
      const afterMobility = getLegalActions(
        toEngineState(record.afterState, state.positionCounts),
        ruleConfig,
      ).length;

      return sum + clamp((1.5 - Math.abs(afterMobility - beforeMobility)) / 1.5, 0, 1);
    }, 0) / recent.length;
  const homeProgressDelta =
    Math.max(endProgress.homeFieldProgress.white, endProgress.homeFieldProgress.black) -
    Math.max(startProgress.homeFieldProgress.white, startProgress.homeFieldProgress.black);
  const sixStackDelta =
    Math.max(endProgress.sixStackProgress.white, endProgress.sixStackProgress.black) -
    Math.max(startProgress.sixStackProgress.white, startProgress.sixStackProgress.black);
  const progressPressure =
    homeProgressDelta <= 0.01 && sixStackDelta <= 0.01
      ? 1
      : clamp((0.05 - Math.max(homeProgressDelta, sixStackDelta)) / 0.05, 0, 1);
  const sameActorHistory = new Map<Player, TurnRecord[]>();

  for (const record of recent) {
    const entries = sameActorHistory.get(record.actor) ?? [];
    entries.push(record);
    sameActorHistory.set(record.actor, entries);
  }

  const selfUndoPairs = [...sameActorHistory.values()].flatMap((records) =>
    records.slice(1).map((record, index) =>
      isQuietSelfUndo(record.action, records[index].action) ? 1 : 0,
    ),
  );
  const selfUndoPressure = selfUndoPairs.length
    ? selfUndoPairs.reduce<number>((sum, value) => sum + value, 0) / selfUndoPairs.length
    : 0;
  const totalWeight =
    preset.stagnationRepetitionWeight +
    preset.stagnationSelfUndoWeight +
    preset.stagnationDisplacementWeight +
    preset.stagnationMobilityWeight +
    preset.stagnationProgressWeight;
  const stagnationIndex = clamp(
    (
      repetitionPressure * preset.stagnationRepetitionWeight +
      selfUndoPressure * preset.stagnationSelfUndoWeight +
      displacementPressure * preset.stagnationDisplacementWeight +
      mobilityPressure * preset.stagnationMobilityWeight +
      progressPressure * preset.stagnationProgressWeight
    ) / Math.max(1, totalWeight),
    0,
    1,
  );

  if (stagnationIndex >= preset.stagnationThreshold && diagnostics) {
    diagnostics.stagnationRiskTriggers += 1;
  }

  return {
    riskMode: stagnationIndex >= preset.stagnationThreshold ? 'stagnation' : 'normal',
    stagnationIndex,
  };
}

/** Applies state-dependent contempt so drawn positions are not always scored as zero. */
export function getDynamicDrawScore(
  state: EngineState,
  perspectivePlayer: Player,
  preset: AiDifficultyPreset | null,
  riskMode: AiRiskMode,
  diagnostics: AiSearchDiagnostics | null = null,
): number {
  const drawPreset = preset;

  if (!drawPreset) {
    return 0;
  }

  const structuralScore = getStrategicScore(state, perspectivePlayer);
  const aheadness = clamp(structuralScore / 600, -1, 1);
  const aheadPenalty = drawPreset.drawAversionAhead * Math.max(0, aheadness + 0.15);
  const behindRelief = drawPreset.drawAversionBehindRelief * Math.max(0, -aheadness - 0.35);
  const escalationMultiplier = riskMode === 'late' ? 1.65 : riskMode === 'stagnation' ? 1.25 : 1;
  const drawScore = Math.round(-aheadPenalty * escalationMultiplier + behindRelief);

  if (drawScore !== 0 && diagnostics) {
    diagnostics.drawAversionApplications += 1;
  }

  return drawScore;
}

/**
 * Risk mode should only favor lines that create measurable progress.
 *
 * This keeps the engine from spending its extra "be decisive" budget on quiet
 * loops that look active in the tree but leave the position structurally flat.
 */
export function hasCertifiedRiskProgress(candidate: RiskCandidateSignal): boolean {
  const planProgress = candidate.homeFieldDelta + candidate.sixStackDelta;
  const laneProgress =
    (candidate.tags.includes('decompress') || candidate.tags.includes('openLane')) &&
    (candidate.emptyCellsDelta > 0 || candidate.mobilityDelta > 0);

  return (
    candidate.emptyCellsDelta > 0 ||
    candidate.mobilityDelta >= 2 ||
    planProgress >= 0.04 ||
    candidate.freezeSwingBonus > 0 ||
    laneProgress
  );
}

/**
 * Converts root/ordering features into one bounded risk adjustment.
 *
 * The adjustment is intentionally asymmetric: risk mode rewards decompression
 * and conversion, but it penalizes stagnant, repetitive near-equal moves even
 * more strongly so "risky" does not collapse into "loop forever and hope".
 */
export function getRiskCandidateAdjustment(
  candidate: RiskCandidateSignal,
  preset: AiDifficultyPreset,
  riskMode: AiRiskMode,
): number {
  if (riskMode === 'normal') {
    return 0;
  }

  const planProgress = candidate.homeFieldDelta + candidate.sixStackDelta;
  const progressCertified = hasCertifiedRiskProgress(candidate);
  const mobilityGain = clamp(candidate.mobilityDelta - 1, 0, 4);
  const riskMultiplier = riskMode === 'late' ? 1.12 : 1;
  let adjustment =
    Math.max(0, candidate.emptyCellsDelta) * 220 +
    mobilityGain * 150 +
    Math.max(0, planProgress) * preset.riskProgressBonus +
    Math.max(0, candidate.freezeSwingBonus) * preset.riskTacticalBonus +
    (candidate.tags.includes('decompress') && candidate.mobilityDelta > 0
      ? preset.riskProgressBonus * 0.45
      : 0) +
    (candidate.tags.includes('openLane') && candidate.mobilityDelta > 0
      ? preset.riskProgressBonus * 0.35
      : 0) +
    (candidate.tags.includes('captureControl') ? preset.riskTacticalBonus * 0.2 : 0) +
    (candidate.tags.includes('freezeBlock') ? preset.riskTacticalBonus * 0.18 : 0);

  if (!progressCertified && !candidate.isForced) {
    adjustment -= Math.round(preset.riskLoopPenalty * 0.85);
  }

  if (candidate.isRepetition && !candidate.isForced) {
    adjustment -= preset.riskLoopPenalty * Math.max(1, (candidate.repeatedPositionCount ?? 2) - 1);
  }

  if (candidate.isSelfUndo && !candidate.isForced) {
    adjustment -= Math.round(preset.riskLoopPenalty * 1.15);
  }

  return Math.round(adjustment * riskMultiplier);
}

export function getRiskStateBias(
  state: EngineState,
  player: Player,
  riskMode: AiRiskMode,
): number {
  if (riskMode === 'normal') {
    return 0;
  }

  const own = createProgressSnapshot(state);
  const opponent = getOpponent(player);
  const emptyCells = getEmptyCellCount(state);
  const strategicPressure =
    getStrategicScore(state, player) - getStrategicScore(state, opponent);
  const progressEdge =
    Math.max(own.homeFieldProgress[player], own.sixStackProgress[player]) -
    Math.max(own.homeFieldProgress[opponent], own.sixStackProgress[opponent]);
  const multiplier = riskMode === 'late' ? 1.3 : 1;

  return Math.round((emptyCells * 10 + progressEdge * 260 + strategicPressure * 0.08) * multiplier);
}
