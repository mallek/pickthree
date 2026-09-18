#!/usr/bin/env node
/**
 * Guards the token contract: every var(--x) in base.css and the two app.css files must resolve
 * to a custom property packages/ui/tokens.css defines, or be one of the handful of custom
 * properties a component sets inline via style (never in tokens.css). An undefined custom
 * property fails silently at runtime, so this is the one thing typecheck and vitest cannot catch.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Set inline via style={{ '--x': ... }} in a component (TypeChip, OpponentCard, Build's evo
 * card, meta's Sprite wrapper), never in tokens.css. */
const INLINE_ONLY = new Set(['c', 't', 'c1', 'sprite-size']);

const TOKENS_FILE = path.join(root, 'packages/ui/tokens.css');
const SCAN_FILES = [
  path.join(root, 'packages/ui/base.css'),
  path.join(root, 'apps/web/src/app.css'),
  path.join(root, 'apps/meta/src/app.css'),
];

function names(text, pattern) {
  const out = new Set();
  for (const m of text.matchAll(pattern)) {
    if (m[1]) {
      out.add(m[1]);
    }
  }
  return out;
}

const defined = names(readFileSync(TOKENS_FILE, 'utf8'), /--([a-zA-Z0-9-]+)\s*:/g);

let bad = 0;
for (const file of SCAN_FILES) {
  const text = readFileSync(file, 'utf8');
  const used = names(text, /var\(--([a-zA-Z0-9-]+)/g);
  for (const name of used) {
    if (!defined.has(name) && !INLINE_ONLY.has(name)) {
      console.error(`${path.relative(root, file)}: var(--${name}) is not defined in tokens.css`);
      bad += 1;
    }
  }
}

if (bad > 0) {
  console.error(`check-tokens: ${bad} undefined custom propert${bad === 1 ? 'y' : 'ies'}`);
  process.exit(1);
}
console.log('check-tokens: ok');
