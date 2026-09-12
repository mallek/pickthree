import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readLock } from './lock.js';
import { PVPOKE_DIR } from './paths.js';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

export function currentCheckoutCommit(): string | null {
  if (!fs.existsSync(PVPOKE_DIR)) {
    return null;
  }
  try {
    return git(['rev-parse', 'HEAD'], PVPOKE_DIR);
  } catch {
    return null;
  }
}

export async function ensurePvPokeCheckout(): Promise<void> {
  const lock = readLock();
  if (currentCheckoutCommit() === lock.commit) {
    return;
  }
  fs.rmSync(PVPOKE_DIR, { recursive: true, force: true });
  fs.mkdirSync(PVPOKE_DIR, { recursive: true });
  git(['init', '-q'], PVPOKE_DIR);
  git(['remote', 'add', 'origin', lock.repository], PVPOKE_DIR);
  git(['fetch', '-q', '--depth', '1', 'origin', lock.commit], PVPOKE_DIR);
  git(['-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD'], PVPOKE_DIR);
  const head = git(['rev-parse', 'HEAD'], PVPOKE_DIR);
  if (head !== lock.commit) {
    throw new Error(`Checked out ${head} but lock pins ${lock.commit}`);
  }
  console.log(`pvpoke @ ${lock.commit.slice(0, 7)} ready at ${PVPOKE_DIR}`);
}

if (process.argv[1] && process.argv[1].endsWith('fetch-pvpoke.ts')) {
  ensurePvPokeCheckout().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
