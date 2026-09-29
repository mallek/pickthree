import { describe, expect, it } from 'vitest';
import { teamRuleViolation } from '../../src/search/teamRules.js';

const plain = (specimenId: string) => ({ specimenId, mega: null });
const mega = (specimenId: string) => ({ specimenId, mega: { ready: true, level4: false } });

describe('teamRuleViolation', () => {
  it('flags one specimen used twice, such as a base build and its Mega', () => {
    expect(teamRuleViolation([plain('a'), mega('a'), plain('b')])).toBe('same-specimen');
    expect(teamRuleViolation([plain('a'), plain('a')])).toBe('same-specimen');
  });

  it('flags two Megas from different specimens', () => {
    expect(teamRuleViolation([mega('a'), mega('b'), plain('c')])).toBe('two-megas');
  });

  it('allows one Mega, and teams with none', () => {
    expect(teamRuleViolation([mega('a'), plain('b'), plain('c')])).toBeNull();
    expect(teamRuleViolation([plain('a'), plain('b'), plain('c')])).toBeNull();
    expect(teamRuleViolation([])).toBeNull();
  });

  it('reports the same specimen before two Megas', () => {
    expect(teamRuleViolation([mega('a'), mega('a')])).toBe('same-specimen');
  });
});
