# Species page as the collection manager: implementation plan

**Goal:** The species page shows, pins, edits, removes and adds your copies of one species; the
separate Pokemon page goes away; Edit covers evolve, moves and Purified.

**Architecture:** The engine gains a per-species view (which copies belong to a species page,
each judged as that species, and which one is fielded). The worker serves it. The species page
renders it with the signed pages' parts; Edit grows on the existing Add form.

**Tech stack:** as the repo (TypeScript strict, React 19, vitest, puppeteer captures).

**Spec:** `docs/superpowers/specs/2026-10-02-species-manager-design.md`

**Execution:** native, in this session, on branch `feat/species-manager`. No merge, no push.

## Global constraints

- Braces on all control flow. No em dashes anywhere. Exact pinned versions (no new packages).
- UI only from `packages/ui` and tokens; no new color literals outside `tokens.css`.
- The collection never leaves the device: no new network call.
- No pinned PvPoke values in tests: synthetic data for logic, invariants on live data.
- Stage explicit paths. Commit per task.

## Review focus

Inputs the spec implies and a player will hit; each has a test in the task that owns it.

1. A copy with no IVs on a species page: listed last as "Needs rescan", never the pick, edit
   still reachable (Task 1, Task 6).
2. `?copy=` naming a Pokemon that is gone or belongs to another species: the page shows the
   pick instead and does not error (Task 6).
3. Evolving in Edit, then changing CP before saving: the typed CP wins and the level follows it
   (Task 7).
4. A stored pin naming a removed Pokemon: the page shows the default pick with a filled pin
   (Task 1).
5. A Shadow copy: listed on its Shadow species page only, and Purified is not offered in Edit
   (Task 1, Task 7).

## File map

| File | Change |
| --- | --- |
| `packages/engine/src/verdicts/worth.ts` | `specimenVerdict(s, deps, target?)` |
| `packages/engine/src/collection/speciesView.ts` | new: `speciesMembers`, `speciesView` |
| `packages/engine/src/collection/manual.ts` | `ManualInput.purified`, `currentMoves`, `level` |
| `packages/engine/src/recommend.ts` | `speciesViewFor` (deps wiring, like `verdictsFor`) |
| `packages/engine/src/host/ComputeHost.ts`, `index.ts` | `speciesView`, exports |
| `apps/web/src/host/protocol.ts`, `WorkerHost.ts`, `worker/engine.worker.ts` | `speciesView` op; `SpeciesLite.baseStats`, `evolvesTo` |
| `apps/web/src/state/store.tsx` | species route `copy`; `speciesView` action; `updateManual` extras |
| `apps/web/src/components.tsx` | Pin, Star, Trash, Plus glyphs |
| `apps/web/src/components/MovePicker.tsx` | exported `MoveOption` with `recommended` star |
| `apps/web/src/components/species/MovesCard.tsx` | new: the one moves card, read only or editable |
| `apps/web/src/components/species/ShownCopy.tsx` | new: heading, icons, facts card |
| `apps/web/src/components/species/Yours.tsx` | new: the list, top three, Show all |
| `packages/ui/src/components/SaveBar.tsx`, `base.css`, gallery | new component |
| `apps/web/src/screens/SpeciesPage.tsx` | the manager |
| `apps/web/src/screens/AddPokemon.tsx` | Edit |
| `apps/web/src/screens/Specimen.tsx` | deleted; `SpecimenRedirect` in `App.tsx` |
| `apps/web/src/screens/Collection.tsx`, `Counters.tsx` | rows open species pages |
| `apps/web/scripts/screens.mjs` | captures follow |
| `docs/design/audits/` | species record redone, Edit record, `pokemon-detail.md` retired |

---

### Task 1: Engine, the species view

**Files:** `verdicts/worth.ts`, `collection/speciesView.ts` (new), `recommend.ts`, `index.ts`;
tests `test/collection/speciesView.test.ts` (synthetic index), `test/verdicts/target.test.ts`.

**Produces:**

```ts
// verdicts/worth.ts
export function specimenVerdict(s: Specimen, deps: VerdictDeps, target?: string): Verdict;

// collection/speciesView.ts
export interface SpeciesCopy {
  specimenId: string;
  /** The copy judged as the page's species. */
  verdict: Verdict;
  /** Other species this copy is the fielded pick for, by evolving. Empty for most. */
  alsoPickFor: string[];
}
export interface SpeciesView {
  speciesId: string;
  /** Best IV rank for the species first; copies with no build after; no IVs last. */
  copies: SpeciesCopy[];
  /** The copy fielded for this species in the league: the pin or the default. Null: unpinned. */
  pickId: string | null;
  /** The default pick, whatever the pin says. Null when no copy has a build. */
  defaultId: string | null;
  /** True when the player unpinned the species (pin is null). */
  unpinned: boolean;
}
/** Copies that are the species or can become it: own id, a later stage, or its Mega. */
export function speciesMembers(speciesId: string, specimens: readonly Specimen[], index: GameDataIndex): Specimen[];
export function speciesView(speciesId: string, specimens: readonly Specimen[], pins: PinMap, deps: VerdictDeps): SpeciesView;

// recommend.ts
export function speciesViewFor(speciesId: string, specimens: Specimen[], options: Partial<BuildOptions>, deps: EngineDeps): SpeciesView;
```

**Behaviour:**

- With `target`, `specimenVerdict` judges only builds whose `speciesId` is the target. No such
  build: `Not eligible`, the line naming the target ("This Eevee would be over 1500 CP as
  Umbreon." or "... is not allowed in <league>" by the target's own rules). `megaBuilds` and
  `buildSpecies` still come from every build. Without `target` nothing changes.
- `speciesMembers`: a Shadow specimen counts as its Shadow species (flag on a plain id
  included). Member when its own species is the page's, or `index.stagesFrom(own)` contains it,
  or the page's species is a Mega of one of those stages.
- `speciesView`: builds per member with `minCp: 0`; `pickId = resolvePick(all, all, pin)`;
  `defaultId = defaultPick(all)`; copies sorted by `ivRank.rank`, then `comparePicks`, then id.
  `alsoPickFor`: `fieldedBuilds` over the builds of every specimen in the members' families,
  keeping, for each member, the other non-Mega species (stage offset above zero) it is fielded
  for.

**Tests (synthetic index: a base that branches to two evolutions, a Shadow line, a single-stage
species):**

- own copies plus lower forms are members; a higher form is not (the base's page has no evolved
  copy); a Shadow is a member of the Shadow page only.
- order is IV rank for the page's species; a copy with no IVs is last with `Needs rescan`.
- `pickId` equals the default with no pin; equals the pin when set; null and `unpinned` when the
  pin is null; a pin naming a missing Pokemon gives the default (review focus 4).
- `alsoPickFor` names the sibling evolution when the same base copy is the pick for both.
- a base copy judged as each of two evolutions gets two different IV ranks (target verdicts).
- over-cap as the target: `Not eligible` with the target's name in the line.

Steps: write the tests, see them fail, implement, see them pass, commit
`Engine: a species page's copies, judged as that species`.

### Task 2: Engine, manual entry carries moves, Purified and a level

**Files:** `collection/manual.ts`, `test/collection/manual.test.ts` (extend or new).

```ts
export interface ManualInput {
  speciesId: string;
  ivs: IVs;
  cp: number;
  lucky?: boolean;
  /** Ignored for a Shadow. */
  purified?: boolean;
  /** Moves the Pokemon knows. Absent or empty: not entered. Must be in the species' pools. */
  currentMoves?: { fast: string | null; charged: string[] };
  /** The level to keep when it gives exactly this CP (an evolution keeps its level). */
  level?: number;
}
```

- `level` is used only when `cpFor(base, ivs, level) === cp`; otherwise the level comes from CP
  as today.
- Moves outside the species' pools throw "<Species> cannot learn <Move>."; more than two charged
  moves throws.

Tests: each field round-trips; a level hint that does not match the CP is ignored; a bad move
throws; Purified is dropped for a Shadow. Commit `Engine: manual entry takes moves, Purified and
a level to keep`.

### Task 3: Host, worker and boot data

**Files:** `host/ComputeHost.ts`, `apps/web/src/host/protocol.ts`, `WorkerHost.ts`,
`worker/engine.worker.ts`, `apps/web/test/fakeHost.ts`.

- `ComputeHost.speciesView(speciesId, specimens, options: Partial<BuildOptions>): Promise<SpeciesView>`
  (options carry `pins`, as the other calls do). Request kind `speciesView`, league-scoped.
- `SpeciesLite` gains `baseStats: { atk; def; hp }` and `evolvesTo?: string[]` (every later
  stage, from `index.stagesFrom(id).slice(1)`, omitted when empty).
- `fakeHost`: a default `speciesView` returning the specimens whose own species is the id, each
  with a neutral verdict, the first as the pick; tests override it.

Typecheck, commit `Web: the worker serves a species page's view`.

### Task 4: Store and routes

**Files:** `state/store.tsx`, `App.tsx`, `screens/Collection.tsx`, `screens/Counters.tsx`;
tests in `store.test.tsx`.

- `Route` species: `{ screen: 'species'; id; league?; copy? }`. `#/species/<id>?copy=<id>`
  parses when the copy matches `SPECIMEN_ID`; `hashFor` writes it.
- `{ screen: 'specimen' }` stays parseable (old links). `App.tsx` renders `SpecimenRedirect`:
  Loading until the collection is read, then a replace-navigation to the copy's own species
  page with `copy`, or the "not in the current collection" empty state.
- Action `speciesView(speciesId)`: league in play, `optionsFrom(settings)` plus the league's
  pins.
- `updateManual(id, input, marks, extra?: { evolvedFrom?: string })`: the input's `purified`
  and `currentMoves` are what is saved (no longer carried from the old copy); `evolvedFrom` is
  set from `extra`, else kept while the species is unchanged.
- Collection rows: `{ screen: 'species', id: own species, copy }`. Counters owned rows:
  `{ screen: 'species', id: the row's species, copy }`.

Tests: hash round trip with `copy`; the redirect; `updateManual` saving moves, Purified and
`evolvedFrom`; `speciesView` passing pins. Commit `Web: species links carry the copy to show`.

### Task 5: Shared parts

**Files:** `components.tsx`, `components/MovePicker.tsx`, `components/species/MovesCard.tsx`,
`packages/ui/src/components/SaveBar.tsx`, `packages/ui/base.css`, `packages/ui/src/index.ts`,
gallery; tests `MovePicker.test.tsx`, `packages/ui/test/SaveBar.test.tsx`,
`apps/web/test/movesCard.test.tsx`.

- Glyphs `PinGlyph({ on })`, `StarGlyph`, `TrashGlyph`, `PlusGlyph`, drawn like `PencilGlyph`.
  The star uses `var(--accent-text)` and carries `aria-label="Recommended"`.
- `MoveOption` exported from `MovePicker.tsx` with an optional `recommended` prop (star after
  the type chip). The team picker passes nothing new and renders as before.
- `MovesCard({ pool, known, edit, onChange, leagueTitle, note })`: `known` null means not
  entered (the starred set is ticked). Read only: unticked rows disabled. Edit: fast is a radio;
  charged is one or two, the last one stays ticked, a third waits ("Untick one to pick
  another"). Legend line with the star; the move-count `Term` explainer; `note` under it.
- `SaveBar({ saveLabel, discardLabel, onSave, onDiscard, busy })`: `position: sticky` at the
  bottom of the screen column, above the tab bar, tokens only. Gallery entry in both themes.

Commit `UI: the moves card, the save bar and four glyphs`.

### Task 6: The species page

**Files:** `screens/SpeciesPage.tsx`, `components/species/ShownCopy.tsx`,
`components/species/Yours.tsx`, `app.css` (layout only); test `speciesPage.test.tsx`.

Order and copy as the spec's "The species page". Details:

- The view loads on mount and whenever the collection, league or filters change; a stale answer
  is dropped. While it loads, the shown copy area is `Loading`.
- Shown copy: `?copy=` when it is in the view, else `pickId`, else `defaultId`, else the first.
- Pin: empty tapped opens the pin confirm, then `setPin(id, copyId)`; filled tapped opens the
  unpin confirm, then `setPin(id, null)`.
- Remove: danger confirm, `removeSpecimen`, and a `copy` in the address is dropped.
- Edit: `#/add?edit=<id>`.
- Moves card pool: `movePool(id, fast, current)` with the shown copy's moves when it is this
  species, none for a lower form; PvPoke's set starred (`allowEliteTm: true`).
- Cost hidden when stardust, candy, XL candy, Elite TM are all zero and there is no second move
  unlock and no Mega Energy to pay.
- "Best as <Species> in <League>": the collection verdict's build species differs from the page.
- Not allowed in the league but held: the line, then shown copy and Yours; no meta sections.

Tests: one per mock state (pinned, another copy shown, from a lower form, base species, not
collected, unpinned, not allowed but held); pin and unpin call `setPin`; remove keeps the page;
`?copy=` for a missing id falls back (review focus 2); a no-IV copy listed last (review focus
1); the existing meta, exclusion, league-link and failed-read cases keep passing.

Commit `Web: the species page manages your copies`.

### Task 7: Edit

**Files:** `screens/AddPokemon.tsx`; tests moved out of `specimen.test.tsx` into
`editPokemon.test.tsx` and `addPokemon.test.tsx`.

- Title "Edit". Evolve select from `evolvesTo`; picking a stage swaps the slot species, shows
  "Evolved from <old>", sets CP to `cpFor(target, ivs, level)` and clears moves and the Mega
  mark. Saving passes `level` so the level is kept; a CP typed afterwards wins (review focus 3).
- "Calculated level" line from `levelForCp` over `baseStats`.
- Moves card (edit), "These are its moves", "Clear moves". The pool is refetched when the fast
  move changes so the counts follow.
- Other: Lucky, Purified (hidden for a Shadow, review focus 5).
- Dirty: any field differs from the stored copy. `SaveBar` only while dirty. Back while dirty
  opens "Discard your changes?".
- Add keeps its button and gains Moves and Other.
- After adding: the new copy's species page. After an edit: back, or the species page.

Commit `Web: Edit covers evolving, moves and Purified`.

### Task 8: Retire the Pokemon page, captures, records

- Delete `screens/Specimen.tsx` and `specimen.test.tsx` (cases that still apply were moved in
  Tasks 6 and 7; the rest are listed in the commit message).
- Update every other test that follows a specimen link.
- `screens.mjs`: the specimen captures become species-page and Edit captures; checks follow.
- `docs/design/audits/species.md` redone for the new page, `edit.md` new,
  `pokemon-detail.md` marked retired. Unsigned until Travis signs.
- `CLAUDE.md`: screens list, spec link.
- Run lint, typecheck, tests, `check-tokens`, `check-colors`, `web:screens`, `web:audit`,
  `ui:audit`.

Commit `Web: the Pokemon page is retired into the species page`.
