# Ranking the community meta: teams first, one blended list

Date: 2026-09-18. Status: approved in chat (Travis), brainstormed the same day. Supersedes the
"two sources, and the rule that keeps them apart" section of `2026-09-18-meta-site-design.md`, and
the CLAUDE.md rule that mirrors it.

## Problem

The site as built answers "how good is this Pokemon on its own". Travis wants it to answer "what
three should I use", the way a decklist site does. Three concrete gaps:

1. **The front door is the species list.** A visitor's first screen is Pokemon ranked in a vacuum,
   not teams.
2. **Half the data is discarded.** `summarize()` builds team rows from `r.team` only, the reporter's
   own three. The teams they faced are already in the store, in `r.opponents`, and are thrown away.
3. **The two sources flip rather than blend.** PvPoke's curated list leads until 300 counted battles
   and 5 devices, then the measured list takes over wholesale. At 299 battles the measured data is
   worth nothing and at 301 it is worth everything, and neither was ever true.

## The shape of the answer

One ranked list everywhere, blended continuously from a prior and from measured play, with the
Teams board as the front door. The threshold does not move, it dissolves: the number it used to
gate on becomes the number in the formula.

## The blend

One formula, three uses. It is `packages/engine/src/yourmeta/blend.ts`, already shipped and tested
on device.

```
value = (1 - a) * prior + a * measured
```

`a` is how much of the say the measured data has earned.

### Species ranking

```
a = min(battles / (battles + 300), devices / (devices + 5))
weight = (1 - a) * pvpokePrior + a * measuredShare
```

`pvpokePrior` is `facingWeight(rank)`, the `1 / sqrt(rank)` already in `gamedata/metaRank.ts`,
normalized over the list. `measuredShare` is sightings over counted battles.

Both of today's floors survive as curves. A half-life of 300 puts today's battle threshold at the
point where measured play gets half the say rather than all of it. The device term caps the rest:
one person with 900 battles and no company is held to a sixth of the say until other devices appear.
That is the same thing `MEASURED_MIN_DEVICES` was protecting against, expressed as a slope.

**Unranked species take prior 0, not `facingWeight`'s rank-64 floor.** A species PvPoke does not
list only appears in the ranking because it was measured, so it must ride entirely on how often it
was faced. The rank-64 floor is right for pick3's on-device use, where it keeps an unranked opponent
from vanishing; here it would seat a never-listed species above genuinely listed ones near rank 64.
So `blendWeights` gains an optional `unrankedPrior`, defaulting to current behavior so pick3 is
unchanged, and the site passes 0.

Prior 0 is also the "new to the meta" marker. It is a fact about the row, not a badge we grant.

### Team ranking

```
a = decided / (decided + 30), and 0 below 15 decided battles
projection = expectedWinRate(simStrength), or UNKNOWN_PRIOR (0.25) when simStrength cannot be
  computed (any member outside the ranked slice)
teamScore = (1 - a) * projection + a * measuredWinRate
```

`a` comes from the team's own decided battles, not the league's. A team reported 5-0 is under the
floor, so `a` is 0 and it ranks on its projection alone. It cannot take the top spot on five
battles. At 30 decided battles the report and the projection split it evenly. Past a few hundred the
record simply wins.

**An unprojectable row is not exempt from this.** A member outside the ranked slice leaves nothing
to compute `simStrength` from, but the row does not fall back to ranking on its raw record: a
fixed low prior, `UNKNOWN_PRIOR`, stands in for the missing projection and is blended by the row's
own `a` exactly like a real one, well below what a genuinely strong projected row earns. So a team
faced once that happened to win still cannot outrank a real projection on an undamped win rate. It
is a below-average prior, not a floor: a weak enough real projection scores under it too, so it can
still be outranked by a thin, unprojectable record, correctly.

### Cores

Same formula. A core's prior is averaged over the third members actually seen alongside it, and an
average sits closer to the middle by construction. So a strong complete team rises above its own
core and a weak one sinks below it, because we know all three of the one and only two of the other.
No constant, no thumb on the scale.

A core with no complete sighting has no observed third members to average over. It falls back to
averaging across PvPoke's meta group for the league, weighted by the same blended species weights.
That is the honest reading of "the third slot could be anything a player would reasonably bring",
and it keeps a core that has only ever been seen as a pair from having no projection at all.

## simStrength, and the honesty problem inside it

`simStrength` is the matrix-derived battle score: coverage, consistency and safety, the same three
factors behind `scoreTeam`'s `battle` field, with cost and accessibility dropped because there is no
collection here. All three are pure matrix lookups (`view.rating(row, opponent, scenario)`), so they
compute in the browser with no simulator. That is what ADR 002 built the matrix for.

Opponents are weighted by the blended species weights above, so the species ranking feeds the team
prior and the whole site hangs off one number.

**It is a proxy for a win rate, not a calibrated one.** Coverage is the weighted share of the meta
that at least one member beats, which is not the same as winning a 3v3 match. Two consequences, both
binding:

- The calibration from battle score to expected win rate lives in one named function with two
  constants, a slope and an anchor, so it can be tuned against real data later without hunting
  through the code. The anchor is the battle score that reads as an even match; it is set at 100,
  a theoretically perfect team, so nothing unplayed can ever project a winning record, since real
  teams top out in the high 80s to low 90s and Go Battle League matches on rating besides. Only a
  measured record can show better than even.
- **A projected number is never printed as a win rate, or as any percentage.** Any row that has a
  projection, generated or observed, shows the same figure: a matchup score out of 100. The figure
  itself carries no per-row word marking it a projection, since a score out of 100 cannot be
  mistaken for a win rate the way a percentage can; what it means is explained once, behind a term
  hosted above the whole board, not repeated card by card. A generated row is still tagged
  "Projected" (it has never been run or faced), and only a measured record is ever shown as a
  percentage. This is the same rule that keeps PvPoke's list from borrowing the word "faced",
  applied to the new source.

## Where the faced teams come from

The store already holds them. `summarize()` gains the faced side:

- Opponent sightings roll up into teams and cores from `r.opponents`.
- **A faced team's record is the inverse of the reporter's.** If the reporter won, the team they
  faced lost that battle. No simulation needed to give faced teams a real record.
- **Partial sightings are first class.** `LogBattle.tsx` tells players "one or two is fine", so
  partial opponent teams are the norm and complete ones the exception. A faced pair is ranked as a
  2-Pokemon core, which is both honest (we print exactly what was seen) and useful (core plus flex
  is how the game is actually played).
- A sighting of a complete team is also a sighting of its cores, so core counts are supersets by
  construction. Since the board sorts by `teamScore` and not by count, this does not hand cores the
  top of the board; it means a core and its complete builds sit near each other, which is the
  structure the screen is built around.

Each row carries its run and faced counts separately, so the client can show the split and no number
silently mixes the two populations.

**Rider on pick3:** `LogBattle.tsx:193` currently reads "Add the opponents you saw. One or two is
fine." It becomes a nudge toward all three. One sentence in pick3, and it is the only change that
improves the faced data at the source.

## Cold start: generated teams

The species board has a cold start answer already: at `a = 0` the blend is PvPoke's list, nothing
fabricated. The Teams board has none, because PvPoke publishes no teams. So we generate them.

At bake time, in Node, where the engine and the real simulator already run, generate the strongest
teams against PvPoke's meta group per league and ship them as `baseline/<league>-teams.json`,
stamped with the same pinned commit and date as the species baseline. The Teams page ranks generated
and observed teams in one list by the same `teamScore`. A generated team has no measured battles, so
`a` is 0 and it stands on its projection. Observed teams start in the same place and climb or fall
as their record lands. Nothing switches over and nothing flips; generated teams are pushed down the
board by real results.

Every card says which it is: "projected against PvPoke's group, not yet seen in shared battles"
against "faced 37 times, players went 12-25".

**Feasibility to prove in the plan, not assume.** pick3's team generation is built around a
collection and there is none here. Running it against the full legal pool at default IVs should be
exactly what the matrix was built for. If the engine cannot be driven without a collection, the
fallback is generating trios directly from the matrix, which is cheaper and worse, and the plan says
so before it is built.

**Never as battle records.** Generated teams are a baked prior. Nothing derived from PvPoke is ever
written into the battle store, because then "from 480 battles shared by 9 devices" would count
battles nobody fought and every number on the site becomes one we made up. The synthetic seed script
below is a local development tool and is never pointed at production.

## Meta epochs: resetting when the game changes

A hand-kept file, the same pattern as `packages/data/seasons.json`, which Travis already maintains.

```json
[
  { "at": "2026-09-08T13:00:00-07:00", "note": "Season 28" },
  {
    "at": "2026-10-14T00:00:00Z",
    "note": "move rebalance",
    "leagues": ["great"],
    "pvpokeCommit": "<expected commit>"
  }
]
```

An entry with no `leagues` applies to all. The default window becomes "since the newest epoch that
applies to this league" rather than "since the season start", and the filter chip reads "This meta".
Resetting is one line and a deploy.

- **It deletes nothing.** A reset moves the default window; it does not purge the Durable Object.
  The 30 and 7 day views keep working and a reset made in error is one edit from undone. A
  destructive purge is the only version that cannot be taken back, and it is never needed: the cure
  for stale data is to stop counting it, not to burn it.
- **It stays hand-kept, not derived from the PvPoke bump.** `data-refresh.yml` moves that commit
  weekly and almost none of those bumps are a meta reset. Deriving it would reset the site most
  weeks for nothing.
- **An epoch carries the commit it expects.** If a rebalance lands, the measured side resets, but
  the pinned commit is still pre-rebalance, then `simStrength` scores the old movesets while the
  measured data already reflects the new ones, and the blend quietly fights itself. The site says so
  plainly when the two disagree. This is the kind of silent wrongness that otherwise takes a month
  to spot.

Rotating cups need nothing extra: a cup already has its own league id, so its data is scoped by
construction, and a cup returning next year is another epoch line.

## Seeding, so this can be judged before it is live

There is no battle seeding tooling in the repo. The model cannot be evaluated from a description and
the site has almost no real data, so this is the first task, ahead of the ranking work.

A script that generates synthetic shared battles and posts them to a local `wrangler dev` worker:
realistic species mix off the PvPoke meta group, a spread of devices and rank bands, and partial
opponents at the rate the log UI actually produces, since that case drives the core design. Volume
is an argument, so the same screens can be looked at at 50 battles, 500, 5000, one device or thirty.

Synthetic only, never a real export, the same rule as the CSV fixtures.

## Where the arithmetic runs

**The client.** `rank.ts` already blends in the browser, taking the worker's counts plus the baked
baseline and deciding the ranking. The split is already "the worker counts, the client ranks", and
the team score is a ranking decision.

This also preserves something worth preserving: `workers/counter` has zero dependencies, not one.
Putting the blend there means either pulling the engine into a Worker bundle or keeping a second
copy of the formula in it.

- A per-league matrix slice is baked next to the baselines and fetched lazily the way baselines
  already are, restricted to roughly the top 250 by PvPoke rank. Estimated 50 to 70 KB gzipped per
  league; the plan measures it rather than trusting the estimate. A species faced from outside the
  slice gets no projection and ranks on its measured record alone (species ranking has no
  `UNKNOWN_PRIOR`; it is a different blend, see "Species ranking" above). A team or core with
  **any** member outside the slice also gets no projection, rather than a partial one computed
  from the members that happen to be covered, since a projection missing a member is not a weaker
  projection but a wrong one. Unlike the species case, this does NOT leave the row ranking on its
  raw record: the missing projection is replaced by `UNKNOWN_PRIOR` and blended by the row's own
  `a` exactly like a real one, so a team faced once cannot outrank the board on an undamped win
  rate (see "Team ranking" above). Both cases say so on the row.
- `@pickthree/engine` gains a narrow subpath export so `apps/meta` imports the same `blendWeights`
  pick3 runs on device. One formula in the repo, two callers.

## API

Additive to v1. No v2.

- `/api/v1/meta` keeps its shape and its species rollups, which already count opponents as
  sightings, and gains the source discriminator below. Its existing `teams` field, which is run
  teams only, is left in place and deprecated in a comment rather than changed under a consumer.
- `/api/v1/teams` is new and owns the whole team board: teams and cores, run and faced, each with
  its own counts kept separate. It gets its own endpoint and its own ten minute bucket because the
  payload is much heavier with cores and nested complete teams, and because it changes on a
  different rhythm from the species rollup.

**The source discriminator is the seam for phase 2.** One field on the stored record saying where it
came from, carried through the aggregation and into the API. It is nearly free now and a Durable
Object migration later. Nothing reads it yet.

## Screens

- `/<league>` becomes Teams. The species list moves to `/<league>/pokemon`. Teams goes first in the
  tab bar. `/<league>/teams` keeps working so existing links do not break.
- **Teams**: cores as the spine, complete teams nested under each, one sort by `teamScore`. Every
  card says what it is made of, projected or observed, run or faced, with the counts.
- **Pokemon**: the two sections collapse into one ranked list. Each row carries its own provenance,
  its measured count and share, PvPoke's rank, and the "new" marker when PvPoke does not list it.
  The below-threshold banner goes away, replaced by a header line saying how measured the ranking
  currently is, for example "62% measured, from 480 battles shared by 9 devices".
- **About** gets the real work. It has to explain the blend, what that percentage means, the epochs,
  and which source each number came from. It is the backstop for every honesty claim the rest of the
  site makes, so it is not a footnote task.

## Rules this changes

CLAUDE.md's rule becomes: meta.pick3.gg blends PvPoke's curated list with measured play on a stated,
visible weight, never presents a projection as a measured result, and never hides measured numbers
for being small. The 300 and 5 constants stay in `apps/meta/src/rank.ts` as the blend's half-say
points rather than as gates.

The design spec's "two sources" section is replaced by a pointer to this document.

## Testing and verification

- Table-driven tests on the blend across battle and device counts, including the one-grinder case
  (900 battles, 1 device) and the unranked-prior-0 case.
- Worker tests for the faced rollups: inverted results, partial sightings, cores as supersets of
  complete teams, run and faced counts kept separate.
- A stable expected ranking over seeded data, so a formula change has to be deliberate rather than
  accidental.
- `meta:screens` passes at several seeded volumes, not only the empty state.
- `npm run lint`, `npm run typecheck`, `npm test` green before anything is pushed.

## Out of scope

- **Tournament results as a source.** Agreed with Travis as phase 2, with its own spec. It is a
  different population from ladder play (best of three, bans, top players, restricted picks), so it
  belongs as a facet on the existing band axis rather than blended into the ladder numbers. The hard
  part is the standing commitment to enter results by hand every week, not the ranking math. The
  source discriminator above is the only thing built now.
- **Double reporting.** When the site is busy enough that both sides of a battle report it, counts
  inflate. It does not bias a win rate, since both sides land, one win and one loss. Mirrored-pair
  detection is guesswork at 1 to 3 opponents and coarse timestamps. Written down, not built.
- Accounts, and any form of player voting on teams.
- Feeding measured data back into pick3's own recommendations.
