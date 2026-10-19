import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDetailV1, EventGameV1, EventMatchV1 } from '@pickthree/engine/meta';
import { resetMetaDataForTests } from '../src/metaData.ts';
import { EventPage } from '../src/screens/EventPage.tsx';
import { resetMetaHooksForTests } from '../src/state/useMeta.ts';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

// The read is stubbed: its own tests live with the hooks.
const stub = vi.hoisted(() => ({ detail: null as unknown }));
vi.mock('../src/state/useMeta.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/state/useMeta.ts')>();
  return {
    ...real,
    useEventDetail: () => ({
      state: stub.detail ? 'ready' : 'loading',
      data: stub.detail,
      retry: () => undefined,
    }),
  };
});

const T1 = ['azumarill', 'clodsire', 'tinkaton'];
const T2 = ['azumarill', 'clodsire', 'mimikyu'];
const T3 = ['azumarill', 'lanturn', 'tinkaton'];
const T4 = ['mimikyu', 'clodsire', 'altaria'];
const OPP = ['medicham', 'lanturn', 'altaria'];

function game(
  n: number,
  at: string,
  left: string[],
  right: string[],
  winnerSide: 'left' | 'right' | null,
): EventGameV1 {
  return {
    game: n,
    at,
    leftTeam: left,
    rightTeam: right,
    leftForms: [],
    rightForms: [],
    winnerSide,
    resultSource: null,
    scoreAtStart: [0, 0],
    notes: null,
  };
}

function match(
  id: string,
  day: number,
  stage: string,
  bracket: string,
  roundLabel: string | null,
  left: string,
  right: string,
  games: EventGameV1[],
): EventMatchV1 {
  return {
    match: id,
    day,
    stage,
    group: null,
    roundLabel,
    bracket,
    bracketDepth: 1,
    matchFormat: 'bo3',
    left,
    right,
    games,
  };
}

/**
 * Three days, VODs for days 1 and 2 only. Ash beats Brock in swiss on day 1 (four complete threes
 * across the event plus one partial scan), Misty loses to Gary in the day 2 top cut, and Ash
 * beats Gary in the day 3 grand final. Ash and Gary have team lists; Brock and Misty do not.
 */
function detail(): EventDetailV1 {
  const d1 = (s: number) => new Date(Date.UTC(2027, 9, 16, 0, 0, s)).toISOString();
  const d2 = (s: number) => new Date(Date.UTC(2027, 9, 17, 0, 0, s)).toISOString();
  const d3 = (s: number) => new Date(Date.UTC(2027, 9, 18, 0, 0, s)).toISOString();
  return {
    event: {
      id: 'nice',
      name: '2027 Nice Pokemon GO Regional Championships',
      startDate: '2027-10-16',
      endDate: '2027-10-18',
      league: 'great',
      cup: 'championshipseries',
      vods: [
        { day: 1, id: 'v111' },
        { day: 2, id: 'v222' },
      ],
      notes: null,
      received: '',
    },
    matches: [
      match('m1', 1, 'swiss', 'swiss', 'SWISS ROUND 1', 'Ash', 'Brock', [
        game(1, d1(3723), T2, ['skarmory', 'swampert', 'registeel'], 'left'),
        game(2, d1(4000), T3, ['skarmory', 'swampert', 'registeel'], 'right'),
        game(3, d1(4300), ['azumarill', 'clodsire'], ['skarmory', 'swampert'], 'left'),
      ]),
      match('m2', 2, 'top_cut', 'winners', 'WINNERS SEMIS', 'Misty', 'Gary', [
        game(1, d2(100), ['lapras', 'lickitung', 'marowak'], OPP, 'right'),
        game(2, d2(200), ['lapras', 'lickitung', 'marowak'], OPP, 'right'),
      ]),
      match('m3', 3, 'top_cut', 'grand', 'GRAND FINALS', 'Ash', 'Gary', [
        game(1, d3(100), T1, OPP, 'left'),
        game(2, d3(200), T4, OPP, 'right'),
        game(3, d3(300), T1, OPP, 'left'),
        game(4, d3(400), T1, OPP, null),
      ]),
    ],
    roster: [
      {
        player: 'Ash',
        species: [
          { species: 'azumarill', moves: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] } },
          { species: 'clodsire', moves: null },
          { species: 'tinkaton', moves: { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER'] } },
          { species: 'mimikyu', moves: { fast: 'CHARM', charged: ['SHADOW_CLAW'] } },
          { species: 'lanturn', moves: { fast: 'SPARK', charged: ['SURF'] } },
          { species: 'altaria', moves: { fast: 'DRAGON_BREATH', charged: ['SKY_ATTACK'] } },
        ],
      },
      {
        player: 'Gary',
        species: [
          { species: 'medicham', moves: { fast: 'COUNTER', charged: ['ICE_PUNCH'] } },
          { species: 'lanturn', moves: null },
          { species: 'altaria', moves: null },
          { species: 'skarmory', moves: null },
          { species: 'swampert', moves: null },
          { species: 'registeel', moves: null },
        ],
      },
    ],
    species: [],
  };
}

let picks: AppState['picks'] = [null, null, null];

/** Routes like App does, so a tap that changes `?p=` opens the card it names. */
function Routed() {
  const s = useAppState();
  picks = s.picks;
  const r = s.route;
  if (r.screen !== 'meta-event') {
    return null;
  }
  return <EventPage id={r.id} {...(r.p ? { p: r.p } : {})} />;
}

function renderAt(hash: string) {
  window.location.hash = hash;
  return render(
    <AppProvider host={fakeHost()}>
      <Routed />
    </AppProvider>,
  );
}

function cardOf(name: string): HTMLElement {
  const title = screen.getAllByText(name).find((el) => el.classList.contains('row-title'));
  return (title as HTMLElement).closest('.tb-team-row') as HTMLElement;
}

function cardTitles(): string[] {
  return Array.from(document.querySelectorAll('.player-card .row-title')).map(
    (el) => el.textContent ?? '',
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetMetaDataForTests();
  resetMetaHooksForTests();
  stub.detail = detail();
  picks = [null, null, null];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 404 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EventPage', () => {
  it('lists players Champion first, tagging only Champion, Finalist and Top cut', async () => {
    renderAt('#/meta/events/nice');
    await screen.findByText('Players');
    expect(cardTitles()).toEqual(['Ash', 'Gary', 'Misty', 'Brock']);
    const tag = (name: string) => cardOf(name).querySelector('.row-head .ui-tag')?.textContent;
    expect(tag('Ash')).toBe('Champion');
    expect(tag('Gary')).toBe('Finalist');
    expect(tag('Misty')).toBe('Top cut');
    expect(tag('Brock')).toBeUndefined();
    expect(cardOf('Ash')).toHaveTextContent('7 games on stream');
    expect(within(cardOf('Ash')).getByText('4-2')).toBeInTheDocument();
    // Azumarill was picked in 6 of Ash's 7 games.
    expect(cardOf('Ash').querySelectorAll('.six-count')[0]).toHaveTextContent('6/7');
  });

  it('the header names the event and the facts line counts battles and players', async () => {
    renderAt('#/meta/events/nice');
    await screen.findByText('Players');
    expect(document.querySelector('.hdr-title')).toHaveTextContent('Nice Regional');
    expect(screen.getByText(/9 battles from 4 players on stream/)).toBeInTheDocument();
  });

  it('opening a card puts the player in the route; a route with p opens that card', async () => {
    renderAt('#/meta/events/nice');
    await screen.findByText('Players');
    expect(screen.queryByText('Build these teams')).toBeNull();
    fireEvent.click(within(cardOf('Gary')).getAllByRole('button')[0] as HTMLElement);
    expect(window.location.hash).toBe('#/meta/events/nice?p=Gary');
    expect(cardOf('Gary')).toHaveClass('open');
    // One open at a time.
    fireEvent.click(within(cardOf('Ash')).getAllByRole('button')[0] as HTMLElement);
    expect(window.location.hash).toBe('#/meta/events/nice?p=Ash');
    expect(cardOf('Gary')).not.toHaveClass('open');
    // Closing drops it.
    fireEvent.click(within(cardOf('Ash')).getAllByRole('button')[0] as HTMLElement);
    expect(window.location.hash).toBe('#/meta/events/nice');
    cleanup();

    renderAt('#/meta/events/nice?p=Misty');
    await screen.findByText('Players');
    expect(cardOf('Misty')).toHaveClass('open');
    expect(cardOf('Ash')).not.toHaveClass('open');
  });

  it('a Build these teams row sets the three picks with the team list moves and opens Build', async () => {
    renderAt('#/meta/events/nice?p=Ash');
    const card = await screen
      .findByText('Build these teams')
      .then((el) => el.closest('.tb-team-row') as HTMLElement);
    const rows = card.querySelectorAll<HTMLButtonElement>('button.team-row');
    // The most played three first: T1, three games, 2-0.
    expect(rows[0]).toHaveTextContent('3 games');
    expect(rows[0]?.querySelector('b')).toHaveTextContent('2-0');
    act(() => {
      (rows[0] as HTMLButtonElement).click();
    });
    expect(picks).toEqual([
      {
        kind: 'species',
        id: 'azumarill',
        preferOwned: true,
        moves: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
      },
      // The team list has Clodsire without moves: no moves carried.
      { kind: 'species', id: 'clodsire', preferOwned: true },
      {
        kind: 'species',
        id: 'tinkaton',
        preferOwned: true,
        moves: { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER'] },
      },
    ]);
    expect(window.location.hash).toBe('#/build');
  });

  it('Watch links only for days with a VOD; a day 1 game links at its moment', async () => {
    renderAt('#/meta/events/nice?p=Ash');
    await screen.findByText('Players');
    const days = screen.getAllByRole('link', { name: /Watch day/ });
    expect(days.map((a) => a.textContent)).toEqual([
      expect.stringContaining('Watch day 1'),
      expect.stringContaining('Watch day 2'),
    ]);
    expect(days[0]).toHaveAttribute('href', 'https://www.twitch.tv/videos/111');
    expect(days[0]).toHaveAttribute('target', '_blank');
    expect(days[0]).toHaveAttribute('rel', 'noreferrer');

    const card = cardOf('Ash');
    const watch = within(card).getAllByRole('link', { name: /^Watch/ });
    // Three day 1 games link; the four day 3 games have no VOD.
    expect(watch).toHaveLength(3);
    expect(watch[0]).toHaveAttribute('href', 'https://www.twitch.tv/videos/111?t=1h2m3s');
    expect(card).toHaveTextContent('vs Brock · Swiss Round 1');
    expect(card).toHaveTextContent('vs Gary · Grand Finals');
    // W and L chips; the undecided game gets none.
    expect(card.querySelectorAll('.result-chip.win')).toHaveLength(4);
    expect(card.querySelectorAll('.result-chip.loss')).toHaveLength(2);
  });

  it('a player without a team list: N of 6 seen, the no-team-list line, no Movesets', async () => {
    renderAt('#/meta/events/nice?p=Brock');
    await screen.findByText('Players');
    const card = cardOf('Brock');
    expect(card).toHaveTextContent('3 of 6 seen');
    expect(card).toHaveTextContent(
      'No team list yet: the six above are what the broadcast showed.',
    );
    expect(within(card).queryByText('Movesets (RK9 team list)')).toBeNull();
    expect(cardOf('Ash')).not.toHaveTextContent('of 6 seen');
  });

  it('Movesets for a player with a team list: role pill N of M, Moves not listed', async () => {
    renderAt('#/meta/events/nice?p=Ash');
    await screen.findByText('Players');
    const card = cardOf('Ash');
    expect(within(card).getByText('Movesets (RK9 team list)')).toBeInTheDocument();
    const pills = Array.from(card.querySelectorAll('.pick-role-pill')).map((el) => el.textContent);
    expect(pills[0]).toBe('6 of 7');
    expect(card.querySelectorAll('.pick-card.filled')).toHaveLength(6);
    expect(card.querySelectorAll('.pick-x, .drag-grip')).toHaveLength(0);
    expect(within(card).getAllByText('Moves not listed')).toHaveLength(1);
  });

  it('Show N more appears only past three complete threes, and expands in place', async () => {
    renderAt('#/meta/events/nice?p=Ash');
    await screen.findByText('Players');
    const ash = cardOf('Ash');
    expect(ash.querySelectorAll('button.team-row')).toHaveLength(3);
    fireEvent.click(within(ash).getByRole('button', { name: 'Show 1 more' }));
    expect(ash.querySelectorAll('button.team-row')).toHaveLength(4);
    expect(within(ash).queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
    cleanup();

    renderAt('#/meta/events/nice?p=Gary');
    await screen.findByText('Players');
    const gary = cardOf('Gary');
    expect(gary.querySelectorAll('button.team-row')).toHaveLength(1);
    expect(within(gary).queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
  });

  it('loading state before the detail lands', async () => {
    stub.detail = null;
    renderAt('#/meta/events/nice');
    expect(await screen.findByText(/Loading the tournament/)).toBeInTheDocument();
  });
});
