# Tournament Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tournaments list and per-event pages on the Meta tab that show every on-stream player's six, how often each was picked, the threes they ran (tap to Build), their movesets, and their games with Watch links.

**Architecture:** The counter worker learns day-keyed VODs (accepting the old bare list); StreamScanner sends them. All tournament page logic (finish, six slots, pick counts, threes, VOD offsets, the recent window) is pure code in `@pickthree/engine/meta/events.ts`, tested on the synthetic event. The web app adds two reads, two routes, a Meta home row and two screens built only from signed parts.

**Tech Stack:** TypeScript 5.9 strict, React 19, vitest 4 + Testing Library, Cloudflare Worker (Durable Object SQLite), Python 3 (StreamScanner, pytest).

**Spec:** `docs/superpowers/specs/2026-10-18-tournament-pages-design.md` (read it first). Mock for look and feel only: `D:\Skunkworks\pickthree-mock-events\apps\web\src\screens\MockEvents.tsx` (throwaway; inline styles there become classes here).

## Global Constraints

- Braces on all control flow; exact pinned versions; no em dashes anywhere (code, copy, commits).
- UI only from signed parts and `packages/ui` tokens; no new color literals outside `tokens.css` (`npm run check-colors` must stay at baseline).
- Never commit a real tournament payload. Tests use `fixtures/make-tournament.ts` output only.
- The screen name is the only player identity. Never a first name, last name or country.
- Recent = events whose `endDate` is within 55 days of today. Tournaments shows only when the league setting is `great` or `championshipseries`.
- Finish labels only: `Champion`, `Finalist`, `Top cut`. No 3rd, 4th, Top 8, Day 1, Day 2.
- Copy fixed by the spec: section header "Build these teams" with the Teams tab glyph; "Movesets (RK9 team list)"; "Moves not listed"; "Picks, game by game"; "Watch"; "Watch day N"; "N of 6 seen".
- Stage explicit paths; never `git add -A`. Do not push or deploy without Travis. StreamScanner: commit to main; its CLAUDE.md rules apply (key never in files/argv/env; events/ is gitignored).

## Review Focus

1. A player with no roster and fewer than six species seen: dashed "?" slots fill to six, card says "N of 6 seen" (test in Task 3).
2. A grand final with an even or short game count, or no decided games: last decided game's winner, else no Champion; never two champions (Task 3).
3. A day with no VOD (legacy list shorter than the day count): no "Watch day N" row and no per-game Watch for that day, never a link to another day's broadcast (Tasks 1 and 3).
4. Back from Build returns to the same event with the same player open (`?p=`) and the scroll kept (Task 6).
5. A league other than Great or Tournament: no Meta home row and no read (Task 5).

---

### Task 1: Worker: day-keyed VODs and a contract-true fixture

**Files:**
- Modify: `workers/counter/src/tournament.ts` (EventInput, parseEventBody)
- Modify: `workers/counter/src/tournamentStore.ts` (EventRow, eventRow)
- Modify: `fixtures/make-tournament.ts`, regenerate `fixtures/tournament-sample.json` (`npm run fixtures:tournament`)
- Test: `workers/counter/test/tournament.test.ts`, `workers/counter/test/tournamentStore.test.ts`

**Interfaces:**
- Produces: `export interface VodDay { day: number; id: string }` in `tournament.ts`; `EventInput.vods: VodDay[]`; `EventRow.vods: VodDay[]` (so `EventDetailV1.event.vods` is `VodDay[]` on the wire).
- Produces (fixture): event `vods: [{ day: 1, id: 'vod-day-one' }, { day: 2, id: 'vod-day-two' }]` over a 3-day event (startDate 2026-09-18, endDate 2026-09-20), so day 3 has no VOD; every battle's `at` = `startDate + (day - 1) days + seconds`, seconds increasing within a day from 600.

- [ ] **Step 1: Write the failing tests**
  - `parseEventBody accepts day-keyed vods`: body `vods: [{day:1,id:'v1'},{day:3,id:'v3'}]` parses to the same array.
  - `parseEventBody reads a bare list as days 1..n`: `vods: ['v1','v2']` parses to `[{day:1,id:'v1'},{day:2,id:'v2'}]`.
  - `parseEventBody rejects a bad day`: `{day:0,...}`, a non-integer day, or a duplicate day fails with reason `bad vods`.
  - `getEvent maps a stored legacy list by count`: a row stored as `["a","b"]` for a 2-day event reads `[{day:1,id:'a'},{day:2,id:'b'}]`; the same list for a 3-day event reads `[]`.
- [ ] **Step 2: Run** `npx vitest run --project counter workers/counter/test/tournament.test.ts workers/counter/test/tournamentStore.test.ts`. Expected: the four new tests FAIL.
- [ ] **Step 3: Implement.** Parse both shapes (bare list maps to days 1..n at parse time, so new writes are always day-keyed). Store the day-keyed JSON. `eventRow` normalizes: day-keyed as is; a bare string list maps to days 1..n only when its length equals the event's day count (`endDate - startDate + 1`), else `[]` (a stored Baltimore-style list never guesses). Update the fixture as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --project counter` and `npm run typecheck`. Expected: PASS (fix any existing test that asserted the old `vods: string[]` read shape to the day-keyed one).
- [ ] **Step 5: Commit** the five files: `Worker: VODs keyed by day, so a missing day never links another day's broadcast`.

### Task 2: StreamScanner: send day-keyed VODs; document the `at` contract

**Files (repo `D:\Skunkworks\StreamScanner`):**
- Modify: `streamscanner/workspace.py` (`EventConfig.vods`)
- Modify: `streamscanner/build.py` (comment at `at_iso`; event payload)
- Test: `tests/test_build.py:50`

**Interfaces:** Consumes Task 1's wire shape. Produces event payload `"vods": [{"day": 1, "id": "v..."}, ...]`, days without a VOD omitted.

- [ ] **Step 1: Change the test** at `tests/test_build.py:50` to `assert event["vods"] == [{"day": 1, "id": "v1000000001"}, {"day": 2, "id": "v1000000002"}]`, and add `test_event_vods_skip_a_day_without_vod` (day 1 unset, day 2 set: `[{"day": 2, ...}]`).
- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest tests/test_build.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `EventConfig.vods() -> list[dict]` returning `{"day", "id"}` for days with a VOD. Add a comment at `at_iso`: pick3 derives the Watch offset from `at` as `at - (startDate + day - 1)`, so `at` must stay "seconds into that day's VOD"; do not change the encoding.
- [ ] **Step 4: Run** the full suite `.venv/Scripts/python.exe -m pytest -q`. Expected: all pass.
- [ ] **Step 5: Commit** the three files on main: `Send VODs keyed by day, so pick3 links each day's broadcast`. Do not push until Task 1 is deployed (the old worker rejects the new shape).

### Task 3: Engine: event read model

**Files:**
- Modify: `packages/engine/src/meta/api.ts` (client copies of the v1 event wire shapes)
- Create: `packages/engine/src/meta/events.ts`; export from `packages/engine/src/meta/index.ts`
- Test: `packages/engine/test/meta/events.test.ts` (reads `fixtures/tournament-sample.json` through the worker's `eventDetail`, or builds `EventDetailV1` directly from the fixture file; hand-built details for edge cases)

**Interfaces:**
- Produces in `api.ts`: `VodDayV1`, `EventListRowV1`, `EventsV1 { events: EventListRowV1[] }`, `EventGameV1`, `EventMatchV1`, `EventRosterV1`, `EventDetailV1` mirroring `workers/counter/src/tournamentRead.ts` (with `event.vods: VodDayV1[]`).
- Produces in `events.ts`:
  - `RECENT_DAYS = 55`; `recentSince(now: Date): string` (ISO, `now - 55 days`, start of that UTC day).
  - `type Finish = 'Champion' | 'Finalist' | 'Top cut' | null`.
  - `interface EventTrio { ids: string[]; games: number; wins: number; losses: number }`.
  - `interface EventPlayerGame { match: EventMatchV1; game: EventGameV1; side: 'left' | 'right'; mine: string[]; theirs: string[]; result: 'W' | 'L' | null }`.
  - `interface EventPlayer { name: string; finish: Finish; wins: number; losses: number; games: number; six: (string | null)[]; seen: number; fromRoster: boolean; picks: Record<string, number>; trios: EventTrio[]; moves: Record<string, { fast: string; charged: string[] } | null>; played: EventPlayerGame[] }` (`six` always length 6; `seen` = non-null count; `moves` only from the roster).
  - `eventPlayers(detail: EventDetailV1): EventPlayer[]` ordered Champion, Finalist, Top cut, then the rest; ties by wins desc, losses asc, name.
  - `champion(detail: EventDetailV1): EventPlayer | null`.
  - `vodOffset(event: EventDetailV1['event'], day: number, at: string): number | null` (seconds; null when the day has no VOD or the offset is negative or over 24h).
  - `vodUrl(event, day: number, at?: string): string | null` (`https://www.twitch.tv/videos/<id without leading v>`, plus `?t=<h>h<m>m<s>s` when `at` gives an offset).
  - `shortEventName(name: string): string` ("2027 Nice Pokemon GO Regional Championships" -> "Nice Regional"; anything unmatched returned unchanged).

- [ ] **Step 1: Write the failing tests** (names and assertions):
  - `champion is the grand final match winner` (fixture).
  - `a short grand final falls back to its last decided game`: grand final games right then left -> left player Champion, right Finalist.
  - `no decided grand final game means no champion`: all `winnerSide: null` -> `champion()` null, nobody has finish Champion.
  - `top cut players are Top cut, group-only players have no finish`.
  - `six comes from the roster when there is one`: `fromRoster` true, `six` equals roster order, `moves` filled (null where the roster had none).
  - `six pads unseen slots with null`: player with no roster seen with 4 species -> `six.filter(Boolean).length === 4`, `seen === 4`, length 6.
  - `more than six seen keeps the first six seen`.
  - `picks count games, not matches`; `trios order by games then wins`, trio ids keep the order first played.
  - `vodOffset reads at as seconds into that day's VOD`: event startDate 2026-10-17, day 1, at `2026-10-17T00:57:51.000Z` -> 3471; day 2 at `2026-10-18T00:05:33.000Z` -> 333.
  - `vodOffset is null for a day without a VOD` (fixture day 3) and `vodUrl` null there.
  - `vodUrl formats the offset`: 3471 -> `...?t=0h57m51s`.
  - `recentSince is 55 days back`: now 2026-10-18T12:00Z -> `2026-08-24T00:00:00.000Z`.
  - `shortEventName` for Nice, Frankfurt and an unmatched name.
- [ ] **Step 2: Run** `npx vitest run --project engine packages/engine/test/meta/events.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `events.ts`. A match's winner is the side with more decided games; a tie is no winner. Grand final = `bracket === 'grand'`; top cut = `stage === 'top_cut'`.
- [ ] **Step 4: Run** `npm test -- --project engine` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `api.ts`, `events.ts`, `index.ts`, the test: `Engine: event read model for tournament pages`.

### Task 4: Web reads and hooks

**Files:**
- Modify: `apps/web/src/metaData.ts` (`fetchEvents`, `fetchEventDetail`)
- Modify: `apps/web/src/state/useMeta.ts` (`useRecentEvents`, `useEventDetail`)
- Test: `apps/web/test/metaData.test.ts`, `apps/web/test/useMeta.test.tsx`

**Interfaces:**
- Consumes: Task 3's `EventsV1`, `EventDetailV1`, `recentSince`.
- Produces: `fetchEvents(since: string, until: string, fetcher?: typeof fetch): Promise<EventsV1>` (GET `${COUNTER_ORIGIN}/api/v1/events?league=great&since=&until=`); `fetchEventDetail(id: string, fetcher?): Promise<EventDetailV1>`; `useRecentEvents(league: string): Loaded<EventsV1>` (settles ready with `{ events: [] }` and makes no read unless `league` is `great` or `championshipseries`; `until` is the current 10 minute bucket end like the other reads, so readers share a cache entry); `useEventDetail(id: string): Loaded<EventDetailV1>`. Both memoised per session through the existing `remember`.

- [ ] **Step 1: Write the failing tests**: URL and params of both fetchers (stub fetcher); `useRecentEvents('ultra')` makes no call and yields an empty list; `useRecentEvents('championshipseries')` asks for `league=great`; a second `useEventDetail` for the same id makes no second call.
- [ ] **Step 2: Run** `npx vitest run --project web apps/web/test/metaData.test.ts apps/web/test/useMeta.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** with the existing `get`, `remember` and `useLoad`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** the four files: `Web: read recent events and one event's detail`.

### Task 5: Routes and the Meta home row

**Files:**
- Modify: `apps/web/src/state/store.tsx` (Route union, `parseHash`, `hashFor`)
- Modify: `apps/web/src/App.tsx` (render cases; `onMeta` includes both routes)
- Modify: `apps/web/src/screens/MetaHome.tsx` (`TournamentsRow`, placed after Spicy Picks)
- Create: placeholder exports `Tournaments` and `EventPage` in `apps/web/src/screens/Tournaments.tsx` and `apps/web/src/screens/EventPage.tsx` returning the sub-header only (filled in Tasks 6 and 7)
- Test: `apps/web/test/store.test.tsx`, `apps/web/test/metaHome.test.tsx`

**Interfaces:**
- Produces: routes `{ screen: 'meta-events' }` and `{ screen: 'meta-event'; id: string; p?: string }`; hashes `#/meta/events` and `#/meta/events/<id>[?p=<screen name>]` (both encoded); `EventPage({ id, p }: { id: string; p?: string })`.

- [ ] **Step 1: Write the failing tests**: `parseHash('#/meta/events')`, `parseHash('#/meta/events/2027-nice-regional?p=P4T0M4N')` round-trip through `hashFor`; a screen name with spaces or `&` round-trips; MetaHome shows "Tournaments · 2 events" with the newest event's short name and dates when `useRecentEvents` (stubbed) returns two; no row when it returns none or the league is `ultra`.
- [ ] **Step 2: Run** `npx vitest run --project web apps/web/test/store.test.tsx apps/web/test/metaHome.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** The row is an `action-row` like Your battles' Achievements row: `<b>Tournaments · N events</b>` and a `small muted` line `<short name> · <dates>`; it navigates to `meta-events`.
- [ ] **Step 4: Run** the same command plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** the six files: `Meta: a Tournaments row and routes for event pages`.

### Task 6: Tournaments list screen, six-slot row, card CSS

**Files:**
- Modify: `apps/web/src/screens/Tournaments.tsx`
- Create: `apps/web/src/components/meta/SixRow.tsx`
- Modify: `apps/web/src/app.css` (classes below)
- Test: `apps/web/test/tournaments.test.tsx`

**Interfaces:**
- Consumes: `useRecentEvents`, `useEventDetail` (one per listed event), `champion`, `shortEventName`.
- Produces: `SixRow({ six, counts }: { six: (string | null)[]; counts?: (string | null)[] })` (44px `PokemonToken`s in a six-column grid; a null slot is a dashed circle with "?" and `aria-label="Not seen"`; `counts[i]` under each when given). CSS: `.six-row`, `.six-slot`, `.six-unseen`, `.six-count`, and `.event-card` (a `tb-team-row` whose `row-head` is the larger stacked head: title 16px/600, sub 12px, padding 12px 14px). Tokens only (`--faint` for the dashed ring).

- [ ] **Step 1: Write the failing tests**: list renders one card per event newest first with short name, dates and "N battles on stream"; a card shows "Champion <name>" and six slots once its detail loads, and renders without them before; an event with no champion shows no Champion line; tapping a card navigates to `meta-event` with its id; empty list says "No tournaments in the last 55 days" (builder's copy, keep it plain).
- [ ] **Step 2: Run** `npx vitest run --project web apps/web/test/tournaments.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** with `Header variant="sub"` (Back to `meta`), a `tb-fine` source line, `Loading` and `ErrorState` as Top teams uses them.
- [ ] **Step 4: Run** the test, `npm run lint`, `npm run check-colors`. Expected: PASS, baseline unchanged.
- [ ] **Step 5: Commit** the four files: `Tournaments: recent events with each champion's six`.

### Task 7: Event page

**Files:**
- Modify: `apps/web/src/screens/EventPage.tsx`
- Create: `apps/web/src/components/meta/PlayerCard.tsx`
- Modify: `apps/web/src/app.css` (only if a part needs a class the mock inlined)
- Test: `apps/web/test/eventPage.test.tsx`

**Interfaces:**
- Consumes: `useEventDetail`, `eventPlayers`, `vodUrl`, `SixRow`, `useActions().setPick` / `navigate` / `back`, `useScrollMemory`.
- Produces: `PlayerCard({ player, event, open, onToggle })`.

Layout (spec "Event"): fine-print facts line; one "Watch day N" `action-row` per `event.vods` entry (opens Twitch in a new tab, `rel="noreferrer"`); "Players"; one `PlayerCard` per player. Head: name, `Tag` for a finish, "N games on stream", " · N of 6 seen" when not `fromRoster`, record on the right (`white-space: nowrap`), chevron, then `SixRow` with `picked/games` counts. Open body, in order: "Build these teams" (`row-label` with the Teams tab three-circle glyph, `--accent` stroke) and up to three `team-row` buttons (sprites 32px, "N games", bold record) plus "Show N more" expanding in place; "Movesets (RK9 team list)" as `pick-cards` of `pick-card filled` (no remove, no grip, `padding-right` reset by a modifier class), role pill text "N of M", "Moves not listed" when null, or a `tb-fine` line "No team list yet: the six above are what the broadcast showed." when not `fromRoster`; "Picks, game by game": per match "vs <opponent> · <round label>", per game own three (24px), a `result-chip` W/L (nothing for null), the opponent's three (20px), and "Watch" only when `vodUrl` returns a link.

- [ ] **Step 1: Write the failing tests** (fixture detail through a stubbed `useEventDetail`):
  - players appear Champion first; finish tags only Champion, Finalist, Top cut.
  - opening a card sets `?p=<name>` (route `meta-event` with `p`), and rendering with `p` opens that card.
  - tapping a "Build these teams" row calls `setPick` three times with `{ kind: 'species', id, preferOwned: true, moves }` (moves only when the roster has them) and navigates to `build`.
  - no "Watch day 3" row and no per-game Watch on day 3 (fixture has no day 3 VOD); day 1 games link with `?t=`.
  - a player without a roster shows "N of 6 seen", the no-team-list line, and no Movesets section.
  - "Show N more" appears only past three trios.
- [ ] **Step 2: Run** `npx vitest run --project web apps/web/test/eventPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** One card open at a time; opening replaces the route (`navigate` with `p`, not a new history entry per toggle if `navigate` supports replace, else accept the entry). `useScrollMemory('event:' + id, ready)`.
- [ ] **Step 4: Run** the test, `npm test -- --project web`, `npm run lint`, `npm run typecheck`, `npm run check-colors`. Expected: all PASS.
- [ ] **Step 5: Commit** the files: `Event page: players by finish, their six, the threes to build, every game`.

### Task 8: Screens job, audit captures, data refresh

**Files:**
- Modify: `apps/web/scripts/screens.mjs` (stub `/api/v1/events*` from `fixtures/tournament-sample.json` the way it stubs the other v1 reads; capture `tournaments`, `event`, `event-player-open`, `event-player-no-roster`)
- Docs: `CLAUDE.md` Meta tab section, one line on the Tournaments list and event page; `docs/design/audits/tournament-pages.md` record for Travis to sign.

- [ ] **Step 1:** Add the captures; run `npm run web:screens`. Expected: the four captures exist, no console errors.
- [ ] **Step 2:** Run `npm run web:audit`. Expected: the new screens pass the automated checks in dark and light at 390px.
- [ ] **Step 3: Commit** the script, CLAUDE.md line and audit record: `Tournament pages: screen captures and audit record`.
- [ ] **Step 4 (Travis gate, after merge and worker deploy):** re-upsert event records only: Nice via `streamscanner upload 2027-nice-regional --only event` (StreamScanner, day-keyed now). Frankfurt's legacy two-VOD list over two days reads correctly as is. Baltimore (3 days, 2 VODs, legacy) shows no Watch links until its day mapping is supplied; it ages out of the 55-day list on 2026-11-14. Separately fix Baltimore's champion stored as "ZZWEILOUS (U)" (data, not UI) if Travis wants it before then.
