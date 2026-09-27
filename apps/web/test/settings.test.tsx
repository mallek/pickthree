import 'fake-indexeddb/auto';
import type { BattleSet, LoggedBattle, Specimen } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Settings } from '../src/screens/settings/Settings.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import { logBattles } from '../src/state/facing.ts';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost, SEASONS } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

/** Rendered the way App renders it: only while the sheet is open. */
function Gate() {
  const s = useAppState();
  return s.sheetOpen ? <Settings /> : null;
}

/** Only the fields Settings reads; the rest of a Specimen never matters here. */
function specimen(id: string, speciesId: string, shadow = false): Specimen {
  return { id, speciesId, shadow } as unknown as Specimen;
}

async function saveCollection(specimens: Specimen[]): Promise<void> {
  await storage.saveCollection({
    specimens,
    report: {
      scansRead: specimens.length,
      recognized: specimens.length,
      duplicatesMerged: 0,
      missingIvs: { count: 0, names: [] },
      unrecognized: [],
      rowProblems: [],
      layout: emptyLayoutValue(),
      newestScan: null,
    },
    importedAt: '2026-09-20T12:00:00Z',
    fileName: null,
  });
}

function battle(id: string, minute: number): LoggedBattle {
  return {
    id,
    at: `2026-09-15T10:${String(minute).padStart(2, '0')}:00Z`,
    opponents: ['medicham'],
    result: 'win',
    tanked: false,
  };
}

function set(id: string, league: string, battles: LoggedBattle[]): BattleSet {
  return {
    id,
    league,
    startedAt: '2026-09-15T10:00:00Z',
    team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
    battles,
    closed: false,
  };
}

/** Three Pokémon of two kinds; two battles in Great League and one in Ultra League. */
async function seed(): Promise<void> {
  await saveCollection([
    specimen('a', 'tinkaton'),
    specimen('b', 'tinkaton'),
    specimen('c', 'azumarill'),
  ]);
  await storage.saveSet(set('s1', 'great', [battle('b1', 5), battle('b2', 10)]));
  await storage.saveSet(set('s2', 'ultra', [battle('b3', 15)]));
}

async function open(): Promise<HTMLElement> {
  render(
    <AppProvider host={fakeHost()}>
      <Probe />
      <Gate />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.setsLoaded).toBe(true);
  });
  await act(async () => {
    latest!.actions.openSheet();
  });
  return screen.getByRole('dialog', { name: 'Settings' });
}

async function push(title: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: title }));
  });
  expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
}

async function back(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  });
  expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
}

describe('Settings hub', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    latest = null;
  });

  it('is named Settings, leads with Import, and holds four rows and nothing moved away', async () => {
    await seed();
    const dialog = await open();
    const importButton = within(dialog).getByRole('button', { name: 'Import a new CSV' });
    expect(importButton).toHaveClass('ui-btn-primary');
    expect(
      within(dialog).getByText('Update or replace the collection on this phone.'),
    ).toBeVisible();
    for (const title of ['Your data', 'Community', 'Appearance', 'About']) {
      expect(within(dialog).getByRole('button', { name: title })).toBeInTheDocument();
    }
    expect(within(dialog).getByText('Your collection stays on this phone.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /league/i })).toBeNull();
    expect(screen.queryByRole('group', { name: /league/i })).toBeNull();
    expect(screen.queryByText(/rank band/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Top 10%|Legend|Veteran/ })).toBeNull();
  });

  it('closes the sheet and opens Import from the Import card', async () => {
    await seed();
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import a new CSV' }));
    });
    expect(latest?.state.sheetOpen).toBe(false);
    expect(latest?.state.route).toEqual({ screen: 'import' });
  });

  it('sums the collection and every league logged on the Your data row', async () => {
    await seed();
    await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Your data' })).toHaveAccessibleDescription(
        '3 Pokémon · 3 battles',
      ),
    );
  });

  it('summarizes sharing, appearance and the data build on their rows', async () => {
    await seed();
    await open();
    expect(screen.getByRole('button', { name: 'Community' })).toHaveAccessibleDescription(
      'Sharing on',
    );
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibleDescription(
      'System theme · pictures on',
    );
    expect(screen.getByRole('button', { name: 'About' })).toHaveAccessibleDescription(
      'PvPoke data Sep 10 · build test',
    );
  });

  it('pushes Appearance; Dark shows pressed at once and the hub reads it after back', async () => {
    await seed();
    await open();
    await push('Appearance');
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    });
    expect(latest?.state.settings.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    await back();
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibleDescription(
      'Dark theme · pictures on',
    );
  });

  it('flips the pictures switch in place', async () => {
    await seed();
    await open();
    await push('Appearance');
    const pictures = screen.getByRole('switch', { name: 'Pokémon pictures' });
    expect(pictures).toHaveAttribute('aria-checked', 'true');
    expect(pictures).toHaveAccessibleDescription('Off shows a colored initial instead');
    await act(async () => {
      fireEvent.click(pictures);
    });
    expect(latest?.state.settings.sprites).toBe(false);
    expect(screen.getByRole('switch', { name: 'Pokémon pictures' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await back();
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibleDescription(
      'System theme · pictures off',
    );
  });

  it('confirms Forget in a danger sheet; Keep them keeps everything', async () => {
    await seed();
    const dialog = await open();
    const forget = screen.getByRole('button', { name: 'Forget my collection and log' });
    expect(forget).toHaveClass('ui-btn-danger');
    await act(async () => {
      fireEvent.click(forget);
    });
    const confirm = screen.getByRole('alertdialog', { name: 'Forget your collection and log?' });
    expect(confirm).toHaveAccessibleDescription(
      'Your collection, battle log and settings on this phone are deleted. This cannot be undone.',
    );
    expect(within(confirm).getByRole('button', { name: 'Forget' })).toHaveClass('ui-btn-danger');
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Keep them' }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest?.state.collection?.specimens).toHaveLength(3);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('forgets through the store when confirmed', async () => {
    await seed();
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Forget my collection and log' }));
    });
    const confirm = screen.getByRole('alertdialog', { name: 'Forget your collection and log?' });
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Forget' }));
    });
    await waitFor(() => expect(latest?.state.collection).toBeNull());
    expect(await storage.loadCollection()).toBeNull();
  });

  it('closes only the confirm on Escape, leaving Settings open', async () => {
    await seed();
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Forget my collection and log' }));
    });
    const confirm = screen.getByRole('alertdialog', { name: 'Forget your collection and log?' });
    await act(async () => {
      fireEvent.keyDown(confirm, { key: 'Escape' });
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest?.state.sheetOpen).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('with no collection, offers Import a CSV, no Forget, and says so on Your data', async () => {
    const dialog = await open();
    expect(within(dialog).getByRole('button', { name: 'Import a CSV' })).toHaveClass(
      'ui-btn-primary',
    );
    expect(screen.queryByRole('button', { name: /Forget/ })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Your data' })).toHaveAccessibleDescription(
        'No collection yet · 0 battles',
      ),
    );
    await push('Your data');
    expect(screen.getByText('No collection yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import a CSV' })).toHaveClass('ui-btn-primary');
  });
});

describe('Settings, Your data', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    latest = null;
  });

  it('shows the collection and last import, and keeps export and import of the log', async () => {
    await seed();
    await open();
    await push('Your data');
    expect(screen.getByText('3 Pokémon · 2 kinds')).toBeInTheDocument();
    expect(screen.getByText('Last import Sep 20, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import a (new )?CSV/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Export log' })).toBeInTheDocument();
    expect(screen.getByText('Import log')).toBeInTheDocument();
    expect(screen.getByText('Files stay under your control.')).toBeInTheDocument();
  });

  it('confirms Start fresh in a default-tone sheet; Keep this season changes nothing', async () => {
    await seed();
    await open();
    await push('Your data');
    const before = logBattles(latest!.state.sets, SEASONS, latest!.state.settings, 'great');
    expect(before).toHaveLength(2);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start fresh in Great League' }));
    });
    const confirm = screen.getByRole('alertdialog', { name: 'Start fresh in Great League?' });
    expect(confirm).toHaveAccessibleDescription(
      'Battles before now move to Earlier seasons. Nothing is deleted.',
    );
    const go = within(confirm).getByRole('button', { name: 'Start fresh' });
    expect(go).not.toHaveClass('ui-btn-danger');
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Keep this season' }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest?.state.settings.yourMeta?.freshFrom?.great).toBeUndefined();
    expect(logBattles(latest!.state.sets, SEASONS, latest!.state.settings, 'great')).toHaveLength(
      2,
    );
  });

  it('Start fresh moves the open set to Earlier seasons', async () => {
    await seed();
    await open();
    await push('Your data');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start fresh in Great League' }));
    });
    const confirm = screen.getByRole('alertdialog', { name: 'Start fresh in Great League?' });
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Start fresh' }));
    });
    await waitFor(() => expect(latest?.state.settings.yourMeta?.freshFrom?.great).toBeTruthy());
    expect(logBattles(latest!.state.sets, SEASONS, latest!.state.settings, 'great')).toHaveLength(
      0,
    );
    expect(latest?.state.sets[0]?.battles).toHaveLength(2);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Your data' })).toBeInTheDocument();
  });
});

describe('Settings, Community (moved as it was; Task 4 rebuilds it)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    latest = null;
  });

  it('links to the community meta site with a one-line explanation', async () => {
    await open();
    await push('Community');
    expect(screen.getByRole('link', { name: 'Open meta.pick3.gg' })).toHaveAttribute(
      'href',
      'https://meta.pick3.gg',
    );
    expect(
      screen.getByText(/most-faced Pokémon and teams, built from shared battle logs/),
    ).toBeInTheDocument();
  });

  it('keeps About reachable with the game data line', async () => {
    await open();
    await push('About');
    expect(screen.getByText(/Game data from PvPoke/)).toBeInTheDocument();
  });
});
