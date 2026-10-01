import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { resetStickyForTests } from '../src/components.tsx';
import { COUNTER_ORIGIN } from '../src/counter.ts';
import { resetMetaDataForTests } from '../src/metaData.ts';
import { SharedTeam } from '../src/screens/SharedTeam.tsx';
import { TopTeams } from '../src/screens/TopTeams.tsx';
import { EMPTY_SUMMARY, resetMetaHooksForTests } from '../src/state/useMeta.ts';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost, GREAT } from './fakeHost.ts';

// Synthetic league data: PvPoke's group is tinkaton, azumarill, clodsire in that order.
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

const MEASURED = {
  ...EMPTY_SUMMARY,
  league: 'great',
  battles: 400,
  devices: 12,
  species: [
    {
      speciesId: 'clodsire',
      sightings: 400,
      wins: 0,
      losses: 0,
      runs: 0,
      runWins: 0,
      runLosses: 0,
    },
  ],
};

function teamEntry(species: string[], run: [number, number]) {
  return {
    species,
    kind: 'team',
    runBattles: run[0] + run[1],
    runWins: run[0],
    runLosses: run[1],
    facedBattles: 0,
    facedWins: 0,
    facedLosses: 0,
    moves: [null, null, null],
    thirds: [],
  };
}

/** One observed team, run 20 times. */
const TEAMS = {
  league: 'great',
  since: '',
  until: '',
  source: 'all',
  battles: 400,
  devices: 12,
  sources: { ladder: 400 },
  teams: [teamEntry(['azumarill', 'clodsire', 'tinkaton'], [12, 8])],
  cores: [],
  generatedAt: '',
};

const NO_TEAMS = { ...TEAMS, battles: 0, devices: 0, sources: {}, teams: [] };

/** One baked generated team, with a member the observed team does not have. */
const GENERATED = {
  league: 'great',
  source: 'generated',
  pvpokeCommit: 'abc',
  pvpokeDate: '2026-09-10',
  projectionSlope: 1,
  teams: [
    {
      species: ['medicham', 'tinkaton', 'azumarill'],
      strength: 60,
      coverage: 0,
      consistency: 0,
      safety: 0,
      structure: 'ABC',
      exposure: [],
    },
  ],
};

interface Net {
  api: URL[];
  summary: unknown;
  teams: unknown;
  generated: boolean;
  apiStatus: number | null;
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
      if (url.pathname === '/api/v1/meta') {
        return json({ ...(net.summary as object), league: url.searchParams.get('league') });
      }
      if (url.pathname === '/api/v1/teams') {
        return json({ ...(net.teams as object), league: url.searchParams.get('league') });
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
      return json({ banned: [] });
    }
    if (raw === '/data/baseline/great-teams.json' && net.generated) {
      return json(GENERATED);
    }
    // No matchup slice: the board degrades to projectionless and keeps the species order.
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

function freshNet(over: Partial<Net> = {}): Net {
  return { api: [], summary: MEASURED, teams: TEAMS, generated: true, apiStatus: null, ...over };
}

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

/** Top teams, and the team link's landing it hands "Open in Build" to; any other route is named. */
function Screens() {
  const { route } = useAppState();
  if (route.screen === 'meta-teams') {
    return <TopTeams />;
  }
  if (route.screen === 'shared') {
    return <SharedTeam league={route.league} members={route.members} />;
  }
  return <p data-testid="elsewhere">{route.screen}</p>;
}

function renderTop(host = fakeHost()) {
  return render(
    <AppProvider host={host}>
      <Probe />
      <Screens />
    </AppProvider>,
  );
}

/** The rows' titles, in order. */
function titles(): string[] {
  return [...document.querySelectorAll('.row-title')].map((el) => el.textContent ?? '');
}

/** Open the row whose title is exactly this. */
function openRow(title: string): void {
  const head = [...document.querySelectorAll<HTMLButtonElement>('.row-head')].find(
    (h) => h.querySelector('.row-title')?.textContent === title,
  );
  if (!head) {
    throw new Error(`no row ${title}`);
  }
  fireEvent.click(head);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetMetaDataForTests();
  resetMetaHooksForTests();
  resetStickyForTests();
  latest = null;
  window.location.hash = '#/meta/teams';
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

describe('Top teams', () => {
  it("renders the signed board inside pick3's page head", async () => {
    const net = freshNet();
    stubNet(net);
    renderTop();
    expect(await screen.findByText('Top teams')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'League' })).toBeInTheDocument();
    expect(screen.getByLabelText('Window')).toHaveValue('meta');
    expect(screen.getByLabelText('Source')).toHaveValue('all');
    expect(screen.getByRole('option', { name: 'This meta' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PvPoke' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'GBL' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tournaments' })).toBeInTheDocument();

    await waitFor(() => expect(titles()).toHaveLength(2));
    // The observed team leads, the baked one follows marked Projected.
    expect(titles()).toContain('Azumarill, Clodsire, Tinkaton');
    expect(screen.getByText('Run in 20 battles · went 12-8')).toBeInTheDocument();
    expect(screen.getByText('Projected')).toBeInTheDocument();
    const blend = document.querySelector('.tb-blend');
    expect(blend?.textContent).toMatch(/^PvPoke \d+% · GBL \d+% · How it is ranked$/);
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('ranked');

    // The reads carry the league and the window, never a Pokemon.
    expect(net.api.length).toBeGreaterThan(0);
    for (const url of net.api) {
      expect(url.searchParams.get('league')).toBe('great');
      for (const key of url.searchParams.keys()) {
        expect(['league', 'since', 'until', 'source']).toContain(key);
      }
    }
  });

  it('shows no trend, so makes no week-earlier summary read', async () => {
    const net = freshNet();
    stubNet(net);
    renderTop();
    await waitFor(() => expect(titles()).toHaveLength(2));
    const metaReads = net.api.filter((u) => u.pathname === '/api/v1/meta');
    expect(metaReads.length).toBeGreaterThan(0);
    for (const url of metaReads) {
      expect(Date.parse(url.searchParams.get('until') ?? '')).toBe(Date.now());
    }
  });

  it('writes the Window choice into the route without a new history entry', async () => {
    const net = freshNet();
    stubNet(net);
    renderTop();
    await waitFor(() => expect(titles()).toHaveLength(2));
    const depth = window.history.length;
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '7' } });
    await waitFor(() => expect(window.location.hash).toBe('#/meta/teams?w=7'));
    expect(window.history.length).toBe(depth);
    expect(screen.getByLabelText('Window')).toHaveValue('7');
    // A seven day window asks the worker again, from a later start.
    await waitFor(() => {
      const sinces = new Set(
        net.api
          .filter((u) => u.pathname === '/api/v1/teams')
          .map((u) => u.searchParams.get('since')),
      );
      expect(sinces.size).toBe(2);
    });
  });

  it('shows Projected rows only under the PvPoke source', async () => {
    stubNet(freshNet());
    renderTop();
    await waitFor(() => expect(titles()).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'prior' } });
    await waitFor(() => expect(window.location.hash).toBe('#/meta/teams?src=prior'));
    await waitFor(() => expect(titles()).toHaveLength(1));
    expect(titles()).not.toContain('Azumarill, Clodsire, Tinkaton');
    expect(screen.getByText('Projected')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('.tb-blend')?.textContent).toBe(
        'PvPoke 100% · How it is ranked',
      ),
    );
  });

  it('reads the Window and Source from a link', async () => {
    window.location.hash = '#/meta/teams?w=30&src=ladder';
    const net = freshNet();
    stubNet(net);
    renderTop();
    await waitFor(() => expect(titles().length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Window')).toHaveValue('30');
    expect(screen.getByLabelText('Source')).toHaveValue('ladder');
    expect(
      net.api.some(
        (u) => u.pathname === '/api/v1/teams' && u.searchParams.get('source') === 'ladder',
      ),
    ).toBe(true);
  });

  it('Run this team opens Pick your team with the three filled in', async () => {
    stubNet(freshNet());
    renderTop();
    await waitFor(() => expect(titles()).toContain('Azumarill, Clodsire, Tinkaton'));
    openRow('Azumarill, Clodsire, Tinkaton');
    fireEvent.click(screen.getByRole('button', { name: /Run this team/ }));
    await waitFor(() =>
      expect(window.location.hash).toBe('#/meta/new?team=azumarill+clodsire+tinkaton'),
    );
    await waitFor(() =>
      expect(latest?.route).toEqual({
        screen: 'meta-new',
        team: ['azumarill', 'clodsire', 'tinkaton'],
      }),
    );
  });

  it('Open in Build fills Build with the team and lands on the analysis', async () => {
    stubNet(freshNet());
    const analyze = vi.fn(async () => ({}) as never);
    renderTop(fakeHost({ analyze }));
    await waitFor(() => expect(titles()).toContain('Azumarill, Clodsire, Tinkaton'));
    openRow('Azumarill, Clodsire, Tinkaton');
    fireEvent.click(screen.getByRole('button', { name: /Open in Build/ }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    const picks = (analyze.mock.calls[0] as unknown[])[0];
    expect(picks).toEqual([
      { kind: 'species', id: 'azumarill', preferOwned: true },
      { kind: 'species', id: 'clodsire', preferOwned: true },
      { kind: 'species', id: 'tinkaton', preferOwned: true },
    ]);
    // The analysis is Build's team page, and the link's landing leaves no entry behind.
    await waitFor(() => expect(latest?.route).toEqual({ screen: 'custom' }));
    expect(window.location.hash).toBe('#/build/team');
  });

  it('switches to the league a link names, once, then lets go of it', async () => {
    const ULTRA = { ...GREAT, id: 'ultra', title: 'Ultra League', short: 'Ultra', cp: 2500 };
    const base = fakeHost();
    const ready = base.ready as unknown as () => Promise<Record<string, unknown>>;
    const info = base.leagueInfo as unknown as (l: string) => Promise<Record<string, unknown>>;
    const host = fakeHost({
      ready: vi.fn(async () => ({ ...(await ready()), leagues: [GREAT, ULTRA] })),
      leagueInfo: vi.fn(async (league: string) => ({ ...(await info(league)), id: league })),
    });
    window.location.hash = '#/meta/teams?l=ultra';
    const net = freshNet();
    stubNet(net);
    renderTop(host);
    await waitFor(() => expect(latest?.settings.league).toBe('ultra'));
    await waitFor(() => expect(latest?.route).toEqual({ screen: 'meta-teams' }));
    await waitFor(() => expect(titles().length).toBeGreaterThan(0));
    const teamsReads = net.api.filter((u) => u.pathname === '/api/v1/teams');
    expect(teamsReads.length).toBeGreaterThan(0);
    expect(teamsReads.every((u) => u.searchParams.get('league') === 'ultra')).toBe(true);
  });

  it('says so when the board fails, and Try again asks again', async () => {
    const net = freshNet({ apiStatus: 503 });
    stubNet(net);
    renderTop();
    expect(await screen.findByText('Could not load the team board.')).toBeInTheDocument();
    // The controls stay, so a reader can still change what they asked for.
    expect(screen.getByLabelText('Window')).toBeInTheDocument();
    net.apiStatus = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(titles()).toHaveLength(2));
    expect(screen.queryByText('Could not load the team board.')).toBeNull();
  });

  it('an empty board asks the reader to log, inside pick3', async () => {
    stubNet(freshNet({ summary: EMPTY_SUMMARY, teams: NO_TEAMS, generated: false }));
    renderTop();
    expect(
      await screen.findByText(
        'No teams shared in this window yet, and no projections could be loaded.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Help fill this in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log a battle' })).toHaveAttribute(
      'href',
      '#/meta/new',
    );
  });

  it('the app routes #/meta/teams to Top teams under the Meta tab', async () => {
    stubNet(freshNet());
    // Each screen opens at the top; jsdom has no scrolling to do it with.
    vi.stubGlobal('scrollTo', vi.fn());
    render(
      <AppProvider host={fakeHost()}>
        <App />
      </AppProvider>,
    );
    expect(await screen.findByText('Top teams')).toBeInTheDocument();
    await waitFor(() => expect(titles()).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Meta' })).toHaveClass('on');
  });
});
