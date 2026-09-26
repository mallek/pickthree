# Audit: Team Analysis

Piece: 2 (last page). Inventory entry: `docs/design/inventory/2026-09-22-inventory.md`, "Page 3
of 10: Team Analysis". Intake entry: `docs/design/inventory/2026-09-23-design-intake.md`, "Page 3:
Team Analysis, first pass (progressive disclosure)" and the "Decision (Travis, 2026-09-23)" and
"Headline score (Travis, 2026-09-23)" under it (score.battle as the headline, not score.total).

A note on sprites: this worktree's game data was built with `PICKTHREE_SKIP_SPRITES=1` (no network
access to PokeAPI during this task), so every capture below shows the type-colored token-letter
fallback instead of a sprite, exactly as on the Teams and Build records. That is a real, shipped
state (Settings > Pokémon pictures off, or a sprite that fails to load), and it is the worst case
for contrast: single letters on Steel-gray Melmetal, split-color Corsola, Tinkaton and Galarian
Stunfisk, and the Shadow-marked Greninja disc. The live site at pick3.gg builds with sprites and
shows those instead; nothing on this branch touched sprite rendering itself.

## Screenshots

Dark and light at 390px, one pair per state, converted to WebP (600px wide, quality 72) the same
way the Teams and Build images were, from `apps/web/screenshots/<name>-{dark,light}.png` (fresh
`npm run web:audit` run, 2026-09-25, at commit `5ca9c4d`). `03-team-detail`, `14-custom-team`,
`14b-custom-unranked` and `14c-shared-team` are full-page shots (`captureBeyondViewport: false`,
the same rule Teams and Build use so the fixed tab bar lands at the true bottom); `analysis-confirm`
and `analysis-not-found` are viewport shots (a sheet over the score card; a short Empty state).

| State | Dark | Light |
| --- | --- | --- |
| `03-team-detail`: a recommended team (no rating card), battle score 88 "Strong fit," battle plan, matchups, all three Pokémon rows with the lead expanded, Team structure tiles, Alternatives, Assumptions open with the matchup grid (full page) | ![](img/03-team-detail-dark.webp) | ![](img/03-team-detail-light.webp) |
| `14-custom-team`: a hand-built team of species you don't own, rating card with the hypothetical-IV note, the best-recommended-team note, the chosen-moves note and "Run it in this order" (full page) | ![](img/14-custom-team-dark.webp) | ![](img/14-custom-team-light.webp) |
| `14b-custom-unranked`: a custom team led by Magikarp, the PvPoke-unranked note ("PvPoke does not rank Magikarp in Great League...") added to the same rating card (full page) | ![](img/14b-custom-unranked-dark.webp) | ![](img/14b-custom-unranked-light.webp) |
| `14c-shared-team`: a team opened from a link, "Shared team link. IVs assumed for Azumarill, Tinkaton; the rest are yours." (full page) | ![](img/14c-shared-team-dark.webp) | ![](img/14c-shared-team-light.webp) |
| `analysis-confirm`: Take to battle while Feraligatr, Morpeko, Galarian Stunfisk (3 logged) is running; the `ConfirmSheet` "Switch teams?" over the score card, Keep it and Switch | ![](img/analysis-confirm-dark.webp) | ![](img/analysis-confirm-light.webp) |
| `analysis-not-found`: "This team is not in the current results. Filters may have changed." with a "Back to teams" button | ![](img/analysis-not-found-dark.webp) | ![](img/analysis-not-found-light.webp) |

Not captured: the "No hand-built team yet" flavor of not-found (same `Empty` component, a
different first line and button, both string-driven, not a layout difference); the ABB line team
structure (this branch's fixtures and the two enforced custom teams all land as Balanced ABC; the
ABB block is unchanged markup carried over from before this task, per Task 3's report); ordinary
scroll-to-open of a closed Pokémon row without the strip tap (the strip-tap path is what
`teamDetail.test.tsx` and the jump-row browser check both exercise, and it is the same
`scrollIntoView`/`open` mechanism a row's own head uses).

## Automated checks

- [x] `npm run web:audit` clean for this page's screens (listed in `AUDIT_ENFORCED`), re-run
      2026-09-25 against `5ca9c4d`: exit 0. Zero findings on all six enforced Team Analysis
      screens (`03-team-detail`, `14-custom-team`, `14b-custom-unranked`, `14c-shared-team`,
      `analysis-confirm`, `analysis-not-found`), in both themes. 838 findings remain on screens
      not yet redesigned (unchanged from Task 5's fix-wave run, since no source file changed after
      it), none failing the run.
- [x] the run's own guards, all passed in this run:
  - `assertTitleCentred('team analysis')` holds on the Team Analysis header;
  - every jump button (Battle plan, Matchups, Pokémon, Details) lands its section's heading 0 to
    24px under the sticky header, starting from more than 24px under it, measured after waiting
    for the smooth scroll (or the instant jump under reduced motion) to stop moving (Task 5's
    Minor 1 fix; the run emulates `prefers-reduced-motion: reduce`, so it exercises the instant
    path);
  - `analysis-confirm` throws if `.ui-confirm` never opens; Keep it leaves the running set alone
    and the analysis open, Switch closes it and lands on Log a battle's `.team-strip` (Task 4's
    behavior, Task 5's capture);
  - the shared-link step throws "shared team failed: <reason>" on a real failure (waits for
    `.custom-note, .ui-error, .scroll .error` and reads `.ui-error, .scroll .error`, Task 5's I4
    fix) rather than a silent 120s timeout;
  - `analysis-not-found`'s `.ui-empty` includes "not in the current results" (Task 5's Minor 2
    fix), not just any `Empty`;
  - the "+N more" toggle is topmost at both its top and bottom edges by `elementFromPoint`, and
    the Safe chips end at or above its top (Task 5's I2 fix: the toggle left the chip flow).
- [x] no console errors: the run printed no "Browser errors" section.
- [x] `npm run lint`, `npm run typecheck`, `npm test`, `npm run check-colors`, `npm run
      check-tokens`, all run 2026-09-25 at `5ca9c4d` (no source change since Task 5's own run):
      lint exit 0; typecheck exit 0 across all seven workspaces; `npm test` 133 files, 1,168 tests
      passed; `check-colors` exit 0 (baseline untouched); `check-tokens`: ok.
- [x] `npm run ui:audit` and `npm run meta:screens`: not re-run for this task. Nothing under
      `packages/ui` or `apps/meta` changed after Task 5's own passing runs of both (Task 5's report:
      "gallery audit: clean in dark and light" with the three self-checks; `meta:screens` exit 0),
      and `git status` at the start of this task showed a clean tree outside this record's own new
      images.

## Aesthetics

- [x] colors from tokens, in their roles (violet interaction, pink measured with its mark, outcome
      colors, red only for destroying data): `check-colors` is clean and `web:audit` finds zero
      contrast findings on the six enforced screens in either theme. Task 5's source fixes
      (`.strategy-note`, `.ogrid-rank` to `--muted`; `.ogrid .cell.w` to `--text`) and the
      sprite-less token-letter pair (`--token-letter`/`--token-halo`, carried over from Teams and
      Build) hold on every disc shown, including Melmetal's single-type steel disc, Galarian
      Corsola's and Clodsire's split discs, and the Shadow-marked Greninja disc in `03-team-detail`.
      No pink appears: Team Analysis has no measured community data of its own, only PvPoke-ranked
      and your-collection numbers.
- [x] at most four text levels, one page title: one "Team Analysis" title in every capture
      (`Header variant="sub"`). Levels visible across the captures: the page title; section heads
      ("Battle plan," "Matchups to remember," "Your Pokémon," "Why this team," "Alternatives you
      own"), unified at `--fs-section`/600, the same size Build's sections use; sub-headings within
      a section ("Wins"/"Threat," "Lead"/"Switch"/"Closer," "Team structure") at 15px/600
      (`h4.analysis-sub`, Task 5's fix so they read as one size, not the section heads' size);
      body and explanation text (the battle-plan lines, the rating-card sentences, the move and
      matchup reads); and small muted text (the role pill, the fit tag, the strip's role labels,
      the Assumptions lines). A Pokémon row's own name is not a fifth level here: the Pokémon rows
      use `ExpandRow`'s own summary text, not a filled card like Build's, so this page has no
      exception to flag the way Build's kept 19px card name did.
- [x] one filled primary button: every capture shows exactly one `Button variant="primary"`
      ("Take to battle") inside the score card, whether the team is recommended (`03-team-detail`)
      or custom (`14-custom-team`, `14b-custom-unranked`, `14c-shared-team`); `analysis-confirm`
      adds the sheet's own primary ("Switch") and secondary ("Keep it"), a `ConfirmSheet` pattern
      already audited elsewhere, not a second page-level primary. `analysis-not-found`'s "Back to
      teams" is an outlined button, not filled.
- [x] chips tapped, tags read: type chips, meta-rank tags, the "TM"/"Elite TM" badges, the role
      pills on the strip and the Term-underlined words (Elite TM, XL Candy, IV rank, Move counts,
      ABB line, Balanced ABC) are read-only labels or definition popovers, never a pressable
      filter. The one interactive control that looks chip-like, "+N more" among the Safe types, is
      a real 44px `Button` (`.more-chip`), named by its text, not a chip; Task 5 moved it out of
      the chip row specifically so it would not be mistaken for one and would not overlap a chip's
      tap target (`03-team-detail`, `14-custom-team`: "+1 more" sits on its own line under the
      chips).
- [x] the right header variant: every capture uses `Header variant="sub"`, Back on the left,
      Share (`ShareGlyph`, only when a team exists) and Settings `IconButton`s on the right, as on
      Build; `assertTitleCentred` confirms the title stays centred after Task 4's `.hdr-actions`
      inheritance from Build's own fix.
- [x] rows align; gutters and the 8px base hold: the strip, the score card, the jump row, every
      section head and each `ExpandRow` share the 20px gutter and the `--divider`/`--r-card`
      pattern carried over from Teams and Build. Task 5's fix gives an open Pokémon row's body 12px
      of top padding so its type chips no longer touch the row's own divider (visible in
      `03-team-detail`'s open Shadow Greninja row). The Assumptions card now has the same
      `--divider` border and `--r-card` radius as the `ExpandRow`s above it (Task 5), so it reads
      as one more card in the stack rather than a flush block.
- [ ] sprites unchanged: cannot confirm from these captures, for the same reason as the Teams and
      Build records: this worktree has no sprite build (`PICKTHREE_SKIP_SPRITES=1`), so every
      Pokémon here is a lettered token disc, never a sprite image. The fallback renders correctly:
      Task 5's `.token-wrap { display: inline-flex; flex: none }` fix (this branch's one change
      that reaches the token wrapper itself, not just its colors) removes a 3.5px vertical
      misalignment between a Shadow disc and its plain neighbours, checked by eye against the
      signed Teams and Build captures (matching page heights, per Task 5's report) and by
      `shadowToken.test.tsx`'s 22 cases (18 types x contrast, plus the wrapper-class and marker
      checks). No CSS or component that draws a sprite changed on this branch.
- [x] at most one line of text before the first result: under the strip, one line (structure `Term`
      + "Demanding to play: why") sits above "Edit team," then the score card is the first result.
      "Battle plan," "Matchups to remember" and "Your Pokémon" each open directly on their content
      (the collapsed Wins/Threat pair; the first `ExpandRow`), with no extra sentence above it.
      `analysis-not-found` has exactly the one line the state needs.
- [x] light as readable as dark: every state above is a matched dark/light pair; `web:audit`'s
      per-theme contrast pass is clean on all six in both themes; the `ConfirmSheet` and `Empty`
      states read the same way in both (checked by eye in `analysis-confirm` and
      `analysis-not-found`).

## Functionality

- [x] every "must keep" from the inventory entry, item by item:
  - Per-Pokemon detail (role and order, types, meta rank tags, form notes, moves with counts and
    extra-damage/resisted reads, TM/Elite TM badges, shield and safe types, keep-shield advice,
    your IVs, level, IV rank, cost to build): all present in `03-team-detail`'s open Shadow
    Greninja row and reachable on the other two rows.
  - Custom team rating card (fit and battle score, why, comparison with the best recommended team,
    the order result, chosen moves, assumed IVs, the PvPoke-unranked note): `14-custom-team` and
    `14b-custom-unranked` show every one of these notes at once, in the order `ScoreCard.tsx`
    composes them (Task 2's report).
  - Two team shapes (Balanced ABC tiles, ABB line panel): `WhyThisTeam.tsx` renders both branches
    unchanged from today's markup (Task 3); every capture here happens to land on Balanced ABC,
    since none of the enforced teams' fixtures produce an ABB line.
  - When to switch, Key wins, Key threats, Why this team plus the score breakdown, Alternatives you
    own: all present, folded into "Matchups to remember" (collapsed pair plus "Show all") and "Why
    this team" (Task 3's `Matchups`/`WhyThisTeam` components), matching the intake's locked-in
    split.
  - The Assumptions block (product rule: every result carries its assumptions): open in
    `03-team-detail`, showing Shields, Opponent meta, Opponent weights, IVs, Level cap, the
    matchup grid and "Show all 46 meta Pokémon," and the Total build line.
  - Share sends species and moves only: unchanged `ShareGlyph`/share logic (Task 4); no CSP or
    payload change on this branch.
- [x] every control does what its label says: the strip opens a row and scrolls to it without
      closing another (`teamDetail.test.tsx`'s strip test, five assertions: row 2 opens, row 1 and
      3 keep their state, `scrollIntoView` ran on `#pokemon-1`, a second tap keeps it open); the
      jump row scrolls its own section under the header (the browser check above); "Show all"
      expands Matchups' full lists and toggles its own `aria-expanded` without affecting the other
      sections; "Edit team" loads the three picks into Build (`teamDetail.test.tsx`'s "Edit team
      loads the three into Build"); Take to battle starts, joins or asks to switch a set correctly
      in all three cases (Task 4's tests 6-8, plus the same-team-running case Task 4's fix round
      added).
- [x] back returns to the origin with filters and scroll, for Team Analysis: `back(fallback)`
      with Teams as the fallback for a recommended team or a team-link analysis, Build for a
      hand-built one (Ruling 2), landing on real history when something sits behind the screen. A
      team link's own landing entry now replaces itself (`navigate(route, { replace: true })` via
      `history.ts`'s `replaceEntry`) instead of staying in history, which closed the back-gesture
      loop through `#/t/...` that Task 4's first pass introduced and its fix round removed at the
      root. `teamDetail.test.tsx`'s twelve original cases plus the "Team Analysis from a team link"
      describe block (three cases: the landing replaces itself and stays first, Back lands on
      Teams, Edit team then Analyze again lets Back return to Build) and `history.test.ts`'s
      `replaceEntry` case all cover it.
- [ ] input layout rule: not applicable. Team Analysis has no text input.
- [x] icon buttons named; focus visible: Share carries the label "Share this team," Settings
      "Settings" (`Header.tsx`, unchanged); the jump row is a `nav` labeled "Jump to" with four
      named text `Button`s; the strip members and the "+N more" toggle are named buttons, not bare
      icons; the shared `Button`/`IconButton` focus-visible outline is the one audited on other
      pages (gallery record), unchanged here.
- [x] product rules: assumptions shown (the Assumptions block; the rating card's hypothetical-IV,
      unranked and shared-link notes); collection stays on the device (Team Analysis makes no
      request that carries collection data; Share sends species and moves only, unchanged CSP);
      sharing copy not applicable (no sharing toggle lives on this screen; the "shared" word here
      means a team link, not the battle-log sharing setting).
- [x] tests cover the new behavior: `apps/web/test/analysisComponents.test.tsx` (ScoreCard,
      BattlePlan, Matchups, PokemonDetails, WhyThisTeam), `apps/web/test/teamDetail.test.tsx` (the
      screen: not-found, headline, jumps, strip, Take to battle in all three running-set cases,
      Edit team, Back with and without history, the team-link describe block, the rounded score
      breakdown, the reduced-motion jump), `apps/web/test/history.test.ts` (`replaceEntry`),
      `apps/web/test/format.test.ts` (`costParts`), `apps/web/test/shadowToken.test.tsx` (the
      token-wrapper alignment fix), `packages/engine/test/analyze.test.ts` (Ruling 1's
      battle-first order sort).

## The plan's rulings, with their costs

1. **Tried orders sort by battle strength**, ties by total (`compareTeamScores`), so "Run it in
   this order" and Build's Find best order pick the strongest order, matching the Teams list and
   the battle headline. [Cost if wrong: one sort line and a field.] Landed in Task 1 (`18ce875`);
   `OrderTried` gained `battle`; `analyze.test.ts` pins the battle-first order.
2. **Back:** a custom team falls back to Build, a recommended team to Teams; a shared link opened
   fresh falls back to Teams. Edit team is a separate labeled text action under the strip. [Cost if
   wrong: fallback routes.] Landed across Task 4's two commits: the first pass special-cased a
   team-link flag that could go stale (Edit team, re-Analyze, Back skipped Build); the fix replaced
   the link's own history entry at the root (`replaceEntry`), so plain `back(fallback)` works for
   every path and the ruling holds without a special case.
3. **"Run it in this order: A, B, C."** shows on every score card; custom teams add today's
   orders-tried line under it. [Cost if wrong: one line.] `ScoreCard.tsx` (Task 2); visible on all
   four score cards captured.
4. **The strip keeps one supporting line**: structure as a `Term` and "Demanding to play: why," as
   on Teams' open row. [Cost if wrong: one line.] Visible under the strip on every capture.
5. **Jump buttons are text `Button`s** in one row (Battle plan, Matchups, Pokémon, Details); each
   scrolls its section into view. "Details" is the Why this team section, followed by Alternatives
   and Assumptions. [Cost if wrong: a different control.] Landed in Task 4; the browser check
   (Task 5) proves each button moves the right heading under the header.
6. **The score breakdown line** reads: "Battle strength N is coverage, consistency and safety. The
   total, T, also counts cost (C) and accessibility (A)." with the factor numbers. [Cost if wrong:
   copy.] `WhyThisTeam.tsx` (Task 3); Task 5's review found the factors and total printed as raw
   decimals ("56.3," "71.7") beside a rounded headline, fixed by rounding every number in the line
   the same way the headline is rounded (`03-team-detail` now reads "(99, 56, 100). The total, 72,
   ... cost (0) and accessibility (60)").
7. **`StructureTag` and `GLOSSARY['line']` are removed** once TeamDetail stops using them; the
   structure is a `Term` like Teams. [Cost if wrong: none.] `StructureTag` deleted in Task 4 (no
   remaining user); `GLOSSARY['line']` did not exist at HEAD, so there was nothing to delete.
8. **Take to battle stays on shared teams** (today's behavior) and asks through `ConfirmSheet` only
   when a different set is running. [Cost if wrong: none.] `analysis-confirm` shows the sheet
   naming the running team and its logged count; `14c-shared-team`'s score card carries the same
   primary button as every other kind of team.

## Findings and fixes

| Finding | Fix | Commit |
| --- | --- | --- |
| Task 2 review: `.score-line` had no CSS rule (rendered correctly only by coincidence, matching `--fs-body`'s default); `BattlePlan`'s lines were keyed by their own text, a latent duplicate-key risk if two switch lines ever matched. | `.score-line { font-size: var(--fs-body) }`; `BattlePlan` keys each line by index within its step. | `b2f0bb8` |
| Task 3 review I1: the move-count `Term` glued straight onto its count text ("4-4-3Move counts") with no separator. | `MoveRows`' `countNote` renders with a literal non-breaking space before the `Term`. | `2a90e2a` |
| Task 3 review I2: `PokemonDetails`' `CostBreakdown` hand-duplicated `costLine`'s Stardust/Candy/XL Candy/Elite TM ordering and zero-checks, untested. | Extracted `costParts(c: Cost): CostPart[]` in `format.ts`; `costLine` and `CostBreakdown` both consume it, so the two can no longer drift; a never-drift test and a rendered-cost-text test added. | `2a90e2a` |
| Task 3 review minors: the "Move counts" term body was hardcoded inline instead of living in `GLOSSARY`; `.matchup-cols`' two `.mini` cards kept their `.hscroll`-era fixed 150px/170px widths inside a 1fr/1fr grid. | Moved into `GLOSSARY['Move counts']`; scoped `.matchup-cols .mini { width: auto }` and `.matchup-grid .mini { width: auto; min-width: 0; flex: 1 1 140px }`, leaving the shared rules `TeamDetail.tsx` still used untouched. | `2a90e2a` |
| Task 4 review, Important: the "came from a link" Back rule read a picks flag (`sharedTeam`) that outlives the link visit, so Edit team, re-Analyze, Back skipped Build and pushed Teams instead. | Fixed at the root instead of in `TeamDetail.tsx`: the link's own landing entry now replaces itself (`history.ts`'s `replaceEntry`, `store.tsx`'s `navigate(route, { replace: true })`, used only while `analyze()` hands off from the `shared` route), so it never sits behind the analysis in history. `TeamDetail.tsx`'s special case is gone; plain `back(fallback)` handles every path, and the system back-gesture loop through `#/t/...` goes with it. Three new tests, including the exact Edit-team/re-Analyze/Back path the finding named. | `7492e5a` |
| Task 4 review minors: the same-team-running branch of Take to battle had no test; a negative assertion depended on a 50ms sleep; the header-offset constant was a bare 76px; a stale comment still named the deleted `ShareButton`; two glyph literals were rewritten with no behavior change. | Added the missing test; replaced the sleep with `act(async () => {})`; derived `--hdr-box` from `.hdr`'s own padding/border/`--tap` tokens with a comment tying it to `.hdr`; fixed the comment; the glyph literals were left as the coordinator waived that one. | `7492e5a` |
| Task 5 review, Important 1: the score breakdown printed raw decimals ("56.3," "71.7") beside a rounded headline. | Every factor and the total are rounded the same way the headline is (`Math.round`); a test feeds fractional factors and asserts the whole-number sentence. | `5ca9c4d` |
| Task 5 review, Important 2: the "+N more" toggle reached back into the chip row above it with a negative `margin-block`, so a tap on the lower edge of certain chips landed on the chip instead of the button; the trick also hid the overlap from the audit's own touch-target check. | The toggle moved out of the chip flow entirely, into its own row under a new `.safe-types` column; the `margin-block` hack and `.strategy-row .tchip { position: relative }` are deleted; a browser check confirms the button is topmost at both its top and bottom edges. | `5ca9c4d` |
| Task 5 review, Important 3: the audit's own fix for "partially obscured" text (letting it re-measure a stack whose upper layers are flat, opaque and free of blend/opacity effects) could also pass a real contrast failure sitting over an image or inline SVG, since a graphic node has no CSS background for the transparent-layer skip to catch. | `cutAtOpaque` returns null (stays unverified) for any `SVGElement`, `IMG`, `CANVAS`, `VIDEO`, `OBJECT`, `IFRAME`, `EMBED` or `PICTURE` in the stack, checked before the transparent-layer skip; two new `ui:audit` self-checks ("graphics," "page edge") prove both directions can only tighten the audit, never loosen it. | `5ca9c4d` |
| Task 5 review, Important 4: the shared-link failure check was rewritten to a selector (`.ui-error`) that `SharedTeam.tsx` never renders (it still renders `.scroll .error`), so a real failure surfaced only as a silent 120s timeout instead of a thrown message. | The wait and the read both cover `.custom-note, .ui-error, .scroll .error`, matching what `SharedTeam.tsx` actually renders. | `5ca9c4d` |
| Task 5 review minors: the jump check could pass with no button ever found or with an overshoot; the not-found check only looked for `.ui-empty`, not its line; the SEP regression test skipped "Opponent weights"; two pre-existing polish items were noted for the record (see Open items). | The jump check throws when no button matches the label, and asserts the heading starts more than 24px under the header and lands 0-24px under it after motion stops (this caught a real bug, see the next row); the not-found check requires the "not in the current results" text; "Opponent weights" added to the SEP test loop. | `5ca9c4d` |
| Seen only by the stricter jump check above: every jump always scrolled `smooth`, so a long jump (Details, 205px still moving after 500ms) could still be in flight when a screenshot or a fast check ran next. | `scrollToId` uses `auto` under `prefers-reduced-motion: reduce` and `smooth` otherwise; a new test exercises the reduced-motion path; `web:audit` emulates the reduced-motion media query, so the enforced run takes the instant path. | `5ca9c4d` |
| Seen in the captures, not caught by axe (Task 5): `.strategy-note`/`.ogrid-rank` on `--faint` and `.ogrid .cell.w` failed contrast; the jump row wrapped to two lines at 390px; section heads and their sub-headings shared one size; an open row's body sat flush against its own top divider; a Shadow token sat 3.5px off its plain neighbours; the Wins/Threat cards had uneven heights; the Assumptions card had no border; the switch sheet's "(3 logged)" broke across two lines. | `.strategy-note`/`.ogrid-rank` to `--muted`, `.ogrid .cell.w` to `--text`; the jump row's buttons lost their side padding so all four fit on the gutter; sections at `--fs-section`/600, sub-headings at a new `h4.analysis-sub` (15px/600); 12px of top padding on an open row's body; every `PokemonToken` wrapper is now `.token-wrap { display: inline-flex; flex: none }` (reaches Teams and Build too, see below); `.matchup-cols .mini { flex: 1 }`; the Assumptions card gets the `ExpandRow`s' own border and radius; the count and "logged" joined by a non-breaking space. | `01ff080` |

## Visible changes outside Team Analysis

- **Build's Find best order picks the strongest-in-battle order.** Ruling 1's `compareTeamScores`
  sort (`packages/engine/src/analyze.ts`) reaches Build's own "Find best order" the same way it
  reaches the score card here, since both call `analyzeTeam` and read `orders[0]`. This was
  recorded as intended in Task 1's pre-flight scan, not a surprise found late.
- **Every `PokemonToken` wrapper is `inline-flex`, not a bare inline `<span>`.** Task 5's fix
  (`app.css`'s `.token-wrap`) removes a line-box strut that made a Shadow token sit 3.5px higher
  than a plain token beside it. This reaches every current caller across `apps/web` (21 files, per
  Task 5's review grep), including the signed Teams and Build pages; both keep their signed page
  heights (checked in Task 5's review: `02-teams` and `13-build` measure the same CSS pixel height
  before and after) and were compared by eye. `apps/meta` imports neither `PokemonToken` nor
  `apps/web/src/app.css`, so meta.pick3.gg is unaffected.
- **A team link's landing now replaces its own history entry** (`history.ts`'s `replaceEntry`,
  `store.tsx`'s `navigate(route, { replace: true })`), used only while `analyze()` hands off from
  the `shared` route. This closes the system back-gesture loop through `#/t/...` for every shared
  link, not just the ones that reach Team Analysis through this task's own Back button.
- **Jump scrolls are instant under `prefers-reduced-motion: reduce`.** `scrollToId`'s new branch is
  a general helper, not Team Analysis-specific; nothing else on this branch calls it yet, but any
  future caller inherits the reduced-motion behavior for free.
- **`scripts/audit.mjs`'s layer comparison and its new self-checks.** The "partially obscured" fix
  (comparing only the layers that actually paint) and the graphics/page-edge tightening
  (`cutAtOpaque` refusing to skip past an image or SVG) apply to every future audited page on both
  sites, not just this one; `ui:audit`'s self-check gained two fixture pages ("graphics," "page
  edge") that assert both directions can only tighten the audit.
- **`costParts` in `format.ts`.** The extraction Task 3's review asked for reaches every existing
  `costLine` caller (Build's cost box, `TeamCardBody` on Teams, and this screen's own To-build
  lines and Assumptions total) with byte-identical output, confirmed by the pre-existing
  `costLine` assertions in `format.test.ts` staying green through the rewrite.
- **`ShareButton` is gone; `ShareGlyph` plus the shared `IconButton` renders Share everywhere it
  used to.** A repo-wide grep in Task 4 found no other caller before it was deleted.

## Open items for Travis (not fixed on this branch)

- **The Shadow glow (`.token-shadow-wrap::before`) is still not visible.** Pre-existing, unchanged
  by this branch (the same open item recorded on Build); `shadowToken.test.tsx`'s glow assertion
  remains a documented smoke check, not proof the glow renders.
- **Task 5's minor 4, pre-existing, noted for the record (not fixed here):**
  - The Assumptions block says "48 Pokémon" (`a.metaSize`) a few lines above "Show all 46 meta
    Pokémon" (the deduplicated count); both numbers are real, just two different counts of the
    same meta group.
  - On `14c-shared-team`, the score card reads "Azumarill ran the moves you chose" and "Run in the
    order you picked," but the sender of the link chose both, not the person viewing this capture.
- **The spacing around "+N more" (optional polish, Task 5's review).** The pill sits centred in its
  44px target, so the Safe block ends with visibly more air under it than the Shield-to-Safe gap
  above it. The review's suggested fix (`align-items: flex-start; padding-top: 6px`, extending the
  target only downward into already-empty space) was not applied; the `elementFromPoint` check
  would still hold either way.

## Sign-off

- [ ] Travis, <date>
