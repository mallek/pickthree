/**
 * Pull the GBL feed, rewrite schedule.json and seasons.json, and leave a report for the daily
 * job. Exit 0 all mapped, 3 written with unmapped cups, 4 feed unusable (nothing written).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_PACKAGE_DIR } from './paths.js';
import {
  FEED_URL,
  mergeSchedule,
  parseFeed,
  readAliases,
  readSchedule,
  writeSchedule,
  type FeedEvent,
} from './schedule-feed.js';
import { mergeSeasons, readSeasons, writeSeasons } from './seasons.js';

const REPORT = path.join(DATA_PACKAGE_DIR, '.cache', 'schedule-report.json');

function report(r: {
  ok: boolean;
  unmapped: string[];
  skippedMega: string[];
  noSeason: string[];
  error: string | null;
}): void {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(r, null, 2)}\n`);
}

async function main(): Promise<number> {
  let events: FeedEvent[];
  try {
    const res = await fetch(process.env.PICKTHREE_SCHEDULE_FEED ?? FEED_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) {
      throw new Error('feed is not an array');
    }
    events = raw as FeedEvent[];
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`feed unusable: ${error}`);
    report({ ok: false, unmapped: [], skippedMega: [], noSeason: [], error });
    return 4;
  }
  const gbl = events.filter((e) => e.eventType === 'go-battle-league');
  if (gbl.length === 0) {
    console.error('feed has no go-battle-league events; nothing written');
    report({
      ok: false,
      unmapped: [],
      skippedMega: [],
      noSeason: [],
      error: 'no go-battle-league events',
    });
    return 4;
  }
  const parsed = parseFeed(gbl, readAliases());
  const schedule = mergeSchedule(readSchedule(), parsed.entries, new Date());
  writeSchedule(schedule);
  writeSeasons(mergeSeasons(readSeasons(), parsed.seasons));
  console.log(
    `schedule: ${schedule.length} cup weeks (${[...new Set(schedule.map((e) => e.league))].join(', ')})`,
  );
  for (const m of parsed.skippedMega) {
    console.log(`skipped mega: ${m}`);
  }
  for (const u of parsed.unmapped) {
    console.log(`UNMAPPED: ${u} (add it to packages/data/cup-aliases.json)`);
  }
  for (const n of parsed.noSeason) {
    console.log(`NO SEASON: ${n} (week skipped)`);
  }
  report({
    ok: true,
    unmapped: parsed.unmapped,
    skippedMega: parsed.skippedMega,
    noSeason: parsed.noSeason,
    error: null,
  });
  return parsed.unmapped.length > 0 ? 3 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  },
);
