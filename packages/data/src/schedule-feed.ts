import fs from 'node:fs';
import path from 'node:path';
import type { ScheduleEntry } from '@pickthree/engine';
import { DATA_PACKAGE_DIR } from './paths.js';

export const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';
export const ALIASES_PATH = path.join(DATA_PACKAGE_DIR, 'cup-aliases.json');
export const SCHEDULE_PATH = path.join(DATA_PACKAGE_DIR, 'schedule.json');

/** One ScrapedDuck event, trimmed to what the parser reads. */
export interface FeedEvent {
  name: string;
  eventType: string;
  start: string;
  end: string;
}

/**
 * A feed cup title (or a whole format text such as "Great League: Mega Edition") mapped to a
 * PvPoke cup; `cp` for a cup whose name carries no edition, `id` to set the pick3 league id
 * instead of deriving it from the cup and edition.
 */
export interface CupAlias {
  cup: string;
  cp?: number;
  id?: string;
  note?: string;
}

export interface ParsedFeed {
  entries: ScheduleEntry[];
  /** Cup titles with no alias, each once. */
  unmapped: string[];
  /** GBL events skipped because their name carries no " | Season" part, as the feed names them. */
  noSeason: string[];
  /** Season names in the feed with their earliest GBL week start, oldest first. */
  seasons: { name: string; start: string }[];
}

const OPEN = new Set(['Great League', 'Ultra League', 'Master League']);
const EDITIONS: Record<string, { cp: number; suffix: string }> = {
  'Great League Edition': { cp: 1500, suffix: '' },
  'Ultra League Edition': { cp: 2500, suffix: '-ultra' },
  'Master League Edition': { cp: 10000, suffix: '-master' },
};

export function readAliases(file: string = ALIASES_PATH): Record<string, CupAlias> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, CupAlias>;
}

/** "A, B: Mega Edition, and C: Great League Edition" to its formats. */
function splitFormats(formats: string): string[] {
  return formats
    .split(/, and |, | and /)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

function iso(t: string): string {
  return new Date(t).toISOString();
}

export function parseFeed(
  events: readonly FeedEvent[],
  aliases: Record<string, CupAlias>,
): ParsedFeed {
  const entries: ScheduleEntry[] = [];
  const unmapped = new Set<string>();
  const noSeason: string[] = [];
  const seasonStart = new Map<string, string>();
  for (const ev of events) {
    if (ev.eventType !== 'go-battle-league') {
      continue;
    }
    const [formatsPart, seasonPart] = ev.name.split(' | ');
    const season = (seasonPart ?? '').trim();
    if (!season) {
      noSeason.push(ev.name);
      continue;
    }
    const start = iso(ev.start);
    const end = iso(ev.end);
    const prev = seasonStart.get(season);
    if (!prev || Date.parse(start) < Date.parse(prev)) {
      seasonStart.set(season, start);
    }
    for (const format of splitFormats(formatsPart ?? '')) {
      if (OPEN.has(format)) {
        continue;
      }
      const [titlePart, editionPart] = format.split(': ');
      const title = (titlePart ?? '').trim();
      const edition = editionPart ? EDITIONS[editionPart.trim()] : undefined;
      // The whole format text first ("Great League: Mega Edition" names a league by itself),
      // then the cup title.
      const whole = aliases[format];
      const alias = whole ?? aliases[title];
      if (!alias) {
        unmapped.add(title);
        continue;
      }
      const cp = alias.cp ?? edition?.cp;
      if (cp === undefined) {
        unmapped.add(title);
        continue;
      }
      const suffix = alias.cp === undefined ? (edition?.suffix ?? '') : '';
      entries.push({
        league: alias.id ?? `${alias.cup}${suffix}`,
        cup: alias.cup,
        cp,
        title: whole ? format : title,
        ...(format.includes('Mega') ? { mega: true } : {}),
        start,
        end,
        season,
      });
    }
  }
  entries.sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.league.localeCompare(b.league),
  );
  return {
    entries,
    unmapped: [...unmapped],
    noSeason,
    seasons: [...seasonStart]
      .map(([name, start]) => ({ name, start }))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
  };
}

const key = (e: ScheduleEntry): string => `${e.league}|${e.start}`;

/**
 * The feed decides every week that has not ended. Ended weeks stay until a newer season has
 * started, so a run that began before the feed dropped its first week keeps its start.
 */
export function mergeSchedule(
  existing: readonly ScheduleEntry[],
  fresh: readonly ScheduleEntry[],
  now: Date,
): ScheduleEntry[] {
  const t = now.getTime();
  const byKey = new Map<string, ScheduleEntry>();
  for (const e of existing) {
    if (Date.parse(e.end) <= t) {
      byKey.set(key(e), e);
    }
  }
  for (const e of fresh) {
    byKey.set(key(e), e);
  }
  const all = [...byKey.values()].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.league.localeCompare(b.league),
  );
  const started = all.filter((e) => Date.parse(e.start) <= t);
  const currentSeason = started[started.length - 1]?.season;
  if (currentSeason === undefined) {
    return all;
  }
  const currentStart = Math.min(
    ...all.filter((e) => e.season === currentSeason).map((e) => Date.parse(e.start)),
  );
  return all.filter((e) => e.season === currentSeason || Date.parse(e.start) > currentStart);
}

export function readSchedule(file: string = SCHEDULE_PATH): ScheduleEntry[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${file}: expected an array`);
  }
  return raw.map((x, i) => {
    const e = x as Partial<ScheduleEntry>;
    for (const f of ['league', 'cup', 'title', 'start', 'end', 'season'] as const) {
      if (typeof e[f] !== 'string' || e[f] === '') {
        throw new Error(`${file}: entry ${i} needs ${f}`);
      }
    }
    if (
      typeof e.cp !== 'number' ||
      Number.isNaN(Date.parse(e.start!)) ||
      Number.isNaN(Date.parse(e.end!))
    ) {
      throw new Error(`${file}: entry ${i} needs a numeric cp and ISO start and end`);
    }
    return e as ScheduleEntry;
  });
}

export function writeSchedule(
  entries: readonly ScheduleEntry[],
  file: string = SCHEDULE_PATH,
): void {
  fs.writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
}
