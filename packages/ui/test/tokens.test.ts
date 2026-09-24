import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Normalised: a Windows checkout may have CRLF line endings.
const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, '../tokens.css'), 'utf8').replace(/\r\n/g, '\n');

/** The body of the rule block whose selector text starts at `selector`, braces matched. */
function block(selector: string): string {
  const at = css.indexOf(selector);
  if (at === -1) {
    throw new Error(`no block ${selector}`);
  }
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') {
      depth += 1;
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, i);
      }
    }
  }
  throw new Error(`unclosed block ${selector}`);
}

function names(body: string): Set<string> {
  return new Set([...body.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? ''));
}

const dark = names(block(":root,\n:root[data-theme='dark'] {"));
const lightMedia = names(block(":root:not([data-theme='dark']) {"));
const lightAttr = names(block(":root[data-theme='light'] {"));
const all = names(css);

describe('tokens.css', () => {
  it('gives every dark token a light value in both light blocks', () => {
    const missing = [...dark].filter((n) => !lightMedia.has(n) || !lightAttr.has(n));
    expect(missing).toEqual([]);
  });

  it('keeps the two light blocks identical in what they define', () => {
    expect([...lightMedia].sort()).toEqual([...lightAttr].sort());
  });

  it('defines the foundation tokens', () => {
    const wanted = [
      'measured',
      'tanked',
      'danger',
      'danger-tint',
      'canvas-atmos',
      'r-control',
      'r-card',
      'fs-page',
      'fs-section',
      'fs-body',
      'fs-support',
      'fs-label',
      'gutter',
      'gutter-dense',
      'space',
      'tap',
    ];
    expect(wanted.filter((n) => !all.has(n))).toEqual([]);
  });
});
