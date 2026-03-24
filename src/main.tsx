import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { registerPwa } from '@/app/pwa/registerPwa';
import { GameStoreProvider } from '@/app/providers/GameStoreProvider';
import '@/styles/base.scss';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container was not found.');
}

registerPwa();

createRoot(container).render(
  <StrictMode>
    <GameStoreProvider>
      <App />
    </GameStoreProvider>
  </StrictMode>,
);
