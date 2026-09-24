# pick3 design intake, 2026-09-23

A parallel design session is generating page designs from the inventory
(`2026-09-22-inventory.md`). Travis posts them here in order, and this file collects them
before any product change is made.

## Ground rules (Travis, 2026-09-23)

- **Collect first, change later.** Gather every generated page before implementing anything.
- **Not pixel perfect.** The designs are direction, not specs to match exactly. What ships
  keeps the existing elements that already work.
- **Keep what works:** the bottom tab bar (menu) and the league switcher, among others. The
  inventory's "What you like" and "Must keep" sections are the list of things to carry over.
- **Dark mode only from here on.** Travis posts dark screenshots; light mode only when he
  spots a light-specific issue or this session asks for a specific light decision. Light
  still ships, so every design still needs a light pass before implementation (token pairs,
  contrast check).
- Implementation later goes through Travis's go-ahead and superpowers:brainstorming, as the
  inventory brief says.

## Received designs

Each entry: what the design shows, what it keeps, what it changes against the inventory,
anything that conflicts with a "Must keep" or a product rule, and open questions.

### Design 1: Common components, Foundation tab

Screenshots: `img/intake/d01-foundation-dark-1.png`, `d01-foundation-dark-2.png`,
`d01-foundation-light-1.png`, `d01-foundation-light-2.png`.

The component page has tabs: Foundation, Controls, Cards, Navigation, Feedback. Only
Foundation is shown so far.

**What it sets**

- **Canvas:** a deep navy "atmospheric" background with subtle color and depth, not flat
  black. It carries the landing page's welcoming style into the app, "tightened for dense
  battle data and repeated app use."
- **Color roles:** Canvas (atmosphere), Surface (cards and sheets), **Violet = actions and
  selection**, **Pink = measured community data**.
- **Type hierarchy, four levels:** Page title, Section title, Primary (explanation or
  recommendation), Supporting (assumptions, counts, timestamps, detail).
- **Shape and depth:** 12px radius controls, 16px radius cards, one quiet border, restrained
  shadow, "no glow around every object."
- **Spacing:** 24px page gutters, 8px base spacing, 44px minimum touch target.

**Fits the inventory**

- The four type levels are the layering tool the inventory keeps asking for: Primary for the
  one line people read, Supporting for the text walls (pages 1, 3, 9, 10, 11).
- Violet as the single action color matches today's accent, the tab bar and the league
  switcher.
- A named "measured data" color gives the meta blend rule ("never present a projection as
  measured") a visual form.

**Problems and conflicts**

- **Light mode is broken** (Travis: "the page titles on light you can't see"). Page title,
  Section title, "Common components," the color role descriptions and "16px cards" are near
  invisible on light. The heading color is clearly a dark-theme value with no light pair. For
  our system: every text role is a token with a light and a dark value, and each design is
  checked in both themes. (The shipped app has a few hard-coded `#fff` text colors in
  `apps/web/src/app.css` worth checking in that pass.)
- **Pink collides with type colors.** Fairy chips are pink and Psychic is pink-red, and type
  chips sit right beside measured numbers on meta rows. A "measured" pink needs to be
  distinguishable from type colors, or measured data should be marked some other way (a
  shape or label as well as color).
- **"No glow" vs the Shadow glow.** Today the purple halo on a sprite means "Shadow Pokemon"
  (it has meaning, not decoration). Keep it as the one allowed glow, or replace it with a
  labeled mark (it is currently unexplained, per page 3).
- **24px gutters vs dense screens.** Today's gutter is 20px. On a 390px phone, 24px costs 8px
  of width on the tightest layouts (Log a Battle's in-battle table, Team Analysis move rows,
  the Build card). Consider 16 to 20px on dense screens, or check those screens at 24px first.

**Open questions**

- Is the pink measured-data role meant for pick3 as well (your log is measured data too), or
  only for community numbers?
- The Controls, Cards, Navigation and Feedback tabs weren't shown. Send them if the design
  session produced them.

### Design 2: Common components, Controls tab

Screenshots: `img/intake/d02-controls-1.png`, `d02-controls-2.png`.

**What it sets**

- **Action hierarchy, three levels:** Primary is a filled violet gradient ("Log a battle"),
  Secondary is outlined violet ("Analyze this team"), Tertiary is a violet text link ("View
  assumptions").
- **League picker:** "One shared segmented control everywhere." Selected: a filled segment
  with a violet underline.
- **Filters and chips:** pill chips for the main split (All, You own, Under the radar), plus
  a full-width **"Filters and sort" row with a count badge (3)** for everything else.
- **Inputs and settings:** a search field ("Search any Pokémon," correct spelling) and a
  toggle row ("Share anonymous battles").

**Fits the inventory**

- The three action levels fix "three button styles in one card" (page 4) and give every
  screen one obvious main action. It also helps Win vs Loss (page 5): they can differ in
  weight or color instead of being identical.
- "Filters and sort" plus a count is the Collection popover pattern (page 8) and the
  "Filters: N" plan for Teams (page 1) as one shared component. It also replaces the
  sideways pill rows and the hidden cycle sorts (pages 1, 6, 7, 8, 10).
- One league control everywhere matches "keep the league switcher."

**Problems and conflicts**

- **Chips too big for dense use** (Travis: "might be too big for a place that uses a lot of
  them like types"). The system needs two families, kept visually separate:
  - **Chips** are interactive filters: 44px touch target, pill, the size shown here.
  - **Tags** are display-only labels: types, fit, rank ("#9 overall"), verdicts, "yours,"
    "few," "Shadow." Compact (about 20 to 24px), never styled like buttons. Today's small
    `TypeChips` are the right scale; the design should define tags at that scale.
- **The league picker lost the shields.** Today each league has a colored shield (blue Great,
  yellow Ultra, purple Master) and a violet outline on the selected segment. Travis wants the
  switcher kept, so the shields stay unless he says otherwise. The underline indicator is a
  change to confirm.
- **The league picker still assumes three leagues.** It doesn't answer page 1's open item
  (Tournament plus future cups, or "live leagues plus More").
- **A filled gradient primary is new.** Today there are no filled buttons. Fine as a
  direction, but it has to hold up next to type colors and the pink measured-data role.

**Decisions**

- **League shields stay** (Travis, 2026-09-23). The underline vs outline selected state is
  still open.
- Where "Filters and sort" opens (popover or sheet) is decided per page, when that page's
  design comes in.

### Design 3: Common components, Cards tab

Screenshot: `img/intake/d03-cards.png`.

**What it sets**

- **Team card:** a fit tag (filled) plus a structure tag (outlined), "Moderate to play" top
  right; three sprites with name and role; one summary line; cost line plus "Analysis >."
- **Collection row:** sprite, name, one stats line (CP · IV rank, or meta ranks), and a
  verdict tag on the right in **green** ("Built," "Worth building").
- **Progress card:** "Your battles shape the live meta," 12 / 15, a violet-to-pink bar, "Log
  3 more to personalize Teams and Counters. Anonymous results also help everyone."

**Decision**

- **Our sprites stay** (Travis, 2026-09-23): "We keep our sprites they look amazing. Size may
  be the only change we make to those." The design's cropped, zoomed sprites are a rendering
  artifact, not a direction. Sprite size per context is the only open sprite question.

**Fits the inventory**

- The team card keeps the order people liked (tags, Pokémon, explanation, cost, Analysis)
  and drops the cramped two-line difficulty reason (page 1).
- Verdict tags get their own colors, which fixes "every verdict chip is the same purple"
  (page 8).
- The progress card answers two page 4 items at once: it's a visible "contributing" meter,
  and its copy is honest that anonymous results are shared. It could replace the "never
  leaves this phone" explainer.

**Problems and conflicts**

- **The structure tag looks like a button.** "Balanced ABC" has a heavy outline, next to a
  filled "Strong fit." This is the tag-vs-chip rule from design 2: display tags must never
  look tappable.
- **The explanation became generic.** "Balanced coverage with a dependable answer to a bad
  lead" replaces today's specific sentence ("Morpeko leads and handles Tinkaton and Shadow
  Ninetales..."). The specific prose is a keeper (page 1); the card should show the real
  `explanation.why`, trimmed if needed, not a generic tagline.
- **The cost line dropped Candy** (255 Candy). Cost is a must-keep: Stardust, Candy, XL,
  Elite TM.
- **The difficulty reason is gone.** "Moderate to play" without its why ("Snorlax needs to
  bait one shield"). It could live in Analysis, but that should be a decision, not a loss.
- **The role legend** ("Lead opens the battle...") on the first card isn't shown. It's how PvP
  terms get explained on first use (a product rule).
- **"Built" isn't an existing verdict.** Today's verdicts are Ready to use, Worth building,
  Wait for better IVs, Needs rescan, Not eligible. If "Built" is meant to replace "Ready to
  use," that answers page 8's wording problem ("Ready to use" reading as meta strength). A
  decision to confirm.
- **The progress card mixes two things.** The 15-battle mark is personal (when your log
  weights your Teams and Counters). Community sharing starts from battle one. "Shape the live
  meta" as the title with a personal 12/15 meter blurs them.
- The violet-to-pink gradient uses pink, the "measured data" color from design 1, as
  decoration.

**Parked questions** (Travis, 2026-09-23: hold until the page designs)

- Rename "Ready to use" to "Built"? **Leaning Built.** Check against what the verdict
  actually means: IVs good and already at the league level. A Pokémon at level 18.5 that
  needs no power-up is "built"; one that needs Stardust is "Worth building."
- Keep the difficulty reason on the card, or move it to Analysis?

### Design 4: Common components, Navigation tab

Screenshot: `img/intake/d04-navigation.png`.

**What it sets**

- **Sub-page header:** "< Teams" back, centered title, two icon buttons (share, cog) with
  the same rounded-square shape.
- **Tab bar:** Teams, Counters, Collection, Your Meta (the same four).
- **Back behavior:** "Back returns to the actual origin and restores its filters, league, and
  scroll position."
- **Workflow jumps:** cross-feature actions get their own labels, such as "Edit team" or
  "View in Collection."

**Fits the inventory**

- The back and jump rules are exactly the inventory's app-wide finding (pages 3, 6, 7, 8):
  hard-coded backs become real backs, and "Build" / "Collection" style jumps become labeled
  actions ("Edit team" for Analysis to Build, which Travis confirmed is intentional).
- One icon-button shape in the header fixes the circle vs rounded-square mismatch (pages 1,
  3, 4).

**Problems and conflicts**

- **The tab bar icons and the cog are placeholders.** Club, diamond, dot and lines glyphs,
  and an emoji-style gear. Travis: keep our menu. The existing tab bar icons and SVG cog stay.
- **The share icon is an arrow (↗),** which usually means "opens elsewhere." Today's share
  icon (box with an up arrow) matches the phone's share sheet. Keep a share glyph for share,
  and reserve ↗ for the meta.pick3.gg link if we want one.
- **"Restores its league" needs care.** The league is one global setting today. If a player
  switches league on a sub-page and goes back, flipping it back would undo a choice they just
  made. Suggest: back restores filters and scroll; the league follows the player's latest
  choice.
- **Only the sub-page header is shown.** The top-level header (big title, no back, as on
  Teams, Counters, Collection, Your Meta) and the third style (back link above a big title,
  Who Beats X) aren't covered. The system needs exactly two: top-level and sub-page.
- **Not covered yet:** the settings entry point (one cog, never two, per page 8), the list
  filter icon, the cross-link between pick3 and meta, and how the tab bar changes if meta
  folds into the app (the open architecture question).

### Design 5: Common components, Feedback tab

Screenshot: `img/intake/d05-feedback.png`.

**What it sets**

- **Battle result buttons:** Win green, Loss red, Tanked amber. "Color supports the label.
  The three outcomes no longer look identical."
- **Saved feedback:** a toast-style row, a green dot, "Win logged," "13 with this team,"
  **Undo**.
- **Filters sheet:** a bottom sheet with a grabber, "Filters," Done, and toggle rows with
  one-line descriptions.

**Fits the inventory**

- It fixes page 5's two biggest problems: Win and Loss looked identical, and a mis-tap
  stayed forever with barely any feedback. Now each result is distinct, and the save is
  confirmed with an undo.
- Green and red match the W/L result strip (page 4) and the shield grid (page 5).
- The filters sheet is the "Filters and sort" destination from design 2, shown as a sheet.
  Where it opens per page is still a per-page decision.

**Problems and conflicts**

- **Undo needs work beyond the UI.** The code has no delete for a logged battle today, and a
  saved battle is shared right away (`shareSync()` runs after the save). The counter worker
  can only delete everything a device sent (`DELETE /battles`), not one battle. So Undo
  needs either a per-battle delete route in the worker (the battle id is already the
  de-duplicate handle), or holding the share for the few seconds the undo is offered.
  Product rule impact: none; this only removes data.
- **Green now has two meanings:** Win and "Worth building" (design 3). They sit on different
  screens, so it's minor, but the token names should say which is which.
- **Amber is shared** with warnings ("outside the meta," the stale-season card) and the
  "some" confidence tag. Tanked as a warning color is reasonable.
- **Not covered yet:** loading (today's staged progress bar with labels), errors (today's
  `.error` block), empty states ("No team fits these filters"), and confirm dialogs, which
  are native `window.confirm()` today (Take to battle, Start fresh, Forget, Remove). An in-app
  confirm would match the system.

### Design session notes (the rules behind designs 1 to 5)

As given by the design session:

1. Deep navy atmospheric canvas, with subtle color and depth rather than flat black.
2. Elevated cards with restrained borders and shadows.
3. Violet means interaction, selection, and navigation.
4. Pink means measured community data, not general decoration.
5. Green, red, and amber are reserved for meaningful outcomes.
6. Official sprites remain the main visual personality.
7. One consistent league picker, header, bottom navigation, filter control, sheet, and action
   hierarchy.
8. Dense screens use the same style with less decorative space, rather than switching to a
   separate utilitarian design.
9. Light mode keeps the same hierarchy and identity instead of becoming generic white UI.
10. Contribution progress is a first-class shared component, ready for Your Meta, Log a
    Battle, Counters, and community pages.

Next step from the design session: formalize the states of the five tabs, then apply them to
**Your Teams first**. Travis: page 1 adds some of the items listed as missing above.

**Cross-check against the intake**

- Rule 8 answers the 24px gutter concern (design 1): dense screens trim decorative space.
  Suggest writing that down as numbers (for example, 24px default, 16px on dense screens).
- Rule 4 vs design 3: the contribution bar's violet-to-pink gradient uses pink as decoration.
  Either the bar is measured data (then pink is right, and the whole bar should say so) or
  it should be violet.
- Rule 5 plus design 3's green "Worth building" and design 5's green Win: both count as
  "meaningful outcomes," so this is consistent with the rule, just two meanings for one color.
- Rule 6 matches Travis's decision: our sprites, size only.
- Rule 7 covers one header, but the top-level vs sub-page header pair still needs drawing
  (design 4).
- Rule 9: the Foundation light pass failed on headings. Light gets its own check before
  implementation.
- Rule 10: keep the personal threshold (15 battles, your Teams and Counters) apart from
  community contribution (every shared battle), or label clearly which one the meter shows
  (design 3).

**Carried into the page designs** (still open or not yet drawn)

- The two header types; one cog plus a separate filter icon; the pick3 to meta cross-link.
- Chips vs tags (tags compact and never button-like).
- Loading, error and empty states; in-app confirm dialogs.
- League picker scaling past three leagues (Tournament, cups).
- Parked: "Built" vs "Ready to use" (leaning Built); the difficulty reason on the card.
- Architecture: whether meta folds into the app. This decides the tab bar.

---

## Page designs

### Page 1: Your Teams, first pass

Screenshots: `img/intake/p01-teams-v1-1.png`, `p01-teams-v1-2.png`.

**What changed**

- **Header:** "Your Teams" big title with the meta and cog buttons, same shape. The "926
  Pokémon" count is gone.
- **League picker** with **"More leagues and cups >"** under it.
- **Context line:** "Great League teams / Current meta · Community weighting," beside a
  **Filters (2)** button with a sliders icon. The sideways pill row is gone.
- **"Make these teams personal" 12 / 15** card: "Log 3 more battles to weight teams by what
  you actually face. Anonymous logs also improve the live meta." It replaces the "Your log"
  chip.
- **Build your own team** row, plus a new **refresh** button beside it.
- **"Recommended for you," "Best first"** section heading.
- **Team card:** tags, difficulty, three sprites with roles, a specific explanation, the full
  cost (Stardust, Candy, Elite TM), and two explicit actions: **View analysis** (primary) and
  **Edit team** (secondary).
- **Footer:** "Teams are scored and simulated on this device."

**Answers inventory items**

- Tapping a card opened Build: now two labeled actions, View analysis and Edit team (page 1,
  design 4's workflow jumps).
- The sideways pills: gone, behind one Filters control with a count (Travis's direction).
- The settings cog and the filter control now have different icons (page 8's two-cog
  problem).
- League scaling: three live leagues plus "More leagues and cups" (page 1's open item).
- The "Your log" chip that sat off-screen: now a visible personal-progress card, clearly
  about *your* teams, with honest sharing copy (pages 1 and 4, design 3).
- The cost line has Candy again, and the explanation reads as specific prose again.
- Header button shapes match.

**Problems and conflicts**

- **Diamonds replaced the league shields.** Decided yesterday: shields stay.
- **The tab bar icons changed.** Decided: keep our menu. Our current icons stay.
- **"Balanced ABC" still looks like a button** (heavy outline). Tags must not look tappable
  (design 2).
- **The role legend is gone** ("Lead opens the battle. Safe Switch answers a bad start...").
  It's how Lead, Safe Switch and Closer get explained on first use (a product rule). It
  could be a one-time line, or tap-to-define on the role labels.
- **The footer lost its numbers.** Today: "12,345 combinations scored, 20 simulated with your
  exact Pokémon." This line is part of "every result carries its assumptions." Keep the
  counts.
- **A primary filled button on every card.** Two big buttons per team, repeated down the
  list, makes every card shout. Consider View analysis as the card's tap target or a lighter
  button, and keep one filled primary per screen. Also "Edit team" on card 1 vs "Edit" on
  card 2.
- **The first team is pushed far down.** Title, league, context and filters, more leagues,
  the progress card, the build row and a section heading all come before the first
  recommendation, the thing this page exists for. Options: make the progress card compact or
  dismissible, show it only under 15, or place it after the first team.
- **The refresh button is new and unexplained.** Recommendations re-run on their own when
  anything changes. What would it do?
- **Where are Source, Window and Team style?** The other session planned them as visible
  controls (with Source and Window matching meta's selects). Here, "Current meta · Community
  weighting" reads like a summary of Source and Window. Is it tappable, or is everything
  inside Filters? Team style would sit there too.
- **The difficulty reason is still gone** (parked question).
- **Not shown:** loading (staged progress), empty ("No team fits these filters"), error, no
  collection, and the Filters sheet itself.
- The progress bar still uses the violet-to-pink gradient (rule 4: pink is measured data).

**Questions for Travis**

1. Source and Window: visible selects like meta, or inside Filters with the summary line?
2. What is the refresh button for, or should it go?
3. Where does the progress card sit: above the teams, or below the first one?

### Page 1: Your Teams, second pass

Screenshots: `img/intake/p01-teams-v2-1.png`, `p01-teams-v2-2.png`. Travis gave the design
session some freedom to make it look good.

**What changed from the first pass**

- **League:** pills (Great with a shield, Ultra, Master) plus a **"..." overflow** for more
  leagues and cups.
- **"Built for your collection / Current meta · Community weighting"** and a lighter
  **Filters 2** text button with a sliders icon.
- **A hero card for the best team:** "01 BEST MATCH," the fit tag, the Lead sprite large and
  centered, Safe Switch and Closer lower on either side on an arc; **"Balanced ABC" as a
  dotted term** (tap to define) and "Moderate to play"; **the role legend is back**; the
  specific explanation; the full cost (Stardust, Candy, XL, Elite TM); **View analysis >**
  and **Edit team** as text actions.
- **The progress card moved below the best team.**
- **"More strong teams":** compact rows (overlapping sprites, the three names, "fit ·
  difficulty · Stardust," a chevron), with **"Build your own >"** in the section header.
- **The footer counts are back:** "12,345 combinations scored · 20 simulated using your
  exact Pokémon."
- The refresh button is gone. The tab bar icons look like ours again.

**Resolved from the first pass**

- The structure tag no longer looks like a button, and ABC now gets explained (the dotted
  term).
- The role legend is back (product rule: terms explained on first use).
- The footer assumption counts are back.
- Two loud buttons per card became two text actions on the hero only.
- The first team sits right under the filters; the progress card moved below it (answers
  question 3).
- A long list of identical cards became one hero plus compact rows (page 1's "reads as a
  wall").
- The refresh button question is moot.

**Problems and conflicts**

- **The league control changed to pills,** with a shield only on the selected one. Decided:
  shields stay and one shared league control everywhere (design 2 and 4, and the meta site
  uses the same one). The "..." overflow is a good answer for more leagues and should be kept
  on the segmented control: Great, Ultra, Master, "..." with all shields.
- **The hero puts the Lead in the middle.** Reading left to right gives Safe Switch, Lead,
  Closer, but order is the battle order everywhere else (Build, Analysis). Beautiful, but it
  breaks the one ordering rule. Options: keep the arc but put the Lead on the left, or keep
  the center Lead and number the roles (1, 2, 3).
- **Compact rows drop information** the current cards carry: roles and order, the
  explanation, Candy and Elite TM in the cost, and a direct Edit. Probably fine for teams 2
  and on if the row opens Analysis (which has Edit team), but that's a decision.
- **"Good fit" isn't a fit label.** The engine's labels are Strong, Solid, Situational, Weak.
- **Only three teams are shown.** Today the list shows every recommendation (often 10 or
  more). Is "More strong teams" the full list, or a top few with "Show all"?
- **"Built for your collection"** collides with "Built," the leaning rename of "Ready to use"
  (design 3). If "Built" becomes a verdict, this heading should use another word.
- **Question 1 is still open:** Source and Window as a summary line ("Current meta ·
  Community weighting") vs visible selects. Is the line tappable?
- **The progress card copy merges the two meanings again:** "weight teams by what you
  actually face and improve the live meta." The first pass said it better ("Anonymous logs
  also improve the live meta").
- **Not shown:** loading, empty, error, no collection, and the Filters sheet.

### Page 1: direction (Travis, 2026-09-23)

"Process is tough balancing design and functionality... I think the current page is pretty
good so maybe we err on the side of that and bring over the compactness this gives us."

**Keep / take list: approved by Travis, 2026-09-23**

Keep from the current page:
- The team card as it is: fit and structure, sprites in battle order with roles, the
  specific explanation, the full cost, the Analysis link. The first card keeps the role
  legend.
- The league segmented control with shields; the header; the footer counts.
- Build your own team as a visible row.

Take from the designs:
- The pill row goes; one **Filters (N)** button with the sliders icon, plus the one-line
  summary ("Current meta · Community weighting") of what the list is weighted by.
- A **"..."** segment on the league control for more leagues and cups.
- **"Balanced ABC" as a dotted term**, not an outlined tag.
- Two labeled text actions on a card: **View analysis** and **Edit team** (tapping the card
  no longer silently opens Build).
- The **personal progress card**, compact, placed after the first team, showing only until
  the log counts (under 15).
- **Compactness:** the first team as the full card, the rest as compact rows (sprites,
  names, fit · difficulty · Stardust) that open Analysis, with every recommendation still
  listed.
- **Source and Window stay visible as dropdowns** (Travis, 2026-09-23), the same two selects
  as meta.pick3.gg, not hidden in Filters. The page is compact enough now to give them room;
  revisit only if it's still too crowded. Order under the league control: the Source and
  Window selects, then the Filters (N) button. They need visible labels (inventory page 10:
  meta's "This meta" and "All" don't say what they are).
- **Option under consideration (Travis):** make every team an expandable row, with the first
  one expanded. The expanded row holds today's full card content, with View analysis and
  Edit team inside. Concern: it would look a lot like the meta Teams board. Notes:
  - Sharing one row family with meta is the cohesion goal from inventory page 10, so the
    likeness is mostly a plus.
  - Keep them apart by content, not shape. Your rows lead with fit, roles and cost to build
    (what *you* can field); meta rows lead with record and matchup score (what *others*
    ran), with pink as the measured-data mark (rule 4). Page titles differ too: "Your Teams"
    vs "Teams" on meta, the latter worth renaming (for example, "Community teams") if meta
    folds in.
  - Tap behavior should match meta: tapping a row expands it; actions sit inside.

### Page 2: Build Your Team, first pass ("Battle Workbench")

Screenshots: `img/intake/p02-build-v1-1.png`, `p02-build-v1-2.png`. The design session's
framing: focus on choosing a Pokémon while keeping the current lineup and role context
visible.

**What changed**

- **Header:** "< Teams," a large centered "Build Your Team," the cog.
- **League** segmented control (a shield only on Great, in the corner).
- **"Your lineup / Tap a Pokémon to edit it"** with **Find best order** (shuffle icon) in
  the section header.
- **A lineup strip:** three sprites in battle order with roles; the selected one ringed.
  "Drag to reorder, or let pick3 test all six orders."
- **One detail card for the selected Pokémon:** First · Lead, name, types, "Yours · IVs ·
  Level · IV rank," a **Role job** box, a **To build** box, the moves (F and C with move
  counts), "Move changes apply to this team only" and a **Moves** button, and a grip.
- **Complete team summary:** total cost and "Suggested picks are hidden once the lineup is
  complete."
- **Analyze this team** at the bottom.

**Answers inventory items**

- **"Find the best order" is out of place:** it now sits in the lineup header, next to the
  thing it reorders.
- **Losing track while picking:** a lineup strip that stays up top is the right tool, if it
  stays visible while the search is open (not shown yet).
- **Tap-a-card-for-moves only explained in the footer:** now a labeled Moves button and
  "Tap a Pokémon to edit it."
- **Long footer paragraph:** gone; the one-liners sit where they apply.
- **Teammate reason lingering:** "Suggested picks are hidden once the lineup is complete."
- The total team cost is new and useful.

**Problems and conflicts**

- **The filled cards with the type-colored fade are gone.** Travis's favorite part of the
  page (inventory page 2: keep; a candidate shared component). The detail card is plain. It
  should carry the type fade, and ideally stay the same component as today's card.
- **Three cards became one.** Today you see all three Pokémon's IVs and moves at once; now
  you see one and tap between them. That's a trade: less scrolling, but no side-by-side view.
  A decision for Travis.
- **The selection ring is pink.** Rule 3: violet means selection; pink is measured data.
- **Shields:** only Great has one, tucked in the corner. All three keep their shields, in
  the usual spot.
- **No Remove (X)** is visible for a slot.
- **The picking state isn't shown:** an empty slot, the search with Suggested picks, and
  where the lineup strip sits while the keyboard is up. This is the state page 2's main
  problem lives in.
- **Suggest teammates** (one or two slots filled) isn't shown.
- **Analyze this team is outlined,** not the filled primary from design 2's hierarchy. It's
  the page's one main action.
- **The header title is large and centered.** A sub-page header should be the standard
  size (design 4).
- **"dust" and lowercase "candy":** the app says "Stardust" and "Candy" everywhere else.
- Only the fast move has a type chip; charged moves lost theirs (today all three have one).

**Questions for Travis**

1. One detail card that switches, or all three cards (today's) with the lineup strip on
   top?
2. Want to ask the design session for the picking state (search open, keyboard up)?

### Page 2: Build Your Team, second idea (picking a slot)

Screenshots: `img/intake/p02-build-v2-1.png`, `p02-build-v2-2.png`. Keyboard not up yet; the
design session is working on the keyboard-up state.

**What it shows**

- **Lineup tiles** across the top: Mimikyu (Lead), Melmetal (Safe Switch), and a dashed,
  highlighted **"+ Closer"** tile for the slot being filled.
- **"Choosing Closer / Pick something that finishes after shields are gone."** The slot's
  role, explained in place.
- **Search** ("Search any Pokémon") under that.
- **"Best with your first two"** ("Owned Pokémon use your exact IVs"): one row per
  suggestion with sprite, name, types, a one-line reason ("Covers Dark and Fairy threats both
  selected Pokémon struggle with"), and a + to add it.
- A note: "Choosing something you do not own? pick3 assumes a top-10% IV spread and marks the
  cost as estimated."
- **Find order** and **Analyze when complete** (disabled) at the bottom.

**Answers inventory items**

- **Losing track of which slot you're filling** (Travis): the lineup stays in view, the
  target slot is highlighted, and "Choosing Closer" names it, with the role's job. This is
  the best answer yet.
- **Suggest teammates** becomes part of picking: the reasons show up exactly when you choose,
  instead of in a panel that lingered after the team was full.
- The role explanation doubles as the "explain PvP terms on first use" rule.

**Problems and conflicts**

- **It breaks the input layout rule** (CLAUDE.md and the memory note): input at the top,
  results under it, the slots those results fill under that. Here the slots sit *above* the
  input. There's a real case for it (the keyboard covers what's below the input, so slots
  above stay visible), but with the header, league, lineup tiles and "Choosing Closer" above
  it, the input lands mid-screen and the keyboard leaves room for about one result. Options:
  shrink the lineup to a thin strip of small sprites while searching, or scroll the input to
  just under that strip on focus. If the rule changes, update CLAUDE.md's rule and the memory
  note to match.
- **Travis's favorite Suggested grid is gone:** recent opponents plus top meta picks, about
  15 at a glance. Three reason rows show far fewer. Suggest: reason rows first ("Best with
  your first two," two or three), then the compact token grid of recent and top meta picks.
- **What shows for the first pick?** "Best with your first two" needs two Pokémon placed. With
  an empty board, it should fall back to the recent and top meta grid.
- **Which suggestions are yours?** "Owned Pokémon use your exact IVs," but no row says which
  are owned. Today's grid has a "yours" tag.
- **The first suggestion has a pink border.** Pink is for measured data (rule 4).
- **Find order moved back to the bottom,** beside Analyze. The first pass put it in the
  lineup header, which was the better answer to "out of place."
- Shield only on Great again; the title is still oversized for a sub-page.
- Matches the engine: suggestion reasons exist today (`fills[].line` in
  `TeammateSuggestions.tsx`), so this is buildable from current data.

**Combining the two passes** (for Travis to confirm)

- Pass 2's picking flow: lineup tiles, "Choosing <role>" with the role's job, search, reason
  rows, then the recent and top meta grid.
- Pass 1's lineup header with Find best order, the total team cost, the Moves button and
  labeled one-liners.
- Today's filled card with the type-colored fade for each placed Pokémon (the open question:
  one card that switches, or all three).
- **Decision (Travis, 2026-09-23):** the Pokémon side by side in the lineup, with **one
  detail card** for the selected one (pass 1's layout), over today's three stacked cards.
  "Uses the space better." The detail card should still carry today's type-colored fade.
- Waiting on the keyboard-up search render before settling the picking flow.
- **Superseded (Travis, 2026-09-23, after looking again):** keep the current Build page.
  Today's stacked cards (one per Pokémon, with the type-colored fade) and today's search stay.
  **The one change taken from the designs: Find best order moves to the top**, into a header
  above the cards (pass 1's "Your lineup ... Find best order"). The one-card lineup and the
  pass 2 picking flow are not being adopted.
- Small, optional takes that fit the current page without changing its layout (not decided):
  a "Choosing <role>" line with the role's job above the search, a "yours" tag kept on
  suggestions, the total team cost, the teammate reason hidden once the team is full, and
  "Stardust"/"Candy" wording.
- **Taken (Travis, 2026-09-23):**
  - **"Choosing <slot>"** with the role's job above the search ("Choosing Closer: pick
    something that finishes after shields are gone").
  - **Total team cost.**
  - **Suggestions run on their own, below the fold.** The "Suggest teammates" button goes;
    when one or two slots are filled, the reason rows ("Best with your first two") appear
    under the cards without a tap, and the search's recent and top meta grid stays as it is.
    Notes: the suggestion comes from the matchup matrix (no simulation), so running it on
    every pick change is cheap; today the first offer is also written into the empty slots
    (`TeammateSuggestions.tsx`: "the first offer is already in the slots"). An automatic run
    should only suggest, never fill slots on its own.
  - **Adding a suggestion (Travis):** each suggestion row gets an explicit **+ Add** that
    moves it into the empty slot (as drawn in design pass 2). Tapping anywhere on the row
    could do the same. Recommendation: the whole row adds it, with the + as the visible cue,
    since the row has no other action. Keep the tap target 44px or taller, and confirm with
    the "Choosing <slot>" line updating to the next empty slot.

### Page 3: Team Analysis, first pass (progressive disclosure)

Screenshots: `img/intake/p03-analysis-v1-1.png` to `-4.png`. The design session: "one score,
immediate battle plan, key matchups, then expandable Pokémon details, alternatives,
assumptions, and the full matchup grid."

**What it shows**

- **Header:** "< Teams" (real back), share, cog. **"Edit team →"** under the team tiles.
- **Team tiles:** three sprites with roles (Lead highlighted).
- **Team score card:** "TEAM SCORE 90.8," Strong fit, "Ready to run. This balanced team has
  an answer to 46 of 48 meta Pokémon," "1.8 points above your next best team. Custom team,
  using your exact IVs and chosen moves," "Run it in this order," **Take to battle**.
- **Jump buttons:** Battle plan, Matchups, Pokémon, Details.
- **Battle plan** ("What to do first"): Start with Mimikyu (lead job plus the Disguise
  note), Switch with a purpose ("Against Furret or Vigoroth, switch to Melmetal. It wins
  comfortably."), Close with Greninja.
- **Matchups to remember:** a key win card and a biggest threat card side by side.
- **Why this team works.**
- **Pokémon details** ("Tap to expand"): one row per Pokémon (name · role, rank tags or
  "Chosen moves · owned"), the first expanded: types and a "Your IVs" tag, the moves with
  counts and TM, then one paragraph with shield and safe types, your IVs and build cost.
- **Alternatives you own.**
- **Assumptions and matchup grid**, collapsed ("12 of 46 shown").

**Answers inventory items**

- **"It's a lot"** (Travis): it layers the page (summary, plan, key matchups, then detail on
  tap) and keeps every section, the answer the inventory asked for.
- **No summary or jump-to:** a score card up top and four jump buttons.
- **Two scores:** one team score.
- **Back said Build:** back is "< Teams," and editing is the labeled "Edit team →" (design
  4, and Travis's read-then-edit flow).
- **Repeats:** fit, structure and difficulty appear once; key wins and threats merge into
  "Matchups to remember"; the switch advice moves into the battle plan.
- **Take to battle** is in one place for recommended and custom teams.

**Problems and conflicts**

- **Which score is "the" score?** It shows 90.8, which is `score.total` (the weighted blend
  with cost and accessibility). The custom rating card today shows `score.battle` (90 / 100
  "in battle"). A decision for Travis: total (includes cost), or battle strength only.
- **The battle plan includes lines the engine doesn't write.** "Preserve one shield if you
  can" and "Avoid spending it early into Fairy pressure" are invented. The real inputs exist:
  `roleWhy`, `formNote` (Disguise), `switchPlan` (switch to X, wins comfortably),
  `keepShield`. The plan must be built from those, or new engine lines added and tested.
- **The type chips became prose.** "Shield Ghost and Steel attacks. Normal, Fighting, Bug and
  Dragon are usually safe" replaces colored type chips. In battle, colored chips are faster to
  read than a sentence. The shield strategy should stay as chips.
- **Detail lost from the Pokémon card:** move type chips, the "extra damage on N, resisted by
  N" reads, the Shadow and Lucky flags, and the "+N more" safe types.
- **"When to switch" shrank to one line.** Today it lists up to eight threats to the lead and
  who answers each. The battle plan names two; the full list needs a home (under Matchups or
  Details).
- **Only one key win and one threat are shown.** Today there are several of each.
- **Not visible:** Team structure (the three "beats 35 of 48" tiles, or the ABB block), the
  score breakdown (coverage, consistency, safety, cost, accessibility), and the move-count
  explanation ("7-6-6" is still never explained, now with the explanation gone entirely).
- **"Your IVs" is styled like the type chips.** A tag that means "owned" shouldn't look like a
  type. The type chips also lost their type colors here.
- **Pink again:** the Lead tile's pink border (rule 3: violet is selection).
- The team tiles duplicate the Pokémon details rows below; fine as navigation if tapping a
  tile opens that Pokémon's row.

**Suggested direction** (Travis's pattern so far: keep the current content, take the
structure)

- Take: the score card with Take to battle, the jump buttons, the battle plan (built from
  engine data only), "Matchups to remember," Pokémon details as expandable rows, a real back
  plus "Edit team."
- Keep from today: the shield/safe type chips, move type chips and extra-damage reads, the
  full When to switch list, Team structure, the score breakdown, the move-count explanation
  next to the first move count, and every key win and threat (collapsed after the first).

**Decision (Travis, 2026-09-23):** the split above is **locked in**. The headline score
(total 90.8 vs battle 90) is still open.
- **Headline score (Travis, 2026-09-23):** "Team score should not include your cost to make
  it. It should be based on its competitive nature." So the headline is `score.battle`
  (coverage, consistency, safety; `packages/engine/src/score/score.ts`), which is also what
  the fit label comes from. Not `score.total`, which adds cost and accessibility.
  - Follow-up: the recommendation list is sorted by `score.total`
    (`packages/engine/src/recommend.ts`), so a cheaper team can sit above a team with a
    higher headline score. Either sort by battle score, or say what the order means ("Best
    for your collection" vs "Strongest"). A decision for Travis.

---

## Landing page (already redesigned, the reference)

Screenshots: `img/intake/landing-1.png`, `landing-2.png`. Travis: already done, and he loves
it. "That's what started this." It's the source of the design language the component pages
carry into the app ("the welcoming home-page style, tightened for dense battle data").

What it establishes, and the component rules already agree with it:

- The atmospheric navy and violet canvas with a scene (trees, a Poké Ball arc).
- Sprites large and front and center (Pikachu, Bulbasaur, Charmander).
- **Pink for measured community numbers** ("Recently logged": Cramorant 14%, Tinkaton 13%,
  Melmetal 11%): rule 4 in use.
- One filled violet primary per card ("Explore the live meta," "Import your collection") and
  an outlined secondary ("Add a few by hand").
- The league as a small tag with its shield.
- Honest one-line privacy: "Runs on your phone. Your collection never leaves it."
- The trainer counter.

This covers the first screen of the first-run flow. Import and Report were not inventoried
and have not had a design pass.

---

## Sheets

### Settings sheet, first pass

Screenshot: `img/intake/sheet-settings-v1.png`.

**What it shows**

- The sheet header: grabber, a centered "Settings," Done.
- **Import a new CSV** promoted to a highlighted card at the top: "Update or replace the
  collection stored on this device."
- **Four drill-in rows**, each with an icon and a live summary line:
  - Your data: "809 Pokémon · 12 battles · 1 excluded."
  - Community: "Battle sharing on · anonymous."
  - Appearance: "System theme · Pokémon pictures on."
  - About: "PvPoke data Sep 10, 2026 · build 874d675."
- **Forget my collection and log** in red, then "Your collection stays on this device."

**Answers inventory items (page 9)**

- One long drawer, nine topics: now four groups plus two actions, and the section titles are
  real rows.
- Redundancy: the team filters (moving to each screen's Filters sheet), the league, and the
  meta link are gone.
- Text walls: one summary line per group; the detail moves a level down.
- Import buried at the bottom: it's first now.
- The summary lines show the current state without opening anything (sharing on, theme,
  data date).

**Problems and open items**

- **The four sub-pages aren't drawn.** They hold everything that must stay:
  - **Your data:** Use your log (toggle and count), Start fresh, Export log, Import log, the
    excluded Pokémon list with remove.
  - **Community:** Share your battles (toggle; off deletes what this phone sent), "What's
    sent?" on tap, and the rank band if it survives.
  - **Appearance:** System / Dark / Light, Pokémon pictures.
  - **About:** PvPoke data and commit, Check for updates, error reports toggle, diagnostics
    (Copy), credits and Source, **the trainer counter** (must keep, not on the hub).
- **Navigation inside a sheet:** drill-in rows need a back control within the sheet (title
  changes, "< Settings"), and Done closes from any level. That's a new pattern for the system.
- **One more tap for sharing.** The toggle moves a level down. Fine, since it's set once.
- The Forget button's red outline must stay behind a confirm (today `window.confirm`; an
  in-app confirm would match, design 5 note).

### Move picker sheet, first pass

Screenshots: `img/intake/sheet-moves-v1-1.png`, `sheet-moves-v1-2.png`. Checked against
`apps/web/src/components/MovePicker.tsx`.

**What it shows**

- Header: the sprite, "Melmetal moves," Done; "Changes apply to this team only."
- **A Recommended set box:** "Thunder Shock · Double Iron Bash · Dynamic Punch."
- **Fast move, "Pick one":** rows with name, type tag, "Recommended · TM," and a violet check
  circle.
- **Charged moves, "Pick two":** rows with name, type tag, Elite TM tag, a **"Changed"** tag
  on a swapped-in move, the move count ("4-4-4 Thunder Shock"), effect text ("Lowers your
  Attack and Defense"), and check circles.
- A note: "Selecting another charged move replaces Rock Slide, your most recent change."
- **"How move counts work"** (expandable), **Reset to recommended moves.**

**Matches the code**

- One fast move (radio), charged as checkboxes, move counts from the chosen fast move, TM and
  Elite TM badges, effect notes, alternate types, Reset to recommended (disabled when nothing
  changed), and changes scoped to the team.

**New, and buildable from current data**

- The Recommended set box and a "Recommended" label per move (`pool.recommended`). Today's
  sheet only shows the moves as a comma list.
- A **"Changed"** mark on moves that differ from the recommended set.
- **"How move counts work":** finally explains "4-4-4" where it first matters (inventory
  pages 3 and 8).

**Conflicts with the code**

- **Which move gets bumped.** The note says a third charged pick replaces "your most recent
  change." The code replaces the one picked *first* (`value.charged.slice(1)`), so with
  Double Iron Bash and Rock Slide selected, picking Superpower drops Double Iron Bash, not
  Rock Slide. Travis's call: the design's rule (keep the older, usually recommended move) is
  arguably friendlier; if chosen, change the code, not just the note.
- **"Pick two" vs "pick one or two."** The code allows one charged move and won't untick the
  last one. The label should say "one or two," or the rule changes.
- **"slower energy gain"** on Metal Claw isn't something the app computes today. Either drop
  it, or derive it from the move's energy per turn and test it.
- **"Changed" is pink.** Pink is measured data (rule 4). Violet or neutral fits better.
- **The type tags are large outlined pills,** bigger than today's small type chips (the
  tag scale rule from design 2).
- **Decision (Travis, 2026-09-23):** no automatic bumping. With two charged moves selected, the
  player unticks one before picking another. Neither the design's "replaces your most recent
  change" nor today's "replaces the first pick" survives. Build notes: at two selected, the
  other charged rows go disabled with a one-line hint ("Untick one to pick another"); the
  last charged move still can't be unticked (a Pokémon always runs at least one), so the
  label reads "Pick one or two." Changes `toggleCharged` in `MovePicker.tsx`, and its tests.
- Brief for the four Settings sub-pages sent to the design session (2026-09-23); the text
  is in the chat. Covers Your data, Community, Appearance, About, and navigation inside the
  sheet.

### Settings sub-pages and the confirm sheet, first pass (2026-09-24)

Screenshots: `img/intake/sheet-yourdata-v1.png`, `sheet-community-v1.png`,
`sheet-about-v1.png`, `sheet-confirm-v1.png`. Your data and Community render dimmed in the
screenshots (a capture or transition artifact, not a design choice). Appearance not shown.

**Navigation inside the sheet:** "< Settings," a centered title, Done. As briefed.

**Your data:** Collection (809 Pokémon, 283 kinds, last imported) with the Import a new CSV
card; Your log (Use your log toggle with "12 logged this season," Start fresh in Great
League with "Nothing is deleted," Export log / Import log, "Files stay under your control");
Excluded Pokémon (Snorlax, "Include again"). Everything the brief listed is there.

**Community:** Share your battles toggle with "Anonymous battle records build the community
meta" and "Turning this off also deletes what this phone sent"; What's sent? (collapsed);
Open meta.pick3.gg. The rank band is gone, as briefed.

**About:** Game data (PvPoke date and commit, 48 Pokémon), build and date with Check for
updates, the one-line privacy statement with "What leaves it?", the error reports toggle,
diagnostics with Copy, credits and Source, the trainer counter at the bottom. Every must-keep
from inventory page 9 survives, and the three privacy explanations are now one line plus one
tap.

**Confirm sheet:** a small bottom sheet: the question as the title ("Start fresh in Great
League?"), one line on what happens, and two labeled buttons ("Keep this season," "Start
fresh"). A good pattern to replace every `window.confirm()` (Take to battle, Start fresh,
sharing off, Forget, Remove).

**Problems**

- **Start fresh is shown in red, but it deletes nothing.** Red should mean "this destroys
  data" (Forget, sharing off, Remove). Start fresh only moves battles to Earlier seasons, so
  its confirm button should be violet, and "Keep this season" should be the quieter option.
  Otherwise red stops meaning anything.
- **"48 Pokémon" lost its label.** Today it reads "Opponent meta: 48 Pokémon"; alone on the
  right it's unclear.
- **The deletion warning is always red,** even while sharing is on and nothing is happening.
  It's a fact about the toggle, so neutral text is enough; keep red for the confirm when the
  player actually turns it off.
- **"Poké Genie":** the app's name is "Poke Genie" (their spelling, no accent).
- **Not drawn:** Appearance, the expanded What's sent? and What leaves it?, the Check for
  updates result, the Import log result, and an empty Excluded list.

---

### Log a Battle (2026-09-24)

Travis ran a design pass and judged the **current page better**. Keep today's layout. The
component-level decisions still apply to it: distinct Win / Loss / Tanked colors and the
"Win logged ... Undo" feedback (design 5), which needs the per-battle delete or delayed share
noted there.

### Page 4: Your Meta, first pass

Screenshots: `img/intake/p04-yourmeta-v1-1.png` (under 15), `-2.png` (lists),
`-3.png` (15 or more, log active).

**What it shows**

- **Header:** "Your Meta," meta and cog buttons (same shape), the league control, and a
  progress line: "12 of 15 battles / 3 more until your log personalizes pick3" with a bar.
  At 15 or more: "27 battles this season / Your log is weighting Teams, Counters and Build,"
  full bar.
- **A status card:** under 15, "Your battles improve two metas: Your log personalizes Teams
  and Counters. Shared anonymous results help measure what everyone faces," with How it
  works. At 15 or more, "Your meta is active: Recommendations now reflect what you actually
  face," plus a **pink "27 anonymous battles also contributed."**
- **Current team:** sprites, "10-2 since Sep 21" (or "18-8-1" W-L-T), a colored W / L / T
  strip, Log a battle, Change team, Share this team.
- **"See what everyone else is facing: Community teams, species and measured trends"** (after
  15: "See the community meta: Compare your field with everyone else's").
- **Most faced:** "12 battles," the season name, a Most faced / Worst record switch; rows
  with sprite, name, "Faced 5," record, **"Who beats it >,"** and "Outside PvPoke's 48" in
  amber.
- **Earlier seasons (2 >).**
- **Footer:** "Your collection stays on this phone. Battle sharing is on and anonymous. Manage
  sharing in Settings."

**Answers inventory items (page 4)**

- **"Contributing" is finally shown,** and kept apart from the personal threshold: the 15
  battles are about *your* recommendations, while "27 anonymous battles also contributed" is
  the community side, in pink (rule 4: measured community data). This answers the page 4
  question and the rule 10 concern.
- **The trust issue is fixed:** "Your log never leaves this phone" is gone; the footer says
  sharing is on and anonymous, and where to change it.
- **Stale copy fixed:** "by league and rank" is gone.
- **Rows to Counters:** an explicit "Who beats it >" instead of a lone chevron.
- **"outside the meta 48":** now "Outside PvPoke's 48," which says what the 48 is.
- **The season name** sits next to the list it scopes.
- W / L / T colors match the result buttons (design 5).

**Problems**

- **The share bars still look like clipped cards.** The rows are drawn with the background
  cut at different widths (Tinkaton wide, Snorlax narrow), which is the exact complaint from
  the inventory. The bar should be a thin bar inside a full-width row.
- **The league shields are gone again.** Decided: shields stay.
- **Button hierarchy:** Log a battle is outlined, not the filled primary (it's this page's
  main action), and "Share this team" is a large text link. Still three styles in one card.
- **The heading and the switch repeat each other:** "Most faced" is the heading and a switch
  option. When Worst record is picked, the heading must follow it (the existing bug), or drop
  the heading and let the switch name the list.
- **Progress is said twice under 15:** the header bar ("3 more until your log personalizes
  pick3") and the card ("Your log personalizes Teams and Counters"). The card could carry
  only the community half, or merge into the header.
- **The status card stays forever.** Today's explainer can be dismissed. Once the log is
  active, the card could shrink to the pink contribution line.
- **"27 anonymous battles also contributed"** must count battles actually sent (the share
  stamp), and read differently when sharing is off (for example, "Sharing is off").
- **Record format:** "18-8-1" adds tanked battles as a third number. Today the record leaves
  tanked out. Fine if intended; the strip already shows T.
- Amber "Outside PvPoke's 48" is still loud on every such row.
- The meta-merge question isn't touched: community stays a link out. That keeps options open.
