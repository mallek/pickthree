import type { Build } from '../builds/eligibility.js';

export type TeamRuleViolation = 'same-specimen' | 'two-megas';

/**
 * The two rules every team obeys: each Pokemon is used once (a specimen yields both a base build
 * and Mega builds, and only one of them can play), and at most one of the three is a Mega.
 * Returns the first rule the builds break, or null when they are a legal team or partial team.
 */
export function teamRuleViolation(
  builds: readonly Pick<Build, 'specimenId' | 'mega'>[],
): TeamRuleViolation | null {
  const seen = new Set<string>();
  for (const b of builds) {
    if (seen.has(b.specimenId)) {
      return 'same-specimen';
    }
    seen.add(b.specimenId);
  }
  if (builds.filter((b) => Boolean(b.mega)).length > 1) {
    return 'two-megas';
  }
  return null;
}
