import { describe, expect, it } from 'vitest';
import {
  TREND_MIN,
  confidence,
  margin,
  marginSentence,
  trendLabel,
  trendPoints,
  winRate,
} from '../src/stats.js';

describe('confidence', () => {
  it('splits at 30 and 300', () => {
    expect(confidence(0)).toBe('few');
    expect(confidence(29)).toBe('few');
    expect(confidence(30)).toBe('some');
    expect(confidence(299)).toBe('some');
    expect(confidence(300)).toBe('many');
  });
});

describe('margin', () => {
  it('shrinks as the sample grows', () => {
    expect(margin(100)).toBe(10);
    expect(margin(1225)).toBe(3);
    expect(margin(10000)).toBe(1);
  });

  it('never claims certainty and never runs off the scale', () => {
    expect(margin(0)).toBe(50);
    expect(margin(1)).toBe(50);
    expect(margin(1_000_000)).toBe(1);
  });
});

describe('winRate', () => {
  it('is wins over decided battles', () => {
    expect(winRate(3, 1)).toBe(0.75);
    expect(winRate(0, 0)).toBeNull();
  });
});

describe('marginSentence', () => {
  it('states the range plainly for a big sample', () => {
    expect(marginSentence(0.54, 1240)).toBe('Real win rate likely within +/-3 pts');
  });

  it('warns harder when the sample is small, and stays inside 0 to 100', () => {
    expect(marginSentence(0.62, 21)).toBe('Only 21 battles, could easily be 40% or 84%');
    expect(marginSentence(0.95, 4)).toBe('Only 4 battles, could easily be 45% or 100%');
  });

  it('gives a middling sample a range without the scolding', () => {
    expect(marginSentence(0.52, 100)).toBe('Could be anywhere from 42% to 62%');
  });

  it('changes shape at the exact boundaries between tiers', () => {
    // At n = 30 the scolding "Only N battles" wording stops and the plain range starts.
    expect(marginSentence(0.5, 30)).toBe('Could be anywhere from 32% to 68%');
    // At n = 300 the range gives way to a single margin, matching the "many" confidence tier.
    expect(marginSentence(0.5, 300)).toBe('Real win rate likely within +/-6 pts');
  });
});

describe('trendPoints', () => {
  it('refuses a trend until both windows clear the bar', () => {
    expect(trendPoints(50, TREND_MIN - 1, 40, 1000)).toBeNull();
    expect(trendPoints(50, 1000, 40, TREND_MIN - 1)).toBeNull();
  });

  it('lets a big enough move through right at the count floor', () => {
    // 50% to 10% at exactly TREND_MIN battles on both sides: the count gate is satisfied, and
    // the move is far too large to be the two windows' own noise.
    expect(trendPoints(100, TREND_MIN, 20, TREND_MIN)).toBeCloseTo(40, 5);
  });

  it('is the change in share, in percentage points', () => {
    expect(trendPoints(200, 1000, 150, 1000)).toBeCloseTo(5, 5);
    expect(trendPoints(100, 1000, 150, 1000)).toBeCloseTo(-5, 5);
  });

  it('hides a move too small to clear its own noise, even with enough battles to count', () => {
    // 2% to 5% at 200 battles a side: the count gate passes, but the 95% band on that
    // difference is wider than the difference itself, so this is not a trend, it is noise.
    expect(trendPoints(10, 200, 4, 200)).toBeNull();
  });

  it('shows that same 2% to 5% move once there is enough data for it to clear its own noise', () => {
    expect(trendPoints(250, 5000, 100, 5000)).toBeCloseTo(3, 1);
  });
});

describe('trendLabel', () => {
  it('reads as a signed number, in ASCII, with a word for no change', () => {
    expect(trendLabel(3.34)).toBe('+3.3');
    expect(trendLabel(-1.21)).toBe('-1.2');
    expect(trendLabel(0.04)).toBe('even');
  });
});
