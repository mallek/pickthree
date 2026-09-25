import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { PokemonToken } from '../src/components.tsx';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

async function mount(node: ReactNode) {
  latest = null;
  const utils = render(
    <AppProvider host={fakeHost()}>
      <Probe />
      {node}
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.boot).toBe('ready');
    expect(latest?.settingsLoaded).toBe(true);
  });
  return utils;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

// A Shadow token's wrapper carries a ::before glow, and axe gives up on any text under an
// ancestor's positioned pseudo-element, so a Shadow token's letter (sprites off) was left
// "unverified" by the page audit. The wrapper is marked data-audit-contrast="static" and the
// check below stands in for the audit.
describe('Shadow token', () => {
  it('marks its wrapper for the static contrast check', async () => {
    const { container } = await mount(<PokemonToken speciesId="ninetales_shadow" />);
    const wrap = container.querySelector('.token-shadow-wrap');
    expect(wrap?.getAttribute('data-audit-contrast')).toBe('static');
  });

  it('wraps plain and Shadow tokens alike, in a box as tall as the token', async () => {
    // A bare inline span around the token grew a line box (3.5px at 32px) as a flex item, so a
    // Shadow token, whose wrapper was sized, sat higher than its plain neighbours in a row.
    for (const id of ['ninetales', 'ninetales_shadow']) {
      const { container, unmount } = await mount(<PokemonToken speciesId={id} />);
      expect(container.querySelector('.token')?.parentElement?.classList).toContain('token-wrap');
      unmount();
    }
    expect(block(app, '.token-wrap {')).toMatch(/display:\s*inline-flex/);
  });

  it('leaves a plain token with the audit', async () => {
    const { container } = await mount(<PokemonToken speciesId="ninetales" />);
    expect(container.querySelector('.token-shadow-wrap')).toBeNull();
    expect(container.querySelector('[data-audit-contrast]')).toBeNull();
  });
});

// The letter's contrast, checked the plain way. Today the disc paints over the glow (both are
// positioned, the glow first), so the letter's backdrop is the disc alone, which
// packages/ui/test/contrast.test.ts already covers. This also checks the case where the glow sits
// on top of the disc: the three glow layers stacked at full strength on every type color, then the
// letter's --token-halo outline, then the letter. The halo dominates, though: it is 75% black,
// so whatever lies under it contributes at most a quarter, and even a white ground clears about
// 9:1. The glow loop is a smoke check; the real guards are the static marker above and the halo
// and letter tokens (contrast.test.ts). The letter, the outline and the type colors are
// theme-constant (the shared :root block), so one pass covers dark and light.
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, p), 'utf8').replace(/\r\n/g, '\n');
const tokens = read('../../../packages/ui/tokens.css');
const app = read('../src/app.css');

type Rgba = [number, number, number, number];

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

function parseRgba(text: string): Rgba {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/.exec(text);
  if (!m) {
    throw new Error(`not an rgba(): ${text}`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function hexRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function over([r, g, b, a]: Rgba, ground: [number, number, number]): [number, number, number] {
  return [r, g, b].map((top, k) => a * top + (1 - a) * (ground[k] ?? 0)) as [
    number,
    number,
    number,
  ];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const shared = block(tokens, '\n:root {');
const typeColors = [...shared.matchAll(/--type-([a-z]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map(
  (m) => [m[1] ?? '', m[2] ?? ''] as const,
);
const letter = parseRgba(/--token-letter\s*:\s*([^;]+);/.exec(shared)?.[1] ?? '');
const halo = parseRgba(/--token-halo\s*:\s*([^;]+);/.exec(shared)?.[1] ?? '');
const glowRule = block(app, '.token-shadow-wrap::before {');
const glows = [...glowRule.matchAll(/rgba\([^)]*\)/g)].map((m) => parseRgba(m[0]));

describe('Shadow token letter contrast', () => {
  it('reads the 18 type colors and the three glow layers', () => {
    expect(typeColors).toHaveLength(18);
    expect(glows).toHaveLength(3);
  });

  it('paints the glow under the disc: no z-index on the glow', () => {
    // A fix that makes the glow visible must revisit this assertion and the model below together.
    expect(glowRule).not.toMatch(/z-index/);
  });

  for (const [type, color] of typeColors) {
    it(`the letter clears 4.5:1 on its outline over ${type}, under the glow or not`, () => {
      const disc = hexRgb(color);
      // CSS paints the first background layer on top, so the stack is built from the last layer
      // up: where all three radial layers meet at full strength, over the disc.
      const glowed = glows.reduceRight((ground, layer) => over(layer, ground), disc);
      for (const ground of [disc, glowed]) {
        const outline = over(halo, ground);
        expect(ratio(over(letter, outline), outline)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
