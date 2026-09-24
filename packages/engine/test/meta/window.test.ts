import { describe, expect, it } from 'vitest';
import {
  BUCKET_MS,
  epochFor,
  readEpochs,
  resolveWindow,
  type Epoch,
} from '../../src/meta/index.js';

const SEASONS = [{ start: '2026-09-08T13:00:00-07:00' }];

describe('resolveWindow (engine copy)', () => {
  it('buckets until up to ten minutes and spans 7 days', () => {
    const w = resolveWindow(
      '7',
      { league: 'great', seasons: SEASONS, epochs: [] },
      new Date('2026-09-20T12:03:00Z'),
    );
    expect(w.until).toBe('2026-09-20T12:10:00.000Z');
    expect(Date.parse(w.until) - Date.parse(w.since)).toBe(7 * 86_400_000);
    expect(BUCKET_MS).toBe(600_000);
  });

  it('starts This meta at the newest epoch for the league, else the season', () => {
    const epochs: Epoch[] = [{ at: '2026-09-15T00:00:00Z', note: 'rebalance', leagues: ['great'] }];
    const great = resolveWindow(
      'meta',
      { league: 'great', seasons: SEASONS, epochs },
      new Date('2026-09-20T12:03:00Z'),
    );
    const ultra = resolveWindow(
      'meta',
      { league: 'ultra', seasons: SEASONS, epochs },
      new Date('2026-09-20T12:03:00Z'),
    );
    expect(great.since).toBe('2026-09-15T00:00:00.000Z');
    expect(great.epoch).toBe(epochs[0]);
    expect(ultra.since).toBe(new Date('2026-09-08T13:00:00-07:00').toISOString());
  });

  it('epochFor ignores epochs in the future', () => {
    expect(
      epochFor(
        [{ at: '2026-10-01T00:00:00Z', note: 'x' }],
        'great',
        new Date('2026-09-20T00:00:00Z'),
      ),
    ).toBeNull();
  });

  it('readEpochs rejects an entry with no note', () => {
    expect(() => readEpochs([{ at: '2026-09-15T00:00:00Z' }])).toThrow(/needs a note/);
  });
});
