import { describe, expect, it } from 'vitest';
import { parseTeamPath, teamLink, teamPath } from '../../src/share/teamLink.js';

describe('team links in the engine', () => {
  const picks = [
    { speciesId: 'venusaur_mega', moves: { fast: 'VINE_WHIP', charged: ['FRENZY_PLANT', 'SLUDGE_BOMB'] } },
    { speciesId: 'kingdra_shadow', moves: { fast: 'DRAGON_BREATH', charged: ['SURF', 'SWIFT'] } },
    { speciesId: 'magnezone', moves: { fast: 'VOLT_SWITCH', charged: ['WILD_CHARGE'] } },
  ];

  it('round-trips a league id with a hyphen', () => {
    const path = teamPath('mega-great', picks);
    expect(path.startsWith('#/t/mega-great/')).toBe(true);
    const [league, members] = path.replace('#/t/', '').split('/');
    const r = parseTeamPath(league!, members!);
    expect('team' in r && r.team).toEqual({ league: 'mega-great', picks });
  });

  it('prints the pick3.gg link for a hyphenated league', () => {
    expect(teamLink('mega-great', picks)).toBe(`https://pick3.gg/${teamPath('mega-great', picks)}`);
  });

  it('still rejects a league with spaces or capitals', () => {
    const r = parseTeamPath('Great League', 'a+b+c');
    expect('error' in r ? r.error : '').toMatch(/no league/);
  });

  it('keeps species ids strict: a hyphen in a species id is not readable', () => {
    const r = parseTeamPath('great', 'ho-oh+b+c');
    expect('error' in r ? r.error : '').toMatch(/not a Pokemon id/);
  });
});
