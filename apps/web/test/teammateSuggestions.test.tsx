import { describe, expect, it } from 'vitest';
import type { SuggestResult } from '@pickthree/engine';
import { teammateOffers } from '../src/components/TeammateSuggestions.tsx';

const fill = (slot: 1 | 2, id: string, line: string, standIn = true) => ({
  slot,
  pick: standIn ? { kind: 'species' as const, id } : { kind: 'specimen' as const, id: `s-${id}` },
  speciesId: id,
  standIn,
  covers: [],
  line,
});

const result = (fills: ReturnType<typeof fill>[][]): SuggestResult =>
  ({
    pinLine: null,
    suggestions: fills.map((f, i) => ({
      character: 'safest',
      label: `Offer ${i}`,
      fills: f,
      chase: false,
      coverage: 0,
      cost: 0,
      sightings: null,
    })),
    assumptions: {},
    stats: { standIns: 0, poolSize: 0, cores: 0, simulatedRows: 0 },
    ms: 0,
  }) as unknown as SuggestResult;

describe('teammateOffers', () => {
  it("lists each offer's first fill, framed against the pins alone", () => {
    const r = result([
      [fill(1, 'azumarill', 'Beats Clodsire.'), fill(2, 'clodsire', 'With Azumarill...')],
      [fill(1, 'lickitung', 'Beats Medicham.'), fill(2, 'azumarill', 'With Lickitung...')],
    ]);
    expect(teammateOffers(r, ['tinkaton']).map((o) => o.speciesId)).toEqual([
      'azumarill',
      'lickitung',
    ]);
  });

  it('shows a species once and never one already on the board', () => {
    const r = result([
      [fill(1, 'azumarill', 'a')],
      [fill(1, 'azumarill', 'b')],
      [fill(1, 'tinkaton', 'c')],
      [fill(1, 'clodsire', 'd')],
    ]);
    expect(teammateOffers(r, ['tinkaton']).map((o) => o.speciesId)).toEqual([
      'azumarill',
      'clodsire',
    ]);
  });

  it('marks your own Pokémon', () => {
    const r = result([[fill(1, 'azumarill', 'a', false)]]);
    expect(teammateOffers(r, [])[0]).toMatchObject({ standIn: false, pick: { kind: 'specimen' } });
  });
});
