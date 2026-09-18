/**
 * PvPoke's curated meta group for a league, baked in at build time. It is the site's seed until a
 * league has enough measured battles of its own, and it is labelled as PvPoke's list wherever it
 * appears. It is never described with a measured word.
 */
export interface BaselineSpecies {
  speciesId: string;
  score: number | null;
  rating: number | null;
  fastMove: string;
  chargedMoves: string[];
  fastUsage: { moveId: string; uses: number }[];
  chargedUsage: { moveId: string; uses: number }[];
}

export interface Baseline {
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  species: BaselineSpecies[];
  byId: Map<string, BaselineSpecies>;
}

interface BaselineFile {
  league: string;
  source: 'pvpoke';
  pvpokeCommit: string;
  pvpokeDate: string;
  species: BaselineSpecies[];
}

const cache = new Map<string, Promise<Baseline>>();

export function loadBaseline(league: string, fetcher: typeof fetch = fetch): Promise<Baseline> {
  const held = cache.get(league);
  if (held) {
    return held;
  }
  const pending = (async (): Promise<Baseline> => {
    const res = await fetcher(`/baseline/${league}.json`);
    if (!res.ok) {
      throw new Error(`No PvPoke list for ${league} (${res.status})`);
    }
    const file = (await res.json()) as BaselineFile;
    return {
      league: file.league,
      pvpokeCommit: file.pvpokeCommit,
      pvpokeDate: file.pvpokeDate,
      species: file.species,
      byId: new Map(file.species.map((s) => [s.speciesId, s])),
    };
  })().catch((err: unknown) => {
    cache.delete(league);
    throw err;
  });
  cache.set(league, pending);
  return pending;
}

/** Tests only: forget memoised baselines so the next call uses a fresh stub. */
export function resetBaselines(): void {
  cache.clear();
}
