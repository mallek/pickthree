/**
 * Real paths, not a hash: this is a public site other people link to. The worker's static-asset
 * SPA fallback is what makes /great/p/azumarill load index.html.
 */

export type WindowKey = 'season' | '30' | '7';
export type BandKey = 'all' | 'below' | 'ace' | 'veteran' | 'expert' | 'legend';

export type View =
  | { name: 'overview'; league: string }
  | { name: 'teams'; league: string }
  | { name: 'species'; league: string; speciesId: string }
  | { name: 'about' };

export interface Query {
  w: WindowKey;
  band: BandKey;
}

export const WINDOWS: readonly WindowKey[] = ['season', '30', '7'];
export const BANDS: readonly BandKey[] = ['all', 'below', 'ace', 'veteran', 'expert', 'legend'];
export const DEFAULT_QUERY: Query = { w: 'season', band: 'all' };

const SPECIES = /^[a-z0-9_]+$/;

function readQuery(search: string): Query {
  const p = new URLSearchParams(search);
  const w = p.get('w');
  const band = p.get('band');
  return {
    w: WINDOWS.includes(w as WindowKey) ? (w as WindowKey) : DEFAULT_QUERY.w,
    band: BANDS.includes(band as BandKey) ? (band as BandKey) : DEFAULT_QUERY.band,
  };
}

export function parseLocation(
  pathname: string,
  search: string,
  leagues: readonly string[],
): { view: View; query: Query } {
  const query = readQuery(search);
  const parts = pathname.split('/').filter(Boolean);
  const first = leagues[0] ?? 'great';
  const [a, b, c] = parts;
  if (a === 'about') {
    return { view: { name: 'about' }, query };
  }
  const league = a && leagues.includes(a) ? a : first;
  if (b === 'teams') {
    return { view: { name: 'teams', league }, query };
  }
  if (b === 'p' && c && SPECIES.test(c)) {
    return { view: { name: 'species', league, speciesId: c }, query };
  }
  return { view: { name: 'overview', league }, query };
}

export function hrefFor(view: View, query: Query): string {
  const path =
    view.name === 'about'
      ? '/about'
      : view.name === 'teams'
        ? `/${view.league}/teams`
        : view.name === 'species'
          ? `/${view.league}/p/${view.speciesId}`
          : `/${view.league}`;
  const p = new URLSearchParams();
  if (query.w !== DEFAULT_QUERY.w) {
    p.set('w', query.w);
  }
  if (query.band !== DEFAULT_QUERY.band) {
    p.set('band', query.band);
  }
  const search = p.toString();
  return search ? `${path}?${search}` : path;
}

/** A species belongs to the league it was ranked in, so changing league goes back to the list. */
export function withLeague(view: View, league: string): View {
  if (view.name === 'about') {
    return view;
  }
  if (view.name === 'teams') {
    return { name: 'teams', league };
  }
  return { name: 'overview', league };
}
