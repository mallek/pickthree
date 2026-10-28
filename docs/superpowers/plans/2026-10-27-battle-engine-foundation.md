# Battle Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `@pickthree/battle` package with game data extracted from the PokeMiners datamine (pinned, overridable, form mechanics from a hand-kept file) and a deterministic 1v1 battle rules engine, proven against the vendored PvPoke simulator by a rules exam (CI gate) and a data exam (report).

**Architecture:** `packages/battle` is pure TypeScript (no DOM, no Node, no PvPoke): compact data types, the rules engine, the mechanics vocabulary interpreter, the player interface, and a pure extraction function from datamine templates to the compact format. `packages/data` owns the I/O: datamine fetch and lock, YAML parsing of the hand-kept files, the `battle:build` step and the unmodelled-form alarm. The exam harness lives in `packages/data/src/exam/`: it converts PvPoke's game master into our compact format, runs both engines on the same scripted battles turn by turn, and judges mismatches against a known-differences list.

**Tech Stack:** TypeScript 5.9 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest 4, Node 24 global `fetch` and `node:crypto`, `yaml` 2.8.1 (new, packages/data only), Node `vm` for the PvPoke bundle.

**Spec:** `docs/superpowers/specs/2026-10-27-battle-engine-foundation-design.md` (committed 35621f5). Executors read both.

## Global Constraints

- Exact pinned versions in every package.json. No `^` or `~`. New dependency: `"yaml": "2.8.1"` in `packages/data` only.
- Braces on all control flow, even single-line bodies (`curly: all`).
- No em dashes anywhere: code, comments, docs, YAML, commit messages. Plain dash or rewrite.
- Warnings as errors; a flaky test is fixed at its root cause, never retried.
- Stage explicit paths. Never `git add -A`. Solo commits straight to main.
- `packages/battle` must not import or read anything from `sim-pvpoke` or `.pvpoke` (spec, Anti-goals). It also imports no Node built-ins and not `@pickthree/engine`.
- `packages/engine` must not import `@pickthree/battle` in this slice.
- No change to `apps/web` or to anything under `apps/web/public/data`. The battle data file goes to `packages/data/.battle/` (gitignored), never into the app's data.
- Vendored files under `packages/sim-pvpoke/vendor/` stay byte for byte. Runtime patching inside the vm context is allowed (spec, The exam).
- No PvPoke values pinned in tests. Logic tests use synthetic data; tests on live data assert invariants (spec, The exam, last paragraph).
- A special form is never an `if (speciesId == ...)` in the rules engine; it is a mechanics entry. If the vocabulary cannot express it, extend the vocabulary (spec, Anti-goals).
- Every override is visible, sourced and dated (spec, Anti-goals).
- Rules and decisions strictly apart: the rules engine never chooses; every choice goes through the `Player` interface or the `RandomSource` (spec, Goals).

## Review Focus

1. A species references an integer move id that no `combatMove` template defines: extraction must drop that move from the pool, keep the species, and return a warning naming both. (Task 10)
2. A player returns a charged move it cannot afford (energy short, or a slot that does not exist): the engine plays a fast move that turn, never goes negative on energy, never throws. (Task 6)
3. Both fast moves land the killing blow on the same turn: outcome `tie`, both HP 0, identical on every run. (Task 6)
4. The downloaded datamine does not match the lock's sha256 (truncated download, upstream force push): fetch refuses, deletes the partial file, and names expected and actual hashes. (Task 9)
5. An overrides entry is malformed (unknown id for `set`, existing id for `add`, missing `source`, `entered` not `YYYY-MM-DD`): the build fails with file, entry index and field in the message. (Task 11)

## Decisions this plan makes (for validate-plan)

Recon on 2026-10-27 against datamine commit `8e227be44f288d34463e23bf04e9b564d3c16f79` (dated 2026-08-29) and PvPoke `d98f521`:

- **Spec correction, Gulp Missile.** The spec says Gulp Missile "appears only as an unnamed move number (593)". Move 593 is Dive (`COMBAT_V0593_MOVE_DIVE`, `uniqueId: 593`). Gulp Missile is present as `COMBAT_V0594_MOVE_GULP_MISSILE_GULPING` (594, target Defense -1) and `COMBAT_V0595_MOVE_GULP_MISSILE_GORGING` (595, target Attack -2), with no `power` and no `energyDelta`. Nine moves use integer `uniqueId`s (Aura Wheel 406/407, Dive, Gulp Missiles, Dynamax Cannon, Plasma Fists, Glaive Rush, Snipe Shot) plus the Mega moves; extraction names them from their template ids. An override is still needed for Gulp Missile's damage.
- **Spec correction, Minior.** Minior's Core stats are present as `MINIOR_<COLOR>` forms (218/131/155); the Meteor stats are the formless base template (116/194/155). What the datamine lacks is the `ibfc` flag. Minior needs a mechanics entry, no species override.
- **Animation turns.** The `animate { turns: N }` effect freezes the battle for N turns after the turn in which it fires: the turn counter advances, nothing else happens (no cooldown tick, no decisions, no queued fast move resolves). The datamine's `animationDurationTurns: 5` feeds our mechanics file. PvPoke applies no turn cost (only Minior's 5000 ms of display time plus a cooldown reset), so this is an expected known difference. Recorded-battle evidence for the exact semantics is wanted.
- **Form stats.** `switchForm` keeps level, IVs, HP and stat stages and recomputes Attack and Defense from the new form's base stats. PvPoke maps Aegislash's level on form change (`Pokemon.js` `getFormStats`, Blade level `ceil(level * 0.5) + 1` at CP 1500). The datamine carries only base stats for `AEGISLASH_BLADE` and `AEGISLASH_SHIELD`; that is the evidence cited in the differences list. The brainstorm lane may overrule.
- **CMP tie with a knockout.** The spec makes CMP ties a caller-supplied random outcome, so our engine fires the tie winner first and the loser does not fire if it fainted. PvPoke (equal Attack, `usePriority` false) fires both. Expected known difference, evidence: the spec's 2026-10-27 decision.
- **Megas.** Mega forms (from `tempEvoOverrides`) and Mega moves (`COMBAT_VM_MOVE_TEMP_EVOLUTION_*`) are extracted as data. The Mega damage bonus and PvPoke's "+" Mega moves are not modelled by the rules engine in this slice (cup readiness, spec 4). No exam script uses a Mega.
- **Float constants.** The game's numbers are float32; extraction stores every multiplier from the datamine through `Math.fround` (fround(1.3) equals PvPoke's `DamageMultiplier.BONUS` exactly). For the rules exam the converter takes PvPoke's own constants from its vm context, so constants never pose as rule mismatches. The data exam lists constant differences (PvPoke's `SHADOW_ATK` is a plain 1.2).
- **Seeded overrides.** Gulp Missile (15 percent of the target's max HP plus 1) and Aegislash Shield's fast moves (0 power, 6 energy) are community-known values the datamine does not carry. Their `source` says exactly that; Travis replaces them with first-hand evidence when he has it.
- **PvPoke sandbox and `battle_start`.** `Battle.js:245` applies `battle_start` form changes when `mode == "simulate"`, and `simulate()` sets that mode even in sandbox, so no patch is planned for it. The harness checks that Minior starts in Meteor form in PvPoke and patches only if it does not (Task 15).

---

## File Structure

```
packages/battle/                      NEW workspace @pickthree/battle
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                        public exports
  src/data/types.ts                   compact BattleData format
  src/data/load.ts                    loadBattleData: validate + freeze a parsed file
  src/rules/stats.ts                  CPM lookup, combat stats, CP
  src/rules/damage.ts                 stage multiplier, effectiveness, damage
  src/mechanics/vocabulary.ts         trigger/effect types and name lists
  src/mechanics/validate.ts           validateMechanics with plain errors
  src/state/state.ts                  BattleState, createBattle
  src/state/snapshot.ts               snapshot, restore, hashState
  src/player/types.ts                 Player, BattleView, Decision, RandomSource
  src/player/scripted.ts              ScriptedPlayer, scriptedRandom
  src/player/default.ts               DefaultPlayer
  src/random.ts                       seededRandom
  src/rules/fast.ts                   resolveFast
  src/rules/charged.ts                resolveCharged
  src/rules/mechanics.ts              fireEvent (vocabulary interpreter)
  src/rules/turn.ts                   stepTurn
  src/rules/battle.ts                 runBattle
  src/extract/index.ts                extractBattleData
  src/extract/templates.ts            typed readers over raw templates
  src/extract/settings.ts, moves.ts, species.ts, leagues.ts
  src/extract/overrides.ts            validateOverrides, applyOverrides
  src/extract/alarm.ts                unmodelledForms
  test/fixtures/synthetic.ts          makeData, makeMove, makeSpecies, combatant helpers
  test/fixtures/templates.ts          tiny datamine template builders
  test/*.test.ts

packages/data/
  datamine.lock.json                  NEW pin: repository, commit, date, path, sha256
  battle/overrides.yaml               NEW hand-kept
  battle/mechanics.yaml               NEW hand-kept
  battle/differences.yaml             NEW hand-kept known differences from PvPoke
  src/datamine-lock.ts                NEW readDatamineLock, writeDatamineLock
  src/fetch-datamine.ts               NEW ensureDatamine
  src/refresh-datamine.ts             NEW bump the lock to upstream HEAD
  src/build-battle.ts                 NEW battle:build step + alarm
  src/paths.ts                        MODIFY: datamine and battle paths
  src/exam/pvpoke-types.ts            NEW extra PvPoke shapes the harness touches
  src/exam/convert.ts                 NEW PvPoke game master -> BattleData
  src/exam/pvpoke-mechanics.yaml      NEW PvPoke's form behaviour in our vocabulary
  src/exam/scripts.ts                 NEW the exam script set
  src/exam/expand.ts                  NEW policy script -> concrete script
  src/exam/run-pvpoke.ts              NEW sandbox runner with per-turn trace
  src/exam/run-ours.ts                NEW our runner with the same trace shape
  src/exam/judge.ts                   NEW compare traces, apply differences list
  src/exam/idmap.ts                   NEW our ids -> PvPoke ids (data exam only)
  src/exam/data-exam.ts               NEW data exam report CLI
  test/datamine-lock.test.ts, test/fetch-datamine.test.ts, test/build-battle.test.ts
  test/live-data.ts                   NEW shared loader: pinned datamine + committed YAML -> BattleData
  test/mechanics-live.test.ts         NEW every shipped mechanics entry run in a battle
  test/exam/*.test.ts

packages/sim-pvpoke/src/node-host.ts  MODIFY: createPvPokeContext (exposes vm evaluate)
eslint.config.js                      MODIFY: import boundaries for battle and engine
.gitignore                            MODIFY: packages/data/.datamine/, packages/data/.battle/
package.json                          MODIFY: root scripts
.github/workflows/ci.yml              MODIFY: datamine cache + fetch, REQUIRE env
CLAUDE.md                             MODIFY: layout, architecture, commands
```

---

### Task 1: Package scaffold, compact data format, boundaries

**Files:**
- Create: `packages/battle/package.json`, `packages/battle/tsconfig.json`, `packages/battle/vitest.config.ts`
- Create: `packages/battle/src/index.ts`, `packages/battle/src/data/types.ts`, `packages/battle/src/data/load.ts`
- Create: `packages/battle/test/fixtures/synthetic.ts`, `packages/battle/test/load.test.ts`
- Modify: `eslint.config.js`

**Interfaces:**
- Produces (`src/data/types.ts`, every later task uses these names):

```ts
export type TypeId = string;   // lowercase, e.g. 'fire'
export type MoveId = string;   // datamine name, e.g. 'ROLLOUT_FAST', 'DIVE'
export type FormId = string;   // e.g. 'mimikyu_disguised', 'minior', 'cramorant'

export interface StatStages { min: number; max: number; atk: number[]; def: number[] } // index = stage - min
export interface BattleSettings {
  stab: number; fastBonus: number; chargedBonus: number;
  shadowAtk: number; shadowDef: number;
  maxEnergy: number; roundTurns: number; stages: StatStages;
}
export interface StageChange { atk: number; def: number }
export interface MoveBuffs { chance: number; self?: StageChange; opponent?: StageChange }
export interface MoveData {
  id: MoveId; type: TypeId; category: 'fast' | 'charged';
  power: number; energy: number; energyGain: number; turns: number;
  buffs?: MoveBuffs; damageKind?: 'percentMaxHp';
}
export interface BaseStats { atk: number; def: number; hp: number }
export interface SpeciesData {
  id: FormId; dex: number; family: string; baseStats: BaseStats;
  types: [TypeId] | [TypeId, TypeId];
  fast: MoveId[]; charged: MoveId[]; eliteFast: MoveId[]; eliteCharged: MoveId[];
  shadow: { charged: MoveId; purifiedCharged: MoveId } | null;
  tags: string[];                       // 'mega' for Mega forms
}
export interface FamilyRef { family: string; forms: FormId[] | null }
export interface LeagueData {
  id: string; title: string; enabled: boolean; leagueType: string; pokemonCount: number;
  cpCap: number | null; maxLevel: number | null; unique: boolean; allowMegas: boolean;
  types: TypeId[] | null; allowed: FamilyRef[] | null; banned: FamilyRef[];
  caughtWindow: { after: number; before: number } | null;
}
export interface BattleData {
  version: 1;
  source: { kind: 'datamine' | 'pvpoke'; commit: string; date: string };
  settings: BattleSettings;
  types: TypeId[];
  effectiveness: number[][];           // [attackIndex][defendIndex], indexes into types
  cpm: number[];                       // index (level - 1) * 2
  moves: Record<MoveId, MoveData>;
  species: Record<FormId, SpeciesData>;
  leagues: Record<string, LeagueData>;
  mechanics: Record<string, MechanicsEntry>;   // keyed by family; type from Task 3
}
```

- Produces (`src/data/load.ts`): `loadBattleData(raw: unknown): BattleData`. Throws `Error` whose message starts `battle data:` and names the path of the first bad field (for example `battle data: moves.DIVE.turns must be a positive integer`). Checks version, that `effectiveness` is `types.length` square, that every species move id exists in `moves`, every species type exists in `types`. It does not re-validate mechanics beyond shape (Task 3 owns that).
- Produces (`test/fixtures/synthetic.ts`): `makeData(over?: Partial<BattleData>): BattleData` with three types `['alpha','beta','gamma']` (alpha super effective on beta at 1.6, beta resists alpha at... keep the matrix explicit in the fixture), settings `{ stab: 1.2, fastBonus: 1.3, chargedBonus: 1.3, shadowAtk: 1.2, shadowDef: 0.8, maxEnergy: 100, roundTurns: 540, stages: { min: -4, max: 4, atk: [4/8,4/7,4/6,4/5,1,5/4,6/4,7/4,8/4], def: same } }`, a CPM table where every entry is 0.5 (so stats are easy to hand-compute), `makeMove(id, over)`, `makeSpecies(id, over)`. Later tasks extend this fixture; they never read real game data.

- [ ] **Step 1: Scaffold the workspace.** `package.json`: name `@pickthree/battle`, version `0.0.0`, private, type module, `main`/`types` `./src/index.ts`, `exports` `{ ".": "./src/index.ts", "./extract": "./src/extract/index.ts" }`, script `typecheck: tsc --noEmit -p tsconfig.json`, no dependencies. `tsconfig.json` extends `../../tsconfig.base.json` with `rootDir: "."`, `noEmit: true`, `lib: ["ES2022"]`, `types: []` (no Node, no DOM; a stray `node:` import fails typecheck), include `src/**/*.ts`, `test/**/*.ts`. `vitest.config.ts`: `name: 'battle'`, include `test/**/*.test.ts`. Run `npm install` at the root so the workspace links.

- [ ] **Step 2: Write the failing test** `packages/battle/test/load.test.ts`:

```ts
it('accepts the synthetic fixture', () => {
  expect(loadBattleData(structuredClone(makeData())).version).toBe(1);
});
it('names the bad field', () => {
  const raw = makeData();
  raw.moves['TACKLE_FAST'] = makeMove('TACKLE_FAST', { turns: 0 });
  expect(() => loadBattleData(raw)).toThrow('battle data: moves.TACKLE_FAST.turns must be a positive integer');
});
it('rejects a species move that is not in moves', () => {
  const raw = makeData();
  raw.species['alpha_mon'] = makeSpecies('alpha_mon', { fast: ['NOPE_FAST'] });
  expect(() => loadBattleData(raw)).toThrow('battle data: species.alpha_mon.fast[0] NOPE_FAST is not a move');
});
it('rejects a non-square effectiveness table', () => {
  const raw = makeData({ effectiveness: [[1, 1]] });
  expect(() => loadBattleData(raw)).toThrow('battle data: effectiveness must be 3 x 3');
});
```

- [ ] **Step 3: Run it.** `npx vitest run --project battle packages/battle/test/load.test.ts` -> FAIL (module not found).
- [ ] **Step 4: Implement** `types.ts` as above (the `MechanicsEntry` import comes from `../mechanics/vocabulary.js`; create that file with `export type MechanicsEntry = unknown;` as a placeholder that Task 3 replaces) and `loadBattleData`. Export both from `src/index.ts`.
- [ ] **Step 5: Run it.** Same command -> PASS. `npm -w @pickthree/battle run typecheck` -> clean.
- [ ] **Step 6: Import boundaries in `eslint.config.js`.** Add two config objects after the main rules block:

```js
{
  files: ['packages/battle/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [
      { group: ['@pickthree/sim-pvpoke', '@pickthree/sim-pvpoke/*', '**/sim-pvpoke/**', '**/.pvpoke/**'],
        message: 'packages/battle never reads PvPoke. Spec 2026-10-27, Anti-goals.' },
      { group: ['@pickthree/engine', '@pickthree/engine/*', 'node:*'],
        message: 'packages/battle is pure: no engine, no Node built-ins.' },
    ] }],
  },
},
{
  files: ['packages/engine/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [
      { group: ['@pickthree/battle', '@pickthree/battle/*'], message: 'engine must not import battle in this slice.' },
    ] }],
  },
},
```

- [ ] **Step 7: Verify the boundary.** Temporarily add `import '@pickthree/sim-pvpoke';` to `packages/battle/src/index.ts`, run `npx eslint packages/battle` -> one `no-restricted-imports` error with the message above. Remove the line, run `npm run lint` -> clean.
- [ ] **Step 8: Commit.**

```bash
git add packages/battle/package.json packages/battle/tsconfig.json packages/battle/vitest.config.ts packages/battle/src packages/battle/test eslint.config.js package-lock.json
git commit -m "battle: scaffold package, compact data format, import boundaries"
```

---

### Task 2: Stats and damage

**Files:**
- Create: `packages/battle/src/rules/stats.ts`, `packages/battle/src/rules/damage.ts`
- Test: `packages/battle/test/stats.test.ts`, `packages/battle/test/damage.test.ts`

**Interfaces:**
- Consumes: `BattleData`, `SpeciesData`, `MoveData` (Task 1).
- Produces:
  - `cpmAt(data: BattleData, level: number): number` (throws `level 51.25 is not a half level` / `level 99 is past the CPM table`).
  - `formStats(data: BattleData, formId: FormId, ivs: Ivs, level: number): { atk: number; def: number; hp: number }` with `export interface Ivs { atk: number; def: number; hp: number }`. `atk = (base.atk + ivs.atk) * cpm`, `def` likewise, `hp = Math.max(10, Math.floor((base.hp + ivs.hp) * cpm))`.
  - `cpOf(data, formId, ivs, level): number` = `Math.max(10, Math.floor(atk * Math.sqrt(def) * Math.sqrt(hp) * cpm * cpm / 10))` on unscaled `base + iv` values.
  - `stageMultiplier(stages: StatStages, stage: number): number` (clamps to min..max, then indexes).
  - `effectiveness(data, moveType: TypeId, defender: readonly TypeId[]): number` = product, starting at 1, over the defender's types in order.
  - `damageOf(data, input: DamageInput): number` with

```ts
export interface DamageInput {
  move: MoveData; attackerTypes: readonly TypeId[]; defenderTypes: readonly TypeId[];
  atk: number; def: number;            // unbuffed form stats
  atkStage: number; defStage: number;
  attackerShadow: boolean; defenderShadow: boolean;
  defenderMaxHp: number;
}
```

  The multiplication order is fixed so floats agree with PvPoke's `DamageCalculator.damage` bit for bit:

```ts
const attack = input.atk * (stageMultiplier(s.stages, input.atkStage) * (input.attackerShadow ? s.shadowAtk : 1));
const defense = input.def * (stageMultiplier(s.stages, input.defStage) * (input.defenderShadow ? s.shadowDef : 1));
if (move.damageKind === 'percentMaxHp') { return Math.floor((move.power / 100) * input.defenderMaxHp) + 1; }
const stab = input.attackerTypes.includes(move.type) ? s.stab : 1;
const bonus = move.category === 'fast' ? s.fastBonus : s.chargedBonus;
return Math.floor(move.power * stab * (attack / defense) * eff * 0.5 * bonus) + 1;
```

- [ ] **Step 1: Write the failing tests.** In `stats.test.ts` (fixture CPM is 0.5 everywhere; extend the fixture with a 4-entry table `[0.1, x, 0.3, y]` where needed):

```ts
it('half levels index between whole levels', () => {
  const d = makeData({ cpm: [0.1, 0.2, 0.3] });
  expect(cpmAt(d, 1)).toBe(0.1); expect(cpmAt(d, 1.5)).toBe(0.2); expect(cpmAt(d, 2)).toBe(0.3);
  expect(() => cpmAt(d, 1.25)).toThrow('level 1.25 is not a half level');
  expect(() => cpmAt(d, 3)).toThrow('level 3 is past the CPM table');
});
it('combat stats use base + iv times cpm, hp floored with a floor of 10', () => {
  const d = makeData();  // cpm 0.5
  d.species['m'] = makeSpecies('m', { baseStats: { atk: 100, def: 80, hp: 21 } });
  expect(formStats(d, 'm', { atk: 10, def: 0, hp: 1 }, 1)).toEqual({ atk: 55, def: 40, hp: 11 });
  d.species['tiny'] = makeSpecies('tiny', { baseStats: { atk: 1, def: 1, hp: 2 } });
  expect(formStats(d, 'tiny', { atk: 0, def: 0, hp: 0 }, 1).hp).toBe(10);
});
```

In `damage.test.ts`, hand-computed from synthetic numbers:

```ts
// power 10, no stab, neutral, atk == def, fast bonus 1.3: floor(10 * 1 * 1 * 1 * 0.5 * 1.3) + 1 = 7
it('plain fast move', () => { expect(damageOf(d, base({ move: fast10 }))).toBe(7); });
// stab: floor(10 * 1.2 * 0.5 * 1.3) + 1 = 8
it('same type bonus', ...);
// super effective 1.6: floor(10 * 1.6 * 0.5 * 1.3) + 1 = 11
it('type effectiveness multiplies per defender type', ...);   // also a two-type defender: 1.6 * 1.6
// +2 attack stage: atk * 6/4: floor(10 * 1.5 * 0.65) + 1 = 10
it('attack stage', ...);
// shadow attacker 1.2 and shadow defender 0.8: attack/defense = 1.2 / 0.8 = 1.5 -> 10
it('shadow on both sides', ...);
it('stage clamps at max', () => { expect(stageMultiplier(d.settings.stages, 9)).toBe(2); });
// percentMaxHp power 15 vs max hp 120: floor(0.15 * 120) + 1 = 19
it('percent of max HP ignores stats', ...);
```

- [ ] **Step 2: Run them.** `npx vitest run --project battle packages/battle/test/stats.test.ts packages/battle/test/damage.test.ts` -> FAIL.
- [ ] **Step 3: Implement** `stats.ts` and `damage.ts` with the signatures and order above.
- [ ] **Step 4: Run them.** -> PASS. Typecheck clean.
- [ ] **Step 5: Commit.** `git add packages/battle/src/rules/stats.ts packages/battle/src/rules/damage.ts packages/battle/test/stats.test.ts packages/battle/test/damage.test.ts packages/battle/test/fixtures/synthetic.ts` then `git commit -m "battle: stats, CP and damage formula"`.

---

### Task 3: Mechanics vocabulary and validation

**Files:**
- Create: `packages/battle/src/mechanics/vocabulary.ts` (replaces the Task 1 placeholder), `packages/battle/src/mechanics/validate.ts`
- Test: `packages/battle/test/mechanics-validate.test.ts`

**Interfaces:**
- Produces (`vocabulary.ts`):

```ts
export const EVENTS = ['battleStart', 'hpBelow', 'beforeChargedMove', 'afterChargedMove', 'shieldUsed', 'hitByChargedMove'] as const;
export const EFFECTS = ['switchForm', 'blockDamage', 'replaceMove', 'statStages', 'fireMove', 'animate'] as const;
export type EventName = (typeof EVENTS)[number];
export interface When {
  event: EventName;
  fraction?: number;                 // hpBelow only: fires when hp / maxHp < fraction and hp > 0
  moves?: MoveId[];                  // before/afterChargedMove: absent means any charged move
  form?: FormId | FormId[];          // condition: current form is (one of) these
  hpAbove?: number;                  // condition: hp / maxHp > value
  hpAtMost?: number;                 // condition: hp / maxHp <= value
}
export type Effect =
  | { effect: 'switchForm'; to: FormId | 'startForm' }
  | { effect: 'blockDamage' }
  | { effect: 'replaceMove'; from: MoveId; to: MoveId }
  | { effect: 'statStages'; target: 'self' | 'opponent'; atk?: number; def?: number }
  | { effect: 'fireMove'; move: MoveId; ignoresFaint?: boolean }
  | { effect: 'animate'; turns: number };
export interface MechanicsRule { when: When; do: Effect[] }
export interface MechanicsEntry {
  family: string; source: string; entered: string;     // entered: YYYY-MM-DD
  resetOnSwitchOut: boolean;                           // stored for spec 2, unused in 1v1
  rules: MechanicsRule[];
}
```

  Event meaning (the interpreter in Task 7 implements exactly this): `battleStart` once per combatant before turn 1; `hpBelow` after any damage the combatant takes; `beforeChargedMove` on the attacker before damage is computed; `afterChargedMove` on the attacker after damage and buffs; `shieldUsed` on the defender when it shields; `hitByChargedMove` on the defender when a charged move it did not shield hits it (moves launched by `fireMove` never raise it). `blockDamage` is only meaningful under `hitByChargedMove` and is applied before damage (damage becomes 1); every other effect runs after damage.

- Produces (`validate.ts`): `validateMechanics(raw: unknown, data: Pick<BattleData, 'species' | 'moves'>): Record<string, MechanicsEntry>`. Input is the parsed YAML object keyed by family (the key becomes `family`). Throws `Error` with message prefix `mechanics.yaml:` and a dotted path. For an unknown event or effect the message names the vocabulary and says it is a code change:

```
mechanics.yaml: mimikyu.rules[0].when.event "onSneeze" is not in the vocabulary (battleStart, hpBelow, beforeChargedMove, afterChargedMove, shieldUsed, hitByChargedMove). A new trigger is a code change in packages/battle/src/mechanics/.
```

  Also checked: every `form` / `switchForm.to` (except `startForm`) is a species whose `family` equals the entry's family; every move id exists; `fraction`, `hpAbove`, `hpAtMost` in (0, 1); `animate.turns` a positive integer; `fireMove.move` is a charged move; `fraction` present iff event is `hpBelow`; `moves` only on before/afterChargedMove; `blockDamage` only under `hitByChargedMove`; `source` non-empty; `entered` matches `^\d{4}-\d{2}-\d{2}$`.

- [ ] **Step 1: Write the failing tests** with a synthetic family `shifter` (forms `shifter_a`, `shifter_b`) in the fixture: one valid entry round-trips (returned object deep-equals input plus `family`); one test per error kind above asserting the exact message (unknown event, unknown effect, form from another family, missing move, `fraction` out of range, `blockDamage` under `afterChargedMove`, missing `source`, bad `entered`).
- [ ] **Step 2: Run.** `npx vitest run --project battle packages/battle/test/mechanics-validate.test.ts` -> FAIL.
- [ ] **Step 3: Implement** `vocabulary.ts` and `validate.ts`. Update `src/data/types.ts` to import the real `MechanicsEntry`; export the vocabulary and `validateMechanics` from `src/index.ts`.
- [ ] **Step 4: Run.** -> PASS. Typecheck clean.
- [ ] **Step 5: Commit.** `git commit -m "battle: mechanics vocabulary and validation"` (stage the four files plus `src/data/types.ts`, `src/index.ts`).

---

### Task 4: Battle state, snapshot, restore, hash

**Files:**
- Create: `packages/battle/src/state/state.ts`, `packages/battle/src/state/snapshot.ts`
- Test: `packages/battle/test/state.test.ts`

**Interfaces:**
- Consumes: `formStats`, `cpmAt` (Task 2); `BattleData` (Task 1).
- Produces (`state.ts`):

```ts
export interface CombatantSetup {
  formId: FormId; level: number; ivs: Ivs; fastMove: MoveId;
  chargedMoves: [MoveId] | [MoveId, MoveId]; shadow?: boolean; startEnergy?: number;
}
export interface SideSetup { team: CombatantSetup[]; shields: number }   // team length must be 1 in this slice
export interface BattleSetup { sides: [SideSetup, SideSetup] }

export interface CombatantState {
  startFormId: FormId; formId: FormId; level: number; ivs: Ivs; shadow: boolean;
  atk: number; def: number; maxHp: number; hp: number; energy: number;
  atkStage: number; defStage: number;
  fastMove: MoveId; chargedMoves: MoveId[];
  cooldown: number;                       // turns until it may act again
  faintSource: 'fast' | 'charged' | null;
}
export interface SideState { shields: number; active: number; team: CombatantState[]; switchTimer: number }
export interface QueuedAction { actor: 0 | 1; kind: 'fast' | 'charged'; turn: number; slot: number }
export interface BattleState {
  turn: number;                           // next turn to play, starts at 1
  sides: [SideState, SideState];
  queue: QueuedAction[];
  chargedLastTurn: boolean;
  frozenTurns: number;
  usePriority: boolean;                   // set at start: attack stats differ
  outcome: 'win0' | 'win1' | 'tie' | 'timeout' | null;
}
export function createBattle(data: BattleData, setup: BattleSetup): BattleState;
export function active(state: BattleState, side: 0 | 1): CombatantState;
```

  `createBattle` throws on a team length other than 1 (`3v3 arrives in spec 2; this slice takes one Pokemon per side`), unknown form or move, shields outside 0..2, `startEnergy` outside 0..maxEnergy. `usePriority` is `atk0 !== atk1` on the starting forms (mirrors `Battle.js` start; the Cramorant mirror special case is not copied, it is a PvPoke-only rule). `battleStart` mechanics are not run here; `runBattle` (Task 7) runs them.

- Produces (`snapshot.ts`): `snapshot(s: BattleState): BattleState` (deep copy by hand, no JSON, no `structuredClone`, so it is cheap), `restore(into: BattleState, from: BattleState): void` (copies `from` into `into` in place), `hashState(s: BattleState): string` (16 lowercase hex chars: two independent 32-bit FNV-1a lanes, seeds `0x811c9dc5` and `0x01000193 ^ 0x9e3779b9`, over a canonical walk of every field in declaration order, numbers fed as their float64 bytes via a shared `Float64Array`/`Uint8Array` view, strings as UTF-16 code units, arrays prefixed by length, `null` as a distinct tag).

- [ ] **Step 1: Write the failing tests:**

```ts
it('creates full HP, zero energy unless startEnergy, shields per side', ...);
it('rejects a team of two with the spec 2 message', ...);
it('snapshot is independent of the original', () => {
  const s = createBattle(d, setup); const c = snapshot(s);
  active(c, 0).hp -= 5; c.queue.push({ actor: 0, kind: 'fast', turn: 1, slot: 0 });
  expect(active(s, 0).hp).toBe(active(createBattle(d, setup), 0).hp); expect(s.queue).toEqual([]);
});
it('equal states hash equal, built separately', () => {
  expect(hashState(createBattle(d, setup))).toBe(hashState(createBattle(d, setup)));
});
it('any field change changes the hash', () => {
  // mutate each of: turn, a side's shields, hp, energy, atkStage, defStage, formId, cooldown,
  // a queued action's turn, chargedLastTurn, frozenTurns, outcome; each yields a new hash
});
it('restore returns a mutated state to the snapshot', () => {
  const s = createBattle(d, setup); const snap = snapshot(s); active(s, 1).energy = 40; restore(s, snap);
  expect(hashState(s)).toBe(hashState(snap));
});
```

- [ ] **Step 2: Run.** `npx vitest run --project battle packages/battle/test/state.test.ts` -> FAIL.
- [ ] **Step 3: Implement** both files; export from `src/index.ts`.
- [ ] **Step 4: Run.** -> PASS. Typecheck clean.
- [ ] **Step 5: Commit.** `git commit -m "battle: battle state, snapshot, restore and hash"`.

---

### Task 5: Player interface, random source, scripted player

**Files:**
- Create: `packages/battle/src/player/types.ts`, `packages/battle/src/player/scripted.ts`, `packages/battle/src/random.ts`
- Test: `packages/battle/test/player.test.ts`

**Interfaces:**
- Produces (`player/types.ts`):

```ts
export interface CombatantView {
  formId: FormId; types: readonly TypeId[]; hp: number; maxHp: number; energy: number;
  atkStage: number; defStage: number; shadow: boolean;
  fastMove: MoveData; chargedMoves: readonly MoveData[]; cooldown: number;
}
export interface BattleView {
  turn: number; actor: 0 | 1;
  self: CombatantView; opponent: CombatantView;
  shields: number; opponentShields: number;
  data: BattleData;
}
export type Decision = { kind: 'fast' } | { kind: 'charged'; slot: number };   // spec 2 adds 'switch'
export interface IncomingCharged { move: MoveData; damage: number; blockedByMechanic: boolean }
export interface Player {
  decide(view: BattleView): Decision;
  shield(view: BattleView, incoming: IncomingCharged): boolean;
}
export interface RandomSource {
  buffProcs(ctx: { turn: number; actor: 0 | 1; move: MoveId; chance: number }): boolean;
  cmpTieWinner(ctx: { turn: number }): 0 | 1;
}
```

- Produces (`player/scripted.ts`):

```ts
export interface ScriptEntry { actor: 0 | 1; turn: number; slot: number; shielded: boolean; buff?: boolean }
export class ScriptedPlayer implements Player { constructor(actor: 0 | 1, script: readonly ScriptEntry[]) }
export function scriptedRandom(script: readonly ScriptEntry[]): RandomSource;
```

  `decide`: the entry with `actor === view.actor && turn === view.turn` gives `{ kind: 'charged', slot }`, else `{ kind: 'fast' }`. `shield`: the entry whose actor is the attacker (the other side) and whose `turn === view.turn` gives `shielded`; no entry means `false`. `scriptedRandom.buffProcs`: the attacker's entry at that turn gives `buff ?? false`; no entry means `false`. `cmpTieWinner` returns `0` (PvPoke's stable sort puts actor 0 first on equal priority).

- Produces (`random.ts`): `seededRandom(seed: number): RandomSource` (mulberry32; `buffProcs` returns `next() < chance`; `cmpTieWinner` returns `next() < 0.5 ? 0 : 1`).

- [ ] **Step 1: Write the failing tests:** scripted decide picks the slot on its turn and fast otherwise; shield answers for the attacker's entry; buffProcs reads `buff`; `seededRandom(7)` gives the same sequence twice and a different one for seed 8.
- [ ] **Step 2: Run.** `npx vitest run --project battle packages/battle/test/player.test.ts` -> FAIL.
- [ ] **Step 3: Implement.** Export from `src/index.ts`.
- [ ] **Step 4: Run.** -> PASS.
- [ ] **Step 5: Commit.** `git commit -m "battle: player interface, scripted player, seeded random"`.

---

### Task 6: Turn loop, fast moves, charged moves, CMP, shields, buffs

**Files:**
- Create: `packages/battle/src/rules/fast.ts`, `packages/battle/src/rules/charged.ts`, `packages/battle/src/rules/turn.ts`, `packages/battle/src/rules/battle.ts`
- Test: `packages/battle/test/turn.test.ts`, `packages/battle/test/charged.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces (`battle.ts`):

```ts
export interface BattleEvent {
  turn: number; actor: 0 | 1;
  kind: 'fast' | 'charged' | 'shield' | 'buff' | 'form' | 'faint' | 'animate' | 'fire';
  move?: MoveId; slot?: number; damage?: number; form?: FormId;
}
export interface TurnRecord { turn: number; hp: [number, number]; energy: [number, number]; forms: [FormId, FormId]; hash: string; events: BattleEvent[] }
// hash: hashState(state) after the turn (spec, "Battle state cheap to copy and compare", amended a524595)
export interface RunOptions { trace?: boolean; maxTurns?: number }   // maxTurns defaults to settings.roundTurns
export interface BattleResult { outcome: 'win0' | 'win1' | 'tie' | 'timeout'; turns: number; final: BattleState; trace: TurnRecord[] }
export interface BattleContext { data: BattleData; players: [Player, Player]; random: RandomSource; events: BattleEvent[] }
export function runBattle(data: BattleData, setup: BattleSetup, players: [Player, Player], random: RandomSource, opts?: RunOptions): BattleResult;
```

- Produces (`turn.ts`): `stepTurn(state: BattleState, ctx: BattleContext): void` (plays exactly one turn, or one frozen turn). `charged.ts`: `resolveCharged(state, ctx, actor: 0 | 1, slot: number): void`. `fast.ts`: `resolveFast(state, ctx, actor: 0 | 1): void`. Task 7 adds mechanics calls inside these three.

**The turn algorithm** (mirrors `Battle.js` `step` in simulate mode, in turn units where PvPoke uses milliseconds; one PvPoke 500 ms tick is one turn):

```
stepTurn(state):
  if state.frozenTurns > 0: frozenTurns -= 1; turn += 1; return          (Task 7 sets frozenTurns)
  for side in 0,1: c.cooldown = max(0, c.cooldown - 1)
  chargedLastTurn = state.chargedLastTurn
  for side in 0,1 (in order, both decide from the state at turn start):
    c = active(side)
    if c.cooldown == 0 and not chargedLastTurn and both hp > 0:
      d = players[side].decide(view)
      if d is charged and slot exists and c.energy >= cost: queue charged, c.cooldown += 1
      else: queue fast, c.cooldown += fastMove.turns            (an unaffordable or bad slot becomes fast)
  move eligible actions out of the queue (keep queue order):
    charged: always eligible
    fast: eligible if (turn - queued.turn) >= fastMove.turns - 1, or (chargedLastTurn and queued.turn < turn)
  order: charged before fast; between two charged moves, higher atk (current form stat, unbuffed,
         no shadow) first when state.usePriority and the two differ, else random.cmpTieWinner decides;
         fasts in actor order
  process in that order:
    fast: skip if opponent hp <= 0, or self hp <= 0 with faintSource 'charged'; else resolveFast
    charged: skip if energy < cost; skip if self hp <= 0 with faintSource 'charged' (the tie loser too);
             else resolveCharged
  state.chargedLastTurn = any charged move resolved this turn
  if any charged move resolved (or an animate fired, Task 7): both cooldowns = 1
  turn += 1
  outcome: both hp 0 -> 'tie'; one hp 0 -> the other wins; turn > maxTurns -> 'timeout'
```

  `resolveFast`: damage via `damageOf` with the attacker's current stats and stages; `defender.hp = max(0, hp - damage)`; `energy = min(maxEnergy, energy + energyGain)`; on faint set `faintSource = 'fast'`; push a `fast` event.
  `resolveCharged`: `energy -= cost`; compute damage; if defender has shields: `incoming = { move, damage, blockedByMechanic }` (false until Task 7) and `players[defender].shield(view, incoming)`; shield means damage 1, `shields -= 1`, a `shield` event. Then apply damage, faint sets `faintSource = 'charged'`. Buffs: `chance >= 1` always applies; otherwise `random.buffProcs`. `self` changes go to the attacker, `opponent` to the defender, each clamped to `stages.min..max`; opponent debuffs apply even through a shield (PvPoke applies them; its `shieldBuffModifier` is always 0). Push `charged` (with `slot`) and `buff` events.
  `runBattle`: `createBattle`, then (Task 7: battleStart), then `stepTurn` until `outcome`; when `opts.trace`, push a `TurnRecord` after every `stepTurn`, carrying the events that turn produced and `hash: hashState(state)` taken after the turn (frozen turns included, so a timeline can show two lines of play meeting where their hashes match).

- [ ] **Step 1: Write the failing tests** in `turn.test.ts`, synthetic Pokemon with CPM 0.5, equal stats, a 1-turn fast move (power 10, gain 10) and a 2-turn fast move:

```ts
it('1-turn fast moves land every turn', ...);         // after 3 turns: 3 hits each, energy 30 each
it('a 2-turn fast move lands on its second turn and decides again on its third', ...);
it('energy caps at maxEnergy', ...);
it('plays fast when the chosen charged move is unaffordable or the slot is missing', ...);   // Review Focus 2
it('simultaneous fast knockouts are a tie, deterministically', () => {          // Review Focus 3
  const a = runBattle(d, mirror, [fastOnly, fastOnly], seededRandom(1));
  const b = runBattle(d, mirror, [fastOnly, fastOnly], seededRandom(2));
  expect(a.outcome).toBe('tie'); expect(a.final.sides[0].team[0]!.hp).toBe(0);
  expect(hashState(a.final)).toBe(hashState(b.final));
});
it('stops at maxTurns with timeout', ...);            // 1-damage moves, huge hp, maxTurns 20
```

  In `charged.test.ts`:

```ts
it('charged move costs energy and lands the same turn', ...);
it('the turn after a charged move takes no decisions and a queued fast move floats in', ...);
it('higher attack goes first when both throw; the knocked-out side does not fire', ...);
it('equal attack: cmpTieWinner picks the order and the loser does not fire if knocked out', ...);   // both 0 and 1
it('a shield takes the hit for 1 damage and spends one shield', ...);
it('a guaranteed self buff and an opponent debuff both apply, the debuff even through a shield', ...);
it('a chance buff applies only when buffProcs says so', ...);
it('stages clamp at +4 and -4', ...);
it('same inputs and same random outcomes give the same battle', ...);   // hash of final + trace equality
it('the trace carries each turn state hash', () => {
  const a = runBattle(d, setup, [playerA, playerB], seededRandom(3), { trace: true });
  const b = runBattle(d, setup, [playerA, playerB], seededRandom(3), { trace: true });
  expect(a.trace.at(-1)!.hash).toBe(hashState(a.final));
  expect(a.trace.map((r) => r.hash)).toEqual(b.trace.map((r) => r.hash));
  expect(new Set(a.trace.map((r) => r.hash)).size).toBe(a.trace.length);   // the turn counter alone makes every state distinct
});
```

- [ ] **Step 2: Run.** `npx vitest run --project battle packages/battle/test/turn.test.ts packages/battle/test/charged.test.ts` -> FAIL.
- [ ] **Step 3: Implement** the four files per the algorithm. `BattleView` is built from state each time a player is asked (`turn`, `actor`, both combatant views with their `MoveData` resolved, shields).
- [ ] **Step 4: Run.** -> PASS. `npm -w @pickthree/battle run typecheck` clean; `npx eslint packages/battle` clean.
- [ ] **Step 5: Commit.** `git commit -m "battle: turn loop, fast and charged moves, CMP, shields, buffs"`.

---

### Task 7: Mechanics interpreter in the turn loop

**Files:**
- Create: `packages/battle/src/rules/mechanics.ts`
- Modify: `packages/battle/src/rules/fast.ts`, `charged.ts`, `turn.ts`, `battle.ts`
- Test: `packages/battle/test/mechanics-run.test.ts`

**Interfaces:**
- Consumes: `MechanicsEntry`, `When`, `Effect` (Task 3); state and rules (Tasks 4, 6).
- Produces: `fireEvent(state: BattleState, ctx: BattleContext, side: 0 | 1, event: EventName, info: { move?: MoveId }): void` and `blocksDamage(state, ctx, defender: 0 | 1): boolean` (true when a matching `hitByChargedMove` rule contains `blockDamage`).

  Rules for one event: look up `data.mechanics[species(formId).family]`; evaluate every rule's `when` against the state as it is when the event fires (all conditions first, so a rule that switches form cannot make a later rule in the same event match); then run the matching rules' effects in file order. Effects:
  - `switchForm`: target `startForm` means `c.startFormId`; set `formId`; recompute `atk`/`def` with `formStats` at the same level and IVs; HP, maxHp, energy and stages unchanged; push a `form` event.
  - `replaceMove`: in `fastMove` or `chargedMoves`, replace `from` with `to` if present; no-op otherwise.
  - `statStages`: add to self or opponent, clamped.
  - `fireMove`: resolve the move immediately as the owning side's charged move: no energy cost, no shield prompt, no CMP, does not raise `hitByChargedMove` or `before/afterChargedMove`, fires even if its owner is at 0 HP when `ignoresFaint`; damage and buffs as normal; push a `fire` event.
  - `animate`: `state.frozenTurns = max(state.frozenTurns, turns)` and mark the turn as resetting cooldowns (as a charged move does); push an `animate` event.
  - `blockDamage`: handled by `blocksDamage` before damage in `resolveCharged` (damage 1, like a shield; it also sets `incoming.blockedByMechanic` for the shield prompt). Skipped when the defender shielded.

  Call sites: `runBattle` raises `battleStart` for side 0 then side 1 before turn 1, then recomputes `state.usePriority` from the forms battle start left (PvPoke computes it after `battle_start` changes, `Battle.js:259`; a Minior entering as Core and switching to Meteor changes its Attack). `resolveCharged` raises `beforeChargedMove` (attacker, before damage), `shieldUsed` (defender, after it shields), then after damage and buffs `afterChargedMove` (attacker) and, when unshielded, `hitByChargedMove` (defender). `resolveFast` and `resolveCharged` raise `hpBelow` on whoever took damage (condition `fraction`, and hp > 0).

- [ ] **Step 1: Write the failing tests**, one per event and effect, on synthetic families (never real species names):

```ts
it('battleStart switches form and recomputes attack and defense, HP kept', ...);
it('hpBelow fires once when guarded by a form condition', ...);
it('beforeChargedMove switches form before damage, so damage uses the new attack', ...);
it('afterChargedMove picks a form by hpAbove / hpAtMost', ...);
it('conditions are read before effects: a two-rule toggle flips once per charged move', ...);
it('shieldUsed switches form on the defender', ...);
it('hitByChargedMove with blockDamage: 1 damage, form switched, defense -1, shield not prompted as needed', ...);   // blockedByMechanic true in IncomingCharged
it('blockDamage does nothing when the defender shields', ...);
it('fireMove resolves at once, unshieldable, even after its owner faints when ignoresFaint', ...);
it('replaceMove swaps a fast move and a charged move', ...);
it('switchForm to startForm returns to the form the battle began in', ...);
it('animate freezes N turns: turn counter advances, HP and energy do not move', ...);
```

- [ ] **Step 2: Run.** `npx vitest run --project battle packages/battle/test/mechanics-run.test.ts` -> FAIL.
- [ ] **Step 3: Implement** `mechanics.ts` and wire the call sites. No species id appears in any `src/rules/` file: `grep -rnE "mimikyu|aegislash|cramorant|morpeko|minior" packages/battle/src` must print nothing.
- [ ] **Step 4: Run** the whole battle project: `npx vitest run --project battle` -> PASS, and the grep above -> empty.
- [ ] **Step 5: Commit.** `git commit -m "battle: mechanics interpreter wired into the turn loop"`.

---

### Task 8: Default player

**Files:**
- Create: `packages/battle/src/player/default.ts`
- Test: `packages/battle/test/default-player.test.ts`

**Interfaces:**
- Consumes: `Player`, `BattleView`, `IncomingCharged` (Task 5); `damageOf` (Task 2).
- Produces: `export class DefaultPlayer implements Player` with no constructor arguments. Untuned, by design (spec: sensible, not graded):
  - `decide`: if the fast move knocks the opponent out, fast. Else among affordable charged moves, the one with the highest `damageOf` against the opponent's current state (ties: lower energy cost, then lower slot). Else fast.
  - `shield`: never when `incoming.blockedByMechanic`; otherwise when `incoming.damage >= view.self.hp` or `incoming.damage >= 0.3 * view.self.maxHp`. Name the 0.3 `THREAT_SHARE` at module top with a one-line comment that it is untuned.

- [ ] **Step 1: Write the failing tests:** a synthetic battle with `DefaultPlayer` on both sides finishes with an outcome other than `timeout`; it throws the affordable charged move with more damage; it shields a knockout hit; it does not shield a hit its mechanics block (synthetic `blockDamage` family); it plays fast when fast knocks out.
- [ ] **Step 2: Run.** `npx vitest run --project battle packages/battle/test/default-player.test.ts` -> FAIL.
- [ ] **Step 3: Implement.** Export from `src/index.ts`.
- [ ] **Step 4: Run.** -> PASS.
- [ ] **Step 5: Commit.** `git commit -m "battle: default player"`.

---

### Task 9: Datamine lock and fetch

**Files:**
- Create: `packages/data/datamine.lock.json`, `packages/data/src/datamine-lock.ts`, `packages/data/src/fetch-datamine.ts`, `packages/data/src/refresh-datamine.ts`
- Modify: `packages/data/src/paths.ts`, `packages/data/package.json`, `package.json`, `.gitignore`
- Test: `packages/data/test/datamine-lock.test.ts`, `packages/data/test/fetch-datamine.test.ts`

**Interfaces:**
- Produces: `datamine.lock.json`, exact content:

```json
{
  "repository": "https://github.com/PokeMiners/game_masters",
  "commit": "8e227be44f288d34463e23bf04e9b564d3c16f79",
  "date": "2026-08-29",
  "path": "latest/latest.json",
  "sha256": "5c947ac64d1de8859bea1b3bf044609d74b6e8429d53f8cb1aa30a72a46dce84"
}
```

- Produces (`paths.ts` additions): `DATAMINE_LOCK_PATH` (`packages/data/datamine.lock.json`), `DATAMINE_DIR` (`process.env.PICKTHREE_DATAMINE_DIR ?? packages/data/.datamine`), `BATTLE_INPUT_DIR` (`packages/data/battle`), `BATTLE_OUT_DIR` (`process.env.PICKTHREE_BATTLE_OUT ?? packages/data/.battle`).
- Produces (`datamine-lock.ts`): `interface DatamineLock { repository: string; commit: string; date: string; path: string; sha256: string }`, `readDatamineLock(file = DATAMINE_LOCK_PATH): DatamineLock` (same style and messages as `lock.ts`: `datamine.lock.json: commit must be a 40-char sha, got ...`, `sha256 must be 64 hex chars`), `writeDatamineLock(lock)`.
- Produces (`fetch-datamine.ts`): `datamineFile(lock): string` = `DATAMINE_DIR/<commit>.json`; `ensureDatamine(opts?: { fetchImpl?: typeof fetch; lock?: DatamineLock }): Promise<string>` returns the file path. Present and hash matches: return. Else download `https://raw.githubusercontent.com/PokeMiners/game_masters/<commit>/<path>` (derive owner/name from `repository`), write to `<file>.partial`, sha256 with `node:crypto`, mismatch: delete the partial and throw `datamine sha256 mismatch for <commit>: expected <a>, got <b>`; match: rename into place. A file already present with the wrong hash is deleted and re-downloaded. CLI guard like `fetch-pvpoke.ts` (`process.argv[1]?.endsWith('fetch-datamine.ts')`).
- Produces (`refresh-datamine.ts`): `git ls-remote <repository> HEAD`; same commit prints `already at upstream HEAD`; otherwise downloads the new file, computes its sha256, writes the lock with today's date, prints `bumped datamine.lock.json <old7> -> <new7>; run npm run battle:build, npm test`.
- Scripts: packages/data `"datamine:fetch": "tsx src/fetch-datamine.ts"`, `"datamine:refresh": "tsx src/refresh-datamine.ts"`; root `"datamine:fetch": "npm -w @pickthree/data run datamine:fetch"`, `"datamine:refresh": "npm -w @pickthree/data run datamine:refresh"`. `.gitignore` gains `packages/data/.datamine/` and `packages/data/.battle/` under the PvPoke checkout lines.

- [ ] **Step 1: Write the failing tests.** `datamine-lock.test.ts`: the committed lock reads, commit is 40 hex, sha256 64 hex, date ISO, repository is the PokeMiners URL; a temp lock with a short sha throws the named message. `fetch-datamine.test.ts` (temp `PICKTHREE_DATAMINE_DIR`, a fake `fetchImpl` serving a small body and a lock whose sha256 is that body's hash):

```ts
it('downloads, verifies and caches', async () => { ... expect(fs.readFileSync(p, 'utf8')).toBe(body); });
it('does not download again when the cached file matches', async () => { ... expect(calls).toBe(1); });
it('refuses a body whose hash does not match and leaves nothing behind', async () => {   // Review Focus 4
  await expect(ensureDatamine({ fetchImpl: serve('truncated'), lock })).rejects.toThrow(
    `datamine sha256 mismatch for ${lock.commit}: expected ${lock.sha256}, got ${sha('truncated')}`);
  expect(fs.readdirSync(dir)).toEqual([]);
});
it('replaces a cached file whose hash is wrong', async () => { ... });
```

- [ ] **Step 2: Run.** `npx vitest run --project data packages/data/test/datamine-lock.test.ts packages/data/test/fetch-datamine.test.ts` -> FAIL.
- [ ] **Step 3: Implement** the files and script entries.
- [ ] **Step 4: Run** the tests -> PASS. Then the real fetch: `npm run datamine:fetch` -> file at `packages/data/.datamine/8e227be44f288d34463e23bf04e9b564d3c16f79.json`, about 19.5 MB; a second run returns at once.
- [ ] **Step 5: Commit.** `git add packages/data/datamine.lock.json packages/data/src/datamine-lock.ts packages/data/src/fetch-datamine.ts packages/data/src/refresh-datamine.ts packages/data/src/paths.ts packages/data/package.json package.json .gitignore packages/data/test/datamine-lock.test.ts packages/data/test/fetch-datamine.test.ts` then `git commit -m "data: datamine lock and verified fetch"`.

---

### Task 10: Extraction from datamine templates

**Files:**
- Create: `packages/battle/src/extract/index.ts`, `templates.ts`, `settings.ts`, `moves.ts`, `species.ts`, `leagues.ts`
- Create: `packages/battle/test/fixtures/templates.ts`
- Test: `packages/battle/test/extract.test.ts`

**Interfaces:**
- Consumes: `BattleData` and friends (Task 1).
- Produces: `extractBattleData(templates: unknown, source: { commit: string; date: string }): { data: BattleData; warnings: string[] }` (`data.mechanics` is `{}`; Task 12 fills it). Exported from `@pickthree/battle/extract`. The input is the raw datamine array of `{ templateId, data }`. Unknown template kinds are ignored; a malformed template the extractor needs throws with its `templateId` in the message.

Extraction rules (each one is a test):

- **Types:** `typeEffective` templates. `types` is the order of `attackScalar` columns, which is the datamine's type enum order: normal, fighting, flying, poison, ground, rock, bug, ghost, steel, fire, water, grass, electric, psychic, ice, dragon, dark, fairy (derive from the `attackType` names in that order, lowercase, `POKEMON_TYPE_` stripped). `effectiveness[a][d] = Math.fround(attackScalar[d])`.
- **Settings:** `COMBAT_SETTINGS.combatSettings`: `stab = fround(sameTypeAttackBonusMultiplier)`, `fastBonus = fround(fastAttackBonusMultiplier)`, `chargedBonus = fround(chargeAttackBonusMultiplier)`, `shadowAtk = fround(shadowPokemonAttackBonusMultiplier)`, `shadowDef = fround(shadowPokemonDefenseBonusMultiplier)`, `maxEnergy`, `roundTurns = roundDurationSeconds / turnDurationSeconds`. `COMBAT_STAT_STAGE_SETTINGS.combatStatStageSettings`: `min = minimumStatStage`, `max = maximumStatStage`, `atk`/`def` = the multiplier arrays, each `fround`.
- **CPM:** `PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier` (index = whole level - 1). Output index `(level - 1) * 2`: whole levels `fround(v)`, half levels `Math.sqrt((a * a + b * b) / 2)` of the two fround'd neighbours.
- **Moves:** `combatMove` templates. Id: a string `uniqueId` as is; an integer `uniqueId` takes the template id with `^COMBAT_(V\d{4}_MOVE_|VM_MOVE_)` removed (`COMBAT_V0593_MOVE_DIVE` -> `DIVE`, `COMBAT_VM_MOVE_TEMP_EVOLUTION_MEGA_V0149_POKEMON_DRAGONITE` -> `TEMP_EVOLUTION_MEGA_V0149_POKEMON_DRAGONITE`). Keep a `number -> MoveId` map for species references. Category: id ends in `_FAST` -> fast. `power = power ?? 0`. Fast: `energyGain = energyDelta ?? 0`, `energy = 0`, `turns = (durationTurns ?? 0) + 1`. Charged: `energy = -(energyDelta ?? 0)`, `energyGain = 0`, `turns = 1`. Type from `type`. Buffs when any stage change is present: `chance = buffActivationChance ?? 1`, `self = { atk: attackerAttackStatStageChange ?? 0, def: attackerDefenseStatStageChange ?? 0 }` (omitted when both 0), `opponent` from `targetAttack...`/`targetDefense...` likewise.
- **Species:** `pokemonSettings` templates. A template with `form` gets id `form.toLowerCase()` with a trailing `_normal` removed; skipped when the family's `formSettings` marks that form `isCostume: true`. A template without `form` gets id `pokemonId.toLowerCase()` and is kept only when no kept form template of the same `pokemonId` has equal base stats and types (keeps Minior's formless Meteor, drops Bulbasaur's duplicate); on an id collision the form template wins. `dex` from `^V(\d{4})_`. `family = pokemonId.toLowerCase()`. `baseStats` from `stats` (`baseAttack`, `baseDefense`, `baseStamina`). Types from `type`/`type2`. `fast = quickMoves + eliteQuickMove`, `charged = cinematicMoves + eliteCinematicMove + nonTmCinematicMoves` (deduplicated, order kept), `eliteFast`/`eliteCharged` the elite lists; integer refs resolve through the move map, an unresolved ref is dropped with warning `species <id>: move ref 9999 has no combatMove template` (Review Focus 1). `shadow` from `pokemonSettings.shadow`: `{ charged: shadowChargeMove, purifiedCharged: purifiedChargeMove }`, else `null`.
- **Megas:** for a kept species whose id equals its family (the canonical form), each `tempEvoOverrides` entry with `stats` adds a species: id `<family>_mega`, `_mega_x`, `_mega_y` or `_primal` from `tempEvoId` (`TEMP_EVOLUTION_MEGA`, `_MEGA_X`, `_MEGA_Y`, `_PRIMAL`); types from `typeOverride1`/`typeOverride2`, falling back to the base's; moves copied from the base plus the Mega move whose id is `TEMP_EVOLUTION_<SUFFIX>_V<dex4>_POKEMON_<POKEMONID>` when that move exists; `tags: ['mega']`.
- **Leagues:** `combatLeague` templates. Id = template id minus `COMBAT_LEAGUE_`, lowercase. `title`, `enabled`, `leagueType`, `pokemonCount`, `allowMegas = allowTempEvos === true`. From `pokemonCondition`: `WITH_POKEMON_CP_LIMIT` -> `cpCap`; `POKEMON_LEVEL_RANGE` -> `maxLevel`; `WITH_UNIQUE_POKEMON` -> `unique`; `WITH_POKEMON_TYPE` -> `types`; `POKEMON_WHITELIST` -> `allowed`; `POKEMON_BANLIST` entries plus top-level `bannedPokemon` -> `banned`; `POKEMON_CAUGHT_TIMESTAMP` -> `caughtWindow` (numbers). A `FamilyRef` form list maps `FORM_UNSET` and `<X>_NORMAL` to the family id and other forms by the species id rule; no `forms` means `null` (all forms). Any other condition type adds warning `league <id>: condition <TYPE> not modelled`.

- [ ] **Step 1: Write the template builders** in `test/fixtures/templates.ts`: `tCombatMove(templateId, combatMove)`, `tPokemon(templateId, pokemonSettings)`, `tForms(pokemon, forms)`, `tType(attackType, attackScalar)`, `tCombatSettings(over)`, `tStageSettings(over)`, `tPlayerLevel(cpMultiplier)`, `tLeague(templateId, combatLeague)`, and `minimalTemplates()` returning the smallest valid set (18 type templates with neutral scalars, settings, stage settings, a 3-level CPM table).
- [ ] **Step 2: Write the failing tests**, one per rule above, all synthetic (invented species and moves such as `FAKEMON`, `ZAP_FAST`; values chosen in the test). Include: a 3-turn fast move from `durationTurns: 2`; an integer `uniqueId` named from the template id and resolved from a species pool; a costume form skipped; a formless base kept when its stats differ and dropped when equal; a Mega with type overrides and its Mega move; a league with CP cap, types, ban list with forms, and an unmodelled condition warning; the unresolved move ref warning (Review Focus 1); CPM half level equals `Math.sqrt((a*a + b*b) / 2)`; `settings.fastBonus === Math.fround(1.3)`.
- [ ] **Step 3: Run.** `npx vitest run --project battle packages/battle/test/extract.test.ts` -> FAIL.
- [ ] **Step 4: Implement** the extract files. The output must pass `loadBattleData` (call it at the end of `extractBattleData` so a broken extraction fails at once).
- [ ] **Step 5: Run.** -> PASS. Typecheck and lint clean.
- [ ] **Step 6: Commit.** `git commit -m "battle: extract game data from datamine templates"`.

---

### Task 11: Overrides

**Files:**
- Create: `packages/battle/src/extract/overrides.ts`
- Test: `packages/battle/test/overrides.test.ts`

**Interfaces:**
- Consumes: `BattleData` (Task 1).
- Produces:

```ts
export interface OverrideEntry {
  kind: 'move' | 'species';
  id: string;
  add?: Record<string, unknown>;     // a whole new entry (id taken from `id`)
  set?: Record<string, unknown>;     // fields patched on an existing entry
  source: string; entered: string;   // entered YYYY-MM-DD
}
export interface OverrideReport { applied: string[]; redundant: string[]; conflicts: string[] }
export function validateOverrides(raw: unknown): OverrideEntry[];
export function applyOverrides(data: BattleData, entries: readonly OverrideEntry[]): { data: BattleData; report: OverrideReport };
```

  YAML shape (Task 12 parses it): top-level `moves:` and `species:` lists; each item has `id`, exactly one of `add` / `set`, `source`, `entered`. `validateOverrides` throws `overrides.yaml: moves[2].entered "2026-13-01" must be YYYY-MM-DD` style messages (file, list, index, field). `applyOverrides` works on a copy; throws `overrides.yaml: moves[0] set targets GULP_MISSILE_X, which is not in the datamine` for a `set` on a missing id. For an `add` whose id the datamine already has: if every added field equals the datamine's, the entry goes to `redundant`; otherwise to `conflicts` (`overrides.yaml: moves[1] adds AEGISLASH_CHARGE_AIR_SLASH but the datamine now has it with different values (energyGain 6 vs 5); review the entry`) and the datamine's entry is kept. A `set` whose fields all already equal the datamine's goes to `redundant` (`overrides.yaml: moves[0] GULP_MISSILE_GULPING is redundant: the datamine agrees; delete the entry`). Results pass `loadBattleData` (call it at the end).

- [ ] **Step 1: Write the failing tests:** `set` patches a field; `add` creates a move; redundant `set` reported; redundant `add` reported; conflicting `add` reported and datamine kept; each malformed case from Review Focus 5 throws its exact message (missing `source`, bad `entered`, both `add` and `set`, `set` on a missing id).
- [ ] **Step 2: Run.** `npx vitest run --project battle packages/battle/test/overrides.test.ts` -> FAIL.
- [ ] **Step 3: Implement.** Export from `src/extract/index.ts`.
- [ ] **Step 4: Run.** -> PASS.
- [ ] **Step 5: Commit.** `git commit -m "battle: sourced, dated overrides with redundancy report"`.

---

### Task 12: Mechanics file, alarm, and the battle:build step

**Files:**
- Create: `packages/battle/src/extract/alarm.ts`
- Create: `packages/data/battle/overrides.yaml`, `packages/data/battle/mechanics.yaml`, `packages/data/src/build-battle.ts`
- Modify: `packages/data/package.json` (dependencies `"@pickthree/battle": "0.0.0"`, `"yaml": "2.8.1"`; script `"battle:build": "tsx src/build-battle.ts"`), `package.json` (root `"battle:build": "npm -w @pickthree/data run battle:build"`), `packages/data/tsconfig.json` (include `../battle/src/**/*.ts`)
- Test: `packages/battle/test/alarm.test.ts`, `packages/data/test/build-battle.test.ts`

**Interfaces:**
- Consumes: `extractBattleData`, `validateOverrides`, `applyOverrides` (Tasks 10, 11), `validateMechanics` (Task 3), `ensureDatamine`, `readDatamineLock` (Task 9).
- Produces (`alarm.ts`): `unmodelledForms(templates: unknown, mechanics: Record<string, MechanicsEntry>): string[]` returning, sorted, every family whose `pokemonSettings.ibfc.combatEnable === true` has no mechanics entry; and `ibfcFamilies(templates: unknown): string[]`.
- Produces (`build-battle.ts`): `buildBattleData(input: { templates: unknown; overridesYaml: string; mechanicsYaml: string; source: { commit: string; date: string } }): { data: BattleData; warnings: string[]; report: OverrideReport; alarm: string[] }` (pure; order: extract, validate and apply overrides, validate mechanics against the overridden data, set `data.mechanics`, `loadBattleData`, alarm). The CLI part: `ensureDatamine()`, read the two YAML files from `BATTLE_INPUT_DIR`, run, write `BATTLE_OUT_DIR/battle-data.json`, print counts (species, moves, leagues, mechanics), every warning, the override report, and for a non-empty alarm a banner on stderr:

```
==============================================================
UNMODELLED IN-BATTLE FORM CHANGE: aegislash
The datamine flags these families with ibfc.combatEnable but
packages/data/battle/mechanics.yaml has no entry for them.
==============================================================
```

  The CLI exits 1 on a non-empty alarm or any override conflict, 0 otherwise.

- Seed `packages/data/battle/overrides.yaml` (exact values; comments allowed in YAML, no em dashes):

```yaml
# Hand-kept patches for the days the datamine lags. Every entry is sourced and dated.
# battle:build reports an entry as redundant once the datamine agrees; delete it then.
moves:
  - id: GULP_MISSILE_GULPING
    set: { power: 15, damageKind: percentMaxHp, type: water }
    source: "Community-measured: Gulp Missile deals 15 percent of the target's max HP plus 1. Datamine 8e227be has the move (594) with no power. First-hand evidence wanted."
    entered: 2026-10-27
  - id: GULP_MISSILE_GORGING
    set: { power: 15, damageKind: percentMaxHp, type: water }
    source: "As GULP_MISSILE_GULPING (595)."
    entered: 2026-10-27
  - id: AEGISLASH_CHARGE_PSYCHO_CUT
    add: { type: psychic, category: fast, power: 0, energy: 0, energyGain: 6, turns: 2 }
    source: "Community-documented: Aegislash Shield Forme fast attacks do minimal damage and give 6 energy. Not in the datamine. First-hand evidence wanted."
    entered: 2026-10-27
  - id: AEGISLASH_CHARGE_AIR_SLASH
    add: { type: flying, category: fast, power: 0, energy: 0, energyGain: 6, turns: 3 }
    source: "As AEGISLASH_CHARGE_PSYCHO_CUT."
    entered: 2026-10-27
species: []
```

  (The `type: water` on Gulp Missile: the datamine says NORMAL; the community-known type is Water. If Travis disagrees, drop that field.)

- Seed `packages/data/battle/mechanics.yaml`:

```yaml
# In-battle form changes, written in the fixed vocabulary of packages/battle/src/mechanics/vocabulary.ts.
# A species that needs a trigger or effect not listed there is a code change.
mimikyu:
  source: "Datamine 8e227be ibfc on V0778_POKEMON_MIMIKYU (BEFORE_CM_ATTACKER, 5 turns); Disguise from the game."
  entered: 2026-10-27
  resetOnSwitchOut: false
  rules:
    - when: { event: hitByChargedMove, form: mimikyu_disguised }
      do:
        - { effect: blockDamage }
        - { effect: switchForm, to: mimikyu_busted }
        - { effect: statStages, target: self, def: -1 }
        - { effect: animate, turns: 5 }
aegislash:
  source: "Datamine 8e227be ibfc on V0681_POKEMON_AEGISLASH (BEFORE_CM_ATTACKER, 5 turns); Shield fast moves from overrides.yaml."
  entered: 2026-10-27
  resetOnSwitchOut: true
  rules:
    - when: { event: battleStart, form: aegislash_shield }
      do:
        - { effect: replaceMove, from: PSYCHO_CUT_FAST, to: AEGISLASH_CHARGE_PSYCHO_CUT }
        - { effect: replaceMove, from: AIR_SLASH_FAST, to: AEGISLASH_CHARGE_AIR_SLASH }
    - when: { event: beforeChargedMove, form: aegislash_shield }
      do:
        - { effect: switchForm, to: aegislash_blade }
        - { effect: replaceMove, from: AEGISLASH_CHARGE_PSYCHO_CUT, to: PSYCHO_CUT_FAST }
        - { effect: replaceMove, from: AEGISLASH_CHARGE_AIR_SLASH, to: AIR_SLASH_FAST }
        - { effect: animate, turns: 5 }
    - when: { event: shieldUsed, form: aegislash_blade }
      do:
        - { effect: switchForm, to: aegislash_shield }
        - { effect: replaceMove, from: PSYCHO_CUT_FAST, to: AEGISLASH_CHARGE_PSYCHO_CUT }
        - { effect: replaceMove, from: AIR_SLASH_FAST, to: AEGISLASH_CHARGE_AIR_SLASH }
        - { effect: animate, turns: 5 }
cramorant:
  source: "Datamine 8e227be ibfc on V0845_POKEMON_CRAMORANT (combatEnable, no settings); Gulp Missile moves 594/595."
  entered: 2026-10-27
  resetOnSwitchOut: true
  rules:
    - when: { event: afterChargedMove, moves: [DIVE, SURF], form: cramorant, hpAbove: 0.5 }
      do: [{ effect: switchForm, to: cramorant_gulping }]
    - when: { event: afterChargedMove, moves: [DIVE, SURF], form: cramorant, hpAtMost: 0.5 }
      do: [{ effect: switchForm, to: cramorant_gorging }]
    - when: { event: hitByChargedMove, form: cramorant_gulping }
      do:
        - { effect: fireMove, move: GULP_MISSILE_GULPING, ignoresFaint: true }
        - { effect: switchForm, to: cramorant }
    - when: { event: hitByChargedMove, form: cramorant_gorging }
      do:
        - { effect: fireMove, move: GULP_MISSILE_GORGING, ignoresFaint: true }
        - { effect: switchForm, to: cramorant }
morpeko:
  source: "Datamine 8e227be ibfc on V0877_POKEMON_MORPEKO (AFTER_CM_ATTACKER, 5 turns, move 406 <-> 407)."
  entered: 2026-10-27
  resetOnSwitchOut: true
  rules:
    - when: { event: afterChargedMove, form: morpeko_full_belly }
      do:
        - { effect: switchForm, to: morpeko_hangry }
        - { effect: replaceMove, from: AURA_WHEEL_ELECTRIC, to: AURA_WHEEL_DARK }
        - { effect: animate, turns: 5 }
    - when: { event: afterChargedMove, form: morpeko_hangry }
      do:
        - { effect: switchForm, to: morpeko_full_belly }
        - { effect: replaceMove, from: AURA_WHEEL_DARK, to: AURA_WHEEL_ELECTRIC }
        - { effect: animate, turns: 5 }
minior:
  source: "Not flagged in datamine 8e227be. Meteor until below half HP, then Core (in-game, 2026 season). Animation length unconfirmed; 5 turns as the other ibfc species."
  entered: 2026-10-27
  resetOnSwitchOut: false
  rules:
    - when: { event: battleStart, form: [minior_blue, minior_green, minior_indigo, minior_orange, minior_red, minior_violet, minior_yellow] }
      do: [{ effect: switchForm, to: minior }]
    - when: { event: hpBelow, fraction: 0.5, form: minior }
      do:
        - { effect: switchForm, to: startForm }
        - { effect: animate, turns: 5 }
```

- [ ] **Step 1: Write the failing tests.** `alarm.test.ts` (synthetic templates): a flagged family without an entry is returned; with an entry it is not; `combatEnable: false` is ignored. `build-battle.test.ts` has two parts. Synthetic: `buildBattleData` on `minimalTemplates()` plus a tiny YAML pair returns mechanics keyed by family and an empty alarm; a YAML syntax error surfaces with `overrides.yaml` in the message. Live (skip unless the datamine file exists; when `PICKTHREE_REQUIRE_DATAMINE === '1'` and it is missing, throw `Datamine missing. Run npm run datamine:fetch`, mirroring `build-gamedata.test.ts`), invariants only:

```ts
it('the committed overrides and mechanics build cleanly on the pinned datamine', () => {
  const r = buildBattleData({ templates, overridesYaml, mechanicsYaml, source });
  expect(r.alarm).toEqual([]);
  expect(r.report.conflicts).toEqual([]);
  expect(Object.keys(r.data.mechanics).sort()).toEqual(['aegislash', 'cramorant', 'mimikyu', 'minior', 'morpeko']);
  expect(Object.keys(r.data.species).length).toBeGreaterThan(1000);
});
it('every ibfc-flagged family has a mechanics entry', () => {
  for (const f of ibfcFamilies(templates)) { expect(Object.keys(r.data.mechanics)).toContain(f); }
});
```

- [ ] **Step 2: Run.** `npx vitest run --project battle packages/battle/test/alarm.test.ts` and `npx vitest run --project data packages/data/test/build-battle.test.ts` -> FAIL.
- [ ] **Step 3: Implement** `alarm.ts`, `build-battle.ts`; add the dependencies (exact versions) and run `npm install`; write the two YAML files.
- [ ] **Step 4: Run** both tests -> PASS. Then `npm run battle:build` -> exit 0, writes `packages/data/.battle/battle-data.json`, prints counts and no alarm. Then prove the alarm: temporarily delete the `mimikyu:` block, rerun -> the banner naming `mimikyu`, exit 1; restore the block.
- [ ] **Step 5: Commit.** `git add packages/battle/src/extract/alarm.ts packages/battle/test/alarm.test.ts packages/data/battle/overrides.yaml packages/data/battle/mechanics.yaml packages/data/src/build-battle.ts packages/data/test/build-battle.test.ts packages/data/package.json packages/data/tsconfig.json package.json package-lock.json` then `git commit -m "data: battle:build with overrides, mechanics file and unmodelled-form alarm"`.

---

### Task 13: Our mechanics file runs in battle

The rules exam (Tasks 14-16) runs PvPoke's form behaviour transcribed into our vocabulary, never the entries we ship. This task runs every entry in `packages/data/battle/mechanics.yaml` in a real battle on our own extracted data (spec, The exam, "Our own mechanics file runs too", amended a524595). Invariants only, no pinned numbers.

**Files:**
- Create: `packages/data/test/live-data.ts`, `packages/data/test/mechanics-live.test.ts`
- Modify: `packages/data/test/build-battle.test.ts` (use the shared loader)

**Interfaces:**
- Consumes: `buildBattleData` (Task 12), `readDatamineLock`, `datamineFile` (Task 9), `BATTLE_INPUT_DIR` (Task 9), `runBattle`, `TurnRecord`, `BattleEvent` (Task 6), `Player`, `BattleView`, `RandomSource`, `seededRandom` (Task 5), `damageOf` (Task 2).
- Produces (`test/live-data.ts`): `liveBattleData(): BattleData | null`. Returns `null` when the pinned datamine file is absent; throws `Datamine missing. Run npm run datamine:fetch` when it is absent and `PICKTHREE_REQUIRE_DATAMINE === '1'`. Otherwise reads the datamine and the two committed YAML files, runs `buildBattleData`, caches the result for the test run. Task 12's live test switches to it.
- Test helpers (local to `mechanics-live.test.ts`, not exported from any package):
  - `policy(opts: { slot?: number; when?: (v: BattleView) => boolean; shields?: boolean[] }): Player`: fires `slot` (default 0) whenever affordable and `when` (default always) holds, otherwise fast; answers shield prompts from `shields` in order, `false` when exhausted.
  - `side(formId, fastMove, chargedMove, shields, level = 20): SideSetup` with IVs 15/15/15 (chosen here, not PvPoke values).
  - `plainOpponent(data, formId, level): SideSetup`: that species' first fast move and first charged move without `buffs`; throws `no unbuffed charged move for <formId>` otherwise. The opponent is `azumarill` unless a scenario says otherwise, so no opponent stage change muddies a stage assertion.
  - `turnOf(trace, pred: (e: BattleEvent) => boolean): number` (first turn with a matching event; throws `scenario never reached: <label>` when none, so a scenario that silently stops exercising its entry fails loudly).
  - `stateAt(data, setup, players, turn)`: reruns the same battle with `maxTurns: turn` and returns `final`, to read stages that the trace does not carry.
  - `assertFrozen(trace)`: for every `animate` event with `turns: N` at turn t (the stated `N` is read from the mechanics entry), records t+1 .. t+N have the same `hp` and `energy` as record t and no events.
- Move names come from each species' datamine pool (`SHADOW_CLAW_FAST`, `PLAY_ROUGH`, `PSYCHO_CUT_FAST`, `GYRO_BALL`, `WATER_GUN_FAST`, `DIVE`, `THUNDER_SHOCK_FAST`, `AURA_WHEEL_ELECTRIC`, `ROLLOUT_FAST`, `POWER_GEM`). If one ever leaves the pool, `createBattle` names it; fix the test, not the data.

- [ ] **Step 1: Write the failing tests** in `mechanics-live.test.ts` (`describe.skipIf(liveBattleData() === null)`), one `describe` per family plus a coverage check:

```ts
it('every family in mechanics.yaml has a scenario here', () => {
  expect(Object.keys(data.mechanics).sort()).toEqual(Object.keys(SCENARIOS).sort());
});

describe('mimikyu', () => {
  // mimikyu_disguised, 0 shields, vs plainOpponent firing when affordable
  it('the first unshielded charged hit deals 1 damage, busts the disguise, Defense -1', () => {
    const t = turnOf(r.trace, (e) => e.kind === 'charged' && e.actor === 1);
    const hit = r.trace[t - 1]!.events.find((e) => e.kind === 'charged' && e.actor === 1)!;
    expect(hit.damage).toBe(1);
    expect(r.trace[t - 1]!.forms[0]).toBe('mimikyu_busted');
    expect(stateAt(data, setup, players, t).sides[0].team[0]!.defStage).toBe(-1);
  });
  it('a shielded hit leaves the disguise up', ...);       // 1 shield, shields: [true]; form after that turn still mimikyu_disguised
  it('the bust animation freezes the stated turns', () => { assertFrozen(r.trace); });
});

describe('aegislash', () => {
  it('starts in Shield form with the charge fast moves', ...);   // trace[0].forms[0] aegislash_shield; first fast event move AEGISLASH_CHARGE_PSYCHO_CUT
  it('flips to Blade on its charged move, before damage', ...);  // the turn of its first charged event has a form event to aegislash_blade ahead of the charged event; later fast events use PSYCHO_CUT_FAST
  it('goes back to Shield when it shields', ...);                // 1 shield, shields: [true], opponent fires; after the shield event the form is aegislash_shield and fast events use AEGISLASH_CHARGE_PSYCHO_CUT again
  it('each form change freezes the stated turns', () => { assertFrozen(r.trace); });
});

describe('cramorant', () => {
  it('Dive above half HP makes it gulping; the next charged hit fires Gulp Missile and returns it to base', ...);
  // policy fires DIVE at once; after its charged event, forms[0] cramorant_gulping;
  // the turn of the next opponent charged event on it also has a fire event
  // (move GULP_MISSILE_GULPING, actor 0) and forms[0] back to cramorant
  it('Dive at or below half HP makes it gorging and fires the gorging missile', ...);
  // policy when: v => v.self.hp / v.self.maxHp <= 0.5
  it('Gulp Missile still fires when the hit knocks Cramorant out', ...);
  // search opponent levels 20, 25, ... 50 for a run where the hit after gorging leaves Cramorant at 0;
  // assert at least one such run exists and that its final turn has the fire event and the opponent lost HP to it
});

describe('morpeko', () => {
  it('toggles form and Aura Wheel on every charged move', ...);
  // across its charged events in order: moves alternate AURA_WHEEL_ELECTRIC, AURA_WHEEL_DARK, ...;
  // forms after each alternate morpeko_hangry, morpeko_full_belly, ...; at least two charged events
  it('each toggle freezes the stated turns', () => { assertFrozen(r.trace); });
});

describe('minior', () => {
  it('registered as a color form, it starts in Meteor form', ...);   // side('minior_red', ...); trace[0].forms[0] is 'minior'
  it('turns Core (its own color) once below half HP, and only once', ...);
  // the first record with hp[0] / maxHp < 0.5 has forms[0] 'minior_red' and a form event; exactly one form event after battle start
  it('the Core animation freezes the stated turns', () => { assertFrozen(r.trace); });
});
```

  `maxHp` for the Minior and Cramorant ratios comes from `stateAt(..., 1)` (the trace carries HP, not max HP).
- [ ] **Step 2: Run.** `npx vitest run --project data packages/data/test/mechanics-live.test.ts` -> FAIL (helpers missing).
- [ ] **Step 3: Implement** `live-data.ts` and the helpers; switch `build-battle.test.ts` to `liveBattleData()`. A failing scenario is either a wrong mechanics entry (fix `mechanics.yaml`, commit it with the test) or an engine bug (fix it in `packages/battle` with a synthetic unit test pinning the behaviour, per Task 7's style).
- [ ] **Step 4: Run.** The same command -> PASS with the datamine present; with `PICKTHREE_DATAMINE_DIR` pointed at an empty temp dir and `PICKTHREE_REQUIRE_DATAMINE=1` -> fails with the "Datamine missing" message; without the REQUIRE variable -> skipped.
- [ ] **Step 5: Commit.** `git add packages/data/test/live-data.ts packages/data/test/mechanics-live.test.ts packages/data/test/build-battle.test.ts` (plus any `mechanics.yaml` or `packages/battle` fix with its test) then `git commit -m "data: run every shipped mechanics entry in a battle on our data"`.

---

### Task 14: Exam harness, PvPoke context and converter

**Files:**
- Modify: `packages/sim-pvpoke/src/node-host.ts`, `packages/sim-pvpoke/src/index.ts`
- Create: `packages/data/src/exam/pvpoke-types.ts`, `packages/data/src/exam/convert.ts`, `packages/data/src/exam/pvpoke-mechanics.yaml`
- Test: `packages/sim-pvpoke/test/node-host.test.ts` (extend), `packages/data/test/exam/convert.test.ts`

**Interfaces:**
- Produces (`node-host.ts`): `createPvPokeContext(gamemaster: unknown): PvPokeContext` with `export interface PvPokeContext { runtime: PvPokeRuntime; evaluate<T>(expression: string): T }` where `evaluate` runs `vm.Script(expression).runInContext(context)` (this reaches top-level `class` bindings such as `TimelineAction` and `DamageMultiplier`, which are not properties of the global object). `loadPvPokeInNode(gm)` becomes `createPvPokeContext(gm).runtime`, behaviour unchanged. Export `createPvPokeContext` and the type from `index.ts`.
- Produces (`pvpoke-types.ts`): the extra shapes the harness reads, e.g. `PvPokeCombatant extends PvPokePokemon { energy: number; statBuffs: [number, number]; activeFormId: string; cpm: number; types: string[]; setShadowType(t: 'normal' | 'shadow'): void }`, `PvPokeSandboxBattle extends PvPokeBattle { setSandboxMode(v: boolean): void; setActions(a: unknown[]): void; getActions(): { processed: boolean }[]; step(): void; getTurns(): number }`, the raw game master move/pokemon fields the converter reads.
- Produces (`convert.ts`): `pvpokeToBattleData(ctx: PvPokeContext, mechanicsYaml: string, commit: string): BattleData`. Built entirely from PvPoke so both engines run on the same numbers (spec, The exam, "Same numbers on both sides"):
  - species from `gm.data.pokemon`: id = `speciesId`; `family` = the `pvpoke-mechanics.yaml` key whose rules name this form (in a `form` condition or a `switchForm.to`), else `speciesId`, assigned before `validateMechanics` runs; base stats; types (drop `'none'`); `fast`/`charged` from `fastMoves`/`chargedMoves` plus `extraChargedMoves`; `shadow` from the `shadoweligible` tag (the moves `FRUSTRATION`/`RETURN`); `dex`.
  - moves from `gm.data.moves`: category from `energyGain > 0` (fast) else charged, or the explicit `category` field when present; `power`, `energy`, `energyGain`, `turns`; buffs from `buffs`/`buffTarget`/`buffsSelf`/`buffsOpponent`/`buffApplyChance` (string, `parseFloat`): target `self` -> `self`, `opponent` -> `opponent`, `both` -> both; `damageMethod: 'percentMaxHP'` -> `damageKind: 'percentMaxHp'`.
  - settings: `stab = evaluate('DamageMultiplier.STAB')`, `fastBonus = chargedBonus = evaluate('DamageMultiplier.BONUS')`, `shadowAtk/shadowDef` from `DamageMultiplier.SHADOW_ATK/SHADOW_DEF`, `maxEnergy` 100, `roundTurns` 480 (PvPoke's 240000 ms guard), stages from `gm.data.settings.maxBuffStages` and `buffDivisor` with PvPoke's formula (`(d + n) / d` for n > 0, `d / (d - n)` otherwise).
  - types: the 18 lowercase names; `effectiveness[a][d] = evaluate('DamageCalculator').getEffectiveness(a, [d])`.
  - cpm: for each half level 1..55, a fresh `Pokemon` set to that level, read `.cpm`.
  - leagues `{}`; mechanics: `validateMechanics(parse(mechanicsYaml), data)`.
- Produces `pvpoke-mechanics.yaml`: PvPoke's form behaviour transcribed into our vocabulary from `pokemon.json` `formChange` and the `Battle.js` special cases, each rule with a comment citing the line (`Battle.js:1031` activate_charged, `:1205` activate_shield, `:1281` and `:1629` Mimikyu protect and busted, `:1555-1634` charged_move and Cramorant Gulp Missile, `:1644` hp trigger; `Pokemon.js:2495` nativeStatBuffs, `:2503-2521` replaceMove). Same shape as our `mechanics.yaml` but with PvPoke ids (`mimikyu`, `mimikyu_busted`, `aegislash_shield`, `aegislash_blade`, `cramorant`, `cramorant_gulping`, `cramorant_gorging`, `morpeko_full_belly`, `morpeko_hangry`, `minior_core`, `minior_meteor`) and PvPoke moves (`AEGISLASH_CHARGE_*`, `GULP_MISSILE_ARROKUDA`, `GULP_MISSILE_PIKACHU`, `AURA_WHEEL_ELECTRIC`, `AURA_WHEEL_DARK`). No `animate` effects anywhere (PvPoke has no turn cost); Minior's `animationTime` cannot be expressed and is left out with a comment pointing at the differences list. Aegislash needs no `battleStart` replace (PvPoke's `aegislash_shield` species already carries the charge moves).

- [ ] **Step 1: Write the failing tests.** `node-host.test.ts`: `createPvPokeContext(gm).evaluate<number>('DamageMultiplier.STAB')` is a number greater than 1 and `evaluate('typeof TimelineAction')` is `'function'` (skip without a checkout, like the golden test). `convert.test.ts` (live, `describe.skipIf(!havePvPoke)`, `PICKTHREE_REQUIRE_PVPOKE` throws when missing), invariants only: `loadBattleData` accepts the result; every PvPoke species with base stats appears; every move referenced by a species exists; `effectiveness` is 18 x 18; the five families have mechanics; `formStats` for a species at level 20 equals PvPoke's `stats.atk/def` for the same IVs and level (a handful of species, compared to each other, not to a pinned number).
- [ ] **Step 2: Run.** `npx vitest run --project sim-pvpoke packages/sim-pvpoke/test/node-host.test.ts` and `npx vitest run --project data packages/data/test/exam/convert.test.ts` -> FAIL.
- [ ] **Step 3: Implement.** Re-run `npx vitest run --project sim-pvpoke` to confirm the golden test still passes (the refactor is behaviour-neutral).
- [ ] **Step 4: Run** the two tests -> PASS.
- [ ] **Step 5: Commit.** `git commit -m "exam: PvPoke vm context, game master converter, PvPoke mechanics transcription"` (stage the five source files and two tests explicitly).

---

### Task 15: Script runners and expansion

**Files:**
- Create: `packages/data/src/exam/run-pvpoke.ts`, `packages/data/src/exam/run-ours.ts`, `packages/data/src/exam/expand.ts`
- Test: `packages/data/test/exam/runners.test.ts`

**Interfaces:**
- Consumes: `createPvPokeContext` (Task 14), `pvpokeToBattleData` (Task 14), `runBattle`, `ScriptedPlayer`, `scriptedRandom`, `ScriptEntry` (Tasks 5, 6).
- Produces:

```ts
export interface ExamSide {
  speciesId: string; level: number; ivs: { atk: number; def: number; hp: number };
  fastMove: string; chargedMoves: [string] | [string, string]; shadow?: boolean; shields: number;
}
export interface ExamTurn { turn: number; hp: [number, number]; energy: [number, number]; forms: [string, string] }
export interface ExamRun { trace: ExamTurn[]; executed: ScriptEntry[]; notes: string[] }

// run-pvpoke.ts
export function runPvPokeScript(ctx: PvPokeContext, sides: [ExamSide, ExamSide], script: readonly ScriptEntry[]): ExamRun;
// run-ours.ts
export function runOursScript(data: BattleData, sides: [ExamSide, ExamSide], script: readonly ScriptEntry[]): ExamRun;
// expand.ts
export interface SidePolicy { slot: number; times: number }    // fire this slot whenever affordable, up to `times`; times 0 = fast only
export interface PolicyScript {
  id: string; covers: string[]; sides: [ExamSide, ExamSide]; policy: [SidePolicy, SidePolicy];
  shields: [boolean[], boolean[]];   // per side: answers for that side's shield prompts, in order; missing = false
  buffs: boolean[];                  // answers for chance buff rolls, in order; missing = false
}
export function expandScript(data: BattleData, s: PolicyScript): ScriptEntry[];
```

  `runPvPokeScript`: new `Battle`, `setCP(1500)`, `setLevelCap(51)`, two `Pokemon` built like `PvPokeSimulator.buildPokemon` (IVs then `setLevel`, `selectMove`), `setShadowType('shadow')` when asked, `setNewPokemon(p, i, false)`, `reset()`, `setShields`; `setSandboxMode(true)` then `setActions(script.map(e => new TimelineAction('charged', e.actor, e.turn, e.slot, { shielded: e.shielded, buffs: e.buff ?? false, priority: 0 })))` with `TimelineAction` from `ctx.evaluate`. Wrap the instance's `step` (`const inner = battle.step; battle.step = () => { inner(); record(); }`) so each call records `{ turn: battle.getTurns() - 1, hp, energy, forms: activeFormId }`. After `simulate()`, `executed` = the script entries whose action has `processed === true`. If Minior does not start in Meteor form under sandbox, patch `start` inside the vm the same way (wrap, apply the `battle_start` change) and push a line to `notes` saying so; otherwise no patch.
  `runOursScript`: `runBattle(data, setup, [new ScriptedPlayer(0, script), new ScriptedPlayer(1, script)], scriptedRandom(script), { trace: true })`; map `TurnRecord` to `ExamTurn`, dropping `events` and `hash` (PvPoke has no state hash to compare); `executed` = script entries matched by a `charged` event with the same actor, turn and slot.
  `expandScript`: runs our engine with a policy player (local to `expand.ts`: decides charged `slot` when affordable while its count is under `times`; shield answers from `shields[self]` in prompt order; a recording `RandomSource` answering from `buffs` in roll order) and records each fired charged move as a `ScriptEntry` with the shield answer given to it and the buff answer used for it. Our own scripted rerun of the result must reproduce the policy run; `expandScript` asserts that and throws `expandScript <id>: scripted rerun diverged at turn <n>` otherwise.

- [ ] **Step 1: Write the failing tests** (live, skip without a checkout): a fast-only mirror (`times: 0` both sides) gives traces of the same length from both runners with `executed` empty; a script with one charged move on side 0 is executed by both runners (`executed` has it); `expandScript` is deterministic (two calls deep-equal); the rerun check holds.
- [ ] **Step 2: Run.** `npx vitest run --project data packages/data/test/exam/runners.test.ts` -> FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run.** -> PASS.
- [ ] **Step 5: Commit.** `git commit -m "exam: sandbox runner, our runner, policy expansion"`.

---

### Task 16: The rules exam and the known-differences list

**Files:**
- Create: `packages/data/src/exam/scripts.ts`, `packages/data/src/exam/judge.ts`, `packages/data/battle/differences.yaml`
- Test: `packages/data/test/exam/rules-exam.test.ts`, `packages/data/test/exam/judge.test.ts`

**Interfaces:**
- Consumes: Tasks 14, 15.
- Produces (`judge.ts`):

```ts
export interface Difference { id: string; behaviour: string; ours: string; pvpoke: string; evidence: string; scripts: string[] }
export interface ScriptVerdict { id: string; status: 'match' | 'explained' | 'mismatch' | 'unexecuted'; firstDiff: string | null; explainedBy: string | null }
export function validateDifferences(raw: unknown): Difference[];      // 'differences.yaml: [2].evidence is required' style
export function firstDifference(a: ExamRun, b: ExamRun): string | null; // 'turn 14: hp[1] ours 87 pvpoke 85' or a length mismatch
export function judge(results: { id: string; ours: ExamRun; pvpoke: ExamRun; script: ScriptEntry[] }[], diffs: Difference[]): { verdicts: ScriptVerdict[]; stale: string[]; report: string };
```

  A script whose traces differ (HP or energy on any turn, or trace length) is `explained` when some difference lists its id, else `mismatch`. A script where either engine left an entry unexecuted is `unexecuted` unless explained (an unexecuted entry means the engines disagree on when a Pokemon can act). A difference entry that lists a script id which now matches is `stale` (reported, like a redundant override). `report` is a plain ASCII table: one line per script with status and first difference, then the stale list, then any `notes` from the runs.

- Produces (`scripts.ts`): `EXAM_SCRIPTS: PolicyScript[]` and `COVERAGE: string[]` = `['fast-trade', 'charged-timing', 'cmp-higher-atk', 'cmp-tie', 'shield', 'buff-self-atk', 'buff-self-def', 'debuff-opponent-atk', 'debuff-opponent-def', 'buff-chance-proc', 'buff-chance-miss', 'shadow-attacker', 'shadow-defender', 'form-mimikyu', 'form-aegislash', 'form-cramorant-gulping', 'form-cramorant-gorging', 'form-morpeko', 'form-minior']`. Scripts name PvPoke species and moves (names are not pinned values; levels and IVs chosen in the script). Every coverage tag is used by at least one script. Each script carries its `covers` list. CMP tie scripts are mirrors (equal Attack) where both sides throw the same turn. The Cramorant gorging script gets Cramorant below half HP before Dive/Surf. One Cramorant script has the hit knock Cramorant out so `ignoresFaint` is exercised.
- Produces `differences.yaml` seeded with the expected entries from "Decisions this plan makes" (animation turns does not apply here since `pvpoke-mechanics.yaml` has no `animate`; the seeds are: the Minior hp-trigger timing (PvPoke treats the hp-triggered form change like a charged move for fast-move clocks, resetting both, and adds 5 s of display time; the transcription cannot express that, so our run does not reset), the Aegislash form level mapping, the CMP tie knockout). Each with `scripts:` filled once the exam shows which scripts they explain. Any other mismatch the exam finds is a bug in one engine: investigate and fix ours, or, if the game is on our side, add an entry with real evidence. Do not add an entry to make the exam pass without evidence.

- [ ] **Step 1: Write the failing tests.** `judge.test.ts` (synthetic `ExamRun`s): match; mismatch with first difference text; explained; unexecuted; stale entry; `validateDifferences` rejects a missing `evidence`. `rules-exam.test.ts` (live; `PICKTHREE_REQUIRE_PVPOKE` throws when the checkout is missing):

```ts
it('every coverage tag has a script whose moves really have that property', () => {
  // checks against the converted data at runtime, e.g. 'buff-self-atk' needs a charged move in the
  // script with buffs.self.atk > 0 and chance 1; 'form-*' needs that family's species
});
it('the rules exam passes: every mismatch is explained', () => {
  const { verdicts, stale, report } = judge(runAll(), differences);
  console.log(report);
  expect(verdicts.filter((v) => v.status === 'mismatch' || v.status === 'unexecuted'), report).toEqual([]);
  expect(stale, report).toEqual([]);
});
```

- [ ] **Step 2: Run.** `npx vitest run --project data packages/data/test/exam` -> FAIL.
- [ ] **Step 3: Implement** `judge.ts` and `scripts.ts`, then run the exam and work every mismatch to ground: read the first differing turn in both engines (PvPoke's logic at the `Battle.js` lines cited in Task 14), fix our engine where it is wrong (each fix with a synthetic unit test in `packages/battle/test/` pinning the corrected behaviour), and record true differences in `differences.yaml` with evidence.
- [ ] **Step 4: Run.** `npx vitest run --project data packages/data/test/exam` -> PASS; `npm test` -> all projects PASS, golden test included.
- [ ] **Step 5: Commit.** `git commit -m "exam: rules exam with known-differences list"` (stage `scripts.ts`, `judge.ts`, `differences.yaml`, both tests, and any battle fixes with their tests).

---

### Task 17: The data exam report

**Files:**
- Create: `packages/data/src/exam/idmap.ts`, `packages/data/src/exam/data-exam.ts`
- Modify: `packages/data/package.json` (script `"exam:data": "tsx src/exam/data-exam.ts"`), `package.json` (root `"exam:data": "npm -w @pickthree/data run exam:data"`)
- Test: `packages/data/test/exam/data-exam.test.ts`

**Interfaces:**
- Consumes: `buildBattleData` (Task 12), `pvpokeToBattleData` (Task 14).
- Produces (`idmap.ts`): `toPvPokeSpeciesId(ourId: string, pvpokeIds: ReadonlySet<string>): string | null` (exact match first; then suffix rewrites in order: `_alola` -> `_alolan`, `_galarian`, `_hisuian`, `_paldea` -> `_paldean`, `mimikyu_disguised` -> `mimikyu`, `minior` -> `minior_meteor`, `minior_red` -> `minior_core`; return the first candidate present in `pvpokeIds`), `toPvPokeMoveId(ourId: string): string` (strip a trailing `_FAST`).
- Produces (`data-exam.ts`): `diffData(ours: BattleData, theirs: BattleData): DataDiff` with `interface DataDiff { onlyOurs: string[]; onlyTheirs: string[]; species: string[]; moves: string[]; settings: string[]; summary: string }` (each string one human line, e.g. `species azumarill: baseStats.atk ours 112 pvpoke 112` only when they differ; `moves THUNDER_SHOCK: energyGain ours 9 pvpoke 9` likewise; settings lines compare every `BattleSettings` field and the CPM table up to level 51). Cups: our `leagues` against PvPoke `gm.data.cups` and `formats` mapped by id heuristic (strip `vs_seeker_`, `_great`, `_ultra`, `_master`; compare CP cap, types, bans), unmapped both ways listed. The CLI ensures the datamine and the PvPoke checkout, builds both, writes `packages/data/.battle/data-exam.md` (header: both commits and dates, so freshness reads at a glance), prints the summary. Report, not a gate: exit 0 whatever it finds.

- [ ] **Step 1: Write the failing tests:** `idmap` rewrites on synthetic sets; `diffData` on two synthetic `BattleData`s lists only-ours, only-theirs and one field difference per kind, and nothing for equal fields. Live (skip unless both inputs exist): `diffData` runs, maps more than 90 percent of PvPoke species to ours (an invariant that catches an id-rule regression, not a pinned number).
- [ ] **Step 2: Run.** `npx vitest run --project data packages/data/test/exam/data-exam.test.ts` -> FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test -> PASS. Then `npm run exam:data` -> writes `packages/data/.battle/data-exam.md`; open it with `code packages/data/.battle/data-exam.md` and read the top differences. Any that is an extraction bug (not freshness or naming) gets fixed in Task 10's code with a synthetic test.
- [ ] **Step 5: Commit.** `git commit -m "exam: data exam report"`.

---

### Task 18: CI and repo docs

**Files:**
- Modify: `.github/workflows/ci.yml`, `CLAUDE.md`

- [ ] **Step 1: CI.** In the `test` job: add `PICKTHREE_REQUIRE_DATAMINE: '1'` to `env`; after the "Cache PvPoke checkout" step add

```yaml
      - name: Cache datamine
        uses: actions/cache@v4
        with:
          path: packages/data/.datamine
          key: datamine-${{ hashFiles('packages/data/datamine.lock.json') }}
      - run: npm run datamine:fetch
```

  The rules exam runs inside `npm test` next to the golden test (it needs only the PvPoke checkout, which this job already fetches). The `screens` job is untouched. The data build cache key is untouched (no app data changes).
- [ ] **Step 2: CLAUDE.md.** Layout block: add `packages/battle/     our own battle engine: datamine extraction, rules, mechanics, players (no PvPoke)`. Dependency direction line: add `packages/data -> battle`; `battle` imports nothing from the repo; `engine` never imports `battle` (yet). Add a short "Battle engine (`packages/battle`)" section under Architecture: the datamine lock and `battle:build`, the three hand-kept files in `packages/data/battle/` (overrides sourced and dated, mechanics in the fixed vocabulary, differences with evidence), the alarm, the rules exam (CI gate, PvPoke as a grade only) and `exam:data` (report). Commands block: `npm run datamine:fetch`, `npm run battle:build`, `npm run exam:data`. Rules: add "packages/battle never reads PvPoke; PvPoke is only ever an exam."
- [ ] **Step 3: Verify.** `npm run lint && npm run typecheck && npm test` -> all green locally (with the datamine fetched and the PvPoke checkout present).
- [ ] **Step 4: Commit.** `git add .github/workflows/ci.yml CLAUDE.md` then `git commit -m "ci: datamine cache and fetch; docs: battle engine"`. Push and confirm the CI run is green.
