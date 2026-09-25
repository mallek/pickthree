import { beforeEach, describe, expect, it } from 'vitest';
import { canGoBack, markEntry, resetHistoryForTests } from '../src/state/history.ts';

describe('pick3 history depth', () => {
  beforeEach(() => {
    resetHistoryForTests();
    window.history.replaceState(null, '', '#/');
  });

  it('has nothing behind the first screen', () => {
    markEntry();
    expect(canGoBack()).toBe(false);
  });

  it('counts a screen pushed after the first', () => {
    markEntry();
    window.history.pushState(null, '', '#/build');
    markEntry();
    expect(canGoBack()).toBe(true);
  });

  it('reads the depth back from an entry it already marked', () => {
    markEntry();
    window.history.pushState(null, '', '#/build');
    markEntry();
    const marked = window.history.state as { pick3Depth: number };
    expect(marked.pick3Depth).toBe(1);
    resetHistoryForTests();
    markEntry();
    expect(canGoBack()).toBe(true);
  });
});
