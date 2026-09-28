# meta.pick3.gg: Top teams, Pokémon, Species, About

Date: 2026-09-28. Status: design approved in chat (Travis), spec awaiting review.

Piece 5 of the design program. Pieces 1 to 4 are signed; their specs are
`2026-09-24-design-foundation-design.md`, `2026-09-25-design-core-flow-design.md`,
`2026-09-26-design-play-design.md` and `2026-09-26-design-rest-of-app-design.md`. Inputs:

- Inventory: `docs/design/inventory/2026-09-22-inventory.md`, pages 10 (meta Teams) and 11
  (Pokémon and Species), and its "Architecture question".
- Renders approved in chat on 2026-09-28 (DOM surgery on the live site): Top teams and Pokémon
  with pick3's header and one source line, and the Species page walked card by card.

## Goal

Make meta.pick3.gg read as pick3: the same header, tokens, components and rules, while it stays a
public site at its own address. Lead each list with what players actually face and keep the
blend's weights one tap away, not three paragraphs above the first row. Fix the Species moves
share, which divides by the wrong number. Each page passes `meta:audit` and Travis signs its
record.

## Decisions (Travis, 2026-09-28)

- **Keep the site separate** ("Let's make the pass as it is without folding it in. We can always
  do it later if needed"). No route, worker or data changes beyond what this spec names.
- **Top teams and Pokémon direction** from the renders ("Yes"): pick3's top header, one source
  line, clearer rows, spelled-out names, the measured share leading on Pokémon.
- **Species** as proposed ("Yes"): one name, bigger hero, weekly chart only with enough weeks, the
  rank card gone, the moves share fixed, "Build a team" carrying the Pokémon into pick3.
- **The rest** ("Looks good"): the expanded Teams row, the tab names, About holding the theme, the
  shared cross-link button, one spec with one plan.

## Rules that apply on every page

From the foundation spec, restated where this piece changes code:

- **Blend honesty is unchanged.** Measured numbers are pink with their mark (`--measured`, text
  and a dot, never a pill). Projections say "Projected" and are never shown as a measured result.
  Small numbers are never hidden; the confidence tag says how far to trust them. The 300, 5, 100
  and 2 half-say constants stay in `@pickthree/engine/meta`.
- **Tags are read, chips are tapped.** Core, Team, Projected, a confidence level and "PvPoke's
  set" are `Tag`s. Multi-team only is a `Chip`.
- **At most one line of text before the first result.** Explanations sit behind a `Term`.
- **Names are spelled out** everywhere a species shows: "Shadow Sableye", "Galarian Corsola", never
  `-S` or `-G`. The name comes from the static data's display name. The site's short suffix form
  is removed, not kept as a fallback.
- **"Pokémon" with the accent** in every piece of UI copy on the site (tab, titles, lines).
- **Loading, error and empty** use the ui `Loading`, `ErrorState` (with "Try again", which
  refetches) and `Empty`.
- **No new color literals;** `npm run check-colors` passes on its shrink-only baseline.

## Header and navigation (all pages)

- **Top header on the three tab pages:** `Header variant="top"` from `packages/ui`, with the page
  title ("Top teams", "Pokémon", "About"), a small `Tag tone="accent"` reading "meta" beside it, and
  one `IconButton` back to pick3 (`aria-label` "Open pick3", the pick3 mark, `href` https://pick3.gg).
  The `meta.pick3.gg` wordmark row, `SitePill` and the header's theme button go.
- **Species header:** `Header variant="sub"` with "Back" and no title. Back uses history when the
  visitor arrived from this site (a `history.state` mark written by `go()`); a visitor who landed
  on the Species page from outside goes to the Pokémon list for its league instead. The same pick3
  `IconButton` sits on the right.
- **The cross-link is one button on both sites.** pick3's meta.pick3.gg `IconButton` and meta's
  pick3 `IconButton` are the same component and size; each carries the other site's mark.
- **Under the header,** as today: the league switcher, then the Window and Source selects (Top
  teams and Pokémon only). They stay sticky as they are now.
- **Tabs:** "Top teams", "Pokémon", "About", same icons. "Top teams" keeps pick3's "Teams" and
  meta's list from sharing a name. Species counts toward Pokémon.

## Top teams (`/<league>`)

- **One line before the list:** "PvPoke 37% · Tournaments 37% · GBL 26% · How it is ranked". The
  percentages are the blend's own weights for the chosen source and window, from the same numbers
  the header text uses today. "How it is ranked" is a `Term` whose body carries what the removed
  paragraphs said: the counts ("From 104 shared battles by 16 devices and 161 tournament battles
  from 2 events"), the matchup score explainer, and the coverage line. With no shared battles, the
  line reads "PvPoke 100% · No shared battles yet · How it is ranked". Under a single source, only
  that source is named.
- **Controls:** "Multi-team only" `Chip` and "Sort: Ranked ▾" `InlineSelect` (the options in
  `SORTS`) on one row. Sort opens a list; it no longer cycles.
- **Collapsed row:** sprites, the spelled names, the summary line, and the matchup score on the
  right as a plain number (as pick3's Teams rows show theirs), no pill. The summary line:
  - run and faced: "95 battles · went 62-31 · 10 teams";
  - faced only: "Faced in 40 battles · players went 12-28";
  - run only: "Run in 30 battles · went 18-12";
  - no decided battles: "95 battles · no result";
  - generated: the `Projected` tag and nothing else.
  The team count applies to cores only, as today.
- **Open row:** the same content as today, restyled. The Core, Team or Projected label becomes a
  `Tag`. "Seen with" and "Built as" stay. "Open in pick3 ›" stays as a labeled text link (the
  team link format is unchanged).
- **No shared battles yet:** the board is the projected rows from the baseline, as today, each
  tagged `Projected`. There is no empty board while the baseline loads.
- **Error:** `ErrorState` "Could not load the team board." with Try again.

## Pokémon (`/<league>/pokemon`)

- **The same one line** as Top teams, then the list. The "What you face" heading and its paragraph
  go.
- **Rows stay in blend order.** Each row: sprite, the spelled name, types on the left. On the
  right, in this order:
  - the measured share, large, in pink with its dot ("10%"); none measured: "Not measured" in the
    muted color;
  - "10 of 104 battles";
  - "went 8-2" (the reporters' record against it) and its confidence `Tag`;
  - "PvPoke #9", small and muted.
- **Under a single source,** the share and record are that source's numbers. Under PvPoke alone,
  the right side is "PvPoke #9" alone, and the list says "Nothing measured." once, above it.
- **Empty:** the "Help fill this in" card as today (its copy and its pick3 Log a Battle link),
  restyled as meta's version of the contribution line on pick3's Your Meta.

## Species (`/<league>/p/<id>`)

- **Hero:** the sprite at 96px, the spelled name once as the page title, the type tags, then the
  pink measured line ("10% of what players face · 10 of 104 battles") and "PvPoke #9" small. The
  blend paragraph repeated from the list goes (the one line on the list already carries it).
- **Faced, week by week:** shown only when there are 3 or more weeks; otherwise the card is left
  out. The existing all-or-nothing `SHARE_MIN` rule stays.
- **Reporters' record against it:** as today, with its honesty lines. "Form not confirmed for 7
  picks." becomes "7 picks didn't show whether it was Shadow." (singular: "1 pick didn't show
  ..."). The tournament block keeps its lines.
- **Record against it, by rank:** removed (the rank band is retired).
- **Seen next to:** as today, names spelled out, share and count on their own lines so a long name
  never wraps into the numbers.
- **Moves reporters ran (the fix):** the denominator is the battles whose moves are known (the sum
  of the moveset battles the worker returns), not every battle run. The line reads "Moves known in
  5 of 62 battles" and each share is of those 5. With none known, the card says "No moves reported
  yet." and shows no rows.
- **Moves at tournaments:** as today, except the trailing "+" goes. When a set is PvPoke's
  recommended set it carries a `Tag` "PvPoke's set" on its own line.
- **PvPoke's set:** as today.
- **Two actions at the end,** as labeled text links:
  - "Who beats it ›" to pick3 Counters against it in this league (today's `countersLink`);
  - "Build a team around it ›" to pick3 Build with it as the lead (below).
- **Not found:** `Empty` "No Pokémon by that name in <league>." with a link to the Pokémon list.

**pick3 change for "Build a team around it":** `#/build?lead=<speciesId>&l=<league>`. `parseHash`
reads `lead` (same `/^[a-z0-9_]+$/` check as `vs`) and `l` into the build route. On entry the
store switches to the league if one was named, sets pick 0 to the species exactly as Counters'
"Build a team around it" does (`setPick(0, { kind: 'species', id })`), then replaces the hash with
`#/build`, so reload and back do not set it again. A species the league does not rank opens Build
unchanged. `links.ts` gains `buildLink(league, speciesId)`. The CSP is unaffected (a link, not a
request).

## About (`/about`)

- **Theme:** an "Appearance" card first, with the ui `Seg` (System, Dark, Light), the same control
  as pick3's Settings, Appearance. The choice is stored the same way it is today.
- **Copy:** "A self-reported rank band" goes from "What one shared battle contains". The rest of
  About's cards stay, restyled onto ui components; "How to contribute" keeps its two pick3 links.

## States

Captured by `npm run meta:screens` in both themes at 390px, for each fixture run (empty, thin,
mid, thick) where it applies:

- **Top teams:** the list; a row open (Core, Team and Projected rows); Multi-team only on; the
  Sort list open; the How it is ranked explainer open; no shared battles (projected only); error.
- **Pokémon:** the list under All, Tournaments, GBL and PvPoke; empty; error.
- **Species:** a Pokémon with measured moves and 3 or more weeks; one with fewer than 3 weeks; one
  with no known moves; one with tournament moves; not found.
- **About:** the page with the theme control.

## Testing

- **Unit (apps/meta):** the moves share uses the known-moves total ("5 of 62", shares of 5); the
  one-line source summary for all, single-source and empty inputs; the summary line wording for
  run, faced, mixed, undecided and generated rows; spelled names for Shadow and regional forms;
  the weekly card hidden under 3 weeks; the form line's singular and plural.
- **Unit (apps/web):** `parseHash` reads `lead` and `l` on `#/build`, rejects a bad id; entering
  that route sets pick 0 and the league and replaces the hash; an unranked species leaves Build
  unchanged.
- **Screens:** Top teams, Pokémon, Species and About join `AUDIT_ENFORCED` in
  `apps/meta/scripts/screens.mjs`. `npm run meta:audit`, `npm run web:audit` (the Build route
  and the shared cross-link button), `npm run ui:audit` and `npm run check-colors` pass.

## Records and sign-off

Three records in `docs/design/audits/`, in the `teams.md` shape: `meta-teams.md` (Top teams),
`meta-pokemon.md` (Pokémon and Species) and `meta-about.md`, each signed by Travis. One plan, one
build, merged on Travis's go before the records are signed.

## Cleanup

Removed once nothing uses them: the brand row and its `.wordmark`, `.hero-lockup`,
`.only-dark`/`.only-light` styles in `apps/meta/src/app.css`, `SitePill`, `ThemeIcon` and the
header theme button, the Sort cycle, the "Record against it, by rank" card and its band helpers,
the `-S`/`-G` short names, and meta's own `Header` in `components.tsx` if the ui `Header` covers
every use.

## Out of scope

- Folding meta.pick3.gg into pick3.
- `workers/counter` and the API; the bake and its files.
- The blend math, the half-say constants and `apps/meta/src/rank.ts`'s weighting.
- pick3 pages other than the Build route and the shared cross-link button.
- The open pick3 follow-ups (the 12px to 13px pass, the shuffle icon).
