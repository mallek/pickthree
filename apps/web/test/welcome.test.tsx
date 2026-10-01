import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyLayoutValue } from '../src/format.ts';
import { Welcome } from '../src/screens/Welcome.tsx';
import { AppProvider, useAppState } from '../src/state/store.tsx';
import type { AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: AppState | null = null;

function Probe() {
  latest = useAppState();
  return null;
}

async function saveCollection(): Promise<void> {
  await storage.saveCollection({
    specimens: [],
    report: {
      scansRead: 0,
      recognized: 0,
      duplicatesMerged: 0,
      missingIvs: { count: 0, names: [] },
      unrecognized: [],
      rowProblems: [],
      layout: emptyLayoutValue(),
      newestScan: null,
    },
    importedAt: '2026-09-16T00:00:00Z',
    fileName: null,
  });
}

async function mount(withWelcome = false) {
  render(
    <AppProvider host={fakeHost()}>
      <Probe />
      {withWelcome ? <Welcome /> : null}
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.boot).toBe('ready');
    expect(latest?.settingsLoaded).toBe(true);
    expect(latest?.route).toBeDefined();
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  window.location.hash = '';
  latest = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ battles: 0, species: [] }) })),
  );
});

describe('Welcome: start without a collection', () => {
  it('has a third button that saves the flag and lands on #/meta', async () => {
    await mount(true);
    const btn = await screen.findByRole('button', { name: /Start without a collection/ });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    expect(btn.className).toBe('btn btn-secondary btn-cta');
    fireEvent.click(btn);
    await waitFor(() => expect(latest?.route.screen).toBe('meta'));
    expect(window.location.hash).toBe('#/meta');
    expect(latest?.settings.startedWithout).toBe(true);
    await waitFor(async () => {
      expect((await storage.loadSettings()).startedWithout).toBe(true);
    });
  });

  it('is disabled until the game data is ready', async () => {
    const host = fakeHost();
    host.ready = vi.fn(() => new Promise(() => undefined)) as typeof host.ready;
    render(
      <AppProvider host={host}>
        <Probe />
        <Welcome />
      </AppProvider>,
    );
    const btn = await screen.findByRole('button', { name: /Start without a collection/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('boot routing', () => {
  it('routes no collection plus startedWithout to #/meta', async () => {
    await storage.saveSettings({ ...(await storage.loadSettings()), startedWithout: true });
    await mount();
    await waitFor(() => expect(latest?.route.screen).toBe('meta'));
    expect(window.location.hash).toBe('#/meta');
  });

  it('keeps Welcome for no collection without the flag', async () => {
    await mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(latest?.route.screen).toBe('welcome');
  });

  it('still routes a collection to #/teams, flag or not', async () => {
    await saveCollection();
    await storage.saveSettings({ ...(await storage.loadSettings()), startedWithout: true });
    await mount();
    await waitFor(() => expect(latest?.route.screen).toBe('teams'));
    expect(window.location.hash).toBe('#/teams');
  });

  it('leaves a deep link alone for a started-without player', async () => {
    await storage.saveSettings({ ...(await storage.loadSettings()), startedWithout: true });
    window.location.hash = '#/collection';
    await mount();
    await waitFor(() => expect(latest?.route.screen).toBe('collection'));
  });
});
