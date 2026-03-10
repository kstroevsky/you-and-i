import { useEffect, useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { formatVictory, playerLabel, text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { Button } from '@/ui/primitives/Button';

import styles from './style.module.scss';

function getResultToken(
  status: 'active' | 'gameOver',
  historyCursor: number,
  victory:
    | { type: 'none' }
    | { type: 'homeField'; winner: 'white' | 'black' }
    | { type: 'sixStacks'; winner: 'white' | 'black' }
    | { type: 'threefoldDraw' }
    | { type: 'stalemateDraw' },
): string | null {
  if (status !== 'gameOver') {
    return null;
  }

  const winner = 'winner' in victory ? victory.winner : 'draw';

  return `${historyCursor}:${victory.type}:${winner}`;
}

function getResultTitle(language: Language, victory: Parameters<typeof getResultToken>[2]): string {
  switch (victory.type) {
    case 'homeField':
    case 'sixStacks':
      return language === 'russian'
        ? `${playerLabel(language, victory.winner)} победили`
        : `${playerLabel(language, victory.winner)} win`;
    case 'threefoldDraw':
    case 'stalemateDraw':
      return language === 'russian' ? 'Ничья' : 'Draw';
    case 'none':
      return language === 'russian' ? 'Игра окончена' : 'Game over';
  }
}

export function GameResultModal() {
  const { historyCursor, language, status, victory } = useGameStore(
    useShallow((state) => ({
      historyCursor: state.historyCursor,
      language: state.preferences.language,
      status: state.gameState.status,
      victory: state.gameState.victory,
    })),
  );
  const titleId = useId();
  const descriptionId = useId();
  const resultToken = getResultToken(status, historyCursor, victory);
  const [isOpen, setIsOpen] = useState(resultToken !== null);

  useEffect(() => {
    setIsOpen(resultToken !== null);
  }, [resultToken]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || status !== 'gameOver') {
    return null;
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={() => setIsOpen(false)}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <p className={styles.kicker}>{text(language, 'gameResult')}</p>
        <h2 id={titleId}>{getResultTitle(language, victory)}</h2>
        <p id={descriptionId} className={styles.summary}>
          {formatVictory(language, victory)}
        </p>
        <div className={styles.actions}>
          <Button autoFocus onClick={() => setIsOpen(false)}>
            {text(language, 'close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
