# Meta in pick3: one app, one league list

Date: 2026-09-30. Status: design approved in chat 2026-09-30 (mockups rounds 2 and 3 on the
throwaway branch `mock/meta-in-pick3`), spec awaiting review.

meta.pick3.gg is a second site with its own league list, its own bake, its own deploy and its own
copy of the look. Every one of those has drifted from pick3 at least once: the bake keeps only
Great, Ultra and Master, so the site cannot show Mega Color Cup (live today) or any rotation cup;
its tab bar was a different width; a daily schedule refresh redeploys pick3 but not meta. Travis:
"it's bitten me too many times now and I want it all to feel the same."

So meta moves into pick3. Nothing links to meta.pick3.gg yet (every post and share link already
opens pick3), so the move costs no inbound links; the old host redirects anyway.

## Summary of decisions

1. **The "Your Meta" tab becomes "Meta"**, still four tabs (Teams, Counters, Collection, Meta).
   Its root is a new landing that ties logging a battle to what logged battles add up to.
2. **The landing has two states**, both mocked: a first visit (community first, then "Help build
   the meta") and with a battle log (community, then your contribution and current team, then your
   own meta). Layout is Travis's concept, adjusted to the design rules.
3. **Pokemon go into Collection.** Collection gets Collected | Not collected. Not collected is
   every species legal in the league that you do not own, ranked by the blended meta. It replaces
   meta.pick3.gg's Pokemon page.
4. **One species page**, `#/species/<id>`: your copies first (or "Add one"), then the meta
   (share, record against it, tournament picks, moves players ran, seen next to), then Build around
   it and Who beats it. It replaces meta.pick3.gg's Species page.
5. **Top teams** keeps meta.pick3.gg's signed board, ported, at `#/meta/teams`. Every team gets
   "Run this team", which sets it as your running team. pick3's own Teams and Team Analysis get the
   same action.
6. **One league list.** Meta pages show the app's league, picked with the same switcher as every
   other tab, so cups, rotation cups and Mega leagues work everywhere at once. The data build
   produces everything a league needs, for every league it ships.
7. **Start without a collection.** Welcome gets a third way in that opens Meta, no import. Such a
   player lands on Meta from then on, and Collection opens on Not collected.
8. **meta.pick3.gg retires.** The worker keeps the API and redirects every page to its pick3
   route. `apps/meta` is deleted; the post tooling moves out first.
9. **Sharing stays opt-out** (on by default, as today). The landing shows the same switch Settings
   does.

## Navigation and routes

Hash routes, like the rest of pick3:

| Route | Screen |
| --- | --- |
| `#/meta` | Meta landing (tab root) |
| `#/meta/teams` | Top teams board |
| `#/meta/battles` | Your battles (today's Your Meta lists, in full) |
| `#/meta/new` | Pick your team (today's NewSet), unchanged; takes `?team=a+b+c` to prefill |
| `#/meta/log`, `#/meta/log/<set>/<battle>` | Log or edit a battle, unchanged |
| `#/collection` | Collection, Collected view (unchanged route) |
| `#/collection?view=not` | Collection, Not collected view |
| `#/species/<id>` | Species page |

Window and source ride along where a screen has them: `?w=<window>&src=<source>` (the same keys and
values meta.pick3.gg's `route.ts` uses, `all | prior | ladder | tournament`).

**League.** No meta route carries a league. Every screen shows `settings.league`. An inbound link
may carry `?l=<league>` to switch once on arrival, exactly as `#/counters` and `#/build` links do
now. Every league id parse in `apps/web` accepts `[a-z0-9_-]` (today `store.tsx`'s counters and
build parsing reject the hyphen, so a `mega-great` link silently drops its league).

The tab bar's Meta tab is current on every `#/meta...` route. Collection is current on
`#/collection...`, `#/species/...`, `#/add`. A species page opened from the Meta landing still
marks Collection: it is Collection's page, and back returns to where the player came from.

## Meta landing (`#/meta`)

Top header "Meta" with Settings; the shared league switcher (open leagues plus the "..." sheet of
cups and rotation cups). Then, in the scroll:

1. **"What trainers are facing"** with the line "A community snapshot, built from shared battle
   logs." No window or league pill: the landing always reads the default window ("This meta", the
   current epoch) and source All; the full lists carry the controls.
2. **Most seen Pokemon** card, "Share of reported battles": the top five by blended share, each
   row a token, the name over a violet weight bar, the share in pink with its bar mark, a chevron.
   A row opens `#/species/<id>`. "Explore Pokemon" opens `#/collection?view=not`.
3. State-dependent middle (below).
4. Footer "Community data reflects shared logs."

**First visit** (no battle sets in any league):
- **Most logged teams**: the top two complete teams from the board (three tokens, "N battles",
  record), "Results from trainers logging their own teams.", "Explore teams" to `#/meta/teams`.
- **Help build the meta** (accent outline): "Log your team, opponents and result to add to the
  community picture."; the "Share battles anonymously" switch (the same setting as Settings);
  Log a battle (opens `#/meta/new` first when no team is picked); "No collection import needed."
- **Your meta** empty card: "Your battle history will appear here."

**With a battle log:**
- **Your contribution** (accent outline): the pink `MeasuredLine` "N of your battles are in the
  community meta" (plain text when sharing is off or nothing is sent, as today); the share switch;
  Current team with its record in normal ink, three 52px tokens with names; Log a battle; Change
  team and Share team. No running team: "Pick your team" replaces Log a battle.
- **Your meta**: "N battles this run|season"; the 15-battle progress box (today's `ProgressLine`
  copy and rules); Most faced | Worst record; the top two faced rows; "View your battle history"
  to `#/meta/battles`.
- **Most logged teams**, as on the first visit, without the caption.

**Failure and offline.** The two community cards each fall back to the shared `ErrorState` with
"Try again" when the API is unreachable or offline; the personal cards render from IndexedDB and
never wait on the network. A league with no shared battles shows PvPoke's group as the Most seen
list (the blend at 100% prior), with no pink, and the teams card shows the generated baseline
teams marked Projected, as meta.pick3.gg does now.

**Consent.** Opening Meta reads `/api/v1/meta` and `/api/v1/teams` for the league. That is the
player's own choice of screen, so like the Teams Source picker it does not follow the sharing
switch. CLAUDE.md's outbound-calls rule gets this screen added by name.

## Top teams (`#/meta/teams`)

meta.pick3.gg's signed Teams board (`docs/design/audits/meta-teams.md`), ported onto pick3's
page-head and sub header ("Meta" back). Window and Source selects; the blend line with "How it is
ranked"; Multi-team only; Sort. Rows open in place as now. Changes from the signed board:
"Open in pick3" becomes "Open in Build" (in-app navigation, same team link parsing), and every
open row adds "Run this team" (to `#/meta/new?team=...`).

## Your battles (`#/meta/battles`)

Today's Your Meta page minus what moved to the landing (current team card, contribution line):
the explainer, the full faced list with the outsider legend, Your teams, Earlier seasons or runs,
the stale-season card. Sub header back to Meta.

## Collection

- A `Seg` Collected | Not collected sits in the sort row beside Sort (mock round 2). It follows
  `?view=` and is sticky like the other Collection switches.
- **Collected** is unchanged.
- **Not collected**: every species legal in the current league (`legalSet`) with no specimen in
  the collection, Shadow forms as their own rows as the rankings list them. Row: token, name (Shadow
  flag as now), "#N PvPoke · X of Y battles", type chips; the share on the right as a
  `MeasuredValue` in the slot the verdict tag occupies on Collected rows, so rows keep one height.
  No measured share: the slot is empty and the line reads "#N PvPoke · not faced in this window".
  No "Add one" in the list.
- Sort on Not collected: Meta (blended weight, default) or Name. Window and Source live in the
  Collection filter sheet, shared with the Teams Source picker's stored choice.
- Search searches every species while Not collected is showing.
- A player with no collection opens Collection on Not collected; Collected shows the existing
  empty state with Import and Add.

## Species page (`#/species/<id>`)

Built on the signed specimen page's parts (mock round 2):

- Sub header, back. Hero: 64px token, name, type chips, "#N in the meta · #M PvPoke", then "You
  have N" or "Not in your collection".
- Facts card (`kv` rows): Share of battles (pink, with mark), Players went against it, At
  tournaments (pick share; "Banned at tournaments" from the ban list), then one source line ("This
  meta · N GBL battles from M players and K tournament battles"). Nothing measured: the share row
  reads "Not faced in this window" and the record row is left out.
- **Yours**: your specimens of this species, best first, each row opening its specimen page. None:
  "Scan one in Poke Genie, or add it by hand." and **Add one** (`#/add?species=<id>`, the Add form
  with the species picked).
- **Moves players ran** in the move-row card, with "Seen in N of M battles with known moves." and
  how it compares to PvPoke's set. **Seen next to**: the top three teammates. Tournament moves when
  the source includes tournaments, as meta.pick3.gg's Species page does now.
- **Build around it** (`#/build?lead=<id>`) and **Who beats it** (`#/counters?vs=<id>`).
- The specimen page gains one row, "See <species> in the meta", to this page.

Data: `/api/v1/species/:id` for the league and window, as meta.pick3.gg reads it today.

## Start without a collection

- Welcome gets a third button under Import and Add by hand: "Start without a collection". It saves
  `settings.startedWithout = true` (optional field, default false, per the settings rule) and
  navigates to `#/meta`.
- Boot: no collection and `startedWithout` routes to `#/meta` instead of Welcome. A collection
  routes to Teams as now.
- Teams' no-collection state gets a "See the live meta" row beside Import.
- Welcome's MetaPreview card opens `#/meta` instead of meta.pick3.gg.
- The privacy line stays as written.

## Data

**One list.** `leagues.json` and `schedule.json` from the data build are the only league list.
The shared switcher already reads them. Nothing in pick3 keeps its own league list.

**Build.** `packages/data` takes over what `apps/meta/scripts/bake.ts` produced that pick3 does not
already have:
- `baseline/<league>-teams.json` (the generated cold-start teams, `generateColdStartTeams`), for
  every non-special league the build ships, cups and rotation cups included.
- `legal/`, `epochs.json`, `seasons.json` already come out of the data build. The meta epochs list
  moves from `apps/meta/epochs.json` to `packages/data/epochs.json`.
- The rank order (`ranks/`) and matchup slice (`matrix/`) are not baked: the engine worker already
  loads each league's full rankings and matrix, and computes both on demand.

**Logic.** meta.pick3.gg's pure modules move into `@pickthree/engine/meta` with their tests:
`rank.ts` (species ranking, confidence, trend), `teamRank.ts` (board rows), `stats.ts`, the slice
and baseline types. UI copy helpers (`format.ts`, `headerCopy.ts`, `boardView.ts`) move to
`apps/web`. The blend constants stay where they are (`meta/community.ts`).

**Reads.** `apps/web/src/communityMeta.ts` and `community.ts` grow the `/api/v1/species/:id` read
and the window and source parameters. Responses are cached in memory per league, window and
source for the session; no new storage.

## Retiring meta.pick3.gg

- `workers/counter`: drop `[assets]`; a GET for any non-API path on the meta host answers 301 to
  its pick3 route: `/` and `/<league>` to `#/meta/teams?l=<league>`, `/<league>/pokemon` to
  `#/collection?view=not&l=<league>`, `/<league>/p/<id>` to `#/species/<id>?l=<league>`, `/about`
  to `#/meta`, carrying `window` and `source` as `w` and `src`. API routes and CORS unchanged.
- The post tooling (`apps/meta/scripts/post`, `npm run post`) moves to `packages/data/scripts/post`
  first, with `priorWeights` and its tests; `npm run post` keeps its name.
- Delete `apps/meta`. Its About copy (how the blend works) becomes a Settings page, "How the meta
  is ranked".
- `ci.yml`: drop the meta build and `meta-screens` job; `web:screens` gains the new screens.
  `counter.yml`: no meta build, paths reduce to `workers/counter/**` and its own workflow file.
  `daily-refresh.yml` needs nothing new: the pages deploy carries the schedule to every screen.
- `SiteLink site="meta"` in pick3 headers goes (the tab is the link now).
- CLAUDE.md: layout, meta site section, deploy and CI, the outbound-calls rule; memory updated.

## Design rules applied

Violet for interaction (weight bars, chevrons, links), pink only for measured numbers with their
mark, outcome ink for records, plain hyphens in records, no new color literals. Every new or
changed page passes the audit and gets Travis's signed record: Meta landing (both states), Top
teams (ported), Your battles, Collection Not collected, Species. The meta.pick3.gg records
(`meta-teams.md`, `meta-pokemon.md`, `meta-about.md`) get a note that the pages moved.

## Testing

- Engine: the moved meta modules keep their tests; new tests for Not collected membership (legal,
  unowned, Shadow forms) and for the baseline build per league kind.
- Web: route parse and print for every new route, `?l=` with hyphenated ids, the boot rule for
  `startedWithout`, the landing's two states and its offline state, Run this team prefill, the
  species page owned and unowned, Collection's view switch.
- Worker: the redirect table, API unaffected.
- Screens: `web:screens` captures each new screen in both themes; `web:audit` enforces them.
- Synthetic data only for logic tests; invariants only against live data.

## Phases

Each phase merges on its own and leaves both hosts working.

1. **Plumbing.** Hyphenated league ids; baseline teams for every league in the data build; meta's
   pure logic into `@pickthree/engine/meta`; epochs file moved. Nothing visible changes.
2. **Meta tab.** Landing (both states), Top teams, Your battles, Run this team (board, Teams, Team
   Analysis), tab renamed. meta.pick3.gg still up.
3. **Collection.** Not collected, the species page, Add one prefill, the specimen page link.
4. **No-collection start.** Welcome button, boot rule, Teams empty-state row, MetaPreview in-app.
5. **Retire meta.pick3.gg.** Post tooling moved, worker redirects, `apps/meta` deleted, CI and
   CLAUDE.md updated.

## Open for review

- **Explore Pokemon** opens Not collected, which leaves out species you own. The alternative is a
  third view, All, ranked the same way. The spec takes Not collected; owned species are one tap away
  on Collected, and every species reaches its page from the landing.
