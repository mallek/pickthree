/* global document, window */
/**
 * Drives the built meta site in the locally installed Chrome and screenshots every screen at
 * phone size. Modeled on apps/web/scripts/screens.mjs: same puppeteer-core setup, same
 * CHROME_PATH handling, same console-error collection and failure behaviour.
 *
 * There is no worker behind `npx vite preview` for apps/meta, so this script intercepts
 * /api/v1/meta, /api/v1/teams, /api/v1/species/<id> and /epochs.json itself and answers from a
 * fixture, rather than depending on live data (or polluting it). The three baked matrix/rank
 * files (/matrix/<league>.json, /ranks/<league>.json, /baseline/<league>-teams.json) and the
 * legality list (/legal/<league>.json) are real output of `npm -w @pickthree/meta run build`'s
 * bake step: this script reads them straight off disk (apps/meta/public/) rather than inventing
 * them, both to build believable fixtures (real species ids, so sprites resolve, and a real ban
 * list, so the banned copy is driven by real data) and to serve them back to the page explicitly
 * rather than relying on the preview server's static passthrough for a path this script otherwise
 * controls.
 *
 * It runs the whole page list four times, at the volumes docs/superpowers/specs/2026-09-18-
 * meta-ranking-design.md names for the blend's two half-say points (300 counted battles, 5
 * devices): empty (day one, nothing shared), thin (one device, a sixth of the device say), mid
 * (the battle half-say point almost exactly), and thick (comfortably past both). Each run also
 * seeds a tournament volume (docs/superpowers/specs/2026-09-21-tournament-data-design.md's own
 * half-say points, 100 tournament battles and 2 events): 0, 1 event/40 battles, 1 event/105
 * battles, and 4 events/600 battles, so the Source select's Tournaments and PvPoke views, and the
 * `all` view's three-way blend, all get exercised at a volume where they have something to say.
 * Task 15's report looks at all the screenshots by hand; this script's own job is only to fail on
 * a console error or a needle that stops appearing, not to judge whether the blend "looks right".
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
import { auditPage, forEachTheme, prepareAudit } from '../../../scripts/audit.mjs';

const AUDIT = process.argv.includes('--audit');
/** Screens held to the audit: a finding here fails the run. Each page redesign adds its own
 * screen names as it passes (design foundation, section 5). */
const AUDIT_ENFORCED = new Set([
  'great',
  'great-open',
  'great-sort',
  'great-ranked',
  'pokemon',
  'pokemon-tournaments',
  'pokemon-pvpoke',
  'pokemon-ranked',
  'pokemon-gbl',
  'pokemon-error',
  'great-empty',
  'great-error',
  // `species-${DETAIL_SPECIES}` is added below, once the fixtures have named it.
  'species-thin',
  'species-missing',
  'about',
]);
const auditFindings = [];
/** Every shot name taken this run, so an audit run can tell an enforced name that never ran. */
const captured = new Set();
/** Text scrolled out of its scroll container in a capture, so the audit could not measure it; and
 * per run, page group and theme, the elements measured in some capture. On an enforced screen,
 * text no capture of its page measured in that theme fails the run (the NEVER rule, as in
 * apps/web/scripts/screens.mjs). */
const unmeasured = [];
const measuredOnPage = new Map();

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'screenshots');
const publicDir = path.resolve(here, '..', 'public');
const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4174';
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
AUDIT_ENFORCED.add(`species-${DETAIL_SPECIES}`);
// The thin Species page: the curated group's second pick, with a single week in the window (so
// the weekly card is left out) and battles run but no moves known ("No moves reported yet.").
const THIN_SPECIES = CURATED_IDS[1];
// A well-formed id nothing on the site knows, for the not-found page.
const MISSING_SPECIES = 'missingno';

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
 * curated group does not already know about. `tBattles`/`events` seed the tournament block the
 * same way `battles`/`devices` seed the ladder one; `tournament` is null at 0, matching
 * `TournamentBlock | null` on the real wire type (api.ts). */
function metaFixture(battles, devices, tBattles = 0, events = 0) {
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
    // A previous window only once both sides clear TREND_MIN (200) by a wide margin, the thick
    // run: the top two picks swap places since then, so the list shows one rising and one falling
    // trend tag, well past `trendPoints`' own 95% band, and the audit sees both tones.
    previous:
      battles < 1000
        ? null
        : {
            battles,
            species: CURATED_IDS.map((id, i) => ({
              speciesId: id,
              sightings: Math.round(
                battles * (i === 0 ? SHARE_CURVE[1] : i === 1 ? SHARE_CURVE[0] : SHARE_CURVE[i]),
              ),
            })),
          },
    tournament: tBattles === 0 ? null : tournamentFixture(tBattles, events),
    generatedAt: ISO_NOW,
  };
}

/** A tournament species stat at one seeded volume: picks distributed over the curated group's own
 * top six by the same `SHARE_CURVE` ladder battles use, so the two populations look like they
 * describe the same league rather than two unrelated shapes. The exact win/loss split does not
 * matter to this pass, only that a record renders. */
function tournamentSpeciesStats(speciesId, share, battles) {
  const picks = Math.round(battles * share);
  const game1Picks = Math.round(picks * 0.6);
  const [wins, losses] = splitDecided(picks, 0.5);
  return { speciesId, picks, game1Picks, wins, losses, unresolvedForms: 0 };
}

/** The tournament block at one seeded volume: `battles` and `events` are the two numbers that
 * drive `tournamentSay` (rank.ts), the tournament curve's own half-say points, the same way
 * `metaFixture`'s battles/devices drive the ladder curve. `eventsOther` stays 0: this pass never
 * exercises an event on a non-blended cup, which has its own coverage in rank.test.ts. */
function tournamentFixture(battles, events) {
  const species = CURATED_IDS.map((id, i) =>
    tournamentSpeciesStats(id, SHARE_CURVE[i] ?? 0, battles),
  );
  return { events, battles, eventsOther: 0, species };
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
  // A second complete team on the core's pair, faced only: the core is then seen in two teams,
  // which is what puts the "Multi-team only" chip on the board (the `great-sort` capture turns it
  // on), and it is the faced-only branch of the collapsed row's line.
  const teamA2 = teamRow([a, b, d].sort(), 'team', 0, Math.round(battles * 0.03));
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
    teams: [teamA, teamA2, teamB],
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

/** PvPoke's recommended set for a species, straight off the baked baseline, so the fixture's
 * moves are real move ids the page can name and the "PvPoke's set" tag has a set to match. */
function baselineSet(speciesId) {
  const entry = BASELINE.species.find((s) => s.speciesId === speciesId);
  return { fast: entry.fastMove, charged: [...entry.chargedMoves] };
}

/** Splits `total` over `shares` in whole numbers that still add up to `total`. */
function splitWhole(total, shares) {
  const out = shares.map((s) => Math.floor(total * s));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

/** The full Species page: three weeks (charted once every week clears SHARE_MIN, the counts-only
 * fallback below that), partners seen next to it, moves known in some of the battles it was run
 * in (so "Moves known in X of Y" has two different numbers), and, once the run seeds tournament
 * battles, a tournament block with roster sets, one of them PvPoke's own. */
function speciesDetailFixture(battles, tBattles) {
  if (battles === 0) {
    return EMPTY_SPECIES_DETAIL;
  }
  const s = speciesStats(DETAIL_SPECIES, SHARE_CURVE[0] ?? 0, battles);
  const weekShares = [0.3, 0.3, 0.4];
  const weekBattles = splitWhole(battles, weekShares);
  const weekSightings = splitWhole(s.sightings, [0.26, 0.32, 0.42]);
  const [b, c, d] = CURATED_IDS.slice(1);
  const pvpokeSet = baselineSet(DETAIL_SPECIES);
  const known = Math.round(s.runs * 0.6);
  const [mainSet, otherSet] = splitWhole(known, [0.75, 0.25]);
  const picks = Math.round(tBattles * (SHARE_CURVE[0] ?? 0));
  const [tWins, tLosses] = splitDecided(picks, 0.5);
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
    weekly: ['2026-W35', '2026-W36', '2026-W37'].map((week, i) => ({
      week,
      battles: weekBattles[i],
      sightings: weekSightings[i],
    })),
    bands: [],
    alongside: [
      { speciesId: b, battles: Math.round(s.sightings * 0.3) },
      { speciesId: c, battles: Math.round(s.sightings * 0.2) },
      { speciesId: d, battles: Math.round(s.sightings * 0.1) },
    ],
    movesets: [
      { ...pvpokeSet, battles: mainSet },
      { fast: pvpokeSet.fast, charged: [pvpokeSet.charged[0], 'PLAY_ROUGH'], battles: otherSet },
    ],
    tournament:
      tBattles === 0
        ? null
        : {
            picks,
            game1Picks: Math.round(picks * 0.6),
            wins: tWins,
            losses: tLosses,
            byDepth: [],
            unresolvedForms: 1,
            broughtBy: 9,
            rosterSize: 32,
            pickedOnStream: Math.min(picks, 7),
            movesets: [
              { ...pvpokeSet, entries: 6 },
              { fast: pvpokeSet.fast, charged: [pvpokeSet.charged[0], 'PLAY_ROUGH'], entries: 2 },
            ],
            movesetsKnown: 8,
          },
    generatedAt: ISO_NOW,
  };
}

/** The thin Species page: one week in the window, so the weekly card is left out, and battles run
 * with no moves known, so the moves card says "No moves reported yet." rather than a share. */
function thinSpeciesDetailFixture(battles) {
  if (battles === 0) {
    return { ...EMPTY_SPECIES_DETAIL, speciesId: THIN_SPECIES };
  }
  const s = speciesStats(THIN_SPECIES, SHARE_CURVE[1] ?? 0, battles);
  return {
    ...EMPTY_SPECIES_DETAIL,
    speciesId: THIN_SPECIES,
    sightings: s.sightings,
    wins: s.wins,
    losses: s.losses,
    runs: s.runs,
    runWins: s.runWins,
    runLosses: s.runLosses,
    weekly: [{ week: '2026-W37', battles, sightings: s.sightings }],
    movesets: [],
    tournament: null,
  };
}

function devicesText(n) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'device' : 'devices'}`;
}

function eventsText(n) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'event' : 'events'}`;
}

/** Whole-percent tournament say, exactly as `tournamentSay` (rank.ts) computes it: min(battles
 * curve, events curve). The tournament-only line (`blendParts`' `source === 'tournament'`
 * branch) rounds at exactly this one point, so this number alone reproduces it. */
function tournamentSay(battles, events) {
  const byBattles = battles <= 0 ? 0 : battles / (battles + 100);
  const byEvents = events <= 0 ? 0 : events / (events + 2);
  return Math.round(Math.min(byBattles, byEvents) * 100);
}

/** The `all` source's header line once a window has both shared ladder battles and blended
 * tournament battles (headerCopy.ts's `hasTournament` branch). Built from the same unrounded
 * curves rank.ts computes, not from a rounded-percent helper like `tournamentSay` above:
 * headerCopy.ts rounds the ladder and tournament percentages from the unrounded fractions, then
 * gives PvPoke the remainder, `100 - tPct - lPct` (Finding 3, 2026-09-28 whole-branch review),
 * rather than its own independently rounded fraction, so the three parts always sum to 100. */
function headerFragmentAll(battles, devices, tBattles, events) {
  const say = Math.min(
    battles <= 0 ? 0 : battles / (battles + 300),
    devices <= 0 ? 0 : devices / (devices + 5),
  );
  const tSay = Math.min(
    tBattles <= 0 ? 0 : tBattles / (tBattles + 100),
    events <= 0 ? 0 : events / (events + 2),
  );
  const tPct = Math.round((1 - say) * tSay * 100);
  const lPct = Math.round(say * 100);
  const pvpokePct = 100 - tPct - lPct;
  const tourney = `${tBattles.toLocaleString('en-US')} tournament ${tBattles === 1 ? 'battle' : 'battles'} from ${eventsText(events)}`;
  if (battles === 0) {
    return `PvPoke ${pvpokePct}%, tournaments ${tPct}%. From ${tourney}. No shared ladder battles in this window yet.`;
  }
  const shared = `${battles.toLocaleString('en-US')} shared ${battles === 1 ? 'battle' : 'battles'}`;
  return `PvPoke ${pvpokePct}%, tournaments ${tPct}%, GBL ${lPct}%. From ${shared} by ${devicesText(devices)} and ${tourney}.`;
}

const TERM = 'How it is ranked';

/** The one line the lists open with (headerCopy.ts's `blendParts`, joined with " · ", then the
 * "How it is ranked" Term), under the `all` source. Built from the same unrounded curves as
 * `headerFragmentAll` above; PvPoke's own part is `100 - t - l`, the same remainder rule (Finding
 * 3), so this line can never disagree with `headerFragmentAll`'s sentence for the same volumes. */
function blendLineAll(battles, devices, tBattles, events) {
  if (battles === 0 && tBattles === 0) {
    return `PvPoke 100% · No shared battles yet · ${TERM}`;
  }
  const say = Math.min(
    battles <= 0 ? 0 : battles / (battles + 300),
    devices <= 0 ? 0 : devices / (devices + 5),
  );
  const tSay = Math.min(
    tBattles <= 0 ? 0 : tBattles / (tBattles + 100),
    events <= 0 ? 0 : events / (events + 2),
  );
  const t = Math.round((1 - say) * tSay * 100);
  const l = Math.round(say * 100);
  const p = 100 - t - l;
  const parts = [`PvPoke ${p}%`];
  if (tBattles > 0) {
    parts.push(`Tournaments ${t}%`);
  }
  if (battles > 0) {
    parts.push(`GBL ${l}%`);
  }
  return [...parts, TERM].join(' · ');
}

/** The same line under the tournament source. */
function blendLineTournament(tBattles, events) {
  if (tBattles === 0) {
    return `PvPoke 100% · No tournament battles yet · ${TERM}`;
  }
  const t = tournamentSay(tBattles, events);
  return `PvPoke ${100 - t}% · Tournaments ${t}% · ${TERM}`;
}

/** The same line under the GBL source (`blendParts`' ladder branch): the ladder say alone. */
function blendLineLadder(battles, devices) {
  if (battles === 0) {
    return `PvPoke 100% · No shared battles yet · ${TERM}`;
  }
  const say = Math.min(
    battles <= 0 ? 0 : battles / (battles + 300),
    devices <= 0 ? 0 : devices / (devices + 5),
  );
  const l = Math.round(say * 100);
  return `PvPoke ${100 - l}% · GBL ${l}% · ${TERM}`;
}

const PRIOR_LINE = `PvPoke 100% · ${TERM}`;

/** Needles for one seeded volume: the one line on every list capture, and the Term's first
 * sentence (`sourceHeaderLine`, the sentence the line used to be) on the captures that open it. */
function needlesFor({ battles, devices, tBattles, events }) {
  const all = blendLineAll(battles, devices, tBattles, events);
  const zero = battles === 0 && tBattles === 0;
  return {
    great: [all],
    // Every run's board has full-team rows (generated ones on the empty run), so an opened row
    // always shows its matchup score and its pick3 link.
    'great-open': [all, 'Matchup score', 'Open in pick3'],
    'great-empty': [
      'No teams shared in this window yet, and no projections could be loaded.',
      'Help fill this in',
    ],
    'great-error': ['Could not load the team board.', 'Try again'],
    'great-sort': [all, 'Sort: Matchup'],
    'great-ranked': [
      zero
        ? "Projected against PvPoke's meta group. No shared battles in this window yet."
        : headerFragmentAll(battles, devices, tBattles, events),
    ],
    pokemon: [all],
    'pokemon-ranked': [
      zero
        ? "PvPoke's list. No shared battles in this window yet."
        : headerFragmentAll(battles, devices, tBattles, events),
    ],
    'pokemon-tournaments': [blendLineTournament(tBattles, events)],
    'pokemon-pvpoke': [PRIOR_LINE, 'Nothing measured.'],
    'pokemon-gbl': [blendLineLadder(battles, devices)],
    'pokemon-error': ['Could not load the shared battles.', 'Try again'],
    'species-thin': battles === 0 ? [] : ['No moves reported yet.'],
    'species-missing': ['No Pokémon by that name in'],
    about: ['Appearance'],
  };
}

const RUNS = [
  { name: 'empty', battles: 0, devices: 0, tBattles: 0, events: 0 },
  { name: 'thin', battles: 50, devices: 1, tBattles: 40, events: 1 },
  { name: 'mid', battles: 500, devices: 5, tBattles: 105, events: 1 },
  { name: 'thick', battles: 5000, devices: 30, tBattles: 600, events: 4 },
].map((run) => {
  const needles = needlesFor(run);
  needles.great.push(...(run.battles === 0 ? ['Projected'] : []));
  needles.pokemon.push(...(run.name === 'thick' ? ['PvPoke #'] : []));
  needles[`species-${DETAIL_SPECIES}`] =
    run.battles === 0 ? [] : ['Moves known in', 'Who beats it', 'Build a team around it'];
  return {
    ...run,
    needles,
    meta: metaFixture(run.battles, run.devices, run.tBattles, run.events),
    teams: teamsFixture(run.battles, run.devices),
    speciesDetail: speciesDetailFixture(run.battles, run.tBattles),
    thinSpeciesDetail: thinSpeciesDetailFixture(run.battles),
  };
});

/** Opens the first few team rows: the board renders every row collapsed, so without this no
 * capture sees the panel that carries most of the screen's copy (the record sentence, the
 * matchup score, the thirds a core was seen with, the nested build lines). */
async function openRows(page) {
  await page.evaluate(() => {
    for (const head of Array.from(document.querySelectorAll('.row-head')).slice(0, 3)) {
      head.click();
    }
  });
}

/** Opens the "How it is ranked" Term under the list's one line. */
async function openRanked(page) {
  await page.click('.term');
  await page.waitForSelector('.term-tip', { timeout: 10_000 });
}

/** Multi-team only on (when the board offers it) and Sort set to its second option. Sort is a
 * native select under the InlineSelect's text, so the capture shows the choice made, not the
 * platform's open picker, which no screenshot can see. */
async function sortSecond(page, run) {
  const chipFound = await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll('.board-controls .chip')).find((b) =>
      (b.textContent ?? '').includes('Multi-team only'),
    );
    if (!chip) {
      return false;
    }
    chip.click();
    return true;
  });
  // The fixture's core is in two teams once anything is shared (`teamA2`), so the chip must be
  // on the board then; only the empty run, projections alone, has nothing for it to act on.
  if (!chipFound && run.battles > 0) {
    throw new Error(`${run.name} great-sort: the Multi-team only chip is missing`);
  }
  const second = await page.evaluate(
    () => document.querySelector('.board-controls select')?.options[1]?.value ?? null,
  );
  if (second === null) {
    throw new Error('great-sort: the Sort select has no second option');
  }
  await page.select('.board-controls select', second);
  if (chipFound) {
    const pressed = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.board-controls .chip'))
          .find((b) => (b.textContent ?? '').includes('Multi-team only'))
          ?.getAttribute('aria-pressed') ?? null,
    );
    if (pressed !== 'true') {
      throw new Error(`${run.name} great-sort: Multi-team only did not turn on`);
    }
  }
}

/** The empty board's deliberate failure: the baked teams and the matchup slice both 404. */
const NO_PROJECTIONS = {
  [`/baseline/${LEAGUE}-teams.json`]: 404,
  [`/matrix/${LEAGUE}.json`]: 404,
};

/** [capture name, path, action after the page settles, page group for the NEVER rule, options].
 * The group is the page a capture belongs to: text scrolled out of view in one capture of a page
 * counts as measured when another capture of the same page, in the same run and theme, measured
 * it. Options: `runs` limits a capture to the runs where it says something (a state that does
 * not change with the volume is taken once); `fail` maps the paths the capture fails on purpose
 * to the status they answer with, for that capture only. */
const PAGES = [
  ['great', `/${LEAGUE}`, null, 'great'],
  ['great-open', `/${LEAGUE}`, openRows, 'great'],
  ['great-sort', `/${LEAGUE}`, sortSecond, 'great'],
  ['great-ranked', `/${LEAGUE}`, openRanked, 'great'],
  // The empty board: nothing shared and the projections failed to load, so there is no row.
  ['great-empty', `/${LEAGUE}`, null, 'great-empty', { runs: ['empty'], fail: NO_PROJECTIONS }],
  [
    'great-error',
    `/${LEAGUE}`,
    null,
    'great-error',
    { runs: ['thin'], fail: { '/api/v1/teams': 503 } },
  ],
  ['pokemon', `/${LEAGUE}/pokemon`, null, 'pokemon'],
  ['pokemon-ranked', `/${LEAGUE}/pokemon`, openRanked, 'pokemon'],
  ['pokemon-tournaments', `/${LEAGUE}/pokemon?source=tournament`, null, 'pokemon-tournaments'],
  ['pokemon-pvpoke', `/${LEAGUE}/pokemon?source=prior`, null, 'pokemon-pvpoke'],
  ['pokemon-gbl', `/${LEAGUE}/pokemon?source=ladder`, null, 'pokemon-gbl'],
  [
    'pokemon-error',
    `/${LEAGUE}/pokemon`,
    null,
    'pokemon-error',
    { runs: ['thin'], fail: { '/api/v1/meta': 503 } },
  ],
  [`species-${DETAIL_SPECIES}`, `/${LEAGUE}/p/${DETAIL_SPECIES}`, null, 'species'],
  ['species-thin', `/${LEAGUE}/p/${THIN_SPECIES}`, null, 'species-thin'],
  ['species-missing', `/${LEAGUE}/p/${MISSING_SPECIES}`, null, 'species-missing'],
  ['about', '/about', null, 'about'],
];

const errors = [];
/** The paths the capture being taken fails on purpose (pathname to status); empty otherwise. */
let failing = new Map();

/** Serves /api/v1/meta, /api/v1/teams, /api/v1/species/<id> and /epochs.json from the run's
 * fixture, and the three baked matrix/rank files straight off disk (apps/meta/public), for
 * whichever league the page asks for. Every other request (the static bundle, /leagues.json,
 * /seasons.json, /species.json, /moves.json, the curated /baseline/<league>.json, sprites) goes
 * to the network unchanged. */
function fixtureFor(run) {
  return async (request) => {
    const url = new URL(request.url());
    const failStatus = failing.get(url.pathname);
    if (failStatus !== undefined) {
      await request.respond({
        status: failStatus,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'fixture failure' }),
      });
      return;
    }
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
        id === DETAIL_SPECIES
          ? run.speciesDetail
          : id === THIN_SPECIES
            ? run.thinSpeciesDetail
            : { ...EMPTY_SPECIES_DETAIL, speciesId: id };
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
    const legal = /^\/legal\/([a-z]+)\.json$/.exec(url.pathname);
    if (legal) {
      const body = fs.readFileSync(path.join(publicDir, 'legal', `${legal[1]}.json`), 'utf8');
      await request.respond({ status: 200, contentType: 'application/json', body });
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

/** The site's copy writes "Pokémon" with its accent and "·" between the parts of a line, so the
 * old 7-bit ASCII check is retired (docs/superpowers/specs/2026-09-28-design-meta-design.md). The
 * no-em-dash rule stays, and this is where the screens pass checks it. */
async function assertNoEmDash(page, label) {
  const bad = await page.evaluate(() => {
    const text = document.body.innerText;
    // Built from its code point: the source itself never holds the character it looks for.
    const i = text.indexOf(String.fromCharCode(0x2014));
    return i === -1 ? null : text.slice(Math.max(0, i - 40), i + 40);
  });
  if (bad !== null) {
    throw new Error(`${label}: an em dash (U+2014) is on screen in: ${bad}`);
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
    // A capture that fails a request on purpose (`fail` in PAGES) gets Chrome's HTTP-status line
    // for exactly those paths and statuses; this message does carry the URL, in its location.
    const status = /^Failed to load resource: the server responded with a status of (\d+)/.exec(
      text,
    );
    if (status) {
      let pathname;
      try {
        pathname = new URL(m.location()?.url ?? '').pathname;
      } catch {
        pathname = null;
      }
      if (pathname !== null && failing.get(pathname) === Number(status[1])) {
        return;
      }
    }
    errors.push(`[${run.name} console.error] ${text} ${m.location()?.url ?? ''}`);
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

  for (const [name, urlPath, act, group, opts = {}] of PAGES) {
    if (opts.runs && !opts.runs.includes(run.name)) {
      continue;
    }
    console.log(`  ${name}`);
    // Set before the load, and replaced by the next capture's (usually empty) map, so a deliberate
    // failure never leaks into another capture.
    failing = new Map(Object.entries(opts.fail ?? {}));
    await page.goto(`${base}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    // A click-then-capture step (a row open, the Sort changed, the Term open) acts on the settled
    // page and settles again before anything is checked or shot.
    if (act) {
      await act(page, run);
      await settle(page);
    }
    captured.add(name);
    const label = `${run.name} ${name}`;
    await assertNoOverflow(page, label);
    await assertNoEmDash(page, label);
    const file = path.join(outDir, `${run.name}-${name}.png`);
    // A full-page shot resizes the viewport to the page instead of stitching past it, so the fixed
    // tab bar lands at the true bottom rather than across the middle of the page (and over
    // whatever card happens to sit there).
    await page.screenshot({ path: file, fullPage: true, captureBeyondViewport: false });
    // A viewport capture alongside the full-page one: what a reader actually meets above the
    // fold at phone width, the header row included, rather than a tall image that scrolls the
    // header out of frame by the time anyone looks at it.
    const viewportFile = path.join(outDir, `${run.name}-${name}-viewport.png`);
    await page.screenshot({ path: viewportFile, fullPage: false });
    console.log(`    ${run.name}-${name}.png (${Date.now() - t0} ms)`);

    if (AUDIT) {
      await forEachTheme(page, async (theme) => {
        await page.screenshot({
          path: path.join(outDir, `${run.name}-${name}-audit-${theme}.png`),
          fullPage: true,
          captureBeyondViewport: false,
        });
        const report = { unmeasured: [], measured: [] };
        for (const f of await auditPage(page, report)) {
          auditFindings.push({ name, line: `[${run.name} ${name} ${theme}] ${f}` });
        }
        // Keyed by run and theme too: the fixture volume changes what a page holds, and text
        // measured only in light says nothing about its contrast in dark.
        const pageKey = `${run.name} ${group}|${theme}`;
        const seen = measuredOnPage.get(pageKey) ?? new Set();
        report.measured.forEach((k) => seen.add(k));
        measuredOnPage.set(pageKey, seen);
        for (const u of report.unmeasured) {
          unmeasured.push({ name, run: run.name, theme, group, ...u });
        }
      });
    }

    const needles = run.needles[name];
    if (needles) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      for (const needle of needles) {
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
if (AUDIT) {
  // Text never on screen in any capture of its page, in that run and theme, was never measured
  // at all. On an enforced screen that is a finding: the audit cannot vouch for its contrast.
  const unmeasuredLines = unmeasured.map((u) => {
    const measuredElsewhere =
      measuredOnPage.get(`${u.run} ${u.group}|${u.theme}`)?.has(u.key) ?? false;
    const enforcedName = AUDIT_ENFORCED.has(u.name);
    const text = u.text.slice(0, 40);
    const at = `${u.run} ${u.name} ${u.theme}`;
    if (!measuredElsewhere && enforcedName) {
      auditFindings.push({
        name: u.name,
        line: `[${at}] contrast unmeasured: ${u.selector} "${text}" is scrolled out of its container and no ${u.theme} capture of ${u.run} ${u.group} measured it`,
      });
    }
    const where = measuredElsewhere
      ? `measured in another ${u.theme} capture of ${u.run} ${u.group}`
      : `NEVER measured in any ${u.theme} capture of ${u.run} ${u.group}`;
    const mark = enforcedName ? ' (enforced)' : '';
    return `  [${at}]${mark} ${u.selector} "${text}": ${where}`;
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
