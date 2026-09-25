# Core flow redesign: Your Teams, Build Your Team, Team Analysis

Date: 2026-09-25. Status: design approved in chat (Travis), spec awaiting review.

Piece 2 of the design program (piece 1: `2026-09-24-design-foundation-design.md`, done and signed
off). Inputs:

- Inventory pages 1 to 3: `docs/design/inventory/2026-09-22-inventory.md`
- Keep and take decisions for these pages: `docs/design/inventory/2026-09-23-design-intake.md`
  ("Page 1", "Page 2", "Page 3" entries)
- The source-weighted recommendations work already on main
  (`2026-09-24-source-weighted-recommendations-design.md`): the Source and Window selects on
  Teams, the Teams Filters sheet (`apps/web/src/screens/Filters.tsx`), `openFilters`.

## Goal

Rebuild the three screens of the core flow on the foundation's tokens and components, keeping
what players value (today's team card, Build's cards and search, every fact on Team Analysis) and
taking the structure the designs proposed (compact lists, summary first, detail on tap, one main
action). Each page passes the audit and Travis signs its record before the next page starts.

## Decisions (Travis, 2026-09-23 to 2026-09-25)

- **Keep today's content, take the designs' structure.** Pixel parity with the generated designs
  is not a goal.
- **Teams list sorted by battle strength** (`score.battle`), not `score.total`. "Best first" means
  strongest. Cost stays visible on every team, and the Budget filter still hides expensive builds.
- **Every team is an expandable row, the first one open** (option B).
- **Headline score on Analysis is battle strength** (coverage, consistency, safety), not the total
  that includes cost and accessibility.
- **Source and Window stay visible selects**, labeled, not hidden in Filters. Team filters and
  Team style live in the Teams Filters sheet (already built).
- **Build keeps today's cards and search.** Find best order moves to the top; a "Choosing <slot>"
  line; total team cost; suggestions run on their own, with + Add, and never fill slots on their
  own.
- **Move picker: no automatic bumping.** With two charged moves picked, the player unticks one
  before picking another. The label reads "Pick one or two".
- **Analysis: the approved split.** The design's structure (score card, jump buttons, battle plan,
  matchups to remember, expandable Pokémon rows) with today's details inside it. The battle plan
  uses only what the engine already writes.
- **Back returns to where you came from.** "Edit team" is a labeled jump, not the back control.

## Order of work

Teams, then Build, then Analysis. Each page ships behind its own audit record and Travis's
sign-off before the next begins. The engine sort change lands with Teams.

## Shared team components (apps/web)

New in `apps/web/src/components/team/`, built from `@pickthree/ui` parts. They need engine types,
so they stay in the app.

| Component | Used by | What it is |
| --- | --- | --- |
| `TeamRowSummary` | Teams | The collapsed row: three overlapping sprites, the three names, "fit · difficulty · Stardust". Sits inside `ExpandRow`'s summary slot, so it holds no buttons or links. |
| `TeamCardBody` | Teams, Analysis strip | Today's `TeamCard` content: fit tag, structure as a `Term`, difficulty and its reason, three sprites with names and roles, the role legend (first team only), the specific explanation, the full cost line. No click handler of its own. |
| `ScoreCard` | Analysis | The headline battle score, fit tag, the coverage line, custom-team notes, "Run it in this order", Take to battle. |
| `BattlePlan` | Analysis | Three steps (lead, switch, closer) from engine data only (see Analysis). |

Today's `TeamCard` in `screens/Teams.tsx` is replaced by `TeamCardBody` inside an `ExpandRow`.

## Your Teams

- **Header:** `Header variant="top"`, title "Your Teams", actions: the meta cross-link and
  settings as `IconButton`s. The "N Pokémon" count is removed (it is on Collection).
- **Controls, in order:** the league switcher (done in piece 1's follow-up); then one row: the
  Source `Select` filling the width, and the filters as an icon button with the active-filter
  count (`filterCount`) as a badge, opening the existing Filters sheet. "No community data for
  this league" stays when it applies. (Travis, 2026-09-25, from rendered options: "I like showing
  only the source and the filter icon with the number. That looks the cleanest." This replaces
  the earlier Source and Window selects side by side with a labeled `FilterButton` under them.)
- **Source options:** PvPoke, Your meta, GBL, Tournaments, All. The option that weights by the
  player's own battle log is labeled "Your meta" ("Your meta: N of 15" until the log reaches 15
  battles). (Travis, 2026-09-25: "Instead of your log. I think we say your meta".)
- **Window** moves into the Filters sheet, at its top. It stays visible, disabled with a one-line
  note ("Applies when Source is GBL, Tournaments or All") when the source is PvPoke or Your meta.
  A non-default window counts in `filterCount` only while a community source is picked, so a
  hidden choice always shows on the badge.
- **No summary line** under the controls: the Source value says what the list is weighted by,
  "(offline)" marks a community fallback, and the progress card counts the log's battles.
- **Build your own team** stays as a row near the top.
- **The team list:** sorted by battle strength. Every team is an `ExpandRow` with
  `TeamRowSummary` as its summary; the first row starts open. The open body is `TeamCardBody`
  followed by two text actions: **View analysis** (Team Analysis) and **Edit team** (load into
  Build, today's `editInBuild`). Open state is per session (not persisted).
- **Progress card:** after the first team, `ProgressCard` titled "Make these teams personal",
  `done` = counted battles this season, `goal` = 15, line "Log N more battles to weight teams by
  what you actually face.", contribution line "Anonymous logs also improve the live meta." only
  when battle sharing is on. Shown only while the log has fewer than 15 counted battles.
- **Footer:** today's counts, "N combinations scored · M simulated with your exact Pokémon".
- **States:** shared `Loading` (today's staged labels), `ErrorState`, `Empty` ("No team fits
  these filters. Loosen one to see recommendations again." with a `FilterButton` action), and
  today's `NoCollection` choice cards restyled with `Button`s.

## Build Your Team

Stays as today: the three stacked cards with the type-colored fade, the search and its Suggested
grid (recent opponents plus top meta, "yours" tags), per-team move edits, drag to reorder, the
league switcher, "Not yours; top-10% IVs assumed".

Changes:

- **Header:** `Header variant="sub"`, title "Build Your Team", back returns to the origin (Teams,
  Team Analysis, Counters, Your Meta, a shared link) with a fallback to Teams.
- **"Your lineup"** section title with **Find best order** as a text action on its right,
  replacing today's half-width button and its paragraph; the one-line hint "Tap a card to change
  its moves" sits under the title. After a run: "Ordered by pick3. Drag a card to change it."
- **"Choosing <slot>"** above the search while a slot is open, with the role's job in one line,
  shortened from the app's own `GLOSSARY` definitions (`apps/web/src/components.tsx`): Lead
  "Opens the battle and usually decides the first shield exchange", Safe Switch "Comes in when
  the lead matchup goes badly", Closer "Finishes the battle after shields are gone".
- **Suggestions run on their own.** With one or two slots filled, "Best with your first two"
  lists the offered teammates below the cards: sprite, name, "yours" tag, the one-line reason,
  and **+ Add** (the whole row is the button, the + its visible cue). Adding fills the first empty
  slot; "Choosing" moves to the next empty one. The run is automatic on pick changes (matrix only,
  no simulation); its community board read keeps the sharing-switch gate and its silent failure;
  and it **never writes picks
  on its own**: today's `suggestTeammates` auto-fill of the first offer is removed. The Suggest
  teammates button is removed. The list hides once all three slots are filled.
- **Total team cost** under the cards when all three are in: Stardust, Candy, XL Candy, Elite TM.
- **Analyze this team** is the page's one primary `Button`.
- **The footer paragraph is removed**; its content lives in the hints above and on the cards.
- **Move picker sheet** (`components/MovePicker.tsx`, opened in a `Sheet`): the recommended set at
  the top; a "Changed" tag (neutral tone, never pink) on moves that differ from it; "How move
  counts work" as an `ExpandRow` or `Term`; Reset to recommended. Charged moves: "Pick one or
  two"; with two picked the other charged rows are disabled with the hint "Untick one to pick
  another"; the last charged move cannot be unticked. `toggleCharged` no longer bumps.
- "Pokémon" with the accent in the search placeholder and empty slots.

## Team Analysis

- **Header:** `Header variant="sub"`, title "Team Analysis", back to the origin (Teams, Build,
  a shared link), actions: Share and settings `IconButton`s. **Edit team** is a labeled text action
  under the team strip (today's `editInBuild`).
- **Team strip:** three sprites with roles; tapping one scrolls to and opens that Pokémon's
  details row.
- **ScoreCard:** the big number is `score.battle` (rounded), with the fit tag and the coverage
  line (`fitWhy`: "An answer to N of M meta Pokémon"). For a custom team, today's notes: how it
  compares with the best recommended team (by battle strength), assumed IVs, chosen moves,
  PvPoke-unranked picks, orders tried. "Run it in this order". **Take to battle** is the page's
  one primary `Button`, in the same place for recommended and custom teams; replacing a running
  set asks through `ConfirmSheet` (default tone), not `window.confirm`.
- **Jump buttons:** Battle plan, Matchups, Pokémon, Details (scroll to the section).
- **Battle plan,** engine data only, three steps:
  - Lead: `explanation.roleWhy.lead`, plus the lead's `slotDetail[0].formNote` when present.
  - Switch: up to the top two `explanation.switchPlan` lines.
  - Closer: `explanation.roleWhy.closer`, plus `slotDetail[2].keepShield.line` when present.
  No text the engine does not produce.
- **Matchups to remember:** the first `keyWins` entry and the first `keyThreats` entry side by
  side; "Show all" expands to every key win and threat and the full When to switch list (up to
  eight, today's copy).
- **Why this team:** `explanation.why`; Team structure (today's three "beats N of M" tiles, or the
  ABB lead and back-line block); the score breakdown (coverage, consistency, safety, cost,
  accessibility) with a line that the headline is battle strength.
- **Pokémon details:** one `ExpandRow` per Pokémon, the first open. Contents are today's card:
  order and role, types as `TypeChip`s, rank tags, the role's job, form note, moves with type
  chips, move counts and extra-damage reads, TM and Elite TM tags; the move-count explanation
  ("7-6-6") beside the first move count; shield and safe types as `TypeChip`s ("+N more");
  keep-shield advice; your IVs, level, IV rank, Shadow and Lucky `Tag`s; the cost to build.
- **Alternatives you own:** today's rows.
- **Assumptions and matchup grid:** collapsed, unchanged.
- **States:** shared `Loading`; the not-found states use `Empty` with a `Button` back.
- "Pokémon" with the accent.

## Engine

- `packages/engine/src/recommend.ts`: sort recommended teams by `score.battle` descending, ties
  broken by `score.total` descending. Everything reading "the best team" follows: `teams[0]`
  (Analysis's comparison line), the order of a specimen's "Teams with this Pokémon", the first
  open row on Teams.
- Tests: update any engine test that pins the old order; add one where a cheaper, lower-battle
  team no longer outranks a higher-battle team.

## Navigation

- Back uses the app's `back()` (history back with a per-screen fallback) instead of a hard-coded
  destination on Build and Team Analysis; filters and scroll come back through the existing
  `useSticky` and `useScrollMemory`.
- Labeled jumps: "Edit team" (Analysis and Teams to Build), "View analysis" (Teams to Analysis).

## Testing

- Component tests for `TeamRowSummary`, `TeamCardBody`, `ScoreCard` (battle score, custom notes),
  `BattlePlan` (renders only engine strings, omits absent form note and keep-shield).
- Screen tests: Teams (sort by battle, first row open, rows toggle, View analysis and Edit team
  targets, progress card only under 15, empty state action); Build (Find best order at top,
  Choosing line per role, suggestions appear without filling slots, + Add fills the first empty
  slot, total cost, back to origin); Team Analysis (score is `score.battle`, Take to battle uses
  `ConfirmSheet`, jump buttons, battle plan content, details rows); MovePicker (no bumping, hint,
  last charged move locked).
- `web:screens` captures each page's states in both themes: loading, empty, error, no collection,
  populated, a row expanded, a cup current, a Build suggestion, the move sheet, a custom and a
  recommended Analysis. As each page passes, its screens join `AUDIT_ENFORCED`.

## Done for piece 2

For each page, in order: the tests above pass; `npm run web:audit` is clean for its enforced
screens in both themes; `docs/design/audits/<teams|build|analysis>.md` records screenshots, both
checklists, findings and fixes; Travis ticks its sign-off. The piece is done when all three are
signed.

## Out of scope

Your Meta and Log a Battle (piece 3, including Undo); Collection, Counters and the Settings
sub-pages (piece 4); meta.pick3.gg (piece 5); the boot race between `loaded` and `boot-ready` in
`state/store.tsx` (a separate follow-up); CI running `ui:audit`.
