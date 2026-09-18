/**
 * The static side of the site: species names, move names, leagues and the season calendar, baked
 * out of the data build by scripts/bake.ts. All of it is small, same-origin and cacheable, so it
 * is fetched once per page load and kept.
 */
import { ascii, shortName } from './format.js';

export interface SpeciesLite {
  id: string;
  /** As the data build names it, e.g. "Corsola (Galarian)", folded to ASCII. */
  name: string;
  short: string;
  dex: number;
  types: string[];
  shadow: boolean;
}
export interface MoveLite {
  id: string;
  name: string;
  type: string;
}
export interface League {
  id: string;
  title: string;
  short: string;
  cp: number;
}
export interface Season {
  id: number;
  name: string;
  start: string;
}
export interface StaticData {
  species: Map<string, SpeciesLite>;
  moves: Map<string, MoveLite>;
  leagues: League[];
  seasons: Season[];
}

type SpeciesFile = Record<string, [string, number, string]>;
type MovesFile = Record<string, [string, string]>;

async function json<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`Could not load ${url} (${res.status})`);
  }
  return (await res.json()) as T;
}

let cached: Promise<StaticData> | null = null;

/** Fetches the four baked files once and shapes them. Memoised per page load. */
export function loadStatic(fetcher: typeof fetch = fetch): Promise<StaticData> {
  if (!cached) {
    cached = build(fetcher).catch((err: unknown) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** Tests only: forget the memoised load so the next call uses a fresh stub. */
export function resetStatic(): void {
  cached = null;
}

async function build(fetcher: typeof fetch): Promise<StaticData> {
  const [speciesFile, movesFile, leagues, seasons] = await Promise.all([
    json<SpeciesFile>('/species.json', fetcher),
    json<MovesFile>('/moves.json', fetcher),
    json<League[]>('/leagues.json', fetcher),
    json<Season[]>('/seasons.json', fetcher),
  ]);
  const species = new Map<string, SpeciesLite>();
  for (const [id, entry] of Object.entries(speciesFile)) {
    const name = ascii(entry[0]);
    species.set(id, {
      id,
      name,
      short: shortName(name),
      dex: entry[1],
      types: entry[2] ? entry[2].split(',') : [],
      shadow: id.endsWith('_shadow'),
    });
  }
  const moves = new Map<string, MoveLite>();
  for (const [id, entry] of Object.entries(movesFile)) {
    moves.set(id, { id, name: ascii(entry[0]), type: entry[1] });
  }
  return { species, moves, leagues, seasons };
}

/** A species id we have no entry for still renders, rather than blanking a row. */
export function speciesOf(data: StaticData, id: string): SpeciesLite {
  const known = data.species.get(id);
  if (known) {
    return known;
  }
  const name = id
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
  return { id, name, short: name, dex: 0, types: [], shadow: id.endsWith('_shadow') };
}

/** The season covering an instant, or the newest one that started before it. */
export function seasonAt(seasons: readonly Season[], at: Date): Season | null {
  let best: Season | null = null;
  for (const s of seasons) {
    const start = Date.parse(s.start);
    if (Number.isFinite(start) && start <= at.getTime()) {
      if (!best || start > Date.parse(best.start)) {
        best = s;
      }
    }
  }
  return best;
}
