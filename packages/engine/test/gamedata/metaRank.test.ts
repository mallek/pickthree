import { describe, expect, it } from 'vitest';
import { metaRankSentence, metaRankTags, metaRanks } from '../../src/gamedata/metaRank.js';
import { loadStaticData } from '../fixtures.js';

const data = loadStaticData();
const ranks = metaRanks(data.rankings);

describe('meta ranks', () => {
  it('numbers the overall ranking from 1 in file order', () => {
    const first = data.rankings.overall[0]!;
    expect(ranks.get(first.speciesId)?.overall).toBe(1);
    expect(ranks.get(first.speciesId)?.score).toBe(first.score);
    expect(ranks.size).toBe(new Set(data.rankings.overall.map((r) => r.speciesId)).size);
  });

  it('only reports a role when the role rank beats the overall rank', () => {
    for (const r of ranks.values()) {
      if (r.role) {
        expect(r.roleRank).not.toBeNull();
        expect(r.roleRank!).toBeLessThan(r.overall);
      } else {
        expect(r.roleRank).toBeNull();
      }
    }
  });

  it('picks the best role rank', () => {
    const [top] = data.rankings.closers;
    const r = ranks.get(top!.speciesId)!;
    if (r.overall > 1) {
      expect(r.roleRank).toBe(1);
    }
  });

  it('tags inside the cutoff and stays quiet outside it', () => {
    expect(metaRankTags({ overall: 18, score: 90, role: 'closer', roleRank: 5 })).toEqual([
      '#18 overall',
      '#5 closer',
    ]);
    expect(metaRankTags({ overall: 60, score: 80, role: 'lead', roleRank: 20 })).toEqual([
      '#20 lead',
    ]);
    expect(metaRankTags({ overall: 120, score: 70, role: null, roleRank: null })).toEqual([]);
    expect(metaRankTags(undefined)).toEqual([]);
  });

  it('writes a verdict sentence', () => {
    expect(
      metaRankSentence('Swampert', { overall: 6, score: 95, role: 'closer', roleRank: 3 }),
    ).toBe('Swampert is #6 overall and #3 closer in the current meta.');
    expect(
      metaRankSentence('Magikarp', { overall: 900, score: 10, role: null, roleRank: null }),
    ).toBeNull();
  });
});
