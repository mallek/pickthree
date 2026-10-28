import { describe, expect, it } from 'vitest';
import { ibfcFamilies, unmodelledForms } from '../src/extract/alarm.js';
import type { MechanicsEntry } from '../src/mechanics/vocabulary.js';
import { tPokemon } from './fixtures/templates.js';

const entry = (family: string): MechanicsEntry => ({
  family,
  source: 's',
  entered: '2026-10-27',
  resetOnSwitchOut: false,
  rules: [],
});

const templates = [
  tPokemon('V0001_POKEMON_ALPHA', { pokemonId: 'ALPHA', ibfc: { combatEnable: true } }),
  tPokemon('V0002_POKEMON_BETA', { pokemonId: 'BETA', ibfc: { combatEnable: false } }),
  tPokemon('V0003_POKEMON_GAMMA', { pokemonId: 'GAMMA' }),
];

describe('unmodelledForms', () => {
  it('returns a flagged family that has no mechanics entry', () => {
    expect(unmodelledForms(templates, {})).toEqual(['alpha']);
  });
  it('does not return a flagged family that has an entry', () => {
    expect(unmodelledForms(templates, { alpha: entry('alpha') })).toEqual([]);
  });
  it('ignores combatEnable false and unflagged species', () => {
    expect(ibfcFamilies(templates)).toEqual(['alpha']);
  });
  it('returns a sorted, de-duplicated list', () => {
    const t = [
      tPokemon('V1_POKEMON_ZED', { pokemonId: 'ZED', ibfc: { combatEnable: true } }),
      tPokemon('V1_POKEMON_ZED_X', { pokemonId: 'ZED', ibfc: { combatEnable: true } }),
      tPokemon('V2_POKEMON_ABE', { pokemonId: 'ABE', ibfc: { combatEnable: true } }),
    ];
    expect(unmodelledForms(t, {})).toEqual(['abe', 'zed']);
  });
});
