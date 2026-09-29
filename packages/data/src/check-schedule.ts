/**
 * Output for the daily job, printed as JSON { warnings: [{ title, body }], judged: { feed,
 * rankings } }. The workflow opens one issue per warning title (or comments on the open one) and
 * closes an issue only when its kind was judged. Titles are stable so issues deduplicate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { UPCOMING_DAYS, runsOf, type ScheduleEntry } from '@pickthree/engine';
import { hasRankings, isStale, rankingsUpdated } from './leagues.js';
import { DATA_PACKAGE_DIR, GAMEMASTER_PATH } from './paths.js';
import { readSchedule } from './schedule-feed.js';

export interface Warning {
  title: string;
  body: string;
}

export function scheduleWarnings(input: {
  schedule: ScheduleEntry[];
  report: {
    ok: boolean;
    unmapped: string[];
    /** Missing in a report written before the field existed. */
    noSeason?: string[];
    error: string | null;
  } | null;
  ranked: (cup: string, cp: number) => boolean;
  updated: (cup: string, cp: number) => string | null;
  now: Date;
  /** False when the PvPoke checkout is missing; rankings and staleness cannot be judged then. */
  pvpoke?: boolean;
}): Warning[] {
  const out: Warning[] = [];
  for (const title of input.report?.unmapped ?? []) {
    out.push({
      title: `Map GBL cup '${title}' to a PvPoke cup`,
      body: `The GBL feed names '${title}'. Add it to packages/data/cup-aliases.json with its PvPoke cup slug (and cp if the name carries no edition), after checking the rules match.`,
    });
  }
  for (const name of input.report?.noSeason ?? []) {
    out.push({
      title: `GBL feed week without a season: ${name}`,
      body: `The GBL feed lists '${name}' with no " | Season" part, so schedule:refresh skipped that week. It comes back on its own once the feed names the season; if the feed changed its naming, update parseFeed in packages/data/src/schedule-feed.ts.`,
    });
  }
  if (input.report && !input.report.ok) {
    out.push({
      title: 'GBL schedule feed failing',
      body: `schedule:refresh could not use the feed (${input.report.error ?? 'unknown'}). schedule.json was left as it was. This closes itself on the next good run.`,
    });
  }
  if (input.pvpoke === false) {
    return out;
  }
  const t = input.now.getTime();
  for (const league of [...new Set(input.schedule.map((e) => e.league))]) {
    const first = input.schedule.find((e) => e.league === league)!;
    const run = runsOf(input.schedule, league).find(
      (r) => Date.parse(r.end) > t && Date.parse(r.start) - t <= UPCOMING_DAYS * 86_400_000,
    );
    if (!run) {
      continue;
    }
    const day = run.start.slice(0, 10);
    if (!input.ranked(first.cup, first.cp)) {
      out.push({
        title: `${first.title} starts ${day} with no PvPoke rankings at ${first.cp}`,
        body: `pick3 will not offer ${first.title} until PvPoke publishes rankings-${first.cp}.json for '${first.cup}'. The daily job picks them up when they land.`,
      });
      continue;
    }
    const updated = input.updated(first.cup, first.cp);
    if (isStale(updated, run.start)) {
      out.push({
        title: `${first.title} starts ${day} on stale PvPoke rankings`,
        body: `PvPoke last changed '${first.cup}' rankings on ${updated ?? 'an unknown date'}. The app labels the cup. This issue closes itself on the first daily run after PvPoke refreshes them.`,
      });
    }
  }
  return out;
}

/** What the CLI prints: the warnings plus which kinds of warning this run could judge. */
export function checkOutput(input: {
  warnings: Warning[];
  report: { ok: boolean } | null;
  pvpoke: boolean;
}): { warnings: Warning[]; judged: { feed: boolean; rankings: boolean } } {
  return {
    warnings: input.warnings,
    judged: { feed: input.report?.ok === true, rankings: input.pvpoke },
  };
}

if (process.argv[1] && process.argv[1].endsWith('check-schedule.ts')) {
  const reportFile = path.join(DATA_PACKAGE_DIR, '.cache', 'schedule-report.json');
  const report = fs.existsSync(reportFile)
    ? (JSON.parse(fs.readFileSync(reportFile, 'utf8')) as {
        ok: boolean;
        unmapped: string[];
        noSeason?: string[];
        error: string | null;
      })
    : null;
  const pvpoke = fs.existsSync(GAMEMASTER_PATH);
  const warnings = scheduleWarnings({
    schedule: readSchedule(),
    report,
    ranked: hasRankings,
    updated: rankingsUpdated,
    now: new Date(),
    pvpoke,
  });
  process.stdout.write(`${JSON.stringify(checkOutput({ warnings, report, pvpoke }))}\n`);
}
