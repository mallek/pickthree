import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Sheet } from '../src/screens/Sheet.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

describe('Settings sheet, Your meta section', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    latest = null;
  });

  it('is titled Settings and no longer carries the moved filters or the blend switch', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
        <Sheet />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.state.boot).toBe('ready'));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use your log/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /No XL/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Start fresh in Great League/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export log' })).toBeInTheDocument();
    expect(screen.getByText('Import log')).toBeInTheDocument();
  });

  it('links to the community meta site with a one-line explanation', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
        <Sheet />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.state.boot).toBe('ready'));
    expect(screen.getByRole('link', { name: 'Open meta.pick3.gg' })).toHaveAttribute(
      'href',
      'https://meta.pick3.gg',
    );
    expect(
      screen.getByText(/most-faced Pokémon and teams, built from shared battle logs/),
    ).toBeInTheDocument();
  });

  it('switches the theme with real buttons that report their state', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
        <Sheet />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.state.boot).toBe('ready'));
    const dark = screen.getByRole('button', { name: 'Dark' });
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    expect(dark).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      fireEvent.click(dark);
    });
    expect(latest?.state.settings.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  });
});
