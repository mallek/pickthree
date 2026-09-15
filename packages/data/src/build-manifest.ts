import fs from 'node:fs';
import path from 'node:path';
import type { DataManifest } from '@pickthree/engine';
import { readLock } from './lock.js';

export interface ManifestArgs {
  gamemasterTimestamp: string;
  metaSize: number;
  matrix: { candidates: number; opponents: number; scenarios: number };
}

export function writeManifest(outDir: string, args: ManifestArgs): DataManifest {
  const lock = readLock();
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // pictures are fetched by species id, not listed
        if (entry.name !== 'sprites' || dir !== outDir) {
          walk(p);
        }
      } else if (entry.name !== 'data-manifest.json') {
        files.push(path.relative(outDir, p).split(path.sep).join('/'));
      }
    }
  };
  walk(outDir);
  const manifest: DataManifest = {
    pvpokeCommit: lock.commit,
    pvpokeDate: lock.date,
    gamemasterTimestamp: args.gamemasterTimestamp,
    builtAt: new Date().toISOString(),
    metaSize: args.metaSize,
    matrix: { ...args.matrix },
    files: files.sort(),
  };
  fs.writeFileSync(path.join(outDir, 'data-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
