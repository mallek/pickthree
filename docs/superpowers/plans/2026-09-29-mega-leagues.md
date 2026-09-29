# Mega Leagues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mega formats (Mega Color Cup now, the three Mega Editions from 2026-10-06) are buildable from the player's collection: every mega-capable line gets Mega builds, Poke Genie's Mega mark makes one ready, a team holds at most one Mega, and pick3 states the base-form CP to power up to.

**Architecture:** The data build bakes `megaOf` onto Mega species. The importer keeps Poke Genie's Mega form as `Specimen.megaForm`. `buildsFor` emits Mega builds next to each stage, with the level set by the Mega's CP and `baseCp` for the player. Team search and suggestions enforce one Mega and one use per specimen. The feed parser maps Mega formats through aliases into rotation leagues. The app labels Mega builds, leads with base CP, adds a Mega Energy cost, warns on two Megas, and lets Add Pokemon mark a Mega.

**Tech Stack:** TypeScript npm workspaces, Vitest, React 19, Vite, the vendored PvPoke checkout.

**Spec:** `docs/superpowers/specs/2026-09-29-mega-leagues-design.md`

## Global Constraints

- Player-facing text strict 7-bit ASCII; no em dashes anywhere.
- Always `{ }` on control flow bodies. prettier on touched files; lint and typecheck clean (read the FULL typecheck output, never a tail).
- Explicit paths in every `git add`.
- Logic tests on synthetic data; live PvPoke data gets invariants only (never specific ranks, scores, or teams).
- One Mega per team; shadow cannot Mega Evolve, purified can (`MEGA_BARRED_FOR = ['shadow']`).
- The cap applies to the Mega form's CP; user-facing power-up targets are the base form's CP: `Power up to CP <base> (<mega> as Mega)`.
- No Mega Energy amounts anywhere.
- Commits end with the session's attribution lines.

## Review Focus

1. **A specimen used twice on one team** (Charizard and Mega Charizard Y from the same Charmander): team search, suggestions and finalists must never field one specimen twice. Owned by Task 5.
2. **A Mega-marked specimen already above the Mega cap at its current level** (base CP 1200 Sableye) gets no Mega build, and is not reported as ready. Owned by Task 3.
3. **Great League, Ultra, Master, Tournament and non-Mega cups never show or recommend a Mega**, in teams, search or counters. Owned by Tasks 3 and 7.
4. **Collections saved before this change** (no `megaForm`) load and behave as unmarked. Owned by Task 2.
5. **The Mega Edition leagues share one PvPoke cup (`mega`) at three caps**; each gets its own id and meta group. Owned by Task 6.

---

### Task 1: `megaOf` on Mega species, `megasOf` on the index

**Files:** `packages/data/src/build-gamedata.ts`, `packages/engine/src/gamedata/types.ts` (`Species`), `packages/engine/src/gamedata/index.ts` (`GameDataIndex`); tests `packages/data/test/build-gamedata.test.ts`, `packages/engine/test/gamedata/index.test.ts` (create if absent).

**Produces:** `Species.megaOf?: string`; `GameDataIndex.megasOf(speciesId: string): Species[]`; exported `megaBaseId(speciesId: string): string | null` in build-gamedata.ts.

- [ ] Test first (data): `megaBaseId` returns `charizard` for `charizard_mega_x` and `charizard_mega_y`, `sableye` for `sableye_mega`, `kyogre` for `kyogre_primal`, `null` for `charizard` and `meganium`. A live-data test (skipped without the checkout): every species tagged `mega` in the built species list has `megaOf` naming a species that exists.
- [ ] Test first (engine): with a synthetic index holding `charizard`, `charizard_mega_x` (`megaOf: 'charizard'`), `charizard_mega_y` (`megaOf: 'charizard'`), `megasOf('charizard')` returns both, sorted by id; `megasOf('charmander')` returns `[]`.
- [ ] Implement:

```ts
// build-gamedata.ts
const MEGA_SUFFIX = /_(mega_x|mega_y|mega|primal)$/;

/** The species a Mega or Primal entry evolves from, by PvPoke id; null for anything else. */
export function megaBaseId(speciesId: string): string | null {
  return MEGA_SUFFIX.test(speciesId) ? speciesId.replace(MEGA_SUFFIX, '') : null;
}
```

  In the species map, only for entries whose tags include `mega`: `...(base ? { megaOf: base } : {})`; after building the list, throw `Error('mega base missing: <id> -> <base>')` if a `megaOf` names no species. `Species.megaOf?: string` with a doc comment. In `GameDataIndex`, build a `Map<string, Species[]>` from `megaOf` in the constructor and expose `megasOf`.
- [ ] Gate and commit: "Data: Mega species name the species they evolve from".

### Task 2: the importer keeps Poke Genie's Mega mark

**Files:** `packages/engine/src/collection/specimen.ts` (the `Specimen` type and `toSpecimens`), `packages/engine/src/mapping/tables.ts`; tests `packages/engine/test/collection/*.test.ts` (the file that covers `toSpecimens`), and the storage/load path in `apps/web/src/storage/db.ts` only if it validates specimen fields.

**Produces:** `Specimen.megaForm?: 'mega' | 'mega_x' | 'mega_y' | null` (optional so older saves type-check; read `?? null`); `Specimen.megaLevel4?: boolean` (type only here; set by the app in Tasks 10-11; absent means false).

- [ ] Test first: parsing `fixtures/pokegenie-sample.csv` yields Sableye specimens with `speciesId: 'sableye'` and `megaForm: 'mega'`, Mewtwo `megaForm: 'mega_y'`, and ordinary rows `megaForm: null`; a folded-name row (`Name: "Sableye (Mega)"`, empty Form, in a small inline CSV) gives the same; a Specimen object without the field (old save) is treated as unmarked by a helper `megaFormOf(sp)` returning `sp.megaForm ?? null`.
- [ ] Implement: export `MEGA_FORMS: Record<string, 'mega' | 'mega_x' | 'mega_y'> = { Mega: 'mega', 'Mega X': 'mega_x', 'Mega Y': 'mega_y' }` in tables.ts (keep `FORMS_TO_BASE` derived from its keys); in `toSpecimens` set `megaForm: MEGA_FORMS[row.form.trim()] ?? null`. Check how folded names reach `row.form` (parse.ts splits them before mapping) and cover that path in the test. Export `megaFormOf`.
- [ ] Gate and commit: "Import: keep Poke Genie's Mega mark on the specimen".

### Task 3: Mega builds

**Files:** `packages/engine/src/builds/eligibility.ts` (`Build`, `buildsFor`); tests `packages/engine/test/builds/eligibility.test.ts` (or the file covering `buildsFor`).

**Consumes:** `index.megasOf`, `megaFormOf`. **Produces:** `Build.mega: { ready: boolean; level4: boolean } | null`, `Build.baseCp: number`, `Build.baseLevel: number`, exported `MEGA_BARRED_FOR: readonly ('shadow')[]`, `MEGA_LEVEL4_BOOST = 2`, `MEGA_LEVEL4_CAP = 52`.

- [ ] Tests first, synthetic species with real-shaped base stats:
  - Sableye case: species `sableye` and `sableye_mega` with the game master's base stats (read them from `packages/data/.pvpoke/src/data/gamemaster.json` once and hard-code them in the test), IVs 10/15/14, current level 15, a 1500 league allowing megas: the Mega build has `level: 27.5`, `cp: 1475`, `baseCp: 1118`; the base build is unaffected.
  - Over the cap already: the same Sableye at current level 30 gets no Mega build.
  - `ready`: a Mewtwo specimen with `megaForm: 'mega_y'` gets `mega.ready` true on `mewtwo_mega_y` and false on `mewtwo_mega_x`; an unmarked specimen gets false on both.
  - Shadow specimen: no Mega build. Purified specimen: a Mega build.
  - A league that excludes the `mega` tag (the Great League definition): no Mega build, ever.
  - Level 4: a synthetic Mega tagged `supermega` on a specimen with the matching `megaForm` and `megaLevel4: true` battles at `baseLevel + 2`: `level` (battle) and `cp` use the Mega at the battle level, `baseCp` the base form at `baseLevel`; the cap and floor checks use the battle level; in a 10000 CP league a level-50-capable specimen's Level 4 Mega battles at 52. The same specimen without `megaLevel4`, or a Mega not tagged `supermega`, gets no boost (`baseLevel === level`, `mega.level4` false). An unmarked specimen never gets it. Sableye (not `supermega`) marked Level 4 by mistake still builds at base CP 1118.
  - A Mega of an evolved stage: a Charmander specimen yields `charizard_mega_y` with `stageOffset` equal to Charizard's.
- [ ] Implement inside the stage loop of `buildsFor`: after handling the stage itself, for each `mega` of `index.megasOf(species.speciesId)` (skipped when `MEGA_BARRED_FOR` includes `'shadow'` and `specimen.shadow`), apply the same checks with `mega.baseStats` (league allows `mega`; CP at current level under cap; `maxLevelUnderCap` with the Mega's stats and the stage's level floor; `minCp`), and push:

```ts
{
  ...common, // specimenId, specimen, shadow, stageOffset, ivs
  speciesId: mega.speciesId,
  level,
  cp: cpFor(mega.baseStats, ivs, level),
  baseCp: cpFor(species.baseStats, ivs, level),
  ivRank: ivRank(mega.baseStats, ivs, opts.cpCap, levelCap),
  needsXl: level > 40,
  mega: { ready: megaFormOf(specimen) !== null && mega.speciesId === `${species.speciesId}_${megaFormOf(specimen)}` },
}
```

  For Level 4 (`mega.ready && specimen.megaLevel4 && mega.tags.includes('supermega')`): search the base level with the Mega's CP evaluated at base + `MEGA_LEVEL4_BOOST`, with the battle level capped at `MEGA_LEVEL4_CAP` (base level at most cap minus the boost); set `level` = battle level, `baseLevel` = base level, `cp` = Mega CP at the battle level, `baseCp` = base CP at the base level, `mega.level4 = true`. Power-up cost (Task 4) uses `baseLevel`. Non-Mega builds get `mega: null`, `baseCp: cp` and `baseLevel: level`. Keep the stage and its Mega logic in small helpers so `buildsFor` stays readable.
- [ ] Gate (engine tests and the full suite once) and commit: "Engine: Mega builds from the collection, capped on the Mega form".

### Task 4: Mega cost

**Files:** `packages/engine/src/builds/cost.ts`; tests `packages/engine/test/builds/cost.test.ts`.

**Produces:** `Cost.megaEnergy: 'needed' | 'ready' | null`; exported `MEGA_ENERGY_WEIGHT` constant.

- [ ] Power-up cost uses `build.baseLevel` (the level the stored base Pokemon is powered to), never the Level 4 battle level. Test: a Level 4 Mega's dust and candy equal powering the base to `baseLevel`.
- [ ] Tests first: a Mega build that is not ready has `megaEnergy: 'needed'` and a weight exactly `MEGA_ENERGY_WEIGHT` above the same build marked ready; a ready one has `'ready'`; a non-Mega build `null`; the evolution candy for a Charmander's `charizard_mega_y` build equals that of its `charizard` build (the path goes to the base, not the Mega); `sumCosts` of a team with one needed Mega reports `'needed'`.
- [ ] Implement: evolution path and second-move cost use `index.mustSpecies(build.speciesId).megaOf ?? build.speciesId`; add `megaEnergy`; `costWeight` adds `MEGA_ENERGY_WEIGHT` (start at 30000, the weight of 30,000 dust, with a comment saying why: enough to rank a ready Mega first among near-equals, small next to an Elite TM) when `needed`; `sumCosts` takes `needed` over `ready` over `null`.
- [ ] Gate and commit: "Engine: a Mega build costs Mega Energy unless it is ready".

### Task 5: one Mega and one use per specimen per team

**Files:** `packages/engine/src/search/trios.ts` (`generateTrios`), `packages/engine/src/search/finalists.ts` (if it assembles teams outside `generateTrios`), `packages/engine/src/teammates/suggest.ts` (the core search), `packages/engine/src/analyze.ts` (`TeamAnalysis`); tests next to each.

**Produces:** `TeamAnalysis.twoMegas: boolean`; exported `teamRuleViolation(builds: Build[]): 'same-specimen' | 'two-megas' | null`.

- [ ] Tests first:
  - `teamRuleViolation`: two builds with the same `specimenId` -> `'same-specimen'`; two with `mega` set -> `'two-megas'`; one Mega -> `null`.
  - `generateTrios` on a synthetic pool of four candidates where the two best-scoring are Megas, and another pair shares a specimen: no draft contains two Megas or one specimen twice.
  - `suggestTeammates` (synthetic deps, as the existing suggest tests build them): with a Mega pinned, no suggested fill is a Mega; with nothing Mega pinned, no suggestion has two Mega fills.
  - `analyzeTeam` with two Mega picks returns `twoMegas: true` and still analyzes.
- [ ] Implement `teamRuleViolation` in a small new module `packages/engine/src/search/teamRules.ts` and call it where trios are formed (next to the existing one-species check) and in the suggestion core search; set `twoMegas` in `analyzeTeam`.
- [ ] Gate (full suite once: recommend e2e and Little Cup tests must still pass) and commit: "Engine: one Mega and one use of each Pokemon per team".

### Task 6: Mega formats in the feed and the build

**Files:** `packages/data/src/schedule-feed.ts` (`parseFeed`, `CupAlias`), `packages/data/cup-aliases.json`, `packages/data/src/leagues.ts` (`metaGroupFor`, the rotation loop), tests `packages/data/test/schedule-feed.test.ts`, `packages/data/test/leagues.test.ts`.

**Produces:** `CupAlias.id?: string`; `metaGroupFor(cup: string, cp: number): string`.

- [ ] Tests first:
  - Parser on the real fixture names (add Mega weeks to `packages/data/test/fixtures/gbl-feed.json` from the live feed if missing): `"Mega Color Cup: Great League Edition"` -> league `colormega`, cup `colormega`, cp 1500; `"Great League: Mega Edition"` -> `mega-great`, cup `mega`, 1500; Ultra -> `mega-ultra` 2500; Master -> `mega-master` 10000; `"Mega Halloween Cup: Great League Edition"` -> unmapped `"Mega Halloween Cup"`; `skippedMega` is gone or always empty (remove the field and its uses, including refresh-schedule's log and report shape, since nothing is skipped now; keep report readers tolerant of an old report carrying it).
  - `metaGroupFor('mega', 1500)` is `megagreat`, `('mega', 2500)` `megaultra`, `('mega', 10000)` `mega`, `('colormega', 1500)` `colormega`, and an unlisted cup falls back to the slug.
- [ ] Implement: remove the Mega skip; look up the alias by the full format text first, then by the cup title; `alias.id` wins over the derived id; add the four aliases to `cup-aliases.json` (`Mega Color Cup` without `cp`, the three Editions with `cup`, `cp`, `id`); `metaGroupFor` matches `f.cup === cup && f.cp === cp`.
- [ ] Run `npm run schedule:refresh` then `PICKTHREE_SKIP_SPRITES=1 npm run data:build`: the build logs `colormega`, `mega-great`, `mega-ultra`, `mega-master` with metas; commit `schedule.json` with the mega weeks. Extend the existing live build invariant test so it covers these leagues (rankings, meta size >= 1, matrix covering the meta).
- [ ] Gate and commit: "Data: Mega formats become rotation leagues".

### Task 7: Megas in the app's species universe

**Files:** `apps/web/src/worker/engine.worker.ts` (`allSpecies` in the ready reply, around line 233; the league `legal` list), `apps/web/src/screens/AddPokemon.tsx`; tests `apps/web/test/*` for search.

- [ ] Tests first: with a synthetic ready reply whose `allSpecies` includes `venusaur_mega` and leagueInfo `legal` including it for `colormega` and not for `great`, searching "venusaur" in Log a Battle lists Mega Venusaur in the cup and not in Great League; Add Pokemon never lists `venusaur_mega`.
- [ ] Implement: include Mega species in `allSpecies` (they are already in `env.species`; stop filtering them out there); Add Pokemon filters Megas out of its own list (by the `mega` tag or `megaOf`).
- [ ] Gate and commit: "Web: Megas are searchable where the league allows them".

### Task 8: Mega sprites

**Files:** `packages/data/src/build-sprites.ts`; test `packages/data/test/build-sprites.test.ts` if it exists.

- [ ] With the local sprite cache, list which Mega ids get a sprite (`ls apps/web/public/data/sprites | grep -E "_mega|_primal"` after a sprite build, or the build's own missing/fell-back report). For each Mega without a render, map it to the base species' picture in the FIXUPS (or the fallback rule), so every Mega id has a file. Add a test that the id-to-variety mapping resolves every Mega id (synthetic list from the rule, not live data).
- [ ] Commit: "Sprites: every Mega has a picture".

### Task 9: Mega builds in the app: tokens, base CP, cost

**Files:** `apps/web/src/components.tsx` (`PokemonToken` and the name helpers), `apps/web/src/format.ts` (`costParts`), `apps/web/src/screens/Specimen.tsx`, `apps/web/src/components/team/PokemonDetails.tsx`, and wherever the engine or app writes a power-up line or verdict sentence (grep `Power up`, `level ${`, `CP ` in `packages/engine/src/explain` and `packages/engine/src/verdicts`); tests beside each.

- [ ] Tests first:
  - `costParts` on a cost with `megaEnergy: 'needed'` includes a part labelled `Mega Energy`; `'ready'` gives `Mega Energy (mega-evolved before)`; `null` gives no such part.
  - The power-up text for a Mega build reads `Power up to CP 1118 (1475 as Mega)`; a Level 4 Mega reads `Power up to CP <base> (<mega> as Mega, Level 4)`; for a non-Mega build it is unchanged. Levels shown to the player are `baseLevel`.
  - A token for a Mega build shows the Mega sprite and a `Mega` pill, and the display name `Mega Sableye` (use the species' display name from the game data, which PvPoke already spells "Sableye (Mega)"; format it as `Mega Sableye`; X/Y as `Mega Charizard Y`).
  - A Mega-marked specimen already at its Mega build's base CP reads as built.
- [ ] Implement, reading `build.baseCp` and `build.mega` where builds are rendered and `cost.megaEnergy` in cost tiles. Keep the pill styled like existing small pills (tokens only; check `npm run check-tokens`).
- [ ] Gate and commit: "Web: Mega builds show as Megas, with base CP and a Mega Energy cost".

### Task 10: two-Mega warning, collection pill, Pokemon page

**Files:** Team Analysis and Build screens (grep `analyzeTeam` consumers in `apps/web/src/screens`), `apps/web/src/screens/Collection.tsx`, `apps/web/src/screens/Specimen.tsx`; tests beside each.

- [ ] Pokemon page Level 4 toggle: for a Mega-marked specimen whose marked Mega is tagged `supermega`, a "Mega Level 4" toggle saves `megaLevel4` on the specimen (the store's existing specimen-update path; find how other per-specimen edits persist) and recommendations recompute; not shown for other specimens. Test it.
- [ ] Tests first: a Team Analysis result with `twoMegas: true` shows `Only one Mega per team in GBL. Swap one out.` above the results; a Mega-marked specimen row in Collection shows the `Mega` pill; the Pokemon page for a Mega-capable specimen in a Mega league shows its Mega build next to the base build (base CP line as in Task 9).
- [ ] Implement.
- [ ] Gate and commit: "Web: two-Mega warning, Mega pill on the collection, Mega build on the Pokemon page".

### Task 11: Add Pokemon marks a Mega

**Files:** `apps/web/src/screens/AddPokemon.tsx`, the add-specimen action in `apps/web/src/state/store.tsx`; tests `apps/web/test/addPokemon*.test.tsx` (or the existing Add Pokemon test file).

- [ ] Tests first: for a species with one Mega (Sableye) the form shows a `Mega-evolved before` checkbox; checked, the saved specimen has `megaForm: 'mega'`; for a species with two (Charizard) it shows a choice (none, Mega X, Mega Y) and saves the chosen form; for a species with no Mega, no control; for a shadow, no control; when the chosen Mega is tagged `supermega` (e.g. Mewtwo Mega Y) a "Mega Level 4" checkbox appears and saves `megaLevel4: true`; for a non-`supermega` Mega (Sableye) it never appears.
- [ ] Implement under the IV fields, following the screen's existing field layout.
- [ ] Gate and commit: "Web: Add Pokemon can mark a Mega".

### Task 12: captures

**Files:** `apps/web/scripts/screens.mjs`.

- [ ] Add captures, both themes, through `web:audit`: Teams in Mega Color Cup showing a team with a Mega (pin the app clock inside a Mega Color Cup week via the existing `pick3.now` mechanism, or skip with a log line when no built Mega league week exists, like the cup captures); a Team Analysis with two Megas showing the warning; Add Pokemon with the Mega control. Look at each capture and describe it in the report.
- [ ] `npm run web:audit` exits 0. Commit: "Screens: Mega team, two-Mega warning, Add Pokemon Mega control".

### Task 13: full gate and the collection check

- [ ] `npm run lint`, `npm run typecheck` (full output), `npm run check-tokens`, `PICKTHREE_SKIP_SPRITES=1 npm run data:build`, `PICKTHREE_REQUIRE_PVPOKE=1 npm test`.
- [ ] Controller-only check (the private CSV is never committed): run the engine's recommend for Mega Color Cup on `private/poke_genie_export.csv` in a throwaway script outside the repo's tracked files, confirm every team has at most one Mega and one use per specimen, and that any Sableye Mega build states base CP 1118 (Sableye is not Color Cup legal; check it in `mega-great` instead). Report, do not commit the script.
