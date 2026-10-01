import 'fake-indexeddb/auto';
import type { BattleSet, LoggedBattle } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStickyForTests } from '../src/components.tsx';
import { COUNTER_ORIGIN } from '../src/counter.ts';
import { resetMetaDataForTests } from '../src/metaData.ts';
import { MetaHome } from '../src/screens/MetaHome.tsx';
import { EMPTY_SUMMARY, resetMetaHooksForTests } from '../src/state/useMeta.ts';
import { AppProvider } from '../src/state/store.tsx';
import { DEFAULT_SETTINGS, resetDbForTests, storage, type Settings } from '../src/storage/db.ts';
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

/** Clodsire in every battle, azumarill in a quarter: measured play carries most of the say. */
const MEASURED = {
  ...EMPTY_SUMMARY,
  league: 'great',
  battles: 3000,
  devices: 500,
  species: [
    {
      speciesId: 'clodsire',
      sightings: 3000,
      wins: 0,
      losses: 0,
      runs: 0,
      runWins: 0,
      runLosses: 0,
    },
    {
      speciesId: 'azumarill',
      sightings: 750,
      wins: 0,
      losses: 0,
      runs: 0,
      runWins: 0,
      runLosses: 0,
    },
  ],
};

function teamEntry(species: string[], run: [number, number], faced: [number, number] = [0, 0]) {
  return {
    species,
    kind: 'team',
    runBattles: run[0] + run[1],
    runWins: run[0],
    runLosses: run[1],
    facedBattles: faced[0] + faced[1],
    facedWins: faced[0],
    facedLosses: faced[1],
    moves: [null, null, null],
    thirds: [],
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
  teams: [teamEntry(['azumarill', 'clodsire', 'tinkaton'], [12, 8], [2, 3])],
  cores: [],
  generatedAt: '',
};

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
        return json(net.summary);
      }
      if (url.pathname === '/api/v1/teams') {
        return json(net.teams);
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
    if (raw === '/data/baseline/great-teams.json') {
      return json(GENERATED);
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

function freshNet(): Net {
  return { api: [], summary: MEASURED, teams: TEAMS, apiStatus: null };
}

function battle(id: string, minute: number, over: Partial<LoggedBattle> = {}): LoggedBattle {
  return {
    id,
    at: `2026-09-15T10:${String(minute).padStart(2, '0')}:00Z`,
    opponents: ['medicham'],
    result: 'win',
    tanked: false,
    ...over,
  };
}

function openSet(battles: LoggedBattle[], over: Partial<BattleSet> = {}): BattleSet {
  return {
    id: 's1',
    league: 'great',
    startedAt: '2026-09-15T10:00:00Z',
    team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
    battles,
    closed: false,
    ...over,
  };
}

/** Two wins, a loss and a tanked game: the record is 2-1. Medicham faced 3, azumarill 1. */
const MIXED: LoggedBattle[] = [
  battle('b1', 5, { opponents: ['medicham', 'dragonite_shadow'] }),
  battle('b2', 10, { result: 'loss' }),
  battle('b3', 15, { opponents: [], result: null, tanked: true }),
  battle('b4', 20, { opponents: ['azumarill', 'medicham'] }),
];

async function withSettings(patch: Partial<Settings>): Promise<void> {
  await storage.saveSettings({ ...DEFAULT_SETTINGS, ...patch });
}

function renderHome(host = fakeHost()) {
  return render(
    <AppProvider host={host}>
      <MetaHome />
    </AppProvider>,
  );
}

/** A card on the page, by its heading. */
function card(title: string): HTMLElement {
  const head = screen.getByText(title, { selector: 'b' });
  const el = head.closest('.mh-card');
  if (!(el instanceof HTMLElement)) {
    throw new Error(`no card for ${title}`);
  }
  return el;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetMetaDataForTests();
  resetMetaHooksForTests();
  resetStickyForTests();
  window.location.hash = '#/meta';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T20:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Meta landing', () => {
  it('first visit: community first, then Help build the meta and an empty Your meta', async () => {
    stubNet(freshNet());
    const { container } = renderHome();
    expect(await screen.findByRole('heading', { name: 'Meta' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'What trainers are facing' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A community snapshot, built from shared battle logs.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();

    // Most seen: blended order, clodsire first, a pink share with its mark, a species link.
    const seen = await waitFor(() => {
      const c = card('Most seen Pokémon');
      expect(c.querySelectorAll('a.mh-seen')).toHaveLength(3);
      return c;
    });
    expect(within(seen).getByText('Share of reported battles')).toBeInTheDocument();
    expect(within(seen).queryByText(/No battles shared yet/)).toBeNull();
    const rows = [...seen.querySelectorAll('a.mh-seen')];
    expect(rows[0]).toHaveAttribute('href', '#/species/clodsire');
    expect(rows[0]).toHaveTextContent('Clodsire');
    expect(rows[0]).toHaveTextContent('100%');
    expect(rows[0]?.querySelector('.ui-measured-num')).not.toBeNull();
    expect(rows[0]?.querySelector('.mh-bar > span')).toHaveStyle({ width: '100%' });
    expect(rows[1]).toHaveAttribute('href', '#/species/azumarill');
    expect(rows[1]).toHaveTextContent('25%');
    expect(within(seen).getByRole('link', { name: /Explore Pokémon/ })).toHaveAttribute(
      'href',
      '#/collection',
    );

    // Most logged teams: the observed team with its run record, then a projected one.
    const teams = await waitFor(() => {
      const c = card('Most logged teams');
      expect(c.querySelectorAll('.team-row')).toHaveLength(2);
      return c;
    });
    const [observed, projected] = [...teams.querySelectorAll('.team-row')];
    expect(observed).toHaveTextContent('20 battles');
    expect(observed).toHaveTextContent('12-8');
    expect(projected).toHaveTextContent('Projected');
    expect(projected).not.toHaveTextContent('battles');
    expect(
      within(teams).getByText('Results from trainers logging their own teams.'),
    ).toBeInTheDocument();
    expect(within(teams).queryByText(/until players log teams/)).toBeNull();
    expect(within(teams).getByRole('link', { name: /Explore teams/ })).toHaveAttribute(
      'href',
      '#/meta/teams',
    );

    const help = card('Help build the meta');
    expect(help).toHaveClass('mh-accent');
    expect(
      within(help).getByText(
        'Log your team, opponents and result to add to the community picture.',
      ),
    ).toBeInTheDocument();
    expect(within(help).getByRole('switch', { name: 'Share battles anonymously' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(help).getByText('No collection import needed.')).toBeInTheDocument();

    const mine = card('Your meta');
    expect(within(mine).getByText('Your battle history will appear here.')).toBeInTheDocument();
    expect(screen.queryByText('Your contribution')).toBeNull();
    expect(screen.getByText('Community data reflects shared logs.')).toBeInTheDocument();
    // No window pill and no link to the retired site.
    expect(screen.queryByText(/This meta/)).toBeNull();
    expect(container.innerHTML).not.toContain('meta.pick3.gg');

    // Help build the meta's order on the page: after the teams, before Your meta.
    const cards = [...container.querySelectorAll('.mh-card')].map(
      (c) => c.querySelector('b')?.textContent,
    );
    expect(cards).toEqual([
      'Most seen Pokémon',
      'Most logged teams',
      'Help build the meta',
      'Your meta',
    ]);

    fireEvent.click(within(help).getByRole('button', { name: 'Log a battle' }));
    await waitFor(() => expect(window.location.hash).toBe('#/meta/new'));
  });

  it('reads the community for the league and the default window only', async () => {
    const net = freshNet();
    stubNet(net);
    renderHome();
    await waitFor(() => expect(net.api.map((u) => u.pathname)).toContain('/api/v1/teams'));
    for (const u of net.api) {
      expect(u.searchParams.get('league')).toBe('great');
      // The default window is the current season: fakeHost's one season started 2026-09-08.
      expect(u.searchParams.get('since')).toBe('2026-09-08T20:00:00.000Z');
    }
  });

  it('with a log: your contribution, your meta, then the teams without the caption', async () => {
    stubNet(freshNet());
    await storage.saveSet(openSet(MIXED));
    const { container } = renderHome();
    const mine = await waitFor(() => card('Your contribution'));
    expect(mine).toHaveClass('mh-accent');
    expect(
      within(mine).getByRole('switch', { name: 'Share battles anonymously' }),
    ).toBeInTheDocument();
    expect(within(mine).getByText('Current team')).toBeInTheDocument();
    expect(within(mine).getByText('2-1')).toBeInTheDocument();
    for (const name of ['Tinkaton', 'Azumarill', 'Clodsire']) {
      expect(within(mine).getByText(name)).toBeInTheDocument();
    }
    expect(within(mine).getByRole('button', { name: 'Change team' })).toBeInTheDocument();
    expect(within(mine).getByRole('button', { name: 'Share team' })).toBeInTheDocument();
    // Icons beside the card title, not text buttons under Log a battle.
    for (const label of ['Change team', 'Share team']) {
      const icon = within(mine).getByRole('button', { name: label });
      expect(icon.closest('.mh-card-head')).not.toBeNull();
    }

    const meta = card('Your meta');
    expect(within(meta).getByText('3 battles this season')).toBeInTheDocument();
    expect(within(meta).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    expect(within(meta).getByRole('button', { name: 'Most faced' })).toBeInTheDocument();
    expect(within(meta).getByRole('button', { name: 'Worst record' })).toBeInTheDocument();
    const faced = meta.querySelectorAll('.faced-row');
    expect(faced).toHaveLength(2);
    expect(faced[0]).toHaveAttribute('href', '#/species/medicham');
    expect(within(meta).getByRole('link', { name: /View your battle history/ })).toHaveAttribute(
      'href',
      '#/meta/battles',
    );

    const teams = await waitFor(() => {
      const c = card('Most logged teams');
      expect(c.querySelectorAll('.team-row')).toHaveLength(2);
      return c;
    });
    expect(within(teams).queryByText('Results from trainers logging their own teams.')).toBeNull();
    expect(screen.queryByText('Help build the meta')).toBeNull();
    expect(screen.queryByText('Your battle history will appear here.')).toBeNull();

    const cards = [...container.querySelectorAll('.mh-card')].map(
      (c) => c.querySelector('b')?.textContent,
    );
    expect(cards).toEqual([
      'Most seen Pokémon',
      'Your contribution',
      'Your meta',
      'Most logged teams',
    ]);

    fireEvent.click(within(mine).getByRole('button', { name: 'Log a battle' }));
    await waitFor(() => expect(window.location.hash).toBe('#/meta/log'));
  });

  it('a species nobody reported shows no share, only its bar and chevron', async () => {
    stubNet(freshNet());
    renderHome();
    const seen = await waitFor(() => {
      const c = card('Most seen Pokémon');
      expect(c.querySelectorAll('a.mh-seen')).toHaveLength(3);
      return c;
    });
    // Tinkaton is in PvPoke's group but no shared battle saw it: no pink 0%.
    const tinkaton = seen.querySelector('a.mh-seen[href="#/species/tinkaton"]');
    expect(tinkaton).not.toBeNull();
    expect(tinkaton?.querySelector('.ui-measured-num')).toBeNull();
    expect(tinkaton).not.toHaveTextContent('%');
    expect(tinkaton?.querySelector('.mh-bar')).not.toBeNull();
    expect(tinkaton?.querySelector('.mh-go')).not.toBeNull();
    // The sighted rows keep theirs.
    expect(seen.querySelectorAll('.ui-measured-num')).toHaveLength(2);
  });

  it('the current team shows its results; a result opens that battle to fix it', async () => {
    stubNet(freshNet());
    await storage.saveSet(openSet(MIXED));
    renderHome();
    const mine = await waitFor(() => card('Your contribution'));
    const strip = await within(mine).findByRole('group', { name: 'Recent results' });
    expect(within(strip).getAllByRole('button')).toHaveLength(4);
    expect(within(mine).getByText('Tap a result to fix it')).toBeInTheDocument();
    fireEvent.click(within(strip).getByRole('button', { name: 'Loss against Medicham' }));
    await waitFor(() => expect(window.location.hash).toBe('#/meta/log/s1/b2'));
  });

  it('with sets only in another league: the contribution card offers Pick your team', async () => {
    stubNet(freshNet());
    await storage.saveSet(openSet(MIXED, { league: 'ultra' }));
    renderHome();
    const mine = await waitFor(() => card('Your contribution'));
    expect(within(mine).getByText('No team picked')).toBeInTheDocument();
    expect(within(mine).queryByRole('button', { name: 'Log a battle' })).toBeNull();
    fireEvent.click(within(mine).getByRole('button', { name: 'Pick your team' }));
    await waitFor(() => expect(window.location.hash).toBe('#/meta/new'));
  });

  it('a worker failure: both community cards say so and retry; the personal cards stay', async () => {
    const net = freshNet();
    net.apiStatus = 503;
    stubNet(net);
    renderHome();
    await waitFor(() =>
      expect(screen.getAllByText('Could not load the community meta.')).toHaveLength(2),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Log a battle' })).toBeInTheDocument();
    expect(screen.getByText('Your battle history will appear here.')).toBeInTheDocument();

    net.apiStatus = null;
    for (const b of screen.getAllByRole('button', { name: 'Try again' })) {
      fireEvent.click(b);
    }
    await waitFor(() =>
      expect(screen.queryByText('Could not load the community meta.')).toBeNull(),
    );
    await waitFor(() =>
      expect(card('Most seen Pokémon').querySelectorAll('a.mh-seen')).toHaveLength(3),
    );
  });

  it('a league with no shared battles: PvPoke order, no share and no pink', async () => {
    const net = freshNet();
    net.summary = { ...EMPTY_SUMMARY, league: 'great' };
    net.teams = { ...TEAMS, battles: 0, teams: [] };
    stubNet(net);
    renderHome();
    const seen = await waitFor(() => {
      const c = card('Most seen Pokémon');
      expect(c.querySelectorAll('a.mh-seen')).toHaveLength(3);
      return c;
    });
    const rows = [...seen.querySelectorAll('a.mh-seen')];
    expect(rows.map((r) => r.getAttribute('href'))).toEqual([
      '#/species/tinkaton',
      '#/species/azumarill',
      '#/species/clodsire',
    ]);
    expect(seen.querySelector('.ui-measured-num')).toBeNull();
    expect(seen).not.toHaveTextContent('%');
    // PvPoke's order is not a measured share: the subtitle says so.
    expect(
      within(seen).getByText("PvPoke's meta group. No battles shared yet."),
    ).toBeInTheDocument();
    expect(within(seen).queryByText('Share of reported battles')).toBeNull();
    // The teams card falls back to the generated baseline, marked Projected.
    const teams = await waitFor(() => {
      const c = card('Most logged teams');
      expect(c.querySelectorAll('.team-row')).toHaveLength(1);
      return c;
    });
    expect(teams).toHaveTextContent('Projected');
  });

  it('first visit with only projected teams: the caption says projected, not logged', async () => {
    const net = freshNet();
    net.teams = { ...TEAMS, battles: 0, teams: [] };
    stubNet(net);
    renderHome();
    const teams = await waitFor(() => {
      const c = card('Most logged teams');
      expect(c.querySelectorAll('.team-row')).toHaveLength(1);
      return c;
    });
    // Every row shown is projected, so the caption never speaks of logged results.
    expect(
      within(teams).getByText("Projected from PvPoke's meta group until players log teams."),
    ).toBeInTheDocument();
    expect(within(teams).queryByText('Results from trainers logging their own teams.')).toBeNull();
    // Shares are still measured here, so Most seen keeps its subtitle.
    expect(
      within(card('Most seen Pokémon')).getByText('Share of reported battles'),
    ).toBeInTheDocument();
  });

  it('reads a hyphenated league by its own id', async () => {
    const net = freshNet();
    stubNet(net);
    // A standard league with a hyphen in its id (a rotation cup with no live run would be sent
    // back to Great League on boot, which is not what this test is about).
    const megaGreat = {
      ...GREAT,
      id: 'mega-great',
      title: 'Great League: Mega Edition',
      short: 'Mega Great',
    };
    const base = fakeHost();
    const host = fakeHost({
      ready: vi.fn(async () => {
        const r = await (base.ready as unknown as () => Promise<object>)();
        return { ...r, leagues: [GREAT, megaGreat] };
      }),
    });
    await withSettings({ league: 'mega-great' });
    renderHome(host);
    await waitFor(() => expect(net.api.length).toBeGreaterThan(0));
    await waitFor(() => expect(net.api.map((u) => u.pathname)).toContain('/api/v1/teams'));
    for (const u of net.api) {
      expect(u.searchParams.get('league')).toBe('mega-great');
    }
  });

  it('the share switch is the Settings switch: off goes through the same confirm', async () => {
    stubNet(freshNet());
    renderHome();
    const help = await waitFor(() => card('Help build the meta'));
    const sw = within(help).getByRole('switch', { name: 'Share battles anonymously' });
    fireEvent.click(sw);
    expect(await screen.findByText('Stop sharing?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop and delete' }));
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
  });
});
