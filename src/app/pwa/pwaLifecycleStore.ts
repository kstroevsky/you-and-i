export type PwaLifecycleSnapshot = {
  applyUpdate: () => Promise<void>;
  needRefresh: boolean;
  offlineReady: boolean;
};

const NOOP_UPDATE = async () => undefined;

const DEFAULT_SNAPSHOT: PwaLifecycleSnapshot = {
  applyUpdate: NOOP_UPDATE,
  needRefresh: false,
  offlineReady: false,
};

let snapshot: PwaLifecycleSnapshot = DEFAULT_SNAPSHOT;

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function updateSnapshot(nextSnapshot: PwaLifecycleSnapshot): void {
  snapshot = nextSnapshot;
  emitChange();
}

export function subscribeToPwaLifecycle(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getPwaLifecycleSnapshot(): PwaLifecycleSnapshot {
  return snapshot;
}

export function setPwaLifecycleState(partial: Partial<PwaLifecycleSnapshot>): void {
  updateSnapshot({
    ...snapshot,
    ...partial,
  });
}

export function markPwaNeedRefresh(): void {
  updateSnapshot({
    ...snapshot,
    needRefresh: true,
    offlineReady: false,
  });
}

export function markPwaOfflineReady(): void {
  updateSnapshot({
    ...snapshot,
    offlineReady: true,
  });
}

export function dismissPwaNeedRefresh(): void {
  updateSnapshot({
    ...snapshot,
    needRefresh: false,
  });
}

export function dismissPwaOfflineReady(): void {
  updateSnapshot({
    ...snapshot,
    offlineReady: false,
  });
}

export function resetPwaLifecycleForTests(): void {
  snapshot = DEFAULT_SNAPSHOT;
}

export function setPwaLifecycleStateForTests(snapshotOverride: Partial<PwaLifecycleSnapshot>): void {
  updateSnapshot({
    ...DEFAULT_SNAPSHOT,
    ...snapshotOverride,
  });
}
