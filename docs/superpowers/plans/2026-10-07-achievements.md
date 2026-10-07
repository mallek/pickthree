# Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the starter 11 achievements: worked out on the phone from the battle log, each
earning a random Kanto Pokemon (shiny odds by season streak), shown on an achievements page with
a Kanto dex, a toast, a welcome reveal, three ways in, a nudge and a share image.

**Architecture:** Pure rules in `packages/engine/src/achievements/` (facts from the log,
definitions, evaluate, the Kanto tier table, the roll). The web app keeps earned records in a new
IndexedDB store, runs the evaluation in an `AchievementsProvider` mounted inside `AppProvider`
(watching `logVersion`, the collection and the analysis), and renders the page, toast and reveal
from `packages/ui` parts and the signed pages' classes. The data build adds Kanto shiny sprites.

**Tech Stack:** TypeScript 5.9 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
React 19, `idb`, vitest 4 + jsdom + Testing Library + fake-indexeddb, sharp (data build).

**Spec:** `docs/superpowers/specs/2026-10-07-achievements-design.md`. Read it first. Layout
source: branch `mock/achievements` (worktree `D:/Skunkworks/pickthree-mock-ach`), file
`apps/web/src/screens/AchievementsMock.tsx` and its diffs to `app.css`, `MetaHome.tsx`,
`YourBattles.tsx`, `settings/Settings.tsx`, `settings/glyphs.tsx`, `packages/ui/tokens.css`. Port
markup from there; never merge that branch.

## Global Constraints

- No em dashes anywhere (code, comments, docs, commits, UI copy). eslint rejects em dash literals.
- Braces on all control flow, even single-line bodies (`curly: all`), `eqeqeq`.
- Exact pinned versions; no new dependencies are needed by this plan.
- UI copy is plain 7-bit ASCII, "Pokemon" without the accent, as in the approved mocks.
- No new color literals outside `packages/ui/tokens.css`; `npm run check-colors` must pass.
- `engine` never imports DOM, storage or `sim-pvpoke`.
- Nothing in this feature makes a network call except reading the app's own `/data/*` files.
- Tests use synthetic data only; no pinned PvPoke values.
- Stage explicit paths when committing, never `git add -A`. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MDwu13cfyL9toB63Y8efAJ
  ```
- Work in the worktree `D:/Skunkworks/pickthree-ach` on branch `achievements` (Task 0). Run
  commands from it.

## Review Focus

1. **Two evaluations racing** (StrictMode double effects, a battle logged while boot evaluation
   runs, an import right after a log): the same achievement must never be rolled twice. Every
   evaluation runs through one promise chain and re-reads the stored record inside it. Test in
   Task 5.
2. **A league with no meta file, or offline** (`/data/meta/<league>.json` 404s or fetch throws):
   no error, no toast, Meta player simply not earned for that league, retried on the next
   evaluation. Test in Task 5.
3. **Seasons list empty or now before the first season**: no crash, season achievements show
   `0 of N`, streaks are 0. Test in Task 2.
4. **A tampered or foreign export file** (achievements block with junk, a non-Kanto species, a
   missing field): bad entries are dropped, good ones kept, the battle import still works. Test in
   Task 4.
5. **The reveal or toast covering screens in automation** (`web:screens` logs battles and imports
   a collection, which now earns achievements): the screens script must dismiss the reveal and the
   toast before its own captures, and the CI console-error gate must stay clean. Handled in Task 9.

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree and branch**

```bash
git -C D:/Skunkworks/pickthree worktree add D:/Skunkworks/pickthree-ach -b achievements main
cd D:/Skunkworks/pickthree-ach
npm ci
```

- [ ] **Step 2: Copy the built data (gitignored) so web tests and screens have it**

```bash
cp -r D:/Skunkworks/pickthree/apps/web/public/data D:/Skunkworks/pickthree-ach/apps/web/public/data
```

- [ ] **Step 3: Baseline**

Run: `npm run typecheck && npm test`
Expected: all pass. If anything fails before any change, stop and report it.

---

### Task 1: Engine types, the Kanto tier table and the roll

**Files:**
- Create: `packages/engine/src/achievements/types.ts`
- Create: `packages/engine/src/achievements/kanto.ts`
- Create: `packages/engine/src/achievements/roll.ts`
- Create: `packages/engine/src/achievements/index.ts`
- Modify: `packages/engine/src/index.ts` (add one export line after `./yourmeta/index.js`)
- Test: `packages/engine/test/achievements/kanto.test.ts`, `packages/engine/test/achievements/roll.test.ts`

**Interfaces:**
- Produces: `AchievementTier`, `TIERS`, `EarnedAchievement`, `AchievementsRecord`,
  `EMPTY_ACHIEVEMENTS`, `KantoEntry`, `KANTO`, `KANTO_IDS`, `shinyOdds(tier, streak)`,
  `roll(tier, owned, streak, rng)`.

- [ ] **Step 1: Write `types.ts`**

```ts
/** How hard an achievement is, which decides the pool its Pokemon is drawn from. */
export type AchievementTier = 'easy' | 'mid' | 'hard' | 'elite' | 'top';

export const TIERS: readonly AchievementTier[] = ['easy', 'mid', 'hard', 'elite', 'top'];

/** One achievement this phone has earned, with the Pokemon it rolled. Kept for good. */
export interface EarnedAchievement {
  id: string;
  /** ISO time it was earned. */
  earnedAt: string;
  /** PvPoke species id of the Kanto Pokemon it rolled. */
  species: string;
  shiny: boolean;
}

/** Everything stored about achievements: what was earned and the one-time event marks. */
export interface AchievementsRecord {
  earned: EarnedAchievement[];
  /** Actions with no history behind them, such as `analyzed`. */
  marks: string[];
}

export const EMPTY_ACHIEVEMENTS: AchievementsRecord = { earned: [], marks: [] };
```

- [ ] **Step 2: Write `kanto.ts`**

The tier rule (spec, Rewards): easy is the unevolved member of a family that evolves; mid is an
evolved form that is not the end of a three stage line, and the end of a two stage line; hard is
the end of a three stage line and the standalones, plus Gyarados and the Eeveelutions moved up by
hand; elite is the three birds; top is Mewtwo and Mew. Lines count Kanto members only.

```ts
import type { AchievementTier } from './types.js';

export interface KantoEntry {
  /** PvPoke species id (also the sprite file name). */
  id: string;
  dex: number;
  tier: AchievementTier;
}

/**
 * Kanto's 151 in dex order with the tier each one is drawn in. Hand kept: move an entry to change
 * how rare a Pokemon is. Mewtwo and Mew are top and only top achievements draw them.
 */
const TABLE: readonly [string, AchievementTier][] = [
  ['bulbasaur', 'easy'], ['ivysaur', 'mid'], ['venusaur', 'hard'],
  ['charmander', 'easy'], ['charmeleon', 'mid'], ['charizard', 'hard'],
  ['squirtle', 'easy'], ['wartortle', 'mid'], ['blastoise', 'hard'],
  ['caterpie', 'easy'], ['metapod', 'mid'], ['butterfree', 'hard'],
  ['weedle', 'easy'], ['kakuna', 'mid'], ['beedrill', 'hard'],
  ['pidgey', 'easy'], ['pidgeotto', 'mid'], ['pidgeot', 'hard'],
  ['rattata', 'easy'], ['raticate', 'mid'],
  ['spearow', 'easy'], ['fearow', 'mid'],
  ['ekans', 'easy'], ['arbok', 'mid'],
  ['pikachu', 'easy'], ['raichu', 'mid'],
  ['sandshrew', 'easy'], ['sandslash', 'mid'],
  ['nidoran_female', 'easy'], ['nidorina', 'mid'], ['nidoqueen', 'hard'],
  ['nidoran_male', 'easy'], ['nidorino', 'mid'], ['nidoking', 'hard'],
  ['clefairy', 'easy'], ['clefable', 'mid'],
  ['vulpix', 'easy'], ['ninetales', 'mid'],
  ['jigglypuff', 'easy'], ['wigglytuff', 'mid'],
  ['zubat', 'easy'], ['golbat', 'mid'],
  ['oddish', 'easy'], ['gloom', 'mid'], ['vileplume', 'hard'],
  ['paras', 'easy'], ['parasect', 'mid'],
  ['venonat', 'easy'], ['venomoth', 'mid'],
  ['diglett', 'easy'], ['dugtrio', 'mid'],
  ['meowth', 'easy'], ['persian', 'mid'],
  ['psyduck', 'easy'], ['golduck', 'mid'],
  ['mankey', 'easy'], ['primeape', 'mid'],
  ['growlithe', 'easy'], ['arcanine', 'mid'],
  ['poliwag', 'easy'], ['poliwhirl', 'mid'], ['poliwrath', 'hard'],
  ['abra', 'easy'], ['kadabra', 'mid'], ['alakazam', 'hard'],
  ['machop', 'easy'], ['machoke', 'mid'], ['machamp', 'hard'],
  ['bellsprout', 'easy'], ['weepinbell', 'mid'], ['victreebel', 'hard'],
  ['tentacool', 'easy'], ['tentacruel', 'mid'],
  ['geodude', 'easy'], ['graveler', 'mid'], ['golem', 'hard'],
  ['ponyta', 'easy'], ['rapidash', 'mid'],
  ['slowpoke', 'easy'], ['slowbro', 'mid'],
  ['magnemite', 'easy'], ['magneton', 'mid'],
  ['farfetchd', 'hard'],
  ['doduo', 'easy'], ['dodrio', 'mid'],
  ['seel', 'easy'], ['dewgong', 'mid'],
  ['grimer', 'easy'], ['muk', 'mid'],
  ['shellder', 'easy'], ['cloyster', 'mid'],
  ['gastly', 'easy'], ['haunter', 'mid'], ['gengar', 'hard'],
  ['onix', 'hard'],
  ['drowzee', 'easy'], ['hypno', 'mid'],
  ['krabby', 'easy'], ['kingler', 'mid'],
  ['voltorb', 'easy'], ['electrode', 'mid'],
  ['exeggcute', 'easy'], ['exeggutor', 'mid'],
  ['cubone', 'easy'], ['marowak', 'mid'],
  ['hitmonlee', 'hard'], ['hitmonchan', 'hard'], ['lickitung', 'hard'],
  ['koffing', 'easy'], ['weezing', 'mid'],
  ['rhyhorn', 'easy'], ['rhydon', 'mid'],
  ['chansey', 'hard'], ['tangela', 'hard'], ['kangaskhan', 'hard'],
  ['horsea', 'easy'], ['seadra', 'mid'],
  ['goldeen', 'easy'], ['seaking', 'mid'],
  ['staryu', 'easy'], ['starmie', 'mid'],
  ['mr_mime', 'hard'], ['scyther', 'hard'], ['jynx', 'hard'], ['electabuzz', 'hard'],
  ['magmar', 'hard'], ['pinsir', 'hard'], ['tauros', 'hard'],
  ['magikarp', 'easy'], ['gyarados', 'hard'],
  ['lapras', 'hard'], ['ditto', 'hard'],
  ['eevee', 'easy'], ['vaporeon', 'hard'], ['jolteon', 'hard'], ['flareon', 'hard'],
  ['porygon', 'hard'],
  ['omanyte', 'easy'], ['omastar', 'mid'],
  ['kabuto', 'easy'], ['kabutops', 'mid'],
  ['aerodactyl', 'hard'], ['snorlax', 'hard'],
  ['articuno', 'elite'], ['zapdos', 'elite'], ['moltres', 'elite'],
  ['dratini', 'easy'], ['dragonair', 'mid'], ['dragonite', 'hard'],
  ['mewtwo', 'top'], ['mew', 'top'],
];

export const KANTO: readonly KantoEntry[] = TABLE.map(([id, tier], i) => ({ id, dex: i + 1, tier }));

export const KANTO_IDS: ReadonlySet<string> = new Set(KANTO.map((k) => k.id));
```

Run prettier on the file after writing it (`npx prettier --write packages/engine/src/achievements/kanto.ts`); the formatter may put one tuple per line, which is fine.

- [ ] **Step 3: Write the failing tests `packages/engine/test/achievements/kanto.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { KANTO } from '../../src/achievements/kanto.js';

describe('Kanto tier table', () => {
  it('holds exactly dex 1 to 151, each id once', () => {
    expect(KANTO.map((k) => k.dex)).toEqual(Array.from({ length: 151 }, (_, i) => i + 1));
    expect(new Set(KANTO.map((k) => k.id)).size).toBe(151);
  });

  it('keeps Mewtwo and Mew alone in top and the three birds alone in elite', () => {
    expect(KANTO.filter((k) => k.tier === 'top').map((k) => k.id)).toEqual(['mewtwo', 'mew']);
    expect(KANTO.filter((k) => k.tier === 'elite').map((k) => k.id)).toEqual([
      'articuno',
      'zapdos',
      'moltres',
    ]);
  });

  it('starts the lines in easy and puts their ends above it', () => {
    const tier = (id: string) => KANTO.find((k) => k.id === id)?.tier;
    expect(tier('bulbasaur')).toBe('easy');
    expect(tier('ivysaur')).toBe('mid');
    expect(tier('venusaur')).toBe('hard');
    expect(tier('gyarados')).toBe('hard');
    expect(tier('snorlax')).toBe('hard');
  });
});
```

- [ ] **Step 4: Write `roll.ts`**

```ts
import { KANTO } from './kanto.js';
import type { AchievementTier } from './types.js';

/** Chance of a shiny for a roll in this tier at this season streak. */
export function shinyOdds(tier: AchievementTier, streak: number): number {
  if (tier === 'top') {
    return 1 / 3;
  }
  if (streak >= 3) {
    return 1 / 5;
  }
  if (streak >= 2) {
    return 1 / 10;
  }
  return 1 / 20;
}

const ORDER: readonly AchievementTier[] = ['easy', 'mid', 'hard', 'elite'];

/**
 * The tiers to try, in order, when a pool may be empty: the tier itself, then the nearest tiers
 * below it, then the nearest above it. Top is only ever tried as itself.
 */
export function fallbackOrder(tier: AchievementTier): AchievementTier[] {
  if (tier === 'top') {
    return ['top', 'elite', 'hard', 'mid', 'easy'];
  }
  const i = ORDER.indexOf(tier);
  const below = ORDER.slice(0, i).reverse();
  const above = ORDER.slice(i + 1);
  return [tier, ...below, ...above];
}

function pick<T>(items: readonly T[], rng: () => number): T {
  const i = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[i] as T;
}

/**
 * The Pokemon an achievement hands out: a uniform pick from its tier's Kanto pool minus what the
 * player already holds, falling back through `fallbackOrder` when a pool is empty. If every pool
 * is empty it repeats a species from its own tier rather than fail. `rng` returns [0, 1); the
 * species is drawn first, then the shiny.
 */
export function roll(
  tier: AchievementTier,
  owned: ReadonlySet<string>,
  streak: number,
  rng: () => number,
): { species: string; shiny: boolean } {
  let species: string | null = null;
  for (const t of fallbackOrder(tier)) {
    const pool = KANTO.filter((k) => k.tier === t && !owned.has(k.id));
    if (pool.length > 0) {
      species = pick(pool, rng).id;
      break;
    }
  }
  if (species === null) {
    species = pick(
      KANTO.filter((k) => k.tier === tier),
      rng,
    ).id;
  }
  return { species, shiny: rng() < shinyOdds(tier, streak) };
}
```

- [ ] **Step 5: Write the failing tests `packages/engine/test/achievements/roll.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { KANTO } from '../../src/achievements/kanto.js';
import { fallbackOrder, roll, shinyOdds } from '../../src/achievements/roll.js';

/** A random source that returns the given values in turn, then repeats the last. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] as number;
}

const ids = (tier: string) => KANTO.filter((k) => k.tier === tier).map((k) => k.id);

describe('shiny odds', () => {
  it('rises with the season streak and is a third for top', () => {
    expect(shinyOdds('easy', 0)).toBe(1 / 20);
    expect(shinyOdds('easy', 1)).toBe(1 / 20);
    expect(shinyOdds('mid', 2)).toBe(1 / 10);
    expect(shinyOdds('hard', 3)).toBe(1 / 5);
    expect(shinyOdds('elite', 9)).toBe(1 / 5);
    expect(shinyOdds('top', 0)).toBe(1 / 3);
  });
});

describe('roll', () => {
  it('draws from its own tier and never repeats an owned species', () => {
    const owned = new Set(ids('easy').slice(1));
    const r = roll('easy', owned, 0, seq(0.99, 0.99));
    expect(r.species).toBe(ids('easy')[0]);
    expect(r.shiny).toBe(false);
  });

  it('rolls shiny when the second draw is under the odds', () => {
    expect(roll('mid', new Set(), 2, seq(0, 0.09)).shiny).toBe(true);
    expect(roll('mid', new Set(), 2, seq(0, 0.1)).shiny).toBe(false);
  });

  it('falls to the nearest tier below when its pool is empty, then above', () => {
    expect(fallbackOrder('elite')).toEqual(['elite', 'hard', 'mid', 'easy']);
    expect(fallbackOrder('mid')).toEqual(['mid', 'easy', 'hard', 'elite']);
    const birdsOwned = new Set(ids('elite'));
    expect(ids('hard')).toContain(roll('elite', birdsOwned, 0, seq(0, 0.99)).species);
    const easyOwned = new Set(ids('easy'));
    expect(ids('mid')).toContain(roll('easy', easyOwned, 0, seq(0, 0.99)).species);
  });

  it('never hands out Mewtwo or Mew from a fallback', () => {
    const allButTop = new Set(KANTO.filter((k) => k.tier !== 'top').map((k) => k.id));
    const r = roll('elite', allButTop, 0, seq(0, 0.99));
    expect(['mewtwo', 'mew']).not.toContain(r.species);
    expect(ids('elite')).toContain(r.species);
  });

  it('draws top from Mewtwo and Mew', () => {
    expect(roll('top', new Set(), 0, seq(0, 0.99)).species).toBe('mewtwo');
    expect(roll('top', new Set(['mewtwo']), 0, seq(0, 0.99)).species).toBe('mew');
  });
});
```

- [ ] **Step 6: Write `index.ts` and the engine export**

`packages/engine/src/achievements/index.ts`:

```ts
export * from './types.js';
export * from './kanto.js';
export * from './roll.js';
```

In `packages/engine/src/index.ts`, after `export * from './yourmeta/index.js';` add:

```ts
export * from './achievements/index.js';
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run packages/engine/test/achievements`
Expected: PASS (kanto 3, roll 5).

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck && npx eslint packages/engine/src/achievements packages/engine/test/achievements
git add packages/engine/src/achievements/types.ts packages/engine/src/achievements/kanto.ts packages/engine/src/achievements/roll.ts packages/engine/src/achievements/index.ts packages/engine/src/index.ts packages/engine/test/achievements/kanto.test.ts packages/engine/test/achievements/roll.test.ts
git commit -m "Engine: achievements types, the Kanto tier table and the roll"
```
(with the attribution lines from Global Constraints)

---

### Task 2: Engine facts, definitions and evaluation

**Files:**
- Create: `packages/engine/src/achievements/facts.ts`
- Create: `packages/engine/src/achievements/definitions.ts`
- Create: `packages/engine/src/achievements/evaluate.ts`
- Modify: `packages/engine/src/achievements/index.ts`
- Test: `packages/engine/test/achievements/facts.test.ts`, `packages/engine/test/achievements/evaluate.test.ts`

**Interfaces:**
- Consumes: `BattleSet`, `LoggedBattle`, `Season`, `SET_SIZE` from `../yourmeta/types.js`;
  `AchievementTier` from Task 1.
- Produces:
  - `DAILY_CAP = 25`, `YOUR_META_BATTLES = 15`
  - `interface FactsInput { sets: readonly BattleSet[]; seasons: readonly Season[]; metaGroups: Readonly<Record<string, readonly string[]>>; hasCollection: boolean; marks: readonly string[]; now: Date }`
  - `interface AchievementFacts { hasCollection: boolean; marks: ReadonlySet<string>; countedBattles: number; distinctDays: number; fullSet: boolean; metaPlayer: boolean; cupRunner: boolean; seasonStreak: Streak; yourMetaStreak: Streak }`, `interface Streak { best: number; current: number }`
  - `buildFacts(input: FactsInput): AchievementFacts`, `dayKey(iso: string): string`, `streakOf(hit: ReadonlySet<number>, currentIdx: number | null): Streak`
  - `interface AchievementDef { id; name; howTo; tier; mark?: string; unit?: readonly [string, string]; test(f): boolean; progress(f): { have: number; need: number } }`
  - `ACHIEVEMENTS: readonly AchievementDef[]`
  - `interface AchievementStatus { def: AchievementDef; earned: boolean; have: number; need: number }`
  - `newlyEarned(facts, earnedIds, defs?): AchievementDef[]`, `statusAll(facts, earnedIds, defs?): AchievementStatus[]`, `nearest(facts, earnedIds, defs?): AchievementStatus | null`, `nudgeLine(s: AchievementStatus): string`

- [ ] **Step 1: Write `facts.ts`**

```ts
import { SET_SIZE, type BattleSet, type LoggedBattle, type Season } from '../yourmeta/types.js';

/** At most this many battles count per day: GO's five sets of five. */
export const DAILY_CAP = 25;
/** Battles in one league within one season that unlock Your meta (the blend's minBattles). */
export const YOUR_META_BATTLES = 15;

export interface FactsInput {
  /** Every set in every league. */
  sets: readonly BattleSet[];
  seasons: readonly Season[];
  /** League id to the species ids of that league's meta group. A missing league has none. */
  metaGroups: Readonly<Record<string, readonly string[]>>;
  /** True when the phone holds at least one Pokemon (imported or added by hand). */
  hasCollection: boolean;
  marks: readonly string[];
  now: Date;
}

/** A run of consecutive seasons: the longest ever and the one alive now. */
export interface Streak {
  best: number;
  current: number;
}

export interface AchievementFacts {
  hasCollection: boolean;
  marks: ReadonlySet<string>;
  /** Battles that count, after the daily cap. Tanked battles never count. */
  countedBattles: number;
  /** Local calendar days with at least one counted battle. */
  distinctDays: number;
  /** Some set holds five battles (tanked ones included: the set was played). */
  fullSet: boolean;
  /** Some set with a counted battle has all three of its team in its league's meta group. */
  metaPlayer: boolean;
  /** Some set with a counted battle is outside Great League. */
  cupRunner: boolean;
  /** Seasons with at least one counted battle. */
  seasonStreak: Streak;
  /** Seasons where Your meta unlocked in some league. */
  yourMetaStreak: Streak;
}

/** The device's local calendar date of an ISO time. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * The longest run of consecutive indices in `hit`, and the run counting back from `currentIdx`.
 * If the current season has no hit yet, the run ending at the season before it is still alive.
 */
export function streakOf(hit: ReadonlySet<number>, currentIdx: number | null): Streak {
  let best = 0;
  for (const i of hit) {
    if (!hit.has(i - 1)) {
      let n = 1;
      while (hit.has(i + n)) {
        n += 1;
      }
      best = Math.max(best, n);
    }
  }
  let current = 0;
  if (currentIdx !== null) {
    let i = hit.has(currentIdx) ? currentIdx : currentIdx - 1;
    while (hit.has(i)) {
      current += 1;
      i -= 1;
    }
  }
  return { best, current };
}

interface Counted {
  battle: LoggedBattle;
  league: string;
}

/** Non-tanked battles, at most DAILY_CAP per local day, the earliest of each day kept. */
function capped(sets: readonly BattleSet[]): Counted[] {
  const all: Counted[] = [];
  for (const s of sets) {
    for (const b of s.battles) {
      if (!b.tanked) {
        all.push({ battle: b, league: s.league });
      }
    }
  }
  all.sort((a, b) => Date.parse(a.battle.at) - Date.parse(b.battle.at));
  const perDay = new Map<string, number>();
  const out: Counted[] = [];
  for (const c of all) {
    const k = dayKey(c.battle.at);
    const n = perDay.get(k) ?? 0;
    if (n < DAILY_CAP) {
      perDay.set(k, n + 1);
      out.push(c);
    }
  }
  return out;
}

/** Index into `sorted` of the latest season starting at or before `t`, or null before them all. */
function seasonIndex(sorted: readonly Season[], t: number): number | null {
  let idx: number | null = null;
  sorted.forEach((s, i) => {
    if (Date.parse(s.start) <= t) {
      idx = i;
    }
  });
  return idx;
}

export function buildFacts(input: FactsInput): AchievementFacts {
  const sorted = [...input.seasons].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const counted = capped(input.sets);
  const days = new Set(counted.map((c) => dayKey(c.battle.at)));
  const logged = new Set<number>();
  const perSeasonLeague = new Map<string, number>();
  const yourMeta = new Set<number>();
  for (const c of counted) {
    const idx = seasonIndex(sorted, Date.parse(c.battle.at));
    if (idx === null) {
      continue;
    }
    logged.add(idx);
    const key = `${idx}|${c.league}`;
    const n = (perSeasonLeague.get(key) ?? 0) + 1;
    perSeasonLeague.set(key, n);
    if (n >= YOUR_META_BATTLES) {
      yourMeta.add(idx);
    }
  }
  const played = input.sets.filter((s) => s.battles.some((b) => !b.tanked));
  const inGroup = (s: BattleSet): boolean => {
    const group = input.metaGroups[s.league];
    return group !== undefined && s.team.species.every((id) => group.includes(id));
  };
  const currentIdx = seasonIndex(sorted, input.now.getTime());
  return {
    hasCollection: input.hasCollection,
    marks: new Set(input.marks),
    countedBattles: counted.length,
    distinctDays: days.size,
    fullSet: input.sets.some((s) => s.battles.length >= SET_SIZE),
    metaPlayer: played.some(inGroup),
    cupRunner: played.some((s) => s.league !== 'great'),
    seasonStreak: streakOf(logged, currentIdx),
    yourMetaStreak: streakOf(yourMeta, currentIdx),
  };
}
```

- [ ] **Step 2: Write the failing tests `packages/engine/test/achievements/facts.test.ts`**

Build ISO times with the local-time `Date` constructor so day keys do not depend on the test
machine's zone.

```ts
import { describe, expect, it } from 'vitest';
import type { BattleSet, LoggedBattle, Season } from '../../src/yourmeta/types.js';
import { buildFacts, DAILY_CAP, streakOf, type FactsInput } from '../../src/achievements/facts.js';

/** Local noon on a day, plus minutes, as an ISO string. */
function at(y: number, m: number, d: number, min = 0): string {
  return new Date(y, m - 1, d, 12, min).toISOString();
}

function battle(id: string, when: string, tanked = false): LoggedBattle {
  return { id, at: when, opponents: [], result: tanked ? null : 'win', tanked };
}

function set(id: string, battles: LoggedBattle[], league = 'great', species = ['a', 'b', 'c']): BattleSet {
  return {
    id,
    league,
    startedAt: battles[0]?.at ?? at(2026, 9, 10),
    team: { species: species as [string, string, string] },
    battles,
    closed: battles.length >= 5,
  };
}

const SEASONS: Season[] = [
  { id: 28, name: 'S28', start: at(2026, 9, 1) },
  { id: 29, name: 'S29', start: at(2026, 12, 1) },
  { id: 30, name: 'S30', start: at(2027, 3, 1) },
];

function input(over: Partial<FactsInput>): FactsInput {
  return {
    sets: [],
    seasons: SEASONS,
    metaGroups: {},
    hasCollection: false,
    marks: [],
    now: new Date(at(2026, 9, 20)),
    ...over,
  };
}

describe('buildFacts', () => {
  it('counts at most 25 battles a day and never a tanked one', () => {
    const many = Array.from({ length: 40 }, (_, i) => battle(`b${i}`, at(2026, 9, 10, i)));
    const f = buildFacts(input({ sets: [set('s', [...many, battle('t', at(2026, 9, 11), true)])] }));
    expect(f.countedBattles).toBe(DAILY_CAP);
    expect(f.distinctDays).toBe(1);
  });

  it('counts distinct local days', () => {
    const f = buildFacts(
      input({
        sets: [
          set('a', [battle('1', at(2026, 9, 10)), battle('2', at(2026, 9, 10, 30))]),
          set('b', [battle('3', at(2026, 9, 12))]),
        ],
      }),
    );
    expect(f.distinctDays).toBe(2);
  });

  it('marks a full set, a cup set and a meta set', () => {
    const five = Array.from({ length: 5 }, (_, i) => battle(`f${i}`, at(2026, 9, 10, i)));
    const f = buildFacts(
      input({
        sets: [
          set('full', five),
          set('cup', [battle('c', at(2026, 9, 11))], 'ultra', ['x', 'y', 'z']),
        ],
        metaGroups: { ultra: ['x', 'y', 'z', 'w'] },
      }),
    );
    expect(f.fullSet).toBe(true);
    expect(f.cupRunner).toBe(true);
    expect(f.metaPlayer).toBe(true);
  });

  it('does not count a meta set with only a tanked battle, or a league with no group', () => {
    const f = buildFacts(
      input({
        sets: [
          set('t', [battle('t', at(2026, 9, 10), true)], 'great', ['x', 'y', 'z']),
          set('n', [battle('n', at(2026, 9, 10))], 'little', ['x', 'y', 'z']),
        ],
        metaGroups: { great: ['x', 'y', 'z'] },
      }),
    );
    expect(f.metaPlayer).toBe(false);
  });

  it('unlocks Your meta at 15 counted battles in one league in one season', () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => battle(`g${i}`, at(2026, 9, 10, i)));
    const one = [battle('u', at(2026, 9, 10, 50))];
    const f14 = buildFacts(input({ sets: [set('g', fourteen), set('u', one, 'ultra')] }));
    expect(f14.yourMetaStreak.best).toBe(0);
    const f15 = buildFacts(input({ sets: [set('g', [...fourteen, battle('g15', at(2026, 9, 11))])] }));
    expect(f15.yourMetaStreak).toEqual({ best: 1, current: 1 });
  });

  it('keeps the streak alive before the first battle of a new season', () => {
    const sets = [
      set('a', [battle('1', at(2026, 9, 10))]),
      set('b', [battle('2', at(2026, 12, 10))]),
    ];
    expect(buildFacts(input({ sets, now: new Date(at(2026, 12, 20)) })).seasonStreak).toEqual({
      best: 2,
      current: 2,
    });
    expect(buildFacts(input({ sets, now: new Date(at(2027, 3, 5)) })).seasonStreak).toEqual({
      best: 2,
      current: 2,
    });
  });

  it('breaks the streak across a season with no battles', () => {
    const sets = [
      set('a', [battle('1', at(2026, 9, 10))]),
      set('c', [battle('3', at(2027, 3, 10))]),
    ];
    expect(buildFacts(input({ sets, now: new Date(at(2027, 3, 20)) })).seasonStreak).toEqual({
      best: 1,
      current: 1,
    });
  });

  it('survives no seasons and battles before the first season', () => {
    const sets = [set('a', [battle('1', at(2026, 8, 1))])];
    const none = buildFacts(input({ sets, seasons: [] }));
    expect(none.seasonStreak).toEqual({ best: 0, current: 0 });
    expect(none.distinctDays).toBe(1);
    const early = buildFacts(input({ sets, now: new Date(at(2026, 8, 2)) }));
    expect(early.seasonStreak).toEqual({ best: 0, current: 0 });
  });
});

describe('streakOf', () => {
  it('finds the longest run and the live one', () => {
    expect(streakOf(new Set([0, 1, 2, 5, 6]), 6)).toEqual({ best: 3, current: 2 });
    expect(streakOf(new Set([0, 1]), 2)).toEqual({ best: 2, current: 2 });
    expect(streakOf(new Set([0, 1]), 3)).toEqual({ best: 2, current: 0 });
    expect(streakOf(new Set(), null)).toEqual({ best: 0, current: 0 });
  });
});
```

- [ ] **Step 3: Run the facts tests**

Run: `npx vitest run packages/engine/test/achievements/facts.test.ts`
Expected: PASS. Fix `facts.ts` (not the tests) if anything fails.

- [ ] **Step 4: Write `definitions.ts`**

```ts
import type { AchievementFacts } from './facts.js';
import type { AchievementTier } from './types.js';

export interface AchievementDef {
  /** Permanent: never reused or renumbered. */
  id: string;
  name: string;
  /** How to earn it, as one line on the page. */
  howTo: string;
  tier: AchievementTier;
  /** Earned from an event mark rather than the log; the nudge never points at it. */
  mark?: string;
  /** Singular and plural unit for the nudge's "N more" line, on counted achievements. */
  unit?: readonly [string, string];
  test(f: AchievementFacts): boolean;
  progress(f: AchievementFacts): { have: number; need: number };
}

type Base = Pick<AchievementDef, 'id' | 'name' | 'howTo' | 'tier'>;

/** A one-step achievement: done or not. */
function step(base: Base, test: (f: AchievementFacts) => boolean, mark?: string): AchievementDef {
  return {
    ...base,
    ...(mark !== undefined ? { mark } : {}),
    test,
    progress: (f) => ({ have: test(f) ? 1 : 0, need: 1 }),
  };
}

/** Battles logged on `n` different days. */
export function distinctDays(n: number, base: Base): AchievementDef {
  return {
    ...base,
    unit: ['day', 'days'],
    test: (f) => f.distinctDays >= n,
    progress: (f) => ({ have: Math.min(f.distinctDays, n), need: n }),
  };
}

/** Battles logged in `n` seasons in a row. Progress shows the run alive now. */
export function seasonStreak(n: number, base: Base): AchievementDef {
  return {
    ...base,
    unit: ['season', 'seasons'],
    test: (f) => f.seasonStreak.best >= n,
    progress: (f) => ({
      have: f.seasonStreak.best >= n ? n : Math.min(f.seasonStreak.current, n),
      need: n,
    }),
  };
}

/** Your meta unlocked in `n` seasons in a row. */
export function yourMetaStreak(n: number, base: Base): AchievementDef {
  return {
    ...base,
    unit: ['season', 'seasons'],
    test: (f) => f.yourMetaStreak.best >= n,
    progress: (f) => ({
      have: f.yourMetaStreak.best >= n ? n : Math.min(f.yourMetaStreak.current, n),
      need: n,
    }),
  };
}

/** The list, in page order. Add an entry (and a test) to add an achievement. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  step(
    {
      id: 'trainer',
      name: 'Trainer',
      howTo: 'Import your collection or add a Pokemon by hand',
      tier: 'easy',
    },
    (f) => f.hasCollection,
  ),
  step(
    { id: 'first-battle', name: 'First battle', howTo: 'Log one battle', tier: 'easy' },
    (f) => f.countedBattles >= 1,
  ),
  step(
    { id: 'full-set', name: 'Full set', howTo: 'Log a complete set of 5', tier: 'easy' },
    (f) => f.fullSet,
  ),
  step(
    { id: 'team-builder', name: 'Team builder', howTo: 'Analyze a team in Build', tier: 'easy' },
    (f) => f.marks.has('analyzed'),
    'analyzed',
  ),
  step(
    {
      id: 'meta-player',
      name: 'Meta player',
      howTo: "Log a set with all three in the league's meta group",
      tier: 'mid',
    },
    (f) => f.metaPlayer,
  ),
  step(
    { id: 'cup-runner', name: 'Cup runner', howTo: 'Log a set outside Great League', tier: 'mid' },
    (f) => f.cupRunner,
  ),
  distinctDays(10, {
    id: 'days-10',
    name: 'Ten days',
    howTo: 'Log battles on 10 different days',
    tier: 'mid',
  }),
  step(
    {
      id: 'your-meta',
      name: 'Your meta',
      howTo: 'Log 15 battles in one league in a season',
      tier: 'mid',
    },
    (f) => f.yourMetaStreak.best >= 1,
  ),
  seasonStreak(2, {
    id: 'seasons-2',
    name: 'Back again',
    howTo: 'Log in 2 seasons in a row',
    tier: 'hard',
  }),
  yourMetaStreak(2, {
    id: 'your-meta-seasons-2',
    name: 'Still reading',
    howTo: 'Unlock Your meta in 2 seasons in a row',
    tier: 'hard',
  }),
  seasonStreak(3, {
    id: 'seasons-3',
    name: 'Three-peat',
    howTo: 'Log in 3 seasons in a row',
    tier: 'elite',
  }),
];
```

- [ ] **Step 5: Write `evaluate.ts`**

```ts
import { ACHIEVEMENTS, type AchievementDef } from './definitions.js';
import type { AchievementFacts } from './facts.js';

export interface AchievementStatus {
  def: AchievementDef;
  earned: boolean;
  have: number;
  need: number;
}

/** Definitions the facts now satisfy that are not earned yet, in list order. */
export function newlyEarned(
  facts: AchievementFacts,
  earnedIds: ReadonlySet<string>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): AchievementDef[] {
  return defs.filter((d) => !earnedIds.has(d.id) && d.test(facts));
}

/** Every definition with whether it is earned and its progress. An earned one shows full. */
export function statusAll(
  facts: AchievementFacts,
  earnedIds: ReadonlySet<string>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): AchievementStatus[] {
  return defs.map((def) => {
    const p = def.progress(facts);
    const earned = earnedIds.has(def.id);
    return { def, earned, have: earned ? p.need : p.have, need: p.need };
  });
}

/**
 * The locked achievement closest to done (best have / need), skipping ones that rest on an event
 * mark. Ties go to the earlier one in the list. Null when nothing is left.
 */
export function nearest(
  facts: AchievementFacts,
  earnedIds: ReadonlySet<string>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): AchievementStatus | null {
  let best: AchievementStatus | null = null;
  for (const s of statusAll(facts, earnedIds, defs)) {
    if (s.earned || s.def.mark !== undefined) {
      continue;
    }
    if (best === null || s.have / s.need > best.have / best.need) {
      best = s;
    }
  }
  return best;
}

/** "Next: Ten days. 3 more days." or "Next: Full set. Log a complete set of 5." */
export function nudgeLine(s: AchievementStatus): string {
  const unit = s.def.unit;
  if (unit !== undefined && s.need > 1) {
    const left = s.need - s.have;
    return `Next: ${s.def.name}. ${left} more ${left === 1 ? unit[0] : unit[1]}.`;
  }
  return `Next: ${s.def.name}. ${s.def.howTo}.`;
}
```

- [ ] **Step 6: Write the failing tests `packages/engine/test/achievements/evaluate.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../src/achievements/definitions.js';
import { nearest, newlyEarned, nudgeLine, statusAll } from '../../src/achievements/evaluate.js';
import type { AchievementFacts } from '../../src/achievements/facts.js';

function facts(over: Partial<AchievementFacts> = {}): AchievementFacts {
  return {
    hasCollection: false,
    marks: new Set(),
    countedBattles: 0,
    distinctDays: 0,
    fullSet: false,
    metaPlayer: false,
    cupRunner: false,
    seasonStreak: { best: 0, current: 0 },
    yourMetaStreak: { best: 0, current: 0 },
    ...over,
  };
}

describe('the starter list', () => {
  it('has the eleven starter ids, each unique with a name and a how-to line', () => {
    expect(ACHIEVEMENTS.map((d) => d.id)).toEqual([
      'trainer',
      'first-battle',
      'full-set',
      'team-builder',
      'meta-player',
      'cup-runner',
      'days-10',
      'your-meta',
      'seasons-2',
      'your-meta-seasons-2',
      'seasons-3',
    ]);
    for (const d of ACHIEVEMENTS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.howTo.length).toBeGreaterThan(0);
    }
  });
});

describe('newlyEarned', () => {
  it('earns what the facts satisfy and skips what is already earned', () => {
    const f = facts({ hasCollection: true, countedBattles: 1, distinctDays: 1 });
    expect(newlyEarned(f, new Set()).map((d) => d.id)).toEqual(['trainer', 'first-battle']);
    expect(newlyEarned(f, new Set(['trainer'])).map((d) => d.id)).toEqual(['first-battle']);
  });

  it('earns Team builder from the analyzed mark', () => {
    const f = facts({ marks: new Set(['analyzed']) });
    expect(newlyEarned(f, new Set()).map((d) => d.id)).toEqual(['team-builder']);
  });

  it('earns season achievements on the best run, even when it has ended', () => {
    const f = facts({ seasonStreak: { best: 3, current: 0 }, countedBattles: 3, distinctDays: 3 });
    const ids = newlyEarned(f, new Set()).map((d) => d.id);
    expect(ids).toContain('seasons-2');
    expect(ids).toContain('seasons-3');
  });
});

describe('progress and the nudge', () => {
  it('shows the live run for a locked streak and full for an earned one', () => {
    const f = facts({ seasonStreak: { best: 1, current: 1 } });
    const byId = new Map(statusAll(f, new Set(['days-10'])).map((s) => [s.def.id, s]));
    expect(byId.get('seasons-3')).toMatchObject({ have: 1, need: 3, earned: false });
    expect(byId.get('days-10')).toMatchObject({ have: 10, need: 10, earned: true });
  });

  it('points at the closest locked one, never at a mark', () => {
    const f = facts({ distinctDays: 7, seasonStreak: { best: 1, current: 1 } });
    const earned = new Set(['trainer', 'first-battle', 'full-set', 'meta-player', 'cup-runner']);
    const n = nearest(f, earned);
    expect(n?.def.id).toBe('days-10');
    expect(nudgeLine(n!)).toBe('Next: Ten days. 3 more days.');
  });

  it('words a one-step nudge with its how-to line', () => {
    const n = nearest(facts(), new Set());
    expect(n?.def.id).toBe('trainer');
    expect(nudgeLine(n!)).toBe('Next: Trainer. Import your collection or add a Pokemon by hand.');
  });

  it('is null when everything is earned', () => {
    expect(nearest(facts(), new Set(ACHIEVEMENTS.map((d) => d.id)))).toBeNull();
  });
});
```

- [ ] **Step 7: Export and run**

`packages/engine/src/achievements/index.ts` becomes:

```ts
export * from './types.js';
export * from './kanto.js';
export * from './roll.js';
export * from './facts.js';
export * from './definitions.js';
export * from './evaluate.js';
```

Run: `npx vitest run packages/engine/test/achievements`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck && npx eslint packages/engine/src/achievements packages/engine/test/achievements
git add packages/engine/src/achievements/facts.ts packages/engine/src/achievements/definitions.ts packages/engine/src/achievements/evaluate.ts packages/engine/src/achievements/index.ts packages/engine/test/achievements/facts.test.ts packages/engine/test/achievements/evaluate.test.ts
git commit -m "Engine: achievement facts from the log (daily cap, seasons), the starter 11, evaluate and the nudge"
```

---

### Task 3: Kanto shiny sprites in the data build

**Files:**
- Modify: `packages/data/src/build-sprites.ts` (add `shinyUrlFor` and `writeShinySprites`)
- Modify: `packages/data/src/build.ts:28-33` (call it inside the same `PICKTHREE_SKIP_SPRITES` guard)
- Test: `packages/data/test/build-sprites.test.ts`

**Interfaces:**
- Consumes: `KANTO` from `@pickthree/engine` (Task 1).
- Produces: files `apps/web/public/data/sprites/shiny/<pvpoke id>.webp` for the 151 Kanto ids.

- [ ] **Step 1: Write the failing test** (append to `packages/data/test/build-sprites.test.ts`)

```ts
import { shinyUrlFor } from '../src/build-sprites.js';

describe('shiny sprites', () => {
  it('reads the HOME shiny render by dex number', () => {
    expect(shinyUrlFor(131)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/131.png',
    );
  });
});
```

(Merge the import into the file's existing import from `../src/build-sprites.js`.)

Run: `npx vitest run packages/data/test/build-sprites.test.ts`
Expected: FAIL, `shinyUrlFor` is not exported.

- [ ] **Step 2: Implement in `build-sprites.ts`** (after `writeSprites`)

```ts
/** The HOME shiny render for a dex number's default form. */
export function shinyUrlFor(dex: number): string {
  return `${SPRITES}/other/home/shiny/${dex}.png`;
}

/**
 * Shiny pictures for the achievement rewards: the Kanto 151 only, written to sprites/shiny/ in the
 * same 96px WebP as the rest. Kanto's default forms have PokeAPI pokemon ids equal to their dex.
 */
export async function writeShinySprites(
  outDir: string,
  kanto: readonly { id: string; dex: number }[],
): Promise<{ written: number; missing: string[] }> {
  const dir = path.join(outDir, 'sprites', 'shiny');
  fs.mkdirSync(dir, { recursive: true });
  const report = { written: 0, missing: [] as string[] };
  await runPool([...kanto], async ({ id, dex }) => {
    const png = await cachedFetch(
      shinyUrlFor(dex),
      path.join(CACHE_DIR, 'sprites', 'home-shiny', `${dex}.png`),
    );
    if (!png) {
      report.missing.push(id);
      return;
    }
    const out = await sharp(png)
      .trim({ threshold: 1 })
      .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: false })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();
    fs.writeFileSync(path.join(dir, `${id}.webp`), out);
    report.written += 1;
  });
  report.missing.sort();
  return report;
}
```

In `build.ts`, inside the `if (process.env.PICKTHREE_SKIP_SPRITES !== '1')` block after the
existing log line, add (and import `writeShinySprites` and `KANTO`):

```ts
    const shiny = await writeShinySprites(OUTPUT_DIR, KANTO);
    console.log(`shiny sprites: ${shiny.written} written, ${shiny.missing.length} missing`);
```

- [ ] **Step 3: Run the test, then the real fetch**

Run: `npx vitest run packages/data/test/build-sprites.test.ts` (PASS).
Then fetch the shinies into the worktree's data without a full rebuild:

```bash
npx tsx -e "import('./packages/data/src/build-sprites.ts').then(async (m) => { const { KANTO } = await import('./packages/engine/src/index.ts'); console.log(await m.writeShinySprites('apps/web/public/data', KANTO)); })"
ls apps/web/public/data/sprites/shiny | wc -l
```
Expected: `151` (report `missing: []`). If PokeAPI is unreachable, note it and continue; the app
falls back to the normal sprite when a shiny file is missing (Task 6).

- [ ] **Step 4: Lint, typecheck, commit**

```bash
npm run typecheck && npx eslint packages/data/src/build-sprites.ts packages/data/src/build.ts packages/data/test/build-sprites.test.ts
git add packages/data/src/build-sprites.ts packages/data/src/build.ts packages/data/test/build-sprites.test.ts
git commit -m "Data: Kanto shiny sprites for achievement rewards (sprites/shiny/)"
```

---

### Task 4: Storage, the export file and forget

**Files:**
- Modify: `apps/web/src/storage/db.ts` (v3, `achievements` store, load/save/merge, forget)
- Modify: `apps/web/src/storage/logFile.ts` (optional `achievements` block both ways)
- Modify: `apps/web/src/state/store.tsx` (`exportLog`, `importLog` use them)
- Test: `apps/web/test/storage.test.ts`, `apps/web/test/logFile.test.ts`

**Interfaces:**
- Consumes: `AchievementsRecord`, `EarnedAchievement`, `EMPTY_ACHIEVEMENTS`, `KANTO_IDS` (Task 1).
- Produces:
  - `DB_VERSION = 3`
  - `storage.loadAchievements(): Promise<AchievementsRecord>` (EMPTY on any failure)
  - `storage.saveAchievements(r: AchievementsRecord): Promise<boolean>` (false when the write failed)
  - `storage.mergeAchievements(incoming: AchievementsRecord): Promise<void>`
  - `mergeAchievementRecords(stored, incoming): AchievementsRecord` (pure, exported from db.ts)
  - `serializeLog(sets, achievements?: AchievementsRecord): string`
  - `parseLogAchievements(text: string): AchievementsRecord | null`

- [ ] **Step 1: Write the failing storage tests** (append to `apps/web/test/storage.test.ts`; reuse its `beforeEach`)

```ts
import { mergeAchievementRecords } from '../src/storage/db.ts';

describe('achievements storage', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });

  it('upgrades a version 2 database and keeps the battles', async () => {
    const v2 = await openDB('pickthree', 2, {
      upgrade(d) {
        d.createObjectStore('collection', { keyPath: 'key' });
        d.createObjectStore('settings', { keyPath: 'key' });
        d.createObjectStore('battles', { keyPath: 'id' }).createIndex('by-league', 'league');
      },
    });
    await v2.put('battles', set('kept'));
    v2.close();
    expect((await storage.loadAllSets()).map((s) => s.id)).toEqual(['kept']);
    expect(await storage.loadAchievements()).toEqual({ earned: [], marks: [] });
  });

  it('saves and loads the record, and forget clears it', async () => {
    const rec = {
      earned: [{ id: 'first-battle', earnedAt: '2026-10-07T00:00:00Z', species: 'pidgey', shiny: false }],
      marks: ['analyzed'],
    };
    expect(await storage.saveAchievements(rec)).toBe(true);
    expect(await storage.loadAchievements()).toEqual(rec);
    await storage.forget();
    expect(await storage.loadAchievements()).toEqual({ earned: [], marks: [] });
  });

  it('merges an imported record: stored wins a clash, marks union', () => {
    const stored = {
      earned: [{ id: 'trainer', earnedAt: 'a', species: 'pidgey', shiny: false }],
      marks: ['analyzed'],
    };
    const incoming = {
      earned: [
        { id: 'trainer', earnedAt: 'b', species: 'rattata', shiny: true },
        { id: 'full-set', earnedAt: 'b', species: 'machop', shiny: false },
      ],
      marks: ['analyzed', 'other'],
    };
    expect(mergeAchievementRecords(stored, incoming)).toEqual({
      earned: [
        { id: 'trainer', earnedAt: 'a', species: 'pidgey', shiny: false },
        { id: 'full-set', earnedAt: 'b', species: 'machop', shiny: false },
      ],
      marks: ['analyzed', 'other'],
    });
  });
});
```

Run: `npx vitest run apps/web/test/storage.test.ts` (FAIL: no `loadAchievements`).

- [ ] **Step 2: Implement in `db.ts`**

Add to the schema interface: `achievements: { key: 'current'; value: AchievementsRecord & { key: 'current' } };`
Set `export const DB_VERSION = 3;` and add to `upgrade`:

```ts
        if (oldVersion < 3) {
          d.createObjectStore('achievements', { keyPath: 'key' });
        }
```

Add, above `export const storage`:

```ts
/**
 * An imported record folded into the stored one: earned ids the phone lacks are added, a clash
 * keeps the phone's own Pokemon, marks are the union.
 */
export function mergeAchievementRecords(
  stored: AchievementsRecord,
  incoming: AchievementsRecord,
): AchievementsRecord {
  const have = new Set(stored.earned.map((e) => e.id));
  const owned = new Set(stored.earned.map((e) => e.species));
  const added = incoming.earned.filter((e) => !have.has(e.id) && !owned.has(e.species));
  return {
    earned: [...stored.earned, ...added],
    marks: [...new Set([...stored.marks, ...incoming.marks])],
  };
}
```

(An incoming record whose species the phone already holds under another id is dropped, so the
no-duplicates rule survives an import.)

Add to `storage`:

```ts
  loadAchievements(): Promise<AchievementsRecord> {
    return safe(async () => {
      const r = await (await db()).get('achievements', 'current');
      return r ? { earned: r.earned, marks: r.marks } : EMPTY_ACHIEVEMENTS;
    }, EMPTY_ACHIEVEMENTS);
  },
  /** False when the phone refused the write: the caller must not announce what was not kept. */
  saveAchievements(r: AchievementsRecord): Promise<boolean> {
    return safe(async () => {
      await (await db()).put('achievements', { key: 'current', earned: r.earned, marks: r.marks });
      return true;
    }, false);
  },
  async mergeAchievements(incoming: AchievementsRecord): Promise<void> {
    const stored = await storage.loadAchievements();
    await storage.saveAchievements(mergeAchievementRecords(stored, incoming));
  },
```

In `forget`, add `await d.clear('achievements');`. Import `type AchievementsRecord` and
`EMPTY_ACHIEVEMENTS` from `@pickthree/engine`.

Run: `npx vitest run apps/web/test/storage.test.ts` (PASS).

- [ ] **Step 3: Write the failing log file tests** (append to `apps/web/test/logFile.test.ts`)

```ts
import { parseLogAchievements } from '../src/storage/logFile.ts';

describe('log file achievements', () => {
  const rec = {
    earned: [{ id: 'first-battle', earnedAt: '2026-10-07T00:00:00Z', species: 'pidgey', shiny: true }],
    marks: ['analyzed'],
  };

  it('round trips the block without changing the version', () => {
    const text = serializeLog(sets, rec);
    expect((JSON.parse(text) as { version: number }).version).toBe(LOG_FILE_VERSION);
    expect(parseLogFile(text)).toEqual(sets);
    expect(parseLogAchievements(text)).toEqual(rec);
  });

  it('reads a file with no block as null', () => {
    expect(parseLogAchievements(serializeLog(sets))).toBeNull();
  });

  it('drops junk entries and keeps good ones', () => {
    const text = JSON.stringify({
      app: 'pick3',
      kind: 'battle-log',
      version: 1,
      exportedAt: 'x',
      sets: [],
      achievements: {
        earned: [
          rec.earned[0],
          { id: 'x', earnedAt: 'y', species: 'garchomp', shiny: false },
          { id: 'y', species: 'pidgey' },
          'nonsense',
        ],
        marks: ['analyzed', 7],
      },
    });
    expect(parseLogAchievements(text)).toEqual(rec);
    expect(parseLogFile(text)).toEqual([]);
  });
});
```

Run: `npx vitest run apps/web/test/logFile.test.ts` (FAIL).

- [ ] **Step 4: Implement in `logFile.ts`**

```ts
import { KANTO_IDS, type AchievementsRecord, type EarnedAchievement } from '@pickthree/engine';
```

Add `achievements?: AchievementsRecord;` to `interface LogFile`. Change `serializeLog`:

```ts
export function serializeLog(sets: BattleSet[], achievements?: AchievementsRecord): string {
  const file: LogFile = {
    app: 'pick3',
    kind: 'battle-log',
    version: LOG_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    sets,
    ...(achievements ? { achievements } : {}),
  };
  return JSON.stringify(file, null, 2);
}
```

Add:

```ts
function isEarned(x: unknown): x is EarnedAchievement {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  const e = x as Partial<EarnedAchievement>;
  return (
    typeof e.id === 'string' &&
    typeof e.earnedAt === 'string' &&
    typeof e.species === 'string' &&
    KANTO_IDS.has(e.species) &&
    typeof e.shiny === 'boolean'
  );
}

/**
 * The achievements block of an export file, junk entries dropped, or null when the file has none
 * (older exports). Call after parseLogFile has accepted the file.
 */
export function parseLogAchievements(text: string): AchievementsRecord | null {
  const f = JSON.parse(text) as Partial<LogFile>;
  const a = f.achievements as { earned?: unknown; marks?: unknown } | undefined;
  if (typeof a !== 'object' || a === null) {
    return null;
  }
  const earned = Array.isArray(a.earned) ? a.earned.filter(isEarned) : [];
  const marks = Array.isArray(a.marks)
    ? a.marks.filter((m): m is string => typeof m === 'string')
    : [];
  return { earned, marks };
}
```

- [ ] **Step 5: Wire export and import in `store.tsx`**

```ts
  const exportLog = useCallback(
    async () =>
      serializeLog(await storage.loadAllSets(), await storage.loadAchievements()),
    [],
  );
```

In `importLog`, right after `const r = await storage.importSets(sets);` add:

```ts
        const achievements = parseLogAchievements(text);
        if (achievements) {
          await storage.mergeAchievements(achievements);
        }
```

(`applySets` after it bumps `logVersion`, which makes the provider in Task 5 reload the record.)

- [ ] **Step 6: Run, lint, commit**

Run: `npx vitest run apps/web/test/storage.test.ts apps/web/test/logFile.test.ts apps/web/test/store.test.tsx`
Expected: PASS.

```bash
npm run typecheck && npx eslint apps/web/src/storage apps/web/src/state/store.tsx apps/web/test/storage.test.ts apps/web/test/logFile.test.ts
git add apps/web/src/storage/db.ts apps/web/src/storage/logFile.ts apps/web/src/state/store.tsx apps/web/test/storage.test.ts apps/web/test/logFile.test.ts
git commit -m "Storage: achievements store (db v3), carried in the log export, merged on import, cleared by forget"
```

---

### Task 5: The achievements provider

**Files:**
- Create: `apps/web/src/achievements/metaGroups.ts`
- Create: `apps/web/src/achievements/AchievementsProvider.tsx`
- Modify: `apps/web/src/state/store.tsx` (mount the provider inside `AppProvider`'s returned tree)
- Test: `apps/web/test/achievementsProvider.test.tsx`

**Interfaces:**
- Consumes: engine `buildFacts`, `newlyEarned`, `statusAll`, `nearest`, `nudgeLine`, `roll`,
  `ACHIEVEMENTS`, types; `storage.loadAchievements/saveAchievements/loadAllSets`; `useAppState`.
- Produces:
  - `loadMetaGroup(league: string, fetcher?: typeof fetch): Promise<string[]>`, `resetMetaGroupsForTests()`
  - `type Announcement = { kind: 'earned'; earned: EarnedAchievement; name: string } | { kind: 'nudge'; line: string }`
  - `interface Reveal { title: string; items: { earned: EarnedAchievement; name: string }[] }`
  - `useAchievements(): AchievementsView` where
    ```ts
    interface AchievementsView {
      loaded: boolean;
      record: AchievementsRecord;
      statuses: AchievementStatus[];
      /** Earned ids that are in the current list (retired ones excluded). */
      earnedCount: number;
      total: number;
      shinyCount: number;
      nudge: string | null;
      toast: Announcement | null;
      reveal: Reveal | null;
      dismissToast(): void;
      closeReveal(): void;
    }
    ```
  - `AchievementsProvider({ children })`

- [ ] **Step 1: Write `metaGroups.ts`**

```ts
const cache = new Map<string, Promise<string[]>>();

/**
 * The species ids in a league's PvPoke meta group, from the app's own /data. A missing file or a
 * failed read is an empty group and is retried on the next call; it never throws.
 */
export function loadMetaGroup(league: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const hit = cache.get(league);
  if (hit) {
    return hit;
  }
  const p = (async () => {
    try {
      const res = await fetcher(`/data/meta/${league}.json`);
      if (!res.ok) {
        cache.delete(league);
        return [];
      }
      const rows = (await res.json()) as { speciesId?: unknown }[];
      return rows.map((r) => r.speciesId).filter((id): id is string => typeof id === 'string');
    } catch {
      cache.delete(league);
      return [];
    }
  })();
  cache.set(league, p);
  return p;
}

export function resetMetaGroupsForTests(): void {
  cache.clear();
}
```

- [ ] **Step 2: Write `AchievementsProvider.tsx`**

```tsx
import {
  ACHIEVEMENTS,
  buildFacts,
  EMPTY_ACHIEVEMENTS,
  nearest,
  newlyEarned,
  nudgeLine,
  roll,
  statusAll,
  type AchievementFacts,
  type AchievementsRecord,
  type AchievementStatus,
  type EarnedAchievement,
} from '@pickthree/engine';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { recordError } from '../diag.ts';
import { useAppState } from '../state/store.tsx';
import { storage } from '../storage/db.ts';
import { loadMetaGroup } from './metaGroups.ts';

export type Announcement =
  | { kind: 'earned'; earned: EarnedAchievement; name: string }
  | { kind: 'nudge'; line: string };

export interface Reveal {
  title: string;
  items: { earned: EarnedAchievement; name: string }[];
}

export interface AchievementsView {
  loaded: boolean;
  record: AchievementsRecord;
  statuses: AchievementStatus[];
  earnedCount: number;
  total: number;
  shinyCount: number;
  nudge: string | null;
  toast: Announcement | null;
  reveal: Reveal | null;
  dismissToast(): void;
  closeReveal(): void;
}

const NAMES = new Map(ACHIEVEMENTS.map((d) => [d.id, d.name]));

/** A uniform number in [0, 1) from the platform's cryptographic source. */
function cryptoRandom(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] as number) / 2 ** 32;
}

const Ctx = createContext<AchievementsView | null>(null);

/**
 * Works out achievements on the phone and announces new ones. Every evaluation runs through one
 * promise chain and re-reads the stored record inside it, so two triggers in a row (StrictMode,
 * a battle logged during boot) can never roll the same achievement twice. New Pokemon are saved
 * before they are announced. `rng` is for tests.
 */
export function AchievementsProvider({
  children,
  rng = cryptoRandom,
}: {
  children: ReactNode;
  rng?: () => number;
}) {
  const s = useAppState();
  const [record, setRecord] = useState<AchievementsRecord>(EMPTY_ACHIEVEMENTS);
  const [facts, setFacts] = useState<AchievementFacts | null>(null);
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const closedSeen = useRef<Set<string> | null>(null);
  const stateRef = useRef(s);
  stateRef.current = s;

  const run = useCallback((job: () => Promise<void>) => {
    chain.current = chain.current.then(job).catch((e: unknown) => recordError('achievements', e));
  }, []);

  const evaluate = useCallback(
    (extraMark?: string) =>
      run(async () => {
        const app = stateRef.current;
        if (app.boot !== 'ready' || !app.settingsLoaded || !app.data) {
          return;
        }
        const [sets, stored] = await Promise.all([
          storage.loadAllSets(),
          storage.loadAchievements(),
        ]);
        const leagues = [...new Set(sets.map((x) => x.league))];
        const groups = await Promise.all(leagues.map((l) => loadMetaGroup(l)));
        const metaGroups = Object.fromEntries(leagues.map((l, i) => [l, groups[i] ?? []]));
        const marks =
          extraMark !== undefined && !stored.marks.includes(extraMark)
            ? [...stored.marks, extraMark]
            : stored.marks;
        const f = buildFacts({
          sets,
          seasons: app.data.seasons,
          metaGroups,
          hasCollection: (app.collection?.specimens.length ?? 0) > 0,
          marks,
          now: new Date(),
        });
        const owned = new Set(stored.earned.map((e) => e.species));
        const now = new Date().toISOString();
        const added: EarnedAchievement[] = [];
        for (const def of newlyEarned(f, new Set(stored.earned.map((e) => e.id)))) {
          const r = roll(def.tier, owned, f.seasonStreak.current, rng);
          owned.add(r.species);
          added.push({ id: def.id, earnedAt: now, species: r.species, shiny: r.shiny });
        }
        let next = stored;
        if (added.length > 0 || marks !== stored.marks) {
          const candidate = { earned: [...stored.earned, ...added], marks };
          // Save before announce: a Pokemon the phone did not keep is never shown.
          if (!(await storage.saveAchievements(candidate))) {
            setRecord(stored);
            setFacts(f);
            return;
          }
          next = candidate;
        }
        setRecord(next);
        setFacts(f);
        const closedNow = new Set(sets.filter((x) => x.closed).map((x) => x.id));
        const justClosed =
          closedSeen.current !== null && [...closedNow].some((id) => !closedSeen.current!.has(id));
        closedSeen.current = closedNow;
        const named = added.map((earned) => ({ earned, name: NAMES.get(earned.id) ?? earned.id }));
        if (named.length === 1) {
          setQueue((q) => [...q, { kind: 'earned', ...named[0]! }]);
        } else if (named.length > 1) {
          setReveal({
            title:
              stored.earned.length === 0
                ? `You have earned ${named.length} already`
                : `${named.length} new achievements`,
            items: named,
          });
        } else if (justClosed) {
          const n = nearest(f, new Set(next.earned.map((e) => e.id)));
          if (n) {
            setQueue((q) => [...q, { kind: 'nudge', line: nudgeLine(n) }]);
          }
        }
      }),
    [run, rng],
  );

  // Boot, every log change (saved, edited, imported, forgotten) and the collection arriving.
  useEffect(() => {
    evaluate();
  }, [evaluate, s.boot, s.settingsLoaded, s.data, s.logVersion, s.collection]);

  // A finished analysis is the Team builder mark: the only starter action with no history.
  const lastAnalysis = useRef(s.analysis);
  useEffect(() => {
    if (s.analysis && s.analysis !== lastAnalysis.current) {
      evaluate('analyzed');
    }
    lastAnalysis.current = s.analysis;
  }, [s.analysis, evaluate]);

  const view = useMemo<AchievementsView>(() => {
    const ids = new Set(record.earned.map((e) => e.id));
    const statuses = facts ? statusAll(facts, ids) : [];
    const n = facts ? nearest(facts, ids) : null;
    return {
      loaded: facts !== null,
      record,
      statuses,
      earnedCount: ACHIEVEMENTS.filter((d) => ids.has(d.id)).length,
      total: ACHIEVEMENTS.length,
      shinyCount: record.earned.filter((e) => e.shiny).length,
      nudge: n ? nudgeLine(n) : null,
      toast: queue[0] ?? null,
      reveal,
      dismissToast: () => setQueue((q) => q.slice(1)),
      closeReveal: () => setReveal(null),
    };
  }, [record, facts, queue, reveal]);

  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

const EMPTY_VIEW: AchievementsView = {
  loaded: false,
  record: EMPTY_ACHIEVEMENTS,
  statuses: [],
  earnedCount: 0,
  total: ACHIEVEMENTS.length,
  shinyCount: 0,
  nudge: null,
  toast: null,
  reveal: null,
  dismissToast: () => undefined,
  closeReveal: () => undefined,
};

/** The achievements view. Outside the provider (isolated screen tests) it is empty, never a throw. */
export function useAchievements(): AchievementsView {
  return useContext(Ctx) ?? EMPTY_VIEW;
}
```

- [ ] **Step 3: Mount it in `AppProvider`**

In `store.tsx`, find `AppProvider`'s returned JSX (the `StateCtx.Provider` / `ActionsCtx.Provider`
pair near the end of the function) and wrap `{children}` with
`<AchievementsProvider>{children}</AchievementsProvider>`. Import it from
`../achievements/AchievementsProvider.tsx`. The provider calls `useAppState()`, so it must sit
inside both context providers.

- [ ] **Step 4: Write the failing tests `apps/web/test/achievementsProvider.test.tsx`**

Model the setup on `apps/web/test/metaHome.test.tsx` (fake-indexeddb, `resetDbForTests`,
`fakeHost`, `AppProvider` with `host`, a stubbed `fetch`). Read that file first and reuse its
helpers. Tests:

```tsx
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { BattleSet } from '@pickthree/engine';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMetaGroupsForTests } from '../src/achievements/metaGroups.ts';
import { useAchievements } from '../src/achievements/AchievementsProvider.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

function Probe() {
  const a = useAchievements();
  return (
    <div>
      <span data-testid="count">{a.earnedCount}</span>
      <span data-testid="toast">{a.toast?.kind === 'earned' ? a.toast.name : ''}</span>
      <span data-testid="reveal">{a.reveal?.title ?? ''}</span>
    </div>
  );
}

const oneBattle: BattleSet = {
  id: 's1',
  league: 'great',
  startedAt: new Date(2026, 8, 20, 12).toISOString(),
  team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
  battles: [
    { id: 'b1', at: new Date(2026, 8, 20, 12).toISOString(), opponents: [], result: 'win', tanked: false },
  ],
  closed: false,
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetMetaGroupsForTests();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 404 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AchievementsProvider', () => {
  it('earns First battle once from an existing log, saved before it is announced', async () => {
    await storage.saveSet(oneBattle);
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('toast').textContent).toBe('First battle'));
    const stored = await storage.loadAchievements();
    expect(stored.earned.map((e) => e.id)).toEqual(['first-battle']);
  });

  it('never rolls the same achievement twice under repeated evaluations', async () => {
    await storage.saveSet(oneBattle);
    const { rerender } = render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    rerender(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    await new Promise((r) => setTimeout(r, 50));
    expect((await storage.loadAchievements()).earned).toHaveLength(1);
  });

  it('shows one reveal, not toasts, when two or more arrive at once', async () => {
    const five = {
      ...oneBattle,
      battles: Array.from({ length: 5 }, (_, i) => ({
        id: `b${i}`,
        at: new Date(2026, 8, 20, 12, i).toISOString(),
        opponents: [],
        result: 'win' as const,
        tanked: false,
      })),
      closed: true,
    };
    await storage.saveSet(five);
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('reveal').textContent).toBe('You have earned 2 already'),
    );
    expect(screen.getByTestId('toast').textContent).toBe('');
  });

  it('treats a missing meta file as no group, with no error', async () => {
    await storage.saveSet(oneBattle);
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    const ids = (await storage.loadAchievements()).earned.map((e) => e.id);
    expect(ids).not.toContain('meta-player');
  });
});
```

If `fakeHost()` boots with a `data.seasons` list or a collection that changes these counts (for
example a collection makes Trainer earn too), adjust the expected ids to what the fixture
implies, keeping each test's point: one save per id, reveal for two or more, no error on 404.
Read `apps/web/test/fakeHost.ts` before running.

- [ ] **Step 5: Run**

Run: `npx vitest run apps/web/test/achievementsProvider.test.tsx`
Expected: PASS. Then the whole web project: `npx vitest run --project web` (the project name is in
the root `vitest.config.ts`; use it). Expected: PASS, no new console errors.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
npm run typecheck && npx eslint apps/web/src/achievements apps/web/src/state/store.tsx apps/web/test/achievementsProvider.test.tsx
git add apps/web/src/achievements/metaGroups.ts apps/web/src/achievements/AchievementsProvider.tsx apps/web/src/state/store.tsx apps/web/test/achievementsProvider.test.tsx
git commit -m "Web: achievements provider (evaluate, roll, save before announce, toast queue, reveal, Analyze mark)"
```

---

### Task 6: Reward tokens, the toast and the welcome reveal

**Files:**
- Modify: `packages/ui/tokens.css` (silhouette tokens, all three theme blocks)
- Modify: `apps/web/src/app.css` (achievement classes)
- Modify: `apps/web/src/components.tsx` (`PokemonToken` gains `shiny?: boolean`)
- Modify: `apps/web/src/components/NoticeToast.tsx` (export `footClearance`)
- Create: `apps/web/src/components/achievements/tokens.tsx` (`ShinyGlyph`, `RewardToken`, `BlankToken`, `SilhouetteSlot`)
- Create: `apps/web/src/components/achievements/AchievementToast.tsx`
- Create: `apps/web/src/components/achievements/WelcomeReveal.tsx`
- Modify: `apps/web/src/App.tsx` (render both next to `NoticeToast`)
- Test: `apps/web/test/achievementPieces.test.tsx`

**Interfaces:**
- Consumes: `useAchievements` (Task 5), `PokemonToken`, `Sheet`, `Button` from `@pickthree/ui`.
- Produces: `RewardToken({ species, shiny, size })`, `BlankToken({ size, label })`,
  `SilhouetteSlot({ species, size })`, `ShinyGlyph({ size })`, `AchievementToast()`,
  `WelcomeReveal()`.

- [ ] **Step 1: Tokens**

In `packages/ui/tokens.css`, add to the dark (default) block next to `--danger-tint`:

```css
  /* An unearned reward in the Kanto dex: the sprite drawn as a shape in this color. */
  --silhouette: #5a5e73;
  --silhouette-opacity: 0.45;
```

and to both light blocks (the `prefers-color-scheme: light` block and the `[data-theme='light']`
block):

```css
  --silhouette: #292b31;
  --silhouette-opacity: 0.16;
```

Copy the exact placement from the mock branch's `packages/ui/tokens.css` diff. Run
`npm run check-tokens` if it exists in root `package.json`, and `npm run check-colors`.

- [ ] **Step 2: CSS** (append to `apps/web/src/app.css`; copy from the mock's diff, minus the MOCK comments and minus the `@import` change, which must NOT be ported)

```css
/* Achievements. Shiny: pick3's sparkle badged on a token's top-right corner, as the Mega badge
   sits on the bottom-right. */
.token-shiny-wrap {
  position: relative;
  display: inline-flex;
}
.token-shiny-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  line-height: 0;
  pointer-events: none;
}
.token-shiny-badge svg {
  display: block;
}
/* Not earned yet: a disc in the bar color with the dex number or a question mark. */
.ach-blank {
  place-items: center;
  border-radius: 50%;
  background: var(--bar);
  color: var(--faint);
  font-weight: 500;
}
.ach-dex {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
  gap: 5px 4px;
  justify-items: center;
}
.ach-toast-token {
  display: inline-flex;
  padding-left: 10px;
}
/* Not earned yet, in the dex: the sprite as a shape in --silhouette at --silhouette-opacity. */
.ach-sil {
  display: inline-block;
  background: var(--silhouette);
  opacity: var(--silhouette-opacity);
  -webkit-mask: var(--sprite) center / contain no-repeat;
  mask: var(--sprite) center / contain no-repeat;
}
```

- [ ] **Step 3: `PokemonToken` shiny prop** (`apps/web/src/components.tsx`)

Add `shiny = false` to the destructured props and `shiny?: boolean;` (doc: "A shiny reward: the
shiny picture") to the prop type. Change the `src` line to:

```ts
  const base = speciesId.replace(/_shadow$/, '');
  const src = spritesOn
    ? shiny
      ? `/data/sprites/shiny/${base}.webp`
      : `/data/sprites/${base}.webp`
    : undefined;
```

Check how `SpeciesToken` (in `packages/ui`) handles an image that fails to load. If it has no
fallback, a missing shiny file would show a broken image: in that case leave `src` on the normal
sprite when `shiny` is set but pass `shiny` through only for the badge, and note it in the commit.
Do not edit `packages/ui` for this.

- [ ] **Step 4: `components/achievements/tokens.tsx`**

Port `ShinyGlyph`, `RewardToken`, `BlankToken`, `SilhouetteSlot` from the mock file verbatim,
with these changes: `RewardToken` passes `shiny` to `PokemonToken`; doc comments lose the MOCK
wording; exports as named. `ShinyGlyph` keeps `fill="var(--type-electric)"` and
`stroke="var(--bg)"`.

- [ ] **Step 5: `NoticeToast.tsx`**

Change `function footClearance()` to `export function footClearance()`. Nothing else.

- [ ] **Step 6: `AchievementToast.tsx`**

```tsx
import { useEffect, useLayoutEffect, useState } from 'react';
import { useAchievements } from '../../achievements/AchievementsProvider.tsx';
import { useActions, useAppState } from '../../state/store.tsx';
import { footClearance } from '../NoticeToast.tsx';
import { RewardToken } from './tokens.tsx';

const EARNED_MS = 8000;
const NUDGE_MS = 3000;

/**
 * An achievement just earned, or the nudge after a set closes. Uses NoticeToast's info markup and
 * waits while the app's own notice is up, so the two never stack.
 */
export function AchievementToast() {
  const s = useAppState();
  const { navigate } = useActions();
  const a = useAchievements();
  const t = s.notice === null ? a.toast : null;
  const [bottom, setBottom] = useState(12);
  useLayoutEffect(() => {
    if (t) {
      setBottom(footClearance());
    }
  }, [t, s.route]);
  useEffect(() => {
    if (!t) {
      return undefined;
    }
    const id = window.setTimeout(a.dismissToast, t.kind === 'earned' ? EARNED_MS : NUDGE_MS);
    return () => window.clearTimeout(id);
  }, [t, a.dismissToast]);
  if (!t) {
    return null;
  }
  if (t.kind === 'nudge') {
    return (
      <div className="update-toast notice-toast notice-info notice-foot" role="status" style={{ bottom }}>
        <button type="button" className="notice-tap" onClick={a.dismissToast}>
          {t.line}
        </button>
      </div>
    );
  }
  const name = s.data?.species[t.earned.species]?.name ?? t.earned.species;
  return (
    <div className="update-toast notice-toast notice-info notice-foot" role="status" style={{ bottom }}>
      <span className="ach-toast-token">
        <RewardToken species={t.earned.species} shiny={t.earned.shiny} size={32} />
      </span>
      <span className="notice-msg">
        {t.name}. You got {t.earned.shiny ? 'a shiny ' : ''}
        {name}.
      </span>
      <button
        type="button"
        onClick={() => {
          navigate({ screen: 'achievements', row: t.earned.id });
          a.dismissToast();
        }}
      >
        See it
      </button>
      <button type="button" className="notice-quiet" onClick={a.dismissToast}>
        Not now
      </button>
    </div>
  );
}
```

(The `achievements` route is added in Task 7. Until then this line will not typecheck: add the
route union member `| { screen: 'achievements'; row?: string }` to `Route` in `store.tsx` now,
plus a `case 'achievements': return '#/achievements';` placeholder in `hashFor`, and finish the
route in Task 7. `renderScreen` must also get a case or TypeScript's exhaustiveness may complain;
return `<MetaHome />` there until Task 7 replaces it.)

- [ ] **Step 7: `WelcomeReveal.tsx`**

Port `MockWelcome` from the mock: the `Sheet` with id `ach-welcome`, title "Achievements", the
bold line `{reveal.title}`, the muted line "Your battle log counts from the start. Each one gave
you a Kanto Pokemon.", the `mh-team3` grid of `RewardToken` (size 52) with "Shiny " prefix and
the species name under each and the achievement name as `meta`, and a primary
`Button` "See your achievements" that calls `navigate({ screen: 'achievements' })` then
`closeReveal()`. `onClose` calls `closeReveal()`. Render nothing when `reveal` is null. For a
title that is not the first run ("N new achievements"), use the muted line "Each one gave you a
Kanto Pokemon." instead.

- [ ] **Step 8: Mount in `App.tsx`**

After `<NoticeToast />` add `<AchievementToast />` and `<WelcomeReveal />`.

- [ ] **Step 9: Write the tests `apps/web/test/achievementPieces.test.tsx`**

Render the pieces with a stubbed `useAchievements`: mock the module with
`vi.mock('../src/achievements/AchievementsProvider.tsx', ...)` returning a view with a toast or a
reveal, inside `AppProvider` (see `noticeToast.test.tsx` for how it renders the toast). Assert:

```tsx
it('shows the earned toast with the Pokemon and opens the page on See it', async () => {
  // view.toast = { kind: 'earned', name: 'First battle', earned: { id: 'first-battle', species: 'bulbasaur', shiny: false, earnedAt: 'x' } }
  // expect text /First battle\. You got .*\./ ; click "See it"; expect window.location.hash to be '#/achievements?row=first-battle' once Task 7 lands, or navigate called.
});
it('waits while the app notice is up', async () => {
  // dispatch a notice via useActions().notify('Battle logged', 'info'); expect no achievement toast; clear it; expect the toast.
});
it('marks a shiny with the Shiny badge', () => {
  // RewardToken shiny -> getByRole('img', { name: 'Shiny' })
});
it('shows the reveal title and one token per Pokemon', () => {
  // view.reveal = { title: 'You have earned 2 already', items: [...2] } -> getByText(title), 2 names
});
it('draws an unearned dex slot as a silhouette with sprites on and a number with them off', () => {
  // SilhouetteSlot -> aria-label "Not earned yet" and style --sprite url; BlankToken label '7'
});
```

Write these out fully against the real components; the comments state what each must assert.

- [ ] **Step 10: Run, lint, commit**

Run: `npx vitest run apps/web/test/achievementPieces.test.tsx apps/web/test/noticeToast.test.tsx apps/web/test/components.test.tsx`
Then `npm run check-colors && npm run typecheck && npm run lint`.

```bash
git add packages/ui/tokens.css apps/web/src/app.css apps/web/src/components.tsx apps/web/src/components/NoticeToast.tsx apps/web/src/components/achievements/tokens.tsx apps/web/src/components/achievements/AchievementToast.tsx apps/web/src/components/achievements/WelcomeReveal.tsx apps/web/src/App.tsx apps/web/src/state/store.tsx apps/web/test/achievementPieces.test.tsx
git commit -m "Web: reward tokens (shiny badge, silhouettes), the earn toast and the welcome reveal"
```

---

### Task 7: The achievements page, its route and the three ways in

**Files:**
- Modify: `apps/web/src/state/store.tsx` (`parseHash`, `hashFor` for `achievements`)
- Create: `apps/web/src/screens/Achievements.tsx`
- Modify: `apps/web/src/App.tsx` (`renderScreen` case; `onMeta` includes `achievements`)
- Modify: `apps/web/src/screens/settings/Settings.tsx`, `apps/web/src/screens/settings/glyphs.tsx`
- Modify: `apps/web/src/screens/YourBattles.tsx`
- Modify: `apps/web/src/screens/MetaHome.tsx`
- Test: `apps/web/test/achievementsScreen.test.tsx`, `apps/web/test/history.test.ts` (route round trip; check where parseHash tests live with `grep -rn "parseHash" apps/web/test` and add there)

**Interfaces:**
- Consumes: `useAchievements`, tokens from Task 6, `KANTO` from the engine, `ProgressCard`,
  `Header`, `IconButton` from `@pickthree/ui`, `ShareGlyph` from `components.tsx`.
- Produces: route `{ screen: 'achievements'; row?: string }` at `#/achievements` and
  `#/achievements?row=<id>`; `Achievements()` screen; `shortDate(iso)` in `format.ts`.

- [ ] **Step 1: Route tests** (in the file that already tests `parseHash`)

```ts
it('round trips the achievements page and its row', () => {
  expect(parseHash('#/achievements')).toEqual({ screen: 'achievements' });
  expect(parseHash('#/achievements?row=days-10')).toEqual({ screen: 'achievements', row: 'days-10' });
  expect(parseHash('#/achievements?row=<bad>')).toEqual({ screen: 'achievements' });
  expect(hashFor({ screen: 'achievements', row: 'days-10' })).toBe('#/achievements?row=days-10');
  expect(hashFor({ screen: 'achievements' })).toBe('#/achievements');
});
```

- [ ] **Step 2: Route implementation** (`store.tsx`)

In `parseHash`, beside the other single-word routes:

```ts
  if (a === 'achievements') {
    const row = new URLSearchParams(query ?? '').get('row');
    return row !== null && /^[a-z0-9-]{1,40}$/.test(row)
      ? { screen: 'achievements', row }
      : { screen: 'achievements' };
  }
```

In `hashFor`, replace the Task 6 placeholder:

```ts
    case 'achievements':
      return r.row ? `#/achievements?row=${encodeURIComponent(r.row)}` : '#/achievements';
```

In `App.tsx`: `renderScreen` gets `case 'achievements': return <Achievements />;` and `onMeta`
gets `|| route.screen === 'achievements'`.

- [ ] **Step 3: `format.ts` `shortDate`**

```ts
/** "Sep 12": the month and day of an ISO time, for an achievement's earned line. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 4: `screens/Achievements.tsx`**

Port the mock's `AchievementsMock` default branch (header, `ProgressCard`, `DexCard`, tier
groups, closing line) onto real data:

- Header: `back({ screen: 'meta' })`; the Share `IconButton` calls `shareDex()` from Task 8
  (leave `onClick={() => undefined}` until Task 8 and replace it there).
- `ProgressCard title="Earned" done={a.earnedCount} goal={a.total} line={line}` where `line` is
  `[a.shinyCount > 0 ? `${a.shinyCount} shiny` : null, a.nudge ?? 'All earned.'].filter(Boolean).join(' · ')`.
- Dex card: `KANTO` in dex order. A map from species id to the earned record
  (`a.record.earned`). Earned: `RewardToken` size 28. Unearned: `SilhouetteSlot` with sprites on
  (`settings.sprites !== false`), `BlankToken label={String(dex)}` with them off. Header right:
  `${litCount} of 151`.
- Tier groups in order easy, mid, hard, elite, top; skip a tier with no statuses. Labels: `Easy`,
  `Mid`, `Hard`, `Elite`, `Top`; lines: "Rewards a first-stage Pokemon", "Rewards an evolved
  Pokemon", "Rewards a fully evolved Pokemon", "Rewards a legendary bird", "Rewards Mewtwo or Mew".
- Earned row: `RewardToken` size 36, name, meta line `${shiny ? 'Shiny ' : ''}${speciesName} · ${shortDate(earnedAt)}`.
  Locked row: `BlankToken label="?"` size 36, name, `howTo`, `{have} of {need}` in `faced-rec`,
  and the `faced-bar` at `have / need`.
- Each row's wrapper gets `id={`ach-${def.id}`}`. When the route has `row`, scroll that element
  into view once on mount (`useEffect` with `document.getElementById(...)?.scrollIntoView({ block: 'center' })`).
- The closing `p.meta.ym-foot` line from the mock.
- Species names: `useName()` from `components.tsx` (the same helper `PokemonToken` uses).

- [ ] **Step 5: Ways in**

- `settings/glyphs.tsx`: add `AchievementsGlyph` from the mock diff (doc comment without MOCK).
- `settings/Settings.tsx`: the `SettingsRow` from the mock diff between Community and Appearance,
  `summary={`${a.earnedCount} of ${a.total}`}`, `onClick={() => { nav.close(); navigate({ screen: 'achievements' }); }}`
  (use `useActions().navigate`, not `window.location.hash`).
- `YourBattles.tsx`: the `action-row` from the mock diff at the top of `.scroll`, as a `button`
  or the existing `a` with `href={hashFor({ screen: 'achievements' })}`; title
  `Achievements · ${a.earnedCount} of ${a.total}`, small muted line `a.nudge ?? 'All earned.'`.
- `MetaHome.tsx`: the `mh-card` from the mock diff after `<YourMeta />`, count line
  `${a.earnedCount} of ${a.total}${a.shinyCount ? ` · ${a.shinyCount} shiny` : ''}`, the last six
  earned (newest first) as `RewardToken` size 36, the nudge line, and the `mh-more` link "See your
  achievements". Hide the token row when nothing is earned.

- [ ] **Step 6: Screen tests `apps/web/test/achievementsScreen.test.tsx`**

With `useAchievements` mocked to a view with 2 earned (one shiny) of 11 and statuses from the real
engine (`statusAll` over a hand-built facts object, see Task 2's `facts()` helper), assert:

```tsx
// 1. "Earned" card shows 2 and 11, and the line contains "1 shiny" and the nudge text.
// 2. The dex has 151 slots: 2 RewardTokens and 149 "Not earned yet" images.
// 3. With settings.sprites false, an unearned slot shows its dex number (e.g. getByText('151')).
// 4. A locked row shows its how-to line and "1 of 3"; an earned row shows "Shiny <name> · <date>".
// 5. #/achievements?row=days-10 calls scrollIntoView on #ach-days-10 (stub Element.prototype.scrollIntoView).
// 6. No "Top" heading while no top achievement exists.
```

Also extend `apps/web/test/settings.test.tsx` and `apps/web/test/metaHome.test.tsx` with one
assertion each that the Achievements row / card renders and links to `#/achievements`.

- [ ] **Step 7: Run, lint, commit**

Run: `npx vitest run --project web` (all web tests).
Expected: PASS.

```bash
npm run typecheck && npm run lint && npm run check-colors
git add apps/web/src/state/store.tsx apps/web/src/App.tsx apps/web/src/format.ts apps/web/src/screens/Achievements.tsx apps/web/src/screens/settings/Settings.tsx apps/web/src/screens/settings/glyphs.tsx apps/web/src/screens/YourBattles.tsx apps/web/src/screens/MetaHome.tsx apps/web/test/achievementsScreen.test.tsx apps/web/test/settings.test.tsx apps/web/test/metaHome.test.tsx
git add <the parseHash test file you edited>
git commit -m "Web: achievements page (#/achievements) with the Kanto dex, and its ways in from Settings, Your battles and Meta"
```

---

### Task 8: The share image

**Files:**
- Create: `apps/web/src/achievements/shareImage.ts`
- Modify: `apps/web/src/screens/Achievements.tsx` (Share button)
- Test: `apps/web/test/shareImage.test.ts`

**Interfaces:**
- Consumes: `KANTO`, `AchievementsRecord`, species types from `DataInfo.species`.
- Produces:
  - `dexLayout(): { width: number; height: number; cols: number; cell: number; gap: number; left: number; top: number; slot(i: number): { x: number; y: number } }`
  - `shareHeadline(record: AchievementsRecord): string` ("9 of 151 · 1 shiny · earned by playing GBL"; the shiny part only when there is one)
  - `drawDex(canvas: HTMLCanvasElement, input: { record: AchievementsRecord; types: (id: string) => string[]; spritesOn: boolean }): Promise<void>`
  - `shareDex(input: same as drawDex input): Promise<'shared' | 'downloaded' | 'failed'>`

- [ ] **Step 1: Failing tests `apps/web/test/shareImage.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { dexLayout, shareHeadline } from '../src/achievements/shareImage.ts';

describe('share image', () => {
  it('is 1080 wide and fits all 151 slots inside it', () => {
    const l = dexLayout();
    expect(l.width).toBe(1080);
    const last = l.slot(150);
    expect(last.x + l.cell).toBeLessThanOrEqual(l.width);
    expect(last.y + l.cell).toBeLessThan(l.height);
    expect(l.slot(l.cols).y).toBeGreaterThan(l.slot(0).y);
  });

  it('words the headline with and without a shiny', () => {
    const e = (species: string, shiny: boolean) => ({ id: species, earnedAt: 'x', species, shiny });
    expect(shareHeadline({ earned: [e('pidgey', false)], marks: [] })).toBe(
      '1 of 151 · earned by playing GBL',
    );
    expect(shareHeadline({ earned: [e('pidgey', false), e('lapras', true)], marks: [] })).toBe(
      '2 of 151 · 1 shiny · earned by playing GBL',
    );
  });
});
```

- [ ] **Step 2: Implement `shareImage.ts`**

Port `MockShareImage`'s drawing into `drawDex` with `dexLayout()` providing the numbers
(`width 1080, cols 11, cell 88, gap 6, top 250`, `left` centering the grid, `height = top + rows * (cell + gap) + 150`).
Rules from the spec and mock:

- Background `--bg`, title "My Kanto dex" in `--text` 700 64px, headline in `--muted` 500 36px,
  footer "pick3.gg" in `--accent-text` 700 40px. Read token values with
  `getComputedStyle(document.documentElement).getPropertyValue(name).trim()` at draw time.
- Earned with sprites on: the type disc (first type full, second type as the lower-right
  triangle, as the mock does), then the sprite (`/data/sprites/shiny/<id>.webp` when shiny,
  falling back to `/data/sprites/<id>.webp` if that image fails), then the shiny sparkle path for
  shinies.
- Unearned with sprites on: draw the sprite into an offscreen canvas, `globalCompositeOperation = 'source-in'`,
  fill `--silhouette`, then draw it at `globalAlpha = --silhouette-opacity`. Never `ctx.filter`.
- Sprites off: earned slots are the type disc with the species' initial letter in `--text`;
  unearned slots are a `--bar` disc with the dex number in `--faint`.
- A sprite that fails to load leaves its slot as the sprites-off version; `drawDex` never rejects
  because of one image.

`shareDex`: create an offscreen canvas, `drawDex`, `canvas.toBlob('image/png')`, a `File` named
`pick3-kanto-dex.png`; then the same share-then-download path as `YourData.tsx`'s `doExport`
(`navigator.share({ files: [file], title: 'My Kanto dex' })` when `canShare` allows, else an
object URL download). Return what happened; on any error return `'failed'`.

- [ ] **Step 3: Wire the Share button** in `Achievements.tsx`: `onClick={() => void shareDex({ record: a.record, types, spritesOn })}`
where `types = (id) => (data?.species[id]?.types ?? ['normal']).filter((t) => t !== 'none')`.
On `'failed'`, call `notify('Could not make the picture.', 'warn')`.

- [ ] **Step 4: Run, lint, commit**

Run: `npx vitest run apps/web/test/shareImage.test.ts apps/web/test/achievementsScreen.test.tsx`

```bash
npm run typecheck && npm run lint && npm run check-colors
git add apps/web/src/achievements/shareImage.ts apps/web/src/screens/Achievements.tsx apps/web/test/shareImage.test.ts
git commit -m "Web: share image of the Kanto dex, drawn on device (silhouettes source-in, no ctx.filter)"
```

---

### Task 9: Screens, audit record and docs

**Files:**
- Modify: `apps/web/scripts/screens.mjs`
- Create: `docs/design/audits/achievements.md` (from `docs/design/audits/_template.md`)
- Modify: `CLAUDE.md` (Layout/Engine/Web app sections: one line each for the new module, store, route)

- [ ] **Step 1: Screens script**

Read `apps/web/scripts/screens.mjs` end to end first. Then:
- Wherever the script's flow imports a collection, logs battles or runs Analyze, the welcome
  reveal (`.sheet` with title "Achievements") or the achievement toast may now appear. After each
  such step, dismiss them: close the sheet if present (its close control) and click "Not now" on
  an achievement toast if present, before the next capture. Captures of other screens must look
  exactly as before.
- Add captures: `#/achievements` (both themes, full page), the earned toast (log one more battle
  on a fresh device state or trigger it however the script seeds state), and the welcome reveal
  (seed a log of 5 battles in IndexedDB the way the script seeds other state, reload). Name them
  following the script's numbering.

- [ ] **Step 2: Run the full browser checks**

```bash
npm -w @pickthree/web run build
npm run web:screens
npm run web:audit
```
Expected: no console errors, captures written, existing captures unchanged in content. Look at
the achievements captures and compare against the mock PNGs in
`C:\Users\travi\AppData\Local\Temp\claude\D--Skunkworks-pickthree\f5f9c73d-dcc4-464a-90a0-46231600d68d\scratchpad\mocks\`.

- [ ] **Step 3: Audit record**

Copy `docs/design/audits/_template.md` to `docs/design/audits/achievements.md`, fill the
automated checks with the `web:audit` results for the achievements page, list the new parts
(spec, New parts), and leave the signature line for Travis.

- [ ] **Step 4: CLAUDE.md**

- Layout/Engine pipeline block: add `achievements/ facts from the log (daily cap, seasons), definitions, evaluate, Kanto tier table, roll`.
- Web app: `storage/db.ts` is now v3 with an `achievements` store; screens list gains
  Achievements (`#/achievements`); one sentence on `AchievementsProvider` (evaluates on boot, log
  changes and Analyze; saves before announcing).
- Data build list: `sprites/shiny/<id>.webp` for Kanto.

- [ ] **Step 5: Full gate and commit**

```bash
npm run lint && npm run typecheck && npm test && npm run check-colors
git add apps/web/scripts/screens.mjs docs/design/audits/achievements.md CLAUDE.md
git commit -m "Screens: achievements captures, reveal and toast dismissed in the flow; audit record; CLAUDE.md"
```

- [ ] **Step 6: Finish the branch**

Use superpowers:finishing-a-development-branch. The repo is solo: merge `achievements` into
`main` locally (fast-forward or merge commit) after the whole-branch review. Do not push: pushing
main deploys to pick3.gg, and that is Travis's call.
