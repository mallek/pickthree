import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dexLayout, shareDex, shareHeadline } from '../src/achievements/shareImage.ts';

describe('share image', () => {
  it('is 1080 wide and fits all 151 slots inside it', () => {
    const l = dexLayout();
    expect(l.width).toBe(1080);
    const last = l.slot(150);
    expect(last.x + l.cell).toBeLessThanOrEqual(l.width);
    expect(last.y + l.cell).toBeLessThan(l.height);
    expect(l.slot(l.cols).y).toBeGreaterThan(l.slot(0).y);
  });

  it('words the headline with and without a shiny', () => {
    const e = (species: string, shiny: boolean) => ({ id: species, earnedAt: 'x', species, shiny });
    expect(shareHeadline({ earned: [e('pidgey', false)], marks: [] })).toBe(
      '1 of 151 · earned by playing GBL',
    );
    expect(shareHeadline({ earned: [e('pidgey', false), e('lapras', true)], marks: [] })).toBe(
      '2 of 151 · 1 shiny · earned by playing GBL',
    );
  });
});

describe('shareHeadline counting', () => {
  it('ignores non-Kanto species and counts a species once', () => {
    const e = (id: string, species: string, shiny: boolean) => ({
      id,
      earnedAt: 'x',
      species,
      shiny,
    });
    expect(
      shareHeadline({
        earned: [e('a', 'pidgey', false), e('b', 'pidgey', true), e('c', 'chikorita', true)],
        marks: [],
      }),
    ).toBe('1 of 151 · 1 shiny · earned by playing GBL');
  });
});

describe('shareDex', () => {
  const input = { record: { earned: [], marks: [] }, types: () => ['normal'], spritesOn: false };
  const ctx = new Proxy(
    {},
    { get: () => () => undefined, set: () => true },
  ) as unknown as CanvasRenderingContext2D;
  let context: CanvasRenderingContext2D | null;
  let createUrl: ReturnType<typeof vi.fn>;
  let clicks: number;

  beforeEach(() => {
    context = ctx;
    clicks = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => context) as never,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(((cb: BlobCallback) =>
      cb(new Blob(['x'], { type: 'image/png' }))) as never);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      clicks += 1;
    });
    createUrl = vi.fn(() => 'blob:x');
    URL.createObjectURL = createUrl as never;
    URL.revokeObjectURL = vi.fn() as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  function stubShare(share: () => Promise<void>): void {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  }

  it('returns shared when the share sheet takes the file', async () => {
    stubShare(() => Promise.resolve());
    expect(await shareDex(input)).toBe('shared');
    expect(clicks).toBe(0);
  });

  it('returns cancelled, with no download, when the sheet is dismissed', async () => {
    stubShare(() => Promise.reject(new DOMException('dismissed', 'AbortError')));
    expect(await shareDex(input)).toBe('cancelled');
    expect(clicks).toBe(0);
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('falls through to a download on any other share error', async () => {
    stubShare(() => Promise.reject(new Error('not allowed')));
    expect(await shareDex(input)).toBe('downloaded');
    expect(clicks).toBe(1);
  });

  it('downloads when the browser cannot share files', async () => {
    expect(await shareDex(input)).toBe('downloaded');
    expect(clicks).toBe(1);
  });

  it('returns failed when there is no 2d context', async () => {
    context = null;
    expect(await shareDex(input)).toBe('failed');
    expect(clicks).toBe(0);
  });
});
