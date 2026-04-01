import { describe, expect, it } from 'vitest';

import { chooseComputerAction } from '@/ai';
import {
  actionKey,
  createHomeFieldWinState,
  createOpponentThreatState,
  createSixStackWinState,
} from '@/ai/test/searchTestUtils';
import { withConfig } from '@/test/factories';

const PARITY_RULE_CONFIG = withConfig({ drawRule: 'threefold' });

describe('search parity guardrails', () => {
  it.each([
    {
      action: 'climbOne:B2:A1',
      completedDepth: 2,
      completedRootMoves: 23,
      difficulty: 'easy' as const,
      fallbackKind: 'none' as const,
      name: 'easy threat block',
      riskMode: 'normal' as const,
      rootCandidates: [
        'climbOne:B2:A1',
        'manualUnfreeze:A4',
        'manualUnfreeze:C4',
        'manualUnfreeze:D4',
      ],
      state: createOpponentThreatState(),
    },
    // TODO: 'easy late draw trap' parity case removed — the draw-trap fixture was recorded under
    // old rules that allowed cross-color jump continuations. The pendingJump color-consistency
    // rule breaks the replay at move 36. Re-add once the fixture is re-recorded under current rules.
    {
      action: 'moveSingleToEmpty:C3:C4',
      completedDepth: 1,
      completedRootMoves: 1,
      difficulty: 'easy' as const,
      fallbackKind: 'none' as const,
      name: 'easy home-field win',
      riskMode: 'normal' as const,
      rootCandidates: ['moveSingleToEmpty:C3:C4'],
      state: createHomeFieldWinState(),
    },
    {
      action: 'climbOne:A5:A6',
      completedDepth: 1,
      completedRootMoves: 1,
      difficulty: 'medium' as const,
      fallbackKind: 'none' as const,
      name: 'medium six-stack win',
      riskMode: 'normal' as const,
      rootCandidates: ['climbOne:A5:A6'],
      state: createSixStackWinState(),
    },
    {
      action: 'climbOne:A5:A6',
      completedDepth: 1,
      completedRootMoves: 1,
      difficulty: 'hard' as const,
      fallbackKind: 'none' as const,
      name: 'hard six-stack win',
      riskMode: 'normal' as const,
      rootCandidates: ['climbOne:A5:A6'],
      state: createSixStackWinState(),
    },
  ])(
    'keeps exact move selection stable for $name',
    ({
      action,
      completedDepth,
      completedRootMoves,
      difficulty,
      fallbackKind,
      riskMode,
      rootCandidates,
      state,
    }) => {
      const result = chooseComputerAction({
        difficulty,
        now: () => 0,
        random: () => 0,
        ruleConfig: PARITY_RULE_CONFIG,
        state,
      });

      expect(actionKey(result.action)).toBe(action);
      expect(result.fallbackKind).toBe(fallbackKind);
      expect(result.riskMode).toBe(riskMode);
      expect(result.completedDepth).toBe(completedDepth);
      expect(result.completedRootMoves).toBe(completedRootMoves);
      expect(result.rootCandidates.map((candidate) => actionKey(candidate.action))).toEqual(rootCandidates);
    },
  );
});
