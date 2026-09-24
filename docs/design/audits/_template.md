# Audit: <page>

Piece: <n>. Inventory entry: `docs/design/inventory/2026-09-22-inventory.md`, page <n>.
Intake entry: `docs/design/inventory/2026-09-23-design-intake.md`, <heading>.

## Screenshots

Dark and light at 390px, one pair per state.

| State | Dark | Light |
| --- | --- | --- |
| <state> | ![](img/<page>-<state>-dark.webp) | ![](img/<page>-<state>-light.webp) |

## Automated checks

- [ ] `npm run <web|meta>:audit` clean for this page's screens (listed in `AUDIT_ENFORCED`)
- [ ] no console errors
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run check-colors`, `npm run check-tokens`

## Aesthetics

- [ ] colors from tokens, in their roles (violet interaction, pink measured with its mark,
      outcome colors, red only for destroying data)
- [ ] at most four text levels, one page title
- [ ] one filled primary button
- [ ] chips tapped, tags read
- [ ] the right header variant
- [ ] rows align; gutters and the 8px base hold
- [ ] sprites unchanged
- [ ] at most one line of text before the first result
- [ ] light as readable as dark

## Functionality

- [ ] every "must keep" from the inventory entry, item by item: <list>
- [ ] every control does what its label says
- [ ] back returns to the origin with filters and scroll
- [ ] input layout rule (input screens only)
- [ ] icon buttons named; focus visible
- [ ] product rules: assumptions shown, collection stays on the device, `connect-src` unchanged,
      sharing copy accurate
- [ ] tests cover the new behavior

## Findings and fixes

| Finding | Fix | Commit |
| --- | --- | --- |

## Sign-off

- [ ] Travis, <date>
