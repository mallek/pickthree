/**
 * The community team board, read for Build's teammate suggestions and Log a Battle's likely
 * teammates (the same cached read per league and window, the same sharing gate, both silent on
 * failure).
 *
 * This is the app's first outbound READ. The other three calls out (the hit counter, error
 * reports, battle records) all push. Two rules keep it honest:
 *
 *  - The whole board is fetched, never a query naming the pin. The request says which league and
 *    window the player is in and nothing else, so it cannot leak a favorite, let alone a
 *    collection.
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
  window: { since: string; until: string } | null,
): Promise<CommunityPairing[] | null> {
  // A player who turned sharing off is not contributing, so they are not fetching either.
  if (!shareEnabled(settings) || !shareEligible() || !window) {
    return null;
  }
  const key = `${league}|${window.since}|${window.until}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    return hit;
  }
  try {
    const q = new URLSearchParams({ league, since: window.since, until: window.until });
    const res = await fetch(`${COUNTER_ORIGIN}/api/v1/teams?${q.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const cores = coresFrom((await res.json()) as TeamsV1);
    cache.set(key, cores);
    return cores;
  } catch {
    // The chip is a garnish, never an error.
    cache.set(key, null);
    return null;
  }
}

/** Rank Pokemon most often seen on teams with a given opponent. */
export function likelyTeammates(
  cores: CommunityPairing[],
  opponent: string,
  exclude: readonly string[],
  limit = 6,
): string[] {
  // Map of species -> score
  const scores = new Map<string, number>();

  for (const core of cores) {
    // Check if opponent is in this core's pair
    const hasOpponent = core.species.includes(opponent);
    if (!hasOpponent) {
      continue;
    }

    // Get the other member of the pair (if any)
    const pairMember = core.species.find((s) => s !== opponent);

    if (pairMember) {
      // This core pairs the opponent with pairMember
      // Add the sum of all thirds sightings to pairMember's score
      const thirdsSum = core.thirds.reduce((sum, t) => sum + t.sightings, 0);
      scores.set(pairMember, (scores.get(pairMember) ?? 0) + thirdsSum);
    }

    // Add sightings for species that appear as thirds in this core
    for (const third of core.thirds) {
      scores.set(third.speciesId, (scores.get(third.speciesId) ?? 0) + third.sightings);
    }
  }

  // Remove opponent and excluded species
  scores.delete(opponent);
  for (const e of exclude) {
    scores.delete(e);
  }

  // Sort by score descending, then by species id for stable order (ties)
  const sorted = Array.from(scores.entries())
    .sort(([aId, aScore], [bId, bScore]) => {
      if (bScore !== aScore) {
        return bScore - aScore;
      }
      return aId.localeCompare(bId);
    })
    .map(([id]) => id)
    .slice(0, limit);

  return sorted;
}
