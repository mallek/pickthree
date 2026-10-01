import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Mega badge sits on a token's bottom-right corner, and a token's name sits right under it
// (Team Analysis, Build, Log a Battle). It may hang a few pixels past the corner, like a count
// badge (the page audit's overhang mark allows that and checks it lands on no text), and no more,
// so it never reaches into the name. jsdom has no layout, so the rule is read from app.css; the
// page audit checks the laid-out page.
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

/** How far past the token's corner the badge may hang, in px. */
const MAX_HANG = 3;

describe('Mega badge layout', () => {
  const badge = block(app, '.token-mega-badge {');

  it('is pinned to the bottom-right corner, hanging at most a few pixels past it', () => {
    const bottom = px(badge, 'bottom');
    const right = px(badge, 'right');
    expect(badge).toMatch(/position:\s*absolute;/);
    expect(bottom).not.toBeNull();
    expect(right).not.toBeNull();
    expect(bottom!).toBeGreaterThanOrEqual(-MAX_HANG);
    expect(right!).toBeGreaterThanOrEqual(-MAX_HANG);
    expect(px(badge, 'top')).toBeNull();
    expect(px(badge, 'left')).toBeNull();
  });

  it('has no margin that pushes it further out of the token', () => {
    expect(badge).not.toMatch(/margin[^:]*:\s*-/);
  });
});
