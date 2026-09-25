import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The primary button's text sits on a gradient, which axe cannot measure (it reports the button
// as incomplete). This checks it the plain way: WCAG relative luminance of --on-accent against
// each gradient stop, in dark and in light, with the stops read from base.css and the values
// from tokens.css. Normalised: a Windows checkout may have CRLF line endings.
const __dirname = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(__dirname, '../tokens.css'), 'utf8').replace(/\r\n/g, '\n');
const base = readFileSync(join(__dirname, '../base.css'), 'utf8').replace(/\r\n/g, '\n');

/** The body of the first rule block whose selector text starts at `selector`, braces matched. */
function block(css: string, selector: string): string {
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

function value(body: string, name: string): string {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(body);
  if (!m?.[1]) {
    throw new Error(`--${name} is not a six-digit hex in this block`);
  }
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const primary = block(base, '.ui-btn-primary {');
const stops = [...(/linear-gradient\(([^;]*)\)\s*;/.exec(primary)?.[1] ?? '').matchAll(/var\(--([a-z0-9-]+)\)/g)].map(
  (m) => m[1] ?? '',
);

const themes = {
  dark: block(tokens, ":root,\n:root[data-theme='dark'] {"),
  'light (system)': block(tokens, ":root:not([data-theme='dark']) {"),
  'light (picked)': block(tokens, ":root[data-theme='light'] {"),
};

describe('primary button contrast', () => {
  it('reads two gradient stops from .ui-btn-primary', () => {
    expect(stops).toHaveLength(2);
  });

  for (const [theme, body] of Object.entries(themes)) {
    for (const stop of stops) {
      it(`--on-accent clears 4.5:1 on --${stop} in ${theme}`, () => {
        expect(ratio(value(body, 'on-accent'), value(body, stop))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

// A species token's letter (no sprite) sits on a type-colored disc, split diagonally for two
// types: a gradient axe cannot measure. The letter carries a thin --token-halo outline, so what it
// must clear is its outline, whatever the disc: for every type color (either half of any disc),
// the letter and the outline are each composited onto that color and compared, in every theme
// block. The type colors come from the shared :root block.
function rgba(body: string, name: string): [number, number, number, number] {
  const m = new RegExp(
    `--${name}\\s*:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([0-9.]+)\\)\\s*;`,
  ).exec(body);
  if (!m) {
    throw new Error(`--${name} is not an rgba() in this block`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/** `color` painted at its alpha over the opaque `ground`, as a six-digit hex. */
function over([r, g, b, a]: [number, number, number, number], ground: string): string {
  const channels = [r, g, b].map((top, k) => {
    const under = parseInt(ground.slice(1 + 2 * k, 3 + 2 * k), 16);
    return Math.round(a * top + (1 - a) * under)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

const shared = block(tokens, '\n:root {');
const typeColors = [...shared.matchAll(/--type-([a-z]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map(
  (m) => [m[1] ?? '', m[2] ?? ''] as const,
);

describe('species token letter contrast', () => {
  it('reads all 18 type colors from the shared block', () => {
    expect(typeColors).toHaveLength(18);
  });

  it('draws the letter and its four-sided outline from the tokens', () => {
    const token = block(base, '.token {');
    expect(token).toContain('color: var(--token-letter)');
    expect(token.match(/var\(--token-halo\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  for (const [theme, body] of Object.entries(themes)) {
    for (const [type, color] of typeColors) {
      it(`the letter clears 4.5:1 on its outline over ${type} in ${theme}`, () => {
        const letter = over(rgba(body, 'token-letter'), color);
        const outline = over(rgba(body, 'token-halo'), color);
        expect(ratio(letter, outline)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
