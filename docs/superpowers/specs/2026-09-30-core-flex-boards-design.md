# Core + flex cup boards (engine)

Extends `2026-09-30-cup-team-boards-design.md`. The cup boards showed five whole teams per image. The
data says a cup's top teams share a pair and differ in one slot, so the boards should show that:
a two-Pokemon **core** and a handful of near-tied **flex** picks for the third slot. This spec covers
the engine and the post text. The image template comes from the design agent's core + flex export and
is wired in a later change.

## What the data showed (Mega Color Cup, Great League, Mega Edition)

- The raw top 12 trios of Mega Color Cup all contain Kingdra (Shadow) and Magnezone (Shadow); the third
  Pokemon is within about a point of each other. Rows 3 to 5 of a variety-capped team board were ranked
  370th to 600th of 34,048 trios (a cliff).
- Among the top 50 trios that contain a Mega, the non-Mega pair is nearly constant and the Mega varies
  (18 distinct Megas). A Mega's second-best pair is far weaker than its best.
- A Mega can also be part of a core: Kingdra (Shadow) + Chesnaught Mega has four near-tied thirds.

## Rules

1. **Core.** An unordered pair of two Pokemon. A Shadow or Mega counts as its base species for every
   rule below. No lead, switch or closer is shown or implied.
2. **Row.** One core plus up to 4 flex options. Each flex option is a distinct third Pokemon (by base
   species) that completes a legal team with the core. Flex options are listed best first; the best
   flex completes the row's headline team. The row's strength and "Watch for" line are those of the core
   plus the best flex only, and are never applied to the other flex options.
3. **Selection.** Walk the legal trios strongest first. The first trio not yet shown starts a row. Of
   its three pairs, the pair with the most flex options within the window is the core (ties: the pair
   whose sorted base-species key sorts first, so results do not depend on input order). Flex window:
   1.0 strength points below the row's best trio for regular thirds, 2.0 when the thirds are Megas.
   Rows are added until there are 5.
4. **Variety.** The cap is two rows per base species **as a core member**. Flex options are free. Two
   rows may not have the same core (same base-species pair). No completed team is shown twice, as a
   headline or as a flex.
5. **Mega boards.** Only teams with exactly one Mega are considered (the ruleset allows one Mega). So a
   core with no Mega has Megas as its flex (up to 4), and a core containing the Mega has regular thirds
   as its flex. Both row types can be on one board. A row reports which kind its flex is.
6. **Top and Budget boards.** Same rules with no Mega filter. Budget uses the pool with no Elite TM moves.
7. **Fewer than four options.** A row shows what qualifies; it is never padded.
8. **Honest rows.** The same rule as before: a species whose moveset differs from the shipped matrix row
   is re-simulated before scoring, so the moves shown are the moves scored.
9. **Post text.** `post.md` lists each core once and each flex option with its own pick3.gg link (the
   whole team of three with moves), and says the number is a projection. `teams.json` records every row,
   flex option, strength, link, and the run's weight source and counts.

## Out of scope

The template, fill and capture (they follow the design agent's export), the Mega icon, any usage or
trend signal, and changes to the counter worker.
