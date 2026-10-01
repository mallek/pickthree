import 'fake-indexeddb/auto';
import type { MoveChoice, MovePool, Specimen, Verdict, VerdictLabel } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { resetStickyForTests } from '../src/components.tsx';
import { COUNTER_ORIGIN } from '../src/counter.ts';
import { emptyLayoutValue } from '../src/format.ts';
import { resetMetaDataForTests } from '../src/metaData.ts';
import { SpeciesPage } from '../src/screens/SpeciesPage.tsx';
import { EMPTY_SUMMARY, resetMetaHooksForTests } from '../src/state/useMeta.ts';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost, GREAT } from './fakeHost.ts';

// Synthetic league data: PvPoke's group is tinkaton, azumarill, clodsire, in that overall order.
const GROUP = [
  { speciesId: 'tinkaton', fastMove: 'FAIRY_WIND', chargedMoves: ['GIGATON_HAMMER', 'BULLDOZE'] },
  { speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'] },
  { speciesId: 'clodsire', fastMove: 'POISON_STING', chargedMoves: ['EARTHQUAKE', 'SLUDGE_BOMB'] },
];
const OVERALL = [
  { speciesId: 'tinkaton', score: 95 },
  { speciesId: 'azumarill', score: 92 },
  { speciesId: 'clodsire', score: 90 },
];

const MOVES = {
  BUBBLE: { name: 'Bubble', type: 'water' },
  ICE_BEAM: { name: 'Ice Beam', type: 'ice' },
  PLAY_ROUGH: { name: 'Play Rough', type: 'fairy' },
  HYDRO_PUMP: { name: 'Hydro Pump', type: 'water' },
  POISON_STING: { name: 'Poison Sting', type: 'poison' },
  EARTHQUAKE: { name: 'Earthquake', type: 'ground' },
  SLUDGE_BOMB: { name: 'Sludge Bomb', type: 'poison' },
  MEGAHORN: { name: 'Megahorn', type: 'bug' },
};

/** 100 shared battles from 7 players, and 40 tournament battles at two events. */
const SUMMARY = {
  ...EMPTY_SUMMARY,
  league: 'great',
  battles: 100,
  devices: 7,
  species: [
    {
      speciesId: 'tinkaton',
      sightings: 50,
      wins: 20,
      losses: 30,
      runs: 0,
      runWins: 0,
      runLosses: 0,
    },
    {
      speciesId: 'azumarill',
      sightings: 20,
      wins: 5,
      losses: 1,
      runs: 16,
      runWins: 0,
      runLosses: 0,
    },
  ],
  tournament: {
    events: 2,
    battles: 40,
    eventsOther: 0,
    species: [
      {
        speciesId: 'tinkaton',
        picks: 12,
        game1Picks: 6,
        wins: 6,
        losses: 6,
        unresolvedForms: 0,
      },
      {
        speciesId: 'azumarill',
        picks: 4,
        game1Picks: 2,
        wins: 3,
        losses: 1,
        unresolvedForms: 0,
      },
    ],
  },
};

function detailOf(speciesId: string, over: Record<string, unknown> = {}) {
  return {
    league: 'great',
    speciesId,
    since: '',
    until: '',
    source: 'all',
    sightings: 0,
    wins: 0,
    losses: 0,
    runs: 0,
    runWins: 0,
    runLosses: 0,
    weekly: [],
    bands: [],
    alongside: [],
    movesets: [],
    tournament: null,
    generatedAt: '',
    ...over,
  };
}

const DETAILS: Record<string, unknown> = {
  azumarill: detailOf('azumarill', {
    sightings: 20,
    wins: 5,
    losses: 1,
    runs: 16,
    movesets: [
      { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], battles: 12 },
      { fast: 'BUBBLE', charged: ['ICE_BEAM', 'HYDRO_PUMP'], battles: 3 },
    ],
    alongside: [
      { speciesId: 'tinkaton', battles: 9 },
      { speciesId: 'clodsire', battles: 6 },
      { speciesId: 'medicham', battles: 4 },
      { speciesId: 'dragonite_shadow', battles: 2 },
    ],
    tournament: {
      picks: 4,
      game1Picks: 2,
      wins: 3,
      losses: 1,
      byDepth: [],
      unresolvedForms: 0,
      broughtBy: 5,
      rosterSize: 20,
      pickedOnStream: 4,
      movesets: [{ fast: 'BUBBLE', charged: ['PLAY_ROUGH', 'ICE_BEAM'], entries: 3 }],
      movesetsKnown: 3,
    },
  }),
  // Nobody faced it this window; the reporters who ran it ran Megahorn in place of Sludge Bomb.
  clodsire: detailOf('clodsire', {
    runs: 5,
    movesets: [{ fast: 'POISON_STING', charged: ['EARTHQUAKE', 'MEGAHORN'], battles: 5 }],
  }),
};

interface Net {
  api: URL[];
  apiStatus: number | null;
  banned: string[];
}

function stubNet(net: Net) {
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const raw = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (raw.startsWith(COUNTER_ORIGIN)) {
      const url = new URL(raw);
      if (!url.pathname.startsWith('/api/')) {
        return new Response('{}', { status: 200 });
      }
      net.api.push(url);
      if (net.apiStatus !== null) {
        return new Response('{}', { status: net.apiStatus });
      }
      const league = url.searchParams.get('league');
      if (url.pathname === '/api/v1/meta') {
        return json({ ...SUMMARY, league });
      }
      const m = /^\/api\/v1\/species\/([a-z0-9_]+)$/.exec(url.pathname);
      if (m) {
        const id = m[1]!;
        return json({ ...((DETAILS[id] as object | undefined) ?? detailOf(id)), league });
      }
      return new Response('{}', { status: 404 });
    }
    if (raw.startsWith('/data/meta/')) {
      return json(GROUP);
    }
    if (raw.startsWith('/data/rankings/')) {
      return json(OVERALL);
    }
    if (raw.startsWith('/data/legal/')) {
      return json({ banned: net.banned });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

function freshNet(over: Partial<Net> = {}): Net {
  return { api: [], apiStatus: null, banned: [], ...over };
}

/** A synthetic move choice, as the worker's movePool returns it. */
function choice(
  moveId: string,
  tm: MoveChoice['tm'] = 'tm',
  counts: number[] | null = null,
): MoveChoice {
  const m = MOVES[moveId as keyof typeof MOVES];
  return {
    moveId,
    name: m.name,
    type: m.type as MoveChoice['type'],
    tm,
    energy: 50,
    energyGain: 4,
    turns: 1,
    countFromFast: counts ? counts[0]! : null,
    counts,
    effects: [],
    altType: null,
  };
}

/** Synthetic pools: the recommended set, plus a move outside it. Ice Beam stands in as elite. */
const POOLS: Record<string, MovePool> = {
  azumarill: {
    fast: [choice('BUBBLE')],
    charged: [
      choice('ICE_BEAM', 'elite', [5, 4, 5]),
      choice('PLAY_ROUGH', 'tm', [7, 6, 7]),
      choice('HYDRO_PUMP', 'tm', [9, 9, 8]),
    ],
    recommended: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
  },
  tinkaton: {
    fast: [choice('POISON_STING')],
    charged: [choice('EARTHQUAKE', 'tm', [6, 6, 6])],
    recommended: { fast: 'POISON_STING', charged: ['EARTHQUAKE'] },
  },
};

/** The pool for a species, or undefined for one the test does not stock. */
const movePoolFake = () => vi.fn(async (speciesId: string) => POOLS[speciesId]);

/** fakeHost with the moves the synthetic movesets name. */
function host(overrides: Partial<Record<string, unknown>> = {}) {
  const base = fakeHost();
  const ready = base.ready as unknown as () => Promise<Record<string, unknown>>;
  return fakeHost({
    ready: vi.fn(async () => {
      const r = await ready();
      return {
        ...r,
        species: {
          ...(r.species as object),
          marill: { name: 'Marill', types: ['water', 'fairy'], familyId: 'azumarill', dex: 183 },
          azumarill_shadow: {
            name: 'Azumarill (Shadow)',
            types: ['water', 'fairy'],
            familyId: 'azumarill',
            dex: 184,
          },
        },
        moves: { ...(r.moves as object), ...MOVES },
      };
    }),
    movePool: movePoolFake(),
    ...overrides,
  });
}

function specimen(
  id: string,
  speciesId: string,
  cp: number,
  level: number,
  shadow = false,
): Specimen {
  return {
    id,
    speciesId,
    familyId: speciesId,
    ivs: { atk: 0, def: 15, sta: 15 },
    level: { min: level, max: level },
    cp,
    hp: 150,
    shadow,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-20 12:00:00',
    raw: {},
  } as unknown as Specimen;
}

function verdict(specimenId: string, speciesId: string, label: VerdictLabel, rank: number) {
  return {
    specimenId,
    label,
    line: '',
    buildSpecies: [speciesId],
    megaBuilds: [],
    build: { speciesId, ivRank: { rank, total: 4096 } },
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

/** Three Azumarill and a Marill that builds as one, plus a Tinkaton. */
const SPECIMENS = [
  specimen('a1', 'azumarill', 1384, 31),
  specimen('a2', 'azumarill', 1491, 40),
  specimen('a3', 'azumarill', 1500, 47),
  specimen('m1', 'marill', 1100, 25),
  specimen('t1', 'tinkaton', 1450, 30),
];
const VERDICTS: Record<string, Verdict> = {
  a1: verdict('a1', 'azumarill', 'Wait for better IVs', 1200),
  a2: verdict('a2', 'azumarill', 'Built', 10),
  a3: verdict('a3', 'azumarill', 'Worth building', 150),
  m1: verdict('m1', 'azumarill', 'Worth building', 2000),
  t1: verdict('t1', 'tinkaton', 'Built', 5),
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

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

/** The species page on its own route, the route's name anywhere else. */
function Screens() {
  const { route } = useAppState();
  if (route.screen === 'species') {
    return <SpeciesPage key={route.id} id={route.id} />;
  }
  return <p data-testid="elsewhere">{route.screen}</p>;
}

function renderPage(h = host()) {
  return render(
    <AppProvider host={h}>
      <Probe />
      <Screens />
    </AppProvider>,
  );
}

/** The facts card's value for a label, as text. */
function fact(label: string): string {
  const row = screen.getByText(label).closest('.kv');
  if (!row) {
    throw new Error(`no row ${label}`);
  }
  return row.lastElementChild?.textContent ?? '';
}

function section(title: string): HTMLElement {
  const h = screen.getByRole('heading', { name: title });
  return h.parentElement as HTMLElement;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetMetaDataForTests();
  resetMetaHooksForTests();
  resetStickyForTests();
  latest = null;
  window.location.hash = '#/species/azumarill';
  // recordError's device summary reads matchMedia, which jsdom does not implement.
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T20:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Species page', () => {
  it('a Pokemon you own: hero, facts, yours, moves, teammates and actions', async () => {
    await seed();
    const net = freshNet();
    stubNet(net);
    renderPage(host({ verdicts: vi.fn(async () => VERDICTS) }));

    expect(await screen.findByRole('heading', { name: 'Azumarill', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    // The blended rank: Tinkaton was faced and picked more, so Azumarill is second; PvPoke has
    // it second too.
    await waitFor(() => expect(screen.getByText('#2 meta')).toBeInTheDocument());
    expect(screen.getByText('#2 PvPoke')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('You have 4')).toBeInTheDocument());

    // Facts: the share in pink with its mark, the record, the tournament pick share, the source.
    await waitFor(() => expect(fact('Share of battles')).toBe('20%'));
    const share = screen.getByText('Share of battles').closest('.kv')!.lastElementChild!;
    expect(share).toHaveClass('ui-measured-num');
    expect(share.querySelector('svg')).not.toBeNull();
    expect(fact('Players went against it')).toBe('5-1');
    expect(fact('At tournaments')).toBe('10% of picks');
    expect(
      screen.getByText('This meta · 100 GBL battles from 7 players and 40 tournament battles'),
    ).toBeInTheDocument();

    // Yours: best IV rank first, each row to its specimen page; the Marill says its name.
    const yours = section('Yours');
    await waitFor(() => expect(within(yours).getAllByRole('link')).toHaveLength(4));
    const rows = within(yours).getAllByRole('link');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual([
      '#/collection/a2',
      '#/collection/a3',
      '#/collection/a1',
      '#/collection/m1',
    ]);
    expect(rows[0]).toHaveTextContent('CP 1491 · Top 1% · Level 40');
    expect(within(rows[0]!).getByText('Built')).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent('Marill · CP 1100');

    // Recommended moves: PvPoke's set from the worker's move pool, laid out as the specimen page
    // lays it out, with move counts. Only the Elite TM badge means anything without a copy.
    const rec = await waitFor(() => section('Recommended moves'));
    expect([...rec.querySelectorAll('.move-name')].map((e) => e.textContent)).toEqual([
      'Bubble',
      'Ice Beam',
      'Play Rough',
    ]);
    expect(within(rec).getByText('Elite TM')).toBeInTheDocument();
    expect(within(rec).queryByText('TM')).toBeNull();
    expect(within(rec).getByText('5-4-5 Bubble')).toBeInTheDocument();
    expect(within(rec).queryByText('Hydro Pump')).toBeNull();

    // Moves players ran: the most run fast move and two charged moves, against PvPoke's set.
    const moves = section('Moves players ran');
    const names = [...moves.querySelectorAll('.move-name')].map((e) => e.textContent);
    expect(names).toEqual(['Bubble', 'Ice Beam', 'Play Rough']);
    expect(
      within(moves).getByText(
        'Seen in 12 of 15 battles with known moves. Same as PvPoke recommends.',
      ),
    ).toBeInTheDocument();

    // Tournament moves, from roster entries in roster order, PvPoke's set marked in any order.
    const tm = section('Moves at tournaments');
    expect(within(tm).getByText('Bubble, Play Rough and Ice Beam')).toBeInTheDocument();
    expect(within(tm).getByText('3 entries')).toBeInTheDocument();
    expect(within(tm).getByText("PvPoke's set")).toBeInTheDocument();

    // Seen next to: the top three, each to its own species page.
    const next = section('Seen next to');
    const mates = within(next).getAllByRole('link');
    expect(mates.map((a) => a.textContent)).toEqual(['Tinkaton', 'Clodsire', 'Medicham']);
    expect(mates.map((a) => a.getAttribute('href'))).toEqual([
      '#/species/tinkaton',
      '#/species/clodsire',
      '#/species/medicham',
    ]);

    expect(screen.getByRole('link', { name: 'Build around it' })).toHaveAttribute(
      'href',
      '#/build?lead=azumarill',
    );
    expect(screen.getByRole('link', { name: 'Who beats it' })).toHaveAttribute(
      'href',
      '#/counters?vs=azumarill&from=1',
    );

    // The reads carry the league and the window; the only Pokemon named is the page's own.
    expect(net.api.length).toBeGreaterThan(0);
    for (const url of net.api) {
      expect(url.searchParams.get('league')).toBe('great');
      for (const key of url.searchParams.keys()) {
        expect(['league', 'since', 'until', 'source']).toContain(key);
      }
      expect(['/api/v1/meta', '/api/v1/species/azumarill']).toContain(url.pathname);
    }
  });

  it('a Pokemon you do not own, nobody faced, banned at tournaments', async () => {
    window.location.hash = '#/species/clodsire';
    const net = freshNet({ banned: ['clodsire'] });
    stubNet(net);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Clodsire', level: 2 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Not in your collection')).toBeInTheDocument());
    await waitFor(() => expect(fact('Share of battles')).toBe('Not faced in this window'));
    expect(screen.queryByText('Players went against it')).toBeNull();
    expect(fact('At tournaments')).toBe('Banned at tournaments');

    const yours = section('Yours');
    expect(
      within(yours).getByText('Scan one in Poke Genie, or add it by hand.'),
    ).toBeInTheDocument();
    expect(within(yours).getByRole('link', { name: 'Add one' })).toHaveAttribute(
      'href',
      '#/add?species=clodsire',
    );
    // One filled button on the page: Build around it. Add one is the secondary style.
    expect(within(yours).getByRole('link', { name: 'Add one' })).not.toHaveClass('ui-btn-primary');
    expect(
      [...document.querySelectorAll('.ui-btn-primary')].map((e) => e.textContent?.trim()),
    ).toEqual(['Build around it']);

    const moves = section('Moves players ran');
    const names = [...moves.querySelectorAll('.move-name')].map((e) => e.textContent);
    expect(names).toEqual(['Poison Sting', 'Earthquake', 'Megahorn']);
    expect(
      within(moves).getByText(
        'Seen in 5 of 5 battles with known moves. PvPoke runs Sludge Bomb over Megahorn.',
      ),
    ).toBeInTheDocument();
    // Banned at tournaments: no tournament moves card.
    expect(screen.queryByRole('heading', { name: 'Moves at tournaments' })).toBeNull();
  });

  it('PvPoke set for the league in play, and no reported-moves card when nothing was reported', async () => {
    window.location.hash = '#/species/tinkaton';
    stubNet(freshNet());
    const movePool = movePoolFake();
    renderPage(host({ movePool }));

    const rec = await waitFor(() => section('Recommended moves'));
    expect([...rec.querySelectorAll('.move-name')].map((e) => e.textContent)).toEqual([
      'Poison Sting',
      'Earthquake',
    ]);
    expect(movePool).toHaveBeenCalledWith(
      'tinkaton',
      null,
      { fast: null, charged: [] },
      { allowEliteTm: true },
    );
    await waitFor(() => expect(screen.getByText('Share of battles')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Moves players ran' })).toBeNull();
    expect(screen.queryByText(/No moves reported/)).toBeNull();
  });

  it('a failed read says so under the hero; Yours and the actions stay; Try again reads again', async () => {
    await seed();
    const net = freshNet({ apiStatus: 503 });
    stubNet(net);
    renderPage(host({ verdicts: vi.fn(async () => VERDICTS) }));

    expect(await screen.findByText('Could not load the community meta.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Azumarill', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('Share of battles')).toBeNull();
    await waitFor(() => expect(within(section('Yours')).getAllByRole('link')).toHaveLength(4));
    expect(screen.getByRole('link', { name: 'Build around it' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Who beats it' })).toBeInTheDocument();

    net.apiStatus = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fact('Share of battles')).toBe('20%'));
    expect(screen.queryByText('Could not load the community meta.')).toBeNull();
  });

  it('an id the league does not have is an empty state with a way to Collection', async () => {
    window.location.hash = '#/species/caterpie';
    const net = freshNet();
    stubNet(net);
    renderPage();
    expect(await screen.findByText('No Pokémon called that in this league.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Collection' })).toHaveAttribute(
      'href',
      '#/collection',
    );
    expect(net.api.some((u) => u.pathname.startsWith('/api/v1/species/'))).toBe(false);
  });

  it('a Pokemon the league does not allow says so by name, with a way to Collection', async () => {
    window.location.hash = '#/species/medicham';
    const net = freshNet();
    stubNet(net);
    const base = host();
    const info = base.leagueInfo as unknown as () => Promise<{ legal: string[] }>;
    renderPage(
      host({
        leagueInfo: vi.fn(async () => {
          const i = await info();
          return { ...i, legal: i.legal.filter((x) => x !== 'medicham') };
        }),
      }),
    );
    expect(await screen.findByText('Medicham is not allowed in Great League.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Collection' })).toHaveAttribute(
      'href',
      '#/collection',
    );
    expect(net.api.some((u) => u.pathname.startsWith('/api/v1/species/'))).toBe(false);
  });

  it('a Shadow copy is listed under the Shadow form only', async () => {
    // One mapped by the importer to its Shadow id, one saved with the flag on the plain id.
    await seed([
      specimen('a1', 'azumarill', 1491, 40),
      specimen('s1', 'azumarill_shadow', 1480, 38, true),
      specimen('s2', 'azumarill', 1470, 36, true),
    ]);
    const verdicts = {
      a1: verdict('a1', 'azumarill', 'Built', 10),
      s1: verdict('s1', 'azumarill_shadow', 'Worth building', 40),
      s2: verdict('s2', 'azumarill_shadow', 'Worth building', 80),
    };
    const base = host();
    const info = base.leagueInfo as unknown as () => Promise<{ legal: string[] }>;
    const h = host({
      verdicts: vi.fn(async () => verdicts),
      leagueInfo: vi.fn(async () => {
        const i = await info();
        return { ...i, legal: [...i.legal, 'azumarill_shadow'] };
      }),
    });
    stubNet(freshNet());

    window.location.hash = '#/species/azumarill_shadow';
    renderPage(h);
    await waitFor(() => expect(screen.getByText('You have 2')).toBeInTheDocument());
    await waitFor(() =>
      expect(
        within(section('Yours'))
          .getAllByRole('link')
          .map((r) => r.getAttribute('href')),
      ).toEqual(['#/collection/s1', '#/collection/s2']),
    );
    cleanup();

    window.location.hash = '#/species/azumarill';
    renderPage(h);
    await waitFor(() => expect(screen.getByText('You have 1')).toBeInTheDocument());
    await waitFor(() =>
      expect(
        within(section('Yours'))
          .getAllByRole('link')
          .map((r) => r.getAttribute('href')),
      ).toEqual(['#/collection/a1']),
    );
  });

  it('switches to the league a link names, once, then lets go of it', async () => {
    window.location.hash = '#/species/azumarill?l=mega-great';
    const megaGreat = {
      ...GREAT,
      id: 'mega-great',
      title: 'Great League: Mega Edition',
      short: 'Mega Great',
    };
    const base = host();
    const ready = base.ready as unknown as () => Promise<Record<string, unknown>>;
    const info = base.leagueInfo as unknown as (l: string) => Promise<Record<string, unknown>>;
    const h = host({
      ready: vi.fn(async () => ({ ...(await ready()), leagues: [GREAT, megaGreat] })),
      leagueInfo: vi.fn(async (league: string) => ({ ...(await info(league)), id: league })),
    });
    const net = freshNet();
    stubNet(net);
    renderPage(h);
    await waitFor(() => expect(latest?.settings.league).toBe('mega-great'));
    await waitFor(() => expect(latest?.route).toEqual({ screen: 'species', id: 'azumarill' }));
    await waitFor(() => expect(fact('Share of battles')).toBe('20%'));
    expect(net.api.length).toBeGreaterThan(0);
    expect(net.api.every((u) => u.searchParams.get('league') === 'mega-great')).toBe(true);
  });

  it('the app routes #/species/<id> to the page under the Collection tab', async () => {
    stubNet(freshNet());
    vi.stubGlobal('scrollTo', vi.fn());
    render(
      <AppProvider host={host()}>
        <App />
      </AppProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Azumarill', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collection' })).toHaveClass('on');
  });
});
