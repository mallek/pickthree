import { afterEach, describe, expect, it, vi } from 'vitest';
import { appNow } from '../src/clock.ts';

describe('appNow', () => {
  afterEach(() => {
    localStorage.removeItem('pick3.now');
    vi.unstubAllGlobals();
  });

  it('is the real time for a person', () => {
    const before = Date.now();
    expect(appNow().getTime()).toBeGreaterThanOrEqual(before);
  });

  it('ignores a stored time unless automation is driving the page', () => {
    localStorage.setItem('pick3.now', '2026-10-14T00:00:00.000Z');
    expect(appNow().toISOString()).not.toBe('2026-10-14T00:00:00.000Z');
  });

  it('honors a stored time under automation, for the screenshot run', () => {
    vi.stubGlobal('navigator', { ...navigator, webdriver: true });
    localStorage.setItem('pick3.now', '2026-10-14T00:00:00.000Z');
    expect(appNow().toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
});
