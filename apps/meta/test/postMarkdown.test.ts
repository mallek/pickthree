import { describe, expect, it } from 'vitest';
import { linkOf, postMarkdown, teamsJson, type PostRun, type PostTeam } from '../scripts/post/markdown.js';

const team = (a: string, b: string, c: string, strength: number): PostTeam => ({
  species: [a, b, c],
  names: [a, b, c].map((x) => x.replace(/^./, (ch) => ch.toUpperCase())) as [string, string, string],
  moves: [
    ['F1', 'C1', 'C2'],
    ['F2', 'C3'],
    ['F3', 'C4', 'C5'],
  ],
  strength,
  coverage: 90,
  consistency: 70,
  safety: 80,
  structure: 'ABC',
  exposure: [],
});

const run = (withMega: boolean): PostRun => ({
  leagueId: 'mega-great',
  cupTitle: 'Great League: Mega Edition',
  day: new Date('2026-10-06T21:00:00Z'),
  mixLine: 'PvPoke meta only - Oct 6, 2026',
  pvpoke: { commit: 'abc123', date: '2026-09-29' },
  weights: 'prior',
  resimulated: { top: [], budget: ['marowak_alolan'], mega: [] },
  boards: [
    { id: 'top', heading: 'Top Teams', teams: [team('alpha', 'beta', 'gamma', 91.2)] },
    { id: 'budget', heading: 'Budget Builds - No Elite TM', teams: [team('delta', 'beta', 'eps', 88)] },
    ...(withMega
      ? [{ id: 'mega' as const, heading: 'Best Team for Each Mega', teams: [team('venusaur_mega', 'beta', 'gamma', 90)] }]
      : []),
  ],
});

describe('post.md', () => {
  it('links each team with its moves', () => {
    expect(linkOf('mega-great', team('alpha', 'beta', 'gamma', 1))).toBe(
      'https://pick3.gg/#/t/mega-great/alpha.F1.C1.C2+beta.F2.C3+gamma.F3.C4.C5',
    );
  });

  it('titles the post, numbers the teams per board, and explains the number', () => {
    const md = postMarkdown(run(true));
    expect(md.split('\n')[0]).toBe(
      'Title: Great League: Mega Edition: top teams, budget builds and the best team for each Mega (pick3 sims)',
    );
    expect(md).toContain('**Top Teams**');
    expect(md).toContain('1. Alpha / Beta / Gamma - https://pick3.gg/#/t/mega-great/');
    expect(md).toContain('**Best Team for Each Mega**');
    expect(md).toContain('PvPoke meta only - Oct 6, 2026');
    expect(md).toContain('projection, not a measured win rate');
    expect(md).not.toMatch(/[^\t\n\r\x20-\x7e]/);
  });

  it('leaves the Mega clause out when there is no Mega board', () => {
    expect(postMarkdown(run(false)).split('\n')[0]).toBe(
      'Title: Great League: Mega Edition: top teams and budget builds (pick3 sims)',
    );
  });
});

describe('teams.json', () => {
  it('records the run and every row with its link', () => {
    const j = JSON.parse(teamsJson(run(true)));
    expect(j.league).toBe('mega-great');
    expect(j.pvpoke.commit).toBe('abc123');
    expect(j.resimulated.budget).toEqual(['marowak_alolan']);
    expect(j.boards.top[0].link).toMatch(/^https:\/\/pick3\.gg\/#\/t\/mega-great\//);
    expect(j.boards.mega[0].strength).toBe(90);
  });
});
