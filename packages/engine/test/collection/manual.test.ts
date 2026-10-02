import { describe, expect, it } from 'vitest';
import { levelForCp, manualSpecimen } from '../../src/collection/manual.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { cpFor } from '../../src/math/cp.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';
import { syntheticIndex } from './synthetic.js';

describe.skipIf(!haveStaticData())('manual specimens', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const swampert = index.mustSpecies('swampert');

  it('finds the level from CP and IVs', () => {
    const ivs = { atk: 0, def: 14, sta: 13 };
    const cp = cpFor(swampert.baseStats, ivs, 27.5);
    const r = levelForCp(swampert.baseStats, ivs, cp);
    expect(r).toEqual({ level: 27.5, cp, exact: true });
  });

  it('falls back to the nearest CP when none matches', () => {
    const ivs = { atk: 15, def: 15, sta: 15 };
    const r = levelForCp(swampert.baseStats, ivs, 1);
    expect(r.exact).toBe(false);
    expect(r.level).toBe(1);
  });

  it('builds a specimen the rest of the engine accepts', () => {
    const ivs = { atk: 0, def: 14, sta: 13 };
    const cp = cpFor(swampert.baseStats, ivs, 27.5);
    const r = manualSpecimen({ speciesId: 'swampert', ivs, cp, lucky: true }, index);
    expect(r.exactCp).toBe(true);
    expect(r.level).toBe(27.5);
    expect(r.specimen.source).toBe('manual');
    expect(r.specimen.shadow).toBe(false);
    expect(r.specimen.lucky).toBe(true);
    expect(r.specimen.level).toEqual({ min: 27.5, max: 27.5 });
    expect(r.specimen.id).toMatch(/^[0-9a-f]{8}$/);
    const shadow = manualSpecimen({ speciesId: 'swampert_shadow', ivs, cp }, index);
    expect(shadow.specimen.shadow).toBe(true);
    expect(shadow.specimen.id).not.toBe(r.specimen.id);
  });

  it('rejects bad input plainly', () => {
    expect(() =>
      manualSpecimen({ speciesId: 'swampert', ivs: { atk: 16, def: 0, sta: 0 }, cp: 500 }, index),
    ).toThrow(/Attack IV/);
    expect(() =>
      manualSpecimen({ speciesId: 'nope', ivs: { atk: 1, def: 0, sta: 0 }, cp: 500 }, index),
    ).toThrow(/Pick a Pokémon/);
  });
});

/** Edit sends more than the appraisal screen: moves, Purified, and the level an evolution keeps. */
describe('manual entry: moves, Purified and a level to keep', () => {
  const index = syntheticIndex();
  const eevee = index.mustSpecies('eevee');
  const ivs = { atk: 1, def: 15, sta: 13 };
  const cpAt = (level: number): number => cpFor(eevee.baseStats, ivs, level);

  it('keeps the moves and Purified it is given', () => {
    const r = manualSpecimen(
      {
        speciesId: 'eevee',
        ivs,
        cp: cpAt(20),
        purified: true,
        currentMoves: { fast: 'TACKLE', charged: ['SWIFT', 'RETURN'] },
      },
      index,
    );
    expect(r.specimen.purified).toBe(true);
    expect(r.specimen.currentMoves).toEqual({ fast: 'TACKLE', charged: ['SWIFT', 'RETURN'] });
  });

  it('with no moves given, the moves are not entered', () => {
    const r = manualSpecimen({ speciesId: 'eevee', ivs, cp: cpAt(20) }, index);
    expect(r.specimen.currentMoves).toEqual({ fast: null, charged: [] });
    expect(r.specimen.purified).toBe(false);
  });

  it('a Shadow is never Purified', () => {
    const shadow = index.mustSpecies('mudkip_shadow');
    const cp = cpFor(shadow.baseStats, ivs, 20);
    const r = manualSpecimen({ speciesId: 'mudkip_shadow', ivs, cp, purified: true }, index);
    expect(r.specimen.purified).toBe(false);
  });

  it('rejects a move the species cannot learn, and a third charged move', () => {
    const cp = cpAt(20);
    expect(() =>
      manualSpecimen(
        { speciesId: 'eevee', ivs, cp, currentMoves: { fast: 'SURF', charged: [] } },
        index,
      ),
    ).toThrow(/cannot learn/);
    expect(() =>
      manualSpecimen(
        {
          speciesId: 'eevee',
          ivs,
          cp,
          currentMoves: { fast: 'TACKLE', charged: ['SWIFT', 'BODY_SLAM', 'RETURN'] },
        },
        index,
      ),
    ).toThrow(/at most two/);
  });

  it('keeps a hinted level that gives exactly the CP', () => {
    const r = manualSpecimen({ speciesId: 'eevee', ivs, cp: cpAt(20), level: 20 }, index);
    expect(r.level).toBe(20);
    expect(r.exactCp).toBe(true);
    expect(r.matchedCp).toBe(cpAt(20));
  });

  it('ignores a hinted level that does not give the CP', () => {
    const r = manualSpecimen({ speciesId: 'eevee', ivs, cp: cpAt(20), level: 31 }, index);
    expect(r.level).toBe(20);
  });
});
