import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readDatamineLock, writeDatamineLock } from './datamine-lock.js';
import { downloadDatamine } from './fetch-datamine.js';

async function main(): Promise<void> {
  const lock = readDatamineLock();
  const out = execFileSync('git', ['ls-remote', lock.repository, 'HEAD'], { encoding: 'utf8' });
  const head = out.split(/\s+/)[0] ?? '';
  if (!/^[0-9a-f]{40}$/.test(head)) {
    throw new Error(`Could not resolve upstream HEAD: ${out}`);
  }
  if (head === lock.commit) {
    console.log(`already at upstream HEAD ${head.slice(0, 7)}`);
    return;
  }
  const next = { ...lock, commit: head, date: new Date().toISOString().slice(0, 10) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'datamine-'));
  try {
    next.sha256 = await downloadDatamine(next, path.join(tmp, 'latest.json'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  writeDatamineLock(next);
  console.log(
    `bumped datamine.lock.json ${lock.commit.slice(0, 7)} -> ${head.slice(0, 7)}; run npm run battle:build, npm test`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
