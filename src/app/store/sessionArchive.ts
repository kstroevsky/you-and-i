import {
  deserializePersistedSessionEnvelope,
  type PersistedSessionEnvelope,
} from '@/app/store/sessionPersistence';

const ARCHIVE_DB_NAME = 'white-maybe-black';
const ARCHIVE_DB_VERSION = 1;
const ARCHIVE_STORE_NAME = 'sessionArchive';
const ACTIVE_RECORD_KEY = 'active';

type StoredArchiveRecord = PersistedSessionEnvelope<'full'> & {
  id: typeof ACTIVE_RECORD_KEY;
};

export type SessionArchive = {
  loadLatest: () => Promise<PersistedSessionEnvelope<'full'> | null>;
  saveLatest: (envelope: PersistedSessionEnvelope<'full'>) => Promise<void>;
};

/** Normalizes callback-style IndexedDB requests into promise-based control flow. */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

/** Opens the archive database and creates the single-record store on first use. */
function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(ARCHIVE_DB_NAME, ARCHIVE_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(ARCHIVE_STORE_NAME)) {
        database.createObjectStore(ARCHIVE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

/** Opens a transaction, exposes its object store, and waits for transaction completion safely. */
async function withStore<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase(factory);

  try {
    const transaction = database.transaction(ARCHIVE_STORE_NAME, mode);
    const store = transaction.objectStore(ARCHIVE_STORE_NAME);
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
    const result = await run(store);

    await completed;

    return result;
  } finally {
    database.close();
  }
}

/** Creates the optional full-history archive used to complement compact localStorage boot. */
export function createIndexedDbSessionArchive(): SessionArchive | null {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  const factory = indexedDB;

  return {
    async loadLatest(): Promise<PersistedSessionEnvelope<'full'> | null> {
      return withStore<PersistedSessionEnvelope<'full'> | null>(factory, 'readonly', async (store) => {
        const record = await requestToPromise(store.get(ACTIVE_RECORD_KEY));

        if (!record) {
          return null;
        }

        const envelope = deserializePersistedSessionEnvelope(JSON.stringify(record));

        if (envelope.kind !== 'full') {
          return null;
        }

        return envelope as PersistedSessionEnvelope<'full'>;
      });
    },
    async saveLatest(envelope) {
      const record: StoredArchiveRecord = {
        id: ACTIVE_RECORD_KEY,
        ...envelope,
      };

      await withStore(factory, 'readwrite', async (store) => {
        await requestToPromise(store.put(record));
      });
    },
  };
}
