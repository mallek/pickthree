import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      // main.tsx imports virtual:pwa-register; no inline script, which keeps the CSP strict.
      injectRegister: false,
      registerType: 'autoUpdate',
      // Hand-written service worker (src/sw.ts) so it can answer the Web Share Target POST.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        id: '/',
        name: 'pick3',
        short_name: 'pick3',
        description:
          'Find your best Pokémon GO battle team. Which Pokémon to use, in what order, with which moves, and what it costs.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#161826',
        theme_color: '#161826',
        lang: 'en',
        categories: ['games', 'utilities'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Poke Genie's share sheet lists installed pick3; the CSV lands on /share (see src/sw.ts).
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            files: [
              {
                name: 'csv',
                accept: [
                  '.csv',
                  'text/csv',
                  'text/comma-separated-values',
                  'application/csv',
                  'application/vnd.ms-excel',
                ],
              },
            ],
          },
        },
      },
      injectManifest: {
        // App shell is precached. Game data (about 7 MB) is fetched on first use and then served
        // from cache while it revalidates (runtime route in src/sw.ts).
        globPatterns: ['**/*.{js,css,html,svg,png,csv}'],
        globIgnores: ['data/**'],
      },
    }),
  ],
  worker: {
    // Classic worker so the vendored PvPoke bundle can be pulled in with importScripts.
    format: 'iife',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
