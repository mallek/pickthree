import { describe, expect, it } from 'vitest';
import type { Build } from '../../src/builds/eligibility.js';
import {
  comparePicks,
  defaultPick,
  dropPins,
  fieldedBuilds,
  resolvePick,
} from '../../src/collection/pins.js';

/** A hand-made build: only what the pick order reads. */
function build(
  id: string,
  rank: number,
  over: { species?: string; stage?: number; at?: number; to?: number } = {},
): Build {
  const to = over.to ?? 30;
  return {
    specimenId: id,
    specimen: { id, level: { min: over.at ?? 10, max: over.at ?? 10 } },
    speciesId: over.species ?? 'umbreon',
    stageOffset: over.stage ?? 0,
    level: to,
    baseLevel: to,
    mega: null,
    ivRank: { rank, total: 4096 },
  } as unknown as Build;
}

describe('the default pick', () => {
  it('takes a built copy in the top 25% over a better unbuilt one', () => {
    const built = build('built', 900, { at: 30 });
    const better = build('better', 12);
    expect(defaultPick([better, built])?.specimenId).toBe('built');
  });

  it('a built copy outside the top 25% gets no head start', () => {
    const built = build('built', 3000, { at: 30 });
    const better = build('better', 12);
    expect(defaultPick([built, better])?.specimenId).toBe('better');
  });

  it('then IV rank, then fewer evolutions, then fewer levels, then id', () => {
    const order = [
      build('d', 50, { stage: 1 }),
      build('c', 50, { at: 10 }),
      build('b', 50, { at: 20 }),
      build('a2', 7),
      build('a1', 7),
    ].sort(comparePicks);
    expect(order.map((b) => b.specimenId)).toEqual(['a1', 'a2', 'b', 'c', 'd']);
  });

  it('is null with nothing to pick', () => {
    expect(defaultPick([])).toBeNull();
  });
});

describe('resolvePick', () => {
  const a = build('a', 5);
  const b = build('b', 80);

  it('no pin is the default pick', () => {
    expect(resolvePick([a, b], [a, b], undefined)?.specimenId).toBe('a');
  });

  it('an override wins over a better copy', () => {
    expect(resolvePick([a, b], [a, b], 'b')?.specimenId).toBe('b');
  });

  it('unpinned fields nothing', () => {
    expect(resolvePick([a, b], [a, b], null)).toBeNull();
  });

  it('a stale pin falls back to the default pick', () => {
    expect(resolvePick([a, b], [a, b], 'gone')?.specimenId).toBe('a');
  });

  it('a pinned copy that fails a filter sits the species out', () => {
    expect(resolvePick([a], [a, b], 'b')).toBeNull();
  });
});

describe('fieldedBuilds', () => {
  it('keeps one build per battling species, by its pin', () => {
    const eevee = (species: string): Build => build('eevee', 9, { species, stage: 1 });
    const builds = [
      build('u1', 300),
      eevee('umbreon'),
      eevee('vaporeon'),
      build('v1', 4, { species: 'vaporeon' }),
      build('s1', 1, { species: 'sylveon' }),
    ];
    const got = fieldedBuilds(builds, { vaporeon: 'eevee', sylveon: null });
    expect(got.map((b) => `${b.speciesId}:${b.specimenId}`).sort()).toEqual([
      'umbreon:eevee',
      'vaporeon:eevee',
    ]);
  });
});

describe('dropPins', () => {
  it('forgets pins that named a removed Pokemon and keeps the rest', () => {
    const pins = {
      great: { umbreon: 'x', medicham: null, azumarill: 'y' },
      ultra: { umbreon: 'x' },
    };
    expect(dropPins(pins, new Set(['x']))).toEqual({ great: { medicham: null, azumarill: 'y' } });
  });
});
