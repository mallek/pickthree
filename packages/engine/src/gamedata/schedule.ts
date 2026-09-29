import type { Season } from '../yourmeta/types.js';

/** One GO Battle League week of one cup, as packages/data/schedule.json lists it. */
export interface ScheduleEntry {
  /** pick3 league id. */
  league: string;
  /** PvPoke cup slug. */
  cup: string;
  cp: number;
  /** The cup's name as the game gives it ("Retro Cup"). */
  title: string;
  /** ISO time, inclusive. */
  start: string;
  /** ISO time, exclusive. */
  end: string;
  /** GO Battle League season name. */
  season: string;
  /**
   * True when the feed's format text says Mega. Absent otherwise. A rotation league whose format
   * is not a Mega format always bans Megas, whatever PvPoke's cup file allows (readLeagues).
   */
  mega?: true;
  /** Short league name from the cup alias, when the title is too long for the league row. */
  short?: string;
}

export type LeagueStatus =
  { state: 'live'; end: string } | { state: 'upcoming'; start: string } | { state: 'off' };

/** How far ahead a cup shows as upcoming. */
export const UPCOMING_DAYS = 7;

/** Weeks of one league are one run when the next starts within this many days of the last end. */
export const RUN_GAP_DAYS = 2;

const DAY_MS = 86_400_000;

export interface Run {
  start: string;
  end: string;
}

/**
 * The league's weeks merged into runs: a week starting at or before the last week's end plus
 * RUN_GAP_DAYS joins that run (the feed can leave a day between two weeks of one cup).
 */
export function runsOf(schedule: readonly ScheduleEntry[], leagueId: string): Run[] {
  const weeks = schedule
    .filter((e) => e.league === leagueId)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const runs: Run[] = [];
  for (const w of weeks) {
    const last = runs[runs.length - 1];
    if (last && Date.parse(w.start) <= Date.parse(last.end) + RUN_GAP_DAYS * DAY_MS) {
      if (Date.parse(w.end) > Date.parse(last.end)) {
        last.end = w.end;
      }
    } else {
      runs.push({ start: w.start, end: w.end });
    }
  }
  return runs;
}

/** Live while a run contains now; upcoming when the next run starts within UPCOMING_DAYS. */
export function leagueStatus(
  schedule: readonly ScheduleEntry[],
  leagueId: string,
  now: Date,
): LeagueStatus {
  const t = now.getTime();
  for (const r of runsOf(schedule, leagueId)) {
    const start = Date.parse(r.start);
    const end = Date.parse(r.end);
    if (t >= start && t < end) {
      return { state: 'live', end: r.end };
    }
    if (t < start && start - t <= UPCOMING_DAYS * DAY_MS) {
      return { state: 'upcoming', start: r.start };
    }
  }
  return { state: 'off' };
}

/** The run containing now, else the most recent run that started before now, else null. */
export function currentRun(
  schedule: readonly ScheduleEntry[],
  leagueId: string,
  now: Date,
): Run | null {
  let found: Run | null = null;
  for (const r of runsOf(schedule, leagueId)) {
    if (Date.parse(r.start) <= now.getTime()) {
      found = r;
    }
  }
  return found;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The league's runs as Your meta seasons, oldest first, so the season window and buckets work
 * unchanged for a cup: "this season" becomes this run. Ids are negative so they never collide
 * with a real season's id. Names use the UTC date: a run starts at 20:00 or 21:00 UTC.
 */
export function runSeasons(
  schedule: readonly ScheduleEntry[],
  leagueId: string,
  title: string,
): Season[] {
  return runsOf(schedule, leagueId).map((r, i) => {
    const d = new Date(r.start);
    return {
      id: -(i + 1),
      name: `${title}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
      start: r.start,
    };
  });
}
