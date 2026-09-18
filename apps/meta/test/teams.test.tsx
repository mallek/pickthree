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
