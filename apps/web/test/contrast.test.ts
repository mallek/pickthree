import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Contrast checks on web's own app.css rules, the plain way: WCAG relative luminance, in every
// theme, with the rules read from app.css and the values from the ui tokens. Your Meta's result
// chips are one letter each (W, L, T), which axe will not judge ("too short"), so the page marks
// them data-audit-contrast="static" and they are checked here. The shared Seg's pressed label is
// checked here too, on every surface a Seg sits on. Normalised for CRLF checkouts.
const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
const tokens = read('../../../packages/ui/tokens.css');
const app = read('../src/app.css');

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

/** `pct` percent of `a` over `b` in srgb, the way the browser works out a color-mix. */
function mix(a: string, pct: number, b: string): string {
  const channels = [1, 3, 5].map((i) => {
    const x = parseInt(a.slice(i, i + 2), 16);
    const y = parseInt(b.slice(i, i + 2), 16);
    return Math.round((pct / 100) * x + (1 - pct / 100) * y)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

const MIX = /color-mix\(in srgb, var\(--([a-z0-9-]+)\) (\d+)%, var\(--([a-z0-9-]+)\)\)/;

function paint(body: string, theme: string): { fill: string; ink: string } {
  const bg = /background:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? '';
  const ink = /(?:^|\s)color:\s*var\(--([a-z0-9-]+)\)/.exec(body)?.[1] ?? '';
  const mixed = MIX.exec(bg);
  const fill = mixed
    ? mix(value(theme, mixed[1] ?? ''), Number(mixed[2]), value(theme, mixed[3] ?? ''))
    : value(theme, /var\(--([a-z0-9-]+)\)/.exec(bg)?.[1] ?? '');
  return { fill, ink: value(theme, ink) };
}

const themes = {
  dark: block(tokens, ":root,\n:root[data-theme='dark'] {"),
  'light (system)': block(tokens, ":root:not([data-theme='dark']) {"),
  'light (picked)': block(tokens, ":root[data-theme='light'] {"),
};

describe('Your Meta result chip contrast', () => {
  for (const outcome of ['win', 'loss', 'tanked']) {
    const chip = block(app, `.result-chip.${outcome} > span {`);
    for (const [theme, body] of Object.entries(themes)) {
      it(`${outcome}: the letter clears 4.5:1 on its fill in ${theme}`, () => {
        const { fill, ink } = paint(chip, body);
        expect(ratio(ink, fill)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("The T chip is Log a Battle's Tanked amber (Travis, 2026-09-26)", () => {
  const ui = read('../../../packages/ui/base.css');
  const chip = block(app, '.result-chip.tanked > span {');
  const button = block(ui, '.ui-btn-warn {');
  for (const [theme, body] of Object.entries(themes)) {
    it(`paints the Tanked button's fill and ink, at 4.5:1, in ${theme}`, () => {
      const c = paint(chip, body);
      const b = paint(button, body);
      expect(c).toEqual(b);
      expect(c.ink).toBe(value(body, 'warn'));
      expect(ratio(c.ink, c.fill)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('In-battle shield grid contrast', () => {
  // One letter per cell (W, L) and the shield numbers on the axes, which axe will not judge
  // ("too short"), so the grid is marked data-audit-contrast="static" and checked here. A
  // decisive result is a filled cell; a close one is the tinted, outlined cell, so the margin
  // shows without fading the letter.
  for (const cell of ['w', 'l', 'w.close', 'l.close']) {
    const rule = block(app, `.fo-grid i.${cell} {`);
    for (const [theme, body] of Object.entries(themes)) {
      it(`${cell}: the letter clears 4.5:1 on its fill in ${theme}`, () => {
        const { fill, ink } = paint(rule, body);
        expect(ratio(ink, fill)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it('the shield numbers clear 4.5:1 on the card in every theme', () => {
    const axis =
      /(?:^|\s)color:\s*var\(--([a-z0-9-]+)\)/.exec(block(app, '.fo-grid i.fo-ax {'))?.[1] ?? '';
    for (const body of Object.values(themes)) {
      expect(ratio(value(body, axis), value(body, 'surface'))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Seg pressed label contrast', () => {
  // Your Meta's sort sits on the page (--bg); the Settings sheet's Segs sit on --surface. The Seg
  // rules live in packages/ui/base.css beside the component (meta.pick3.gg's About uses it too).
  const ui = read('../../../packages/ui/base.css');
  const ink = /(?:^|\s)color:\s*var\(--([a-z0-9-]+)\)/.exec(block(ui, '.seg > .on {'))?.[1] ?? '';
  for (const ground of ['bg', 'surface']) {
    for (const [theme, body] of Object.entries(themes)) {
      it(`the pressed label clears 4.5:1 on --${ground} in ${theme}`, () => {
        expect(ratio(value(body, ink), value(body, ground))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

// The Mega pill sits across the sprite, so axe cannot judge its backdrop; PokemonToken marks the
// wrapper data-audit-contrast="static" and the pill's own pair is checked here instead.
describe('Mega pill contrast', () => {
  const pill = block(app, '.token-mega-pill {');
  for (const [theme, body] of Object.entries(themes)) {
    it(`the pill's ink clears 4.5:1 on its fill in ${theme}`, () => {
      const { fill, ink } = paint(pill, body);
      expect(ratio(ink, fill)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
