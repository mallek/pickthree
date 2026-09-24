import { describe, expect, it } from 'vitest';
import {
  communityWeights,
  measuredSay,
  ranksOf,
  tournamentSay,
  type CommunitySummary,
} from '../../src/meta/index.js';

const GROUP = ['azumarill', 'medicham', 'registeel', 'lanturn'];
const ORDER = ['azumarill', 'medicham', 'registeel', 'lanturn'];

function summary(over: Partial<CommunitySummary> = {}): CommunitySummary {
  return { battles: 0, devices: 0, species: [], tournament: null, ...over };
}

function sum(m: Map<string, number>): number {
  let t = 0;
  for (const v of m.values()) {
    t += v;
  }
  return t;
}

describe('communityWeights', () => {
  it('is the normalised PvPoke prior when nothing was measured', () => {
    const w = communityWeights(summary(), { source: 'all', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.say).toBe(0);
    expect(w.tournamentSay).toBe(0);
    expect(w.ids).toEqual(GROUP);
    expect(sum(w.weights)).toBeCloseTo(1, 10);
    expect(w.weights.get('azumarill')! / w.weights.get('medicham')!).toBeCloseTo(Math.sqrt(2), 10);
  });

  it('prior ignores measured data entirely', () => {
    const s = summary({ battles: 900, devices: 20, species: [{ speciesId: 'lanturn', sightings: 800 }] });
    const w = communityWeights(s, { source: 'prior', group: GROUP, rankOrder: ORDER, banned: new Set() });
    const p = communityWeights(summary(), { source: 'prior', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.say).toBe(0);
    for (const id of GROUP) {
      expect(w.weights.get(id)).toBeCloseTo(p.weights.get(id)!, 12);
    }
  });

  it('ladder blends on the smaller of the battle and device curves', () => {
    const s = summary({ battles: 300, devices: 5, species: [{ speciesId: 'lanturn', sightings: 300 }] });
    const w = communityWeights(s, { source: 'ladder', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.say).toBeCloseTo(0.5, 10);
    expect(w.say).toBe(measuredSay(300, 5));
    // Lanturn holds all the measured share, so it gains half the say on top of half its prior.
    expect(w.weights.get('lanturn')!).toBeGreaterThan(w.weights.get('azumarill')!);
  });

  it('adds a measured species PvPoke does not list, with prior 0', () => {
    const s = summary({ battles: 300, devices: 5, species: [{ speciesId: 'newcomer', sightings: 30 }] });
    const w = communityWeights(s, { source: 'ladder', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.ids).toContain('newcomer');
    expect(w.weights.get('newcomer')).toBeCloseTo(0.5, 10);
  });

  it('tournament picks blend on their own curve, and a banned species keeps the plain prior', () => {
    const s = summary({
      tournament: {
        events: 2,
        battles: 100,
        species: [{ speciesId: 'medicham', picks: 50 }],
      },
    });
    const opts = { source: 'tournament' as const, group: GROUP, rankOrder: ORDER };
    const open = communityWeights(s, { ...opts, banned: new Set() });
    const ban = communityWeights(s, { ...opts, banned: new Set(['azumarill']) });
    const prior = communityWeights(summary(), { ...opts, source: 'prior', banned: new Set() });
    expect(open.tournamentSay).toBe(tournamentSay(100, 2));
    expect(open.say).toBe(0);
    expect(ban.weights.get('azumarill')).toBeCloseTo(prior.weights.get('azumarill')!, 12);
    expect(open.weights.get('azumarill')!).toBeLessThan(prior.weights.get('azumarill')!);
  });

  it('all runs the tournament blend first and the ladder blend over it', () => {
    const s = summary({
      battles: 300,
      devices: 5,
      species: [{ speciesId: 'lanturn', sightings: 300 }],
      tournament: { events: 2, battles: 100, species: [{ speciesId: 'medicham', picks: 50 }] },
    });
    const w = communityWeights(s, { source: 'all', group: GROUP, rankOrder: ORDER, banned: new Set() });
    expect(w.say).toBeCloseTo(0.5, 10);
    expect(w.tournamentSay).toBeCloseTo(0.5, 10);
    expect(sum(w.weights)).toBeCloseTo(1, 10);
  });
});

describe('ranksOf', () => {
  it('keeps the first appearance of each species', () => {
    expect(ranksOf([{ speciesId: 'a' }, { speciesId: 'b' }, { speciesId: 'a' }])).toEqual(['a', 'b']);
  });
});
