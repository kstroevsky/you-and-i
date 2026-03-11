import { useEffect, useId } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useIsMobileViewport } from '@/shared/hooks/useIsMobileViewport';
import { useGameStore } from '@/app/providers/GameStoreProvider';
import { actionLabel, describeInteraction, text } from '@/shared/i18n/catalog';
import { Button } from '@/ui/primitives/Button';
import { Panel } from '@/ui/primitives/Panel';
import { GlossaryTooltip } from '@/ui/tooltips/GlossaryTooltip';

import styles from './style.module.scss';

export function MoveInputPanel() {
  const isCompactViewport = useIsMobileViewport(720);
  const titleId = useId();
  const {
    availableActionKinds,
    interaction,
    language,
    selectedActionType,
    selectedCell,
    onCancel,
    onChooseAction,
  } = useGameStore(
    useShallow((state) => ({
      availableActionKinds: state.availableActionKinds,
      interaction: state.interaction,
      language: state.preferences.language,
      selectedActionType: state.selectedActionType,
      selectedCell: state.selectedCell,
      onCancel: state.cancelInteraction,
      onChooseAction: state.chooseActionType,
    })),
  );

  const isChoiceModalOpen =
    selectedCell !== null && selectedActionType === null && availableActionKinds.length > 0;

  useEffect(() => {
    if (!isChoiceModalOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChoiceModalOpen, onCancel]);

  return (
    <>
      {isChoiceModalOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={onCancel}>
          <div
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalKicker}>{text(language, 'moveInput')}</p>
                <h2 id={titleId}>{text(language, 'moveChoiceDialog')}</h2>
              </div>
              <Button className={styles.clearButton} variant="ghost" onClick={onCancel}>
                {text(language, 'clear')}
              </Button>
            </div>
            <p className={styles.selectionMeta}>
              <strong>{text(language, 'selectedCellLabel')}:</strong> {selectedCell}
            </p>
            <div className={styles.actionGrid}>
              {availableActionKinds.map((actionKind) => (
                <div key={actionKind} className={styles.actionChip}>
                  <Button
                    className={styles.actionButton}
                    variant={selectedActionType === actionKind ? 'active' : 'solid'}
                    onClick={() => onChooseAction(actionKind)}
                  >
                    {actionLabel(language, actionKind)}
                  </Button>
                  <GlossaryTooltip compact={isCompactViewport} language={language} termId={actionKind} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
