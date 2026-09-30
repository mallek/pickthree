import { describe, expect, it } from 'vitest';
import type { ScheduleEntry } from '@pickthree/engine';
import { DATA_BASE, getJson, loadCupData, type Fetcher } from '../scripts/post/data.js';
import {
  API_BASE,
  blendedWeights,
  fetchSummary,
  formatDay,
  mixLine,
  runLabel,
} from '../scripts/post/weights.js';

const entry = (league: string, start: string, end: string): ScheduleEntry => ({
  league,
  cup: league,
  cp: 1500,
  title: league,
  start,
  end,
  season: 'Test',
});

describe('runLabel', () => {
  const schedule = [
    entry('colormega', '2026-09-22T20:00:00.000Z', '2026-09-29T20:00:00.000Z'),
    entry('colormega', '2026-09-29T20:00:00.000Z', '2026-10-06T20:00:00.000Z'),
    entry('mega-great', '2026-10-06T20:00:00.000Z', '2026-10-13T20:00:00.000Z'),
  ];

  it('reads LIVE with the merged run dates while the cup is on', () => {
    expect(runLabel(schedule, 'colormega', new Date('2026-09-30T12:00:00Z'))).toBe(
      'LIVE SEP 22 - OCT 6',
    );
  });

  it('reads STARTS before the run begins', () => {
    expect(runLabel(schedule, 'mega-great', new Date('2026-09-30T12:00:00Z'))).toBe(
      'STARTS OCT 6 - OCT 13',
    );
  });

  it('reads UPDATED for a league with no run, or only past runs', () => {
    expect(runLabel(schedule, 'great', new Date('2026-09-30T12:00:00Z'))).toBe('UPDATED SEP 30');
    expect(runLabel(schedule, 'colormega', new Date('2026-11-01T12:00:00Z'))).toBe('UPDATED NOV 1');
  });
});

describe('mixLine', () => {
  const day = new Date('2026-09-30T12:00:00Z');
  it('names what the weights were made of', () => {
    expect(formatDay(day)).toBe('Sep 30, 2026');
    expect(mixLine({ kind: 'prior' }, day)).toBe('PvPoke meta only - Sep 30, 2026');
    expect(mixLine({ kind: 'blend', battles: 0, events: 0 }, day)).toBe(
      'PvPoke meta only - Sep 30, 2026',
    );
    expect(mixLine({ kind: 'blend', battles: 1240, events: 0 }, day)).toBe(
      'PvPoke meta + 1,240 shared battles - Sep 30, 2026',
    );
    expect(mixLine({ kind: 'blend', battles: 1, events: 2 }, day)).toBe(
      'PvPoke meta + 1 shared battle + 2 events - Sep 30, 2026',
    );
  });
});

describe('fetching', () => {
  const failing: Fetcher = async () => ({ ok: false, status: 400, json: async () => ({}) });

  it('names the URL and status when a data file fails', async () => {
    await expect(getJson('https://pick3.gg/data/x.json', failing)).rejects.toThrow(/x\.json.*400/);
  });

  it('points at --prior when the meta read fails', async () => {
    const w = { since: 'a', until: 'b', label: 'This meta', key: 'meta' as const, epoch: null };
    await expect(fetchSummary('mega-great', w, failing)).rejects.toThrow(/--prior/);
  });
});

describe('blendedWeights', () => {
  it('gives every meta group species a weight when nothing is measured', () => {
    const w = blendedWeights(
      { battles: 0, devices: 0, species: [], tournament: null },
      {
        group: ['a', 'b'],
        rankings: { overall: [{ speciesId: 'a' }, { speciesId: 'b' }] } as never,
        banned: [],
      },
    );
    expect([...w.keys()].sort()).toEqual(['a', 'b']);
    expect((w.get('a') ?? 0) + (w.get('b') ?? 0)).toBeCloseTo(1);
  });
});

const okJson = (body: unknown): ReturnType<Fetcher> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

describe('getJson parse failures', () => {
  it('names the URL when the body is not JSON', async () => {
    const bad: Fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    await expect(getJson('https://pick3.gg/data/y.json', bad)).rejects.toThrow(
      /Could not parse .*y\.json.*Unexpected token/,
    );
  });
});

describe('loadCupData', () => {
  const roles = ['overall', 'leads', 'switches', 'closers', 'chargers'];
  const routes: Record<string, unknown> = {
    'leagues.json': [{ id: 'cupx' }, { id: 'other' }],
    'data-manifest.json': { pvpokeCommit: 'abc', pvpokeDate: '2026-01-01' },
    'pokemon.json': [],
    'moves.json': [],
    'gamemaster.json': {},
    'schedule.json': [],
    'seasons.json': [{ start: '2026-01-01' }],
    'epochs.json': [],
    'matrix/cupx.json': { fake: 'matrix' },
    'meta/cupx.json': [{ speciesId: 'zed' }, { speciesId: 'alpha' }, { speciesId: 'mid' }],
    'legal/cupx.json': { banned: ['mid'] },
    ...Object.fromEntries(roles.map((r) => [`rankings/cupx/${r}.json`, [{ speciesId: r }]])),
  };
  const requested: string[] = [];
  const fake: Fetcher = (url) => {
    requested.push(url);
    const key = url.startsWith(`${DATA_BASE}/`) ? url.slice(DATA_BASE.length + 1) : '';
    return key in routes
      ? okJson(routes[key])
      : Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  };

  it('requests exactly the expected files and shapes the result', async () => {
    requested.length = 0;
    const data = await loadCupData('cupx', fake);
    expect([...requested].sort()).toEqual(
      Object.keys(routes)
        .map((k) => `${DATA_BASE}/${k}`)
        .sort(),
    );
    expect(data.group).toEqual(['zed', 'alpha', 'mid']);
    expect(data.banned).toEqual(['mid']);
    expect(data.league.id).toBe('cupx');
    expect(data.rankings.chargers[0]?.speciesId).toBe('chargers');
    expect(data.manifest.pvpokeCommit).toBe('abc');
  });

  it('names an unknown league and lists the known ones', async () => {
    await expect(loadCupData('nope', fake)).rejects.toThrow(/"nope".*cupx, other/);
  });
});

describe('fetchSummary success', () => {
  it('reads the meta endpoint with league, since and until', async () => {
    const urls: string[] = [];
    const body = { battles: 3, devices: 1, species: [], tournament: null };
    const fake: Fetcher = (url) => {
      urls.push(url);
      return okJson(body);
    };
    const w = {
      since: '2026-01-01T00:00:00.000Z',
      until: '2026-02-01T00:00:00.000Z',
      label: 'x',
      key: 'meta' as const,
      epoch: null,
    };
    const got = await fetchSummary('cupx', w, fake);
    const u = new URL(urls[0]!);
    expect(u.origin + u.pathname).toBe(`${API_BASE}/api/v1/meta`);
    expect(u.searchParams.get('league')).toBe('cupx');
    expect(u.searchParams.get('since')).toBe(w.since);
    expect(u.searchParams.get('until')).toBe(w.until);
    expect(got).toEqual(body);
  });
});

describe('blendedWeights with measured data', () => {
  const data = {
    group: ['a', 'b', 'c'],
    rankings: { overall: [{ speciesId: 'a' }, { speciesId: 'b' }, { speciesId: 'c' }] } as never,
    banned: ['c'],
  };
  const empty = { battles: 0, devices: 0, species: [], tournament: null };
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((x, y) => x + y, 0);

  it('shifts weight toward what was seen and still sums to one', () => {
    const prior = blendedWeights(empty, data);
    const seen = blendedWeights(
      {
        battles: 600,
        devices: 20,
        species: [{ speciesId: 'b', sightings: 500 }],
        tournament: null,
      },
      data,
    );
    expect(sum(seen)).toBeCloseTo(1);
    expect(seen.get('b') ?? 0).toBeGreaterThan(prior.get('b') ?? 0);
  });

  it('keeps a banned species at its prior weight when only tournaments picked it', () => {
    const prior = blendedWeights(empty, data);
    const t = blendedWeights(
      {
        ...empty,
        tournament: { events: 4, battles: 400, species: [{ speciesId: 'c', picks: 300 }] },
      },
      data,
    );
    expect(t.get('c')).toBeCloseTo(prior.get('c') ?? -1);
  });
});
