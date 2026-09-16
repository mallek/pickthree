import type { BattleSet } from '@pickthree/engine';
import { describe, expect, it } from 'vitest';
import { LOG_FILE_VERSION, parseLogFile, serializeLog } from '../src/storage/logFile.ts';

const sets: BattleSet[] = [
  {
    id: 'a',
    league: 'great',
    startedAt: '2026-09-10T10:00:00Z',
    team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
    battles: [
      {
        id: 'b1',
        at: '2026-09-10T10:05:00Z',
        opponents: ['medicham'],
        result: 'win',
        tanked: false,
      },
    ],
    closed: false,
  },
];

describe('log file', () => {
  it('round trips', () => {
    const text = serializeLog(sets);
    const parsed = JSON.parse(text) as { app: string; kind: string; version: number };
    expect(parsed.app).toBe('pick3');
    expect(parsed.kind).toBe('battle-log');
    expect(parsed.version).toBe(LOG_FILE_VERSION);
    expect(parseLogFile(text)).toEqual(sets);
  });

  it('refuses other files with a plain sentence', () => {
    expect(() => parseLogFile('Name,CP\nTinkaton,1500')).toThrow(
      'That file is not a pick3 battle log.',
    );
    expect(() =>
      parseLogFile(JSON.stringify({ app: 'other', kind: 'battle-log', version: 1, sets: [] })),
    ).toThrow('That file is not a pick3 battle log.');
    expect(() =>
      parseLogFile(JSON.stringify({ app: 'pick3', kind: 'battle-log', version: 99, sets: [] })),
    ).toThrow('This battle log comes from a newer pick3. Update the app and try again.');
  });

  it('drops malformed sets instead of failing the whole file', () => {
    const text = JSON.stringify({
      app: 'pick3',
      kind: 'battle-log',
      version: 1,
      sets: [sets[0], { id: 'bad' }],
    });
    expect(parseLogFile(text)).toEqual(sets);
  });
});
