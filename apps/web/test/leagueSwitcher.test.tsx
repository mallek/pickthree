import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { League, ScheduleEntry } from '@pickthree/engine';
import { LeagueSwitcher } from '../src/components/LeagueSwitcher.tsx';
import { sheetLeagues } from '../src/leagues.ts';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { GREAT, fakeHost } from './fakeHost.ts';

const ULTRA: League = { ...GREAT, id: 'ultra', title: 'Ultra League', short: 'Ultra' };
const MASTER: League = { ...GREAT, id: 'master', title: 'Master League', short: 'Master' };

const TOURNAMENT: League = {
  id: 'championshipseries',
  title: 'Tournament',
  short: 'Tournament',
  cp: 1500,
  cup: 'championshipseries',
  meta: 'great',
  kind: 'cup',
  minCp: 1410,
  include: [],
  exclude: [
    { filterType: 'tag', values: ['mega'] },
    { filterType: 'id', values: ['mimikyu'] },
  ],
  metaSize: 3,
};

const REMIX: League = {
  ...TOURNAMENT,
  id: 'remix',
  title: 'Remix',
  short: 'Remix',
  kind: 'special',
};

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

/** Boot fires `boot-ready` (data) and the settings/collection load independently in
 * state/store.tsx; a click right after `boot === 'ready'` can race the still-pending settings
 * load, which would otherwise overwrite a setting changed in that window once it finally
 * resolves. That race is real but practically invisible in the app itself, since `boot-ready`
 * (the fake host here resolves in a microtask; the real one fetches game data) takes hundreds of
 * milliseconds, long past when the settings load has already finished; a test's synchronous fake
 * host closes that gap to nothing, which is what makes the race show up here. Waiting for
 * `settingsLoaded` too, not a change to store.tsx (a separate follow-up), is what keeps these
 * tests deterministic instead of order-dependent. */
async function waitUntilReady() {
  await waitFor(() => {
    expect(latest?.boot).toBe('ready');
    expect(latest?.settingsLoaded).toBe(true);
  });
}

describe('LeagueSwitcher', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    latest = null;
  });

  it('shows only the open leagues as radios and puts the cup behind the overflow', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, ULTRA, MASTER, TOURNAMENT, REMIX],
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitUntilReady();
    expect(screen.getByRole('radio', { name: 'Great League' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Ultra League' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Master League' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Tournament' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More leagues and cups' })).toBeInTheDocument();
  });

  it('lists every league and cup in the sheet, hides the special cups, and picking one switches league and closes it', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, ULTRA, MASTER, TOURNAMENT, REMIX],
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitUntilReady();
    fireEvent.click(screen.getByRole('button', { name: 'More leagues and cups' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Leagues')).toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { name: 'Tournament' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('radio', { name: 'Remix' })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('radio', { name: 'Tournament' }));
    });
    await waitFor(() => expect(latest?.settings.league).toBe('championshipseries'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the current cup in the overflow slot when it is the league in play', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, TOURNAMENT],
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitUntilReady();
    fireEvent.click(screen.getByRole('button', { name: 'More leagues and cups' }));
    const sheet = await screen.findByRole('dialog');
    const radio = within(sheet).getByRole('radio', { name: 'Tournament' });
    await act(async () => {
      fireEvent.click(radio);
    });
    await waitFor(() => expect(latest?.settings.league).toBe('championshipseries'));
    const overflow = screen.getByRole('button', {
      name: 'Tournament League, More leagues and cups',
    });
    expect(overflow).toHaveClass('on');
    expect(overflow.textContent).toContain('Tournament');
  });
});

const RETRO: League = {
  ...TOURNAMENT,
  id: 'retro',
  title: 'Retro Cup',
  short: 'Retro',
  cup: 'retro',
  kind: 'rotation',
};
const LITTLE: League = {
  ...TOURNAMENT,
  id: 'little',
  title: 'Little Cup',
  short: 'Little',
  cup: 'little',
  cp: 500,
  kind: 'rotation',
  stale: true,
  rankingsUpdated: '2024-03-04',
};
const LAIC: League = {
  ...TOURNAMENT,
  id: 'laic2027',
  title: '2026 GO LAIC Cup',
  short: '2026 GO LAIC',
  cup: 'laic2027',
  kind: 'rotation',
};
const entry = (l: League, start: string, end: string): ScheduleEntry => ({
  league: l.id,
  cup: l.cup,
  cp: l.cp,
  title: l.title,
  start,
  end,
  season: 'Twilight Trails',
});
const SCHEDULE: ScheduleEntry[] = [
  entry(RETRO, '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z'),
  entry(LITTLE, '2026-09-26T20:00:00.000Z', '2026-10-03T20:00:00.000Z'),
  entry(LAIC, '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z'),
];
const ALL = [GREAT, ULTRA, MASTER, TOURNAMENT, REMIX, RETRO, LITTLE, LAIC];

describe('sheetLeagues', () => {
  const now = new Date('2026-09-24T00:00:00.000Z');

  it('lists open leagues, then Tournament, then live cups, then upcoming, and hides the rest', () => {
    const { open, more } = sheetLeagues(ALL, SCHEDULE, 'great', now);
    expect(open.map((l) => l.id)).toEqual(['great', 'ultra', 'master']);
    expect(more.map((m) => m.league.id)).toEqual([
      'great',
      'ultra',
      'master',
      'championshipseries',
      'retro',
      'little',
    ]);
    expect(more.find((m) => m.league.id === 'retro')?.detail).toEqual(['Live, ends Tue 9/29']);
    expect(more.find((m) => m.league.id === 'little')?.detail).toEqual([
      'Starts Sat 9/26',
      'PvPoke last updated March 2024',
    ]);
  });

  it('keeps the selected cup listed even when it is off, so the sheet never hides where you are', () => {
    const { more } = sheetLeagues(ALL, SCHEDULE, 'laic2027', now);
    expect(more.map((m) => m.league.id)).toContain('laic2027');
  });

  it('never lists special formats', () => {
    const { more } = sheetLeagues(ALL, SCHEDULE, 'great', now);
    expect(more.map((m) => m.league.id)).not.toContain('remix');
  });
});

describe('sheetLeagues ordering', () => {
  const now = new Date('2026-09-24T00:00:00.000Z');
  const mk = (id: string): League => ({ ...RETRO, id, title: id, short: id, cup: id });
  const liveLate = mk('liveLate');
  const liveSoon = mk('liveSoon');
  const upLate = mk('upLate');
  const upSoon = mk('upSoon');

  it('orders live cups by soonest end, then upcoming cups by soonest start, whatever the schedule order', () => {
    // Schedule and league lists are deliberately in the reverse of the expected order.
    const schedule = [
      entry(upLate, '2026-09-28T20:00:00.000Z', '2026-10-05T20:00:00.000Z'),
      entry(upSoon, '2026-09-26T20:00:00.000Z', '2026-10-03T20:00:00.000Z'),
      entry(liveLate, '2026-09-20T20:00:00.000Z', '2026-10-01T20:00:00.000Z'),
      entry(liveSoon, '2026-09-21T20:00:00.000Z', '2026-09-27T20:00:00.000Z'),
    ];
    const { more } = sheetLeagues(
      [GREAT, upLate, upSoon, liveLate, liveSoon],
      schedule,
      'great',
      now,
    );
    expect(more.map((m) => m.league.id)).toEqual([
      'great',
      'liveSoon',
      'liveLate',
      'upSoon',
      'upLate',
    ]);
  });
});

describe('LeagueSwitcher rotation cup in play', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    latest = null;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the selected rotation cup in the overflow slot', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, ULTRA, MASTER, TOURNAMENT, RETRO],
        schedule: SCHEDULE,
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitUntilReady();
    fireEvent.click(screen.getByRole('button', { name: 'More leagues and cups' }));
    const sheet = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('radio', { name: /Retro Cup/ }));
    });
    await waitFor(() => expect(latest?.settings.league).toBe('retro'));
    const overflow = screen.getByRole('button', {
      name: 'Retro Cup League, More leagues and cups',
    });
    expect(overflow).toHaveClass('on');
    expect(overflow.textContent).toContain('Retro');
  });
});
