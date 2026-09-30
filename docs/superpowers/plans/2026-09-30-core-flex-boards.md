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

---

### Task 4 (added after real-data runs): covered core pairs and same-species guard

Done in commits a93f1fe and 7e1011e (`cores.ts`): a trio holding an earlier core's base-species pair cannot start a later row or be its flex; a core is two different base species; a row with no flex is skipped. Spec rules 1 and 4 amended.

### Task 5: the cap counts the best flex

Done in a following commit (`cores.ts`): a base species may appear in at most `cap` rows as a core member or as the row's best flex (headline third). Non-headline flex stays free. Spec rule 4 amended.

---

### Task 6: core-board template and fill

**Files:** Create `docs/design/infographic/core-flex/` (copy of the design agent's exports, see below); Create `apps/meta/scripts/post/template-cores.html` (derived from `pick3-mega-core-flex.html`, the superset design); Create `apps/meta/scripts/post/assets/` (reuse the existing mascot PNGs); Create `apps/meta/scripts/post/fillCores.ts`; Test `apps/meta/test/postFillCores.test.ts`.

**Source design (read first):** `C:\Users\travi\AppData\Local\Temp\claude\D--Skunkworks-pickthree\0bfcfefb-482b-4245-a49b-e6ba6220fb85\scratchpad\megaflex\pick3-mega-core-flex.html` and its README `pick3-mega-core-flex-README.txt`; the Top/Budget version is `...\scratchpad\coreflex\pick3-core-flex.html` + `README.txt`. The Mega file is a superset (`.core-board` base plus `.mega-core-board` overrides, `.mega-in-flex` / `.mega-in-core` rows, `.mega-core`, `.mega-marker`, `.mega-choice`, `.mega-tag-marker`, `.best-flex`, `.flex-choice` with `.flex-strength` in the tile label). Use the `mega-core-board` class for ALL three boards; Top and Budget rows simply have no Mega markup and no row-type class.

**Brand logo (Travis, 2026-09-30).** The design HTML draws an approximate mark (three circles with a "3") plus the text "pick3.gg" in the header `.brand` and a large text "pick3.gg" in the footer `.footer-url`. Replace both with the real lockup, `packages/ui/brand/lockup.svg` (the dark-background version, text fill #E9E9ED; do NOT use lockup-light.svg), inlined into `template-cores.html` as an `<svg>` with its `aria-label="pick3"` kept: header at about 34px tall in place of the mark + wordmark (keep the small `FREE PVP TEAM BUILDER` note text), footer at about 40px tall in place of the big URL text. The lockup reads "pick3" with no ".gg", so keep the URL visible as small text: footer caption `pick3.gg - Find your three.` Small text elsewhere stays text. Remove the now-unused `.mark` / `.wordmark` / `.footer-url` CSS only if nothing else uses it. The logo SVG is the source of truth: do not redraw it.

**One board per document.** The design HTML holds exactly one `<section class="board core-board mega-core-board">`. `fillCoreBoard(template, board)` returns the whole page for ONE board; the caller fills the same template once per board (different mascot, title, rows).

**Interfaces (produces):**

```ts
export type CoreTagKind = 'mega' | 'region' | 'form' | 'shadow' | 'elite';
export interface CoreTag { kind: CoreTagKind; text: string }
export interface CoreMemberView { name: string; sprite: string; type: string; tags: CoreTag[]; moves: [string, string, ...string[]]; isMega: boolean }
export interface FlexView { name: string; sprite: string; type: string; tags: CoreTag[]; strength: number; isMega: boolean }
export interface CoreRowView {
  core: [CoreMemberView, CoreMemberView];
  flexKind: 'mega' | 'regular';   // 'mega' => label PICK A MEGA and row class mega-in-flex; 'regular' with a core Mega => CHOOSE 1 OF N and mega-in-core; 'regular' without a Mega => CHOOSE 1 OF N, no row-type class
  flex: FlexView[];               // best first, 1 to 4; flex[0] is the .best-flex tile
  strength: number;               // the headline team, = flex[0] completed-team strength
  caution: string[];              // 0 to 3 names
}
export interface CoreBoardView { id: 'top' | 'budget' | 'mega'; title: string; subtitle: string; readingLine: string; label: string; source: [string, string, string]; mascot: string; rows: CoreRowView[] }
export function fillCoreBoard(template: string, board: CoreBoardView): string
```

Reuse `escapeHtml` and `assertAscii` from `./fill.js`. Rows: `article.team` (+ `winner` on row 1, + the row type class), `--strength:<n.n>%`, aria-label `Core N, best completed team strength X.X`, rank chip `CORE #N`, core block (two members, each with name, exact tags, full moves; `.shadow-member` for Shadow; `.mega-core` plus the original `.mega-marker` spark for a Mega core member), flex block (label per flexKind, N = flex.length), each tile with name, tags (Mega tag uses `.mega-tag-marker`), strength to one decimal in the tile label, the best tile `.best-flex` (labelled BEST FLEX), Mega tiles `.mega-choice`, Shadow tiles `.shadow-choice`, then score (big number, `--strength`), `.score-context`, and the caution line (`Nothing in the meta beats all three` clear, or `Watch for: <names>` alert). Copy the exact markup patterns for these from the design HTML rows (view one `mega-in-flex` and one `mega-in-core` article) so the CSS applies; do not invent classes. Header: h1 = title (add `long-title` to the section when the title is longer than 18 characters, as the design does), subtitle, reading line, sample label (`board.label`), footer source lines. Replace the design's mascot SVG block with one `<img class="mascot-img" src="...">` slot filled from `board.mascot` (as the earlier template did). No text from the design's sample data may remain (search the output for `PROVISIONAL`, `placeholder`, `Kingdra` when not in the rows, `ILLUSTRATIVE`).

**Tests** (synthetic rows, real template file): five-row board fills; row 1 `.winner`; both row types (mega-in-flex label `PICK A MEGA`, mega-in-core label `CHOOSE 1 OF N` with N = number of flex, a regular row without a Mega has neither row-type class nor Mega markup); flex counts 1 to 4 render only that many tiles; best tile is `.best-flex` and shows its strength; Mega core member gets `.mega-core`; three-tag member keeps all tags in order mega, region, form, shadow, elite; text with `<`, `&`, `"` and `$` is escaped (function replacers, no back-references); fewer than five rows; strengths and `--strength` match; output is 7-bit ASCII (`assertAscii`) and the shipped template is ASCII; no leftover sample text.

Commit: `git add apps/meta/scripts/post/template-cores.html apps/meta/scripts/post/fillCores.ts apps/meta/test/postFillCores.test.ts docs/design/infographic/core-flex` "Meta: core + flex board template and fill".

---

### Task 7: wire `npm run post` to the core boards

**Files:** Modify `apps/meta/scripts/post/post.ts` (and only what it needs).

Replace the team-board path with the core boards: `coreBoards(...)` instead of `cupBoards(...)`; per board build a `CoreBoardView` and fill `template-cores.html` with `fillCoreBoard`; capture each board from its own temp HTML file (same puppeteer flow, same "every failure stops the run and writes nothing" ordering, same ASCII guards on every page and on `post.md`); build `PostCoreRun` from the engine output and write `post.md` with `postMarkdownCores` and `teams.json` with `teamsJsonCores`. Views: member and flex names/tags/sprites via `memberDisplay`, flex `strength` from `flex[i].team.team.strength`, row `strength` from `flex[0]`, caution from `cautionNames(flex[0].team.team.exposure, nameOf)` with `nameOf = cautionName`, moves from each core Candidate's moveset (fast then charged), Elite TM tag from `eliteTmCount`. Subtitles: top `Top Cores + Flex Picks`; budget `Budget Cores - No Elite TM`; mega `Cores + Your Mega`. Reading lines: top and budget `Keep the pair. Choose one flex. That makes your team of three.`; mega `Keep the pair. Choose one flex. Every team gets one Mega.` Source lines: `Strength: pick3 sims vs the <cup> meta`, the existing mix line, `Flex moves and team order: full analysis in the post`. Board headings for post.md: `Top Cores`, `Budget Cores - No Elite TM`, `Cores + Your Mega`. Keep `--prior` and `--date`. The old team-board template/fill/`cupBoards` stay in the repo (unused by the command); say so in a comment.

Verification (controller, not the implementer): typecheck, lint, then real runs on production data: `npm run post -- colormega`, `npm run post -- great`, `npm run post -- mega-great --prior`; the controller views the PNGs.
