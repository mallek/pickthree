import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, storedTheme } from '@pickthree/ui';
import { App } from './App.js';
import './app.css';

applyTheme(storedTheme());

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
