import { communityWeights, type CommunitySummary } from '../meta/community.js';
import type { MetaEntry, RankingEntry } from '../gamedata/types.js';
import type { CommunityKind, FacingWindow } from './facing.js';
import type { FacingProfile } from './profile.js';

export interface CommunityProfileInput {
  summary: CommunitySummary;
  source: CommunityKind;
  window: FacingWindow;
  /** Matrix columns in matrix order. A species may appear twice (two movesets). */
  opponents: string[];
  /** PvPoke's meta group species. */
  group: readonly string[];
  rankOrder: readonly string[];
  banned: ReadonlySet<string>;
  /** Overall rankings: outsider movesets. */
  rankings: RankingEntry[];
}

export interface CommunityProfileOptions {
  /** Simulate the heaviest species with no matrix column. Off until measured volume justifies it. */
  communityOutsiders: boolean;
  maxOutsiders: number;
}

export const DEFAULT_COMMUNITY_PROFILE_OPTIONS: CommunityProfileOptions = {
  communityOutsiders: false,
  maxOutsiders: 8,
};

/**
 * Opponent weights from the community meta: meta.pick3.gg's own number per species, laid over
 * the matrix columns. Engaged whatever the volume, because the player chose the source; thin data
 * simply leaves the weights near PvPoke's prior, which is what the blend's curves are for.
 */
export function communityProfile(
  input: CommunityProfileInput,
  options: Partial<CommunityProfileOptions> = {},
): FacingProfile {
  const opts = { ...DEFAULT_COMMUNITY_PROFILE_OPTIONS, ...options };
  const blended = communityWeights(input.summary, {
    source: input.source,
    group: input.group,
    rankOrder: input.rankOrder,
    banned: input.banned,
  });
  const inMatrix = new Set(input.opponents);
  const entryOf = new Map<string, RankingEntry>();
  for (const e of input.rankings) {
    if (!entryOf.has(e.speciesId)) {
      entryOf.set(e.speciesId, e);
    }
  }
  const outsiders: MetaEntry[] = !opts.communityOutsiders
    ? []
    : blended.ids
        .filter(
          (id) =>
            !inMatrix.has(id) &&
            !input.banned.has(id) &&
            (entryOf.get(id)?.moveset.length ?? 0) >= 2,
        )
        .sort(
          (a, b) =>
            (blended.weights.get(b) ?? 0) - (blended.weights.get(a) ?? 0) || a.localeCompare(b),
        )
        .slice(0, opts.maxOutsiders)
        .map((id) => {
          const e = entryOf.get(id) as RankingEntry;
          return {
            speciesId: id,
            fastMove: e.moveset[0] as string,
            chargedMoves: e.moveset.slice(1, 3),
          };
        });
  let sightings = 0;
  for (const s of input.summary.species) {
    sightings += s.sightings;
  }
  return {
    weights: new Map(input.opponents.map((id) => [id, blended.weights.get(id) ?? 0] as const)),
    outsiders,
    outsiderWeights: new Map(
      outsiders.map((o) => [o.speciesId, blended.weights.get(o.speciesId) ?? 0] as const),
    ),
    battles: input.summary.battles,
    sightings,
    engaged: true,
    reason: 'community',
    source: input.source,
    community: {
      source: input.source,
      window: input.window,
      battles: input.summary.battles,
      devices: input.summary.devices,
      events: input.summary.tournament?.events ?? 0,
      tournamentBattles: input.summary.tournament?.battles ?? 0,
      say: blended.say,
      tournamentSay: blended.tournamentSay,
    },
  };
}
