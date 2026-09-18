/**
 * What the site is allowed to claim about a number. Everything here exists so that a small sample
 * is shown with its smallness attached rather than dressed up as a fact.
 */

export type Confidence = 'few' | 'some' | 'many';

/** Below this many counted battles a number is little more than a guess. */
const SOME = 30;
/** At this many counted battles, and above, a number carries real weight. */
const MANY = 300;

/** few under 30 battles, some 30 to 299, many 300 and up. */
export function confidence(n: number): Confidence {
  if (n >= MANY) {
    return 'many';
  }
  return n >= SOME ? 'some' : 'few';
}

/**
 * Half the width of a rough 95% interval on a proportion near 50%, in percentage points:
 * 1.96 * sqrt(0.25 / n) * 100, which is close enough to 100 / sqrt(n) to say out loud.
 * Clamped to 50 so a sample of one does not promise a range wider than the scale, and to at
 * least 1 so the margin is never printed as zero, which would read as certainty.
 */
export function margin(n: number): number {
  if (n <= 0) {
    return 50;
  }
  return Math.min(50, Math.max(1, Math.round(100 / Math.sqrt(n))));
}

/** Wins over decided battles, or null when nothing was decided. */
export function winRate(wins: number, losses: number): number | null {
  const decided = wins + losses;
  return decided > 0 ? wins / decided : null;
}

/** A margin either side of a rate can push the printed range outside 0 to 100; clip it back. */
function clampPct(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * The sentence under a win rate, scaled to how much the number can be trusted. `n` must be the
 * row's own decided battles (wins + losses), not its sightings: passing sightings understates
 * how thin the rate actually is.
 */
export function marginSentence(rate: number, n: number): string {
  const m = margin(n);
  const low = clampPct(rate * 100 - m);
  const high = clampPct(rate * 100 + m);
  if (n >= MANY) {
    return `Real win rate likely within +/-${m} pts`;
  }
  if (n >= SOME) {
    return `Could be anywhere from ${low}% to ${high}%`;
  }
  return `Only ${n} battles, could easily be ${low}% or ${high}%`;
}

/**
 * Both windows need this many counted battles before any trend is shown. A trend is a
 * difference of two noisy numbers, so it needs more data than either number alone, not less.
 * The worker enforces the same floor (workers/counter/src/meta.ts); this is a second line of
 * defence, not the only one.
 */
export const TREND_MIN = 200;

/** Change in share in percentage points, or null when the data cannot carry a trend. */
export function trendPoints(
  sightings: number,
  battles: number,
  prevSightings: number,
  prevBattles: number,
): number | null {
  if (battles < TREND_MIN || prevBattles < TREND_MIN) {
    return null;
  }
  const p1 = sightings / battles;
  const p2 = prevSightings / prevBattles;
  // A difference of two shares carries the noise of both. Reporting one smaller than its own 95%
  // band would be reporting the noise, so below that we say there was no measurable change. The
  // count gate above is necessary but not sufficient: it only says each share is old enough to
  // trust on its own, not that the gap between them is real.
  const se = Math.sqrt((p1 * (1 - p1)) / battles + (p2 * (1 - p2)) / prevBattles);
  if (Math.abs(p1 - p2) < 1.96 * se) {
    return null;
  }
  return (p1 - p2) * 100;
}

/** Below a tenth of a point the movement is noise, so it is named rather than numbered. */
export function trendLabel(points: number): string {
  if (Math.abs(points) < 0.05) {
    return 'even';
  }
  return `${points > 0 ? '+' : '-'}${Math.abs(points).toFixed(1)}`;
}
