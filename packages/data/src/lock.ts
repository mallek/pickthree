import fs from 'node:fs';
import { LOCK_PATH } from './paths.js';

export interface PvPokeLock {
  commit: string;
  date: string;
  repository: string;
}

export function readLock(): PvPokeLock {
  const raw = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')) as Partial<PvPokeLock>;
  if (typeof raw.commit !== 'string' || !/^[0-9a-f]{40}$/.test(raw.commit)) {
    throw new Error(`pvpoke.lock.json: commit must be a 40-char sha, got ${String(raw.commit)}`);
  }
  if (typeof raw.date !== 'string') {
    throw new Error('pvpoke.lock.json: date missing');
  }
  if (typeof raw.repository !== 'string') {
    throw new Error('pvpoke.lock.json: repository missing');
  }
  return { commit: raw.commit, date: raw.date, repository: raw.repository };
}

export function writeLock(lock: PvPokeLock): void {
  fs.writeFileSync(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
}
