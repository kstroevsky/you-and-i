import type {
  AiDifficultyPreset,
  AiRiskMode,
  AiSearchDiagnostics,
} from '@/ai/types';
import type { EngineState, Player, RuleConfig } from '@/domain';
import type { AiBehaviorProfile } from '@/shared/types/session';

import { getBehaviorStateBias } from '@/ai/behavior';
import { getParticipationScore, type ParticipationState } from '@/ai/participation';
import { getDynamicDrawScore, getRiskStateBias } from '@/ai/risk';
import { getStrategicIntent, getStrategicScore } from '@/ai/strategy';

const TERMINAL_SCORE = 1_000_000;

type EvaluationOptions = {
  behaviorProfile?: AiBehaviorProfile | null;
  diagnostics?: AiSearchDiagnostics | null;
  participationState?: ParticipationState | null;
  preset?: AiDifficultyPreset | null;
  riskMode?: AiRiskMode;
};

/** Returns the opposing player for zero-sum score differences. */
function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

/** Cheap structure-only score used by move ordering before deeper search refines it. */
export function evaluateStructureState(
  state: EngineState,
  perspectivePlayer: Player,
  _ruleConfig: RuleConfig,
  options: Omit<EvaluationOptions, 'participationState'> = {},
): number {
  if (state.status === 'gameOver') {
    if ('winner' in state.victory) {
      return state.victory.winner === perspectivePlayer ? TERMINAL_SCORE : -TERMINAL_SCORE;
    }

    return getDynamicDrawScore(
      state,
      perspectivePlayer,
      options.preset ?? null,
      options.riskMode ?? 'normal',
      options.diagnostics ?? null,
    );
  }

  return getStrategicScore(state, perspectivePlayer);
}

/**
 * Scores one engine state from `perspectivePlayer`'s point of view.
 *
 * The evaluator intentionally models plan conversion rather than exact tactical mobility.
 * Search handles the tactical frontier with move ordering and quiescence.
 */
export function evaluateState(
  state: EngineState,
  perspectivePlayer: Player,
  _ruleConfig: RuleConfig,
  options: EvaluationOptions = {},
): number {
  const {
    behaviorProfile = null,
    diagnostics = null,
    participationState = null,
    preset = null,
    riskMode = 'normal',
  } = options;

  if (state.status === 'gameOver') {
    if ('winner' in state.victory) {
      return state.victory.winner === perspectivePlayer ? TERMINAL_SCORE : -TERMINAL_SCORE;
    }

    return getDynamicDrawScore(state, perspectivePlayer, preset, riskMode, diagnostics);
  }

  const opponent = getOpponent(perspectivePlayer);
  const ownIntent = getStrategicIntent(state, perspectivePlayer);
  const opponentIntent = getStrategicIntent(state, opponent);
  let score = getStrategicScore(state, perspectivePlayer);

  if (ownIntent.intent === 'home') {
    score += 120;
  } else if (ownIntent.intent === 'sixStack') {
    score += 90;
  }

  if (opponentIntent.intent === 'home') {
    score -= 60;
  } else if (opponentIntent.intent === 'sixStack') {
    score -= 60;
  }

  if (state.pendingJump) {
    score += state.currentPlayer === perspectivePlayer ? 140 : -140;
  }

  if (behaviorProfile) {
    score += getBehaviorStateBias(state, perspectivePlayer, behaviorProfile.id);
  }

  if (riskMode !== 'normal') {
    score += getRiskStateBias(state, perspectivePlayer, riskMode);
  }

  if (preset) {
    score += getParticipationScore(
      state,
      perspectivePlayer,
      preset,
      participationState,
    );
  }

  return score;
}
