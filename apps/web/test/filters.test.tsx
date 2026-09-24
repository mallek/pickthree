import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Filters } from '../src/screens/Filters.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

describe('Teams Filters sheet', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    latest = null;
  });

  it('toggles the same settings the old chips and Settings switches did', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
        <Filters />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.state.boot).toBe('ready'));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /No XL/ }));
    });
    expect(latest?.state.settings.filters.noXl).toBe(true);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Team style'), { target: { value: 'abb' } });
    });
    expect(latest?.state.settings.filters.style).toBe('abb');
  });
});
