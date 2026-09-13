import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './app.css';
import { AppProvider } from './state/store.tsx';
import { installUpdater } from './update.ts';

// Installs the service worker (app shell precached, game data cached on first use) and the
// update checks plus toast that go with it.
installUpdater();
document.documentElement.dataset.build = __PICK3_BUILD__;

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root missing');
}
createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
