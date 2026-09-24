import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../tokens.css';
import '../base.css';
import './gallery.css';
import { applyTheme } from '../src/index.ts';
import { Gallery } from './Gallery.tsx';

const theme = new URLSearchParams(window.location.search).get('theme');
applyTheme(theme === 'light' || theme === 'dark' ? theme : 'system');

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <Gallery />
    </StrictMode>,
  );
}
