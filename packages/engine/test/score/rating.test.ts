import { describe, expect, it } from 'vitest';
import { battleScore, fitFor, fitWhy } from '../../src/score/score.js';

describe('team rating', () => {
  it('reads battle strength only', () => {
    expect(battleScore(100, 100, 100)).toBe(100);
    expect(battleScore(80, 40, 60)).toBeCloseTo(65);
  });

  it('has a level that says a team is not competitive', () => {
    expect(fitFor(90)).toBe('Strong');
    expect(fitFor(72)).toBe('Strong');
    expect(fitFor(60)).toBe('Solid');
    expect(fitFor(50)).toBe('Situational');
    expect(fitFor(30)).toBe('Weak');
    // A cheap team of weak Pokémon: full coverage of nothing.
    expect(fitFor(battleScore(20, 50, 40))).toBe('Weak');
  });

  it('explains the label with the meta count', () => {
    expect(fitWhy('Strong', 45, 48, 0)).toBe(
      'Ready to run: beats 45 of 48 meta Pokémon and every one of the top ten has an answer.',
    );
    expect(fitWhy('Weak', 12, 48, 6)).toBe(
      'Not competitive: beats 12 of 48 meta Pokémon and 6 of the top ten have no answer. Swap at least one member.',
    );
    expect(fitWhy('Solid', 30, 48, 1)).toContain('1 of the top ten has no answer');
  });
});
