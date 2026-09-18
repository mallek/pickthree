/**
 * The one decision this site turns on: is there enough measured play to lead with, or is PvPoke's
 * curated list still the honest thing to put first? Both lists always come back. The measured one
 * is never suppressed for being small, and the PvPoke one is never described as measured.
 */
import type { MetaSummaryV1, SpeciesStats } from './api.js';
import type { Baseline, BaselineSpecies } from './baseline.js';
import { type Confidence, confidence, trendPoints, winRate } from './stats.js';

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
 * on as few as 2 sightings. That is why a row's own confidence and winRate are computed from its
 * own decided battles below, never inferred from the fact that it made the measured list at all.
 */
export const RANKED_SHARE = 0.005;
/**
 * When not measured, a species is listed once it has been faced this many times. One sighting is
 * one report and proves nothing about repetition; two is the first point worth printing at all.
 */
export const SMALL_MIN = 2;
/**
 * A win rate is withheld below this many of the row's own decided battles: 1-1 is not "50%".
 * Deliberately the same number as stats.js's 'few'/'some' split, so a row that is allowed to show
 * a rate is, by definition, never at 'few' confidence. Keep the two together if either changes.
 */
export const WIN_RATE_MIN = 30;
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
  winRate: number | null;
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
      // A rate needs enough decided battles to mean anything. Below that the row shows its raw
      // win-loss count and no percentage: 1-1 is not "50%".
      winRate: decided >= WIN_RATE_MIN ? winRate(s.wins, s.losses) : null,
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
    barPct: bestScore && bestScore > 0 && s.score !== null ? Math.round((s.score / bestScore) * 100) : 0,
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
