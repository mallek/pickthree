import { describe, expect, it } from 'vitest';
import { matchesSpeciesQuery } from '../src/search.ts';

describe('matchesSpeciesQuery', () => {
  it('matches a type word against a species with that type', () => {
    expect(matchesSpeciesQuery(['fire'], 'Charizard', ['fire', 'flying'])).toBe(true);
  });

  it('does not match a type word against a species without that type', () => {
    expect(matchesSpeciesQuery(['fire'], 'Azumarill', ['water', 'fairy'])).toBe(false);
  });

  it('narrows by name once a second word is added', () => {
    expect(matchesSpeciesQuery(['fire', 'ch'], 'Charizard', ['fire', 'flying'])).toBe(true);
    expect(matchesSpeciesQuery(['fire', 'ch'], 'Flareon', ['fire'])).toBe(false);
  });

  it('matches a type by prefix', () => {
    expect(matchesSpeciesQuery(['elec'], 'Raichu', ['electric'])).toBe(true);
  });

  it('matches everything when there are no words', () => {
    expect(matchesSpeciesQuery([], 'Anything', ['normal'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesSpeciesQuery(['FIRE'], 'charizard', ['Fire', 'Flying'])).toBe(true);
    expect(matchesSpeciesQuery(['Char'], 'CHARIZARD', ['fire'])).toBe(true);
  });
});
