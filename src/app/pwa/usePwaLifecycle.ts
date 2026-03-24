import { useSyncExternalStore } from 'react';

import {
  dismissPwaNeedRefresh,
  dismissPwaOfflineReady,
  getPwaLifecycleSnapshot,
  subscribeToPwaLifecycle,
} from '@/app/pwa/pwaLifecycleStore';

export function usePwaLifecycle() {
  const snapshot = useSyncExternalStore(
    subscribeToPwaLifecycle,
    getPwaLifecycleSnapshot,
    getPwaLifecycleSnapshot,
  );

  return {
    ...snapshot,
    dismissNeedRefresh: dismissPwaNeedRefresh,
    dismissOfflineReady: dismissPwaOfflineReady,
  };
}
