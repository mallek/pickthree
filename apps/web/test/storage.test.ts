import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import type { AchievementsRecord, BattleSet } from '@pickthree/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { mergeAchievementRecords, resetDbForTests, storage } from '../src/storage/db.ts';

function set(id: string, league = 'great', closed = false): BattleSet {
  return {
    id,
    league,
    startedAt: '2026-09-10T10:00:00Z',
    team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
    battles: [],
    closed,
  };
}

describe('battle log storage', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });

  it('upgrades a version 1 database and keeps the collection', async () => {
    const v1 = await openDB('pickthree', 1, {
      upgrade(d) {
        d.createObjectStore('collection', { keyPath: 'key' });
        d.createObjectStore('settings', { keyPath: 'key' });
      },
    });
    await v1.put('collection', {
      key: 'current',
      specimens: [],
      report: {},
      importedAt: '2026-09-01T00:00:00Z',
      fileName: 'x.csv',
    });
    v1.close();
    const c = await storage.loadCollection();
    expect(c?.fileName).toBe('x.csv');
    expect(await storage.loadSets('great')).toEqual([]);
  });

  it('saves sets per league and lists them oldest first', async () => {
    await storage.saveSet({ ...set('b'), startedAt: '2026-09-12T10:00:00Z' });
    await storage.saveSet(set('a'));
    await storage.saveSet(set('u', 'ultra'));
    expect((await storage.loadSets('great')).map((s) => s.id)).toEqual(['a', 'b']);
    expect((await storage.loadSets('ultra')).map((s) => s.id)).toEqual(['u']);
    expect((await storage.loadAllSets()).length).toBe(3);
  });

  it('imports only unknown set ids', async () => {
    await storage.saveSet(set('a'));
    const r = await storage.importSets([set('a', 'great', true), set('c')]);
    expect(r).toEqual({ added: 1, skipped: 1 });
    const got = await storage.loadSets('great');
    expect(got.map((s) => s.id)).toEqual(['a', 'c']);
    expect(got[0]?.closed).toBe(false);
  });

  it('forget clears the log too', async () => {
    await storage.saveSet(set('a'));
    await storage.forget();
    expect(await storage.loadAllSets()).toEqual([]);
  });
});

describe('collection storage', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });

  it('a save from before pins and marks loads without them', async () => {
    await storage.saveCollection({
      specimens: [],
      report: {} as never,
      importedAt: '2026-09-01T00:00:00Z',
      fileName: 'old.csv',
    });
    const c = await storage.loadCollection();
    expect(c?.fileName).toBe('old.csv');
    expect(c?.removed).toBeUndefined();
    expect(c?.pins).toBeUndefined();
  });

  it('round-trips pins and removed marks', async () => {
    const removed = [{ key: 'n|1/2/3', speciesId: 'eevee', removedAt: '2026-10-01 12:00:00' }];
    const pins = { great: { umbreon: 'abc', medicham: null } };
    await storage.saveCollection({
      specimens: [],
      report: {} as never,
      importedAt: '2026-09-01T00:00:00Z',
      fileName: null,
      removed,
      pins,
    });
    const c = await storage.loadCollection();
    expect(c?.removed).toEqual(removed);
    expect(c?.pins).toEqual(pins);
  });
});

describe('achievements storage', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });

  it('upgrades a version 2 database and keeps the battles', async () => {
    const v2 = await openDB('pickthree', 2, {
      upgrade(d) {
        d.createObjectStore('collection', { keyPath: 'key' });
        d.createObjectStore('settings', { keyPath: 'key' });
        d.createObjectStore('battles', { keyPath: 'id' }).createIndex('by-league', 'league');
      },
    });
    await v2.put('battles', set('kept'));
    v2.close();
    expect((await storage.loadAllSets()).map((s) => s.id)).toEqual(['kept']);
    expect(await storage.loadAchievements()).toEqual({ earned: [], marks: [] });
  });

  it('saves and loads the record, and forget clears it', async () => {
    const rec = {
      earned: [
        { id: 'first-battle', earnedAt: '2026-10-07T00:00:00Z', species: 'pidgey', shiny: false },
      ],
      marks: ['analyzed'],
    };
    expect(await storage.saveAchievements(rec)).toBe(true);
    expect(await storage.loadAchievements()).toEqual(rec);
    await storage.forget();
    expect(await storage.loadAchievements()).toEqual({ earned: [], marks: [] });
  });

  it('hands out a fresh empty record each time', async () => {
    const a = await storage.loadAchievements();
    a.marks.push('x');
    expect(await storage.loadAchievements()).toEqual({ earned: [], marks: [] });
  });

  it('merges an imported record: stored wins a clash, marks union', () => {
    const stored = {
      earned: [{ id: 'trainer', earnedAt: 'a', species: 'pidgey', shiny: false }],
      marks: ['analyzed'],
    };
    const incoming = {
      earned: [
        { id: 'trainer', earnedAt: 'b', species: 'rattata', shiny: true },
        { id: 'full-set', earnedAt: 'b', species: 'machop', shiny: false },
      ],
      marks: ['analyzed', 'other'],
    };
    expect(mergeAchievementRecords(stored, incoming)).toEqual({
      earned: [
        { id: 'trainer', earnedAt: 'a', species: 'pidgey', shiny: false },
        { id: 'full-set', earnedAt: 'b', species: 'machop', shiny: false },
      ],
      marks: ['analyzed', 'other'],
    });
  });

  it('merge drops a repeated id and a repeated species inside the incoming block', () => {
    const stored = { earned: [], marks: [] };
    const incoming = {
      earned: [
        { id: 'trainer', earnedAt: 'a', species: 'pidgey', shiny: false },
        { id: 'trainer', earnedAt: 'b', species: 'machop', shiny: true },
        { id: 'full-set', earnedAt: 'c', species: 'pidgey', shiny: true },
        { id: 'other', earnedAt: 'd', species: 'rattata', shiny: false },
      ],
      marks: [],
    };
    expect(mergeAchievementRecords(stored, incoming).earned).toEqual([
      { id: 'trainer', earnedAt: 'a', species: 'pidgey', shiny: false },
      { id: 'other', earnedAt: 'd', species: 'rattata', shiny: false },
    ]);
  });

  it('updateAchievements keeps both of two concurrent changes', async () => {
    const add = (id: string, species: string) => (cur: AchievementsRecord) => ({
      earned: [...cur.earned, { id, earnedAt: 'a', species, shiny: false }],
      marks: cur.marks,
    });
    const [a, b] = await Promise.all([
      storage.updateAchievements(add('trainer', 'pidgey')),
      storage.updateAchievements(add('full-set', 'machop')),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const ids = (await storage.loadAchievements()).earned.map((e) => e.id).sort();
    expect(ids).toEqual(['full-set', 'trainer']);
  });

  it('updateAchievements resolves null and writes nothing when fn throws', async () => {
    const out = await storage.updateAchievements(() => {
      throw new Error('boom');
    });
    expect(out).toBeNull();
    expect(await storage.loadAchievements()).toEqual({ earned: [], marks: [] });
  });
});
