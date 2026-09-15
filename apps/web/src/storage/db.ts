import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ImportReport, Specimen } from '@pickthree/engine';

export interface StoredCollection {
  key: 'current';
  specimens: Specimen[];
  report: ImportReport;
  importedAt: string;
  fileName: string | null;
}

export interface Settings {
  key: 'current';
  theme: 'system' | 'dark' | 'light';
  filters: {
    noXl: boolean;
    noShadow: boolean;
    noEliteTm: boolean;
    budget: boolean;
    budgetCap: number;
    style: 'any' | 'balanced' | 'abb';
  };
  excludedSpecimenIds: string[];
  /** League id in play; absent in older saves means Great League. */
  league?: string;
  /** Pokémon pictures on the tokens. Absent in older saves means on. */
  sprites?: boolean;
  /** Anonymous error reports to the counter worker. Absent in older saves means on. */
  errorReports?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  key: 'current',
  theme: 'system',
  filters: {
    noXl: false,
    noShadow: false,
    noEliteTm: false,
    budget: false,
    budgetCap: 250_000,
    style: 'any',
  },
  excludedSpecimenIds: [],
  league: 'great',
  errorReports: true,
};

interface PickThreeDb extends DBSchema {
  collection: { key: 'current'; value: StoredCollection };
  settings: { key: 'current'; value: Settings };
}

let dbPromise: Promise<IDBPDatabase<PickThreeDb>> | null = null;

function db(): Promise<IDBPDatabase<PickThreeDb>> {
  if (!dbPromise) {
    dbPromise = openDB<PickThreeDb>('pickthree', 1, {
      upgrade(d) {
        d.createObjectStore('collection', { keyPath: 'key' });
        d.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const storage = {
  loadCollection(): Promise<StoredCollection | null> {
    return safe(async () => (await (await db()).get('collection', 'current')) ?? null, null);
  },
  saveCollection(c: Omit<StoredCollection, 'key'>): Promise<void> {
    return safe(async () => {
      await (await db()).put('collection', { key: 'current', ...c });
    }, undefined);
  },
  loadSettings(): Promise<Settings> {
    return safe(
      async () => (await (await db()).get('settings', 'current')) ?? DEFAULT_SETTINGS,
      DEFAULT_SETTINGS,
    );
  },
  saveSettings(s: Settings): Promise<void> {
    return safe(async () => {
      await (await db()).put('settings', { ...s, key: 'current' });
    }, undefined);
  },
  async forget(): Promise<void> {
    await safe(async () => {
      const d = await db();
      await d.clear('collection');
      await d.clear('settings');
    }, undefined);
  },
};
