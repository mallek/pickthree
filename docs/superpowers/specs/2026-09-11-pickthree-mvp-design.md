# PickThree MVP design

Date: 2026-09-11
Status: implemented 2026-09-12 (plans 1 to 3); live at pick3.demome.com
Domain: pick3.demome.com (CNAME to GitHub Pages; pickthree.gg was priced at $100 and passed on)
Repo: github.com/mallek/pickthree, public, MIT

## 1. Summary

PickThree is a mobile-first web app that turns PvPoke's Pokemon GO PvP analysis into plain decisions for ordinary players. The player uploads a Poke Genie CSV export of their scanned Pokemon. PickThree combines it with PvPoke's game master, rankings, and battle simulator, and answers:

- What is the best Great League team I can build from what I own?
- In what order do I play it, and what role does each Pokemon have?
- Which moves does each need, and does any move need an Elite TM?
- How many fast moves reach each charged move?
- What does the build cost in Stardust, Candy, and XL Candy?
- What does the team beat, what beats it, and how hard is it to play?
- Is my specimen good enough, or would better IVs materially change results?
- Is there a cheaper alternative that performs nearly as well?
- Which Pokemon in my collection are worth investing in?

Everything runs on the player's device. No accounts, no server, no upload of collection data.

### Non-goals for v1

- Ultra League, Master League, and limited cups (designed for, not built).
- Simulating with the moves a specimen currently has instead of the recommended moveset. V2 setting.
- Pokemon GO account access of any kind.
- Persistent server-side storage, accounts, billing, admin surfaces.
- Pokemon artwork or sprites.
- PWA share target registration (v2 once the app is installable).

## 2. Decisions

| Topic | Decision | Why |
|---|---|---|
| Architecture | TypeScript SPA, all compute on device (option A) | PvPoke's simulator is browser JS; privacy becomes a fact instead of a policy; zero hosting cost |
| Growth path | Engine behind a `ComputeHost` interface; the Web Worker is one host, a fetch-backed host can replace it later (option C) | Relieves the phone if search cost ever demands it, without a rewrite |
| Frontend | Vite + React + TypeScript strict | Small, boring, Travis is comfortable in it |
| Backend | None | No product reason for one in v1 |
| Hosting | GitHub Pages, custom domain pick3.demome.com | Free for a public repo, CI already lives on GitHub |
| Persistence | IndexedDB on device | Reopened tab keeps the collection; nothing leaves the phone |
| PvPoke integration | Vendor nine simulator files verbatim at a pinned commit (GameMaster.js included), shim the jQuery subset and page globals it needs, adapt behind a `BattleSimulator` interface | The battle files are jQuery-free; GameMaster's derived move fields are worth keeping verbatim; a golden test pins fidelity |
| Data refresh | Repo script plus weekly GitHub Action that opens a PR | Refresh is reviewed, never automatic |
| Package manager | npm workspaces, exact pinned versions | House rule |
| Team structures | ABC (balanced) and ABB (line) both searched, labelled, and filterable | Core PvP team-building concept players already use |

Rejected: ASP.NET Core backend (simulator would need a C# port or a Node sidecar; server would hold collections). Hybrid from day one (infra for an unmeasured problem).

## 3. Repo shape

```
pickthree/
  apps/web/            Vite + React, mobile-first, Web Worker, IndexedDB, GitHub Pages
  packages/engine/     pure TS: parsing, normalization, eligibility, math, search, scoring, explanations
  packages/sim-pvpoke/ vendored PvPoke battle files + GameMaster shim + BattleSimulator adapter
  packages/data/       build pipeline (Node) + hand-maintained tables + pvpoke.lock.json
  fixtures/            synthetic Poke Genie CSVs
  docs/                this spec, plans, ADRs, setup
  .github/workflows/   ci.yml (test, build, deploy Pages), data-refresh.yml (weekly PR)
```

Tooling: TypeScript strict, vitest, eslint with `curly: all`, prettier. Node 24 via fnm.

Dependency direction: `apps/web -> engine -> (BattleSimulator interface) <- sim-pvpoke`. `engine` never imports `sim-pvpoke`; the web app wires the adapter in. `data` is build-time only and emits static JSON that `apps/web` serves from `public/data/`.

## 4. Import and collection model

### 4.1 Getting the file in

Poke Genie runs on the phone and exports via the share sheet. The import screen is designed for iPhone Safari first.

- `<input type="file" accept=".csv,text/csv">` opens the iOS Files picker, where "Save to Files" from Poke Genie lands. Android behaves the same.
- Desktop adds drag-and-drop onto the same surface.
- "Paste CSV text" fallback for the case where the share sheet only offers copy.
- Later: PWA share target so Poke Genie's share sheet lists PickThree directly. Not v1.

### 4.2 Parsing and schema tolerance

PapaParse, pinned, running in the worker.

Header fingerprinting before any row work:

- Required columns: Name, Form, Pokemon Number, CP, HP, Atk IV, Def IV, Sta IV, Level Min, Level Max, Shadow/Purified, Scan Date. Missing any of these is an import error with a readable message naming the column.
- Optional columns: Quick Move, Charge Move, Charge Move 2, Lucky, Favorite, Catch Date, Original Scan Date, Dust, Poke Genie's per-league rank and cost columns, Marked for PvP use. Missing ones degrade with a warning.
- Unknown columns are ignored and listed in the report.

Row problems are collected, never thrown. The import report lists counts and, per problem type, the affected rows and what to do.

Facts from the reference export (607 rows, 50 columns, UTF-8, no BOM, RFC 4180 quoting):

- 383 rows have no fast move and 406 no charged move. Moves are mostly unknown.
- 77 rows have blank IVs with CP and HP present.
- 3 rows have a level range (Level Min != Level Max).
- 9 exact-duplicate scan groups.
- Forms seen: Mega, Mega Y, Galar, Alola, Hisui, Paldea, Armored, Origin, Altered, Incarnate, Therian, Small, Male, Hero, 10%, Roaming, Normal, and blank.
- Shadow/Purified: 0 normal, 1 shadow, 2 purified. Verified 2026-09-12 with a purified Seel (Shadow/Purified = 2, holds Return).
- Per-league Sha/Pur columns: 1 = keep shadow, 2 = purify for this league's build (inferred).
- Gender is a Unicode symbol. Names are English and can carry accents (Flabebe).
- Scan Date is `YYYY-MM-DD HH:mm`, Catch Date is `M/D/YYYY`.

### 4.3 Species and form mapping

`slug(Name) + formSuffix(Form)` maps 222 of 226 distinct name-form pairs in the reference export straight to PvPoke `speciesId`. The rest go through an override table in `packages/engine/src/mapping/overrides.ts`:

- Thundurus Normal -> `thundurus_incarnate`
- Gimmighoul Roaming -> unsupported (PvPoke has no roaming form); reported, not silently mapped
- Tatsugiri (blank form) -> `tatsugiri_curly` (PvPoke has curly, droopy, stretchy; identical stats and moves, curly is the default)
- Morpeko (blank form) -> `morpeko_full_belly` (hangry is unreleased in PvPoke)

Form suffix table: blank and Normal -> none, Mega -> `_mega`, Mega Y -> `_mega_y`, Galar -> `_galarian`, Alola -> `_alolan`, Hisui -> `_hisuian`, Paldea -> `_paldean`, Armored -> `_armored`, Origin -> `_origin`, Altered -> `_altered`, Incarnate -> `_incarnate`, Therian -> `_therian`, Small -> `_small`, Male -> `_male`, Hero -> `_hero`, 10% -> `_10`.

Megas map to the base species for league play (Great League excludes megas in the open format). Shadow flag selects the `_shadow` variant when PvPoke has one.

Unmapped rows are reported with the raw name and form so the override table can grow from real exports.

### 4.4 Specimen model

```ts
interface Specimen {
  id: string;              // stable hash of speciesId, shadow, ivs, level (blank-IV rows add cp and hp)
  speciesId: string;       // PvPoke id of the scanned stage, e.g. "rookidee"
  familyId: string;        // from game master
  ivs: { atk: number; def: number; sta: number } | null;
  level: { min: number; max: number };
  cp: number;
  hp: number;
  shadow: boolean;
  purified: boolean;
  lucky: boolean;
  currentMoves: { fast?: string; charged: string[] };  // PvPoke move ids when scanned
  scannedAt: string;       // ISO
  raw: Record<string, string>;  // original row for the details drawer
}
```

Dedupe: rows with the same `id` collapse to the newest `scannedAt`. Scan dates are not part of the identity, so the same Pokemon scanned twice on different days merges. Specimens with `ivs: null` are kept in the collection with verdict "Needs rescan" and excluded from all recommendation stages.

### 4.5 Staleness and re-import

A scan history cannot know what was transferred or evolved. Re-import replaces the collection. Each specimen shows its scan age; the collection header shows the export's newest scan date. Evolution is handled by evaluating every stage of each specimen's family, so a Rookidee scan and a Corviknight scan of the same Pokemon produce the same build.

### 4.6 Persistence and privacy

- Normalized specimens, the import report, and user settings (exclusions, filters) live in IndexedDB.
- Raw CSV text is not stored.
- "Forget my collection" wipes the store.
- The deployed page ships a CSP of `default-src 'self'` with no remote origins. After the static assets load, the app makes no network requests. This makes the privacy claim mechanically enforced.
- Nothing is stored remotely. There is no remote.

## 5. Data layer

Three kinds of data in three directories, so the boundary is visible in the tree.

### 5.1 Raw game data (from PvPoke's game master, MIT)

`packages/data/build/` produces:

- `pokemon.json`: species, forms, base stats, types, fast and charged move pools, elite and legacy move flags, family links (parent, evolutions), shadow availability, Great League ineligibility, third-move cost, level floor where PvPoke has one.
- `moves.json`: type, power, energy, energy gain, turns, buffs.
- `cpm.json`: CP multiplier per half-level, levels 1 to 51.

Normalized into our own TS types (`packages/engine/src/gamedata/types.ts`). A PvPoke key rename breaks the pipeline, never the app.

### 5.2 PvPoke analysis (PvPoke's opinion, not truth)

- `rankings/great/overall.json` and the four role scenarios `leads`, `switches`, `closers`, `chargers` from `rankings/all/*/rankings-1500.json`.
- `meta/great.json`: PvPoke's Great League meta group (48 entries at the pinned commit) with movesets.
- `matrix/great.json`: our precomputed matchup matrix. Every ranked Great League Pokemon versus each meta entry, default IVs and PvPoke's recommended moveset, in three shield scenarios (0-0, 1-1, 2-2). Built by running the vendored sim in Node. Order of 1146 x 48 x 3 sims. Stored as Int16 ratings in a flat array with an index, gzipped under 1 MB.

The matrix is what lets a phone prune 500 scans to 40 candidates without simulating.

### 5.3 Our own tables (hand-maintained)

`packages/data/src/tables/`, each a typed TS file with a source comment and a unit test:

- `powerup.ts`: Stardust and Candy per half-level, level 1 to 50; XL Candy replaces Candy from 40 to 50.
- `evolution.ts`: candy cost per family stage, keyed by PvPoke family id and target species id. Seeded from the game master where it carries evolution data, hand-filled otherwise.
- `secondMove.ts`: mirrored from PvPoke `thirdMoveCost` with the same tiers.

### 5.4 Pinning and manifest

- `packages/data/pvpoke.lock.json`: `{ "commit": "<sha>", "date": "<iso>" }`. Initial value: `00e56418f479c344051ae77da5d5c774d22094af`, 2026-09-10.
- `npm run data:build` clones that exact commit into gitignored `packages/data/.pvpoke/` and builds everything into `apps/web/public/data/`.
- `data-manifest.json` ships with the app: PvPoke commit, PvPoke's game master timestamp, our build time, meta group size, matrix dimensions. The settings sheet renders it.

### 5.5 Refresh

- `npm run data:refresh` bumps the lock to PvPoke HEAD and rebuilds.
- `data-refresh.yml` runs weekly, does the same, and opens a PR with a diff summary: new or removed species, changed moves, ranking movement above a threshold.
- The golden simulator tests run in that PR against the new rankings. A PvPoke simulator change that is not yet vendored shows up as a failing test instead of silently wrong numbers.
- Vendored simulator files are bumped by hand in a separate PR, gated by the same golden test.

### 5.6 Assumptions travel with results

Every recommendation result object carries the shield scenario, IV assumption, meta group name and size, and PvPoke commit that produced it. The UI's "Assumptions and detail" section renders from those fields.

## 6. Recommendation engine

Pure functions in `packages/engine`. Each stage is a module with typed input and output.

### 6.1 Eligibility

For each specimen with IVs, for each evolution stage in its family: compute the highest half-level at or under 1500 CP. Cap is level 50 by default, 40 when "No XL" is set. Drop stages that cannot reach a competitive CP threshold (configurable, default 1400), species on the Great League ineligible list, megas, and any stage where the specimen at its current level would already exceed 1500 CP (Pokemon cannot be powered down).

Output: `Build { specimenId, speciesId (target stage), shadow, level, cp, ivs }`.

### 6.2 Specimen quality

IV rank against all 4096 IV combinations for the target stage at the same cap, by stat product. Poke Genie's `Rank % (G)` and `Rank # (G)` columns are a cross-check in tests. Also the stat-product gap to the rank-1 spread as a percentage. The gap, not the rank percent, drives "is this one good enough".

### 6.3 Candidate pool

Score each build by PvPoke's overall score blended with the four role-scenario scores. Apply user exclusions: excluded specimens, No XL (already applied in 6.1), No Shadows, No Elite TM (drops builds whose recommended moveset needs one), budget cap on Stardust. Keep the best specimen per species-form. Cut to the top N builds, default 40. This is the only stage where rankings act as a filter.

### 6.4 Matchup lookup

Pull each candidate's matrix rows. No simulation.

### 6.5 Trio generation and structure scoring

Enumerate all trios of the candidate pool (C(40,3) = 9880). For each, on matrix data only:

- Coverage: count of meta entries at least one member beats in the 1-1 scenario.
- Exposure: meta entries no member beats.
- Type overlap penalty.
- Role fit: lead scored by the leads scenario, switch by switches, closer by closers. Try all six orderings, keep the best.
- Lead counters: meta entries that beat the lead in the leads scenario.
- ABB score: share of lead counters that both back-line members beat.
- ABC score: coverage breadth with low pairwise overlap.

Every trio gets a structure label: "ABB line" when ABB score clears a threshold (default 0.7), else "Balanced ABC". Two searches run, best balanced and best ABB, and the top 25 finalists are drawn from both so the feed shows a mix.

### 6.6 Finalist simulation

For each finalist, run the vendored simulator in the worker: each member versus each meta entry with the specimen's actual IVs and level and its recommended moveset, in the member's role scenario (lead 1-1, switch 1-1 with switch energy, closer 0-0). Member-versus-member is not simulated; team synergy is coverage, not internal fights.

### 6.7 Scoring

Five factors, each 0 to 100, fixed documented weights:

- Coverage (simulated wins across the meta).
- Consistency (wins that hold across shield scenarios).
- Safety (the switch's worst matchup is survivable; the team has no exposure to a top-10 meta entry).
- Cost (Stardust plus Candy plus XL plus Elite TM count, normalized against the finalist set).
- Accessibility (how far each specimen is from done: already built scores high).

Total maps to a label: Strong, Solid, Situational. Difficulty comes from move complexity and structure: bait-dependent movesets and slow charged moves raise it, ABB lowers it. Labels: Easy, Moderate, Demanding, each with a one-line reason.

### 6.8 Moves

Per build, the top moveset from PvPoke's move usage data for that species, restricted by exclusions. Fast-move count to each charged move is `ceil(chargedEnergy / fastEnergyGain)`, shown per charged move. Per-move TM badge: already has it (from scanned moves), regular TM, Elite TM (move is in the species' elite or legacy list).

### 6.9 Cost

Per build: evolution candy for each stage crossed, power-up Stardust and Candy from current level to target, XL Candy above 40, second-move unlock if the moveset needs two charged moves and the specimen has one, Elite TMs counted separately since they cannot be bought. Lucky halves Stardust. Shadow multiplies Stardust and Candy by 1.2 (purified 0.9).

### 6.10 Explanation

Templates fed by the score breakdown, never free text:

- "Why this team": top two coverage contributors plus the biggest remaining threat.
- Structure sentence. ABB: "Anything that beats your <lead> loses to both your back-line Pokemon, so you win the back line either way." ABC: "Each Pokemon covers a different slice of the meta, so no single opponent breaks the team."
- Alternatives: next-best specimen per slot with the factor that changed ("Cheaper: your Galarian Stunfisk, loses the Azumarill matchup").

### 6.11 Worth investing (single specimen)

Reuses 6.1, 6.2, 6.6, and 6.9 for one specimen: simulate it and its rank-1 twin against the meta, report the win-count difference and the cost. Verdict chips: Great League ready, Worth building, Wait for better IVs, Not eligible, Needs rescan.

### 6.12 Performance budget

Target on a mid-range phone: import and report under 2 seconds for 1000 rows; teams feed under 10 seconds for a 600-scan collection, with progress reported per stage. Measured early with a fixture, not assumed. If the budget fails, the first lever is the finalist count, the second is the hybrid compute host.

## 7. UI

Pending the Claude Design export. Screen inventory and content model are fixed by the prompt sent to Claude Design and recorded here so the implementation plan can proceed in parallel.

Screens: Welcome/Import, Import report, Teams feed, Team detail, Collection, Specimen detail, Filters and settings sheet.

Fixed content rules:

- No Pokemon artwork. Type-colored tokens plus text names. Dual types split the token.
- Plain names before abbreviations. First-use inline explanation for: lead, safe switch, closer, shield, bait, Elite TM, XL Candy, IV rank, line, back line.
- Progressive disclosure: decision first, simulation detail behind an expander.
- Labels over raw numbers on cards (Strong/Solid/Situational, Easy/Moderate/Demanding). Numbers available in detail.
- Team style filter: Any / Balanced / ABB. Structure label on every card.
- League selector shows Ultra and Master disabled.
- Phone frame 390 x 844 is the design target. Layout verified at iPhone 14 and Pixel 7 viewports.
- Light and dark themes from one token set.

Design export received 2026-09-12 and committed under `docs/design/` (Claude Design, Nocturne-derived):

- `PickThree.dc.html`: interactive prototype of all seven screens plus the bottom tab bar (Teams, Collection, Filters), 390 x 844, dark default and light.
- `PickThree Tokens and Components.dc.html`: semantic token set (`--bg`, `--surface`, `--surface2`, `--text`, `--muted`, `--faint`, `--divider`, `--accent`, `--accent-text`, `--accent-tint`, `--accent-tint2`, `--warn`, `--warn-tint`, shadows) for both themes, the 18 type colors, type scale (display 30 to label 11, Inter only), spacing 2 to 24, radii 6/8/12/14/20, elevation.
- `pickthree-data.js`: the sample content the prototype renders; it doubles as copy reference for role explanations, verdict labels, and first-use term explanations.
- Pokemon token rule: single type solid fill; dual type 135 degree hard split (primary top-left) or primary fill with a 3 px ring of the secondary; white initial at 92 percent; never artwork.

Plan 3 turns the token sheet into `apps/web/src/design/tokens.css` and rebuilds the prototype's components in React.

## 8. Testing, fixtures, deploy

### 8.1 Tests by package

- `engine`: CSV parsing on synthetic fixtures (clean, malformed, renamed column, extra columns, level ranges, blank IVs, duplicates). Species and form mapping for every distinct name-form pair in the fixtures. CP and level math against a table of known CP values. IV rank against Poke Genie's columns in the fixtures. Fast-move counts against hand-checked cases. Cost tables against known totals (level 20 to 40 = 225,000 Stardust). Trio scoring on a fixed candidate set with expected ordering and structure labels. Explanation templates snapshot-tested.
- `sim-pvpoke`: golden test replays the top-5 matchups and counters for a sample of ranked Pokemon and asserts the vendored simulator reproduces PvPoke's published ratings exactly at the pinned commit.
- `data`: pipeline runs against the pinned commit in CI and asserts output schema plus spot values.
- `web`: component tests for the import flow and the team card. One Playwright run at iPhone 14 and Pixel 7 viewports that imports a fixture and screenshots each screen as a visual baseline.

### 8.2 Fixtures

`fixtures/make-fixtures.ts` derives synthetic CSVs from a real export at a gitignored path: shuffles names within the same species set, jitters IVs and levels, drops catch dates, keeps the awkward cases (megas, regionals, blank IVs, level ranges, duplicates, Frustration holders). The real export never enters the repo.

### 8.3 Deploy

- `ci.yml`: on push and PR, install, lint, test, build. On push to main, publish `apps/web/dist` to GitHub Pages with `CNAME` = pick3.demome.com.
- DNS at GoDaddy: one CNAME record `pick3` on demome.com pointing at `mallek.github.io`. Writable with the existing DNS-scoped API key.
- HTTPS via GitHub Pages' Let's Encrypt.
- CSP `default-src 'self'` via meta tag (Pages cannot set headers).

### 8.4 Local development

```
fnm use 24
npm install
npm run data:build     # once, clones the pinned PvPoke commit and builds static data
npm run dev            # Vite dev server
npm test
```

Documented in `docs/setup.md`.

## 9. Licensing

- PickThree: MIT, copyright Travis Haley 2026.
- PvPoke: MIT, copyright 2019 pvpoke. `packages/sim-pvpoke/LICENSE-pvpoke` carries the notice; vendored files keep their headers; the about/settings sheet credits PvPoke and links the repo.
- No dependency on pvpoke.com at runtime or build time. All data comes from the pinned git commit.

## 10. Risks and open items

- Poke Genie ranks shadow Pokemon by a method of its own; PickThree's IV rank follows PvPoke's stat-product method for shadows and non-shadows alike, so shadow ranks differ from Poke Genie's. The oracle test compares non-shadows only.
- Hosted as a subdomain of a domain Travis already owns (demome.com). GitHub Pages issues the certificate once the CNAME resolves.
- Simulator fidelity: `ActionLogic.js` may read `gm.rankings` for shield and bait decisions. The shim must provide rankings, and the golden test is the gate.
- Search budget on a phone is estimated, not measured. Section 6.12 states the fallback levers.
- Evolution candy costs are not in PvPoke's game master. Hand-maintained table; wrong values show up as wrong costs, so it gets a test per family in the fixtures.
- PvPoke's `formats.json` at the pinned commit lists no plain Great League entry (season rotation). The open Great League is the `all` cup at 1500 CP; the pipeline hardcodes that rather than reading formats.

## 11. Future (not v1)

- Ultra and Master League: same pipeline with cap 2500 and 10000, new rankings and matrix files, a level cap of 50 assumed.
- Limited cups: PvPoke cup definitions already in the game master.
- "Simulate with my current moves" setting.
- PWA install and share target.
- Hybrid compute host if phone budget fails.
- Import history and diffing between exports.
