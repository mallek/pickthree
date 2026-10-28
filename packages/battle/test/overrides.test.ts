import { describe, expect, it } from 'vitest';
import { applyOverrides, validateOverrides } from '../src/extract/overrides.js';
import { makeData, makeMove, makeSpecies } from './fixtures/synthetic.js';

const base = { source: 'https://example.test/note', entered: '2026-10-27' };

describe('validateOverrides', () => {
  it('returns entries with kind set, indexed per list', () => {
    const out = validateOverrides({
      moves: [{ id: 'A_FAST', add: { type: 'alpha' }, ...base }],
      species: [{ id: 'x_mon', set: { dex: 2 }, ...base }],
    });
    expect(out.map((e) => [e.kind, e.id])).toEqual([
      ['move', 'A_FAST'],
      ['species', 'x_mon'],
    ]);
  });
  it('accepts missing or empty lists', () => {
    expect(validateOverrides({})).toEqual([]);
    expect(validateOverrides({ moves: [], species: [] })).toEqual([]);
  });
  it('rejects a missing source', () => {
    expect(() =>
      validateOverrides({ moves: [{ id: 'A_FAST', set: { power: 1 }, entered: '2026-10-27' }] }),
    ).toThrow('overrides.yaml: moves[0].source is required');
  });
  it('rejects a malformed entered date', () => {
    expect(() =>
      validateOverrides({
        moves: [
          { id: 'A', set: { power: 1 }, ...base },
          { id: 'B', set: { power: 1 }, ...base },
          { id: 'C', set: { power: 1 }, source: 's', entered: '2026-13-01' },
        ],
      }),
    ).toThrow('overrides.yaml: moves[2].entered "2026-13-01" must be YYYY-MM-DD');
    expect(() =>
      validateOverrides({
        species: [{ id: 'C', set: { dex: 1 }, source: 's', entered: '2026-02-30' }],
      }),
    ).toThrow('overrides.yaml: species[0].entered "2026-02-30" must be YYYY-MM-DD');
    expect(() =>
      validateOverrides({ moves: [{ id: 'C', set: { power: 1 }, source: 's', entered: 'soon' }] }),
    ).toThrow('overrides.yaml: moves[0].entered "soon" must be YYYY-MM-DD');
  });
  it('rejects both add and set, and neither', () => {
    expect(() => validateOverrides({ moves: [{ id: 'A', add: {}, set: {}, ...base }] })).toThrow(
      'overrides.yaml: moves[0] must have exactly one of add or set',
    );
    expect(() => validateOverrides({ species: [{ id: 'A', ...base }] })).toThrow(
      'overrides.yaml: species[0] must have exactly one of add or set',
    );
  });
  it('rejects a missing id', () => {
    expect(() => validateOverrides({ moves: [{ set: {}, ...base }] })).toThrow(
      'overrides.yaml: moves[0].id is required',
    );
  });
});

describe('applyOverrides', () => {
  const entry = (over: Record<string, unknown>) =>
    validateOverrides({ moves: [{ ...base, ...over }] });

  it('set patches a field on a copy', () => {
    const data = makeData();
    const before = JSON.stringify(data);
    const { data: out, report } = applyOverrides(
      data,
      entry({ id: 'TACKLE_FAST', set: { power: 15, damageKind: 'percentMaxHp' } }),
    );
    expect(out.moves['TACKLE_FAST']?.power).toBe(15);
    expect(out.moves['TACKLE_FAST']?.damageKind).toBe('percentMaxHp');
    expect(JSON.stringify(data)).toBe(before);
    expect(report.applied).toHaveLength(1);
  });
  it('add creates a move with id from the entry', () => {
    const { data: out, report } = applyOverrides(
      makeData(),
      entry({
        id: 'NEW_CHARGED',
        add: { type: 'beta', category: 'charged', power: 70, energy: 55, energyGain: 0, turns: 1 },
      }),
    );
    expect(out.moves['NEW_CHARGED']?.id).toBe('NEW_CHARGED');
    expect(out.moves['NEW_CHARGED']?.power).toBe(70);
    expect(report.applied).toHaveLength(1);
  });
  it('add creates a species and set patches one', () => {
    const entries = validateOverrides({
      species: [
        { id: 'new_mon', add: { ...makeSpecies('ignored'), fast: ['TACKLE_FAST'] }, ...base },
      ],
    });
    const { data: out } = applyOverrides(makeData(), entries);
    expect(out.species['new_mon']?.id).toBe('new_mon');
    expect(out.species['new_mon']?.fast).toEqual(['TACKLE_FAST']);
  });
  it('reports a redundant set', () => {
    const { data: out, report } = applyOverrides(
      makeData(),
      entry({ id: 'TACKLE_FAST', set: { power: 3 } }),
    );
    expect(report.redundant).toEqual([
      'overrides.yaml: moves[0] TACKLE_FAST is redundant: the datamine agrees; delete the entry',
    ]);
    expect(report.applied).toEqual([]);
    expect(out.moves['TACKLE_FAST']?.power).toBe(3);
  });
  it('reports a redundant add', () => {
    const data = makeData();
    data.moves['EXTRA_FAST'] = makeMove('EXTRA_FAST', { energyGain: 5 });
    const { report } = applyOverrides(
      data,
      entry({
        id: 'EXTRA_FAST',
        add: { type: 'alpha', category: 'fast', power: 3, energy: 0, energyGain: 5, turns: 1 },
      }),
    );
    expect(report.redundant).toEqual([
      'overrides.yaml: moves[0] EXTRA_FAST is redundant: the datamine agrees; delete the entry',
    ]);
  });
  it('reports a conflicting add and keeps the datamine entry', () => {
    const data = makeData();
    data.moves['EXTRA_FAST'] = makeMove('EXTRA_FAST', { energyGain: 5 });
    const { data: out, report } = applyOverrides(
      data,
      entry({
        id: 'EXTRA_FAST',
        add: { type: 'alpha', category: 'fast', power: 3, energy: 0, energyGain: 6, turns: 1 },
      }),
    );
    expect(report.conflicts).toEqual([
      'overrides.yaml: moves[0] adds EXTRA_FAST but the datamine now has it with different values (energyGain 6 vs 5); review the entry',
    ]);
    expect(out.moves['EXTRA_FAST']?.energyGain).toBe(5);
  });
  it('throws for a set on a missing id, using the in-list index', () => {
    const entries = validateOverrides({
      moves: [
        { id: 'TACKLE_FAST', set: { power: 9 }, ...base },
        { id: 'GULP_MISSILE_X', set: { power: 9 }, ...base },
      ],
    });
    expect(() => applyOverrides(makeData(), entries)).toThrow(
      'overrides.yaml: moves[1] set targets GULP_MISSILE_X, which is not in the datamine',
    );
  });
  it('does not treat prototype keys as present', () => {
    expect(() =>
      applyOverrides(makeData(), entry({ id: 'constructor', set: { power: 1 } })),
    ).toThrow('which is not in the datamine');
  });
  it('rejects a result that fails loadBattleData', () => {
    expect(() =>
      applyOverrides(makeData(), entry({ id: 'TACKLE_FAST', set: { type: 'nonesuch' } })),
    ).toThrow('battle data: moves.TACKLE_FAST.type nonesuch is not a type');
  });
});
