import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BattleSet, ImportReport, Specimen } from '@pickthree/engine';

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
  /**
   * Community meta sharing. Absent in older saves means on. The device id is made once, on
   * the phone, and is the only handle the worker has for what this phone sent.
   */
  share?: {
    enabled?: boolean;
    device?: string;
    band?: 'below' | 'ace' | 'veteran' | 'expert' | 'legend' | null;
  };
  /** Battle log settings. Absent in older saves means the blend is on and nothing is fresh. */
  yourMeta?: {
    /** Weight Teams, Counters and Build by the log once it has enough battles. Default true. */
    blend?: boolean;
    /** League id to ISO time: battles before it belong to earlier seasons. */
    freshFrom?: Record<string, string>;
  };
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
  battles: { key: string; value: BattleSet; indexes: { 'by-league': string } };
}

export const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<PickThreeDb>> | null = null;

function db(): Promise<IDBPDatabase<PickThreeDb>> {
  if (!dbPromise) {
    dbPromise = openDB<PickThreeDb>('pickthree', DB_VERSION, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('collection', { keyPath: 'key' });
          d.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          const battles = d.createObjectStore('battles', { keyPath: 'id' });
          battles.createIndex('by-league', 'league');
        }
      },
    });
  }
  return dbPromise;
}

/** Tests swap the IndexedDB factory between cases; drop the cached connection with it. */
export function resetDbForTests(): void {
  dbPromise = null;
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
  /** Every set for one league, oldest first. */
  loadSets(league: string): Promise<BattleSet[]> {
    return safe(async () => {
      const all = await (await db()).getAllFromIndex('battles', 'by-league', league);
      return all.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    }, []);
  },
  /** Throws when the write fails: a lost battle must reach the player, unlike a lost setting. */
  async saveSet(set: BattleSet): Promise<void> {
    await (await db()).put('battles', set);
  },
  loadAllSets(): Promise<BattleSet[]> {
    return safe(async () => (await db()).getAll('battles'), []);
  },
  /** Adds sets whose id is unknown; existing sets are never touched. */
  importSets(sets: BattleSet[]): Promise<{ added: number; skipped: number }> {
    return safe(
      async () => {
        const d = await db();
        const tx = d.transaction('battles', 'readwrite');
        let added = 0;
        let skipped = 0;
        for (const s of sets) {
          if (await tx.store.get(s.id)) {
            skipped += 1;
          } else {
            await tx.store.add(s);
            added += 1;
          }
        }
        await tx.done;
        return { added, skipped };
      },
      { added: 0, skipped: 0 },
    );
  },
  clearSets(): Promise<void> {
    return safe(async () => {
      await (await db()).clear('battles');
    }, undefined);
  },
  async forget(): Promise<void> {
    await safe(async () => {
      const d = await db();
      await d.clear('collection');
      await d.clear('settings');
      await d.clear('battles');
    }, undefined);
  },
};
