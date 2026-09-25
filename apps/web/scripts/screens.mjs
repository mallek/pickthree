/* global document, window */
/**
 * Drives the built app in the locally installed Chrome, imports the sample collection, and
 * screenshots every screen at phone size.
 *
 *   npm run web:screens
 *
 * That wrapper builds the app and serves it first. This script drives the BUILT app over HTTP and
 * builds nothing, so running it directly points it at whatever is already on the port, which may
 * be a stale dist. Do that only with a server you started yourself:
 *
 *   node apps/web/scripts/screens.mjs [baseUrl]
 *
 * Output: apps/web/screenshots/*.png (gitignored) plus a console log of timings and errors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { auditPage, forEachTheme, prepareAudit } from '../../../scripts/audit.mjs';

const AUDIT = process.argv.includes('--audit');
/** Screens held to the audit: a finding here fails the run. Each page redesign adds its own
 * screen names as it passes (design foundation, section 5). */
const AUDIT_ENFORCED = new Set([]);
const auditFindings = [];

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'screenshots');
const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
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
if (AUDIT) {
  await prepareAudit(page);
}
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

// Automation never reads the live worker: the community meta is answered from the synthetic
// fixture, and every other worker call is refused, as before (counter.ts and diag.ts already
// check navigator.webdriver). CDP-wide request interception (page.setRequestInterception) pauses
// every request in the browser, including the ones the compute worker makes for the static game
// data, and those never get resolved because interception is only handled on the page session, so
// the app hangs forever waiting on its own boot. Patching window.fetch on the document instead
// only touches the main thread's fetches, leaving the dedicated worker's fetches alone.
const communitySample = fs.readFileSync(
  path.join(here, '..', '..', '..', 'fixtures', 'community-meta-sample.json'),
  'utf8',
);
await page.evaluateOnNewDocument((sample) => {
  const native = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://pickthree-counter.travis-c82.workers.dev/api/v1/meta')) {
      return Promise.resolve(new Response(sample, { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return native(input, init);
  };
}, communitySample);

async function shot(name, fullPage = true) {
  await new Promise((r) => setTimeout(r, 350));
  if (!AUDIT) {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage });
    console.log(`  ${name}.png`);
    return;
  }
  await forEachTheme(page, async (theme) => {
    const file = path.join(outDir, `${name}-${theme}.png`);
    await page.screenshot({ path: file, fullPage });
    console.log(`  ${name}-${theme}.png`);
    for (const f of await auditPage(page)) {
      auditFindings.push({ name, line: `[${name} ${theme}] ${f}` });
    }
  });
}

const t0 = Date.now();
console.log('welcome');
await page.goto(`${base}/#/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('h1');
await shot('00-welcome', false);

console.log('import');
await page.goto(`${base}/#/import`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.scroll');
await shot('00b-import', false);

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

console.log('counters without a collection');
await page.goto(`${base}/#/counters`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.counter-row', { timeout: 120_000 });
const emptyChips = await page.$$eval('.chips .chip', (els) => els.map((e) => e.textContent));
if (emptyChips.includes('You own')) {
  throw new Error('counters without a collection still offers the You own filter');
}
await shot('18b-counters-no-collection', false);

console.log('import sample');
await page.goto(`${base}/?sample=1#/import`, { waitUntil: 'networkidle0' });
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

console.log('teams, community source');
await page.evaluate(() => {
  const select = [...document.querySelectorAll('label')]
    .find((l) => l.textContent?.startsWith('Source'))
    ?.querySelector('select');
  if (select) {
    select.value = 'ladder';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await page.waitForFunction(() => !document.querySelector('.ui-loading'), { timeout: 60_000 });
await shot('teams-community');
// Back to Your log, the default, so no later shot is community-weighted. The recommendation
// lags the select a tick, so wait for quiet, give the new run time to start, then wait again.
await page.evaluate(() => {
  const select = [...document.querySelectorAll('label')]
    .find((l) => l.textContent?.startsWith('Source'))
    ?.querySelector('select');
  if (select) {
    select.value = 'log';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
for (let i = 0; i < 2; i++) {
  await page.waitForFunction(
    () => document.querySelector('.team-card') && !document.querySelector('.ui-loading'),
    { timeout: 120_000 },
  );
  await new Promise((r) => setTimeout(r, 750));
}

console.log('ultra league');
await page.click('.league-switcher button:nth-child(2)');
await page.waitForFunction(
  () =>
    document.querySelector('.league-switcher[data-league="ultra"]') &&
    document.querySelector('.team-card') &&
    !document.querySelector('.ui-loading'),
  { timeout: 120_000 },
);
console.log(`  ultra teams rendered at ${Date.now() - t0} ms`);
await shot('19-teams-ultra', false);
await page.click('.league-switcher button:nth-child(1)');
// The switcher's data-league comes from settings and flips at once, while the recommendation
// lags a tick behind it. Without a settle these three conditions all pass on a frame where the
// PREVIOUS league's cards are still on screen, and the team href read below then points at a
// team that is about to stop existing. Wait for quiet, pause long enough for the new run to
// have started, then wait for quiet again.
const settled = async () => {
  for (let i = 0; i < 2; i++) {
    await page.waitForFunction(
      () =>
        document.querySelector('.league-switcher[data-league="great"]') &&
        document.querySelector('.team-card') &&
        !document.querySelector('.ui-loading'),
      { timeout: 120_000 },
    );
    await new Promise((r) => setTimeout(r, 750));
  }
};
await settled();

console.log('team detail');
const teamHref = await page.$eval('.team-card .team-details', (a) => a.getAttribute('href'));
await page.goto(`${base}/${teamHref}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.assump', { timeout: 60_000 }).catch(async () => {
  const text = await page.$eval('.screen', (e) => e.textContent.slice(0, 200));
  throw new Error(`team detail did not render: ${text}`);
});
await page.click('.assump-head');
await new Promise((r) => setTimeout(r, 300));
await shot('03-team-detail');

console.log('edit in build');
// Back from a recommended team loads it into Build for edits. Through the DOM: the sticky
// header sits under the update toast's spot, and a geometry click has missed here before.
await page.$eval('.hdr .back', (el) => el.click());
try {
  await page.waitForFunction(() => document.location.hash === '#/build', { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelectorAll('.pick-card.filled').length === 3, {
    timeout: 15_000,
  });
} catch (e) {
  const diag = await page.evaluate(() => ({
    hash: document.location.hash,
    filled: document.querySelectorAll('.pick-card.filled').length,
    toast: document.querySelector('.update-toast')?.textContent ?? null,
    text: document.body.innerText.slice(0, 300),
  }));
  console.log(`  edit in build did not land: ${JSON.stringify(diag)}`);
  throw e;
}
await page.goto(`${base}/${teamHref}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.take-to-battle', { timeout: 60_000 });

console.log('take to battle');
// The sample log has an open set with another team, so the confirm dialog appears.
page.once('dialog', (d) => void d.accept());
await page.click('.take-to-battle');
await page.waitForFunction(() => document.location.hash === '#/meta/log', { timeout: 30_000 });
await page.waitForSelector('.team-strip', { timeout: 30_000 });
const strip = await page.$eval('.team-strip', (e) => e.textContent ?? '');
if (!strip.trim()) {
  throw new Error('take to battle: empty team strip on Log a battle');
}
console.log(`  battling with ${strip.trim()}`);

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

console.log('leagues sheet sits above the tab bar');
await page.click('.page-head .league-more');
await page.waitForSelector('.ui-sheet');
await new Promise((r) => setTimeout(r, 300));
const sheetCheck = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.ui-league-row')];
  const last = rows[rows.length - 1];
  if (!last) {
    return { ok: false, reason: 'no rows in the Leagues sheet' };
  }
  const b = last.getBoundingClientRect();
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;
  const top = document.elementFromPoint(x, y);
  const ok = top !== null && (top === last || last.contains(top));
  return { ok, reason: `topmost at the last row's center is ${top?.className ?? top?.tagName ?? 'nothing'}, not the row itself` };
});
if (!sheetCheck.ok) {
  throw new Error(`Leagues sheet: ${sheetCheck.reason} (the tab bar or another layer is painting over it)`);
}
await shot('08c-leagues-sheet', false);
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });

console.log('leagues sheet opened from Settings still covers Settings');
await page.click('.cog.head-cog');
await page.waitForSelector('.sheet[role="dialog"]');
await new Promise((r) => setTimeout(r, 300));
await page.click('.sheet .league-more');
await page.waitForSelector('.ui-sheet');
await new Promise((r) => setTimeout(r, 300));
const nestedSheetCheck = await page.evaluate(() => {
  const done = [...document.querySelectorAll('.sheet .between button.btn-ghost')].find(
    (b) => b.textContent?.trim() === 'Done',
  );
  if (!done) {
    return { ok: false, reason: "could not find Settings' own Done button" };
  }
  const b = done.getBoundingClientRect();
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;
  const top = document.elementFromPoint(x, y);
  const coveredByLeagues = top !== null && (top.closest('.ui-overlay') !== null || top.closest('.ui-sheet') !== null);
  return {
    ok: coveredByLeagues,
    reason: `topmost at Settings' Done is ${top?.className ?? top?.tagName ?? 'nothing'}, not the Leagues overlay or sheet`,
  };
});
if (!nestedSheetCheck.ok) {
  throw new Error(`Leagues sheet nested in Settings: ${nestedSheetCheck.reason}`);
}
await shot('08d-leagues-sheet-in-settings', false);
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });
await page.click('.sheet .between button.btn-ghost');
await page.waitForSelector('.sheet', { hidden: true });

console.log('your meta');
await page.goto(`${base}/#/meta`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.set-card', { timeout: 60_000 });
await page.waitForSelector('.faced-row');
await shot('20-your-meta', false);

console.log('who beats one opponent');
const facedHref = await page.$eval('.faced-row', (a) => a.getAttribute('href'));
if (!facedHref || !facedHref.startsWith('#/counters?vs=')) {
  throw new Error(`most-faced row does not link to Counters: ${facedHref}`);
}
await page.goto(`${base}/${facedHref}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.counter-row, .scroll > p.muted', { timeout: 120_000 });
const vsTitle = await page.$eval('.page-head h2', (h) => h.textContent);
if (!vsTitle || !vsTitle.startsWith('Who Beats ')) {
  throw new Error(`counters vs view has the wrong title: ${vsTitle}`);
}
await shot('23-counters-vs', false);
await page.click('.page-head .back');
await page.waitForSelector('.set-card', { timeout: 60_000 });
if (!page.url().endsWith('#/meta')) {
  throw new Error(`back from the who-beats view landed at ${page.url()}`);
}

console.log('who beats an outsider (simulated on device)');
const outsiderHref = await page.$$eval('.faced-row', (rows) => {
  const r = rows.find((el) => el.textContent?.includes('outside the meta'));
  return r ? r.getAttribute('href') : null;
});
if (!outsiderHref) {
  throw new Error('the sample log has no most-faced outsider to simulate');
}
const tSim = Date.now();
await page.goto(`${base}/${outsiderHref}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.counter-row', { timeout: 120_000 });
console.log(`  outsider simulated at ${Date.now() - tSim} ms`);
const simNote = await page.$$eval('.page-head p.meta', (ps) =>
  ps.map((p) => p.textContent).join(' '),
);
if (!simNote.includes('simulated on this device')) {
  const diag = await page.evaluate(() => ({
    url: document.location.href,
    h2: document.querySelector('.page-head h2')?.textContent,
    first: document.querySelector('.counter-row')?.textContent?.slice(0, 120),
    rows: document.querySelectorAll('.counter-row').length,
  }));
  console.log(JSON.stringify(diag));
  throw new Error(`outsider view did not report the simulation: ${simNote}`);
}
await shot('24-counters-vs-outsider', false);

console.log('log a battle');
await page.goto(`${base}/#/meta/log`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.result-row');
// The recent grid shows while the search has focus and folds away after each pick.
await page.click('.search');
await page.waitForSelector('.recent-token');
await page.click('.recent-token');
await page.waitForFunction(() => !document.querySelector('.recent-token'));
await page.click('.search');
await page.waitForSelector('.recent-token');
await page.$$eval('.recent-token', (els) => els[1]?.click());
await page.waitForSelector('.faceoff .fo-table', { timeout: 60_000 });
const cardVerdicts = await page.$$eval('.fo-verdict', (els) => els.length);
if (cardVerdicts !== 3) {
  throw new Error(`in-battle card shows ${cardVerdicts} verdicts, expected 3`);
}
await new Promise((r) => setTimeout(r, 300));
await shot('21-log-battle', false);

console.log('new set');
await page.goto(`${base}/#/meta/new`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.opp-slot');
await shot('22-new-set', false);

console.log('suggest teammates around one pin');
await page.goto(`${base}/#/build`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.pick-card');
while (await page.$('.pick-x')) {
  await page.click('.pick-x');
  await new Promise((r) => setTimeout(r, 100));
}
{
  await page.$eval('.pick-card.empty', (el) => el.click());
  await page.waitForSelector('.search');
  await page.type('.search', 'skarmory');
  await page.waitForSelector('.recent-token', { timeout: 15_000 });
  await page.click('.recent-token');
  await page.waitForFunction(() => document.querySelectorAll('.pick-card.filled').length === 1);
  // The button only exists with something pinned and a slot still empty.
  const suggest = await page.waitForSelector('::-p-text(Suggest teammates)', { timeout: 15_000 });
  await suggest.click();
  await page.waitForFunction(
    () => document.querySelectorAll('.pick-card.filled').length === 3,
    { timeout: 30_000 },
  );
  await shot('12c-suggest-teammates', false);
}

console.log('build a team');
await page.goto(`${base}/#/build`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.pick-card');
// Earlier steps may have left picks in Build; start from empty slots.
while (await page.$('.pick-x')) {
  await page.click('.pick-x');
  await new Promise((r) => setTimeout(r, 100));
}
const buildQueries = [
  ['swampert', 'quagsire'],
  ['azu', 'azumarill'],
  ['tink', 'tinkaton'],
];
for (let i = 0; i < buildQueries.length; i++) {
  let picked = false;
  for (const q of buildQueries[i]) {
    // The search opens from the empty slot it will fill.
    if (!(await page.$('.search'))) {
      // Through the DOM: right after a pick the old slot node can detach under a geometry click.
      await page.$eval('.pick-card.empty', (el) => el.click());
      await page.waitForSelector('.search');
    }
    await page.click('.search', { clickCount: 3 });
    await page.type('.search', q);
    try {
      await page.waitForSelector('.recent-token', { timeout: 15_000 });
    } catch {
      continue;
    }
    await page.click('.recent-token');
    picked = true;
    break;
  }
  if (!picked) {
    throw new Error(`build a team: no matches for any of ${buildQueries[i].join(', ')}`);
  }
  await page.waitForFunction(
    (n) => document.querySelectorAll('.pick-card.filled').length >= n,
    {},
    i + 1,
  );
}
await shot('13-build', false);
// Drag the first card's grip onto the third slot: the order changes and becomes "Keep my order".
const namesBefore = await page.$$eval('.pick-card.filled .pick-name', (els) =>
  els.map((e) => e.firstChild?.textContent?.trim() ?? ''),
);
const grips = await page.$$('.drag-grip');
const fromBox = await grips[0].boundingBox();
const toCard = await (await page.$$('.pick-card.filled'))[2].boundingBox();
await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
await page.mouse.down();
await page.mouse.move(fromBox.x + fromBox.width / 2, toCard.y + toCard.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForFunction(
  (first) =>
    document.querySelector('.pick-card.filled .pick-name')?.firstChild?.textContent?.trim() !==
    first,
  { timeout: 5_000 },
  namesBefore[0],
);
const namesAfter = await page.$$eval('.pick-card.filled .pick-name', (els) =>
  els.map((e) => e.firstChild?.textContent?.trim() ?? ''),
);
if (namesAfter[2] !== namesBefore[0]) {
  throw new Error(`drag reorder: expected ${namesBefore[0]} last, got ${namesAfter.join(', ')}`);
}
console.log(`  dragged ${namesBefore[0]} to the third slot`);
// Swap one move on the first slot: the sheet lists the legal pool with the recommendation
// ticked; tapping an unticked charged move bumps the one picked first.
await page.click('.pick-card.filled');
await page.waitForSelector('.move-opt[role="checkbox"]', { timeout: 60_000 });
await page.$$eval('.move-opt[role="checkbox"]:not(.on)', (rows) => rows[0]?.click());
await new Promise((r) => setTimeout(r, 300));
await shot('13b-build-moves', false);
await page.click('.sheet .btn-ghost');
// Centre it first: near the bottom edge the fixed tab bar would take the click instead.
await page.$eval('.scroll > .btn', (el) => el.scrollIntoView({ block: 'center' }));
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

console.log('build with a species PvPoke does not rank');
await page.goto(`${base}/#/build`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.pick-x');
await page.click('.pick-x');
await page.$eval('.pick-card.empty', (el) => el.click());
await page.waitForSelector('.search');
await page.type('.search', 'magikarp');
await page.waitForSelector('.recent-token', { timeout: 15_000 });
await page.click('.recent-token');
await page.waitForFunction(() => document.querySelectorAll('.pick-card.filled').length >= 3);
const tUnranked = Date.now();
// Centre it first: near the bottom edge the fixed tab bar would take the click instead.
await page.$eval('.scroll > .btn', (el) => el.scrollIntoView({ block: 'center' }));
await page.click('.scroll > .btn');
await page.waitForSelector('.custom-note, .scroll .error', { timeout: 120_000 });
const unrankedError = await page.$eval('.scroll .error', (e) => e.textContent).catch(() => null);
if (unrankedError) {
  throw new Error(`analyze with an unranked pick failed: ${unrankedError}`);
}
console.log(`  unranked pick analyzed in ${Date.now() - tUnranked} ms`);
const unrankedNote = await page.$eval('.custom-note', (e) => e.textContent).catch(() => '');
if (!unrankedNote.includes('does not rank Magikarp')) {
  throw new Error(`custom team did not report the simulated pick: ${unrankedNote}`);
}
await shot('14b-custom-unranked');

console.log('shared team link');
await page.goto(`${base}/#/t/great/azumarill.BUBBLE.ICE_BEAM.PLAY_ROUGH+tinkaton+clodsire`, {
  waitUntil: 'networkidle0',
});
await page.waitForSelector('.custom-note, .scroll .error', { timeout: 120_000 });
const sharedError = await page.$eval('.scroll .error', (e) => e.textContent).catch(() => null);
if (sharedError) {
  throw new Error(`shared team failed: ${sharedError}`);
}
const sharedNote = await page.$$eval('.custom-note', (els) =>
  els.map((e) => e.textContent).join(' '),
);
if (!sharedNote.includes('Shared team link')) {
  throw new Error(`shared team did not say it was shared: ${sharedNote}`);
}
if (!page.url().endsWith('#/build/team')) {
  throw new Error(`shared team landed at ${page.url()}`);
}
await shot('14c-shared-team', false);

console.log('add a pokemon by hand');
await page.goto(`${base}/#/add`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.search');
await page.type('.search', 'swampert');
await page.waitForSelector('.recent-row .recent-token');
await shot('15-add-search', false);
await page.click('.recent-row .recent-token');
await page.waitForSelector('.pick-slot');
await page.type('.field input[placeholder]', '1497');
await shot('16-add-form', false);
// Centre it first: near the bottom edge the fixed tab bar would take the click instead.
await page.$eval('.scroll > .btn', (el) => el.scrollIntoView({ block: 'center' }));
await page.click('.scroll > .btn');
await page.waitForSelector('.stat3, .verdict', { timeout: 60_000 });
await new Promise((r) => setTimeout(r, 600));
console.log(`  manual add landed at ${page.url()}`);
await shot('17-added', false);

console.log('settings sheet');
await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
// Teams now carries two `.head-cog` buttons (the meta link, then the settings cog); `.cog` picks
// the settings one specifically.
await page.waitForSelector('.cog.head-cog');
await page.click('.cog.head-cog');
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
if (AUDIT) {
  const enforced = auditFindings.filter((f) => AUDIT_ENFORCED.has(f.name));
  const reported = auditFindings.filter((f) => !AUDIT_ENFORCED.has(f.name));
  if (reported.length > 0) {
    console.log(`\nAudit findings on screens not yet redesigned (${reported.length}, not failing):`);
    for (const f of reported) {
      console.log(`  ${f.line}`);
    }
  }
  if (enforced.length > 0) {
    console.log('\nAudit findings on audited screens:');
    for (const f of enforced) {
      console.log(`  ${f.line}`);
    }
    process.exitCode = 1;
  }
}
if (errors.length > 0) {
  console.log('\nBrowser errors:');
  for (const e of errors) {
    console.log(`  ${e}`);
  }
  process.exitCode = 1;
}
