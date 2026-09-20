/**
 * The community team board, read for the Suggest teammates chip.
 *
 * This is the app's first outbound READ. The other three calls out (the hit counter, error
 * reports, battle records) all push. Two rules keep it honest:
 *
 *  - The whole board is fetched, never a query naming the pin. The request says which league the
 *    player is in and nothing else, so it cannot leak a favorite, let alone a collection.
 *  - It fails silent. Offline, blocked, rate limited or empty, the community chip is simply
 *    absent and the other characters are untouched, because the board only ever reorders cores
 *    the matrix already produced.
 *
 * Spec: docs/superpowers/specs/2026-09-19-suggest-teammates-design.md
 */
import type { CommunityPairing } from '@pickthree/engine';
import { COUNTER_ORIGIN } from './counter.ts';
import { shareEligible, shareEnabled } from './metaShare.ts';
import type { Settings } from './storage/db.ts';

interface TeamRowV1 {
  species: string[];
  kind: 'core' | 'team';
  thirds?: { speciesId: string; sightings: number }[];
}

interface TeamsV1 {
  cores?: TeamRowV1[];
}

/** One fetch per league per session. A null entry remembers that it did not work. */
const cache = new Map<string, CommunityPairing[] | null>();

export function resetCommunityCache(): void {
  cache.clear();
}

/** Only the pairs, and only the fields the engine reads. */
export function coresFrom(body: TeamsV1): CommunityPairing[] {
  return (body.cores ?? [])
    .filter((r) => r.kind === 'core' && r.species.length === 2 && (r.thirds?.length ?? 0) > 0)
    .map((r) => ({ species: [...r.species], thirds: [...(r.thirds ?? [])] }));
}

export async function communityCores(
  settings: Settings,
  league: string,
): Promise<CommunityPairing[] | null> {
  // A player who turned sharing off is not contributing, so they are not fetching either.
  if (!shareEnabled(settings) || !shareEligible()) {
    return null;
  }
  const hit = cache.get(league);
  if (hit !== undefined) {
    return hit;
  }
  try {
    const res = await fetch(
      `${COUNTER_ORIGIN}/api/v1/teams?league=${encodeURIComponent(league)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      cache.set(league, null);
      return null;
    }
    const cores = coresFrom((await res.json()) as TeamsV1);
    cache.set(league, cores);
    return cores;
  } catch {
    // The chip is a garnish, never an error.
    cache.set(league, null);
    return null;
  }
}
