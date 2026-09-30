import { describe, expect, it } from 'vitest';
import type { ScheduleEntry } from '@pickthree/engine';
import { getJson, type Fetcher } from '../scripts/post/data.js';
import {
  blendedWeights,
  fetchSummary,
  formatDay,
  mixLine,
  runLabel,
} from '../scripts/post/weights.js';

const entry = (league: string, start: string, end: string): ScheduleEntry => ({
  league,
  cup: league,
  cp: 1500,
  title: league,
  start,
  end,
  season: 'Test',
});

describe('runLabel', () => {
  const schedule = [
    entry('colormega', '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z'),
    entry('colormega', '2026-09-29T20:00:00.000Z', '2026-10-06T20:00:00.000Z'),
    entry('mega-great', '2026-10-06T20:00:00.000Z', '2026-10-13T20:00:00.000Z'),
  ];

  it('reads LIVE with the merged run dates while the cup is on', () => {
    expect(runLabel(schedule, 'colormega', new Date('2026-09-30T12:00:00Z'))).toBe(
      'LIVE SEP 22 - OCT 6',
    );
  });

  it('reads STARTS before the run begins', () => {
    expect(runLabel(schedule, 'mega-great', new Date('2026-09-30T12:00:00Z'))).toBe(
      'STARTS OCT 6 - OCT 13',
    );
  });

  it('reads UPDATED for a league with no run, or only past runs', () => {
    expect(runLabel(schedule, 'great', new Date('2026-09-30T12:00:00Z'))).toBe('UPDATED SEP 30');
    expect(runLabel(schedule, 'colormega', new Date('2026-11-01T12:00:00Z'))).toBe('UPDATED NOV 1');
  });
});

describe('mixLine', () => {
  const day = new Date('2026-09-30T12:00:00Z');
  it('names what the weights were made of', () => {
    expect(formatDay(day)).toBe('Sep 30, 2026');
    expect(mixLine({ kind: 'prior' }, day)).toBe('PvPoke meta only - Sep 30, 2026');
    expect(mixLine({ kind: 'blend', battles: 0, events: 0 }, day)).toBe(
      'PvPoke meta only - Sep 30, 2026',
    );
    expect(mixLine({ kind: 'blend', battles: 1240, events: 0 }, day)).toBe(
      'PvPoke meta + 1,240 shared battles - Sep 30, 2026',
    );
    expect(mixLine({ kind: 'blend', battles: 1, events: 2 }, day)).toBe(
      'PvPoke meta + 1 shared battle + 2 events - Sep 30, 2026',
    );
  });
});

describe('fetching', () => {
  const failing: Fetcher = async () => ({ ok: false, status: 400, json: async () => ({}) });

  it('names the URL and status when a data file fails', async () => {
    await expect(getJson('https://pick3.gg/data/x.json', failing)).rejects.toThrow(/x\.json.*400/);
  });

  it('points at --prior when the meta read fails', async () => {
    const w = { since: 'a', until: 'b', label: 'This meta', key: 'meta' as const, epoch: null };
    await expect(fetchSummary('mega-great', w, failing)).rejects.toThrow(/--prior/);
  });
});

describe('blendedWeights', () => {
  it('gives every meta group species a weight when nothing is measured', () => {
    const w = blendedWeights(
      { battles: 0, devices: 0, species: [], tournament: null },
      {
        group: ['a', 'b'],
        rankings: { overall: [{ speciesId: 'a' }, { speciesId: 'b' }] } as never,
        banned: [],
      },
    );
    expect([...w.keys()].sort()).toEqual(['a', 'b']);
    expect((w.get('a') ?? 0) + (w.get('b') ?? 0)).toBeCloseTo(1);
  });
});
