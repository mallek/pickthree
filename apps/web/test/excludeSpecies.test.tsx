import 'fake-indexeddb/auto';
import type { RecommendOptions, Specimen, Verdict } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpecimenScreen } from '../src/screens/Specimen.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import {
  AppProvider,
  filterKey,
  useActions,
  useAppState,
  type AppState,
  type Route,
} from '../src/state/store.tsx';
import { resetHistoryForTests } from '../src/state/history.ts';
import { DEFAULT_SETTINGS, resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

function Gate() {
  const r = useAppState().route;
  return r.screen === 'specimen' ? <SpecimenScreen id={r.id} /> : null;
}

function specimen(id: string, speciesId: string, shadow = false): Specimen {
  return {
    id,
    speciesId,
    familyId: 'marill',
    ivs: { atk: 0, def: 15, sta: 15 },
    level: { min: 20, max: 20 },
    cp: 1400,
    hp: 150,
    shadow,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-20 12:00:00',
    raw: {},
  } as unknown as Specimen;
}

/** A verdict whose best build battles as `battles`. Only the fields the pages read. */
function verdict(sp: Specimen, battles: string | null): Verdict {
  return {
    specimenId: sp.id,
    label: battles ? 'Worth building' : 'Not eligible',
    line: 'A line.',
    build: battles
      ? {
          specimenId: sp.id,
          specimen: sp,
          speciesId: battles,
          shadow: sp.shadow,
          stageOffset: battles === sp.speciesId ? 0 : 1,
          level: 30,
          cp: 1498,
          ivs: sp.ivs,
          ivRank: { rank: 12, total: 4096 },
          needsXl: false,
        }
      : null,
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
 * Three Marill and one Azumarill that all battle as Azumarill, one Marill whose best build is
 * itself, and a Shadow Marill that battles as Shadow Azumarill.
 */
const SPECIMENS = [
  specimen('m1', 'marill'),
  specimen('m2', 'marill'),
  specimen('m3', 'marill'),
  specimen('z1', 'azumarill'),
  specimen('m4', 'marill'),
  specimen('s1', 'marill_shadow', true),
];
const VERDICTS: Record<string, Verdict> = {
  m1: verdict(SPECIMENS[0]!, 'azumarill'),
  m2: verdict(SPECIMENS[1]!, 'azumarill'),
  m3: verdict(SPECIMENS[2]!, 'azumarill'),
  z1: verdict(SPECIMENS[3]!, 'azumarill'),
  m4: verdict(SPECIMENS[4]!, 'marill'),
  s1: verdict(SPECIMENS[5]!, 'azumarill_shadow'),
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

/** fakeHost with Marill and the Shadow forms named, and the verdicts above. */
function host(verdicts: () => Promise<Record<string, Verdict>> = async () => VERDICTS) {
  const h = fakeHost({ verdicts: vi.fn(verdicts) });
  const ready = h.ready;
  h.ready = (async () => {
    const r = await ready();
    return {
      ...r,
      species: {
        ...r.species,
        marill: { name: 'Marill', types: ['water', 'fairy'], familyId: 'marill', dex: 183 },
        marill_shadow: {
          name: 'Marill (Shadow)',
          types: ['water', 'fairy'],
          familyId: 'marill',
          dex: 183,
        },
        azumarill_shadow: {
          name: 'Azumarill (Shadow)',
          types: ['water', 'fairy'],
          familyId: 'marill',
          dex: 184,
        },
      },
    };
  }) as typeof h.ready;
  return h;
}

async function boot(h = host()): Promise<void> {
  await seed();
  render(
    <AppProvider host={h}>
      <Probe />
      <Gate />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.leagueInfo).not.toBeNull();
  });
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

async function judgedAll(): Promise<void> {
  await waitFor(() => {
    expect(Object.keys(latest!.state.verdicts)).toHaveLength(SPECIMENS.length);
    expect(latest!.state.verdictsLoading).toBe(false);
  });
}

describe('Excluding the Pokémon as it battles', () => {
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

  it('names what the Pokémon battles as, and every copy it covers, largest group first', async () => {
    await boot();
    await go({ screen: 'specimen', id: 'm1' });
    await judgedAll();
    const sw = await screen.findByRole('switch', {
      name: 'Use Azumarill in team recommendations',
    });
    expect(sw).toHaveAccessibleDescription('Covers your 3 Marill and 1 Azumarill.');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).not.toBeDisabled();
  });

  it('reads one group alone, and keeps a Shadow form apart', async () => {
    await boot();
    await go({ screen: 'specimen', id: 's1' });
    await judgedAll();
    const sw = await screen.findByRole('switch', {
      name: 'Use Shadow Azumarill in team recommendations',
    });
    expect(sw).toHaveAccessibleDescription('Covers your 1 Shadow Marill.');
  });

  it('waits for the verdict before naming anything', async () => {
    let release: (v: Record<string, Verdict>) => void = () => undefined;
    const pending = new Promise<Record<string, Verdict>>((r) => {
      release = r;
    });
    await boot(host(() => pending));
    await go({ screen: 'specimen', id: 'm1' });
    await waitFor(() => expect(latest?.state.verdictsLoading).toBe(true));
    expect(screen.queryByRole('switch', { name: /Use .+ in team/ })).toBeNull();
    const waiting = screen.queryByRole('switch');
    if (waiting) {
      expect(waiting).toBeDisabled();
    }
    await act(async () => {
      release(VERDICTS);
    });
    await judgedAll();
    expect(
      screen.getByRole('switch', { name: 'Use Azumarill in team recommendations' }),
    ).not.toBeDisabled();
  });

  it('turning it off stores the battling species, and the next Teams run leaves it out', async () => {
    const h = host();
    await boot(h);
    await go({ screen: 'specimen', id: 'z1' });
    await judgedAll();
    const before = filterKey(latest!.state.settings);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('switch', { name: 'Use Azumarill in team recommendations' }),
      );
    });
    expect(latest?.state.settings.excludedSpecies).toEqual(['azumarill']);
    expect(latest?.state.settings.excludedSpecimenIds).toEqual([]);
    expect(filterKey(latest!.state.settings)).not.toBe(before);
    expect(
      screen.getByRole('switch', { name: 'Use Azumarill in team recommendations' }),
    ).toHaveAttribute('aria-checked', 'false');
    // Another copy that battles as Azumarill reads off too: it is the same Pokémon on a team.
    await go({ screen: 'specimen', id: 'm2' });
    expect(
      screen.getByRole('switch', { name: 'Use Azumarill in team recommendations' }),
    ).toHaveAttribute('aria-checked', 'false');
    // The Marill whose best build is itself is still in.
    await go({ screen: 'specimen', id: 'm4' });
    expect(
      screen.getByRole('switch', { name: 'Use Marill in team recommendations' }),
    ).toHaveAttribute('aria-checked', 'true');
    const recommend = h.recommend as unknown as ReturnType<typeof vi.fn>;
    recommend.mockClear();
    await act(async () => {
      await latest!.actions.runRecommend();
    });
    expect(recommend).toHaveBeenCalled();
    const opts = recommend.mock.calls.at(-1)![1] as Partial<RecommendOptions>;
    expect(opts.excludedSpecies).toEqual(['azumarill']);
    const saved = await storage.loadSettings();
    expect(saved.excludedSpecies).toEqual(['azumarill']);
  });

  it('shows no switch for a Pokémon that is not eligible in the league', async () => {
    await boot(host(async () => ({ ...VERDICTS, m4: verdict(SPECIMENS[4]!, null) })));
    await go({ screen: 'specimen', id: 'm4' });
    await judgedAll();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('Legacy per-copy exclusions', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    window.history.replaceState(null, '', window.location.pathname);
    latest = null;
  });

  it('convert once to the battling species when verdicts arrive, dropping ids that are gone', async () => {
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      excludedSpecimenIds: ['m1', 's1', 'gone', 'm4'],
    });
    const h = host(async () => ({ ...VERDICTS, m4: verdict(SPECIMENS[4]!, null) }));
    await boot(h);
    // No screen asked for verdicts: the provider asks, because the legacy list needs them.
    await waitFor(() => expect(latest?.state.settings.excludedSpecimenIds).toEqual([]));
    expect([...(latest?.state.settings.excludedSpecies ?? [])].sort()).toEqual([
      'azumarill',
      'azumarill_shadow',
    ]);
    const saved = await storage.loadSettings();
    expect(saved.excludedSpecimenIds).toEqual([]);
    expect([...(saved.excludedSpecies ?? [])].sort()).toEqual(['azumarill', 'azumarill_shadow']);
    expect(h.verdicts).toHaveBeenCalledTimes(1);
  });

  it('keep reaching the engine until they convert', async () => {
    await storage.saveSettings({ ...DEFAULT_SETTINGS, excludedSpecimenIds: ['m1'] });
    const h = host(() => new Promise(() => undefined));
    await boot(h);
    const recommend = h.recommend as unknown as ReturnType<typeof vi.fn>;
    await act(async () => {
      await latest!.actions.runRecommend();
    });
    const opts = recommend.mock.calls.at(-1)![1] as Partial<RecommendOptions>;
    expect(opts.excludedSpecimenIds).toEqual(['m1']);
    expect(opts.excludedSpecies).toEqual([]);
  });
});
