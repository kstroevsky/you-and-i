import { lazy, Suspense, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AppHeader } from '@/app/components/AppHeader';
import type { AppTab } from '@/app/components/AppTabs';
import { PwaStatusBanner } from '@/app/pwa/PwaStatusBanner';
import { usePwaLifecycle } from '@/app/pwa/usePwaLifecycle';
import { TabLoading } from '@/app/components/TabLoading';
import { useGameStore } from '@/app/providers/GameStoreProvider';

import { AppOverlays, preloadAppOverlays } from './AppOverlays';
import styles from './style.module.scss';

const GameTab = lazy(() => import('@/ui/tabs/GameTab').then((module) => ({ default: module.GameTab })));
const InstructionsTab = lazy(() =>
  import('@/ui/tabs/InstructionsTab').then((module) => ({ default: module.InstructionsTab })),
);
const SettingsTab = lazy(() =>
  import('@/ui/tabs/SettingsTab').then((module) => ({ default: module.SettingsTab })),
);

function scheduleIdleTask(task: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const browserWindow = window as Window & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };

  if (browserWindow.requestIdleCallback) {
    const idleId = browserWindow.requestIdleCallback(() => task(), { timeout: 320 });

    return () => browserWindow.cancelIdleCallback?.(idleId);
  }

  const timeoutId = globalThis.setTimeout(task, 180);

  return () => globalThis.clearTimeout(timeoutId);
}

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('game');
  const {
    applyUpdate,
    dismissNeedRefresh,
    dismissOfflineReady,
    needRefresh,
    offlineReady,
  } = usePwaLifecycle();
  const { language, setPreference } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      setPreference: state.setPreference,
    })),
  );

  useEffect(() => scheduleIdleTask(preloadAppOverlays), []);

  return (
    <>
      <main className={styles.shell}>
        <AppHeader
          activeTab={activeTab}
          language={language}
          onChangeLanguage={(nextLanguage) => setPreference({ language: nextLanguage })}
          onChangeTab={setActiveTab}
        />
        <PwaStatusBanner
          applyUpdate={applyUpdate}
          language={language}
          needRefresh={needRefresh}
          offlineReady={offlineReady}
          onDismissNeedRefresh={dismissNeedRefresh}
          onDismissOfflineReady={dismissOfflineReady}
        />

        <section className={styles.content}>
          <Suspense fallback={<TabLoading />}>
            {activeTab === 'game' ? <GameTab /> : null}
            {activeTab === 'instructions' ? <InstructionsTab /> : null}
            {activeTab === 'settings' ? <SettingsTab /> : null}
          </Suspense>
        </section>
      </main>

      <AppOverlays />
    </>
  );
}
