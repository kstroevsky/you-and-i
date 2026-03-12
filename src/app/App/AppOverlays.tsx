import { lazy, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { preloadMoveInputModal } from '@/ui/panels/MoveInputPanel';
import { preloadGlossaryTooltipDialog } from '@/ui/tooltips/GlossaryTooltip';

const loadGameResultModal = () =>
  import('@/app/components/GameResultModal/GameResultModal').then((module) => ({
    default: module.GameResultModal,
  }));
const loadTurnOverlay = () =>
  import('@/app/components/TurnOverlay/TurnOverlay').then((module) => ({
    default: module.TurnOverlay,
  }));

const GameResultModal = lazy(loadGameResultModal);
const TurnOverlay = lazy(loadTurnOverlay);

export function preloadAppOverlays(): void {
  void loadGameResultModal();
  void loadTurnOverlay();
  preloadMoveInputModal();
  preloadGlossaryTooltipDialog();
}

export function AppOverlays() {
  const { showGameResult, showTurnOverlay } = useGameStore(
    useShallow((state) => ({
      showGameResult: state.gameState.status === 'gameOver',
      showTurnOverlay:
        state.matchSettings.opponentMode !== 'computer' &&
        (state.interaction.type === 'passingDevice' || state.interaction.type === 'turnResolved'),
    })),
  );

  if (!showGameResult && !showTurnOverlay) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      {showTurnOverlay ? <TurnOverlay /> : null}
      {showGameResult ? <GameResultModal /> : null}
    </Suspense>
  );
}
