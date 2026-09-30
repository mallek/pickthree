import type { Specimen } from '@pickthree/engine';
import { describe, expect, it } from 'vitest';
import { carryMegaLevel4 } from '../src/megaMarks.ts';

function sp(id: string, atk: number, extra: Partial<Specimen> = {}): Specimen {
  return {
    id,
    speciesId: 'sableye',
    shadow: false,
    ivs: { atk, def: 15, sta: 15 },
    ...extra,
  } as unknown as Specimen;
}

const marks = (list: Specimen[]) => list.filter((x) => x.megaLevel4).map((x) => x.id);

describe('carryMegaLevel4', () => {
  it('keeps the mark when the Pokemon was powered up (new id, same IVs)', () => {
    const out = carryMegaLevel4([sp('old', 3, { megaLevel4: true })], [sp('new', 3)]);
    expect(marks(out)).toEqual(['new']);
  });
  it('leaves two identical-IV copies unmarked when no id matches', () => {
    const out = carryMegaLevel4([sp('old', 3, { megaLevel4: true })], [sp('n1', 3), sp('n2', 3)]);
    expect(marks(out)).toEqual([]);
  });
  it('prefers the same id among several matches', () => {
    const out = carryMegaLevel4([sp('n2', 3, { megaLevel4: true })], [sp('n1', 3), sp('n2', 3)]);
    expect(marks(out)).toEqual(['n2']);
  });
  it('drops a mark whose Pokemon is gone', () => {
    const out = carryMegaLevel4([sp('old', 3, { megaLevel4: true })], [sp('x', 9)]);
    expect(marks(out)).toEqual([]);
  });
  it('does not match another species or shadow status', () => {
    const old = [sp('old', 3, { megaLevel4: true })];
    expect(marks(carryMegaLevel4(old, [sp('a', 3, { speciesId: 'other' })]))).toEqual([]);
    expect(marks(carryMegaLevel4(old, [sp('b', 3, { shadow: true })]))).toEqual([]);
  });
  it('keeps unmarked unmarked', () => {
    expect(marks(carryMegaLevel4([sp('old', 3)], [sp('new', 3)]))).toEqual([]);
  });
});
