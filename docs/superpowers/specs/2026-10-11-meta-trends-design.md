# Meta trends: Spicy Picks and the Trending sort

Date: 2026-10-11. Status: designed with Travis in chat, each decision signed as it was made;
written up for his review. Revised the same day after it shipped: Spicy Picks no longer measures
the trend (see "Revision: what Spicy Picks measures").

## Why

pick3 already works out how far every species moved in the blended meta rank (`rankTrend`, shown
as the green or red "up N" / "down N" tag on Collection rows), but there is no way to see the
movers together. Travis wants the trend exposed in two places:

1. **Collection** gets a **Trending** sort, so the biggest climbers come first.
2. **The Meta landing** (`#/meta`) gets a **Spicy Picks** card: off-meta picks players are
   running more than PvPoke expects, hidden when nothing qualifies.

## Decisions

- **Two measures, on purpose.** Collection sorts by raw places moved, the same number its tag
  shows. Spicy Picks measures blended share above PvPoke's prior, not the trend.
- **Spicy Picks qualifies a species** when it is outside the current top 10, holds at least 1%
  blended share, and its blended share is above PvPoke's prior share for it. It orders by how far
  above, ties by current rank, and shows at most 5.
- **Hidden, not empty.** No qualifying species, still loading, offline or a failed read: the card
  is not rendered. Most seen already reports a failed read.
- **No trend, no Trending sort.** Collection's community read follows the sharing switch; with
  sharing off (or a league with no trend data) the Trending option is not offered, and a saved
  Trending pick falls back to Meta rank.

## What trend means (unchanged)

Places moved in the blended order against a baseline: the same "This meta" window ending seven
days earlier, or PvPoke's own order (the blend at 100% prior) while the window is under a week old
(`useMetaRanking`, `metaData.ts`'s `weekEarlier`, `trend.ts`'s `rankTrend`). A species the
baseline did not list has no trend: it is new, not risen. This spec does not change any of that.

## Revision: what Spicy Picks measures

The first version ranked climbers by share gained against the trend's baseline. Live data showed
two flaws: a species could qualify by climbing while its share fell (Mimikyu, #6 to #3 in Mega
Great on 3.6% to 3.5%), and "this season" against "this season minus a week" compares a month of
data mostly with itself, so the gains were 0.1 to 0.3 points of noise. A last-7-days split was
ruled out because most leagues are rotation cups that last a week. The measure that works from a
cup's first day: the blend against PvPoke's prior in the same window. The blend already weighs
measured play by how much there is, so a league with few battles shows few picks or none.

## Engine: `packages/engine/src/meta/spicy.ts`

New pure function, exported from `@pickthree/engine/meta` (replacing the first version's
`trendingUp`):

```ts
spicyPicks(
  order: readonly string[],                  // current blended order
  weights: ReadonlyMap<string, number>,      // current blended weights
  priorWeights: ReadonlyMap<string, number>, // PvPoke's prior (the blend at 100% prior)
  opts?: { minShare?: number; skipTop?: number; limit?: number }, // 0.01, 10, 5
): { speciesId: string; above: number; offMeta: boolean }[]
```

- Skips the first `skipTop` of `order`; keeps weight `>= minShare` and `above > 0`, where `above`
  is weight minus prior weight (a species PvPoke does not list has prior 0).
- `offMeta` is true when the prior has no weight for it (PvPoke's meta group does not list it).
- Orders by `above` descending, then by position in `order`; takes the first `limit`.

## Ranking hook: `apps/web/src/state/useMeta.ts`

`useMetaRanking` also returns `priorWeights: Map<string, number>`: PvPoke's prior, which the hook
already computes for its fallback and its under-a-week trend baseline. No new network read.

## Meta landing: the Spicy Picks card (`apps/web/src/screens/MetaHome.tsx`)

- Placed directly under Most seen. Reads `useMetaRanking(league, { window: 'meta', source: 'all',
  community: true })`, the same call as Most seen, so the two share one load and agree.
- Rows reuse Most seen's row (`mh-seen`): token, name, a neutral **Off meta** tag where Most seen
  has its bar (only when `offMeta`), the share under Most seen's rule (pink only when measured and
  sighted), chevron. A row opens the species page.
- Head: **Spicy Picks**. Subtitle: "Played more than PvPoke expects".
- Footer link: "Explore Pokémon" to Collection, as on Most seen.
- Not rendered while loading, on error, offline, or when `spicyPicks` returns nothing (no battles
  measured means the blend is the prior, so nothing is above it).
- Copy is plain 7-bit ASCII apart from the existing "Pokémon".

## Collection: the Trending sort (`apps/web/src/screens/Collection.tsx`)

- `Sort` gains `'trending'`, labeled **Trending**, listed after Meta rank.
- Order: places moved, biggest climb first. Species with no movement or no trend entry come after
  every climber, fallers after those, biggest fall last. Ties by meta rank (`metaKey`), then IV
  rank for copies of one species.
- Like Meta rank, your groups and the species you have none of are interleaved in one order
  (trend is a species property), not yours first.
- The option is offered only when some species in `meta?.trend` moved (a trend of all zeros,
  as when nothing has been measured, has nothing to sort by). Otherwise Trending is left out of
  the options and the effective sort is Meta rank; the saved pick stays as it is, so it comes
  back when movement does.

## Testing

- Engine (`packages/engine/test/meta/spicy.test.ts`), synthetic data only: the top 10 skipped,
  the 1% floor, at or below the prior excluded, ordering by how far above, ties by current rank,
  `offMeta`, the cap of 5, an empty result.
- Web:
  - MetaHome: the card renders qualifying rows in order with the Off meta tag; it is absent when
    nothing qualifies and while offline.
  - Collection: Trending order (climbers, then flat and new, then fallers; ties by meta rank),
    interleaving of not-collected rows, the option hidden with sharing off, a saved Trending pick
    falling back to Meta rank.
  - useMeta: `priorWeights` is PvPoke's prior, with and without a community read.
- Screens: `web:screens` captures the landing with the card (fixture with trend data) in both
  themes; the audit runs on MetaHome and Collection.

## Out of scope

- A "falling" card or any downward view on the landing.
- Changing how trend is measured, its window or its baseline.
- Showing how far above PvPoke a pick is as a number in the UI.
