/* global document, window */
/**
 * Drives the built meta site in the locally installed Chrome and screenshots every screen at
 * phone size. Modeled on apps/web/scripts/screens.mjs: same puppeteer-core setup, same
 * CHROME_PATH handling, same console-error collection and failure behaviour.
 *
 * There is no worker behind `npx vite preview` for apps/meta, so this script intercepts
 * /api/v1/meta, /api/v1/teams, /api/v1/species/<id> and /epochs.json itself and answers from a
 * fixture, rather than depending on live data (or polluting it). The three baked matrix/rank
 * files (/matrix/<league>.json, /ranks/<league>.json, /baseline/<league>-teams.json) are real
 * output of `npm -w @pickthree/meta run build`'s bake step: this script reads them straight off
 * disk (apps/meta/public/) rather than inventing them, both to build believable fixtures (real
 * species ids, so sprites resolve) and to serve them back to the page explicitly rather than
 * relying on the preview server's static passthrough for a path this script otherwise controls.
 *
 * It runs the whole page list four times, at the volumes docs/superpowers/specs/2026-09-18-
 * meta-ranking-design.md names for the blend's two half-say points (300 counted battles, 5
 * devices): empty (day one, nothing shared), thin (one device, a sixth of the device say), mid
 * (the battle half-say point almost exactly), and thick (comfortably past both). Task 15's report
 * looks at all sixteen screenshots by hand; this script's own job is only to fail on a console
 * error or a needle that stops appearing, not to judge whether the blend "looks right".
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
const publicDir = path.resolve(here, '..', 'public');
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
const LEAGUE = 'great';

function readPublicJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(publicDir, relPath), 'utf8'));
}

// The real baked baseline (npm -w @pickthree/meta run build must have already run), so the
// fixtures below use species ids that actually have a matrix row and a real sprite, rather than
// invented ids the app would have to render as "outside the slice" or a broken image.
const BASELINE = readPublicJson(path.join('baseline', `${LEAGUE}.json`));
const CURATED_IDS = (() => {
  const seen = new Set();
  const ids = [];
  for (const s of BASELINE.species) {
    if (!seen.has(s.speciesId)) {
      seen.add(s.speciesId);
      ids.push(s.speciesId);
    }
    if (ids.length >= 6) {
      break;
    }
  }
  return ids;
})();
// The species drill-down target: the curated group's own top pick, guaranteed a matrix row, a
// real sprite, and (once battles > 0) a nonzero record from the species stats built below.
const DETAIL_SPECIES = CURATED_IDS[0];

const SHARE_CURVE = [0.3, 0.22, 0.16, 0.12, 0.1, 0.08];

function splitDecided(n, winShare) {
  const wins = Math.round(n * winShare);
  return [wins, n - wins];
}

function speciesStats(speciesId, share, battles) {
  const sightings = Math.round(battles * share);
  const [wins, losses] = splitDecided(sightings, 0.55);
  const runs = Math.round(sightings * 0.4);
  const [runWins, runLosses] = splitDecided(runs, 0.5);
  return { speciesId, sightings, wins, losses, runs, runWins, runLosses };
}

/** The measured summary at one seeded volume: battles and devices are the two numbers that drive
 * `measuredSay` (rank.ts), so they are the whole point of each run, not filler. Species stats are
 * distributed over the curated group's own top six by a fixed share curve, so the copy has real
 * numbers to print (a bar, a share, a record) without claiming anything about a species the
 * curated group does not already know about. */
function metaFixture(battles, devices) {
  const species =
    battles === 0 ? [] : CURATED_IDS.map((id, i) => speciesStats(id, SHARE_CURVE[i] ?? 0, battles));
  return {
    league: LEAGUE,
    since: ISO_SINCE_SEASON,
    until: ISO_NOW,
    band: 'all',
    battles,
    tanked: Math.round(battles * 0.03),
    devices,
    bands:
      battles === 0
        ? {}
        : {
            below: Math.round(battles * 0.2),
            ace: Math.round(battles * 0.3),
            veteran: Math.round(battles * 0.25),
            expert: Math.round(battles * 0.15),
            legend: Math.round(battles * 0.1),
          },
    sources: battles === 0 ? {} : { ladder: battles },
    species,
    teams: [],
    previous: null,
    generatedAt: ISO_NOW,
  };
}

function teamRow(species, kind, run, faced, winShare = 0.58) {
  const [runWins, runLosses] = splitDecided(run, winShare);
  const [facedWins, facedLosses] = splitDecided(faced, winShare);
  return {
    species,
    kind,
    runBattles: run,
    runWins,
    runLosses,
    facedBattles: faced,
    facedWins,
    facedLosses,
    moves: species.map(() => null),
    thirds: [],
  };
}

/**
 * The shared team board at the same seeded volume. `core` shares its pair with `teamA`, so
 * buildBoard (teamRank.ts) nests teamA under it ("Built as" / "Seen with"); `teamB` shares no pair
 * with any core here, so it stands alone as an orphaned "Full team" card. Every count scales with
 * `battles`, so `decided` (runBattles + facedBattles) crosses teamRank.ts's TEAM_MIN (15) only at
 * the larger volumes: at 0 battles nothing is shared; at 50 every row is still under 15 decided,
 * so `a` floors to 0 and the board is projection-only.
 *
 * `core` and `teamA` are also given a real record (0.80 win share) well above their own baked
 * projection (high 50s to low 60s here, PvPoke's matchup data for this pair), the "climb the
 * board as their record lands" case the spec's cold-start section describes: at `mid` their score
 * is already competitive with the generated board's top projections, and by `thick` (a > 0.9) it
 * should clear them, so the observed rows actually lead. `teamB` keeps a middling, unexceptional
 * record (the default win share) throughout, as the plainer contrast case.
 */
function teamsFixture(battles, devices) {
  if (battles === 0) {
    return {
      league: LEAGUE,
      since: ISO_SINCE_SEASON,
      until: ISO_NOW,
      band: 'all',
      battles: 0,
      devices: 0,
      sources: {},
      teams: [],
      cores: [],
      generatedAt: ISO_NOW,
    };
  }
  const [a, b, c, d, e, f] = CURATED_IDS;
  const OVERPERFORM = 0.8;
  const core = teamRow(
    [a, b].sort(),
    'core',
    Math.round(battles * 0.08),
    Math.round(battles * 0.04),
    OVERPERFORM,
  );
  // Shares the core's own pair [a, b], so buildBoard nests it as the core's "Full team".
  const teamA = teamRow(
    [a, b, c].sort(),
    'team',
    Math.round(battles * 0.06),
    Math.round(battles * 0.03),
    OVERPERFORM,
  );
  // Shares no pair with `core`, so it stands alone on the board as an orphaned "Full team" card,
  // run-only (never faced), the third recordLine branch (Teams.tsx's "reporters went").
  const teamB = teamRow([d, e, f].sort(), 'team', Math.round(battles * 0.016), 0);
  return {
    league: LEAGUE,
    since: ISO_SINCE_SEASON,
    until: ISO_NOW,
    band: 'all',
    battles,
    devices,
    sources: { ladder: battles },
    teams: [teamA, teamB],
    cores: [core],
    generatedAt: ISO_NOW,
  };
}

const EMPTY_SPECIES_DETAIL = {
  league: LEAGUE,
  speciesId: DETAIL_SPECIES,
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
  generatedAt: ISO_NOW,
};

function speciesDetailFixture(battles) {
  if (battles === 0) {
    return EMPTY_SPECIES_DETAIL;
  }
  const s = speciesStats(DETAIL_SPECIES, SHARE_CURVE[0] ?? 0, battles);
  return {
    league: LEAGUE,
    speciesId: DETAIL_SPECIES,
    since: ISO_SINCE_SEASON,
    until: ISO_NOW,
    band: 'all',
    sightings: s.sightings,
    wins: s.wins,
    losses: s.losses,
    runs: s.runs,
    runWins: s.runWins,
    runLosses: s.runLosses,
    weekly: [{ week: '2026-W37', battles, sightings: s.sightings }],
    bands: [{ band: 'ace', sightings: s.sightings, wins: s.wins, losses: s.losses }],
    alongside: [],
    movesets: [],
    generatedAt: ISO_NOW,
  };
}

/** Whole-percent measured, exactly as `measuredSay` (rank.ts) computes it: min(battles curve,
 * devices curve). Kept here as one function, not typed four times, so a fixture's own expected
 * copy string cannot silently drift from the formula that actually renders it. */
function pctMeasured(battles, devices) {
  const byBattles = battles <= 0 ? 0 : battles / (battles + 300);
  const byDevices = devices <= 0 ? 0 : devices / (devices + 5);
  return Math.round(Math.min(byBattles, byDevices) * 100);
}

function battlesText(n) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'battle' : 'battles'}`;
}

function devicesText(n) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'device' : 'devices'}`;
}

function headerFragment(battles, devices) {
  return `${pctMeasured(battles, devices)}% measured, from ${battlesText(battles)} shared by ${devicesText(devices)}`;
}

const RUNS = [
  {
    name: 'empty',
    battles: 0,
    devices: 0,
    needles: {
      great: [
        "Projected against PvPoke's meta group. No shared battles in this window yet.",
        'Projected',
      ],
      pokemon: ["PvPoke's list. No shared battles in this window yet."],
    },
  },
  {
    name: 'thin',
    battles: 50,
    devices: 1,
    needles: {
      great: [headerFragment(50, 1)],
      pokemon: [headerFragment(50, 1)],
    },
  },
  {
    name: 'mid',
    battles: 500,
    devices: 5,
    needles: {
      great: [headerFragment(500, 5)],
      pokemon: [headerFragment(500, 5)],
    },
  },
  {
    name: 'thick',
    battles: 5000,
    devices: 30,
    needles: {
      great: [headerFragment(5000, 30)],
      pokemon: [headerFragment(5000, 30), 'PvPoke #'],
    },
  },
].map((run) => ({
  ...run,
  meta: metaFixture(run.battles, run.devices),
  teams: teamsFixture(run.battles, run.devices),
  speciesDetail: speciesDetailFixture(run.battles),
}));

const PAGES = [
  ['great', `/${LEAGUE}`],
  ['pokemon', `/${LEAGUE}/pokemon`],
  [`species-${DETAIL_SPECIES}`, `/${LEAGUE}/p/${DETAIL_SPECIES}`],
  ['about', '/about'],
];

const errors = [];

/** Serves /api/v1/meta, /api/v1/teams, /api/v1/species/<id> and /epochs.json from the run's
 * fixture, and the three baked matrix/rank files straight off disk (apps/meta/public), for
 * whichever league the page asks for. Every other request (the static bundle, /leagues.json,
 * /seasons.json, /species.json, /moves.json, the curated /baseline/<league>.json, sprites) goes
 * to the network unchanged. */
function fixtureFor(run) {
  return async (request) => {
    const url = new URL(request.url());
    const json = (body) =>
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (url.pathname === '/api/v1/meta') {
      await json(run.meta);
      return;
    }
    if (url.pathname === '/api/v1/teams') {
      await json(run.teams);
      return;
    }
    if (url.pathname.startsWith('/api/v1/species/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/v1/species/'.length));
      const detail =
        id === DETAIL_SPECIES ? run.speciesDetail : { ...EMPTY_SPECIES_DETAIL, speciesId: id };
      await json(detail);
      return;
    }
    // Epochs are deliberately empty for every run: the epoch feature (Task 8-9) has its own real
    // coverage elsewhere (apps/meta/test/epochs.test.ts, App.test.tsx's "App, epochs"), and an
    // epoch landing here would either move `since` out from under the fixed ISO_SINCE_SEASON
    // these fixtures use, or fire the commit-mismatch banner, neither of which this pass is about.
    if (url.pathname === '/epochs.json') {
      await json([]);
      return;
    }
    const baked = /^\/(ranks|matrix)\/([a-z]+)\.json$/.exec(url.pathname);
    if (baked) {
      const body = fs.readFileSync(path.join(publicDir, baked[1], `${baked[2]}.json`), 'utf8');
      await request.respond({ status: 200, contentType: 'application/json', body });
      return;
    }
    const bakedTeams = /^\/baseline\/([a-z]+)-teams\.json$/.exec(url.pathname);
    if (bakedTeams) {
      const body = fs.readFileSync(
        path.join(publicDir, 'baseline', `${bakedTeams[1]}-teams.json`),
        'utf8',
      );
      await request.respond({ status: 200, contentType: 'application/json', body });
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
  console.log(`== ${run.name} (${run.battles} battles, ${run.devices} devices) ==`);
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

    const needles = run.needles[name];
    if (needles) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      for (const needle of needles) {
        if (!bodyText.includes(needle)) {
          throw new Error(`${label}: expected the page to contain ${JSON.stringify(needle)}`);
        }
      }
    }

    // The team board renders every row collapsed, so the pass above never sees the panel that
    // carries most of the screen's copy (the record sentence, the matchup score, the thirds a
    // core was seen with, the nested build lines). Open the first few and shoot that state too,
    // or a console error, an overflow or a non-ASCII character in there would go unseen.
    if (name === 'great') {
      const opened = await page.evaluate(() => {
        const heads = Array.from(document.querySelectorAll('.row-head')).slice(0, 3);
        for (const head of heads) {
          head.click();
        }
        return heads.length;
      });
      if (opened > 0) {
        await settle(page);
        const openLabel = `${label} open`;
        await assertNoOverflow(page, openLabel);
        await assertAscii(page, openLabel);
        await page.screenshot({ path: path.join(outDir, `${run.name}-great-open.png`), fullPage: true });
        await page.screenshot({
          path: path.join(outDir, `${run.name}-great-open-viewport.png`),
          fullPage: false,
        });
        console.log(`    ${run.name}-great-open.png (${Date.now() - t0} ms)`);
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
