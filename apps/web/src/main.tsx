import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './app.css';
import { AppProvider } from './state/store.tsx';
import { registerSW } from 'virtual:pwa-register';

// Installs the service worker (app shell precached, game data cached on first use). Updates apply
// on the next launch; there is no in-app prompt yet.
registerSW({ immediate: true });

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
