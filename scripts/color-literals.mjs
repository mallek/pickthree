#!/usr/bin/env node
/**
 * Counts color literals (hex, rgb(), rgba(), hsl(), hsla()) in the stylesheets outside
 * packages/ui/tokens.css. New CSS must use tokens; the baseline lists the literals that predate
 * the design foundation, and each page redesign deletes the ones it removes. The baseline may
 * only shrink.
 *
 *   node scripts/color-literals.mjs          compare with the baseline, exit 1 on a difference
 *   node scripts/color-literals.mjs --write  rewrite the baseline from the current files
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['apps/web/src/app.css', 'apps/meta/src/app.css', 'packages/ui/base.css'];
const BASELINE = path.join(root, 'scripts', 'color-literal-baseline.json');
const LITERAL = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/g;

export function collectLiterals() {
  const out = {};
  for (const rel of FILES) {
    const text = readFileSync(path.join(root, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const counts = {};
    for (const m of text.matchAll(LITERAL)) {
      counts[m[0]] = (counts[m[0]] ?? 0) + 1;
    }
    if (Object.keys(counts).length > 0) {
      out[rel] = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const now = collectLiterals();
  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    console.log(`wrote ${path.relative(root, BASELINE)}`);
  } else {
    const was = JSON.parse(readFileSync(BASELINE, 'utf8'));
    if (JSON.stringify(now) !== JSON.stringify(was)) {
      console.error('color literals changed; use tokens, or rewrite the baseline if one was removed');
      process.exit(1);
    }
  }
}
