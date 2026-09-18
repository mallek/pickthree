import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { resetBaselines } from '../src/baseline.js';
import { resetStatic } from '../src/data.js';
import { stubFetch } from './stubs/stubFetch.js';

const now = (): Date => new Date('2026-09-18T12:00:00.000Z');

beforeEach(() => {
  resetStatic();
  resetBaselines();
  window.history.replaceState(null, '', '/great/teams');
});

const teams = [
  {
    species: ['azumarill', 'clodsire', 'tinkaton'] as [string, string, string],
    battles: 1240,
    wins: 670,
    losses: 570,
    moves: [
      { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], battles: 900 },
      null,
      { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER'], battles: 700 },
    ],
  },
  {
    species: ['lanturn', 'medicham', 'registeel'] as [string, string, string],
    battles: 21,
    wins: 13,
    losses: 8,
    moves: [null, null, null],
  },
];

describe('Teams', () => {
  it('lists teams with their win rate and how much to trust it', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta: { battles: 1500, devices: 90, teams } }), now }} />);
    expect(await screen.findByText('Azumarill + Clodsire + Tinkaton')).toBeInTheDocument();
    expect(screen.getByText('1,240 battles')).toBeInTheDocument();
    expect(screen.getByText('54%')).toBeInTheDocument();
    expect(screen.getByText('Real win rate likely within +/-3 pts')).toBeInTheDocument();
  });

  it('warns loudly on a small team sample', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta: { battles: 1500, devices: 90, teams } }), now }} />);
    expect(
      await screen.findByText('Only 21 battles, could easily be 40% or 84%'),
    ).toBeInTheDocument();
    expect(screen.getByText('few')).toBeInTheDocument();
  });

  it('deep links into pick3 with the movesets it knows and without the ones it does not', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta: { battles: 1500, devices: 90, teams } }), now }} />);
    const links = await screen.findAllByRole('link', { name: /Open in pick3/ });
    expect(links[0]).toHaveAttribute(
      'href',
      'https://pick3.gg/#/t/great/azumarill.BUBBLE.ICE_BEAM.PLAY_ROUGH+clodsire+tinkaton.FAIRY_WIND.GIGATON_HAMMER',
    );
    expect(links[1]).toHaveAttribute(
      'href',
      'https://pick3.gg/#/t/great/lanturn+medicham+registeel',
    );
  });

  it('says so when no team has been shared', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText('No teams shared in this window yet.')).toBeInTheDocument();
  });
});

// Fix round 1: the row printed team.battles, the badge and margin were computed from
// wins + losses, and nothing on screen said the two could differ. A team with mostly undecided
// battles (tanked, or still in progress) showed a "some" or "few" dot next to a battle count the
// legend's own thresholds would call "many", with no way for a reader to tell why. This fixture
// (300 battles, only 40 decided) is the one case the two fixtures above cannot exercise, since
// decided equals battles in both of them.
describe('Teams, decided battles differ from the total', () => {
  const decidedTeams = [
    {
      species: ['medicham', 'lanturn', 'registeel'] as [string, string, string],
      battles: 300,
      wins: 25,
      losses: 15,
      moves: [null, null, null],
    },
  ];

  it('discloses the decided count and grades the badge and margin on it, not the total', async () => {
    render(
      <App
        deps={{
          fetcher: stubFetch({ meta: { battles: 1500, devices: 90, teams: decidedTeams } }),
          now,
        }}
      />,
    );
    expect(await screen.findByText('300 battles, 40 decided')).toBeInTheDocument();
    expect(screen.getByText('some')).toBeInTheDocument();
    expect(screen.getByText('Could be anywhere from 47% to 79%')).toBeInTheDocument();
  });
});

describe('Teams, when the api is down', () => {
  it('says so without blanking the screen', async () => {
    render(<App deps={{ fetcher: stubFetch({ metaStatus: 500 }), now }} />);
    expect(
      await screen.findByText('Could not load the shared teams. Try again in a moment.'),
    ).toBeInTheDocument();
    // The api failure only empties the teams content; the app shell around it (header, tabs)
    // still renders, so the reader is never left looking at a blank page.
    expect(screen.getByRole('link', { name: 'Teams' })).toBeInTheDocument();
  });
});
