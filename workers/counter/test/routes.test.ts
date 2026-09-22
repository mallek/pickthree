import { describe, expect, it, vi } from 'vitest';
import { isWorkerPath } from '../src/meta.js';
import { sqliteShim } from './sqliteShim.js';
import fixture from '../../../fixtures/tournament-sample.json' with { type: 'json' };

// `src/index.ts` imports the Durable Object base class from the workerd runtime, which does not
// exist under plain node vitest (there is no @cloudflare/vitest-pool-workers project here). A
// fake with just enough shape to satisfy `extends DurableObject<Env>` lets the module load, so
// the route dispatch in `fetch` (path matching, param validation, cache headers) gets exercised
// for real, against fake storage rather than a real one, which is exactly how the rest of this
// worker is tested: pure functions in, no Durable Object needed.
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

const { default: worker, MetaStore } = await import('../src/index.js');
type Env = Parameters<typeof worker.fetch>[1];

// One in-memory SQLite per test env. The ladder table's own DDL runs through it too, which is
// what the MetaStore constructor does anyway; these tests only exercise the tournament side.
function fakeCtx(): { ctx: unknown; close: () => void } {
  const { sql, close } = sqliteShim();
  return { ctx: { storage: { sql } }, close };
}

function testEnv(over: { INGEST_TOKEN?: string } = {}): { env: Env; close: () => void } {
  const { ctx, close } = fakeCtx();
  const metaStore = new MetaStore(ctx as never, {} as never);
  const env = {
    COUNTER: { getByName: () => ({}) } as unknown as Env['COUNTER'],
    META: { getByName: () => metaStore } as unknown as Env['META'],
    ASSETS: { fetch: () => Promise.resolve(new Response('site')) } as unknown as Env['ASSETS'],
    ALLOWED_ORIGINS: 'http://localhost:5173',
    ...over,
  } as Env;
  return { env, close };
}

async function get(path: string): Promise<Response> {
  const { env, close } = testEnv();
  try {
    return await worker.fetch(new Request(`http://localhost${path}`), env);
  } finally {
    close();
  }
}

const TOKEN = 'test-ingest-token';

function send(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
  token: string | null = TOKEN,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return worker.fetch(new Request(`http://localhost${path}`, init), env);
}

describe('/api/v1/teams', () => {
  it('serves the team board with the read cache header', async () => {
    const res = await get(
      '/api/v1/teams?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z',
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=600');
    const body = (await res.json()) as { league: string; teams: unknown[]; cores: unknown[] };
    expect(body.league).toBe('great');
    expect(Array.isArray(body.teams)).toBe(true);
    expect(Array.isArray(body.cores)).toBe(true);
  });

  it('rejects a bad window on the team board the same way as the summary', async () => {
    const res = await get('/api/v1/teams?league=great&since=nope&until=nope');
    expect(res.status).toBe(400);
  });
});

describe('the source parameter', () => {
  it('defaults to all and echoes what it was given', async () => {
    const plain = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z');
    expect(((await plain.json()) as { source: string }).source).toBe('all');
    const ladder = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z&source=ladder');
    expect(((await ladder.json()) as { source: string }).source).toBe('ladder');
  });

  it('serves an old band= link as source=all rather than refusing it', async () => {
    const res = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z&band=legend');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; band?: string };
    expect(body.source).toBe('all');
    expect(body.band).toBeUndefined();
  });

  it('falls back to all for a source it does not know', async () => {
    const res = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z&source=rumour');
    expect(((await res.json()) as { source: string }).source).toBe('all');
  });
});

describe('isWorkerPath', () => {
  it('is true for every known worker path', () => {
    for (const p of ['/hit', '/count', '/error', '/errors', '/battles', '/meta']) {
      expect(isWorkerPath(p)).toBe(true);
    }
  });

  it('is true for any /api/ path, whatever the version', () => {
    expect(isWorkerPath('/api/v1/meta')).toBe(true);
    expect(isWorkerPath('/api/v2/anything')).toBe(true);
  });

  it('is false for site paths', () => {
    for (const p of [
      '/',
      '/great',
      '/great/p/azumarill',
      '/about',
      '/assets/index-abc123.js',
      '/favicon.svg',
    ]) {
      expect(isWorkerPath(p)).toBe(false);
    }
  });
});

describe('tournament ingest', () => {
  it('refuses every write without the bearer token', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      for (const [method, path, body] of [
        ['PUT', '/api/v1/events/e-one', fixture.event],
        ['POST', '/api/v1/events/e-one/battles', fixture.battles],
        ['POST', '/api/v1/events/e-one/roster', fixture.roster],
        ['DELETE', '/api/v1/events/e-one', undefined],
      ] as const) {
        expect((await send(env, method, path, body, null)).status).toBe(401);
        expect((await send(env, method, path, body, 'wrong')).status).toBe(401);
      }
    } finally {
      close();
    }
  });

  it('refuses every write when no token is configured at all', async () => {
    const { env, close } = testEnv();
    try {
      expect((await send(env, 'PUT', '/api/v1/events/e-one', fixture.event)).status).toBe(401);
    } finally {
      close();
    }
  });

  it('takes an event, its battles and its roster, and reads them back', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      const id = fixture.id;
      expect((await send(env, 'PUT', `/api/v1/events/${id}`, fixture.event)).status).toBe(200);

      const battles = await send(env, 'POST', `/api/v1/events/${id}/battles`, fixture.battles);
      expect(battles.status).toBe(200);
      expect(await battles.json()).toEqual({
        stored: fixture.battles.battles.length,
        replaced: 0,
        rejected: 0,
      });

      const again = await send(env, 'POST', `/api/v1/events/${id}/battles`, fixture.battles);
      expect(await again.json()).toEqual({
        stored: 0,
        replaced: fixture.battles.battles.length,
        rejected: 0,
      });

      const roster = await send(env, 'POST', `/api/v1/events/${id}/roster`, fixture.roster);
      expect(await roster.json()).toEqual({
        stored: fixture.roster.entries.length,
        replaced: 0,
        rejected: 0,
      });

      const list = await send(
        env,
        'GET',
        '/api/v1/events?league=great&since=2026-09-01T00:00:00Z&until=2026-10-01T00:00:00Z',
        undefined,
        null,
      );
      expect(list.status).toBe(200);
      expect(list.headers.get('Cache-Control')).toBe('public, max-age=600');
      const listed = (await list.json()) as { events: { id: string; blended: boolean }[] };
      expect(listed.events.map((e) => e.id)).toEqual([id]);
      expect(listed.events[0]!.blended).toBe(true);

      const detail = await send(env, 'GET', `/api/v1/events/${id}`, undefined, null);
      expect(detail.status).toBe(200);
      const body = (await detail.json()) as { event: { id: string }; matches: unknown[] };
      expect(body.event.id).toBe(id);
      expect(body.matches.length).toBeGreaterThan(0);
    } finally {
      close();
    }
  });

  it('404s battles and roster for an event nobody declared', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      expect(
        (await send(env, 'POST', '/api/v1/events/never-declared/battles', fixture.battles)).status,
      ).toBe(404);
      expect(
        (await send(env, 'POST', '/api/v1/events/never-declared/roster', fixture.roster)).status,
      ).toBe(404);
      expect((await send(env, 'GET', '/api/v1/events/never-declared', undefined, null)).status).toBe(
        404,
      );
    } finally {
      close();
    }
  });

  it('rejects a malformed batch whole, naming the index and reason, and stores nothing', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      const id = fixture.id;
      await send(env, 'PUT', `/api/v1/events/${id}`, fixture.event);
      const broken = {
        ...fixture.battles,
        battles: [fixture.battles.battles[0], { ...fixture.battles.battles[1], game: 0 }],
      };
      const res = await send(env, 'POST', `/api/v1/events/${id}/battles`, broken);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        stored: 0,
        replaced: 0,
        rejected: 2,
        index: 1,
        reason: 'bad day, game or bracketDepth',
      });
      const detail = await send(env, 'GET', `/api/v1/events/${id}`, undefined, null);
      expect(((await detail.json()) as { matches: unknown[] }).matches).toEqual([]);
    } finally {
      close();
    }
  });

  it('deletes the event, its battles and its roster in one go', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      const id = fixture.id;
      await send(env, 'PUT', `/api/v1/events/${id}`, fixture.event);
      await send(env, 'POST', `/api/v1/events/${id}/battles`, fixture.battles);
      await send(env, 'POST', `/api/v1/events/${id}/roster`, fixture.roster);
      const res = await send(env, 'DELETE', `/api/v1/events/${id}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        deleted: {
          events: 1,
          battles: fixture.battles.battles.length,
          roster: fixture.roster.entries.length,
        },
      });
      expect((await send(env, 'GET', `/api/v1/events/${id}`, undefined, null)).status).toBe(404);
    } finally {
      close();
    }
  });

  it('refuses an event id that is not a slug', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      expect((await send(env, 'PUT', '/api/v1/events/Not A Slug', fixture.event)).status).toBe(400);
    } finally {
      close();
    }
  });
});

describe('the read routes see the ingested event', () => {
  it('carries a tournament block under all and under tournament, and null under ladder', async () => {
    const { env, close } = testEnv({ INGEST_TOKEN: TOKEN });
    try {
      const id = fixture.id;
      await send(env, 'PUT', `/api/v1/events/${id}`, fixture.event);
      await send(env, 'POST', `/api/v1/events/${id}/battles`, fixture.battles);
      const window = 'league=great&since=2026-09-01T00:00:00Z&until=2026-10-01T00:00:00Z';
      const read = async (source: string) =>
        (await (
          await send(env, 'GET', `/api/v1/meta?${window}&source=${source}`, undefined, null)
        ).json()) as { battles: number; devices: number; tournament: { battles: number } | null };

      const all = await read('all');
      expect(all.battles).toBe(0);
      expect(all.tournament!.battles).toBe(fixture.battles.battles.length);

      const tournament = await read('tournament');
      expect(tournament.battles).toBe(fixture.battles.battles.length);
      expect(tournament.devices).toBe(0);

      expect((await read('ladder')).tournament).toBeNull();
    } finally {
      close();
    }
  });
});
