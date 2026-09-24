import { describe, expect, it } from 'vitest';
import type { RankingEntry } from '../../src/gamedata/types.js';
import { communityProfile } from '../../src/yourmeta/community.js';
import { facingLine } from '../../src/yourmeta/profile.js';

const COLUMNS = ['azumarill', 'medicham', 'medicham', 'registeel'];
const GROUP = ['azumarill', 'medicham', 'registeel'];
const ORDER = ['azumarill', 'medicham', 'registeel', 'lanturn'];
const RANKINGS = ORDER.map((speciesId) => ({
  speciesId,
  moveset: ['F', 'C1', 'C2'],
})) as unknown as RankingEntry[];
const WINDOW = {
  since: '2026-09-02T00:00:00.000Z',
  until: '2026-09-24T00:10:00.000Z',
  label: 'This meta',
};

function input(over: Partial<Parameters<typeof communityProfile>[0]> = {}) {
  return {
    summary: { battles: 0, devices: 0, species: [], tournament: null },
    source: 'ladder' as const,
    window: WINDOW,
    opponents: COLUMNS,
    group: GROUP,
    rankOrder: ORDER,
    banned: new Set<string>(),
    rankings: RANKINGS,
    ...over,
  };
}

describe('communityProfile', () => {
  it('gives every column its species weight, duplicates included', () => {
    const p = communityProfile(input());
    expect(p.engaged).toBe(true);
    expect(p.reason).toBe('community');
    expect(p.source).toBe('ladder');
    expect([...p.weights.keys()]).toEqual(['azumarill', 'medicham', 'registeel']);
    expect(p.weights.get('medicham')).toBeGreaterThan(0);
    expect(p.outsiders).toEqual([]);
  });

  it('keeps PvPoke order with no data', () => {
    const p = communityProfile(input());
    expect(p.weights.get('azumarill')!).toBeGreaterThan(p.weights.get('medicham')!);
    expect(p.weights.get('medicham')!).toBeGreaterThan(p.weights.get('registeel')!);
  });

  it('adds no outsiders while the flag is off, and up to the cap when on', () => {
    const summary = {
      battles: 900,
      devices: 20,
      species: [{ speciesId: 'lanturn', sightings: 400 }],
      tournament: null,
    };
    expect(communityProfile(input({ summary })).outsiders).toEqual([]);
    const on = communityProfile(input({ summary }), { communityOutsiders: true });
    expect(on.outsiders.map((o) => o.speciesId)).toEqual(['lanturn']);
    expect(on.outsiderWeights.get('lanturn')).toBeGreaterThan(0);
  });

  it('survives a summary whose whole measured share sits outside the matrix', () => {
    const summary = {
      battles: 100_000,
      devices: 10_000,
      species: [{ speciesId: 'lanturn', sightings: 100_000 }],
      tournament: null,
    };
    const p = communityProfile(input({ summary }));
    for (const w of p.weights.values()) {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it('writes a sentence naming the source, the numbers and the window', () => {
    const summary = {
      battles: 1240,
      devices: 18,
      species: [{ speciesId: 'medicham', sightings: 900 }],
      tournament: null,
    };
    expect(facingLine(communityProfile(input({ summary })))).toMatch(
      /^Weighted by GBL play: 1,240 battles from 18 devices, This meta \(since Sep 2\), \d+% measured$/,
    );
    const t = communityProfile(
      input({
        source: 'tournament',
        window: { ...WINDOW, label: '30 days' },
        summary: {
          battles: 0,
          devices: 0,
          species: [],
          tournament: { events: 3, battles: 212, species: [] },
        },
      }),
    );
    expect(facingLine(t)).toMatch(
      /^Weighted by tournaments: 3 events, 212 battles, 30 days, \d+% measured$/,
    );
  });
});
