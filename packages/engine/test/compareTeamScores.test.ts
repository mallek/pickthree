import { describe, expect, it } from 'vitest';
import { compareTeamScores } from '../src/recommend.js';

describe('compareTeamScores', () => {
  it('ranks the stronger team first even when it scores lower overall', () => {
    const strong = { battle: 88, total: 70 };
    const cheapWeak = { battle: 80, total: 85 };
    expect([cheapWeak, strong].sort(compareTeamScores)).toEqual([strong, cheapWeak]);
  });

  it('breaks a battle tie with the total, higher first', () => {
    const cheaper = { battle: 85, total: 82 };
    const dearer = { battle: 85, total: 74 };
    expect([dearer, cheaper].sort(compareTeamScores)).toEqual([cheaper, dearer]);
  });

  it('treats identical scores as equal', () => {
    expect(compareTeamScores({ battle: 80, total: 80 }, { battle: 80, total: 80 })).toBe(0);
  });
});
