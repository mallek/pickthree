import 'fake-indexeddb/auto';
import type { MoveChoice, Specimen, Verdict, VerdictLabel } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  build: {
    level: number;
    stageOffset?: number;
    baseLevel?: number;
    baseCp?: number;
    mega?: { ready: boolean; level4: boolean };
  },
  cost: {
    stardust: number;
    candy: number;
    xlCandy: number;
    secondMoveUnlock?: boolean;
    megaEnergy?: 'needed' | 'ready';
  },
): Verdict {
  const v = {
    specimenId: sp.id,
    label,
    line: `${label} line for ${sp.id}.`,
    buildSpecies: [sp.speciesId],
    megaBuilds: [] as unknown[],
    build: {
      specimenId: sp.id,
      specimen: sp,
      speciesId: sp.speciesId,
      shadow: false,
      stageOffset: build.stageOffset ?? 0,
      level: build.level,
      cp: 1498,
      baseCp: build.baseCp ?? 1498,
      baseLevel: build.baseLevel ?? build.level,
      mega: build.mega ?? null,
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
      megaEnergy: cost.megaEnergy ?? null,
      weight: 0,
    },
    perfectDelta: null,
    perfectLine: null,
    metaWins: null,
    metaSize: 3,
    metaRank: null,
    formNote: null,
    ineligible: null,
  };
  if (v.build.mega) {
    v.megaBuilds = [v.build];
  }
  return v as unknown as Verdict;
}

/** Tinkaton, already built; Azumarill, worth powering up; Clodsire, typed in by hand; Medicham,
 * at its build level but still needing its second move; Dragonite, Built half a level short. */
const BUILT = specimen('a', 'tinkaton');
const BUILDING = specimen('b', 'azumarill');
const MANUAL = specimen('m', 'clodsire', { manual: true });
const UNLOCK = specimen('u', 'medicham');
const HALF = specimen('h', 'dragonite_shadow');
const MEGA = specimen('g', 'tinkaton', { level: 40 });
/** Marked as a Mega Sableye (its Mega is a supermega), and a marked Tinkaton (its Mega is not). */
const MARKED = {
  ...specimen('k', 'sableye', { level: 30 }),
  megaForm: 'mega',
} as Specimen;
const MARKED_PLAIN = {
  ...specimen('p', 'tinkaton', { level: 30 }),
  megaForm: 'mega',
} as Specimen;
/** Sableye whose best build is its base form, with a Mega build beside it all the same. */
const UNMARKED = specimen('s', 'sableye', { level: 20 });
const SPECIMENS = [BUILT, BUILDING, MANUAL, UNLOCK, HALF, MEGA, MARKED, MARKED_PLAIN, UNMARKED];
const IDS = SPECIMENS.map((x) => x.id);

/** A Mega build of Sableye: the Mega species battles, the base form is what gets powered up. */
function megaVerdict(sp: Specimen): Verdict {
  const v = verdict(
    sp,
    'Built',
    { level: 30, baseLevel: 30, baseCp: 1300, mega: { ready: true, level4: false } },
    { stardust: 0, candy: 0, xlCandy: 0, megaEnergy: 'ready' },
  );
  const build = { ...v.build!, speciesId: 'sableye_mega', cp: 1498 };
  return { ...v, build, megaBuilds: [build] } as Verdict;
}

function baseBestVerdict(sp: Specimen): Verdict {
  const v = verdict(
    sp,
    'Worth building',
    { level: 25 },
    { stardust: 10000, candy: 10, xlCandy: 0 },
  );
  const mega = {
    speciesId: 'sableye_mega',
    level: 27.5,
    cp: 1475,
    baseCp: 1118,
    baseLevel: 27.5,
    mega: { ready: false, level4: false },
  };
  return { ...v, megaBuilds: [mega] } as Verdict;
}

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
  // A Level 4 Mega: battles two levels above the level it was powered to.
  k: megaVerdict(MARKED),
  s: baseBestVerdict(UNMARKED),
  p: verdict(MARKED_PLAIN, 'Built', { level: 30 }, { stardust: 0, candy: 0, xlCandy: 0 }),
  g: verdict(
    MEGA,
    'Built',
    { level: 42, baseLevel: 40, baseCp: 1200, mega: { ready: true, level4: true } },
    { stardust: 0, candy: 0, xlCandy: 0, megaEnergy: 'ready' },
  ),
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

/** Sableye and its Mega (a supermega), Tinkaton and its Mega (not one), on top of the fake data. */
function withMegas(): Parameters<typeof fakeHost>[0] {
  const base = fakeHost();
  return {
    ready: vi.fn(async () => {
      const r = await base.ready();
      const sp = (name: string, id: string, extra: object = {}) => ({
        name,
        types: ['dark', 'ghost'] as ['dark', 'ghost'],
        familyId: id,
        dex: 302,
        ...extra,
      });
      return {
        ...r,
        species: {
          ...r.species,
          sableye: sp('Sableye', 'sableye'),
          sableye_mega: sp('Sableye (Mega)', 'sableye', { megaOf: 'sableye', superMega: true }),
          tinkaton_mega: sp('Tinkaton (Mega)', 'tinkaton', { megaOf: 'tinkaton' }),
        },
        allSpecies: [...r.allSpecies, 'sableye', 'sableye_mega'],
      };
    }),
  };
}

async function mount(
  verdicts: () => Promise<Record<string, Verdict>> = async () => VERDICTS,
  more: Parameters<typeof fakeHost>[0] = {},
): Promise<void> {
  await seed();
  render(
    <AppProvider host={fakeHost({ verdicts: vi.fn(verdicts), ...withMegas(), ...more })}>
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

  it('for a Mega build, reads the base level and CP, and names the Mega Energy cost', async () => {
    await fromCounters('g');
    await judged();
    expect(screen.getByText('Already at level 40.')).toBeInTheDocument();
    expect(screen.queryByText(/Level 40 to/)).toBeNull();
    expect(screen.getByText('Power up to CP 1200 (1498 as Mega, Level 4)')).toBeInTheDocument();
    expect(screen.getByText('Mega Energy (mega-evolved before)')).toBeInTheDocument();
  });

  it('shows the Mega build beside the base build: the Mega token and the base CP power-up line', async () => {
    await fromCounters('k');
    await judged();
    const block = screen.getByRole('group', { name: 'Mega build' });
    expect(within(block).getByText('Mega Sableye')).toBeInTheDocument();
    expect(block.querySelector('.token-mega-pill')?.textContent).toBe('Mega');
    expect(within(block).getByText('Power up to CP 1300 (1498 as Mega)')).toBeInTheDocument();
    expect(screen.getAllByText('Power up to CP 1300 (1498 as Mega)')).toHaveLength(1);
  });

  it('lists the Mega build when the best build is the base form', async () => {
    await fromCounters('s');
    await judged();
    const block = screen.getByRole('group', { name: 'Mega build' });
    expect(within(block).getByText('Mega Sableye')).toBeInTheDocument();
    expect(within(block).getByText('Power up to CP 1118 (1475 as Mega)')).toBeInTheDocument();
  });

  it('offers Mega Level 4 for a marked Mega whose Mega is a supermega, and saves it', async () => {
    await fromCounters('k');
    await judged();
    const sw = screen.getByRole('switch', { name: 'Mega Level 4' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      fireEvent.click(sw);
    });
    await waitFor(() =>
      expect(latest?.state.collection?.specimens.find((x) => x.id === 'k')?.megaLevel4).toBe(true),
    );
    const saved = await storage.loadCollection();
    expect(saved?.specimens.find((x) => x.id === 'k')?.megaLevel4).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Mega Level 4' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Mega Level 4' }));
    });
    await waitFor(() =>
      expect(latest?.state.collection?.specimens.find((x) => x.id === 'k')?.megaLevel4).toBe(false),
    );
  });

  it('re-judges after the Level 4 toggle: verdicts clear and load again', async () => {
    const verdicts = vi.fn(async () => VERDICTS);
    await mount(verdicts);
    await waitFor(() => expect(latest?.state.route.screen).toBe('teams'));
    await go({ screen: 'specimen', id: 'k' });
    await judged();
    const before = verdicts.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Mega Level 4' }));
    });
    await waitFor(() => expect(verdicts.mock.calls.length).toBeGreaterThan(before));
  });

  it('has no Mega Level 4 switch for a Pokemon that is not a marked supermega', async () => {
    for (const id of ['a', 'p']) {
      await fromCounters(id);
      await judged();
      expect(screen.queryByRole('switch', { name: 'Mega Level 4' })).toBeNull();
      cleanup();
      globalThis.indexedDB = new IDBFactory();
      resetDbForTests();
      resetHistoryForTests();
      window.history.replaceState(null, '', window.location.pathname);
    }
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

  it('flips "Use Azumarill in team recommendations" in place, with nothing fixed over the page', async () => {
    await fromCounters('b');
    await judged();
    const label = 'Use Azumarill in team recommendations';
    const sw = await screen.findByRole('switch', { name: label });
    await waitFor(() => expect(sw).toHaveAccessibleDescription('Covers your 1 Azumarill.'));
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(latest?.state.settings.excludedSpecies).toEqual(['azumarill']);
    expect(latest?.state.settings.excludedSpecimenIds).toEqual([]);
    expect(screen.getByRole('switch', { name: label })).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: label }));
    });
    expect(latest?.state.settings.excludedSpecies).toEqual([]);
    expect(screen.getByRole('switch', { name: label })).toHaveAttribute('aria-checked', 'true');
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

  it('takes an empty verdict answer as the answer, not a reason to ask again', async () => {
    // Screens ask whenever verdicts are empty. Without a guard an empty answer sent them straight
    // back, over and over, until something else broke the loop.
    const verdicts = vi.fn(async () => ({}));
    await boot(verdicts);
    await go({ screen: 'specimen', id: 'b' });
    await go({ screen: 'collection' });
    await go({ screen: 'specimen', id: 'a' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(verdicts).toHaveBeenCalledTimes(1);
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

/** Species for the Add form's Mega marks: one Mega (Tinkaton, from the fake data), two (Charizard),
 * a supermega pair (Mewtwo), and a shadow. */
function addMegaSpecies(): Parameters<typeof fakeHost>[0] {
  const base = withMegas() as { ready: ReturnType<typeof fakeHost>['ready'] };
  return {
    ...base,
    ready: vi.fn(async () => {
      const r = await base.ready();
      const sp = (name: string, id: string, extra: object = {}) => ({
        name,
        types: ['fire', 'flying'] as ['fire', 'flying'],
        familyId: id,
        dex: 6,
        ...extra,
      });
      return {
        ...r,
        species: {
          ...r.species,
          charizard: sp('Charizard', 'charizard'),
          charizard_mega_x: sp('Charizard (Mega X)', 'charizard', { megaOf: 'charizard' }),
          charizard_mega_y: sp('Charizard (Mega Y)', 'charizard', { megaOf: 'charizard' }),
          mewtwo: sp('Mewtwo', 'mewtwo'),
          mewtwo_mega_x: sp('Mewtwo (Mega X)', 'mewtwo', { megaOf: 'mewtwo', superMega: true }),
          mewtwo_mega_y: sp('Mewtwo (Mega Y)', 'mewtwo', { megaOf: 'mewtwo', superMega: true }),
          bulbasaur: sp('Bulbasaur', 'bulbasaur'),
        },
        allSpecies: [...r.allSpecies, 'charizard', 'mewtwo', 'bulbasaur'],
      };
    }),
  };
}

describe('Add Pokemon Mega marks', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    window.history.replaceState(null, '', window.location.pathname);
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    latest = null;
  });

  const manual = () =>
    vi.fn(async (input: { speciesId: string }) => ({
      specimen: specimen('n', input.speciesId, { manual: true }),
      level: 20,
      exactCp: true,
      matchedCp: 1400,
    }));

  async function openAdd(m: ReturnType<typeof manual>, pick: string, term: string): Promise<void> {
    await boot(undefined, { manual: m as never, ...addMegaSpecies() });
    await go({ screen: 'add' });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search any Pokemon, e.g. shadow swampert'), {
        target: { value: term },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: pick }));
    });
  }

  async function save(): Promise<void> {
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('e.g. 1487'), { target: { value: '1400' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to my collection' }));
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('specimen'));
  }

  const saved = async () => (await storage.loadCollection())!.specimens.find((x) => x.id === 'n')!;

  it('offers a checkbox for a species with one Mega, and saves megaForm mega', async () => {
    await openAdd(manual(), 'Tinkaton', 'tinkaton');
    const box = screen.getByRole('checkbox', { name: 'Mega-evolved before' });
    expect(screen.queryByRole('checkbox', { name: 'Mega Level 4' })).toBeNull();
    await act(async () => {
      fireEvent.click(box);
    });
    expect(screen.queryByRole('checkbox', { name: 'Mega Level 4' })).toBeNull();
    await save();
    expect((await saved()).megaForm).toBe('mega');
    expect((await saved()).megaLevel4).toBeUndefined();
  });

  it('saves no mark when the box is left alone', async () => {
    await openAdd(manual(), 'Tinkaton', 'tinkaton');
    await save();
    expect((await saved()).megaForm ?? null).toBeNull();
  });

  it('offers none, Mega X and Mega Y for a species with two, and saves the choice', async () => {
    await openAdd(manual(), 'Charizard', 'charizard');
    const pick = screen.getByRole('combobox', { name: 'Mega-evolved before' });
    expect(
      within(pick)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No', 'Mega X', 'Mega Y']);
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'mega_y' } });
    });
    await save();
    expect((await saved()).megaForm).toBe('mega_y');
  });

  it('shows no control for a species with no Mega', async () => {
    await openAdd(manual(), 'Bulbasaur', 'bulbasaur');
    expect(screen.queryByLabelText('Mega-evolved before')).toBeNull();
  });

  it('shows no control for a shadow', async () => {
    await openAdd(manual(), 'Shadow Dragonite', 'shadow dragonite');
    expect(screen.queryByLabelText('Mega-evolved before')).toBeNull();
  });

  it('offers Mega Level 4 only once a supermega form is chosen, and saves it', async () => {
    await openAdd(manual(), 'Mewtwo', 'mewtwo');
    const pick = screen.getByRole('combobox', { name: 'Mega-evolved before' });
    expect(screen.queryByRole('checkbox', { name: 'Mega Level 4' })).toBeNull();
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'mega_y' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mega Level 4' }));
    });
    await save();
    const sp = await saved();
    expect(sp.megaForm).toBe('mega_y');
    expect(sp.megaLevel4).toBe(true);
  });

  it('drops Mega Level 4 when the mark is cleared', async () => {
    await openAdd(manual(), 'Mewtwo', 'mewtwo');
    const pick = screen.getByRole('combobox', { name: 'Mega-evolved before' });
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'mega_x' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mega Level 4' }));
    });
    await act(async () => {
      fireEvent.change(pick, { target: { value: '' } });
    });
    expect(screen.queryByRole('checkbox', { name: 'Mega Level 4' })).toBeNull();
    await save();
    const sp = await saved();
    expect(sp.megaForm ?? null).toBeNull();
    expect(sp.megaLevel4).toBeUndefined();
  });
});
