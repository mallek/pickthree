import { describe, expect, it } from 'vitest';
import type { League, ScheduleEntry } from '@pickthree/engine';
import { rotationNotice } from '../src/rotation.ts';
import { GREAT } from './fakeHost.ts';

const cup = (id: string, title: string): League => ({
  ...GREAT,
  id,
  title,
  short: title,
  cup: id,
  kind: 'rotation',
});
const RETRO = cup('retro', 'Retro Cup');
const LAIC = cup('laic2027', '2026 GO LAIC Cup');
const ULTRA: League = { ...GREAT, id: 'ultra', title: 'Ultra League', short: 'Ultra', cp: 2500 };
const MASTER: League = { ...GREAT, id: 'master', title: 'Master League', short: 'Master' };
const TOURNAMENT: League = { ...GREAT, id: 'championshipseries', title: 'Tournament', kind: 'cup' };
const MEGA_MASTER = cup('mega-master', 'Master League: Mega Edition');
const COLOR = cup('colormega', 'Mega Color Cup');
const MEGA_GREAT = cup('mega-great', 'Great League: Mega Edition');
const MEGA_ULTRA = cup('mega-ultra', 'Ultra League: Mega Edition');
const LITTLE = cup('little', 'Little Cup');
const wk = (l: League, start: string, end: string): ScheduleEntry => ({
  league: l.id,
  cup: l.cup,
  cp: 1500,
  title: l.title,
  start,
  end,
  season: 'Twilight Trails',
});
const SCHEDULE = [
  wk(RETRO, '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z'),
  wk(LAIC, '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z'),
  wk(LAIC, '2026-11-17T21:00:00.000Z', '2026-11-24T21:00:00.000Z'),
];
const base = {
  leagues: [GREAT, RETRO, LAIC],
  schedule: SCHEDULE,
  league: 'great',
  nudged: [] as string[],
};

/** The leagues.json order on 2026-10-06: Mega Master ahead of Mega Great and Mega Ultra. */
const REAL = [
  GREAT,
  ULTRA,
  MASTER,
  TOURNAMENT,
  MEGA_MASTER,
  RETRO,
  COLOR,
  MEGA_GREAT,
  MEGA_ULTRA,
  LITTLE,
];
const MEGA_RUN = '2026-10-06T20:00:00.000Z';
const MEGA_END = '2026-10-13T20:00:00.000Z';
/** The feed around the 2026-10-06 turn: Color Cup ends as all three Mega Editions start. */
const REAL_SCHEDULE = [
  wk(COLOR, '2026-09-29T20:00:00.000Z', MEGA_RUN),
  wk(MEGA_GREAT, MEGA_RUN, MEGA_END),
  wk(MEGA_MASTER, MEGA_RUN, MEGA_END),
  wk(MEGA_ULTRA, MEGA_RUN, MEGA_END),
  wk(LITTLE, MEGA_END, '2026-10-20T20:00:00.000Z'),
  wk(MEGA_ULTRA, MEGA_END, '2026-10-20T20:00:00.000Z'),
];
const MEGA_KEYS = [`mega-great@${MEGA_RUN}`, `mega-master@${MEGA_RUN}`, `mega-ultra@${MEGA_RUN}`];
const real = { leagues: REAL, schedule: REAL_SCHEDULE, league: 'great', nudged: [] as string[] };
const MEGA_WEEK = new Date('2026-10-07T00:00:00Z');
const ids = (n: ReturnType<typeof rotationNotice>): string[] =>
  n && n.kind !== 'seen' ? n.options.map((l) => l.id) : [];

describe('rotationNotice', () => {
  it('nudges toward a live cup the player is not on', () => {
    expect(rotationNotice({ ...base, now: new Date('2026-09-23T00:00:00Z') })).toEqual({
      kind: 'nudge',
      message: 'Retro Cup is live this week.',
      options: [RETRO],
      keys: ['retro@2026-09-22T20:00:00.000Z'],
    });
  });

  it('lists the three Mega Editions that start together in one nudge, Great, Ultra, Master', () => {
    const n = rotationNotice({ ...real, now: MEGA_WEEK });
    expect(n).toMatchObject({ kind: 'nudge', message: '3 cups are live this week.' });
    expect(ids(n)).toEqual(['mega-great', 'mega-ultra', 'mega-master']);
    expect(n?.keys).toEqual(MEGA_KEYS);
  });

  it('does not nudge the same set twice on one device', () => {
    expect(rotationNotice({ ...real, nudged: MEGA_KEYS, now: MEGA_WEEK })).toBeNull();
  });

  it('nudges a player on Ultra or Master too, not only one on an inactive league', () => {
    for (const league of ['ultra', 'master']) {
      expect(ids(rotationNotice({ ...real, league, now: MEGA_WEEK }))).toEqual([
        'mega-great',
        'mega-ultra',
        'mega-master',
      ]);
    }
  });

  it('nudges again, with every live cup, when a new cup joins the set', () => {
    // 2026-10-13: Little Cup starts, Mega Ultra runs on, Mega Great and Mega Master are off.
    const n = rotationNotice({
      ...real,
      nudged: MEGA_KEYS,
      now: new Date('2026-10-14T00:00:00Z'),
    });
    expect(n).toMatchObject({ kind: 'nudge', message: '2 cups are live this week.' });
    expect(ids(n)).toEqual(['mega-ultra', 'little']);
    expect(n?.keys).toEqual([`little@${MEGA_END}`, `mega-ultra@${MEGA_RUN}`]);
  });

  it('nudges again for a new run of a cup after the last one was dismissed', () => {
    const schedule = [
      wk(RETRO, '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z'),
      wk(RETRO, '2026-12-01T21:00:00.000Z', '2026-12-08T21:00:00.000Z'),
    ];
    const nudged = ['retro@2026-09-22T20:00:00.000Z'];
    const n = rotationNotice({ ...base, schedule, nudged, now: new Date('2026-12-02T00:00:00Z') });
    expect(n).toMatchObject({ kind: 'nudge', keys: ['retro@2026-12-01T21:00:00.000Z'] });
  });

  it('does not nudge twice in one run, even across its second week', () => {
    const nudged = ['laic2027@2026-11-10T21:00:00.000Z'];
    expect(rotationNotice({ ...base, nudged, now: new Date('2026-11-19T00:00:00Z') })).toBeNull();
  });

  it('does not nudge again in week two when the real feed leaves a day between the weeks', () => {
    const schedule = [
      wk(LAIC, '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z'),
      wk(LAIC, '2026-11-18T21:00:00.000Z', '2026-11-25T21:00:00.000Z'),
    ];
    const nudged = ['laic2027@2026-11-10T21:00:00.000Z'];
    for (const now of ['2026-11-18T00:00:00Z', '2026-11-20T00:00:00Z']) {
      expect(rotationNotice({ ...base, schedule, nudged, now: new Date(now) })).toBeNull();
    }
  });

  it('says nothing to a player already on the only live cup, but records the set as heard', () => {
    expect(
      rotationNotice({ ...base, league: 'retro', now: new Date('2026-09-23T00:00:00Z') }),
    ).toEqual({ kind: 'seen', keys: ['retro@2026-09-22T20:00:00.000Z'] });
  });

  it('tells a player on one live cup about the others', () => {
    const one = rotationNotice({ ...real, league: 'mega-great', now: MEGA_WEEK });
    expect(one).toMatchObject({ kind: 'nudge', message: '2 more cups are live this week.' });
    expect(ids(one)).toEqual(['mega-ultra', 'mega-master']);
    expect(one?.keys).toEqual(MEGA_KEYS);
    const schedule = REAL_SCHEDULE.filter((e) => e.league !== 'mega-master');
    const two = rotationNotice({ ...real, schedule, league: 'mega-great', now: MEGA_WEEK });
    expect(two).toMatchObject({ message: 'Ultra League: Mega Edition is also live this week.' });
  });

  it('offers the open leagues and the live cups to a player on a cup that just ended', () => {
    // Color Cup ended at 20:00 on 2026-10-06, as the three Mega Editions started.
    const n = rotationNotice({ ...real, league: 'colormega', now: MEGA_WEEK });
    expect(n).toMatchObject({
      kind: 'ended',
      message: 'Mega Color Cup ended. Pick a league, or stay on Great League.',
      keys: MEGA_KEYS,
    });
    expect(ids(n)).toEqual(['great', 'ultra', 'master', 'mega-great', 'mega-ultra', 'mega-master']);
  });

  it('offers the live cups on an ended cup even when this device already heard of them', () => {
    const n = rotationNotice({ ...real, league: 'colormega', nudged: MEGA_KEYS, now: MEGA_WEEK });
    expect(n?.kind).toBe('ended');
    expect(ids(n)).toHaveLength(6);
  });

  it('sends a player on an ended cup back to Great League when no cup is live', () => {
    expect(
      rotationNotice({ ...base, league: 'retro', now: new Date('2026-10-01T00:00:00Z') }),
    ).toEqual({
      kind: 'ended',
      message: 'Retro Cup ended. Back to Great League.',
      options: [],
      keys: [],
    });
  });

  it('leaves a player building ahead on an upcoming cup alone', () => {
    expect(
      rotationNotice({ ...base, league: 'laic2027', now: new Date('2026-11-05T00:00:00Z') }),
    ).toBeNull();
  });

  it('sends a player on a league the build no longer ships back to Great League', () => {
    expect(
      rotationNotice({ ...base, league: 'fantasy', now: new Date('2026-10-01T00:00:00Z') }),
    ).toEqual({
      kind: 'ended',
      message: 'That cup has ended. Back to Great League.',
      options: [],
      keys: [],
    });
  });
});
