import { describe, expect, it } from 'vitest';

import { evaluateState, evaluateStructureState } from '@/ai/evaluation';
import { createInitialState } from '@/domain';
import { withConfig } from '@/test/factories';

describe('AI evaluation terminal scoring', () => {
  it('scores draw-tiebreak wins as decisive terminal outcomes', () => {
    const config = withConfig({ drawRule: 'threefold' });
    const state = {
      ...createInitialState(config),
      status: 'gameOver' as const,
      pendingJump: null,
      victory: {
        type: 'threefoldTiebreakWin' as const,
        winner: 'white' as const,
        ownFieldCheckers: { white: 10, black: 9 },
        completedHomeStacks: { white: 2, black: 1 },
        decidedBy: 'checkers' as const,
      },
    };

    expect(evaluateStructureState(state, 'white', config)).toBeGreaterThan(900_000);
    expect(evaluateStructureState(state, 'black', config)).toBeLessThan(-900_000);
    expect(evaluateState(state, 'white', config)).toBeGreaterThan(900_000);
    expect(evaluateState(state, 'black', config)).toBeLessThan(-900_000);
  });
});
