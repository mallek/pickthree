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
import type { Legal } from './legal.js';
import type { SourceKey } from './route.js';
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

/** Tournament battles at which tournament play earns half the say of its own term. 100 because
 *  a tournament battle carries two full teams and a verified result, roughly three ladder
 *  records of information. A half-say point, not a gate. */
export const HALF_SAY_TOURNAMENT_BATTLES = 100;
/** Events at which the same term earns half the say. 2 because one event is one local meta, the
 *  same reason one phone is held to a sixth of the say. Also a half-say point, not a gate. */
export const HALF_SAY_EVENTS = 2;

/** How much of the say tournament play has earned: the smaller of the two curves, 0 to 1. */
export function tournamentSay(battles: number, events: number): number {
  const byBattles = battles <= 0 ? 0 : battles / (battles + HALF_SAY_TOURNAMENT_BATTLES);
  const byEvents = events <= 0 ? 0 : events / (events + HALF_SAY_EVENTS);
  return Math.min(byBattles, byEvents);
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
  // Each view is the same two blends with one or both terms switched off, never a different
  // formula: `prior` is both off, `ladder` is today's, `tournament` is the first alone, `all`
  // is the sequence. One code path, so the four can never disagree about a row.
  const usesLadder = opts.source === 'all' || opts.source === 'ladder';
  const usesTournament = opts.source === 'all' || opts.source === 'tournament';
  const say = usesLadder ? measuredSay(meta.battles, meta.devices) : 0;
  const aT = usesTournament ? tournamentSay(tBattles, events) : 0;

  const rankOf = new Map<string, number>();
  ranks.forEach((id, i) => {
    if (!rankOf.has(id)) {
      rankOf.set(id, i + 1);
    }
  });

  const seen = new Map<string, SpeciesStats>(meta.species.map((s) => [s.speciesId, s]));
  const picked = new Map(
    (block?.species ?? []).map((s) => [s.speciesId, s] as const),
  );
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
  // Everything picked at a blended event, for the same reason as a faced species: it is part of
  // what this league's list is about, whether or not PvPoke ranks it.
  for (const s of block?.species ?? []) {
    if (s.picks >= LISTED_MIN) {
      add(s.speciesId);
    }
  }

  const blendInput = {
    species: ids,
    ranks: new Map(ids.map((id) => [id, rankOf.get(id) ?? null])),
  };
  const options = { minBattles: 0, halfLife: HALF_SAY_BATTLES, unrankedPrior: 0 };
  // PvPoke's prior alone: `share: 0` makes blendWeights return (1 - 0) * prior, which is the
  // normalised prior and nothing else. Asked for explicitly rather than recomputed here, so the
  // normalisation can never drift from the one the blend below uses.
  const prior = blendWeights(
    { ...blendInput, sightings: new Map(), battles: 0 },
    { ...options, share: 0 },
  );
  const afterTournament = blendWeights(
    {
      ...blendInput,
      sightings: new Map(ids.map((id) => [id, picked.get(id)?.picks ?? 0])),
      battles: tBattles,
    },
    { ...options, halfLife: HALF_SAY_TOURNAMENT_BATTLES, share: aT },
  );
  const banned = opts.legal?.banned ?? new Set<string>();
  // A banned species has no tournament share, not a zero one: zero says nobody picked it, which
  // is false; the plain prior says it was not observable in this population.
  const p1 = new Map(
    ids.map((id) => [
      id,
      (banned.has(id) ? prior.get(id) : afterTournament.get(id)) ?? 0,
    ]),
  );

  // The second blend, written out rather than passed back through blendWeights, because its
  // prior term is p1 and blendWeights only knows how to build a prior from PvPoke ranks. The
  // arithmetic is blendWeights' own last line, and with aT = 0 (so p1 = prior) it reduces to
  // exactly the call this function used to make.
  let ladderTotal = 0;
  for (const id of ids) {
    ladderTotal += seen.get(id)?.sightings ?? 0;
  }
  const weights = new Map(
    ids.map((id) => {
      const share = ladderTotal === 0 ? 0 : (seen.get(id)?.sightings ?? 0) / ladderTotal;
      return [id, (1 - say) * (p1.get(id) ?? 0) + say * share];
    }),
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
