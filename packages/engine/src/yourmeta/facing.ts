import { ranksOf, type CommunitySummary } from '../meta/community.js';
import { metaRanks } from '../gamedata/metaRank.js';
import type { StaticData } from '../recommend.js';
import type { MatrixView } from '../search/matrixView.js';
import { communityProfile } from './community.js';
import { buildFacingProfile, plainWeights, type FacingProfile } from './profile.js';
import type { LoggedBattle } from './types.js';

/** Who the player expects to face: the Source picker's five choices. */
export type FacingSource = 'prior' | 'log' | 'ladder' | 'tournament' | 'all';
export type CommunityKind = 'ladder' | 'tournament' | 'all';

export interface FacingWindow {
  since: string;
  until: string;
  /** "This meta", "30 days" or "7 days". */
  label: string;
}

/**
 * The one way every engine entry point is told whose opponents to weight. Absent means PvPoke.
 * `unavailable` marks a community source that could not be read, so the sentence says so.
 */
export type FacingInput =
  | { kind: 'prior'; unavailable?: CommunityKind }
  | { kind: 'log'; battles: LoggedBattle[] }
  | { kind: 'community'; source: CommunityKind; summary: CommunitySummary; window: FacingWindow };

export function profileFor(
  data: Pick<StaticData, 'meta' | 'rankings' | 'banned'>,
  view: MatrixView,
  facing: FacingInput | undefined,
): FacingProfile {
  const ranks = metaRanks(data.rankings);
  const input = facing ?? { kind: 'prior' as const };
  if (input.kind === 'log') {
    return buildFacingProfile({
      battles: input.battles,
      opponents: view.opponents,
      ranks,
      rankings: data.rankings.overall,
      blend: true,
    });
  }
  if (input.kind === 'community') {
    return communityProfile({
      summary: input.summary,
      source: input.source,
      window: input.window,
      opponents: view.opponents,
      group: data.meta.map((m) => m.speciesId),
      rankOrder: ranksOf(data.rankings.overall),
      banned: new Set(data.banned ?? []),
      rankings: data.rankings.overall,
    });
  }
  return {
    weights: plainWeights(view.opponents, ranks),
    outsiders: [],
    outsiderWeights: new Map(),
    battles: 0,
    sightings: 0,
    engaged: false,
    reason: input.unavailable ? 'unavailable' : 'prior',
    source: 'prior',
  };
}

/** The k heaviest matrix columns, heaviest first; ties keep column order. */
export function heaviestColumns(
  view: MatrixView,
  weights: ReadonlyMap<string, number>,
  k: number,
): number[] {
  return view.opponents
    .map((id, o) => ({ o, w: weights.get(id) ?? 0 }))
    .sort((a, b) => b.w - a.w || a.o - b.o)
    .slice(0, k)
    .map((x) => x.o);
}
