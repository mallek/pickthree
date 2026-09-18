import { describe, expect, it } from 'vitest';
import { THEME_KEY, applyTheme, nextTheme, storedTheme } from '../src/theme.js';

function store(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

describe('storedTheme', () => {
  it('reads a stored choice and falls back to the system', () => {
    expect(storedTheme(store({ [THEME_KEY]: 'light' }))).toBe('light');
    expect(storedTheme(store({ [THEME_KEY]: 'neon' }))).toBe('system');
    expect(storedTheme(store())).toBe('system');
  });

  it('survives a store that throws, as private browsing can', () => {
    const angry = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(storedTheme(angry)).toBe('system');
  });
});

describe('applyTheme', () => {
  it('sets data-theme for a choice and clears it for the system', () => {
    const root = document.createElement('html');
    const s = store();
    applyTheme('dark', root, s);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(s.getItem(THEME_KEY)).toBe('dark');
    applyTheme('system', root, s);
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(s.getItem(THEME_KEY)).toBe('system');
  });
});

describe('nextTheme', () => {
  it('cycles system, dark, light', () => {
    expect(nextTheme('system')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('system');
  });
});
