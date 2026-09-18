import { describe, expect, it } from 'vitest';
import { parseTeamPath, teamLink, teamPath, toTeamPicks } from '../src/teamLink.ts';

describe('team links', () => {
  const picks = [
    { speciesId: 'azumarill', moves: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] } },
    { speciesId: 'tinkaton', moves: { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER'] } },
    { speciesId: 'clodsire' },
  ];

  it('prints a readable, URL-safe path and link', () => {
    expect(teamPath('great', picks)).toBe(
      '#/t/great/azumarill.BUBBLE.ICE_BEAM.PLAY_ROUGH+tinkaton.FAIRY_WIND.GIGATON_HAMMER+clodsire',
    );
    expect(teamLink('great', picks)).toBe(
      'https://pick3.gg/#/t/great/azumarill.BUBBLE.ICE_BEAM.PLAY_ROUGH+tinkaton.FAIRY_WIND.GIGATON_HAMMER+clodsire',
    );
    expect(encodeURI(teamPath('great', picks))).toBe(teamPath('great', picks));
  });

  it('round-trips through the parser', () => {
    const path = teamPath('ultra', picks);
    const [league, members] = path.replace('#/t/', '').split('/');
    const r = parseTeamPath(league!, members!);
    expect('team' in r && r.team).toEqual({ league: 'ultra', picks });
    expect('team' in r ? toTeamPicks(r.team) : null).toEqual([
      {
        kind: 'species',
        id: 'azumarill',
        preferOwned: true,
        moves: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
      },
      {
        kind: 'species',
        id: 'tinkaton',
        preferOwned: true,
        moves: { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER'] },
      },
      { kind: 'species', id: 'clodsire', preferOwned: true },
    ]);
  });

  it('explains a bad link instead of throwing', () => {
    const err = (league: string, members: string): string => {
      const r = parseTeamPath(league, members);
      return 'error' in r ? r.error : '';
    };
    expect(err('great', 'azumarill+tinkaton')).toMatch(/three Pokemon/);
    expect(err('great', 'azumarill+tinkaton+azumarill')).toMatch(/three different/);
    expect(err('great', 'Azumarill+tinkaton+clodsire')).toMatch(/not a Pokemon id/);
    expect(err('great', 'azumarill.bubble.ICE_BEAM+tinkaton+clodsire')).toMatch(
      /moves for azumarill/,
    );
    expect(err('great', 'azumarill.BUBBLE+tinkaton+clodsire')).toMatch(/moves for azumarill/);
    expect(err('great', 'azumarill.BUBBLE.A.B.C+tinkaton+clodsire')).toMatch(/moves for azumarill/);
    expect(err('Great League', 'azumarill+tinkaton+clodsire')).toMatch(/no league/);
  });
});
