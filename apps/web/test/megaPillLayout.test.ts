import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Mega pill sits on a token, and a token's name sits right under it (Team Analysis, Build,
// Log a Battle). Hanging below the token's own box put the pill on a wrapped name, so the pill
// stays inside the token's height; only its width may hang past a small token's sides, which the
// page audit's overhang mark allows and nothing else. jsdom has no layout, so the rule is read
// from app.css; the page audit checks the laid-out page.
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(__dirname, '../src/app.css'), 'utf8').replace(/\r\n/g, '\n');

/** The body of the first rule block whose selector text starts at `selector`. */
function block(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at === -1) {
    throw new Error(`no block ${selector}`);
  }
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}

function px(body: string, prop: string): number | null {
  const m = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*(-?[\\d.]+)(px)?\\s*;`).exec(body);
  return m?.[1] !== undefined ? Number(m[1]) : null;
}

describe('Mega pill layout', () => {
  const pill = block(app, '.token-mega-pill {');

  it('is placed inside the token, never below or above its box', () => {
    const bottom = px(pill, 'bottom');
    const top = px(pill, 'top');
    expect(bottom !== null || top !== null).toBe(true);
    if (bottom !== null) {
      expect(bottom).toBeGreaterThanOrEqual(0);
    }
    if (top !== null) {
      expect(top).toBeGreaterThanOrEqual(0);
    }
  });

  it('has no margin that pushes it out of the token', () => {
    expect(pill).not.toMatch(/margin[^:]*:\s*-/);
  });
});
