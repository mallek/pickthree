import { describe, expect, it } from 'vitest';
import { validateMechanics } from '../src/mechanics/validate.js';
import { makeShifterData } from './fixtures/synthetic.js';

declare function structuredClone<T>(value: T): T;

const data = makeShifterData();

function entry(rules: unknown[], over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    shifter: {
      source: 'synthetic test',
      entered: '2026-10-27',
      resetOnSwitchOut: false,
      rules,
      ...over,
    },
  };
}
const rule = (when: Record<string, unknown>, doList: unknown[]) => ({ when, do: doList });

describe('validateMechanics', () => {
  it('round-trips a valid entry and adds family', () => {
    const rules = [
      rule({ event: 'hpBelow', fraction: 0.5, form: 'shifter_a' }, [
        { effect: 'switchForm', to: 'shifter_b' },
        { effect: 'statStages', target: 'self', atk: 1 },
        { effect: 'animate', turns: 2 },
      ]),
      rule({ event: 'afterChargedMove', moves: ['BLAST_CHARGED'], hpAbove: 0.2 }, [
        { effect: 'fireMove', move: 'BLAST_CHARGED', ignoresFaint: true },
        { effect: 'replaceMove', from: 'BLAST_CHARGED', to: 'SLAM_CHARGED' },
      ]),
      rule({ event: 'hitByChargedMove', form: ['shifter_a', 'shifter_b'] }, [
        { effect: 'blockDamage' },
        { effect: 'switchForm', to: 'startForm' },
      ]),
    ];
    const raw = entry(rules);
    const out = validateMechanics(structuredClone(raw), data);
    expect(out).toEqual({ shifter: { ...(raw['shifter'] as object), family: 'shifter' } });
  });
  it('rejects an unknown event', () => {
    const raw = entry([rule({ event: 'onSneeze' }, [])]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].when.event "onSneeze" is not in the vocabulary (battleStart, hpBelow, beforeChargedMove, afterChargedMove, shieldUsed, hitByChargedMove). A new trigger is a code change in packages/battle/src/mechanics/.',
    );
  });
  it('rejects an unknown effect', () => {
    const raw = entry([rule({ event: 'battleStart' }, [{ effect: 'sneeze' }])]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].do[0].effect "sneeze" is not in the vocabulary (switchForm, blockDamage, replaceMove, statStages, fireMove, animate). A new effect is a code change in packages/battle/src/mechanics/.',
    );
  });
  it('rejects a form from another family', () => {
    const raw = entry([
      rule({ event: 'battleStart' }, [{ effect: 'switchForm', to: 'other_mon' }]),
    ]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].do[0].to "other_mon" is not a form of family "shifter"',
    );
  });
  it('rejects a missing move', () => {
    const raw = entry([
      rule({ event: 'battleStart' }, [{ effect: 'fireMove', move: 'NOPE_CHARGED' }]),
    ]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].do[0].move "NOPE_CHARGED" is not a move',
    );
  });
  it('rejects fireMove with a fast move', () => {
    const raw = entry([
      rule({ event: 'battleStart' }, [{ effect: 'fireMove', move: 'TACKLE_FAST' }]),
    ]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].do[0].move "TACKLE_FAST" is not a charged move',
    );
  });
  it('rejects fraction out of range', () => {
    const raw = entry([rule({ event: 'hpBelow', fraction: 1.5 }, [])]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].when.fraction must be a number in (0, 1)',
    );
  });
  it('requires fraction for hpBelow and forbids it elsewhere', () => {
    expect(() => validateMechanics(entry([rule({ event: 'hpBelow' }, [])]), data)).toThrow(
      'mechanics.yaml: shifter.rules[0].when.fraction is required for the hpBelow event',
    );
    expect(() =>
      validateMechanics(entry([rule({ event: 'battleStart', fraction: 0.5 }, [])]), data),
    ).toThrow(
      'mechanics.yaml: shifter.rules[0].when.fraction is only valid with the hpBelow event',
    );
  });
  it('rejects moves on a non charged-move event', () => {
    const raw = entry([rule({ event: 'shieldUsed', moves: ['BLAST_CHARGED'] }, [])]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].when.moves is only valid with beforeChargedMove or afterChargedMove',
    );
  });
  it('rejects blockDamage under afterChargedMove', () => {
    const raw = entry([rule({ event: 'afterChargedMove' }, [{ effect: 'blockDamage' }])]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].do[0] effect "blockDamage" is only valid under the hitByChargedMove event',
    );
  });
  it('rejects a non-positive animate.turns', () => {
    const raw = entry([rule({ event: 'battleStart' }, [{ effect: 'animate', turns: 0 }])]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].do[0].turns must be a positive integer',
    );
  });
  it('accepts notStartForm: true and rejects any other value', () => {
    const ok = entry([rule({ event: 'hpBelow', fraction: 0.5, notStartForm: true }, [])]);
    expect(
      validateMechanics(structuredClone(ok), data)['shifter']!.rules[0]!.when.notStartForm,
    ).toBe(true);
    for (const bad of [false, 'yes', 1]) {
      const raw = entry([rule({ event: 'hpBelow', fraction: 0.5, notStartForm: bad }, [])]);
      expect(() => validateMechanics(raw, data)).toThrow(
        'mechanics.yaml: shifter.rules[0].when.notStartForm must be true (omit it otherwise)',
      );
    }
  });
  it('rejects a move named like an Object prototype key', () => {
    const raw = entry([
      rule({ event: 'battleStart' }, [{ effect: 'fireMove', move: 'constructor' }]),
    ]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].do[0].move "constructor" is not a move',
    );
  });
  it('rejects a form named like an Object prototype key', () => {
    const raw = entry([
      rule({ event: 'battleStart' }, [{ effect: 'switchForm', to: 'constructor' }]),
    ]);
    expect(() => validateMechanics(raw, data)).toThrow(
      'mechanics.yaml: shifter.rules[0].do[0].to "constructor" is not a form of family "shifter"',
    );
  });
  it('rejects a missing source', () => {
    expect(() => validateMechanics(entry([], { source: '' }), data)).toThrow(
      'mechanics.yaml: shifter.source must be a non-empty string',
    );
  });
  it('rejects a bad entered date', () => {
    expect(() => validateMechanics(entry([], { entered: '10/27/2026' }), data)).toThrow(
      'mechanics.yaml: shifter.entered "10/27/2026" must match YYYY-MM-DD',
    );
  });
});
