import { describe, expect, it } from 'vitest';
import type { ScriptEntry } from '@pickthree/battle';
import {
  firstDifference,
  judge,
  validateDifferences,
  type Difference,
} from '../../src/exam/judge.js';
import type { ExamRun, ExamTurn } from '../../src/exam/run-ours.js';

// Synthetic runs only: the judge compares two traces, so made-up numbers are enough.

function turn(n: number, hp: [number, number], energy: [number, number]): ExamTurn {
  return { turn: n, hp, energy, forms: ['a', 'b'] };
}

function run(trace: ExamTurn[], executed: ScriptEntry[] = [], notes: string[] = []): ExamRun {
  return { trace, executed, notes };
}

const ENTRY: ScriptEntry = { actor: 0, turn: 2, slot: 0, shielded: false };
const BASE: ExamTurn[] = [
  turn(1, [100, 100], [3, 4]),
  turn(2, [90, 80], [6, 8]),
  turn(3, [80, 0], [9, 12]),
];

function difference(id: string, scripts: [string, string][]): Difference {
  return {
    id,
    behaviour: 'b',
    ours: 'o',
    pvpoke: 'p',
    evidence: 'e',
    scripts: scripts.map(([script, first]) => ({ id: script, first })),
  };
}

describe('firstDifference', () => {
  it('is null for identical traces', () => {
    expect(firstDifference(run(BASE), run(BASE))).toBeNull();
  });

  it('names the first differing turn, field and both values', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8]), turn(3, [70, 0], [9, 12])];
    expect(firstDifference(run(BASE), run(other))).toBe('turn 2: hp[1] ours 80 pvpoke 78');
  });

  it('compares energy too', () => {
    const other = [turn(1, [100, 100], [4, 4]), ...BASE.slice(1)];
    expect(firstDifference(run(BASE), run(other))).toBe('turn 1: energy[0] ours 3 pvpoke 4');
  });

  it('reports turn numbering that differs before comparing numbers', () => {
    const other = [BASE[0] as ExamTurn, { ...(BASE[1] as ExamTurn), turn: 3 }, BASE[2] as ExamTurn];
    expect(firstDifference(run(BASE), run(other))).toBe(
      'turn numbering differs at record 2: ours 2 pvpoke 3',
    );
  });

  it('compares forms after hp and energy', () => {
    const other = [
      BASE[0] as ExamTurn,
      { ...(BASE[1] as ExamTurn), forms: ['a', 'c'] as [string, string] },
      BASE[2] as ExamTurn,
    ];
    expect(firstDifference(run(BASE), run(other))).toBe('turn 2: forms[1] ours b pvpoke c');
  });

  it('reports a length mismatch when the shared turns agree', () => {
    expect(firstDifference(run(BASE), run(BASE.slice(0, 2)))).toBe(
      'length: ours 3 turns pvpoke 2 turns',
    );
  });
});

describe('judge', () => {
  it('a script whose traces agree is a match', () => {
    const { verdicts, stale } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(BASE), script: [] }],
      [],
    );
    expect(verdicts).toEqual([{ id: 's1', status: 'match', firstDiff: null, explainedBy: null }]);
    expect(stale).toEqual([]);
  });

  it('a script whose traces differ is a mismatch with the first difference', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8]), turn(3, [70, 0], [9, 12])];
    const { verdicts, report } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(other), script: [] }],
      [],
    );
    expect(verdicts).toEqual([
      {
        id: 's1',
        status: 'mismatch',
        firstDiff: 'turn 2: hp[1] ours 80 pvpoke 78',
        explainedBy: null,
      },
    ]);
    expect(report).toContain('s1');
    expect(report).toContain('mismatch');
    expect(report).toContain('turn 2: hp[1] ours 80 pvpoke 78');
  });

  it('a differing script listed by a difference is explained', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8]), turn(3, [70, 0], [9, 12])];
    const { verdicts, stale } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(other), script: [] }],
      [difference('d1', [['s1', 'hp[1]']])],
    );
    expect(verdicts).toEqual([
      {
        id: 's1',
        status: 'explained',
        firstDiff: 'turn 2: hp[1] ours 80 pvpoke 78',
        explainedBy: 'd1',
      },
    ]);
    expect(stale).toEqual([]);
  });

  it('a script the two engines executed differently is unexecuted', () => {
    const { verdicts } = judge(
      [{ id: 's1', ours: run(BASE, []), pvpoke: run(BASE, [ENTRY]), script: [ENTRY] }],
      [],
    );
    expect(verdicts[0]?.status).toBe('unexecuted');
    expect(verdicts[0]?.firstDiff).toContain('executed');
  });

  it('an entry neither engine executed is not unexecuted when both agree', () => {
    const { verdicts } = judge(
      [{ id: 's1', ours: run(BASE, []), pvpoke: run(BASE, []), script: [ENTRY] }],
      [],
    );
    expect(verdicts[0]?.status).toBe('match');
  });

  it('an unexecuted script listed by a difference is explained', () => {
    const { verdicts } = judge(
      [{ id: 's1', ours: run(BASE, []), pvpoke: run(BASE, [ENTRY]), script: [ENTRY] }],
      [difference('d1', [['s1', 'executed']])],
    );
    expect(verdicts[0]?.status).toBe('explained');
    expect(verdicts[0]?.explainedBy).toBe('d1');
  });

  it('a listed script whose first difference is not the one the entry names is a mismatch', () => {
    // energy[0] differs on turn 1, before the hp[1] difference d1 explains
    const other = [
      turn(1, [100, 100], [4, 4]),
      turn(2, [90, 78], [6, 8]),
      turn(3, [70, 0], [9, 12]),
    ];
    const { verdicts, report } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(other), script: [] }],
      [difference('d1', [['s1', 'hp[1]']])],
    );
    expect(verdicts[0]?.status).toBe('mismatch');
    expect(verdicts[0]?.explainedBy).toBeNull();
    expect(report).toContain('expected hp[1] (d1)');
  });

  it('the side is part of the first difference', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8]), turn(3, [70, 0], [9, 12])];
    const { verdicts } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(other), script: [] }],
      [difference('d1', [['s1', 'hp[0]']])],
    );
    expect(verdicts[0]?.status).toBe('mismatch');
  });

  it('a later entry rides along with the entry that explains the first difference', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8]), turn(3, [70, 0], [9, 12])];
    const { verdicts } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(other), script: [] }],
      [difference('d1', [['s1', 'hp[1]']]), difference('d2', [['s1', 'later']])],
    );
    expect(verdicts[0]).toMatchObject({ status: 'explained', explainedBy: 'd1, d2' });
  });

  it('a later entry alone explains nothing', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8]), turn(3, [70, 0], [9, 12])];
    const { verdicts } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(other), script: [] }],
      [difference('d2', [['s1', 'later']])],
    );
    expect(verdicts[0]?.status).toBe('mismatch');
  });

  it('a trace difference names the first difference even when the executed sets differ too', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8]), turn(3, [70, 0], [9, 12])];
    const { verdicts } = judge(
      [{ id: 's1', ours: run(BASE, []), pvpoke: run(other, [ENTRY]), script: [ENTRY] }],
      [difference('d1', [['s1', 'hp[1]']])],
    );
    expect(verdicts[0]?.status).toBe('explained');
  });

  it('a difference listing a script that now matches is stale', () => {
    const { verdicts, stale, report } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(BASE), script: [] }],
      [difference('d1', [['s1', 'hp[1]']])],
    );
    expect(verdicts[0]?.status).toBe('match');
    expect(stale).toEqual(['d1: s1 now matches']);
    expect(report).toContain('d1: s1 now matches');
  });

  it('a difference listing a script the exam does not have is stale', () => {
    const { stale } = judge(
      [{ id: 's1', ours: run(BASE), pvpoke: run(BASE), script: [] }],
      [difference('d1', [['gone', 'hp[1]']])],
    );
    expect(stale).toEqual(['d1: gone is not an exam script']);
  });

  it('a documentation entry (no scripts) is never stale and explains nothing', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8]), turn(3, [70, 0], [9, 12])];
    const { verdicts, stale } = judge(
      [
        { id: 's1', ours: run(BASE), pvpoke: run(BASE), script: [] },
        { id: 's2', ours: run(BASE), pvpoke: run(other), script: [] },
      ],
      [difference('doc', []), difference('d1', [['s1', 'hp[1]']])],
    );
    expect(verdicts.map((v) => v.status)).toEqual(['match', 'mismatch']);
    expect(stale).toEqual(['d1: s1 now matches']);
  });

  it('the report carries the runs notes', () => {
    const { report } = judge(
      [
        {
          id: 's1',
          ours: run(BASE, [], ['ours said this']),
          pvpoke: run(BASE, [], ['pvpoke said that']),
          script: [],
        },
      ],
      [],
    );
    expect(report).toContain('ours said this');
    expect(report).toContain('pvpoke said that');
  });

  it('the report is plain ASCII', () => {
    const other = [BASE[0] as ExamTurn, turn(2, [90, 78], [6, 8])];
    const { report } = judge(
      [
        { id: 's1', ours: run(BASE), pvpoke: run(other), script: [] },
        { id: 's2', ours: run(BASE), pvpoke: run(BASE), script: [] },
      ],
      [difference('d1', [['s2', 'hp[1]']])],
    );
    expect(/^[\x20-\x7e\n]*$/.test(report)).toBe(true);
  });
});

describe('validateDifferences', () => {
  const good = {
    differences: [
      {
        id: 'cmp-tie-ko',
        behaviour: 'b',
        ours: 'o',
        pvpoke: 'p',
        evidence: 'e',
        scripts: [{ id: 's1', first: 'hp[1]' }],
      },
    ],
  };

  it('accepts a well-formed file', () => {
    expect(validateDifferences(good)).toEqual(good.differences);
  });

  it('accepts an empty file as no differences', () => {
    expect(validateDifferences(null)).toEqual([]);
  });

  it('rejects a missing evidence', () => {
    const raw = {
      differences: [
        good.differences[0],
        { ...good.differences[0], id: 'y' },
        {
          id: 'x',
          behaviour: 'b',
          ours: 'o',
          pvpoke: 'p',
          scripts: [{ id: 's1', first: 'hp[1]' }],
        },
      ],
    };
    expect(() => validateDifferences(raw)).toThrow('differences.yaml: [2].evidence is required');
  });

  it('accepts a documentation entry: scripts is an empty list', () => {
    const doc = { ...good.differences[0], id: 'doc', scripts: [] };
    expect(validateDifferences({ differences: [doc] })).toEqual([doc]);
  });

  it('rejects a documentation entry without evidence', () => {
    const doc: Record<string, unknown> = { ...good.differences[0], scripts: [] };
    delete doc['evidence'];
    expect(() => validateDifferences({ differences: [doc] })).toThrow(
      'differences.yaml: [0].evidence is required',
    );
  });

  it('rejects a blank field, a missing scripts list and a duplicate id', () => {
    const entry = good.differences[0] as Record<string, unknown>;
    expect(() => validateDifferences({ differences: [{ ...entry, ours: '  ' }] })).toThrow(
      'differences.yaml: [0].ours is required',
    );
    const noScripts: Record<string, unknown> = { ...entry };
    delete noScripts['scripts'];
    for (const bad of [noScripts, { ...entry, scripts: 's1' }]) {
      expect(() => validateDifferences({ differences: [bad] })).toThrow(
        'differences.yaml: [0].scripts must be a list (empty for a difference the exam does not exercise)',
      );
    }
    expect(() => validateDifferences({ differences: [entry, entry] })).toThrow(
      'differences.yaml: [1].id cmp-tie-ko is a duplicate',
    );
  });

  it('rejects a script listing without an id or with an unknown first difference', () => {
    const entry = good.differences[0] as Record<string, unknown>;
    expect(() => validateDifferences({ differences: [{ ...entry, scripts: ['s1'] }] })).toThrow(
      'differences.yaml: [0].scripts[0] must be { id, first }',
    );
    for (const first of ['hp', 'hp[2]', 'speed[0]', '']) {
      expect(() =>
        validateDifferences({ differences: [{ ...entry, scripts: [{ id: 's1', first }] }] }),
      ).toThrow(
        'differences.yaml: [0].scripts[0].first must be hp[0|1], energy[0|1], forms[0|1], executed, length, turn or later',
      );
    }
  });
});
