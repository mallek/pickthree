# Play redesign: Your Meta, Log a Battle, New Set, editing a logged battle

Date: 2026-09-26. Status: design approved in chat (Travis), spec awaiting review.

Piece 3 of the design program (piece 1: `2026-09-24-design-foundation-design.md`; piece 2:
`2026-09-25-design-core-flow-design.md`, both signed). Inputs:

- Inventory: `docs/design/inventory/2026-09-22-inventory.md`, page 4 (Your Meta) and page 5
  (Log a Battle).
- Intake: `docs/design/inventory/2026-09-23-design-intake.md`, "Page 4: Your Meta, first pass",
  "Log a Battle (2026-09-24)", design 5 (Feedback: result colors, saved feedback) and the confirm
  sheet notes.
- The Your Meta render approved in chat on 2026-09-26 (DOM surgery on the live page).

## Goal

Rebuild the play loop (pick a team, log battles, read your meta) on the foundation's tokens and
components; show what the player's battles contribute; let a logged battle be corrected; and
make logging from memory faster. Each page passes the audit and Travis signs its record.

## Decisions (Travis, 2026-09-26)

- **Phone first.** Log a Battle is polished for after-battle entry on the phone. On a wide screen
  the opponent card sits beside the search and slots instead of below them; no separate desktop
  design.
- **Likely teammates in Log a Battle:** "Add it."
- **Tanked means the opponent quit or brought throwaway Pokémon** ("Tanked is not me tanking. It's
  the person I play either quit or had 10cp pokemon"). The record is wins and losses only
  ("10-2"); the strip still shows each tanked game. Tanked battles stay out of the personal
  weighting and the community meta, as the code already does.
- **Contribution shown:** "Sounds good" to one pink measured line for battles in the community
  meta, progress to 15 said once in the header, the explainer dismissed once.
- **Fix a logged battle by editing it, results and opponents:** "I think we just allow the edit
  on the result. No need to undo then", then "Let's do two" (edit opponents as well). No Undo
  button and no delete.
- **New Set is in this piece:** "Let's include it."
- One plan for the piece, one audit record per page, signed separately.

## Your Meta

Top to bottom (the approved render):

- **Header:** `Header variant="top"`, "Your Meta", the meta.pick3.gg and settings `IconButton`s;
  the league switcher with its shields.
- **Progress, once:** under 15 counted battles, "N of 15 battles · M more until your meta weights
  Teams, Counters and Build" with the bar; from 15, "Your meta is weighting Teams, Counters and
  Build · N battles this season" with a full bar. Log switched off in Settings: today's state line,
  no bar. Nowhere else on the page repeats it.
- **Contribution line:** a `MeasuredLine` (pink, with its dot): "N of your battles are in the
  community meta", where N counts battles with a share stamp that are not tanked, all leagues and
  seasons. Sharing off: plain `.meta` text "Sharing is off" with a Settings link, never pink. Zero
  sent with sharing on: "Your battles join the community meta as you log them" in plain text.
- **Explainer:** shown until dismissed, as today, with corrected copy: once you log 15 battles,
  Teams, Counters and Build weigh opponents by how often you face them; your collection never
  leaves this phone, and battle records are shared anonymously unless you turn sharing off. After
  dismissal only the lines above remain.
- **Current team card:** the three sprites and names, "since <date>"; the record in wins and
  losses ("10-2"), tanked left out; the W / L / T strip, each result a button that opens that
  battle for editing (Log a Battle's edit mode); a hint "Tap a result to fix it"; **Log a battle**
  is the page's one primary `Button`, full width; Change team and Share this team are text
  `Button`s on one row. No team running: today's "No team picked" card with its Start button as
  the primary.
- **Link out:** one line, "See what everyone else is facing ›", to meta.pick3.gg.
- **Faced list:** a `Seg` (Most faced / Worst record) names the list; no heading repeats it. Beside
  it, the season name and the count ("Twilight Trails · 11 battles"). Rows are full width on the
  card surface with a thin frequency bar inside the row (not the row's background), the name,
  "faced N", the record, and "Who beats it ›" (to Counters). A species outside PvPoke's meta group
  gets a small mark after its name, explained once under the list: "Outside PvPoke's 48: logged
  here, simulated on this phone." The loud amber pill goes.
- **Your teams** (past sets) as today; **Earlier seasons** collapsed as today; the stale season
  card as today, its Start fresh confirmed through `ConfirmSheet` with the default tone (it deletes
  nothing).
- **Footer:** "Your collection stays on this phone. Battle sharing is on and anonymous; change it
  in Settings." (sharing off: "Battle sharing is off; change it in Settings.")

## Log a Battle

Today's layout stays. Changes:

- **Header:** `Header variant="sub"`, "Log a Battle" (edit mode: "Edit battle"), back to where the
  player came from; the team strip under it as today.
- **Input first:** the search at the top, its results directly under it, then the three opponent
  slots (the input rule). The search no longer slides under the sticky header once the card opens.
  "Search any Pokémon".
- **Likely teammates:** once one opponent is in a slot, the suggestion row leads with "Often with
  <name>: ..." listing up to six species most often seen on teams with it on the community team
  board (the pairs that include it and their thirds, ranked by sightings), skipping species already
  in a slot. The read is the existing `communityCores` board fetch (one per league per session,
  the whole board, never a query naming the opponent), so it follows the sharing switch and fails
  silent: no board, no row, the rest of the page unchanged.
- **The in-battle card** keeps its content (moves, counts, effectiveness, shield grid, verdicts,
  the unranked note); it moves onto tokens and shared parts so it passes the audit.
- **Result buttons:** Win (`--win`), Loss (`--loss`), Tanked (amber), each labeled, colors that
  support the labels. Tanked carries a `Term`: "They quit or threw. It stays in the log but counts
  for nothing." The always-visible explanation line goes.
- **After saving:** the slots clear and a short `Toast` reads "Win logged · N with this team"
  (Loss, Tanked likewise). No Undo.
- **Edit mode** (opened from a result in Your Meta's strip, route carries the battle id): the
  battle's opponents fill the slots and its result is selected; the primary button reads "Save
  changes"; saving replaces that battle's opponents, result and tanked flag in the set, clears its
  share stamp so the next sync resends it, and returns to Your Meta. The team and time do not
  change.
- **Wide screens** (at and above the width where the card fits beside the list, set in the plan):
  the in-battle card sits in a column beside the search, results and slots.

## New Set

- **Header:** `Header variant="sub"`, "Pick Your Team", back labeled Cancel, returning to where the
  player came from.
- **Input first:** the search at the top, its results directly under it, then the three slots.
  "Search any Pokémon".
- **From pick3:** the top recommended teams, each row reading like Teams ("88 · Strong fit");
  tapping one fills the slots. **Recent teams** as today. Both lists hide while searching (they
  are shortcuts).
- **Start set** is the page's one primary `Button`, disabled until three are picked.

## Editing a logged battle: data and the counter worker

- The web app's battle records (`LoggedBattle` in a set) gain an edit path in the store:
  `editBattle(setKey, battleId, { opponents, result, tanked })` replaces those fields, clears
  `sharedAt`, saves the set, and runs the share sync. No new record, no new id.
- The counter worker's ingest (`workers/counter/src/index.ts`) changes from `INSERT OR IGNORE` to
  an upsert on its `key` (`device:id`): a resent battle updates `opponents`, `result`, `tanked`
  and `received`; the team, league, season and time stay as first stored. Only the same device's
  records can change, since the key includes the device id. Counts (`stored`) count updates too.
- Privacy: an edit sends the same anonymous fields as the first send. Nothing new leaves the
  phone.

## States

Your Meta: log off; under 15; 15 or more; explainer shown and dismissed; no team running; team
with no battles yet; sharing on with N sent, on with none sent, off; empty faced list; Worst
record sort; earlier seasons; stale season card. Log a Battle: no team running (redirects to New
Set, as today); empty; searching; one to three opponents; likely teammates present and absent;
card loading; card; saving; saved toast; edit mode. New Set: empty; searching; from pick3 empty
(no collection or no recommendation yet); ready.

## Testing

- Store: `editBattle` replaces the fields, clears the share stamp, keeps the id, team and time;
  the next sync resends it.
- Worker: a resent battle with the same key updates result, tanked and opponents, and a different
  device's record with the same battle id is untouched.
- Contribution count: stamped, not tanked, all leagues; sharing off and zero-sent variants.
- Likely teammates: ranking from pairs and thirds, skips slotted species, absent when the board is
  null.
- Your Meta: progress said once; the record leaves tanked out; the list heading follows the sort
  (the switch names it); a result chip opens edit mode for that battle.
- Log a Battle: result colors and the Tanked `Term`; the saved toast text; edit mode fills and
  saves; the search stays below the header with the card open.
- New Set: input first; lists hide while searching; the From pick3 row reads the number.
- `web:screens` captures in both themes, joining `AUDIT_ENFORCED`: Your Meta (under 15, and 15 or
  more), Log a Battle (empty, card open, likely teammates, saved, edit mode, a wide viewport), New
  Set (empty, searching).

## Done for piece 3

For each page: the tests above pass; `npm run web:audit` is clean for its enforced screens in
both themes; `docs/design/audits/<your-meta|log-battle|new-set>.md` records screenshots, both
checklists, findings and fixes; Travis ticks its sign-off. The piece is done when all three are
signed.

## Out of scope

Collection, Counters, Who Beats X and the Settings sheet (piece 4); meta.pick3.gg (piece 5); a
per-battle delete; syncing logs between devices; the app-wide 12px to 13px supporting text pass.
