import { currentRun, leagueStatus, type League, type ScheduleEntry } from '@pickthree/engine';

export type RotationNotice =
  | { kind: 'ended'; message: string }
  | { kind: 'nudge'; league: League; key: string; message: string };

/** Nudge keys kept in settings, newest last. */
export const NUDGED_KEEP = 20;

/**
 * What to say about GO Battle League cups when the app opens. A player on a cup that is off (or
 * on a league this build no longer ships) goes back to Great League. Otherwise, the first live
 * cup the player is not on and has not been nudged about this run gets one nudge. A cup that is
 * upcoming is never ended: building ahead is the point of showing it.
 */
export function rotationNotice(input: {
  leagues: readonly League[];
  schedule: readonly ScheduleEntry[];
  league: string;
  nudged: readonly string[];
  now: Date;
}): RotationNotice | null {
  const mine = input.leagues.find((l) => l.id === input.league);
  if (!mine && input.league !== 'great' && input.leagues.length > 0) {
    return { kind: 'ended', message: 'That cup has ended. Back to Great League.' };
  }
  if (
    mine?.kind === 'rotation' &&
    leagueStatus(input.schedule, mine.id, input.now).state === 'off'
  ) {
    return { kind: 'ended', message: `${mine.title} ended. Back to Great League.` };
  }
  const live = input.leagues
    .filter((l) => l.kind === 'rotation' && l.id !== input.league)
    .map((l) => ({ l, run: currentRun(input.schedule, l.id, input.now) }))
    .filter(
      (x) => x.run !== null && leagueStatus(input.schedule, x.l.id, input.now).state === 'live',
    )
    .sort((a, b) => Date.parse(a.run!.start) - Date.parse(b.run!.start));
  for (const { l, run } of live) {
    const key = `${l.id}@${run!.start}`;
    if (!input.nudged.includes(key)) {
      return { kind: 'nudge', league: l, key, message: `${l.title} is live this week.` };
    }
  }
  return null;
}
