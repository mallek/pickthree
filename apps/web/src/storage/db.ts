import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { EMPTY_ACHIEVEMENTS, type AchievementsRecord } from '@pickthree/engine';
import type {
  BattleSet,
  FacingSource,
  ImportReport,
  PinMap,
  RemovedMark,
  Specimen,
} from '@pickthree/engine';
import type { WindowKey } from '@pickthree/engine/meta';
import type { ThemeChoice } from '@pickthree/ui';
import { recordError } from '../diag.ts';

export interface StoredCollection {
  key: 'current';
  specimens: Specimen[];
  report: ImportReport;
  importedAt: string;
  fileName: string | null;
  /**
   * Added 2026-10-01. Pokémon the player removed; an import skips scan rows matching one. Absent
   * in older saves means none.
   */
  removed?: RemovedMark[];
  /**
   * Added 2026-10-01. League id to that league's pins (battling species to a Pokémon id, or null
   * for unpinned). Absent means every species uses the default pick.
   */
  pins?: Record<string, PinMap>;
}

export interface Settings {
  key: 'current';
  theme: ThemeChoice;
  filters: {
    noXl: boolean;
    noShadow: boolean;
    noEliteTm: boolean;
    budget: boolean;
    budgetCap: number;
    style: 'any' | 'balanced' | 'abb';
  };
  /**
   * Legacy per-copy exclusions, from before exclusion went by the Pokémon as it battles. Read only
   * to convert: once verdicts are in, each id becomes its specimen's best-build species in
   * excludedSpecies and the list is emptied. Until then the engine still honors it.
   */
  excludedSpecimenIds: string[];
  /**
   * Added 2026-09-27. Battling species ids (a build's speciesId, so a Shadow form is its own id)
   * left out of team recommendations, from every copy. Absent in older saves means none.
   */
  excludedSpecies?: string[];
  /**
   * Added 2026-09-30. Absent means false: the player has not chosen to start without a
   * collection. Set by Welcome's third button; with no collection it routes boot to Meta.
   */
  startedWithout?: boolean;
  /** League id in play; absent in older saves means Great League. */
  league?: string;
  /** Added 2026-09-29. GO Battle League cup runs already nudged, as `<league>@<run start>`,
   *  newest last, at most 20. Absent in older saves means none. */
  nudged?: string[];
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
    /**
     * Retired 2026-09-26: no longer asked or sent; older saves may hold a value, which is
     * ignored.
     */
    band?: 'below' | 'ace' | 'veteran' | 'expert' | 'legend' | null;
  };
  /** Battle log settings. Absent in older saves means the blend is on and nothing is fresh. */
  yourMeta?: {
    /**
     * Weight Teams, Counters and Build by the log once it has enough battles. Default true.
     * Read only for migration; the Source picker replaced it.
     */
    blend?: boolean;
    /** League id to ISO time: battles before it belong to earlier seasons. */
    freshFrom?: Record<string, string>;
  };
  /**
   * Whose opponents Teams, Counters and Build weight. Absent in older saves: the source reads as
   * Your meta (the log source) unless yourMeta.blend was false (then PvPoke), and the window as This meta.
   */
  facing?: {
    source?: FacingSource;
    window?: WindowKey;
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
  excludedSpecies: [],
  league: 'great',
  errorReports: true,
};

interface PickThreeDb extends DBSchema {
  collection: { key: 'current'; value: StoredCollection };
  settings: { key: 'current'; value: Settings };
  battles: { key: string; value: BattleSet; indexes: { 'by-league': string } };
  achievements: { key: 'current'; value: AchievementsRecord & { key: 'current' } };
}

export const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<PickThreeDb>> | null = null;

let blockedNow = false;
/** Bumped by every forget, before anything is cleared: work started before it is stale. */
let generation = 0;
const blockedListeners = new Set<() => void>();

/**
 * Called when an upgrade waits on another pick3 tab still holding an older version open. The
 * store shows "Close other pick3 tabs to finish updating." Returns the unsubscribe.
 */
export function onDbBlocked(listener: () => void): () => void {
  blockedListeners.add(listener);
  return () => {
    blockedListeners.delete(listener);
  };
}

/** True while an upgrade is waiting on another tab, cleared once it opens. */
export function dbBlocked(): boolean {
  return blockedNow;
}

function db(): Promise<IDBPDatabase<PickThreeDb>> {
  if (!dbPromise) {
    const opening: Promise<IDBPDatabase<PickThreeDb>> = openDB<PickThreeDb>(
      'pickthree',
      DB_VERSION,
      {
        upgrade(d, oldVersion) {
          if (oldVersion < 1) {
            d.createObjectStore('collection', { keyPath: 'key' });
            d.createObjectStore('settings', { keyPath: 'key' });
          }
          if (oldVersion < 2) {
            const battles = d.createObjectStore('battles', { keyPath: 'id' });
            battles.createIndex('by-league', 'league');
          }
          if (oldVersion < 3) {
            d.createObjectStore('achievements', { keyPath: 'key' });
          }
        },
        // Another tab holds an older version open: every read and write waits until it closes.
        blocked(current, wanted) {
          blockedNow = true;
          for (const l of blockedListeners) {
            l();
          }
          try {
            recordError('db-blocked', new Error(`upgrade ${current} to ${wanted} waits on a tab`));
          } catch {
            // diagnostics are best effort
          }
        },
        // Another tab wants a newer version: let go so it can upgrade, and reopen on next use.
        blocking() {
          if (dbPromise === opening) {
            dbPromise = null;
          }
          void opening.then((d) => d.close()).catch(() => undefined);
        },
      },
    );
    dbPromise = opening;
    void opening.then(
      () => {
        blockedNow = false;
      },
      () => undefined,
    );
  }
  return dbPromise;
}

/** Tests swap the IndexedDB factory between cases; drop the cached connection with it. */
export function resetDbForTests(): void {
  dbPromise = null;
  blockedNow = false;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** A fresh empty record: EMPTY_ACHIEVEMENTS is shared, so callers never get its arrays. */
function emptyAchievements(): AchievementsRecord {
  return { earned: [...EMPTY_ACHIEVEMENTS.earned], marks: [...EMPTY_ACHIEVEMENTS.marks] };
}

/**
 * An imported record folded into the stored one: earned ids the phone lacks are added, a clash
 * keeps the phone's own Pokemon, marks are the union.
 */
export function mergeAchievementRecords(
  stored: AchievementsRecord,
  incoming: AchievementsRecord,
): AchievementsRecord {
  const have = new Set(stored.earned.map((e) => e.id));
  const owned = new Set(stored.earned.map((e) => e.species));
  const added = incoming.earned.filter((e) => {
    if (have.has(e.id) || owned.has(e.species)) {
      return false;
    }
    // Incoming entries are checked against each other too, so a tampered file cannot repeat one.
    have.add(e.id);
    owned.add(e.species);
    return true;
  });
  return {
    earned: [...stored.earned, ...added],
    marks: [...new Set([...stored.marks, ...incoming.marks])],
  };
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
  loadAchievements(): Promise<AchievementsRecord> {
    return safe(async () => {
      const r = await (await db()).get('achievements', 'current');
      return r ? { earned: [...r.earned], marks: [...r.marks] } : emptyAchievements();
    }, emptyAchievements());
  },
  /** False when the phone refused the write: the caller must not announce what was not kept. */
  saveAchievements(r: AchievementsRecord): Promise<boolean> {
    return safe(async () => {
      await (await db()).put('achievements', { key: 'current', earned: r.earned, marks: r.marks });
      return true;
    }, false);
  },
  /**
   * Read, change and write the record in one readwrite transaction, so two callers cannot lose
   * each other's change. fn must be synchronous: an await on anything but IndexedDB closes the
   * transaction. Resolves the saved record, or null when anything failed (nothing was written).
   */
  updateAchievements(
    fn: (current: AchievementsRecord) => AchievementsRecord,
  ): Promise<AchievementsRecord | null> {
    return safe<AchievementsRecord | null>(async () => {
      const tx = (await db()).transaction('achievements', 'readwrite');
      const r = await tx.store.get('current');
      const next = fn(r ? { earned: [...r.earned], marks: [...r.marks] } : emptyAchievements());
      await tx.store.put({ key: 'current', earned: next.earned, marks: next.marks });
      await tx.done;
      return next;
    }, null);
  },
  async mergeAchievements(incoming: AchievementsRecord): Promise<void> {
    await storage.updateAchievements((cur) => mergeAchievementRecords(cur, incoming));
  },
  /** Changes on every forget. A job that read it before must not write what it worked out. */
  generation(): number {
    return generation;
  },
  async forget(): Promise<void> {
    generation += 1;
    await safe(async () => {
      const d = await db();
      await d.clear('collection');
      await d.clear('settings');
      await d.clear('battles');
      await d.clear('achievements');
    }, undefined);
  },
};
