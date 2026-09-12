# PickThree Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the mobile-first web app at pick3.demome.com: import a Poke Genie CSV on a phone, run the engine in a Web Worker with the vendored PvPoke simulator, persist the collection in IndexedDB, and render the seven screens from the Claude Design export.

**Architecture:** Vite + React 19 SPA in `apps/web`. A classic (IIFE) Web Worker loads the static data and the PvPoke bundle via `importScripts`, wires `PvPokeSimulator`, and implements `ComputeHost` over `postMessage`. UI state lives in a small reducer; navigation is a hash router so GitHub Pages deep links work. Styles are plain CSS on the design's semantic tokens.

**Tech Stack:** react 19.2.8, react-dom 19.2.8, vite 8.2.2, @vitejs/plugin-react 6.1.1, idb 8.0.3, @types/react 19.2.18, @types/react-dom 19.2.7. Tests: vitest with jsdom 27.4.0 and @testing-library/react 16.3.3 for components; headless Chrome screenshots at 390 and 412 px for layout.

**Spec:** `docs/superpowers/specs/2026-09-11-pickthree-mvp-design.md` sections 4.1, 4.6, 7, 8.3. Design reference: `docs/design/`.

## Global Constraints

- Same house rules as plans 1 and 2.
- No Pokemon artwork. Type-colored tokens with an initial. 18 type colors from the design export.
- Plain names; first-use explanations for lead, safe switch, closer, shield, bait, Elite TM, XL Candy, IV rank, line, back line.
- The page makes no network requests after loading its own static assets. CSP meta `default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; style-src-elem 'self' https://fonts.googleapis.com` (Inter from Google Fonts is the one allowed external origin, with a system-font fallback).
- The UI formats numbers and labels the engine produced; it computes nothing.

## Tasks

1. **Scaffold** `apps/web`: package, Vite config (worker format iife, base '/'), tsconfig with DOM libs, index.html with CSP and viewport, `src/main.tsx`, tokens.css from the design export (dark default, light via `prefers-color-scheme` and a manual toggle), placeholder page replaced. Build must pass and the Pages workflow must pick up `apps/web/dist`.
2. **Worker host**: `src/worker/engine.worker.ts` (loads `/data/*.json` and `/data/vendor/pvpoke-sim.js`, builds `PvPokeSimulator`, handles `import`, `recommend`, `verdicts` messages with progress), `src/host/WorkerHost.ts` implementing `ComputeHost` with request ids and progress callbacks, `src/host/loadPvPokeInWorker.ts` (importScripts + flushAjax). Test: a Node-side unit test of the message protocol with a fake worker; the real worker is exercised in the browser check.
3. **Storage**: `src/storage/db.ts` with idb: `collection` (specimens + report + importedAt), `settings` (filters, excluded ids, theme). `forget()` wipes both.
4. **App state and router**: `src/state/store.tsx` reducer + context; screens: welcome, report, teams, detail, collection, specimen; sheet flag; hash router `#/teams`, `#/teams/:id`, `#/collection`, `#/collection/:specimenId`.
5. **Components**: `PokemonToken`, `RoleLabel`, `MoveRow`, `CostLine`, `FitTag`, `StructureTag`, `VerdictChip`, `FilterChip`, `Sheet`, `TabBar`, `TermHint` (first-use explanation), `Progress`.
6. **Screens**: Welcome/Import (file input accept .csv,text/csv, paste fallback, how-to link), Import report, Teams feed, Team detail (slots, structure block ABB/ABC, key wins/threats, why, alternatives, assumptions with matchup grid), Collection (search, verdict chips, toggles, sort), Specimen detail (IVs, rank, best stage, moves, cost, perfect line, teams, exclude), Filters sheet (toggles, budget slider, excluded chips, data freshness).
7. **Verification**: vitest component tests for TeamCard and ImportReport; headless Chrome screenshots of every screen at 390x844 with the fixture imported, saved under `apps/web/screenshots/` (gitignored) and reviewed; Lighthouse-style sanity: bundle size logged.
8. **Deploy**: Pages workflow already builds `apps/web/dist`; confirm `CNAME` copied; enable `https_enforced` once the certificate exists; smoke test the live site with the fixture.

Deferred: PWA install and share target, Playwright suite in CI (headless Chrome check runs locally for now), Ultra/Master leagues.
