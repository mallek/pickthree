# Handoff: meta.pick3.gg polish pass

Date: 2026-09-18. From the pick3 session (Fable) to the meta session (Opus), after reviewing
every page at phone size (390px, apps/meta/scripts/screens.mjs with `fullPage: false`) next to
pick3's own screens. Travis approved the whole list. Do all of it; order below is by how
visible each item is. pick3's conventions are the reference throughout: when in doubt, open
apps/web/src/app.css and apps/web/src/components.tsx and copy the pattern, not the idea of it.

Rules that still apply: no em dashes; 7-bit ASCII in player-facing text; braces on every
control-flow body; exact pinned versions; stage explicit paths; the screens script passes
before a push; keep the read-only-API and privacy copy exactly as they are.

## A. Site-wide

### A1. One header row, not two
Today every page stacks the brand row (wordmark + pick3 pill) and then a centred title row
with the theme toggle ("Great League / This season - All ranks", "Most run teams", "About the
data"). pick3's tab roots have one row: big left-aligned title, actions on the right
(apps/web/src/app.css `.page-head`, `.between`, `HeadCog`). Do this:
- Keep the brand row as the site's identity. Move the theme toggle into it, at the right, next
  to the pick3 pill, drawn as a round 36px icon button like pick3's `HeadCog` (`.head-cog`).
- Remove the centred title row from Overview, Teams and About. The league switcher plus the
  filter chips say where you are; Teams gets a plain left-aligned `h2` "Most run teams" above
  its list; About keeps its `h2` inside the page body.
- The Species page keeps a `Header` with the back link (it is a drill-in, like pick3's team
  detail), but its title becomes just the species name; the league lives in the switcher below.

### A2. Type chips: pick3's, Title Case
Every type chip on the site is UPPERCASE. pick3's are Title Case in the same pill shape
(`.tchip`, `.tchip-sm`, `TypeChip`/`TypeChips` in apps/web/src/components.tsx, colours from
`typeColor` and `--type-<t>-ink`). Match them exactly: same casing, size, padding and colours,
everywhere a type appears (overview rows, species page, seen-next-to, PvPoke list).

### A3. Less prose above the data
"Most faced" carries two paragraphs of definitions before the first row. Replace with one line:
"From 1,000 battles shared by 42 devices." (numbers live). Move the definitions of faced,
record and trend to About under a "How to read the lists" heading. Same treatment on Teams:
the confidence key becomes one short line, or a tap-to-reveal note.

### A4. Numbers at a glance
Whole percentages: 26%, 58%, not 26.0% and 58.3%. Trend as a small coloured tag "+15" (green
up, red down) placed after the name, not appended to the share. Records as "140-100" only,
with the percentage as the big number.

### A5. Rank band as chips
The "All ranks" dropdown is the one control that is not a pick3 pattern. Make it a second
chip row like the window chips (`.chips`, `Chip` in pick3), scrolling sideways at phone width:
All ranks, Below Ace, Ace, Veteran, Expert, Legend.

## B. Overview rows

### B1. Right column
Split the tight block: the share as the large number, the record as a small muted line under
it, the trend tag after the name (A4). Keep the bar. Row height should match pick3's
`.counter-row` rhythm (44px token, name line, meta line).

## C. Teams page

### C1. Team cards in pick3's layout
The overlapping sprite cluster wraps to two rows on the third card and the name truncates
("Azumarill + Medicham + Regist..."). Use pick3's team card grid instead: three tokens with the
name under each (`.slots3`, `.slot`, `.slot-name` in apps/web/src/app.css; `TeamCard` in
apps/web/src/screens/Teams.tsx). Drop the "A + B + C" line, the names are under the tokens.

### C2. The card is the link
Replace the full-width "Open in pick3" button with the card itself linking to the pick3 team
deep link, and a small "Open in pick3 >" at the card's foot like pick3's "Analysis >" (`.cost-line`,
`.team-details`). Chevron as the site's Chevron component, never the ">" character.

### C3. Confidence and spread
Confidence as a small tag next to the win rate (few / some / many, pick3's `.tag`). The "Could be
anywhere from X% to Y%" line only on few-battle cards; on some/many it is noise.

## D. Species page

### D1. Sparkline
The bare line floats in space. Give it a faint area fill under the line, a baseline, and week
ticks along the bottom; or replace it with small weekly bars. Label the latest point on the
chart rather than in a line of text below it.

### D2. Notes
"Veteran (70 battles), Ace (60 battles) ... are all under 100 battles, treat them as hints, not
facts." becomes one short muted line: "Under 100 battles per band: hints, not facts." "Most
Pokemon carry two charged moves, so those shares add up to about 200%." goes away; see D3.

### D3. Moves as pick3's rows
Show movesets the way pick3 shows them (Build's cards: one line per move, an F or C marker,
the name, a type chip; `.pick-move`, `.pick-move-k` in apps/web/src/app.css), with the share at
the end of each line. Fast moves first, then charged.

### D4. Buttons
"Who beats it" and "Build a team" as pick3's outlined `.btn` pair (`.btn-pair`), neither filled.

## E. Empty state

"Only 0 Great League battles have been shared in this window." becomes "No Great League
battles shared in this window yet." Keep the banner and the PvPoke list under it.

## F. The pill on pick3.gg (apps/web, do it on this side of the repo too)

The bordered "meta" pill sits next to pick3's round cog and reads as a second control family;
on Teams it fights the Pokemon count. Replace it with a round icon button matching `HeadCog`
(36px circle, `.head-cog` styles), to the left of the cog, on all four tab roots including
Collection (an icon fits where the pill did not). Keep the bars glyph as the icon and the
accessible name "meta, the community meta". Add a "Community meta" row in Settings (a link with
one line of explanation) and keep the card on Your Meta. Remove `.site-pill` from apps/web
once nothing uses it.

## G. Branding: the wordmark

The meta wordmark is the bare "3" mark plus text. Build it from pick3's own lockup so the two
sites are one brand:
- Copy apps/web/public/lockup.svg and lockup-light.svg into apps/meta/public.
- Wordmark: the word "meta." in Inter 700 at the wordmark size, then the pick3 lockup as an
  inline image sized to the cap height (pick3's `.hero-lockup` shows the metrics trick:
  height 1.135em, vertical-align -0.325em), then ".gg" in the muted colour. Dark and light
  variants via the two SVGs (pick3's `.only-dark` / `.only-light`).
- The pick3 pill in the meta header can then carry the same lockup at 16px instead of the "3"
  mark, so the pill says pick3 the way pick3 says it.
- The favicon and the app icon can stay as the "3" mark.

## Acceptance

- `npm run lint`, `npm run typecheck`, `npm test` green.
- `node apps/meta/scripts/screens.mjs` passes, and a viewport pass (fullPage false) of the
  Overview, Teams, Species and About pages looks like pick3's screens side by side: one header
  row, Title Case chips, pick3 buttons and cards.
- The pick3 screens job (apps/web/scripts/screens.mjs) passes with the icon button in place.
- Push main when done; Pages and the worker deploy from it.
