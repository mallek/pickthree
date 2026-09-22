import { describe, expect, it, vi } from 'vitest';
import { isWorkerPath } from '../src/meta.js';

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

/** A storage.sql.exec that answers every call with an empty result: no battles stored, which is
 *  all these route tests need. The real SQL text is never inspected. */
function fakeCtx(): unknown {
  return {
    storage: {
      sql: {
        exec: () => ({ toArray: () => [], rowsWritten: 0 }),
      },
    },
  };
}

function testEnv(): Env {
  const metaStore = new MetaStore(fakeCtx() as never, {} as never);
  return {
    COUNTER: { getByName: () => ({}) } as unknown as Env['COUNTER'],
    META: { getByName: () => metaStore } as unknown as Env['META'],
    ASSETS: { fetch: () => Promise.resolve(new Response('site')) } as unknown as Env['ASSETS'],
    ALLOWED_ORIGINS: 'http://localhost:5173',
  } as Env;
}

function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`http://localhost${path}`), testEnv());
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

  it('keeps honouring band= while the live site still sends it', async () => {
    const res = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z&band=legend');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; band: string };
    expect(body.band).toBe('legend');
    expect(body.source).toBe('all');
  });

  it('ignores band= once a source other than all is named', async () => {
    const res = await get('/api/v1/meta?league=great&since=2026-09-01T00:00:00Z&until=2026-09-30T00:00:00Z&band=legend&source=tournament');
    const body = (await res.json()) as { source: string; band: string };
    expect(body.source).toBe('tournament');
    expect(body.band).toBe('all');
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
