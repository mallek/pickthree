import 'fake-indexeddb/auto';
import type { Specimen, Verdict } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStickyForTests, useSticky } from '../src/components.tsx';
import { Build } from '../src/screens/Build.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import { resetHistoryForTests } from '../src/state/history.ts';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost, GREAT } from './fakeHost.ts';

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

/** One synthetic copy of a species. */
function copy(id: string, speciesId: string): Specimen {
  return { ...TINK, id, speciesId, familyId: speciesId } as Specimen;
}

/** A verdict that builds the copy as its own species. */
function verdictOf(id: string, speciesId: string, label: string, rank = 40): Verdict {
  return {
    ...VERDICT,
    specimenId: id,
    label,
    build: { speciesId, ivRank: { rank, total: 4096 } },
  } as unknown as Verdict;
}

/** The second league the switch test moves to. */
const ULTRA = {
  ...GREAT,
  id: 'ultra',
  title: 'Ultra League',
  short: 'Ultra',
  cp: 2500,
  meta: 'ultra',
};

interface OpenOptions {
  verdicts?: () => Promise<Record<string, Verdict>>;
  host?: Record<string, unknown>;
}

/** Render Build with these copies and verdicts, Lead's search open. Returns its input. */
async function openWith(
  copies: Specimen[],
  verdicts: Verdict[],
  options: OpenOptions = {},
): Promise<HTMLElement> {
  await storage.saveCollection({
    specimens: copies,
    report: {
      scansRead: copies.length,
      recognized: copies.length,
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
  const byId = Object.fromEntries(verdicts.map((v) => [v.specimenId, v]));
  render(
    <AppProvider
      host={fakeHost({ verdicts: vi.fn(options.verdicts ?? (async () => byId)), ...options.host })}
    >
      <Probe />
      <Build />
    </AppProvider>,
  );
  await waitFor(() => expect(latest?.collection).not.toBeNull());
  fireEvent.click(await screen.findByRole('button', { name: 'Lead, empty' }));
  return screen.findByPlaceholderText(/^Search (any|your) Pokémon for Lead$/);
}

/** Flip Yours only through the Filters sheet, then close it. */
async function flipYoursOnly(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /^Filters/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Filters' });
  fireEvent.click(within(dialog).getByRole('switch', { name: 'Yours only' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

/** The grid's tokens in order: the species name, and whether the yours tag is on it. */
function gridTokens(): { name: string | null; yours: boolean }[] {
  return [...document.querySelectorAll('.recent-row .recent-token')].map((el) => ({
    name: el.getAttribute('aria-label'),
    yours: (el.textContent ?? '').includes('yours'),
  }));
}
const gridNames = (): (string | null)[] => gridTokens().map((t) => t.name);

describe('Build with Yours only on', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetStickyForTests();
    window.location.hash = '';
    resetHistoryForTests();
    latest = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('narrows the search to your copies', async () => {
    const input = await openWith(
      [copy('t1', 'tinkaton')],
      [verdictOf('t1', 'tinkaton', 'Worth building')],
    );
    await flipYoursOnly();
    expect(await screen.findByPlaceholderText('Search your Pokémon for Lead')).toBe(input);
    fireEvent.change(input, { target: { value: 'a' } });
    await waitFor(() => expect(gridNames()).toEqual(['Tinkaton']));
    // Switched off, the other matches are back.
    await flipYoursOnly();
    await screen.findByPlaceholderText('Search any Pokémon for Lead');
    await waitFor(() => expect(gridNames()).toContain('Azumarill'));
  });

  it('lists your copies by meta rank in Suggested', async () => {
    await openWith(
      [copy('m1', 'medicham'), copy('c1', 'clodsire'), copy('t1', 'tinkaton')],
      [
        verdictOf('m1', 'medicham', 'Worth building'),
        verdictOf('c1', 'clodsire', 'Worth building'),
        verdictOf('t1', 'tinkaton', 'Worth building'),
      ],
    );
    await flipYoursOnly();
    await waitFor(() => expect(gridNames()).toEqual(['Tinkaton', 'Clodsire', 'Medicham']));
    expect(gridTokens().every((t) => t.yours)).toBe(true);
    expect(gridNames()).not.toContain('Azumarill');
  });

  it('says none of yours match', async () => {
    const input = await openWith(
      [copy('t1', 'tinkaton')],
      [verdictOf('t1', 'tinkaton', 'Worth building')],
    );
    await flipYoursOnly();
    await waitFor(() => expect(gridNames()).toEqual(['Tinkaton']));
    fireEvent.change(input, { target: { value: 'medi' } });
    await screen.findByText(
      'None of your Pokémon match. Switch off Yours only to search every Pokémon.',
    );
    expect(screen.queryByText('Nothing matches.')).toBeNull();
  });

  it('says none of yours can be built here', async () => {
    await openWith(
      [copy('t1', 'tinkaton')],
      [{ ...verdictOf('t1', 'tinkaton', 'Not eligible'), build: null } as Verdict],
    );
    await flipYoursOnly();
    await screen.findByText('None of your Pokémon can be built for this league.');
  });

  it('holds the empty lines while verdicts load', async () => {
    await openWith([copy('t1', 'tinkaton')], [], { verdicts: () => new Promise(() => {}) });
    await flipYoursOnly();
    await waitFor(() => expect(latest?.verdictsLoading).toBe(true));
    expect(screen.queryByText(/None of your Pokémon/)).toBeNull();
    expect(screen.queryByText(/could not be checked/)).toBeNull();
    expect(screen.queryByText('Nothing matches.')).toBeNull();
  });

  it('says your Pokémon could not be checked when verdicts failed', async () => {
    // recordError's device summary reads matchMedia, which jsdom does not implement.
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    await openWith([copy('t1', 'tinkaton')], [], {
      verdicts: async () => {
        throw new Error('worker died');
      },
    });
    await waitFor(() => expect(latest?.verdictsError).not.toBeNull());
    await flipYoursOnly();
    await screen.findByText('Your Pokémon could not be checked for this league.');
    expect(screen.queryByText(/None of your Pokémon/)).toBeNull();
    expect(screen.queryByText('Nothing matches.')).toBeNull();
  });

  it('ignores Yours only once the collection is gone', async () => {
    // The store's forget action also drops the league bundle without reloading it, so it cannot
    // show a search; instead the sticky value is already on when Build renders with no collection.
    function YoursOn() {
      const [, set] = useSticky('build.yoursOnly', false);
      useEffect(() => {
        set(true);
      }, [set]);
      return null;
    }
    render(<YoursOn />).unmount();
    const input = await open(false);
    expect(input.getAttribute('placeholder')).toBe('Search any Pokémon for Lead');
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    fireEvent.change(input, { target: { value: 'azu' } });
    await waitFor(() => expect(gridNames()).toContain('Azumarill'));
  });

  it('recomputes Suggested on a league switch', async () => {
    const base = fakeHost();
    const bootReply = await base.ready();
    const greatInfo = await base.leagueInfo('great');
    await openWith(
      [copy('m1', 'medicham'), copy('t1', 'tinkaton')],
      [
        verdictOf('m1', 'medicham', 'Worth building'),
        verdictOf('t1', 'tinkaton', 'Worth building'),
      ],
      {
        host: {
          ready: vi.fn(async () => ({ ...bootReply, leagues: [GREAT, ULTRA] })),
          // Ultra leaves Medicham out of what is legal.
          leagueInfo: vi.fn(async (id: string) =>
            id === 'ultra'
              ? { ...greatInfo, id: 'ultra', legal: ['tinkaton', 'azumarill', 'clodsire'] }
              : greatInfo,
          ),
        },
      },
    );
    await flipYoursOnly();
    await waitFor(() => expect(gridNames()).toEqual(['Tinkaton', 'Medicham']));
    fireEvent.click(screen.getByRole('radio', { name: 'Ultra League' }));
    await waitFor(() => expect(gridNames()).toEqual(['Tinkaton']));
  });
});
