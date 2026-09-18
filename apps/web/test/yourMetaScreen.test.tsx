import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { YourMeta } from '../src/screens/YourMeta.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

describe('Your meta screen', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });

  it('shows the countdown, the open set, most faced and team records', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [
        {
          id: 'b1',
          at: '2026-09-15T10:05:00Z',
          opponents: ['medicham', 'dragonite_shadow'],
          result: 'win',
          tanked: false,
        },
        {
          id: 'b2',
          at: '2026-09-15T10:10:00Z',
          opponents: ['medicham'],
          result: 'loss',
          tanked: false,
        },
        { id: 'b3', at: '2026-09-15T10:15:00Z', opponents: [], result: null, tanked: true },
      ],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <YourMeta />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText(/2 of 15 battles until/)).toBeInTheDocument());
    expect(screen.getByText('Current team')).toBeInTheDocument();
    expect(screen.getByText(/1-1 since/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log a battle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change team' })).toBeInTheDocument();
    expect(screen.getByTitle('Tanked')).toHaveTextContent('T');
    const medicham = screen.getByText('Medicham').closest('.faced-row');
    expect(medicham).toHaveTextContent('faced 2');
    expect(medicham).toHaveTextContent('1-1');
    // Each most-faced row opens Counters scored against that species.
    expect(medicham).toHaveAttribute('href', '#/counters?vs=medicham');
    expect(screen.getByRole('link', { name: 'Who beats Medicham' })).toBeInTheDocument();
    // The sort control is real buttons, so the keyboard can reach it.
    expect(screen.getByRole('button', { name: 'Worst record' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // The fake league's meta group is three species, so both logged opponents are outsiders.
    expect(screen.getAllByText(/outside the meta 3/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2 battles/).length).toBeGreaterThan(0);
    expect(screen.getByText('1-1', { selector: '.team-row b' })).toBeInTheDocument();
  });

  it('links out to the community meta site', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <YourMeta />
      </AppProvider>,
    );
    expect(
      await screen.findByRole('link', { name: /See what everyone else is facing/ }),
    ).toHaveAttribute('href', 'https://meta.pick3.gg');
  });

  it('carries the meta.pick3.gg pill in its page head, next to the cog', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <YourMeta />
      </AppProvider>,
    );
    expect(
      await screen.findByRole('link', { name: 'meta, the community meta' }),
    ).toHaveAttribute('href', 'https://meta.pick3.gg');
  });

  it('offers a new set when nothing is open', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <YourMeta />
      </AppProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Pick your team' })).toBeInTheDocument(),
    );
    expect(screen.getByText(/0 of 15 battles until/)).toBeInTheDocument();
    expect(screen.getByText('No team picked')).toBeInTheDocument();
  });
});
