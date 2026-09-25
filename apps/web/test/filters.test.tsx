import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Filters } from '../src/screens/Filters.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { DEFAULT_SETTINGS, resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

async function mountSheet(): Promise<void> {
  render(
    <AppProvider host={fakeHost()}>
      <Probe />
      <Filters />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
  });
}

const WINDOW_NOTE = 'Applies when Source is GBL, Tournaments or All';

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

  it('opens on the Window select, enabled for a community source, and writes the setting', async () => {
    await storage.saveSettings({ ...DEFAULT_SETTINGS, facing: { source: 'ladder', window: 'meta' } });
    await mountSheet();
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    const selects = within(sheet).getAllByRole('combobox');
    const windowSel = within(sheet).getByLabelText('Window') as HTMLSelectElement;
    expect(selects[0]).toBe(windowSel);
    expect(windowSel).not.toBeDisabled();
    expect(within(sheet).queryByText(WINDOW_NOTE)).toBeNull();
    expect([...windowSel.options].map((o) => o.textContent)).toEqual([
      'This meta',
      '30 days',
      '7 days',
    ]);
    await act(async () => {
      fireEvent.change(windowSel, { target: { value: '7' } });
    });
    expect(latest?.state.settings.facing?.window).toBe('7');
    expect(latest?.state.settings.facing?.source).toBe('ladder');
  });

  it('disables Window with its note for Your log and for PvPoke', async () => {
    await storage.saveSettings({ ...DEFAULT_SETTINGS, facing: { source: 'log', window: 'meta' } });
    await mountSheet();
    expect(screen.getByLabelText('Window')).toBeDisabled();
    expect(screen.getByText(WINDOW_NOTE)).toBeInTheDocument();
    await act(async () => {
      latest!.actions.updateSettings((cur) => ({ ...cur, facing: { source: 'prior', window: 'meta' } }));
    });
    expect(screen.getByLabelText('Window')).toBeDisabled();
    expect(screen.getByText(WINDOW_NOTE)).toBeInTheDocument();
  });
});
