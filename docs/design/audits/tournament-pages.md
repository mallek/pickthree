# Audit: Tournament pages (Tournaments list and event page)

Piece: Meta tab follow-up (branch `tournament-pages`). Inventory entry: none, a new page set.
Intake entry: none.

The Meta tab's Tournaments row opens `#/meta/events`, the recent official events with each
champion's six. A card opens `#/meta/events/<id>`: the dates and battle count, a Watch row per
broadcast day, then every player seen on stream by finish. One player opens at a time
(`?p=<screen name>`): their six, the threes to build, and every game with its own Watch link.

The captures read a synthetic event (`fixtures/tournament-sample.json`, invented screen names)
through a stubbed `/api/v1/events`. `screens.mjs` shifts the event's dates so it ended four days
before each run, so the captures do not drift with the clock (the list shows only events that
ended within 55 days). `HOLLOWPINE` has no RK9 team list on purpose
(`fixtures/make-tournament.ts`), for the no-roster state.

## Screenshots

Dark and light at 390px, one pair per state, from the `npm run web:audit` run of 2026-10-19,
converted to WebP (600px wide, quality 72).

| State | Dark | Light |
| --- | --- | --- |
| `tournaments`: the list, one card with the champion and their six | ![](img/tournaments-dark.webp) | ![](img/tournaments-light.webp) |
| `event`: dates, two Watch rows (day 3 has no VOD), the players by finish, all shut | ![](img/event-dark.webp) | ![](img/event-light.webp) |
| `event-player-open`: ARCWARDEN open (`?p=`): their six, the threes to build, movesets from the team list | ![](img/event-player-open-dark.webp) | ![](img/event-player-open-light.webp) |
| `event-player-no-roster`: HOLLOWPINE open: "No team list yet", picks game by game with Watch links | ![](img/event-player-no-roster-dark.webp) | ![](img/event-player-no-roster-light.webp) |

## Automated checks

- [x] `npm run web:audit` clean for this page's screens (`tournaments`, `event`,
      `event-player-open`, `event-player-no-roster`, all added to `AUDIT_ENFORCED`): exit 0, no
      finding on any of the four in either theme. The first run found 36x17 tap targets on the
      per-game "Watch" links; fixed in `.game-watch` (`apps/web/src/app.css`, a 44px target that
      takes no more row height) and re-run clean.
- [x] no console errors: `npm run web:screens` finished with no browser errors.
- [x] `npm run lint`, `npm run typecheck`, `npm run check-colors`, `npm run check-tokens` clean.
      `npx vitest run --project @pickthree/counter --project engine` after the fixture change: 92
      files, 833 passed, 1 skipped.

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

- [ ] every control does what its label says (Watch rows and per-game Watch open the right VOD at
      the right time; Build these teams opens Build)
- [ ] back returns to the origin with the open player and scroll
- [ ] no Watch links on an event older than 55 days, none for a day with no VOD
- [ ] icon buttons named; focus visible
- [ ] product rules: collection stays on the device, `connect-src` unchanged, no real tournament
      data
- [ ] tests cover the new behavior

## Findings and fixes

| Finding | Fix | Commit |
| --- | --- | --- |
| Per-game Watch links were 36x17 tap targets | `.game-watch` 44px target, negative block margin | Task 8 commit |

## Sign-off

- [ ] Travis, <date>
