# Suggest teammates: pin a favorite, pick3 fills the rest

Date: 2026-09-19. Status: approved in chat (Travis), brainstormed and implemented the same day.
The "Implementation notes" section at the end records where the build departed from this design
and why. The `pick3-tos-wording` collision named in the original draft was already resolved:
`cd01cf4` had landed in main before this work started.

## Why

Build Your Team assumes the player already knows all three. Every other screen answers "what should
I run", and Build answers "is this good", but nothing answers the question players actually ask each
other:

> I like this Pokemon. What should I run with it?

That question is emotional before it is tactical. The player has a favorite, has probably already
built it, and is not shopping for the theoretically strongest team. They want the two Pokemon that
make their one work. Nothing in the app takes that as the starting point.

The raw material is already here and is not being used for this:

- The **matchup matrix** (ADR 002) holds every ranked species against PvPoke's meta group in three
  shield scenarios. Given a pinned species, the set of meta opponents that beat it is one lookup,
  and so is the set of species that beat those. That is the whole question, answered without
  simulating anything.
- The **community team board** (`workers/counter/src/teams.ts`) already serves `thirds` on every
  core row: the third members shared battles saw completing that pair, most common first. Real
  players' cores, already aggregated, currently read only by meta.pick3.gg.
- The **collection**, including what the player can actually afford to build, which the existing
  verdicts and cost tables already score.

## The shape of the answer

A button on Build, **Suggest teammates**, shown when at least one slot is filled and at least one is
empty. It sits under the three slots and above Analyze.

One tap fills the empty slots with the best core for the pins, so Analyze lights up immediately and
the player is one tap from the full breakdown they would have got by hand. Under the slots, a
compact row of named alternate characters, each one tap to swap in.

Three pins is Analyze and is unchanged. Swapping a slot is already the slot search and is unchanged.

## Decisions

1. **The matrix generates and scores. The community board re-ranks and annotates.** Not a numeric
   blend. Revisit the weighting once there is more shared data.
2. **The suggestion covers what you have caught, and will reach one past it.** Two tiers, never one
   mixed list, and the one-past is never a hard requirement.
3. **One core fills the board; named alternates sit under it.** Four characters, one of them
   conditional.
4. **It explains itself against the pin**, one line per suggested slot, out of the matrix. It never
   prints a team score or a win rate.
5. **Every league the app ships.** Cups stay behind their existing flag and inherit this with no
   special handling when they land.
6. **A weak pin is said out loud, once, and then built around anyway.**
7. **The button runs no team simulation.** Everything it prints is a matrix lookup.
8. Player-facing copy says **caught** or **in your collection**. Never "own".

## Where a suggestion comes from

The matrix always has an answer, for any species with a row, and it knows the collection. The
community board knows neither, is sparse today, and lives behind a network call. Making measured
play a scoring input would put a network round trip between a player and a suggestion, which breaks
the standing promise that all compute happens on the device.

So the community board is never a source of candidates and never moves a number. It re-ranks
candidates the matrix already produced, and it adds a sentence. When `thirds` holds nothing for the
pinned pair, the feature is unchanged and one chip is absent.

The failure modes this avoids are both real. Matrix alone produces theoretically perfect cores that
nobody plays and the player has never heard of. Community alone dies on cold start, dies on any
favorite nobody logs, and cannot see the collection at all.

## Yours, and one away

"Owns" is the wrong word for a Pokemon GO collection. Copy says caught, or in your collection.

The rule, stated so that nothing is a hard lock:

- **Tier 1 uses as much of the collection as it legally can, and fills only the slots it cannot
  fill.** Call the count of slots it could not fill `need`. Stand-ins it was forced into are free
  and do not count as chasing.
- **Tier 2 uses exactly `need + 1` stand-ins**, swapping one buildable slot for something the player
  has not caught, and appears only when it beats tier 1 by a margin (`CHASE_MARGIN`, a draft score
  constant the plan tunes). Otherwise there is one tier and no second heading.

A stand-in is the top-10% IV spread `analyze.ts` already uses for a species pick, not a perfect one,
because that is closer to what a player would actually end up with. Build already lets a player pick
a species they have not caught, so this is established behavior rather than a new concept.

That rule degrades on its own:

- **No collection at all.** Tier 1 is entirely stand-ins, tier 2 does not appear, and the player
  gets one clean answer with the IV assumption stated. This matters: Build currently gives someone
  who has not imported a CSV nothing at all.
- **A thin collection.** Tier 1 uses what there is and fills the rest. Same shape.
- **A full collection.** Tier 1 is entirely the player's, tier 2 is the one away.

Pin count falls out of the same function, because a pin is just a slot already decided. Zero pins is
supported by the engine and **not exposed on the screen in v1**, since it would be a second, less
focused entry point next to the Teams recommendation. Excluding it from the engine would cost code
rather than save it.

## The four characters

Characters are four weightings over one set of drafts, not four searches. Two of them landing on the
same core is expected; the row collapses and shows fewer chips.

| Character | What it optimizes | Chip |
| --- | --- | --- |
| Safest | `draftScore` as it stands, coverage led. Fills the board. | Safest |
| Cheapest | `draftScore` discounted by the summed cost of the **fills only**, since the pin's cost is already accepted | Cheapest |
| Anti-meta | Coverage weighted to the heaviest opponents only, by the facing profile | Anti-meta |
| Community | Drafts whose fills appear in `thirds` for the pinned pair, ordered by sightings, `draftScore` breaking ties | What players run |

The anti-meta character reads the facing profile, so Your Meta re-weights it for free when the blend
is on and it falls back to PvPoke weights when it is not. No new switch.

The community chip is conditional on the board holding something for this pair. Its absence is
normal, not an error state, and the row is not a fixed width.

"Anti-meta" is a PvP term, and the house rule is to explain one on first use. The Counters screen
already carries the idea, so the chip keeps the short label and the suggestion line under it does
the explaining: "Beats the Pokemon you run into most."

Named characters beat numbered ones because a rejection always has a reason. "Too expensive" and "I
keep losing to Azumarill" are answered by a label; they are not answered by "core 3".

## How it explains itself

Analyze answers "is this team good". The button answers a narrower question, **"why these two, for
my one?"**, and needs its own sentence.

For a pin P, `prepare()` already yields `counters`, the meta opponents that beat P at 1-1 shields.
For a fill S, `win11` is what S beats. The intersection is the answer, and it is a lookup.

Each filled slot gets one line:

> Beats Azumarill, Lickitung and 4 more that Skarmory loses to.

The named opponents are the two or three heaviest by the facing profile, so Your Meta re-weights them
for free. The rest is a count. The second fill is scored and phrased against the pins **and** the
first fill, so it does not restate the same coverage.

When a fill covers nothing new, which a cheapest or community pick can legitimately do, the line
falls back to its own standing rather than inventing coverage:

> Beats 19 of 48 on its own, the most of anything left in your collection.

Two conditional lines: the character chip carries its own reason and gets no sentence, and the
community pick adds "37 shared battles ran this pair."

**The honesty constraint.** These lines come from the matrix at default IVs and fixed shield
scenarios. Analyze simulates the player's actual specimens. They can disagree. So the suggestion
prints reasons and never prints a team score, a win rate, or anything shaped like Analyze's verdict.
This is the same rule the meta ranking spec applies to projections, and it also stops the player
reading two different numbers for one team on one screen.

## When the favorite is bad

Say so, in one calm line, and then build the best team around it anyway. Both, never either.

Quietly building around a weak pick and printing a cheerful team would be the first time this app
lied to anyone, and it breaks the rule that every result carries its assumptions. Refusing, or
nagging, misses the point of the feature: the player knows they are picking with their heart, and
they asked for teammates, not a review.

The line is not a courtesy. It is what makes the next screen agree with this one. Analyze is one tap
away and will print a low number out of 100. Say nothing first and the app looks like it wasted the
player's time. Say it first and the low number confirms us.

The number comes from machinery that already exists. `specimenVerdict` computes `metaWins` against
the meta group at 1-1 shields:

> Skarmory beats 12 of 48 in the current Great League meta group. These two cover the most it loses
> to.

Rules for it:

- Computed per pin. The line names only the pins under the threshold, so two weak pins read as one
  sentence naming both.
- Shown only under `WEAK_PIN_SHARE` of the meta group, proposed at one third. Silence is the reward
  for a strong pick.
- One line, one tier of copy. The numbers carry the severity. "Magikarp beats 0 of 48 in the current
  Ultra League meta group" is blunt enough without a second, angrier sentence behind it.
- The trailing clause varies with how many slots were filled ("These two cover", "This one covers").
- A weak pin naturally pulls the suggestions toward heavy coverage, because coverage is already the
  heaviest factor. That is emergent, and no thumb goes on the scale.

**Cannot legally play this league is a different thing from weak.** `analyze.ts` already throws a
clear error for a pick that will not fit the CP cap. It keeps doing exactly that and gets no new
copy.

## No simulation

Everything the button prints is a matrix lookup: who beats the pin, who covers that, coverage, cost,
community counts. ADR 002 built the matrix so a phone could prune without simulating, and this is
that case exactly. So the button is near instant on a phone, and Analyze, one tap later, does the
real simulation against the player's actual IVs and prints the verdict.

**The one exception, stated honestly:** a pin PvPoke does not rank has no matrix row. That single
row is simulated against the meta group before anything else runs, which is exactly what
`analyze.ts` already does through `withSimulatedRows`, at the same cost, reporting progress the same
way. It is one row of sims, not a team search.

What this costs: the matrix is default IVs at fixed shield scenarios, so a suggestion can be
slightly off for a specific specimen. Analyze corrects it one tap later, and the assumptions block
says so.

## Engine

New module `packages/engine/src/teammates/`, a sibling of `counters/` and `yourmeta/`, since it has
its own result shape and its own sentences.

```ts
export type Character = 'safest' | 'cheapest' | 'antimeta' | 'community';

/** What the engine needs from the community board, so it never depends on the API shape. */
export interface CommunityPairing {
  /** Sorted species ids of the pair actually seen. */
  species: string[];
  /** Third members seen completing it, most common first. */
  thirds: { speciesId: string; sightings: number }[];
}

export interface SuggestOptions extends BuildOptions {
  /** How many top-ranked analyzable species to consider beyond the collection. */
  chasePool: number;
  /** Characters to produce, in order. The first one fills the board. */
  characters: Character[];
  community?: CommunityPairing[];
  yourMeta?: YourMetaInput;
}

export interface SuggestedSlot {
  /** Slot index on the board this fills. */
  slot: 0 | 1 | 2;
  pick: TeamPick;
  speciesId: string;
  /** Not in the collection: run at top-10% IVs. */
  standIn: boolean;
  /** Why this one, framed against the pins and any earlier fill. */
  line: string;
}

export interface Suggestion {
  character: Character;
  label: string;
  fills: SuggestedSlot[];
  /** True when this reaches one past what the collection could cover. */
  chase: boolean;
  /** Community only: shared battles that ran this pairing. */
  sightings: number | null;
}

export interface SuggestResult {
  /** The honest line about a weak pin, or null when the pins hold their own. */
  pinLine: string | null;
  /** Best first. The first one fills the board. */
  suggestions: Suggestion[];
  assumptions: Assumptions;
  ms: number;
}
```

The call takes the board as the screen holds it, nulls being the empty slots, so it maps directly
onto `s.picks`:

```ts
suggestTeammates(
  board: [TeamPick | null, TeamPick | null, TeamPick | null],
  specimens: Specimen[],
  options: Partial<SuggestOptions>,
): SuggestResult;
```

### Pipeline

Every step reuses something that exists. Pinning makes the search **cheaper** than today's, not
dearer: `generateTrios` is an n-choose-3 loop, one pin makes it a pairs loop, two pins make it a
single scan.

1. **Resolve the pins** with `resolvePick`, which moves out of `analyze.ts` into a shared spot and
   gets exported. No behavior change to Analyze.
2. **A pin with no matrix row** goes through `withSimulatedRows`, as above.
3. **Build the pool.** `candidatePool` over the collection's builds, as today, unioned with a chase
   pool of the top `chasePool` species that have a matrix row, ranked by PvPoke overall, each as a
   `hypotheticalSpecimen`. That set is what `LeagueInfo.analyzable` already exposes to the UI. The pins' species are removed from the pool so a pin cannot be
   suggested back.
4. **Search** with `prepare` and `evaluateTrio`, pins forced into every trio.
5. **Score four ways** over the one set of drafts, per the characters table.
6. **Tier the results**, per `need` and `CHASE_MARGIN`.
7. **Write the lines** from the matrix intersections, weighted by the facing profile.

### Costs to measure, not assume

`hypotheticalSpecimen` enumerates IV spreads per species. Doing that across a couple of hundred
species may be slow on a phone. `chasePool` caps it by PvPoke overall rank, on the reasoning that a
chase suggestion nobody ranks is not a good chase suggestion. **The plan measures this and sets the
cap from the measurement rather than from this paragraph.** A per-league cache of the chase pool in
the worker is the obvious fallback if the first build is slow but repeat use matters more.

## Web

- **`ComputeHost.suggestTeammates`**, one new `WorkerRequest` variant and its response, matching the
  existing request/response shape in `host/protocol.ts`. `WorkerHost` implements it; the in-process
  test host implements it too.
- **`apps/web/src/components/TeammateSuggestions.tsx`**, new. `Build.tsx` is already about 650 lines
  and takes only the button, the call and the result wiring. The chips, the lines and the weak-pin
  line live in the component.
- **Store**: `suggestions`, `suggesting` and `suggestError` on the reducer, plus a
  `suggestTeammates` action, following how `analyze` and `findOrder` already work.
- **Behavior**: the button shows only when at least one slot is filled and at least one is empty. On
  a result, the first suggestion's fills go into the empty slots through `setPicks`, exactly as a
  manual `fill()` would, and `orderedByPick3` resets. Tapping a chip swaps that character's fills
  in. Analyze is then reachable with no further taps.

## The community read

**This is a fourth outbound call and the first one that is a read.** CLAUDE.md enumerates the
outbound calls as the hit counter, error reports and battle records, all writes, all opt-out. That
rule is amended rather than quietly stretched.

- One GET to `/api/v1/teams?league=great` on the existing counter origin. **The whole board, never a
  query naming the pin.** Filtering happens on the device. The request says which league the player
  is in and nothing else, so it cannot leak a favorite, let alone a collection.
- CSP already allows that origin in the `connect-src` meta tag. Nothing widens.
- Fetched lazily the first time the button runs in a league, cached for the session, and **failing
  silent**. Offline, blocked, rate limited or empty, the community chip is absent and the other
  three characters are unaffected.
- It follows `Settings.share.enabled`. A player who turned sharing off is not contributing and will
  not be fetching either.
- New `apps/web/src/community.ts`, reusing `COUNTER_ORIGIN` from `counter.ts`. It maps `TeamRowV1`
  cores down to `CommunityPairing[]` so the engine never sees the API shape.

## Rules this changes

CLAUDE.md's outbound-calls rule gains the read: the collection never leaves the device; the
outbound calls are the anonymous hit counter, opt-out error reports, opt-out battle records, and a
read of the community team board that names only a league.

## Testing and verification

Engine, in `packages/engine`:

- The pins appear in every suggestion, at one pin and at two.
- The weak-pin line at, just above and just below `WEAK_PIN_SHARE`, including the zero case.
- The chase tier is capped at exactly `need + 1` stand-ins, and is absent when it does not clear
  `CHASE_MARGIN`.
- An empty collection produces one tier and no chase heading.
- A pin with no matrix row is simulated once and then read like any other row.
- Characters collapsing to the same core produce fewer suggestions, not duplicates.
- Community re-ranking with a board that has the pair, with a board that does not, and with no board
  at all.
- The explanation falls back correctly when a fill covers nothing new.

Web:

- The button shows only with at least one slot filled and at least one empty, and is absent at zero
  and at three.
- The first suggestion lands in the empty slots and Analyze becomes reachable.
- The community fetch failing does not fail the suggestion.
- `web:screens` picks up the new Build state and stays free of console errors.

`npm run lint`, `npm run typecheck` and `npm test` green before anything is pushed.

## Rollout

The `pick3-tos-wording` collision was stale: `cd01cf4 web: source-neutral import copy` was already
an ancestor of main when this work began, so nothing was blocked.

Two phases:

1. **Matrix characters and the button.** Safest, Cheapest and Anti-meta, the tiers, the lines, the
   weak-pin line. Stands entirely on its own with no network call.
2. **The community chip.** The read, the mapping and the fourth character. Garnish, and it may find
   the board still thin, which is why it does not gate phase 1.

Planning happens in a fresh session from this document.

## Out of scope

- **Zero pins as a visible entry point.** The engine supports it; the screen does not offer it in
  v1. It would be a second, blurrier door next to the Teams recommendation, and the motivating case
  is a player who already has a favorite.
- **Suggesting moves.** The move picker already exists on Build and is a separate decision from who
  to bring.
- **Measured play as a scoring input.** Recorded as the thing to revisit once the board is busier,
  per decision 1.
- **Chasing more than one Pokemon.** "You are three away" is a shopping list nobody asked for.
- **Simulating the suggestions.** Analyze does that, one tap later, and doing it twice would print
  two different numbers for one team.


## Implementation notes

Written after the build, so the next person reads the design and the departures together.

### The chase pool was already solved

The design proposed capping `hypotheticalSpecimen` by rank and measuring the cost. That turned out
to be the wrong tool. `coldstart/pool.ts`, built for the meta site's cold start, already makes one
synthetic specimen per species at PvPoke's own default IVs, cheaply, and those are the exact IVs
the matchup matrix was built from. The suggestion uses it, and `hypotheticalSpecimen` is not
involved. `STANDIN_FACTOR` caps the species list by PvPoke rank **before** building, always
including whatever the player pinned however far down the list it sits.

Measured on the fixture, one pin, Great League: 1562ms before the cap, 417ms after, same result.
The first guess at the bottleneck was the trio search; the search is 87ms and the stand-in builds
were 1025ms. It was measured rather than assumed, which is the only reason the right thing got
fixed.

### simStrength, not draftScore

Cores are ranked by `score/simStrength.ts`, the same matrix-only function meta.pick3.gg ranks teams
with, rather than by `TrioDraft.draftScore`. It is weight-aware and returns coverage, consistency
and safety. Nothing prints it.

### Cheapest is a discount, not a minimum

Implemented first as pure minimum cost, which suggested Octillery: already built, covers nothing.
`CHEAP_DISCOUNT` makes it a discount against the matrix score, as the design said. The test states
the rule as a floor, that a cheap core may give up at most a fifth of what the safest core covers,
so a regression there fails rather than quietly returning junk.

### One name per Pokemon

PvPoke lists Shadow Forretress and Shadow Quagsire **twice** in the Great League meta group, with
different movesets: 48 entries, 46 species. Two matrix columns is correct and they are simulated
apart. The sentence was naming the same Pokemon twice, so the named list now speaks once per
species. Counts stay out of 48, matching `assumptions.metaSize` and the rest of the app.

### The button is gated on the league bundle

`boot === 'ready'` is not enough. The league bundle can still be in flight, and the action needs
it, so a button shown on boot alone silently swallowed the tap under load. It is gated on
`leagueInfo` too.

### The first offer is applied inside the action

`stateRef.current` is assigned during render, so reading the offer back out of state in the same
tick after dispatching it finds nothing. The action applies the first offer from the value in
hand. `takeSuggestion` is only for the chips, where state has settled.

### Panel placement

Driving the built app showed the chips and the reasons below the bottom tab bar: the player pressed
the button, the board filled, and the reason was off screen. The panel sits above the order row,
which is also the right order of operations, and scrolls itself into view when an offer lands.

### Still open

- **Zero pins as a visible entry point** remains unexposed, as designed. The engine supports it.
- **`web:screens` has a pre-existing flaky step.** `edit in build` intermittently fails its back
  click ("a geometry click has missed here before", per its own comment). Seen once during this
  work and green on re-run. Not touched, not caused here, worth a look on its own.
