/**
 * The measured side: the worker's v1 read endpoints. Same origin in production; the Vite dev
 * server proxies /api to the deployed worker, so connect-src stays 'self' everywhere.
 *
 * The wire shapes below are written down again rather than imported from workers/counter: this app
 * does not depend on that workspace, and a format written on both sides is the contract. They must
 * match workers/counter/src/meta.ts exactly.
 */
import type { Season } from './data.js';
import type { BandKey, WindowKey } from './route.js';

export interface SpeciesStats {
  speciesId: string;
  sightings: number;
  wins: number;
  losses: number;
  runs: number;
  runWins: number;
  runLosses: number;
}
export interface MovesetStats {
  fast: string;
  charged: string[];
  battles: number;
}
export interface TeamStats {
  species: [string, string, string];
  battles: number;
  wins: number;
  losses: number;
  moves: (MovesetStats | null)[];
}
export interface MetaSummaryV1 {
  league: string;
  since: string;
  until: string;
  band: string;
  battles: number;
  tanked: number;
  devices: number;
  bands: Record<string, number>;
  species: SpeciesStats[];
  teams: TeamStats[];
  previous: { battles: number; species: { speciesId: string; sightings: number }[] } | null;
  generatedAt: string;
}
export interface SpeciesDetailV1 {
  league: string;
  speciesId: string;
  since: string;
  until: string;
  band: string;
  sightings: number;
  wins: number;
  losses: number;
  runs: number;
  runWins: number;
  runLosses: number;
  weekly: { week: string; battles: number; sightings: number }[];
  bands: { band: string; sightings: number; wins: number; losses: number }[];
  alongside: { speciesId: string; battles: number }[];
  movesets: MovesetStats[];
  generatedAt: string;
}

export interface ApiWindow {
  since: string;
  until: string;
  label: string;
  key: WindowKey;
}

/** Ten minute buckets, so every reader in a slice asks the edge for the same url. */
export const BUCKET_MS = 600_000;
const DAY_MS = 86_400_000;

/** Rounds up to the next ten minute boundary. An exact boundary stays where it is. */
function bucketUp(now: Date): number {
  return Math.ceil(now.getTime() / BUCKET_MS) * BUCKET_MS;
}

function seasonStart(seasons: readonly Season[], at: number): number | null {
  let best: number | null = null;
  for (const s of seasons) {
    const start = Date.parse(s.start);
    if (Number.isFinite(start) && start <= at && (best === null || start > best)) {
      best = start;
    }
  }
  return best;
}

export function resolveWindow(key: WindowKey, seasons: readonly Season[], now: Date): ApiWindow {
  const until = bucketUp(now);
  if (key === 'season') {
    const start = seasonStart(seasons, until);
    if (start !== null) {
      return {
        since: new Date(start).toISOString(),
        until: new Date(until).toISOString(),
        label: 'This season',
        key,
      };
    }
    // No season covers this moment, so say what is really being measured instead of guessing.
    return { ...resolveWindow('30', seasons, now), key: 'season' };
  }
  const days = key === '7' ? 7 : 30;
  return {
    since: new Date(until - days * DAY_MS).toISOString(),
    until: new Date(until).toISOString(),
    label: `${days} days`,
    key,
  };
}

function search(league: string, w: ApiWindow, band: BandKey): string {
  const p = new URLSearchParams({ league, since: w.since, until: w.until });
  if (band !== 'all') {
    p.set('band', band);
  }
  return p.toString();
}

export function metaUrl(league: string, w: ApiWindow, band: BandKey): string {
  return `/api/v1/meta?${search(league, w, band)}`;
}

export function speciesUrl(league: string, id: string, w: ApiWindow, band: BandKey): string {
  return `/api/v1/species/${encodeURIComponent(id)}?${search(league, w, band)}`;
}

async function get<T>(
  url: string,
  opts: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<T> {
  const fetcher = opts.fetcher ?? fetch;
  const res = await fetcher(url, opts.signal ? { signal: opts.signal } : {});
  if (!res.ok) {
    let reason = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      reason = body.error ?? reason;
    } catch {
      // A non-JSON error body is still an error; the status is enough to report.
    }
    throw new Error(reason);
  }
  return (await res.json()) as T;
}

export function fetchMeta(
  league: string,
  w: ApiWindow,
  band: BandKey,
  opts: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<MetaSummaryV1> {
  return get<MetaSummaryV1>(metaUrl(league, w, band), opts);
}

export function fetchSpecies(
  league: string,
  id: string,
  w: ApiWindow,
  band: BandKey,
  opts: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<SpeciesDetailV1> {
  return get<SpeciesDetailV1>(speciesUrl(league, id, w, band), opts);
}
