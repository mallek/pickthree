import type { Build } from '../builds/eligibility.js';

export type TeamRuleViolation = 'same-specimen' | 'same-species' | 'two-megas';

/** What the team rules read from one build, precomputed once per candidate for hot loops. */
export interface RuleKey {
  specimenId: string;
  /** The species with any Mega folded back to its base form, so a Mega and its base collide. */
  teamSpecies: string;
  isMega: boolean;
}

type Ruled = Pick<Build, 'specimenId' | 'speciesId' | 'mega'>;

/**
 * Folds a species id to the species it counts as on a team: a Mega to its base form, anything
 * else to itself. Not GameDataIndex.baseOf, which strips `_shadow`.
 */
export type TeamSpeciesOf = (speciesId: string) => string;

export function ruleKeyOf(build: Ruled, teamSpeciesOf: TeamSpeciesOf): RuleKey {
  return {
    specimenId: build.specimenId,
    teamSpecies: teamSpeciesOf(build.speciesId),
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
    a.teamSpecies === b.teamSpecies ||
    a.teamSpecies === c.teamSpecies ||
    b.teamSpecies === c.teamSpecies ||
    (a.isMega && b.isMega) ||
    (a.isMega && c.isMega) ||
    (b.isMega && c.isMega)
  );
}

/**
 * The rules every team obeys: each specimen is used once (it yields a base build and Mega builds,
 * and only one can play), each species is used once counting a Mega as its base form (GBL rejects
 * Charizard plus Mega Charizard Y from two specimens), and at most one of the three is a Mega.
 * Returns the first rule the builds break, or null for a legal team or partial team.
 */
export function teamRuleViolation(
  builds: readonly Ruled[],
  teamSpeciesOf: TeamSpeciesOf,
): TeamRuleViolation | null {
  const keys = builds.map((b) => ruleKeyOf(b, teamSpeciesOf));
  const specimens = new Set<string>();
  for (const k of keys) {
    if (specimens.has(k.specimenId)) {
      return 'same-specimen';
    }
    specimens.add(k.specimenId);
  }
  const species = new Set<string>();
  for (const k of keys) {
    if (species.has(k.teamSpecies)) {
      return 'same-species';
    }
    species.add(k.teamSpecies);
  }
  if (keys.filter((k) => k.isMega).length > 1) {
    return 'two-megas';
  }
  return null;
}
