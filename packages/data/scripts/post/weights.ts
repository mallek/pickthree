/**
 * What the strength number is measured against: pick3's community meta blend of PvPoke's prior,
 * tournament picks and shared ladder battles, computed the way the pick3 Meta pages do (engine meta/community.ts).
 */
import { runsOf, type ScheduleEntry } from '@pickthree/engine';
import {
  communityWeights,
  ranksOf,
  type ApiWindow,
  type CommunitySummary,
} from '@pickthree/engine/meta';
import { getJson, type CupData, type Fetcher } from './data.js';

// The counter worker origin (apps/web/src/counter.ts COUNTER_ORIGIN); meta.pick3.gg only redirects.
export const API_BASE = 'https://pickthree-counter.travis-c82.workers.dev';

export interface MetaSummary extends CommunitySummary {
  battles: number;
  devices: number;
}

export async function fetchSummary(
  leagueId: string,
  w: ApiWindow,
  fetcher: Fetcher = fetch,
): Promise<MetaSummary> {
  const q = new URLSearchParams({ league: leagueId, since: w.since, until: w.until });
  try {
    return await getJson<MetaSummary>(`${API_BASE}/api/v1/meta?${q.toString()}`, fetcher);
  } catch (err) {
    throw new Error(
      `${(err as Error).message}. The meta read failed; rerun with --prior to use PvPoke's meta alone.`,
      { cause: err },
    );
  }
}

export function blendedWeights(
  summary: CommunitySummary,
  data: Pick<CupData, 'group' | 'rankings' | 'banned'>,
): Map<string, number> {
  return communityWeights(summary, {
    source: 'all',
    group: data.group,
    rankOrder: ranksOf(data.rankings.overall),
    banned: new Set(data.banned),
  }).weights;
}

export type WeightMix = { kind: 'prior' } | { kind: 'blend'; battles: number; events: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 30, 2026", UTC. */
export function formatDay(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function short(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]!.toUpperCase()} ${d.getUTCDate()}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** The source line's second line: what the weights were made of, and the run date. */
export function mixLine(mix: WeightMix, day: Date): string {
  const parts = ['PvPoke meta'];
  if (mix.kind === 'blend') {
    if (mix.battles > 0) {
      parts.push(plural(mix.battles, 'shared battle', 'shared battles'));
    }
    if (mix.events > 0) {
      parts.push(plural(mix.events, 'event', 'events'));
    }
  }
  const what = parts.length === 1 ? 'PvPoke meta only' : parts.join(' + ');
  return `${what} - ${formatDay(day)}`;
}

/**
 * The corner label: the run containing now ("LIVE SEP 22 - OCT 6"), else the next run
 * ("STARTS OCT 6 - OCT 13"), else "UPDATED <today>". Dates are UTC; a run's end is exclusive at
 * 20:00 UTC, so its end date is the last day it is live.
 */
export function runLabel(schedule: readonly ScheduleEntry[], leagueId: string, now: Date): string {
  const t = now.getTime();
  for (const r of runsOf(schedule, leagueId)) {
    const start = new Date(r.start);
    const end = new Date(r.end);
    if (t >= start.getTime() && t < end.getTime()) {
      return `LIVE ${short(start)} - ${short(end)}`;
    }
    if (t < start.getTime()) {
      return `STARTS ${short(start)} - ${short(end)}`;
    }
  }
  return `UPDATED ${short(now)}`;
}
