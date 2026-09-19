import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY, hrefFor, parseLocation, withLeague, type View } from '../src/route.js';

const LEAGUES = ['great', 'ultra', 'master'];
const at = (path: string, search = ''): ReturnType<typeof parseLocation> =>
  parseLocation(path, search, LEAGUES);

describe('parseLocation', () => {
  it('lands on Teams at the league root', () => {
    expect(parseLocation('/great', '', LEAGUES).view).toEqual({ name: 'teams', league: 'great' });
  });

  it('keeps the old teams path working', () => {
    expect(parseLocation('/great/teams', '', LEAGUES).view).toEqual({
      name: 'teams',
      league: 'great',
    });
  });

  it('puts the species list at /<league>/pokemon', () => {
    expect(parseLocation('/ultra/pokemon', '', LEAGUES).view).toEqual({
      name: 'pokemon',
      league: 'ultra',
    });
  });

  it('still drills into one species', () => {
    expect(parseLocation('/great/p/azumarill', '', LEAGUES).view).toEqual({
      name: 'species',
      league: 'great',
      speciesId: 'azumarill',
    });
  });

  it('reads the about view', () => {
    expect(at('/about').view).toEqual({ name: 'about' });
  });

  it("falls back to the first league's Teams for anything it does not know", () => {
    expect(parseLocation('/nonsense', '', LEAGUES).view).toEqual({
      name: 'teams',
      league: 'great',
    });
  });

  it('falls back to the first league for an unknown one, and to Teams for junk under a known one', () => {
    expect(at('/premier').view).toEqual({ name: 'teams', league: 'great' });
    expect(at('/great/nonsense').view).toEqual({ name: 'teams', league: 'great' });
  });

  it('reads the filters and rejects values it does not know', () => {
    expect(at('/great', '?w=7&band=legend').query).toEqual({ w: '7', band: 'legend' });
    expect(at('/great', '?w=99&band=grandmaster').query).toEqual(DEFAULT_QUERY);
  });

  it('tolerates a trailing slash', () => {
    expect(at('/great/teams/').view).toEqual({ name: 'teams', league: 'great' });
  });

  it('reads the old season key as the meta window, so an old link still works', () => {
    expect(parseLocation('/great', '?w=season', ['great']).query.w).toBe('meta');
  });
});

describe('hrefFor', () => {
  it('writes the league root for Teams, so the old path canonicalises away', () => {
    expect(hrefFor({ name: 'teams', league: 'great' }, DEFAULT_QUERY)).toBe('/great');
    expect(hrefFor({ name: 'pokemon', league: 'great' }, DEFAULT_QUERY)).toBe('/great/pokemon');
  });

  it('round trips every view through a parse', () => {
    const views: View[] = [
      { name: 'teams', league: 'ultra' },
      { name: 'pokemon', league: 'ultra' },
      { name: 'species', league: 'ultra', speciesId: 'swampert' },
      { name: 'about' },
    ];
    for (const view of views) {
      const href = hrefFor(view, DEFAULT_QUERY);
      const [path, search] = href.split('?');
      expect(parseLocation(path ?? '/', search ? `?${search}` : '', LEAGUES).view).toEqual(view);
    }
  });

  it('round trips every view with its filters', () => {
    const query = { w: '30', band: 'ace' } as const;
    for (const view of [
      { name: 'teams', league: 'ultra' },
      { name: 'pokemon', league: 'ultra' },
      { name: 'species', league: 'ultra', speciesId: 'azumarill' },
      { name: 'about' },
    ] as const) {
      const href = hrefFor(view, query);
      const [path, search] = href.split('?');
      expect(parseLocation(path!, search ? `?${search}` : '', LEAGUES)).toEqual({ view, query });
    }
  });
});

describe('withLeague', () => {
  it('keeps you on the screen you were on', () => {
    expect(withLeague({ name: 'pokemon', league: 'great' }, 'ultra')).toEqual({
      name: 'pokemon',
      league: 'ultra',
    });
    expect(withLeague({ name: 'teams', league: 'great' }, 'ultra')).toEqual({
      name: 'teams',
      league: 'ultra',
    });
  });

  it('sends a species drill-down back to the list, since a species belongs to its league', () => {
    expect(
      withLeague({ name: 'species', league: 'great', speciesId: 'azumarill' }, 'ultra'),
    ).toEqual({ name: 'pokemon', league: 'ultra' });
  });

  it('leaves About alone, since it carries no league', () => {
    expect(withLeague({ name: 'about' }, 'ultra')).toEqual({ name: 'about' });
  });
});
