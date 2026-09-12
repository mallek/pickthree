/**
 * Exercises the Web Share Target plumbing without a phone: registers the service worker, POSTs
 * the sample CSV to /share the way the OS share sheet would, follows the redirect, and checks
 * that the app imports it. Run `npx vite preview --port 4173` in apps/web first.
 *
 *   node apps/web/scripts/share-test.mjs [baseUrl]
 */
/* global caches, location */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? 'http://localhost:4173';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const csv = fs.readFileSync(
  path.join(here, '..', 'public', 'fixtures', 'pokegenie-sample.csv'),
  'utf8',
);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors.push(`[console.error] ${m.text()}`);
  }
});

const t0 = Date.now();
await page.goto(`${base}/#/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('h1');
await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((r) =>
      navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
    );
  }
  return reg.active?.state;
});
console.log(`service worker controlling at ${Date.now() - t0} ms`);

const result = await page.evaluate(async (text) => {
  const fd = new FormData();
  fd.append('title', 'Poke Genie export');
  fd.append('csv', new File([text], 'poke_genie_export.csv', { type: 'text/csv' }));
  const res = await fetch('/share', { method: 'POST', body: fd });
  const cache = await caches.open('pick3-share');
  const parked = await cache.match('/share/pending');
  return { redirected: res.redirected, url: res.url, parked: Boolean(parked) };
}, csv);
console.log(
  `POST /share -> redirected=${result.redirected} url=${result.url} parked=${result.parked}`,
);
if (!result.redirected || !result.url.includes('share=1') || !result.parked) {
  console.log('FAIL: share endpoint did not park the file or redirect');
  await browser.close();
  process.exit(1);
}

await page.goto(result.url, { waitUntil: 'networkidle0' });
await page.waitForSelector('.kicker', { timeout: 90_000 });
const cleared = await page.evaluate(async () => {
  const cache = await caches.open('pick3-share');
  return { pending: Boolean(await cache.match('/share/pending')), url: location.href };
});
console.log(
  `import report rendered at ${Date.now() - t0} ms; pending=${cleared.pending}; url=${cleared.url}`,
);
await browser.close();
if (errors.length > 0) {
  console.log('Browser errors:');
  for (const e of errors) {
    console.log(`  ${e}`);
  }
}
if (cleared.pending || cleared.url.includes('share=1')) {
  console.log('FAIL: shared file or marker not cleared after import');
  process.exit(1);
}
console.log('share target OK');
