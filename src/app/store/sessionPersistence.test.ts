import { describe, expect, it } from 'vitest';

import { createGameStore } from '@/app/store/createGameStore';
import { createCompactSession, LOCAL_HISTORY_WINDOW } from '@/app/store/sessionPersistence';
import { applyAction, createInitialState, getLegalActions } from '@/domain';
import { createSession, undoFrame, withConfig } from '@/test/factories';

function createHistorySession(turnCount: number, historyCursor = turnCount) {
  const config = withConfig();
  const states = [createInitialState(config)];

  for (let index = 0; index < turnCount; index += 1) {
    const previous = states.at(-1);

    if (!previous) {
      break;
    }

    const action = getLegalActions(previous, config)[0];

    if (!action) {
      break;
    }

    states.push(applyAction(previous, action, config));
  }

  const liveState = states.at(-1) ?? createInitialState(config);
  const presentState = states[historyCursor] ?? liveState;

  return {
    session: createSession(liveState, {
      future: states.slice(historyCursor + 1).map(undoFrame),
      past: states.slice(0, historyCursor).map(undoFrame),
      present: undoFrame(presentState),
      turnLog: liveState.history,
    }),
  };
}

describe('sessionPersistence', () => {
  it('keeps a trailing local undo window at the live tip', () => {
    const { session } = createHistorySession(LOCAL_HISTORY_WINDOW + 3);
    const compact = createCompactSession(session, LOCAL_HISTORY_WINDOW);
    const store = createGameStore({
      initialSession: compact,
      storage: undefined,
    });

    expect(compact.turnLog).toHaveLength(LOCAL_HISTORY_WINDOW);
    expect(compact.present.historyCursor).toBe(LOCAL_HISTORY_WINDOW);
    expect(compact.past).toHaveLength(LOCAL_HISTORY_WINDOW);
    expect(compact.future).toHaveLength(0);

    store.getState().undo();
    expect(store.getState().historyCursor).toBe(LOCAL_HISTORY_WINDOW - 1);

    store.getState().redo();
    expect(store.getState().historyCursor).toBe(LOCAL_HISTORY_WINDOW);
  });

  it('re-bases a centered local history window around a rewound cursor', () => {
    const { session } = createHistorySession(LOCAL_HISTORY_WINDOW + 5, 10);
    const compact = createCompactSession(session, LOCAL_HISTORY_WINDOW);
    const store = createGameStore({
      initialSession: compact,
      storage: undefined,
    });

    expect(compact.turnLog).toHaveLength(LOCAL_HISTORY_WINDOW);
    expect(compact.present.historyCursor).toBe(7);
    expect(compact.past).toHaveLength(7);
    expect(compact.future).toHaveLength(8);
    expect(store.getState().historyCursor).toBe(7);

    store.getState().undo();
    expect(store.getState().historyCursor).toBe(6);

    store.getState().redo();
    expect(store.getState().historyCursor).toBe(7);
  });
});
