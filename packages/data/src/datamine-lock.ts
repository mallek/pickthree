import fs from 'node:fs';
import { DATAMINE_LOCK_PATH } from './paths.js';

export interface DatamineLock {
  repository: string;
  commit: string;
  date: string;
  path: string;
  sha256: string;
}

export function readDatamineLock(file: string = DATAMINE_LOCK_PATH): DatamineLock {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<DatamineLock>;
  if (typeof raw.commit !== 'string' || !/^[0-9a-f]{40}$/.test(raw.commit)) {
    throw new Error(`datamine.lock.json: commit must be a 40-char sha, got ${String(raw.commit)}`);
  }
  if (typeof raw.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(raw.sha256)) {
    throw new Error('datamine.lock.json: sha256 must be 64 hex chars');
  }
  if (typeof raw.date !== 'string') {
    throw new Error('datamine.lock.json: date missing');
  }
  if (typeof raw.repository !== 'string') {
    throw new Error('datamine.lock.json: repository missing');
  }
  if (typeof raw.path !== 'string') {
    throw new Error('datamine.lock.json: path missing');
  }
  return {
    repository: raw.repository,
    commit: raw.commit,
    date: raw.date,
    path: raw.path,
    sha256: raw.sha256,
  };
}

export function writeDatamineLock(lock: DatamineLock, file: string = DATAMINE_LOCK_PATH): void {
  fs.writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`);
}
