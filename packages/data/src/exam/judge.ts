import type { ScriptEntry } from '@pickthree/battle';
import type { ExamRun } from './run-ours.js';

// Grades the rules exam: our engine and PvPoke played the same script; compare their traces turn by
// turn (HP and energy, then length) and what each actually threw. A difference is either explained by
// an entry in packages/data/battle/differences.yaml or it fails the exam.

export interface Difference {
  id: string;
  behaviour: string;
  ours: string;
  pvpoke: string;
  evidence: string;
  scripts: string[];
}
export interface ScriptVerdict {
  id: string;
  status: 'match' | 'explained' | 'mismatch' | 'unexecuted';
  firstDiff: string | null;
  explainedBy: string | null;
}
export interface ExamResult {
  id: string;
  ours: ExamRun;
  pvpoke: ExamRun;
  script: ScriptEntry[];
}

const FILE = 'differences.yaml';
const TEXT_FIELDS = ['id', 'behaviour', 'ours', 'pvpoke', 'evidence'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates a parsed differences.yaml (`differences:` list). Empty or missing means none. */
export function validateDifferences(raw: unknown): Difference[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  if (!isRecord(raw)) {
    throw new Error(`${FILE}: top level must be a mapping`);
  }
  const items = raw['differences'];
  if (items === undefined || items === null) {
    return [];
  }
  if (!Array.isArray(items)) {
    throw new Error(`${FILE}: differences must be a list`);
  }
  const seen = new Set<string>();
  return items.map((item: unknown, i: number): Difference => {
    const where = `${FILE}: [${i}]`;
    if (!isRecord(item)) {
      throw new Error(`${where} must be a mapping`);
    }
    for (const field of TEXT_FIELDS) {
      const v = item[field];
      if (typeof v !== 'string' || v.trim() === '') {
        throw new Error(`${where}.${field} is required`);
      }
    }
    const scripts = item['scripts'];
    if (!Array.isArray(scripts) || scripts.length === 0) {
      throw new Error(`${where}.scripts must list at least one script id`);
    }
    scripts.forEach((s: unknown, n: number) => {
      if (typeof s !== 'string' || s === '') {
        throw new Error(`${where}.scripts[${n}] must be a script id`);
      }
    });
    const id = item['id'] as string;
    if (seen.has(id)) {
      throw new Error(`${where}.id ${id} is a duplicate`);
    }
    seen.add(id);
    return {
      id,
      behaviour: item['behaviour'] as string,
      ours: item['ours'] as string,
      pvpoke: item['pvpoke'] as string,
      evidence: item['evidence'] as string,
      scripts: [...(scripts as string[])],
    };
  });
}

/** The first turn where HP or energy differ ('turn 14: hp[1] ours 87 pvpoke 85'), else a length mismatch, else null. */
export function firstDifference(a: ExamRun, b: ExamRun): string | null {
  const shared = Math.min(a.trace.length, b.trace.length);
  for (let i = 0; i < shared; i += 1) {
    const x = a.trace[i];
    const y = b.trace[i];
    if (x === undefined || y === undefined) {
      break;
    }
    for (const field of ['hp', 'energy'] as const) {
      for (const side of [0, 1] as const) {
        if (x[field][side] !== y[field][side]) {
          return `turn ${x.turn}: ${field}[${side}] ours ${x[field][side]} pvpoke ${y[field][side]}`;
        }
      }
    }
  }
  if (a.trace.length !== b.trace.length) {
    return `length: ours ${a.trace.length} turns pvpoke ${b.trace.length} turns`;
  }
  return null;
}

function entryKey(e: ScriptEntry): string {
  return `${e.actor}@${e.turn}#${e.slot}`;
}

/** Null when both engines threw the same script entries, else a line saying how they differ. */
function executedDifference(script: readonly ScriptEntry[], a: ExamRun, b: ExamRun): string | null {
  const ours = new Set(a.executed.map(entryKey));
  const theirs = new Set(b.executed.map(entryKey));
  const onlyOurs = script
    .filter((e) => ours.has(entryKey(e)) && !theirs.has(entryKey(e)))
    .map(entryKey);
  const onlyTheirs = script
    .filter((e) => theirs.has(entryKey(e)) && !ours.has(entryKey(e)))
    .map(entryKey);
  if (onlyOurs.length === 0 && onlyTheirs.length === 0) {
    return null;
  }
  const parts: string[] = [];
  if (onlyOurs.length > 0) {
    parts.push(`only ours ${onlyOurs.join(' ')}`);
  }
  if (onlyTheirs.length > 0) {
    parts.push(`only pvpoke ${onlyTheirs.join(' ')}`);
  }
  return `executed: ${parts.join(', ')}`;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

/** Keeps a report line plain 7-bit ASCII. */
function ascii(s: string): string {
  return s.replace(/[^\x20-\x7e\n]/g, '?');
}

export function judge(
  results: ExamResult[],
  diffs: Difference[],
): { verdicts: ScriptVerdict[]; stale: string[]; report: string } {
  const ids = new Set(results.map((r) => r.id));
  const verdicts = results.map((r): ScriptVerdict => {
    const traceDiff = firstDifference(r.ours, r.pvpoke);
    const execDiff = executedDifference(r.script, r.ours, r.pvpoke);
    const explainers = diffs.filter((d) => d.scripts.includes(r.id)).map((d) => d.id);
    if (traceDiff === null && execDiff === null) {
      return { id: r.id, status: 'match', firstDiff: null, explainedBy: null };
    }
    // the trace difference is the more useful line; an executed difference names its own cause
    const firstDiff =
      execDiff !== null && traceDiff !== null
        ? `${execDiff}; ${traceDiff}`
        : (execDiff ?? traceDiff);
    if (explainers.length > 0) {
      return { id: r.id, status: 'explained', firstDiff, explainedBy: explainers.join(', ') };
    }
    return {
      id: r.id,
      status: execDiff !== null ? 'unexecuted' : 'mismatch',
      firstDiff,
      explainedBy: null,
    };
  });

  const matched = new Set(verdicts.filter((v) => v.status === 'match').map((v) => v.id));
  const stale: string[] = [];
  for (const d of diffs) {
    for (const s of d.scripts) {
      if (!ids.has(s)) {
        stale.push(`${d.id}: ${s} is not an exam script`);
      } else if (matched.has(s)) {
        stale.push(`${d.id}: ${s} now matches`);
      }
    }
  }

  const idWidth = Math.max(6, ...verdicts.map((v) => v.id.length));
  const statusWidth = 10;
  const lines: string[] = [];
  lines.push(`${pad('script', idWidth)}  ${pad('status', statusWidth)}  first difference`);
  lines.push(`${'-'.repeat(idWidth)}  ${'-'.repeat(statusWidth)}  ${'-'.repeat(16)}`);
  for (const v of verdicts) {
    const detail =
      v.firstDiff === null
        ? ''
        : v.explainedBy === null
          ? v.firstDiff
          : `${v.firstDiff} [${v.explainedBy}]`;
    lines.push(`${pad(v.id, idWidth)}  ${pad(v.status, statusWidth)}  ${detail}`.trimEnd());
  }
  lines.push('');
  lines.push(stale.length === 0 ? 'stale: none' : 'stale:');
  for (const s of stale) {
    lines.push(`  ${s}`);
  }
  const notes = results.flatMap((r) => [
    ...r.ours.notes.map((n) => `  ${r.id} (ours): ${n}`),
    ...r.pvpoke.notes.map((n) => `  ${r.id} (pvpoke): ${n}`),
  ]);
  if (notes.length > 0) {
    lines.push('notes:');
    lines.push(...notes);
  }
  return { verdicts, stale, report: ascii(lines.join('\n')) };
}
