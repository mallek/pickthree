# Cup Team Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run post -- <league>` runs pick3's engine for a GBL cup and writes three Reddit-ready PNG boards (Top Teams, Budget Builds, Best Team for Each Mega) plus a `post.md` with a pick3.gg link per team.

**Architecture:** Pure engine pieces (trio scoring split, variety selection, row re-simulation, board assembly, display naming, team links) live in `packages/engine` and are unit tested. A thin IO script in `apps/meta/scripts/post/` fetches production data and meta weights, calls the engine with the vendored PvPoke simulator, fills the Claude Design template, captures PNGs with puppeteer-core, and writes `posts/<date>-<league>/`.

**Tech Stack:** TypeScript 5.9 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest 4, tsx 4.23.13, puppeteer-core 25.10.0 (root devDependency), `@pickthree/sim-pvpoke` (vendored PvPoke).

**Spec:** `docs/superpowers/specs/2026-09-30-cup-team-boards-design.md`

## Global Constraints

- Braces on all control flow, even single-line bodies (eslint `curly: all`).
- Exact pinned versions in every package.json. No `^` or `~`.
- No em dashes anywhere: code, comments, docs, commits, UI copy. Use a plain dash.
- All player-facing copy (images, post.md) is 7-bit ASCII.
- Tests use synthetic data or invariants on live data; never pin a PvPoke value (a rating, a rank, a strength).
- Stage explicit paths when committing. Never `git add -A`.
- Engine code never imports `@pickthree/sim-pvpoke`; it takes a `BattleSimulator`.
- Variety cap: `SPECIES_CAP = 2` rows per Pokemon per image, `BOARD_ROWS = 5`.
- Every failure in the script stops the run with a message and writes nothing.
- Work in a git worktree: `git worktree add .claude/worktrees/cup-boards -b cup-boards` from `D:\Skunkworks\pickthree`, then `npm install` inside it. Nothing is pushed.

## Review Focus

- A league whose schedule has no run (standard `great`): the label must read `UPDATED <date>` and the run must not crash on an empty `runsOf`. Test in Task 7.
- A Mega Edition league (`mega-great`) without `--prior`: the worker rejects the hyphenated id with a 400; the run must stop with a message that names `--prior`, not a stack trace. Test in Task 7 (`fetchSummary` error text).
- A member carrying three tags (Shadow + Galarian + Elite TM): the fill must still emit all of them in the order mega, region, form, shadow, elite; the manual render in Task 10 checks the row does not overflow. Test in Task 8.
- A text value containing `<`, `&` or `"` (a move or form name): the fill must escape it, not break the markup. Test in Task 8.
- A Mega board with fewer than five qualifying Megas: the fill must emit fewer rows and the capture must still succeed. Test in Task 8 (fill with two rows); checked by eye in Task 10.

---

## File Structure

- `packages/engine/src/share/teamLink.ts` (new, moved from `apps/web/src/teamLink.ts`): team link build and parse; league pattern allows `-`.
- `apps/web/src/teamLink.ts` (modify): becomes a re-export of the engine module.
- `packages/engine/src/coldstart/teams.ts` (modify): `scoreTrios` and `presentTeam` split out of `generateColdStartTeams`.
- `packages/engine/src/sim/matrixSim.ts` (modify): `sameMoveset`, `movesetDrift`, `withReplacedRows`.
- `packages/engine/src/coldstart/boards.ts` (new): `selectVaried`, `selectMegaRows`, `cupBoards`.
- `packages/engine/src/coldstart/boardDisplay.ts` (new): `memberDisplay`, `cautionNames`.
- `packages/engine/src/index.ts` (modify): export the new modules.
- `apps/meta/scripts/post/data.ts` (new): production data fetch.
- `apps/meta/scripts/post/weights.ts` (new): meta summary fetch, blend, source line, run label, day format.
- `apps/meta/scripts/post/fill.ts` (new): template fill and ASCII guard.
- `apps/meta/scripts/post/template.html` (new): the Claude Design export with the mascot SVGs replaced by `<img>` slots.
- `apps/meta/scripts/post/assets/mascot-{pointing,thinking,fingerguns}.png` (new): the figure cutouts.
- `apps/meta/scripts/post/markdown.ts` (new): `post.md` and `teams.json`.
- `apps/meta/scripts/post/post.ts` (new): CLI orchestration and capture.
- `apps/meta/package.json`, `package.json` (modify): `post` scripts, `@pickthree/sim-pvpoke` devDependency.
- `.gitignore`: unchanged (`posts/` is committed by design).

---

### Task 1: Team links move to the engine, league ids may contain a hyphen

**Files:**
- Create: `packages/engine/src/share/teamLink.ts`
- Modify: `apps/web/src/teamLink.ts` (whole file becomes a re-export)
- Modify: `packages/engine/src/index.ts` (add export)
- Test: `packages/engine/test/share/teamLink.test.ts`
- Existing test that must keep passing: `apps/web/test/teamLink.test.ts`

**Interfaces:**
- Produces (engine index): `SITE_ORIGIN: string`, `teamPath(league: string, picks: readonly SharedPick[]): string`, `teamLink(league: string, picks: readonly SharedPick[], origin?: string): string`, `picksFromTeam(slots)`, `parseTeamPath(league: string, members: string): ParsedTeam`, `toTeamPicks(team: SharedTeam)`, types `SharedPick { speciesId: string; moves?: { fast: string; charged: string[] } }`, `SharedTeam`, `ParsedTeam`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/test/share/teamLink.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTeamPath, teamLink, teamPath } from '../../src/share/teamLink.js';

describe('team links in the engine', () => {
  const picks = [
    { speciesId: 'venusaur_mega', moves: { fast: 'VINE_WHIP', charged: ['FRENZY_PLANT', 'SLUDGE_BOMB'] } },
    { speciesId: 'kingdra_shadow', moves: { fast: 'DRAGON_BREATH', charged: ['SURF', 'SWIFT'] } },
    { speciesId: 'magnezone', moves: { fast: 'VOLT_SWITCH', charged: ['WILD_CHARGE'] } },
  ];

  it('round-trips a league id with a hyphen', () => {
    const path = teamPath('mega-great', picks);
    expect(path.startsWith('#/t/mega-great/')).toBe(true);
    const [league, members] = path.replace('#/t/', '').split('/');
    const r = parseTeamPath(league!, members!);
    expect('team' in r && r.team).toEqual({ league: 'mega-great', picks });
  });

  it('prints the pick3.gg link for a hyphenated league', () => {
    expect(teamLink('mega-great', picks)).toBe(`https://pick3.gg/${teamPath('mega-great', picks)}`);
  });

  it('still rejects a league with spaces or capitals', () => {
    const r = parseTeamPath('Great League', 'a+b+c');
    expect('error' in r ? r.error : '').toMatch(/no league/);
  });

  it('keeps species ids strict: a hyphen in a species id is not readable', () => {
    const r = parseTeamPath('great', 'ho-oh+b+c');
    expect('error' in r ? r.error : '').toMatch(/not a Pokemon id/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/engine/test/share/teamLink.test.ts`
Expected: FAIL, cannot resolve `../../src/share/teamLink.js`.

- [ ] **Step 3: Move the module and fix the league pattern**

Run: `git mv apps/web/src/teamLink.ts packages/engine/src/share/teamLink.ts`

In `packages/engine/src/share/teamLink.ts`:
- Change the import line `import type { TeamPick } from '@pickthree/engine';` to `import type { TeamPick } from '../analyze.js';`
- Below `const SPECIES = /^[a-z0-9_]+$/;` add:

```ts
/** League ids may carry a hyphen (mega-great, mega-ultra, mega-master); species ids never do. */
const LEAGUE = /^[a-z0-9_-]+$/;
```

- In `parseTeamPath`, change `if (!SPECIES.test(league)) {` to `if (!LEAGUE.test(league)) {`.
- No change in `apps/web/src/state/store.tsx`: its `#/t/<league>/<members>` route passes any league string through to `SharedTeam` (checked while planning); `parseTeamPath` is the only gate.

Create `apps/web/src/teamLink.ts`:

```ts
/** Team links live in the engine so the cup-board script and the app build the same links. */
export {
  SITE_ORIGIN,
  parseTeamPath,
  picksFromTeam,
  teamLink,
  teamPath,
  toTeamPicks,
  type ParsedTeam,
  type SharedPick,
  type SharedTeam,
} from '@pickthree/engine';
```

In `packages/engine/src/index.ts` add after the last `export *` line:

```ts
export * from './share/teamLink.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/test/share/teamLink.test.ts apps/web/test/teamLink.test.ts`
Expected: PASS, both files.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/share/teamLink.ts apps/web/src/teamLink.ts packages/engine/src/index.ts packages/engine/test/share/teamLink.test.ts
git commit -m "Engine: team links move to the engine; a league id may carry a hyphen"
```

---

### Task 2: Split trio scoring out of the cold-start generator

**Files:**
- Modify: `packages/engine/src/coldstart/teams.ts`
- Test: `packages/engine/test/coldstart/teams.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `interface ScoredTrio { members: [Prepared, Prepared, Prepared]; order: [number, number, number]; strength: number; coverage: number; consistency: number; safety: number; key: string }`
  - `scoreTrios(pool: readonly Candidate[], view: MatrixView, types: TrioIndex, weights?: ReadonlyMap<string, number>): ScoredTrio[]` (every legal trio, strongest first, ties by `key`)
  - `presentTeam(item: ScoredTrio, view: MatrixView, trioOpts?: TrioOptions): GeneratedTeam` (default `DEFAULT_TRIO_OPTIONS`)
- `generateColdStartTeams` keeps its signature and output.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `run('generateColdStartTeams', () => { ... })` block in `packages/engine/test/coldstart/teams.test.ts`, and add `scoreTrios, presentTeam` to the import from `'../../src/coldstart/teams.js'`:

```ts
  it('scoreTrios lists every legal trio, strongest first', () => {
    const { view, pool, types } = setup(20);
    const all = scoreTrios(pool, view, types);
    expect(all.length).toBeGreaterThan(100);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1]!.strength).toBeGreaterThanOrEqual(all[i]!.strength);
    }
    for (const t of all) {
      const ids = t.members.map((m) => types.teamSpeciesOf(m.c.build.speciesId));
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('generateColdStartTeams is presentTeam over scoreTrios', () => {
    const { view, pool, types } = setup(20);
    const top = scoreTrios(pool, view, types)[0]!;
    const first = generateColdStartTeams(pool, view, types, { results: 1 })[0]!;
    expect(presentTeam(top, view)).toEqual(first);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/test/coldstart/teams.test.ts`
Expected: FAIL, `scoreTrios` is not exported. (If `apps/web/public/data` is absent the block is skipped; run `npm run data:build` first, with `PICKTHREE_SKIP_SPRITES=1`.)

- [ ] **Step 3: Implement the split**

In `packages/engine/src/coldstart/teams.ts`:
- Add `type TrioOptions` to the import from `'../search/trios.js'`.
- Replace the private `interface Scored { ... }` with the exported `ScoredTrio` (same fields).
- Replace the body of `generateColdStartTeams` with the three functions below.

```ts
/** One legal trio and its matrix strength, in the order that strength was computed for. */
export interface ScoredTrio {
  members: [Prepared, Prepared, Prepared];
  /** Indexes into members: lead, switch, closer. */
  order: [number, number, number];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  /** Sorted species ids joined with '+', the tie-break. */
  key: string;
}

/**
 * Every legal trio of the pool (one species per team, a Mega counting as its base, one Mega),
 * scored by simStrength, strongest first; the sorted species key breaks a tie so the same pool
 * always gives the same list however it was ordered.
 */
export function scoreTrios(
  pool: readonly Candidate[],
  view: MatrixView,
  types: TrioIndex,
  weights?: ReadonlyMap<string, number>,
): ScoredTrio[] {
  const ctx = strengthContext(view, weights);
  const prepared: Prepared[] = prepare([...pool], view, types);
  const n = prepared.length;
  const all: ScoredTrio[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const members: [Prepared, Prepared, Prepared] = [
          prepared[i] as Prepared,
          prepared[j] as Prepared,
          prepared[k] as Prepared,
        ];
        if (trioBreaksRules(members[0].rule, members[1].rule, members[2].rule)) {
          continue;
        }
        const ids = members.map((m) => m.c.build.speciesId);
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
  all.sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key));
  return all;
}

/**
 * A scored trio as a card: the engine's own draft evaluated for exactly the order the strength
 * was computed for, so the card's "ABB line" and exposure describe the team as it is presented.
 */
export function presentTeam(
  item: ScoredTrio,
  view: MatrixView,
  trioOpts: TrioOptions = DEFAULT_TRIO_OPTIONS,
): GeneratedTeam {
  const draft = evaluateTrio(item.members, view, trioOpts, [item.order]);
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
}

export function generateColdStartTeams(
  pool: readonly Candidate[],
  view: MatrixView,
  types: TrioIndex,
  opts: GenerateOptions,
): GeneratedTeam[] {
  const all = scoreTrios(pool, view, types, opts.weights);
  const picked: ScoredTrio[] = [];
  const speciesOf = (item: ScoredTrio): string[] => item.members.map((m) => m.c.build.speciesId);
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
  return picked.map((item) => presentTeam(item, view));
}
```

Keep the file's header comment and `EXPOSURE_SHOWN`, `GeneratedTeam`, `GenerateOptions` as they are.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/test/coldstart apps/meta/test/bake.test.ts apps/meta/test/baseline.test.ts`
Expected: PASS (the bake's output is unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/coldstart/teams.ts packages/engine/test/coldstart/teams.test.ts
git commit -m "Engine: scoreTrios and presentTeam split out of the cold-start generator"
```

---

### Task 3: Variety selection with a per-image cap

**Files:**
- Create: `packages/engine/src/coldstart/boards.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/coldstart/boards.test.ts`

**Interfaces:**
- Produces:
  - `const BOARD_ROWS = 5`, `const SPECIES_CAP = 2`
  - `interface SelectOptions { rows: number; cap: number }`
  - `selectVaried<T>(items: readonly T[], speciesOf: (t: T) => readonly string[], opts: SelectOptions): T[]`
  - `selectMegaRows<T>(items: readonly T[], speciesOf: (t: T) => readonly string[], megaOf: (t: T) => string | null, opts: SelectOptions): T[]`
- `items` must already be strongest first; both return a subsequence of `items` in its original order. `speciesOf` returns base keys (the caller folds Shadow and Mega).

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/test/coldstart/boards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selectMegaRows, selectVaried } from '../../src/coldstart/boards.js';

type T = { id: number; species: string[]; mega?: string };
const t = (id: number, species: string[], mega?: string): T =>
  mega === undefined ? { id, species } : { id, species, mega };
const sp = (x: T): string[] => x.species;
const megaOf = (x: T): string | null => x.mega ?? null;
const count = (rows: T[], key: string): number => rows.filter((r) => r.species.includes(key)).length;

describe('selectVaried', () => {
  it('caps any one Pokemon at two rows even when it is in every strong team', () => {
    const items = [
      t(1, ['kingdra', 'a', 'b']),
      t(2, ['kingdra', 'c', 'd']),
      t(3, ['kingdra', 'e', 'f']),
      t(4, ['kingdra', 'g', 'h']),
      t(5, ['i', 'j', 'k']),
      t(6, ['l', 'm', 'n']),
      t(7, ['o', 'p', 'q']),
    ];
    const rows = selectVaried(items, sp, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 5, 6, 7]);
    expect(count(rows, 'kingdra')).toBe(2);
  });

  it('never lets two rows share two Pokemon', () => {
    const items = [t(1, ['a', 'b', 'c']), t(2, ['a', 'b', 'd']), t(3, ['a', 'e', 'f'])];
    expect(selectVaried(items, sp, { rows: 5, cap: 2 }).map((r) => r.id)).toEqual([1, 3]);
  });

  it('stops at the row limit and keeps strength order', () => {
    const items = Array.from({ length: 10 }, (_, i) => t(i, [`x${i}`, `y${i}`, `z${i}`]));
    expect(selectVaried(items, sp, { rows: 5, cap: 2 }).map((r) => r.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns fewer rows when the list runs out', () => {
    const items = [t(1, ['a', 'b', 'c']), t(2, ['a', 'b', 'd'])];
    expect(selectVaried(items, sp, { rows: 5, cap: 2 })).toHaveLength(1);
  });
});

describe('selectMegaRows', () => {
  it('gives each Mega one row, its strongest team that fits the cap', () => {
    const items = [
      t(1, ['charizard', 'kingdra', 'magnezone'], 'charizard_mega_y'),
      t(2, ['venusaur', 'kingdra', 'magnezone'], 'venusaur_mega'),
      t(3, ['blastoise', 'kingdra', 'magnezone'], 'blastoise_mega'),
      t(4, ['charizard', 'a', 'b'], 'charizard_mega_y'),
      t(5, ['blastoise', 'c', 'd'], 'blastoise_mega'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 5]);
    expect(new Set(rows.map((r) => r.mega)).size).toBe(rows.length);
  });

  it('ranks Megas by their best team and returns rows in strength order', () => {
    const items = [
      t(1, ['a', 'b', 'venusaur'], 'venusaur_mega'),
      t(2, ['c', 'd', 'charizard'], 'charizard_mega_x'),
      t(3, ['e', 'f', 'charizard'], 'charizard_mega_y'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('lets Mega X and Mega Y of one base share its two rows, never a third', () => {
    const items = [
      t(1, ['charizard', 'a', 'b'], 'charizard_mega_x'),
      t(2, ['charizard', 'c', 'd'], 'charizard_mega_y'),
      t(3, ['charizard', 'e', 'f'], 'charizard_mega_z'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('ignores teams without a Mega and skips a Mega whose teams all break the cap', () => {
    const items = [
      t(1, ['k', 'a', 'venusaur'], 'venusaur_mega'),
      t(2, ['k', 'b', 'x']),
      t(3, ['k', 'c', 'blastoise'], 'blastoise_mega'),
      t(4, ['k', 'd', 'charizard'], 'charizard_mega_y'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 3]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/test/coldstart/boards.test.ts`
Expected: FAIL, cannot resolve `../../src/coldstart/boards.js`.

- [ ] **Step 3: Implement**

Create `packages/engine/src/coldstart/boards.ts`:

```ts
/**
 * The cup boards the Reddit post script renders (spec 2026-09-30-cup-team-boards-design.md):
 * Top Teams, Budget Builds and Best Team for Each Mega, five rows each, one complete team a row.
 * Selection is generic over the item so it can be tested on plain data; cupBoards (below) is the
 * glue that runs it on the engine's scored trios.
 */

/** Rows on one image. */
export const BOARD_ROWS = 5;
/** Rows any one Pokemon may appear on, per image. A Shadow and a Mega count as their base. */
export const SPECIES_CAP = 2;

export interface SelectOptions {
  rows: number;
  cap: number;
}

/** True when `next` may join `taken`: it shares at most one Pokemon with every taken row, and no
 *  Pokemon would then be on more than `cap` rows. */
function fits<T>(
  taken: readonly T[],
  next: T,
  speciesOf: (t: T) => readonly string[],
  cap: number,
): boolean {
  const mine = speciesOf(next);
  for (const row of taken) {
    const theirs = speciesOf(row);
    if (mine.filter((id) => theirs.includes(id)).length >= 2) {
      return false;
    }
  }
  for (const id of mine) {
    const uses = taken.filter((row) => speciesOf(row).includes(id)).length;
    if (uses + 1 > cap) {
      return false;
    }
  }
  return true;
}

/** Strongest first, a team joins when it fits the variety rule; stops at `rows`. */
export function selectVaried<T>(
  items: readonly T[],
  speciesOf: (t: T) => readonly string[],
  opts: SelectOptions,
): T[] {
  const taken: T[] = [];
  for (const item of items) {
    if (taken.length >= opts.rows) {
      break;
    }
    if (fits(taken, item, speciesOf, opts.cap)) {
      taken.push(item);
    }
  }
  return taken;
}

/**
 * One row per Mega. Megas are ranked by their strongest team; walking them in that order, each
 * takes its strongest team that fits the variety rule against the rows already taken, or is
 * skipped. Rows come back in the items' own (strength) order.
 */
export function selectMegaRows<T>(
  items: readonly T[],
  speciesOf: (t: T) => readonly string[],
  megaOf: (t: T) => string | null,
  opts: SelectOptions,
): T[] {
  const byMega = new Map<string, T[]>();
  for (const item of items) {
    const mega = megaOf(item);
    if (mega === null) {
      continue;
    }
    const list = byMega.get(mega);
    if (list) {
      list.push(item);
    } else {
      byMega.set(mega, [item]);
    }
  }
  const taken: T[] = [];
  for (const list of byMega.values()) {
    if (taken.length >= opts.rows) {
      break;
    }
    const pick = list.find((item) => fits(taken, item, speciesOf, opts.cap));
    if (pick !== undefined) {
      taken.push(pick);
    }
  }
  const at = new Map(items.map((item, i) => [item, i]));
  return taken.sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0));
}
```

(`Map` keeps insertion order, and insertion follows `items` strongest first, so `byMega.values()` walks Megas by their best team.)

In `packages/engine/src/index.ts` add:

```ts
export * from './coldstart/boards.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/test/coldstart/boards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/coldstart/boards.ts packages/engine/src/index.ts packages/engine/test/coldstart/boards.test.ts
git commit -m "Engine: board selection with a per-image cap of two rows per Pokemon"
```

---

### Task 4: Matrix rows that match the moves shown

**Files:**
- Modify: `packages/engine/src/sim/matrixSim.ts`
- Test: `packages/engine/test/sim/matrixSim.test.ts` (new directory)

**Interfaces:**
- Consumes: `simulateMatrix`, `MatrixFighter`, `MatrixSimDeps`, `matrixIndex` (existing).
- Produces:
  - `sameMoveset(a: readonly string[], b: readonly string[]): boolean` (same fast move, same charged moves in any order)
  - `movesetDrift(fighters: readonly MatrixFighter[], matrix: MatchupMatrix): MatrixFighter[]` (fighters in the matrix whose moveset differs from their row; first occurrence of a species wins)
  - `withReplacedRows(matrix: MatchupMatrix, rows: readonly MatrixFighter[], deps: MatrixSimDeps): MatchupMatrix` (same candidates and row indexes, those rows re-simulated with the given movesets)

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/test/sim/matrixSim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BattleSimulator } from '../../src/sim/BattleSimulator.js';
import type { League } from '../../src/gamedata/league.js';
import { matrixIndex, type MatchupMatrix } from '../../src/gamedata/types.js';
import { movesetDrift, sameMoveset, withReplacedRows } from '../../src/sim/matrixSim.js';

const league = { id: 'test', cp: 1500 } as unknown as League;

function matrix(): MatchupMatrix {
  return {
    league: 'test',
    cp: 1500,
    scenarios: [
      { shields: [0, 0], energy: [0, 0] },
      { shields: [1, 1], energy: [0, 0] },
    ],
    candidates: ['alpha', 'beta'],
    opponents: ['x', 'y'],
    candidateMovesets: { alpha: ['F1', 'C1', 'C2'], beta: ['F2', 'C3'] },
    opponentMovesets: { x: ['FX', 'CX'], y: ['FY', 'CY'] },
    ratings: [100, 200, 300, 400, 500, 600, 700, 800],
  };
}

/** Rates a battle 900 when spec A runs the fast move NEW, else 10. */
const fakeSim: BattleSimulator = {
  simulate: (a) => ({
    rating: a.fastMove === 'NEW' ? 900 : 10,
    opRating: 0,
    winner: null,
    turnsToWin: [0, 0],
  }),
};

describe('sameMoveset', () => {
  it('ignores charged move order but not the fast move', () => {
    expect(sameMoveset(['F', 'A', 'B'], ['F', 'B', 'A'])).toBe(true);
    expect(sameMoveset(['F', 'A', 'B'], ['G', 'A', 'B'])).toBe(false);
    expect(sameMoveset(['F', 'A'], ['F', 'A', 'B'])).toBe(false);
  });
});

describe('movesetDrift', () => {
  it('lists only fighters whose moves differ from their matrix row', () => {
    const drift = movesetDrift(
      [
        { speciesId: 'alpha', moveset: ['F1', 'C2', 'C1'] },
        { speciesId: 'beta', moveset: ['NEW', 'C3'] },
        { speciesId: 'beta', moveset: ['F2', 'C3'] },
        { speciesId: 'gamma', moveset: ['F', 'C'] },
      ],
      matrix(),
    );
    expect(drift).toEqual([{ speciesId: 'beta', moveset: ['NEW', 'C3'] }]);
  });
});

describe('withReplacedRows', () => {
  it('re-simulates a row in place and leaves the others alone', () => {
    const m = matrix();
    const out = withReplacedRows(m, [{ speciesId: 'beta', moveset: ['NEW', 'C3'] }], {
      sim: fakeSim,
      league,
    });
    expect(out.candidates).toEqual(m.candidates);
    expect(out.candidateMovesets.beta).toEqual(['NEW', 'C3']);
    for (let o = 0; o < 2; o++) {
      for (let s = 0; s < 2; s++) {
        expect(out.ratings[matrixIndex(out, 1, o, s)]).toBe(900);
        expect(out.ratings[matrixIndex(out, 0, o, s)]).toBe(m.ratings[matrixIndex(m, 0, o, s)]);
      }
    }
    expect(m.ratings).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
  });

  it('returns the matrix itself when there is nothing to replace', () => {
    const m = matrix();
    expect(withReplacedRows(m, [], { sim: fakeSim, league })).toBe(m);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/test/sim/matrixSim.test.ts`
Expected: FAIL, `sameMoveset` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/engine/src/sim/matrixSim.ts`:

```ts
/** Same fast move and the same charged moves, in any order. */
export function sameMoveset(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length || a[0] !== b[0]) {
    return false;
  }
  const rest = (m: readonly string[]): string => [...m.slice(1)].sort().join('+');
  return rest(a) === rest(b);
}

/**
 * Fighters that have a matrix row whose moveset is not the one they will be shown with. The
 * first fighter named for a species decides; later ones are ignored.
 */
export function movesetDrift(
  fighters: readonly MatrixFighter[],
  matrix: MatchupMatrix,
): MatrixFighter[] {
  const seen = new Set<string>();
  const out: MatrixFighter[] = [];
  for (const f of fighters) {
    if (seen.has(f.speciesId)) {
      continue;
    }
    seen.add(f.speciesId);
    const row = matrix.candidateMovesets[f.speciesId];
    if (row === undefined) {
      continue;
    }
    if (!sameMoveset(f.moveset, row)) {
      out.push({ speciesId: f.speciesId, moveset: [...f.moveset] });
    }
  }
  return out;
}

/**
 * The matrix with the given species' rows re-simulated at the given movesets, in place: same
 * candidates, same row indexes, so a Candidate's matrixRow still points at its own row. Species
 * the matrix does not have are ignored (withSimulatedRows adds those).
 */
export function withReplacedRows(
  matrix: MatchupMatrix,
  rows: readonly MatrixFighter[],
  deps: MatrixSimDeps,
): MatchupMatrix {
  const known = rows.filter((r) => matrix.candidates.includes(r.speciesId));
  if (known.length === 0) {
    return matrix;
  }
  const opponents = matrix.opponents.map((id) => ({
    speciesId: id,
    moveset: matrix.opponentMovesets[id] ?? [],
  }));
  const fresh = simulateMatrix(matrix, [...known], opponents, deps);
  const ratings = [...matrix.ratings];
  fresh.candidates.forEach((id, fi) => {
    const ci = matrix.candidates.indexOf(id);
    for (let oi = 0; oi < matrix.opponents.length; oi++) {
      for (let si = 0; si < matrix.scenarios.length; si++) {
        ratings[matrixIndex(matrix, ci, oi, si)] = fresh.ratings[
          matrixIndex(fresh, fi, oi, si)
        ] as number;
      }
    }
  });
  return {
    ...matrix,
    candidateMovesets: { ...matrix.candidateMovesets, ...fresh.candidateMovesets },
    ratings,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/test/sim/matrixSim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/sim/matrixSim.ts packages/engine/test/sim/matrixSim.test.ts
git commit -m "Engine: re-simulate matrix rows whose moveset differs from the one shown"
```

---

### Task 5: cupBoards, the three boards from the engine

**Files:**
- Modify: `packages/engine/src/coldstart/boards.ts` (append)
- Test: `packages/engine/test/coldstart/boards.test.ts` (append a static-data block)

**Interfaces:**
- Consumes: `scoreTrios`, `presentTeam`, `ScoredTrio`, `GeneratedTeam` (Task 2); `selectVaried`, `selectMegaRows`, `BOARD_ROWS`, `SPECIES_CAP` (Task 3); `movesetDrift`, `withReplacedRows` (Task 4); existing `coldStartSpecimens`, `coldStartBuilds`, `spreadsFromGameMaster`, `buildOptionsFor`, `candidatePool`, `MatrixView`, `weightedTrioOptions`, `DEFAULT_TRIO_OPTIONS`.
- Produces:
  - `interface BoardRow { team: GeneratedTeam; members: [Candidate, Candidate, Candidate]; megaId: string | null }` (`members` in the order `team.species` lists them)
  - `interface CupBoardsInput { league: League; index: GameDataIndex; matrix: MatchupMatrix; rankings: Rankings; gameMaster: unknown; weights: ReadonlyMap<string, number>; sim: BattleSimulator; mega: boolean }`
  - `interface CupBoards { top: BoardRow[]; budget: BoardRow[]; mega: BoardRow[] | null; resimulated: { top: string[]; budget: string[]; mega: string[] } }`
  - `cupBoards(input: CupBoardsInput): CupBoards`
  - `const BOARD_POOL = 60`, `const MEGA_SCAN = 1000`

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/test/coldstart/boards.test.ts` (add the imports at the top of the file):

```ts
import { cupBoards, type BoardRow } from '../../src/coldstart/boards.js';
import type { BattleSimulator } from '../../src/sim/BattleSimulator.js';
import { haveStaticData, loadIndex, loadStaticData, readGameMaster } from '../fixtures.js';

/** Every re-simulated battle is a loss, so a drifted row can only get weaker. */
const losingSim: BattleSimulator = {
  simulate: () => ({ rating: 0, opRating: 1000, winner: 1, turnsToWin: [0, 0] }),
};

describe.skipIf(!haveStaticData())('cupBoards on the built data', () => {
  const data = loadStaticData();
  const index = loadIndex();
  const boards = cupBoards({
    league: data.league,
    index,
    matrix: data.matrix,
    rankings: data.rankings,
    gameMaster: readGameMaster(),
    weights: new Map(),
    sim: losingSim,
    mega: true,
  });
  const base = (id: string): string => index.baseOf(index.teamSpeciesOf(id));
  const everyBoard = (): BoardRow[][] => [boards.top, boards.budget, boards.mega ?? []];

  it('gives Top and Budget five rows, strongest first', () => {
    for (const rows of [boards.top, boards.budget]) {
      expect(rows).toHaveLength(5);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1]!.team.strength).toBeGreaterThanOrEqual(rows[i]!.team.strength);
      }
    }
  });

  it('never puts one Pokemon on more than two rows of an image', () => {
    for (const rows of everyBoard()) {
      const uses = new Map<string, number>();
      for (const r of rows) {
        for (const id of r.team.species) {
          uses.set(base(id), (uses.get(base(id)) ?? 0) + 1);
        }
      }
      for (const n of uses.values()) {
        expect(n).toBeLessThanOrEqual(2);
      }
    }
  });

  it('lists members in the order the team is presented', () => {
    for (const rows of everyBoard()) {
      for (const r of rows) {
        expect(r.members.map((c) => c.build.speciesId)).toEqual(r.team.species);
      }
    }
  });

  it('builds the budget board with no Elite TM moves and re-simulates what changed', () => {
    for (const r of boards.budget) {
      for (const c of r.members) {
        expect(c.moveset.eliteTmCount).toBe(0);
      }
    }
    expect(boards.resimulated.budget.length).toBeGreaterThan(0);
  });

  it('gives the Mega board one Mega per row, each a different Mega', () => {
    const mega = boards.mega ?? [];
    for (const r of mega) {
      expect(r.megaId).not.toBeNull();
      const megas = r.team.species.filter((id) => index.teamSpeciesOf(id) !== id);
      expect(megas).toEqual([r.megaId]);
    }
    expect(new Set(mega.map((r) => r.megaId)).size).toBe(mega.length);
  });

  it('has no Mega board when the league does not allow Megas', () => {
    const plain = cupBoards({
      league: data.league,
      index,
      matrix: data.matrix,
      rankings: data.rankings,
      gameMaster: readGameMaster(),
      weights: new Map(),
      sim: losingSim,
      mega: false,
    });
    expect(plain.mega).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/test/coldstart/boards.test.ts`
Expected: FAIL, `cupBoards` is not exported.

- [ ] **Step 3: Implement**

Add these imports at the top of `packages/engine/src/coldstart/boards.ts`:

```ts
import { buildOptionsFor } from '../builds/eligibility.js';
import type { GameDataIndex } from '../gamedata/index.js';
import type { League } from '../gamedata/league.js';
import type { MatchupMatrix } from '../gamedata/types.js';
import { candidatePool, type Candidate, type Rankings } from '../search/candidates.js';
import { MatrixView } from '../search/matrixView.js';
import { DEFAULT_TRIO_OPTIONS, weightedTrioOptions, type TrioIndex } from '../search/trios.js';
import type { BattleSimulator } from '../sim/BattleSimulator.js';
import { movesetDrift, withReplacedRows } from '../sim/matrixSim.js';
import { coldStartBuilds, coldStartSpecimens, spreadsFromGameMaster } from './pool.js';
import { presentTeam, scoreTrios, type GeneratedTeam, type ScoredTrio } from './teams.js';
```

(`League` is defined in `gamedata/league.ts`, `Rankings` in `search/candidates.ts`, `MatchupMatrix` in `gamedata/types.ts`.)

Append to the file:

```ts
/** Species the Top and Budget boards draft from, the meta bake's COLD_POOL. */
export const BOARD_POOL = 60;
/** A pool wide enough to hold every Mega the league's matrix has. */
export const MEGA_SCAN = 1000;

export interface BoardRow {
  team: GeneratedTeam;
  /** Lead, switch, closer: the candidates in the order team.species lists them. */
  members: [Candidate, Candidate, Candidate];
  /** The Mega this row is built around (Mega board only), else null. */
  megaId: string | null;
}

export interface CupBoardsInput {
  league: League;
  index: GameDataIndex;
  matrix: MatchupMatrix;
  rankings: Rankings;
  gameMaster: unknown;
  /** Per-opponent weights (the meta blend, or PvPoke's prior). */
  weights: ReadonlyMap<string, number>;
  /** Re-simulates rows whose moveset differs from the matrix; PvPokeSimulator in the script. */
  sim: BattleSimulator;
  /** The league allows Megas (its schedule entry says mega: true). */
  mega: boolean;
}

export interface CupBoards {
  top: BoardRow[];
  budget: BoardRow[];
  mega: BoardRow[] | null;
  /** Species whose matrix row was re-simulated, per board, for teams.json. */
  resimulated: { top: string[]; budget: string[]; mega: string[] };
}

function poolOf(
  input: CupBoardsInput,
  view: MatrixView,
  allowEliteTm: boolean,
  poolSize: number,
): Candidate[] {
  const opts = { ...buildOptionsFor(input.league), allowEliteTm };
  const builds = coldStartBuilds(
    coldStartSpecimens(
      input.matrix.candidates,
      spreadsFromGameMaster(input.gameMaster, input.league.cp),
      input.index,
    ),
    input.index,
    opts,
  );
  return candidatePool(builds, input.rankings, view, input.index, {
    ...opts,
    poolSize,
    excludedSpecimenIds: [],
    excludedSpecies: [],
  }).pool;
}

/** A view whose rows match the pool's movesets, re-simulating the rows that do not. */
function honestView(
  input: CupBoardsInput,
  pool: readonly Candidate[],
): { view: MatrixView; resimulated: string[] } {
  const fighters = pool.map((c) => ({
    speciesId: c.build.speciesId,
    moveset: [c.moveset.fast.moveId, ...c.moveset.charged.map((m) => m.moveId)],
  }));
  const drift = movesetDrift(fighters, input.matrix);
  const matrix = withReplacedRows(input.matrix, drift, { sim: input.sim, league: input.league });
  return { view: new MatrixView(matrix), resimulated: drift.map((d) => d.speciesId) };
}

export function cupBoards(input: CupBoardsInput): CupBoards {
  const { index } = input;
  const types: TrioIndex = {
    types: (id: string) => index.mustSpecies(id).types,
    teamSpeciesOf: (id: string) => index.teamSpeciesOf(id),
  };
  const isMega = (id: string): boolean => index.teamSpeciesOf(id) !== id;
  const base = (id: string): string => index.baseOf(index.teamSpeciesOf(id));
  const speciesOf = (t: ScoredTrio): string[] => t.members.map((m) => base(m.c.build.speciesId));
  const select = { rows: BOARD_ROWS, cap: SPECIES_CAP };
  const shipped = new MatrixView(input.matrix);

  const rowsOf = (
    items: readonly ScoredTrio[],
    view: MatrixView,
    megaOf: (t: ScoredTrio) => string | null,
  ): BoardRow[] => {
    const trioOpts = weightedTrioOptions(DEFAULT_TRIO_OPTIONS, view, input.weights);
    return items.map((item) => ({
      team: presentTeam(item, view, trioOpts),
      members: item.order.map((i) => item.members[i]!.c) as [Candidate, Candidate, Candidate],
      megaId: megaOf(item),
    }));
  };
  const noMega = (): null => null;

  const topPool = poolOf(input, shipped, true, BOARD_POOL);
  const top = honestView(input, topPool);
  const topRows = rowsOf(
    selectVaried(scoreTrios(topPool, top.view, types, input.weights), speciesOf, select),
    top.view,
    noMega,
  );

  const budgetPool = poolOf(input, shipped, false, BOARD_POOL);
  const budget = honestView(input, budgetPool);
  const budgetRows = rowsOf(
    selectVaried(scoreTrios(budgetPool, budget.view, types, input.weights), speciesOf, select),
    budget.view,
    noMega,
  );

  let megaRows: BoardRow[] | null = null;
  let megaResim: string[] = [];
  if (input.mega) {
    const megas = poolOf(input, shipped, true, MEGA_SCAN).filter((c) =>
      isMega(c.build.speciesId),
    );
    const megaPool = [...topPool.filter((c) => !isMega(c.build.speciesId)), ...megas];
    const mega = honestView(input, megaPool);
    megaResim = mega.resimulated;
    const megaOf = (t: ScoredTrio): string | null =>
      t.members.find((m) => isMega(m.c.build.speciesId))?.c.build.speciesId ?? null;
    megaRows = rowsOf(
      selectMegaRows(scoreTrios(megaPool, mega.view, types, input.weights), speciesOf, megaOf, select),
      mega.view,
      megaOf,
    );
  }

  return {
    top: topRows,
    budget: budgetRows,
    mega: megaRows,
    resimulated: { top: top.resimulated, budget: budget.resimulated, mega: megaResim },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/test/coldstart/boards.test.ts`
Expected: PASS. If the Mega block asserts nothing because the local Great League data has no Mega candidates, that is expected; the Mega path is covered by Task 3's selection tests and Task 10's real run.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/coldstart/boards.ts packages/engine/test/coldstart/boards.test.ts
git commit -m "Engine: cupBoards drafts Top, Budget and Mega boards with honest rows"
```

---

### Task 6: Board display names and cautions

**Files:**
- Create: `packages/engine/src/coldstart/boardDisplay.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/coldstart/boardDisplay.test.ts`

**Interfaces:**
- Produces:
  - `type TagKind = 'mega' | 'region' | 'form' | 'shadow'`
  - `interface MemberDisplay { name: string; sprite: string; tags: { kind: TagKind; text: string }[] }`
  - `memberDisplay(speciesName: string, speciesId: string): MemberDisplay` (tags ordered mega, region, form, shadow)
  - `cautionNames(ids: readonly string[], nameOf: (id: string) => string, max?: number): string[]` (default max 3, de-duplicated by name, first-seen order)

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/test/coldstart/boardDisplay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cautionNames, memberDisplay } from '../../src/coldstart/boardDisplay.js';

describe('memberDisplay', () => {
  it('keeps the Mega letter as its tag', () => {
    expect(memberDisplay('Charizard (Mega X)', 'charizard_mega_x')).toEqual({
      name: 'Charizard',
      sprite: 'charizard_mega_x',
      tags: [{ kind: 'mega', text: 'Mega X' }],
    });
    expect(memberDisplay('Venusaur (Mega)', 'venusaur_mega').tags).toEqual([
      { kind: 'mega', text: 'Mega' },
    ]);
  });

  it('shows a Shadow with the base sprite', () => {
    expect(memberDisplay('Kingdra (Shadow)', 'kingdra_shadow')).toEqual({
      name: 'Kingdra',
      sprite: 'kingdra',
      tags: [{ kind: 'shadow', text: 'Shadow' }],
    });
  });

  it('orders region before shadow and splits a regional form', () => {
    expect(memberDisplay('Marowak (Alolan) (Shadow)', 'marowak_alolan_shadow').tags).toEqual([
      { kind: 'region', text: 'Alolan' },
      { kind: 'shadow', text: 'Shadow' },
    ]);
    expect(memberDisplay('Darmanitan (Galarian Zen)', 'darmanitan_galarian_zen').tags).toEqual([
      { kind: 'region', text: 'Galarian' },
      { kind: 'form', text: 'Zen' },
    ]);
  });

  it('keeps any other form as a form tag', () => {
    expect(memberDisplay('Lycanroc (Midnight)', 'lycanroc_midnight')).toEqual({
      name: 'Lycanroc',
      sprite: 'lycanroc_midnight',
      tags: [{ kind: 'form', text: 'Midnight' }],
    });
    expect(memberDisplay('Mimikyu', 'mimikyu').tags).toEqual([]);
  });
});

describe('cautionNames', () => {
  it('drops a name already listed and stops at three', () => {
    const names: Record<string, string> = {
      kingdra: 'Kingdra',
      kingdra_shadow: 'Kingdra',
      a: 'Alpha',
      b: 'Beta',
      c: 'Gamma',
    };
    expect(
      cautionNames(['kingdra', 'kingdra_shadow', 'a', 'b', 'c'], (id) => names[id] ?? id),
    ).toEqual(['Kingdra', 'Alpha', 'Beta']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/test/coldstart/boardDisplay.test.ts`
Expected: FAIL, cannot resolve `../../src/coldstart/boardDisplay.js`.

- [ ] **Step 3: Implement**

Create `packages/engine/src/coldstart/boardDisplay.ts`:

```ts
/**
 * How a board row names a Pokemon: the plain name, the sprite to show, and small tags for what
 * the name's parentheses said. PvPoke names forms as "Charizard (Mega X)", "Kingdra (Shadow)",
 * "Marowak (Alolan) (Shadow)", "Darmanitan (Galarian Zen)".
 */
export type TagKind = 'mega' | 'region' | 'form' | 'shadow';

export interface MemberDisplay {
  name: string;
  /** Sprite id: a Shadow uses its base sprite, the board draws the shadow treatment. */
  sprite: string;
  /** Mega, then region, then form, then Shadow. */
  tags: { kind: TagKind; text: string }[];
}

const REGIONS = ['Alolan', 'Galarian', 'Hisuian', 'Paldean'];
const ORDER: TagKind[] = ['mega', 'region', 'form', 'shadow'];

export function memberDisplay(speciesName: string, speciesId: string): MemberDisplay {
  const name = speciesName.split(' (')[0]!.trim();
  const tags: { kind: TagKind; text: string }[] = [];
  for (const m of speciesName.matchAll(/\(([^)]+)\)/g)) {
    const part = m[1]!.trim();
    if (part === 'Shadow') {
      tags.push({ kind: 'shadow', text: 'Shadow' });
    } else if (/^Mega( [XY])?$/.test(part) || part === 'Primal') {
      tags.push({ kind: 'mega', text: part });
    } else {
      const [first, ...rest] = part.split(' ');
      if (first !== undefined && REGIONS.includes(first)) {
        tags.push({ kind: 'region', text: first });
        if (rest.length > 0) {
          tags.push({ kind: 'form', text: rest.join(' ') });
        }
      } else {
        tags.push({ kind: 'form', text: part });
      }
    }
  }
  tags.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return { name, sprite: speciesId.replace(/_shadow$/, ''), tags };
}

/** The first `max` distinct names among the ids, in order: a Shadow and its base read the same. */
export function cautionNames(
  ids: readonly string[],
  nameOf: (id: string) => string,
  max = 3,
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const name = nameOf(id);
    if (!out.includes(name)) {
      out.push(name);
    }
    if (out.length >= max) {
      break;
    }
  }
  return out;
}
```

In `packages/engine/src/index.ts` add:

```ts
export * from './coldstart/boardDisplay.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/test/coldstart/boardDisplay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/coldstart/boardDisplay.ts packages/engine/src/index.ts packages/engine/test/coldstart/boardDisplay.test.ts
git commit -m "Engine: board display names keep the Mega letter and de-duplicate cautions"
```

---

### Task 7: Script data, weights, source line and run label

**Files:**
- Create: `apps/meta/scripts/post/data.ts`
- Create: `apps/meta/scripts/post/weights.ts`
- Test: `apps/meta/test/postWeights.test.ts`

**Interfaces:**
- Consumes (engine): `communityWeights`, `ranksOf`, `readEpochs`, `resolveWindow`, `type ApiWindow`, `type CommunitySummary` from `@pickthree/engine/meta`; `runsOf`, `type ScheduleEntry`, `type League`, `type MatchupMatrix`, `type Move`, `type Rankings`, `type RankingEntry`, `type Species` from `@pickthree/engine`.
- Produces:
  - `data.ts`: `DATA_BASE = 'https://pick3.gg/data'`; `type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`; `getJson<T>(url: string, fetcher?: Fetcher): Promise<T>`; `interface CupData { manifest: { pvpokeCommit: string; pvpokeDate: string }; pokemon: Species[]; moves: Move[]; gameMaster: unknown; league: League; schedule: ScheduleEntry[]; seasons: { start: string }[]; epochs: unknown; matrix: MatchupMatrix; rankings: Rankings; group: string[]; banned: string[] }`; `loadCupData(leagueId: string, fetcher?: Fetcher): Promise<CupData>`
  - `weights.ts`: `API_BASE = 'https://meta.pick3.gg'`; `interface MetaSummary extends CommunitySummary { battles: number; devices: number }`; `fetchSummary(leagueId: string, w: ApiWindow, fetcher?: Fetcher): Promise<MetaSummary>`; `blendedWeights(summary: CommunitySummary, data: Pick<CupData, 'group' | 'rankings' | 'banned'>): Map<string, number>`; `type WeightMix = { kind: 'prior' } | { kind: 'blend'; battles: number; events: number }`; `formatDay(d: Date): string` ("Sep 30, 2026"); `mixLine(mix: WeightMix, day: Date): string`; `runLabel(schedule: readonly ScheduleEntry[], leagueId: string, now: Date): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/meta/test/postWeights.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ScheduleEntry } from '@pickthree/engine';
import { getJson, type Fetcher } from '../scripts/post/data.js';
import { blendedWeights, fetchSummary, formatDay, mixLine, runLabel } from '../scripts/post/weights.js';

const entry = (league: string, start: string, end: string): ScheduleEntry => ({
  league,
  cup: league,
  cp: 1500,
  title: league,
  start,
  end,
  season: 'Test',
});

describe('runLabel', () => {
  const schedule = [
    entry('colormega', '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z'),
    entry('colormega', '2026-09-29T20:00:00.000Z', '2026-10-06T20:00:00.000Z'),
    entry('mega-great', '2026-10-06T20:00:00.000Z', '2026-10-13T20:00:00.000Z'),
  ];

  it('reads LIVE with the merged run dates while the cup is on', () => {
    expect(runLabel(schedule, 'colormega', new Date('2026-09-30T12:00:00Z'))).toBe(
      'LIVE SEP 22 - OCT 6',
    );
  });

  it('reads STARTS before the run begins', () => {
    expect(runLabel(schedule, 'mega-great', new Date('2026-09-30T12:00:00Z'))).toBe(
      'STARTS OCT 6 - OCT 13',
    );
  });

  it('reads UPDATED for a league with no run, or only past runs', () => {
    expect(runLabel(schedule, 'great', new Date('2026-09-30T12:00:00Z'))).toBe('UPDATED SEP 30');
    expect(runLabel(schedule, 'colormega', new Date('2026-11-01T12:00:00Z'))).toBe('UPDATED NOV 1');
  });
});

describe('mixLine', () => {
  const day = new Date('2026-09-30T12:00:00Z');
  it('names what the weights were made of', () => {
    expect(formatDay(day)).toBe('Sep 30, 2026');
    expect(mixLine({ kind: 'prior' }, day)).toBe('PvPoke meta only - Sep 30, 2026');
    expect(mixLine({ kind: 'blend', battles: 0, events: 0 }, day)).toBe(
      'PvPoke meta only - Sep 30, 2026',
    );
    expect(mixLine({ kind: 'blend', battles: 1240, events: 0 }, day)).toBe(
      'PvPoke meta + 1,240 shared battles - Sep 30, 2026',
    );
    expect(mixLine({ kind: 'blend', battles: 1, events: 2 }, day)).toBe(
      'PvPoke meta + 1 shared battle + 2 events - Sep 30, 2026',
    );
  });
});

describe('fetching', () => {
  const failing: Fetcher = async () => ({ ok: false, status: 400, json: async () => ({}) });

  it('names the URL and status when a data file fails', async () => {
    await expect(getJson('https://pick3.gg/data/x.json', failing)).rejects.toThrow(
      /x\.json.*400/,
    );
  });

  it('points at --prior when the meta read fails', async () => {
    const w = { since: 'a', until: 'b', label: 'This meta', key: 'meta' as const, epoch: null };
    await expect(fetchSummary('mega-great', w, failing)).rejects.toThrow(/--prior/);
  });
});

describe('blendedWeights', () => {
  it('gives every meta group species a weight when nothing is measured', () => {
    const w = blendedWeights(
      { battles: 0, devices: 0, species: [], tournament: null },
      {
        group: ['a', 'b'],
        rankings: { overall: [{ speciesId: 'a' }, { speciesId: 'b' }] } as never,
        banned: [],
      },
    );
    expect([...w.keys()].sort()).toEqual(['a', 'b']);
    expect((w.get('a') ?? 0) + (w.get('b') ?? 0)).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/meta/test/postWeights.test.ts`
Expected: FAIL, cannot resolve `../scripts/post/data.js`.

- [ ] **Step 3: Implement**

Create `apps/meta/scripts/post/data.ts`:

```ts
/**
 * Production game data for one league, fetched from pick3.gg so a post matches what the live
 * app computes. Nothing is cached; a run reads about 20 MB.
 */
import type {
  League,
  MatchupMatrix,
  Move,
  RankingEntry,
  Rankings,
  ScheduleEntry,
  Species,
} from '@pickthree/engine';

export const DATA_BASE = 'https://pick3.gg/data';

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function getJson<T>(url: string, fetcher: Fetcher = fetch): Promise<T> {
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`Could not read ${url}: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CupData {
  manifest: { pvpokeCommit: string; pvpokeDate: string };
  pokemon: Species[];
  moves: Move[];
  gameMaster: unknown;
  league: League;
  schedule: ScheduleEntry[];
  seasons: { start: string }[];
  epochs: unknown;
  matrix: MatchupMatrix;
  rankings: Rankings;
  /** PvPoke's meta group for the league, in its own order. */
  group: string[];
  /** Species the Play! ruleset bans in this league. */
  banned: string[];
}

export async function loadCupData(leagueId: string, fetcher: Fetcher = fetch): Promise<CupData> {
  const get = <T>(path: string): Promise<T> => getJson<T>(`${DATA_BASE}/${path}`, fetcher);
  const leagues = await get<League[]>('leagues.json');
  const league = leagues.find((l) => l.id === leagueId);
  if (!league) {
    throw new Error(
      `pick3.gg has no league "${leagueId}". Leagues: ${leagues.map((l) => l.id).join(', ')}`,
    );
  }
  const ranking = (role: string): Promise<RankingEntry[]> =>
    get<RankingEntry[]>(`rankings/${leagueId}/${role}.json`);
  const [manifest, pokemon, moves, gameMaster, schedule, seasons, epochs, matrix, meta, legal] =
    await Promise.all([
      get<{ pvpokeCommit: string; pvpokeDate: string }>('data-manifest.json'),
      get<Species[]>('pokemon.json'),
      get<Move[]>('moves.json'),
      get<unknown>('gamemaster.json'),
      get<ScheduleEntry[]>('schedule.json'),
      get<{ start: string }[]>('seasons.json'),
      get<unknown>('epochs.json'),
      get<MatchupMatrix>(`matrix/${leagueId}.json`),
      get<{ speciesId: string }[]>(`meta/${leagueId}.json`),
      get<{ banned: string[] }>(`legal/${leagueId}.json`),
    ]);
  const [overall, leads, switches, closers, chargers] = await Promise.all(
    ['overall', 'leads', 'switches', 'closers', 'chargers'].map(ranking),
  );
  return {
    manifest,
    pokemon,
    moves,
    gameMaster,
    league,
    schedule,
    seasons,
    epochs,
    matrix,
    rankings: {
      overall: overall!,
      leads: leads!,
      switches: switches!,
      closers: closers!,
      chargers: chargers!,
    },
    group: meta.map((m) => m.speciesId),
    banned: legal.banned,
  };
}
```

Create `apps/meta/scripts/post/weights.ts`:

```ts
/**
 * What the strength number is measured against: meta.pick3.gg's blend of PvPoke's prior,
 * tournament picks and shared ladder battles, computed the way apps/meta/src/rank.ts does.
 */
import { runsOf, type ScheduleEntry } from '@pickthree/engine';
import {
  communityWeights,
  ranksOf,
  type ApiWindow,
  type CommunitySummary,
} from '@pickthree/engine/meta';
import { getJson, type CupData, type Fetcher } from './data.js';

export const API_BASE = 'https://meta.pick3.gg';

export interface MetaSummary extends CommunitySummary {
  battles: number;
  devices: number;
}

export async function fetchSummary(
  leagueId: string,
  w: ApiWindow,
  fetcher: Fetcher = fetch,
): Promise<MetaSummary> {
  const q = new URLSearchParams({ league: leagueId, since: w.since, until: w.until });
  try {
    return await getJson<MetaSummary>(`${API_BASE}/api/v1/meta?${q.toString()}`, fetcher);
  } catch (err) {
    throw new Error(
      `${(err as Error).message}. The meta read failed; rerun with --prior to use PvPoke's meta alone.`,
    );
  }
}

export function blendedWeights(
  summary: CommunitySummary,
  data: Pick<CupData, 'group' | 'rankings' | 'banned'>,
): Map<string, number> {
  return communityWeights(summary, {
    source: 'all',
    group: data.group,
    rankOrder: ranksOf(data.rankings.overall),
    banned: new Set(data.banned),
  }).weights;
}

export type WeightMix = { kind: 'prior' } | { kind: 'blend'; battles: number; events: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 30, 2026", UTC. */
export function formatDay(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function short(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]!.toUpperCase()} ${d.getUTCDate()}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** The source line's second line: what the weights were made of, and the run date. */
export function mixLine(mix: WeightMix, day: Date): string {
  const parts = ['PvPoke meta'];
  if (mix.kind === 'blend') {
    if (mix.battles > 0) {
      parts.push(plural(mix.battles, 'shared battle', 'shared battles'));
    }
    if (mix.events > 0) {
      parts.push(plural(mix.events, 'event', 'events'));
    }
  }
  const what = parts.length === 1 ? 'PvPoke meta only' : parts.join(' + ');
  return `${what} - ${formatDay(day)}`;
}

/**
 * The corner label: the run containing now ("LIVE SEP 22 - OCT 6"), else the next run
 * ("STARTS OCT 6 - OCT 13"), else "UPDATED <today>". Dates are UTC; a run's end is exclusive at
 * 20:00 UTC, so its end date is the last day it is live.
 */
export function runLabel(
  schedule: readonly ScheduleEntry[],
  leagueId: string,
  now: Date,
): string {
  const t = now.getTime();
  for (const r of runsOf(schedule, leagueId)) {
    const start = new Date(r.start);
    const end = new Date(r.end);
    if (t >= start.getTime() && t < end.getTime()) {
      return `LIVE ${short(start)} - ${short(end)}`;
    }
    if (t < start.getTime()) {
      return `STARTS ${short(start)} - ${short(end)}`;
    }
  }
  return `UPDATED ${short(now)}`;
}
```

If `ApiWindow` in `packages/engine/src/meta/window.ts` has fields beyond `since`, `until`, `label`, `key`, `epoch`, add them to the test's `w` literal; do not change the engine type.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/meta/test/postWeights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/meta/scripts/post/data.ts apps/meta/scripts/post/weights.ts apps/meta/test/postWeights.test.ts
git commit -m "Meta: cup-board script reads production data and the meta blend"
```

---

### Task 8: Template and fill

**Files:**
- Create: `apps/meta/scripts/post/template.html` (derived from `docs/design/infographic/export/pick3-cup-boards.html`)
- Create: `apps/meta/scripts/post/assets/mascot-pointing.png`, `mascot-thinking.png`, `mascot-fingerguns.png`
- Create: `apps/meta/scripts/post/fill.ts`
- Test: `apps/meta/test/postFill.test.ts`

**Interfaces:**
- Produces:
  - `type BoardId = 'top' | 'budget' | 'mega'`
  - `interface MemberView { role: 'LEAD' | 'SWITCH' | 'CLOSER'; name: string; sprite: string; type: string; tags: { kind: 'mega' | 'region' | 'form' | 'shadow' | 'elite'; text: string }[]; moves: [string, string, ...string[]]; hero: boolean }`
  - `interface RowView { strength: number; members: [MemberView, MemberView, MemberView]; caution: string[] }`
  - `interface BoardView { id: BoardId; title: string; label: string; source: [string, string, string]; mascot: string; rows: RowView[] }` (`mascot` is a data URI)
  - `fillBoards(template: string, boards: readonly BoardView[]): string`
  - `assertAscii(html: string): void` (throws naming the first offending character and its context)
  - `escapeHtml(s: string): string`

- [ ] **Step 1: Prepare the template and assets**

```bash
mkdir -p apps/meta/scripts/post/assets
cp docs/design/infographic/mascot-cutouts/mascot-pointing-figure.png apps/meta/scripts/post/assets/mascot-pointing.png
cp docs/design/infographic/mascot-cutouts/mascot-thinking-figure.png apps/meta/scripts/post/assets/mascot-thinking.png
cp docs/design/infographic/mascot-cutouts/mascot-fingerguns-figure.png apps/meta/scripts/post/assets/mascot-fingerguns.png
node -e "
const fs = require('fs');
let h = fs.readFileSync('docs/design/infographic/export/pick3-cup-boards.html', 'utf8');
h = h.replace(/(<div class=\"mascot\"[^>]*>)<svg[\s\S]*?<\/svg>(<\/div>)/g,
  '\$1<img class=\"mascot-img\" src=\"\" alt=\"\" style=\"width:100%;height:100%;object-fit:cover;object-position:50% 0\">\$2');
fs.writeFileSync('apps/meta/scripts/post/template.html', h);
console.log('mascot slots', (h.match(/mascot-img/g) || []).length, 'bytes', h.length);
"
```

Expected output: `mascot slots 3` and a size well under the export's 2.2 MB (the embedded JPEGs are gone, the fonts stay).

- [ ] **Step 2: Write the failing tests**

Create `apps/meta/test/postFill.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertAscii,
  escapeHtml,
  fillBoards,
  type BoardView,
  type MemberView,
  type RowView,
} from '../scripts/post/fill.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(here, '..', 'scripts', 'post', 'template.html'), 'utf8');

const member = (name: string, extra: Partial<MemberView> = {}): MemberView => ({
  role: 'LEAD',
  name,
  sprite: name.toLowerCase(),
  type: 'water',
  tags: [],
  moves: ['Fast', 'Charged One', 'Charged Two'],
  hero: false,
  ...extra,
});
const row = (strength: number, caution: string[] = []): RowView => ({
  strength,
  members: [member('Alpha'), member('Beta', { role: 'SWITCH' }), member('Gamma', { role: 'CLOSER' })],
  caution,
});
const board = (id: BoardView['id'], rows: RowView[]): BoardView => ({
  id,
  title: 'Mega Color Cup',
  label: 'LIVE SEP 22 - OCT 6',
  source: ['Strength: line one', 'PvPoke meta only - Sep 30, 2026', 'Full analysis of every team: links in the post'],
  mascot: 'data:image/png;base64,AAAA',
  rows,
});
const five = [row(92.3), row(91.5, ['Cradily']), row(90.7), row(90.3), row(89.9)];

function section(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  return start < 0 ? '' : html.slice(start, html.indexOf('</section>', start));
}

describe('fillBoards', () => {
  it('writes five rows with the winner first and the strength on each', () => {
    const html = fillBoards(template, [board('top', five)]);
    const top = section(html, 'top');
    expect(top.match(/<article class="team/g)).toHaveLength(5);
    expect(top).toContain('<article class="team winner"');
    expect(top).toContain('style="--strength:92.3%"');
    expect(top).toContain('<strong>92.3</strong>');
    expect(top).toContain('<h1 id="title-top">Mega Color Cup</h1>');
    expect(top).toContain('LIVE SEP 22 - OCT 6');
    expect(top).toContain('src="data:image/png;base64,AAAA"');
    expect(top).toContain('<p class="caution alert"><strong>Watch for:</strong> Cradily</p>');
    expect(top).toContain('<p class="caution clear">Nothing in the meta beats all three</p>');
    expect(top).not.toContain('SAMPLE DATA');
  });

  it('removes a board it was not given', () => {
    const html = fillBoards(template, [board('top', five), board('budget', five)]);
    expect(section(html, 'mega')).toBe('');
    expect(section(html, 'budget')).not.toBe('');
  });

  it('writes a short Mega board and marks its hero', () => {
    const heroRow: RowView = {
      strength: 91.8,
      members: [
        member('Magnezone', { tags: [{ kind: 'shadow', text: 'Shadow' }] }),
        member('Kingdra', { role: 'SWITCH' }),
        member('Charizard', {
          role: 'CLOSER',
          hero: true,
          tags: [
            { kind: 'mega', text: 'Mega X' },
            { kind: 'elite', text: 'Elite TM' },
          ],
        }),
      ],
      caution: [],
    };
    const html = fillBoards(template, [board('mega', [heroRow, row(88)])]);
    const mega = section(html, 'mega');
    expect(mega.match(/<article class="team/g)).toHaveLength(2);
    expect(mega).toContain('<div class="member mega-hero">');
    expect(mega).toContain('<div class="member shadow-member">');
    expect(mega).toContain('<span class="tag mega">Mega X</span><span class="tag elite">Elite TM</span>');
  });

  it('keeps three tags in order: region, then shadow, then Elite TM', () => {
    const r: RowView = {
      ...row(90),
      members: [
        member('Stunfisk', {
          tags: [
            { kind: 'region', text: 'Galarian' },
            { kind: 'shadow', text: 'Shadow' },
            { kind: 'elite', text: 'Elite TM' },
          ],
        }),
        member('Beta', { role: 'SWITCH' }),
        member('Gamma', { role: 'CLOSER' }),
      ],
    };
    const html = fillBoards(template, [board('top', [r])]);
    expect(html).toContain(
      '<span class="tag region">Galarian</span><span class="tag shadow">Shadow</span><span class="tag elite">Elite TM</span>',
    );
  });

  it('escapes text so markup characters cannot break the page', () => {
    const r: RowView = { ...row(90), members: [member('A<b>&"'), member('B', { role: 'SWITCH' }), member('C', { role: 'CLOSER' })] };
    const html = fillBoards(template, [board('top', [r])]);
    expect(html).toContain('A&lt;b&gt;&amp;&quot;');
    expect(escapeHtml(`<&">'`)).toBe('&lt;&amp;&quot;&gt;&#39;');
    const dollar: RowView = { ...row(90), members: [member('A$&$1'), member('B', { role: 'SWITCH' }), member('C', { role: 'CLOSER' })] };
    expect(fillBoards(template, [board('top', [dollar])])).toContain('<span class="name">A$&amp;$1</span>');
  });

  it('uses the long title style for a long cup name', () => {
    const b = { ...board('top', five), title: 'Great League: Mega Edition' };
    expect(fillBoards(template, [b])).toMatch(/<section class="board top long-title" id="top"/);
  });
});

describe('assertAscii', () => {
  it('passes plain text and names a non-ASCII character', () => {
    expect(() => assertAscii('Mega Color Cup - Sep 30')).not.toThrow();
    expect(() => assertAscii('Flab\u00e9b\u00e9 leads')).toThrow(/U\+00E9.*Flab/);
  });

  it('accepts the template as shipped', () => {
    expect(() => assertAscii(template)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run apps/meta/test/postFill.test.ts`
Expected: FAIL, cannot resolve `../scripts/post/fill.js`.

- [ ] **Step 4: Implement**

Create `apps/meta/scripts/post/fill.ts`:

```ts
/**
 * Fills the Claude Design cup-board template (docs/design/infographic/export/README.txt names
 * its classes) with real rows. Pure: template string in, page string out.
 */
export type BoardId = 'top' | 'budget' | 'mega';

export interface MemberView {
  role: 'LEAD' | 'SWITCH' | 'CLOSER';
  name: string;
  /** Sprite id under https://pick3.gg/data/sprites/. */
  sprite: string;
  /** Primary type of the battling form: the portrait's tint class. */
  type: string;
  tags: { kind: 'mega' | 'region' | 'form' | 'shadow' | 'elite'; text: string }[];
  /** Fast move first, then the charged moves. */
  moves: [string, string, ...string[]];
  /** The Mega a Mega-board row is built around. */
  hero: boolean;
}

export interface RowView {
  strength: number;
  members: [MemberView, MemberView, MemberView];
  /** Names nothing on the team beats, at most three; empty reads "Nothing in the meta ...". */
  caution: string[];
}

export interface BoardView {
  id: BoardId;
  title: string;
  label: string;
  source: [string, string, string];
  /** Mascot image as a data URI. */
  mascot: string;
  rows: RowView[];
}

const SUBTITLE: Record<BoardId, string> = {
  top: 'Top 5 Teams',
  budget: 'Budget Builds - No Elite TM',
  mega: 'Best Team for Each Mega',
};

/** Cup names longer than this take the template's two-line title style. */
const LONG_TITLE = 18;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tagClass(kind: MemberView['tags'][number]['kind']): string {
  return kind === 'form' ? 'region' : kind;
}

function memberHtml(m: MemberView): string {
  const cls = ['member', m.hero ? 'mega-hero' : '', m.tags.some((t) => t.kind === 'shadow') ? 'shadow-member' : '']
    .filter(Boolean)
    .join(' ');
  const tags = m.tags
    .map((t) => `<span class="tag ${tagClass(t.kind)}">${escapeHtml(t.text)}</span>`)
    .join('');
  const moves = m.moves
    .map((mv, i) => `<span class="move ${i === 0 ? 'fast' : 'charged'}">${escapeHtml(mv)}</span>`)
    .join('');
  const name = escapeHtml(m.name);
  return `<div class="${cls}">
  <div class="portrait ${escapeHtml(m.type)}"><img class="sprite" src="https://pick3.gg/data/sprites/${escapeHtml(m.sprite)}.webp" alt="${name}" width="108" height="108"></div>
  <div class="member-info"><span class="role">${m.role}</span><span class="name">${name}</span>
   <div class="tags">${tags}</div>
   <div class="moves">${moves}</div>
  </div>
 </div>`;
}

function rowHtml(r: RowView, i: number): string {
  const s = r.strength.toFixed(1);
  const caution =
    r.caution.length > 0
      ? `<p class="caution alert"><strong>Watch for:</strong> ${escapeHtml(r.caution.join(', '))}</p>`
      : '<p class="caution clear">Nothing in the meta beats all three</p>';
  return `<article class="team${i === 0 ? ' winner' : ''}" aria-label="Team ${i + 1}, strength ${s}" style="--strength:${s}%">
 <div class="rank"><small>TEAM</small><strong>#${i + 1}</strong></div>
 <div class="members">${r.members.map(memberHtml).join('')}</div>
 <div class="score"><strong>${s}</strong><small>STRENGTH</small><span class="strength-bar" aria-hidden="true"><i></i></span></div>
 ${caution}
</article>`;
}

function sectionBounds(html: string, id: BoardId): [number, number] {
  const marker = html.indexOf(`id="${id}"`);
  if (marker < 0) {
    throw new Error(`template has no board #${id}`);
  }
  const start = html.lastIndexOf('<section', marker);
  const end = html.indexOf('</section>', marker) + '</section>'.length;
  return [start, end];
}

/** Replaces group 2 of the first match of `re` (open tag, content, close tag) with `inner`. A
 *  function replacer, so a "$" in a name or move can never be read as a back-reference. */
function between(sec: string, re: RegExp, inner: string): string {
  return sec.replace(re, (_all, open: string, _old: string, close: string) => `${open}${inner}${close}`);
}

function fillSection(sec: string, b: BoardView): string {
  const long = b.title.length > LONG_TITLE;
  let out = sec.replace(
    /^<section class="board [a-z]+[^"]*"/,
    () => `<section class="board ${b.id}${long ? ' long-title' : ''}"`,
  );
  out = between(out, /(<h1 id="title-[a-z]+">)([^<]*)(<\/h1>)/, escapeHtml(b.title));
  out = between(out, /(<p class="subtitle">)([^<]*)(<\/p>)/, SUBTITLE[b.id]);
  out = between(out, /(<span class="sample-label">)([^<]*)(<\/span>)/, escapeHtml(b.label));
  out = between(out, /(<img class="mascot-img" src=")([^"]*)(")/, b.mascot);
  out = between(out, /(<main class="teams"[^>]*>)([\s\S]*?)(<\/main>)/, b.rows.map(rowHtml).join(''));
  out = between(
    out,
    /(<div class="source">)([\s\S]*?)(<\/div>)/,
    b.source.map((p) => `<p>${escapeHtml(p)}</p>`).join(''),
  );
  return out;
}

export function fillBoards(template: string, boards: readonly BoardView[]): string {
  let html = template;
  for (const id of ['top', 'budget', 'mega'] as const) {
    const [start, end] = sectionBounds(html, id);
    const b = boards.find((x) => x.id === id);
    const replacement = b ? fillSection(html.slice(start, end), b) : '';
    html = html.slice(0, start) + replacement + html.slice(end);
  }
  return html;
}

/** Throws on the first character outside 7-bit printable ASCII (tabs and newlines allowed). */
export function assertAscii(html: string): void {
  const m = /[^\t\n\r\x20-\x7e]/.exec(html);
  if (m) {
    const code = m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    const context = html.slice(Math.max(0, m.index - 20), m.index + 20);
    throw new Error(`Non-ASCII character U+${code} on the page, near "${context}"`);
  }
}
```

The `sectionBounds` search needs the `<section ... id="top">` tag to open with `<section class="board top ...`; the export does. If `fillBoards` removes the `#top` section, the template's CSS default (`body:not(:has(.board:target)) #top`) no longer applies, which does not matter because each capture targets its board's fragment.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/meta/test/postFill.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/meta/scripts/post/template.html apps/meta/scripts/post/assets apps/meta/scripts/post/fill.ts apps/meta/test/postFill.test.ts
git commit -m "Meta: cup-board template with transparent mascots, and its fill"
```

---

### Task 9: post.md and teams.json

**Files:**
- Create: `apps/meta/scripts/post/markdown.ts`
- Test: `apps/meta/test/postMarkdown.test.ts`

**Interfaces:**
- Consumes: `teamLink` from `@pickthree/engine` (Task 1); `BoardId` from `./fill.js` (Task 8).
- Produces:
  - `interface PostTeam { species: [string, string, string]; names: [string, string, string]; moves: [string[], string[], string[]]; strength: number; coverage: number; consistency: number; safety: number; structure: string; exposure: string[] }` (`names` are full species names like "Kingdra (Shadow)"; `moves` are move ids, fast first)
  - `interface PostBoard { id: BoardId; heading: string; teams: PostTeam[] }`
  - `interface PostRun { leagueId: string; cupTitle: string; day: Date; mixLine: string; pvpoke: { commit: string; date: string }; weights: 'prior' | 'blend'; resimulated: Record<string, string[]>; boards: PostBoard[] }`
  - `linkOf(leagueId: string, t: PostTeam): string`
  - `postMarkdown(run: PostRun): string`
  - `teamsJson(run: PostRun): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/meta/test/postMarkdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { linkOf, postMarkdown, teamsJson, type PostRun, type PostTeam } from '../scripts/post/markdown.js';

const team = (a: string, b: string, c: string, strength: number): PostTeam => ({
  species: [a, b, c],
  names: [a, b, c].map((x) => x.replace(/^./, (ch) => ch.toUpperCase())) as [string, string, string],
  moves: [
    ['F1', 'C1', 'C2'],
    ['F2', 'C3'],
    ['F3', 'C4', 'C5'],
  ],
  strength,
  coverage: 90,
  consistency: 70,
  safety: 80,
  structure: 'ABC',
  exposure: [],
});

const run = (withMega: boolean): PostRun => ({
  leagueId: 'mega-great',
  cupTitle: 'Great League: Mega Edition',
  day: new Date('2026-10-06T21:00:00Z'),
  mixLine: 'PvPoke meta only - Oct 6, 2026',
  pvpoke: { commit: 'abc123', date: '2026-09-29' },
  weights: 'prior',
  resimulated: { top: [], budget: ['marowak_alolan'], mega: [] },
  boards: [
    { id: 'top', heading: 'Top Teams', teams: [team('alpha', 'beta', 'gamma', 91.2)] },
    { id: 'budget', heading: 'Budget Builds - No Elite TM', teams: [team('delta', 'beta', 'eps', 88)] },
    ...(withMega
      ? [{ id: 'mega' as const, heading: 'Best Team for Each Mega', teams: [team('venusaur_mega', 'beta', 'gamma', 90)] }]
      : []),
  ],
});

describe('post.md', () => {
  it('links each team with its moves', () => {
    expect(linkOf('mega-great', team('alpha', 'beta', 'gamma', 1))).toBe(
      'https://pick3.gg/#/t/mega-great/alpha.F1.C1.C2+beta.F2.C3+gamma.F3.C4.C5',
    );
  });

  it('titles the post, numbers the teams per board, and explains the number', () => {
    const md = postMarkdown(run(true));
    expect(md.split('\n')[0]).toBe(
      'Title: Great League: Mega Edition: top teams, budget builds and the best team for each Mega (pick3 sims)',
    );
    expect(md).toContain('**Top Teams**');
    expect(md).toContain('1. Alpha / Beta / Gamma - https://pick3.gg/#/t/mega-great/');
    expect(md).toContain('**Best Team for Each Mega**');
    expect(md).toContain('PvPoke meta only - Oct 6, 2026');
    expect(md).toContain('projection, not a measured win rate');
    expect(md).not.toMatch(/[^\t\n\r\x20-\x7e]/);
  });

  it('leaves the Mega clause out when there is no Mega board', () => {
    expect(postMarkdown(run(false)).split('\n')[0]).toBe(
      'Title: Great League: Mega Edition: top teams and budget builds (pick3 sims)',
    );
  });
});

describe('teams.json', () => {
  it('records the run and every row with its link', () => {
    const j = JSON.parse(teamsJson(run(true)));
    expect(j.league).toBe('mega-great');
    expect(j.pvpoke.commit).toBe('abc123');
    expect(j.resimulated.budget).toEqual(['marowak_alolan']);
    expect(j.boards.top[0].link).toMatch(/^https:\/\/pick3\.gg\/#\/t\/mega-great\//);
    expect(j.boards.mega[0].strength).toBe(90);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/meta/test/postMarkdown.test.ts`
Expected: FAIL, cannot resolve `../scripts/post/markdown.js`.

- [ ] **Step 3: Implement**

Create `apps/meta/scripts/post/markdown.ts`:

```ts
/** The post body Travis pastes under the images, and the raw record of the run. */
import { teamLink } from '@pickthree/engine';
import type { BoardId } from './fill.js';

export interface PostTeam {
  species: [string, string, string];
  /** Full species names, e.g. "Kingdra (Shadow)", in battle order. */
  names: [string, string, string];
  /** Move ids per member, fast first. */
  moves: [string[], string[], string[]];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  structure: string;
  exposure: string[];
}

export interface PostBoard {
  id: BoardId;
  heading: string;
  teams: PostTeam[];
}

export interface PostRun {
  leagueId: string;
  cupTitle: string;
  day: Date;
  mixLine: string;
  pvpoke: { commit: string; date: string };
  weights: 'prior' | 'blend';
  resimulated: Record<string, string[]>;
  boards: PostBoard[];
}

export function linkOf(leagueId: string, t: PostTeam): string {
  return teamLink(
    leagueId,
    t.species.map((speciesId, i) => {
      const [fast, ...charged] = t.moves[i]!;
      return { speciesId, moves: { fast: fast!, charged } };
    }),
  );
}

export function postMarkdown(run: PostRun): string {
  const hasMega = run.boards.some((b) => b.id === 'mega');
  const what = hasMega
    ? 'top teams, budget builds and the best team for each Mega'
    : 'top teams and budget builds';
  const lines = [
    `Title: ${run.cupTitle}: ${what} (pick3 sims)`,
    '',
    `Whole teams, not single Pokemon: each row is a complete team in battle order (lead, switch, closer), ranked by projected strength against the ${run.cupTitle} meta.`,
    'Every link opens the full analysis on pick3.gg, run against your own Pokemon if you have imported them.',
  ];
  for (const b of run.boards) {
    lines.push('', `**${b.heading}**`, '');
    b.teams.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.names.join(' / ')} - ${linkOf(run.leagueId, t)}`);
    });
  }
  lines.push(
    '',
    `How the number works: pick3 simulates each team against the ${run.cupTitle} meta, weighted by what players face (${run.mixLine}). It is a projection, not a measured win rate. PvPoke data from ${run.pvpoke.date}.`,
    '',
  );
  return lines.join('\n');
}

export function teamsJson(run: PostRun): string {
  const boards: Record<string, unknown[]> = {};
  for (const b of run.boards) {
    boards[b.id] = b.teams.map((t) => ({ ...t, link: linkOf(run.leagueId, t) }));
  }
  return `${JSON.stringify(
    {
      league: run.leagueId,
      cup: run.cupTitle,
      day: run.day.toISOString(),
      weights: run.weights,
      mix: run.mixLine,
      pvpoke: run.pvpoke,
      resimulated: run.resimulated,
      boards,
    },
    null,
    2,
  )}\n`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/meta/test/postMarkdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/meta/scripts/post/markdown.ts apps/meta/test/postMarkdown.test.ts
git commit -m "Meta: cup-board post body and run record"
```

---

### Task 10: The post command, capture, and a real run

**Files:**
- Create: `apps/meta/scripts/post/post.ts`
- Modify: `apps/meta/package.json` (script + devDependency)
- Modify: `package.json` (root script)
- Output (committed by Travis after review, not by this task): `posts/<date>-colormega/`

**Interfaces:**
- Consumes: everything above; `PvPokeSimulator`, `loadPvPokeInNode` from `@pickthree/sim-pvpoke`; `priorWeights` from `../bake.js`; `GameDataIndex` from `@pickthree/engine`; `readEpochs`, `resolveWindow` from `@pickthree/engine/meta`; `puppeteer-core`.
- Produces: `npm run post -- <league> [--prior] [--date YYYY-MM-DD]`.

- [ ] **Step 1: Wire the scripts and dependency**

In `apps/meta/package.json` add to `"scripts"`:

```json
    "post": "tsx scripts/post/post.ts",
```

and to `"devDependencies"`:

```json
    "@pickthree/sim-pvpoke": "0.0.0",
```

In the root `package.json` add to `"scripts"`:

```json
    "post": "npm -w @pickthree/meta run post --",
```

Run: `npm install`
Expected: lockfile updates the workspace link only; no new registry packages.

- [ ] **Step 2: Write post.ts**

Create `apps/meta/scripts/post/post.ts`:

```ts
/**
 * npm run post -- <league> [--prior] [--date YYYY-MM-DD]
 *
 * Runs the engine for one cup on production data and writes posts/<date>-<league>/: top.png,
 * budget.png, mega.png (Mega leagues), post.md and teams.json. Spec:
 * docs/superpowers/specs/2026-09-30-cup-team-boards-design.md. Nothing is posted or committed.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import {
  GameDataIndex,
  cautionNames,
  cupBoards,
  memberDisplay,
  type BoardRow,
} from '@pickthree/engine';
import { readEpochs, resolveWindow } from '@pickthree/engine/meta';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { priorWeights } from '../bake.js';
import { loadCupData } from './data.js';
import { assertAscii, fillBoards, type BoardId, type BoardView, type MemberView, type RowView } from './fill.js';
import { postMarkdown, teamsJson, type PostBoard, type PostTeam } from './markdown.js';
import { blendedWeights, fetchSummary, mixLine, runLabel, type WeightMix } from './weights.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..', '..');
const ROLES = ['LEAD', 'SWITCH', 'CLOSER'] as const;
const HEADINGS: Record<BoardId, string> = {
  top: 'Top Teams',
  budget: 'Budget Builds - No Elite TM',
  mega: 'Best Team for Each Mega',
};
const MASCOT: Record<BoardId, string> = {
  top: 'mascot-pointing.png',
  budget: 'mascot-thinking.png',
  mega: 'mascot-fingerguns.png',
};

function parseArgs(argv: string[]): { league: string; prior: boolean; date: string | null } {
  const league = argv.find((a) => !a.startsWith('--'));
  if (!league) {
    throw new Error('Usage: npm run post -- <league> [--prior] [--date YYYY-MM-DD]');
  }
  const at = argv.indexOf('--date');
  const date = at >= 0 ? (argv[at + 1] ?? null) : null;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`--date wants YYYY-MM-DD, got "${date}"`);
  }
  return { league, prior: argv.includes('--prior'), date };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = args.date ? new Date(`${args.date}T12:00:00Z`) : new Date();
  const day = now.toISOString().slice(0, 10);

  const data = await loadCupData(args.league);
  const index = new GameDataIndex(data.pokemon, data.moves);

  let weights: ReadonlyMap<string, number>;
  let mix: WeightMix;
  if (args.prior) {
    weights = priorWeights(data.rankings.overall, data.matrix.opponents);
    mix = { kind: 'prior' };
  } else {
    const w = resolveWindow(
      'meta',
      { league: data.league.id, seasons: data.seasons, epochs: readEpochs(data.epochs) },
      now,
    );
    const summary = await fetchSummary(data.league.id, w);
    weights = blendedWeights(summary, data);
    mix = { kind: 'blend', battles: summary.battles, events: summary.tournament?.events ?? 0 };
  }

  const mega = data.schedule.some((e) => e.league === data.league.id && e.mega === true);
  const sim = new PvPokeSimulator(loadPvPokeInNode(data.gameMaster));
  const boards = cupBoards({
    league: data.league,
    index,
    matrix: data.matrix,
    rankings: data.rankings,
    gameMaster: data.gameMaster,
    weights,
    sim,
    mega,
  });

  const nameOf = (id: string): string =>
    memberDisplay(index.mustSpecies(id).speciesName, id).name;
  const memberView = (row: BoardRow, j: number): MemberView => {
    const c = row.members[j]!;
    const id = c.build.speciesId;
    const sp = index.mustSpecies(id);
    const d = memberDisplay(sp.speciesName, id);
    return {
      role: ROLES[j]!,
      name: d.name,
      sprite: d.sprite,
      type: sp.types[0],
      tags: [
        ...d.tags,
        ...(c.moveset.eliteTmCount > 0 ? [{ kind: 'elite' as const, text: 'Elite TM' }] : []),
      ],
      moves: [c.moveset.fast.name, ...c.moveset.charged.map((m) => m.name)] as [string, string, ...string[]],
      hero: row.megaId === id,
    };
  };
  const rowView = (row: BoardRow): RowView => ({
    strength: row.team.strength,
    members: [memberView(row, 0), memberView(row, 1), memberView(row, 2)],
    caution: cautionNames(row.team.exposure, nameOf),
  });
  const postTeam = (row: BoardRow): PostTeam => ({
    species: row.team.species,
    names: row.members.map((c) => index.mustSpecies(c.build.speciesId).speciesName) as [string, string, string],
    moves: row.members.map((c) => [c.moveset.fast.moveId, ...c.moveset.charged.map((m) => m.moveId)]) as [
      string[],
      string[],
      string[],
    ],
    strength: row.team.strength,
    coverage: row.team.coverage,
    consistency: row.team.consistency,
    safety: row.team.safety,
    structure: row.team.structure,
    exposure: row.team.exposure,
  });

  const title = data.league.title;
  const label = runLabel(data.schedule, data.league.id, now);
  const source: [string, string, string] = [
    `Strength: pick3 sims vs the ${title} meta`,
    mixLine(mix, now),
    'Full analysis of every team: links in the post',
  ];
  const mascot = (id: BoardId): string =>
    `data:image/png;base64,${readFileSync(join(here, 'assets', MASCOT[id])).toString('base64')}`;
  const present: [BoardId, BoardRow[]][] = [
    ['top', boards.top],
    ['budget', boards.budget],
    ...(boards.mega && boards.mega.length > 0 ? [['mega', boards.mega] as [BoardId, BoardRow[]]] : []),
  ];
  const views: BoardView[] = present.map(([id, rows]) => ({
    id,
    title,
    label,
    source,
    mascot: mascot(id),
    rows: rows.map(rowView),
  }));

  const html = fillBoards(readFileSync(join(here, 'template.html'), 'utf8'), views);
  assertAscii(html);

  const outDir = join(REPO, 'posts', `${day}-${data.league.id}`);
  const tmp = join(tmpdir(), `pick3-post-${process.pid}.html`);
  writeFileSync(tmp, html);
  const pngs = new Map<BoardId, Uint8Array>();
  const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-first-run', '--disable-gpu'],
  });
  try {
    for (const [id] of present) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
      await page.goto(`${pathToFileURL(tmp).href}#${id}`, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const broken = await page.evaluate((board: string) => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(`#${board} img`));
        return imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src.slice(0, 80));
      }, id);
      if (broken.length > 0) {
        throw new Error(`Images failed to load on the ${id} board: ${broken.join(', ')}`);
      }
      pngs.set(id, await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } }));
      await page.close();
    }
  } finally {
    await browser.close();
    rmSync(tmp, { force: true });
  }

  const postBoards: PostBoard[] = present.map(([id, rows]) => ({
    id,
    heading: HEADINGS[id],
    teams: rows.map(postTeam),
  }));
  const run = {
    leagueId: data.league.id,
    cupTitle: title,
    day: now,
    mixLine: source[1],
    pvpoke: { commit: data.manifest.pvpokeCommit, date: data.manifest.pvpokeDate },
    weights: mix.kind,
    resimulated: boards.resimulated,
    boards: postBoards,
  };
  const markdown = postMarkdown(run);
  assertAscii(markdown);

  mkdirSync(outDir, { recursive: true });
  for (const [id, png] of pngs) {
    writeFileSync(join(outDir, `${id}.png`), png);
  }
  writeFileSync(join(outDir, 'post.md'), markdown);
  writeFileSync(join(outDir, 'teams.json'), teamsJson(run));
  process.stdout.write(
    `wrote ${outDir}: ${[...pngs.keys()].map((k) => `${k}.png`).join(', ')}, post.md, teams.json\n` +
      `re-simulated rows: top ${boards.resimulated.top.length}, budget ${boards.resimulated.budget.length}, mega ${boards.resimulated.mega.length}\n`,
  );
}

await main().catch((err: unknown) => {
  process.stderr.write(`post failed: ${(err as Error).message}\n`);
  process.exit(1);
});
```

Everything is computed and captured before `outDir` is written, so a failure writes nothing.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. If `page.screenshot` returns `Buffer` in this puppeteer-core version, the `Map<BoardId, Uint8Array>` still accepts it (Buffer extends Uint8Array).

- [ ] **Step 4: Real run on Mega Color Cup**

Run: `npm run post -- colormega`
Expected: `wrote ...\posts\<today>-colormega: top.png, budget.png, mega.png, post.md, teams.json` and a nonzero budget re-simulation count. Takes well under a minute.

Open the three PNGs and check by eye, against the spike's findings:
- No Pokemon on more than two rows of any image.
- Budget rows show no Elite TM tag, and their strengths differ from the Top board's where moves changed.
- The Mega board has a different Mega on every row, each with the BUILD AROUND badge.
- Mascot pose per board, torso crop, not covering a row.
- Corner label reads `LIVE SEP 22 - OCT 6` style dates; no "SAMPLE DATA".
- Source line says `PvPoke meta only` (Color Cup had no shared battles) with today's date.
- A row with three tags does not overflow its column.

Open `post.md`: every link opens on pick3.gg to the team analysis (try two, one with a Shadow and one with a Mega).

Run: `npm run post -- mega-great`
Expected: fails with the meta read error naming `--prior` (the worker rejects the hyphenated id).

Run: `npm run post -- mega-great --prior`
Expected: writes `posts/<today>-mega-great/`, and a link from its `post.md` opens on pick3.gg (this exercises Task 1's hyphen fix once the web app with it is deployed; before deploy, verify with the local dev server: `npm -w @pickthree/web run dev`, then open `http://localhost:5173/<path after pick3.gg/>`).

Run: `npm run post -- nosuchleague`
Expected: `post failed: pick3.gg has no league "nosuchleague". Leagues: ...` and exit code 1, nothing written.

- [ ] **Step 5: Full suite and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass.

```bash
git add apps/meta/scripts/post/post.ts apps/meta/package.json package.json package-lock.json
git commit -m "Meta: npm run post renders cup boards and the post body for a league"
```

The `posts/` output from the real runs is left uncommitted for Travis to review and commit with the post he makes.
