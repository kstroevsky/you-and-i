import { createStore } from 'zustand/vanilla';

import {
  AI_DIFFICULTY_PRESETS,
  type AiSearchResult,
  type AiWorkerRequest,
  type AiWorkerResponse,
} from '@/ai';
import {
  applyAction,
  buildTargetMap,
  checkVictory,
  createEmptyTargetMap,
  createInitialState,
  createUndoFrame,
  deserializeSession,
  getJumpContinuationTargets,
  getLegalActionsForCell,
  getScoreSummary,
  restoreGameState,
  serializeSession,
  withRuleDefaults,
} from '@/domain';
import type {
  ActionKind,
  Coord,
  GameState,
  RuleConfig,
  ScoreSummary,
  TargetMap,
  TurnAction,
  TurnRecord,
} from '@/domain';
import { DEFAULT_MATCH_SETTINGS } from '@/shared/constants/match';
import { hashPosition } from '@/domain/model/hash';
import { LEGACY_SESSION_STORAGE_KEYS, SESSION_STORAGE_KEY } from '@/shared/constants/storage';
import type {
  AppPreferences,
  InteractionState,
  MatchSettings,
  SerializableSession,
  UndoFrame,
} from '@/shared/types/session';
import { uniqueValues } from '@/shared/utils/collections';
import { createIndexedDbSessionArchive, type SessionArchive } from '@/app/store/sessionArchive';
import {
  createCompactSession,
  createPersistedSessionEnvelope,
  deserializePersistedSessionEnvelope,
  LOCAL_HISTORY_WINDOW,
  serializePersistedSessionEnvelope,
} from '@/app/store/sessionPersistence';

type AiStatus = 'idle' | 'thinking' | 'error';
export type HistoryHydrationStatus = 'hydrating' | 'recentOnly' | 'full';

type AiWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<AiWorkerResponse>) => void) | null;
  postMessage: (message: AiWorkerRequest) => void;
  terminate: () => void;
};

type GameStoreData = {
  aiError: string | null;
  aiStatus: AiStatus;
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  matchSettings: MatchSettings;
  setupMatchSettings: MatchSettings;
  gameState: GameState;
  turnLog: TurnRecord[];
  past: UndoFrame[];
  future: UndoFrame[];
  selectedCell: Coord | null;
  selectedActionType: ActionKind | null;
  selectedTargetMap: TargetMap;
  availableActionKinds: ActionKind[];
  draftJumpPath: Coord[];
  legalTargets: Coord[];
  selectableCoords: Coord[];
  scoreSummary: ScoreSummary | null;
  interaction: InteractionState;
  historyCursor: number;
  historyHydrationStatus: HistoryHydrationStatus;
  importBuffer: string;
  importError: string | null;
  lastAiDecision: AiSearchResult | null;
  pendingAiRequestId: number | null;
  exportBuffer: string;
};

export type GameStoreState = GameStoreData & {
  acknowledgePassScreen: () => void;
  cancelInteraction: () => void;
  chooseActionType: (actionType: ActionKind) => void;
  goToHistoryCursor: (targetCursor: number) => void;
  importSessionFromBuffer: () => void;
  redo: () => void;
  refreshExportBuffer: () => void;
  retryComputerMove: () => void;
  restart: () => void;
  selectCell: (coord: Coord) => void;
  setImportBuffer: (value: string) => void;
  setSetupMatchSettings: (partial: Partial<MatchSettings>) => void;
  setPreference: (partial: Partial<AppPreferences>) => void;
  setRuleConfig: (partial: Partial<RuleConfig>) => void;
  startNewGame: (matchSettings?: MatchSettings) => void;
  undo: () => void;
};

export type GameStore = ReturnType<typeof createGameStore>;

const DEFAULT_PREFERENCES: AppPreferences = {
  passDeviceOverlayEnabled: true,
  language: 'russian',
};

const LEGACY_RULE_DEFAULTS: RuleConfig = {
  allowNonAdjacentFriendlyStackTransfer: true,
  drawRule: 'threefold',
  scoringMode: 'basic',
};
const AI_WATCHDOG_BUFFER_MS = 250;

type StoreOptions = {
  archive?: SessionArchive | null;
  createAiWorker?: () => AiWorkerLike | null;
  createSessionId?: () => string;
  initialSession?: SerializableSession;
  storage?: Storage;
};

type SessionSlices = Pick<
  GameStoreData,
  'ruleConfig' | 'preferences' | 'matchSettings' | 'gameState' | 'turnLog' | 'past' | 'future'
>;

type InitialPersistenceState = {
  historyHydrationStatus: HistoryHydrationStatus;
  needsPersistenceSync: boolean;
  revision: number;
  session: SerializableSession;
  sessionId: string;
  startupHydrationMode: 'compact' | 'default' | null;
};

/** Returns stable rule-config cache key used for store-side derivation memoization. */
function ruleConfigKey(config: RuleConfig): string {
  return [
    config.allowNonAdjacentFriendlyStackTransfer ? '1' : '0',
    config.drawRule,
    config.scoringMode,
  ].join(':');
}

function isComputerMatch(matchSettings: MatchSettings): boolean {
  return matchSettings.opponentMode === 'computer';
}

function getRuleConfigForNewMatch(
  ruleConfig: RuleConfig,
  matchSettings: MatchSettings,
): RuleConfig {
  if (!isComputerMatch(matchSettings) || ruleConfig.drawRule !== 'none') {
    return ruleConfig;
  }

  return {
    ...ruleConfig,
    drawRule: 'threefold',
  };
}

function isComputerTurn(gameState: GameState, matchSettings: MatchSettings): boolean {
  return isComputerMatch(matchSettings) && gameState.currentPlayer !== matchSettings.humanPlayer;
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Builds serializable session payload from store slices. */
function buildSession(
  ruleConfig: RuleConfig,
  preferences: AppPreferences,
  matchSettings: MatchSettings,
  present: GameState,
  turnLog: TurnRecord[],
  past: UndoFrame[],
  future: UndoFrame[],
): SerializableSession {
  return {
    version: 3,
    ruleConfig,
    preferences,
    matchSettings,
    turnLog,
    present: createUndoFrame(present),
    past,
    future,
  };
}

/** Persists session into browser storage when available. */
function clearLegacySessionKeys(storage?: Storage): void {
  if (!storage) {
    return;
  }

  for (const legacyKey of LEGACY_SESSION_STORAGE_KEYS) {
    storage.removeItem(legacyKey);
  }
}

/** Writes the compact local snapshot and never lets storage failures escape the store. */
function persistSession(
  session: SerializableSession,
  sessionId: string,
  revision: number,
  storage?: Storage,
): boolean {
  if (!storage) {
    return true;
  }

  const serialized = serializePersistedSessionEnvelope(
    createPersistedSessionEnvelope(
      'compact',
      sessionId,
      revision,
      createCompactSession(session, LOCAL_HISTORY_WINDOW),
    ),
  );

  clearLegacySessionKeys(storage);

  try {
    storage.setItem(SESSION_STORAGE_KEY, serialized);
    return true;
  } catch {
    storage.removeItem(SESSION_STORAGE_KEY);

    try {
      storage.setItem(SESSION_STORAGE_KEY, serialized);
      return true;
    } catch {
      storage.removeItem(SESSION_STORAGE_KEY);
      return false;
    }
  }
}

/** Detects the former default rule set persisted before default-policy change. */
function hasLegacyRuleDefaults(ruleConfig: RuleConfig): boolean {
  return (
    ruleConfig.allowNonAdjacentFriendlyStackTransfer ===
      LEGACY_RULE_DEFAULTS.allowNonAdjacentFriendlyStackTransfer &&
    ruleConfig.drawRule === LEGACY_RULE_DEFAULTS.drawRule &&
    ruleConfig.scoringMode === LEGACY_RULE_DEFAULTS.scoringMode
  );
}

/** Limits auto-migration to untouched sessions to avoid overriding active games. */
function isUntouchedSession(session: SerializableSession): boolean {
  return (
    session.turnLog.length === 0 &&
    session.past.length === 0 &&
    session.future.length === 0 &&
    session.present.historyCursor === 0
  );
}

/** Applies new rule defaults to stale untouched sessions saved with legacy defaults. */
function migrateLegacyRuleDefaults(
  session: SerializableSession,
): { session: SerializableSession; migrated: boolean } {
  if (!hasLegacyRuleDefaults(session.ruleConfig) || !isUntouchedSession(session)) {
    return { session, migrated: false };
  }

  return {
    session: {
      ...session,
      ruleConfig: withRuleDefaults(),
    },
    migrated: true,
  };
}

/** Loads session from browser storage and drops corrupted payloads. */
/** Returns fresh default session for first launch or reset fallback. */
function getDefaultSession(): SerializableSession {
  const ruleConfig = withRuleDefaults();
  const present = createInitialState(ruleConfig);

  return buildSession(ruleConfig, DEFAULT_PREFERENCES, DEFAULT_MATCH_SETTINGS, present, [], [], []);
}

/** Resolves the best synchronous boot state before async IndexedDB hydration continues. */
function getInitialPersistenceState(options: StoreOptions): InitialPersistenceState {
  const createId = options.createSessionId ?? createSessionId;
  const archiveAvailable = options.archive !== null && options.archive !== undefined;

  if (options.initialSession) {
    return {
      historyHydrationStatus: 'full',
      needsPersistenceSync: false,
      revision: 0,
      session: options.initialSession,
      sessionId: createId(),
      startupHydrationMode: null,
    };
  }

  if (options.storage) {
    const candidateKeys = [SESSION_STORAGE_KEY, ...LEGACY_SESSION_STORAGE_KEYS];

    for (const storageKey of candidateKeys) {
      const serialized = options.storage.getItem(storageKey);

      if (!serialized) {
        continue;
      }

      try {
        if (storageKey === SESSION_STORAGE_KEY) {
          const envelope = deserializePersistedSessionEnvelope(serialized);
          const { session, migrated } = migrateLegacyRuleDefaults(envelope.session);

          return {
            historyHydrationStatus: archiveAvailable ? 'hydrating' : 'recentOnly',
            needsPersistenceSync: migrated,
            revision: envelope.revision,
            session,
            sessionId: envelope.sessionId,
            startupHydrationMode: archiveAvailable ? 'compact' : null,
          };
        }

        const deserialized = deserializeSession(serialized);
        const { session } = migrateLegacyRuleDefaults(deserialized);

        return {
          historyHydrationStatus: 'full',
          needsPersistenceSync: true,
          revision: 0,
          session,
          sessionId: createId(),
          startupHydrationMode: null,
        };
      } catch {
        options.storage.removeItem(storageKey);
      }
    }
  }

  return {
    historyHydrationStatus: archiveAvailable ? 'hydrating' : 'full',
    needsPersistenceSync: false,
    revision: 0,
    session: getDefaultSession(),
    sessionId: createId(),
    startupHydrationMode: archiveAvailable ? 'default' : null,
  };
}

/** Rehydrates runtime game state and store slices from one serialized session. */
function createRuntimeState(session: SerializableSession): Pick<
  GameStoreData,
  | 'ruleConfig'
  | 'preferences'
  | 'matchSettings'
  | 'setupMatchSettings'
  | 'gameState'
  | 'turnLog'
  | 'past'
  | 'future'
  | 'historyCursor'
> {
  const turnLog = session.turnLog.slice();
  const gameState = restoreGameState(session.present, turnLog);

  return {
    ruleConfig: session.ruleConfig,
    preferences: session.preferences,
    matchSettings: session.matchSettings,
    setupMatchSettings: session.matchSettings,
    gameState,
    turnLog,
    past: session.past.slice(),
    future: session.future.slice(),
    historyCursor: session.present.historyCursor,
  };
}

/** Creates selection/interaction slice in one place to keep updates consistent. */
function createSelectionState(
  source: Coord | null,
  actionType: ActionKind | null,
  interaction: InteractionState,
  options: {
    legalTargets?: Coord[];
    draftJumpPath?: Coord[];
    availableActionKinds?: ActionKind[];
    selectedTargetMap?: TargetMap;
  } = {},
): Pick<
  GameStoreData,
  | 'selectedCell'
  | 'selectedActionType'
  | 'selectedTargetMap'
  | 'availableActionKinds'
  | 'interaction'
  | 'legalTargets'
  | 'draftJumpPath'
> {
  return {
    selectedCell: source,
    selectedActionType: actionType,
    selectedTargetMap: options.selectedTargetMap ?? createEmptyTargetMap(),
    availableActionKinds: options.availableActionKinds ?? [],
    interaction,
    legalTargets: options.legalTargets ?? [],
    draftJumpPath: options.draftJumpPath ?? [],
  };
}

/** Resets interaction state to neutral mode for current game status. */
function createIdleSelection(gameState: GameState): Pick<
  GameStoreData,
  | 'selectedCell'
  | 'selectedActionType'
  | 'selectedTargetMap'
  | 'availableActionKinds'
  | 'interaction'
  | 'legalTargets'
  | 'draftJumpPath'
> {
  return createSelectionState(
    null,
    null,
    gameState.status === 'gameOver' ? { type: 'gameOver' } : { type: 'idle' },
  );
}

/** Creates jump-only action buckets for forced continuation UI states. */
function createJumpOnlyTargetMap(targets: Coord[]): TargetMap {
  const targetMap = createEmptyTargetMap();
  targetMap.jumpSequence = targets.slice();
  return targetMap;
}

type JumpContinuationSelection = {
  source: Coord;
  targets: Coord[];
};

/** Detects whether the active player must continue a jump chain from the latest landing. */
function getJumpContinuationSelection(gameState: GameState): JumpContinuationSelection | null {
  if (gameState.status === 'gameOver' || !gameState.pendingJump) {
    return null;
  }
  const targets = uniqueValues(getJumpContinuationTargets(gameState, gameState.pendingJump.source, []));

  if (!targets.length) {
    return null;
  }

  return {
    source: gameState.pendingJump.source,
    targets,
  };
}

/** Creates zustand store orchestrating UI interaction state and pure domain engine. */
export function createGameStore(options: StoreOptions = {}) {
  const storage =
    options.storage ??
    (typeof window !== 'undefined' ? window.localStorage : undefined);
  const archive =
    options.archive ??
    (typeof window !== 'undefined' ? createIndexedDbSessionArchive() : null);
  const initialPersistence = getInitialPersistenceState({
    ...options,
    archive,
    storage,
  });
  const initialSession = initialPersistence.session;
  const initialRuntimeState = createRuntimeState(initialSession);

  let boardDerivationCache:
    | {
        key: string;
        selectableCoords: Coord[];
        scoreSummary: ScoreSummary | null;
      }
    | null = null;
  let cellDerivationCache:
    | {
        key: string;
        availableActionKinds: ActionKind[];
        selectedTargetMap: TargetMap;
      }
    | null = null;

  /** Computes board-level derived data once per position/config pair. */
  function getBoardDerivation(
    gameState: GameState,
    ruleConfig: RuleConfig,
  ): Pick<GameStoreData, 'selectableCoords' | 'scoreSummary'> {
    const key = `${hashPosition(gameState)}::${gameState.status}::${ruleConfigKey(ruleConfig)}`;

    if (boardDerivationCache?.key === key) {
      return boardDerivationCache;
    }

    const selectableCoords =
      gameState.status === 'gameOver'
        ? []
        : Object.keys(gameState.board).filter((coord) =>
            getLegalActionsForCell(gameState, coord as Coord, ruleConfig).length > 0,
          ) as Coord[];
    const scoreSummary = ruleConfig.scoringMode === 'basic' ? getScoreSummary(gameState) : null;

    boardDerivationCache = {
      key,
      selectableCoords,
      scoreSummary,
    };

    return boardDerivationCache;
  }

  /** Computes selected-cell actions once per position/config/cell triple. */
  function getCellDerivation(
    gameState: GameState,
    coord: Coord,
    ruleConfig: RuleConfig,
  ): Pick<GameStoreData, 'availableActionKinds' | 'selectedTargetMap'> {
    const key = `${hashPosition(gameState)}::${gameState.status}::${ruleConfigKey(ruleConfig)}::${coord}`;

    if (cellDerivationCache?.key === key) {
      return cellDerivationCache;
    }

    const actions = getLegalActionsForCell(gameState, coord, ruleConfig);
    const availableActionKinds = uniqueValues(actions.map((action) => action.type));
    const targetMap = buildTargetMap(actions);

    cellDerivationCache = {
      key,
      availableActionKinds,
      selectedTargetMap: targetMap,
    };

    return cellDerivationCache;
  }

  const initialBoardDerivation = getBoardDerivation(
    initialRuntimeState.gameState,
    initialRuntimeState.ruleConfig,
  );
  const initialJumpContinuation = getJumpContinuationSelection(initialRuntimeState.gameState);
  const initialInteraction: InteractionState = initialJumpContinuation
    ? {
        type: 'buildingJumpChain',
        source: initialJumpContinuation.source,
        path: [],
        availableTargets: initialJumpContinuation.targets,
      }
    : initialRuntimeState.gameState.status === 'gameOver'
      ? { type: 'gameOver' }
      : { type: 'idle' };

  let persistInitialState: (() => void) | null = null;
  let startArchiveHydration: (() => void) | null = null;

  const store = createStore<GameStoreState>((set, get) => {
    let aiWorker: AiWorkerLike | null = null;
    let aiWatchdogId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let nextAiRequestId = 1;
    let activeSessionId = initialPersistence.sessionId;
    let activeRevision = initialPersistence.revision;
    let historyHydrationStatus = initialPersistence.historyHydrationStatus;
    let startupHydrationMode = initialPersistence.startupHydrationMode;
    let archiveWriteQueue = Promise.resolve();
    let archiveWritesEnabled = startupHydrationMode !== 'compact';
    let hydrationToken = 0;
    let localPersistenceEnabled = true;

    function getTurnSpans(turnLog: TurnRecord[], historyCursor: number): Array<{
      actor: TurnRecord['actor'];
      end: number;
      start: number;
    }> {
      const spans: Array<{ actor: TurnRecord['actor']; end: number; start: number }> = [];

      for (let index = 0; index < historyCursor; index += 1) {
        const record = turnLog[index];
        const currentSpan = spans.at(-1);

        if (!currentSpan || currentSpan.actor !== record.actor) {
          spans.push({
            actor: record.actor,
            end: index + 1,
            start: index,
          });
          continue;
        }

        currentSpan.end = index + 1;
      }

      return spans;
    }

    function getComputerUndoTarget(state: GameStoreState): number {
      const spans = getTurnSpans(state.turnLog, state.historyCursor);
      const lastSpan = spans.at(-1);

      if (!lastSpan) {
        return state.historyCursor;
      }

      if (
        isComputerTurn(state.gameState, state.matchSettings) &&
        (state.aiStatus === 'thinking' || state.aiStatus === 'error')
      ) {
        return lastSpan.start;
      }

      if (lastSpan.actor !== state.matchSettings.humanPlayer) {
        const previousHumanSpan = [...spans]
          .reverse()
          .find((span) => span.actor === state.matchSettings.humanPlayer && span.start < lastSpan.start);

        return previousHumanSpan?.start ?? lastSpan.start;
      }

      return lastSpan.start;
    }

    function buildSessionFromState(nextState: SessionSlices): SerializableSession {
      return buildSession(
        nextState.ruleConfig,
        nextState.preferences,
        nextState.matchSettings,
        nextState.gameState,
        nextState.turnLog,
        nextState.past,
        nextState.future,
      );
    }

    function consumeStartupHydrationOnMutation(): HistoryHydrationStatus {
      if (startupHydrationMode === null) {
        return historyHydrationStatus;
      }

      hydrationToken += 1;

      if (startupHydrationMode === 'compact') {
        historyHydrationStatus = 'recentOnly';
        archiveWritesEnabled = false;
      } else {
        historyHydrationStatus = 'full';
        archiveWritesEnabled = true;
      }

      startupHydrationMode = null;

      return historyHydrationStatus;
    }

    function beginFreshFullSession(): HistoryHydrationStatus {
      hydrationToken += 1;
      startupHydrationMode = null;
      activeSessionId = (options.createSessionId ?? createSessionId)();
      activeRevision = 0;
      historyHydrationStatus = 'full';
      archiveWritesEnabled = true;

      return historyHydrationStatus;
    }

    function queueArchiveWrite(session: SerializableSession, revision: number): void {
      if (!archive || !archiveWritesEnabled) {
        return;
      }

      const envelope = createPersistedSessionEnvelope('full', activeSessionId, revision, session);

      archiveWriteQueue = archiveWriteQueue
        .catch(() => undefined)
        .then(async () => {
          try {
            await archive.saveLatest(envelope);
          } catch {
            if (
              activeSessionId === envelope.sessionId &&
              activeRevision === envelope.revision
            ) {
              archiveWritesEnabled = false;
            }
          }
        });
    }

    function persistRuntimeSession(
      session: SerializableSession,
      options: {
        incrementRevision?: boolean;
        persistArchive?: boolean;
      } = {},
    ): void {
      const nextRevision =
        options.incrementRevision === false ? activeRevision : activeRevision + 1;

      activeRevision = nextRevision;

      if (localPersistenceEnabled) {
        localPersistenceEnabled = persistSession(session, activeSessionId, nextRevision, storage);
      }

      if (options.persistArchive !== false) {
        queueArchiveWrite(session, nextRevision);
      }
    }

    function clearAiWatchdog(): void {
      if (aiWatchdogId === null) {
        return;
      }

      globalThis.clearTimeout(aiWatchdogId);
      aiWatchdogId = null;
    }

    function disposeAiWorker(): void {
      clearAiWatchdog();

      if (!aiWorker) {
        return;
      }

      aiWorker.onmessage = null;
      aiWorker.onerror = null;
      aiWorker.terminate();
      aiWorker = null;
    }

    function handleAiWatchdogTimeout(requestId: number): void {
      aiWatchdogId = null;

      const latest = get();

      if (latest.pendingAiRequestId !== requestId) {
        return;
      }

      disposeAiWorker();
      set({
        aiError: 'Computer move timed out.',
        aiStatus: 'error',
        pendingAiRequestId: null,
      });
    }

    function scheduleAiWatchdog(requestId: number, matchSettings: MatchSettings): void {
      clearAiWatchdog();

      if (!isComputerMatch(matchSettings)) {
        return;
      }

      aiWatchdogId = globalThis.setTimeout(
        () => handleAiWatchdogTimeout(requestId),
        AI_DIFFICULTY_PRESETS[matchSettings.aiDifficulty].timeBudgetMs + AI_WATCHDOG_BUFFER_MS,
      );
    }

    function getAiWorker(): AiWorkerLike | null {
      if (aiWorker) {
        return aiWorker;
      }

      const workerFactory =
        options.createAiWorker ??
        (() => {
          if (typeof Worker === 'undefined') {
            return null;
          }

          return new Worker(
            new URL('../../ai/worker/ai.worker.ts', import.meta.url),
            { type: 'module' },
          ) as AiWorkerLike;
        });

      aiWorker = workerFactory();

      if (!aiWorker) {
        return null;
      }

      aiWorker.onmessage = (event) => {
        const message = event.data;
        const latest = get();

        if (message.requestId !== latest.pendingAiRequestId) {
          return;
        }

        clearAiWatchdog();

        if (message.type === 'error') {
          set({
            aiError: message.message,
            aiStatus: 'error',
            pendingAiRequestId: null,
          });
          return;
        }

        if (!message.result.action) {
          set({
            aiError: null,
            aiStatus: 'idle',
            lastAiDecision: message.result,
            pendingAiRequestId: null,
          });
          return;
        }

        commitAction(message.result.action, message.result);
      };
      aiWorker.onerror = (event) => {
        clearAiWatchdog();
        set({
          aiError: event.message || 'Computer move failed.',
          aiStatus: 'error',
          pendingAiRequestId: null,
        });
      };

      return aiWorker;
    }

    function syncComputerTurn(): void {
      const state = get();

      if (
        !isComputerTurn(state.gameState, state.matchSettings) ||
        state.gameState.status !== 'active' ||
        state.historyCursor !== state.turnLog.length ||
        state.future.length > 0
      ) {
        if (state.pendingAiRequestId !== null) {
          disposeAiWorker();
          set({
            aiStatus: state.aiStatus === 'error' ? 'error' : 'idle',
            pendingAiRequestId: null,
          });
        }
        return;
      }

      if (state.pendingAiRequestId !== null || state.aiStatus === 'thinking') {
        return;
      }

      const worker = getAiWorker();

      if (!worker) {
        set({
          aiError: 'Computer worker is unavailable.',
          aiStatus: 'error',
          pendingAiRequestId: null,
        });
        return;
      }

      const requestId = nextAiRequestId;
      nextAiRequestId += 1;

      set({
        aiError: null,
        aiStatus: 'thinking',
        pendingAiRequestId: requestId,
      });
      scheduleAiWatchdog(requestId, state.matchSettings);
      worker.postMessage({
        type: 'chooseMove',
        requestId,
        ruleConfig: state.ruleConfig,
        state: state.gameState,
        matchSettings: state.matchSettings,
      });
    }

    function resetAiState(status: AiStatus = 'idle'): Pick<
      GameStoreData,
      'aiError' | 'aiStatus' | 'pendingAiRequestId'
    > {
      return {
        aiError: null,
        aiStatus: status,
        pendingAiRequestId: null,
      };
    }

    /** Persists current core session slices after state transitions. */
    function persistCurrentState(nextState: SessionSlices): void {
      persistRuntimeSession(buildSessionFromState(nextState), {
        persistArchive: archiveWritesEnabled,
      });
    }

    /** Commits one validated turn action through the domain reducer and updates app-level flow state. */
    function commitAction(action: TurnAction, aiDecision: AiSearchResult | null = null): void {
      const state = get();
      const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
      const nextGameState = applyAction(state.gameState, action, state.ruleConfig);
      const nextTurnLog = nextGameState.history;
      const nextPast = [...state.past, createUndoFrame(state.gameState)];
      const nextFuture: UndoFrame[] = [];
      const jumpContinuation = getJumpContinuationSelection(nextGameState);
      const computerMatch = isComputerMatch(state.matchSettings);
      const nextInteraction: InteractionState = jumpContinuation
        ? {
            type: 'buildingJumpChain',
            source: jumpContinuation.source,
            path: [],
            availableTargets: jumpContinuation.targets,
          }
        : nextGameState.status === 'gameOver'
          ? { type: 'gameOver' }
          : computerMatch
            ? { type: 'idle' }
          : state.preferences.passDeviceOverlayEnabled
            ? { type: 'passingDevice', nextPlayer: nextGameState.currentPlayer }
            : { type: 'turnResolved', nextPlayer: nextGameState.currentPlayer };
      const nextBoardDerivation = getBoardDerivation(nextGameState, state.ruleConfig);
      const nextData = {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        matchSettings: state.matchSettings,
        gameState: nextGameState,
        turnLog: nextTurnLog,
        past: nextPast,
        future: nextFuture,
        historyCursor: nextGameState.history.length,
        ...nextBoardDerivation,
      };

      set({
        ...nextData,
        historyHydrationStatus: nextHistoryHydrationStatus,
        ...(jumpContinuation
          ? createSelectionState(
              jumpContinuation.source,
              'jumpSequence',
              nextInteraction,
              {
                legalTargets: jumpContinuation.targets,
                draftJumpPath: [],
                availableActionKinds: ['jumpSequence'],
                selectedTargetMap: createJumpOnlyTargetMap(jumpContinuation.targets),
              },
            )
          : createSelectionState(null, null, nextInteraction)),
        ...resetAiState(),
        importError: null,
        lastAiDecision: aiDecision ?? state.lastAiDecision,
      });
      persistCurrentState(nextData);
      syncComputerTurn();

      // Skip pass overlay by briefly entering turnResolved and then immediately returning to idle.
      if (
        !state.preferences.passDeviceOverlayEnabled &&
        nextGameState.status !== 'gameOver' &&
        !isComputerTurn(nextGameState, state.matchSettings)
      ) {
        queueMicrotask(() => {
          const latest = get();

          if (latest.interaction.type === 'turnResolved') {
            set({
              interaction: { type: 'idle' },
            });
          }
        });
      }
    }

    /** Replaces entire store session (used by import and initialization paths). */
    function applySession(
      session: SerializableSession,
      options: {
        historyHydrationStatus?: HistoryHydrationStatus;
        persist?: boolean;
        revision?: number;
        sessionId?: string;
      } = {},
    ): void {
      disposeAiWorker();
      startupHydrationMode = null;

      if (options.sessionId) {
        activeSessionId = options.sessionId;
      }
      if (typeof options.revision === 'number') {
        activeRevision = options.revision;
      }

      archiveWritesEnabled = true;
      historyHydrationStatus = options.historyHydrationStatus ?? 'full';

      const runtimeState = createRuntimeState(session);
      const nextBoardDerivation = getBoardDerivation(runtimeState.gameState, runtimeState.ruleConfig);
      const jumpContinuation = getJumpContinuationSelection(runtimeState.gameState);

      set((current) => ({
        ...runtimeState,
        ...nextBoardDerivation,
        ...(jumpContinuation
          ? createSelectionState(
              jumpContinuation.source,
              'jumpSequence',
              {
                type: 'buildingJumpChain',
                source: jumpContinuation.source,
                path: [],
                availableTargets: jumpContinuation.targets,
              },
              {
                legalTargets: jumpContinuation.targets,
                draftJumpPath: [],
                availableActionKinds: ['jumpSequence'],
                selectedTargetMap: createJumpOnlyTargetMap(jumpContinuation.targets),
              },
            )
          : createIdleSelection(runtimeState.gameState)),
        ...resetAiState(),
        historyHydrationStatus,
        lastAiDecision: null,
        importBuffer: '',
        importError: null,
        exportBuffer: current.exportBuffer,
      }));

      if (options.persist !== false) {
        persistRuntimeSession(session);
      }

      syncComputerTurn();
    }

    /** Produces one undo/redo transition payload without mutating store state. */
    function getHistoryStepData(
      state: Pick<
        GameStoreData,
        'ruleConfig' | 'preferences' | 'matchSettings' | 'gameState' | 'turnLog' | 'past' | 'future'
      >,
      direction: 'backward' | 'forward',
    ): Pick<
      GameStoreData,
      | 'ruleConfig'
      | 'preferences'
      | 'matchSettings'
      | 'gameState'
      | 'turnLog'
      | 'past'
      | 'future'
      | 'historyCursor'
      | 'selectableCoords'
      | 'scoreSummary'
    > | null {
      if (direction === 'backward') {
        const previous = state.past.at(-1);

        if (!previous) {
          return null;
        }

        const previousGameState = restoreGameState(previous, state.turnLog);
        const nextPast = state.past.slice(0, -1);
        const nextFuture = [createUndoFrame(state.gameState), ...state.future];
        const nextBoardDerivation = getBoardDerivation(previousGameState, state.ruleConfig);

        return {
          ruleConfig: state.ruleConfig,
          preferences: state.preferences,
          matchSettings: state.matchSettings,
          gameState: previousGameState,
          turnLog: state.turnLog,
          past: nextPast,
          future: nextFuture,
          historyCursor: previous.historyCursor,
          ...nextBoardDerivation,
        };
      }

      const next = state.future[0];

      if (!next) {
        return null;
      }

      const nextGameState = restoreGameState(next, state.turnLog);
      const nextPast = [...state.past, createUndoFrame(state.gameState)];
      const nextFuture = state.future.slice(1);
      const nextBoardDerivation = getBoardDerivation(nextGameState, state.ruleConfig);

      return {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        matchSettings: state.matchSettings,
        gameState: nextGameState,
        turnLog: state.turnLog,
        past: nextPast,
        future: nextFuture,
        historyCursor: next.historyCursor,
        ...nextBoardDerivation,
      };
    }

    /** Applies a single backward/forward history step and persists state. */
    function applyHistoryStep(direction: 'backward' | 'forward'): boolean {
      disposeAiWorker();
      const state = get();
      const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
      const nextData = getHistoryStepData(state, direction);

      if (!nextData) {
        return false;
      }

      set({
        ...nextData,
        historyHydrationStatus: nextHistoryHydrationStatus,
        ...createIdleSelection(nextData.gameState),
        ...resetAiState(),
      });
      persistCurrentState(nextData);
      syncComputerTurn();

      return true;
    }

    function getSessionSlices(state: GameStoreState): SessionSlices {
      return {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        matchSettings: state.matchSettings,
        gameState: state.gameState,
        turnLog: state.turnLog,
        past: state.past,
        future: state.future,
      };
    }

    persistInitialState = () => {
      if (!initialPersistence.needsPersistenceSync) {
        return;
      }

      persistRuntimeSession(buildSessionFromState(getSessionSlices(get())), {
        incrementRevision: false,
        persistArchive: archiveWritesEnabled,
      });
    };

    startArchiveHydration = () => {
      if (!archive || startupHydrationMode === null) {
        return;
      }

      const token = ++hydrationToken;
      const expectedSessionId = activeSessionId;
      const expectedRevision = activeRevision;

      void archive.loadLatest()
        .then((envelope) => {
          if (token !== hydrationToken || startupHydrationMode === null) {
            return;
          }

          if (!envelope) {
            historyHydrationStatus = startupHydrationMode === 'compact' ? 'recentOnly' : 'full';
            archiveWritesEnabled = startupHydrationMode !== 'compact';
            startupHydrationMode = null;
            set({ historyHydrationStatus });
            return;
          }

          if (
            startupHydrationMode === 'compact' &&
            (envelope.sessionId !== expectedSessionId || envelope.revision !== expectedRevision)
          ) {
            historyHydrationStatus = 'recentOnly';
            archiveWritesEnabled = false;
            startupHydrationMode = null;
            set({ historyHydrationStatus });
            return;
          }

          applySession(envelope.session, {
            historyHydrationStatus: 'full',
            persist: false,
            revision: envelope.revision,
            sessionId: envelope.sessionId,
          });

          if (localPersistenceEnabled) {
            localPersistenceEnabled = persistSession(
              envelope.session,
              envelope.sessionId,
              envelope.revision,
              storage,
            );
          }
        })
        .catch(() => {
          if (token !== hydrationToken || startupHydrationMode === null) {
            return;
          }

          historyHydrationStatus = startupHydrationMode === 'compact' ? 'recentOnly' : 'full';
          archiveWritesEnabled = startupHydrationMode !== 'compact';
          startupHydrationMode = null;
          set({ historyHydrationStatus });
        });
    };

    return {
      ...initialRuntimeState,
      ...initialBoardDerivation,
      aiError: null,
      aiStatus: 'idle',
      historyHydrationStatus: initialPersistence.historyHydrationStatus,
      selectedCell: initialJumpContinuation?.source ?? null,
      selectedActionType: initialJumpContinuation ? 'jumpSequence' : null,
      selectedTargetMap: initialJumpContinuation
        ? createJumpOnlyTargetMap(initialJumpContinuation.targets)
        : createEmptyTargetMap(),
      availableActionKinds: initialJumpContinuation ? ['jumpSequence'] : [],
      draftJumpPath: [],
      legalTargets: initialJumpContinuation?.targets ?? [],
      interaction: initialInteraction,
      importBuffer: '',
      importError: null,
      lastAiDecision: null,
      pendingAiRequestId: null,
      exportBuffer: '',
      acknowledgePassScreen: () => {
        const state = get();

        if (state.interaction.type !== 'passingDevice' && state.interaction.type !== 'turnResolved') {
          return;
        }

        set({
          interaction: state.gameState.status === 'gameOver' ? { type: 'gameOver' } : { type: 'idle' },
        });
      },
      cancelInteraction: () => {
        const state = get();

        if (isComputerTurn(state.gameState, state.matchSettings)) {
          return;
        }

        const jumpContinuation = getJumpContinuationSelection(state.gameState);

        if (!jumpContinuation) {
          set(createIdleSelection(state.gameState));
          return;
        }

        set(
          createSelectionState(
            jumpContinuation.source,
            'jumpSequence',
            {
              type: 'buildingJumpChain',
              source: jumpContinuation.source,
              path: [],
              availableTargets: jumpContinuation.targets,
            },
            {
              legalTargets: jumpContinuation.targets,
              draftJumpPath: [],
              availableActionKinds: ['jumpSequence'],
              selectedTargetMap: createJumpOnlyTargetMap(jumpContinuation.targets),
            },
          ),
        );
      },
      chooseActionType: (actionType) => {
        const state = get();
        const source = state.selectedCell;

        if (
          !source ||
          !state.availableActionKinds.includes(actionType) ||
          isComputerTurn(state.gameState, state.matchSettings)
        ) {
          return;
        }

        if (actionType === 'manualUnfreeze') {
          commitAction({ type: 'manualUnfreeze', coord: source });
          return;
        }

        if (actionType === 'jumpSequence') {
          const firstTargets = uniqueValues(state.selectedTargetMap.jumpSequence);
          set({
            ...createSelectionState(
              source,
              actionType,
              {
                type: 'buildingJumpChain',
                source,
                path: [],
                availableTargets: firstTargets,
              },
              {
                legalTargets: firstTargets,
                draftJumpPath: [],
                availableActionKinds: state.availableActionKinds,
                selectedTargetMap: state.selectedTargetMap,
              },
            ),
          });
          return;
        }

        const actionTargets = uniqueValues(state.selectedTargetMap[actionType]);

        set({
          ...createSelectionState(
            source,
            actionType,
            {
              type: 'choosingTarget',
              source,
              actionType,
              availableTargets: actionTargets,
            },
            {
              legalTargets: actionTargets,
              availableActionKinds: state.availableActionKinds,
              selectedTargetMap: state.selectedTargetMap,
            },
          ),
        });
      },
      goToHistoryCursor: (targetCursor) => {
        const initialState = get();
        const normalizedTarget = Number.isInteger(targetCursor)
          ? Math.max(0, Math.min(targetCursor, initialState.turnLog.length))
          : initialState.historyCursor;

        if (normalizedTarget === initialState.historyCursor) {
          return;
        }

        const direction = normalizedTarget < initialState.historyCursor ? 'backward' : 'forward';

        while (get().historyCursor !== normalizedTarget) {
          const moved = applyHistoryStep(direction);

          if (!moved) {
            break;
          }
        }
      },
      importSessionFromBuffer: () => {
        const state = get();

        try {
          const session = deserializeSession(state.importBuffer);
          const nextHistoryHydrationStatus = beginFreshFullSession();
          applySession(session, {
            historyHydrationStatus: nextHistoryHydrationStatus,
          });
        } catch {
          set({
            importError: 'importFailed',
          });
        }
      },
      redo: () => {
        applyHistoryStep('forward');
      },
      refreshExportBuffer: () => {
        const state = get();
        set({
          exportBuffer: serializeSession(
            buildSession(
              state.ruleConfig,
              state.preferences,
              state.matchSettings,
              state.gameState,
              state.turnLog,
              state.past,
              state.future,
            ),
            { pretty: true },
          ),
        });
      },
      retryComputerMove: () => {
        const state = get();

        if (
          !isComputerTurn(state.gameState, state.matchSettings) ||
          state.aiStatus === 'thinking'
        ) {
          return;
        }

        syncComputerTurn();
      },
      restart: () => {
        get().startNewGame(get().matchSettings);
      },
      selectCell: (coord) => {
        const state = get();

        if (
          state.interaction.type === 'passingDevice' ||
          isComputerTurn(state.gameState, state.matchSettings)
        ) {
          return;
        }

        if (
          state.selectedCell &&
          state.selectedActionType &&
          state.legalTargets.includes(coord)
        ) {
          if (state.selectedActionType === 'jumpSequence') {
            // Jump actions resolve immediately one segment at a time.
            commitAction({
              type: 'jumpSequence',
              source: state.selectedCell,
              path: [coord],
            });
            return;
          }

          // Non-jump actions resolve immediately after selecting a legal target.
          commitAction({
            type: state.selectedActionType,
            source: state.selectedCell,
            target: coord,
          } as TurnAction);
          return;
        }

        if (
          state.selectedActionType === 'jumpSequence' &&
          state.selectedCell &&
          state.interaction.type === 'buildingJumpChain'
        ) {
          // While building a jump chain, ignore non-target clicks to avoid accidental resets.
          return;
        }

        const { availableActionKinds, selectedTargetMap } = getCellDerivation(
          state.gameState,
          coord,
          state.ruleConfig,
        );

        if (!availableActionKinds.length) {
          set(createIdleSelection(state.gameState));
          return;
        }

        set({
          ...createSelectionState(
            coord,
            null,
            {
              type: 'pieceSelected',
              source: coord,
              availableActions: availableActionKinds,
            },
            {
              availableActionKinds,
              selectedTargetMap,
            },
          ),
        });
      },
      setImportBuffer: (value) => {
        set({ importBuffer: value });
      },
      setSetupMatchSettings: (partial) => {
        const state = get();

        set({
          setupMatchSettings: {
            ...state.setupMatchSettings,
            ...partial,
          },
        });
      },
      setPreference: (partial) => {
        const state = get();
        const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
        const preferences = {
          ...state.preferences,
          ...partial,
        };
        const nextData = {
          ruleConfig: state.ruleConfig,
          preferences,
          matchSettings: state.matchSettings,
          gameState: state.gameState,
          turnLog: state.turnLog,
          past: state.past,
          future: state.future,
        };

        set({
          historyHydrationStatus: nextHistoryHydrationStatus,
          preferences,
          interaction:
            !preferences.passDeviceOverlayEnabled && state.interaction.type === 'passingDevice'
              ? { type: 'idle' }
              : state.interaction,
        });
        persistCurrentState(nextData);
      },
      setRuleConfig: (partial) => {
        disposeAiWorker();
        const state = get();
        const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
        const ruleConfig = withRuleDefaults({
          ...state.ruleConfig,
          ...partial,
        });
        let nextGameState = state.gameState;

        if (nextGameState.status === 'active') {
          const victory = checkVictory(nextGameState, ruleConfig);

          if (victory.type !== 'none') {
            nextGameState = {
              ...nextGameState,
              pendingJump: null,
              status: 'gameOver',
              victory,
            };
          }
        }

        // Rule toggles can immediately terminate active games (for example threefold draw on/off).
        const nextBoardDerivation = getBoardDerivation(nextGameState, ruleConfig);
        const nextData = {
          ruleConfig,
          preferences: state.preferences,
          matchSettings: state.matchSettings,
          gameState: nextGameState,
          turnLog: state.turnLog,
          past: state.past,
          future: state.future,
          historyCursor: nextGameState.history.length,
          ...nextBoardDerivation,
        };

        set({
          ...nextData,
          historyHydrationStatus: nextHistoryHydrationStatus,
          ...createIdleSelection(nextGameState),
          ...resetAiState(),
        });
        persistCurrentState(nextData);
        syncComputerTurn();
      },
      startNewGame: (matchSettings = get().setupMatchSettings) => {
        disposeAiWorker();
        const state = get();
        const nextHistoryHydrationStatus = beginFreshFullSession();
        const nextRuleConfig = getRuleConfigForNewMatch(state.ruleConfig, matchSettings);
        const nextGameState = createInitialState(nextRuleConfig);
        const nextBoardDerivation = getBoardDerivation(nextGameState, nextRuleConfig);
        const nextData = {
          ruleConfig: nextRuleConfig,
          preferences: state.preferences,
          matchSettings,
          gameState: nextGameState,
          turnLog: [],
          past: [],
          future: [],
          historyCursor: 0,
          ...nextBoardDerivation,
        };

        set({
          ...nextData,
          historyHydrationStatus: nextHistoryHydrationStatus,
          ...createIdleSelection(nextGameState),
          ...resetAiState(),
          importBuffer: '',
          importError: null,
          lastAiDecision: null,
          setupMatchSettings: matchSettings,
        });
        persistCurrentState(nextData);
        syncComputerTurn();
      },
      undo: () => {
        const state = get();

        if (isComputerMatch(state.matchSettings)) {
          const targetCursor = getComputerUndoTarget(state);

          if (targetCursor === state.historyCursor) {
            return;
          }

          while (get().historyCursor !== targetCursor) {
            const moved = applyHistoryStep('backward');

            if (!moved) {
              break;
            }
          }

          return;
        }

        applyHistoryStep('backward');
      },
    };
  });

  queueMicrotask(() => {
    persistInitialState?.();
    startArchiveHydration?.();

    const state = store.getState();

    if (isComputerTurn(state.gameState, state.matchSettings)) {
      state.retryComputerMove();
    }
  });

  return store;
}
