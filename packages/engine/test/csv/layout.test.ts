import { describe, expect, it } from 'vitest';
import type { ShapeDeps } from '../../src/csv/concepts.js';
import {
  LayoutError,
  describeLayout,
  detectHeader,
  resolveLayout,
  sniffDelimiter,
} from '../../src/csv/layout.js';

/** A tiny stand-in for the game data: three species, two moves each way. */
const deps: ShapeDeps = {
  isSpecies: (name) => ['Azumarill', 'Medicham', 'Swampert', 'Ninetales'].includes(name),
  isFastMove: (name) => ['Bubble', 'Counter', 'Mud Shot'].includes(name),
  isChargedMove: (name) => ['Ice Beam', 'Play Rough', 'Hydro Cannon', 'Ice Punch'].includes(name),
};

const at = (layout: ReturnType<typeof resolveLayout>, concept: string): number | undefined =>
  layout.columns.find((c) => c.concept === concept)?.index;

describe('sniffDelimiter', () => {
  it('picks the separator that splits every line the same way', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3\n4,5,6')).toBe(',');
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(sniffDelimiter('Name,x;y|z\nAzumarill,1;2|3')).toBe(',');
  });

  it('ignores separators inside quotes', () => {
    expect(sniffDelimiter('a;"b,c";d\n1;"2,3";4')).toBe(';');
  });
});

describe('detectHeader', () => {
  it('needs words that name a concept and no numbers', () => {
    expect(detectHeader(['Name', 'CP', 'Atk', 'Def', 'Sta'])).toBe(true);
    expect(detectHeader(['Azumarill', '1498', '0', '15', '14'])).toBe(false);
    expect(detectHeader(['Foo', 'Bar', 'Baz'])).toBe(false);
  });
});

describe('resolveLayout', () => {
  it('reads a labelled sheet by its headers', () => {
    const rows = [
      ['Name', 'CP', 'Attack', 'Defense', 'Stamina', 'Level', 'Shadow'],
      ['Azumarill', '1498', '0', '15', '14', '40', 'no'],
      ['Medicham', '1500', '4', '15', '15', '45.5', 'yes'],
      ['Swampert', '1497', '0', '14', '15', '19', 'no'],
    ];
    const layout = resolveLayout(rows, ',', deps);
    expect(layout.hasHeader).toBe(true);
    expect(at(layout, 'name')).toBe(0);
    expect(at(layout, 'cp')).toBe(1);
    expect(at(layout, 'atk')).toBe(2);
    expect(at(layout, 'def')).toBe(3);
    expect(at(layout, 'sta')).toBe(4);
    expect(at(layout, 'levelMin')).toBe(5);
    expect(at(layout, 'shadow')).toBe(6);
    expect(layout.ivOrderAssumed).toBe(false);
    expect(layout.unused).toEqual([]);
    expect(layout.confidence).toBe(1);
    expect(layout.format).toBe('sheet');
  });

  it('reads a bare sheet with no header from the values alone', () => {
    const rows = [
      ['Azumarill', '1498', '0', '15', '14', '40'],
      ['Medicham', '1500', '4', '15', '15', '45.5'],
      ['Swampert', '1497', '0', '14', '15', '19'],
      ['Ninetales', '1490', '12', '13', '10', '30'],
    ];
    const layout = resolveLayout(rows, ',', deps);
    expect(layout.hasHeader).toBe(false);
    expect(at(layout, 'name')).toBe(0);
    expect(at(layout, 'cp')).toBe(1);
    expect(at(layout, 'atk')).toBe(2);
    expect(at(layout, 'def')).toBe(3);
    expect(at(layout, 'sta')).toBe(4);
    expect(at(layout, 'levelMin')).toBe(5);
    expect(layout.ivOrderAssumed).toBe(true);
    expect(layout.columns.find((c) => c.concept === 'atk')?.via).toBe('order');
  });

  it('does not mistake a 0/1 flag column for an IV', () => {
    const rows = [
      ['Azumarill', '1498', '0', '0', '15', '14'],
      ['Medicham', '1500', '1', '4', '15', '15'],
      ['Swampert', '1497', '0', '0', '14', '15'],
      ['Ninetales', '1490', '1', '12', '13', '10'],
    ];
    const layout = resolveLayout(rows, ',', deps);
    expect(at(layout, 'atk')).toBe(3);
    expect(at(layout, 'def')).toBe(4);
    expect(at(layout, 'sta')).toBe(5);
    expect(layout.unused).toEqual(['column 3']);
  });

  it('uses the header to tell moves apart and ignores columns it does not know', () => {
    const rows = [
      ['Name', 'Notes', 'CP', 'A', 'D', 'S', 'Quick Move', 'Charge Move', 'Charge Move 2'],
      ['Azumarill', 'keeper', '1498', '0', '15', '14', 'Bubble', 'Ice Beam', 'Play Rough'],
      ['Swampert', '', '1497', '0', '14', '15', 'Mud Shot', 'Hydro Cannon', ''],
    ];
    const layout = resolveLayout(rows, ',', deps);
    expect(at(layout, 'fastMove')).toBe(6);
    expect(at(layout, 'chargedMove1')).toBe(7);
    expect(at(layout, 'chargedMove2')).toBe(8);
    expect(layout.unused).toEqual(['Notes']);
  });

  it('keeps Poke Genie league columns apart from the plain ones', () => {
    const rows = [
      ['Name', 'Form', 'CP', 'Atk IV', 'Def IV', 'Sta IV', 'Rank % (G)', 'Name (G)', 'Sha/Pur (G)'],
      ['Azumarill', '', '1498', '0', '15', '14', '99.5%', 'Azumarill', '0'],
      ['Swampert', '', '1497', '0', '14', '15', '80%', 'Swampert', '1'],
    ];
    const layout = resolveLayout(rows, ',', deps);
    expect(at(layout, 'name')).toBe(0);
    expect(at(layout, 'pgNameG')).toBe(7);
    expect(at(layout, 'pgRankPctG')).toBe(6);
    expect(at(layout, 'pgShaPurG')).toBe(8);
    expect(layout.format).toBe('poke-genie');
  });

  it('fails naming the concept it could not find', () => {
    const rows = [
      ['Name', 'Atk', 'Def', 'Sta'],
      ['Azumarill', '0', '15', '14'],
      ['Swampert', '0', '14', '15'],
    ];
    expect(() => resolveLayout(rows, ',', deps)).toThrow(LayoutError);
    expect(() => resolveLayout(rows, ',', deps)).toThrow(/CP/);
  });

  it('describes itself without values', () => {
    const rows = [
      ['Name', 'CP', 'Atk', 'Def', 'Sta', 'Nickname'],
      ['Azumarill', '1498', '0', '15', '14', 'Bob'],
    ];
    const line = describeLayout(resolveLayout(rows, ',', deps));
    expect(line).toContain('format=sheet cols=6 header=1');
    expect(line).toContain('name=Name<h>');
    expect(line).not.toContain('Azumarill');
    expect(line).not.toContain('Bob');
  });
});
