/**
 * A team's battle strength read out of the matchup matrix alone: coverage, consistency and
 * safety, the same three factors behind scoreTeam's `battle` field, with cost and accessibility
 * dropped because there is no collection here. Every read is view.rating(row, opponent,
 * scenario), so this runs in a browser with no simulator. That is what ADR 002 built the matrix
 * for.
 *
 * It is a proxy for a win rate, not a calibrated one. Coverage is the weighted share of the meta
 * that at least one member beats, which is not the same as winning a 3v3 match. expectedWinRate
 * below is the single place that proxy is turned into a number on the 0 to 1 scale, so it can be
 * fitted against real results later. A projection is never printed as a win rate.
 *
 * Three deliberate differences from scoreTeam, all forced by the matrix's three scenarios:
 *  - The switch is scored at 1-1 like the lead. simulateSlot gives it four turns of starting
 *    energy; the matrix has no such cell, so the projection understates a switch that lives off
 *    that advantage.
 *  - "The top of the meta" is the ten heaviest opponents by the supplied weights, not the first
 *    ten matrix columns. Once measured play says what the top is, that is the top.
 *  - Coverage can only speak for opponents that have a column. weightCovered says how much of
 *    the supplied weight that is, and the screens print it rather than letting a projection
 *    quietly claim a meta it never saw.
 */
import type { MatrixView } from '../search/matrixView.js';
import { battleScore } from './score.js';

/** A matrix rating above this is a win, the same cut the rest of the engine uses. */
export const WIN = 500;
/** Below this the switch is not merely losing, it is being removed from the game. */
export const HARD_LOSS = 300;
/** How many of the heaviest opponents count as "the top of the meta". */
export const TOP_META = 10;

export interface StrengthContext {
  view: MatrixView;
  /** Scenario indexes, resolved once. */
  s11: number;
  s00: number;
  s22: number;
  /** Weight per opponent column, aligned with view.opponents. All 1 when unweighted. */
  weights: number[];
  /** Column indexes of the TOP_META heaviest opponents. */
  top: number[];
  /** Share of the supplied weights the columns account for, 0..1. 1 when unweighted. */
  weightCovered: number;
}

export interface Strength {
  /** battleScore(coverage, consistency, safety), 0 to 100. */
  value: number;
  coverage: number;
  consistency: number;
  safety: number;
  /** Matrix rows in the order scored: lead, switch, closer. */
  order: [number, number, number];
}

/** Resolve the scenarios and the weights once, then score thousands of trios against it. */
export function strengthContext(
  view: MatrixView,
  weights?: ReadonlyMap<string, number>,
): StrengthContext {
  const n = view.opponents.length;
  const w = new Array<number>(n).fill(1);
  let covered = 1;
  if (weights) {
    let total = 0;
    for (const value of weights.values()) {
      total += value;
    }
    let inColumns = 0;
    view.opponents.forEach((id, i) => {
      const value = weights.get(id) ?? 0;
      w[i] = value;
      inColumns += value;
    });
    covered = total === 0 ? 0 : inColumns / total;
  }
  const top = w
    .map((value, i) => ({ value, i }))
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .slice(0, Math.min(TOP_META, n))
    .map((x) => x.i);
  return {
    view,
    s11: view.scenarioIndex([1, 1]),
    s00: view.scenarioIndex([0, 0]),
    s22: view.scenarioIndex([2, 2]),
    weights: w,
    top,
    weightCovered: covered,
  };
}

export function strengthOf(
  ctx: StrengthContext,
  rows: readonly [number, number, number],
): Strength {
  const { view, s11, s00, s22 } = ctx;
  const n = view.opponents.length;
  // The switch is scored at 1-1 like the lead: see the module doc's first deviation from
  // scoreTeam. The matrix has no scenario matching simulateSlot's starting energy for a switch.
  const scenarios: [number, number, number] = [s11, s11, s00];
  const covered = new Array<boolean>(n).fill(false);
  let wins = 0;
  let held = 0;
  for (let slot = 0; slot < 3; slot++) {
    const row = rows[slot] as number;
    const scenario = scenarios[slot] as number;
    for (let o = 0; o < n; o++) {
      if (view.rating(row, o, scenario) > WIN) {
        covered[o] = true;
        wins += 1;
        if (view.rating(row, o, s00) > WIN && view.rating(row, o, s22) > WIN) {
          held += 1;
        }
      }
    }
  }

  let got = 0;
  let total = 0;
  for (let o = 0; o < n; o++) {
    const weight = ctx.weights[o] as number;
    total += weight;
    if (covered[o]) {
      got += weight;
    }
  }
  const coverage = total === 0 ? 0 : (got / total) * 100;
  const consistency = wins === 0 ? 0 : (held / wins) * 100;

  let hardLosses = 0;
  for (let o = 0; o < n; o++) {
    if (view.rating(rows[1], o, s11) < HARD_LOSS) {
      hardLosses += 1;
    }
  }
  let topUncovered = 0;
  for (const o of ctx.top) {
    if (!covered[o]) {
      topUncovered += 1;
    }
  }
  const safety = Math.max(0, 100 - hardLosses * 20 - topUncovered * 10);

  return {
    value: round1(battleScore(coverage, consistency, safety)),
    coverage: round1(coverage),
    consistency: round1(consistency),
    safety: round1(safety),
    order: [rows[0], rows[1], rows[2]],
  };
}

const ORDERINGS: readonly [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** The best of the six orderings. What every caller should use: a team is played in its best
 *  order, and a projection that assumed the worst one would be projecting the wrong team. */
export function bestStrength(
  ctx: StrengthContext,
  rows: readonly [number, number, number],
): Strength {
  let best: Strength | null = null;
  for (const order of ORDERINGS) {
    const s = strengthOf(ctx, [
      rows[order[0]] as number,
      rows[order[1]] as number,
      rows[order[2]] as number,
    ]);
    if (!best || s.value > best.value) {
      best = s;
    }
  }
  return best as Strength;
}

/** Slope of the one calibration from battle score to an expected win rate, per point. */
export const PROJECTION_SLOPE = 0.006;

/**
 * Battle score at which a projection reaches an even match. A perfect team scores 100 on all
 * three factors, so nothing unplayed ever projects above even: Go Battle League matches on
 * rating, and no team sustains a winning rate against opposition that keeps pace with it.
 * Only a measured record can show better than even.
 */
export const PROJECTION_ANCHOR = 100;

/**
 * A battle score read as an expected win rate. THE one place the projection is calibrated, so it
 * can be fitted against real results later without hunting through the code. It is a proxy, not a
 * measurement. Never print the result as a win rate.
 */
export function expectedWinRate(strength: number, slope: number = PROJECTION_SLOPE): number {
  return Math.max(0, Math.min(1, 0.5 + (strength - PROJECTION_ANCHOR) * slope));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
