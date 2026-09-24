# Design foundation for pick3.gg and meta.pick3.gg

Date: 2026-09-24. Status: design approved in chat (Travis), spec awaiting review.

Inputs:

- Inventory of 10 pages plus the meta Pokémon pages: `docs/design/inventory/2026-09-22-inventory.md`
- Design intake, every generated design and every decision: `docs/design/inventory/2026-09-23-design-intake.md`
- Shared UI package, which this builds on: `docs/superpowers/specs/2026-09-18-shared-ui-package-design.md`

## Goal

pick3 and meta.pick3.gg should look like one polished product. The inventory found the same
problems on nearly every screen: text walls before the first result, sideways pill rows, three
button styles in one card, two header styles plus a third, a circle button beside a square one,
tags that look like buttons, hard-coded back links, and pink used for three different things.
The landing page redesign set the direction ("the welcoming home-page style, tightened for dense
battle data"), and the design session turned it into ten rules.

This spec is the foundation: the tokens, the shared components, the app-wide rules, and the
audit every page must pass before it is done. Pages are redesigned in later specs, built from
these parts.

## The program

The work is split into five pieces. Each gets its own spec, plan and build, in this order:

1. **Foundation** (this spec): tokens, shared components, rules, the component gallery, the
   audit tooling.
2. **Core flow:** Your Teams, Build Your Team, Team Analysis.
3. **Play:** Your Meta, Log a Battle, and the counter worker's per-battle delete for Undo.
4. **The rest of the app:** Collection, the Pokémon detail page, Counters and Who Beats X,
   the Settings sheet and its sub-pages.
5. **meta.pick3.gg:** Teams, Pokémon, Species.

The per-page decisions already made live in the intake file and are not repeated here. Each
later spec starts from that page's intake entry.

## Decisions this spec rests on

From the design session and Travis, 2026-09-22 to 2026-09-24:

- Collect first, change later. The designs are direction, not pixel specs.
- **Kept as they are:** the sprites (size may change, nothing else), the league switcher with
  its shields and today's outline for the selected league, the bottom tab bar and its icons.
- **One header system on both sites** (option A). This replaces the 2026-09-18 decision that
  the two headers stay visibly different. The sites stay separate apps and deploys; they now
  share header anatomy, button shape and cross-link treatment. meta keeps a small "meta" mark
  beside its title and its own tabs. The theme toggle moves into Settings on both.
- **Measured data is pink text with a mark** (option A). Pink is never a pill or chip
  background. Shown to Travis as a rendered comparison.
- Dark mode is what gets reviewed day to day, but light ships, so every token has a light value
  and every audit checks both themes.
- "Pokémon" with the accent, everywhere, both sites.
- Out of scope for the whole program: folding meta.pick3.gg into the app (the separate-sites
  decision of 2026-09-18 stands), and the first-run Import and Report screens (the landing page
  is already redesigned).

## Section 1: tokens

All tokens live in `packages/ui/tokens.css`. Every token gets a dark value and a light value in
the file's existing three blocks (dark default, `prefers-color-scheme: light`,
`[data-theme='light']`). No color is defined only in one theme.

### Color roles

| Role | Token | Use | Never |
| --- | --- | --- | --- |
| Canvas | `--bg`, `--bg-outside`, `--canvas-atmos` | page ground | |
| Surface | `--surface`, `--surface2`, `--divider` | cards, sheets, rows | |
| Interaction | `--accent`, `--accent-text`, `--accent-tint`, `--accent-tint2`, `--accent-hi`, `--accent-lo` (new, the primary gradient's second stop), `--on-accent` | anything tappable, selection, focus, navigation | decoration |
| Measured | `--measured` (new, from the landing's `--tally`, `#f9598c` dark) | community numbers, your shared-battle count | a pill, chip, border or fill |
| Outcome | `--win`, `--loss`, `--tanked` (new), `--warn`, `--warn-tint` | win, loss, tanked, verdicts, warnings | interaction |
| Danger | `--danger`, `--danger-tint` (new) | actions that destroy data: Forget, sharing off, Remove | anything reversible |

- `--canvas-atmos` is the landing page's atmosphere as a background layer (a gradient only, no
  images), used on top-level screens. Sub-pages and sheets use plain `--bg` and `--surface`.
- The landing page's `--tally` becomes an alias of `--measured`, so the landing keeps its look.
- Start fresh is violet, not red: it moves battles, it deletes nothing.

### Type

Four text levels, plus one label size for tags and eyebrows. Today's sizes are kept, so pages do
not shift before they are redesigned.

| Level | Token | Size | Today's selector |
| --- | --- | --- | --- |
| Page title | `--fs-page` | 24px | `h2` on screens |
| Section title | `--fs-section` | 17px | `h3` |
| Main line | `--fs-body` | 15px | body text |
| Supporting | `--fs-support` | 13px | `.small` (`.meta` stays 12px until its page is redesigned, then moves to 13px) |
| Label | `--fs-label` | 11px | tags, eyebrows |

One page title per screen. Assumptions, counts, timestamps and explanations are supporting text.
Explanations longer than one line move behind a tap (`Term`, an expand row, or a sheet).

### Shape and space

- `--r-control: 12px` for buttons, inputs, selects, chips. `--r-card: 16px` for cards and rows
  that stand alone. `--r-sheet` stays 20px. The existing `--r-sm/md/lg/xl` stay for the pages
  not yet redesigned and are retired page by page.
- `--gutter: 20px` (today's), `--gutter-dense: 16px` for the dense screens: Log a Battle, Team
  Analysis move rows, Build cards.
- `--space: 8px` base; gaps are multiples of it.
- `--tap: 44px` minimum touch target.
- One quiet border and a restrained shadow per card. The Shadow Pokémon halo is the only glow,
  and gets a tap-to-define explanation.

## Section 2: components

All in `packages/ui/src/components`, exported from `packages/ui/src/index.ts`. The package rule
from 2026-09-18 holds: **nothing here imports `@pickthree/engine` or an app store.** Props only,
so pick3 and meta render the same component.

| # | Component | Status | What it is |
| --- | --- | --- | --- |
| 1 | `Button` | new | `variant: 'primary' \| 'secondary' \| 'text' \| 'danger'`. Primary is filled violet; at most one per screen. |
| 2 | `IconButton` | new | One shape (`--r-control`, 44px) for settings, share, the meta cross-link, filters. Requires `label` for screen readers. |
| 3 | `Chip` | exists, resized | A tappable filter pill, 44px tap target. |
| 4 | `Tag` | new | A read-only label at `--fs-label`. `tone: 'neutral' \| 'accent' \| 'win' \| 'loss' \| 'tanked' \| 'warn'`. `TypeChip` stays the type tag. Never has a hover or pressed state. |
| 5 | `LeagueSwitcher` | exists, extended | Adds an optional overflow segment ("...") that opens a sheet listing more leagues and cups. Shields and the selected outline unchanged. |
| 6 | `Select` | exists, extended | A visible label is now required (for example "Window", "Source"). |
| 7 | `FilterButton` | new | "Filters" plus a count of active filters, sliders icon. Opens a `Sheet` the app fills. |
| 8 | `MeasuredValue` | new | A pink number with the bar mark (`value`, `unit`), and a `MeasuredLine` variant: a dot and one sentence. |
| 9 | `ProgressCard` | new | Personal progress (`done`, `goal`, `line`) with an optional `MeasuredLine` for the contribution count, kept visually separate. |
| 10 | `ExpandRow` | new | A row that opens in place. `summary` and `children` slots; `open`, `onToggle`. Used by the Teams list, the meta board and Analysis Pokémon details. |
| 11 | `Term` | exists | Tap to define. |
| 12 | `Header` | new, on `HeaderShell` | `variant: 'top'` (page title, icon buttons) or `'sub'` (back, title, icon buttons). A `mark` slot for meta's site mark. |
| 13 | `Sheet` | new | Grabber, title, Done. Supports a stack of pages: pushing a page shows "< back label"; Done closes the whole sheet from any depth. Focus is trapped while open and returns to the opener on close. |
| 14 | `ConfirmSheet` | new | `title` (the question), `line` (what happens), `confirmLabel`, `cancelLabel`, `tone: 'default' \| 'danger'`. Replaces every `window.confirm` in the app (five today). |
| 15 | `Toast` | new | One line, an optional action (`actionLabel`, `onAction`), auto-dismiss. Replaces `NoticeToast` in apps/web. |
| 16 | `Loading`, `Empty`, `ErrorState` | new | One look each. `Loading` takes today's staged labels (eligibility, candidates, trios, simulate, score, verdicts, counters). |

Components that need engine data stay in their app and are built from these parts: Build's
filled Pokémon card, the Teams hero card, the in-battle card, Collection rows, meta's species
cards.

Existing styles in `packages/ui/base.css` that these replace are kept until every page using
them has moved, then removed in the piece that moves the last one.

## Section 3: app-wide rules

- **Back returns to where you came from**, with that screen's filters and scroll position.
  apps/web already has `back()` (history back, with a fallback) and `useSticky` and
  `useScrollMemory`; screens stop hard-coding a destination in `onBack` and call `back()` with a
  fallback route. meta does the same with its own router.
- **Jumps to another feature get a label** and are not the back control: "Edit team",
  "View in Collection", "Who beats it".
- **One filled primary button per screen.**
- **Chips are tapped, tags are read.** Nothing read-only looks like a button.
- **Pink only for measured data, with its mark.**
- **At most one line of text before the first result.** Everything else behind a tap.
- **The input layout rule stands** (CLAUDE.md): input at the top, results under it, the slots
  those results fill under that, shortcuts last.
- **390px wide, no sideways scroll, both themes.** The iOS fixed-bar rule stands (clip sideways
  overflow on `.app`, never `overflow-x` on `html` or `body`).
- "Pokémon" with the accent in all UI copy. No em dashes anywhere.

## Section 4: the component gallery

A small Vite page at `packages/ui/gallery/` renders every component in every state (default,
pressed, selected, disabled, empty, error, long text, 390px width) in one theme at a time
(`?theme=dark` or `?theme=light`); the audit captures both.

- `npm -w @pickthree/ui run gallery` serves it for development.
- It is never part of either app's build, so it changes nothing in production and nothing in the
  CSP.
- It is the first thing audited, and the place to check a component change before checking
  pages.

## Section 5: the page audit

No page is done until it passes all three parts and Travis signs off.

### Automated checks

Audit mode is added to the existing capture scripts (`apps/web/scripts/screens.mjs`,
`apps/meta/scripts/screens.mjs`) and a new one for the gallery, run as `npm run web:audit`,
`npm run meta:audit` and `npm run ui:audit`. For each screen, in dark and light, at 390px:

- a screenshot of each state the page defines (at least loading, empty, error, no collection
  where it applies, and populated)
- no console errors
- no horizontal overflow (`document.documentElement.scrollWidth` greater than the viewport fails)
- every interactive element at least 44 by 44px, with inline text links exempt
- text contrast at least 4.5:1, or 3:1 for large text, using `axe-core`'s color-contrast rule
  (a new devDependency, exact version pinned, injected by puppeteer; never shipped in either app)
- no em dash and no unaccented "Pokemon" in visible text

Plus static checks in vitest:

- no color literal (hex, `rgb()`, `hsl()`) in `apps/web/src/app.css`, `apps/meta/src/app.css`
  or `packages/ui/base.css`. they are listed in `scripts/color-literal-baseline.json`, which may
  only shrink, and each piece removes the ones on its pages.
- `npm run lint`, `npm run typecheck`, `npm test` pass.

### Aesthetics checklist

- Colors come from tokens, used in their roles.
- At most the four text levels, one page title.
- One filled primary.
- Chips and tags used correctly.
- The right header variant.
- Rows align (sprite rows share a baseline); gutters and the 8px base hold.
- Sprites unchanged.
- At most one line of text before the first result.
- Light as readable as dark.

### Functionality checklist

- Every "must keep" in that page's inventory entry is present, ticked item by item.
- Every control does what its label says.
- Back returns to the origin with filters and scroll kept.
- Input screens follow the input layout rule.
- Icon buttons have accessible names; keyboard focus is visible.
- Product rules hold: every result carries its assumptions, the collection never leaves the
  device, `connect-src` is unchanged, sharing copy is accurate.
- The page's tests cover its new behavior.

### The record

Each audited page gets `docs/design/audits/<page>.md` from a template
(`docs/design/audits/_template.md`): the screenshots, both checklists, what failed and how it
was fixed, and Travis's sign-off line. Screenshots for the record are copied into
`docs/design/audits/img/` (the capture folders are gitignored).

## Testing for this piece

- Component tests in `packages/ui` (vitest, Testing Library), one file per new component:
  variants render, `Tag` has no interactive role, `IconButton` requires a label, `Sheet` pushes
  and pops pages and Done closes from depth, `ConfirmSheet` calls the right handler and uses the
  danger tone only when asked, `Toast` fires its action and dismisses, `ExpandRow` toggles and
  exposes `aria-expanded`.
- A token test: every token in the dark block has a light value.
- The static color-literal check and its baseline.
- `ui:audit` over the gallery passes.

## Done for piece 1

- Tokens, components, gallery, audit tooling and the audit template are merged.
- `ui:audit` passes on the gallery in both themes; `docs/design/audits/gallery.md` records it.
- Travis signs off on the gallery screenshots.
- No page is redesigned in this piece. Where an existing component changes (`Chip` size; `TypeChip`
  stays the type tag, `Tag` covers the other read-only labels), `web:screens` and `meta:screens` still pass and the change is visible in
  the gallery record.

## Coordination with source-weighted recommendations

`2026-09-24-source-weighted-recommendations-design.md` runs in parallel in its own worktree. It
owns the engine, the data plumbing and where each setting lives; this program owns the look.
Settled with Travis, 2026-09-24:

1. **Filters live on the screen.** Team filters and Team style go in a Filters sheet opened from
   the Teams screen, never the Settings sheet.
2. **"Use your log" is retired** into that spec's Source picker. The Settings Your data page
   drops the toggle and keeps Start fresh, Export log and Import log.
3. **No Team style chip.** The pill row goes; Team style lives in the Filters sheet.

Sequencing: this piece (foundation) runs alongside it. Pieces 2 (Teams) and 4 (Settings) start
after it lands and build on its code. Shared touch points: `Select` (label now required), `Chip`
(44px), `apps/web/scripts/screens.mjs` and CLAUDE.md.

## Carried to later pieces

Open decisions, to settle in the spec for the piece that needs them:

- **Teams sort order** (piece 2): the headline score is now battle strength, but the list is
  sorted by `score.total`, which includes cost. Sort by battle strength, or keep and label it.
- **Expandable team rows on Teams** (piece 2): an option, not a decision.
- **"Built" in place of "Ready to use"** (piece 4, leaning Built); the difficulty reason on the
  team card (piece 2).
- **Your Meta record format** (piece 3): whether the record shows tanked as a third number.
- **The rank band** (piece 4): likely retired.
