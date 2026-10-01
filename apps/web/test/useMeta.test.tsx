import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board, SourceKey, SpeciesDetailV1, WindowKey } from '@pickthree/engine/meta';
import { COUNTER_ORIGIN } from '../src/counter.ts';
import { resetMetaDataForTests } from '../src/metaData.ts';
import {
  EMPTY_SUMMARY,
  resetMetaHooksForTests,
  useMetaRanking,
  useSpeciesDetail,
  useTopTeams,
  type Loaded,
  type MetaRanking,
} from '../src/state/useMeta.ts';
import { AppProvider } from '../src/state/store.tsx';
import { fakeHost } from './fakeHost.ts';
import { resetDbForTests } from '../src/storage/db.ts';

// Synthetic league: PvPoke ranks tinkaton, azumarill, clodsire in that order, so the PvPoke-only
// order is the same three in that order.
const GROUP = [
  { speciesId: 'tinkaton', fastMove: 'FAIRY_WIND', chargedMoves: ['GIGATON_HAMMER'] },
  { speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM'] },
  { speciesId: 'clodsire', fastMove: 'POISON_STING', chargedMoves: ['EARTHQUAKE'] },
];
const OVERALL = [
  { speciesId: 'tinkaton', score: 95 },
  { speciesId: 'azumarill', score: 92 },
  { speciesId: 'clodsire', score: 90 },
];
const MATRIX = {
  league: 'great',
  cp: 1500,
  scenarios: [
    { shields: [1, 1], energy: [0, 0] },
    { shields: [0, 0], energy: [0, 0] },
    { shields: [2, 2], energy: [0, 0] },
  ],
  candidates: ['tinkaton', 'azumarill', 'clodsire'],
  opponents: ['tinkaton', 'azumarill', 'clodsire'],
  candidateMovesets: {},
  opponentMovesets: {},
  // 3 candidates x 3 opponents x 3 scenarios, a rock-paper-scissors of 600s and 400s.
  ratings: [500, 600, 400, 400, 500, 600, 600, 400, 500].flatMap((r) => [r, r, r]),
};

/** A measured window where one species was faced in every battle, with enough battles and
 *  devices that measured play carries most of the say. */
function summary(heavy: string) {
  return {
    ...EMPTY_SUMMARY,
    league: 'great',
    battles: 3000,
    devices: 500,
    species: [
      {
        speciesId: heavy,
        sightings: 3000,
        wins: 0,
        losses: 0,
        runs: 0,
        runWins: 0,
        runLosses: 0,
      },
    ],
  };
}

const TEAMS = {
  league: 'great',
  since: '',
  until: '',
  source: 'all',
  battles: 40,
  devices: 6,
  sources: {},
  teams: [
    {
      species: ['azumarill', 'clodsire', 'tinkaton'],
      kind: 'team',
      runBattles: 20,
      runWins: 12,
      runLosses: 8,
      facedBattles: 5,
      facedWins: 2,
      facedLosses: 3,
      moves: [null, null, null],
      thirds: [],
    },
  ],
  cores: [],
  generatedAt: '',
};

const DETAIL: SpeciesDetailV1 = {
  league: 'great',
  speciesId: 'azumarill',
  since: '',
  until: '',
  source: 'all',
  sightings: 3,
  wins: 1,
  losses: 2,
  runs: 0,
  runWins: 0,
  runLosses: 0,
  weekly: [],
  bands: [],
  alongside: [],
  movesets: [],
  tournament: null,
  generatedAt: '',
};

interface Net {
  /** Every /api/v1 request, as a URL. */
  api: URL[];
  /** Answer the current window's summary with this, the earlier one with `earlier`. */
  current: unknown;
  earlier: unknown;
  /** A status the worker answers every /api/v1 read with instead. */
  apiStatus: number | null;
  /** A status the worker answers only the week-earlier summary read with. */
  earlierStatus?: number;
}

function stubNet(net: Net) {
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const raw = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (raw.startsWith(COUNTER_ORIGIN)) {
      const url = new URL(raw);
      net.api.push(url);
      if (net.apiStatus !== null) {
        return new Response('{}', { status: net.apiStatus });
      }
      if (url.pathname === '/api/v1/meta') {
        // The earlier window ends a week sooner; the current one ends at "now".
        const until = Date.parse(url.searchParams.get('until') ?? '');
        if (until > Date.now() - 86_400_000) {
          return json(net.current);
        }
        if (net.earlierStatus !== undefined) {
          return new Response('{}', { status: net.earlierStatus });
        }
        return json(net.earlier);
      }
      if (url.pathname === '/api/v1/teams') {
        return json(TEAMS);
      }
      if (url.pathname.startsWith('/api/v1/species/')) {
        return json(DETAIL);
      }
      return new Response('{}', { status: 404 });
    }
    if (raw === '/data/meta/great.json') {
      return json(GROUP);
    }
    if (raw === '/data/rankings/great/overall.json') {
      return json(OVERALL);
    }
    if (raw === '/data/legal/great.json') {
      return json({ banned: [] });
    }
    if (raw === '/data/matrix/great.json') {
      return json(MATRIX);
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

function freshNet(): Net {
  return {
    api: [],
    current: summary('clodsire'),
    earlier: summary('azumarill'),
    apiStatus: null,
  };
}

let ranking: Loaded<MetaRanking> | null = null;
let board: Loaded<Board> | null = null;
let detail: Loaded<SpeciesDetailV1> | null = null;

/** Forget what the probes saw, so a waitFor sees only what the next mount reports. */
function forget() {
  ranking = null;
  board = null;
  detail = null;
}

function RankingProbe(props: {
  window: WindowKey;
  source: SourceKey;
  community: boolean;
  trend?: boolean;
}) {
  ranking = useMetaRanking('great', props);
  return null;
}

function BoardProbe(props: { window: WindowKey; source: SourceKey }) {
  board = useTopTeams('great', props);
  return null;
}

function DetailProbe(props: { id: string; window: WindowKey; source: SourceKey }) {
  detail = useSpeciesDetail('great', props.id, props.window, props.source);
  return null;
}

function mount(node: React.ReactNode) {
  return render(<AppProvider host={fakeHost()}>{node}</AppProvider>);
}

/** fakeHost's one season starts 2026-09-08T20:00Z; "This meta" runs from there to now. */
function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetMetaDataForTests();
  resetMetaHooksForTests();
  forget();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useMetaRanking', () => {
  it('ranks by PvPoke alone and reads nothing from the worker with community off', async () => {
    at('2026-09-28T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    mount(<RankingProbe window="meta" source="all" community={false} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    expect(ranking?.data?.order).toEqual(['tinkaton', 'azumarill', 'clodsire']);
    expect(ranking?.data?.ranking.say).toBe(0);
    expect(ranking?.data?.trend.size).toBe(0);
    expect(ranking?.data?.offline).toBe(false);
    expect(net.api).toHaveLength(0);
  });

  it('makes one summary read under a week into the window and trends against PvPoke', async () => {
    at('2026-09-11T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    mount(<RankingProbe window="meta" source="all" community={true} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    expect(net.api.map((u) => u.pathname)).toEqual(['/api/v1/meta']);
    expect(net.api[0]?.searchParams.get('league')).toBe('great');
    expect(net.api[0]?.searchParams.get('since')).toBe('2026-09-08T20:00:00.000Z');
    expect(ranking?.data?.order).toEqual(['clodsire', 'tinkaton', 'azumarill']);
    // Against PvPoke's tinkaton, azumarill, clodsire.
    expect(ranking?.data?.trend.get('clodsire')).toBe(2);
    expect(ranking?.data?.trend.get('tinkaton')).toBe(-1);
    expect(ranking?.data?.trend.get('azumarill')).toBe(-1);
    expect(ranking?.data?.offline).toBe(false);
    expect(ranking?.data?.window.key).toBe('meta');
  });

  it('makes two summary reads past a week and trends against the earlier blend', async () => {
    at('2026-09-28T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    mount(<RankingProbe window="meta" source="all" community={true} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    expect(net.api.map((u) => u.pathname)).toEqual(['/api/v1/meta', '/api/v1/meta']);
    const untils = net.api.map((u) => Date.parse(u.searchParams.get('until') ?? '')).sort();
    expect((untils[1] ?? 0) - (untils[0] ?? 0)).toBe(7 * 86_400_000);
    // Earlier blend: azumarill, tinkaton, clodsire. Now: clodsire, tinkaton, azumarill.
    expect(ranking?.data?.order).toEqual(['clodsire', 'tinkaton', 'azumarill']);
    expect(ranking?.data?.trend.get('clodsire')).toBe(2);
    expect(ranking?.data?.trend.get('tinkaton')).toBe(0);
    expect(ranking?.data?.trend.get('azumarill')).toBe(-2);
  });

  it('falls back to PvPoke, ready and offline, when the worker answers 503', async () => {
    at('2026-09-28T20:00:00Z');
    const net = freshNet();
    net.apiStatus = 503;
    stubNet(net);
    mount(<RankingProbe window="meta" source="all" community={true} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    expect(ranking?.data?.offline).toBe(true);
    expect(ranking?.data?.trend.size).toBe(0);
    expect(ranking?.data?.order).toEqual(['tinkaton', 'azumarill', 'clodsire']);
  });

  it('keeps the current blend, with no trend and not offline, when only the week-earlier read fails', async () => {
    at('2026-09-28T20:00:00Z');
    const net = freshNet();
    net.earlierStatus = 503;
    stubNet(net);
    mount(<RankingProbe window="meta" source="all" community={true} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    expect(net.api.map((u) => u.pathname)).toEqual(['/api/v1/meta', '/api/v1/meta']);
    expect(ranking?.data?.order).toEqual(['clodsire', 'tinkaton', 'azumarill']);
    expect(ranking?.data?.ranking.battles).toBe(3000);
    expect(ranking?.data?.trend.size).toBe(0);
    expect(ranking?.data?.offline).toBe(false);
  });

  it('makes no week-earlier read when the caller shows no trend', async () => {
    at('2026-09-28T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    mount(<RankingProbe window="meta" source="all" community={true} trend={false} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    expect(net.api.map((u) => u.pathname)).toEqual(['/api/v1/meta']);
    expect(Date.parse(net.api[0]?.searchParams.get('until') ?? '')).toBe(Date.now());
    expect(ranking?.data?.order).toEqual(['clodsire', 'tinkaton', 'azumarill']);
    expect(ranking?.data?.trend.size).toBe(0);
    expect(ranking?.data?.offline).toBe(false);
  });

  it('makes no community read at all under the PvPoke source, and has no trend', async () => {
    at('2026-09-28T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    mount(<RankingProbe window="meta" source="prior" community={true} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    expect(net.api).toHaveLength(0);
    expect(ranking?.data?.ranking.source).toBe('prior');
    expect(ranking?.data?.order).toEqual(['tinkaton', 'azumarill', 'clodsire']);
    expect(ranking?.data?.trend.size).toBe(0);
    expect(ranking?.data?.offline).toBe(false);
  });

  it('keeps the reads for the session: a remount does not refetch', async () => {
    at('2026-09-28T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    const first = mount(<RankingProbe window="meta" source="all" community={true} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    first.rerender(
      <AppProvider host={fakeHost()}>
        <RankingProbe window="meta" source="all" community={true} />
      </AppProvider>,
    );
    first.unmount();
    forget();
    mount(<RankingProbe window="meta" source="all" community={true} />);
    await waitFor(() => expect(ranking?.state).toBe('ready'));
    expect(net.api).toHaveLength(2);
  });

  it('retries after a failure: the failed read is forgotten', async () => {
    at('2026-09-11T20:00:00Z');
    const net = freshNet();
    net.apiStatus = 503;
    stubNet(net);
    mount(<RankingProbe window="meta" source="all" community={true} />);
    await waitFor(() => expect(ranking?.data?.offline).toBe(true));
    net.apiStatus = null;
    ranking?.retry();
    await waitFor(() => expect(ranking?.data?.offline).toBe(false));
    expect(net.api).toHaveLength(2);
    expect(ranking?.data?.order[0]).toBe('clodsire');
  });
});

describe('useTopTeams', () => {
  it('builds the board from the summary, the team board and the slice', async () => {
    at('2026-09-11T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    mount(<BoardProbe window="meta" source="all" />);
    await waitFor(() => expect(board?.state).toBe('ready'));
    expect(net.api.map((u) => u.pathname).sort()).toEqual(['/api/v1/meta', '/api/v1/teams']);
    const observed = board?.data?.rows.filter((r) => r.source === 'observed') ?? [];
    expect(observed.map((r) => r.species)).toEqual([['azumarill', 'clodsire', 'tinkaton']]);
    expect(board?.data?.projectionless).toBe(false);
  });

  it('empties observed teams and cores under PvPoke without its own request', async () => {
    at('2026-09-11T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    const view = mount(<BoardProbe window="meta" source="all" />);
    await waitFor(() => expect(board?.state).toBe('ready'));
    forget();
    view.rerender(
      <AppProvider host={fakeHost()}>
        <BoardProbe window="meta" source="prior" />
      </AppProvider>,
    );
    await waitFor(() => expect(board?.state).toBe('ready'));
    expect(board?.data?.rows.filter((r) => r.source === 'observed')).toEqual([]);
    expect(net.api).toHaveLength(2);
  });

  it('is an error the page can retry when the worker is down', async () => {
    at('2026-09-11T20:00:00Z');
    const net = freshNet();
    net.apiStatus = 503;
    stubNet(net);
    mount(<BoardProbe window="meta" source="all" />);
    await waitFor(() => expect(board?.state).toBe('error'));
    net.apiStatus = null;
    board?.retry();
    await waitFor(() => expect(board?.state).toBe('ready'));
  });
});

describe('useSpeciesDetail', () => {
  it('reads the species route for the league, window and source, once per session', async () => {
    at('2026-09-11T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    const first = mount(<DetailProbe id="azumarill" window="7" source="ladder" />);
    await waitFor(() => expect(detail?.state).toBe('ready'));
    expect(detail?.data?.speciesId).toBe('azumarill');
    expect(net.api).toHaveLength(1);
    expect(net.api[0]?.pathname).toBe('/api/v1/species/azumarill');
    expect(net.api[0]?.searchParams.get('league')).toBe('great');
    expect(net.api[0]?.searchParams.get('source')).toBe('ladder');
    first.unmount();
    forget();
    mount(<DetailProbe id="azumarill" window="7" source="ladder" />);
    await waitFor(() => expect(detail?.state).toBe('ready'));
    expect(net.api).toHaveLength(1);
  });

  it('settles with no data and no read for an empty id', async () => {
    at('2026-09-11T20:00:00Z');
    const net = freshNet();
    stubNet(net);
    mount(<DetailProbe id="" window="meta" source="all" />);
    await waitFor(() => expect(detail?.state).toBe('ready'));
    expect(detail?.data).toBeNull();
    expect(net.api).toHaveLength(0);
  });
});
