# Cup team boards: Reddit infographics of whole teams, generated from pick3's engine

Date: 2026-09-30. Status: design approved in chat 2026-09-29/30, spec awaiting review.

When a Go Battle League cup goes live, Reddit and Discord fill with "what do I run in X?" threads.
Other sites answer with top-10 lists of single Pokemon by role, straight from PvPoke (Oak
Coliseum's Mega Color Cup closers/switches/leads posts are the reference). Cradily sits at #1 of
all three lists and the reader still has to assemble a team. pick3 builds teams, so its answer is
whole teams: a script that runs the engine for a cup and renders three images plus a post body
with a pick3.gg link to the full analysis of every team.

## Summary of decisions

1. **Three boards per cup, five rows each.** Top Teams; Budget Builds (no Elite TM); Best Team for
   Each Mega (only when the league allows Megas). One row is one complete team in battle order.
2. **A local script, not a site feature.** `npm run post -- <league>` renders PNGs and a
   `post.md`; Travis posts by hand. Nothing ships to pick3.gg or meta.pick3.gg.
3. **Strength is measured against meta.pick3.gg's blend** (PvPoke prior, tournament picks, shared
   ladder battles), the same weights the meta site uses. `--prior` is the explicit PvPoke-only run.
   The source line on every image says what the number was made of.
4. **Variety cap of 2.** No Pokemon on more than two rows of one image; a Shadow and a Mega count
   as their base Pokemon. The existing rule (two rows share at most one Pokemon) stays.
5. **Every strength matches the moves printed next to it.** Any pool member whose moveset differs
   from its matchup-matrix row is re-simulated with the vendored PvPoke sim before scoring. This is
   what makes the Budget board honest.
6. **Best Team for Each Mega** ranks every Mega in the league by its best team, one Mega per row,
   the Mega called out as the row's hero.
7. **Links carry moves** and open pick3.gg's existing team analysis, which runs against the
   reader's own collection when they have one imported.
8. **Visual design is the Claude Design export** in `docs/design/infographic/export/`, with
   Travis's trainer likeness as the mascot, one pose per board.
9. **Output is committed** under `posts/<date>-<league>/` so every post can be traced back to what
   produced it.

## Evidence from the spike (2026-09-30)

A throwaway script ran the cold-start generator on production data (pick3.gg/data, PvPoke
2026-09-29) for Mega Color Cup and Great League Mega Edition and filled the design template. It
took about 22 seconds a cup and proved the pipeline. It also showed two things that shaped this
spec:

- **Without a cap the boards are one Pokemon.** Shadow Kingdra was on all 15 Color Cup rows
  (Top, Budget and Mega) and on all 21 best-per-Mega teams; the Mega board read "Shadow Magnezone +
  Shadow Kingdra + a Mega". Great League Mega Edition had Mimikyu on all 15 rows. The existing
  rule (share at most one Pokemon with any picked team) allows that.
- **The budget strengths were not true.** With Elite TM off, Alolan Marowak dropped Shadow Bone
  for Flame Wheel and Jumpluff dropped Acrobatics for Aerial Ace, yet every budget team scored
  exactly what its Elite TM twin scored (92.3, 91.5, 90.7 ...). The strength comes from the
  matchup matrix, which is simulated once per species at one moveset, so a moveset change never
  reached the number.

## What gets posted

- **Canvas:** 1080 x 1350 (4:5 portrait), dark theme, readable as a ~400 px Reddit thumbnail.
- **Header:** pick3.gg wordmark and tagline, cup name (`league.title`), board subtitle ("Top 5
  Teams", "Budget Builds - No Elite TM", "Best Team for Each Mega"), the mascot, and a corner label
  with the cup's live dates from `schedule.json` ("LIVE SEP 23 - OCT 6", UTC dates). A league with
  no schedule entry (the standard leagues) gets "UPDATED <date>".
- **Row:** team number badge (rank 1 emphasized), three members labeled LEAD / SWITCH / CLOSER,
  each with sprite, name, up to two tags, fast move and two charged moves; strength (one decimal,
  0 to 100) with its bar; a caution line.
- **Tags:** `Shadow`, `Mega` (with its letter where one exists: `Mega X`, `Mega Y`), regional form
  (`Galarian`, `Alolan`, `Hisuian`, `Paldean`), `Elite TM` when the member's moveset needs one.
  A Shadow member shows the base sprite with the template's shadow treatment; the Mega on the Mega
  board carries `.mega-hero` ("BUILD AROUND").
- **Caution:** "Watch for: A, B, C" naming up to three meta Pokemon nothing on the team beats
  (the generator's `exposure`), de-duplicated by displayed name; "Nothing in the meta beats all
  three" when there are none.
- **Footer source line**, always shown, three lines:
  1. `Strength: pick3 sims vs the <cup> meta`
  2. what the weights were made of and the run date, e.g. `PvPoke meta + 1,240 shared battles +
     2 events - Sept 30, 2026`, or `PvPoke meta only - Sept 30, 2026` when there is no measured
     play or the run used `--prior`
  3. `Full analysis of every team: links in the post`
- **All copy is 7-bit ASCII.** No em dashes, no smart quotes.

## Generation

### Inputs

- **Game data from production:** the script fetches the league's files from
  `https://pick3.gg/data/` (`pokemon.json`, `moves.json`, `gamemaster.json`, `leagues.json`,
  `schedule.json`, `seasons.json`, `epochs.json`, `rankings/<league>/*.json`,
  `matrix/<league>.json`). Posts then match what the live app computes, and no local data build
  is needed. The PvPoke commit and date from `data-manifest.json` go into `teams.json`.
- **Weights:** `/api/v1/meta` on the counter worker for the league, over the "This meta" window
  (`resolveWindow('meta', ...)` with the fetched epochs and seasons), source `all`, blended with
  `communityWeights` exactly as `apps/meta/src/rank.ts` does, then mapped onto the matrix's
  opponent columns. If the read fails the run stops. `--prior` skips the read and uses
  `priorWeights` from the bake.
- **Unknown league** (not in `leagues.json`): the run stops.

### Pools

- **Cold-start pool** as the meta bake builds it: `coldStartSpecimens` at PvPoke default IVs,
  `coldStartBuilds` with `buildOptionsFor(league)`, `candidatePool` with `COLD_POOL` (60).
- **Budget pool:** the same with `allowEliteTm: false`.
- **Mega pool:** the cold-start pool's non-Mega candidates plus every Mega candidate the league's
  matrix has (a `candidatePool` wide enough to include them all, filtered to Megas), so a Mega
  ranked below the top 60 still gets a row if its team earns one.

### Rows match their moves

Before scoring, every candidate in a pool whose moveset (fast plus charged move ids) differs from
`matrix.candidateMovesets[speciesId]` gets its matrix row re-simulated with its own moveset:
`simulateMatrix` against the matrix's opponents at their matrix movesets, over the matrix's
scenarios, PvPoke default IVs on both sides (exactly how the data build filled the matrix). The
fresh rows replace the old ones in a copy of the matrix (a new `withReplacedRows`, the sibling of
`withSimulatedRows`). The simulator is `PvPokeSimulator` over `loadPvPokeInNode(gamemaster)`.

In practice this touches the Budget pool (Elite TM moves swapped out) and any candidate whose
chosen moveset differs from PvPoke's for another reason; the Top pool usually needs none.

### Scoring and selection

`generateColdStartTeams` today scores every trio and then applies its own selection. It is split:
a new `scoreTrios(pool, view, types, weights)` returns every legal trio (one species per team, one
Mega at most, via `trioBreaksRules`) with its `bestStrength` result, sorted strongest first with
the existing tie-break; `generateColdStartTeams` keeps its current behavior on top of it, so the
meta bake is unchanged.

The boards select from `scoreTrios` output:

- **Variety rule:** walking teams strongest first, a team is accepted only if (a) it shares at
  most one Pokemon with every accepted row and (b) no Pokemon would then appear on more than two
  accepted rows. "Pokemon" here is the base: Megas folded with `teamSpeciesOf`, the `_shadow`
  suffix removed. Stop at five rows.
- **Top Teams:** the variety rule over the cold-start pool.
- **Budget Builds:** the variety rule over the budget pool.
- **Best Team for Each Mega:** for each Mega, its strongest team. Megas are ranked by that
  strength; then, walking Megas in that order, each takes its strongest team that passes the
  variety rule against the rows already taken. A Mega with no passing team is skipped. Stop at
  five rows. Two Megas of one base (Charizard X and Y) may both appear; the cap counts them as one
  Pokemon, so no third Charizard row.
- Each selected team is then evaluated with `evaluateTrio` for its presented order, as the
  generator already does, giving `structure` and `exposure`.

### Mega board condition

The Mega board is produced when the league's `schedule.json` entry has `mega: true`. A league with
fewer than five Megas that pass gets a shorter board.

## Rendering

- **Template:** the Claude Design export (`pick3-cup-boards.html`), committed next to the script.
  It is plain HTML/CSS at 1080 x 1350, one `section.board` per variant (`#top`, `#budget`,
  `#mega`), five `article.team` rows each, fonts embedded. Its README documents the classes the
  script writes (`.winner`, `.shadow-member`, `.mega-hero`, `.tag.region|elite|mega|shadow`,
  `.caution.clear|alert`, `--strength` on the article, `.long-title` for long cup names).
- **Mascot:** the export's temporary SVG-clipped JPEGs are replaced with the transparent figure
  cutouts (`docs/design/infographic/mascot-cutouts/mascot-<pose>-figure.png`), inlined as data
  URIs: pointing on Top Teams, thinking on Budget Builds, finger guns on the Mega board.
- **Fill:** a pure function takes the template and the board data and returns the page. It
  escapes text, sets the portrait's type class from the battling form's primary type, and removes
  any board it was not given (a league without Megas has no Mega section).
- **Capture:** puppeteer-core drives the installed Chrome (`CHROME_PATH`, as `screens.mjs` does)
  at 1080 x 1350, device scale factor 1, one capture per board via its fragment. It waits for
  `document.fonts.ready` and for every `img` to finish; a sprite with `naturalWidth` 0 stops the
  run, so a broken image is never posted.
- **ASCII guard:** the filled page's visible text is checked for any character above 0x7E before
  capture; one stops the run.

## Output

`posts/<YYYY-MM-DD>-<league>/`, written by the script and committed by Travis:

- `top.png`, `budget.png`, and `mega.png` when there is a Mega board.
- `post.md`:
  - a suggested title: `<Cup>: top teams, budget builds and the best team for each Mega (pick3 sims)`
    (the Mega clause only when there is a Mega board);
  - a two-line intro saying these are whole teams ranked by projected strength against the cup's
    meta, and that each link opens the full analysis, run against your own Pokemon if you have
    imported them;
  - per board, a numbered list matching the image's team numbers: the three names in battle order
    and the pick3.gg link;
  - a short "how the number works" note: pick3 sims each team against the cup's meta, weighted by
    the stated mix; it is a projection, not a measured win rate.
- `teams.json`: league, run date, PvPoke commit and date, weight source and counts, and every row
  (species, moves, strength, coverage, consistency, safety, structure, exposure, link).

## Links

`teamPath` / `teamLink` / `parseTeamPath` move from `apps/web/src/teamLink.ts` into the engine
(`packages/engine/src/share/teamLink.ts`, exported from the engine index); `apps/web` imports them
from there. The script builds each link from the league id and the three members with their moves,
so a link reproduces the row exactly.

**Bug fixed here:** `parseTeamPath` checks the league with `/^[a-z0-9_]+$/`, which rejects
`mega-great`, `mega-ultra` and `mega-master`. Every link to a team in those leagues would open to
"That link has no league in it." The league check becomes `/^[a-z0-9_-]+$/`; species ids keep the
old pattern. The app's route parsing for `#/t/` is checked for the same assumption.

## Code layout

- `packages/engine/src/coldstart/teams.ts`: `scoreTrios` split out; `generateColdStartTeams`
  unchanged in behavior.
- `packages/engine/src/coldstart/boards.ts` (new, pure): the variety rule, `topBoard`,
  `budgetBoard` (same selection, its own pool), `megaBoard`, and the display helpers (name, tags
  with Mega letter, de-duplicated caution names).
- `packages/engine/src/sim/matrixSim.ts`: `withReplacedRows`, and a helper that finds the pool
  members whose moveset differs from their matrix row.
- `packages/engine/src/share/teamLink.ts`: moved from `apps/web`, league pattern fixed.
- `apps/meta/scripts/post/`: `post.ts` (fetch, weights, sim, boards, fill, capture, write),
  `fill.ts` (pure template fill and ASCII guard), `template.html`, `assets/` (the three figure
  cutouts). `apps/meta/package.json` gets `"post": "tsx scripts/post/post.ts"`; the root gets
  `"post": "npm -w @pickthree/meta run post --"`. Flags: `--prior`, `--date YYYY-MM-DD` (overrides
  the run date in the folder name and source line).

## Testing

Unit tests on synthetic data only (no pinned PvPoke values):

- **Variety rule:** over a synthetic scored list where one Pokemon is in every top team, no
  Pokemon appears on more than two rows; a Shadow and its base, and a Mega and its base, count as
  one; no two rows share two Pokemon; rows stay in strength order.
- **Mega board:** one Mega per row, each row has exactly one Mega, rows ranked by strength, a Mega
  whose only teams break the cap is skipped, fewer than five Megas gives fewer rows.
- **Rows match their moves:** with a fake `BattleSimulator` returning fixed ratings, a candidate
  whose moveset differs from its matrix row gets new ratings and a different strength; a matching
  candidate's row is untouched.
- **scoreTrios split:** `generateColdStartTeams` returns the same teams as before on the existing
  cold-start fixtures.
- **Display:** Mega X and Mega Y keep their letter; regional and Shadow tags; caution names
  de-duplicated.
- **Fill:** five rows per board, `.winner` on row one, `.mega-hero` on the Mega, the Mega section
  removed when absent, text escaped; the ASCII guard throws on a non-ASCII character.
- **Links:** the existing `apps/web` link tests pass against the moved module; a `mega-great` link
  round-trips through `teamPath` and `parseTeamPath`.

The capture step is verified by a real run for Mega Color Cup, reviewed by eye before anything is
posted. Lint, typecheck and the full test suite pass.

## Failure handling

Every failure stops the run with a message and writes nothing: unknown league, a data fetch
failing, the meta read failing without `--prior`, the simulator failing to load, a sprite failing
to load, non-ASCII text on the page, Chrome not found.

## Found along the way (separate fix)

`workers/counter/src/battles.ts` validates `league` with `/^[a-z0-9_]+$/`, as do the worker's read
routes (`meta.ts`, `index.ts`). Battle records for `mega-great`, `mega-ultra` and `mega-master`
will be rejected with a 400 once those leagues open (2026-10-06), and the meta read for them
fails. That is a worker change with its own deploy, out of this spec, but it needs doing before
2026-10-06 or the Mega Edition leagues start with lost battles. Until then the Mega Edition boards
run on `--prior`.

## Out of scope

- Posting to Reddit or Discord automatically; Travis posts by hand.
- An in-app share image or a page on meta.pick3.gg.
- A light-theme variant.
- Boards from a player's own collection.
- Per-team detail cards (the post body's links cover the analysis).
