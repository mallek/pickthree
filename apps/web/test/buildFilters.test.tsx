import 'fake-indexeddb/auto';
import type { Specimen, Verdict } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStickyForTests } from '../src/components.tsx';
import { Build } from '../src/screens/Build.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import { resetHistoryForTests } from '../src/state/history.ts';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

const TINK = {
  id: 'low',
  speciesId: 'tinkaton',
  familyId: 'tinkaton',
  ivs: { atk: 0, def: 15, sta: 15 },
  level: { min: 20, max: 20 },
  cp: 1400,
  hp: 150,
  shadow: false,
  purified: false,
  lucky: false,
  currentMoves: { fast: null, charged: [] },
  scannedAt: '2026-09-20 12:00:00',
  raw: {},
} as unknown as Specimen;

const VERDICT = {
  specimenId: 'low',
  label: 'Worth building',
  line: '',
  build: { speciesId: 'tinkaton', ivRank: { rank: 40, total: 4096 } },
  moveset: null,
  cost: null,
  perfectDelta: null,
  perfectLine: null,
  metaWins: null,
  metaSize: 3,
  metaRank: null,
  formNote: null,
  ineligible: null,
} as unknown as Verdict;

async function seed(): Promise<void> {
  await storage.saveCollection({
    specimens: [TINK],
    report: {
      scansRead: 1,
      recognized: 1,
      duplicatesMerged: 0,
      missingIvs: { count: 0, names: [] },
      unrecognized: [],
      rowProblems: [],
      layout: emptyLayoutValue(),
      newestScan: '2026-09-20 12:00:00',
    },
    importedAt: '2026-09-20T12:00:00Z',
    fileName: null,
  });
}

/** Render Build and open the Lead slot's search; returns its input. */
async function open(withCollection: boolean): Promise<HTMLElement> {
  if (withCollection) {
    await seed();
  }
  render(
    <AppProvider host={fakeHost({ verdicts: vi.fn(async () => ({ low: VERDICT })) })}>
      <Probe />
      <Build />
    </AppProvider>,
  );
  if (withCollection) {
    await waitFor(() => expect(latest?.collection).not.toBeNull());
  }
  fireEvent.click(await screen.findByRole('button', { name: 'Lead, empty' }));
  return screen.findByPlaceholderText('Search any Pokémon for Lead');
}

describe("Build's Filters sheet", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetStickyForTests();
    window.location.hash = '';
    resetHistoryForTests();
    latest = null;
  });

  it('hides the Filters button with no collection', async () => {
    await open(false);
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    expect(
      screen.getByText('No collection imported. Import a CSV to include your own Pokémon here.'),
    ).toBeTruthy();
  });

  it('opens the Filters sheet with Yours only off, and counts it once on', async () => {
    await open(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    const sw = within(dialog).getByRole('switch', { name: 'Yours only' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(within(dialog).getByText('Only the Pokémon you have')).toBeTruthy();
    fireEvent.click(sw);
    await screen.findByRole('button', { name: 'Filters, 1 on' });
  });

  it('keeps the slot open through the sheet', async () => {
    const input = await open(true);
    const filterButton = await screen.findByRole('button', { name: 'Filters' });
    expect(fireEvent.mouseDown(filterButton)).toBe(false);
    fireEvent.click(filterButton);
    await screen.findByRole('dialog', { name: 'Filters' });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('Escape in the sheet closes the sheet, not the slot', async () => {
    const input = await open(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.contains(input)).toBe(true);
  });
});
