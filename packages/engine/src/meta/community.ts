/**
 * The blend meta.pick3.gg ranks with and pick3 weights opponents with: one formula, two callers.
 *
 *   aT     = tournamentSay(tournament battles, events)
 *   p1     = (1 - aT) * pvpokePrior + aT * tournamentPickShare   (a banned species keeps the prior)
 *   a      = measuredSay(ladder battles, devices)
 *   weight = (1 - a) * p1 + a * ladderSightingShare
 *
 * Each source switches terms off rather than using a different formula: `prior` is both off,
 * `ladder` is the second alone, `tournament` the first alone, `all` the sequence. The half-say
 * constants are the curves' midpoints, never gates. Moved from apps/meta/src/rank.ts, unchanged.
 */
import { blendWeights } from '../yourmeta/blend.js';

/** Counted battles at which measured play earns half the say. */
export const HALF_SAY_BATTLES = 300;
/** Contributing devices at which measured play earns half the say. */
export const HALF_SAY_DEVICES = 5;
/** Tournament battles at which tournament play earns half the say of its own term. 100 because
 *  a tournament battle carries two full teams and a verified result, roughly three ladder
 *  records of information. A half-say point, not a gate. */
export const HALF_SAY_TOURNAMENT_BATTLES = 100;
/** Events at which the same term earns half the say. 2 because one event is one local meta, the
 *  same reason one phone is held to a sixth of the say. Also a half-say point, not a gate. */
export const HALF_SAY_EVENTS = 2;
/** A species is listed once PvPoke ranks it or it was faced or picked at least this often. */
export const LISTED_MIN = 1;

/** How much of the say measured ladder play has earned: the smaller of the two curves, 0 to 1. */
export function measuredSay(battles: number, devices: number): number {
  const byBattles = battles <= 0 ? 0 : battles / (battles + HALF_SAY_BATTLES);
  const byDevices = devices <= 0 ? 0 : devices / (devices + HALF_SAY_DEVICES);
  return Math.min(byBattles, byDevices);
}

/** How much of the say tournament play has earned: the smaller of the two curves, 0 to 1. */
export function tournamentSay(battles: number, events: number): number {
  const byBattles = battles <= 0 ? 0 : battles / (battles + HALF_SAY_TOURNAMENT_BATTLES);
  const byEvents = events <= 0 ? 0 : events / (events + HALF_SAY_EVENTS);
  return Math.min(byBattles, byEvents);
}

export type CommunitySource = 'prior' | 'ladder' | 'tournament' | 'all';

/** The fields of the worker's /api/v1/meta response the blend reads. MetaSummaryV1 satisfies it. */
export interface CommunitySummary {
  battles: number;
  devices: number;
  species: readonly { speciesId: string; sightings: number }[];
  tournament: {
    events: number;
    battles: number;
    species: readonly { speciesId: string; picks: number }[];
  } | null;
}

export interface CommunityWeightsOptions {
  source: CommunitySource;
  /** PvPoke's meta group species for the league, in its own order (the site's baseline). */
  group: readonly string[];
  /** PvPoke overall order, de-duplicated with ranksOf. */
  rankOrder: readonly string[];
  /** Species the Play! ruleset bans in this league: they keep the plain prior in the first blend. */
  banned: ReadonlySet<string>;
}

export interface CommunityWeights {
  /** Per species, normalised over `ids`. */
  weights: Map<string, number>;
  /** Every species that got a weight: the meta group first, then measured, then picked. */
  ids: string[];
  /** The ladder term's share of the say, 0 to 1. */
  say: number;
  /** The tournament term's share of the say, 0 to 1. */
  tournamentSay: number;
}

/** PvPoke's overall order with repeats dropped: a species' rank is its first appearance. First
 *  entry wins a duplicate, the same rule gamedata/metaRank.ts's positions() and metaRanks()
 *  keep, so a species' rank here names the same PvPoke entry pick3 ranks it by. */
export function ranksOf(overall: readonly { speciesId: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of overall) {
    if (!seen.has(e.speciesId)) {
      seen.add(e.speciesId);
      out.push(e.speciesId);
    }
  }
  return out;
}

export function communityWeights(
  summary: CommunitySummary,
  opts: CommunityWeightsOptions,
): CommunityWeights {
  const block = summary.tournament;
  const tBattles = block?.battles ?? 0;
  const events = block?.events ?? 0;
  const usesLadder = opts.source === 'all' || opts.source === 'ladder';
  const usesTournament = opts.source === 'all' || opts.source === 'tournament';
  const say = usesLadder ? measuredSay(summary.battles, summary.devices) : 0;
  const aT = usesTournament ? tournamentSay(tBattles, events) : 0;

  const rankOf = new Map<string, number>();
  opts.rankOrder.forEach((id, i) => {
    if (!rankOf.has(id)) {
      rankOf.set(id, i + 1);
    }
  });

  const seen = new Map(summary.species.map((s) => [s.speciesId, s.sightings] as const));
  const picked = new Map((block?.species ?? []).map((s) => [s.speciesId, s.picks] as const));
  const ids: string[] = [];
  const known = new Set<string>();
  const add = (id: string): void => {
    if (!known.has(id)) {
      known.add(id);
      ids.push(id);
    }
  };
  for (const id of opts.group) {
    add(id);
  }
  for (const s of summary.species) {
    if (s.sightings >= LISTED_MIN) {
      add(s.speciesId);
    }
  }
  for (const s of block?.species ?? []) {
    if (s.picks >= LISTED_MIN) {
      add(s.speciesId);
    }
  }

  const blendInput = {
    species: ids,
    ranks: new Map(ids.map((id) => [id, rankOf.get(id) ?? null] as const)),
  };
  const options = { minBattles: 0, halfLife: HALF_SAY_BATTLES, unrankedPrior: 0 };
  // PvPoke's prior alone: `share: 0` makes blendWeights return (1 - 0) * prior, which is the
  // normalised prior and nothing else. Asked for explicitly rather than recomputed here, so the
  // normalisation can never drift from the one the blend below uses.
  const prior = blendWeights({ ...blendInput, sightings: new Map(), battles: 0 }, { ...options, share: 0 });
  const afterTournament = blendWeights(
    {
      ...blendInput,
      sightings: new Map(ids.map((id) => [id, picked.get(id) ?? 0] as const)),
      battles: tBattles,
    },
    { ...options, halfLife: HALF_SAY_TOURNAMENT_BATTLES, share: aT },
  );
  // A banned species has no tournament share, not a zero one: zero says nobody picked it, which
  // is false; the plain prior says it was not observable in this population.
  const p1 = new Map(
    ids.map((id) => [id, (opts.banned.has(id) ? prior.get(id) : afterTournament.get(id)) ?? 0] as const),
  );

  // The second blend, written out rather than passed back through blendWeights, because its
  // prior term is p1 and blendWeights only knows how to build a prior from PvPoke ranks. The
  // arithmetic is blendWeights' own last line, and with aT = 0 (so p1 = prior) it reduces to
  // exactly the single ladder blend.
  let ladderTotal = 0;
  for (const id of ids) {
    ladderTotal += seen.get(id) ?? 0;
  }
  const weights = new Map(
    ids.map((id) => {
      const share = ladderTotal === 0 ? 0 : (seen.get(id) ?? 0) / ladderTotal;
      return [id, (1 - say) * (p1.get(id) ?? 0) + say * share] as const;
    }),
  );
  return { weights, ids, say, tournamentSay: aT };
}
