import { describe, expect, it } from 'vitest';
import {
  currentRun,
  leagueStatus,
  runSeasons,
  RUN_GAP_DAYS,
  runsOf,
  type ScheduleEntry,
} from '../../src/gamedata/schedule.js';

const week = (league: string, start: string, end: string): ScheduleEntry => ({
  league,
  cup: league,
  cp: 1500,
  title: league === 'laic2027' ? '2026 GO LAIC Cup' : 'Retro Cup',
  start,
  end,
  season: 'Twilight Trails',
});

const RETRO = week('retro', '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z');
const LAIC_1 = week('laic2027', '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z');
const LAIC_2 = week('laic2027', '2026-11-17T21:00:00.000Z', '2026-11-24T21:00:00.000Z');
const SCHEDULE = [RETRO, LAIC_1, LAIC_2];
// The real feed leaves a one-day gap between LAIC's two weeks.
const REAL_LAIC_1 = week('laic2027', '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z');
const REAL_LAIC_2 = week('laic2027', '2026-11-18T21:00:00.000Z', '2026-11-25T21:00:00.000Z');
const REAL = [RETRO, REAL_LAIC_1, REAL_LAIC_2];
const at = (iso: string) => new Date(iso);

describe('leagueStatus', () => {
  it('is live from the start, inclusive, to the end, exclusive', () => {
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-22T19:59:59.000Z')).state).toBe('upcoming');
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-22T20:00:00.000Z'))).toEqual({
      state: 'live',
      end: RETRO.end,
    });
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-29T19:59:59.000Z')).state).toBe('live');
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-29T20:00:00.000Z')).state).toBe('off');
  });

  it('is upcoming from exactly seven days before the start', () => {
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-15T20:00:00.000Z'))).toEqual({
      state: 'upcoming',
      start: RETRO.start,
    });
    expect(leagueStatus(SCHEDULE, 'retro', at('2026-09-15T19:59:59.000Z')).state).toBe('off');
  });

  it('reports a back-to-back run as live until its last week ends', () => {
    expect(leagueStatus(SCHEDULE, 'laic2027', at('2026-11-18T00:00:00.000Z'))).toEqual({
      state: 'live',
      end: LAIC_2.end,
    });
  });

  it('stays live through a gap of a day between two weeks of one run', () => {
    expect(leagueStatus(REAL, 'laic2027', at('2026-11-18T00:00:00.000Z'))).toEqual({
      state: 'live',
      end: REAL_LAIC_2.end,
    });
  });

  it('is off for a league the schedule does not name', () => {
    expect(leagueStatus(SCHEDULE, 'great', at('2026-09-23T00:00:00.000Z')).state).toBe('off');
  });
});

describe('runs', () => {
  it('merges weeks whose end meets the next start', () => {
    expect(runsOf(SCHEDULE, 'laic2027')).toEqual([{ start: LAIC_1.start, end: LAIC_2.end }]);
  });

  it(`merges weeks whose next start is within ${RUN_GAP_DAYS} days of the last end`, () => {
    expect(runsOf(REAL, 'laic2027')).toEqual([{ start: REAL_LAIC_1.start, end: REAL_LAIC_2.end }]);
  });

  it('keeps separate weeks separate', () => {
    const twice = [RETRO, week('retro', '2026-10-27T21:00:00.000Z', '2026-11-03T21:00:00.000Z')];
    expect(runsOf(twice, 'retro')).toHaveLength(2);
  });

  it('currentRun is the run containing now, else the last run before now, else null', () => {
    expect(currentRun(SCHEDULE, 'laic2027', at('2026-11-20T00:00:00.000Z'))?.start).toBe(
      LAIC_1.start,
    );
    expect(currentRun(SCHEDULE, 'retro', at('2026-10-05T00:00:00.000Z'))?.start).toBe(RETRO.start);
    expect(currentRun(SCHEDULE, 'retro', at('2026-09-01T00:00:00.000Z'))).toBeNull();
  });

  it('currentRun between two separate runs is the earlier run', () => {
    const later = week('retro', '2026-10-27T21:00:00.000Z', '2026-11-03T21:00:00.000Z');
    expect(currentRun([RETRO, later], 'retro', at('2026-10-10T00:00:00.000Z'))).toEqual({
      start: RETRO.start,
      end: RETRO.end,
    });
  });

  it('runSeasons names each run by the cup and its start date, oldest first', () => {
    expect(runSeasons(SCHEDULE, 'laic2027', '2026 GO LAIC Cup')).toEqual([
      { id: -1, name: '2026 GO LAIC Cup, Nov 10', start: LAIC_1.start },
    ]);
  });
});
