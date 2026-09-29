import 'fake-indexeddb/auto';
import type { BattleSet } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCommunityCache } from '../src/community.ts';
import { NoticeToast } from '../src/components/NoticeToast.tsx';
import { SHARE_DEV_KEY } from '../src/metaShare.ts';
import { LogBattle } from '../src/screens/LogBattle.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetHistoryForTests } from '../src/state/history.ts';
import { DEFAULT_SETTINGS, resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost, GREAT } from './fakeHost.ts';

// New Set's own tests live in newSet.test.tsx.
describe('Log a battle', () => {
  const matchMedia = window.matchMedia;
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
  });
  afterEach(() => {
    window.matchMedia = matchMedia;
    vi.restoreAllMocks();
    resetCommunityCache();
    localStorage.removeItem(SHARE_DEV_KEY);
  });

  it('asks for all three opponents, not just the ones you saw', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    expect(
      await screen.findByText('Add all three opponents when you can. One or two still helps.'),
    ).toBeInTheDocument();
  });

  it('fills slots from the recent row and saves a win', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [
        {
          id: 'b1',
          at: '2026-09-15T10:05:00Z',
          opponents: ['medicham'],
          result: 'win',
          tanked: false,
        },
      ],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText('1 logged with this team')).toBeInTheDocument());
    // The recent grid shows only while the search is in use.
    expect(screen.queryByRole('button', { name: 'Medicham' })).not.toBeInTheDocument();
    fireEvent.focus(screen.getByPlaceholderText('Search any Pokémon'));
    // Medicham was faced; it leads the recent row.
    fireEvent.click(screen.getByRole('button', { name: 'Medicham' }));
    // Room for two more: the grid stays open with the search focused, Medicham marked as in.
    expect(screen.getByRole('button', { name: 'Medicham' })).toHaveClass('on');
    expect(screen.getByPlaceholderText('Search any Pokémon')).toHaveFocus();
    // The in-battle card opens for the opponent just added: their moves across the top.
    await waitFor(() => expect(screen.getByText('Ice Punch')).toBeInTheDocument());
    expect(screen.getByText('in 7')).toBeInTheDocument();
    expect(screen.getAllByText('Mixed')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Remove Medicham' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Win' }));
    });
    await waitFor(async () => {
      const sets = await storage.loadSets('great');
      expect(sets[0]?.battles).toHaveLength(2);
      expect(sets[0]?.battles[1]).toMatchObject({
        opponents: ['medicham'],
        result: 'win',
        tanked: false,
      });
    });
    // Stays here for the next battle, slots cleared, count up by one.
    await waitFor(() => expect(screen.getByText('2 logged with this team')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Remove Medicham' })).not.toBeInTheDocument();
  });

  it('never closes a set: the fifth battle logs like any other', async () => {
    const four = Array.from({ length: 4 }, (_, i) => ({
      id: `b${i}`,
      at: `2026-09-15T10:0${i}:00Z`,
      opponents: ['medicham'],
      result: 'win' as const,
      tanked: false,
    }));
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: four,
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText('4 logged with this team')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tanked' }));
    });
    await waitFor(() => expect(screen.getByText('5 logged with this team')).toBeInTheDocument());
    const sets = await storage.loadSets('great');
    expect(sets).toHaveLength(1);
    expect(sets[0]?.closed).toBe(false);
    expect(sets[0]?.battles).toHaveLength(5);
    expect(sets[0]?.battles[4]?.tanked).toBe(true);
  });

  it('keeps both picks made one after the other from the recent grid', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'registeel'] },
      battles: [
        {
          id: 'b1',
          at: '2026-09-15T10:05:00Z',
          opponents: ['medicham'],
          result: 'win',
          tanked: false,
        },
        {
          id: 'b2',
          at: '2026-09-15T10:10:00Z',
          opponents: ['clodsire'],
          result: 'loss',
          tanked: false,
        },
      ],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText('2 logged with this team')).toBeInTheDocument());
    const search = screen.getByPlaceholderText('Search any Pokémon');
    fireEvent.focus(search);
    fireEvent.click(screen.getByRole('button', { name: 'Clodsire' }));
    // The grid stays open for the second pick, no second tap on the search.
    fireEvent.click(screen.getByRole('button', { name: 'Medicham' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove Clodsire' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Medicham' })).toBeInTheDocument();
    });
    // Tapping a filled slot switches the card; the x removes it.
    fireEvent.click(screen.getByRole('button', { name: 'Clodsire in battle' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clodsire in battle' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Clodsire' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove Clodsire' })).not.toBeInTheDocument(),
    );
  });

  it('narrows the grid by type and then by type plus name', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText('0 logged with this team')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Search any Pokémon'), {
      target: { value: 'fairy' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tinkaton' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Azumarill' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clodsire' })).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search any Pokémon'), {
      target: { value: 'fairy tin' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tinkaton' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Azumarill' })).not.toBeInTheDocument();
    });

    // A touch screen too: with room for more, the search stays focused and cleared.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    const search = screen.getByPlaceholderText('Search any Pokémon');
    fireEvent.click(screen.getByRole('button', { name: 'Tinkaton' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Tinkaton' })).toBeInTheDocument(),
    );
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');
    fireEvent.change(search, { target: { value: 'azu' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Azumarill' }));
    await screen.findByRole('button', { name: 'Remove Azumarill' });
    expect(search).toHaveFocus();
    // The third pick fills the slots: on a touch screen the keyboard drops and the grid folds,
    // so the card is in view.
    fireEvent.change(search, { target: { value: 'clod' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Clodsire' }));
    await screen.findByRole('button', { name: 'Remove Clodsire' });
    expect(search).not.toHaveFocus();
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });

  it('keeps the cursor in the search after the third pick on a desktop', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    await screen.findByText('0 logged with this team');
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const search = screen.getByPlaceholderText('Search any Pokémon');
    fireEvent.focus(search);
    for (const who of ['Tinkaton', 'Azumarill', 'Clodsire']) {
      fireEvent.click(await screen.findByRole('button', { name: who }));
      await screen.findByRole('button', { name: `Remove ${who}` });
    }
    expect(search).toHaveFocus();
    // The grid folds with the third pick; typing brings matches back.
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });
});

describe('Log a Battle on the foundation', () => {
  const team: BattleSet['team'] = { species: ['tinkaton', 'azumarill', 'clodsire'] };
  const openSet = (battles: BattleSet['battles'] = []): BattleSet => ({
    id: 's1',
    league: 'great',
    startedAt: '2026-09-15T10:00:00Z',
    team,
    battles,
    closed: false,
  });
  const medichamWin: BattleSet['battles'][number] = {
    id: 'b1',
    at: '2026-09-15T10:05:00Z',
    opponents: ['medicham'],
    result: 'win' as const,
    tanked: false,
  };
  const renderLog = () =>
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
        <NoticeToast />
      </AppProvider>,
    );
  const teamsCalls = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([u]) => String(u).includes('/api/v1/teams'));

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    window.history.replaceState(null, '', '#/meta/log');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityCache();
    localStorage.removeItem(SHARE_DEV_KEY);
  });

  it('is a sub page with Back, the search before the slots', async () => {
    await storage.saveSet(openSet());
    renderLog();
    const search = await screen.findByPlaceholderText('Search any Pokémon');
    expect(screen.getByText('Log a Battle')).toBeInTheDocument();
    const slot = await screen.findByRole('button', { name: 'Opponent 1' });
    // Input first: the search precedes the slots in the page.
    expect(search.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The search rides in the sticky head with the title, so an open card never scrolls it away.
    const head = search.closest('.log-head');
    expect(head).not.toBeNull();
    expect(head?.querySelector('.hdr')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.hash).toBe('#/meta'));
  });

  it('colors the results and explains Tanked on a tap', async () => {
    await storage.saveSet(openSet());
    renderLog();
    const win = await screen.findByRole('button', { name: 'Win' });
    // The ui Button's outcome variants; Tanked is the amber one.
    expect(win).toHaveClass('ui-btn-win');
    expect(screen.getByRole('button', { name: 'Loss' })).toHaveClass('ui-btn-loss');
    expect(screen.getByRole('button', { name: 'Tanked' })).toHaveClass('ui-btn-warn');
    // Outside edit mode a tap logs; nothing is pressed.
    expect(win).not.toHaveAttribute('aria-pressed');
    const line = 'They quit or threw. It stays in the log but counts for nothing.';
    expect(screen.queryByText(line)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tanked means/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'What is Tanked?' }));
    expect(screen.getByText(line)).toBeInTheDocument();
  });

  it('says what was saved and how many this team has now', async () => {
    await storage.saveSet(openSet([medichamWin]));
    renderLog();
    await screen.findByText('1 logged with this team');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Win' }));
    });
    expect(await screen.findByText('Win logged · 2 with this team')).toBeInTheDocument();
    // A confirmation: neutral and polite, not the amber alert a failed save raises.
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Win logged · 2 with this team');
    expect(toast).toHaveClass('notice-info');
    expect(toast).not.toHaveClass('notice-warn');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tanked' }));
    });
    expect(await screen.findByText('Tanked logged · 3 with this team')).toBeInTheDocument();
  });

  it('still warns in amber when the phone refuses the save', async () => {
    await storage.saveSet(openSet([medichamWin]));
    renderLog();
    await screen.findByText('1 logged with this team');
    vi.spyOn(storage, 'saveSet').mockRejectedValue(new Error('refused'));
    // The refusal is recorded: recordError reads matchMedia (jsdom has none) and may report.
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Loss' }));
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Could not save that battle/);
    expect(alert).toHaveClass('notice-warn');
    expect(screen.queryByText(/Loss logged/)).not.toBeInTheDocument();
  });

  it('offers the likely teammates of the first opponent from the community board', async () => {
    localStorage.setItem(SHARE_DEV_KEY, '1');
    const board = {
      cores: [
        {
          species: ['medicham', 'clodsire'],
          kind: 'core',
          thirds: [{ speciesId: 'dragonite_shadow', sightings: 4 }],
        },
        {
          species: ['medicham', 'azumarill'],
          kind: 'core',
          thirds: [{ speciesId: 'tinkaton', sightings: 2 }],
        },
      ],
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).includes('/api/v1/teams')
          ? new Response(JSON.stringify(board))
          : new Response('{}'),
      );
    await storage.saveSet(openSet([medichamWin]));
    renderLog();
    await screen.findByText('1 logged with this team');
    const search = screen.getByPlaceholderText('Search any Pokémon');
    // Nothing slotted yet: no board read, no row.
    fireEvent.focus(search);
    expect(screen.queryByText(/Often with/)).not.toBeInTheDocument();
    // The search stays open after the pick, so the row shows without another tap.
    fireEvent.click(screen.getByRole('button', { name: 'Medicham' }));
    const row = await screen.findByRole('group', { name: 'Often with Medicham' });
    expect(within(row).getByText('Often with Medicham')).toBeInTheDocument();
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Clodsire', 'Shadow Dragonite', 'Azumarill', 'Tinkaton']);
    // The read is the whole board: the query names the league and window, never the opponent.
    expect(teamsCalls(fetchSpy)).toHaveLength(1);
    expect(String(teamsCalls(fetchSpy)[0]![0])).not.toContain('medicham');
    // Tapping one slots it, and it leaves the row.
    fireEvent.click(within(row).getByRole('button', { name: 'Clodsire' }));
    await screen.findByRole('button', { name: 'Remove Clodsire' });
    const again = await screen.findByRole('group', { name: 'Often with Medicham' });
    expect(within(again).queryByRole('button', { name: 'Clodsire' })).not.toBeInTheDocument();
  });

  it('shows no likely teammates without a board', async () => {
    localStorage.setItem(SHARE_DEV_KEY, '1');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('nope', { status: 503 }));
    await storage.saveSet(openSet([medichamWin]));
    renderLog();
    await screen.findByText('1 logged with this team');
    const search = screen.getByPlaceholderText('Search any Pokémon');
    fireEvent.focus(search);
    fireEvent.click(screen.getByRole('button', { name: 'Medicham' }));
    await screen.findByRole('button', { name: 'Remove Medicham' });
    await waitFor(() => expect(teamsCalls(fetchSpy)).toHaveLength(1));
    // Let the failed read settle into state.
    await act(async () => {});
    expect(screen.queryByText(/Often with/)).not.toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
  });

  it('does not read the board with sharing off', async () => {
    localStorage.setItem(SHARE_DEV_KEY, '1');
    await storage.saveSettings({ ...DEFAULT_SETTINGS, share: { enabled: false } });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{}'));
    await storage.saveSet(openSet([medichamWin]));
    renderLog();
    await screen.findByText('1 logged with this team');
    const search = screen.getByPlaceholderText('Search any Pokémon');
    fireEvent.focus(search);
    fireEvent.click(screen.getByRole('button', { name: 'Medicham' }));
    await screen.findByRole('button', { name: 'Remove Medicham' });
    await act(async () => {});
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.queryByText(/Often with/)).not.toBeInTheDocument();
    expect(teamsCalls(fetchSpy)).toHaveLength(0);
  });

  it('edits a logged battle: fills the slots, selects the result, saves and returns', async () => {
    await storage.saveSet(
      openSet([
        {
          id: 'b1',
          at: '2026-09-15T10:05:00Z',
          opponents: ['medicham', 'clodsire'],
          result: 'loss',
          tanked: false,
        },
      ]),
    );
    window.history.replaceState(null, '', '#/meta/log/s1/b1');
    renderLog();
    expect(await screen.findByText('Edit battle')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Remove Medicham' });
    expect(screen.getByRole('button', { name: 'Remove Clodsire' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loss' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Win' })).toHaveAttribute('aria-pressed', 'false');
    // Picking a result only selects it; Save changes writes.
    fireEvent.click(screen.getByRole('button', { name: 'Win' }));
    expect(screen.getByRole('button', { name: 'Win' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Clodsire' }));
    let sets = await storage.loadSets('great');
    expect(sets[0]?.battles[0]?.result).toBe('loss');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    await waitFor(() => expect(window.location.hash).toBe('#/meta'));
    sets = await storage.loadSets('great');
    expect(sets[0]?.battles).toHaveLength(1);
    expect(sets[0]?.battles[0]).toMatchObject({
      id: 'b1',
      at: '2026-09-15T10:05:00Z',
      opponents: ['medicham'],
      result: 'win',
      tanked: false,
    });
  });

  it('edits a battle in a closed set while another team is running', async () => {
    await storage.saveSet({ ...openSet([{ ...medichamWin, id: 'old' }]), id: 's0', closed: true });
    await storage.saveSet({
      ...openSet(),
      id: 's2',
      team: { species: ['medicham', 'azumarill', 'dragonite_shadow'] },
    });
    window.history.replaceState(null, '', '#/meta/log/s0/old');
    renderLog();
    await screen.findByText('Edit battle');
    // The strip shows the team that fought this battle, not the one running now.
    await waitFor(() => expect(screen.getByLabelText('Your team')).toHaveTextContent(/Tinkaton/));
    fireEvent.click(screen.getByRole('button', { name: 'Tanked' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    await waitFor(() => expect(window.location.hash).toBe('#/meta'));
    const sets = await storage.loadSets('great');
    expect(sets.find((x) => x.id === 's0')?.battles[0]).toMatchObject({
      id: 'old',
      result: null,
      tanked: true,
    });
    expect(sets.find((x) => x.id === 's2')?.battles).toHaveLength(0);
  });

  it('opens normally for an unknown battle', async () => {
    await storage.saveSet(openSet());
    window.history.replaceState(null, '', '#/meta/log/s1/nope');
    renderLog();
    expect(await screen.findByText('0 logged with this team')).toBeInTheDocument();
    expect(screen.getByText('Log a Battle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});

describe('Log a battle in a cup', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
  });

  it('leaves out species the cup does not admit and says why', async () => {
    const base = fakeHost();
    const bootReply = await base.ready();
    const retro = {
      ...GREAT,
      id: 'retro',
      title: 'Retro Cup',
      short: 'Retro',
      kind: 'cup' as const,
    };
    await storage.saveSettings({ ...DEFAULT_SETTINGS, league: 'retro' });
    await storage.saveSet({
      id: 's1',
      league: 'retro',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'clodsire', 'medicham'] },
      battles: [],
      closed: false,
    });
    render(
      <AppProvider
        host={fakeHost({
          ready: vi.fn(async () => ({ ...bootReply, leagues: [retro] })),
          leagueInfo: vi.fn(async (id: string) => ({
            ...(await base.leagueInfo(id)),
            legal: ['tinkaton', 'clodsire', 'medicham'],
          })),
        })}
      >
        <LogBattle />
      </AppProvider>,
    );
    const search = await screen.findByPlaceholderText('Search any Pokémon');
    fireEvent.change(search, { target: { value: 'azu' } });
    expect(await screen.findByText('Not allowed in Retro Cup: Azumarill')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Azumarill' })).not.toBeInTheDocument();
  });
});
