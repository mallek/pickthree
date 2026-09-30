import 'fake-indexeddb/auto';
import type { Specimen, Verdict, VerdictLabel } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStickyForTests } from '../src/components.tsx';
import { Collection } from '../src/screens/Collection.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import {
  AppProvider,
  hashFor,
  useActions,
  useAppState,
  type AppState,
} from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

/** Collection while the route is Collection, nothing on any other screen: leaving for a
 * Pokémon's page unmounts it, as App does. */
function Gate() {
  const s = useAppState();
  return s.route.screen === 'collection' ? <Collection /> : null;
}

function specimen(id: string, speciesId: string, opts: { shadow?: boolean; ivs?: boolean } = {}) {
  return {
    id,
    speciesId,
    familyId: speciesId,
    ivs: opts.ivs === false ? null : { atk: 0, def: 15, sta: 15 },
    level: { min: 20, max: 20 },
    cp: 1400,
    hp: 150,
    shadow: opts.shadow ?? false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-20 12:00:00',
    raw: {},
  } as unknown as Specimen;
}

function verdict(specimenId: string, label: VerdictLabel, rank: number): Verdict {
  return {
    specimenId,
    label,
    line: '',
    build: {
      speciesId: 'x',
      ivRank: { rank, total: 4096 },
    },
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
}

/** Six Pokémon of five kinds: two Tinkaton (grouped), one Shadow. */
const SPECIMENS = [
  specimen('a', 'tinkaton'),
  specimen('b', 'tinkaton'),
  specimen('c', 'azumarill'),
  specimen('d', 'clodsire', { ivs: false }),
  specimen('e', 'medicham'),
  specimen('f', 'dragonite_shadow', { shadow: true }),
];

const VERDICTS: Record<string, Verdict> = {
  a: verdict('a', 'Built', 10),
  b: verdict('b', 'Worth building', 50),
  c: verdict('c', 'Wait for better IVs', 300),
  d: verdict('d', 'Needs rescan', 9999),
  e: verdict('e', 'Worth building', 40),
  f: verdict('f', 'Built', 20),
};

async function seed(specimens: Specimen[] = SPECIMENS): Promise<void> {
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
      newestScan: '2026-09-20 12:00:00',
    },
    importedAt: '2026-09-20T12:00:00Z',
    fileName: null,
  });
}

async function open(
  verdicts: () => Promise<Record<string, Verdict>> = async () => VERDICTS,
  specimens: Specimen[] = SPECIMENS,
): Promise<void> {
  await seed(specimens);
  render(
    <AppProvider host={fakeHost({ verdicts: vi.fn(verdicts) })}>
      <Probe />
      <Gate />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.collection).not.toBeNull();
  });
  // Let the boot route settle (welcome to teams through window.location.hash) before going to
  // Collection, so the hashchange boot queued cannot land on top of ours.
  await waitFor(() => {
    expect(window.location.hash).toBe('#/teams');
    expect(latest?.state.route.screen).toBe('teams');
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await go({ screen: 'collection' });
}

async function go(route: Parameters<ReturnType<typeof useActions>['navigate']>[0]) {
  await act(async () => {
    latest!.actions.navigate(route);
  });
  await waitFor(() => expect(latest?.state.route.screen).toBe(route.screen));
}

async function judged(): Promise<void> {
  await waitFor(() => expect(document.querySelectorAll('.spec-row .verdict-tag').length).toBe(5));
}

/** The top rows' names, in order, without the Shadow flag. */
function names(): string[] {
  return [...document.querySelectorAll('.spec-row:not(.sub) .spec-name')].map(
    (e) => e.firstChild?.textContent ?? '',
  );
}

async function openFilters(): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  });
  return screen.getByRole('dialog', { name: 'Filters' });
}

async function closeFilters(): Promise<void> {
  const dialog = screen.getByRole('dialog', { name: 'Filters' });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  });
  expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
}

async function flip(dialog: HTMLElement, label: string): Promise<void> {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('switch', { name: label }));
  });
}

describe('Collection', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetStickyForTests();
    window.location.hash = '';
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    latest = null;
  });

  it('shows a Mega pill on a Mega-marked row and none on the others', async () => {
    const marked = { ...specimen('m', 'tinkaton'), megaForm: 'mega' } as Specimen;
    await open(
      async () => ({ m: verdict('m', 'Built', 30), a: verdict('a', 'Built', 10) }),
      [marked, specimen('a', 'azumarill')],
    );
    await waitFor(() => expect(document.querySelectorAll('.spec-row .verdict-tag').length).toBe(2));
    const pills = [...document.querySelectorAll('.spec-row .token-mega-pill')];
    expect(pills).toHaveLength(1);
    expect(pills[0]!.textContent).toBe('Mega');
    expect(pills[0]!.closest('.spec-row')).toHaveTextContent('Tinkaton');
  });

  it('has one Settings cog, a plus to Add Pokémon and the meta.pick3.gg link in its header', async () => {
    await open();
    await judged();
    expect(screen.getByRole('heading', { name: 'Collection' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Add a Pokémon' })).toHaveAttribute(
      'href',
      hashFor({ screen: 'add' }),
    );
    expect(screen.getByRole('link', { name: 'meta.pick3.gg, the community meta' })).toHaveAttribute(
      'href',
      'https://meta.pick3.gg',
    );
    expect(screen.queryByText('+ Add')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    });
    expect(latest?.state.sheetOpen).toBe(true);
  });

  it('counts filters that differ from their defaults, Group same Pokémon included', async () => {
    await open();
    await judged();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('6 Pokémon · 5 kinds')).toBeInTheDocument();
    const dialog = await openFilters();
    for (const [label, line] of [
      ['Group same Pokémon', 'One row per species, best first'],
      ['Show ineligible', 'Pokémon over the cap or banned here'],
      ['Shadows only', 'Just the Shadow Pokémon'],
      ['Scanned in the last two weeks', ''],
      ['Top 50 meta', 'Only species in the top 50 for this league'],
    ] as const) {
      const sw = within(dialog).getByRole('switch', { name: label });
      expect(sw).toHaveAccessibleDescription(line);
      expect(sw).toHaveAttribute('aria-checked', label === 'Group same Pokémon' ? 'true' : 'false');
    }
    await flip(dialog, 'Shadows only');
    expect(within(dialog).getByRole('switch', { name: 'Shadows only' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // The list behind the sheet follows at once.
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeInTheDocument();
    expect(names()).toEqual(['Dragonite']);
    await flip(dialog, 'Shadows only');
    await flip(dialog, 'Group same Pokémon');
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeInTheDocument();
    await closeFilters();
    expect(screen.getByText('6 shown')).toBeInTheDocument();
    expect(names()).toHaveLength(6);
  });

  it('filters by the verdict chips: Built, Worth it, Wait for IVs, Rescan', async () => {
    await open();
    await judged();
    const chips = [...document.querySelectorAll('.chips .chip')].map((c) => c.textContent);
    expect(chips).toEqual(['Built', 'Worth it', 'Wait for IVs', 'Rescan']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Built' }));
    });
    expect(screen.getByRole('button', { name: 'Built' })).toHaveAttribute('aria-pressed', 'true');
    const tags = [...document.querySelectorAll('.spec-row .verdict-tag')].map((t) =>
      t.getAttribute('data-verdict'),
    );
    expect(tags).toEqual(['Built', 'Built']);
  });

  it('sorts from a visible dropdown; Name orders the rows by name', async () => {
    await open();
    await judged();
    expect(names()).toEqual(['Tinkaton', 'Dragonite', 'Medicham', 'Azumarill', 'Clodsire']);
    const sort = screen.getByRole('combobox', { name: 'Sort' });
    expect(sort).toHaveValue('verdict');
    expect(
      within(sort)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Verdict', 'IV rank', 'Meta rank', 'Name']);
    await act(async () => {
      fireEvent.change(sort, { target: { value: 'name' } });
    });
    expect(names()).toEqual(['Azumarill', 'Clodsire', 'Dragonite', 'Medicham', 'Tinkaton']);
  });

  it('shows a group by the copy that earned its place in the sort', async () => {
    // The best-IV Tinkaton waits for IVs; the other is worth building (Travis, 2026-09-27).
    await open(async () => ({
      ...VERDICTS,
      a: verdict('a', 'Wait for better IVs', 5),
      b: verdict('b', 'Worth building', 60),
    }));
    await judged();
    const lead = (n: string): string | null | undefined =>
      [...document.querySelectorAll('.spec-row:not(.sub)')]
        .find((r) => r.querySelector('.spec-name')?.firstChild?.textContent === n)
        ?.querySelector('.verdict-tag')
        ?.getAttribute('data-verdict');
    expect(names()).toEqual(['Dragonite', 'Medicham', 'Tinkaton', 'Azumarill', 'Clodsire']);
    expect(lead('Tinkaton')).toBe('Worth building');
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
        target: { value: 'rank' },
      });
    });
    expect(names()[0]).toBe('Tinkaton');
    expect(lead('Tinkaton')).toBe('Wait for better IVs');
  });

  it('marks a row whose Pokémon, as it battles, is excluded with a grey Excluded tag', async () => {
    await storage.saveSettings({
      ...(await storage.loadSettings()),
      excludedSpecies: ['azumarill'],
    });
    const battlesAs = (v: Verdict, speciesId: string): Verdict =>
      ({ ...v, build: { ...v.build, speciesId } }) as unknown as Verdict;
    await open(async () => ({ ...VERDICTS, c: battlesAs(VERDICTS.c!, 'azumarill') }));
    await judged();
    const rows = [...document.querySelectorAll<HTMLElement>('.spec-row:not(.sub)')];
    const tagged = rows.filter((r) =>
      [...r.querySelectorAll('.ui-tag')].some((t) => t.textContent === 'Excluded'),
    );
    expect(tagged).toHaveLength(1);
    expect(tagged[0]!.querySelector('.spec-name')?.firstChild?.textContent).toBe('Azumarill');
    const tag = [...tagged[0]!.querySelectorAll('.ui-tag')].find(
      (t) => t.textContent === 'Excluded',
    )!;
    expect(tag).toHaveClass('ui-tag-neutral');
    expect(tag.closest('.verdict-tag')).toBeNull();
    expect(tagged[0]!.querySelector('.verdict-tag')).toHaveAttribute(
      'data-verdict',
      'Wait for better IVs',
    );
  });

  it('shows each verdict as a read-only tag, never a button', async () => {
    await open();
    await judged();
    const tags = [...document.querySelectorAll('.spec-row .verdict-tag')];
    expect(tags).toHaveLength(5);
    for (const t of tags) {
      expect(t.closest('button')).toBeNull();
      expect(t.querySelector('button')).toBeNull();
    }
  });

  it('keeps search, chips, filters and sort across a trip to a Pokémon and back', async () => {
    await open();
    await judged();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search your Pokémon'), {
        target: { value: 'i' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Worth it' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
        target: { value: 'name' },
      });
    });
    const dialog = await openFilters();
    await flip(dialog, 'Group same Pokémon');
    await closeFilters();
    const before = names();
    expect(before).toEqual(['Medicham', 'Tinkaton']);
    await go({ screen: 'specimen', id: 'e' });
    expect(document.querySelector('.spec-row')).toBeNull();
    await go({ screen: 'collection' });
    expect(screen.getByPlaceholderText('Search your Pokémon')).toHaveValue('i');
    expect(screen.getByRole('button', { name: 'Worth it' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('name');
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeInTheDocument();
    expect(names()).toEqual(before);
  });

  it('shows the Empty state when nothing matches', async () => {
    await open();
    await judged();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search your Pokémon'), {
        target: { value: 'zzzz' },
      });
    });
    const empty = document.querySelector('.ui-empty');
    expect(empty).not.toBeNull();
    expect(empty).toHaveTextContent('Nothing matches. Try another name or clear a filter.');
    // No "0 Pokémon · 0 kinds" over the empty state; Sort stays.
    expect(screen.queryByText(/^0 Pokémon/)).toBeNull();
    expect(document.querySelector('.sort-row .meta')).toBeEmptyDOMElement();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument();
  });

  it('judges with Loading and reports a failure with ErrorState', async () => {
    let fail: (e: Error) => void = () => undefined;
    await open(() => new Promise((_, reject) => (fail = reject)));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Judging each Pokémon'),
    );
    await act(async () => {
      fail(new Error('boom'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not judge this collection: boom. The list still works; verdicts will retry on the next import.',
    );
    expect(document.querySelector('.ui-error')).not.toBeNull();
  });

  it('has no popover, sort cycle or filters hint', async () => {
    await open();
    await judged();
    await openFilters();
    for (const sel of ['.popover', '.sort-toggle', '.filters-hint']) {
      expect(document.querySelector(sel)).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'List settings' })).toBeNull();
  });

  it('keeps NoCollection under the same header when there is no collection', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
        <Collection />
      </AppProvider>,
    );
    await waitFor(() => {
      expect(latest?.state.boot).toBe('ready');
      expect(latest?.state.settingsLoaded).toBe(true);
    });
    expect(screen.getByText('No collection yet. Pick a way in.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Collection' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
  });
});
