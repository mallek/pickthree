# Meta Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn meta.pick3.gg from a species list with a hard 300/5 threshold into a teams-first
board whose every number is one continuous blend of PvPoke's curated prior and measured play.

**Architecture:** The 300 and 5 constants stop being gates and become the half-say points of
`blendWeights`, the formula pick3 already runs on device. The worker gains the faced side of the
battle store (teams and cores rolled up from `r.opponents`, a faced team's record being the inverse
of the reporter's) behind a new `/api/v1/teams`. The client keeps doing the ranking: a per-league
matrix slice is baked next to the baselines, and `simStrength` (coverage, consistency and safety
from matrix lookups alone) gives every team and core a projection to blend its record against. Cold
start is answered by teams generated at bake time from the full legal pool at PvPoke default IVs,
shipped as a baked prior and never as battle records.

**Tech Stack:** TypeScript 5.9 strict, Vite 8 + React 19 (`apps/meta`), Cloudflare Workers +
Durable Object SQLite (`workers/counter`), vitest 4, puppeteer-core for the screens pass, tsx for
the bake and the seed script.

**Spec:** `docs/superpowers/specs/2026-09-18-meta-ranking-design.md`

**Supersedes:** the "two sources, and the rule that keeps them apart" section of
`docs/superpowers/specs/2026-09-18-meta-site-design.md`, and the CLAUDE.md rule mirroring it.

---

## Feasibility, settled before planning

The spec left one item deliberately unproven: **can pick3's team generation be driven with no
collection, against the full legal pool at default IVs?**

**Yes.** Measured on this machine against the current data build (`pvpokeCommit`
`00e56418f479c344051ae77da5d5c774d22094af`), with throwaway probes since deleted:

| league | matrix rows | synthetic specimens | eligible builds | pool | trios | full engine incl. simulator |
| --- | --- | --- | --- | --- | --- | --- |
| great | 1146 | 1146 | 1034 | 40 | 9880 | 2917 ms |
| ultra | 844 | 844 | 720 | 40 | 9880 | 2186 ms |
| master | 406 | 406 | 406 | 40 | 9880 | 1317 ms |

What makes it work: PvPoke's own default IV spread for a CP cap is in the game master, per species,
as `defaultIVs["cp1500"] = [level, atk, def, hp]` (present for all 1742 entries). One synthetic
`Specimen` per species carrying that spread feeds `buildsFor` -> `candidatePool` -> `generateTrios`
-> `simulateFinalists` -> `scoreTeam` with nothing else changed. Two details the probe found:

- A specimen's builds must be filtered to its own species (`b.speciesId === s.speciesId`). Otherwise
  a Mudkip specimen produces a Swampert build carrying Mudkip's IV spread.
- Master League has no `cp10000` entry. PvPoke's `Pokemon.initialize` falls back to 15/15/15 at the
  level cap for an uncapped battle, so the helper does the same.

**So the spec's fallback ("generating trios directly from the matrix, cheaper and worse") is not
needed and is not what this plan builds.** The plan does deviate from the spec on one point inside
this answer, and Task 5 states it in code:

**The bake generates with the real engine but scores with the matrix, not with the simulator.**
`scoreTeam`'s `battle` field comes from simulated slot results, where the switch slot gets four
turns of starting energy. The matrix has no such scenario (its three are 0-0, 1-1, 2-2 at zero
energy), so a matrix-derived `simStrength` is a different number. Measured over the 30 strongest
trios, once the slot order is chosen to maximise the matrix score: the mean level offset is only
**-0.8 points** (86.2 matrix versus 85.3 simulated), but the two orderings inside that 1.5 point
band agree only weakly (**Spearman rho 0.38**). The client can only ever compute the matrix number,
because there is no simulator in the browser. If the bake ranked by the simulated number, generated
teams and observed teams would carry two incomparable numbers on one board, and the board's top row
would not be the best team by the number printed on it. So both sides use `simStrength`. Scoring
every trio in a 60-species pool by `simStrength` over all six orderings takes **280 ms** per league,
so the simulator buys nothing the bake needs.

Two more numbers the plan needs, measured the same way:

- **Matrix slice size, top 250 species by PvPoke rank, all opponents, 3 scenarios:** great 160 KB
  raw / **61 KB gzipped** / 56 KB brotli; ultra 151 KB / 57 KB / 51 KB; master 113 KB / 42 KB /
  37 KB. The spec estimated 50 to 70 KB gzipped and was right. (The full matrix is 266 KB gzipped
  for great, so the slice is worth taking.)
- **Client cost of the core prior:** 300 cores each averaged over 48 meta-group thirds is 14,400
  `simStrength` calls in **20 ms** in Node. Budget five to ten times that on a phone.

---

## Global Constraints

- No em dashes anywhere: code, docs, commits, UI copy. eslint `no-restricted-syntax` rejects the
  literal. Use a plain dash or rewrite.
- All reader-facing copy is strict 7-bit ASCII. "Pokemon", not the accented spelling. No middots,
  no arrow glyphs, no smart quotes. Chevrons and arrows are inline SVG.
- Braces on all control flow, even single-line bodies (`curly: all`). `eqeqeq` everywhere.
- Exact pinned versions in every package.json. No `^` or `~`.
- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
  (`tsconfig.base.json`). Indexing an array gives `T | undefined`; handle it, do not cast it away.
  An optional property is set conditionally, never assigned `undefined`.
- Never put `overflow-x` on `html` or `body`. Clip sideways overflow on the app wrapper instead.
- **A projected number is never printed as a win rate.** Only a measured record is shown as a win
  rate. A projection is labelled as one, everywhere, every time.
- **PvPoke's curated list is never described with a measured word** ("faced", "record", "win rate"),
  and measured numbers are never hidden for being small.
- **Nothing PvPoke-derived is ever written into the battle store as a battle record.** Generated
  teams are a baked prior. The seed script is a local development tool and refuses any host that is
  not localhost.
- The collection never leaves the device. Nothing here sends or receives collection data.
- Never commit a real Poke Genie export. Seeded battle data is synthetic only.
- Sprites are the only Pokemon artwork. Everything else is type-coloured tokens and text.
- Stage explicit paths when committing. Never `git add -A`.
- Work on a branch. Do not push to `main` until the whole plan is done and verified: pushing `main`
  deploys the live site and the live worker. Travis gates the push and the deploy.

---

## Branch setup

- [ ] **Step 0: Create the branch**

```bash
cd /d/Skunkworks/pickthree
git checkout -b meta-ranking
```

---

## File structure

```
workers/counter/
  scripts/seed-battles.mjs    NEW  synthetic shared battles -> a local wrangler dev worker
  src/battles.ts              MOD  BattleRow.source, the source discriminator
  src/teams.ts                NEW  faced + run rollups into teams and cores, pure over BattleRow[]
  src/meta.ts                 MOD  sources tally on the summary; teams field deprecated in a comment
  src/index.ts                MOD  source column + migration, /api/v1/teams route
  test/teams.test.ts          NEW
  test/battles.test.ts        MOD
  test/meta.test.ts           MOD
  test/routes.test.ts         MOD

packages/engine/
  package.json                MOD  "./meta" subpath export
  src/yourmeta/blend.ts       MOD  BlendOptions.share and BlendOptions.unrankedPrior
  src/score/simStrength.ts    NEW  matrix-only coverage/consistency/safety + expectedWinRate
  src/coldstart/pool.ts       NEW  synthetic specimens at PvPoke default IVs, full legal pool
  src/coldstart/teams.ts      NEW  generate + diversify cold-start teams from a pool
  src/meta/index.ts           NEW  the narrow subpath: blend + simStrength + MatrixView, nothing else
  src/index.ts                MOD  export the new modules
  test/yourmeta/blend.test.ts MOD
  test/score/simStrength.test.ts  NEW
  test/coldstart/pool.test.ts     NEW
  test/coldstart/teams.test.ts    NEW

apps/meta/
  package.json                MOD  @pickthree/engine dependency, seed script passthrough
  epochs.json                 NEW  hand-kept meta epochs, committed
  scripts/bake.ts             MOD  ranks, matrix slice, generated teams, epochs
  src/api.ts                  MOD  TeamsV1 shapes, fetchTeams, epoch-aware window
  src/epochs.ts               NEW  load + resolve the active epoch for a league
  src/slice.ts                NEW  lazy per-league matrix slice + ranks loader
  src/rank.ts                 MOD  the blend replaces the threshold flip
  src/teamRank.ts             NEW  team and core scoring, the board
  src/route.ts                MOD  /<league> is Teams, /<league>/pokemon is the species list
  src/App.tsx                 MOD  tab order, the new view names, epoch chip, commit mismatch note
  src/useMeta.ts              MOD  useTeams, useSlice, useEpochs
  src/screens/Teams.tsx       MOD  the front door: cores as the spine
  src/screens/Pokemon.tsx     MOV  git mv from Overview.tsx, then one blended list
  src/screens/About.tsx       MOD  the blend, the percentage, epochs, provenance
  src/screens/Species.tsx     MOD  blended weight and the "new" marker on the header
  scripts/screens.mjs         MOD  seeded volumes, the new routes
  test/*.test.ts(x)           MOD/NEW

apps/web/src/screens/LogBattle.tsx  MOD  one sentence nudging all three opponents
packages/data/seasons.json          -    unchanged, the pattern epochs.json mirrors
.gitignore                          MOD  apps/meta/public/{ranks,matrix}, baseline/*-teams.json
CLAUDE.md                           MOD  the rule this replaces
docs/superpowers/specs/2026-09-18-meta-site-design.md  MOD  pointer replacing "The two sources"
```

---

## Task 1: Synthetic battle seeding

The spec is explicit that this comes first: the model cannot be judged from a description, and the
live store has almost nothing in it. Everything after this task is looked at against seeded data at
several volumes.

**Files:**
- Create: `workers/counter/scripts/seed-battles.mjs`
- Modify: `workers/counter/package.json` (a `seed` script)
- Read for context: `workers/counter/src/battles.ts` (`SharedBattle`, `parseBatch`, `MAX_BATCH`),
  `workers/counter/wrangler.toml` (`ALLOWED_ORIGINS` already lists `http://localhost:5173`)

**Interfaces:**
- Consumes: nothing from earlier tasks. It speaks the wire format `parseBatch` validates.
- Produces, for every later task: a local worker with realistic data in it. No importable symbols.

**Why a `.mjs` script and not a test:** it posts over HTTP to a `wrangler dev` process. It is a
development tool, run by hand, and it is never part of `npm test`.

- [ ] **Step 1: Write the script**

`workers/counter/scripts/seed-battles.mjs`:

```js
/* eslint-disable no-console */
/**
 * Fills a LOCAL counter worker with synthetic shared battles so the meta site can be judged at a
 * realistic volume before it is live. Synthetic only, the same rule as the CSV fixtures: this
 * never reads a real export and never points at production.
 *
 *   npx wrangler dev --port 8787            # in workers/counter, in another terminal
 *   node workers/counter/scripts/seed-battles.mjs --battles 500 --devices 5
 *
 * Flags: --url (default http://127.0.0.1:8787), --league great, --battles 500, --devices 5,
 *        --days 30, --seed 1, --partial 35,40,25 (the share of 1, 2 and 3 opponents seen),
 *        --tanked 3 (percent), --clear (delete each device's rows first).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '..', '..', '..', 'apps', 'web', 'public', 'data');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const url = new URL(arg('url', 'http://127.0.0.1:8787'));
// The one hard guard. Production holds real players' battles; a seeding run must never reach it.
if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
  console.error(`Refusing to seed ${url.hostname}. This tool only ever talks to localhost.`);
  process.exit(1);
}

const league = arg('league', 'great');
const wanted = Number(arg('battles', '500'));
const deviceCount = Number(arg('devices', '5'));
const days = Number(arg('days', '30'));
const tankedPct = Number(arg('tanked', '3'));
const partial = String(arg('partial', '35,40,25')).split(',').map(Number);

/** mulberry32: a seeded PRNG, so the same flags give the same data every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(Number(arg('seed', '1')));

function pick(items, weights) {
  let total = 0;
  for (const w of weights) {
    total += w;
  }
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

const read = (...p) => JSON.parse(fs.readFileSync(path.join(DATA, ...p), 'utf8'));
let meta;
let overall;
try {
  meta = read('meta', `${league}.json`);
  overall = read('rankings', league, 'overall.json');
} catch {
  console.error(`No game data at ${DATA}. Run "npm run data:build" at the repo root first.`);
  process.exit(1);
}

// Who gets faced: PvPoke's meta group, weighted the way pick3 weights it, 1 / sqrt(rank).
const rankOf = new Map(overall.map((e, i) => [e.speciesId, i + 1]));
const faceable = meta.map((m) => m.speciesId);
const faceWeights = faceable.map((id) => 1 / Math.sqrt(rankOf.get(id) ?? 64));

// Who gets run: the top 60 of the overall ranking, so reporters' own teams look like real teams.
const runnable = overall.slice(0, 60).map((e) => e.speciesId);
const runWeights = runnable.map((_, i) => 1 / Math.sqrt(i + 1));

/**
 * A latent per-species strength so results are not coin flips: a seeded board that ranks by win
 * rate must be able to separate a good team from a bad one, or there is nothing to look at.
 */
const strength = new Map(overall.map((e, i) => [e.speciesId, 0.5 + 0.4 / Math.sqrt(i + 1)]));

const BANDS = ['below', 'ace', 'veteran', 'expert', 'legend'];
const BAND_WEIGHTS = [20, 30, 25, 15, 10];

function uuid() {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += hex[Math.floor(rand() * 16)];
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

const devices = [];
for (let i = 0; i < deviceCount; i++) {
  devices.push({ id: uuid(), band: pick(BANDS, BAND_WEIGHTS) });
}

function three(items, weights) {
  const out = [];
  while (out.length < 3) {
    const x = pick(items, weights);
    if (!out.includes(x)) {
      out.push(x);
    }
  }
  return out;
}

function battleAt(i) {
  const spanMs = days * 86400000;
  // Newer battles are more common, the way a real log fills up.
  const back = Math.pow(rand(), 1.6) * spanMs;
  return new Date(Date.now() - back).toISOString();
}

const batches = new Map();
for (let i = 0; i < wanted; i++) {
  const device = devices[Math.floor(rand() * devices.length)];
  const team = three(runnable, runWeights);
  const seenCount = pick([1, 2, 3], partial);
  const opponents = three(faceable, faceWeights).slice(0, seenCount);
  const tanked = rand() * 100 < tankedPct;
  const mine = team.reduce((a, id) => a + (strength.get(id) ?? 0.5), 0) / 3;
  const theirs = opponents.reduce((a, id) => a + (strength.get(id) ?? 0.5), 0) / opponents.length;
  const pWin = Math.max(0.1, Math.min(0.9, 0.5 + (mine - theirs) * 1.2));
  const battle = {
    id: `seed-${i}`,
    league,
    season: 28,
    at: battleAt(i),
    team,
    moves: null,
    opponents,
    result: tanked ? null : rand() < pWin ? 'win' : 'loss',
    tanked,
    band: device.band,
  };
  const list = batches.get(device.id) ?? [];
  list.push(battle);
  batches.set(device.id, list);
}

async function post(body) {
  const res = await fetch(new URL('/battles', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res.json();
}

let stored = 0;
for (const [device, all] of batches) {
  if (flag('clear')) {
    await fetch(new URL('/battles', url), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ device }),
    });
  }
  for (let i = 0; i < all.length; i += 200) {
    const r = await post({ device, client: 'seed 0000000', battles: all.slice(i, i + 200) });
    stored += r.stored;
  }
}
console.log(`seeded ${stored} battles for ${league} across ${devices.length} devices at ${url}`);
```

- [ ] **Step 2: Add the npm script**

In `workers/counter/package.json`, inside `"scripts"`:

```json
    "seed": "node scripts/seed-battles.mjs"
```

- [ ] **Step 3: Prove the guard refuses a non-local host**

Run:

```bash
node workers/counter/scripts/seed-battles.mjs --url https://pickthree-counter.travis-c82.workers.dev
```

Expected: `Refusing to seed pickthree-counter.travis-c82.workers.dev. This tool only ever talks to localhost.`
and exit code 1. Nothing is posted.

- [ ] **Step 4: Seed a local worker and read it back**

```bash
cd workers/counter && npx wrangler dev --port 8787 &
cd /d/Skunkworks/pickthree
node workers/counter/scripts/seed-battles.mjs --battles 500 --devices 5 --clear
curl -s 'http://127.0.0.1:8787/meta?league=great&days=90' | head -c 400
```

Expected: `seeded 500 battles ...`, and the `/meta` body reports roughly 485 counted battles
(3 percent tanked), 5 devices, and a species list led by the low-rank meta entries.

- [ ] **Step 5: Commit**

```bash
git add workers/counter/scripts/seed-battles.mjs workers/counter/package.json
git commit -m "meta: a local-only synthetic battle seeder"
```

---

## Task 2: The source discriminator

One field on the stored record saying where a battle came from, carried through the aggregation and
into the API. Nothing reads it yet. It is nearly free now and a Durable Object migration later.

The worker stamps it; the client never sends it. An untrusted client that could claim `tournament`
would be able to forge the very population phase 2 exists to keep separate.

**Files:**
- Modify: `workers/counter/src/battles.ts` (`BattleRow`), `workers/counter/src/index.ts`
  (the column, the migration, the two row readers), `workers/counter/src/meta.ts` (`MetaSummaryV1`)
- Test: `workers/counter/test/meta.test.ts`, `workers/counter/test/routes.test.ts`

**Interfaces:**
- Consumes: `BattleRow` from Task 0 state (unchanged upstream).
- Produces, for Tasks 7 and 10:

```ts
// battles.ts
/** Where a record came from. Ladder play is everything the app sends today. */
export type BattleSource = 'ladder';
export const DEFAULT_SOURCE: BattleSource = 'ladder';

export interface BattleRow {
  // ... existing fields unchanged ...
  /** Stamped by the worker on ingest, never accepted from the client. */
  source: BattleSource;
}

// meta.ts
export interface MetaSummaryV1 {
  // ... existing fields unchanged ...
  /** Counted battles by source. One key today; the seam for tournament results. */
  sources: Record<string, number>;
}
```

- [ ] **Step 1: Write the failing test**

Add to `workers/counter/test/meta.test.ts`:

```ts
describe('source discriminator', () => {
  it('tallies counted battles by source and leaves tanked ones out', () => {
    const rows: BattleRow[] = [
      row({ opponents: ['azumarill'], result: 'win' }),
      row({ opponents: ['medicham'], result: 'loss' }),
      row({ opponents: ['registeel'], tanked: true }),
    ];
    const out = summarize({
      league: 'great',
      since: '2026-09-01T00:00:00.000Z',
      until: '2026-09-30T00:00:00.000Z',
      band: 'all',
      rows,
      previousRows: null,
      now: new Date('2026-09-30T00:00:00.000Z'),
    });
    expect(out.sources).toEqual({ ladder: 2 });
  });
});
```

The file's existing `row` helper builds a `BattleRow`; extend it so it defaults `source` to
`'ladder'`, which is what makes the test compile at all.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project counter workers/counter/test/meta.test.ts`
Expected: FAIL. TypeScript rejects `source` on `BattleRow`, or `out.sources` is undefined.

- [ ] **Step 3: Add the field, the tally and the column**

In `workers/counter/src/battles.ts`, above `BattleRow`:

```ts
/** Where a record came from. Ladder play is everything the app sends today; tournament results
 * are phase 2 and get their own spec. Stamped by the worker, never accepted from the client: a
 * client that could name its own source could forge the population phase 2 exists to separate. */
export type BattleSource = 'ladder';
export const DEFAULT_SOURCE: BattleSource = 'ladder';
```

and inside `BattleRow`, after `band`:

```ts
  source: BattleSource;
```

In `workers/counter/src/meta.ts`, add `sources` to `MetaSummaryV1` after `bands`:

```ts
  /** Counted battles by source. One key today; nothing reads it yet. */
  sources: Record<string, number>;
```

and inside `summarize`, next to the `bands` loop:

```ts
  const sources: Record<string, number> = {};
  for (const r of counted) {
    sources[r.source] = (sources[r.source] ?? 0) + 1;
  }
```

returning `sources` in the object literal.

In `workers/counter/src/index.ts`, inside the `MetaStore` constructor, after the `moves` migration:

```ts
    if (!cols.some((c) => c['name'] === 'source')) {
      ctx.storage.sql.exec("ALTER TABLE battles ADD COLUMN source TEXT NOT NULL DEFAULT 'ladder'");
    }
```

Note: `cols` is read once above, so re-read it or hoist the `PRAGMA` call so both checks see the
same snapshot. Read it once and reuse it; the two `ALTER`s do not affect each other's predicate.

In `ingest`, add `source` to the column list and bind `DEFAULT_SOURCE`. In both `summary`'s and
`read`'s `SELECT` lists add `source`, and in both row mappers add:

```ts
      source: (r['source'] as BattleSource | null) ?? DEFAULT_SOURCE,
```

The `?? DEFAULT_SOURCE` is what keeps rows written before the migration readable.

- [ ] **Step 4: Run the whole worker suite**

Run: `npx vitest run --project counter`
Expected: PASS. Fix every call site the new required field breaks: `aggregate` ignores it, the
route tests build rows.

- [ ] **Step 5: Commit**

```bash
git add workers/counter/src/battles.ts workers/counter/src/meta.ts workers/counter/src/index.ts workers/counter/test/meta.test.ts workers/counter/test/routes.test.ts
git commit -m "worker: stamp a source on every stored battle"
```

---

## Task 3: The blend gains its two knobs

`packages/engine/src/yourmeta/blend.ts` is already shipped and tested on device. It gains exactly
two optional options, both defaulting to today's behaviour, so pick3 is unchanged.

The spec names only `unrankedPrior`. It needs `share` too, and this is the first of the plan's
stated deviations: the species blend is
`a = min(battles / (battles + 300), devices / (devices + 5))`, and `blendShare` cannot express the
device term because it only ever sees a battle count. Rather than reimplement the formula in
`apps/meta` (which would be the second copy in the repo, the exact thing the spec's subpath export
exists to prevent), the caller computes `a` and hands it over.

**Files:**
- Modify: `packages/engine/src/yourmeta/blend.ts`
- Test: `packages/engine/test/yourmeta/blend.test.ts`

**Interfaces:**
- Consumes: `facingWeight` from `../gamedata/metaRank.js`.
- Produces, for Tasks 4 and 10:

```ts
export interface BlendOptions {
  minBattles: number;
  halfLife: number;
  /** Replaces the battle-count curve when the caller works the share out itself, for example
   *  because it also caps on contributing devices. Clamped to 0..1. */
  share?: number;
  /** Prior weight for a species PvPoke does not rank. Defaults to facingWeight(null), the
   *  rank-64 floor pick3 wants on device. Pass 0 where an unlisted species must ride entirely
   *  on how often it was measured. */
  unrankedPrior?: number;
}
export function blendShare(battles: number, opts?: BlendOptions): number;
export function blendWeights(input: BlendInput, opts?: BlendOptions): Map<string, number>;
```

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/test/yourmeta/blend.test.ts`:

```ts
describe('blendShare with an explicit share', () => {
  it('uses the share it is handed and ignores the curve', () => {
    expect(blendShare(0, { ...DEFAULT_BLEND_OPTIONS, share: 0.25 })).toBe(0.25);
    expect(blendShare(10_000, { ...DEFAULT_BLEND_OPTIONS, share: 0.25 })).toBe(0.25);
  });

  it('clamps a nonsense share rather than letting it out', () => {
    expect(blendShare(100, { ...DEFAULT_BLEND_OPTIONS, share: -1 })).toBe(0);
    expect(blendShare(100, { ...DEFAULT_BLEND_OPTIONS, share: 2 })).toBe(1);
  });

  it('is unchanged when no share is given', () => {
    expect(blendShare(0)).toBe(0);
    expect(blendShare(14)).toBe(0);
    expect(blendShare(15)).toBeCloseTo(15 / 45, 10);
    expect(blendShare(30)).toBeCloseTo(0.5, 10);
  });
});

describe('the site half-say points', () => {
  const site = { minBattles: 0, halfLife: 300 };
  it('gives measured play half the say at 300 battles', () => {
    expect(blendShare(300, site)).toBeCloseTo(0.5, 10);
  });
  it('holds one grinder to a sixth of the say, however many battles', () => {
    // 900 battles is three quarters on its own; 1 device caps it at 1 / 6.
    const a = Math.min(blendShare(900, site), 1 / (1 + 5));
    expect(blendShare(900, site)).toBeCloseTo(0.75, 10);
    expect(a).toBeCloseTo(1 / 6, 10);
  });
});

describe('unrankedPrior', () => {
  const ranks = new Map<string, number | null>([
    ['azumarill', 1],
    ['nobody', null],
  ]);

  it('defaults to the rank-64 floor, so pick3 is unchanged', () => {
    const w = blendWeights({ species: ['azumarill', 'nobody'], ranks, sightings: new Map(), battles: 0 });
    // priors 1 and 1/8, normalised over 1.125.
    expect(w.get('azumarill')).toBeCloseTo(1 / 1.125, 10);
    expect(w.get('nobody')).toBeCloseTo(0.125 / 1.125, 10);
  });

  it('gives an unlisted species no prior at all when the site asks for zero', () => {
    const w = blendWeights(
      { species: ['azumarill', 'nobody'], ranks, sightings: new Map(), battles: 0 },
      { minBattles: 0, halfLife: 300, unrankedPrior: 0 },
    );
    expect(w.get('azumarill')).toBeCloseTo(1, 10);
    expect(w.get('nobody')).toBe(0);
  });

  it('lets an unlisted species ride entirely on how often it was measured', () => {
    const w = blendWeights(
      {
        species: ['azumarill', 'nobody'],
        ranks,
        sightings: new Map([['nobody', 60]]),
        battles: 300,
      },
      { minBattles: 0, halfLife: 300, unrankedPrior: 0 },
    );
    // a = 0.5. azumarill: 0.5 * 1 + 0.5 * 0. nobody: 0.5 * 0 + 0.5 * 1.
    expect(w.get('azumarill')).toBeCloseTo(0.5, 10);
    expect(w.get('nobody')).toBeCloseTo(0.5, 10);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project engine packages/engine/test/yourmeta/blend.test.ts`
Expected: FAIL. `share` and `unrankedPrior` are not properties of `BlendOptions`.

- [ ] **Step 3: Implement**

In `packages/engine/src/yourmeta/blend.ts`, replace `BlendOptions` and `blendShare`, and touch one
line of `blendWeights`:

```ts
export interface BlendOptions {
  /** Below this many counted battles the log has no say. */
  minBattles: number;
  /** Battles at which the log and PvPoke's prior have an equal say. */
  halfLife: number;
  /**
   * Replaces the battle-count curve when the caller works the share out itself. meta.pick3.gg
   * caps the battle curve on contributing devices as well, which a battle count alone cannot
   * express; rather than keep a second copy of this formula there, it hands the answer in.
   * Clamped to 0..1.
   */
  share?: number;
  /**
   * Prior weight for a species with no PvPoke rank. Defaults to facingWeight(null), the rank-64
   * floor, which is right on device where it stops an unranked opponent vanishing. Pass 0 where
   * an unlisted species must ride entirely on how often it was actually measured, or the floor
   * would seat a never-listed species above genuinely listed ones near rank 64.
   */
  unrankedPrior?: number;
}

export const DEFAULT_BLEND_OPTIONS: BlendOptions = { minBattles: 15, halfLife: 30 };

/** The log's share of the say: 0 below the threshold, a third at 15, half at 30, two thirds at 60.
 *  An explicit `share` wins over the curve entirely. */
export function blendShare(battles: number, opts: BlendOptions = DEFAULT_BLEND_OPTIONS): number {
  if (opts.share !== undefined) {
    return Math.max(0, Math.min(1, opts.share));
  }
  if (battles < opts.minBattles) {
    return 0;
  }
  return battles / (battles + opts.halfLife);
}
```

and inside `blendWeights`, replace the `priors` line:

```ts
  const priors = input.species.map((id) => {
    const rank = input.ranks.get(id) ?? null;
    if (rank === null && opts.unrankedPrior !== undefined) {
      return opts.unrankedPrior;
    }
    return facingWeight(rank);
  });
```

- [ ] **Step 4: Run the engine suite**

Run: `npx vitest run --project engine`
Expected: PASS, including every existing blend and yourmeta test. pick3 passes no new options, so
nothing on device changes.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/yourmeta/blend.ts packages/engine/test/yourmeta/blend.test.ts
git commit -m "engine: the blend takes an explicit share and an unranked prior"
```

---

## Task 4: simStrength, and the subpath the site imports it through

The number the whole board hangs off. Coverage, consistency and safety, the same three factors
behind `scoreTeam`'s `battle` field, computed from matrix lookups alone so they run in a browser
with no simulator. Cost and accessibility are dropped because there is no collection here.

Read the spec's "simStrength, and the honesty problem inside it" before writing a line, and read
`packages/engine/src/score/score.ts`'s `scoreTeam` so the three factors are recognisably the same
three. Where this deliberately differs from `scoreTeam`, the code says so:

1. **The switch slot has no energy advantage.** `simulateSlot` gives the switch four turns of
   starting energy; the matrix's three scenarios are 0-0, 1-1 and 2-2 at zero energy. So the switch
   is scored at 1-1 like the lead. Measured effect: under a point of level offset once the slot
   order is chosen to maximise the matrix score, but a different order inside the top band.
2. **The top of the meta is the ten heaviest opponents by the blended weights**, not the first ten
   matrix columns, when weights are given. Once measured play says what the top is, that is the top.
3. **Coverage can only ever be over the matrix's own columns.** `scoreTeam` appends outsiders and
   simulates them; nothing here can. So the context reports `weightCovered`, the share of the given
   weights the columns account for, and the screens print it rather than letting a projection
   quietly claim to cover a meta it never saw. This is a gap the spec does not name, and Task 12
   and Task 14 both have to say it out loud.

**Files:**
- Create: `packages/engine/src/score/simStrength.ts`, `packages/engine/src/meta/index.ts`
- Modify: `packages/engine/src/index.ts`, `packages/engine/package.json`
- Test: `packages/engine/test/score/simStrength.test.ts`

**Interfaces:**
- Consumes: `MatrixView` from `../search/matrixView.js`, `battleScore` from `./score.js`.
- Produces, for Tasks 6, 8, 10 and 12:

```ts
export const WIN = 500;
export const HARD_LOSS = 300;
export const TOP_META = 10;

export interface StrengthContext {
  view: MatrixView;
  /** Scenario indexes, resolved once. */
  s11: number;
  s00: number;
  s22: number;
  /** Weight per opponent column, aligned with view.opponents. All 1 when unweighted. */
  weights: number[];
  /** Column indexes of the TOP_META heaviest opponents. */
  top: number[];
  /** Share of the supplied weights the columns account for, 0..1. 1 when unweighted. */
  weightCovered: number;
}

export interface Strength {
  /** battleScore(coverage, consistency, safety), 0 to 100. */
  value: number;
  coverage: number;
  consistency: number;
  safety: number;
  /** Matrix rows in the order scored: lead, switch, closer. */
  order: [number, number, number];
}

export function strengthContext(
  view: MatrixView,
  weights?: ReadonlyMap<string, number>,
): StrengthContext;
export function strengthOf(ctx: StrengthContext, rows: readonly [number, number, number]): Strength;
/** The best of the six orderings. What every caller should use: a team is played in its best
 *  order, and a projection that assumed the worst one would be projecting the wrong team. */
export function bestStrength(ctx: StrengthContext, rows: readonly [number, number, number]): Strength;

/** Slope of the one calibration from battle score to an expected win rate, per point. */
export const PROJECTION_SLOPE = 0.006;
/**
 * A battle score read as an expected win rate. THE one place the projection is calibrated, so it
 * can be fitted against real results later without hunting through the code. It is a proxy, not a
 * measurement. Never print the result as a win rate.
 */
export function expectedWinRate(strength: number, slope?: number): number;
```

- [ ] **Step 1: Write the failing test**

`packages/engine/test/score/simStrength.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MatrixView } from '../../src/search/matrixView.js';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import {
  PROJECTION_SLOPE,
  bestStrength,
  expectedWinRate,
  strengthContext,
  strengthOf,
} from '../../src/score/simStrength.js';

/** Four candidates, four opponents, the three real scenarios, ratings supplied by hand. */
function fixture(rate: (c: number, o: number, s: number) => number): MatrixView {
  const candidates = ['a', 'b', 'c', 'd'];
  const opponents = ['w', 'x', 'y', 'z'];
  const scenarios = [
    { shields: [0, 0] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [1, 1] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [2, 2] as [number, number], energy: [0, 0] as [number, number] },
  ];
  const ratings: number[] = [];
  candidates.forEach((_, c) => {
    opponents.forEach((_, o) => {
      scenarios.forEach((_, s) => {
        ratings.push(rate(c, o, s));
      });
    });
  });
  const m: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios,
    candidates,
    opponents,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings,
  };
  return new MatrixView(m);
}

/** a beats w and x in every scenario, b beats y and z, c and d lose everything badly. */
const SPLIT = fixture((c, o) => {
  if (c === 0) {
    return o < 2 ? 700 : 400;
  }
  if (c === 1) {
    return o >= 2 ? 700 : 400;
  }
  return 200;
});

describe('strengthContext', () => {
  it('weighs every column the same when no weights are given', () => {
    const ctx = strengthContext(SPLIT);
    expect(ctx.weights).toEqual([1, 1, 1, 1]);
    expect(ctx.weightCovered).toBe(1);
    expect(ctx.top).toEqual([0, 1, 2, 3]);
  });

  it('reports how much of the supplied weight the columns actually cover', () => {
    // 'outsider' is faced but has no column: a projection cannot speak for it.
    const ctx = strengthContext(
      SPLIT,
      new Map([
        ['w', 0.4],
        ['x', 0.1],
        ['outsider', 0.5],
      ]),
    );
    expect(ctx.weightCovered).toBeCloseTo(0.5, 10);
    expect(ctx.weights).toEqual([0.4, 0.1, 0, 0]);
    expect(ctx.top.slice(0, 2)).toEqual([0, 1]);
  });
});

describe('strengthOf', () => {
  it('covers every opponent when two members split the meta between them', () => {
    const s = strengthOf(strengthContext(SPLIT), [0, 1, 2]);
    expect(s.coverage).toBe(100);
    expect(s.consistency).toBe(100);
    expect(s.safety).toBe(100);
    expect(s.value).toBe(100);
    expect(s.order).toEqual([0, 1, 2]);
  });

  it('docks safety for a switch with hard losses and for an uncovered top opponent', () => {
    // c leads, d switches (four ratings of 200, four hard losses), a closes.
    const s = strengthOf(strengthContext(SPLIT), [2, 3, 0]);
    expect(s.coverage).toBe(50);
    expect(s.safety).toBe(0);
  });

  it('weighs coverage by how often each opponent is actually faced', () => {
    const ctx = strengthContext(
      SPLIT,
      new Map([
        ['w', 0.7],
        ['x', 0.1],
        ['y', 0.1],
        ['z', 0.1],
      ]),
    );
    // a alone covers w and x: 0.8 of the weight, against 0.5 of the raw count.
    expect(strengthOf(ctx, [0, 2, 3]).coverage).toBeCloseTo(80, 6);
  });
});

describe('bestStrength', () => {
  it('scores the team in its best order, not the order it was handed', () => {
    const ctx = strengthContext(SPLIT);
    const handed = strengthOf(ctx, [2, 3, 0]);
    const best = bestStrength(ctx, [2, 3, 0]);
    expect(best.value).toBeGreaterThan(handed.value);
    // The best order puts a competent member in the switch slot.
    expect(best.order[1]).toBe(0);
  });

  it('is order independent', () => {
    const ctx = strengthContext(SPLIT);
    expect(bestStrength(ctx, [0, 1, 2]).value).toBe(bestStrength(ctx, [2, 1, 0]).value);
  });
});

describe('expectedWinRate', () => {
  it('reads an even battle score as an even match', () => {
    expect(expectedWinRate(50)).toBeCloseTo(0.5, 10);
  });

  it('moves one slope per point either side of even', () => {
    expect(expectedWinRate(60)).toBeCloseTo(0.5 + 10 * PROJECTION_SLOPE, 10);
    expect(expectedWinRate(40)).toBeCloseTo(0.5 - 10 * PROJECTION_SLOPE, 10);
  });

  it('never leaves 0 to 1, however extreme the score or the slope', () => {
    expect(expectedWinRate(100, 0.05)).toBe(1);
    expect(expectedWinRate(0, 0.05)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project engine packages/engine/test/score/simStrength.test.ts`
Expected: FAIL, "Failed to resolve import ... simStrength.js".

- [ ] **Step 3: Write the implementation**

`packages/engine/src/score/simStrength.ts`:

```ts
/**
 * A team's battle strength read out of the matchup matrix alone: coverage, consistency and
 * safety, the same three factors behind scoreTeam's `battle` field, with cost and accessibility
 * dropped because there is no collection here. Every read is view.rating(row, opponent,
 * scenario), so this runs in a browser with no simulator. That is what ADR 002 built the matrix
 * for.
 *
 * It is a proxy for a win rate, not a calibrated one. Coverage is the weighted share of the meta
 * that at least one member beats, which is not the same as winning a 3v3 match. expectedWinRate
 * below is the single place that proxy is turned into a number on the 0 to 1 scale, so it can be
 * fitted against real results later. A projection is never printed as a win rate.
 *
 * Three deliberate differences from scoreTeam, all forced by the matrix's three scenarios:
 *  - The switch is scored at 1-1 like the lead. simulateSlot gives it four turns of starting
 *    energy; the matrix has no such cell, so the projection understates a switch that lives off
 *    that advantage.
 *  - "The top of the meta" is the ten heaviest opponents by the supplied weights, not the first
 *    ten matrix columns. Once measured play says what the top is, that is the top.
 *  - Coverage can only speak for opponents that have a column. weightCovered says how much of
 *    the supplied weight that is, and the screens print it rather than letting a projection
 *    quietly claim a meta it never saw.
 */
import type { MatrixView } from '../search/matrixView.js';
import { battleScore } from './score.js';

/** A matrix rating above this is a win, the same cut the rest of the engine uses. */
export const WIN = 500;
/** Below this the switch is not merely losing, it is being removed from the game. */
export const HARD_LOSS = 300;
/** How many of the heaviest opponents count as "the top of the meta". */
export const TOP_META = 10;

export interface StrengthContext {
  view: MatrixView;
  s11: number;
  s00: number;
  s22: number;
  weights: number[];
  top: number[];
  weightCovered: number;
}

export interface Strength {
  value: number;
  coverage: number;
  consistency: number;
  safety: number;
  order: [number, number, number];
}

/** Resolve the scenarios and the weights once, then score thousands of trios against it. */
export function strengthContext(
  view: MatrixView,
  weights?: ReadonlyMap<string, number>,
): StrengthContext {
  const n = view.opponents.length;
  const w = new Array<number>(n).fill(1);
  let covered = 1;
  if (weights) {
    let total = 0;
    for (const value of weights.values()) {
      total += value;
    }
    let inColumns = 0;
    view.opponents.forEach((id, i) => {
      const value = weights.get(id) ?? 0;
      w[i] = value;
      inColumns += value;
    });
    covered = total === 0 ? 0 : inColumns / total;
  }
  const top = w
    .map((value, i) => ({ value, i }))
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .slice(0, Math.min(TOP_META, n))
    .map((x) => x.i);
  return {
    view,
    s11: view.scenarioIndex([1, 1]),
    s00: view.scenarioIndex([0, 0]),
    s22: view.scenarioIndex([2, 2]),
    weights: w,
    top,
    weightCovered: covered,
  };
}

export function strengthOf(
  ctx: StrengthContext,
  rows: readonly [number, number, number],
): Strength {
  const { view, s11, s00, s22 } = ctx;
  const n = view.opponents.length;
  const scenarios: [number, number, number] = [s11, s11, s00];
  const covered = new Array<boolean>(n).fill(false);
  let wins = 0;
  let held = 0;
  for (let slot = 0; slot < 3; slot++) {
    const row = rows[slot] as number;
    const scenario = scenarios[slot] as number;
    for (let o = 0; o < n; o++) {
      if (view.rating(row, o, scenario) > WIN) {
        covered[o] = true;
        wins += 1;
        if (view.rating(row, o, s00) > WIN && view.rating(row, o, s22) > WIN) {
          held += 1;
        }
      }
    }
  }

  let got = 0;
  let total = 0;
  for (let o = 0; o < n; o++) {
    const weight = ctx.weights[o] as number;
    total += weight;
    if (covered[o]) {
      got += weight;
    }
  }
  const coverage = total === 0 ? 0 : (got / total) * 100;
  const consistency = wins === 0 ? 0 : (held / wins) * 100;

  let hardLosses = 0;
  for (let o = 0; o < n; o++) {
    if (view.rating(rows[1], o, s11) < HARD_LOSS) {
      hardLosses += 1;
    }
  }
  let topUncovered = 0;
  for (const o of ctx.top) {
    if (!covered[o]) {
      topUncovered += 1;
    }
  }
  const safety = Math.max(0, 100 - hardLosses * 20 - topUncovered * 10);

  return {
    value: round1(battleScore(coverage, consistency, safety)),
    coverage: round1(coverage),
    consistency: round1(consistency),
    safety: round1(safety),
    order: [rows[0], rows[1], rows[2]],
  };
}

const ORDERINGS: readonly [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

export function bestStrength(
  ctx: StrengthContext,
  rows: readonly [number, number, number],
): Strength {
  let best: Strength | null = null;
  for (const order of ORDERINGS) {
    const s = strengthOf(ctx, [
      rows[order[0]] as number,
      rows[order[1]] as number,
      rows[order[2]] as number,
    ]);
    if (!best || s.value > best.value) {
      best = s;
    }
  }
  return best as Strength;
}

export const PROJECTION_SLOPE = 0.006;

export function expectedWinRate(strength: number, slope: number = PROJECTION_SLOPE): number {
  return Math.max(0, Math.min(1, 0.5 + (strength - 50) * slope));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --project engine packages/engine/test/score/simStrength.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the narrow subpath the site imports through**

`packages/engine/src/meta/index.ts`:

```ts
/**
 * The seam meta.pick3.gg imports. One formula in the repo, two callers: the site must run the
 * same blend pick3 runs on device, and the same simStrength the bake scores generated teams with.
 * Deliberately narrow, so pulling this in does not pull in the CSV parser, the cost tables, the
 * simulator interface or anything else the site has no business shipping.
 */
export {
  DEFAULT_BLEND_OPTIONS,
  blendShare,
  blendWeights,
  type BlendInput,
  type BlendOptions,
} from '../yourmeta/blend.js';
export { facingWeight } from '../gamedata/metaRank.js';
export { MatrixView } from '../search/matrixView.js';
export { matrixIndex, type MatchupMatrix, type MatrixScenario } from '../gamedata/types.js';
export {
  PROJECTION_SLOPE,
  bestStrength,
  expectedWinRate,
  strengthContext,
  strengthOf,
  type Strength,
  type StrengthContext,
} from '../score/simStrength.js';
```

In `packages/engine/package.json`, extend `exports`:

```json
  "exports": {
    ".": "./src/index.ts",
    "./meta": "./src/meta/index.ts"
  },
```

In `packages/engine/src/index.ts`, add after the `./score/score.js` line:

```ts
export * from './score/simStrength.js';
```

- [ ] **Step 6: Prove the subpath resolves and stays narrow**

Append to `packages/engine/test/score/simStrength.test.ts`:

```ts
describe('the meta subpath', () => {
  it('exports exactly the seam, and nothing else', async () => {
    const mod = (await import('@pickthree/engine/meta')) as Record<string, unknown>;
    expect(typeof mod['blendWeights']).toBe('function');
    expect(typeof mod['bestStrength']).toBe('function');
    expect(typeof mod['expectedWinRate']).toBe('function');
    // A short list on purpose: this is the contract, and growing it should be deliberate.
    expect(Object.keys(mod).sort()).toEqual([
      'DEFAULT_BLEND_OPTIONS',
      'MatrixView',
      'PROJECTION_SLOPE',
      'bestStrength',
      'blendShare',
      'blendWeights',
      'expectedWinRate',
      'facingWeight',
      'matrixIndex',
      'strengthContext',
      'strengthOf',
    ]);
  });
});
```

Run: `npx vitest run --project engine && npm run typecheck`
Expected: PASS and clean. If the subpath does not resolve under vitest, the workspace symlink plus
the `exports` map should be enough; if not, add an alias in the engine's `vitest.config.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/score/simStrength.ts packages/engine/src/meta/index.ts packages/engine/src/index.ts packages/engine/package.json packages/engine/test/score/simStrength.test.ts
git commit -m "engine: matrix-only team strength and the meta subpath"
```

---

## Task 5: The cold-start pool

Every species the league legally allows, at PvPoke's own default IV spread, as `Build[]` the rest
of the engine already knows how to consume. This is the feasibility answer turned into code; read
"Feasibility, settled before planning" above for the evidence and the two gotchas.

The default spread comes out of the raw game master, which the data build already copies to
`apps/web/public/data/gamemaster.json`. The engine does not learn that file's format: the caller
passes a lookup function, so the engine stays pure and the test can hand it a literal.

**Files:**
- Create: `packages/engine/src/coldstart/pool.ts`
- Modify: `packages/engine/src/index.ts`, `packages/engine/test/fixtures.ts`
- Test: `packages/engine/test/coldstart/pool.test.ts`

**Interfaces:**
- Consumes: `Specimen`, `specimenId`; `IVs`, `RawScan`; `cpFor`, `statsFor`; `Build`,
  `BuildOptions`, `buildsFor`; `GameDataIndex`.
- Produces, for Tasks 6 and 8:

```ts
/** PvPoke's default level and IVs for one species at one CP cap. */
export interface DefaultSpread {
  level: number;
  ivs: IVs;
}
export type SpreadLookup = (speciesId: string) => DefaultSpread | null;

/** PvPoke's own defaultIVs table, out of a raw game master, for one CP cap. */
export function spreadsFromGameMaster(gameMaster: unknown, cp: number): SpreadLookup;

/** One synthetic Specimen per species at its default spread. Species with no spread are left
 *  out rather than guessed at. */
export function coldStartSpecimens(
  speciesIds: readonly string[],
  spreads: SpreadLookup,
  index: GameDataIndex,
): Specimen[];

/** The builds those specimens produce, filtered to each specimen's own species. */
export function coldStartBuilds(
  specimens: readonly Specimen[],
  index: GameDataIndex,
  opts: BuildOptions,
): Build[];
```

- [ ] **Step 1: Add the game master to the test fixtures**

In `packages/engine/test/fixtures.ts`, after `loadStaticData`:

```ts
/** PvPoke's raw game master, as the data build copies it next to the static data. */
export function readGameMaster(): unknown {
  return JSON.parse(fs.readFileSync(path.join(STATIC_DATA_DIR, 'gamemaster.json'), 'utf8'));
}
```

- [ ] **Step 2: Write the failing test**

`packages/engine/test/coldstart/pool.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  coldStartBuilds,
  coldStartSpecimens,
  spreadsFromGameMaster,
} from '../../src/coldstart/pool.js';
import { buildOptionsFor } from '../../src/builds/eligibility.js';
import { haveStaticData, loadIndex, loadStaticData, readGameMaster } from '../fixtures.js';

describe('spreadsFromGameMaster', () => {
  it('reads PvPoke defaultIVs for the cap it was asked for', () => {
    const gm = {
      pokemon: [
        { speciesId: 'azumarill', defaultIVs: { cp1500: [43, 4, 15, 13], cp2500: [50, 15, 15, 15] } },
      ],
    };
    expect(spreadsFromGameMaster(gm, 1500)('azumarill')).toEqual({
      level: 43,
      ivs: { atk: 4, def: 15, sta: 13 },
    });
    expect(spreadsFromGameMaster(gm, 2500)('azumarill')).toEqual({
      level: 50,
      ivs: { atk: 15, def: 15, sta: 15 },
    });
    expect(spreadsFromGameMaster(gm, 1500)('nobody')).toBeNull();
  });

  it('falls back to 15/15/15 at the level cap when the battle is uncapped', () => {
    // PvPoke's Pokemon.initialize does exactly this for maxCP 10000; there is no cp10000 table.
    const gm = { pokemon: [{ speciesId: 'dialga', defaultIVs: { cp1500: [20, 0, 1, 2] } }] };
    expect(spreadsFromGameMaster(gm, 10_000)('dialga')).toEqual({
      level: 50,
      ivs: { atk: 15, def: 15, sta: 15 },
    });
  });

  it('survives a game master that is not the shape we expect', () => {
    expect(spreadsFromGameMaster({}, 1500)('azumarill')).toBeNull();
    expect(spreadsFromGameMaster(null, 1500)('azumarill')).toBeNull();
    expect(spreadsFromGameMaster({ pokemon: [{}] }, 1500)('azumarill')).toBeNull();
  });
});

const run = haveStaticData() ? describe : describe.skip;

run('the cold start pool over the real data', () => {
  function build() {
    const data = loadStaticData();
    const index = loadIndex();
    const spreads = spreadsFromGameMaster(readGameMaster(), data.league.cp);
    const specimens = coldStartSpecimens(data.matrix.candidates, spreads, index);
    const builds = coldStartBuilds(specimens, index, buildOptionsFor(data.league));
    return { data, index, spreads, specimens, builds };
  }

  it('produces one build per legal species, at PvPoke default IVs', () => {
    const { specimens, builds, spreads } = build();
    expect(specimens.length).toBeGreaterThan(900);
    expect(builds.length).toBeGreaterThan(800);

    // One build per species: never a pre-evolution standing in for its evolution.
    const ids = builds.map((b) => b.speciesId);
    expect(new Set(ids).size).toBe(ids.length);

    // Every build carries its own species' spread, not an ancestor's.
    for (const b of builds) {
      expect(b.ivs).toEqual(spreads(b.speciesId)?.ivs);
    }
  });

  it('puts every member of the meta group in the pool', () => {
    const { data, builds } = build();
    const have = new Set(builds.map((b) => b.speciesId));
    expect(data.meta.map((m) => m.speciesId).filter((id) => !have.has(id))).toEqual([]);
  });

  it('builds the meta group at exactly the level PvPoke would', () => {
    const { data, builds, spreads } = build();
    const byId = new Map(builds.map((b) => [b.speciesId, b]));
    for (const m of data.meta) {
      const b = byId.get(m.speciesId);
      expect(b?.level).toBe(spreads(m.speciesId)?.level);
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run --project engine packages/engine/test/coldstart/pool.test.ts`
Expected: FAIL, "Failed to resolve import ... coldstart/pool.js".

- [ ] **Step 4: Write the implementation**

`packages/engine/src/coldstart/pool.ts`:

```ts
/**
 * The full legal pool with no collection behind it: one synthetic Specimen per species, at
 * PvPoke's own default IV spread for the cap, so the rest of the engine can draft teams the way
 * it drafts them from a real bag. meta.pick3.gg's cold start is built on this, and nothing here
 * simulates.
 *
 * The spread is PvPoke's, not ours. Pokemon.initialize reads defaultIVs["cp<cap>"] out of the
 * game master, and for an uncapped battle (Master League, cp 10000, which has no table) it uses
 * 15/15/15 at the level cap. We match both branches so a generated team is scored against exactly
 * the Pokemon the shipped matrix was built from.
 */
import { buildsFor, type Build, type BuildOptions } from '../builds/eligibility.js';
import { specimenId, type Specimen } from '../collection/specimen.js';
import type { IVs, RawScan } from '../csv/parse.js';
import type { GameDataIndex } from '../gamedata/index.js';
import { cpFor, statsFor } from '../math/cp.js';

export interface DefaultSpread {
  level: number;
  ivs: IVs;
}

export type SpreadLookup = (speciesId: string) => DefaultSpread | null;

/** At or above this cap PvPoke stops capping and runs 15/15/15 at the level cap. */
const UNCAPPED = 10_000;
const UNCAPPED_LEVEL = 50;
/** A fixed timestamp: a generated pool must not change because the clock moved. */
const SCANNED_AT = '2000-01-01 00:00:00';

interface GameMasterShape {
  pokemon?: { speciesId?: unknown; defaultIVs?: Record<string, unknown> }[];
}

export function spreadsFromGameMaster(gameMaster: unknown, cp: number): SpreadLookup {
  const table = new Map<string, DefaultSpread>();
  const gm = (gameMaster ?? {}) as GameMasterShape;
  const list = Array.isArray(gm.pokemon) ? gm.pokemon : [];
  for (const entry of list) {
    const id = entry.speciesId;
    if (typeof id !== 'string') {
      continue;
    }
    if (cp >= UNCAPPED) {
      table.set(id, { level: UNCAPPED_LEVEL, ivs: { atk: 15, def: 15, sta: 15 } });
      continue;
    }
    const combo = entry.defaultIVs?.[`cp${cp}`];
    if (!Array.isArray(combo) || combo.length < 4 || !combo.every((n) => typeof n === 'number')) {
      continue;
    }
    const [level, atk, def, sta] = combo as [number, number, number, number];
    table.set(id, { level, ivs: { atk, def, sta } });
  }
  return (speciesId: string) => table.get(speciesId) ?? null;
}

/** A synthetic scan row. Nothing reads it except code that expects a Specimen to have one. */
function rawFor(
  name: string,
  dex: number,
  shadow: boolean,
  ivs: IVs,
  level: number,
  cp: number,
  hp: number,
): RawScan {
  return {
    line: 0,
    name,
    form: '',
    dex,
    cp,
    hp,
    ivs: { ...ivs },
    levelMin: level,
    levelMax: level,
    shadowCode: shadow ? 1 : 0,
    lucky: false,
    fastMove: null,
    chargedMoves: [],
    scanDate: SCANNED_AT,
    originalScanDate: null,
    pokeGenie: {
      rankPctG: null,
      rankNumG: null,
      dustCostG: null,
      candyCostG: null,
      nameG: null,
      formG: null,
      shaPurG: null,
    },
  };
}

export function coldStartSpecimens(
  speciesIds: readonly string[],
  spreads: SpreadLookup,
  index: GameDataIndex,
): Specimen[] {
  const out: Specimen[] = [];
  for (const speciesId of speciesIds) {
    const sp = index.species(speciesId);
    const spread = spreads(speciesId);
    if (!sp || !spread) {
      continue;
    }
    const { level, ivs } = spread;
    const cp = cpFor(sp.baseStats, ivs, level);
    const hp = statsFor(sp.baseStats, ivs, level).hp;
    out.push({
      id: specimenId(sp.speciesId, sp.shadow, ivs, level, cp, hp),
      speciesId: sp.speciesId,
      familyId: sp.familyId,
      ivs: { ...ivs },
      // level.max pins buildsFor's floor to PvPoke's own level rather than letting it recompute
      // one. They agree for 1737 of 1742 entries at cp1500; the handful that differ are entries
      // PvPoke parks at level 1, and none of them clear a league's minCp anyway.
      level: { min: level, max: level },
      cp,
      hp,
      shadow: sp.shadow,
      purified: false,
      lucky: false,
      currentMoves: { fast: null, charged: [] },
      scannedAt: SCANNED_AT,
      raw: rawFor(sp.speciesName, sp.dex, sp.shadow, ivs, level, cp, hp),
    });
  }
  return out;
}

export function coldStartBuilds(
  specimens: readonly Specimen[],
  index: GameDataIndex,
  opts: BuildOptions,
): Build[] {
  const out: Build[] = [];
  for (const s of specimens) {
    // buildsFor walks the evolution line, so a Mudkip specimen would otherwise produce a Swampert
    // build carrying Mudkip's spread. Every species has its own specimen here, so the evolved
    // stages are covered properly by their own rows.
    for (const b of buildsFor(s, index, opts)) {
      if (b.speciesId === s.speciesId) {
        out.push(b);
      }
    }
  }
  return out;
}
```

Add to `packages/engine/src/index.ts`:

```ts
export * from './coldstart/pool.js';
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run --project engine packages/engine/test/coldstart/pool.test.ts`
Expected: PASS. Roughly 1146 specimens and 1034 builds for Great League on the current data build.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/coldstart/pool.ts packages/engine/src/index.ts packages/engine/test/coldstart/pool.test.ts packages/engine/test/fixtures.ts
git commit -m "engine: the full legal pool at PvPoke default IVs, no collection needed"
```

---

## Task 6: Cold-start team generation

The Teams board has no cold start of its own, because PvPoke publishes no teams. So we generate
them, in Node, from the pool Task 5 builds, scored with the same `simStrength` the client runs.

`prepare` and `evaluateTrio` do the drafting: they are already matrix-only, and `evaluateTrio`
knows about role fit and the ABB structure that makes a team playable, which `simStrength` alone
does not. What this task does not do is simulate. See the feasibility section: the simulator works
and costs 1 to 3 seconds per league, but selecting by a number the client cannot compute would put
the board's top row out of step with the number printed on it.

**Files:**
- Create: `packages/engine/src/coldstart/teams.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/coldstart/teams.test.ts`

**Interfaces:**
- Consumes: `Candidate`; `MatrixView`; `Structure`, `Prepared`, `prepare`, `evaluateTrio`,
  `DEFAULT_TRIO_OPTIONS`; `strengthContext`, `bestStrength`; `PokemonType`.
- Produces, for Task 8 (the bake) and, through the baked file, Tasks 10 and 12:

```ts
export interface GeneratedTeam {
  /** Lead, switch, closer, in the order the strength was computed for. */
  species: [string, string, string];
  /** simStrength, 0 to 100. */
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  /** From the engine's own draft, for the card: 'ABB' or 'ABC'. */
  structure: Structure;
  /** Meta opponents nobody on the team beats, at most five. */
  exposure: string[];
}

export interface GenerateOptions {
  /** How many teams to emit. */
  results: number;
  /** Per-opponent weights for coverage. Absent means every opponent counts the same. */
  weights?: ReadonlyMap<string, number>;
}

export function generateColdStartTeams(
  pool: readonly Candidate[],
  view: MatrixView,
  types: { types(id: string): [PokemonType, PokemonType | 'none'] },
  opts: GenerateOptions,
): GeneratedTeam[];
```

- [ ] **Step 1: Write the failing test**

`packages/engine/test/coldstart/teams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateColdStartTeams } from '../../src/coldstart/teams.js';
import {
  coldStartBuilds,
  coldStartSpecimens,
  spreadsFromGameMaster,
} from '../../src/coldstart/pool.js';
import { buildOptionsFor } from '../../src/builds/eligibility.js';
import { candidatePool } from '../../src/search/candidates.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { haveStaticData, loadIndex, loadStaticData, readGameMaster } from '../fixtures.js';

const run = haveStaticData() ? describe : describe.skip;

run('generateColdStartTeams', () => {
  function setup(poolSize: number) {
    const data = loadStaticData();
    const index = loadIndex();
    const view = new MatrixView(data.matrix);
    const opts = buildOptionsFor(data.league);
    const builds = coldStartBuilds(
      coldStartSpecimens(
        data.matrix.candidates,
        spreadsFromGameMaster(readGameMaster(), data.league.cp),
        index,
      ),
      index,
      opts,
    );
    const { pool } = candidatePool(builds, data.rankings, view, index, {
      ...opts,
      poolSize,
      excludedSpecimenIds: [],
    });
    return { data, view, pool, types: { types: (id: string) => index.mustSpecies(id).types } };
  }

  it('emits the number of teams asked for, strongest first', () => {
    const { view, pool, types } = setup(40);
    const teams = generateColdStartTeams(pool, view, types, { results: 12 });
    expect(teams).toHaveLength(12);
    for (let i = 1; i < teams.length; i++) {
      expect(teams[i - 1]!.strength).toBeGreaterThanOrEqual(teams[i]!.strength);
    }
    // These are strong teams, not a random trio: the top of a 40-species pool clears 80.
    expect(teams[0]!.strength).toBeGreaterThan(80);
  });

  it('never repeats a species inside a team', () => {
    const { view, pool, types } = setup(40);
    for (const t of generateColdStartTeams(pool, view, types, { results: 12 })) {
      expect(new Set(t.species).size).toBe(3);
    }
  });

  it('keeps the board varied: no two teams share two members', () => {
    const { view, pool, types } = setup(40);
    const teams = generateColdStartTeams(pool, view, types, { results: 12 });
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const shared = teams[i]!.species.filter((s) => teams[j]!.species.includes(s));
        expect(shared.length).toBeLessThan(2);
      }
    }
  });

  it('is deterministic: the same pool gives the same board', () => {
    const { view, pool, types } = setup(40);
    expect(generateColdStartTeams(pool, view, types, { results: 8 })).toEqual(
      generateColdStartTeams(pool, view, types, { results: 8 }),
    );
  });

  it('answers the weights it is given', () => {
    const { data, view, pool, types } = setup(40);
    const flat = generateColdStartTeams(pool, view, types, { results: 8 });
    // Pin every point of facing weight on one opponent; the board must change to answer it.
    const pinned = new Map([[data.matrix.opponents[0] as string, 1]]);
    const skewed = generateColdStartTeams(pool, view, types, { results: 8, weights: pinned });
    expect(skewed[0]!.species).not.toEqual(flat[0]!.species);
  });

  it('finishes fast enough to sit in a bake', () => {
    const { view, pool, types } = setup(60);
    const started = Date.now();
    generateColdStartTeams(pool, view, types, { results: 24 });
    // Measured at roughly 300 ms for 34220 trios over six orderings; ten times that is a failure.
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project engine packages/engine/test/coldstart/teams.test.ts`
Expected: FAIL, "Failed to resolve import ... coldstart/teams.js".

- [ ] **Step 3: Write the implementation**

`packages/engine/src/coldstart/teams.ts`:

```ts
/**
 * The teams meta.pick3.gg shows a league that has no shared battles yet. Generated from the full
 * legal pool at PvPoke default IVs (coldstart/pool.ts), drafted with the engine's own trio
 * evaluation, and scored by the same simStrength the site runs in the browser.
 *
 * Scored by simStrength and NOT by scoreTeam, deliberately. scoreTeam's battle field comes from
 * simulated slot results, where the switch carries four turns of starting energy; the matrix has
 * no such cell, so the two are different numbers. The client can only ever compute the matrix
 * one. Ranking generated teams by a number the client cannot reproduce would put the top of the
 * board out of step with the number printed on it, so both sides use the same function. The
 * simulator was measured doing this job (1 to 3 seconds a league) and left out for that reason,
 * not for cost.
 *
 * A generated team is a baked prior. It is never written into the battle store, because then
 * "from 480 battles shared by 9 devices" would count battles nobody fought.
 */
import type { PokemonType } from '../gamedata/types.js';
import { bestStrength, strengthContext } from '../score/simStrength.js';
import type { Candidate } from '../search/candidates.js';
import type { MatrixView } from '../search/matrixView.js';
import {
  DEFAULT_TRIO_OPTIONS,
  evaluateTrio,
  prepare,
  type Prepared,
  type Structure,
} from '../search/trios.js';

/** How many uncovered top opponents a card names before it stops listing them. */
const EXPOSURE_SHOWN = 5;

export interface GeneratedTeam {
  species: [string, string, string];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  structure: Structure;
  exposure: string[];
}

export interface GenerateOptions {
  results: number;
  weights?: ReadonlyMap<string, number>;
}

interface Scored {
  members: [Prepared, Prepared, Prepared];
  /** Indexes into members: lead, switch, closer. */
  order: [number, number, number];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  key: string;
}

export function generateColdStartTeams(
  pool: readonly Candidate[],
  view: MatrixView,
  types: { types(id: string): [PokemonType, PokemonType | 'none'] },
  opts: GenerateOptions,
): GeneratedTeam[] {
  const ctx = opts.weights ? strengthContext(view, opts.weights) : strengthContext(view);
  const prepared: Prepared[] = prepare([...pool], view, types);
  const n = prepared.length;
  const all: Scored[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const members: [Prepared, Prepared, Prepared] = [
          prepared[i] as Prepared,
          prepared[j] as Prepared,
          prepared[k] as Prepared,
        ];
        const ids = members.map((m) => m.c.build.speciesId);
        // One species per team, even across specimens, the same rule generateTrios keeps.
        if (new Set(ids).size < 3) {
          continue;
        }
        const rows: [number, number, number] = [
          members[0].c.matrixRow,
          members[1].c.matrixRow,
          members[2].c.matrixRow,
        ];
        const s = bestStrength(ctx, rows);
        // rows holds three distinct matrix rows (one species per team), so indexOf is unambiguous.
        const order = [
          rows.indexOf(s.order[0]),
          rows.indexOf(s.order[1]),
          rows.indexOf(s.order[2]),
        ] as [number, number, number];
        all.push({
          members,
          order,
          strength: s.value,
          coverage: s.coverage,
          consistency: s.consistency,
          safety: s.safety,
          key: [...ids].sort().join('+'),
        });
      }
    }
  }

  // Strongest first; the sorted species key breaks a tie, so the same pool always gives the same
  // board however the pool happened to be ordered.
  all.sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key));

  const picked: Scored[] = [];
  const speciesOf = (item: Scored): string[] => item.members.map((m) => m.c.build.speciesId);
  for (const item of all) {
    if (picked.length >= opts.results) {
      break;
    }
    // Keep the board varied: a team may share at most one species with any team already picked,
    // the same rule recommend.ts's diversify keeps. Without it the top of the board is one strong
    // pair with a rotating third.
    const mine = speciesOf(item);
    const clash = picked.some((p) => speciesOf(p).filter((id) => mine.includes(id)).length >= 2);
    if (!clash) {
      picked.push(item);
    }
  }
  for (const item of all) {
    if (picked.length >= opts.results) {
      break;
    }
    if (!picked.includes(item)) {
      picked.push(item);
    }
  }

  return picked.map((item) => {
    // The engine's own draft, evaluated for exactly the order the strength was computed for, so
    // the card's "ABB line" describes the team as it is presented.
    const draft = evaluateTrio(item.members, view, DEFAULT_TRIO_OPTIONS, [item.order]);
    const species = item.order.map((idx) => item.members[idx]!.c.build.speciesId) as [
      string,
      string,
      string,
    ];
    return {
      species,
      strength: item.strength,
      coverage: item.coverage,
      consistency: item.consistency,
      safety: item.safety,
      structure: draft.structure,
      exposure: draft.exposure.slice(0, EXPOSURE_SHOWN),
    };
  });
}
```

Add to `packages/engine/src/index.ts`:

```ts
export * from './coldstart/teams.js';
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --project engine packages/engine/test/coldstart/teams.test.ts`
Expected: PASS, all six.

- [ ] **Step 5: Run the whole engine suite, the typecheck and the lint**

Run: `npx vitest run --project engine && npm run typecheck && npm run lint`
Expected: green. pick3's own recommendation path is untouched, so `recommend.e2e.test.ts` must
still pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/coldstart/teams.ts packages/engine/src/index.ts packages/engine/test/coldstart/teams.test.ts
git commit -m "engine: generate cold-start teams from the legal pool"
```

---

## Task 7: The faced side, and /api/v1/teams

Half the data is currently discarded. `summarize()` builds team rows from `r.team` only, the
reporter's own three; the teams they faced are already in the store, in `r.opponents`, and are
thrown away. This task picks them up, and gives the team board its own endpoint.

Read the spec's "Where the faced teams come from" before writing a line. The four rules it sets:

- **A faced team's record is the inverse of the reporter's.** If the reporter won, the team they
  faced lost that battle. No simulation needed to give faced teams a real record.
- **Partial sightings are first class.** Two opponents is a 2-Pokemon core, which is both honest
  (we print exactly what was seen) and useful.
- **A sighting of a complete team is also a sighting of its cores**, so core counts are supersets
  by construction.
- **Run and faced counts are kept separate on every row**, so no number silently mixes the two
  populations.

Two rules the spec sets elsewhere that bind here: opponents' movesets are never collected, so a
faced row never carries moves; and a tanked battle says nothing about who was there, so it is not
counted, exactly as `speciesStats` already does.

**Files:**
- Create: `workers/counter/src/teams.ts`, `workers/counter/test/teams.test.ts`
- Modify: `workers/counter/src/meta.ts` (the deprecation comment, `isWorkerPath` is already
  `/api/*`-wide), `workers/counter/src/index.ts` (the route and the store method)
- Test: `workers/counter/test/routes.test.ts`

**Interfaces:**
- Consumes: `BattleRow`, `BattleSource` from `./battles.js`; `bandRows`, `movesetsBySpecies`,
  `MovesetStats`, `ReadParams` from `./meta.js`.
- Produces, for Tasks 10 and 12 (the client restates these shapes in `apps/meta/src/api.ts`; the
  format written on both sides is the contract):

```ts
/** A 2-Pokemon core or a complete 3-Pokemon team, run or faced or both. */
export interface TeamRowV1 {
  /** Sorted species ids. Two for a core, three for a complete team. */
  species: string[];
  kind: 'core' | 'team';
  /** Battles the reporters ran it themselves, and how they did. */
  runBattles: number;
  runWins: number;
  runLosses: number;
  /** Battles the reporters faced it, and how IT did: the inverse of the reporter's result. */
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  /** Aligned with `species`: the most common set that member was RUN with, or null. Never from
   *  the faced side, because opponents' movesets are not collected. */
  moves: (MovesetStats | null)[];
  /** Cores only: the third members seen completing this pair, most common first. */
  thirds: { speciesId: string; sightings: number }[];
}

export interface TeamsV1 {
  league: string;
  since: string;
  until: string;
  band: string;
  /** Counted battles in the window and band, the same number /api/v1/meta reports. */
  battles: number;
  devices: number;
  sources: Record<string, number>;
  teams: TeamRowV1[];
  cores: TeamRowV1[];
  generatedAt: string;
}

/** The most rows of each kind one response carries. */
export const TEAM_LIMIT = 200;
export const CORE_LIMIT = 200;
/** A core lists at most this many third members. */
export const THIRDS_LIMIT = 12;

export function teamBoard(opts: {
  league: string;
  since: string;
  until: string;
  band: string;
  rows: readonly BattleRow[];
  now: Date;
  teamLimit?: number;
  coreLimit?: number;
}): TeamsV1;
```

- [ ] **Step 1: Write the failing test**

`workers/counter/test/teams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BattleRow } from '../src/battles.js';
import { teamBoard } from '../src/teams.js';

const WINDOW = {
  league: 'great',
  since: '2026-09-01T00:00:00.000Z',
  until: '2026-09-30T00:00:00.000Z',
  band: 'all',
  now: new Date('2026-09-30T00:00:00.000Z'),
};

function row(over: Partial<BattleRow> = {}): BattleRow {
  return {
    device: 'd1',
    league: 'great',
    season: 28,
    at: '2026-09-10T00:00:00.000Z',
    team: ['azumarill', 'medicham', 'registeel'],
    moves: null,
    opponents: [],
    result: 'win',
    tanked: false,
    band: 'ace',
    source: 'ladder',
    ...over,
  };
}

function find(rows: readonly { species: string[] }[], ...ids: string[]) {
  const want = [...ids].sort().join('+');
  return rows.find((r) => [...r.species].sort().join('+') === want);
}

describe('teamBoard, the run side', () => {
  it('rolls the reporter own three up as a complete team, in any order', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ team: ['azumarill', 'medicham', 'registeel'], result: 'win' }),
        row({ team: ['registeel', 'azumarill', 'medicham'], result: 'loss' }),
      ],
    });
    const t = find(out.teams, 'azumarill', 'medicham', 'registeel');
    expect(t).toBeDefined();
    expect(t?.runBattles).toBe(2);
    expect(t?.runWins).toBe(1);
    expect(t?.runLosses).toBe(1);
    expect(t?.facedBattles).toBe(0);
  });

  it('counts a complete sighting as a sighting of all three of its cores', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ result: 'win' })] });
    expect(out.cores).toHaveLength(3);
    for (const pair of [
      ['azumarill', 'medicham'],
      ['azumarill', 'registeel'],
      ['medicham', 'registeel'],
    ]) {
      const c = find(out.cores, ...pair);
      expect(c?.runBattles).toBe(1);
      expect(c?.runWins).toBe(1);
      expect(c?.kind).toBe('core');
    }
  });

  it('names the third members a core was completed by', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ team: ['azumarill', 'medicham', 'registeel'] }),
        row({ team: ['azumarill', 'medicham', 'registeel'] }),
        row({ team: ['azumarill', 'medicham', 'lanturn'] }),
      ],
    });
    expect(find(out.cores, 'azumarill', 'medicham')?.thirds).toEqual([
      { speciesId: 'registeel', sightings: 2 },
      { speciesId: 'lanturn', sightings: 1 },
    ]);
  });

  it('carries the most common run moveset per member, and never one for a faced row', () => {
    const moves = [
      { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
      null,
      null,
    ] as BattleRow['moves'];
    const rows = Array.from({ length: 6 }, () => row({ moves }));
    const out = teamBoard({ ...WINDOW, rows });
    const t = find(out.teams, 'azumarill', 'medicham', 'registeel');
    // species is sorted, so azumarill is index 0.
    expect(t?.moves[0]).toEqual({ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], battles: 6 });
    expect(t?.moves[1]).toBeNull();
  });
});

describe('teamBoard, the faced side', () => {
  it('records a faced team with the inverse of the reporter result', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ opponents: ['lanturn', 'skarmory', 'shadow'], result: 'win' }),
        row({ opponents: ['skarmory', 'shadow', 'lanturn'], result: 'loss' }),
      ],
    });
    const t = find(out.teams, 'lanturn', 'skarmory', 'shadow');
    // The reporter won one and lost one, so the team they faced lost one and won one.
    expect(t?.facedBattles).toBe(2);
    expect(t?.facedWins).toBe(1);
    expect(t?.facedLosses).toBe(1);
    expect(t?.runBattles).toBe(0);
    expect(t?.moves).toEqual([null, null, null]);
  });

  it('ranks a faced pair as a 2-Pokemon core, since one or two is what gets logged', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ opponents: ['lanturn', 'skarmory'], result: 'loss' })] });
    const c = find(out.cores, 'lanturn', 'skarmory');
    expect(c?.kind).toBe('core');
    expect(c?.facedBattles).toBe(1);
    expect(c?.facedWins).toBe(1);
    expect(c?.thirds).toEqual([]);
    // A pair is not a complete team, so it never appears as one.
    expect(find(out.teams, 'lanturn', 'skarmory')).toBeUndefined();
  });

  it('makes no team or core out of a single opponent', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ team: ['a', 'b', 'c'], opponents: ['lanturn'] })] });
    expect(out.cores.some((c) => c.species.includes('lanturn'))).toBe(false);
    expect(out.teams.some((t) => t.species.includes('lanturn'))).toBe(false);
  });

  it('keeps run and faced counts apart on a row that is both', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ team: ['lanturn', 'skarmory', 'shadow'], opponents: [], result: 'win' }),
        row({ team: ['a', 'b', 'c'], opponents: ['lanturn', 'skarmory', 'shadow'], result: 'win' }),
      ],
    });
    const t = find(out.teams, 'lanturn', 'skarmory', 'shadow');
    expect(t?.runBattles).toBe(1);
    expect(t?.runWins).toBe(1);
    expect(t?.facedBattles).toBe(1);
    // The reporter won the second battle, so the team they faced lost it.
    expect(t?.facedLosses).toBe(1);
    expect(t?.facedWins).toBe(0);
  });

  it('counts a faced complete team toward its cores too', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ opponents: ['lanturn', 'skarmory', 'shadow'] })] });
    expect(find(out.cores, 'lanturn', 'skarmory')?.facedBattles).toBe(1);
    expect(find(out.cores, 'lanturn', 'skarmory')?.thirds).toEqual([
      { speciesId: 'shadow', sightings: 1 },
    ]);
  });

  it('counts a repeated opponent once', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ opponents: ['lanturn', 'lanturn'] })] });
    expect(out.cores).toHaveLength(3); // the run team's three, and no core from one species
    expect(out.cores.some((c) => c.species.includes('lanturn'))).toBe(false);
  });
});

describe('teamBoard, the window', () => {
  it('leaves tanked battles out of everything but still reports the devices honestly', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ device: 'd1', tanked: true }),
        row({ device: 'd2', result: 'win' }),
      ],
    });
    expect(out.battles).toBe(1);
    // d1 only ever tanked, so it has shared nothing usable.
    expect(out.devices).toBe(1);
  });

  it('filters by band, and tallies sources over what is left', () => {
    const out = teamBoard({
      ...WINDOW,
      band: 'legend',
      rows: [row({ band: 'ace' }), row({ band: 'legend' })],
    });
    expect(out.battles).toBe(1);
    expect(out.sources).toEqual({ ladder: 1 });
  });

  it('sorts by total battles and caps both lists', () => {
    const rows: BattleRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(row({ team: [`s${i}`, `t${i}`, `u${i}`] }));
    }
    rows.push(row({ team: ['hot', 'hotter', 'hottest'] }));
    rows.push(row({ team: ['hot', 'hotter', 'hottest'] }));
    const out = teamBoard({ ...WINDOW, rows, teamLimit: 3, coreLimit: 4 });
    expect(out.teams).toHaveLength(3);
    expect(out.cores).toHaveLength(4);
    expect(out.teams[0]?.species).toEqual(['hot', 'hotter', 'hottest']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project counter workers/counter/test/teams.test.ts`
Expected: FAIL, "Failed to resolve import ... teams.js".

- [ ] **Step 3: Write the implementation**

`workers/counter/src/teams.ts`:

```ts
/**
 * The team board behind meta.pick3.gg: every 3-Pokemon team and every 2-Pokemon core the shared
 * records have seen, from both sides of the battle. Pure functions over BattleRow[], so they are
 * tested without a Durable Object.
 *
 * Both sides, because half the data used to be thrown away: the reporter's own three are in
 * r.team and the team they faced is in r.opponents, and the second is the more interesting one.
 *
 * Four rules, from docs/superpowers/specs/2026-09-18-meta-ranking-design.md:
 *  - A faced team's record is the INVERSE of the reporter's. Reporter won means the team they
 *    faced lost that battle. No simulation needed to give faced teams a real record.
 *  - Partial sightings are first class. LogBattle lets a player record 0 to 3 opponents, so a
 *    faced pair is ranked as a 2-Pokemon core: honest, because we print exactly what was seen,
 *    and useful, because core plus flex is how the game is played.
 *  - A sighting of a complete team is a sighting of its three cores, so core counts are supersets
 *    by construction. The client sorts by score, not by count, so this does not hand cores the
 *    top of the board.
 *  - Run and faced counts stay apart on every row, so no number silently mixes the two.
 *
 * A faced row never carries movesets: the opponents' movesets are not collected, by design.
 */
import type { BattleRow } from './battles.js';
import { bandRows, movesetsBySpecies, type MovesetStats } from './meta.js';

export interface TeamRowV1 {
  species: string[];
  kind: 'core' | 'team';
  runBattles: number;
  runWins: number;
  runLosses: number;
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  moves: (MovesetStats | null)[];
  thirds: { speciesId: string; sightings: number }[];
}

export interface TeamsV1 {
  league: string;
  since: string;
  until: string;
  band: string;
  battles: number;
  devices: number;
  sources: Record<string, number>;
  teams: TeamRowV1[];
  cores: TeamRowV1[];
  generatedAt: string;
}

export const TEAM_LIMIT = 200;
export const CORE_LIMIT = 200;
export const THIRDS_LIMIT = 12;
/** A member's moveset only rides along when this many battles back it, the same floor meta.ts
 *  uses for the deep link. */
export const MOVESET_MIN = 5;

interface Bucket extends TeamRowV1 {
  /** Third members seen completing this pair, counted before they are sorted and capped. */
  thirdCounts: Map<string, number>;
}

function blank(species: string[], kind: 'core' | 'team'): Bucket {
  return {
    species,
    kind,
    runBattles: 0,
    runWins: 0,
    runLosses: 0,
    facedBattles: 0,
    facedWins: 0,
    facedLosses: 0,
    moves: species.map(() => null),
    thirds: [],
    thirdCounts: new Map(),
  };
}

function pairsOf(ids: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push([ids[i] as string, ids[j] as string]);
    }
  }
  return out;
}

export function teamBoard(opts: {
  league: string;
  since: string;
  until: string;
  band: string;
  rows: readonly BattleRow[];
  now: Date;
  teamLimit?: number;
  coreLimit?: number;
}): TeamsV1 {
  const { league, since, until, band, rows, now } = opts;
  const teamLimit = opts.teamLimit ?? TEAM_LIMIT;
  const coreLimit = opts.coreLimit ?? CORE_LIMIT;

  const counted = bandRows(rows, band).filter((r) => !r.tanked);
  // Over counted, not over every row: a device that only ever tanked has shared nothing usable,
  // the same reason tanked rows are excluded from every other tally here.
  const devices = new Set(counted.map((r) => r.device));
  const sources: Record<string, number> = {};
  for (const r of counted) {
    sources[r.source] = (sources[r.source] ?? 0) + 1;
  }
  const sets = movesetsBySpecies(counted);

  const teams = new Map<string, Bucket>();
  const cores = new Map<string, Bucket>();
  const take = (into: Map<string, Bucket>, species: string[], kind: 'core' | 'team'): Bucket => {
    const key = species.join('+');
    const held = into.get(key) ?? blank(species, kind);
    into.set(key, held);
    return held;
  };

  for (const r of counted) {
    const win = r.result === 'win' ? 1 : 0;
    const loss = r.result === 'loss' ? 1 : 0;

    // The run side: always exactly three, always the reporter's own result.
    const mine = [...new Set(r.team)].sort();
    if (mine.length === 3) {
      const t = take(teams, mine, 'team');
      t.runBattles += 1;
      t.runWins += win;
      t.runLosses += loss;
      for (const [a, b] of pairsOf(mine)) {
        const c = take(cores, [a, b], 'core');
        c.runBattles += 1;
        c.runWins += win;
        c.runLosses += loss;
        const third = mine.find((id) => id !== a && id !== b) as string;
        c.thirdCounts.set(third, (c.thirdCounts.get(third) ?? 0) + 1);
      }
    }

    // The faced side: 0 to 3 opponents, and the INVERSE result. If the reporter won, the team
    // they faced lost that battle.
    const theirs = [...new Set(r.opponents)].sort();
    if (theirs.length === 3) {
      const t = take(teams, theirs, 'team');
      t.facedBattles += 1;
      t.facedWins += loss;
      t.facedLosses += win;
    }
    if (theirs.length >= 2) {
      for (const [a, b] of pairsOf(theirs)) {
        const c = take(cores, [a, b], 'core');
        c.facedBattles += 1;
        c.facedWins += loss;
        c.facedLosses += win;
        if (theirs.length === 3) {
          const third = theirs.find((id) => id !== a && id !== b) as string;
          c.thirdCounts.set(third, (c.thirdCounts.get(third) ?? 0) + 1);
        }
      }
    }
  }

  const finish = (bucket: Bucket): TeamRowV1 => ({
    species: bucket.species,
    kind: bucket.kind,
    runBattles: bucket.runBattles,
    runWins: bucket.runWins,
    runLosses: bucket.runLosses,
    facedBattles: bucket.facedBattles,
    facedWins: bucket.facedWins,
    facedLosses: bucket.facedLosses,
    // Only from the run side: a member's set is known only when a reporter ran it themselves,
    // and a row nobody ran gets nulls rather than a borrowed guess.
    moves: bucket.species.map((id) => {
      if (bucket.runBattles === 0) {
        return null;
      }
      const top = sets.get(id)?.[0];
      return top && top.battles >= MOVESET_MIN ? top : null;
    }),
    thirds: [...bucket.thirdCounts.entries()]
      .map(([speciesId, battles]) => ({ speciesId, battles }))
      .sort((a, b) => b.battles - a.battles || a.speciesId.localeCompare(b.speciesId))
      .slice(0, THIRDS_LIMIT),
  });

  const total = (b: Bucket): number => b.runBattles + b.facedBattles;
  const order = (a: Bucket, b: Bucket): number =>
    total(b) - total(a) || a.species.join('+').localeCompare(b.species.join('+'));

  return {
    league,
    since,
    until,
    band,
    battles: counted.length,
    devices: devices.size,
    sources,
    teams: [...teams.values()].sort(order).slice(0, teamLimit).map(finish),
    cores: [...cores.values()].sort(order).slice(0, coreLimit).map(finish),
    generatedAt: now.toISOString(),
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --project counter workers/counter/test/teams.test.ts`
Expected: PASS, all thirteen.

- [ ] **Step 5: Wire the route**

In `workers/counter/src/index.ts`, import `teamBoard` and `type TeamsV1` from `./teams.js`, add a
`MetaStore` method next to `summaryV1`:

```ts
  teamsV1(p: { league: string; since: string; until: string; band: string }): TeamsV1 {
    return teamBoard({ ...p, rows: this.read(p.league, p.since, p.until), now: new Date() });
  }
```

and inside the `/api/v1/` block, before the species branch:

```ts
      if (url.pathname === '/api/v1/teams') {
        return Response.json(await meta.teamsV1(p), { headers: read });
      }
```

It shares `readParams` and `READ_CACHE`, so it gets the same window validation and the same ten
minute bucket, on its own URL. The spec asks for its own bucket, and a different path is exactly
that: the edge caches the two separately, which is the point, because the teams payload is much
heavier and changes on a different rhythm.

In `workers/counter/src/meta.ts`, mark the old field, right above `teams` in `MetaSummaryV1`:

```ts
  /**
   * @deprecated Run teams only, and capped at 50. The whole team board, run and faced, cores and
   * complete teams, is /api/v1/teams. Left in place and unchanged rather than altered under a
   * consumer; nothing new should read it.
   */
  teams: TeamStats[];
```

- [ ] **Step 6: Test the route**

Add to `workers/counter/test/routes.test.ts`, alongside the existing `/api/v1/meta` cases:

```ts
it('serves the team board with the read cache header', async () => {
  const res = await get(
    '/api/v1/teams?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z',
  );
  expect(res.status).toBe(200);
  expect(res.headers.get('Cache-Control')).toBe('public, max-age=600');
  const body = (await res.json()) as { league: string; teams: unknown[]; cores: unknown[] };
  expect(body.league).toBe('great');
  expect(Array.isArray(body.teams)).toBe(true);
  expect(Array.isArray(body.cores)).toBe(true);
});

it('rejects a bad window on the team board the same way as the summary', async () => {
  const res = await get('/api/v1/teams?league=great&since=nope&until=nope');
  expect(res.status).toBe(400);
});
```

Run: `npx vitest run --project counter`
Expected: PASS.

- [ ] **Step 7: Look at it against seeded data**

```bash
cd workers/counter && npx wrangler dev --port 8787 &
cd /d/Skunkworks/pickthree
node workers/counter/scripts/seed-battles.mjs --battles 500 --devices 5 --clear
curl -s 'http://127.0.0.1:8787/api/v1/teams?league=great&since=2026-08-20T00:00:00Z&until=2026-10-01T00:00:00Z' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);console.log(b.battles,'battles',b.teams.length,'teams',b.cores.length,'cores');console.log(b.cores[0]);})"
```

Expected: several hundred battles, a non-empty `teams` list, a longer `cores` list, and a top core
carrying both `facedBattles` and `thirds`. If `cores` is empty, the faced side is not being read.

- [ ] **Step 8: Commit**

```bash
git add workers/counter/src/teams.ts workers/counter/src/meta.ts workers/counter/src/index.ts workers/counter/test/teams.test.ts workers/counter/test/routes.test.ts
git commit -m "worker: roll up faced teams and cores behind /api/v1/teams"
```

---

## Task 8: The bake: ranks, the matrix slice, generated teams, epochs

Four new baked artifacts, all gitignored and rebuilt from `apps/web/public/data`, all stamped with
the same pinned commit and date as the species baseline.

Measured sizes for the matrix slice at the top 250 species (see the feasibility section): great
61 KB gzipped, ultra 57 KB, master 42 KB. The bake prints the raw size of each file it writes, so
a future bump that doubles it is visible rather than discovered on a phone.

**Files:**
- Create: `apps/meta/epochs.json` (committed, hand-kept)
- Modify: `apps/meta/scripts/bake.ts`, `apps/meta/package.json`, `.gitignore`
- Test: `apps/meta/test/bake.test.ts`

**Interfaces:**
- Consumes: `spreadsFromGameMaster`, `coldStartSpecimens`, `coldStartBuilds`,
  `generateColdStartTeams`, `candidatePool`, `MatrixView`, `GameDataIndex`, `buildOptionsFor`,
  `matrixIndex` from `@pickthree/engine`.
- Produces, for Tasks 9, 10 and 12 (fetched over HTTP by the client):

```ts
/** apps/meta/public/ranks/<league>.json */
export interface RanksFile {
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  /** PvPoke's overall ranking, most highly ranked first. Position + 1 is the rank. */
  order: string[];
}

/** apps/meta/public/matrix/<league>.json, the shipped matrix cut down to MATRIX_TOP rows. */
export interface SliceFile {
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  matrix: MatchupMatrix;
}

/** apps/meta/public/baseline/<league>-teams.json */
export interface GeneratedTeamsFile {
  league: string;
  source: 'generated';
  pvpokeCommit: string;
  pvpokeDate: string;
  /** The slope simStrength was read through when these were generated, so a card can say so. */
  projectionSlope: number;
  teams: GeneratedTeam[];
}

/** How many species the slice carries, by PvPoke overall rank. */
export const MATRIX_TOP = 250;
/** Species in the candidate pool the cold-start generator drafts from. */
export const COLD_POOL = 60;
/** Teams emitted per league. */
export const COLD_TEAMS = 24;
```

- [ ] **Step 1: Write the epochs file**

`apps/meta/epochs.json`, committed, hand-kept, the same pattern as `packages/data/seasons.json`:

```json
[
  { "at": "2026-09-08T13:00:00-07:00", "note": "Season 28" }
]
```

An entry may carry `"leagues": ["great"]` to apply to one league only, and
`"pvpokeCommit": "<sha>"` to say which commit the measured side expects. Resetting the meta is one
line and a deploy. It deletes nothing: a reset moves the default window, it does not purge the
Durable Object, so the 30 and 7 day views keep working and a reset made in error is one edit from
undone.

- [ ] **Step 2: Write the failing bake test**

Add to `apps/meta/test/bake.test.ts`:

```ts
describe('readEpochs', () => {
  it('accepts a minimal entry and sorts by time', () => {
    const out = readEpochs([
      { at: '2026-10-14T00:00:00Z', note: 'move rebalance', leagues: ['great'] },
      { at: '2026-09-08T13:00:00-07:00', note: 'Season 28' },
    ]);
    expect(out.map((e) => e.note)).toEqual(['Season 28', 'move rebalance']);
    expect(out[0]?.leagues).toBeUndefined();
    expect(out[1]?.leagues).toEqual(['great']);
  });

  it('refuses an entry that is not a time and a note', () => {
    expect(() => readEpochs([{ at: 'soon', note: 'x' }])).toThrow(/at/);
    expect(() => readEpochs([{ at: '2026-09-08T13:00:00-07:00' }])).toThrow(/note/);
    expect(() => readEpochs('nope')).toThrow(/array/);
  });
});

describe('sliceMatrix', () => {
  const matrix = {
    league: 'great',
    cp: 1500,
    scenarios: [
      { shields: [0, 0], energy: [0, 0] },
      { shields: [1, 1], energy: [0, 0] },
      { shields: [2, 2], energy: [0, 0] },
    ],
    candidates: ['a', 'b', 'c'],
    opponents: ['x', 'y'],
    candidateMovesets: { a: ['F'], b: ['F'], c: ['F'] },
    opponentMovesets: { x: ['F'], y: ['F'] },
    // a: 1..6, b: 7..12, c: 13..18
    ratings: Array.from({ length: 18 }, (_, i) => i + 1),
  };

  it('keeps the first N rows and every rating in them, unchanged', () => {
    const out = sliceMatrix(matrix, 2);
    expect(out.candidates).toEqual(['a', 'b']);
    expect(out.opponents).toEqual(['x', 'y']);
    expect(out.ratings).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Object.keys(out.candidateMovesets).sort()).toEqual(['a', 'b']);
  });

  it('is a no-op when the matrix is already smaller than the cut', () => {
    expect(sliceMatrix(matrix, 99).candidates).toEqual(['a', 'b', 'c']);
  });
});

describe('ranksOf', () => {
  it('is PvPoke overall order, first entry wins a duplicate', () => {
    expect(ranksOf([{ speciesId: 'a' }, { speciesId: 'b' }, { speciesId: 'a' }])).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run --project meta apps/meta/test/bake.test.ts`
Expected: FAIL, `readEpochs`, `sliceMatrix` and `ranksOf` are not exported.

- [ ] **Step 4: Extend the bake**

In `apps/meta/package.json`, add to `dependencies` (exact, no caret):

```json
    "@pickthree/engine": "0.0.0",
```

In `apps/meta/scripts/bake.ts`, add the three pure helpers and the generation step. New exports
alongside the existing `bake`:

```ts
import { MatrixView, matrixIndex, type MatchupMatrix } from '@pickthree/engine/meta';
import {
  GameDataIndex,
  PROJECTION_SLOPE,
  buildOptionsFor,
  candidatePool,
  coldStartBuilds,
  coldStartSpecimens,
  generateColdStartTeams,
  spreadsFromGameMaster,
  type GeneratedTeam,
  type League as EngineLeague,
} from '@pickthree/engine';

/** How many species the shipped slice carries, by PvPoke overall rank. Measured at 61 KB gzipped
 *  for Great League; the bake prints the raw size so a bump that doubles it is visible. */
export const MATRIX_TOP = 250;
/** Species the cold-start generator drafts from. 60 scores in about 300 ms a league. */
export const COLD_POOL = 60;
/** Generated teams emitted per league. */
export const COLD_TEAMS = 24;

export interface Epoch {
  /** ISO time with an offset, the same rule seasons.json keeps. */
  at: string;
  note: string;
  /** Absent means every league. */
  leagues?: string[];
  /** The PvPoke commit the measured side of this epoch expects. */
  pvpokeCommit?: string;
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;

/** The hand-kept meta epoch list, validated and sorted by time. Mirrors readSeasons. */
export function readEpochs(raw: unknown): Epoch[] {
  if (!Array.isArray(raw)) {
    throw new Error('epochs.json: expected an array');
  }
  const out: Epoch[] = raw.map((entry, i) => {
    const e = entry as Partial<Epoch>;
    if (typeof e.at !== 'string' || !ISO_WITH_OFFSET.test(e.at) || Number.isNaN(Date.parse(e.at))) {
      throw new Error(`epochs.json: entry ${i} "at" must be an ISO time with an offset or Z`);
    }
    if (typeof e.note !== 'string' || e.note.length === 0) {
      throw new Error(`epochs.json: entry ${i} needs a note`);
    }
    if (e.leagues !== undefined && !Array.isArray(e.leagues)) {
      throw new Error(`epochs.json: entry ${i} "leagues" must be an array when present`);
    }
    const made: Epoch = { at: e.at, note: e.note };
    if (e.leagues) {
      made.leagues = [...e.leagues];
    }
    if (typeof e.pvpokeCommit === 'string') {
      made.pvpokeCommit = e.pvpokeCommit;
    }
    return made;
  });
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** PvPoke's overall ranking as an ordered id list. First entry wins a duplicate, the same rule
 *  metaRank.ts's positions() keeps, so rank numbers agree with pick3's. */
export function ranksOf(overall: readonly { speciesId: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of overall) {
    if (!seen.has(e.speciesId)) {
      seen.add(e.speciesId);
      out.push(e.speciesId);
    }
  }
  return out;
}

/** The shipped matrix cut to its first `top` rows. Rows are already in PvPoke overall order,
 *  because build-matrix.ts fills them straight from rankings/<league>/overall.json. */
export function sliceMatrix(matrix: MatchupMatrix, top: number): MatchupMatrix {
  if (matrix.candidates.length <= top) {
    return matrix;
  }
  const candidates = matrix.candidates.slice(0, top);
  const out: MatchupMatrix = {
    league: matrix.league,
    cp: matrix.cp,
    scenarios: matrix.scenarios,
    candidates,
    opponents: matrix.opponents,
    candidateMovesets: Object.fromEntries(
      candidates.map((id) => [id, [...(matrix.candidateMovesets[id] ?? [])]]),
    ),
    opponentMovesets: matrix.opponentMovesets,
    ratings: [],
  };
  const view = new MatrixView(matrix);
  const ratings = new Array<number>(
    candidates.length * matrix.opponents.length * matrix.scenarios.length,
  ).fill(0);
  candidates.forEach((id, ci) => {
    const from = view.rowOf(id) as number;
    matrix.opponents.forEach((_, oi) => {
      matrix.scenarios.forEach((_, si) => {
        ratings[matrixIndex(out, ci, oi, si)] = view.rating(from, oi, si);
      });
    });
  });
  out.ratings = ratings;
  return out;
}
```

and a generation helper, also exported so a test can drive it without the disk:

```ts
/** The cold-start board for one league. Weighted by PvPoke's prior alone: at bake time there is
 *  no measured play, and the site reweighs its own copy once there is. */
export function generateFor(input: {
  league: EngineLeague;
  index: GameDataIndex;
  matrix: MatchupMatrix;
  rankings: Parameters<typeof candidatePool>[1];
  gameMaster: unknown;
}): GeneratedTeam[] {
  const view = new MatrixView(input.matrix);
  const opts = buildOptionsFor(input.league);
  const builds = coldStartBuilds(
    coldStartSpecimens(
      input.matrix.candidates,
      spreadsFromGameMaster(input.gameMaster, input.league.cp),
      input.index,
    ),
    input.index,
    opts,
  );
  const { pool } = candidatePool(builds, input.rankings, view, input.index, {
    ...opts,
    poolSize: COLD_POOL,
    excludedSpecimenIds: [],
  });
  return generateColdStartTeams(
    pool,
    view,
    { types: (id: string) => input.index.mustSpecies(id).types },
    { results: COLD_TEAMS },
  );
}
```

In `main()`, after the existing writes, read the extra inputs and write the four new artifacts:

```ts
  const gameMaster: unknown = await readJson(DATA, 'gamemaster.json');
  const pokemonFull = await readJson<Species[]>(DATA, 'pokemon.json');
  const movesFull = await readJson<Move[]>(DATA, 'moves.json');
  const index = new GameDataIndex(pokemonFull, movesFull);
  const engineLeagues = await readJson<EngineLeague[]>(DATA, 'leagues.json');
  const manifest = await readJson<{ pvpokeCommit: string; pvpokeDate: string }>(
    DATA,
    'data-manifest.json',
  );

  await mkdir(join(OUT, 'ranks'), { recursive: true });
  await mkdir(join(OUT, 'matrix'), { recursive: true });
  const sizes: string[] = [];
  for (const league of engineLeagues) {
    const overall = await readJson<{ speciesId: string }[]>(DATA, 'rankings', league.id, 'overall.json');
    const matrix = await readJson<MatchupMatrix>(DATA, 'matrix', `${league.id}.json`);
    const rankings = {
      overall,
      leads: await readJson(DATA, 'rankings', league.id, 'leads.json'),
      switches: await readJson(DATA, 'rankings', league.id, 'switches.json'),
      closers: await readJson(DATA, 'rankings', league.id, 'closers.json'),
      chargers: await readJson(DATA, 'rankings', league.id, 'chargers.json'),
    } as Parameters<typeof candidatePool>[1];

    const ranks = {
      league: league.id,
      pvpokeCommit: manifest.pvpokeCommit,
      pvpokeDate: manifest.pvpokeDate,
      order: ranksOf(overall),
    };
    const slice = {
      league: league.id,
      pvpokeCommit: manifest.pvpokeCommit,
      pvpokeDate: manifest.pvpokeDate,
      matrix: sliceMatrix(matrix, MATRIX_TOP),
    };
    const teams = {
      league: league.id,
      source: 'generated' as const,
      pvpokeCommit: manifest.pvpokeCommit,
      pvpokeDate: manifest.pvpokeDate,
      projectionSlope: PROJECTION_SLOPE,
      teams: generateFor({ league, index, matrix, rankings, gameMaster }),
    };

    for (const [dir, name, body] of [
      ['ranks', `${league.id}.json`, ranks],
      ['matrix', `${league.id}.json`, slice],
      ['baseline', `${league.id}-teams.json`, teams],
    ] as const) {
      const text = JSON.stringify(body);
      await writeFile(join(OUT, dir, name), text);
      sizes.push(`${dir}/${name} ${Math.round(text.length / 1024)} KB`);
    }
  }

  await writeFile(
    join(OUT, 'epochs.json'),
    JSON.stringify(readEpochs(JSON.parse(await readFile(join(here, '..', 'epochs.json'), 'utf8')))),
  );
  process.stdout.write(`baked ${sizes.join(', ')}\n`);
```

- [ ] **Step 5: Add the new artifacts to .gitignore**

Under the existing block:

```
apps/meta/public/ranks/
apps/meta/public/matrix/
apps/meta/public/epochs.json
```

`apps/meta/public/baseline/` is already ignored, so `<league>-teams.json` is covered.

- [ ] **Step 6: Run the bake and check the sizes**

Run:

```bash
npm -w @pickthree/meta run bake
ls -la apps/meta/public/matrix apps/meta/public/ranks apps/meta/public/baseline
node -e "const z=require('node:zlib'),f=require('node:fs');for(const l of ['great','ultra','master']){const b=f.readFileSync('apps/meta/public/matrix/'+l+'.json');console.log(l,Math.round(b.length/1024)+' KB raw,',Math.round(z.gzipSync(b,{level:9}).length/1024)+' KB gz')}"
```

Expected: the bake line names every file and its raw size, and the gzip check reports roughly
61 KB (great), 57 KB (ultra) and 42 KB (master). If any league is far outside that, stop and work
out why before shipping a slice to a phone.

Also sanity-read the generated board:

```bash
node -e "const t=require('./apps/meta/public/baseline/great-teams.json');console.log(t.teams.length,'teams');for(const x of t.teams.slice(0,5)){console.log(x.strength,x.structure,x.species.join(' / '))}"
```

Expected: 24 teams, strongest first, each a plausible Great League trio, no species repeated
inside a team, no two teams sharing two members.

- [ ] **Step 7: Run the test**

Run: `npx vitest run --project meta apps/meta/test/bake.test.ts && npm run typecheck`
Expected: PASS and clean.

- [ ] **Step 8: Commit**

```bash
git add apps/meta/scripts/bake.ts apps/meta/epochs.json apps/meta/package.json apps/meta/test/bake.test.ts .gitignore package-lock.json
git commit -m "meta: bake ranks, the matrix slice, generated teams and the epoch list"
```

---

## Task 9: Meta epochs in the client

The default window becomes "since the newest epoch that applies to this league" rather than "since
the season start", and the filter chip reads "This meta". The season list stays: it is still the
fallback when no epoch covers a league, and the season is still what a battle record stamps.

An epoch carries the commit it expects. If a rebalance lands and the pinned commit is still
pre-rebalance, `simStrength` scores the old movesets while the measured data already reflects the
new ones, and the blend quietly fights itself. The site says so plainly when the two disagree.

**Files:**
- Create: `apps/meta/src/epochs.ts`, `apps/meta/test/epochs.test.ts`
- Modify: `apps/meta/src/api.ts`, `apps/meta/src/route.ts`, `apps/meta/src/useMeta.ts`
- Test: `apps/meta/test/api.test.ts`, `apps/meta/test/route.test.ts`

**Interfaces:**
- Consumes: `Season` from `./data.js`; the baked `/epochs.json` from Task 8.
- Produces, for Tasks 11 to 14:

```ts
// epochs.ts
export interface Epoch {
  at: string;
  note: string;
  leagues?: string[];
  pvpokeCommit?: string;
}
export function loadEpochs(fetcher?: typeof fetch): Promise<Epoch[]>;
export function resetEpochs(): void;
/** The newest epoch that has started and applies to this league, or null. */
export function epochFor(epochs: readonly Epoch[], league: string, at: Date): Epoch | null;
/** True when the epoch names a commit and the baked data is on a different one. */
export function commitMismatch(epoch: Epoch | null, bakedCommit: string): boolean;

// api.ts
export type WindowKey = 'meta' | '30' | '7';   // re-exported from route.ts, unchanged shape
export interface WindowContext {
  league: string;
  seasons: readonly Season[];
  epochs: readonly Epoch[];
}
export interface ApiWindow {
  since: string;
  until: string;
  label: string;
  key: WindowKey;
  /** The epoch the window came from, when it came from one. */
  epoch: Epoch | null;
}
export function resolveWindow(key: WindowKey, ctx: WindowContext, now: Date): ApiWindow;
export function teamsUrl(league: string, w: ApiWindow, band: BandKey): string;
export function fetchTeams(
  league: string, w: ApiWindow, band: BandKey,
  opts?: { signal?: AbortSignal; fetcher?: typeof fetch },
): Promise<TeamsV1>;

// useMeta.ts
export function useEpochs(deps?: Deps): Loaded<Epoch[]>;
export function useTeams(league: string, w: ApiWindow, band: BandKey, deps?: Deps): Loaded<TeamsV1>;
```

- [ ] **Step 1: Write the failing epoch tests**

`apps/meta/test/epochs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { commitMismatch, epochFor, type Epoch } from '../src/epochs.js';

const SEASON: Epoch = { at: '2026-09-08T13:00:00-07:00', note: 'Season 28' };
const REBALANCE: Epoch = {
  at: '2026-10-14T00:00:00Z',
  note: 'move rebalance',
  leagues: ['great'],
  pvpokeCommit: 'abc123',
};

describe('epochFor', () => {
  it('is the newest epoch that has already started', () => {
    expect(epochFor([SEASON, REBALANCE], 'great', new Date('2026-10-20T00:00:00Z'))).toBe(REBALANCE);
    expect(epochFor([SEASON, REBALANCE], 'great', new Date('2026-09-20T00:00:00Z'))).toBe(SEASON);
  });

  it('skips an epoch that names other leagues', () => {
    expect(epochFor([SEASON, REBALANCE], 'ultra', new Date('2026-10-20T00:00:00Z'))).toBe(SEASON);
  });

  it('ignores an epoch that has not started', () => {
    expect(epochFor([REBALANCE], 'great', new Date('2026-09-20T00:00:00Z'))).toBeNull();
  });

  it('does not depend on the list being sorted', () => {
    expect(epochFor([REBALANCE, SEASON], 'great', new Date('2026-10-20T00:00:00Z'))).toBe(REBALANCE);
  });

  it('is null when there are no epochs at all', () => {
    expect(epochFor([], 'great', new Date())).toBeNull();
  });
});

describe('commitMismatch', () => {
  it('is true only when the epoch names a commit and the baked one differs', () => {
    expect(commitMismatch(REBALANCE, 'abc123')).toBe(false);
    expect(commitMismatch(REBALANCE, 'def456')).toBe(true);
    // An epoch with no expectation cannot disagree with anything.
    expect(commitMismatch(SEASON, 'def456')).toBe(false);
    expect(commitMismatch(null, 'def456')).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing window tests**

Replace the `resolveWindow` block in `apps/meta/test/api.test.ts`:

```ts
const SEASONS = [
  { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
  { id: 29, name: 'Season 29', start: '2026-12-01T13:00:00-08:00' },
];
const EPOCHS = [
  { at: '2026-09-08T13:00:00-07:00', note: 'Season 28' },
  { at: '2026-09-15T00:00:00Z', note: 'move rebalance', leagues: ['great'] },
];
const ctx = (league: string) => ({ league, seasons: SEASONS, epochs: EPOCHS });

describe('resolveWindow', () => {
  it('runs the meta window from the newest epoch that applies', () => {
    const w = resolveWindow('meta', ctx('great'), new Date('2026-09-20T12:03:00Z'));
    expect(w.since).toBe('2026-09-15T00:00:00.000Z');
    expect(w.label).toBe('This meta');
    expect(w.epoch?.note).toBe('move rebalance');
    // Rounded up to the next ten minute boundary, so every reader shares an edge cache entry.
    expect(w.until).toBe('2026-09-20T12:10:00.000Z');
  });

  it('gives a league the rebalance did not touch the earlier epoch', () => {
    const w = resolveWindow('meta', ctx('ultra'), new Date('2026-09-20T12:03:00Z'));
    expect(w.since).toBe('2026-09-08T20:00:00.000Z');
    expect(w.epoch?.note).toBe('Season 28');
  });

  it('falls back to the season start when no epoch has begun', () => {
    const w = resolveWindow(
      'meta',
      { league: 'great', seasons: SEASONS, epochs: [] },
      new Date('2026-09-20T12:03:00Z'),
    );
    expect(w.since).toBe('2026-09-08T20:00:00.000Z');
    expect(w.epoch).toBeNull();
    expect(w.label).toBe('This meta');
  });

  it('falls back to 30 days when neither an epoch nor a season covers the moment', () => {
    const w = resolveWindow(
      'meta',
      { league: 'great', seasons: [], epochs: [] },
      new Date('2026-09-20T12:03:00Z'),
    );
    expect(w.key).toBe('meta');
    expect(Date.parse(w.until) - Date.parse(w.since)).toBe(30 * 86_400_000);
  });

  it('never asks the worker for a span it rejects', () => {
    const ancient = [{ at: '2020-01-01T00:00:00Z', note: 'the before times' }];
    const w = resolveWindow(
      'meta',
      { league: 'great', seasons: [], epochs: ancient },
      new Date('2026-09-20T12:03:00Z'),
    );
    // The worker refuses anything over 400 days (MAX_SPAN_DAYS), so the client clamps first.
    expect(Date.parse(w.until) - Date.parse(w.since)).toBeLessThanOrEqual(400 * 86_400_000);
  });

  it('leaves the fixed windows alone', () => {
    const w = resolveWindow('7', ctx('great'), new Date('2026-09-20T12:03:00Z'));
    expect(Date.parse(w.until) - Date.parse(w.since)).toBe(7 * 86_400_000);
    expect(w.label).toBe('7 days');
    expect(w.epoch).toBeNull();
  });
});

describe('teamsUrl', () => {
  it('is its own path, so it gets its own ten minute bucket', () => {
    const w = resolveWindow('7', ctx('great'), new Date('2026-09-20T12:03:00Z'));
    expect(teamsUrl('great', w, 'all')).toBe(
      `/api/v1/teams?league=great&since=${encodeURIComponent(w.since)}&until=${encodeURIComponent(w.until)}`,
    );
    expect(teamsUrl('great', w, 'ace')).toContain('band=ace');
  });
});
```

And in `apps/meta/test/route.test.ts`:

```ts
it('reads the old season key as the meta window, so an old link still works', () => {
  expect(parseLocation('/great', '?w=season', ['great']).query.w).toBe('meta');
});

it('drops the default window from a href', () => {
  expect(hrefFor({ name: 'teams', league: 'great' }, { w: 'meta', band: 'all' })).toBe('/great');
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run --project meta apps/meta/test/epochs.test.ts apps/meta/test/api.test.ts apps/meta/test/route.test.ts`
Expected: FAIL, `epochs.js` does not resolve and `resolveWindow` has the old signature.

- [ ] **Step 4: Write epochs.ts**

```ts
/**
 * Meta epochs: when the game changed enough that what came before stops describing what players
 * face now. Hand-kept in apps/meta/epochs.json, the same pattern packages/data/seasons.json
 * already follows, and validated by the bake.
 *
 * Resetting the meta is one line and a deploy, and it DELETES NOTHING. A reset moves the default
 * window; it does not purge the Durable Object. The 30 and 7 day views keep working and a reset
 * made in error is one edit from undone. A destructive purge is the only version that cannot be
 * taken back, and it is never needed: the cure for stale data is to stop counting it, not to burn
 * it.
 *
 * Not derived from the PvPoke bump. data-refresh.yml moves that commit weekly and almost none of
 * those bumps are a meta reset; deriving it would reset the site most weeks for nothing. An epoch
 * can NAME the commit it expects instead, and the site says so plainly when the two disagree,
 * because that is the case where the projection scores the old movesets while the measured side
 * already reflects the new ones.
 */
export interface Epoch {
  at: string;
  note: string;
  /** Absent means every league. */
  leagues?: string[];
  pvpokeCommit?: string;
}

let cached: Promise<Epoch[]> | null = null;

export function loadEpochs(fetcher: typeof fetch = fetch): Promise<Epoch[]> {
  if (!cached) {
    cached = (async () => {
      const res = await fetcher('/epochs.json');
      if (!res.ok) {
        throw new Error(`Could not load /epochs.json (${res.status})`);
      }
      return (await res.json()) as Epoch[];
    })().catch((err: unknown) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** Tests only: forget the memoised load so the next call uses a fresh stub. */
export function resetEpochs(): void {
  cached = null;
}

export function epochFor(epochs: readonly Epoch[], league: string, at: Date): Epoch | null {
  let best: Epoch | null = null;
  let bestAt = -Infinity;
  for (const e of epochs) {
    const started = Date.parse(e.at);
    if (!Number.isFinite(started) || started > at.getTime()) {
      continue;
    }
    if (e.leagues && !e.leagues.includes(league)) {
      continue;
    }
    if (started > bestAt) {
      best = e;
      bestAt = started;
    }
  }
  return best;
}

export function commitMismatch(epoch: Epoch | null, bakedCommit: string): boolean {
  if (!epoch || epoch.pvpokeCommit === undefined) {
    return false;
  }
  return epoch.pvpokeCommit !== bakedCommit;
}
```

- [ ] **Step 5: Rework the window in api.ts**

Replace `resolveWindow` and add the teams client:

```ts
import { epochFor, type Epoch } from './epochs.js';

/** The most days the worker will answer for (MAX_SPAN_DAYS in workers/counter/src/meta.ts). The
 *  client clamps first rather than letting an old epoch produce a request that is refused. */
export const MAX_SPAN_DAYS = 400;

export interface WindowContext {
  league: string;
  seasons: readonly Season[];
  epochs: readonly Epoch[];
}

export interface ApiWindow {
  since: string;
  until: string;
  label: string;
  key: WindowKey;
  epoch: Epoch | null;
}

export function resolveWindow(key: WindowKey, ctx: WindowContext, now: Date): ApiWindow {
  const until = bucketUp(now);
  if (key !== 'meta') {
    const days = key === '7' ? 7 : 30;
    return {
      since: new Date(until - days * DAY_MS).toISOString(),
      until: new Date(until).toISOString(),
      label: `${days} days`,
      key,
      epoch: null,
    };
  }
  const epoch = epochFor(ctx.epochs, ctx.league, new Date(until));
  // An epoch first, the season start second: the season is still the right answer for a league
  // no epoch has ever named, and it is what a record stamps.
  const start = epoch ? Date.parse(epoch.at) : seasonStart(ctx.seasons, until);
  if (start === null || !Number.isFinite(start)) {
    // Nothing covers this moment, so measure the last 30 days and keep the chip honest.
    const fallback = resolveWindow('30', ctx, now);
    return { ...fallback, label: 'This meta', key: 'meta' };
  }
  const floor = until - MAX_SPAN_DAYS * DAY_MS;
  return {
    since: new Date(Math.max(start, floor)).toISOString(),
    until: new Date(until).toISOString(),
    label: 'This meta',
    key,
    epoch,
  };
}
```

Add the teams wire shapes next to the existing ones (written down again rather than imported from
`workers/counter`: this app does not depend on that workspace, and a format written on both sides
is the contract; they must match `workers/counter/src/teams.ts` exactly):

```ts
export interface TeamRowV1 {
  species: string[];
  kind: 'core' | 'team';
  runBattles: number;
  runWins: number;
  runLosses: number;
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  moves: (MovesetStats | null)[];
  thirds: { speciesId: string; sightings: number }[];
}
export interface TeamsV1 {
  league: string;
  since: string;
  until: string;
  band: string;
  battles: number;
  devices: number;
  sources: Record<string, number>;
  teams: TeamRowV1[];
  cores: TeamRowV1[];
  generatedAt: string;
}

export function teamsUrl(league: string, w: ApiWindow, band: BandKey): string {
  return `/api/v1/teams?${search(league, w, band)}`;
}

export function fetchTeams(
  league: string,
  w: ApiWindow,
  band: BandKey,
  opts: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<TeamsV1> {
  return get<TeamsV1>(teamsUrl(league, w, band), opts);
}
```

Add `sources: Record<string, number>` to `MetaSummaryV1` and mark `teams` deprecated there too,
matching the worker.

- [ ] **Step 6: Rename the window key in route.ts**

```ts
export type WindowKey = 'meta' | '30' | '7';
export const WINDOWS: readonly WindowKey[] = ['meta', '30', '7'];
export const DEFAULT_QUERY: Query = { w: 'meta', band: 'all' };

/** The window key was `season` before meta epochs existed. An old link keeps working. */
const LEGACY_WINDOWS: Record<string, WindowKey> = { season: 'meta' };

function readQuery(search: string): Query {
  const p = new URLSearchParams(search);
  const raw = p.get('w') ?? '';
  const w = WINDOWS.includes(raw as WindowKey)
    ? (raw as WindowKey)
    : (LEGACY_WINDOWS[raw] ?? DEFAULT_QUERY.w);
  const band = p.get('band');
  return { w, band: BANDS.includes(band as BandKey) ? (band as BandKey) : DEFAULT_QUERY.band };
}
```

- [ ] **Step 7: Add the hooks**

In `apps/meta/src/useMeta.ts`:

```ts
export function useEpochs(deps?: Deps): Loaded<Epoch[]> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(() => loadEpochs(fetcher), [fetcher]);
}

export function useTeams(
  league: string,
  w: ApiWindow,
  band: BandKey,
  deps?: Deps,
): Loaded<TeamsV1> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(
    (signal) => {
      const opts: { signal: AbortSignal; fetcher?: typeof fetch } = { signal };
      if (fetcher) {
        opts.fetcher = fetcher;
      }
      return fetchTeams(league, w, band, opts);
    },
    [league, w.since, w.until, band, fetcher],
  );
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --project meta && npm run typecheck`
Expected: PASS. `App.tsx` will need `resolveWindow`'s new context argument and the window label
map key renamed from `season` to `meta`; make those two edits now so the suite compiles, and leave
the rest of `App.tsx` to Task 11. The stubs under `apps/meta/test/stubs` need an `/epochs.json`
answer and an `/api/v1/teams` answer; add both.

- [ ] **Step 9: Commit**

```bash
git add apps/meta/src/epochs.ts apps/meta/src/api.ts apps/meta/src/route.ts apps/meta/src/useMeta.ts apps/meta/src/App.tsx apps/meta/test/epochs.test.ts apps/meta/test/api.test.ts apps/meta/test/route.test.ts apps/meta/test/stubs
git commit -m "meta: the default window is this meta, not this season"
```

---

## Task 10: The blend replaces the threshold

The heart of it. `rank.ts` stops flipping and starts blending; `teamRank.ts` is new and builds the
board. Read the spec's "The blend" section, all three subsections, before writing a line.

The flip being removed, in one sentence: PvPoke's curated list used to lead until 300 counted
battles and 5 devices, then the measured list took over wholesale, so at 299 battles the measured
data was worth nothing and at 301 it was worth everything, and neither was ever true.

**Files:**
- Modify: `apps/meta/src/rank.ts`
- Create: `apps/meta/src/teamRank.ts`, `apps/meta/src/slice.ts`
- Test: `apps/meta/test/rank.test.ts` (rewritten), `apps/meta/test/teamRank.test.ts` (new),
  `apps/meta/test/slice.test.ts` (new)

**Interfaces:**
- Consumes: `blendWeights`, `facingWeight`, `MatrixView`, `bestStrength`, `strengthContext`,
  `expectedWinRate`, `blendShare` from `@pickthree/engine/meta`; `MetaSummaryV1`, `TeamsV1`,
  `TeamRowV1` from `./api.js`; `Baseline` from `./baseline.js`; `confidence`, `trendPoints` from
  `./stats.js`.
- Produces, for Tasks 12 to 14:

```ts
// rank.ts
/** Counted battles at which measured play earns half the say. Was the gate; is now the curve. */
export const HALF_SAY_BATTLES = 300;
/** Contributing devices at which measured play earns half the say. Same history. */
export const HALF_SAY_DEVICES = 5;
/** A species is listed once it is either ranked by PvPoke or faced at least this often. */
export const LISTED_MIN = 1;

/** How much of the say measured play has earned: the smaller of the two curves. */
export function measuredSay(battles: number, devices: number): number;

export interface SpeciesRow {
  speciesId: string;
  /** Position in the blended list, 1 based. */
  rank: number;
  /** Blended weight, 0 to 1, normalised over the list. The sort key. */
  weight: number;
  /** PvPoke's overall rank, or null when PvPoke does not rank it: the "new" marker. */
  pvpokeRank: number | null;
  /** True when PvPoke's curated meta group lists it. */
  inMetaGroup: boolean;
  sightings: number;
  /** Share of counted battles, 0 to 1, or null when nothing was counted. */
  share: number | null;
  wins: number;
  losses: number;
  decided: number;
  confidence: Confidence;
  trend: number | null;
  /** 0 to 100, relative to the heaviest row. */
  barPct: number;
}

export interface SpeciesRanking {
  /** `a`, 0 to 1: how much of the say measured play has earned. */
  say: number;
  battles: number;
  devices: number;
  rows: SpeciesRow[];
  /** The same weights, by species id, for the team projections. */
  weights: Map<string, number>;
  pvpokeCommit: string;
  pvpokeDate: string;
}

export function rankSpecies(
  meta: MetaSummaryV1,
  baseline: Baseline,
  ranks: readonly string[],
): SpeciesRanking;

// teamRank.ts
/** Decided battles at which a team's own record and its projection split the say evenly. */
export const TEAM_HALF_SAY = 30;
/** Below this many decided battles a team's record has no say at all. */
export const TEAM_MIN = 15;

export type RowSource = 'generated' | 'observed';

export interface BoardRow {
  /** Sorted species ids, for identity. Two for a core, three for a team. */
  species: string[];
  /** Lead, switch, closer, when a projection could be computed. */
  order: string[] | null;
  kind: 'core' | 'team';
  source: RowSource;
  /** simStrength, 0 to 100, or null when a member is outside the slice. */
  strength: number | null;
  /** expectedWinRate(strength), 0 to 1, or null. Never printed as a win rate. */
  projection: number | null;
  /** Members with no matrix row, which is why there is no projection. */
  outsideSlice: string[];
  /** Share of the blended facing weight the projection could speak for, 0 to 1. */
  weightCovered: number;
  runBattles: number;
  runWins: number;
  runLosses: number;
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  /** Total decided battles, run and faced together. */
  decided: number;
  /** Wins over decided, or null. The one number that may be printed as a win rate. */
  measured: number | null;
  /** `a` for this row, from its own decided battles. */
  say: number;
  /** The sort key, 0 to 1. Blended; never printed as a win rate. */
  score: number | null;
  moves: (MovesetStats | null)[];
  /** Complete teams built on this core, best first. Empty on a team row. */
  builds: BoardRow[];
}

export interface Board {
  rows: BoardRow[];
  /** True when the slice was not available, so nothing carries a projection. */
  projectionless: boolean;
}

export function buildBoard(input: {
  teams: TeamsV1;
  ranking: SpeciesRanking;
  generated: readonly GeneratedTeamLite[];
  view: MatrixView | null;
  limit?: number;
}): Board;

// slice.ts
export interface Slice {
  league: string;
  pvpokeCommit: string;
  view: MatrixView;
}
export function loadSlice(league: string, fetcher?: typeof fetch): Promise<Slice>;
export function loadRanks(league: string, fetcher?: typeof fetch): Promise<string[]>;
export function loadGenerated(league: string, fetcher?: typeof fetch): Promise<GeneratedFile>;
export function resetSlices(): void;
```

### The three blends, written out

```
species   a = min(battles / (battles + 300), devices / (devices + 5))
          weight = (1 - a) * pvpokePrior + a * measuredShare

team      a = decided / (decided + 30), and 0 below 15 decided
          score = (1 - a) * expectedWinRate(simStrength) + a * measuredWinRate

core      the same formula, with the prior averaged over the third members actually seen
          alongside it, or over PvPoke's meta group weighted by the blended species weights when
          the pair has never been seen complete
```

`pvpokePrior` is `facingWeight(rank)`, the `1 / sqrt(rank)` already in `gamedata/metaRank.ts`,
normalised over the list, with **unranked species taking prior 0** rather than the rank-64 floor.
The floor is right for pick3 on device, where it stops an unranked opponent vanishing; here it
would seat a never-listed species above genuinely listed ones near rank 64. Prior 0 is also the
"new to the meta" marker: it is a fact about the row, not a badge we grant.

**Units.** The spec's team formula mixes a 0 to 100 battle score with a 0 to 1 win rate. This is
what `expectedWinRate` is for, and it is the reason the spec asks for the calibration to live in
one named function with one constant: it is what puts both sides of the blend on one scale. The
result is a ranking number, and because it contains a projection it is never printed as a win
rate. Cards print the measured record as a win rate and the projection as a projection, and the
blended score is the sort key.

- [ ] **Step 1: Write the failing species tests**

Rewrite `apps/meta/test/rank.test.ts` around the blend:

```ts
import { describe, expect, it } from 'vitest';
import { HALF_SAY_BATTLES, HALF_SAY_DEVICES, measuredSay, rankSpecies } from '../src/rank.js';
import type { Baseline } from '../src/baseline.js';
import type { MetaSummaryV1, SpeciesStats } from '../src/api.js';

/** PvPoke's overall order for the fixture: azumarill 1, medicham 2, registeel 3, lanturn 4. */
const RANKS = ['azumarill', 'medicham', 'registeel', 'lanturn'];

function baseline(ids: string[]): Baseline {
  const species = ids.map((speciesId, i) => ({
    speciesId,
    score: 100 - i,
    rating: 500,
    fastMove: 'F',
    chargedMoves: ['C'],
    fastUsage: [],
    chargedUsage: [],
  }));
  return {
    league: 'great',
    pvpokeCommit: 'abc123',
    pvpokeDate: '2026-09-10',
    species,
    byId: new Map(species.map((s) => [s.speciesId, s])),
  };
}

function stats(over: Partial<SpeciesStats> & { speciesId: string }): SpeciesStats {
  return { sightings: 0, wins: 0, losses: 0, runs: 0, runWins: 0, runLosses: 0, ...over };
}

function summary(over: Partial<MetaSummaryV1> = {}): MetaSummaryV1 {
  return {
    league: 'great',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-30T00:00:00.000Z',
    band: 'all',
    battles: 0,
    tanked: 0,
    devices: 0,
    bands: {},
    sources: {},
    species: [],
    teams: [],
    previous: null,
    generatedAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

describe('measuredSay', () => {
  it('gives measured play no say at all with nothing behind it', () => {
    expect(measuredSay(0, 0)).toBe(0);
  });

  it('gives it half the say at the old battle threshold, with devices to match', () => {
    expect(measuredSay(HALF_SAY_BATTLES, 1000)).toBeCloseTo(0.5, 10);
  });

  it('holds one grinder to a sixth, however many battles they log', () => {
    // 900 battles is three quarters on its own; one device caps it at 1 / (1 + 5).
    expect(measuredSay(900, 1)).toBeCloseTo(1 / 6, 10);
    expect(measuredSay(100_000, 1)).toBeCloseTo(1 / 6, 10);
  });

  it('is the smaller of the two curves, whichever that is', () => {
    expect(measuredSay(30, 100)).toBeCloseTo(30 / 330, 10);
    expect(measuredSay(100_000, HALF_SAY_DEVICES)).toBeCloseTo(0.5, 10);
  });

  it('never flips: it moves a little for every battle', () => {
    expect(measuredSay(299, 50)).toBeLessThan(measuredSay(301, 50));
    expect(measuredSay(301, 50) - measuredSay(299, 50)).toBeLessThan(0.01);
  });
});

describe('rankSpecies with no measured play at all', () => {
  it('is PvPoke's list, in PvPoke's order, with nothing fabricated', () => {
    const r = rankSpecies(summary(), baseline(RANKS), RANKS);
    expect(r.say).toBe(0);
    expect(r.rows.map((x) => x.speciesId)).toEqual(RANKS);
    expect(r.rows[0]?.sightings).toBe(0);
    expect(r.rows[0]?.share).toBeNull();
    // 1/sqrt(1) normalised over 1 + 1/sqrt(2) + 1/sqrt(3) + 1/sqrt(4).
    const total = 1 + 1 / Math.SQRT2 + 1 / Math.sqrt(3) + 0.5;
    expect(r.rows[0]?.weight).toBeCloseTo(1 / total, 10);
  });
});

describe('rankSpecies as measured play arrives', () => {
  it('moves the list a little at a time rather than flipping', () => {
    const measured = [stats({ speciesId: 'lanturn', sightings: 60, wins: 30, losses: 30 })];
    const thin = rankSpecies(summary({ battles: 60, devices: 3, species: measured }), baseline(RANKS), RANKS);
    const thick = rankSpecies(
      summary({ battles: 600, devices: 12, species: [stats({ speciesId: 'lanturn', sightings: 600, wins: 300, losses: 300 })] }),
      baseline(RANKS),
      RANKS,
    );
    const at = (r: typeof thin, id: string) => r.rows.findIndex((x) => x.speciesId === id);
    // lanturn is PvPoke's number four and is the only thing anyone actually faced.
    expect(at(thin, 'lanturn')).toBeGreaterThan(0);
    expect(at(thick, 'lanturn')).toBe(0);
    expect(thin.say).toBeLessThan(thick.say);
  });

  it('lists a species PvPoke does not rank, on its measured record alone', () => {
    const r = rankSpecies(
      summary({
        battles: 300,
        devices: 5,
        species: [stats({ speciesId: 'surprise', sightings: 150, wins: 60, losses: 90 })],
      }),
      baseline(RANKS),
      RANKS,
    );
    const row = r.rows.find((x) => x.speciesId === 'surprise');
    expect(row).toBeDefined();
    expect(row?.pvpokeRank).toBeNull();
    expect(row?.inMetaGroup).toBe(false);
    expect(row?.decided).toBe(150);
  });

  it('gives an unranked species prior 0, so it never outranks a listed one for free', () => {
    // Faced once in 300 battles. Its measured share is tiny and its prior is nothing at all, so
    // it must sit below PvPoke's number 64 equivalent rather than above it.
    const r = rankSpecies(
      summary({ battles: 300, devices: 5, species: [stats({ speciesId: 'surprise', sightings: 1 })] }),
      baseline(RANKS),
      RANKS,
    );
    const surprise = r.rows.find((x) => x.speciesId === 'surprise');
    const lanturn = r.rows.find((x) => x.speciesId === 'lanturn');
    expect(surprise?.weight).toBeLessThan(lanturn?.weight ?? 0);
  });

  it('ranks a measured species PvPoke ranks but does not curate, on its real rank', () => {
    // 'lanturn' is in RANKS at position 4 but not in this baseline's curated group.
    const r = rankSpecies(
      summary({ battles: 300, devices: 5, species: [stats({ speciesId: 'lanturn', sightings: 30 })] }),
      baseline(['azumarill', 'medicham', 'registeel']),
      RANKS,
    );
    const row = r.rows.find((x) => x.speciesId === 'lanturn');
    expect(row?.pvpokeRank).toBe(4);
    expect(row?.inMetaGroup).toBe(false);
    expect(row?.weight).toBeGreaterThan(0);
  });

  it('keeps the weights summing to one so a screen can print a share', () => {
    const r = rankSpecies(
      summary({ battles: 480, devices: 9, species: [stats({ speciesId: 'medicham', sightings: 200 })] }),
      baseline(RANKS),
      RANKS,
    );
    const total = r.rows.reduce((a, x) => a + x.weight, 0);
    expect(total).toBeCloseTo(1, 8);
  });

  it('reports the say so a header can say how measured the ranking is', () => {
    const r = rankSpecies(summary({ battles: 480, devices: 9 }), baseline(RANKS), RANKS);
    expect(Math.round(r.say * 100)).toBe(Math.round(measuredSay(480, 9) * 100));
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project meta apps/meta/test/rank.test.ts`
Expected: FAIL. `measuredSay` and `rankSpecies` do not exist.

- [ ] **Step 3: Rewrite rank.ts**

```ts
/**
 * One ranked list, blended continuously from PvPoke's curated prior and from measured play.
 *
 * What this replaces: the list used to FLIP. PvPoke's group led until 300 counted battles and 5
 * devices, then the measured list took over wholesale, so at 299 battles the measured data was
 * worth nothing and at 301 it was worth everything, and neither was ever true. The threshold did
 * not move, it dissolved: the numbers it used to gate on are the half-say points of the curve.
 *
 *   a      = min(battles / (battles + 300), devices / (devices + 5))
 *   weight = (1 - a) * pvpokePrior + a * measuredShare
 *
 * The device term is not decoration. One person with 900 battles and no company is held to a
 * sixth of the say until other devices appear, which is the same thing MEASURED_MIN_DEVICES was
 * protecting against, expressed as a slope.
 *
 * Unranked species take prior 0, not facingWeight's rank-64 floor. A species PvPoke does not rank
 * only appears here because it was measured, so it rides entirely on how often it was faced.
 * Prior 0 is also the "new to the meta" marker: a fact about the row, not a badge we grant.
 */
import { blendWeights } from '@pickthree/engine/meta';
import type { MetaSummaryV1, SpeciesStats } from './api.js';
import type { Baseline } from './baseline.js';
import { type Confidence, confidence, trendPoints } from './stats.js';

export const HALF_SAY_BATTLES = 300;
export const HALF_SAY_DEVICES = 5;
/** A species is listed once PvPoke ranks it or it was faced at least this often. */
export const LISTED_MIN = 1;

export function measuredSay(battles: number, devices: number): number {
  const byBattles = battles <= 0 ? 0 : battles / (battles + HALF_SAY_BATTLES);
  const byDevices = devices <= 0 ? 0 : devices / (devices + HALF_SAY_DEVICES);
  return Math.min(byBattles, byDevices);
}

export interface SpeciesRow {
  speciesId: string;
  rank: number;
  weight: number;
  pvpokeRank: number | null;
  inMetaGroup: boolean;
  sightings: number;
  share: number | null;
  wins: number;
  losses: number;
  decided: number;
  confidence: Confidence;
  trend: number | null;
  barPct: number;
}

export interface SpeciesRanking {
  say: number;
  battles: number;
  devices: number;
  rows: SpeciesRow[];
  weights: Map<string, number>;
  pvpokeCommit: string;
  pvpokeDate: string;
}

export function rankSpecies(
  meta: MetaSummaryV1,
  baseline: Baseline,
  ranks: readonly string[],
): SpeciesRanking {
  const say = measuredSay(meta.battles, meta.devices);
  const rankOf = new Map<string, number>();
  ranks.forEach((id, i) => {
    if (!rankOf.has(id)) {
      rankOf.set(id, i + 1);
    }
  });

  const seen = new Map<string, SpeciesStats>(meta.species.map((s) => [s.speciesId, s]));
  // The list is PvPoke's curated group plus everything anyone actually faced. A species PvPoke
  // ranks but nobody curated or faced is not part of what this league is facing, so it is not
  // a row; its rank is still used the moment it is faced.
  const ids: string[] = [];
  const add = (id: string): void => {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  };
  for (const s of baseline.species) {
    add(s.speciesId);
  }
  for (const s of meta.species) {
    if (s.sightings >= LISTED_MIN) {
      add(s.speciesId);
    }
  }

  const weights = blendWeights(
    {
      species: ids,
      ranks: new Map(ids.map((id) => [id, rankOf.get(id) ?? null])),
      sightings: new Map(ids.map((id) => [id, seen.get(id)?.sightings ?? 0])),
      battles: meta.battles,
    },
    // minBattles 0 because the curve already handles a small sample: there is no floor to fall
    // off. share because blendShare cannot express the device cap on its own.
    { minBattles: 0, halfLife: HALF_SAY_BATTLES, share: say, unrankedPrior: 0 },
  );

  const prev = meta.previous;
  const prevById = new Map((prev?.species ?? []).map((s) => [s.speciesId, s.sightings]));
  const inGroup = new Set(baseline.species.map((s) => s.speciesId));

  const sorted = [...ids].sort(
    (a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || a.localeCompare(b),
  );
  const heaviest = weights.get(sorted[0] ?? '') ?? 0;

  const rows: SpeciesRow[] = sorted.map((speciesId, i) => {
    const s = seen.get(speciesId);
    const sightings = s?.sightings ?? 0;
    const wins = s?.wins ?? 0;
    const losses = s?.losses ?? 0;
    const decided = wins + losses;
    const weight = weights.get(speciesId) ?? 0;
    return {
      speciesId,
      rank: i + 1,
      weight,
      pvpokeRank: rankOf.get(speciesId) ?? null,
      inMetaGroup: inGroup.has(speciesId),
      sightings,
      // A share of nothing is not zero, it is nothing. A screen must print a count instead.
      share: meta.battles > 0 ? sightings / meta.battles : null,
      wins,
      losses,
      decided,
      confidence: confidence(decided),
      trend: prev ? trendPoints(sightings, meta.battles, prevById.get(speciesId) ?? 0, prev.battles) : null,
      barPct: heaviest > 0 ? Math.round((weight / heaviest) * 100) : 0,
    };
  });

  return {
    say,
    battles: meta.battles,
    devices: meta.devices,
    rows,
    weights,
    pvpokeCommit: baseline.pvpokeCommit,
    pvpokeDate: baseline.pvpokeDate,
  };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run --project meta apps/meta/test/rank.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the slice loader**

`apps/meta/src/slice.ts`:

```ts
/**
 * The per-league matchup slice and rank order, fetched lazily the way baselines already are.
 * Roughly the top 250 species by PvPoke rank, measured at 61 KB gzipped for Great League, which
 * is what lets the browser project a team with no simulator.
 *
 * A team or core with ANY member outside the slice gets no projection, rather than a partial one
 * computed from the members that happen to be covered: a projection missing a member is not a
 * weaker projection, it is a wrong one.
 */
import { MatrixView, type MatchupMatrix } from '@pickthree/engine/meta';

export interface GeneratedTeamLite {
  species: [string, string, string];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  structure: 'ABB' | 'ABC';
  exposure: string[];
}

export interface GeneratedFile {
  league: string;
  source: 'generated';
  pvpokeCommit: string;
  pvpokeDate: string;
  projectionSlope: number;
  teams: GeneratedTeamLite[];
}

export interface Slice {
  league: string;
  pvpokeCommit: string;
  view: MatrixView;
}

interface SliceFile {
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  matrix: MatchupMatrix;
}

interface RanksFile {
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  order: string[];
}

const slices = new Map<string, Promise<Slice>>();
const ranks = new Map<string, Promise<string[]>>();
const generated = new Map<string, Promise<GeneratedFile>>();

function once<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  make: () => Promise<T>,
): Promise<T> {
  const held = cache.get(key);
  if (held) {
    return held;
  }
  const pending = make().catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, pending);
  return pending;
}

async function json<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`Could not load ${url} (${res.status})`);
  }
  return (await res.json()) as T;
}

export function loadSlice(league: string, fetcher: typeof fetch = fetch): Promise<Slice> {
  return once(slices, league, async () => {
    const file = await json<SliceFile>(`/matrix/${league}.json`, fetcher);
    return { league: file.league, pvpokeCommit: file.pvpokeCommit, view: new MatrixView(file.matrix) };
  });
}

export function loadRanks(league: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  return once(ranks, league, async () => (await json<RanksFile>(`/ranks/${league}.json`, fetcher)).order);
}

export function loadGenerated(league: string, fetcher: typeof fetch = fetch): Promise<GeneratedFile> {
  return once(generated, league, () =>
    json<GeneratedFile>(`/baseline/${league}-teams.json`, fetcher),
  );
}

/** Tests only: forget the memoised loads so the next call uses a fresh stub. */
export function resetSlices(): void {
  slices.clear();
  ranks.clear();
  generated.clear();
}
```

`apps/meta/test/slice.test.ts` covers the three loaders the way `baseline.test.ts` covers its
one: a stub fetcher, a memoisation check, a check that a failed load is not cached, and a check
that `loadSlice` returns a `MatrixView` whose `rowOf` finds a baked id.

- [ ] **Step 6: Write the failing board tests**

`apps/meta/test/teamRank.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MatrixView, type MatchupMatrix } from '@pickthree/engine/meta';
import { TEAM_HALF_SAY, TEAM_MIN, buildBoard } from '../src/teamRank.js';
import type { SpeciesRanking } from '../src/rank.js';
import type { TeamRowV1, TeamsV1 } from '../src/api.js';
import type { GeneratedTeamLite } from '../src/slice.js';

/** Six candidates, three opponents. a and b win everything, the rest lose everything. */
function view(): MatrixView {
  const candidates = ['a', 'b', 'c', 'd', 'e', 'f'];
  const opponents = ['x', 'y', 'z'];
  const scenarios = [
    { shields: [0, 0] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [1, 1] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [2, 2] as [number, number], energy: [0, 0] as [number, number] },
  ];
  const ratings: number[] = [];
  candidates.forEach((id) => {
    opponents.forEach(() => {
      scenarios.forEach(() => {
        ratings.push(id === 'a' || id === 'b' ? 700 : 200);
      });
    });
  });
  const m: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios,
    candidates,
    opponents,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings,
  };
  return new MatrixView(m);
}

const ranking: SpeciesRanking = {
  say: 0.5,
  battles: 300,
  devices: 5,
  rows: [],
  weights: new Map([
    ['x', 0.5],
    ['y', 0.3],
    ['z', 0.2],
  ]),
  pvpokeCommit: 'abc123',
  pvpokeDate: '2026-09-10',
};

function teamRow(over: Partial<TeamRowV1> & { species: string[] }): TeamRowV1 {
  return {
    kind: over.species.length === 2 ? 'core' : 'team',
    runBattles: 0,
    runWins: 0,
    runLosses: 0,
    facedBattles: 0,
    facedWins: 0,
    facedLosses: 0,
    moves: over.species.map(() => null),
    thirds: [],
    ...over,
  } as TeamRowV1;
}

function teams(over: Partial<TeamsV1> = {}): TeamsV1 {
  return {
    league: 'great',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-30T00:00:00.000Z',
    band: 'all',
    battles: 300,
    devices: 5,
    sources: { ladder: 300 },
    teams: [],
    cores: [],
    generatedAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

const GENERATED: GeneratedTeamLite[] = [
  {
    species: ['a', 'b', 'c'],
    strength: 90,
    coverage: 100,
    consistency: 100,
    safety: 100,
    structure: 'ABC',
    exposure: [],
  },
];

describe('buildBoard, cold start', () => {
  it('shows generated teams when nothing has been observed, on their projection alone', () => {
    const b = buildBoard({ teams: teams(), ranking, generated: GENERATED, view: view() });
    expect(b.rows).toHaveLength(1);
    const row = b.rows[0];
    expect(row?.source).toBe('generated');
    expect(row?.kind).toBe('team');
    expect(row?.say).toBe(0);
    expect(row?.decided).toBe(0);
    expect(row?.measured).toBeNull();
    expect(row?.projection).toBeGreaterThan(0.5);
    expect(row?.score).toBe(row?.projection);
  });

  it('recomputes a generated team against the blended weights, not the baked ones', () => {
    // The baked strength is 90; a and b beat everything here, so the recomputed one is 100.
    const b = buildBoard({ teams: teams(), ranking, generated: GENERATED, view: view() });
    expect(b.rows[0]?.strength).toBeGreaterThan(90);
  });

  it('carries the baked strength when the slice could not be loaded, and says so', () => {
    const b = buildBoard({ teams: teams(), ranking, generated: GENERATED, view: null });
    expect(b.projectionless).toBe(true);
    expect(b.rows[0]?.strength).toBe(90);
    expect(b.rows[0]?.order).toBeNull();
  });
});

describe('buildBoard, observed rows', () => {
  it('ranks a 5-0 team on its projection alone: it cannot take the top on five battles', () => {
    const hot = teamRow({ species: ['d', 'e', 'f'], runBattles: 5, runWins: 5 });
    const b = buildBoard({
      teams: teams({ teams: [hot] }),
      ranking,
      generated: GENERATED,
      view: view(),
    });
    const row = b.rows.find((r) => r.species.join('+') === 'd+e+f');
    expect(row?.decided).toBe(5);
    expect(row?.measured).toBe(1);
    // Below TEAM_MIN, so the record has no say at all.
    expect(row?.say).toBe(0);
    expect(row?.score).toBe(row?.projection);
    // d, e and f lose everything, so a perfect five battles must not outrank a strong projection.
    expect(b.rows[0]?.source).toBe('generated');
  });

  it('splits the say evenly at 30 decided battles', () => {
    const t = teamRow({ species: ['d', 'e', 'f'], runBattles: 30, runWins: 30 });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.say).toBeCloseTo(TEAM_HALF_SAY / (TEAM_HALF_SAY + TEAM_HALF_SAY), 10);
    expect(row?.score).toBeCloseTo(0.5 * (row?.projection ?? 0) + 0.5 * 1, 10);
  });

  it('lets a long record simply win', () => {
    const t = teamRow({ species: ['d', 'e', 'f'], runBattles: 600, runWins: 540, runLosses: 60 });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: GENERATED, view: view() });
    expect(b.rows[0]?.species.join('+')).toBe('d+e+f');
    expect(b.rows[0]?.say).toBeGreaterThan(0.9);
  });

  it('adds run and faced records together for the say, keeping the counts apart', () => {
    const t = teamRow({
      species: ['d', 'e', 'f'],
      runBattles: 10,
      runWins: 8,
      runLosses: 2,
      facedBattles: 10,
      facedWins: 2,
      facedLosses: 8,
    });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.runBattles).toBe(10);
    expect(row?.facedBattles).toBe(10);
    expect(row?.decided).toBe(20);
    expect(row?.measured).toBeCloseTo(0.5, 10);
  });
});

describe('buildBoard, cores', () => {
  it('projects a core by averaging over the third members it was actually seen with', () => {
    const core = teamRow({
      species: ['a', 'b'],
      facedBattles: 20,
      facedWins: 10,
      facedLosses: 10,
      thirds: [
        { speciesId: 'c', sightings: 15 },
        { speciesId: 'd', sightings: 5 },
      ],
    });
    const b = buildBoard({ teams: teams({ cores: [core] }), ranking, generated: [], view: view() });
    const row = b.rows.find((r) => r.kind === 'core');
    expect(row?.projection).not.toBeNull();
    // a + b carry the team whatever the third is, so the average sits high but under a perfect
    // complete team: the point of the averaging.
    expect(row?.strength).toBeGreaterThan(50);
  });

  it('falls back to PvPoke's group, weighted, for a pair never seen complete', () => {
    const core = teamRow({ species: ['a', 'b'], facedBattles: 4, facedWins: 2, facedLosses: 2 });
    const b = buildBoard({ teams: teams({ cores: [core] }), ranking, generated: [], view: view() });
    // Every opponent has a matrix row in this fixture, so there is always something to average.
    expect(b.rows[0]?.projection).not.toBeNull();
  });

  it('nests a complete team under every core it was seen with', () => {
    const core1 = teamRow({ species: ['a', 'b'], facedBattles: 10, facedWins: 6, facedLosses: 4 });
    const core2 = teamRow({ species: ['a', 'c'], facedBattles: 10, facedWins: 6, facedLosses: 4 });
    const team = teamRow({ species: ['a', 'b', 'c'], facedBattles: 10, facedWins: 6, facedLosses: 4 });
    const b = buildBoard({
      teams: teams({ cores: [core1, core2], teams: [team] }),
      ranking,
      generated: [],
      view: view(),
    });
    for (const row of b.rows.filter((r) => r.kind === 'core')) {
      expect(row.builds.map((x) => x.species.join('+'))).toContain('a+b+c');
    }
    // The complete team is nested, not repeated at the top level.
    expect(b.rows.filter((r) => r.kind === 'team' && r.source === 'observed')).toHaveLength(0);
  });

  it('nests a generated team under an observed core it matches, rather than repeating it', () => {
    const core = teamRow({ species: ['a', 'b'], facedBattles: 10, facedWins: 5, facedLosses: 5 });
    const b = buildBoard({
      teams: teams({ cores: [core] }),
      ranking,
      generated: GENERATED,
      view: view(),
    });
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]?.kind).toBe('core');
    expect(b.rows[0]?.builds.map((x) => x.source)).toContain('generated');
  });
});

describe('buildBoard, outside the slice', () => {
  it('gives no projection at all when any member has no matrix row', () => {
    const t = teamRow({ species: ['a', 'b', 'stranger'], facedBattles: 40, facedWins: 30, facedLosses: 10 });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.projection).toBeNull();
    expect(row?.strength).toBeNull();
    expect(row?.outsideSlice).toEqual(['stranger']);
    // It ranks on its measured record alone.
    expect(row?.score).toBe(row?.measured);
  });

  it('has no score at all with neither a projection nor a decided battle, and sorts last', () => {
    const scored = teamRow({ species: ['a', 'b', 'c'], facedBattles: 3, facedWins: 3 });
    const blank = teamRow({ species: ['a', 'b', 'stranger'], facedBattles: 2, facedWins: 0, facedLosses: 0 });
    const b = buildBoard({
      teams: teams({ teams: [scored, blank] }),
      ranking,
      generated: [],
      view: view(),
    });
    expect(b.rows[b.rows.length - 1]?.score).toBeNull();
  });

  it('reports how much of the facing weight a projection could speak for', () => {
    const withOutsider: SpeciesRanking = {
      ...ranking,
      weights: new Map([
        ['x', 0.25],
        ['y', 0.25],
        ['outsider', 0.5],
      ]),
    };
    const b = buildBoard({ teams: teams(), ranking: withOutsider, generated: GENERATED, view: view() });
    expect(b.rows[0]?.weightCovered).toBeCloseTo(0.5, 10);
  });
});
```

- [ ] **Step 7: Run them and watch them fail**

Run: `npx vitest run --project meta apps/meta/test/teamRank.test.ts`
Expected: FAIL, `teamRank.js` does not resolve.

- [ ] **Step 8: Write teamRank.ts**

```ts
/**
 * The team board: cores as the spine, complete teams nested under each, one sort by score.
 *
 *   a     = decided / (decided + 30), and 0 below 15 decided
 *   score = (1 - a) * expectedWinRate(simStrength) + a * measuredWinRate
 *
 * `a` comes from the row's OWN decided battles, not the league's. A team reported 5-0 is under
 * the floor, so it ranks on its projection alone and cannot take the top spot on five battles. At
 * 30 decided battles the report and the projection split it evenly. Past a few hundred the record
 * simply wins.
 *
 * A core's prior is averaged over the third members actually seen alongside it, and an average
 * sits closer to the middle by construction, so a strong complete team rises above its own core
 * and a weak one sinks below it: we know all three of the one and only two of the other. No
 * constant, no thumb on the scale. A pair never seen complete has no observed thirds to average
 * over, so it averages across PvPoke's meta group weighted by the blended species weights, which
 * is the honest reading of "the third slot could be anything a player would reasonably bring".
 *
 * `score` mixes a projection into a win rate, so it is a RANKING NUMBER and is never printed as a
 * win rate. Only `measured` may be. See the spec's "A projected number is never printed as a win
 * rate".
 */
import { bestStrength, blendShare, expectedWinRate, strengthContext, type MatrixView, type StrengthContext } from '@pickthree/engine/meta';
import type { MovesetStats, TeamRowV1, TeamsV1 } from './api.js';
import type { SpeciesRanking } from './rank.js';
import type { GeneratedTeamLite } from './slice.js';

export const TEAM_HALF_SAY = 30;
export const TEAM_MIN = 15;
/** The most top-level rows a board carries. */
export const BOARD_LIMIT = 60;
/** The most third members a core's fallback prior averages over. */
export const THIRD_SAMPLE = 48;

export type RowSource = 'generated' | 'observed';

export interface BoardRow {
  species: string[];
  order: string[] | null;
  kind: 'core' | 'team';
  source: RowSource;
  strength: number | null;
  projection: number | null;
  outsideSlice: string[];
  weightCovered: number;
  runBattles: number;
  runWins: number;
  runLosses: number;
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  decided: number;
  measured: number | null;
  say: number;
  score: number | null;
  moves: (MovesetStats | null)[];
  builds: BoardRow[];
}

export interface Board {
  rows: BoardRow[];
  projectionless: boolean;
}

interface Projection {
  strength: number | null;
  order: string[] | null;
  outside: string[];
}

/** The projection for three named species, or nothing when any of them is outside the slice. */
function projectTeam(ctx: StrengthContext | null, species: readonly string[]): Projection {
  if (!ctx) {
    return { strength: null, order: null, outside: [] };
  }
  const rows = species.map((id) => ctx.view.rowOf(id));
  const outside = species.filter((_, i) => rows[i] === null);
  // Any member outside the slice means no projection at all, rather than a partial one computed
  // from the members that happen to be covered: a projection missing a member is not a weaker
  // projection, it is a wrong one.
  if (outside.length > 0 || rows.length !== 3) {
    return { strength: null, order: null, outside };
  }
  const s = bestStrength(ctx, [rows[0] as number, rows[1] as number, rows[2] as number]);
  const byRow = new Map(rows.map((row, i) => [row as number, species[i] as string]));
  return {
    strength: s.value,
    order: s.order.map((row) => byRow.get(row) as string),
    outside: [],
  };
}

/** A core's projection: the average over the thirds it was seen with, or over PvPoke's group. */
function projectCore(
  ctx: StrengthContext | null,
  pair: readonly string[],
  thirds: readonly { speciesId: string; sightings: number }[],
  fallback: readonly string[],
): Projection {
  if (!ctx) {
    return { strength: null, order: null, outside: [] };
  }
  const outside = pair.filter((id) => ctx.view.rowOf(id) === null);
  if (outside.length > 0) {
    return { strength: null, order: null, outside };
  }
  const sample: { speciesId: string; weight: number }[] =
    thirds.length > 0
      ? thirds.map((t) => ({ speciesId: t.speciesId, weight: t.sightings }))
      : fallback
          .slice(0, THIRD_SAMPLE)
          .map((id, i) => ({ speciesId: id, weight: ctx.weights[i] ?? 0 }));

  let total = 0;
  let sum = 0;
  for (const s of sample) {
    if (ctx.view.rowOf(s.speciesId) === null || s.weight <= 0) {
      continue;
    }
    const p = projectTeam(ctx, [pair[0] as string, pair[1] as string, s.speciesId]);
    if (p.strength === null) {
      continue;
    }
    sum += p.strength * s.weight;
    total += s.weight;
  }
  if (total === 0) {
    return { strength: null, order: null, outside: [] };
  }
  return { strength: Math.round((sum / total) * 10) / 10, order: null, outside: [] };
}

function rowFrom(
  src: TeamRowV1,
  projection: Projection,
  weightCovered: number,
): BoardRow {
  const wins = src.runWins + src.facedWins;
  const losses = src.runLosses + src.facedLosses;
  const decided = wins + losses;
  const measured = decided > 0 ? wins / decided : null;
  // The row's own decided battles, not the league's: a team reported 5-0 has earned nothing yet.
  const say = measured === null ? 0 : blendShare(decided, { minBattles: TEAM_MIN, halfLife: TEAM_HALF_SAY });
  const projected = projection.strength === null ? null : expectedWinRate(projection.strength);
  return {
    species: [...src.species].sort(),
    order: projection.order,
    kind: src.kind,
    source: 'observed',
    strength: projection.strength,
    projection: projected,
    outsideSlice: projection.outside,
    weightCovered,
    runBattles: src.runBattles,
    runWins: src.runWins,
    runLosses: src.runLosses,
    facedBattles: src.facedBattles,
    facedWins: src.facedWins,
    facedLosses: src.facedLosses,
    decided,
    measured,
    say,
    score: scoreOf(projected, measured, say),
    moves: src.moves,
    builds: [],
  };
}

/** Blended when both sides exist; whichever one exists otherwise; null when neither does. */
function scoreOf(projection: number | null, measured: number | null, say: number): number | null {
  if (projection === null && measured === null) {
    return null;
  }
  if (projection === null) {
    return measured;
  }
  if (measured === null || say === 0) {
    return projection;
  }
  return (1 - say) * projection + say * measured;
}

const byScore = (a: BoardRow, b: BoardRow): number => {
  // A row with no score at all sorts last, whatever its counts.
  if (a.score === null || b.score === null) {
    return (a.score === null ? 1 : 0) - (b.score === null ? 1 : 0) ||
      b.runBattles + b.facedBattles - (a.runBattles + a.facedBattles) ||
      a.species.join('+').localeCompare(b.species.join('+'));
  }
  return b.score - a.score || a.species.join('+').localeCompare(b.species.join('+'));
};

export function buildBoard(input: {
  teams: TeamsV1;
  ranking: SpeciesRanking;
  generated: readonly GeneratedTeamLite[];
  view: MatrixView | null;
  limit?: number;
}): Board {
  const limit = input.limit ?? BOARD_LIMIT;
  const ctx = input.view ? strengthContext(input.view, input.ranking.weights) : null;
  const covered = ctx?.weightCovered ?? 0;
  const fallbackThirds = ctx ? ctx.view.opponents : [];

  const observedTeams = input.teams.teams.map((t) =>
    rowFrom(t, projectTeam(ctx, [...t.species].sort()), covered),
  );
  const observedCores = input.teams.cores.map((c) =>
    rowFrom(c, projectCore(ctx, [...c.species].sort(), c.thirds, fallbackThirds), covered),
  );

  const generatedRows: BoardRow[] = input.generated.map((g) => {
    // Recomputed against the blended weights when the slice is here: the baked strength was
    // weighted by PvPoke's prior alone, and measured play may since have said otherwise.
    const p = projectTeam(ctx, [...g.species].sort());
    const strength = p.strength ?? g.strength;
    const order = p.order ?? (ctx ? [...g.species] : null);
    return {
      species: [...g.species].sort(),
      order,
      kind: 'team',
      source: 'generated',
      strength,
      projection: expectedWinRate(strength),
      outsideSlice: p.outside,
      weightCovered: covered,
      runBattles: 0,
      runWins: 0,
      runLosses: 0,
      facedBattles: 0,
      facedWins: 0,
      facedLosses: 0,
      decided: 0,
      measured: null,
      say: 0,
      score: expectedWinRate(strength),
      moves: [null, null, null],
      builds: [],
    };
  });

  // Cores are the spine. Every complete team, observed or generated, is nested under each of its
  // pairs that is on the board. A generated team whose pairs were never seen has no core to sit
  // under, so it stands on its own: the board must not assert that a pair is played together
  // when nobody has played it.
  const coreByKey = new Map(observedCores.map((c) => [c.species.join('+'), c]));
  const orphans: BoardRow[] = [];
  for (const team of [...observedTeams, ...generatedRows]) {
    const pairs = pairsOf(team.species);
    let nested = false;
    for (const pair of pairs) {
      const core = coreByKey.get(pair.join('+'));
      if (core) {
        core.builds.push(team);
        nested = true;
      }
    }
    if (!nested) {
      orphans.push(team);
    }
  }
  for (const core of coreByKey.values()) {
    core.builds.sort(byScore);
  }

  const rows = [...coreByKey.values(), ...orphans].sort(byScore).slice(0, limit);
  return { rows, projectionless: ctx === null };
}

function pairsOf(ids: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push([ids[i] as string, ids[j] as string]);
    }
  }
  return out;
}
```

- [ ] **Step 9: Run and watch it pass**

Run: `npx vitest run --project meta apps/meta/test/teamRank.test.ts apps/meta/test/slice.test.ts`
Expected: PASS.

- [ ] **Step 10: Add the stable-ranking regression test**

The spec asks for "a stable expected ranking over seeded data, so a formula change has to be
deliberate rather than accidental". Add `apps/meta/test/board.snapshot.test.ts`: a committed
fixture of a seeded `TeamsV1` and `MetaSummaryV1` (generated once with the Task 1 script at
`--battles 500 --devices 5 --seed 1`, saved as JSON under `apps/meta/test/fixtures/`), run through
`rankSpecies` and `buildBoard`, asserting the top ten species ids and the top ten board rows by
`species.join('+')` against a written-out list. Not `toMatchSnapshot`: a written list is read in a
diff, and an accidental change has to be typed over rather than regenerated with `-u`.

- [ ] **Step 11: Commit**

```bash
git add apps/meta/src/rank.ts apps/meta/src/teamRank.ts apps/meta/src/slice.ts apps/meta/test/rank.test.ts apps/meta/test/teamRank.test.ts apps/meta/test/slice.test.ts apps/meta/test/board.snapshot.test.ts apps/meta/test/fixtures
git commit -m "meta: blend the prior with measured play, and score the team board"
```

---

## Task 11: Teams becomes the front door

A visitor's first screen stops being Pokemon ranked in a vacuum and becomes teams, the way a
decklist site works. `/<league>` is Teams, the species list moves to `/<league>/pokemon`, Teams
goes first in the tab bar, and `/<league>/teams` keeps working so existing links do not break.

**Files:**
- Modify: `apps/meta/src/route.ts`, `apps/meta/src/App.tsx`
- Rename: `apps/meta/src/screens/Overview.tsx` to `apps/meta/src/screens/Pokemon.tsx` (the screen
  body is Task 13; this task only moves it and renames the export, so the app compiles)
- Test: `apps/meta/test/route.test.ts`, `apps/meta/test/app.test.tsx`

**Interfaces:**
- Consumes: `hrefFor`, `parseLocation`, `withLeague` from `./route.js`.
- Produces, for Tasks 12 to 14:

```ts
export type View =
  | { name: 'teams'; league: string }      // the league root, /<league>
  | { name: 'pokemon'; league: string }    // /<league>/pokemon
  | { name: 'species'; league: string; speciesId: string }
  | { name: 'about' };
```

- [ ] **Step 1: Write the failing route tests**

Replace the view cases in `apps/meta/test/route.test.ts`:

```ts
const LEAGUES = ['great', 'ultra', 'master'];

describe('parseLocation', () => {
  it('lands on Teams at the league root', () => {
    expect(parseLocation('/great', '', LEAGUES).view).toEqual({ name: 'teams', league: 'great' });
  });

  it('keeps the old teams path working', () => {
    expect(parseLocation('/great/teams', '', LEAGUES).view).toEqual({
      name: 'teams',
      league: 'great',
    });
  });

  it('puts the species list at /<league>/pokemon', () => {
    expect(parseLocation('/ultra/pokemon', '', LEAGUES).view).toEqual({
      name: 'pokemon',
      league: 'ultra',
    });
  });

  it('still drills into one species', () => {
    expect(parseLocation('/great/p/azumarill', '', LEAGUES).view).toEqual({
      name: 'species',
      league: 'great',
      speciesId: 'azumarill',
    });
  });

  it('falls back to the first league's Teams for anything it does not know', () => {
    expect(parseLocation('/nonsense', '', LEAGUES).view).toEqual({ name: 'teams', league: 'great' });
  });
});

describe('hrefFor', () => {
  it('writes the league root for Teams, so the old path canonicalises away', () => {
    expect(hrefFor({ name: 'teams', league: 'great' }, DEFAULT_QUERY)).toBe('/great');
    expect(hrefFor({ name: 'pokemon', league: 'great' }, DEFAULT_QUERY)).toBe('/great/pokemon');
  });

  it('round trips every view through a parse', () => {
    const views: View[] = [
      { name: 'teams', league: 'ultra' },
      { name: 'pokemon', league: 'ultra' },
      { name: 'species', league: 'ultra', speciesId: 'swampert' },
      { name: 'about' },
    ];
    for (const view of views) {
      const href = hrefFor(view, DEFAULT_QUERY);
      const [path, search] = href.split('?');
      expect(parseLocation(path ?? '/', search ? `?${search}` : '', LEAGUES).view).toEqual(view);
    }
  });
});

describe('withLeague', () => {
  it('keeps you on the screen you were on', () => {
    expect(withLeague({ name: 'pokemon', league: 'great' }, 'ultra')).toEqual({
      name: 'pokemon',
      league: 'ultra',
    });
    expect(withLeague({ name: 'teams', league: 'great' }, 'ultra')).toEqual({
      name: 'teams',
      league: 'ultra',
    });
  });

  it('sends a species drill-down back to the list, since a species belongs to its league', () => {
    expect(withLeague({ name: 'species', league: 'great', speciesId: 'azumarill' }, 'ultra')).toEqual(
      { name: 'pokemon', league: 'ultra' },
    );
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project meta apps/meta/test/route.test.ts`
Expected: FAIL, `/great` still parses to `overview`.

- [ ] **Step 3: Rework route.ts**

```ts
export type View =
  | { name: 'teams'; league: string }
  | { name: 'pokemon'; league: string }
  | { name: 'species'; league: string; speciesId: string }
  | { name: 'about' };

export function parseLocation(
  pathname: string,
  search: string,
  leagues: readonly string[],
): { view: View; query: Query } {
  const query = readQuery(search);
  const parts = pathname.split('/').filter(Boolean);
  const first = leagues[0] ?? 'great';
  const [a, b, c] = parts;
  if (a === 'about') {
    return { view: { name: 'about' }, query };
  }
  const league = a && leagues.includes(a) ? a : first;
  if (b === 'pokemon') {
    return { view: { name: 'pokemon', league }, query };
  }
  if (b === 'p' && c && SPECIES.test(c)) {
    return { view: { name: 'species', league, speciesId: c }, query };
  }
  // Teams is the league root now. /<league>/teams still parses here, and hrefFor writes
  // /<league>, so App's canonicalise effect rewrites the old path in place rather than 404ing.
  return { view: { name: 'teams', league }, query };
}

export function hrefFor(view: View, query: Query): string {
  const path =
    view.name === 'about'
      ? '/about'
      : view.name === 'pokemon'
        ? `/${view.league}/pokemon`
        : view.name === 'species'
          ? `/${view.league}/p/${view.speciesId}`
          : `/${view.league}`;
  // ... the query serialisation below is unchanged ...
}

/** A species belongs to the league it was ranked in, so changing league goes back to the list. */
export function withLeague(view: View, league: string): View {
  if (view.name === 'about') {
    return view;
  }
  if (view.name === 'pokemon' || view.name === 'species') {
    return { name: 'pokemon', league };
  }
  return { name: 'teams', league };
}
```

- [ ] **Step 4: Move the screen and reorder the tabs**

```bash
git mv apps/meta/src/screens/Overview.tsx apps/meta/src/screens/Pokemon.tsx
git mv apps/meta/test/overview.test.tsx apps/meta/test/pokemon.test.tsx
```

Rename the exported `Overview` to `Pokemon` and update both importers (`App.tsx` and
`Teams.tsx`, which imports `Contribute` from it). In `App.tsx`:

- `TabBar`: Teams first, then Pokemon, then About. `onPokemon` becomes
  `view.name === 'pokemon' || view.name === 'species'`, `onTeams` becomes `view.name === 'teams'`.
- `renderView`: `teams` renders `Teams`, `pokemon` renders `Pokemon`, the default falls through to
  `Teams` rather than `Overview`.
- `showFilters`: `view.name === 'teams' || view.name === 'pokemon'`.
- The species `Header`'s `backHref` points at `{ name: 'pokemon', league: activeLeague }`.
- `brandRow`'s wordmark link points at `{ name: 'teams', league: activeLeague }`.
- `WINDOW_LABELS`: the `season` key becomes `meta`, with the label `This meta`.

- [ ] **Step 5: Update the app test**

In `apps/meta/test/app.test.tsx`, the cases that assert the landing screen and the tab order:

```ts
it('lands on Teams', async () => {
  window.history.replaceState(null, '', '/great');
  render(<App deps={deps} />);
  expect(await screen.findByRole('heading', { name: /teams/i })).toBeInTheDocument();
});

it('puts Teams first in the tab bar', async () => {
  window.history.replaceState(null, '', '/great');
  render(<App deps={deps} />);
  const tabs = within(await screen.findByRole('navigation', { name: 'Sections' })).getAllByRole('link');
  expect(tabs.map((t) => t.textContent)).toEqual(['Teams', 'Pokemon', 'About']);
});

it('canonicalises the old teams path to the league root', async () => {
  window.history.replaceState(null, '', '/great/teams');
  render(<App deps={deps} />);
  await screen.findByRole('heading', { name: /teams/i });
  expect(window.location.pathname).toBe('/great');
});
```

- [ ] **Step 6: Run the suite**

Run: `npx vitest run --project meta && npm run typecheck && npm run lint`
Expected: PASS and clean.

- [ ] **Step 7: Commit**

```bash
git add apps/meta/src/route.ts apps/meta/src/App.tsx apps/meta/src/screens/Pokemon.tsx apps/meta/src/screens/Teams.tsx apps/meta/test/route.test.ts apps/meta/test/app.test.tsx apps/meta/test/pokemon.test.tsx
git commit -m "meta: teams is the front door"
```

---

## Task 12: The Teams screen

Cores as the spine, complete teams nested under each, one sort by score. Every card says what it
is made of, projected or observed, run or faced, with the counts.

**Files:**
- Modify: `apps/meta/src/screens/Teams.tsx`, `apps/meta/src/App.tsx` (pass the new hooks through)
- Test: `apps/meta/test/teams.test.tsx`

### Exact copy

Copy is strict 7-bit ASCII. Every string a reader sees, written out so it is not invented twice:

| where | text |
| --- | --- |
| screen heading | `Teams` |
| header line, projections only | `Projected against PvPoke's meta group. No shared battles in this window yet.` |
| header line, blended | `<N>% measured, from <B> battles shared by <D> devices` |
| header line, one device | `<N>% measured, from <B> battles shared by 1 device` |
| coverage note, under the header, when weightCovered < 0.95 | `Projections cover the <M> Pokemon PvPoke lists, which is <P>% of what players actually faced.` |
| generated card tag | `Projected` |
| generated card line | `Projected against PvPoke's group, not yet seen in shared battles` |
| observed card, faced only | `Faced <N> times, players went <W>-<L>` |
| observed card, run only | `Run <N> times, reporters went <W>-<L>` |
| observed card, both | `Run <N> times and faced <M> times, <W>-<L> overall` |
| observed card, nothing decided | `Seen <N> times, no result recorded` |
| core card kind | `Core` |
| team card kind | `Full team` |
| core card, thirds seen | `Seen with <A>, <B> and <C>` |
| core card, never completed | `Never seen complete. Projected against any third PvPoke would expect.` |
| nested list heading | `Built as` |
| projection, on any card with one | `Projects <P>%` |
| projection caveat, always beside it | `a projection, not a win rate` |
| no projection, outside the slice | `No projection: <A> is outside PvPoke's ranked list.` |
| no projection, plural | `No projection: <A> and <B> are outside PvPoke's ranked list.` |
| no projection, slice missing | `Projections are unavailable right now. Rows are ordered by their record.` |
| empty board | `No teams shared in this window yet, and no projections could be loaded.` |
| commit mismatch banner | `This meta expects PvPoke commit <short>. The projections were built from <short>, so they may still describe the old movesets.` |
| deep link | `Open in pick3` |

`<P>%` is `Math.round(projection * 100)`. The measured win rate keeps the existing
`Math.round(rate * 100)` and its `ConfidenceTag` and `marginSentence` treatment from
`stats.ts`, unchanged.

### Rendering rules

- One `<section>`, one `h2` ("Teams"), the header line, the coverage note when it applies, then
  the rows.
- A row is a card. A core card carries its `builds` in a nested list under the "Built as" heading,
  each build a compact line rather than a full card: the three sprites, its kind tag, its own
  projection or record, and the pick3 deep link.
- Only the measured record is ever rendered with a percent sign and the word "win rate" nearby.
  The projection is rendered as `Projects <P>%` with the caveat text immediately beside it, in the
  same `.fine` line, never as a separate footnote that can be scrolled past.
- The blended `score` is NOT rendered. It is the sort key and nothing else. A reader who sees two
  numbers on a card sees the projection and the record, which are the two things that are true.
- Each card deep links into pick3 with `teamLink(league, members)`, exactly as today. A core links
  with its two members; pick3 fills the third.
- Sprites use the existing `Sprite` component and the `.slots3` layout Teams already uses; a core
  uses a two-slot variant of the same.
- `aria`: the card is one `<a>`, as today, so there is exactly one focusable element per card. A
  nested build line is its own `<a>` inside the core card's body, NOT inside the core's own anchor:
  a core card's outer element becomes a `<div>` once it has children, with its own "Open in pick3"
  link inside, because an anchor inside an anchor is invalid markup and screen readers handle it
  badly.

- [ ] **Step 1: Write the failing screen tests**

`apps/meta/test/teams.test.tsx`, replacing the current file:

```tsx
describe('Teams, cold start', () => {
  it('shows generated teams and says plainly that they are projections', async () => {
    renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    expect(await screen.findByRole('heading', { name: 'Teams' })).toBeInTheDocument();
    expect(
      screen.getByText(/Projected against PvPoke's meta group\. No shared battles/),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Projected').length).toBeGreaterThan(0);
    expect(screen.getByText(/a projection, not a win rate/)).toBeInTheDocument();
  });

  it('never prints a projection as a win rate', () => {
    renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    expect(screen.queryByText(/win rate/i)?.textContent).toMatch(/not a win rate/);
  });
});

describe('Teams, with measured play', () => {
  it('says how measured the board is', () => {
    renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: GENERATED });
    expect(screen.getByText(/% measured, from 480 battles shared by 9 devices/)).toBeInTheDocument();
  });

  it('says "1 device" rather than "1 devices"', () => {
    renderTeams({ battles: 40, devices: 1, cores: [CORE], teams: [], generated: [] });
    expect(screen.getByText(/shared by 1 device$/)).toBeInTheDocument();
  });

  it('prints a faced record as the faced team's own, not the reporters'', () => {
    renderTeams({ battles: 100, devices: 4, cores: [], teams: [FACED], generated: [] });
    expect(screen.getByText('Faced 40 times, players went 30-10')).toBeInTheDocument();
  });

  it('nests complete teams under their core', () => {
    renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    expect(screen.getByText('Built as')).toBeInTheDocument();
    expect(screen.getByText('Core')).toBeInTheDocument();
  });

  it('says when a core has never been seen complete', () => {
    renderTeams({ battles: 100, devices: 4, cores: [LONELY_CORE], teams: [], generated: [] });
    expect(screen.getByText(/Never seen complete/)).toBeInTheDocument();
  });

  it('names the members that cost a row its projection', () => {
    renderTeams({ battles: 100, devices: 4, cores: [], teams: [OUTSIDER], generated: [] });
    expect(
      screen.getByText("No projection: stranger is outside PvPoke's ranked list."),
    ).toBeInTheDocument();
  });

  it('says how much of the real facing the projections speak for', () => {
    renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE],
      teams: [],
      generated: [],
      weightCovered: 0.6,
    });
    expect(screen.getByText(/which is 60% of what players actually faced/)).toBeInTheDocument();
  });

  it('warns when the epoch expects a different PvPoke commit', () => {
    renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [], generated: [], mismatch: true });
    expect(screen.getByText(/may still describe the old movesets/)).toBeInTheDocument();
  });

  it('deep links every card into pick3', () => {
    renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    for (const link of screen.getAllByRole('link', { name: /Open in pick3/ })) {
      expect(link).toHaveAttribute('href', expect.stringContaining('https://pick3.gg/#/t/great/'));
    }
  });
});
```

`renderTeams` is a helper in the test file that assembles a `TeamsV1`, a `SpeciesRanking` and a
`MatrixView` fixture and renders `<Teams ... />` directly, the way the current `teams.test.tsx`
renders it with a stubbed `Loaded<MetaSummaryV1>`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project meta apps/meta/test/teams.test.tsx`
Expected: FAIL. The screen still renders `meta.data.teams` and the old copy.

- [ ] **Step 3: Rewrite the screen**

Follow the copy table and rendering rules above exactly. The screen takes the board rather than
building it: `App.tsx` calls `rankSpecies` and `buildBoard` once and passes `Board`,
`SpeciesRanking`, the `Epoch` and the baked commit down, so Teams and Pokemon cannot disagree
about the weights.

Wire in `App.tsx`:

```tsx
const epochs = useEpochs(deps);
const teamsData = useTeams(activeLeague, w, query.band, deps);
const slice = useSlice(activeLeague, deps);
const ranks = useRanks(activeLeague, deps);
const generated = useGenerated(activeLeague, deps);
const ranking = useMemo(
  () =>
    meta.data && baseline.data && ranks.data
      ? rankSpecies(meta.data, baseline.data, ranks.data)
      : null,
  [meta.data, baseline.data, ranks.data],
);
const board = useMemo(
  () =>
    teamsData.data && ranking
      ? buildBoard({
          teams: teamsData.data,
          ranking,
          generated: generated.data?.teams ?? [],
          view: slice.data?.view ?? null,
        })
      : null,
  [teamsData.data, ranking, generated.data, slice.data],
);
```

`useSlice`, `useRanks` and `useGenerated` are three more `useAsync` wrappers in `useMeta.ts`, in
the same shape as `useBaseline`. All are called unconditionally, on every view, to keep hook order
stable, exactly as `useSpeciesDetail` already is.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run --project meta apps/meta/test/teams.test.tsx`
Expected: PASS.

- [ ] **Step 5: Look at it against seeded data**

```bash
cd workers/counter && npx wrangler dev --port 8787 &
cd /d/Skunkworks/pickthree
node workers/counter/scripts/seed-battles.mjs --battles 500 --devices 5 --clear
npm -w @pickthree/meta run dev
```

Open `http://localhost:5174/great` with the dev proxy pointed at `http://127.0.0.1:8787` (set
`API` in `apps/meta/vite.config.ts` from an env var for this, defaulting to the deployed worker,
so the change is not a local edit that gets committed by accident). Check by eye: the board leads
with cores, generated teams are labelled, a 5-0 team is not at the top, and no card shows a
projection with the words "win rate" near it.

- [ ] **Step 6: Commit**

```bash
git add apps/meta/src/screens/Teams.tsx apps/meta/src/App.tsx apps/meta/src/useMeta.ts apps/meta/src/app.css apps/meta/vite.config.ts apps/meta/test/teams.test.tsx
git commit -m "meta: the teams board, cores as the spine"
```

---

## Task 13: The Pokemon screen

> **Carried obligation from Task 10.** Task 10 rewrote `rank.ts` around `rankSpecies` but had to
> keep the old `rank()` and its threshold constants alive under a `SUPERSEDED` banner, because
> `Overview.tsx`, `About.tsx` and `Species.tsx` still imported them. This task removes the last
> of those imports, so it must also delete the superseded block: `rank`, `MEASURED_MIN`,
> `MEASURED_MIN_DEVICES`, `RANKED_SHARE`, `SMALL_MIN`, `Ranking`, `MeasuredRow`, `BaselineRow`,
> and the matching banner and tests in `rank.test.ts`. Leaving it ships two ranking functions
> with the old flip still live in one of them, which is the single thing this whole plan exists
> to remove.


The two sections collapse into one ranked list. Each row carries its own provenance, its measured
count and share, PvPoke's rank, and the "new" marker when PvPoke does not list it. The
below-threshold banner goes away, replaced by a header line saying how measured the ranking
currently is.

**Files:**
- Modify: `apps/meta/src/screens/Pokemon.tsx`
- Test: `apps/meta/test/pokemon.test.tsx`

### Exact copy

| where | text |
| --- | --- |
| screen heading | `What you face` |
| header line, nothing measured | `PvPoke's list. No shared battles in this window yet.` |
| header line, blended | `<N>% measured, from <B> battles shared by <D> devices` |
| header line, one device | `<N>% measured, from <B> battles shared by 1 device` |
| explainer, behind a Term on the header line | `Every row blends PvPoke's ranking with what players actually faced. The more battles and the more devices, the more the measured side counts. At <HALF_SAY_BATTLES> battles it is half.` |
| row, PvPoke rank | `PvPoke #<R>` |
| row, not in PvPoke's ranked list | `New` |
| new marker explainer, behind a Term | `PvPoke does not rank this one, so its place here comes entirely from how often players faced it.` |
| row, faced count when a share can be printed | `<N> of <B> battles (<S>%)` |
| row, faced count when nothing was counted | `Not faced in this window` |
| row, record | `players went <W>-<L>` |
| row, nothing decided | `no result recorded` |
| tail of the list | `<N> more were faced once each` |
| contribute card | unchanged, the existing `Contribute` component |

### Rendering rules

- The banner that used to say "this is PvPoke's list, not measured play" is gone. It was the flip
  announcing itself. The header line carries the same honesty continuously: at 0% measured it
  says so in words.
- The bar on each row is `barPct`, which is now the blended weight relative to the heaviest row,
  not raw sightings. That is the number the list is sorted by, so it is the number the bar should
  draw.
- A row with `share === null` prints a count, never a percentage. A share of nothing is not zero.
- `TrendTag` and the existing trend gating are unchanged: a trend still needs `TREND_MIN` in both
  windows, and `trendPoints` still returns null otherwise.
- `ConfidenceTag` on the row's record is unchanged and reads the row's own `decided`.
- Every row links to `/<league>/p/<id>` as today.
- PvPoke's list is never described with a measured word. `PvPoke #<R>` is a rank, not a count.

- [ ] **Step 1: Write the failing tests**

`apps/meta/test/pokemon.test.tsx`:

```tsx
describe('Pokemon, nothing measured', () => {
  it("is PvPoke's list and says so, with no banner", () => {
    renderPokemon({ battles: 0, devices: 0, species: [] });
    expect(screen.getByText(/PvPoke's list\. No shared battles in this window yet\./)).toBeInTheDocument();
    expect(screen.queryByText(/not measured play/i)).toBeNull();
  });

  it('prints counts, never a share, when nothing was counted', () => {
    renderPokemon({ battles: 0, devices: 0, species: [] });
    expect(screen.getAllByText('Not faced in this window').length).toBeGreaterThan(0);
    expect(screen.queryByText(/%\)/)).toBeNull();
  });
});

describe('Pokemon, blended', () => {
  it('says how measured the ranking currently is', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    expect(screen.getByText(/% measured, from 480 battles shared by 9 devices/)).toBeInTheDocument();
  });

  it('marks a species PvPoke does not rank as new', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('surprise', 120, 50, 70)] });
    const row = screen.getByText('Surprise').closest('a');
    expect(within(row as HTMLElement).getByText('New')).toBeInTheDocument();
  });

  it("shows PvPoke's rank on a species it does rank", () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    expect(screen.getByText('PvPoke #1')).toBeInTheDocument();
  });

  it('prints the count and the share together', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 240, 120, 120)] });
    expect(screen.getByText('240 of 480 battles (50%)')).toBeInTheDocument();
  });

  it('never calls the reporters record a PvPoke number', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 240, 120, 120)] });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).getByText(/players went 120-120/)).toBeInTheDocument();
  });

  it('counts the long tail rather than dropping it', () => {
    renderPokemon({
      battles: 40,
      devices: 2,
      species: [faced('one', 1, 0, 1), faced('two', 1, 1, 0), faced('three', 1, 0, 0)],
      tail: 3,
    });
    expect(screen.getByText('3 more were faced once each')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project meta apps/meta/test/pokemon.test.tsx`
Expected: FAIL on the header line and the missing "New" marker.

- [ ] **Step 3: Rewrite the screen**

One list from `ranking.rows`, the copy table above, the rendering rules above. Delete the
`source === 'baseline'` branch, the banner, and the separate "every species we actually saw"
section: they were the flip's two halves and there is one list now.

The tail count: `ranking.rows.filter((r) => r.sightings === 1).length` is not the same thing the
old `tail` was, because the list no longer cuts rows. Keep the tail line only for rows the screen
chooses not to draw: cut the drawn list at the first row whose `weight` rounds to 0% of the
heaviest AND whose `sightings` is below 2, count the rest, and print the tail line. Rows PvPoke
ranks are always drawn.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run --project meta apps/meta/test/pokemon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/meta/src/screens/Pokemon.tsx apps/meta/test/pokemon.test.tsx
git commit -m "meta: one blended species list"
```

---

## Task 14: About, Species, and the pick3 nudge

About gets the real work. It has to explain the blend, what that percentage means, the epochs, and
which source each number came from. It is the backstop for every honesty claim the rest of the
site makes, so it is not a footnote task.

**Files:**
- Modify: `apps/meta/src/screens/About.tsx`, `apps/meta/src/screens/Species.tsx`,
  `apps/web/src/screens/LogBattle.tsx`
- Test: `apps/meta/test/about.test.tsx`, `apps/meta/test/species.test.tsx`,
  `apps/web/test/` (the LogBattle test, if one asserts the copy)

### Exact copy: About's new sections

Added after the existing "What one shared record contains" section, before "How to stop".

```
## How the ranking works

Two sources, one number. PvPoke keeps a curated list of what a league's meta looks like, hand
made by people who play it. We have battles players have shared from pick3. Neither is the
answer on its own, so every number here is a blend of the two.

How much the measured side counts depends on two things: how many battles have been shared, and
how many different devices shared them. At 300 counted battles the measured side has half the
say. At 5 devices it also has half the say, and the smaller of the two wins. One person sharing
900 battles is one person's matchmaking queue, so they are held to a sixth of the say until
other people show up.

Nothing flips. There is no point where the list suddenly becomes measured. Every battle shared
moves it a little, and the header on each screen says exactly how far along it is right now.

## What "projected" means

A team nobody has shared yet still gets a number, worked out from PvPoke's own matchup data: how
much of the meta the three of them beat between them, how well those wins hold up when shields
change, and whether the switch has any matchups that simply end it.

That is a projection, not a measurement, and this site never prints one as a win rate. A win
rate here always means battles that actually happened. A projection always says "projects" and
always says it is a projection.

Projections cover the Pokemon PvPoke ranks. Someone you faced who is not on that list is counted
in the measured numbers and left out of the projections, and any card that is missing a member
says so instead of guessing.

## Teams and cores

Players log up to three opponents, and most of the time they log one or two. So a pair counts as
a core: two Pokemon that were seen together, with whatever came third. A core's projection is
the average over the thirds it was actually seen with, which is why a complete team usually
scores above or below its own core rather than the same: we know all three of one and only two
of the other.

A team's record counts both sides. If you ran it, that is your result. If you faced it, that is
your result reversed: you winning means the team you faced lost that battle. Each card keeps the
two counts apart so you can see which is which.

## When the game changes

A move rebalance or a season turn can make everything before it stop describing what you face
now. When that happens we move the default window forward to the new starting point. Nothing is
deleted: the 30 day and 7 day views keep working and still count every battle in them.

The projections come from a pinned copy of PvPoke's data. If a rebalance has landed and that copy
has not caught up yet, the projections describe the old movesets while the measured numbers
already describe the new ones. When we know those two disagree, the affected screens say so.
```

Plus a line in the existing API section naming the new endpoint:

```
GET https://meta.pick3.gg/api/v1/teams?league=great&since=<iso>&until=<iso>&band=ace
```

### Species screen

One addition and one rename:

- The header gains the row's blended standing: `#<rank> of what players face` when there is any
  measured play, and `PvPoke #<R>` beside it, or the `New` marker when PvPoke does not rank it.
  Same copy as the Pokemon rows.
- Its back link points at `{ name: 'pokemon', league }`, which Task 11 already did.

### pick3's one-line change

`apps/web/src/screens/LogBattle.tsx:193` currently reads:

```
Add the opponents you saw. One or two is fine.
```

It becomes:

```
Add all three opponents when you can. One or two still helps.
```

This is the only change that improves the faced data at the source: partial sightings are ranked
as cores rather than thrown away, but a complete sighting is worth more than two partial ones,
and the copy was actively steering players away from it.

- [ ] **Step 1: Write the failing tests**

In `apps/meta/test/about.test.tsx`:

```tsx
it('explains the blend, in words, with both half-say points', () => {
  render(<About baseline={ready} />);
  expect(screen.getByText(/At 300 counted battles the measured side has half the say/)).toBeInTheDocument();
  expect(screen.getByText(/At 5 devices it also has half the say/)).toBeInTheDocument();
});

it('says plainly that nothing flips', () => {
  render(<About baseline={ready} />);
  expect(screen.getByText(/Nothing flips\./)).toBeInTheDocument();
});

it('says a projection is never printed as a win rate', () => {
  render(<About baseline={ready} />);
  expect(screen.getByText(/this site never prints one as a win rate/)).toBeInTheDocument();
});

it('explains cores and the inverted faced record', () => {
  render(<About baseline={ready} />);
  expect(screen.getByText(/a pair counts as a core/)).toBeInTheDocument();
  expect(screen.getByText(/you winning means the team you faced lost that battle/)).toBeInTheDocument();
});

it('says an epoch reset deletes nothing', () => {
  render(<About baseline={ready} />);
  expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
});

it('lists the teams endpoint', () => {
  render(<About baseline={ready} />);
  expect(screen.getByText(/\/api\/v1\/teams/)).toBeInTheDocument();
});

it('is strict 7-bit ASCII throughout', () => {
  const { container } = render(<About baseline={ready} />);
  expect(container.textContent ?? '').toMatch(/^[\x20-\x7e\s]*$/);
});
```

In `apps/web`, add to the LogBattle test:

```ts
it('asks for all three opponents', () => {
  // ... render LogBattle ...
  expect(screen.getByText('Add all three opponents when you can. One or two still helps.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project meta apps/meta/test/about.test.tsx && npx vitest run --project web`
Expected: FAIL on the missing copy.

- [ ] **Step 3: Write the copy**

Paste the sections above into `About.tsx` as JSX, interpolating `HALF_SAY_BATTLES` and
`HALF_SAY_DEVICES` from `rank.ts` rather than retyping the digits, the same rule About already
follows for its other thresholds. Change the one line in `LogBattle.tsx`.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run --project meta --project web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/meta/src/screens/About.tsx apps/meta/src/screens/Species.tsx apps/web/src/screens/LogBattle.tsx apps/meta/test/about.test.tsx apps/meta/test/species.test.tsx apps/web/test
git commit -m "meta: about explains the blend; pick3 asks for all three opponents"
```

---

## Task 15: The screens pass, the rules, and the docs

The last task: prove it renders at several seeded volumes, update the rule this work replaces, and
point the old spec at the new one.

**Files:**
- Modify: `apps/meta/scripts/screens.mjs`, `CLAUDE.md`,
  `docs/superpowers/specs/2026-09-18-meta-site-design.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: Teach the screens script the new routes and the volumes**

`apps/meta/scripts/screens.mjs` currently runs the page list twice, once against an empty summary
and once against a populated one. It gains:

- The new page list: `/great` (Teams), `/great/pokemon`, `/great/p/<id>`, `/about`.
- Stubs for `/api/v1/teams`, `/epochs.json`, `/ranks/<league>.json`, `/matrix/<league>.json` and
  `/baseline/<league>-teams.json`. The last three are real baked files, so the script serves them
  from `apps/meta/public` rather than inventing them; only the two API paths are stubbed.
- Four runs rather than two, at the volumes the spec names, each a different stubbed
  `MetaSummaryV1` and `TeamsV1`: `empty` (0 battles, 0 devices), `thin` (50 battles, 1 device),
  `mid` (500 battles, 5 devices), `thick` (5000 battles, 30 devices).

The stub bodies are generated by a small function in the script rather than written out four
times: it takes `{ battles, devices }` and produces a summary and a team board with plausible
counts derived from the real baked baseline, so the sprites resolve and the copy is exercised.

It still fails on any console error, and it still lets a failed sprite request through.

- [ ] **Step 2: Run it**

```bash
npm -w @pickthree/meta run build
npm run meta:screens
```

Expected: no console errors, and screenshots for four runs times four pages in
`apps/meta/screenshots/`. Look at all sixteen. The four that matter most:

- `empty-teams`: generated teams only, every one labelled a projection, no win rate anywhere.
- `thin-teams`: 50 battles from 1 device. The header should say roughly 14% measured, and the
  board should still be led by projections, because one device caps the say at a sixth.
- `mid-teams`: 500 battles from 5 devices, about 50% measured, observed cores mixed in.
- `thick-pokemon`: 5000 battles from 30 devices, over 90% measured, the list clearly the measured
  one, with PvPoke's ranks still shown per row.

- [ ] **Step 3: Update the rule in CLAUDE.md**

Replace the last bullet under `## Rules`:

```
- meta.pick3.gg blends PvPoke's curated list with measured play on a stated, visible weight,
  never presents a projection as a measured result, and never hides measured numbers for being
  small. The 300 and 5 constants stay in `apps/meta/src/rank.ts` as the blend's half-say points
  rather than as gates.
```

and update the `### Meta site` paragraph in `## Architecture` to describe the blend, the teams
endpoint, the matrix slice and the epochs file instead of the two-sources flip.

- [ ] **Step 4: Point the old spec at the new one**

In `docs/superpowers/specs/2026-09-18-meta-site-design.md`, replace the body of "The two sources,
and the rule that keeps them apart" with:

```
Superseded by `docs/superpowers/specs/2026-09-18-meta-ranking-design.md`. The two sources no
longer flip at a threshold; they blend continuously, and the numbers this section gated on are
the half-say points of that blend. The rule that survives: PvPoke's list is never described with
a measured word, and measured numbers are never hidden for being small.
```

Leave the rest of that spec alone. It still describes the site that was built.

- [ ] **Step 5: Add the new bake outputs to CI's cache awareness**

`ci.yml` and `counter.yml` already run `npm -w @pickthree/meta run build`, which runs the bake, so
the new files are produced wherever the old ones were. The one change: the bake now imports
`@pickthree/engine`, so confirm the `apps/meta` build step runs after `npm install` at the repo
root (it does) and that no workflow builds `apps/meta` in isolation without the workspace.

- [ ] **Step 6: The full gate**

```bash
npm run lint
npm run typecheck
npm test
npm -w @pickthree/meta run build
npm run meta:screens
npm run web:screens
```

Expected: all green. `web:screens` matters because Task 14 touched `LogBattle.tsx`.

- [ ] **Step 7: Commit**

```bash
git add apps/meta/scripts/screens.mjs CLAUDE.md docs/superpowers/specs/2026-09-18-meta-site-design.md .github/workflows/ci.yml
git commit -m "meta: screens at four seeded volumes, and the rule this replaces"
```

- [ ] **Step 8: Hand back to Travis**

Do not push. Do not deploy. Report:

- the four `meta:screens` runs and anything that looked wrong,
- the measured slice sizes from the bake,
- the manual step that remains: none for this work, the custom domain is already attached.

---

## Self-review

Run against the spec, section by section.

**Spec coverage**

| spec section | task |
| --- | --- |
| The blend, species ranking | 3, 10 |
| The blend, team ranking | 4 (`expectedWinRate`), 10 |
| The blend, cores | 10 (`projectCore`) |
| Unranked species take prior 0 | 3, 10 |
| simStrength, coverage/consistency/safety from the matrix | 4 |
| The calibration in one named function with one constant | 4 (`expectedWinRate`, `PROJECTION_SLOPE`) |
| A projected number is never printed as a win rate | 12, 13, 14 (copy tables and tests) |
| Where the faced teams come from, inverted results | 7 |
| Partial sightings are first class, a pair is a core | 7, 10, 12 |
| A complete sighting is a sighting of its cores | 7 |
| Run and faced counts kept separate | 7, 10, 12 |
| Rider on pick3: LogBattle copy | 14 |
| Cold start: generated teams, feasibility proven | feasibility section, 5, 6, 8 |
| Never as battle records | 1 (the localhost guard), 6 (the header comment), 8 |
| Meta epochs, hand-kept, deletes nothing | 8, 9, 14 |
| An epoch carries the commit it expects | 8, 9, 12 |
| Seeding, first | 1 |
| Where the arithmetic runs: the client | 10 |
| The matrix slice, measured not estimated | feasibility section, 8 |
| Any member outside the slice means no projection | 10, 12 |
| The engine subpath | 4 |
| API: additive, teams field deprecated | 7 |
| API: /api/v1/teams, its own bucket | 7, 9 |
| API: the source discriminator | 2 |
| Screens: /<league> is Teams, /<league>/teams still works | 11 |
| Screens: Teams, cores as the spine | 12 |
| Screens: Pokemon, one list, header line, new marker | 13 |
| Screens: About gets the real work | 14 |
| Rules this changes | 15 |
| Testing: table-driven blend tests, the one-grinder case | 3, 10 |
| Testing: worker tests for the faced rollups | 7 |
| Testing: a stable expected ranking over seeded data | 10 step 10 |
| Testing: meta:screens at several seeded volumes | 15 |

**Placeholder scan.** No "TBD", no "similar to Task N", no "add error handling". Every code step
carries the code. The two places that describe rather than paste are Task 12 step 3 and Task 13
step 3, the two screen rewrites, and both are backed by an exact copy table and an explicit
rendering-rules list, which is the same shape the reference plan used for its screens.

**Type consistency.** `SpeciesRanking.weights` (Task 10) is the `ReadonlyMap<string, number>`
`strengthContext` takes (Task 4). `GeneratedTeamLite` (Task 10, `slice.ts`) matches
`GeneratedTeam` (Task 6) field for field, restated on the client for the same reason the API
shapes are. `TeamRowV1` is defined once in `workers/counter/src/teams.ts` (Task 7) and restated
in `apps/meta/src/api.ts` (Task 9) with the same field names. `blendShare`'s options object is
`{ minBattles, halfLife }` in both callers (Task 10's team say and species say). `measuredSay`
lives only in `rank.ts` and is passed into `blendWeights` as `share`, so the formula is not
written twice.

**Known deviations from the spec, all stated in the plan where they bite:**

1. `blendWeights` gains `share` as well as `unrankedPrior` (Task 3), because the device cap cannot
   be expressed as a battle count.
2. The bake generates with the real engine but does not simulate (feasibility section, Task 6),
   so generated and observed teams carry the same number.
3. `simStrength` reports `weightCovered` and the screens print it (Task 4, 12, 14), because
   coverage can only speak for opponents that have a matrix column.
4. The baked artifacts include a ranks file the spec does not name (Task 8), because
   `facingWeight(rank)` needs PvPoke's overall rank for every species that can appear, and the
   existing baseline only carries the curated group.
5. Generated teams do not create cores (Task 10), because a core is a claim that a pair is played
   together and nobody has played a generated one.
