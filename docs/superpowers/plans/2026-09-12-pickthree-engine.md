# PickThree Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure TypeScript engine that turns a Poke Genie CSV plus the static data from plan 1 into ranked Great League team recommendations, per-specimen verdicts, costs, movesets and explanations, with no DOM dependency and full test coverage on fixtures.

**Architecture:** `packages/engine` gains one module per pipeline stage (spec section 6). Every stage is a pure function over typed inputs; the only side-effecting dependency is a `BattleSimulator` passed in. A top-level `recommend()` orchestrates stages with a progress callback. A Node test host wires `PvPokeSimulator` from plan 1 so the whole pipeline runs end to end on a synthetic fixture.

**Tech Stack:** TypeScript 5.9.3, vitest 4.1.11, papaparse 5.7.0 (+ @types/papaparse 5.5.2). No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-11-pickthree-mvp-design.md` sections 4, 6

## Global Constraints

- Same as plan 1: exact pins, braces everywhere, no em dashes, explicit `git add`, never a real export in the repo.
- `packages/engine` never imports `@pickthree/sim-pvpoke` in `src/`. Tests may.
- Every result object carries its assumptions: shield scenario, meta name and size, IV assumption, PvPoke commit.
- Numbers shown to the player are produced here, not in the UI. The UI formats, it never computes.
- Poke Genie column names are matched exactly (case-sensitive) after trimming.

---

## File structure

```
packages/engine/
  package.json                       add papaparse deps
  src/
    csv/schema.ts                    column lists, fingerprint(header) -> HeaderReport
    csv/parse.ts                     parsePokeGenieCsv(text) -> ParsedCsv (rows + problems)
    mapping/forms.ts                 FORM_SUFFIX table
    mapping/overrides.ts             name+form -> speciesId overrides and unsupported list
    mapping/mapSpecies.ts            mapSpecies(name, form, shadow, index) -> MapResult
    gamedata/index.ts                GameDataIndex: byId, moveById, familyStages(id), typeChart
    gamedata/typeChart.ts            18x18 effectiveness (for coverage explanations)
    collection/specimen.ts           toSpecimens(parsed, index) -> { specimens, report }
    math/cp.ts                       cpFor, statsFor, maxLevelUnderCap
    math/ivrank.ts                   ivRank(base, ivs, cap, levelCap)
    builds/eligibility.ts            buildsFor(specimen, index, options) -> Build[]
    builds/moves.ts                  recommendMoveset(...) -> Moveset (tm badges, counts)
    builds/cost.ts                   buildCost(...) -> Cost
    tables/evolution.ts              evolutionCandy(from, to, index) heuristic + overrides
    search/matrixView.ts             MatrixView over MatchupMatrix
    search/candidates.ts             candidatePool(builds, rankings, options) -> Candidate[]
    search/trios.ts                  generateTrios(candidates, view, meta, options) -> TrioDraft[]
    search/finalists.ts              simulateFinalists(drafts, sim, meta, index) -> TeamSim[]
    score/score.ts                   scoreTeam(sim, ...) -> TeamScore (factors, fit, difficulty)
    explain/explain.ts               explainTeam(...) -> Explanation; alternatives
    verdicts/worth.ts                specimenVerdict(...) -> Verdict + perfect-twin delta
    recommend.ts                     recommend(input, deps, onProgress) -> Recommendation
    host/ComputeHost.ts              ComputeHost interface (worker later)
    index.ts                         exports
  test/
    fixtures.ts                      loadFixtureCsv(), loadStaticData() (from apps/web/public/data)
    csv/parse.test.ts
    mapping/mapSpecies.test.ts
    collection/specimen.test.ts
    math/cp.test.ts, math/ivrank.test.ts
    builds/eligibility.test.ts, builds/moves.test.ts, builds/cost.test.ts
    search/trios.test.ts
    score/score.test.ts
    explain/explain.test.ts
    verdicts/worth.test.ts
    recommend.e2e.test.ts            whole pipeline on the fixture with the real simulator
fixtures/
  make-fixtures.ts                   private/poke_genie_export.csv -> fixtures/*.csv (synthetic)
  pokegenie-sample.csv               ~120 rows, shuffled names within species, jittered IVs
  pokegenie-malformed.csv            truncated row, bad numbers, missing required column variant
  pokegenie-renamed-column.csv       "Quick Move" renamed, extra unknown columns
```

Static data for tests comes from `apps/web/public/data` (built by `npm run data:build`, skipped when absent, required in CI where the build runs first). `test/fixtures.ts` loads it once.

---

### Task 1: Fixtures from the real export

**Files:** `fixtures/make-fixtures.ts`, generated CSVs, root `package.json` script `fixtures:make`.

Reads `private/poke_genie_export.csv`. Keeps the header verbatim. For each row: keep species, form, shadow flag, level, CP-consistent numbers are NOT recomputed (values are jittered by 0 to 2 on IVs, clamped 0..15, and CP is left as-is; the engine recomputes CP from IVs anyway), drop Catch Date, Weight, Height, keep Poke Genie rank columns (they are the cross-check oracle). Sample 120 rows stratified to keep: all rows with forms, all shadows, at least 10 blank-IV rows, the 3 level-range rows, 2 duplicate groups, and the four unmapped species. Write `pokegenie-sample.csv`. Then derive `pokegenie-malformed.csv` (row with 47 fields, a row with `CP=abc`, a row with `Atk IV=17`) and `pokegenie-renamed-column.csv` (rename `Quick Move` to `Fast Move`, append column `Notes`).

Test: fixture files exist, header has 50 columns, sample row count 100..140, no row equals a row in the private file (when private exists).

Commit: `Add synthetic Poke Genie fixtures and the generator`.

---

### Task 2: CSV schema and parser

**Interfaces:**

```ts
export const REQUIRED_COLUMNS = ['Name','Form','Pokemon Number','CP','HP','Atk IV','Def IV','Sta IV','Level Min','Level Max','Shadow/Purified','Scan Date'] as const;
export const OPTIONAL_COLUMNS = ['Index','Quick Move','Charge Move','Charge Move 2','Lucky','Favorite','Catch Date','Original Scan Date','Dust','Gender','Marked for PvP use', ...rank columns] as const;
export interface HeaderReport { ok: boolean; missingRequired: string[]; missingOptional: string[]; unknown: string[]; columnCount: number }
export interface RawScan { line: number; name: string; form: string; dex: number; cp: number; hp: number; ivs: {atk:number;def:number;sta:number} | null; levelMin: number; levelMax: number; shadowCode: 0|1|2; lucky: boolean; fastMove: string|null; chargedMoves: string[]; scanDate: string; originalScanDate: string|null; pokeGenie: { rankPctG: number|null; rankNumG: number|null; dustCostG: number|null; candyCostG: number|null; nameG: string|null } }
export type RowProblem = { line: number; kind: 'field-count'|'bad-number'|'iv-out-of-range'|'missing-name'; detail: string };
export interface ParsedCsv { header: HeaderReport; rows: RawScan[]; problems: RowProblem[]; totalLines: number }
export function parsePokeGenieCsv(text: string): ParsedCsv;   // throws ImportError only when header.ok is false
```

Rules: BOM stripped; blank IV cells -> `ivs: null` (not a problem, a category); IV outside 0..15 -> problem, row dropped; non-numeric CP/HP -> problem, dropped; field-count mismatch -> problem, dropped; level parsed as float, min/max; shadow code parsed to 0/1/2, anything else -> 0 with problem `bad-number`.

Tests: sample parses with 0 problems and expected counts (blank-IV rows counted), malformed yields exactly 3 problems of the expected kinds and drops those rows, renamed-column yields header.ok true with `Quick Move` in missingOptional and `Fast Move`,`Notes` in unknown, missing-required (delete `CP` column in-test) throws `ImportError` naming `CP`.

Commit: `Parse Poke Genie CSV with header fingerprinting and row problem collection`.

---

### Task 3: GameDataIndex and species mapping

**Interfaces:**

```ts
export class GameDataIndex {
  constructor(species: Species[], moves: Move[]);
  species(id: string): Species | undefined;
  move(id: string): Move | undefined;
  /** All stages reachable from id by following evolutionIds, including id. Shadow-aware: for x_shadow returns *_shadow ids where they exist. */
  stagesFrom(id: string): Species[];
  shadowVariant(id: string): Species | undefined;   // 'azumarill' -> azumarill_shadow if present
  baseOf(id: string): string;                         // strips _shadow
}
export type MapResult = { ok: true; speciesId: string } | { ok: false; reason: 'unknown-species' | 'unsupported-form' | 'no-shadow-variant'; tried: string };
export function mapSpecies(name: string, form: string, shadow: boolean, index: GameDataIndex): MapResult;
```

`slug(name)`: lowercase, strip diacritics, non-alphanumerics to `_`, trim `_`. Form suffix table from spec 4.3 plus `Mega X -> _mega_x`, `Mega Y -> _mega_y`. Mega forms map to the base species (megas are ineligible in open GL; the base is what the player owns). Overrides: `thundurus|Normal -> thundurus_incarnate`, `tatsugiri|* -> tatsugiri_curly`, `morpeko|* -> morpeko_full_belly`, `gimmighoul|Roaming -> unsupported-form`. Shadow: if `<id>_shadow` exists use it, else `no-shadow-variant` (fall back handled by caller: keep non-shadow with a flag? No: report it; a shadow of a species PvPoke has no shadow entry for is data drift worth surfacing).

Tests: every distinct name/form pair in the sample fixture maps except the known unsupported one; specific cases: `Sableye|Mega -> sableye`, `Stunfisk|Galar -> stunfisk_galarian`, `Giratina|Origin -> giratina_origin`, `Zygarde|10% -> zygarde_10`, `Flabébé -> flabebe`, `Rookidee shadow -> rookidee_shadow`, `stagesFrom('rookidee')` includes corviknight, `stagesFrom('marill')` includes azumarill.

Commit: `Add GameDataIndex and Poke Genie name/form to PvPoke species mapping`.

---

### Task 4: Specimens and the import report

**Interfaces:**

```ts
export interface Specimen { id: string; speciesId: string; familyId: string|null; ivs: {atk;def;sta}|null; level: {min:number;max:number}; cp: number; hp: number; shadow: boolean; purified: boolean; lucky: boolean; currentMoves: { fast: string|null; charged: string[] }; scannedAt: string; raw: RawScan }
export interface ImportReport { scansRead: number; recognized: number; duplicatesMerged: number; missingIvs: { count: number; names: string[] }; unrecognized: { name: string; form: string; reason: string }[]; rowProblems: RowProblem[]; header: HeaderReport; newestScan: string|null }
export function toSpecimens(parsed: ParsedCsv, index: GameDataIndex): { specimens: Specimen[]; report: ImportReport }
```

Move names in the CSV ("Ice Beam", "Frustration") map to PvPoke move ids by normalized name (`ICE_BEAM`); unknown move names are kept as null with no problem raised (moves are advisory). Specimen id = sha-1-ish stable hash (use a small FNV-1a hex, no crypto dep) of `speciesId|shadow|ivs|levelMax|originalScanDate??scanDate`. Duplicates: same id -> keep the newest `scannedAt`. Blank-IV specimens are kept (verdict later says "Needs rescan") and counted in `missingIvs`.

Tests on the sample: counts add up (`recognized + unrecognized rows + problems == scansRead`), duplicates merged equals the planted count, missing IVs equals planted count, a Frustration holder has `currentMoves.charged` containing `FRUSTRATION`.

Commit: `Normalize scans into specimens with dedupe and an import report`.

---

### Task 5: CP math and IV rank

```ts
export function cpFor(base: BaseStats, ivs: IVs, level: number): number;           // floor(max(10, (atk)*sqrt(def)*sqrt(hp)*cpm^2/10))
export function statsFor(base, ivs, level): { atk: number; def: number; hp: number }; // hp floored, min 10
export function maxLevelUnderCap(base, ivs, cpCap: number, levelCap: number, levelFloor = 1): number | null; // highest half-level with cp <= cap, null if even level 1 exceeds
export interface IvRankResult { rank: number; total: 4096; percentile: number; product: number; bestProduct: number; gapPct: number; level: number; cp: number }
export function ivRank(base, ivs, cpCap, levelCap): IvRankResult;  // stat product atk*def*floor(hp) at maxLevelUnderCap; ties share rank
```

Tests: azumarill 4/15/13 at level 43 -> cp 1496 to 1500 range and equals the PvPoke default (`cpFor` matches `Pokemon.calculateCP` for three species, cross-checked via the sim runtime in the test); `maxLevelUnderCap(medicham 15/15/15)` is 41 or higher region; IV rank for the fixture rows with Poke Genie `Rank # (G)` present agrees within a tolerance (assert >= 90% of rows within 5 ranks; print the rest). If Poke Genie assumes level 51, the comparison reveals it; record the finding in the test comment and choose `levelCap` accordingly.

Commit: `Add CP math and IV rank against all 4096 combinations`.

---

### Task 6: Eligibility, movesets, evolution candy, cost

```ts
export interface BuildOptions { cpCap: number; levelCap: 40 | 50; minCp: number /* default 1400 */; allowShadow: boolean; allowEliteTm: boolean; budgetStardust: number | null }
export interface Build { specimenId: string; speciesId: string; shadow: boolean; stage: number; level: number; cp: number; ivs: IVs; ivRank: IvRankResult }
export function buildsFor(specimen: Specimen, index: GameDataIndex, opts: BuildOptions): Build[];  // one per reachable stage that fits; skips greatLeagueIneligible, megas, unreleased, and stages whose CP at specimen.level.max already exceeds cpCap
export interface MoveChoice { moveId: string; name: string; type: PokemonType; tm: 'have' | 'tm' | 'elite'; countFromFast?: number; energy?: number }
export interface Moveset { fast: MoveChoice; charged: MoveChoice[]; source: 'rankings' | 'fallback' }
export function recommendMoveset(speciesId: string, rankings: Map<string, RankingEntry>, species: Species, current: { fast: string|null; charged: string[] }, opts: { allowEliteTm: boolean }, index: GameDataIndex): Moveset;
export function evolutionCandy(fromId: string, toId: string, index: GameDataIndex): { candy: number; estimated: boolean };
export interface Cost { stardust: number; candy: number; xlCandy: number; eliteTm: number; evolutionCandy: number; secondMove: boolean; estimated: boolean }
export function buildCost(build: Build, specimen: Specimen, moveset: Moveset, index: GameDataIndex): Cost;
```

Moveset: top-usage fast, top two charged from the overall ranking entry (fallback: first pool entries); if `allowEliteTm` is false, replace an elite/legacy charged move with the next non-elite by usage. `tm` is `have` when the specimen's scanned moves include it, `elite` when in species elite/legacy list (RETURN/FRUSTRATION count as legacy), else `tm`. `countFromFast = ceil(charged.energy / fast.energyGain)`.

Evolution candy heuristic: explicit overrides map (`magikarp->gyarados 400`, `wailmer->wailord 400`, `swablu->altaria 400`, `noibat->noivern 400`, `meltan->melmetal 400`, `feebas->milotic 100`, `caterpie 12`, `weedle 12`, `pidgey 12`, `rattata 25`, `rookidee->corvisquire 50`, `corvisquire->corviknight 100`, ...); otherwise by family length: two-stage family -> 50, three-stage -> 25 then 100; `estimated: true` when not in overrides. Costs: power-up from `specimen.level.max` to `build.level`, mods from shadow/purified/lucky, second move when moveset has two charged and specimen has fewer than two scanned charged moves (unknown -> assume needs unlock), elite TM count from `tm === 'elite'`.

Tests: rookidee level 1 specimen yields corvisquire and corviknight builds (not rookidee if min CP not reached), snorlax cp 2445 level 27.5 yields none, medicham 15/15/13 level 49 yields one build at level >= 49; moveset for altaria without elite -> no MOONBLAST when disallowed; costs: azumarill level 40 rank build to 43 equals `costToLevel(40,43)`; evolution candy overrides and heuristic.

Commit: `Add eligibility, recommended movesets, evolution candy and build costs`.

---

### Task 7: Candidate pool and matrix view

```ts
export interface Candidate { build: Build; moveset: Moveset; cost: Cost; score: number; roleScores: Record<'leads'|'switches'|'closers'|'chargers', number>; matrixRow: number | null }
export function candidatePool(builds: (Build & { specimen: Specimen })[], rankings: Rankings, matrix: MatchupMatrix, index: GameDataIndex, opts: BuildOptions & { poolSize: number }): Candidate[];
export class MatrixView { constructor(m: MatchupMatrix); rowOf(speciesId): number|null; rating(row, opponentIdx, scenarioIdx): number; wins(row, scenarioIdx): boolean[]; opponentIndex(id): number; readonly opponents: string[] }
```

Score: `0.5 * overall.score + 0.5 * mean(role scores)`; filters applied; best specimen per speciesId (highest ivRank product, ties by lower cost); species missing from the matrix are dropped with a note. Pool cut to `poolSize` (default 40).

Tests: on the sample fixture with the real matrix, pool has <= 40 entries, all distinct species, every entry has a matrix row, no shadows when `allowShadow=false`.

Commit: `Build the candidate pool from rankings and the matchup matrix`.

---

### Task 8: Trio generation with structure scoring

```ts
export interface TrioDraft { slots: [Candidate, Candidate, Candidate]; roles: ['lead','switch','closer']; coverage: number; exposure: string[]; leadCounters: string[]; abbScore: number; abcScore: number; structure: 'ABB' | 'ABC'; roleFit: number; draftScore: number }
export function generateTrios(pool: Candidate[], view: MatrixView, opts: { finalists: number; abbThreshold: number /* 0.7 */; styles: 'any'|'balanced'|'abb' }): TrioDraft[];
```

Enumerate C(n,3), for each try 6 orderings; per ordering: lead counters = opponents with lead rating < 500 in scenario 1-1; abbScore = share of counters both back-liners beat; coverage = opponents beaten by any member; exposure = opponents no member beats that are in the top 15 of the meta list; roleFit = mean of the role score each slot's candidate has for its role; type overlap penalty when two members share a type. draftScore = 0.45 coverage/opp + 0.2 roleFit/100 + 0.2 max(abbScore, abcBreadth) + 0.15 (1 - exposure/15). Keep top `finalists` (default 25) mixed: at least 5 ABB if any exist.

Tests: on a hand-built 6-candidate pool with a tiny fake matrix, expected structure labels and ordering; on the fixture pool, output count and no duplicate species inside a trio.

Commit: `Generate and score candidate trios with ABB and ABC structure detection`.

---

### Task 9: Finalist simulation, scoring, difficulty

```ts
export interface SlotSim { candidate: Candidate; role: 'lead'|'switch'|'closer'; results: { opponent: string; rating: number; win: boolean }[]; wins: number }
export interface TeamSim { draft: TrioDraft; slots: SlotSim[]; shieldScenario: string }
export function simulateFinalists(drafts: TrioDraft[], sim: BattleSimulator, meta: MetaEntry[], index: GameDataIndex, onProgress?): TeamSim[];   // lead 1-1, switch 1-1 with 4 turns energy (PvPoke switches scenario), closer 0-0; specimen actual IVs and level
export interface TeamScore { factors: { coverage: number; consistency: number; safety: number; cost: number; accessibility: number }; total: number; fit: 'Strong'|'Solid'|'Situational'; difficulty: 'Easy'|'Moderate'|'Demanding'; difficultyWhy: string }
export function scoreTeam(t: TeamSim, all: TeamSim[], view: MatrixView): TeamScore;
```

Weights: coverage .35, consistency .2, safety .2, cost .15, accessibility .1. Consistency = share of simulated wins that also hold in the 0-0 and 2-2 matrix cells for that species. Safety = 100 - (switch's worst rating below 300 count * 20) - (exposure * 10), floored at 0. Cost normalized against the min and max stardust-equivalent among finalists (stardust + candy*100 + xl*1000 + eliteTm*50000). Accessibility = mean over slots of (1 - powerUpSteps / 98). Fit: total >= 70 Strong, >= 55 Solid, else Situational. Difficulty: ABB -> Easy unless a bait-dependent move (charged energy <= 40 alongside one >= 55) exists on the switch -> Moderate; ABC -> Moderate, Demanding when two slots are bait-dependent or any slot needs XL and is below level 30.

Tests: fake TeamSim inputs produce expected labels; fixture e2e checks totals in 0..100 and label derivation.

Commit: `Simulate finalists with real IVs and score teams on five factors`.

---

### Task 10: Explanations, alternatives, verdicts

```ts
export interface Explanation { why: string; structureLine: string; keyWins: { opponent: string; line: string }[]; keyThreats: { opponent: string; line: string }[]; roleWhy: Record<'lead'|'switch'|'closer', string>; alternatives: { slot: 0|1|2; candidate: Candidate; line: string }[] }
export function explainTeam(t: TeamSim, score: TeamScore, pool: Candidate[], view: MatrixView, index: GameDataIndex): Explanation;
export type VerdictLabel = 'Great League ready' | 'Worth building' | 'Wait for better IVs' | 'Not eligible' | 'Needs rescan';
export interface Verdict { label: VerdictLabel; line: string; bestStage: string | null; ivRank: IvRankResult | null; cost: Cost | null; perfectDelta: number | null }
export function specimenVerdict(s: Specimen, index, rankings, matrix view, sim | null): Verdict;
```

Templates (plain names, no abbreviations): why = `${lead} handles ${topWin1} and ${topWin2}; ${switch} covers what beats it; ${closer} finishes once shields are gone. Biggest risk: ${topThreat}.` Key wins: top 4 opponents by min rating across slots > 500 with the winning slot named. Threats: opponents nobody beats or only one beats narrowly. Alternatives: for each slot, the best other pool candidate for that role not already in the team, with a one-line delta: cheaper/no elite/no shadow/no XL by comparing costs and flags, and the matchup it loses vs the current pick (first meta opponent where rating flips from win to loss). Verdicts: no IVs -> Needs rescan; no builds -> Not eligible; build at level <= specimen level and rank pct <= 25 -> Great League ready; rank pct <= 25 or shadow with pct <= 40 -> Worth building; else Wait for better IVs. perfectDelta = wins of the rank-1 twin minus wins of this specimen across the meta in 1-1 (simulated when a sim is provided).

Tests: deterministic templates on fixed inputs; verdict boundaries.

Commit: `Add explanations, alternatives and per-specimen verdicts`.

---

### Task 11: Orchestrator, ComputeHost, end-to-end test

```ts
export interface RecommendInput { specimens: Specimen[]; options: BuildOptions & { poolSize: number; finalists: number; styles: 'any'|'balanced'|'abb'; excludedSpecimenIds: string[] } }
export interface StaticData { gameData: { species: Species[]; moves: Move[] }; rankings: Record<RankingCategory, RankingEntry[]>; meta: MetaEntry[]; matrix: MatchupMatrix; manifest: DataManifest }
export interface Recommendation { teams: TeamRecommendation[]; assumptions: Assumptions; stats: { specimens: number; eligibleBuilds: number; poolSize: number; triosScored: number; finalists: number; ms: number } }
export interface TeamRecommendation { id: string; slots: SlotRecommendation[]; structure: 'ABB'|'ABC'; score: TeamScore; explanation: Explanation; cost: Cost; hasShadow: boolean; needsXl: boolean; eliteTms: number }
export function recommend(input: RecommendInput, data: StaticData, sim: BattleSimulator, onProgress?: (stage: string, done: number, total: number) => void): Recommendation;
export interface ComputeHost { importCsv(text: string): Promise<{ specimens: Specimen[]; report: ImportReport }>; recommend(input: RecommendInput): Promise<Recommendation>; verdicts(specimenIds?: string[]): Promise<Record<string, Verdict>>; }
```

`recommend.e2e.test.ts`: loads the sample fixture and static data, wires `PvPokeSimulator`, runs `recommend` with defaults, asserts: at least 3 teams, every team has 3 distinct species, costs are non-negative, each explanation has non-empty why and 1+ key win, `assumptions.pvpokeCommit` equals the lock, runtime under 15 s on this machine (logged). Also runs verdicts for all specimens and asserts the label distribution contains every label present in the fixture design (rescan, not eligible, ready).

Commit: `Add recommend() orchestrator, ComputeHost interface and end-to-end pipeline test`.

---

## Self-review

Spec 4.2 to 4.5 map to Tasks 2 to 4; 6.1 to 6.12 map to Tasks 5 to 11 (6.12 performance measured in the e2e test). Persistence (4.6) and the worker host are plan 3. Types named here are the ones plan 3 consumes: `Specimen`, `ImportReport`, `Recommendation`, `TeamRecommendation`, `Verdict`, `ComputeHost`.
