import { describe, expect, it, vi } from 'vitest';
import {
  BUCKET_MS,
  fetchMeta,
  fetchTeams,
  metaUrl,
  resolveWindow,
  speciesUrl,
  teamsUrl,
  workerSource,
} from '../src/api.js';
import type { Season } from '../src/data.js';
import type { SourceKey } from '../src/route.js';

const seasons: Season[] = [
  { id: 27, name: 'Season 27', start: '2026-06-02T13:00:00-07:00' },
  { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
  { id: 29, name: 'Season 29', start: '2026-12-01T13:00:00-08:00' },
];
const now = new Date('2026-09-18T12:07:30.000Z');
const ctxBase = { league: 'great', seasons, epochs: [] };

describe('resolveWindow (fixed windows)', () => {
  it('rounds the end up to the next ten minutes so the edge cache is worth having', () => {
    const w = resolveWindow('7', ctxBase, now);
    expect(Date.parse(w.until) % BUCKET_MS).toBe(0);
    expect(w.until).toBe('2026-09-18T12:10:00.000Z');
    expect(w.since).toBe('2026-09-11T12:10:00.000Z');
    expect(w.label).toBe('7 days');
  });

  it('measures 30 days the same way', () => {
    const w = resolveWindow('30', ctxBase, now);
    expect(w.since).toBe('2026-08-19T12:10:00.000Z');
    expect(w.label).toBe('30 days');
  });

  it('leaves until unchanged when now is already on a ten minute boundary', () => {
    const exact = new Date('2026-09-18T12:10:00.000Z');
    const w = resolveWindow('7', ctxBase, exact);
    expect(w.until).toBe('2026-09-18T12:10:00.000Z');
  });
});

describe('urls', () => {
  const w = resolveWindow('7', ctxBase, now);

  it('never asks the worker to narrow the summary: one cached response serves all four views', () => {
    expect(metaUrl('great', w)).toBe(
      `/api/v1/meta?league=great&since=${encodeURIComponent(w.since)}&until=${encodeURIComponent(w.until)}`,
    );
  });

  it('maps the PvPoke view onto the all read, since PvPoke needs no worker call', () => {
    expect(workerSource('prior')).toBe('all');
    expect(workerSource('all')).toBe('all');
    expect(workerSource('ladder')).toBe('ladder');
    expect(workerSource('tournament')).toBe('tournament');
    expect(teamsUrl('great', w, 'prior')).toBe(teamsUrl('great', w, 'all'));
    expect(teamsUrl('great', w, 'tournament')).toContain('source=tournament');
    expect(speciesUrl('great', 'azumarill', w, 'ladder')).toContain('source=ladder');
  });

  it('builds the species url', () => {
    expect(speciesUrl('ultra', 'azumarill', w, 'all')).toContain('/api/v1/species/azumarill?');
  });
});

describe('fetchMeta', () => {
  const w = resolveWindow('7', ctxBase, now);

  it('returns the parsed body', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ league: 'great', battles: 3 }), { status: 200 }),
    );
    await expect(fetchMeta('great', w, { fetcher })).resolves.toMatchObject({ battles: 3 });
  });

  it('throws a readable error when the worker refuses', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad window' }), { status: 400 }),
    );
    await expect(fetchMeta('great', w, { fetcher })).rejects.toThrow('bad window');
  });

  it('throws when the network fails, without swallowing the reason', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(fetchMeta('great', w, { fetcher })).rejects.toThrow('offline');
  });
});

const SEASONS = [
  { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
  { id: 29, name: 'Season 29', start: '2026-12-01T13:00:00-08:00' },
];
const EPOCHS = [
  { at: '2026-09-08T13:00:00-07:00', note: 'Season 28' },
  { at: '2026-09-15T00:00:00Z', note: 'move rebalance', leagues: ['great'] },
];
const ctx = (league: string) => ({ league, seasons: SEASONS, epochs: EPOCHS });

describe('resolveWindow', () => {
  it('runs the meta window from the newest epoch that applies', () => {
    const w = resolveWindow('meta', ctx('great'), new Date('2026-09-20T12:03:00Z'));
    expect(w.since).toBe('2026-09-15T00:00:00.000Z');
    expect(w.label).toBe('This meta');
    expect(w.epoch?.note).toBe('move rebalance');
    // Rounded up to the next ten minute boundary, so every reader shares an edge cache entry.
    expect(w.until).toBe('2026-09-20T12:10:00.000Z');
  });

  it('gives a league the rebalance did not touch the earlier epoch', () => {
    const w = resolveWindow('meta', ctx('ultra'), new Date('2026-09-20T12:03:00Z'));
    expect(w.since).toBe('2026-09-08T20:00:00.000Z');
    expect(w.epoch?.note).toBe('Season 28');
  });

  it('falls back to the season start when no epoch has begun', () => {
    const w = resolveWindow(
      'meta',
      { league: 'great', seasons: SEASONS, epochs: [] },
      new Date('2026-09-20T12:03:00Z'),
    );
    expect(w.since).toBe('2026-09-08T20:00:00.000Z');
    expect(w.epoch).toBeNull();
    expect(w.label).toBe('This meta');
  });

  it('falls back to 30 days when neither an epoch nor a season covers the moment', () => {
    const w = resolveWindow(
      'meta',
      { league: 'great', seasons: [], epochs: [] },
      new Date('2026-09-20T12:03:00Z'),
    );
    expect(w.key).toBe('meta');
    expect(Date.parse(w.until) - Date.parse(w.since)).toBe(30 * 86_400_000);
  });

  it('never asks the worker for a span it rejects', () => {
    const ancient = [{ at: '2020-01-01T00:00:00Z', note: 'the before times' }];
    const w = resolveWindow(
      'meta',
      { league: 'great', seasons: [], epochs: ancient },
      new Date('2026-09-20T12:03:00Z'),
    );
    // The worker refuses anything over 400 days (MAX_SPAN_DAYS), so the client clamps first.
    expect(Date.parse(w.until) - Date.parse(w.since)).toBeLessThanOrEqual(400 * 86_400_000);
  });

  it('leaves the fixed windows alone', () => {
    const w = resolveWindow('7', ctx('great'), new Date('2026-09-20T12:03:00Z'));
    expect(Date.parse(w.until) - Date.parse(w.since)).toBe(7 * 86_400_000);
    expect(w.label).toBe('7 days');
    expect(w.epoch).toBeNull();
  });
});

describe('teamsUrl', () => {
  it('is its own path, so it gets its own ten minute bucket', () => {
    const w = resolveWindow('7', ctx('great'), new Date('2026-09-20T12:03:00Z'));
    expect(teamsUrl('great', w, 'all')).toBe(
      `/api/v1/teams?league=great&since=${encodeURIComponent(w.since)}&until=${encodeURIComponent(w.until)}`,
    );
    expect(teamsUrl('great', w, 'ladder')).toContain('source=ladder');
  });
});

describe('fetchTeams', () => {
  const w = resolveWindow('7', ctx('great'), new Date('2026-09-20T12:03:00Z'));

  it('returns the parsed body', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ league: 'great', battles: 3, teams: [], cores: [] }), {
        status: 200,
      }),
    );
    const source: SourceKey = 'all';
    await expect(fetchTeams('great', w, source, { fetcher })).resolves.toMatchObject({
      battles: 3,
    });
  });
});
