# GBL rotation sync: the leagues pick3 shows follow the live Go Battle League schedule

Date: 2026-09-29. Status: design approved in chat 2026-09-29, spec awaiting review.

The week of 2026-09-22 ran Retro Cup in GO Battle League, and pick3 could not build for it, so
Reddit questions about Retro went unanswered. Two causes: the PvPoke pin was 18 days old (fixed
2026-09-29, `1334870`..`f0ff41b`), and special cups are shelved behind `PICKTHREE_SPECIAL_CUPS`
because the app does not model megas. This spec makes pick3's cup leagues follow the published GBL
schedule for the cups that need no mega support. Megas are their own spec.

## Summary of decisions

1. **The schedule is baked into the build, never fetched by the phone.** A daily CI job reads a
   public schedule feed, writes `packages/data/schedule.json`, and commits it. The phone decides
   live and upcoming from its own clock, so a rotation flip needs no deploy.
2. **Non-mega cups only.** Any format with "Mega" in its name (a Mega Edition of an open league, or
   a Mega X Cup) is skipped and logged. This season that leaves Retro, Little, Fantasy and GO LAIC.
3. **Leagues are live, upcoming (starts within 7 days) or off.** The Leagues sheet shows live and
   upcoming cups with a status line; off cups are not shown. The open leagues and Tournament are
   always there.
4. **A one-time nudge per cup run** ("Retro Cup is live this week. Switch?"). Never an auto-switch.
5. **A selected cup that has ended falls back to Great League** on the next open, with a one-line
   notice. Its battle log stays stored.
6. **A cup's Your meta window is its current run.** Back-to-back weeks of one cup are one run.
   Open leagues keep the season window.
7. **Little Cup is in**: the engine gains PvPoke's `evolution` filter, and 500 CP gets its first run.
8. **Stale rankings are labelled, not hidden.** A cup whose PvPoke rankings predate its run by more
   than 30 days says so in the app and in CI.
9. **PvPoke refreshes run daily and auto-merge when only data moved.** A change to PvPoke's battle
   code still opens a PR for review.
10. **`seasons.json` is maintained by the same job**, which retires the hand-kept list and its
    reminder issue.

## Where the schedule comes from

ScrapedDuck (`https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json`), a JSON
mirror of LeekDuck's events page. Entries with `eventType: "go-battle-league"` carry one GBL week
each, about two months ahead:

```
name:  "Ultra League, Master League: Mega Edition, and Retro Cup: Great League Edition | Twilight Trails"
start: 2026-09-22T20:00:00.000Z   end: 2026-09-29T20:00:00.000Z
```

Weeks flip Tuesdays at 20:00 UTC (21:00 after the November clock change). The feed is a scrape of
a fan site and may break or change shape. It is read only in CI, so a break leaves the last
committed schedule in force and never reaches a phone. Niantic's own season announcement is the
manual fallback.

The season as read on 2026-09-29 (non-mega cups in bold):

| Week of | Formats                                   |
| ------- | ----------------------------------------- |
| 09-22   | UL, ML Mega Edition, **Retro Cup (GL)**   |
| 09-29   | ML, Mega Color Cup (GL)                   |
| 10-06   | GL, UL and ML Mega Editions               |
| 10-13   | GL, UL Mega Edition, **Little Cup**       |
| 10-20   | UL, ML Mega Edition, **Fantasy Cup (GL)** |
| 10-27   | ML, Mega Halloween Cup (GL)               |
| 11-03   | GL, UL and ML Mega Editions               |
| 11-10   | GL, UL Mega Edition, **2026 GO LAIC Cup** |
| 11-18   | UL, ML Mega Edition, **2026 GO LAIC Cup** |
| 11-24   | ML, Mega Catch Cup (GL)                   |

## Data pipeline

### Feed parser

`packages/data/src/schedule.ts`. For each `go-battle-league` entry:

1. Split the name on `|`: the left side is the formats, the right side the season name.
2. Split the formats on `, ` and `, and ` / `and`.
3. Classify each format:
   - `Great League`, `Ultra League`, `Master League`: an open league, always on. Skipped.
   - Contains `Mega`: out of scope. Skipped and logged (`skipped mega: Mega Color Cup: Great League
Edition`).
   - Otherwise a cup. Strip a trailing `: Great League Edition` / `: Ultra League Edition` /
     `: Master League Edition` to get the cup title and the CP cap (1500 / 2500 / 10000).
4. Look the cup title up in `packages/data/cup-aliases.json`:

   ```json
   {
     "Retro Cup": { "cup": "retro" },
     "Fantasy Cup": { "cup": "fantasy" },
     "Little Cup": { "cup": "little", "cp": 500 },
     "2026 GO LAIC Cup": {
       "cup": "laic2027",
       "cp": 1500,
       "note": "unconfirmed: check the rules match"
     }
   }
   ```

   `cp` in the alias wins over the edition suffix; a cup with neither is an error. The league id is
   the PvPoke cup slug (`retro`, `little`), suffixed only when the cap comes from an Ultra or Master
   edition suffix (`fantasy-ultra`, `fantasy-master`), so one cup at two caps gets two leagues. A
   cap set in the alias is the cup's own and takes no suffix.

5. An unmapped title fails the step with the title in the message, and the job files an issue:
   "Map GBL cup 'Spooky Cup' to a PvPoke cup in packages/data/cup-aliases.json". Mapped entries are
   still written, so one unknown cup never blocks the rest.

The `2026 GO LAIC Cup` -> `laic2027` mapping is unconfirmed (PvPoke names the cup for the
championship season, Niantic for the year). The plan's first task compares Niantic's announced
rules with `cups/laic2027.json`; Travis confirms and the note is updated before the alias ships.

### `packages/data/schedule.json`

Committed, machine-written, sorted by start:

```json
[
  {
    "league": "retro",
    "cup": "retro",
    "cp": 1500,
    "title": "Retro Cup",
    "start": "2026-09-22T20:00:00.000Z",
    "end": "2026-09-29T20:00:00.000Z",
    "season": "Twilight Trails"
  }
]
```

One entry per cup per week; runs are derived, not stored. Weeks that have already ended are kept
until the season changes, so the Your meta run window (below) can see the start of a run that began
before the feed dropped its first week. Once a newer season has started, the previous season's
entries are dropped (an announced but unstarted season keeps the current one in place).

### `seasons.json` automation

The same step appends a season the first time its name appears in the feed: `id` is the last id
plus one, `name` from the feed, `start` from its earliest GBL week. If the newest listed season is a
placeholder whose start is within a day of the new season's start (today's
`{ "id": 29, "name": "Season 29" }`), it is renamed instead of appended. `check-seasons.ts` and the
"Season list needs the next season" issue are retired; the app's own stale-list warning stays as a
backstop.

### Leagues built

`packages/data/src/leagues.ts` gains `kind: 'rotation'`. `readLeagues()` adds one league per distinct
`league` id in `schedule.json`, whatever the date: the build never reads the clock, so its output
depends only on committed files and the existing cache key stays correct (add `schedule.json` and
`cup-aliases.json` to the `pages.yml` and `ci.yml` data cache keys).

- **Rankings**: PvPoke's `rankings/<cup>/overall/rankings-<cp>.json` at the pinned commit. A
  scheduled cup without that file is not built and is logged (`no rankings: fantasy at 1500`).
- **Meta**: PvPoke's meta group (`groups/<cup>.json`) when it exists, otherwise the first 48 entries
  of the cup's overall rankings.
- **Matrix**: simulated like any source league (about a minute each).
- **Title**: the feed's cup title ("Retro Cup"); `short` by the existing `shortTitle` ("Retro").
- **Freshness**: the date of the last PvPoke commit touching the rankings file at the pin
  (`git log -1 --format=%cs -- <path>` in the checkout; `fetch-pvpoke.ts` fetches enough history for
  it, blobless). Written to the league as `rankingsUpdated`. The league is `stale` when that date is
  more than 30 days before the start of the cup's next or current run.

Rotation leagues go into `leagues.json` with their other fields; the schedule itself ships as
`/data/schedule.json` next to it.

`PICKTHREE_SPECIAL_CUPS` and the `special` kind stay as they are; they are the path megas will take.

### The daily job

`.github/workflows/data-refresh.yml` becomes `daily-refresh.yml`, cron once a day (`17 6 * * *`):

1. **Schedule step.** Fetch the feed, rewrite `schedule.json` and `seasons.json`. The schedule and
   seasons changes are built and tested together with the PvPoke step, then committed to main in one
   bot commit when the build passes.
2. **PvPoke step.** As today (`data:refresh`, fetch, `vendor:sync`, `data:build`, tests). Then:
   - The vendor diff is empty (only the lock moved): commit the lock to main directly.
   - The vendor diff is not empty: open the PR as today, for review.
3. **Warnings**, each an issue deduplicated by title as the seasons check does today:
   - an unmapped cup title;
   - a scheduled cup starting within 7 days with no rankings at its cap;
   - a scheduled cup starting within 7 days whose rankings are stale;
   - the feed unreachable or unparseable (filed on the first failed day, closed on the next good day: the workflow token cannot keep a counter between runs).
4. After a push, the job dispatches `pages.yml` (a push made with the workflow token starts no workflows on its own).

Main's protection: the bot pushes with the workflow token (`contents: write`), as the refresh PR
branch does today. If a ruleset ever blocks it, the job falls back to a PR and says so in the log.

## Engine

- **`evolution` filter** in `gamedata/league.ts` `matches()`, mirroring PvPoke's
  `Pokemon.getEvolutionStage()`: 0 no family, 1 evolves and has no parent, 2 evolves and has a
  parent, 3 does not evolve and has a parent; the filter matches when the stage is in `values`.
  Uses `Species.evolutionStage`, baked at build time from PvPoke's raw family (our
  `evolutionIds` is inferred from parent links and disagreed with PvPoke for 3 species on
  2026-09-29).
- **`League`** gains `kind: 'rotation'` and optional `rankingsUpdated?: string` and
  `stale?: boolean`.
- **500 CP.** Caps are already per league (`buildOptionsFor`, `minCpFor`), so no change is expected.
  The e2e below is where anything 1500-shaped surfaces; fix it there.
- **Schedule logic**, a pure module `packages/engine/src/gamedata/schedule.ts`:
  - `type ScheduleEntry` (the JSON shape above).
  - `leagueStatus(schedule, leagueId, now)`: `{ state: 'live', end }` when a week of it contains
    `now`; `{ state: 'upcoming', start }` when its next week starts within 7 days; else
    `{ state: 'off' }`. Start is inclusive, end exclusive.
  - `currentRun(schedule, leagueId, now)`: `{ start, end }` of the run containing `now`, or of the
    last run if none does, or `null`. A run is weeks of one league where each next start is at or
    before the last end plus `RUN_GAP_DAYS` (2): the feed leaves a day between LAIC's two weeks.

## App

- **Leagues sheet** (`apps/web/src/components/LeagueSwitcher.tsx`): order is open leagues,
  Tournament, live cups, upcoming cups. `off` rotation leagues are not listed. The sheet list
  currently takes `kind === 'cup'`; it takes `'cup' | 'rotation'`.
- **Status line**: `ChoiceOption` (packages/ui `Select.tsx`) gains optional `detail?: string`, and
  `LeagueList` renders it as a second line under the title. Text, from `format.ts`:
  - live: `Live, ends Tue 9/29` (local time, weekday and month/day);
  - upcoming: `Starts Tue 10/13`;
  - stale, appended as its own line: `PvPoke last updated March 2024`.
- **The switcher row** is unchanged: a selected cup still takes the "..." slot.
- **Nudge**: on app open (after boot), if a rotation league is live, the player is not on it, and
  `settings.nudged` does not hold `<league>@<run start>`, show a `noticeToast`: "Retro Cup is live
  this week." with a "Switch" action. Showing it records the key, so it appears once per run
  whether tapped or not. Two cups live at once: the one that started first; the other waits for a
  later open.
- **Ended cup**: on app open, if `settings.league` is a rotation league whose status is `off` (not
  `upcoming`: a player building ahead for next week keeps their choice), set
  it to `great` and show "Retro Cup ended. Back to Great League." once. Logs under the cup id stay
  in IndexedDB and reappear when the cup runs again.
- **A cup opened from an old link or setting while off**: treated the same way (fall back, notice).
- **Your meta window**: `seasonWindow` (engine `yourmeta/season.ts`) takes an optional run; for a
  rotation league the window starts at `currentRun().start` instead of the season start. Stats
  bucket by run for rotation leagues ("This run", then earlier runs). The community board query
  passes the same `since`. Copy says "battles this run" where it says "this season".
- **Caching**: `/data/schedule.json` is under the existing `/data/` stale-while-revalidate route.
  An old copy only makes a cup appear or drop off later than it should.

## Testing

Logic is tested on synthetic data; live PvPoke data only gets invariants (the rule adopted
2026-09-29 when the value-pinned snapshots were retired).

- **Feed parser**: fixtures copied from the feed on 2026-09-29 (the Retro week, a Mega Edition
  week, the Little Cup week, both LAIC weeks, the Mega Catch week) plus one invented unknown cup.
  Asserts the cups extracted, the megas skipped, the caps, and the unmapped title reported.
- **Seasons automation**: new season appended with the next id; placeholder renamed; a season seen
  twice is not appended twice.
- **Schedule logic**: fixed clocks at one second before and after a flip, exactly 7 days before a
  start, and across LAIC's back-to-back weeks (one run, start 11-10, end 11-25).
- **Evolution filter**: every species in PvPoke's Little Cup rankings at the pin passes
  `allowedInLeague` for the Little Cup league (invariant on live data), plus synthetic species for
  each stage.
- **Build invariants** for each built rotation league: rankings present, meta size 1 to 48, the
  matrix covers the meta, every ranked species legal, `rankingsUpdated` set.
- **500 CP e2e**: the fixture collection at Little Cup produces teams whose members are all legal
  and at or under 500 CP, with the usual shape invariants from `recommend.e2e.test.ts`.
- **App**: sheet order and status lines; the nudge shows once per run and never for the current
  league; the ended fallback and its notice; Your meta's window and copy for a cup. All on
  synthetic schedules through `fakeHost`.
- **Screens**: new captures through the enforced `web:audit`, both themes: the Leagues sheet with a
  live, an upcoming and a stale cup; the nudge toast; the ended notice. No Claude Design round: the
  change reuses the list row (plus a second line) and the existing toast.

## Rollout

1. Engine: evolution filter, `rotation` kind, schedule logic.
2. Pipeline: parser, aliases, `schedule.json`, seasons automation, the daily job with auto-merge
   and warnings.
3. App: sheet status lines, nudge, ended fallback, run window.
4. Ship before 2026-10-13. Retro ends 2026-09-29, so Little Cup's first run is the live proof.

**Done** when, on 2026-10-13 at 20:00 UTC, pick3 lists Little Cup as live with no deploy that day,
the nudge fires once, and CI has already reported the state of Fantasy Cup's Great League rankings
(missing, or present once PvPoke publishes them).

## Out of scope

- **Megas**: Mega Editions and Mega X Cups. The next spec; it has to decide how a collection that
  never shows a mega form becomes mega picks.
- **Cups on meta.pick3.gg**: the site keeps to the open leagues.
- **Community opens on a GBL cup** feeding that cup's league: `OPEN_EQUIVALENT_CUP` in the counter
  worker maps only `great -> championshipseries`. Generalizing it (an event feeds the league whose
  cup matches its own) is small and waits for the first such event. Play! regionals keep playing
  the Championship Series ruleset whatever GBL runs, and stay in Great League's blend.
- **Rankings we compute ourselves** for a cup PvPoke has not ranked. Not ranked means not offered.
