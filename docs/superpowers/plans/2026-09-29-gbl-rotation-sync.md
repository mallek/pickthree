# GBL Rotation Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pick3's cup leagues follow the live GO Battle League schedule for non-mega cups: a daily job bakes the schedule into the build, the phone shows live and upcoming cups, nudges once per run, falls back when a cup ends, and windows Your meta by the cup's run.

**Architecture:** A data-package parser turns the ScrapedDuck GBL feed into a committed `packages/data/schedule.json`; the data build adds one `kind: 'rotation'` league per scheduled cup PvPoke has ranked. The engine gains PvPoke's `evolution` cup filter and a pure schedule module (status, runs, runs-as-seasons). The web app reads `schedule.json` at boot and decides live/upcoming from the device clock.

**Tech Stack:** TypeScript (npm workspaces), Vitest, React 19, Vite, GitHub Actions, the vendored PvPoke checkout in `packages/data/.pvpoke`.

**Spec:** `docs/superpowers/specs/2026-09-29-gbl-rotation-sync-design.md`

## Global Constraints

- Player-facing text is strict 7-bit ASCII. No em dashes anywhere (code, comments, docs, commits): use a plain dash or rewrite.
- Always `{ }` on `if` / `else` / `for` / `while` / `switch` bodies, even one-liners.
- Pinned exact dependency versions; this plan adds no dependencies.
- Stage explicit paths in every commit; never `git add -A` or `git add .`.
- Run `npx prettier --write <files>` on touched files before each commit; `npm run lint` and `npm run typecheck` must stay clean.
- Tests on our logic use synthetic data. Tests on live PvPoke data assert invariants only, never specific Pokemon, ranks or scores.
- Non-mega only: any feed format containing `Mega` is skipped.
- Upcoming means a start within 7 days. Stale means rankings last updated more than 30 days before the run start.
- The feed URL is `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json`, read only in CI and in the local refresh script, never by the app.
- Commit messages end with the session's attribution lines.

## Review Focus

1. **A phone whose clock is wrong or in a far timezone** should still show a cup as live between its UTC start and end; the status line's weekday may shift by a day but the state must not. Owned by Task 2 (status is computed in UTC epoch ms) and Task 11 (format test uses a 20:00Z end).
2. **A saved `settings.league` naming a league the build no longer ships** (a cup pruned when the season changed) should land on Great League with a notice, not render a blank page. Owned by Task 13.
3. **A feed that returns zero GBL events or unparseable JSON** must not wipe `schedule.json`. Owned by Task 5 (the refresh script exits 4 without writing).
4. **A player building ahead on an upcoming cup** must keep that choice when the app opens; only an `off` cup falls back. Owned by Task 13.
5. **The same cup two weeks running (LAIC)** is one run for the log window and one nudge, not two. Owned by Tasks 2 and 13.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `packages/engine/src/gamedata/types.ts` | modify | `Species.evolutionStage?` |
| `packages/engine/src/gamedata/league.ts` | modify | `evolution` filter; `League.kind` gains `'rotation'`, plus `rankingsUpdated?`, `stale?` |
| `packages/engine/src/gamedata/schedule.ts` | create | `ScheduleEntry`, `leagueStatus`, `runsOf`, `currentRun`, `runSeasons` |
| `packages/engine/src/yourmeta/profile.ts` | modify | `facingLine` period word |
| `packages/engine/src/recommend.ts`, `counters/counters.ts` | modify | pass the period |
| `packages/data/src/build-gamedata.ts` | modify | bake `evolutionStage` |
| `packages/data/src/schedule-feed.ts` | create | parse feed, merge schedule, read/write `schedule.json` |
| `packages/data/cup-aliases.json` | create | feed cup title to PvPoke cup |
| `packages/data/schedule.json` | create (generated) | the season's cup weeks |
| `packages/data/src/seasons.ts` | modify | `mergeSeasons` |
| `packages/data/src/refresh-schedule.ts` | create | the CLI the daily job runs |
| `packages/data/src/check-schedule.ts` | create | warnings JSON for the daily job |
| `packages/data/src/check-seasons.ts` | delete | retired |
| `packages/data/src/leagues.ts` | modify | rotation leagues, meta group, freshness |
| `packages/data/src/build-rankings.ts` | modify | meta fallback from rankings |
| `packages/data/src/fetch-pvpoke.ts` | modify | blobless full history |
| `packages/data/src/build.ts` | modify | ship `schedule.json` |
| `.github/workflows/daily-refresh.yml` | create | replaces `data-refresh.yml` |
| `.github/workflows/{pages,ci}.yml` | modify | data cache keys |
| `apps/web/src/worker/engine.worker.ts`, `host/protocol.ts`, `state/store.tsx` | modify | `schedule` in boot data |
| `apps/web/src/clock.ts` | create | `appNow()`, automation override |
| `packages/ui/src/components/Select.tsx`, `League.tsx`, `base.css` | modify | `ChoiceOption.detail` second line |
| `apps/web/src/leagues.ts` | create | `sheetLeagues` (order, visibility, detail) |
| `apps/web/src/format.ts` | modify | `leagueDetail` |
| `apps/web/src/components/LeagueSwitcher.tsx` | modify | use `sheetLeagues` |
| `apps/web/src/components/NoticeToast.tsx` | modify | optional action button |
| `apps/web/src/rotation.ts` | create | `rotationNotice` decision |
| `apps/web/src/state/seasonsFor.ts` | create | runs-as-seasons for rotation leagues |
| `apps/web/src/communityMeta.ts`, `components.tsx`, `screens/YourMeta.tsx` | modify | run window and copy |
| `apps/web/scripts/screens.mjs` | modify | captures |

---

### Task 1: Evolution stage and the `evolution` cup filter

**Files:**
- Modify: `packages/engine/src/gamedata/types.ts` (the `Species` interface)
- Modify: `packages/engine/src/gamedata/league.ts` (`matches()`)
- Modify: `packages/data/src/build-gamedata.ts:78-100`
- Modify: `docs/superpowers/specs/2026-09-29-gbl-rotation-sync-design.md` (Engine section, evolution bullet)
- Test: `packages/engine/test/gamedata/league.test.ts`, `packages/data/test/build-gamedata.test.ts`

**Interfaces:**
- Produces: `Species.evolutionStage?: number` (0 to 3, PvPoke's `getEvolutionStage`); `matches()` handles `filterType: 'evolution'`.

Why baked, not derived: our `evolutionIds` falls back to children inferred from parent links when PvPoke's `family.evolutions` is absent, and PvPoke's stage reads `family.evolutions` only. Measured 2026-09-29: 3 species disagree (corsola 0 vs 1, phione 0 vs 1, boltund 3 vs 2). The build computes the stage from the raw family exactly as PvPoke does.

- [ ] **Step 1: Write the failing engine test**

Append to `packages/engine/test/gamedata/league.test.ts` (reuse the file's existing species builder if it has one; otherwise add this helper at the top of the new block):

```ts
describe('evolution filter', () => {
  const base = (id: string, evolutionStage: number | undefined): Species =>
    ({
      speciesId: id,
      speciesName: id,
      dex: 1,
      types: ['normal', 'none'],
      baseStats: { atk: 100, def: 100, hp: 100 },
      fastMoves: [],
      chargedMoves: [],
      eliteMoves: [],
      legacyMoves: [],
      tags: [],
      familyId: null,
      parentId: null,
      evolutionIds: [],
      shadow: false,
      shadowEligible: false,
      released: true,
      thirdMoveCost: 50000,
      ...(evolutionStage === undefined ? {} : { evolutionStage }),
    }) as Species;
  const little: League = {
    ...GREAT_LEAGUE_DEF,
    id: 'little',
    cp: 500,
    cup: 'little',
    kind: 'rotation',
    include: [{ filterType: 'evolution', values: [1] }],
    exclude: [{ filterType: 'id', values: ['shuckle', 'smeargle'] }],
  };

  it('admits stage 1 only', () => {
    expect(allowedInLeague(base('azurill', 1), little)).toBe(true);
    expect(allowedInLeague(base('marill', 2), little)).toBe(false);
    expect(allowedInLeague(base('azumarill', 3), little)).toBe(false);
    expect(allowedInLeague(base('tauros', 0), little)).toBe(false);
  });

  it('treats a species built before the field existed as stage 0', () => {
    expect(allowedInLeague(base('azurill', undefined), little)).toBe(false);
  });

  it('still applies the id exclude', () => {
    expect(allowedInLeague(base('shuckle', 1), little)).toBe(false);
  });
});
```

Add `Species` to the file's type imports and `GREAT_LEAGUE_DEF`, `allowedInLeague`, `League` to its value/type imports if not already imported.

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project engine packages/engine/test/gamedata/league.test.ts -t "evolution filter"`
Expected: FAIL. `admits stage 1 only` fails because `matches()` returns false for `evolution`, so azurill is not allowed.

- [ ] **Step 3: Add the field and the filter**

In `packages/engine/src/gamedata/types.ts`, inside `interface Species`, after `evolutionIds: string[];`:

```ts
  /**
   * PvPoke's Pokemon.getEvolutionStage, from the raw family: 0 no family (or neither link),
   * 1 evolves and has no parent, 2 evolves and has a parent, 3 does not evolve and has a parent.
   * Baked at build time because evolutionIds is inferred and can disagree. Absent in data built
   * before 2026-09-29; the evolution filter then reads it as 0.
   */
  evolutionStage?: number;
```

In `packages/engine/src/gamedata/league.ts` `matches()`, before `case 'cost':`:

```ts
    case 'evolution':
      return filter.values.map(Number).includes(sp.evolutionStage ?? 0);
```

and change the default's comment to `// move, moveType, distance: not modelled; PvPoke's rankings already reflect them.`

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run --project engine packages/engine/test/gamedata/league.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Write the failing build test**

Append to `packages/data/test/build-gamedata.test.ts`:

```ts
import { pvpokeEvolutionStage } from '../src/build-gamedata.js';

describe('pvpokeEvolutionStage', () => {
  it('mirrors PvPoke, where any evolutions key counts, even without inferred children', () => {
    expect(pvpokeEvolutionStage(undefined)).toBe(0);
    expect(pvpokeEvolutionStage({ id: 'F' })).toBe(0);
    expect(pvpokeEvolutionStage({ id: 'F', evolutions: ['marill'] })).toBe(1);
    expect(pvpokeEvolutionStage({ id: 'F', parent: 'azurill', evolutions: ['azumarill'] })).toBe(2);
    expect(pvpokeEvolutionStage({ id: 'F', parent: 'marill' })).toBe(3);
  });
});

describe.skipIf(!fs.existsSync(GAMEMASTER_PATH))('evolution stage on live data', () => {
  it('puts every species PvPoke ranks in Little Cup at stage 1', () => {
    const file = path.join(RANKINGS_DIR, 'little', 'overall', 'rankings-500.json');
    const ranked = JSON.parse(fs.readFileSync(file, 'utf8')) as { speciesId: string }[];
    const byId = new Map(readGameData().species.map((s) => [s.speciesId, s]));
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      expect(byId.get(r.speciesId)?.evolutionStage, r.speciesId).toBe(1);
    }
  });
});
```

Use the file's existing imports for `fs`, `path`, `GAMEMASTER_PATH`, `RANKINGS_DIR`; if the file reads game data through a different exported function than `readGameData`, use that one (grep `export function` in `build-gamedata.ts` for the one returning `{ species, moves }` without writing files).

- [ ] **Step 6: Run it and see it fail**

Run: `npx vitest run --project data packages/data/test/build-gamedata.test.ts -t "Stage|stage"`
Expected: FAIL, `pvpokeEvolutionStage` is not exported.

- [ ] **Step 7: Bake the stage**

In `packages/data/src/build-gamedata.ts`, above the function that maps `gm.pokemon`:

```ts
/** PvPoke's Pokemon.getEvolutionStage, verbatim: an evolutions key counts whatever it holds. */
export function pvpokeEvolutionStage(
  family: { id: string; parent?: string; evolutions?: string[] } | undefined,
): number {
  let stage = 0;
  if (family) {
    if (family.evolutions && !family.parent) {
      stage = 1;
    }
    if (family.evolutions && family.parent) {
      stage = 2;
    }
    if (!family.evolutions && family.parent) {
      stage = 3;
    }
  }
  return stage;
}
```

In the species object literal, after `evolutionIds: [...evolutions].sort(),` add:

```ts
      evolutionStage: pvpokeEvolutionStage(p.family),
```

If `p.family`'s raw type in this file does not already allow `parent?` and `evolutions?`, widen it to match the parameter above.

- [ ] **Step 8: Run both tests and see them pass**

Run: `npx vitest run --project data packages/data/test/build-gamedata.test.ts && npx vitest run --project engine packages/engine/test/gamedata/league.test.ts`
Expected: PASS. The live-data test runs only where the PvPoke checkout exists (`npm run data:fetch` first if skipped).

- [ ] **Step 9: Amend the spec**

In the spec's Engine section, replace the sentence `Uses \`Species.parentId\` and \`Species.evolutionIds\`.` with:

```
  Uses `Species.evolutionStage`, baked at build time from PvPoke's raw family (our
  `evolutionIds` is inferred from parent links and disagreed with PvPoke for 3 species on
  2026-09-29).
```

- [ ] **Step 10: Commit**

```bash
npx prettier --write packages/engine/src/gamedata/types.ts packages/engine/src/gamedata/league.ts packages/data/src/build-gamedata.ts packages/engine/test/gamedata/league.test.ts packages/data/test/build-gamedata.test.ts
git add packages/engine/src/gamedata/types.ts packages/engine/src/gamedata/league.ts packages/data/src/build-gamedata.ts packages/engine/test/gamedata/league.test.ts packages/data/test/build-gamedata.test.ts docs/superpowers/specs/2026-09-29-gbl-rotation-sync-design.md
git commit -m "Engine: PvPoke's evolution cup filter, from a stage baked at build time"
```

---

### Task 2: League kind `rotation` and the schedule module

**Files:**
- Modify: `packages/engine/src/gamedata/league.ts` (`League`)
- Create: `packages/engine/src/gamedata/schedule.ts`
- Modify: `packages/engine/src/index.ts` (export)
- Test: `packages/engine/test/gamedata/schedule.test.ts`

**Interfaces:**
- Consumes: `Season` from `packages/engine/src/yourmeta/types.ts` (`{ id: number; name: string; start: string }`).
- Produces:
  - `League.kind: 'standard' | 'special' | 'cup' | 'rotation'`, `League.rankingsUpdated?: string` (YYYY-MM-DD), `League.stale?: boolean`
  - `interface ScheduleEntry { league: string; cup: string; cp: number; title: string; start: string; end: string; season: string }`
  - `type LeagueStatus = { state: 'live'; end: string } | { state: 'upcoming'; start: string } | { state: 'off' }`
  - `const UPCOMING_DAYS = 7`
  - `leagueStatus(schedule: readonly ScheduleEntry[], leagueId: string, now: Date): LeagueStatus`
  - `interface Run { start: string; end: string }`
  - `runsOf(schedule: readonly ScheduleEntry[], leagueId: string): Run[]` (merged, oldest first)
  - `currentRun(schedule: readonly ScheduleEntry[], leagueId: string, now: Date): Run | null`
  - `runSeasons(schedule: readonly ScheduleEntry[], leagueId: string, title: string): Season[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/test/gamedata/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  currentRun,
  leagueStatus,
  runSeasons,
  runsOf,
  type ScheduleEntry,
} from '../../src/gamedata/schedule.js';

const week = (league: string, start: string, end: string): ScheduleEntry => ({
  league,
  cup: league,
  cp: 1500,
  title: league === 'laic2027' ? '2026 GO LAIC Cup' : 'Retro Cup',
  start,
  end,
  season: 'Twilight Trails',
});

const RETRO = week('retro', '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z');
const LAIC_1 = week('laic2027', '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z');
const LAIC_2 = week('laic2027', '2026-11-17T21:00:00.000Z', '2026-11-24T21:00:00.000Z');
const SCHEDULE = [RETRO, LAIC_1, LAIC_2];
const at = (iso: string) => new Date(iso);

describe('leagueStatus', () => {
  it('is live from the start, inclusive, to the end, exclusive', () => {
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-22T19:59:59.000Z')).state).toBe('upcoming');
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-22T20:00:00.000Z'))).toEqual({
      state: 'live',
      end: RETRO.end,
    });
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-29T19:59:59.000Z')).state).toBe('live');
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-29T20:00:00.000Z')).state).toBe('off');
  });

  it('is upcoming from exactly seven days before the start', () => {
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-15T20:00:00.000Z'))).toEqual({
      state: 'upcoming',
      start: RETRO.start,
    });
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-15T19:59:59.000Z')).state).toBe('off');
  });

  it('reports a back-to-back run as live until its last week ends', () => {
    expect(leagueStatus(SCHEDULE, 'laic2027', at('2026-11-18T00:00:00.000Z'))).toEqual({
      state: 'live',
      end: LAIC_2.end,
    });
  });

  it('is off for a league the schedule does not name', () => {
    expect(leagueStatus(SCHEDULE, 'great', at('2026-09-23T00:00:00.000Z')).state).toBe('off');
  });
});

describe('runs', () => {
  it('merges weeks whose end meets the next start', () => {
    expect(runsOf(SCHEDULE, 'laic2027')).toEqual([{ start: LAIC_1.start, end: LAIC_2.end }]);
  });

  it('keeps separate weeks separate', () => {
    const twice = [RETRO, week('retro', '2026-10-27T21:00:00.000Z', '2026-11-03T21:00:00.000Z')];
    expect(runsOf(twice, 'retro')).toHaveLength(2);
  });

  it('currentRun is the run containing now, else the last run before now, else null', () => {
    expect(currentRun(SCHEDULE, 'laic2027', at('2026-11-20T00:00:00.000Z'))?.start).toBe(LAIC_1.start);
    expect(currentRun(SCHEDULE, 'retro', at('2026-10-05T00:00:00.000Z'))?.start).toBe(RETRO.start);
    expect(currentRun(SCHEDULE, 'retro', at('2026-09-01T00:00:00.000Z'))).toBeNull();
  });

  it('runSeasons names each run by the cup and its start date, oldest first', () => {
    expect(runSeasons(SCHEDULE, 'laic2027', '2026 GO LAIC Cup')).toEqual([
      { id: -1, name: '2026 GO LAIC Cup, Nov 10', start: LAIC_1.start },
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project engine packages/engine/test/gamedata/schedule.test.ts`
Expected: FAIL, cannot resolve `../../src/gamedata/schedule.js`.

- [ ] **Step 3: Implement**

In `packages/engine/src/gamedata/league.ts`, change the `kind` doc and type, and add two fields after `metaSize`:

```ts
  /** `standard` is an open league, `special` a PvPoke format behind PICKTHREE_SPECIAL_CUPS, `cup`
   *  a shipped tournament ruleset (the Play! ban list) that is always built, and `rotation` a GO
   *  Battle League cup from the schedule, shown while live or upcoming. */
  kind: 'standard' | 'special' | 'cup' | 'rotation';
```

```ts
  /** Rotation leagues: the day PvPoke last changed this cup's rankings (YYYY-MM-DD). */
  rankingsUpdated?: string;
  /** Rotation leagues: rankings older than the run by more than 30 days. */
  stale?: boolean;
```

Create `packages/engine/src/gamedata/schedule.ts`:

```ts
import type { Season } from '../yourmeta/types.js';

/** One GO Battle League week of one cup, as packages/data/schedule.json lists it. */
export interface ScheduleEntry {
  /** pick3 league id. */
  league: string;
  /** PvPoke cup slug. */
  cup: string;
  cp: number;
  /** The cup's name as the game gives it ("Retro Cup"). */
  title: string;
  /** ISO time, inclusive. */
  start: string;
  /** ISO time, exclusive. */
  end: string;
  /** GO Battle League season name. */
  season: string;
}

export type LeagueStatus =
  | { state: 'live'; end: string }
  | { state: 'upcoming'; start: string }
  | { state: 'off' };

/** How far ahead a cup shows as upcoming. */
export const UPCOMING_DAYS = 7;

const DAY_MS = 86_400_000;

export interface Run {
  start: string;
  end: string;
}

/** The league's weeks merged into runs: weeks whose end meets the next start are one run. */
export function runsOf(schedule: readonly ScheduleEntry[], leagueId: string): Run[] {
  const weeks = schedule
    .filter((e) => e.league === leagueId)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const runs: Run[] = [];
  for (const w of weeks) {
    const last = runs[runs.length - 1];
    if (last && Date.parse(last.end) === Date.parse(w.start)) {
      last.end = w.end;
    } else {
      runs.push({ start: w.start, end: w.end });
    }
  }
  return runs;
}

/** Live while a run contains now; upcoming when the next run starts within UPCOMING_DAYS. */
export function leagueStatus(
  schedule: readonly ScheduleEntry[],
  leagueId: string,
  now: Date,
): LeagueStatus {
  const t = now.getTime();
  for (const r of runsOf(schedule, leagueId)) {
    const start = Date.parse(r.start);
    const end = Date.parse(r.end);
    if (t >= start && t < end) {
      return { state: 'live', end: r.end };
    }
    if (t < start && start - t <= UPCOMING_DAYS * DAY_MS) {
      return { state: 'upcoming', start: r.start };
    }
  }
  return { state: 'off' };
}

/** The run containing now, else the most recent run that started before now, else null. */
export function currentRun(
  schedule: readonly ScheduleEntry[],
  leagueId: string,
  now: Date,
): Run | null {
  let found: Run | null = null;
  for (const r of runsOf(schedule, leagueId)) {
    if (Date.parse(r.start) <= now.getTime()) {
      found = r;
    }
  }
  return found;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The league's runs as Your meta seasons, oldest first, so the season window and buckets work
 * unchanged for a cup: "this season" becomes this run. Ids are negative so they never collide
 * with a real season's id. Names use the UTC date: a run starts at 20:00 or 21:00 UTC.
 */
export function runSeasons(
  schedule: readonly ScheduleEntry[],
  leagueId: string,
  title: string,
): Season[] {
  return runsOf(schedule, leagueId).map((r, i) => {
    const d = new Date(r.start);
    return {
      id: -(i + 1),
      name: `${title}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
      start: r.start,
    };
  });
}
```

In `packages/engine/src/index.ts`, next to the other gamedata exports, add:

```ts
export * from './gamedata/schedule.js';
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run --project engine packages/engine/test/gamedata/schedule.test.ts && npm run typecheck`
Expected: PASS and a clean typecheck. If typecheck flags an exhaustive `switch` on `League.kind` anywhere, add a `'rotation'` arm that behaves like `'cup'` and note the file in the commit message.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/engine/src/gamedata/league.ts packages/engine/src/gamedata/schedule.ts packages/engine/src/index.ts packages/engine/test/gamedata/schedule.test.ts
git add packages/engine/src/gamedata/league.ts packages/engine/src/gamedata/schedule.ts packages/engine/src/index.ts packages/engine/test/gamedata/schedule.test.ts
git commit -m "Engine: rotation league kind and the GBL schedule module"
```

---

### Task 3: Feed parser and cup aliases

**Files:**
- Create: `packages/data/cup-aliases.json`
- Create: `packages/data/src/schedule-feed.ts`
- Create: `packages/data/test/fixtures/gbl-feed.json`
- Test: `packages/data/test/schedule-feed.test.ts`

**Interfaces:**
- Consumes: `ScheduleEntry` from `@pickthree/engine` (Task 2).
- Produces:
  - `interface FeedEvent { name: string; eventType: string; start: string; end: string }`
  - `interface CupAlias { cup: string; cp?: number; note?: string }`
  - `interface ParsedFeed { entries: ScheduleEntry[]; skippedMega: string[]; unmapped: string[]; seasons: { name: string; start: string }[] }`
  - `parseFeed(events: readonly FeedEvent[], aliases: Record<string, CupAlias>): ParsedFeed`
  - `readAliases(file?: string): Record<string, CupAlias>`
  - `ALIASES_PATH`

- [ ] **Step 1: Capture the fixture**

Run from the repo root:

```bash
curl -s https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const e=JSON.parse(s).filter(x=>x.eventType==='go-battle-league').map(({name,eventType,start,end})=>({name,eventType,start,end}));e.push({name:'Great League and Spooky Cup: Great League Edition | Twilight Trails',eventType:'go-battle-league',start:'2026-12-08T21:00:00.000Z',end:'2026-12-15T21:00:00.000Z'});e.push({name:'Mega Malamar in Mega Raids',eventType:'raid-battles',start:'2026-09-23T06:00:00.000',end:'2026-09-29T22:00:00.000'});process.stdout.write(JSON.stringify(e,null,2)+'\n')})" > packages/data/test/fixtures/gbl-feed.json
```

Open the file and confirm it holds the Retro week (`2026-09-22T20:00:00.000Z`), a Mega Edition week, the Little Cup week, both LAIC weeks, the invented Spooky Cup, and one raid event. If the live feed has moved past the Retro week, hand-add that entry from the spec's table (name `Ultra League, Master League: Mega Edition, and Retro Cup: Great League Edition | Twilight Trails`, start `2026-09-22T20:00:00.000Z`, end `2026-09-29T20:00:00.000Z`).

- [ ] **Step 2: Write the aliases file**

Create `packages/data/cup-aliases.json`:

```json
{
  "Retro Cup": { "cup": "retro" },
  "Fantasy Cup": { "cup": "fantasy" },
  "Little Cup": { "cup": "little", "cp": 500 },
  "2026 GO LAIC Cup": { "cup": "laic2027", "cp": 1500, "note": "unconfirmed: check the rules match" }
}
```

- [ ] **Step 3: Write the failing tests**

Create `packages/data/test/schedule-feed.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFeed, readAliases, type FeedEvent } from '../src/schedule-feed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FEED = JSON.parse(
  fs.readFileSync(path.join(here, 'fixtures', 'gbl-feed.json'), 'utf8'),
) as FeedEvent[];
const parsed = parseFeed(FEED, readAliases());

describe('parseFeed', () => {
  it('turns the Retro week into one Great League cup entry', () => {
    expect(parsed.entries).toContainEqual({
      league: 'retro',
      cup: 'retro',
      cp: 1500,
      title: 'Retro Cup',
      start: '2026-09-22T20:00:00.000Z',
      end: '2026-09-29T20:00:00.000Z',
      season: 'Twilight Trails',
    });
  });

  it('takes Little Cup at the cap its alias sets, with no suffix on the id', () => {
    const little = parsed.entries.find((e) => e.cup === 'little');
    expect(little).toMatchObject({ league: 'little', cp: 500, title: 'Little Cup' });
  });

  it('lists both LAIC weeks', () => {
    expect(parsed.entries.filter((e) => e.league === 'laic2027')).toHaveLength(2);
  });

  it('never lists an open league or a mega format as a cup', () => {
    for (const e of parsed.entries) {
      expect(e.title).not.toMatch(/Mega|^Great League$|^Ultra League$|^Master League$/);
    }
    expect(parsed.skippedMega).toContain('Mega Color Cup: Great League Edition');
    expect(parsed.skippedMega).toContain('Master League: Mega Edition');
  });

  it('reports a cup it cannot map, once, and still writes the rest', () => {
    expect(parsed.unmapped).toEqual(['Spooky Cup']);
    expect(parsed.entries.length).toBeGreaterThan(0);
  });

  it('ignores events that are not GO Battle League', () => {
    expect(parsed.entries.every((e) => !e.title.includes('Raid'))).toBe(true);
  });

  it('reports each season name with its earliest week', () => {
    expect(parsed.seasons[0]).toEqual({ name: 'Twilight Trails', start: expect.any(String) });
    expect(parsed.seasons.map((s) => s.name)).toEqual(['Twilight Trails']);
  });

  it('suffixes an Ultra edition of a cup and takes its cap from the edition', () => {
    const ul = parseFeed(
      [
        {
          name: 'Great League and Fantasy Cup: Ultra League Edition | Twilight Trails',
          eventType: 'go-battle-league',
          start: '2026-12-01T21:00:00.000Z',
          end: '2026-12-08T21:00:00.000Z',
        },
      ],
      readAliases(),
    );
    expect(ul.entries).toEqual([
      expect.objectContaining({ league: 'fantasy-ultra', cup: 'fantasy', cp: 2500 }),
    ]);
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `npx vitest run --project data packages/data/test/schedule-feed.test.ts`
Expected: FAIL, cannot resolve `../src/schedule-feed.js`.

- [ ] **Step 5: Implement the parser**

Create `packages/data/src/schedule-feed.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { ScheduleEntry } from '@pickthree/engine';
import { DATA_PACKAGE_DIR } from './paths.js';

export const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';
export const ALIASES_PATH = path.join(DATA_PACKAGE_DIR, 'cup-aliases.json');

/** One ScrapedDuck event, trimmed to what the parser reads. */
export interface FeedEvent {
  name: string;
  eventType: string;
  start: string;
  end: string;
}

/** A feed cup title mapped to a PvPoke cup; `cp` for a cup whose name carries no edition. */
export interface CupAlias {
  cup: string;
  cp?: number;
  note?: string;
}

export interface ParsedFeed {
  entries: ScheduleEntry[];
  /** Formats left out because they need mega support, as the feed names them. */
  skippedMega: string[];
  /** Cup titles with no alias, each once. */
  unmapped: string[];
  /** Season names in the feed with their earliest GBL week start, oldest first. */
  seasons: { name: string; start: string }[];
}

const OPEN = new Set(['Great League', 'Ultra League', 'Master League']);
const EDITIONS: Record<string, { cp: number; suffix: string }> = {
  'Great League Edition': { cp: 1500, suffix: '' },
  'Ultra League Edition': { cp: 2500, suffix: '-ultra' },
  'Master League Edition': { cp: 10000, suffix: '-master' },
};

export function readAliases(file: string = ALIASES_PATH): Record<string, CupAlias> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, CupAlias>;
}

/** "A, B: Mega Edition, and C: Great League Edition" to its formats. */
function splitFormats(formats: string): string[] {
  return formats
    .split(/, and |, | and /)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

function iso(t: string): string {
  return new Date(t).toISOString();
}

export function parseFeed(
  events: readonly FeedEvent[],
  aliases: Record<string, CupAlias>,
): ParsedFeed {
  const entries: ScheduleEntry[] = [];
  const skippedMega = new Set<string>();
  const unmapped = new Set<string>();
  const seasonStart = new Map<string, string>();
  for (const ev of events) {
    if (ev.eventType !== 'go-battle-league') {
      continue;
    }
    const [formatsPart, seasonPart] = ev.name.split(' | ');
    const season = (seasonPart ?? '').trim();
    const start = iso(ev.start);
    const end = iso(ev.end);
    if (season) {
      const prev = seasonStart.get(season);
      if (!prev || Date.parse(start) < Date.parse(prev)) {
        seasonStart.set(season, start);
      }
    }
    for (const format of splitFormats(formatsPart ?? '')) {
      if (OPEN.has(format)) {
        continue;
      }
      if (format.includes('Mega')) {
        skippedMega.add(format);
        continue;
      }
      const [titlePart, editionPart] = format.split(': ');
      const title = (titlePart ?? '').trim();
      const edition = editionPart ? EDITIONS[editionPart.trim()] : undefined;
      const alias = aliases[title];
      if (!alias) {
        unmapped.add(title);
        continue;
      }
      const cp = alias.cp ?? edition?.cp;
      if (cp === undefined) {
        unmapped.add(title);
        continue;
      }
      const suffix = alias.cp === undefined ? (edition?.suffix ?? '') : '';
      entries.push({ league: `${alias.cup}${suffix}`, cup: alias.cup, cp, title, start, end, season });
    }
  }
  entries.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.league.localeCompare(b.league));
  return {
    entries,
    skippedMega: [...skippedMega],
    unmapped: [...unmapped],
    seasons: [...seasonStart]
      .map(([name, start]) => ({ name, start }))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
  };
}
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `npx vitest run --project data packages/data/test/schedule-feed.test.ts`
Expected: PASS. If `reports each season name` fails because the live feed already shows a second season, change that assertion to `expect(parsed.seasons[0]?.name).toBe('Twilight Trails')` (the fixture is what it is; the rule is "oldest first").

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/data/src/schedule-feed.ts packages/data/test/schedule-feed.test.ts packages/data/cup-aliases.json
git add packages/data/src/schedule-feed.ts packages/data/test/schedule-feed.test.ts packages/data/test/fixtures/gbl-feed.json packages/data/cup-aliases.json
git commit -m "Data: parse the GBL feed into cup weeks, megas skipped, unknown cups reported"
```

---

### Task 4: Merging the schedule and the season list

**Files:**
- Modify: `packages/data/src/schedule-feed.ts` (add `mergeSchedule`, `readSchedule`, `writeSchedule`, `SCHEDULE_PATH`)
- Modify: `packages/data/src/seasons.ts` (add `mergeSeasons`, `writeSeasons`)
- Test: `packages/data/test/schedule-feed.test.ts`, `packages/data/test/seasons.test.ts`

**Interfaces:**
- Consumes: `ParsedFeed`, `ScheduleEntry`, `Season`.
- Produces:
  - `SCHEDULE_PATH`
  - `mergeSchedule(existing: readonly ScheduleEntry[], fresh: readonly ScheduleEntry[], now: Date): ScheduleEntry[]`
  - `readSchedule(file?: string): ScheduleEntry[]` (validates; `[]` when the file is absent)
  - `writeSchedule(entries: readonly ScheduleEntry[], file?: string): void`
  - `mergeSeasons(seasons: readonly Season[], seen: readonly { name: string; start: string }[]): Season[]`
  - `writeSeasons(seasons: readonly Season[], file?: string): void`

Rules (from the spec): the feed is the truth for weeks that have not ended; ended weeks are kept until the season changes; once a newer season has started, weeks of earlier seasons are dropped. `seasons.json` needs ISO times with an offset (`readSeasons` rejects `Z`), so feed starts are written as `+00:00`.

- [ ] **Step 1: Write the failing schedule tests**

Append to `packages/data/test/schedule-feed.test.ts`:

```ts
import { mergeSchedule } from '../src/schedule-feed.js';
import type { ScheduleEntry } from '@pickthree/engine';

const wk = (league: string, start: string, end: string, season = 'Twilight Trails'): ScheduleEntry => ({
  league,
  cup: league,
  cp: 1500,
  title: league,
  start,
  end,
  season,
});

describe('mergeSchedule', () => {
  const retro = wk('retro', '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z');
  const little = wk('little', '2026-10-13T20:00:00.000Z', '2026-10-20T20:00:00.000Z');
  const fantasy = wk('fantasy', '2026-10-20T20:00:00.000Z', '2026-10-27T20:00:00.000Z');

  it('keeps an ended week the feed no longer lists', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    expect(mergeSchedule([retro, little], [little], now)).toEqual([retro, little]);
  });

  it('drops a future week the feed no longer lists (the schedule changed)', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    expect(mergeSchedule([retro, little, fantasy], [fantasy], now)).toEqual([retro, fantasy]);
  });

  it('drops the previous season once a newer season has started', () => {
    const next = wk('retro', '2026-12-08T21:00:00.000Z', '2026-12-15T21:00:00.000Z', 'Season 29');
    const now = new Date('2026-12-02T00:00:00.000Z');
    const firstOfNext = wk('little', '2026-12-01T21:00:00.000Z', '2026-12-08T21:00:00.000Z', 'Season 29');
    expect(mergeSchedule([retro, little], [firstOfNext, next], now)).toEqual([firstOfNext, next]);
  });

  it('keeps the current season while the next is only announced', () => {
    const next = wk('retro', '2026-12-08T21:00:00.000Z', '2026-12-15T21:00:00.000Z', 'Season 29');
    const now = new Date('2026-11-01T00:00:00.000Z');
    expect(mergeSchedule([retro], [next], now)).toEqual([retro, next]);
  });
});
```

- [ ] **Step 2: Write the failing season tests**

Append to `packages/data/test/seasons.test.ts` (add `mergeSeasons` to its import from `../src/seasons.js`):

```ts
describe('mergeSeasons', () => {
  const listed = [
    { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
    { id: 29, name: 'Season 29', start: '2026-12-01T13:00:00-08:00' },
  ];

  it('changes nothing for a season already listed by name', () => {
    expect(mergeSeasons(listed, [{ name: 'Twilight Trails', start: '2026-09-22T20:00:00.000Z' }])).toEqual(listed);
  });

  it('renames a placeholder that starts within a day of the new season', () => {
    expect(mergeSeasons(listed, [{ name: 'Frost Fair', start: '2026-12-01T21:00:00.000Z' }])).toEqual([
      listed[0],
      { id: 29, name: 'Frost Fair', start: '2026-12-01T13:00:00-08:00' },
    ]);
  });

  it('appends an unlisted season with the next id and an offset time', () => {
    const only = [listed[0]!];
    expect(mergeSeasons(only, [{ name: 'Frost Fair', start: '2026-12-01T21:00:00.000Z' }])).toEqual([
      listed[0],
      { id: 29, name: 'Frost Fair', start: '2026-12-01T21:00:00+00:00' },
    ]);
  });

  it('never appends the same season twice', () => {
    const once = mergeSeasons([listed[0]!], [{ name: 'Frost Fair', start: '2026-12-01T21:00:00.000Z' }]);
    expect(mergeSeasons(once, [{ name: 'Frost Fair', start: '2026-12-01T21:00:00.000Z' }])).toEqual(once);
  });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run --project data packages/data/test/schedule-feed.test.ts packages/data/test/seasons.test.ts`
Expected: FAIL, `mergeSchedule` and `mergeSeasons` are not exported.

- [ ] **Step 4: Implement `mergeSchedule` and the file helpers**

Append to `packages/data/src/schedule-feed.ts`:

```ts
export const SCHEDULE_PATH = path.join(DATA_PACKAGE_DIR, 'schedule.json');

const key = (e: ScheduleEntry): string => `${e.league}|${e.start}`;

/**
 * The feed decides every week that has not ended. Ended weeks stay until a newer season has
 * started, so a run that began before the feed dropped its first week keeps its start.
 */
export function mergeSchedule(
  existing: readonly ScheduleEntry[],
  fresh: readonly ScheduleEntry[],
  now: Date,
): ScheduleEntry[] {
  const t = now.getTime();
  const byKey = new Map<string, ScheduleEntry>();
  for (const e of existing) {
    if (Date.parse(e.end) <= t) {
      byKey.set(key(e), e);
    }
  }
  for (const e of fresh) {
    byKey.set(key(e), e);
  }
  const all = [...byKey.values()].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.league.localeCompare(b.league),
  );
  const started = all.filter((e) => Date.parse(e.start) <= t);
  const currentSeason = started[started.length - 1]?.season;
  if (currentSeason === undefined) {
    return all;
  }
  const currentStart = Math.min(
    ...all.filter((e) => e.season === currentSeason).map((e) => Date.parse(e.start)),
  );
  return all.filter((e) => e.season === currentSeason || Date.parse(e.start) > currentStart);
}

export function readSchedule(file: string = SCHEDULE_PATH): ScheduleEntry[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${file}: expected an array`);
  }
  return raw.map((x, i) => {
    const e = x as Partial<ScheduleEntry>;
    for (const f of ['league', 'cup', 'title', 'start', 'end', 'season'] as const) {
      if (typeof e[f] !== 'string' || e[f] === '') {
        throw new Error(`${file}: entry ${i} needs ${f}`);
      }
    }
    if (typeof e.cp !== 'number' || Number.isNaN(Date.parse(e.start!)) || Number.isNaN(Date.parse(e.end!))) {
      throw new Error(`${file}: entry ${i} needs a numeric cp and ISO start and end`);
    }
    return e as ScheduleEntry;
  });
}

export function writeSchedule(entries: readonly ScheduleEntry[], file: string = SCHEDULE_PATH): void {
  fs.writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
}
```

- [ ] **Step 5: Implement `mergeSeasons`**

Append to `packages/data/src/seasons.ts`:

```ts
const DAY_MS = 86_400_000;

/** A feed time (`...Z`) in the offset form readSeasons requires. */
function withOffset(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

/**
 * Seasons seen in the GBL feed folded into the list: a listed name changes nothing; a
 * placeholder ("Season 29") starting within a day is renamed; anything else is appended with
 * the next id.
 */
export function mergeSeasons(
  seasons: readonly Season[],
  seen: readonly { name: string; start: string }[],
): Season[] {
  const out = [...seasons].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (const s of seen) {
    if (out.some((x) => x.name === s.name)) {
      continue;
    }
    const placeholder = out.find(
      (x) => /^Season \d+$/.test(x.name) && Math.abs(Date.parse(x.start) - Date.parse(s.start)) <= DAY_MS,
    );
    if (placeholder) {
      out[out.indexOf(placeholder)] = { ...placeholder, name: s.name };
      continue;
    }
    const nextId = out.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    out.push({ id: nextId, name: s.name, start: withOffset(s.start) });
    out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  return out;
}

export function writeSeasons(seasons: readonly Season[], file: string = SEASONS_PATH): void {
  const lines = seasons.map((s) => `  ${JSON.stringify({ id: s.id, name: s.name, start: s.start })}`);
  fs.writeFileSync(file, `[\n${lines.join(',\n')}\n]\n`);
}
```

`writeSeasons` keeps the hand-written one-line-per-season layout, so a diff shows only the changed line.

- [ ] **Step 6: Run the tests and see them pass**

Run: `npx vitest run --project data packages/data/test/schedule-feed.test.ts packages/data/test/seasons.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/data/src/schedule-feed.ts packages/data/src/seasons.ts packages/data/test/schedule-feed.test.ts packages/data/test/seasons.test.ts
git add packages/data/src/schedule-feed.ts packages/data/src/seasons.ts packages/data/test/schedule-feed.test.ts packages/data/test/seasons.test.ts
git commit -m "Data: merge feed weeks into the schedule and new seasons into the season list"
```

---

### Task 5: The refresh CLI and the first `schedule.json`

**Files:**
- Create: `packages/data/src/refresh-schedule.ts`
- Modify: `packages/data/package.json` (scripts), root `package.json` (script)
- Delete: `packages/data/src/check-seasons.ts`
- Create (generated): `packages/data/schedule.json`
- Modify (generated): `packages/data/seasons.json`

**Interfaces:**
- Consumes: `FEED_URL`, `parseFeed`, `readAliases`, `mergeSchedule`, `readSchedule`, `writeSchedule`, `readSeasons`, `mergeSeasons`, `writeSeasons`.
- Produces: `npm run schedule:refresh` (root) / `npm -w @pickthree/data run schedule:refresh`. Exit codes: 0 fine, 3 wrote but some cups unmapped, 4 feed unusable and nothing written. Writes `packages/data/.cache/schedule-report.json`: `{ ok: boolean; unmapped: string[]; skippedMega: string[]; error: string | null }`.

- [ ] **Step 1: Write the CLI**

Create `packages/data/src/refresh-schedule.ts`:

```ts
/**
 * Pull the GBL feed, rewrite schedule.json and seasons.json, and leave a report for the daily
 * job. Exit 0 all mapped, 3 written with unmapped cups, 4 feed unusable (nothing written).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_PACKAGE_DIR } from './paths.js';
import {
  FEED_URL,
  mergeSchedule,
  parseFeed,
  readAliases,
  readSchedule,
  writeSchedule,
  type FeedEvent,
} from './schedule-feed.js';
import { mergeSeasons, readSeasons, writeSeasons } from './seasons.js';

const REPORT = path.join(DATA_PACKAGE_DIR, '.cache', 'schedule-report.json');

function report(r: { ok: boolean; unmapped: string[]; skippedMega: string[]; error: string | null }): void {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(r, null, 2)}\n`);
}

async function main(): Promise<number> {
  let events: FeedEvent[];
  try {
    const res = await fetch(process.env.PICKTHREE_SCHEDULE_FEED ?? FEED_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) {
      throw new Error('feed is not an array');
    }
    events = raw as FeedEvent[];
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`feed unusable: ${error}`);
    report({ ok: false, unmapped: [], skippedMega: [], error });
    return 4;
  }
  const gbl = events.filter((e) => e.eventType === 'go-battle-league');
  if (gbl.length === 0) {
    console.error('feed has no go-battle-league events; nothing written');
    report({ ok: false, unmapped: [], skippedMega: [], error: 'no go-battle-league events' });
    return 4;
  }
  const parsed = parseFeed(gbl, readAliases());
  const schedule = mergeSchedule(readSchedule(), parsed.entries, new Date());
  writeSchedule(schedule);
  writeSeasons(mergeSeasons(readSeasons(), parsed.seasons));
  console.log(`schedule: ${schedule.length} cup weeks (${[...new Set(schedule.map((e) => e.league))].join(', ')})`);
  for (const m of parsed.skippedMega) {
    console.log(`skipped mega: ${m}`);
  }
  for (const u of parsed.unmapped) {
    console.log(`UNMAPPED: ${u} (add it to packages/data/cup-aliases.json)`);
  }
  report({ ok: true, unmapped: parsed.unmapped, skippedMega: parsed.skippedMega, error: null });
  return parsed.unmapped.length > 0 ? 3 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  },
);
```

- [ ] **Step 2: Wire the scripts and retire the seasons nag**

In `packages/data/package.json` `scripts`, replace `"seasons:check": "tsx src/check-seasons.ts"` with:

```json
    "schedule:refresh": "tsx src/refresh-schedule.ts",
    "schedule:check": "tsx src/check-schedule.ts"
```

In the root `package.json` `scripts`, add `"schedule:refresh": "npm -w @pickthree/data run schedule:refresh"`.

Delete `packages/data/src/check-seasons.ts` with `git rm -q packages/data/src/check-seasons.ts` (this stages the deletion for Step 5's commit). Leave `seasonsStale` in `seasons.ts` if anything else imports it (`grep -rn seasonsStale packages apps --include=*.ts`); remove it only if nothing does. `check-schedule.ts` arrives in Task 7; until then `schedule:check` is unused.

- [ ] **Step 3: Generate the first schedule**

Run: `npm run schedule:refresh`
Expected: exit 0, a line `schedule: N cup weeks (retro, little, fantasy, laic2027)` (retro may be missing if the feed dropped it; then hand-add the Retro entry from Task 3 Step 1 to `schedule.json` so the build has the week that motivated this work), `skipped mega:` lines, no `UNMAPPED`. Check `git diff packages/data/seasons.json`: with only Twilight Trails in the feed it is unchanged.

- [ ] **Step 4: Human gate, the LAIC alias**

Stop and ask Travis to confirm `2026 GO LAIC Cup` -> `laic2027`. Show him `packages/data/.pvpoke/src/data/gamemaster/cups/laic2027.json` (include and exclude lists) next to Niantic's announced rules for the GBL week of 2026-11-10 (the pokemongolive.com season post, or LeekDuck's event page linked from the feed entry). If he confirms, change the alias note to `"confirmed by Travis <date>"`. If the rules differ, remove the alias; the refresh then reports it unmapped and the job files an issue, which is the correct state.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/data/src/refresh-schedule.ts packages/data/package.json package.json
git add packages/data/src/refresh-schedule.ts packages/data/package.json package.json packages/data/schedule.json packages/data/seasons.json packages/data/cup-aliases.json
git commit -m "Data: schedule:refresh writes schedule.json from the GBL feed; seasons nag retired"
```

---

### Task 6: Rotation leagues in the build

**Files:**
- Modify: `packages/data/src/fetch-pvpoke.ts` (blobless full history)
- Modify: `packages/data/src/leagues.ts` (rotation leagues, meta group, freshness)
- Modify: `packages/data/src/build-rankings.ts` (meta fallback)
- Modify: `packages/data/src/build.ts` (ship `schedule.json`)
- Modify: `.github/workflows/pages.yml`, `.github/workflows/ci.yml` (cache keys)
- Test: `packages/data/test/leagues.test.ts`, `packages/data/test/build-rankings.test.ts`

**Interfaces:**
- Consumes: `readSchedule`, `ScheduleEntry`, `runsOf` (engine), `readLock`.
- Produces (exported from `leagues.ts`): `hasRankings(cup, cp)`, `rankingsUpdated(cup, cp): string | null`, `isStale(updated: string | null, runStart: string): boolean`, `STALE_DAYS = 30`, `metaGroupFor(cup: string): string`. From `build-rankings.ts`: `metaFromRankings(entries: RankingEntry[], n: number): MetaEntry[]`, `META_FALLBACK_SIZE = 48`. Built output gains `/data/schedule.json`; `leagues.json` gains rotation leagues after the Tournament league.

- [ ] **Step 1: Write the failing unit tests**

Append to `packages/data/test/build-rankings.test.ts` (add the import):

```ts
import { metaFromRankings } from '../src/build-rankings.js';

describe('metaFromRankings', () => {
  const r = (id: string, moveset: string[]) =>
    ({ speciesId: id, moveset, score: 90, rating: 500, fastMoves: [], chargedMoves: [], matchups: [], counters: [], statProduct: null }) as never;

  it('takes the top n with a fast move and up to two charged moves', () => {
    expect(metaFromRankings([r('a', ['F', 'C1', 'C2', 'C3']), r('b', ['F', 'C1']), r('c', ['F', 'C1'])], 2)).toEqual([
      { speciesId: 'a', fastMove: 'F', chargedMoves: ['C1', 'C2'] },
      { speciesId: 'b', fastMove: 'F', chargedMoves: ['C1'] },
    ]);
  });

  it('skips an entry with no charged move and still fills n', () => {
    expect(metaFromRankings([r('a', ['F']), r('b', ['F', 'C1'])], 1).map((m) => m.speciesId)).toEqual(['b']);
  });
});
```

Append to `packages/data/test/leagues.test.ts`, outside the `skipIf` block (add the imports):

```ts
import { isStale } from '../src/leagues.js';

describe('isStale', () => {
  it('is stale when the rankings predate the run by more than 30 days', () => {
    expect(isStale('2024-03-04', '2026-10-13T20:00:00.000Z')).toBe(true);
    expect(isStale('2026-09-15', '2026-09-22T20:00:00.000Z')).toBe(false);
    expect(isStale('2026-08-24', '2026-09-22T20:00:00.000Z')).toBe(false);
    expect(isStale('2026-08-22', '2026-09-22T20:00:00.000Z')).toBe(true);
  });

  it('is stale when the date is unknown', () => {
    expect(isStale(null, '2026-09-22T20:00:00.000Z')).toBe(true);
  });
});
```

And inside the existing `describe.skipIf(!havePvPoke)('readLeagues', ...)` block:

```ts
  it('adds one rotation league per scheduled cup PvPoke ranks, after the Tournament league', () => {
    const leagues = readLeagues();
    const schedule = readSchedule();
    const rotation = leagues.filter((l) => l.kind === 'rotation');
    const tournamentAt = leagues.findIndex((l) => l.id === 'championshipseries');
    for (const l of rotation) {
      expect(leagues.indexOf(l)).toBeGreaterThan(tournamentAt);
      const entry = schedule.find((e) => e.league === l.id);
      expect(entry, l.id).toBeDefined();
      expect(l.cup).toBe(entry!.cup);
      expect(l.cp).toBe(entry!.cp);
      expect(l.title).toBe(entry!.title);
      expect(hasRankings(l.cup, l.cp)).toBe(true);
      expect(l.rankingsUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof l.stale).toBe('boolean');
    }
    expect(new Set(rotation.map((l) => l.id)).size).toBe(rotation.length);
  });
```

(Import `readSchedule` from `../src/schedule-feed.js` and `hasRankings` from `../src/leagues.js`.)

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project data packages/data/test/leagues.test.ts packages/data/test/build-rankings.test.ts`
Expected: FAIL on the missing exports.

- [ ] **Step 3: Fetch enough PvPoke history for freshness**

In `packages/data/src/fetch-pvpoke.ts` `ensurePvPokeCheckout()`:

- Replace `git(['fetch', '-q', '--depth', '1', 'origin', lock.commit], PVPOKE_DIR);` with `git(['fetch', '-q', '--filter=blob:none', 'origin', lock.commit], PVPOKE_DIR);`
- Replace the early return at the top with:

```ts
  if (currentCheckoutCommit() === lock.commit) {
    // Checkouts made before 2026-09-29 were shallow; freshness needs the file history.
    if (git(['rev-parse', '--is-shallow-repository'], PVPOKE_DIR) === 'true') {
      git(['fetch', '-q', '--unshallow', '--filter=blob:none', 'origin'], PVPOKE_DIR);
    }
    return;
  }
```

Then run `npm run data:fetch` twice and time it (`time npm run data:fetch`). Record the first (cold) and second (warm) times in the commit message. If the cold fetch takes more than 3 minutes, stop and tell Travis before continuing; the fallback is reading dates from the GitHub commits API in CI.

- [ ] **Step 4: Rotation leagues, meta group and freshness**

In `packages/data/src/leagues.ts`, add imports:

```ts
import { execFileSync } from 'node:child_process';
import { runsOf } from '@pickthree/engine';
import { readLock } from './lock.js';
import { readSchedule } from './schedule-feed.js';
```

Export the two existing helpers (`export function hasRankings`, `export function hasGroup`) and add:

```ts
export const STALE_DAYS = 30;

/** PvPoke's meta group name for a cup: formats.json's `meta` when the cup is listed, else the slug. */
export function metaGroupFor(cup: string): string {
  const formats = readJson<RawFormat[]>(FORMATS_PATH);
  return formats.find((f) => f.cup === cup)?.meta ?? cup;
}

/** The day PvPoke last changed the cup's overall rankings at the pinned commit, or null. */
export function rankingsUpdated(cup: string, cp: number): string | null {
  const rel = path.posix.join('src', 'data', 'rankings', cup, 'overall', `rankings-${cp}.json`);
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', 'HEAD', '--', rel], {
      cwd: PVPOKE_DIR,
      encoding: 'utf8',
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Rankings older than the run by more than STALE_DAYS, or of unknown age. */
export function isStale(updated: string | null, runStart: string): boolean {
  if (updated === null) {
    return true;
  }
  return Date.parse(runStart) - Date.parse(`${updated}T00:00:00Z`) > STALE_DAYS * 86_400_000;
}
```

In `readLeagues()`, after the `SHIPPED_CUPS` loop and before the special-cups block:

```ts
  // GO Battle League cups from the schedule, whatever today's date: the build depends only on
  // committed files. The phone decides which are live or upcoming.
  const schedule = readSchedule();
  const pinDate = Date.parse(`${readLock().date}T00:00:00Z`);
  for (const id of [...new Set(schedule.map((e) => e.league))]) {
    const first = schedule.find((e) => e.league === id)!;
    if (!hasRankings(first.cup, first.cp)) {
      console.log(`no rankings: ${first.cup} at ${first.cp} (league ${id} not built)`);
      continue;
    }
    const runs = runsOf(schedule, id);
    // Staleness is judged against the run in play at the pinned commit's date, else the next.
    const run = runs.find((r) => Date.parse(r.end) > pinDate) ?? runs[runs.length - 1]!;
    const updated = rankingsUpdated(first.cup, first.cp);
    const cup = readCup(first.cup);
    out.push({
      id,
      title: first.title,
      short: shortTitle(first.title),
      cp: first.cp,
      cup: first.cup,
      meta: metaGroupFor(first.cup),
      kind: 'rotation',
      minCp: minCpFor(first.cp),
      include: cup.include ?? [],
      exclude: cup.exclude ?? [],
      metaSize: 0,
      ...(updated ? { rankingsUpdated: updated } : {}),
      stale: isStale(updated, run.start),
    });
  }
```

The special-cups loop already skips ids present in `out`, so a rotation cup is never listed twice.

- [ ] **Step 5: Meta fallback**

In `packages/data/src/build-rankings.ts`, add:

```ts
export const META_FALLBACK_SIZE = 48;

/** A meta for a cup PvPoke has no group for: its top n ranked, each with a charged move. */
export function metaFromRankings(entries: RankingEntry[], n: number): MetaEntry[] {
  return entries
    .filter((e) => e.moveset.length >= 2)
    .slice(0, n)
    .map((e) => ({ speciesId: e.speciesId, fastMove: e.moveset[0]!, chargedMoves: e.moveset.slice(1, 3) }));
}
```

In `writeLeagueRankings`, replace `const meta = readMeta(league.meta);` with:

```ts
  const meta = fs.existsSync(path.join(GROUPS_DIR, `${league.meta}.json`))
    ? readMeta(league.meta)
    : metaFromRankings(readRankings(league.cup, league.cp, 'overall'), META_FALLBACK_SIZE);
```

- [ ] **Step 6: Ship the schedule**

In `packages/data/src/build.ts`, import `readSchedule` and `SCHEDULE_PATH` from `./schedule-feed.js` and, after the `seasons.json` copy:

```ts
  readSchedule(); // validates before we ship it
  if (fs.existsSync(SCHEDULE_PATH)) {
    fs.copyFileSync(SCHEDULE_PATH, path.join(OUTPUT_DIR, 'schedule.json'));
  } else {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'schedule.json'), '[]');
  }
```

- [ ] **Step 7: Cache keys**

In `.github/workflows/pages.yml` (one key) and `.github/workflows/ci.yml` (three keys), add `'packages/data/schedule.json', 'packages/data/cup-aliases.json'` to each `data-${{ hashFiles(...) }}` list, right after `'packages/data/seasons.json'`.

- [ ] **Step 8: Build and run everything**

Run: `npm run data:build 2>&1 | grep -E "rotation|no rankings|retro|little|laic|fantasy|built"` then `npx vitest run --project data`
Expected: the build logs `retro: meta N`, `little: meta N`, `laic2027: meta N`, `no rankings: fantasy at 1500` (unless PvPoke has since published it), and `built ... files`. All data tests pass. Then `PICKTHREE_REQUIRE_PVPOKE=1 npm test` passes in full.

- [ ] **Step 9: Build invariants on live data**

Append to `packages/data/test/leagues.test.ts` inside the `skipIf(!havePvPoke)` block, guarded on the built output:

```ts
  it.skipIf(!fs.existsSync(path.join(OUTPUT_DIR, 'leagues.json')))(
    'every built rotation league has rankings, a meta of 1 to 48 and a matrix covering it',
    () => {
      const built = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'leagues.json'), 'utf8')) as League[];
      for (const l of built.filter((x) => x.kind === 'rotation')) {
        const overall = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'rankings', l.id, 'overall.json'), 'utf8')) as unknown[];
        const meta = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'meta', `${l.id}.json`), 'utf8')) as { speciesId: string }[];
        expect(overall.length, l.id).toBeGreaterThan(0);
        expect(meta.length, l.id).toBeGreaterThanOrEqual(1);
        expect(meta.length, l.id).toBeLessThanOrEqual(48);
        expect(l.metaSize).toBe(meta.length);
      }
    },
  );
```

Before writing the matrix assertion, open `packages/data/src/build-matrix.ts` and find the matrix file path and its opponents field (`grep -n "writeFileSync\|opponents" packages/data/src/build-matrix.ts`); add inside the loop:

```ts
        const matrix = JSON.parse(fs.readFileSync(<matrix path for l.id from build-matrix.ts>, 'utf8')) as { opponents: string[] };
        expect(new Set(matrix.opponents)).toEqual(new Set(meta.map((m) => m.speciesId)));
```

replacing `<matrix path ...>` with the literal `path.join(OUTPUT_DIR, ...)` you found. If the matrix stores opponents in a different field, assert on that field. Import `OUTPUT_DIR` from `../src/paths.js`, `path`, and `type League` from `@pickthree/engine`.

Run: `npx vitest run --project data packages/data/test/leagues.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
npx prettier --write packages/data/src/fetch-pvpoke.ts packages/data/src/leagues.ts packages/data/src/build-rankings.ts packages/data/src/build.ts packages/data/test/leagues.test.ts packages/data/test/build-rankings.test.ts
git add packages/data/src/fetch-pvpoke.ts packages/data/src/leagues.ts packages/data/src/build-rankings.ts packages/data/src/build.ts packages/data/test/leagues.test.ts packages/data/test/build-rankings.test.ts .github/workflows/pages.yml .github/workflows/ci.yml
git commit -m "Data: build one rotation league per scheduled cup PvPoke ranks, with freshness"
```

---

### Task 7: Little Cup end to end at 500 CP

**Files:**
- Test: `packages/engine/test/recommend.e2e.test.ts`
- Possibly modify: whichever engine file the test exposes as 1500-shaped

**Interfaces:**
- Consumes: the built `little` league (Task 6); `loadStaticData` in `packages/engine/test/fixtures.ts`. Check its signature first (`grep -n "export function loadStaticData" -A15 packages/engine/test/fixtures.ts`): if it takes no league argument, add an optional `leagueId = 'great'` parameter that picks `rankings/<id>/`, `meta/<id>.json`, the matrix and the league from `leagues.json` the same way it does for Great League today, and cache per league id.

- [ ] **Step 1: Write the test**

Append to `packages/engine/test/recommend.e2e.test.ts`:

```ts
describe.skipIf(!ready || !haveLeague('little'))('recommend at Little Cup', () => {
  const data = loadStaticData('little');
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);

  it('builds legal teams at or under 500 CP from the fixture collection', () => {
    const rec = recommend(specimens, {}, { data, sim });
    expect(data.league.cp).toBe(500);
    for (const team of rec.teams) {
      for (const slot of team.slots) {
        const sp = index.species(slot.candidate.build.speciesId);
        expect(sp, slot.candidate.build.speciesId).toBeDefined();
        expect(allowedInLeague(sp!, data.league)).toBe(true);
        expect(slot.candidate.build.cp).toBeLessThanOrEqual(500);
      }
      expect(new Set(team.slots.map((s) => s.candidate.build.speciesId)).size).toBe(3);
      expect(team.cost.stardust).toBeGreaterThanOrEqual(0);
    }
  });
});
```

Add `haveLeague(id)` to `fixtures.ts` (true when `leagues.json` in the static data lists `id`), and import `allowedInLeague` from `../src/gamedata/league.js`. Check the real names first: `index.species(...)` may be `index.get(...)` or `index.speciesById(...)`, and the build's CP may live at `build.cp` or `build.bestCp` (`grep -n "cp" packages/engine/src/builds/*.ts | head`). Use the real names.

The fixture collection may have no Little Cup eligible specimen at all. If `rec.teams` is empty, the loop asserts nothing: add `expect(rec.stats.eligibleBuilds).toBeGreaterThanOrEqual(0)` and log `rec.stats` so the run shows what happened; an empty result with no throw is a pass, since the fixture is a Great League collection.

- [ ] **Step 2: Run it**

Run: `PICKTHREE_REQUIRE_PVPOKE=1 npx vitest run --project engine packages/engine/test/recommend.e2e.test.ts -t "Little Cup"`
Expected: PASS. If it throws or fails, the failure names the 1500-shaped code. Fix it there (a hard-coded `1500`, `GREAT_LEAGUE`, or `minCpFor` assumption), add a focused unit test next to the fix, and re-run.

- [ ] **Step 3: Commit**

```bash
npx prettier --write packages/engine/test/recommend.e2e.test.ts packages/engine/test/fixtures.ts
git add packages/engine/test/recommend.e2e.test.ts packages/engine/test/fixtures.ts
git commit -m "Engine: Little Cup end to end at 500 CP"
```

(Add any engine file fixed in Step 2 to the same `git add`.)

---

### Task 8: Warnings and the daily job

**Files:**
- Create: `packages/data/src/check-schedule.ts`
- Test: `packages/data/test/check-schedule.test.ts`
- Create: `.github/workflows/daily-refresh.yml`
- Delete: `.github/workflows/data-refresh.yml`
- Modify: `docs/superpowers/specs/2026-09-29-gbl-rotation-sync-design.md` (feed failure rule)

**Interfaces:**
- Consumes: `readSchedule`, `hasRankings`, `rankingsUpdated`, `isStale`, `runsOf`, `UPCOMING_DAYS`, the report file from Task 5.
- Produces: `scheduleWarnings(input: { schedule: ScheduleEntry[]; report: { ok: boolean; unmapped: string[]; error: string | null } | null; ranked: (cup: string, cp: number) => boolean; updated: (cup: string, cp: number) => string | null; now: Date }): { title: string; body: string }[]`. The CLI prints the warnings as a JSON array on stdout.

Feed-failure rule, amended from the spec's "3 days running": GitHub's workflow token cannot keep a counter between runs without extra state, so the job files the feed issue on the first failed day and closes it on the next good day. Step 7 records this in the spec.

- [ ] **Step 1: Write the failing tests**

Create `packages/data/test/check-schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ScheduleEntry } from '@pickthree/engine';
import { scheduleWarnings } from '../src/check-schedule.js';

const wk = (league: string, cp: number, start: string, end: string): ScheduleEntry => ({
  league,
  cup: league,
  cp,
  title: league === 'little' ? 'Little Cup' : 'Fantasy Cup',
  start,
  end,
  season: 'Twilight Trails',
});
const LITTLE = wk('little', 500, '2026-10-13T20:00:00.000Z', '2026-10-20T20:00:00.000Z');
const FANTASY = wk('fantasy', 1500, '2026-10-20T20:00:00.000Z', '2026-10-27T20:00:00.000Z');
const base = {
  schedule: [LITTLE, FANTASY],
  report: { ok: true, unmapped: [], error: null },
  ranked: (cup: string) => cup !== 'fantasy',
  updated: () => '2024-03-04',
};

describe('scheduleWarnings', () => {
  it('says nothing about cups more than a week away', () => {
    expect(scheduleWarnings({ ...base, now: new Date('2026-10-01T00:00:00Z') })).toEqual([]);
  });

  it('warns about stale rankings for a cup starting within a week', () => {
    const w = scheduleWarnings({ ...base, now: new Date('2026-10-08T00:00:00Z') });
    expect(w.map((x) => x.title)).toEqual(['Little Cup starts 2026-10-13 on stale PvPoke rankings']);
  });

  it('warns about a cup with no rankings starting within a week', () => {
    const w = scheduleWarnings({ ...base, now: new Date('2026-10-15T00:00:00Z') });
    expect(w.map((x) => x.title)).toContain('Fantasy Cup starts 2026-10-20 with no PvPoke rankings at 1500');
  });

  it('warns once per unmapped cup and once for an unusable feed', () => {
    const w = scheduleWarnings({
      ...base,
      report: { ok: false, unmapped: ['Spooky Cup'], error: 'HTTP 500' },
      now: new Date('2026-10-01T00:00:00Z'),
    });
    expect(w.map((x) => x.title)).toEqual([
      "Map GBL cup 'Spooky Cup' to a PvPoke cup",
      'GBL schedule feed failing',
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project data packages/data/test/check-schedule.test.ts`
Expected: FAIL, cannot resolve `../src/check-schedule.js`.

- [ ] **Step 3: Implement**

Create `packages/data/src/check-schedule.ts`:

```ts
/**
 * Warnings for the daily job, printed as a JSON array of { title, body }. The workflow opens one
 * issue per title (or comments on the open one). Titles are stable so issues deduplicate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { UPCOMING_DAYS, runsOf, type ScheduleEntry } from '@pickthree/engine';
import { hasRankings, isStale, rankingsUpdated } from './leagues.js';
import { DATA_PACKAGE_DIR } from './paths.js';
import { readSchedule } from './schedule-feed.js';

export interface Warning {
  title: string;
  body: string;
}

export function scheduleWarnings(input: {
  schedule: ScheduleEntry[];
  report: { ok: boolean; unmapped: string[]; error: string | null } | null;
  ranked: (cup: string, cp: number) => boolean;
  updated: (cup: string, cp: number) => string | null;
  now: Date;
}): Warning[] {
  const out: Warning[] = [];
  for (const title of input.report?.unmapped ?? []) {
    out.push({
      title: `Map GBL cup '${title}' to a PvPoke cup`,
      body: `The GBL feed names '${title}'. Add it to packages/data/cup-aliases.json with its PvPoke cup slug (and cp if the name carries no edition), after checking the rules match.`,
    });
  }
  if (input.report && !input.report.ok) {
    out.push({
      title: 'GBL schedule feed failing',
      body: `schedule:refresh could not use the feed (${input.report.error ?? 'unknown'}). schedule.json was left as it was. This closes itself on the next good run.`,
    });
  }
  const t = input.now.getTime();
  for (const league of [...new Set(input.schedule.map((e) => e.league))]) {
    const first = input.schedule.find((e) => e.league === league)!;
    const run = runsOf(input.schedule, league).find(
      (r) => Date.parse(r.end) > t && Date.parse(r.start) - t <= UPCOMING_DAYS * 86_400_000,
    );
    if (!run) {
      continue;
    }
    const day = run.start.slice(0, 10);
    if (!input.ranked(first.cup, first.cp)) {
      out.push({
        title: `${first.title} starts ${day} with no PvPoke rankings at ${first.cp}`,
        body: `pick3 will not offer ${first.title} until PvPoke publishes rankings-${first.cp}.json for '${first.cup}'. The daily job picks them up when they land.`,
      });
      continue;
    }
    const updated = input.updated(first.cup, first.cp);
    if (isStale(updated, run.start)) {
      out.push({
        title: `${first.title} starts ${day} on stale PvPoke rankings`,
        body: `PvPoke last changed '${first.cup}' rankings on ${updated ?? 'an unknown date'}. The app labels the cup; the daily job clears this once PvPoke refreshes.`,
      });
    }
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('check-schedule.ts')) {
  const reportFile = path.join(DATA_PACKAGE_DIR, '.cache', 'schedule-report.json');
  const report = fs.existsSync(reportFile)
    ? (JSON.parse(fs.readFileSync(reportFile, 'utf8')) as { ok: boolean; unmapped: string[]; error: string | null })
    : null;
  const warnings = scheduleWarnings({
    schedule: readSchedule(),
    report,
    ranked: hasRankings,
    updated: rankingsUpdated,
    now: new Date(),
  });
  process.stdout.write(`${JSON.stringify(warnings)}\n`);
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run --project data packages/data/test/check-schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: The workflow**

Create `.github/workflows/daily-refresh.yml`:

```yaml
name: daily-refresh
on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
  issues: write
  actions: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - name: Schedule from the GBL feed
        id: schedule
        run: |
          set +e
          npm -w @pickthree/data run schedule:refresh
          echo "code=$?" >> "$GITHUB_OUTPUT"
      - name: PvPoke pin
        id: bump
        run: |
          before=$(node -p "require('./packages/data/pvpoke.lock.json').commit")
          npm run data:refresh
          after=$(node -p "require('./packages/data/pvpoke.lock.json').commit")
          echo "changed=$([ "$before" != "$after" ] && echo true || echo false)" >> "$GITHUB_OUTPUT"
          echo "after=$after" >> "$GITHUB_OUTPUT"
      - name: Build and test whatever changed
        id: build
        run: |
          npm run data:fetch
          npm -w @pickthree/sim-pvpoke run vendor:sync
          if git diff --quiet -- packages/data/schedule.json packages/data/seasons.json packages/data/pvpoke.lock.json; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "changed=true" >> "$GITHUB_OUTPUT"
          npm run data:build
          PICKTHREE_REQUIRE_PVPOKE=1 npm test
          if git diff --quiet -- packages/sim-pvpoke/vendor packages/sim-pvpoke/LICENSE-pvpoke; then
            echo "vendor=false" >> "$GITHUB_OUTPUT"
          else
            echo "vendor=true" >> "$GITHUB_OUTPUT"
          fi
      - name: Commit data straight to main
        id: push
        if: steps.build.outputs.changed == 'true'
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add packages/data/schedule.json packages/data/seasons.json
          if [ "${{ steps.build.outputs.vendor }}" != 'true' ]; then
            git add packages/data/pvpoke.lock.json
          fi
          if git diff --cached --quiet; then
            echo "pushed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          git commit -m "Data: daily refresh (schedule, seasons, PvPoke data)"
          if git push origin HEAD:main; then
            echo "pushed=true" >> "$GITHUB_OUTPUT"
          else
            echo "::warning::push to main refused; falling back to a PR"
            echo "pushed=false" >> "$GITHUB_OUTPUT"
            echo "fallback=true" >> "$GITHUB_OUTPUT"
          fi
      - name: PR for PvPoke battle code (or a refused push)
        if: steps.build.outputs.vendor == 'true' || steps.push.outputs.fallback == 'true'
        uses: peter-evans/create-pull-request@v7
        with:
          branch: data-refresh/${{ steps.bump.outputs.after }}
          title: 'Refresh PvPoke data to ${{ steps.bump.outputs.after }}'
          commit-message: 'Refresh PvPoke data to ${{ steps.bump.outputs.after }}'
          body: |
            PvPoke's battle code changed, so this refresh waits for review. Golden simulator tests passed.
            Review the vendor diff before merging.
          add-paths: |
            packages/data/pvpoke.lock.json
            packages/data/schedule.json
            packages/data/seasons.json
            packages/sim-pvpoke/vendor/**
            packages/sim-pvpoke/LICENSE-pvpoke
      - name: Deploy
        # A push made with the workflow token starts no workflows, so ask for the deploy.
        if: steps.push.outputs.pushed == 'true'
        run: gh workflow run pages.yml --ref main
      - name: Warnings
        if: always()
        run: |
          warnings=$(npm -s -w @pickthree/data run schedule:check)
          echo "$warnings"
          gh label create schedule --description "GBL schedule and cup data" --color 5319e7 --force >/dev/null
          echo "$warnings" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const w of JSON.parse(s||'[]'))console.log(JSON.stringify(w))})" |
          while IFS= read -r line; do
            title=$(node -e "console.log(JSON.parse(process.argv[1]).title)" "$line")
            body=$(node -e "console.log(JSON.parse(process.argv[1]).body)" "$line")
            existing=$(gh issue list --label schedule --state open --search "\"$title\" in:title" --json number,title --jq ".[] | select(.title == \"$title\") | .number" | head -1)
            if [ -n "$existing" ]; then
              gh issue comment "$existing" --body "Still true as of $(date -u +%F)."
            else
              gh issue create --title "$title" --label schedule --body "$body"
            fi
          done
          if [ "${{ steps.schedule.outputs.code }}" != '4' ]; then
            for n in $(gh issue list --label schedule --state open --search '"GBL schedule feed failing" in:title' --json number --jq '.[].number'); do
              gh issue close "$n" --comment "Feed read fine on $(date -u +%F)."
            done
          fi
```

Then `git rm .github/workflows/data-refresh.yml`.

- [ ] **Step 6: Lint the workflow**

Run: `npx --yes @action-validator/cli@0.6.0 .github/workflows/daily-refresh.yml` if that tool is available offline; otherwise run `node -e "require('js-yaml')" 2>/dev/null && node -e "console.log(Object.keys(require('js-yaml').load(require('fs').readFileSync('.github/workflows/daily-refresh.yml','utf8')).jobs))"` to at least confirm it parses. Expected: no errors / prints `[ 'refresh' ]`.

- [ ] **Step 7: Amend the spec**

In the spec's "The daily job" list, replace `- the feed unreachable or unparseable 3 days running (a counter in the issue body).` with `- the feed unreachable or unparseable (filed on the first failed day, closed on the next good day: the workflow token cannot keep a counter between runs).`

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages/data/src/check-schedule.ts packages/data/test/check-schedule.test.ts
git add packages/data/src/check-schedule.ts packages/data/test/check-schedule.test.ts .github/workflows/daily-refresh.yml docs/superpowers/specs/2026-09-29-gbl-rotation-sync-design.md
git rm -q .github/workflows/data-refresh.yml
git commit -m "CI: daily refresh of the schedule and PvPoke data, auto-merged when only data moved"
```

---

### Task 9: The schedule in the app's boot data, and an app clock

**Files:**
- Modify: `apps/web/src/worker/engine.worker.ts:88-96,119,230`
- Modify: `apps/web/src/host/protocol.ts:120-135`
- Modify: `apps/web/src/state/store.tsx` (`DataInfo`, around line 105)
- Modify: `apps/web/test/fakeHost.ts` (ready reply)
- Create: `apps/web/src/clock.ts`
- Test: `apps/web/test/clock.test.ts`

**Interfaces:**
- Produces: `DataInfo.schedule: ScheduleEntry[]` (empty when the build predates it); `appNow(): Date`.

- [ ] **Step 1: Write the failing clock test**

Create `apps/web/test/clock.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appNow } from '../src/clock.ts';

describe('appNow', () => {
  afterEach(() => {
    localStorage.removeItem('pick3.now');
    vi.unstubAllGlobals();
  });

  it('is the real time for a person', () => {
    const before = Date.now();
    expect(appNow().getTime()).toBeGreaterThanOrEqual(before);
  });

  it('ignores a stored time unless automation is driving the page', () => {
    localStorage.setItem('pick3.now', '2026-10-14T00:00:00.000Z');
    expect(appNow().toISOString()).not.toBe('2026-10-14T00:00:00.000Z');
  });

  it('honors a stored time under automation, for the screenshot run', () => {
    vi.stubGlobal('navigator', { ...navigator, webdriver: true });
    localStorage.setItem('pick3.now', '2026-10-14T00:00:00.000Z');
    expect(appNow().toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project web apps/web/test/clock.test.ts`
Expected: FAIL, cannot resolve `../src/clock.ts`.

- [ ] **Step 3: Implement the clock**

Create `apps/web/src/clock.ts`:

```ts
/**
 * The time the app decides live and upcoming cups by. A person always gets the real clock. The
 * screenshot run (navigator.webdriver) may pin it with localStorage 'pick3.now', so its captures
 * show a live and an upcoming cup whatever day it runs.
 */
export function appNow(): Date {
  try {
    if (navigator.webdriver) {
      const pinned = localStorage.getItem('pick3.now');
      if (pinned && !Number.isNaN(Date.parse(pinned))) {
        return new Date(pinned);
      }
    }
  } catch {
    // Storage blocked: the real clock.
  }
  return new Date();
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run --project web apps/web/test/clock.test.ts`
Expected: PASS.

- [ ] **Step 5: Carry the schedule through boot**

- `engine.worker.ts` `boot()`: add `json<ScheduleEntry[]>('/data/schedule.json').catch(() => [] as ScheduleEntry[])` as an eighth entry of the `Promise.all` (destructure it as `schedule`), return it in the env object, and add `schedule: env.schedule,` next to `seasons: env.seasons,` in the ready reply (line 230). Add `schedule: ScheduleEntry[]` to the `Env` interface.
- `host/protocol.ts` ready result: after `seasons: Season[];` add `/** GO Battle League cup weeks. Empty when the data build predates the schedule. */ schedule: ScheduleEntry[];`
- `state/store.tsx` `DataInfo`: after `seasons: Season[];` add `schedule: ScheduleEntry[];`. Find where the ready reply becomes `DataInfo` (`grep -n "seasons: r.seasons\|seasons: reply" apps/web/src/state/store.tsx`) and copy `schedule` the same way, defaulting to `[]` (`schedule: r.schedule ?? []`).
- `apps/web/test/fakeHost.ts` ready reply: add `schedule: [],` after `seasons: SEASONS,`.
- Import `type ScheduleEntry` from `@pickthree/engine` in each file.

- [ ] **Step 6: Typecheck and run the web suite**

Run: `npm run typecheck && npx vitest run --project web`
Expected: clean and green.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/web/src/clock.ts apps/web/test/clock.test.ts apps/web/src/worker/engine.worker.ts apps/web/src/host/protocol.ts apps/web/src/state/store.tsx apps/web/test/fakeHost.ts
git add apps/web/src/clock.ts apps/web/test/clock.test.ts apps/web/src/worker/engine.worker.ts apps/web/src/host/protocol.ts apps/web/src/state/store.tsx apps/web/test/fakeHost.ts
git commit -m "Web: the GBL schedule rides the boot data; appNow for the screenshot run"
```

---

### Task 10: A second line on league list rows

**Files:**
- Modify: `packages/ui/src/components/Select.tsx:4-8` (`ChoiceOption`)
- Modify: `packages/ui/src/components/League.tsx` (`LeagueList`)
- Modify: `packages/ui/src/base.css` (league row rules; find them with `grep -n "ui-league-row" packages/ui/src/base.css`)
- Test: `packages/ui/test/league.test.tsx` if it exists, else create it (check `ls packages/ui/test`)

**Interfaces:**
- Produces: `ChoiceOption.detail?: readonly string[]`, rendered by `LeagueList` as one muted line each under the title. The row's accessible name stays the title; the detail lines are its description (`aria-describedby`).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueList } from '../src/components/League.tsx';

describe('LeagueList detail lines', () => {
  it('shows each detail line under the title and keeps the title as the name', () => {
    render(
      <LeagueList
        label="Leagues"
        value="great"
        onChange={() => undefined}
        options={[
          { value: 'great', label: 'Great League' },
          { value: 'little', label: 'Little Cup', detail: ['Starts Tue 10/13', 'PvPoke last updated March 2024'] },
        ]}
      />,
    );
    const row = screen.getByRole('radio', { name: 'Little Cup' });
    expect(row).toHaveAccessibleDescription('Starts Tue 10/13 PvPoke last updated March 2024');
    expect(screen.getByText('PvPoke last updated March 2024')).toHaveClass('ui-league-row-detail');
    expect(screen.getByRole('radio', { name: 'Great League' })).not.toHaveAttribute('aria-describedby');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project ui packages/ui/test/league.test.tsx` (use the ui project name from the root vitest config; `grep -n "name:" vitest.config.* */*/vitest.config.ts`)
Expected: FAIL, `detail` is not a known prop / no description.

- [ ] **Step 3: Implement**

`Select.tsx`:

```ts
export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Extra lines under the label where a list shows them (LeagueList); a select ignores them. */
  detail?: readonly string[];
}
```

`League.tsx` `LeagueList`, replacing the row's inner label span:

```tsx
      {options.map((o) => {
        const detailId = o.detail && o.detail.length > 0 ? `league-detail-${o.value}` : undefined;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-describedby={detailId}
            disabled={o.disabled ?? false}
            className={`ui-league-row${o.value === value ? ' on' : ''}`}
            onClick={() => onChange(o.value)}
          >
            <LeagueShield id={o.value} />
            <span className="ui-league-row-text">
              <span className="ui-league-row-label">{o.label}</span>
              {detailId ? (
                <span id={detailId}>
                  {o.detail!.map((d) => (
                    <span key={d} className="ui-league-row-detail">
                      {d}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
```

`base.css`, next to the existing `.ui-league-row-label` rule:

```css
.ui-league-row-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}
.ui-league-row-detail {
  display: block;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.3;
}
```

Use the muted color token the file already uses for secondary text (`grep -n "muted\|--ink-2\|--text-2" packages/ui/src/base.css | head`); the token names above are placeholders only if that grep finds the real one, so substitute it. Run `npm run check-tokens` after.

- [ ] **Step 4: Run it, the ui suite and the token check**

Run: `npx vitest run --project ui && npm run check-tokens`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/ui/src/components/Select.tsx packages/ui/src/components/League.tsx packages/ui/src/base.css packages/ui/test/league.test.tsx
git add packages/ui/src/components/Select.tsx packages/ui/src/components/League.tsx packages/ui/src/base.css packages/ui/test/league.test.tsx
git commit -m "UI: league list rows take detail lines under the title"
```

---

### Task 11: The Leagues sheet shows live and upcoming cups

**Files:**
- Modify: `apps/web/src/format.ts` (add `leagueDetail`)
- Create: `apps/web/src/leagues.ts` (`sheetLeagues`)
- Modify: `apps/web/src/components/LeagueSwitcher.tsx`
- Test: `apps/web/test/format.test.ts`, `apps/web/test/leagueSwitcher.test.tsx`

**Interfaces:**
- Consumes: `leagueStatus`, `LeagueStatus`, `ScheduleEntry` (engine), `ChoiceOption.detail` (Task 10), `appNow` (Task 9).
- Produces:
  - `leagueDetail(status: LeagueStatus, league: Pick<League, 'kind' | 'stale' | 'rankingsUpdated'>): string[]`
  - `sheetLeagues(leagues: readonly League[], schedule: readonly ScheduleEntry[], current: string, now: Date): { open: League[]; more: { league: League; detail: string[] }[] }`

- [ ] **Step 1: Write the failing format test**

Append to `apps/web/test/format.test.ts`:

```ts
import { leagueDetail } from '../src/format.ts';

describe('leagueDetail', () => {
  const rotation = { kind: 'rotation' as const };
  // 20:00 UTC is the same calendar day from UTC-12 to UTC+3, which covers CI (UTC) and the
  // developer's machine; the weekday and date below hold in all of them.
  it('says when a live cup ends', () => {
    expect(leagueDetail({ state: 'live', end: '2026-09-29T20:00:00.000Z' }, rotation)).toEqual(['Live, ends Tue 9/29']);
  });

  it('says when an upcoming cup starts', () => {
    expect(leagueDetail({ state: 'upcoming', start: '2026-10-13T20:00:00.000Z' }, rotation)).toEqual(['Starts Tue 10/13']);
  });

  it('adds the PvPoke date for stale rankings', () => {
    expect(
      leagueDetail({ state: 'upcoming', start: '2026-10-13T20:00:00.000Z' }, { ...rotation, stale: true, rankingsUpdated: '2024-03-04' }),
    ).toEqual(['Starts Tue 10/13', 'PvPoke last updated March 2024']);
  });

  it('says nothing for an open league', () => {
    expect(leagueDetail({ state: 'off' }, { kind: 'standard' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project web apps/web/test/format.test.ts -t leagueDetail`
Expected: FAIL, `leagueDetail` is not exported.

- [ ] **Step 3: Implement `leagueDetail`**

Append to `apps/web/src/format.ts` (import `type League`, `type LeagueStatus` from `@pickthree/engine`):

```ts
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Tue 9/29" in the phone's own time zone. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** The Leagues sheet's lines under a cup: when it runs, and whether PvPoke's data is old. */
export function leagueDetail(
  status: LeagueStatus,
  league: Pick<League, 'kind' | 'stale' | 'rankingsUpdated'>,
): string[] {
  if (league.kind !== 'rotation') {
    return [];
  }
  const out: string[] = [];
  if (status.state === 'live') {
    out.push(`Live, ends ${dayLabel(status.end)}`);
  } else if (status.state === 'upcoming') {
    out.push(`Starts ${dayLabel(status.start)}`);
  }
  if (league.stale && league.rankingsUpdated) {
    const [y, m] = league.rankingsUpdated.split('-');
    out.push(`PvPoke last updated ${MONTHS[Number(m) - 1]} ${y}`);
  }
  return out;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run --project web apps/web/test/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing sheet test**

Append to `apps/web/test/leagueSwitcher.test.tsx`:

```tsx
import { sheetLeagues } from '../src/leagues.ts';
import type { ScheduleEntry } from '@pickthree/engine';

const RETRO: League = { ...TOURNAMENT, id: 'retro', title: 'Retro Cup', short: 'Retro', cup: 'retro', kind: 'rotation' };
const LITTLE: League = { ...TOURNAMENT, id: 'little', title: 'Little Cup', short: 'Little', cup: 'little', cp: 500, kind: 'rotation', stale: true, rankingsUpdated: '2024-03-04' };
const LAIC: League = { ...TOURNAMENT, id: 'laic2027', title: '2026 GO LAIC Cup', short: '2026 GO LAIC', cup: 'laic2027', kind: 'rotation' };
const entry = (l: League, start: string, end: string): ScheduleEntry => ({ league: l.id, cup: l.cup, cp: l.cp, title: l.title, start, end, season: 'Twilight Trails' });
const SCHEDULE: ScheduleEntry[] = [
  entry(RETRO, '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z'),
  entry(LITTLE, '2026-09-26T20:00:00.000Z', '2026-10-03T20:00:00.000Z'),
  entry(LAIC, '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z'),
];
const ALL = [GREAT, ULTRA, MASTER, TOURNAMENT, REMIX, RETRO, LITTLE, LAIC];

describe('sheetLeagues', () => {
  const now = new Date('2026-09-24T00:00:00.000Z');

  it('lists open leagues, then Tournament, then live cups, then upcoming, and hides the rest', () => {
    const { open, more } = sheetLeagues(ALL, SCHEDULE, 'great', now);
    expect(open.map((l) => l.id)).toEqual(['great', 'ultra', 'master']);
    expect(more.map((m) => m.league.id)).toEqual(['great', 'ultra', 'master', 'championshipseries', 'retro', 'little']);
    expect(more.find((m) => m.league.id === 'retro')?.detail).toEqual(['Live, ends Tue 9/29']);
    expect(more.find((m) => m.league.id === 'little')?.detail).toEqual(['Starts Sat 9/26', 'PvPoke last updated March 2024']);
  });

  it('keeps the selected cup listed even when it is off, so the sheet never hides where you are', () => {
    const { more } = sheetLeagues(ALL, SCHEDULE, 'laic2027', now);
    expect(more.map((m) => m.league.id)).toContain('laic2027');
  });

  it('never lists special formats', () => {
    const { more } = sheetLeagues(ALL, SCHEDULE, 'great', now);
    expect(more.map((m) => m.league.id)).not.toContain('remix');
  });
});
```

(The `ULTRA`, `MASTER`, `TOURNAMENT`, `REMIX` constants already exist at the top of the file. The live `Little Cup` in this synthetic schedule starts 9/26 so it is upcoming at 9/24; adjust nothing.)

- [ ] **Step 6: Run it and see it fail**

Run: `npx vitest run --project web apps/web/test/leagueSwitcher.test.tsx -t sheetLeagues`
Expected: FAIL, cannot resolve `../src/leagues.ts`.

- [ ] **Step 7: Implement `sheetLeagues` and use it**

Create `apps/web/src/leagues.ts`:

```ts
import { leagueStatus, type League, type ScheduleEntry } from '@pickthree/engine';
import { leagueDetail } from './format.ts';

/**
 * What the league row and the Leagues sheet show. The row holds the open leagues. The sheet
 * lists every league: the open leagues, the shipped cups (Tournament), then GO Battle League
 * cups that are live (soonest to end first) and upcoming (soonest to start first). A rotation
 * cup that is neither is left out unless it is the one selected. Special formats never show.
 */
export function sheetLeagues(
  leagues: readonly League[],
  schedule: readonly ScheduleEntry[],
  current: string,
  now: Date,
): { open: League[]; more: { league: League; detail: string[] }[] } {
  const shown = leagues.filter((l) => l.kind !== 'special');
  const open = shown.filter((l) => l.kind === 'standard');
  const fixed = shown.filter((l) => l.kind === 'standard' || l.kind === 'cup');
  const rotation = shown
    .filter((l) => l.kind === 'rotation')
    .map((l) => ({ league: l, status: leagueStatus(schedule, l.id, now) }))
    .filter((r) => r.status.state !== 'off' || r.league.id === current);
  const time = (r: (typeof rotation)[number]): number =>
    r.status.state === 'live' ? Date.parse(r.status.end) : r.status.state === 'upcoming' ? Date.parse(r.status.start) : Infinity;
  const rank = (r: (typeof rotation)[number]): number =>
    r.status.state === 'live' ? 0 : r.status.state === 'upcoming' ? 1 : 2;
  rotation.sort((a, b) => rank(a) - rank(b) || time(a) - time(b));
  return {
    open,
    more: [
      ...fixed.map((l) => ({ league: l, detail: [] })),
      ...rotation.map((r) => ({ league: r.league, detail: leagueDetail(r.status, r.league) })),
    ],
  };
}
```

In `apps/web/src/components/LeagueSwitcher.tsx`:
- Import `sheetLeagues` from `../leagues.ts` and `appNow` from `../clock.ts`.
- Replace the three lines computing `leagues`, `openLeagues`, `cups` with:

```ts
  const current = s.settings.league ?? 'great';
  const { open: openLeagues, more: listed } = sheetLeagues(
    s.data?.leagues ?? [],
    s.data?.schedule ?? [],
    current,
    appNow(),
  );
  const cups = listed.filter((m) => m.league.kind !== 'standard');
  const currentLeague = listed.find((m) => m.league.id === current)?.league;
```

- In `more`, test `currentLeague?.kind === 'cup' || currentLeague?.kind === 'rotation'` instead of `=== 'cup'`.
- In the sheet's `LeagueList`, pass `options={listed.map((m) => ({ value: m.league.id, label: m.league.title, detail: m.detail }))}`.
- Update the component's doc comment: rotation cups join the overflow, ordered live then upcoming.

- [ ] **Step 8: Run the web suite**

Run: `npx vitest run --project web apps/web/test/leagueSwitcher.test.tsx apps/web/test/format.test.ts`
Expected: PASS, the existing switcher tests included (they pass no schedule, so no rotation league shows).

- [ ] **Step 9: Commit**

```bash
npx prettier --write apps/web/src/format.ts apps/web/src/leagues.ts apps/web/src/components/LeagueSwitcher.tsx apps/web/test/format.test.ts apps/web/test/leagueSwitcher.test.tsx
git add apps/web/src/format.ts apps/web/src/leagues.ts apps/web/src/components/LeagueSwitcher.tsx apps/web/test/format.test.ts apps/web/test/leagueSwitcher.test.tsx
git commit -m "Web: the Leagues sheet lists live and upcoming GBL cups with when they run"
```

---

### Task 12: A notice with an action

**Files:**
- Modify: `apps/web/src/state/store.tsx` (`notice` state, the `notice` action, `notify`)
- Modify: `apps/web/src/components/NoticeToast.tsx`
- Test: `apps/web/test/noticeToast.test.tsx`

**Interfaces:**
- Produces: `notify(message: string | null, tone?: NoticeTone, action?: NoticeAction): void` where `interface NoticeAction { label: string; run: () => void }`; `AppState.noticeAction: NoticeAction | null`. An info notice with an action shows the message, the action button and a Dismiss button, and stays up `WARN_MS`.

- [ ] **Step 1: Write the failing test**

Read the top of `apps/web/test/noticeToast.test.tsx` for how it mounts the provider and calls `notify`, then append a test in that style:

```tsx
  it('shows an action button on an info notice, runs it, and clears the notice', async () => {
    const run = vi.fn();
    await mountToast(); // the file's existing mount helper; use its real name
    await act(async () => {
      latest!.actions.notify('Retro Cup is live this week.', 'info', { label: 'Switch', run });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Retro Cup is live this week.');
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lets an action notice be dismissed without running the action', async () => {
    const run = vi.fn();
    await mountToast();
    await act(async () => {
      latest!.actions.notify('Retro Cup is live this week.', 'info', { label: 'Switch', run });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project web apps/web/test/noticeToast.test.tsx`
Expected: FAIL, no `Switch` button.

- [ ] **Step 3: Implement**

`store.tsx`:
- Export `interface NoticeAction { label: string; run: () => void }`.
- `AppState`: add `noticeAction: NoticeAction | null;` after `noticeTone`; initial state `noticeAction: null`.
- The `notice` action type: `{ type: 'notice'; message: string | null; tone: NoticeTone; action?: NoticeAction }`; reducer: `return { ...s, notice: a.message, noticeTone: a.tone, noticeAction: a.action ?? null };`
- `notify` in the `Actions` interface and its implementation (line ~1616): add the optional third parameter and pass it into the dispatch.

`NoticeToast.tsx`:
- Read `const action = s.noticeAction;`.
- Timeout: `info && !action ? INFO_MS : WARN_MS`.
- In the info branch, when `action` is set, render instead of the single tap button:

```tsx
      <div className="update-toast notice-toast notice-info notice-foot" role="status" style={{ bottom }}>
        <span>{message}</span>
        <button
          type="button"
          onClick={() => {
            action.run();
            notify(null);
          }}
        >
          {action.label}
        </button>
        <button type="button" onClick={() => notify(null)} aria-label="Dismiss">
          Not now
        </button>
      </div>
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run --project web apps/web/test/noticeToast.test.tsx`
Expected: PASS, earlier tests included.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/web/src/state/store.tsx apps/web/src/components/NoticeToast.tsx apps/web/test/noticeToast.test.tsx
git add apps/web/src/state/store.tsx apps/web/src/components/NoticeToast.tsx apps/web/test/noticeToast.test.tsx
git commit -m "Web: an info notice can carry one action"
```

---

### Task 13: The nudge and the ended-cup fallback

**Files:**
- Create: `apps/web/src/rotation.ts`
- Modify: `apps/web/src/storage/db.ts` (`Settings.nudged`)
- Modify: `apps/web/src/state/store.tsx` (one effect after boot)
- Test: `apps/web/test/rotation.test.ts`, `apps/web/test/store.test.tsx`

**Interfaces:**
- Consumes: `leagueStatus`, `currentRun` (engine), `notify` with action (Task 12), `setLeague`, `updateSettings`, `appNow`.
- Produces: `rotationNotice(input: { leagues: readonly League[]; schedule: readonly ScheduleEntry[]; league: string; nudged: readonly string[]; now: Date }): RotationNotice | null` where `type RotationNotice = { kind: 'ended'; message: string } | { kind: 'nudge'; league: League; key: string; message: string }`; `Settings.nudged?: string[]` (keys `<league>@<run start>`, newest last, at most 20).

- [ ] **Step 1: Write the failing decision tests**

Create `apps/web/test/rotation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { League, ScheduleEntry } from '@pickthree/engine';
import { rotationNotice } from '../src/rotation.ts';
import { GREAT } from './fakeHost.ts';

const cup = (id: string, title: string): League => ({ ...GREAT, id, title, short: title, cup: id, kind: 'rotation' });
const RETRO = cup('retro', 'Retro Cup');
const LAIC = cup('laic2027', '2026 GO LAIC Cup');
const wk = (l: League, start: string, end: string): ScheduleEntry => ({ league: l.id, cup: l.cup, cp: 1500, title: l.title, start, end, season: 'Twilight Trails' });
const SCHEDULE = [
  wk(RETRO, '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z'),
  wk(LAIC, '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z'),
  wk(LAIC, '2026-11-17T21:00:00.000Z', '2026-11-24T21:00:00.000Z'),
];
const base = { leagues: [GREAT, RETRO, LAIC], schedule: SCHEDULE, league: 'great', nudged: [] as string[] };

describe('rotationNotice', () => {
  it('nudges toward a live cup the player is not on', () => {
    expect(rotationNotice({ ...base, now: new Date('2026-09-23T00:00:00Z') })).toEqual({
      kind: 'nudge',
      league: RETRO,
      key: 'retro@2026-09-22T20:00:00.000Z',
      message: 'Retro Cup is live this week.',
    });
  });

  it('does not nudge twice in one run, even across its second week', () => {
    const nudged = ['laic2027@2026-11-10T21:00:00.000Z'];
    expect(rotationNotice({ ...base, nudged, now: new Date('2026-11-19T00:00:00Z') })).toBeNull();
  });

  it('does not nudge a player already on the cup', () => {
    expect(rotationNotice({ ...base, league: 'retro', now: new Date('2026-09-23T00:00:00Z') })).toBeNull();
  });

  it('sends a player on an ended cup back to Great League', () => {
    expect(rotationNotice({ ...base, league: 'retro', now: new Date('2026-10-01T00:00:00Z') })).toEqual({
      kind: 'ended',
      message: 'Retro Cup ended. Back to Great League.',
    });
  });

  it('leaves a player building ahead on an upcoming cup alone', () => {
    expect(rotationNotice({ ...base, league: 'laic2027', now: new Date('2026-11-05T00:00:00Z') })).toBeNull();
  });

  it('sends a player on a league the build no longer ships back to Great League', () => {
    expect(rotationNotice({ ...base, league: 'fantasy', now: new Date('2026-10-01T00:00:00Z') })).toEqual({
      kind: 'ended',
      message: 'That cup has ended. Back to Great League.',
    });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project web apps/web/test/rotation.test.ts`
Expected: FAIL, cannot resolve `../src/rotation.ts`.

- [ ] **Step 3: Implement the decision**

Create `apps/web/src/rotation.ts`:

```ts
import { currentRun, leagueStatus, type League, type ScheduleEntry } from '@pickthree/engine';

export type RotationNotice =
  | { kind: 'ended'; message: string }
  | { kind: 'nudge'; league: League; key: string; message: string };

/** Nudge keys kept in settings, newest last. */
export const NUDGED_KEEP = 20;

/**
 * What to say about GO Battle League cups when the app opens. A player on a cup that is off (or
 * on a league this build no longer ships) goes back to Great League. Otherwise, the first live
 * cup the player is not on and has not been nudged about this run gets one nudge. A cup that is
 * upcoming is never ended: building ahead is the point of showing it.
 */
export function rotationNotice(input: {
  leagues: readonly League[];
  schedule: readonly ScheduleEntry[];
  league: string;
  nudged: readonly string[];
  now: Date;
}): RotationNotice | null {
  const mine = input.leagues.find((l) => l.id === input.league);
  if (!mine && input.league !== 'great' && input.leagues.length > 0) {
    return { kind: 'ended', message: 'That cup has ended. Back to Great League.' };
  }
  if (mine?.kind === 'rotation' && leagueStatus(input.schedule, mine.id, input.now).state === 'off') {
    return { kind: 'ended', message: `${mine.title} ended. Back to Great League.` };
  }
  const live = input.leagues
    .filter((l) => l.kind === 'rotation' && l.id !== input.league)
    .map((l) => ({ l, run: currentRun(input.schedule, l.id, input.now) }))
    .filter((x) => x.run !== null && leagueStatus(input.schedule, x.l.id, input.now).state === 'live')
    .sort((a, b) => Date.parse(a.run!.start) - Date.parse(b.run!.start));
  for (const { l, run } of live) {
    const key = `${l.id}@${run!.start}`;
    if (!input.nudged.includes(key)) {
      return { kind: 'nudge', league: l, key, message: `${l.title} is live this week.` };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run --project web apps/web/test/rotation.test.ts`
Expected: PASS.

- [ ] **Step 5: Settings field**

In `apps/web/src/storage/db.ts` `Settings`, after `league?: string;`:

```ts
  /** Added 2026-09-29. GO Battle League cup runs already nudged, as `<league>@<run start>`,
   *  newest last, at most 20. Absent in older saves means none. */
  nudged?: string[];
```

- [ ] **Step 6: Write the failing store test**

Append to `apps/web/test/store.test.tsx`, using that file's existing mount helper and `latest` probe (read its top first):

```tsx
  it('on open, nudges once toward a live cup and remembers it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
    try {
      const RETRO_L: League = { ...GREAT, id: 'retro', title: 'Retro Cup', short: 'Retro', cup: 'retro', kind: 'rotation' };
      const host = fakeHost({
        ready: async () => ({
          ...(await fakeHost().ready()),
          leagues: [GREAT, RETRO_L],
          schedule: [{ league: 'retro', cup: 'retro', cp: 1500, title: 'Retro Cup', start: '2026-09-22T20:00:00.000Z', end: '2026-09-29T20:00:00.000Z', season: 'Twilight Trails' }],
        }),
      });
      await mountWith(host); // the file's mount helper; use its real name
      await waitFor(() => expect(latest?.notice).toBe('Retro Cup is live this week.'));
      expect(latest?.noticeAction?.label).toBe('Switch');
      await waitFor(() => expect(latest?.settings.nudged).toEqual(['retro@2026-09-22T20:00:00.000Z']));
      await act(async () => {
        latest!.noticeAction!.run();
      });
      expect(latest?.settings.league).toBe('retro');
    } finally {
      vi.useRealTimers();
    }
  });

  it('on open, sends a player on an ended cup back to Great League with a notice', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    try {
      await seedSettings({ league: 'retro' }); // write settings the way the file's other tests do
      // ...same host as above...
      await waitFor(() => expect(latest?.settings.league).toBe('great'));
      expect(latest?.notice).toBe('Retro Cup ended. Back to Great League.');
    } finally {
      vi.useRealTimers();
    }
  });
```

Replace `mountWith` and `seedSettings` with the helpers `store.test.tsx` already uses (grep its top for how it renders `AppProvider` and how other tests pre-set `settings`). Faking only `Date` keeps promise and timer behavior real.

- [ ] **Step 7: Run it and see it fail**

Run: `npx vitest run --project web apps/web/test/store.test.tsx -t "on open"`
Expected: FAIL, no notice.

- [ ] **Step 8: Wire the effect**

In `store.tsx`, next to the other boot-time effects (after `loadVerdicts` and the legacy-exclusions effect), add:

```ts
  // GO Battle League cups, once per app open once boot data and settings are in: an ended cup
  // goes back to Great League; otherwise one nudge per live cup run.
  const rotationChecked = useRef(false);
  useEffect(() => {
    if (rotationChecked.current || state.boot !== 'ready' || !state.settingsLoaded || !state.data) {
      return;
    }
    rotationChecked.current = true;
    const n = rotationNotice({
      leagues: state.data.leagues,
      schedule: state.data.schedule,
      league: state.settings.league ?? 'great',
      nudged: state.settings.nudged ?? [],
      now: appNow(),
    });
    if (!n) {
      return;
    }
    if (n.kind === 'ended') {
      updateSettings((cur) => ({ ...cur, league: 'great' }));
      notify(n.message, 'info');
      return;
    }
    updateSettings((cur) => ({ ...cur, nudged: [...(cur.nudged ?? []), n.key].slice(-NUDGED_KEEP) }));
    notify(n.message, 'info', { label: 'Switch', run: () => setLeague(n.league.id) });
  }, [state.boot, state.settingsLoaded, state.data, state.settings.league, state.settings.nudged, updateSettings, notify, setLeague]);
```

Import `rotationNotice`, `NUDGED_KEEP` from `../rotation.ts` and `appNow` from `../clock.ts`. If `notify` or `setLeague` are declared below this point in the provider, place the effect after them (hooks order is fixed; declaration order only matters for the closure).

- [ ] **Step 9: Run the web suite**

Run: `npx vitest run --project web`
Expected: PASS. Watch the counters and specimen suites: a fake host with no schedule must produce no notice.

- [ ] **Step 10: Commit**

```bash
npx prettier --write apps/web/src/rotation.ts apps/web/src/storage/db.ts apps/web/src/state/store.tsx apps/web/test/rotation.test.ts apps/web/test/store.test.tsx
git add apps/web/src/rotation.ts apps/web/src/storage/db.ts apps/web/src/state/store.tsx apps/web/test/rotation.test.ts apps/web/test/store.test.tsx
git commit -m "Web: one nudge per live cup run; an ended cup falls back to Great League"
```

---

### Task 14: A cup's Your meta window is its run

**Files:**
- Create: `apps/web/src/state/seasonsFor.ts`
- Modify: `apps/web/src/state/store.tsx` (`requestFor`, `boardWindow`, the `logBattles` call near line 1089)
- Modify: `apps/web/src/components.tsx:520-532` (`useLogCount`)
- Modify: `apps/web/src/screens/YourMeta.tsx` (seasons, copy)
- Modify: `apps/web/src/communityMeta.ts:47-55` (`communityLeague`)
- Modify: `packages/engine/src/yourmeta/profile.ts` (`facingLine`), `packages/engine/src/recommend.ts:164`, `packages/engine/src/counters/counters.ts:332`
- Test: `apps/web/test/seasonsFor.test.ts`, `apps/web/test/communityMeta.test.ts`, `packages/engine/test/yourmeta/profile.test.ts`

**Interfaces:**
- Consumes: `runSeasons` (engine), `DataInfo.schedule`.
- Produces: `seasonsFor(data: Pick<DataInfo, 'leagues' | 'seasons' | 'schedule'> | null | undefined, leagueId: string): Season[]`; `communityLeague` returns `league.id` for a rotation league; `facingLine(p, mode?, period: 'season' | 'run' = 'season')`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/seasonsFor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { League } from '@pickthree/engine';
import { seasonsFor } from '../src/state/seasonsFor.ts';
import { GREAT } from './fakeHost.ts';

const RETRO: League = { ...GREAT, id: 'retro', title: 'Retro Cup', short: 'Retro', cup: 'retro', kind: 'rotation' };
const SEASONS = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];
const data = {
  leagues: [GREAT, RETRO],
  seasons: SEASONS,
  schedule: [{ league: 'retro', cup: 'retro', cp: 1500, title: 'Retro Cup', start: '2026-09-22T20:00:00.000Z', end: '2026-09-29T20:00:00.000Z', season: 'Twilight Trails' }],
};

describe('seasonsFor', () => {
  it('gives an open league the GBL seasons', () => {
    expect(seasonsFor(data, 'great')).toBe(SEASONS);
  });

  it("gives a cup its runs, so the window starts at the run's start", () => {
    expect(seasonsFor(data, 'retro')).toEqual([{ id: -1, name: 'Retro Cup, Sep 22', start: '2026-09-22T20:00:00.000Z' }]);
  });

  it('is empty before data loads', () => {
    expect(seasonsFor(null, 'retro')).toEqual([]);
  });
});
```

Append to `apps/web/test/communityMeta.test.ts`:

```ts
  it('reads a rotation cup under its own id', () => {
    expect(communityLeague({ id: 'retro', kind: 'rotation', meta: 'retro' })).toBe('retro');
  });
```

Append to `packages/engine/test/yourmeta/profile.test.ts`, reusing a profile fixture from that file that reaches the `Weighted by your log` branch (grep for `Weighted by your log` in the file):

```ts
  it('says this run for a cup', () => {
    expect(facingLine(WEIGHTED_PROFILE, 'teams', 'run')).toContain('battles this run');
    expect(facingLine(WEIGHTED_PROFILE, 'teams')).toContain('battles this season');
  });
```

(Use the file's real fixture name in place of `WEIGHTED_PROFILE` and the real default mode string in place of `'teams'`; check `facingLine`'s signature at `profile.ts:214`.)

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project web apps/web/test/seasonsFor.test.ts apps/web/test/communityMeta.test.ts && npx vitest run --project engine packages/engine/test/yourmeta/profile.test.ts`
Expected: FAIL on the missing module, the `null` from `communityLeague`, and the unchanged copy.

- [ ] **Step 3: Implement**

Create `apps/web/src/state/seasonsFor.ts`:

```ts
import { runSeasons, type Season } from '@pickthree/engine';
import type { DataInfo } from './store.tsx';

/**
 * The seasons a league's Your meta window and community window are cut by. An open league uses
 * the GO Battle League seasons; a GBL cup uses its runs, so "this season" is this run and earlier
 * runs are the earlier buckets. Season stamps on shared battles keep the real seasons (metaShare).
 */
export function seasonsFor(
  data: Pick<DataInfo, 'leagues' | 'seasons' | 'schedule'> | null | undefined,
  leagueId: string,
): Season[] {
  if (!data) {
    return [];
  }
  const league = data.leagues.find((l) => l.id === leagueId);
  if (league?.kind !== 'rotation') {
    return data.seasons;
  }
  return runSeasons(data.schedule, leagueId, league.title);
}
```

If importing `DataInfo` from `store.tsx` creates an import cycle the linter flags, move `DataInfo` into `apps/web/src/state/types.ts` and re-export it from `store.tsx`.

`communityMeta.ts` `communityLeague`: add before `return null;`:

```ts
  if (league.kind === 'rotation') {
    return league.id;
  }
```

`profile.ts` `facingLine`: add a last parameter `period: 'season' | 'run' = 'season'` and change the head to ``const head = `Weighted by your log: ${p.battles} battles this ${period}`;``. In `recommend.ts:164` pass `deps.data.league.kind === 'rotation' ? 'run' : 'season'` as the third argument (pass the current mode explicitly as the second); in `counters.ts:332` pass `'counters', data.league.kind === 'rotation' ? 'run' : 'season'` (use the local name for the league there).

Call sites in the app, each swapping `s.data?.seasons ?? []` for `seasonsFor(s.data, <league id>)`:
- `store.tsx` `requestFor`: `seasonsFor(s.data, league.id)`.
- `store.tsx` `boardWindow`: `seasonsFor(s.data, league)`.
- `store.tsx` near line 1089, `logBattles(s.sets, seasonsFor(s.data, league), s.settings, league)`.
- `components.tsx` `useLogCount`: `seasonsFor(s.data, s.settings.league ?? 'great')`.
- `screens/YourMeta.tsx:363`: `const seasons = seasonsFor(s.data, leagueId);` and keep `seasonListStale(s.data?.seasons ?? [])` on the real seasons at line 375.

Leave `metaShare` and `syncShared` on `s.data?.seasons`: shared battles are stamped with the real season number.

`YourMeta.tsx` copy, with `const run = s.leagueInfo && s.data?.leagues.find((l) => l.id === leagueId)?.kind === 'rotation';` near the top of the component:
- line 82: `` `${logCount} battles this ${run ? 'run' : 'season'}` ``
- line 474: `<b>{run ? 'Earlier runs' : 'Earlier seasons'}</b>`
- line 417's fresh-start line: `run ? 'Battles before now move to Earlier runs. Nothing is deleted.' : '<existing text>'`

- [ ] **Step 4: Run the tests and the suites**

Run: `npx vitest run --project web && npx vitest run --project engine`
Expected: PASS. A test pinning the old `this season` line for a standard league must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/web/src/state/seasonsFor.ts apps/web/src/state/store.tsx apps/web/src/components.tsx apps/web/src/screens/YourMeta.tsx apps/web/src/communityMeta.ts packages/engine/src/yourmeta/profile.ts packages/engine/src/recommend.ts packages/engine/src/counters/counters.ts apps/web/test/seasonsFor.test.ts apps/web/test/communityMeta.test.ts packages/engine/test/yourmeta/profile.test.ts
git add apps/web/src/state/seasonsFor.ts apps/web/src/state/store.tsx apps/web/src/components.tsx apps/web/src/screens/YourMeta.tsx apps/web/src/communityMeta.ts packages/engine/src/yourmeta/profile.ts packages/engine/src/recommend.ts packages/engine/src/counters/counters.ts apps/web/test/seasonsFor.test.ts apps/web/test/communityMeta.test.ts packages/engine/test/yourmeta/profile.test.ts
git commit -m "Web: a GBL cup's Your meta and community windows are its current run"
```

---

### Task 15: Captures through the enforced audit

**Files:**
- Modify: `apps/web/scripts/screens.mjs`

**Interfaces:**
- Consumes: `appNow()`'s `pick3.now` override (Task 9), the built `/data/schedule.json` and `/data/leagues.json`.

- [ ] **Step 1: Pick a moment with a live and an upcoming cup**

Near the top of `screens.mjs`, after the browser and `page` exist and before the first navigation into the app, add:

```js
// GBL cups: pin the app's clock to a moment when one built cup is live and another is upcoming,
// so the Leagues sheet captures do not depend on the day this runs.
const cupNow = await (async () => {
  const [schedule, leagues] = await Promise.all([
    fetch(`${base}/data/schedule.json`).then((r) => r.json()),
    fetch(`${base}/data/leagues.json`).then((r) => r.json()),
  ]);
  const built = new Set(leagues.filter((l) => l.kind === 'rotation').map((l) => l.id));
  const weeks = schedule.filter((e) => built.has(e.league));
  for (const live of weeks) {
    const t = Date.parse(live.start) + 86_400_000;
    const upcoming = weeks.find(
      (e) => e.league !== live.league && Date.parse(e.start) > t && Date.parse(e.start) - t <= 7 * 86_400_000,
    );
    if (upcoming) {
      return new Date(t).toISOString();
    }
  }
  throw new Error('screens: no moment in schedule.json with one built cup live and another upcoming');
})();
await page.evaluateOnNewDocument((iso) => localStorage.setItem('pick3.now', iso), cupNow);
console.log(`  cups pinned at ${cupNow}`);
```

`base` is the preview URL variable the script already uses (check its name). Node 24's global `fetch` needs no import.

If the real schedule has no such moment (this season: Little Cup 10-13 and Fantasy 10-20 are 7 days apart, but Fantasy is not built without rankings; LAIC 11-10 has nothing within 7 days before it), fall back: pick `t` one day into any built cup's week and accept a sheet with a live cup only, logging `no upcoming cup to capture`. Replace the `throw` with that fallback and make the upcoming capture in Step 2 conditional on `upcoming` being found.

- [ ] **Step 2: The captures**

After the existing league-sheet capture (search `LeagueList\|leagues sheet\|More leagues` in the script), add a block that opens the sheet with the clock pinned and captures it, then waits for and captures the nudge on a fresh load:

```js
console.log('leagues sheet, GBL cups');
await page.goto(`${base}/#/teams`, { waitUntil: 'networkidle0' });
await page.click('button[aria-label="More leagues and cups"]');
await page.waitForSelector('.ui-league-list .ui-league-row-detail');
await shot('leagues-sheet-cups', false, { mustShow: '.ui-league-list .ui-league-row-detail' });
const details = await page.$$eval('.ui-league-row-detail', (els) => els.map((e) => e.textContent));
console.log(`  detail lines: ${JSON.stringify(details)}`);
if (!details.some((d) => d.startsWith('Live, ends '))) {
  throw new Error('leagues sheet: no live cup line');
}
await page.keyboard.press('Escape');
```

The nudge shows once per run per profile, so it is captured at the script's first boot (a fresh profile), not here.

Then find where the script does its first app boot and, right after it, add:

```js
await page.waitForSelector('.notice-toast .notice-foot, .notice-toast.notice-foot', { timeout: 10_000 }).catch(() => null);
if (await page.$('.notice-toast button:not([aria-label])')) {
  await shot('cup-nudge', false, { mustShow: '.notice-toast' });
} else {
  throw new Error('cup nudge: the first boot with a live cup showed no nudge');
}
```

Adjust selectors to the real class names rendered in Task 12 (the info toast is `div.update-toast.notice-toast.notice-info.notice-foot`). The ended-cup notice is covered by the store test in Task 13; it needs a saved setting from a previous run, which this script's clean profile does not have, so it is not captured.

- [ ] **Step 3: Run the audit**

Run: `npm run web:audit`
Expected: exit 0, the new `leagues-sheet-cups` and `cup-nudge` captures in both themes, zero findings. Look at both captures by eye (`docs/screenshots` or wherever `shot` writes; the script logs the path): the detail lines sit under the cup name, muted, no wrap mid-word at 390px; the toast's Switch and Not now buttons are 44px tall.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/web/scripts/screens.mjs
git add apps/web/scripts/screens.mjs
git commit -m "Screens: capture the Leagues sheet with GBL cups and the cup nudge"
```

(Add the regenerated capture files if the script writes them into the repo; check `git status --short` and stage them by path.)

---

### Task 16: Full gate and the first daily run

- [ ] **Step 1: Everything green locally**

Run: `npm run lint && npm run typecheck && npm run check-tokens && npm run data:build && PICKTHREE_REQUIRE_PVPOKE=1 npm test`
Expected: all clean, all tests pass.

- [ ] **Step 2: Push and watch CI**

Run: `git push origin HEAD:main`, then `gh run list -L 4 --branch main` and `gh run watch <ci run id> --exit-status`.
Expected: `ci`, `pages` and `worker and meta site` green.

- [ ] **Step 3: Run the daily job by hand**

Run: `gh workflow run daily-refresh.yml --ref main`, wait, then `gh run view <id>`.
Expected: success. The Schedule step logs the cup weeks; if nothing changed it pushes nothing and deploys nothing; the Warnings step files `Little Cup starts 2026-10-13 on stale PvPoke rankings` once it is within 7 days of 10-13 (before then, no stale issue), and `Fantasy Cup starts 2026-10-20 with no PvPoke rankings at 1500` within 7 days of 10-20 if PvPoke has not published.

- [ ] **Step 4: Check the live site**

Open https://pick3.gg, open the league overflow. On a day inside a cup week, the cup shows with `Live, ends ...`; within 7 days of Little Cup it shows `Starts Tue 10/13` and `PvPoke last updated March 2024` (unless PvPoke refreshed it). The first open shows the nudge once; a reload does not show it again.
