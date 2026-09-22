/**
 * Cloudflare's `SqlStorage` driven by node:sqlite, so the store's real SQL runs in a real SQLite
 * rather than against a fake that answers everything with an empty array. Node 24 ships
 * node:sqlite without a flag. Only the slice tournamentStore.ts uses is implemented:
 * `exec(query, ...bindings)` returning `{ toArray(), rowsWritten }`.
 */
import { DatabaseSync } from 'node:sqlite';
import type { Sql } from '../src/tournamentStore.js';

const READS = /^\s*(SELECT|PRAGMA|WITH)/i;

export function sqliteShim(): { sql: Sql; close: () => void } {
  const db = new DatabaseSync(':memory:');
  const sql: Sql = {
    exec(query: string, ...bindings: unknown[]) {
      if (READS.test(query)) {
        const rows = db
          .prepare(query)
          .all(...(bindings as never[])) as unknown as Record<string, unknown>[];
        return { toArray: () => rows, rowsWritten: 0 };
      }
      if (bindings.length === 0) {
        // Multi-statement DDL, the one shape node:sqlite's own exec() takes.
        db.exec(query);
        return { toArray: () => [], rowsWritten: 0 };
      }
      const result = db.prepare(query).run(...(bindings as never[]));
      return { toArray: () => [], rowsWritten: Number(result.changes) };
    },
  };
  return { sql, close: () => db.close() };
}
