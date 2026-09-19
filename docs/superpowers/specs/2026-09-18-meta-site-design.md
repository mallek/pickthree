# meta.pick3.gg, the community meta site

Date: 2026-09-18. Status: designed and built in an unattended session on Travis's "let's build the
site" go-ahead. Every open question in the spawn brief is answered below; the ones Travis is most
likely to want to overrule are collected first.

## Calls made without asking

Travis left the session unattended, so these were decided here rather than in chat. Each is cheap
to reverse.

1. **The site is served by the existing counter worker, not GitHub Pages.** GitHub Pages allows one
   custom domain per repository and pick3.gg already holds it, so a second Pages site from this repo
   cannot answer on meta.pick3.gg. Cloudflare Workers static assets is the least new machinery: the
   worker already owns the battle store, already deploys from CI with credentials that exist, and
   serving the site from the same origin as the data means no CORS, no widened CSP, and the About
   page's `https://meta.pick3.gg/api/v1/...` promise becomes true rather than aspirational.
2. **The measured threshold is 300 counted battles** in the window and rank band on screen. Travis's
   working figure was "a few hundred".
3. **Sprites are loaded from pick3.gg** (`https://pick3.gg/data/sprites/<id>.webp`) instead of being
   copied into this deploy. It keeps a 7.5 MB artwork set out of the worker bundle. The design export
   used PokeAPI artwork; the project rule says our own sprite set is the only artwork, so that is what
   ships.
4. **Real paths, not hash routes.** `/great`, `/great/teams`, `/great/p/azumarill`, `/about`. A public
   site that other people link to deserves them, and the worker's SPA fallback makes them free.
5. **pick3.gg gets one small change**: the counters route accepts an optional league, so
   `#/counters?vs=azumarill&l=great` lands on the right league. Without it, "Who beats it" would open
   in whatever league the visitor last used.
6. **The custom domain is a one-time manual step for Travis** rather than a `[[routes]]` entry in
   `wrangler.toml`. A custom-domain route needs DNS write scope on the API token; if the token lacks
   it the whole worker deploy fails, which would take pick3's counter and battle capture down with it.
   Until the domain is attached, the site is live and testable at the worker's `workers.dev` URL.

## Problem

pick3 has been collecting anonymous battle records since 2026-09-17. There is nowhere to look at
them. The records are also thin: tens of battles, mostly from one phone. A site that showed only
measured data would be an empty room for months, and a site that quietly padded it out with PvPoke's
curated list would be lying. This builds the room and furnishes it honestly.

## What the site is

Four views, mobile first, one league at a time.

- **Pokemon** (`/<league>`) - what you face, ranked, with the reporters' record against each.
- **Teams** (`/<league>/teams`) - the teams reporters ran themselves, with win rates and a confidence
  badge, each deep-linking into pick3's Build breakdown.
- **Species** (`/<league>/p/<speciesId>`) - one Pokemon: how often it is faced over time, the
  reporters' record against it overall and by rank band, what it is seen next to, and the movesets
  reporters ran when they used it themselves.
- **About** (`/about`) - exactly what one shared record contains, what is never collected, how to
  contribute, and how to stop.

Filters, carried in the query string so a filtered view is linkable: window (`?w=season`, `30`, `7`)
and rank band (`?band=all|below|ace|veteran|expert|legend`). League is in the path.

## The two sources, and the rule that keeps them apart

Superseded by `docs/superpowers/specs/2026-09-18-meta-ranking-design.md`. The two sources no
longer flip at a threshold; they blend continuously, and the numbers this section gated on are
the half-say points of that blend. The rule that survives: PvPoke's list is never described with
a measured word, and measured numbers are never hidden for being small.

## Honesty rules

These are the numbers that mislead if shown bare, and what is done about each.

- **Win rates carry a margin.** `+/- round(100 / sqrt(n))` percentage points, the rough width of a
  95% interval near 50%. Shown as a sentence under the row, not a footnote: "Real win rate likely
  within +/-3 pts", and for small n, "Only 21 battles, could easily be 48% or 76%".
- **Confidence badge** on every team: few (under 30 battles), some (30 to 300), many (300 or more).
- **Trend is hidden below 200 counted battles in each of the two windows compared.** A trend is a
  difference of two noisy numbers and needs more, not less, data than the number itself.
- **Percentages become counts below the measured threshold.** "9 of 40" rather than "22.5%".
- **The ranked cut** is faced in at least 0.5% of battles when measured; faced at least twice when
  not.
- **Rank band counts are printed next to every band bar**, and a band with under 100 battles gets an
  explicit "treat it as a hint, not a fact".
- **"Seen next to" says what it actually measures.** Reporters record 0 to 3 opponents, so the
  co-occurrence is a share of the battles where both were seen, not of the opponent's real teams. The
  card says so.
- **Movesets are the reporter's own.** A species only has moveset data when reporters ran it
  themselves; the card carries the number of battles behind it, and notes that two charged moves per
  Pokemon make the charged shares add to about 200%.

## Worker API

New, versioned, served from the same origin as the site. The existing `/hit`, `/count`, `/error`,
`/errors`, `/battles` and `/meta` endpoints are untouched so pick3 keeps working unchanged.

```
GET /api/v1/meta?league=great&since=<iso>&until=<iso>&band=ace
      -> { league, since, until, band, battles, tanked, devices, bands: { ... },
           species: [{ speciesId, sightings, wins, losses, runs, runWins, runLosses }],
           previous: { battles, species: [{ speciesId, sightings }] } | null,
           teams: [{ species: [a,b,c], battles, wins, losses,
                     moves: [set|null, set|null, set|null] }],
           generatedAt }

GET /api/v1/species/<speciesId>?league=great&since=<iso>&until=<iso>&band=ace
      -> { league, speciesId, since, until, band,
           sightings, wins, losses, runs, runWins, runLosses,
           weekly: [{ week: '2026-W37', battles, sightings }],
           bands: [{ band, sightings, wins, losses }],
           alongside: [{ speciesId, battles }],
           movesets: [{ fast, charged, battles }],
           generatedAt }
```

The window is two ISO instants the caller supplies, not a named period: the worker has no season
calendar and should not grow one, and `seasons.json` is already baked into the site. The worker
validates both, rejects a span over 400 days, and caps how many rows it reads.

Rules that hold for both: `Cache-Control: public, max-age=600` (the About page's "updated every 10
minutes"), `generatedAt` in every body so the site can print "updated N minutes ago", reads are open
(no origin check, since the whole point is a public site), writes keep the origin check they have.
`band` filters rows; `all` does not, and the `bands` breakdown always counts every band so the
reader can see what they are filtering away. `previous` is the window of equal length ending where
this one starts, and is `null` when either side is under 200 counted battles.

So that the edge cache is worth having, the site rounds `until` up to the next 10 minute boundary
and derives `since` from it. Every reader in a 10 minute slice therefore asks for the same URL.

The aggregation lives in `workers/counter/src/battles.ts` next to the existing `aggregate`, as pure
functions over `BattleRow[]`, so it is tested without a Durable Object. `SpeciesSummary` gains `runs`,
`runWins` and `runLosses` (how the reporters did when they ran it themselves, as opposed to faced it),
and `TeamSummary` gains the most common moveset per member so a team deep link can carry real moves.
A member's moveset is only put in the link when at least 5 battles back it; otherwise that member
goes in bare and pick3 fills in its recommended set.

## Baseline bake

`apps/meta/scripts/bake.ts` runs before the Vite build and reads `apps/web/public/data` (the existing
data build, already produced by `npm run data:build` and cached in CI). It writes into
`apps/meta/public/`, gitignored the same way `apps/web/public/data` is:

- `species.json` - every species as a compact tuple `[name, dex, types]`, keyed by species id. About
  80 KB, versus 1.1 MB for the full `pokemon.json`.
- `moves.json` - move id to `[name, type]`.
- `leagues.json`, `seasons.json` - copied.
- `baseline/<league>.json` - PvPoke's meta group for the league, each entry carrying the curated
  moveset plus the species' overall score, rating and move usage from `rankings/<league>/overall.json`,
  ordered by score, stamped with `pvpokeCommit` and `pvpokeDate` from `data-manifest.json`.

Nothing at runtime fetches pick3.gg except sprite images, so there is no cross-origin JSON and no
dependency on pick3.gg's CORS behaviour.

## Deep links into pick3

- Team: `https://pick3.gg/#/t/<league>/<member>+<member>+<member>`, a member being
  `<speciesId>[.FAST.CHARGED[.CHARGED]]`, exactly the format `apps/web/src/teamLink.ts` parses.
- Who beats a species: `https://pick3.gg/#/counters?vs=<speciesId>&l=<league>`. The `l` parameter is
  new; `apps/web/src/state/store.tsx` learns to read and write it, and the app switches league before
  running counters. A missing or unknown `l` behaves as it does today.
- Everything else points at `https://pick3.gg/`.

## Look

The design export (`docs/design/meta/meta.pick3.gg.dc.html`) is the reference: a dark ground
(`#161826`) with a light theme, a violet accent (`#9184d9` dark, `#6c5fcb` light), Inter, pill
controls, 12px cards, a segmented league switcher, a type-coloured split-disc behind each sprite.
Those tokens go in `apps/meta/src/design/tokens.css` as their own file; pick3's `tokens.css` is a
different palette for a different app and is not shared. The type colours are taken from pick3's
token sheet so the two sites agree on what fire looks like.

Theme follows the system by default with a manual override kept in `localStorage`, matching pick3's
appearance setting behaviour.

Copy is strict 7-bit ASCII, so: "Pokemon", " - " where the design draws a middot, `+3.3` and `-1.2`
where it draws triangles, and SVG chevrons where it draws arrows. No em dashes anywhere, in copy or
code.

Layout follows the phone-first rule the project already keeps: the ranked list is the page, filters
sit above it, nothing the reader needs is below a text input. There is no text input on this site in
this version, so the search-layout rule is satisfied trivially, and `overflow-x` stays off `html` and
`body`.

## Structure

```
apps/meta/
  index.html            CSP meta tag, fonts, the shell
  scripts/bake.ts       baseline + species + moves bake, run before build
  src/
    main.tsx  App.tsx
    api.ts              typed fetch of /api/v1/*, with the window and band params
    data.ts             loads the baked species/moves/leagues/seasons, memoised
    baseline.ts         loads and shapes baseline/<league>.json
    rank.ts             the merge: measured or baseline, the threshold rule, the ranked rows
    stats.ts            margin, confidence band, trend gating, share formatting
    route.ts            path + query to a view and back
    links.ts            pick3 deep links
    format.ts           species names, forms, ASCII helpers
    design/tokens.css  app.css
    components/         Sprite, TypeTag, Bar, Sparkline, Segmented, Pills, SourceNote, StatCard
    screens/            Overview, Teams, Species, About
  test/                 vitest, jsdom for the screens
```

`rank.ts` and `stats.ts` hold every judgement about what is trustworthy, as pure functions over plain
data, so the rules above are tested directly rather than through the DOM.

## Deploy

`workers/counter/wrangler.toml` gains an `[assets]` block pointing at `apps/meta/dist`, with
`not_found_handling = "single-page-application"` and `run_worker_first` listing the API paths so the
worker keeps answering them and everything else falls through to the site.

The existing `counter.yml` workflow becomes the deploy for both: build the game data (cached by the
same key pages.yml uses), bake, build `apps/meta`, then `wrangler deploy`. Its path filter widens to
include `apps/meta/**` and the data inputs. This matters: a worker deploy without `apps/meta/dist`
present would publish an empty asset set and blank the site, so the two cannot be deployed separately.

`ci.yml` gains `apps/meta` to lint, typecheck and test, and builds it so a broken build fails the PR.

## Manual steps for Travis

One, once:

1. Cloudflare dashboard, Workers and Pages, `pickthree-counter`, Settings, Domains and Routes, Add,
   Custom Domain, `meta.pick3.gg`. Cloudflare writes the DNS record itself because the zone is in the
   same account.

Before that is done the site is live at `https://pickthree-counter.travis-c82.workers.dev/`.

## Testing and verification

- Worker: unit tests for the new aggregation (band filter, previous window, weekly buckets,
  co-occurrence, per-member movesets, the run-versus-face distinction).
- Site: unit tests for `rank.ts` (threshold in both directions, the cut rules, the ordering),
  `stats.ts` (margins, confidence, trend gating), `route.ts` (round trips) and `links.ts`.
- Screens: jsdom render tests for each of the four screens against a stubbed API, including the
  below-threshold overview, which is the state that will actually ship on day one.
- A puppeteer screens script mirroring `apps/web/scripts/screens.mjs`, driving the built site against
  `vite preview` with a stubbed API, failing on any console error.
- `npm run lint`, `npm run typecheck`, `npm test` all green before anything is pushed.

## Out of scope

- API keys for other apps to post records. The About page describes the plan and the endpoint shape;
  nothing accepts a key yet, and the page says "coming" rather than implying it works.
- Accounts and passkeys.
- Feeding measured data back into pick3's data build or its recommendations.
- Per-team rich link previews.
- Cups beyond the three standard leagues.
