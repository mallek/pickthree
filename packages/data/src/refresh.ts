import { execFileSync } from 'node:child_process';
import { readLock, writeLock } from './lock.js';

const lock = readLock();
const out = execFileSync('git', ['ls-remote', lock.repository, 'HEAD'], { encoding: 'utf8' });
const head = out.split(/\s+/)[0] ?? '';
if (!/^[0-9a-f]{40}$/.test(head)) {
  throw new Error(`Could not resolve upstream HEAD: ${out}`);
}
if (head === lock.commit) {
  console.log(`already at upstream HEAD ${head.slice(0, 7)}`);
  process.exit(0);
}
writeLock({ ...lock, commit: head, date: new Date().toISOString().slice(0, 10) });
console.log(
  `bumped pvpoke.lock.json ${lock.commit.slice(0, 7)} -> ${head.slice(0, 7)}; run npm run data:fetch, vendor:sync, data:build, npm test`,
);
