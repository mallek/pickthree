/**
 * The per-league matchup slice and rank order, fetched lazily the way baselines already are.
 * Roughly the top 250 species by PvPoke rank, measured at 61 KB gzipped for Great League, which
 * is what lets the browser project a team with no simulator.
 *
 * A team or core with ANY member outside the slice gets no projection, rather than a partial one
 * computed from the members that happen to be covered: a projection missing a member is not a
 * weaker projection, it is a wrong one. `teamRank.ts` enforces that; this module only says who
 * has a row, through `MatrixView.rowOf` returning null.
 */
import { MatrixView, type MatchupMatrix } from '@pickthree/engine/meta';

/** One baked generated team. The strength was scored against PvPoke's prior at bake time; the
 *  site recomputes it against the blended weights whenever the slice is in hand. */
export interface GeneratedTeamLite {
  species: [string, string, string];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  structure: 'ABB' | 'ABC';
  exposure: string[];
}

export interface GeneratedFile {
  league: string;
  source: 'generated';
  pvpokeCommit: string;
  pvpokeDate: string;
  projectionSlope: number;
  teams: GeneratedTeamLite[];
}

export interface Slice {
  league: string;
  pvpokeCommit: string;
  view: MatrixView;
}

interface SliceFile {
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  matrix: MatchupMatrix;
}

interface RanksFile {
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  order: string[];
}

const slices = new Map<string, Promise<Slice>>();
const ranks = new Map<string, Promise<string[]>>();
const generated = new Map<string, Promise<GeneratedFile>>();

/** Memoise a load per league, but never memoise a failure: a slice that failed once because the
 *  network was down must be loadable on the next render. */
function once<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  const held = cache.get(key);
  if (held) {
    return held;
  }
  const pending = make().catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, pending);
  return pending;
}

async function json<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`Could not load ${url} (${res.status})`);
  }
  return (await res.json()) as T;
}

export function loadSlice(league: string, fetcher: typeof fetch = fetch): Promise<Slice> {
  return once(slices, league, async () => {
    const file = await json<SliceFile>(`/matrix/${league}.json`, fetcher);
    return {
      league: file.league,
      pvpokeCommit: file.pvpokeCommit,
      view: new MatrixView(file.matrix),
    };
  });
}

export function loadRanks(league: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  return once(
    ranks,
    league,
    async () => (await json<RanksFile>(`/ranks/${league}.json`, fetcher)).order,
  );
}

export function loadGenerated(league: string, fetcher: typeof fetch = fetch): Promise<GeneratedFile> {
  return once(generated, league, () =>
    json<GeneratedFile>(`/baseline/${league}-teams.json`, fetcher),
  );
}

/** Tests only: forget the memoised loads so the next call uses a fresh stub. */
export function resetSlices(): void {
  slices.clear();
  ranks.clear();
  generated.clear();
}
