/**
 * Links out of this site. Every list here deep-links into pick3, which is the point of the site:
 * see what you will face, then go build against it.
 */

export const PICK3 = 'https://pick3.gg';

export interface LinkMember {
  speciesId: string;
  moves?: { fast: string; charged: string[] } | null;
}

/**
 * The team link format pick3 parses (apps/web/src/teamLink.ts): a member is its species id,
 * optionally followed by `.FAST.CHARGED[.CHARGED]`. A member with no moves runs the set pick3
 * recommends, which is the honest thing to do when we do not know what was run.
 */
export function teamLink(league: string, members: readonly LinkMember[]): string {
  const parts = members.map((m) =>
    m.moves ? [m.speciesId, m.moves.fast, ...m.moves.charged].join('.') : m.speciesId,
  );
  return `${PICK3}/#/t/${league}/${parts.join('+')}`;
}

export function countersLink(league: string, speciesId: string): string {
  return `${PICK3}/#/counters?vs=${encodeURIComponent(speciesId)}&l=${encodeURIComponent(league)}`;
}

/** Shadow forms share the base form's sprite, exactly as pick3 does it. */
export function spriteUrl(speciesId: string): string {
  return `${PICK3}/data/sprites/${speciesId.replace(/_shadow$/, '')}.webp`;
}
