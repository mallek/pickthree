/* global document, window, indexedDB */
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
const AUDIT_ENFORCED = new Set([
  '02-teams',
  'teams-second-open',
  'teams-community',
  '19-teams-ultra',
  'teams-cup',
  'teams-filters-sheet',
  'teams-no-collection',
  'teams-loading',
  'teams-empty',
  'build-empty',
  'build-choosing',
  'build-suggestions',
  '13-build',
  '13b-build-moves',
  'build-cost',
  '03-team-detail',
  '14-custom-team',
  '14b-custom-unranked',
  '14c-shared-team',
  'analysis-confirm',
  'analysis-not-found',
]);
const auditFindings = [];
/** Every shot name taken this run, so an audit run can tell an enforced name that never ran. */
const captured = new Set();

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

/**
 * `mustShow`: a selector that has to be on the page when each shot is taken, for states that do
 * not last (a loading card), so a shot that missed its state fails instead of passing quietly.
 */
async function shot(name, fullPage = true, { mustShow } = {}) {
  captured.add(name);
  await new Promise((r) => setTimeout(r, 350));
  // A full-page shot resizes the viewport to the page instead of stitching past it, so the fixed
  // tab bar lands at the true bottom rather than across the middle of the page.
  const options = fullPage ? { fullPage, captureBeyondViewport: false } : { fullPage };
  const take = async (file) => {
    await page.screenshot({ path: file, ...options });
    if (mustShow && !(await page.$(mustShow))) {
      throw new Error(`${name}: ${mustShow} was gone when the shot was taken`);
    }
  };
  if (!AUDIT) {
    const file = path.join(outDir, `${name}.png`);
    await take(file);
    console.log(`  ${name}.png`);
    return;
  }
  await forEachTheme(page, async (theme) => {
    const file = path.join(outDir, `${name}-${theme}.png`);
    await take(file);
    console.log(`  ${name}-${theme}.png`);
    for (const f of await auditPage(page)) {
      auditFindings.push({ name, line: `[${name} ${theme}] ${f}` });
    }
  });
}

/** A sub header's title stays centred on the page, whatever sits in its side slots. */
async function assertTitleCentred(where) {
  const offset = await page.evaluate(() => {
    const title = document.querySelector('.hdr .hdr-title > span');
    if (!title) {
      return null;
    }
    const r = title.getBoundingClientRect();
    return r.left + r.width / 2 - window.innerWidth / 2;
  });
  console.log(`  ${where} header title off centre by ${offset?.toFixed(1)}px`);
  if (offset === null || Math.abs(offset) > 1) {
    throw new Error(`${where}: the header title is off centre by ${offset}px`);
  }
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

console.log('teams without a collection');
await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.choice-card');
await shot('teams-no-collection', false);

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
await page.waitForSelector('.ui-expand-head', { timeout: 120_000 });
console.log(`  teams rendered at ${Date.now() - t0} ms`);
await shot('02-teams');
// The collapsed row's summary sits inside the ExpandRow head with no box of its own. A shared
// class name once pulled Your Meta's bordered .team-row rule onto it.
const summaryBorder = await page.evaluate(() => {
  const el = document.querySelector('.ui-expand-head .team-summary');
  return el ? window.getComputedStyle(el).borderTopWidth : null;
});
if (summaryBorder !== '0px') {
  throw new Error(`teams: the row summary has a border (${summaryBorder}); it should have no box`);
}
// The top header shares the page head's gutter: the title's left edge and the last icon button's
// right edge line up with the league row under them. The row, not the radiogroup inside it: the
// "..." overflow button sits to the right of .league-switcher, inside .league-row.
const headEdges = await page.evaluate(() => {
  const title = document.querySelector('.page-head .ui-top-title h2');
  const buttons = document.querySelectorAll('.page-head .ui-top-actions > *');
  const last = buttons[buttons.length - 1];
  const league =
    document.querySelector('.page-head .league-row') ?? document.querySelector('.page-head .league-switcher');
  if (!title || !last || !league) {
    return null;
  }
  const l = league.getBoundingClientRect();
  return {
    left: title.getBoundingClientRect().left - l.left,
    right: last.getBoundingClientRect().right - l.right,
  };
});
if (!headEdges || Math.abs(headEdges.left) > 1 || Math.abs(headEdges.right) > 1) {
  throw new Error(`teams: the header is off the league row's edges: ${JSON.stringify(headEdges)}`);
}
const stats = await page.$eval('.scroll > p.meta', (p) => p.textContent).catch(() => '');
console.log(`  ${stats}`);

console.log('teams, second row open');
await page.$$eval('.ui-expand-head', (heads) => heads[1]?.click());
await page.waitForFunction(
  () => document.querySelectorAll('.ui-expand-head')[1]?.getAttribute('aria-expanded') === 'true',
);
await shot('teams-second-open');
// Close it again, so every later shot starts from the default: only the first row open.
await page.$$eval('.ui-expand-head', (heads) => heads[1]?.click());
await page.waitForFunction(
  () => document.querySelectorAll('.ui-expand-head')[1]?.getAttribute('aria-expanded') === 'false',
);

console.log('teams, filters sheet');
await page.click('.teams-controls .ui-filter-icon');
await page.waitForSelector('.sheet[aria-label="Filters"]');
await new Promise((r) => setTimeout(r, 400));
await shot('teams-filters-sheet', false);
await page.$eval('.sheet[aria-label="Filters"] .between button.btn-ghost', (el) => el.click());
await page.waitForSelector('.sheet[aria-label="Filters"]', { hidden: true });

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
// Back to Your meta (the log), the default, so no later shot is community-weighted. The recommendation
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
    () => document.querySelector('.ui-expand-head') && !document.querySelector('.ui-loading'),
    { timeout: 120_000 },
  );
  await new Promise((r) => setTimeout(r, 750));
}

console.log('ultra league');
await page.click('.league-switcher button:nth-child(2)');
// The Teams loading card. Ultra's run takes a few seconds, less than two shots and their audits,
// so the compute worker is held at a debugger pause while the card is shot and let go after. The
// pause is automation only, through the worker's CDP session; the app has no hook for it. Pause
// only once the league bundle has landed (data-league flips to ultra): a worker paused while its
// bundle fetch is in flight never finishes the run after it resumes.
await page.waitForFunction(
  () =>
    document.querySelector('.league-switcher[data-league="ultra"]') &&
    document.querySelector('.teams-list .ui-loading'),
  { timeout: 30_000, polling: 'mutation' },
);
const computeWorkers = page.workers();
for (const w of computeWorkers) {
  await w.client.send('Debugger.enable');
  await w.client.send('Debugger.pause');
}
await shot('teams-loading', false, { mustShow: '.teams-list .ui-loading' });
for (const w of computeWorkers) {
  await w.client.send('Debugger.resume');
  await w.client.send('Debugger.disable');
}
await page.waitForFunction(
  () =>
    document.querySelector('.league-switcher[data-league="ultra"]') &&
    document.querySelector('.ui-expand-head') &&
    !document.querySelector('.ui-loading'),
  { timeout: 120_000 },
);
console.log(`  ultra teams rendered at ${Date.now() - t0} ms`);
await shot('19-teams-ultra', false);

console.log('tournament cup');
await page.click('.page-head .league-more');
await page.waitForSelector('.ui-sheet .ui-league-row');
await page.$$eval('.ui-sheet .ui-league-row', (rows) =>
  rows.find((r) => r.textContent?.trim() === 'Tournament')?.click(),
);
await page.waitForSelector('.ui-sheet', { hidden: true });
for (let i = 0; i < 2; i++) {
  await page.waitForFunction(
    () =>
      document.querySelector('.league-switcher[data-league="championshipseries"]') &&
      document.querySelector('.ui-expand-head') &&
      !document.querySelector('.ui-loading'),
    { timeout: 120_000 },
  );
  await new Promise((r) => setTimeout(r, 750));
}
await shot('teams-cup', false);
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
        document.querySelector('.ui-expand-head') &&
        !document.querySelector('.ui-loading'),
      { timeout: 120_000 },
    );
    await new Promise((r) => setTimeout(r, 750));
  }
};
await settled();

console.log('teams, empty');
// Deterministic: exclude every specimen in the saved settings, reload, shoot the Empty card, then
// put the saved settings back exactly as they were and reload again.
const savedSettings = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('pickthree');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(['settings', 'collection'], 'readwrite');
        const settings = tx.objectStore('settings');
        const getSettings = settings.get('current');
        const getCollection = tx.objectStore('collection').get('current');
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
        getCollection.onsuccess = () => {
          const before = getSettings.result;
          const ids = (getCollection.result?.specimens ?? []).map((sp) => sp.id);
          settings.put({ ...before, excludedSpecimenIds: ids });
          resolve(before);
        };
      };
    }),
);
if (!savedSettings) {
  throw new Error('teams, empty: no saved settings to restore afterwards');
}
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.teams-list .ui-empty', { timeout: 120_000 });
await shot('teams-empty', false);
await page.evaluate(
  (before) =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('pickthree');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put(before);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    }),
  savedSettings,
);
await page.reload({ waitUntil: 'networkidle0' });
await settled();

console.log('team detail');
// The first row is open by default, so its "View analysis" link is in the DOM already.
const teamHref = await page.$eval('.teams-actions a', (a) => a.getAttribute('href'));
await page.goto(`${base}/${teamHref}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.assump', { timeout: 60_000 }).catch(async () => {
  const text = await page.$eval('.screen', (e) => e.textContent.slice(0, 200));
  throw new Error(`team detail did not render: ${text}`);
});
await assertTitleCentred('team analysis');
await page.click('.assump-head');
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => window.scrollTo(0, 0));
await shot('03-team-detail');

console.log('team analysis, "+N more" owns its whole target');
// The sample lead has more than six safe types. Its toggle's 44px box must be the topmost thing at
// its own top and bottom edges: nothing painted over it, and it over nothing.
const moreHits = await page.evaluate(() => {
  const more = [...document.querySelectorAll('.safe-types .ui-btn')].find((b) =>
    /^\+\d+ more$/.test(b.textContent?.trim() ?? ''),
  );
  if (!more) {
    return null;
  }
  more.scrollIntoView({ block: 'center' });
  const r = more.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const chips = more.parentElement?.querySelector('.tchips')?.getBoundingClientRect();
  return {
    owns: [r.top + 1, r.bottom - 1].every((y) => {
      const top = document.elementFromPoint(x, y);
      return top !== null && (top === more || more.contains(top));
    }),
    clear: chips !== undefined && chips.bottom <= r.top + 0.5,
  };
});
if (!moreHits || !moreHits.owns || !moreHits.clear) {
  throw new Error(`"+N more": its target is covered or overlaps the chips: ${JSON.stringify(moreHits)}`);
}
await page.evaluate(() => window.scrollTo(0, 0));

console.log('team analysis jumps land under the sticky header');
for (const [label, id] of [
  ['Battle plan', 'plan'],
  ['Matchups', 'matchups'],
  ['Pokémon', 'pokemon'],
  ['Details', 'details'],
]) {
  // From the top of the page each time: the heading starts well below the header (below the
  // fold for all but Battle plan), so landing just under the header proves the jump moved it.
  await page.evaluate(() => window.scrollTo(0, 0));
  const where = (target) =>
    page.evaluate((t) => {
      const heading = document.getElementById(t);
      const hdr = document.querySelector('.hdr');
      if (!heading || !hdr) {
        return null;
      }
      return { top: heading.getBoundingClientRect().top, hdr: hdr.getBoundingClientRect().bottom };
    }, target);
  const before = await where(id);
  const clicked = await page.$$eval(
    '.analysis-jumps .ui-btn',
    (els, l) => {
      const b = els.find((e) => e.textContent?.trim() === l);
      b?.click();
      return Boolean(b);
    },
    label,
  );
  if (!clicked) {
    throw new Error(`jump row: no "${label}" button`);
  }
  // Until the heading stops moving (the automation asks for reduced motion, so the jump should be
  // instant, but a smooth scroll would still settle here), for up to three seconds.
  let landed = await where(id);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const next = await where(id);
    const settled = next && landed && Math.abs(next.top - landed.top) < 0.5;
    landed = next;
    if (settled) {
      break;
    }
  }
  // Just under the header: not behind it, not past a too-large scroll margin (about 8px today).
  const gap = landed ? landed.top - landed.hdr : NaN;
  if (!before || !landed || before.top - before.hdr <= 24 || !(gap >= 0 && gap <= 24)) {
    throw new Error(
      `jump to ${label}: heading from ${before?.top}px to ${landed?.top}px, header ends at ${landed?.hdr}px`,
    );
  }
  console.log(
    `  ${label}: from ${(before.top - before.hdr).toFixed(0)}px to ${gap.toFixed(1)}px under the header`,
  );
}
await page.evaluate(() => window.scrollTo(0, 0));

console.log('team analysis strip tap lands its row under the sticky header');
{
  // The second member's row starts closed and far below the fold; a tap opens it and brings its
  // head (role and name) just under the header, measured the same way as the jumps.
  const row = () =>
    page.evaluate(() => {
      const el = document.getElementById('pokemon-1');
      const hdr = document.querySelector('.hdr');
      if (!el || !hdr) {
        return null;
      }
      return {
        top: el.getBoundingClientRect().top,
        hdr: hdr.getBoundingClientRect().bottom,
        open: el.querySelector('.ui-expand-head')?.getAttribute('aria-expanded') ?? null,
      };
    });
  const before = await row();
  const tapped = await page.$$eval('.analysis-strip-member', (els) => {
    els[1]?.click();
    return els.length;
  });
  if (tapped < 2) {
    throw new Error(`strip: ${tapped} members, no second one to tap`);
  }
  let landed = await row();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const next = await row();
    const settled = next && landed && Math.abs(next.top - landed.top) < 0.5;
    landed = next;
    if (settled) {
      break;
    }
  }
  const gap = landed ? landed.top - landed.hdr : NaN;
  if (
    !before ||
    !landed ||
    before.top - before.hdr <= 24 ||
    !(gap >= 0 && gap <= 24) ||
    landed.open !== 'true'
  ) {
    throw new Error(
      `strip tap: row from ${before?.top}px to ${landed?.top}px (open ${landed?.open}), header ends at ${landed?.hdr}px`,
    );
  }
  console.log(
    `  second member: from ${(before.top - before.hdr).toFixed(0)}px to ${gap.toFixed(1)}px under the header, open`,
  );
}
await page.evaluate(() => window.scrollTo(0, 0));

console.log('team analysis, reloaded');
// A real reload drops the recommendation from memory; the screen runs it again and shows the
// team, never the not-found state (page.goto to another hash keeps state, so only this proves it).
await page.reload({ waitUntil: 'networkidle0' });
await page
  .waitForFunction(
    () => document.querySelector('.score-card') || document.querySelector('.ui-empty, .ui-error'),
    { timeout: 120_000 },
  )
  .catch(() => {
    throw new Error('team analysis, reloaded: nothing rendered');
  });
const reloaded = await page.evaluate(() => ({
  card: Boolean(document.querySelector('.score-card')),
  text: document.querySelector('.scroll')?.textContent?.slice(0, 200) ?? '',
}));
if (!reloaded.card) {
  throw new Error(`team analysis, reloaded: no score card: ${reloaded.text}`);
}

console.log('edit in build');
// Edit team loads a recommended team into Build for edits. Through the DOM: the sticky header
// sits under the update toast's spot, and a geometry click has missed here before.
await page.$eval('.analysis-edit .ui-btn-text', (el) => el.click());
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
await page.waitForSelector('.score-card .ui-btn-primary', { timeout: 60_000 });

console.log('take to battle');
// The sample log has an open set with another team, so the switch-teams sheet opens. Keep it
// first (the set stays, the analysis stays), then again and Switch.
await page.click('.score-card .ui-btn-primary');
await page.waitForSelector('.ui-confirm', { timeout: 10_000 }).catch(() => {
  throw new Error('take to battle: no switch-teams sheet opened over the running set');
});
await new Promise((r) => setTimeout(r, 300));
await shot('analysis-confirm', false, { mustShow: '.ui-confirm' });
/** Clicks the switch-teams sheet's button with this label; false when there is none. */
const confirmButton = (label) =>
  page.$$eval(
    '.ui-confirm .ui-btn',
    (els, l) => {
      const b = els.find((e) => e.textContent?.trim() === l);
      b?.click();
      return Boolean(b);
    },
    label,
  );
if (!(await confirmButton('Keep it'))) {
  throw new Error('switch-teams sheet: no "Keep it" button');
}
await page.waitForSelector('.ui-confirm', { hidden: true });
if (!page.url().endsWith(teamHref)) {
  throw new Error(`Keep it left the analysis for ${page.url()}`);
}
await page.click('.score-card .ui-btn-primary');
await page.waitForSelector('.ui-confirm', { timeout: 10_000 });
if (!(await confirmButton('Switch'))) {
  throw new Error('switch-teams sheet: no "Switch" button');
}
await page.waitForFunction(() => document.location.hash === '#/meta/log', { timeout: 30_000 });
await page.waitForSelector('.team-strip', { timeout: 30_000 });
const strip = await page.$eval('.team-strip', (e) => e.textContent ?? '');
if (!strip.trim()) {
  throw new Error('take to battle: empty team strip on Log a battle');
}
console.log(`  battling with ${strip.trim()}`);

console.log('team analysis, not found');
await page.goto(`${base}/#/teams/does-not-exist`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.ui-empty', { timeout: 30_000 });
const notFoundLine = await page.$eval('.ui-empty', (e) => e.textContent ?? '');
if (!notFoundLine.includes('not in the current results')) {
  throw new Error(`team analysis, not found: the wrong empty state: ${notFoundLine}`);
}
await shot('analysis-not-found', false, { mustShow: '.ui-empty' });

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
// Full page, so the set list ("Your teams") is in the capture, and its rows keep their own grid:
// the Teams summary once shared the .team-row name and turned these rows into a flex line.
await shot('20-your-meta');
const setRowDisplay = await page.evaluate(() => {
  const row = document.querySelector('.team-row');
  return row ? window.getComputedStyle(row).display : 'grid';
});
if (setRowDisplay !== 'grid') {
  throw new Error(`your meta: a set row is display ${setRowDisplay}, not grid`);
}

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
await assertTitleCentred('log a battle');

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
await shot('build-empty', false);
// The sub header lines up with the page under it: the back chevron's drawn left edge (its path,
// not the svg box, which pads it) and the settings button's right edge sit on the league row's
// edges, as on Teams. The path's box leaves out half the stroke, so the chevron reads about 1px
// left of what is measured; 2.5px of slack on that side covers it.
const buildEdges = await page.evaluate(() => {
  const chevron = document.querySelector('.hdr .back svg path');
  const buttons = document.querySelectorAll('.hdr .hdr-actions > *');
  const last = buttons[buttons.length - 1];
  const league =
    document.querySelector('.build-scroll .league-row') ??
    document.querySelector('.build-scroll .league-switcher');
  if (!chevron || !last || !league) {
    return null;
  }
  const l = league.getBoundingClientRect();
  return {
    left: chevron.getBoundingClientRect().left - l.left,
    right: last.getBoundingClientRect().right - l.right,
  };
});
console.log(`  build header edges ${JSON.stringify(buildEdges)}`);
if (!buildEdges || Math.abs(buildEdges.left) > 2.5 || Math.abs(buildEdges.right) > 1) {
  throw new Error(`build: the header is off the league row's edges: ${JSON.stringify(buildEdges)}`);
}
await assertTitleCentred('build');
// The Lead slot's search, open with nothing typed: the choosing line, the input and the suggested
// grid under it.
await page.$eval('.pick-card.empty', (el) => el.click());
await page.waitForSelector('.search');
await page.waitForSelector('.recent-token', { timeout: 15_000 });
await shot('build-choosing', false, { mustShow: '.build-choose .recent-token' });
await page.keyboard.press('Escape');
await page.waitForSelector('.search', { hidden: true });
{
  await page.$eval('.pick-card.empty', (el) => el.click());
  await page.waitForSelector('.search');
  await page.type('.search', 'skarmory');
  await page.waitForSelector('.recent-token', { timeout: 15_000 });
  await page.click('.recent-token');
  await page.waitForFunction(() => document.querySelectorAll('.pick-card.filled').length === 1);
  // Suggestions run on their own with one pick on the board, and never fill a slot.
  await page.waitForSelector('.mate-row', { timeout: 30_000 });
  const filledWithSuggestions = await page.$$eval('.pick-card.filled', (els) => els.length);
  if (filledWithSuggestions !== 1) {
    throw new Error(
      `suggest teammates: ${filledWithSuggestions} slots filled; suggestions must not fill slots`,
    );
  }
  await shot('build-suggestions', false, { mustShow: '.mate-row' });
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
if (!(await page.$('.build-cost'))) {
  throw new Error('build a team: no cost line under a full lineup');
}
// Each role pill reads on one line, clear of the text column ("Safe Switch" is the longest).
const pills = await page.$$eval('.pick-role-pill', (els) =>
  els.map((el) => {
    const lines = new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size;
    const range = document.createRange();
    range.selectNodeContents(el);
    const textLines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    // Inside the card, and at least 4px clear of the text column to its right.
    const card = el.closest('.pick-card').getBoundingClientRect();
    const text = el.closest('.pick-card').querySelector('.pick-card-body').getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return {
      text: el.textContent,
      oneLine: lines === 1 && textLines === 1,
      fits: box.left >= card.left + 4 && box.right <= text.left - 4,
      width: Math.round(box.width),
    };
  }),
);
const badPill = pills.find((p) => !p.oneLine || !p.fits);
if (pills.length !== 3 || badPill) {
  throw new Error(`build a team: a role pill wraps or spills: ${JSON.stringify(pills)}`);
}
console.log(`  role pills ${pills.map((p) => `${p.text} ${p.width}px`).join(', ')}`);
// Full page from the top, as the Teams shots are: nothing sits half under the sticky header, and
// the cost line under the cards is in the shot.
await page.evaluate(() => window.scrollTo(0, 0));
await shot('13-build', true, { mustShow: '.build-cost' });
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
// ticked. Nothing is bumped: with two charged moves ticked the others are disabled, so untick one
// first, then tick the first one that is free.
await page.$eval('.pick-card.filled', (el) => el.click());
await page.waitForSelector('.ui-sheet[role="dialog"] .move-opt[role="checkbox"]', {
  timeout: 60_000,
});
const ticked = await page.$$eval('.move-opt[role="checkbox"].on', (rows) => rows.length);
if (ticked === 2) {
  await page.$$eval('.move-opt[role="checkbox"].on', (rows) => rows[1]?.click());
  await page.waitForFunction(
    () => document.querySelectorAll('.move-opt[role="checkbox"].on').length === 1,
  );
}
const swapped = await page.$$eval('.move-opt[role="checkbox"]:not(.on):not(:disabled)', (rows) => {
  const row = rows[0];
  row?.click();
  return row ? (row.querySelector('.move-name')?.textContent ?? '') : null;
});
if (swapped === null) {
  throw new Error('move sheet: no charged move free to tick after unticking one');
}
await page.waitForFunction(
  () => document.querySelectorAll('.move-opt[role="checkbox"].on').length === 2,
);
console.log(`  ticked ${swapped}`);
await new Promise((r) => setTimeout(r, 300));
await shot('13b-build-moves', false, { mustShow: '.ui-sheet .move-opt' });
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });
// Centre it first: near the bottom edge the fixed tab bar would take the click instead.
await page.$eval('.scroll > .ui-btn-primary', (el) => el.scrollIntoView({ block: 'center' }));
await page.click('.scroll > .ui-btn-primary');
await page.waitForSelector('.custom-note, .ui-error', { timeout: 120_000 });
const analyzeError = await page.$eval('.ui-error', (e) => e.textContent).catch(() => null);
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
await page.$eval('.scroll > .ui-btn-primary', (el) => el.scrollIntoView({ block: 'center' }));
await page.click('.scroll > .ui-btn-primary');
await page.waitForSelector('.custom-note, .ui-error', { timeout: 120_000 });
const unrankedError = await page.$eval('.ui-error', (e) => e.textContent).catch(() => null);
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
// SharedTeam shows its own failures as `.scroll .error` before it hands off; the analysis shows
// `.ui-error`. Either one fails the step with its reason.
await page.waitForSelector('.custom-note, .ui-error, .scroll .error', { timeout: 120_000 });
const sharedError = await page.$eval('.ui-error, .scroll .error', (e) => e.textContent).catch(() => null);
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
await shot('14c-shared-team');

console.log('build from your own pokemon: the total to build');
// After the custom-team shots, so they keep their own team. Three of your own Pokémon from the
// Suggested grid (its "yours" tokens), so the cost line prints a real total.
await page.goto(`${base}/#/build`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.pick-card');
while (await page.$('.pick-x')) {
  await page.click('.pick-x');
  await new Promise((r) => setTimeout(r, 100));
}
const ownPicks = [];
for (let i = 0; i < 3; i++) {
  await page.$eval('.pick-card.empty', (el) => el.click());
  await page.waitForSelector('.build-choose .recent-token', { timeout: 15_000 });
  // Verdicts decide which tokens are yours; they may land a moment after the grid does.
  const picked = await page
    .waitForFunction(
      (taken) => {
        const token = [...document.querySelectorAll('.build-choose .recent-token')].find(
          (el) =>
            [...el.querySelectorAll('.ui-tag')].some((t) => t.textContent?.trim() === 'yours') &&
            !taken.includes(el.getAttribute('aria-label')),
        );
        if (!token) {
          return null;
        }
        const label = token.getAttribute('aria-label');
        // Through the DOM: a click event alone keeps the search's focus, as a tap on the grid does.
        token.click();
        return label;
      },
      { timeout: 60_000 },
      ownPicks,
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  if (!picked) {
    throw new Error(`build cost: no "yours" token left in the Suggested grid for slot ${i + 1}`);
  }
  ownPicks.push(picked);
  await page.waitForFunction(
    (n) => document.querySelectorAll('.pick-card.filled').length === n,
    { timeout: 15_000 },
    i + 1,
  );
}
console.log(`  built ${ownPicks.join(', ')}`);
try {
  await page.waitForFunction(
    () => document.querySelector('.build-cost')?.textContent?.includes('Total to build'),
    { timeout: 60_000 },
  );
} catch {
  const costText = await page.$eval('.build-cost', (e) => e.textContent).catch(() => null);
  throw new Error(`build cost: the total never appeared (cost line: ${costText})`);
}
// Full page from the top, like 13-build: the lineup and its total in one shot, nothing under the
// sticky header.
await page.evaluate(() => window.scrollTo(0, 0));
await shot('build-cost', true, { mustShow: '.build-cost' });

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
// Teams carries two IconButtons (the meta link, then Settings); the aria-label picks the
// settings one specifically.
await page.waitForSelector('button[aria-label="Settings"]');
await page.click('button[aria-label="Settings"]');
await page.waitForSelector('.sheet');
await new Promise((r) => setTimeout(r, 400));
await shot('06-sheet', false);

console.log('light theme');
await page.emulateMediaFeatures([
  { name: 'prefers-color-scheme', value: 'light' },
  { name: 'prefers-reduced-motion', value: 'reduce' },
]);
await page.goto(`${base}/?light=1#/teams`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.ui-expand-head', { timeout: 60_000 });
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
  // A renamed or dropped shot would otherwise take its enforcement with it, silently.
  const neverCaptured = [...AUDIT_ENFORCED].filter((name) => !captured.has(name));
  if (neverCaptured.length > 0) {
    console.log(`\nAudited screens never captured: ${neverCaptured.join(', ')}`);
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
