import 'fake-indexeddb/auto';
import type { BattleSet, LoggedBattle, Specimen } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  // Let the boot route settle before any test taps: with a collection, boot sends welcome to
  // teams through window.location.hash, and the hashchange it queues (and the one beforeEach
  // queued) lands a task later. A route change made before those land would race them.
  const settled = latest!.state.collection ? '#/teams' : '';
  await waitFor(() => {
    expect(window.location.hash).toBe(settled);
    expect(latest?.state.route.screen).toBe(latest!.state.collection ? 'teams' : 'welcome');
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
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
    // navigate() sets the hash; the route follows on the hashchange a task later.
    await waitFor(() => expect(latest?.state.route).toEqual({ screen: 'import' }));
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
    // Forgetting closes Settings: nothing is left in it to look at.
    expect(latest?.state.sheetOpen).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
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

  it('reads Sharing off on the Community row after Stop and delete and back', async () => {
    await open();
    await push('Community');
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Share your battles' }));
    });
    const confirm = screen.getByRole('alertdialog', { name: 'Stop sharing?' });
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Stop and delete' }));
    });
    await waitFor(() => expect(latest?.state.settings.share?.enabled).toBe(false));
    await back();
    expect(screen.getByRole('button', { name: 'Community' })).toHaveAccessibleDescription(
      'Sharing off',
    );
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

  it("shows the parser's own sentence when Import log gets a file it cannot take", async () => {
    await seed();
    await open();
    await push('Your data');
    const input = screen
      .getByRole('dialog', { name: 'Your data' })
      .querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const newer = JSON.stringify({ app: 'pick3', kind: 'battle-log', version: 999, sets: [] });
    const file = new File([newer], 'log.json', { type: 'application/json' });
    // jsdom's File has no text(); a browser's does.
    Object.defineProperty(file, 'text', { value: async () => newer });
    await act(async () => {
      fireEvent.change(input!, { target: { files: [file] } });
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'This battle log comes from a newer pick3. Update the app and try again.',
      ),
    );
    expect(latest?.state.sets[0]?.battles).toHaveLength(2);
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

describe('Settings, Community', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    latest = null;
  });

  it('reads on, with a neutral warning line under it', async () => {
    await open();
    await push('Community');
    const share = screen.getByRole('switch', { name: 'Share your battles' });
    expect(share).toHaveAttribute('aria-checked', 'true');
    const line = screen.getByText('Turning this off also deletes what this phone sent.');
    expect(line).toBeInTheDocument();
    // Neutral all the way up to the page: no warn or danger class on the line or any ancestor.
    const page = line.closest('.settings-page');
    expect(page).not.toBeNull();
    for (let e: Element | null = line; e && e !== page; e = e.parentElement) {
      expect(e.className).not.toMatch(/warn|danger/);
    }
    expect(page!.className).not.toMatch(/warn|danger/);
  });

  it('turning it off opens a danger confirm; Keep sharing leaves it on', async () => {
    await open();
    await push('Community');
    const share = screen.getByRole('switch', { name: 'Share your battles' });
    await act(async () => {
      fireEvent.click(share);
    });
    const confirm = screen.getByRole('alertdialog', { name: 'Stop sharing?' });
    expect(confirm).toHaveAccessibleDescription(
      'Battles this phone sent are deleted from the community meta. Your log on this phone stays.',
    );
    expect(within(confirm).getByRole('button', { name: 'Stop and delete' })).toHaveClass(
      'ui-btn-danger',
    );
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Keep sharing' }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest?.state.settings.share?.enabled).not.toBe(false);
    expect(screen.getByRole('switch', { name: 'Share your battles' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('Stop and delete turns it off in place; turning it back on needs no confirm', async () => {
    await open();
    await push('Community');
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Share your battles' }));
    });
    const confirm = screen.getByRole('alertdialog', { name: 'Stop sharing?' });
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Stop and delete' }));
    });
    await waitFor(() => expect(latest?.state.settings.share?.enabled).toBe(false));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const share = screen.getByRole('switch', { name: 'Share your battles' });
    expect(share).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      fireEvent.click(share);
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest?.state.settings.share?.enabled).toBe(true);
    expect(screen.getByRole('switch', { name: 'Share your battles' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('holds "What\'s sent?" collapsed until opened, then shows what never goes', async () => {
    await open();
    await push('Community');
    expect(
      screen.queryByText(/Never sent: your collection, IVs, names/),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "What's sent?" }));
    });
    expect(
      screen.getByText("Never sent: your collection, IVs, names, or the opponents' moves."),
    ).toBeInTheDocument();
  });

  it('links to the community meta site', async () => {
    await open();
    await push('Community');
    expect(screen.getByRole('link', { name: 'Open meta.pick3.gg' })).toHaveAttribute(
      'href',
      'https://meta.pick3.gg',
    );
  });
});

describe('Settings, About', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    latest = null;
  });

  it('shows the opponent meta size and a way to check for updates', async () => {
    await open();
    await push('About');
    expect(screen.getByText('Opponent meta: 48 Pokémon.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument();
  });

  it('holds "What leaves it?" collapsed until opened, then shows its four facts', async () => {
    await open();
    await push('About');
    expect(screen.queryByText(/None of it includes your Pokémon/)).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'What leaves it?' }));
    });
    expect(
      screen.getByText('An anonymous tick to the trainer counter when you build teams.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Anonymous battle records unless sharing is off.')).toBeInTheDocument();
    expect(screen.getByText('Anonymous error reports unless turned off below.')).toBeInTheDocument();
    expect(screen.getByText('None of it includes your Pokémon.')).toBeInTheDocument();
  });

  it('flips error reports through a switch', async () => {
    await open();
    await push('About');
    const reports = screen.getByRole('switch', { name: 'Send anonymous error reports' });
    expect(reports).toHaveAttribute('aria-checked', 'true');
    await act(async () => {
      fireEvent.click(reports);
    });
    expect(latest?.state.settings.errorReports).toBe(false);
    expect(screen.getByRole('switch', { name: 'Send anonymous error reports' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('keeps the diagnostics log with a Copy control', async () => {
    await open();
    await push('About');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByText('No errors recorded.')).toBeInTheDocument();
  });

  it('credits PvPoke and Poke Genie without claiming affiliation', async () => {
    await open();
    await push('About');
    expect(screen.getByText(/Poke Genie/)).toBeInTheDocument();
    expect(screen.getByText(/Built on/).textContent).toMatch(/PvPoke/);
  });

  it('puts the trainer counter last on the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ count: 42 }) })),
    );
    try {
      await open();
      await push('About');
      const dialog = screen.getByRole('dialog', { name: 'About' });
      await waitFor(() => {
        const nodes = Array.from(dialog.querySelectorAll('.settings-page > *'));
        expect(nodes.at(-1)?.className).toMatch(/counter/);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Settings never falls back to window.confirm', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    latest = null;
  });

  it('never calls window.confirm across Forget, Start fresh and sharing', async () => {
    const spy = vi.spyOn(window, 'confirm');
    try {
      await seed();
      await open();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Forget my collection and log' }));
      });
      await act(async () => {
        fireEvent.click(
          within(
            screen.getByRole('alertdialog', { name: 'Forget your collection and log?' }),
          ).getByRole('button', { name: 'Keep them' }),
        );
      });
      await push('Your data');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Start fresh in Great League' }));
      });
      await act(async () => {
        fireEvent.click(
          within(
            screen.getByRole('alertdialog', { name: 'Start fresh in Great League?' }),
          ).getByRole('button', { name: 'Keep this season' }),
        );
      });
      await back();
      await push('Community');
      await act(async () => {
        fireEvent.click(screen.getByRole('switch', { name: 'Share your battles' }));
      });
      await act(async () => {
        fireEvent.click(
          within(screen.getByRole('alertdialog', { name: 'Stop sharing?' })).getByRole('button', {
            name: 'Keep sharing',
          }),
        );
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
