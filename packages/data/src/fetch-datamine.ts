import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readDatamineLock, type DatamineLock } from './datamine-lock.js';
import { DATAMINE_DIR } from './paths.js';

export function datamineFile(lock: DatamineLock): string {
  return path.join(DATAMINE_DIR, `${lock.commit}.json`);
}

export function datamineUrl(lock: DatamineLock): string {
  const match = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(lock.repository);
  if (!match) {
    throw new Error(`datamine.lock.json: cannot read owner/name from ${lock.repository}`);
  }
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${lock.commit}/${lock.path}`;
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Downloads a lock's file to `dest` and returns its sha256. Leaves the bytes at `dest`. */
export async function downloadDatamine(
  lock: DatamineLock,
  dest: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(datamineUrl(lock));
  if (!res.ok) {
    throw new Error(`datamine download failed for ${lock.commit}: HTTP ${res.status}`);
  }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return sha256File(dest);
}

export async function ensureDatamine(
  opts: { fetchImpl?: typeof fetch; lock?: DatamineLock } = {},
): Promise<string> {
  const lock = opts.lock ?? readDatamineLock();
  const file = datamineFile(lock);
  if (fs.existsSync(file)) {
    if (sha256File(file) === lock.sha256) {
      return file;
    }
    fs.rmSync(file, { force: true });
  }
  fs.mkdirSync(DATAMINE_DIR, { recursive: true });
  const partial = `${file}.partial`;
  try {
    const got = await downloadDatamine(lock, partial, opts.fetchImpl);
    if (got !== lock.sha256) {
      throw new Error(
        `datamine sha256 mismatch for ${lock.commit}: expected ${lock.sha256}, got ${got}`,
      );
    }
    fs.renameSync(partial, file);
  } catch (err) {
    fs.rmSync(partial, { force: true });
    throw err;
  }
  console.log(`datamine @ ${lock.commit.slice(0, 7)} ready at ${file}`);
  return file;
}

if (process.argv[1] && process.argv[1].endsWith('fetch-datamine.ts')) {
  ensureDatamine().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
