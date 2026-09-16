/* global document */
/**
 * Drives the built app in the locally installed Chrome, imports the sample collection, and
 * screenshots every screen at phone size. Run `npx vite preview --port 4173` in apps/web first.
 *
 *   node apps/web/scripts/screens.mjs [baseUrl]
 *
 * Output: apps/web/screenshots/*.png (gitignored) plus a console log of timings and errors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'screenshots');
const base = process.argv[2] ?? 'http://localhost:4173';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) {
  if (f.endsWith('.png')) {
    fs.unlinkSync(path.join(outDir, f));
  }
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox'] : [])],
});
const page = await browser.newPage();
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warn') {
    errors.push(`[console.${m.type()}] ${m.text()}`);
  }
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => {
  // Chrome aborts its own speculative fetches against the live origin; those are not app errors.
  if (r.failure()?.errorText !== 'net::ERR_ABORTED') {
    errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`);
  }
});

async function shot(name, fullPage = true) {
  await new Promise((r) => setTimeout(r, 350));
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log(`  ${name}.png`);
}

const t0 = Date.now();
console.log('welcome');
await page.goto(`${base}/#/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('h1');
await shot('00-welcome', false);

console.log('scan list');
await page.evaluate(() => {
  const d = [...document.querySelectorAll('details')].find((x) =>
    x.textContent.includes('What to scan'),
  );
  d.open = true;
});
await page.waitForSelector('.scan-string', { timeout: 60_000 });
await page.evaluate(() =>
  document.querySelector('.scan-string').scrollIntoView({ block: 'center' }),
);
await shot('10-scan-list', false);

console.log('empty state');
await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.choice-card');
await shot('18-empty-state', false);

console.log('import sample');
await page.goto(`${base}/?sample=1#/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.kicker', { timeout: 90_000 });
console.log(`  import done at ${Date.now() - t0} ms`);
await shot('01-report');

console.log('teams');
await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.team-card', { timeout: 120_000 });
console.log(`  teams rendered at ${Date.now() - t0} ms`);
await shot('02-teams');
const stats = await page.$eval('.scroll > p.meta', (p) => p.textContent).catch(() => '');
console.log(`  ${stats}`);

console.log('ultra league');
await page.click('.league-switcher button:nth-child(2)');
await page.waitForFunction(
  () =>
    document.querySelector('.league-switcher[data-league="ultra"]') &&
    document.querySelector('.team-card') &&
    !document.querySelector('.progress'),
  { timeout: 120_000 },
);
console.log(`  ultra teams rendered at ${Date.now() - t0} ms`);
await shot('19-teams-ultra', false);
await page.click('.league-switcher button:nth-child(1)');
await page.waitForFunction(
  () =>
    document.querySelector('.league-switcher[data-league="great"]') &&
    document.querySelector('.team-card') &&
    !document.querySelector('.progress'),
  { timeout: 120_000 },
);

console.log('team detail');
const teamHref = await page.$eval('.team-card', (a) => a.getAttribute('href'));
await page.goto(`${base}/${teamHref}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.assump', { timeout: 60_000 }).catch(async () => {
  const text = await page.$eval('.screen', (e) => e.textContent.slice(0, 200));
  throw new Error(`team detail did not render: ${text}`);
});
await page.click('.assump-head');
await new Promise((r) => setTimeout(r, 300));
await shot('03-team-detail');

console.log('collection');
await page.goto(`${base}/#/collection`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.verdict', { timeout: 120_000 });
console.log(`  verdicts rendered at ${Date.now() - t0} ms`);
await shot('04-collection');
await page.click('.more-btn');
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.querySelector('.more-btn').scrollIntoView({ block: 'center' }));
await shot('11-collection-group', false);
const specHref = await page.$eval('.spec-row', (a) => a.getAttribute('href'));

console.log('specimen');
await page.goto(`${base}/${specHref}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.stat3, .verdict');
await shot('05-specimen');

console.log('counters');
await page.goto(`${base}/#/counters`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.counter-row', { timeout: 120_000 });
console.log(`  counters rendered at ${Date.now() - t0} ms`);
await shot('08-counters');
await page.click('.page-head > .chips:not(.league-cups) .chip:nth-child(3)');
await new Promise((r) => setTimeout(r, 300));
await shot('09-counters-own', false);

console.log('build a team');
await page.goto(`${base}/#/build`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.pick-slot');
for (let i = 0; i < 3; i++) {
  await page.$$eval('.pick-slot:not(.pick-moves)', (slots, n) => slots[n].click(), i);
  await page.waitForSelector('.picker-list .spec-row:not([disabled])', { timeout: 120_000 });
  await page.$$eval('.picker-list .spec-row:not([disabled])', (rows, n) => rows[n].click(), i * 2);
  await new Promise((r) => setTimeout(r, 200));
}
await shot('13-build', false);
// Swap one move on the first slot: the picker lists the legal pool with the recommendation
// ticked; tapping an unticked charged move bumps the one picked first.
await page.waitForSelector('.pick-moves b', { timeout: 60_000 });
await page.click('.pick-moves');
await page.waitForSelector('.move-opt[role="checkbox"]', { timeout: 60_000 });
await page.$$eval('.move-opt[role="checkbox"]:not(.on)', (rows) => rows[0]?.click());
await new Promise((r) => setTimeout(r, 300));
await shot('13b-build-moves', false);
await page.click('.scroll > .btn');
await page.waitForSelector('.custom-note, .scroll .error', { timeout: 120_000 });
const analyzeError = await page.$eval('.scroll .error', (e) => e.textContent).catch(() => null);
if (analyzeError) {
  throw new Error(`analyze failed: ${analyzeError}`);
}
console.log(`  custom team analyzed at ${Date.now() - t0} ms`);
const chosenNote = await page.$eval('.custom-note', (e) => e.textContent).catch(() => '');
if (!chosenNote || !chosenNote.includes('ran the moves you chose')) {
  throw new Error('custom team did not report the hand-picked moves');
}
await shot('14-custom-team');

console.log('add a pokemon by hand');
await page.goto(`${base}/#/add`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.search');
await page.type('.search', 'swampert');
await page.waitForSelector('.picker-list .spec-row');
await shot('15-add-search', false);
await page.click('.picker-list .spec-row');
await page.type('.field input[placeholder]', '1497');
await shot('16-add-form', false);
await page.click('.scroll > .btn');
await page.waitForSelector('.stat3, .verdict', { timeout: 60_000 });
await new Promise((r) => setTimeout(r, 600));
console.log(`  manual add landed at ${page.url()}`);
await shot('17-added', false);

console.log('filters sheet');
await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tabs');
await page.$eval('.tabs .tab:nth-child(4)', (el) => el.click());
await page.waitForSelector('.sheet');
await new Promise((r) => setTimeout(r, 400));
await shot('06-sheet', false);

console.log('light theme');
await page.emulateMediaFeatures([
  { name: 'prefers-color-scheme', value: 'light' },
  { name: 'prefers-reduced-motion', value: 'reduce' },
]);
await page.goto(`${base}/?light=1#/teams`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.team-card', { timeout: 60_000 });
await shot('07-teams-light', false);

await browser.close();
console.log(`done in ${Date.now() - t0} ms`);
if (errors.length > 0) {
  console.log('\nBrowser errors:');
  for (const e of errors) {
    console.log(`  ${e}`);
  }
  process.exitCode = 1;
}
