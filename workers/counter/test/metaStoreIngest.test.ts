import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedBatch, SharedBattle } from '../src/battles.js';
import type { Sql } from '../src/tournamentStore.js';
import { sqliteShim } from './sqliteShim.js';

// `src/index.ts` imports the Durable Object base class from the workerd runtime, which does not
// exist under plain node vitest. Same shim routes.test.ts uses to load the module at all.
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

const { MetaStore } = await import('../src/index.js');

function battle(over: Partial<SharedBattle> = {}): SharedBattle {
  return {
    id: 'b1',
    league: 'great',
    season: 28,
    at: '2026-09-17T10:00:00Z',
    team: ['tinkaton', 'azumarill', 'clodsire'],
    moves: null,
    opponents: ['azumarill'],
    result: 'win',
    tanked: false,
    band: 'ace',
    ...over,
  };
}

function batch(device: string, battles: SharedBattle[]): SharedBatch {
  return { device, client: 'pick3 test', battles };
}

/** Reads the raw stored rows back, the way this test file verifies an ingest without adding a
 *  read method to MetaStore just for the test. */
function rowsFor(
  sql: Sql,
  league: string,
): { id: string; device: string; result: string | null; tanked: boolean; opponents: string[] }[] {
  return sql
    .exec(
      'SELECT id, device, result, tanked, opponents FROM battles WHERE league = ? ORDER BY device, id',
      league,
    )
    .toArray()
    .map((r) => ({
      id: String(r['id']),
      device: String(r['device']),
      result: (r['result'] as string | null) ?? null,
      tanked: r['tanked'] === 1,
      opponents: JSON.parse(String(r['opponents'])) as string[],
    }));
}

let sql: Sql;
let close: () => void;
let store: InstanceType<typeof MetaStore>;

beforeEach(() => {
  const shim = sqliteShim();
  sql = shim.sql;
  close = shim.close;
  store = new MetaStore({ storage: { sql } } as never, {} as never);
});

afterEach(() => {
  close();
});

describe('ingest', () => {
  it('a resent battle updates its result, tanked flag and opponents', () => {
    const first = battle({ id: 'b1', result: 'win', tanked: false, opponents: ['azumarill'] });
    const firstResult = store.ingest(batch('dev-1', [first]));
    expect(firstResult).toEqual({ stored: 1, skipped: 0 });

    const secondResult = store.ingest(
      batch('dev-1', [{ ...first, result: null, tanked: true, opponents: ['azumarill', 'medicham'] }]),
    );
    expect(secondResult).toEqual({ stored: 1, skipped: 0 });

    const rows = rowsFor(sql, 'great');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ result: null, tanked: true, opponents: ['azumarill', 'medicham'] });
  });

  it("another device's battle with the same id is a different record", () => {
    store.ingest(batch('dev-1', [battle({ id: 'b1', result: 'win' })]));
    store.ingest(batch('dev-2', [battle({ id: 'b1', result: 'loss' })]));
    const rows = rowsFor(sql, 'great');
    expect(rows.map((r) => r.result).sort()).toEqual(['loss', 'win']);
  });
});
