import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDatamineLock } from '../src/datamine-lock.js';

describe('datamine.lock.json', () => {
  it('pins a full commit, a sha256, an ISO date and the PokeMiners repository', () => {
    const lock = readDatamineLock();
    expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lock.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lock.repository).toBe('https://github.com/PokeMiners/game_masters');
    expect(lock.path).toBe('latest/latest.json');
  });

  it('rejects a short commit sha', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmlock-'));
    const file = path.join(dir, 'datamine.lock.json');
    const good = readDatamineLock();
    fs.writeFileSync(file, JSON.stringify({ ...good, commit: 'abc123' }));
    expect(() => readDatamineLock(file)).toThrow(
      'datamine.lock.json: commit must be a 40-char sha, got abc123',
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a bad sha256', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmlock-'));
    const file = path.join(dir, 'datamine.lock.json');
    const good = readDatamineLock();
    fs.writeFileSync(file, JSON.stringify({ ...good, sha256: 'nope' }));
    expect(() => readDatamineLock(file)).toThrow('datamine.lock.json: sha256 must be 64 hex chars');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
