import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/schedule-issues-cli.ts',
);

function run(args: string[], env: Record<string, string>) {
  const clean = { ...process.env };
  delete clean.CHECK_OUTPUT;
  delete clean.OPEN_ISSUES;
  return spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    env: { ...clean, ...env },
    encoding: 'utf8',
  });
}

const GOOD = JSON.stringify({
  warnings: [{ title: 'T', body: 'B' }],
  judged: { feed: true, rankings: true },
});

describe('schedule-issues-cli', () => {
  it('reports invalid check output on stderr only, and exits non-zero', () => {
    for (const env of [{}, { CHECK_OUTPUT: '' }, { CHECK_OUTPUT: '[]' }]) {
      const r = run(['warnings'], env);
      expect(r.status).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain('::error::');
    }
  });

  it('fails on missing OPEN_ISSUES for close, on stderr only', () => {
    const r = run(['close'], { CHECK_OUTPUT: GOOD });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('::error::');
  });

  it('prints warnings and closable numbers on stdout from env input', () => {
    const w = run(['warnings'], { CHECK_OUTPUT: GOOD });
    expect(w.status).toBe(0);
    expect(w.stdout).toBe('{"title":"T","body":"B"}\n');
    const open = JSON.stringify([{ number: 7, title: "Map GBL cup 'X' to a PvPoke cup" }]);
    const c = run(['close'], { CHECK_OUTPUT: GOOD, OPEN_ISSUES: open });
    expect(c.status).toBe(0);
    expect(c.stdout).toBe('7\n');
  });
});
