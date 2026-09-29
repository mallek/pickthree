import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFeed, readAliases, type FeedEvent } from '../src/schedule-feed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FEED = JSON.parse(
  fs.readFileSync(path.join(here, 'fixtures', 'gbl-feed.json'), 'utf8'),
) as FeedEvent[];
const parsed = parseFeed(FEED, readAliases());

describe('parseFeed', () => {
  it('turns the Retro week into one Great League cup entry', () => {
    expect(parsed.entries).toContainEqual({
      league: 'retro',
      cup: 'retro',
      cp: 1500,
      title: 'Retro Cup',
      start: '2026-09-22T20:00:00.000Z',
      end: '2026-09-29T20:00:00.000Z',
      season: 'Twilight Trails',
    });
  });

  it('takes Little Cup at the cap its alias sets, with no suffix on the id', () => {
    const little = parsed.entries.find((e) => e.cup === 'little');
    expect(little).toMatchObject({ league: 'little', cp: 500, title: 'Little Cup' });
  });

  it('lists both LAIC weeks', () => {
    expect(parsed.entries.filter((e) => e.league === 'laic2027')).toHaveLength(2);
  });

  it('never lists an open league or a mega format as a cup', () => {
    for (const e of parsed.entries) {
      expect(e.title).not.toMatch(/Mega|^Great League$|^Ultra League$|^Master League$/);
    }
    expect(parsed.skippedMega).toContain('Mega Color Cup: Great League Edition');
    expect(parsed.skippedMega).toContain('Master League: Mega Edition');
  });

  it('reports a cup it cannot map, once, and still writes the rest', () => {
    expect(parsed.unmapped).toEqual(['Spooky Cup']);
    expect(parsed.entries.length).toBeGreaterThan(0);
  });

  it('ignores events that are not GO Battle League', () => {
    expect(parsed.entries.every((e) => !e.title.includes('Raid'))).toBe(true);
  });

  it('reports each season name with its earliest week', () => {
    expect(parsed.seasons[0]).toEqual({ name: 'Twilight Trails', start: expect.any(String) });
    expect(parsed.seasons.map((s) => s.name)).toEqual(['Twilight Trails']);
  });

  it('suffixes an Ultra edition of a cup and takes its cap from the edition', () => {
    const ul = parseFeed(
      [
        {
          name: 'Great League and Fantasy Cup: Ultra League Edition | Twilight Trails',
          eventType: 'go-battle-league',
          start: '2026-12-01T21:00:00.000Z',
          end: '2026-12-08T21:00:00.000Z',
        },
      ],
      readAliases(),
    );
    expect(ul.entries).toEqual([
      expect.objectContaining({ league: 'fantasy-ultra', cup: 'fantasy', cp: 2500 }),
    ]);
  });
});

import { mergeSchedule } from '../src/schedule-feed.js';
import type { ScheduleEntry } from '@pickthree/engine';

const wk = (
  league: string,
  start: string,
  end: string,
  season = 'Twilight Trails',
): ScheduleEntry => ({
  league,
  cup: league,
  cp: 1500,
  title: league,
  start,
  end,
  season,
});

describe('mergeSchedule', () => {
  const retro = wk('retro', '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z');
  const little = wk('little', '2026-10-13T20:00:00.000Z', '2026-10-20T20:00:00.000Z');
  const fantasy = wk('fantasy', '2026-10-20T20:00:00.000Z', '2026-10-27T20:00:00.000Z');

  it('keeps an ended week the feed no longer lists', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    expect(mergeSchedule([retro, little], [little], now)).toEqual([retro, little]);
  });

  it('drops a future week the feed no longer lists (the schedule changed)', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    expect(mergeSchedule([retro, little, fantasy], [fantasy], now)).toEqual([retro, fantasy]);
  });

  it('drops the previous season once a newer season has started', () => {
    const next = wk('retro', '2026-12-08T21:00:00.000Z', '2026-12-15T21:00:00.000Z', 'Season 29');
    const now = new Date('2026-12-02T00:00:00.000Z');
    const firstOfNext = wk(
      'little',
      '2026-12-01T21:00:00.000Z',
      '2026-12-08T21:00:00.000Z',
      'Season 29',
    );
    expect(mergeSchedule([retro, little], [firstOfNext, next], now)).toEqual([firstOfNext, next]);
  });

  it('keeps the current season while the next is only announced', () => {
    const next = wk('retro', '2026-12-08T21:00:00.000Z', '2026-12-15T21:00:00.000Z', 'Season 29');
    const now = new Date('2026-11-01T00:00:00.000Z');
    expect(mergeSchedule([retro], [next], now)).toEqual([retro, next]);
  });
});
