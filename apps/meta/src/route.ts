/**
 * Real paths, not a hash: this is a public site other people link to. The worker's static-asset
 * SPA fallback is what makes /great/p/azumarill load index.html.
 */
import type { WindowKey } from '@pickthree/engine/meta';

export type { WindowKey } from '@pickthree/engine/meta';
/** Which population a view is built from. `prior` is PvPoke's curated list alone and needs no
 *  worker call at all: it is served from the bake. */
export type SourceKey = 'all' | 'prior' | 'ladder' | 'tournament';

export type View =
  | { name: 'teams'; league: string }
  | { name: 'pokemon'; league: string }
  | { name: 'species'; league: string; speciesId: string }
  | { name: 'about' };

export interface Query {
  w: WindowKey;
  source: SourceKey;
}

export const WINDOWS: readonly WindowKey[] = ['meta', '30', '7'];
export const SOURCES: readonly SourceKey[] = ['all', 'prior', 'ladder', 'tournament'];
export const DEFAULT_QUERY: Query = { w: 'meta', source: 'all' };

/** The window key was `season` before meta epochs existed. An old link keeps working. */
const LEGACY_WINDOWS: Record<string, WindowKey> = { season: 'meta' };

/** `band=` was the rank band filter, retired with the band axis (the 2026-09-21 tournament data
 *  spec). It is not mapped to anything: every old link lands on All, which is what it showed. */

const SPECIES = /^[a-z0-9_]+$/;

function readQuery(search: string): Query {
  const p = new URLSearchParams(search);
  const raw = p.get('w') ?? '';
  const w = WINDOWS.includes(raw as WindowKey)
    ? (raw as WindowKey)
    : (LEGACY_WINDOWS[raw] ?? DEFAULT_QUERY.w);
  const source = p.get('source');
  return {
    w,
    source: SOURCES.includes(source as SourceKey) ? (source as SourceKey) : DEFAULT_QUERY.source,
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
  if (b === 'pokemon') {
    return { view: { name: 'pokemon', league }, query };
  }
  if (b === 'p' && c && SPECIES.test(c)) {
    return { view: { name: 'species', league, speciesId: c }, query };
  }
  // Teams is the league root now. /<league>/teams still parses here, and hrefFor writes
  // /<league>, so App's canonicalise effect rewrites the old path in place rather than 404ing.
  return { view: { name: 'teams', league }, query };
}

export function hrefFor(view: View, query: Query): string {
  const path =
    view.name === 'about'
      ? '/about'
      : view.name === 'pokemon'
        ? `/${view.league}/pokemon`
        : view.name === 'species'
          ? `/${view.league}/p/${view.speciesId}`
          : `/${view.league}`;
  const p = new URLSearchParams();
  if (query.w !== DEFAULT_QUERY.w) {
    p.set('w', query.w);
  }
  if (query.source !== DEFAULT_QUERY.source) {
    p.set('source', query.source);
  }
  const search = p.toString();
  return search ? `${path}?${search}` : path;
}

/** A species belongs to the league it was ranked in, so changing league goes back to the list. */
export function withLeague(view: View, league: string): View {
  if (view.name === 'about') {
    return view;
  }
  if (view.name === 'pokemon' || view.name === 'species') {
    return { name: 'pokemon', league };
  }
  return { name: 'teams', league };
}
