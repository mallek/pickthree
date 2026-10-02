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
    source: 'rankings',
  },
  tinkaton: {
    fast: [choice('POISON_STING')],
    charged: [choice('EARTHQUAKE', 'tm', [6, 6, 6])],
    recommended: { fast: 'POISON_STING', charged: ['EARTHQUAKE'] },
    source: 'rankings',
  },
  // The same set as PvPoke's meta group lists for it.
  clodsire: {
    fast: [choice('POISON_STING')],
    charged: [choice('EARTHQUAKE'), choice('SLUDGE_BOMB'), choice('MEGAHORN')],
    recommended: { fast: 'POISON_STING', charged: ['EARTHQUAKE', 'SLUDGE_BOMB'] },
    source: 'rankings',
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

/**
 * A species view as the worker answers it: each page's copies in IV rank order, judged, and the
 * pick. With no `pick`, the league's pin decides (null: unpinned), else the first copy.
 */
function viewFake(
  pages: Record<string, { ids: string[]; verdicts: Record<string, Verdict> }>,
): ReturnType<typeof vi.fn> {
  return vi.fn(
    async (
      speciesId: string,
      specimens: Specimen[],
      options: { pins?: Record<string, string | null> },
    ) => {
      const page = pages[speciesId];
      const have = new Set(specimens.map((sp) => sp.id));
      const ids = (page?.ids ?? []).filter((id) => have.has(id));
      const pin = options.pins?.[speciesId];
      return {
        speciesId,
        copies: ids.map((id) => ({
          specimenId: id,
          verdict: page!.verdicts[id]!,
          alsoPickFor: [],
        })),
        pickId: pin === null ? null : pin && ids.includes(pin) ? pin : (ids[0] ?? null),
        defaultId: ids[0] ?? null,
        unpinned: pin === null,
      };
    },
  );
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

/** Azumarill's page: best IV rank first, the Marill last. */
const AZU_VIEW = () =>
  viewFake({ azumarill: { ids: ['a2', 'a3', 'a1', 'm1'], verdicts: VERDICTS } });

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
  return h.closest('.stack') as HTMLElement;
}

/** The copies listed under Yours, as their links. */
function yoursRows(): HTMLElement[] {
  return [...section('Yours').querySelectorAll<HTMLElement>('.spec-row')];
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
    renderPage(host({ verdicts: vi.fn(async () => VERDICTS), speciesView: AZU_VIEW() }));

    expect(await screen.findByRole('heading', { name: 'Azumarill', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    // The blended rank: Tinkaton was faced and picked more, so Azumarill is second; PvPoke has
    // it second too.
    await waitFor(() => expect(screen.getByText('#2 meta')).toBeInTheDocument());
    expect(screen.getByText('#2 PvPoke')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('You have 3, and 1 Marill that evolves into it')).toBeInTheDocument(),
    );

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

    // Yours: best IV rank first, three and then Show all; each row shows that copy on this page;
    // the Marill says its name.
    await waitFor(() => expect(yoursRows()).toHaveLength(3));
    fireEvent.click(within(section('Yours')).getByRole('button', { name: 'Show all 4' }));
    const rows = yoursRows();
    expect(rows.map((r) => r.getAttribute('href'))).toEqual([
      '#/species/azumarill?copy=a2',
      '#/species/azumarill?copy=a3',
      '#/species/azumarill?copy=a1',
      '#/species/azumarill?copy=m1',
    ]);
    expect(rows[0]).toHaveTextContent('CP 1491 · Top 1% · Level 40');
    expect(within(rows[0]!).getByText('Built')).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent('Marill · CP 1100');
    expect(
      within(section('Yours')).getByText(
        'Best IV rank for Great League first. Tap one to show it.',
      ),
    ).toBeInTheDocument();

    // Moves: every move the species can know, PvPoke's set starred and, with none entered for
    // the shown copy, ticked. Only the Elite TM badge means anything here.
    const rec = await waitFor(() => section('Moves'));
    expect([...rec.querySelectorAll('.move-name')].map((e) => e.textContent)).toEqual([
      'Bubble',
      'Ice Beam',
      'Play Rough',
      'Hydro Pump',
    ]);
    expect([...rec.querySelectorAll('.move-opt.on .move-name')].map((e) => e.textContent)).toEqual([
      'Bubble',
      'Ice Beam',
      'Play Rough',
    ]);
    expect(within(rec).getAllByRole('img', { name: 'Recommended' })).toHaveLength(3);
    expect(within(rec).getByText('Elite TM')).toBeInTheDocument();
    expect(within(rec).queryByText('TM')).toBeNull();
    expect(within(rec).getByText('5-4-5 Bubble')).toBeInTheDocument();
    expect(within(rec).getByText('Recommended by PvPoke for Great League')).toBeInTheDocument();
    expect(within(rec).getByText(/Moves not entered yet/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recommended moves' })).toBeNull();
    expect(screen.queryByText(/PvPoke has no set/)).toBeNull();

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

  it('compares the moves players ran against the set Recommended moves shows', async () => {
    // PvPoke's ranking runs Megahorn where its meta group lists Sludge Bomb; the page states the
    // ranking's set in both places.
    window.location.hash = '#/species/clodsire';
    stubNet(freshNet());
    const pool: MovePool = {
      ...POOLS.clodsire!,
      recommended: { fast: 'POISON_STING', charged: ['EARTHQUAKE', 'MEGAHORN'] },
    };
    renderPage(host({ movePool: vi.fn(async () => pool) }));

    const rec = await waitFor(() => section('Recommended moves'));
    expect([...rec.querySelectorAll('.move-name')].map((e) => e.textContent)).toEqual([
      'Poison Sting',
      'Earthquake',
      'Megahorn',
    ]);
    await waitFor(() =>
      expect(
        within(section('Moves players ran')).getByText(
          'Seen in 5 of 5 battles with known moves. Same as PvPoke recommends.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('says when PvPoke has no set and pick3 picked the moves by their stats', async () => {
    window.location.hash = '#/species/tinkaton';
    stubNet(freshNet());
    const pool: MovePool = { ...POOLS.tinkaton!, source: 'fallback' };
    renderPage(host({ movePool: vi.fn(async () => pool) }));

    const rec = await waitFor(() => section('Recommended moves'));
    expect(
      within(rec).getByText(
        'PvPoke has no set for Tinkaton in Great League; picked by move stats.',
      ),
    ).toBeInTheDocument();
    expect(
      within(rec).getByText('Teams and counters assume these moves until you add one.'),
    ).toBeInTheDocument();
  });

  it('the exclusion switch for a species you own leaves it out of teams and lets it back in', async () => {
    await seed();
    stubNet(freshNet());
    renderPage(host({ verdicts: vi.fn(async () => VERDICTS), speciesView: AZU_VIEW() }));

    const sw = await screen.findByRole('switch', {
      name: 'Use Azumarill in team recommendations',
    });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(sw).toHaveAttribute('aria-checked', 'true');
    // The copies it covers, as the specimen page says it: everything with a build of it.
    await waitFor(() =>
      expect(sw).toHaveAccessibleDescription('Covers your 3 Azumarill and 1 Marill.'),
    );

    fireEvent.click(sw);
    await waitFor(() => expect(latest?.settings.excludedSpecies).toEqual(['azumarill']));
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    await waitFor(() => expect(latest?.settings.excludedSpecies).toEqual([]));
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('the exclusion switch shows for a species you do not own, by its own id', async () => {
    window.location.hash = '#/species/clodsire';
    stubNet(freshNet());
    renderPage();

    const sw = await screen.findByRole('switch', {
      name: 'Use Clodsire in team recommendations',
    });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(sw).not.toHaveAccessibleDescription();
    fireEvent.click(sw);
    await waitFor(() => expect(latest?.settings.excludedSpecies).toEqual(['clodsire']));
  });

  it('lists a copy that needs a rescan last under Yours; shown, its edit icon enters values', async () => {
    const noIvs = { ...specimen('r1', 'azumarill', 1200, 28), ivs: null } as unknown as Specimen;
    await seed([...SPECIMENS, noIvs]);
    stubNet(freshNet());
    const rescan = {
      ...verdict('r1', 'azumarill', 'Needs rescan', 0),
      build: null,
      buildSpecies: [],
    } as unknown as Verdict;
    const all = { ...VERDICTS, r1: rescan };
    renderPage(
      host({
        verdicts: vi.fn(async () => all),
        speciesView: viewFake({
          azumarill: { ids: ['a2', 'a3', 'a1', 'm1', 'r1'], verdicts: all },
        }),
      }),
    );

    await waitFor(() => expect(yoursRows()).toHaveLength(3));
    fireEvent.click(within(section('Yours')).getByRole('button', { name: 'Show all 5' }));
    const last = yoursRows()[4]!;
    expect(last).toHaveAttribute('href', '#/species/azumarill?copy=r1');
    expect(last).toHaveTextContent('CP 1200 · IVs unknown');
    expect(last.querySelector('.verdict-tag')).toHaveAttribute('data-verdict', 'Needs rescan');
    // It is never the copy teams field: the pinned one is shown until it is tapped.
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '#/add?edit=a2');
    fireEvent.click(last);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '#/add?edit=r1'),
    );
    // No IVs, no build of this species: nothing to pin.
    expect(screen.queryByRole('button', { name: /Pin/ })).toBeNull();
  });

  it('a failed read says so under the hero; Yours and the actions stay; Try again reads again', async () => {
    await seed();
    const net = freshNet({ apiStatus: 503 });
    stubNet(net);
    renderPage(host({ verdicts: vi.fn(async () => VERDICTS), speciesView: AZU_VIEW() }));

    expect(await screen.findByText('Could not load the community meta.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Azumarill', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('Share of battles')).toBeNull();
    await waitFor(() => expect(yoursRows()).toHaveLength(3));
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
      expect(yoursRows().map((r) => r.getAttribute('href'))).toEqual([
        '#/species/azumarill_shadow?copy=s1',
        '#/species/azumarill_shadow?copy=s2',
      ]),
    );
    cleanup();

    window.location.hash = '#/species/azumarill';
    renderPage(h);
    await waitFor(() => expect(screen.getByText('You have 1')).toBeInTheDocument());
    await waitFor(() =>
      expect(yoursRows().map((r) => r.getAttribute('href'))).toEqual([
        '#/species/azumarill?copy=a1',
      ]),
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

/** A verdict with a whole build and a cost, for the shown copy's cost section. */
function costed(
  sp: Specimen,
  rank: number,
  buildLevel: number,
  cost: { stardust: number; candy: number; secondMoveUnlock?: boolean; eliteTm?: number },
  stageOffset = 0,
): Verdict {
  return {
    ...verdict(sp.id, 'azumarill', 'Worth building', rank),
    line: `Judged ${sp.id} as Azumarill.`,
    build: {
      specimenId: sp.id,
      specimen: sp,
      speciesId: 'azumarill',
      shadow: false,
      stageOffset,
      level: buildLevel,
      cp: 1498,
      baseCp: 1498,
      baseLevel: buildLevel,
      mega: null,
      ivs: sp.ivs,
      ivRank: { rank, total: 4096 },
      needsXl: false,
    },
    cost: {
      stardust: cost.stardust,
      candy: cost.candy,
      xlCandy: 0,
      eliteTm: cost.eliteTm ?? 0,
      evolutionCandy: stageOffset > 0 ? 25 : 0,
      secondMoveUnlock: cost.secondMoveUnlock ?? false,
      powerUpSteps: 0,
      estimated: false,
      megaEnergy: null,
      weight: 0,
    },
  } as unknown as Verdict;
}

const byId = (id: string): Specimen => SPECIMENS.find((sp) => sp.id === id)!;

/** Azumarill's page with whole verdicts: a2 built, a3 and a1 to power up, the Marill to evolve. */
const MANAGED: Record<string, Verdict> = {
  a2: costed(byId('a2'), 10, 40, { stardust: 0, candy: 0 }),
  a3: costed(byId('a3'), 150, 50, {
    stardust: 96000,
    candy: 80,
    secondMoveUnlock: true,
    eliteTm: 1,
  }),
  a1: costed(byId('a1'), 1200, 40, { stardust: 50000, candy: 40 }),
  m1: costed(byId('m1'), 2000, 40, { stardust: 120000, candy: 150 }, 1),
};

function managed(also: Record<string, string[]> = {}) {
  const fake = viewFake({ azumarill: { ids: ['a2', 'a3', 'a1', 'm1'], verdicts: MANAGED } });
  return vi.fn(async (...args: Parameters<typeof fake>) => {
    const view = (await fake(...args)) as {
      copies: { specimenId: string; alsoPickFor: string[] }[];
    };
    return {
      ...view,
      copies: view.copies.map((c) => ({ ...c, alsoPickFor: also[c.specimenId] ?? [] })),
    };
  });
}

function renderManaged(over: Partial<Record<string, unknown>> = {}) {
  stubNet(freshNet());
  return renderPage(
    host({ verdicts: vi.fn(async () => VERDICTS), speciesView: managed(), ...over }),
  );
}

const editHref = (): string | null =>
  screen.getByRole('link', { name: 'Edit' }).getAttribute('href');

describe('Species page: your copies', () => {
  it('shows the pinned copy first: its heading, the three icons, and its facts as this species', async () => {
    await seed();
    renderManaged();
    expect(await screen.findByRole('heading', { name: 'Your Azumarill' })).toBeInTheDocument();
    // With no pin stored, pick3's own pick carries the filled pin.
    expect(screen.getByRole('button', { name: 'Pinned for Great League' })).toBeInTheDocument();
    expect(editHref()).toBe('#/add?edit=a2');
    expect(screen.getByRole('button', { name: 'Remove from collection' })).toBeInTheDocument();
    expect(fact('Azumarill IV rank')).toBe('10 of 4096');
    expect(fact('IVs · Attack / Defense / HP')).toBe('0 / 15 / 15');
    expect(screen.getByText('Judged a2 as Azumarill.')).toBeInTheDocument();
    // The pinned row carries the pin; nothing is "Shown" while the pinned one is.
    const first = yoursRows()[0]!;
    expect(within(first).getByRole('img', { name: 'Pinned' })).toBeInTheDocument();
    expect(screen.queryByText('Shown')).toBeNull();
    expect(yoursRows()[0]).toHaveAttribute('aria-current', 'true');
  });

  it('hides Cost to build when there is nothing to pay, and shows it when there is', async () => {
    await seed();
    renderManaged();
    await screen.findByRole('heading', { name: 'Your Azumarill' });
    expect(screen.queryByRole('heading', { name: 'Cost to build' })).toBeNull();
    expect(screen.queryByText(/Already at level/)).toBeNull();

    fireEvent.click(yoursRows()[1]!);
    await waitFor(() => expect(editHref()).toBe('#/add?edit=a3'));
    expect(screen.getByRole('heading', { name: 'Cost to build' })).toBeInTheDocument();
    expect(screen.getByText('Level 47 to 50 · includes second move unlock')).toBeInTheDocument();
    expect(screen.getByText('Plus 1 Elite TM.')).toBeInTheDocument();
    expect([...document.querySelectorAll('.stat3 .stat .meta')].map((m) => m.textContent)).toEqual([
      'Stardust',
      'Candy',
      'XL Candy',
    ]);
  });

  it('a tapped copy is shown in place: the address names it, Back still leaves the page', async () => {
    await seed();
    renderManaged();
    await screen.findByRole('heading', { name: 'Your Azumarill' });
    const before = window.history.length;
    fireEvent.click(yoursRows()[1]!);
    await waitFor(() =>
      expect(latest?.route).toEqual({ screen: 'species', id: 'azumarill', copy: 'a3' }),
    );
    expect(window.location.hash).toBe('#/species/azumarill?copy=a3');
    expect(window.history.length).toBe(before);
    expect(editHref()).toBe('#/add?edit=a3');
    expect(fact('Azumarill IV rank')).toBe('150 of 4096');
    // It is shown, not pinned: an empty pin on it, the filled one still on the first row.
    expect(screen.getByRole('button', { name: 'Pin for Great League' })).toBeInTheDocument();
    expect(within(yoursRows()[1]!).getByText('Shown')).toBeInTheDocument();
    expect(within(yoursRows()[0]!).getByRole('img', { name: 'Pinned' })).toBeInTheDocument();
  });

  it('pinning another copy asks first, says what it overrides, then teams field that one', async () => {
    await seed();
    const speciesView = managed();
    renderManaged({ speciesView });
    await screen.findByRole('heading', { name: 'Your Azumarill' });
    fireEvent.click(yoursRows()[1]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Pin for Great League' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Pin this Azumarill for Great League?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'pick3 picks your best Azumarill for each league. This overrides that for Great League and unpins the CP 1491 one, so teams use this one instead.',
    );
    // Cancel changes nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest?.collection?.pins).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Pin for Great League' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Pin this one' }),
    );
    await waitFor(() => expect(latest?.collection?.pins).toEqual({ great: { azumarill: 'a3' } }));
    expect((await storage.loadCollection())?.pins).toEqual({ great: { azumarill: 'a3' } });
    // The page asks the worker again with the pin, and the filled pin moves.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Pinned for Great League' })).toBeInTheDocument(),
    );
    expect(speciesView.mock.calls.at(-1)?.[2]).toMatchObject({ pins: { azumarill: 'a3' } });
    expect(within(yoursRows()[1]!).getByRole('img', { name: 'Pinned' })).toBeInTheDocument();
    expect(within(yoursRows()[0]!).queryByRole('img', { name: 'Pinned' })).toBeNull();
  });

  it('the filled pin unpins: no copy is fielded, the page says so, and any copy can be pinned', async () => {
    await seed();
    renderManaged();
    fireEvent.click(await screen.findByRole('button', { name: 'Pinned for Great League' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Unpin this Azumarill for Great League?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'With no Azumarill pinned, pick3 treats Azumarill as one you do not have in Great League: it leaves your recommended teams, and Build and Counters use a typical one.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpin' }));
    await waitFor(() => expect(latest?.collection?.pins).toEqual({ great: { azumarill: null } }));
    expect(
      await screen.findByText(
        'No Azumarill is pinned for Great League, so pick3 treats it as one you do not have.',
      ),
    ).toBeInTheDocument();
    // The best copy is still the one shown, with an empty pin; no row carries a pin.
    expect(editHref()).toBe('#/add?edit=a2');
    expect(screen.queryByRole('img', { name: 'Pinned' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pin for Great League' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'pick3 picks your best Azumarill for each league. This pins this one for Great League, so teams use it.',
    );
  });

  it('a lower form is "to evolve", ranked as this species, with its moves assumed', async () => {
    await seed();
    window.location.hash = '#/species/azumarill?copy=m1';
    renderManaged({ speciesView: managed({ m1: ['tinkaton', 'clodsire'] }) });
    expect(
      await screen.findByRole('heading', { name: 'Your Marill to evolve' }),
    ).toBeInTheDocument();
    expect(fact('Azumarill IV rank')).toBe('2000 of 4096');
    expect(
      screen.getByText('Also your pick for Tinkaton and Clodsire. It can only evolve once.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Evolve it to Azumarill')).toBeInTheDocument();
    expect(screen.getByText('Level 25 to 40 · includes 25 candy to evolve')).toBeInTheDocument();
    const moves = await waitFor(() => section('Moves'));
    expect(
      within(moves).getByText(
        "A Marill's moves change when it evolves, so pick3 assumes the starred ones.",
      ),
    ).toBeInTheDocument();
  });

  it('ticks the moves the shown copy knows and figures the counts from its fast move', async () => {
    const knows = {
      ...byId('a2'),
      currentMoves: { fast: 'BUBBLE', charged: ['HYDRO_PUMP'] },
    } as Specimen;
    await seed(SPECIMENS.map((sp) => (sp.id === 'a2' ? knows : sp)));
    const movePool = movePoolFake();
    renderManaged({ movePool });
    const moves = await waitFor(() => section('Moves'));
    expect(
      [...moves.querySelectorAll('.move-opt.on .move-name')].map((e) => e.textContent),
    ).toEqual(['Bubble', 'Hydro Pump']);
    expect(within(moves).getAllByRole('img', { name: 'Recommended' })).toHaveLength(3);
    expect(
      within(moves).getByText(
        'pick3 uses these to work out what the recommended moves would cost.',
      ),
    ).toBeInTheDocument();
    expect(movePool).toHaveBeenCalledWith(
      'azumarill',
      'BUBBLE',
      { fast: 'BUBBLE', charged: ['HYDRO_PUMP'] },
      { allowEliteTm: true },
    );
  });

  it('a copy the address names that is not on this page falls back to the pinned one', async () => {
    await seed();
    window.location.hash = '#/species/azumarill?copy=t1';
    renderManaged();
    await screen.findByRole('heading', { name: 'Your Azumarill' });
    expect(editHref()).toBe('#/add?edit=a2');
    cleanup();
    window.location.hash = '#/species/azumarill?copy=gone-long-ago';
    renderManaged();
    await screen.findByRole('heading', { name: 'Your Azumarill' });
    expect(editHref()).toBe('#/add?edit=a2');
  });

  it('removing asks first; the page stays and shows the next pick; an import will skip it', async () => {
    await seed();
    window.location.hash = '#/species/azumarill?copy=a3';
    renderManaged();
    await waitFor(() => expect(editHref()).toBe('#/add?edit=a3'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from collection' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Remove this Azumarill?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'It leaves your collection on this phone. A new import will not bring it back.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(latest?.collection?.specimens).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Remove from collection' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(() =>
      expect(latest?.collection?.specimens.map((sp) => sp.id)).toEqual(['a1', 'a2', 'm1', 't1']),
    );
    expect(latest?.collection?.removed).toHaveLength(1);
    await waitFor(() => expect(latest?.route).toEqual({ screen: 'species', id: 'azumarill' }));
    await waitFor(() => expect(editHref()).toBe('#/add?edit=a2'));
    expect(screen.getByRole('heading', { name: 'Azumarill', level: 2 })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('You have 2, and 1 Marill that evolves into it')).toBeInTheDocument(),
    );
  });

  it('names the species a copy builds better as, and links there with the copy shown', async () => {
    await seed();
    window.location.hash = '#/species/marill';
    const base = host();
    const info = base.leagueInfo as unknown as () => Promise<{ legal: string[] }>;
    const asMarill = { ...MANAGED.m1!, build: { ...MANAGED.m1!.build!, speciesId: 'marill' } };
    renderManaged({
      leagueInfo: vi.fn(async () => {
        const i = await info();
        return { ...i, legal: [...i.legal, 'marill'] };
      }),
      speciesView: viewFake({ marill: { ids: ['m1'], verdicts: { m1: asMarill as Verdict } } }),
    });
    expect(await screen.findByRole('heading', { name: 'Your Marill' })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Best as Azumarill in Great League' }),
      ).toHaveAttribute('href', '#/species/azumarill?copy=m1'),
    );
    expect(screen.getByText('You have 1')).toBeInTheDocument();
  });

  it('a species the league does not allow still shows your copy, to edit or remove', async () => {
    await seed([specimen('md', 'medicham', 1300, 30)]);
    window.location.hash = '#/species/medicham';
    const base = host();
    const info = base.leagueInfo as unknown as () => Promise<{ legal: string[] }>;
    const net = freshNet();
    stubNet(net);
    renderPage(
      host({
        leagueInfo: vi.fn(async () => {
          const i = await info();
          return { ...i, legal: i.legal.filter((x) => x !== 'medicham') };
        }),
      }),
    );
    expect(await screen.findByText('Medicham is not allowed in Great League.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your Medicham' })).toBeInTheDocument();
    expect(editHref()).toBe('#/add?edit=md');
    expect(screen.getByRole('button', { name: 'Remove from collection' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pin/ })).toBeNull();
    expect(yoursRows()).toHaveLength(1);
    // Nothing of the meta, and no read that names it.
    expect(screen.queryByRole('link', { name: 'Build around it' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Moves' })).toBeNull();
    expect(net.api.some((u) => u.pathname.startsWith('/api/v1/species/'))).toBe(false);
  });

  it('says so while your copies are being judged, and never "Not in your collection"', async () => {
    await seed();
    let answer: (v: unknown) => void = () => undefined;
    const speciesView = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    renderManaged({ speciesView });
    expect(await screen.findByText('Loading your Pokémon')).toBeInTheDocument();
    expect(screen.queryByText('Not in your collection')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add one' })).toBeNull();
    answer(await managed()('azumarill', SPECIMENS, {}));
    expect(await screen.findByRole('heading', { name: 'Your Azumarill' })).toBeInTheDocument();
  });
});
