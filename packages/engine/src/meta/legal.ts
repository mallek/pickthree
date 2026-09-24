/**
 * The tournament cup each site league's Play! events are played under. Only events on this cup
 * enter that league's blend (Sao Paulo's laic2027 bans four types and fifteen named species;
 * pooling it into a Great League ranking would be nonsense). Ultra and Master have no Play!
 * format and get a null cup and an empty ban list.
 *
 * The counter worker keeps its own copy in workers/counter/src/tournament.ts: neither workspace
 * depends on the other, so the rule is written down on both sides and that pair is the contract.
 * Each copy is asserted by its own test (test/meta/legal.test.ts here, test/tournament.test.ts
 * in the worker).
 */
export const OPEN_EQUIVALENT_CUP: Record<string, string> = { great: 'championshipseries' };

export interface LegalFile {
  /** The open-equivalent tournament cup, or null when the league has no Play! format. */
  cup: string | null;
  /** Species the league's ranking lists that the cup does not: what "banned" means on a page. */
  banned: string[];
}

/** The league's ranked species minus the cup's, in the league's own ranking order. */
export function legalFor(
  leagueId: string,
  leagueRanks: readonly { speciesId: string }[],
  cupRanks: readonly { speciesId: string }[] | null,
): LegalFile {
  const cup = OPEN_EQUIVALENT_CUP[leagueId] ?? null;
  if (cup === null || cupRanks === null) {
    return { cup: null, banned: [] };
  }
  const allowed = new Set(cupRanks.map((r) => r.speciesId));
  const banned: string[] = [];
  const seen = new Set<string>();
  for (const r of leagueRanks) {
    if (!allowed.has(r.speciesId) && !seen.has(r.speciesId)) {
      seen.add(r.speciesId);
      banned.push(r.speciesId);
    }
  }
  return { cup, banned };
}
