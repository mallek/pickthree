import 'fake-indexeddb/auto';
import type { MoveChoice, Specimen, Verdict, VerdictLabel } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddPokemon } from '../src/screens/AddPokemon.tsx';
import { SpecimenScreen } from '../src/screens/Specimen.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import {
  AppProvider,
  hashFor,
  useActions,
  useAppState,
  type AppState,
  type Route,
} from '../src/state/store.tsx';
import { canGoBack, resetHistoryForTests } from '../src/state/history.ts';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

/** The detail page while the route is a Pokémon's (and the Add form on its own route), nothing on
 * any other screen, as App does. */
function Gate() {
  const r = useAppState().route;
  if (r.screen === 'add') {
    return <AddPokemon />;
  }
  return r.screen === 'specimen' ? <SpecimenScreen id={r.id} /> : null;
}

function specimen(
  id: string,
  speciesId: string,
  opts: { manual?: boolean; level?: number } = {},
): Specimen {
  const level = opts.level ?? 20;
  return {
    id,
    speciesId,
    familyId: speciesId,
    ivs: { atk: 0, def: 15, sta: 15 },
    level: { min: level, max: level },
    cp: 1400,
    hp: 150,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-20 12:00:00',
    raw: {},
    ...(opts.manual ? { source: 'manual' } : {}),
  } as unknown as Specimen;
}

function move(moveId: string, name: string, type: string): MoveChoice {
  return {
    moveId,
    name,
    type,
    tm: 'have',
    energy: 40,
    energyGain: 0,
    turns: 1,
    countFromFast: null,
    counts: null,
    effects: [],
    altType: null,
  } as unknown as MoveChoice;
}

function verdict(
  sp: Specimen,
  label: VerdictLabel,
  build: { level: number; stageOffset?: number },
  cost: { stardust: number; candy: number; xlCandy: number; secondMoveUnlock?: boolean },
): Verdict {
  return {
    specimenId: sp.id,
    label,
    line: `${label} line for ${sp.id}.`,
    build: {
      specimenId: sp.id,
      specimen: sp,
      speciesId: sp.speciesId,
      shadow: false,
      stageOffset: build.stageOffset ?? 0,
      level: build.level,
      cp: 1498,
      ivs: { atk: 0, def: 15, sta: 15 },
      ivRank: { rank: 12, total: 4096 },
      needsXl: false,
    },
    moveset: {
      fast: move('MUD_SHOT', 'Mud Shot', 'ground'),
      charged: [move('PLAY_ROUGH', 'Play Rough', 'fairy')],
      source: 'rankings',
      eliteTmCount: 0,
    },
    cost: {
      secondMoveUnlock: false,
      ...cost,
      eliteTm: 0,
      evolutionCandy: 0,
      powerUpSteps: 0,
      estimated: false,
      weight: 0,
    },
    perfectDelta: null,
    perfectLine: null,
    metaWins: null,
    metaSize: 3,
    metaRank: null,
    formNote: null,
    ineligible: null,
  } as unknown as Verdict;
}

/** Tinkaton, already built; Azumarill, worth powering up; Clodsire, typed in by hand; Medicham,
 * at its build level but still needing its second move; Dragonite, Built half a level short. */
const BUILT = specimen('a', 'tinkaton');
const BUILDING = specimen('b', 'azumarill');
const MANUAL = specimen('m', 'clodsire', { manual: true });
const UNLOCK = specimen('u', 'medicham');
const HALF = specimen('h', 'dragonite_shadow');
const SPECIMENS = [BUILT, BUILDING, MANUAL, UNLOCK, HALF];
const IDS = SPECIMENS.map((x) => x.id);

const VERDICTS: Record<string, Verdict> = {
  a: verdict(BUILT, 'Built', { level: 20 }, { stardust: 0, candy: 0, xlCandy: 0 }),
  b: verdict(
    BUILDING,
    'Worth building',
    { level: 40 },
    { stardust: 250000, candy: 248, xlCandy: 0 },
  ),
  m: verdict(MANUAL, 'Worth building', { level: 25 }, { stardust: 30000, candy: 30, xlCandy: 0 }),
  u: verdict(
    UNLOCK,
    'Built',
    { level: 20 },
    { stardust: 10000, candy: 25, xlCandy: 0, secondMoveUnlock: true },
  ),
  h: verdict(HALF, 'Built', { level: 20.5 }, { stardust: 2500, candy: 2, xlCandy: 0 }),
};

async function seed(): Promise<void> {
  await storage.saveCollection({
    specimens: SPECIMENS,
    report: {
      scansRead: SPECIMENS.length,
      recognized: SPECIMENS.length,
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

async function mount(
  verdicts: () => Promise<Record<string, Verdict>> = async () => VERDICTS,
  more: Parameters<typeof fakeHost>[0] = {},
): Promise<void> {
  await seed();
  render(
    <AppProvider host={fakeHost({ verdicts: vi.fn(verdicts), ...more })}>
      <Probe />
      <Gate />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.collection).not.toBeNull();
  });
}

/** Boot as a normal visit (welcome hands off to Teams), then let that route settle. */
async function boot(
  verdicts?: () => Promise<Record<string, Verdict>>,
  more?: Parameters<typeof fakeHost>[0],
): Promise<void> {
  await mount(verdicts, more);
  await waitFor(() => {
    expect(window.location.hash).toBe('#/teams');
    expect(latest?.state.route.screen).toBe('teams');
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function go(route: Route): Promise<void> {
  await act(async () => {
    latest!.actions.navigate(route);
  });
  await waitFor(() => expect(latest?.state.route.screen).toBe(route.screen));
}

/** Opened from Counters: Teams, then Counters, then the Pokémon, so there is history behind it. */
async function fromCounters(id: string): Promise<void> {
  await boot();
  await go({ screen: 'counters' });
  await go({ screen: 'specimen', id });
  expect(canGoBack()).toBe(true);
}

async function judged(): Promise<void> {
  await waitFor(() => expect(document.querySelector('.verdict-tag')).not.toBeNull());
}

describe('Pokémon detail', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    // A fresh first entry: no pick3 depth left over from an earlier test.
    window.history.replaceState(null, '', window.location.pathname);
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    latest = null;
  });

  it('keeps Back and the cog in the header and shows the name once, as the page title', async () => {
    await fromCounters('a');
    await judged();
    const header = document.querySelector('header')!;
    expect(within(header).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(within(header).queryAllByRole('heading')).toHaveLength(0);
    expect(header).not.toHaveTextContent('Tinkaton');
    const title = screen.getByRole('heading', { level: 2 });
    expect(title).toHaveTextContent('Tinkaton');
    expect(screen.getAllByRole('heading', { name: 'Tinkaton' })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(within(header).getByRole('button', { name: 'Settings' }));
    });
    expect(latest?.state.sheetOpen).toBe(true);
  });

  it('goes Back to Counters when opened from Counters', async () => {
    await fromCounters('a');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('counters'));
    expect(window.location.hash).toBe('#/counters');
  });

  it('goes Back to Collection when opened fresh, with no pick3 history', async () => {
    window.history.replaceState(null, '', hashFor({ screen: 'specimen', id: 'a' }));
    await mount();
    await waitFor(() => expect(latest?.state.route).toEqual({ screen: 'specimen', id: 'a' }));
    await judged();
    expect(canGoBack()).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('collection'));
    expect(window.location.hash).toBe('#/collection');
  });

  it('shows the verdict as a read-only tag', async () => {
    await fromCounters('b');
    await judged();
    const tag = document.querySelector('.verdict-tag');
    expect(tag).toHaveAttribute('data-verdict', 'Worth building');
    expect(tag!.closest('button')).toBeNull();
  });

  it('says "Already at level L." with no cost tiles when nothing needs powering up', async () => {
    await fromCounters('a');
    await judged();
    expect(screen.getByRole('heading', { name: 'Cost to build' })).toBeInTheDocument();
    expect(screen.getByText('Already at level 20.')).toBeInTheDocument();
    expect(document.querySelector('.stat3')).toBeNull();
    for (const word of ['Stardust', 'Candy', 'XL Candy']) {
      expect(screen.queryByText(word)).toBeNull();
    }
    expect(screen.queryByText(/Level 20 to 20/)).toBeNull();
    expect(screen.queryByText(/second move unlock/i)).toBeNull();
  });

  it('at its build level, still shows the second move unlock and only the non-zero tiles', async () => {
    await fromCounters('u');
    await judged();
    expect(screen.getByText('Already at level 20.')).toBeInTheDocument();
    expect(screen.queryByText(/^Level 20 to/)).toBeNull();
    expect(screen.getByText('Includes second move unlock.')).toBeInTheDocument();
    const tiles = [...document.querySelectorAll('.stat3 .stat')];
    expect(tiles.map((t) => t.querySelector('.meta')?.textContent)).toEqual(['Stardust', 'Candy']);
    expect(tiles.map((t) => t.querySelector('b')?.textContent?.replace(/\D/g, ''))).toEqual([
      '10000',
      '25',
    ]);
    expect(screen.queryByText('XL Candy')).toBeNull();
  });

  it('half a level short of its build is not "already at level": the level line and tiles stay', async () => {
    await fromCounters('h');
    await judged();
    expect(document.querySelector('.verdict-tag')).toHaveAttribute('data-verdict', 'Built');
    expect(screen.queryByText(/^Already at level/)).toBeNull();
    expect(screen.getByText('Level 20 to 20.5')).toBeInTheDocument();
    expect([...document.querySelectorAll('.stat3 .stat .meta')].map((m) => m.textContent)).toEqual([
      'Stardust',
      'Candy',
      'XL Candy',
    ]);
  });

  it('keeps the cost tiles and the level line when there is powering up to do', async () => {
    await fromCounters('b');
    await judged();
    expect(screen.queryByText(/^Already at level/)).toBeNull();
    expect(screen.getByText('Level 20 to 40')).toBeInTheDocument();
    expect(screen.getByText('Stardust')).toBeInTheDocument();
    expect(screen.getByText('Candy')).toBeInTheDocument();
    expect(screen.getByText('XL Candy')).toBeInTheDocument();
  });

  it('flips "Use in team recommendations" in place, with nothing fixed over the page', async () => {
    await fromCounters('b');
    await judged();
    const sw = screen.getByRole('switch', { name: 'Use in team recommendations' });
    expect(sw).toHaveAccessibleDescription('Off leaves it out of Teams and Build suggestions.');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(latest?.state.settings.excludedSpecimenIds).toEqual(['b']);
    expect(screen.getByRole('switch', { name: 'Use in team recommendations' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Use in team recommendations' }));
    });
    expect(latest?.state.settings.excludedSpecimenIds).toEqual([]);
    expect(screen.getByRole('switch', { name: 'Use in team recommendations' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const page = document.querySelector('.screen')!;
    expect(page.querySelector('.bottom-actions')).toBeNull();
    for (const el of page.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.position).not.toBe('fixed');
      expect(getComputedStyle(el).position).not.toBe('fixed');
    }
  });

  it('shows no Remove for a scanned Pokémon', async () => {
    await fromCounters('b');
    await judged();
    expect(screen.queryByRole('button', { name: 'Remove from collection' })).toBeNull();
  });

  it('asks before removing a hand-added Pokémon; Keep it changes nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    await fromCounters('m');
    await judged();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from collection' }));
    });
    expect(confirm).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: 'Remove this Clodsire?' });
    expect(dialog).toHaveAccessibleDescription('It leaves your collection on this phone.');
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toHaveClass('ui-btn-danger');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest?.state.collection?.specimens.map((x) => x.id)).toEqual(IDS);
    expect(latest?.state.route).toEqual({ screen: 'specimen', id: 'm' });
    confirm.mockRestore();
  });

  it('removes a hand-added Pokémon and lands back on Counters when opened from there', async () => {
    await fromCounters('m');
    await judged();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from collection' }));
    });
    const dialog = screen.getByRole('alertdialog', { name: 'Remove this Clodsire?' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('counters'));
    expect(window.location.hash).toBe('#/counters');
    expect(latest?.state.collection?.specimens.map((x) => x.id)).toEqual(
      IDS.filter((x) => x !== 'm'),
    );
    expect((await storage.loadCollection())?.specimens.map((x) => x.id)).toEqual(
      IDS.filter((x) => x !== 'm'),
    );
  });

  it('takes the place of the Add form in history, so Back goes where Add was opened from', async () => {
    const added = specimen('n', 'clodsire', { manual: true });
    const manual = vi.fn(async () => ({
      specimen: added,
      level: 20,
      exactCp: true,
      matchedCp: 1400,
    }));
    await boot(undefined, { manual });
    await go({ screen: 'collection' });
    await go({ screen: 'add' });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search any Pokemon, e.g. shadow swampert'), {
        target: { value: 'clod' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clodsire' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('e.g. 1487'), { target: { value: '1400' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to my collection' }));
    });
    await waitFor(() => expect(latest?.state.route).toEqual({ screen: 'specimen', id: 'n' }));
    expect(window.location.hash).toBe('#/collection/n');
    expect(manual).toHaveBeenCalledOnce();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('collection'));
    expect(window.location.hash).toBe('#/collection');
  });

  it('shows the Empty state under the sub header for an unknown id', async () => {
    await boot();
    await go({ screen: 'specimen', id: 'nope' });
    const empty = document.querySelector('.ui-empty');
    expect(empty).toHaveTextContent('That Pokémon is not in the current collection.');
    const header = document.querySelector('header')!;
    expect(within(header).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(within(header).queryAllByRole('heading')).toHaveLength(0);
  });

  it('says judging failed, as Collection does, instead of "Judging..." forever', async () => {
    let fail: (e: Error) => void = () => undefined;
    await boot(() => new Promise((_, reject) => (fail = reject)));
    await go({ screen: 'specimen', id: 'b' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Judging each Pokémon'),
    );
    await act(async () => {
      fail(new Error('boom'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not judge this collection: boom. The list still works; verdicts will retry on the next import.',
    );
    expect(screen.queryByText('Judging...')).toBeNull();
    expect(document.querySelector('.ui-loading')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Azumarill' })).toBeInTheDocument();
  });

  it('on a fresh load of its link, shows Loading, not "not in the collection", until the collection is read', async () => {
    await seed();
    window.location.hash = '#/collection/b';
    render(
      <AppProvider host={fakeHost({ verdicts: vi.fn(async () => VERDICTS) })}>
        <Probe />
        <SpecimenScreen id="b" />
      </AppProvider>,
    );
    // First paint: the saved collection is still being read.
    expect(latest?.state.settingsLoaded).toBe(false);
    expect(document.querySelector('.ui-empty')).toBeNull();
    expect(screen.queryByText('That Pokémon is not in the current collection.')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your collection');
    const header = document.querySelector('header')!;
    expect(within(header).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Azumarill' })).toBeInTheDocument(),
    );
    expect(screen.queryByText('That Pokémon is not in the current collection.')).toBeNull();
  });

  it('shows Loading and no moves or cost while verdicts load, then fills in', async () => {
    let done: (v: Record<string, Verdict>) => void = () => undefined;
    await boot(() => new Promise((resolve) => (done = resolve)));
    await go({ screen: 'specimen', id: 'b' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Judging each Pokémon'),
    );
    expect(document.querySelector('.ui-loading')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Recommended moves' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cost to build' })).toBeNull();
    await act(async () => {
      done(VERDICTS);
    });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Recommended moves' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Cost to build' })).toBeInTheDocument();
    expect(document.querySelector('.ui-loading')).toBeNull();
    expect(document.querySelector('.verdict-tag')).toHaveAttribute(
      'data-verdict',
      'Worth building',
    );
  });
});
