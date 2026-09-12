/// <reference lib="webworker" />
/**
 * Service worker. App shell precached, game data cached on first use, and the Web Share Target
 * endpoint: Poke Genie's share sheet can POST the CSV straight to /share when pick3 is
 * installed. The file is parked in a cache and the app imports it on the next load.
 */
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import type { WorkboxPlugin } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';
import { SHARE_CACHE, SHARE_KEY, SHARE_LANDING, SHARE_PATH } from './share-protocol.ts';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Share target: park the CSV, then send the browser to the app with a marker in the query.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== SHARE_PATH) {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const file = form.get('csv');
        const text = form.get('text');
        const cache = await caches.open(SHARE_CACHE);
        if (file instanceof File) {
          await cache.put(
            SHARE_KEY,
            new Response(file, {
              headers: { 'content-type': 'text/csv', 'x-file-name': encodeURIComponent(file.name) },
            }),
          );
        } else if (typeof text === 'string' && text.includes(',')) {
          await cache.put(
            SHARE_KEY,
            new Response(text, { headers: { 'content-type': 'text/csv', 'x-file-name': '' } }),
          );
        }
      } catch {
        // Fall through; the app shows the normal import screen.
      }
      return Response.redirect(SHARE_LANDING, 303);
    })(),
  );
});

// Workbox plugin types predate exactOptionalPropertyTypes, hence the casts below.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/data/'),
  new StaleWhileRevalidate({
    cacheName: 'pick3-data',
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ] as unknown as WorkboxPlugin[],
  }),
);

registerRoute(
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({
    cacheName: 'pick3-fonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ] as unknown as WorkboxPlugin[],
  }),
);
