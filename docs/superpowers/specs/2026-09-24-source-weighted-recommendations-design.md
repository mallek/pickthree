# Source-weighted recommendations: one picker for who you expect to face

Date: 2026-09-24. Status: design approved in brainstorming, awaiting spec review.

pick3's own team recommendations (Teams, Analysis, Build, Counters) today weight opponents by
PvPoke's rank, or by the player's own battle log once it has 15 battles. meta.pick3.gg meanwhile
blends PvPoke's list with measured ladder play and tournament pick share on a stated curve. This
spec lets a player pick which of those populations pick3 weights against, with the same Source and
Window choices meta.pick3.gg has, and makes that choice reach the real engine: which trios become
finalists, and how the finalists score.

"PvPoke rankings are an input, not truth" still holds. This adds more inputs, all of them stated
in every result's assumptions line. Nothing about the collection changes: it never leaves the
phone, and all arithmetic still runs on device.

## Summary of decisions

1. **One Source picker, the player's own log is one of its options.** Source: PvPoke, Your log,
   GBL, Tournaments, All. Exactly one weighting is active at a time. The Settings switch "blend my
   log" is retired; picking Your log is that switch.
2. **Window applies to the community sources**: This meta, 30 days, 7 days, resolved exactly as
   meta.pick3.gg resolves them. Your log keeps its own season window (`freshFrom` stays).
3. **Default is Your log.** It falls back to PvPoke under 15 battles exactly as today, so on
   update nobody's teams change unless they have 15+ logged battles (see decision 6). Old saves
   with the blend switched off migrate to PvPoke.
4. **The weights are meta.pick3.gg's weights.** The site's blend moves into
   `@pickthree/engine/meta` as one function both apps call, so the two sites agree about who is
   common by construction.
5. **Weights reach drafting, not only final scoring.** Today weights only re-score the 25
   finalists that unweighted matrix coverage already picked, so a source switch could only
   reshuffle the same 25 teams. Any engaged profile (Your log at 15+ battles, or a community
   source) now also weights `generateTrios`, so the source changes which trios get simulated.
6. **Your log gets weighted drafting too.** One rule for every engaged profile. Players with 15+
   logged battles will see their teams shift on this update; that is accepted.
7. **PvPoke is byte-identical to today.** Unweighted drafting, `plainWeights` scoring, same teams,
   same scores, same order. An unengaged Your log is the same.
8. **Outsiders are designed in and switched off.** Species measured often but absent from
   PvPoke's meta group could be simulated on device as extra opponents, as Your Meta already does.
   The community profile carries the slot; a `communityOutsiders` option defaults off until there
   is more data.
9. **A community source the player picks is its own consent.** GBL, Tournaments and All stay
   available with community sharing off. The read carries league, window and source, which is
   what any meta.pick3.gg visitor sends. Automatic reads (Suggest teammates) still follow the
   sharing switch. CLAUDE.md's collection rule is amended to say so.
10. **The Teams chip row slims** to Source, Window, Team style, and a "Filters: N" chip shown only
    when a moved filter is on. No XL, No Shadows, No Elite TM, Budget builds and Exclude move into
    the Settings sheet's Filters section.
11. **The Suggest teammates read is fixed in passing.** `communityCores` has never sent
    `since`/`until`, so the worker has answered 400 since launch. It now sends the resolved window.

## Why not the alternatives

- **Re-simulating against a measured opponent set.** Real on-device compute per import and per
  source switch, and it reinvents the reason ADR 002's precomputed matrix exists. Weights over the
  existing matrix columns get the ordering effect without it; outsiders (decision 8) cover the
  species the matrix lacks, later, with a bounded number of extra sims.
- **The worker computes weights** (`/api/v1/weights`). The worker does not have PvPoke's rank
  order or meta group (those are baked into the static sites), so it would need a second copy of
  both, and it breaks the meta site's "the arithmetic runs on device" stance.
- **Treating community sightings as a big personal log** through `buildFacingProfile`. Least
  code, but different half-say points, no device curve and no tournament sequencing, so pick3 and
  meta.pick3.gg would print two different "most common" answers for the same window.
- **Blending the community data and the player's log together.** More powerful, hard to explain,
  and "PvPoke" would stop meaning PvPoke once a log exists. Not now.

## Engine

### The shared blend: `communityWeights`

`apps/meta/src/rank.ts`'s weight arithmetic moves into `packages/engine/src/meta/` (new file,
exported from `@pickthree/engine/meta`):

```ts
export type CommunitySource = 'prior' | 'ladder' | 'tournament' | 'all';

export interface CommunitySummary {
  battles: number;
  devices: number;
  species: { speciesId: string; sightings: number }[];
  tournament: {
    events: number;
    battles: number;
    species: { speciesId: string; picks: number }[];
  } | null;
}

export interface CommunityWeights {
  /** Per species, normalised over `ids`. */
  weights: Map<string, number>;
  /** Every species that got a weight, in list order (meta group first, then measured). */
  ids: string[];
  say: number;             // ladder term, 0..1
  tournamentSay: number;   // tournament term, 0..1
}

export function communityWeights(
  summary: CommunitySummary,
  opts: {
    source: CommunitySource;
    /** PvPoke's meta group species for the league: the list the site calls its baseline. */
    group: readonly string[];
    /** PvPoke overall order, de-duplicated (ranksOf). */
    rankOrder: readonly string[];
    banned: ReadonlySet<string>;
  },
): CommunityWeights;
```

It carries `measuredSay`, `tournamentSay`, `HALF_SAY_BATTLES` (300), `HALF_SAY_DEVICES` (5),
`HALF_SAY_TOURNAMENT_BATTLES` (100), `HALF_SAY_EVENTS` (2), `LISTED_MIN`, the id-list assembly,
both blends and the banned-species rule, moved verbatim. `ranksOf` moves with it.

`apps/meta/src/rank.ts` keeps its row building (sightings, share, trend, bars, tournament
columns) and calls `communityWeights` for `weights`, `say` and `tournamentSay`. The constants stay
exported from `rank.ts` as re-exports, so CLAUDE.md's "the 300, 5, 100 and 2 constants stay in
`apps/meta/src/rank.ts`" rule is amended to name their new home and the re-export. Nothing about
the curves changes.

`MetaSummaryV1` (the site's wire type) already satisfies `CommunitySummary` structurally; the
engine type names only the fields the blend reads.

### Inputs pick3 must ship

- **Meta group**: already shipped (`meta/<league>.json`, `StaticData.meta`).
- **Rank order**: derived on device from `StaticData.rankings.overall` with the shared `ranksOf`.
  The existing PvPoke path keeps `metaRanks` untouched; only the community path uses `ranksOf`, so
  it matches the site even where `overall` repeats a species.
- **Ban list**: not shipped today. `legalFor` and `OPEN_EQUIVALENT_CUP` move from
  `apps/meta/scripts/bake.ts` into `packages/data`, and pick3's data build writes
  `public/data/legal/<league>.json` beside `rankings/`. The meta bake imports the same function.
  The worker's copy of `OPEN_EQUIVALENT_CUP` stays where it is (the contract is asserted on both
  sides, as today).
- **Epochs**: `apps/meta/epochs.json` is copied by the data build to `public/data/epochs.json`,
  next to `seasons.json`, so "This meta" resolves to the same moment on both sites.

### Window resolution

`resolveWindow`, `BUCKET_MS`, `MAX_SPAN_DAYS` and `epochFor` move from `apps/meta/src/api.ts` into
`@pickthree/engine/meta`. The meta site imports them from there. Pure date arithmetic, no fetch.

### Community league

Community sources exist for the leagues meta.pick3.gg has (kind `standard`). The Tournament league
(`championshipseries`) reads the `great` summary: its rankings, meta group and matrix are already
Great League's filtered to legal species, and tournament records are stored under `great`.
Other special cups show GBL, Tournaments and All disabled with the line "No community data for
this league".

### `communityProfile`

New, in `packages/engine/src/yourmeta/` beside `buildFacingProfile`, returning the same
`FacingProfile`:

- `weights`: each matrix column's weight is its species' community weight. A column whose species
  got no weight (not listed) takes 0; consumers normalise.
- `reason`: new value `'community'`; `engaged: true` always (a community input is never `prior`).
- `outsiders` / `outsiderWeights`: empty. With `communityOutsiders: true` (default false), the
  most heavily weighted species with no matrix column and a legal ranking moveset are added, up to
  `maxOutsiders` (8), exactly as the log path does. Off in this release.
- `battles` / `sightings`: the summary's ladder battles and total sightings, for the assumptions
  line.

With a community source and a summary carrying no battles and no events, both says are 0 and the
weights are PvPoke's normalised prior: same order as PvPoke. Engaged or not is decided by the
source, not by the data, so the line still names the source and says "0% measured".

### One facing input

`RecommendOptions.yourMeta` (and the same field on analyze and counters options) is replaced by:

```ts
export type FacingInput =
  | { kind: 'prior' }
  | { kind: 'log'; battles: LoggedBattle[] }
  | {
      kind: 'community';
      source: 'ladder' | 'tournament' | 'all';
      summary: CommunitySummary;
      window: { since: string; until: string; label: string };
      banned: string[];
    };
```

`profileFor` dispatches: `prior` returns the plain profile with `reason: 'off'`, `log` calls
`buildFacingProfile` with `blend: true`, `community` calls `communityProfile`. `counters.ts` goes
through the same dispatcher instead of calling `buildFacingProfile` itself; its `vs` rule (one
opponent, no weighting) is unchanged.

### Weighted drafting

`generateTrios` and `evaluateTrio` take an optional `weights?: number[]` aligned with
`view.opponents`. `recommend` and `analyze` pass it only when the profile is engaged.

- **Absent**: today's code path, untouched. This is what makes PvPoke byte-identical.
- **Present**:
  - `coverage / n` in `draftScore` and `abcScore` becomes the weighted share covered:
    sum of weights of covered columns over the sum of all weights.
  - Exposure depth counts the top 15 columns **by weight**, not the first 15 columns. (The
    unweighted path keeps reading the first 15 columns, which are alphabetical: the open item in
    memory `project-scoreteam-alphabetical-top-ten`. Fixing that for PvPoke is a separate
    decision, since it changes PvPoke's output.)
  - `TrioDraft.coverage` stays the plain count (the explain layer prints it).
  - Everything else (role fit, ABB score, type overlap, minAbb, style filter) is unchanged.

`scoreTeam`'s `topUncovered` and safety term follow the same rule: with an engaged profile, "top
ten" means the ten heaviest columns; without one, today's first ten columns.

### Assumptions

`Assumptions.facing` gains a community sentence, for example:

- `Weighted by GBL play: 1,240 battles from 18 devices, This meta (since Sep 2), 41% measured`
- `Weighted by tournaments: 3 events, 212 battles, 30 days, 58% measured`
- `Weighted by all play: PvPoke, 3 events and 1,240 GBL battles, 7 days`
- `PvPoke weights (community data unavailable)` on fallback.

`Assumptions` gains `source: 'prior' | 'log' | 'ladder' | 'tournament' | 'all'` so a screen can
label itself without parsing the sentence.

## Web app

### Settings

```ts
facing?: {
  source?: 'prior' | 'log' | 'ladder' | 'tournament' | 'all';
  window?: 'meta' | '30' | '7';
};
```

Absent in older saves. The read default: `source` is `'prior'` when the old `yourMeta.blend` is
`false`, otherwise `'log'`; `window` is `'meta'`. `yourMeta.blend` is no longer written or shown;
`yourMeta.freshFrom` stays. IndexedDB version does not change (settings fields are optional with a
documented default, as `db.ts` already does).

### Teams header

The chip row becomes:

- **Source** select: PvPoke, Your log, GBL, Tournaments, All. Your log shows its count while under
  15 ("Your log: 9 of 15"), matching today's chip. A community source that fell back reads
  "GBL (offline)".
- **Window** select: This meta, 30 days, 7 days. Disabled (greyed, not hidden, so the row does not
  jump) for PvPoke and Your log.
- **Team style** chip: unchanged.
- **Filters: N** chip: shown only when N > 0, where N counts No XL, No Shadows, No Elite TM, Budget
  builds and a non-empty Exclude list. Opens the Settings sheet at Filters.

The Your log chip that navigated to Your Meta is absorbed into Source; Your Meta stays reachable
from its existing entry points.

### Settings sheet

The Filters section gains No XL, No Shadows, No Elite TM and Budget builds as switches, beside the
existing budget cap and Exclude list. The "blend my log" switch is removed. Your Meta's own screen
line that describes the switch is reworded to point at the Source picker.

### Fetch: `apps/web/src/communityMeta.ts`

- One `GET {COUNTER_ORIGIN}/api/v1/meta?league&since&until` per league and window, with no
  `source` parameter: the `all` response carries the ladder numbers and the tournament block, so
  GBL, Tournaments and All share one request and one cache entry (as the meta site does).
- `since`/`until` from the shared `resolveWindow` over `seasons.json` and `epochs.json`, bucketed
  to 10 minutes, so pick3 readers share the worker's edge cache with meta.pick3.gg readers.
- Runs on the main thread. The summary (trimmed to `CommunitySummary`) rides to the engine worker
  inside the recommend, analyze and counters requests (`host/protocol.ts`).
- Cached in memory per league and window for the session; a null entry remembers a failure until
  the window's bucket moves.
- Never gated by the sharing switch (decision 9). Never sends anything about the collection, the
  player, or the pinned Pokemon.
- Fails silent: offline, blocked, non-2xx or malformed JSON give `null`, and the engine gets
  `{ kind: 'prior' }` with the fallback line. Teams never shows an error for it and never waits
  longer than the fetch timeout (8 s) before running on PvPoke.
- CSP: unchanged. The worker origin is already in `connect-src`.

### Staleness

`filterKey` gains `facing.source`, `facing.window` and the summary's `generatedAt` (or `null`), so
new community data re-runs Teams and a repeat visit within the same bucket reuses the result.

### Other screens

Counters, Analysis (TeamDetail) and Build read the same setting and the same cached summary. The
Teams header is the only place to change it. Each screen's existing assumptions line
("Opponent weights") prints the source sentence.

### Suggest teammates fix

`communityCores` sends `since`/`until` from the same `resolveWindow`: the player's Window when a
community source is picked, "This meta" otherwise. It keeps its own gate (the sharing switch) and
its own silence; only the URL changes.

## Rule changes (CLAUDE.md)

- Collection rule: add "A community source the player picks (GBL, Tournaments, All) reads the
  community meta for the league and window; that choice is its own consent. Automatic reads, like
  the Suggest teammates board, still follow the sharing switch."
- meta.pick3.gg rule: the 300, 5, 100 and 2 constants live in `@pickthree/engine/meta` beside
  `communityWeights`, re-exported from `apps/meta/src/rank.ts`.
- Architecture, Web app: mention `communityMeta.ts` and the Source picker.

## Testing

Engine (vitest, fixture data):

- **Parity**: `communityWeights` reproduces `rankSpecies`'s `weights`, `say` and `tournamentSay`
  for synthetic summaries in every source, including banned species and unranked measured species.
  `apps/meta`'s existing `rank.test.ts` passes unchanged after the move.
- **Byte-identical PvPoke**: `recommend`, `analyze` and `counters` with `{ kind: 'prior' }`, and
  with a log under 15 battles, produce exactly main's output on the fixture collection (teams,
  scores, order, assumptions except the new `source` field). Captured as a snapshot before the
  change lands.
- **Zero data**: a community summary with no battles and no events gives PvPoke's team order.
- **Weighted drafting**: a hand-built matrix where the heaviest column is beaten only by a trio
  with low plain coverage; with weights that trio reaches the finalists, without them it does not.
- **Exposure and top ten by weight** in weighted mode; first columns in unweighted mode.
- **Outsiders flag**: off gives no outsiders; on adds up to 8 legal ones by weight.
- **Window**: `resolveWindow` tests move with it; the meta site's tests import from the engine.
- **Legal**: `legalFor` tests move to `packages/data`; the data build writes `legal/<league>.json`.

Web (vitest, jsdom):

- `communityMeta.ts`: URL shape, one request for GBL/Tournaments/All, cache, bucket expiry, and
  fallback on offline, non-2xx, malformed body and timeout.
- Settings migration: no `facing` and blend on gives `log`; blend off gives `prior`.
- Teams header: Source, Window, Team style render; Window disabled for PvPoke and Your log;
  Filters chip count and visibility; fallback label.
- Sheet: the moved filters toggle the same settings they did.
- `communityCores` sends a window.
- Fixtures: a synthetic `MetaSummaryV1` under `fixtures/`, never a real response.

Screens: `web:screens` adds Teams with a community source picked, the worker response stubbed in
the page, so automation never reads the live worker.

## Out of scope

- Turning community outsiders on (decision 8): a follow-up once measured volume justifies it.
- Blending the player's log with community data.
- Fixing the alphabetical "top ten" for PvPoke mode (open item in memory).
- Any worker change: the read routes already serve everything this needs.
- Filter-chip or header visual design beyond the layout above: the design cohesion pass
  (spawned 2026-09-22) owns the look of the Teams header and Settings sheet.
