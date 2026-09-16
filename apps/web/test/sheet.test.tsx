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

  it('is titled Settings and flips the blend switch', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
        <Sheet />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.state.boot).toBe('ready'));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Use your log/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(latest?.state.settings.yourMeta?.blend).toBe(false);
    expect(screen.getByRole('button', { name: /Use your log/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /Start fresh in Great League/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export log' })).toBeInTheDocument();
    expect(screen.getByText('Import log')).toBeInTheDocument();
  });
});
