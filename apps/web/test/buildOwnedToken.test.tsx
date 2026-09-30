import 'fake-indexeddb/auto';
import type { Specimen, Verdict } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Build } from '../src/screens/Build.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import { resetHistoryForTests } from '../src/state/history.ts';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

function specimen(id: string, level: number): Specimen {
  return {
    id,
    speciesId: 'tinkaton',
    familyId: 'tinkaton',
    ivs: { atk: 0, def: 15, sta: 15 },
    level: { min: level, max: level },
    cp: level > 30 ? 2600 : 1400,
    hp: 150,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-20 12:00:00',
    raw: {},
  } as unknown as Specimen;
}

/** The engine's verdict for a Tinkaton that fits the league, or one over the cap (no build). */
function verdict(specimenId: string, fits: boolean): Verdict {
  return {
    specimenId,
    label: fits ? 'Worth building' : 'Not eligible',
    line: '',
    build: fits ? { speciesId: 'tinkaton', ivRank: { rank: 40, total: 4096 } } : null,
    moveset: null,
    cost: null,
    perfectDelta: null,
    perfectLine: null,
    metaWins: null,
    metaSize: 3,
    metaRank: null,
    formNote: null,
    ineligible: fits ? null : 'over-cap',
  } as unknown as Verdict;
}

// Collection order puts the one over the cap first, so a token that took the first Tinkaton it
// found would pick it, and analyze would throw "Tinkaton cannot fit under 1500 CP."
const HIGH = specimen('high', 40);
const LOW = specimen('low', 20);

async function seed(specimens: Specimen[]): Promise<void> {
  await storage.saveCollection({
    specimens,
    report: {
      scansRead: specimens.length,
      recognized: specimens.length,
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

async function open(
  specimens: Specimen[],
  verdicts: () => Promise<Record<string, Verdict>>,
): Promise<void> {
  await seed(specimens);
  render(
    <AppProvider host={fakeHost({ verdicts: vi.fn(verdicts) })}>
      <Probe />
      <Build />
    </AppProvider>,
  );
  await waitFor(() => expect(latest?.collection).not.toBeNull());
}

/** Open Lead, search Tinkaton and tap its token; returns the pick it put in the slot. */
async function pickTinkaton() {
  fireEvent.click(await screen.findByRole('button', { name: 'Lead, empty' }));
  fireEvent.change(await screen.findByPlaceholderText('Search any Pokémon for Lead'), {
    target: { value: 'tink' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Tinkaton' }));
  await waitFor(() => expect(latest?.picks[0]).not.toBeNull());
  return latest!.picks[0];
}

describe("Build's species token", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    resetHistoryForTests();
    latest = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('picks your Tinkaton that fits, not the one over the cap', async () => {
    await open([HIGH, LOW], async () => ({
      high: verdict('high', false),
      low: verdict('low', true),
    }));
    await waitFor(() => expect(Object.keys(latest?.verdicts ?? {})).toHaveLength(2));
    expect(await pickTinkaton()).toEqual({ kind: 'specimen', id: 'low' });
  });

  it('before the verdicts say which fit, the token prefers your copy that fits', async () => {
    // Verdicts that never arrive: nothing yet says the first Tinkaton is over the cap, so no
    // copy is named; analyze runs your best copy that fits (resolvePick's preferOwned).
    await open([HIGH, LOW], () => new Promise(() => {}));
    expect(await pickTinkaton()).toEqual({ kind: 'species', id: 'tinkaton', preferOwned: true });
  });

  it('with the verdicts failed, your copies still resolve through preferOwned', async () => {
    // recordError's device summary reads matchMedia, which jsdom does not implement.
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    await open([HIGH, LOW], async () => {
      throw new Error('worker died');
    });
    await waitFor(() => expect(latest?.verdictsError).not.toBeNull());
    expect(await pickTinkaton()).toEqual({ kind: 'species', id: 'tinkaton', preferOwned: true });
  });

  it('with none of yours fitting, the token is the top-10% stand-in', async () => {
    await open([HIGH], async () => ({ high: verdict('high', false) }));
    await waitFor(() => expect(Object.keys(latest?.verdicts ?? {})).toHaveLength(1));
    expect(await pickTinkaton()).toEqual({ kind: 'species', id: 'tinkaton' });
  });
});
