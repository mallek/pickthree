# Build search filters (Yours only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Filters button beside Build's slot search, opening a Filters sheet whose one switch, Yours only, narrows the search and Suggested to the player's own copies.

**Architecture:** A new `BuildFilters` sheet beside `CollectionFilters.tsx`, same shape (a data array of switches, each on a `useSticky` key). `Build.tsx` reads the same key, puts the input and an icon-only `FilterButton` in Collection's `.search-row`, and filters its existing `picksGrid` / `suggested` lists. No engine, worker or storage change.

**Tech Stack:** React 19, TypeScript strict, vitest 4 + Testing Library (jsdom), puppeteer-core screens.

**Spec:** `docs/superpowers/specs/2026-10-18-build-search-filters-design.md`

## Global Constraints

- UI copy writes "Pokémon" with its accent. No em dashes anywhere (code, comments, copy, commits).
- Braces on all control flow (`curly: all`).
- Only `packages/ui` parts and existing classes: `FilterButton` (`iconOnly`), `Sheet`, `Switch`, `.search-row`, `.collection-filters`, `.meta`, `muted small`. No new color literals, no new CSS unless a measured layout bug needs it.
- Sticky key `build.yoursOnly`, default `false`. Switch label "Yours only", line "Only the Pokémon you have".
- With no collection: no Filters button, and Yours only has no effect whatever the stored value.
- The "yours" pill stays on every owned token, Yours only on or off.
- Yours only touches the slot search and its Suggested grid only. Suggest teammates and lead links are unchanged.
- Tests use synthetic data only (no pinned PvPoke values).
- Stage explicit paths when committing; never `git add -A`. Travis has unrelated uncommitted work under `packages/data/scripts/post` and `packages/engine/src/coldstart`: leave it alone. Do not push.
- Work on a branch `build-search-filters` from `main`. The `mock/build-search-filters` branch is a throwaway sketch; do not merge or cherry-pick it.

## Review Focus

1. **Collection forgotten with Yours only left on**: Build must fall back to today's mixed search (placeholder "Search any Pokémon for ...", species stand-ins shown), no button. Test in Task 2.
2. **Escape inside the open Filters sheet**: closes the sheet only; the slot's search stays open with the input focused. Test in Task 1.
3. **Verdicts still arriving with Yours only on**: neither empty-state line may show while `s.verdictsLoading` or before any verdict exists; the verdicts `Progress` shows instead. Test in Task 2.
4. **League switch with Yours only on**: Suggested must recompute against the new league's legal list (it reads `s.leagueInfo`; covered by `usable`). Test in Task 2.
5. **The screens run leaving Yours only on**: `useSticky` is in-memory and `page.goto` to a hash does not reload, so a capture that turns it on must turn it off before the next capture. Handled in Task 3.

---

### Task 1: Filters button and sheet, slot stays open

**Files:**
- Create: `apps/web/src/screens/BuildFilters.tsx`
- Modify: `apps/web/src/screens/Build.tsx` (imports; state near `poolsAsked`; the `<input>` in `.build-choose`, ~line 618; the sheet mount at the end of the returned tree)
- Test: `apps/web/test/buildFilters.test.tsx` (new)

**Interfaces:**
- Produces: `BuildFilters({ onClose }: { onClose: () => void })` in `BuildFilters.tsx`; `BUILD_FILTERS` array there (entries `{ key, label, line?, initial }`, first and only entry `build.yoursOnly`). In `Build.tsx`: `const [yoursOnlySetting] = useSticky('build.yoursOnly', false)`, `const yoursOnly = yoursOnlySetting && Boolean(s.collection)`, `const [filtersOpen, setFiltersOpen] = useState(false)`.

- [ ] **Step 1: Write the failing tests** in `buildFilters.test.tsx`. Copy the `seed` / `specimen` / `verdict` helpers' shape from `apps/web/test/buildOwnedToken.test.tsx` (seed a collection through `storage.saveCollection`, render `<AppProvider host={fakeHost({ verdicts })}><Probe /><Build /></AppProvider>`, `resetStickyForTests()` from `../src/components.tsx` in `beforeEach`). Tests:
  - `hides the Filters button with no collection`: open Lead (`'Lead, empty'`), the placeholder `'Search any Pokémon for Lead'` is there, `queryByRole('button', { name: /^Filters/ })` is null, and the text "No collection imported. Import a CSV to include your own Pokémon here." is shown.
  - `opens the Filters sheet with Yours only off, and counts it once on`: with a seeded collection, open Lead, button named `'Filters'`; click it, a dialog titled `'Filters'` holds `getByRole('switch', { name: 'Yours only' })` with `aria-checked="false"` and the line "Only the Pokémon you have"; click the switch, the button's name becomes `'Filters, 1 on'`.
  - `keeps the slot open through the sheet`: open Lead; `fireEvent.mouseDown(filterButton)` returns `false` (default prevented); click it; `fireEvent.blur(input)` while the sheet is open; click Done; the input is still in the document and `document.activeElement` is the input.
  - `Escape in the sheet closes the sheet, not the slot`: open the sheet, `fireEvent.keyDown(dialog, { key: 'Escape' })`; the dialog is gone and the search input is still rendered.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run apps/web/test/buildFilters.test.tsx`
Expected: FAIL (no Filters button).

- [ ] **Step 3: Implement**
  - `BuildFilters.tsx`: same structure as `CollectionFilters.tsx` (a `FilterSwitch` on `useSticky(filter.key, filter.initial)`, the list in `<div className="collection-filters">`, `Sheet` root id `build-filters`, title `Filters`).
  - `Build.tsx`: wrap the input in `<div className="search-row">`; after it, only when `s.collection`, an `iconOnly` `FilterButton` with `count={yoursOnly ? 1 : 0}` and `onClick={() => setFiltersOpen(true)}`, inside an element whose `onMouseDown` calls `e.preventDefault()` (a `display: contents` span, as the mock did, or equivalent) so the input keeps focus. The input's `onBlur` closes the slot only when `!filtersOpen`. Mount `{filtersOpen ? <BuildFilters onClose={() => setFiltersOpen(false)} /> : null}` beside the moves `Sheet`. `Sheet`'s `useReturnFocus` hands focus back to the input; if the test shows it does not, focus `searchRef` in `onClose`.

- [ ] **Step 4: Run the new tests and the existing Build tests**

Run: `npx vitest run apps/web/test/buildFilters.test.tsx apps/web/test/build.test.tsx apps/web/test/buildOwnedToken.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/BuildFilters.tsx apps/web/src/screens/Build.tsx apps/web/test/buildFilters.test.tsx
git commit -m "Build: a Filters sheet beside the slot search, with Yours only"
```

### Task 2: Yours only narrows the search and Suggested

**Files:**
- Modify: `apps/web/src/screens/Build.tsx` (`picksGrid` ~line 287, `suggested` ~line 324, placeholder, the `NothingMatches` block ~line 650)
- Test: `apps/web/test/buildFilters.test.tsx`

**Interfaces:**
- Consumes: `yoursOnly` from Task 1; existing `mine`, `usable`, `tokensOf`, `tokenKey`, `byWorth`, `ranks`, `RECENT_LIMIT`.

- [ ] **Step 1: Write the failing tests.** Seed copies of species in fakeHost's `legal` list (tinkaton, azumarill, clodsire, medicham; fakeHost ranks tinkaton 1, azumarill 2, clodsire 3, medicham unranked) with fitting verdicts (`build.speciesId` = the species), and turn Yours only on through the sheet before each assertion:
  - `Yours only narrows the search to your copies`: own Tinkaton only; type `'a'` (matches Tinkaton, Azumarill, Clodsire, Medicham); the grid holds only `'Tinkaton'`; placeholder is `'Search your Pokémon for Lead'`; switch off and Azumarill is back.
  - `Yours only Suggested lists your copies by meta rank`: own Medicham, Clodsire, Tinkaton (in that collection order); with nothing typed the grid's token names in order are Tinkaton, Clodsire, Medicham, each with a `yours` tag; Azumarill (not owned) is absent.
  - `says none of yours match`: own Tinkaton; type `'medi'`; text "None of your Pokémon match. Switch off Yours only to search every Pokémon." is shown and `NothingMatches`' "Nothing matches." is not.
  - `says none of yours can be built here`: own one Tinkaton whose verdict is `Not eligible`; nothing typed; text "None of your Pokémon can be built for this league."
  - `holds the empty lines while verdicts load`: verdicts that never resolve; with Yours only on and nothing typed, neither empty line is shown.
  - `says your Pokémon could not be checked when verdicts failed`: verdicts reject (stub `matchMedia` as `buildOwnedToken.test.tsx` does); text "Your Pokémon could not be checked for this league." and neither other empty line.
  - `ignores Yours only once the collection is gone`: turn it on, then clear the collection (the store's forget action, or re-render with an empty store and the sticky still set); placeholder is `'Search any Pokémon for Lead'`, no Filters button, typing `'azu'` shows Azumarill.
  - `recomputes Suggested on a league switch`: with Yours only on, switch to a second league whose `legal` leaves out one owned species (extend `fakeHost`'s `leagues`/`leagueInfo` the way `build.test.tsx`'s `ULTRA` does); that species' token is gone from Suggested.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run apps/web/test/buildFilters.test.tsx`
Expected: the new tests FAIL; Task 1's pass.

- [ ] **Step 3: Implement in `Build.tsx`**
  - `picksGrid`: when `yoursOnly`, `others` is empty (add `yoursOnly` to its deps).
  - `suggested`: when `yoursOnly`, return the usable owned tokens (`collection.specimens.filter(usable).flatMap(tokensOf)`), sorted by `ranks[stage] ?? 999` then `byWorth`, one per stage (first wins), sliced to `RECENT_LIMIT`, each `{ key: tokenKey(t), speciesId: t.stage, pick: t.pick, mine: true }`. Add `yoursOnly` to deps.
  - Placeholder: `` `Search ${yoursOnly ? 'your' : 'any'} Pokémon for ${SLOT_LABELS[target]}` ``.
  - Empty states, replacing the `grid.length === 0` line: when `yoursOnly` and the grid is empty, show nothing while `s.verdictsLoading || Object.keys(s.verdicts).length === 0` unless `s.verdictsError` is set; with `s.verdictsError`, "Your Pokémon could not be checked for this league."; otherwise "None of your Pokémon match. Switch off Yours only to search every Pokémon." when searching, else "None of your Pokémon can be built for this league." Each as `<p className="muted small" style={{ margin: 0 }}>`. Switch off: `NothingMatches` as today. The verdicts `Progress` line keeps its current condition.

- [ ] **Step 4: Run the Build tests, lint, typecheck**

Run: `npx vitest run apps/web/test/buildFilters.test.tsx apps/web/test/build.test.tsx apps/web/test/buildOwnedToken.test.tsx && npm run lint && npm run typecheck`
Expected: all PASS, no lint or type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/Build.tsx apps/web/test/buildFilters.test.tsx
git commit -m "Build: Yours only narrows the slot search and Suggested to your copies"
```

### Task 3: Screens, audit and the Build record

**Files:**
- Modify: `apps/web/scripts/screens.mjs` (`AUDIT_ENFORCED` ~line 39; the Build flow after `shot('build-choosing', ...)`, ~line 2548)
- Modify: `docs/design/audits/build.md` (an addendum section above `## Sign-off`, new screenshot rows)
- Create: `docs/design/audits/img/build-filters-sheet-{dark,light}.webp`, `build-yours-only-{dark,light}.webp`; replace `build-choosing-{dark,light}.webp`

- [ ] **Step 1: Add the captures.** After `build-choosing` (slot open, before its Escape): click `.ui-filter-icon`, wait for `.ui-switch-row`, click it, `shot('build-filters-sheet', false, { mustShow: '.ui-sheet .ui-switch-row' })`; click `.ui-sheet-done`, wait for the sheet to go, assert the search input is still present (throw `build filters: the slot closed with the sheet` if not), `shot('build-yours-only', false, { mustShow: '.build-choose .recent-token' })`; then open the sheet again, switch Yours only off, Done, and assert the placeholder starts with `Search any`. Add both names to `AUDIT_ENFORCED` after `'build-choosing'`.

- [ ] **Step 2: Run the audit**

Run: `npm run web:audit`
Expected: passes with no findings on any enforced screen, no console errors; the other Build captures (`build-empty`, `build-suggestions`, `13-build`, `13b-build-moves`, `build-cost`) unchanged in content.

- [ ] **Step 3: Write the addendum** in `docs/design/audits/build.md`: a dated "Addendum: search filters (2026-10-18)" section naming the spec, the three captures (dark and light, WebP 600px wide quality 72, converted the way the record's other images were), the automated result, the aesthetics and functionality checks for the new states (filter row matches Collection's; badge; sheet; slot stays open; pills unchanged), and an unchecked sign-off line for Travis. Convert the PNGs from `apps/web/screenshots/`.

- [ ] **Step 4: Full checks**

Run: `npm run lint && npm run typecheck && npm test && npm run check-colors`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/screens.mjs docs/design/audits/build.md docs/design/audits/img/build-filters-sheet-dark.webp docs/design/audits/img/build-filters-sheet-light.webp docs/design/audits/img/build-yours-only-dark.webp docs/design/audits/img/build-yours-only-light.webp docs/design/audits/img/build-choosing-dark.webp docs/design/audits/img/build-choosing-light.webp
git commit -m "Audit: Build search filters captures and record addendum"
```

- [ ] **Step 6: Hand to Travis.** Send the new captures; he reviews and signs the addendum. Merge to `main` and push only when he says so.
