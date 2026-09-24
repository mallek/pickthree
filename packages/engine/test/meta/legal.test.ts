import { describe, expect, it } from 'vitest';
import { legalFor, OPEN_EQUIVALENT_CUP } from '../../src/meta/index.js';

describe('legalFor', () => {
  it('names the open-equivalent cup only for Great League', () => {
    expect(OPEN_EQUIVALENT_CUP).toEqual({ great: 'championshipseries' });
  });

  it('lists every ranked species the cup drops, in the league ranking order', () => {
    const leagueRanks = [
      { speciesId: 'azumarill' },
      { speciesId: 'mimikyu' },
      { speciesId: 'venusaur_mega' },
      { speciesId: 'medicham' },
    ];
    const cupRanks = [{ speciesId: 'azumarill' }, { speciesId: 'medicham' }];
    expect(legalFor('great', leagueRanks, cupRanks)).toEqual({
      cup: 'championshipseries',
      banned: ['mimikyu', 'venusaur_mega'],
    });
  });

  it('gives a league with no Play! format an empty list and no cup', () => {
    expect(legalFor('ultra', [{ speciesId: 'giratina_altered' }], null)).toEqual({
      cup: null,
      banned: [],
    });
  });

  it('de-duplicates a league ranking that lists a species twice', () => {
    const leagueRanks = [
      { speciesId: 'mimikyu' },
      { speciesId: 'mimikyu' },
      { speciesId: 'azumarill' },
    ];
    expect(legalFor('great', leagueRanks, [{ speciesId: 'azumarill' }]).banned).toEqual([
      'mimikyu',
    ]);
  });
});
