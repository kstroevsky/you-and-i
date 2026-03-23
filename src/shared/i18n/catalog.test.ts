import { describe, expect, it } from 'vitest';

import { formatGameResultTitle, formatVictory } from '@/shared/i18n/catalog';
import type { Victory } from '@/domain';

const THREEFOLD_TIEBREAK_WIN: Victory = {
  type: 'threefoldTiebreakWin',
  winner: 'white',
  ownFieldCheckers: { white: 10, black: 9 },
  completedHomeStacks: { white: 2, black: 1 },
  decidedBy: 'checkers',
};

const STALEMATE_TIEBREAK_WIN: Victory = {
  type: 'stalemateTiebreakWin',
  winner: 'black',
  ownFieldCheckers: { white: 9, black: 9 },
  completedHomeStacks: { white: 1, black: 2 },
  decidedBy: 'stacks',
};

describe('i18n result formatting', () => {
  it('treats draw-tiebreak wins as winner titles', () => {
    expect(formatGameResultTitle('english', THREEFOLD_TIEBREAK_WIN)).toBe('White win');
    expect(formatGameResultTitle('russian', STALEMATE_TIEBREAK_WIN)).toBe('Чёрные победили');
  });

  it('includes explicit tiebreak counts in victory summary text', () => {
    const englishSummary = formatVictory('english', THREEFOLD_TIEBREAK_WIN);
    const russianSummary = formatVictory('russian', STALEMATE_TIEBREAK_WIN);

    expect(englishSummary).toContain('Own-field checkers: White 10, Black 9');
    expect(englishSummary).toContain('Completed home stacks: White 2, Black 1');
    expect(englishSummary).toContain('decided by own-field checkers');

    expect(russianSummary).toContain('Шашки на своём поле: белые 9, чёрные 9');
    expect(russianSummary).toContain('Завершённые домашние горки: белые 1, чёрные 2');
    expect(russianSummary).toContain('решение по завершённым домашним горкам');
  });
});
