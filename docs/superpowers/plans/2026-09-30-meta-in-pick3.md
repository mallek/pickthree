# Meta in pick3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move meta.pick3.gg into the pick3 app: a Meta tab (landing, Top teams, Your battles), the
whole league in Collection with a blended "#N meta" rank and live trend, a species page, a
no-collection start, and meta.pick3.gg retired behind redirects.

**Architecture:** meta.pick3.gg's pure logic (ranking, team board, trend, baseline shapes) moves
into `@pickthree/engine/meta`; apps/web loads PvPoke's side from its own `/data` files on the main
thread and the community side from the counter worker's `/api/v1/*`, through one new module
(`apps/web/src/metaData.ts`) and hooks (`apps/web/src/state/useMeta.ts`). The data build writes the
generated baseline teams for every league it ships. New screens are built from the signed pages'
own markup. The worker keeps the API and 301s every old meta.pick3.gg page into pick3.

**Tech Stack:** TypeScript 5.9 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
React 19, Vite 8, vitest 4 + Testing Library + fake-indexeddb, Cloudflare Worker (wrangler), npm
workspaces, puppeteer-core screen captures.

**Spec:** `docs/superpowers/specs/2026-09-30-meta-in-pick3-design.md` (read it first; this plan
argues from it). Mockups: branch `mock/meta-in-pick3`, file
`apps/web/src/screens/Mock.tsx` (`git show mock/meta-in-pick3:apps/web/src/screens/Mock.tsx`),
throwaway, never merge. Rendered mock PNGs were approved by Travis; the screens must match them.

## Global Constraints

- Read `CLAUDE.md` at the repo root before any edit. Its Rules section applies to every task.
- No em dashes anywhere (code, comments, docs, commits, UI copy); eslint rejects em dash literals.
  Player-facing copy is plain 7-bit ASCII except the existing "Pokémon" spelling the app already uses.
- Braces on all control flow (`curly: all`), `eqeqeq`.
- Exact pinned versions in every package.json; no `^` or `~`. Add no new dependencies.
- UI from `packages/ui` and its tokens: violet for interaction, pink (`--measured`, `MeasuredLine`,
  `MeasuredValue`, `.ui-measured-num`) only for measured community numbers with their mark, outcome
  tones (`Tag tone="win"|"loss"`) for results and trend, red only for destroying data. No new
  color literals outside `tokens.css`: `npm run check-colors` must pass (shrink-only baseline).
- New screens reuse the signed pages' markup and classes (Your Meta `set-card`, `faced-row`,
  `team-row`, `ym-*`; Collection `spec-row`, `spec-group`, `mtags`/`mtag`, `more-btn`; Specimen hero
  grid, `kv` card, `moves`/`move-row`; `packages/ui` components). Any new CSS goes in
  `apps/web/src/app.css` with tokens only.
- Screens with a text input: input at top, results under it (CLAUDE.md rule).
- The collection never leaves the device. Reads of `/api/v1/meta|teams|species` carry league and
  window only, never a Pokemon from the collection. Collection's automatic reads follow the sharing
  switch (`shareEnabled(settings)`); Meta, Top teams and species pages read because the player
  opened them.
- Tests: synthetic data for logic; never pin live PvPoke values in tests (invariants only on live
  data). Local game data lives in `D:/Skunkworks/pickthree/apps/web/public/data` (fresh); in the
  worktree set `PICKTHREE_DATA_OUT=D:/Skunkworks/pickthree/apps/web/public/data` for tests that
  read it.
- Every task ends with `npm run lint`, `npm run typecheck` and the affected vitest projects green
  (`npx vitest run --project <name>`); the final task runs everything.
- Commit after each task with explicit paths (`git add <paths>`, never `-A`), message ending with
  the two attribution lines:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01Pw9mmLb5zRDgidsqrbwkCj`.
  Never push. Never deploy.
- Keep apps/meta building and its tests passing until Task 17 deletes it.

## Review Focus

1. **A rotation or Mega league id with a hyphen** (`mega-great`) arriving by `?l=` or as the app
   league: every parse accepts it and every API/static path is built with it intact. (Task 1 test.)
2. **Offline or the counter worker down** while on Meta, Top teams, a species page or Collection:
   community parts show the shared `ErrorState` with Try again (Meta pages) or fall back to the
   PvPoke-only rank with no trend (Collection), and nothing throws. (Tasks 6, 8, 12 tests.)
3. **A league with no shared battles yet** (a rotation cup on day one): Most seen falls back to
   PvPoke's group with no pink, the board shows Projected generated teams, the trend compares
   against PvPoke's rank. (Tasks 5, 8, 12 tests.)
4. **Sharing switched off**: Collection makes no `/api/v1` request and ranks by PvPoke alone; the
   Meta tab still reads when opened. (Task 12 test asserts zero fetches.)
5. **A player with no collection** who chose "Start without a collection": boot lands on Meta,
   Collection lists the whole league without "Not collected" tags or verdict pills, Teams and
   Counters keep their existing empty states. (Tasks 12, 14 tests.)

---

## Phase 1: Plumbing (nothing visible changes)

### Task 1: League ids accept hyphens everywhere apps/web parses one

**Files:**
- Create: `apps/web/src/leagueId.ts`
- Modify: `apps/web/src/state/store.tsx:517,535,541` (the three `/^[a-z0-9_]+$/` tests)
- Test: `apps/web/test/store.test.tsx` (the `describe('routes')` block at :43)

**Interfaces:**
- Produces: `export const LEAGUE_ID: RegExp` (`/^[a-z0-9_-]+$/`) and
  `export function leagueParam(raw: string | null): string | null` in `apps/web/src/leagueId.ts`.
  Later tasks use `leagueParam` for every `?l=` they parse.

- [x] **Step 1: Write the failing test** in `store.test.tsx` inside `describe('routes')`:

```ts
it('keeps a hyphenated league on counters and build links', () => {
  expect(parseHash('#/counters?vs=tinkaton&l=mega-great')).toEqual({
    screen: 'counters',
    vs: 'tinkaton',
    league: 'mega-great',
  });
  expect(parseHash('#/build?lead=tinkaton&l=mega-great')).toEqual({
    screen: 'build',
    lead: 'tinkaton',
    league: 'mega-great',
  });
  expect(parseHash('#/counters?l=Mega Great')).toEqual({ screen: 'counters' });
});
```

- [x] **Step 2:** Run `npx vitest run --project web test/store.test.tsx`; expect FAIL (league dropped).
- [x] **Step 3: Implement** `apps/web/src/leagueId.ts`:

```ts
/** League ids as the data build writes them: lowercase, digits, underscores and hyphens
 * (rotation and Mega ids such as `mega-great`). One rule for every `?l=` pick3 parses. */
export const LEAGUE_ID = /^[a-z0-9_-]+$/;

export function leagueParam(raw: string | null): string | null {
  return raw !== null && LEAGUE_ID.test(raw) ? raw : null;
}
```

Replace the two `l` checks in `parseHash` (counters and build) with `leagueParam(params.get('l'))`.
Leave the `lead` species check as is (species ids have no hyphen).
- [x] **Step 4:** Run the test again; PASS. Run `npm run lint && npm run typecheck`.
- [x] **Step 5: Commit** `apps/web/src/leagueId.ts apps/web/src/state/store.tsx apps/web/test/store.test.tsx`
  ("Web: league links accept hyphenated ids (mega-great)").

### Task 2: Meta's pure logic moves into `@pickthree/engine/meta`

**Files:**
- Create: `packages/engine/src/meta/api.ts` (response types), `stats.ts`, `rank.ts`, `teamRank.ts`,
  `baseline.ts`, `slice.ts`, `trend.ts`
- Modify: `packages/engine/src/meta/index.ts` (export the new modules)
- Modify: `apps/meta/src/{api,stats,rank,teamRank,baseline,slice}.ts` to re-export from the engine
  (keep their fetch loaders and anything non-pure where they are)
- Modify: `apps/meta/scripts/bake.ts` to import `priorWeights`, `sliceMatrix`, `baselineFor` from the
  engine and re-export them (bake tests keep passing)
- Move tests: `apps/meta/test/{stats,rank,teamRank,board.snapshot}.test.ts` and
  `apps/meta/test/fixtures/seeded-great.json` to `packages/engine/test/meta/` (fix imports)
- Test: `packages/engine/test/meta/trend.test.ts`, `packages/engine/test/meta/baseline.test.ts`

**Interfaces:**
- Produces (all from `@pickthree/engine/meta`):
  - Types, verbatim from `apps/meta/src/api.ts`: `SpeciesStats`, `MovesetStats`,
    `TournamentSpeciesStat`, `TournamentBlock`, `RosterMovesetStats`, `SpeciesTournamentBlock`,
    `MetaSummaryV1`, `TeamRowV1`, `TeamsV1`, `SpeciesDetailV1`, and
    `type SourceKey = 'all' | 'prior' | 'ladder' | 'tournament'`.
  - `stats.ts` verbatim from apps/meta (`Confidence`, `SOME`, `MANY`, `SHARE_MIN`, `TREND_MIN`,
    `confidence`, `margin`, `winRate`, `marginSentence`, `trendPoints`, `trendLabel`), except
    `marginSentence` and anything else that imports apps/meta `format.ts`: copy the two helpers it
    needs (`battles`, `plural`) into `stats.ts` as non-exported functions.
  - `baseline.ts`: `BaselineSpecies`, `Baseline` (types verbatim) and
    `baselineFor(league: string, group: readonly MetaEntryIn[], overall: readonly RankingIn[], commit: { pvpokeCommit: string; pvpokeDate: string }): Baseline`
    where `MetaEntryIn = { speciesId: string; fastMove: string; chargedMoves: readonly string[] }`
    and `RankingIn = { speciesId: string; score?: number; rating?: number; fastMoves?: { moveId: string; uses: number }[]; chargedMoves?: { moveId: string; uses: number }[] }`.
    Body: the per-league half of apps/meta `bake()` (lines 124-150: map group to entries with
    `MOVE_LIMIT` 4 usages, sort by score desc then id) plus `byId: new Map(entries.map(e => [e.speciesId, e]))`.
  - `slice.ts`: `GeneratedTeamLite`, `GeneratedFile` (verbatim), `MATRIX_TOP = 250`,
    `sliceMatrix(matrix: MatchupMatrix, top: number): MatchupMatrix` (moved from bake.ts:186).
  - `priorWeights(overall: readonly { speciesId: string }[], opponents: readonly string[]): Map<string, number>`
    (moved from bake.ts:174) exported from `community.ts`.
  - `rank.ts`: `SpeciesRow`, `SpeciesRanking`, `rankSpecies(meta, baseline, ranks, { source, banned })`
    where the options take `banned: ReadonlySet<string>` instead of `legal: Legal | null`
    (apps/meta's wrapper passes `legal?.banned ?? new Set()`).
  - `teamRank.ts`: verbatim (`TEAM_HALF_SAY`, `TEAM_MIN`, `BOARD_LIMIT`, `THIRD_SAMPLE`,
    `UNKNOWN_PRIOR`, `RowSource`, `BoardRow`, `Board`, `buildBoard`).
  - `trend.ts`:
    `blendedOrder(weights: ReadonlyMap<string, number>): string[]` (weight desc, then id
    `localeCompare`, the same order `rankSpecies` uses) and
    `rankTrend(current: readonly string[], baseline: readonly string[]): Map<string, number>`
    (for each id in `current` that is also in `baseline`: `baselineIndex - currentIndex`; positive
    means it climbed; ids missing from the baseline get no entry).

- [x] **Step 1: Write the failing tests** `packages/engine/test/meta/trend.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { blendedOrder, rankTrend } from '../../src/meta/index.js';

describe('blendedOrder', () => {
  it('sorts by weight, heaviest first, ties by id', () => {
    const w = new Map([['b', 0.2], ['a', 0.2], ['c', 0.6]]);
    expect(blendedOrder(w)).toEqual(['c', 'a', 'b']);
  });
});

describe('rankTrend', () => {
  it('reports places gained as positive and places lost as negative', () => {
    const t = rankTrend(['x', 'y', 'z'], ['y', 'z', 'x']);
    expect(t.get('x')).toBe(2);
    expect(t.get('y')).toBe(-1);
    expect(t.get('z')).toBe(-1);
  });
  it('gives no trend to a species the baseline did not rank', () => {
    expect(rankTrend(['new', 'x'], ['x']).has('new')).toBe(false);
  });
  it('gives zero for an unmoved species', () => {
    expect(rankTrend(['x'], ['x']).get('x')).toBe(0);
  });
});
```

and `baseline.test.ts` (synthetic group of three, rankings with scores 90/70/null, assert order
`[a(90), b(70), c(null)]`, usages cut to 4, `byId.get('b')?.fastMove`).
- [x] **Step 2:** `npx vitest run --project engine test/meta`; FAIL (modules missing).
- [x] **Step 3: Implement** by moving code (copy file, adjust imports to engine-relative `.js`
  paths, delete nothing in apps/meta yet; turn apps/meta's modules into thin re-exports so their
  own screens and tests compile). Move the four apps/meta tests and the fixture into
  `packages/engine/test/meta/` with engine-relative imports; delete the originals in apps/meta/test.
- [x] **Step 4:** `npx vitest run --project engine --project meta`; PASS. `npm run lint && npm run typecheck`.
- [x] **Step 5: Commit** (engine meta files and tests, apps/meta re-exports, moved tests)
  ("Engine: meta ranking, team board, trend and baseline shapes move into @pickthree/engine/meta").

### Task 3: The data build writes generated baseline teams for every league

**Files:**
- Create: `packages/data/src/build-baseline.ts`, `packages/data/epochs.json` (moved, `git mv`
  `apps/meta/epochs.json packages/data/epochs.json`)
- Modify: `packages/data/src/build.ts` (call after the derived loop, before `writeLegal`),
  `packages/data/src/paths.ts:20-21` (`EPOCHS_PATH` to `packages/data/epochs.json`, comment updated),
  `apps/meta/scripts/bake.ts` (read epochs from `packages/data/epochs.json`; `generateFor` imported
  from `packages/data/src/build-baseline.ts` via relative path, re-exported),
  `.github/workflows/ci.yml:33,66,119`, `pages.yml:35`, `counter.yml:41` (cache key: replace
  `'apps/meta/epochs.json'` with `'packages/data/epochs.json'` and add
  `'packages/engine/src/coldstart/**','packages/engine/src/search/**','packages/engine/src/score/**','packages/engine/src/builds/**'`)
- Test: `packages/data/test/build-baseline.test.ts` (port the real-data `generateFor` block of
  `apps/meta/test/bake.test.ts:266-300`, skipped when
  `${OUTPUT_DIR}/data-manifest.json` is absent; 20 s timeout)

**Interfaces:**
- Consumes: `priorWeights`, `PROJECTION_SLOPE` from `@pickthree/engine/meta`; `PROJECTION_ANCHOR`,
  `buildOptionsFor`, `candidatePool`, `coldStartBuilds`, `coldStartSpecimens`,
  `generateColdStartTeams`, `spreadsFromGameMaster`, `GameDataIndex`, `MatchupMatrix`, `Rankings`,
  `League` from `@pickthree/engine`.
- Produces: `generateFor(input: { league: League; index: GameDataIndex; matrix: MatchupMatrix; rankings: Rankings; gameMaster: unknown }): GeneratedTeam[]`
  (moved verbatim from bake.ts:222-256 with `COLD_POOL = 60`, `COLD_TEAMS = 24`) and
  `writeBaselineTeams(outDir: string, leagues: readonly League[], data: GameData, gameMaster: unknown, manifest: { pvpokeCommit: string; pvpokeDate: string }): { league: string; teams: number }[]`.
  Output file `baseline/<id>-teams.json` is `GeneratedFile` exactly as bake.ts:340-348 writes it.
  Covers every league with `kind !== 'special'` whose `matrix/<id>.json` exists (skip silently
  otherwise, the `PICKTHREE_SKIP_MATRIX` case). Rankings read from `rankings/<id>/*.json` in
  `outDir` (cups derived from Great have their own filtered files there).

- [x] **Step 1: Write the failing test** (real data, skips without it):

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTPUT_DIR } from '../src/paths.js';
import { writeBaselineTeams } from '../src/build-baseline.js';
// ...load leagues.json, pokemon.json, moves.json, gamemaster.json from OUTPUT_DIR into a tmp copy
const have = fs.existsSync(path.join(OUTPUT_DIR, 'data-manifest.json'));
describe.skipIf(!have)('writeBaselineTeams', () => {
  it('writes a generated file for every non-special league with a matrix', () => {
    // run against OUTPUT_DIR into os.tmpdir() mkdtemp (copy matrix/ and rankings/ for great only
    // to keep it fast), then assert baseline/great-teams.json has source 'generated', 24 teams,
    // three distinct species each, strengths in 0..100.
  }, 20_000);
});
```

  Write the test fully: copy `leagues.json` filtered to `great`, `matrix/great.json`,
  `rankings/great/*` into the tmp dir, call `writeBaselineTeams(tmp, [great], data, gm, manifest)`,
  read back the file and assert the invariants above. No pinned species.
- [x] **Step 2:** `PICKTHREE_DATA_OUT=D:/Skunkworks/pickthree/apps/web/public/data npx vitest run --project data test/build-baseline.test.ts`; FAIL.
- [x] **Step 3: Implement** `build-baseline.ts`, wire it in `build.ts`, move epochs, update paths and
  the five cache keys, point bake.ts at the new epochs path and the moved `generateFor`.
- [x] **Step 4:** Test PASS; `npx vitest run --project data --project meta`; lint, typecheck.
  Then run the real build once: `npm run data:build` (writes `apps/web/public/data/baseline/*`),
  confirm a file per non-special league in `leagues.json` (expect great, ultra, master,
  championshipseries and every rotation league).
- [x] **Step 5: Commit** (build-baseline, build.ts, paths.ts, the `git mv` of epochs, bake.ts,
  workflows, test) ("Data: generated baseline teams for every league; epochs move to packages/data").

## Phase 2: Meta tab

### Task 4: Routes and the tab bar

**Files:**
- Modify: `apps/web/src/state/store.tsx` (Route union :98-115, `parseHash` :496-574, `hashFor` :576-632)
- Modify: `apps/web/src/App.tsx` (TabBar :51-99, `renderScreen` :101-137, `showTabs` :148-150)
- Test: `apps/web/test/store.test.tsx`

**Interfaces:**
- Produces Route variants (exact):
  - `{ screen: 'meta' }` (landing, unchanged name)
  - `{ screen: 'meta-teams'; w?: WindowKey; src?: SourceKey; league?: string }`
  - `{ screen: 'meta-battles' }`
  - `{ screen: 'meta-new'; team?: string[] }` (team: 1 to 3 species ids)
  - `{ screen: 'species'; id: string; league?: string }`
  - `{ screen: 'add'; species?: string }`
  - `{ screen: 'collection'; league?: string }`
- Hashes: `#/meta`, `#/meta/teams[?w=..&src=..&l=..]`, `#/meta/battles`,
  `#/meta/new[?team=a+b+c]`, `#/species/<id>[?l=..]`, `#/add[?species=<id>]`,
  `#/collection[?l=..]`. `w` must be one of `meta|30|7`, `src` one of `all|prior|ladder|tournament`
  (drop invalid values), species ids `^[a-z0-9_]+$`, leagues via `leagueParam`. `hashFor` never
  writes `league` back (same rule as counters).
- App: `renderScreen` maps `meta` to a placeholder that still renders `YourMeta` until Task 8,
  `meta-battles` to `YourMeta`, `meta-teams` to a placeholder `<YourMeta/>` until Task 9,
  `species` to a placeholder `<Collection/>` until Task 13. TabBar label "Meta" (was "Your
  Meta"); Meta tab current for `meta`, `meta-teams`, `meta-battles`, `meta-new`, `meta-log`;
  Collection current for `collection`, `specimen`, `add`, `species`. `showTabs` unchanged list.

- [x] **Step 1: Write failing tests** for every new hash, both directions, including invalid
  `w`/`src`/species/team values being dropped and `#/meta/teams?l=mega-great`.
- [x] **Step 2:** Run; FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** PASS; `npx vitest run --project web`; lint; typecheck.
- [x] **Step 5: Commit** ("Web: Meta tab routes, species and prefill routes; the tab reads Meta").

### Task 5: Meta data loaders (`apps/web/src/metaData.ts`)

**Files:**
- Create: `apps/web/src/metaData.ts`
- Test: `apps/web/test/metaData.test.ts`

**Interfaces:**
- Consumes: Task 2 types and functions; `COUNTER_ORIGIN` (`apps/web/src/counter.ts`);
  `communityLeague` (`apps/web/src/communityMeta.ts`); `resolveWindow`, `ApiWindow`, `WindowKey`
  from `@pickthree/engine/meta`.
- Produces (every loader takes `fetcher: typeof fetch = fetch` last, memoizes per key in a module
  Map, forgets a failed load, and has a `resetMetaDataForTests()`):
  - `loadPvpokeSide(league: string, fetcher?): Promise<{ baseline: Baseline; ranks: string[]; banned: Set<string> }>`
    fetching `/data/meta/<league>.json`, `/data/rankings/<league>/overall.json`,
    `/data/legal/<league>.json` (a non-ok legal answer means nothing banned) and building
    `baselineFor(league, group, overall, { pvpokeCommit: '', pvpokeDate: '' })`, `ranksOf(overall)`.
  - `loadSlice(league, fetcher?): Promise<MatrixView>` from `/data/matrix/<league>.json` via
    `new MatrixView(sliceMatrix(matrix, MATRIX_TOP))`.
  - `loadGenerated(league, fetcher?): Promise<GeneratedFile | null>` from
    `/data/baseline/<league>-teams.json` (404 gives null).
  - `apiWindow(key: WindowKey, league: string, seasons: Season[], epochs: Epoch[], now: Date): ApiWindow`
    (wraps `resolveWindow`).
  - `fetchSummary(apiLeague: string, w: ApiWindow, fetcher?): Promise<MetaSummaryV1>`,
    `fetchTeamsBoard(apiLeague, w, source: SourceKey, fetcher?): Promise<TeamsV1>`,
    `fetchSpeciesDetail(apiLeague, id, w, source, fetcher?): Promise<SpeciesDetailV1>`; URLs exactly
    as apps/meta `api.ts` builds them but on `${COUNTER_ORIGIN}`, with `source` only when not
    `all`/`prior`, `cache: 'no-store'`, 8 s timeout (`AbortController`), throwing on non-ok.
  - `weekEarlier(w: ApiWindow): ApiWindow | null`: the same window with `until` moved back seven
    days; null when that leaves `until <= since` (less than a week of history).

- [x] **Step 1: Write failing tests** with a stub fetcher (a `Map<string, unknown>` of URL prefix
  to JSON or status): hyphenated league in every URL; legal 404 means empty banned; generated 404
  means null; summary non-ok rejects; memo returns the same promise twice and retries after a
  failure; `weekEarlier` null for a 3-day window and a correct ISO `until` for a 20-day one.
- [x] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS, lint, typecheck.
- [x] **Step 5: Commit** ("Web: meta data loaders over /data and the counter API").

### Task 6: Meta hooks: ranking, trend, board, species detail (`apps/web/src/state/useMeta.ts`)

**Files:**
- Create: `apps/web/src/state/useMeta.ts`
- Test: `apps/web/test/useMeta.test.tsx`

**Interfaces:**
- Consumes: Task 5 loaders; `useAppState` (`data.seasons`, `data.schedule`, `data.epochs`,
  `data.leagues`, `settings`); `seasonsFor` (`state/seasonsFor.ts`); `shareEnabled` (`metaShare.ts`).
- Produces:
  - `type Loaded<T> = { state: 'loading' | 'ready' | 'error'; data: T | null; retry: () => void }`
  - `useMetaRanking(league: string, opts: { window: WindowKey; source: SourceKey; community: boolean }): Loaded<{ ranking: SpeciesRanking; order: string[]; trend: Map<string, number>; window: ApiWindow }>`
    - `community: false` (or `communityLeague` null, or a fetch failure) ranks by PvPoke alone:
      `rankSpecies(EMPTY_SUMMARY, baseline, ranks, { source: 'prior', banned })` and an empty trend.
      A fetch failure still returns `state: 'ready'` with this fallback plus `data.offline = true`
      (add `offline: boolean` to the data type).
    - `community: true`: current summary, then `weekEarlier(window)`: when null, the trend baseline
      is the PvPoke-only order; otherwise a second `fetchSummary` for the earlier window and its
      blended order. `trend = rankTrend(order, baselineOrder)`.
  - `useTopTeams(league, opts: { window: WindowKey; source: SourceKey }): Loaded<Board>` (summary,
    teams board, slice, generated, ranking; `buildBoard` exactly as apps/meta `App.tsx:454-473`,
    `prior` source empties observed teams and cores).
  - `useSpeciesDetail(league, id, window: WindowKey, source: SourceKey): Loaded<SpeciesDetailV1>`.
  - `EMPTY_SUMMARY: MetaSummaryV1` (zero battles, empty arrays, `previous: null`, `tournament: null`).

- [x] **Step 1: Write failing tests** rendering a tiny probe component inside `<AppProvider host={fakeHost()}>`
  with a stubbed global fetch (vi.stubGlobal): community off makes zero `/api/v1` requests;
  community on with a 3-day window makes exactly one summary request and trends against PvPoke;
  a 20-day window makes two and trends against the earlier blend; worker 503 gives
  `state: 'ready'`, `offline: true`, empty trend.
- [x] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS, lint, typecheck.
- [x] **Step 5: Commit** ("Web: meta ranking, trend, board and species hooks").

### Task 7: Your battles page and the shared logging pieces

**Files:**
- Modify: `apps/web/src/screens/YourMeta.tsx` (rename export to `YourBattles`, keep file or rename to
  `YourBattles.tsx` with `git mv`)
- Create: `apps/web/src/components/meta/LogPieces.tsx` exporting `CurrentTeam`, `NoTeam`,
  `Contribution`, `ProgressLine`, `SpeciesRows`, `TeamRows`, `ResultStrip` moved verbatim out of
  YourMeta.tsx
- Modify: `apps/web/src/App.tsx` (`meta-battles` renders `YourBattles`)
- Test: `apps/web/test/yourMetaScreen.test.tsx` (route to `#/meta/battles`, update assertions)

Your battles is today's page with: header `variant="sub"` title "Your battles" back to Meta
(`back({ screen: 'meta' })`), no SiteLink, no "See what everyone else is facing" action row, no
CurrentTeam/NoTeam card and no Contribution line (they move to the landing). Keeps the explainer,
progress line, stale card, faced list with legend, Your teams, Earlier seasons, footer.
Faced rows open the species page (`hashFor({ screen: 'species', id })`), not Counters.

- [x] Steps: failing test updates (page title "Your battles", no meta.pick3.gg link, faced row href
  `#/species/tinkaton`), FAIL, implement, PASS, lint, typecheck, commit ("Web: Your battles page;
  logging pieces shared").

### Task 8: Meta landing (`#/meta`)

**Files:**
- Create: `apps/web/src/screens/MetaHome.tsx`
- Modify: `apps/web/src/App.tsx` (`meta` renders `MetaHome`), `apps/web/src/app.css` (only what the
  mock's `m3-*` rules need, renamed `mh-*`, tokens only)
- Test: `apps/web/test/metaHome.test.tsx`

Build exactly the approved round-3 mock (`MockMeta` in the mock branch, `log` false and true), with
these production details:
- Header `variant="top"` "Meta" with the Settings IconButton; `LeagueSwitcher`; no window pill.
- Title `h2` "What trainers are facing", line "A community snapshot, built from shared battle logs."
- Most seen card: top five of `useMetaRanking(league, { window: 'meta', source: 'all', community: true })`
  `order`; row = 36px token, name over a violet weight bar (`barPct` of the row), share as pink
  `.ui-measured-num` with the bar mark (`MeasuredValue` is acceptable if it fits the row), chevron;
  row href `#/species/<id>`. Share is `row.share` when measured; when the league has no measured
  battles show the PvPoke group order with no share and no pink. "Explore Pokémon" links
  `#/collection`.
- First visit (no sets in any league: `storage.loadAllSets()` empty) shows Most logged teams (top
  two `kind: 'team'` rows of `useTopTeams(league, { window: 'meta', source: 'all' })` via
  `TeamRows`-style `team-row` buttons, "N battles", record; "Results from trainers logging their own
  teams."; "Explore teams" to `#/meta/teams`), then Help build the meta (accent-outlined card,
  `Switch` "Share battles anonymously" bound to `setShareEnabled`, primary "Log a battle" to
  `meta-log` when a set is open else `meta-new`, "No collection import needed."), then the Your meta
  empty card.
- With a log: Your contribution card (`Contribution` line, the switch, Current team with record in
  normal ink and three 52px tokens with names, Log a battle, Change team, Share team; `NoTeam`
  variant when no open set), Your meta card (battles this run or season, `ProgressLine` box, the
  Most faced / Worst record `Seg`, top two `SpeciesRows`, "View your battle history" to
  `#/meta/battles`), then Most logged teams without the caption.
- Footer "Community data reflects shared logs."
- Failure: community cards render `ErrorState` "Could not load the community meta." with a Try
  again `Button` calling `retry`; personal cards render regardless.

- [x] Steps: failing tests (first visit and with-log states from seeded IndexedDB sets; worker 503
  shows ErrorState and still shows Log a battle; a hyphenated league in the API URL; no
  `meta.pick3.gg` anywhere), FAIL, implement, PASS, lint, typecheck, check-colors, commit
  ("Web: Meta landing").

### Task 9: Top teams board (`#/meta/teams`) with Run this team

**Files:**
- Create: `apps/web/src/screens/TopTeams.tsx` (port of `apps/meta/src/screens/Teams.tsx`),
  `apps/web/src/components/meta/boardView.ts` (port of apps/meta `boardView.ts`),
  `apps/web/src/components/meta/BlendLine.tsx` (port of apps/meta `BlendLine`, `Note`,
  `headerCopy.ts`)
- Modify: `apps/web/src/app.css` (port the board classes from `apps/meta/src/app.css:326-590`
  listed in the Task 9 notes: team-rows, team-row(.open), row-head, row-sprites, row-text,
  row-title, row-sub, row-score, row-body, row-facts, row-part, row-label, third-chips, third-chip,
  builds, build-line, build-sprites, build-fact, team-details, board-controls, board-count,
  term-line, note-badge; rename any that collide with existing web classes by prefixing `tb-`;
  tokens only), `apps/web/src/App.tsx`
- Move test: `apps/meta/test/teams.test.tsx` and `boardView.test.ts` to `apps/web/test/` adapted
- Test: `apps/web/test/topTeams.test.tsx`

Sub header "Top teams" back to Meta; `LeagueSwitcher`; Window and Source `Select`s (the same pair
apps/meta uses, values written to the route `w`/`src` with `navigate(..., { replace: true })`);
the blend line with "How it is ranked"; Multi-team only; Sort; rows open in place. Each open team or
build line has two text actions: "Open in Build" (sets picks with `setPicks` from the members and
moves exactly as `SharedTeam.tsx:38-46` does, then `analyze()`; or navigate to the in-app
`#/t/<league>/<members>` hash built by the engine `teamLink` without the origin) and "Run this
team" (`navigate({ screen: 'meta-new', team: species })`). Cores never link. The `Contribute`
card links to `#/meta/new`.

- [x] Steps: failing tests (ported board tests pass against the engine; Run this team navigates to
  `#/meta/new?team=a+b+c`; Open in Build lands on the analysis; prior source shows Projected rows
  only), FAIL, implement, PASS, lint, typecheck, check-colors, commit ("Web: Top teams board with
  Run this team").

### Task 10: Run this team prefill and the action on pick3's own teams

**Files:**
- Modify: `apps/web/src/screens/NewSet.tsx` (seed slots from `route.team` once, legal species only),
  `apps/web/src/components/team/ScoreCard.tsx` (new optional prop `onRun?: () => void`, a text
  `Button` "Run this team" beside "Take to battle"), `apps/web/src/screens/TeamDetail.tsx` (pass
  `onRun` navigating to `meta-new` with the team's species), `apps/web/src/screens/Teams.tsx`
  (`.teams-actions` gains "Run this team")
- Test: `apps/web/test/newSet.test.tsx`, `apps/web/test/teamDetail.test.tsx`, `apps/web/test/teamsList.test.tsx`

- [x] Steps: failing tests (`#/meta/new?team=tinkaton+azumarill+clodsire` shows three filled slots
  and Start set enabled; an unknown species is dropped; TeamDetail and Teams buttons navigate there),
  FAIL, implement, PASS, lint, typecheck, commit ("Web: Run this team from the board, Teams and
  Team Analysis").

## Phase 3: Collection

### Task 11: Add prefill and the specimen link

**Files:**
- Modify: `apps/web/src/screens/AddPokemon.tsx` (initial `speciesId` from `route.species` when it is
  in the species list), `apps/web/src/screens/Specimen.tsx` (after the meta rank card, an
  `.action-row` "See <name> in the meta" with `.chev`, href `#/species/<build species id>`)
- Test: `apps/web/test/addPokemon.test.tsx` (or the existing add test file), `apps/web/test/specimen.test.tsx`

- [x] Steps: failing tests, FAIL, implement, PASS, lint, typecheck, commit ("Web: Add one prefill;
  specimen links to its species page").

### Task 12: Collection lists the whole league with blended rank and trend

**Files:**
- Modify: `apps/web/src/screens/Collection.tsx`, `apps/web/src/screens/CollectionFilters.tsx`,
  `apps/web/src/components.tsx` (new `MetaRankTags({ rank, delta, role })` component), `apps/web/src/app.css`
- Test: `apps/web/test/collection.test.tsx`

Behavior (spec "Collection", mock views `collection`, `collectionmeta`, `collectionnew`):
- Ranking source: `useMetaRanking(league, { window: 'meta', source: 'all', community: shareEnabled(settings) })`.
  `rankOf(speciesId)` = 1-based index in `order`; species absent from `order` sort after, by
  PvPoke rank, and show no rank tag.
- Not-collected rows: every id in `leagueInfo.legal` (Shadow forms as their own ids) whose
  species has no specimen (compare against each specimen's `speciesId` and its verdict build
  species), shown unless sticky `collection.hideNotCollected` (default false) is on. Row:
  `a.spec-row` href `#/species/<id>`, 44px token, `.spec-name` (Shadow flag), `span.mtags` with
  `MetaRankTags`, right slot `<Tag tone="neutral">Not collected</Tag>`; the tag is omitted when the
  collection is empty.
- Every row's tag line: `MetaRankTags` renders `<span className="mtag">#N meta</span>`, then a
  trend `Tag` (`win` with an up-triangle svg and the number, `loss` with a down-triangle; none for 0
  or no trend; accessible name "up 3 places" / "down 3 places"), then PvPoke's role tag
  (`#R lead|switch|closer...` from `metaRanks[id]`, same `META_CUTOFF`). Replaces `MetaTags` on rows.
  `HundoTag` and Excluded stay.
- Sort: `SORTS` label "Meta rank" now orders by blended rank; it is the default (session sticky
  initial) when the collection is empty. Under Verdict, IV rank and Name, your rows sort as today
  and not-collected rows follow, in meta order.
- "Top 50 meta" filter keeps rows whose blended rank is at most 50 or role rank at most 50.
- Count line: "212 Pokémon · 96 kinds · 142 not collected" (last part only while shown).
- Verdict pills apply to your rows only (hide not-collected while any is on); hidden when the
  collection is empty. Search placeholder "Search Pokémon", matching both kinds of row by name.
- Empty collection: no `NoCollection` card any more; the header keeps Add and the Import action
  (add an Import IconButton or keep the existing header links), `LeagueSwitcher`, the list.
- Filter sheet: new switch `{ key: 'collection.hideNotCollected', label: 'Hide not collected', line: 'Only the Pokémon you have', initial: false }`
  second in `COLLECTION_FILTERS`; Collection's `filtersOn` counts it when on.
- Header loses `SiteLink`.

- [x] Steps: failing tests (with a 3-specimen collection and a fake league of 6 legal species:
  not-collected rows appear with the tag in the right slot; Hide not collected removes them and
  bumps the filter count; Meta rank sort interleaves; empty collection shows the list without the
  tag or pills; sharing off makes zero `/api/v1` fetches and shows no trend tags; a trend of +3
  renders "up 3 places"), FAIL, implement, PASS, lint, typecheck, check-colors, commit
  ("Web: Collection lists the whole league with the blended meta rank and trend").

### Task 13: Species page (`#/species/<id>`)

**Files:**
- Create: `apps/web/src/screens/SpeciesPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/test/speciesPage.test.tsx`

Build the approved round-2 species mock (`MockSpecies`), production details:
- On arrival with `route.league` known and different, `setLeague` first (Counters pattern).
- Sub header back (`back({ screen: 'collection' })`), Settings. Hero: 64px token, `h2` name,
  `TypeChips`, `MetaRankTags` + "#M PvPoke", then "You have N" or "Not in your collection".
- Facts `card` (`kv` rows): Share of battles (pink with mark, `row.share`), Players went against it
  (detail wins-losses as "W-L"; left out when 0 sightings), At tournaments ("N% of picks" or "Banned
  at tournaments" from `banned`), one source line. No sightings: "Not faced in this window" in the
  share row.
- Yours: your specimens of this species sorted by IV rank, `spec-row sub` rows to
  `#/collection/<specimenId>`; none: line "Scan one in Poke Genie, or add it by hand." and primary
  "Add one" to `#/add?species=<id>`.
- Moves players ran: `moves`/`move-row` markup from `detail.movesets` aggregated as apps/meta
  `Species.tsx` `aggregateMoves` does (move names and types from `s.data.moves`), the line "Seen in N
  of M battles with known moves." plus a comparison with PvPoke's set from `baseline.byId`.
  Tournament moves card when the source includes tournaments and data exists (port
  `TournamentMovesCard`).
- Seen next to: top three `detail.alongside`, token + name, each linking to its species page.
- Actions: primary "Build around it" (`#/build?lead=<id>`), secondary "Who beats it"
  (`#/counters?vs=<id>`).
- Detail fetch failure: `ErrorState` with Try again under the hero; Yours and actions still render.
- Unknown id: `Empty` "No Pokémon called that in this league." with a link to Collection.

- [x] Steps: failing tests (owned and unowned, 503, unknown id, `?l=mega-great` switches league),
  FAIL, implement, PASS, lint, typecheck, check-colors, commit ("Web: species page").

## Phase 4: No-collection start

### Task 14: Start without a collection

**Files:**
- Modify: `apps/web/src/storage/db.ts` (Settings gains `startedWithout?: boolean` with doc comment
  "Added 2026-09-30. Absent means false: the player has not chosen to start without a collection."),
  `apps/web/src/state/store.tsx` (boot rule at :905: `else if (!collection && settings.startedWithout && initialRoute.screen === 'welcome')`
  routes to `meta`), `apps/web/src/screens/Welcome.tsx` (third button after "Add a few by hand":
  `className="btn btn-secondary btn-cta"`, "Start without a collection", `ArrowGlyph`, disabled until
  boot ready, sets `startedWithout: true` via `updateSettings` then navigates `meta`),
  `apps/web/src/components/MetaPreview.tsx` (card is `href="#/meta"`; league follows the app league),
  `apps/web/src/components.tsx` `NoCollection` (adds a "See the live meta" `choice-card` to `meta`),
  `apps/web/src/screens/Teams.tsx`, `Counters.tsx` (remove `SiteLink site="meta"`),
  `apps/web/src/screens/settings/Community.tsx:48` (button opens `#/meta`)
- Test: `apps/web/test/welcome.test.tsx` (or existing), `apps/web/test/store.test.tsx`,
  `apps/web/test/metaPreview.test.tsx`, update tests that asserted the meta.pick3.gg href

- [x] Steps: failing tests (button saves the flag and lands on `#/meta`; boot with the flag and no
  collection lands on `#/meta`; with a collection still lands on `#/teams`; no `meta.pick3.gg` href
  in apps/web), FAIL, implement, PASS, lint, typecheck, commit ("Web: start without a collection").

### Task 15: Screens, audit captures and draft audit records

**Files:**
- Modify: `apps/web/scripts/screens.mjs` (fetch patch for `/api/v1/species/` from a new fixture
  `apps/web/scripts/fixtures/community-species-sample.json` next to the existing samples; captures
  `meta-home-first`, `meta-home-log`, `meta-home-error`, `meta-teams`, `meta-teams-open`,
  `your-battles`, `collection-league`, `collection-league-meta`, `collection-empty-league`,
  `species-owned`, `species-unowned`; add all to `AUDIT_ENFORCED`; rename `20-your-meta` and
  `your-meta-active` captures to follow the new routes)
- Create: `docs/design/audits/meta-home.md`, `top-teams.md`, `your-battles.md`, `species.md` from
  `docs/design/audits/_template.md`; update `collection.md` with the new states; append a note to
  `meta-teams.md`, `meta-pokemon.md`, `meta-about.md` that the pages moved into pick3
- Images: `docs/design/audits/img/<name>-{dark,light}.webp` (600px, quality 72, as the existing
  records)

- [x] Steps: `npm run web:audit`; fix every finding on enforced screens in the owning screen's code;
  rerun until exit 0 with no console errors; convert images; fill the records' Screenshots and
  Automated checks sections; leave the Aesthetics, Functionality and Sign-off sections for Travis
  ("Awaiting Travis's review"). Commit ("Audit: Meta tab, Collection and species captures").

## Phase 5: Retire meta.pick3.gg

### Task 16: Post tooling moves to packages/data; How the meta is ranked moves to Settings

**Files:**
- Move: `git mv apps/meta/scripts/post packages/data/scripts/post`; tests
  `apps/meta/test/post*.test.ts` to `packages/data/test/` (fix imports; `priorWeights` from
  `@pickthree/engine/meta`)
- Modify: root `package.json` `"post": "tsx packages/data/scripts/post/post.ts"`, `.prettierignore:5`
  path, `packages/data/package.json` (devDependency `@pickthree/sim-pvpoke` if not present, exact
  version as in apps/meta), `packages/data/scripts/post/weights.ts` `API_BASE` to the workers.dev
  `COUNTER_ORIGIN` value (meta.pick3.gg will only redirect)
- Create: `apps/web/src/screens/settings/MetaRanked.tsx` (port of `apps/meta/src/screens/About.tsx`
  blend explanation, constants from `@pickthree/engine/meta`, no theme control, no PvPoke list), linked
  from the Community settings page as a row "How the meta is ranked"
- Test: moved post tests; `apps/web/test/settings.test.tsx` (the new page opens)

- [x] Steps: move, failing settings test, implement, `npx vitest run --project data --project web`,
  `npm run post -- great --help` or a dry invocation that exercises imports without rendering (if
  post.ts has no dry mode, run `npx tsc --noEmit -p packages/data` to prove the imports), lint,
  typecheck, commit ("Post tooling moves to packages/data; How the meta is ranked moves to Settings").

### Task 17: Worker redirects; delete apps/meta; CI, scripts and docs

**Files:**
- Modify: `workers/counter/src/index.ts` (replace `return env.ASSETS.fetch(request)` at :630 with
  `return redirectToPick3(url)`), new `workers/counter/src/redirect.ts`, `workers/counter/wrangler.toml`
  (delete `[assets]` block :14-26), `Env` drops `ASSETS`, header comment :1-28 updated
- Test: `workers/counter/test/routes.test.ts` (drop `ASSETS` from `testEnv`), new
  `workers/counter/test/redirect.test.ts`
- Delete: `apps/meta/` entirely (`git rm -r apps/meta`)
- Modify: `.github/workflows/ci.yml` (remove :38 meta build and the `meta-screens` job),
  `counter.yml` (name "worker", paths `workers/counter/**` and `.github/workflows/counter.yml`, remove
  the meta build step and its data cache steps if only the bake needed them), root `package.json`
  (remove `meta:screens`, `meta:audit`), `scripts/check-tokens.mjs:29`, `scripts/color-literals.mjs:16`,
  `scripts/color-literal-baseline.json:47-50`, `.gitignore:16-25,36`, comments in
  `workers/counter/src/tournament.ts:23`, `packages/data/src/build-legal.ts:12`,
  `build-derived.ts:49`, `packages/engine/src/meta/community.ts:11`, `window.ts:5,11`,
  `coldstart/teams.ts:2`, `pool.ts:4`, `packages/ui/base.css` comments, `packages/ui/src/components/SiteLink.tsx`
  (delete the component and its export and test if nothing uses it any more)
- Modify: `CLAUDE.md` (Layout, Data build list gains `baseline/`, replace the "Meta site" section
  with a "Meta tab" section, Deploy and CI, Commands, the outbound-calls rule naming Meta, Top teams,
  species pages and Collection's switch-gated read, the meta blend rule's file references)

**Interfaces:**
- `redirectToPick3(url: URL): Response` returns 301 with `Location`:
  `/` to `https://pick3.gg/#/meta/teams`; `/<league>` to `https://pick3.gg/#/meta/teams?l=<league>`;
  `/<league>/teams` the same; `/<league>/pokemon` to `https://pick3.gg/#/collection?l=<league>`;
  `/<league>/p/<id>` to `https://pick3.gg/#/species/<id>?l=<league>`; `/about` to
  `https://pick3.gg/#/meta`; anything else to `https://pick3.gg/#/meta`. Query `window` (and legacy
  `w`) becomes `w`, `source` becomes `src`, both only when valid; league and species ids validated
  (`/^[a-z0-9_-]+$/`, `/^[a-z0-9_]+$/`), invalid ones dropped. `Cache-Control: public, max-age=3600`.

- [x] Steps: failing redirect tests for each mapping and an invalid id, FAIL, implement, delete
  apps/meta and the references, `npm install` (workspace removed; commit the lockfile change),
  `npm test`, lint, typecheck, check-colors, check-tokens, commit ("Retire meta.pick3.gg: the worker
  redirects into pick3; apps/meta deleted").

### Task 18: Final verification

- [x] `npm run lint && npm run typecheck && npm test` (with `PICKTHREE_DATA_OUT` pointing at the
  fresh data) all green.
- [x] `npm run check-colors && npm run check-tokens && npm run ui:audit`.
- [x] `npm run web:screens` and `npm run web:audit` exit 0, no console errors.
- [x] `grep -rn "meta.pick3.gg" apps packages workers --include=*.ts --include=*.tsx` returns only
  the worker redirect comment and tests.
- [x] Update the plan checkboxes; commit any record or doc touch-ups.
