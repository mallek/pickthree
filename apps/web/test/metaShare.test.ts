import type { BattleSet } from '@pickthree/engine';
import { describe, expect, it, vi } from 'vitest';
import {
  forgetShared,
  pendingBattles,
  seasonOf,
  shareEligible,
  shareEnabled,
  syncShared,
  unstampAll,
} from '../src/metaShare.ts';
import { DEFAULT_SETTINGS } from '../src/storage/db.ts';

const seasons = [
  { id: 27, name: 'Old', start: '2026-06-01T13:00:00-07:00' },
  { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
];

const sets: BattleSet[] = [
  {
    id: 's1',
    league: 'great',
    startedAt: '2026-09-15T10:00:00Z',
    team: {
      species: ['tinkaton', 'azumarill', 'clodsire'],
      specimenIds: ['a', 'b', 'c'],
      moves: [
        { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER', 'BULLDOZE'] },
        null,
        { fast: 'POISON_STING', charged: ['EARTHQUAKE'] },
      ],
    },
    battles: [
      {
        id: 'b1',
        at: '2026-09-15T10:05:00Z',
        opponents: ['medicham'],
        result: 'win',
        tanked: false,
      },
      {
        id: 'b2',
        at: '2026-09-15T10:10:00Z',
        opponents: [],
        result: null,
        tanked: true,
        sharedAt: '2026-09-15T10:11:00Z',
      },
      {
        id: 'b0',
        at: '2026-08-01T10:00:00Z',
        opponents: ['skarmory'],
        result: 'loss',
        tanked: false,
      },
    ],
    closed: false,
  },
];

describe('community meta sharing', () => {
  it('is on unless switched off, and only from the live site without automation', () => {
    expect(shareEnabled(DEFAULT_SETTINGS)).toBe(true);
    expect(shareEnabled({ ...DEFAULT_SETTINGS, share: { enabled: false } })).toBe(false);
    expect(shareEligible({ hostname: 'pick3.gg', webdriver: false, devFlag: false })).toBe(true);
    expect(shareEligible({ hostname: 'www.pick3.gg', webdriver: false, devFlag: false })).toBe(
      true,
    );
    expect(shareEligible({ hostname: 'pick3.gg', webdriver: true, devFlag: false })).toBe(false);
    expect(shareEligible({ hostname: 'localhost', webdriver: false, devFlag: false })).toBe(false);
    expect(shareEligible({ hostname: 'localhost', webdriver: false, devFlag: true })).toBe(true);
  });

  it('builds anonymous records for what has not been sent, oldest first, with the season', () => {
    const pending = pendingBattles(sets, seasons, 'ace');
    expect(pending.map((b) => b.id)).toEqual(['b0', 'b1']);
    expect(pending[1]).toEqual({
      id: 'b1',
      league: 'great',
      season: 28,
      at: '2026-09-15T10:05:00Z',
      team: ['tinkaton', 'azumarill', 'clodsire'],
      moves: [
        { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER', 'BULLDOZE'] },
        null,
        { fast: 'POISON_STING', charged: ['EARTHQUAKE'] },
      ],
      opponents: ['medicham'],
      result: 'win',
      tanked: false,
      band: 'ace',
    });
    expect(pending[0]!.season).toBe(27);
    expect(seasonOf('2026-01-01T00:00:00Z', seasons)).toBeNull();
    // Nothing from the set but the species: no specimen ids anywhere in a record.
    expect(JSON.stringify(pending)).not.toContain('specimen');
  });

  it('posts in batches and stamps sharedAt on what went through', async () => {
    const fetchMock = vi.fn(async () => new Response('{"stored":2,"skipped":0}', { status: 200 }));
    const r = await syncShared(
      sets,
      { device: 'dev-1', client: 'pick3 test', seasons, band: null },
      { fetch: fetchMock as unknown as typeof fetch, now: () => '2026-09-17T12:00:00Z' },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/battles$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as { device: string; battles: unknown[] };
    expect(body.device).toBe('dev-1');
    expect(body.battles).toHaveLength(2);
    expect(r?.sent).toBe(2);
    const stamped = r!.sets[0]!.battles.map((b) => b.sharedAt);
    expect(stamped).toEqual([
      '2026-09-17T12:00:00Z',
      '2026-09-15T10:11:00Z',
      '2026-09-17T12:00:00Z',
    ]);
    // Nothing pending afterwards.
    expect(pendingBattles(r!.sets, seasons, null)).toEqual([]);
  });

  it('stamps nothing when the worker refuses, and tries again next time', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"bad batch"}', { status: 400 }));
    const r = await syncShared(
      sets,
      { device: 'dev-1', client: 'pick3 test', seasons, band: null },
      { fetch: fetchMock as unknown as typeof fetch, now: () => '2026-09-17T12:00:00Z' },
    );
    expect(r).toBeNull();
  });

  it('forget asks the worker to drop the device, and unstamp clears the marks', async () => {
    const fetchMock = vi.fn(async () => new Response('{"deleted":3}', { status: 200 }));
    expect(await forgetShared('dev-1', { fetch: fetchMock as unknown as typeof fetch })).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    const cleared = unstampAll(sets);
    expect(cleared[0]!.battles.every((b) => b.sharedAt === undefined)).toBe(true);
    expect(pendingBattles(cleared, seasons, null)).toHaveLength(3);
  });
});
