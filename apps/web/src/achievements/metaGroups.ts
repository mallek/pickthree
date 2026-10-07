const cache = new Map<string, Promise<string[]>>();

/**
 * The species ids in a league's PvPoke meta group, from the app's own /data. A missing file or a
 * failed read is an empty group and is retried on the next call; it never throws.
 */
export function loadMetaGroup(league: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const hit = cache.get(league);
  if (hit) {
    return hit;
  }
  const p = (async () => {
    try {
      const res = await fetcher(`/data/meta/${league}.json`);
      if (!res.ok) {
        cache.delete(league);
        return [];
      }
      const rows = (await res.json()) as { speciesId?: unknown }[];
      return rows.map((r) => r.speciesId).filter((id): id is string => typeof id === 'string');
    } catch {
      cache.delete(league);
      return [];
    }
  })();
  cache.set(league, p);
  return p;
}

export function resetMetaGroupsForTests(): void {
  cache.clear();
}
