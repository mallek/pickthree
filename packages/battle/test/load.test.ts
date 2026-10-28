import { describe, expect, it } from 'vitest';
import { loadBattleData } from '../src/data/load.js';
import { makeData, makeMove, makeSpecies } from './fixtures/synthetic.js';

// lib is ES2022 with no DOM or Node types, so structuredClone is not declared. The runtime has it.
declare function structuredClone<T>(value: T): T;

describe('loadBattleData', () => {
  it('accepts the synthetic fixture', () => {
    expect(loadBattleData(structuredClone(makeData())).version).toBe(1);
  });
  it('names the bad field', () => {
    const raw = makeData();
    raw.moves['TACKLE_FAST'] = makeMove('TACKLE_FAST', { turns: 0 });
    expect(() => loadBattleData(raw)).toThrow(
      'battle data: moves.TACKLE_FAST.turns must be a positive integer',
    );
  });
  it('rejects a species move that is not in moves', () => {
    const raw = makeData();
    raw.species['alpha_mon'] = makeSpecies('alpha_mon', { fast: ['NOPE_FAST'] });
    expect(() => loadBattleData(raw)).toThrow(
      'battle data: species.alpha_mon.fast[0] NOPE_FAST is not a move',
    );
  });
  it('rejects a non-square effectiveness table', () => {
    const raw = makeData({ effectiveness: [[1, 1]] });
    expect(() => loadBattleData(raw)).toThrow('battle data: effectiveness must be 3 x 3');
  });
});
