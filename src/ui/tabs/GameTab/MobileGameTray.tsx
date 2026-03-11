import { startTransition, useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { HistorySection } from '@/ui/panels/HistorySection';
import { Button } from '@/ui/primitives/Button';

import { GameInfoPane } from './GameInfoPane';
import styles from './style.module.scss';

export type MobileTrayTab = 'history' | 'info';

const TABS: MobileTrayTab[] = ['history', 'info'];

function getTabLabel(language: Language, tab: MobileTrayTab): string {
  switch (tab) {
    case 'history':
      return text(language, 'history');
    case 'info':
      return text(language, 'trayInfo');
  }
}

export function MobileGameTray() {
  const trayId = useId();
  const [activeTab, setActiveTab] = useState<MobileTrayTab>('history');
  const { language } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
    })),
  );

  return (
    <section className={styles.mobileTray}>
      <div
        className={styles.mobileTrayTabs}
        role="tablist"
        aria-label={text(language, 'gameTraySectionsLabel')}
      >
        {TABS.map((tab) => (
          <Button
            key={tab}
            fullWidth
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`${trayId}-${tab}`}
            variant={activeTab === tab ? 'active' : 'ghost'}
            onClick={() => startTransition(() => setActiveTab(tab))}
          >
            {getTabLabel(language, tab)}
          </Button>
        ))}
      </div>

      <div className={styles.mobileTrayBody}>
        {activeTab === 'history' ? (
          <div id={`${trayId}-history`} className={styles.mobileTrayPane} role="tabpanel">
            <HistorySection />
          </div>
        ) : null}
        {activeTab === 'info' ? (
          <div id={`${trayId}-info`} className={styles.mobileTrayPane} role="tabpanel">
            <GameInfoPane />
          </div>
        ) : null}
      </div>
    </section>
  );
}
