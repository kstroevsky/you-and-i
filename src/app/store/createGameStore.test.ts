import { beforeEach, describe, expect, it } from 'vitest';

import { createGameStore } from '@/app/store/createGameStore';
import { applyAction, createInitialState, getLegalActions } from '@/domain';
import {
  boardWithPieces,
  checker,
  createSession,
  gameStateWithBoard,
  resetFactoryIds,
  undoFrame,
  withConfig,
} from '@/test/factories';

describe('createGameStore', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  it('keeps export JSON stale until explicitly refreshed', () => {
    const store = createGameStore({
      initialSession: createSession(createInitialState()),
      storage: undefined,
    });

    expect(store.getState().exportBuffer).toBe('');

    store.getState().refreshExportBuffer();
    const initialExport = store.getState().exportBuffer;

    expect(initialExport).toContain('\n');
    expect(initialExport).toContain('"version": 2');

    store.getState().setImportBuffer('{"draft": true}');
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().setPreference({ language: 'english' });
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().selectCell('A1');
    store.getState().chooseActionType('climbOne');
    store.getState().selectCell('B2');
    store.getState().acknowledgePassScreen();
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().undo();
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().redo();
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().refreshExportBuffer();

    expect(store.getState().exportBuffer).not.toBe(initialExport);
  });

  it('restores undo and redo from shared turn-log frames', () => {
    const config = withConfig();
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const state2 = applyAction(state1, getLegalActions(state1, config)[0], config);
    const store = createGameStore({
      initialSession: createSession(state2, {
        turnLog: state2.history,
        past: [undoFrame(state0), undoFrame(state1)],
      }),
      storage: undefined,
    });

    expect(store.getState().historyCursor).toBe(2);
    expect(store.getState().gameState.history).toHaveLength(2);

    store.getState().undo();

    expect(store.getState().historyCursor).toBe(1);
    expect(store.getState().gameState.history).toHaveLength(1);
    expect(store.getState().gameState.positionCounts).toEqual(state1.positionCounts);

    store.getState().redo();

    expect(store.getState().historyCursor).toBe(2);
    expect(store.getState().gameState.history).toHaveLength(2);
    expect(store.getState().gameState.positionCounts).toEqual(state2.positionCounts);
  });

  it('shows single-step move targets and commits moveSingleToEmpty from store flow', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('B2');

    expect(store.getState().availableActionKinds).toContain('moveSingleToEmpty');

    store.getState().chooseActionType('moveSingleToEmpty');

    expect(store.getState().legalTargets).toContain('A1');

    store.getState().selectCell('A1');

    expect(store.getState().gameState.history).toHaveLength(1);
    expect(store.getState().gameState.history[0].action).toEqual({
      type: 'moveSingleToEmpty',
      source: 'B2',
      target: 'A1',
    });
  });

  it('moves full controlled stack with moveSingleToEmpty', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        C3: [checker('white'), checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('C3');

    expect(store.getState().availableActionKinds).toContain('moveSingleToEmpty');

    store.getState().chooseActionType('moveSingleToEmpty');
    store.getState().selectCell('D4');

    expect(store.getState().gameState.board.C3.checkers).toHaveLength(0);
    expect(store.getState().gameState.board.D4.checkers).toHaveLength(2);
  });

  it('keeps jump-chain selection active on non-target clicks and commits stack jump', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white'), checker('white')],
        C3: [checker('black')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('B2');
    store.getState().chooseActionType('jumpSequence');

    expect(store.getState().legalTargets).toContain('D4');

    store.getState().selectCell('A1');

    expect(store.getState().selectedCell).toBe('B2');
    expect(store.getState().selectedActionType).toBe('jumpSequence');
    expect(store.getState().interaction.type).toBe('buildingJumpChain');

    store.getState().selectCell('D4');

    expect(store.getState().gameState.history).toHaveLength(1);
    expect(store.getState().gameState.history[0].action).toEqual({
      type: 'jumpSequence',
      source: 'B2',
      path: ['D4'],
    });
  });

  it('commits each jump segment immediately and keeps forced continuation selected', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('C3');

    expect(store.getState().gameState.history).toHaveLength(1);
    expect(store.getState().gameState.history[0].action).toEqual({
      type: 'jumpSequence',
      source: 'A1',
      path: ['C3'],
    });
    expect(store.getState().gameState.currentPlayer).toBe('white');
    expect(store.getState().selectedCell).toBe('C3');
    expect(store.getState().selectedActionType).toBe('jumpSequence');
    expect(store.getState().legalTargets).toEqual(['A1', 'E5']);

    store.getState().selectCell('E5');

    expect(store.getState().gameState.history).toHaveLength(2);
    expect(store.getState().gameState.history[1].action).toEqual({
      type: 'jumpSequence',
      source: 'C3',
      path: ['E5'],
    });
  });

  it('prevents clearing forced jump continuation before the next segment', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('C3');

    store.getState().cancelInteraction();

    expect(store.getState().selectedCell).toBe('C3');
    expect(store.getState().selectedActionType).toBe('jumpSequence');
    expect(store.getState().legalTargets).toEqual(['A1', 'E5']);
    expect(store.getState().gameState.currentPlayer).toBe('white');
  });
});
