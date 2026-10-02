# Species page as the collection manager

Date: 2026-10-02. Status: layout approved by Travis over four mock rounds (branch
`mock/species-manager`, never merged) and a usability review; written up for his review.

This is piece 2 of three. Piece 1 (`2026-10-01-collection-model-design.md`, shipped) gave every
Pokemon a permanent id, made imports merge, and added pins and evolve to the engine with no
buttons. Piece 3 puts the moves a Pokemon knows into the sims.

## Why

A player manages their Pokemon in two places today: the species page lists copies, and each copy
has its own page (`#/specimen/<id>`) with the facts, cost and actions. Pins and evolve exist in
the engine and nothing on screen reaches them. Edit corrects CP and IVs but not moves, Purified
or an evolution.

After this piece the species page is the one place: it shows the copy that represents the
species, lets the player pin another, edit it, remove it or add one, and the separate Pokemon
page is gone.

## What a player sees

### The species page (`#/species/<id>`)

A page is one species. It holds your copies of that species and your copies of every lower form
that can evolve into it (Umbreon's page shows your Umbreon and your Eevee; Eevee's page shows
only Eevee). Shadow and regional forms are their own species, as today.

Top to bottom:

1. **Hero**, as today. The count line reads "You have 2, and 3 Eevee that evolve into it",
   "You have 3 Eevee that evolve into it", "You have 2" or "Not in your collection".
2. **The shown copy.** A heading with three icons beside it, then the facts card.
   - Heading: "Your Umbreon" for a copy that is this species, "Your Eevee to evolve" for a lower
     form.
   - Icons, in this order: pin, edit (pencil), remove (trash). Icon buttons from `packages/ui`,
     each with a label for screen readers.
   - Card: one line (lower form name if any, CP, rank, level, Lucky, Purified, scan age), the
     verdict tag, IVs, "Umbreon IV rank" (the page's species, in both states, with the league
     named in the line under it), the verdict sentence and the "best IV spread" line.
   - Under the verdict, when they apply: "Also your pick for Vaporeon and Sylveon. It can only
     evolve once."; and, when this copy has a better build as another species, a link row
     "Best as Umbreon in Great League" to that page with this copy shown.
3. **Moves.** One card: every move the species can know, as the team move picker's rows, read
   only here. The moves this copy knows are ticked. A star marks PvPoke's recommended set, with
   the legend "Recommended by PvPoke for Great League" under the card. When no moves are saved
   the starred set is ticked and the line under the card says "Moves not entered yet." For a
   lower form the pool is the page's species (an Eevee on Umbreon's page shows Umbreon's moves,
   never entered). The count explainer line ("Foul Play after 4, then 3, then 4 Snarl") stays.
4. **Cost to build**, as the Pokemon page has it. Hidden when there is nothing to pay (no
   power-up, no evolution, no unlock, no Elite TM).
5. **Mega builds** and **Teams with this Pokemon**, moved from the Pokemon page unchanged.
6. **Yours.** Heading with a plus icon (Add one, with this species picked). Rows sorted by IV
   rank for the page's species, best first; the first three, then "Show all N". The pinned row
   carries a filled pin. Tapping a row shows that copy at the top (the address gains
   `?copy=<id>`, replacing, so Back leaves the page). A copy with no IVs sorts last and reads
   "Needs rescan"; its edit icon is how values get entered.
7. **Meta**: the facts card, moves players ran, moves at tournaments, seen next to, unchanged.
   They move below Yours.
8. **Use in team recommendations** switch, **Build around it**, **Who beats it**, unchanged.

Not collected: no shown copy. Yours is the existing "Scan one in Poke Genie, or add it by hand"
card with Add one, and the recommended moves card stays as today with "Teams and counters assume
these moves until you add one."

A species the league does not allow still shows the shown copy, its icons and Yours when you
hold one (so it can be edited or removed), under the line "Umbreon is not allowed in <league>."
With none held it is the empty state it is today.

Which copy is shown: `?copy=<id>` when it names a copy on this page; otherwise the pinned copy;
with the species unpinned, the default pick.

### Pins

The pin icon is filled on the copy that represents the species in the league in play, whether
pick3 chose it or the player did. It is empty on every other copy.

- **Empty pin tapped:** a confirm sheet. "Pin this Umbreon for Great League?" / "pick3 picks
  your best Umbreon for each league. This overrides that for Great League and unpins the CP 1492
  one, so teams use this one instead." / Pin this one / Cancel. With nothing pinned the line
  drops the unpin clause.
- **Filled pin tapped:** "Unpin this Umbreon for Great League?" / "With no Umbreon pinned, pick3
  treats Umbreon as one you do not have in Great League: it leaves your recommended teams, and
  Build and Counters use a typical one." / Unpin / Cancel.
- Unpinned, the card carries "No Umbreon is pinned for Great League, so pick3 treats it as one
  you do not have." and every pin is empty.
- A pin whose Pokemon is gone falls back to the default pick (piece 1). The page says nothing
  about it: the fallback is what a player expects after removing one.

This is piece 1's rule as shipped (unpinned means not collected). The mock's wording, "teams use
a typical one: top 10% IVs", was true only of Build, Suggest teammates and Counters, so the copy
above replaces it.

### Remove

The trash icon opens the existing danger confirm ("Remove this Umbreon?" / "It leaves your
collection on this phone. A new import will not bring it back." / Remove / Keep it). It is
offered on every copy, scanned or added by hand. After removing, the page stays and shows the
next pick.

### Edit (`#/add?edit=<id>`)

The Edit values form grows into Edit, top to bottom:

1. **Which Pokemon**: the locked slot. When the Pokemon can evolve, a select under it: "Evolved
   it? Pick what it is now", listing "Still an Eevee" and every later stage. Picking one changes
   the slot to the new species with "Evolved from Eevee" under its name, sets CP to the new
   species' CP at the same level and IVs, and resets the moves card to the new species, not
   entered. A Pokemon evolved earlier in pick3 shows "Evolved from Eevee" in the slot from then
   on. Nothing is stored until Save.
2. **CP**, then **IVs**, as today. Under the IVs a line "Calculated level" with the level that
   CP and IVs give, updating as they change; "No level gives exactly CP 1487 with those IVs"
   when none does.
3. **Moves**: the same card as the species page, taking taps. One fast move; one charged move,
   or two if unlocked. Until moves are entered the starred set is ticked and the line reads
   "Moves not entered yet. pick3 assumes the starred moves." Changing any tick, or tapping
   "These are its moves", enters them. "Clear moves" puts them back to not entered.
4. **Mega**: Mega-evolved before, Mega Level 4, as today. The Level 4 switch leaves the species
   page; it lives here only.
5. **Other**: Lucky; Purified (not offered for a Shadow).
6. **Save bar.** While anything differs from what is stored, a bar is pinned to the bottom with
   Save changes and Discard. Nothing else saves. Back with unsaved changes asks "Discard your
   changes?" first. The bar must not sit over the last field (the scroll area gains its
   height) and follows the iOS fixed bar rule (no sideways overflow on html or body).

What saved moves do in this piece: they are stored, shown ticked, and already change the cost
(a known second charged move needs no unlock; a known move needs no TM). The sims still run the
starred set until piece 3, so no copy here says "teams use the ticked moves". The line under an
entered set reads "pick3 uses these to work out what the recommended moves would cost."

Add by hand (`#/add`) keeps its own button and gains the Moves and Other sections.

Best Buddy is not tracked (decided 2026-10-02) and Shiny is not offered.

### Where the Pokemon page went

`#/specimen/<id>` no longer has a screen. An old link opens the copy's own species page with
that copy shown. Inside the app:

- Collection rows open the row's own species page with that copy shown.
- A team member or a Counters row opens the page of the species it battles as, with that copy
  shown.
- After adding by hand, the new Pokemon's species page; after an edit, back to where Edit was
  opened.

## How it is built

### Engine

- `verdicts/worth.ts`: `specimenVerdict` takes an optional target species. With a target, only
  builds of that species are judged, so one Eevee has a verdict as Umbreon and another as
  Vaporeon. Without one it behaves as today.
- New `collection/speciesView.ts`, pure: for a species and a league, the copies that are it or
  can become it (via `index.stagesFrom`), each with its verdict as that species, sorted by IV
  rank; the id `resolvePick` fields for it; and for each copy the other species it is the pick
  for. It reuses `comparePicks` and `resolvePick`, no second ranking rule.
- `evolveSpecimen` (piece 1) is what Save calls when the evolve select changed; the other edits
  apply on top through the existing manual path. `ManualInput` gains optional `purified` and
  `currentMoves`.
- `ComputeHost` gains `speciesView(speciesId, options)`; `manual` accepts the new fields.

### Web

- `screens/SpeciesPage.tsx` becomes the manager. The shown copy, moves card, Yours and the pin
  sheets are components in `components/species/`, each fed by props; the meta sections stay in
  the screen file as they are.
- `components/MovePicker.tsx`'s option row gains a `recommended` star so the species page, Edit
  and the team picker share one row. The star glyph, pin glyph, trash glyph and plus glyph join
  the existing glyphs in `components.tsx`.
- `screens/Specimen.tsx` is deleted; its route parses to a redirect. `Route` keeps
  `{ screen: 'species'; id; league?; copy? }`.
- `screens/AddPokemon.tsx` gains the evolve select, the calculated level line, the moves card,
  Purified, and the save bar. The save bar is a new `packages/ui` component (`SaveBar`: two
  buttons, props only) shown in the gallery.
- Store: `speciesView` request with the league's pins; `updateManual` carries moves, Purified
  and the evolve target; `setPin` and `removeSpecimen` are already there. A pin or removal
  refreshes the view and clears the cached recommendation as piece 1 does.
- No new color literals. Everything is `packages/ui` and tokens.

### Storage and privacy

No new stored fields beyond piece 1's (`currentMoves`, `purified`, `editedAt`, `evolvedFrom`
exist). No new network call: the page's reads are the ones it makes today.

## Out of scope

- Known moves in the sims, and whether a Shadow with no moves saved is run with Frustration
  (piece 3).
- More than one pin per species per league.
- A note when a pinned copy fails a team filter (budget, no XL) and sits the species out.
- Mega level beyond today's Level 4 mark; Shiny; Best Buddy.
- Collection's own layout. Only where its rows lead changes.

## Tests

- Engine: verdict with a target species (an Eevee judged as Umbreon and as Vaporeon differ);
  `speciesView` on the synthetic index (own copies plus lower forms, never higher forms; order;
  the pick; "also the pick for"; unpinned; a Shadow counts only for its Shadow form); manual
  entry with moves and Purified. Invariants only on live data.
- Web: the page in each mock state (pinned, another copy shown, from a lower form, a base
  species, not collected, unpinned, not allowed but held); pin and unpin sheets call `setPin`
  with the id and with null; remove keeps the page; `?copy=` picks the shown copy; the old
  specimen link redirects; Edit's evolve select, calculated level, moves entered or not, save
  bar appearing only when dirty, Back asking before discarding.
- `web:screens` captures replace the Pokemon page states with the new species page and Edit
  states, and the script's checks follow.

## Done when

Lint, typecheck, tests, `check-tokens`, `check-colors`, `web:screens` and `web:audit` pass, and
Travis signs the audit records for the species page and Edit in `docs/design/audits/`
(`pokemon-detail.md` is marked retired, pointing at the species record).
