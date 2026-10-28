import { describe, expect, it } from 'vitest';
import { damageOf, effectiveness, type DamageInput } from '../src/rules/damage.js';
import { stageMultiplier } from '../src/rules/stats.js';
import { makeData, makeMove } from './fixtures/synthetic.js';

const d = makeData();
const fast10 = makeMove('F10', { power: 10 });

function base(over: Partial<DamageInput> = {}): DamageInput {
  return {
    move: fast10,
    attackerTypes: ['gamma'],
    defenderTypes: ['gamma'],
    atk: 100,
    def: 100,
    atkStage: 0,
    defStage: 0,
    attackerShadow: false,
    defenderShadow: false,
    defenderMaxHp: 100,
    ...over,
  };
}

describe('damageOf', () => {
  it('plain fast move', () => {
    expect(damageOf(d, base())).toBe(7);
  });
  it('same type bonus', () => {
    expect(damageOf(d, base({ attackerTypes: ['alpha'] }))).toBe(8);
  });
  it('type effectiveness multiplies per defender type', () => {
    expect(effectiveness(d, 'alpha', ['beta'])).toBe(1.6);
    expect(effectiveness(d, 'alpha', ['beta', 'beta'])).toBe(1.6 * 1.6);
    expect(damageOf(d, base({ defenderTypes: ['beta'] }))).toBe(11);
  });
  it('attack stage', () => {
    expect(damageOf(d, base({ atkStage: 2 }))).toBe(10);
  });
  it('shadow on both sides', () => {
    expect(damageOf(d, base({ attackerShadow: true, defenderShadow: true }))).toBe(10);
  });
  it('stage clamps at max and min', () => {
    expect(stageMultiplier(d.settings.stages, 9)).toBe(2);
    expect(stageMultiplier(d.settings.stages, -9)).toBe(0.5);
  });
  it('percent of max HP ignores stats', () => {
    const m = makeMove('P', { power: 15, damageKind: 'percentMaxHp' });
    expect(damageOf(d, base({ move: m, defenderMaxHp: 120, atk: 1 }))).toBe(19);
  });
  it('unknown type throws', () => {
    expect(() => effectiveness(d, 'zzz', ['alpha'])).toThrow('unknown type zzz');
  });
});
