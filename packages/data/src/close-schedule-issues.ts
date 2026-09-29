/**
 * Decisions the daily job's Warnings step makes from the schedule:check output. Kept pure so the
 * close rule is tested: an open issue closes only when it is no longer warned AND the check could
 * judge its kind that day.
 */
import type { Warning } from './check-schedule.js';

export interface CheckOutput {
  warnings: Warning[];
  judged: { feed: boolean; rankings: boolean };
}

export interface OpenIssue {
  number: number;
  title: string;
}

/** Parse and validate the schedule:check output; throws on anything that cannot be trusted. */
export function parseCheckOutput(text: string): CheckOutput {
  if (text.trim() === '') {
    throw new Error('schedule:check printed nothing');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('schedule:check output is not JSON');
  }
  const v = value as {
    warnings?: unknown;
    judged?: { feed?: unknown; rankings?: unknown } | null;
  } | null;
  if (typeof v !== 'object' || v === null || !Array.isArray(v.warnings)) {
    throw new Error('schedule:check output has no warnings array');
  }
  if (
    typeof v.judged !== 'object' ||
    v.judged === null ||
    typeof v.judged.feed !== 'boolean' ||
    typeof v.judged.rankings !== 'boolean'
  ) {
    throw new Error('schedule:check output has no judged.feed and judged.rankings booleans');
  }
  for (const w of v.warnings) {
    const x = w as { title?: unknown; body?: unknown } | null;
    if (
      typeof x !== 'object' ||
      x === null ||
      typeof x.title !== 'string' ||
      typeof x.body !== 'string'
    ) {
      throw new Error('schedule:check output has a warning without a title and body');
    }
  }
  return { warnings: v.warnings as Warning[], judged: v.judged as CheckOutput['judged'] };
}

type Kind = 'feed' | 'rankings' | null;

function kindOf(title: string): Kind {
  if (title.startsWith('Map GBL cup ') || title.startsWith('GBL feed week without a season: ')) {
    return 'feed';
  }
  if (
    title.includes(' with no PvPoke rankings at ') ||
    title.includes(' on stale PvPoke rankings')
  ) {
    return 'rankings';
  }
  return null;
}

/** Numbers of the open issues to close. Unrecognized titles and the feed-failing issue never. */
export function closableIssues(check: CheckOutput, open: OpenIssue[]): number[] {
  const warned = new Set(check.warnings.map((w) => w.title));
  const out: number[] = [];
  for (const issue of open) {
    const kind = kindOf(issue.title);
    if (kind !== null && check.judged[kind] && !warned.has(issue.title)) {
      out.push(issue.number);
    }
  }
  return out;
}
