import { describe, expect, it } from 'vitest';
import {
  CONCEPTS,
  headerScore,
  isDateish,
  isLevel,
  looksLikeHeader,
  normalizeHeader,
  shadowCodeOf,
  splitName,
  type ConceptDef,
} from '../../src/csv/concepts.js';

const def = (k: ConceptDef['concept']): ConceptDef =>
  CONCEPTS.find((c) => c.concept === k) as ConceptDef;

describe('normalizeHeader', () => {
  it('lowercases, strips spaces and punctuation, keeps % and #', () => {
    expect(normalizeHeader('Atk IV')).toEqual({ key: 'atkiv', tag: null });
    expect(normalizeHeader(' Pokémon Number ')).toEqual({ key: 'pokemonnumber', tag: null });
    expect(normalizeHeader('Rank % (G)')).toEqual({ key: 'rank%', tag: 'g' });
    expect(normalizeHeader('Rank # (U)')).toEqual({ key: 'rank#', tag: 'u' });
    expect(normalizeHeader('Sha/Pur (L)')).toEqual({ key: 'shapur', tag: 'l' });
  });
});

describe('headerScore', () => {
  it('hits outright on the words each tool uses', () => {
    expect(headerScore(def('dex'), normalizeHeader('Pokemon Number'))).toBe(1);
    expect(headerScore(def('name'), normalizeHeader('Pokemon'))).toBe(1);
    expect(headerScore(def('atk'), normalizeHeader('Att IV'))).toBe(1);
    expect(headerScore(def('sta'), normalizeHeader('HP IV'))).toBe(1);
    expect(headerScore(def('fastMove'), normalizeHeader('Quick Move'))).toBe(1);
    expect(headerScore(def('fastMove'), normalizeHeader('Fast move'))).toBe(1);
    expect(headerScore(def('chargedMove1'), normalizeHeader('Charge Move'))).toBe(1);
    expect(headerScore(def('chargedMove2'), normalizeHeader('Charge Move 2'))).toBe(1);
    expect(headerScore(def('shadow'), normalizeHeader('Shadow/Purified'))).toBe(1);
  });

  it('keeps league-tagged columns away from the untagged concepts', () => {
    expect(headerScore(def('name'), normalizeHeader('Name (G)'))).toBe(0);
    expect(headerScore(def('pgNameG'), normalizeHeader('Name (G)'))).toBe(1);
    expect(headerScore(def('pgNameG'), normalizeHeader('Name (U)'))).toBe(0);
    expect(headerScore(def('pgRankPctG'), normalizeHeader('Rank % (G)'))).toBe(1);
  });

  it('gives a half score to fragments', () => {
    expect(headerScore(def('scanDate'), normalizeHeader('Last Scan'))).toBe(1);
    expect(headerScore(def('scanDate'), normalizeHeader('Scanned On'))).toBe(0.5);
    expect(headerScore(def('atk'), normalizeHeader('IV Attack Stat'))).toBe(0.5);
  });
});

describe('looksLikeHeader', () => {
  it('recognises words and rejects data', () => {
    expect(looksLikeHeader(normalizeHeader('CP'))).toBe(true);
    expect(looksLikeHeader(normalizeHeader('Gender'))).toBe(false);
    expect(looksLikeHeader(normalizeHeader('Seel'))).toBe(false);
  });
});

describe('value shapes', () => {
  it('levels are 1..51 in half steps', () => {
    expect(isLevel('25.0')).toBe(true);
    expect(isLevel('40.5')).toBe(true);
    expect(isLevel('25.3')).toBe(false);
    expect(isLevel('52')).toBe(false);
  });

  it('dates in the common shapes', () => {
    expect(isDateish('2026-09-01 10:00')).toBe(true);
    expect(isDateish('9/1/2026')).toBe(true);
    expect(isDateish('01.09.2026')).toBe(true);
    expect(isDateish('Seel')).toBe(false);
    expect(isDateish('1499')).toBe(false);
  });

  it('shadow codes from numbers and words', () => {
    expect(shadowCodeOf('0')).toBe(0);
    expect(shadowCodeOf('1')).toBe(1);
    expect(shadowCodeOf('2')).toBe(2);
    expect(shadowCodeOf('shadow')).toBe(1);
    expect(shadowCodeOf('Purified')).toBe(2);
    expect(shadowCodeOf('yes')).toBe(1);
    expect(shadowCodeOf('')).toBe(0);
    expect(shadowCodeOf('maybe')).toBe(null);
  });
});

describe('splitName', () => {
  it('pulls form and shadow words off the front', () => {
    expect(splitName('Shadow Swampert')).toEqual({ name: 'Swampert', form: '', shadow: 1 });
    expect(splitName('Alolan Ninetales')).toEqual({
      name: 'Ninetales',
      form: 'Alolan',
      shadow: null,
    });
    expect(splitName('Shadow Galarian Stunfisk')).toEqual({
      name: 'Stunfisk',
      form: 'Galarian',
      shadow: 1,
    });
  });

  it('reads a trailing form in parentheses', () => {
    expect(splitName('Giratina (Altered)')).toEqual({
      name: 'Giratina',
      form: 'Altered',
      shadow: null,
    });
  });

  it('leaves plain names alone', () => {
    expect(splitName('Azumarill')).toEqual({ name: 'Azumarill', form: '', shadow: null });
  });
});
