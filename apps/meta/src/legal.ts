/**
 * The Play! ban list for a league, baked next to the baselines (apps/meta/scripts/bake.ts's
 * legalFor). It is what lets a page print "banned at tournaments" rather than a zero: zero says
 * nobody picked it, which is false; missing says not observable in this population.
 *
 * A 404 is not an error here. An older bake has no legal/ directory, and a site that refused to
 * render because it could not find a ban list would be worse than one that shows no bans.
 */
export interface Legal {
  league: string;
  /** The open-equivalent tournament cup, or null when the league has no Play! format. */
  cup: string | null;
  banned: Set<string>;
}

interface LegalFile {
  cup: string | null;
  banned: string[];
}

const cache = new Map<string, Promise<Legal>>();

export function loadLegal(league: string, fetcher: typeof fetch = fetch): Promise<Legal> {
  const held = cache.get(league);
  if (held) {
    return held;
  }
  const pending = (async (): Promise<Legal> => {
    const res = await fetcher(`/legal/${league}.json`);
    if (!res.ok) {
      return { league, cup: null, banned: new Set<string>() };
    }
    const file = (await res.json()) as LegalFile;
    return { league, cup: file.cup ?? null, banned: new Set(file.banned ?? []) };
  })().catch((err: unknown) => {
    cache.delete(league);
    throw err;
  });
  cache.set(league, pending);
  return pending;
}

/** Tests only: forget memoised lists so the next call uses a fresh stub. */
export function resetLegal(): void {
  cache.clear();
}
