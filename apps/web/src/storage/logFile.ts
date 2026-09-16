import type { BattleSet, LoggedBattle } from '@pickthree/engine';

export const LOG_FILE_VERSION = 1;

interface LogFile {
  app: 'pick3';
  kind: 'battle-log';
  version: number;
  exportedAt: string;
  sets: BattleSet[];
}

export function serializeLog(sets: BattleSet[]): string {
  const file: LogFile = {
    app: 'pick3',
    kind: 'battle-log',
    version: LOG_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    sets,
  };
  return JSON.stringify(file, null, 2);
}

function isBattle(x: unknown): x is LoggedBattle {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  const b = x as Partial<LoggedBattle>;
  return (
    typeof b.id === 'string' &&
    typeof b.at === 'string' &&
    Array.isArray(b.opponents) &&
    b.opponents.every((o) => typeof o === 'string') &&
    (b.result === 'win' || b.result === 'loss' || b.result === null) &&
    typeof b.tanked === 'boolean'
  );
}

function isSet(x: unknown): x is BattleSet {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  const s = x as Partial<BattleSet>;
  return (
    typeof s.id === 'string' &&
    typeof s.league === 'string' &&
    typeof s.startedAt === 'string' &&
    typeof s.team === 'object' &&
    s.team !== null &&
    Array.isArray(s.team.species) &&
    s.team.species.length === 3 &&
    Array.isArray(s.battles) &&
    s.battles.every(isBattle) &&
    typeof s.closed === 'boolean'
  );
}

/** Parses an exported log. Throws a sentence the UI can show as is. */
export function parseLogFile(text: string): BattleSet[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not a pick3 battle log.');
  }
  const f = raw as Partial<LogFile>;
  if (typeof f !== 'object' || f === null || f.app !== 'pick3' || f.kind !== 'battle-log') {
    throw new Error('That file is not a pick3 battle log.');
  }
  if (typeof f.version !== 'number' || f.version > LOG_FILE_VERSION) {
    throw new Error('This battle log comes from a newer pick3. Update the app and try again.');
  }
  if (!Array.isArray(f.sets)) {
    throw new Error('That file is not a pick3 battle log.');
  }
  return f.sets.filter(isSet);
}
