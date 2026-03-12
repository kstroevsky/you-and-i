import { lazy, Suspense, useEffect, useEffectEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/app/providers/GameStoreProvider';

const loadMoveInputModal = () => import('./MoveInputModal');
const MoveInputModal = lazy(() => loadMoveInputModal().then((module) => ({ default: module.MoveInputModal })));

export function preloadMoveInputModal(): void {
  void loadMoveInputModal();
}

export function MoveInputPanel() {
  const {
    availableActionKinds,
    selectedActionType,
    selectedCell,
    onCancel,
  } = useGameStore(
    useShallow((state) => ({
      availableActionKinds: state.availableActionKinds,
      selectedActionType: state.selectedActionType,
      selectedCell: state.selectedCell,
      onCancel: state.cancelInteraction,
    })),
  );

  const isChoiceModalOpen =
    selectedCell !== null && selectedActionType === null && availableActionKinds.length > 0;
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onCancel();
    }
  });

  useEffect(() => {
    if (!isChoiceModalOpen) {
      return undefined;
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, isChoiceModalOpen]);

  return (
    <Suspense fallback={null}>
      {isChoiceModalOpen ? <MoveInputModal /> : null}
    </Suspense>
  );
}
