# Your meta: log the opponents you face and let them weigh the advice

Date: 2026-09-16. Status: approved 2026-09-16, plan in progress.

## Why

pick3 weighs every opponent by PvPoke's overall rank. That is the best public guess at what a
player will face, but it is a guess about everyone's ladder, not yours. Travis tried a
competitor's battle sim and found two things: a "recent" list to pick opponents from made
logging bearable, and his ladder had regulars (Shadow Dragonite) that PvPoke's meta group does
not list. Logging is worth the taps only if it changes the recommendations. So the log must feed
Teams and Counters, not just draw a chart.

Constraints that shape the design:

- Travis logs between battles on his phone. Remembering three opponents is hard, their moves is
  harder. Movesets are assumed to be the recommended ones. Partial memory must still count.
- Opponents who tank (quit or throw) are common at ranks 1 to 20 of a league climb. They must be
  flagged, kept in the set, and dropped from every number.
- The meta changes every season (move buffs and nerfs, bans), so a log from last season says
  little about today.
- Team scoring prunes with a precomputed matrix that only has columns for PvPoke's meta group
  (48 species in Great League). Logged opponents inside that set can re-weight scoring for free.
  Opponents outside it can only enter the on-device finalist sims, at a bounded cost.
- The log never leaves the phone, same as the collection. There is no account to sync it to, so
  it needs a backup path.

## What changes

A fourth bottom tab, Your meta, where the player logs battles in sets of five and sees what
they actually face. The engine turns the current season's log for the selected league into a
facing profile: blended opponent weights for scoring and Counters, plus a short list of
most-faced outsiders that join the finalist sims. Every result that used the log says so in its
assumptions. The Filters tab becomes a settings cog on every screen.

Out of scope for this spec: opponent movesets and lead order, Counters simulating outsiders
(it stays matrix-only and says so), a "which league is live this week" note (the season
announcements carry the weekly rotation; parked), and any sync or sharing of the log.

## Decisions already made

1. One battle holds: your team (picked once per set of five and carried across the set), the
   opponent's Pokemon (one to three, order optional, recommended movesets assumed), win or loss,
   and a tanked flag.
2. Partial battles (one or two opponents remembered) and partial sets (fewer than five battles)
   count fully for what they hold. Nothing waits on a complete set.
3. The blend into Teams and Counters is automatic once the league's log has 15 non-tanked
   battles this season. The count is always shown. There is a global off switch, default on.
4. Opponents outside PvPoke's meta group are counted and simulated: the most-faced outsiders,
   capped at 8, join the finalist sims in the Teams search.
5. Aging: the blend uses the current season's battles only, most recent 150 non-tanked. A
   hand-kept season list (one list for all leagues) ships with the data. Earlier seasons show
   separately. A time check warns if the list looks stale. Start fresh never deletes.
6. Your meta is the fourth tab. Filters stops being a tab; the same sheet opens from a cog in
   every screen's header and is titled Settings.
7. Placement rule: anything that changes the numbers (league, build filters, budget,
   exclusions, blend) lives in the global sheet. Display-only controls live on their screen.
8. The log can be exported and imported as a JSON file from Settings.

## Data

### Battle log

A new IndexedDB store `battles` in schema version 2. The upgrade creates the store; old saves get
it empty. One record per set, keyed by set id, with an index on league id.

```ts
interface BattleSet {
  id: string;            // uuid
  league: string;        // league id, e.g. 'great'
  startedAt: string;     // ISO time
  team: TeamRef;
  battles: LoggedBattle[];
  closed: boolean;       // five battles logged or "End set" tapped
}

interface TeamRef {
  species: [string, string, string];        // PvPoke species ids
  specimenIds?: [string, string, string];   // when picked from a pick3 team
}

interface LoggedBattle {
  id: string;            // uuid
  at: string;            // ISO time
  opponents: string[];   // 0 to 3 PvPoke species ids; shadows are their own id
  result: 'win' | 'loss' | null;   // null only when tanked
  tanked: boolean;
}
```

Rules:

- A battle with zero opponents is allowed (the player forgot all three but wants the result on
  the team record). It counts toward the battle total and the team record, and adds no
  sightings.
- A tanked battle keeps its place in the set, shows greyed with the word "tanked", and is
  excluded from every count, record, weight, and threshold.
- A set is open while `closed` is false. Logging into a closed set is not possible; a new set
  starts with team selection. At most one open set per league.
- Team identity for records is the sorted species triple, so the same three Pokemon logged from
  a recommendation and by hand roll up together.

### Seasons

`packages/data/seasons.json`, hand kept, copied by the build to `apps/web/public/data/seasons.json`
and listed in the manifest:

```json
[
  { "id": 28, "name": "Twilight Trails", "start": "2026-09-08T13:00:00-07:00" },
  { "id": 29, "name": "Season 29", "start": "2026-12-01T13:00:00-08:00" }
]
```

Sorted by start. Names are placeholders until Niantic announces them. Past seasons are not
seeded; a battle earlier than the first entry falls in a "Before Season 28" bucket. The
current season is the last entry whose start is at or before now. Battles carry only a time and
are bucketed against the list at read time, so a corrected date reshuffles them correctly.

### Settings

Two optional fields on `Settings`, both with documented defaults for old saves:

```ts
yourMeta?: {
  blend?: boolean;                     // default true
  freshFrom?: Record<string, string>;  // league id -> ISO time; default none
};
```

Start fresh for a league sets `freshFrom[league]` to now. The current-season window for that
league is battles at or after the later of the season start and `freshFrom`. Everything before
it moves to the earlier-seasons view. Nothing is deleted.

### Export and import

Export writes one JSON file: `{ "app": "pick3", "kind": "battle-log", "version": 1,
"exportedAt": ..., "sets": [...] }`, offered through the Web Share API when files are supported
and a download otherwise. Import reads a file of that shape, refuses other kinds with a plain
sentence, and adds every set whose id is not already present. Existing sets are untouched, so
restoring an old backup over a newer log adds nothing twice. Import reports "Added N sets,
skipped M already here".

## Engine

New module `packages/engine/src/yourmeta/`, pure functions over the log and static data. The
app and the worker both call it; nothing else in the engine knows about IndexedDB or screens.

### season.ts

- `currentSeason(seasons, now)`: last entry with `start <= now`, or null when the list is empty.
- `seasonWindow(seasons, freshFrom, league, now)`: the ISO time from which battles count.
- `bucketBySeason(sets, seasons)`: groups battles into the current season and earlier buckets,
  each bucket labelled by season name, plus "Before Season N" for anything older than the list.
- `seasonListStale(seasons, now)`: true when the newest start is more than 100 days old.

### profile.ts

`buildFacingProfile(input)` with

```ts
interface ProfileInput {
  battles: LoggedBattle[];       // already windowed to the season for one league
  opponents: string[];           // matrix columns, in matrix order (may repeat a species)
  ranks: Map<string, number | null>;   // species id -> PvPoke overall rank
  rankings: RankingEntry[];      // for outsider movesets and legality
  blend: boolean;                // the switch
  options?: { minBattles: 15; window: 150; halfLife: 30; maxOutsiders: 8; minSightings: 2 };
}

interface FacingProfile {
  weights: Map<string, number>;  // per matrix column id
  outsiders: MetaEntry[];        // speciesId, fastMove, chargedMoves from rankings
  outsiderWeights: Map<string, number>;
  battles: number;               // non-tanked battles in the window
  sightings: number;             // total opponent slots filled
  engaged: boolean;              // the blend changed anything
  reason: 'engaged' | 'off' | 'too-few';
}
```

Steps:

1. Drop tanked battles. Keep the most recent `window` (150) by time. `battles` is their count.
2. Count sightings per species. A species appearing twice in one battle counts once.
3. If `blend` is false or `battles < minBattles`, return PvPoke's plain weights for every column
   (`facingWeight(rank)`, exactly what `recommend.ts` builds today), no outsiders, `engaged`
   false with the reason. This path reproduces current behaviour bit for bit.
4. Outsiders: species with sightings at or above `minSightings` and no matrix column, that have
   a rankings entry (so they are legal in the league and have a moveset). Sort by sightings then
   by rank, take the first `maxOutsiders`. Moveset is the rankings entry's `moveset` (fast plus
   two charged), the same source the meta group uses.
5. Blend (see below) over the set of matrix species plus chosen outsiders.
6. A species with several matrix columns gives each column its full species weight, as today.

### blend.ts

For the species set S (matrix species plus chosen outsiders):

- prior_i = facingWeight(rank_i) = 1 / sqrt(rank_i or 64), then p_i = prior_i / sum of priors.
- observed_i = sightings_i / total sightings over S.
- a = battles / (battles + halfLife). With halfLife 30: a third of the say at 15 battles, half
  at 30, two thirds at 60.
- weight_i = (1 - a) * p_i + a * observed_i.

Scoring and Counters both normalise by the sum of weights, so only the ratios matter. The
function is a table: counts and ranks in, weights out, and its test is that table.

### stats.ts

`yourMetaStats(sets, seasons, freshFrom, league, now)` returns what the screen shows, computed
on the main thread (counting is cheap):

- `current`: battle count, sightings, per species `{ speciesId, faced, wins, losses }` sorted by
  faced then by losses, per team `{ team, battles, wins, losses }` sorted by battles.
- `earlier`: the same shape per season bucket.
- `recent`: the last 20 distinct species faced in this league across every season, most recent
  first. When the log is empty, the top 20 of PvPoke's meta group by rank instead, so the first
  battle is still pickable from a list.
- `openSet`: the open set for the league, if any.

Records are per opponent species: a battle counts as a win against every species logged in it.
That is what the screen calls "your record against X".

### Where the profile is used

- `recommend.ts`: takes `profile?: FacingProfile` in its dependencies. Scoring uses
  `profile.weights` instead of building the map from ranks. `simulateFinalists` receives
  `data.meta` plus `profile.outsiders`; each outsider is built by the simulator at PvPoke default
  IVs for the league CP with its rankings moveset, exactly as meta entries are, and battled
  against every finalist slot in the same role shield scenarios. `scoreTeam` coverage runs over
  matrix columns plus outsiders with their weights; an outsider is covered when any slot's sim
  wins (rating above 500), the same rule as meta entries. Consistency and safety stay
  matrix-only. Cost: at most 8 more opponents on 48, about a sixth more sim time on the finalist
  stage, none on pruning.
- `analyze.ts` (Build a team): same weights and outsiders, so a hand-built team is judged by the
  same meta as a recommended one.
- `counters/counters.ts`: `opponentGroups` takes the species weight from `profile.weights` when
  present. Outsiders are ignored here in v1.
- Verdicts and the scan list are unchanged.

### Assumptions

`Assumptions` gains `facing: string`. Engaged: "Weighted by your log: 42 battles this season,
3 opponents outside PvPoke's list simulated". Not engaged: "PvPoke weights only (13 of 15
battles logged)" or "PvPoke weights only (your log is switched off)". Counters results carry the
same line without the outsider clause plus "outsiders counted, not simulated" when any exist.

### ComputeHost

`recommend`, `analyze` and `counters` options gain `battles?: LoggedBattle[]` (already windowed
by the app) and `blend?: boolean`. The in-process host and the worker host both build the
profile with `buildFacingProfile` from those plus the league bundle. Keeping the windowing in
the app means the worker never needs the season list or settings.

## App

### Your meta screen (route `#/meta`)

Top to bottom:

1. Blend status line: "Weighting Teams and Counters by 42 battles" or "13 of 15 battles until
   your log weights Teams and Counters" or "Your log is switched off in Settings". When the
   season list is stale: "The season list may be out of date. Start fresh?" with the button.
2. The open set, if any: team tokens, five slots showing logged battles (W, L, or tanked, plus
   opponent tokens), "Log a battle", "End set". Without an open set: "New set".
3. Most faced this season: species rows with sprite, name, faced count, record. Tapping a row
   opens the Counters view filtered to that species (existing screen, existing links to
   owned and can-build). Display controls (sort by faced or by worst record) live in a cog
   popover on this screen, per the placement rule.
4. Your teams this season: team rows with record. Tapping opens the Build screen with that team
   picked, so the analysis is one tap away.
5. Earlier seasons, collapsed by default, one section per bucket with the same two lists.
6. League switcher at the head, as on Teams and Counters. The log is per league.

### New set

Pick your team from, in order: recent teams from this league's log, teams from the current
recommendation and the last Build analysis (from state), then a three-slot picker searching the
collection first and every league-legal species second (the collection may be stale). Specimen
ids attach when the pick came from a pick3 team or the collection.

### Log a battle (route `#/meta/log`)

One screen. Three opponent slots. Under them the recent list as a wrapping row of tokens (from
`stats.recent`), then a search box over league-legal species. Tapping a token fills the next
empty slot; tapping a slot clears it. Then three buttons: Win, Loss, Tanked. Tanked saves
without a result. Save returns to the set view. After the fifth battle the set closes and the
screen offers "New set with the same team" as one tap.

### Navigation and settings

- Tabs: Teams, Counters, Collection, Your meta. The Filters tab is removed.
- A cog in every screen header opens the sheet, retitled Settings. Teams keeps its filters
  chip and gains "Your log: 42 battles" (or "Your log: 13 of 15") linking to Your meta.
- Settings gains a Your meta section: the blend switch with a one-line note ("Weights Teams,
  Counters and Build by what you actually face"), Start fresh for the selected league
  (confirm sheet: "Battles before now move to Earlier seasons. Nothing is deleted."), Export
  log, Import log.
- Forget everything also clears the battle log.

### Plumbing

- `storage/db.ts`: version 2, `battles` store, `loadSets(league)`, `saveSet`, `loadAllSets`,
  `importSets`, `clearSets`.
- `state/store.tsx`: `sets` for the selected league in state, loaded at boot with the collection
  and reloaded on league switch. `seasons` from the data manifest at boot. Routes `meta` and
  `meta-log`. Actions: `startSet`, `logBattle`, `endSet`, `startFresh`, `exportLog`,
  `importLog`.
- `runRecommend`, `loadCounters` and the Build analysis pass the windowed battles and the blend
  switch through the host. Any change to the log invalidates the cached recommendation and
  counters for that league, same as a settings change.
- Protocol: `recommend`, `counters` and `analyze` requests carry `battles` and `blend`.
- Data manifest: `seasons.json` joins the file list so the service worker precaches it with the
  rest of `/data/*`.

## Data build and CI

- `packages/data/seasons.json` is validated by a data test: sorted by start, unique ids, ISO
  times with offsets. Age does not fail tests.
- `data-refresh.yml` gains a step running `packages/data/scripts/check-seasons.ts`: when the
  newest start is more than 90 days ago it opens (or finds and comments on) a GitHub issue
  labelled `seasons` titled "Season list needs the next season". That is the maintainer nag.
  The in-app warning at 100 days is the fallback if the nag is ignored.
- Season 29 is seeded with the known start date and a placeholder name; the announcement
  fills in the name when it lands.

## Testing

Engine (in-process, fixtures):

- `blend.test.ts`: table of (counts, ranks, battles) to weights. Includes a = 0 below the
  threshold, a third at 15 and two thirds at 60, and that a species never seen keeps a positive
  weight.
- `profile.test.ts`: switch off and too-few both reproduce today's weights exactly; outsider
  selection (min sightings, cap, needs a rankings entry, sort by sightings then rank); tanked
  battles ignored; window keeps the most recent 150; a species twice in one battle counts once.
- `stats.test.ts`: records per species and per team, zero-opponent battles count for the team
  only, recent list order and the meta-group fallback, season bucketing with `freshFrom` and a
  battle before the first listed season.
- `season.test.ts`: current season selection at boundaries and with an empty list; stale check.
- `recommend.test.ts` additions: with a fixture log that makes a non-meta species a regular,
  the outsiders reach the sims, the assumptions line reads as specified, and a team that beats
  the regular gains over one that does not. With the blend off, output is identical to today's
  golden result.
- `counters.test.ts` addition: weights come from the profile when present.

Web (jsdom, Testing Library):

- Log flow: new set from a recommended team, log three battles including a tanked one and a
  one-opponent one, end set, numbers on screen match `stats`.
- Settings: blend switch off changes the Teams chip text and the request payload; start fresh
  moves battles to earlier seasons; export produces the documented shape; import skips known
  set ids.
- Storage: upgrade from version 1 creates the store and keeps the collection.

Screens: `web:screens` captures Your meta and Log a battle with the sample collection, seeded
with a small fixture log so the screenshots show real rows.

## Copy rules

Plain names, 7-bit ASCII, no em dashes. "Your log" in UI copy; "Your meta" is the tab name.
Explain the blend once on the screen in one sentence: "Once you log 15 battles, Teams and
Counters weigh opponents by how often you actually face them."
