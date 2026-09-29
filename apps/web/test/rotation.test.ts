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

describe('rotationNotice', () => {
  it('nudges toward a live cup the player is not on', () => {
    expect(rotationNotice({ ...base, now: new Date('2026-09-23T00:00:00Z') })).toEqual({
      kind: 'nudge',
      league: RETRO,
      key: 'retro@2026-09-22T20:00:00.000Z',
      message: 'Retro Cup is live this week.',
    });
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

  it('does not nudge a player already on the cup', () => {
    expect(
      rotationNotice({ ...base, league: 'retro', now: new Date('2026-09-23T00:00:00Z') }),
    ).toBeNull();
  });

  it('sends a player on an ended cup back to Great League', () => {
    expect(
      rotationNotice({ ...base, league: 'retro', now: new Date('2026-10-01T00:00:00Z') }),
    ).toEqual({
      kind: 'ended',
      message: 'Retro Cup ended. Back to Great League.',
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
    });
  });
});
