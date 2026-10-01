import 'fake-indexeddb/auto';
import type { Specimen, Verdict, VerdictLabel } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SUMMARY, resetMetaHooksForTests } from '../src/state/useMeta.ts';
import { resetStickyForTests } from '../src/components.tsx';
import { COUNTER_ORIGIN } from '../src/counter.ts';
import { resetMetaDataForTests } from '../src/metaData.ts';
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
import { fakeHost, GREAT } from './fakeHost.ts';

/**
 * A synthetic league for the meta rank: PvPoke's meta group is five species in score order
 * (cramorant, tinkaton, clodsire, azumarill, quagsire_shadow), so the PvPoke-only order is that
 * order. Medicham is ranked by PvPoke (6th overall) but sits outside the meta group, so it has no
 * blended rank.
 */
const GROUP = ['cramorant', 'tinkaton', 'clodsire', 'azumarill', 'quagsire_shadow'].map(
  (speciesId) => ({ speciesId, fastMove: 'FAST', chargedMoves: ['CHARGED'] }),
);
const OVERALL = [
  { speciesId: 'cramorant', score: 99 },
  { speciesId: 'tinkaton', score: 98 },
  { speciesId: 'clodsire', score: 97 },
  { speciesId: 'azumarill', score: 96 },
  { speciesId: 'quagsire_shadow', score: 95 },
  { speciesId: 'medicham', score: 80 },
];

interface Net {
  /** Every counter worker request, as a URL. */
  api: URL[];
  /** The current window's summary; the window ending a week sooner gets `earlier`. */
  current: unknown;
  earlier: unknown;
  /** While set, PvPoke's meta group waits on it, which holds the ranking in loading. */
  hold?: Promise<void>;
}

function stubNet(net: Net): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (raw.startsWith(COUNTER_ORIGIN)) {
        const url = new URL(raw);
        net.api.push(url);
        if (url.pathname === '/api/v1/meta') {
          const until = Date.parse(url.searchParams.get('until') ?? '');
          return json(until > Date.now() - 86_400_000 ? net.current : net.earlier);
        }
        return new Response('{}', { status: 404 });
      }
      if (raw === '/data/meta/great.json') {
        if (net.hold) {
          await net.hold;
        }
        return json(GROUP);
      }
      if (raw === '/data/rankings/great/overall.json') {
        return json(OVERALL);
      }
      if (raw === '/data/legal/great.json') {
        return json({ banned: [] });
      }
      return new Response('{}', { status: 404 });
    }),
  );
}

/** Nothing measured: the blend is PvPoke's order and nothing moves. */
function quietNet(): Net {
  return { api: [], current: EMPTY_SUMMARY, earlier: EMPTY_SUMMARY };
}

/** A measured window where one species was faced in every battle, enough to take first place. */
function heavy(speciesId: string) {
  return {
    ...EMPTY_SUMMARY,
    league: 'great',
    battles: 3000,
    devices: 500,
    species: [
      { speciesId, sightings: 3000, wins: 0, losses: 0, runs: 0, runWins: 0, runLosses: 0 },
    ],
  };
}

let net: Net = quietNet();

/**
 * fakeHost's league grown to six legal species, two of them not in fakeHost's collection. `wide`
 * adds two more: Lanturn, PvPoke's 150th and outside the meta group, and Caterpie, which PvPoke
 * does not rank at all.
 */
function leagueHost(overrides: Partial<Record<string, unknown>> = {}, wide = false) {
  const base = fakeHost();
  const more = wide ? ['lanturn', 'caterpie'] : [];
  return fakeHost({
    ready: vi.fn(async () => {
      const r = (await base.ready()) as unknown as {
        species: Record<string, unknown>;
        allSpecies: string[];
      };
      return {
        ...r,
        species: {
          ...r.species,
          cramorant: {
            name: 'Cramorant',
            types: ['flying', 'water'],
            familyId: 'cramorant',
            dex: 845,
          },
          quagsire_shadow: {
            name: 'Quagsire (Shadow)',
            types: ['water', 'ground'],
            familyId: 'wooper',
            dex: 195,
          },
          ...(wide
            ? {
                lanturn: {
                  name: 'Lanturn',
                  types: ['water', 'electric'],
                  familyId: 'chinchou',
                  dex: 171,
                },
                caterpie: { name: 'Caterpie', types: ['bug'], familyId: 'caterpie', dex: 10 },
              }
            : {}),
        },
        allSpecies: [...r.allSpecies, 'cramorant', 'quagsire_shadow', ...more],
      };
    }),
    leagueInfo: vi.fn(async () => ({
      id: 'great',
      meta: ['cramorant', 'tinkaton', 'clodsire', 'azumarill', 'quagsire_shadow'],
      metaSize: 5,
      metaRanks: {
        cramorant: { overall: 1, score: 99, role: 'lead', roleRank: 2 },
        tinkaton: { overall: 2, score: 98, role: null, roleRank: null },
        clodsire: { overall: 3, score: 97, role: null, roleRank: null },
        azumarill: { overall: 4, score: 96, role: null, roleRank: null },
        quagsire_shadow: { overall: 5, score: 95, role: null, roleRank: null },
        medicham: { overall: 60, score: 80, role: 'switch', roleRank: 70 },
        ...(wide ? { lanturn: { overall: 150, score: 60, role: null, roleRank: null } } : {}),
      },
      analyzable: [],
      legal: [
        'tinkaton',
        'azumarill',
        'clodsire',
        'medicham',
        'cramorant',
        'quagsire_shadow',
        ...more,
      ],
    })),
    ...overrides,
  });
}

/** Three of the six: Tinkaton, Azumarill and Medicham. */
const THREE = [specimen('a', 'tinkaton'), specimen('c', 'azumarill'), specimen('e', 'medicham')];
/** Each judged as itself (the shared `verdict` helper battles as a placeholder species). */
const asItself = (v: Verdict, speciesId: string): Verdict =>
  ({ ...v, build: { ...v.build, speciesId } }) as unknown as Verdict;
const THREE_VERDICTS: Record<string, Verdict> = {
  a: asItself(verdict('a', 'Built', 10), 'tinkaton'),
  c: asItself(verdict('c', 'Wait for better IVs', 300), 'azumarill'),
  e: asItself(verdict('e', 'Worth building', 40), 'medicham'),
};

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
  host: (overrides: Partial<Record<string, unknown>>) => ReturnType<typeof fakeHost> = fakeHost,
): Promise<void> {
  await seed(specimens);
  render(
    <AppProvider host={host({ verdicts: vi.fn(verdicts) })}>
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
    resetMetaDataForTests();
    resetMetaHooksForTests();
    net = quietNet();
    stubNet(net);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a Mega badge on a Mega-marked row and none on the others', async () => {
    const marked = { ...specimen('m', 'tinkaton'), megaForm: 'mega' } as Specimen;
    await open(
      async () => ({ m: verdict('m', 'Built', 30), a: verdict('a', 'Built', 10) }),
      [marked, specimen('a', 'azumarill')],
    );
    await waitFor(() => expect(document.querySelectorAll('.spec-row .verdict-tag').length).toBe(2));
    const badges = screen.getAllByRole('img', { name: 'Mega' });
    expect(badges).toHaveLength(1);
    expect(badges[0]!.closest('.spec-row')).toHaveTextContent('Tinkaton');
  });

  it('has one Settings cog and a plus to Add Pokémon in its header, no outside meta link', async () => {
    await open();
    await judged();
    expect(screen.getByRole('heading', { name: 'Collection' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Add a Pokémon' })).toHaveAttribute(
      'href',
      hashFor({ screen: 'add' }),
    );
    expect(screen.queryByRole('link', { name: 'meta.pick3.gg, the community meta' })).toBeNull();
    // Import shows only while the collection is empty.
    expect(screen.queryByRole('link', { name: 'Import a collection' })).toBeNull();
    expect(screen.queryByText('+ Add')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    });
    expect(latest?.state.sheetOpen).toBe(true);
  });

  it('switches to the league a ?l= link names, once, then lets go of it', async () => {
    const megaGreat = {
      ...GREAT,
      id: 'mega-great',
      title: 'Great League: Mega Edition',
      short: 'Mega Great',
    };
    const megaHost = (overrides: Partial<Record<string, unknown>>) => {
      const base = fakeHost();
      const ready = base.ready as unknown as () => Promise<Record<string, unknown>>;
      const info = base.leagueInfo as unknown as (l: string) => Promise<Record<string, unknown>>;
      return fakeHost({
        ready: vi.fn(async () => ({ ...(await ready()), leagues: [GREAT, megaGreat] })),
        leagueInfo: vi.fn(async (league: string) => ({ ...(await info(league)), id: league })),
        ...overrides,
      });
    };
    await open(undefined, undefined, megaHost);
    expect(latest?.state.settings.league ?? 'great').toBe('great');
    await go({ screen: 'collection', league: 'mega-great' });
    await waitFor(() => expect(latest?.state.settings.league).toBe('mega-great'));
    await waitFor(() => expect(latest?.state.leagueInfo?.id).toBe('mega-great'));
    await waitFor(() => expect(latest?.state.route).toEqual({ screen: 'collection' }));
    // Let go of: the switcher works again and nothing switches back.
    await act(async () => {
      latest!.actions.setLeague('great');
    });
    await waitFor(() => expect(latest?.state.leagueInfo?.id).toBe('great'));
    expect(latest?.state.settings.league).toBe('great');
  });

  it('ignores a ?l= league the app does not know', async () => {
    await open();
    await go({ screen: 'collection', league: 'nowhere' });
    await judged();
    expect(latest?.state.settings.league ?? 'great').toBe('great');
  });

  it('counts filters that differ from their defaults, Group same Pokémon included', async () => {
    await open();
    await judged();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('6 Pokémon · 5 kinds')).toBeInTheDocument();
    const dialog = await openFilters();
    for (const [label, line] of [
      ['Group same Pokémon', 'One row per species, best first'],
      ['Hide not collected', 'Only the Pokémon you have'],
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
      fireEvent.change(screen.getByPlaceholderText('Search Pokémon'), {
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
    expect(screen.getByPlaceholderText('Search Pokémon')).toHaveValue('i');
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
      fireEvent.change(screen.getByPlaceholderText('Search Pokémon'), {
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

  it('lists the whole league under the same header when there is no collection', async () => {
    render(
      <AppProvider host={leagueHost()}>
        <Probe />
        <Collection />
      </AppProvider>,
    );
    await waitFor(() => {
      expect(latest?.state.boot).toBe('ready');
      expect(latest?.state.settingsLoaded).toBe(true);
    });
    await waitFor(() => expect(names()).toHaveLength(6));
    expect(screen.queryByText('No collection yet. Pick a way in.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Collection' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Add a Pokémon' })).toHaveAttribute(
      'href',
      hashFor({ screen: 'add' }),
    );
    expect(screen.getByRole('link', { name: 'Import a collection' })).toHaveAttribute(
      'href',
      hashFor({ screen: 'import' }),
    );
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
    // Meta rank is the default with nothing collected, and every row is the league's own.
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('meta');
    await waitFor(() =>
      expect(names()).toEqual([
        'Cramorant',
        'Tinkaton',
        'Clodsire',
        'Azumarill',
        'Quagsire',
        'Medicham',
      ]),
    );
    // No "Not collected" on every row, and no verdict pills.
    expect(screen.queryByText('Not collected')).toBeNull();
    expect(document.querySelector('.chips')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Built' })).toBeNull();
    expect(screen.getByText('6 Pokémon in Great League')).toBeInTheDocument();
  });
});

describe('Collection, the whole league', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetStickyForTests();
    resetMetaDataForTests();
    resetMetaHooksForTests();
    window.location.hash = '';
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    latest = null;
    net = quietNet();
    stubNet(net);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function openLeague(): Promise<void> {
    await open(async () => THREE_VERDICTS, THREE, leagueHost);
    await waitFor(() => expect(document.querySelectorAll('.spec-row .verdict-tag').length).toBe(3));
    await waitFor(() => expect(names()).toHaveLength(6));
  }

  function rowOf(n: string): HTMLElement {
    const row = [...document.querySelectorAll<HTMLElement>('.spec-row:not(.sub)')].find(
      (r) => r.querySelector('.spec-name')?.firstChild?.textContent === n,
    );
    if (!row) {
      throw new Error(`No row for ${n}`);
    }
    return row;
  }

  it('lists the species you have none of after your own, each tagged Not collected', async () => {
    await openLeague();
    // Your rows by verdict, then the rest in meta order.
    expect(names()).toEqual([
      'Tinkaton',
      'Medicham',
      'Azumarill',
      'Cramorant',
      'Clodsire',
      'Quagsire',
    ]);
    for (const [n, id] of [
      ['Cramorant', 'cramorant'],
      ['Clodsire', 'clodsire'],
      ['Quagsire', 'quagsire_shadow'],
    ] as const) {
      const row = rowOf(n);
      expect(row.tagName).toBe('A');
      expect(row).toHaveAttribute('href', hashFor({ screen: 'species', id }));
      const right = row.lastElementChild!;
      expect(right).toHaveTextContent('Not collected');
      expect(right).toHaveClass('ui-tag-neutral');
      expect(row.querySelector('.verdict-tag')).toBeNull();
    }
    expect(rowOf('Quagsire').querySelector('.shadow-flag')).toHaveTextContent('Shadow');
    expect(screen.getByText('3 Pokémon · 3 kinds · 3 not collected')).toBeInTheDocument();
  });

  it('tags every row with the blended rank and the role rank, none outside the order', async () => {
    await openLeague();
    const tags = (n: string) => [...rowOf(n).querySelectorAll('.mtag')].map((t) => t.textContent);
    await waitFor(() => expect(tags('Cramorant')).toEqual(['#1 meta', '#2 lead']));
    expect(tags('Tinkaton')).toEqual(['#2 meta']);
    expect(tags('Quagsire')).toEqual(['#5 meta']);
    // Medicham is outside the blended order and its role rank outside the top 50.
    expect(tags('Medicham')).toEqual([]);
    expect(document.body.textContent).not.toContain('overall');
  });

  it('hides them with Hide not collected, which counts as a filter', async () => {
    await openLeague();
    const dialog = await openFilters();
    const switches = within(dialog).getAllByRole('switch');
    expect(switches[1]).toHaveAccessibleName('Hide not collected');
    expect(switches[1]).toHaveAttribute('aria-checked', 'false');
    await flip(dialog, 'Hide not collected');
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeInTheDocument();
    expect(names()).toEqual(['Tinkaton', 'Medicham', 'Azumarill']);
    expect(screen.getByText('3 Pokémon · 3 kinds')).toBeInTheDocument();
    await flip(dialog, 'Hide not collected');
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(names()).toHaveLength(6);
  });

  it('interleaves both kinds of row under Meta rank, unranked last', async () => {
    await openLeague();
    await waitFor(() => expect(rowOf('Cramorant').querySelector('.mtag')).not.toBeNull());
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
        target: { value: 'meta' },
      });
    });
    expect(names()).toEqual([
      'Cramorant',
      'Tinkaton',
      'Clodsire',
      'Azumarill',
      'Quagsire',
      'Medicham',
    ]);
  });

  it('shows only your own while a verdict pill is on, and searches both kinds by name', async () => {
    await openLeague();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Built' }));
    });
    expect(names()).toEqual(['Tinkaton']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Built' }));
      fireEvent.change(screen.getByPlaceholderText('Search Pokémon'), {
        target: { value: 'cram' },
      });
    });
    expect(names()).toEqual(['Cramorant']);
  });

  it('keeps Top 50 meta to rows ranked in the top 50, blended or by role', async () => {
    await openLeague();
    await waitFor(() => expect(rowOf('Cramorant').querySelector('.mtag')).not.toBeNull());
    const dialog = await openFilters();
    await flip(dialog, 'Top 50 meta');
    await closeFilters();
    expect(names()).toEqual(['Tinkaton', 'Azumarill', 'Cramorant', 'Clodsire', 'Quagsire']);
  });

  it('counts a Pokémon you have as it battles, so an evolution is collected', async () => {
    const battlesAs = (v: Verdict, speciesId: string): Verdict =>
      ({ ...v, build: { ...v.build, speciesId } }) as unknown as Verdict;
    await open(
      async () => ({ ...THREE_VERDICTS, e: battlesAs(THREE_VERDICTS.e!, 'cramorant') }),
      THREE,
      leagueHost,
    );
    await waitFor(() => expect(document.querySelectorAll('.spec-row .verdict-tag').length).toBe(3));
    await waitFor(() => expect(screen.getByText(/2 not collected/)).toBeInTheDocument());
    expect(names()).not.toContain('Cramorant');
  });

  it('a Shadow copy collects only the Shadow form: the plain one stays Not collected', async () => {
    // Saved with the Shadow flag on the plain id, judged as the Shadow form.
    const shadowClodsire = { ...specimen('q', 'clodsire'), shadow: true } as unknown as Specimen;
    await open(
      async () => ({
        ...THREE_VERDICTS,
        q: asItself(verdict('q', 'Worth building', 60), 'clodsire_shadow'),
      }),
      [...THREE, shadowClodsire],
      leagueHost,
    );
    await waitFor(() => expect(document.querySelectorAll('.spec-row .verdict-tag').length).toBe(4));
    const plain = await waitFor(() => {
      const row = document.querySelector<HTMLElement>(
        `a.spec-row[href="${hashFor({ screen: 'species', id: 'clodsire' })}"]`,
      );
      expect(row).not.toBeNull();
      return row!;
    });
    expect(plain.lastElementChild).toHaveTextContent('Not collected');
  });

  it('shows the trend beside the rank: up 3 places for a climber, nothing for no move', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-11T20:00:00Z'));
    net.current = heavy('azumarill');
    await openLeague();
    // Azumarill climbs from PvPoke's fourth to first; the three above it drop one place each.
    await waitFor(() =>
      expect(
        within(rowOf('Azumarill')).getByRole('img', { name: 'up 3 places' }),
      ).toBeInTheDocument(),
    );
    const up = within(rowOf('Azumarill')).getByRole('img', { name: 'up 3 places' });
    expect(up).toHaveTextContent('3');
    expect(up.closest('.ui-tag')).toHaveClass('ui-tag-win');
    expect(rowOf('Azumarill').querySelector('.mtag')).toHaveTextContent('#1 meta');
    const down = within(rowOf('Cramorant')).getByRole('img', { name: 'down 1 place' });
    expect(down.closest('.ui-tag')).toHaveClass('ui-tag-loss');
    expect(within(rowOf('Quagsire')).queryByRole('img', { name: /places?$/ })).toBeNull();
    expect(net.api.length).toBeGreaterThan(0);
    expect(net.api.every((u) => u.pathname === '/api/v1/meta')).toBe(true);
  });

  it('reads nothing from the worker and shows no trend with sharing off', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-11T20:00:00Z'));
    net.current = heavy('azumarill');
    await storage.saveSettings({
      ...(await storage.loadSettings()),
      share: { enabled: false },
    });
    await openLeague();
    // PvPoke's order alone: Cramorant first, Azumarill fourth.
    await waitFor(() =>
      expect(rowOf('Cramorant').querySelector('.mtag')).toHaveTextContent('#1 meta'),
    );
    expect(rowOf('Azumarill').querySelector('.mtag')).toHaveTextContent('#4 meta');
    expect(document.querySelector('.trend')).toBeNull();
    expect(screen.queryAllByRole('img', { name: /places?$/ })).toHaveLength(0);
    expect(net.api).toHaveLength(0);
  });

  it('lists the ranked part of the league by default and searches all of it', async () => {
    await open(
      async () => THREE_VERDICTS,
      THREE,
      (o) => leagueHost(o, true),
    );
    await waitFor(() => expect(document.querySelectorAll('.spec-row .verdict-tag').length).toBe(3));
    await waitFor(() => expect(rowOf('Cramorant').querySelector('.mtag')).not.toBeNull());
    // Lanturn is PvPoke's 150th, inside the top 200; Caterpie is not ranked at all.
    expect(names()).toEqual([
      'Tinkaton',
      'Medicham',
      'Azumarill',
      'Cramorant',
      'Clodsire',
      'Quagsire',
      'Lanturn',
    ]);
    expect(rowOf('Lanturn').querySelector('.mtag')).toBeNull();
    expect(screen.getByText('3 Pokémon · 3 kinds · 4 not collected')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search Pokémon'), {
        target: { value: 'caterpie' },
      });
    });
    expect(names()).toEqual(['Caterpie']);
    expect(rowOf('Caterpie')).toHaveAttribute(
      'href',
      hashFor({ screen: 'species', id: 'caterpie' }),
    );
  });

  it('counts the listed rows with nothing collected', async () => {
    render(
      <AppProvider host={leagueHost({}, true)}>
        <Probe />
        <Collection />
      </AppProvider>,
    );
    await waitFor(() => expect(names()).toHaveLength(7));
    expect(names()).not.toContain('Caterpie');
    expect(screen.getByText('7 Pokémon in Great League')).toBeInTheDocument();
  });

  it('restores the scroll only once the blended order is in', async () => {
    await openLeague();
    await waitFor(() => expect(rowOf('Cramorant').querySelector('.mtag')).not.toBeNull());
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
    await act(async () => {
      fireEvent.scroll(window);
      await new Promise((r) => window.requestAnimationFrame(() => r(null)));
    });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    // The ranking loads afresh on the way back and is held there.
    resetMetaDataForTests();
    resetMetaHooksForTests();
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((r) => (release = r));
    await go({ screen: 'species', id: 'cramorant' });
    expect(document.querySelector('.spec-row')).toBeNull();
    await go({ screen: 'collection' });
    await waitFor(() => expect(names()).toHaveLength(6));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 240));
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('shows Nothing matches, not a zero count, for your own filtered to nothing before the league is in', async () => {
    await open(
      async () => THREE_VERDICTS,
      THREE,
      (o) => leagueHost({ ...o, leagueInfo: vi.fn(() => new Promise(() => undefined)) }),
    );
    await waitFor(() => expect(names()).toHaveLength(3));
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search Pokémon'), {
        target: { value: 'zzzz' },
      });
    });
    expect(document.querySelector('.ui-empty')).toHaveTextContent(
      'Nothing matches. Try another name or clear a filter.',
    );
    expect(screen.queryByText(/^0 Pokémon/)).toBeNull();
  });

  it('shows Loading, not a blank list, with nothing collected before the league is in', async () => {
    render(
      <AppProvider host={leagueHost({ leagueInfo: vi.fn(() => new Promise(() => undefined)) })}>
        <Probe />
        <Collection />
      </AppProvider>,
    );
    await waitFor(() => {
      expect(latest?.state.boot).toBe('ready');
      expect(latest?.state.settingsLoaded).toBe(true);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading Great League');
    expect(document.querySelector('.ui-empty')).toBeNull();
    expect(screen.queryByText(/Pokémon in Great League/)).toBeNull();
  });
});
