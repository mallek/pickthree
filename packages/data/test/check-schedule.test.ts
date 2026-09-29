import { describe, expect, it } from 'vitest';
import type { ScheduleEntry } from '@pickthree/engine';
import { checkOutput, scheduleWarnings } from '../src/check-schedule.js';

const wk = (league: string, cp: number, start: string, end: string): ScheduleEntry => ({
  league,
  cup: league,
  cp,
  title: league === 'little' ? 'Little Cup' : 'Fantasy Cup',
  start,
  end,
  season: 'Twilight Trails',
});
const LITTLE = wk('little', 500, '2026-10-13T20:00:00.000Z', '2026-10-20T20:00:00.000Z');
const FANTASY = wk('fantasy', 1500, '2026-10-20T20:00:00.000Z', '2026-10-27T20:00:00.000Z');
const base = {
  schedule: [LITTLE, FANTASY],
  report: { ok: true, unmapped: [], error: null },
  ranked: (cup: string) => cup !== 'fantasy',
  updated: () => '2024-03-04',
};

describe('scheduleWarnings', () => {
  it('says nothing about cups more than a week away', () => {
    expect(scheduleWarnings({ ...base, now: new Date('2026-10-01T00:00:00Z') })).toEqual([]);
  });

  it('warns about stale rankings for a cup starting within a week', () => {
    const w = scheduleWarnings({ ...base, now: new Date('2026-10-08T00:00:00Z') });
    expect(w.map((x) => x.title)).toEqual([
      'Little Cup starts 2026-10-13 on stale PvPoke rankings',
    ]);
  });

  it('warns about a cup with no rankings starting within a week', () => {
    const w = scheduleWarnings({ ...base, now: new Date('2026-10-15T00:00:00Z') });
    expect(w.map((x) => x.title)).toContain(
      'Fantasy Cup starts 2026-10-20 with no PvPoke rankings at 1500',
    );
  });

  it('warns once per unmapped cup and once for an unusable feed', () => {
    const w = scheduleWarnings({
      ...base,
      report: { ok: false, unmapped: ['Spooky Cup'], error: 'HTTP 500' },
      now: new Date('2026-10-01T00:00:00Z'),
    });
    expect(w.map((x) => x.title)).toEqual([
      "Map GBL cup 'Spooky Cup' to a PvPoke cup",
      'GBL schedule feed failing',
    ]);
  });

  it('warns once per feed week that names no season', () => {
    const w = scheduleWarnings({
      ...base,
      report: { ok: true, unmapped: [], noSeason: ['Great League and Retro Cup'], error: null },
      now: new Date('2026-10-01T00:00:00Z'),
    });
    expect(w.map((x) => x.title)).toEqual([
      'GBL feed week without a season: Great League and Retro Cup',
    ]);
  });

  it('skips rankings and staleness warnings when the PvPoke checkout is missing', () => {
    const w = scheduleWarnings({
      ...base,
      report: { ok: false, unmapped: ['Spooky Cup'], error: 'HTTP 500' },
      pvpoke: false,
      now: new Date('2026-10-15T00:00:00Z'),
    });
    expect(w.map((x) => x.title)).toEqual([
      "Map GBL cup 'Spooky Cup' to a PvPoke cup",
      'GBL schedule feed failing',
    ]);
  });
});

describe('checkOutput', () => {
  const ok = { ok: true, unmapped: [], error: null };
  it('judges the feed only when a report exists with ok true', () => {
    expect(checkOutput({ warnings: [], report: null, pvpoke: true }).judged.feed).toBe(false);
    expect(
      checkOutput({ warnings: [], report: { ...ok, ok: false, error: 'x' }, pvpoke: true }).judged
        .feed,
    ).toBe(false);
    expect(checkOutput({ warnings: [], report: ok, pvpoke: true }).judged.feed).toBe(true);
  });

  it('judges rankings as the pvpoke flag says', () => {
    expect(checkOutput({ warnings: [], report: ok, pvpoke: true }).judged.rankings).toBe(true);
    expect(checkOutput({ warnings: [], report: ok, pvpoke: false }).judged.rankings).toBe(false);
  });

  it('carries the warnings through', () => {
    const warnings = [{ title: 'T', body: 'B' }];
    expect(checkOutput({ warnings, report: ok, pvpoke: true }).warnings).toEqual(warnings);
  });
});
