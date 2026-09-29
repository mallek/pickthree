import fs from 'node:fs';
import path from 'node:path';
import type { ScheduleEntry } from '@pickthree/engine';
import { DATA_PACKAGE_DIR } from './paths.js';

export const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';
export const ALIASES_PATH = path.join(DATA_PACKAGE_DIR, 'cup-aliases.json');

/** One ScrapedDuck event, trimmed to what the parser reads. */
export interface FeedEvent {
  name: string;
  eventType: string;
  start: string;
  end: string;
}

/** A feed cup title mapped to a PvPoke cup; `cp` for a cup whose name carries no edition. */
export interface CupAlias {
  cup: string;
  cp?: number;
  note?: string;
}

export interface ParsedFeed {
  entries: ScheduleEntry[];
  /** Formats left out because they need mega support, as the feed names them. */
  skippedMega: string[];
  /** Cup titles with no alias, each once. */
  unmapped: string[];
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
  const skippedMega = new Set<string>();
  const unmapped = new Set<string>();
  const seasonStart = new Map<string, string>();
  for (const ev of events) {
    if (ev.eventType !== 'go-battle-league') {
      continue;
    }
    const [formatsPart, seasonPart] = ev.name.split(' | ');
    const season = (seasonPart ?? '').trim();
    const start = iso(ev.start);
    const end = iso(ev.end);
    if (season) {
      const prev = seasonStart.get(season);
      if (!prev || Date.parse(start) < Date.parse(prev)) {
        seasonStart.set(season, start);
      }
    }
    for (const format of splitFormats(formatsPart ?? '')) {
      if (OPEN.has(format)) {
        continue;
      }
      if (format.includes('Mega')) {
        skippedMega.add(format);
        continue;
      }
      const [titlePart, editionPart] = format.split(': ');
      const title = (titlePart ?? '').trim();
      const edition = editionPart ? EDITIONS[editionPart.trim()] : undefined;
      const alias = aliases[title];
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
        league: `${alias.cup}${suffix}`,
        cup: alias.cup,
        cp,
        title,
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
    skippedMega: [...skippedMega],
    unmapped: [...unmapped],
    seasons: [...seasonStart]
      .map(([name, start]) => ({ name, start }))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
  };
}
