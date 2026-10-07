# Achievements

Date: 2026-10-07. Status: designed with Travis section by section, layout approved over four mock
rounds (branch `mock/achievements`, last commit 07b4080, never merged); written up for his review.

## Why

pick3 is a tool, and Travis wants using it to feel like a game. Achievements do three jobs:

1. **Pull new players through features** they would otherwise miss (log a battle, analyze a team,
   unlock Your meta).
2. **Reward regulars** for coming back, season after season.
3. **Give people something to show off**: a share image of what they have collected.

Every achievement hands out a Kanto Pokemon picked at random when it is earned, so every
player's collection is different. Collecting Pokemon is the hook, not badges.

## Ground rules

- **Nothing rewards volume past what is real.** Fake battles would poison the community meta
  through sharing, not just the badges. Counts are distinct days or capped daily credit, never raw
  battle totals.
- **All of it lives on the phone.** No accounts, no server, nothing sent. Achievement data never
  goes into the community records.
- **We do not fight cheating.** Nothing on a phone can be locked against its owner, and a server
  that signs unlocks needs identity. Achievements are worked out from the battle log, not stored
  as flags, so cheating means forging battles, which the daily cap already bounds. A cheater only
  fools themselves; there is no leaderboard.
- **Streaks are seasonal, not daily.** Few players will open a team tool every day. Go Battle
  League runs on seasons, so streaks do too, and missing a week costs nothing.

## The achievements

The full list is 32. This slice ships the starter 11; the other 21 are a sketch for later and
are not built now. Names are approved as written.

### Starter set (this slice)

Each line gives the tier its reward draws from (see Rewards).

Easy
1. **Trainer** (`trainer`): have a collection, imported or added by hand.
2. **First battle** (`first-battle`): log one battle.
3. **Full set** (`full-set`): log a complete set of 5.
4. **Team builder** (`team-builder`): analyze a team in Build. The only starter achievement with
   no history behind it; counts from the update on (an event mark, see Storage).

Mid
5. **Meta player** (`meta-player`): log a set where all three of your Pokemon are in that league's
   meta group (`/data/meta/<league>.json`), checked against today's data, backfill included.
6. **Cup runner** (`cup-runner`): log a set in any league other than Great League.
7. **Ten days** (`days-10`): log on 10 different days.
8. **Your meta** (`your-meta`): unlock Your meta for the first time, 15 counted battles in one
   league within one season (the blend's own `minBattles`).

Hard
9. **Back again** (`seasons-2`): log in 2 seasons in a row.
10. **Still reading** (`your-meta-seasons-2`): unlock Your meta in 2 seasons in a row.

Elite
11. **Three-peat** (`seasons-3`): log in 3 seasons in a row.

### Later (sketch, not this slice)

Each is one definition when its time comes; see Extensibility. Event marks noted where a later
one needs an action with no history.

- Easy: add a Pokemon by hand; share a team link (mark); copy a scan string (mark); open
  Counters (mark); pin a copy on a species page (mark); Welcome back, log again after a season
  with no battles.
- Mid: log a set in a Mega league; log a set in the Tournament league; face 25 different opponent
  species; log in 3 leagues in one season; unlock Your meta in 2 leagues in one season.
- Hard: 30 days; face 50 species; face 100 species; log in every rotation cup of a season; log in
  every week of a season; Your meta in 3 seasons in a row.
- Elite: 100 days; Five-peat, 5 seasons in a row.
- Top: Ten seasons, 10 seasons in a row; Your meta in 5 seasons in a row. These two are the only
  way to get Mewtwo and Mew.

Elite holds exactly three in the full list, one per legendary bird, and Top exactly two.

## Counting

All of this is pure engine code over the battle log.

- **Counted battle:** a logged battle that is not tanked (tanked battles are counted nowhere, as
  today).
- **Day:** the local calendar date of a battle's `at`. At most 25 battles count per day, the first
  25 by time, matching GO's 5 sets. Distinct-day measures count days with at least one counted
  battle.
- **Season:** from `seasons.json`, the latest season whose start is at or before the battle.
  Battles before the earliest listed season belong to no season. Consecutive means adjacent in the
  list.
- **Season streak:** the run of consecutive seasons with at least one counted battle, counted back
  from the current season. If the current season has no battle yet, the run counting back from
  the previous season is still alive.
- **Your meta unlocked in a season:** 15 counted battles in one league within that season.
- **Set facts** (Full set, Meta player, Cup runner) read the set's league and team. A full set is
  5 battles in one set, tanked ones included, since the set is what was played.

Note on today's data: `seasons.json` starts at Season 28 (2026-09-08) and the log shipped
2026-09-16, so no one can hold a 2 season streak before Season 29 opens (2026-12-01). The season
achievements show progress ("1 of 2") until then.

## Rewards

### Pools

A hand-kept engine const tags every Kanto species (dex 1 to 151, keyed by PvPoke species id) with
a tier. It starts from this rule and Travis may move any entry:

- **easy:** the unevolved member of a family that evolves (Bulbasaur, Pidgey, Caterpie, Magikarp).
- **mid:** evolved forms that are not the end of a three stage line, and the end of a two stage
  line (Ivysaur, Pidgeotto, Kadabra, Wartortle, Fearow). Lines count Kanto members only.
- **hard:** the end of a three stage line and the standalones (Venusaur, Dragonite, Snorlax,
  Lapras, Tauros). Exceptions moved up from mid by hand: Gyarados and the Eeveelutions.
- **elite:** Articuno, Zapdos, Moltres.
- **top:** Mewtwo and Mew, reserved for the top achievements only.

### Roll

- Once, when the achievement is earned, with `crypto.getRandomValues`. The result is kept for
  good: no rerolls.
- A uniform pick from the achievement's tier pool, minus species the player already holds as
  rewards. No duplicates: a shiny Lapras means no normal Lapras later.
- When a tier's pool is empty, the roll draws from the nearest non-top tier below it that has
  stock, then above it. Top species are never drawn by a fallback.
- `roll` takes the random source as a parameter so tests are deterministic.

### Shiny

Any roll can be shiny. Odds by the player's season streak at the moment of earning:

- 1 in 20 by default
- 1 in 10 with a streak of 2 or more
- 1 in 5 with a streak of 3 or more
- 1 in 3 for top achievements, whatever the streak

## Storage

- IndexedDB `pickthree` goes to v3 with a new `achievements` store, one record keyed `'current'`:
  - `earned: { id, earnedAt, species, shiny }[]`
  - `marks: string[]`, one-time events with no history (`analyzed` for this slice)
- The upgrade only creates the store. Old saves open as nothing earned yet.
- Earned is permanent. Deleting battles, Start fresh or editing a set never takes one back. An
  achievement retired from the list keeps its earned record and its Pokemon in the dex.
- **Export log** adds an optional `achievements` block (the `earned` list and `marks`) without
  bumping `LOG_FILE_VERSION`, so older installs still read the file. **Import log** merges earned
  records whose id it does not have, keeping the stored one on a clash, and unions the marks. A
  new phone keeps the player's actual Pokemon instead of rerolling them. Old files import as
  before.

## When it runs

- In the web app, on the main thread (one pass over the log, a few milliseconds): after boot once
  the log and collection load, after any log change (set saved, battle edited or deleted, log
  imported), after Analyze, and after an import or manual add.
- New ids are rolled, saved, then announced. Save comes before announce, so a crash never shows a
  Pokemon that was not kept.
- **One new achievement:** a toast.
- **Two or more at once** (the first run on an existing log, an update that adds definitions, or a
  log import): one welcome reveal, "You have earned N already", with the rolls together, instead
  of a toast queue.
- One toast at a time. An achievement toast waits behind a toast already showing (the rotation
  cup nudge uses the same component).

## Screens

Built only from `packages/ui` and the signed pages' parts. The mock branch is the layout source.

### The page (`#/achievements`)

Top to bottom:

1. Sub header "Achievements" with Back and a Share icon button.
2. **Progress card** (`ProgressCard`): "Earned 9 / 11", its bar, then "1 shiny" and the nudge
   line. The total is the live count of definitions.
3. **Your Kanto dex**: a card with "N of 151" and a 10 column grid of small tokens, dex order.
   Earned slots are the reward's sprite on its type disc (the shiny render when shiny, with the
   shiny sparkle). Unearned slots are the species' silhouette, no number, no disc. With sprites
   off, earned slots are the existing type-colored token and unearned slots are numbered blanks.
4. **Tier groups** (Easy, Mid, Hard, Elite, and Top once it has entries), each headed with what it
   rewards ("Rewards a first-stage Pokemon"). Earned rows: the Pokemon's token, the name, "Pidgey
   · Sep 12" ("Shiny Lapras" when shiny). Locked rows: a "?" blank token, the name, the how-to
   line, the progress count ("1 of 2") and its bar. The reward species is never shown before it is
   rolled.
5. A closing line: "Each one gives you a Kanto Pokemon, picked at random when you earn it.
   Everything here stays on this phone."

### Ways in

- The toast, which opens the page scrolled to that row.
- A row on the Settings hub, between Community and Appearance.
- A button at the top of Your battles (`#/meta/battles`) with the nudge line under it.
- An Achievements card on the Meta landing after Your meta: the count, the last few sprites
  earned, the nudge and "See your achievements".

### Toast

`NoticeToast` with a token slot: the sprite, "First battle. You got Bulbasaur.", See it and Not
now.

### Welcome reveal

A `packages/ui` Sheet: "You have earned N already", the rolled Pokemon in a three column grid
with their achievement names, and a primary button to the page.

### Nudge

One line naming the nearest locked achievement: the best have / need ratio, ignoring ones that
rest on an event mark. "Next: Ten days. 3 more days." It shows on the progress card, under the
Your battles button, on the Meta landing card, and once after a set closes.

### Share image

Drawn on device in a canvas, 1080 wide, from the cached sprites: "My Kanto dex", "9 of 151 · 1
shiny · earned by playing GBL", the 151 grid with earned sprites lit, shinies marked, unearned as
silhouettes (each sprite filled `source-in` in the silhouette color, no `ctx.filter`, so Safari
draws it), and pick3.gg. Theme follows the app. Shared as a file through the share sheet, with a
download as the fallback, the same path as Export log. With sprites off, the image uses the same
fallbacks as the page.

### New parts

The mocks needed these, and nothing else is new:

- Tokens in `tokens.css`, dark and light: `--silhouette` (dark #5a5e73, light #292b31) and
  `--silhouette-opacity` (dark 0.45, light 0.16). The page draws a silhouette as a CSS mask of the
  sprite filled with `--silhouette`.
- The shiny sparkle, badged top right of a token like the Mega badge, colored `--type-electric`.
- The `.ach-dex` grid (10 columns of 28px tokens) and the "?" blank token.
- A star glyph for the Settings row.
- A token slot in `NoticeToast`.

## How it is built

### Engine (`packages/engine/src/achievements/`)

- `definitions.ts`: the list. Each definition is data: `id`, `name`, `howTo`, `tier`, `test(facts)`
  and an optional `progress(facts) -> { have, need }`. Frequency achievements are parameters of a
  shared builder (`distinctDays(10)`, `seasonStreak(3)`), not new code.
- `facts.ts`: builds `AchievementFacts` from the battle log, the seasons, the league meta groups,
  whether a collection exists, and the marks. Counting rules above live here.
- `evaluate.ts`: `evaluate(facts) -> earned ids` and `progress(facts) -> { id, have, need }[]`.
- `kanto.ts`: the tier table, 151 entries.
- `roll.ts`: `roll(tier, owned, streak, rng) -> { species, shiny }`.
- Exported from the engine index like the other modules. No DOM, no storage.

### Data build

`build-sprites.ts` also fetches the HOME shiny renders (`other/home/shiny/<n>.png`) for the 151
Kanto species and writes `sprites/shiny/<id>.webp`, cached under `.cache` like the rest and
skipped by `PICKTHREE_SKIP_SPRITES=1`. The service worker already serves `/data/sprites/*` cache
first, so the shinies follow with no change.

### Web

- `storage/db.ts`: v3 and the `achievements` store, load and save.
- `storage/logFile.ts`: the optional `achievements` block, both ways.
- `state/store.tsx`: achievements state and an action that evaluates, rolls, saves and queues the
  announcement; the triggers in When it runs; writing the `analyzed` mark.
- `screens/Achievements.tsx`, the route, the toast and reveal, the entry points, and the share
  image drawer (its own module, so it can be tested apart from the screen).

## Extensibility

- **Adding one is a definition plus a test.** Nothing else changes.
- **Ids are permanent strings,** never reused or renumbered.
- **New ones backfill themselves.** The first boot after an update runs every definition against
  the whole log. Anything already earned arrives through the welcome reveal ("2 new achievements
  in this update").
- **Frequency tiers are parameters,** so 30 and 100 days are new rows with different numbers.
- **Facts grow by fields.** A feature that wants achievements adds a field to the facts, or an
  event mark for an action with no history; older definitions ignore it.
- **The count uses the live total,** so "9 of 11" becomes "9 of 20" when an update adds nine.
- **Pool headroom:** 149 random species covers well past 32. If the list outgrows Kanto, a second
  region's pool is its own decision.

## Out of scope

- The 21 later achievements.
- A share card per achievement as it is earned.
- Any server side: sync, leaderboards, signed unlocks.
- Achievements for actions before this ships that left no history (the Analyze mark starts now).

## Tests

Engine, synthetic logs only, no pinned PvPoke values:

- The daily cap: a 40 battle day counts 25. Tanked battles never count.
- Distinct days across time zones of the stored ISO strings (local date of the device).
- Season assignment, battles before the first season, a streak across a gap, and "not logged yet
  this season" keeping the streak alive.
- Your meta unlock per league and season.
- Meta player against a synthetic meta group.
- `roll` with a seeded random source: tier pools, no duplicates, the fallback order when a pool
  is empty, top species never drawn by a fallback, the odds band picked for each streak.
- The tier table holds exactly Kanto 1 to 151, Mewtwo and Mew only in top, the three birds only
  in elite.
- Every definition has a unique id, a name and a how-to line.

Web:

- The db v2 to v3 upgrade keeps the collection, settings and battles.
- Save before announce.
- One new achievement shows one toast; two or more show one reveal and no toasts.
- Export and import round-trip achievements; a version 1 file without the block still imports;
  a clash keeps the stored record.
- The share image drawer produces a 1080 wide image with sprites on and off.
- `web:screens` captures the page, the toast and the reveal.

## Done when

- The starter 11 earn, roll, save and announce as above, backfill included.
- The page, toast, reveal, entry points, nudge and share image ship and match the mocks.
- Shiny sprites are in the data build.
- The page passes the design audit, and Travis signs its record in `docs/design/audits/`.
