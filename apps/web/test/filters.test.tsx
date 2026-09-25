import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Filters } from '../src/screens/Filters.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { DEFAULT_SETTINGS, resetDbForTests, storage } from '../src/storage/db.ts';
import type { League } from '@pickthree/engine';
import { fakeHost, GREAT } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

const SPECIAL: League = {
  id: 'special1',
  title: 'Special Cup',
  short: 'Special',
  cp: 1500,
  cup: 'special1',
  meta: 'special1',
  kind: 'special',
  minCp: 1410,
  include: [],
  exclude: [],
  metaSize: 0,
};

/** A fakeHost that also lists a special-cup league, which has no community data. */
function hostWithSpecial() {
  const host = fakeHost();
  const originalReady = host.ready;
  host.ready = (async () => {
    const r = await originalReady();
    return { ...r, leagues: [GREAT, SPECIAL] };
  }) as typeof host.ready;
  return host;
}

async function mountSheet(host = fakeHost()): Promise<void> {
  render(
    <AppProvider host={host}>
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
const NO_DATA_NOTE = 'No community data for this league';

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
    expect(screen.queryByText(NO_DATA_NOTE)).toBeNull();
    await act(async () => {
      latest!.actions.updateSettings((cur) => ({ ...cur, facing: { source: 'prior', window: 'meta' } }));
    });
    expect(screen.getByLabelText('Window')).toBeDisabled();
    expect(screen.getByText(WINDOW_NOTE)).toBeInTheDocument();
  });

  it('names the league, not the Source, when the league has no community data', async () => {
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      league: 'special1',
      facing: { source: 'ladder', window: 'meta' },
    });
    await mountSheet(hostWithSpecial());
    await waitFor(() => expect(latest?.state.data).not.toBeNull());
    expect(screen.getByLabelText('Window')).toBeDisabled();
    expect(screen.getByText(NO_DATA_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(WINDOW_NOTE)).toBeNull();
  });
});
