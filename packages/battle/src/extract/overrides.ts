import { loadBattleData } from '../data/load.js';
import type { BattleData } from '../data/types.js';

export interface OverrideEntry {
  kind: 'move' | 'species';
  id: string;
  add?: Record<string, unknown>;
  set?: Record<string, unknown>;
  source: string;
  entered: string; // YYYY-MM-DD
}

export interface OverrideReport {
  applied: string[];
  redundant: string[];
  conflicts: string[];
}

const FILE = 'overrides.yaml';
const LISTS = [
  ['moves', 'move'],
  ['species', 'species'],
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m === null) {
    return false;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function validateOverrides(raw: unknown): OverrideEntry[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  if (!isRecord(raw)) {
    throw new Error(`${FILE}: top level must be a mapping`);
  }
  const out: OverrideEntry[] = [];
  for (const [list, kind] of LISTS) {
    const items: unknown = raw[list];
    if (items === undefined || items === null) {
      continue;
    }
    if (!Array.isArray(items)) {
      throw new Error(`${FILE}: ${list} must be a list`);
    }
    items.forEach((item: unknown, i: number) => {
      const where = `${FILE}: ${list}[${i}]`;
      if (!isRecord(item)) {
        throw new Error(`${where} must be a mapping`);
      }
      const id = item['id'];
      if (typeof id !== 'string' || id === '') {
        throw new Error(`${where}.id is required`);
      }
      const source = item['source'];
      if (typeof source !== 'string' || source.trim() === '') {
        throw new Error(`${where}.source is required`);
      }
      const entered = item['entered'];
      if (typeof entered !== 'string' || !validDate(entered)) {
        throw new Error(`${where}.entered "${String(entered)}" must be YYYY-MM-DD`);
      }
      const hasAdd = item['add'] !== undefined;
      const hasSet = item['set'] !== undefined;
      if (hasAdd === hasSet) {
        throw new Error(`${where} must have exactly one of add or set`);
      }
      const body = hasAdd ? item['add'] : item['set'];
      if (!isRecord(body)) {
        throw new Error(`${where}.${hasAdd ? 'add' : 'set'} must be a mapping`);
      }
      const entry: OverrideEntry = { kind, id, source, entered };
      if (hasAdd) {
        entry.add = body;
      } else {
        entry.set = body;
      }
      out.push(entry);
    });
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => deepEqual(v, b[i]))
    );
  }
  if (isRecord(a) && isRecord(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function fmt(v: unknown): string {
  return v === undefined ? 'undefined' : JSON.stringify(v);
}

function diffs(fields: Record<string, unknown>, existing: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'id') {
      continue;
    }
    const cur = Object.hasOwn(existing, k) ? existing[k] : undefined;
    if (!deepEqual(v, cur)) {
      out.push(`${k} ${fmt(v)} vs ${fmt(cur)}`);
    }
  }
  return out;
}

export function applyOverrides(
  data: BattleData,
  entries: readonly OverrideEntry[],
): { data: BattleData; report: OverrideReport } {
  const copy = JSON.parse(JSON.stringify(data)) as BattleData;
  const report: OverrideReport = { applied: [], redundant: [], conflicts: [] };
  const counters = { move: 0, species: 0 };
  for (const entry of entries) {
    const index = counters[entry.kind]++;
    const list = entry.kind === 'move' ? 'moves' : 'species';
    const where = `${FILE}: ${list}[${index}]`;
    const table = (entry.kind === 'move' ? copy.moves : copy.species) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    const existing = Object.hasOwn(table, entry.id) ? table[entry.id] : undefined;
    if (entry.set !== undefined) {
      if (existing === undefined) {
        throw new Error(`${where} set targets ${entry.id}, which is not in the datamine`);
      }
      if (diffs(entry.set, existing).length === 0) {
        report.redundant.push(
          `${where} ${entry.id} is redundant: the datamine agrees; delete the entry`,
        );
        continue;
      }
      for (const [k, v] of Object.entries(entry.set)) {
        existing[k] = v;
      }
      report.applied.push(`${where} set ${entry.id}`);
    } else if (entry.add !== undefined) {
      if (existing === undefined) {
        table[entry.id] = { ...entry.add, id: entry.id };
        report.applied.push(`${where} added ${entry.id}`);
        continue;
      }
      const d = diffs(entry.add, existing);
      if (d.length === 0) {
        report.redundant.push(
          `${where} ${entry.id} is redundant: the datamine agrees; delete the entry`,
        );
      } else {
        report.conflicts.push(
          `${where} adds ${entry.id} but the datamine now has it with different values (${d.join(', ')}); review the entry`,
        );
      }
    }
  }
  return { data: loadBattleData(copy), report };
}
