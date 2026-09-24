/**
 * One ranked list, blended continuously from PvPoke's curated prior and from measured play.
 *
 * What this replaces: the list used to FLIP. PvPoke's group led until 300 counted battles and 5
 * devices, then the measured list took over wholesale, so at 299 battles the measured data was
 * worth nothing and at 301 it was worth everything, and neither was ever true. The threshold did
 * not move, it dissolved: the numbers it used to gate on are the half-say points of the curve.
 *
 *   a      = min(battles / (battles + 300), devices / (devices + 5))
 *   weight = (1 - a) * pvpokePrior + a * measuredShare
 *
 * The device term is not decoration. One person with 900 battles and no company is held to a
 * sixth of the say until other devices appear, which is the same thing the old device floor was
 * protecting against, expressed as a slope.
 *
 * Unranked species take prior 0, not facingWeight's rank-64 floor. A species PvPoke does not rank
 * only appears here because it was measured, so it rides entirely on how often it was faced.
 * Prior 0 is also the "new to the meta" marker: a fact about the row, not a badge we grant.
 */
import {
  communityWeights,
  HALF_SAY_BATTLES,
  HALF_SAY_DEVICES,
  HALF_SAY_EVENTS,
  HALF_SAY_TOURNAMENT_BATTLES,
  LISTED_MIN,
  measuredSay,
  tournamentSay,
} from '@pickthree/engine/meta';
import type { MetaSummaryV1, SpeciesStats } from './api.js';
import type { Baseline } from './baseline.js';
import type { Legal } from './legal.js';
import type { SourceKey } from './route.js';
import { type Confidence, confidence, trendPoints } from './stats.js';

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

export interface SpeciesRow {
  speciesId: string;
  /** Position in the blended list, 1 based. */
  rank: number;
  /** Blended weight, 0 to 1, normalised over the list. The sort key. */
  weight: number;
  /** PvPoke's overall rank, or null when PvPoke does not rank it: the "new" marker. */
  pvpokeRank: number | null;
  /** True when PvPoke's curated meta group lists it. */
  inMetaGroup: boolean;
  sightings: number;
  /**
   * Share of counted battles, 0 to 1, or null when nothing was counted. This is a number to
   * print, NOT the quantity that feeds `weight`: the blend's measured term is this species'
   * sightings over the total sightings of every species on the list, which is a different
   * denominator. A row can be 8% of battles and a larger fraction of the measured term, because
   * one battle can show up to three opponents.
   */
  share: number | null;
  wins: number;
  losses: number;
  decided: number;
  confidence: Confidence;
  trend: number | null;
  /** 0 to 100, relative to the heaviest row. */
  barPct: number;
  /** This species' picks at a blended tournament event, 0 when it was never picked there. */
  tournamentPicks: number;
  /** Game 1 picks at a blended tournament event (a subset of `tournamentPicks`). */
  tournamentGame1Picks: number;
  /** Wins recorded for this species at a blended tournament event. */
  tournamentWins: number;
  /** Losses recorded for this species at a blended tournament event. */
  tournamentLosses: number;
  /** Picks at a blended tournament event whose exact form could not be resolved. */
  tournamentUnresolvedForms: number;
  /** True when the Play! ban list marks this species banned; it gets the plain prior, not a
   *  zero tournament share. */
  banned: boolean;
}

export interface SpeciesRanking {
  /** Which populations this ranking was asked to blend. */
  source: SourceKey;
  /** `a`, 0 to 1: how much of the say measured ladder play has earned. */
  say: number;
  battles: number;
  devices: number;
  /** How much of the say tournament pick share has earned, 0 to 1. */
  tournamentSay: number;
  /** Tournament battles behind `tournamentSay`. */
  tournamentBattles: number;
  /** Blended tournament events behind `tournamentSay`. */
  events: number;
  /** Tournament events seen but not blended in (too small a sample, or not this league's cup). */
  eventsOther: number;
  rows: SpeciesRow[];
  /** The same weights, by species id, for the team projections. */
  weights: Map<string, number>;
  pvpokeCommit: string;
  pvpokeDate: string;
}

export function rankSpecies(
  meta: MetaSummaryV1,
  baseline: Baseline,
  ranks: readonly string[],
  opts: { source: SourceKey; legal: Legal | null },
): SpeciesRanking {
  const block = meta.tournament;
  const tBattles = block?.battles ?? 0;
  const events = block?.events ?? 0;
  const blended = communityWeights(meta, {
    source: opts.source,
    group: baseline.species.map((s) => s.speciesId),
    rankOrder: ranks,
    banned: opts.legal?.banned ?? new Set<string>(),
  });
  const { ids, weights, say } = blended;
  const aT = blended.tournamentSay;
  const rankOf = new Map<string, number>();
  ranks.forEach((id, i) => {
    if (!rankOf.has(id)) {
      rankOf.set(id, i + 1);
    }
  });
  const seen = new Map<string, SpeciesStats>(meta.species.map((s) => [s.speciesId, s]));
  const picked = new Map((block?.species ?? []).map((s) => [s.speciesId, s] as const));
  const banned = opts.legal?.banned ?? new Set<string>();

  const prev = meta.previous;
  const prevById = new Map((prev?.species ?? []).map((s) => [s.speciesId, s.sightings]));
  const inGroup = new Set(baseline.species.map((s) => s.speciesId));

  const sorted = [...ids].sort(
    (a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || a.localeCompare(b),
  );
  const heaviest = weights.get(sorted[0] ?? '') ?? 0;

  const rows: SpeciesRow[] = sorted.map((speciesId, i) => {
    const s = seen.get(speciesId);
    const t = picked.get(speciesId);
    const sightings = s?.sightings ?? 0;
    const wins = s?.wins ?? 0;
    const losses = s?.losses ?? 0;
    const decided = wins + losses;
    const weight = weights.get(speciesId) ?? 0;
    return {
      speciesId,
      rank: i + 1,
      weight,
      pvpokeRank: rankOf.get(speciesId) ?? null,
      inMetaGroup: inGroup.has(speciesId),
      sightings,
      share: meta.battles > 0 ? sightings / meta.battles : null,
      wins,
      losses,
      decided,
      confidence: confidence(decided),
      trend: prev
        ? trendPoints(sightings, meta.battles, prevById.get(speciesId) ?? 0, prev.battles)
        : null,
      barPct: heaviest > 0 ? Math.round((weight / heaviest) * 100) : 0,
      tournamentPicks: t?.picks ?? 0,
      tournamentGame1Picks: t?.game1Picks ?? 0,
      tournamentWins: t?.wins ?? 0,
      tournamentLosses: t?.losses ?? 0,
      tournamentUnresolvedForms: t?.unresolvedForms ?? 0,
      banned: banned.has(speciesId),
    };
  });

  return {
    source: opts.source,
    say,
    tournamentSay: aT,
    battles: meta.battles,
    devices: meta.devices,
    tournamentBattles: tBattles,
    events,
    eventsOther: block?.eventsOther ?? 0,
    rows,
    weights,
    pvpokeCommit: baseline.pvpokeCommit,
    pvpokeDate: baseline.pvpokeDate,
  };
}
