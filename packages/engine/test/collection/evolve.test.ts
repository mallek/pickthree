import { describe, expect, it } from 'vitest';
import { evolveSpecimen } from '../../src/collection/evolve.js';
import type { IVs } from '../../src/csv/parse.js';
import { cpFor, statsFor } from '../../src/math/cp.js';
import { mon, syntheticIndex } from './synthetic.js';

const index = syntheticIndex();
const NOW = '2026-10-01 12:00:00';

describe('evolveSpecimen', () => {
  const eevee = mon('e', 'eevee', {
    currentMoves: { fast: 'QUICK_ATTACK', charged: ['SWIFT'] },
    megaLevel4: true,
  });
  const ivs = eevee.ivs as IVs;
  const out = evolveSpecimen(eevee, 'umbreon', index, NOW);
  const base = index.mustSpecies('umbreon').baseStats;

  it('keeps the id, level and IVs', () => {
    expect(out).toMatchObject({ id: 'e', ivs, level: { min: 14, max: 14 } });
  });

  it('becomes the new species with its CP and HP at that level', () => {
    expect(out.speciesId).toBe('umbreon');
    expect(out.cp).toBe(cpFor(base, ivs, 14));
    expect(out.hp).toBe(statsFor(base, ivs, 14).hp);
  });

  it('forgets its moves and Mega marks, and remembers where it came from', () => {
    expect(out.currentMoves).toEqual({ fast: null, charged: [] });
    expect(out.megaLevel4).toBeUndefined();
    expect(out).toMatchObject({ evolvedFrom: 'eevee', editedAt: NOW, megaForm: null });
  });

  it('does not change the Pokemon it was given', () => {
    expect(eevee.speciesId).toBe('eevee');
    expect(eevee.megaLevel4).toBe(true);
  });

  it('refuses a species it cannot evolve into, itself included', () => {
    expect(() => evolveSpecimen(eevee, 'swampert', index, NOW)).toThrow(/cannot evolve/);
    expect(() => evolveSpecimen(eevee, 'eevee', index, NOW)).toThrow(/cannot evolve/);
    expect(() => evolveSpecimen(out, 'vaporeon', index, NOW)).toThrow(/cannot evolve/);
  });

  it('refuses a Pokemon with no IVs', () => {
    expect(() => evolveSpecimen(mon('x', 'eevee', { ivs: null }), 'umbreon', index, NOW)).toThrow(
      /IVs/,
    );
  });
});
