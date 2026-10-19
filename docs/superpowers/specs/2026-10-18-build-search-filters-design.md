# Build search filters: Yours only

Date: 2026-10-18. Status: designed with Travis in chat from mocks built in the real app (mock
branch `mock/build-search-filters`, throwaway); each decision below was his unless marked as the
builder's call.

## Why

Build (`#/build`, "Build Your Team") fills a slot from a search. Today the search mixes your copies
(tagged "yours", listed first) with every other legal species at a top-10% IV stand-in, and with
nothing typed it shows Suggested (meta and recent opponents, your copy where you have one). A
player who only wants to build from what they own has no way to say so; they scan past Pokemon
they do not have.

Build's search gets a filter menu, the same pattern Collection's search uses, so it can grow later.
Its first and only switch for now is **Yours only**.

UI copy writes "Pokémon" with its accent, as the rest of the app does (Travis, 2026-10-18).

## Goals

- A Filters button beside Build's search that opens a Filters sheet of switches.
- One switch, Yours only: the search and Suggested show only your copies.
- Built from the signed parts Collection already uses: its search row, `FilterButton` (icon only,
  count badge), `Sheet` and `Switch`. No new styles, no new color literals.
- Room for more switches later without reworking the screen.

## Non-goals

- Other switches (Collection's Shadows only, Top 50 meta, and so on). Later, only if Travis asks.
- A clear (x) button in Build's search. Travis agreed to leave it out.
- Any change to the "yours" pill, the grid, or how the mixed (switch off) search and Suggested
  behave today.
- Saving the switch across app restarts.

## Anti-goals

- Opening the sheet or flipping the switch must never close the open slot's search. Losing your
  place to a filter tap would make the feature worse than not having it.
- No invented visuals. The mock showed that an "owned" mark other than the pill, or grouping the
  grid into Yours / Any Pokemon sections, costs more than it gives; Travis kept the pill.

## The design

### Search row

While a slot's search is open (`.build-choose`), the input sits in Collection's `.search-row`
with an icon-only `FilterButton` at its right (`iconOnly`, `count` = the number of Build
switches that differ from their default, so 0 or 1 today; the badge shows at 1). The button
opens the Filters sheet. The input keeps its own look, focus behavior and keyboard handling.

No collection imported: the button is not rendered at all, and the existing line "No collection
imported. Import a CSV to include your own Pokémon here." stays as it is.

### Filters sheet

A new `BuildFilters` sheet, a sibling of `CollectionFilters.tsx` and shaped like it: `Sheet` titled
"Filters" with Done, a list of `Switch` rows (the `.collection-filters` list markup), each on its
own `useSticky` key that Build reads with the same default. The switch list is a data array so a
later switch is one entry.

The one switch:

- Label "Yours only", line "Only the Pokémon you have" (Collection's line for Hide not
  collected, word for word).
- Sticky key `build.yoursOnly`, default off. `useSticky` holds it for the session: leaving Build
  and coming back keeps it; reloading the app resets it, as Collection's filters do.

### Yours only on

The switch only takes effect while a collection is loaded; with none, Build behaves as if it is
off, whatever the stored value.

- **Placeholder:** "Search your Pokémon for <slot>" (Lead, Safe Switch, Closer) instead of
  "Search any Pokémon for <slot>".
- **Search results:** only your copies, exactly the list Build already computes for them (the
  `mine` tokens: usable copies with a verdict and a build here, Mega base forms included, best
  copy per stage, at most 30). The species stand-ins are left out.
- **Suggested (nothing typed):** your best copy of each species you can run in this league,
  ordered by the league's meta rank, ties by your copy's worth (Built, Worth building, Wait for
  better IVs, then IV rank), one token per stage, at most `RECENT_LIMIT`. Travis chose meta order
  over best-built first. The rank is PvPoke's (`s.leagueInfo.metaRanks[id].overall`), the same
  order today's Suggested falls back on, worked out on the phone with no network read (builder's
  call: the blended community rank would add an automatic `/api/v1/meta` read to Build, which
  would have to follow the sharing switch). Species with no rank go last.
- **The "yours" pill stays on every token,** as it does today. Travis: "The pill isn't too bad.
  Let's just leave it."
- **Nothing to show:** typed with no match, "None of your Pokémon match. Switch off Yours only to
  search every Pokémon." Nothing typed and nothing usable, "None of your Pokémon can be built for
  this league." (Both as `muted small` lines where `NothingMatches` sits today.)
- **While verdicts load** (`s.verdictsLoading`, or a collection with no verdicts yet): show the
  existing verdicts `Progress` and hold back both empty-state lines, which would be untrue until
  every copy is judged; the copies appear as their verdicts arrive.
- **If verdicts failed** (`s.verdictsError`): builder's call, see below.

### Keeping the slot open

The search input closes the slot on blur today (`onBlur={() => setTarget(null)}`). Grid taps
avoid that with `onMouseDown` preventDefault. The filter button must do the same, and the blur
handler must not close the slot while the Filters sheet is open (the sheet takes focus when it
opens). When the sheet closes, focus returns to the input (`Sheet`'s `useReturnFocus` already
does this; the mock confirmed the slot stayed open and the input had focus after Done). Escape in
the sheet closes the sheet only, not the slot.

## Verification

- Tests in `apps/web/test/build.test.tsx` (Testing Library, synthetic data only): button hidden
  with no collection; badge count 0 then 1; switch on narrows search results and Suggested to
  owned copies, both empty-state lines, the placeholder; opening the sheet, flipping, and Done
  leave the slot open and the input focused; switch off restores today's mixed results; the
  switch value survives leaving and returning to Build.
- `screens.mjs`: new captures of the Filters sheet open and of Yours only on (Suggested), added
  to the enforced audit set beside `build-choosing`. `build-choosing` changes (it is taken with the
  sample collection, so it now shows the filter button) and goes into the addendum for
  re-signing; the other Build captures must not change.
- `npm run web:audit` passes; an addendum to `docs/design/audits/build.md` with the new captures
  and checklists; Travis signs it.
- Lint, typecheck, tests, `check-colors` clean.

### Scope: the slot search only

Yours only filters the slot search and its Suggested grid, nothing else on Build. Suggest
teammates and lead links that seed a slot are unchanged.

## Left to the builder

- Whether the shared switch-row component for `BuildFilters` and `CollectionFilters` is factored
  out or copied; prefer the smaller diff that reads like the surrounding code.
- The exact names of new captures and test cases.
- **Verdicts failed with Yours only on** (builder's call): nothing of yours can be judged, so the
  grid is empty; show a plain line saying your Pokémon could not be checked for this league,
  rather than "None of your Pokémon match", which would be untrue.
