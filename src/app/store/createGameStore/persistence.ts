import { deserializeSession, withRuleDefaults, type RuleConfig } from '@/domain';
import { LEGACY_SESSION_STORAGE_KEYS, SESSION_STORAGE_KEY } from '@/shared/constants/storage';
import type { SerializableSession } from '@/shared/types/session';

import { LEGACY_RULE_DEFAULTS } from '@/app/store/createGameStore/constants';
import { createSessionId, getDefaultSession } from '@/app/store/createGameStore/session';
import type { InitialPersistenceState, StoreOptions } from '@/app/store/createGameStore/types';
import {
  createCompactSession,
  createPersistedSessionEnvelope,
  deserializePersistedSessionEnvelope,
  LOCAL_HISTORY_WINDOW,
  serializePersistedSessionEnvelope,
} from '@/app/store/sessionPersistence';

/** Removes superseded keys once the current envelope has been persisted successfully. */
export function clearLegacySessionKeys(storage?: Storage): void {
  if (!storage) {
    return;
  }

  for (const legacyKey of LEGACY_SESSION_STORAGE_KEYS) {
    storage.removeItem(legacyKey);
  }
}

/**
 * Writes the fast-boot compact snapshot to localStorage.
 *
 * This intentionally does not throw: losing persistence must not corrupt the live
 * game, so the store treats browser quota/storage failures as degraded persistence,
 * not as gameplay failures.
 */
export function persistSessionSnapshot(
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

/** Detects historical default-rule payloads that should be migrated only when untouched. */
export function hasLegacyRuleDefaults(ruleConfig: RuleConfig): boolean {
  return (
    ruleConfig.allowNonAdjacentFriendlyStackTransfer ===
      LEGACY_RULE_DEFAULTS.allowNonAdjacentFriendlyStackTransfer &&
    ruleConfig.drawRule === LEGACY_RULE_DEFAULTS.drawRule &&
    ruleConfig.scoringMode === LEGACY_RULE_DEFAULTS.scoringMode
  );
}

/** Limits default migration to pristine sessions so existing matches keep their original rules. */
export function isUntouchedSession(session: SerializableSession): boolean {
  return (
    session.turnLog.length === 0 &&
    session.past.length === 0 &&
    session.future.length === 0 &&
    session.present.historyCursor === 0
  );
}

/** Rewrites only pristine legacy sessions to the current rule defaults. */
export function migrateLegacyRuleDefaults(
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

/**
 * Selects the fastest trustworthy startup session before async archive hydration.
 *
 * The selection order is deliberate: injected test/session data wins first,
 * current-version compact local snapshots are next, legacy payloads are migrated
 * as a compatibility fallback, and only then does the store create a fresh match.
 */
export function getInitialPersistenceState(options: StoreOptions): InitialPersistenceState {
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
