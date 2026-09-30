# Core + Flex Boards (engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The engine produces core + flex rows (a two-Pokemon core plus up to 4 near-tied third-slot options) for the Top, Budget and Mega boards, and the post text lists each core once with a pick3.gg link per flex option.

**Spec:** `docs/superpowers/specs/2026-09-30-core-flex-boards-design.md` (binding). Builds on the cup-boards work already on this branch (`cupBoards`, `scoreTrios`, `presentTeam`, `memberDisplay`, `postMarkdown`).

## Global Constraints

- Braces on all control flow (eslint `curly: all`). No em dashes anywhere (code, comments, commits). Exact pinned versions. All player-facing text 7-bit ASCII.
- Tests use synthetic data or invariants; never pin a PvPoke value (a rating, rank, strength).
- Engine never imports `@pickthree/sim-pvpoke`.
- Stage explicit paths; never `git add -A`. Never commit anything under `private/` or `posts/`.
- Run tests with `PICKTHREE_DATA_OUT=D:/Skunkworks/pickthree/apps/web/public/data` set. That data is stale (great, master, ultra, championshipseries only): a skipped static block is not a pass, and the Mega board cannot be exercised on it. Five other test files fail with ENOENT for missing league data (analyzeMegas, recommend.e2e, teammates/suggest, verdicts/worth, data/test/leagues.test.ts); that is pre-existing.
- Commit messages end with these two lines exactly:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Naiz54FzTRyeUdM85Gdx1x`
- Work only in the worktree `D:\Skunkworks\pickthree\.claude\worktrees\cup-boards` (branch `cup-boards`).

## File Structure

- `packages/engine/src/coldstart/cores.ts` (new): pure `selectCores`.
- `packages/engine/src/coldstart/coreBoards.ts` (new): `coreBoards`, the glue over the engine's pools and trios.
- `packages/engine/src/coldstart/boards.ts` (modify): export `boardPool` and `honestBoardView` (the existing private `poolOf` and `honestView`, renamed).
- `packages/engine/src/index.ts` (modify): export the two new modules.
- `apps/meta/scripts/post/markdown.ts` (modify): core-board post text and record.

---

### Task 1: selectCores

**Files:** Create `packages/engine/src/coldstart/cores.ts`; Modify `packages/engine/src/index.ts`; Test `packages/engine/test/coldstart/cores.test.ts`.

**Interfaces (produces):**

```ts
export interface CoreOptions<T> {
  rows: number;          // 5
  cap: number;           // 2 rows per base species as a core member
  flexMax: number;       // 4
  window: number;        // 1.0 points below the row's best trio, regular thirds
  megaWindow: number;    // 2.0, when the third is a Mega
  speciesOf: (t: T) => readonly string[];   // the trio's three species ids
  strengthOf: (t: T) => number;
  keyOf: (t: T) => string;                  // unique per trio
  base: (id: string) => string;             // Shadow and Mega fold to their base species
  isMega: (id: string) => boolean;
}
export interface CoreFlex<T> { third: string; trio: T }
export interface CoreRow<T> { core: [string, string]; flex: CoreFlex<T>[] }   // flex[0].trio is the row's best trio
export function selectCores<T>(items: readonly T[], opts: CoreOptions<T>): CoreRow<T>[]
```

`items` are legal trios, strongest first. Behavior (spec rules 2 to 4, 7):

1. Keep a `shown` set of trio keys, a per-base-species core-use count, and a set of used core pair keys (the two base species sorted, joined with `+`).
2. Walk `items`. Skip a trio already `shown`. Stop when `rows` rows exist.
3. For the trio `t`, consider its three pairs, in ascending order of pair key. For each pair (a pair is valid only if its pair key is unused and each member's base species is used in fewer than `cap` rows): collect flex by scanning `items` in order, taking each not-`shown` trio that contains both pair members, whose third's base species is not already collected, and whose strength is at least `strengthOf(t) - (isMega(third) ? megaWindow : window)`; stop at `flexMax`. (The scan may `break` once strengths fall below `strengthOf(t) - megaWindow`.)
4. Choose the valid pair with the most flex; ties go to the earlier pair key. If no pair is valid, skip `t`.
5. Record the row (`core` in the order the pair members appear in `speciesOf(t)`), add all its flex trio keys to `shown`, increment each core member's base-species count, mark the pair key used.

- [ ] **Step 1: Write the failing tests** in `packages/engine/test/coldstart/cores.test.ts` using plain objects `{ key, species: [a,b,c], strength }`, `base = id => id.replace(/_shadow$|_mega.*$/, '')`, `isMega = id => id.includes('_mega')`. Cases: (a) near-tied thirds group under one core and `flexMax` caps at 4, best first; (b) a third below the window is left out; (c) a Mega third is allowed at 2.0 below while a regular third at 1.5 below is not; (d) cap: a species already a core member in 2 rows cannot start a third core; (e) the same base-species pair never starts two rows; (f) no trio appears twice across the rows' flex lists; (g) `c` and `c_shadow` count as one third (the stronger is kept); (h) a symmetric trio picks the pair with the earliest sorted key, and prefers a pair that has more flex; (i) fewer rows than `rows` when trios run out; (j) the result does not change when equal-strength items are given in a different order among non-tied keys.
- [ ] **Step 2:** run `npx vitest run packages/engine/test/coldstart/cores.test.ts` and confirm FAIL (cannot resolve).
- [ ] **Step 3: Implement** `cores.ts` per the behavior above, with a header comment naming the spec. Add `export * from './coldstart/cores.js';` to `packages/engine/src/index.ts`.
- [ ] **Step 4:** tests pass; `npm run typecheck` and `npm run lint` clean.
- [ ] **Step 5: Commit** `git add packages/engine/src/coldstart/cores.ts packages/engine/src/index.ts packages/engine/test/coldstart/cores.test.ts` with message "Engine: selectCores groups near-tied trios into a core with flex options".

---

### Task 2: coreBoards

**Files:** Modify `packages/engine/src/coldstart/boards.ts` (export the two helpers under new names); Create `packages/engine/src/coldstart/coreBoards.ts`; Modify `packages/engine/src/index.ts`; Test `packages/engine/test/coldstart/coreBoards.test.ts`.

**Interfaces (consumes):** `selectCores` (Task 1); `scoreTrios`, `presentTeam`, `ScoredTrio`; `boardPool`, `honestBoardView`, `BoardRow`, `CupBoardsInput`, `BOARD_POOL`, `MEGA_SCAN`, `SPECIES_CAP`, `BOARD_ROWS`; `weightedTrioOptions`, `DEFAULT_TRIO_OPTIONS`, `TrioIndex`.

**Produces:**

```ts
export const CORE_FLEX_MAX = 4;
export const CORE_WINDOW = 1.0;
export const CORE_MEGA_WINDOW = 2.0;
export interface CoreFlexOut { third: Candidate; team: BoardRow }   // team: the whole trio in presented order, megaId set on the Mega board
export interface CoreRowOut {
  core: [Candidate, Candidate];
  /** 'mega' when the core has no Mega and every flex third is a Mega; 'regular' otherwise. */
  flexKind: 'mega' | 'regular';
  /** The Mega inside the core (species id), else null. */
  megaInCore: string | null;
  /** Best first; flex[0].team is the row's headline team. */
  flex: CoreFlexOut[];
}
export interface CoreBoards {
  top: CoreRowOut[];
  budget: CoreRowOut[];
  mega: CoreRowOut[] | null;
  resimulated: { top: string[]; budget: string[]; mega: string[] };
}
export function coreBoards(input: CupBoardsInput): CoreBoards
```

Behavior: same pools and honest views as `cupBoards` (Top: Elite TM allowed; Budget: `allowEliteTm=false`; Mega, only when `input.mega`: the Top pool's non-Megas plus every Mega from a `MEGA_SCAN` pool, and only trios with exactly one Mega). For each board run `scoreTrios`, then `selectCores` with `rows: BOARD_ROWS`, `cap: SPECIES_CAP`, `flexMax: CORE_FLEX_MAX`, `window: CORE_WINDOW`, `megaWindow: CORE_MEGA_WINDOW`, `speciesOf` = the trio's species ids, `base` = `index.baseOf(index.teamSpeciesOf(id))`, `isMega` = `index.teamSpeciesOf(id) !== id`. On Top and Budget boards the Mega window never applies (no Megas are legal there unless the league allows them; if the Top pool holds Mega candidates use the same rules, `flexKind` stays 'regular'). Each flex `team` is `presentTeam(trio, view, weightedTrioOptions(...))` with `members` in presented order; `core` candidates are the two members of the headline trio that are the core species, in presented order.

- [ ] **Step 1:** in `boards.ts` rename `poolOf` to `boardPool` and `honestView` to `honestBoardView` and `export` both (update the internal callers; no behavior change; existing `boards.test.ts` must still pass).
- [ ] **Step 2: Write failing tests** `coreBoards.test.ts` (static-data block `describe.skipIf(!haveStaticData())`, Great League data, losing-sim like `boards.test.ts`; mirror its setup): invariants for `top` and `budget`: 5 rows; row headline strengths non-increasing; `flex` sorted strongest first and `flex.length` between 1 and 4; every flex team contains both core species; flex thirds are distinct by base species; no team (sorted species key) appears twice across all rows; each base species is a core member in at most 2 rows; no two rows share the same base-species core pair; budget candidates all have `moveset.eliteTmCount === 0`; `mega` is null when `mega: false`. Plus a Mega invariants test that runs over `boards.mega ?? []` (vacuous on the stale local data; say so in a comment): every headline and flex team has exactly one Mega; `flexKind === 'regular'` iff the core has a Mega (then `megaInCore` is that Mega); `flexKind === 'mega'` implies every flex third is a Mega.
- [ ] **Step 3:** run and confirm FAIL. **Step 4: Implement** `coreBoards.ts`; export it from `index.ts`. **Step 5:** tests, typecheck, lint pass (existing `boards.test.ts` too). **Step 6: Commit** `git add packages/engine/src/coldstart/boards.ts packages/engine/src/coldstart/coreBoards.ts packages/engine/src/index.ts packages/engine/test/coldstart/coreBoards.test.ts` "Engine: coreBoards drafts core + flex rows for Top, Budget and Mega boards".

---

### Task 3: Post text for core boards

**Files:** Modify `apps/meta/scripts/post/markdown.ts`; Test `apps/meta/test/postMarkdown.test.ts` (add cases).

**Interfaces (produces), alongside the existing exports (which must keep working):**

```ts
export interface PostFlex { name: string; team: PostTeam }          // name: the third Pokemon's full species name, e.g. "Kingdra (Shadow)"
export interface PostCoreRow { coreNames: [string, string]; flexKind: 'mega' | 'regular'; flex: PostFlex[] }
export interface PostCoreBoard { id: BoardId; heading: string; rows: PostCoreRow[] }
export interface PostCoreRun {
  leagueId: string; cupTitle: string; day: Date; mixLine: string;
  pvpoke: { commit: string; date: string };
  weights: 'prior' | 'blend'; battles: number; events: number;
  resimulated: Record<string, string[]>;
  boards: PostCoreBoard[];
}
export function postMarkdownCores(run: PostCoreRun): string
export function teamsJsonCores(run: PostCoreRun): string
```

`postMarkdownCores`: first line `Title: <cup>: top cores, budget cores and the best Mega picks (pick3 sims)` (omit the Mega clause when there is no `mega` board); an intro saying each row is a core (keep both) plus one flex pick, ranked by projected strength, and that every link opens the full analysis; per board a `**<heading>**` and for each row `N. <core A> + <core B> - add one:` followed by indented sub-bullets `   - <flex name> (<strength to one decimal>) - <link>` (flex kind 'mega' says `add a Mega:` instead of `add one:`); a closing line explaining the number is a projection, not a measured win rate, with `run.mixLine` and the PvPoke date. 7-bit ASCII only (assert in the test). `teamsJsonCores`: JSON with league, cup, day, weights, `battles`, `events`, mix, pvpoke, resimulated, and per board an array of rows `{ core, flexKind, flex: [{ name, strength, coverage, consistency, safety, structure, exposure, species, moves, link }] }`. Reuse `linkOf` for the links.

- [ ] Steps: failing tests (title with and without a Mega board; row and flex lines with links; 'add a Mega:' wording for a mega row; ASCII; teams.json shape and numeric `battles`/`events`); implement; run `npx vitest run apps/meta/test/postMarkdown.test.ts`, typecheck, lint; commit `git add apps/meta/scripts/post/markdown.ts apps/meta/test/postMarkdown.test.ts` "Meta: post text and record for core + flex boards".
