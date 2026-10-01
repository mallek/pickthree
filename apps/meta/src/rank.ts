/**
 * One ranked list, blended continuously from PvPoke's curated prior and from measured play. The
 * ranking itself lives in @pickthree/engine/meta (rank.ts), so pick3 and this site rank by the
 * same code; this wrapper keeps the site's `legal` option, which the engine takes as a plain
 * banned set.
 */
import {
  HALF_SAY_BATTLES,
  HALF_SAY_DEVICES,
  HALF_SAY_EVENTS,
  HALF_SAY_TOURNAMENT_BATTLES,
  LISTED_MIN,
  measuredSay,
  rankSpecies as rankSpeciesBy,
  tournamentSay,
  type Baseline,
  type MetaSummaryV1,
  type SpeciesRanking,
} from '@pickthree/engine/meta';
import type { Legal } from './legal.js';
import type { SourceKey } from './route.js';

/** The blend's half-say points live beside the formula in @pickthree/engine/meta, so pick3 and
 *  this site cannot drift; they are re-exported here, where the site's rules have always named them. */
export {
  HALF_SAY_BATTLES,
  HALF_SAY_DEVICES,
  HALF_SAY_EVENTS,
  HALF_SAY_TOURNAMENT_BATTLES,
  LISTED_MIN,
  measuredSay,
  tournamentSay,
};
export type { SpeciesRanking, SpeciesRow } from '@pickthree/engine/meta';

export function rankSpecies(
  meta: MetaSummaryV1,
  baseline: Baseline,
  ranks: readonly string[],
  opts: { source: SourceKey; legal: Legal | null },
): SpeciesRanking {
  return rankSpeciesBy(meta, baseline, ranks, {
    source: opts.source,
    banned: opts.legal?.banned ?? new Set<string>(),
  });
}
