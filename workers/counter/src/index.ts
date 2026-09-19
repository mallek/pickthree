/**
 * PickThree hit counter, anonymous error log, and the community meta store. Geocities style.
 *
 *   POST /hit       increments and returns { count }
 *   GET  /count     returns { count }
 *   POST /error     records { build, stage, message, ua } (rolling 200, no identifiers)
 *   GET  /errors    returns the log; needs Authorization: Bearer <ERRORS_READ_TOKEN>
 *   POST /battles   stores anonymous battle records { device, client, battles } (max 200)
 *   DELETE /battles removes everything one device sent { device }
 *   GET  /meta      per-league summary: ?league=great&days=90
 *   GET  /api/v1/meta               per-league rollup: ?league=great&since=...&until=...&band=
 *   GET  /api/v1/species/<id>       per-species detail over the same window and band
 *
 * Nothing stored identifies a player: no IPs, no collection data, no names. The counter and
 * the error log live in one Durable Object; the battle records in another with SQLite. Anything
 * that is not one of these routes falls through to the ASSETS binding: the meta.pick3.gg site.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  aggregate,
  DEFAULT_SOURCE,
  parseBatch,
  type Band,
  type BattleRow,
  type BattleSource,
  type MetaSummary,
  type SharedBatch,
  type SharedMoves,
} from './battles.js';
import {
  isWorkerPath,
  readParams,
  speciesDetail,
  summarize,
  type MetaSummaryV1,
  type SpeciesDetailV1,
} from './meta.js';
import { parseReport, type ErrorReport } from './report.js';

export interface Env {
  COUNTER: DurableObjectNamespace<Counter>;
  META: DurableObjectNamespace<MetaStore>;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS: string;
  ERRORS_READ_TOKEN?: string;
}

const MAX_ERRORS = 200;
/** The most rows one summary reads; well past what a league sees in a season for now. */
const SUMMARY_ROWS = 100_000;
/** How long the edge may hold a read. The site rounds its window to match. */
const READ_CACHE = 'public, max-age=600';
const SPECIES = /^[a-z0-9_]+$/;

export class Counter extends DurableObject<Env> {
  async get(): Promise<number> {
    return (await this.ctx.storage.get<number>('count')) ?? 0;
  }

  async increment(): Promise<number> {
    const next = (await this.get()) + 1;
    await this.ctx.storage.put('count', next);
    return next;
  }

  async errors(): Promise<ErrorReport[]> {
    return (await this.ctx.storage.get<ErrorReport[]>('errors')) ?? [];
  }

  async recordError(r: ErrorReport): Promise<number> {
    const next = [r, ...(await this.errors())].slice(0, MAX_ERRORS);
    await this.ctx.storage.put('errors', next);
    return next.length;
  }
}

/** Battle records from every phone that shares, one SQLite table, keyed by device and id. */
export class MetaStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS battles (
        key TEXT PRIMARY KEY,
        device TEXT NOT NULL,
        id TEXT NOT NULL,
        league TEXT NOT NULL,
        season INTEGER,
        at TEXT NOT NULL,
        team TEXT NOT NULL,
        opponents TEXT NOT NULL,
        result TEXT,
        tanked INTEGER NOT NULL,
        band TEXT,
        client TEXT NOT NULL,
        received TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS battles_league_at ON battles (league, at);
      CREATE INDEX IF NOT EXISTS battles_device ON battles (device);
    `);
    // Added after the first deploy; SQLite has no ADD COLUMN IF NOT EXISTS.
    const cols = ctx.storage.sql.exec('PRAGMA table_info(battles)').toArray();
    if (!cols.some((c) => c['name'] === 'moves')) {
      ctx.storage.sql.exec('ALTER TABLE battles ADD COLUMN moves TEXT');
    }
    if (!cols.some((c) => c['name'] === 'source')) {
      ctx.storage.sql.exec("ALTER TABLE battles ADD COLUMN source TEXT NOT NULL DEFAULT 'ladder'");
    }
  }

  ingest(batch: SharedBatch): { stored: number; skipped: number } {
    const received = new Date().toISOString();
    let stored = 0;
    for (const b of batch.battles) {
      const cursor = this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO battles
           (key, device, id, league, season, at, team, moves, opponents, result, tanked, band, source, client, received)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${batch.device}:${b.id}`,
        batch.device,
        b.id,
        b.league,
        b.season,
        b.at,
        JSON.stringify(b.team),
        b.moves ? JSON.stringify(b.moves) : null,
        JSON.stringify(b.opponents),
        b.result,
        b.tanked ? 1 : 0,
        b.band,
        DEFAULT_SOURCE,
        batch.client,
        received,
      );
      stored += cursor.rowsWritten > 0 ? 1 : 0;
    }
    return { stored, skipped: batch.battles.length - stored };
  }

  forget(device: string): number {
    const cursor = this.ctx.storage.sql.exec('DELETE FROM battles WHERE device = ?', device);
    return cursor.rowsWritten;
  }

  summary(league: string, since: string): MetaSummary {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT device, league, season, at, team, moves, opponents, result, tanked, band, source
           FROM battles WHERE league = ? AND at >= ? ORDER BY at DESC LIMIT ?`,
        league,
        since,
        SUMMARY_ROWS,
      )
      .toArray();
    const parsed: BattleRow[] = rows.map((r) => ({
      device: String(r['device']),
      league: String(r['league']),
      season: typeof r['season'] === 'number' ? r['season'] : null,
      at: String(r['at']),
      team: JSON.parse(String(r['team'])) as string[],
      moves:
        typeof r['moves'] === 'string' ? (JSON.parse(r['moves']) as (SharedMoves | null)[]) : null,
      opponents: JSON.parse(String(r['opponents'])) as string[],
      result: (r['result'] as 'win' | 'loss' | null) ?? null,
      tanked: r['tanked'] === 1,
      band: (r['band'] as Band | null) ?? null,
      source: (r['source'] as BattleSource | null) ?? DEFAULT_SOURCE,
    }));
    return aggregate(league, parsed);
  }

  /** Every row for a league in a half-open window, newest first, capped. */
  private read(league: string, since: string, until: string): BattleRow[] {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT device, league, season, at, team, moves, opponents, result, tanked, band, source
           FROM battles WHERE league = ? AND at >= ? AND at < ? ORDER BY at DESC LIMIT ?`,
        league,
        since,
        until,
        SUMMARY_ROWS,
      )
      .toArray();
    return rows.map((r) => ({
      device: String(r['device']),
      league: String(r['league']),
      season: typeof r['season'] === 'number' ? r['season'] : null,
      at: String(r['at']),
      team: JSON.parse(String(r['team'])) as string[],
      moves:
        typeof r['moves'] === 'string' ? (JSON.parse(r['moves']) as (SharedMoves | null)[]) : null,
      opponents: JSON.parse(String(r['opponents'])) as string[],
      result: (r['result'] as 'win' | 'loss' | null) ?? null,
      tanked: r['tanked'] === 1,
      band: (r['band'] as Band | null) ?? null,
      source: (r['source'] as BattleSource | null) ?? DEFAULT_SOURCE,
    }));
  }

  summaryV1(p: { league: string; since: string; until: string; band: string }): MetaSummaryV1 {
    const span = Date.parse(p.until) - Date.parse(p.since);
    const prevSince = new Date(Date.parse(p.since) - span).toISOString();
    return summarize({
      ...p,
      rows: this.read(p.league, p.since, p.until),
      previousRows: this.read(p.league, prevSince, p.since),
      now: new Date(),
    });
  }

  speciesV1(
    p: { league: string; since: string; until: string; band: string },
    speciesId: string,
  ): SpeciesDetailV1 {
    return speciesDetail({
      ...p,
      speciesId,
      rows: this.read(p.league, p.since, p.until),
      now: new Date(),
    });
  }
}

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = origin !== null && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
}

async function readJson(
  request: Request,
  limit: number,
): Promise<{ body: unknown } | { status: number; error: string }> {
  const text = await request.text();
  if (text.length > limit) {
    return { status: 413, error: 'too large' };
  }
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { status: 400, error: 'bad json' };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const headers = cors(request.headers.get('Origin'), allowed);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    const stub = env.COUNTER.getByName('pick3');
    const originOk = (): boolean => {
      const origin = request.headers.get('Origin');
      return origin !== null && allowed.includes(origin);
    };
    if (request.method === 'GET' && url.pathname === '/count') {
      return Response.json({ count: await stub.get() }, { headers });
    }
    if (request.method === 'POST' && url.pathname === '/hit') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      return Response.json({ count: await stub.increment() }, { headers });
    }
    if (request.method === 'POST' && url.pathname === '/error') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      const read = await readJson(request, 2048);
      if ('error' in read) {
        return Response.json({ error: read.error }, { status: read.status, headers });
      }
      const report = parseReport(read.body);
      if (!report) {
        return Response.json({ error: 'bad report' }, { status: 400, headers });
      }
      return Response.json({ stored: await stub.recordError(report) }, { headers });
    }
    if (request.method === 'GET' && url.pathname === '/errors') {
      const auth = request.headers.get('Authorization') ?? '';
      if (!env.ERRORS_READ_TOKEN || auth !== `Bearer ${env.ERRORS_READ_TOKEN}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers });
      }
      return Response.json({ errors: await stub.errors() }, { headers });
    }
    const meta = env.META.getByName('pick3');
    if (request.method === 'POST' && url.pathname === '/battles') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      // 200 records at about 300 bytes each is well under this.
      const read = await readJson(request, 256 * 1024);
      if ('error' in read) {
        return Response.json({ error: read.error }, { status: read.status, headers });
      }
      const batch = parseBatch(read.body);
      if (!batch) {
        return Response.json({ error: 'bad batch' }, { status: 400, headers });
      }
      return Response.json(await meta.ingest(batch), { headers });
    }
    if (request.method === 'DELETE' && url.pathname === '/battles') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      const read = await readJson(request, 1024);
      if ('error' in read) {
        return Response.json({ error: read.error }, { status: read.status, headers });
      }
      const device =
        typeof read.body === 'object' && read.body !== null
          ? (read.body as { device?: unknown }).device
          : undefined;
      if (typeof device !== 'string' || !/^[0-9a-f-]{36}$/.test(device)) {
        return Response.json({ error: 'bad device' }, { status: 400, headers });
      }
      return Response.json({ deleted: await meta.forget(device) }, { headers });
    }
    if (request.method === 'GET' && url.pathname === '/meta') {
      const league = url.searchParams.get('league') ?? 'great';
      if (!/^[a-z0-9_]+$/.test(league)) {
        return Response.json({ error: 'bad league' }, { status: 400, headers });
      }
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days') ?? 90) || 90));
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      return Response.json({ since, days, ...(await meta.summary(league, since)) }, { headers });
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/')) {
      const p = readParams(url);
      if ('error' in p) {
        return Response.json({ error: p.error }, { status: 400, headers });
      }
      const read = { ...headers, 'Cache-Control': READ_CACHE };
      if (url.pathname === '/api/v1/meta') {
        return Response.json(await meta.summaryV1(p), { headers: read });
      }
      const species = url.pathname.slice('/api/v1/species/'.length);
      if (url.pathname.startsWith('/api/v1/species/') && SPECIES.test(species)) {
        return Response.json(await meta.speciesV1(p, species), { headers: read });
      }
      return Response.json({ error: 'not found' }, { status: 404, headers });
    }
    if (isWorkerPath(url.pathname)) {
      return Response.json({ error: 'not found' }, { status: 404, headers });
    }
    // Anything that is not an endpoint is the meta.pick3.gg site.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
