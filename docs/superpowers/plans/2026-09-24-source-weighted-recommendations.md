# Source-weighted recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Source picker (PvPoke, Your log, GBL, Tournaments, All) and a Window picker on Teams that change which opponents pick3's engine weights, in drafting and in scoring, with PvPoke byte-identical to today.

**Architecture:** meta.pick3.gg's blend, window and legality code moves into `@pickthree/engine/meta` so both apps share one formula. The engine's facing profile gains a third builder (`communityProfile`) behind one `FacingInput` union that replaces `yourMeta` on every engine entry point. Engaged profiles pass column weights into `generateTrios` and a heaviest-ten list into `scoreTeam`; unengaged runs take today's code path untouched. The web app fetches `/api/v1/meta` on the main thread, hands a trimmed summary to the worker, and moves the team filters into a Filters sheet on Teams.

**Tech Stack:** TypeScript 5.9 strict, React 19, vitest 4, npm workspaces, puppeteer-core.

**Spec:** `docs/superpowers/specs/2026-09-24-source-weighted-recommendations-design.md`

## Global Constraints

- No em dashes anywhere (code, comments, docs, commits, UI copy); eslint rejects em dash literals. Player-facing strings are 7-bit ASCII except existing "Pokémon" spellings already in the file you touch.
- Braces on all control flow, even single-line bodies (`curly: all`).
- `eqeqeq`; TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (build optional fields with conditional spreads, never assign `undefined` to an optional property).
- Exact pinned versions in every package.json; this plan adds no dependencies.
- Stage explicit paths when committing. Never `git add -A`. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Work happens in a git worktree on branch `source-weighted` (created at execution time via superpowers:using-git-worktrees). The design program works in parallel; expect small merges in `packages/ui/src/components/Select.tsx`, `apps/web/scripts/screens.mjs` and `CLAUDE.md`. The design program makes `Select`'s visible label required: always pass `label` ("Source", "Window").
- PvPoke mode must stay byte-identical: teams, scores and order equal to main on the fixture (Task 1 captures this; every later engine task must keep it green).
- The collection never leaves the device. The community read sends league, since, until and nothing else.
- Fixtures are synthetic. Never commit a real `/api/v1/meta` response.
- The 300, 5, 100 and 2 constants keep their values; they move with the blend and stay re-exported from `apps/meta/src/rank.ts`.

## Review Focus

1. **A league the community has never heard of** (a special cup, or the Tournament league): GBL, Tournaments and All must show disabled with "No community data for this league", never fire a request that 400s, and never break Teams. Pinned in Task 8 (`communityLeague`) and Task 10 (header).
2. **Switching league or window while a community fetch is in flight**: the late response for the old league must not be applied to the new one. Pinned in Task 8 (cache keyed by league+since+until) and Task 9 (`ensureCommunity` returns the payload for the key it was asked about; `filterKey` includes the key).
3. **A worker response with the right status but a wrong shape** (missing `species`, `tournament` absent, numbers as strings): fall back to PvPoke, never throw into the engine. Pinned in Task 8 (`trimSummary`).
4. **An old save** with `yourMeta.blend: false` and no `facing`, or `filters.style: 'abb'`: the migration must give PvPoke and keep the style, and the Filters count must include the style. Pinned in Task 9 (`facingSettings`) and Task 10 (count).
5. **A community summary that lists only species with no matrix column** (all weight on outsiders while outsiders are off): column weights sum to near zero; drafting and scoring must not divide by zero or produce NaN. Pinned in Task 6 (zero-total weights) and Task 5 (`communityProfile` with no column weight).

---

## File Structure

Engine (`packages/engine/src/`):
- Create `meta/community.ts`: say curves, half-say constants, `ranksOf`, `communityWeights`. One responsibility: turn a summary into per-species weights.
- Create `meta/legal.ts`: `OPEN_EQUIVALENT_CUP`, `LegalFile`, `legalFor`.
- Create `meta/window.ts`: `WindowKey`, `Epoch`, `readEpochs`, `epochFor`, `resolveWindow`, `BUCKET_MS`, `MAX_SPAN_DAYS`.
- Modify `meta/index.ts`: export the three new files.
- Create `yourmeta/community.ts`: `communityProfile`.
- Create `yourmeta/facing.ts`: `FacingInput`, `FacingSource`, `profileFor` dispatcher, `heaviestColumns`.
- Modify `yourmeta/profile.ts`: `FacingProfile` gains `source` and optional `community`; `facingLine` gains community and prior sentences.
- Modify `yourmeta/types.ts`: remove `YourMetaInput`.
- Modify `yourmeta/index.ts`: export `community.ts`, `facing.ts`.
- Modify `recommend.ts`, `analyze.ts`, `counters/counters.ts`, `teammates/suggest.ts`: `facing?: FacingInput` replaces `yourMeta`.
- Modify `search/trios.ts`: `TrioOptions.weights` and `exposureColumns`.
- Modify `score/score.ts`: `scoreTeam` gains `top?: readonly string[]`.
- Modify `recommend.ts` `StaticData`: optional `banned?: string[]`.

meta site (`apps/meta/`):
- Modify `src/rank.ts`: call `communityWeights`, re-export constants.
- Modify `src/api.ts`, `src/epochs.ts`, `scripts/bake.ts`: import moved code from the engine, re-export for existing callers and tests.

Data build (`packages/data/src/`):
- Create `build-legal.ts`: writes `legal/<league>.json`.
- Modify `build.ts`: call it; copy validated `epochs.json`.
- Modify `paths.ts`: `EPOCHS_PATH`.

Web (`apps/web/src/`):
- Create `communityMeta.ts`: community league, window, fetch, trim, cache.
- Create `state/facing.ts`: settings migration, `FacingInput` assembly, facing key. `state/yourMeta.ts` keeps `newId` and loses `yourMetaFrom`.
- Create `screens/Filters.tsx`: the Teams Filters sheet.
- Modify `storage/db.ts`, `state/store.tsx`, `host/protocol.ts`, `worker/engine.worker.ts`, `screens/Teams.tsx`, `screens/Sheet.tsx`, `screens/YourMeta.tsx`, `components.tsx`, `community.ts`.
- Modify `packages/ui/src/components/Select.tsx`: `disabled` prop.
- Modify `apps/web/scripts/screens.mjs`: stub the worker response, add a community shot.

Fixtures: create `fixtures/community-meta-sample.json` (synthetic `MetaSummaryV1`).

---

### Task 1: Capture the PvPoke baseline

The byte-identical guarantee needs a record of today's output before anything changes.

**Files:**
- Create: `packages/engine/test/yourmeta/pvpoke-baseline.test.ts`
- Create (generated): `packages/engine/test/yourmeta/__snapshots__/pvpoke-baseline.test.ts.snap`

**Interfaces:**
- Consumes: today's `recommend`, `analyze` (`analyzeTeam` in `src/analyze.ts`), `metaCounters`, with no `yourMeta`.
- Produces: a snapshot every later engine task must keep passing unchanged. Tasks 5 and 6 change the call options from `{}` to `{ facing: { kind: 'prior' } }` and must not touch the `.snap` file.

- [ ] **Step 1: Find the analyze export name**

Run: `grep -n "^export function" packages/engine/src/analyze.ts`
Use the exported function that takes `(picks, specimens, options, deps, onProgress)`; the steps below call it `analyzeTeam`. If its name differs, use the real name everywhere in this file.

- [ ] **Step 2: Write the snapshot test**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { analyzeTeam } from '../../src/analyze.js';
import { toSpecimens } from '../../src/collection/specimen.js';
import { metaCounters } from '../../src/counters/counters.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { recommend } from '../../src/recommend.js';
import { REPO_ROOT, haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

const gmPath = path.join(REPO_ROOT, 'packages', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json');
const ready = haveStaticData() && fs.existsSync(gmPath);

/**
 * PvPoke mode's output on the fixture, recorded before source weighting landed. Every change in
 * the source-weighted plan must leave this snapshot untouched: selecting PvPoke reproduces today.
 * The assumptions sentence is left out on purpose; its wording is tested on its own.
 */
describe.skipIf(!ready)('PvPoke baseline', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };
  // Tasks 5 and 6 replace {} with { facing: { kind: 'prior' } }. Nothing else in this file changes.
  const prior = {};

  it('recommend', () => {
    const rec = recommend(specimens, { ...prior }, deps);
    const teams = rec.teams.map((t) => ({
      id: t.id,
      structure: t.structure,
      species: t.slots.map((s) => s.candidate.build.speciesId),
      score: t.score,
    }));
    expect({ teams, triosScored: rec.stats.triosScored, finalists: rec.stats.finalists }).toMatchSnapshot();
  });

  it('analyze', () => {
    const top = recommend(specimens, { ...prior }, deps).teams[0];
    expect(top).toBeDefined();
    const picks = top!.slots.map((s) => ({ kind: 'specimen' as const, id: s.candidate.build.specimenId })) as [
      { kind: 'specimen'; id: string },
      { kind: 'specimen'; id: string },
      { kind: 'specimen'; id: string },
    ];
    const a = analyzeTeam(picks, specimens, { order: 'best', ...prior }, deps);
    expect({
      species: a.team.slots.map((s) => s.candidate.build.speciesId),
      score: a.team.score,
    }).toMatchSnapshot();
  });

  it('counters', () => {
    const c = metaCounters(data, specimens, index, { ...prior });
    expect(c.entries.slice(0, 15).map((e) => ({ id: e.speciesId, score: e.score }))).toMatchSnapshot();
  });
});
```

If `CounterEntry` has no `score` field, run `grep -n "export interface CounterEntry" -A20 packages/engine/src/counters/counters.ts` and snapshot `speciesId` plus its numeric ranking field instead. If `analyzeTeam`'s result has no `team`, snapshot the field holding the scored `TeamRecommendation`.

- [ ] **Step 3: Run it to write the snapshot**

Run: `npx vitest run packages/engine/test/yourmeta/pvpoke-baseline.test.ts`
Expected: PASS, "3 snapshots written". If it reports "skipped", run `npm run data:build` first (the static data and PvPoke checkout are required), then rerun.

- [ ] **Step 4: Run it again to confirm it is stable**

Run: `npx vitest run packages/engine/test/yourmeta/pvpoke-baseline.test.ts`
Expected: PASS, 3 snapshots matched, none written.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/test/yourmeta/pvpoke-baseline.test.ts packages/engine/test/yourmeta/__snapshots__/pvpoke-baseline.test.ts.snap
git commit -m "Engine: record PvPoke mode's output before source weighting"
```

---

### Task 2: One blend for both sites (`communityWeights`, `ranksOf`, `legalFor`)

**Files:**
- Create: `packages/engine/src/meta/community.ts`
- Create: `packages/engine/src/meta/legal.ts`
- Modify: `packages/engine/src/meta/index.ts`
- Modify: `apps/meta/src/rank.ts`
- Modify: `apps/meta/scripts/bake.ts` (lines 60-97 `OPEN_EQUIVALENT_CUP`/`LegalFile`/`legalFor`, lines 236-246 `ranksOf`)
- Test: `packages/engine/test/meta/community.test.ts`, `packages/engine/test/meta/legal.test.ts`
- Existing tests that must pass unchanged: `apps/meta/test/rank.test.ts`, `apps/meta/test/bake.test.ts`

`legalFor` goes in `@pickthree/engine/meta`, not `packages/data`: `apps/meta` does not depend on `@pickthree/data` (which pulls `sharp`), while both depend on the engine.

**Interfaces:**
- Produces (from `@pickthree/engine/meta`):
  ```ts
  export const HALF_SAY_BATTLES = 300;
  export const HALF_SAY_DEVICES = 5;
  export const HALF_SAY_TOURNAMENT_BATTLES = 100;
  export const HALF_SAY_EVENTS = 2;
  export const LISTED_MIN = 1;
  export function measuredSay(battles: number, devices: number): number;
  export function tournamentSay(battles: number, events: number): number;
  export type CommunitySource = 'prior' | 'ladder' | 'tournament' | 'all';
  export interface CommunitySummary {
    battles: number;
    devices: number;
    species: readonly { speciesId: string; sightings: number }[];
    tournament: {
      events: number;
      battles: number;
      species: readonly { speciesId: string; picks: number }[];
    } | null;
  }
  export interface CommunityWeightsOptions {
    source: CommunitySource;
    group: readonly string[];
    rankOrder: readonly string[];
    banned: ReadonlySet<string>;
  }
  export interface CommunityWeights {
    weights: Map<string, number>;
    ids: string[];
    say: number;
    tournamentSay: number;
  }
  export function ranksOf(overall: readonly { speciesId: string }[]): string[];
  export function communityWeights(summary: CommunitySummary, opts: CommunityWeightsOptions): CommunityWeights;
  export const OPEN_EQUIVALENT_CUP: Record<string, string>;
  export interface LegalFile { cup: string | null; banned: string[] }
  export function legalFor(leagueId: string, leagueRanks: readonly { speciesId: string }[], cupRanks: readonly { speciesId: string }[] | null): LegalFile;
  ```

- [ ] **Step 1: Write the failing engine tests**

`packages/engine/test/meta/community.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  communityWeights,
  measuredSay,
  ranksOf,
  tournamentSay,
  type CommunitySummary,
} from '../../src/meta/index.js';

const GROUP = ['azumarill', 'medicham', 'registeel', 'lanturn'];
const ORDER = ['azumarill', 'medicham', 'registeel', 'lanturn'];

function summary(over: Partial<CommunitySummary> = {}): CommunitySummary {
  return { battles: 0, devices: 0, species: [], tournament: null, ...over };
}

function sum(m: Map<string, number>): number {
  let t = 0;
  for (const v of m.values()) {
    t += v;
  }
  return t;
}

describe('communityWeights', () => {
  it('is the normalised PvPoke prior when nothing was measured', () => {
    const w = communityWeights(summary(), { source: 'all', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.say).toBe(0);
    expect(w.tournamentSay).toBe(0);
    expect(w.ids).toEqual(GROUP);
    expect(sum(w.weights)).toBeCloseTo(1, 10);
    expect(w.weights.get('azumarill')! / w.weights.get('medicham')!).toBeCloseTo(Math.sqrt(2), 10);
  });

  it('prior ignores measured data entirely', () => {
    const s = summary({ battles: 900, devices: 20, species: [{ speciesId: 'lanturn', sightings: 800 }] });
    const w = communityWeights(s, { source: 'prior', group: GROUP, rankOrder: ORDER, banned: new Set() });
    const p = communityWeights(summary(), { source: 'prior', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.say).toBe(0);
    for (const id of GROUP) {
      expect(w.weights.get(id)).toBeCloseTo(p.weights.get(id)!, 12);
    }
  });

  it('ladder blends on the smaller of the battle and device curves', () => {
    const s = summary({ battles: 300, devices: 5, species: [{ speciesId: 'lanturn', sightings: 300 }] });
    const w = communityWeights(s, { source: 'ladder', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.say).toBeCloseTo(0.5, 10);
    expect(w.say).toBe(measuredSay(300, 5));
    // Lanturn holds all the measured share, so it gains half the say on top of half its prior.
    expect(w.weights.get('lanturn')!).toBeGreaterThan(w.weights.get('azumarill')!);
  });

  it('adds a measured species PvPoke does not list, with prior 0', () => {
    const s = summary({ battles: 300, devices: 5, species: [{ speciesId: 'newcomer', sightings: 30 }] });
    const w = communityWeights(s, { source: 'ladder', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.ids).toContain('newcomer');
    expect(w.weights.get('newcomer')).toBeCloseTo(0.5, 10);
  });

  it('tournament picks blend on their own curve, and a banned species keeps the plain prior', () => {
    const s = summary({
      tournament: {
        events: 2,
        battles: 100,
        species: [{ speciesId: 'medicham', picks: 50 }],
      },
    });
    const opts = { source: 'tournament' as const, group: GROUP, rankOrder: ORDER };
    const open = communityWeights(s, { ...opts, banned: new Set() });
    const ban = communityWeights(s, { ...opts, banned: new Set(['azumarill']) });
    const prior = communityWeights(summary(), { ...opts, source: 'prior', banned: new Set() });
    expect(open.tournamentSay).toBe(tournamentSay(100, 2));
    expect(open.say).toBe(0);
    expect(ban.weights.get('azumarill')).toBeCloseTo(prior.weights.get('azumarill')!, 12);
    expect(open.weights.get('azumarill')!).toBeLessThan(prior.weights.get('azumarill')!);
  });

  it('all runs the tournament blend first and the ladder blend over it', () => {
    const s = summary({
      battles: 300,
      devices: 5,
      species: [{ speciesId: 'lanturn', sightings: 300 }],
      tournament: { events: 2, battles: 100, species: [{ speciesId: 'medicham', picks: 50 }] },
    });
    const w = communityWeights(s, { source: 'all', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.say).toBeCloseTo(0.5, 10);
    expect(w.tournamentSay).toBeCloseTo(0.5, 10);
    expect(sum(w.weights)).toBeCloseTo(1, 10);
  });
});

describe('ranksOf', () => {
  it('keeps the first appearance of each species', () => {
    expect(ranksOf([{ speciesId: 'a' }, { speciesId: 'b' }, { speciesId: 'a' }])).toEqual(['a', 'b']);
  });
});
```

`packages/engine/test/meta/legal.test.ts`: copy the `describe('legalFor', ...)` block from `apps/meta/test/bake.test.ts` (lines 203 onward, to the end of that describe) verbatim, changing only its import to:

```ts
import { describe, expect, it } from 'vitest';
import { legalFor, OPEN_EQUIVALENT_CUP } from '../../src/meta/index.js';
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/engine/test/meta`
Expected: FAIL, "communityWeights is not exported" / "legalFor is not exported".

- [ ] **Step 3: Write `packages/engine/src/meta/community.ts`**

```ts
/**
 * The blend meta.pick3.gg ranks with and pick3 weights opponents with: one formula, two callers.
 *
 *   aT     = tournamentSay(tournament battles, events)
 *   p1     = (1 - aT) * pvpokePrior + aT * tournamentPickShare   (a banned species keeps the prior)
 *   a      = measuredSay(ladder battles, devices)
 *   weight = (1 - a) * p1 + a * ladderSightingShare
 *
 * Each source switches terms off rather than using a different formula: `prior` is both off,
 * `ladder` is the second alone, `tournament` the first alone, `all` the sequence. The half-say
 * constants are the curves' midpoints, never gates. Moved from apps/meta/src/rank.ts, unchanged.
 */
import { blendWeights } from '../yourmeta/blend.js';

/** Counted battles at which measured play earns half the say. */
export const HALF_SAY_BATTLES = 300;
/** Contributing devices at which measured play earns half the say. */
export const HALF_SAY_DEVICES = 5;
/** Tournament battles at which tournament play earns half the say of its own term. */
export const HALF_SAY_TOURNAMENT_BATTLES = 100;
/** Events at which the same term earns half the say. */
export const HALF_SAY_EVENTS = 2;
/** A species is listed once PvPoke ranks it or it was faced or picked at least this often. */
export const LISTED_MIN = 1;

/** How much of the say measured ladder play has earned: the smaller of the two curves, 0 to 1. */
export function measuredSay(battles: number, devices: number): number {
  const byBattles = battles <= 0 ? 0 : battles / (battles + HALF_SAY_BATTLES);
  const byDevices = devices <= 0 ? 0 : devices / (devices + HALF_SAY_DEVICES);
  return Math.min(byBattles, byDevices);
}

/** How much of the say tournament play has earned: the smaller of the two curves, 0 to 1. */
export function tournamentSay(battles: number, events: number): number {
  const byBattles = battles <= 0 ? 0 : battles / (battles + HALF_SAY_TOURNAMENT_BATTLES);
  const byEvents = events <= 0 ? 0 : events / (events + HALF_SAY_EVENTS);
  return Math.min(byBattles, byEvents);
}

export type CommunitySource = 'prior' | 'ladder' | 'tournament' | 'all';

/** The fields of the worker's /api/v1/meta response the blend reads. MetaSummaryV1 satisfies it. */
export interface CommunitySummary {
  battles: number;
  devices: number;
  species: readonly { speciesId: string; sightings: number }[];
  tournament: {
    events: number;
    battles: number;
    species: readonly { speciesId: string; picks: number }[];
  } | null;
}

export interface CommunityWeightsOptions {
  source: CommunitySource;
  /** PvPoke's meta group species for the league, in its own order (the site's baseline). */
  group: readonly string[];
  /** PvPoke overall order, de-duplicated with ranksOf. */
  rankOrder: readonly string[];
  /** Species the Play! ruleset bans in this league: they keep the plain prior in the first blend. */
  banned: ReadonlySet<string>;
}

export interface CommunityWeights {
  /** Per species, normalised over `ids`. */
  weights: Map<string, number>;
  /** Every species that got a weight: the meta group first, then measured, then picked. */
  ids: string[];
  /** The ladder term's share of the say, 0 to 1. */
  say: number;
  /** The tournament term's share of the say, 0 to 1. */
  tournamentSay: number;
}

/** PvPoke's overall order with repeats dropped: a species' rank is its first appearance. */
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

export function communityWeights(
  summary: CommunitySummary,
  opts: CommunityWeightsOptions,
): CommunityWeights {
  const block = summary.tournament;
  const tBattles = block?.battles ?? 0;
  const events = block?.events ?? 0;
  const usesLadder = opts.source === 'all' || opts.source === 'ladder';
  const usesTournament = opts.source === 'all' || opts.source === 'tournament';
  const say = usesLadder ? measuredSay(summary.battles, summary.devices) : 0;
  const aT = usesTournament ? tournamentSay(tBattles, events) : 0;

  const rankOf = new Map<string, number>();
  opts.rankOrder.forEach((id, i) => {
    if (!rankOf.has(id)) {
      rankOf.set(id, i + 1);
    }
  });

  const seen = new Map(summary.species.map((s) => [s.speciesId, s.sightings] as const));
  const picked = new Map((block?.species ?? []).map((s) => [s.speciesId, s.picks] as const));
  const ids: string[] = [];
  const known = new Set<string>();
  const add = (id: string): void => {
    if (!known.has(id)) {
      known.add(id);
      ids.push(id);
    }
  };
  for (const id of opts.group) {
    add(id);
  }
  for (const s of summary.species) {
    if (s.sightings >= LISTED_MIN) {
      add(s.speciesId);
    }
  }
  for (const s of block?.species ?? []) {
    if (s.picks >= LISTED_MIN) {
      add(s.speciesId);
    }
  }

  const blendInput = {
    species: ids,
    ranks: new Map(ids.map((id) => [id, rankOf.get(id) ?? null] as const)),
  };
  const options = { minBattles: 0, halfLife: HALF_SAY_BATTLES, unrankedPrior: 0 };
  const prior = blendWeights({ ...blendInput, sightings: new Map(), battles: 0 }, { ...options, share: 0 });
  const afterTournament = blendWeights(
    {
      ...blendInput,
      sightings: new Map(ids.map((id) => [id, picked.get(id) ?? 0] as const)),
      battles: tBattles,
    },
    { ...options, halfLife: HALF_SAY_TOURNAMENT_BATTLES, share: aT },
  );
  const p1 = new Map(
    ids.map((id) => [id, (opts.banned.has(id) ? prior.get(id) : afterTournament.get(id)) ?? 0] as const),
  );

  let ladderTotal = 0;
  for (const id of ids) {
    ladderTotal += seen.get(id) ?? 0;
  }
  const weights = new Map(
    ids.map((id) => {
      const share = ladderTotal === 0 ? 0 : (seen.get(id) ?? 0) / ladderTotal;
      return [id, (1 - say) * (p1.get(id) ?? 0) + say * share] as const;
    }),
  );
  return { weights, ids, say, tournamentSay: aT };
}
```

- [ ] **Step 4: Write `packages/engine/src/meta/legal.ts`**

Move `OPEN_EQUIVALENT_CUP` (with its doc comment), `LegalFile` and `legalFor` from `apps/meta/scripts/bake.ts` lines 60-97 into this file verbatim. Update the comment's cross-reference so it reads "The same map exists in workers/counter/src/tournament.ts as OPEN_EQUIVALENT_CUP ... Both copies are asserted by their own test."

- [ ] **Step 5: Export them from `packages/engine/src/meta/index.ts`**

Append:

```ts
export * from './community.js';
export * from './legal.js';
```

- [ ] **Step 6: Run the engine tests**

Run: `npx vitest run packages/engine/test/meta`
Expected: PASS.

- [ ] **Step 7: Point the meta site at the shared code**

In `apps/meta/scripts/bake.ts`: delete the moved `OPEN_EQUIVALENT_CUP`, `LegalFile`, `legalFor` and `ranksOf` bodies and add near the other engine imports:

```ts
import { legalFor, OPEN_EQUIVALENT_CUP, ranksOf, type LegalFile } from '@pickthree/engine/meta';
export { legalFor, OPEN_EQUIVALENT_CUP, ranksOf, type LegalFile };
```

(The re-export keeps `apps/meta/test/bake.test.ts` importing from `../scripts/bake.js` unchanged.)

In `apps/meta/src/rank.ts`:
- Delete the local `HALF_SAY_BATTLES`, `HALF_SAY_DEVICES`, `LISTED_MIN`, `measuredSay`, `HALF_SAY_TOURNAMENT_BATTLES`, `HALF_SAY_EVENTS`, `tournamentSay` definitions (lines 27-54) and replace them with:

```ts
import {
  communityWeights,
  HALF_SAY_BATTLES,
  HALF_SAY_DEVICES,
  HALF_SAY_EVENTS,
  HALF_SAY_TOURNAMENT_BATTLES,
  LISTED_MIN,
  measuredSay,
  tournamentSay,
} from '@pickthree/engine/meta';

/** The blend's half-say points live beside the formula in @pickthree/engine/meta, so pick3 and
 *  this site cannot drift; they are re-exported here, where the site's rules have always named them. */
export {
  HALF_SAY_BATTLES,
  HALF_SAY_DEVICES,
  HALF_SAY_EVENTS,
  HALF_SAY_TOURNAMENT_BATTLES,
  LISTED_MIN,
  measuredSay,
  tournamentSay,
};
```

  and remove the old `import { blendWeights } from '@pickthree/engine/meta';`.
- In `rankSpecies`, replace everything from `const usesLadder = ...` down to the closing of the `weights` map (the id assembly, both `blendWeights` calls, `p1`, `ladderTotal` and `weights`) with:

```ts
  const blended = communityWeights(meta, {
    source: opts.source,
    group: baseline.species.map((s) => s.speciesId),
    rankOrder: ranks,
    banned: opts.legal?.banned ?? new Set<string>(),
  });
  const { ids, weights, say } = blended;
  const aT = blended.tournamentSay;
  const rankOf = new Map<string, number>();
  ranks.forEach((id, i) => {
    if (!rankOf.has(id)) {
      rankOf.set(id, i + 1);
    }
  });
  const seen = new Map<string, SpeciesStats>(meta.species.map((s) => [s.speciesId, s]));
  const picked = new Map((block?.species ?? []).map((s) => [s.speciesId, s] as const));
  const banned = opts.legal?.banned ?? new Set<string>();
```

  Keep `const block`, `tBattles`, `events` above it (the return statement uses them) and everything from `const prev = meta.previous;` down unchanged. `SpeciesStats` stays imported from `./api.js`.

- [ ] **Step 8: Run the meta site's tests and typecheck**

Run: `npx vitest run apps/meta/test/rank.test.ts apps/meta/test/bake.test.ts && npm -w @pickthree/meta run typecheck`
Expected: PASS, no type errors. `rank.test.ts` is the parity test: it must pass without edits.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/meta/community.ts packages/engine/src/meta/legal.ts packages/engine/src/meta/index.ts packages/engine/test/meta/community.test.ts packages/engine/test/meta/legal.test.ts apps/meta/src/rank.ts apps/meta/scripts/bake.ts
git commit -m "Engine: the meta blend and the ban list move to @pickthree/engine/meta"
```

---

### Task 3: One window for both sites

**Files:**
- Create: `packages/engine/src/meta/window.ts`
- Modify: `packages/engine/src/meta/index.ts`
- Modify: `apps/meta/src/api.ts` (lines 132-202: `WindowContext`, `ApiWindow`, `BUCKET_MS`, `DAY_MS`, `MAX_SPAN_DAYS`, `bucketUp`, `seasonStart`, `resolveWindow`)
- Modify: `apps/meta/src/epochs.ts` (`Epoch`, `epochFor`)
- Modify: `apps/meta/src/route.ts` (`WindowKey`)
- Modify: `apps/meta/scripts/bake.ts` (`Epoch`, `readEpochs`, lines ~190-230)
- Test: `packages/engine/test/meta/window.test.ts`
- Existing tests that must pass unchanged: `apps/meta/test/api.test.ts`, `apps/meta/test/epochs.test.ts`, `apps/meta/test/bake.test.ts`

**Interfaces:**
- Produces (from `@pickthree/engine/meta`):
  ```ts
  export type WindowKey = 'meta' | '30' | '7';
  export interface Epoch { at: string; note: string; leagues?: string[]; pvpokeCommit?: string }
  export interface WindowContext { league: string; seasons: readonly { start: string }[]; epochs: readonly Epoch[] }
  export interface ApiWindow { since: string; until: string; label: string; key: WindowKey; epoch: Epoch | null }
  export const BUCKET_MS = 600_000;
  export const MAX_SPAN_DAYS = 400;
  export function readEpochs(raw: unknown): Epoch[];
  export function epochFor(epochs: readonly Epoch[], league: string, at: Date): Epoch | null;
  export function resolveWindow(key: WindowKey, ctx: WindowContext, now: Date): ApiWindow;
  ```

- [ ] **Step 1: Write the failing test**

`packages/engine/test/meta/window.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUCKET_MS, epochFor, readEpochs, resolveWindow, type Epoch } from '../../src/meta/index.js';

const SEASONS = [{ start: '2026-09-08T13:00:00-07:00' }];

describe('resolveWindow (engine copy)', () => {
  it('buckets until up to ten minutes and spans 7 days', () => {
    const w = resolveWindow('7', { league: 'great', seasons: SEASONS, epochs: [] }, new Date('2026-09-20T12:03:00Z'));
    expect(w.until).toBe('2026-09-20T12:10:00.000Z');
    expect(Date.parse(w.until) - Date.parse(w.since)).toBe(7 * 86_400_000);
    expect(BUCKET_MS).toBe(600_000);
  });

  it('starts This meta at the newest epoch for the league, else the season', () => {
    const epochs: Epoch[] = [{ at: '2026-09-15T00:00:00Z', note: 'rebalance', leagues: ['great'] }];
    const great = resolveWindow('meta', { league: 'great', seasons: SEASONS, epochs }, new Date('2026-09-20T12:03:00Z'));
    const ultra = resolveWindow('meta', { league: 'ultra', seasons: SEASONS, epochs }, new Date('2026-09-20T12:03:00Z'));
    expect(great.since).toBe('2026-09-15T00:00:00.000Z');
    expect(great.epoch).toBe(epochs[0]);
    expect(ultra.since).toBe(new Date('2026-09-08T13:00:00-07:00').toISOString());
  });

  it('epochFor ignores epochs in the future', () => {
    expect(epochFor([{ at: '2026-10-01T00:00:00Z', note: 'x' }], 'great', new Date('2026-09-20T00:00:00Z'))).toBeNull();
  });

  it('readEpochs rejects an entry with no note', () => {
    expect(() => readEpochs([{ at: '2026-09-15T00:00:00Z' }])).toThrow(/needs a note/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/engine/test/meta/window.test.ts`
Expected: FAIL, "resolveWindow is not exported".

- [ ] **Step 3: Create `packages/engine/src/meta/window.ts`**

Move into it, verbatim with their comments:
- `Epoch` from `apps/meta/src/epochs.ts`, and `epochFor` from the same file.
- `ISO_WITH_OFFSET` and `readEpochs` from `apps/meta/scripts/bake.ts` (keep its "Mirrors readSeasons" comment). If bake.ts declares its own `Epoch` interface, delete it; the moved one is the only `Epoch`.
- `WindowContext`, `ApiWindow`, `BUCKET_MS`, `DAY_MS` (not exported), `MAX_SPAN_DAYS`, `bucketUp`, `seasonStart`, `resolveWindow` from `apps/meta/src/api.ts` lines 132-202.
- Add at the top:

```ts
/**
 * The windows meta.pick3.gg and pick3 both read the community meta over. "This meta" starts at
 * the newest epoch for the league (a hand-kept reset list) or else the season start, and every
 * window ends on the next ten minute boundary so all readers in a slice share one cached URL.
 * Moved from apps/meta so the two sites resolve the same moment the same way.
 */
export type WindowKey = 'meta' | '30' | '7';
```

- Change `WindowContext.seasons` to `readonly { start: string }[]` (the only field `seasonStart` reads) so the engine does not import the meta site's `Season`.

Append to `packages/engine/src/meta/index.ts`:

```ts
export * from './window.js';
```

- [ ] **Step 4: Run the engine test**

Run: `npx vitest run packages/engine/test/meta/window.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-point the meta site**

- `apps/meta/src/route.ts`: replace `export type WindowKey = 'meta' | '30' | '7';` with `export type { WindowKey } from '@pickthree/engine/meta';` and add `import type { WindowKey } from '@pickthree/engine/meta';` for local use.
- `apps/meta/src/epochs.ts`: delete the local `Epoch` and `epochFor`; add

```ts
import { epochFor, type Epoch } from '@pickthree/engine/meta';
export { epochFor, type Epoch };
```

- `apps/meta/src/api.ts`: delete the moved block (lines 132-202) and the now-unused `epochFor`/`Epoch`/`Season` imports; add

```ts
import {
  BUCKET_MS,
  MAX_SPAN_DAYS,
  resolveWindow,
  type ApiWindow,
  type WindowContext,
} from '@pickthree/engine/meta';
export { BUCKET_MS, MAX_SPAN_DAYS, resolveWindow, type ApiWindow, type WindowContext };
```

  `WindowKey` stays imported from `./route.js` for `workerSource` and friends.
- `apps/meta/scripts/bake.ts`: delete the moved `readEpochs` and `ISO_WITH_OFFSET`; add `readEpochs` to the `@pickthree/engine/meta` import from Task 2 and to its re-export line.

- [ ] **Step 6: Run the meta site's tests and typecheck**

Run: `npx vitest run apps/meta/test && npm -w @pickthree/meta run typecheck`
Expected: PASS, no edits to any test file.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/meta/window.ts packages/engine/src/meta/index.ts packages/engine/test/meta/window.test.ts apps/meta/src/api.ts apps/meta/src/epochs.ts apps/meta/src/route.ts apps/meta/scripts/bake.ts
git commit -m "Engine: window and epoch resolution move to @pickthree/engine/meta"
```

---

### Task 4: pick3's data build ships the ban list and the epochs

**Files:**
- Create: `packages/data/src/build-legal.ts`
- Modify: `packages/data/src/build.ts` (after the derived-leagues loop, and beside the `seasons.json` copy at line 62)
- Modify: `packages/data/src/paths.ts`
- Test: `packages/data/test/build-legal.test.ts`

**Interfaces:**
- Consumes: `legalFor`, `OPEN_EQUIVALENT_CUP`, `readEpochs` from `@pickthree/engine/meta`.
- Produces: `public/data/legal/<league>.json` (`LegalFile`) for every league in `leagues.json`, and `public/data/epochs.json` (validated `Epoch[]`). Task 9's worker reads both, tolerating their absence.
  ```ts
  export function writeLegal(outDir: string, leagueIds: readonly string[]): { league: string; banned: number }[];
  ```

- [ ] **Step 1: Write the failing test**

`packages/data/test/build-legal.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeLegal } from '../src/build-legal.js';

let dir: string;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function rankings(out: string, league: string, ids: string[]): void {
  fs.mkdirSync(path.join(out, 'rankings', league), { recursive: true });
  fs.writeFileSync(
    path.join(out, 'rankings', league, 'overall.json'),
    JSON.stringify(ids.map((speciesId) => ({ speciesId }))),
  );
}

describe('writeLegal', () => {
  it('writes the Play! ban list for a league with an open-equivalent cup, and an empty one otherwise', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-'));
    rankings(dir, 'great', ['azumarill', 'medicham', 'galvantula']);
    rankings(dir, 'championshipseries', ['azumarill', 'galvantula']);
    rankings(dir, 'ultra', ['giratina_altered']);
    const written = writeLegal(dir, ['great', 'championshipseries', 'ultra']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'legal', 'great.json'), 'utf8'))).toEqual({
      cup: 'championshipseries',
      banned: ['medicham'],
    });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'legal', 'ultra.json'), 'utf8'))).toEqual({
      cup: null,
      banned: [],
    });
    expect(written).toContainEqual({ league: 'great', banned: 1 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/data/test/build-legal.test.ts`
Expected: FAIL, cannot find module `../src/build-legal.js`.

- [ ] **Step 3: Write `packages/data/src/build-legal.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { legalFor, OPEN_EQUIVALENT_CUP } from '@pickthree/engine/meta';

function overall(outDir: string, league: string): { speciesId: string }[] {
  return JSON.parse(
    fs.readFileSync(path.join(outDir, 'rankings', league, 'overall.json'), 'utf8'),
  ) as { speciesId: string }[];
}

/**
 * The Play! ban list per league, the same file meta.pick3.gg's bake writes, so pick3's community
 * weights hold a banned species at the plain prior exactly as the site does. Runs after every
 * league's rankings are written: a league's open-equivalent cup is itself a derived league.
 */
export function writeLegal(
  outDir: string,
  leagueIds: readonly string[],
): { league: string; banned: number }[] {
  fs.mkdirSync(path.join(outDir, 'legal'), { recursive: true });
  return leagueIds.map((league) => {
    const cup = OPEN_EQUIVALENT_CUP[league] ?? null;
    const file = legalFor(league, overall(outDir, league), cup === null ? null : overall(outDir, cup));
    fs.writeFileSync(path.join(outDir, 'legal', `${league}.json`), JSON.stringify(file));
    return { league, banned: file.banned.length };
  });
}
```

- [ ] **Step 4: Wire it into the build**

In `packages/data/src/paths.ts` add, next to the other repo paths (follow the file's existing style for building paths from the repo root):

```ts
/** The hand-kept meta reset list meta.pick3.gg owns; pick3 ships a validated copy. */
export const EPOCHS_PATH = path.join(REPO_ROOT, 'apps', 'meta', 'epochs.json');
```

(If `paths.ts` names its root differently, use that name.)

In `packages/data/src/build.ts`:
- Add imports: `import { readEpochs } from '@pickthree/engine/meta';`, `import { writeLegal } from './build-legal.js';`, and `EPOCHS_PATH` in the `./paths.js` import.
- After the `for (const league of derivedLeagues) { ... }` loop add:

```ts
  const legal = writeLegal(OUTPUT_DIR, leagues.map((l) => l.id));
  console.log(`legal: ${legal.map((l) => `${l.league} ${l.banned} banned`).join(', ')}`);
```

- After the `fs.copyFileSync(SEASONS_PATH, ...)` line add:

```ts
  // Validated, not copied: a malformed reset list must fail the build, as it fails the meta bake.
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'epochs.json'),
    JSON.stringify(readEpochs(JSON.parse(fs.readFileSync(EPOCHS_PATH, 'utf8')))),
  );
```

- [ ] **Step 5: Run the test and a real build**

Run: `npx vitest run packages/data/test/build-legal.test.ts`
Expected: PASS.
Run: `PICKTHREE_SKIP_SPRITES=1 PICKTHREE_SKIP_MATRIX=1 npm run data:build` (then rerun the full `npm run data:build` so later tasks have the matrix).
Expected: a `legal: great 1+ banned, ...` line; `apps/web/public/data/legal/great.json` and `apps/web/public/data/epochs.json` exist.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/build-legal.ts packages/data/src/build.ts packages/data/src/paths.ts packages/data/test/build-legal.test.ts
git commit -m "Data: pick3 ships the Play! ban list and the meta epoch list"
```

---

### Task 5: One facing input, three builders

**Files:**
- Create: `packages/engine/src/yourmeta/community.ts`
- Create: `packages/engine/src/yourmeta/facing.ts`
- Modify: `packages/engine/src/yourmeta/profile.ts`
- Modify: `packages/engine/src/yourmeta/types.ts` (remove `YourMetaInput`, lines 51-55)
- Modify: `packages/engine/src/yourmeta/index.ts`
- Modify: `packages/engine/src/recommend.ts` (`StaticData`, `RecommendOptions.yourMeta`, `Assumptions`, `assumptionsFor`, `profileFor`)
- Modify: `packages/engine/src/analyze.ts` (`AnalyzeOptions.yourMeta`, line 286)
- Modify: `packages/engine/src/counters/counters.ts` (`CountersOptions.yourMeta`, lines 190-198)
- Modify: `packages/engine/src/teammates/suggest.ts` (`yourMeta`, line 292)
- Modify: every engine test that passes `yourMeta:` (find with `grep -rln "yourMeta" packages/engine/test`)
- Modify: `packages/engine/test/yourmeta/pvpoke-baseline.test.ts` (`const prior = {}` becomes `const prior = { facing: { kind: 'prior' as const } }`)
- Test: `packages/engine/test/yourmeta/community.test.ts`, `packages/engine/test/yourmeta/facing.test.ts`

**Interfaces:**
- Consumes: `communityWeights`, `ranksOf`, `CommunitySummary` (Task 2).
- Produces:
  ```ts
  // yourmeta/facing.ts
  export type FacingSource = 'prior' | 'log' | 'ladder' | 'tournament' | 'all';
  export type CommunityKind = 'ladder' | 'tournament' | 'all';
  export interface FacingWindow { since: string; until: string; label: string }
  export type FacingInput =
    | { kind: 'prior'; unavailable?: CommunityKind }
    | { kind: 'log'; battles: LoggedBattle[] }
    | { kind: 'community'; source: CommunityKind; summary: CommunitySummary; window: FacingWindow };
  export function profileFor(data: StaticData, view: MatrixView, facing: FacingInput | undefined): FacingProfile;
  export function heaviestColumns(view: MatrixView, weights: ReadonlyMap<string, number>, k: number): number[];
  // yourmeta/community.ts
  export interface CommunityProfileInput {
    summary: CommunitySummary;
    source: CommunityKind;
    window: FacingWindow;
    opponents: string[];
    group: readonly string[];
    rankOrder: readonly string[];
    banned: ReadonlySet<string>;
    rankings: RankingEntry[];
  }
  export interface CommunityProfileOptions { communityOutsiders: boolean; maxOutsiders: number }
  export function communityProfile(input: CommunityProfileInput, options?: Partial<CommunityProfileOptions>): FacingProfile;
  // yourmeta/profile.ts
  export type ProfileReason = 'engaged' | 'off' | 'too-few' | 'prior' | 'unavailable' | 'community';
  export interface FacingProfile { /* existing fields */ source: FacingSource; community?: CommunityFacts }
  export interface CommunityFacts { source: CommunityKind; window: FacingWindow; battles: number; devices: number; events: number; tournamentBattles: number; say: number; tournamentSay: number }
  // recommend.ts
  export interface StaticData { /* existing */ banned?: string[] }
  export interface RecommendOptions { /* yourMeta removed */ facing?: FacingInput }
  export interface Assumptions { /* existing */ source: FacingSource }
  ```
  `AnalyzeOptions`, `CountersOptions`, `SuggestOptions` each replace `yourMeta?: YourMetaInput` with `facing?: FacingInput`. An absent `facing` means `{ kind: 'prior' }`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/yourmeta/community.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RankingEntry } from '../../src/gamedata/types.js';
import { communityProfile } from '../../src/yourmeta/community.js';
import { facingLine } from '../../src/yourmeta/profile.js';

const COLUMNS = ['azumarill', 'medicham', 'medicham', 'registeel'];
const GROUP = ['azumarill', 'medicham', 'registeel'];
const ORDER = ['azumarill', 'medicham', 'registeel', 'lanturn'];
const RANKINGS = ORDER.map((speciesId) => ({ speciesId, moveset: ['F', 'C1', 'C2'] })) as unknown as RankingEntry[];
const WINDOW = { since: '2026-09-02T00:00:00.000Z', until: '2026-09-24T00:10:00.000Z', label: 'This meta' };

function input(over: Partial<Parameters<typeof communityProfile>[0]> = {}) {
  return {
    summary: { battles: 0, devices: 0, species: [], tournament: null },
    source: 'ladder' as const,
    window: WINDOW,
    opponents: COLUMNS,
    group: GROUP,
    rankOrder: ORDER,
    banned: new Set<string>(),
    rankings: RANKINGS,
    ...over,
  };
}

describe('communityProfile', () => {
  it('gives every column its species weight, duplicates included', () => {
    const p = communityProfile(input());
    expect(p.engaged).toBe(true);
    expect(p.reason).toBe('community');
    expect(p.source).toBe('ladder');
    expect([...p.weights.keys()]).toEqual(['azumarill', 'medicham', 'registeel']);
    expect(p.weights.get('medicham')).toBeGreaterThan(0);
    expect(p.outsiders).toEqual([]);
  });

  it('keeps PvPoke order with no data', () => {
    const p = communityProfile(input());
    expect(p.weights.get('azumarill')!).toBeGreaterThan(p.weights.get('medicham')!);
    expect(p.weights.get('medicham')!).toBeGreaterThan(p.weights.get('registeel')!);
  });

  it('adds no outsiders while the flag is off, and up to the cap when on', () => {
    const summary = { battles: 900, devices: 20, species: [{ speciesId: 'lanturn', sightings: 400 }], tournament: null };
    expect(communityProfile(input({ summary })).outsiders).toEqual([]);
    const on = communityProfile(input({ summary }), { communityOutsiders: true });
    expect(on.outsiders.map((o) => o.speciesId)).toEqual(['lanturn']);
    expect(on.outsiderWeights.get('lanturn')).toBeGreaterThan(0);
  });

  it('survives a summary whose whole measured share sits outside the matrix', () => {
    const summary = { battles: 100_000, devices: 10_000, species: [{ speciesId: 'lanturn', sightings: 100_000 }], tournament: null };
    const p = communityProfile(input({ summary }));
    for (const w of p.weights.values()) {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it('writes a sentence naming the source, the numbers and the window', () => {
    const summary = { battles: 1240, devices: 18, species: [{ speciesId: 'medicham', sightings: 900 }], tournament: null };
    expect(facingLine(communityProfile(input({ summary })))).toMatch(
      /^Weighted by GBL play: 1,240 battles from 18 devices, This meta \(since Sep 2\), \d+% measured$/,
    );
    const t = communityProfile(
      input({
        source: 'tournament',
        window: { ...WINDOW, label: '30 days' },
        summary: { battles: 0, devices: 0, species: [], tournament: { events: 3, battles: 212, species: [] } },
      }),
    );
    expect(facingLine(t)).toMatch(/^Weighted by tournaments: 3 events, 212 battles, 30 days, \d+% measured$/);
  });
});
```

`packages/engine/test/yourmeta/facing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import type { StaticData } from '../../src/recommend.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { heaviestColumns, profileFor } from '../../src/yourmeta/facing.js';
import { facingLine } from '../../src/yourmeta/profile.js';

const matrix = {
  league: 'great',
  cp: 1500,
  scenarios: [{ shields: [1, 1], energy: [0, 0] }],
  candidates: [],
  opponents: ['azumarill', 'medicham', 'registeel'],
  candidateMovesets: {},
  opponentMovesets: {},
  ratings: [],
} as unknown as MatchupMatrix;
const view = new MatrixView(matrix);
const data = {
  meta: matrix.opponents.map((speciesId) => ({ speciesId, fastMove: 'F', chargedMoves: ['C'] })),
  rankings: {
    overall: matrix.opponents.map((speciesId) => ({ speciesId, moveset: ['F', 'C'] })),
    leads: [],
    switches: [],
    closers: [],
    chargers: [],
  },
} as unknown as StaticData;

describe('profileFor', () => {
  it('treats a missing input as PvPoke', () => {
    const p = profileFor(data, view, undefined);
    expect(p.engaged).toBe(false);
    expect(p.source).toBe('prior');
    expect(facingLine(p)).toBe('PvPoke weights only');
  });

  it('says so when a community source fell back', () => {
    const p = profileFor(data, view, { kind: 'prior', unavailable: 'ladder' });
    expect(p.engaged).toBe(false);
    expect(facingLine(p)).toBe('PvPoke weights (community data unavailable)');
  });

  it('keeps the log path, too-few included', () => {
    const p = profileFor(data, view, { kind: 'log', battles: [] });
    expect(p.source).toBe('log');
    expect(facingLine(p)).toBe('PvPoke weights only (0 of 15 battles logged)');
  });

  it('builds a community profile', () => {
    const p = profileFor(data, view, {
      kind: 'community',
      source: 'all',
      summary: { battles: 0, devices: 0, species: [], tournament: null },
      window: { since: '2026-09-17T00:00:00.000Z', until: '2026-09-24T00:00:00.000Z', label: '7 days' },
    });
    expect(p.engaged).toBe(true);
    expect(p.source).toBe('all');
  });
});

describe('heaviestColumns', () => {
  it('orders column indexes by weight, ties by column order', () => {
    const w = new Map([['azumarill', 0.1], ['medicham', 0.5], ['registeel', 0.1]]);
    expect(heaviestColumns(view, w, 2)).toEqual([1, 0]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/engine/test/yourmeta/community.test.ts packages/engine/test/yourmeta/facing.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Extend `FacingProfile` and `facingLine` in `yourmeta/profile.ts`**

- Change `ProfileReason` to `'engaged' | 'off' | 'too-few' | 'prior' | 'unavailable' | 'community'`.
- Add, above `FacingProfile`:

```ts
import type { CommunitySummary } from '../meta/community.js';
import type { CommunityKind, FacingSource, FacingWindow } from './facing.js';

/** What a community profile was built from, for the assumptions sentence. */
export interface CommunityFacts {
  source: CommunityKind;
  window: FacingWindow;
  battles: number;
  devices: number;
  events: number;
  tournamentBattles: number;
  /** The ladder term's share of the say, 0 to 1. */
  say: number;
  /** The tournament term's share of the say, 0 to 1. */
  tournamentSay: number;
}
```

  (Drop the `CommunitySummary` import if unused after you finish; it is listed so the type path is clear.)
- Add to `FacingProfile`:

```ts
  /** Which population the weights come from. */
  source: FacingSource;
  /** Present on a community profile. */
  community?: CommunityFacts;
```

- In `buildFacingProfile`, add `source: 'log'` to both the `plain(...)` object and the engaged return.
- Replace `facingLine` with:

```ts
const COMMUNITY_HEAD: Record<CommunityKind, string> = {
  ladder: 'Weighted by GBL play',
  tournament: 'Weighted by tournaments',
  all: 'Weighted by all play',
};

function num(n: number): string {
  return n.toLocaleString('en-US');
}

/** "This meta (since Sep 2)", "30 days", "7 days". */
function windowPhrase(w: FacingWindow): string {
  if (w.label !== 'This meta') {
    return w.label;
  }
  const since = new Date(w.since).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `This meta (since ${since})`;
}

function communityLine(c: CommunityFacts): string {
  const head = COMMUNITY_HEAD[c.source];
  const when = windowPhrase(c.window);
  if (c.source === 'ladder') {
    return `${head}: ${num(c.battles)} battles from ${num(c.devices)} devices, ${when}, ${Math.round(c.say * 100)}% measured`;
  }
  if (c.source === 'tournament') {
    return `${head}: ${num(c.events)} events, ${num(c.tournamentBattles)} battles, ${when}, ${Math.round(c.tournamentSay * 100)}% measured`;
  }
  const measured = 1 - (1 - c.say) * (1 - c.tournamentSay);
  return `${head}: PvPoke, ${num(c.events)} events and ${num(c.battles)} GBL battles, ${when}, ${Math.round(measured * 100)}% measured`;
}

/** The assumptions sentence. `mode` is 'teams' (outsiders simulated) or 'counters' (counted only). */
export function facingLine(
  p: FacingProfile,
  mode: 'teams' | 'counters' = 'teams',
  minBattles: number = DEFAULT_PROFILE_OPTIONS.minBattles,
): string {
  if (p.reason === 'prior') {
    return 'PvPoke weights only';
  }
  if (p.reason === 'unavailable') {
    return 'PvPoke weights (community data unavailable)';
  }
  if (p.reason === 'community' && p.community) {
    return communityLine(p.community);
  }
  // ...the existing 'off', 'too-few' and engaged-log branches, unchanged...
}
```

  Keep the existing body below the new branches exactly as it is.

- [ ] **Step 4: Write `yourmeta/facing.ts`**

```ts
import { ranksOf, type CommunitySummary } from '../meta/community.js';
import { metaRanks } from '../gamedata/metaRank.js';
import type { StaticData } from '../recommend.js';
import type { MatrixView } from '../search/matrixView.js';
import { communityProfile } from './community.js';
import { buildFacingProfile, plainWeights, type FacingProfile } from './profile.js';
import type { LoggedBattle } from './types.js';

/** Who the player expects to face: the Source picker's five choices. */
export type FacingSource = 'prior' | 'log' | 'ladder' | 'tournament' | 'all';
export type CommunityKind = 'ladder' | 'tournament' | 'all';

export interface FacingWindow {
  since: string;
  until: string;
  /** "This meta", "30 days" or "7 days". */
  label: string;
}

/**
 * The one way every engine entry point is told whose opponents to weight. Absent means PvPoke.
 * `unavailable` marks a community source that could not be read, so the sentence says so.
 */
export type FacingInput =
  | { kind: 'prior'; unavailable?: CommunityKind }
  | { kind: 'log'; battles: LoggedBattle[] }
  | { kind: 'community'; source: CommunityKind; summary: CommunitySummary; window: FacingWindow };

export function profileFor(
  data: StaticData,
  view: MatrixView,
  facing: FacingInput | undefined,
): FacingProfile {
  const ranks = metaRanks(data.rankings);
  const input = facing ?? { kind: 'prior' as const };
  if (input.kind === 'log') {
    return buildFacingProfile({
      battles: input.battles,
      opponents: view.opponents,
      ranks,
      rankings: data.rankings.overall,
      blend: true,
    });
  }
  if (input.kind === 'community') {
    return communityProfile({
      summary: input.summary,
      source: input.source,
      window: input.window,
      opponents: view.opponents,
      group: data.meta.map((m) => m.speciesId),
      rankOrder: ranksOf(data.rankings.overall),
      banned: new Set(data.banned ?? []),
      rankings: data.rankings.overall,
    });
  }
  return {
    weights: plainWeights(view.opponents, ranks),
    outsiders: [],
    outsiderWeights: new Map(),
    battles: 0,
    sightings: 0,
    engaged: false,
    reason: input.unavailable ? 'unavailable' : 'prior',
    source: 'prior',
  };
}

/** The k heaviest matrix columns, heaviest first; ties keep column order. */
export function heaviestColumns(
  view: MatrixView,
  weights: ReadonlyMap<string, number>,
  k: number,
): number[] {
  return view.opponents
    .map((id, o) => ({ o, w: weights.get(id) ?? 0 }))
    .sort((a, b) => b.w - a.w || a.o - b.o)
    .slice(0, k)
    .map((x) => x.o);
}
```

- [ ] **Step 5: Write `yourmeta/community.ts`**

```ts
import { communityWeights, type CommunitySummary } from '../meta/community.js';
import type { MetaEntry, RankingEntry } from '../gamedata/types.js';
import type { CommunityKind, FacingWindow } from './facing.js';
import type { FacingProfile } from './profile.js';

export interface CommunityProfileInput {
  summary: CommunitySummary;
  source: CommunityKind;
  window: FacingWindow;
  /** Matrix columns in matrix order. A species may appear twice (two movesets). */
  opponents: string[];
  /** PvPoke's meta group species. */
  group: readonly string[];
  rankOrder: readonly string[];
  banned: ReadonlySet<string>;
  /** Overall rankings: outsider movesets. */
  rankings: RankingEntry[];
}

export interface CommunityProfileOptions {
  /** Simulate the heaviest species with no matrix column. Off until measured volume justifies it. */
  communityOutsiders: boolean;
  maxOutsiders: number;
}

export const DEFAULT_COMMUNITY_PROFILE_OPTIONS: CommunityProfileOptions = {
  communityOutsiders: false,
  maxOutsiders: 8,
};

/**
 * Opponent weights from the community meta: meta.pick3.gg's own number per species, laid over
 * the matrix columns. Engaged whatever the volume, because the player chose the source; thin data
 * simply leaves the weights near PvPoke's prior, which is what the blend's curves are for.
 */
export function communityProfile(
  input: CommunityProfileInput,
  options: Partial<CommunityProfileOptions> = {},
): FacingProfile {
  const opts = { ...DEFAULT_COMMUNITY_PROFILE_OPTIONS, ...options };
  const blended = communityWeights(input.summary, {
    source: input.source,
    group: input.group,
    rankOrder: input.rankOrder,
    banned: input.banned,
  });
  const inMatrix = new Set(input.opponents);
  const entryOf = new Map<string, RankingEntry>();
  for (const e of input.rankings) {
    if (!entryOf.has(e.speciesId)) {
      entryOf.set(e.speciesId, e);
    }
  }
  const outsiders: MetaEntry[] = !opts.communityOutsiders
    ? []
    : blended.ids
        .filter((id) => !inMatrix.has(id) && !input.banned.has(id) && (entryOf.get(id)?.moveset.length ?? 0) >= 2)
        .sort((a, b) => (blended.weights.get(b) ?? 0) - (blended.weights.get(a) ?? 0) || a.localeCompare(b))
        .slice(0, opts.maxOutsiders)
        .map((id) => {
          const e = entryOf.get(id) as RankingEntry;
          return { speciesId: id, fastMove: e.moveset[0] as string, chargedMoves: e.moveset.slice(1, 3) };
        });
  let sightings = 0;
  for (const s of input.summary.species) {
    sightings += s.sightings;
  }
  return {
    weights: new Map(input.opponents.map((id) => [id, blended.weights.get(id) ?? 0] as const)),
    outsiders,
    outsiderWeights: new Map(outsiders.map((o) => [o.speciesId, blended.weights.get(o.speciesId) ?? 0] as const)),
    battles: input.summary.battles,
    sightings,
    engaged: true,
    reason: 'community',
    source: input.source,
    community: {
      source: input.source,
      window: input.window,
      battles: input.summary.battles,
      devices: input.summary.devices,
      events: input.summary.tournament?.events ?? 0,
      tournamentBattles: input.summary.tournament?.battles ?? 0,
      say: blended.say,
      tournamentSay: blended.tournamentSay,
    },
  };
}
```

Append to `yourmeta/index.ts`:

```ts
export * from './community.js';
export * from './facing.js';
```

- [ ] **Step 6: Replace `yourMeta` with `facing` on every entry point**

- `yourmeta/types.ts`: delete `YourMetaInput` and its comment.
- `recommend.ts`:
  - `StaticData`: add

```ts
  /** The Play! ban list for this league (legal/<league>.json). Absent means none shipped. */
  banned?: string[];
```

  - `RecommendOptions`: replace the `yourMeta` field with

```ts
  /** Whose opponents to weight. Absent means PvPoke. */
  facing?: FacingInput;
```

  - `Assumptions`: add `source: FacingSource;` after `facing`.
  - `assumptionsFor`: set `facing: profile ? facingLine(profile) : 'PvPoke weights only'` and `source: profile?.source ?? 'prior'`.
  - Delete the local `profileFor` function; import `profileFor`, `type FacingInput`, `type FacingSource` from `./yourmeta/facing.js`; re-export `profileFor` from recommend.ts (`export { profileFor } from './yourmeta/facing.js';`) because `analyze.ts` imports it from here. Remove the `buildFacingProfile` and `YourMetaInput` imports.
  - In `recommend()`, change `profileFor(deps.data, view, opts.yourMeta)` to `profileFor(deps.data, view, opts.facing)`.
- `analyze.ts`: `yourMeta?: YourMetaInput` becomes `facing?: FacingInput` (import the type from `./yourmeta/facing.js`); line 286 passes `opts.facing`.
- `teammates/suggest.ts`: the same field swap; line 292 passes `opts.facing`.
- `counters/counters.ts`: swap the field and replace the `buildFacingProfile({...})` call (lines 191-197) with

```ts
  // One opponent is "who beats X", not "who beats what I face": weights never apply to it.
  const profile = profileFor(data as StaticData, view, opts.vs ? { kind: 'prior' } : opts.facing);
```

  `CountersData` is a subset of `StaticData`; if the cast fails typecheck, give `profileFor`'s `data` parameter the narrower type `Pick<StaticData, 'meta' | 'rankings' | 'banned'>` instead of casting. Replace the `facingLine(profile, 'counters')` call site's surrounding logic only where it referenced `yourMeta`. `blended` becomes `profile.engaged`.
- Engine tests: in every file `grep -rln "yourMeta" packages/engine/test` lists, rewrite `yourMeta: { battles: X, blend: true }` as `facing: { kind: 'log', battles: X }` and `yourMeta: { battles: X, blend: false }` as `facing: { kind: 'prior' }`. Expectations of the string `'PvPoke weights only (your log is switched off)'` become `'PvPoke weights only'`.
- `pvpoke-baseline.test.ts`: `const prior = { facing: { kind: 'prior' as const } };`. Do not touch the `.snap` file.

- [ ] **Step 7: Run the engine suite and typecheck**

Run: `npx vitest run packages/engine && npm run typecheck`
Expected: engine PASS including `pvpoke-baseline` with 0 snapshots written or updated. Typecheck errors are expected ONLY in `apps/web` (it still passes `yourMeta`); Task 9 fixes them. If any other workspace errors, fix it here.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/yourmeta/community.ts packages/engine/src/yourmeta/facing.ts packages/engine/src/yourmeta/profile.ts packages/engine/src/yourmeta/types.ts packages/engine/src/yourmeta/index.ts packages/engine/src/recommend.ts packages/engine/src/analyze.ts packages/engine/src/counters/counters.ts packages/engine/src/teammates/suggest.ts packages/engine/test
git commit -m "Engine: one facing input, and a community profile beside the log"
```

(`packages/engine/test` is an explicit directory path, allowed; do not use `-A`.)

---

### Task 6: Weights reach drafting and the top ten

**Files:**
- Modify: `packages/engine/src/search/trios.ts` (`TrioOptions`, `evaluateTrio` lines 96-178)
- Modify: `packages/engine/src/score/score.ts` (`scoreTeam` signature and `topUncovered`)
- Modify: `packages/engine/src/recommend.ts` (the `generateTrios` call and the `scoreTeam` call)
- Modify: `packages/engine/src/analyze.ts` (lines 282-295)
- Test: `packages/engine/test/search/trios.test.ts` (add cases), `packages/engine/test/score/weighted-top.test.ts`

**Interfaces:**
- Consumes: `heaviestColumns`, `profileFor` (Task 5).
- Produces:
  ```ts
  export interface TrioOptions { /* existing */ weights?: readonly number[]; exposureColumns?: readonly number[] }
  export function weightedTrioOptions(base: TrioOptions, view: MatrixView, weights: ReadonlyMap<string, number>): TrioOptions;
  export function scoreTeam(t, all, view, facing?, extraOpponents = [], top?: readonly string[]): TeamScore;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/test/search/trios.test.ts` (reuse its `fakeWorld()`; `a` beats o1-o3, `b` beats o4-o6):

```ts
import { weightedTrioOptions } from '../../src/search/trios.js';

describe('weighted drafting', () => {
  it('is today exactly when no weights are given', () => {
    const { view, pool } = fakeWorld();
    const typesOf = { types: () => ['water', 'none'] as ['water', 'none'] };
    const plain = generateTrios(pool, view, typesOf, DEFAULT_TRIO_OPTIONS);
    const again = generateTrios(pool, view, typesOf, { ...DEFAULT_TRIO_OPTIONS });
    expect(again.drafts.map((d) => d.draftScore)).toEqual(plain.drafts.map((d) => d.draftScore));
  });

  it('promotes the trio that covers the heavy column', () => {
    const { view, pool } = fakeWorld();
    const typesOf = { types: () => ['water', 'none'] as ['water', 'none'] };
    // All the weight on o5: only b, c and e... check fakeWorld's table: o5 is beaten by b and c.
    const weights = new Map(view.opponents.map((id) => [id, id === 'o5' ? 1 : 0] as const));
    const opts = weightedTrioOptions({ ...DEFAULT_TRIO_OPTIONS, finalists: 1 }, view, weights);
    const top = generateTrios(pool, view, typesOf, opts).drafts[0]!;
    const ids = top.slots.map((c) => c.build.speciesId);
    expect(ids.some((id) => id === 'b' || id === 'c')).toBe(true);
    expect(top.exposure).toEqual([]);
  });

  it('survives weights that sum to zero', () => {
    const { view, pool } = fakeWorld();
    const typesOf = { types: () => ['water', 'none'] as ['water', 'none'] };
    const zero = new Map(view.opponents.map((id) => [id, 0] as const));
    const drafts = generateTrios(pool, view, typesOf, weightedTrioOptions(DEFAULT_TRIO_OPTIONS, view, zero)).drafts;
    for (const d of drafts) {
      expect(Number.isFinite(d.draftScore)).toBe(true);
    }
  });
});
```

Before writing the second case, read `fakeWorld`'s `wins` table and pick the heavy column so that exactly the members you assert on beat it; adjust the assertion to the table (the table above: o5 is beaten by `b` and `c`).

`packages/engine/test/score/weighted-top.test.ts`: build a `TeamSim` via the helpers already used in `packages/engine/test/score/` (run `ls packages/engine/test/score` and copy the fake-team builder from the nearest existing score test). Assert:

```ts
it('counts the top ten by the given list when one is passed', () => {
  // team covers every opponent except 'o12'; o12 is column 12, outside the first ten.
  const plain = scoreTeam(team, [team], view);
  const weighted = scoreTeam(team, [team], view, undefined, [], ['o12', 'o1']);
  expect(plain.topUncovered).toBe(0);
  expect(weighted.topUncovered).toBe(1);
});
```

with a 12-column fake view where the team's simulated results beat every opponent except `o12`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/engine/test/search/trios.test.ts packages/engine/test/score/weighted-top.test.ts`
Expected: FAIL, `weightedTrioOptions` not exported; `scoreTeam` ignores the sixth argument.

- [ ] **Step 3: Weighted drafting in `trios.ts`**

Add to `TrioOptions`:

```ts
  /**
   * Per matrix column, how often it is faced. Absent means today's unweighted draft, which is what
   * keeps PvPoke mode byte-identical; present only for an engaged facing profile.
   */
  weights?: readonly number[];
  /** Column indexes that count toward exposure. Absent means the first exposureDepth columns. */
  exposureColumns?: readonly number[];
```

Add the helper (import `heaviestColumns` from `../yourmeta/facing.js`):

```ts
/** Draft options for an engaged facing profile: weighted coverage, exposure by weight. */
export function weightedTrioOptions(
  base: TrioOptions,
  view: MatrixView,
  weights: ReadonlyMap<string, number>,
): TrioOptions {
  return {
    ...base,
    weights: view.opponents.map((id) => weights.get(id) ?? 0),
    exposureColumns: heaviestColumns(view, weights, Math.min(base.exposureDepth, view.opponents.length)),
  };
}
```

In `evaluateTrio`, after `const coverage = covered.filter(Boolean).length;` replace the exposure loop and add a coverage share:

```ts
  let coverShare = n === 0 ? 0 : coverage / n;
  if (opts.weights) {
    let got = 0;
    let all = 0;
    opts.weights.forEach((w, o) => {
      all += w;
      if (covered[o]) {
        got += w;
      }
    });
    coverShare = all === 0 ? 0 : got / all;
  }
  const exposureCols =
    opts.exposureColumns ?? Array.from({ length: Math.min(opts.exposureDepth, n) }, (_, o) => o);
  const exposure: string[] = [];
  for (const o of exposureCols) {
    if (!covered[o]) {
      exposure.push(view.opponents[o] as string);
    }
  }
```

Then replace `(coverage / n)` with `coverShare` in both the `abcScore` expression and the `draftScore` expression. Leave `TrioDraft.coverage` as the plain count.

Check the unweighted path is arithmetically identical: `coverShare = coverage / n` is the same expression as before; `exposureCols` is `0..min(depth, n)-1`, the same loop. If `n` can be 0 today and produced `NaN` before, the new `n === 0 ? 0` guard would change it; the fixture never has `n === 0`, and the baseline snapshot confirms.

- [ ] **Step 4: Top ten by weight in `score.ts`**

Add the parameter:

```ts
  /** Opponents simulated on top of the matrix columns (your most-faced outsiders). */
  extraOpponents: string[] = [],
  /** The ten opponents "top ten" means. Absent means the first ten columns, as always. */
  top?: readonly string[],
): TeamScore {
```

and change the `topUncovered` line to:

```ts
  const topUncovered = (top ?? view.opponents.slice(0, 10)).filter((id) => !covered.has(id)).length;
```

- [ ] **Step 5: Pass them from `recommend.ts` and `analyze.ts`**

In `recommend()`: move `const profile = profileFor(deps.data, view, opts.facing);` to just before `generateTrios`, then:

```ts
  const baseTrio = { ...DEFAULT_TRIO_OPTIONS, finalists: opts.finalists, style: opts.style };
  const trioOpts = profile.engaged ? weightedTrioOptions(baseTrio, view, profile.weights) : baseTrio;
  const { drafts, scored } = generateTrios(pool, view, typesOf, trioOpts, (d, t) => progress('trios', d, t));
```

and for scoring:

```ts
  const top = profile.engaged
    ? heaviestColumns(view, profile.weights, 10).map((o) => view.opponents[o] as string)
    : undefined;
  const scored2 = sims.map((t) => ({ t, score: scoreTeam(t, sims, view, facing, extra, top) }));
```

In `analyze.ts`: compute `profile` before the `drafts` line, use `const trioOpts = profile.engaged ? weightedTrioOptions(DEFAULT_TRIO_OPTIONS, view, profile.weights) : DEFAULT_TRIO_OPTIONS;` in the `evaluateTrio` call, and pass the same `top` to `scoreTeam`.

Also pass `top` in `teammates/suggest.ts` if it calls `scoreTeam` (run `grep -n "scoreTeam" packages/engine/src/teammates/suggest.ts`; if it does not, leave it).

- [ ] **Step 6: Run the engine suite**

Run: `npx vitest run packages/engine`
Expected: PASS. `pvpoke-baseline` matches with nothing written. If it fails, the unweighted path changed: diff `evaluateTrio` against main and restore it before continuing.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/search/trios.ts packages/engine/src/score/score.ts packages/engine/src/recommend.ts packages/engine/src/analyze.ts packages/engine/src/teammates/suggest.ts packages/engine/test/search/trios.test.ts packages/engine/test/score/weighted-top.test.ts
git commit -m "Engine: an engaged facing profile weights drafting and the top ten"
```

---

### Task 7: End-to-end weighting on the fixture

**Files:**
- Test: `packages/engine/test/yourmeta/community-e2e.test.ts`
- Create: `fixtures/community-meta-sample.json`

**Interfaces:**
- Consumes: `recommend` with `facing: { kind: 'community', ... }` (Tasks 5, 6).
- Produces: `fixtures/community-meta-sample.json`, a synthetic `MetaSummaryV1` the web tests (Task 8) and screens (Task 12) reuse.

- [ ] **Step 1: Create the synthetic fixture**

`fixtures/community-meta-sample.json` (invented numbers; species are common Great League ids so they hit matrix columns):

```json
{
  "league": "great",
  "since": "2026-09-02T00:00:00.000Z",
  "until": "2026-09-24T00:10:00.000Z",
  "source": "all",
  "battles": 1240,
  "tanked": 31,
  "devices": 18,
  "bands": {},
  "sources": { "ladder": 1240 },
  "species": [
    { "speciesId": "medicham", "sightings": 410, "wins": 200, "losses": 210, "runs": 0, "runWins": 0, "runLosses": 0 },
    { "speciesId": "lanturn", "sightings": 330, "wins": 170, "losses": 160, "runs": 0, "runWins": 0, "runLosses": 0 },
    { "speciesId": "azumarill", "sightings": 120, "wins": 60, "losses": 60, "runs": 0, "runWins": 0, "runLosses": 0 }
  ],
  "teams": [],
  "previous": null,
  "tournament": {
    "events": 3,
    "battles": 212,
    "eventsOther": 0,
    "species": [
      { "speciesId": "medicham", "picks": 90, "game1Picks": 40, "wins": 45, "losses": 45, "unresolvedForms": 0 }
    ]
  },
  "generatedAt": "2026-09-24T00:05:00.000Z"
}
```

- [ ] **Step 2: Write the test**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { toSpecimens } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { recommend } from '../../src/recommend.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { profileFor } from '../../src/yourmeta/facing.js';
import { FIXTURES_DIR, REPO_ROOT, haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

const gmPath = path.join(REPO_ROOT, 'packages', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json');
const ready = haveStaticData() && fs.existsSync(gmPath);
const summary = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'community-meta-sample.json'), 'utf8'));
const window = { since: summary.since, until: summary.until, label: 'This meta' };

describe.skipIf(!ready)('community weighting end to end', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };

  it('a summary with nothing measured weights the columns in PvPoke order', () => {
    const empty = { battles: 0, devices: 0, species: [], tournament: null };
    const view = new MatrixView(data.matrix);
    const prior = profileFor(data, view, { kind: 'prior' });
    const community = profileFor(data, view, { kind: 'community', source: 'all', summary: empty, window });
    const order = (w: Map<string, number>): string[] =>
      [...new Set(view.opponents)].sort((a, b) => (w.get(b) ?? 0) - (w.get(a) ?? 0) || a.localeCompare(b));
    expect(order(community.weights)).toEqual(order(prior.weights));
    const rec = recommend(specimens, { facing: { kind: 'community', source: 'all', summary: empty, window } }, deps);
    expect(rec.assumptions.source).toBe('all');
    expect(rec.assumptions.facing).toMatch(/0% measured$/);
  });

  it('a measured summary changes the weighting and says so', () => {
    const rec = recommend(specimens, { facing: { kind: 'community', source: 'ladder', summary, window } }, deps);
    expect(rec.assumptions.facing).toMatch(/^Weighted by GBL play: 1,240 battles from 18 devices/);
    expect(rec.teams.length).toBeGreaterThanOrEqual(3);
  });
});
```

The first case checks weights, not teams. With zero data the community weights are PvPoke's prior (same order), but an engaged profile drafts by weight while PvPoke mode drafts by plain count, so the two modes' teams can legitimately differ (spec, Testing, "Zero data"). Order is compared on distinct species because `ranksOf` (community) and `metaRanks` (PvPoke) count ranks differently when `rankings.overall` repeats a species; both are monotone in the same order.

- [ ] **Step 3: Run it**

Run: `npx vitest run packages/engine/test/yourmeta/community-e2e.test.ts`
Expected: PASS (or the stop condition above).

- [ ] **Step 4: Commit**

```bash
git add fixtures/community-meta-sample.json packages/engine/test/yourmeta/community-e2e.test.ts
git commit -m "Engine: community weighting end to end on the fixture"
```

---

### Task 8: The web app's community read (`communityMeta.ts`)

**Files:**
- Create: `apps/web/src/communityMeta.ts`
- Test: `apps/web/test/communityMeta.test.ts`

**Interfaces:**
- Consumes: `resolveWindow`, `WindowKey`, `Epoch`, `CommunitySummary` from `@pickthree/engine/meta`; `COUNTER_ORIGIN` from `./counter.ts`; `League`, `Season` from `@pickthree/engine`.
- Produces:
  ```ts
  export interface CommunityPayload { summary: CommunitySummary; generatedAt: string }
  export interface CommunityRequest { league: string; since: string; until: string; label: string; key: string }
  export function communityLeague(league: Pick<League, 'id' | 'kind' | 'meta'>): string | null;
  export function communityRequest(league: Pick<League, 'id' | 'kind' | 'meta'>, window: WindowKey, seasons: readonly Season[], epochs: readonly Epoch[], now?: Date): CommunityRequest | null;
  export function trimSummary(body: unknown): CommunityPayload | null;
  export function loadCommunity(req: CommunityRequest, opts?: { fetcher?: typeof fetch; timeoutMs?: number }): Promise<CommunityPayload | null>;
  export function resetCommunityMetaCache(): void;
  export const WINDOW_LABELS: Record<WindowKey, string>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  communityLeague,
  communityRequest,
  loadCommunity,
  resetCommunityMetaCache,
  trimSummary,
} from '../src/communityMeta.ts';

const SAMPLE = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/community-meta-sample.json'), 'utf8'),
);
const SEASONS = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];
const GREAT = { id: 'great', kind: 'standard' as const, meta: 'great' };
const NOW = new Date('2026-09-24T00:03:00Z');

function ok(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}

beforeEach(() => resetCommunityMetaCache());

describe('communityLeague', () => {
  it('maps standard leagues to themselves, the Tournament cup to its meta league, specials to none', () => {
    expect(communityLeague(GREAT)).toBe('great');
    expect(communityLeague({ id: 'championshipseries', kind: 'cup', meta: 'great' })).toBe('great');
    expect(communityLeague({ id: 'halloween', kind: 'special', meta: 'halloween' })).toBeNull();
  });
});

describe('communityRequest', () => {
  it('resolves the window the way meta.pick3.gg does, bucketed', () => {
    const r = communityRequest(GREAT, '7', SEASONS, [], NOW)!;
    expect(r.until).toBe('2026-09-24T00:10:00.000Z');
    expect(r.label).toBe('7 days');
    expect(r.key).toBe(`great|${r.since}|${r.until}`);
  });

  it('is null for a league with no community data', () => {
    expect(communityRequest({ id: 'halloween', kind: 'special', meta: 'halloween' }, '7', SEASONS, [], NOW)).toBeNull();
  });
});

describe('trimSummary', () => {
  it('keeps only what the blend reads', () => {
    const p = trimSummary(SAMPLE)!;
    expect(p.generatedAt).toBe('2026-09-24T00:05:00.000Z');
    expect(p.summary.battles).toBe(1240);
    expect(p.summary.species[0]).toEqual({ speciesId: 'medicham', sightings: 410 });
    expect(p.summary.tournament).toEqual({ events: 3, battles: 212, species: [{ speciesId: 'medicham', picks: 90 }] });
  });

  it('rejects a wrong shape', () => {
    expect(trimSummary(null)).toBeNull();
    expect(trimSummary({ ...SAMPLE, species: 'x' })).toBeNull();
    expect(trimSummary({ ...SAMPLE, battles: '12' })).toBeNull();
    expect(trimSummary({ ...SAMPLE, generatedAt: undefined })).toBeNull();
  });

  it('treats a missing tournament block as none', () => {
    expect(trimSummary({ ...SAMPLE, tournament: undefined })!.summary.tournament).toBeNull();
  });
});

describe('loadCommunity', () => {
  it('asks for league, since and until only, and caches by key', async () => {
    const fetcher = ok(SAMPLE);
    const req = communityRequest(GREAT, 'meta', SEASONS, [], NOW)!;
    const a = await loadCommunity(req, { fetcher });
    const b = await loadCommunity(req, { fetcher });
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string);
    expect([...url.searchParams.keys()].sort()).toEqual(['league', 'since', 'until']);
    expect(url.pathname).toBe('/api/v1/meta');
  });

  it('falls back to null on a non-2xx, a network error, a bad body and a timeout', async () => {
    const req = communityRequest(GREAT, '7', SEASONS, [], NOW)!;
    expect(await loadCommunity(req, { fetcher: vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch })).toBeNull();
    resetCommunityMetaCache();
    expect(await loadCommunity(req, { fetcher: vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch })).toBeNull();
    resetCommunityMetaCache();
    expect(await loadCommunity(req, { fetcher: ok({ nope: true }) })).toBeNull();
    resetCommunityMetaCache();
    const never = vi.fn((_u: string, init?: RequestInit) =>
      new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    ) as unknown as typeof fetch;
    expect(await loadCommunity(req, { fetcher: never, timeoutMs: 10 })).toBeNull();
  });

  it('remembers a failure for its key, and a new bucket asks again', async () => {
    const bad = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const req = communityRequest(GREAT, '7', SEASONS, [], NOW)!;
    await loadCommunity(req, { fetcher: bad });
    await loadCommunity(req, { fetcher: bad });
    expect(bad).toHaveBeenCalledTimes(1);
    const later = communityRequest(GREAT, '7', SEASONS, [], new Date('2026-09-24T00:13:00Z'))!;
    await loadCommunity(later, { fetcher: bad });
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run apps/web/test/communityMeta.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `apps/web/src/communityMeta.ts`**

```ts
/**
 * The community meta, read for the Source picker (GBL, Tournaments, All).
 *
 * The request is league, since and until: what any meta.pick3.gg visitor sends. Picking a
 * community source is the player's consent to it, so the sharing switch does not gate this read
 * (it gates what the phone SENDS, and the automatic Suggest teammates read). No collection data,
 * no pinned Pokémon, no device id. One `all` response serves all three sources.
 *
 * It fails silent: offline, blocked, slow or malformed, the engine is told PvPoke and the
 * sentence says the community data was unavailable.
 *
 * Spec: docs/superpowers/specs/2026-09-24-source-weighted-recommendations-design.md
 */
import type { League, Season } from '@pickthree/engine';
import { resolveWindow, type CommunitySummary, type Epoch, type WindowKey } from '@pickthree/engine/meta';
import { COUNTER_ORIGIN } from './counter.ts';

export interface CommunityPayload {
  summary: CommunitySummary;
  generatedAt: string;
}

export interface CommunityRequest {
  /** The meta.pick3.gg league the data lives under. */
  league: string;
  since: string;
  until: string;
  label: string;
  /** league|since|until: the cache key, and what a stale result is recognised by. */
  key: string;
}

export const WINDOW_LABELS: Record<WindowKey, string> = {
  meta: 'This meta',
  '30': '30 days',
  '7': '7 days',
};

export const COMMUNITY_TIMEOUT_MS = 8_000;

/** Standard leagues are on the site; a shipped cup reads its meta league; specials have none. */
export function communityLeague(league: Pick<League, 'id' | 'kind' | 'meta'>): string | null {
  if (league.kind === 'standard') {
    return league.id;
  }
  if (league.kind === 'cup') {
    return league.meta;
  }
  return null;
}

export function communityRequest(
  league: Pick<League, 'id' | 'kind' | 'meta'>,
  window: WindowKey,
  seasons: readonly Season[],
  epochs: readonly Epoch[],
  now: Date = new Date(),
): CommunityRequest | null {
  const id = communityLeague(league);
  if (id === null) {
    return null;
  }
  const w = resolveWindow(window, { league: id, seasons, epochs }, now);
  return { league: id, since: w.since, until: w.until, label: w.label, key: `${id}|${w.since}|${w.until}` };
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The fields the blend reads, checked; anything else is dropped. Null when the shape is wrong. */
export function trimSummary(body: unknown): CommunityPayload | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const b = body as Record<string, unknown>;
  if (!isNum(b.battles) || !isNum(b.devices) || !Array.isArray(b.species) || typeof b.generatedAt !== 'string') {
    return null;
  }
  const species: { speciesId: string; sightings: number }[] = [];
  for (const s of b.species as unknown[]) {
    const r = s as Record<string, unknown>;
    if (typeof r?.speciesId !== 'string' || !isNum(r.sightings)) {
      return null;
    }
    species.push({ speciesId: r.speciesId, sightings: r.sightings });
  }
  let tournament: CommunitySummary['tournament'] = null;
  if (b.tournament !== undefined && b.tournament !== null) {
    const t = b.tournament as Record<string, unknown>;
    if (!isNum(t.events) || !isNum(t.battles) || !Array.isArray(t.species)) {
      return null;
    }
    const picks: { speciesId: string; picks: number }[] = [];
    for (const s of t.species as unknown[]) {
      const r = s as Record<string, unknown>;
      if (typeof r?.speciesId !== 'string' || !isNum(r.picks)) {
        return null;
      }
      picks.push({ speciesId: r.speciesId, picks: r.picks });
    }
    tournament = { events: t.events, battles: t.battles, species: picks };
  }
  return {
    summary: { battles: b.battles, devices: b.devices, species, tournament },
    generatedAt: b.generatedAt,
  };
}

/** One entry per request key. A null entry remembers a failure until the bucket moves. */
const cache = new Map<string, Promise<CommunityPayload | null>>();

export function resetCommunityMetaCache(): void {
  cache.clear();
}

export function loadCommunity(
  req: CommunityRequest,
  opts: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<CommunityPayload | null> {
  const hit = cache.get(req.key);
  if (hit) {
    return hit;
  }
  const fetcher = opts.fetcher ?? fetch;
  const p = (async () => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? COMMUNITY_TIMEOUT_MS);
    try {
      const q = new URLSearchParams({ league: req.league, since: req.since, until: req.until });
      const res = await fetcher(`${COUNTER_ORIGIN}/api/v1/meta?${q.toString()}`, { signal: abort.signal });
      if (!res.ok) {
        return null;
      }
      return trimSummary(await res.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(req.key, p);
  return p;
}
```

If `League` has no `meta` field in the engine type, run `grep -n "export interface League" -A25 packages/engine/src/gamedata/league.ts` and use the field that names the meta group league (`fakeHost.ts`'s `GREAT` shows `meta: 'great'`).

- [ ] **Step 4: Run it**

Run: `npx vitest run apps/web/test/communityMeta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/communityMeta.ts apps/web/test/communityMeta.test.ts
git commit -m "Web: read the community meta for a picked source, silently"
```

---

### Task 9: Settings, migration and the store speak `facing`

**Files:**
- Create: `apps/web/src/state/facing.ts`
- Modify: `apps/web/src/state/yourMeta.ts` (remove `yourMetaFrom`, keep `newId`)
- Modify: `apps/web/src/storage/db.ts` (Settings `facing`)
- Modify: `apps/web/src/host/protocol.ts` (ready result `epochs`)
- Modify: `apps/web/src/worker/engine.worker.ts` (boot loads `epochs.json`; bundle loads `legal/<id>.json`; `dataFor` sets `banned`)
- Modify: `apps/web/src/state/store.tsx` (`data.epochs`, `community` state, `ensureCommunity`, `facingNow`, `filterKey`, every `yourMeta()` call, `rec-done` key)
- Modify: `apps/web/src/components.tsx:505` (`useLogCount` or whichever hook calls `yourMetaFrom`)
- Modify: `apps/web/test/fakeHost.ts` (ready result `epochs: []`)
- Modify: web tests that assert `yourMeta` options (find with `grep -rln "yourMeta" apps/web/test`)
- Test: `apps/web/test/facing.test.ts`, additions to `apps/web/test/store.test.tsx`

**Interfaces:**
- Consumes: `FacingInput`, `FacingSource` (engine), `communityRequest`, `loadCommunity`, `CommunityPayload` (Task 8), `battlesInWindow`, `seasonWindow` (engine).
- Produces:
  ```ts
  // storage/db.ts, Settings
  facing?: { source?: FacingSource; window?: WindowKey };
  // state/facing.ts
  export interface FacingChoice { source: FacingSource; window: WindowKey }
  export function facingSettings(settings: Settings): FacingChoice;
  export function isCommunity(source: FacingSource): source is 'ladder' | 'tournament' | 'all';
  export function logBattles(sets: BattleSet[], seasons: Season[], settings: Settings, league: string, now?: Date): LoggedBattle[];
  export function facingInput(args: { choice: FacingChoice; battles: LoggedBattle[]; request: CommunityRequest | null; payload: CommunityPayload | null }): FacingInput;
  // store.tsx
  AppState.community: { key: string; payload: CommunityPayload | null } | null;
  AppState.data.epochs: Epoch[];
  export function filterKey(settings: Settings, logVersion?: number, community?: AppState['community']): string;
  Actions.ensureCommunity(): Promise<CommunityPayload | null>;
  ```

- [ ] **Step 1: Write the failing tests**

`apps/web/test/facing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { facingInput, facingSettings, isCommunity } from '../src/state/facing.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/storage/db.ts';

const REQ = { league: 'great', since: '2026-09-02T00:00:00.000Z', until: '2026-09-24T00:10:00.000Z', label: 'This meta', key: 'k' };
const PAYLOAD = { summary: { battles: 1, devices: 1, species: [], tournament: null }, generatedAt: 'g' };

function settings(over: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

describe('facingSettings', () => {
  it('reads an old save with the blend on (or absent) as Your log, This meta', () => {
    expect(facingSettings(settings({}))).toEqual({ source: 'log', window: 'meta' });
    expect(facingSettings(settings({ yourMeta: { blend: true } }))).toEqual({ source: 'log', window: 'meta' });
  });

  it('reads an old save with the blend off as PvPoke', () => {
    expect(facingSettings(settings({ yourMeta: { blend: false } })).source).toBe('prior');
  });

  it('prefers the new field when present', () => {
    expect(facingSettings(settings({ yourMeta: { blend: false }, facing: { source: 'all', window: '7' } }))).toEqual({
      source: 'all',
      window: '7',
    });
  });
});

describe('facingInput', () => {
  it('maps each source', () => {
    expect(facingInput({ choice: { source: 'prior', window: 'meta' }, battles: [], request: null, payload: null })).toEqual({ kind: 'prior' });
    expect(facingInput({ choice: { source: 'log', window: 'meta' }, battles: [], request: null, payload: null })).toEqual({ kind: 'log', battles: [] });
    expect(facingInput({ choice: { source: 'ladder', window: 'meta' }, battles: [], request: REQ, payload: PAYLOAD })).toEqual({
      kind: 'community',
      source: 'ladder',
      summary: PAYLOAD.summary,
      window: { since: REQ.since, until: REQ.until, label: 'This meta' },
    });
  });

  it('falls back to PvPoke, marked unavailable, with no payload or no request', () => {
    expect(facingInput({ choice: { source: 'all', window: '7' }, battles: [], request: REQ, payload: null })).toEqual({ kind: 'prior', unavailable: 'all' });
    expect(facingInput({ choice: { source: 'all', window: '7' }, battles: [], request: null, payload: null })).toEqual({ kind: 'prior', unavailable: 'all' });
  });

  it('isCommunity', () => {
    expect(isCommunity('ladder')).toBe(true);
    expect(isCommunity('log')).toBe(false);
  });
});
```

Add to `apps/web/test/store.test.tsx` (reuse its render + `Probe` pattern and `fakeHost()`):

```ts
it('passes the chosen facing to recommend and keys staleness on it', async () => {
  // Render the provider with fakeHost(), wait for boot, import or seed a collection the way the
  // file's existing recommend test does, then:
  await act(async () => {
    latest!.actions.updateSettings((cur) => ({ ...cur, facing: { source: 'prior', window: 'meta' } }));
  });
  await act(async () => {
    await latest!.actions.runRecommend();
  });
  const call = host.recommend.mock.calls.at(-1)!;
  expect(call[1].facing).toEqual({ kind: 'prior' });
  expect(latest!.state.recommendedWith).toContain('"source":"prior"');
});

it('asks for community data once and falls back to PvPoke when it cannot be read', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
  // ...same setup, with facing { source: 'ladder', window: '7' }...
  await act(async () => {
    await latest!.actions.runRecommend();
  });
  expect(host.recommend.mock.calls.at(-1)![1].facing).toEqual({ kind: 'prior', unavailable: 'ladder' });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  fetchSpy.mockRestore();
});
```

Match the file's existing names for the host spy and collection setup (read the nearest existing `runRecommend` test first and follow it exactly).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run apps/web/test/facing.test.ts apps/web/test/store.test.tsx`
Expected: FAIL, module `../src/state/facing.ts` not found; store assertions fail.

- [ ] **Step 3: Settings field in `storage/db.ts`**

Add to `Settings`, after `yourMeta`:

```ts
  /**
   * Whose opponents Teams, Counters and Build weight. Absent in older saves: the source reads as
   * Your log unless yourMeta.blend was false (then PvPoke), and the window as This meta.
   */
  facing?: {
    source?: FacingSource;
    window?: WindowKey;
  };
```

with `import type { FacingSource } from '@pickthree/engine';` and `import type { WindowKey } from '@pickthree/engine/meta';`. Update `yourMeta.blend`'s doc comment to say "Read only for migration; the Source picker replaced it."

- [ ] **Step 4: Write `state/facing.ts`**

```ts
import {
  battlesInWindow,
  seasonWindow,
  type BattleSet,
  type FacingInput,
  type FacingSource,
  type LoggedBattle,
  type Season,
} from '@pickthree/engine';
import type { WindowKey } from '@pickthree/engine/meta';
import type { CommunityPayload, CommunityRequest } from '../communityMeta.ts';
import type { Settings } from '../storage/db.ts';

export interface FacingChoice {
  source: FacingSource;
  window: WindowKey;
}

/** The saved choice, with the migration from the retired blend switch. */
export function facingSettings(settings: Settings): FacingChoice {
  const legacy: FacingSource = settings.yourMeta?.blend === false ? 'prior' : 'log';
  return {
    source: settings.facing?.source ?? legacy,
    window: settings.facing?.window ?? 'meta',
  };
}

export function isCommunity(source: FacingSource): source is 'ladder' | 'tournament' | 'all' {
  return source === 'ladder' || source === 'tournament' || source === 'all';
}

/** This season's battles for one league, after any fresh mark: what Your log weights by. */
export function logBattles(
  sets: BattleSet[],
  seasons: Season[],
  settings: Settings,
  league: string,
  now: Date = new Date(),
): LoggedBattle[] {
  const freshFrom = settings.yourMeta?.freshFrom?.[league] ?? null;
  return battlesInWindow(sets, seasonWindow(seasons, freshFrom, now));
}

export function facingInput(args: {
  choice: FacingChoice;
  battles: LoggedBattle[];
  request: CommunityRequest | null;
  payload: CommunityPayload | null;
}): FacingInput {
  const { choice } = args;
  if (choice.source === 'log') {
    return { kind: 'log', battles: args.battles };
  }
  if (!isCommunity(choice.source)) {
    return { kind: 'prior' };
  }
  if (!args.request || !args.payload) {
    return { kind: 'prior', unavailable: choice.source };
  }
  return {
    kind: 'community',
    source: choice.source,
    summary: args.payload.summary,
    window: { since: args.request.since, until: args.request.until, label: args.request.label },
  };
}
```

In `state/yourMeta.ts` delete `yourMetaFrom` and its now-unused imports; keep `newId`. Replace its caller in `components.tsx` (line ~505) with `logBattles(...)` plus whatever count that hook returns (read the hook; if it used `.battles.length`, use `logBattles(...).length`).

- [ ] **Step 5: Worker and protocol**

- `host/protocol.ts`, `kind: 'ready'` result: add

```ts
      /** Meta reset list (meta.pick3.gg's epochs.json). Empty when the data build predates it. */
      epochs: Epoch[];
```

  importing `type Epoch` from `@pickthree/engine/meta`.
- `worker/engine.worker.ts`:
  - `Env` gains `epochs: Epoch[]`; in `boot`'s `Promise.all` add `json<Epoch[]>('/data/epochs.json').catch(() => [] as Epoch[])` and return it; the `ready` post adds `epochs: env.epochs`.
  - `LeagueBundle` gains `banned: string[]`; in `bundleFor`'s `Promise.all` add `json<{ banned: string[] }>(`/data/legal/${id}.json`).catch(() => ({ banned: [] as string[] }))` and return `banned: legal.banned`.
  - `dataFor` adds `banned: b.banned`.
- `test/fakeHost.ts`: the ready result gains `epochs: []`.

- [ ] **Step 6: Store wiring in `state/store.tsx`**

- `AppState['data']` (the object with `seasons: Season[]` at line ~97): add `epochs: Epoch[]`; where the ready result is stored (line ~609) add `epochs: r.epochs`; where `seasons: cur.data?.seasons ?? []` is rebuilt (line ~1095) add `epochs: cur.data?.epochs ?? []`.
- `AppState`: add

```ts
  /** The community read for the current league and window: key league|since|until. */
  community: { key: string; payload: CommunityPayload | null } | null;
```

  initial value `null`; new action `{ type: 'community-done'; key: string; payload: CommunityPayload | null }` whose reducer case returns `{ ...s, community: { key: a.key, payload: a.payload } }`.
- `rec-done` action gains `key: string`; its reducer sets `recommendedWith: a.key` as well (the final key includes the community `generatedAt`, known only after the read).
- `filterKey`:

```ts
export function filterKey(
  settings: Settings,
  logVersion = 0,
  community: AppState['community'] = null,
): string {
  const choice = facingSettings(settings);
  return JSON.stringify({
    league: settings.league ?? 'great',
    logVersion,
    ...optionsFrom(settings),
    source: choice.source,
    window: isCommunity(choice.source) ? choice.window : null,
    community: isCommunity(choice.source) ? (community?.key ?? null) : null,
    generatedAt: isCommunity(choice.source) ? (community?.payload?.generatedAt ?? null) : null,
  });
}
```

- Replace the `yourMeta` callback with two:

```ts
  /** The community read for the current league and window, once per key; null when none applies. */
  const ensureCommunity = useCallback(async (): Promise<CommunityPayload | null> => {
    const s = stateRef.current;
    const choice = facingSettings(s.settings);
    const league = s.data?.leagues.find((l) => l.id === (s.settings.league ?? 'great'));
    if (!isCommunity(choice.source) || !league) {
      return null;
    }
    const req = communityRequest(league, choice.window, s.data?.seasons ?? [], s.data?.epochs ?? []);
    if (!req) {
      return null;
    }
    const payload = await loadCommunity(req);
    dispatch({ type: 'community-done', key: req.key, payload });
    return payload;
  }, []);

  /** The engine's facing input right now, reading the community first when the source needs it. */
  const facingNow = useCallback(async (): Promise<{ facing: FacingInput; community: AppState['community'] }> => {
    const s = stateRef.current;
    const league = s.settings.league ?? 'great';
    const choice = facingSettings(s.settings);
    const info = s.data?.leagues.find((l) => l.id === league);
    const request =
      isCommunity(choice.source) && info
        ? communityRequest(info, choice.window, s.data?.seasons ?? [], s.data?.epochs ?? [])
        : null;
    const payload = request ? await ensureCommunity() : null;
    const facing = facingInput({
      choice,
      battles: choice.source === 'log' ? logBattles(s.sets, s.data?.seasons ?? [], s.settings, league) : [],
      request,
      payload,
    });
    return { facing, community: request ? { key: request.key, payload } : null };
  }, [ensureCommunity]);
```

  Check the field name for the leagues list on `s.data` (`grep -n "leagues" apps/web/src/state/store.tsx | head`) and use it.
- `runRecommend`: dispatch `rec-start` with the provisional key first (this sets `recommending`, which stops the Teams effect from firing twice while the read is in flight), then

```ts
      const { facing, community } = await facingNow();
      const key = filterKey(s.settings, s.logVersion, community);
      const recommendation = await h.recommend(s.collection.specimens, { ...optionsFrom(s.settings), facing }, (p) =>
        dispatch({ type: 'rec-progress', progress: p }),
      );
      dispatch({ type: 'rec-done', recommendation, key });
```

- `loadCounters`, `findOrder`, `suggestTeammates`, `analyze`: replace `yourMeta: yourMeta()` with `facing: (await facingNow()).facing` (compute it once at the top of each `try`).
- Export `ensureCommunity` in the `Actions` interface and the actions object.
- `Teams.tsx`'s effect uses `filterKey(s.settings, s.logVersion)`; change it to `filterKey(s.settings, s.logVersion, s.community)` (the header work in Task 10 touches the rest of this file).
- Web tests asserting `yourMeta` in engine options: rewrite to the `facing` shapes above.

- [ ] **Step 7: Run the web suite and typecheck**

Run: `npx vitest run apps/web && npm run typecheck && npm run lint`
Expected: PASS everywhere. Task 5 left `apps/web` typecheck errors; they are all gone now.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/state/facing.ts apps/web/src/state/yourMeta.ts apps/web/src/storage/db.ts apps/web/src/host/protocol.ts apps/web/src/worker/engine.worker.ts apps/web/src/state/store.tsx apps/web/src/components.tsx apps/web/src/screens/Teams.tsx apps/web/test
git commit -m "Web: settings, worker and store carry the chosen facing to the engine"
```

---

### Task 10: The Teams header and the Filters sheet

**Files:**
- Create: `apps/web/src/screens/Filters.tsx`
- Modify: `apps/web/src/screens/Teams.tsx` (the `.chips` row, lines ~150-181)
- Modify: `apps/web/src/screens/Sheet.tsx` (remove the filters block lines ~72-150, the Excluded block ~152-170, and the "Use your log" toggle ~180-200)
- Modify: `apps/web/src/screens/YourMeta.tsx` (line ~240 `blendOn` copy)
- Modify: `apps/web/src/state/store.tsx` (`filtersOpen` state, `openFilters`/`closeFilters` actions)
- Modify: `apps/web/src/App.tsx` (render `<Filters />` when open, beside `<Sheet />`)
- Modify: `packages/ui/src/components/Select.tsx` (`disabled` prop)
- Modify: `apps/web/test/sheet.test.tsx` (the "Use your log" case becomes a Filters test)
- Test: `apps/web/test/teamsHeader.test.tsx`, `apps/web/test/filters.test.tsx`

**Interfaces:**
- Consumes: `facingSettings`, `isCommunity` (Task 9), `communityLeague`, `WINDOW_LABELS` (Task 8), `useLogCount` (existing).
- Produces:
  ```ts
  // packages/ui Select
  disabled?: boolean;
  // store
  AppState.filtersOpen: boolean; Actions.openFilters(): void; Actions.closeFilters(): void;
  // Teams.tsx
  export function filterCount(settings: Settings): number;
  export const SOURCE_LABELS: Record<FacingSource, string>;
  ```

- [ ] **Step 1: Write the failing tests**

`apps/web/test/teamsHeader.test.tsx` (follow `sheet.test.tsx`'s provider + `Probe` setup; seed a collection the way `store.test.tsx` does so Teams renders past `NoCollection`):

```ts
import { filterCount } from '../src/screens/Teams.tsx';
import { DEFAULT_SETTINGS } from '../src/storage/db.ts';

describe('filterCount', () => {
  it('counts the moved filters, a non-empty exclude list and a non-Any team style', () => {
    expect(filterCount(DEFAULT_SETTINGS)).toBe(0);
    expect(
      filterCount({
        ...DEFAULT_SETTINGS,
        filters: { ...DEFAULT_SETTINGS.filters, noXl: true, style: 'abb' },
        excludedSpecimenIds: ['x'],
      }),
    ).toBe(3);
  });
});

describe('Teams header', () => {
  it('shows labeled Source and Window selects and a Filters control, and no Team style chip', async () => {
    // render <Teams /> inside AppProvider with fakeHost() and a collection
    expect(screen.getByLabelText('Source')).toBeInTheDocument();
    expect(screen.getByLabelText('Window')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
    expect(screen.queryByText(/Team style:/)).toBeNull();
  });

  it('disables Window for PvPoke and Your log, enables it for GBL', async () => {
    const source = screen.getByLabelText('Source') as HTMLSelectElement;
    const windowSel = screen.getByLabelText('Window') as HTMLSelectElement;
    fireEvent.change(source, { target: { value: 'log' } });
    expect(windowSel).toBeDisabled();
    fireEvent.change(source, { target: { value: 'ladder' } });
    expect(windowSel).not.toBeDisabled();
    expect(latest!.state.settings.facing?.source).toBe('ladder');
  });

  it('greys the community sources for a league with no community data', async () => {
    // switch settings.league to a fakeHost league with kind 'special'; add one to fakeHost's
    // leagues if none exists
    const gbl = screen.getByRole('option', { name: /GBL/ }) as HTMLOptionElement;
    expect(gbl.disabled).toBe(true);
    expect(screen.getByText('No community data for this league')).toBeInTheDocument();
  });

  it('labels a community source that fell back', async () => {
    // facing { source: 'ladder' } and a recommendation whose assumptions.facing is the fallback
    // sentence (fakeHost's recommend returns what the test gives it)
    expect(screen.getByRole('option', { name: 'GBL (offline)' })).toBeInTheDocument();
  });
});
```

`apps/web/test/filters.test.tsx`:

```ts
describe('Teams Filters sheet', () => {
  it('toggles the same settings the old chips and Settings switches did', async () => {
    // render <Filters /> inside AppProvider
    fireEvent.click(screen.getByRole('button', { name: /No XL/ }));
    expect(latest!.state.settings.filters.noXl).toBe(true);
    fireEvent.change(screen.getByLabelText('Team style'), { target: { value: 'abb' } });
    expect(latest!.state.settings.filters.style).toBe('abb');
  });
});
```

Update `sheet.test.tsx`'s first case: it no longer finds "Use your log"; assert `screen.queryByRole('button', { name: /Use your log/ })` is null, `screen.queryByRole('button', { name: /No XL/ })` is null, and keep the Start fresh / Export log / Import log assertions.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run apps/web/test/teamsHeader.test.tsx apps/web/test/filters.test.tsx apps/web/test/sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `Select` gets `disabled`, and a disabled option**

In `packages/ui/src/components/Select.tsx`: add `disabled?: boolean` to `ChoiceOption` and to the props; pass `disabled={disabled}` to `<select>` and `disabled={o.disabled}` to each `<option>`. Default both to `false` via destructuring. Export `ChoiceOption` if it is not exported (`export interface ChoiceOption<T extends string>`). Run `npx vitest run packages/ui` after: PASS.

- [ ] **Step 4: Store: the Filters sheet's open state**

Mirror `sheetOpen`: `filtersOpen: boolean` (initial `false`), actions `{ type: 'filters'; open: boolean }`, reducer case, `navigate` resets it to `false` like `sheetOpen`, and `openFilters`/`closeFilters` callbacks exported on `Actions`.

- [ ] **Step 5: Write `screens/Filters.tsx`**

Move the `defs` switches, the Stardust budget block and the Excluded Pokémon block out of `Sheet.tsx` into this component verbatim (same classes, same `updateSettings` calls, same `toggleExcluded`), wrapped in the same overlay + `.sheet` markup `Sheet.tsx` uses, titled "Filters" (`role="dialog" aria-label="Filters"`, Done button calls `closeFilters`). Add Team style at the top:

```tsx
<Select<TeamStyle>
  label="Team style"
  value={f.style}
  options={[
    { value: 'any', label: 'Any' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'abb', label: 'ABB line' },
  ]}
  onChange={(style) => updateSettings((cur) => ({ ...cur, filters: { ...cur.filters, style } }))}
/>
```

Keep the "Filters apply once you have a collection." dimmed note. Render `{s.filtersOpen ? <Filters /> : null}` in `App.tsx` next to `<Sheet />`.

- [ ] **Step 6: The Teams header**

In `Teams.tsx`, export:

```ts
export const SOURCE_LABELS: Record<FacingSource, string> = {
  prior: 'PvPoke',
  log: 'Your log',
  ladder: 'GBL',
  tournament: 'Tournaments',
  all: 'All',
};

/** Active team filters: the four switches, a non-empty exclude list, a Team style other than Any. */
export function filterCount(settings: Settings): number {
  const f = settings.filters;
  return (
    [f.noXl, f.noShadow, f.noEliteTm, f.budget].filter(Boolean).length +
    (settings.excludedSpecimenIds.length > 0 ? 1 : 0) +
    (f.style !== 'any' ? 1 : 0)
  );
}
```

Replace the whole `<div className="chips">...</div>` block with:

```tsx
<div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
  <Select<FacingSource>
    label="Source"
    value={choice.source}
    options={sourceOptions}
    onChange={(source) => updateSettings((cur) => ({ ...cur, facing: { ...cur.facing, source } }))}
  />
  <Select<WindowKey>
    label="Window"
    value={choice.window}
    disabled={!isCommunity(choice.source) || !hasCommunity}
    options={(['meta', '30', '7'] as const).map((w) => ({ value: w, label: WINDOW_LABELS[w] }))}
    onChange={(window) => updateSettings((cur) => ({ ...cur, facing: { ...cur.facing, window } }))}
  />
  <Chip on={filters > 0} onClick={openFilters}>
    {filters > 0 ? `Filters: ${filters}` : 'Filters'}
  </Chip>
</div>
{!hasCommunity ? <span className="meta">No community data for this league</span> : null}
```

with, above the return:

```ts
  const choice = facingSettings(s.settings);
  const league = s.data?.leagues.find((l) => l.id === (s.settings.league ?? 'great'));
  const hasCommunity = league ? communityLeague(league) !== null : false;
  const fellBack =
    isCommunity(choice.source) && s.recommendation?.assumptions.facing.startsWith('PvPoke weights (community data unavailable)');
  const logLabel = logCount >= 15 ? 'Your log' : `Your log: ${logCount} of 15`;
  const sourceOptions = (Object.keys(SOURCE_LABELS) as FacingSource[]).map((value) => ({
    value,
    label:
      value === 'log'
        ? logLabel
        : value === choice.source && fellBack
          ? `${SOURCE_LABELS[value]} (offline)`
          : SOURCE_LABELS[value],
    disabled: isCommunity(value) && !hasCommunity,
  }));
  const filters = filterCount(s.settings);
```

Delete `styleLabel`, `cycleStyle`, `toggle` and the unused imports. Keep the "Build your own team" row and everything below it unchanged. The `.row` wrapper uses existing classes only; visual polish belongs to the design program.

- [ ] **Step 7: Settings sheet and Your Meta copy**

- `Sheet.tsx`: delete the moved blocks (Step 5) and the "Use your log" toggle; keep Start fresh, Export log, Import log, League, Appearance, sharing, diagnostics as they are.
- `YourMeta.tsx`: replace the copy that describes the blend switch (around `blendOn`, line ~240) with a line that reads `Pick "Your log" as the Source on Teams to weight teams by these battles.` and derive `blendOn` from `facingSettings(s.settings).source === 'log'`.

- [ ] **Step 8: Run the web suite, lint and typecheck**

Run: `npx vitest run apps/web packages/ui && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/screens/Filters.tsx apps/web/src/screens/Teams.tsx apps/web/src/screens/Sheet.tsx apps/web/src/screens/YourMeta.tsx apps/web/src/state/store.tsx apps/web/src/App.tsx packages/ui/src/components/Select.tsx apps/web/test/teamsHeader.test.tsx apps/web/test/filters.test.tsx apps/web/test/sheet.test.tsx
git commit -m "Web: Source and Window on Teams, team filters in their own sheet"
```

---

### Task 11: Suggest teammates reads the board with a window

**Files:**
- Modify: `apps/web/src/community.ts` (`communityCores`)
- Modify: `apps/web/src/state/store.tsx` (the `communityCores` call in `suggestTeammates`)
- Test: `apps/web/test/community.test.ts` (create if absent)

**Interfaces:**
- Consumes: `communityRequest` (Task 8), `facingSettings`, `isCommunity` (Task 9).
- Produces: `communityCores(settings: Settings, league: string, window: { since: string; until: string } | null): Promise<CommunityPairing[] | null>`; null window means no read.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { communityCores, resetCommunityCache } from '../src/community.ts';
import { DEFAULT_SETTINGS } from '../src/storage/db.ts';

afterEach(() => {
  resetCommunityCache();
  vi.restoreAllMocks();
});

describe('communityCores', () => {
  it('sends since and until, which the worker requires', async () => {
    vi.spyOn(await import('../src/metaShare.ts'), 'shareEligible').mockReturnValue(true);
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ cores: [] })));
    await communityCores(DEFAULT_SETTINGS, 'great', { since: '2026-09-17T00:00:00.000Z', until: '2026-09-24T00:00:00.000Z' });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.searchParams.get('since')).toBe('2026-09-17T00:00:00.000Z');
    expect(url.searchParams.get('until')).toBe('2026-09-24T00:00:00.000Z');
    expect(url.searchParams.get('league')).toBe('great');
  });
});
```

If `shareEligible` cannot be spied this way (ESM namespace), follow how existing web tests make `shareEligible()` true (`grep -rn "shareEligible" apps/web/test`).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run apps/web/test/community.test.ts`
Expected: FAIL, no `since` parameter.

- [ ] **Step 3: Implement**

`community.ts`: add the `window` parameter; return `null` when it is `null`; build the URL with `new URLSearchParams({ league, since: window.since, until: window.until })`; make the cache key `${league}|${window.since}|${window.until}`. Update the header comment: "The request says which league and window the player is in and nothing else."

`store.tsx` `suggestTeammates`: before the call,

```ts
      const choice = facingSettings(s.settings);
      const info = s.data?.leagues.find((l) => l.id === s.leagueInfo!.id);
      const boardWindow = info
        ? communityRequest(info, isCommunity(choice.source) ? choice.window : 'meta', s.data?.seasons ?? [], s.data?.epochs ?? [])
        : null;
      const community = await communityCores(s.settings, s.leagueInfo.id, boardWindow);
```

Note: `communityRequest` maps the Tournament league to `great`; pass `boardWindow.league` rather than `s.leagueInfo.id` if the board should follow the same mapping. The spec is silent; keep `s.leagueInfo.id` (today's behavior) and pass only the window.

- [ ] **Step 4: Run it and the web suite**

Run: `npx vitest run apps/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/community.ts apps/web/src/state/store.tsx apps/web/test/community.test.ts
git commit -m "Web: Suggest teammates asks the team board for a window, as the worker requires"
```

---

### Task 12: Screens, rules and docs

**Files:**
- Modify: `apps/web/scripts/screens.mjs`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-24-source-weighted-recommendations-design.md` (status line)

**Interfaces:**
- Consumes: `fixtures/community-meta-sample.json` (Task 7).

- [ ] **Step 1: Stub the worker in the screens pass**

In `apps/web/scripts/screens.mjs`, right after the `page.on('requestfailed', ...)` handler:

```js
// Automation never reads the live worker: the community meta is answered from the synthetic
// fixture, and every other worker call is refused, as before.
const communitySample = fs.readFileSync(path.join(repoRoot, 'fixtures', 'community-meta-sample.json'), 'utf8');
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().startsWith('https://pickthree-counter.travis-c82.workers.dev/api/v1/meta')) {
    void req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: communitySample });
    return;
  }
  void req.continue();
});
```

Use the script's existing names for `fs`, `path` and the repo root (read the top of the file; add `import fs from 'node:fs'` only if absent). If the script already intercepts requests, add the branch to the existing handler instead of a second one.

After the existing Teams shot (the one after `?sample=1` import, around line 113), add:

```js
console.log('teams, community source');
await page.evaluate(() => {
  const select = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Source'))?.querySelector('select');
  if (select) {
    select.value = 'ladder';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await page.waitForFunction(() => !document.querySelector('.progress'), { timeout: 60_000 });
await shot('teams-community');
```

Match the selector the script uses to detect a finished recommend if `.progress` is not it.

- [ ] **Step 2: Run the screens pass**

Run: `npm -w @pickthree/web run build && npm run web:screens`
Expected: completes with no console errors; `teams-community.png` written. Open it and check the header reads Source: GBL, and the assumptions on a team's Analysis page say "Weighted by GBL play: 1,240 battles from 18 devices".

- [ ] **Step 3: CLAUDE.md rules**

- In "Rules", the collection bullet: after "...all free of collection data." insert: "A community source the player picks on Teams (GBL, Tournaments, All) reads `/api/v1/meta` for the league and window; that choice is its own consent, so it does not follow the sharing switch. Automatic reads, like the Suggest teammates board, still do."
- In "Rules", the meta.pick3.gg bullet: replace "The 300, 5, 100 and 2 constants stay in `apps/meta/src/rank.ts` as the blends' half-say points" with "The 300, 5, 100 and 2 constants live in `@pickthree/engine/meta` (`meta/community.ts`) beside `communityWeights`, re-exported from `apps/meta/src/rank.ts`, as the blends' half-say points".
- In "Architecture > Engine", after the `yourmeta/` line add: "`yourmeta/facing.ts`: one `FacingInput` (PvPoke, your log, or a community source) for every entry point; an engaged profile also weights drafting."
- In "Architecture > Web app", add a bullet: "`communityMeta.ts` reads the community meta for the Teams Source picker; `state/facing.ts` turns the choice into the engine's `FacingInput`. Team filters live in the Teams Filters sheet (`screens/Filters.tsx`)."
- In "Architecture > Data build" step 2's file list, add `legal/`, `epochs.json`.
- In "Architecture > Meta site", note that the blend, window and ban-list code now lives in `@pickthree/engine/meta`.

- [ ] **Step 4: Spec touch-ups**

In the spec, set the status line to "Status: implemented YYYY-MM-DD (the day this lands), plan docs/superpowers/plans/2026-09-24-source-weighted-recommendations.md."

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm -w @pickthree/meta run build && npm run meta:screens`
Expected: all PASS; `pvpoke-baseline` matched, 0 written.

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/screens.mjs CLAUDE.md docs/superpowers/specs/2026-09-24-source-weighted-recommendations-design.md
git commit -m "Docs and screens: the Source picker, its consent rule, and a stubbed community shot"
```
