import { describe, expect, it } from 'vitest';
import {
  assertPostText,
  linkOf,
  postMarkdown,
  postMarkdownCores,
  postTitleCores,
  teamsJson,
  teamsJsonCores,
  type PostCoreRun,
  type PostRun,
  type PostTeam,
} from '../scripts/post/markdown.js';

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
  battles: 412,
  events: 3,
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

const coreRun = (withMega: boolean): PostCoreRun => ({
  leagueId: 'mega-great',
  cupTitle: 'Great League: Mega Edition',
  day: new Date('2026-10-06T21:00:00Z'),
  mixLine: 'PvPoke meta only - Oct 6, 2026',
  pvpoke: { commit: 'abc123', date: '2026-09-29' },
  weights: 'blend',
  battles: 412,
  events: 3,
  resimulated: { cores: [] },
  boards: [
    {
      id: 'top',
      heading: 'Top Cores',
      rows: [
        {
          coreNames: ['Alpha', 'Beta'],
          flexKind: 'regular',
          flex: [
            { name: 'Gamma', team: team('alpha', 'beta', 'gamma', 91.24) },
            { name: 'Eps (Shadow)', team: team('alpha', 'beta', 'eps', 90) },
          ],
        },
      ],
    },
    ...(withMega
      ? [
          {
            id: 'mega' as const,
            heading: 'Best Mega Picks',
            rows: [
              {
                coreNames: ['Delta', 'Beta'] as [string, string],
                flexKind: 'mega' as const,
                flex: [{ name: 'Venusaur (Mega)', team: team('delta', 'beta', 'venusaur_mega', 89.5) }],
              },
            ],
          },
        ]
      : []),
  ],
});

describe('post.md for core boards', () => {
  it('starts with a Title line, with and without a Mega clause, in the same file', () => {
    expect(postTitleCores(coreRun(true))).toBe(
      'Great League: Mega Edition: top cores, budget cores and the best Mega picks (pick3 sims)',
    );
    expect(postTitleCores(coreRun(false))).toBe(
      'Great League: Mega Edition: top cores and budget cores (pick3 sims)',
    );
    expect(postMarkdownCores(coreRun(true)).split('\n')[0]).toBe(
      'Title: Great League: Mega Edition: top cores, budget cores and the best Mega picks (pick3 sims)',
    );
    expect(postMarkdownCores(coreRun(false)).split('\n')[0]).toBe(
      'Title: Great League: Mega Edition: top cores and budget cores (pick3 sims)',
    );
    expect(postMarkdownCores(coreRun(true)).split('\n')[1]).toBe('');
  });

  it('follows the title with the intro paragraph, with the accent and a linked pick3.gg', () => {
    const md = postMarkdownCores(coreRun(true));
    expect(md.split('\n')[2]).toBe(
      'Each row is a core (keep both Pokémon) plus one flex pick for the third slot, ranked by projected strength against the Great League: Mega Edition meta. The flex options under a core are close, so pick whichever you own or like. Every link opens the full team analysis on [pick3.gg](https://pick3.gg), run against your own Pokémon if you have imported them.',
    );
  });

  it('lists each core once with a * bullet per flex: link text is the added Pokemon', () => {
    const md = postMarkdownCores(coreRun(true));
    expect(md).toContain('**Top Cores**');
    expect(md).toContain('\n1. Alpha + Beta -\n');
    expect(md).toContain(
      `   * [Gamma](${linkOf('mega-great', team('alpha', 'beta', 'gamma', 1))}) \\- 91.2\n`,
    );
    expect(md).toMatch(/\n {3}\* \[[^\]]+\]\(https:\/\/pick3\.gg\/#\/t\/mega-great\/[^)\s]+\) \\- 90\.0\n/);
    // No bare URLs and no "add one:" wording: the row line ends with a dash.
    expect(md).not.toMatch(/(^|\s)https:\/\/pick3\.gg/m);
    expect(md).not.toContain('add one:');
    expect(md).not.toContain('add a Mega:');
    expect(md).toContain('\n1. Delta + Beta -\n');
    expect(md).toContain(
      'How the number works: pick3 simulates each team against the Great League: Mega Edition meta, weighted by what players face (PvPoke meta combined with trainer reported matches on pick3). It is a projection, not a measured win rate.',
    );
  });

  it('allows only the e-acute outside 7-bit ASCII in the post text', () => {
    const md = postMarkdownCores(coreRun(true));
    expect(() => assertPostText(md)).not.toThrow();
    expect(md.replace(/é/g, 'e')).not.toMatch(/[^\t\n\r\x20-\x7e]/);
    expect(() => assertPostText('Flabèbè')).toThrow(/U\+00E8/);
  });
});

describe('teams.json for core boards', () => {
  it('records rows with core, flexKind and flex options', () => {
    const j = JSON.parse(teamsJsonCores(coreRun(true)));
    expect(j.battles).toBe(412);
    expect(j.events).toBe(3);
    expect(j.weights).toBe('blend');
    expect(j.pvpoke.commit).toBe('abc123');
    const row = j.boards.top[0];
    expect(row.core).toEqual(['Alpha', 'Beta']);
    expect(row.flexKind).toBe('regular');
    expect(row.flex[0]).toMatchObject({ name: 'Gamma', strength: 91.24, species: ['alpha', 'beta', 'gamma'] });
    expect(row.flex[0].link).toMatch(/^https:\/\/pick3\.gg\/#\/t\/mega-great\//);
    expect(j.boards.mega[0].flexKind).toBe('mega');
  });
});
