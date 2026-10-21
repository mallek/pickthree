import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDetailV1, EventListRowV1 } from '@pickthree/engine/meta';
import { resetMetaDataForTests } from '../src/metaData.ts';
import { Tournaments } from '../src/screens/Tournaments.tsx';
import { resetMetaHooksForTests } from '../src/state/useMeta.ts';
import { AppProvider } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost, GREAT } from './fakeHost.ts';

// The reads are stubbed: their own tests live with the hooks.
const stub = vi.hoisted(() => ({
  list: { state: 'ready', data: { events: [] as unknown[] } } as {
    state: 'loading' | 'ready' | 'error';
    data: { events: unknown[] } | null;
  },
  details: {} as Record<string, unknown>,
}));
vi.mock('../src/state/useMeta.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/state/useMeta.ts')>();
  return {
    ...real,
    useRecentEvents: () => ({ ...stub.list, retry: () => undefined }),
    useEventDetail: (id: string) => {
      const data = stub.details[id] ?? null;
      return { state: data ? 'ready' : 'loading', data, retry: () => undefined };
    },
  };
});

function row(id: string, name: string, startDate: string, endDate: string, battles: number) {
  const out: EventListRowV1 = {
    id,
    name,
    startDate,
    endDate,
    cup: 'championshipseries',
    battles,
    decided: battles,
    players: 32,
    blended: true,
  };
  return out;
}

function game(n: number, left: string[], right: string[], winnerSide: 'left' | 'right' | null) {
  return {
    game: n,
    at: '2027-10-18T10:00:00Z',
    leftTeam: left,
    rightTeam: right,
    leftForms: [],
    rightForms: [],
    winnerSide,
    resultSource: null,
    scoreAtStart: [0, 0] as [number, number],
    notes: null,
  };
}

/** A grand final Ash wins two games to one; no roster, so his six is what the stream showed. */
function detail(id: string, grand: boolean): EventDetailV1 {
  return {
    event: {
      id,
      name: 'x',
      startDate: '2027-10-17',
      endDate: '2027-10-18',
      league: 'great',
      cup: 'championshipseries',
      vods: [],
      notes: null,
      received: '',
    },
    matches: [
      {
        match: 'm1',
        day: 2,
        stage: 'top_cut',
        group: null,
        roundLabel: 'GRAND FINALS',
        bracket: grand ? 'grand' : 'winners',
        bracketDepth: 1,
        matchFormat: 'bo3',
        left: 'Ash',
        right: 'Gary',
        games: [
          game(
            1,
            ['azumarill', 'clodsire', 'tinkaton'],
            ['medicham', 'lanturn', 'altaria'],
            'left',
          ),
          game(
            2,
            ['azumarill', 'clodsire', 'mimikyu'],
            ['medicham', 'lanturn', 'altaria'],
            'right',
          ),
          game(
            3,
            ['azumarill', 'clodsire', 'tinkaton'],
            ['medicham', 'lanturn', 'altaria'],
            'left',
          ),
        ],
      },
    ],
    roster: [],
    species: [],
  };
}

const NICE = '2027 Nice Pokemon GO Regional Championships';
const OLD = '2027 Old Pokemon GO Regional Championships';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetMetaDataForTests();
  resetMetaHooksForTests();
  stub.list = { state: 'ready', data: { events: [] } };
  stub.details = {};
  window.location.hash = '#/meta/events';
  // A week after the newest fixture event: nothing is ongoing unless a test says so.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2027, 9, 25, 12, 0));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 404 })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderList() {
  return render(
    <AppProvider host={fakeHost()}>
      <Tournaments />
    </AppProvider>,
  );
}

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.event-card'));
}

describe('Tournaments', () => {
  it('one card per event, newest first, with short name, dates and streamed battles', async () => {
    stub.list = {
      state: 'ready',
      data: {
        events: [
          row('old', OLD, '2027-09-01', '2027-09-02', 40),
          row('nice', NICE, '2027-10-17', '2027-10-18', 108),
        ],
      },
    };
    renderList();
    await screen.findByText('Nice Regional');
    const [first, second] = cards();
    expect(cards()).toHaveLength(2);
    expect(first).toHaveTextContent('Nice Regional');
    expect(first).toHaveTextContent('Oct 17-18');
    expect(first).toHaveTextContent('108 streamed battles');
    expect(second).toHaveTextContent('Old Regional');
    expect(second).toHaveTextContent('Sep 1-2');
    expect(second).toHaveTextContent('40 streamed battles');
    expect(first).not.toHaveTextContent('on stream');
    expect(screen.queryByText('Ongoing')).toBeNull();
  });

  it('an event that has not ended yet carries an Ongoing tag; the end date itself counts', async () => {
    stub.list = {
      state: 'ready',
      data: {
        events: [
          row('old', OLD, '2027-10-17', '2027-10-18', 40),
          row('nice', NICE, '2027-10-24', '2027-10-25', 12),
        ],
      },
    };
    renderList();
    await screen.findByText('Nice Regional');
    const [nice, old] = cards();
    expect(within(nice as HTMLElement).getByText('Ongoing')).toHaveClass('ui-tag');
    expect(within(old as HTMLElement).queryByText('Ongoing')).toBeNull();
  });

  it('renders a card before its detail, then the champion and six slots once it loads', async () => {
    stub.list = {
      state: 'ready',
      data: { events: [row('nice', NICE, '2027-10-17', '2027-10-18', 3)] },
    };
    const view = renderList();
    await screen.findByText('Nice Regional');
    expect(screen.queryByText(/Champion/)).toBeNull();
    expect(document.querySelectorAll('.six-slot')).toHaveLength(0);

    stub.details = { nice: detail('nice', true) };
    view.rerender(
      <AppProvider host={fakeHost()}>
        <Tournaments />
      </AppProvider>,
    );
    const card = (await screen.findByText(/Champion/)).closest('.event-card') as HTMLElement;
    expect(card).toHaveTextContent('Champion Ash');
    expect(card.querySelectorAll('.six-slot')).toHaveLength(6);
    // Ash showed four on stream: two slots are never seen.
    expect(within(card).getAllByLabelText('Not seen')).toHaveLength(2);
  });

  it('no Champion line when the event has no champion', async () => {
    stub.list = {
      state: 'ready',
      data: { events: [row('nice', NICE, '2027-10-17', '2027-10-18', 3)] },
    };
    stub.details = { nice: detail('nice', false) };
    renderList();
    await screen.findByText('Nice Regional');
    expect(screen.queryByText(/Champion/)).toBeNull();
    expect(document.querySelectorAll('.six-slot')).toHaveLength(0);
  });

  it('tapping a card opens the event', async () => {
    stub.list = {
      state: 'ready',
      data: { events: [row('2027-nice', NICE, '2027-10-17', '2027-10-18', 3)] },
    };
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: /Nice Regional/ }));
    expect(window.location.hash).toBe('#/meta/events/2027-nice');
  });

  it('says so when there are no recent tournaments', async () => {
    renderList();
    expect(await screen.findByText('No tournaments in the last 55 days')).toBeInTheDocument();
  });

  it('on another league says tournaments are Great League events, not that none are recent', async () => {
    await storage.saveSettings({ ...(await storage.loadSettings()), league: 'ultra' });
    const base = fakeHost();
    const host = fakeHost({
      ready: vi.fn(async () => ({
        ...(await base.ready()),
        leagues: [
          GREAT,
          { ...GREAT, id: 'ultra', title: 'Ultra League', short: 'Ultra', cp: 2500 },
        ],
      })),
    });
    render(
      <AppProvider host={host}>
        <Tournaments />
      </AppProvider>,
    );
    expect(
      await screen.findByText(
        'Tournaments are Great League events. Switch to Great League to see them.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No tournaments in the last/)).toBeNull();
  });

  it('loading and error states', async () => {
    stub.list = { state: 'loading', data: null };
    const view = renderList();
    expect(await screen.findByText(/Loading tournaments/)).toBeInTheDocument();
    view.unmount();
    stub.list = { state: 'error', data: null };
    renderList();
    expect(await screen.findByText('Could not load tournaments.')).toBeInTheDocument();
  });
});
