import { describe, expect, it, vi } from 'vitest';
import { BUCKET_MS, fetchMeta, metaUrl, resolveWindow, speciesUrl } from '../src/api.js';
import type { Season } from '../src/data.js';

const seasons: Season[] = [
  { id: 27, name: 'Season 27', start: '2026-06-02T13:00:00-07:00' },
  { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
  { id: 29, name: 'Season 29', start: '2026-12-01T13:00:00-08:00' },
];
const now = new Date('2026-09-18T12:07:30.000Z');

describe('resolveWindow', () => {
  it('rounds the end up to the next ten minutes so the edge cache is worth having', () => {
    const w = resolveWindow('7', seasons, now);
    expect(Date.parse(w.until) % BUCKET_MS).toBe(0);
    expect(w.until).toBe('2026-09-18T12:10:00.000Z');
    expect(w.since).toBe('2026-09-11T12:10:00.000Z');
    expect(w.label).toBe('7 days');
  });

  it('measures 30 days the same way', () => {
    const w = resolveWindow('30', seasons, now);
    expect(w.since).toBe('2026-08-19T12:10:00.000Z');
    expect(w.label).toBe('30 days');
  });

  it('starts the season window at the season that is running', () => {
    const w = resolveWindow('season', seasons, now);
    expect(w.since).toBe('2026-09-08T20:00:00.000Z');
    expect(w.label).toBe('This season');
  });

  it('falls back to 30 days when the season list says nothing about now', () => {
    const w = resolveWindow('season', [], now);
    expect(w.since).toBe('2026-08-19T12:10:00.000Z');
    expect(w.label).toBe('30 days');
  });
});

describe('urls', () => {
  const w = resolveWindow('7', seasons, now);

  it('builds the meta url, leaving an "all" band out', () => {
    expect(metaUrl('great', w, 'all')).toBe(
      '/api/v1/meta?league=great&since=2026-09-11T12%3A10%3A00.000Z&until=2026-09-18T12%3A10%3A00.000Z',
    );
  });

  it('adds the band when one is chosen', () => {
    expect(metaUrl('great', w, 'legend')).toContain('&band=legend');
  });

  it('builds the species url', () => {
    expect(speciesUrl('ultra', 'azumarill', w, 'all')).toContain('/api/v1/species/azumarill?');
  });
});

describe('fetchMeta', () => {
  const w = resolveWindow('7', seasons, now);

  it('returns the parsed body', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ league: 'great', battles: 3 }), { status: 200 }),
    );
    await expect(fetchMeta('great', w, 'all', { fetcher })).resolves.toMatchObject({ battles: 3 });
  });

  it('throws a readable error when the worker refuses', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad window' }), { status: 400 }),
    );
    await expect(fetchMeta('great', w, 'all', { fetcher })).rejects.toThrow('bad window');
  });

  it('throws when the network fails, without swallowing the reason', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(fetchMeta('great', w, 'all', { fetcher })).rejects.toThrow('offline');
  });
});
