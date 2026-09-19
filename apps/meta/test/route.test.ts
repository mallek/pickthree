import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY, hrefFor, parseLocation, withLeague } from '../src/route.js';

const LEAGUES = ['great', 'ultra', 'master'];
const at = (path: string, search = ''): ReturnType<typeof parseLocation> =>
  parseLocation(path, search, LEAGUES);

describe('parseLocation', () => {
  it('sends the root to the first league', () => {
    expect(at('/')).toEqual({ view: { name: 'overview', league: 'great' }, query: DEFAULT_QUERY });
  });

  it('reads the four views', () => {
    expect(at('/ultra').view).toEqual({ name: 'overview', league: 'ultra' });
    expect(at('/ultra/teams').view).toEqual({ name: 'teams', league: 'ultra' });
    expect(at('/ultra/p/azumarill').view).toEqual({
      name: 'species',
      league: 'ultra',
      speciesId: 'azumarill',
    });
    expect(at('/about').view).toEqual({ name: 'about' });
  });

  it('falls back to the first league for an unknown one, and to the overview for junk', () => {
    expect(at('/premier').view).toEqual({ name: 'overview', league: 'great' });
    expect(at('/great/nonsense').view).toEqual({ name: 'overview', league: 'great' });
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
  it('round trips every view with its filters', () => {
    const query = { w: '30', band: 'ace' } as const;
    for (const view of [
      { name: 'overview', league: 'ultra' },
      { name: 'teams', league: 'ultra' },
      { name: 'species', league: 'ultra', speciesId: 'azumarill' },
      { name: 'about' },
    ] as const) {
      const href = hrefFor(view, query);
      const [path, search] = href.split('?');
      expect(parseLocation(path!, search ? `?${search}` : '', LEAGUES)).toEqual({ view, query });
    }
  });

  it('leaves the default filters out of the url', () => {
    expect(hrefFor({ name: 'overview', league: 'great' }, DEFAULT_QUERY)).toBe('/great');
  });

  it('drops the default window from a href', () => {
    expect(hrefFor({ name: 'teams', league: 'great' }, { w: 'meta', band: 'all' })).toBe(
      '/great/teams',
    );
  });
});

describe('withLeague', () => {
  it('keeps the view kind and drops a species that belongs to the old league', () => {
    expect(withLeague({ name: 'teams', league: 'great' }, 'ultra')).toEqual({
      name: 'teams',
      league: 'ultra',
    });
    expect(withLeague({ name: 'species', league: 'great', speciesId: 'x' }, 'ultra')).toEqual({
      name: 'overview',
      league: 'ultra',
    });
    expect(withLeague({ name: 'about' }, 'ultra')).toEqual({ name: 'about' });
  });
});
