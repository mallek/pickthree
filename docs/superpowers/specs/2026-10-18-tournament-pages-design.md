# Tournament pages: the teams players brought, event by event

Date: 2026-10-18. Status: approved by Travis 2026-10-18.
Mock: branch `mock/tournament-teams` (worktree `D:\Skunkworks\pickthree-mock-events`), screen
`apps/web/src/screens/MockEvents.tsx`, captures from `apps/web/scripts/mock-events.mjs`. The mock
is throwaway; this document, not the mock's code, is the source for the build.

## Intent

pick3 already reads official Play! Pokemon GO broadcasts (StreamScanner) and stores every battle
in the counter worker's tournament tables, but the only place a player sees that work is a blended
number on the Meta tab. Travis wants the teams themselves visible, the way mtgtop8 lists decks
under each event: open a recent tournament, see who finished where, see the six each player
brought, how often they picked each one, the threes they actually ran, and watch any game.

The site is about the current meta, so only recent events are listed. A tournament from two
months ago is less relevant, and that cutoff conveniently matches how long Twitch keeps the
broadcasts, so every Watch link on the page works.

## Goals

- A Tournaments list reachable from the Meta tab: recent events, newest first.
- One page per event: the day broadcasts, then every player seen on stream, ordered by finish.
- Each player shows all six Pokemon they brought, with how many of their on-stream games each was
  picked in, and opens onto: their most played threes (each opens in Build), their movesets when
  the RK9 team list has them, and their picks game by game with a Watch link to that game.
- Incomplete data is normal (the scan misses games, RK9 may not have published team lists, a tag
  may be unread) and the pages show it as a gap, never hide it or invent around it.

## Non-goals

- Full standings. Only players who appeared on stream are known; the page never claims to list
  the whole field.
- A per-streamer index. Travis raised it and left it open; the Twitch link per day covers the
  broadcast for now.
- Older events. They drop off the list (their battles stay in the database and in the meta blend
  exactly as today).
- Run this team. Travis: one link, to Build; the player can run it from there.
- Any change to how tournament data feeds the meta blend.

## Anti-goals (would make this a failure even if it works)

- Breaking the signed look. Build only from signed parts (below); no invented card styles. The
  first meta-in-pick3 mocks were rejected for exactly this.
- Presenting a guess as a fact: a slot nobody saw filled with a likely Pokemon, a record padded
  past what was read, a finish label the data does not support.
- A Watch link that leads to a deleted video.
- Showing a first name, last name or country. The screen name is the only identity (unchanged
  rule).

## Constraints

- pick3 CLAUDE.md rules apply: braces, exact pins, no em dashes, signed UI parts and tokens only,
  no new color literals, the audit plus Travis's signature before a redesigned page is done.
- Tournament records are read through the existing public read routes; writes stay on the keyed
  `/api/v1/events` routes. No real tournament payload is ever committed; tests use
  `fixtures/make-tournament.ts` (extend it for any new field or case).
- The worker's CORS allows only pick3.gg; local work against live data needs a relay (the mock's
  capture script intercepts `/api/v1/events/*` in puppeteer).
- `connect-src` already allows the counter worker. The Twitch links are plain navigations
  (`target="_blank"`), not fetches, so the CSP does not change.
- These reads are opened by the player (they tapped into Tournaments), so, like the Meta tab's
  other reads, they do not follow the sharing switch.

## What Travis decided

1. Master page is the tournament; drill down is a player, showing the teams they brought and their
   picks.
2. Incomplete data must be supported throughout.
3. Recent events only (the meta is the point). Watch links are acceptable because of that.
4. Cards are larger than Top teams' rows and show all six Pokemon a player brought.
5. Movesets reuse Build's lineup card (`pick-card filled`: sprite, name with type chips, F and C
   move lines with type chips). Travis did not like the mock's first, list-style moveset card.
6. One action on a team, and the row is the action: under a "Build these teams" header (with the Teams tab glyph, three circles, in violet), each team is
   a Most-logged-teams row (`team-row`, MetaHome) and tapping it opens Build with that three. No
   buttons, no Run this team (the player runs it from Build).
7. Back from Build must not be weird: it returns to the event with the same player open and the
   scroll where it was (see Routes).

## The pages, as mocked and approved

### Meta tab entry

A Your-battles style `action-row` on the Meta home: "Tournaments · N events", with the newest
event's name and dates as its line. It reads only the event list route (no champion, so the Meta
landing makes one small read, not one per event). Hidden when there are no recent events or the
league is not Great or Tournament.

### Tournaments (`#/meta/events`)

Sub-header "Tournaments" with Back to Meta. A fine-print line on where the data comes from. One
card per recent event, newest first, each a `tb-team-row` with a larger head: event name (short
form, "Nice Regional"), dates, "N battles on stream", "Champion <name>" when known, and the
champion's six in a six-slot row. Tapping opens the event. The list route has no champion or six,
so this screen fetches each recent event's detail (a handful at most, cached for the session like
the other v1 reads); the cards render from the list row first and fill in. (My call; adding a
champion to the list route is the alternative if this proves slow.)

### Event (`#/meta/events/<id>`)

Sub-header with the event's short name. A fine-print line: dates, battles, players on stream,
league. A "Watch day N" `action-row` per broadcast day, linking to the Twitch VOD. Then "Players":
one large card per player seen on stream:

- Head: screen name, finish (a `Tag`: Champion, Finalist or Top cut; see Data 3), games on stream, the on-stream record on the right, and "N of 6 seen" when there
  is no team list.
- The six-slot row: sprites at 44px, with "picked/games" under each (for example 16/17). A slot
  never seen is a dashed circle with "?".
- Opened in place (one open at a time, like Top teams):
  - "Build these teams" (Teams tab glyph beside it): each distinct three they ran, as a `team-row` (32px sprites, "N games",
    the record in bold). The three most played show, the rest behind "Show N more". Tapping a
    row sets Build's three picks (`setPick`, species picks with `preferOwned`, carrying the RK9
    moves when the team list has them) and opens Build, as Most logged teams does. Ordered by
    games played (my call).
  - "Movesets (RK9 team list)": six Build lineup cards. The role pill shows "N of M" (picked in N
    of the player's M games). No remove button or drag grip. "Moves not listed" when RK9 has the
    species without moves. With no team list at all, a line says the six are what the broadcast
    showed.
  - "Picks, game by game": per match, "vs <opponent> · <round>", then per game their three, a W or
    L result chip (the Log a Battle chips), the opponent's three smaller, and "Watch".

## Data

What exists (counter worker, public reads):

- `GET /api/v1/events?league=&since=&until=`: the event list with battles, decided, players.
- `GET /api/v1/events/<id>`: event (with `vods`, one per day), `matches` (each with day, stage,
  round label, bracket, bracket depth, format, both players, and games with both teams, forms,
  winner side, result source, score at start), `roster` (player, six species with moves) and
  `species`.

Gaps the build has to close:

1. **Watch per game: no wire change needed.** Both pipelines encode a game's `at` as
   `startDate + (day - 1) days + seconds into that day's VOD` (StreamScanner `at_iso` in
   `streamscanner/build.py`; Baltimore and Frankfurt use the same encoding). So the VOD offset is
   `at - (startDate + day - 1)`, worked out on the phone, for every stored event. Make this a
   documented contract: a comment at `at_iso`, a note in the worker's tournament types, and a
   test on the synthetic event. (My call, from the builder check.)
1b. **VODs by day.** `event.vods` is a list that skips days without a VOD (StreamScanner's
   `EventConfig.vods()` drops them; Baltimore is 3 days with 2 VODs). Indexing it by day can link
   the wrong broadcast. Change the event wire and store to say which day each VOD belongs to
   (for example `vods: [{ day, id }]`, old bare lists read as days 1..n only when their length
   equals the day count, else no day links), StreamScanner sends the day, and a day without a VOD
   gets no Watch links. Re-upsert Nice, Frankfurt and Baltimore events (event record only).
   (My call.)
2a. **Which league.** Events are stored as Great League and the list route filters on league.
   Tournaments shows when the league setting is Great League or the Tournament league
   (`championshipseries`, which reads Great League's data, so it asks for `great`); on any other
   league the Meta home row is hidden. (My call.)
2. **Recent.** "Recent" is events whose end date is within 55 days of today (my number: Twitch
   keeps a partner channel's past broadcasts about 60 days; Baltimore's, 30 days old, still play
   on 2026-10-18). The list route already takes a window; the client asks for the last 55 days.
   Check the worker's `MAX_SPAN_DAYS` allows it.
3. **Finish: only what the bracket proves.** Not stored; derived. Champion and Finalist from the
   grand final; "Top cut" for anyone seen in a top cut match; nobody else gets a label (the card
   just says games on stream). The mock's 3rd, 4th, Top 8, Day 2 and Day 1 are dropped: group
   finals are played on day 2, bracket depth is relative to what was seen on stream, and the cut
   size is not known for every event, so those labels could claim what the data does not show.
   When the grand final's game count is short (Nice: the scan missed two games), the last game's
   winner decides it; if that is missing too, no Champion is shown. Engine, pure, tested on the
   synthetic event. (My call, from the builder check.)
4. **Player identity.** The screen name as stored. Known data issue: Baltimore's champion is
   stored as the raw tag "ZZWEILOUS (U)", not an RK9 screen name. Fix the data (re-upsert), not
   the UI.
5. **Six slots.** From the roster when there is one; else the distinct species seen in the
   player's games, in first-seen order, padded with unseen slots to six. A player seen with more
   than six distinct species (a misread) shows the first six; flag it in review, not on the page.

## Where the code goes (builder's call within these lines)

- Pure logic in `@pickthree/engine/meta` beside the other tournament code: finish, six slots, pick
  counts, threes with records. Tests on the synthetic tournament fixture.
- Reads in `apps/web/src/metaData.ts` and hooks in `state/useMeta.ts`, like the other v1 reads.
- Routes `meta-events` and `meta-event` in `state/store.tsx`, under the Meta tab in `App.tsx`.
  The event route carries the open player (`#/meta/events/<id>?p=<screen name>`) and the screen
  keeps its scroll (`useScrollMemory`), so Back from Build lands on the same open card. Build's
  own Back already goes back through history.
- Screens in `apps/web/src/screens/`, built from: `tb-team-row` / `row-head` / `row-body` /
  `row-part` / `row-label` / `build-line` / `tb-actions` (Top teams), `action-row` (Your battles),
  `pick-card filled` and its parts (Build), `result-chip` (Log a Battle), `PokemonToken`, `Tag`,
  `TypeChip(s)`. The six-slot row and the larger card head need CSS classes in `app.css` (the mock
  uses inline styles); the "?" slot uses existing tokens.
- StreamScanner: send the VOD offset per battle.
- `web:screens` gets the two new screens with a synthetic event (the screens job runs offline).

## Left to the builder

- Copy wording beyond what is quoted here.
- Empty, loading and error states (follow Top teams and the species page).
- Whether a tap on a sprite opens its species page.
- The exact six-slot row sizing at 320px width.
- Whether the round label is cleaned up for display (StreamScanner's labels can be noisy, for
  example "WINNERS ROUND2 AL GROUP B").
