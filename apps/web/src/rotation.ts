import { currentRun, leagueStatus, type League, type ScheduleEntry } from '@pickthree/engine';

/**
 * What the app says about GO Battle League cups when it opens. `keys` are the live cup runs, as
 * `<league>@<run start>`, to record as heard on this device; `options` are the leagues the
 * notice offers, each one tap to switch.
 * - `ended`: the selected cup is off, so the player goes back to Great League. With cups live,
 *   the notice offers the open leagues and those cups; with none, it only says so.
 * - `nudge`: a live set this device has not heard about yet, every live cup the player is not on.
 * - `seen`: the player is already on the only live cup, so there is nothing to say, but the set
 *   is recorded as heard.
 */
export type RotationNotice =
  | { kind: 'ended'; message: string; options: League[]; keys: string[] }
  | { kind: 'nudge'; message: string; options: League[]; keys: string[] }
  | { kind: 'seen'; keys: string[] };

/** Nudge keys kept in settings, newest last. */
export const NUDGED_KEEP = 20;

/** The open leagues by title, in the order a list leads with them (a Mega Edition goes with its own). */
const LEAD = ['Great League', 'Ultra League', 'Master League'];

function lead(l: League): number {
  const i = LEAD.findIndex((t) => l.title === t || l.title.startsWith(`${t}:`));
  return i === -1 ? LEAD.length : i;
}

/** Standard leagues first, then Great, Ultra, Master, then the rest in leagues.json order. */
function ordered(leagues: readonly League[], pick: readonly League[]): League[] {
  const at = (l: League): number => leagues.indexOf(l);
  const std = (l: League): number => (l.kind === 'standard' ? 0 : 1);
  return [...pick].sort((a, b) => std(a) - std(b) || lead(a) - lead(b) || at(a) - at(b));
}

/**
 * One notice per new set of live cups per device, not one per cup: when several cups go live
 * together (the three Mega Editions on 2026-10-06), the player hears about all of them at once.
 * A cup that is upcoming is never ended: building ahead is the point of showing it.
 */
export function rotationNotice(input: {
  leagues: readonly League[];
  schedule: readonly ScheduleEntry[];
  league: string;
  nudged: readonly string[];
  now: Date;
}): RotationNotice | null {
  const live = input.leagues
    .filter((l) => l.kind === 'rotation')
    .map((l) => ({ l, run: currentRun(input.schedule, l.id, input.now) }))
    .filter((x) => leagueStatus(input.schedule, x.l.id, input.now).state === 'live')
    .flatMap((x) => (x.run ? [{ l: x.l, key: `${x.l.id}@${x.run.start}` }] : []));
  const keys = live.map((x) => x.key).sort();
  const cups = ordered(
    input.leagues,
    live.map((x) => x.l),
  );

  const mine = input.leagues.find((l) => l.id === input.league);
  const gone = !mine && input.league !== 'great' && input.leagues.length > 0;
  const off =
    mine?.kind === 'rotation' && leagueStatus(input.schedule, mine.id, input.now).state === 'off';
  if (gone || off) {
    const what = mine ? `${mine.title} ended` : 'That cup has ended';
    if (cups.length === 0) {
      return { kind: 'ended', message: `${what}. Back to Great League.`, options: [], keys };
    }
    const open = input.leagues.filter((l) => l.kind === 'standard');
    return {
      kind: 'ended',
      message: `${what}. Pick a league, or stay on Great League.`,
      options: ordered(input.leagues, [...open, ...cups]),
      keys,
    };
  }

  if (keys.every((k) => input.nudged.includes(k))) {
    return null;
  }
  const others = cups.filter((l) => l.id !== input.league);
  if (others.length === 0) {
    return { kind: 'seen', keys };
  }
  const also = others.length < cups.length;
  let message: string;
  if (others.length === 1) {
    message = `${others[0]!.title} is ${also ? 'also ' : ''}live this week.`;
  } else {
    message = `${others.length} ${also ? 'more ' : ''}cups are live this week.`;
  }
  return { kind: 'nudge', message, options: others, keys };
}
