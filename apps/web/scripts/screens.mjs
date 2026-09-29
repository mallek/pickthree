/* global document, window, indexedDB, getComputedStyle, DataTransfer */
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
// The game's CP multiplier table, straight from the engine (Node strips the types), for the one
// Pokémon the run seeds at its build level.
import { cpmForLevel } from '../../../packages/engine/src/tables/cpm.ts';

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
  'teams-filters-excluded',
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
  '20-your-meta',
  'your-meta-active',
  '21-log-battle',
  'log-battle-card',
  'log-battle-likely',
  'log-battle-saved',
  'log-battle-edit',
  'log-battle-wide',
  '22-new-set',
  'new-set-searching',
  'settings-hub',
  'settings-hub-no-collection',
  'settings-your-data',
  'settings-your-data-excluded',
  'settings-log-imported',
  'settings-community',
  'settings-community-sent',
  'settings-appearance',
  'settings-about',
  'settings-about-leaves',
  'settings-confirm-forget',
  'settings-confirm-fresh',
  'settings-confirm-sharing',
  'settings-confirm-include-all',
  '04-collection',
  '11-collection-group',
  'collection-flat',
  'collection-filters-sheet',
  'collection-judging',
  'collection-empty',
  'collection-excluded',
  '05-specimen',
  'specimen-built',
  'specimen-evolve',
  'specimen-excluded',
  'specimen-manual',
  'specimen-remove-confirm',
  'specimen-not-found',
  '08-counters',
  'counters-filters',
  '18b-counters-no-collection',
  '23-counters-vs',
  'counters-vs-filling',
  'counters-loading',
  '24-counters-vs-outsider',
  'counters-against',
  'counters-against-search',
  'counters-against-scrolled',
  'counters-unranked',
  'counters-error',
]);
const auditFindings = [];
/** Every shot name taken this run, so an audit run can tell an enforced name that never ran. */
const captured = new Set();
/** Text scrolled out of its scroll container in a capture, so the audit could not measure it; and
 * per page group and theme, the elements measured in some capture. Listed at the end; on an
 * enforced screen, text no capture of its page measured in that theme fails the run. */
const unmeasured = [];
const measuredOnPage = new Map();

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

// Automation never writes to the live worker and never reads its community data: the community
// meta and the team board are answered from synthetic fixtures, and every other call that is not a
// GET is refused here (counter.ts, diag.ts and the battle share already check navigator.webdriver;
// the refusal also covers the one step below that lifts that gate). The welcome screen's counter
// read still goes through, as before. CDP-wide request interception (page.setRequestInterception)
// pauses every request in the browser, including the ones the compute worker makes for the static
// game data, and those never get resolved because interception is only handled on the page
// session, so the app hangs forever waiting on its own boot. Patching window.fetch on the document
// instead only touches the main thread's fetches, leaving the dedicated worker's fetches alone.
const fixture = (name) =>
  fs.readFileSync(path.join(here, '..', '..', '..', 'fixtures', name), 'utf8');
await page.evaluateOnNewDocument(
  (meta, teams) => {
    const worker = 'https://pickthree-counter.travis-c82.workers.dev';
    const json = (body) =>
      Promise.resolve(
        new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const native = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.startsWith(`${worker}/api/v1/meta`)) {
        return json(meta);
      }
      if (url.startsWith(`${worker}/api/v1/teams`)) {
        return json(teams);
      }
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      if (url.startsWith(worker) && method !== 'GET') {
        return Promise.resolve(new Response(null, { status: 503 }));
      }
      return native(input, init);
    };
  },
  fixture('community-meta-sample.json'),
  fixture('community-teams-sample.json'),
);
// The last Counters result the compute worker handed back (its opponent and, against one, the grid
// time), read off the worker's own messages so the run can log how long the shield grids took on
// this machine. With window.__pick3FailCounters set, the next counters request never reaches the
// worker: it is answered with an error, as a worker that failed would answer it, for the Counters
// error state. Automation only: the app has no hook for either.
await page.evaluateOnNewDocument(() => {
  const Native = window.Worker;
  window.Worker = class extends Native {
    postMessage(msg, ...rest) {
      if (window.__pick3FailCounters && msg?.kind === 'counters') {
        window.__pick3FailCounters = false;
        setTimeout(() => {
          this.dispatchEvent(
            new MessageEvent('message', {
              data: { id: msg.id, kind: 'error', message: 'failed on purpose by screens.mjs' },
            }),
          );
        }, 0);
        return;
      }
      super.postMessage(msg, ...rest);
    }
    constructor(...args) {
      super(...args);
      this.addEventListener('message', (e) => {
        const d = e.data;
        if (d?.kind === 'result' && d.result?.kind === 'counters') {
          const c = d.result.counters;
          window.__pick3Counters = {
            vs: c.vs ?? null,
            gridMs: c.gridMs ?? null,
            rows: c.entries.length,
          };
        }
      });
    }
  };
});

/**
 * `mustShow`: a selector that has to be on the page when each shot is taken, for states that do
 * not last (a loading card), so a shot that missed its state fails instead of passing quietly.
 * `before`: runs before each shot (each theme on an audit run), to bring back a state that clears
 * itself sooner than two shots and their audits take.
 * `group`: the page this capture belongs to, when several captures show one page (About, then
 * About with a row open and scrolled). Text a capture could not measure because it was scrolled out
 * of view is checked against every capture of its group in the same theme (default: the capture's
 * own name).
 */
async function shot(name, fullPage = true, { mustShow, before, group } = {}) {
  captured.add(name);
  await new Promise((r) => setTimeout(r, 350));
  if (name !== 'cup-nudge' && (await page.$('.notice-toast .notice-quiet'))) {
    throw new Error(`${name}: the cup nudge is on the page, so this capture would show it`);
  }
  // A full-page shot resizes the viewport to the page instead of stitching past it, so the fixed
  // tab bar lands at the true bottom rather than across the middle of the page.
  const options = fullPage ? { fullPage, captureBeyondViewport: false } : { fullPage };
  const take = async (file) => {
    if (before) {
      await before();
    }
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
    const report = { unmeasured: [], measured: [] };
    for (const f of await auditPage(page, report)) {
      auditFindings.push({ name, line: `[${name} ${theme}] ${f}` });
    }
    // Keyed by theme too: text measured only in light says nothing about its contrast in dark.
    const pageKey = `${group ?? name}|${theme}`;
    const seen = measuredOnPage.get(pageKey) ?? new Set();
    report.measured.forEach((k) => seen.add(k));
    measuredOnPage.set(pageKey, seen);
    for (const u of report.unmeasured) {
      unmeasured.push({ name, theme, group: group ?? name, ...u });
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

/**
 * Merges `fields` into the saved settings and resolves the settings as they were, for a step that
 * seeds a state, reloads, shoots, and puts the settings back with `restoreSettings`.
 */
const seedSettings = (fields) =>
  page.evaluate(
    (f) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('pickthree');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('settings', 'readwrite');
          const settings = tx.objectStore('settings');
          const get = settings.get('current');
          tx.oncomplete = () => db.close();
          tx.onerror = () => reject(tx.error);
          get.onsuccess = () => {
            const before = get.result;
            if (!before) {
              reject(new Error('no saved settings to seed; the app has not saved any yet'));
              return;
            }
            settings.put({ ...before, ...f });
            resolve(before);
          };
        };
      }),
    fields,
  );
/** Puts the saved settings back exactly as `seedSettings` found them. */
const restoreSettings = (before) =>
  page.evaluate(
    (b) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('pickthree');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put(b);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    before,
  );
/** Reloads on Teams and waits for its cards to settle (twice, so a run that restarts is waited out). */
const reloadTeams = async () => {
  await page.reload({ waitUntil: 'networkidle0' });
  for (let i = 0; i < 2; i++) {
    await page.waitForFunction(
      () => document.querySelector('.ui-expand-head') && !document.querySelector('.ui-loading'),
      { timeout: 120_000 },
    );
    await new Promise((r) => setTimeout(r, 750));
  }
};
/** Two Pokémon left out of teams for the excluded-list captures: a plain one and a Shadow form. */
const SEEDED_EXCLUDED = ['melmetal', 'greninja_shadow'];

// GBL cups: pin the app's clock to a moment when one built cup is live and another is upcoming,
// so the Leagues sheet captures do not depend on the day this runs. With no such moment in the
// schedule (a cup not built yet leaves a gap), fall back to one day into any built cup's week and
// capture a live cup only.
const cupPin = await (async () => {
  const [schedule, leagues] = await Promise.all([
    fetch(`${base}/data/schedule.json`).then((r) => r.json()),
    fetch(`${base}/data/leagues.json`).then((r) => r.json()),
  ]);
  const built = new Set(leagues.filter((l) => l.kind === 'rotation').map((l) => l.id));
  const weeks = schedule.filter((e) => built.has(e.league));
  for (const live of weeks) {
    const t = Date.parse(live.start) + 86_400_000;
    const upcoming = weeks.find(
      (e) =>
        e.league !== live.league &&
        Date.parse(e.start) > t &&
        Date.parse(e.start) - t <= 7 * 86_400_000,
    );
    if (upcoming) {
      return { iso: new Date(t).toISOString(), upcoming: true };
    }
  }
  if (weeks.length === 0) {
    throw new Error('screens: schedule.json has no built cup week to pin the clock to');
  }
  console.log('  no upcoming cup to capture');
  return { iso: new Date(Date.parse(weeks[0].start) + 86_400_000).toISOString(), upcoming: false };
})();
await page.evaluateOnNewDocument((iso) => localStorage.setItem('pick3.now', iso), cupPin.iso);
console.log(`  cups pinned at ${cupPin.iso}`);

const t0 = Date.now();
console.log('welcome');
await page.goto(`${base}/#/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('h1');
// The one-time cup nudge shows on a fresh profile's first boot. It is captured and dismissed
// before any other shot, so it never sits over another capture.
await page.waitForSelector('.notice-toast.notice-foot', { timeout: 10_000 }).catch(() => null);
if (await page.$('.notice-toast .notice-quiet')) {
  await shot('cup-nudge', false, { mustShow: '.notice-toast' });
  await page.click('.notice-toast .notice-quiet');
  await page.waitForSelector('.notice-toast', { hidden: true });
} else {
  throw new Error('cup nudge: the first boot with a live cup showed no nudge');
}
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
await page.waitForFunction(() => !document.querySelector('.ui-loading'), { timeout: 120_000 });
// Nothing is owned without a collection, so there is nothing to filter by: no filter icon, and the
// line under the Against row offers the import instead.
if (await page.$('.counters-controls .ui-filter-icon')) {
  throw new Error('counters without a collection still offers the Filters sheet');
}
const importLine = await page.$eval('.counters-line > .meta', (e) => e.textContent ?? '');
if (importLine !== 'Import your collection to mark the ones you own.') {
  throw new Error(`counters without a collection: the wrong line: ${importLine}`);
}
await shot('18b-counters-no-collection', false);

console.log('settings without a collection');
// From the Counters header cog, before the import: the cog opens Settings, the hub offers "Import
// a CSV", its Your data row reads "No collection yet", and there is no Forget button.
await page.click('.ui-top button[aria-label="Settings"]');
await page.waitForSelector('.ui-sheet .settings-rows');
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('.settings-row-summary')].some((e) =>
      e.textContent?.startsWith('No collection yet · '),
    ),
  { timeout: 15_000 },
);
if (await page.$('.ui-sheet .ui-btn-danger')) {
  throw new Error('settings without a collection: Forget is offered with nothing to forget');
}
await shot('settings-hub-no-collection', false, { mustShow: '.ui-sheet .settings-rows' });
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });

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
    document.querySelector('.page-head .league-row') ??
    document.querySelector('.page-head .league-switcher');
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
// Deterministic: exclude every species there is in the saved settings, reload, shoot the Empty
// card, then put the saved settings back exactly as they were and reload again.
const everySpecies = await page.evaluate(async () =>
  (await (await fetch('/data/pokemon.json')).json()).map((p) => p.speciesId),
);
const savedSettings = await seedSettings({ excludedSpecies: everySpecies });
if (!savedSettings) {
  throw new Error('teams, empty: no saved settings to restore afterwards');
}
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.teams-list .ui-empty', { timeout: 120_000 });
await shot('teams-empty', false);
await restoreSettings(savedSettings);
await page.reload({ waitUntil: 'networkidle0' });
await settled();

console.log('teams, filters sheet');
// Two Pokémon excluded, so the sheet's excluded list shows its chips and Include all again. The
// saved settings go back exactly as they were afterwards. Here, not with the first Teams shots:
// only once the league switch has saved settings is there a record to seed.
const beforeFilters = await seedSettings({ excludedSpecies: SEEDED_EXCLUDED });
await reloadTeams();
await page.click('.teams-controls .ui-filter-icon');
await page.waitForSelector('.sheet[aria-label="Filters"] .x-chip');
await new Promise((r) => setTimeout(r, 400));
await shot('teams-filters-sheet', false);
console.log('teams, filters sheet, excluded list');
// The list sits at the foot of the sheet: scrolled into view so the audit measures it.
await page.$eval('.sheet[aria-label="Filters"] .x-chip', (el) =>
  el.scrollIntoView({ block: 'center' }),
);
await shot('teams-filters-excluded', false, {
  group: 'teams-filters-sheet',
  mustShow: '.sheet[aria-label="Filters"] .x-chip',
});
await page.$eval('.sheet[aria-label="Filters"] .between button.btn-ghost', (el) => el.click());
await page.waitForSelector('.sheet[aria-label="Filters"]', { hidden: true });
await restoreSettings(beforeFilters);
await reloadTeams();

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
  throw new Error(
    `"+N more": its target is covered or overlaps the chips: ${JSON.stringify(moreHits)}`,
  );
}
await page.evaluate(() => window.scrollTo(0, 0));

console.log('team analysis strip tap lands its row under the sticky header');
{
  // The second member's row starts closed and far below the fold; a tap on it in the hero card's
  // strip opens the row and brings its head (role and name) just under the sticky header.
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
await page.$eval('.score-card button[aria-label="Edit team"]', (el) => el.click());
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
await page.waitForSelector('.score-card + .ui-btn-primary', { timeout: 60_000 });
// A recommended team's hero card carries five bars: the five score factors.
const recommendedBars = await page.$$eval('.score-card [role="meter"]', (els) => els.length);
if (recommendedBars !== 5) {
  throw new Error(`team analysis: expected 5 bars on the hero card, found ${recommendedBars}`);
}

console.log('take to battle');
// The sample log has an open set with another team, so the switch-teams sheet opens. Keep it
// first (the set stays, the analysis stays), then again and Switch.
await page.click('.score-card + .ui-btn-primary');
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
await page.click('.score-card + .ui-btn-primary');
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

console.log('collection, judging');
// A fresh load, so the verdicts are computed while the list is on screen. They land in chunks of
// 25, a few seconds in all, less than two shots and their audits, so the compute worker is held at
// a debugger pause once the first chunk is in (its league bundle has landed by then, see
// teams-loading) and let go after the shot.
await page.goto(`${base}/#/collection`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () =>
    document.querySelector('.scroll .verdict-tag') && document.querySelector('.scroll .ui-loading'),
  { timeout: 120_000, polling: 'mutation' },
);
const verdictWorkers = page.workers();
for (const w of verdictWorkers) {
  await w.client.send('Debugger.enable');
  await w.client.send('Debugger.pause');
}
await page.evaluate(() => window.scrollTo(0, 0));
await shot('collection-judging', false, { mustShow: '.scroll .ui-loading' });
for (const w of verdictWorkers) {
  await w.client.send('Debugger.resume');
  await w.client.send('Debugger.disable');
}

console.log('collection');
await page.waitForFunction(
  () => document.querySelector('.scroll .verdict-tag') && !document.querySelector('.ui-loading'),
  { timeout: 120_000 },
);
console.log(`  verdicts rendered at ${Date.now() - t0} ms`);
await page.evaluate(() => window.scrollTo(0, 0));
// The Sort dropdown's 44px target reaches past its line; it must stay clear of the chips above.
const sortGap = await page.evaluate(() => {
  const chips = document.querySelector('.chips.tight')?.getBoundingClientRect();
  const sort = document.querySelector('.sort-row select')?.getBoundingClientRect();
  return chips && sort ? { gap: sort.top - chips.bottom, height: sort.height } : null;
});
console.log(`  sort target ${sortGap?.height}px tall, ${sortGap?.gap}px under the chips`);
if (!sortGap || sortGap.gap < 0) {
  throw new Error(`collection: the Sort target overlaps the chips (${JSON.stringify(sortGap)})`);
}
await shot('04-collection');
await page.click('.more-btn');
await page.waitForSelector('.more-btn[aria-expanded="true"]');
// The open group at the top of the list, just under the pinned search bar.
await page.evaluate(() => {
  const group = document.querySelector('.more-btn[aria-expanded="true"]').closest('.spec-group');
  const bar = document.querySelector('.sticky-bar').getBoundingClientRect().height;
  window.scrollTo(0, window.scrollY + group.getBoundingClientRect().top - bar);
});
await shot('11-collection-group', false);
// Close it again, so the later shots start from the default: every group shut.
await page.click('.more-btn[aria-expanded="true"]');
await page.waitForFunction(() => !document.querySelector('.more-btn[aria-expanded="true"]'));
await page.evaluate(() => window.scrollTo(0, 0));

console.log('collection, filters');
/** Flips one switch in the Filters sheet by its label and waits for it to land. */
const flipCollectionFilter = async (label) => {
  const was = await page.$$eval(
    '.ui-sheet [role="switch"]',
    (els, l) => {
      const sw = els.find((e) => e.textContent?.startsWith(l));
      sw?.click();
      return sw ? sw.getAttribute('aria-checked') : null;
    },
    label,
  );
  if (was === null) {
    throw new Error(`collection filters: no "${label}" switch`);
  }
  await page.waitForFunction(
    (l, before) =>
      [...document.querySelectorAll('.ui-sheet [role="switch"]')]
        .find((e) => e.textContent?.startsWith(l))
        ?.getAttribute('aria-checked') !== before,
    {},
    label,
    was,
  );
};
await page.click('.search-row .ui-filter-icon');
await page.waitForSelector('.ui-sheet .collection-filters');
await shot('collection-filters-sheet', false, { mustShow: '.ui-sheet .collection-filters' });
await flipCollectionFilter('Group same Pokémon');
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });
const flatCount = await page.$eval('.sort-row .meta', (e) => e.textContent ?? '');
if (!flatCount.endsWith(' shown')) {
  throw new Error(`collection, flat: the count reads "${flatCount}", not "N shown"`);
}
await page.evaluate(() => window.scrollTo(0, 0));
await shot('collection-flat', false);
// The detail pages are picked from this flat list (every Pokémon, not only each group's best) by
// what they show: a building Pokémon (cost tiles, no evolution), an evolving one, and a built one.
const listRows = await page.$$eval('.spec-row:not(.sub)', (rows) =>
  rows.map((r) => ({
    href: r.getAttribute('href'),
    verdict: r.querySelector('.verdict-tag')?.getAttribute('data-verdict') ?? null,
  })),
);
const verdictCounts = {};
for (const r of listRows) {
  verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1;
}
console.log(`  verdicts in the flat list: ${JSON.stringify(verdictCounts)}`);
await page.click('.search-row .ui-filter-icon');
await page.waitForSelector('.ui-sheet .collection-filters');
await flipCollectionFilter('Group same Pokémon');
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });

console.log('collection, empty');
await page.type('.search-row .search', 'zzzz');
await page.waitForSelector('.scroll .ui-empty');
await shot('collection-empty', false, { mustShow: '.scroll .ui-empty' });
await page.click('.search-clear');
await page.waitForFunction(() => !document.querySelector('.scroll .ui-empty'));

console.log('specimen');
// Hash navigation keeps the verdicts in memory.
/** Opens a detail page in place and waits for its verdict; returns what the page shows. */
const openSpecimen = async (href) => {
  // The page being left (the list, or another Pokémon) has a verdict tag too, and the hash matches
  // at once, so mark its scroll area first and wait for a fresh one. Each detail page is keyed by
  // its id, so a new Pokémon mounts a new `.scroll` without the mark.
  await page.evaluate((h) => {
    if (window.location.hash !== h) {
      for (const el of document.querySelectorAll('.scroll')) {
        el.setAttribute('data-leaving', '');
      }
    }
    window.location.hash = h;
  }, href);
  await page.waitForFunction(
    (h) =>
      window.location.hash === h &&
      document.querySelector('.scroll:not([data-leaving]) .verdict-tag'),
    { timeout: 30_000 },
    href,
  );
  await new Promise((r) => setTimeout(r, 200));
  return page.evaluate(() => {
    const rankKv = [...document.querySelectorAll('.scroll .kv')].find((k) =>
      k.firstElementChild?.textContent?.startsWith('IV rank'),
    );
    const rank = /^(\d+) of (\d+)$/.exec(rankKv?.lastElementChild?.textContent ?? '');
    const levels = [...document.querySelectorAll('.scroll .small.muted')]
      .map((e) => /^Level ([\d.]+) to ([\d.]+)/.exec(e.textContent ?? ''))
      .find(Boolean);
    return {
      evolves: Boolean(document.querySelector('.evo')),
      tiles: document.querySelectorAll('.stat3 .stat').length,
      topShare: rank ? Number(rank[1]) / Number(rank[2]) : null,
      buildLevel: levels ? Number(levels[2]) : null,
    };
  });
};
const pickSpecimen = async (what, verdicts, test) => {
  for (const row of listRows.filter((r) => verdicts.includes(r.verdict))) {
    const shown = await openSpecimen(row.href);
    if (test(shown)) {
      return { href: row.href, ...shown };
    }
  }
  throw new Error(`specimen: the sample collection has no ${what} Pokémon to capture`);
};
// Top quarter IVs as well, so the same Pokémon at its build level is Built (seeded below).
const building = await pickSpecimen(
  'building (Worth building, top 25% IVs, cost tiles, no evolution)',
  ['Worth building'],
  (p) => !p.evolves && p.tiles > 0 && p.topShare !== null && p.topShare <= 0.25 && p.buildLevel,
);
const evolving = await pickSpecimen(
  'evolving',
  ['Worth building', 'Wait for better IVs', 'Built'],
  (p) => p.evolves,
);

await openSpecimen(building.href);
await page.evaluate(() => window.scrollTo(0, 0));
// The building Pokémon: cost tiles and no evolution card, so the evolving page cannot pass.
await shot('05-specimen', true, { mustShow: '.scroll:not(:has(.evo)) .stat3' });

console.log('specimen, excluded');
const specimenSwitch = '.scroll [role="switch"]';
await page.click(specimenSwitch);
await page.waitForSelector(`${specimenSwitch}[aria-checked="false"]`);
await page.evaluate(() => window.scrollTo(0, 0));
await shot('specimen-excluded');

console.log('collection, excluded');
// While that Pokémon is out, its row in Collection carries the grey Excluded tag.
await page.evaluate(() => {
  window.location.hash = '#/collection';
});
const excludedRow = '.spec-row[data-shot-excluded]';
await page.waitForFunction(
  () => {
    const tag = [...document.querySelectorAll('.spec-row .mtags .ui-tag')].find(
      (t) => t.textContent === 'Excluded',
    );
    const row = tag?.closest('.spec-row');
    if (!row) {
      return false;
    }
    row.setAttribute('data-shot-excluded', '');
    row.scrollIntoView({ block: 'center' });
    return true;
  },
  { timeout: 30_000 },
);
await shot('collection-excluded', false, { mustShow: excludedRow });
await openSpecimen(building.href);
await page.click(specimenSwitch);
await page.waitForSelector(`${specimenSwitch}[aria-checked="true"]`);

console.log('specimen, evolving');
await openSpecimen(evolving.href);
await page.evaluate(() => window.scrollTo(0, 0));
await shot('specimen-evolve', true, { mustShow: '.evo' });

console.log('specimen, built');
// The sample has no Pokémon already at its build level, so one is seeded: a copy of the building
// Pokémon above, powered up to its build level (CP and HP worked out as the game does), written to
// the saved collection. After the shot the saved collection goes back exactly as it was.
const buildingId = decodeURIComponent(building.href.slice('#/collection/'.length));
const seeded = await page.evaluate(
  async (id, level, cpm) => {
    const pokemon = await (await fetch('/data/pokemon.json')).json();
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('pickthree');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('collection', 'readwrite');
        const store = tx.objectStore('collection');
        const get = store.get('current');
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
        get.onsuccess = () => {
          const before = get.result;
          const sp = before?.specimens?.find((x) => x.id === id);
          const base = pokemon.find((p) => p.speciesId === sp?.speciesId)?.baseStats;
          if (!sp || !sp.ivs || !base) {
            resolve({ error: `no specimen ${id} with IVs and base stats to copy` });
            return;
          }
          const atk = (base.atk + sp.ivs.atk) * cpm;
          const def = (base.def + sp.ivs.def) * cpm;
          const sta = (base.hp + sp.ivs.sta) * cpm;
          const cp = Math.max(10, Math.floor((atk * Math.sqrt(def) * Math.sqrt(sta)) / 10));
          const hp = Math.max(10, Math.floor(sta));
          const copy = {
            ...sp,
            id: `${sp.id}-built`,
            level: { min: level, max: level },
            cp,
            hp,
            raw: { ...sp.raw, cp, hp, levelMin: level, levelMax: level },
          };
          store.put({ ...before, specimens: [...before.specimens, copy] });
          resolve({ before, href: `#/collection/${encodeURIComponent(copy.id)}` });
        };
      };
    });
  },
  buildingId,
  building.buildLevel,
  cpmForLevel(building.buildLevel),
);
if (seeded.error) {
  throw new Error(`specimen, built: ${seeded.error}`);
}
await page.goto(`${base}/${seeded.href}`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.scroll .verdict-tag[data-verdict="Built"]', { timeout: 120_000 });
await page.waitForFunction(() => !document.querySelector('.ui-loading'), { timeout: 120_000 });
await page.evaluate(() => window.scrollTo(0, 0));
const builtLine = await page.evaluate(() =>
  [...document.querySelectorAll('.scroll p')].some((p) =>
    p.textContent?.startsWith('Already at level'),
  ),
);
if (!builtLine) {
  throw new Error('specimen, built: no "Already at level" line');
}
await shot('specimen-built');
await page.evaluate(
  (before) =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('pickthree');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('collection', 'readwrite');
        tx.objectStore('collection').put(before);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    }),
  seeded.before,
);
await page.reload({ waitUntil: 'networkidle0' });

console.log('specimen, not found');
await page.evaluate(() => {
  window.location.hash = '#/collection/not-a-real-specimen';
});
await page.waitForSelector('.scroll .ui-empty');
await shot('specimen-not-found', false, { mustShow: '.scroll .ui-empty' });

console.log('counters');
await page.goto(`${base}/#/counters`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.counter-row', { timeout: 120_000 });
await page.waitForFunction(() => !document.querySelector('.ui-loading'), { timeout: 120_000 });
console.log(`  counters rendered at ${Date.now() - t0} ms`);
await page.evaluate(() => window.scrollTo(0, 0));
await shot('08-counters');

console.log('counters, the Filters sheet');
// Own or can build, so the sheet shows a choice other than the default and the page under it its
// badge and fewer rows; back to All after.
const allRows = await page.$$eval('.counter-row', (rows) => rows.length);
await page.click('.counters-controls .ui-filter-icon');
await page.waitForSelector('.ui-sheet .counters-filters');
await page.$$eval('.ui-sheet .counters-filters .seg > *', (opts) =>
  opts.find((o) => o.textContent?.trim() === 'Own or can build')?.click(),
);
await page.waitForSelector('.counters-controls .ui-filter-icon.on');
const buildRows = await page.$$eval('.counter-row', (rows) => rows.length);
console.log(`  own or can build: ${buildRows} of ${allRows} rows`);
if (buildRows === 0 || buildRows >= allRows) {
  throw new Error(`counters filter: own or can build left ${buildRows} of ${allRows} rows`);
}
// Two links on a row stay on one line (a wrap stacks a second 44px line under the row). The second
// link names the Pokemon and the rows follow PvPoke's rankings, so measure the row with the
// shortest labels: a long name may wrap (checked below), a short one must not.
const linkLines = await page.$$eval(
  '.counter-row .counter-links:has(.ui-btn + .ui-btn)',
  (lists) => {
    const l = [...lists].sort((x, y) => x.textContent.length - y.textContent.length)[0];
    const [a, b] = [...l.querySelectorAll('.ui-btn')].map((x) => x.getBoundingClientRect().top);
    return a === b ? 1 : 2;
  },
);
if (linkLines !== 1) {
  throw new Error('counters: a row with two links wraps them onto two lines');
}
// Where a long name does wrap a row's second link, its text starts where the first link's does.
const wrapOffsets = await page.$$eval('.counter-row .counter-links', (lists) =>
  lists.flatMap((l) => {
    const [a, b] = [...l.querySelectorAll('.ui-btn')];
    if (!a || !b || a.getBoundingClientRect().top === b.getBoundingClientRect().top) {
      return [];
    }
    const textLeft = (x) =>
      x.getBoundingClientRect().left + parseFloat(getComputedStyle(x).paddingLeft);
    return [textLeft(b) - textLeft(a)];
  }),
);
console.log(
  `  wrapped second links: ${wrapOffsets.length}, off the first by ${JSON.stringify(wrapOffsets)}px`,
);
if (wrapOffsets.some((d) => Math.abs(d) > 1)) {
  throw new Error(
    `counters: a wrapped second link is off the first by ${JSON.stringify(wrapOffsets)}px`,
  );
}
await shot('counters-filters', false, { mustShow: '.ui-sheet .counters-filters' });
await page.$$eval('.ui-sheet .counters-filters .seg > *', (opts) =>
  opts.find((o) => o.textContent?.trim() === 'All')?.click(),
);
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });
if (await page.$('.counters-controls .ui-filter-icon.on')) {
  throw new Error('counters filter: still on after choosing All');
}

console.log('counters, the Against sheet');
await page.click('.counters-pick');
await page.waitForSelector('.ui-sheet .counters-against');
await shot('counters-against', false, { mustShow: '.ui-sheet .counters-whole' });
// While the search has text its matches sit under it and The whole meta shortcut is hidden.
await page.type('.ui-sheet .counters-against input.search', 'mar');
await page.waitForSelector('.ui-sheet .recent-row.matches .recent-token');
if (await page.$('.ui-sheet .counters-whole')) {
  throw new Error('counters against: The whole meta is still offered while searching');
}
await shot('counters-against-search', false, {
  mustShow: '.ui-sheet .recent-row.matches .recent-token',
});
// "mar" has more matches than the box shows: its last row, scrolled into the box, as its own
// capture of the same sheet.
const matchesScroll = await page.$eval('.ui-sheet .recent-row.matches', (box) => {
  box.scrollTop = box.scrollHeight;
  return box.scrollHeight - box.clientHeight;
});
if (matchesScroll <= 0) {
  throw new Error('counters against: "mar" no longer fills the matches box; pick a wider search');
}
await shot('counters-against-scrolled', false, {
  mustShow: '.ui-sheet .recent-row.matches .recent-token',
  group: 'counters-against-search',
});
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });

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
  return {
    ok,
    reason: `topmost at the last row's center is ${top?.className ?? top?.tagName ?? 'nothing'}, not the row itself`,
  };
});
if (!sheetCheck.ok) {
  throw new Error(
    `Leagues sheet: ${sheetCheck.reason} (the tab bar or another layer is painting over it)`,
  );
}
await shot('08c-leagues-sheet', false);
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });

console.log('leagues sheet, GBL cups');
await page.click('.page-head .league-more');
await page.waitForSelector('.ui-league-list .ui-league-row-detail');
await shot('leagues-sheet-cups', false, { mustShow: '.ui-league-list .ui-league-row-detail' });
const cupDetails = await page.$$eval('.ui-league-row-detail', (els) =>
  els.map((e) => e.textContent),
);
console.log(`  detail lines: ${JSON.stringify(cupDetails)}`);
if (!cupDetails.some((d) => d.startsWith('Live, ends '))) {
  throw new Error('leagues sheet: no live cup line');
}
if (cupPin.upcoming && !cupDetails.some((d) => d.startsWith('Starts '))) {
  throw new Error('leagues sheet: no upcoming cup line');
}
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });

console.log('counters, an unranked opponent');
// Magikarp is not in PvPoke's Great League rankings, so there is no moveset to simulate it with.
await page.goto(`${base}/#/counters?vs=magikarp`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.scroll .ui-empty', { timeout: 120_000 });
const unrankedLine = await page.$eval('.scroll .ui-empty', (e) => e.textContent ?? '');
if (!unrankedLine.includes('PvPoke does not rank Magikarp in Great League')) {
  throw new Error(`counters, unranked: the wrong empty state: ${unrankedLine}`);
}
// The empty state explains itself: no line and no Sort above it; the Against row stays.
if ((await page.$('.counters-line')) || (await page.$('.page-head .ui-inline-select'))) {
  throw new Error('counters, unranked: the line or Sort still shows above the empty state');
}
if (!(await page.$('.counters-pick'))) {
  throw new Error('counters, unranked: the Against picker is gone');
}
await shot('counters-unranked', false, { mustShow: '.scroll .ui-empty' });

console.log('counters, a run that failed');
// The Worker wrapper above answers the next counters request (the whole meta, picked by a route
// change in place) with an error. The app records the failure in the local diagnostics log as it
// would any other; the log is put back after, so the Settings captures later stay as they were.
const diagBefore = await page.evaluate(() => localStorage.getItem('pickthree.diag'));
await page.evaluate(() => {
  window.__pick3FailCounters = true;
  window.location.hash = '#/counters';
});
await page.waitForSelector('.scroll .ui-error', { timeout: 60_000 });
const failedState = await page.evaluate(() => ({
  line: document.querySelector('.scroll .ui-error p')?.textContent ?? '',
  again: [...document.querySelectorAll('.scroll .ui-error button')].some(
    (b) => b.textContent?.trim() === 'Try again',
  ),
  empty: document.querySelector('.scroll .ui-empty') !== null,
  line2: document.querySelector('.counters-line') !== null,
}));
if (
  failedState.line !== 'Counters could not be computed.' ||
  !failedState.again ||
  failedState.empty ||
  failedState.line2
) {
  throw new Error(`counters, failed: the wrong state: ${JSON.stringify(failedState)}`);
}
await shot('counters-error', false, { mustShow: '.scroll .ui-error' });
// Try again asks once more; the worker answers this time and the rows come.
await page.$$eval('.scroll .ui-error button', (bs) =>
  bs.find((b) => b.textContent?.trim() === 'Try again')?.click(),
);
await page.waitForSelector('.counter-row', { timeout: 120_000 });
if (await page.$('.scroll .ui-error')) {
  throw new Error('counters, failed: the error state stayed after Try again');
}
await page.evaluate((v) => {
  if (v === null) {
    localStorage.removeItem('pickthree.diag');
  } else {
    localStorage.setItem('pickthree.diag', v);
  }
}, diagBefore);

console.log('your meta');
await page.goto(`${base}/#/meta`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.set-card', { timeout: 60_000 });
await page.waitForSelector('.faced-row');
// The sample log is under 15 battles this season: the progress line and its bar.
await page.waitForSelector('.page-head [role="progressbar"]');
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
if (!new URLSearchParams(facedHref.split('?')[1]).has('from')) {
  throw new Error(`most-faced row does not mark the jump (from=1): ${facedHref}`);
}
const facedVs = new URLSearchParams(facedHref.split('?')[1]).get('vs');
// A tap, not a goto, so Your Meta is the pick3 screen behind Counters and the header is the sub
// header with Back. The rows land first with empty grid cells, then the grids fill in batches.
// The compute worker holds itself at a debugger statement right after it posts the progress for
// the first batch of grids (the rows with those grids went just before it), so the shots below
// always find a grid filled, the next one empty and the loading bar up, however fast the machine.
// The hold is automation only: a wrapper put on the worker's own postMessage through its CDP
// session (its league bundle has long landed, see teams-loading), fired once and let go after the
// shots. The row is scrolled to the middle first: at the top of the page it sits half under the
// tab bar, which would take the tap.
const gridWorkers = page.workers();
const held = [];
for (const w of gridWorkers) {
  await w.client.send('Debugger.enable');
  held.push(new Promise((resolve) => w.client.once('Debugger.paused', resolve)));
  await w.client.send('Runtime.evaluate', {
    expression: `(() => {
      const native = self.postMessage.bind(self);
      self.postMessage = (m, ...rest) => {
        native(m, ...rest);
        if (!self.__pick3Held && m && m.kind === 'progress' && m.stage === 'counters-grid' && m.done > 0) {
          self.__pick3Held = true;
          debugger;
        }
      };
    })()`,
  });
}
await page.$eval('.faced-row', (a) => a.scrollIntoView({ block: 'center' }));
await page.click('.faced-row');
let heldTimer;
await Promise.race([
  Promise.any(held),
  new Promise((_, reject) => {
    heldTimer = setTimeout(
      () => reject(new Error('counters vs: the worker never reached its first grid batch')),
      120_000,
    );
  }),
]).finally(() => clearTimeout(heldTimer));
await page.waitForFunction(
  () =>
    document.querySelector('.counter-row .fo-grid i.w, .counter-row .fo-grid i.l') &&
    document.querySelector('.counter-row .fo-grid i.empty') &&
    document.querySelector('.scroll .ui-loading'),
  { timeout: 30_000, polling: 'mutation' },
);
// Scrolled to the top: the loading bar over the first rows, its stage the shield pairings.
await page.evaluate(() => window.scrollTo(0, 0));
const loadingStage = await page.$eval('.scroll .ui-loading', (e) => e.textContent ?? '');
if (!loadingStage.includes('Playing every shield pairing')) {
  throw new Error(`counters vs: the loading bar reads "${loadingStage}"`);
}
await shot('counters-loading', false, {
  mustShow: '.scroll .ui-loading',
  group: 'counters-vs-filling',
});
// Scrolled to where the filled rows end, so the capture shows a grid in and the next one waiting.
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.counter-row')].find((r) =>
    r.querySelector('.fo-grid i.empty'),
  );
  const head = document.querySelector('.counters-head')?.getBoundingClientRect().bottom ?? 0;
  if (row) {
    window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - head - 160);
  }
});
await shot('counters-vs-filling', false, { mustShow: '.scroll .ui-loading' });
for (const w of gridWorkers) {
  await w.client.send('Debugger.resume');
  await w.client.send('Debugger.disable');
}
await page.waitForFunction(
  (vs) =>
    window.__pick3Counters?.vs?.speciesId === vs &&
    document.querySelector('.counter-row') &&
    !document.querySelector('.ui-loading') &&
    !document.querySelector('.counter-row .fo-grid i.empty'),
  { timeout: 120_000 },
  facedVs,
);
const vsResult = await page.evaluate(() => window.__pick3Counters);
// Wall clock in the worker, so this one includes the time it was held for counters-vs-filling;
// the outsider's below is not held.
console.log(
  `  ${facedVs}: ${vsResult.rows} rows, shield grids in ${vsResult.gridMs} ms (with the held pause)`,
);
if (typeof vsResult.gridMs !== 'number') {
  throw new Error(`counters vs: the result carries no grid time: ${JSON.stringify(vsResult)}`);
}
const vsBack = await page.$eval('.counters-head .hdr .back', (b) => b.textContent ?? '');
if (vsBack.trim() !== 'Back') {
  throw new Error(`counters vs from Your Meta: the header's back reads "${vsBack}"`);
}
await assertTitleCentred('counters vs');
await page.evaluate(() => window.scrollTo(0, 0));
// A row's links sit in its text column, under the name, not under the token: the link's text
// starts where the name starts (its button padding hangs into the column gap).
const linkOffset = await page.$eval('.counter-row', (row) => {
  const nameLeft = row.querySelector('.spec-name')?.getBoundingClientRect().left ?? NaN;
  const link = row.querySelector('.counter-links .ui-btn');
  const pad = link ? parseFloat(getComputedStyle(link).paddingLeft) : NaN;
  return (link?.getBoundingClientRect().left ?? NaN) + pad - nameLeft;
});
console.log(`  row link text off the name column by ${linkOffset.toFixed(1)}px`);
if (!(Math.abs(linkOffset) <= 1)) {
  throw new Error(`counters vs: the row links are off the text column by ${linkOffset}px`);
}
await shot('23-counters-vs', false);
await page.click('.counters-head .hdr .back');
await page.waitForSelector('.set-card', { timeout: 60_000 });
if (!page.url().endsWith('#/meta')) {
  throw new Error(`back from the counters vs view landed at ${page.url()}`);
}

console.log('who beats an outsider (simulated on device)');
// An outsider (outside PvPoke's meta group) carries the dagger mark once the meta group loads.
await page.waitForSelector('.faced-row .faced-out', { timeout: 60_000 });
const outsiderHref = await page.$$eval('.faced-row', (rows) => {
  const r = rows.find((el) => el.querySelector('.faced-out'));
  return r ? r.getAttribute('href') : null;
});
if (!outsiderHref) {
  throw new Error('the sample log has no most-faced outsider to simulate');
}
const outsiderVs = new URLSearchParams(outsiderHref.split('?')[1]).get('vs');
const tSim = Date.now();
const outsiderRow = `.faced-row[href="${outsiderHref}"]`;
await page.$eval(outsiderRow, (a) => a.scrollIntoView({ block: 'center' }));
await page.click(outsiderRow);
// The page names no simulation (its line is the same for every opponent); the result says it: an
// opponent outside the meta group has no matrix column, so ranked species were simulated instead.
await page.waitForFunction(
  (vs) =>
    window.__pick3Counters?.vs?.speciesId === vs &&
    document.querySelector('.counter-row') &&
    !document.querySelector('.ui-loading'),
  { timeout: 120_000 },
  outsiderVs,
);
const simResult = await page.evaluate(() => window.__pick3Counters);
console.log(
  `  ${outsiderVs}: ${simResult.vs.simulated} simulated, ${simResult.rows} rows, shield grids in ${simResult.gridMs} ms, all at ${Date.now() - tSim} ms`,
);
if (simResult.vs.inMeta || typeof simResult.vs.simulated !== 'number') {
  throw new Error(`outsider view was not simulated: ${JSON.stringify(simResult)}`);
}
await page.evaluate(() => window.scrollTo(0, 0));
await shot('24-counters-vs-outsider', false);

console.log('your meta, 15 or more battles');
// Six more battles on the running team, sent to the community meta, so the season passes 15 and
// the contribution count shows. The set as it was is kept and put back after the shots.
const setBefore = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('pickthree');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('battles', 'readwrite');
        const store = tx.objectStore('battles');
        const all = store.getAll();
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
        all.onsuccess = () => {
          const set = all.result.find((x) => x.league === 'great' && !x.closed);
          if (!set) {
            resolve(null);
            return;
          }
          const faced = [
            [['medicham', 'lanturn', 'registeel'], 'win'],
            [['azumarill', 'clodsire', 'dragonite_shadow'], 'loss'],
            [['medicham', 'swampert_shadow', 'tinkaton'], 'win'],
            [[], null],
            [['lanturn', 'azumarill', 'registeel'], 'win'],
            [['clodsire', 'medicham', 'dragonite_shadow'], 'loss'],
          ];
          const now = Date.now();
          const added = faced.map(([opponents, result], i) => {
            const at = new Date(now - (faced.length - i) * 6 * 60_000).toISOString();
            return {
              id: `screens-${i}`,
              at,
              opponents,
              result,
              tanked: result === null,
              sharedAt: at,
            };
          });
          store.put({ ...set, battles: [...set.battles, ...added] });
          resolve(set);
        };
      };
    }),
);
if (!setBefore) {
  throw new Error('your meta, 15 or more: no running set to add battles to');
}
await page.goto(`${base}/#/meta`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.set-card', { timeout: 60_000 });
await page.waitForSelector('.page-head [role="progressbar"][aria-valuenow="100"]', {
  timeout: 60_000,
});
await page.waitForSelector('.page-head .ui-measured-line', { timeout: 30_000 });
await page.waitForSelector('.faced-row .faced-out', { timeout: 60_000 });
await shot('your-meta-active');

console.log('log a battle, edit from a result chip');
await page.$$eval('.result-chip', (els) =>
  els.find((el) => el.getAttribute('aria-label')?.startsWith('Loss against'))?.click(),
);
await page.waitForFunction(() => document.location.hash.startsWith('#/meta/log/'), {
  timeout: 15_000,
});
await page.waitForFunction(
  () =>
    document.querySelector('.hdr .hdr-title')?.textContent?.includes('Edit battle') &&
    document.querySelectorAll('.opp-slot.filled').length === 3 &&
    document.querySelector('.result-bar [aria-pressed="true"]'),
  { timeout: 30_000 },
);
await shot('log-battle-edit', false, { mustShow: '.result-bar .ui-btn-primary' });
await assertTitleCentred('edit battle');

/**
 * Puts the running set back as it was before the steps that add battles to it, and reloads so the
 * app reads it again. Teams runs the recommendation again after the reload, for New Set's "From
 * pick3" rows.
 */
const restoreRunningSet = async () => {
  await page.evaluate(
    (before) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('pickthree');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('battles', 'readwrite');
          tx.objectStore('battles').put(before);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    setBefore,
  );
  await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await settled();
};
await restoreRunningSet();

console.log('log a battle');
await page.goto(`${base}/#/meta/log`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.result-row');
await page.waitForSelector('.team-strip');
await shot('21-log-battle', false);
await assertTitleCentred('log a battle');

console.log('log a battle, card open');
// The recent grid shows while the search has focus and stays open after a pick while a slot is
// free, so the second pick needs no second tap; blurring the search folds it for the shot.
await page.click('.search');
await page.waitForSelector('.recent-token');
await page.click('.recent-token');
await page.waitForSelector('.opp-slot.filled');
await page.$$eval('.recent-token:not(.on)', (els) => els[0]?.click());
await page.waitForFunction(() => document.querySelectorAll('.opp-slot.filled').length === 2);
await page.$eval('.search', (e) => e.blur());
await page.waitForFunction(() => !document.querySelector('.recent-token'));
await page.waitForSelector('.faceoff .fo-table', { timeout: 60_000 });
const cardVerdicts = await page.$$eval('.fo-verdict', (els) => els.length);
if (cardVerdicts !== 3) {
  throw new Error(`in-battle card shows ${cardVerdicts} verdicts, expected 3`);
}
// Each slot shows its opponent's whole name, on two lines when it needs them.
const cutNames = await page.$$eval('.opp-slot .small', (els) =>
  els
    .filter(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis',
    )
    .map((el) => el.textContent),
);
if (cutNames.length > 0) {
  throw new Error(`log a battle: slot names cut short: ${cutNames.join(', ')}`);
}
await new Promise((r) => setTimeout(r, 300));
await shot('log-battle-card', true, { mustShow: '.faceoff .fo-table' });

console.log('log a battle, wide');
// Ruling 2: from 900px the card sits beside the search and the slots. Width only: flipping
// isMobile or hasTouch would reload the page and lose the slots.
await page.setViewport({
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await page.evaluate(() => window.scrollTo(0, 0));
await shot('log-battle-wide', false, { mustShow: '.log-card .faceoff .fo-table' });
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

console.log('log a battle, saved');
// The confirmation clears itself after about 3 seconds, sooner than a shot and its audit in two
// themes, so each shot starts from a fresh one: any notice still up is tapped away first (it
// could otherwise clear between this check and the shot), then one more Win is logged. Those
// Wins land in the running set, which is put back as it was after this step.
const logWin = async () => {
  await page.evaluate(() => document.querySelector('.notice-toast .notice-tap')?.click());
  await page.waitForSelector('.notice-toast', { hidden: true });
  await page.$eval('.result-row .ui-btn-win', (el) => el.click());
  await page.waitForSelector('.notice-toast.notice-info[role="status"]', { timeout: 15_000 });
};
await logWin();
await page.evaluate(() => window.scrollTo(0, 0));
// At the foot, clear of the header, just above the result bar.
const noticePlace = await page.evaluate(() => {
  const toast = document.querySelector('.notice-toast.notice-info')?.getBoundingClientRect();
  const bar = document.querySelector('.result-bar')?.getBoundingClientRect();
  const head = document.querySelector('.log-head')?.getBoundingClientRect();
  return toast && bar && head
    ? { gap: bar.top - toast.bottom, clear: toast.top > head.bottom }
    : null;
});
if (!noticePlace || !noticePlace.clear || noticePlace.gap < 4 || noticePlace.gap > 24) {
  throw new Error(`saved notice: not just above the result bar: ${JSON.stringify(noticePlace)}`);
}
await shot('log-battle-saved', false, { mustShow: '.notice-toast.notice-info', before: logWin });
await page.evaluate(() => document.querySelector('.notice-toast .notice-tap')?.click());
await page.waitForSelector('.notice-toast', { hidden: true });
await restoreRunningSet();

console.log('new set');
await page.goto(`${base}/#/meta/new`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.opp-slot');
await page.waitForSelector('.pick3-row', { timeout: 60_000 });
await shot('22-new-set', true, { mustShow: '.pick3-row' });
await assertTitleCentred('new set');

console.log('new set, searching');
await page.click('.search');
await page.type('.search', 'azu');
await page.waitForSelector('.recent-token', { timeout: 15_000 });
await shot('new-set-searching', false, { mustShow: '.recent-token' });

console.log('log a battle, likely teammates');
// The "Often with" row reads the community team board, which the app reads only on the live site
// and never under automation (navigator.webdriver). For this one step the page is told it is not
// automated and the dev flag is set; the board is answered from the fixture above, and any write
// the lifted gate lets through is refused by the same fetch patch. The reload after puts both back.
await page.evaluate(() => {
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
  localStorage.setItem('pickthree.shareDev', '1');
});
await page.goto(`${base}/#/meta/log`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.result-row');
await page.click('.search');
await page.type('.search', 'medicham');
await page.waitForSelector('.recent-token[aria-label="Medicham"]', { timeout: 15_000 });
await page.click('.recent-token[aria-label="Medicham"]');
await page.waitForSelector('[role="group"][aria-label="Often with Medicham"] .recent-token', {
  timeout: 30_000,
});
await shot('log-battle-likely', false, {
  mustShow: '[role="group"][aria-label="Often with Medicham"]',
});
await page.evaluate(() => localStorage.removeItem('pickthree.shareDev'));
await page.goto(`${base}/#/build`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
if (await page.evaluate(() => navigator.webdriver !== true)) {
  throw new Error('likely teammates: the automation flag did not come back after the reload');
}
// The reload dropped the recommendation from memory; Teams runs it again, so the custom-team
// shots below still print "Your best recommended team rates ..." as a player's session would.
await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
await settled();

/**
 * Empties Build's three slots through each card's remove button. A tap that does not remove its
 * card (the button covered, or drawn away from its card) fails the run instead of looping.
 */
const clearBuildPicks = async () => {
  for (let taps = 0; await page.$('.pick-x'); taps++) {
    if (taps >= 3) {
      throw new Error('build: a remove tap did not remove its pick');
    }
    await page.click('.pick-x');
    await new Promise((r) => setTimeout(r, 100));
  }
};

console.log('suggest teammates around one pin');
await page.goto(`${base}/#/build`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.pick-card');
await clearBuildPicks();
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
await clearBuildPicks();
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
// A hand-built team's hero card has three bars: its build cost stands in for Affordable, and
// Accessibility is left out.
const customBars = await page.$$eval('.score-card [role="meter"]', (els) => els.length);
if (customBars !== 3) {
  throw new Error(`custom team: expected 3 bars on the hero card, found ${customBars}`);
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
const sharedError = await page
  .$eval('.ui-error, .scroll .error', (e) => e.textContent)
  .catch(() => null);
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
await clearBuildPicks();
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
await page.waitForSelector('.stat3, .verdict-tag', { timeout: 60_000 });
await new Promise((r) => setTimeout(r, 600));
console.log(`  manual add landed at ${page.url()}`);
// The hand-added Pokémon's own page: full page, so Remove from collection is in the shot.
await page.waitForSelector('.scroll .ui-btn-danger');
await page.evaluate(() => window.scrollTo(0, 0));
await shot('specimen-manual', true, { mustShow: '.scroll .ui-btn-danger' });

console.log('specimen, remove confirm');
// Opens the confirm and cancels it: the Pokémon stays for the steps after this one.
await page.click('.scroll .ui-btn-danger');
await page.waitForSelector('.ui-confirm');
await shot('specimen-remove-confirm', false, { mustShow: '.ui-confirm' });
await page.$$eval('.ui-confirm button', (els) =>
  els.find((e) => e.textContent?.trim() === 'Keep it')?.click(),
);
await page.waitForSelector('.ui-confirm', { hidden: true });
if (!(await page.$('.scroll .ui-btn-danger'))) {
  throw new Error('specimen, remove confirm: Keep it left the page');
}

console.log('settings');
await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
// Teams carries two IconButtons (the meta link, then Settings); the aria-label picks the
// settings one specifically.
await page.waitForSelector('button[aria-label="Settings"]');
await page.click('button[aria-label="Settings"]');
await page.waitForSelector('.ui-sheet .settings-rows');
/** Waits for the Settings sheet's title to read this page's title. */
const onSettingsPage = (title) =>
  page.waitForFunction(
    (t) => document.querySelector('.ui-sheet:not(.ui-confirm) .ui-sheet-title')?.textContent === t,
    { timeout: 10_000 },
    title,
  );
/** Pushes a hub row's page by its title. */
const pushSettings = async (title) => {
  const found = await page.$$eval(
    '.settings-row',
    (rows, t) => {
      const row = rows.find((r) => r.querySelector('.settings-row-title')?.textContent === t);
      row?.click();
      return Boolean(row);
    },
    title,
  );
  if (!found) {
    throw new Error(`settings: no "${title}" row on the hub`);
  }
  await onSettingsPage(title);
};
const backToHub = async () => {
  await page.click('.ui-sheet:not(.ui-confirm) .ui-sheet-head .back');
  await onSettingsPage('Settings');
  await page.waitForSelector('.ui-sheet .settings-rows');
};
/** Clicks the button in the sheet stack with exactly this text. */
const clickSheetButton = async (label) => {
  const found = await page.$$eval(
    '.ui-sheet button',
    (els, l) => {
      const b = els.find((e) => e.textContent?.trim() === l);
      b?.click();
      return Boolean(b);
    },
    label,
  );
  if (!found) {
    throw new Error(`settings: no "${label}" button`);
  }
};
/** Opens a confirm with the button labeled `open`, shoots it, then cancels with `cancel`. */
const shootConfirm = async (name, open, cancel, check) => {
  await clickSheetButton(open);
  await page.waitForSelector('.ui-confirm');
  if (check) {
    await check();
  }
  await shot(name, false, { mustShow: '.ui-confirm' });
  await clickSheetButton(cancel);
  await page.waitForSelector('.ui-confirm', { hidden: true });
};
// The hub's battle count and PvPoke date land after the sheet opens.
await page.waitForFunction(
  () => {
    const summaries = [...document.querySelectorAll('.settings-row-summary')].map(
      (e) => e.textContent ?? '',
    );
    return summaries.some((t) => / battles?$/.test(t)) && !summaries.some((t) => t.includes('...'));
  },
  { timeout: 15_000 },
);
await shot('settings-hub', false, { mustShow: '.ui-sheet .settings-rows' });

await pushSettings('Your data');
await shot('settings-your-data', false);
// Import log: a file built in the page from the battles store, set on the hidden input. Every set
// is already here, so the result line counts them as skipped and nothing is written.
await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('pickthree');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const req = db.transaction('battles').objectStore('battles').getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          db.close();
          const text = JSON.stringify({
            app: 'pick3',
            kind: 'battle-log',
            version: 1,
            exportedAt: new Date().toISOString(),
            sets: req.result,
          });
          const input = document.querySelector('.ui-sheet input[type="file"]');
          if (!input) {
            reject(new Error('no Import log file input on Your data'));
            return;
          }
          const dt = new DataTransfer();
          dt.items.add(new File([text], 'pick3-battle-log.json', { type: 'application/json' }));
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          resolve();
        };
      };
    }),
);
await page.waitForFunction(
  () =>
    /^Added \d+ sets?, skipped \d+ already here\.$/.test(
      document.querySelector('.ui-sheet [role="status"]')?.textContent ?? '',
    ),
  { timeout: 15_000 },
);
const imported = await page.$eval('.ui-sheet [role="status"]', (e) => {
  e.scrollIntoView({ block: 'center' });
  return e.textContent;
});
console.log(`  import log: ${imported}`);
await shot('settings-log-imported', false, { mustShow: '.ui-sheet [role="status"]' });
await shootConfirm('settings-confirm-fresh', 'Start fresh in Great League', 'Keep this season');

console.log('settings, your data, excluded');
// Two Pokémon excluded: the Excluded from teams block lists them with Include all again, and its
// confirm. The saved settings go back exactly as they were, and the sheet reopens on Your data.
const reopenYourData = async () => {
  await page.waitForSelector('button[aria-label="Settings"]');
  await page.click('button[aria-label="Settings"]');
  await page.waitForSelector('.ui-sheet .settings-rows');
  await pushSettings('Your data');
};
const beforeYourData = await seedSettings({ excludedSpecies: SEEDED_EXCLUDED });
await reloadTeams();
await reopenYourData();
await page.waitForSelector('.ui-sheet .x-chip');
await page.$eval('.ui-sheet .x-chip', (el) => el.scrollIntoView({ block: 'center' }));
await shot('settings-your-data-excluded', false, { mustShow: '.ui-sheet .x-chip' });
await shootConfirm('settings-confirm-include-all', 'Include all again', 'Keep them out');
await restoreSettings(beforeYourData);
await reloadTeams();
await reopenYourData();
await backToHub();

await pushSettings('Community');
await shot('settings-community', false);
await clickSheetButton("What's sent?");
await page.waitForSelector('.ui-sheet .ui-expand.open');
await shot('settings-community-sent', false);
// Sharing is on by default; turning it off asks first. Cancel, and it stays on.
await page.click('.ui-sheet [role="switch"]');
await page.waitForSelector('.ui-confirm');
await shot('settings-confirm-sharing', false, { mustShow: '.ui-confirm' });
await clickSheetButton('Keep sharing');
await page.waitForSelector('.ui-confirm', { hidden: true });
if (
  (await page.$eval('.ui-sheet [role="switch"]', (e) => e.getAttribute('aria-checked'))) !== 'true'
) {
  throw new Error('settings: Keep sharing turned sharing off');
}
await backToHub();

await pushSettings('Appearance');
await shot('settings-appearance', false);
await backToHub();

await pushSettings('About');
await shot('settings-about', false, { group: 'settings-about' });
await clickSheetButton('What leaves it?');
await page.waitForSelector('.ui-sheet .ui-expand.open');
// Privacy at the top of the sheet: the open list and what follows it, no line cut under the
// header. One pixel further, so the block's own top divider does not sit under the header's.
await page.$eval('.ui-sheet .ui-expand.open', (e) => {
  e.closest('.settings-block').scrollIntoView({ block: 'start' });
  e.closest('.ui-sheet-body').scrollBy(0, 1);
});
await shot('settings-about-leaves', false, { group: 'settings-about' });
await backToHub();

// The confirm has to paint over the Settings sheet: the topmost element at Settings' own Done
// button is the confirm's overlay or the confirm itself (the old nested Leagues sheet check).
await shootConfirm(
  'settings-confirm-forget',
  'Forget my collection and log',
  'Keep them',
  async () => {
    const layer = await page.evaluate(() => {
      const done = document.querySelector('.ui-sheet:not(.ui-confirm) .ui-sheet-done');
      const confirm = document.querySelector('.ui-confirm');
      if (!done || !confirm) {
        return { ok: false, reason: "could not find Settings' Done button or the confirm" };
      }
      const b = done.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const ok = top !== null && (confirm.contains(top) || top === confirm.previousElementSibling);
      return {
        ok,
        reason: `topmost at Settings' Done is ${top?.className || top?.tagName || 'nothing'}, not the confirm's overlay or sheet`,
      };
    });
    if (!layer.ok) {
      throw new Error(`Forget confirm over Settings: ${layer.reason}`);
    }
  },
);
if (!(await page.$('.ui-sheet .settings-rows'))) {
  throw new Error('settings: Keep them left the hub');
}
await page.click('.ui-sheet-done');
await page.waitForSelector('.ui-sheet', { hidden: true });

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
  // Text never on screen in any capture of its page, in that theme, was never measured at all.
  // On an enforced screen that is a finding: the audit cannot vouch for its contrast.
  const unmeasuredLines = unmeasured.map((u) => {
    const measuredElsewhere = measuredOnPage.get(`${u.group}|${u.theme}`)?.has(u.key) ?? false;
    const enforcedName = AUDIT_ENFORCED.has(u.name);
    const text = u.text.slice(0, 40);
    if (!measuredElsewhere && enforcedName) {
      auditFindings.push({
        name: u.name,
        line: `[${u.name} ${u.theme}] contrast unmeasured: ${u.selector} "${text}" is scrolled out of its container and no ${u.theme} capture of ${u.group} measured it`,
      });
    }
    const where = measuredElsewhere
      ? `measured in another ${u.theme} capture of ${u.group}`
      : `NEVER measured in any ${u.theme} capture of ${u.group}`;
    const mark = enforcedName ? ' (enforced)' : '';
    return `  [${u.name} ${u.theme}]${mark} ${u.selector} "${text}": ${where}`;
  });
  const enforced = auditFindings.filter((f) => AUDIT_ENFORCED.has(f.name));
  const reported = auditFindings.filter((f) => !AUDIT_ENFORCED.has(f.name));
  if (reported.length > 0) {
    console.log(
      `\nAudit findings on screens not yet redesigned (${reported.length}, not failing):`,
    );
    for (const f of reported) {
      console.log(`  ${f.line}`);
    }
  }
  if (unmeasuredLines.length > 0) {
    console.log(
      '\nNot on screen, unmeasured (scrolled out of their container; NEVER on an enforced screen fails):',
    );
    for (const line of unmeasuredLines) {
      console.log(line);
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
