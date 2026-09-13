/* global document */
/**
 * Proves the in-app update path: load the current build, rebuild with a different build id,
 * ask the page to check for updates, expect the toast, tap it, and land on the new build.
 * Run `npx vite preview --port 4173` in apps/web first; it serves dist from disk, so a rebuild
 * is picked up without restarting it.
 *
 *   node apps/web/scripts/update-test.mjs [baseUrl]
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..');
const base = process.argv[2] ?? 'http://localhost:4173';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function build(id) {
  execSync('npx vite build', {
    cwd: webDir,
    stdio: 'ignore',
    env: { ...process.env, PICK3_BUILD: id },
  });
}

const readBuild = (page) => page.evaluate(() => document.documentElement.dataset.build);

build('upd-one');
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
await page.goto(`${base}/#/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('h1');
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((r) =>
      navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
    );
  }
});
const first = await readBuild(page);
console.log(`running build ${first}`);

build('upd-two');
console.log('rebuilt as upd-two; asking the page to check');
await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  await r.update();
});
await page.waitForSelector('.update-toast', { timeout: 30_000 });
console.log('toast shown');
await page.screenshot({ path: path.join(here, '..', 'screenshots', '12-update-toast.png') });
const hit = await page.evaluate(() => {
  const b = document.querySelector('.update-toast button');
  const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return top === b || b.contains(top) ? 'button on top' : `covered by ${top?.className}`;
});
console.log(`hit test: ${hit}`);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30_000 }),
  page.click('.update-toast button'),
]);
await page.waitForSelector('h1');
const second = await readBuild(page);
console.log(`after reload: build ${second}`);
await browser.close();
build('dev');
if (first !== 'upd-one' || second !== 'upd-two') {
  console.log('FAIL: update path did not land on the new build');
  process.exit(1);
}
console.log('update path OK');
