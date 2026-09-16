/**
 * Full-page captures of every screen, first with no collection and then with the sample, for a
 * polish review. Run `npx vite preview --port 4173` in apps/web first.
 *
 *   node apps/web/scripts/review.mjs [baseUrl]
 *
 * Output: apps/web/screenshots/review/*.png (gitignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'screenshots', 'review');
const base = process.argv[2] ?? 'http://localhost:4173';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) {
  fs.unlinkSync(path.join(outDir, f));
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-gpu'],
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

async function shot(name, fullPage = true) {
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage });
  console.log(`  ${name}.png`);
}
async function go(hash, waitFor) {
  await page.goto(`${base}/${hash}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector(waitFor, { timeout: 120_000 });
}

console.log('no collection');
await go('#/', 'h1');
await shot('a0-welcome');
await go('#/teams', '.choice-card');
await shot('a1-teams-empty', false);
await go('#/counters', '.choice-card');
await shot('a2-counters-empty', false);
await go('#/collection', '.choice-card');
await shot('a3-collection-empty', false);
await go('#/build', '.pick-slot');
await shot('a4-build-empty', false);
await page.click('.pick-slot');
await page.waitForSelector('.picker');
await shot('a5-build-picker-empty', false);
await go('#/add', '.search');
await shot('a6-add', false);
await go('#/teams', '.tabs');
await page.click('.head-cog');
await page.waitForSelector('.sheet');
await shot('a7-sheet-empty');

console.log('with the sample');
await go('?sample=1#/', '.kicker');
await shot('b0-report');
await go('#/teams', '.team-card');
await shot('b1-teams');
const teamHref = await page.$eval('.team-card', (a) => a.getAttribute('href'));
await go(teamHref, '.assump');
await page.click('.assump-head');
await shot('b2-team-detail');
await go('#/collection', '.verdict');
await shot('b3-collection');
const specHref = await page.$eval('.spec-row', (a) => a.getAttribute('href'));
await go(specHref, '.stat3, .verdict');
await shot('b4-specimen');
await go('#/counters', '.counter-row');
await shot('b5-counters');
await go('#/build', '.pick-slot');
await shot('b6-build', false);
await go('#/teams', '.tabs');
await page.click('.head-cog');
await page.waitForSelector('.sheet');
await shot('b7-sheet');
await page.emulateMediaFeatures([
  { name: 'prefers-color-scheme', value: 'light' },
  { name: 'prefers-reduced-motion', value: 'reduce' },
]);
await go('#/teams', '.team-card');
await shot('c0-teams-light', false);
await go('#/collection', '.verdict');
await shot('c1-collection-light', false);
await go('#/', 'h1');
await shot('c2-welcome-light', false);
await browser.close();
console.log('done');
