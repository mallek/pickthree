#!/usr/bin/env node
/**
 * Guards the token contract: every var(--x) in base.css and the two app.css files must resolve
 * to a custom property packages/ui/tokens.css defines, one the same file defines itself, or one of
 * the handful a component sets inline via style (never in tokens.css). An undefined custom
 * property fails silently at runtime, so this is the one thing typecheck and vitest cannot catch.
 *
 * A file's own definitions count because not every custom property is a token. The landing page
 * scopes its scenery to `.landing` (sky, treeline, the pokeball's colours, the tally pink): those
 * vary by theme but they are one page's decoration, not semantic tokens, and putting them in
 * tokens.css would hand them to apps/meta as well. What this gives up is scope: a property defined
 * on one selector and used under another still passes here. Typos, which are what actually fail
 * silently, still do not.
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
  const local = names(text, /--([a-zA-Z0-9-]+)\s*:/g);
  for (const name of used) {
    if (!defined.has(name) && !local.has(name) && !INLINE_ONLY.has(name)) {
      console.error(`${path.relative(root, file)}: var(--${name}) is not defined in tokens.css or in this file`);
      bad += 1;
    }
  }
}

if (bad > 0) {
  console.error(`check-tokens: ${bad} undefined custom propert${bad === 1 ? 'y' : 'ies'}`);
  process.exit(1);
}
console.log('check-tokens: ok');
