import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ImportReport, Specimen } from '@pickthree/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyLayoutValue } from '../src/format.ts';
import { Report } from '../src/screens/Report.tsx';
import { AppProvider, useAppState } from '../src/state/store.tsx';
import type { AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: AppState | null = null;

/** Report sends a player with no collection to Welcome, so it mounts once the save has loaded. */
function Probe() {
  latest = useAppState();
  return latest.collection ? <Report /> : null;
}

const REPORT: ImportReport = {
  scansRead: 9,
  recognized: 7,
  duplicatesMerged: 2,
  missingIvs: { count: 0, names: [] },
  unrecognized: [],
  rowProblems: [],
  layout: emptyLayoutValue(),
  newestScan: null,
};

function eevee(id: string): Specimen {
  return {
    id,
    speciesId: 'eevee',
    familyId: null,
    ivs: { atk: 1, def: 15, sta: 13 },
    level: { min: 14, max: 14 },
    cp: 400,
    hp: 80,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-01 10:00',
    raw: {} as Specimen['raw'],
  };
}

async function mount(report: ImportReport): Promise<void> {
  await storage.saveCollection({
    specimens: [eevee('k'), eevee('j')],
    report,
    importedAt: '2026-09-16T00:00:00Z',
    fileName: 'scan.csv',
  });
  render(
    <AppProvider host={fakeHost()}>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.boot).toBe('ready');
    expect(latest?.collection).not.toBeNull();
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  window.location.hash = '';
  latest = null;
});

describe('Report', () => {
  it('a first import shows no merge rows', async () => {
    await mount(REPORT);
    expect(await screen.findByText('Duplicate scans')).toBeTruthy();
    expect(screen.queryByText('Merged')).toBeNull();
    expect(screen.queryByText('Not in this scan')).toBeNull();
    expect(screen.getByText(/7 Pok.mon ready to build teams from/)).toBeTruthy();
  });

  it('a re-import says what was new, merged, skipped and missing', async () => {
    await mount({
      ...REPORT,
      merge: { added: 2, merged: 5, updated: 1, skipped: 3, notInScan: ['k'] },
    });
    expect(await screen.findByText('New')).toBeTruthy();
    expect(screen.getByText('Merged')).toBeTruthy();
    expect(screen.getByText(/1 updated by a newer scan/)).toBeTruthy();
    expect(screen.getByText('Skipped (deleted)')).toBeTruthy();
    expect(screen.getByText('Not in this scan')).toBeTruthy();
    // The headline counts the collection after the merge, not the rows in the file.
    expect(screen.getByText(/2 Pok.mon ready to build teams from/)).toBeTruthy();
  });

  it('Remove them asks first, then removes what the scan lacked', async () => {
    await mount({
      ...REPORT,
      merge: { added: 0, merged: 1, updated: 0, skipped: 0, notInScan: ['k'] },
    });
    fireEvent.click(await screen.findByText('Not in this scan'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove them' }));
    expect(latest?.collection?.specimens).toHaveLength(2);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/Remove 1 Pok.mon\?/);
    const confirm = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent === 'Remove them',
    ) as HTMLButtonElement;
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(latest?.collection?.specimens.map((s) => s.id)).toEqual(['j']);
    });
    expect(latest?.collection?.report.merge?.notInScan).toEqual([]);
    expect(latest?.collection?.removed).toHaveLength(1);
  });
});
