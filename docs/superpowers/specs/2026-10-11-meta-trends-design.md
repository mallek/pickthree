# Meta trends: Spicy Picks and the Trending sort

Date: 2026-10-11. Status: designed with Travis in chat, each decision signed as it was made;
written up for his review.

## Why

pick3 already works out how far every species moved in the blended meta rank (`rankTrend`, shown
as the green or red "up N" / "down N" tag on Collection rows), but there is no way to see the
movers together. Travis wants the trend exposed in two places:

1. **Collection** gets a **Trending** sort, so the biggest climbers come first.
2. **The Meta landing** (`#/meta`) gets a **Spicy Picks** card: the species gaining ground in the
   meta right now, hidden when nothing qualifies.

## Decisions

- **Two measures, on purpose.** Collection sorts by raw places moved, the same number its tag
  shows. Spicy Picks ranks by share gained, because raw places reward noise at the bottom of the
  list (#180 to #120 is 60 places on a handful of battles; #9 to #4 is the real story).
- **Spicy Picks qualifies a species** when it climbed at least one place and now holds at least
  1% blended share. It orders by blended share gained, ties by current rank, and shows at most 5.
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

## Engine: `packages/engine/src/meta/trend.ts`

New pure function, exported from `@pickthree/engine/meta`:

```ts
trendingUp(
  order: readonly string[],                     // current blended order
  trend: ReadonlyMap<string, number>,           // rankTrend(order, baselineOrder)
  weights: ReadonlyMap<string, number>,         // current blended weights
  baselineWeights: ReadonlyMap<string, number>, // baseline blended weights
  opts?: { minShare?: number; limit?: number }, // defaults 0.01 and 5
): { speciesId: string; places: number; gained: number }[]
```

- Keeps species with `trend > 0` and current weight `>= minShare`.
- `gained` is current weight minus baseline weight (a missing baseline weight counts as 0, though
  a species with a trend always had one).
- Orders by `gained` descending, then by position in `order`; takes the first `limit`.
- A species can climb places while its share holds flat or dips (others fell further). It still
  qualifies; it simply sorts below the ones that gained.

## Ranking hook: `apps/web/src/state/useMeta.ts`

`useMetaRanking` also returns `baselineWeights: Map<string, number> | null`: the weights of the
blend the trend was measured against (the week-earlier blend, or PvPoke's prior while the window
is under a week old). Both are already computed inside the hook; this only passes them out. It is
null whenever `trend` is empty (no community read, `trend: false`, a failed week-earlier read,
offline). No new network read.

## Meta landing: the Spicy Picks card (`apps/web/src/screens/MetaHome.tsx`)

- Placed directly under Most seen. Reads `useMetaRanking(league, { window: 'meta', source: 'all',
  community: true })`, the same call as Most seen, so the two share one load and agree.
- Rows reuse Most seen's row (`mh-seen`): token, name, the green `TrendTag` ("up N places" to a
  screen reader) where Most seen has its bar, the share under Most seen's rule (pink only when
  measured and sighted), chevron. A row opens the species page.
- Head: **Spicy Picks**. Subtitle: "Gained the most share this week", or "Gained the most share
  against PvPoke's list" while the window is under a week old (baseline is the prior).
- Footer link: "See all movers". It sets Collection's sort to Trending (the shared `collection.sort`
  sticky value) and opens Collection. With sharing off, Collection offers no Trending sort, so it
  opens on Meta rank; acceptable, and the card shows only when the landing's own read has trend.
- Not rendered while loading, on error, offline, when `baselineWeights` is null, or when
  `trendingUp` returns nothing.
- Copy is plain 7-bit ASCII.

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

- Engine (`packages/engine/test/meta/trend.test.ts`), synthetic data only: the 1% floor, a faller
  and a flat species excluded, ordering by share gained, ties by current rank, the cap of 5, an
  empty result.
- Web:
  - MetaHome: the card renders qualifying rows in order; it is absent when nothing qualifies,
    when `baselineWeights` is null, and while offline; the under-a-week subtitle.
  - Collection: Trending order (climbers, then flat and new, then fallers; ties by meta rank),
    interleaving of not-collected rows, the option hidden with sharing off, a saved Trending pick
    falling back to Meta rank.
  - useMeta: `baselineWeights` present with a trend, null without one.
- Screens: `web:screens` captures the landing with the card (fixture with trend data) in both
  themes; the audit runs on MetaHome and Collection.

## Out of scope

- A "falling" card or any downward view on the landing.
- Changing how trend is measured, its window or its baseline.
- Showing the share gained as a number in the UI.
