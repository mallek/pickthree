import { describe, expect, it } from 'vitest';
import { selectMegaRows, selectVaried } from '../../src/coldstart/boards.js';

type T = { id: number; species: string[]; mega?: string };
const t = (id: number, species: string[], mega?: string): T =>
  mega === undefined ? { id, species } : { id, species, mega };
const sp = (x: T): string[] => x.species;
const megaOf = (x: T): string | null => x.mega ?? null;
const count = (rows: T[], key: string): number => rows.filter((r) => r.species.includes(key)).length;

describe('selectVaried', () => {
  it('caps any one Pokemon at two rows even when it is in every strong team', () => {
    const items = [
      t(1, ['kingdra', 'a', 'b']),
      t(2, ['kingdra', 'c', 'd']),
      t(3, ['kingdra', 'e', 'f']),
      t(4, ['kingdra', 'g', 'h']),
      t(5, ['i', 'j', 'k']),
      t(6, ['l', 'm', 'n']),
      t(7, ['o', 'p', 'q']),
    ];
    const rows = selectVaried(items, sp, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 5, 6, 7]);
    expect(count(rows, 'kingdra')).toBe(2);
  });

  it('never lets two rows share two Pokemon', () => {
    const items = [t(1, ['a', 'b', 'c']), t(2, ['a', 'b', 'd']), t(3, ['a', 'e', 'f'])];
    expect(selectVaried(items, sp, { rows: 5, cap: 2 }).map((r) => r.id)).toEqual([1, 3]);
  });

  it('stops at the row limit and keeps strength order', () => {
    const items = Array.from({ length: 10 }, (_, i) => t(i, [`x${i}`, `y${i}`, `z${i}`]));
    expect(selectVaried(items, sp, { rows: 5, cap: 2 }).map((r) => r.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns fewer rows when the list runs out', () => {
    const items = [t(1, ['a', 'b', 'c']), t(2, ['a', 'b', 'd'])];
    expect(selectVaried(items, sp, { rows: 5, cap: 2 })).toHaveLength(1);
  });
});

describe('selectMegaRows', () => {
  it('gives each Mega one row, its strongest team that fits the cap', () => {
    const items = [
      t(1, ['charizard', 'kingdra', 'magnezone'], 'charizard_mega_y'),
      t(2, ['venusaur', 'kingdra', 'magnezone'], 'venusaur_mega'),
      t(3, ['blastoise', 'kingdra', 'magnezone'], 'blastoise_mega'),
      t(4, ['charizard', 'a', 'b'], 'charizard_mega_y'),
      t(5, ['blastoise', 'c', 'd'], 'blastoise_mega'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 5]);
    expect(new Set(rows.map((r) => r.mega)).size).toBe(rows.length);
  });

  it('ranks Megas by their best team and returns rows in strength order', () => {
    const items = [
      t(1, ['a', 'b', 'venusaur'], 'venusaur_mega'),
      t(2, ['c', 'd', 'charizard'], 'charizard_mega_x'),
      t(3, ['e', 'f', 'charizard'], 'charizard_mega_y'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('lets Mega X and Mega Y of one base share its two rows, never a third', () => {
    const items = [
      t(1, ['charizard', 'a', 'b'], 'charizard_mega_x'),
      t(2, ['charizard', 'c', 'd'], 'charizard_mega_y'),
      t(3, ['charizard', 'e', 'f'], 'charizard_mega_z'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('ignores teams without a Mega and skips a Mega whose teams all break the cap', () => {
    const items = [
      t(1, ['k', 'a', 'venusaur'], 'venusaur_mega'),
      t(2, ['k', 'b', 'x']),
      t(3, ['k', 'c', 'blastoise'], 'blastoise_mega'),
      t(4, ['k', 'd', 'charizard'], 'charizard_mega_y'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 3]);
  });
});
