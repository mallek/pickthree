import type { BattleSet, League } from '@pickthree/engine';
import { describe, expect, it } from 'vitest';
import {
  facingInput,
  facingSettings,
  hasCommunityData,
  isCommunity,
  logBattles,
} from '../src/state/facing.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/storage/db.ts';

const REQ = {
  league: 'great',
  since: '2026-09-02T00:00:00.000Z',
  until: '2026-09-24T00:10:00.000Z',
  label: 'This meta',
  key: 'k',
};
const PAYLOAD = {
  summary: { battles: 1, devices: 1, species: [], tournament: null },
  generatedAt: 'g',
};

function settings(over: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

describe('facingSettings', () => {
  it('reads an old save with the blend on (or absent) as Your meta, This meta', () => {
    expect(facingSettings(settings({}))).toEqual({ source: 'log', window: 'meta' });
    expect(facingSettings(settings({ yourMeta: { blend: true } }))).toEqual({
      source: 'log',
      window: 'meta',
    });
  });

  it('reads an old save with the blend off as PvPoke', () => {
    expect(facingSettings(settings({ yourMeta: { blend: false } })).source).toBe('prior');
  });

  it('prefers the new field when present', () => {
    expect(
      facingSettings(
        settings({ yourMeta: { blend: false }, facing: { source: 'all', window: '7' } }),
      ),
    ).toEqual({
      source: 'all',
      window: '7',
    });
  });
});

describe('facingInput', () => {
  it('maps each source', () => {
    expect(
      facingInput({
        choice: { source: 'prior', window: 'meta' },
        battles: [],
        request: null,
        payload: null,
      }),
    ).toEqual({ kind: 'prior' });
    expect(
      facingInput({
        choice: { source: 'log', window: 'meta' },
        battles: [],
        request: null,
        payload: null,
      }),
    ).toEqual({ kind: 'log', battles: [] });
    expect(
      facingInput({
        choice: { source: 'ladder', window: 'meta' },
        battles: [],
        request: REQ,
        payload: PAYLOAD,
      }),
    ).toEqual({
      kind: 'community',
      source: 'ladder',
      summary: PAYLOAD.summary,
      window: { since: REQ.since, until: REQ.until, label: 'This meta' },
    });
  });

  it('falls back to PvPoke, marked unavailable, with no payload or no request', () => {
    expect(
      facingInput({
        choice: { source: 'all', window: '7' },
        battles: [],
        request: REQ,
        payload: null,
      }),
    ).toEqual({ kind: 'prior', unavailable: 'all' });
    expect(
      facingInput({
        choice: { source: 'all', window: '7' },
        battles: [],
        request: null,
        payload: null,
      }),
    ).toEqual({ kind: 'prior', unavailable: 'all' });
  });

  it('isCommunity', () => {
    expect(isCommunity('ladder')).toBe(true);
    expect(isCommunity('tournament')).toBe(true);
    expect(isCommunity('all')).toBe(true);
    expect(isCommunity('log')).toBe(false);
    expect(isCommunity('prior')).toBe(false);
  });
});

describe('logBattles', () => {
  const seasons = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];
  const sets: BattleSet[] = [
    {
      id: 's',
      league: 'great',
      startedAt: '2026-09-01T00:00:00Z',
      team: { species: ['a', 'b', 'c'] },
      battles: [
        { id: '1', at: '2026-09-01T10:00:00Z', opponents: ['x'], result: 'win', tanked: false },
        { id: '2', at: '2026-09-10T10:00:00Z', opponents: ['y'], result: 'win', tanked: false },
        { id: '3', at: '2026-09-14T10:00:00Z', opponents: ['z'], result: 'win', tanked: false },
      ],
      closed: false,
    },
  ];
  const now = new Date('2026-09-16T00:00:00Z');

  it('windows to the season', () => {
    expect(logBattles(sets, seasons, DEFAULT_SETTINGS, 'great', now).map((b) => b.id)).toEqual([
      '2',
      '3',
    ]);
  });

  it('honours a fresh mark for the league only', () => {
    const marked = settings({
      yourMeta: { blend: false, freshFrom: { great: '2026-09-12T00:00:00Z' } },
    });
    expect(logBattles(sets, seasons, marked, 'great', now).map((b) => b.id)).toEqual(['3']);
    expect(logBattles(sets, seasons, marked, 'ultra', now).map((b) => b.id)).toEqual(['2', '3']);
  });
});

describe('hasCommunityData', () => {
  const league = (id: string, kind: League['kind']): League => ({
    id,
    title: id,
    short: id,
    cp: 1500,
    cup: id,
    meta: id,
    kind,
    minCp: 1410,
    include: [],
    exclude: [],
    metaSize: 0,
  });

  it('is true for an open league the community tracks', () => {
    expect(hasCommunityData(settings({ league: 'great' }), [league('great', 'standard')])).toBe(true);
  });

  it('is false for a known league with no community data', () => {
    expect(hasCommunityData(settings({ league: 'special1' }), [league('special1', 'special')])).toBe(
      false,
    );
  });

  it('counts a league not known yet (no league list, or not in it) as having it', () => {
    expect(hasCommunityData(settings({ league: 'great' }), undefined)).toBe(true);
    expect(hasCommunityData(settings({ league: 'ultra' }), [league('great', 'standard')])).toBe(true);
  });
});
