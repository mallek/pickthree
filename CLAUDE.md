# PickThree

Mobile-first web app: Poke Genie CSV in, Great League team recommendations out. All compute on device.
Live at https://pick3.gg. Free, no accounts, the collection never leaves the phone.
Design spec: `docs/superpowers/specs/2026-09-11-pickthree-mvp-design.md`. Read it before changing architecture.
Later specs: `docs/superpowers/specs/2026-09-14-adaptive-import-design.md` (CSV column resolution by meaning).

## Layout

```
apps/web/             Vite + React SPA, Web Worker, IndexedDB, PWA, deployed to GitHub Pages
packages/engine/      pure TypeScript recommendation engine, no DOM, most tests live here
packages/sim-pvpoke/  vendored PvPoke battle files (pinned commit) + GameMaster shim + adapter
packages/data/        build pipeline producing static JSON, sprites, and the matchup matrix
workers/counter/      Cloudflare Worker + Durable Object: hit counter and anonymous error log
fixtures/             synthetic Poke Genie CSVs, never a real export
docs/                 spec, plans, ADRs, design export, screenshots, setup
```

Dependency direction: `apps/web -> engine -> BattleSimulator interface <- sim-pvpoke`. `engine` never imports `sim-pvpoke`.
`packages/data` imports both engine and sim-pvpoke (it runs the simulator in Node at build time).

## Stack

- Node 24 (`.node-version`), npm workspaces, TypeScript 5.9 strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (`tsconfig.base.json`).
- Vite 8 + React 19, no router library (hash routes in `apps/web/src/state/store.tsx`), no CSS framework (`app.css` + `design/tokens.css`).
- `idb` for IndexedDB. vite-plugin-pwa in injectManifest mode with a hand-written `src/sw.ts` (Workbox).
- Engine depends only on `papaparse`. Data build depends on `sharp` for sprites.
- Tests: vitest 4, projects for every workspace (`vitest.config.ts` at root). Web tests use jsdom + Testing Library.
- Lint: eslint 10 flat config + typescript-eslint + prettier. `curly: all`, `eqeqeq`, and a `no-restricted-syntax` rule that rejects em dash literals.
- Browser automation: puppeteer-core driving an installed Chrome (`CHROME_PATH`), scripts in `apps/web/scripts/`.
- Counter worker: wrangler, Durable Object with SQLite storage.

## Architecture

### Data build (offline, `npm run data:build`)

1. `packages/data/pvpoke.lock.json` pins a PvPoke commit. `data:fetch` clones it into `packages/data/.pvpoke` (gitignored).
2. `build.ts` writes `apps/web/public/data/` (gitignored, rebuilt in CI, cached by lock hash):
   `pokemon.json`, `moves.json`, `gamemaster.json` (PvPoke's own, the vendored sim reads it), `leagues.json`,
   per-league `rankings/`, `meta/`, `overrides/`, `matrix/`, `sprites/<id>.webp`, `vendor/pvpoke-sim.js`, `data-manifest.json`.
3. The matchup matrix (ADR 002) is every ranked species vs PvPoke's meta group in 3 shield scenarios, integer ratings,
   at PvPoke default IVs. It is what lets a phone prune candidates without simulating on import.
4. Leagues come from PvPoke `formats.json` + `cups/*.json`; `engine/gamedata/league.ts` mirrors PvPoke's cup include/exclude rules.
   Special cups are behind `PICKTHREE_SPECIAL_CUPS=1`. `PICKTHREE_SKIP_SPRITES=1` and `PICKTHREE_SKIP_MATRIX=1` shorten local builds.
5. `data-refresh.yml` runs weekly: bumps the lock, syncs vendor files, runs the golden test, opens a PR.
6. `packages/data/seasons.json` is the hand-kept Go Battle League season list, copied to `public/data/seasons.json`. `data-refresh.yml` opens an issue when the newest season is older than 90 days.

### Simulator (`packages/sim-pvpoke`, ADR 001)

- Nine PvPoke files copied byte for byte into `vendor/`, hash manifest enforced by `vendor-manifest.test.ts`.
- `globals-shim.js` supplies the page globals and jQuery subset GameMaster.js expects. `bundle.ts` concatenates shim + vendor + `exports-tail.js` into one classic script.
- Node loads it in a `vm` context (`node-host.ts`); the browser worker loads it with `importScripts` (`browser.ts`), so the worker is a classic worker (`worker.format: 'iife'` in vite config).
- `PvPokeSimulator` implements the engine's `BattleSimulator` interface. `golden.test.ts` reproduces PvPoke's published ratings (600 battles, 0 misses) and gates every bump.

### Engine (`packages/engine`)

Pure functions over static data + a `BattleSimulator`. Pipeline for a recommendation (`recommend.ts`):

```
csv/        parse -> layout (columns resolved by meaning) -> concepts
mapping/    Poke Genie names/forms -> PvPoke species ids
collection/ Specimen (one scanned Pokemon), manual entry
math/       CP, IV rank
builds/     eligibility (league, XL, shadow, elite TM, budget), moves, cost tables (tables/)
search/     candidatePool from matrix -> generateTrios (ABB and ABC structures) -> simulateFinalists with real IVs
score/      team score; explain/ turns it into sentences
verdicts/   per-specimen "worth building" verdicts; counters/ anti-meta scores; scan/ in-game search strings
yourmeta/   battle log -> season window -> facing profile (blended weights + outsiders) -> recommend, analyze, counters
```

`host/ComputeHost.ts` is the interface the UI talks to (importCsv, recommend, verdicts, counters, scanList, analyze, manual).
Tests implement it in-process; the web app implements it with a worker. Every result carries an `Assumptions` block.

### Web app (`apps/web`)

- `main.tsx` registers the PWA and mounts `App.tsx`. State is one reducer in `state/store.tsx`, exposed through `useAppState` and `useActions`.
- `host/WorkerHost.ts` implements `ComputeHost` over `worker/engine.worker.ts` using the request/response union in `host/protocol.ts` (progress, partial, result, error).
- The worker boots once (game data + gamemaster + PvPoke bundle) and fetches a league bundle (rankings, meta, matrix) lazily per league.
- `storage/db.ts`: IndexedDB `pickthree` v2 with `collection`, `settings` and `battles` (one record per set, indexed by league) stores. Settings fields added later are optional with a documented default for old saves.
- Screens in `screens/`: Welcome (import, scan list), Report, Teams, TeamDetail, Collection, Specimen, Counters, Build, AddPokemon, YourMeta, NewSet, LogBattle, Sheet (settings: filters, league, your meta, appearance, diagnostics).
- `sw.ts`: app shell precached, `/data/*` stale-while-revalidate, `/data/sprites/*` cache-first, Web Share Target POST `/share` parks the CSV in a cache and the app imports it on `/?share=1`. Updates are prompt-mode via `update.ts` and `UpdateToast`.
- `counter.ts` posts one anonymous hit per device; `diag.ts` keeps a local error log and, if the setting is on, posts sanitized reports to the worker.
- CSP is a meta tag in `index.html`. `connect-src` allows only self and the counter worker; fonts come from Google Fonts.

### Deploy and CI

- `pages.yml` builds data + web and publishes to GitHub Pages on push to main. Custom domain pick3.gg (CNAME in `apps/web/public/`).
- `ci.yml`: lint, typecheck, data build (cached), tests, then a `screens` job that drives the built app in Chrome (`web:screens`, `share-test.mjs`, `paste-test.mjs`) and fails on console errors.
- `counter.yml` deploys the worker with wrangler.

## Commands

```
npm install
npm run data:build                 # clone pinned PvPoke commit, build apps/web/public/data
npm -w @pickthree/web run dev      # Vite dev server on :5173
npm test                           # vitest: engine, data, sim-pvpoke, web, counter
npm run lint && npm run typecheck
npm run web:screens                # puppeteer screenshots of every screen (preview server on :4173)
npm run fixtures:make              # regenerate synthetic CSVs; fixtures:derive for alternate layouts
npx tsx packages/engine/scripts/bench.ts   # engine timing on the fixture
```

Design reference: docs/design/ (Claude Design export). Plans: docs/superpowers/plans/. ADRs: docs/adr/.

## Rules

- Braces on all control flow, even single-line bodies. eslint `curly: all` enforces it.
- Exact pinned versions in every package.json. No `^` or `~`.
- No em dashes anywhere: code, docs, commits, UI copy. Use a plain dash or rewrite.
- Plain Pokemon and move names in UI copy. Explain PvP terms on first use.
- Sprites are the only Pokemon artwork (PokeAPI HOME renders, `Settings.sprites` turns them off). Everything else is type-colored tokens and text.
- Never commit a real Poke Genie export. Fixtures are generated by `fixtures/make-fixtures.ts`.
- Never hard-code one CSV format. The importer resolves columns by meaning; new layouts come from field reports and get a fixture.
- Vendored PvPoke files under `packages/sim-pvpoke/vendor/` are verbatim. Do not edit them; fix the shim or adapter instead. Bumps go through `pvpoke.lock.json` and the golden test.
- PvPoke rankings are an input, not truth. Every result carries its assumptions.
- The collection never leaves the device. The outbound calls are the anonymous hit counter, opt-out error reports and opt-out battle records for the community meta, all free of collection data. Keep the CSP meta tag tight; do not widen `connect-src` without a reason.
- The battle log is shared as anonymous records for the community meta (league, season, time, species, result, rank band, random device id) unless the player switches sharing off in Settings; never the collection, IVs, moves, specimen ids or names. Only the live site sends (never automation or a dev server). Export and import are files the player handles. Spec: `docs/superpowers/specs/2026-09-17-community-meta-capture-design.md`.
- Screens with a text input put the input at the top, its results directly under it, the slots those results fill under that, and optional shortcuts last (hidden while searching or picking). Results are a compact token grid in a fixed-height box that scrolls on its own. The phone keyboard covers everything below the input.
- Stage explicit paths when committing. Never `git add -A`.
