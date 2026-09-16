import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import type { BattleSet } from '@pickthree/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests, storage } from '../src/storage/db.ts';

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
