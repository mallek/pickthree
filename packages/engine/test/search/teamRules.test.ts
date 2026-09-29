import { describe, expect, it } from 'vitest';
import {
  ruleKeyOf,
  teamRuleViolation,
  trioBreaksRules,
  type RuleKey,
} from '../../src/search/teamRules.js';

const plain = (specimenId: string, speciesId = specimenId) => ({
  specimenId,
  speciesId,
  mega: null,
});
const mega = (specimenId: string, speciesId = `${specimenId}_mega`) => ({
  specimenId,
  speciesId,
  mega: { ready: true, level4: false },
});
/** Folds `<x>_mega` back to `<x>`, the shape of index.mustSpecies(id).megaOf ?? id. */
const baseOf = (id: string): string => id.replace(/_mega$/, '');

describe('teamRuleViolation', () => {
  it('flags one specimen used twice, such as a base build and its Mega', () => {
    expect(teamRuleViolation([plain('a'), mega('a'), plain('b')], baseOf)).toBe('same-specimen');
    expect(teamRuleViolation([plain('a'), plain('a')])).toBe('same-specimen');
  });

  it('flags a species and its Mega from two different specimens', () => {
    const team = [plain('s1', 'charizard'), mega('s2', 'charizard_mega'), plain('s3', 'b')];
    expect(teamRuleViolation(team, baseOf)).toBe('same-species');
  });

  it('flags the same species from two specimens', () => {
    expect(teamRuleViolation([plain('s1', 'x'), plain('s2', 'x')], baseOf)).toBe('same-species');
  });

  it('flags two Megas of different species', () => {
    expect(teamRuleViolation([mega('a'), mega('b'), plain('c')], baseOf)).toBe('two-megas');
  });

  it('allows one Mega, and teams with none', () => {
    expect(teamRuleViolation([mega('a'), plain('b'), plain('c')], baseOf)).toBeNull();
    expect(teamRuleViolation([plain('a'), plain('b'), plain('c')], baseOf)).toBeNull();
    expect(teamRuleViolation([])).toBeNull();
  });

  it('reports the same specimen before the same species before two Megas', () => {
    expect(teamRuleViolation([mega('a'), mega('a')], baseOf)).toBe('same-specimen');
    expect(teamRuleViolation([mega('a', 'x_mega'), mega('b', 'x_mega')], baseOf)).toBe(
      'same-species',
    );
  });
});

describe('trioBreaksRules', () => {
  it('agrees with teamRuleViolation on every trio of a mixed pool', () => {
    const pool = [
      plain('s1', 'x'),
      mega('s1', 'x_mega'),
      mega('s2', 'x_mega'),
      plain('s3', 'x'),
      mega('s4', 'y_mega'),
      plain('s5', 'y'),
      plain('s6', 'z'),
      mega('s7', 'z_mega'),
    ];
    const keys: RuleKey[] = pool.map((b) => ruleKeyOf(b, baseOf));
    let legal = 0;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        for (let k = j + 1; k < pool.length; k++) {
          const broken = teamRuleViolation([pool[i]!, pool[j]!, pool[k]!], baseOf) !== null;
          expect(trioBreaksRules(keys[i]!, keys[j]!, keys[k]!)).toBe(broken);
          legal += broken ? 0 : 1;
        }
      }
    }
    expect(legal).toBeGreaterThan(0);
  });
});
