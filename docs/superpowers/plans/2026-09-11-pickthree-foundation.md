# PickThree Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, the pinned PvPoke data pipeline, the vendored simulator with a golden fidelity test, the precomputed Great League matchup matrix, and the hand-maintained cost tables, so the engine (plan 2) and the web app (plan 3) build on verified data.

**Architecture:** npm workspaces monorepo. `packages/data` clones PvPoke at a pinned commit and emits normalized static JSON. `packages/sim-pvpoke` vendors nine PvPoke JS files verbatim, concatenates them behind a small globals shim into one classic-script bundle, loads that bundle in a Node `vm` context (and later a browser worker), and exposes a `BattleSimulator` adapter. `packages/engine` owns the shared TS types and the `BattleSimulator` interface and never imports `sim-pvpoke`.

**Tech Stack:** Node 24.15 (fnm), npm 11 workspaces, TypeScript 5.9.3, vitest 4.1.11, tsx 4.23.13, eslint 10.10.0 + typescript-eslint 8.70.0, prettier 3.9.6. No runtime dependencies in this plan.

**Spec:** `docs/superpowers/specs/2026-09-11-pickthree-mvp-design.md`

## Global Constraints

- Exact pinned versions in every `package.json`. No `^` or `~`.
- Braces on all control flow, even single-line bodies. eslint `curly: ["error", "all"]`.
- No em dashes anywhere: code, comments, docs, commit messages.
- Vendored PvPoke files under `packages/sim-pvpoke/vendor/` are byte-for-byte copies of the pinned commit. Never edit them. Fix the shim or adapter instead.
- PvPoke pinned commit: `00e56418f479c344051ae77da5d5c774d22094af` (2026-09-10). Lives in `packages/data/pvpoke.lock.json`. Nothing reads pvpoke.com.
- `packages/engine` never imports `packages/sim-pvpoke`.
- Stage explicit paths when committing. Never `git add -A`.
- Open Great League is PvPoke cup `all` at CP 1500. Do not read `formats.json` for it.
- Every generated data file carries no PvPoke editorial text except `editorNotes` are dropped. PvPoke license notice ships with the vendored code.
- Commit messages end with the attribution trailer given in the session.

---

## File structure

```
pickthree/
  package.json                      workspaces root, scripts
  package-lock.json
  .node-version                     24.15.0
  tsconfig.base.json                strict TS shared options
  eslint.config.js                  flat config, curly: all
  .prettierrc                       single quotes, 2 spaces, 100 cols
  vitest.config.ts                  projects: packages/*
  .github/workflows/ci.yml          install, fetch pvpoke, lint, test, data:build
  .github/workflows/data-refresh.yml weekly: bump lock, rebuild, open PR
  docs/setup.md
  docs/adr/001-vendor-pvpoke-verbatim.md
  docs/adr/002-precomputed-matchup-matrix.md

  packages/engine/
    package.json                    name @pickthree/engine
    tsconfig.json
    vitest.config.ts
    src/index.ts                    re-exports
    src/gamedata/types.ts           Species, Move, GameData, Rankings, MetaEntry, MatchupMatrix, DataManifest
    src/sim/BattleSimulator.ts      SimPokemonSpec, SimOptions, SimResult, BattleSimulator interface
    src/tables/cpm.ts               CP multiplier per half level
    src/tables/powerup.ts           dust, candy, xl per half level; costToLevel()
    src/tables/secondMove.ts        dust to candy tiers
    test/tables/cpm.test.ts
    test/tables/powerup.test.ts
    test/tables/secondMove.test.ts

  packages/data/
    package.json                    name @pickthree/data, private
    tsconfig.json
    vitest.config.ts
    pvpoke.lock.json                { commit, date }
    src/paths.ts                    resolved paths (checkout dir, output dir)
    src/lock.ts                     readLock(), writeLock()
    src/fetch-pvpoke.ts             clone pinned commit into .pvpoke/
    src/build-gamedata.ts           gamemaster.json -> pokemon.json, moves.json
    src/build-rankings.ts           rankings + meta group + overrides -> rankings/great/*.json, meta/great.json, overrides/great.json
    src/build-matrix.ts             sim every ranked species vs meta -> matrix/great.json
    src/build-manifest.ts           data-manifest.json
    src/build.ts                    orchestrates the above
    src/refresh.ts                  bump lock to upstream HEAD
    test/lock.test.ts
    test/build-gamedata.test.ts
    test/build-rankings.test.ts
    test/build-matrix.test.ts

  packages/sim-pvpoke/
    package.json                    name @pickthree/sim-pvpoke
    tsconfig.json
    vitest.config.ts
    LICENSE-pvpoke                  MIT notice, copyright 2019 pvpoke
    vendor/                         nine verbatim files (see Task 5) + MANIFEST.json (sha256 each)
    src/vendor-order.ts             ordered file list
    src/globals-shim.js             $, host, webRoot, siteVersion, settings, InterfaceMaster
    src/exports-tail.js             globalThis.__pvpoke = { GameMaster, Battle, Pokemon, DamageCalculator }
    src/bundle.ts                   buildBundleSource(): string
    src/node-host.ts                loadPvPokeInNode(gamemaster): PvPokeRuntime
    src/PvPokeSimulator.ts          BattleSimulator implementation
    src/vendor-sync.ts              copy files from checkout, write MANIFEST.json
    src/index.ts
    test/vendor-manifest.test.ts
    test/node-host.test.ts
    test/simulator.test.ts
    test/golden.test.ts
```

---

### Task 1: Monorepo scaffold with a passing smoke test

**Files:**
- Create: `package.json`, `.node-version`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `vitest.config.ts`
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/vitest.config.ts`, `packages/engine/src/index.ts`, `packages/engine/test/smoke.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: workspace layout and scripts `npm test`, `npm run lint`, `npm run typecheck` that later tasks rely on.

- [ ] **Step 1: Root package.json**

```json
{
  "name": "pickthree",
  "private": true,
  "version": "0.0.0",
  "description": "Great League team building from the Pokemon you actually own.",
  "license": "MIT",
  "workspaces": ["packages/*", "apps/*"],
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "data:fetch": "npm -w @pickthree/data run fetch",
    "data:build": "npm -w @pickthree/data run build",
    "data:refresh": "npm -w @pickthree/data run refresh"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.4",
    "eslint": "10.10.0",
    "eslint-config-prettier": "10.1.8",
    "globals": "17.12.0",
    "prettier": "3.9.6",
    "tsx": "4.23.13",
    "typescript": "5.9.3",
    "typescript-eslint": "8.70.0",
    "vitest": "4.1.11"
  }
}
```

- [ ] **Step 2: Shared config files**

`.node-version`:
```
24.15.0
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'packages/sim-pvpoke/vendor/**',
      'packages/sim-pvpoke/src/globals-shim.js',
      'packages/sim-pvpoke/src/exports-tail.js',
      'packages/data/.pvpoke/**',
      'apps/web/public/data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/\\u2014/]",
          message: 'No em dashes. Use a plain dash or rewrite.',
        },
      ],
    },
  },
);
```

`.prettierrc`:
```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "tabWidth": 2, "trailingComma": "all" }
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
```

- [ ] **Step 3: Engine package skeleton**

`packages/engine/package.json`:
```json
{
  "name": "@pickthree/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true, "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`packages/engine/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'engine', include: ['test/**/*.test.ts'] },
});
```

`packages/engine/src/index.ts`:
```ts
export const ENGINE_NAME = '@pickthree/engine';
```

- [ ] **Step 4: Write the smoke test**

`packages/engine/test/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ENGINE_NAME } from '../src/index.js';

describe('engine package', () => {
  it('loads', () => {
    expect(ENGINE_NAME).toBe('@pickthree/engine');
  });
});
```

- [ ] **Step 5: Install and run**

Run: `npm install` then `npm test`
Expected: 1 test passed in project `engine`.

Run: `npm run lint` and `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      PICKTHREE_REQUIRE_PVPOKE: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run data:fetch
      - run: npm test
      - run: npm run data:build
```

`data:fetch` and `data:build` do not exist until Tasks 2 and 9. Commit the workflow now anyway; the `--if-present` guard is not used on purpose so CI goes red until the scripts land, which is the desired signal.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .node-version tsconfig.base.json eslint.config.js .prettierrc vitest.config.ts packages/engine .github/workflows/ci.yml
git commit -m "Scaffold npm workspaces monorepo with engine package and CI"
```

---

### Task 2: Pin PvPoke and fetch the exact commit

**Files:**
- Create: `packages/data/package.json`, `packages/data/tsconfig.json`, `packages/data/vitest.config.ts`
- Create: `packages/data/pvpoke.lock.json`, `packages/data/src/paths.ts`, `packages/data/src/lock.ts`, `packages/data/src/fetch-pvpoke.ts`
- Test: `packages/data/test/lock.test.ts`

**Interfaces:**
- Produces: `readLock(): PvPokeLock` with `{ commit: string; date: string }`, `PVPOKE_DIR` (absolute path of the checkout), `OUTPUT_DIR` (absolute path of generated data), `ensurePvPokeCheckout(): Promise<void>`.

- [ ] **Step 1: Package files**

`packages/data/package.json`:
```json
{
  "name": "@pickthree/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "fetch": "tsx src/fetch-pvpoke.ts",
    "build": "tsx src/build.ts",
    "refresh": "tsx src/refresh.ts"
  },
  "dependencies": {
    "@pickthree/engine": "0.0.0"
  }
}
```

(`@pickthree/sim-pvpoke` is added as a dependency in Task 9, when the matrix builder first needs it.)

`packages/data/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "..", "noEmit": true, "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts", "../engine/src/**/*.ts"]
}
```

`packages/data/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'data', include: ['test/**/*.test.ts'], testTimeout: 120_000 },
});
```

`packages/data/pvpoke.lock.json`:
```json
{
  "commit": "00e56418f479c344051ae77da5d5c774d22094af",
  "date": "2026-09-10",
  "repository": "https://github.com/pvpoke/pvpoke.git"
}
```

- [ ] **Step 2: Write the failing lock test**

`packages/data/test/lock.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readLock } from '../src/lock.js';

describe('pvpoke.lock.json', () => {
  it('pins a full 40-char commit sha and an ISO date', () => {
    const lock = readLock();
    expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lock.repository).toBe('https://github.com/pvpoke/pvpoke.git');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run --project data`
Expected: FAIL, cannot find module `../src/lock.js`.

- [ ] **Step 4: Implement paths and lock**

`packages/data/src/paths.ts`:
```ts
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_PACKAGE_DIR = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(DATA_PACKAGE_DIR, '..', '..');
export const LOCK_PATH = path.join(DATA_PACKAGE_DIR, 'pvpoke.lock.json');
export const PVPOKE_DIR = process.env.PICKTHREE_PVPOKE_DIR ?? path.join(DATA_PACKAGE_DIR, '.pvpoke');
export const OUTPUT_DIR =
  process.env.PICKTHREE_DATA_OUT ?? path.join(REPO_ROOT, 'apps', 'web', 'public', 'data');

export const GAMEMASTER_PATH = path.join(PVPOKE_DIR, 'src', 'data', 'gamemaster.json');
export const RANKINGS_DIR = path.join(PVPOKE_DIR, 'src', 'data', 'rankings');
export const GROUPS_DIR = path.join(PVPOKE_DIR, 'src', 'data', 'groups');
export const OVERRIDES_DIR = path.join(PVPOKE_DIR, 'src', 'data', 'overrides');
export const PVPOKE_JS_DIR = path.join(PVPOKE_DIR, 'src', 'js');
```

`packages/data/src/lock.ts`:
```ts
import fs from 'node:fs';
import { LOCK_PATH } from './paths.js';

export interface PvPokeLock {
  commit: string;
  date: string;
  repository: string;
}

export function readLock(): PvPokeLock {
  const raw = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')) as Partial<PvPokeLock>;
  if (typeof raw.commit !== 'string' || !/^[0-9a-f]{40}$/.test(raw.commit)) {
    throw new Error(`pvpoke.lock.json: commit must be a 40-char sha, got ${String(raw.commit)}`);
  }
  if (typeof raw.date !== 'string') {
    throw new Error('pvpoke.lock.json: date missing');
  }
  if (typeof raw.repository !== 'string') {
    throw new Error('pvpoke.lock.json: repository missing');
  }
  return { commit: raw.commit, date: raw.date, repository: raw.repository };
}

export function writeLock(lock: PvPokeLock): void {
  fs.writeFileSync(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
}
```

`packages/data/src/fetch-pvpoke.ts`:
```ts
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readLock } from './lock.js';
import { PVPOKE_DIR } from './paths.js';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

export function currentCheckoutCommit(): string | null {
  if (!fs.existsSync(PVPOKE_DIR)) {
    return null;
  }
  try {
    return git(['rev-parse', 'HEAD'], PVPOKE_DIR);
  } catch {
    return null;
  }
}

export async function ensurePvPokeCheckout(): Promise<void> {
  const lock = readLock();
  if (currentCheckoutCommit() === lock.commit) {
    return;
  }
  fs.rmSync(PVPOKE_DIR, { recursive: true, force: true });
  fs.mkdirSync(PVPOKE_DIR, { recursive: true });
  git(['init', '-q'], PVPOKE_DIR);
  git(['remote', 'add', 'origin', lock.repository], PVPOKE_DIR);
  git(['fetch', '-q', '--depth', '1', 'origin', lock.commit], PVPOKE_DIR);
  git(['-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD'], PVPOKE_DIR);
  const head = git(['rev-parse', 'HEAD'], PVPOKE_DIR);
  if (head !== lock.commit) {
    throw new Error(`Checked out ${head} but lock pins ${lock.commit}`);
  }
  console.log(`pvpoke @ ${lock.commit.slice(0, 7)} ready at ${PVPOKE_DIR}`);
}

if (process.argv[1] && process.argv[1].endsWith('fetch-pvpoke.ts')) {
  ensurePvPokeCheckout().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run tests and the fetch**

Run: `npm install` (links the new workspace), then `npx vitest run --project data`
Expected: PASS.

Run: `npm run data:fetch`
Expected: prints `pvpoke @ 00e5641 ready at ...`. `packages/data/.pvpoke/src/data/gamemaster.json` exists. Run it again: returns immediately.

- [ ] **Step 6: Commit**

```bash
git add packages/data/package.json packages/data/tsconfig.json packages/data/vitest.config.ts packages/data/pvpoke.lock.json packages/data/src/paths.ts packages/data/src/lock.ts packages/data/src/fetch-pvpoke.ts packages/data/test/lock.test.ts package-lock.json
git commit -m "Pin PvPoke commit and add fetch script for the exact checkout"
```

---

### Task 3: Shared data types and normalized game data

**Files:**
- Create: `packages/engine/src/gamedata/types.ts`
- Modify: `packages/engine/src/index.ts`
- Create: `packages/data/src/build-gamedata.ts`
- Test: `packages/data/test/build-gamedata.test.ts`

**Interfaces:**
- Produces: types `Species`, `Move`, `GameData`; function `buildGameData(gamemaster: unknown): GameData` (pure, no IO) and `writeGameData(outDir: string): GameData`.

- [ ] **Step 1: Types**

`packages/engine/src/gamedata/types.ts`:
```ts
export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'grass' | 'electric' | 'ice' | 'fighting' | 'poison' | 'ground'
  | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export interface BaseStats {
  atk: number;
  def: number;
  hp: number;
}

export interface Species {
  speciesId: string;
  speciesName: string;
  dex: number;
  types: [PokemonType, PokemonType | 'none'];
  baseStats: BaseStats;
  fastMoves: string[];
  chargedMoves: string[];
  eliteMoves: string[];
  legacyMoves: string[];
  tags: string[];
  familyId: string | null;
  parentId: string | null;
  evolutionIds: string[];
  shadow: boolean;
  shadowEligible: boolean;
  released: boolean;
  thirdMoveCost: number;
  levelCap: number | null;
  levelFloor: number | null;
  greatLeagueIneligible: boolean;
  defaultIVs: Record<string, [number, number, number, number]>;
}

export interface Move {
  moveId: string;
  name: string;
  type: PokemonType;
  power: number;
  energy: number;
  energyGain: number;
  turns: number;
  cooldown: number;
  buffs: [number, number] | null;
  buffTarget: 'self' | 'opponent' | 'both' | null;
  buffApplyChance: number | null;
  buffsSelf: [number, number] | null;
  buffsOpponent: [number, number] | null;
  archetype: string | null;
}

export interface GameData {
  species: Species[];
  moves: Move[];
  rankingScenarios: { slug: string; shields: [number, number]; energy: [number, number] }[];
  settings: { maxBuffStages: number; buffDivisor: number };
  gamemasterTimestamp: string;
}

export interface RankingMoveUsage {
  moveId: string;
  uses: number;
}

export interface RankingMatchup {
  opponent: string;
  rating: number;
}

export interface RankingEntry {
  speciesId: string;
  score: number;
  rating: number;
  moveset: string[];
  fastMoves: RankingMoveUsage[];
  chargedMoves: RankingMoveUsage[];
  matchups: RankingMatchup[];
  counters: RankingMatchup[];
  statProduct: number;
}

export type RankingCategory = 'overall' | 'leads' | 'switches' | 'closers' | 'chargers';

export interface MetaEntry {
  speciesId: string;
  fastMove: string;
  chargedMoves: string[];
}

export interface MovesetOverride {
  speciesId: string;
  fastMove?: string;
  chargedMoves?: string[];
  weight?: number;
}

export interface MatchupMatrix {
  league: 'great';
  cp: number;
  scenarios: { shields: [number, number]; energy: [number, number] }[];
  candidates: string[];
  opponents: string[];
  candidateMovesets: Record<string, string[]>;
  opponentMovesets: Record<string, string[]>;
  ratings: number[];
}

export function matrixIndex(m: MatchupMatrix, candidate: number, opponent: number, scenario: number): number {
  return (candidate * m.opponents.length + opponent) * m.scenarios.length + scenario;
}

export interface DataManifest {
  pvpokeCommit: string;
  pvpokeDate: string;
  gamemasterTimestamp: string;
  builtAt: string;
  metaSize: number;
  matrix: { candidates: number; opponents: number; scenarios: number };
  files: string[];
}
```

`packages/engine/src/index.ts`:
```ts
export const ENGINE_NAME = '@pickthree/engine';
export * from './gamedata/types.js';
```

- [ ] **Step 2: Write the failing test**

`packages/data/test/build-gamedata.test.ts`:
```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGameData } from '../src/build-gamedata.js';
import { GAMEMASTER_PATH } from '../src/paths.js';

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);
if (!havePvPoke && process.env.PICKTHREE_REQUIRE_PVPOKE === '1') {
  throw new Error('PvPoke checkout missing. Run npm run data:fetch');
}

describe.skipIf(!havePvPoke)('buildGameData', () => {
  const gm = JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown;
  const data = buildGameData(gm);

  it('normalizes azumarill', () => {
    const azu = data.species.find((s) => s.speciesId === 'azumarill');
    expect(azu).toBeDefined();
    expect(azu?.baseStats).toEqual({ atk: 112, def: 152, hp: 225 });
    expect(azu?.types).toEqual(['water', 'fairy']);
    expect(azu?.familyId).toBe('FAMILY_MARILL');
    expect(azu?.parentId).toBe('marill');
    expect(azu?.shadow).toBe(false);
    expect(azu?.thirdMoveCost).toBe(50000);
  });

  it('links evolutions from parent pointers', () => {
    const marill = data.species.find((s) => s.speciesId === 'marill');
    expect(marill?.evolutionIds).toContain('azumarill');
  });

  it('marks shadow variants and elite moves', () => {
    const q = data.species.find((s) => s.speciesId === 'quagsire_shadow');
    expect(q?.shadow).toBe(true);
    expect(q?.eliteMoves).toContain('AQUA_TAIL');
  });

  it('flags great league ineligible species', () => {
    const mewtwo = data.species.find((s) => s.speciesId === 'mewtwo');
    expect(mewtwo?.greatLeagueIneligible).toBe(true);
  });

  it('normalizes moves with buffs', () => {
    const ice = data.moves.find((m) => m.moveId === 'ICE_BEAM');
    expect(ice).toMatchObject({ type: 'ice', power: 90, energy: 55, energyGain: 0, turns: 1 });
    const acid = data.moves.find((m) => m.moveId === 'ACID_SPRAY');
    expect(acid?.buffs).toEqual([0, -2]);
    expect(acid?.buffTarget).toBe('opponent');
    expect(acid?.buffApplyChance).toBe(1);
  });

  it('carries scenarios, settings and timestamp', () => {
    expect(data.rankingScenarios.map((s) => s.slug)).toEqual(['leads', 'closers', 'switches', 'chargers']);
    expect(data.settings).toEqual({ maxBuffStages: 4, buffDivisor: 4 });
    expect(data.gamemasterTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run --project data`
Expected: FAIL, cannot find `../src/build-gamedata.js`.

- [ ] **Step 4: Implement**

`packages/data/src/build-gamedata.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import type { GameData, Move, PokemonType, Species } from '@pickthree/engine';
import { GAMEMASTER_PATH } from './paths.js';

interface RawPokemon {
  dex: number;
  speciesName: string;
  speciesId: string;
  baseStats: { atk: number; def: number; hp: number };
  types: string[];
  fastMoves: string[];
  chargedMoves: string[];
  eliteMoves?: string[];
  legacyMoves?: string[];
  tags?: string[];
  family?: { id: string; parent?: string; evolutions?: string[] };
  released?: boolean;
  thirdMoveCost?: number;
  levelCap?: number;
  levelFloor?: number;
  defaultIVs?: Record<string, [number, number, number, number]>;
}

interface RawMove {
  moveId: string;
  name: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  turns?: number;
  cooldown: number;
  buffs?: [number, number];
  buffTarget?: string;
  buffApplyChance?: string | number;
  buffsSelf?: [number, number];
  buffsOpponent?: [number, number];
  archetype?: string;
}

interface RawGameMaster {
  timestamp: string;
  settings: { maxBuffStages: number; buffDivisor: number };
  rankingScenarios: { slug: string; shields: [number, number]; energy: [number, number] }[];
  greatLeagueIneligible: string[];
  pokemon: RawPokemon[];
  moves: RawMove[];
}

function asType(t: string | undefined): PokemonType | 'none' {
  return (t ?? 'none') as PokemonType | 'none';
}

export function buildGameData(input: unknown): GameData {
  const gm = input as RawGameMaster;
  const banned = new Set(gm.greatLeagueIneligible);

  const children = new Map<string, string[]>();
  for (const p of gm.pokemon) {
    const parent = p.family?.parent;
    if (parent) {
      const list = children.get(parent) ?? [];
      list.push(p.speciesId);
      children.set(parent, list);
    }
  }

  const species: Species[] = gm.pokemon.map((p) => {
    const tags = p.tags ?? [];
    return {
      speciesId: p.speciesId,
      speciesName: p.speciesName,
      dex: p.dex,
      types: [asType(p.types[0]) as PokemonType, asType(p.types[1])],
      baseStats: { ...p.baseStats },
      fastMoves: [...p.fastMoves],
      chargedMoves: [...p.chargedMoves],
      eliteMoves: [...(p.eliteMoves ?? [])],
      legacyMoves: [...(p.legacyMoves ?? [])],
      tags: [...tags],
      familyId: p.family?.id ?? null,
      parentId: p.family?.parent ?? null,
      evolutionIds: [...(children.get(p.speciesId) ?? [])].sort(),
      shadow: tags.includes('shadow'),
      shadowEligible: tags.includes('shadoweligible'),
      released: p.released !== false,
      thirdMoveCost: p.thirdMoveCost ?? 75000,
      levelCap: p.levelCap ?? null,
      levelFloor: p.levelFloor ?? null,
      greatLeagueIneligible: banned.has(p.speciesId),
      defaultIVs: { ...(p.defaultIVs ?? {}) },
    };
  });

  const moves: Move[] = gm.moves.map((m) => ({
    moveId: m.moveId,
    name: m.name,
    type: m.type as PokemonType,
    power: m.power,
    energy: m.energy,
    energyGain: m.energyGain,
    turns: m.turns ?? Math.round(m.cooldown / 500),
    cooldown: m.cooldown,
    buffs: m.buffs ? [m.buffs[0], m.buffs[1]] : null,
    buffTarget: (m.buffTarget as Move['buffTarget']) ?? null,
    buffApplyChance: m.buffApplyChance === undefined ? null : Number(m.buffApplyChance),
    buffsSelf: m.buffsSelf ? [m.buffsSelf[0], m.buffsSelf[1]] : null,
    buffsOpponent: m.buffsOpponent ? [m.buffsOpponent[0], m.buffsOpponent[1]] : null,
    archetype: m.archetype ?? null,
  }));

  return {
    species,
    moves,
    rankingScenarios: gm.rankingScenarios.map((s) => ({ slug: s.slug, shields: s.shields, energy: s.energy })),
    settings: { maxBuffStages: gm.settings.maxBuffStages, buffDivisor: gm.settings.buffDivisor },
    gamemasterTimestamp: gm.timestamp,
  };
}

export function readRawGameMaster(): unknown {
  return JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown;
}

export function writeGameData(outDir: string): GameData {
  const data = buildGameData(readRawGameMaster());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'pokemon.json'), JSON.stringify(data.species));
  fs.writeFileSync(path.join(outDir, 'moves.json'), JSON.stringify(data.moves));
  fs.writeFileSync(
    path.join(outDir, 'gamedata-meta.json'),
    JSON.stringify({
      rankingScenarios: data.rankingScenarios,
      settings: data.settings,
      gamemasterTimestamp: data.gamemasterTimestamp,
    }),
  );
  return data;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run --project data` and `npm run typecheck`
Expected: PASS. If the `evolutions` test fails because the game master carries an explicit `family.evolutions` array, prefer it: replace `children.get(p.speciesId)` with `p.family?.evolutions ?? children.get(p.speciesId)`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/gamedata/types.ts packages/engine/src/index.ts packages/data/src/build-gamedata.ts packages/data/test/build-gamedata.test.ts
git commit -m "Add shared game data types and normalize the PvPoke game master"
```

---

### Task 4: Rankings, meta group and overrides for Great League

**Files:**
- Create: `packages/data/src/build-rankings.ts`
- Test: `packages/data/test/build-rankings.test.ts`

**Interfaces:**
- Consumes: `RankingEntry`, `RankingCategory`, `MetaEntry`, `MovesetOverride` from `@pickthree/engine`; `RANKINGS_DIR`, `GROUPS_DIR`, `OVERRIDES_DIR` from `paths.ts`.
- Produces: `readGreatRankings(category): RankingEntry[]`, `readGreatMeta(): MetaEntry[]`, `readGreatOverrides(): MovesetOverride[]`, `writeRankings(outDir)`, and `effectiveMoveset(speciesId, rankings, overrides): string[]` (used by Task 7 and the golden test).

- [ ] **Step 1: Write the failing test**

`packages/data/test/build-rankings.test.ts`:
```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  effectiveMoveset,
  readGreatMeta,
  readGreatOverrides,
  readGreatRankings,
} from '../src/build-rankings.js';
import { GAMEMASTER_PATH } from '../src/paths.js';

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);

describe.skipIf(!havePvPoke)('great league rankings extraction', () => {
  it('reads overall rankings with slimmed entries', () => {
    const overall = readGreatRankings('overall');
    expect(overall.length).toBeGreaterThan(1000);
    const azu = overall.find((e) => e.speciesId === 'azumarill');
    expect(azu?.moveset).toEqual(['BUBBLE', 'ICE_BEAM', 'PLAY_ROUGH']);
    expect(azu?.score).toBeGreaterThan(80);
    expect(azu?.fastMoves[0]?.moveId).toBe('BUBBLE');
    expect(azu?.matchups.length).toBe(5);
    expect(azu?.counters.length).toBe(5);
    expect(azu?.statProduct).toBeGreaterThan(1900);
    expect((azu as unknown as Record<string, unknown>)['editorNotes']).toBeUndefined();
  });

  it('reads every role category', () => {
    for (const cat of ['leads', 'switches', 'closers', 'chargers'] as const) {
      expect(readGreatRankings(cat).length).toBeGreaterThan(1000);
    }
  });

  it('reads the meta group', () => {
    const meta = readGreatMeta();
    expect(meta.length).toBeGreaterThan(30);
    const altaria = meta.find((m) => m.speciesId === 'altaria');
    expect(altaria).toEqual({ speciesId: 'altaria', fastMove: 'DRAGON_BREATH', chargedMoves: ['MOONBLAST', 'FLAMETHROWER'] });
  });

  it('reads overrides and applies them over the ranking moveset', () => {
    const overrides = readGreatOverrides();
    expect(overrides.length).toBeGreaterThan(500);
    const overall = readGreatRankings('overall');
    const abom = effectiveMoveset('abomasnow', overall, overrides);
    expect(abom).toEqual(['POWDER_SNOW', 'WEATHER_BALL_ICE', 'ENERGY_BALL']);
    const azu = effectiveMoveset('azumarill', overall, overrides);
    expect(azu[0]).toBe('BUBBLE');
    expect(azu.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project data`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`packages/data/src/build-rankings.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import type { MetaEntry, MovesetOverride, RankingCategory, RankingEntry } from '@pickthree/engine';
import { GROUPS_DIR, OVERRIDES_DIR, RANKINGS_DIR } from './paths.js';

export const GREAT_CUP = 'all';
export const GREAT_CP = 1500;
export const CATEGORIES: RankingCategory[] = ['overall', 'leads', 'switches', 'closers', 'chargers'];

interface RawRanking {
  speciesId: string;
  score: number;
  rating: number;
  moveset: string[];
  moves: { fastMoves: { moveId: string; uses: number }[]; chargedMoves: { moveId: string; uses: number }[] };
  matchups: { opponent: string; rating: number }[];
  counters: { opponent: string; rating: number }[];
  stats: { product: number };
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export function readGreatRankings(category: RankingCategory): RankingEntry[] {
  const file = path.join(RANKINGS_DIR, GREAT_CUP, category, `rankings-${GREAT_CP}.json`);
  const raw = readJson<RawRanking[]>(file);
  return raw.map((r) => ({
    speciesId: r.speciesId,
    score: r.score,
    rating: r.rating,
    moveset: [...r.moveset],
    fastMoves: r.moves.fastMoves.map((m) => ({ moveId: m.moveId, uses: m.uses })),
    chargedMoves: r.moves.chargedMoves.map((m) => ({ moveId: m.moveId, uses: m.uses })),
    matchups: r.matchups.map((m) => ({ opponent: m.opponent, rating: m.rating })),
    counters: r.counters.map((m) => ({ opponent: m.opponent, rating: m.rating })),
    statProduct: r.stats.product,
  }));
}

export function readGreatMeta(): MetaEntry[] {
  const raw = readJson<{ speciesId: string; fastMove: string; chargedMoves: string[] }[]>(
    path.join(GROUPS_DIR, 'great.json'),
  );
  return raw.map((m) => ({ speciesId: m.speciesId, fastMove: m.fastMove, chargedMoves: [...m.chargedMoves] }));
}

export function readGreatOverrides(): MovesetOverride[] {
  const raw = readJson<MovesetOverride[]>(path.join(OVERRIDES_DIR, GREAT_CUP, `${GREAT_CP}.json`));
  return raw.map((o) => {
    const out: MovesetOverride = { speciesId: o.speciesId };
    if (o.fastMove) {
      out.fastMove = o.fastMove;
    }
    if (o.chargedMoves) {
      out.chargedMoves = [...o.chargedMoves];
    }
    if (o.weight !== undefined) {
      out.weight = o.weight;
    }
    return out;
  });
}

/**
 * The moveset PvPoke's ranker used for a species: the top-usage fast move and top two charged
 * moves from the rankings, with any override applied on top (mirrors GameMaster.overrideMoveset).
 * Returns [fast, charged1, charged2?].
 */
export function effectiveMoveset(
  speciesId: string,
  rankings: RankingEntry[],
  overrides: MovesetOverride[],
): string[] {
  const entry = rankings.find((r) => r.speciesId === speciesId);
  if (!entry) {
    throw new Error(`No ranking entry for ${speciesId}`);
  }
  let fast = entry.fastMoves[0]?.moveId ?? entry.moveset[0];
  let charged = entry.chargedMoves.slice(0, 2).map((m) => m.moveId);
  const o = overrides.find((x) => x.speciesId === speciesId);
  if (o?.fastMove) {
    fast = o.fastMove;
  }
  if (o?.chargedMoves) {
    charged = [...o.chargedMoves];
  }
  if (!fast) {
    throw new Error(`No fast move for ${speciesId}`);
  }
  return [fast, ...charged];
}

export function writeRankings(outDir: string): { meta: MetaEntry[] } {
  const rankDir = path.join(outDir, 'rankings', 'great');
  fs.mkdirSync(rankDir, { recursive: true });
  for (const cat of CATEGORIES) {
    fs.writeFileSync(path.join(rankDir, `${cat}.json`), JSON.stringify(readGreatRankings(cat)));
  }
  fs.mkdirSync(path.join(outDir, 'meta'), { recursive: true });
  const meta = readGreatMeta();
  fs.writeFileSync(path.join(outDir, 'meta', 'great.json'), JSON.stringify(meta));
  fs.mkdirSync(path.join(outDir, 'overrides'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'overrides', 'great.json'), JSON.stringify(readGreatOverrides()));
  return { meta };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run --project data`
Expected: PASS. If the abomasnow expectation fails, print `effectiveMoveset('abomasnow', ...)` and compare with `overrides/all/1500.json`; the override in the pinned commit is `POWDER_SNOW / WEATHER_BALL_ICE, ENERGY_BALL`.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/build-rankings.ts packages/data/test/build-rankings.test.ts
git commit -m "Extract Great League rankings, meta group and moveset overrides"
```

---

### Task 5: Vendor the PvPoke simulator verbatim

**Files:**
- Create: `packages/sim-pvpoke/package.json`, `packages/sim-pvpoke/tsconfig.json`, `packages/sim-pvpoke/vitest.config.ts`
- Create: `packages/sim-pvpoke/LICENSE-pvpoke`
- Create: `packages/sim-pvpoke/src/vendor-order.ts`, `packages/sim-pvpoke/src/vendor-sync.ts`
- Create (generated): `packages/sim-pvpoke/vendor/*.js`, `packages/sim-pvpoke/vendor/MANIFEST.json`
- Test: `packages/sim-pvpoke/test/vendor-manifest.test.ts`

**Interfaces:**
- Produces: `VENDOR_FILES: { source: string; name: string }[]` in load order; `vendor/MANIFEST.json` as `{ commit, files: { name, source, sha256 }[] }`.

- [ ] **Step 1: Package files**

`packages/sim-pvpoke/package.json`:
```json
{
  "name": "@pickthree/sim-pvpoke",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "vendor:sync": "tsx src/vendor-sync.ts"
  },
  "dependencies": {
    "@pickthree/engine": "0.0.0"
  }
}
```

`packages/sim-pvpoke/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "..", "noEmit": true, "types": ["node"], "allowJs": false },
  "include": ["src/**/*.ts", "test/**/*.ts", "../engine/src/**/*.ts"]
}
```

`packages/sim-pvpoke/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'sim-pvpoke', include: ['test/**/*.test.ts'], testTimeout: 120_000 },
});
```

`packages/sim-pvpoke/LICENSE-pvpoke`: copy `LICENSE` from the PvPoke checkout verbatim (MIT, Copyright (c) 2019 pvpoke). Prepend nothing.

- [ ] **Step 2: Vendor order**

`packages/sim-pvpoke/src/vendor-order.ts`:
```ts
/** PvPoke files vendored verbatim, in the order they must be evaluated. Paths are relative to src/js in the PvPoke repo. */
export const VENDOR_FILES: { source: string; name: string }[] = [
  { source: 'GameMaster.js', name: 'GameMaster.js' },
  { source: 'battle/timeline/TimelineEvent.js', name: 'TimelineEvent.js' },
  { source: 'battle/timeline/TimelineAction.js', name: 'TimelineAction.js' },
  { source: 'training/DecisionOption.js', name: 'DecisionOption.js' },
  { source: 'battle/DamageCalculator.js', name: 'DamageCalculator.js' },
  { source: 'battle/actions/ActionLogic.js', name: 'ActionLogic.js' },
  { source: 'pokemon/Player.js', name: 'Player.js' },
  { source: 'pokemon/Pokemon.js', name: 'Pokemon.js' },
  { source: 'battle/Battle.js', name: 'Battle.js' },
];
```

- [ ] **Step 3: Write the failing manifest test**

`packages/sim-pvpoke/test/vendor-manifest.test.ts`:
```ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VENDOR_FILES } from '../src/vendor-order.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.resolve(here, '..', 'vendor');

describe('vendored PvPoke files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(vendorDir, 'MANIFEST.json'), 'utf8')) as {
    commit: string;
    files: { name: string; source: string; sha256: string }[];
  };

  it('lists every file in vendor order', () => {
    expect(manifest.files.map((f) => f.name)).toEqual(VENDOR_FILES.map((f) => f.name));
  });

  it('matches on-disk hashes (no local edits)', () => {
    for (const f of manifest.files) {
      const bytes = fs.readFileSync(path.join(vendorDir, f.name));
      const sha = crypto.createHash('sha256').update(bytes).digest('hex');
      expect(sha, f.name).toBe(f.sha256);
    }
  });

  it('records the pinned commit', () => {
    const lock = JSON.parse(
      fs.readFileSync(path.resolve(here, '..', '..', 'data', 'pvpoke.lock.json'), 'utf8'),
    ) as { commit: string };
    expect(manifest.commit).toBe(lock.commit);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run --project sim-pvpoke`
Expected: FAIL, MANIFEST.json missing.

- [ ] **Step 5: Implement vendor-sync**

`packages/sim-pvpoke/src/vendor-sync.ts`:
```ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR_FILES } from './vendor-order.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..');
const vendorDir = path.join(pkgDir, 'vendor');
const dataPkg = path.resolve(pkgDir, '..', 'data');
const lock = JSON.parse(fs.readFileSync(path.join(dataPkg, 'pvpoke.lock.json'), 'utf8')) as { commit: string };
const checkout = process.env.PICKTHREE_PVPOKE_DIR ?? path.join(dataPkg, '.pvpoke');
const jsDir = path.join(checkout, 'src', 'js');

if (!fs.existsSync(jsDir)) {
  console.error(`PvPoke checkout not found at ${checkout}. Run npm run data:fetch first.`);
  process.exit(1);
}

fs.mkdirSync(vendorDir, { recursive: true });
const files = VENDOR_FILES.map((f) => {
  const bytes = fs.readFileSync(path.join(jsDir, f.source));
  fs.writeFileSync(path.join(vendorDir, f.name), bytes);
  return { name: f.name, source: `src/js/${f.source}`, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
fs.copyFileSync(path.join(checkout, 'LICENSE'), path.join(pkgDir, 'LICENSE-pvpoke'));
fs.writeFileSync(path.join(vendorDir, 'MANIFEST.json'), `${JSON.stringify({ commit: lock.commit, files }, null, 2)}\n`);
console.log(`vendored ${files.length} files from pvpoke @ ${lock.commit.slice(0, 7)}`);
```

Run: `npm install` then `npm -w @pickthree/sim-pvpoke run vendor:sync`
Expected: `vendored 9 files from pvpoke @ 00e5641`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run --project sim-pvpoke`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/sim-pvpoke/package.json packages/sim-pvpoke/tsconfig.json packages/sim-pvpoke/vitest.config.ts packages/sim-pvpoke/LICENSE-pvpoke packages/sim-pvpoke/src/vendor-order.ts packages/sim-pvpoke/src/vendor-sync.ts packages/sim-pvpoke/vendor packages/sim-pvpoke/test/vendor-manifest.test.ts package-lock.json
git commit -m "Vendor PvPoke simulator files verbatim at the pinned commit with a hash manifest"
```

---

### Task 6: Globals shim, bundle, and Node host

**Files:**
- Create: `packages/sim-pvpoke/src/globals-shim.js`, `packages/sim-pvpoke/src/exports-tail.js`, `packages/sim-pvpoke/src/bundle.ts`, `packages/sim-pvpoke/src/node-host.ts`, `packages/sim-pvpoke/src/index.ts`
- Test: `packages/sim-pvpoke/test/node-host.test.ts`

**Interfaces:**
- Produces: `buildBundleSource(): string`; `loadPvPokeInNode(gamemaster: unknown): PvPokeRuntime` where

```ts
export interface PvPokeRuntime {
  GameMaster: { getInstance(): PvPokeGameMaster };
  Battle: new () => PvPokeBattle;
  Pokemon: new (id: string, index: number, battle: PvPokeBattle) => PvPokePokemon;
  gm: PvPokeGameMaster;
}
```

Why a shim instead of a hand-written GameMaster: `GameMaster.getMoveById` derives a dozen fields (category, selfDebuffing, buff parsing) and `generateFilteredPokemonList` encodes eligibility rules. Reimplementing them is drift waiting to happen. GameMaster.js uses only `$.ajax`, `$.getJSON`, `$.each` and `$()` from jQuery, plus the page globals `host`, `webRoot`, `siteVersion`, `settings`, `InterfaceMaster`. The shim provides exactly those.

- [ ] **Step 1: Write the failing test**

`packages/sim-pvpoke/test/node-host.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPvPokeInNode } from '../src/node-host.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const gmPath =
  process.env.PICKTHREE_PVPOKE_DIR !== undefined
    ? path.join(process.env.PICKTHREE_PVPOKE_DIR, 'src', 'data', 'gamemaster.json')
    : path.resolve(here, '..', '..', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json');
const havePvPoke = fs.existsSync(gmPath);

describe.skipIf(!havePvPoke)('node host', () => {
  const gamemaster = JSON.parse(fs.readFileSync(gmPath, 'utf8')) as unknown;
  const rt = loadPvPokeInNode(gamemaster);

  it('exposes a loaded GameMaster', () => {
    expect(rt.gm.data.pokemon.length).toBeGreaterThan(1500);
    expect(rt.gm.getPokemonById('azumarill').speciesName).toBe('Azumarill');
    const ice = rt.gm.getMoveById('ICE_BEAM');
    expect(ice.category).toBe('charged');
    expect(ice.energy).toBe(55);
  });

  it('constructs a Battle and default-IV Pokemon at 1500', () => {
    const battle = new rt.Battle();
    battle.setCP(1500);
    battle.setLevelCap(50);
    battle.setCup('all');
    const azu = new rt.Pokemon('azumarill', 0, battle);
    azu.initialize(1500);
    expect(azu.cp).toBeLessThanOrEqual(1500);
    expect(azu.cp).toBeGreaterThan(1480);
    expect(azu.ivs).toEqual({ atk: 4, def: 15, hp: 13 });
    expect(azu.level).toBe(43);
  });

  it('does not share state between two runtimes', () => {
    const rt2 = loadPvPokeInNode(gamemaster);
    expect(rt2.gm).not.toBe(rt.gm);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project sim-pvpoke`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement the shim and tail**

`packages/sim-pvpoke/src/globals-shim.js`:
```js
/* PickThree shim: the page globals and jQuery subset PvPoke's GameMaster.js expects.
   The real game master JSON is injected by the host as __PICKTHREE_GAMEMASTER__ before this runs. */
var host = 'localhost';
var webRoot = '/';
var siteVersion = 'pickthree';
var settings = {
  defaultIVs: 'gamemaster',
  animateTimeline: 0,
  matrixDirection: 'row',
  gamemaster: 'gamemaster',
  pokeboxId: 0,
  pokeboxLastDateTime: 0,
  xls: true,
  rankingDetails: 'one-page',
  hardMovesetLinks: 0,
  colorblindMode: 0,
  performanceMode: 0,
  theme: 'default',
};
var InterfaceMaster = {
  getInstance: function () {
    return { init: function () {} };
  },
  getInterface: function () {
    return {};
  },
};
function __noopChain() {
  var chain = {};
  var methods = ['insertAfter', 'eq', 'append', 'appendTo', 'find', 'html', 'text', 'attr', 'addClass', 'removeClass', 'show', 'hide', 'on', 'off', 'val', 'each', 'first', 'last', 'remove', 'empty', 'css', 'prop', 'toggleClass', 'trigger'];
  for (var i = 0; i < methods.length; i++) {
    chain[methods[i]] = function () {
      return chain;
    };
  }
  chain.length = 0;
  return chain;
}
var $ = function () {
  return __noopChain();
};
$.each = function (collection, fn) {
  if (Array.isArray(collection)) {
    for (var i = 0; i < collection.length; i++) {
      if (fn.call(collection[i], i, collection[i]) === false) {
        break;
      }
    }
  } else if (collection) {
    var keys = Object.keys(collection);
    for (var k = 0; k < keys.length; k++) {
      if (fn.call(collection[keys[k]], keys[k], collection[keys[k]]) === false) {
        break;
      }
    }
  }
  return collection;
};
$.ajax = function (opts) {
  if (opts && typeof opts.success === 'function') {
    opts.success(__PICKTHREE_GAMEMASTER__);
  }
};
$.getJSON = function (url, cb) {
  if (typeof cb === 'function') {
    cb([]);
  }
};
```

`packages/sim-pvpoke/src/exports-tail.js`:
```js
/* PickThree: expose the vendored classes on the global object so module code can reach them. */
globalThis.__pvpoke = {
  GameMaster: GameMaster,
  Battle: Battle,
  Pokemon: Pokemon,
  DamageCalculator: DamageCalculator,
  ActionLogic: ActionLogic,
};
```

- [ ] **Step 4: Implement bundle and node host**

`packages/sim-pvpoke/src/bundle.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR_FILES } from './vendor-order.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..');

/** Concatenate shim + vendored files + exports tail into one classic script. */
export function buildBundleSource(): string {
  const parts: string[] = [];
  parts.push(fs.readFileSync(path.join(here, 'globals-shim.js'), 'utf8'));
  for (const f of VENDOR_FILES) {
    parts.push(`\n/* ---- vendored: ${f.source} ---- */\n`);
    parts.push(fs.readFileSync(path.join(pkgDir, 'vendor', f.name), 'utf8'));
  }
  parts.push('\n');
  parts.push(fs.readFileSync(path.join(here, 'exports-tail.js'), 'utf8'));
  return parts.join('\n');
}

export function writeBundle(outFile: string): void {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buildBundleSource());
}
```

`packages/sim-pvpoke/src/node-host.ts`:
```ts
import vm from 'node:vm';
import { buildBundleSource } from './bundle.js';
import type { PvPokeBattle, PvPokeGameMaster, PvPokePokemon, PvPokeRuntime } from './types.js';

let cachedSource: string | null = null;

export function loadPvPokeInNode(gamemaster: unknown): PvPokeRuntime {
  if (cachedSource === null) {
    cachedSource = buildBundleSource();
  }
  // A fresh vm context has its own copy of every standard built-in. Do not pass Array, Map, Math
  // and friends from this realm: cross-realm instanceof checks would break inside the bundle.
  const sandbox: Record<string, unknown> = {
    console: { log: () => {}, error: console.error, warn: console.warn },
    __PICKTHREE_GAMEMASTER__: structuredClone(gamemaster),
  };
  const context = vm.createContext(sandbox);
  new vm.Script(cachedSource, { filename: 'pvpoke-bundle.js' }).runInContext(context);
  const exported = (context as { __pvpoke?: unknown }).__pvpoke as
    | { GameMaster: { getInstance(): PvPokeGameMaster }; Battle: new () => PvPokeBattle; Pokemon: new (id: string, index: number, battle: PvPokeBattle) => PvPokePokemon }
    | undefined;
  if (!exported) {
    throw new Error('PvPoke bundle did not export __pvpoke');
  }
  return { ...exported, gm: exported.GameMaster.getInstance() };
}
```

`packages/sim-pvpoke/src/types.ts` (structural types for the parts of PvPoke we call):
```ts
export interface PvPokeMove {
  moveId: string;
  name: string;
  category: 'fast' | 'charged';
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  cooldown: number;
  turns: number;
}

export interface PvPokeGameMaster {
  data: { pokemon: { speciesId: string }[]; moves: { moveId: string }[]; cups: { name: string }[] };
  rankings: Record<string, unknown>;
  getPokemonById(id: string): { speciesId: string; speciesName: string };
  getMoveById(id: string): PvPokeMove;
  getCupById(id: string): { name: string } | undefined;
}

export interface PvPokePokemon {
  speciesId: string;
  cp: number;
  hp: number;
  level: number;
  ivs: { atk: number; def: number; hp: number };
  stats: { atk: number; def: number; hp: number };
  shields: number;
  startingShields: number;
  startEnergy: number;
  fastMove: PvPokeMove;
  chargedMoves: PvPokeMove[];
  initialize(targetCP: number | false, defaultMode?: string): void;
  setIV(iv: 'atk' | 'def' | 'hp', amount: number): void;
  setLevel(level: number, initialize?: boolean): void;
  selectMove(type: 'fast' | 'charged', id: string, index?: number): void;
  setShields(amount: number): void;
  reset(): void;
  getBattleRating(): number;
}

export interface PvPokeBattle {
  setCP(cp: number): void;
  setLevelCap(cap: number): void;
  setCup(name: string): void;
  setNewPokemon(p: PvPokePokemon, index: 0 | 1, initialize: boolean): void;
  simulate(): unknown;
  getTurnsToWin(): [number, number];
  getBattleRatings(): [number, number];
  getTurns(): number;
}

export interface PvPokeRuntime {
  GameMaster: { getInstance(): PvPokeGameMaster };
  Battle: new () => PvPokeBattle;
  Pokemon: new (id: string, index: number, battle: PvPokeBattle) => PvPokePokemon;
  gm: PvPokeGameMaster;
}
```

`packages/sim-pvpoke/src/index.ts`:
```ts
export { buildBundleSource, writeBundle } from './bundle.js';
export { loadPvPokeInNode } from './node-host.js';
export type * from './types.js';
export { VENDOR_FILES } from './vendor-order.js';
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run --project sim-pvpoke`
Expected: PASS. Known failure modes and fixes:
- `ReferenceError: X is not defined` during bundle evaluation: a page global the shim lacks. Add it to `globals-shim.js`, never to the vendored file.
- `getTypeEffectivenessArray` errors: confirm `Pokemon.js` is vendored whole; that helper is defined inside it.
- IV expectation mismatch: print `azu.ivs` and compare with `defaultIVs.cp1500` in gamemaster.json for azumarill (`[43, 4, 15, 13]` means level 43, IVs 4/15/13).

- [ ] **Step 6: Commit**

```bash
git add packages/sim-pvpoke/src/globals-shim.js packages/sim-pvpoke/src/exports-tail.js packages/sim-pvpoke/src/bundle.ts packages/sim-pvpoke/src/node-host.ts packages/sim-pvpoke/src/types.ts packages/sim-pvpoke/src/index.ts packages/sim-pvpoke/test/node-host.test.ts
git commit -m "Load the vendored PvPoke simulator in a Node vm context behind a globals shim"
```

---

### Task 7: BattleSimulator interface and the PvPoke adapter with a golden fidelity test

**Files:**
- Create: `packages/engine/src/sim/BattleSimulator.ts`
- Modify: `packages/engine/src/index.ts`
- Create: `packages/sim-pvpoke/src/PvPokeSimulator.ts`
- Modify: `packages/sim-pvpoke/src/index.ts`
- Test: `packages/sim-pvpoke/test/simulator.test.ts`, `packages/sim-pvpoke/test/golden.test.ts`

**Interfaces:**
- Produces in engine:

```ts
export interface SimPokemonSpec {
  speciesId: string;
  fastMove: string;
  chargedMoves: string[];          // 1 or 2 ids
  ivs?: { atk: number; def: number; sta: number };
  level?: number;                  // required when ivs given
  shields: number;                 // 0..2
  startEnergyTurns?: number;       // PvPoke scenario "energy": turns of fast-move advantage, default 0
}
export interface SimOptions { cp: number; levelCap: number }
export interface SimResult {
  rating: number;        // 0..1000 battle rating for spec A (PvPoke formula)
  opRating: number;      // for spec B
  winner: 0 | 1 | null;
  turnsToWin: [number, number];
}
export interface BattleSimulator {
  simulate(a: SimPokemonSpec, b: SimPokemonSpec, opts: SimOptions): SimResult;
}
```

- Produces in sim-pvpoke: `class PvPokeSimulator implements BattleSimulator` with `constructor(runtime: PvPokeRuntime)`.

The adapter mirrors PvPoke's `Ranker.rank` call order exactly: `setNewPokemon(p, i, false)`, `reset()`, `setShields()`, assign `startEnergy` with the same fast-move-count formula, `simulate()`, then rating from `getBattleRating()`.

- [ ] **Step 1: Interface in engine**

`packages/engine/src/sim/BattleSimulator.ts`: the block above, plus:
```ts
export const GREAT_LEAGUE: SimOptions = { cp: 1500, levelCap: 50 };
```

Add `export * from './sim/BattleSimulator.js';` to `packages/engine/src/index.ts`.

- [ ] **Step 2: Write the failing unit test**

`packages/sim-pvpoke/test/simulator.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GREAT_LEAGUE } from '@pickthree/engine';
import { loadPvPokeInNode } from '../src/node-host.js';
import { PvPokeSimulator } from '../src/PvPokeSimulator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const gmPath = path.resolve(here, '..', '..', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json');
const havePvPoke = fs.existsSync(gmPath);

describe.skipIf(!havePvPoke)('PvPokeSimulator', () => {
  const rt = loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8')));
  const sim = new PvPokeSimulator(rt);
  const azu = { speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'], shields: 1 };
  const altaria = { speciesId: 'altaria', fastMove: 'DRAGON_BREATH', chargedMoves: ['MOONBLAST', 'FLAMETHROWER'], shields: 1 };

  it('is deterministic and symmetric', () => {
    const r1 = sim.simulate(azu, altaria, GREAT_LEAGUE);
    const r2 = sim.simulate(azu, altaria, GREAT_LEAGUE);
    expect(r1).toEqual(r2);
    const flipped = sim.simulate(altaria, azu, GREAT_LEAGUE);
    expect(flipped.rating).toBe(r1.opRating);
    expect(flipped.opRating).toBe(r1.rating);
  });

  it('ratings sum close to 1000 and pick a winner', () => {
    const r = sim.simulate(azu, altaria, GREAT_LEAGUE);
    expect(r.rating + r.opRating).toBeGreaterThanOrEqual(998);
    expect(r.rating + r.opRating).toBeLessThanOrEqual(1000);
    expect(r.winner).toBe(r.rating > r.opRating ? 0 : 1);
  });

  it('honors explicit IVs and level', () => {
    const rankOne = { ...azu, ivs: { atk: 4, def: 15, sta: 13 }, level: 43 };
    const zeroIv = { ...azu, ivs: { atk: 0, def: 0, sta: 0 }, level: 45 };
    const a = sim.simulate(rankOne, altaria, GREAT_LEAGUE);
    const b = sim.simulate(zeroIv, altaria, GREAT_LEAGUE);
    expect(a.rating).not.toBe(b.rating);
  });

  it('applies shield counts', () => {
    const noShields = sim.simulate({ ...azu, shields: 0 }, { ...altaria, shields: 0 }, GREAT_LEAGUE);
    const twoShields = sim.simulate({ ...azu, shields: 2 }, { ...altaria, shields: 2 }, GREAT_LEAGUE);
    expect(noShields.rating).not.toBe(twoShields.rating);
  });

  it('rejects unknown species and moves loudly', () => {
    expect(() => sim.simulate({ ...azu, speciesId: 'nope' }, altaria, GREAT_LEAGUE)).toThrow(/nope/);
    expect(() => sim.simulate({ ...azu, fastMove: 'NOPE' }, altaria, GREAT_LEAGUE)).toThrow(/NOPE/);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run --project sim-pvpoke`
Expected: FAIL, `PvPokeSimulator` missing.

- [ ] **Step 4: Implement the adapter**

`packages/sim-pvpoke/src/PvPokeSimulator.ts`:
```ts
import type { BattleSimulator, SimOptions, SimPokemonSpec, SimResult } from '@pickthree/engine';
import type { PvPokeBattle, PvPokePokemon, PvPokeRuntime } from './types.js';

export class PvPokeSimulator implements BattleSimulator {
  private readonly rt: PvPokeRuntime;

  constructor(runtime: PvPokeRuntime) {
    this.rt = runtime;
  }

  simulate(a: SimPokemonSpec, b: SimPokemonSpec, opts: SimOptions): SimResult {
    const battle = new this.rt.Battle();
    battle.setCP(opts.cp);
    battle.setLevelCap(opts.levelCap);
    battle.setCup('all');

    const p0 = this.buildPokemon(a, 0, battle, opts);
    const p1 = this.buildPokemon(b, 1, battle, opts);

    battle.setNewPokemon(p0, 0, false);
    battle.setNewPokemon(p1, 1, false);
    p0.reset();
    p1.reset();
    p0.setShields(a.shields);
    p1.setShields(b.shields);
    p0.startEnergy = startEnergyFor(p0, a.startEnergyTurns ?? 0);
    p1.startEnergy = startEnergyFor(p1, b.startEnergyTurns ?? 0);

    battle.simulate();

    const rating = p0.getBattleRating();
    const opRating = p1.getBattleRating();
    let winner: 0 | 1 | null = null;
    if (rating > opRating) {
      winner = 0;
    } else if (opRating > rating) {
      winner = 1;
    }
    return { rating, opRating, winner, turnsToWin: battle.getTurnsToWin() };
  }

  private buildPokemon(spec: SimPokemonSpec, index: 0 | 1, battle: PvPokeBattle, opts: SimOptions): PvPokePokemon {
    if (!this.rt.gm.getPokemonById(spec.speciesId)) {
      throw new Error(`Unknown speciesId: ${spec.speciesId}`);
    }
    const p = new this.rt.Pokemon(spec.speciesId, index, battle);
    if (spec.ivs) {
      if (spec.level === undefined) {
        throw new Error(`level is required when ivs are given (${spec.speciesId})`);
      }
      p.setIV('atk', spec.ivs.atk);
      p.setIV('def', spec.ivs.def);
      p.setIV('hp', spec.ivs.sta);
      p.setLevel(spec.level, true);
    } else {
      p.initialize(opts.cp);
    }
    this.selectMoves(p, spec);
    return p;
  }

  private selectMoves(p: PvPokePokemon, spec: SimPokemonSpec): void {
    assertMove(this.rt, spec.fastMove);
    p.selectMove('fast', spec.fastMove);
    const charged = spec.chargedMoves;
    if (charged.length === 0 || charged.length > 2) {
      throw new Error(`chargedMoves must have 1 or 2 entries (${spec.speciesId})`);
    }
    charged.forEach((id, i) => {
      assertMove(this.rt, id);
      p.selectMove('charged', id, i);
    });
    if (charged.length === 1) {
      p.selectMove('charged', 'none', 1);
    }
  }
}

function assertMove(rt: PvPokeRuntime, id: string): void {
  if (!rt.gm.data.moves.some((m) => m.moveId === id)) {
    throw new Error(`Unknown moveId: ${id}`);
  }
}

/** PvPoke Ranker: energy advantage expressed as turns; converted to fast-move count then energy. */
function startEnergyFor(p: PvPokePokemon, turns: number): number {
  if (turns === 0) {
    return 0;
  }
  let fastMoveCount = Math.floor((turns * 500) / p.fastMove.cooldown);
  if (fastMoveCount === 0) {
    fastMoveCount = 1;
  }
  return Math.min(p.fastMove.energyGain * fastMoveCount, 100);
}
```

Add `export { PvPokeSimulator } from './PvPokeSimulator.js';` to `packages/sim-pvpoke/src/index.ts`.

- [ ] **Step 5: Run unit tests**

Run: `npx vitest run --project sim-pvpoke`
Expected: PASS. If `getBattleRating` returns 0, the battle's opponent lookup failed: confirm `setNewPokemon` was called for both indices before `simulate`.

- [ ] **Step 6: Write the golden test**

The `leads` ranking file is a pure scenario: shields 1-1, energy 0-0. Its `matchups[].rating` and `counters[].rating` are raw battle ratings from this same simulator with default IVs and the movesets from `effectiveMoveset`. Reproducing them proves the vendoring is faithful.

`packages/sim-pvpoke/test/golden.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GREAT_LEAGUE } from '@pickthree/engine';
import type { MovesetOverride, RankingEntry } from '@pickthree/engine';
import { loadPvPokeInNode } from '../src/node-host.js';
import { PvPokeSimulator } from '../src/PvPokeSimulator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pvpoke = process.env.PICKTHREE_PVPOKE_DIR ?? path.resolve(here, '..', '..', 'data', '.pvpoke');
const dataDir = path.join(pvpoke, 'src', 'data');
const havePvPoke = fs.existsSync(path.join(dataDir, 'gamemaster.json'));

interface RawRanking {
  speciesId: string;
  moves: { fastMoves: { moveId: string }[]; chargedMoves: { moveId: string }[] };
  matchups: { opponent: string; rating: number }[];
  counters: { opponent: string; rating: number }[];
}

function effectiveMoveset(id: string, rankings: RawRanking[], overrides: MovesetOverride[]): string[] {
  const e = rankings.find((r) => r.speciesId === id);
  if (!e) {
    throw new Error(`no ranking for ${id}`);
  }
  let fast = e.moves.fastMoves[0]?.moveId ?? '';
  let charged = e.moves.chargedMoves.slice(0, 2).map((m) => m.moveId);
  const o = overrides.find((x) => x.speciesId === id);
  if (o?.fastMove) {
    fast = o.fastMove;
  }
  if (o?.chargedMoves) {
    charged = [...o.chargedMoves];
  }
  return [fast, ...charged];
}

describe.skipIf(!havePvPoke)('golden: reproduce PvPoke leads matchup ratings', () => {
  const gm = JSON.parse(fs.readFileSync(path.join(dataDir, 'gamemaster.json'), 'utf8')) as unknown;
  const leads = JSON.parse(fs.readFileSync(path.join(dataDir, 'rankings', 'all', 'leads', 'rankings-1500.json'), 'utf8')) as RawRanking[];
  const overrides = JSON.parse(fs.readFileSync(path.join(dataDir, 'overrides', 'all', '1500.json'), 'utf8')) as MovesetOverride[];
  const sim = new PvPokeSimulator(loadPvPokeInNode(gm));

  function spec(id: string): { speciesId: string; fastMove: string; chargedMoves: string[]; shields: number } {
    const [fast, ...charged] = effectiveMoveset(id, leads, overrides);
    return { speciesId: id, fastMove: fast ?? '', chargedMoves: charged, shields: 1 };
  }

  it('matches published ratings for the top 60 ranked species (>= 90% exact, all within 25)', () => {
    const sample = leads.slice(0, 60);
    let total = 0;
    let exact = 0;
    const misses: string[] = [];
    for (const entry of sample) {
      for (const m of [...entry.matchups, ...entry.counters]) {
        const r = sim.simulate(spec(entry.speciesId), spec(m.opponent), GREAT_LEAGUE);
        total += 1;
        if (r.rating === m.rating) {
          exact += 1;
        } else {
          misses.push(`${entry.speciesId} vs ${m.opponent}: got ${r.rating}, published ${m.rating}`);
        }
        expect(Math.abs(r.rating - m.rating), `${entry.speciesId} vs ${m.opponent}`).toBeLessThanOrEqual(25);
      }
    }
    if (misses.length > 0) {
      console.log(`golden misses (${misses.length}/${total}):\n${misses.join('\n')}`);
    }
    expect(exact / total).toBeGreaterThanOrEqual(0.9);
  });

  it('matches azumarill vs altaria exactly', () => {
    const azu = leads.find((r) => r.speciesId === 'azumarill');
    const published = azu?.matchups.find((m) => m.opponent === 'altaria')?.rating;
    expect(published).toBeDefined();
    const r = sim.simulate(spec('azumarill'), spec('altaria'), GREAT_LEAGUE);
    expect(r.rating).toBe(published);
  });
});
```

- [ ] **Step 7: Run the golden test**

Run: `npx vitest run --project sim-pvpoke test/golden.test.ts`
Expected: PASS. Diagnosing misses, in order:
1. All ratings off by a constant or all wildly off: shield or energy setup differs from Ranker (check `reset()` before `setShields`, `startEnergy` assignment after).
2. A few species off: their moveset differs from what PvPoke used (usage order vs override); print both and compare with the published `moveset` field; if `moveset` matches better than `moves.*[0]`, prefer `moveset` in `effectiveMoveset` and mirror the change in `packages/data/src/build-rankings.ts`.
3. Off for shadows only: confirm `setShadowType('shadow')` fired (species tag `shadow`); the adapter must not strip `_shadow` from ids.
Adjust the tolerance thresholds only with a written reason in the test.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/sim/BattleSimulator.ts packages/engine/src/index.ts packages/sim-pvpoke/src/PvPokeSimulator.ts packages/sim-pvpoke/src/index.ts packages/sim-pvpoke/test/simulator.test.ts packages/sim-pvpoke/test/golden.test.ts
git commit -m "Add BattleSimulator interface and PvPoke adapter with golden fidelity test"
```

---

### Task 8: Hand-maintained tables: CP multipliers, power-up costs, second move

**Files:**
- Create: `packages/engine/src/tables/cpm.ts`, `packages/engine/src/tables/powerup.ts`, `packages/engine/src/tables/secondMove.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/tables/cpm.test.ts`, `packages/engine/test/tables/powerup.test.ts`, `packages/engine/test/tables/secondMove.test.ts`

**Interfaces:**
- Produces: `cpmForLevel(level: number): number` (levels 1 to 51 in 0.5 steps), `CPM: readonly number[]` (index = (level-1)*2), `powerUpCost(level: number): PowerUpStep`, `costToLevel(from: number, to: number, mods: CostModifiers): PowerUpTotal`, `secondMoveCost(thirdMoveCost: number, mods: CostModifiers): { stardust: number; candy: number }`.

```ts
export interface CostModifiers { shadow: boolean; purified: boolean; lucky: boolean }
export interface PowerUpStep { stardust: number; candy: number; xlCandy: number }
export interface PowerUpTotal { stardust: number; candy: number; xlCandy: number; steps: number }
```

- [ ] **Step 1: Write the failing tests**

`packages/engine/test/tables/cpm.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CPM, cpmForLevel } from '../../src/tables/cpm.js';

describe('CP multipliers', () => {
  it('has 101 entries for levels 1 to 51', () => {
    expect(CPM.length).toBe(101);
  });
  it('matches known anchors', () => {
    expect(cpmForLevel(1)).toBeCloseTo(0.094, 6);
    expect(cpmForLevel(20)).toBeCloseTo(0.5974, 4);
    expect(cpmForLevel(40)).toBeCloseTo(0.7903, 4);
    expect(cpmForLevel(50)).toBeCloseTo(0.8403, 4);
    expect(cpmForLevel(51)).toBeCloseTo(0.8653, 4);
  });
  it('rejects levels off the half-step grid', () => {
    expect(() => cpmForLevel(20.25)).toThrow();
    expect(() => cpmForLevel(0.5)).toThrow();
    expect(() => cpmForLevel(52)).toThrow();
  });
});
```

`packages/engine/test/tables/powerup.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { costToLevel, powerUpCost } from '../../src/tables/powerup.js';

const none = { shadow: false, purified: false, lucky: false };

describe('power-up costs', () => {
  it('level 20 to 40 costs 225,000 stardust and 246 candy', () => {
    expect(costToLevel(20, 40, none)).toEqual({ stardust: 225_000, candy: 246, xlCandy: 0, steps: 40 });
  });
  it('level 1 to 40 costs 270,000 stardust', () => {
    expect(costToLevel(1, 40, none).stardust).toBe(270_000);
  });
  it('level 40 to 50 costs 310,000 stardust and 296 XL candy, no regular candy', () => {
    expect(costToLevel(40, 50, none)).toEqual({ stardust: 310_000, candy: 0, xlCandy: 296, steps: 20 });
  });
  it('a single step at level 39.5 costs 10,000 and 15 candy', () => {
    expect(powerUpCost(39.5)).toEqual({ stardust: 10_000, candy: 15, xlCandy: 0 });
  });
  it('shadow multiplies stardust and candy by 1.2, rounding up per step', () => {
    const r = costToLevel(39, 40, { ...none, shadow: true });
    expect(r.stardust).toBe(24_000);
    expect(r.candy).toBe(36);
  });
  it('purified multiplies by 0.9 and lucky halves stardust', () => {
    expect(costToLevel(39, 40, { ...none, purified: true })).toMatchObject({ stardust: 18_000, candy: 28 });
    expect(costToLevel(39, 40, { ...none, lucky: true })).toMatchObject({ stardust: 10_000, candy: 30 });
  });
  it('no cost when already at or above target', () => {
    expect(costToLevel(30, 30, none)).toEqual({ stardust: 0, candy: 0, xlCandy: 0, steps: 0 });
    expect(costToLevel(35, 30, none)).toEqual({ stardust: 0, candy: 0, xlCandy: 0, steps: 0 });
  });
});
```

`packages/engine/test/tables/secondMove.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { secondMoveCost } from '../../src/tables/secondMove.js';

const none = { shadow: false, purified: false, lucky: false };

describe('second charged move unlock', () => {
  it('maps PvPoke thirdMoveCost tiers to candy', () => {
    expect(secondMoveCost(10_000, none)).toEqual({ stardust: 10_000, candy: 25 });
    expect(secondMoveCost(50_000, none)).toEqual({ stardust: 50_000, candy: 50 });
    expect(secondMoveCost(75_000, none)).toEqual({ stardust: 75_000, candy: 75 });
    expect(secondMoveCost(100_000, none)).toEqual({ stardust: 100_000, candy: 100 });
  });
  it('shadow costs 1.2x, purified 0.8x', () => {
    expect(secondMoveCost(50_000, { ...none, shadow: true })).toEqual({ stardust: 60_000, candy: 60 });
    expect(secondMoveCost(50_000, { ...none, purified: true })).toEqual({ stardust: 40_000, candy: 40 });
  });
  it('rejects unknown tiers', () => {
    expect(() => secondMoveCost(12_345, none)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --project engine`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`packages/engine/src/tables/cpm.ts`. The 101 values are the public CP multiplier table (levels 1 to 51 in half steps). Copy the array from the vendored `Pokemon.js` (`var cpms = [...]`) so both sides agree, and add a comment: `// Source: Pokemon GO game master CPM table; identical to PvPoke Pokemon.js cpms at the pinned commit.`

```ts
export const CPM: readonly number[] = [
  0.0939999967813491, 0.135137430784308, 0.166397869586944, 0.192650914456886, 0.215732470154762,
  // ... all 101 values, copied verbatim from vendor/Pokemon.js ...
  0.865299999713897,
];

export function cpmForLevel(level: number): number {
  const index = (level - 1) * 2;
  if (!Number.isInteger(index) || index < 0 || index >= CPM.length) {
    throw new RangeError(`level must be 1..51 in 0.5 steps, got ${level}`);
  }
  return CPM[index] as number;
}
```

Write the full array out; the elided comment above is only to keep this plan readable.

`packages/engine/src/tables/powerup.ts`:
```ts
export interface CostModifiers {
  shadow: boolean;
  purified: boolean;
  lucky: boolean;
}

export interface PowerUpStep {
  stardust: number;
  candy: number;
  xlCandy: number;
}

export interface PowerUpTotal extends PowerUpStep {
  steps: number;
}

/** Cost of one half-level power-up starting at `fromLevel`. Source: Pokemon GO power-up table (2026). */
const BRACKETS: { from: number; stardust: number; candy: number; xl: number }[] = [
  { from: 1, stardust: 200, candy: 1, xl: 0 },
  { from: 3, stardust: 400, candy: 1, xl: 0 },
  { from: 5, stardust: 600, candy: 1, xl: 0 },
  { from: 7, stardust: 800, candy: 1, xl: 0 },
  { from: 9, stardust: 1000, candy: 1, xl: 0 },
  { from: 11, stardust: 1300, candy: 2, xl: 0 },
  { from: 13, stardust: 1600, candy: 2, xl: 0 },
  { from: 15, stardust: 1900, candy: 2, xl: 0 },
  { from: 17, stardust: 2200, candy: 2, xl: 0 },
  { from: 19, stardust: 2500, candy: 2, xl: 0 },
  { from: 21, stardust: 3000, candy: 3, xl: 0 },
  { from: 23, stardust: 3500, candy: 3, xl: 0 },
  { from: 25, stardust: 4000, candy: 3, xl: 0 },
  { from: 27, stardust: 4500, candy: 4, xl: 0 },
  { from: 29, stardust: 5000, candy: 4, xl: 0 },
  { from: 31, stardust: 6000, candy: 6, xl: 0 },
  { from: 33, stardust: 7000, candy: 8, xl: 0 },
  { from: 35, stardust: 8000, candy: 10, xl: 0 },
  { from: 37, stardust: 9000, candy: 12, xl: 0 },
  { from: 39, stardust: 10000, candy: 15, xl: 0 },
  { from: 40, stardust: 11000, candy: 0, xl: 10 },
  { from: 41, stardust: 12000, candy: 0, xl: 10 },
  { from: 42, stardust: 13000, candy: 0, xl: 12 },
  { from: 43, stardust: 14000, candy: 0, xl: 12 },
  { from: 44, stardust: 15000, candy: 0, xl: 15 },
  { from: 45, stardust: 16000, candy: 0, xl: 15 },
  { from: 46, stardust: 17000, candy: 0, xl: 17 },
  { from: 47, stardust: 18000, candy: 0, xl: 17 },
  { from: 48, stardust: 19000, candy: 0, xl: 20 },
  { from: 49, stardust: 20000, candy: 0, xl: 20 },
];

export function powerUpCost(fromLevel: number): PowerUpStep {
  if (fromLevel < 1 || fromLevel >= 50 || !Number.isInteger(fromLevel * 2)) {
    throw new RangeError(`power-up from level must be 1..49.5 in 0.5 steps, got ${fromLevel}`);
  }
  let bracket = BRACKETS[0] as (typeof BRACKETS)[number];
  for (const b of BRACKETS) {
    if (fromLevel >= b.from) {
      bracket = b;
    }
  }
  return { stardust: bracket.stardust, candy: bracket.candy, xlCandy: bracket.xl };
}

function applyMods(step: PowerUpStep, mods: CostModifiers): PowerUpStep {
  let dustMult = 1;
  let candyMult = 1;
  if (mods.shadow) {
    dustMult *= 1.2;
    candyMult *= 1.2;
  } else if (mods.purified) {
    dustMult *= 0.9;
    candyMult *= 0.9;
  }
  if (mods.lucky) {
    dustMult *= 0.5;
  }
  return {
    stardust: Math.ceil(step.stardust * dustMult),
    candy: Math.ceil(step.candy * candyMult),
    xlCandy: Math.ceil(step.xlCandy * candyMult),
  };
}

export function costToLevel(from: number, to: number, mods: CostModifiers): PowerUpTotal {
  const total: PowerUpTotal = { stardust: 0, candy: 0, xlCandy: 0, steps: 0 };
  if (to <= from) {
    return total;
  }
  for (let level = from; level < to; level += 0.5) {
    const step = applyMods(powerUpCost(level), mods);
    total.stardust += step.stardust;
    total.candy += step.candy;
    total.xlCandy += step.xlCandy;
    total.steps += 1;
  }
  return total;
}
```

`packages/engine/src/tables/secondMove.ts`:
```ts
import type { CostModifiers } from './powerup.js';

const TIERS: Record<number, number> = { 10000: 25, 50000: 50, 75000: 75, 100000: 100 };

export function secondMoveCost(thirdMoveCost: number, mods: CostModifiers): { stardust: number; candy: number } {
  const candy = TIERS[thirdMoveCost];
  if (candy === undefined) {
    throw new RangeError(`Unknown second move cost tier: ${thirdMoveCost}`);
  }
  let mult = 1;
  if (mods.shadow) {
    mult = 1.2;
  } else if (mods.purified) {
    mult = 0.8;
  }
  return { stardust: Math.round(thirdMoveCost * mult), candy: Math.round(candy * mult) };
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './tables/cpm.js';
export * from './tables/powerup.js';
export * from './tables/secondMove.js';
```

- [ ] **Step 4: Add a drift test against the vendored CPM array**

Append to `packages/engine/test/tables/cpm.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const vendored = path.resolve(here, '..', '..', '..', 'sim-pvpoke', 'vendor', 'Pokemon.js');

describe.skipIf(!fs.existsSync(vendored))('CPM matches vendored PvPoke table', () => {
  it('is identical', () => {
    const src = fs.readFileSync(vendored, 'utf8');
    const match = /var cpms = \[([^\]]+)\]/.exec(src);
    expect(match).not.toBeNull();
    const theirs = (match as RegExpExecArray)[1]!.split(',').map((s) => Number(s.trim()));
    expect(CPM).toEqual(theirs);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run --project engine`
Expected: PASS. If the shadow rounding test disagrees by 1 candy, check whether the game rounds per step (this implementation) or on the total; per step is correct in game.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/tables packages/engine/src/index.ts packages/engine/test/tables
git commit -m "Add CP multiplier, power-up and second move cost tables with tests"
```

---

### Task 9: Matchup matrix builder

**Files:**
- Create: `packages/data/src/build-matrix.ts`
- Test: `packages/data/test/build-matrix.test.ts`

**Interfaces:**
- Consumes: `PvPokeSimulator`, `loadPvPokeInNode` from `@pickthree/sim-pvpoke`; `readGreatRankings`, `readGreatMeta`, `readGreatOverrides`, `effectiveMoveset` from Task 4; `MatchupMatrix`, `matrixIndex` from engine.
- Produces: `buildMatrix(input: MatrixInput): MatchupMatrix` (pure given a simulator) and `writeMatrix(outDir)`.

```ts
export interface MatrixInput {
  sim: BattleSimulator;
  candidates: { speciesId: string; moveset: string[] }[];
  opponents: { speciesId: string; moveset: string[] }[];
  scenarios: { shields: [number, number]; energy: [number, number] }[];
  onProgress?: (done: number, total: number) => void;
}
```

Scenarios: `[[0,0],[1,1],[2,2]]` shields, energy `[0,0]`. Ratings stored as integers in candidate-major order per `matrixIndex`.

- [ ] **Step 1: Write the failing test**

`packages/data/test/build-matrix.test.ts`:
```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GREAT_LEAGUE, matrixIndex } from '@pickthree/engine';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { buildMatrix, MATRIX_SCENARIOS } from '../src/build-matrix.js';
import { GAMEMASTER_PATH } from '../src/paths.js';

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);

describe.skipIf(!havePvPoke)('buildMatrix', () => {
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8'))));
  const candidates = [
    { speciesId: 'azumarill', moveset: ['BUBBLE', 'ICE_BEAM', 'PLAY_ROUGH'] },
    { speciesId: 'medicham', moveset: ['COUNTER', 'ICE_PUNCH', 'PSYCHIC'] },
    { speciesId: 'altaria', moveset: ['DRAGON_BREATH', 'MOONBLAST', 'FLAMETHROWER'] },
  ];
  const opponents = [
    { speciesId: 'altaria', moveset: ['DRAGON_BREATH', 'MOONBLAST', 'FLAMETHROWER'] },
    { speciesId: 'tinkaton', moveset: ['FAIRY_WIND', 'GIGATON_HAMMER', 'BULLDOZE'] },
  ];

  it('has the right dimensions and index layout', () => {
    const m = buildMatrix({ sim, candidates, opponents, scenarios: MATRIX_SCENARIOS });
    expect(m.candidates).toEqual(['azumarill', 'medicham', 'altaria']);
    expect(m.opponents).toEqual(['altaria', 'tinkaton']);
    expect(m.scenarios.length).toBe(3);
    expect(m.ratings.length).toBe(3 * 2 * 3);
    expect(m.candidateMovesets['medicham']).toEqual(['COUNTER', 'ICE_PUNCH', 'PSYCHIC']);
  });

  it('cells equal a direct simulation', () => {
    const m = buildMatrix({ sim, candidates, opponents, scenarios: MATRIX_SCENARIOS });
    const direct = sim.simulate(
      { speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'], shields: 1 },
      { speciesId: 'altaria', fastMove: 'DRAGON_BREATH', chargedMoves: ['MOONBLAST', 'FLAMETHROWER'], shields: 1 },
      GREAT_LEAGUE,
    );
    expect(m.ratings[matrixIndex(m, 0, 0, 1)]).toBe(direct.rating);
  });

  it('mirror matchups score 500 in symmetric scenarios', () => {
    const m = buildMatrix({ sim, candidates, opponents, scenarios: MATRIX_SCENARIOS });
    expect(m.ratings[matrixIndex(m, 2, 0, 1)]).toBe(500);
  });

  it('reports progress', () => {
    const seen: number[] = [];
    buildMatrix({ sim, candidates, opponents, scenarios: MATRIX_SCENARIOS, onProgress: (d) => seen.push(d) });
    expect(seen.at(-1)).toBe(3 * 2 * 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project data test/build-matrix.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Add the simulator dependency and implement**

Add `"@pickthree/sim-pvpoke": "0.0.0"` to `dependencies` in `packages/data/package.json`, add `"../sim-pvpoke/src/**/*.ts"` to the `include` list in `packages/data/tsconfig.json`, and run `npm install`.

`packages/data/src/build-matrix.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import type { BattleSimulator, MatchupMatrix } from '@pickthree/engine';
import { GREAT_LEAGUE, matrixIndex } from '@pickthree/engine';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { readRawGameMaster } from './build-gamedata.js';
import { effectiveMoveset, readGreatMeta, readGreatOverrides, readGreatRankings } from './build-rankings.js';

export const MATRIX_SCENARIOS: { shields: [number, number]; energy: [number, number] }[] = [
  { shields: [0, 0], energy: [0, 0] },
  { shields: [1, 1], energy: [0, 0] },
  { shields: [2, 2], energy: [0, 0] },
];

export interface MatrixInput {
  sim: BattleSimulator;
  candidates: { speciesId: string; moveset: string[] }[];
  opponents: { speciesId: string; moveset: string[] }[];
  scenarios: { shields: [number, number]; energy: [number, number] }[];
  onProgress?: (done: number, total: number) => void;
}

export function buildMatrix(input: MatrixInput): MatchupMatrix {
  const m: MatchupMatrix = {
    league: 'great',
    cp: GREAT_LEAGUE.cp,
    scenarios: input.scenarios.map((s) => ({ shields: s.shields, energy: s.energy })),
    candidates: input.candidates.map((c) => c.speciesId),
    opponents: input.opponents.map((o) => o.speciesId),
    candidateMovesets: Object.fromEntries(input.candidates.map((c) => [c.speciesId, [...c.moveset]])),
    opponentMovesets: Object.fromEntries(input.opponents.map((o) => [o.speciesId, [...o.moveset]])),
    ratings: new Array<number>(input.candidates.length * input.opponents.length * input.scenarios.length).fill(0),
  };
  const total = m.ratings.length;
  let done = 0;
  input.candidates.forEach((c, ci) => {
    input.opponents.forEach((o, oi) => {
      input.scenarios.forEach((s, si) => {
        const r = input.sim.simulate(
          { speciesId: c.speciesId, fastMove: c.moveset[0] ?? '', chargedMoves: c.moveset.slice(1), shields: s.shields[0], startEnergyTurns: s.energy[0] },
          { speciesId: o.speciesId, fastMove: o.moveset[0] ?? '', chargedMoves: o.moveset.slice(1), shields: s.shields[1], startEnergyTurns: s.energy[1] },
          GREAT_LEAGUE,
        );
        m.ratings[matrixIndex(m, ci, oi, si)] = r.rating;
        done += 1;
        if (input.onProgress && (done % 500 === 0 || done === total)) {
          input.onProgress(done, total);
        }
      });
    });
  });
  return m;
}

export function writeMatrix(outDir: string): MatchupMatrix {
  const sim = new PvPokeSimulator(loadPvPokeInNode(readRawGameMaster()));
  const overall = readGreatRankings('overall');
  const overrides = readGreatOverrides();
  const candidates = overall.map((e) => ({ speciesId: e.speciesId, moveset: effectiveMoveset(e.speciesId, overall, overrides) }));
  const opponents = readGreatMeta().map((o) => ({ speciesId: o.speciesId, moveset: [o.fastMove, ...o.chargedMoves] }));
  const started = Date.now();
  const m = buildMatrix({
    sim,
    candidates,
    opponents,
    scenarios: MATRIX_SCENARIOS,
    onProgress: (d, t) => {
      process.stdout.write(`\rmatrix ${d}/${t} (${Math.round((Date.now() - started) / 1000)}s)`);
    },
  });
  process.stdout.write('\n');
  fs.mkdirSync(path.join(outDir, 'matrix'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'matrix', 'great.json'), JSON.stringify(m));
  return m;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run --project data test/build-matrix.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/build-matrix.ts packages/data/test/build-matrix.test.ts
git commit -m "Build the Great League candidates-vs-meta matchup matrix with the vendored simulator"
```

---

### Task 10: Build orchestration, manifest, refresh script, CI and docs

**Files:**
- Create: `packages/data/src/build-manifest.ts`, `packages/data/src/build.ts`, `packages/data/src/refresh.ts`
- Modify: `.github/workflows/ci.yml` (already runs `data:fetch`, `data:build`; add a cache for `.pvpoke`)
- Create: `.github/workflows/data-refresh.yml`
- Create: `docs/setup.md`, `docs/adr/001-vendor-pvpoke-verbatim.md`, `docs/adr/002-precomputed-matchup-matrix.md`
- Modify: `README.md` (data section)

**Interfaces:**
- Produces: `npm run data:build` writes `pokemon.json`, `moves.json`, `gamedata-meta.json`, `rankings/great/{overall,leads,switches,closers,chargers}.json`, `meta/great.json`, `overrides/great.json`, `matrix/great.json`, `vendor/pvpoke-sim.js`, `data-manifest.json` under `OUTPUT_DIR`.

- [ ] **Step 1: Manifest and build**

`packages/data/src/build-manifest.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import type { DataManifest } from '@pickthree/engine';
import { readLock } from './lock.js';

export interface ManifestArgs {
  gamemasterTimestamp: string;
  metaSize: number;
  matrix: { candidates: number; opponents: number; scenarios: number };
}

export function writeManifest(outDir: string, args: ManifestArgs): DataManifest {
  const lock = readLock();
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name !== 'data-manifest.json') {
        files.push(path.relative(outDir, p).split(path.sep).join('/'));
      }
    }
  };
  walk(outDir);
  const manifest: DataManifest = {
    pvpokeCommit: lock.commit,
    pvpokeDate: lock.date,
    gamemasterTimestamp: args.gamemasterTimestamp,
    builtAt: new Date().toISOString(),
    metaSize: args.metaSize,
    matrix: { ...args.matrix },
    files: files.sort(),
  };
  fs.writeFileSync(path.join(outDir, 'data-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
```

`packages/data/src/build.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { writeBundle } from '@pickthree/sim-pvpoke';
import { writeGameData } from './build-gamedata.js';
import { writeManifest } from './build-manifest.js';
import { writeMatrix } from './build-matrix.js';
import { writeRankings } from './build-rankings.js';
import { ensurePvPokeCheckout } from './fetch-pvpoke.js';
import { OUTPUT_DIR } from './paths.js';

async function main(): Promise<void> {
  await ensurePvPokeCheckout();
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const data = writeGameData(OUTPUT_DIR);
  console.log(`gamedata: ${data.species.length} species, ${data.moves.length} moves`);
  const { meta } = writeRankings(OUTPUT_DIR);
  console.log(`rankings: meta ${meta.length}`);
  let matrixCounts = { candidates: 0, opponents: 0, scenarios: 0 };
  if (process.env.PICKTHREE_SKIP_MATRIX !== '1') {
    const m = writeMatrix(OUTPUT_DIR);
    matrixCounts = { candidates: m.candidates.length, opponents: m.opponents.length, scenarios: m.scenarios.length };
  }
  writeBundle(path.join(OUTPUT_DIR, 'vendor', 'pvpoke-sim.js'));
  const manifest = writeManifest(OUTPUT_DIR, {
    gamemasterTimestamp: data.gamemasterTimestamp,
    metaSize: meta.length,
    matrix: matrixCounts,
  });
  console.log(`built ${manifest.files.length} files into ${OUTPUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

`packages/data/src/refresh.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { readLock, writeLock } from './lock.js';

const lock = readLock();
const out = execFileSync('git', ['ls-remote', lock.repository, 'HEAD'], { encoding: 'utf8' });
const head = out.split(/\s+/)[0] ?? '';
if (!/^[0-9a-f]{40}$/.test(head)) {
  throw new Error(`Could not resolve upstream HEAD: ${out}`);
}
if (head === lock.commit) {
  console.log(`already at upstream HEAD ${head.slice(0, 7)}`);
  process.exit(0);
}
writeLock({ ...lock, commit: head, date: new Date().toISOString().slice(0, 10) });
console.log(`bumped pvpoke.lock.json ${lock.commit.slice(0, 7)} -> ${head.slice(0, 7)}; run npm run data:fetch, vendor:sync, data:build, npm test`);
```

- [ ] **Step 2: Run the whole build once**

Run: `npm run data:build`
Expected: completes; matrix line reports ~165k sims. Record the wall time in `docs/setup.md`. Then `ls apps/web/public/data` shows the files listed in the interface above, and `data-manifest.json` names them. Run `gzip -k -9 apps/web/public/data/matrix/great.json && ls -la apps/web/public/data/matrix/` to record the gzipped size; delete the `.gz` afterwards. If gzipped size exceeds 1 MB, note it in ADR 002 as a follow-up (Int16 typed array encoding) rather than changing scope now.

- [ ] **Step 3: CI cache and refresh workflow**

In `.github/workflows/ci.yml`, insert before `npm run data:fetch`:
```yaml
      - name: Cache PvPoke checkout
        uses: actions/cache@v4
        with:
          path: packages/data/.pvpoke
          key: pvpoke-${{ hashFiles('packages/data/pvpoke.lock.json') }}
```
and set `PICKTHREE_SKIP_MATRIX: '1'` on the `data:build` step so CI stays under a few minutes; the matrix is built by the refresh workflow and locally.

`.github/workflows/data-refresh.yml`:
```yaml
name: data-refresh
on:
  schedule:
    - cron: '17 6 * * 1'
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - id: bump
        run: |
          before=$(node -p "require('./packages/data/pvpoke.lock.json').commit")
          npm run data:refresh
          after=$(node -p "require('./packages/data/pvpoke.lock.json').commit")
          echo "changed=$([ "$before" != "$after" ] && echo true || echo false)" >> "$GITHUB_OUTPUT"
          echo "after=$after" >> "$GITHUB_OUTPUT"
      - if: steps.bump.outputs.changed == 'true'
        run: |
          npm run data:fetch
          npm -w @pickthree/sim-pvpoke run vendor:sync
          PICKTHREE_REQUIRE_PVPOKE=1 npm test
          npm run data:build
      - if: steps.bump.outputs.changed == 'true'
        uses: peter-evans/create-pull-request@v7
        with:
          branch: data-refresh/${{ steps.bump.outputs.after }}
          title: 'Refresh PvPoke data to ${{ steps.bump.outputs.after }}'
          commit-message: 'Refresh PvPoke data to ${{ steps.bump.outputs.after }}'
          body: |
            Automated PvPoke refresh. Golden simulator tests passed against the new rankings.
            Review the vendor diff (if any) and the ranking movement before merging.
          add-paths: |
            packages/data/pvpoke.lock.json
            packages/sim-pvpoke/vendor/**
            packages/sim-pvpoke/LICENSE-pvpoke
```

Note: generated data under `apps/web/public/data/` is gitignored and rebuilt at deploy time (plan 3 adds the Pages workflow step), so the PR carries only the lock and vendored files.

- [ ] **Step 4: Docs**

`docs/setup.md`:
```markdown
# Setup

Requirements: Node 24.15 (fnm reads `.node-version`), npm 11, git.

    fnm use
    npm install
    npm run data:fetch       # clones PvPoke at the pinned commit into packages/data/.pvpoke
    npm test                 # engine, data, sim-pvpoke projects (golden test needs the checkout)
    npm run data:build       # writes apps/web/public/data (matrix takes about N minutes on a laptop)

Set `PICKTHREE_SKIP_MATRIX=1` to skip the matrix for a quick build.
Set `PICKTHREE_REQUIRE_PVPOKE=1` to fail instead of skip tests that need the checkout (CI does).

## Refreshing PvPoke

    npm run data:refresh                      # bumps pvpoke.lock.json to upstream HEAD
    npm run data:fetch
    npm -w @pickthree/sim-pvpoke run vendor:sync
    npm test                                  # golden test is the gate
    npm run data:build

The weekly `data-refresh` workflow does the same and opens a PR.
```

Replace `N` with the measured time from Step 2.

`docs/adr/001-vendor-pvpoke-verbatim.md`:
```markdown
# ADR 001: Vendor PvPoke's simulator verbatim behind a globals shim

Status: accepted, 2026-09-11

## Context
PvPoke's battle simulator (Battle.js, Pokemon.js, ActionLogic.js, DamageCalculator.js and friends) is
plain ES5/ES2015 script code with no jQuery or DOM use. Its only outside dependency is the GameMaster
singleton, whose getMoveById and generateFilteredPokemonList derive many fields we would otherwise
reimplement. GameMaster.js itself uses a handful of jQuery calls and page globals.

## Decision
Copy nine files byte-for-byte at a pinned commit (hash manifest enforced by test). Provide the page
globals and a jQuery subset in globals-shim.js. Concatenate into one classic script loaded in a Node vm
context (build, tests) and later a browser worker via importScripts. Expose a BattleSimulator adapter;
the engine depends only on that interface.

## Consequences
Upgrades are a lock bump plus vendor:sync, gated by a golden test that reproduces PvPoke's published
matchup ratings. No fork, no drift, no edits to upstream code. The bundle is a classic script, so the
web worker that hosts it must be a classic worker (or import the bundle before module code runs).
```

`docs/adr/002-precomputed-matchup-matrix.md`:
```markdown
# ADR 002: Precompute a candidates-vs-meta matchup matrix at data build time

Status: accepted, 2026-09-11

## Context
PvPoke ships only each species' five best and five worst matchups. Team search needs every candidate's
result against the whole meta, and a phone cannot simulate 1146 x 48 x 3 battles on import.

## Decision
The data build runs the vendored simulator in Node once per refresh and stores integer ratings for
every ranked Great League species versus PvPoke's meta group in three shield scenarios, at PvPoke's
default IVs and effective movesets. The app uses the matrix to prune candidates and rank trios; only
finalists are simulated on device with the player's actual IVs.

## Consequences
Matrix is opinionated by PvPoke's meta group and default IVs; results carry those assumptions.
Size: record measured gzipped size here. Follow-up if it grows: Int16 typed array encoding.
```

Add to `README.md` under Development: `See docs/setup.md. Game data comes from PvPoke at the commit pinned in packages/data/pvpoke.lock.json.`

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && PICKTHREE_REQUIRE_PVPOKE=1 npm test`
Expected: all green, no skipped suites.

- [ ] **Step 6: Commit and push**

```bash
git add packages/data/src/build-manifest.ts packages/data/src/build.ts packages/data/src/refresh.ts .github/workflows/ci.yml .github/workflows/data-refresh.yml docs/setup.md docs/adr README.md
git commit -m "Add data build orchestration, manifest, weekly refresh workflow and setup docs"
git push origin main
```

Watch the `ci` run on GitHub. Expected: green. GitHub permits `git fetch --depth 1 origin <sha>` for any reachable commit, so the fetch step should not fail; if it ever does, fetch the default branch shallowly first and then the sha.

---

## Self-review

**Spec coverage (sections 3, 5, 8.1 data, 8.3 CI, 9):**
- 3 repo shape: Task 1 (root), 2 (data), 5 (sim-pvpoke); `apps/web` and `fixtures/` belong to plans 3 and 2.
- 5.1 raw game data: Task 3. `cpm.json` is replaced by the typed table in Task 8, which is stricter than a JSON file and drift-tested against the vendored array.
- 5.2 rankings, meta, matrix: Tasks 4 and 9.
- 5.3 tables: Task 8 covers power-up, second move, CPM. Evolution candy table moves to plan 2 alongside species mapping, where the family list it must cover is known.
- 5.4 pinning and manifest: Tasks 2 and 10.
- 5.5 refresh: Task 10.
- 8.1 sim golden test: Task 7. Data pipeline tests: Tasks 3, 4, 9.
- 8.3 CI: Tasks 1 and 10 (Pages deploy arrives with the web app in plan 3).
- 9 licensing: Task 5 (LICENSE-pvpoke), ADR 001.

**Type consistency:** `SimPokemonSpec.ivs.sta` maps to PvPoke `setIV('hp')` in the adapter; `MatchupMatrix.ratings` indexed via `matrixIndex` in both builder and test; `effectiveMoveset` returns `[fast, ...charged]` and both the matrix builder and golden test destructure it that way; `PvPokeRuntime` shape in `types.ts` matches what `node-host.ts` returns.

**Deferred to plan 2 (engine):** evolution candy table, species mapping and overrides, CSV parsing, all recommendation stages. **Deferred to plan 3 (web):** Vite app, worker host that `importScripts` the bundle, IndexedDB, Pages deploy, Playwright.
