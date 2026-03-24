import { registerSW } from 'virtual:pwa-register';

import { markPwaNeedRefresh, markPwaOfflineReady, setPwaLifecycleState } from '@/app/pwa/pwaLifecycleStore';

let hasRegisteredPwa = false;

export function registerPwa(): void {
  if (
    hasRegisteredPwa ||
    import.meta.env.DEV ||
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  hasRegisteredPwa = true;

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      markPwaNeedRefresh();
    },
    onOfflineReady() {
      markPwaOfflineReady();
    },
  });

  setPwaLifecycleState({
    applyUpdate: async () => updateServiceWorker(true),
  });
}
