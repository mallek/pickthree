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
import { blendWeights } from '@pickthree/engine/meta';
import type { MetaSummaryV1, SpeciesStats } from './api.js';
import type { Baseline } from './baseline.js';
import { type Confidence, confidence, trendPoints } from './stats.js';

/** Counted battles at which measured play earns half the say. Was the gate; is now the curve. */
export const HALF_SAY_BATTLES = 300;
/** Contributing devices at which measured play earns half the say. Same history. */
export const HALF_SAY_DEVICES = 5;
/** A species is listed once PvPoke ranks it or it was faced at least this often. */
export const LISTED_MIN = 1;

/** How much of the say measured play has earned: the smaller of the two curves, 0 to 1. */
export function measuredSay(battles: number, devices: number): number {
  const byBattles = battles <= 0 ? 0 : battles / (battles + HALF_SAY_BATTLES);
  const byDevices = devices <= 0 ? 0 : devices / (devices + HALF_SAY_DEVICES);
  return Math.min(byBattles, byDevices);
}

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
}

export interface SpeciesRanking {
  /** `a`, 0 to 1: how much of the say measured play has earned. */
  say: number;
  battles: number;
  devices: number;
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
): SpeciesRanking {
  const say = measuredSay(meta.battles, meta.devices);
  const rankOf = new Map<string, number>();
  ranks.forEach((id, i) => {
    if (!rankOf.has(id)) {
      rankOf.set(id, i + 1);
    }
  });

  const seen = new Map<string, SpeciesStats>(meta.species.map((s) => [s.speciesId, s]));
  // The list is PvPoke's curated group plus everything anyone actually faced. A species PvPoke
  // ranks but nobody curated or faced is not part of what this league is facing, so it is not
  // a row; its rank is still used the moment it is faced.
  const ids: string[] = [];
  const known = new Set<string>();
  const add = (id: string): void => {
    if (!known.has(id)) {
      known.add(id);
      ids.push(id);
    }
  };
  for (const s of baseline.species) {
    add(s.speciesId);
  }
  for (const s of meta.species) {
    if (s.sightings >= LISTED_MIN) {
      add(s.speciesId);
    }
  }

  const weights = blendWeights(
    {
      species: ids,
      ranks: new Map(ids.map((id) => [id, rankOf.get(id) ?? null])),
      sightings: new Map(ids.map((id) => [id, seen.get(id)?.sightings ?? 0])),
      battles: meta.battles,
    },
    // `share` is the whole story: blendShare returns it and never reads the battle curve, so
    // minBattles and halfLife below are inert, present only because BlendOptions requires them.
    // They are written as the values this curve would use if it ran (no floor, because the curve
    // already handles a small sample) rather than as arbitrary numbers, so a reader who deletes
    // the override does not silently get a different formula.
    // The override exists because blendShare cannot express the device cap on its own.
    { minBattles: 0, halfLife: HALF_SAY_BATTLES, share: say, unrankedPrior: 0 },
  );

  const prev = meta.previous;
  const prevById = new Map((prev?.species ?? []).map((s) => [s.speciesId, s.sightings]));
  const inGroup = new Set(baseline.species.map((s) => s.speciesId));

  const sorted = [...ids].sort(
    (a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || a.localeCompare(b),
  );
  const heaviest = weights.get(sorted[0] ?? '') ?? 0;

  const rows: SpeciesRow[] = sorted.map((speciesId, i) => {
    const s = seen.get(speciesId);
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
      // A share of nothing is not zero, it is nothing. A screen must print a count instead.
      share: meta.battles > 0 ? sightings / meta.battles : null,
      wins,
      losses,
      decided,
      confidence: confidence(decided),
      trend: prev
        ? trendPoints(sightings, meta.battles, prevById.get(speciesId) ?? 0, prev.battles)
        : null,
      barPct: heaviest > 0 ? Math.round((weight / heaviest) * 100) : 0,
    };
  });

  return {
    say,
    battles: meta.battles,
    devices: meta.devices,
    rows,
    weights,
    pvpokeCommit: baseline.pvpokeCommit,
    pvpokeDate: baseline.pvpokeDate,
  };
}
