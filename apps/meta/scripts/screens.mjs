/* global document, window */
/**
 * Drives the built meta site in the locally installed Chrome and screenshots every screen at
 * phone size, the first time any of this has run outside jsdom. Modeled on
 * apps/web/scripts/screens.mjs: same puppeteer-core setup, same CHROME_PATH handling, same
 * console-error collection and failure behaviour.
 *
 * There is no worker behind `npx vite preview` for apps/meta, so this script intercepts
 * /api/v1/* itself and answers from a fixture, rather than depending on live data (or polluting
 * it). It runs the whole page list twice: once against an empty summary (the day-one state every
 * league actually ships in), once against a populated one, so both the below-threshold banner and
 * the measured list get a real render.
 *
 * Sprites load from https://pick3.gg/data/sprites/*.webp, a real remote origin this script does
 * not control. In CI that fetch may be slow or blocked, and that is not a bug in this site: the
 * Sprite component already handles a broken image (components.tsx's onError just hides it), so a
 * failed sprite load is let through rather than aborted, and is the one kind of console error or
 * failed request this script does not fail the run over.
 *
 *   node apps/meta/scripts/screens.mjs [baseUrl]
 *
 * Output: apps/meta/screenshots/*.png (gitignored) plus a console log of timings and errors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'screenshots');
const base = process.argv[2] ?? 'http://localhost:4174';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) {
  if (f.endsWith('.png')) {
    fs.unlinkSync(path.join(outDir, f));
  }
}

// A sprite request that fails (blocked, slow, or DNS-less CI network) is expected and handled by
// the app itself. Nothing else on pick3.gg's real origin is fetched by this site, so this one
// path segment is the whole allowance.
const SPRITE_PATH = '/data/sprites/';

function isSpriteUrl(url) {
  try {
    return new URL(url).pathname.includes(SPRITE_PATH);
  } catch {
    return url.includes(SPRITE_PATH);
  }
}

const ISO_NOW = '2026-09-18T12:00:00.000Z';
const ISO_SINCE_SEASON = '2026-09-08T20:00:00.000Z';

const EMPTY_META = {
  league: 'great',
  since: ISO_SINCE_SEASON,
  until: ISO_NOW,
  band: 'all',
  battles: 0,
  tanked: 0,
  devices: 0,
  bands: {},
  species: [],
  teams: [],
  previous: null,
  generatedAt: '2026-09-18T11:50:00.000Z',
};

const EMPTY_SPECIES_DETAIL = {
  league: 'great',
  speciesId: 'azumarill',
  since: ISO_SINCE_SEASON,
  until: ISO_NOW,
  band: 'all',
  sightings: 0,
  wins: 0,
  losses: 0,
  runs: 0,
  runWins: 0,
  runLosses: 0,
  weekly: [],
  bands: [],
  alongside: [],
  movesets: [],
  generatedAt: '2026-09-18T11:50:00.000Z',
};

// Real, baked species ids (apps/meta/public/species.json), so sprites resolve to a real path on
// pick3.gg rather than a 404 the app has to paper over on top of the one it is already tolerating.
function sp(speciesId, sightings, wins, losses) {
  return { speciesId, sightings, wins, losses, runs: 0, runWins: 0, runLosses: 0 };
}

const FULL_META = {
  league: 'great',
  since: ISO_SINCE_SEASON,
  until: ISO_NOW,
  band: 'all',
  battles: 1000,
  tanked: 15,
  devices: 42,
  bands: { below: 200, ace: 300, veteran: 250, expert: 150, legend: 100 },
  species: [
    sp('azumarill', 260, 140, 100),
    sp('tinkaton', 210, 90, 100),
    sp('clodsire', 150, 60, 70),
    sp('medicham', 95, 40, 45),
    sp('lanturn', 60, 25, 20),
    sp('registeel', 30, 10, 15),
  ],
  teams: [
    {
      species: ['azumarill', 'tinkaton', 'clodsire'],
      battles: 120,
      wins: 70,
      losses: 50,
      moves: [
        { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], battles: 100 },
        { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER'], battles: 90 },
        null,
      ],
    },
    {
      species: ['medicham', 'lanturn', 'registeel'],
      battles: 45,
      wins: 20,
      losses: 25,
      moves: [null, null, null],
    },
    {
      species: ['azumarill', 'medicham', 'registeel'],
      battles: 10,
      wins: 6,
      losses: 4,
      moves: [null, null, null],
    },
  ],
  previous: {
    battles: 950,
    species: [
      { speciesId: 'azumarill', sightings: 230 },
      { speciesId: 'tinkaton', sightings: 200 },
    ],
  },
  generatedAt: ISO_NOW,
};

const FULL_AZUMARILL_DETAIL = {
  league: 'great',
  speciesId: 'azumarill',
  since: ISO_SINCE_SEASON,
  until: ISO_NOW,
  band: 'all',
  sightings: 260,
  wins: 140,
  losses: 100,
  runs: 100,
  runWins: 55,
  runLosses: 45,
  weekly: [
    { week: '2026-W35', battles: 500, sightings: 120 },
    { week: '2026-W36', battles: 500, sightings: 140 },
  ],
  bands: [
    { band: 'below', sightings: 40, wins: 20, losses: 20 },
    { band: 'ace', sightings: 60, wins: 35, losses: 25 },
    { band: 'veteran', sightings: 70, wins: 40, losses: 30 },
    { band: 'expert', sightings: 50, wins: 25, losses: 25 },
    { band: 'legend', sightings: 40, wins: 20, losses: 20 },
  ],
  alongside: [
    { speciesId: 'tinkaton', battles: 90 },
    { speciesId: 'clodsire', battles: 70 },
    { speciesId: 'medicham', battles: 40 },
  ],
  movesets: [
    { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], battles: 80 },
    { fast: 'BUBBLE', charged: ['ICE_BEAM'], battles: 20 },
  ],
  generatedAt: ISO_NOW,
};

const RUNS = [
  {
    name: 'empty',
    meta: EMPTY_META,
    species: { azumarill: EMPTY_SPECIES_DETAIL },
    mustContain: ["Too few battles to trust yet.", "PvPoke's meta group"],
  },
  {
    name: 'full',
    meta: FULL_META,
    species: { azumarill: FULL_AZUMARILL_DETAIL },
    mustContain: ['Most faced'],
  },
];

const PAGES = [
  ['great', '/great'],
  ['teams', '/great/teams'],
  ['species-azumarill', '/great/p/azumarill'],
  ['about', '/about'],
  ['great-w7-legend', '/great?w=7&band=legend'],
];

const errors = [];

/** Serves /api/v1/meta and /api/v1/species/<id> from the run's fixture; every other request
 * (the static bundle, the baked json files, sprites) goes to the network unchanged. */
function fixtureFor(run) {
  return async (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/meta') {
      await request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(run.meta),
      });
      return;
    }
    if (url.pathname.startsWith('/api/v1/species/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/v1/species/'.length));
      const detail = run.species[id] ?? { ...EMPTY_SPECIES_DETAIL, speciesId: id };
      await request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detail),
      });
      return;
    }
    await request.continue();
  };
}

async function settle(page) {
  await page.waitForSelector('main', { timeout: 30_000 });
  await page.waitForFunction(
    () => !(document.querySelector('main')?.textContent ?? '').includes('Loading'),
    { timeout: 30_000 },
  );
  // Sprite discs and layout finish settling a beat after the data does.
  await new Promise((r) => setTimeout(r, 300));
}

async function assertNoOverflow(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (scrollWidth > innerWidth) {
    throw new Error(
      `${label}: sideways overflow (document.documentElement.scrollWidth ${scrollWidth} > window.innerWidth ${innerWidth})`,
    );
  }
}

async function assertAscii(page, label) {
  const bad = await page.evaluate(() => {
    const text = document.body.innerText;
    const hit = [...text].find((c) => c.charCodeAt(0) > 127);
    if (!hit) {
      return null;
    }
    const i = text.indexOf(hit);
    return `${hit} (U+${hit.codePointAt(0).toString(16).padStart(4, '0')}) in: ${text.slice(Math.max(0, i - 40), i + 40)}`;
  });
  if (bad) {
    throw new Error(`${label}: non-ASCII text rendered: ${bad}`);
  }
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox'] : [])],
});

const t0 = Date.now();

for (const run of RUNS) {
  console.log(`== ${run.name} ==`);
  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  page.on('console', (m) => {
    if (m.type() !== 'error') {
      return;
    }
    const text = m.text();
    // Chrome logs every failed resource load to the console with exactly this prefix, whichever
    // resource it was: the message carries no URL to tell a blocked sprite apart from a broken
    // build, so it is never used to make that call. `requestfailed` below has the actual URL and
    // is the one place a sprite failure is allowed through; a failure that reaches the console
    // with any other shape (an uncaught exception, a React warning promoted to an error) still
    // fails the run. Confirmed by forcing every sprite request to fail
    // (PICKTHREE_TEST_BLOCK_SPRITES=1): the resulting console text was the bare
    // "Failed to load resource: net::ERR_CONNECTION_REFUSED", with nothing identifying which
    // request it was for.
    if (/^Failed to load resource: net::/.test(text)) {
      return;
    }
    errors.push(`[${run.name} console.error] ${text}`);
  });
  page.on('pageerror', (e) => errors.push(`[${run.name} pageerror] ${e.message}`));
  page.on('requestfailed', (r) => {
    if (isSpriteUrl(r.url())) {
      return;
    }
    if (r.failure()?.errorText !== 'net::ERR_ABORTED') {
      errors.push(`[${run.name} requestfailed] ${r.url()} ${r.failure()?.errorText}`);
    }
  });

  await page.setRequestInterception(true);
  page.on('request', fixtureFor(run));

  for (const [name, urlPath] of PAGES) {
    console.log(`  ${name}`);
    await page.goto(`${base}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const label = `${run.name} ${name}`;
    await assertNoOverflow(page, label);
    await assertAscii(page, label);
    const file = path.join(outDir, `${run.name}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    // A viewport capture alongside the full-page one: what a reader actually meets above the
    // fold at phone width, the header row included, rather than a tall image that scrolls the
    // header out of frame by the time anyone looks at it.
    const viewportFile = path.join(outDir, `${run.name}-${name}-viewport.png`);
    await page.screenshot({ path: viewportFile, fullPage: false });
    console.log(`    ${run.name}-${name}.png (${Date.now() - t0} ms)`);

    // The overview page (both plain and with the window/band query set) is where the
    // below-threshold banner and the measured list actually render, so that is where this run's
    // defining content is checked.
    if (name === 'great' || name === 'great-w7-legend') {
      const bodyText = await page.evaluate(() => document.body.innerText);
      for (const needle of run.mustContain) {
        if (!bodyText.includes(needle)) {
          throw new Error(`${label}: expected the page to contain ${JSON.stringify(needle)}`);
        }
      }
    }
  }

  await page.close();
}

await browser.close();
console.log(`done in ${Date.now() - t0} ms`);
if (errors.length > 0) {
  console.log('\nBrowser errors:');
  for (const e of errors) {
    console.log(`  ${e}`);
  }
  process.exitCode = 1;
}
