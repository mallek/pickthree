import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VENDOR_FILES } from '../src/vendor-order.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.resolve(here, '..', 'vendor');

describe('vendored PvPoke files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(vendorDir, 'MANIFEST.json'), 'utf8')) as {
    commit: string;
    files: { name: string; source: string; sha256: string }[];
  };

  it('lists every file in vendor order', () => {
    expect(manifest.files.map((f) => f.name)).toEqual(VENDOR_FILES.map((f) => f.name));
  });

  it('matches on-disk hashes (no local edits)', () => {
    for (const f of manifest.files) {
      const bytes = fs.readFileSync(path.join(vendorDir, f.name));
      const sha = crypto.createHash('sha256').update(bytes).digest('hex');
      expect(sha, f.name).toBe(f.sha256);
    }
  });

  it('records the pinned commit', () => {
    const lock = JSON.parse(
      fs.readFileSync(path.resolve(here, '..', '..', 'data', 'pvpoke.lock.json'), 'utf8'),
    ) as { commit: string };
    expect(manifest.commit).toBe(lock.commit);
  });
});
