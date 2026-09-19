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
 * sixth of the say until other devices appear, which is the same thing MEASURED_MIN_DEVICES was
 * protecting against, expressed as a slope.
 *
 * Unranked species take prior 0, not facingWeight's rank-64 floor. A species PvPoke does not rank
 * only appears here because it was measured, so it rides entirely on how often it was faced.
 * Prior 0 is also the "new to the meta" marker: a fact about the row, not a badge we grant.
 *
 * The superseded `rank()` and its thresholds are still at the bottom of this file. Overview.tsx,
 * About.tsx and Species.tsx read them; Tasks 12 and 13 move those screens onto `rankSpecies` and
 * delete the rest. Nothing new should read them.
 */
import { blendWeights } from '@pickthree/engine/meta';
import type { MetaSummaryV1, SpeciesStats } from './api.js';
import type { Baseline, BaselineSpecies } from './baseline.js';
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
  /** Share of counted battles, 0 to 1, or null when nothing was counted. */
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
    // minBattles 0 because the curve already handles a small sample: there is no floor to fall
    // off. share because blendShare cannot express the device cap on its own.
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

// ---------------------------------------------------------------------------------------------
// SUPERSEDED: the flip, and the two lists it chose between.
//
// `rankSpecies` above is what the site will rank with. Everything below still drives
// Overview.tsx, About.tsx and Species.tsx, which Tasks 12 and 13 rewrite; it is kept here,
// unchanged, so the shipping screens keep compiling and keep passing their own tests until then,
// and it goes out with them. Nothing new should read it.
// ---------------------------------------------------------------------------------------------

/**
 * Counted battles needed before the ranked list is the measured one. Below this a handful of
 * shared logs is not enough to say what a league actually faces, so PvPoke's curated group leads
 * instead.
 */
export const MEASURED_MIN = 300;
/**
 * When measured, a species is ranked only once it is faced this often (0.5% of battles). Below
 * that a single reporter's odd matchup would otherwise read as part of the meta.
 *
 * This is a listing cut, not a trust cut: at MEASURED_MIN battles a species can clear 0.5% share
 * on as few as 2 sightings. That is why a row's own confidence is computed from its own decided
 * battles below, never inferred from the fact that it made the measured list at all.
 */
export const RANKED_SHARE = 0.005;
/**
 * When not measured, a species is listed once it has been faced this many times. One sighting is
 * one report and proves nothing about repetition; two is the first point worth printing at all.
 */
export const SMALL_MIN = 2;
/**
 * Devices needed, alongside MEASURED_MIN battles, before the list is measured. 300 battles from
 * one device is one person's matchmaking queue, not what players face: whether the data
 * describes a population is a question about contributors, and battle count alone cannot answer
 * it.
 */
export const MEASURED_MIN_DEVICES = 5;

export interface MeasuredRow {
  speciesId: string;
  rank: number;
  sightings: number;
  /** Share of counted battles, 0 to 1, or null below the measured threshold: a count, not a percentage. */
  share: number | null;
  wins: number;
  losses: number;
  /** wins + losses. The right number to hand marginSentence, which wants decided battles, not sightings. */
  decided: number;
  /** How much the row's own record can be trusted, from its decided battles, not the window's. */
  confidence: Confidence;
  /** Percentage points, or null when a trend is not earned. */
  trend: number | null;
  /** 0 to 100, relative to the most faced species in the list. */
  barPct: number;
}

export interface BaselineRow {
  speciesId: string;
  rank: number;
  score: number | null;
  rating: number | null;
  fastMove: string;
  chargedMoves: string[];
  barPct: number;
}

export interface Ranking {
  /** Which list leads the page. */
  source: 'measured' | 'baseline';
  battles: number;
  devices: number;
  /** Why the measured list is not leading, or null when it is. */
  holdback: 'battles' | 'devices' | null;
  /** Always present, however small. Ordered by sightings, highest first. */
  measured: MeasuredRow[];
  /** Species faced exactly once, counted rather than listed, when not measured. */
  tail: number;
  /** Always present. PvPoke's curated list, ordered by its own score, highest first. */
  baseline: BaselineRow[];
  pvpokeCommit: string;
  pvpokeDate: string;
}

/**
 * Highest sightings first, species id as the tiebreak. Must match the worker's own comparator
 * (workers/counter/src/meta.ts) so a client-side re-sort never disagrees with the server's, and
 * must not assume the input already arrives this way: an unsorted array should not silently
 * corrupt rank numbers or "most faced" bars.
 */
function bySightings(a: SpeciesStats, b: SpeciesStats): number {
  return b.sightings - a.sightings || a.speciesId.localeCompare(b.speciesId);
}

/**
 * Highest score first, nulls last, species id as the tiebreak. Must match the bake step's own
 * comparator (apps/meta/scripts/bake.ts) for the same reason: the baseline file is expected to
 * arrive in this order, but rank() does not take that on faith.
 */
function byScore(a: BaselineSpecies, b: BaselineSpecies): number {
  return (b.score ?? -1) - (a.score ?? -1) || a.speciesId.localeCompare(b.speciesId);
}

export function rank(meta: MetaSummaryV1, baseline: Baseline): Ranking {
  const battlesEnough = meta.battles >= MEASURED_MIN;
  const devicesEnough = meta.devices >= MEASURED_MIN_DEVICES;
  const measuredEnough = battlesEnough && devicesEnough;
  // Named so a screen can say the real reason instead of guessing: battles takes priority when
  // both are short, since a low battle count is the more basic problem.
  const holdback: 'battles' | 'devices' | null = measuredEnough
    ? null
    : battlesEnough
      ? 'devices'
      : 'battles';
  const prev = meta.previous;
  const prevById = new Map((prev?.species ?? []).map((s) => [s.speciesId, s.sightings]));

  const sortedSpecies = [...meta.species].sort(bySightings);
  const kept = sortedSpecies.filter((s) =>
    measuredEnough
      ? meta.battles > 0 && s.sightings / meta.battles >= RANKED_SHARE
      : s.sightings >= SMALL_MIN,
  );
  const top = kept[0]?.sightings ?? 0;

  const measured: MeasuredRow[] = kept.map((s, i) => {
    const decided = s.wins + s.losses;
    return {
      speciesId: s.speciesId,
      rank: i + 1,
      sightings: s.sightings,
      // Percentages become counts below the measured threshold: a screen cannot print a share
      // here without deliberately inventing one, because there is not one to print.
      share: measuredEnough ? (meta.battles > 0 ? s.sightings / meta.battles : 0) : null,
      wins: s.wins,
      losses: s.losses,
      decided,
      confidence: confidence(decided),
      trend: prev
        ? trendPoints(s.sightings, meta.battles, prevById.get(s.speciesId) ?? 0, prev.battles)
        : null,
      barPct: top > 0 ? Math.round((s.sightings / top) * 100) : 0,
    };
  });

  // Below the measured threshold, a species faced exactly once is real but too thin to name; it
  // is folded into a single tail count rather than dropped silently. This must be sightings === 1,
  // not < SMALL_MIN: the worker emits a sightings-0 row for every species a reporter ran and never
  // faced (it calls take() for each team member), and those were never faced at all, so counting
  // them here would inflate "N more were faced once each" with species that were faced zero times.
  const tail = measuredEnough ? 0 : sortedSpecies.filter((s) => s.sightings === 1).length;

  const sortedBaseline = [...baseline.species].sort(byScore);
  const bestScore = sortedBaseline[0]?.score ?? null;
  const baselineRows: BaselineRow[] = sortedBaseline.map((s, i) => ({
    speciesId: s.speciesId,
    rank: i + 1,
    score: s.score,
    rating: s.rating,
    fastMove: s.fastMove,
    chargedMoves: s.chargedMoves,
    barPct:
      bestScore && bestScore > 0 && s.score !== null ? Math.round((s.score / bestScore) * 100) : 0,
  }));

  return {
    // The baseline is never the answer just because it exists; it leads only while measured
    // play is too thin to trust, and the measured list is returned either way.
    source: measuredEnough ? 'measured' : 'baseline',
    battles: meta.battles,
    devices: meta.devices,
    holdback,
    measured,
    tail,
    baseline: baselineRows,
    pvpokeCommit: baseline.pvpokeCommit,
    pvpokeDate: baseline.pvpokeDate,
  };
}
