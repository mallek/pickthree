# Tournament data: schema, ingest and the blend

Date: 2026-09-21. Status: decided with Travis, ready for a plan.

Phase 2 of the meta ranking design (`2026-09-18-meta-ranking-design.md`, "Out of scope"). That
document parked tournament results as "a facet on the existing band axis". This one replaces that
sentence: the band axis is retired as a filter, tournament data gets its own tables, and it enters
the default ranking as a better prior rather than as more ladder rows.

Source data: the handoff at `C:\Users\travi\rocky\content\pogo-tournament-data-handoff.md` and the
payload it points at (105 battles from the 2027 Baltimore Regional, read off the official Twitch
broadcast). Nothing in that payload is committed to this repo; the extraction pipeline lives in
`D:\Skunkworks\pogo-stream-spike` and talks to this repo only through the wire contract below.

## Summary of decisions

1. **Tournament records get their own tables**: `events`, `tournament_battles`, `roster_entries`,
   in the same Durable Object as the ladder `battles` table. The ladder table, its device count and
   its idempotency rule are never touched.
2. **The meta site's rank band select becomes a Source select**: All, PvPoke, GBL, Tournaments.
   Rank bands stop filtering anything. The app keeps sending them and the species page keeps its
   rank band breakdown card.
3. **Tournament data enters the default (All) ranking as a better prior**, blended in sequence:
   PvPoke's list is blended with tournament pick share on its own curve, and shared ladder battles
   are blended over the top on the existing curve, unchanged.
4. **Roster entries are modelled.** One row per event, player and slot, from RK9, with the form
   spelled out and an optional moveset. "Brought but never picked on stream" and moveset drift come
   from the join between roster and battles.
5. **Keyed ingest** under `/api/v1/events`, bearer token, upsert by id, nulls accepted, the worker
   stamps provenance. Delete is per event.
6. **The Play! ban list becomes a pick3 league** ("Tournament" in the league picker), built from the
   `championshipseries` cup PvPoke already ships. Great League recommendations do not change. The
   same bake gives the meta site the legality list it needs to print "banned" rather than zero.
7. **A tournament page** on the meta site is the next spec. This one stores everything it will
   need and ships the two read routes it will call, and builds no page.

## The data, in one paragraph

A regional is two days of best-of-three (best-of-five from the winners final on day 2), Great
League at 1,500 CP, under the Play! Pokemon Championship Series ruleset, which is PvPoke's `all`
ranking minus megas and Mimikyu. The broadcast shows both players' names, both full teams as
sprites, both picks per game, the running score and a match winner banner. The extraction reads
species names with hand-verified precision (92 of 92 correct), drops rather than guesses, and
leaves a winner null in 15 of 105 battles. It cannot read regional or shadow forms, because the HUD
prints the base name; RK9, the tournament software, publishes each competitor's six with the form
spelled out and the moveset, keyed by the same screen name the broadcast shows. The two sources
join on screen name plus event and neither has the other's half.

## Why a tournament battle is not a ladder battle

A ladder record is one reporter's view: my three, up to three opponents seen, my result, my device.
A tournament battle is symmetric: two named players, two full teams, one winner, no device, an id
that is stable across re-runs, and a result that a later pass may fill in. Storing it in the ladder
table means either picking a side as the fake reporter or inserting two mirrored rows, and either
way the "shared by N devices" line the site prints becomes a lie. So the tables are separate and
every view that combines the two populations is written deliberately.

## Phase 0: the Tournament league in pick3, and the legality list

Separable and first, because the read model in phase 1 depends on the legality list.

- **Data build.** `packages/data/src/leagues.ts` gains a shipped-cups allowlist,
  `['championshipseries']`, promoted to a league regardless of `PICKTHREE_SPECIAL_CUPS`. The league
  is `{ id: 'championshipseries', title: 'Tournament', short: 'Tournament', cp: 1500, cup:
  'championshipseries', kind: 'cup' }` with the cup's include and exclude rules copied from the
  gamemaster. PvPoke's `rankingAlias: all` means its rankings are Great League's; the build reuses
  `rankings/great`, `meta/great` and `matrix/great`, filtered to legal species, rather than
  simulating a second matrix. Matchups do not change when a species is banned, so filtering is
  exact.
- **Engine.** `engine/gamedata/league.ts` already mirrors cup include and exclude rules; nothing
  new. The eligibility pass drops Mimikyu and every mega for this league.
- **App.** The league appears in the league picker as "Tournament". Settings and the battle log
  accept the new id like any other. A battle logged under it is shared under that league id; the
  meta site lists no such league and ignores it.
- **Meta bake.** `apps/meta/scripts/bake.ts` writes `public/legal/<league>.json` for each site
  league: `{ cup, banned: string[] }`, where `cup` is the open-equivalent tournament cup for that
  league and `banned` is every species id the cup excludes that the league's ranking lists. The
  allowlist of open-equivalent cups is one constant, `{ great: 'championshipseries' }`, written
  in both the bake and the worker, each copy asserted by its own test: the site and the worker
  share no code, and the worker needs the map to say which events blend. Ultra and Master have
  no Play! format and get `{ cup: null, banned: [] }`. The bake writes only the site's leagues
  (`kind: 'standard'`) to the site's `leagues.json` and loops only those for baseline, ranks,
  matrix and legal files; the Tournament league is the app's, never the site's.

The Tournament league in the app and the Tournaments source on the site are different things: one
is a ruleset to build a team for, the other is a population of observed battles. The spec uses the
singular for the league and the plural for the source, and the UI does the same.

## Phase 1: storage, ingest and read routes

### Tables

All in the `MetaStore` Durable Object, created alongside `battles` with the same
`CREATE TABLE IF NOT EXISTS` pattern.

```
events
  id            TEXT PRIMARY KEY     -- slug, e.g. 2027-baltimore-regional
  name          TEXT NOT NULL
  start_date    TEXT NOT NULL        -- ISO date
  end_date      TEXT NOT NULL
  league        TEXT NOT NULL        -- site league id, e.g. great
  cup           TEXT NOT NULL        -- PvPoke cup name, e.g. championshipseries
  vods          TEXT NOT NULL        -- JSON string[]
  notes         TEXT
  received      TEXT NOT NULL

tournament_battles
  id            TEXT PRIMARY KEY     -- stable, from the pipeline, e.g. v2878411375-001
  event         TEXT NOT NULL        -- events.id
  league        TEXT NOT NULL        -- copied from the event so window reads need no join
  cup           TEXT NOT NULL        -- same
  at            TEXT NOT NULL        -- ISO time: VOD publish time plus offset
  day           INTEGER NOT NULL     -- 1 based
  stage         TEXT NOT NULL        -- groups | top_cut
  grp           TEXT                 -- group letter or null
  round_label   TEXT
  match         TEXT NOT NULL        -- pipeline's match key, unique within the event
  game          INTEGER NOT NULL     -- 1 to 7
  match_format  TEXT NOT NULL        -- bo3 | bo5
  bracket       TEXT NOT NULL        -- winners | losers | grand
  bracket_depth INTEGER NOT NULL     -- 1 to 9
  left_player   TEXT NOT NULL        -- screen name
  right_player  TEXT NOT NULL
  left_team     TEXT NOT NULL        -- JSON string[], 1 to 3 species ids
  right_team    TEXT NOT NULL
  left_forms    TEXT NOT NULL        -- JSON ('rk9' | 'unresolved')[], aligned with left_team
  right_forms   TEXT NOT NULL
  winner_side   TEXT                 -- left | right | null
  result_source TEXT                 -- score | banner | format | human | null
  score_at_start TEXT NOT NULL       -- JSON [left, right]
  evidence      TEXT NOT NULL        -- JSON string[] of frame file names
  notes         TEXT
  source        TEXT NOT NULL        -- stamped by the route: broadcast
  extractor     TEXT NOT NULL        -- pipeline name and version, like the ladder's client
  received      TEXT NOT NULL

  INDEX (league, at)
  INDEX (event)

roster_entries
  event         TEXT NOT NULL
  player        TEXT NOT NULL        -- screen name
  slot          INTEGER NOT NULL     -- 1 to 6, order not meaningful
  species       TEXT NOT NULL        -- species id with form, e.g. corsola_galarian
  fast          TEXT                 -- null when the moveset was not provided
  charged       TEXT                 -- JSON string[] of 1 or 2, null with fast
  received      TEXT NOT NULL

  PRIMARY KEY (event, player, slot)
  INDEX (event, species)
```

Everything the payload carries is stored. The tournament page (next spec) renders a bracket, and a
bracket cannot be rebuilt from a trimmed row.

### Identity and privacy

- The screen name is the only identity anywhere in these tables. It is the join key between
  broadcast and roster and the display name on any page that shows a match. It is public on the
  broadcast and on RK9's roster.
- **The roster parser never reads RK9's first name, last name or country columns.** Not fetch and
  discard, not store and filter: never extracted, so there is no moment at which a legal name exists
  on our side. Decided by Travis on 2026-09-21 and not open. Country is left out until something
  needs it.
- Notes never contain a person's name, screen names included. Notes describe the format and the
  footage. The pipeline is the only writer, so this is a rule on the writer, not a filter.
- Movesets are shown aggregated per species everywhere. Nothing prints "player X ran species Y with
  move Z". A tournament page may show what the broadcast showed: screen name, picks and result per
  match.

### Forms

Each pick carries a form source, aligned with the team array:

- `rk9`: the pipeline joined the player to a roster entry and took the species id, with form, from
  there. This is the expected case: every broadcast player is on the roster.
- `unresolved`: no roster match. The species id is the base form. The read model counts the pick
  and marks the row "form not confirmed"; it never guesses.

There is no prior-inferred fallback. Picking the better ranked form is circular (the prior confirms
itself) and fails on every shadow case, since a shadow ranks next to its base by construction.

### Wire contract

Routes, all under the worker, all requiring `Authorization: Bearer <INGEST_TOKEN>` (a worker
secret like `ERRORS_READ_TOKEN`) and no Origin check. This is a script calling, not a browser. The
phone's `/battles` route cannot reach these tables and these routes cannot reach the ladder table;
the token is what makes the population unforgeable.

```
PUT    /api/v1/events/<id>            declare or update an event
POST   /api/v1/events/<id>/battles    up to 200 battles, upsert by id
POST   /api/v1/events/<id>/roster     up to 200 roster entries, upsert by (player, slot)
DELETE /api/v1/events/<id>            the event, its battles and its roster, in one go
```

Event body:

```json
{
  "name": "2027 Baltimore Pokemon GO Regional Championships",
  "startDate": "2026-09-18",
  "endDate": "2026-09-20",
  "league": "great",
  "cup": "championshipseries",
  "vods": ["v2878411375", "v2879365540"],
  "notes": null
}
```

Battles body:

```json
{
  "extractor": "pogo-stream-spike 0.3",
  "battles": [
    {
      "id": "v2878411375-051",
      "at": "2026-09-18T21:55:13Z",
      "day": 1,
      "stage": "groups",
      "group": "G",
      "roundLabel": "LOSERS FINALS - GROUP G",
      "match": "day1-22",
      "game": 1,
      "matchFormat": "bo3",
      "bracket": "losers",
      "bracketDepth": 7,
      "left": {
        "player": "FRANKIETS2",
        "team": ["altaria", "clodsire", "melmetal"],
        "forms": ["rk9", "rk9", "rk9"]
      },
      "right": {
        "player": "ITSAXN",
        "team": ["corviknight", "dunsparce", "houndoom_shadow"],
        "forms": ["rk9", "rk9", "rk9"]
      },
      "winnerSide": null,
      "resultSource": null,
      "scoreAtStart": [0, 0],
      "evidence": ["v2878411375_06-55-34_score_0-0.jpg"],
      "notes": null
    }
  ]
}
```

Roster body:

```json
{
  "entries": [
    {
      "player": "FIRESTAR73",
      "slot": 1,
      "species": "corsola_galarian",
      "moves": { "fast": "ASTONISH", "charged": ["NIGHT_SHADE", "POWER_GEM"] }
    },
    { "player": "FIRESTAR73", "slot": 2, "species": "jumpluff_shadow", "moves": null }
  ]
}
```

Validation, in the style of `parseBatch`:

- Event id `^[a-z0-9-]{3,64}$`. Battle id `^[A-Za-z0-9_-]{1,64}$`. Species ids `^[a-z0-9_]+$`.
  Moves `^[A-Z0-9_]+$`. Screen names 1 to 40 printable 7-bit ASCII characters, stored as sent,
  compared case-insensitively. Notes up to 500 printable 7-bit ASCII characters or null.
- `team` has 1 to 3 entries and `forms` has the same length. `winnerSide` and `resultSource` are
  both null or both set. `game` 1 to 7, `bracketDepth` 1 to 9, `day` 1 to 3, `scoreAtStart` two
  integers 0 to 3. `charged` has 1 or 2 moves.
- A record is rejected for shape only, never for gaps. Partial teams, null winners, missing
  movesets and unresolved forms all validate. 15 of Baltimore's 105 battles have no winner, and
  that is honest data.
- Battles and roster entries are **upserts**, not insert-or-ignore. A re-run that resolves a winner
  the first pass left null must replace the row; `evidence` and `resultSource` ride along so the
  replaced row still says why. The event must exist before its battles or roster are accepted
  (404 otherwise), and a battle's event and league come from the event, never from the body.
- The route stamps `source: 'broadcast'` on every battle. A hand-entered result would be a third
  route value later, never client-supplied. `extractor` is stored like the ladder's `client`.
- Response: `{ stored, replaced, rejected }` counts, and on rejection the first offending index and
  reason, so a pipeline run fails loudly.

### Read routes

The existing routes keep their paths. Their `band` query parameter is replaced by `source`, one of
`all` (default), `ladder`, `tournament`. An old link carrying `band=` is served as `source=all`.
`prior` needs no worker call; the site serves it from the bake.

`GET /api/v1/meta?league=&since=&until=&source=`

- `source=ladder`: exactly today's response. `bands` stays in it as a breakdown.
- `source=tournament`: the same `MetaSummaryV1` shape from the tournament tables. `battles` counts
  each battle once. `devices` is 0 and the site never prints it for this source. `sources` is
  `{ broadcast: n }`. `bands` is `{}`. Species stats: each side that picked a species is one
  sighting and one run; `wins` and `losses` are the **other** side's result, so "players went 31-26
  against Melmetal" means what it means on the ladder today; `runWins` and `runLosses` are the
  picking side's. A battle with no winner counts a sighting and no result. Plus a `tournament` block
  (below).
- `source=all`: the ladder response plus a `tournament` block:

```
tournament: {
  events: number,                 // events in the window on the league's open-equivalent cup
  battles: number,
  eventsOther: number,            // events in the window on other cups: shown, never blended
  species: [{ speciesId, picks, game1Picks, wins, losses, unresolvedForms }]
}
```

`GET /api/v1/species/<id>?...&source=`: the detail as today, with a `tournament` block: picks,
game1 picks, record against it, by-depth counts, `broughtBy` and `rosterSize` (players whose
roster lists it, over players on the roster who appear in at least one streamed battle),
`pickedOnStream` (their streamed battles in which they picked it), movesets over roster entries
with a known set, and `movesetsKnown` out of `broughtBy`.

`GET /api/v1/teams?...&source=`: the board as today. Under `tournament`, each battle contributes
two run rows (each side, with its result) and two faced rows. Under `all`, ladder and tournament
rows are merged and `sources` says how many of each.

Two routes for the tournament page, built now so nothing is thrown away:

```
GET /api/v1/events?league=&since=&until=
  -> { events: [{ id, name, startDate, endDate, cup, battles, decided, players, blended }] }

GET /api/v1/events/<id>
  -> { event, matches: [{ match, day, stage, group, roundLabel, bracket, bracketDepth,
         matchFormat, left, right, games: [{ game, at, leftTeam, rightTeam, leftForms,
         rightForms, winnerSide, resultSource, scoreAtStart, notes }] }],
       roster: [{ player, species: [{ species, moves }] }],
       species: [{ speciesId, picks, game1Picks, wins, losses, byDepth: number[9], broughtBy }] }
```

`blended` is whether the event's cup is the league's open-equivalent cup. Both are cached like the
other reads (10 minute buckets).

### Which events feed the blend

Only events whose cup is the league's open-equivalent cup (`championshipseries` for Great League)
enter `source=all`. Sao Paulo's `laic2027` bans four types and fifteen named species; pooling it
into a Great League ranking would be nonsense. Events on other cups are stored, listed, and shown
under Tournaments with their cup named, and never blended. The rule is data (the bake's allowlist),
not a judgement made at ingest.

## Phase 2: the meta site

### The Source select

The rank band select in the top bar becomes a Source select with four values:

| value | label | what it shows |
|---|---|---|
| `all` | All | the default: PvPoke, tournaments and GBL blended, weights stated |
| `prior` | PvPoke | the curated list alone, from the bake, no worker call |
| `ladder` | GBL | today's page: PvPoke blended with shared ladder battles |
| `tournament` | Tournaments | PvPoke blended with tournament picks, banned species marked |

The URL parameter is `source`. Old links with `band=` land on All. The rank band card on the
species page stays as a breakdown; it already says it is a hint below 100 battles. Rank bands are
self-reported and Travis does not expect them to be reported accurately, so they are no longer a
filter anywhere.

### The blend

`apps/meta/src/rank.ts` gains two constants next to the existing two, as half-say points and never
as gates:

```
HALF_SAY_TOURNAMENT_BATTLES = 100
HALF_SAY_EVENTS = 2
```

and the ranking becomes two blends in sequence:

```
aT     = min(tBattles / (tBattles + 100), events / (events + 2))
p1     = (1 - aT) * pvpokePrior + aT * tournamentShare
aL     = min(battles / (battles + 300), devices / (devices + 5))       (unchanged)
weight = (1 - aL) * p1 + aL * ladderShare
```

`tournamentShare` is a species' picks over total picks across the list, normalised like
`ladderShare`. The list is PvPoke's curated group plus everything faced on the ladder plus
everything picked at a blended event; a species PvPoke does not rank takes prior 0 as today.

Why this shape:

- The ladder curve and the device line are untouched. Tournament battles never count as shared
  battles or as devices.
- With almost no ladder data, as now, the default list is roughly two thirds PvPoke and one third
  Baltimore: `aT = min(105 / 205, 1 / 3) = 0.33`. Tournament data drives the default, which is the
  intent.
- As shared battles grow, tournament data recedes behind what GBL players actually face. Tournament
  players are a different population and the site is for ladder players.
- It uses pick share only. Tournament win rates are strength minus preparation (Melmetal is the most
  brought and wins 46 percent; people arrived built to beat it) and never feed the blend. They print
  per row under Tournaments with the usual confidence tags.
- 100 battles because a tournament battle carries two full teams and a verified result, roughly
  three ladder records of information. 2 events because one event is one local meta, the same
  reason one phone is held to a sixth of the say.

Per view: `prior` is `weight = pvpokePrior`. `ladder` is today's formula. `tournament` is `p1`.
`all` is the full sequence. The team projections use the same `weights` map as today, so Suggest
teammates in pick3 sees the blended weights too.

**Banned species skip the tournament term.** A species the league's legality list bans has no
tournament share, not a zero one: its `p1` is the plain prior. Mimikyu stays where GBL players
meet it under All and shows "banned at tournaments" under Tournaments. Zero says nobody picked it,
which is false; missing says not observable in this population.

### The header line

The sentence under the Pokemon list states the weights as the visible weight the CLAUDE.md rule
requires. Under All:

> PvPoke 45%, tournaments 22%, GBL 33%. From 148 shared battles by 9 devices and 105 tournament
> battles from 1 event.

(148 by 9 gives `aL = min(148 / 448, 9 / 14) = 0.330`; 105 at 1 event gives `aT = 0.333`; the
three percentages are `(1 - aL)(1 - aT)`, `(1 - aL) aT` and `aL`. The counts and the percentages
generate each other, so the sentence can be a test fixture.)

Under GBL, today's sentence. Under Tournaments:

> 33% from tournaments, 67% PvPoke. From 105 battles at 1 event. Not shared ladder play.

Under PvPoke: "PvPoke's list, commit <short> from <date>. Nothing measured." Percentages are
`(1 - aL) * (1 - aT)`, `(1 - aL) * aT` and `aL`, rounded, and the copy is generated from the same
numbers the blend uses, the way `Pokemon.tsx` already ties its sentence to `measuredSay`.

### Species page

- The record card gets a tournaments row under the ladder figures when the species was picked at
  any event in the window: picks, game one picks, record against it with a confidence tag.
- One line from the roster join: "Brought by 4 of 16 players seen on stream, picked in 34 of their
  streamed battles." "Never picked" always means never picked on stream; the copy says so.
- The movesets block, which today shows what reporters ran it with, gains a tournaments section:
  sets from roster entries, with PvPoke's recommended set marked, over known sets only, with the
  count of known sets stated. A missing moveset is left out of the denominator; it is never
  counted as "ran the recommended set".
- A pick with an unresolved form is counted under the base species and the row says "form not
  confirmed for N picks".
- Banned species: the tournaments row reads "banned at tournaments" and shows no counts.

### Team board

No new UI. Tournament sides are run teams with results, so cores and complete teams roll up. Under
All the board says how many rows came from each source.

### Movesets in projections

Where a moveset is needed to compute something and the roster entry has none, the projection falls
back to PvPoke's recommended set, the same fallback the ladder path already uses when the phone did
not know the moves. Counting and computing are different operations and get different fallbacks.

## Rules

- No em dashes in code, docs, copy or commits. Player-facing output is 7-bit ASCII; notes and
  screen names are validated to that at ingest.
- The collection never leaves the device. Nothing in this design touches the app's outbound calls;
  the app gains a league and nothing else.
- The site never presents a projection as a measured result and never hides measured numbers for
  being small. The four half-say constants stay in `rank.ts` as half-say points.
- Never a real Poke Genie export in the repo. Also never a real tournament payload: test fixtures
  are synthetic events with invented screen names, made by a generator under `fixtures/`, so no
  person's handle is committed.
- Braces on all control flow. Exact pinned versions. Stage explicit paths.

## Testing

- **Worker.** Parse and reject tests for each route in the style of `parseBatch`: shape rejected,
  gaps accepted, upsert replaces, delete cascades, missing event is a 404, wrong token is a 401.
  Read model tests over a synthetic event: sightings and wins invert correctly for the faced side,
  both sides land on the team board, a battle with no winner counts a sighting and no result,
  unresolved forms count under the base id, events on a non-blended cup appear in `eventsOther`
  and never in `tournament.species`. The worker carries no legality data: a banned species is
  simply absent from the tournament block, and the site turns that absence into "banned" from
  `legal/<league>.json`, tested there. `source=ladder` responses are what `band=all` returned,
  over the existing fixtures, every field equal except the echoed parameter. Through phase 1 the
  `band=` filter keeps working as today, so the deployed site's rank band select is not a silent
  no-op between the phase 1 and phase 2 deploys; it is retired in phase 2 with the select. One shared test file asserts that the
  ladder and tournament read paths return the same shape.
- **Site.** `rank.ts` tests for the sequential blend: the four views, the worked Baltimore case
  (`aT = 0.33`), a banned species holding its prior, a species picked at tournaments but unranked by
  PvPoke, and the degenerate cases (no events, no ladder, both). Header line copy generated from
  the same numbers. The existing screens pass (`meta:screens`) with the Source select in place of
  the band select and no console errors.
- **Data build.** The Tournament league exists, lists no Mimikyu and no megas, and its rankings,
  meta group and matrix are Great League's minus the banned entries. The bake writes
  `legal/great.json` with `mimikyu` in it and `legal/ultra.json` with an empty list.
- **Engine.** Eligibility for the new league excludes Mimikyu; the golden test is unaffected since
  no vendored file changes.

## Out of scope, and the next spec

- **The tournament page.** A page on the meta site listing events and rendering one event: bracket
  by match in order, per-game picks and results by screen name, the species rollup with game one
  share and by-depth counts, the roster aggregate. This spec ships its two read routes and stores
  every field it needs. It builds no page and adds no tab.
- **Hand-entered results.** A third `source` value on the battles route with its own token. Not
  built until an event exists that was not broadcast.
- **A weighting by bracket depth.** Stored per battle, shown per event, never fed to the blend.
  The theory that results near the trophy lead the ladder meta harder is testable only if the two
  series are kept apart, which is the reason the blend uses pick share and nothing else.
- **Testing whether tournaments lead the ladder.** Requires several events and a ladder season.
  Both series are stored with times, so it can be done later from the data alone.
- **Country on the roster.** Not read until an analysis needs it.
- **Feeding measured data back into pick3's recommendations.** Still out, as before. Suggest
  teammates reads the blended board and that is the whole surface.

## Plan order

Phase 0 first (bounded, standalone: the Tournament league and the legality bake). Then phase 1
(tables, ingest contract, read routes, with the worker tests), which can land dark since nothing
reads `source=` yet. Then phase 2 (Source select, blend, header, species page). Baltimore is
ingested by the extraction repo against the deployed worker after phase 1, and is the first thing
phase 2 renders.
