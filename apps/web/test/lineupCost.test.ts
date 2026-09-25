import { describe, expect, it } from 'vitest';
import type { Cost, TeamPick } from '@pickthree/engine';
import { lineupCost } from '../src/components/lineupCost.ts';

const cost = (stardust: number, xlCandy = 0): Cost => ({
  stardust,
  candy: 10,
  xlCandy,
  eliteTm: 0,
  evolutionCandy: 0,
  secondMoveUnlock: false,
  powerUpSteps: 0,
  estimated: false,
  weight: stardust,
});
const mine = (id: string): TeamPick => ({ kind: 'specimen', id });
const theirs = (id: string): TeamPick => ({ kind: 'species', id });

describe('lineupCost', () => {
  it('sums your own Pokémon and counts the ones not caught', () => {
    const r = lineupCost([mine('a'), mine('b'), theirs('clodsire')], (id) =>
      id === 'a' ? cost(100_000) : cost(50_000, 20),
    );
    expect(r.total?.stardust).toBe(150_000);
    expect(r.total?.xlCandy).toBe(20);
    expect(r.notCaught).toBe(1);
    expect(r.unpriced).toBe(0);
  });

  it('has no total when none are yours', () => {
    const r = lineupCost([theirs('a'), theirs('b'), theirs('c')], () => undefined);
    expect(r).toEqual({ total: null, notCaught: 3, unpriced: 0, unbuildable: 0 });
  });

  it('counts a Pokémon of yours whose verdict has not arrived as not priced yet', () => {
    const r = lineupCost([mine('a'), mine('b'), mine('c')], (id) =>
      id === 'a' ? cost(1) : undefined,
    );
    expect(r.total?.stardust).toBe(1);
    expect(r.unpriced).toBe(2);
    expect(r.unbuildable).toBe(0);
  });

  it('counts a verdict that came back with no cost as unbuildable, not as waiting', () => {
    const r = lineupCost([mine('a'), mine('b'), mine('c')], (id) =>
      id === 'a' ? cost(1) : id === 'b' ? null : undefined,
    );
    expect(r.total?.stardust).toBe(1);
    expect(r.unbuildable).toBe(1);
    expect(r.unpriced).toBe(1);
  });
});
