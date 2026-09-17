import { describe, expect, it } from 'vitest';
import {
  matchesQuery,
  parseQuery,
  starsOf,
  type Searchable,
  type SearchContext,
} from '../src/search.ts';

const charizard: Searchable = { name: 'Charizard', types: ['fire', 'flying'] };
const flareon: Searchable = { name: 'Flareon', types: ['fire'] };
const raichu: Searchable = { name: 'Raichu', types: ['electric'] };

const withMudShot: Searchable = {
  name: 'Swampert',
  types: ['water', 'ground'],
  moves: [{ name: 'Mud Shot', type: 'ground' }],
};
const noMoves: Searchable = { name: 'Swampert', types: ['water', 'ground'] };

function specimen(overrides: Partial<Searchable> = {}): Searchable {
  return { name: 'Azumarill', types: ['water', 'fairy'], ...overrides };
}

const marillCtx: SearchContext = { familyOf: () => 'azumarill' };

describe('parseQuery / matchesQuery', () => {
  it('matches a type word against a species with that type', () => {
    expect(matchesQuery(parseQuery('fire'), charizard)).toBe(true);
  });

  it('does not match a type word against a species without that type', () => {
    const azumarill: Searchable = { name: 'Azumarill', types: ['water', 'fairy'] };
    expect(matchesQuery(parseQuery('fire'), azumarill)).toBe(false);
  });

  it('narrows by name once a second word is added (whitespace means AND)', () => {
    expect(matchesQuery(parseQuery('fire ch'), charizard)).toBe(true);
    expect(matchesQuery(parseQuery('fire ch'), flareon)).toBe(false);
  });

  it('matches a type by prefix', () => {
    expect(matchesQuery(parseQuery('elec'), raichu)).toBe(true);
  });

  it('matches everything when the query is empty', () => {
    expect(matchesQuery(parseQuery(''), charizard)).toBe(true);
    expect(matchesQuery(parseQuery('   '), charizard)).toBe(true);
  });

  it('cp exact', () => {
    expect(matchesQuery(parseQuery('cp1500'), specimen({ cp: 1500 }))).toBe(true);
    expect(matchesQuery(parseQuery('cp1500'), specimen({ cp: 1499 }))).toBe(false);
  });

  it('cp at least (trailing dash)', () => {
    expect(matchesQuery(parseQuery('cp1400-'), specimen({ cp: 1400 }))).toBe(true);
    expect(matchesQuery(parseQuery('cp1400-'), specimen({ cp: 5000 }))).toBe(true);
    expect(matchesQuery(parseQuery('cp1400-'), specimen({ cp: 1399 }))).toBe(false);
  });

  it('cp at most (leading dash)', () => {
    expect(matchesQuery(parseQuery('cp-1500'), specimen({ cp: 1500 }))).toBe(true);
    expect(matchesQuery(parseQuery('cp-1500'), specimen({ cp: 0 }))).toBe(true);
    expect(matchesQuery(parseQuery('cp-1500'), specimen({ cp: 1501 }))).toBe(false);
  });

  it('cp range, boundaries inclusive', () => {
    expect(matchesQuery(parseQuery('cp1400-1500'), specimen({ cp: 1400 }))).toBe(true);
    expect(matchesQuery(parseQuery('cp1400-1500'), specimen({ cp: 1500 }))).toBe(true);
    expect(matchesQuery(parseQuery('cp1400-1500'), specimen({ cp: 1399 }))).toBe(false);
    expect(matchesQuery(parseQuery('cp1400-1500'), specimen({ cp: 1501 }))).toBe(false);
  });

  it('hp takes the same forms', () => {
    expect(matchesQuery(parseQuery('hp150-'), specimen({ hp: 150 }))).toBe(true);
    expect(matchesQuery(parseQuery('hp150-'), specimen({ hp: 149 }))).toBe(false);
  });

  it('4* needs an IV total of 45', () => {
    expect(matchesQuery(parseQuery('4*'), specimen({ ivTotal: 45 }))).toBe(true);
    expect(matchesQuery(parseQuery('4*'), specimen({ ivTotal: 44 }))).toBe(false);
  });

  it('3* matches 37 and 44 but not 36', () => {
    expect(matchesQuery(parseQuery('3*'), specimen({ ivTotal: 37 }))).toBe(true);
    expect(matchesQuery(parseQuery('3*'), specimen({ ivTotal: 44 }))).toBe(true);
    expect(matchesQuery(parseQuery('3*'), specimen({ ivTotal: 36 }))).toBe(false);
  });

  it('OR between star bands', () => {
    expect(matchesQuery(parseQuery('3*,4*'), specimen({ ivTotal: 40 }))).toBe(true);
    expect(matchesQuery(parseQuery('3*,4*'), specimen({ ivTotal: 45 }))).toBe(true);
    expect(matchesQuery(parseQuery('3*,4*'), specimen({ ivTotal: 20 }))).toBe(false);
  });

  it('shadow flag', () => {
    expect(matchesQuery(parseQuery('shadow'), specimen({ shadow: true }))).toBe(true);
    expect(matchesQuery(parseQuery('shadow'), specimen({ shadow: false }))).toBe(false);
  });

  it('negated flag', () => {
    expect(matchesQuery(parseQuery('!shadow'), specimen({ shadow: false }))).toBe(true);
    expect(matchesQuery(parseQuery('!shadow'), specimen({ shadow: true }))).toBe(false);
  });

  it('AND across an & group', () => {
    expect(matchesQuery(parseQuery('lucky&fire'), specimen({ lucky: true, types: ['fire'] }))).toBe(
      true,
    );
    expect(
      matchesQuery(parseQuery('lucky&fire'), specimen({ lucky: false, types: ['fire'] })),
    ).toBe(false);
    expect(
      matchesQuery(parseQuery('lucky&fire'), specimen({ lucky: true, types: ['water'] })),
    ).toBe(false);
  });

  it('@word matches a scanned move by type prefix', () => {
    expect(matchesQuery(parseQuery('@ground'), withMudShot)).toBe(true);
    expect(matchesQuery(parseQuery('@fire'), withMudShot)).toBe(false);
  });

  it('@word matches a scanned move by name substring', () => {
    expect(matchesQuery(parseQuery('@mud'), withMudShot)).toBe(true);
  });

  it('@word does not match a record with no moves', () => {
    expect(matchesQuery(parseQuery('@fire'), noMoves)).toBe(false);
  });

  it('@1/@2/@3 slot prefixes are stripped, not treated specially', () => {
    expect(matchesQuery(parseQuery('@1mud'), withMudShot)).toBe(true);
  });

  it('+word matches the family a context resolves it to', () => {
    const marill = specimen({ name: 'Marill', familyId: 'azumarill' });
    expect(matchesQuery(parseQuery('+azu'), marill, marillCtx)).toBe(true);
    const other = specimen({ name: 'Marill', familyId: 'something-else' });
    expect(matchesQuery(parseQuery('+azu'), other, marillCtx)).toBe(false);
  });

  it('+word never matches when the context cannot resolve a family', () => {
    const marill = specimen({ name: 'Marill', familyId: 'azumarill' });
    expect(matchesQuery(parseQuery('+azu'), marill)).toBe(false);
  });

  it('cp on a species record with no cp does not match', () => {
    expect(matchesQuery(parseQuery('cp1500'), charizard)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesQuery(parseQuery('FIRE'), charizard)).toBe(true);
    expect(matchesQuery(parseQuery('Char'), { name: 'CHARIZARD', types: ['fire'] })).toBe(true);
  });

  it('OR delimited by a comma with surrounding whitespace still ORs, not ANDs', () => {
    expect(matchesQuery(parseQuery('fire, water'), charizard)).toBe(true);
    expect(matchesQuery(parseQuery('fire, water'), { name: 'Squirtle', types: ['water'] })).toBe(
      true,
    );
    expect(matchesQuery(parseQuery('fire ,water'), charizard)).toBe(true);
    expect(matchesQuery(parseQuery('fire ,water'), { name: 'Squirtle', types: ['water'] })).toBe(
      true,
    );
    // Neither form ANDs "fire" against "water": a Grass type matches neither.
    expect(matchesQuery(parseQuery('fire, water'), { name: 'Oddish', types: ['grass'] })).toBe(
      false,
    );
  });

  it('a bare @ with nothing after it matches nothing', () => {
    expect(matchesQuery(parseQuery('@'), withMudShot)).toBe(false);
  });

  it('a bare + with nothing after it matches nothing', () => {
    const marill = specimen({ name: 'Marill', familyId: 'azumarill' });
    expect(matchesQuery(parseQuery('+'), marill, marillCtx)).toBe(false);
  });

  it('a merged staged/owned record: negation excludes on either name or either types', () => {
    const swinubAsMamoswine: Searchable = { name: 'Mamoswine Swinub', types: ['ice', 'ground'] };
    expect(matchesQuery(parseQuery('!mamoswine'), swinubAsMamoswine)).toBe(false);
    expect(matchesQuery(parseQuery('!ground'), swinubAsMamoswine)).toBe(false);
    expect(matchesQuery(parseQuery('swinub'), swinubAsMamoswine)).toBe(true);
    expect(matchesQuery(parseQuery('ground'), swinubAsMamoswine)).toBe(true);
  });
});

describe('starsOf', () => {
  it('bands the IV total the way the game does', () => {
    expect(starsOf(45)).toBe(4);
    expect(starsOf(44)).toBe(3);
    expect(starsOf(37)).toBe(3);
    expect(starsOf(36)).toBe(2);
    expect(starsOf(30)).toBe(2);
    expect(starsOf(29)).toBe(1);
    expect(starsOf(23)).toBe(1);
    expect(starsOf(22)).toBe(0);
    expect(starsOf(0)).toBe(0);
  });
});

describe('dex numbers', () => {
  const mewtwo = { name: 'Mewtwo', types: ['psychic'], dex: 150 };
  const noDex = { name: 'Mewtwo', types: ['psychic'] };
  it('a bare number matches the Pokedex number exactly', () => {
    expect(matchesQuery(parseQuery('150'), mewtwo)).toBe(true);
    expect(matchesQuery(parseQuery('15'), mewtwo)).toBe(false);
  });
  it('ranges are inclusive and open ended forms work', () => {
    expect(matchesQuery(parseQuery('1-151'), mewtwo)).toBe(true);
    expect(matchesQuery(parseQuery('151-'), mewtwo)).toBe(false);
    expect(matchesQuery(parseQuery('-150'), mewtwo)).toBe(true);
    expect(matchesQuery(parseQuery('100-'), mewtwo)).toBe(true);
  });
  it('a record without a dex number never matches a number term', () => {
    expect(matchesQuery(parseQuery('150'), noDex)).toBe(false);
  });
  it('cp and hp still win over the bare number form', () => {
    expect(matchesQuery(parseQuery('cp150'), { ...mewtwo, cp: 150 })).toBe(true);
    expect(matchesQuery(parseQuery('cp150'), { ...mewtwo, cp: 151 })).toBe(false);
  });
});
