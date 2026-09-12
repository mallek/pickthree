import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR_FILES } from './vendor-order.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..');

/** Concatenate shim + vendored files + exports tail into one classic script. */
export function buildBundleSource(): string {
  const parts: string[] = [];
  parts.push(fs.readFileSync(path.join(here, 'globals-shim.js'), 'utf8'));
  for (const f of VENDOR_FILES) {
    parts.push(`\n/* ---- vendored: ${f.source} ---- */\n`);
    parts.push(fs.readFileSync(path.join(pkgDir, 'vendor', f.name), 'utf8'));
  }
  parts.push('\n');
  parts.push(fs.readFileSync(path.join(here, 'exports-tail.js'), 'utf8'));
  return parts.join('\n');
}

export function writeBundle(outFile: string): void {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buildBundleSource());
}
