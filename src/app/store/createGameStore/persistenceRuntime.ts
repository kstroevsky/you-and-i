import type { SerializableSession } from '@/shared/types/session';

import { createSessionId } from '@/app/store/createGameStore/session';
import type {
  HistoryHydrationStatus,
  InitialPersistenceState,
} from '@/app/store/createGameStore/types';
import { createPersistedSessionEnvelope } from '@/app/store/sessionPersistence';
import { persistSessionSnapshot } from '@/app/store/createGameStore/persistence';
import type { SessionArchive } from '@/app/store/sessionArchive';

type PersistenceRuntimeOptions = {
  archive: SessionArchive | null;
  createSessionId?: () => string;
  initialPersistence: InitialPersistenceState;
  storage?: Storage;
};

type PersistRuntimeOptions = {
  incrementRevision?: boolean;
  persistArchive?: boolean;
};

type StartArchiveHydrationOptions = {
  applySession: (session: SerializableSession, options: {
    historyHydrationStatus?: HistoryHydrationStatus;
    persist?: boolean;
    revision?: number;
    sessionId?: string;
  }) => void;
  onHydrationFallback: (status: HistoryHydrationStatus) => void;
};

/**
 * Owns the mutable persistence lifecycle for one live store instance.
 *
 * The persisted session itself stays immutable; this runtime tracks operational
 * metadata around it: active session id, revision, hydration race tokens, and
 * whether compact/archive writes are still available.
 */
export function createPersistenceRuntime({
  archive,
  createSessionId: createStoreSessionId,
  initialPersistence,
  storage,
}: PersistenceRuntimeOptions) {
  let activeSessionId = initialPersistence.sessionId;
  let activeRevision = initialPersistence.revision;
  let historyHydrationStatus = initialPersistence.historyHydrationStatus;
  let startupHydrationMode = initialPersistence.startupHydrationMode;
  let archiveWriteQueue = Promise.resolve();
  let archiveWritesEnabled = startupHydrationMode !== 'compact';
  let hydrationToken = 0;
  let localPersistenceEnabled = true;

  /**
   * Collapses the provisional boot mode into a stable visible hydration status.
   *
   * Any user mutation cancels the "maybe we will hydrate something better soon"
   * startup state, because from that point forward the live store becomes the
   * source of truth and stale archive results must not overwrite it.
   */
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

  /**
   * Starts a brand-new persistence lineage for imports and new matches.
   *
   * This resets the revision counter and session id so old archive payloads cannot
   * accidentally attach themselves to a logically new session.
   */
  function beginFreshFullSession(): HistoryHydrationStatus {
    hydrationToken += 1;
    startupHydrationMode = null;
    activeSessionId = (createStoreSessionId ?? createSessionId)();
    activeRevision = 0;
    historyHydrationStatus = 'full';
    archiveWritesEnabled = true;

    return historyHydrationStatus;
  }

  /**
   * Serializes full-history archive writes so IndexedDB persistence stays ordered.
   *
   * The queue is important because multiple rapid store mutations can happen before
   * the browser finishes the previous asynchronous archive write.
   */
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

  /**
   * Persists the current canonical session to the available storage tiers.
   *
   * Compact local persistence is attempted first for fast future boots; full
   * archive persistence is then queued unless the current runtime policy disables it.
   */
  function persistRuntimeSession(
    session: SerializableSession,
    options: PersistRuntimeOptions = {},
  ): void {
    const nextRevision =
      options.incrementRevision === false ? activeRevision : activeRevision + 1;

    activeRevision = nextRevision;

    if (localPersistenceEnabled) {
      localPersistenceEnabled = persistSessionSnapshot(
        session,
        activeSessionId,
        nextRevision,
        storage,
      );
    }

    if (options.persistArchive !== false) {
      queueArchiveWrite(session, nextRevision);
    }
  }

  /**
   * Replaces runtime metadata when an external session payload becomes authoritative.
   *
   * This is used by import/hydration paths that already know the correct session id,
   * revision, and visible hydration status.
   */
  function updateSessionMeta(options: {
    historyHydrationStatus?: HistoryHydrationStatus;
    revision?: number;
    sessionId?: string;
  } = {}): HistoryHydrationStatus {
    startupHydrationMode = null;

    if (options.sessionId) {
      activeSessionId = options.sessionId;
    }

    if (typeof options.revision === 'number') {
      activeRevision = options.revision;
    }

    archiveWritesEnabled = true;
    historyHydrationStatus = options.historyHydrationStatus ?? 'full';

    return historyHydrationStatus;
  }

  /** Persists boot-time migrations/default rewrites without creating a fake new revision. */
  function persistInitialState(buildSession: () => SerializableSession): void {
    if (!initialPersistence.needsPersistenceSync) {
      return;
    }

    persistRuntimeSession(buildSession(), {
      incrementRevision: false,
      persistArchive: archiveWritesEnabled,
    });
  }

  /**
   * Attempts to replace compact/default boot data with the full archived session.
   *
   * Hydration is guarded by a token plus session identity checks so stale archive
   * results cannot overwrite newer local mutations or a newly started session.
   */
  function startArchiveHydration({
    applySession,
    onHydrationFallback,
  }: StartArchiveHydrationOptions): void {
    if (!archive || startupHydrationMode === null) {
      return;
    }

    const token = ++hydrationToken;
    const expectedSessionId = activeSessionId;
    const expectedRevision = activeRevision;

    void archive
      .loadLatest()
      .then((envelope) => {
        if (token !== hydrationToken || startupHydrationMode === null) {
          return;
        }

        if (!envelope) {
          historyHydrationStatus =
            startupHydrationMode === 'compact' ? 'recentOnly' : 'full';
          archiveWritesEnabled = startupHydrationMode !== 'compact';
          startupHydrationMode = null;
          onHydrationFallback(historyHydrationStatus);
          return;
        }

        if (
          startupHydrationMode === 'compact' &&
          (envelope.sessionId !== expectedSessionId || envelope.revision !== expectedRevision)
        ) {
          historyHydrationStatus = 'recentOnly';
          archiveWritesEnabled = false;
          startupHydrationMode = null;
          onHydrationFallback(historyHydrationStatus);
          return;
        }

        applySession(envelope.session, {
          historyHydrationStatus: 'full',
          persist: false,
          revision: envelope.revision,
          sessionId: envelope.sessionId,
        });

        if (localPersistenceEnabled) {
          localPersistenceEnabled = persistSessionSnapshot(
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

        historyHydrationStatus =
          startupHydrationMode === 'compact' ? 'recentOnly' : 'full';
        archiveWritesEnabled = startupHydrationMode !== 'compact';
        startupHydrationMode = null;
        onHydrationFallback(historyHydrationStatus);
      });
  }

  return {
    beginFreshFullSession,
    consumeStartupHydrationOnMutation,
    persistInitialState,
    persistRuntimeSession,
    startArchiveHydration,
    updateSessionMeta,
  };
}
