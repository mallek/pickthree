# Tournament Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store tournament results in their own tables, ingest them over a keyed contract, and let
them enter meta.pick3.gg's default ranking as a better prior, while pick3 gains a Tournament league
built from the Play! ban list.

**Architecture:** Three separable phases. Phase 0 promotes PvPoke's `championshipseries` cup to a
pick3 league whose rankings, meta group and matrix are Great League's filtered to legal species (no
second simulation), and makes the meta bake ship the same legality list as `legal/<league>.json`.
Phase 1 adds `events`, `tournament_battles` and `roster_entries` to the existing `MetaStore` Durable
Object, four keyed ingest routes, and `source=` on the read routes, all landing dark. Phase 2 turns
the rank band select into a Source select and makes `rank.ts` blend in sequence: PvPoke's prior with
tournament pick share on its own curve, then shared ladder battles over the top on the existing
curve, unchanged.

**Tech Stack:** TypeScript 5.9 strict with `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`, Cloudflare Workers + Durable Object SQLite (`workers/counter`), Vite 8
+ React 19 (`apps/meta`, `apps/web`), vitest 4, `node:sqlite` for the store tests, tsx for the bake
and the fixture generator, puppeteer-core for the screens pass.

**Spec:** `docs/superpowers/specs/2026-09-21-tournament-data-design.md`

**Supersedes:** the "a facet on the existing band axis" sentence in
`docs/superpowers/specs/2026-09-18-meta-ranking-design.md`'s "Out of scope".

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Exact pinned versions.** No `^` or `~` in any `package.json`. This plan adds no dependency.
- **Braces on all control flow**, even single-line bodies (eslint `curly: all`).
- **No em dashes** anywhere: code, docs, commits, UI copy. eslint `no-restricted-syntax` rejects the
  literal. Use a plain dash or rewrite.
- **Player-facing output is strict 7-bit ASCII.** Screen names and notes are validated to
  `[\x20-\x7e]` at ingest; `apps/meta/scripts/screens.mjs` already fails the run on a non-ASCII
  character rendered anywhere.
- **Warnings as errors.** `npm run lint && npm run typecheck && npm test` must be clean at the end
  of every task. A flaky test is fixed at its root cause, never retried.
- **Stage explicit paths when committing.** Never `git add -A`.
- **Never commit a real Poke Genie export, and never a real tournament payload.** The payload at
  `D:\Skunkworks\pogo-stream-spike\out_vod\baltimore_2027_payload.json` is not copied into this
  repo. Fixtures are synthetic events with invented screen names, made by a generator under
  `fixtures/`.
- **The collection never leaves the device.** Nothing in this plan touches the app's outbound
  calls. Do not widen the CSP `connect-src` meta tag in `apps/web/index.html`.
- **Vendored PvPoke files under `packages/sim-pvpoke/vendor/` are verbatim.** Nothing in this plan
  edits them, so `golden.test.ts` is unaffected.
- **The spec is authoritative.** Execute it; do not re-litigate its design decisions.
- **Commits.** Direct commits on `main` (solo repo, no PR ceremony). End every commit message with:

  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

## Copy strings, fixed here so implementation does not invent them

Every string below is exact. Where a number is interpolated the generator expression is given.
`count`, `pct`, `battles`, `battleWord` and `plural` are `apps/meta/src/format.ts`.

**The app's new league** (`packages/data/src/leagues.ts`): `title` is `Tournament`, `short` is
`Tournament`. Singular, always.

**The site's Source select** (`apps/meta/src/App.tsx`): the select's accessible label is `Source`
(visually hidden, same as the two existing filters). Options, in this order:

| value | label |
| --- | --- |
| `all` | `All` |
| `prior` | `PvPoke` |
| `ladder` | `GBL` |
| `tournament` | `Tournaments` |

**The header line** (`apps/meta/src/headerCopy.ts`, Task 12). `lPct`, `tPct` and `pvpokePct` are
`Math.round(aL * 100)`, `Math.round((1 - aL) * aT * 100)` and `Math.round((1 - aL) * (1 - aT) * 100)`.

- `all`, with both populations:
  `PvPoke 45%, tournaments 22%, GBL 33%. From 480 shared battles by 9 devices and 105 tournament battles from 1 event.`
  Generated as
  `` `PvPoke ${pvpokePct}%, tournaments ${tPct}%, GBL ${lPct}%. From ${battles(b)} shared by ${count(d)} ${plural(d, 'device', 'devices')} and ${count(tb)} tournament ${battleWord(tb)} from ${count(ev)} ${plural(ev, 'event', 'events')}.` ``
- `all`, tournaments only (no shared battles yet):
  `` `PvPoke ${pvpokePct}%, tournaments ${tPct}%. From ${count(tb)} tournament ${battleWord(tb)} from ${count(ev)} ${plural(ev, 'event', 'events')}. No shared ladder battles in this window yet.` ``
- `all`, ladder only (no events in the window): the `ladder` line below, unchanged.
- `all`, neither: the screen's own zero sentence (`zero`, passed in by the caller).
- `ladder`: unchanged from today,
  `` `${lPct}% measured, from ${battles(b)} shared by ${count(d)} ${plural(d, 'device', 'devices')}` ``,
  and the screen's own `zero` sentence when `b === 0`.
- `tournament`:
  `33% from tournaments, 67% PvPoke. From 105 battles at 1 event. Not shared ladder play.`
  Generated as
  `` `${tPct2}% from tournaments, ${100 - tPct2}% PvPoke. From ${battles(tb)} at ${count(ev)} ${plural(ev, 'event', 'events')}. Not shared ladder play.` ``
  where `tPct2 = Math.round(aT * 100)`. With no tournament battles:
  `PvPoke's list. No tournament battles in this window yet.`
- `prior`:
  `` `PvPoke's list, commit ${commit.slice(0, 7)} from ${date}. Nothing measured.` ``

The screens' own `zero` sentences are unchanged: Pokemon passes
`PvPoke's list. No shared battles in this window yet.`, Teams passes
`Projected against PvPoke's meta group. No shared battles in this window yet.`, Species passes
`No shared battles in this window yet.`

**Pokemon list rows** under `source === 'tournament'` (`facedLine`, Task 13):

- banned: `Banned at tournaments`
- no tournament battles at all: `No tournament battles in this window`
- picked zero times: `Not picked in this window`
- otherwise: `` `${count(picks)} of ${count(tb)} battles (${pct(picks / tb)}%)` ``

and the record line is `` `players went ${w}-${l}` ``, or `no result recorded` when `w + l === 0`.
Under `source === 'prior'` a row prints one small line, `Nothing measured`, and no record line.
Under `all` and `ladder` the two lines are today's, unchanged.

**Species page tournaments row** (Task 14), inside the record card:

- banned: `Banned at tournaments`
- otherwise: `` `Tournaments: ${count(picks)} ${plural(picks, 'pick', 'picks')}, ${count(g1)} in game one, players went ${w}-${l}` ``
- unresolved forms, when `n > 0`: `` `Form not confirmed for ${count(n)} ${plural(n, 'pick', 'picks')}.` ``

**Species page roster line** (Task 14):

- picked at least once:
  `` `Brought by ${count(bb)} of ${count(rs)} ${plural(rs, 'player', 'players')} seen on stream, picked in ${count(po)} of their streamed ${plural(po, 'battle', 'battles')}.` ``
- never picked: `` `Brought by ${count(bb)} of ${count(rs)} ${plural(rs, 'player', 'players')} seen on stream, never picked on stream.` ``

**Species page tournament movesets block** (Task 14): heading `Moves at tournaments`, sub line
`` `From ${count(mk)} known ${plural(mk, 'set', 'sets')} of ${count(bb)} ${plural(bb, 'roster entry', 'roster entries')}` ``,
and PvPoke's own recommended set is marked with the trailing text `PvPoke's set`.

**Team board source line** (Task 13), shown only under `source === 'all'` when both are nonzero:
`` `From ${battles(lb)} shared and ${count(tb)} tournament ${battleWord(tb)}.` ``

## Decisions this plan makes, where the spec left room

1. **The read routes echo `source`, not `band`.** `MetaSummaryV1`, `TeamsV1` and `SpeciesDetailV1`
   replace their `band: string` field with `source: string`. The `bands` breakdown stays in the
   payload untouched. The spec's "`source=ladder` responses are byte for byte what `band=all`
   returned" is implemented as a test asserting deep equality of every field except the echoed
   request parameter, which is the only thing that can differ.
2. **Bad shape rejects the whole request.** A battles or roster POST with one malformed record
   stores nothing and answers `400` with
   `{ stored: 0, replaced: 0, rejected: <records in the body>, index, reason }`, so a pipeline run
   fails loudly. A clean request answers `200` with `{ stored, replaced, rejected: 0 }`.
3. **The worker never decides what is banned.** It has no legality data. A banned species is simply
   absent from `tournament.species` because nobody picked it; the site turns that absence into
   `Banned at tournaments` using `/legal/<league>.json`, which is exactly the job phase 0 gives that
   file. The spec's "banned species report null" is therefore a site behaviour and is tested there.
4. **The tournament read model reuses the ladder's aggregation through a mirror.** One tournament
   battle becomes two `BattleRow`-shaped views (each side as the reporter), which makes
   `speciesStats` and `teamBoard` produce exactly the numbers the spec describes, with no second
   copy of the arithmetic. Totals that must not double (battles, devices, sources) are passed in
   explicitly through a new `totals` override.
5. **The Tournament league's `meta` field is `great`.** The spec's league object does not name one,
   and the build reuses `meta/great` filtered to legal species.
6. **`/api/v1/meta` is fetched once, with `source=all`, whatever the Source select says.** That one
   cached response carries the ladder numbers and the tournament block, which is everything all four
   views need, so switching source costs no request and `prior` needs no worker call, as the spec
   requires. `/api/v1/teams` and `/api/v1/species/<id>` do follow the select, with `prior` mapped to
   `all` and the observed rows dropped on the client.

## File Structure

**Created**

| path | responsibility |
| --- | --- |
| `packages/data/src/build-derived.ts` | Legality set for a cup league; filtered copies of another league's rankings, meta group, overrides and matrix. |
| `packages/data/test/leagues.test.ts` | The shipped-cups allowlist and the Tournament league it produces. |
| `packages/data/test/build-derived.test.ts` | The filters, pure, with no PvPoke checkout needed. |
| `apps/web/test/leagueSwitcher.test.tsx` | The picker shows the cup league and not the special cups. |
| `workers/counter/src/tournament.ts` | Wire shapes, validation, and the open-equivalent cup map. |
| `workers/counter/src/tournamentStore.ts` | The three tables: DDL, upserts, delete, windowed reads. |
| `workers/counter/src/tournamentRead.ts` | Pure read model: the mirror, the tournament block, event list and event detail. |
| `workers/counter/test/sqliteShim.ts` | A `node:sqlite` stand-in for Cloudflare's `SqlStorage`, for the store tests. |
| `workers/counter/test/tournament.test.ts` | Parse and reject tests, in the style of `parseBatch`. |
| `workers/counter/test/tournamentStore.test.ts` | Upsert replaces, delete cascades, windowed reads. |
| `workers/counter/test/tournamentRead.test.ts` | The read model over the synthetic event. |
| `workers/counter/test/sourceShape.test.ts` | Ladder and tournament read paths return the same shape. |
| `fixtures/make-tournament.ts` | Deterministic synthetic event generator, invented screen names. |
| `fixtures/tournament-sample.json` | Its committed output: one event, its battles and its roster. |
| `apps/meta/src/legal.ts` | Loads and caches `/legal/<league>.json`. |
| `apps/meta/src/headerCopy.ts` | The one header sentence, per source, generated from the blend's own numbers. |
| `apps/meta/test/legal.test.ts` | The loader. |
| `apps/meta/test/headerCopy.test.ts` | Every branch of the sentence. |

**Modified**

| path | change |
| --- | --- |
| `packages/engine/src/gamedata/league.ts:27` | `kind` gains `'cup'`. |
| `packages/data/src/leagues.ts` | `SHIPPED_CUPS` allowlist and `DERIVES_FROM`. |
| `packages/data/src/build.ts` | Derived leagues built after their source league. |
| `apps/web/src/components/LeagueSwitcher.tsx:35` | Shows `kind !== 'special'`. |
| `apps/meta/scripts/bake.ts` | `OPEN_EQUIVALENT_CUP`, `legalFor`, writes `public/legal/<league>.json`. |
| `.gitignore` | `apps/meta/public/legal/`. |
| `workers/counter/src/battles.ts:12` | `BattleSource` gains `'broadcast'`. |
| `workers/counter/src/meta.ts` | `band` becomes `source`; band filtering removed; `totals` override; tournament block types. |
| `workers/counter/src/teams.ts` | Same two changes. |
| `workers/counter/src/index.ts` | Tables, ingest routes, event read routes, `source` plumbing. |
| `workers/counter/wrangler.toml` | Nothing. `/api/*` already runs the worker first. Listed so it is not searched for twice. |
| `apps/meta/src/api.ts`, `route.ts`, `useMeta.ts`, `App.tsx`, `rank.ts` | Source select, sequential blend. |
| `apps/meta/src/screens/Pokemon.tsx`, `Species.tsx`, `Teams.tsx` | Source-aware copy. |
| `apps/meta/scripts/screens.mjs` | Tournament fixture and the new needles. |
| `package.json` | `fixtures:tournament` script. |

---

# Phase 0: the Tournament league in pick3, and the legality list

Standalone and first, because phase 1's read model depends on knowing which cup a league's
tournaments are played under, and phase 2's "banned" copy depends on the legality list.

### Task 1: The Tournament league in the data build's league list

**Files:**
- Modify: `packages/engine/src/gamedata/league.ts:27`
- Modify: `packages/data/src/leagues.ts`
- Test: `packages/data/test/leagues.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `League['kind']` widened to `'standard' | 'special' | 'cup'`;
  `SHIPPED_CUPS: readonly ShippedCup[]` and `DERIVES_FROM: Record<string, string>` exported from
  `packages/data/src/leagues.ts`, where
  `interface ShippedCup { id: string; cup: string; title: string; short: string; cp: number; meta: string; derivesFrom: string }`.
  `readLeagues()` returns the three standard leagues followed by one entry per shipped cup.

- [ ] **Step 1: Write the failing test**

Create `packages/data/test/leagues.test.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DERIVES_FROM, SHIPPED_CUPS, readLeagues } from '../src/leagues.js';
import { GAMEMASTER_PATH } from '../src/paths.js';

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);

describe('SHIPPED_CUPS', () => {
  it('names the Play! Championship Series cup and where it derives from', () => {
    expect(SHIPPED_CUPS.map((c) => c.id)).toEqual(['championshipseries']);
    expect(DERIVES_FROM).toEqual({ championshipseries: 'great' });
  });
});

describe.skipIf(!havePvPoke)('readLeagues', () => {
  it('ships the Tournament league whatever PICKTHREE_SPECIAL_CUPS says', () => {
    const before = process.env['PICKTHREE_SPECIAL_CUPS'];
    delete process.env['PICKTHREE_SPECIAL_CUPS'];
    try {
      const leagues = readLeagues();
      const tournament = leagues.find((l) => l.id === 'championshipseries');
      expect(tournament).toBeDefined();
      expect(tournament!.title).toBe('Tournament');
      expect(tournament!.short).toBe('Tournament');
      expect(tournament!.cp).toBe(1500);
      expect(tournament!.cup).toBe('championshipseries');
      expect(tournament!.meta).toBe('great');
      expect(tournament!.kind).toBe('cup');
      expect(tournament!.minCp).toBe(1410);
      // The cup's own rules, copied from the gamemaster: no megas, no Mimikyu.
      expect(tournament!.include).toEqual([]);
      expect(tournament!.exclude).toEqual([
        { filterType: 'tag', values: ['mega'] },
        { filterType: 'id', values: ['mimikyu'] },
      ]);
    } finally {
      if (before !== undefined) {
        process.env['PICKTHREE_SPECIAL_CUPS'] = before;
      }
    }
  });

  it('keeps the three open leagues first and lists the cup exactly once', () => {
    const ids = readLeagues().map((l) => l.id);
    expect(ids.slice(0, 3)).toEqual(['great', 'ultra', 'master']);
    expect(ids.filter((id) => id === 'championshipseries')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project data test/leagues.test.ts`
Expected: FAIL, `No "SHIPPED_CUPS" export is defined on the module`.

- [ ] **Step 3: Widen the engine's `kind`**

In `packages/engine/src/gamedata/league.ts`, change line 27:

```ts
  /** `standard` is an open league, `special` a PvPoke format behind PICKTHREE_SPECIAL_CUPS, and
   *  `cup` a shipped tournament ruleset (the Play! ban list) that is always built. */
  kind: 'standard' | 'special' | 'cup';
```

- [ ] **Step 4: Add the allowlist to the data build**

In `packages/data/src/leagues.ts`, after the `STANDARD` constant:

```ts
/** One PvPoke cup promoted to a pick3 league whatever PICKTHREE_SPECIAL_CUPS says, because it is
 *  a ruleset players actually build for. Its rankings, meta group and matrix are derived from
 *  `derivesFrom` filtered to the cup's legal species (build-derived.ts) rather than simulated
 *  again: PvPoke's own `rankingAlias` for championshipseries is `all`, and matchups do not change
 *  when a species is banned. */
interface ShippedCup {
  id: string;
  cup: string;
  title: string;
  short: string;
  cp: number;
  meta: string;
  derivesFrom: string;
}

export const SHIPPED_CUPS: readonly ShippedCup[] = [
  {
    id: 'championshipseries',
    cup: 'championshipseries',
    title: 'Tournament',
    short: 'Tournament',
    cp: 1500,
    meta: 'great',
    derivesFrom: 'great',
  },
];

/** League id to the league whose rankings, meta group and matrix it is filtered from. */
export const DERIVES_FROM: Record<string, string> = Object.fromEntries(
  SHIPPED_CUPS.map((c) => [c.id, c.derivesFrom]),
);
```

and append them inside `readLeagues()`, before the `PICKTHREE_SPECIAL_CUPS` block (so the special
cups loop, which already skips `hideRankings` formats and therefore skips this one, can never
produce a duplicate):

```ts
  for (const shipped of SHIPPED_CUPS) {
    const cup = readCup(shipped.cup);
    out.push({
      id: shipped.id,
      title: shipped.title,
      short: shipped.short,
      cp: shipped.cp,
      cup: shipped.cup,
      meta: shipped.meta,
      kind: 'cup',
      minCp: minCpFor(shipped.cp),
      include: cup.include ?? [],
      exclude: cup.exclude ?? [],
      metaSize: 0,
    });
  }
```

and, inside the special cups loop, skip anything the allowlist already added:

```ts
    if (out.some((l) => l.id === idFor(f))) {
      continue;
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project data test/leagues.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: clean. `kind` is only compared against `'standard'` in
`apps/web/src/components/LeagueSwitcher.tsx:35`, which still compiles; Task 4 changes it.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/gamedata/league.ts packages/data/src/leagues.ts packages/data/test/leagues.test.ts
git commit -m "Data build: the Play! Championship Series cup ships as the Tournament league

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Derive the Tournament league's rankings, meta group and matrix from Great

**Files:**
- Create: `packages/data/src/build-derived.ts`
- Modify: `packages/data/src/build.ts`
- Test: `packages/data/test/build-derived.test.ts` (create)

**Interfaces:**
- Consumes: `SHIPPED_CUPS`, `DERIVES_FROM` (Task 1); `allowedInLeague`, `League`, `MatchupMatrix`,
  `MatrixView`, `matrixIndex`, `MetaEntry`, `RankingEntry`, `Species` from `@pickthree/engine`.
- Produces, all exported from `packages/data/src/build-derived.ts`:
  - `legalSet(species: readonly Species[], league: League): Set<string>`
  - `filterRankings(entries: readonly RankingEntry[], legal: ReadonlySet<string>): RankingEntry[]`
  - `filterMeta(entries: readonly MetaEntry[], legal: ReadonlySet<string>): MetaEntry[]`
  - `filterMatrix(m: MatchupMatrix, legal: ReadonlySet<string>, leagueId: string): MatchupMatrix`
  - `writeDerivedLeague(outDir: string, league: League, from: string, legal: ReadonlySet<string>): { meta: MetaEntry[] }`

- [ ] **Step 1: Write the failing test**

Create `packages/data/test/build-derived.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matrixIndex, type MatchupMatrix, type RankingEntry } from '@pickthree/engine';
import { filterMatrix, filterMeta, filterRankings } from '../src/build-derived.js';

const legal = new Set(['azumarill', 'medicham']);

function entry(speciesId: string, opponents: string[]): RankingEntry {
  return {
    speciesId,
    score: 90,
    rating: 600,
    moveset: ['F', 'C'],
    fastMoves: [],
    chargedMoves: [],
    matchups: opponents.map((opponent) => ({ opponent, rating: 600 })),
    counters: opponents.map((opponent) => ({ opponent, rating: 400 })),
    statProduct: null,
  };
}

describe('filterRankings', () => {
  it('drops banned entries and banned opponents inside the ones it keeps', () => {
    const out = filterRankings(
      [
        entry('azumarill', ['medicham', 'mimikyu']),
        entry('mimikyu', ['azumarill']),
        entry('medicham', ['mimikyu']),
      ],
      legal,
    );
    expect(out.map((e) => e.speciesId)).toEqual(['azumarill', 'medicham']);
    expect(out[0]!.matchups.map((m) => m.opponent)).toEqual(['medicham']);
    expect(out[0]!.counters.map((m) => m.opponent)).toEqual(['medicham']);
    expect(out[1]!.matchups).toEqual([]);
  });
});

describe('filterMeta', () => {
  it('keeps only legal meta entries', () => {
    const out = filterMeta(
      [
        { speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM'] },
        { speciesId: 'mimikyu', fastMove: 'SHADOW_CLAW', chargedMoves: ['PLAY_ROUGH'] },
      ],
      legal,
    );
    expect(out.map((m) => m.speciesId)).toEqual(['azumarill']);
  });
});

describe('filterMatrix', () => {
  const full: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios: [
      { shields: [0, 0], energy: [0, 0] },
      { shields: [1, 1], energy: [0, 0] },
    ],
    candidates: ['azumarill', 'mimikyu', 'medicham'],
    opponents: ['mimikyu', 'medicham'],
    candidateMovesets: { azumarill: ['A'], mimikyu: ['M'], medicham: ['D'] },
    opponentMovesets: { mimikyu: ['M'], medicham: ['D'] },
    ratings: [],
  };
  // A rating that encodes its own coordinates, so a misindexed copy is impossible to miss.
  for (let c = 0; c < full.candidates.length; c++) {
    for (let o = 0; o < full.opponents.length; o++) {
      for (let s = 0; s < full.scenarios.length; s++) {
        full.ratings.push(c * 100 + o * 10 + s);
      }
    }
  }

  it('keeps legal rows and columns and carries every rating to its new place', () => {
    const out = filterMatrix(full, legal, 'championshipseries');
    expect(out.league).toBe('championshipseries');
    expect(out.candidates).toEqual(['azumarill', 'medicham']);
    expect(out.opponents).toEqual(['medicham']);
    expect(Object.keys(out.candidateMovesets).sort()).toEqual(['azumarill', 'medicham']);
    expect(Object.keys(out.opponentMovesets)).toEqual(['medicham']);
    expect(out.ratings).toHaveLength(2 * 1 * 2);
    // azumarill (row 0 of the source) vs medicham (column 1 of the source), both scenarios.
    expect(out.ratings[matrixIndex(out, 0, 0, 0)]).toBe(0 * 100 + 1 * 10 + 0);
    expect(out.ratings[matrixIndex(out, 0, 0, 1)]).toBe(0 * 100 + 1 * 10 + 1);
    // medicham (row 2 of the source) vs medicham.
    expect(out.ratings[matrixIndex(out, 1, 0, 0)]).toBe(2 * 100 + 1 * 10 + 0);
  });

  it('returns the matrix unchanged in shape when nothing is banned', () => {
    const everything = new Set(full.candidates);
    const out = filterMatrix(full, everything, 'championshipseries');
    expect(out.candidates).toEqual(full.candidates);
    expect(out.opponents).toEqual(full.opponents);
    expect(out.ratings).toEqual(full.ratings);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project data test/build-derived.test.ts`
Expected: FAIL, cannot resolve `../src/build-derived.js`.

- [ ] **Step 3: Write `build-derived.ts`**

Create `packages/data/src/build-derived.ts`:

```ts
/**
 * A league whose rankings, meta group, overrides and matrix are another league's, filtered to the
 * species its cup allows. The Play! Championship Series is PvPoke's `all` ranking minus megas and
 * Mimikyu (its own `rankingAlias` says so), and a matchup does not change because a third species
 * was banned, so filtering is exact and a second simulation would only be a slower way to the
 * same numbers.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { League, MatchupMatrix, MetaEntry, RankingEntry, Species } from '@pickthree/engine';
import { MatrixView, allowedInLeague, matrixIndex } from '@pickthree/engine';
import { CATEGORIES } from './build-rankings.js';

/** Every species id the league's cup allows, by the engine's own cup rules. */
export function legalSet(species: readonly Species[], league: League): Set<string> {
  const out = new Set<string>();
  for (const sp of species) {
    if (allowedInLeague(sp, league)) {
      out.add(sp.speciesId);
    }
  }
  return out;
}

/** Banned entries go, and so do banned opponents inside the entries that stay: a counters list
 *  naming a species the cup forbids would send a reader to a matchup they can never have. */
export function filterRankings(
  entries: readonly RankingEntry[],
  legal: ReadonlySet<string>,
): RankingEntry[] {
  return entries
    .filter((e) => legal.has(e.speciesId))
    .map((e) => ({
      ...e,
      moveset: [...e.moveset],
      fastMoves: e.fastMoves.map((m) => ({ ...m })),
      chargedMoves: e.chargedMoves.map((m) => ({ ...m })),
      matchups: e.matchups.filter((m) => legal.has(m.opponent)).map((m) => ({ ...m })),
      counters: e.counters.filter((m) => legal.has(m.opponent)).map((m) => ({ ...m })),
    }));
}

export function filterMeta(entries: readonly MetaEntry[], legal: ReadonlySet<string>): MetaEntry[] {
  return entries
    .filter((m) => legal.has(m.speciesId))
    .map((m) => ({ ...m, chargedMoves: [...m.chargedMoves] }));
}

/** The same matrix with banned rows and columns removed. Modelled on bake.ts's `sliceMatrix`:
 *  a `MatrixView` over the original resolves each surviving cell by its old coordinates. */
export function filterMatrix(
  m: MatchupMatrix,
  legal: ReadonlySet<string>,
  leagueId: string,
): MatchupMatrix {
  const candidates = m.candidates.filter((id) => legal.has(id));
  const opponents = m.opponents.filter((id) => legal.has(id));
  const out: MatchupMatrix = {
    league: leagueId,
    cp: m.cp,
    scenarios: m.scenarios.map((s) => ({ shields: s.shields, energy: s.energy })),
    candidates,
    opponents,
    candidateMovesets: Object.fromEntries(
      candidates.map((id) => [id, [...(m.candidateMovesets[id] ?? [])]]),
    ),
    opponentMovesets: Object.fromEntries(
      opponents.map((id) => [id, [...(m.opponentMovesets[id] ?? [])]]),
    ),
    ratings: [],
  };
  const view = new MatrixView(m);
  const oldColumn = opponents.map((id) => m.opponents.indexOf(id));
  const ratings = new Array<number>(
    candidates.length * opponents.length * m.scenarios.length,
  ).fill(0);
  candidates.forEach((id, ci) => {
    const from = view.rowOf(id) as number;
    oldColumn.forEach((oi, newOi) => {
      m.scenarios.forEach((_, si) => {
        ratings[matrixIndex(out, ci, newOi, si)] = view.rating(from, oi, si);
      });
    });
  });
  out.ratings = ratings;
  return out;
}

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(...parts), 'utf8')) as T;
}

/**
 * Writes `rankings/<id>/`, `meta/<id>.json`, `overrides/<id>.json` and `matrix/<id>.json` for a
 * derived league, reading the already-written files of `from`. The source league must have been
 * built first, which build.ts guarantees by ordering. The matrix is skipped when the source has
 * none, which is what PICKTHREE_SKIP_MATRIX=1 leaves behind.
 */
export function writeDerivedLeague(
  outDir: string,
  league: League,
  from: string,
  legal: ReadonlySet<string>,
): { meta: MetaEntry[] } {
  const rankDir = path.join(outDir, 'rankings', league.id);
  fs.mkdirSync(rankDir, { recursive: true });
  for (const cat of CATEGORIES) {
    const source = readJson<RankingEntry[]>(outDir, 'rankings', from, `${cat}.json`);
    fs.writeFileSync(
      path.join(rankDir, `${cat}.json`),
      JSON.stringify(filterRankings(source, legal)),
    );
  }

  fs.mkdirSync(path.join(outDir, 'meta'), { recursive: true });
  const meta = filterMeta(readJson<MetaEntry[]>(outDir, 'meta', `${from}.json`), legal);
  fs.writeFileSync(path.join(outDir, 'meta', `${league.id}.json`), JSON.stringify(meta));

  fs.mkdirSync(path.join(outDir, 'overrides'), { recursive: true });
  const overrides = readJson<{ speciesId: string }[]>(outDir, 'overrides', `${from}.json`);
  fs.writeFileSync(
    path.join(outDir, 'overrides', `${league.id}.json`),
    JSON.stringify(overrides.filter((o) => legal.has(o.speciesId))),
  );

  const sourceMatrix = path.join(outDir, 'matrix', `${from}.json`);
  if (fs.existsSync(sourceMatrix)) {
    const filtered = filterMatrix(
      JSON.parse(fs.readFileSync(sourceMatrix, 'utf8')) as MatchupMatrix,
      legal,
      league.id,
    );
    fs.writeFileSync(path.join(outDir, 'matrix', `${league.id}.json`), JSON.stringify(filtered));
  }

  return { meta };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project data test/build-derived.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Build the derived leagues in `build.ts`**

In `packages/data/src/build.ts`, add to the imports:

```ts
import { legalSet, writeDerivedLeague } from './build-derived.js';
import { DERIVES_FROM, readLeagues } from './leagues.js';
```

(replacing the existing `readLeagues` import line), and replace the single
`for (const league of leagues)` loop with:

```ts
  // Source leagues first: a derived league reads their written files, not PvPoke's.
  const sourceLeagues = leagues.filter((l) => DERIVES_FROM[l.id] === undefined);
  const derivedLeagues = leagues.filter((l) => DERIVES_FROM[l.id] !== undefined);
  for (const league of sourceLeagues) {
    const { meta } = writeLeagueRankings(OUTPUT_DIR, league);
    league.metaSize = meta.length;
    console.log(`${league.id}: meta ${meta.length}`);
    if (sim) {
      const m = writeMatrix(OUTPUT_DIR, league, sim);
      if (league.id === 'great') {
        matrixCounts = {
          candidates: m.candidates.length,
          opponents: m.opponents.length,
          scenarios: m.scenarios.length,
        };
      }
    }
  }
  for (const league of derivedLeagues) {
    const from = DERIVES_FROM[league.id] as string;
    const legal = legalSet(data.species, league);
    const { meta } = writeDerivedLeague(OUTPUT_DIR, league, from, legal);
    league.metaSize = meta.length;
    console.log(`${league.id}: meta ${meta.length} (from ${from}, ${legal.size} legal)`);
  }
```

- [ ] **Step 6: Run the real build and check the output**

Run:

```bash
PICKTHREE_SKIP_SPRITES=1 PICKTHREE_SKIP_MATRIX=1 npm run data:build
node -e "const fs=require('fs');const d='apps/web/public/data';const g=JSON.parse(fs.readFileSync(d+'/rankings/great/overall.json'));const c=JSON.parse(fs.readFileSync(d+'/rankings/championshipseries/overall.json'));const cs=new Set(c.map(e=>e.speciesId));const banned=g.map(e=>e.speciesId).filter(id=>!cs.has(id));console.log('great',g.length,'cup',c.length,'banned',banned.length);console.log('mimikyu banned?',banned.includes('mimikyu'));console.log('all banned are mega or mimikyu?',banned.every(id=>id.includes('mega')||id.startsWith('mimikyu')));const m=JSON.parse(fs.readFileSync(d+'/meta/championshipseries.json'));console.log('meta',m.length,'has mimikyu?',m.some(x=>x.speciesId==='mimikyu'));"
```

Expected: the cup ranking is shorter than Great's, `mimikyu banned? true`, `all banned are mega or
mimikyu? true`, and the meta group has no Mimikyu. Record the three counts in the task report.

- [ ] **Step 7: Run the full build with the matrix, once, and check a cell survived the filter**

Run: `PICKTHREE_SKIP_SPRITES=1 npm run data:build`
Then:

```bash
node -e "const fs=require('fs');const d='apps/web/public/data';const a=JSON.parse(fs.readFileSync(d+'/matrix/great.json'));const b=JSON.parse(fs.readFileSync(d+'/matrix/championshipseries.json'));console.log('great',a.candidates.length,'x',a.opponents.length,'cup',b.candidates.length,'x',b.opponents.length);const idx=(m,c,o,s)=>((c*m.opponents.length)+o)*m.scenarios.length+s;const ai=a.candidates.indexOf('azumarill'),bi=b.candidates.indexOf('azumarill');const ao=a.opponents.indexOf('altaria'),bo=b.opponents.indexOf('altaria');for(let s=0;s<3;s++){console.log(s,a.ratings[idx(a,ai,ao,s)],b.ratings[idx(b,bi,bo,s)]);}"
```

Expected: the three rating pairs are identical. That is the "filtering is exact" claim, checked.

- [ ] **Step 8: Run the whole suite, lint and typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add packages/data/src/build-derived.ts packages/data/src/build.ts packages/data/test/build-derived.test.ts
git commit -m "Data build: derive the Tournament league from Great, filtered to legal species

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The meta bake ships `legal/<league>.json`

**Files:**
- Modify: `apps/meta/scripts/bake.ts`
- Modify: `.gitignore`
- Test: `apps/meta/test/bake.test.ts`

**Interfaces:**
- Consumes: the `rankings/<league>/overall.json` files the data build writes, including
  `rankings/championshipseries/overall.json` from Task 2.
- Produces, exported from `apps/meta/scripts/bake.ts`:
  - `OPEN_EQUIVALENT_CUP: Record<string, string>`, exactly `{ great: 'championshipseries' }`.
  - `interface LegalFile { cup: string | null; banned: string[] }`
  - `legalFor(leagueId: string, leagueRanks: readonly { speciesId: string }[], cupRanks: readonly { speciesId: string }[] | null): LegalFile`
  - The file `apps/meta/public/legal/<league>.json` per site league.

- [ ] **Step 1: Write the failing test**

Append to `apps/meta/test/bake.test.ts`, and add `OPEN_EQUIVALENT_CUP, legalFor` to its import from
`../scripts/bake.js`:

```ts
describe('legalFor', () => {
  it('names the open-equivalent cup only for Great League', () => {
    expect(OPEN_EQUIVALENT_CUP).toEqual({ great: 'championshipseries' });
  });

  it('lists every ranked species the cup drops, in the league ranking order', () => {
    const leagueRanks = [
      { speciesId: 'azumarill' },
      { speciesId: 'mimikyu' },
      { speciesId: 'venusaur_mega' },
      { speciesId: 'medicham' },
    ];
    const cupRanks = [{ speciesId: 'azumarill' }, { speciesId: 'medicham' }];
    expect(legalFor('great', leagueRanks, cupRanks)).toEqual({
      cup: 'championshipseries',
      banned: ['mimikyu', 'venusaur_mega'],
    });
  });

  it('gives a league with no Play! format an empty list and no cup', () => {
    expect(legalFor('ultra', [{ speciesId: 'giratina_altered' }], null)).toEqual({
      cup: null,
      banned: [],
    });
  });

  it('de-duplicates a league ranking that lists a species twice', () => {
    const leagueRanks = [
      { speciesId: 'mimikyu' },
      { speciesId: 'mimikyu' },
      { speciesId: 'azumarill' },
    ];
    expect(legalFor('great', leagueRanks, [{ speciesId: 'azumarill' }]).banned).toEqual([
      'mimikyu',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project meta test/bake.test.ts`
Expected: FAIL, `No "legalFor" export is defined on the module`.

- [ ] **Step 3: Implement `legalFor` in the bake**

In `apps/meta/scripts/bake.ts`, next to `MATRIX_TOP`:

```ts
/**
 * The tournament cup each site league's Play! events are played under. Only events on this cup
 * enter that league's blend (Sao Paulo's laic2027 bans four types and fifteen named species;
 * pooling it into a Great League ranking would be nonsense). Ultra and Master have no Play!
 * format and get a null cup and an empty ban list.
 *
 * The same map exists in workers/counter/src/tournament.ts as OPEN_EQUIVALENT_CUP, for the same
 * reason api.ts writes the wire shapes down twice: this app does not depend on that workspace,
 * and a rule written on both sides is the contract. Both copies are asserted by their own test.
 */
export const OPEN_EQUIVALENT_CUP: Record<string, string> = { great: 'championshipseries' };

export interface LegalFile {
  /** The open-equivalent tournament cup, or null when the league has no Play! format. */
  cup: string | null;
  /** Species the league's ranking lists that the cup does not: what "banned" means on a page. */
  banned: string[];
}

/** The league's ranked species minus the cup's, in the league's own ranking order. */
export function legalFor(
  leagueId: string,
  leagueRanks: readonly { speciesId: string }[],
  cupRanks: readonly { speciesId: string }[] | null,
): LegalFile {
  const cup = OPEN_EQUIVALENT_CUP[leagueId] ?? null;
  if (cup === null || cupRanks === null) {
    return { cup: null, banned: [] };
  }
  const allowed = new Set(cupRanks.map((r) => r.speciesId));
  const banned: string[] = [];
  const seen = new Set<string>();
  for (const r of leagueRanks) {
    if (!allowed.has(r.speciesId) && !seen.has(r.speciesId)) {
      seen.add(r.speciesId);
      banned.push(r.speciesId);
    }
  }
  return { cup, banned };
}
```

- [ ] **Step 4: Write the files in `main()`**

In `apps/meta/scripts/bake.ts`'s `main()`, after the `ranks`/`matrix` loop writes its files, add:

```ts
  await mkdir(join(OUT, 'legal'), { recursive: true });
  for (const league of engineLeagues) {
    const cup = OPEN_EQUIVALENT_CUP[league.id] ?? null;
    let cupRanks: RankingEntry[] | null = null;
    if (cup !== null) {
      // The data build writes the cup as its own league (packages/data/src/build-derived.ts), so
      // a missing file means the build is older than the Tournament league and must be rerun,
      // not that nothing is banned. Failing loudly beats shipping an empty ban list.
      cupRanks = await readJson<RankingEntry[]>(DATA, 'rankings', cup, 'overall.json');
    }
    const overall = await readJson<RankingEntry[]>(DATA, 'rankings', league.id, 'overall.json');
    const file = legalFor(league.id, overall, cupRanks);
    await writeFile(join(OUT, 'legal', `${league.id}.json`), JSON.stringify(file));
    sizes.push(`legal/${league.id}.json ${file.banned.length} banned`);
  }
```

Note: `engineLeagues` is read from `leagues.json`, which now includes `championshipseries`. That
league's own `legal/championshipseries.json` comes out as `{ cup: null, banned: [] }`, which is
right: the site has no such league and never asks for it, and nothing is banned inside a cup
relative to itself.

- [ ] **Step 5: Ignore the new output directory**

In `.gitignore`, under the "generated by the apps/meta bake" block, after
`apps/meta/public/matrix/`:

```
apps/meta/public/legal/
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --project meta test/bake.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the real bake and read the file**

Run:

```bash
npm -w @pickthree/meta run build
node -e "const fs=require('fs');const g=JSON.parse(fs.readFileSync('apps/meta/public/legal/great.json'));console.log('cup',g.cup,'banned',g.banned.length,'mimikyu?',g.banned.includes('mimikyu'));const u=JSON.parse(fs.readFileSync('apps/meta/public/legal/ultra.json'));console.log('ultra',JSON.stringify(u));"
```

Expected: `cup championshipseries`, a nonzero banned count, `mimikyu? true`, and
`ultra {"cup":null,"banned":[]}`.

- [ ] **Step 8: Whole suite, lint, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/meta/scripts/bake.ts apps/meta/test/bake.test.ts .gitignore
git commit -m "Meta bake: ship the Play! legality list as legal/<league>.json

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The Tournament league in the app's league picker

**Files:**
- Modify: `apps/web/src/components/LeagueSwitcher.tsx:35`
- Test: `apps/web/test/leagueSwitcher.test.tsx` (create)

**Interfaces:**
- Consumes: `League['kind']` widened in Task 1.
- Produces: nothing other tasks read. The picker shows every league whose `kind` is not
  `'special'`, so the three open leagues and the shipped cups appear and the
  `PICKTHREE_SPECIAL_CUPS` formats stay hidden.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/leagueSwitcher.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { League } from '@pickthree/engine';
import { LeagueSwitcher } from '../src/components/LeagueSwitcher.tsx';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { GREAT, fakeHost } from './fakeHost.ts';

const TOURNAMENT: League = {
  id: 'championshipseries',
  title: 'Tournament',
  short: 'Tournament',
  cp: 1500,
  cup: 'championshipseries',
  meta: 'great',
  kind: 'cup',
  minCp: 1410,
  include: [],
  exclude: [
    { filterType: 'tag', values: ['mega'] },
    { filterType: 'id', values: ['mimikyu'] },
  ],
  metaSize: 3,
};

const REMIX: League = { ...TOURNAMENT, id: 'remix', title: 'Remix', short: 'Remix', kind: 'special' };

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

describe('LeagueSwitcher', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    latest = null;
  });

  it('offers the shipped cup next to the open leagues and hides the special cups', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, TOURNAMENT, REMIX],
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.boot).toBe('ready'));
    expect(screen.getByRole('radio', { name: 'Great League' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Tournament' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Remix' })).not.toBeInTheDocument();
  });

  it('switches the league in play to the cup', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, TOURNAMENT],
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.boot).toBe('ready'));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Tournament' }));
    });
    await waitFor(() => expect(latest?.settings.league).toBe('championshipseries'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project web test/leagueSwitcher.test.tsx`
Expected: FAIL on the first test, `Unable to find an accessible element with the role "radio" and
name "Tournament"`.

- [ ] **Step 3: Show the cup leagues**

In `apps/web/src/components/LeagueSwitcher.tsx`, change line 35 and its comment:

```tsx
  // Open leagues and the shipped tournament cups (League.kind 'standard' and 'cup'). The
  // PICKTHREE_SPECIAL_CUPS formats stay out: their rules work, but the app does not yet know
  // enough about them (megas in the Mega cups, for one) to recommend with a straight face.
  const leagues = (s.data?.leagues ?? []).filter((l) => l.kind !== 'special');
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project web test/leagueSwitcher.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: See it in the real app**

Run, in two terminals:

```bash
npm -w @pickthree/web run dev
```

Open `http://localhost:5173`, switch to Tournament, and confirm on the Report screen that the
assumptions block names the Tournament league and that Mimikyu appears in no recommendation. The
league bundle is fetched from `/data/rankings/championshipseries/`, which Task 2 wrote.

- [ ] **Step 6: Screens pass**

Run: `npm run web:screens`
Expected: no console errors, every screen captured. The switcher now has four segments; check the
captured Welcome and Report shots for sideways overflow at 390px and note the result in the task
report. If the four segments do not fit, say so in the report rather than changing the label:
`Tournament` is fixed by the spec, and a layout fix is a separate decision.

- [ ] **Step 7: Whole suite, lint, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/LeagueSwitcher.tsx apps/web/test/leagueSwitcher.test.tsx
git commit -m "App: the Tournament league appears in the league picker

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Phase 0 is now complete and shippable on its own.** pick3 has a Tournament league; the meta site
ships a legality list nothing reads yet.

---

# Phase 1: storage, ingest and read routes

Lands dark: nothing reads `source=` until phase 2, and the phone's `/battles` route cannot reach
these tables.

### Task 5: The wire contract

**Files:**
- Create: `workers/counter/src/tournament.ts`
- Modify: `workers/counter/src/battles.ts:12`
- Test: `workers/counter/test/tournament.test.ts` (create)

**Interfaces:**
- Consumes: `SharedMoves` from `workers/counter/src/battles.js`.
- Produces, exported from `workers/counter/src/tournament.ts`:
  - `TOURNAMENT_SOURCE: 'broadcast'`, `MAX_TOURNAMENT_BATCH = 200`,
    `OPEN_EQUIVALENT_CUP: Record<string, string>`, `EVENT_ID: RegExp`.
  - Types `FormSource`, `Stage`, `MatchFormat`, `Bracket`, `WinnerSide`, `ResultSource`,
    `EventInput`, `SideInput`, `TournamentBattleInput`, `BattlesBody`, `RosterEntryInput`,
    `RosterBody`, `Parsed<T>`.
  - `parseEventBody(body: unknown, id: string): Parsed<EventInput>`
  - `parseBattlesBody(body: unknown): Parsed<BattlesBody>`
  - `parseRosterBody(body: unknown): Parsed<RosterBody>`
- Also produces: `BattleSource` in `battles.ts` widened to `'ladder' | 'broadcast'`.

- [ ] **Step 1: Write the failing test**

Create `workers/counter/test/tournament.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  OPEN_EQUIVALENT_CUP,
  parseBattlesBody,
  parseEventBody,
  parseRosterBody,
} from '../src/tournament.js';

const event = {
  name: '2027 Baltimore Pokemon GO Regional Championships',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  league: 'great',
  cup: 'championshipseries',
  vods: ['v2878411375', 'v2879365540'],
  notes: null,
};

const battle = {
  id: 'v2878411375-051',
  at: '2026-09-18T21:55:13Z',
  day: 1,
  stage: 'groups',
  group: 'G',
  roundLabel: 'LOSERS FINALS - GROUP G',
  match: 'day1-22',
  game: 1,
  matchFormat: 'bo3',
  bracket: 'losers',
  bracketDepth: 7,
  left: { player: 'ARCWARDEN', team: ['altaria', 'clodsire', 'melmetal'], forms: ['rk9', 'rk9', 'rk9'] },
  right: { player: 'BLUEKITE', team: ['corviknight', 'dunsparce'], forms: ['rk9', 'unresolved'] },
  winnerSide: null,
  resultSource: null,
  scoreAtStart: [0, 0],
  evidence: ['v2878411375_06-55-34_score_0-0.jpg'],
  notes: null,
};

const batch = { extractor: 'pogo-stream-spike 0.3', battles: [battle] };

describe('OPEN_EQUIVALENT_CUP', () => {
  it("matches the bake's own copy of the rule", () => {
    expect(OPEN_EQUIVALENT_CUP).toEqual({ great: 'championshipseries' });
  });
});

describe('parseEventBody', () => {
  it('accepts the shape the pipeline sends and stamps the id from the path', () => {
    const r = parseEventBody(event, '2027-baltimore-regional');
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.id).toBe('2027-baltimore-regional');
    expect(r.ok && r.value.vods).toEqual(['v2878411375', 'v2879365540']);
    expect(r.ok && r.value.notes).toBeNull();
  });

  it('rejects a bad id, a bad date and a non-ASCII name', () => {
    expect(parseEventBody(event, 'Baltimore 2027').ok).toBe(false);
    expect(parseEventBody({ ...event, startDate: '18/09/2026' }, 'e-1').ok).toBe(false);
    expect(parseEventBody({ ...event, name: 'Sao ' + String.fromCharCode(0xe3) + ' Paulo' }, 'e-1').ok).toBe(false);
    expect(parseEventBody({ ...event, vods: [''] }, 'e-1').ok).toBe(false);
    expect(parseEventBody({ ...event, league: 'Great' }, 'e-1').ok).toBe(false);
  });
});

describe('parseBattlesBody', () => {
  it('accepts a partial team, an unresolved form and a null winner', () => {
    const r = parseBattlesBody(batch);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.battles[0]!.right.team).toEqual(['corviknight', 'dunsparce']);
    expect(r.ok && r.value.battles[0]!.right.forms).toEqual(['rk9', 'unresolved']);
    expect(r.ok && r.value.battles[0]!.winnerSide).toBeNull();
    expect(r.ok && r.value.battles[0]!.at).toBe('2026-09-18T21:55:13.000Z');
  });

  it('accepts a resolved result when both winner and source are set', () => {
    const r = parseBattlesBody({
      ...batch,
      battles: [{ ...battle, winnerSide: 'left', resultSource: 'banner' }],
    });
    expect(r.ok && r.value.battles[0]!.winnerSide).toBe('left');
  });

  it('rejects a record for shape, naming the offending index and reason', () => {
    const bad = (patch: Record<string, unknown>) =>
      parseBattlesBody({ ...batch, battles: [battle, { ...battle, id: 'x2', ...patch }] });
    for (const patch of [
      { left: { ...battle.left, forms: ['rk9'] } },
      { left: { ...battle.left, team: [] } },
      { left: { ...battle.left, team: ['a', 'b', 'c', 'd'], forms: ['rk9', 'rk9', 'rk9', 'rk9'] } },
      { left: { ...battle.left, player: '' } },
      { winnerSide: 'left' },
      { resultSource: 'banner' },
      { game: 0 },
      { game: 8 },
      { day: 4 },
      { bracketDepth: 10 },
      { stage: 'quarters' },
      { bracket: 'consolation' },
      { matchFormat: 'bo7' },
      { scoreAtStart: [0, 4] },
      { scoreAtStart: [0] },
      { at: 'yesterday' },
      { notes: 'x'.repeat(501) },
      { evidence: [''] },
    ]) {
      const r = bad(patch);
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      expect(!r.ok && r.index).toBe(1);
      expect(!r.ok && r.reason.length).toBeGreaterThan(0);
    }
  });

  it('rejects an empty batch, an over-long batch and a missing extractor', () => {
    expect(parseBattlesBody({ ...batch, battles: [] }).ok).toBe(false);
    expect(
      parseBattlesBody({
        ...batch,
        battles: Array.from({ length: 201 }, (_, i) => ({ ...battle, id: `b${i}` })),
      }).ok,
    ).toBe(false);
    expect(parseBattlesBody({ battles: [battle] }).ok).toBe(false);
  });
});

describe('parseRosterBody', () => {
  const entries = [
    {
      player: 'FIRESTAR73',
      slot: 1,
      species: 'corsola_galarian',
      moves: { fast: 'ASTONISH', charged: ['NIGHT_SHADE', 'POWER_GEM'] },
    },
    { player: 'FIRESTAR73', slot: 2, species: 'jumpluff_shadow', moves: null },
  ];

  it('accepts entries with and without a moveset', () => {
    const r = parseRosterBody({ entries });
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.entries[1]!.moves).toBeNull();
    expect(r.ok && r.value.entries[0]!.moves!.charged).toEqual(['NIGHT_SHADE', 'POWER_GEM']);
  });

  it('rejects a bad slot, a bad species and a charged list of three', () => {
    const bad = (patch: Record<string, unknown>) =>
      parseRosterBody({ entries: [entries[0], { ...entries[1], ...patch }] });
    expect(bad({ slot: 0 }).ok).toBe(false);
    expect(bad({ slot: 7 }).ok).toBe(false);
    expect(bad({ species: 'Corsola' }).ok).toBe(false);
    expect(bad({ moves: { fast: 'ASTONISH', charged: ['A', 'B', 'C'] } }).ok).toBe(false);
    expect(bad({ moves: { fast: 'astonish', charged: ['A'] } }).ok).toBe(false);
    const r = bad({ slot: 0 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.index).toBe(1);
    expect(!r.ok && r.reason).toBe('bad slot');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project counter test/tournament.test.ts`
Expected: FAIL, cannot resolve `../src/tournament.js`.

- [ ] **Step 3: Widen `BattleSource`**

In `workers/counter/src/battles.ts`, replace lines 8 to 14 with:

```ts
/** Where a record came from. `ladder` is everything the app sends; `broadcast` is a tournament
 * battle read off an official stream (docs/superpowers/specs/2026-09-21-tournament-data-design.md).
 * Stamped by the worker, never accepted from the client: a client that could name its own source
 * could forge the population the separate tables exist to keep apart. The two live in different
 * tables; this type is shared only so one read model can aggregate either. */
export type BattleSource = 'ladder' | 'broadcast';
export const DEFAULT_SOURCE: BattleSource = 'ladder';
```

- [ ] **Step 4: Write `tournament.ts`**

Create `workers/counter/src/tournament.ts`:

```ts
/**
 * The tournament wire contract: what the extraction pipeline PUTs and POSTs, and what the worker
 * will accept. Nothing here touches the ladder tables.
 *
 * A record is rejected for SHAPE only, never for gaps. Partial teams, null winners, missing
 * movesets and unresolved forms all validate: 15 of Baltimore's 105 battles have no winner and
 * that is honest data. One malformed record rejects the whole request, with its index and reason,
 * so a pipeline run fails loudly rather than half-landing.
 *
 * The only identity anywhere is the screen name, which is public on the broadcast and on RK9's
 * roster. The roster parser never sees a first name, a last name or a country: those columns are
 * never extracted upstream, so there is no moment at which a legal name exists on our side.
 */
import type { SharedMoves } from './battles.js';

/** Stamped by the route on every battle. A hand-entered result would be a third value later. */
export const TOURNAMENT_SOURCE = 'broadcast';
/** The most records one battles or roster request may carry. */
export const MAX_TOURNAMENT_BATCH = 200;

/**
 * The tournament cup each site league's Play! events are played under. Only events on this cup
 * enter that league's blend. The same map exists in apps/meta/scripts/bake.ts, for the same reason
 * api.ts writes the wire shapes down twice: neither workspace depends on the other, and a rule
 * written on both sides is the contract. Both copies are asserted by their own test.
 */
export const OPEN_EQUIVALENT_CUP: Record<string, string> = { great: 'championshipseries' };

export const EVENT_ID = /^[a-z0-9-]{3,64}$/;
const BATTLE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SPECIES = /^[a-z0-9_]+$/;
const MOVE = /^[A-Z0-9_]+$/;
const SLUG = /^[a-z0-9_]+$/;
const VOD = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Printable 7-bit ASCII, 1 to 40 characters. Stored as sent, compared case-insensitively. */
const PLAYER = /^[\x20-\x7e]{1,40}$/;
/** Printable 7-bit ASCII, up to 500 characters. */
const TEXT = /^[\x20-\x7e]{0,500}$/;

export type FormSource = 'rk9' | 'unresolved';
export type Stage = 'groups' | 'top_cut';
export type MatchFormat = 'bo3' | 'bo5';
export type Bracket = 'winners' | 'losers' | 'grand';
export type WinnerSide = 'left' | 'right';
export type ResultSource = 'score' | 'banner' | 'format' | 'human';

const FORM_SOURCES: readonly string[] = ['rk9', 'unresolved'];
const STAGES: readonly string[] = ['groups', 'top_cut'];
const FORMATS: readonly string[] = ['bo3', 'bo5'];
const BRACKETS: readonly string[] = ['winners', 'losers', 'grand'];
const SIDES: readonly string[] = ['left', 'right'];
const RESULT_SOURCES: readonly string[] = ['score', 'banner', 'format', 'human'];

export interface EventInput {
  /** From the path, not the body. */
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  league: string;
  cup: string;
  vods: string[];
  notes: string | null;
}

export interface SideInput {
  player: string;
  /** 1 to 3 species ids. */
  team: string[];
  /** Same length as `team`. */
  forms: FormSource[];
}

export interface TournamentBattleInput {
  id: string;
  at: string;
  day: number;
  stage: Stage;
  group: string | null;
  roundLabel: string | null;
  match: string;
  game: number;
  matchFormat: MatchFormat;
  bracket: Bracket;
  bracketDepth: number;
  left: SideInput;
  right: SideInput;
  winnerSide: WinnerSide | null;
  resultSource: ResultSource | null;
  scoreAtStart: [number, number];
  evidence: string[];
  notes: string | null;
}

export interface BattlesBody {
  /** Pipeline name and version, stored like the ladder's `client`. */
  extractor: string;
  battles: TournamentBattleInput[];
}

export interface RosterEntryInput {
  player: string;
  /** 1 to 6. Order is not meaningful. */
  slot: number;
  /** Species id with its form spelled out, e.g. corsola_galarian. */
  species: string;
  moves: SharedMoves | null;
}

export interface RosterBody {
  entries: RosterEntryInput[];
}

/** A parse either yields a value or names the first offending record and why. `index` is -1 when
 *  the failure is the envelope itself rather than one record. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; index: number; reason: string };

function fail(index: number, reason: string): { ok: false; index: number; reason: string } {
  return { ok: false, index, reason };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(x: unknown, re: RegExp): string | null {
  return typeof x === 'string' && re.test(x) ? x : null;
}

function nullableText(x: unknown, re: RegExp): string | null | undefined {
  if (x === null || x === undefined) {
    return null;
  }
  return typeof x === 'string' && re.test(x) ? x : undefined;
}

function intIn(x: unknown, lo: number, hi: number): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi ? x : null;
}

function isoDay(x: unknown): string | null {
  const s = str(x, ISO_DATE);
  return s !== null && !Number.isNaN(Date.parse(s)) ? s : null;
}

export function parseEventBody(body: unknown, id: string): Parsed<EventInput> {
  if (!EVENT_ID.test(id)) {
    return fail(-1, 'bad event id');
  }
  if (!isRecord(body)) {
    return fail(-1, 'not an object');
  }
  const name = str(body['name'], TEXT);
  if (name === null || name.length === 0) {
    return fail(-1, 'bad name');
  }
  const startDate = isoDay(body['startDate']);
  const endDate = isoDay(body['endDate']);
  if (startDate === null || endDate === null) {
    return fail(-1, 'bad dates');
  }
  const league = str(body['league'], SLUG);
  const cup = str(body['cup'], SLUG);
  if (league === null || cup === null) {
    return fail(-1, 'bad league or cup');
  }
  const rawVods = body['vods'];
  if (!Array.isArray(rawVods) || rawVods.some((v) => str(v, VOD) === null)) {
    return fail(-1, 'bad vods');
  }
  const notes = nullableText(body['notes'], TEXT);
  if (notes === undefined) {
    return fail(-1, 'bad notes');
  }
  return {
    ok: true,
    value: { id, name, startDate, endDate, league, cup, vods: [...(rawVods as string[])], notes },
  };
}

function parseSide(x: unknown): SideInput | string {
  if (!isRecord(x)) {
    return 'side is not an object';
  }
  const player = str(x['player'], PLAYER);
  if (player === null) {
    return 'bad player';
  }
  const team = x['team'];
  const forms = x['forms'];
  if (
    !Array.isArray(team) ||
    team.length < 1 ||
    team.length > 3 ||
    team.some((t) => str(t, SPECIES) === null)
  ) {
    return 'bad team';
  }
  if (
    !Array.isArray(forms) ||
    forms.length !== team.length ||
    forms.some((f) => typeof f !== 'string' || !FORM_SOURCES.includes(f))
  ) {
    return 'bad forms';
  }
  return { player, team: [...(team as string[])], forms: [...(forms as FormSource[])] };
}

function parseBattle(x: unknown): TournamentBattleInput | string {
  if (!isRecord(x)) {
    return 'not an object';
  }
  const id = str(x['id'], BATTLE_ID);
  if (id === null) {
    return 'bad id';
  }
  const atRaw = x['at'];
  if (typeof atRaw !== 'string' || Number.isNaN(Date.parse(atRaw))) {
    return 'bad at';
  }
  const day = intIn(x['day'], 1, 3);
  const game = intIn(x['game'], 1, 7);
  const bracketDepth = intIn(x['bracketDepth'], 1, 9);
  if (day === null || game === null || bracketDepth === null) {
    return 'bad day, game or bracketDepth';
  }
  const stage = x['stage'];
  const matchFormat = x['matchFormat'];
  const bracket = x['bracket'];
  if (typeof stage !== 'string' || !STAGES.includes(stage)) {
    return 'bad stage';
  }
  if (typeof matchFormat !== 'string' || !FORMATS.includes(matchFormat)) {
    return 'bad matchFormat';
  }
  if (typeof bracket !== 'string' || !BRACKETS.includes(bracket)) {
    return 'bad bracket';
  }
  const match = str(x['match'], TEXT);
  if (match === null || match.length === 0) {
    return 'bad match';
  }
  const group = nullableText(x['group'], TEXT);
  const roundLabel = nullableText(x['roundLabel'], TEXT);
  const notes = nullableText(x['notes'], TEXT);
  if (group === undefined || roundLabel === undefined || notes === undefined) {
    return 'bad group, roundLabel or notes';
  }
  const left = parseSide(x['left']);
  if (typeof left === 'string') {
    return `left: ${left}`;
  }
  const right = parseSide(x['right']);
  if (typeof right === 'string') {
    return `right: ${right}`;
  }
  const winnerRaw = x['winnerSide'] ?? null;
  const sourceRaw = x['resultSource'] ?? null;
  const winnerOk = winnerRaw === null || (typeof winnerRaw === 'string' && SIDES.includes(winnerRaw));
  const sourceOk =
    sourceRaw === null || (typeof sourceRaw === 'string' && RESULT_SOURCES.includes(sourceRaw));
  if (!winnerOk || !sourceOk) {
    return 'bad winnerSide or resultSource';
  }
  if ((winnerRaw === null) !== (sourceRaw === null)) {
    return 'winnerSide and resultSource must both be null or both be set';
  }
  const score = x['scoreAtStart'];
  if (
    !Array.isArray(score) ||
    score.length !== 2 ||
    score.some((n) => intIn(n, 0, 3) === null)
  ) {
    return 'bad scoreAtStart';
  }
  const evidence = x['evidence'];
  if (!Array.isArray(evidence) || evidence.some((f) => str(f, FILE_NAME) === null)) {
    return 'bad evidence';
  }
  return {
    id,
    at: new Date(atRaw).toISOString(),
    day,
    stage: stage as Stage,
    group,
    roundLabel,
    match,
    game,
    matchFormat: matchFormat as MatchFormat,
    bracket: bracket as Bracket,
    bracketDepth,
    left,
    right,
    winnerSide: winnerRaw as WinnerSide | null,
    resultSource: sourceRaw as ResultSource | null,
    scoreAtStart: [score[0] as number, score[1] as number],
    evidence: [...(evidence as string[])],
    notes,
  };
}

export function parseBattlesBody(body: unknown): Parsed<BattlesBody> {
  if (!isRecord(body)) {
    return fail(-1, 'not an object');
  }
  const extractor = str(body['extractor'], TEXT);
  if (extractor === null || extractor.length === 0 || extractor.length > 40) {
    return fail(-1, 'bad extractor');
  }
  const raw = body['battles'];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TOURNAMENT_BATCH) {
    return fail(-1, 'bad battles array');
  }
  const battles: TournamentBattleInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const parsed = parseBattle(raw[i]);
    if (typeof parsed === 'string') {
      return fail(i, parsed);
    }
    battles.push(parsed);
  }
  return { ok: true, value: { extractor, battles } };
}

function parseMoves(x: unknown): SharedMoves | null | undefined {
  if (x === null || x === undefined) {
    return null;
  }
  if (!isRecord(x)) {
    return undefined;
  }
  const fast = str(x['fast'], MOVE);
  const charged = x['charged'];
  if (fast === null) {
    return undefined;
  }
  if (
    !Array.isArray(charged) ||
    charged.length < 1 ||
    charged.length > 2 ||
    charged.some((c) => str(c, MOVE) === null)
  ) {
    return undefined;
  }
  return { fast, charged: [...new Set(charged as string[])] };
}

function parseRosterEntry(x: unknown): RosterEntryInput | string {
  if (!isRecord(x)) {
    return 'not an object';
  }
  const player = str(x['player'], PLAYER);
  const species = str(x['species'], SPECIES);
  const slot = intIn(x['slot'], 1, 6);
  if (player === null) {
    return 'bad player';
  }
  if (slot === null) {
    return 'bad slot';
  }
  if (species === null) {
    return 'bad species';
  }
  const moves = parseMoves(x['moves']);
  if (moves === undefined) {
    return 'bad moves';
  }
  return { player, slot, species, moves };
}

export function parseRosterBody(body: unknown): Parsed<RosterBody> {
  if (!isRecord(body)) {
    return fail(-1, 'not an object');
  }
  const raw = body['entries'];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TOURNAMENT_BATCH) {
    return fail(-1, 'bad entries array');
  }
  const entries: RosterEntryInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const parsed = parseRosterEntry(raw[i]);
    if (typeof parsed === 'string') {
      return fail(i, parsed);
    }
    entries.push(parsed);
  }
  return { ok: true, value: { entries } };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project counter test/tournament.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: clean. If eslint objects to the `\x20` range in a character class, it is
`no-control-regex` misfiring on a non-control range; keep the range and do not disable the rule
without saying so in the task report.

- [ ] **Step 7: Commit**

```bash
git add workers/counter/src/tournament.ts workers/counter/src/battles.ts workers/counter/test/tournament.test.ts
git commit -m "Counter: the tournament wire contract and its validation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The three tables and their store

**Files:**
- Create: `workers/counter/src/tournamentStore.ts`
- Create: `workers/counter/test/sqliteShim.ts`
- Test: `workers/counter/test/tournamentStore.test.ts` (create)

**Interfaces:**
- Consumes: `EventInput`, `RosterEntryInput`, `TournamentBattleInput`, `TOURNAMENT_SOURCE`,
  `FormSource`, `ResultSource`, `WinnerSide` (Task 5); `SharedMoves` from `battles.js`.
- Produces, exported from `workers/counter/src/tournamentStore.ts`:
  - `interface Sql { exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[]; rowsWritten: number } }`
  - `interface EventRow`, `interface TournamentBattleRow`, `interface RosterRow` (fields listed in
    the code below).
  - `createTournamentTables(sql: Sql): void`
  - `putEvent(sql: Sql, e: EventInput, received: string): void`
  - `getEvent(sql: Sql, id: string): EventRow | null`
  - `deleteEvent(sql: Sql, id: string): { events: number; battles: number; roster: number }`
  - `putBattles(sql: Sql, event: EventRow, extractor: string, battles: readonly TournamentBattleInput[], received: string): { stored: number; replaced: number }`
  - `putRoster(sql: Sql, eventId: string, entries: readonly RosterEntryInput[], received: string): { stored: number; replaced: number }`
  - `readTournamentBattles(sql: Sql, league: string, since: string, until: string): TournamentBattleRow[]`
  - `readEventsInWindow(sql: Sql, league: string, since: string, until: string): EventRow[]`
  - `readEventBattles(sql: Sql, eventId: string): TournamentBattleRow[]`
  - `readEventRoster(sql: Sql, eventId: string): RosterRow[]`
  - `readRosterForEvents(sql: Sql, eventIds: readonly string[]): RosterRow[]`

- [ ] **Step 1: Write the sqlite stand-in**

Create `workers/counter/test/sqliteShim.ts`:

```ts
/**
 * Cloudflare's `SqlStorage` driven by node:sqlite, so the store's real SQL runs in a real SQLite
 * rather than against a fake that answers everything with an empty array. Node 24 ships
 * node:sqlite without a flag. Only the slice tournamentStore.ts uses is implemented:
 * `exec(query, ...bindings)` returning `{ toArray(), rowsWritten }`.
 */
import { DatabaseSync } from 'node:sqlite';
import type { Sql } from '../src/tournamentStore.js';

const READS = /^\s*(SELECT|PRAGMA|WITH)/i;

export function sqliteShim(): { sql: Sql; close: () => void } {
  const db = new DatabaseSync(':memory:');
  const sql: Sql = {
    exec(query: string, ...bindings: unknown[]) {
      if (READS.test(query)) {
        const rows = db
          .prepare(query)
          .all(...(bindings as never[])) as unknown as Record<string, unknown>[];
        return { toArray: () => rows, rowsWritten: 0 };
      }
      if (bindings.length === 0) {
        // Multi-statement DDL, the one shape node:sqlite's own exec() takes.
        db.exec(query);
        return { toArray: () => [], rowsWritten: 0 };
      }
      const result = db.prepare(query).run(...(bindings as never[]));
      return { toArray: () => [], rowsWritten: Number(result.changes) };
    },
  };
  return { sql, close: () => db.close() };
}
```

- [ ] **Step 2: Write the failing test**

Create `workers/counter/test/tournamentStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventInput, RosterEntryInput, TournamentBattleInput } from '../src/tournament.js';
import {
  createTournamentTables,
  deleteEvent,
  getEvent,
  putBattles,
  putEvent,
  putRoster,
  readEventBattles,
  readEventRoster,
  readEventsInWindow,
  readRosterForEvents,
  readTournamentBattles,
  type Sql,
} from '../src/tournamentStore.js';
import { sqliteShim } from './sqliteShim.js';

const RECEIVED = '2026-09-21T00:00:00.000Z';

const EVENT: EventInput = {
  id: '2027-baltimore-regional',
  name: '2027 Baltimore Regional',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  league: 'great',
  cup: 'championshipseries',
  vods: ['v1', 'v2'],
  notes: null,
};

function battle(over: Partial<TournamentBattleInput> = {}): TournamentBattleInput {
  return {
    id: 'v1-001',
    at: '2026-09-18T21:55:13.000Z',
    day: 1,
    stage: 'groups',
    group: 'G',
    roundLabel: 'ROUND 1',
    match: 'day1-22',
    game: 1,
    matchFormat: 'bo3',
    bracket: 'losers',
    bracketDepth: 7,
    left: { player: 'ARCWARDEN', team: ['altaria', 'clodsire'], forms: ['rk9', 'unresolved'] },
    right: { player: 'BLUEKITE', team: ['corviknight'], forms: ['rk9'] },
    winnerSide: null,
    resultSource: null,
    scoreAtStart: [0, 0],
    evidence: ['a.jpg'],
    notes: null,
    ...over,
  };
}

const ROSTER: RosterEntryInput[] = [
  { player: 'ARCWARDEN', slot: 1, species: 'altaria', moves: { fast: 'DRAGON_BREATH', charged: ['MOONBLAST'] } },
  { player: 'ARCWARDEN', slot: 2, species: 'clodsire', moves: null },
];

let sql: Sql;
let close: () => void;

beforeEach(() => {
  const shim = sqliteShim();
  sql = shim.sql;
  close = shim.close;
  createTournamentTables(sql);
});

afterEach(() => {
  close();
});

describe('events', () => {
  it('stores and reads one back, with vods round-tripped', () => {
    putEvent(sql, EVENT, RECEIVED);
    const row = getEvent(sql, EVENT.id);
    expect(row).not.toBeNull();
    expect(row!.name).toBe('2027 Baltimore Regional');
    expect(row!.vods).toEqual(['v1', 'v2']);
    expect(row!.received).toBe(RECEIVED);
    expect(getEvent(sql, 'nope')).toBeNull();
  });

  it('upserts by id rather than adding a second row', () => {
    putEvent(sql, EVENT, RECEIVED);
    putEvent(sql, { ...EVENT, name: 'Renamed', notes: 'day 2 only' }, '2026-09-22T00:00:00.000Z');
    const row = getEvent(sql, EVENT.id);
    expect(row!.name).toBe('Renamed');
    expect(row!.notes).toBe('day 2 only');
    expect(row!.received).toBe('2026-09-22T00:00:00.000Z');
  });
});

describe('battles', () => {
  beforeEach(() => {
    putEvent(sql, EVENT, RECEIVED);
  });

  it('stores every field and stamps source, league and cup from the event', () => {
    const counts = putBattles(sql, getEvent(sql, EVENT.id)!, 'spike 0.3', [battle()], RECEIVED);
    expect(counts).toEqual({ stored: 1, replaced: 0 });
    const [row] = readEventBattles(sql, EVENT.id);
    expect(row!.league).toBe('great');
    expect(row!.cup).toBe('championshipseries');
    expect(row!.source).toBe('broadcast');
    expect(row!.extractor).toBe('spike 0.3');
    expect(row!.leftTeam).toEqual(['altaria', 'clodsire']);
    expect(row!.leftForms).toEqual(['rk9', 'unresolved']);
    expect(row!.rightTeam).toEqual(['corviknight']);
    expect(row!.scoreAtStart).toEqual([0, 0]);
    expect(row!.evidence).toEqual(['a.jpg']);
    expect(row!.winnerSide).toBeNull();
    expect(row!.group).toBe('G');
  });

  it('replaces a row a later pass resolves, and says it replaced it', () => {
    const event = getEvent(sql, EVENT.id)!;
    putBattles(sql, event, 'spike 0.3', [battle()], RECEIVED);
    const counts = putBattles(
      sql,
      event,
      'spike 0.4',
      [battle({ winnerSide: 'right', resultSource: 'banner', evidence: ['a.jpg', 'b.jpg'] })],
      '2026-09-22T00:00:00.000Z',
    );
    expect(counts).toEqual({ stored: 0, replaced: 1 });
    const rows = readEventBattles(sql, EVENT.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.winnerSide).toBe('right');
    expect(rows[0]!.resultSource).toBe('banner');
    expect(rows[0]!.evidence).toEqual(['a.jpg', 'b.jpg']);
    expect(rows[0]!.extractor).toBe('spike 0.4');
  });

  it('reads a league window half-open, newest first', () => {
    const event = getEvent(sql, EVENT.id)!;
    putBattles(
      sql,
      event,
      'spike',
      [
        battle({ id: 'a', at: '2026-09-17T00:00:00.000Z' }),
        battle({ id: 'b', at: '2026-09-18T00:00:00.000Z' }),
        battle({ id: 'c', at: '2026-09-19T00:00:00.000Z' }),
      ],
      RECEIVED,
    );
    const rows = readTournamentBattles(
      sql,
      'great',
      '2026-09-18T00:00:00.000Z',
      '2026-09-19T00:00:00.000Z',
    );
    expect(rows.map((r) => r.id)).toEqual(['b']);
    expect(
      readTournamentBattles(sql, 'ultra', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
    ).toEqual([]);
    const all = readTournamentBattles(
      sql,
      'great',
      '2026-09-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    );
    expect(all.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('lists an event in a window only when one of its battles is in it', () => {
    const event = getEvent(sql, EVENT.id)!;
    putBattles(sql, event, 'spike', [battle({ at: '2026-09-18T00:00:00.000Z' })], RECEIVED);
    expect(
      readEventsInWindow(sql, 'great', '2026-09-17T00:00:00.000Z', '2026-09-19T00:00:00.000Z').map(
        (e) => e.id,
      ),
    ).toEqual([EVENT.id]);
    expect(
      readEventsInWindow(sql, 'great', '2026-09-19T00:00:00.000Z', '2026-09-20T00:00:00.000Z'),
    ).toEqual([]);
  });
});

describe('roster', () => {
  beforeEach(() => {
    putEvent(sql, EVENT, RECEIVED);
  });

  it('stores entries and upserts by player and slot', () => {
    expect(putRoster(sql, EVENT.id, ROSTER, RECEIVED)).toEqual({ stored: 2, replaced: 0 });
    expect(putRoster(sql, EVENT.id, [{ ...ROSTER[1]!, species: 'melmetal' }], RECEIVED)).toEqual({
      stored: 0,
      replaced: 1,
    });
    const rows = readEventRoster(sql, EVENT.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.slot === 2)!.species).toBe('melmetal');
    expect(rows.find((r) => r.slot === 1)!.moves).toEqual({
      fast: 'DRAGON_BREATH',
      charged: ['MOONBLAST'],
    });
    expect(rows.find((r) => r.slot === 2)!.moves).toBeNull();
  });

  it('reads the roster of several events at once', () => {
    putEvent(sql, { ...EVENT, id: 'other-event' }, RECEIVED);
    putRoster(sql, EVENT.id, ROSTER, RECEIVED);
    putRoster(sql, 'other-event', [{ ...ROSTER[0]!, player: 'CINDERVANE' }], RECEIVED);
    expect(readRosterForEvents(sql, [EVENT.id, 'other-event'])).toHaveLength(3);
    expect(readRosterForEvents(sql, [])).toEqual([]);
  });
});

describe('deleteEvent', () => {
  it('takes the event, its battles and its roster in one go', () => {
    putEvent(sql, EVENT, RECEIVED);
    putEvent(sql, { ...EVENT, id: 'keep-me' }, RECEIVED);
    const event = getEvent(sql, EVENT.id)!;
    putBattles(sql, event, 'spike', [battle(), battle({ id: 'v1-002' })], RECEIVED);
    putRoster(sql, EVENT.id, ROSTER, RECEIVED);
    putBattles(sql, getEvent(sql, 'keep-me')!, 'spike', [battle({ id: 'other' })], RECEIVED);

    expect(deleteEvent(sql, EVENT.id)).toEqual({ events: 1, battles: 2, roster: 2 });
    expect(getEvent(sql, EVENT.id)).toBeNull();
    expect(readEventBattles(sql, EVENT.id)).toEqual([]);
    expect(readEventRoster(sql, EVENT.id)).toEqual([]);
    expect(readEventBattles(sql, 'keep-me')).toHaveLength(1);
    expect(deleteEvent(sql, 'nope')).toEqual({ events: 0, battles: 0, roster: 0 });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --project counter test/tournamentStore.test.ts`
Expected: FAIL, cannot resolve `../src/tournamentStore.js`.

- [ ] **Step 4: Write `tournamentStore.ts`**

Create `workers/counter/src/tournamentStore.ts`:

```ts
/**
 * The three tournament tables, in the same Durable Object as the ladder `battles` table and
 * never touching it. Everything the payload carries is stored: the tournament page (next spec)
 * renders a bracket, and a bracket cannot be rebuilt from a trimmed row.
 *
 * Battles and roster entries are UPSERTS, not insert-or-ignore, which is the one rule the ladder
 * path must not lend here: a re-run that resolves a winner the first pass left null has to
 * replace the row, and `evidence`, `resultSource` and `extractor` ride along so the replaced row
 * still says why.
 */
import type { SharedMoves } from './battles.js';
import {
  TOURNAMENT_SOURCE,
  type EventInput,
  type FormSource,
  type ResultSource,
  type RosterEntryInput,
  type TournamentBattleInput,
  type WinnerSide,
} from './tournament.js';

/** The slice of Cloudflare's SqlStorage this module uses. Structural on purpose, so the tests can
 *  drive the real SQL with a node:sqlite stand-in instead of a Durable Object. */
export interface Sql {
  exec(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): Record<string, unknown>[]; rowsWritten: number };
}

/** The most rows one read returns. Matches SUMMARY_ROWS in index.ts. */
const READ_ROWS = 100_000;

export interface EventRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  league: string;
  cup: string;
  vods: string[];
  notes: string | null;
  received: string;
}

export interface TournamentBattleRow {
  id: string;
  event: string;
  league: string;
  cup: string;
  at: string;
  day: number;
  stage: string;
  group: string | null;
  roundLabel: string | null;
  match: string;
  game: number;
  matchFormat: string;
  bracket: string;
  bracketDepth: number;
  leftPlayer: string;
  rightPlayer: string;
  leftTeam: string[];
  rightTeam: string[];
  leftForms: FormSource[];
  rightForms: FormSource[];
  winnerSide: WinnerSide | null;
  resultSource: ResultSource | null;
  scoreAtStart: [number, number];
  evidence: string[];
  notes: string | null;
  source: string;
  extractor: string;
  received: string;
}

export interface RosterRow {
  event: string;
  player: string;
  slot: number;
  species: string;
  moves: SharedMoves | null;
  received: string;
}

export function createTournamentTables(sql: Sql): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      league TEXT NOT NULL,
      cup TEXT NOT NULL,
      vods TEXT NOT NULL,
      notes TEXT,
      received TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_battles (
      id TEXT PRIMARY KEY,
      event TEXT NOT NULL,
      league TEXT NOT NULL,
      cup TEXT NOT NULL,
      at TEXT NOT NULL,
      day INTEGER NOT NULL,
      stage TEXT NOT NULL,
      grp TEXT,
      round_label TEXT,
      "match" TEXT NOT NULL,
      game INTEGER NOT NULL,
      match_format TEXT NOT NULL,
      bracket TEXT NOT NULL,
      bracket_depth INTEGER NOT NULL,
      left_player TEXT NOT NULL,
      right_player TEXT NOT NULL,
      left_team TEXT NOT NULL,
      right_team TEXT NOT NULL,
      left_forms TEXT NOT NULL,
      right_forms TEXT NOT NULL,
      winner_side TEXT,
      result_source TEXT,
      score_at_start TEXT NOT NULL,
      evidence TEXT NOT NULL,
      notes TEXT,
      source TEXT NOT NULL,
      extractor TEXT NOT NULL,
      received TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tb_league_at ON tournament_battles (league, at);
    CREATE INDEX IF NOT EXISTS tb_event ON tournament_battles (event);
    CREATE TABLE IF NOT EXISTS roster_entries (
      event TEXT NOT NULL,
      player TEXT NOT NULL,
      slot INTEGER NOT NULL,
      species TEXT NOT NULL,
      fast TEXT,
      charged TEXT,
      received TEXT NOT NULL,
      PRIMARY KEY (event, player, slot)
    );
    CREATE INDEX IF NOT EXISTS roster_event_species ON roster_entries (event, species);
  `);
}

export function putEvent(sql: Sql, e: EventInput, received: string): void {
  sql.exec(
    `INSERT INTO events (id, name, start_date, end_date, league, cup, vods, notes, received)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date,
       league = excluded.league, cup = excluded.cup, vods = excluded.vods,
       notes = excluded.notes, received = excluded.received`,
    e.id,
    e.name,
    e.startDate,
    e.endDate,
    e.league,
    e.cup,
    JSON.stringify(e.vods),
    e.notes,
    received,
  );
}

function eventRow(r: Record<string, unknown>): EventRow {
  return {
    id: String(r['id']),
    name: String(r['name']),
    startDate: String(r['start_date']),
    endDate: String(r['end_date']),
    league: String(r['league']),
    cup: String(r['cup']),
    vods: JSON.parse(String(r['vods'])) as string[],
    notes: r['notes'] === null || r['notes'] === undefined ? null : String(r['notes']),
    received: String(r['received']),
  };
}

export function getEvent(sql: Sql, id: string): EventRow | null {
  const rows = sql.exec('SELECT * FROM events WHERE id = ?', id).toArray();
  const first = rows[0];
  return first ? eventRow(first) : null;
}

export function deleteEvent(
  sql: Sql,
  id: string,
): { events: number; battles: number; roster: number } {
  const battles = sql.exec('DELETE FROM tournament_battles WHERE event = ?', id).rowsWritten;
  const roster = sql.exec('DELETE FROM roster_entries WHERE event = ?', id).rowsWritten;
  const events = sql.exec('DELETE FROM events WHERE id = ?', id).rowsWritten;
  return { events, battles, roster };
}

export function putBattles(
  sql: Sql,
  event: EventRow,
  extractor: string,
  battles: readonly TournamentBattleInput[],
  received: string,
): { stored: number; replaced: number } {
  const existing = new Set(
    sql
      .exec('SELECT id FROM tournament_battles WHERE event = ?', event.id)
      .toArray()
      .map((r) => String(r['id'])),
  );
  let stored = 0;
  let replaced = 0;
  for (const b of battles) {
    if (existing.has(b.id)) {
      replaced += 1;
    } else {
      stored += 1;
    }
    sql.exec(
      `INSERT INTO tournament_battles
         (id, event, league, cup, at, day, stage, grp, round_label, "match", game, match_format,
          bracket, bracket_depth, left_player, right_player, left_team, right_team, left_forms,
          right_forms, winner_side, result_source, score_at_start, evidence, notes, source,
          extractor, received)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         event = excluded.event, league = excluded.league, cup = excluded.cup, at = excluded.at,
         day = excluded.day, stage = excluded.stage, grp = excluded.grp,
         round_label = excluded.round_label, "match" = excluded."match", game = excluded.game,
         match_format = excluded.match_format, bracket = excluded.bracket,
         bracket_depth = excluded.bracket_depth, left_player = excluded.left_player,
         right_player = excluded.right_player, left_team = excluded.left_team,
         right_team = excluded.right_team, left_forms = excluded.left_forms,
         right_forms = excluded.right_forms, winner_side = excluded.winner_side,
         result_source = excluded.result_source, score_at_start = excluded.score_at_start,
         evidence = excluded.evidence, notes = excluded.notes, source = excluded.source,
         extractor = excluded.extractor, received = excluded.received`,
      b.id,
      event.id,
      event.league,
      event.cup,
      b.at,
      b.day,
      b.stage,
      b.group,
      b.roundLabel,
      b.match,
      b.game,
      b.matchFormat,
      b.bracket,
      b.bracketDepth,
      b.left.player,
      b.right.player,
      JSON.stringify(b.left.team),
      JSON.stringify(b.right.team),
      JSON.stringify(b.left.forms),
      JSON.stringify(b.right.forms),
      b.winnerSide,
      b.resultSource,
      JSON.stringify(b.scoreAtStart),
      JSON.stringify(b.evidence),
      b.notes,
      TOURNAMENT_SOURCE,
      extractor,
      received,
    );
  }
  return { stored, replaced };
}

export function putRoster(
  sql: Sql,
  eventId: string,
  entries: readonly RosterEntryInput[],
  received: string,
): { stored: number; replaced: number } {
  const existing = new Set(
    sql
      .exec('SELECT player, slot FROM roster_entries WHERE event = ?', eventId)
      .toArray()
      .map((r) => `${String(r['player'])}:${String(r['slot'])}`),
  );
  let stored = 0;
  let replaced = 0;
  for (const e of entries) {
    if (existing.has(`${e.player}:${e.slot}`)) {
      replaced += 1;
    } else {
      stored += 1;
    }
    sql.exec(
      `INSERT INTO roster_entries (event, player, slot, species, fast, charged, received)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event, player, slot) DO UPDATE SET
         species = excluded.species, fast = excluded.fast, charged = excluded.charged,
         received = excluded.received`,
      eventId,
      e.player,
      e.slot,
      e.species,
      e.moves ? e.moves.fast : null,
      e.moves ? JSON.stringify(e.moves.charged) : null,
      received,
    );
  }
  return { stored, replaced };
}

function battleRow(r: Record<string, unknown>): TournamentBattleRow {
  const text = (k: string): string | null =>
    r[k] === null || r[k] === undefined ? null : String(r[k]);
  const score = JSON.parse(String(r['score_at_start'])) as number[];
  return {
    id: String(r['id']),
    event: String(r['event']),
    league: String(r['league']),
    cup: String(r['cup']),
    at: String(r['at']),
    day: Number(r['day']),
    stage: String(r['stage']),
    group: text('grp'),
    roundLabel: text('round_label'),
    match: String(r['match']),
    game: Number(r['game']),
    matchFormat: String(r['match_format']),
    bracket: String(r['bracket']),
    bracketDepth: Number(r['bracket_depth']),
    leftPlayer: String(r['left_player']),
    rightPlayer: String(r['right_player']),
    leftTeam: JSON.parse(String(r['left_team'])) as string[],
    rightTeam: JSON.parse(String(r['right_team'])) as string[],
    leftForms: JSON.parse(String(r['left_forms'])) as FormSource[],
    rightForms: JSON.parse(String(r['right_forms'])) as FormSource[],
    winnerSide: text('winner_side') as WinnerSide | null,
    resultSource: text('result_source') as ResultSource | null,
    scoreAtStart: [score[0] ?? 0, score[1] ?? 0],
    evidence: JSON.parse(String(r['evidence'])) as string[],
    notes: text('notes'),
    source: String(r['source']),
    extractor: String(r['extractor']),
    received: String(r['received']),
  };
}

export function readTournamentBattles(
  sql: Sql,
  league: string,
  since: string,
  until: string,
): TournamentBattleRow[] {
  return sql
    .exec(
      `SELECT * FROM tournament_battles
        WHERE league = ? AND at >= ? AND at < ? ORDER BY at DESC, id DESC LIMIT ?`,
      league,
      since,
      until,
      READ_ROWS,
    )
    .toArray()
    .map(battleRow);
}

/** An event is "in the window" when at least one of its battles is: one rule, so the event list
 *  and the battle counts can never disagree about which events a window holds. */
export function readEventsInWindow(
  sql: Sql,
  league: string,
  since: string,
  until: string,
): EventRow[] {
  return sql
    .exec(
      `SELECT * FROM events e
        WHERE e.league = ?
          AND EXISTS (SELECT 1 FROM tournament_battles b
                       WHERE b.event = e.id AND b.at >= ? AND b.at < ?)
        ORDER BY e.start_date DESC, e.id ASC`,
      league,
      since,
      until,
    )
    .toArray()
    .map(eventRow);
}

export function readEventBattles(sql: Sql, eventId: string): TournamentBattleRow[] {
  return sql
    .exec(
      `SELECT * FROM tournament_battles WHERE event = ?
        ORDER BY day ASC, at ASC, game ASC, id ASC LIMIT ?`,
      eventId,
      READ_ROWS,
    )
    .toArray()
    .map(battleRow);
}

function rosterRow(r: Record<string, unknown>): RosterRow {
  const fast = r['fast'] === null || r['fast'] === undefined ? null : String(r['fast']);
  const charged =
    r['charged'] === null || r['charged'] === undefined
      ? null
      : (JSON.parse(String(r['charged'])) as string[]);
  return {
    event: String(r['event']),
    player: String(r['player']),
    slot: Number(r['slot']),
    species: String(r['species']),
    moves: fast !== null && charged !== null ? { fast, charged } : null,
    received: String(r['received']),
  };
}

export function readEventRoster(sql: Sql, eventId: string): RosterRow[] {
  return sql
    .exec(
      'SELECT * FROM roster_entries WHERE event = ? ORDER BY player ASC, slot ASC LIMIT ?',
      eventId,
      READ_ROWS,
    )
    .toArray()
    .map(rosterRow);
}

export function readRosterForEvents(sql: Sql, eventIds: readonly string[]): RosterRow[] {
  if (eventIds.length === 0) {
    return [];
  }
  const holes = eventIds.map(() => '?').join(', ');
  return sql
    .exec(
      `SELECT * FROM roster_entries WHERE event IN (${holes}) ORDER BY event ASC, player ASC, slot ASC LIMIT ?`,
      ...eventIds,
      READ_ROWS,
    )
    .toArray()
    .map(rosterRow);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project counter test/tournamentStore.test.ts`
Expected: PASS. If node:sqlite prints an ExperimentalWarning, leave it: it is a warning from the
runtime, not from the build, and the suite is still clean.

- [ ] **Step 6: Create the tables in the Durable Object**

In `workers/counter/src/index.ts`, at the end of the `MetaStore` constructor (after the two
`ALTER TABLE` migrations), add:

```ts
    createTournamentTables(ctx.storage.sql);
```

with the import `import { createTournamentTables } from './tournamentStore.js';`. `CREATE TABLE IF
NOT EXISTS` is the same migration pattern the ladder table already uses, so no wrangler migration
tag is needed: the tables live inside the existing `MetaStore` class.

- [ ] **Step 7: Check the route tests still pass**

Run: `npx vitest run --project counter`
Expected: PASS. `routes.test.ts`'s `fakeCtx` answers every `exec` with an empty cursor, which the
new DDL call is happy with.

- [ ] **Step 8: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean. If `ctx.storage.sql` does not satisfy `Sql` structurally, pass
`ctx.storage.sql as unknown as Sql` at the one call site with a comment naming the generic
`exec<T>` signature as the reason, and say so in the task report.

- [ ] **Step 9: Commit**

```bash
git add workers/counter/src/tournamentStore.ts workers/counter/src/index.ts workers/counter/test/sqliteShim.ts workers/counter/test/tournamentStore.test.ts
git commit -m "Counter: events, tournament_battles and roster_entries tables

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: A synthetic event fixture

**Files:**
- Create: `fixtures/make-tournament.ts`
- Create: `fixtures/tournament-sample.json` (its committed output)
- Modify: `package.json` (the `fixtures:tournament` script)

**Interfaces:**
- Consumes: the wire shapes from Task 5, structurally. The generator does not import the worker;
  `fixtures/` is not a workspace and must stay dependency-free, so it writes plain JSON.
- Produces: `fixtures/tournament-sample.json`, shaped
  `{ event: <PUT body>, id: string, battles: <POST battles body>, roster: <POST roster body> }`.
  Tasks 9 and 10 import it. Screen names are invented; no real person's handle enters the repo.

- [ ] **Step 1: Write the generator**

Create `fixtures/make-tournament.ts`:

```ts
/**
 * A synthetic tournament event: one regional's worth of broadcast battles and RK9 roster entries,
 * in exactly the shapes workers/counter accepts. Deterministic, so the committed JSON only moves
 * when this file does.
 *
 * Every screen name here is invented. A real payload (and the real handles on it) never enters
 * this repo; the extraction pipeline talks to the deployed worker, not to git. Species ids are
 * real Great League ids so a page rendering this fixture resolves real sprites.
 *
 * Usage: npm run fixtures:tournament
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'tournament-sample.json');

/** Invented handles, 8 of them, in the shape a broadcast HUD prints: caps, no spaces. */
const PLAYERS = [
  'ARCWARDEN',
  'BLUEKITE',
  'CINDERVANE',
  'DUSKHOLLOW',
  'EMBERFALL',
  'FROSTQUILL',
  'GLASSREEF',
  'HOLLOWPINE',
];

/** Real Great League species ids, so sprites and matrix rows resolve. `mimikyu` is deliberately
 *  absent: the cup bans it, and a fixture that picked it would be describing an illegal team. */
const POOL = [
  'altaria',
  'clodsire',
  'melmetal',
  'corviknight',
  'dunsparce',
  'azumarill',
  'medicham',
  'lanturn',
  'registeel',
  'annihilape_shadow',
  'jumpluff_shadow',
  'corsola_galarian',
];

const MOVES: Record<string, { fast: string; charged: string[] }> = {
  altaria: { fast: 'DRAGON_BREATH', charged: ['MOONBLAST', 'FLAMETHROWER'] },
  clodsire: { fast: 'POISON_STING', charged: ['EARTHQUAKE', 'STONE_EDGE'] },
  melmetal: { fast: 'THUNDER_SHOCK', charged: ['SUPER_POWER', 'ROCK_SLIDE'] },
  corviknight: { fast: 'SAND_ATTACK', charged: ['SKY_ATTACK', 'IRON_HEAD'] },
  dunsparce: { fast: 'ROLLOUT', charged: ['DRILL_RUN', 'ROCK_SLIDE'] },
  azumarill: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
  medicham: { fast: 'COUNTER', charged: ['ICE_PUNCH', 'PSYCHIC'] },
  lanturn: { fast: 'WATER_GUN', charged: ['SURF', 'THUNDERBOLT'] },
  registeel: { fast: 'LOCK_ON', charged: ['FOCUS_BLAST', 'FLASH_CANNON'] },
  annihilape_shadow: { fast: 'COUNTER', charged: ['RAGE_FIST', 'ICE_PUNCH'] },
  jumpluff_shadow: { fast: 'FAIRY_WIND', charged: ['AERIAL_ACE', 'ACROBATICS'] },
  corsola_galarian: { fast: 'ASTONISH', charged: ['NIGHT_SHADE', 'POWER_GEM'] },
};

/** A 32-bit LCG. Not cryptography: a fixture that is the same on every machine. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rand = rng(20270918);

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)] as T;
}

/** Six distinct species per player, in a stable order. */
function rosterFor(seedIndex: number): string[] {
  const six: string[] = [];
  let i = seedIndex;
  while (six.length < 6) {
    const species = POOL[i % POOL.length] as string;
    if (!six.includes(species)) {
      six.push(species);
    }
    i += 3;
  }
  return six;
}

const ROSTERS = new Map(PLAYERS.map((p, i) => [p, rosterFor(i)]));

const EVENT_ID = '2027-crown-city-regional';
const EVENT = {
  name: '2027 Crown City Regional Championships',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  league: 'great',
  cup: 'championshipseries',
  vods: ['vod-day-one', 'vod-day-two'],
  notes: 'Synthetic fixture. Invented screen names, real species ids.',
};

interface Side {
  player: string;
  team: string[];
  forms: ('rk9' | 'unresolved')[];
}

/** Three of the player's six, with one pick in twelve left form-unresolved so the read model's
 *  "form not confirmed" path has data. */
function sideFor(player: string): Side {
  const six = ROSTERS.get(player) as string[];
  const team: string[] = [];
  while (team.length < 3) {
    const species = pick(six);
    if (!team.includes(species)) {
      team.push(species);
    }
  }
  return { player, team, forms: team.map(() => (rand() < 1 / 12 ? 'unresolved' : 'rk9')) };
}

const battles: unknown[] = [];
let clock = Date.parse('2026-09-18T15:00:00Z');
let n = 0;

/** Twelve matches: eight group best-of-three on day one, four top-cut best-of-five on day two. */
const MATCHES = [
  ...Array.from({ length: 8 }, (_, i) => ({
    day: 1,
    stage: 'groups' as const,
    group: String.fromCharCode(65 + (i % 4)),
    roundLabel: `ROUND ${Math.floor(i / 4) + 1}`,
    matchFormat: 'bo3' as const,
    bracket: 'winners' as const,
    bracketDepth: 1 + (i % 3),
    games: 2 + (i % 2),
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    day: 2,
    stage: 'top_cut' as const,
    group: null,
    roundLabel: ['TOP 8', 'TOP 4', 'WINNERS FINAL', 'GRAND FINAL'][i] as string,
    matchFormat: 'bo5' as const,
    bracket: (i === 3 ? 'grand' : i === 2 ? 'losers' : 'winners') as 'grand' | 'losers' | 'winners',
    bracketDepth: 6 + i,
    games: 3 + (i % 2),
  })),
];

MATCHES.forEach((m, mi) => {
  const left = PLAYERS[mi % PLAYERS.length] as string;
  const right = PLAYERS[(mi * 3 + 1) % PLAYERS.length] as string;
  const player2 = right === left ? (PLAYERS[(mi + 1) % PLAYERS.length] as string) : right;
  let score: [number, number] = [0, 0];
  for (let g = 1; g <= m.games; g++) {
    n += 1;
    clock += 11 * 60_000;
    // One battle in seven has no winner: the broadcast cut away before the banner. 15 of
    // Baltimore's 105 are like this and the read model has to count the sighting anyway.
    const undecided = n % 7 === 0;
    const winnerSide = undecided ? null : rand() < 0.5 ? 'left' : 'right';
    battles.push({
      id: `${EVENT_ID}-${String(n).padStart(3, '0')}`,
      at: new Date(clock).toISOString(),
      day: m.day,
      stage: m.stage,
      group: m.group,
      roundLabel: m.roundLabel,
      match: `day${m.day}-${mi + 1}`,
      game: g,
      matchFormat: m.matchFormat,
      bracket: m.bracket,
      bracketDepth: m.bracketDepth,
      left: sideFor(left),
      right: sideFor(player2),
      winnerSide,
      resultSource: undecided ? null : g === m.games ? 'banner' : 'score',
      scoreAtStart: [score[0], score[1]],
      evidence: [`${EVENT_ID}_g${n}_score_${score[0]}-${score[1]}.jpg`],
      notes: null,
    });
    if (winnerSide === 'left') {
      score = [score[0] + 1, score[1]];
    } else if (winnerSide === 'right') {
      score = [score[0], score[1] + 1];
    }
  }
});

/** Every player's six. One roster entry in four carries no moveset, so "movesets known out of
 *  brought by" is a real fraction rather than always 100 percent. */
const entries = PLAYERS.flatMap((player) =>
  (ROSTERS.get(player) as string[]).map((species, slot) => ({
    player,
    slot: slot + 1,
    species,
    moves: (slot + player.length) % 4 === 0 ? null : (MOVES[species] ?? null),
  })),
);

const file = {
  id: EVENT_ID,
  event: EVENT,
  battles: { extractor: 'fixtures/make-tournament 1', battles },
  roster: { entries },
};

fs.writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(
  `wrote ${path.relative(process.cwd(), out)}: ${battles.length} battles, ${entries.length} roster entries\n`,
);
```

- [ ] **Step 2: Add the script**

In the root `package.json`, next to `fixtures:derive`:

```json
    "fixtures:tournament": "tsx fixtures/make-tournament.ts",
```

- [ ] **Step 3: Generate it and check it by hand**

Run:

```bash
npm run fixtures:tournament
node -e "const f=require('./fixtures/tournament-sample.json');const b=f.battles.battles;console.log('battles',b.length,'players',new Set(b.flatMap(x=>[x.left.player,x.right.player])).size);console.log('undecided',b.filter(x=>x.winnerSide===null).length);console.log('unresolved picks',b.reduce((n,x)=>n+x.left.forms.filter(s=>s==='unresolved').length+x.right.forms.filter(s=>s==='unresolved').length,0));console.log('roster',f.roster.entries.length,'without moves',f.roster.entries.filter(e=>e.moves===null).length);console.log('self matches',b.filter(x=>x.left.player===x.right.player).length);"
```

Expected: about 30 battles, 8 players, several undecided, at least one unresolved pick, 48 roster
entries with some `null` movesets, and **zero** self matches. If any count is 0 where the read
model needs data (undecided, unresolved, movesetless roster entries), adjust the modulus in the
generator until it is not, regenerate, and say which one you changed in the task report.

- [ ] **Step 4: Prove the fixture validates against the real parsers**

Add to `workers/counter/test/tournament.test.ts`:

```ts
import fixture from '../../../fixtures/tournament-sample.json' with { type: 'json' };

describe('the synthetic event fixture', () => {
  it('validates against every parser, with no real screen name in it', () => {
    expect(parseEventBody(fixture.event, fixture.id).ok).toBe(true);
    const battles = parseBattlesBody(fixture.battles);
    expect(battles.ok).toBe(true);
    expect(battles.ok && battles.value.battles.length).toBeGreaterThan(20);
    expect(parseRosterBody(fixture.roster).ok).toBe(true);
    // Invented handles only: caps and digits, the shape make-tournament.ts writes.
    for (const b of fixture.battles.battles) {
      expect(b.left.player).toMatch(/^[A-Z0-9]+$/);
      expect(b.right.player).not.toBe(b.left.player);
    }
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project counter test/tournament.test.ts`
Expected: PASS. If the JSON import assertion syntax is rejected, use
`JSON.parse(readFileSync(...))` with `node:fs` instead and note the swap.

- [ ] **Step 6: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add fixtures/make-tournament.ts fixtures/tournament-sample.json package.json workers/counter/test/tournament.test.ts
git commit -m "Fixtures: a synthetic tournament event with invented screen names

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Retire the rank band filter and add the totals override

**Files:**
- Modify: `workers/counter/src/meta.ts` (`ReadParams`, `readParams`, `bandRows`, `summarize`,
  `speciesDetail`, `MetaSummaryV1`, `SpeciesDetailV1`)
- Modify: `workers/counter/src/teams.ts` (`teamBoard`, `TeamsV1`)
- Modify: `workers/counter/src/index.ts` (the three `*V1` methods pass `source`)
- Test: `workers/counter/test/meta.test.ts`, `workers/counter/test/teams.test.ts`,
  `workers/counter/test/routes.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const SOURCES: readonly ['all', 'ladder', 'tournament']`
  - `ReadParams { league: string; since: string; until: string; source: string }`
  - `interface Totals { battles: number; devices: number; sources: Record<string, number> }`
    exported from `meta.ts`.
  - `summarize(opts)` and `teamBoard(opts)` take `source: string` in place of `band: string`, and
    an optional `totals?: Totals` that replaces the three computed counts.
  - `MetaSummaryV1`, `TeamsV1`, `SpeciesDetailV1` carry `source: string` in place of
    `band: string`. `bands` (the breakdown) is untouched on both.
  - `bandRows` is deleted.

- [ ] **Step 1: Write the failing tests**

In `workers/counter/test/meta.test.ts`: delete the `describe('bandRows', ...)` block and its
import, change every `band: 'all'` in the helpers to `source: 'all'`, and add:

```ts
describe('the retired band filter', () => {
  it('counts every band in the window whatever source is asked for', () => {
    const rows = [row({ band: 'ace' }), row({ band: 'legend' }), row({ band: null })];
    const s = run(rows, { source: 'ladder' });
    expect(s.battles).toBe(3);
    expect(s.bands).toEqual({ ace: 1, legend: 1, unknown: 1 });
    expect(s.source).toBe('ladder');
  });
});

describe('the totals override', () => {
  it('replaces the three counts a mirrored population must not compute for itself', () => {
    const s = run([row(), row({ device: 'd2' })], {
      totals: { battles: 1, devices: 0, sources: { broadcast: 1 } },
    });
    expect(s.battles).toBe(1);
    expect(s.devices).toBe(0);
    expect(s.sources).toEqual({ broadcast: 1 });
    // The species tallies still come from the rows themselves.
    expect(s.species.find((x) => x.speciesId === 'medicham')!.sightings).toBe(2);
  });
});
```

In `workers/counter/test/teams.test.ts`: change `band: 'all'` to `source: 'all'` throughout, delete
any band-filtering test, and add:

```ts
  it('takes the totals override for a population whose rows are mirrored', () => {
    const b = board([rowOf()], { totals: { battles: 1, devices: 0, sources: { broadcast: 1 } } });
    expect(b.battles).toBe(1);
    expect(b.devices).toBe(0);
    expect(b.sources).toEqual({ broadcast: 1 });
  });
```

(using whatever the file's existing row and board helpers are named; do not rename them).

In `workers/counter/test/routes.test.ts`, add:

```ts
describe('the source parameter', () => {
  it('defaults to all and echoes what it was given', async () => {
    const plain = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z');
    expect(((await plain.json()) as { source: string }).source).toBe('all');
    const ladder = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z&source=ladder');
    expect(((await ladder.json()) as { source: string }).source).toBe('ladder');
  });

  it('serves an old band= link as source=all rather than refusing it', async () => {
    const res = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z&band=legend');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { source: string }).source).toBe('all');
  });

  it('falls back to all for a source it does not know', async () => {
    const res = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z&source=rumour');
    expect(((await res.json()) as { source: string }).source).toBe('all');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project counter`
Expected: FAIL, `s.source` undefined and `totals` not accepted.

- [ ] **Step 3: Change `meta.ts`**

Replace `ReadParams` and `readParams`:

```ts
/** The three populations a read may ask for. `prior` is the site's own view and never reaches
 *  the worker: PvPoke's list is baked, so there is nothing here to serve it from. */
export const SOURCES: readonly string[] = ['all', 'ladder', 'tournament'];

export interface ReadParams {
  league: string;
  since: string;
  until: string;
  source: string;
}
```

and, in `readParams`, replace the band block with:

```ts
  // Rank bands are self-reported and are no longer a filter anywhere; the breakdown stays in the
  // response. An old link carrying band= is simply served as source=all, since `band` is now
  // read by nothing.
  const sourceRaw = url.searchParams.get('source') ?? 'all';
  const source = SOURCES.includes(sourceRaw) ? sourceRaw : 'all';
  return { league, since: new Date(since).toISOString(), until: new Date(until).toISOString(), source };
```

Delete `bandRows` and its `BANDS` use in the filter (keep the `BANDS` import: `speciesDetail`
still builds the band breakdown from it). In `summarize`:

- rename the `band` option and field to `source`,
- add `totals?: Totals` to the options and the interface:

```ts
/** Counts a caller works out for itself. The tournament read model mirrors one battle into two
 *  rows so the ladder's own aggregation can run over it, which would double every total here, so
 *  it hands the three real numbers in instead. */
export interface Totals {
  battles: number;
  devices: number;
  sources: Record<string, number>;
}
```

- replace `const inBand = bandRows(rows, band);` with `const inBand = rows;`,
- and at the return, use the override when given:

```ts
    battles: opts.totals ? opts.totals.battles : counted.length,
    tanked: inBand.length - counted.length,
    devices: opts.totals ? opts.totals.devices : devices.size,
    bands,
    sources: opts.totals ? opts.totals.sources : sources,
```

In `speciesDetail`, rename `band` to `source` the same way and replace
`bandRows(rows, band).filter(...)` with `rows.filter(...)`. The `bands` array it returns is
unchanged. Add to `SpeciesDetailV1` and `MetaSummaryV1`: `source: string` in place of
`band: string`, and update the doc comment on `bands` to say it is a breakdown and no longer a
filter.

- [ ] **Step 4: Change `teams.ts`**

Rename `band` to `source` in `teamBoard`'s options and in `TeamsV1`, drop the `bandRows` import
and call (`const counted = rows.filter((r) => !r.tanked);`), and accept the same
`totals?: Totals` override for `battles`, `devices` and `sources`.

- [ ] **Step 5: Change `index.ts`**

The three `*V1` methods take `{ league, since, until, source }` instead of `band`. No other change:
they already spread `p`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --project counter`
Expected: PASS.

- [ ] **Step 7: Prove the ladder response did not otherwise move**

Add `workers/counter/test/sourceShape.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BattleRow } from '../src/battles.js';
import { summarize } from '../src/meta.js';
import { teamBoard } from '../src/teams.js';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const WINDOW = { since: '2026-09-11T00:00:00.000Z', until: '2026-09-18T00:00:00.000Z' };

function row(over: Partial<BattleRow> = {}): BattleRow {
  return {
    device: 'd1',
    league: 'great',
    season: 28,
    at: '2026-09-17T10:00:00.000Z',
    team: ['tinkaton', 'azumarill', 'clodsire'],
    moves: null,
    opponents: ['medicham', 'lanturn'],
    result: 'win',
    tanked: false,
    band: 'ace',
    source: 'ladder',
    ...over,
  };
}

const ROWS = [row(), row({ device: 'd2', band: 'legend', result: 'loss' }), row({ tanked: true })];

/**
 * The band axis is retired, so `source=ladder` has to be the response `band=all` used to give.
 * Everything but the echoed request parameter is compared: that one field is the only thing a
 * rename can legitimately change, and comparing it would only assert the rename against itself.
 */
describe('source=ladder is the old band=all response', () => {
  it('differs from a fixed expectation in nothing but the echoed parameter', () => {
    const { source, ...rest } = summarize({
      league: 'great',
      ...WINDOW,
      source: 'ladder',
      rows: ROWS,
      previousRows: null,
      now: NOW,
    });
    expect(source).toBe('ladder');
    expect(rest).toEqual({
      league: 'great',
      ...WINDOW,
      battles: 2,
      tanked: 1,
      devices: 2,
      bands: { ace: 1, legend: 1 },
      sources: { ladder: 2 },
      species: rest.species,
      teams: rest.teams,
      previous: null,
      generatedAt: NOW.toISOString(),
    });
    expect(rest.species.find((s) => s.speciesId === 'medicham')).toEqual({
      speciesId: 'medicham',
      sightings: 2,
      wins: 1,
      losses: 1,
      runs: 0,
      runWins: 0,
      runLosses: 0,
    });
  });

  it('gives the team board the same shape whichever source asked', () => {
    const ladder = teamBoard({ league: 'great', ...WINDOW, source: 'ladder', rows: ROWS, now: NOW });
    const all = teamBoard({ league: 'great', ...WINDOW, source: 'all', rows: ROWS, now: NOW });
    expect(Object.keys(ladder).sort()).toEqual(Object.keys(all).sort());
    expect(ladder.teams).toEqual(all.teams);
    expect(ladder.cores).toEqual(all.cores);
  });
});
```

Run: `npx vitest run --project counter test/sourceShape.test.ts`
Expected: PASS.

- [ ] **Step 8: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: FAIL in `apps/meta` typecheck, because `api.ts` still declares `band` on the three wire
shapes. Change those three `band: string` fields to `source: string` in `apps/meta/src/api.ts`,
and in `apps/meta/test/stubs/stubFetch.ts`'s three constants, leaving `search()` and the hooks
alone for now (Task 11 does the client side). Re-run until clean.

- [ ] **Step 9: Commit**

```bash
git add workers/counter/src/meta.ts workers/counter/src/teams.ts workers/counter/src/index.ts workers/counter/test apps/meta/src/api.ts apps/meta/test/stubs/stubFetch.ts
git commit -m "Counter: the band axis stops filtering and becomes a source parameter

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: The tournament read model

**Files:**
- Create: `workers/counter/src/tournamentRead.ts`
- Modify: `workers/counter/src/meta.ts` (the three block types and the two new response fields)
- Test: `workers/counter/test/tournamentRead.test.ts` (create)

**Interfaces:**
- Consumes: `TournamentBattleRow`, `RosterRow`, `EventRow` (Task 6); `OPEN_EQUIVALENT_CUP`
  (Task 5); `Totals`, `summarize`, `speciesStats`, `MetaSummaryV1`, `SpeciesDetailV1` (Task 8);
  `teamBoard`, `TeamsV1` (Task 8); `fixtures/tournament-sample.json` (Task 7).
- Produces, declared in `workers/counter/src/meta.ts` so `tournamentRead.ts` can import them
  without a cycle:

```ts
export interface TournamentSpeciesStat {
  speciesId: string;
  picks: number;
  game1Picks: number;
  /** The record AGAINST it: the opposing side's wins and losses, the same meaning `wins` and
   *  `losses` carry on the ladder's own SpeciesStats. */
  wins: number;
  losses: number;
  unresolvedForms: number;
}

export interface TournamentBlock {
  /** Events in the window on the league's open-equivalent cup. These are the blended ones. */
  events: number;
  /** Their battles. Each battle counts once, not once per side. */
  battles: number;
  /** Events in the window on other cups: shown, never blended. */
  eventsOther: number;
  species: TournamentSpeciesStat[];
}

export interface RosterMovesetStats {
  fast: string;
  charged: string[];
  /** Roster entries carrying this set, NOT battles: a roster says what a player brought. */
  entries: number;
}

export interface SpeciesTournamentBlock {
  picks: number;
  game1Picks: number;
  wins: number;
  losses: number;
  /** Picks by bracket depth; index 0 is depth 1. Always 9 long. */
  byDepth: number[];
  unresolvedForms: number;
  /** Players whose roster lists it. */
  broughtBy: number;
  /** Players on the roster who appear in at least one streamed battle. */
  rosterSize: number;
  /** Their streamed battles in which they picked it. */
  pickedOnStream: number;
  movesets: RosterMovesetStats[];
  /** Roster entries for it that carry a set at all, out of `broughtBy`. */
  movesetsKnown: number;
}
```

  and `MetaSummaryV1` gains `tournament: TournamentBlock | null`, `SpeciesDetailV1` gains
  `tournament: SpeciesTournamentBlock | null`. Both are `null` under `source=ladder`: a nullable
  field rather than an optional one, because `exactOptionalPropertyTypes` makes "absent" and
  "undefined" two different things and a wire shape wants one.

- Produces, exported from `workers/counter/src/tournamentRead.ts`:
  - `mirrorRows(b: TournamentBattleRow): BattleRow[]`
  - `blendedCup(league: string): string | null`
  - `tournamentBlock(league: string, rows: readonly TournamentBattleRow[], events: readonly EventRow[]): TournamentBlock`
  - `tournamentSummary(opts: { league: string; since: string; until: string; source: string; rows: readonly TournamentBattleRow[]; events: readonly EventRow[]; now: Date }): MetaSummaryV1`
  - `tournamentTeams(opts: { league: string; since: string; until: string; source: string; rows: readonly TournamentBattleRow[]; now: Date })`: `TeamsV1`
  - `mergedTeams(opts: { league; since; until; source; ladderRows: readonly BattleRow[]; rows: readonly TournamentBattleRow[]; now: Date }): TeamsV1`
  - `speciesTournamentBlock(opts: { league: string; speciesId: string; rows: readonly TournamentBattleRow[]; roster: readonly RosterRow[] }): SpeciesTournamentBlock`
  - `interface EventListRow { id; name; startDate; endDate; cup; battles; decided; players; blended }`
  - `eventList(league: string, events: readonly EventRow[], rows: readonly TournamentBattleRow[]): EventListRow[]`
  - `interface EventDetailV1` and
    `eventDetail(league: string, event: EventRow, battles: readonly TournamentBattleRow[], roster: readonly RosterRow[]): EventDetailV1`

- [ ] **Step 1: Write the failing test**

Create `workers/counter/test/tournamentRead.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BattleRow } from '../src/battles.js';
import type { EventRow, RosterRow, TournamentBattleRow } from '../src/tournamentStore.js';
import {
  eventDetail,
  eventList,
  mergedTeams,
  mirrorRows,
  speciesTournamentBlock,
  tournamentBlock,
  tournamentSummary,
  tournamentTeams,
} from '../src/tournamentRead.js';

const NOW = new Date('2026-09-21T00:00:00.000Z');
const WINDOW = { since: '2026-09-01T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z' };

function event(over: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    name: 'Crown City',
    startDate: '2026-09-18',
    endDate: '2026-09-20',
    league: 'great',
    cup: 'championshipseries',
    vods: [],
    notes: null,
    received: NOW.toISOString(),
    ...over,
  };
}

function battle(over: Partial<TournamentBattleRow> = {}): TournamentBattleRow {
  return {
    id: 'b1',
    event: 'e1',
    league: 'great',
    cup: 'championshipseries',
    at: '2026-09-18T15:00:00.000Z',
    day: 1,
    stage: 'groups',
    group: 'A',
    roundLabel: 'ROUND 1',
    match: 'day1-1',
    game: 1,
    matchFormat: 'bo3',
    bracket: 'winners',
    bracketDepth: 1,
    leftPlayer: 'ARCWARDEN',
    rightPlayer: 'BLUEKITE',
    leftTeam: ['altaria', 'clodsire', 'melmetal'],
    rightTeam: ['azumarill', 'medicham', 'lanturn'],
    leftForms: ['rk9', 'rk9', 'rk9'],
    rightForms: ['rk9', 'rk9', 'rk9'],
    winnerSide: 'left',
    resultSource: 'banner',
    scoreAtStart: [0, 0],
    evidence: [],
    notes: null,
    source: 'broadcast',
    extractor: 'test',
    received: NOW.toISOString(),
    ...over,
  };
}

describe('mirrorRows', () => {
  it('makes two BattleRow views, each side as the reporter, with no device', () => {
    const [left, right] = mirrorRows(battle());
    expect(left!.team).toEqual(['altaria', 'clodsire', 'melmetal']);
    expect(left!.opponents).toEqual(['azumarill', 'medicham', 'lanturn']);
    expect(left!.result).toBe('win');
    expect(right!.team).toEqual(['azumarill', 'medicham', 'lanturn']);
    expect(right!.result).toBe('loss');
    expect(left!.device).toBe('');
    expect(left!.source).toBe('broadcast');
    expect(left!.tanked).toBe(false);
    expect(left!.band).toBeNull();
  });

  it('gives both sides a null result when the broadcast never showed one', () => {
    const [left, right] = mirrorRows(battle({ winnerSide: null, resultSource: null }));
    expect(left!.result).toBeNull();
    expect(right!.result).toBeNull();
  });
});

describe('tournamentBlock', () => {
  it('counts a battle once, and inverts wins the way the ladder does', () => {
    const block = tournamentBlock('great', [battle()], [event()]);
    expect(block.events).toBe(1);
    expect(block.battles).toBe(1);
    expect(block.eventsOther).toBe(0);
    const altaria = block.species.find((s) => s.speciesId === 'altaria')!;
    // Altaria is on the left, which WON, so the record against Altaria is 0-1.
    expect(altaria).toEqual({
      speciesId: 'altaria',
      picks: 1,
      game1Picks: 1,
      wins: 0,
      losses: 1,
      unresolvedForms: 0,
    });
    const azumarill = block.species.find((s) => s.speciesId === 'azumarill')!;
    expect(azumarill.wins).toBe(1);
    expect(azumarill.losses).toBe(0);
  });

  it('counts a sighting and no result when nobody won', () => {
    const block = tournamentBlock(
      'great',
      [battle({ winnerSide: null, resultSource: null })],
      [event()],
    );
    const altaria = block.species.find((s) => s.speciesId === 'altaria')!;
    expect(altaria.picks).toBe(1);
    expect(altaria.wins + altaria.losses).toBe(0);
  });

  it('counts an unresolved form under the base id and says how many', () => {
    const block = tournamentBlock(
      'great',
      [battle({ leftForms: ['unresolved', 'rk9', 'rk9'] })],
      [event()],
    );
    expect(block.species.find((s) => s.speciesId === 'altaria')!.unresolvedForms).toBe(1);
  });

  it('separates only game one picks', () => {
    const block = tournamentBlock('great', [battle(), battle({ id: 'b2', game: 2 })], [event()]);
    const altaria = block.species.find((s) => s.speciesId === 'altaria')!;
    expect(altaria.picks).toBe(2);
    expect(altaria.game1Picks).toBe(1);
  });

  it('shows an event on another cup in eventsOther and never in the species list', () => {
    const other = event({ id: 'e2', cup: 'laic2027' });
    const block = tournamentBlock(
      'great',
      [battle(), battle({ id: 'b2', event: 'e2', cup: 'laic2027', leftTeam: ['registeel'], leftForms: ['rk9'] })],
      [event(), other],
    );
    expect(block.events).toBe(1);
    expect(block.battles).toBe(1);
    expect(block.eventsOther).toBe(1);
    expect(block.species.some((s) => s.speciesId === 'registeel')).toBe(false);
  });

  it('blends nothing for a league with no Play! format', () => {
    const block = tournamentBlock(
      'ultra',
      [battle({ league: 'ultra', cup: 'championshipseries' })],
      [event({ league: 'ultra' })],
    );
    expect(block.events).toBe(0);
    expect(block.battles).toBe(0);
    expect(block.eventsOther).toBe(1);
    expect(block.species).toEqual([]);
  });
});

describe('tournamentSummary', () => {
  it('returns the MetaSummaryV1 shape with no devices and a broadcast source count', () => {
    const s = tournamentSummary({
      league: 'great',
      ...WINDOW,
      source: 'tournament',
      rows: [battle(), battle({ id: 'b2', game: 2, winnerSide: 'right' })],
      events: [event()],
      now: NOW,
    });
    expect(s.source).toBe('tournament');
    expect(s.battles).toBe(2);
    expect(s.devices).toBe(0);
    expect(s.sources).toEqual({ broadcast: 2 });
    expect(s.bands).toEqual({});
    expect(s.previous).toBeNull();
    const altaria = s.species.find((x) => x.speciesId === 'altaria')!;
    // Picked in both battles: one sighting and one run each, from the two mirrored views.
    expect(altaria.sightings).toBe(2);
    expect(altaria.runs).toBe(2);
    // Left won the first and lost the second, so the record AGAINST Altaria is 1-1 and its own
    // run record is the mirror of that.
    expect([altaria.wins, altaria.losses]).toEqual([1, 1]);
    expect([altaria.runWins, altaria.runLosses]).toEqual([1, 1]);
    expect(s.tournament).not.toBeNull();
    expect(s.tournament!.battles).toBe(2);
  });
});

describe('tournamentTeams and mergedTeams', () => {
  it('puts both sides on the board, as a run row and a faced row each', () => {
    const b = tournamentTeams({
      league: 'great',
      ...WINDOW,
      source: 'tournament',
      rows: [battle()],
      now: NOW,
    });
    expect(b.battles).toBe(1);
    expect(b.devices).toBe(0);
    expect(b.sources).toEqual({ broadcast: 1 });
    const left = b.teams.find((t) => t.species.join('+') === ['altaria', 'clodsire', 'melmetal'].sort().join('+'))!;
    expect(left.runBattles).toBe(1);
    expect(left.runWins).toBe(1);
    expect(left.facedBattles).toBe(1);
    expect(left.facedWins).toBe(1);
    const right = b.teams.find((t) => t.species.includes('azumarill'))!;
    expect(right.runBattles).toBe(1);
    expect(right.runLosses).toBe(1);
  });

  it('merges the two populations and says how many battles came from each', () => {
    const ladder: BattleRow = {
      device: 'd1',
      league: 'great',
      season: 28,
      at: '2026-09-17T10:00:00.000Z',
      team: ['tinkaton', 'azumarill', 'clodsire'],
      moves: null,
      opponents: ['medicham', 'lanturn'],
      result: 'win',
      tanked: false,
      band: 'ace',
      source: 'ladder',
    };
    const b = mergedTeams({
      league: 'great',
      ...WINDOW,
      source: 'all',
      ladderRows: [ladder],
      rows: [battle()],
      now: NOW,
    });
    expect(b.battles).toBe(2);
    expect(b.devices).toBe(1);
    expect(b.sources).toEqual({ ladder: 1, broadcast: 1 });
    expect(b.teams.some((t) => t.species.includes('tinkaton'))).toBe(true);
    expect(b.teams.some((t) => t.species.includes('melmetal'))).toBe(true);
  });
});

describe('speciesTournamentBlock', () => {
  const roster: RosterRow[] = [
    { event: 'e1', player: 'ARCWARDEN', slot: 1, species: 'altaria', moves: { fast: 'DRAGON_BREATH', charged: ['MOONBLAST'] }, received: NOW.toISOString() },
    { event: 'e1', player: 'ARCWARDEN', slot: 2, species: 'clodsire', moves: null, received: NOW.toISOString() },
    { event: 'e1', player: 'BLUEKITE', slot: 1, species: 'altaria', moves: null, received: NOW.toISOString() },
    { event: 'e1', player: 'CINDERVANE', slot: 1, species: 'altaria', moves: { fast: 'DRAGON_BREATH', charged: ['MOONBLAST'] }, received: NOW.toISOString() },
  ];

  it('joins roster to broadcast: brought by, roster size, and picks on stream', () => {
    const block = speciesTournamentBlock({
      league: 'great',
      speciesId: 'altaria',
      rows: [battle()],
      roster,
    });
    expect(block.picks).toBe(1);
    expect(block.game1Picks).toBe(1);
    expect([block.wins, block.losses]).toEqual([0, 1]);
    expect(block.byDepth).toHaveLength(9);
    expect(block.byDepth[0]).toBe(1);
    // Two of the three roster players were on stream; both list Altaria.
    expect(block.rosterSize).toBe(2);
    expect(block.broughtBy).toBe(2);
    expect(block.pickedOnStream).toBe(1);
    expect(block.movesetsKnown).toBe(1);
    expect(block.movesets).toEqual([
      { fast: 'DRAGON_BREATH', charged: ['MOONBLAST'], entries: 1 },
    ]);
  });

  it('reports a species nobody picked as zero picks rather than as missing', () => {
    const block = speciesTournamentBlock({
      league: 'great',
      speciesId: 'registeel',
      rows: [battle()],
      roster,
    });
    expect(block.picks).toBe(0);
    expect(block.broughtBy).toBe(0);
    expect(block.pickedOnStream).toBe(0);
    expect(block.movesets).toEqual([]);
  });
});

describe('eventList and eventDetail', () => {
  it('lists an event with its counts and whether it is blended', () => {
    const rows = [battle(), battle({ id: 'b2', game: 2, winnerSide: null, resultSource: null })];
    const other = event({ id: 'e2', cup: 'laic2027' });
    const list = eventList('great', [event(), other], [
      ...rows,
      battle({ id: 'b3', event: 'e2', cup: 'laic2027' }),
    ]);
    const first = list.find((e) => e.id === 'e1')!;
    expect(first.battles).toBe(2);
    expect(first.decided).toBe(1);
    expect(first.players).toBe(2);
    expect(first.blended).toBe(true);
    expect(list.find((e) => e.id === 'e2')!.blended).toBe(false);
  });

  it('groups an event detail by match, in game order, with the roster per player', () => {
    const detail = eventDetail(
      'great',
      event(),
      [battle(), battle({ id: 'b2', game: 2, winnerSide: 'right', scoreAtStart: [1, 0] })],
      [
        { event: 'e1', player: 'ARCWARDEN', slot: 1, species: 'altaria', moves: null, received: NOW.toISOString() },
      ],
    );
    expect(detail.matches).toHaveLength(1);
    expect(detail.matches[0]!.games.map((g) => g.game)).toEqual([1, 2]);
    expect(detail.matches[0]!.left).toBe('ARCWARDEN');
    expect(detail.matches[0]!.games[1]!.scoreAtStart).toEqual([1, 0]);
    expect(detail.roster).toEqual([
      { player: 'ARCWARDEN', species: [{ species: 'altaria', moves: null }] },
    ]);
    expect(detail.species.find((s) => s.speciesId === 'altaria')!.picks).toBe(2);
    expect(detail.species.find((s) => s.speciesId === 'altaria')!.broughtBy).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project counter test/tournamentRead.test.ts`
Expected: FAIL, cannot resolve `../src/tournamentRead.js`.

- [ ] **Step 3: Add the block types to `meta.ts`**

Paste the five interfaces from the Interfaces section above into
`workers/counter/src/meta.ts`, just above `MetaSummaryV1`, and add the two fields:

```ts
  /** Tournament play in the same window. Null under source=ladder: that view is the ladder alone
   *  and a zeroed block would read as "no tournaments" rather than "not asked for". */
  tournament: TournamentBlock | null;
```

on `MetaSummaryV1` (after `previous`), and

```ts
  tournament: SpeciesTournamentBlock | null;
```

on `SpeciesDetailV1` (after `movesets`). In `summarize` and `speciesDetail`, return
`tournament: null`: those two functions know nothing about tournaments, and `tournamentRead.ts`
fills the field in afterwards. Update `apps/meta/src/api.ts` and
`apps/meta/test/stubs/stubFetch.ts` with the same two fields (`tournament: null` in the empty
constants) so typecheck stays clean.

- [ ] **Step 4: Write `tournamentRead.ts`**

Create `workers/counter/src/tournamentRead.ts`:

```ts
/**
 * The tournament read model. Everything here is a pure function over the rows tournamentStore.ts
 * reads back, so it is tested without a Durable Object, exactly like meta.ts and teams.ts.
 *
 * The one idea that makes this short: a tournament battle is symmetric, so it is read as the TWO
 * BattleRow-shaped views the ladder's own aggregation already understands, one per side. That
 * gives, with no second copy of the arithmetic, exactly what the spec asks for: each side that
 * picked a species is one sighting and one run, `wins` and `losses` are the other side's result
 * (so "players went 31-26 against Melmetal" means on this page what it means on the ladder page),
 * and both sides land on the team board with a run row and a faced row.
 *
 * What a mirror must NOT be allowed to do is double a total. Battles, devices and the per-source
 * counts are handed to `summarize` and `teamBoard` through their `totals` override instead of
 * being counted off the mirrored rows. Devices are always 0 here: a broadcast is not a phone, and
 * the site never prints a device line for this source.
 */
import type { BattleRow } from './battles.js';
import {
  speciesStats,
  summarize,
  type MetaSummaryV1,
  type RosterMovesetStats,
  type SpeciesTournamentBlock,
  type TournamentBlock,
  type TournamentSpeciesStat,
} from './meta.js';
import { teamBoard, type TeamsV1 } from './teams.js';
import { OPEN_EQUIVALENT_CUP } from './tournament.js';
import type { EventRow, RosterRow, TournamentBattleRow } from './tournamentStore.js';

/** The deepest bracket a battle can carry, and so the length of every byDepth array. */
const MAX_DEPTH = 9;

/** The tournament cup whose events enter this league's blend, or null when it has no Play!
 *  format. Sao Paulo's laic2027 bans four types and fifteen named species; pooling it into a
 *  Great League ranking would be nonsense, so the rule is data rather than a judgement. */
export function blendedCup(league: string): string | null {
  return OPEN_EQUIVALENT_CUP[league] ?? null;
}

function blendedOnly(
  league: string,
  rows: readonly TournamentBattleRow[],
): readonly TournamentBattleRow[] {
  const cup = blendedCup(league);
  return cup === null ? [] : rows.filter((r) => r.cup === cup);
}

export function mirrorRows(b: TournamentBattleRow): BattleRow[] {
  const side = (
    team: string[],
    opponents: string[],
    won: boolean | null,
  ): BattleRow => ({
    // No device, ever: these rows must never reach a device count, which is why every caller
    // passes `totals` with devices 0 rather than letting the aggregation work it out.
    device: '',
    league: b.league,
    season: null,
    at: b.at,
    team: [...team],
    moves: null,
    opponents: [...opponents],
    result: won === null ? null : won ? 'win' : 'loss',
    tanked: false,
    band: null,
    source: 'broadcast',
  });
  const leftWon = b.winnerSide === null ? null : b.winnerSide === 'left';
  const rightWon = leftWon === null ? null : !leftWon;
  return [
    side(b.leftTeam, b.rightTeam, leftWon),
    side(b.rightTeam, b.leftTeam, rightWon),
  ];
}

interface SideView {
  team: string[];
  forms: string[];
  /** Whether the OTHER side won: the record "against" each of these picks. */
  opponentWon: boolean | null;
}

function sidesOf(b: TournamentBattleRow): SideView[] {
  const leftWon = b.winnerSide === null ? null : b.winnerSide === 'left';
  return [
    { team: b.leftTeam, forms: b.leftForms, opponentWon: leftWon === null ? null : !leftWon },
    { team: b.rightTeam, forms: b.rightForms, opponentWon: leftWon },
  ];
}

function blankStat(speciesId: string): TournamentSpeciesStat {
  return { speciesId, picks: 0, game1Picks: 0, wins: 0, losses: 0, unresolvedForms: 0 };
}

/** Per species, over the battles given: picks, game one picks, the record against it, and how
 *  many of those picks had a form the pipeline could not confirm. */
export function pickStats(
  rows: readonly TournamentBattleRow[],
): Map<string, TournamentSpeciesStat> {
  const out = new Map<string, TournamentSpeciesStat>();
  for (const b of rows) {
    for (const side of sidesOf(b)) {
      const counted = new Set<string>();
      side.team.forEach((speciesId, i) => {
        if (counted.has(speciesId)) {
          return;
        }
        counted.add(speciesId);
        const s = out.get(speciesId) ?? blankStat(speciesId);
        s.picks += 1;
        if (b.game === 1) {
          s.game1Picks += 1;
        }
        if (side.forms[i] === 'unresolved') {
          s.unresolvedForms += 1;
        }
        if (side.opponentWon === true) {
          s.wins += 1;
        } else if (side.opponentWon === false) {
          s.losses += 1;
        }
        out.set(speciesId, s);
      });
    }
  }
  return out;
}

export function tournamentBlock(
  league: string,
  rows: readonly TournamentBattleRow[],
  events: readonly EventRow[],
): TournamentBlock {
  const cup = blendedCup(league);
  const blendedEvents = cup === null ? [] : events.filter((e) => e.cup === cup);
  const rowsIn = blendedOnly(league, rows);
  return {
    events: blendedEvents.length,
    battles: rowsIn.length,
    eventsOther: events.length - blendedEvents.length,
    species: [...pickStats(rowsIn).values()].sort(
      (a, b) => b.picks - a.picks || a.speciesId.localeCompare(b.speciesId),
    ),
  };
}

export function tournamentSummary(opts: {
  league: string;
  since: string;
  until: string;
  source: string;
  rows: readonly TournamentBattleRow[];
  events: readonly EventRow[];
  now: Date;
}): MetaSummaryV1 {
  const rowsIn = blendedOnly(opts.league, opts.rows);
  const mirrored = rowsIn.flatMap(mirrorRows);
  const summary = summarize({
    league: opts.league,
    since: opts.since,
    until: opts.until,
    source: opts.source,
    rows: mirrored,
    previousRows: null,
    now: opts.now,
    totals: { battles: rowsIn.length, devices: 0, sources: { broadcast: rowsIn.length } },
  });
  return {
    ...summary,
    // Nothing on a broadcast reports a rank band, so the breakdown is empty rather than a guess.
    bands: {},
    tournament: tournamentBlock(opts.league, opts.rows, opts.events),
  };
}

export function tournamentTeams(opts: {
  league: string;
  since: string;
  until: string;
  source: string;
  rows: readonly TournamentBattleRow[];
  now: Date;
}): TeamsV1 {
  const rowsIn = blendedOnly(opts.league, opts.rows);
  return teamBoard({
    league: opts.league,
    since: opts.since,
    until: opts.until,
    source: opts.source,
    rows: rowsIn.flatMap(mirrorRows),
    now: opts.now,
    totals: { battles: rowsIn.length, devices: 0, sources: { broadcast: rowsIn.length } },
  });
}

/** The board under `source=all`: ladder rows and mirrored tournament rows in one roll-up, with
 *  `sources` saying how many battles came from each. The two populations are deliberately mixed
 *  here and nowhere else; the spec calls this out as the one merged view. */
export function mergedTeams(opts: {
  league: string;
  since: string;
  until: string;
  source: string;
  ladderRows: readonly BattleRow[];
  rows: readonly TournamentBattleRow[];
  now: Date;
}): TeamsV1 {
  const counted = opts.ladderRows.filter((r) => !r.tanked);
  const rowsIn = blendedOnly(opts.league, opts.rows);
  const sources: Record<string, number> = {};
  for (const r of counted) {
    sources[r.source] = (sources[r.source] ?? 0) + 1;
  }
  if (rowsIn.length > 0) {
    sources['broadcast'] = (sources['broadcast'] ?? 0) + rowsIn.length;
  }
  return teamBoard({
    league: opts.league,
    since: opts.since,
    until: opts.until,
    source: opts.source,
    rows: [...opts.ladderRows, ...rowsIn.flatMap(mirrorRows)],
    now: opts.now,
    totals: {
      battles: counted.length + rowsIn.length,
      devices: new Set(counted.map((r) => r.device)).size,
      sources,
    },
  });
}

/** Screen names are compared case-insensitively and displayed as sent. */
function key(player: string): string {
  return player.toLowerCase();
}

export function speciesTournamentBlock(opts: {
  league: string;
  speciesId: string;
  rows: readonly TournamentBattleRow[];
  roster: readonly RosterRow[];
}): SpeciesTournamentBlock {
  const rowsIn = blendedOnly(opts.league, opts.rows);
  const stat = pickStats(rowsIn).get(opts.speciesId) ?? blankStat(opts.speciesId);

  const byDepth = new Array<number>(MAX_DEPTH).fill(0);
  const onStream = new Set<string>();
  let pickedOnStream = 0;
  for (const b of rowsIn) {
    onStream.add(key(b.leftPlayer));
    onStream.add(key(b.rightPlayer));
    const depth = Math.min(Math.max(b.bracketDepth, 1), MAX_DEPTH);
    for (const side of sidesOf(b)) {
      if (side.team.includes(opts.speciesId)) {
        byDepth[depth - 1] = (byDepth[depth - 1] as number) + 1;
      }
    }
    if (b.leftTeam.includes(opts.speciesId)) {
      pickedOnStream += 1;
    }
    if (b.rightTeam.includes(opts.speciesId)) {
      pickedOnStream += 1;
    }
  }

  // Only players who actually appeared on stream: a roster the broadcast never showed says
  // nothing about what was brought to a battle anyone saw.
  const seenEvents = new Set(rowsIn.map((b) => b.event));
  const rosterSeen = opts.roster.filter(
    (r) => seenEvents.has(r.event) && onStream.has(key(r.player)),
  );
  const rosterPlayers = new Set(rosterSeen.map((r) => key(r.player)));
  const brought = rosterSeen.filter((r) => r.species === opts.speciesId);
  const broughtBy = new Set(brought.map((r) => key(r.player))).size;

  const sets = new Map<string, RosterMovesetStats>();
  for (const r of brought) {
    if (!r.moves) {
      continue;
    }
    const charged = [...new Set(r.moves.charged)].sort();
    const k = `${r.moves.fast}|${charged.join('+')}`;
    const held = sets.get(k) ?? { fast: r.moves.fast, charged, entries: 0 };
    held.entries += 1;
    sets.set(k, held);
  }

  return {
    picks: stat.picks,
    game1Picks: stat.game1Picks,
    wins: stat.wins,
    losses: stat.losses,
    byDepth,
    unresolvedForms: stat.unresolvedForms,
    broughtBy,
    rosterSize: rosterPlayers.size,
    pickedOnStream,
    movesets: [...sets.values()].sort(
      (a, b) => b.entries - a.entries || a.fast.localeCompare(b.fast),
    ),
    // A missing moveset is left out of the denominator; it is never counted as "ran the
    // recommended set". This is that denominator.
    movesetsKnown: brought.filter((r) => r.moves !== null).length,
  };
}

export interface EventListRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cup: string;
  battles: number;
  /** Battles with a winner. The rest are honest gaps, not errors. */
  decided: number;
  players: number;
  /** Whether this event's cup is the league's open-equivalent cup, and so feeds the blend. */
  blended: boolean;
}

export function eventList(
  league: string,
  events: readonly EventRow[],
  rows: readonly TournamentBattleRow[],
): EventListRow[] {
  const cup = blendedCup(league);
  const byEvent = new Map<string, TournamentBattleRow[]>();
  for (const b of rows) {
    const held = byEvent.get(b.event) ?? [];
    held.push(b);
    byEvent.set(b.event, held);
  }
  return events
    .map((e) => {
      const mine = byEvent.get(e.id) ?? [];
      const players = new Set<string>();
      for (const b of mine) {
        players.add(key(b.leftPlayer));
        players.add(key(b.rightPlayer));
      }
      return {
        id: e.id,
        name: e.name,
        startDate: e.startDate,
        endDate: e.endDate,
        cup: e.cup,
        battles: mine.length,
        decided: mine.filter((b) => b.winnerSide !== null).length,
        players: players.size,
        blended: cup !== null && e.cup === cup,
      };
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id));
}

export interface EventGameV1 {
  game: number;
  at: string;
  leftTeam: string[];
  rightTeam: string[];
  leftForms: string[];
  rightForms: string[];
  winnerSide: string | null;
  resultSource: string | null;
  scoreAtStart: [number, number];
  notes: string | null;
}

export interface EventMatchV1 {
  match: string;
  day: number;
  stage: string;
  group: string | null;
  roundLabel: string | null;
  bracket: string;
  bracketDepth: number;
  matchFormat: string;
  left: string;
  right: string;
  games: EventGameV1[];
}

export interface EventSpeciesV1 extends TournamentSpeciesStat {
  byDepth: number[];
  broughtBy: number;
}

export interface EventDetailV1 {
  event: EventRow;
  matches: EventMatchV1[];
  roster: { player: string; species: { species: string; moves: RosterRow['moves'] }[] }[];
  species: EventSpeciesV1[];
}

export function eventDetail(
  league: string,
  event: EventRow,
  battles: readonly TournamentBattleRow[],
  roster: readonly RosterRow[],
): EventDetailV1 {
  void league;
  const matches = new Map<string, EventMatchV1>();
  for (const b of battles) {
    const held = matches.get(b.match) ?? {
      match: b.match,
      day: b.day,
      stage: b.stage,
      group: b.group,
      roundLabel: b.roundLabel,
      bracket: b.bracket,
      bracketDepth: b.bracketDepth,
      matchFormat: b.matchFormat,
      left: b.leftPlayer,
      right: b.rightPlayer,
      games: [],
    };
    held.games.push({
      game: b.game,
      at: b.at,
      leftTeam: [...b.leftTeam],
      rightTeam: [...b.rightTeam],
      leftForms: [...b.leftForms],
      rightForms: [...b.rightForms],
      winnerSide: b.winnerSide,
      resultSource: b.resultSource,
      scoreAtStart: b.scoreAtStart,
      notes: b.notes,
    });
    matches.set(b.match, held);
  }
  for (const m of matches.values()) {
    m.games.sort((a, b) => a.game - b.game);
  }

  const byPlayer = new Map<string, { player: string; species: { species: string; moves: RosterRow['moves'] }[] }>();
  for (const r of roster) {
    const held = byPlayer.get(key(r.player)) ?? { player: r.player, species: [] };
    held.species.push({ species: r.species, moves: r.moves });
    byPlayer.set(key(r.player), held);
  }

  const broughtBy = new Map<string, Set<string>>();
  for (const r of roster) {
    const held = broughtBy.get(r.species) ?? new Set<string>();
    held.add(key(r.player));
    broughtBy.set(r.species, held);
  }

  const depths = new Map<string, number[]>();
  for (const b of battles) {
    const depth = Math.min(Math.max(b.bracketDepth, 1), MAX_DEPTH);
    for (const side of sidesOf(b)) {
      for (const speciesId of new Set(side.team)) {
        const held = depths.get(speciesId) ?? new Array<number>(MAX_DEPTH).fill(0);
        held[depth - 1] = (held[depth - 1] as number) + 1;
        depths.set(speciesId, held);
      }
    }
  }

  return {
    event,
    matches: [...matches.values()].sort(
      (a, b) => a.day - b.day || a.bracketDepth - b.bracketDepth || a.match.localeCompare(b.match),
    ),
    roster: [...byPlayer.values()].sort((a, b) => a.player.localeCompare(b.player)),
    species: [...pickStats(battles).values()]
      .map((s) => ({
        ...s,
        byDepth: depths.get(s.speciesId) ?? new Array<number>(MAX_DEPTH).fill(0),
        broughtBy: broughtBy.get(s.speciesId)?.size ?? 0,
      }))
      .sort((a, b) => b.picks - a.picks || a.speciesId.localeCompare(b.speciesId)),
  };
}
```

`summarize` must export `speciesStats` already (it does) and the import of it above is unused if
the mirror path does not need it directly; drop the import if eslint flags it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project counter test/tournamentRead.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the read model over the synthetic event**

Add to `workers/counter/test/tournamentRead.test.ts`:

```ts
import fixture from '../../../fixtures/tournament-sample.json' with { type: 'json' };
import { parseBattlesBody, parseEventBody, parseRosterBody } from '../src/tournament.js';
import { createTournamentTables, getEvent, putBattles, putEvent, putRoster, readEventsInWindow, readEventRoster, readTournamentBattles } from '../src/tournamentStore.js';
import { sqliteShim } from './sqliteShim.js';

describe('the synthetic event, end to end through the store', () => {
  it('rolls up into a block whose battle count matches the fixture', () => {
    const { sql, close } = sqliteShim();
    try {
      createTournamentTables(sql);
      const e = parseEventBody(fixture.event, fixture.id);
      const bs = parseBattlesBody(fixture.battles);
      const rs = parseRosterBody(fixture.roster);
      expect(e.ok && bs.ok && rs.ok).toBe(true);
      if (!e.ok || !bs.ok || !rs.ok) {
        return;
      }
      putEvent(sql, e.value, NOW.toISOString());
      putBattles(sql, getEvent(sql, fixture.id)!, bs.value.extractor, bs.value.battles, NOW.toISOString());
      putRoster(sql, fixture.id, rs.value.entries, NOW.toISOString());

      const rows = readTournamentBattles(sql, 'great', WINDOW.since, WINDOW.until);
      const events = readEventsInWindow(sql, 'great', WINDOW.since, WINDOW.until);
      expect(rows).toHaveLength(bs.value.battles.length);

      const block = tournamentBlock('great', rows, events);
      expect(block.events).toBe(1);
      expect(block.battles).toBe(rows.length);
      expect(block.eventsOther).toBe(0);
      // Every battle contributes up to six picks, so the total is at most six per battle and at
      // least two: the count is a real roll-up, not a constant.
      const picks = block.species.reduce((n, s) => n + s.picks, 0);
      expect(picks).toBeGreaterThan(rows.length * 2);
      expect(picks).toBeLessThanOrEqual(rows.length * 6);
      expect(block.species.some((s) => s.unresolvedForms > 0)).toBe(true);
      expect(block.species.some((s) => s.speciesId === 'mimikyu')).toBe(false);

      const roster = readEventRoster(sql, fixture.id);
      const top = block.species[0]!;
      const detail = speciesTournamentBlock({
        league: 'great',
        speciesId: top.speciesId,
        rows,
        roster,
      });
      expect(detail.picks).toBe(top.picks);
      expect(detail.rosterSize).toBeGreaterThan(0);
      expect(detail.broughtBy).toBeLessThanOrEqual(detail.rosterSize);
      expect(detail.movesetsKnown).toBeLessThanOrEqual(detail.broughtBy);
    } finally {
      close();
    }
  });
});
```

Run: `npx vitest run --project counter test/tournamentRead.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add workers/counter/src/tournamentRead.ts workers/counter/src/meta.ts workers/counter/test/tournamentRead.test.ts apps/meta/src/api.ts apps/meta/test/stubs/stubFetch.ts
git commit -m "Counter: the tournament read model, mirrored onto the ladder's aggregation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: The ingest and event routes

**Files:**
- Modify: `workers/counter/src/index.ts`
- Modify: `workers/counter/src/tournamentRead.ts` (one adapter)
- Modify: `workers/counter/src/meta.ts` (`isWorkerPath` comment only; `/api/` already matches)
- Test: `workers/counter/test/routes.test.ts`, `workers/counter/test/tournamentRead.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5, 6, 8 and 9.
- Produces:
  - `Env` gains `INGEST_TOKEN?: string`.
  - `tournamentSpeciesDetail(opts: { league: string; speciesId: string; since: string; until: string; source: string; rows: readonly TournamentBattleRow[]; roster: readonly RosterRow[]; now: Date }): SpeciesDetailV1`
    in `tournamentRead.ts`.
  - `MetaStore` gains `declareEvent`, `storeBattles`, `storeRoster`, `removeEvent`, `eventsV1`,
    `eventV1`, and `summaryV1`/`speciesV1`/`teamsV1` become source-aware.
  - Routes:
    `PUT /api/v1/events/<id>`, `POST /api/v1/events/<id>/battles`,
    `POST /api/v1/events/<id>/roster`, `DELETE /api/v1/events/<id>`,
    `GET /api/v1/events?league=&since=&until=`, `GET /api/v1/events/<id>`.

- [ ] **Step 1: Write the failing route tests**

In `workers/counter/test/routes.test.ts`, replace `fakeCtx` with one backed by the sqlite shim, so
the ingest routes write to a real table rather than a stub that swallows everything:

```ts
import { sqliteShim } from './sqliteShim.js';

// One in-memory SQLite per test env. The ladder table's own DDL runs through it too, which is
// what the MetaStore constructor does anyway; these tests only exercise the tournament side.
function fakeCtx(): { ctx: unknown; close: () => void } {
  const { sql, close } = sqliteShim();
  return { ctx: { storage: { sql } }, close };
}

function testEnv(over: { INGEST_TOKEN?: string } = {}): { env: Env; close: () => void } {
  const { ctx, close } = fakeCtx();
  const metaStore = new MetaStore(ctx as never, {} as never);
  const env = {
    COUNTER: { getByName: () => ({}) } as unknown as Env['COUNTER'],
    META: { getByName: () => metaStore } as unknown as Env['META'],
    ASSETS: { fetch: () => Promise.resolve(new Response('site')) } as unknown as Env['ASSETS'],
    ALLOWED_ORIGINS: 'http://localhost:5173',
    ...over,
  } as Env;
  return { env, close };
}
```

and update the existing `get()` helper to build and close an env per call. Then add:

```ts
import fixture from '../../../fixtures/tournament-sample.json' with { type: 'json' };

const TOKEN = 'test-ingest-token';

function send(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
  token: string | null = TOKEN,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return worker.fetch(new Request(`http://localhost${path}`, init), env);
}

describe('tournament ingest', () => {
  it('refuses every write without the bearer token', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      for (const [method, path, body] of [
        ['PUT', '/api/v1/events/e-one', fixture.event],
        ['POST', '/api/v1/events/e-one/battles', fixture.battles],
        ['POST', '/api/v1/events/e-one/roster', fixture.roster],
        ['DELETE', '/api/v1/events/e-one', undefined],
      ] as const) {
        expect((await send(env, method, path, body, null)).status).toBe(401);
        expect((await send(env, method, path, body, 'wrong')).status).toBe(401);
      }
    } finally {
      close();
    }
  });

  it('refuses every write when no token is configured at all', async () => {
    const { env, close } = testEnv();
    try {
      expect((await send(env, 'PUT', '/api/v1/events/e-one', fixture.event)).status).toBe(401);
    } finally {
      close();
    }
  });

  it('takes an event, its battles and its roster, and reads them back', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      const id = fixture.id;
      expect((await send(env, 'PUT', `/api/v1/events/${id}`, fixture.event)).status).toBe(200);

      const battles = await send(env, 'POST', `/api/v1/events/${id}/battles`, fixture.battles);
      expect(battles.status).toBe(200);
      expect(await battles.json()).toEqual({
        stored: fixture.battles.battles.length,
        replaced: 0,
        rejected: 0,
      });

      const again = await send(env, 'POST', `/api/v1/events/${id}/battles`, fixture.battles);
      expect(await again.json()).toEqual({
        stored: 0,
        replaced: fixture.battles.battles.length,
        rejected: 0,
      });

      const roster = await send(env, 'POST', `/api/v1/events/${id}/roster`, fixture.roster);
      expect(await roster.json()).toEqual({
        stored: fixture.roster.entries.length,
        replaced: 0,
        rejected: 0,
      });

      const list = await send(
        env,
        'GET',
        '/api/v1/events?league=great&since=2026-09-01T00:00:00Z&until=2026-10-01T00:00:00Z',
        undefined,
        null,
      );
      expect(list.status).toBe(200);
      expect(list.headers.get('Cache-Control')).toBe('public, max-age=600');
      const listed = (await list.json()) as { events: { id: string; blended: boolean }[] };
      expect(listed.events.map((e) => e.id)).toEqual([id]);
      expect(listed.events[0]!.blended).toBe(true);

      const detail = await send(env, 'GET', `/api/v1/events/${id}`, undefined, null);
      expect(detail.status).toBe(200);
      const body = (await detail.json()) as { event: { id: string }; matches: unknown[] };
      expect(body.event.id).toBe(id);
      expect(body.matches.length).toBeGreaterThan(0);
    } finally {
      close();
    }
  });

  it('404s battles and roster for an event nobody declared', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      expect(
        (await send(env, 'POST', '/api/v1/events/never-declared/battles', fixture.battles)).status,
      ).toBe(404);
      expect(
        (await send(env, 'POST', '/api/v1/events/never-declared/roster', fixture.roster)).status,
      ).toBe(404);
      expect((await send(env, 'GET', '/api/v1/events/never-declared', undefined, null)).status).toBe(
        404,
      );
    } finally {
      close();
    }
  });

  it('rejects a malformed batch whole, naming the index and reason, and stores nothing', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      const id = fixture.id;
      await send(env, 'PUT', `/api/v1/events/${id}`, fixture.event);
      const broken = {
        ...fixture.battles,
        battles: [fixture.battles.battles[0], { ...fixture.battles.battles[1], game: 0 }],
      };
      const res = await send(env, 'POST', `/api/v1/events/${id}/battles`, broken);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        stored: 0,
        replaced: 0,
        rejected: 2,
        index: 1,
        reason: 'bad day, game or bracketDepth',
      });
      const detail = await send(env, 'GET', `/api/v1/events/${id}`, undefined, null);
      expect(((await detail.json()) as { matches: unknown[] }).matches).toEqual([]);
    } finally {
      close();
    }
  });

  it('deletes the event, its battles and its roster in one go', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      const id = fixture.id;
      await send(env, 'PUT', `/api/v1/events/${id}`, fixture.event);
      await send(env, 'POST', `/api/v1/events/${id}/battles`, fixture.battles);
      await send(env, 'POST', `/api/v1/events/${id}/roster`, fixture.roster);
      const res = await send(env, 'DELETE', `/api/v1/events/${id}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        deleted: {
          events: 1,
          battles: fixture.battles.battles.length,
          roster: fixture.roster.entries.length,
        },
      });
      expect((await send(env, 'GET', `/api/v1/events/${id}`, undefined, null)).status).toBe(404);
    } finally {
      close();
    }
  });

  it('refuses an event id that is not a slug', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      expect((await send(env, 'PUT', '/api/v1/events/Not A Slug', fixture.event)).status).toBe(400);
    } finally {
      close();
    }
  });
});

describe('the read routes see the ingested event', () => {
  it('carries a tournament block under all and under tournament, and null under ladder', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      const id = fixture.id;
      await send(env, 'PUT', `/api/v1/events/${id}`, fixture.event);
      await send(env, 'POST', `/api/v1/events/${id}/battles`, fixture.battles);
      const window = 'league=great&since=2026-09-01T00:00:00Z&until=2026-10-01T00:00:00Z';
      const read = async (source: string) =>
        (await (
          await send(env, 'GET', `/api/v1/meta?${window}&source=${source}`, undefined, null)
        ).json()) as { battles: number; devices: number; tournament: { battles: number } | null };

      const all = await read('all');
      expect(all.battles).toBe(0);
      expect(all.tournament!.battles).toBe(fixture.battles.battles.length);

      const tournament = await read('tournament');
      expect(tournament.battles).toBe(fixture.battles.battles.length);
      expect(tournament.devices).toBe(0);

      expect((await read('ladder')).tournament).toBeNull();
    } finally {
      close();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project counter test/routes.test.ts`
Expected: FAIL with 404s from the fall-through, and a 500 or 404 on the ingest paths.

- [ ] **Step 3: Add the species adapter to `tournamentRead.ts`**

```ts
/**
 * The species detail from the tournament population. `speciesDetail` runs over the mirrored
 * rows, which is right for the counts it computes per species, and wrong for two per-window
 * fields that count ROWS: `weekly[].battles` would double, and `bands` would file every mirrored
 * row under "unknown" as though a broadcast reported a rank. Both are rebuilt here from the real
 * battles instead, which is the same discipline the `totals` override applies to the summary.
 */
export function tournamentSpeciesDetail(opts: {
  league: string;
  speciesId: string;
  since: string;
  until: string;
  source: string;
  rows: readonly TournamentBattleRow[];
  roster: readonly RosterRow[];
  now: Date;
}): SpeciesDetailV1 {
  const rowsIn = blendedOnly(opts.league, opts.rows);
  const base = speciesDetail({
    league: opts.league,
    speciesId: opts.speciesId,
    since: opts.since,
    until: opts.until,
    source: opts.source,
    rows: rowsIn.flatMap(mirrorRows),
    now: opts.now,
  });
  const weeks = new Map<string, { week: string; battles: number; sightings: number }>();
  for (const b of rowsIn) {
    const week = isoWeek(b.at);
    const held = weeks.get(week) ?? { week, battles: 0, sightings: 0 };
    held.battles += 1;
    for (const side of sidesOf(b)) {
      if (side.team.includes(opts.speciesId)) {
        held.sightings += 1;
      }
    }
    weeks.set(week, held);
  }
  return {
    ...base,
    // A broadcast reports no rank band, so every band reads zero rather than "unknown".
    bands: base.bands.map((b) => ({ band: b.band, sightings: 0, wins: 0, losses: 0 })),
    weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    tournament: speciesTournamentBlock({
      league: opts.league,
      speciesId: opts.speciesId,
      rows: opts.rows,
      roster: opts.roster,
    }),
  };
}
```

adding `isoWeek`, `speciesDetail` and `type SpeciesDetailV1` to the existing import from
`./meta.js`. Add a test for it in `tournamentRead.test.ts`:

```ts
describe('tournamentSpeciesDetail', () => {
  it('counts each battle once per week and zeroes the rank bands', () => {
    const d = tournamentSpeciesDetail({
      league: 'great',
      speciesId: 'altaria',
      ...WINDOW,
      source: 'tournament',
      rows: [battle(), battle({ id: 'b2', game: 2 })],
      roster: [],
      now: NOW,
    });
    expect(d.weekly).toHaveLength(1);
    expect(d.weekly[0]!.battles).toBe(2);
    expect(d.weekly[0]!.sightings).toBe(2);
    expect(d.bands.every((b) => b.sightings === 0)).toBe(true);
    expect(d.tournament!.picks).toBe(2);
  });
});
```

- [ ] **Step 4: Add the Durable Object methods**

In `workers/counter/src/index.ts`, add to `Env`:

```ts
  /** Bearer token for the tournament ingest routes, a worker secret like ERRORS_READ_TOKEN.
   *  Without it every write is refused: an unconfigured worker must not accept anonymous
   *  tournament records, which is the whole point of keying this population. */
  INGEST_TOKEN?: string;
```

and to `MetaStore`, after `teamsV1`:

```ts
  declareEvent(e: EventInput): { id: string } {
    putEvent(this.ctx.storage.sql, e, new Date().toISOString());
    return { id: e.id };
  }

  storeBattles(
    eventId: string,
    body: BattlesBody,
  ): { stored: number; replaced: number; rejected: number } | { missing: true } {
    const event = getEvent(this.ctx.storage.sql, eventId);
    if (!event) {
      return { missing: true };
    }
    // The event's league and cup are stamped onto every row from here, never from the body: a
    // battle cannot claim a league its event does not have.
    const counts = putBattles(
      this.ctx.storage.sql,
      event,
      body.extractor,
      body.battles,
      new Date().toISOString(),
    );
    return { ...counts, rejected: 0 };
  }

  storeRoster(
    eventId: string,
    body: RosterBody,
  ): { stored: number; replaced: number; rejected: number } | { missing: true } {
    const event = getEvent(this.ctx.storage.sql, eventId);
    if (!event) {
      return { missing: true };
    }
    const counts = putRoster(
      this.ctx.storage.sql,
      eventId,
      body.entries,
      new Date().toISOString(),
    );
    return { ...counts, rejected: 0 };
  }

  removeEvent(id: string): { events: number; battles: number; roster: number } {
    return deleteEvent(this.ctx.storage.sql, id);
  }

  eventsV1(p: ReadParams): { events: EventListRow[] } {
    const rows = readTournamentBattles(this.ctx.storage.sql, p.league, p.since, p.until);
    const events = readEventsInWindow(this.ctx.storage.sql, p.league, p.since, p.until);
    return { events: eventList(p.league, events, rows) };
  }

  eventV1(id: string): EventDetailV1 | null {
    const event = getEvent(this.ctx.storage.sql, id);
    if (!event) {
      return null;
    }
    return eventDetail(
      event.league,
      event,
      readEventBattles(this.ctx.storage.sql, id),
      readEventRoster(this.ctx.storage.sql, id),
    );
  }
```

and make the three existing read methods source-aware:

```ts
  /** Every tournament row for a league in the window. Read once per request, like `read`. */
  private readTournament(p: ReadParams): TournamentBattleRow[] {
    return readTournamentBattles(this.ctx.storage.sql, p.league, p.since, p.until);
  }

  summaryV1(p: ReadParams): MetaSummaryV1 {
    if (p.source === 'tournament') {
      return tournamentSummary({
        ...p,
        rows: this.readTournament(p),
        events: readEventsInWindow(this.ctx.storage.sql, p.league, p.since, p.until),
        now: new Date(),
      });
    }
    const span = Date.parse(p.until) - Date.parse(p.since);
    const prevSince = new Date(Date.parse(p.since) - span).toISOString();
    const base = summarize({
      ...p,
      rows: this.read(p.league, p.since, p.until),
      previousRows: this.read(p.league, prevSince, p.since),
      now: new Date(),
    });
    if (p.source !== 'all') {
      return base;
    }
    return {
      ...base,
      tournament: tournamentBlock(
        p.league,
        this.readTournament(p),
        readEventsInWindow(this.ctx.storage.sql, p.league, p.since, p.until),
      ),
    };
  }

  speciesV1(p: ReadParams, speciesId: string): SpeciesDetailV1 {
    const tournamentRows = p.source === 'ladder' ? [] : this.readTournament(p);
    const roster =
      p.source === 'ladder'
        ? []
        : readRosterForEvents(this.ctx.storage.sql, [...new Set(tournamentRows.map((r) => r.event))]);
    if (p.source === 'tournament') {
      return tournamentSpeciesDetail({
        ...p,
        speciesId,
        rows: tournamentRows,
        roster,
        now: new Date(),
      });
    }
    const base = speciesDetail({
      ...p,
      speciesId,
      rows: this.read(p.league, p.since, p.until),
      now: new Date(),
    });
    if (p.source !== 'all') {
      return base;
    }
    return {
      ...base,
      tournament: speciesTournamentBlock({
        league: p.league,
        speciesId,
        rows: tournamentRows,
        roster,
      }),
    };
  }

  teamsV1(p: ReadParams): TeamsV1 {
    if (p.source === 'tournament') {
      return tournamentTeams({ ...p, rows: this.readTournament(p), now: new Date() });
    }
    const ladderRows = this.read(p.league, p.since, p.until);
    if (p.source !== 'all') {
      return teamBoard({ ...p, rows: ladderRows, now: new Date() });
    }
    return mergedTeams({ ...p, ladderRows, rows: this.readTournament(p), now: new Date() });
  }
```

- [ ] **Step 5: Add the routes**

In `index.ts`'s `fetch`, immediately after the `DELETE /battles` block and before the
`GET /meta` block:

```ts
    // Tournament routes. The writes take a bearer token and no Origin check: a script calls
    // these, not a browser, and the token is what makes this population unforgeable. The
    // phone's /battles route cannot reach these tables and these routes cannot reach the
    // ladder table.
    if (url.pathname === '/api/v1/events' || url.pathname.startsWith('/api/v1/events/')) {
      const rest = url.pathname.slice('/api/v1/events'.length).replace(/^\//, '');
      const [eventId, leaf] = rest.split('/');
      const read = { ...headers, 'Cache-Control': READ_CACHE };

      if (request.method === 'GET') {
        if (rest === '') {
          const p = readParams(url);
          if ('error' in p) {
            return Response.json({ error: p.error }, { status: 400, headers });
          }
          return Response.json(await meta.eventsV1(p), { headers: read });
        }
        if (leaf === undefined && eventId !== undefined && EVENT_ID.test(eventId)) {
          const detail = await meta.eventV1(eventId);
          if (!detail) {
            return Response.json({ error: 'not found' }, { status: 404, headers });
          }
          return Response.json(detail, { headers: read });
        }
        return Response.json({ error: 'not found' }, { status: 404, headers });
      }

      const auth = request.headers.get('Authorization') ?? '';
      if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers });
      }
      if (eventId === undefined || !EVENT_ID.test(eventId)) {
        return Response.json({ error: 'bad event id' }, { status: 400, headers });
      }

      if (request.method === 'DELETE' && leaf === undefined) {
        return Response.json({ deleted: await meta.removeEvent(eventId) }, { headers });
      }
      if (request.method === 'PUT' && leaf === undefined) {
        const body = await readJson(request, 8 * 1024);
        if ('error' in body) {
          return Response.json({ error: body.error }, { status: body.status, headers });
        }
        const parsed = parseEventBody(body.body, eventId);
        if (!parsed.ok) {
          return Response.json(
            { error: 'bad event', index: parsed.index, reason: parsed.reason },
            { status: 400, headers },
          );
        }
        return Response.json(await meta.declareEvent(parsed.value), { headers });
      }
      if (request.method === 'POST' && (leaf === 'battles' || leaf === 'roster')) {
        // 200 rows of either kind, comfortably. Battles are the larger of the two.
        const body = await readJson(request, leaf === 'battles' ? 512 * 1024 : 128 * 1024);
        if ('error' in body) {
          return Response.json({ error: body.error }, { status: body.status, headers });
        }
        const parsed =
          leaf === 'battles' ? parseBattlesBody(body.body) : parseRosterBody(body.body);
        if (!parsed.ok) {
          // One malformed record rejects the whole request: a pipeline run that half-lands is
          // worse than one that fails and is rerun.
          const rows = countRows(body.body, leaf);
          return Response.json(
            { stored: 0, replaced: 0, rejected: rows, index: parsed.index, reason: parsed.reason },
            { status: 400, headers },
          );
        }
        const result =
          leaf === 'battles'
            ? await meta.storeBattles(eventId, parsed.value as BattlesBody)
            : await meta.storeRoster(eventId, parsed.value as RosterBody);
        if ('missing' in result) {
          return Response.json({ error: 'no such event' }, { status: 404, headers });
        }
        return Response.json(result, { headers });
      }
      return Response.json({ error: 'not found' }, { status: 404, headers });
    }
```

with this helper next to `readJson`:

```ts
/** How many records a rejected body was carrying, so the `rejected` count is the truth rather
 *  than a 1 that hides how much was thrown away. */
function countRows(body: unknown, leaf: 'battles' | 'roster'): number {
  if (typeof body !== 'object' || body === null) {
    return 0;
  }
  const list = (body as Record<string, unknown>)[leaf === 'battles' ? 'battles' : 'entries'];
  return Array.isArray(list) ? list.length : 0;
}
```

Also update the module's header comment to list the six new routes, and `WORKER_PATHS`' comment in
`meta.ts` to note that `/api/` already covers them (no change to the set itself).

- [ ] **Step 6: Run the route tests**

Run: `npx vitest run --project counter`
Expected: PASS.

- [ ] **Step 7: Drive the real worker once, locally**

Run `npx wrangler dev` in `workers/counter` with a local secret, then:

```bash
cd workers/counter
echo "test-ingest-token" | npx wrangler secret put INGEST_TOKEN --local 2>/dev/null || true
npx wrangler dev &
sleep 5
BASE=http://localhost:8787
curl -s -X PUT "$BASE/api/v1/events/$(node -p "require('../../fixtures/tournament-sample.json').id")" \
  -H "Authorization: Bearer test-ingest-token" -H 'Content-Type: application/json' \
  -d "$(node -p "JSON.stringify(require('../../fixtures/tournament-sample.json').event)")"
```

then POST the battles and roster the same way and `curl "$BASE/api/v1/events?league=great&since=2026-09-01T00:00:00Z&until=2026-10-01T00:00:00Z"`. Record
the three responses in the task report. If `wrangler dev` cannot be run in this environment, say
so in the report and rely on the route tests; do not skip the step silently.

- [ ] **Step 8: Document the token**

Add `INGEST_TOKEN` to `docs/setup/` wherever `ERRORS_READ_TOKEN` is already described (grep for it;
if there is no such page, add one line to `workers/counter/wrangler.toml` as a comment above the
`[vars]` block naming it as a secret set with `wrangler secret put INGEST_TOKEN`).

- [ ] **Step 9: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 10: Commit and deploy**

```bash
git add workers/counter/src workers/counter/test workers/counter/wrangler.toml docs/setup
git commit -m "Counter: keyed tournament ingest and the two event read routes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then set the secret and deploy, so the extraction repo can ingest Baltimore before phase 2 has
anything to render:

```bash
cd workers/counter && npx wrangler secret put INGEST_TOKEN && cd ../..
npm run counter:deploy
```

**Phase 1 is now complete and shipped dark.** Nothing on either site reads `source=` yet.

---

# Phase 2: the meta site

### Task 11: The source parameter and the legality list on the client

**Files:**
- Create: `apps/meta/src/legal.ts`
- Create: `apps/meta/test/legal.test.ts`
- Modify: `apps/meta/src/route.ts`, `apps/meta/src/api.ts`, `apps/meta/src/useMeta.ts`,
  `apps/meta/src/App.tsx`
- Modify: `apps/meta/test/route.test.ts`, `apps/meta/test/api.test.ts`,
  `apps/meta/test/stubs/stubFetch.ts`

**Interfaces:**
- Consumes: `source` on the worker's read routes (Task 8), `legal/<league>.json` (Task 3).
- Produces:
  - `route.ts`: `type SourceKey = 'all' | 'prior' | 'ladder' | 'tournament'`,
    `SOURCES: readonly SourceKey[]`, `Query { w: WindowKey; source: SourceKey }`,
    `DEFAULT_QUERY = { w: 'meta', source: 'all' }`. `BandKey` and `BANDS` are deleted.
  - `api.ts`: `workerSource(source: SourceKey): 'all' | 'ladder' | 'tournament'`,
    `metaUrl(league, w)` (no source: always `all`), `speciesUrl(league, id, w, source)`,
    `teamsUrl(league, w, source)`, and the three `fetch*` functions to match.
  - `legal.ts`: `interface Legal { league: string; cup: string | null; banned: Set<string> }`,
    `loadLegal(league: string, fetcher?: typeof fetch): Promise<Legal>`, `resetLegal(): void`.
  - `useMeta.ts`: `useLegal(league, deps)`; `useMetaSummary(league, w, deps)` loses its band
    argument; `useTeams` and `useSpeciesDetail` take a `SourceKey`.

- [ ] **Step 1: Write the failing tests**

Create `apps/meta/test/legal.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegal, resetLegal } from '../src/legal.js';

function stub(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
}

describe('loadLegal', () => {
  beforeEach(() => {
    resetLegal();
  });

  it('reads the cup and the ban list as a set', async () => {
    const legal = await loadLegal(
      'great',
      stub({ cup: 'championshipseries', banned: ['mimikyu', 'venusaur_mega'] }),
    );
    expect(legal.cup).toBe('championshipseries');
    expect(legal.banned.has('mimikyu')).toBe(true);
    expect(legal.banned.size).toBe(2);
  });

  it('treats a missing file as nothing banned, so an older bake still renders', async () => {
    const legal = await loadLegal('ultra', stub({ error: 'not found' }, 404));
    expect(legal.cup).toBeNull();
    expect(legal.banned.size).toBe(0);
  });

  it('memoises per league', async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ cup: null, banned: [] }), { status: 200 });
    }) as typeof fetch;
    await loadLegal('great', counting);
    await loadLegal('great', counting);
    expect(calls).toBe(1);
  });
});
```

In `apps/meta/test/route.test.ts`, replace every band case with:

```ts
  it('reads the source parameter and defaults to all', () => {
    expect(parseLocation('/great/pokemon', '?source=tournament', ['great']).query.source).toBe(
      'tournament',
    );
    expect(parseLocation('/great/pokemon', '', ['great']).query.source).toBe('all');
    expect(parseLocation('/great/pokemon', '?source=rumour', ['great']).query.source).toBe('all');
  });

  it('lands an old band= link on All rather than 404ing it', () => {
    const { query } = parseLocation('/great/pokemon', '?band=legend', ['great']);
    expect(query.source).toBe('all');
    expect(hrefFor({ name: 'pokemon', league: 'great' }, query)).toBe('/great/pokemon');
  });

  it('writes source into the href only when it is not the default', () => {
    expect(hrefFor({ name: 'pokemon', league: 'great' }, { w: 'meta', source: 'all' })).toBe(
      '/great/pokemon',
    );
    expect(hrefFor({ name: 'pokemon', league: 'great' }, { w: '7', source: 'ladder' })).toBe(
      '/great/pokemon?w=7&source=ladder',
    );
  });
```

In `apps/meta/test/api.test.ts`, replace the band cases with:

```ts
  it('never asks the worker to narrow the summary: one cached response serves all four views', () => {
    expect(metaUrl('great', w)).toBe(`/api/v1/meta?league=great&since=${w.since}&until=${w.until}`);
  });

  it('maps the PvPoke view onto the all read, since PvPoke needs no worker call', () => {
    expect(workerSource('prior')).toBe('all');
    expect(workerSource('all')).toBe('all');
    expect(workerSource('ladder')).toBe('ladder');
    expect(workerSource('tournament')).toBe('tournament');
    expect(teamsUrl('great', w, 'prior')).toBe(teamsUrl('great', w, 'all'));
    expect(teamsUrl('great', w, 'tournament')).toContain('source=tournament');
    expect(speciesUrl('great', 'azumarill', w, 'ladder')).toContain('source=ladder');
  });
```

(using the file's own `w` fixture; import `metaUrl`, `speciesUrl`, `teamsUrl`, `workerSource`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project meta test/legal.test.ts test/route.test.ts test/api.test.ts`
Expected: FAIL, `../src/legal.js` unresolved and `workerSource` undefined.

- [ ] **Step 3: Write `legal.ts`**

```ts
/**
 * The Play! ban list for a league, baked next to the baselines (apps/meta/scripts/bake.ts's
 * legalFor). It is what lets a page print "banned at tournaments" rather than a zero: zero says
 * nobody picked it, which is false; missing says not observable in this population.
 *
 * A 404 is not an error here. An older bake has no legal/ directory, and a site that refused to
 * render because it could not find a ban list would be worse than one that shows no bans.
 */
export interface Legal {
  league: string;
  /** The open-equivalent tournament cup, or null when the league has no Play! format. */
  cup: string | null;
  banned: Set<string>;
}

interface LegalFile {
  cup: string | null;
  banned: string[];
}

const cache = new Map<string, Promise<Legal>>();

export function loadLegal(league: string, fetcher: typeof fetch = fetch): Promise<Legal> {
  const held = cache.get(league);
  if (held) {
    return held;
  }
  const pending = (async (): Promise<Legal> => {
    const res = await fetcher(`/legal/${league}.json`);
    if (!res.ok) {
      return { league, cup: null, banned: new Set<string>() };
    }
    const file = (await res.json()) as LegalFile;
    return { league, cup: file.cup ?? null, banned: new Set(file.banned ?? []) };
  })().catch((err: unknown) => {
    cache.delete(league);
    throw err;
  });
  cache.set(league, pending);
  return pending;
}

/** Tests only: forget memoised lists so the next call uses a fresh stub. */
export function resetLegal(): void {
  cache.clear();
}
```

- [ ] **Step 4: Change `route.ts`**

Replace `BandKey`, `BANDS` and `Query.band`:

```ts
/** Which population a view is built from. `prior` is PvPoke's curated list alone and needs no
 *  worker call at all: it is served from the bake. */
export type SourceKey = 'all' | 'prior' | 'ladder' | 'tournament';

export interface Query {
  w: WindowKey;
  source: SourceKey;
}

export const SOURCES: readonly SourceKey[] = ['all', 'prior', 'ladder', 'tournament'];
export const DEFAULT_QUERY: Query = { w: 'meta', source: 'all' };
```

In `readQuery`, read `source` and fall back to the default; `band` is read by nothing now, so an
old link carrying it simply lands on All. In `hrefFor`, write `source` in place of `band`. Add a
comment next to the `LEGACY_WINDOWS` map:

```ts
/** `band=` was the rank band filter, retired with the band axis (the 2026-09-21 tournament data
 *  spec). It is not mapped to anything: every old link lands on All, which is what it showed. */
```

- [ ] **Step 5: Change `api.ts`**

```ts
/** The population the worker is asked for. `prior` is the site's own view of the same `all`
 *  response (PvPoke's list is baked), so it never becomes its own request: one cached `all`
 *  response serves All and PvPoke alike. */
export function workerSource(source: SourceKey): 'all' | 'ladder' | 'tournament' {
  return source === 'prior' ? 'all' : source;
}

function search(league: string, w: ApiWindow, source: SourceKey | null): string {
  const p = new URLSearchParams({ league, since: w.since, until: w.until });
  if (source !== null) {
    const asked = workerSource(source);
    if (asked !== 'all') {
      p.set('source', asked);
    }
  }
  return p.toString();
}

/** Always the `all` response: it carries the ladder numbers AND the tournament block, which is
 *  everything all four views need, so switching source costs no request and no cache entry. */
export function metaUrl(league: string, w: ApiWindow): string {
  return `/api/v1/meta?${search(league, w, null)}`;
}

export function speciesUrl(league: string, id: string, w: ApiWindow, source: SourceKey): string {
  return `/api/v1/species/${encodeURIComponent(id)}?${search(league, w, source)}`;
}

export function teamsUrl(league: string, w: ApiWindow, source: SourceKey): string {
  return `/api/v1/teams?${search(league, w, source)}`;
}
```

and the three `fetch*` functions take the same arguments. Import `SourceKey` from `./route.js`
in place of `BandKey`.

- [ ] **Step 6: Change `useMeta.ts` and `App.tsx`**

`useMetaSummary(league, w, deps)` drops its band argument and its key. `useTeams` and
`useSpeciesDetail` take `source: SourceKey` in place of `band: BandKey`. Add:

```ts
/** The league's Play! ban list, fetched lazily like the baseline. */
export function useLegal(league: string, deps?: Deps): Loaded<Legal> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(() => loadLegal(league, fetcher), [league, fetcher]);
}
```

In `App.tsx`: delete `BAND_LABELS` and the rank band `Select` from the filter row (a control that
no longer filters anything must not stay on screen; Task 13 puts the Source select in its place),
call `useLegal(activeLeague, deps)` next to `useBaseline`, and pass `query.source` where
`query.band` went.

- [ ] **Step 7: Teach the stub about `/legal/`**

In `apps/meta/test/stubs/stubFetch.ts`, add a `legal?: { cup: string | null; banned: string[] }`
option and, before the `/baseline/` branch:

```ts
    if (url.startsWith('/legal/')) {
      return json(opts.legal ?? { cup: 'championshipseries', banned: ['mimikyu'] });
    }
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --project meta`
Expected: PASS after updating every call site the compiler names. `app.test.tsx`,
`pokemon.test.tsx`, `species.test.tsx` and `teams.test.tsx` pass `band` today; change those to
`source`.

- [ ] **Step 9: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add apps/meta/src apps/meta/test
git commit -m "Meta site: source replaces the rank band in the route and the read calls

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: The sequential blend and the header sentence

**Files:**
- Modify: `apps/meta/src/rank.ts`
- Create: `apps/meta/src/headerCopy.ts`
- Create: `apps/meta/test/headerCopy.test.ts`
- Modify: `apps/meta/src/App.tsx` (pass `source` and `legal` into `rankSpecies`)
- Test: `apps/meta/test/rank.test.ts`

**Interfaces:**
- Consumes: `MetaSummaryV1.tournament` (Task 9), `Legal` (Task 11), `SourceKey` (Task 11).
- Produces, from `rank.ts`:
  - `HALF_SAY_TOURNAMENT_BATTLES = 100`, `HALF_SAY_EVENTS = 2`
  - `tournamentSay(battles: number, events: number): number`
  - `rankSpecies(meta, baseline, ranks, opts: { source: SourceKey; legal: Legal | null }): SpeciesRanking`
  - `SpeciesRanking` gains `source: SourceKey`, `tournamentSay: number`,
    `tournamentBattles: number`, `events: number`, `eventsOther: number`.
  - `SpeciesRow` gains `tournamentPicks`, `tournamentGame1Picks`, `tournamentWins`,
    `tournamentLosses`, `tournamentUnresolvedForms` (all `number`) and `banned: boolean`.
- Produces, from `headerCopy.ts`: `sourceHeaderLine(r: SpeciesRanking, zero: string): string`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/meta/test/rank.test.ts` (and give its `summary()` helper a `tournament: null`
field and its `rankSpecies` calls the new fourth argument
`{ source: 'all', legal: null }`):

```ts
import { facingWeight } from '@pickthree/engine/meta';
import { HALF_SAY_EVENTS, HALF_SAY_TOURNAMENT_BATTLES, tournamentSay } from '../src/rank.js';

/** PvPoke's own prior for rank 1 normalised over the two-species fixture list, computed
 *  from `facingWeight` rather than typed as a decimal, so this expectation cannot drift
 *  from the curve the blend actually runs. */
const PRIOR_RANK1 = facingWeight(1) / (facingWeight(1) + facingWeight(2));

function withTournament(over: {
  battles: number;
  events: number;
  species: { speciesId: string; picks: number; wins?: number; losses?: number }[];
  eventsOther?: number;
}): MetaSummaryV1 {
  return summary({
    tournament: {
      events: over.events,
      battles: over.battles,
      eventsOther: over.eventsOther ?? 0,
      species: over.species.map((s) => ({
        speciesId: s.speciesId,
        picks: s.picks,
        game1Picks: s.picks,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        unresolvedForms: 0,
      })),
    },
  });
}

describe('tournamentSay', () => {
  it('is the smaller of the battles curve and the events curve', () => {
    expect(tournamentSay(0, 0)).toBe(0);
    expect(tournamentSay(HALF_SAY_TOURNAMENT_BATTLES, 1000)).toBeCloseTo(0.5, 10);
    expect(tournamentSay(100_000, HALF_SAY_EVENTS)).toBeCloseTo(0.5, 10);
    // One event is a third of the say, whatever it holds: one event is one local meta.
    expect(tournamentSay(100_000, 1)).toBeCloseTo(1 / 3, 10);
  });

  it('is zero with battles but no events, and with events but no battles', () => {
    expect(tournamentSay(105, 0)).toBe(0);
    expect(tournamentSay(0, 3)).toBe(0);
  });
});

describe('the sequential blend', () => {
  const RANKS_4 = RANKS;
  const BASE = baseline(['azumarill', 'medicham']);

  it('is exactly today formula when there are no tournaments at all', () => {
    const meta = summary({
      battles: 300,
      devices: 10,
      species: [stats({ speciesId: 'medicham', sightings: 200 })],
    });
    const withNull = rankSpecies(meta, BASE, RANKS_4, { source: 'all', legal: null });
    const asLadder = rankSpecies(meta, BASE, RANKS_4, { source: 'ladder', legal: null });
    expect([...withNull.weights.entries()]).toEqual([...asLadder.weights.entries()]);
    expect(withNull.tournamentSay).toBe(0);
  });

  it('reproduces the spec worked case: 105 battles at 1 event is a third of the prior', () => {
    const meta = withTournament({
      battles: 105,
      events: 1,
      species: [
        { speciesId: 'medicham', picks: 60 },
        { speciesId: 'azumarill', picks: 40 },
      ],
    });
    const r = rankSpecies(meta, BASE, RANKS_4, { source: 'all', legal: null });
    expect(r.tournamentSay).toBeCloseTo(1 / 3, 6);
    expect(r.say).toBe(0);
    expect(r.tournamentBattles).toBe(105);
    expect(r.events).toBe(1);
    // aL is 0 with no shared battles, so the weights are p1 exactly.
    const medicham = r.rows.find((x) => x.speciesId === 'medicham')!;
    const azumarill = r.rows.find((x) => x.speciesId === 'azumarill')!;
    // Prior: facingWeight(1) and facingWeight(2), normalised. Tournament share: 0.6 and 0.4.
    const aT = 1 / 3;
    const priorA = PRIOR_RANK1;
    const priorM = 1 - priorA;
    expect(azumarill.weight).toBeCloseTo((1 - aT) * priorA + aT * 0.4, 6);
    expect(medicham.weight).toBeCloseTo((1 - aT) * priorM + aT * 0.6, 6);
  });

  it('runs the ladder blend over the top of the tournament blend, not beside it', () => {
    const meta = {
      ...withTournament({
        battles: 105,
        events: 1,
        species: [{ speciesId: 'medicham', picks: 100 }],
      }),
      battles: 300,
      devices: 10,
      species: [stats({ speciesId: 'azumarill', sightings: 100 })],
    };
    const r = rankSpecies(meta, BASE, RANKS_4, { source: 'all', legal: null });
    expect(r.say).toBeCloseTo(0.5, 6);
    expect(r.tournamentSay).toBeCloseTo(1 / 3, 6);
    const azumarill = r.rows.find((x) => x.speciesId === 'azumarill')!;
    // Every ladder sighting is Azumarill, so its ladder share is 1 and it carries half the
    // weight from that term alone.
    expect(azumarill.weight).toBeGreaterThan(0.5);
  });

  it('gives a banned species its plain prior, not a zero tournament share', () => {
    const meta = withTournament({
      battles: 105,
      events: 1,
      species: [{ speciesId: 'medicham', picks: 100 }],
    });
    const legal = { league: 'great', cup: 'championshipseries', banned: new Set(['azumarill']) };
    const r = rankSpecies(meta, baseline(['azumarill', 'medicham']), RANKS_4, {
      source: 'all',
      legal,
    });
    const azumarill = r.rows.find((x) => x.speciesId === 'azumarill')!;
    const priorA = PRIOR_RANK1;
    expect(azumarill.banned).toBe(true);
    expect(azumarill.weight).toBeCloseTo(priorA, 6);
    expect(r.rows.find((x) => x.speciesId === 'medicham')!.banned).toBe(false);
  });

  it('lists a species PvPoke does not rank but tournaments picked', () => {
    const meta = withTournament({
      battles: 105,
      events: 1,
      species: [{ speciesId: 'gligar', picks: 40 }],
    });
    const r = rankSpecies(meta, BASE, RANKS_4, { source: 'all', legal: null });
    const gligar = r.rows.find((x) => x.speciesId === 'gligar')!;
    expect(gligar.pvpokeRank).toBeNull();
    expect(gligar.tournamentPicks).toBe(40);
    expect(gligar.weight).toBeGreaterThan(0);
  });

  it('gives each view its own weights', () => {
    const meta = {
      ...withTournament({
        battles: 105,
        events: 1,
        species: [{ speciesId: 'medicham', picks: 100 }],
      }),
      battles: 300,
      devices: 10,
      species: [stats({ speciesId: 'azumarill', sightings: 100 })],
    };
    const view = (source: 'all' | 'prior' | 'ladder' | 'tournament') =>
      rankSpecies(meta, BASE, RANKS_4, { source, legal: null });
    expect(view('prior').say).toBe(0);
    expect(view('prior').tournamentSay).toBe(0);
    expect(view('ladder').tournamentSay).toBe(0);
    expect(view('ladder').say).toBeCloseTo(0.5, 6);
    expect(view('tournament').say).toBe(0);
    expect(view('tournament').tournamentSay).toBeCloseTo(1 / 3, 6);
    const prior = view('prior');
    const priorA = PRIOR_RANK1;
    expect(prior.rows.find((x) => x.speciesId === 'azumarill')!.weight).toBeCloseTo(priorA, 6);
  });

  it('carries the per-row tournament figures onto every row', () => {
    const meta = withTournament({
      battles: 10,
      events: 1,
      species: [{ speciesId: 'medicham', picks: 6, wins: 4, losses: 2 }],
      eventsOther: 2,
    });
    const r = rankSpecies(meta, BASE, RANKS_4, { source: 'tournament', legal: null });
    const medicham = r.rows.find((x) => x.speciesId === 'medicham')!;
    expect(medicham.tournamentPicks).toBe(6);
    expect(medicham.tournamentGame1Picks).toBe(6);
    expect([medicham.tournamentWins, medicham.tournamentLosses]).toEqual([4, 2]);
    expect(r.eventsOther).toBe(2);
    expect(r.rows.find((x) => x.speciesId === 'azumarill')!.tournamentPicks).toBe(0);
  });
});
```

Create `apps/meta/test/headerCopy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sourceHeaderLine } from '../src/headerCopy.js';
import type { SpeciesRanking } from '../src/rank.js';

const ZERO = "PvPoke's list. No shared battles in this window yet.";

function ranking(over: Partial<SpeciesRanking>): SpeciesRanking {
  return {
    source: 'all',
    say: 0,
    tournamentSay: 0,
    battles: 0,
    devices: 0,
    tournamentBattles: 0,
    events: 0,
    eventsOther: 0,
    rows: [],
    weights: new Map(),
    pvpokeCommit: 'abc1234def',
    pvpokeDate: '2026-09-10',
    ...over,
  };
}

describe('sourceHeaderLine', () => {
  it('states all three weights and both populations under All', () => {
    // aL = 480 / 780 capped by 9 / 14, aT = min(105/205, 1/3).
    const r = ranking({
      source: 'all',
      say: 0.33,
      tournamentSay: 1 / 3,
      battles: 480,
      devices: 9,
      tournamentBattles: 105,
      events: 1,
    });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      'PvPoke 45%, tournaments 22%, GBL 33%. From 480 shared battles by 9 devices and 105 tournament battles from 1 event.',
    );
  });

  it('says so plainly when tournaments are all there is', () => {
    const r = ranking({
      source: 'all',
      tournamentSay: 1 / 3,
      tournamentBattles: 105,
      events: 1,
    });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      'PvPoke 67%, tournaments 33%. From 105 tournament battles from 1 event. No shared ladder battles in this window yet.',
    );
  });

  it('falls back to the ladder sentence under All when no event is in the window', () => {
    const r = ranking({ source: 'all', say: 0.5, battles: 300, devices: 10 });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      '50% measured, from 300 shared battles by 10 devices',
    );
  });

  it('uses the screen own zero sentence when nothing at all was measured', () => {
    expect(sourceHeaderLine(ranking({ source: 'all' }), ZERO)).toBe(ZERO);
    expect(sourceHeaderLine(ranking({ source: 'ladder' }), ZERO)).toBe(ZERO);
  });

  it('states the tournament split and disowns the ladder under Tournaments', () => {
    const r = ranking({
      source: 'tournament',
      tournamentSay: 1 / 3,
      tournamentBattles: 105,
      events: 1,
    });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      '33% from tournaments, 67% PvPoke. From 105 battles at 1 event. Not shared ladder play.',
    );
    expect(sourceHeaderLine(ranking({ source: 'tournament' }), ZERO)).toBe(
      "PvPoke's list. No tournament battles in this window yet.",
    );
  });

  it('names the commit and the date under PvPoke, and claims nothing measured', () => {
    expect(sourceHeaderLine(ranking({ source: 'prior' }), ZERO)).toBe(
      "PvPoke's list, commit abc1234 from 2026-09-10. Nothing measured.",
    );
  });

  it('pluralises events and devices', () => {
    const r = ranking({
      source: 'tournament',
      tournamentSay: 0.5,
      tournamentBattles: 1,
      events: 2,
    });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      '50% from tournaments, 50% PvPoke. From 1 battle at 2 events. Not shared ladder play.',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project meta test/rank.test.ts test/headerCopy.test.ts`
Expected: FAIL, `tournamentSay` and `../src/headerCopy.js` undefined.

- [ ] **Step 3: Write the blend in `rank.ts`**

Add the two constants and the curve, next to the existing two:

```ts
/** Tournament battles at which tournament play earns half the say of its own term. 100 because
 *  a tournament battle carries two full teams and a verified result, roughly three ladder
 *  records of information. A half-say point, not a gate. */
export const HALF_SAY_TOURNAMENT_BATTLES = 100;
/** Events at which the same term earns half the say. 2 because one event is one local meta, the
 *  same reason one phone is held to a sixth of the say. Also a half-say point, not a gate. */
export const HALF_SAY_EVENTS = 2;

/** How much of the say tournament play has earned: the smaller of the two curves, 0 to 1. */
export function tournamentSay(battles: number, events: number): number {
  const byBattles = battles <= 0 ? 0 : battles / (battles + HALF_SAY_TOURNAMENT_BATTLES);
  const byEvents = events <= 0 ? 0 : events / (events + HALF_SAY_EVENTS);
  return Math.min(byBattles, byEvents);
}
```

Extend `SpeciesRanking` and `SpeciesRow` with the fields named in the Interfaces block, each with
a one-line doc comment, then replace the body of `rankSpecies`:

```ts
export function rankSpecies(
  meta: MetaSummaryV1,
  baseline: Baseline,
  ranks: readonly string[],
  opts: { source: SourceKey; legal: Legal | null },
): SpeciesRanking {
  const block = meta.tournament;
  const tBattles = block?.battles ?? 0;
  const events = block?.events ?? 0;
  // Each view is the same two blends with one or both terms switched off, never a different
  // formula: `prior` is both off, `ladder` is today's, `tournament` is the first alone, `all`
  // is the sequence. One code path, so the four can never disagree about a row.
  const usesLadder = opts.source === 'all' || opts.source === 'ladder';
  const usesTournament = opts.source === 'all' || opts.source === 'tournament';
  const say = usesLadder ? measuredSay(meta.battles, meta.devices) : 0;
  const aT = usesTournament ? tournamentSay(tBattles, events) : 0;

  const rankOf = new Map<string, number>();
  ranks.forEach((id, i) => {
    if (!rankOf.has(id)) {
      rankOf.set(id, i + 1);
    }
  });

  const seen = new Map<string, SpeciesStats>(meta.species.map((s) => [s.speciesId, s]));
  const picked = new Map(
    (block?.species ?? []).map((s) => [s.speciesId, s] as const),
  );
  const ids: string[] = [];
  const known = new Set<string>();
  const add = (id: string): void => {
    if (!known.has(id)) {
      known.add(id);
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
  // Everything picked at a blended event, for the same reason as a faced species: it is part of
  // what this league's list is about, whether or not PvPoke ranks it.
  for (const s of block?.species ?? []) {
    if (s.picks >= LISTED_MIN) {
      add(s.speciesId);
    }
  }

  const blendInput = {
    species: ids,
    ranks: new Map(ids.map((id) => [id, rankOf.get(id) ?? null])),
  };
  const options = { minBattles: 0, halfLife: HALF_SAY_BATTLES, unrankedPrior: 0 };
  // PvPoke's prior alone: `share: 0` makes blendWeights return (1 - 0) * prior, which is the
  // normalised prior and nothing else. Asked for explicitly rather than recomputed here, so the
  // normalisation can never drift from the one the blend below uses.
  const prior = blendWeights(
    { ...blendInput, sightings: new Map(), battles: 0 },
    { ...options, share: 0 },
  );
  const afterTournament = blendWeights(
    {
      ...blendInput,
      sightings: new Map(ids.map((id) => [id, picked.get(id)?.picks ?? 0])),
      battles: tBattles,
    },
    { ...options, halfLife: HALF_SAY_TOURNAMENT_BATTLES, share: aT },
  );
  const banned = opts.legal?.banned ?? new Set<string>();
  // A banned species has no tournament share, not a zero one: zero says nobody picked it, which
  // is false; the plain prior says it was not observable in this population.
  const p1 = new Map(
    ids.map((id) => [
      id,
      (banned.has(id) ? prior.get(id) : afterTournament.get(id)) ?? 0,
    ]),
  );

  // The second blend, written out rather than passed back through blendWeights, because its
  // prior term is p1 and blendWeights only knows how to build a prior from PvPoke ranks. The
  // arithmetic is blendWeights' own last line, and with aT = 0 (so p1 = prior) it reduces to
  // exactly the call this function used to make.
  let ladderTotal = 0;
  for (const id of ids) {
    ladderTotal += seen.get(id)?.sightings ?? 0;
  }
  const weights = new Map(
    ids.map((id) => {
      const share = ladderTotal === 0 ? 0 : (seen.get(id)?.sightings ?? 0) / ladderTotal;
      return [id, (1 - say) * (p1.get(id) ?? 0) + say * share];
    }),
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
    const t = picked.get(speciesId);
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
      share: meta.battles > 0 ? sightings / meta.battles : null,
      wins,
      losses,
      decided,
      confidence: confidence(decided),
      trend: prev
        ? trendPoints(sightings, meta.battles, prevById.get(speciesId) ?? 0, prev.battles)
        : null,
      barPct: heaviest > 0 ? Math.round((weight / heaviest) * 100) : 0,
      tournamentPicks: t?.picks ?? 0,
      tournamentGame1Picks: t?.game1Picks ?? 0,
      tournamentWins: t?.wins ?? 0,
      tournamentLosses: t?.losses ?? 0,
      tournamentUnresolvedForms: t?.unresolvedForms ?? 0,
      banned: banned.has(speciesId),
    };
  });

  return {
    source: opts.source,
    say,
    tournamentSay: aT,
    battles: meta.battles,
    devices: meta.devices,
    tournamentBattles: tBattles,
    events,
    eventsOther: block?.eventsOther ?? 0,
    rows,
    weights,
    pvpokeCommit: baseline.pvpokeCommit,
    pvpokeDate: baseline.pvpokeDate,
  };
}
```

- [ ] **Step 4: Write `headerCopy.ts`**

```ts
/**
 * The one sentence under every list, per source. Generated from the same two numbers the blend
 * actually uses (`say` and `tournamentSay`), the way Pokemon.tsx already tied its own sentence to
 * `measuredSay`, so the stated weight can never drift from the weight applied. CLAUDE.md: this
 * site "blends PvPoke's curated list with measured play on a stated, visible weight".
 *
 * It lives in its own file because three screens print it (Pokemon, Teams and Species) and used
 * to print three near-copies of it.
 */
import { battleWord, battles as battlesText, count, plural } from './format.js';
import type { SpeciesRanking } from './rank.js';

function devicesText(n: number): string {
  return `${count(n)} ${plural(n, 'device', 'devices')}`;
}

function eventsText(n: number): string {
  return `${count(n)} ${plural(n, 'event', 'events')}`;
}

function ladderLine(r: SpeciesRanking): string {
  return `${Math.round(r.say * 100)}% measured, from ${battlesText(r.battles)} shared by ${devicesText(r.devices)}`;
}

/** `zero` is the screen's own sentence for "nothing measured at all": Teams says it is projecting
 *  against PvPoke's group, Pokemon says it is showing PvPoke's list, and neither belongs here. */
export function sourceHeaderLine(r: SpeciesRanking, zero: string): string {
  if (r.source === 'prior') {
    return `PvPoke's list, commit ${r.pvpokeCommit.slice(0, 7)} from ${r.pvpokeDate}. Nothing measured.`;
  }
  if (r.source === 'tournament') {
    if (r.tournamentBattles === 0) {
      return "PvPoke's list. No tournament battles in this window yet.";
    }
    const t = Math.round(r.tournamentSay * 100);
    return `${t}% from tournaments, ${100 - t}% PvPoke. From ${battlesText(r.tournamentBattles)} at ${eventsText(r.events)}. Not shared ladder play.`;
  }
  const hasTournament = r.source === 'all' && r.tournamentBattles > 0;
  if (!hasTournament) {
    return r.battles === 0 ? zero : ladderLine(r);
  }
  const pvpokePct = Math.round((1 - r.say) * (1 - r.tournamentSay) * 100);
  const tPct = Math.round((1 - r.say) * r.tournamentSay * 100);
  const tourney = `${count(r.tournamentBattles)} tournament ${battleWord(r.tournamentBattles)} from ${eventsText(r.events)}`;
  if (r.battles === 0) {
    return `PvPoke ${pvpokePct}%, tournaments ${tPct}%. From ${tourney}. No shared ladder battles in this window yet.`;
  }
  const lPct = Math.round(r.say * 100);
  return `PvPoke ${pvpokePct}%, tournaments ${tPct}%, GBL ${lPct}%. From ${battlesText(r.battles)} shared by ${devicesText(r.devices)} and ${tourney}.`;
}
```

- [ ] **Step 5: Wire it in `App.tsx`**

```tsx
  const legal = useLegal(activeLeague, deps);
  const ranking = useMemo(
    () =>
      meta.data && baseline.data && ranks.data
        ? rankSpecies(meta.data, baseline.data, ranks.data, {
            source: query.source,
            // A failed or absent ban list degrades to "nothing banned" rather than blanking the
            // screen, the same way a failed matchup slice degrades to `projectionless`.
            legal: legal.data,
          })
        : null,
    [meta.data, baseline.data, ranks.data, query.source, legal.data],
  );
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --project meta`
Expected: PASS. `board.snapshot.test.ts` may move if a weight changed; it must NOT, because every
fixture there has `tournament: null`, which makes `aT` 0 and the formula identical. If the
snapshot does move, stop and find out why before re-recording it.

- [ ] **Step 7: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/meta/src/rank.ts apps/meta/src/headerCopy.ts apps/meta/src/App.tsx apps/meta/test
git commit -m "Meta site: tournament pick share blends into the prior before the ladder does

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: The Source select, and the two list screens

**Files:**
- Modify: `apps/meta/src/App.tsx` (the filter row, and one new prop for Teams)
- Modify: `apps/meta/src/screens/Pokemon.tsx`
- Modify: `apps/meta/src/screens/Teams.tsx`
- Test: `apps/meta/test/app.test.tsx`, `apps/meta/test/pokemon.test.tsx`,
  `apps/meta/test/teams.test.tsx`

**Interfaces:**
- Consumes: `SOURCES`, `SourceKey` (Task 11); `sourceHeaderLine` (Task 12); the new `SpeciesRow`
  fields (Task 12); `TeamsV1.sources` (Task 8).
- Produces: `SOURCE_LABELS: Record<SourceKey, string>` in `App.tsx`; `Teams` takes a new
  `sources: Record<string, number>` prop.

- [ ] **Step 1: Write the failing tests**

In `apps/meta/test/app.test.tsx`:

```tsx
  it('offers the four sources in place of the retired rank band filter', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now: () => NOW }} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Source' })).toBeVisible());
    expect(screen.queryByRole('combobox', { name: 'Rank band' })).not.toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Source' });
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'All',
      'PvPoke',
      'GBL',
      'Tournaments',
    ]);
  });

  it('puts the chosen source in the url, replacing rather than pushing', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now: () => NOW }} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Source' })).toBeVisible());
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Source' }), {
        target: { value: 'tournament' },
      });
    });
    await waitFor(() => expect(window.location.search).toBe('?source=tournament'));
  });
```

In `apps/meta/test/pokemon.test.tsx`, add a tournament block to the helper that builds the
`MetaSummaryV1` and add:

```tsx
  it('states all three weights under All', () => {
    renderPokemon({
      battles: 480,
      devices: 9,
      tournament: { events: 1, battles: 105, eventsOther: 0, species: [] },
      source: 'all',
    });
    expect(
      screen.getByText(/PvPoke 45%, tournaments 22%, GBL 33%\./),
    ).toBeInTheDocument();
  });

  it('under Tournaments, prints picks and the record and marks a banned row', () => {
    renderPokemon({
      source: 'tournament',
      legal: { cup: 'championshipseries', banned: ['tinkaton'] },
      tournament: {
        events: 1,
        battles: 100,
        eventsOther: 0,
        species: [
          { speciesId: 'azumarill', picks: 40, game1Picks: 25, wins: 18, losses: 22, unresolvedForms: 0 },
        ],
      },
    });
    expect(screen.getByText('40 of 100 battles (40%)')).toBeInTheDocument();
    expect(screen.getByText(/players went 18-22/)).toBeInTheDocument();
    expect(screen.getByText('Banned at tournaments')).toBeInTheDocument();
  });

  it('under PvPoke, claims nothing measured on any row', () => {
    renderPokemon({ source: 'prior', battles: 480, devices: 9 });
    expect(
      screen.getByText(/PvPoke's list, commit abc1234 from 2026-09-10\. Nothing measured\./),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Nothing measured').length).toBeGreaterThan(0);
    expect(screen.queryByText(/players went/)).not.toBeInTheDocument();
  });

  it('lists a species tournaments picked that nobody faced on the ladder', () => {
    renderPokemon({
      source: 'tournament',
      tournament: {
        events: 1,
        battles: 100,
        eventsOther: 0,
        species: [
          { speciesId: 'lanturn', picks: 12, game1Picks: 5, wins: 5, losses: 5, unresolvedForms: 2 },
        ],
      },
    });
    expect(screen.getByText('12 of 100 battles (12%)')).toBeInTheDocument();
  });
```

(extend the file's own `renderPokemon` helper to take `source` and `legal` and pass them into
`rankSpecies`; keep every existing test working by defaulting `source` to `'all'` and `legal` to
`null`.)

In `apps/meta/test/teams.test.tsx`, add:

```tsx
  it('says how many battles each source contributed, under All only', () => {
    renderTeams({ source: 'all', sources: { ladder: 480, broadcast: 105 } });
    expect(screen.getByText('From 480 battles shared and 105 tournament battles.')).toBeInTheDocument();
  });

  it('says nothing about sources when only one population has anything', () => {
    renderTeams({ source: 'all', sources: { ladder: 480 } });
    expect(screen.queryByText(/tournament battles\./)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project meta test/app.test.tsx test/pokemon.test.tsx test/teams.test.tsx`
Expected: FAIL, no combobox named Source.

- [ ] **Step 3: Put the Source select in `App.tsx`**

Replace the deleted `BAND_LABELS` with:

```tsx
const SOURCE_LABELS: Record<SourceKey, string> = {
  all: 'All',
  prior: 'PvPoke',
  ladder: 'GBL',
  tournament: 'Tournaments',
};
```

and the deleted rank band `Select` with:

```tsx
        <Select
          label="Source"
          hideLabel
          value={query.source}
          onChange={(s) => refine({ ...query, source: s })}
          options={SOURCES.map((k) => ({ value: k, label: SOURCE_LABELS[k] }))}
        />
```

Pass `sources={teamsData.data?.sources ?? {}}` into `Teams` through `renderView`, and, under
`source === 'prior'`, hand `buildBoard` a board with no observed rows, so the PvPoke view shows
projections alone rather than records it is not weighting:

```tsx
  const observed = useMemo(() => {
    if (!teamsData.data) {
      return null;
    }
    // Under PvPoke there is nothing measured by definition, so the board is the generated
    // projections alone. The fetch is the same cached `all` read, so this costs no request.
    return query.source === 'prior'
      ? { ...teamsData.data, teams: [], cores: [] }
      : teamsData.data;
  }, [teamsData.data, query.source]);
```

and use `observed` where `teamsData.data` fed `buildBoard`.

- [ ] **Step 4: Make `Pokemon.tsx` source-aware**

Replace its `headerLine` with a call to `sourceHeaderLine`, extend the explainer, and make the two
row lines read the source:

```tsx
/** The tap-to-reveal note on the header line. Both numbers come from the constants rather than
 *  being typed again, so this sentence cannot drift from the curves `measuredSay` and
 *  `tournamentSay` actually compute. */
function blendExplainer(ranking: SpeciesRanking): string {
  const base =
    "Every row blends PvPoke's ranking with what players actually faced. The more battles and " +
    `the more devices, the more the measured side counts. At ${count(HALF_SAY_BATTLES)} battles ` +
    'it is half.';
  if (ranking.source !== 'all' && ranking.source !== 'tournament') {
    return base;
  }
  return (
    `${base} Tournament picks blend into PvPoke's side first, on their own curve: half at ` +
    `${count(HALF_SAY_TOURNAMENT_BATTLES)} tournament battles and at ${count(HALF_SAY_EVENTS)} events.`
  );
}

/** A row with nothing to divide by prints a count, never a percentage: a share of nothing is not
 *  zero, it is nothing. Under PvPoke there is no measured side at all and the row says so. */
function facedLine(row: SpeciesRow, ranking: SpeciesRanking): string {
  if (ranking.source === 'prior') {
    return 'Nothing measured';
  }
  if (ranking.source === 'tournament') {
    if (row.banned) {
      return 'Banned at tournaments';
    }
    if (ranking.tournamentBattles === 0) {
      return 'No tournament battles in this window';
    }
    if (row.tournamentPicks === 0) {
      return 'Not picked in this window';
    }
    return `${count(row.tournamentPicks)} of ${count(ranking.tournamentBattles)} battles (${pct(row.tournamentPicks / ranking.tournamentBattles)}%)`;
  }
  if (row.share === null) {
    return 'Not faced in this window';
  }
  return `${count(row.sightings)} of ${count(ranking.battles)} battles (${pct(row.share)}%)`;
}

function recordOf(row: SpeciesRow, ranking: SpeciesRanking): { wins: number; losses: number } {
  return ranking.source === 'tournament'
    ? { wins: row.tournamentWins, losses: row.tournamentLosses }
    : { wins: row.wins, losses: row.losses };
}

function recordLine(row: SpeciesRow, ranking: SpeciesRanking): string {
  const { wins, losses } = recordOf(row, ranking);
  if (wins + losses === 0) {
    return 'no result recorded';
  }
  return `players went ${wins}-${losses}`;
}
```

In `RowView`, take `ranking` in place of `battles`, and render the record line only when the
source has one:

```tsx
      <span className="row-figure">
        <b>{row.pvpokeRank !== null ? `PvPoke #${row.pvpokeRank}` : 'New'}</b>
        <small>{facedLine(row, ranking)}</small>
        {ranking.source === 'prior' || (ranking.source === 'tournament' && row.banned) ? null : (
          <small>
            {recordLine(row, ranking)}{' '}
            {decidedOf(row, ranking) > 0 ? <ConfidenceTag n={decidedOf(row, ranking)} /> : null}
          </small>
        )}
      </span>
```

with `function decidedOf(row: SpeciesRow, ranking: SpeciesRanking): number` returning
`row.tournamentWins + row.tournamentLosses` under `tournament` and `row.decided` otherwise.

Widen the list cut so a tournament pick is never dropped:

```tsx
  // A row draws when PvPoke ranks it, when it was faced at least twice, or when it was picked at
  // a blended event at all. What is left out is, by construction, species faced exactly once on
  // the ladder and picked at no tournament; they are counted below, not dropped.
  const drawn = ranking.rows.filter(
    (row) => row.pvpokeRank !== null || row.sightings >= 2 || row.tournamentPicks >= 1,
  );
```

and replace the header sentence with
`{sourceHeaderLine(ranking, "PvPoke's list. No shared battles in this window yet.")}`.

- [ ] **Step 5: Make `Teams.tsx` source-aware**

Replace its local `headerLine` with
`sourceHeaderLine(ranking, "Projected against PvPoke's meta group. No shared battles in this window yet.")`
(delete the local copy: that duplication is what `headerCopy.ts` exists to end), add the
`sources: Record<string, number>` prop, and add one line under the header:

```tsx
/** Under All the board mixes two populations, which is the one place on this site they are
 *  mixed, so it says so with the count from each rather than leaving a reader to assume one. */
function sourcesLine(sources: Record<string, number>): string | null {
  const ladder = sources['ladder'] ?? 0;
  const tournament = sources['broadcast'] ?? 0;
  if (ladder === 0 || tournament === 0) {
    return null;
  }
  return `From ${battlesText(ladder)} shared and ${count(tournament)} tournament ${battleWord(tournament)}.`;
}
```

rendered as `{ranking.source === 'all' && sourcesLine(sources) ? <p className="fine">{sourcesLine(sources)}</p> : null}`
(assign it to a local first rather than calling it twice).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --project meta`
Expected: PASS.

- [ ] **Step 7: See it**

Run `npm -w @pickthree/meta run dev` and switch the Source select through all four values on
`/great` and `/great/pokemon`. With the deployed worker holding Baltimore (Task 10), All should
read roughly `PvPoke 67%, tournaments 33%.` and Tournaments should list real picks. Record what
the header line actually said in the task report.

- [ ] **Step 8: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/meta/src apps/meta/test
git commit -m "Meta site: the Source select, and the two lists read it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: The species page

**Files:**
- Modify: `apps/meta/src/screens/Species.tsx`
- Modify: `apps/meta/src/App.tsx` (pass `legal` into `Species`)
- Test: `apps/meta/test/species.test.tsx`

**Interfaces:**
- Consumes: `SpeciesDetailV1.tournament` (Task 9), `Legal` (Task 11), `sourceHeaderLine`
  (Task 12).
- Produces: `Species` takes a new `legal: Legal | null` prop. No new exports.

- [ ] **Step 1: Write the failing tests**

In `apps/meta/test/species.test.tsx`, extend the detail fixture helper with a `tournament` block
and add:

```tsx
  const BLOCK = {
    picks: 34,
    game1Picks: 21,
    wins: 12,
    losses: 18,
    byDepth: [4, 6, 8, 6, 4, 3, 2, 1, 0],
    unresolvedForms: 3,
    broughtBy: 4,
    rosterSize: 16,
    pickedOnStream: 34,
    movesets: [
      { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], entries: 3 },
      { fast: 'BUBBLE', charged: ['ICE_BEAM'], entries: 1 },
    ],
    movesetsKnown: 4,
  };

  it('prints the tournaments row with picks, game one picks and the record', async () => {
    await renderSpecies({ detail: { tournament: BLOCK } });
    expect(
      screen.getByText('Tournaments: 34 picks, 21 in game one, players went 12-18'),
    ).toBeInTheDocument();
    expect(screen.getByText('Form not confirmed for 3 picks.')).toBeInTheDocument();
  });

  it('prints the roster join as one sentence', async () => {
    await renderSpecies({ detail: { tournament: BLOCK } });
    expect(
      screen.getByText(
        'Brought by 4 of 16 players seen on stream, picked in 34 of their streamed battles.',
      ),
    ).toBeInTheDocument();
  });

  it('says never picked on stream in those words, not zero', async () => {
    await renderSpecies({ detail: { tournament: { ...BLOCK, picks: 0, pickedOnStream: 0 } } });
    expect(
      screen.getByText('Brought by 4 of 16 players seen on stream, never picked on stream.'),
    ).toBeInTheDocument();
  });

  it('lists the sets from the roster, over known sets only, marking PvPoke own', async () => {
    await renderSpecies({ detail: { tournament: BLOCK } });
    expect(screen.getByRole('heading', { name: 'Moves at tournaments' })).toBeInTheDocument();
    expect(screen.getByText('From 4 known sets of 4 roster entries')).toBeInTheDocument();
    expect(screen.getAllByText("PvPoke's set").length).toBe(1);
  });

  it('says banned instead of a zeroed row for a species the cup bans', async () => {
    await renderSpecies({
      detail: { tournament: { ...BLOCK, picks: 0 } },
      legal: { league: 'great', cup: 'championshipseries', banned: new Set(['azumarill']) },
    });
    expect(screen.getByText('Banned at tournaments')).toBeInTheDocument();
    expect(screen.queryByText(/Tournaments: /)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Moves at tournaments' })).not.toBeInTheDocument();
  });

  it('shows no tournaments row at all under GBL, where the block is null', async () => {
    await renderSpecies({ detail: { tournament: null } });
    expect(screen.queryByText(/Tournaments: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/seen on stream/)).not.toBeInTheDocument();
  });
```

(extend `renderSpecies` to take `legal`, defaulting to `null`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project meta test/species.test.tsx`
Expected: FAIL, none of the sentences render.

- [ ] **Step 3: Add the tournaments row to the record card**

In `apps/meta/src/screens/Species.tsx`, add above `RecordCard`:

```tsx
/** The tournaments figures, under the ladder ones in the same card: the same species, a
 *  different population, and never merged into one number. A banned species says so instead of
 *  showing zeros, because zero says nobody picked it, which is false. */
function tournamentRow(
  block: SpeciesDetailV1['tournament'],
  banned: boolean,
): ReactNode {
  if (banned) {
    return <p className="fine">Banned at tournaments</p>;
  }
  if (!block || block.picks === 0) {
    return null;
  }
  const decided = block.wins + block.losses;
  return (
    <>
      <p className="sub">
        {`Tournaments: ${count(block.picks)} ${plural(block.picks, 'pick', 'picks')}, ${count(block.game1Picks)} in game one, players went ${block.wins}-${block.losses}`}{' '}
        {decided > 0 ? <ConfidenceTag n={decided} /> : null}
      </p>
      {block.unresolvedForms > 0 ? (
        <p className="fine">
          {`Form not confirmed for ${count(block.unresolvedForms)} ${plural(block.unresolvedForms, 'pick', 'picks')}.`}
        </p>
      ) : null}
    </>
  );
}

/** The roster join, which is the one thing only tournaments can say: what a player BROUGHT, as
 *  against what they picked. "Never picked" always means never picked on stream, and the
 *  sentence says so rather than leaving a reader to assume a whole event was watched. */
function rosterLine(block: SpeciesDetailV1['tournament']): string | null {
  if (!block || block.rosterSize === 0 || block.broughtBy === 0) {
    return null;
  }
  const seen = `Brought by ${count(block.broughtBy)} of ${count(block.rosterSize)} ${plural(block.rosterSize, 'player', 'players')} seen on stream`;
  if (block.pickedOnStream === 0) {
    return `${seen}, never picked on stream.`;
  }
  return `${seen}, picked in ${count(block.pickedOnStream)} of their streamed ${plural(block.pickedOnStream, 'battle', 'battles')}.`;
}
```

`RecordCard` takes `banned: boolean` and renders `{tournamentRow(detail.tournament, banned)}` and
`{rosterLine(detail.tournament) ? <p className="fine">{rosterLine(detail.tournament)}</p> : null}`
just above the `.btn-pair` (assign the line to a local first rather than calling it twice), and
`ConfidenceTag` joins the imports from `../components.js`.

- [ ] **Step 4: Add the tournament movesets card**

```tsx
/** Sets from RK9 roster entries, not from battles: a roster says what a player brought. Over
 *  KNOWN sets only, with the count stated, because a missing moveset is left out of the
 *  denominator and is never counted as "ran the recommended set". */
function TournamentMovesCard({
  block,
  entry,
  data,
}: {
  block: NonNullable<SpeciesDetailV1['tournament']>;
  entry: BaselineSpecies | null;
  data: StaticData;
}) {
  if (block.movesets.length === 0) {
    return null;
  }
  const recommended =
    entry !== null
      ? `${entry.fastMove}|${[...entry.chargedMoves].sort().join('+')}`
      : null;
  return (
    <section className="card">
      <h2>Moves at tournaments</h2>
      <p className="sub">
        {`From ${count(block.movesetsKnown)} known ${plural(block.movesetsKnown, 'set', 'sets')} of ${count(block.broughtBy)} ${plural(block.broughtBy, 'roster entry', 'roster entries')}`}
      </p>
      <div className="pick-moves">
        {block.movesets.map((set) => {
          const key = `${set.fast}|${[...set.charged].sort().join('+')}`;
          const names = [set.fast, ...set.charged].map((id) => data.moves.get(id)?.name ?? id);
          return (
            <span className="pick-move" key={key}>
              <span className="pick-move-name">{joinAnd(names)}</span>
              <span className="fine pick-move-share">
                {`${count(set.entries)} ${plural(set.entries, 'entry', 'entries')}`}
              </span>
              {key === recommended ? <span className="fine">PvPoke&apos;s set</span> : null}
            </span>
          );
        })}
      </div>
    </section>
  );
}
```

rendered after `MovesetCard`:

```tsx
      {d.tournament && !banned ? (
        <TournamentMovesCard block={d.tournament} entry={baselineEntry} data={data} />
      ) : null}
```

- [ ] **Step 5: Wire the source line and the ban flag**

In `Species`, replace `sayHeaderLine(ranking)` with
`sourceHeaderLine(ranking, 'No shared battles in this window yet.')` (delete the local
`sayHeaderLine`), add the prop:

```tsx
  /** The league's Play! ban list, or null while it is loading. A banned species is marked as
   *  banned rather than shown with zeros. */
  legal: Legal | null;
```

and compute `const banned = p.legal?.banned.has(speciesId) ?? false;`. Pass `legal={legal.data}`
from `App.tsx`'s `renderView`.

The `d.sightings === 0` branch currently hides every card. It must not hide the tournaments
figures, which can be the only thing this window knows about a species:

```tsx
      {d.sightings === 0 ? (
        <>
          <p className="sub">No shared battles mention it in this window.</p>
          {d.tournament || banned ? (
            <section className="card">
              <h2>At tournaments</h2>
              {tournamentRow(d.tournament, banned)}
              {roster ? <p className="fine">{roster}</p> : null}
            </section>
          ) : null}
        </>
      ) : (
        <>
          <WeeklyCard weekly={d.weekly} />
          <RecordCard detail={d} league={league} speciesId={speciesId} banned={banned} />
          <BandsCard bands={d.bands} />
          <AlongsideCard ... />
        </>
      )}
```

with `const roster = rosterLine(d.tournament);` above the return.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --project meta test/species.test.tsx`
Expected: PASS.

- [ ] **Step 7: Lint, typecheck, whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/meta/src/screens/Species.tsx apps/meta/src/App.tsx apps/meta/test/species.test.tsx
git commit -m "Meta site: the species page says what tournaments saw

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: The screens pass, the About page, and the docs

**Files:**
- Modify: `apps/meta/scripts/screens.mjs`
- Modify: `apps/meta/src/screens/About.tsx`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-21-tournament-data-design.md` (status line only)
- Test: `apps/meta/test/about.test.tsx`

**Interfaces:**
- Consumes: everything. This task ships nothing new; it proves the whole thing renders and says
  what the site now does.

- [ ] **Step 1: Give the screens script a tournament fixture**

In `apps/meta/scripts/screens.mjs`:

- add a `tournamentFixture(battles, events)` beside `metaFixture`, returning the block shape
  `{ events, battles, eventsOther: 0, species: [...] }` over `CURATED_IDS` on the same
  `SHARE_CURVE`, and attach it to `metaFixture`'s return as `tournament`
  (`null` when `battles === 0`);
- serve `/legal/<league>.json` from the real baked file on disk, next to the `ranks|matrix`
  branch, so the banned copy is driven by real data:

```js
    const legal = /^\/legal\/([a-z]+)\.json$/.exec(url.pathname);
    if (legal) {
      const body = fs.readFileSync(path.join(publicDir, 'legal', `${legal[1]}.json`), 'utf8');
      await request.respond({ status: 200, contentType: 'application/json', body });
      return;
    }
```

- add a `tournamentSay(battles, events)` helper mirroring `pctMeasured`, and a
  `headerFragmentAll(battles, devices, tBattles, events)` that builds the All sentence from the
  same arithmetic `headerCopy.ts` uses;
- give each run a tournament volume: `empty` 0 events, `thin` 1 event / 40 battles, `mid` 1 event
  / 105 battles, `thick` 4 events / 600 battles, and update the `needles` so `great` and
  `pokemon` each look for `headerFragmentAll(...)` at the nonzero volumes;
- add two source pages to `PAGES`, so the select's other views are captured too:

```js
  ['pokemon-tournaments', `/${LEAGUE}/pokemon?source=tournament`],
  ['pokemon-pvpoke', `/${LEAGUE}/pokemon?source=prior`],
```

  with needles `['Not shared ladder play.']` and `["Nothing measured."]` respectively (only at the
  volumes where they apply: at `empty`, Tournaments reads
  `PvPoke's list. No tournament battles in this window yet.`).

- [ ] **Step 2: Run the screens pass**

Run: `npm run meta:screens`
Expected: no console errors, no sideways overflow at 390px, no non-ASCII text, every needle found.
Look at all the captures by hand and report: whether the filter row still fits two selects plus
the league switcher at phone width, and whether the All header sentence wraps to more than two
lines. If it does not fit, say so in the report rather than shortening a fixed copy string.

- [ ] **Step 3: Update the About page**

`About.tsx` currently opens with "Two sources, one number." There are three now. Change that
section to name all three, keeping the site's rule that a projection is never presented as a
measured result, and state both new half-say points the way the page already states 300 and 5:
interpolated from `HALF_SAY_TOURNAMENT_BATTLES` and `HALF_SAY_EVENTS`, never typed as digits. Add
one paragraph:

> Tournament results come from official Play! Pokemon broadcasts, read off the stream and joined
> to the published rosters. They are a different population from ladder play, so they blend into
> PvPoke's side of the number first, on their own curve, and recede as shared ladder battles
> arrive. Only events on the league's own Play! format count toward the blend; the rest are
> listed and never mixed in. Tournament win rates are never part of the ranking: pick share is.

and update `apps/meta/test/about.test.tsx`'s "names both real sources" test to require all three,
renaming it.

- [ ] **Step 4: Update CLAUDE.md**

In the Layout and Architecture sections, note the Tournament league and the tournament tables. In
Rules, extend the meta.pick3.gg line:

```
- meta.pick3.gg blends PvPoke's curated list, tournament pick share and measured ladder play on a
  stated, visible weight, never presents a projection as a measured result, and never hides
  measured numbers for being small. The 300, 5, 100 and 2 constants stay in `apps/meta/src/rank.ts`
  as the blends' half-say points rather than as gates. Tournament win rates never feed the blend.
```

and add:

```
- Tournament records live in their own tables in the counter worker and are written only through
  the keyed `/api/v1/events` routes. The screen name is the only identity stored; a roster's first
  name, last name and country are never extracted. Never commit a real tournament payload:
  `fixtures/make-tournament.ts` generates a synthetic event with invented screen names.
```

- [ ] **Step 5: Mark the spec done**

Change the spec's `Status:` line to
`Status: implemented 2026-09-21, plan docs/superpowers/plans/2026-09-21-tournament-data.md`.

- [ ] **Step 6: Whole suite, lint, typecheck, both screens passes**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run web:screens && npm run meta:screens
```

Expected: all clean.

- [ ] **Step 7: Commit and deploy**

```bash
git add apps/meta/scripts/screens.mjs apps/meta/src/screens/About.tsx apps/meta/test/about.test.tsx CLAUDE.md docs/superpowers/specs/2026-09-21-tournament-data-design.md
git commit -m "Meta site: About names the third source, and the screens pass covers it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

`counter.yml` builds `apps/meta` and deploys the worker with its static assets; `pages.yml`
publishes pick3 with the Tournament league. Watch both runs and confirm
`https://meta.pick3.gg/great/pokemon?source=tournament` renders Baltimore.

---

## Self-review

Checked against the spec, section by section, after the plan was written.

**Phase 0.** The shipped-cups allowlist, the league object, the engine's unchanged eligibility
(Task 1 asserts the cup's own include and exclude rules reach the `League`, and `allowedInLeague`
already mirrors them, which is why there is no engine task), the app's league picker, and
`legal/<league>.json` with its `{ great: 'championshipseries' }` allowlist: Tasks 1 to 4. The
spec's engine bullet ("nothing new") is covered by Task 2's Step 6, which asserts Mimikyu and
every mega are gone from the built league.

**Phase 1.** Every column in the spec's three tables is in Task 6's DDL. Every validation rule in
the spec's list is a case in Task 5's reject test. The four ingest routes, the bearer check, the
404 on a missing event, the upsert semantics and the `{ stored, replaced, rejected }` response are
Tasks 6 and 10. The read routes' `source` parameter, the `tournament` block on `/api/v1/meta` and
`/api/v1/species/<id>`, the merged team board, and the two event routes are Tasks 8 to 10. The
spec's whole worker testing list maps onto Tasks 5, 6, 9 and 10, with one restatement recorded in
"Decisions" above: "banned species report null" is a site behaviour, tested in Task 12 and Task
14, because the worker holds no legality data.

**Phase 2.** The Source select and its four labels (Task 13), the two new constants and the
sequential blend with its four views (Task 12), the banned-species rule (Task 12), the header line
in every branch (Task 12), the species page's tournaments row, roster line, movesets block,
unresolved-forms line and banned copy (Task 14), the team board's source counts (Task 13), and
`meta:screens` green (Task 15).

**Plan order.** Phase 0 is standalone and shippable after Task 4. Phase 1 lands dark and is
deployed at the end of Task 10, which is the point at which the extraction repo ingests Baltimore.
Phase 2 renders it.

**Not built, and deliberately:** the tournament page, hand-entered results, any weighting by
bracket depth, country on the roster, and feeding measured data back into pick3's recommendations.
All are the spec's "Out of scope". `bracket_depth` is stored and served (Tasks 6, 9) and reaches
no weight.
