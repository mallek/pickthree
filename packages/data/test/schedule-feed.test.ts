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
