import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dir = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  const d = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'dm-'));
  process.env.PICKTHREE_DATAMINE_DIR = d;
  return d;
});

import { datamineFile, ensureDatamine } from '../src/fetch-datamine.js';
import type { DatamineLock } from '../src/datamine-lock.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const body = '{"templates":[1,2,3]}';
const lock: DatamineLock = {
  repository: 'https://github.com/PokeMiners/game_masters',
  commit: '8e227be44f288d34463e23bf04e9b564d3c16f79',
  date: '2026-08-29',
  path: 'latest/latest.json',
  sha256: sha(body),
};

function serve(text: string): { impl: typeof fetch; calls: () => number; urls: string[] } {
  let n = 0;
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    n += 1;
    urls.push(String(url));
    return new Response(text, { status: 200 });
  }) as typeof fetch;
  return { impl, calls: () => n, urls };
}

beforeEach(() => {
  for (const f of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, f), { force: true });
  }
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('ensureDatamine', () => {
  it('downloads, verifies and caches', async () => {
    const s = serve(body);
    const p = await ensureDatamine({ fetchImpl: s.impl, lock });
    expect(p).toBe(datamineFile(lock));
    expect(p).toBe(path.join(dir, `${lock.commit}.json`));
    expect(fs.readFileSync(p, 'utf8')).toBe(body);
    expect(s.urls).toEqual([
      `https://raw.githubusercontent.com/PokeMiners/game_masters/${lock.commit}/latest/latest.json`,
    ]);
    expect(fs.readdirSync(dir)).toEqual([`${lock.commit}.json`]);
  });

  it('does not download again when the cached file matches', async () => {
    const s = serve(body);
    await ensureDatamine({ fetchImpl: s.impl, lock });
    await ensureDatamine({ fetchImpl: s.impl, lock });
    expect(s.calls()).toBe(1);
  });

  it('refuses a body whose hash does not match and leaves nothing behind', async () => {
    await expect(ensureDatamine({ fetchImpl: serve('truncated').impl, lock })).rejects.toThrow(
      `datamine sha256 mismatch for ${lock.commit}: expected ${lock.sha256}, got ${sha('truncated')}`,
    );
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('replaces a cached file whose hash is wrong', async () => {
    fs.writeFileSync(datamineFile(lock), 'stale');
    const s = serve(body);
    const p = await ensureDatamine({ fetchImpl: s.impl, lock });
    expect(s.calls()).toBe(1);
    expect(fs.readFileSync(p, 'utf8')).toBe(body);
  });

  it('throws on an HTTP error', async () => {
    const impl = (async () => new Response('no', { status: 404 })) as typeof fetch;
    await expect(ensureDatamine({ fetchImpl: impl, lock })).rejects.toThrow('404');
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
