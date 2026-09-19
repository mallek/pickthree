import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './app.css';
import { AppProvider } from './state/store.tsx';
import { installUpdater } from './update.ts';
import { recordError } from './diag.ts';
import { installSafeAreaFix } from './safeArea.ts';

// Installs the service worker (app shell precached, game data cached on first use) and the
// update checks plus toast that go with it.
installUpdater();
installSafeAreaFix();
window.addEventListener('error', (e) => recordError('window', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => recordError('promise', e.reason));
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
