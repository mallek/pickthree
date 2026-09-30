import { describe, expect, it } from 'vitest';
import { selectCores, type CoreOptions } from '../../src/coldstart/cores.js';

interface Trio {
  key: string;
  species: string[];
  strength: number;
}
const trio = (species: string[], strength: number): Trio => ({
  key: [...species].join('|') + '@' + strength,
  species,
  strength,
});
const opts = (over: Partial<CoreOptions<Trio>> = {}): CoreOptions<Trio> => ({
  rows: 5,
  cap: 2,
  flexMax: 4,
  window: 1,
  megaWindow: 2,
  speciesOf: (t) => t.species,
  strengthOf: (t) => t.strength,
  keyOf: (t) => t.key,
  base: (id) => id.replace(/_shadow$|_mega.*$/, ''),
  isMega: (id) => id.includes('_mega'),
  ...over,
});
const thirds = (row: { flex: { third: string }[] }): string[] => row.flex.map((f) => f.third);

describe('selectCores', () => {
  it('does not put a trio with plain kingdra under a kingdra_shadow core', () => {
    const items = [
      trio(['kingdra_shadow', 'magnezone_shadow', 'x'], 10),
      trio(['kingdra', 'magnezone_shadow', 'y'], 9.9),
      trio(['kingdra_shadow', 'magnezone_shadow', 'z'], 9.8),
    ];
    const rows = selectCores(items, opts({ rows: 1 }));
    expect(rows[0]!.core).toEqual(['kingdra_shadow', 'magnezone_shadow']);
    expect(thirds(rows[0]!)).toEqual(['x', 'z']);
  });

  it('does not put a plain-form trio under a Mega core', () => {
    const items = [
      trio(['charizard_mega_x', 'b', 'c1'], 10),
      trio(['charizard', 'b', 'c2_mega'], 9.5),
      trio(['charizard_mega_x', 'b', 'c3'], 9.4),
    ];
    const rows = selectCores(items, opts({ rows: 1 }));
    expect(rows[0]!.core).toEqual(['charizard_mega_x', 'b']);
    expect(thirds(rows[0]!)).toEqual(['c1', 'c3']);
  });

  it('groups near-tied thirds under one core, best first, capped at flexMax', () => {
    const items = [
      trio(['a', 'b', 'c1'], 10),
      trio(['a', 'b', 'c2'], 9.9),
      trio(['a', 'b', 'c3'], 9.8),
      trio(['a', 'b', 'c4'], 9.7),
      trio(['a', 'b', 'c5'], 9.6),
    ];
    const rows = selectCores(items, opts({ rows: 1 }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.core).toEqual(['a', 'b']);
    expect(thirds(rows[0]!)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(rows[0]!.flex[0]!.trio).toBe(items[0]);
  });

  it('includes a regular third at exactly the window and excludes one just outside', () => {
    const rows = selectCores(
      [trio(['a', 'b', 'c1'], 10), trio(['a', 'b', 'c2'], 9), trio(['a', 'b', 'c3'], 8.99)],
      opts({ rows: 1 }),
    );
    expect(thirds(rows[0]!)).toEqual(['c1', 'c2']);
  });

  it('includes a Mega third at exactly megaWindow and excludes one just outside', () => {
    const items = [
      trio(['a', 'b', 'c1'], 10),
      trio(['a', 'b', 'c2'], 9.2),
      trio(['a', 'b', 'x_mega'], 8),
      trio(['a', 'b', 'y_mega'], 7.99),
    ];
    const rows = selectCores(items, opts({ rows: 1 }));
    expect(thirds(rows[0]!)).toEqual(['c1', 'c2', 'x_mega']);
  });

  it('allows a Mega third 2.0 below but not a regular third 1.5 below', () => {
    const rows = selectCores(
      [trio(['a', 'b', 'c1'], 10), trio(['a', 'b', 'c2'], 8.5), trio(['a', 'b', 'x_mega'], 8.1)],
      opts({ rows: 1 }),
    );
    expect(thirds(rows[0]!)).toEqual(['c1', 'x_mega']);
  });

  it('does not start row 2 from, or flex, a trio holding row 1 core just outside its window', () => {
    const items = [
      trio(['a', 'b', 'c'], 10),
      trio(['a', 'b', 'd'], 8.5),
      trio(['b', 'd', 'e'], 8),
      trio(['b', 'd', 'f'], 7.9),
    ];
    const rows = selectCores(items, opts());
    expect(rows.map((r) => r.core)).toEqual([
      ['a', 'b'],
      ['b', 'd'],
    ]);
    expect(rows[0]!.flex.map((f) => f.trio.key)).toEqual([items[0]!.key]);
    expect(rows[1]!.flex.map((f) => f.trio.key)).toEqual([items[2]!.key, items[3]!.key]);
    const all = rows.flatMap((r) => r.flex.map((f) => f.trio.key));
    expect(all).not.toContain(items[1]!.key);
  });

  it('does not let a Shadow variant of row 1 flex start a row or join a later flex', () => {
    const items = [
      trio(['a', 'b', 'c'], 10),
      trio(['a', 'b', 'c_shadow'], 5),
      trio(['a', 'd', 'e'], 4),
      trio(['a_shadow', 'b', 'c_shadow'], 3.9),
      trio(['a', 'd', 'f'], 3.8),
    ];
    const rows = selectCores(items, opts());
    expect(rows.map((r) => r.core)).toEqual([
      ['a', 'b'],
      ['a', 'd'],
    ]);
    const all = rows.flatMap((r) => r.flex.map((f) => f.trio.key));
    expect(all).not.toContain(items[1]!.key);
    expect(all).not.toContain(items[3]!.key);
  });

  it('still forms a later row with its own flex when its pair does not overlap a used pair', () => {
    const items = [trio(['a', 'b', 'c'], 10), trio(['d', 'e', 'f'], 9), trio(['d', 'e', 'g'], 8.5)];
    const rows = selectCores(items, opts());
    expect(rows.map((r) => r.core)).toEqual([
      ['a', 'b'],
      ['d', 'e'],
    ]);
    expect(thirds(rows[1]!)).toEqual(['f', 'g']);
  });

  it('returns fewer rows than asked when only covered trios remain', () => {
    const items = [trio(['a', 'b', 'c'], 10), trio(['a', 'b', 'd'], 5), trio(['a', 'b', 'e'], 4)];
    const rows = selectCores(items, opts());
    expect(rows).toHaveLength(1);
  });

  it('caps a species at two rows as a core member', () => {
    const items = [trio(['a', 'b', 'x'], 10), trio(['a', 'c', 'y'], 9), trio(['a', 'd', 'z'], 8)];
    const rows = selectCores(items, opts());
    expect(rows.map((r) => r.core)).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['d', 'z'],
    ]);
  });

  it('never starts two rows with the same base-species pair', () => {
    const items = [
      trio(['a', 'b', 'x'], 10),
      trio(['a_shadow', 'b', 'y'], 5),
      trio(['a', 'b_shadow', 'z'], 4),
    ];
    const rows = selectCores(items, opts({ window: 0 }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.core).toEqual(['a', 'b']);
    expect(thirds(rows[0]!)).toEqual(['x']);
  });

  it('never shows a trio twice across the flex lists', () => {
    const items = [
      trio(['a', 'b', 'c'], 10),
      trio(['a', 'b', 'd'], 9.9),
      trio(['a', 'c', 'd'], 9.8),
      trio(['b', 'c', 'd'], 9.7),
      trio(['a', 'e', 'f'], 9.6),
    ];
    const rows = selectCores(items, opts());
    const keys = rows.flatMap((r) => r.flex.map((f) => f.trio.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('counts a third and its shadow as one, keeping the stronger', () => {
    const rows = selectCores(
      [trio(['a', 'b', 'c'], 10), trio(['a', 'b', 'c_shadow'], 9.9)],
      opts(),
    );
    expect(thirds(rows[0]!)).toEqual(['c']);
  });

  it('breaks a symmetric trio by earliest sorted pair key, but prefers more flex', () => {
    const symmetric = selectCores([trio(['c', 'b', 'a'], 10)], opts());
    expect(symmetric[0]!.core.slice().sort()).toEqual(['a', 'b']);

    const withFlex = selectCores(
      [trio(['a', 'b', 'c'], 10), trio(['b', 'c', 'd'], 9.9), trio(['b', 'c', 'e'], 9.8)],
      opts({ rows: 1 }),
    );
    expect(withFlex[0]!.core.slice().sort()).toEqual(['b', 'c']);
    expect(thirds(withFlex[0]!)).toEqual(['a', 'd', 'e']);
  });

  it('returns fewer rows than asked when trios run out', () => {
    const rows = selectCores([trio(['a', 'b', 'c'], 10)], opts());
    expect(rows).toHaveLength(1);
  });

  it('does not depend on the order of equal-strength items', () => {
    const one = [
      trio(['a', 'b', 'c'], 10),
      trio(['d', 'e', 'f'], 10),
      trio(['a', 'b', 'g'], 9.5),
      trio(['d', 'e', 'h'], 9.5),
    ];
    const two = [one[3]!, one[1]!, one[2]!, one[0]!].sort((x, y) => y.strength - x.strength);
    const shape = (rows: ReturnType<typeof selectCores<Trio>>): string[] =>
      rows.map((r) => r.core.slice().sort().join('+') + ':' + thirds(r).slice().sort().join(','));
    expect(shape(selectCores(two, opts())).sort()).toEqual(shape(selectCores(one, opts())).sort());
  });

  it('never makes a core of two forms of one species', () => {
    const items = [
      trio(['kingdra', 'kingdra_shadow', 'x'], 10),
      trio(['kingdra', 'a', 'b'], 9),
      trio(['kingdra', 'c', 'd'], 8),
      trio(['kingdra', 'e', 'f'], 7),
    ];
    const rows = selectCores(items, opts());
    for (const row of rows) {
      const bases = row.core.map((m) => m.replace(/_shadow$/, ''));
      expect(new Set(bases).size).toBe(2);
    }
    const shownKeys = rows.flatMap((r) => r.flex.map((f) => f.trio.key));
    expect(shownKeys).not.toContain(items[0]!.key);
    expect(rows).toHaveLength(3);
  });

  it('does not offer another form of a core member as flex', () => {
    const items = [trio(['kingdra', 'a', 'x'], 10), trio(['kingdra', 'a', 'kingdra_shadow'], 9.9)];
    const rows = selectCores(items, opts({ rows: 1 }));
    expect(rows[0]!.core).toEqual(['kingdra', 'a']);
    expect(thirds(rows[0]!)).toEqual(['x']);
  });
});
