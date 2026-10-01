/**
 * meta.pick3.gg retired into pick3's Meta tab (the 2026-09-30 meta-in-pick3 spec). Every page the
 * old site served answers a permanent redirect to the pick3 route that replaced it:
 *
 *   /, /<league>, /<league>/teams   #/meta/teams (Top teams), ?l=<league>
 *   /<league>/pokemon               #/collection?l=<league>
 *   /<league>/p/<id>                #/species/<id>?l=<league>
 *   /about and anything else        #/meta (the landing)
 *
 * The board and species page also carry the window (`window`, or the site's own `w`) as `w` and
 * the source as `src`, each only when it is a value pick3 knows. An id that fails its shape is
 * dropped rather than passed along: a redirect never forwards text it has not checked.
 */

const PICK3 = 'https://pick3.gg/';
const LEAGUE = /^[a-z0-9_-]+$/;
const SPECIES = /^[a-z0-9_]+$/;
const WINDOWS: readonly string[] = ['meta', '30', '7'];
/** The window was `season` before meta epochs existed; an old link lands on This meta. */
const LEGACY_WINDOWS: Readonly<Record<string, string>> = { season: 'meta' };
const SOURCES: readonly string[] = ['all', 'prior', 'ladder', 'tournament'];
/** Long enough for the edge to absorb a burst of old links, short enough to change course. */
const REDIRECT_CACHE = 'public, max-age=3600';

function windowParam(search: URLSearchParams): string | null {
  const raw = search.get('window') ?? search.get('w');
  if (raw === null) {
    return null;
  }
  if (WINDOWS.includes(raw)) {
    return raw;
  }
  return LEGACY_WINDOWS[raw] ?? null;
}

function sourceParam(search: URLSearchParams): string | null {
  const raw = search.get('source');
  return raw !== null && SOURCES.includes(raw) ? raw : null;
}

function route(path: string, params: Array<[string, string | null]>): string {
  const query = params
    .filter((p): p is [string, string] => p[1] !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return query ? `${PICK3}#/${path}?${query}` : `${PICK3}#/${path}`;
}

/** The pick3 URL an old meta.pick3.gg path now lives at. */
export function pick3Location(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  const [first, second, third] = parts;
  if (first === undefined) {
    return route('meta/teams', [
      ['w', windowParam(url.searchParams)],
      ['src', sourceParam(url.searchParams)],
    ]);
  }
  if (first === 'about' || parts.length > 3) {
    return route('meta', []);
  }
  const league = LEAGUE.test(first) ? first : null;
  const w = windowParam(url.searchParams);
  const src = sourceParam(url.searchParams);
  if (second === undefined || (second === 'teams' && third === undefined)) {
    return route('meta/teams', [
      ['l', league],
      ['w', w],
      ['src', src],
    ]);
  }
  if (second === 'pokemon' && third === undefined) {
    return route('collection', [['l', league]]);
  }
  if (second === 'p' && third !== undefined) {
    if (!SPECIES.test(third)) {
      return route('collection', [['l', league]]);
    }
    return route(`species/${third}`, [
      ['l', league],
      ['w', w],
      ['src', src],
    ]);
  }
  return route('meta', []);
}

/** A 301 to the pick3 route that replaced this meta.pick3.gg page. */
export function redirectToPick3(url: URL): Response {
  return new Response(null, {
    status: 301,
    headers: { Location: pick3Location(url), 'Cache-Control': REDIRECT_CACHE },
  });
}
