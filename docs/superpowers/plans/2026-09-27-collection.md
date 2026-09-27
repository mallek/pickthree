# Collection and the Pokémon detail page (Piece 4, round 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Collection and the Pokémon detail page on the foundation (one cog, a filter icon,
a visible sort dropdown, verdicts as read-only tags, "Built" in place of "Ready to use", Exclude as
a switch at the end of the detail page, real back, the moves card's badge column), then write the
two audit records for Travis to sign.

**Architecture:** Two small ui additions land first (`InlineSelect`, the compact "Sort: X ▾"
dropdown Counters will reuse in round 3; `Header`'s sub variant with no title). The engine's
verdict label changes next, with every consumer and a `VerdictTag` in place of `VerdictChip`. Then
the shared `MoveRows` gets its badge column (Analysis's Pokémon details change with it), then
Collection, then the detail page. Captures, the enforced audit and the records last.

**Tech Stack:** React 19, TypeScript 5.9 strict, vitest 4 + jsdom + Testing Library,
puppeteer-core audit scripts.

**Spec:** `docs/superpowers/specs/2026-09-26-design-rest-of-app-design.md` (sections "Decisions",
"App-wide rules applied here", "Collection", "Pokémon detail (Specimen)", "States", "Testing",
"Records and sign-off", "Cleanup"). Foundation: `docs/superpowers/specs/2026-09-24-design-foundation-design.md`.
Record models: `docs/design/audits/settings.md`, `teams.md` (signed).

## Global Constraints

- Exact pinned versions; braces on all control flow; no em dashes anywhere (code, docs, commit
  messages); "Pokémon" with the accent in UI copy.
- Tokens only (`npm run check-colors`; rewrite the baseline with `--write` only when a literal is
  removed); no class another screen already styles (grep `apps/web/src/app.css` and
  `packages/ui/base.css` first); 44px touch targets.
- Red only for destroying data: Remove from collection is `danger`. Nothing else here is red.
- Pink only for measured data: nothing on these pages is measured, so no pink.
- Tags are read, chips are tapped: a verdict, a rank or "Same wins as best IVs" is a `Tag`; the
  verdict filter chips stay `Chip`s.
- Back returns to where you came from with `back(fallback)` and the label "Back"; no screen
  hard-codes its back destination.
- Every `window.confirm` becomes `ConfirmSheet`, tone `danger` only when the action deletes data.
- Copy is the spec's, verbatim, where the spec gives it.
- The enforced audit fails a capture whose text is never on screen in any capture of its page and
  theme (`scripts/audit.mjs` "Not on screen, unmeasured"; NEVER on an enforced name fails): long
  pages are full-page captures, and a sheet with scrolled-off text needs a second, scrolled capture.
- Stage explicit paths; commit messages: subject alone on line 1, a blank line, body, trailers
  (`Co-Authored-By` names your own model;
  `Claude-Session: https://claude.ai/code/session_01QpDSW9ZhLWToL3VMBP1mJq`); write the message to
  a file and `git commit -F`. Never kill a process you did not start.

## Rulings made while writing this plan

1. **`InlineSelect` is a ui component** (`packages/ui/src/components/InlineSelect.tsx`): Collection's
   "Sort: Verdict ▾" now and Counters' "Sort: Best ▾" in round 3. A native `<select>` laid over the
   visible "Sort: Verdict ▾" text, so the phone opens its own picker; its accessible name is the
   label ("Sort"). [New shared component.]
2. **`Header variant="sub"` takes an optional title**: omitted, no `<h2>` renders, and the page's
   own heading is the name. The spec wants the detail page's name once. [ui API change.]
3. **`VerdictTag`** replaces `VerdictChip` (`apps/web/src/components.tsx`), a `Tag` with the spec's
   tones (Built `win`, Worth building `accent`, Wait for better IVs `neutral`, Needs rescan `warn`,
   Not eligible `neutral`) inside `<span className="verdict-tag" data-verdict={label}>`, so scripts
   and tests can find a verdict without depending on the tone class. [Markup.]
4. **The Filters sheet is the ui `Sheet`** titled "Filters", its rows the ui `Switch`. The count on
   the filter icon is the number of the five toggles that differ from their defaults (Group same
   Pokémon on, the other four off). [Definition.]
5. **"Already at level L."** shows when `build.stageOffset === 0` and `build.level <= sp.level.max`;
   the cost tiles and the "Level A to B" line are then hidden. [Condition.]
6. **Capture names** (all enforced, both themes): `04-collection` (grouped, judged, full page),
   `11-collection-group` (a group open), `collection-flat` (Group off), `collection-filters-sheet`,
   `collection-judging` (verdicts in progress), `collection-empty` (a search with no match),
   `05-specimen` (a building Pokémon, full page), `specimen-built`, `specimen-evolve`,
   `specimen-excluded`, `specimen-manual` (a hand-added one, Remove shown),
   `specimen-remove-confirm`, `specimen-not-found`. The sort dropdown is a native picker the page
   cannot draw, so it has no capture; a test covers it. [Names.]
7. **Build's verdict order and every other `VerdictLabel` consumer follow the rename**; verdicts are
   computed, never stored, so there is no migration. [Scope.]

## Review Focus

1. **The detail page opened from a link or a fresh load** (no pick3 history): Back goes to
   Collection (the fallback), never off the site.
2. **Back from the detail page to Collection:** search, chips, filters, sort, open groups and the
   scroll position are as they were.
3. **Remove from collection, confirmed, when the page was opened from Counters:** the Pokémon is
   gone and Back lands on Counters, not on a page for a Pokémon that no longer exists.
4. **The filter count after turning Group same Pokémon off:** the icon shows 1, and the count line
   reads "N shown".
5. **The detail page while verdicts are still being worked out:** it shows the loading state and no
   cost or moves section, then fills in without a reload.

---

### Task 1: ui `InlineSelect` and `Header` without a title

**Files:**
- Create: `packages/ui/src/components/InlineSelect.tsx`
- Modify: `packages/ui/src/components/Header.tsx`, `packages/ui/src/index.ts`,
  `packages/ui/base.css`, `packages/ui/gallery/Gallery.tsx`, `packages/ui/test/Gallery.test.tsx`
  (its section list)
- Test: `packages/ui/test/Controls.test.tsx`, `packages/ui/test/HeaderExpand.test.tsx`

**Interfaces:**
- Produces: `InlineSelect<T extends string>({ label: string; value: T; options: ChoiceOption<T>[]; onChange: (v: T) => void })`
  exported from `@pickthree/ui`: shows `"<label>: <selected option label>"` and a down chevron; a
  native `<select>` covers it (opacity 0, same box, 44px tall), named by `label`.
  `Header` props: `title?: string` for `variant="sub"` (still required in practice for `top`).

- [ ] **Step 1: Failing tests**

```tsx
describe('InlineSelect', () => {
  const options = [
    { value: 'verdict', label: 'Verdict' },
    { value: 'rank', label: 'IV rank' },
  ] as const;
  it('shows the label and the chosen option, and is a select named by the label', () => {
    render(<InlineSelect label="Sort" value="verdict" options={[...options]} onChange={() => undefined} />);
    expect(screen.getByText('Sort: Verdict')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('verdict');
  });
  it('reports a new choice', () => {
    const onChange = vi.fn();
    render(<InlineSelect label="Sort" value="verdict" options={[...options]} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'rank' } });
    expect(onChange).toHaveBeenCalledWith('rank');
  });
});

it('renders a sub header with a back and no title', () => {
  render(<Header variant="sub" back={{ label: 'Back', onClick: () => undefined }} />);
  expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  expect(screen.queryByRole('heading')).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run --project ui packages/ui/test/Controls.test.tsx packages/ui/test/HeaderExpand.test.tsx`: FAIL.
- [ ] **Step 3: Implement**

```tsx
import { useId } from 'react';
import { Chevron } from './Chevron.tsx';
import type { ChoiceOption } from './Select.tsx';

/** A compact choice that reads as text ("Sort: Verdict"), for a line that has room for a word, not
 * a field. A native select lies over it so the phone opens its own picker; the label names it. */
export function InlineSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <span className="ui-inline-select">
      <span className="ui-inline-select-text" aria-hidden="true">
        {label}: {current}
        <Chevron dir="down" />
      </span>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value);
          if (next) {
            onChange(next.value);
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled ?? false}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
```

  CSS (`base.css`, tokens only): `.ui-inline-select` is `position: relative; display:
  inline-flex; min-height: 44px; align-items: center`; its text in `--accent-text`, weight 600, at
  `--fs-support`; the `select` is `position: absolute; inset: 0; opacity: 0; width: 100%;` with a
  visible `:focus-visible` ring drawn on `.ui-inline-select:has(select:focus-visible)`. `Header`:
  make `title` optional; in the sub variant render the title element only when `title` is given
  (check `HeaderShell` for where it renders). Gallery: an `InlineSelect` section ("Sort:
  Verdict"), and a sub header with no title in the Header section.
- [ ] **Step 4: Run** the ui tests, `npm run ui:audit`, `npm run lint`, `npm run typecheck`: PASS.
- [ ] **Step 5: Commit** `UI: InlineSelect, and a sub header with no title`.

---

### Task 2: "Built", and verdicts as tags

**Files:**
- Modify: `packages/engine/src/verdicts/worth.ts` (the `VerdictLabel` union and the "Ready to use"
  branch near line 234), `packages/engine/test/recommend.e2e.test.ts` (line 92), the engine's
  verdict tests (grep `Worth building` in `packages/engine/test`), `apps/web/src/components.tsx`
  (`VerdictChip` becomes `VerdictTag`), `apps/web/src/screens/Build.tsx` (its `ORDER` map, line
  ~47), `apps/web/src/screens/Collection.tsx` (`PILLS`, `ORDER`, the two row tags),
  `apps/web/src/screens/Specimen.tsx` (the hero tag), `apps/web/src/app.css` (drop `.verdict`,
  `.v-*` and `.spec-row.sub .verdict` once unused; add `.verdict-tag` only if layout needs it),
  `apps/web/scripts/screens.mjs` and `apps/web/scripts/review.mjs` (their `.verdict` selectors
  become `.verdict-tag`)
- Test: the engine verdict test file, `apps/web/test/components.test.tsx`

**Interfaces:**
- Produces: `VerdictLabel = 'Built' | 'Worth building' | 'Wait for better IVs' | 'Not eligible' | 'Needs rescan'`;
  `VerdictTag({ label: VerdictLabel })` rendering
  `<span className="verdict-tag" data-verdict={label}><Tag tone={...}>{label}</Tag></span>`.

- [ ] **Step 1: Failing tests**:
  - engine: a specimen already at its build level with top 25% IVs gets `label: 'Built'` and a
    line starting `Top N% IVs for Great League, already at level L.` with no "Use it."; the e2e
    check reads `labels.has('Worth building') || labels.has('Built')`;
  - web: `VerdictTag` renders each label in a `Tag` with the ruling-3 tone (`ui-tag-win` for
    Built, `ui-tag-accent`, `ui-tag-neutral`, `ui-tag-warn`) and `data-verdict`.
- [ ] **Step 2: Run** `npx vitest run --project engine` and the components test: FAIL.
- [ ] **Step 3: Implement**: the label and sentence in `worth.ts` (keep the meta note:
  `withMeta(\`Top ${topPct}% IVs for ${deps.league.title}, already at level ${s.level.max}.\`)`);
  every consumer follows (TypeScript finds them); `VerdictTag` in place of `VerdictChip`; the
  Collection chip reads "Built" (`{ label: 'Built', short: 'Built' }`); the scripts wait for
  `.verdict-tag`.
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npm run typecheck`, `npm run check-colors`: PASS.
- [ ] **Step 5: Commit** `Engine: Ready to use becomes Built; verdicts are tags`.

---

### Task 3: The moves card's badge column

**Files:**
- Modify: `apps/web/src/components.tsx` (`MoveRows`, ~line 398), `apps/web/src/app.css`
  (`.move-row`, `.move-line`, `.moves` near line 380)
- Test: `apps/web/test/components.test.tsx` (or `analysisComponents.test.tsx` if `MoveRows` is
  tested there; grep)

**Interfaces:**
- Consumes/produces: `MoveRows` keeps its props; each `.move-row` becomes three grid columns
  (kind, the move, the badge), the badge (`TmBadge`: Has it, TM, Elite TM) a direct child of the
  row, top-aligned in its own column.

- [ ] **Step 1: Failing test**: for each row, the `TmBadge` element is a direct child of
  `.move-row` (not inside `.move-line`), and the row's type and effect tags stay inside
  `.move-line` after the name.
- [ ] **Step 2: Run**: FAIL.
- [ ] **Step 3: Implement**: move `<TmBadge>` out of `.move-line` to the row's end;
  `.move-row { grid-template-columns: 56px 1fr auto; }`; the badge `align-self: start` with the
  small top offset that lines it up with the move name; `.move-line .tm { margin-left: auto }`
  goes; the `.moves` border-top goes where the card has its own edge (the detail page's
  Recommended moves card and Analysis's Pokémon details both sit in a card: check both).
- [ ] **Step 4: Run** the web tests; build and look at Analysis's Pokémon details and the detail
  page's moves card at 390px (the preview server or `web:screens`): Upper Hand (or any move with an
  effect tag) keeps its badge level with its name and its tags wrap under the name without a gap.
- [ ] **Step 5: Commit** `Web: move badges get their own column`.

---

### Task 4: Collection

**Files:**
- Modify: `apps/web/src/screens/Collection.tsx`, `apps/web/src/app.css`
- Create: `apps/web/src/screens/CollectionFilters.tsx` (the Filters sheet)
- Test: `apps/web/test/collection.test.tsx` (new; set up like `settings.test.tsx`: `AppProvider`,
  `fakeHost`, a seeded collection, the boot-route settle before any tap)

**Interfaces:**
- Consumes: `Header`, `IconButton`, `FilterButton`, `Chip`, `Sheet`, `Switch`, `InlineSelect`,
  `Loading`, `ErrorState`, `Empty` from `@pickthree/ui`; `VerdictTag` (Task 2); the app's
  `MetaGlyph`, `CogGlyph`, `openSheet`, `navigate`, `useSticky`, `useScrollMemory`.
- Produces: `CollectionFilters({ onClose: () => void })`, reading and writing the same sticky keys
  (`collection.showIneligible`, `collection.shadows`, `collection.recent`, `collection.meta`,
  `collection.grouped`) as the list, so both see one state.

- [ ] **Step 1: Failing tests**:
  - one Settings cog on the page (`getAllByRole('button', { name: 'Settings' })` has length 1), a
    link or button named "Add a Pokémon" that goes to Add Pokémon, and the meta.pick3.gg link;
  - the filter button reads "Filters" with no count by default; turning "Shadows only" on in the
    Filters sheet makes it "Filters, 1 on"; turning "Group same Pokémon" off also counts (ruling
    4), and the count line then reads "N shown";
  - the chips are Built, Worth it, Wait for IVs, Rescan; picking Built shows only Built rows;
  - "Sort" is a combobox; choosing "Name" orders the rows by name;
  - each row's verdict is a `.verdict-tag`, not a button;
  - leaving for a detail page and coming back keeps search, chips, filters and sort (sticky);
  - a search with no match shows "Nothing matches. Try another name or clear a filter." as the
    `Empty` state;
  - no `.popover`, no `.sort-toggle`, no `.filters-hint` in the document.
- [ ] **Step 2: Run** them: FAIL.
- [ ] **Step 3: Implement** per the spec's Collection section:
  - `Header variant="top"` "Collection" with three `IconButton`s: plus ("Add a Pokémon", a 20px
    plus glyph), meta.pick3.gg (the `MetaGlyph` and label Teams uses), Settings (`CogGlyph`,
    `openSheet`); the league switcher under it. `HeadCog`, `MetaButton` and the "+ Add" pill go
    from this screen.
  - Sticky search row: the search input as today, then `FilterButton iconOnly` with the ruling-4
    count, opening `CollectionFilters` (ui `Sheet` "Filters", five `Switch` rows with today's
    labels and lines: "Group same Pokémon" / "One row per species, best first", "Show ineligible" /
    "Pokémon over the cap or banned here", "Shadows only" / "Just the Shadow Pokémon", "Scanned
    recently" / "Last two weeks of scans", "Top 50 meta" / "Only species in the top 50 for this
    league").
  - The chips row as today with Built.
  - One line: the count on the left ("147 Pokémon · 90 kinds" grouped, "147 shown" flat) and
    `InlineSelect label="Sort"` on the right (Verdict, IV rank, Meta rank, Name).
  - Rows: `VerdictTag` in place of the chip; everything else stays.
  - States: judging uses `Loading` (the verdicts stage); the error uses `ErrorState` with today's
    copy; the empty result uses `Empty`; no collection keeps `NoCollection`.
  - Remove the popover, `settingsOpen`, `.sort-toggle`, `.filters-hint`, and any CSS only they
    used (grep each class first).
- [ ] **Step 4: Run** the collection tests (at least 10 times in a loop), `npm test -- --project web`,
  `npm run lint`, `npm run typecheck`, `npm run check-colors`: PASS.
- [ ] **Step 5: Commit** `Web: Collection on the foundation: one cog, a filter icon, a visible sort`.

---

### Task 5: The Pokémon detail page

**Files:**
- Modify: `apps/web/src/screens/Specimen.tsx`, `apps/web/src/app.css`
- Test: `apps/web/test/specimen.test.tsx` (new, the same setup as the collection tests)

**Interfaces:**
- Consumes: `Header` (sub, no title), `IconButton`, `Switch`, `ConfirmSheet`, `Button`, `Empty`,
  `Loading` from `@pickthree/ui`; `VerdictTag`; the store's `back(fallback)`, `toggleExcluded`,
  `removeSpecimen`.

- [ ] **Step 1: Failing tests**:
  - the header has a "Back" button and the Settings button, and no heading in the header; the
    page's one level-2 heading (or the hero's name element) is the Pokémon's name, and the name
    appears once as a heading;
  - opened from Counters (navigate to Counters, then to the detail page), Back returns to
    Counters; opened fresh (no history), Back goes to Collection;
  - the verdict is a `.verdict-tag`;
  - a Pokémon already at its build level (stageOffset 0, build level at or under its level) shows
    "Already at level L." and no Stardust, Candy or XL Candy tiles;
  - the "Use in team recommendations" switch is on for an included Pokémon; turning it off adds
    the id to `settings.excludedSpecimenIds` and the switch reads off in place; on again removes
    it; no element with `position: fixed` inside the page body (the old bottom bar is gone);
  - a hand-added Pokémon shows "Remove from collection"; tapping it opens "Remove this <name>?"
    with "Remove" as `ui-btn-danger`; "Keep it" changes nothing; "Remove" removes it and goes
    back (Review Focus 3: opened from Counters, it lands on Counters); a scanned Pokémon shows no
    Remove;
  - an unknown id shows the `Empty` state with today's line and the sub header;
  - while verdicts load, the page shows `Loading` and no cost or moves section, then fills in.
- [ ] **Step 2: Run** them: FAIL.
- [ ] **Step 3: Implement** per the spec's Pokémon detail section: `Header variant="sub"` with
  `back={{ label: 'Back', onClick: () => back({ screen: 'collection' }) }}` and the Settings
  `IconButton`, no title; the hero as today with `VerdictTag` and `HundoTag`; the facts card as
  today; `MoveRows` (Task 3); the cost section with ruling 5; teams as today; at the end a card with
  `Switch label="Use in team recommendations" line="Off leaves it out of Teams and Build suggestions."`
  (checked = not excluded; `onChange` calls `toggleExcluded(sp.id)`), and, for manual entries only,
  `Button variant="danger"` "Remove from collection" opening `ConfirmSheet` tone `danger` (title
  `Remove this ${name}?`, line "It leaves your collection on this phone.", confirm "Remove",
  cancel "Keep it"); on confirm, `removeSpecimen(sp.id)` then `back({ screen: 'collection' })`.
  The fixed `bottom-actions` bar and `window.confirm` go; the not-found state uses `Empty`; the
  loading state uses `Loading`.
- [ ] **Step 4: Run** the specimen tests (10 times in a loop), `npm test -- --project web`,
  `npm run lint`, `npm run typecheck`, `npm run check-colors`: PASS.
- [ ] **Step 5: Commit** `Web: the Pokémon detail page on the foundation`.

---

### Task 6: Captures, the enforced audit, fixes

**Files:** `apps/web/scripts/screens.mjs` and whatever the audit and captures point at.

- [ ] Replace the `04-collection` / `11-collection-group` / `05-specimen` steps with the ruling-6
  captures, all enforced, both themes. Seed the states the way the script already seeds others
  (IndexedDB reads and writes in the page, restored after): a hand-added Pokémon for
  `specimen-manual` (the Add Pokémon step already makes one: reuse it), an excluded one for
  `specimen-excluded` (flip the switch, shoot, flip back), an evolving one and a built one (pick
  them from the judged list by their facts, and fail with a clear message if the sample has none).
  `collection-judging` holds the compute worker at a debugger pause, as `teams-loading` does.
  `specimen-remove-confirm` cancels, never confirms. Where a long page's text scrolls out of a
  container, add a scrolled capture so no enforced text is NEVER measured.
- [ ] Run `npm run web:audit` until exit 0 with zero findings on every enforced name and no NEVER
  line. Open every capture in both themes and fix what the audit cannot see (stray boxes, gutter,
  text under the header or tab bar, tags that look tappable, anything unlike the signed pages).
  List what you saw.
- [ ] Commit: `Web: Collection and the Pokémon detail page join the enforced audit`.

---

### Task 7: The two audit records

**Files:** `docs/design/audits/collection.md`, `docs/design/audits/pokemon-detail.md` (from
`_template.md`, modeled on `settings.md`), their WebPs in `docs/design/audits/img/`.

- [ ] Convert the enforced captures (both themes, 600px wide, quality 72), look at each, and write
  the two records: screenshots, automated checks, both checklists ticked only where a capture or
  test backs the tick, findings and fixes with commits, this plan's rulings and the ledger's, visible
  changes outside each page (the ui `InlineSelect` and title-less sub header, "Built" in the engine
  and Build's order, the moves badge column in Analysis), open items. Sign-off lines unticked.
- [ ] Commit: `Design: Collection and Pokémon detail audit records`.
