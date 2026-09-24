# Audit: component gallery

Piece: 1. Inventory entry: none: the gallery is the foundation's own page.
Intake entry: none: the gallery is the foundation's own page.

## Screenshots

Dark and light at 390px, every foundation component in every state, one page per theme.

| State | Dark | Light |
| --- | --- | --- |
| gallery | ![](img/gallery-dark.webp) | ![](img/gallery-light.webp) |

## Automated checks

- [x] `npm run ui:audit` clean for the gallery, 2026-09-24: `gallery audit: clean in dark and
      light` (0 findings, exit 0)
- [x] no console errors (the gallery's own favicon 404 was fixed in Task 12; `ui:audit` fails on
      any console error and passed)
- [x] `npm run lint`, `npm run typecheck`, `npm test`, `npm run check-colors`, `npm run
      check-tokens` all clean, 2026-09-24

## Aesthetics

- [x] colors from tokens, in their roles (violet interaction, pink measured with its mark,
      outcome colors, red only for destroying data): the gallery's own sections (Button, Chip,
      Tag, TypeChip, Toast, ConfirmSheet, Header, Sheet, etc.) draw every color from
      `packages/ui/tokens.css`; `check-colors` enforces no literal outside it
- [x] at most four text levels, one page title: the gallery page has one `<h1>` and per-section
      `<h2>` labels at a lower level; each example card carries its own label, not a competing
      title
- [x] one filled primary button: `Button` section shows exactly one filled `variant="primary"`
      example among secondary, ghost and danger variants
- [x] chips tapped, tags read: `Chip` section demonstrates the pressable chip (selected/
      unselected/disabled), `Tag`/`TypeChip` sections demonstrate the read-only label, kept
      visually distinct
- [x] the right header variant: `Header` section shows both variants (top-level and `sub`, with
      its back control) side by side
- [x] rows align; gutters and the 8px base hold: gallery sections use the shared `base.css`
      spacing scale, checked visually against both screenshots
- [x] sprites unchanged: the gallery does not render Pokémon sprites (props-only components, no
      game data), so nothing to regress here
- [x] at most one line of text before the first result: the gallery page opens directly on the
      first component section, no preamble copy
- [x] light as readable as dark: this is what `ui:audit`'s per-theme `color-contrast` pass
      checks; clean in both themes as of the 2026-09-24 run

## Functionality

- [x] every component in every state is present: Button (primary/secondary/ghost/danger,
      default/pressed/disabled), Chip (unselected/selected/disabled), Tag (every `tone`),
      TypeChip (every type), Header (both variants), Sheet, ConfirmSheet, Toast (with and
      without its once-only action), loading/empty/error states, at 390px, in both themes
- [x] every control does what its label says: exercised through the `ui` vitest project
      (component behavior tests) plus the visual pass in both screenshots
- [x] tests cover each component: `npx vitest run --project ui` covers every component shown in
      the gallery (11 files, 49 tests as of the last full run)
- back returns to the origin, input layout rule, icon buttons named, product rules: not
  applicable, the gallery is a props-only showcase with no navigation, inputs, or app data

## Findings and fixes

| Finding | Fix | Commit |
| --- | --- | --- |
| Gallery's own favicon request 404'd, failing the audit's console-error check | Added `packages/ui/gallery/favicon.svg` and a `<link rel="icon">` in `packages/ui/gallery/index.html` | f3cac98 |
| `.back` rendered as a plain `<button>` with no CSS reset, so Chrome's native dark-mode button fill painted behind the accent text (1.65:1 contrast) | Added `border: 0; background: transparent; font: inherit; cursor: pointer;` to `.back` in `packages/ui/base.css` | f3cac98 |
| `.back` text used `--accent`, short of 4.5:1 on `--bg` in light (4.09:1) | Swapped `.back`'s color to `--accent-text` (6.23:1 in light) | f3cac98 |
| `.league-switcher button` idle segments used `--faint`, short of 4.5:1 in both themes (4.08:1 dark, 3.96:1 light) | Swapped idle segment color to `--muted` (6.08:1 dark, 6.02:1 light); updated the stale comment in `apps/meta/src/app.css` | f3cac98 |
| `.ui-btn-danger` background tint gave 4.18:1 (dark) / 4.28:1 (light), short of 4.5:1 | Reduced `--danger-tint` alpha (dark 0.16 to 0.08, light 0.12 to 0.04) in `packages/ui/tokens.css` | f3cac98 |
| `.tchip` type-chip fill failed 4.5:1 for 8 of 18 type colors in light mode | Introduced a `--tchip-fill` token (16% dark, 4% light) so `.tchip`'s background reads `var(--tchip-fill)`, fixing light without changing dark's already-passing contrast | 4c18df2 |
| `.ui-tag-win` / `.ui-tag-loss` fill gave 3.78:1 / 3.84:1 in light against an unpredictable ground | Anchored the tint to `--surface` at a fixed 5% instead of `transparent` at 16% (light win 4.59:1, loss 4.75:1) | f3cac98 |

## Visible changes in the live apps

These are the changes from Piece 1 (Foundation) that are now visible in `apps/web` and
`apps/meta`, beyond the gallery and its tooling, for sign-off:

- Sub-page back links move from `--accent` to `--accent-text` in both apps (paler in dark).
- League switcher idle labels move from `--faint` to `--muted`.
- Type chips get a lighter fill in the light theme only (dark unchanged).
- The danger button and win/loss tags get lighter fill changes.
- Chips and league segments grow to 44px.
- Meta's Window and Source selects now print their labels.

## Sign-off

- [ ] Travis, 2026-09-24
