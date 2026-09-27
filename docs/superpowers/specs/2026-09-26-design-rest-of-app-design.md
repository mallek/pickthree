# The rest of the app: Settings, Collection, the Pokémon detail page, Counters

Date: 2026-09-26. Status: design approved in chat (Travis), spec awaiting review.

Piece 4 of the design program (piece 1: `2026-09-24-design-foundation-design.md`; piece 2:
`2026-09-25-design-core-flow-design.md`; piece 3: `2026-09-26-design-play-design.md`, all signed).
Inputs:

- Inventory: `docs/design/inventory/2026-09-22-inventory.md`, pages 6 (Who Beats X), 7 (Counters),
  8 (Collection and Pokémon detail) and 9 (Settings sheet).
- Intake: `docs/design/inventory/2026-09-23-design-intake.md`, "Settings sheet, first pass",
  "Settings sub-pages and the confirm sheet, first pass", design 4 (Navigation: back and jumps) and
  "Coordination with source-weighted recommendations".
- Renders approved in chat on 2026-09-26 (DOM surgery on the built app): the Collection controls
  (option B), the verdict tags, the Pokémon detail page, the moves card fix, Counters as one page
  with an Against picker, and the full shield grid on Counters rows.

## Goal

Bring the pages the first three pieces did not touch onto the foundation's tokens, components and
rules: one cog, real back, labeled jumps, at most one line before the first result, read-only tags
that never look like buttons. Split Settings into a hub with four pages, turn Counters and Who
Beats X into one page, and show the full shield matchup against one opponent, which PvPoke does not
provide. Each page passes the audit and Travis signs its record.

## Decisions (Travis, 2026-09-26)

- **Order:** one spec, built in three rounds: Settings, then Collection with the detail page, then
  Counters. "That order works."
- **The rank band is retired:** Settings stops asking for it and new battle records go out without
  one ("Yes"). Records already stored keep theirs; the worker already accepts no band.
- **"Ready to use" becomes "Built"** ("Sounds good"). The chip and filter read "Built"; the detail
  sentence drops "Use it."
- **Collection controls, option B:** one cog (app Settings) in the header, a filter icon with a
  count beside the search, sort stays visible as a dropdown ("I like B. Sorting should be an easy
  tap").
- **Verdicts are read-only tags, one color each** ("Yes").
- **Pokémon detail:** the fixed Exclude button becomes a switch at the end of the page; the moves
  card badges get their own column ("Both look good"; Travis flagged the Upper Hand wrap).
- **Counters against one opponent shows the full shield grid** from Log a Battle ("I like the full
  shield matchup. That is what people are coming for that pvpoke doesn't provide"), not a
  percentage and not the equal-shields row alone.
- **Counters rows stop being links;** each row carries labeled links that say where they go
  ("That works").
- **Out of this piece:** the app-wide 12px to 13px small-text pass (it would move signed pages) and
  the shuffle icon on Find best order (Build). Both stay open follow-ups.

## App-wide rules applied here

These come from the foundation spec and are restated only where this piece changes code:

- **Back returns to where you came from** with `back(fallback)`; its label is "Back", as on
  Analysis and Log a Battle. No screen hard-codes a destination in its back control.
- **Jumps get labels** and are never the back control.
- **One settings cog per screen** (`IconButton` with the cog glyph, opening the Settings sheet); list
  filters use `FilterButton iconOnly`.
- **Tags are read, chips are tapped.** A verdict, a rank or "Same wins as best IVs" is a `Tag`.
- **Every `window.confirm` becomes `ConfirmSheet`,** tone `danger` only when the action deletes
  data.
- **At most one line of text before the first result.**

## Settings

The sheet (`apps/web/src/screens/Sheet.tsx`) moves onto the ui `Sheet` with pages. Done, Escape and
the overlay close it from any depth. Each pushed page renders a component that reads the store
itself, so a switch flipped on a pushed page shows its new state at once (the ui `Sheet` keeps a
pushed page's `render` function as pushed, so the page must not close over values from the moment
it was pushed).

**Hub (root page, "Settings"):**

- **Import card, first:** "Import a new CSV", one line "Update or replace the collection on this
  phone." Before any import: "Import a CSV". It closes the sheet and opens Import.
- **Four rows,** each an icon, a title and a live summary, pushing its page:
  - Your data: "147 Pokémon · 26 battles" (specimen count; battles logged, all leagues). No
    collection: "No collection yet · 26 battles".
  - Community: "Sharing on" or "Sharing off".
  - Appearance: "System theme · pictures on" (the theme word and the pictures state).
  - About: "PvPoke data Sep 10 · build 874d675".
- **"Forget my collection and log"** (only with a collection): red text button, through
  `ConfirmSheet` tone `danger`: title "Forget your collection and log?", line "Your collection,
  battle log and settings on this phone are deleted. This cannot be undone.", confirm "Forget",
  cancel "Keep them".
- **Foot line:** "Your collection stays on this phone."
- **Gone from Settings:** the league switcher (every screen has it), team filters and excluded
  Pokémon (the Teams Filters sheet has them), the rank band.

**Your data:**

- **Collection:** "147 Pokémon · 90 kinds", "Last import Sep 20, 2026". No collection: "No
  collection yet" and the Import card.
- **Your log:** "Start fresh in Great League" (the current league's title), one line "Battles
  before now move to Earlier seasons. Nothing is deleted.", through `ConfirmSheet` tone `default`:
  title "Start fresh in Great League?", the same line, confirm "Start fresh", cancel "Keep this
  season". Export log and Import log as today (share sheet, then download), the result on one
  line under them. One line: "Files stay under your control."

**Community:**

- **Share your battles** switch, line "Anonymous battle records build the community meta."
- A neutral line under it (not red): "Turning this off also deletes what this phone sent."
- Turning it off goes through `ConfirmSheet` tone `danger`: title "Stop sharing?", line "Battles
  this phone sent are deleted from the community meta. Your log on this phone stays.", confirm
  "Stop and delete", cancel "Keep sharing". Turning it on needs no confirm.
- **What's sent?** (`ExpandRow`, closed): sent: league, season, time, your three Pokémon and their
  moves when known, the opponents you saw, win, loss or tanked, a random device id and the app
  version. Never sent: your collection, IVs, names, or the opponents' moves.
- **Open meta.pick3.gg** (link).

**Appearance:** the theme `Seg` (System, Dark, Light); the Pokémon pictures switch, line "Off shows
a colored initial instead" (American spelling).

**About:**

- **Game data:** "PvPoke, Sep 10, 2026 (abc1234)" and "Opponent meta: 48 Pokémon" (the label
  stays).
- **App:** "Build 874d675" and Check for updates (today's `UpdateStatus`).
- **Privacy:** "Your collection stays on this phone." and **What leaves it?** (`ExpandRow`,
  closed): an anonymous tick to the trainer counter when you build teams; anonymous battle records
  unless sharing is off; anonymous error reports unless turned off below; none of it includes your
  Pokémon.
- **Send anonymous error reports** switch, the same layout as every other switch.
- **Diagnostics** with Copy (today's `Diagnostics`, restyled to match).
- **Credits:** "Built on PvPoke (MIT). Not affiliated with Niantic, Nintendo, The Pokémon Company,
  Poke Genie, or PvPoke." and Source. "Poke Genie" keeps its own spelling.
- **The trainer counter,** last.

**The rank band, retired:** the Settings control and `setShareBand` go; `pendingBattles` and the
send path stamp `band: null` on every record from now on, whatever `settings.share.band` holds. The
stored field is left in place and ignored (no settings migration). `workers/counter` is unchanged.
The CLAUDE.md sentence listing what a record carries drops "rank band" (a spec change for Travis to
approve with this review).

## Collection

- **Header:** `Header variant="top"`, "Collection", three `IconButton`s: plus ("Add a Pokémon", to
  Add Pokémon), meta.pick3.gg, Settings. The league switcher under it. The two-line count and the
  "+ Add" pill go.
- **Search row (sticky):** the search input as today, and `FilterButton iconOnly` with the count of
  filters that differ from their defaults. It opens a Filters sheet (ui `Sheet`, "Filters"):
  Group same Pokémon (default on), Show ineligible, Shadows only, Scanned in the last two weeks,
  Top 50 meta. The popover and the "N filters on" hint go.
- **Verdict chips:** Built, Worth it, Wait for IVs, Rescan; multi-select, none means all, as today.
- **One line under the chips:** the count on the left ("147 Pokémon · 90 kinds" grouped, "147
  shown" flat), and "Sort: Verdict ▾" on the right: a compact dropdown (Verdict, IV rank, Meta rank,
  Name) that opens the list of options, not a cycle.
- **Rows:** the verdict is a `Tag`: Built `win`, Worth building `accent`, Wait for better IVs
  `neutral`, Needs rescan `warn`, Not eligible `neutral`. Everything else on a row stays.
- **Remembered:** search, chips, filters, sort, open groups and scroll, as today (`useSticky`,
  `useScrollMemory`).
- **States:** judging uses `Loading`; a verdicts error uses `ErrorState` with today's copy; empty
  after filters uses `Empty` ("Nothing matches. Try another name or clear a filter."); no
  collection keeps `NoCollection`.

**"Built" in the engine:** `VerdictLabel`'s 'Ready to use' becomes 'Built' in
`packages/engine/src/verdicts/worth.ts`; its sentence becomes "Top N% IVs for <league>, already at
level L." plus the meta note as today. Every consumer follows the label (Build's verdict order,
Collection's chips, the verdict tag map, tests). Verdicts are computed, never stored, so no data
migration.

## Pokémon detail (Specimen)

- **Header:** `Header variant="sub"` with back ("Back", `back({ screen: 'collection' })`) and the
  Settings `IconButton`; no title text. The name appears once, as the page's big title.
- **Hero:** sprite, name, types, CP, level, Lucky and Purified, scan age, then the verdict `Tag`
  and "Same wins as best IVs" as today.
- **Facts card:** IVs, IV rank, meta rank, the verdict sentence and the best-IVs line, as today.
- **Moves card (shared `MoveRows`):** each row becomes three columns: kind, the move (name, then
  type and effect tags, wrapping under the name when they do not fit), and the badge (Has it, TM,
  Elite TM) top-aligned in its own column. The card loses the divider line across its top. Team
  Analysis's Pokémon details use the same `MoveRows` and get the same fix.
- **Cost to build:** when the build needs no power-up and no evolution ("Level 18.5 to 18.5" today),
  the section reads "Already at level 18.5." with no zero tiles. Otherwise as today.
- **Teams with this Pokémon:** as today.
- **Use in team recommendations:** a switch in a card at the end of the page, line "Off leaves it
  out of Teams and Build suggestions." It flips `excludedSpecimenIds` exactly as the old button did.
  The fixed bottom bar goes, and nothing sits over the content.
- **Remove from collection** (manual entries only): a red text button under the switch, through
  `ConfirmSheet` tone `danger`: title "Remove this Flamigo?", line "It leaves your collection on
  this phone.", confirm "Remove", cancel "Keep it". After removing, `back({ screen: 'collection'
  })`.
- **Not found:** `Empty` with today's line and the sub header.

## Counters (and Who Beats X)

One screen, `apps/web/src/screens/Counters.tsx`, the same header and rows in both modes. The route
keeps its shape (`#/counters`, `?vs=<id>`, `&l=<league>`).

- **Header:** `Header variant="top"`, "Counters", meta.pick3.gg and Settings `IconButton`s. When the
  page was opened by a jump from another screen (Your Meta's "Who beats it"), it is
  `Header variant="sub"` with "Back" instead, and back returns there. The jump marks the route
  (`from=1` on the hash, a new optional route field); the sub header shows only when that mark is
  present and `canGoBack()` is true. A link from meta.pick3.gg has no in-app history, so it gets the
  top header. The tab bar shows Counters in both cases.
- **League switcher** under the header, as today; a link's league still switches first.
- **Against row:** a picker styled like `Select` (label "Against") showing "The whole meta (48)" or
  one Pokémon's name, and `FilterButton iconOnly` beside it. The picker opens a sheet ("Against")
  that follows the input layout rule: a search input at the top, matching species directly under it
  in the compact token grid, and "The whole meta" as a shortcut last, hidden while searching.
  Choosing replaces the current history entry (`navigate(..., { replace: true })`), keeping `from`,
  so back still leaves Counters.
- **One line under it,** with the sort dropdown on the right:
  - whole meta: the facing sentence as today ("PvPoke weights (11 of 15 battles logged)");
  - one opponent: "PvPoke's movesets; your log doesn't apply".
  - Sort: Best, Under the radar (today's gap sort). Remembered with `useSticky`.
- **Filters sheet:** All, You own, Own or can build (a `Seg`), remembered with `useSticky`. Without a
  collection there is no filter icon; the line under the Against row reads "Import your collection
  to mark the ones you own." with Import as the link.
- **The two description paragraphs and the "Back to the whole meta" link go.**
- **Rows (not links):**
  - Token, name, types; "#1 vs Azumarill · #1 overall" (whole meta: "#1 vs meta · #156 overall";
    "unranked" when so).
  - Role tags (`MetaTags`) without the overall-rank tag, since the line above already has it.
  - "Beats ..." and "Loses to ..." lines as today.
  - The score on the right. Whole meta: "70%" over "of the meta". One opponent: the shield grid
    (below).
  - Labeled links on the last line: "Build a team around it ›" always (sets it as Build's lead, as
    today's row tap does); plus "View yours ›" when you own it, or "View your Rookidee ›" when your
    Rookidee is the specimen that becomes it. Both open the Pokémon detail page, whose back returns
    here with filters and scroll kept.
- **The shield grid (one opponent):** the Log a Battle grid, shared rather than copied: nine cells,
  your shields 0, 1, 2 down the side, theirs across the top, W or L each, filled for a clear result
  and outlined within 100 of 500, the same `CLOSE_MARGIN` rule. Its caption "shields" is a `Term`:
  "Each cell is one battle at PvPoke's movesets and default IVs: your shields down the side,
  theirs across the top. W is a win, L a loss; an outlined cell is close."
- **Loading:** `Loading` with today's stages, plus the grid stage ("Playing every shield pairing on
  this phone"). Rows appear once scored; a row's grid shows empty cells until its nine battles are
  in.
- **Empty:** today's two messages via `Empty`, including "PvPoke does not rank X in <league>, so
  pick3 has no moveset to simulate it with."

**Engine:** `metaCounters` with `vs` keeps choosing and ranking candidates as today (the species
that win at least one equal-shield battle, simulated for the top 300 when the matrix lacks the
opponent), keeps the first 80 (`limit`), and then simulates all nine shield pairings for each of
them against the opponent at PvPoke default IVs and the rankings' movesets, the same inputs as the
matrix. `CounterEntry` gains `grid: number[] | null`: nine battle ratings, row-major, your shields
by theirs; null in whole-meta mode. In vs mode `antiRank` and the order become: cells won out of
nine (rating above 500), then mean rating, then PvPoke overall rank. The work runs in the worker
with progress (`counters-grid`) and posts rows as they complete. Timing: 720 battles took about
0.5 s in Node on a desktop. The result carries the grid time in ms (as `faceoff` does) so it can be
checked on a phone; the rows fill in as batches finish, so the page never waits on all 80. Under the radar still sorts by `gap`.

## States

Every page in this piece captures, in both themes at 390px, at least: loading, empty, error (where
the page has one), no collection, and its open sheets:

- **Settings:** hub with and without a collection; each of the four pages; What's sent? and What
  leaves it? open; each confirm sheet; the Import log result line.
- **Collection:** judging; judged; empty after filters; the Filters sheet; the sort dropdown open;
  grouped and flat.
- **Pokémon detail:** a building Pokémon; a built one (no cost tiles); an evolving one; excluded;
  a manual entry (Remove) and its confirm; not found.
- **Counters:** whole meta; one opponent with grids; a row mid-grid; no collection; unranked
  opponent; the Against sheet searching and idle; the Filters sheet; the sub header from Your Meta.

## Testing

- **Engine:** the Built label and sentence; the nine-cell grid (shape, order, the rating it
  records, row-major your-by-theirs); the vs-mode order (cells won, then mean rating, then overall
  rank); whole-meta mode unchanged (`grid` null).
- **Web:**
  - Settings: each row pushes its page and its summary reflects state; a switch on a pushed page
    updates in place; Forget, Start fresh and sharing-off go through `ConfirmSheet` with the right
    tone and do nothing on cancel; the rank band control is gone and a sent record carries
    `band: null` even with a band stored in settings.
  - Collection: one cog; the filter count; the sort dropdown sets the sort; chips read Built.
  - Pokémon detail: back returns to Counters when opened from Counters and to Collection
    otherwise (fallback); the switch toggles exclusion; Remove confirms.
  - Counters: the Against picker replaces the entry and keeps `from`; back from a jump returns to
    Your Meta; rows are not links and each labeled link goes where it says; filters and sort survive
    a round trip to the detail page; no `window.confirm` anywhere in `apps/web/src`.
- **Audit:** each page joins `AUDIT_ENFORCED` in `apps/web/scripts/screens.mjs` with the states
  above; `npm run web:audit`, `npm run ui:audit`, `npm run check-colors` pass.

## Records and sign-off

One record per page in `docs/design/audits/`: `settings.md`, `collection.md`, `pokemon-detail.md`,
`counters.md`, each in the `teams.md` shape (automated checks, the aesthetics and functionality
checklists, captures), signed by Travis. Round order: Settings is merged and signed before
Collection and the detail page start; those before Counters.

## Cleanup

Removed once nothing uses them: `window.confirm` calls, the Collection list cog and popover, the
`sort-toggle` cycle, `filters-hint`, the `.verdict`/`.v-*` chip styles and `VerdictChip`, the
fixed `bottom-actions` on the detail page, `HeadCog` and `MetaButton` if no screen still uses them,
and the Settings sheet's old markup (`.sheet`, `.grabber`, `.toggle` where replaced).

## Out of scope

- The app-wide 12px to 13px `.meta` pass; the shuffle icon on Find best order.
- Add Pokémon, Import and Report (no design pass yet).
- Folding meta.pick3.gg into the app (piece 5's question); the tab bar stays as is.
- `workers/counter` changes; the band column and its data stay.
