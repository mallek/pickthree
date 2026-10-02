# Collection Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Pokemon a permanent id, make a re-import merge into the stored collection instead of replacing it, and let one pinned copy per species per league be the only one the engine fields.

**Architecture:** Three pure engine modules under `packages/engine/src/collection/` (`pins.ts`, `merge.ts`, `evolve.ts`). The pin is honored at the one step of `candidatePool` that already keeps one copy per species, and through `fieldedBuilds` in Counters and Analyze. The worker's import handler merges when the store hands it the prior collection. Storage gains optional fields only.

**Tech Stack:** TypeScript 5.9 strict, vitest 4, React 19, idb.

**Spec:** `docs/superpowers/specs/2026-10-01-collection-model-design.md`

## Global Constraints

- Braces on all control flow. No em dashes anywhere. Exact pinned versions (no new dependencies here).
- Player-facing copy is 7-bit ASCII except the app's existing "Pokémon".
- Tests use synthetic data for logic; on live PvPoke data assert invariants only, never values.
- The collection never leaves the device: no new network call.
- No database version bump: every new stored field is optional with a default.
- Stage explicit paths. Never push.
- Engine tests: `npx vitest run packages/engine/test/<path>`. Web tests: `npx vitest run apps/web/test/<file>`.

## Review Focus

1. A stored Pokemon and a new scan row hash to the same id although they did not pair: the new one must get a fresh id, never overwrite. (Task 3)
2. A scan file with no dates at all (a hand-made sheet): import must still update, not freeze the collection. (Task 3)
3. A pin naming a Pokemon that is gone or cannot be that species in this league: default pick, no crash. (Task 1)
4. A save written before this change (no `removed`, `pins`, `editedAt`): loads, imports and removes without error. (Tasks 6, 7)
5. Pinned copy fails a filter (budget, XL): the species sits out; the engine must not silently field another copy. (Task 2)

---

### Task 1: Pins (`collection/pins.ts`)

**Files:**
- Create: `packages/engine/src/collection/pins.ts`
- Modify: `packages/engine/src/builds/eligibility.ts` (add `pins` to `BuildOptions`, receive `isAlreadyBuilt`)
- Modify: `packages/engine/src/verdicts/worth.ts` (import `isAlreadyBuilt` instead of defining it)
- Modify: `packages/engine/test/verdicts/worth.test.ts` (import path)
- Modify: `packages/engine/src/index.ts` (export)
- Test: `packages/engine/test/collection/pins.test.ts`

**Interfaces:**
- Produces: `type PinMap = Record<string, string | null>`; `comparePicks(a: Build, b: Build): number`; `defaultPick(builds: readonly Build[]): Build | null`; `resolvePick(passing: readonly Build[], all: readonly Build[], pin: string | null | undefined): Build | null`; `fieldedBuilds(builds: readonly Build[], pins?: PinMap): Build[]`; `dropPins(pins: Record<string, PinMap>, ids: ReadonlySet<string>): Record<string, PinMap>`; `BuildOptions.pins?: PinMap`.

- [ ] **Step 1: Move `isAlreadyBuilt`.** Cut the function and its comment from `verdicts/worth.ts` into `builds/eligibility.ts` (after `buildOptionsFor`), typed `specimen: Pick<Specimen, 'level'>`. In `worth.ts` add it to the import from `../builds/eligibility.js`. In `worth.test.ts` import it from `../../src/builds/eligibility.js`. Add to `BuildOptions`:

```ts
  /** This league's pins by battling species. Absent means every species uses the default pick. */
  pins?: PinMap;
```

with `import type { PinMap } from '../collection/pins.js';`.

- [ ] **Step 2: Write the failing test** `packages/engine/test/collection/pins.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Build } from '../../src/builds/eligibility.js';
import {
  comparePicks,
  defaultPick,
  dropPins,
  fieldedBuilds,
  resolvePick,
} from '../../src/collection/pins.js';

/** A hand-made build: only what the pick order reads. */
function build(
  id: string,
  rank: number,
  over: { species?: string; stage?: number; at?: number; to?: number } = {},
): Build {
  const to = over.to ?? 30;
  return {
    specimenId: id,
    specimen: { id, level: { min: over.at ?? 10, max: over.at ?? 10 } },
    speciesId: over.species ?? 'umbreon',
    stageOffset: over.stage ?? 0,
    level: to,
    baseLevel: to,
    mega: null,
    ivRank: { rank, total: 4096 },
  } as unknown as Build;
}

describe('the default pick', () => {
  it('takes a built copy in the top 25% over a better unbuilt one', () => {
    const built = build('built', 900, { at: 30 });
    const better = build('better', 12);
    expect(defaultPick([better, built])?.specimenId).toBe('built');
  });

  it('a built copy outside the top 25% gets no head start', () => {
    const built = build('built', 3000, { at: 30 });
    const better = build('better', 12);
    expect(defaultPick([built, better])?.specimenId).toBe('better');
  });

  it('then IV rank, then fewer evolutions, then fewer levels, then id', () => {
    const order = [
      build('d', 50, { stage: 1 }),
      build('c', 50, { at: 10 }),
      build('b', 50, { at: 20 }),
      build('a2', 7),
      build('a1', 7),
    ].sort(comparePicks);
    expect(order.map((b) => b.specimenId)).toEqual(['a1', 'a2', 'b', 'c', 'd']);
  });

  it('is null with nothing to pick', () => {
    expect(defaultPick([])).toBeNull();
  });
});

describe('resolvePick', () => {
  const a = build('a', 5);
  const b = build('b', 80);

  it('no pin is the default pick', () => {
    expect(resolvePick([a, b], [a, b], undefined)?.specimenId).toBe('a');
  });

  it('an override wins over a better copy', () => {
    expect(resolvePick([a, b], [a, b], 'b')?.specimenId).toBe('b');
  });

  it('unpinned fields nothing', () => {
    expect(resolvePick([a, b], [a, b], null)).toBeNull();
  });

  it('a stale pin falls back to the default pick', () => {
    expect(resolvePick([a, b], [a, b], 'gone')?.specimenId).toBe('a');
  });

  it('a pinned copy that fails a filter sits the species out', () => {
    expect(resolvePick([a], [a, b], 'b')).toBeNull();
  });
});

describe('fieldedBuilds', () => {
  it('keeps one build per battling species, by its pin', () => {
    const eevee = (species: string): Build => build('eevee', 9, { species, stage: 1 });
    const builds = [
      build('u1', 300),
      eevee('umbreon'),
      eevee('vaporeon'),
      build('v1', 4, { species: 'vaporeon' }),
      build('s1', 1, { species: 'sylveon' }),
    ];
    const got = fieldedBuilds(builds, { vaporeon: 'eevee', sylveon: null });
    expect(got.map((b) => `${b.speciesId}:${b.specimenId}`).sort()).toEqual([
      'umbreon:eevee',
      'vaporeon:eevee',
    ]);
  });
});

describe('dropPins', () => {
  it('forgets pins that named a removed Pokemon and keeps the rest', () => {
    const pins = { great: { umbreon: 'x', medicham: null, azumarill: 'y' }, ultra: { umbreon: 'x' } };
    expect(dropPins(pins, new Set(['x']))).toEqual({ great: { medicham: null, azumarill: 'y' } });
  });
});
```

- [ ] **Step 3: Run it.** `npx vitest run packages/engine/test/collection/pins.test.ts`. Expected: FAIL, cannot resolve `pins.js`.

- [ ] **Step 4: Implement** `packages/engine/src/collection/pins.ts`:

```ts
import { isAlreadyBuilt, type Build } from '../builds/eligibility.js';

/**
 * One league's pins, by the species as it battles (a build's speciesId, so the Umbreon pin can
 * name an Eevee and a Shadow form has its own). No entry: the default pick. An id: the player's
 * override. null: unpinned, none of the player's copies is fielded.
 */
export type PinMap = Record<string, string | null>;

/** A built copy leads the default pick only inside this share of the IV ranks. */
export const BUILT_TOP_PCT = 25;

function builtAndGood(b: Build): boolean {
  const pct = Math.max(1, Math.round((b.ivRank.rank / b.ivRank.total) * 100));
  return pct <= BUILT_TOP_PCT && isAlreadyBuilt(b, b.specimen);
}

/**
 * The order copies of one battling species are picked in: a built copy with good IVs, then IV
 * rank, then fewest evolutions to go, then fewest levels to go, then the id. "Best verdict, then
 * IV rank" without a simulation.
 */
export function comparePicks(a: Build, b: Build): number {
  const tier = Number(!builtAndGood(a)) - Number(!builtAndGood(b));
  if (tier !== 0) {
    return tier;
  }
  const togo = (x: Build): number => x.baseLevel - x.specimen.level.max;
  return (
    a.ivRank.rank - b.ivRank.rank ||
    a.stageOffset - b.stageOffset ||
    togo(a) - togo(b) ||
    (a.specimenId < b.specimenId ? -1 : a.specimenId > b.specimenId ? 1 : 0)
  );
}

export function defaultPick(builds: readonly Build[]): Build | null {
  return [...builds].sort(comparePicks)[0] ?? null;
}

/**
 * The fielded build of one species. `passing` are its builds that passed the caller's filters,
 * `all` every build of it. An override names a copy: fielded when it passed, nothing when it has
 * a build that did not (the player's word is not swapped), the default when it has no build of
 * this species at all (a stale pin).
 */
export function resolvePick(
  passing: readonly Build[],
  all: readonly Build[],
  pin: string | null | undefined,
): Build | null {
  if (pin === null) {
    return null;
  }
  if (pin !== undefined && all.some((b) => b.specimenId === pin)) {
    return passing.find((b) => b.specimenId === pin) ?? null;
  }
  return defaultPick(passing);
}

/** One build per battling species: the pinned copy's, or the default pick's. */
export function fieldedBuilds(builds: readonly Build[], pins: PinMap = {}): Build[] {
  const bySpecies = new Map<string, Build[]>();
  for (const b of builds) {
    const list = bySpecies.get(b.speciesId) ?? [];
    list.push(b);
    bySpecies.set(b.speciesId, list);
  }
  const out: Build[] = [];
  for (const [speciesId, list] of bySpecies) {
    const pick = resolvePick(list, list, pins[speciesId]);
    if (pick) {
      out.push(pick);
    }
  }
  return out;
}

/** Every league's pins without the ones that named these Pokemon. Empty leagues are dropped. */
export function dropPins(
  pins: Record<string, PinMap>,
  ids: ReadonlySet<string>,
): Record<string, PinMap> {
  const out: Record<string, PinMap> = {};
  for (const [league, map] of Object.entries(pins)) {
    const kept = Object.entries(map).filter(([, v]) => v === null || !ids.has(v));
    if (kept.length > 0) {
      out[league] = Object.fromEntries(kept);
    }
  }
  return out;
}
```

Add `export * from './collection/pins.js';` to `packages/engine/src/index.ts` after the `manual.js` line.

- [ ] **Step 5: Run.** `npx vitest run packages/engine/test/collection/pins.test.ts packages/engine/test/verdicts` then `npm -w @pickthree/engine run typecheck`. Expected: PASS, no type errors.

- [ ] **Step 6: Commit** `Engine: pins and the default pick` (pins.ts, eligibility.ts, worth.ts, index.ts, both tests).

---

### Task 2: The engine fields only the pin

**Files:**
- Modify: `packages/engine/src/search/candidates.ts` (best-per-species step)
- Modify: `packages/engine/src/counters/counters.ts` (`ownedBuilds`, `CountersOptions.pins`)
- Modify: `packages/engine/src/analyze.ts` (`resolvePick` for `preferOwned`)
- Test: `packages/engine/test/search/candidates.test.ts` (extend), `packages/engine/test/analyze.test.ts` or a new `packages/engine/test/collection/pinsFielded.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `CountersOptions.pins?: PinMap`. `candidatePool`, `analyzeTeam`, `suggestTeammates`, `recommend` read `opts.pins` (already on `BuildOptions`).

- [ ] **Step 1: Write the failing tests** in a new `packages/engine/test/collection/pinsFielded.test.ts` (live data, invariants only):

```ts
import { describe, expect, it } from 'vitest';
import { analyzeTeam } from '../../src/analyze.js';
import { DEFAULT_BUILD_OPTIONS, buildsFor, type Build } from '../../src/builds/eligibility.js';
import type { PinMap } from '../../src/collection/pins.js';
import type { Specimen } from '../../src/collection/specimen.js';
import { metaCounters } from '../../src/counters/counters.js';
import type { RawScan } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { candidatePool } from '../../src/search/candidates.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';

function eevee(id: string, atk: number): Specimen {
  return {
    id,
    speciesId: 'eevee',
    familyId: null,
    ivs: { atk, def: 15, sta: 15 },
    level: { min: 18, max: 18 },
    cp: 509,
    hp: 91,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-01 00:00',
    raw: {} as RawScan,
  };
}

describe.skipIf(!haveStaticData())('the engine fields the pin', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const view = new MatrixView(data.matrix);
  const copies = [eevee('e1', 0), eevee('e2', 1)];
  const builds: Build[] = copies.flatMap((s) => buildsFor(s, index, DEFAULT_BUILD_OPTIONS));
  const poolOf = (pins: PinMap, extra: object = {}) =>
    candidatePool(builds, data.rankings, view, index, {
      ...DEFAULT_BUILD_OPTIONS,
      poolSize: 100,
      excludedSpecimenIds: [],
      excludedSpecies: [],
      pins,
      ...extra,
    }).pool;
  const umbreon = (pool: ReturnType<typeof poolOf>) =>
    pool.find((c) => c.build.speciesId === 'umbreon');

  it('candidatePool fields the other copy when it is pinned, for that species only', () => {
    const def = umbreon(poolOf({}))?.build.specimenId as string;
    const other = def === 'e1' ? 'e2' : 'e1';
    const pinned = poolOf({ umbreon: other });
    expect(umbreon(pinned)?.build.specimenId).toBe(other);
    for (const c of pinned.filter((x) => x.build.speciesId !== 'umbreon')) {
      expect(c.build.specimenId).toBe(def);
    }
  });

  it('an unpinned species leaves the pool and the others stay', () => {
    const all = poolOf({});
    const without = poolOf({ umbreon: null });
    expect(umbreon(without)).toBeUndefined();
    expect(without.length).toBe(all.length - 1);
  });

  it('a pinned copy the filters drop is not swapped for another', () => {
    const pool = poolOf({ umbreon: 'e2' }, { excludedSpecimenIds: ['e2'] });
    expect(umbreon(pool)).toBeUndefined();
  });

  it('a stale pin is the default pick', () => {
    const def = umbreon(poolOf({}))?.build.specimenId;
    expect(umbreon(poolOf({ umbreon: 'gone' }))?.build.specimenId).toBe(def);
  });

  it('Counters marks the pinned copy as the owned one, and none when unpinned', () => {
    const owned = (pins: PinMap) =>
      metaCounters(
        { matrix: data.matrix, rankings: data.rankings, meta: data.meta },
        copies,
        index,
        { limit: 2000, pins },
      ).entries.find((e) => e.speciesId === 'umbreon');
    expect(owned({ umbreon: 'e2' })?.ownedSpecimenId).toBe('e2');
    expect(owned({ umbreon: null })?.owned).toBe('none');
  });

  it('Analyze runs the pinned copy for a species pick, and a stand-in when unpinned', () => {
    const run = (pins: PinMap) =>
      analyzeTeam(
        [
          { kind: 'species', id: 'umbreon', preferOwned: true },
          { kind: 'species', id: 'azumarill' },
          { kind: 'species', id: 'medicham' },
        ],
        copies,
        { order: 'given', pins },
        { data, sim: { simulate: () => ({ rating: 500 }) } as never },
      );
    const slot = (pins: PinMap) =>
      run(pins).team.slots.find((s) => s.candidate.build.speciesId === 'umbreon');
    expect(slot({ umbreon: 'e2' })?.candidate.build.specimenId).toBe('e2');
    expect(run({ umbreon: null }).hypothetical).toContain('umbreon');
  });
});
```

If `analyzeTeam` needs a richer simulator stub than `{ rating: 500 }`, copy the stub `packages/engine/test/analyze.test.ts` already uses.

- [ ] **Step 2: Run.** Expected: FAIL (pins ignored: the pinned-copy assertions fail; `pins` is not a `CountersOptions` key).

- [ ] **Step 3: `candidatePool`.** In `search/candidates.ts` import `resolvePick` from `../collection/pins.js`. Before the loop, collect every build per species:

```ts
  const everyBuild = new Map<string, Build[]>();
  for (const build of builds) {
    const list = everyBuild.get(build.speciesId) ?? [];
    list.push(build);
    everyBuild.set(build.speciesId, list);
  }
```

Replace the "Best specimen per species" block with:

```ts
  // One copy per species: the pinned one, or the default pick among the copies that passed.
  const passing = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = passing.get(c.build.speciesId) ?? [];
    list.push(c);
    passing.set(c.build.speciesId, list);
  }
  const fielded: Candidate[] = [];
  for (const [speciesId, list] of passing) {
    const pick = resolvePick(
      list.map((c) => c.build),
      everyBuild.get(speciesId) ?? [],
      opts.pins?.[speciesId],
    );
    const chosen = pick ? list.find((c) => c.build === pick) : undefined;
    if (chosen) {
      fielded.push(chosen);
    }
  }
  const pool = fielded.sort((a, b) => b.score - a.score).slice(0, opts.poolSize);
```

- [ ] **Step 4: Counters.** In `counters.ts` add `pins?: PinMap` to `CountersOptions` (comment: "This league's pins. Absent means default picks."), and make `ownedBuilds` take it:

```ts
function ownedBuilds(
  specimens: Specimen[],
  index: GameDataIndex,
  opts: BuildOptions,
  pins: PinMap | undefined,
): Map<string, Build> {
  const all = specimens.flatMap((s) => buildsFor(s, index, opts));
  return new Map(fieldedBuilds(all, pins).map((b) => [b.speciesId, b]));
}
```

Call it with `opts.pins`.

- [ ] **Step 5: Analyze.** In `analyze.ts` `resolvePick`, replace the `preferOwned` loop with:

```ts
    if (pick.preferOwned) {
      const mine = specimens
        .flatMap((sp) => buildsFor(sp, index, opts))
        .filter((b) => b.speciesId === pick.id);
      const best = fieldedBuilds(mine, opts.pins)[0];
      if (best) {
        return { build: best, hypothetical: false };
      }
    }
```

- [ ] **Step 6: Run** the new test plus `npx vitest run packages/engine`. Fix tests that pinned the old tie-breaks only where the new default order is what the spec says (Counters: a top-ranked lower stage now beats a poorly ranked evolved copy unless that copy is built and top 25%).

- [ ] **Step 7: Commit** `Engine: teams, Analyze and Counters field the pinned copy`.

---

### Task 3: Merge (`collection/merge.ts`)

**Files:**
- Create: `packages/engine/src/collection/merge.ts`
- Modify: `packages/engine/src/collection/specimen.ts` (`editedAt`, `evolvedFrom`, `ImportReport.merge`)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/collection/merge.test.ts`, shared helper `packages/engine/test/collection/synthetic.ts`

**Interfaces:**
- Produces:

```ts
export interface RemovedMark { key: string; speciesId: string; removedAt: string }
export interface MergeBreakdown { added: number; merged: number; updated: number; skipped: number; notInScan: string[] }
export interface MergeResult { specimens: Specimen[]; breakdown: MergeBreakdown }
export function localStamp(d: Date): string;            // 'YYYY-MM-DD HH:MM:SS', local time
export function matchKey(s: Pick<Specimen, 'speciesId' | 'shadow' | 'ivs' | 'cp' | 'hp'>, index: GameDataIndex): string;
export function mergeScan(existing: readonly Specimen[], removed: readonly RemovedMark[], scanned: readonly Specimen[], index: GameDataIndex, now: string): MergeResult;
export function removeSpecimens(existing: readonly Specimen[], removed: readonly RemovedMark[], ids: ReadonlySet<string>, index: GameDataIndex, now: string): { specimens: Specimen[]; removed: RemovedMark[] };
export function clearMark(removed: readonly RemovedMark[], s: Specimen, index: GameDataIndex): RemovedMark[];
```

- `Specimen.editedAt?: string`, `Specimen.evolvedFrom?: string`, `ImportReport.merge?: MergeBreakdown`.

- [ ] **Step 1: Types.** In `specimen.ts` add to `Specimen`:

```ts
  /** Last edit made in pick3, phone-local 'YYYY-MM-DD HH:MM:SS'. Absent means never edited. */
  editedAt?: string;
  /** The species this Pokemon was before it was evolved in pick3. Absent means not evolved here. */
  evolvedFrom?: string;
```

and to `ImportReport`:

```ts
  /** What a re-import did to the stored collection. Absent on a first import and older saves. */
  merge?: MergeBreakdown;
```

with `import type { MergeBreakdown } from './merge.js';`.

- [ ] **Step 2: Synthetic helper** `packages/engine/test/collection/synthetic.ts`:

```ts
import type { Specimen } from '../../src/collection/specimen.js';
import type { RawScan } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import type { Species } from '../../src/gamedata/types.js';

function species(id: string, evolutionIds: string[], parentId: string | null): Species {
  return {
    speciesId: id,
    speciesName: id,
    dex: 1,
    types: ['normal', 'none'],
    baseStats: { atk: 100 + id.length * 7, def: 120, hp: 150 },
    fastMoves: [],
    chargedMoves: [],
    eliteMoves: [],
    legacyMoves: [],
    tags: id.endsWith('_shadow') ? ['shadow'] : [],
    familyId: 'FAMILY',
    parentId,
    evolutionIds,
    shadow: id.endsWith('_shadow'),
    shadowEligible: false,
    released: true,
    thirdMoveCost: 10000,
    levelCap: null,
    levelFloor: null,
    greatLeagueIneligible: false,
    defaultIVs: {},
    formChange: null,
  };
}

/** A made-up dex: a branching line, a regional pair that share nothing, and a Shadow line. */
export function syntheticIndex(): GameDataIndex {
  return new GameDataIndex(
    [
      species('eevee', ['umbreon', 'vaporeon'], null),
      species('umbreon', [], 'eevee'),
      species('vaporeon', [], 'eevee'),
      species('stunfisk', [], null),
      species('stunfisk_galarian', [], null),
      species('mudkip', ['swampert'], null),
      species('swampert', [], 'mudkip'),
      species('mudkip_shadow', [], null),
      species('swampert_shadow', [], null),
    ],
    [],
  );
}

export function mon(id: string, speciesId: string, over: Partial<Specimen> = {}): Specimen {
  return {
    id,
    speciesId,
    familyId: 'FAMILY',
    ivs: { atk: 1, def: 15, sta: 13 },
    level: { min: 14, max: 14 },
    cp: 400,
    hp: 80,
    shadow: speciesId.endsWith('_shadow'),
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-01 10:00',
    raw: {} as RawScan,
    ...over,
  };
}
```

- [ ] **Step 3: Write the failing test** `packages/engine/test/collection/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clearMark,
  localStamp,
  mergeScan,
  removeSpecimens,
} from '../../src/collection/merge.js';
import { mon, syntheticIndex } from './synthetic.js';

const index = syntheticIndex();
const NOW = '2026-10-01 12:00:00';
const later = { scannedAt: '2026-09-08 10:00' };

describe('localStamp', () => {
  it('is local wall-clock time in the frame scan dates use', () => {
    expect(localStamp(new Date(2026, 9, 1, 7, 5, 9))).toBe('2026-10-01 07:05:09');
  });
});

describe('mergeScan', () => {
  it('a first import adds everything', () => {
    const r = mergeScan([], [], [mon('a', 'eevee'), mon('b', 'stunfisk')], index, NOW);
    expect(r.specimens.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(r.breakdown).toEqual({ added: 2, merged: 0, updated: 0, skipped: 0, notInScan: [] });
  });

  it('the same file again changes nothing', () => {
    const have = [mon('a', 'eevee')];
    const r = mergeScan(have, [], [mon('a', 'eevee')], index, NOW);
    expect(r.specimens).toEqual(have);
    expect(r.breakdown).toMatchObject({ added: 0, merged: 1, updated: 0 });
  });

  it('a newer scan of a powered-up Pokemon updates it and keeps its id', () => {
    const have = [mon('old', 'eevee', { megaLevel4: true })];
    const scan = mon('new', 'eevee', { ...later, level: { min: 20, max: 20 }, cp: 560 });
    const r = mergeScan(have, [], [scan], index, NOW);
    expect(r.specimens).toHaveLength(1);
    expect(r.specimens[0]).toMatchObject({ id: 'old', cp: 560, megaLevel4: true });
    expect(r.specimens[0]?.level.max).toBe(20);
    expect(r.breakdown).toMatchObject({ added: 0, merged: 1, updated: 1 });
  });

  it('an edit newer than the scan is kept', () => {
    const have = [mon('old', 'eevee', { cp: 600, editedAt: '2026-09-20 09:00:00' })];
    const r = mergeScan(have, [], [mon('new', 'eevee', later)], index, NOW);
    expect(r.specimens[0]).toMatchObject({ id: 'old', cp: 600 });
    expect(r.breakdown).toMatchObject({ merged: 1, updated: 0 });
  });

  it('a scan newer than the edit wins', () => {
    const have = [mon('old', 'eevee', { cp: 600, editedAt: '2026-09-05 09:00:00' })];
    const r = mergeScan(have, [], [mon('new', 'eevee', { ...later, cp: 610 })], index, NOW);
    expect(r.specimens[0]).toMatchObject({ id: 'old', cp: 610, editedAt: '2026-09-05 09:00:00' });
  });

  it('an Eevee evolved since the last scan comes back as the same Pokemon', () => {
    const r = mergeScan([mon('old', 'eevee')], [], [mon('new', 'umbreon', later)], index, NOW);
    expect(r.specimens).toHaveLength(1);
    expect(r.specimens[0]).toMatchObject({ id: 'old', speciesId: 'umbreon' });
  });

  it('never matches across regional forms or across the Shadow flag', () => {
    const have = [mon('k', 'stunfisk'), mon('m', 'mudkip')];
    const scans = [mon('g', 'stunfisk_galarian', later), mon('s', 'mudkip_shadow', later)];
    const r = mergeScan(have, [], scans, index, NOW);
    expect(r.breakdown).toMatchObject({ added: 2, merged: 0, notInScan: ['k', 'm'] });
    expect(r.specimens).toHaveLength(4);
  });

  it('two with the same IVs pair by species, then by the closest level', () => {
    const have = [
      mon('low', 'eevee', { level: { min: 10, max: 10 } }),
      mon('high', 'eevee', { level: { min: 30, max: 30 } }),
      mon('umb', 'umbreon'),
    ];
    const scans = [
      mon('s-umb', 'umbreon', { ...later, cp: 1 }),
      mon('s-31', 'eevee', { ...later, level: { min: 31, max: 31 }, cp: 2 }),
      mon('s-11', 'eevee', { ...later, level: { min: 11, max: 11 }, cp: 3 }),
      mon('s-extra', 'eevee', { ...later, level: { min: 20, max: 20 }, cp: 4 }),
    ];
    const r = mergeScan(have, [], scans, index, NOW);
    const cp = (id: string) => r.specimens.find((s) => s.id === id)?.cp;
    expect([cp('umb'), cp('high'), cp('low')]).toEqual([1, 2, 3]);
    expect(r.breakdown).toMatchObject({ added: 1, merged: 3 });
    expect(r.specimens.map((s) => s.id)).toContain('s-extra');
  });

  it('does not depend on the order of the file', () => {
    const have = [mon('a', 'eevee'), mon('b', 'eevee', { level: { min: 30, max: 30 } })];
    const scans = [
      mon('x', 'eevee', { ...later, level: { min: 12, max: 12 }, cp: 7 }),
      mon('y', 'eevee', { ...later, level: { min: 33, max: 33 }, cp: 8 }),
    ];
    const one = mergeScan(have, [], scans, index, NOW);
    const two = mergeScan(have, [], [...scans].reverse(), index, NOW);
    expect(two.specimens).toEqual(one.specimens);
  });

  it('a rescan with IVs fills in a Pokemon that had none', () => {
    const have = [mon('blank', 'eevee', { ivs: null })];
    const r = mergeScan(have, [], [mon('new', 'eevee', later)], index, NOW);
    expect(r.specimens).toHaveLength(1);
    expect(r.specimens[0]).toMatchObject({ id: 'blank', ivs: { atk: 1, def: 15, sta: 13 } });
  });

  it('a removed Pokemon is skipped, and only as many as were removed', () => {
    const gone = removeSpecimens(
      [mon('a', 'eevee'), mon('b', 'eevee', { level: { min: 30, max: 30 } })],
      [],
      new Set(['b']),
      index,
      NOW,
    );
    expect(gone.specimens.map((s) => s.id)).toEqual(['a']);
    const scans = [mon('a', 'eevee'), mon('b', 'eevee', { level: { min: 30, max: 30 } })];
    const r = mergeScan(gone.specimens, gone.removed, scans, index, NOW);
    expect(r.specimens.map((s) => s.id)).toEqual(['a']);
    expect(r.breakdown).toMatchObject({ added: 0, merged: 1, skipped: 1 });
    const three = mergeScan(gone.specimens, gone.removed, [...scans, mon('c', 'eevee')], index, NOW);
    expect(three.breakdown).toMatchObject({ added: 1, skipped: 1 });
  });

  it('a mark does not block a different line with the same IVs', () => {
    const gone = removeSpecimens([mon('a', 'eevee')], [], new Set(['a']), index, NOW);
    const r = mergeScan([], gone.removed, [mon('s', 'stunfisk')], index, NOW);
    expect(r.breakdown).toMatchObject({ added: 1, skipped: 0 });
  });

  it('adding it back by hand clears the mark', () => {
    const gone = removeSpecimens([mon('a', 'eevee')], [], new Set(['a']), index, NOW);
    expect(clearMark(gone.removed, mon('z', 'eevee'), index)).toEqual([]);
    expect(clearMark(gone.removed, mon('z', 'stunfisk'), index)).toEqual(gone.removed);
  });

  it('what the scan lacks is kept; hand-added ones are not counted as missing', () => {
    const have = [mon('scanned', 'eevee'), mon('typed', 'stunfisk', { source: 'manual' })];
    const r = mergeScan(have, [], [mon('new', 'mudkip')], index, NOW);
    expect(r.specimens.map((s) => s.id).sort()).toEqual(['new', 'scanned', 'typed']);
    expect(r.breakdown.notInScan).toEqual(['scanned']);
  });

  it('a hand-added Pokemon a newer scan matches becomes a scanned one', () => {
    const have = [mon('typed', 'eevee', { source: 'manual' })];
    const r = mergeScan(have, [], [mon('new', 'eevee', { ...later, cp: 500 })], index, NOW);
    expect(r.specimens[0]).toMatchObject({ id: 'typed', cp: 500 });
    expect(r.specimens[0]?.source).toBeUndefined();
  });

  it('a sheet with no dates is dated at the import and wins', () => {
    const have = [mon('old', 'eevee', { editedAt: '2026-09-20 09:00:00' })];
    const r = mergeScan(have, [], [mon('new', 'eevee', { scannedAt: '', cp: 777 })], index, NOW);
    expect(r.specimens[0]).toMatchObject({ id: 'old', cp: 777, scannedAt: NOW });
  });

  it('a new Pokemon whose id is already taken gets an id of its own', () => {
    const have = [mon('h1', 'eevee', { ivs: { atk: 9, def: 9, sta: 9 } })];
    const r = mergeScan(have, [], [mon('h1', 'stunfisk')], index, NOW);
    expect(new Set(r.specimens.map((s) => s.id)).size).toBe(2);
    expect(r.specimens.find((s) => s.speciesId === 'eevee')?.id).toBe('h1');
  });
});
```

- [ ] **Step 4: Run.** Expected: FAIL, cannot resolve `merge.js`.

- [ ] **Step 5: Implement** `packages/engine/src/collection/merge.ts`:

```ts
import type { GameDataIndex } from '../gamedata/index.js';
import { megaFormOf, type Specimen } from './specimen.js';

/** What is left of a Pokemon the player removed, so a re-import does not bring it back. */
export interface RemovedMark {
  /** matchKey of the Pokemon when it was removed. */
  key: string;
  /** Its species, without the Shadow suffix: a mark only blocks its own evolution line. */
  speciesId: string;
  removedAt: string;
}

export interface MergeBreakdown {
  /** Scan rows that became new Pokemon. */
  added: number;
  /** Scan rows that matched a Pokemon already stored. */
  merged: number;
  /** Of the merged, how many a newer scan changed. */
  updated: number;
  /** Scan rows that matched a Pokemon the player removed. */
  skipped: number;
  /** Ids of stored, scanned Pokemon this scan did not contain. They are kept. */
  notInScan: string[];
}

export interface MergeResult {
  specimens: Specimen[];
  breakdown: MergeBreakdown;
}

/** Phone-local wall-clock time, the frame scan dates are written in, so the two compare as text. */
export function localStamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

type Values = Pick<Specimen, 'speciesId' | 'shadow' | 'ivs' | 'cp' | 'hp'>;

/**
 * What two records of one Pokemon share whatever its level or stage: the Shadow flag and the
 * IVs. With no IVs, the species, CP and HP stand in, as the id does.
 */
export function matchKey(s: Values, index: GameDataIndex): string {
  const side = s.shadow ? 's' : 'n';
  return s.ivs
    ? `${side}|${s.ivs.atk}/${s.ivs.def}/${s.ivs.sta}`
    : `${side}|noiv|${index.baseOf(s.speciesId)}|${s.cp}/${s.hp}`;
}

/** The same species, or one evolves into the other. Regional forms are their own lines. */
function sameLine(a: string, b: string, index: GameDataIndex): boolean {
  const x = index.baseOf(a);
  const y = index.baseOf(b);
  return (
    x === y ||
    index.stagesFrom(x).some((s) => s.speciesId === y) ||
    index.stagesFrom(y).some((s) => s.speciesId === x)
  );
}

const DATED = /^\d{4}-\d{2}-\d{2}/;

function byId(a: Specimen, b: Specimen): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function movesOf(s: Specimen): string {
  return `${s.currentMoves.fast ?? ''}|${s.currentMoves.charged.join('+')}`;
}

function differs(a: Specimen, b: Specimen): boolean {
  return (
    a.speciesId !== b.speciesId ||
    a.cp !== b.cp ||
    a.level.max !== b.level.max ||
    (a.ivs === null) !== (b.ivs === null) ||
    a.lucky !== b.lucky ||
    a.purified !== b.purified ||
    movesOf(a) !== movesOf(b)
  );
}

/** The stored Pokemon with a newer scan's values: its id and what only pick3 knows stay. */
function applyScan(old: Specimen, scan: Specimen, at: string): Specimen {
  const next: Specimen = {
    ...scan,
    id: old.id,
    scannedAt: at,
    megaForm: megaFormOf(scan) ?? megaFormOf(old),
  };
  if (old.megaLevel4) {
    next.megaLevel4 = true;
  }
  if (old.editedAt) {
    next.editedAt = old.editedAt;
  }
  if (old.evolvedFrom) {
    next.evolvedFrom = old.evolvedFrom;
  }
  return next;
}

/**
 * Fold a parsed scan into the stored collection. A scan row that is a stored Pokemon (same Shadow
 * flag, same IVs, same evolution line) keeps that Pokemon's id and updates it only when the scan
 * is newer than everything known about it. A row matching a removed Pokemon is skipped. Nothing
 * stored is dropped: what the scan lacks is reported, not removed.
 */
export function mergeScan(
  existing: readonly Specimen[],
  removed: readonly RemovedMark[],
  scanned: readonly Specimen[],
  index: GameDataIndex,
  now: string,
): MergeResult {
  const buckets = new Map<string, Specimen[]>();
  for (const old of existing) {
    const key = matchKey(old, index);
    const list = buckets.get(key) ?? [];
    list.push(old);
    buckets.set(key, list);
  }
  const options: { old: Specimen; scan: Specimen; rank: number[] }[] = [];
  for (const scan of scanned) {
    for (const old of buckets.get(matchKey(scan, index)) ?? []) {
      if (sameLine(old.speciesId, scan.speciesId, index)) {
        options.push({
          old,
          scan,
          rank: [
            index.baseOf(old.speciesId) === index.baseOf(scan.speciesId) ? 0 : 1,
            Math.abs(old.level.max - scan.level.max),
            Math.abs(old.cp - scan.cp),
          ],
        });
      }
    }
  }
  options.sort(
    (a, b) =>
      (a.rank[0] as number) - (b.rank[0] as number) ||
      (a.rank[1] as number) - (b.rank[1] as number) ||
      (a.rank[2] as number) - (b.rank[2] as number) ||
      byId(a.old, b.old) ||
      byId(a.scan, b.scan),
  );
  const scanOf = new Map<Specimen, Specimen>();
  const taken = new Set<Specimen>();
  for (const o of options) {
    if (!scanOf.has(o.old) && !taken.has(o.scan)) {
      scanOf.set(o.old, o.scan);
      taken.add(o.scan);
    }
  }
  // The rescan pick3 asks for: a Pokemon stored without IVs, scanned again with them.
  const free = scanned.filter((s) => !taken.has(s)).sort(byId);
  for (const old of existing) {
    if (old.ivs !== null || scanOf.has(old)) {
      continue;
    }
    const scan = free.find(
      (s) =>
        !taken.has(s) &&
        s.ivs !== null &&
        s.shadow === old.shadow &&
        index.baseOf(s.speciesId) === index.baseOf(old.speciesId) &&
        s.cp === old.cp &&
        s.hp === old.hp,
    );
    if (scan) {
      scanOf.set(old, scan);
      taken.add(scan);
    }
  }

  const breakdown: MergeBreakdown = { added: 0, merged: 0, updated: 0, skipped: 0, notInScan: [] };
  const out: Specimen[] = [];
  for (const old of existing) {
    const scan = scanOf.get(old);
    if (!scan) {
      out.push(old);
      if (old.source !== 'manual') {
        breakdown.notInScan.push(old.id);
      }
      continue;
    }
    breakdown.merged += 1;
    const at = DATED.test(scan.scannedAt) ? scan.scannedAt : now;
    const known = old.editedAt && old.editedAt > old.scannedAt ? old.editedAt : old.scannedAt;
    if (at > known) {
      const next = applyScan(old, scan, at);
      if (differs(old, next)) {
        breakdown.updated += 1;
      }
      out.push(next);
    } else {
      out.push(old);
    }
  }
  const marks = [...removed];
  const ids = new Set(out.map((s) => s.id));
  for (const scan of scanned.filter((s) => !taken.has(s)).sort(byId)) {
    const key = matchKey(scan, index);
    const m = marks.findIndex(
      (x) => x.key === key && sameLine(x.speciesId, scan.speciesId, index),
    );
    if (m >= 0) {
      marks.splice(m, 1);
      breakdown.skipped += 1;
      continue;
    }
    let id = scan.id;
    for (let n = 2; ids.has(id); n++) {
      id = `${scan.id}-${n}`;
    }
    ids.add(id);
    breakdown.added += 1;
    out.push(id === scan.id ? scan : { ...scan, id });
  }
  return { specimens: out, breakdown };
}

/** Take Pokemon out of the collection, leaving a mark for each so an import skips them. */
export function removeSpecimens(
  existing: readonly Specimen[],
  removed: readonly RemovedMark[],
  ids: ReadonlySet<string>,
  index: GameDataIndex,
  now: string,
): { specimens: Specimen[]; removed: RemovedMark[] } {
  const marks = [...removed];
  const specimens: Specimen[] = [];
  for (const s of existing) {
    if (ids.has(s.id)) {
      marks.push({ key: matchKey(s, index), speciesId: index.baseOf(s.speciesId), removedAt: now });
    } else {
      specimens.push(s);
    }
  }
  return { specimens, removed: marks };
}

/** The marks without one that would block this Pokemon: it was added back on purpose. */
export function clearMark(
  removed: readonly RemovedMark[],
  s: Specimen,
  index: GameDataIndex,
): RemovedMark[] {
  const key = matchKey(s, index);
  const m = removed.findIndex((x) => x.key === key && sameLine(x.speciesId, s.speciesId, index));
  return m < 0 ? [...removed] : removed.filter((_, i) => i !== m);
}
```

Add `export * from './collection/merge.js';` to `index.ts`.

- [ ] **Step 6: Run.** `npx vitest run packages/engine/test/collection/merge.test.ts` then the engine typecheck. Expected: PASS.

- [ ] **Step 7: Commit** `Engine: a re-import merges into the stored collection`.

---

### Task 4: Evolve (`collection/evolve.ts`)

**Files:**
- Create: `packages/engine/src/collection/evolve.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/collection/evolve.test.ts`

**Interfaces:**
- Produces: `evolveSpecimen(s: Specimen, toSpeciesId: string, index: GameDataIndex, now: string): Specimen` (throws `Error` with a player-readable message).

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { evolveSpecimen } from '../../src/collection/evolve.js';
import { cpFor, statsFor } from '../../src/math/cp.js';
import { mon, syntheticIndex } from './synthetic.js';

const index = syntheticIndex();
const NOW = '2026-10-01 12:00:00';

describe('evolveSpecimen', () => {
  const eevee = mon('e', 'eevee', {
    currentMoves: { fast: 'QUICK_ATTACK', charged: ['SWIFT'] },
    megaLevel4: true,
  });
  const out = evolveSpecimen(eevee, 'umbreon', index, NOW);
  const base = index.mustSpecies('umbreon').baseStats;

  it('keeps the id, level and IVs', () => {
    expect(out).toMatchObject({ id: 'e', ivs: eevee.ivs, level: { min: 14, max: 14 } });
  });

  it('becomes the new species with its CP and HP at that level', () => {
    expect(out.speciesId).toBe('umbreon');
    expect(out.cp).toBe(cpFor(base, eevee.ivs!, 14));
    expect(out.hp).toBe(statsFor(base, eevee.ivs!, 14).hp);
  });

  it('forgets its moves and Mega marks, and remembers where it came from', () => {
    expect(out.currentMoves).toEqual({ fast: null, charged: [] });
    expect(out.megaLevel4).toBeUndefined();
    expect(out).toMatchObject({ evolvedFrom: 'eevee', editedAt: NOW, megaForm: null });
  });

  it('does not change the Pokemon it was given', () => {
    expect(eevee.speciesId).toBe('eevee');
  });

  it('refuses a species it cannot evolve into, itself included', () => {
    expect(() => evolveSpecimen(eevee, 'swampert', index, NOW)).toThrow(/cannot evolve/);
    expect(() => evolveSpecimen(eevee, 'eevee', index, NOW)).toThrow(/cannot evolve/);
    expect(() => evolveSpecimen(out, 'vaporeon', index, NOW)).toThrow(/cannot evolve/);
  });

  it('refuses a Pokemon with no IVs', () => {
    expect(() => evolveSpecimen(mon('x', 'eevee', { ivs: null }), 'umbreon', index, NOW)).toThrow(
      /IVs/,
    );
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL, cannot resolve `evolve.js`.

- [ ] **Step 3: Implement:**

```ts
import type { GameDataIndex } from '../gamedata/index.js';
import { cpFor, statsFor } from '../math/cp.js';
import type { Specimen } from './specimen.js';

/**
 * The same Pokemon one evolution on: its id, level and IVs stay, the CP and HP are the new
 * species' at that level, and its moves are forgotten because evolving changes them.
 */
export function evolveSpecimen(
  s: Specimen,
  toSpeciesId: string,
  index: GameDataIndex,
  now: string,
): Specimen {
  const from = index.mustSpecies(s.speciesId);
  if (!s.ivs) {
    throw new Error(`pick3 needs this ${from.speciesName}'s IVs before it can evolve it.`);
  }
  const target = index
    .stagesFrom(s.speciesId)
    .slice(1)
    .find((x) => x.speciesId === toSpeciesId);
  if (!target) {
    const to = index.species(toSpeciesId)?.speciesName ?? toSpeciesId;
    throw new Error(`${from.speciesName} cannot evolve into ${to}.`);
  }
  const level = s.level.max;
  const cp = cpFor(target.baseStats, s.ivs, level);
  const hp = statsFor(target.baseStats, s.ivs, level).hp;
  const { megaLevel4: _level4, ...rest } = s;
  return {
    ...rest,
    speciesId: target.speciesId,
    familyId: target.familyId,
    level: { min: level, max: level },
    cp,
    hp,
    currentMoves: { fast: null, charged: [] },
    megaForm: null,
    raw: { ...s.raw, name: target.speciesName, cp, hp, fastMove: null, chargedMoves: [] },
    evolvedFrom: s.speciesId,
    editedAt: now,
  };
}
```

(If eslint rejects the unused `_level4`, build `rest` with `const rest = { ...s }; delete rest.megaLevel4;` instead.) Export from `index.ts`.

- [ ] **Step 4: Run, typecheck, commit** `Engine: evolve a Pokemon in place`.

---

### Task 5: The rescan fixture

**Files:**
- Modify: `fixtures/derive-fixtures.ts` (append a block)
- Create (generated): `fixtures/pokegenie-rescan.csv`
- Test: `packages/engine/test/collection/mergeFixture.test.ts`

- [ ] **Step 1: Append to `derive-fixtures.ts`** (before any trailing code; `header`, `rows`, `col`, `toLine`, `write` already exist there):

```ts
// 6. The same collection scanned a week later: every tenth row from the fourth is gone, every
// tenth from the sixth was powered up one level and scanned again, and three rows are new (a
// copy of rows 1 to 3 with another Attack IV).
{
  const cIndex = col('Index');
  const cAtk = col('Atk IV');
  const cCp = col('CP');
  const cMin = col('Level Min');
  const cMax = col('Level Max');
  const cScan = col('Scan Date');
  const weekOn = (v: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(v);
    if (!m) {
      return v;
    }
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 7));
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${m[4]}`;
  };
  const body: string[][] = [];
  rows.forEach((r, i) => {
    const hasIvs = (r[cAtk] ?? '') !== '';
    if (hasIvs && i % 10 === 3) {
      return;
    }
    const row = [...r];
    if (hasIvs && i % 10 === 5) {
      row[cMin] = String(Number(row[cMin]) + 1);
      row[cMax] = String(Number(row[cMax]) + 1);
      row[cCp] = String(Number(row[cCp]) + 20);
      row[cScan] = weekOn(row[cScan] ?? '');
    }
    body.push(row);
  });
  rows
    .filter((r) => (r[cAtk] ?? '') !== '')
    .slice(0, 3)
    .forEach((r) => {
      const row = [...r];
      row[cAtk] = String((Number(row[cAtk]) + 1) % 16);
      row[cScan] = weekOn(row[cScan] ?? '');
      body.push(row);
    });
  body.forEach((r, n) => {
    r[cIndex] = String(n + 1);
  });
  write('pokegenie-rescan.csv', [toLine(header), ...body.map((r) => toLine(r))]);
}
```

- [ ] **Step 2: Generate.** `npm run fixtures:derive`. Confirm with `git status --short fixtures` that only `pokegenie-rescan.csv` is new and no other fixture changed.

- [ ] **Step 3: Write the test** (invariants only):

```ts
import { describe, expect, it } from 'vitest';
import { mergeScan } from '../../src/collection/merge.js';
import { toSpecimens } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { haveStaticData, loadFixtureCsv, loadIndex } from '../fixtures.js';

describe.skipIf(!haveStaticData())('merging the rescan fixture', () => {
  const index = loadIndex();
  const read = (name: string) =>
    toSpecimens(parseCollectionCsv(loadFixtureCsv(name), index), index).specimens;
  const first = mergeScan([], [], read('pokegenie-sample.csv'), index, '2026-10-01 12:00:00');
  const rescan = read('pokegenie-rescan.csv');
  const second = mergeScan(first.specimens, [], rescan, index, '2026-10-01 12:00:00');

  it('accounts for every scan row', () => {
    const b = second.breakdown;
    expect(b.added + b.merged + b.skipped).toBe(rescan.length);
    expect(second.specimens.length).toBe(first.specimens.length + b.added);
  });

  it('updates the powered-up rows, adds the new ones and reports the missing ones', () => {
    const b = second.breakdown;
    expect(b.updated).toBeGreaterThan(0);
    expect(b.updated).toBeLessThan(b.merged);
    expect(b.added).toBeGreaterThan(0);
    expect(b.notInScan.length).toBeGreaterThan(0);
  });

  it('keeps every stored id, and every id is unique', () => {
    const ids = second.specimens.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of first.specimens) {
      expect(ids).toContain(s.id);
    }
  });

  it('the same rescan again is a no-op', () => {
    const third = mergeScan(second.specimens, [], rescan, index, '2026-10-02 12:00:00');
    expect(third.breakdown).toMatchObject({ added: 0, updated: 0 });
    expect(third.specimens).toEqual(second.specimens);
  });
});
```

- [ ] **Step 4: Run** it and `npx vitest run packages/engine/test/csv` (the layout tests must not have picked up the new file by accident). Commit `Fixtures: the sample collection rescanned a week later`.

---

### Task 6: Host, worker and storage

**Files:**
- Modify: `packages/engine/src/host/ComputeHost.ts`, `apps/web/src/host/protocol.ts`, `apps/web/src/host/WorkerHost.ts`, `apps/web/src/worker/engine.worker.ts`, `apps/web/src/storage/db.ts`
- Test: `apps/web/test/storage.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces:

```ts
// ComputeHost.ts
export interface ImportPrior { specimens: Specimen[]; removed: RemovedMark[]; now: string }
importCsv(text: string, prior?: ImportPrior): Promise<{ specimens: Specimen[]; report: ImportReport }>;
/** Remove Pokemon, leaving marks. `add` clears the mark of one being added back by hand. */
marks(req: MarksRequest): Promise<{ specimens: Specimen[]; removed: RemovedMark[] }>;
export type MarksRequest =
  | { op: 'remove'; specimens: Specimen[]; removed: RemovedMark[]; ids: string[]; now: string }
  | { op: 'add'; specimens: Specimen[]; removed: RemovedMark[]; specimen: Specimen };
// db.ts StoredCollection
removed?: RemovedMark[];
pins?: Record<string, PinMap>;
```

- [ ] **Step 1: Failing storage test** appended to `apps/web/test/storage.test.ts`:

```ts
describe('collection storage', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });

  it('a save from before pins and marks loads without them', async () => {
    await storage.saveCollection({
      specimens: [],
      report: {} as never,
      importedAt: '2026-09-01T00:00:00Z',
      fileName: 'old.csv',
    });
    const c = await storage.loadCollection();
    expect(c?.removed).toBeUndefined();
    expect(c?.pins).toBeUndefined();
  });

  it('round-trips pins and removed marks', async () => {
    const removed = [{ key: 'n|1/2/3', speciesId: 'eevee', removedAt: '2026-10-01 12:00:00' }];
    const pins = { great: { umbreon: 'abc', medicham: null } };
    await storage.saveCollection({
      specimens: [],
      report: {} as never,
      importedAt: '2026-09-01T00:00:00Z',
      fileName: null,
      removed,
      pins,
    });
    const c = await storage.loadCollection();
    expect(c?.removed).toEqual(removed);
    expect(c?.pins).toEqual(pins);
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL to typecheck (`removed` is not a `StoredCollection` key) under vitest's transform it may pass at runtime; the gate is `npm -w @pickthree/web run typecheck` failing.

- [ ] **Step 3: `db.ts`.** Import `PinMap` and `RemovedMark` from `@pickthree/engine` and add to `StoredCollection`:

```ts
  /** Added 2026-10-01. Pokemon the player removed; an import skips rows matching one. Absent
   *  in older saves means none. */
  removed?: RemovedMark[];
  /** Added 2026-10-01. League id to that league's pins. Absent means every species uses the
   *  default pick. */
  pins?: Record<string, PinMap>;
```

- [ ] **Step 4: Host.** In `ComputeHost.ts` add `ImportPrior`, `MarksRequest`, the `prior?` parameter and `marks`. In `protocol.ts`: request `{ id; kind: 'import'; text: string; prior?: ImportPrior }` and `{ id; kind: 'marks'; req: MarksRequest }`; result `{ kind: 'marks'; specimens: Specimen[]; removed: RemovedMark[] }`. In `WorkerHost.ts`:

```ts
  async importCsv(
    text: string,
    prior?: ImportPrior,
  ): Promise<{ specimens: Specimen[]; report: ImportReport }> {
    const r = await this.send({ kind: 'import', text, ...(prior ? { prior } : {}) });
    if (r.kind !== 'import') {
      throw new Error('unexpected reply');
    }
    return { specimens: r.specimens, report: r.report };
  }

  async marks(req: MarksRequest): Promise<{ specimens: Specimen[]; removed: RemovedMark[] }> {
    const r = await this.send({ kind: 'marks', req });
    if (r.kind !== 'marks') {
      throw new Error('unexpected reply');
    }
    return { specimens: r.specimens, removed: r.removed };
  }
```

In the worker, replace the import branch and add marks:

```ts
    if (msg.kind === 'import') {
      const parsed = parseCollectionCsv(msg.text, env.index);
      const { specimens, report } = toSpecimens(parsed, env.index);
      const prior = msg.prior;
      if (!prior || prior.specimens.length === 0) {
        post({ id: msg.id, kind: 'result', result: { kind: 'import', specimens, report } });
        return;
      }
      const merged = mergeScan(prior.specimens, prior.removed, specimens, env.index, prior.now);
      post({
        id: msg.id,
        kind: 'result',
        result: {
          kind: 'import',
          specimens: merged.specimens,
          report: { ...report, merge: merged.breakdown },
        },
      });
      return;
    }
    if (msg.kind === 'marks') {
      const q = msg.req;
      const result =
        q.op === 'remove'
          ? removeSpecimens(q.specimens, q.removed, new Set(q.ids), env.index, q.now)
          : { specimens: q.specimens, removed: clearMark(q.removed, q.specimen, env.index) };
      post({ id: msg.id, kind: 'result', result: { kind: 'marks', ...result } });
      return;
    }
```

A first import with marks but no Pokemon (everything removed, then imported) must still skip: change the guard to `!prior || (prior.specimens.length === 0 && prior.removed.length === 0)`.

Add `marks: vi.fn(async (req) => ...)` to `apps/web/test/fakeHost.ts` implementing the same two ops without an index (remove: filter by id, push `{ key: id, speciesId, removedAt: now }`; add: return unchanged).

- [ ] **Step 5: Run** storage test + `npm -w @pickthree/web run typecheck` + `npm -w @pickthree/engine run typecheck`. Commit `Web: import hands the stored collection to the worker to merge`.

---

### Task 7: Store wiring

**Files:**
- Modify: `apps/web/src/state/store.tsx`
- Test: `apps/web/test/store.test.tsx` (new `describe('collection model', ...)`)

**Interfaces:**
- Consumes: Tasks 1, 3, 6.
- Produces (on `Actions`): `removeMissing(): Promise<void>`; `setPin(speciesId: string, pin: string | null | undefined): Promise<void>` (undefined clears back to the default pick). Exported `pinsOf(collection: StoredCollection | null, league: string): PinMap | undefined`. `filterKey(settings, logVersion?, community?, pins?)`.

- [ ] **Step 1: Failing tests** (follow the file's own `mount`/`fakeHost`/`latest` helpers and its `specimen`/`report` literals):

```ts
describe('collection model', () => {
  it('an import hands the stored Pokemon and marks to the host, and keeps pins and marks', async () => {
    const importCsv = vi.fn(async () => ({ specimens: [{ ...specimen }], report }));
    const host = fakeHost({ importCsv } as never);
    await mount(host);
    await act(async () => {
      await latest!.actions.importCsv('a', 'a.csv');
    });
    expect(importCsv.mock.calls[0]?.[1]).toBeUndefined();
    await act(async () => {
      await latest!.actions.setPin('umbreon', specimen.id);
    });
    await act(async () => {
      await latest!.actions.importCsv('a', 'a.csv');
    });
    const prior = importCsv.mock.calls[1]?.[1] as { specimens: unknown[]; removed: unknown[]; now: string };
    expect(prior.specimens).toHaveLength(1);
    expect(prior.removed).toEqual([]);
    expect(prior.now).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(latest!.state.collection?.pins).toEqual({ great: { umbreon: specimen.id } });
    expect((await storage.loadCollection())?.pins).toEqual({ great: { umbreon: specimen.id } });
  });

  it('removing a Pokemon leaves a mark and forgets its pins', async () => {
    const host = fakeHost({
      importCsv: vi.fn(async () => ({ specimens: [{ ...specimen }], report })),
    } as never);
    await mount(host);
    await act(async () => {
      await latest!.actions.importCsv('a', 'a.csv');
    });
    await act(async () => {
      await latest!.actions.setPin('umbreon', specimen.id);
    });
    await act(async () => {
      await latest!.actions.removeSpecimen(specimen.id);
    });
    expect(latest!.state.collection?.specimens).toEqual([]);
    expect(latest!.state.collection?.removed).toHaveLength(1);
    expect(latest!.state.collection?.pins ?? {}).toEqual({});
  });

  it('setPin stores null for unpinned and clears with undefined', async () => {
    const host = fakeHost({
      importCsv: vi.fn(async () => ({ specimens: [{ ...specimen }], report })),
    } as never);
    await mount(host);
    await act(async () => {
      await latest!.actions.importCsv('a', 'a.csv');
    });
    await act(async () => {
      await latest!.actions.setPin('umbreon', null);
    });
    expect(pinsOf(latest!.state.collection, 'great')).toEqual({ umbreon: null });
    await act(async () => {
      await latest!.actions.setPin('umbreon', undefined);
    });
    expect(pinsOf(latest!.state.collection, 'great')).toBeUndefined();
  });

  it('removeMissing removes what the scan lacked and empties the list', async () => {
    const withMerge = {
      ...report,
      merge: { added: 0, merged: 0, updated: 0, skipped: 0, notInScan: [specimen.id] },
    };
    const host = fakeHost({
      importCsv: vi.fn(async () => ({ specimens: [{ ...specimen }], report: withMerge })),
    } as never);
    await mount(host);
    await act(async () => {
      await latest!.actions.importCsv('a', 'a.csv');
    });
    await act(async () => {
      await latest!.actions.removeMissing();
    });
    expect(latest!.state.collection?.specimens).toEqual([]);
    expect(latest!.state.collection?.report.merge?.notInScan).toEqual([]);
    expect(latest!.state.collection?.removed).toHaveLength(1);
  });

  it('the pins are part of the teams cache key', () => {
    expect(filterKey(DEFAULT_SETTINGS, 0, null, { umbreon: 'a' })).not.toBe(
      filterKey(DEFAULT_SETTINGS, 0, null, { umbreon: 'b' }),
    );
    expect(filterKey(DEFAULT_SETTINGS, 0, null, undefined)).toBe(filterKey(DEFAULT_SETTINGS));
  });
});
```

- [ ] **Step 2: Run.** Expected: FAIL (`setPin` is not a function).

- [ ] **Step 3: Implement in `store.tsx`.**

`pinsOf` and `filterKey`:

```ts
/** One league's pins, or undefined when it has none (every species on its default pick). */
export function pinsOf(collection: StoredCollection | null, league: string): PinMap | undefined {
  const map = collection?.pins?.[league];
  return map && Object.keys(map).length > 0 ? map : undefined;
}
```

`filterKey` gains a fourth parameter `pins?: PinMap` and adds `...(pins ? { pins } : {})` to the keyed object. Update its three callers (`Teams.tsx`, two in the store) to pass `pinsOf(s.collection, s.settings.league ?? 'great')`.

`importCsv`:

```ts
        const cur = stateRef.current.collection;
        const prior =
          cur && (cur.specimens.length > 0 || (cur.removed?.length ?? 0) > 0)
            ? { specimens: cur.specimens, removed: cur.removed ?? [], now: localStamp(new Date()) }
            : undefined;
        const { specimens, report } = await h.importCsv(text, prior);
        noteLayout(report.layout, 'ok');
        const collection: StoredCollection = {
          key: 'current',
          specimens: carryMegaLevel4(cur?.specimens ?? [], specimens),
          report,
          importedAt: new Date().toISOString(),
          fileName,
          ...(cur?.removed ? { removed: cur.removed } : {}),
          ...(cur?.pins ? { pins: cur.pins } : {}),
        };
```

`saveSpecimens(specimens, fileName, patch?)` where `patch?: { removed?: RemovedMark[]; pins?: Record<string, PinMap>; report?: ImportReport }`: build the collection from `cur` carrying `removed` and `pins`, then apply the patch; an empty `pins` object is stored as absent.

`removeSpecimen` and `removeMissing` share one helper:

```ts
  const removeIds = useCallback(
    async (ids: string[]) => {
      const h = hostRef.current as WorkerHost;
      const cur = stateRef.current.collection;
      if (!cur || ids.length === 0) {
        return;
      }
      const r = await h.marks({
        op: 'remove',
        specimens: cur.specimens,
        removed: cur.removed ?? [],
        ids,
        now: localStamp(new Date()),
      });
      const gone = new Set(ids);
      const merge = cur.report.merge;
      await saveSpecimens(r.specimens, null, {
        removed: r.removed,
        pins: dropPins(cur.pins ?? {}, gone),
        ...(merge
          ? {
              report: {
                ...cur.report,
                merge: { ...merge, notInScan: merge.notInScan.filter((id) => !gone.has(id)) },
              },
            }
          : {}),
      });
    },
    [saveSpecimens],
  );
```

`removeSpecimen = (id) => removeIds([id])`; `removeMissing = () => removeIds(collection.report.merge?.notInScan ?? [])`.

`addManual`: after computing `added`, clear its mark: `const cleared = (await h.marks({ op: 'add', specimens: [], removed: cur?.removed ?? [], specimen: added.specimen })).removed;` and pass `{ removed: cleared }` to `saveSpecimens`. Skip the call when there are no marks.

`updateManual`: add `editedAt: localStamp(new Date())` to the rebuilt specimen, and carry `evolvedFrom` from `old` when the species did not change.

`setPin`:

```ts
  const setPin = useCallback(
    async (speciesId: string, pin: string | null | undefined) => {
      const cur = stateRef.current.collection;
      if (!cur) {
        return;
      }
      const league = stateRef.current.settings.league ?? 'great';
      const map: PinMap = { ...(cur.pins?.[league] ?? {}) };
      if (pin === undefined) {
        delete map[speciesId];
      } else {
        map[speciesId] = pin;
      }
      const pins = { ...(cur.pins ?? {}), [league]: map };
      if (Object.keys(map).length === 0) {
        delete pins[league];
      }
      await saveSpecimens(cur.specimens, null, { pins });
    },
    [saveSpecimens],
  );
```

Pass-through: at the `h.recommend`, both `h.analyze`, `h.suggestTeammates` and `h.counters` calls add `...(pins ? { pins } : {})` to the options, with `const pins = pinsOf(s.collection, <the league that call runs in>)`.

Add `removeMissing` and `setPin` to the `Actions` interface, the value object and its dependency list.

- [ ] **Step 4: Run** `npx vitest run apps/web/test/store.test.tsx apps/web/test/megaMarks.test.ts` and the web typecheck; fix `fakeHost` typing fallout in other test files (a `ComputeHost` literal now needs `marks`).

- [ ] **Step 5: Commit** `Web: imports merge, removals leave marks, pins reach the engine`.

---

### Task 8: The Report breakdown

**Files:**
- Modify: `apps/web/src/screens/Report.tsx`
- Test: `apps/web/test/report.test.tsx` (new; mount like `apps/web/test/welcome.test.tsx` does)

- [ ] **Step 1: Failing test:** with a collection whose `report.merge` is `{ added: 2, merged: 5, updated: 1, skipped: 3, notInScan: ['k'] }`, the screen shows rows "New", "Merged" (sub "1 updated by a newer scan"), "Skipped (deleted)", "Not in this scan"; "Duplicate scans" replaces "Duplicates merged"; opening "Not in this scan" shows "Remove them", which calls `removeMissing`. With no `merge`, none of the four rows render.

- [ ] **Step 2: Implement.** Rename the label to `'Duplicate scans'` (sub `'Same Pokémon scanned twice in this file'`). After the `duplicatesMerged` row, when `r.merge` is set, insert:

```ts
    { n: m.added, label: 'New', sub: 'Added by this import', names: [] },
    {
      n: m.merged,
      label: 'Merged',
      sub: `Matched a Pokémon you already had. ${m.updated} updated by a newer scan`,
      names: [],
    },
    {
      n: m.skipped,
      label: 'Skipped (deleted)',
      sub: 'Matched a Pokémon you removed',
      fix: m.skipped > 0 ? 'Add one back by hand if you removed it by mistake.' : undefined,
      names: [],
    },
    {
      n: m.notInScan.length,
      label: 'Not in this scan',
      sub: 'Kept. Transferred them? Remove them here',
      fix: m.notInScan.length > 0 ? 'These are still in your collection.' : undefined,
      names: [],
      ids: missingSpecies,   // species ids of the first 12 notInScan specimens
      action: m.notInScan.length > 0 ? { label: 'Remove them', run: removeMissing } : undefined,
    },
```

Add `action?: { label: string; run: () => void } | undefined` to `Row` and render it in the open body as `<button type="button" className="btn-ghost danger" ...>` only if a `danger` ghost style already exists in `app.css`; otherwise the plain `btn-ghost`. No new color literals. The headline keeps `r.recognized` for a first import and shows `collection.specimens.length` after a merge.

- [ ] **Step 3: Run, typecheck, commit** `Web: the Report says what a re-import merged, skipped and missed`.

---

### Task 9: Docs and the full gate

- [ ] **Step 1:** `CLAUDE.md`: in the engine pipeline block change the `collection/` line to `collection/ Specimen (one scanned Pokemon, permanent id), manual entry, merge (re-import), pins, evolve`; add the spec to the "Later specs" list; under Web app storage note `collection` now carries `removed` and `pins`.
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm test`. All green. `npm run check-colors`.
- [ ] **Step 3:** `npm -w @pickthree/web run build`, then `node scripts/with-preview.mjs web 4173 -- node apps/web/scripts/screens.mjs` if Chrome is available; the Report capture must still pass.
- [ ] **Step 4:** Commit `Docs: collection model in CLAUDE.md`. Do not merge. Do not push.
