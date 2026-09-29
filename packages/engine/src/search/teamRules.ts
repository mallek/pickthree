import type { Build } from '../builds/eligibility.js';

export type TeamRuleViolation = 'same-specimen' | 'same-species' | 'two-megas';

/** What the team rules read from one build, precomputed once per candidate for hot loops. */
export interface RuleKey {
  specimenId: string;
  /** The species with any Mega folded back to its base form, so a Mega and its base collide. */
  baseId: string;
  isMega: boolean;
}

type Ruled = Pick<Build, 'specimenId' | 'speciesId' | 'mega'>;

export function ruleKeyOf(build: Ruled, baseOf: (speciesId: string) => string): RuleKey {
  return {
    specimenId: build.specimenId,
    baseId: baseOf(build.speciesId),
    isMega: Boolean(build.mega),
  };
}

/**
 * True when three candidates break a team rule. Allocation-free, for the trio loops; agrees with
 * teamRuleViolation, which names the rule.
 */
export function trioBreaksRules(a: RuleKey, b: RuleKey, c: RuleKey): boolean {
  return (
    a.specimenId === b.specimenId ||
    a.specimenId === c.specimenId ||
    b.specimenId === c.specimenId ||
    a.baseId === b.baseId ||
    a.baseId === c.baseId ||
    b.baseId === c.baseId ||
    (a.isMega && b.isMega) ||
    (a.isMega && c.isMega) ||
    (b.isMega && c.isMega)
  );
}

/**
 * The rules every team obeys: each specimen is used once (it yields a base build and Mega builds,
 * and only one can play), each species is used once counting a Mega as its base form (GBL rejects
 * Charizard plus Mega Charizard Y from two specimens), and at most one of the three is a Mega.
 * Returns the first rule the builds break, or null for a legal team or partial team. `baseOf`
 * folds a Mega species id to its base; it defaults to the id itself.
 */
export function teamRuleViolation(
  builds: readonly Ruled[],
  baseOf: (speciesId: string) => string = (id) => id,
): TeamRuleViolation | null {
  const keys = builds.map((b) => ruleKeyOf(b, baseOf));
  const specimens = new Set<string>();
  for (const k of keys) {
    if (specimens.has(k.specimenId)) {
      return 'same-specimen';
    }
    specimens.add(k.specimenId);
  }
  const species = new Set<string>();
  for (const k of keys) {
    if (species.has(k.baseId)) {
      return 'same-species';
    }
    species.add(k.baseId);
  }
  if (keys.filter((k) => k.isMega).length > 1) {
    return 'two-megas';
  }
  return null;
}
