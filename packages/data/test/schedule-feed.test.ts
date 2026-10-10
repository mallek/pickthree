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

  it('never lists an open league as a cup', () => {
    for (const e of parsed.entries) {
      expect(e.title).not.toMatch(/^Great League$|^Ultra League$|^Master League$/);
    }
  });

  it('turns the Mega formats into rotation leagues flagged mega', () => {
    const byLeague = (league: string) => parsed.entries.find((e) => e.league === league);
    expect(byLeague('colormega')).toMatchObject({
      cup: 'colormega',
      cp: 1500,
      title: 'Mega Color Cup',
      mega: true,
    });
    expect(byLeague('mega-great')).toMatchObject({ cup: 'mega', cp: 1500, mega: true });
    expect(byLeague('mega-ultra')).toMatchObject({ cup: 'mega', cp: 2500, mega: true });
    expect(byLeague('mega-master')).toMatchObject({ cup: 'mega', cp: 10000, mega: true });
  });

  it('carries the alias short name on the Mega Edition entries only', () => {
    const short = (league: string) => parsed.entries.find((e) => e.league === league)?.short;
    expect(short('mega-great')).toBe('Mega Great');
    expect(short('mega-ultra')).toBe('Mega Ultra');
    expect(short('mega-master')).toBe('Mega Master');
    expect(short('colormega')).toBeUndefined();
  });

  it('leaves the mega flag off a format whose text has no Mega in it', () => {
    expect(parsed.entries.find((e) => e.league === 'laic2027')?.mega).toBeUndefined();
    expect(parsed.entries.find((e) => e.league === 'retro')?.mega).toBeUndefined();
  });

  it('reports an unmapped Mega cup by its cup title and has no skippedMega field', () => {
    expect(parsed.unmapped).toContain('Mega Halloween Cup');
    expect(parsed).not.toHaveProperty('skippedMega');
  });

  it('reports a cup it cannot map, once, and still writes the rest', () => {
    expect(parsed.unmapped).toEqual(
      expect.arrayContaining(['Spooky Cup', 'Mega Halloween Cup', 'Mega Catch Cup']),
    );
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

  it('skips a GBL week whose name carries no season and reports it', () => {
    const name = 'Great League and Fantasy Cup: Great League Edition';
    const noSeason = parseFeed(
      [
        {
          name,
          eventType: 'go-battle-league',
          start: '2026-12-01T21:00:00.000Z',
          end: '2026-12-08T21:00:00.000Z',
        },
        {
          name: 'Great League and Retro Cup: Great League Edition | Twilight Trails',
          eventType: 'go-battle-league',
          start: '2026-12-08T21:00:00.000Z',
          end: '2026-12-15T21:00:00.000Z',
        },
      ],
      readAliases(),
    );
    expect(noSeason.noSeason).toEqual([name]);
    expect(noSeason.entries.map((e) => e.league)).toEqual(['retro']);
    expect(noSeason.seasons.map((x) => x.name)).toEqual(['Twilight Trails']);
    expect(parsed.noSeason).toEqual([]);
  });

  it('skips a GBL week with no real start or end and reports it, so no 1970 week is written', () => {
    const name = 'Mega Color Cup | Twilight Trails';
    const undated = parseFeed(
      [
        { name, eventType: 'go-battle-league', start: null, end: null },
        {
          name: 'Great League and Fantasy Cup: Great League Edition | Twilight Trails',
          eventType: 'go-battle-league',
          start: '',
          end: '2026-12-08T21:00:00.000Z',
        },
        {
          name: 'Great League and Retro Cup: Great League Edition | Twilight Trails',
          eventType: 'go-battle-league',
          start: '2026-12-08T21:00:00.000Z',
          end: '2026-12-15T21:00:00.000Z',
        },
      ],
      readAliases(),
    );
    expect(undated.undated).toEqual([
      name,
      'Great League and Fantasy Cup: Great League Edition | Twilight Trails',
    ]);
    expect(undated.entries.map((e) => e.league)).toEqual(['retro']);
    expect(undated.seasons).toEqual([
      { name: 'Twilight Trails', start: '2026-12-08T21:00:00.000Z' },
    ]);
    expect(parsed.undated).toEqual([]);
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
