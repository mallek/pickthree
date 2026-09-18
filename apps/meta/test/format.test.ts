import { describe, expect, it } from 'vitest';
import {
  ago,
  ascii,
  battleWord,
  battles,
  count,
  pct,
  pctFloor,
  pctPrecise,
  shortName,
} from '../src/format.js';

describe('ascii', () => {
  it('folds accented letters so every rendered string is 7-bit', () => {
    expect(ascii('Pok\u00e9mon')).toBe('Pokemon');
    expect(ascii('Flab\u00e9b\u00e9')).toBe('Flabebe');
    expect(ascii('Azumarill')).toBe('Azumarill');
  });

  it('leaves nothing above code point 127 behind', () => {
    const out = ascii('Nidoran\u2640 \u00b7 Farfetch\u2019d');
    expect([...out].every((c) => c.charCodeAt(0) < 128)).toBe(true);
  });
});

describe('shortName', () => {
  it('abbreviates regional and shadow forms', () => {
    expect(shortName('Corsola (Galarian)')).toBe('Corsola-G');
    expect(shortName('Marowak (Alolan)')).toBe('Marowak-A');
    expect(shortName('Azumarill (Shadow)')).toBe('Azumarill-S');
    expect(shortName('Deoxys (Defense)')).toBe('Deoxys-D');
    expect(shortName('Azumarill')).toBe('Azumarill');
  });
});

describe('numbers', () => {
  it('groups thousands', () => {
    expect(count(41208)).toBe('41,208');
    expect(count(9)).toBe('9');
  });

  it('gives a share a whole percent, rounded, no decimal', () => {
    expect(pct(0.184)).toBe('18');
    expect(pct(0)).toBe('0');
    expect(pct(1)).toBe('100');
    // A4: rounds, does not floor or truncate.
    expect(pct(0.185)).toBe('19');
  });

  it('keeps a decimal in pctPrecise, for a stated cut rather than a glance-at share', () => {
    expect(pctPrecise(0.005)).toBe('0.5');
    expect(pctPrecise(0)).toBe('0.0');
    expect(pctPrecise(1)).toBe('100.0');
  });

  // FIX 2 (honesty): whole-percent rounding must not turn a real but rare share into "0%",
  // which reads as "never faced". A genuinely zero share still reads "0%": that one is true.
  it('floors a genuinely nonzero share under one percent at "<1%" rather than rounding to 0%', () => {
    expect(pctFloor(0)).toBe('0%');
    expect(pctFloor(0.001)).toBe('<1%'); // 0.1%: real, but rounds to 0
    expect(pctFloor(0.184)).toBe('18%'); // normal case, same digits as pct's own test above
  });

  it('counts battles in words', () => {
    expect(battles(1)).toBe('1 battle');
    expect(battles(1240)).toBe('1,240 battles');
    expect(battles(0)).toBe('0 battles');
  });

  it('gives the plural word alone for a sentence with something between the count and it', () => {
    expect(battleWord(1)).toBe('battle');
    expect(battleWord(0)).toBe('battles');
    expect(battleWord(2)).toBe('battles');
  });
});

describe('ago', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  it('says how long since an instant, in plain words', () => {
    expect(ago('2026-09-18T11:59:30.000Z', now)).toBe('just now');
    expect(ago('2026-09-18T11:48:00.000Z', now)).toBe('12 min ago');
    expect(ago('2026-09-18T09:00:00.000Z', now)).toBe('3 hr ago');
    expect(ago('2026-09-16T12:00:00.000Z', now)).toBe('2 days ago');
    expect(ago('2026-09-17T12:00:00.000Z', now)).toBe('1 day ago');
  });
});
